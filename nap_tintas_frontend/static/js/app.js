/* ============================================================
   APP.JS — página inicial (assistente inteligente NAP+)
   ============================================================ */

let aiHistory = [];

async function getRecommendations() {
    const input = document.getElementById("problem-input");
    const result = document.getElementById("recommendations");
    const button = document.getElementById("recommend-btn");

    if (!input || !result || !button) return;

    button.addEventListener("click", async () => {
        const message = input.value.trim();

        if (!message) {
            result.innerHTML = `
                <div class="ai-response">
                    <p>Descreva sua necessidade primeiro.</p>
                </div>
            `;
            return;
        }

        button.disabled = true;
        button.textContent = "Analisando...";

        result.innerHTML = `
            <div class="ai-response">
                <p>Pensando na melhor recomendação...</p>
            </div>
        `;

        try {
            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: message,
                    history: aiHistory
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Erro ao consultar a assistente."
                );
            }

            // Guarda o histórico da conversa
            aiHistory.push({
                role: "user",
                text: message
            });

            if (data.message) {
                aiHistory.push({
                    role: "assistant",
                    text: data.message
                });
            }

            let html = "";

            // ====================================================
            // RESPOSTA DA IA
            // ====================================================

            if (data.message) {
                html += `
                    <div class="ai-response">
                        <p>${data.message}</p>
                    </div>
                `;
            }

            // ====================================================
            // PRODUTOS RECOMENDADOS
            // ====================================================

            const products = data.products || [];

            if (products.length) {
                html += products.map(product => `
                    <article class="mini-product">
                        <small>
                            ${product.brand} · ${product.category}
                        </small>

                        <h3>${product.name}</h3>

                        <p>${product.description}</p>

                        <strong>
                            R$ ${Number(product.price)
                                .toFixed(2)
                                .replace(".", ",")}
                        </strong>
                    </article>
                `).join("");
            }

            // Caso a IA não tenha retornado absolutamente nada
            if (!html) {
                html = `
                    <div class="ai-response">
                        <p>
                            Não encontrei uma recomendação para essa necessidade.
                            Tente descrever melhor o que você deseja pintar.
                        </p>
                    </div>
                `;
            }

            result.innerHTML = html;

            // Limpa o campo depois da pergunta
            input.value = "";

        } catch (error) {

            result.innerHTML = `
                <div class="ai-response">
                    <p>${error.message}</p>
                </div>
            `;

        } finally {

            button.disabled = false;

            button.innerHTML =
                `Encontrar produtos ${icon("arrow-right")}`;
        }
    });
}

document.addEventListener(
    "DOMContentLoaded",
    getRecommendations
);