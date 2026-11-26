const LOCK_MS = 10 * 60 * 1000;
const ACCOUNT_MAX_FAILS = 5;
const IP_MAX_FAILS = 20;

function parseTime(value) {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function accountKey(username) {
  const key = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(key)) return "";
  return key;
}

export async function ipLockRemaining(db, ip) {
  const row = await db.prepare("SELECT locked_until FROM login_ip_locks WHERE ip = ?").bind(ip).first();
  const until = parseTime(row?.locked_until);
  if (until <= Date.now()) return 0;
  return until - Date.now();
}

export async function accountLockRemaining(db, ip, username) {
  const key = accountKey(username);
  if (!key) return 0;
  const row = await db
    .prepare("SELECT locked_until FROM login_account_locks WHERE username = ? AND ip = ?")
    .bind(key, ip)
    .first();
  const until = parseTime(row?.locked_until);
  if (until <= Date.now()) return 0;
  return until - Date.now();
}

async function recordAccountFailure(db, ip, username, now) {
  const key = accountKey(username);
  if (!key) return 0;
  const nowIso = new Date(now).toISOString();
  const row = await db
    .prepare("SELECT fails, locked_until FROM login_account_locks WHERE username = ? AND ip = ?")
    .bind(key, ip)
    .first();

  const lockedUntil = parseTime(row?.locked_until);
  if (lockedUntil > now) return lockedUntil;

  let fails = Number(row?.fails) || 0;
  fails += 1;

  let lockedUntilMs = 0;
  let lockedUntilIso = null;
  if (fails >= ACCOUNT_MAX_FAILS) {
    fails = 0;
    lockedUntilMs = now + LOCK_MS;
    lockedUntilIso = new Date(lockedUntilMs).toISOString();
  }

  await db
    .prepare(`INSERT INTO login_account_locks (username, ip, fails, locked_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username, ip) DO UPDATE SET
        fails = excluded.fails,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at`)
    .bind(key, ip, fails, lockedUntilIso, nowIso)
    .run();
  return lockedUntilMs;
}

async function recordIpFailure(db, ip, now) {
  const nowIso = new Date(now).toISOString();
  const row = await db
    .prepare("SELECT fails, window_started_at, locked_until FROM login_ip_locks WHERE ip = ?")
    .bind(ip)
    .first();

  const lockedUntil = parseTime(row?.locked_until);
  if (lockedUntil > now) return lockedUntil;

  let fails = 0;
  let windowStart = now;
  const started = parseTime(row?.window_started_at);
  if (started && now - started <= LOCK_MS) {
    fails = Number(row?.fails) || 0;
    windowStart = started;
  }
  fails += 1;

  let lockedUntilMs = 0;
  let lockedUntilIso = null;
  if (fails >= IP_MAX_FAILS) {
    fails = 0;
    lockedUntilMs = now + LOCK_MS;
    lockedUntilIso = new Date(lockedUntilMs).toISOString();
    windowStart = now;
  }

  await db
    .prepare(`INSERT INTO login_ip_locks (ip, fails, window_started_at, locked_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        fails = excluded.fails,
        window_started_at = excluded.window_started_at,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at`)
    .bind(ip, fails, new Date(windowStart).toISOString(), lockedUntilIso, nowIso)
    .run();
  return lockedUntilMs;
}

export async function recordFailure(db, ip, username) {
  const now = Date.now();
  const accountUntil = await recordAccountFailure(db, ip, username, now);
  const ipUntil = await recordIpFailure(db, ip, now);
  return Math.max(accountUntil, ipUntil);
}

export async function clearAccountFailures(db, ip, username) {
  const key = accountKey(username);
  if (!key) return;
  await db
    .prepare("DELETE FROM login_account_locks WHERE username = ? AND ip = ?")
    .bind(key, ip)
    .run();
}
