-- 帳號 + IP 的連續失敗次數。鎖的是這個組合，不是整段 IP。
CREATE TABLE IF NOT EXISTS login_account_locks (
  username TEXT NOT NULL,
  ip TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (username, ip)
);

-- 同一個 IP 在一個時間窗內的失敗次數。用來擋住換帳號的暴力嘗試。
CREATE TABLE IF NOT EXISTS login_ip_locks (
  ip TEXT PRIMARY KEY NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
