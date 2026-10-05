/* ============================================================
   COMMON.JS — carregado em TODAS as páginas (via base.html)
   Reúne o que antes se repetia em app.js, products.js e
   checkout.js: carrinho, formatação de moeda e ícones.
   ============================================================ */

const CART_KEY = "nap_tintas_cart";

/* ---------- Carrinho (localStorage) ---------- */

function getCart() {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function updateCartCount() {
    const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("#cart-count").forEach(el => {
        el.textContent = count;
    });
}

function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(item => item.id === product.id);

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }

    saveCart(cart);
    updateCartCount();
}

/* ---------- Moeda ---------- */

function money(value) {
    return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

/* ---------- Ícones (Lucide) ----------
   Os ícones ficam num sprite SVG em templates/partials/_icons.html.
   Para usar em JS:  icon("check")
   Para usar em HTML: {{ icon('check') }}  (macro em partials/_macros.html) */

const icon = name =>
    `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

/* ---------- Sessão do cliente (DEMO — só no navegador) ----------
   Enquanto não há backend, o "login" apenas guarda o cliente no navegador:
   localStorage se marcou "Lembrar acesso", senão sessionStorage.
   Ao ligar o backend, troque getCustomer/saveCustomer/logoutCustomer por
   chamadas de API (ex.: GET /api/me, POST /api/login, POST /api/logout). */

const CUSTOMER_KEY = "nap_tintas_customer";

function getCustomer() {
    try {
        return JSON.parse(
            sessionStorage.getItem(CUSTOMER_KEY) ||
            localStorage.getItem(CUSTOMER_KEY) ||
            "null"
        );
    } catch {
        return null;
    }
}

function saveCustomer(customer, remember = false) {
    sessionStorage.removeItem(CUSTOMER_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    (remember ? localStorage : sessionStorage)
        .setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

function logoutCustomer() {
    sessionStorage.removeItem(CUSTOMER_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    updateAccountLink();
}

function updateAccountLink() {
    const link = document.getElementById("account-link");
    const menu = document.getElementById("account-menu");
    if (!link || !menu) return;

    const customer = getCustomer();
    link.hidden = Boolean(customer);
    menu.hidden = !customer;

    if (customer) {
        const name = customer.name || customer.email;
        const avatar = document.getElementById("account-avatar");
        avatar.textContent = name.charAt(0).toUpperCase();
        avatar.title = `Olá, ${name}`;
        avatar.setAttribute("aria-label", `Conectado como ${name}`);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();
    updateAccountLink();

    const logout = document.getElementById("logout-button");
    if (logout) logout.addEventListener("click", logoutCustomer);
});
