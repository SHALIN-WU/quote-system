import { requireAdmin } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { countAdmins, getUserById, ROLES, updateUser } from "../../_lib/users.js";

function validId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));
}

function readPatch(body) {
  const data = {};
  if (body.displayName != null) data.displayName = String(body.displayName);
  if (body.role != null) {
    const role = String(body.role).trim();
    if (!ROLES.includes(role)) return { error: "角色不正確" };
    data.role = role;
  }
  if (body.active != null) {
    if (typeof body.active !== "boolean") return { error: "狀態不正確" };
    data.active = body.active;
  }
  if (body.password != null && String(body.password) !== "") data.password = String(body.password);
  return { data };
}

export async function onRequestGet(context) {
  const gate = await requireAdmin(context.request, context.env);
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到帳號" }, 404);
  const item = await getUserById(context.env.DB, context.params.id);
  if (!item) return json({ error: "找不到帳號" }, 404);
  return json({ item });
}

export async function onRequestPatch(context) {
  const gate = await requireAdmin(context.request, context.env);
  if (gate.response) return gate.response;
  if (!validId(context.params.id)) return json({ error: "找不到帳號" }, 404);

  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);
  const parsed = readPatch(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const current = await getUserById(context.env.DB, context.params.id);
  if (!current) return json({ error: "找不到帳號" }, 404);

  const nextRole = parsed.data.role ?? current.role;
  const nextActive = parsed.data.active ?? current.active;
  if (gate.user.id === current.id) {
    if (nextRole !== current.role) return json({ error: "不能變更自己的角色" }, 400);
    if (nextActive === false) return json({ error: "不能停用自己的帳號" }, 400);
  }
  if (current.role === "admin" && current.active && (nextRole !== "admin" || nextActive === false)) {
    const admins = await countAdmins(context.env.DB);
    if (admins <= 1) return json({ error: "至少需保留一位啟用中的管理員" }, 400);
  }

  try {
    const item = await updateUser(context.env.DB, context.params.id, parsed.data);
    if (!item) return json({ error: "找不到帳號" }, 404);
    return json({ item });
  } catch (error) {
    if (error?.code === "INVALID") return json({ error: error.message }, 400);
    console.error("update user failed");
    return json({ error: "無法更新使用者" }, 500);
  }
}
