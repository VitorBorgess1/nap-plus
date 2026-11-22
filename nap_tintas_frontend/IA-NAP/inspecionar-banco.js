// inspecionar-banco.js - RAIO-X do banco: mostra como estão as tabelas do Supabase e como a IA enxerga cada produto.
// Serve só para diagnóstico (não altera nada no banco). Rodar na pasta IA-NAP:
//   node inspecionar-banco.js          -> relatório completo
//   node inspecionar-banco.js cores    -> só as CORES de cada produto + descrição crua x descrição que o cliente vê
// A chave (SUPABASE_KEY / GEMINI_API_KEY) NUNCA é impressa.

const config = require("./config"); // lê o .env (mesmas configurações da IA)
const { SupabaseProductRepository } = require("./product-repository"); // reaproveita a leitura que a IA já usa
const { cleanDescription } = require("./product-text"); // a mesma limpeza de descrição que a IA aplica

// Resume o tipo de um valor (texto, número, lista...) para o relatório.
function typeOf(v) {
  if (v === null || v === undefined) return "vazio";
  if (Array.isArray(v)) return "lista";
  return typeof v === "string" ? "texto" : typeof v; // "texto", "number", "boolean", "object"
}

// Corta textos longos para o relatório não ficar gigante.
function short(v, n = 90) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Mostra as colunas de uma tabela: tipo, quantas linhas preenchidas e valores distintos (se forem poucos).
function describeTable(name, rows) {
  console.log(`\n===== TABELA "${name}" — ${rows.length} linha(s) =====`);
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]; // todas as colunas que aparecem
  for (const col of columns) {
    const values = rows.map((r) => r[col]);
    const filled = values.filter((v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
    const types = [...new Set(filled.map(typeOf))].join("/") || "vazio";
    let line = `  • ${col}  [${types}]  preenchido em ${filled.length}/${rows.length}`;
    // Para colunas "categóricas" (poucos valores diferentes) lista os valores: ajuda a ver categorias, ambientes etc.
    const flat = filled.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => short(v, 50));
    const distinct = [...new Set(flat)];
    if (distinct.length && distinct.length <= 25 && typeOf(filled[0]) !== "number") line += `\n      valores: ${distinct.join(" | ")}`;
    console.log(line);
  }
  console.log(`\n  Exemplo (primeiras 3 linhas):`);
  rows.slice(0, 3).forEach((r, i) => {
    console.log(`  --- linha ${i + 1} ---`);
    for (const [k, v] of Object.entries(r)) console.log(`    ${k}: ${short(v)}`);
  });
}

// Modo "cores": lista TODAS as cores de cada produto e compara a descrição crua com a que o cliente vê.
function printColorsAndDescriptions(products) {
  console.log(`\n===== CORES CADASTRADAS POR PRODUTO (${products.length} produtos) =====`);
  for (const p of products) {
    const cores = p.details && Array.isArray(p.details.cores) ? p.details.cores : [];
    console.log(`\n[${p.id}] ${p.name}  (${p.category})`);
    console.log(`   cores (${cores.length}): ${cores.length ? cores.join(", ") : "nenhuma cadastrada"}`);
  }
  console.log(`\n===== DESCRIÇÃO: CRUA (banco) x COMO O CLIENTE VÊ =====`);
  for (const p of products) {
    console.log(`\n[${p.id}] ${p.name}`);
    console.log(`   CRUA : ${p.description}`);
    console.log(`   LIMPA: ${cleanDescription(p.description) || "(vazia)"}`);
  }
}

async function main() {
  console.log(`Fonte configurada: PRODUCTS_SOURCE=${config.productsSource}`);
  if (config.productsSource !== "supabase") {
    console.log('Dica: para inspecionar o banco, o .env precisa ter PRODUCTS_SOURCE=supabase.');
  }
  console.log(`SUPABASE_URL=${config.supabaseUrl || "(vazia)"}  | tabela de produtos="${config.supabaseTable}"  | tabela de estoque="${config.supabaseStockTable || "(nenhuma)"}"`);
  console.log(`SUPABASE_KEY ${config.supabaseKey ? "configurada" : "NÃO configurada"}`);

  const repo = new SupabaseProductRepository({
    url: config.supabaseUrl, key: config.supabaseKey, table: config.supabaseTable,
    stockTable: config.supabaseStockTable, cacheSeconds: 0,
  });

  // Modo "cores": relatório curto, só o que interessa para conferir cor e descrição.
  if (process.argv[2] === "cores") {
    printColorsAndDescriptions(await repo.listAll());
    return;
  }

  // 1) Dados CRUS, exatamente como estão no banco.
  const rawProducts = await repo.fetchTable(config.supabaseTable);
  describeTable(config.supabaseTable, rawProducts);
  let rawStock = [];
  if (config.supabaseStockTable) {
    rawStock = await repo.fetchTable(config.supabaseStockTable);
    describeTable(config.supabaseStockTable, rawStock);
  }

  // 2) Como a IA ENXERGA os produtos depois da normalização.
  const products = await repo.listAll();
  console.log(`\n===== COMO A IA ENXERGA (${products.length} produto(s) ativos) =====`);
  const fields = ["name", "brand", "category", "finish", "coverage", "description", "surface", "environments", "purposes", "tags"];
  for (const f of fields) {
    const filled = products.filter((p) => (Array.isArray(p[f]) ? p[f].length : String(p[f] || "").trim())).length;
    console.log(`  ${filled === products.length ? "OK     " : filled === 0 ? "VAZIO  " : "PARCIAL"} ${f}: ${filled}/${products.length} produtos preenchidos`);
  }
  const extra = [...new Set(products.flatMap((p) => Object.keys(p.details || {})))];
  console.log(`  Colunas extras que a IA recebe em "details": ${extra.length ? extra.join(", ") : "(nenhuma)"}`);
  const semEstoque = products.filter((p) => p.stock <= 0).length;
  console.log(`  Com estoque: ${products.length - semEstoque} | Sem estoque (0): ${semEstoque}`);
  console.log("\n  Lista completa (id | nome | marca | categoria | preço | estoque):");
  products.forEach((p) => console.log(`   ${p.id} | ${short(p.name, 45)} | ${p.brand} | ${p.category} | R$ ${p.price} | ${p.stock}`));
}

main().catch((err) => {
  console.error("\nERRO ao ler o banco:", err.message); // mensagens já vêm com dicas (chave, tabela, RLS...)
  process.exit(1);
});