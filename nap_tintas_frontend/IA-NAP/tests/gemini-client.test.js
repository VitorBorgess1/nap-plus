// tests/gemini-client.test.js - Latência: o tempo TOTAL da conversa tem teto, mesmo com o Gemini travado/sobrecarregado.
// Usa um fetch falso e tempos pequenos (escala 1:100: 20s reais = 200ms aqui), então roda em ~1 segundo.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiClient } = require("../gemini-client");
const { createNapAI } = require("../nap-ai");
const { createFakeRepository, SAMPLE_PRODUCTS } = require("./helpers/fake-repository");

const abortError = () => Object.assign(new Error("abort"), { name: "AbortError" });
// Gemini travado: só termina quando o cliente cancela (timeout).
const hanging = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(abortError())));
// Gemini sobrecarregado: demora quase o timeout inteiro e responde 503.
const slow503 = (url, { signal }) => new Promise((res, rej) => {
  const t = setTimeout(() => res({ ok: false, status: 503, text: async () => "overloaded" }), 190);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(abortError()); });
});
const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

const quiet = () => { const orig = console.warn; console.warn = () => {}; return () => { console.warn = orig; }; };
const client = (fetchImpl, extra = {}) => createGeminiClient({ apiKey: "k", model: "a", fallbackModel: "b", timeoutMs: 200, retryDelayMs: 15, minAttemptMs: 30, fetchImpl, ...extra });

test("Latência 1: com deadline, a chamada para no tempo total (mesmo com Gemini travado e 3 tentativas possíveis)", async () => {
  const restore = quiet();
  try {
    const t0 = Date.now();
    await assert.rejects(() => client(hanging).generateJson({ system: "s", contents: [], deadline: Date.now() + 300 }));
    const ms = Date.now() - t0;
    assert.ok(ms < 450, `deveria parar perto de 300ms, levou ${ms}ms`);
  } finally { restore(); }
});

test("Latência 2: com Gemini sobrecarregado (503), não gasta retry/modelo reserva além do tempo total", async () => {
  const restore = quiet();
  try {
    const t0 = Date.now();
    await assert.rejects(() => client(slow503).generateJson({ system: "s", contents: [], deadline: Date.now() + 300 }));
    assert.ok(Date.now() - t0 < 450);
  } finally { restore(); }
});

test("Latência 3: sem deadline o comportamento antigo continua (retry + modelo reserva)", async () => {
  const restore = quiet();
  try {
    let calls = 0;
    const f = async () => { calls++; return { ok: false, status: 503, text: async () => "x" }; };
    await assert.rejects(() => client(f).generateJson({ system: "s", contents: [] }));
    assert.equal(calls, 3, "principal + retry + reserva");
  } finally { restore(); }
});

test("Latência 4: modelo reserva ainda salva quando há tempo (deadline folgado)", async () => {
  const restore = quiet();
  try {
    let n = 0;
    const f = async (url) => (url.includes("/a:") ? { ok: false, status: 500, text: async () => "x" } : okJson({ ok: n++ >= 0 })());
    const r = await client(f).generateJson({ system: "s", contents: [], deadline: Date.now() + 5000 });
    assert.equal(r.ok, true);
  } finally { restore(); }
});

test("Latência 5: conversa completa (2 etapas) responde DENTRO do orçamento mesmo com Gemini lento, e ainda entrega produtos reais", async () => {
  const restore = quiet();
  try {
    // Etapa 1 responde bem, mas devagar (150ms). A etapa 2 fica travada. Orçamento total: 400ms.
    const stage1 = { intent: "product_recommendation", environment: "Sala", environment_type: "interno", catalog_hints: { environments: ["Sala"] }, search_terms: ["sala"], needs_products: true };
    const f = async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.systemInstruction.parts[0].text.includes("Você recebe um JSON com a necessidade")) return hanging(url, opts);
      await new Promise((r) => setTimeout(r, 150));
      return okJson(stage1)();
    };
    const llm = client(f);
    const ai = createNapAI({ llm, repository: createFakeRepository(SAMPLE_PRODUCTS), config: { maxRecommendations: 4, maxMessageLength: 600, maxHistoryMessages: 8, chatBudgetMs: 400, minStage2Ms: 50 } });
    const t0 = Date.now();
    const r = await ai.chat({ message: "Quero pintar minha sala." });
    const ms = Date.now() - t0;
    assert.ok(ms < 600, `deveria responder em ~400ms, levou ${ms}ms`);
    assert.ok(r.products.length > 0, "mesmo sem a etapa 2, o cliente recebe os produtos reais do catálogo");
    assert.ok(r.message.length > 0);
  } finally { restore(); }
});

test("Latência 6: sobrou pouco tempo depois da etapa 1 -> pula a etapa 2 (nem chama o Gemini) e responde na hora", async () => {
  const restore = quiet();
  try {
    let stage2Calls = 0;
    const stage1 = { intent: "product_recommendation", environment: "Sala", environment_type: "interno", catalog_hints: { environments: ["Sala"] }, search_terms: ["sala"], needs_products: true };
    const f = async (url, opts) => {
      const sys = JSON.parse(opts.body).systemInstruction.parts[0].text;
      if (sys.includes("Você recebe um JSON com a necessidade")) { stage2Calls++; return okJson({ message: "x", recommended_ids: [] })(); }
      await new Promise((r) => setTimeout(r, 120)); // etapa 1 consome quase todo o orçamento
      return okJson(stage1)();
    };
    const ai = createNapAI({ llm: client(f), repository: createFakeRepository(SAMPLE_PRODUCTS), config: { maxRecommendations: 4, maxMessageLength: 600, maxHistoryMessages: 8, chatBudgetMs: 150, minStage2Ms: 100 } });
    const r = await ai.chat({ message: "Quero pintar minha sala." });
    assert.equal(stage2Calls, 0, "a etapa 2 não deveria ser chamada");
    assert.ok(r.products.length > 0 && r.message.length > 0);
  } finally { restore(); }
});
