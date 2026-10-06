// server.js - servidor HTTP da IA (Express). É o que o site chama: POST /api/chat.
// Rodar: npm start  ->  http://127.0.0.1:3001

const express = require("express");
const config = require("./config");
const { createGeminiClient } = require("./gemini-client");
const { createProductRepository } = require("./product-repository");
const { createNapAI } = require("./nap-ai");

// Monta o app. Recebe "ai" pronto para facilitar testes.
function createApp(ai, cfg = config) {
  const app = express();
  app.use(express.json({ limit: "20kb" })); // lê JSON do corpo (com limite de tamanho)

  // CORS: só os sites da lista ALLOWED_ORIGINS podem chamar a IA pelo navegador.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && cfg.allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin); // libera esse site
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204); // resposta do "pré-voo" do navegador
    next();
  });

  // Limite simples de pedidos por IP (memória) para proteger a cota do Gemini.
  const hits = new Map();
  app.use("/api/chat", (req, res, next) => {
    const now = Date.now();
    const list = (hits.get(req.ip) || []).filter((t) => now - t < 60000); // pedidos do último minuto
    if (list.length >= cfg.rateLimitPerMinute) {
      return res.status(429).json({ message: "Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente." });
    }
    list.push(now);
    hits.set(req.ip, list);
    next();
  });

  // Rota de saúde: serve para conferir se a IA está no ar e se a chave foi configurada (sem revelar a chave).
  app.get("/health", (req, res) => res.json({ ok: true, gemini_key_configured: Boolean(cfg.geminiApiKey) }));

  // Rota principal da IA.
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body || {};
      const result = await ai.chat({ message, history }); // roda todo o fluxo
      res.json(result);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ message: "Escreva uma mensagem para a assistente." });
      console.error("[IA-NAP] Erro:", err.message); // log no terminal (sem a chave)
      const status = err.status === 503 ? 503 : 502;
      res.status(status).json({ message: "A assistente inteligente está indisponível no momento. Tente novamente em instantes." });
    }
  });

  return app;
}

// Só sobe o servidor se este arquivo for executado diretamente (npm start), não quando importado nos testes.
if (require.main === module) {
  const llm = createGeminiClient({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    fallbackModel: config.geminiFallbackModel,
  });
  const repository = createProductRepository(config);
  const ai = createNapAI({ llm, repository, config });
  if (!config.geminiApiKey) console.warn("⚠️  GEMINI_API_KEY não encontrada. Crie o arquivo .env (veja .env.example).");
  createApp(ai).listen(config.port, "127.0.0.1", () =>
    console.log(`IA-NAP no ar em http://127.0.0.1:${config.port} (modelo: ${config.geminiModel})`)
  );
}

module.exports = { createApp };
