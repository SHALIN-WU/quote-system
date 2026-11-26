const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function timingSafeEqualBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false;
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function sha256Equal(left, right) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(left))),
    crypto.subtle.digest("SHA-256", enc.encode(String(right)))
  ]);
  return timingSafeEqualBytes(new Uint8Array(a), new Uint8Array(b));
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const salt = hexToBytes(saltHex);
  if (!salt || !Number.isInteger(iterations) || iterations < PBKDF2_ITERATIONS || iterations > 1000000) {
    return "";
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("pbkdf2$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const expected = parts[3];
  if (!/^[0-9a-f]+$/i.test(expected)) return false;
  const actual = await pbkdf2Hex(password, parts[2], iterations);
  const actualBytes = hexToBytes(actual);
  const expectedBytes = hexToBytes(expected);
  if (!actualBytes || !expectedBytes) return false;
  return timingSafeEqualBytes(actualBytes, expectedBytes);
}
