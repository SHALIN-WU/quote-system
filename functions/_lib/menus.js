const ROLES = ["admin", "sales", "service"];
const MAX_NODES = 80;

function fail(message) {
  const error = new Error(message);
  error.code = "INVALID";
  throw error;
}

function cleanLabel(value) {
  const label = String(value || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (label.length < 1 || label.length > 40) fail("名稱請填 1 到 40 個字");
  if (/[<>]/.test(label)) fail("名稱不能包含 < 或 >");
  return label;
}

function cleanHref(value) {
  const href = String(value || "").trim();
  if (!href || href.length > 300) fail("連結不正確");
  if (href.startsWith("/")) {
    if (href.startsWith("//") || href.includes("\\") || href.includes("..") || /\s/.test(href)) fail("連結不正確");
    return href;
  }
  let url;
  try {
    url = new URL(href);
  } catch {
    fail("連結不正確");
  }
  if (url.protocol !== "https:") fail("連結不正確");
  return url.toString();
}

function cleanRoles(value, lockAdmin) {
  if (!Array.isArray(value)) fail("請選擇角色");
  const unique = ROLES.filter((role) => value.includes(role));
  if (!unique.length) fail("至少要給一個角色");
  if (lockAdmin && !unique.includes("admin")) fail("這個項目不能對管理員隱藏");
  return unique;
}

function mapNode(row, roles) {
  return {
    id: row.id,
    parentId: row.parent_id || null,
    key: row.node_key,
    label: row.label,
    kind: row.kind,
    target: row.target || "",
    sortOrder: row.sort_order,
    visible: Number(row.visible) === 1,
    isSystem: Number(row.is_system) === 1,
    lockAdmin: Number(row.lock_admin) === 1,
    roles,
  };
}

async function loadRows(db) {
  const nodes = await db.prepare("SELECT * FROM menu_nodes ORDER BY sort_order ASC, label ASC").all();
  const roleRows = await db.prepare("SELECT node_id, role FROM menu_node_roles").all();
  const byNode = new Map();
  for (const row of roleRows.results || []) {
    const list = byNode.get(row.node_id) || [];
    list.push(row.role);
    byNode.set(row.node_id, list);
  }
  return (nodes.results || []).map((row) => mapNode(row, byNode.get(row.id) || []));
}

function buildTree(nodes) {
  const groups = nodes.filter((node) => node.kind === "group" && !node.parentId);
  return groups.map((group) => ({
    ...group,
    children: nodes.filter((node) => node.parentId === group.id && node.kind === "item"),
  }));
}

function publicNode(node) {
  return {
    id: node.id,
    key: node.key,
    label: node.label,
    kind: node.kind,
    target: node.target,
  };
}

export async function listMenus(db, options = {}) {
  const tree = buildTree(await loadRows(db));
  if (options.manage) return tree;
  const role = options.role;
  return tree
    .filter((group) => group.visible)
    .map((group) => {
      const children = group.children.filter((item) => item.visible && item.roles.includes(role));
      if (!children.length) return null;
      return {
        ...publicNode(group),
        children: children.map(publicNode),
      };
    })
    .filter(Boolean);
}

async function getNode(db, id) {
  return db.prepare("SELECT * FROM menu_nodes WHERE id = ?").bind(id).first();
}

async function countNodes(db) {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM menu_nodes").first();
  return Number(row?.total || 0);
}

function nowIso() {
  return new Date().toISOString();
}

async function nextSort(db, parentId) {
  const row = parentId
    ? await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM menu_nodes WHERE parent_id = ?").bind(parentId).first()
    : await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM menu_nodes WHERE parent_id IS NULL").first();
  return Number(row?.n || 0) + 10;
}

export async function createMenuNode(db, input) {
  if (await countNodes(db) >= MAX_NODES) fail("選單項目已達上限");
  const kind = input?.kind === "group" ? "group" : input?.kind === "item" ? "item" : "";
  if (!kind) fail("類型不正確");
  const label = cleanLabel(input.label);
  const parentId = input.parentId ? String(input.parentId) : null;
  if (kind === "group" && parentId) fail("群組不能放進另一個群組");
  if (kind === "item") {
    if (!parentId) fail("請把項目放進群組");
    const parent = await getNode(db, parentId);
    if (!parent || parent.kind !== "group" || parent.parent_id) fail("請把項目放進群組");
  }
  const target = kind === "item" ? cleanHref(input.href) : "";
  const roles = kind === "item" ? cleanRoles(input.roles, false) : [];
  const id = crypto.randomUUID();
  const key = "custom-" + id.replace(/-/g, "");
  const now = nowIso();
  const sort = await nextSort(db, parentId);
  const statements = [
    db.prepare(`INSERT INTO menu_nodes (
      id, parent_id, node_key, label, kind, target, sort_order, visible, is_system, lock_admin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`).bind(id, parentId, key, label, kind, target, sort, now, now),
  ];
  for (const role of roles) {
    statements.push(db.prepare("INSERT INTO menu_node_roles (node_id, role) VALUES (?, ?)").bind(id, role));
  }
  await db.batch(statements);
  return id;
}

async function replaceRoles(db, id, roles) {
  const statements = [db.prepare("DELETE FROM menu_node_roles WHERE node_id = ?").bind(id)];
  for (const role of roles) {
    statements.push(db.prepare("INSERT INTO menu_node_roles (node_id, role) VALUES (?, ?)").bind(id, role));
  }
  await db.batch(statements);
}

export async function updateMenuNode(db, id, patch) {
  const current = await getNode(db, id);
  if (!current) return null;
  const lockAdmin = Number(current.lock_admin) === 1;
  const isSystem = Number(current.is_system) === 1;
  const isGroup = current.kind === "group";
  let label = current.label;
  let visible = Number(current.visible) === 1;
  let target = current.target || "";
  if (patch.label != null) label = cleanLabel(patch.label);
  if (patch.visible != null) {
    if (typeof patch.visible !== "boolean") fail("顯示設定不正確");
    if (lockAdmin && patch.visible === false) fail("這個項目不能對管理員隱藏");
    visible = patch.visible;
  }
  if (patch.href != null) {
    if (isGroup || isSystem) fail("內建頁面的連結不能改");
    target = cleanHref(patch.href);
  }
  if (patch.roles != null) {
    if (isGroup) fail("群組不設定角色");
    const roles = cleanRoles(patch.roles, lockAdmin);
    await replaceRoles(db, id, roles);
  }
  await db.prepare(`UPDATE menu_nodes
    SET label = ?, visible = ?, target = ?, updated_at = ?
    WHERE id = ?`).bind(label, visible ? 1 : 0, target, nowIso(), id).run();
  return id;
}

export async function deleteMenuNode(db, id) {
  const current = await getNode(db, id);
  if (!current) return null;
  if (Number(current.is_system) === 1) fail("內建頁面不能刪除");
  if (current.kind === "group") {
    const child = await db.prepare("SELECT id FROM menu_nodes WHERE parent_id = ? LIMIT 1").bind(id).first();
    if (child) fail("請先刪除群組裡的項目");
  }
  await db.batch([
    db.prepare("DELETE FROM menu_node_roles WHERE node_id = ?").bind(id),
    db.prepare("DELETE FROM menu_nodes WHERE id = ?").bind(id),
  ]);
  return id;
}

export async function reorderMenus(db, parentId, ids) {
  if (!Array.isArray(ids) || !ids.length) fail("排序資料不正確");
  const unique = [...new Set(ids.map((id) => String(id || "")))];
  if (unique.length !== ids.length) fail("排序資料不正確");
  const siblings = parentId
    ? await db.prepare("SELECT id FROM menu_nodes WHERE parent_id = ? ORDER BY sort_order ASC").bind(parentId).all()
    : await db.prepare("SELECT id FROM menu_nodes WHERE parent_id IS NULL ORDER BY sort_order ASC").all();
  const existing = (siblings.results || []).map((row) => row.id);
  if (existing.length !== unique.length || existing.some((id) => !unique.includes(id))) fail("排序資料不正確");
  const now = nowIso();
  await db.batch(unique.map((id, index) => db.prepare(
    "UPDATE menu_nodes SET sort_order = ?, updated_at = ? WHERE id = ?"
  ).bind((index + 1) * 10, now, id)));
  return true;
}
