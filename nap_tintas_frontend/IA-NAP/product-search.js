// product-search.js - lógica DETERMINÍSTICA (sem IA) que cruza a necessidade do cliente com o catálogo.
// Aqui é decidido o que é compatível, o que está em estoque e a ordem das recomendações.
// O Gemini NUNCA decide estoque, preço ou existência de produto: isso é tudo feito aqui.

// Remove acentos e maiúsculas para comparar textos ("Umidade" == "umidade", "Fachada" == "fachada").
function normalizeText(value) {
  return String(value || "")
    .toLowerCase() // tudo minúsculo
    .normalize("NFD") // separa letras dos acentos
    .replace(/[\u0300-\u036f]/g, "") // apaga os acentos
    .trim(); // tira espaços das pontas
}

// Dois termos "combinam" se forem iguais ou um estiver contido no outro (mínimo 4 letras, evita ruído).
function termsMatch(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return false; // vazio nunca combina
  if (x === y) return true; // iguais
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]; // menor e maior
  return short.length >= 4 && long.includes(short); // o menor está dentro do maior
}

// Lista sem repetidos e sem vazios.
function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

// Monta o "vocabulário" do catálogo: os valores reais que existem nos produtos.
// O Gemini recebe isso para escolher SOMENTE termos que existem (não inventa categorias).
function buildVocabulary(products) {
  return {
    categories: unique(products.map((p) => p.category)),
    environments: unique(products.flatMap((p) => p.environments)),
    purposes: unique(products.flatMap((p) => p.purposes)),
    tags: unique(products.flatMap((p) => p.tags)),
    surfaces: unique(products.flatMap((p) => p.surface)),
    brands: unique(products.map((p) => p.brand)),
    finishes: unique(products.map((p) => p.finish)),
  };
}

// Conta quantos termos da lista "wanted" combinam com valores da lista "field".
function countMatches(wanted, field) {
  return wanted.filter((w) => field.some((f) => termsMatch(w, f))).length;
}

// Palavras que indicam ambiente externo / interno (usadas só para dar um pequeno bônus).
const EXTERNAL_WORDS = ["externa", "externo", "fachada", "calcada", "garagem", "quadra", "portao"];
const INTERNAL_WORDS = ["interna", "interno", "sala", "quarto", "banheiro", "cozinha"];

// Calcula a pontuação de compatibilidade de UM produto com a necessidade do cliente.
function scoreProduct(product, need) {
  const hints = need.catalog_hints || {};
  let score = 0; // pontuação total
  const reasons = []; // motivos legíveis (enviados ao Gemini para explicar)
  const notes = []; // avisos de possível incompatibilidade (também enviados ao Gemini)

  // Termos livres que o cliente/IA citou (problema, superfície etc.).
  const freeTerms = unique([need.problem, need.surface, ...(need.search_terms || [])]);
  // Ambientes desejados (o dito pelo cliente + os sugeridos a partir do vocabulário).
  const wantedEnvs = unique([need.environment, ...(hints.environments || [])]);

  // Categoria compatível: +4
  if ((hints.categories || []).some((c) => termsMatch(c, product.category))) {
    score += 4;
    reasons.push(`categoria "${product.category}"`);
  }
  // Finalidades compatíveis: +3 cada (máx. 2)
  const purposeHits = Math.min(2, countMatches([...(hints.purposes || []), ...freeTerms], product.purposes));
  if (purposeHits) {
    score += purposeHits * 3;
    reasons.push("finalidade cadastrada compatível");
  }
  // Tags compatíveis: +2 cada (máx. 3)
  const tagHits = Math.min(3, countMatches([...(hints.tags || []), ...freeTerms], product.tags));
  if (tagHits) {
    score += tagHits * 2;
    reasons.push("tags compatíveis");
  }
  // Ambiente compatível: +3
  const envHit = countMatches(wantedEnvs, product.environments) > 0;
  if (envHit) {
    score += 3;
    reasons.push("ambiente cadastrado compatível");
  }
  // Superfície compatível: +2
  if (countMatches(unique([need.surface, ...(hints.surfaces || [])]), product.surface) > 0) {
    score += 2;
    reasons.push("superfície compatível");
  }
  // Termos citados aparecendo no nome/descrição: +1 cada (máx. 2)
  const text = normalizeText(`${product.name} ${product.description}`);
  const textHits = Math.min(2, freeTerms.filter((t) => normalizeText(t).length >= 4 && text.includes(normalizeText(t))).length);
  if (textHits) {
    score += textHits;
    reasons.push("descrição menciona o assunto");
  }
  // Marca pedida: +3
  if (need.brand && termsMatch(need.brand, product.brand)) {
    score += 3;
    reasons.push(`marca ${product.brand}`);
  }
  // Acabamento pedido: +2
  if (need.finish && termsMatch(need.finish, product.finish)) {
    score += 2;
    reasons.push(`acabamento ${product.finish}`);
  }
  // Bônus pequeno para ambiente externo/interno conforme o catálogo indica.
  const productText = normalizeText([product.description, ...product.purposes, ...product.environments, ...product.tags].join(" "));
  if (need.environment_type === "externo" && EXTERNAL_WORDS.some((w) => productText.includes(w))) score += 1;
  if (need.environment_type === "interno" && INTERNAL_WORDS.some((w) => productText.includes(w))) score += 1;

  // Aviso honesto: o cliente citou um ambiente e o produto NÃO lista esse ambiente.
  if (need.environment && product.environments.length && !envHit) {
    notes.push(`O catálogo não lista o ambiente "${need.environment}" entre os ambientes deste produto.`);
  }
  return { score, reasons, notes };
}

// Nível de compatibilidade legível a partir da pontuação.
function levelFromScore(score) {
  if (score >= 8) return "alta";
  if (score >= 5) return "média";
  return "baixa";
}

// Função principal: recebe TODOS os produtos + a necessidade e devolve disponíveis e indisponíveis.
function searchProducts(products, need, options = {}) {
  const max = options.max || 4; // quantos produtos no máximo
  const minScore = options.minScore ?? 4; // pontuação mínima para ser considerado compatível
  const budget = typeof need.budget === "number" && need.budget > 0 ? need.budget : null; // orçamento válido

  // Pontua todos os produtos.
  const scored = products.map((product) => ({ product, ...scoreProduct(product, need) }));

  // Monta a lista final a partir de um limite mínimo de pontuação.
  const build = (threshold) => {
    const relevant = scored.filter((s) => s.score >= threshold); // só os compatíveis
    const decorate = (s) => ({
      product: s.product,
      score: s.score,
      compatibility: levelFromScore(s.score),
      reasons: s.reasons,
      notes: s.notes,
      within_budget: budget === null ? null : s.product.price <= budget, // cabe no orçamento?
    });
    // DISPONÍVEIS: estoque > 0. Ordena: dentro do orçamento, maior pontuação, menor preço.
    const available = relevant
      .filter((s) => s.product.stock > 0)
      .map(decorate)
      .sort((a, b) => (b.within_budget === true) - (a.within_budget === true) || b.score - a.score || a.product.price - b.product.price);
    // INDISPONÍVEIS: estoque <= 0 (podem ser citados, mas nunca vendidos como disponíveis).
    const unavailable = relevant
      .filter((s) => s.product.stock <= 0)
      .map(decorate)
      .sort((a, b) => b.score - a.score);
    return { available, unavailable };
  };

  let { available, unavailable } = build(minScore); // busca normal
  let relaxed = false; // indica se precisou relaxar o critério
  // Se o produto ideal está sem estoque e não sobrou nada, procura alternativas menos compatíveis.
  if (available.length === 0 && unavailable.length > 0) {
    const second = build(2);
    if (second.available.length > 0) {
      available = second.available;
      unavailable = unavailable.length ? unavailable : second.unavailable;
      relaxed = true;
    }
  }

  return {
    available: available.slice(0, max), // limita a quantidade
    unavailable: unavailable.slice(0, 2), // cita no máximo 2 indisponíveis
    relaxed,
    budget,
  };
}

module.exports = { normalizeText, termsMatch, buildVocabulary, scoreProduct, searchProducts };
