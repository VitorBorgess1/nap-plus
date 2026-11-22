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
const EXTERNAL_WORDS = ["externa", "externo", "exterior", "fachada", "calcada", "garagem", "quadra", "portao", "telhado", "muro", "jardim"];
const INTERNAL_WORDS = ["interna", "interno", "interior", "sala", "quarto", "banheiro", "cozinha", "lavanderia", "escritorio", "corredor", "lavabo", "closet"];

// [CATÁLOGO NOVO] Os ambientes do banco são genéricos ("Interior" / "Exterior"), não cômodos ("Sala", "Quarto").
// Estas funções ligam o tipo de ambiente que a IA entendeu (interno/externo) ao termo usado no catálogo.
const GENERIC_ENVS = ["interior", "exterior", "interno", "externo"];
function environmentTypeTerm(type) {
  return type === "externo" ? "Exterior" : type === "interno" ? "Interior" : null;
}

// Palavras genéricas que não servem para confirmar um PROBLEMA na descrição do produto (ex.: "tinta", "parede").
const PROBLEM_STOPWORDS = ["tinta", "tintas", "para", "com", "sem", "muito", "muita", "esta", "estou", "parede", "paredes", "pintura", "pintar", "casa", "quarto", "sala", "cozinha", "banheiro", "interno", "externo", "interior", "exterior", "ambiente", "produto", "area", "externa", "interna", "problema"];
// Palavras que não ajudam a identificar uma COR (ex.: "azul claro" -> só "azul" importa).
const COLOR_STOPWORDS = ["claro", "clara", "escuro", "escura", "cor", "tom", "tons", "bem", "muito", "forte", "suave", "vivo", "neutro", "tipo"];

// Cores cadastradas do produto (coluna "cores" do Supabase chega em details; aceita lista ou texto separado por vírgula).
function productColors(product) {
  const d = product.details || {};
  const raw = product.colors ?? product.color ?? d.cores ?? d.cor ?? d.colors ?? d.color;
  if (Array.isArray(raw)) return raw.map((c) => String(c).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(/[,;|]/).map((c) => c.trim()).filter(Boolean);
  return [];
}

// Palavras que realmente identificam uma cor (tira "claro", "escuro", "tom"...).
function colorWords(text) {
  return normalizeText(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !COLOR_STOPWORDS.includes(w));
}

// Cores VIZINHAS (tons próximos / roda de cores), em palavras que costumam aparecer em nomes de cores de tinta.
// É só uma lista de PALAVRAS DE BUSCA: a IA nunca diz que uma cor existe se ela não estiver no cadastro do produto.
// Soma-se ao "color_related" que o Gemini sugere, para o resultado não depender da sorte do Gemini lembrar de cada tom.
const COLOR_NEIGHBORS = {
  marrom: ["bronze", "tabaco", "conhaque", "camurca", "terracota", "caramelo", "cafe", "chocolate", "castanho", "canela", "ferrugem", "bege", "areia"],
  bege: ["areia", "camurca", "palha", "creme", "marfim", "caqui", "nude", "marrom"],
  azul: ["ciano", "turquesa", "anil", "marinho", "royal", "celeste", "oceano", "mineral", "petroleo"],
  ciano: ["azul", "turquesa", "celeste", "oceano", "agua"],
  turquesa: ["azul", "ciano", "verde", "agua"],
  verde: ["oliva", "musgo", "limao", "menta", "folha", "abacate", "esmeralda", "pistache", "turquesa"],
  vermelho: ["bordo", "vinho", "carmim", "coral", "tomate", "colonial", "rubi", "terracota"],
  vinho: ["bordo", "vermelho", "roxo", "uva", "marsala", "borgonha"],
  rosa: ["salmao", "coral", "magenta", "blush", "lilas", "nude"],
  roxo: ["lilas", "violeta", "uva", "lavanda", "berinjela", "vinho"],
  lilas: ["roxo", "violeta", "lavanda", "rosa"],
  amarelo: ["ouro", "mostarda", "palha", "limao", "gema", "canario", "dourado"],
  laranja: ["terracota", "coral", "abobora", "salmao", "tangerina"],
  terracota: ["marrom", "laranja", "vermelho", "ferrugem", "tijolo"],
  cinza: ["grafite", "chumbo", "concreto", "prata", "urbano", "elefante", "cimento", "gelo", "ferro"],
  branco: ["gelo", "neve", "perola", "marfim", "cru", "palha"],
  preto: ["grafite", "chumbo", "carvao", "ebano"],
};

// Compara a cor pedida com as cores cadastradas do produto e separa em dois grupos:
//   exact   = a cor pedida mesmo (ex.: pediu "azul" -> "Azul Sereno", "Azul Royal"; pediu "marrom" -> "Marrom Tabaco")
//   similar = tons PRÓXIMOS (ex.: pediu "azul ciano" e só há "Azul Sereno": mesmo azul, mas não é o ciano).
// As cores vizinhas na roda de cores ("color_related") vêm do Gemini, mas só valem se existirem no cadastro do produto.
function colorMatches(product, need) {
  const result = { exact: [], similar: [] };
  if (!need.color) return result;
  const asked = normalizeText(need.color);
  const askedWords = colorWords(need.color);
  const neighbors = askedWords.flatMap((w) => COLOR_NEIGHBORS[w] || []); // vizinhas da tabela fixa
  const related = unique([...(need.color_related || []), ...neighbors].flatMap(colorWords)); // + sugestões do Gemini
  for (const color of productColors(product)) {
    const name = normalizeText(color);
    const isExact = name.includes(asked) || asked.includes(name) || (askedWords.length > 0 && askedWords.every((w) => name.includes(w)));
    if (isExact) result.exact.push(color);
    else if ([...askedWords, ...related].some((w) => name.includes(w))) result.similar.push(color);
  }
  return result;
}

// Deduz interno/externo pelo ambiente citado quando o Gemini não preencheu o tipo (ex.: "quarto" -> interno).
function inferEnvironmentType(need) {
  if (need.environment_type) return need.environment_type;
  const env = normalizeText(need.environment);
  if (!env) return null;
  if (EXTERNAL_WORDS.some((w) => env.includes(w))) return "externo";
  if (INTERNAL_WORDS.some((w) => env.includes(w))) return "interno";
  return null;
}

// Texto do produto onde procuramos o assunto do cliente (nome, descrição, tags, finalidades e colunas extras; sem as cores).
function productSearchText(product) {
  const extras = Object.entries(product.details || {})
    .filter(([key]) => !["cor", "cores", "color", "colors"].includes(normalizeText(key)))
    .map(([, value]) => (Array.isArray(value) ? value.join(" ") : String(value)));
  return normalizeText([product.name, product.category, product.finish, product.coverage, product.description, ...product.tags, ...product.purposes, ...extras].join(" "));
}

// O problema que o cliente descreveu (ex.: "mofo", "umidade") aparece no cadastro do produto?
// true/false; null quando o cliente não descreveu um problema específico.
function problemMentioned(product, need) {
  const terms = unique(
    [need.problem, ...(need.search_terms || [])]
      .flatMap((t) => normalizeText(t).split(/[^a-z0-9]+/))
      .filter((w) => w.length >= 4 && !PROBLEM_STOPWORDS.includes(w))
  );
  if (!need.problem || !terms.length) return null;
  const text = productSearchText(product);
  return terms.some((t) => text.includes(t));
}

// Palavras comuns que não ajudam a identificar um produto pelo nome.
const GENERIC_WORDS = ["tinta", "para", "de", "da", "do", "com", "uma", "um", "the"];

// Calcula a pontuação de compatibilidade de UM produto com a necessidade do cliente.
function scoreProduct(product, need) {
  const hints = need.catalog_hints || {};
  let score = 0; // pontuação total
  const reasons = []; // motivos legíveis (enviados ao Gemini para explicar)
  const notes = []; // avisos de possível incompatibilidade (também enviados ao Gemini)

  // Termos livres que o cliente/IA citou (problema, superfície etc.).
  const freeTerms = unique([need.problem, need.surface, ...(need.search_terms || [])]);
  // Ambientes desejados (o dito pelo cliente + os sugeridos a partir do vocabulário).
  const envType = inferEnvironmentType(need); // "interno" / "externo" / null
  const typeTerm = environmentTypeTerm(envType); // "Interior" / "Exterior" / null
  const wantedEnvs = unique([need.environment, typeTerm, ...(hints.environments || [])]);

  // Categoria compatível: +4. [CATÁLOGO NOVO] O banco agora tem tintas, limpeza, inseticidas etc. Se o cliente pediu um
  // tipo de produto (a IA escolheu categorias do vocabulário) e este produto é de OUTRA categoria, perde 5 pontos:
  // evita sugerir inseticida "de área externa" para quem quer pintar a fachada.
  const wantedCategories = hints.categories || [];
  if (wantedCategories.some((c) => termsMatch(c, product.category))) {
    score += 4;
    reasons.push(`categoria "${product.category}"`);
  } else if (wantedCategories.length) {
    score -= 5;
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
  // [CATÁLOGO NOVO] Produto com ambiente "Sala"/"Quarto" também serve a quem pediu ambiente INTERNO (e "Fachada"/"Portão" a externo).
  const productEnvTypes = product.environments.map((e) => inferEnvironmentType({ environment: e })).filter(Boolean);
  const typeHit = Boolean(envType) && productEnvTypes.includes(envType);
  const envHit = countMatches(wantedEnvs, product.environments) > 0 || typeHit;
  if (envHit) {
    score += 3;
    reasons.push("ambiente cadastrado compatível");
  }
  // Superfície compatível: +2. [CATÁLOGO NOVO] Se o cliente quer uma superfície (ex.: parede/alvenaria) e o produto
  // lista outras superfícies (ex.: só madeira e metal), perde 8 pontos (na prática, sai da lista): esmalte não serve para parede.
  const wantedSurfaces = hints.surfaces || [];
  const surfaceHit = countMatches(unique([need.surface, ...wantedSurfaces]), product.surface) > 0;
  if (surfaceHit) {
    score += 2;
    reasons.push("superfície compatível");
  } else if (wantedSurfaces.length && product.surface.length) {
    score -= 8; // superfície explicitamente diferente (ex.: esmalte de madeira/metal para PAREDE): sai da lista
    notes.push(`As superfícies indicadas no catálogo para este produto (${product.surface.join(", ")}) não incluem a que o cliente pediu.`);
  }
  // [CATÁLOGO NOVO] COR NUNCA decide se o produto serve para o caso (isso é ambiente/superfície/categoria).
  // Ela só serve para ORDENAR os produtos que já servem e para informar cores exatas/próximas. Por isso não soma pontos.
  const colors = colorMatches(product, need);
  if (colors.exact.length) reasons.push("cor pedida disponível no cadastro");
  else if (colors.similar.length) reasons.push("tons próximos da cor pedida no cadastro");
  else if (need.color && productColors(product).length) notes.push(`Este produto não tem, entre as cores cadastradas, a cor "${need.color}" nem tons próximos.`);
  // Termos citados aparecendo no nome/descrição: +1 cada (máx. 2)
  const text = normalizeText(`${product.name} ${product.description}`);
  const textHits = Math.min(2, freeTerms.filter((t) => normalizeText(t).length >= 4 && text.includes(normalizeText(t))).length);
  if (textHits) {
    score += textHits;
    reasons.push("descrição menciona o assunto");
  }
  // Produto citado pelo nome: +10 (nome igual/contido) ou +8 (todas as palavras do pedido estão no nome).
  if (need.product_name) {
    const asked = normalizeText(need.product_name);
    const nameText = normalizeText(product.name);
    const words = asked.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC_WORDS.includes(w));
    if (termsMatch(asked, nameText)) {
      score += 10;
      reasons.push("nome do produto citado pelo cliente");
    } else if (words.length && words.every((w) => nameText.includes(w))) {
      score += 8;
      reasons.push("nome do produto citado pelo cliente");
    }
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
  // Se o catálogo só usa termos genéricos (Interior/Exterior) e não sabemos o tipo pedido, não dá para julgar: sem aviso.
  const askedEnv = need.environment || typeTerm;
  const onlyGenericEnvs = product.environments.length > 0 && product.environments.every((e) => GENERIC_ENVS.includes(normalizeText(e)));
  if (askedEnv && product.environments.length && !envHit && !(onlyGenericEnvs && !typeTerm)) {
    notes.push(`O catálogo indica este produto para: ${product.environments.join(", ")} (e não para "${askedEnv}").`);
  }
  // [CATÁLOGO NOVO] O cadastro diz explicitamente que o produto é de OUTRO tipo de ambiente (ex.: só Interior e o cliente
  // quer área externa): perde 3 pontos para não competir com produtos próprios para o ambiente pedido.
  if (typeTerm && product.environments.length && !envHit) score -= 3;
  return { score, reasons, notes, matchingColors: colors.exact, similarColors: colors.similar, problemMentioned: problemMentioned(product, need) };
}

// Nível de compatibilidade legível a partir da pontuação.
function levelFromScore(score) {
  if (score >= 8) return "alta";
  if (score >= 5) return "média";
  return "baixa";
}

// Chave de ordenação por preço: produto sem preço cadastrado (0) vai para o fim do empate (não vira "o mais barato").
function priceKey(product) {
  return product.price > 0 ? product.price : Number.MAX_SAFE_INTEGER;
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
      // Cabe no orçamento? [CATÁLOGO NOVO] Preço 0/vazio = "ainda não cadastrado": não dá para afirmar nada (null).
      within_budget: budget === null || !(s.product.price > 0) ? null : s.product.price <= budget,
      matching_colors: s.matchingColors, // cores cadastradas que SÃO a cor pedida
      similar_colors: s.similarColors, // cores cadastradas PRÓXIMAS da pedida (mesma família/vizinhas na roda de cores)
      color_rank: s.matchingColors.length ? 2 : s.similarColors.length ? 1 : 0, // cor exata > tom próximo > sem cor
      problem_in_description: s.problemMentioned, // o problema citado aparece no cadastro do produto?
    });
    // DISPONÍVEIS: estoque > 0. Ordena: dentro do orçamento, maior pontuação, menor preço.
    const available = relevant
      .filter((s) => s.product.stock > 0)
      .map(decorate)
      .sort((a, b) => (b.within_budget === true) - (a.within_budget === true) || b.color_rank - a.color_rank || b.score - a.score || priceKey(a.product) - priceKey(b.product) || 0);
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

module.exports = { normalizeText, termsMatch, buildVocabulary, scoreProduct, searchProducts, productColors, colorMatches };