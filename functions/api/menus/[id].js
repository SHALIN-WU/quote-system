import { forbidUnless, requireUser } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { deleteMenuNode, listMenus, updateMenuNode } from "../../_lib/menus.js";

function validId(id) {
  return /^[A-Za-z0-9-]{4,80}$/.test(String(id || ""));
}

function fail(error, missing) {
  if (missing) return json({ error: "找不到選單" }, 404);
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  console.error("menus item failed");
  return json({ error: "請稍後再試" }, 500);
}

async function adminGate(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate;
  const denied = forbidUnless(gate.user, ["admin"]);
  if (denied) return { user: gate.user, response: denied };
  return gate;
}

export async function onRequestPatch(context) {
  const gate = await adminGate(context);
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到選單" }, 404);
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);
  try {
    const id = await updateMenuNode(context.env.DB, context.params.id, body);
    if (!id) return json({ error: "找不到選單" }, 404);
    return json({ id, items: await listMenus(context.env.DB, { manage: true }) });
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestDelete(context) {
  const gate = await adminGate(context);
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到選單" }, 404);
  try {
    const id = await deleteMenuNode(context.env.DB, context.params.id);
    if (!id) return json({ error: "找不到選單" }, 404);
    return json({ id, items: await listMenus(context.env.DB, { manage: true }) });
  } catch (error) {
    return fail(error);
  }
}
