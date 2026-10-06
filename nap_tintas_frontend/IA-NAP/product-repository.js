// product-repository.js - ÚNICO ponto que sabe DE ONDE vêm os produtos.
// A IA nunca lê products.json direto: ela pede ao "repositório" (listAll / getById).
// Para trocar por Supabase no futuro, só este arquivo muda (veja o README, seção Supabase).

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

// Fábrica: decide qual repositório usar conforme PRODUCTS_SOURCE no .env.
function createProductRepository(config) {
  if (config.productsSource === "json") {
    return new JsonProductRepository(config.productsFile, config.productsTestFile);
  }
  // Ainda não existe implementação do Supabase: avisa claramente em vez de falhar em silêncio.
  throw new Error(
    `PRODUCTS_SOURCE="${config.productsSource}" ainda não implementado. Use "json" por enquanto.`
  );
}

module.exports = { JsonProductRepository, createProductRepository, normalizeProduct };
