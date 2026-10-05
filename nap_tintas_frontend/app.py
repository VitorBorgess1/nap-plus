from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ============================================================
# CAMADA DE DADOS TEMPORÁRIA
# ------------------------------------------------------------
# Sem banco de dados nesta versão.
# Futuramente, substitua este catálogo por um Repository/DAO
# conectado ao banco, sem precisar alterar o frontend.
# ============================================================

# Obs.: o campo "icon" guarda o NOME de um ícone da biblioteca Lucide
# (ex.: "house", "sofa", "spray-can"). Os ícones disponíveis estão em
# templates/partials/_icons.html — veja o README para adicionar novos.
PRODUCTS = [
    {
        "id": 1,
        "name": "Suvinil Fosco Completo",
        "brand": "Suvinil",
        "category": "Parede",
        "finish": "Fosco",
        "price": 189.90,
        "stock": 12,
        "coverage": "Até 350 m² por lata",
        "description": "Tinta acrílica fosca para paredes, com cobertura e acabamento uniforme.",
        "image": "https://down-br.img.susercontent.com/file/sg-11134201-7rbmu-lmqfhxvhxwwg8c",
        "icon": "house",
        "surface": ["Parede", "Alvenaria"],
        "environments": ["Sala", "Quarto", "Fachada"],
        "purposes": ["Pintura interna", "Pintura externa", "Mudar a cor"],
        "tags": ["tinta para parede", "parede", "fachada", "cor"]
    },
    {
        "id": 2,
        "name": "Suvinil Toque Fosco Completo",
        "brand": "Suvinil",
        "category": "Parede",
        "finish": "Fosco",
        "price": 119.90,
        "stock": 25,
        "coverage": "Até 250 m² por lata",
        "description": "Tinta fosca para paredes e tetos, indicada para ambientes internos e externos preparados.",
        "image": "https://down-br.img.susercontent.com/file/sg-11134201-7rdwc-lxtpae1z8ebq2a",
        "icon": "sofa",
        "surface": ["Parede", "Alvenaria"],
        "environments": ["Sala", "Quarto"],
        "purposes": ["Pintura interna", "Mudar a cor"],
        "tags": ["tinta para parede", "parede", "econômica", "cor"]
    },
    {
        "id": 3,
        "name": "Suvinil Cor & Proteção Fosco",
        "brand": "Suvinil",
        "category": "Madeira e Metal",
        "finish": "Brilhante",
        "price": 149.90,
        "stock": 8,
        "coverage": "Até 70 m² por lata",
        "description": "Esmalte fosco para madeira e metais, indicado para ambientes internos e externos.",
        "image": "https://loja.suvinil.com.br/_next/image?q=75&url=https%3A%2F%2Fdigitalprdaddc4dsa.blob.core.windows.net%2Fdigital-products-img%2Fproducts%2F39%2Fimage%2Fdisplay%2F34%2F1.webp%3Fsv%3D2026-02-06%26spr%3Dhttps%26st%3D2026-09-20T01%253A44%253A53Z%26se%3D2026-10-20T01%253A49%253A53Z%26sr%3Db%26sp%3Dr%26sig%3DHWi4qToDn6fGV52LvJUjPF0x3bgmGifWoL9f22ebkvo%253D&w=1920",
        "icon": "hammer",
        "surface": ["Madeira", "Metal"],
        "environments": ["Portão", "Móveis"],
        "purposes": ["Pintar portão", "Pintar móvel", "Retoque"],
        "tags": ["madeira", "metal", "portão", "móvel", "esmalte"]
    },
    {
        "id": 4,
        "name": "Borracha Líquida Elástica Quartzolit",
        "brand": "Quartzolit",
        "category": "Piso",
        "finish": "Acetinado",
        "price": 169.90,
        "stock": 6,
        "coverage": "Até 90 m² por lata",
        "description": "Impermeabilizante elástico para paredes e fachadas, com proteção contra umidade e chuva.",
        "image": "https://www.quartzolit.weber/files/br/styles/768x768_resize/public/pictures/2026-01/AF_3D_Borracha_Lquida_3_6kg_PNG_C9D50AD5B9ED4EB183CDD82A02C27D47.jpg.webp?cb=21d84746&itok=EnMGA2VH",
        "icon": "shield-check",
        "surface": ["Piso", "Concreto"],
        "environments": ["Garagem", "Calçada", "Quadra"],
        "purposes": ["Pintar piso", "Alta resistência"],
        "tags": ["piso", "garagem", "concreto", "calçada"]
    },
    {
        "id": 5,
        "name": "Impermeabilizante para Parede",
        "brand": "Quartzolit",
        "category": "Tratamento",
        "finish": "Fosco",
        "price": 139.90,
        "stock": 10,
        "coverage": "Até 60 m² por lata",
        "description": "Auxilia no tratamento de umidade e proteção de superfícies.",
        "image": "https://www.quartzolit.weber/files/br/styles/768x768_resize/public/pictures/2026-01/AF_3D_Borracha_Lquida_3_6kg_PNG_C9D50AD5B9ED4EB183CDD82A02C27D47.jpg.webp?cb=21d84746&itok=EnMGA2VH",
        "icon": "shield-check",
        "surface": ["Parede", "Alvenaria"],
        "environments": ["Banheiro", "Cozinha", "Fachada"],
        "purposes": ["Umidade", "Infiltração", "Proteção"],
        "tags": ["umidade", "infiltração", "mofo", "impermeabilizante"]
    },
    {
        "id": 6,
        "name": "Tinta Spray Multiuso",
        "brand": "Colorgin",
        "category": "Multiuso",
        "finish": "Brilhante",
        "price": 39.90,
        "stock": 30,
        "coverage": "Até 2 m² por lata",
        "description": "Spray para pequenos projetos e objetos diversos.",
        "image": "https://loja.suvinil.com.br/_next/image?q=75&url=https%3A%2F%2Fdigitalprdaddc4dsa.blob.core.windows.net%2Fdigital-products-img%2Fproducts%2F39%2Fimage%2Fdisplay%2F34%2F1.webp%3Fsv%3D2026-02-06%26spr%3Dhttps%26st%3D2026-09-20T01%253A44%253A53Z%26se%3D2026-10-20T01%253A49%253A53Z%26sr%3Db%26sp%3Dr%26sig%3DHWi4qToDn6fGV52LvJUjPF0x3bgmGifWoL9f22ebkvo%253D&w=1920",
        "icon": "spray-can",
        "surface": ["Metal", "Madeira", "Plástico"],
        "environments": ["Móveis", "Objetos"],
        "purposes": ["Retoque", "Pequenos projetos"],
        "tags": ["spray", "multiuso", "retoque", "objetos"]
    }
]


# ============================================================
# ARMAZENAMENTO PERSISTENTE DO PROTÓTIPO ADMIN
# ============================================================
from pathlib import Path
import json
import re
from datetime import datetime

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)
PRODUCTS_FILE = DATA_DIR / "products.json"
ADMIN_FILE = DATA_DIR / "admin_data.json"


def _save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_json(path, default):
    if not path.exists():
        _save_json(path, default)
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

# Mantém o catálogo inicial do código como seed e passa a persistir as alterações.
if PRODUCTS_FILE.exists():
    PRODUCTS = _load_json(PRODUCTS_FILE, PRODUCTS)
else:
    _save_json(PRODUCTS_FILE, PRODUCTS)

ADMIN_DATA = _load_json(ADMIN_FILE, {
    "orders": [
        {"id":"PED-1001","customer":"Mariana Souza","date":"2026-09-19","total":379.80,"status":"Separando","items":2,"payment":"Pix"},
        {"id":"PED-1002","customer":"Carlos Lima","date":"2026-09-20","total":169.90,"status":"Pago","items":1,"payment":"Cartão"},
        {"id":"PED-1003","customer":"Ana Oliveira","date":"2026-09-20","total":289.70,"status":"Enviado","items":3,"payment":"Pix"}
    ],
    "purchase_orders": [
        {"id":"OC-2001","supplier":"Suvinil","date":"2026-09-18","delivery":"2026-09-24","status":"Em trânsito","items":40,"total":5400.00},
        {"id":"OC-2002","supplier":"Quartzolit","date":"2026-09-20","delivery":"2026-09-26","status":"Rascunho","items":24,"total":3120.00}
    ],
    "shipments": [
        {"id":"ENV-3001","order":"PED-1003","carrier":"Correios","tracking":"BR123456789","status":"Em trânsito","sent_at":"2026-09-20"}
    ],
    "suppliers": [
        {"id":1,"name":"Suvinil","contact":"Comercial","lead_time":"5 dias"},
        {"id":2,"name":"Quartzolit","contact":"Distribuidor regional","lead_time":"6 dias"},
        {"id":3,"name":"Colorgin","contact":"Comercial","lead_time":"4 dias"}
    ]
})


def _persist_admin():
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
    # Tela visual de login. Autenticação ainda não está implementada.
    return render_template("admin_login.html")


@app.get("/admin")
def admin():
    return render_template("admin.html")


@app.get("/api/admin/summary")
def admin_summary():
    low = sum(1 for p in PRODUCTS if int(p.get("stock",0)) <= 10)
    stock_units = sum(int(p.get("stock",0)) for p in PRODUCTS)
    stock_value = sum(float(p.get("stock",0)) * float(p.get("price",0)) for p in PRODUCTS)
    pending_orders = sum(1 for o in ADMIN_DATA["orders"] if o.get("status") in ["Pago","Separando","Pronto para envio"])
    in_transit = sum(1 for s in ADMIN_DATA["shipments"] if s.get("status") == "Em trânsito")
    open_po = sum(1 for o in ADMIN_DATA["purchase_orders"] if o.get("status") not in ["Recebida","Cancelada"])
    sales = sum(float(o.get("total",0)) for o in ADMIN_DATA["orders"])
    return jsonify({"products":len(PRODUCTS),"stock_units":stock_units,"stock_value":round(stock_value,2),"low_stock":low,"pending_orders":pending_orders,"shipments_in_transit":in_transit,"open_purchase_orders":open_po,"sales":round(sales,2)})


@app.get("/api/admin/products")
def admin_products():
    return jsonify(PRODUCTS)


@app.post("/api/admin/products")
def admin_create_product():
    data=request.get_json(silent=True) or {}
    required=["name","brand","category","price","stock"]
    if any(data.get(k) in [None,""] for k in required):
        return jsonify({"error":"Preencha nome, marca, categoria, preço e estoque."}),400
    new_id=max([int(p.get("id",0)) for p in PRODUCTS] or [0])+1
    product={
        "id":new_id,"name":data["name"].strip(),"brand":data["brand"].strip(),"category":data["category"],
        "finish":data.get("finish","Fosco"),"price":float(data["price"]),"stock":max(0,int(data["stock"])),
        "coverage":data.get("coverage",""),"description":data.get("description","").strip(),"image":data.get("image",""),
        "icon":data.get("icon","paint-roller"),"surface":data.get("surface",[]),"environments":data.get("environments",[]),
        "purposes":data.get("purposes",[]),"tags":data.get("tags",[])
    }
    PRODUCTS.append(product); _save_json(PRODUCTS_FILE, PRODUCTS)
    return jsonify(product),201


@app.put("/api/admin/products/<int:product_id>")
def admin_update_product(product_id):
    product=next((p for p in PRODUCTS if p["id"]==product_id),None)
    if not product: return jsonify({"error":"Produto não encontrado."}),404
    data=request.get_json(silent=True) or {}
    for key in ["name","brand","category","finish","coverage","description","image","icon"]:
        if key in data: product[key]=data[key]
    for key in ["price"]:
        if key in data: product[key]=float(data[key])
    if "stock" in data: product["stock"]=max(0,int(data["stock"]))
    _save_json(PRODUCTS_FILE, PRODUCTS)
    return jsonify(product)


@app.post("/api/admin/products/<int:product_id>/stock")
def admin_adjust_stock(product_id):
    product=next((p for p in PRODUCTS if p["id"]==product_id),None)
    if not product: return jsonify({"error":"Produto não encontrado."}),404
    data=request.get_json(silent=True) or {}
    delta=int(data.get("delta",0)); product["stock"]=max(0,int(product.get("stock",0))+delta)
    _save_json(PRODUCTS_FILE, PRODUCTS)
    return jsonify(product)


@app.delete("/api/admin/products/<int:product_id>")
def admin_delete_product(product_id):
    global PRODUCTS
    before=len(PRODUCTS); PRODUCTS=[p for p in PRODUCTS if p["id"]!=product_id]
    if len(PRODUCTS)==before: return jsonify({"error":"Produto não encontrado."}),404
    _save_json(PRODUCTS_FILE, PRODUCTS)
    return jsonify({"success":True})


@app.get("/api/admin/orders")
def admin_orders(): return jsonify(ADMIN_DATA["orders"])


@app.patch("/api/admin/orders/<order_id>")
def admin_update_order(order_id):
    order=next((o for o in ADMIN_DATA["orders"] if o["id"]==order_id),None)
    if not order: return jsonify({"error":"Pedido não encontrado."}),404
    data=request.get_json(silent=True) or {}; order["status"]=data.get("status",order["status"]); _persist_admin(); return jsonify(order)


@app.post("/api/admin/orders")
def admin_create_order():
    data=request.get_json(silent=True) or {}
    order={"id":_next_id("PED",ADMIN_DATA["orders"]),"customer":data.get("customer","Cliente"),"date":datetime.now().strftime("%Y-%m-%d"),"total":float(data.get("total",0)),"status":"Pago","items":int(data.get("items",1)),"payment":data.get("payment","Pix")}
    ADMIN_DATA["orders"].insert(0,order); _persist_admin(); return jsonify(order),201


@app.get("/api/admin/purchase-orders")
def admin_purchase_orders(): return jsonify(ADMIN_DATA["purchase_orders"])


@app.post("/api/admin/purchase-orders")
def admin_create_purchase_order():
    data=request.get_json(silent=True) or {}
    po={"id":_next_id("OC",ADMIN_DATA["purchase_orders"]),"supplier":data.get("supplier","Fornecedor"),"date":datetime.now().strftime("%Y-%m-%d"),"delivery":data.get("delivery",""),"status":"Rascunho","items":int(data.get("items",0)),"total":float(data.get("total",0))}
    ADMIN_DATA["purchase_orders"].insert(0,po); _persist_admin(); return jsonify(po),201


@app.patch("/api/admin/purchase-orders/<po_id>")
def admin_update_purchase_order(po_id):
    po=next((o for o in ADMIN_DATA["purchase_orders"] if o["id"]==po_id),None)
    if not po: return jsonify({"error":"Ordem de compra não encontrada."}),404
    data=request.get_json(silent=True) or {}; po.update({k:data[k] for k in ["status","supplier","delivery","items","total"] if k in data}); _persist_admin(); return jsonify(po)


@app.get("/api/admin/shipments")
def admin_shipments(): return jsonify(ADMIN_DATA["shipments"])


@app.post("/api/admin/shipments")
def admin_create_shipment():
    data=request.get_json(silent=True) or {}
    shipment={"id":_next_id("ENV",ADMIN_DATA["shipments"]),"order":data.get("order","PED-0000"),"carrier":data.get("carrier","Correios"),"tracking":data.get("tracking",""),"status":"Preparando","sent_at":""}
    ADMIN_DATA["shipments"].insert(0,shipment); _persist_admin(); return jsonify(shipment),201


@app.patch("/api/admin/shipments/<shipment_id>")
def admin_update_shipment(shipment_id):
    shipment=next((s for s in ADMIN_DATA["shipments"] if s["id"]==shipment_id),None)
    if not shipment: return jsonify({"error":"Envio não encontrado."}),404
    data=request.get_json(silent=True) or {}; shipment.update({k:data[k] for k in ["status","carrier","tracking"] if k in data})
    if shipment.get("status")=="Enviado" and not shipment.get("sent_at"): shipment["sent_at"]=datetime.now().strftime("%Y-%m-%d")
    _persist_admin(); return jsonify(shipment)


@app.get("/api/admin/suppliers")
def admin_suppliers(): return jsonify(ADMIN_DATA["suppliers"])


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
# A interface já consome uma API. No futuro, essas rotas podem
# consultar um banco sem mudar a estrutura do frontend.
# ============================================================

@app.get("/api/products")
def api_products():
    available = [p for p in PRODUCTS if p["stock"] > 0]
    return jsonify(available)


@app.get("/api/products/<int:product_id>")
def api_product(product_id):
    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if not product:
        return jsonify({"error": "Produto não encontrado"}), 404
    return jsonify(product)


# ============================================================
# API - RECOMENDAÇÃO
# ------------------------------------------------------------
# MVP sem banco e sem serviço externo de IA.
# Esta função é um PLACEHOLDER para o futuro módulo de IA.
#
# Futuramente:
# 1. Receber descrição do cliente.
# 2. Enviar para um serviço/modelo de IA.
# 3. Cruzar a resposta com produtos/estoque.
# 4. Retornar recomendações.
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
        # palavras reconhecidas pelo MVP.
        categories.add("parede")

    recommendations = [
        p for p in PRODUCTS
        if p["stock"] > 0 and p["category"].lower() in categories
    ]

    # Ordenação simples pelo preço. A futura IA poderá substituir
    # completamente esta lógica.
    recommendations.sort(key=lambda p: p["price"])

    return jsonify({
        "message": "Recomendações geradas pelo protótipo.",
        "recommendations": recommendations[:4]
    })


# ============================================================
# API - PAGAMENTO / CHECKOUT
# ------------------------------------------------------------
# NÃO processa dinheiro de verdade.
# É um endpoint demonstrativo preparado para receber futuramente
# uma integração com um gateway de pagamento.
# ============================================================

@app.post("/api/payment")
def payment():
    data = request.get_json(silent=True) or {}
    items = data.get("items", [])
    customer = data.get("customer", {})

    if not items:
        return jsonify({"success": False, "message": "Carrinho vazio."}), 400

    total = 0
    validated_items = []

    for item in items:
        product = next(
            (p for p in PRODUCTS if p["id"] == item.get("id")),
            None
        )

        if not product:
            return jsonify({
                "success": False,
                "message": f"Produto {item.get('id')} não encontrado."
            }), 400

        quantity = max(1, int(item.get("quantity", 1)))

        if quantity > product["stock"]:
            return jsonify({
                "success": False,
                "message": f"Estoque insuficiente para {product['name']}."
            }), 400

        subtotal = product["price"] * quantity
        total += subtotal

        validated_items.append({
            "id": product["id"],
            "name": product["name"],
            "quantity": quantity,
            "subtotal": round(subtotal, 2)
        })

    # Em produção, aqui entraria o gateway de pagamento.
    # Nunca envie dados de cartão diretamente para este servidor.
    return jsonify({
        "success": True,
        "status": "pending",
        "message": "Pedido criado no modo demonstrativo.",
        "order": {
            "id": "NAP-DEMO-001",
            "customer": customer,
            "items": validated_items,
            "total": round(total, 2)
        }
    })


if __name__ == "__main__":
    app.run(debug=True)
