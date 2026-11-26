(function (NG) {
  function showGate(message) {
    document.documentElement.classList.add("auth-locked");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.hidden = false;
    const status = document.getElementById("auth-status");
    if (status && message) status.textContent = message;
  }

  function showApp() {
    document.documentElement.classList.remove("auth-locked");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.hidden = true;
    if (typeof NG.startApp === "function") NG.startApp();
  }

  function applyUser(user) {
    const name = document.getElementById("current-user");
    if (name) name.textContent = user.displayName || user.username || "";
    const link = document.getElementById("link-admin");
    if (link) link.hidden = user.role !== "admin";
  }

  async function currentUser() {
    const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const data = await res.json().catch(function () { return null; });
    if (!data || data.authenticated !== true) return null;
    return data;
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin" });
    } catch (err) { /* 清除 cookie 失敗時仍離開報價畫面 */ }
    location.href = "/login";
  }

  async function boot() {
    const button = document.getElementById("btn-logout");
    if (button) button.addEventListener("click", logout);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (document.documentElement.classList.contains("auth-locked")) return;
      currentUser().then(function (user) {
        if (!user) location.href = "/login";
      }).catch(function () { /* 網路暫時失敗時留在已登入的畫面 */ });
    });

    try {
      const user = await currentUser();
      if (!user) {
        location.href = "/login";
        return;
      }
      applyUser(user);
      showApp();
    } catch (err) {
      showGate("無法確認登入狀態");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.NG = window.NG || {});
