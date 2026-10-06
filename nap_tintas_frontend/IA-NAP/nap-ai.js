// nap-ai.js - CÉREBRO da IA NAP+. Orquestra o fluxo:
//   cliente -> Gemini (interpreta) -> código (catálogo/estoque) -> Gemini (resposta) -> cliente
// Recebe o "llm" (Gemini) e o "repository" (produtos) de fora: fácil de testar e de trocar por Supabase.

const { buildVocabulary, searchProducts, normalizeText } = require("./product-search");
const { buildInterpretSystem, RESPOND_SYSTEM, INTERPRET_SCHEMA, RESPOND_SCHEMA } = require("./prompts");

// Textos fixos (não dependem do Gemini => sempre seguros).
const REDIRECT_MESSAGE =
  "Desculpe, estou aqui para ajudar você a encontrar a melhor solução para o seu projeto com a NAP Tintas. Quer me contar o que você pretende pintar ou qual problema está enfrentando?";
const GREETING_MESSAGE =
  "Olá! Sou a assistente da NAP Tintas. Me conte o que você quer pintar ou qual problema está enfrentando (umidade, mofo, parede descascando...) e eu procuro os melhores produtos para você.";
const DEFAULT_QUESTION =
  "Pode me contar um pouco mais? O que você pretende pintar (parede, madeira, metal, piso...) e em qual ambiente?";
const NO_MATCH_MESSAGE =
  "Não encontrei informações suficientes no catálogo para confirmar produtos para essa necessidade. Para evitar uma recomendação inadequada, recomendo confirmar com a equipe da NAP Tintas. Se quiser, me conte mais detalhes (o que será pintado, ambiente, problema) e eu tento novamente.";
const COLOR_LIMITATION =
  "O catálogo atual não traz informações de cores dos produtos, então não consigo confirmar a cor desejada.";

// Formata número como moeda brasileira: 189.9 -> "R$ 189,90".
const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

// Mantém só as últimas mensagens válidas do histórico enviado pelo site (evita lixo e abuso).
function sanitizeHistory(history, config) {
  if (!Array.isArray(history)) return []; // se não for lista, ignora
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-config.maxHistoryMessages) // só as mais recentes
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, 800) })); // limita o tamanho
}

// Converte o histórico para o formato do Gemini ("user" / "model").
function toGeminiContents(history, message) {
  const contents = history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: message }] }); // mensagem atual por último
  return contents;
}

// Confere/limpa a resposta do Gemini na etapa 1 (nunca confiamos cegamente no JSON).
function normalizeNeed(raw, vocabulary) {
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null); // texto ou null
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []); // lista de textos
  // Mantém só valores que REALMENTE existem no catálogo (ignora acentos/maiúsculas).
  const onlyKnown = (list, known) =>
    arr(list).map((x) => known.find((k) => normalizeText(k) === normalizeText(x))).filter(Boolean);
  const hints = r.catalog_hints || {};
  const budgetNum = Number(r.budget);
  return {
    intent: ["product_recommendation", "greeting", "out_of_scope"].includes(r.intent) ? r.intent : "product_recommendation",
    problem: str(r.problem),
    environment: str(r.environment),
    environment_type: ["interno", "externo"].includes(r.environment_type) ? r.environment_type : null,
    surface: str(r.surface),
    color: str(r.color),
    finish: str(r.finish),
    brand: str(r.brand),
    budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : null,
    quantity: str(r.quantity),
    desired_features: arr(r.desired_features).slice(0, 6),
    catalog_hints: {
      categories: onlyKnown(hints.categories, vocabulary.categories),
      environments: onlyKnown(hints.environments, vocabulary.environments),
      purposes: onlyKnown(hints.purposes, vocabulary.purposes),
      tags: onlyKnown(hints.tags, vocabulary.tags),
      surfaces: onlyKnown(hints.surfaces, vocabulary.surfaces),
    },
    search_terms: arr(r.search_terms).slice(0, 6),
    needs_products: r.needs_products !== false,
    needs_more_information: r.needs_more_information === true,
    question: str(r.question),
  };
}

// Dados enxutos de um produto que vão para o Gemini (só o que ele precisa para explicar).
function toFacts(entry) {
  const p = entry.product;
  return {
    id: p.id, name: p.name, brand: p.brand, category: p.category, finish: p.finish,
    price: p.price, price_text: brl(p.price), coverage: p.coverage, description: p.description,
    environments: p.environments, purposes: p.purposes,
    compatibility: entry.compatibility, match_reasons: entry.reasons, notes: entry.notes,
    within_budget: entry.within_budget,
  };
}

// Dados que o site recebe para desenhar os cards (vêm do catálogo, nunca do Gemini).
function toCard(entry, available) {
  const p = entry.product;
  return {
    id: p.id, name: p.name, brand: p.brand, category: p.category, finish: p.finish,
    price: p.price, stock: p.stock, coverage: p.coverage, description: p.description,
    image: p.image, icon: p.icon, compatibility: entry.compatibility, available,
  };
}

// Mensagem determinística (sem Gemini) usada se a etapa 2 falhar ou for reprovada na validação.
function buildFallbackMessage(result) {
  const parts = [];
  if (result.unavailable.length) {
    parts.push(`Encontrei uma opção que combina com o que você descreveu (${result.unavailable.map((u) => u.product.name).join(", ")}), mas ela está sem estoque no momento.`);
  }
  if (result.available.length) {
    parts.push(`Estas opções disponíveis podem atender ao seu caso: ${result.available.map((a) => `${a.product.name} (${brl(a.product.price)})`).join("; ")}.`);
  }
  parts.push(...result.limitations);
  return parts.join(" ");
}

// [CORREÇÃO] Converte um valor em texto para número, aceitando tanto o formato
// brasileiro (R$ 139,90) quanto o americano que o Gemini às vezes usa (R$ 139.90).
// Antes, o código só entendia vírgula como decimal e tratava "139.90" como 13990,
// o que fazia a validação de preço falhar sempre e a IA trocar a resposta do
// Gemini por uma mensagem "robótica" de reserva — o que parecia "sem texto".
function parseMoney(raw) {
  const s = raw.trim();
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")); // "1.189,90" -> 1189.90
  const parts = s.split(".");
  if (parts.length > 1 && parts[parts.length - 1].length === 2) return Number(s); // "139.90" -> 139.90 (decimal)
  return Number(s.replace(/\./g, "")); // "1.189" -> 1189 (separador de milhar)
}

// Guarda anti-invenção: todo "R$ xx,xx" citado no texto precisa existir nos dados reais.
function pricesAreValid(message, allowedNumbers) {
  const found = [...String(message).matchAll(/R\$\s*([\d.,]+)/g)]; // acha todos os valores em reais
  return found.every((m) => {
    const value = parseMoney(m[1]);
    return allowedNumbers.some((a) => Math.abs(a - value) < 0.005); // precisa bater com um preço/orçamento real
  });
}

// Cria a IA. Retorna { chat } com a função principal.
function createNapAI({ llm, repository, config }) {
  return {
    async chat({ message, history }) {
      const text = String(message || "").trim().slice(0, config.maxMessageLength); // mensagem limpa e limitada
      if (!text) {
        const err = new Error("Mensagem vazia."); // erro de validação
        err.status = 400;
        throw err;
      }
      const cleanHistory = sanitizeHistory(history, config); // histórico seguro

      // ---------- ETAPA 1: Gemini interpreta ----------
      const products = await repository.listAll(); // catálogo atual (JSON hoje, Supabase amanhã)
      const vocabulary = buildVocabulary(products); // valores reais do catálogo
      let need;
      try {
        const rawNeed = await llm.generateJson({
          system: buildInterpretSystem(vocabulary),
          contents: toGeminiContents(cleanHistory, text),
          temperature: 0.1, // interpretação precisa ser estável
          schema: INTERPRET_SCHEMA, // [CORREÇÃO] força o formato da resposta
        });
        need = normalizeNeed(rawNeed, vocabulary); // valida o JSON recebido
      } catch (err) {
        // [CORREÇÃO] Etapa 1 não tinha nenhuma proteção: qualquer instabilidade do Gemini
        // (rede, cota, modelo indisponível) derrubava a conversa inteira sem nenhum texto
        // útil para o cliente. Agora a IA sempre responde algo, e o erro real aparece
        // no terminal (onde está rodando "npm start") para facilitar o diagnóstico.
        console.warn("[IA-NAP] Etapa 1 (interpretação) falhou:", err.message);
        return {
          need: null, products: [], unavailable: [], intent: "product_recommendation", needs_more_information: true,
          message: "Desculpe, tive uma instabilidade para entender sua mensagem agora. Pode tentar novamente?",
        };
      }

      const base = { need, products: [], unavailable: [], intent: need.intent, needs_more_information: false };

      // Assunto fora do contexto: resposta fixa, sem consultar catálogo.
      if (need.intent === "out_of_scope") return { ...base, message: REDIRECT_MESSAGE };
      // Só cumprimento: boas-vindas fixas.
      if (need.intent === "greeting") return { ...base, message: GREETING_MESSAGE };
      // Falta informação: devolve a pergunta complementar, sem consultar catálogo.
      if (need.needs_more_information) {
        return { ...base, needs_more_information: true, message: need.question || DEFAULT_QUESTION };
      }

      // ---------- CÓDIGO: consulta catálogo + estoque ----------
      const found = searchProducts(products, need, { max: config.maxRecommendations });

      // Limitações conhecidas (informadas ao cliente de forma honesta).
      const limitations = [];
      const catalogHasColors = products.some((p) => p.color || p.colors); // catálogo tem cor?
      if (need.color && !catalogHasColors) limitations.push(COLOR_LIMITATION);
      if (found.budget !== null && found.available.length && found.available.every((a) => a.within_budget === false)) {
        limitations.push(`Nenhuma das opções disponíveis compatíveis custa até ${brl(found.budget)} por unidade.`);
      }
      if (found.relaxed) limitations.push("As alternativas disponíveis têm compatibilidade menor com o pedido original.");
      const result = { ...found, limitations };

      // Nada compatível: mensagem fixa (evita qualquer chance de invenção).
      if (!found.available.length && !found.unavailable.length) {
        return { ...base, message: [NO_MATCH_MESSAGE, ...limitations].join(" ") };
      }

      // ---------- ETAPA 2: Gemini escreve a resposta com dados reais ----------
      const facts = {
        customer_need: need,
        available_products: found.available.map(toFacts),
        unavailable_products: found.unavailable.map((u) => ({ id: u.product.id, name: u.product.name, brand: u.product.brand, reason: "sem estoque no momento" })),
        limitations,
      };
      let messageText;
      let chosen = found.available;
      try {
        const out = await llm.generateJson({
          system: RESPOND_SYSTEM,
          contents: [{ role: "user", parts: [{ text: `Mensagem do cliente: """${text}"""\n\nDADOS REAIS DO SISTEMA:\n${JSON.stringify(facts)}` }] }],
          temperature: 0.4,
          schema: RESPOND_SCHEMA, // [CORREÇÃO] força o formato { message, recommended_ids }
        });
        messageText = typeof out?.message === "string" ? out.message.trim() : "";
        // Só aceita ids que existem entre os DISPONÍVEIS (o Gemini não consegue "criar" produto).
        const ids = Array.isArray(out?.recommended_ids) ? out.recommended_ids.map(Number) : [];
        const picked = ids.map((id) => found.available.find((a) => a.product.id === id)).filter(Boolean);
        if (picked.length) chosen = picked;
        // Guarda anti-invenção de preços.
        const allowed = [...found.available, ...found.unavailable].map((a) => a.product.price);
        if (found.budget !== null) allowed.push(found.budget);
        if (!messageText || !pricesAreValid(messageText, allowed)) messageText = buildFallbackMessage(result);
      } catch (err) {
        console.warn("[IA-NAP] Etapa 2 falhou, usando mensagem padrão:", err.message); // não derruba o atendimento
        messageText = buildFallbackMessage(result);
      }

      return {
        ...base,
        message: messageText,
        products: chosen.map((e) => toCard(e, true)), // cards: SÓ produtos com estoque
        unavailable: found.unavailable.map((u) => ({ id: u.product.id, name: u.product.name })),
      };
    },
  };
}

module.exports = { createNapAI, REDIRECT_MESSAGE, NO_MATCH_MESSAGE, normalizeNeed, pricesAreValid };
