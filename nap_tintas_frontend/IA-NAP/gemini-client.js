// gemini-client.js - ÚNICO arquivo que conversa com a API do Google Gemini (via HTTPS, no backend).
// A chave vem de config.js (.env). Nunca é impressa em log nem enviada ao navegador.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"; // endereço oficial da API

// Erro próprio para sabermos que o problema veio do Gemini.
class GeminiError extends Error {
  constructor(message, status) {
    super(message); // guarda a mensagem
    this.name = "GeminiError"; // nome do erro
    this.status = status; // código HTTP (ex.: 429)
  }
}

// Extrai um objeto JSON do texto devolvido pelo modelo (remove ```json ... ``` se vier).
function parseJsonText(text) {
  const clean = String(text).replace(/```json|```/gi, "").trim(); // tira cercas de markdown
  try {
    return JSON.parse(clean); // caso normal: já é JSON puro
  } catch {
    const start = clean.indexOf("{"); // procura o primeiro {
    const end = clean.lastIndexOf("}"); // e o último }
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)); // tenta só o trecho
    throw new GeminiError("O Gemini não devolveu um JSON válido.");
  }
}

// Cria o cliente. "fetchImpl" permite trocar o fetch nos testes (sem chamar a internet).
function createGeminiClient({ apiKey, model, fallbackModel, timeoutMs = 45000, fetchImpl = fetch }) {
  // Faz UMA chamada a UM modelo.
  async function callModel(modelName, { system, contents, temperature, schema }) {
    const controller = new AbortController(); // permite cancelar se demorar demais
    const timer = setTimeout(() => controller.abort(), timeoutMs); // cancela após o tempo limite
    try {
      const response = await fetchImpl(`${ENDPOINT}/${modelName}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // enviamos JSON
          "x-goog-api-key": apiKey, // chave no cabeçalho (não vai na URL)
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] }, // regras fixas do assistente
          contents, // conversa (papéis "user" e "model")
          generationConfig: {
            responseMimeType: "application/json", // pede resposta em JSON
            // [CORREÇÃO] responseSchema OBRIGA o Gemini a devolver exatamente os campos
            // que o código espera. Sem isso, o modelo só "tentava" seguir o formato
            // descrito em texto no prompt, e às vezes devolvia uma estrutura um pouco
            // diferente — o que fazia a IA parecer "sem resposta" ou "sem recomendação".
            ...(schema ? { responseSchema: schema } : {}),
            temperature, // baixa = mais estável e menos "criativo"
          },
        }),
        signal: controller.signal, // liga o cancelamento
      });
      if (!response.ok) {
        // Lê só o começo do corpo do erro (sem a chave) para facilitar o diagnóstico.
        const body = (await response.text()).slice(0, 300);
        throw new GeminiError(`Gemini respondeu HTTP ${response.status}: ${body}`, response.status);
      }
      const data = await response.json(); // resposta completa
      const parts = data?.candidates?.[0]?.content?.parts || []; // partes do texto
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(""); // junta o texto (ignora "pensamentos")
      if (!text) throw new GeminiError("Resposta vazia do Gemini (possível bloqueio de segurança).");
      return parseJsonText(text); // devolve o objeto JSON já convertido
    } catch (err) {
      if (err.name === "AbortError") throw new GeminiError("Tempo esgotado ao chamar o Gemini.", 408);
      throw err;
    } finally {
      clearTimeout(timer); // limpa o cronômetro
    }
  }

  // Só vale tentar o modelo reserva quando o erro pode ser do modelo/capacidade (não de chave inválida).
  const canFallback = (err) => !err.status || [404, 408, 429, 500, 502, 503, 504].includes(err.status);

  return {
    // Pede ao Gemini uma resposta em JSON; tenta o modelo reserva se o principal falhar.
    async generateJson({ system, contents, temperature = 0.2, schema }) {
      if (!apiKey) throw new GeminiError("GEMINI_API_KEY não configurada no .env da IA-NAP.", 503);
      try {
        return await callModel(model, { system, contents, temperature, schema });
      } catch (err) {
        // [DIAGNÓSTICO] Mostra no terminal (npm start) a causa real do erro do Gemini
        // (ex.: "HTTP 404" = nome de modelo inválido/sem acesso, "HTTP 429" = cota excedida).
        console.warn(`[IA-NAP] Falha no modelo "${model}": ${err.message}`);
        if (fallbackModel && fallbackModel !== model && canFallback(err)) {
          try {
            return await callModel(fallbackModel, { system, contents, temperature, schema }); // segunda chance
          } catch (err2) {
            console.warn(`[IA-NAP] Falha no modelo reserva "${fallbackModel}": ${err2.message}`);
            throw err2;
          }
        }
        throw err;
      }
    },
  };
}

module.exports = { createGeminiClient, GeminiError, parseJsonText };
