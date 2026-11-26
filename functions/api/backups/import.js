import { forbidUnless, requireUser } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { importBackup } from "../../_lib/quoteStore.js";

const BODY_MAX = 8000000;

export async function onRequestPost(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin"]);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(context.request, BODY_MAX);
  } catch (error) {
    return json({ error: "檔案太大，沒有變更現有資料" }, error?.message === "too-large" ? 413 : 400);
  }
  if (!body) return json({ error: "檔案不是有效的 JSON，沒有變更現有資料" }, 400);
  try {
    const result = await importBackup(context.env.DB, gate.user, body);
    return json(result);
  } catch (error) {
    if (error?.code === "INVALID") {
      const message = String(error.message || "");
      const text = message.includes("沒有變更") ? message : message + "，沒有變更現有資料";
      return json({ error: text }, 400);
    }
    console.error("import backup failed");
    return json({ error: "沒有變更現有資料" }, 500);
  }
}
