import { json } from "./http.js";

export const PERMISSIONS = [
  { key: "quote.view", label: "查看報價" },
  { key: "quote.write", label: "新增／編輯報價" },
  { key: "quote.copy", label: "複製" },
  { key: "quote.delete", label: "刪除" },
  { key: "quote.cost", label: "看成本與毛利" },
  { key: "backup.export", label: "匯出備份" },
  { key: "backup.import", label: "匯入備份" },
  { key: "settings.calc", label: "計算參數" },
  { key: "users.manage", label: "帳號管理" },
  { key: "menus.manage", label: "選單管理" },
  { key: "roles.manage", label: "角色管理" }
];

export const PERMISSION_KEYS = PERMISSIONS.map((item) => item.key);

export const ADMIN_ROLE_ID = "admin";

// 內建選單依權限顯示。自訂連結仍看 menu_node_roles。
export const SYSTEM_MENU_PERMISSIONS = {
  "new-quote": ["quote.write"],
  history: ["quote.view"],
  users: ["users.manage"],
  calc: ["settings.calc"],
  backup: ["backup.import"],
  menus: ["menus.manage"],
  roles: ["roles.manage"]
};

export function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

export function forbidUnlessPermission(user, permission) {
  if (!hasPermission(user, permission)) return json({ error: "沒有權限" }, 403);
  return null;
}

export function forbidUnlessAnyPermission(user, permissions) {
  if (!permissions.some((permission) => hasPermission(user, permission))) {
    return json({ error: "沒有權限" }, 403);
  }
  return null;
}

export async function loadPermissions(db, roleId) {
  if (!db || !roleId) return [];
  const result = await db.prepare("SELECT permission FROM role_permissions WHERE role_id = ?").bind(roleId).all();
  const found = new Set((result.results || []).map((row) => row.permission));
  return PERMISSION_KEYS.filter((key) => found.has(key));
}
