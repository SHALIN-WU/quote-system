import { requireUser } from "../../_lib/auth.js";
import { forbidUnlessPermission } from "../../_lib/permissions.js";
import { json } from "../../_lib/http.js";
import { exportRows } from "../../_lib/quoteStore.js";

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnlessPermission(gate.user, "backup.export");
  if (denied) return denied;
  try {
    return json(await exportRows(context.env.DB));
  } catch (error) {
    console.error("export backup failed");
    return json({ error: "無法匯出備份" }, 500);
  }
}
