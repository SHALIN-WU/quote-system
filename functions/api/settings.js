import { forbidUnless, requireUser } from "../_lib/auth.js";
import { json, readJson } from "../_lib/http.js";
import { getSettings, updateSettings } from "../_lib/quoteStore.js";

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  if (error?.code === "CONFLICT") return json({ error: error.message, settings: error.settings }, 409);
  console.error("settings failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  try {
    return json(await getSettings(context.env.DB));
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestPut(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin"]);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);
  try {
    return json(await updateSettings(context.env.DB, gate.user, body));
  } catch (error) {
    return fail(error);
  }
}
