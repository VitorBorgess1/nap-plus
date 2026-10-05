/* ============================================================
   APP.JS — página inicial (recomendador de produtos)
   Depende de common.js (icon, updateCartCount...)
   ============================================================ */

async function getRecommendations() {
    const input = document.getElementById("problem-input");
    const result = document.getElementById("recommendations");
    const button = document.getElementById("recommend-btn");

    if (!input || !result || !button) return;

    button.addEventListener("click", async () => {
        const problem = input.value.trim();

        if (!problem) {
            result.innerHTML = "<p>Descreva sua necessidade primeiro.</p>";
            return;
        }

        button.disabled = true;
        button.textContent = "Analisando...";

        try {
            const response = await fetch("/api/recommend", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({problem})
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Erro ao recomendar.");
            }

            result.innerHTML = data.recommendations.length
                ? data.recommendations.map(product => `
                    <article class="mini-product">
                        <small>${product.brand} · ${product.category}</small>
                        <h3>${product.name}</h3>
                        <p>${product.description}</p>
                        <strong>R$ ${product.price.toFixed(2).replace(".", ",")}</strong>
                    </article>
                `).join("")
                : "<p>Nenhum produto disponível foi encontrado.</p>";

        } catch (error) {
            result.innerHTML = `<p>${error.message}</p>`;
        } finally {
            button.disabled = false;
            button.innerHTML = `Encontrar produtos ${icon("arrow-right")}`;
        }
    });
}

document.addEventListener("DOMContentLoaded", getRecommendations);
