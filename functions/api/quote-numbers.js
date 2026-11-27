import { requireUser } from "../_lib/auth.js";
import { forbidUnlessPermission } from "../_lib/permissions.js";
import { json, readJson } from "../_lib/http.js";
import { allocateNumber } from "../_lib/quoteStore.js";

export async function onRequestPost(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnlessPermission(gate.user, "quote.write");
  if (denied) return denied;
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);
  try {
    const quoteNumber = await allocateNumber(context.env.DB, body.quoteDate);
    return json({ quoteNumber }, 201);
  } catch (error) {
    if (error?.code === "INVALID") return json({ error: error.message }, 400);
    console.error("allocate number failed");
    return json({ error: "無法取得單號" }, 500);
  }
}
