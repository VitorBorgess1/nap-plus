/* ============================================================
   PRODUCTS.JS — página de catálogo
   Depende de common.js (money, addToCart, icon...)
   ============================================================ */

let products = [];

function handleProductImageError(img, iconName = "palette") {
    const frame = img.closest(".product-image-frame");
    if (!frame) return;
    frame.innerHTML = `<div class="product-image-placeholder"><span>${icon(iconName)}</span></div>`;
}

function normalize(value) {
    return (value || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function productSearchText(product) {
    return normalize([
        product.name, product.brand, product.category, product.finish,
        product.description, product.surface, product.environments,
        product.purposes, product.tags
    ].flat().join(" "));
}

function matchesSearch(product, search) {
    if (!search) return true;
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    const text = productSearchText(product);
    return terms.every(term => text.includes(term));
}

function renderProducts() {
    const grid = document.getElementById("product-grid");
    const search = document.getElementById("search-input").value;
    const category = document.getElementById("category-filter").value;
    const finish = document.getElementById("finish-filter").value;
    const brand = document.getElementById("brand-filter").value;

    const filtered = products.filter(product => matchesSearch(product, search) && (!category || product.category === category) && (!finish || product.finish === finish) && (!brand || product.brand === brand));

    const count = document.getElementById("results-count");
    count.textContent = `${filtered.length} ${filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}`;

    const active = document.getElementById("active-filter");
    const activeParts = [];
    if (search) activeParts.push(`busca: “${search}”`);
    if (category) activeParts.push(`categoria: ${category}`);
    if (finish) activeParts.push(`acabamento: ${finish}`);
    if (brand) activeParts.push(`marca: ${brand}`);
    active.hidden = activeParts.length === 0;
    active.textContent = activeParts.length ? `Filtros ativos — ${activeParts.join(" · ")}` : "";

    if (!filtered.length) {
        grid.innerHTML = `<div class="empty-catalog"><div>${icon("search-x")}</div><h3>Nenhum produto encontrado</h3><p>Tente outro termo ou limpe os filtros. Se preferir, use o recomendador para descobrir o produto ideal.</p><button class="btn btn-primary" type="button" onclick="resetFilters()">Limpar filtros</button></div>`;
        return;
    }

    grid.innerHTML = filtered.map(product => `
        <article class="product-card">
            <div class="product-visual ${product.image ? "has-product-image" : ""}">${product.image ? `<div class="product-image-frame"><img src="${product.image}" alt="${product.name}" loading="lazy" referrerpolicy="no-referrer" onerror="handleProductImageError(this, '${product.icon || "palette"}')"></div>` : `<div class="product-image-placeholder"><span>${icon(product.icon || "palette")}</span></div>`}<small>${product.category}</small></div>
            <div class="product-info">
                <span class="product-brand">${product.brand}</span>
                <h3>${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-tags">
                    ${(product.surface || []).slice(0, 2).map(tag => `<span>${tag}</span>`).join("")}
                    ${(product.environments || []).slice(0, 2).map(tag => `<span>${tag}</span>`).join("")}
                </div>
                <div class="product-meta"><span>${product.finish}</span><span>${product.stock} em estoque</span></div>
                <div class="product-price">${money(product.price)}</div>
                <button class="btn btn-primary full-width" onclick="addProduct(${product.id})">Adicionar ao carrinho</button>
            </div>
        </article>`).join("");
}

function scrollToProducts() {
    document.getElementById("produtos-lista").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setSearch(value) {
    document.getElementById("search-input").value = value;
    document.getElementById("category-filter").value = "";
    document.getElementById("finish-filter").value = "";
    document.getElementById("brand-filter").value = "";
    renderProducts();
    scrollToProducts();
}

function resetFilters() {
    document.getElementById("search-input").value = "";
    document.getElementById("category-filter").value = "";
    document.getElementById("finish-filter").value = "";
    document.getElementById("brand-filter").value = "";
    renderProducts();
}

async function loadProducts() {
    try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error("Falha ao carregar produtos");
        products = await response.json();
        const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
        const brandFilter = document.getElementById("brand-filter");
        brands.forEach(brand => {
            const option = document.createElement("option");
            option.value = brand;
            option.textContent = brand;
            brandFilter.appendChild(option);
        });
        renderProducts();
    } catch (error) {
        document.getElementById("product-grid").innerHTML = "<p>Não foi possível carregar o catálogo agora.</p>";
    }
}

function addProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    addToCart(product);
    const toast = document.getElementById("toast");
    toast.textContent = `${product.name} adicionado ao carrinho.`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
}

document.addEventListener("DOMContentLoaded", () => {
    loadProducts();
    document.getElementById("search-input").addEventListener("input", renderProducts);
    document.getElementById("category-filter").addEventListener("change", renderProducts);
    document.getElementById("finish-filter").addEventListener("change", renderProducts);
    document.getElementById("brand-filter").addEventListener("change", renderProducts);
    document.getElementById("reset-filters").addEventListener("click", resetFilters);
    document.getElementById("clear-search").addEventListener("click", () => setSearch(""));
    document.getElementById("show-all").addEventListener("click", () => { resetFilters(); scrollToProducts(); });
    document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
        document.getElementById("category-filter").value = button.dataset.category;
        document.getElementById("search-input").value = "";
        document.getElementById("finish-filter").value = "";
        document.getElementById("brand-filter").value = "";
        renderProducts();
        scrollToProducts();
    }));
    document.querySelectorAll("[data-search]").forEach(button => button.addEventListener("click", () => setSearch(button.dataset.search)));
});
