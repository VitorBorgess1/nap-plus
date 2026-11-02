"""catalog.py - acesso ao catálogo de produtos no Supabase.

O banco usa nomes em português (tabelas `produtos` + `estoque`); o site e a IA
usam o formato antigo do products.json (em inglês). Este módulo faz a tradução
nos dois sentidos, para que nenhum template ou JS precise mudar.
"""

# coluna no banco -> campo usado pelo site
_DB_TO_APP = {
    "id": "id",
    "nome": "name",
    "marca": "brand",
    "categoria": "category",
    "acabamento": "finish",
    "preco": "price",
    "rendimento": "coverage",
    "descricao": "description",
    "imagem_url": "image",
    "icone": "icon",
    "superficies": "surface",
    "ambientes": "environments",
    "finalidades": "purposes",
    "tags": "tags",
}
_APP_TO_DB = {v: k for k, v in _DB_TO_APP.items()}
_LIST_FIELDS = {"surface", "environments", "purposes", "tags"}


def _to_app(row):
    product = {app_key: row.get(db_key) for db_key, app_key in _DB_TO_APP.items()}
    product["price"] = float(product["price"] or 0)
    for key in _LIST_FIELDS:
        product[key] = product[key] or []
    for key in ("category", "finish", "coverage", "description", "image", "icon"):
        product[key] = product[key] or ""
    estoque = row.get("estoque")
    if isinstance(estoque, list):  # relação 1:1 pode vir como lista
        estoque = estoque[0] if estoque else None
    product["stock"] = int((estoque or {}).get("quantidade") or 0)
    return product


def fetch_products(sb):
    """Todos os produtos ativos, já no formato do site."""
    res = (
        sb.table("produtos")
        .select("*, estoque(quantidade)")
        .eq("ativo", True)
        .order("id")
        .execute()
    )
    return [_to_app(r) for r in res.data]


def create_product(sb, product):
    """Insere um produto novo; o id é gerado pelo banco e devolvido."""
    row = {db: product.get(app) for app, db in _APP_TO_DB.items() if app in product and app != "id"}
    new_id = sb.table("produtos").insert(row).execute().data[0]["id"]
    sb.table("estoque").insert(
        {"produto_id": new_id, "quantidade": max(0, int(product.get("stock", 0)))}
    ).execute()
    return new_id


def save_product(sb, product):
    """Cria ou atualiza o produto e o estoque dele."""
    row = {db: product.get(app) for app, db in _APP_TO_DB.items() if app in product}
    row["ativo"] = True
    sb.table("produtos").upsert(row, on_conflict="id").execute()
    sb.table("estoque").upsert(
        {"produto_id": product["id"], "quantidade": max(0, int(product.get("stock", 0)))},
        on_conflict="produto_id",
    ).execute()


def deactivate_product(sb, product_id):
    """Exclusão lógica: some do catálogo, mas preserva o histórico de pedidos."""
    sb.table("produtos").update({"ativo": False}).eq("id", product_id).execute()
