export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export async function readJson(request, max = 8192) {
  const text = await request.text();
  if (text.length > max) {
    const error = new Error("too-large");
    throw error;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function clientIp(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip && ip.trim()) return ip.trim().slice(0, 80);
  return "local";
}
