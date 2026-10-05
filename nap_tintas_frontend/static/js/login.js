/* ============================================================
   LOGIN DO CLIENTE — somente frontend (demonstração)
   ------------------------------------------------------------
   Valida os campos, "autentica" guardando o cliente no navegador
   (veja getCustomer/saveCustomer em common.js) e redireciona.

   Ao ligar o backend, troque o trecho marcado com [BACKEND] por:
       const res = await fetch("/api/login", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ email, password, remember })
       });
   e trate erros (401 → "E-mail ou senha incorretos").
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("customer-login-form");
    if (!form) return;

    const email = document.getElementById("customer-email");
    const password = document.getElementById("customer-password");
    const remember = document.getElementById("customer-remember");
    const submit = form.querySelector(".login-submit");
    const submitLabel = form.querySelector(".login-submit-label");
    const toggle = form.querySelector(".password-toggle");
    const status = document.getElementById("login-status");

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const MIN_PASSWORD = 6;

    /* ---------- Mensagens ---------- */

    function showStatus(type, message) {
        status.className = `login-status is-${type}`;
        status.textContent = message;
        status.hidden = false;
    }

    function hideStatus() {
        status.hidden = true;
        status.textContent = "";
    }

    function setFieldError(input, message) {
        const error = document.getElementById(input.getAttribute("aria-describedby"));
        error.textContent = message;
        input.setAttribute("aria-invalid", message ? "true" : "false");
        return !message;
    }

    /* ---------- Validação ---------- */

    function validateEmail() {
        const value = email.value.trim();
        if (!value) return setFieldError(email, "Informe seu e-mail.");
        if (!EMAIL_RE.test(value)) return setFieldError(email, "Digite um e-mail válido, como nome@exemplo.com.");
        return setFieldError(email, "");
    }

    function validatePassword() {
        if (!password.value) return setFieldError(password, "Informe sua senha.");
        if (password.value.length < MIN_PASSWORD) {
            return setFieldError(password, `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
        }
        return setFieldError(password, "");
    }

    // Some com o erro assim que o campo volta a ficar válido.
    email.addEventListener("input", () => {
        if (email.getAttribute("aria-invalid") === "true") validateEmail();
    });
    password.addEventListener("input", () => {
        if (password.getAttribute("aria-invalid") === "true") validatePassword();
    });

    /* ---------- Mostrar / ocultar senha ---------- */

    toggle.addEventListener("click", () => {
        const visible = password.type === "text";
        password.type = visible ? "password" : "text";
        toggle.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
        toggle.innerHTML = icon(visible ? "eye" : "eye-off");
    });

    /* ---------- Links que dependem do backend ---------- */

    document.querySelectorAll("[data-soon]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            showStatus("info", link.dataset.soon);
        });
    });

    /* ---------- Envio ---------- */

    // Só aceita caminhos internos (evita redirecionar para outro site).
    function nextUrl() {
        const next = new URLSearchParams(window.location.search).get("next");
        return next && /^\/(?![\/\\])/.test(next) ? next : "/";
    }

    function nameFromEmail(value) {
        const first = value.split("@")[0].split(/[._\-+]/)[0] || "cliente";
        return first.charAt(0).toUpperCase() + first.slice(1);
    }

    function setLoading(loading) {
        submit.disabled = loading;
        submitLabel.textContent = loading ? "Entrando…" : "Entrar";
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        hideStatus();

        const emailOk = validateEmail();
        const passwordOk = validatePassword();
        if (!emailOk) return email.focus();
        if (!passwordOk) return password.focus();

        setLoading(true);

        // [BACKEND] Simulação: qualquer e-mail válido + senha com 6+ caracteres entra.
        setTimeout(() => {
            const value = email.value.trim().toLowerCase();
            saveCustomer(
                { email: value, name: nameFromEmail(value), loggedAt: new Date().toISOString() },
                remember.checked
            );
            showStatus("success", "Login realizado! Redirecionando…");
            window.location.href = nextUrl();
        }, 700);
    });
});
