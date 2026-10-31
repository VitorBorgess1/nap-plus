// Testa a leitura do Supabase sem rede: o fetch é simulado.
const test = require("node:test");
const assert = require("node:assert");
const { SupabaseProductRepository, createProductRepository } = require("../product-repository");

const ROW = {
  id: 1, nome: "Suvinil Fosco Completo", marca: "Suvinil", categoria: "Parede", acabamento: "Fosco",
  preco: "189.90", rendimento: "Até 350 m²", descricao: "Tinta", imagem_url: null, icone: "house",
  superficies: ["Parede"], ambientes: ["Sala"], finalidades: ["Pintura interna"], tags: ["parede"],
  estoque: { quantidade: 12 },
};

test("converte linhas do banco para o formato do catálogo", async (t) => {
  let calls = 0;
  t.mock.method(global, "fetch", async (url, opts) => {
    calls++;
    assert.match(url, /\/rest\/v1\/produtos\?select=\*,estoque\(quantidade\)&ativo=eq.true/);
    assert.strictEqual(opts.headers.apikey, "chave");
    return { ok: true, json: async () => [ROW] };
  });
  const repo = new SupabaseProductRepository("https://x.supabase.co/", "chave");
  const [p] = await repo.listAll();
  assert.deepStrictEqual(
    [p.name, p.brand, p.price, p.stock, p.environments, p.purposes, p.image],
    ["Suvinil Fosco Completo", "Suvinil", 189.9, 12, ["Sala"], ["Pintura interna"], ""]
  );
  assert.strictEqual((await repo.getById(1)).id, 1);
  assert.strictEqual(calls, 1, "segunda leitura usa o cache");
});

test("mantém o último catálogo se o banco cair", async (t) => {
  const repo = new SupabaseProductRepository("https://x.supabase.co", "chave", 0);
  t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => [ROW] }));
  await repo.listAll();
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 503, text: async () => "pausado" }));
  assert.strictEqual((await repo.listAll()).length, 1);
});

test("exige URL e chave", () => {
  assert.throws(() => createProductRepository({ productsSource: "supabase" }), /SUPABASE_URL/);
});
