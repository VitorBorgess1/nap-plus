document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".login-form");
  const enter = document.querySelector(".login-submit");
  // Demonstração: ainda sem autenticação, apenas leva ao painel.
  if (form && enter) {
    const go = () => { window.location.href = "/admin"; };
    enter.addEventListener("click", go);
    form.addEventListener("submit", e => { e.preventDefault(); go(); });
  }
  const toggle = document.querySelector(".password-toggle");
  const input = document.querySelector("#admin-password");
  if (!toggle || !input) return;
  toggle.addEventListener("click", () => {
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
    toggle.textContent = visible ? "⌣" : "◉";
  });
});
