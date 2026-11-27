import { requirePermission } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { listMenus, reorderMenus } from "../../_lib/menus.js";

export async function onRequestPut(context) {
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
    const parentId = body.parentId ? String(body.parentId) : null;
    await reorderMenus(context.env.DB, parentId, body.ids);
    return json({ items: await listMenus(context.env.DB, { manage: true }) });
  } catch (error) {
    if (error?.code === "INVALID") return json({ error: error.message }, 400);
    console.error("menus order failed");
    return json({ error: "請稍後再試" }, 500);
  }
}
