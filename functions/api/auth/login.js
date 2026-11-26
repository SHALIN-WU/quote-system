import { authenticateUser, createSessionCookie, sessionReady } from "../../_lib/auth.js";
import { clientIp, json, readJson } from "../../_lib/http.js";
import { accountLockRemaining, clearAccountFailures, ipLockRemaining, recordFailure } from "../../_lib/locks.js";

function tooManyAttempts(remainingMs) {
  const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
  return json({ error: "錯誤次數過多，請稍後再試。" }, 429, { "Retry-After": String(retryAfter) });
}

export async function onRequestPost(context) {
  if (!context.env.DB || !sessionReady(context.env)) {
    return json({ error: "登入失敗，請稍後再試。" }, 500);
  }

  const ip = clientIp(context.request);
  try {
    const ipRemaining = await ipLockRemaining(context.env.DB, ip);
    if (ipRemaining > 0) return tooManyAttempts(ipRemaining);

    let body;
    try {
      body = await readJson(context.request);
    } catch (error) {
      const status = error?.message === "too-large" ? 413 : 400;
      return json({ error: "請輸入帳號與密碼。" }, status);
    }
    if (!body) return json({ error: "請輸入帳號與密碼。" }, 400);

    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password || password.length > 256) {
      return json({ error: "請輸入帳號與密碼。" }, 400);
    }

    const accountRemaining = await accountLockRemaining(context.env.DB, ip, username);
    if (accountRemaining > 0) return tooManyAttempts(accountRemaining);

    const user = await authenticateUser(context.env, username, password);
    if (!user) {
      const lockedUntil = await recordFailure(context.env.DB, ip, username);
      if (lockedUntil > Date.now()) return tooManyAttempts(lockedUntil - Date.now());
      return json({ error: "帳號或密碼錯誤。" }, 401);
    }

    await clearAccountFailures(context.env.DB, ip, username);
    const cookie = await createSessionCookie(context.env, user);
    return json({
      ok: true,
      displayName: user.displayName,
      role: user.role
    }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    console.error("login failed");
    return json({ error: "登入失敗，請稍後再試。" }, 500);
  }
}
