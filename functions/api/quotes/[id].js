import { forbidUnless, requireUser } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { deleteQuote, getQuote, updateQuote } from "../../_lib/quoteStore.js";

const BODY_MAX = 1500000;

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  if (error?.code === "CONFLICT") return json({ error: error.message }, 409);
  console.error("quote failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  try {
    const item = await getQuote(context.env.DB, context.params.id, gate.user.role);
    if (!item) return json({ error: "找不到報價" }, 404);
    return json({ item });
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestPut(context) {
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
    const item = await updateQuote(context.env.DB, gate.user, context.params.id, body.document, body.updatedAt);
    if (!item) return json({ error: "找不到報價" }, 404);
    return json({ item });
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestDelete(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin"]);
  if (denied) return denied;
  try {
    const ok = await deleteQuote(context.env.DB, context.params.id);
    if (!ok) return json({ error: "找不到報價" }, 404);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
