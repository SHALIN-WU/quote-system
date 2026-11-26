import { requireActiveUser } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    const user = await requireActiveUser(context.request, context.env);
    if (!user) return json({ authenticated: false }, 401);
    return json({
      authenticated: true,
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    });
  } catch (error) {
    console.error("session lookup failed");
    return json({ error: "請稍後再試" }, 500);
  }
}
