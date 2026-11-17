(function (NG) {
  const TOKEN_KEY = "quoteAuthToken";
  let expiryTimer = 0;
  let verifying = false;

  function isLocal() {
    return location.hostname === "127.0.0.1";
  }

  function authBase() {
    const value = String((NG.config && NG.config.AUTH_URL) || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(value)) return "";
    if (/example\.workers\.dev/i.test(value)) return "";
    if (/REPLACE_ME/i.test(value)) return "";
    return value;
  }

  function readStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function writeStoredToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearStoredToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* 瀏覽器擋下儲存時仍要能鎖回密碼頁 */ }
  }

  function setAppInert(locked) {
    const nodes = document.body.children;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === "auth-gate" || node.tagName === "SCRIPT") continue;
      if (locked) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    }
  }

  function closeDialogs() {
    const dialogs = document.querySelectorAll("dialog");
    for (let i = 0; i < dialogs.length; i++) {
      if (dialogs[i].open) dialogs[i].close();
    }
  }

  function showGate() {
    document.documentElement.classList.remove("auth-skip");
    document.documentElement.classList.add("auth-locked");
    closeDialogs();
    const gate = document.getElementById("auth-gate");
    if (gate) gate.hidden = false;
    setAppInert(true);
    const input = document.getElementById("auth-password");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function showApp() {
    document.documentElement.classList.remove("auth-locked");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.hidden = true;
    setAppInert(false);
    if (typeof NG.startApp === "function") NG.startApp();
  }

  function readExp(token) {
    try {
      const part = String(token || "").split(".")[0];
      if (!/^[A-Za-z0-9_-]+$/.test(part)) return 0;
      const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
      const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
      const data = JSON.parse(binary);
      return data && typeof data.exp === "number" ? data.exp : 0;
    } catch (err) {
      return 0;
    }
  }

  function scheduleRecheck(expiresAt) {
    window.clearTimeout(expiryTimer);
    expiryTimer = 0;
    const exp = Number(expiresAt);
    if (!isFinite(exp) || exp <= Date.now()) return;
    const wait = Math.min(exp - Date.now() + 1000, 2147483647);
    expiryTimer = window.setTimeout(function () { recheck(); }, wait);
  }

  async function verifyToken(token) {
    const base = authBase();
    if (!base) return { ok: false, network: false };
    try {
      const res = await fetch(base + "/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({ token: token }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) return { ok: true, expiresAt: data.expiresAt || readExp(token) };
      return { ok: false, network: false };
    } catch (err) {
      return { ok: false, network: true };
    }
  }

  async function recheck() {
    if (verifying) return;
    if (document.documentElement.classList.contains("auth-locked")) return;
    const token = readStoredToken();
    if (!token) {
      if (!isLocal()) showGate();
      return;
    }
    verifying = true;
    try {
      const result = await verifyToken(token);
      if (result.ok) {
        scheduleRecheck(result.expiresAt);
        return;
      }
      if (result.network) {
        scheduleRecheck(Date.now() + 60 * 1000);
        return;
      }
      lock();
    } finally {
      verifying = false;
    }
  }

  function lock() {
    window.clearTimeout(expiryTimer);
    expiryTimer = 0;
    clearStoredToken();
    const err = document.getElementById("auth-error");
    if (err) err.textContent = "";
    showGate();
  }

  async function onSubmit(event) {
    event.preventDefault();
    const input = document.getElementById("auth-password");
    const button = document.getElementById("auth-enter");
    const errorEl = document.getElementById("auth-error");
    const password = input ? input.value : "";
    const base = authBase();
    if (!base) {
      if (errorEl) errorEl.textContent = "密碼服務尚未設定";
      return;
    }
    if (button) button.disabled = true;
    if (errorEl) errorEl.textContent = "";
    try {
      const res = await fetch(base + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({ password: password }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (res.status === 429) {
        if (errorEl) errorEl.textContent = "錯誤次數過多，請稍後再試";
        return;
      }
      if (!res.ok || !data || typeof data.token !== "string" || !data.token) {
        if (errorEl) errorEl.textContent = res.status === 401 ? "密碼不正確" : "無法登入，請稍後再試";
        return;
      }
      try {
        writeStoredToken(data.token);
      } catch (errStore) {
        if (errorEl) errorEl.textContent = "這個瀏覽器無法保存登入狀態";
        return;
      }
      if (input) input.value = "";
      scheduleRecheck(data.expiresAt || readExp(data.token));
      showApp();
    } catch (networkErr) {
      if (errorEl) errorEl.textContent = "無法連線，請稍後再試";
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function boot() {
    const form = document.getElementById("auth-form");
    const lockButton = document.getElementById("btn-lock");
    if (form) form.addEventListener("submit", onSubmit);
    if (lockButton) lockButton.addEventListener("click", lock);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") recheck();
    });

    if (isLocal()) {
      showApp();
      return;
    }

    const token = readStoredToken();
    if (!token) {
      showGate();
      return;
    }
    const result = await verifyToken(token);
    if (result.ok) {
      scheduleRecheck(result.expiresAt);
      showApp();
      return;
    }
    if (!result.network) clearStoredToken();
    const err = document.getElementById("auth-error");
    if (err && result.network) err.textContent = "無法驗證登入狀態，請重新輸入";
    showGate();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.NG = window.NG || {});
