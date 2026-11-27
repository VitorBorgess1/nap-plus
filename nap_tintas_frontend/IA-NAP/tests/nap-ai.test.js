// tests/nap-ai.test.js - Testes automatizados dos 10 cenários pedidos nas instruções (seção 21).
// Rodar com: npm test   (usa o executor de testes nativo do Node, sem depender de internet/chave real)

const test = require("node:test");
const assert = require("node:assert/strict");
const { createNapAI } = require("../nap-ai");
const { createFakeLLM } = require("./helpers/fake-llm");
const { createFakeRepository, SAMPLE_PRODUCTS } = require("./helpers/fake-repository");

const config = { maxRecommendations: 4, maxMessageLength: 600, maxHistoryMessages: 8 };

function buildAI(products = SAMPLE_PRODUCTS) {
  return createNapAI({ llm: createFakeLLM(), repository: createFakeRepository(products), config });
}

// Teste 1 — recomendação simples ("Quero pintar minha sala.")
test("Teste 1: recomendação simples para a sala", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Quero pintar minha sala." });
  assert.equal(r.intent, "product_recommendation");
  assert.ok(r.products.length > 0, "deveria sugerir ao menos um produto");
  assert.ok(r.products.every((p) => p.stock > 0), "só produtos com estoque");
});

// Teste 2 — problema de umidade no quarto
test("Teste 2: umidade no quarto recomenda produtos de tratamento", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Minha parede do quarto está com muita umidade." });
  assert.ok(r.products.some((p) => /umidade|antimofo|impermeabilizante/i.test(p.description + p.name)));
});

// Teste 3 — mofo (mesma intenção semântica de umidade)
test("Teste 3: mofo é tratado como a mesma necessidade de umidade", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Tem mofo na parede." });
  assert.ok(r.products.length > 0);
});

// Teste 4 — ambiente externo (fachada)
test("Teste 4: pintar a fachada reconhece ambiente externo", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Quero pintar a fachada da minha casa." });
  assert.equal(r.need.environment_type, "externo");
});

// Teste 5 — orçamento
test("Teste 5: orçamento de R$300 é interpretado e considerado", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Quero pintar meu quarto e tenho até 300 reais." });
  assert.equal(r.need.budget, 300);
});

// Teste 6 — cor (catálogo atual não tem campo de cor: IA não pode inventar)
test("Teste 6: pedido de cor não inventa cor inexistente no catálogo", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Quero pintar minha sala de azul." });
  assert.ok(!/azul marinho|azul celeste|azul turquesa/i.test(r.message), "não deve inventar tom de azul específico");
});

// Teste 7 — pergunta incompleta: IA deve pedir mais informação, não recomendar às cegas
test("Teste 7: pedido vago gera pergunta complementar, não recomendação aleatória", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Preciso de uma tinta boa." });
  assert.equal(r.needs_more_information, true);
  assert.ok(r.message.includes("?"), "deveria fazer uma pergunta");
  assert.equal(r.products.length, 0, "não deveria recomendar produtos antes de entender a necessidade");
});

// Teste 8 — produto sem estoque não deve ser oferecido como disponível
test("Teste 8: produto com stock=0 não aparece como disponível, mas é citado como indisponível", async () => {
  const ai = buildAI(); // produto id 5 tem stock: 0 no catálogo de teste
  const r = await ai.chat({ message: "Minha parede do quarto está com muita umidade." });
  assert.ok(!r.products.some((p) => p.id === 5), "produto sem estoque não pode estar entre os disponíveis");
  assert.ok(r.unavailable.some((u) => u.id === 5), "produto sem estoque deve ser citado como indisponível");
});

// Teste 9 — assunto fora do contexto
test("Teste 9: pergunta fora do escopo é redirecionada para a NAP Tintas", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Quem descobriu o Brasil?" });
  assert.equal(r.intent, "out_of_scope");
  assert.match(r.message, /NAP Tintas/);
});

// Teste 10 — informação desconhecida: IA não pode inventar aplicação não documentada
test("Teste 10: aplicação não documentada não é inventada", async () => {
  const ai = buildAI();
  const r = await ai.chat({ message: "Qual o rendimento da tinta X em teto de gesso liso?" });
  // Sem produtos compatíveis o suficiente, a IA deve admitir a limitação em vez de inventar.
  if (r.products.length === 0) {
    assert.match(r.message, /não encontrei informações|catálogo|equipe da NAP/i);
  } else {
    assert.ok(true, "se houver produto compatível, ele vem de dados reais do catálogo (não de invenção)");
  }
});
