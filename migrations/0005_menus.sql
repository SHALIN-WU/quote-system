-- 左側選單。不修改 0001 到 0004。

CREATE TABLE menu_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT,
  node_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('group', 'item')),
  target TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  lock_admin INTEGER NOT NULL DEFAULT 0 CHECK (lock_admin IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_menu_nodes_parent ON menu_nodes (parent_id, sort_order);

CREATE TABLE menu_node_roles (
  node_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'service')),
  PRIMARY KEY (node_id, role)
);

CREATE INDEX idx_menu_node_roles_node ON menu_node_roles (node_id);

INSERT INTO menu_nodes (
  id, parent_id, node_key, label, kind, target, sort_order, visible, is_system, lock_admin, created_at, updated_at
) VALUES
  ('menu-quote', NULL, 'quote-group', '報價作業', 'group', '', 10, 1, 1, 0, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-system', NULL, 'system-group', '系統設定', 'group', '', 20, 1, 1, 1, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-new', 'menu-quote', 'new-quote', '新報價', 'item', 'view:new-quote', 10, 1, 1, 0, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-history', 'menu-quote', 'history', '歷史報價', 'item', 'view:history', 20, 1, 1, 0, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-users', 'menu-system', 'users', '帳號管理', 'item', '/admin/users.html', 10, 1, 1, 1, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-calc', 'menu-system', 'calc', '計算參數', 'item', 'view:calc', 20, 1, 1, 0, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-backup', 'menu-system', 'backup', '匯入備份', 'item', 'view:backup', 30, 1, 1, 0, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('menu-menus', 'menu-system', 'menus', '選單管理', 'item', '/admin/menus.html', 40, 1, 1, 1, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z');

INSERT INTO menu_node_roles (node_id, role) VALUES
  ('menu-new', 'admin'),
  ('menu-new', 'sales'),
  ('menu-history', 'admin'),
  ('menu-history', 'sales'),
  ('menu-history', 'service'),
  ('menu-users', 'admin'),
  ('menu-calc', 'admin'),
  ('menu-backup', 'admin'),
  ('menu-menus', 'admin');
