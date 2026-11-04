// tests/supabase-repository.test.js - testa a leitura do Supabase com um "fetch" falso (sem internet, sem chave real).

const test = require("node:test");
const assert = require("node:assert/strict");
const { SupabaseProductRepository, createProductRepository } = require("../product-repository");
const { searchProducts } = require("../product-search");

// Linhas como o Supabase poderia devolver: colunas em português, listas em texto, colunas extras e id uuid.
const ROWS = [
  { id: "a1", nome: "Selador Acrílico Antimofo", marca: "Quartzolit", categoria: "Tratamento", acabamento: "Fosco", preco: "89.90", estoque: 15, rendimento: "Até 200 m²", descricao: "Selador com ação antimofo.", ambientes: "Quarto, Banheiro", finalidades: ["Umidade"], tags: '["mofo","antimofo"]', superficie: ["Parede"], tempo_secagem: "4 horas", diluicao: null, created_at: "2026-01-01" },
  { id: "b2", nome: "Tinta Antiga", marca: "X", categoria: "Parede", preco: 10, estoque: 3, ativo: false },
];

function fakeFetch(rows, status = 200) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: status === 200, status, json: async () => rows, text: async () => "erro" };
  };
  impl.calls = calls;
  return impl;
}

test("Supabase: lê, normaliza colunas em português e ignora inativos", async () => {
  const f = fakeFetch(ROWS);
  const repo = new SupabaseProductRepository({ url: "https://x.supabase.co", key: "k", table: "produtos", fetchImpl: f });
  const list = await repo.listAll();
  assert.equal(list.length, 1, "produto inativo não entra");
  const p = list[0];
  assert.equal(p.name, "Selador Acrílico Antimofo");
  assert.equal(p.price, 89.9);
  assert.equal(p.stock, 15);
  assert.deepEqual(p.environments, ["Quarto", "Banheiro"]);
  assert.deepEqual(p.tags, ["mofo", "antimofo"]);
  assert.deepEqual(p.details, { tempo_secagem: "4 horas" }, "colunas extras viram details; nulas e técnicas ficam de fora");
  assert.match(f.calls[0].url, /\/rest\/v1\/produtos\?select=\*/);
  assert.equal(f.calls[0].opts.headers.apikey, "k");
  assert.equal((await repo.getById("a1")).name, p.name);
});

test("Supabase: junta produtos com a tabela de estoque (produto_id/quantidade)", async () => {
  const produtos = [{ id: 1, nome: "Tinta A", preco: 10, ativo: true }, { id: 2, nome: "Tinta B", preco: 20 }, { id: 3, nome: "Tinta C", preco: 30 }];
  const estoque = [{ id: 1, produto_id: 1, quantidade: 12 }, { id: 2, produto_id: 2, quantidade: 0 }];
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => (url.includes("/estoque?") ? estoque : produtos), text: async () => "" };
  };
  const repo = new SupabaseProductRepository({ url: "https://x.supabase.co", key: "k", table: "produtos", stockTable: "estoque", fetchImpl });
  const list = await repo.listAll();
  assert.deepEqual(list.map((p) => p.stock), [12, 0, 0], "sem linha no estoque = 0");
  assert.equal(calls.length, 2);
  assert.deepEqual(list[0].details, {}, "colunas de estoque não viram características");
});

test("Supabase: usa cache curto e erro de chave/tabela é claro", async () => {
  const f = fakeFetch(ROWS);
  const repo = new SupabaseProductRepository({ url: "https://x.supabase.co", key: "k", table: "t", cacheSeconds: 60, fetchImpl: f });
  await repo.listAll(); await repo.listAll();
  assert.equal(f.calls.length, 1);
  const bad = new SupabaseProductRepository({ url: "https://x.supabase.co", key: "k", table: "t", fetchImpl: fakeFetch([], 401) });
  await assert.rejects(() => bad.listAll(), /401.*SUPABASE_KEY/);
});

test("Supabase: fábrica exige URL e chave", () => {
  assert.throws(() => createProductRepository({ productsSource: "supabase", supabaseUrl: "", supabaseKey: "" }), /SUPABASE_URL/);
});

test("Busca: produto citado pelo nome vem primeiro", async () => {
  const repo = new SupabaseProductRepository({
    url: "u", key: "k", table: "t", cacheSeconds: 0,
    fetchImpl: fakeFetch([
      { id: 1, name: "Suvinil Fosco Completo", category: "Parede", price: 189.9, stock: 5, environments: ["Sala"] },
      { id: 2, name: "Suvinil Toque Fosco Completo", category: "Parede", price: 119.9, stock: 5, environments: ["Sala"] },
    ]),
  });
  const products = await repo.listAll();
  const r = searchProducts(products, { product_name: "toque fosco", catalog_hints: {} });
  assert.equal(r.available[0].product.id, 2);
});