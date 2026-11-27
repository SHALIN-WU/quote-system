import { ADMIN_ROLE_ID, PERMISSION_KEYS } from "./permissions.js";

const SYSTEM_ORDER = ["admin", "sales", "service"];

function fail(message) {
  const error = new Error(message);
  error.code = "INVALID";
  throw error;
}

function conflict(message) {
  const error = new Error(message);
  error.code = "CONFLICT";
  throw error;
}

function cleanLabel(value) {
  const label = String(value || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (label.length < 1 || label.length > 40) fail("名稱請填 1 到 40 個字");
  if (/[<>]/.test(label)) fail("名稱不能包含 < 或 >");
  return label;
}

function cleanPermissions(value) {
  if (!Array.isArray(value)) fail("請選擇權限");
  const picked = new Set();
  for (const entry of value) {
    const permission = String(entry || "");
    if (!PERMISSION_KEYS.includes(permission)) fail("權限不正確");
    picked.add(permission);
  }
  return PERMISSION_KEYS.filter((key) => picked.has(key));
}

function nowIso() {
  return new Date().toISOString();
}

function mapRole(row, permissions) {
  return {
    id: row.id,
    label: row.label,
    isSystem: Number(row.is_system) === 1,
    permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sortRoles(items) {
  return items.slice().sort((a, b) => {
    const ai = SYSTEM_ORDER.indexOf(a.id);
    const bi = SYSTEM_ORDER.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

async function permissionMap(db) {
  const result = await db.prepare("SELECT role_id, permission FROM role_permissions").all();
  const map = new Map();
  for (const row of result.results || []) {
    const list = map.get(row.role_id) || [];
    list.push(row.permission);
    map.set(row.role_id, list);
  }
  return map;
}

export async function listRoles(db) {
  const result = await db.prepare("SELECT id, label, is_system, created_at, updated_at FROM roles").all();
  const perms = await permissionMap(db);
  const items = (result.results || []).map((row) => mapRole(row, PERMISSION_KEYS.filter((key) => (perms.get(row.id) || []).includes(key))));
  return sortRoles(items);
}

export async function getRole(db, id) {
  const row = await db.prepare("SELECT id, label, is_system, created_at, updated_at FROM roles WHERE id = ?").bind(id).first();
  if (!row) return null;
  const perms = await db.prepare("SELECT permission FROM role_permissions WHERE role_id = ?").bind(id).all();
  const found = new Set((perms.results || []).map((item) => item.permission));
  return mapRole(row, PERMISSION_KEYS.filter((key) => found.has(key)));
}

export async function roleExists(db, id) {
  const row = await db.prepare("SELECT id FROM roles WHERE id = ?").bind(String(id || "")).first();
  return !!row;
}

function duplicateName(error) {
  return String(error?.message || "").includes("UNIQUE");
}

export async function createRole(db, input) {
  const label = cleanLabel(input?.label);
  const permissions = cleanPermissions(input?.permissions == null ? [] : input.permissions);
  const id = crypto.randomUUID();
  const now = nowIso();
  const statements = [
    db.prepare("INSERT INTO roles (id, label, is_system, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").bind(id, label, now, now)
  ];
  for (const permission of permissions) {
    statements.push(db.prepare("INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)").bind(id, permission));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (duplicateName(error)) conflict("角色名稱已存在");
    throw error;
  }
  return getRole(db, id);
}

export async function updateRole(db, id, patch = {}) {
  const current = await getRole(db, id);
  if (!current) return null;
  const label = patch.label != null ? cleanLabel(patch.label) : current.label;
  let permissions = null;
  if (patch.permissions != null) {
    permissions = cleanPermissions(patch.permissions);
    if (current.id === ADMIN_ROLE_ID && PERMISSION_KEYS.some((key) => !permissions.includes(key))) {
      fail("管理員權限不能拿掉");
    }
  }
  const now = nowIso();
  const statements = [
    db.prepare("UPDATE roles SET label = ?, updated_at = ? WHERE id = ?").bind(label, now, id)
  ];
  if (permissions) {
    statements.push(db.prepare("DELETE FROM role_permissions WHERE role_id = ?").bind(id));
    for (const permission of permissions) {
      statements.push(db.prepare("INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)").bind(id, permission));
    }
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (duplicateName(error)) conflict("角色名稱已存在");
    throw error;
  }
  return getRole(db, id);
}

export async function deleteRole(db, id) {
  const current = await getRole(db, id);
  if (!current) return null;
  if (current.isSystem) fail("內建角色不能刪除");
  const used = await db.prepare("SELECT id FROM users WHERE role = ? LIMIT 1").bind(id).first();
  if (used) fail("已有帳號使用這個角色，不能刪除");
  await db.batch([
    db.prepare("DELETE FROM role_permissions WHERE role_id = ?").bind(id),
    db.prepare("DELETE FROM menu_node_roles WHERE role = ?").bind(id),
    db.prepare("DELETE FROM roles WHERE id = ?").bind(id)
  ]);
  return true;
}
