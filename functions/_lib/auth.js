import { json } from "./http.js";
import { hashPassword, sha256Equal, verifyPassword } from "./password.js";
import { countUsers, createUser, getUserById, getUserByUsername, touchLastLogin } from "./users.js";

const COOKIE_NAME = "quote_session";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function envValue(env, name) {
  const value = env?.[name];
  if (value == null) return "";
  return String(value);
}

export function getAuthConfig(env) {
  const username = envValue(env, "ADMIN_USERNAME").trim().toLowerCase();
  return {
    username: username || "admin",
    password: envValue(env, "ADMIN_PASSWORD"),
    secret: envValue(env, "SESSION_SECRET"),
    secure: envValue(env, "COOKIE_SECURE").toLowerCase() !== "false"
  };
}

export function sessionReady(env) {
  return getAuthConfig(env).secret.length >= 16;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function encodeJson(data) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(data)));
}

function decodeJson(value) {
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function signaturesMatch(actual, expected) {
  const left = base64UrlToBytes(actual);
  const right = base64UrlToBytes(expected);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function serializeCookie(value, options) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export async function createSessionCookie(env, user) {
  const config = getAuthConfig(env);
  const now = Date.now();
  const body = encodeJson({
    id: user.id,
    u: user.username,
    iat: now,
    exp: now + MAX_AGE_MS,
    n: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(8)))
  });
  const token = `${body}.${await sign(body, config.secret)}`;
  return serializeCookie(token, { secure: config.secure, maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(env) {
  const config = getAuthConfig(env);
  return serializeCookie("", { secure: config.secure, maxAge: 0 });
}

export async function readSession(request, env) {
  const config = getAuthConfig(env);
  if (config.secret.length < 16) return null;
  const token = parseCookies(request.headers.get("Cookie"))[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const dot = token.lastIndexOf(".");
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;
  const expected = await sign(body, config.secret);
  if (!signaturesMatch(signature, expected)) return null;
  try {
    const data = decodeJson(body);
    const exp = Number(data?.exp);
    const iat = Number(data?.iat);
    const now = Date.now();
    if (!data?.id || !data?.u || !Number.isFinite(exp) || !Number.isFinite(iat)) return null;
    if (exp <= now || exp - now > MAX_AGE_MS + 60 * 1000) return null;
    if (iat > now + 60 * 1000 || exp - iat > MAX_AGE_MS + 60 * 1000) return null;
    return { id: data.id, username: data.u };
  } catch {
    return null;
  }
}

let dummyHashPromise;

function dummyHash() {
  if (!dummyHashPromise) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const text = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    dummyHashPromise = hashPassword(text);
  }
  return dummyHashPromise;
}

async function burnPasswordTime(password) {
  await verifyPassword(password, await dummyHash());
}

export async function authenticateUser(env, username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  const plain = String(password || "");
  if (!normalized || !plain || plain.length > 256 || !env.DB) return null;

  const existing = await getUserByUsername(env.DB, normalized);
  if (existing) {
    const ok = await verifyPassword(plain, existing.passwordHash);
    if (!ok || !existing.active) return null;
    await touchLastLogin(env.DB, existing.id);
    return {
      id: existing.id,
      username: existing.username,
      displayName: existing.displayName,
      role: existing.role
    };
  }

  const total = await countUsers(env.DB);
  if (total !== 0) {
    await burnPasswordTime(plain);
    return null;
  }

  const config = getAuthConfig(env);
  const userOk = await sha256Equal(normalized, config.username);
  const passOk = config.password.length >= 8 && config.password.length <= 256
    ? await sha256Equal(plain, config.password)
    : false;
  if (!userOk || !passOk) {
    await burnPasswordTime(plain);
    return null;
  }

  try {
    const created = await createUser(env.DB, {
      username: config.username,
      displayName: "系統管理員",
      role: "admin",
      password: plain,
      active: true
    });
    await touchLastLogin(env.DB, created.id);
    return created;
  } catch (error) {
    if (!String(error?.message || "").includes("UNIQUE")) throw error;
    const again = await getUserByUsername(env.DB, config.username);
    if (!again?.active) return null;
    const ok = await verifyPassword(plain, again.passwordHash);
    if (!ok) return null;
    await touchLastLogin(env.DB, again.id);
    return {
      id: again.id,
      username: again.username,
      displayName: again.displayName,
      role: again.role
    };
  }
}

export async function requireActiveUser(request, env) {
  const session = await readSession(request, env);
  if (!session?.id || !env.DB) return null;
  const user = await getUserById(env.DB, session.id);
  if (!user || !user.active) return null;
  if (user.username !== session.username) return null;
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireActiveUser(request, env);
  if (!user) return { user: null, response: json({ error: "尚未登入" }, 401) };
  if (user.role !== "admin") return { user, response: json({ error: "沒有權限" }, 403) };
  if (!env.DB) return { user, response: json({ error: "請稍後再試" }, 500) };
  return { user, response: null };
}
