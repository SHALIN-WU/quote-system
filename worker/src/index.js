const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const MAX_BODY = 4096;
const MAX_PASSWORD = 256;
const MAX_TOKEN = 2000;

const ALLOWED_ORIGINS = [
  "https://SHALIN-WU.github.io",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
];

// 連續錯誤次數只存在這個 Worker 執行個體的記憶體。
const failures = new Map();
const enc = new TextEncoder();

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  const match = ALLOWED_ORIGINS.some(function (item) {
    return item.toLowerCase() === origin.toLowerCase();
  });
  return match ? origin : "";
}

function respond(body, status, origin, extra) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  if (extra) {
    Object.keys(extra).forEach(function (key) { headers[key] = extra[key]; });
  }
  return new Response(body == null ? null : JSON.stringify(body), { status: status, headers: headers });
}

function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

function secretsReady(env) {
  return env
    && typeof env.QUOTE_PASS === "string"
    && env.QUOTE_PASS.length > 0
    && typeof env.TOKEN_SECRET === "string"
    && env.TOKEN_SECRET.length > 0;
}

function clientIp(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  return ip && ip.trim() ? ip.trim() : "unknown";
}

function lockRemaining(ip) {
  const row = failures.get(ip);
  if (!row || !row.lockedUntil) return 0;
  const left = row.lockedUntil - Date.now();
  if (left <= 0) {
    failures.delete(ip);
    return 0;
  }
  return left;
}

function recordFailure(ip) {
  const now = Date.now();
  const current = failures.get(ip);
  if (current && current.lockedUntil > now) return current.lockedUntil;
  let fails = 0;
  if (current && now - current.lastFailAt <= LOCK_MS) fails = current.fails;
  fails += 1;
  const row = { fails: fails, lastFailAt: now, lockedUntil: 0 };
  if (fails >= MAX_FAILS) {
    row.fails = 0;
    row.lockedUntil = now + LOCK_MS;
  }
  failures.set(ip, row);
  if (failures.size > 1000) {
    for (const [key, value] of failures) {
      if (value.lockedUntil <= now && now - value.lastFailAt > LOCK_MS) failures.delete(key);
    }
  }
  return row.lockedUntil;
}

function clearFailures(ip) {
  failures.delete(ip);
}

function timingSafeEqualBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    try {
      return crypto.subtle.timingSafeEqual(a, b);
    } catch (err) { /* 改走下面的固定時間比較 */ }
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hashesEqual(left, right) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(left))),
    crypto.subtle.digest("SHA-256", enc.encode(String(right))),
  ]);
  return timingSafeEqualBytes(new Uint8Array(a), new Uint8Array(b));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (err) {
    return null;
  }
}

async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

async function signToken(secret) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = bytesToBase64Url(enc.encode(JSON.stringify({ exp: exp })));
  const sig = bytesToBase64Url(await hmacBytes(secret, payload));
  return { token: payload + "." + sig, expiresAt: exp };
}

async function readToken(token, secret) {
  if (typeof token !== "string" || token.length > MAX_TOKEN) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const actual = base64UrlToBytes(parts[1]);
  const expected = await hmacBytes(secret, parts[0]);
  if (!timingSafeEqualBytes(actual, expected)) return null;
  const payloadBytes = base64UrlToBytes(parts[0]);
  if (!payloadBytes) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch (err) {
    return null;
  }
  if (!data || typeof data.exp !== "number" || !isFinite(data.exp)) return null;
  const now = Date.now();
  if (data.exp <= now) return null;
  if (data.exp - now > TOKEN_TTL_MS + 60 * 1000) return null;
  return { exp: data.exp };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) {
    const error = new Error("too-large");
    throw error;
  }
  if (!text) return {};
  return JSON.parse(text);
}

async function handleLogin(request, env, origin) {
  if (!secretsReady(env)) return respond({ ok: false }, 500, origin);
  const ip = clientIp(request);
  const remaining = lockRemaining(ip);
  if (remaining > 0) {
    const retryAfter = Math.ceil(remaining / 1000);
    return respond({ ok: false, error: "locked", retryAfter: retryAfter }, 429, origin, {
      "Retry-After": String(retryAfter),
    });
  }
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    return respond({ ok: false }, err && err.message === "too-large" ? 413 : 400, origin);
  }
  if (!body || typeof body.password !== "string" || body.password.length > MAX_PASSWORD) {
    return respond({ ok: false }, 400, origin);
  }
  const matched = await hashesEqual(body.password, env.QUOTE_PASS);
  if (!matched) {
    const lockedUntil = recordFailure(ip);
    if (lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
      return respond({ ok: false, error: "locked", retryAfter: retryAfter }, 429, origin, {
        "Retry-After": String(retryAfter),
      });
    }
    return respond({ ok: false }, 401, origin);
  }
  clearFailures(ip);
  const signed = await signToken(env.TOKEN_SECRET);
  return respond({ ok: true, token: signed.token, expiresAt: signed.expiresAt }, 200, origin);
}

async function handleVerify(request, env, origin) {
  if (!secretsReady(env)) return respond({ ok: false }, 500, origin);
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    return respond({ ok: false }, err && err.message === "too-large" ? 413 : 400, origin);
  }
  if (!body || typeof body.token !== "string") return respond({ ok: false }, 401, origin);
  const payload = await readToken(body.token, env.TOKEN_SECRET);
  if (!payload) return respond({ ok: false }, 401, origin);
  return respond({ ok: true, expiresAt: payload.exp }, 200, origin);
}

async function route(request, env) {
  const originHeader = request.headers.get("Origin");
  const origin = allowedOrigin(request);
  if (originHeader && !origin) return respond({ ok: false }, 403, "");

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    if (path !== "/login" && path !== "/verify") return respond({ ok: false }, 404, origin);
    if (!origin) return respond({ ok: false }, 403, "");
    return preflight(origin);
  }

  if (request.method !== "POST") {
    return respond({ ok: false }, 405, origin, { Allow: "POST, OPTIONS" });
  }
  if (path === "/login") return handleLogin(request, env, origin);
  if (path === "/verify") return handleVerify(request, env, origin);
  return respond({ ok: false }, 404, origin);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      return respond({ ok: false }, 500, allowedOrigin(request));
    }
  },
};
