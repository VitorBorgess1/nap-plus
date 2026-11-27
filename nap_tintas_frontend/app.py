from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, redirect, url_for

# Variáveis de ambiente: a raiz do projeto (.env) tem prioridade e, em seguida, o MESMO
# IA-NAP/.env que o serviço da IA usa. Assim, PRODUCTS_SOURCE e as credenciais do Supabase
# existem em UM lugar só e o site e a IA nunca apontam para catálogos diferentes.
_BASE_DIR = Path(__file__).resolve().parent
load_dotenv(_BASE_DIR / ".env")
load_dotenv(_BASE_DIR / "IA-NAP" / ".env")

from catalog import CatalogError, create_catalog  # noqa: E402  (precisa vir depois do load_dotenv)
# --- INÍCIO integração IA NAP+ ---
# Módulos padrão do Python (nenhuma dependência nova em requirements.txt)
# usados só para encaminhar a mensagem ao serviço Node da IA-NAP.
import os
import json
import time
import threading
import urllib.request
import urllib.error
# --- FIM integração IA NAP+ ---

app = Flask(__name__)

# ============================================================
# SEGURANÇA DO PAINEL ADMIN
# ------------------------------------------------------------
# ADMIN_EMAIL (opcional) e ADMIN_PASSWORD (obrigatória) ficam no .env.
# Sem ADMIN_PASSWORD o painel fica TRANCADO (nunca aberto por esquecimento).
# SECRET_KEY assina o cookie de sessão: defina uma fixa em produção
# (senão as sessões caem a cada reinício). SESSION_COOKIE_SECURE=1 com HTTPS.
# ============================================================
import hmac
import secrets
from datetime import timedelta

ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)
if not ADMIN_PASSWORD:
    print("[NAP+] AVISO: ADMIN_PASSWORD não definida. O painel /admin ficará bloqueado até você definir no .env.")

_login_fails = {}  # ip -> instantes das últimas tentativas erradas
_login_lock = threading.Lock()
_LOGIN_MAX_FAILS, _LOGIN_WINDOW = 5, 300  # 5 erros a cada 5 minutos por IP


def _admin_logged_in():
    return bool(session.get("admin"))


@app.before_request
def _guard_admin():
    path = request.path
    if path in ("/admin/login", "/api/admin/login", "/admin/logout"):
        return None
    if path == "/admin" or path.startswith("/admin/") or path.startswith("/api/admin/"):
        if not _admin_logged_in():
            if path.startswith("/api/"):
                return jsonify({"error": "Faça login no painel para continuar."}), 401
            return redirect(url_for("admin_login"))
    return None

# --- INÍCIO integração IA NAP+ (proxy confiável) ---
# Se o Flask rodar ATRÁS de um proxy reverso (nginx, Render, Railway...), request.remote_addr seria o IP do proxy.
# Defina NAP_TRUSTED_PROXIES=1 (quantidade de proxies) para ler o IP real do visitante em X-Forwarded-For.
# Em desenvolvimento local (padrão 0) o cabeçalho é ignorado, então ninguém consegue forjar o próprio IP.
_NAP_TRUSTED_PROXIES = int(os.environ.get("NAP_TRUSTED_PROXIES", "0"))
if _NAP_TRUSTED_PROXIES > 0:
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=_NAP_TRUSTED_PROXIES)
# --- FIM integração IA NAP+ (proxy confiável) ---

# ============================================================
# CATÁLOGO (FONTE ÚNICA DE PRODUTOS)
# ------------------------------------------------------------
# PRODUCTS_SOURCE=supabase (padrão) -> banco de dados, o mesmo que a IA-NAP lê.
# PRODUCTS_SOURCE=json              -> data/products.json (só para dev sem banco).
# Se faltar SUPABASE_URL/SUPABASE_KEY o app NÃO sobe: é melhor falhar do que
# servir um catálogo diferente do que a IA recomenda.
# ============================================================
catalog = create_catalog(base_dir=_BASE_DIR)
print(f"[NAP+] Catálogo de produtos: {catalog.source}")


@app.errorhandler(CatalogError)
def _catalog_error(err):
    return jsonify({"success": False, "error": err.message, "message": err.message}), err.status
# --- INÍCIO integração IA NAP+ ---
# Endereço do serviço Node.js da IA (IA-NAP/server.js). Pode ser trocado
# por variável de ambiente sem precisar alterar este arquivo.
NAP_AI_URL = os.environ.get("NAP_AI_URL", "http://127.0.0.1:3001/api/chat")

# Limite de mensagens para a IA por IP do visitante (protege a cota do Gemini). Janela de 60 segundos, em memória.
NAP_AI_RATE_LIMIT_PER_MIN = int(os.environ.get("NAP_AI_RATE_LIMIT_PER_MIN", "20"))
_ai_hits = {}                      # ip -> lista de instantes (time.monotonic) dos pedidos no último minuto
_ai_hits_lock = threading.Lock()   # o Flask atende vários pedidos ao mesmo tempo (threads)


def _ai_rate_limit_check(ip):
    """Registra o pedido e devolve 0 se pode passar, ou os segundos a esperar se o IP estourou o limite."""
    now = time.monotonic()
    with _ai_hits_lock:
        # Limpeza: tira IPs sem pedidos recentes para o dicionário não crescer para sempre.
        if len(_ai_hits) > 1000:
            for k in [k for k, v in _ai_hits.items() if not v or now - v[-1] >= 60]:
                del _ai_hits[k]
        recent = [t for t in _ai_hits.get(ip, []) if now - t < 60]
        if len(recent) >= NAP_AI_RATE_LIMIT_PER_MIN:
            _ai_hits[ip] = recent
            return max(1, int(60 - (now - recent[0])) + 1)
        recent.append(now)
        _ai_hits[ip] = recent
        return 0
# --- FIM integração IA NAP+ ---

# ============================================================
# ARMAZENAMENTO PERSISTENTE DO PROTÓTIPO ADMIN
# ============================================================
from pathlib import Path
import re
from datetime import datetime

ADMIN_FILE = Path(os.environ.get("ADMIN_DATA_FILE") or (_BASE_DIR / "data" / "admin_data.json"))
ADMIN_FILE.parent.mkdir(parents=True, exist_ok=True)
_ADMIN_LOCK = threading.RLock()


def _save_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)  # troca atômica: nunca deixa o arquivo pela metade


def _load_json(path, default):
    if not path.exists():
        _save_json(path, default)
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


# Começa VAZIO: pedidos, ordens de compra, expedições e fornecedores são os da loja de verdade.
ADMIN_DATA = _load_json(ADMIN_FILE, {})
for _k in ("orders", "purchase_orders", "shipments", "suppliers"):
    ADMIN_DATA.setdefault(_k, [])


def _persist_admin():
    with _ADMIN_LOCK:
        _save_json(ADMIN_FILE, ADMIN_DATA)


def _next_id(prefix, items):
    nums=[]
    for item in items:
        m=re.search(r"(\d+)$", str(item.get("id","")))
        if m: nums.append(int(m.group(1)))
    return f"{prefix}-{(max(nums) if nums else 0)+1:04d}"


# ============================================================
# ADMIN - PÁGINA E APIs
# ============================================================
@app.get("/admin/login")
def admin_login():
    if _admin_logged_in():
        return redirect(url_for("admin"))
    return render_template("admin_login.html")


@app.post("/api/admin/login")
def admin_login_api():
    if not ADMIN_PASSWORD:
        return jsonify({"error": "Painel bloqueado: defina ADMIN_PASSWORD no .env e reinicie o servidor."}), 503
    ip = request.remote_addr or "unknown"
    now = time.monotonic()
    with _login_lock:
        recent = [t for t in _login_fails.get(ip, []) if now - t < _LOGIN_WINDOW]
        _login_fails[ip] = recent
        if len(recent) >= _LOGIN_MAX_FAILS:
            return jsonify({"error": "Muitas tentativas. Aguarde alguns minutos e tente de novo."}), 429
    data = request.get_json(silent=True) or {}
    email_ok = not ADMIN_EMAIL or hmac.compare_digest(str(data.get("email", "")).strip().lower().encode(), ADMIN_EMAIL.encode())
    pass_ok = hmac.compare_digest(str(data.get("password", "")).encode(), ADMIN_PASSWORD.encode())
    if not (email_ok and pass_ok):
        with _login_lock:
            _login_fails.setdefault(ip, []).append(now)
        return jsonify({"error": "E-mail ou senha incorretos."}), 401
    with _login_lock:
        _login_fails.pop(ip, None)
    session.clear()
    session["admin"] = True
    session.permanent = True
    return jsonify({"success": True})


@app.get("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login"))


@app.get("/admin")
def admin():
    return render_template("admin.html")


@app.get("/api/admin/summary")
def admin_summary():
    products = catalog.list_all()
    low = sum(1 for p in products if int(p.get("stock",0)) <= 10)
    stock_units = sum(int(p.get("stock",0)) for p in products)
    stock_value = sum(float(p.get("stock",0)) * float(p.get("price",0)) for p in products)
    pending_orders = sum(1 for o in ADMIN_DATA["orders"] if o.get("status") in ["Pago","Separando","Pronto para envio"])
    in_transit = sum(1 for s in ADMIN_DATA["shipments"] if s.get("status") == "Em trânsito")
    open_po = sum(1 for o in ADMIN_DATA["purchase_orders"] if o.get("status") not in ["Recebida","Cancelada"])
    sales = sum(float(o.get("total",0)) for o in ADMIN_DATA["orders"] if o.get("status") not in ["Cancelado","Aguardando pagamento"])
    return jsonify({"products":len(products),"stock_units":stock_units,"stock_value":round(stock_value,2),"low_stock":low,"pending_orders":pending_orders,"shipments_in_transit":in_transit,"open_purchase_orders":open_po,"sales":round(sales,2)})


def _num(value, cast, field):
    """Converte número vindo do JSON do painel; devolve (valor, None) ou (None, mensagem de erro)."""
    try:
        return cast(value), None
    except (TypeError, ValueError):
        return None, f"Valor inválido em {field}."


def _product_payload(data, partial):
    """Valida/limpa o corpo enviado pelo painel. Devolve (dados, erro)."""
    out = {}
    for key in ["name", "brand", "category", "finish", "coverage", "description", "image", "icon"]:
        if key in data:
            out[key] = str(data[key] if data[key] is not None else "").strip()
    for key in ["surface", "environments", "purposes", "tags"]:
        if key in data:
            out[key] = data[key]
    if "price" in data:
        out["price"], err = _num(data["price"], float, "preço")
        if err or out["price"] < 0:
            return None, err or "O preço não pode ser negativo."
    if "stock" in data:
        out["stock"], err = _num(data["stock"], int, "estoque")
        if err:
            return None, err
        out["stock"] = max(0, out["stock"])
    if not partial:
        out.setdefault("finish", "Fosco")
        out.setdefault("icon", "paint-roller")
    return out, None


@app.get("/api/admin/products")
def admin_products():
    # Todos os produtos ativos (inclusive sem estoque), direto do banco.
    return jsonify(catalog.list_all(fresh=True))


@app.post("/api/admin/products")
def admin_create_product():
    data=request.get_json(silent=True) or {}
    required=["name","brand","category","price","stock"]
    if any(data.get(k) in [None,""] for k in required):
        return jsonify({"error":"Preencha nome, marca, categoria, preço e estoque."}),400
    payload, err = _product_payload(data, partial=False)
    if err: return jsonify({"error":err}),400
    return jsonify(catalog.create(payload)),201


@app.put("/api/admin/products/<product_id>")
def admin_update_product(product_id):
    data=request.get_json(silent=True) or {}
    payload, err = _product_payload(data, partial=True)
    if err: return jsonify({"error":err}),400
    product=catalog.update(product_id, payload)
    if not product: return jsonify({"error":"Produto não encontrado."}),404
    return jsonify(product)


@app.post("/api/admin/products/<product_id>/stock")
def admin_adjust_stock(product_id):
    data=request.get_json(silent=True) or {}
    delta, err = _num(data.get("delta",0), int, "delta")
    if err: return jsonify({"error":err}),400
    product=catalog.get(product_id, fresh=True)
    if not product: return jsonify({"error":"Produto não encontrado."}),404
    return jsonify(catalog.update(product_id, {"stock": max(0, product["stock"]+delta)}))


@app.delete("/api/admin/products/<product_id>")
def admin_delete_product(product_id):
    if not catalog.delete(product_id): return jsonify({"error":"Produto não encontrado."}),404
    return jsonify({"success":True})


# ------------------------------------------------------------
# Pedidos, ordens de compra, expedições e fornecedores: mesma API para os quatro.
#   GET /api/admin/<coleção>          lista
#   POST /api/admin/<coleção>         cria
#   PUT|PATCH /api/admin/<coleção>/<id>   altera só os campos enviados
#   DELETE /api/admin/<coleção>/<id>  apaga
# Tudo salvo em data/admin_data.json (ADMIN_DATA_FILE). Os produtos ficam no Supabase.
# ------------------------------------------------------------
_TEXT, _INT, _MONEY = "text", "int", "money"
COLLECTIONS = {
    "orders": {"key": "orders", "prefix": "PED", "required": ["customer"],
               "statuses": ["Aguardando pagamento", "Pago", "Separando", "Pronto para envio", "Enviado", "Cancelado"],
               "fields": {"customer": _TEXT, "email": _TEXT, "date": _TEXT, "items": _INT, "total": _MONEY,
                          "payment": _TEXT, "status": _TEXT}},
    "purchase-orders": {"key": "purchase_orders", "prefix": "OC", "required": ["supplier"],
                        "statuses": ["Rascunho", "Enviada", "Em trânsito", "Recebida", "Cancelada"],
                        "fields": {"supplier": _TEXT, "date": _TEXT, "delivery": _TEXT, "items": _INT,
                                   "total": _MONEY, "status": _TEXT}},
    "shipments": {"key": "shipments", "prefix": "ENV", "required": ["order"],
                  "statuses": ["Preparando", "Enviado", "Em trânsito", "Entregue", "Devolvido"],
                  "fields": {"order": _TEXT, "carrier": _TEXT, "tracking": _TEXT, "sent_at": _TEXT, "status": _TEXT}},
    "suppliers": {"key": "suppliers", "prefix": "FOR", "required": ["name"], "statuses": None,
                  "fields": {"name": _TEXT, "contact": _TEXT, "email": _TEXT, "phone": _TEXT, "lead": _INT}},
}


def _clean_row(cfg, data, partial):
    out = {}
    for field, kind in cfg["fields"].items():
        if field not in data:
            continue
        value = data[field]
        if kind == _TEXT:
            out[field] = str(value if value is not None else "").strip()[:200]
        else:
            num, err = _num(value if value not in (None, "") else 0, int if kind == _INT else float, field)
            if err or num < 0:
                return None, err or f"Valor inválido em {field}."
            out[field] = round(num, 2) if kind == _MONEY else num
    if not partial and any(not out.get(f) for f in cfg["required"]):
        return None, "Preencha os campos obrigatórios."
    if partial and any(f in out and not out[f] for f in cfg["required"]):
        return None, "Preencha os campos obrigatórios."
    if cfg["statuses"] and "status" in out and out["status"] not in cfg["statuses"]:
        return None, "Status inválido."
    return out, None


def _register_collection(url, cfg):
    rows = lambda: ADMIN_DATA[cfg["key"]]  # noqa: E731
    name = cfg["key"]

    def list_rows():
        return jsonify(rows())

    def create_row():
        data, err = _clean_row(cfg, request.get_json(silent=True) or {}, partial=False)
        if err:
            return jsonify({"error": err}), 400
        with _ADMIN_LOCK:
            row = {"id": _next_id(cfg["prefix"], rows()), **data}
            if cfg["statuses"]:
                row.setdefault("status", cfg["statuses"][0] if name != "orders" else "Aguardando pagamento")
            if name in ("orders", "purchase_orders"):
                row.setdefault("date", datetime.now().strftime("%Y-%m-%d"))
            _fill_sent_at(name, row)
            rows().insert(0, row)
            _persist_admin()
        return jsonify(row), 201

    def update_row(row_id):
        data, err = _clean_row(cfg, request.get_json(silent=True) or {}, partial=True)
        if err:
            return jsonify({"error": err}), 400
        with _ADMIN_LOCK:
            row = next((r for r in rows() if str(r.get("id")) == row_id), None)
            if not row:
                return jsonify({"error": "Registro não encontrado."}), 404
            row.update(data)
            _fill_sent_at(name, row)
            _persist_admin()
        return jsonify(row)

    def delete_row(row_id):
        with _ADMIN_LOCK:
            kept = [r for r in rows() if str(r.get("id")) != row_id]
            if len(kept) == len(rows()):
                return jsonify({"error": "Registro não encontrado."}), 404
            ADMIN_DATA[cfg["key"]] = kept
            _persist_admin()
        return jsonify({"success": True})

    for fn, suffix, methods in ((list_rows, "", ["GET"]), (create_row, "", ["POST"]),
                                (update_row, "/<row_id>", ["PUT", "PATCH"]), (delete_row, "/<row_id>", ["DELETE"])):
        app.add_url_rule(f"/api/admin/{url}{suffix}", endpoint=f"admin_{name}_{fn.__name__}", view_func=fn, methods=methods)


def _fill_sent_at(name, row):
    if name == "shipments" and row.get("status") in ("Enviado", "Em trânsito") and not row.get("sent_at"):
        row["sent_at"] = datetime.now().strftime("%Y-%m-%d")


for _url, _cfg in COLLECTIONS.items():
    _register_collection(_url, _cfg)


# ============================================================
# ROTAS DE PÁGINAS
# ============================================================

@app.get("/")
def home():
    return render_template("index.html")


@app.get("/produtos")
def produtos():
    return render_template("products.html")


@app.get("/checkout")
def checkout():
    return render_template("checkout.html")


@app.get("/login")
def login():
    # Tela de login do cliente. Somente frontend: a autenticação real
    # (POST /api/login, sessão/JWT) será ligada quando o backend existir.
    return render_template("login.html")


# ============================================================
# API - PRODUTOS
# ------------------------------------------------------------
# A interface consome estas rotas; os dados vêm do catálogo (Supabase).
# ============================================================

@app.after_request
def _no_cache_for_api(response):
    # Preço, estoque e produtos novos têm que chegar na hora: o navegador não guarda respostas da API.
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/admin/catalog-check")
def admin_catalog_check():
    """Mostra o que o servidor lê do banco e por que cada produto aparece (ou não) na loja."""
    try:
        return jsonify(catalog.diagnose())
    except CatalogError as e:
        return jsonify({"error": str(e)}), e.status


@app.get("/api/products")
def api_products():
    available = [p for p in catalog.list_all() if p["stock"] > 0]
    return jsonify(available)


@app.get("/api/products/<product_id>")
def api_product(product_id):
    product = catalog.get(product_id)
    if not product:
        return jsonify({"error": "Produto não encontrado"}), 404
    return jsonify(product)


# ============================================================
# API - RECOMENDAÇÃO
# ------------------------------------------------------------
# Recomendação por regras simples sobre o catálogo real (só produtos com estoque).
# A conversa com IA fica em /api/ai/chat (IA-NAP).
# ============================================================

@app.post("/api/recommend")
def recommend():
    data = request.get_json(silent=True) or {}
    problem = data.get("problem", "").strip().lower()

    if not problem:
        return jsonify({
            "message": "Descreva o ambiente, problema ou ocasião para receber recomendações.",
            "recommendations": []
        }), 400

    keywords = {
        "umidade": ["tratamento", "impermeabilizante", "parede"],
        "mofo": ["tratamento", "impermeabilizante", "parede"],
        "parede": ["parede"],
        "sala": ["parede"],
        "quarto": ["parede"],
        "externa": ["parede"],
        "externo": ["parede"],
        "piso": ["piso"],
        "chão": ["piso"],
        "madeira": ["madeira e metal"],
        "metal": ["madeira e metal"],
        "portão": ["madeira e metal"],
        "ferro": ["madeira e metal"],
        "spray": ["multiuso"],
        "objeto": ["multiuso"],
    }

    categories = set()
    for word, matches in keywords.items():
        if word in problem:
            categories.update(matches)

    if not categories:
        # Recomendação inicial caso a descrição ainda não tenha
        # palavras reconhecidas.
        categories.add("parede")

    recommendations = [
        p for p in catalog.list_all()
        if p["stock"] > 0 and p["category"].lower() in categories
    ]

    # Ordenação simples pelo preço. A futura IA poderá substituir
    # completamente esta lógica.
    recommendations.sort(key=lambda p: p["price"])

    return jsonify({
        "message": "Recomendações para o que você descreveu.",
        "recommendations": recommendations[:4]
    })


# --- INÍCIO integração IA NAP+ ---
# ============================================================
# API - IA NAP+ (assistente inteligente de vendas)
# ------------------------------------------------------------
# Este endpoint NÃO reimplementa a IA: ele só repassa a mensagem
# do cliente para o serviço Node.js isolado em IA-NAP/ (que fala
# com o Gemini) e devolve a resposta para o frontend.
# A chave do Gemini nunca passa por aqui nem pelo navegador.
# O endpoint /api/recommend acima foi mantido intacto.
# ============================================================

@app.post("/api/ai/chat")
def ai_chat():
    client_ip = request.remote_addr or "unknown"

    # Limite por visitante: aqui no Flask, que é quem enxerga o IP de verdade.
    wait = _ai_rate_limit_check(client_ip)
    if wait:
        resp = jsonify({"message": "Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente."})
        resp.status_code = 429
        resp.headers["Retry-After"] = str(wait)
        return resp

    data = request.get_json(silent=True) or {}
    payload = json.dumps({
        "message": data.get("message", ""),
        "history": data.get("history", []),
    }).encode("utf-8")

    req = urllib.request.Request(
        NAP_AI_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            # Repassa o IP do visitante para o Node (que confia nesse cabeçalho só vindo do loopback).
            "X-Forwarded-For": client_ip,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:  # a IA faz 2 chamadas ao Gemini; 30s era pouco
            body = response.read()
            return jsonify(json.loads(body)), response.status
    except urllib.error.HTTPError as e:
        # O serviço da IA respondeu com um erro (ex.: chave do Gemini ausente).
        try:
            return jsonify(json.loads(e.read())), e.code
        except Exception:
            return jsonify({"message": "A assistente inteligente está indisponível no momento."}), e.code
    except urllib.error.URLError:
        # Serviço da IA (Node) fora do ar.
        return jsonify({
            "message": "A assistente inteligente está offline no momento. "
                        "Verifique se o serviço IA-NAP está rodando (veja IA-NAP/README.md)."
        }), 503
    except TimeoutError:
        # A IA demorou demais para responder.
        return jsonify({"message": "A assistente demorou demais para responder. Tente novamente em instantes."}), 504
    except Exception as e:
        # Qualquer outro erro: devolve JSON (e não a página HTML de erro) para o site mostrar uma mensagem amigável.
        print("[Flask] Erro ao falar com a IA-NAP:", repr(e))
        return jsonify({"message": "A assistente inteligente está indisponível no momento."}), 502
# --- FIM integração IA NAP+ ---


# ============================================================
# API - PEDIDO / CHECKOUT
# ------------------------------------------------------------
# Cria o pedido de verdade: confere o estoque no banco, RESERVA as unidades
# (desconta do estoque) e registra o pedido no painel como "Aguardando pagamento".
# Ainda NÃO há gateway de pagamento: a loja confirma o pagamento combinado com o
# cliente (e-mail informado no pedido) e muda o status para "Pago" no painel.
# Dados de cartão nunca passam por aqui. O CPF/CNPJ é exigido mas não é gravado.
# ============================================================
_ORDER_LOCK = threading.Lock()  # um pedido por vez neste processo (evita vender o mesmo estoque duas vezes)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.post("/api/payment")
def payment():
    data = request.get_json(silent=True) or {}
    items = data.get("items", [])
    customer = data.get("customer", {}) if isinstance(data.get("customer"), dict) else {}

    if not isinstance(items, list) or not items:
        return jsonify({"success": False, "message": "Carrinho vazio."}), 400

    name = str(customer.get("name", "")).strip()[:120]
    email = str(customer.get("email", "")).strip()[:120]
    doc_digits = re.sub(r"\D", "", str(customer.get("document", "")))
    if not name or not _EMAIL_RE.match(email) or len(doc_digits) not in (11, 14):
        return jsonify({"success": False, "message": "Informe nome, e-mail e CPF/CNPJ válidos."}), 400

    # Junta linhas repetidas do mesmo produto antes de conferir o estoque.
    wanted = {}
    for item in items:
        if not isinstance(item, dict):
            return jsonify({"success": False, "message": "Item inválido."}), 400
        try:
            quantity = max(1, int(item.get("quantity", 1)))
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Quantidade inválida."}), 400
        key = str(item.get("id"))
        wanted[key] = wanted.get(key, 0) + quantity

    with _ORDER_LOCK:
        # Estoque conferido SEMPRE direto do banco (sem cache), para não vender o que acabou.
        by_id = {str(p["id"]): p for p in catalog.list_all(fresh=True)}
        lines, total = [], 0.0
        for pid, quantity in wanted.items():
            product = by_id.get(pid)
            if not product:
                return jsonify({"success": False, "message": f"Produto {pid} não encontrado."}), 400
            if quantity > product["stock"]:
                return jsonify({"success": False, "message": f"Estoque insuficiente para {product['name']}."}), 400
            subtotal = round(product["price"] * quantity, 2)
            total += subtotal
            lines.append({"id": product["id"], "name": product["name"], "quantity": quantity,
                          "subtotal": subtotal, "_stock": product["stock"]})

        # Reserva o estoque; se algum desconto falhar, devolve os que já foram descontados.
        done = []
        try:
            for line in lines:
                catalog.update(line["id"], {"stock": line["_stock"] - line["quantity"]})
                done.append(line)
        except Exception:
            for line in done:
                try:
                    catalog.update(line["id"], {"stock": line["_stock"]})
                except Exception:
                    pass
            raise

        public_lines = [{k: v for k, v in l.items() if k != "_stock"} for l in lines]
        with _ADMIN_LOCK:
            order = {
                "id": _next_id("PED", ADMIN_DATA["orders"]),
                "customer": name,
                "email": email,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "total": round(total, 2),
                "status": "Aguardando pagamento",
                "items": sum(l["quantity"] for l in lines),
                "payment": "A combinar",
                "lines": public_lines,
            }
            ADMIN_DATA["orders"].insert(0, order)
            _persist_admin()

    return jsonify({
        "success": True,
        "status": "pending",
        "message": "Pedido recebido! Ele fica aguardando a confirmação do pagamento.",
        "order": {"id": order["id"], "customer": {"name": name, "email": email},
                  "items": public_lines, "total": order["total"]},
    })


if __name__ == "__main__":
    # debug só com FLASK_DEBUG=1: o depurador do Werkzeug não pode ficar ligado por padrão
    # agora que o app tem credenciais do banco no ambiente.
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")