import { forbidUnless, requireUser } from "../_lib/auth.js";
import { json, readJson } from "../_lib/http.js";
import { createQuote, listQuotes } from "../_lib/quoteStore.js";

const BODY_MAX = 1500000;

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  if (error?.code === "CONFLICT") return json({ error: error.message }, 409);
  console.error("quotes failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const url = new URL(context.request.url);
  try {
    const data = await listQuotes(context.env.DB, {
      q: url.searchParams.get("q") || "",
      mode: url.searchParams.get("mode") || "",
      dateFrom: url.searchParams.get("dateFrom") || "",
      dateTo: url.searchParams.get("dateTo") || "",
      role: gate.user.role
    });
    return json(data);
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestPost(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin", "sales"]);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(context.request, BODY_MAX);
  } catch (error) {
    return json({ error: "資料太大，沒有存到伺服器" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body || !body.document || typeof body.document !== "object") return json({ error: "資料不正確" }, 400);
  try {
    const item = await createQuote(context.env.DB, gate.user, body.document);
    return json({ item }, 201);
  } catch (error) {
    return fail(error);
  }
}
