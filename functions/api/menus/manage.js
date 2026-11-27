import { requirePermission } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { listMenus } from "../../_lib/menus.js";

export async function onRequestGet(context) {
  const gate = await requirePermission(context.request, context.env, "menus.manage");
  if (gate.response) return gate.response;
  try {
    const items = await listMenus(context.env.DB, { manage: true });
    return json({ items });
  } catch (error) {
    console.error("menus manage failed");
    return json({ error: "請稍後再試" }, 500);
  }
}
