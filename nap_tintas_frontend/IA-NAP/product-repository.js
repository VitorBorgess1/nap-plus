// product-repository.js - ÚNICO ponto que sabe DE ONDE vêm os produtos.
// A IA nunca lê products.json direto: ela pede ao "repositório" (listAll / getById).
// Fontes disponíveis: "json" (arquivo local) e "supabase" (banco), escolhidas por PRODUCTS_SOURCE.

const fs = require("fs"); // módulo nativo para ler arquivos

// Garante que cada produto tenha os campos no formato esperado (sem alterar o arquivo original).
function normalizeProduct(p) {
  return {
    ...p, // mantém todos os campos originais do produto, exatamente como estão
    price: Number(p.price) || 0, // preço sempre número
    stock: Number(p.stock) || 0, // estoque sempre número (vazio/inválido vira 0 = sem estoque)
    surface: Array.isArray(p.surface) ? p.surface : [], // listas sempre são arrays
    environments: Array.isArray(p.environments) ? p.environments : [],
    purposes: Array.isArray(p.purposes) ? p.purposes : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

// Repositório que lê de um arquivo JSON (fonte de testes atual).
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
    return all.find((p) => p.id === Number(id)) || null; // procura o id
  }
}

// Converte uma linha do banco (nomes em português) para o formato do products.json.
function fromSupabaseRow(r) {
  const estoque = Array.isArray(r.estoque) ? r.estoque[0] : r.estoque; // relação 1:1
  return normalizeProduct({
    id: r.id,
    name: r.nome,
    brand: r.marca,
    category: r.categoria || "",
    finish: r.acabamento || "",
    price: r.preco,
    stock: estoque ? estoque.quantidade : 0,
    coverage: r.rendimento || "",
    description: r.descricao || "",
    image: r.imagem_url || "",
    icon: r.icone || "",
    surface: r.superficies,
    environments: r.ambientes,
    purposes: r.finalidades,
    tags: r.tags,
  });
}

// Repositório que lê do Supabase pela API REST (fetch nativo do Node 18+, sem dependência nova).
// Só faz leitura: a chave publishable basta, pois produtos/estoque têm policy de leitura pública.
class SupabaseProductRepository {
  constructor(url, key, cacheMs = 30000) {
    if (!url || !key) throw new Error("PRODUCTS_SOURCE=supabase exige SUPABASE_URL e SUPABASE_KEY no .env.");
    this.endpoint = `${url.replace(/\/$/, "")}/rest/v1/produtos?select=*,estoque(quantidade)&ativo=eq.true&order=id`;
    this.headers = { apikey: key, Authorization: `Bearer ${key}` };
    this.cacheMs = cacheMs; // evita uma consulta ao banco a cada mensagem do chat
    this.cache = null;
    this.cachedAt = 0;
  }

  async listAll() {
    if (this.cache && Date.now() - this.cachedAt < this.cacheMs) return this.cache;
    try {
      const res = await fetch(this.endpoint, { headers: this.headers });
      if (!res.ok) throw new Error(`Supabase respondeu ${res.status}: ${await res.text()}`);
      this.cache = (await res.json()).map(fromSupabaseRow);
      this.cachedAt = Date.now();
    } catch (err) {
      if (!this.cache) throw err; // sem nada em memória: deixa o erro aparecer
      console.warn("[IA-NAP] Falha ao atualizar catálogo, usando o último carregado:", err.message);
    }
    return this.cache;
  }

  async getById(id) {
    const all = await this.listAll();
    return all.find((p) => p.id === Number(id)) || null;
  }
}

// Fábrica: decide qual repositório usar conforme PRODUCTS_SOURCE no .env.
function createProductRepository(config) {
  if (config.productsSource === "json") {
    return new JsonProductRepository(
      config.productsFile,
      config.productsTestFile
    );
  }

  if (config.productsSource === "supabase") {
    return new SupabaseProductRepository(
      config.supabaseUrl,
      config.supabaseKey
    );
  }

  throw new Error(
    `PRODUCTS_SOURCE="${config.productsSource}" inválido. Use "json" ou "supabase".`
  );
}

module.exports = {
  JsonProductRepository,
  SupabaseProductRepository,
  createProductRepository,
  normalizeProduct,
  fromSupabaseRow,
};
