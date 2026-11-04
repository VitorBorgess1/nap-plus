// config.js - lê o arquivo .env e centraliza TODAS as configurações da IA em um único lugar.

require("dotenv").config(); // carrega as variáveis do arquivo .env para dentro de process.env
const path = require("path"); // módulo nativo do Node para montar caminhos de arquivos

const config = {
  // Chave do Gemini: vem SOMENTE do .env (nunca escrita no código, nunca enviada ao navegador).
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Modelo principal do Gemini (pode ser trocado no .env sem mexer no código).
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  // Modelo reserva: usado automaticamente se o principal falhar (erro 404/429/5xx).
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite",
  // Porta onde o servidor da IA vai rodar (o Flask do site usa a 5000, então usamos 3001).
  port: Number(process.env.PORT) || 3001,
  // Endereços do site que têm permissão de chamar a IA (proteção CORS).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5000,http://localhost:5000")
    .split(",")            // separa a lista por vírgula
    .map((o) => o.trim())  // tira espaços
    .filter(Boolean),      // remove itens vazios
  // De onde vêm os produtos: "json" (arquivo local) ou "supabase" (banco de dados).
  productsSource: process.env.PRODUCTS_SOURCE || "json",
  // Credenciais do Supabase (usadas só quando PRODUCTS_SOURCE=supabase). Ficam SOMENTE no .env.
  // Aceita a URL com ou sem barra no final e com ou sem "/rest/v1" (o painel do Supabase mostra as duas formas).
  supabaseUrl: (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""),
  supabaseKey: process.env.SUPABASE_KEY || "",
  // Nome da tabela de produtos no Supabase.
  supabaseTable: process.env.SUPABASE_TABLE || "products",
  // Tabela onde fica a quantidade em estoque (colunas "produto_id" e "quantidade"). Deixe vazio para ler o estoque da própria tabela de produtos.
  supabaseStockTable: process.env.SUPABASE_STOCK_TABLE ?? "estoque",
  // Por quantos segundos reaproveitar a lista de produtos (0 = sempre buscar do Supabase).
  supabaseCacheSeconds: Number(process.env.SUPABASE_CACHE_SECONDS ?? 10),
  // Arquivo de produtos: por padrão usa o MESMO data/products.json do site (estoque sempre atual).
  productsFile:
    process.env.PRODUCTS_FILE || path.join(__dirname, "..", "data", "products.json"),
  // Cópia de segurança dos produtos, usada se o arquivo acima não existir.
  productsTestFile: path.join(__dirname, "products-test.json"),
  // Máximo de produtos mostrados por resposta.
  maxRecommendations: 4,
  // Tamanho máximo da mensagem do cliente (mesmo limite do textarea do site).
  maxMessageLength: 600,
  // Quantas mensagens antigas da conversa são enviadas ao Gemini como contexto.
  maxHistoryMessages: 8,
  // Limite de pedidos por minuto por IP (protege sua cota/custo do Gemini).
  rateLimitPerMinute: 20,
};

module.exports = config; // deixa o objeto disponível para os outros arquivos