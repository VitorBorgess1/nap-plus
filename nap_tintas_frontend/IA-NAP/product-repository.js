// product-repository.js - ÚNICO ponto que sabe DE ONDE vêm os produtos.
// A IA nunca lê products.json nem o Supabase direto: ela pede ao "repositório" (listAll / getById).
// Fontes disponíveis (escolhida por PRODUCTS_SOURCE no .env): "json" (arquivo local) e "supabase" (banco).

const fs = require("fs"); // módulo nativo para ler arquivos

// Nomes alternativos aceitos para cada campo (caso a tabela do Supabase use colunas em português).
const FIELD_ALIASES = {
  id: ["id", "product_id", "produto_id"],
  name: ["name", "nome", "title", "titulo"],
  brand: ["brand", "marca"],
  category: ["category", "categoria"],
  finish: ["finish", "acabamento"],
  price: ["price", "preco", "preço", "valor"],
  stock: ["stock", "estoque", "quantity", "quantidade", "qtd"],
  coverage: ["coverage", "rendimento", "cobertura"],
  description: ["description", "descricao", "descrição"],
  image: ["image", "imagem", "image_url", "imagem_url", "foto"],
  icon: ["icon", "icone", "ícone"],
  surface: ["surface", "surfaces", "superficie", "superficies", "superfície", "superfícies"],
  environments: ["environments", "environment", "ambientes", "ambiente"],
  purposes: ["purposes", "purpose", "finalidades", "finalidade"],
  tags: ["tags", "tag"],
};
// Colunas que não interessam à IA como "característica" (técnicas ou só visuais).
const IGNORED_COLUMNS = ["created_at", "updated_at", "deleted_at", "inserted_at", "criado_em", "atualizado_em", "user_id", "slug", "active", "ativo", "is_active", "ativa"];
const KNOWN_COLUMNS = new Set([...Object.values(FIELD_ALIASES).flat(), ...IGNORED_COLUMNS]);

// Pega o primeiro valor existente entre os nomes possíveis da coluna.
function pick(row, names) {
  for (const n of names) if (row[n] !== undefined && row[n] !== null) return row[n];
  return undefined;
}

// Converte "R$ 189,90" / "189.90" / 189.9 em número.
function toNumber(value) {
  if (typeof value === "number") return value;
  const s = String(value ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Aceita lista de verdade, texto JSON ('["a","b"]') ou texto separado por vírgula ("a, b").
function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  const t = value.trim();
  if (t.startsWith("[")) {
    try { return toList(JSON.parse(t)); } catch { /* cai para a separação por vírgula */ }
  }
  return t.replace(/^[{[]|[}\]]$/g, "").split(/[,;|]/).map((v) => v.replace(/^"|"$/g, "").trim()).filter(Boolean);
}

// Colunas extras (ex.: "tempo_secagem", "diluicao", "cores") viram "details" e a IA pode usá-las nas respostas.
function extractDetails(row) {
  const details = {};
  for (const [key, value] of Object.entries(row)) {
    if (KNOWN_COLUMNS.has(key) || value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    details[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return details;
}

// Garante que cada produto tenha os campos no formato esperado (sem alterar a fonte original).
function normalizeProduct(p) {
  const get = (field) => pick(p, FIELD_ALIASES[field]);
  return {
    ...p, // mantém todos os campos originais do produto, exatamente como estão
    id: get("id"),
    name: String(get("name") ?? ""),
    brand: String(get("brand") ?? ""),
    category: String(get("category") ?? ""),
    finish: String(get("finish") ?? ""),
    coverage: String(get("coverage") ?? ""),
    description: String(get("description") ?? ""),
    image: get("image") ?? "",
    icon: get("icon") ?? "",
    price: toNumber(get("price")), // preço sempre número
    stock: toNumber(get("stock")), // estoque sempre número (vazio/inválido vira 0 = sem estoque)
    surface: toList(get("surface")), // listas sempre são arrays
    environments: toList(get("environments")),
    purposes: toList(get("purposes")),
    tags: toList(get("tags")),
    details: extractDetails(p), // colunas extras do banco (características adicionais)
  };
}

// Ignora produtos marcados como inativos (se a tabela tiver essa coluna).
function isActive(row) {
  const flag = pick(row, ["active", "ativo", "is_active", "ativa"]);
  return flag === undefined || flag === null || !(flag === false || flag === "false" || flag === 0);
}

// Repositório que lê de um arquivo JSON (fonte de testes).
class JsonProductRepository {
  constructor(filePath, fallbackFilePath) {
    this.filePath = filePath; // arquivo principal (data/products.json do site)
    this.fallbackFilePath = fallbackFilePath; // cópia de teste dentro da IA-NAP
  }

  // Lê o arquivo A CADA chamada: assim, se o admin mudar o estoque, a IA já enxerga.
  async listAll() {
    const file = fs.existsSync(this.filePath) ? this.filePath : this.fallbackFilePath; // escolhe o arquivo que existe
    const raw = await fs.promises.readFile(file, "utf-8"); // lê o texto do arquivo
    return JSON.parse(raw).map(normalizeProduct); // converte o texto em lista de produtos normalizados
  }

  // Busca um produto pelo id (retorna null se não existir).
  async getById(id) {
    const all = await this.listAll(); // pega todos
    return all.find((p) => String(p.id) === String(id)) || null; // procura o id
  }
}

// Repositório que lê do Supabase pela API REST (PostgREST). Não precisa instalar nada: usa o fetch do Node 18+.
class SupabaseProductRepository {
  constructor({ url, key, table, stockTable = "", cacheSeconds = 10, fetchImpl = globalThis.fetch }) {
    if (!url || !key) {
      throw new Error("PRODUCTS_SOURCE=supabase exige SUPABASE_URL e SUPABASE_KEY no arquivo .env da IA-NAP.");
    }
    this.url = url;
    this.key = key;
    this.table = table;
    this.stockTable = stockTable; // tabela separada de estoque (opcional)
    this.cacheMs = Math.max(0, cacheSeconds) * 1000;
    this.fetch = fetchImpl;
    this.cache = null; // { at, products }
  }

  // Lê todas as linhas de uma tabela do Supabase (API REST), com mensagens de erro claras.
  async fetchTable(table) {
    const endpoint = `${this.url}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1000`;
    let res;
    try {
      res = await this.fetch(endpoint, {
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000), // não deixa o cliente esperando para sempre
      });
    } catch (err) {
      throw new Error(`Não foi possível conectar ao Supabase (${err.message}). Confira SUPABASE_URL.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const hint =
        body.includes("PGRST125") ? "A SUPABASE_URL está com caminho extra. Use só https://SEU-PROJETO.supabase.co (sem /rest/v1 e sem nada depois)."
        : res.status === 404 ? `Tabela "${table}" não encontrada ou não exposta na Data API (confira o nome e "Exposed tables").`
        : res.status === 401 || res.status === 403 ? `Acesso recusado à tabela "${table}" (confira SUPABASE_KEY, a policy de SELECT e "Exposed tables").`
        : "";
      throw new Error(`Supabase respondeu ${res.status}. ${hint} ${body.slice(0, 200)}`.trim());
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`Resposta inesperada do Supabase para "${table}" (não é uma lista).`);
    // Tabela vazia (ou RLS sem policy de leitura) devolve lista vazia: avisa no terminal para facilitar o diagnóstico.
    if (!rows.length) console.warn(`[IA-NAP] A tabela "${table}" voltou vazia. Se ela tem dados, falta uma policy de SELECT (RLS).`);
    return rows;
  }

  // Busca os produtos (e o estoque) no Supabase, com cache curto para não consultar o banco a cada mensagem.
  async listAll() {
    if (this.cache && Date.now() - this.cache.at < this.cacheMs) return this.cache.products;

    // Busca produtos e estoque ao mesmo tempo.
    const [rows, stockRows] = await Promise.all([
      this.fetchTable(this.table),
      this.stockTable ? this.fetchTable(this.stockTable) : Promise.resolve(null),
    ]);

    // Soma a quantidade por produto (se houver mais de uma linha de estoque para o mesmo produto).
    let stockByProduct = null;
    if (stockRows) {
      stockByProduct = new Map();
      for (const r of stockRows) {
        const pid = String(pick(r, ["produto_id", "product_id"]) ?? "");
        const qty = toNumber(pick(r, ["quantidade", "quantity", "qtd", "estoque", "stock"]));
        if (pid) stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + qty);
      }
    }

    const products = rows
      .filter(isActive)
      // Produto sem linha na tabela de estoque = 0 unidades (indisponível).
      .map((r) => normalizeProduct(stockByProduct ? { ...r, stock: stockByProduct.get(String(r.id)) ?? 0 } : r));
    this.cache = { at: Date.now(), products };
    return products;
  }

  // Busca um produto pelo id (retorna null se não existir).
  async getById(id) {
    const all = await this.listAll();
    return all.find((p) => String(p.id) === String(id)) || null;
  }
}

// Fábrica: decide qual repositório usar conforme PRODUCTS_SOURCE no .env.
function createProductRepository(config) {
  if (config.productsSource === "json") {
    return new JsonProductRepository(config.productsFile, config.productsTestFile);
  }
  if (config.productsSource === "supabase") {
    return new SupabaseProductRepository({
      url: config.supabaseUrl,
      key: config.supabaseKey,
      table: config.supabaseTable,
      stockTable: config.supabaseStockTable,
      cacheSeconds: config.supabaseCacheSeconds,
    });
  }
  throw new Error(`PRODUCTS_SOURCE="${config.productsSource}" inválido. Use "json" ou "supabase".`);
}

module.exports = { JsonProductRepository, SupabaseProductRepository, createProductRepository, normalizeProduct };