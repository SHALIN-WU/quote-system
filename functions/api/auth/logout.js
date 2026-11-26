import { clearSessionCookie } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost(context) {
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(context.env) });
}
