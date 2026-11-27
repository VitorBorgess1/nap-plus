/* ============================================================
   CHECKOUT.JS — página de checkout
   Depende de common.js (getCart, saveCart, money, icon...)
   ============================================================ */

// O carrinho guarda preço e nome de quando o produto foi adicionado. Antes de mostrar o total,
// confere com o catálogo atual: preço mudou, produto saiu da loja ou o estoque diminuiu.
async function syncCartWithCatalog() {
    const cart = getCart();
    if (!cart.length) return;
    let catalog;
    try {
        const response = await fetch("/api/products", { cache: "no-store" });
        if (!response.ok) return;
        catalog = await response.json();
    } catch {
        return;   // sem conexão: o servidor confere tudo de novo ao enviar o pedido
    }
    const byId = new Map(catalog.map(p => [String(p.id), p]));
    const notes = [];
    const synced = [];
    cart.forEach(item => {
        const product = byId.get(String(item.id));
        if (!product) { notes.push(`${item.name} não está mais disponível e saiu do carrinho.`); return; }
        if (product.price !== item.price) notes.push(`O preço de ${product.name} mudou para ${money(product.price)}.`);
        let quantity = item.quantity;
        if (quantity > product.stock) {
            quantity = product.stock;
            notes.push(`${product.name}: só há ${product.stock} em estoque, ajustamos a quantidade.`);
        }
        synced.push({ ...item, name: product.name, price: product.price, quantity });
    });
    if (JSON.stringify(synced) !== JSON.stringify(cart)) {
        saveCart(synced);
        updateCartCount();
    }
    const box = document.getElementById("cart-notes");
    if (box && notes.length) {
        box.innerHTML = notes.map(n => `<div class="error-message">${n}</div>`).join("");
    }
}

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
    button.textContent = "Enviando pedido...";

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
                <strong>Pedido recebido!</strong>
                <p>Número: ${data.order.id}</p>
                <p>Total: ${money(data.order.total)}</p>
                <small>Enviaremos as instruções de pagamento para ${data.order.customer.email}. O pedido só é separado depois da confirmação do pagamento.</small>
            </div>
        `;

        localStorage.removeItem(CART_KEY);
        renderCart();
        updateCartCount();

    } catch (error) {
        result.innerHTML = `<div class="error-message">${error.message}</div>`;
    } finally {
        button.disabled = false;
        button.innerHTML = `Enviar pedido ${icon("arrow-right")}`;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await syncCartWithCatalog();
    renderCart();
    document.getElementById("payment-form")
        .addEventListener("submit", submitPayment);
});
