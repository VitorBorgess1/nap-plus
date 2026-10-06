// tests/helpers/fake-llm.js - Gemini "falso" para os testes automatizados não dependerem de internet/chave.
// Simula as duas etapas (interpretar / responder) com regras simples baseadas no texto da mensagem.

function lastUserText(contents) {
  const last = contents[contents.length - 1];
  return last.parts[0].text;
}

function createFakeLLM() {
  return {
    async generateJson({ system, contents }) {
      // ---------- Etapa 2 (responder): reconhece pelo prompt de sistema ----------
      if (system.includes("Você recebe um JSON com a necessidade")) {
        const userText = contents[0].parts[0].text;
        const factsMatch = userText.match(/DADOS REAIS DO SISTEMA:\n([\s\S]*)$/);
        const facts = JSON.parse(factsMatch[1]);
        const avail = facts.available_products;
        const unavail = facts.unavailable_products;
        let message = "";
        if (unavail.length) message += `A opção ${unavail[0].name} combina, mas está sem estoque no momento. `;
        if (avail.length) message += `Recomendo: ${avail.map((p) => `${p.name} (${p.price_text})`).join(", ")}.`;
        return { message: message.trim(), recommended_ids: avail.map((p) => p.id) };
      }
      // ---------- Etapa 1 (interpretar) ----------
      const text = lastUserText(contents).toLowerCase();
      const base = {
        intent: "product_recommendation", problem: null, environment: null, environment_type: null,
        surface: null, color: null, finish: null, brand: null, budget: null, quantity: null,
        desired_features: [], catalog_hints: { categories: [], environments: [], purposes: [], tags: [], surfaces: [] },
        search_terms: [], needs_products: true, needs_more_information: false, question: null,
      };
      if (/descobriu o brasil|capital da frança|copa do mundo/.test(text)) return { ...base, intent: "out_of_scope" };
      if (/^(oi|ol[áa]|bom dia|boa tarde)!?$/.test(text.trim())) return { ...base, intent: "greeting" };
      if (/umidade|mofo|manchas escuras|parede preta/.test(text)) {
        return {
          ...base, problem: "umidade", environment: /quarto/.test(text) ? "Quarto" : null,
          environment_type: /quarto|sala/.test(text) ? "interno" : null,
          catalog_hints: { categories: ["Tratamento"], environments: [], purposes: ["Umidade", "Infiltração"], tags: ["umidade", "mofo"], surfaces: [] },
          search_terms: ["umidade", "mofo"],
        };
      }
      if (/fachada/.test(text)) {
        return { ...base, environment: "Fachada", environment_type: "externo", search_terms: ["fachada"], catalog_hints: { ...base.catalog_hints, environments: ["Fachada"] } };
      }
      if (/300 reais|até 300/.test(text)) {
        return { ...base, environment: "Quarto", environment_type: "interno", budget: 300, search_terms: ["quarto"], catalog_hints: { ...base.catalog_hints, environments: ["Quarto"] } };
      }
      if (/azul/.test(text)) {
        return { ...base, environment: "Sala", environment_type: "interno", color: "azul", search_terms: ["sala"], catalog_hints: { ...base.catalog_hints, environments: ["Sala"] } };
      }
      if (/sala/.test(text)) {
        return { ...base, environment: "Sala", environment_type: "interno", search_terms: ["sala"], catalog_hints: { ...base.catalog_hints, environments: ["Sala"] } };
      }
      if (/tinta boa/.test(text)) {
        return { ...base, needs_more_information: true, question: "Pode me contar o que você vai pintar e em qual ambiente?" };
      }
      if (/rendimento da tinta x em teto de gesso liso/.test(text)) {
        return { ...base, problem: "rendimento em gesso", search_terms: ["gesso"] };
      }
      return base;
    },
  };
}

module.exports = { createFakeLLM };
