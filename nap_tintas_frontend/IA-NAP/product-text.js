// product-text.js - transforma a descrição CRUA do banco em um texto que faz sentido para o CLIENTE.
// O banco traz anotações internas ("Cód. loja 900033", "Catálogo fornecido pela equipe; códigos das cores são fictícios")
// e um formato de planilha ("Linha: Premium. Uso / superfícies: ..."). Isso não deve aparecer na loja.
// Esta função só REMOVE e REORGANIZA texto que já existe: nunca acrescenta informação nova.
// (O ideal é a equipe do banco também limpar a coluna "descricao"; enquanto isso, a IA já se protege.)

// Frases internas: se a frase contiver qualquer um destes trechos, ela é descartada.
const INTERNAL_SENTENCE_PATTERNS = [
  /fict[íi]ci/i, // "códigos das cores são fictícios"
  /cat[áa]logo fornecido/i, // "Catálogo fornecido pela equipe"
  /fornecid[oa] pela equipe/i,
  /n[ãa]o informad[oa]s?/i, // "Embalagens: não informadas" (não ajuda o cliente)
  /\bc[óo]d\.?\s*(?:da\s*)?loja\b/i, // "Cód. loja ..." (caso sobre algum resto)
];

// Remove o código interno de loja e o comentário entre parênteses colado nele: "Cód. loja 900639 (vendido como ...)".
const STORE_CODE = /C[óo]d\.?\s*(?:da\s*)?loja\s*:?\s*[\w-]+(?:\s*\([^)]*\))?\.?/gi;

// Deixa as palavras do cadastro mais naturais para quem lê.
function friendly(sentence) {
  let s = sentence.trim();
  s = s.replace(/^Linha:\s*/i, "Linha "); // "Linha: Premium." -> "Linha Premium."
  s = s.replace(/^Uso\s*\/\s*superf[íi]cies:\s*/i, "Indicada para "); // "Uso / superfícies: X" -> "Indicada para X"
  s = s.replace(/\b(?:Exterior e interior|Interior e exterior|Externas? e internas?|Internas? e externas?)\b/gi, "áreas externas e internas");
  s = s.replace(/\bExterior\b/g, "áreas externas").replace(/\bInterior\b/g, "áreas internas");
  s = s.replace(/\bExterna?s\b/g, "áreas externas").replace(/\bInterna?s\b/g, "áreas internas");
  return s;
}

// Recebe a descrição crua e devolve o texto para o cliente ("" se não sobrar nada útil).
function cleanDescription(raw) {
  const text = String(raw || "").replace(STORE_CODE, " "); // 1) tira códigos internos antes de separar as frases
  const sentences = text
    .split(/(?<=[.!?])\s+/) // 2) separa em frases
    .map((s) => s.trim())
    .filter((s) => s && !INTERNAL_SENTENCE_PATTERNS.some((p) => p.test(s))) // 3) descarta frases internas
    .map(friendly) // 4) deixa mais natural
    .map((s) => (/[.!?]$/.test(s) ? s : s + ".")); // 5) garante o ponto final
  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

module.exports = { cleanDescription };
