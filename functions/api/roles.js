import { requireAnyPermission, requirePermission } from "../_lib/auth.js";
import { json, readJson } from "../_lib/http.js";
import { PERMISSIONS } from "../_lib/permissions.js";
import { createRole, listRoles } from "../_lib/roles.js";

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  if (error?.code === "CONFLICT") return json({ error: error.message }, 409);
  console.error("roles failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requireAnyPermission(context.request, context.env, ["users.manage", "roles.manage", "menus.manage"]);
  if (gate.response) return gate.response;
  try {
    const items = await listRoles(context.env.DB);
    return json({ items, permissions: PERMISSIONS });
  } catch (error) {
    console.error("list roles failed");
    return json({ error: "無法讀取角色" }, 500);
  }
}

export async function onRequestPost(context) {
  const gate = await requirePermission(context.request, context.env, "roles.manage");
  if (gate.response) return gate.response;
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "資料不正確" }, 400);
  try {
    const item = await createRole(context.env.DB, body);
    return json({ item }, 201);
  } catch (error) {
    return fail(error);
  }
}
