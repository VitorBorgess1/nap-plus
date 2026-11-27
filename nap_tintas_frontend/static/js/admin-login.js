document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".login-form");
  const error = document.querySelector(".login-error");
  const submit = document.querySelector(".login-submit");
  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.elements.email.value,
            password: form.elements.password.value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Não foi possível entrar.");
        window.location.href = "/admin";
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
      }
    });
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
