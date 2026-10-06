// tests/server.test.js - testa a rota HTTP POST /api/chat de ponta a ponta (sem Gemini real).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../server");
const { createNapAI } = require("../nap-ai");
const { createFakeLLM } = require("./helpers/fake-llm");
const { createFakeRepository, SAMPLE_PRODUCTS } = require("./helpers/fake-repository");

const config = {
  maxRecommendations: 4, maxMessageLength: 600, maxHistoryMessages: 8,
  allowedOrigins: ["http://127.0.0.1:5000"], rateLimitPerMinute: 20, geminiApiKey: "fake",
};

function startServer() {
  const ai = createNapAI({ llm: createFakeLLM(), repository: createFakeRepository(SAMPLE_PRODUCTS), config });
  const app = createApp(ai, config);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function postChat(port, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path: "/api/chat", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test("POST /api/chat responde com produtos reais para uma mensagem válida", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    const { status, body } = await postChat(port, { message: "Quero pintar minha sala.", history: [] });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.products));
  } finally {
    server.close();
  }
});

test("POST /api/chat rejeita mensagem vazia com 400", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    const { status } = await postChat(port, { message: "   " });
    assert.equal(status, 400);
  } finally {
    server.close();
  }
});
