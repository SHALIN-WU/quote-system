import { hashPassword } from "./password.js";

// 角色權限。帳號管理只限 admin。報價 API 另在每個路由檢查：
// - admin 管理員：全部功能，包含成本、利潤、帳號管理、匯入備份、刪除報價、計算參數
// - sales 業務：可以新增、修改、複製報價，看得到成本與利潤，可以下載備份
// - service 客服：只能看報價。回應拿掉 costPrice、markupPercent，不含毛利

export const ROLES = ["admin", "sales", "service"];

function fail(message) {
  const error = new Error(message);
  error.code = "INVALID";
  throw error;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: Number(row.active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || null
  };
}

export async function countUsers(db) {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM users").first();
  return Number(row?.total || 0);
}

export async function countAdmins(db) {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND active = 1")
    .first();
  return Number(row?.total || 0);
}

export async function listUsers(db) {
  const result = await db
    .prepare(`SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at
      FROM users ORDER BY created_at ASC`)
    .all();
  return (result.results || []).map(mapUser);
}

export async function getUserById(db, id) {
  const row = await db
    .prepare(`SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at
      FROM users WHERE id = ?`)
    .bind(id)
    .first();
  return mapUser(row);
}

export async function getUserByUsername(db, username) {
  const row = await db
    .prepare("SELECT * FROM users WHERE username = ?")
    .bind(String(username || "").trim().toLowerCase())
    .first();
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export async function createUser(db, input) {
  const username = String(input.username || "").trim().toLowerCase();
  const displayName = String(input.displayName || "").trim();
  const role = String(input.role || "");
  const password = String(input.password || "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) fail("帳號需為 3–32 字元英數（可含 . _ -）");
  if (!displayName || displayName.length > 80) fail("顯示名稱必填");
  if (!ROLES.includes(role)) fail("角色不正確");
  if (password.length < 8 || password.length > 256) fail("密碼至少 8 碼");

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db
    .prepare(`INSERT INTO users (
      id, username, display_name, role, password_hash, active, created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(id, username, displayName, role, passwordHash, input.active === false ? 0 : 1, now, now)
    .run();
  return getUserById(db, id);
}

export async function updateUser(db, id, patch = {}) {
  const current = await getUserById(db, id);
  if (!current) return null;

  const next = {
    displayName: patch.displayName != null ? String(patch.displayName).trim() : current.displayName,
    role: patch.role != null ? String(patch.role) : current.role,
    active: patch.active != null ? Boolean(patch.active) : current.active,
    updatedAt: new Date().toISOString()
  };
  if (!next.displayName || next.displayName.length > 80) fail("顯示名稱必填");
  if (!ROLES.includes(next.role)) fail("角色不正確");

  if (patch.password) {
    const password = String(patch.password);
    if (password.length < 8 || password.length > 256) fail("密碼至少 8 碼");
    const passwordHash = await hashPassword(password);
    await db
      .prepare(`UPDATE users SET display_name = ?, role = ?, active = ?, password_hash = ?, updated_at = ?
        WHERE id = ?`)
      .bind(next.displayName, next.role, next.active ? 1 : 0, passwordHash, next.updatedAt, id)
      .run();
  } else {
    await db
      .prepare(`UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?`)
      .bind(next.displayName, next.role, next.active ? 1 : 0, next.updatedAt, id)
      .run();
  }
  return getUserById(db, id);
}

export async function touchLastLogin(db, id) {
  const now = new Date().toISOString();
  await db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
}
