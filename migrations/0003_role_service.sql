-- 查看者 viewer 改為客服 service。不修改 0001、0002。
-- 權限定案寫在 functions/_lib/users.js，這一期尚未限制報價畫面。

CREATE TABLE users_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'service')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

INSERT INTO users_v2 (
  id, username, display_name, role, password_hash, active, created_at, updated_at, last_login_at
)
SELECT
  id,
  username,
  display_name,
  CASE role WHEN 'viewer' THEN 'service' ELSE role END,
  password_hash,
  active,
  created_at,
  updated_at,
  last_login_at
FROM users;

DROP TABLE users;

ALTER TABLE users_v2 RENAME TO users;

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_active ON users (active);
