import { forbidUnless, requireUser } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { listMenus } from "../../_lib/menus.js";

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin"]);
  if (denied) return denied;
  try {
    const items = await listMenus(context.env.DB, { manage: true });
    return json({ items });
  } catch (error) {
    console.error("menus manage failed");
    return json({ error: "請稍後再試" }, 500);
  }
}
