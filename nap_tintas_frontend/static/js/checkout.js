/* ============================================================
   CHECKOUT.JS — página de checkout
   Depende de common.js (getCart, saveCart, money, icon...)
   ============================================================ */

function renderCart() {
    const cart = getCart();
    const container = document.getElementById("cart-items");

    if (!cart.length) {
        container.innerHTML = "<p>Seu carrinho está vazio.</p>";
        document.getElementById("cart-total").textContent = money(0);
        return;
    }

    let total = 0;

    container.innerHTML = cart.map((item, index) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;

        return `
            <div class="cart-row">
                <div>
                    <strong>${item.name}</strong>
                    <div>${money(item.price)} cada</div>
                </div>

                <div class="quantity-control">
                    <button type="button" onclick="changeQuantity(${index}, -1)" aria-label="Diminuir quantidade">${icon("minus")}</button>
                    <span>${item.quantity}</span>
                    <button type="button" onclick="changeQuantity(${index}, 1)" aria-label="Aumentar quantidade">${icon("plus")}</button>
                </div>

                <strong>${money(subtotal)}</strong>
            </div>
        `;
    }).join("");

    document.getElementById("cart-total").textContent = money(total);
}

function changeQuantity(index, delta) {
    const cart = getCart();

    cart[index].quantity += delta;

    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }

    saveCart(cart);
    renderCart();
    updateCartCount();
}

async function submitPayment(event) {
    event.preventDefault();

    const cart = getCart();
    const result = document.getElementById("payment-result");

    if (!cart.length) {
        result.innerHTML = `<div class="error-message">Adicione produtos ao carrinho.</div>`;
        return;
    }

    const customer = {
        name: document.getElementById("customer-name").value,
        email: document.getElementById("customer-email").value,
        document: document.getElementById("customer-document").value
    };

    const button = event.target.querySelector("button");
    button.disabled = true;
    button.textContent = "Criando pedido...";

    try {
        const response = await fetch("/api/payment", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({items: cart, customer})
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Não foi possível criar o pedido.");
        }

        result.innerHTML = `
            <div class="success-message">
                <strong>Pedido criado!</strong>
                <p>Número: ${data.order.id}</p>
                <p>Total: ${money(data.order.total)}</p>
                <small>Modo demonstrativo: nenhum pagamento real foi processado.</small>
            </div>
        `;

        localStorage.removeItem(CART_KEY);
        renderCart();
        updateCartCount();

    } catch (error) {
        result.innerHTML = `<div class="error-message">${error.message}</div>`;
    } finally {
        button.disabled = false;
        button.innerHTML = `Criar pedido ${icon("arrow-right")}`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    renderCart();
    document.getElementById("payment-form")
        .addEventListener("submit", submitPayment);
});
