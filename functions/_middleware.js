import { requireActiveUser } from "./_lib/auth.js";
import { json } from "./_lib/http.js";

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return "";
  return path;
}

function isLoginPage(path) {
  return path === "/login" || path === "/login.html";
}

function isLoginAsset(path) {
  // 登入頁的樣式與程式寫在 login.html 裡。唯一要另外讀的是標誌圖。
  return path === "/images/northgo-logo.png";
}

function isPublic(path, method) {
  if (isLoginPage(path) && (method === "GET" || method === "HEAD")) return true;
  if (isLoginAsset(path) && (method === "GET" || method === "HEAD")) return true;
  if (path === "/api/health" && method === "GET") return true;
  if (path === "/api/auth/login" && method === "POST") return true;
  if (path === "/api/auth/logout" && method === "POST") return true;
  return false;
}

function wantsHtml(request, path) {
  if (path.startsWith("/api/")) return false;
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) return true;
  return path === "/" || path.endsWith(".html");
}

function isAdminPath(path) {
  return path === "/admin" || path.startsWith("/admin/") || path === "/api/users" || path.startsWith("/api/users/");
}

function redirectToLogin(request) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL("/login", request.url).toString(),
      "Cache-Control": "no-store"
    }
  });
}

function forbiddenPage() {
  return new Response("<!DOCTYPE html><html lang=\"zh-Hant\"><meta charset=\"utf-8\"><title>沒有權限</title><p>沒有權限。</p><p><a href=\"/\">回到報價</a></p>", {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const path = normalizePath(url.pathname);
    if (!path) return json({ error: "找不到頁面" }, 404);
    if (isPublic(path, context.request.method)) return context.next();

    const user = await requireActiveUser(context.request, context.env);
    if (!user) {
      if (wantsHtml(context.request, path)) return redirectToLogin(context.request);
      return json({ error: "尚未登入" }, 401);
    }
    if (isAdminPath(path) && user.role !== "admin") {
      if (wantsHtml(context.request, path)) return forbiddenPage();
      return json({ error: "沒有權限" }, 403);
    }
    return context.next();
  } catch (error) {
    console.error("request failed");
    return json({ error: "請稍後再試" }, 500);
  }
}
