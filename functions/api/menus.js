import { requirePermission, requireUser } from "../_lib/auth.js";
import { json, readJson } from "../_lib/http.js";
import { createMenuNode, listMenus } from "../_lib/menus.js";

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  console.error("menus failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  try {
    const items = await listMenus(context.env.DB, {
      role: gate.user.role,
      permissions: gate.user.permissions || []
    });
    return json({ items });
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestPost(context) {
  const gate = await requirePermission(context.request, context.env, "menus.manage");
  if (gate.response) return gate.response;
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);
  try {
    const id = await createMenuNode(context.env.DB, body);
    const items = await listMenus(context.env.DB, { manage: true });
    return json({ id, items }, 201);
  } catch (error) {
    return fail(error);
  }
}
