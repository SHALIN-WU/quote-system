import { requireAdmin } from "../_lib/auth.js";
import { json, readJson } from "../_lib/http.js";
import { createUser, listUsers, ROLES } from "../_lib/users.js";

function readNewUser(body) {
  const username = String(body?.username || "").trim().toLowerCase();
  const displayName = String(body?.displayName || "").trim();
  const role = String(body?.role || "").trim();
  const password = String(body?.password || "");
  const active = body?.active === false ? false : true;
  if (!ROLES.includes(role)) return { error: "角色不正確" };
  return { data: { username, displayName, role, password, active } };
}

export async function onRequestGet(context) {
  const gate = await requireAdmin(context.request, context.env);
  if (gate.response) return gate.response;
  try {
    const items = await listUsers(context.env.DB);
    return json({ items });
  } catch (error) {
    console.error("list users failed");
    return json({ error: "無法讀取帳號" }, 500);
  }
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context.request, context.env);
  if (gate.response) return gate.response;

  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ error: "資料不正確" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "資料不正確" }, 400);

  const parsed = readNewUser(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  try {
    const item = await createUser(context.env.DB, parsed.data);
    return json({ item }, 201);
  } catch (error) {
    if (error?.code === "INVALID") return json({ error: error.message }, 400);
    if (String(error?.message || "").includes("UNIQUE")) return json({ error: "帳號已存在" }, 409);
    console.error("create user failed");
    return json({ error: "無法建立使用者" }, 500);
  }
}
