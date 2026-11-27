import { requirePermission } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { deleteRole, getRole, updateRole } from "../../_lib/roles.js";

function validId(id) {
  return /^[A-Za-z0-9-]{1,80}$/.test(String(id || ""));
}

function fail(error) {
  if (error?.code === "INVALID") return json({ error: error.message }, 400);
  if (error?.code === "CONFLICT") return json({ error: error.message }, 409);
  console.error("role failed");
  return json({ error: "請稍後再試" }, 500);
}

export async function onRequestGet(context) {
  const gate = await requirePermission(context.request, context.env, "roles.manage");
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到角色" }, 404);
  const item = await getRole(context.env.DB, context.params.id);
  if (!item) return json({ error: "找不到角色" }, 404);
  return json({ item });
}

export async function onRequestPatch(context) {
  const gate = await requirePermission(context.request, context.env, "roles.manage");
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到角色" }, 404);
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "資料不正確" }, 400);
  const patch = {};
  if (body.label != null) patch.label = body.label;
  if (body.permissions != null) patch.permissions = body.permissions;
  try {
    const item = await updateRole(context.env.DB, context.params.id, patch);
    if (!item) return json({ error: "找不到角色" }, 404);
    return json({ item });
  } catch (error) {
    return fail(error);
  }
}

export async function onRequestDelete(context) {
  const gate = await requirePermission(context.request, context.env, "roles.manage");
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到角色" }, 404);
  try {
    const ok = await deleteRole(context.env.DB, context.params.id);
    if (!ok) return json({ error: "找不到角色" }, 404);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
