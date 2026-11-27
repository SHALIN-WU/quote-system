-- 角色與權限。不修改 0001 到 0006。
-- users.role 仍是角色 id。拿掉只能是 admin、sales、service 的檢查，既有值原樣保留。

CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL UNIQUE,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

INSERT INTO roles (id, label, is_system, created_at, updated_at) VALUES
  ('admin', '管理員', 1, '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('sales', '業務', 1, '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('service', '客服', 1, '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z');

INSERT INTO role_permissions (role_id, permission) VALUES
  ('admin', 'quote.view'),
  ('admin', 'quote.write'),
  ('admin', 'quote.copy'),
  ('admin', 'quote.delete'),
  ('admin', 'quote.cost'),
  ('admin', 'backup.export'),
  ('admin', 'backup.import'),
  ('admin', 'settings.calc'),
  ('admin', 'users.manage'),
  ('admin', 'menus.manage'),
  ('admin', 'roles.manage'),
  ('sales', 'quote.view'),
  ('sales', 'quote.write'),
  ('sales', 'quote.copy'),
  ('sales', 'quote.cost'),
  ('sales', 'backup.export'),
  ('service', 'quote.view');

CREATE TABLE users_v3 (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

INSERT INTO users_v3 (
  id, username, display_name, role, password_hash, active, created_at, updated_at, last_login_at
)
SELECT
  id, username, display_name, role, password_hash, active, created_at, updated_at, last_login_at
FROM users;

DROP TABLE users;

ALTER TABLE users_v3 RENAME TO users;

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_active ON users (active);

CREATE TABLE menu_node_roles_v2 (
  node_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (node_id, role)
);

INSERT INTO menu_node_roles_v2 (node_id, role)
SELECT node_id, role FROM menu_node_roles;

DROP TABLE menu_node_roles;

ALTER TABLE menu_node_roles_v2 RENAME TO menu_node_roles;

CREATE INDEX idx_menu_node_roles_node ON menu_node_roles (node_id);

INSERT INTO menu_nodes (
  id, parent_id, node_key, label, kind, target, sort_order, visible, is_system, lock_admin, created_at, updated_at
) VALUES (
  'menu-roles', 'menu-system', 'roles', '角色管理', 'item', '/admin/roles.html', 50, 1, 1, 1,
  '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'
);

INSERT INTO menu_node_roles (node_id, role) VALUES ('menu-roles', 'admin');
