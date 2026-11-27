"""Testes do catálogo do Flask contra um "Supabase falso" (PostgREST em memória).

Rodar na pasta do projeto:   python -m unittest discover -s tests -v
Não precisa de internet nem de chave real.
"""
import importlib
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


class FakePostgREST:
    """Servidor HTTP mínimo que imita GET/POST/PATCH/DELETE do PostgREST com filtro col=eq.valor."""

    def __init__(self, tables):
        self.tables = tables
        self.requests = []
        self.deny_writes = False
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _run(self, method):
                u = urlparse(self.path)
                table = unquote(u.path.split("/rest/v1/")[1])
                q = {k: v[0] for k, v in parse_qs(u.query).items()}
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n)) if n else None
                outer.requests.append((method, table, dict(q), body, self.headers.get("apikey")))
                if table not in outer.tables:
                    return self._send(404, {"message": "not found"})
                if method != "GET" and outer.deny_writes:
                    return self._send(401, {"message": "RLS"})
                rows = outer.tables[table]
                flt = {k: v[3:] for k, v in q.items() if k not in ("select", "limit") and v.startswith("eq.")}
                match = lambda r: all(str(r.get(k)) == v for k, v in flt.items())
                if method == "GET":
                    return self._send(200, [r for r in rows if match(r)])
                if method == "POST":
                    row = dict(body)
                    if "id" not in row and table == "products":
                        row["id"] = max([r["id"] for r in rows] or [0]) + 1
                    rows.append(row)
                    return self._send(201, [row])
                if method == "PATCH":
                    hit = [r for r in rows if match(r)]
                    for r in hit:
                        r.update(body)
                    return self._send(200, hit)
                if method == "DELETE":
                    outer.tables[table] = [r for r in rows if not match(r)]
                    return self._send(204, None)

            def _send(self, code, payload):
                raw = b"" if payload is None else json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            do_GET = lambda s: s._run("GET")
            do_POST = lambda s: s._run("POST")
            do_PATCH = lambda s: s._run("PATCH")
            do_DELETE = lambda s: s._run("DELETE")

        self.server = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def load_app(env):
    """Importa o app.py do zero com as variáveis dadas (sem ler .env de verdade)."""
    for k in ["PRODUCTS_SOURCE", "SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_TABLE",
              "SUPABASE_STOCK_TABLE", "SUPABASE_CACHE_SECONDS", "PRODUCTS_FILE", "ADMIN_EMAIL", "ADMIN_PASSWORD",
              "SECRET_KEY", "ADMIN_DATA_FILE", "SUPABASE_UNTRACKED_STOCK"]:
        os.environ.pop(k, None)
    import tempfile
    admin_defaults = {"ADMIN_EMAIL": "admin@teste.com", "ADMIN_PASSWORD": "senha-teste", "SECRET_KEY": "chave-de-teste",
                      "ADMIN_DATA_FILE": str(Path(tempfile.mkdtemp()) / "admin_data.json")}
    os.environ.update({**admin_defaults, **env})
    import dotenv
    original = dotenv.load_dotenv
    dotenv.load_dotenv = lambda *a, **k: False  # os testes definem o ambiente sozinhos
    try:
        for m in ("app", "catalog"):
            sys.modules.pop(m, None)
        return importlib.import_module("app")
    finally:
        dotenv.load_dotenv = original


CUSTOMER = {"name": "Maria Teste", "email": "maria@teste.com", "document": "123.456.789-09"}


def admin_client(mod):
    """Cliente de teste já logado no painel."""
    c = mod.app.test_client()
    r = c.post("/api/admin/login", json={"email": "admin@teste.com", "password": "senha-teste"})
    assert r.status_code == 200, r.get_json()
    return c


def english_tables():
    return {
        "products": [
            {"id": 1, "name": "Tinta A", "brand": "Suvinil", "category": "Parede", "finish": "Fosco", "price": 100,
             "description": "d", "image": "", "icon": "house", "surface": ["Parede"], "environments": ["Sala"],
             "purposes": [], "tags": ["parede"]},
            {"id": 2, "name": "Tinta B", "brand": "Quartzolit", "category": "Piso", "finish": "Fosco", "price": 50,
             "surface": [], "environments": [], "purposes": [], "tags": []},
            {"id": 3, "name": "Tinta C (sem estoque)", "brand": "X", "category": "Parede", "price": 10},
        ],
        "estoque": [{"id": 1, "produto_id": 1, "quantidade": 12}, {"id": 2, "produto_id": 2, "quantidade": 0}],
    }


class SupabaseFlaskTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakePostgREST(english_tables())
        self.addCleanup(self.fake.close)
        self.mod = load_app({"PRODUCTS_SOURCE": "supabase", "SUPABASE_URL": self.fake.url + "/rest/v1/",
                             "SUPABASE_KEY": "anon-key", "SUPABASE_CACHE_SECONDS": "0", "SUPABASE_UNTRACKED_STOCK": "0"})
        self.client = admin_client(self.mod)

    def test_usa_supabase_e_nao_o_json(self):
        self.assertEqual(self.mod.catalog.source, "supabase")
        r = self.client.get("/api/products")
        self.assertEqual([p["name"] for p in r.get_json()], ["Tinta A"], "só com estoque; vem do banco")
        self.assertEqual(r.get_json()[0]["stock"], 12, "estoque vem da tabela estoque")
        # URL com /rest/v1/ no final é aceita e a chave é enviada
        self.assertTrue(all(req[4] == "anon-key" for req in self.fake.requests))

    def test_nao_vaza_colunas_extras(self):
        self.fake.tables["products"][0]["preco_custo"] = 40
        self.assertNotIn("preco_custo", self.client.get("/api/products").get_json()[0])
        self.assertNotIn("details", self.client.get("/api/products").get_json()[0])

    def test_produto_por_id_e_404(self):
        self.assertEqual(self.client.get("/api/products/1").get_json()["name"], "Tinta A")
        self.assertEqual(self.client.get("/api/products/999").status_code, 404)

    def test_admin_lista_inclui_zerados_mas_nao_massa_corrida(self):
        names = [p["name"] for p in self.client.get("/api/admin/products").get_json()]
        self.assertEqual(names, ["Tinta A", "Tinta B", "Tinta C (sem estoque)"])
        self.assertNotIn("Massa Corrida PVA", names)

    def test_admin_cria_produto_no_banco_e_loja_enxerga(self):
        r = self.client.post("/api/admin/products", json={
            "name": "Selador Novo", "brand": "Coral", "category": "Tratamento", "price": "89.90", "stock": 7,
            "description": "novo", "environments": ["Quarto"]})
        self.assertEqual(r.status_code, 201, r.get_json())
        created = r.get_json()
        self.assertEqual((created["stock"], created["price"]), (7, 89.9))
        self.assertIn(created["id"], [p["id"] for p in self.fake.tables["products"]])
        self.assertIn({"produto_id": created["id"], "quantidade": 7}, self.fake.tables["estoque"])
        self.assertIn("Selador Novo", [p["name"] for p in self.client.get("/api/products").get_json()])
        # estoque NÃO foi gravado na linha do produto (fica só na tabela estoque)
        self.assertNotIn("stock", next(p for p in self.fake.tables["products"] if p["id"] == created["id"]))

    def test_admin_estoque_vai_para_tabela_estoque_e_a_ia_ve_o_mesmo(self):
        r = self.client.post("/api/admin/products/1/stock", json={"delta": -5})
        self.assertEqual(r.get_json()["stock"], 7)
        self.assertEqual(next(e for e in self.fake.tables["estoque"] if e["produto_id"] == 1)["quantidade"], 7)
        # produto sem linha de estoque ganha uma
        self.client.put("/api/admin/products/3", json={"stock": 4})
        self.assertEqual(next(e for e in self.fake.tables["estoque"] if e["produto_id"] == 3)["quantidade"], 4)
        # estoque nunca fica negativo
        self.assertEqual(self.client.post("/api/admin/products/1/stock", json={"delta": -99}).get_json()["stock"], 0)

    def test_admin_edita_preco_e_apaga(self):
        self.assertEqual(self.client.put("/api/admin/products/2", json={"price": 55.5}).get_json()["price"], 55.5)
        self.assertEqual(self.fake.tables["products"][1]["price"], 55.5)
        self.assertEqual(self.client.delete("/api/admin/products/2").status_code, 200)
        self.assertNotIn(2, [p["id"] for p in self.fake.tables["products"]])
        self.assertFalse([e for e in self.fake.tables["estoque"] if e["produto_id"] == 2])
        self.assertEqual(self.client.delete("/api/admin/products/2").status_code, 404)

    def test_entrada_invalida_vira_400(self):
        self.assertEqual(self.client.put("/api/admin/products/1", json={"price": "abc"}).status_code, 400)
        self.assertEqual(self.client.put("/api/admin/products/1", json={"price": -3}).status_code, 400)
        self.assertEqual(self.client.post("/api/admin/products", json={"name": "x"}).status_code, 400)

    def test_pagamento_confere_estoque_no_banco(self):
        ok = self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": 2}], "customer": CUSTOMER})
        self.assertTrue(ok.get_json()["success"])
        self.assertEqual(ok.get_json()["order"]["total"], 200)
        self.assertEqual(self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": 13}], "customer": CUSTOMER}).status_code, 400)
        self.assertEqual(self.client.post("/api/payment", json={"items": [{"id": 77, "quantity": 1}], "customer": CUSTOMER}).status_code, 400)
        self.assertEqual(self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": "x"}], "customer": CUSTOMER}).status_code, 400)

    def test_painel_exige_login(self):
        anon = self.mod.app.test_client()
        self.assertEqual(anon.get("/api/admin/products").status_code, 401)
        self.assertEqual(anon.put("/api/admin/products/1", json={"price": 1}).status_code, 401)
        self.assertEqual(anon.get("/api/admin/orders").status_code, 401)
        self.assertEqual(anon.get("/admin").status_code, 302)
        self.assertEqual(anon.get("/admin/login").status_code, 200)
        self.assertEqual(anon.get("/api/products").status_code, 200, "a loja continua pública")
        self.assertEqual(anon.post("/api/admin/login", json={"email": "admin@teste.com", "password": "errada"}).status_code, 401)
        self.assertEqual(self.client.get("/admin").status_code, 200)
        self.client.get("/admin/logout")
        self.assertEqual(self.client.get("/api/admin/products").status_code, 401)

    def test_login_bloqueia_apos_varias_tentativas(self):
        anon = self.mod.app.test_client()
        codes = [anon.post("/api/admin/login", json={"email": "admin@teste.com", "password": "x"}).status_code for _ in range(6)]
        self.assertEqual(codes[-1], 429)
        self.assertEqual(anon.post("/api/admin/login", json={"email": "admin@teste.com", "password": "senha-teste"}).status_code, 429)

    def test_sem_dados_de_exemplo(self):
        for route in ("orders", "purchase-orders", "shipments", "suppliers"):
            self.assertEqual(self.client.get(f"/api/admin/{route}").get_json(), [], route)
        s = self.client.get("/api/admin/summary").get_json()
        self.assertEqual((s["sales"], s["pending_orders"], s["open_purchase_orders"]), (0, 0, 0))

    def test_pedido_real_reserva_estoque_e_aparece_no_painel(self):
        r = self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": 2}, {"id": 1, "quantity": 1}], "customer": CUSTOMER})
        self.assertEqual(r.status_code, 200, r.get_json())
        order = r.get_json()["order"]
        self.assertTrue(order["id"].startswith("PED-"))
        self.assertEqual(order["total"], 300)
        self.assertNotIn("document", json.dumps(order), "CPF/CNPJ não é devolvido nem gravado")
        self.assertEqual(self.client.get("/api/products/1").get_json()["stock"], 9, "12 - 3 reservados")
        saved = self.client.get("/api/admin/orders").get_json()
        self.assertEqual([o["id"] for o in saved], [order["id"]])
        self.assertEqual((saved[0]["status"], saved[0]["customer"], saved[0]["items"]), ("Aguardando pagamento", "Maria Teste", 3))
        self.assertNotIn("123.456", json.dumps(saved))
        s = self.client.get("/api/admin/summary").get_json()
        self.assertEqual(s["sales"], 0, "pedido aguardando pagamento ainda não é venda")
        self.client.put(f"/api/admin/orders/{order['id']}", json={"status": "Pago"})
        self.assertEqual(self.client.get("/api/admin/summary").get_json()["sales"], 300)
        # segundo pedido recebe outro número
        r2 = self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": 1}], "customer": CUSTOMER}).get_json()
        self.assertNotEqual(r2["order"]["id"], order["id"])

    def test_pedido_exige_dados_validos_e_nao_mexe_no_estoque(self):
        bad = [{}, {"name": "A", "email": "x", "document": "12345678909"}, {"name": "", "email": "a@b.com", "document": "12345678909"},
               {"name": "A", "email": "a@b.com", "document": "123"}]
        for customer in bad:
            self.assertEqual(self.client.post("/api/payment", json={"items": [{"id": 1, "quantity": 1}], "customer": customer}).status_code, 400)
        self.assertEqual(self.client.post("/api/payment", json={"items": [], "customer": CUSTOMER}).status_code, 400)
        self.assertEqual(self.client.get("/api/products/1").get_json()["stock"], 12)
        self.assertEqual(self.client.get("/api/admin/orders").get_json(), [])

    def test_crud_de_fornecedor_compra_e_expedicao(self):
        sup = self.client.post("/api/admin/suppliers", json={"name": "Suvinil", "lead": 5}).get_json()
        self.assertEqual(sup["id"], "FOR-0001")
        po = self.client.post("/api/admin/purchase-orders", json={"supplier": "Suvinil", "items": 10, "total": 500}).get_json()
        self.assertEqual((po["id"], po["status"]), ("OC-0001", "Rascunho"))
        ship = self.client.post("/api/admin/shipments", json={"order": "PED-0001", "carrier": "Correios"}).get_json()
        up = self.client.put(f"/api/admin/shipments/{ship['id']}", json={"status": "Enviado"}).get_json()
        self.assertTrue(up["sent_at"], "data de envio preenchida ao marcar como enviado")
        self.assertEqual(self.client.put(f"/api/admin/purchase-orders/{po['id']}", json={"status": "inventado"}).status_code, 400)
        self.assertEqual(self.client.post("/api/admin/suppliers", json={"lead": 3}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/admin/suppliers/{sup['id']}").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/admin/suppliers/{sup['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/admin/suppliers").get_json(), [])

    def test_recomendador_so_sugere_o_que_existe_no_banco(self):
        r = self.client.post("/api/recommend", json={"problem": "quero pintar minha parede"}).get_json()
        self.assertEqual([p["name"] for p in r["recommendations"]], ["Tinta A"])  # C está sem estoque

    def test_resumo_usa_o_banco(self):
        s = self.client.get("/api/admin/summary").get_json()
        self.assertEqual((s["products"], s["stock_units"]), (3, 12))

    def test_supabase_fora_do_ar_da_503_e_nao_cai_para_json(self):
        self.fake.close()
        r = self.client.get("/api/products")
        self.assertEqual(r.status_code, 503)
        self.assertIn("Supabase", r.get_json()["message"])

    def test_escrita_negada_explica_service_key(self):
        self.fake.deny_writes = True
        r = self.client.put("/api/admin/products/1", json={"price": 1})
        self.assertEqual(r.status_code, 403)
        self.assertIn("SUPABASE_SERVICE_KEY", r.get_json()["message"])


class PortugueseSchemaTests(unittest.TestCase):
    """Tabela com colunas em português, id uuid e listas em texto (como a IA-NAP já aceita)."""

    def setUp(self):
        self.fake = FakePostgREST({
            "produtos": [{"id": "a1", "nome": "Selador Antimofo", "marca": "Quartzolit", "categoria": "Tratamento",
                          "preco": "89,90", "descricao": "ok", "ambientes": "Quarto, Banheiro", "ativo": True,
                          "tempo_secagem": "4 horas"},
                         {"id": "b2", "nome": "Antiga", "marca": "X", "categoria": "Parede", "preco": 10, "ativo": False}],
            "estoque": [{"id": 1, "produto_id": "a1", "quantidade": 15}],
        })
        self.addCleanup(self.fake.close)
        self.mod = load_app({"PRODUCTS_SOURCE": "supabase", "SUPABASE_URL": self.fake.url, "SUPABASE_KEY": "k",
                             "SUPABASE_SERVICE_KEY": "service", "SUPABASE_TABLE": "produtos", "SUPABASE_CACHE_SECONDS": "0"})
        self.client = admin_client(self.mod)

    def test_le_colunas_em_portugues_ids_texto_e_ignora_inativos(self):
        p = self.client.get("/api/products").get_json()
        self.assertEqual(len(p), 1)
        self.assertEqual((p[0]["id"], p[0]["name"], p[0]["price"], p[0]["stock"]), ("a1", "Selador Antimofo", 89.9, 15))
        self.assertEqual(p[0]["environments"], ["Quarto", "Banheiro"])
        self.assertEqual(self.client.get("/api/products/a1").status_code, 200)

    def test_grava_usando_os_nomes_reais_das_colunas(self):
        r = self.client.post("/api/admin/products", json={"name": "Novo", "brand": "Coral", "category": "Parede",
                                                           "price": 20, "stock": 3, "environments": ["Sala", "Quarto"]})
        self.assertEqual(r.status_code, 201, r.get_json())
        row = self.fake.tables["produtos"][-1]
        self.assertEqual((row["nome"], row["marca"], row["preco"]), ("Novo", "Coral", 20.0))
        self.assertEqual(row["ambientes"], "Sala, Quarto", "coluna de texto continua texto")
        self.assertNotIn("name", row)
        self.assertNotIn("icon", row, "não envia colunas que a tabela não tem")
        # escrita usou a chave service
        self.assertIn("service", [req[4] for req in self.fake.requests if req[0] in ("POST", "PATCH")])

    def test_apagar_com_coluna_ativo_desativa_em_vez_de_deletar(self):
        self.assertEqual(self.client.delete("/api/admin/products/a1").status_code, 200)
        self.assertFalse(self.fake.tables["produtos"][0]["ativo"])
        self.assertEqual(len(self.fake.tables["produtos"]), 2)
        self.assertEqual(self.client.get("/api/products").get_json(), [])


class AutomaticSyncTests(unittest.TestCase):
    """O que muda direto no Supabase tem que chegar ao site sozinho (sem cadastrar nada à mão)."""

    def make(self, tables, **env):
        self.fake = FakePostgREST(tables)
        self.addCleanup(self.fake.close)
        base = {"PRODUCTS_SOURCE": "supabase", "SUPABASE_URL": self.fake.url, "SUPABASE_KEY": "k",
                "SUPABASE_CACHE_SECONDS": "0"}
        self.mod = load_app({**base, **env})
        self.client = admin_client(self.mod)
        return self.client

    def names(self):
        return sorted(p["name"] for p in self.client.get("/api/products").get_json())

    def test_produto_novo_no_supabase_aparece_sem_linha_de_estoque(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10}],
                   "estoque": [{"produto_id": 1, "quantidade": 5}]})
        self.assertEqual(self.names(), ["A"])
        self.fake.tables["products"].append({"id": 2, "name": "Novo", "brand": "X", "category": "Piso", "price": 20})
        self.assertEqual(self.names(), ["A", "Novo"], "produto novo aparece sozinho")
        self.assertEqual(self.client.get("/api/products/2").get_json()["stock"], 100)

    def test_untracked_zero_esconde_ate_cadastrar_estoque(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10}], "estoque": []},
                  SUPABASE_UNTRACKED_STOCK="0")
        self.assertEqual(self.names(), [])
        self.fake.tables["estoque"].append({"produto_id": 1, "quantidade": 3})
        self.assertEqual(self.names(), ["A"])

    def test_preco_estoque_e_desativar_chegam_sozinhos(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10, "ativo": True}],
                   "estoque": [{"produto_id": 1, "quantidade": 5}]})
        self.fake.tables["products"][0]["price"] = 99.9
        self.fake.tables["estoque"][0]["quantidade"] = 2
        p = self.client.get("/api/products").get_json()[0]
        self.assertEqual((p["price"], p["stock"]), (99.9, 2))
        self.fake.tables["estoque"][0]["quantidade"] = 0
        self.assertEqual(self.names(), [], "estoque zerado some da loja")
        self.fake.tables["estoque"][0]["quantidade"] = 4
        self.fake.tables["products"][0]["ativo"] = False
        self.assertEqual(self.names(), [], "produto inativo some da loja")

    def test_estoque_na_coluna_do_proprio_produto_e_usado_quando_nao_ha_linha(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10, "estoque": 7}],
                   "estoque": []})
        self.assertEqual(self.client.get("/api/products/1").get_json()["stock"], 7)

    def test_sem_tabela_de_estoque_usa_a_coluna(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10, "quantidade": 6},
                                {"id": 2, "name": "B", "brand": "X", "category": "Parede", "price": 10, "quantidade": 0}]})
        self.assertEqual(self.names(), ["A"])
        self.assertEqual(self.mod.catalog.stock_table, None)
        # e o painel grava o estoque na coluna do produto
        self.assertEqual(self.client.put("/api/admin/products/2", json={"stock": 9}).get_json()["stock"], 9)
        self.assertEqual(self.names(), ["A", "B"])

    def test_nome_errado_da_tabela_de_estoque_nao_esconde_a_loja_e_o_diagnostico_avisa(self):
        self.make({"products": [{"id": 1, "name": "A", "brand": "X", "category": "Parede", "price": 10}],
                   "estoque": [{"produto_id": 1, "quantidade": 5}]}, SUPABASE_STOCK_TABLE="estoq")
        self.assertEqual(self.names(), ["A"], "tabela 'estoq' não existe: a loja continua mostrando os produtos")
        d = self.client.get("/api/admin/catalog-check").get_json()
        self.assertIn("estoq", d["warning"])

    def test_api_nao_fica_em_cache_do_navegador_e_cache_do_servidor_e_curto(self):
        self.make({"products": [], "estoque": []})
        self.assertEqual(self.client.get("/api/products").headers.get("Cache-Control"), "no-store")
        mod = load_app({"PRODUCTS_SOURCE": "supabase", "SUPABASE_URL": self.fake.url, "SUPABASE_KEY": "k"})
        self.assertLessEqual(mod.catalog.cache_seconds, 3)

    def test_diagnostico_explica_por_que_cada_produto_aparece_ou_some(self):
        self.make({"products": [{"id": 1, "name": "Visivel", "price": 1}, {"id": 2, "name": "Zerado", "price": 1},
                                {"id": 3, "name": "Inativo", "price": 1, "ativo": False}, {"id": 4, "name": "SemRegistro", "price": 1}],
                   "estoque": [{"produto_id": 1, "quantidade": 3}, {"produto_id": 2, "quantidade": 0}]})
        d = self.client.get("/api/admin/catalog-check").get_json()
        self.assertEqual((d["rows_in_products_table"], d["visible_in_store"]), (4, 2))
        reasons = {h["name"]: h["reason"] for h in d["hidden"]}
        self.assertIn("inativo", reasons["Inativo"])
        self.assertIn("estoque 0", reasons["Zerado"])
        self.assertEqual(d["without_stock_record"], ["SemRegistro"])
        self.assertEqual(self.mod.app.test_client().get("/api/admin/catalog-check").status_code, 401)


class StartupTests(unittest.TestCase):
    def test_supabase_sem_credenciais_nao_sobe(self):
        with self.assertRaises(Exception) as cm:
            load_app({"PRODUCTS_SOURCE": "supabase"})
        self.assertIn("SUPABASE_URL", str(cm.exception))

    def test_padrao_e_supabase(self):
        with self.assertRaises(Exception) as cm:
            load_app({})
        self.assertIn("SUPABASE", str(cm.exception))

    def test_fonte_invalida(self):
        with self.assertRaises(Exception) as cm:
            load_app({"PRODUCTS_SOURCE": "mongo"})
        self.assertIn("inválido", str(cm.exception))

    def test_modo_json_continua_funcionando_para_dev(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "p.json"
            f.write_text(json.dumps([{"id": 1, "name": "J", "brand": "b", "category": "Parede", "price": 5, "stock": 2}]))
            mod = load_app({"PRODUCTS_SOURCE": "json", "PRODUCTS_FILE": str(f)})
            c = admin_client(mod)
            self.assertEqual(c.get("/api/products").get_json()[0]["name"], "J")
            self.assertEqual(c.put("/api/admin/products/1", json={"stock": 9}).get_json()["stock"], 9)
            self.assertEqual(json.loads(f.read_text())[0]["stock"], 9)


if __name__ == "__main__":
    unittest.main()
