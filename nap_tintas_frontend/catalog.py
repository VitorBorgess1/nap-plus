"""catalog.py - ÚNICO ponto do Flask que sabe DE ONDE vêm os produtos.

Espelha o IA-NAP/product-repository.js: o site (Flask) e a IA (Node) leem o MESMO
catálogo, escolhido por PRODUCTS_SOURCE:

  * "supabase" -> banco de dados (tabela de produtos + tabela de estoque). É o padrão.
  * "json"     -> arquivo data/products.json (só para desenvolvimento sem banco).

Só biblioteca padrão do Python (urllib): fala com a API REST do Supabase (PostgREST),
do mesmo jeito que a IA-NAP faz.

Regra de ouro: nenhuma rota do app.py lê produto de outro lugar que não seja este módulo.
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ------------------------------------------------------------------
# Nomes de colunas aceitos (mesma lista do IA-NAP/product-repository.js),
# para a tabela do Supabase poder usar colunas em português ou inglês.
# ------------------------------------------------------------------
FIELD_ALIASES = {
    "id": ["id", "product_id", "produto_id"],
    "name": ["name", "nome", "title", "titulo"],
    "brand": ["brand", "marca"],
    "category": ["category", "categoria"],
    "finish": ["finish", "acabamento"],
    "price": ["price", "preco", "preço", "valor"],
    "stock": ["stock", "estoque", "quantity", "quantidade", "qtd"],
    "coverage": ["coverage", "rendimento", "cobertura"],
    "description": ["description", "descricao", "descrição"],
    "image": ["image", "imagem", "image_url", "imagem_url", "foto"],
    "icon": ["icon", "icone", "ícone"],
    "surface": ["surface", "surfaces", "superficie", "superficies", "superfície", "superfícies"],
    "environments": ["environments", "environment", "ambientes", "ambiente"],
    "purposes": ["purposes", "purpose", "finalidades", "finalidade"],
    "tags": ["tags", "tag"],
}
LIST_FIELDS = ("surface", "environments", "purposes", "tags")
ACTIVE_COLUMNS = ["active", "ativo", "is_active", "ativa"]
IGNORED_COLUMNS = ["created_at", "updated_at", "deleted_at", "inserted_at", "criado_em",
                   "atualizado_em", "user_id", "slug", *ACTIVE_COLUMNS]
KNOWN_COLUMNS = {c for names in FIELD_ALIASES.values() for c in names} | set(IGNORED_COLUMNS)

STOCK_FK_COLUMNS = ["produto_id", "product_id"]
STOCK_QTY_COLUMNS = ["quantidade", "quantity", "qtd", "estoque", "stock"]

# Campos que o painel admin pode gravar (nome lógico -> aceito no payload).
WRITABLE_FIELDS = ["name", "brand", "category", "finish", "price", "coverage", "description",
                   "image", "icon", "surface", "environments", "purposes", "tags"]


class CatalogError(Exception):
    """Falha ao ler/gravar o catálogo. `status` é o código HTTP sugerido para a rota."""

    def __init__(self, message, status=503):
        super().__init__(message)
        self.message = message
        self.status = status


# ------------------------------------------------------------------
# Normalização (igual à da IA-NAP, para os dois lados enxergarem o mesmo produto)
# ------------------------------------------------------------------
def _pick(row, names):
    for n in names:
        if row.get(n) is not None:
            return row[n]
    return None


def _pick_key(row, names):
    for n in names:
        if n in row:
            return n
    return None


def to_number(value):
    """'R$ 189,90' / '189.90' / 189.9 -> número. Vazio ou inválido vira 0."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return value
    s = re.sub(r"[^\d.,-]", "", "" if value is None else str(value))
    if not s:
        return 0
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return 0


def to_list(value):
    """Aceita lista, texto JSON ('["a","b"]') ou texto separado por vírgula ("a, b")."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if not isinstance(value, str) or not value.strip():
        return []
    t = value.strip()
    if t.startswith("["):
        try:
            return to_list(json.loads(t))
        except ValueError:
            pass
    t = re.sub(r"^[{\[]|[}\]]$", "", t)
    parts = (re.sub(r'^"|"$', "", v.strip()) for v in re.split(r"[,;|]", t))
    return [p for p in parts if p]


def is_active(row):
    flag = _pick(row, ACTIVE_COLUMNS)
    return flag is None or not (flag is False or flag == "false" or flag == 0)


def normalize_product(row):
    """Linha crua (do banco ou do JSON) -> produto no formato que o site usa."""
    stock = to_number(_pick(row, FIELD_ALIASES["stock"]))
    return {
        "id": _pick(row, FIELD_ALIASES["id"]),
        "name": str(_pick(row, FIELD_ALIASES["name"]) or ""),
        "brand": str(_pick(row, FIELD_ALIASES["brand"]) or ""),
        "category": str(_pick(row, FIELD_ALIASES["category"]) or ""),
        "finish": str(_pick(row, FIELD_ALIASES["finish"]) or ""),
        "price": float(to_number(_pick(row, FIELD_ALIASES["price"]))),
        "stock": int(stock),
        "coverage": str(_pick(row, FIELD_ALIASES["coverage"]) or ""),
        "description": str(_pick(row, FIELD_ALIASES["description"]) or ""),
        "image": _pick(row, FIELD_ALIASES["image"]) or "",
        "icon": _pick(row, FIELD_ALIASES["icon"]) or "",
        **{f: to_list(_pick(row, FIELD_ALIASES[f])) for f in LIST_FIELDS},
    }


def same_id(a, b):
    return a is not None and b is not None and str(a) == str(b)


# ------------------------------------------------------------------
# Fonte JSON (desenvolvimento sem banco)
# ------------------------------------------------------------------
class JsonCatalog:
    source = "json"

    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self._lock = threading.Lock()

    def _read(self):
        try:
            return json.loads(self.file_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except ValueError as e:
            raise CatalogError(f"{self.file_path.name} está com JSON inválido: {e}")

    def _write(self, rows):
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_all(self, fresh=False):
        return [normalize_product(r) for r in self._read() if is_active(r)]

    def get(self, product_id, fresh=False):
        return next((p for p in self.list_all() if same_id(p["id"], product_id)), None)

    def diagnose(self):
        rows = self._read()
        return {"source": "json", "rows_in_products_table": len(rows),
                "visible_in_store": len([p for p in self.list_all() if p["stock"] > 0])}

    def create(self, data):
        with self._lock:
            rows = self._read()
            ids = [int(r["id"]) for r in rows if str(r.get("id", "")).isdigit()]
            row = {"id": max(ids or [0]) + 1, "stock": 0, **{k: data[k] for k in WRITABLE_FIELDS + ["stock"] if k in data}}
            rows.append(row)
            self._write(rows)
        return normalize_product(row)

    def update(self, product_id, data):
        with self._lock:
            rows = self._read()
            row = next((r for r in rows if same_id(r.get("id"), product_id)), None)
            if row is None:
                return None
            row.update({k: data[k] for k in WRITABLE_FIELDS + ["stock"] if k in data})
            self._write(rows)
        return normalize_product(row)

    def delete(self, product_id):
        with self._lock:
            rows = self._read()
            kept = [r for r in rows if not same_id(r.get("id"), product_id)]
            if len(kept) == len(rows):
                return False
            self._write(kept)
        return True


# ------------------------------------------------------------------
# Fonte Supabase (padrão)
# ------------------------------------------------------------------
class SupabaseCatalog:
    source = "supabase"

    def __init__(self, url, key, table="products", stock_table="estoque", cache_seconds=3, write_key=None,
                 untracked_stock=100):
        if not url or not key:
            raise CatalogError(
                "PRODUCTS_SOURCE=supabase exige SUPABASE_URL e SUPABASE_KEY (no IA-NAP/.env ou num .env na raiz do projeto).",
                status=500,
            )
        self.url = url
        self.key = key
        self.write_key = write_key or key  # escrita pode exigir a chave service_role (só no servidor!)
        self.table = table
        self.stock_table = stock_table
        self.cache_seconds = max(0, cache_seconds)
        # Produto que existe na tabela mas não tem NENHUM registro de estoque (nem linha em "estoque",
        # nem coluna própria) aparece na loja com esta quantidade, em vez de sumir. 0 = esconder.
        self.untracked_stock = max(0, int(untracked_stock))
        self.missing_stock_table = None  # nome configurado que o Supabase disse não existir
        self._cache = None  # (instante, produtos normalizados)
        self._cols = {}  # campo lógico -> nome real da coluna (aprendido das linhas lidas)
        self._stock_cols = {}
        self._samples = {}  # coluna -> um valor de exemplo (para saber se lista é texto ou array)
        self._lock = threading.Lock()

    # ---------- HTTP ----------
    def _request(self, method, table, query="", body=None, write=False):
        endpoint = f"{self.url}/rest/v1/{urllib.parse.quote(table, safe='')}{query}"
        key = self.write_key if write else self.key
        headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if write and method in ("POST", "PATCH"):
            headers["Prefer"] = "return=representation"
        req = urllib.request.Request(endpoint, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=8) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            raise CatalogError(self._hint(e.code, table, detail, write), status=self._status(e.code, write))
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise CatalogError(f"Não foi possível conectar ao Supabase ({getattr(e, 'reason', e)}). Confira SUPABASE_URL.")
        except ValueError:
            raise CatalogError(f'Resposta inesperada do Supabase para "{table}".', status=502)

    @staticmethod
    def _status(code, write):
        if write and code in (401, 403):
            return 403
        return 502 if code >= 500 or code in (401, 403, 404) else 400

    @staticmethod
    def _hint(code, table, detail, write):
        if "PGRST125" in detail:
            hint = "A SUPABASE_URL está com caminho extra. Use só https://SEU-PROJETO.supabase.co."
        elif write and code in (401, 403):
            hint = (f'O Supabase recusou a ESCRITA em "{table}" (RLS/permissão). Para o painel admin gravar, '
                    "configure SUPABASE_SERVICE_KEY (chave service_role, só no servidor) ou crie policies de escrita.")
        elif code == 404:
            hint = f'Tabela "{table}" não encontrada ou não exposta na Data API.'
        elif code in (401, 403):
            hint = f'Acesso recusado à tabela "{table}" (confira SUPABASE_KEY e a policy de SELECT).'
        else:
            hint = ""
        return f"Supabase respondeu {code}. {hint} {detail}".strip()

    # ---------- leitura ----------
    def _fetch_rows(self, table):
        rows = self._request("GET", table, "?select=*&limit=1000")
        if not isinstance(rows, list):
            raise CatalogError(f'Resposta inesperada do Supabase para "{table}" (não é uma lista).', status=502)
        return rows

    @staticmethod
    def _learn(columns, aliases_by_field, rows):
        for row in rows:
            for field, names in aliases_by_field.items():
                if field not in columns:
                    key = _pick_key(row, names)
                    if key:
                        columns[field] = key

    def _read_all(self):
        """Lê produtos e estoque do banco. Devolve (linhas, soma do estoque por produto ou None)."""
        rows = self._fetch_rows(self.table)
        stock_rows = None
        if self.stock_table:
            try:
                stock_rows = self._fetch_rows(self.stock_table)
            except CatalogError as e:
                if not str(e).startswith("Supabase respondeu 404"):
                    raise
                # Não existe tabela de estoque separada: o estoque é uma coluna da própria tabela de produtos.
                print(f'[NAP+] AVISO: tabela de estoque "{self.stock_table}" não existe; usando a coluna de estoque de "{self.table}". '
                      "Confira SUPABASE_STOCK_TABLE no .env.")
                self.missing_stock_table = self.stock_table
                self.stock_table = None

        self._learn(self._cols, FIELD_ALIASES, rows)
        for row in rows[:20]:
            for k, v in row.items():
                if v is not None:
                    self._samples.setdefault(k, v)

        stock_by_product = None
        if stock_rows is not None:
            self._learn(self._stock_cols, {"fk": STOCK_FK_COLUMNS, "qty": STOCK_QTY_COLUMNS}, stock_rows)
            stock_by_product = {}
            for r in stock_rows:
                pid = _pick(r, STOCK_FK_COLUMNS)
                if pid is not None:
                    stock_by_product[str(pid)] = stock_by_product.get(str(pid), 0) + to_number(_pick(r, STOCK_QTY_COLUMNS))
        return rows, stock_by_product

    def _resolve_stock(self, row, stock_by_product):
        """(quantidade, de_onde_veio). Linha em "estoque" > coluna do próprio produto > sem controle."""
        if stock_by_product is not None:
            pid = str(_pick(row, FIELD_ALIASES["id"]))
            if pid in stock_by_product:
                return stock_by_product[pid], "tabela de estoque"
        own = _pick(row, FIELD_ALIASES["stock"])
        if own is not None:
            return own, "coluna do produto"
        # Nenhum registro de estoque em lugar nenhum (inclui tabela de estoque com nome errado/inexistente).
        return self.untracked_stock, "sem registro de estoque"

    def list_all(self, fresh=False):
        with self._lock:
            cached = self._cache
        if cached and not fresh and time.monotonic() - cached[0] < self.cache_seconds:
            return cached[1]

        rows, stock_by_product = self._read_all()
        products = []
        for r in rows:
            if not is_active(r):
                continue
            quantity, _ = self._resolve_stock(r, stock_by_product)
            products.append(normalize_product({**r, "stock": quantity}))

        with self._lock:
            self._cache = (time.monotonic(), products)
        return products

    def diagnose(self):
        """Explica, produto por produto, por que aparece ou não aparece na loja (para o admin conferir)."""
        rows, stock_by_product = self._read_all()
        shown, hidden, untracked = 0, [], []
        for r in rows:
            name = str(_pick(r, FIELD_ALIASES["name"]) or _pick(r, FIELD_ALIASES["id"]))
            if not is_active(r):
                hidden.append({"id": _pick(r, FIELD_ALIASES["id"]), "name": name, "reason": "marcado como inativo"})
                continue
            quantity, origin = self._resolve_stock(r, stock_by_product)
            if origin == "sem registro de estoque":
                untracked.append(name)
            if int(to_number(quantity)) > 0:
                shown += 1
            else:
                hidden.append({"id": _pick(r, FIELD_ALIASES["id"]), "name": name, "reason": f"estoque 0 ({origin})"})
        return {
            "source": "supabase", "products_table": self.table, "stock_table": self.stock_table or "(coluna na própria tabela)",
            "rows_in_products_table": len(rows), "visible_in_store": shown, "hidden": hidden,
            "without_stock_record": untracked, "untracked_stock": self.untracked_stock,
            "cache_seconds": self.cache_seconds, "columns_detected": dict(self._cols),
            "warning": (f'A tabela de estoque "{self.missing_stock_table}" (SUPABASE_STOCK_TABLE) não existe no Supabase. '
                        "Corrija o nome no .env se o estoque fica numa tabela separada.") if self.missing_stock_table else None,
        }

    def get(self, product_id, fresh=False):
        return next((p for p in self.list_all(fresh) if same_id(p["id"], product_id)), None)

    def _invalidate(self):
        with self._lock:
            self._cache = None

    # ---------- escrita ----------
    def _col(self, field):
        return self._cols.get(field) or FIELD_ALIASES[field][0]

    def _has_col(self, field):
        # Tabela ainda sem linhas: não dá para saber as colunas, então tenta todas.
        return not self._cols or field in self._cols

    def _row_body(self, data):
        body = {}
        for field in WRITABLE_FIELDS:
            if field not in data or not self._has_col(field):
                continue
            value = data[field]
            if field in LIST_FIELDS:
                value = to_list(value)
                sample = self._samples.get(self._col(field))
                if isinstance(sample, str):  # coluna de texto: grava como texto, não como array
                    value = json.dumps(value, ensure_ascii=False) if sample.strip().startswith("[") else ", ".join(value)
            body[self._col(field)] = value
        return body

    def _id_filter(self, product_id):
        return f"?{urllib.parse.quote(self._col('id'), safe='')}=eq.{urllib.parse.quote(str(product_id), safe='')}"

    def _stock_filter(self, product_id):
        fk = self._stock_cols.get("fk") or STOCK_FK_COLUMNS[0]
        return f"?{urllib.parse.quote(fk, safe='')}=eq.{urllib.parse.quote(str(product_id), safe='')}"

    def _set_stock(self, product_id, quantity):
        quantity = max(0, int(quantity))
        if not self.stock_table:  # estoque mora na própria linha do produto
            self._request("PATCH", self.table, self._id_filter(product_id), {self._col("stock"): quantity}, write=True)
            return
        fk = self._stock_cols.get("fk") or STOCK_FK_COLUMNS[0]
        qty = self._stock_cols.get("qty") or STOCK_QTY_COLUMNS[0]
        existing = self._request("GET", self.stock_table, self._stock_filter(product_id) + "&select=*") or []
        if len(existing) == 1:
            self._request("PATCH", self.stock_table, self._stock_filter(product_id), {qty: quantity}, write=True)
            return
        if len(existing) > 1:  # várias linhas somam no estoque: junta tudo numa só
            self._request("DELETE", self.stock_table, self._stock_filter(product_id), write=True)
        self._request("POST", self.stock_table, "", {fk: product_id, qty: quantity}, write=True)

    def create(self, data):
        self.list_all(fresh=True)  # aprende nomes de colunas e exemplos de valores
        body = self._row_body(data)
        if not self.stock_table and "stock" in data:
            body[self._col("stock")] = max(0, int(data["stock"]))
        created = self._request("POST", self.table, "", body, write=True)
        row = created[0] if isinstance(created, list) and created else None
        if not row:
            raise CatalogError("O Supabase não devolveu o produto criado.", status=502)
        new_id = _pick(row, FIELD_ALIASES["id"])
        if self.stock_table:
            try:
                self._set_stock(new_id, data.get("stock", 0))
            except CatalogError:
                try:  # não deixa produto "órfão" sem linha de estoque
                    self._request("DELETE", self.table, self._id_filter(new_id), write=True)
                except CatalogError:
                    pass
                raise
        self._invalidate()
        return self.get(new_id, fresh=True)

    def update(self, product_id, data):
        current = self.get(product_id, fresh=True)
        if current is None:
            return None
        product_id = current["id"]  # id com o tipo real do banco (int/uuid), não o texto da URL
        body = self._row_body(data)
        if body:
            self._request("PATCH", self.table, self._id_filter(product_id), body, write=True)
        if "stock" in data:
            self._set_stock(product_id, data["stock"])
        self._invalidate()
        return self.get(product_id, fresh=True)

    def delete(self, product_id):
        raw = next((p for p in self.list_all(fresh=True) if same_id(p["id"], product_id)), None)
        if raw is None:
            return False
        product_id = raw["id"]
        flag = next((c for c in ACTIVE_COLUMNS if c in self._samples), None)
        if flag:  # tabela tem "ativo": desativa em vez de apagar (preserva histórico de pedidos)
            self._request("PATCH", self.table, self._id_filter(product_id), {flag: False}, write=True)
        else:
            if self.stock_table:
                self._request("DELETE", self.stock_table, self._stock_filter(product_id), write=True)
            self._request("DELETE", self.table, self._id_filter(product_id), write=True)
        self._invalidate()
        return True


# ------------------------------------------------------------------
# Fábrica: escolhe a fonte pelo PRODUCTS_SOURCE (mesma variável da IA-NAP)
# ------------------------------------------------------------------
def create_catalog(env=None, base_dir=None):
    env = os.environ if env is None else env
    base_dir = Path(base_dir or Path(__file__).resolve().parent)
    source = (env.get("PRODUCTS_SOURCE") or "supabase").strip().lower()

    if source == "supabase":
        url = (env.get("SUPABASE_URL") or "").strip().rstrip("/")
        url = re.sub(r"/rest/v1$", "", url)  # aceita a URL com ou sem /rest/v1, como a IA-NAP
        return SupabaseCatalog(
            url=url,
            key=env.get("SUPABASE_KEY") or "",
            table=env.get("SUPABASE_TABLE") or "products",
            stock_table=env.get("SUPABASE_STOCK_TABLE", "estoque"),
            cache_seconds=float(env.get("SUPABASE_CACHE_SECONDS", 3)),
            write_key=env.get("SUPABASE_SERVICE_KEY") or None,
            untracked_stock=int(env.get("SUPABASE_UNTRACKED_STOCK", 100)),
        )
    if source == "json":
        return JsonCatalog(env.get("PRODUCTS_FILE") or base_dir / "data" / "products.json")
    raise CatalogError(f'PRODUCTS_SOURCE="{source}" inválido. Use "supabase" ou "json".', status=500)
