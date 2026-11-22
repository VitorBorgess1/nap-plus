/* ============================================================
   APP.JS — página inicial (assistente inteligente NAP+)
   ============================================================ */

let aiHistory = [];

// [CATÁLOGO NOVO] Evita que texto vindo da IA/banco seja interpretado como HTML.
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// [CATÁLOGO NOVO] Com preço cadastrado mostra o valor; sem preço (0/vazio no banco) manda consultar a equipe, nunca "R$ 0,00".
function formatPrice(price) {
    const value = Number(price);
    return value > 0 ? `R$ ${value.toFixed(2).replace(".", ",")}` : "Consulte a equipe NAP";
}

async function getRecommendations() {
    const input = document.getElementById("problem-input");
    const result = document.getElementById("recommendations");
    const button = document.getElementById("recommend-btn");

    if (!input || !result || !button) return;

    // [ENTER PARA ENVIAR] Enter envia a mensagem; Shift+Enter continua pulando linha na caixa de texto.
    input.addEventListener("keydown", (event) => {
        // isComposing = o usuário está escolhendo uma letra acentuada/IME: não deve enviar nesse momento.
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();          // impede o "pular linha" padrão do Enter
            if (!button.disabled) button.click(); // reaproveita o mesmo envio do botão (e ignora se já está enviando)
        }
    });

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
                        <p>${escapeHtml(data.message)}</p>
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
                            ${escapeHtml(product.brand)} · ${escapeHtml(product.category)}
                        </small>

                        <h3>${escapeHtml(product.name)}</h3>

                        <p>${escapeHtml(product.description)}</p>

                        <strong>
                            ${formatPrice(product.price)}
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
                    <p>${escapeHtml(error.message)}</p>
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