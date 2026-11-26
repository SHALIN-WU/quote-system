import { forbidUnless, requireUser } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { exportRows } from "../../_lib/quoteStore.js";

export async function onRequestGet(context) {
  const gate = await requireUser(context.request, context.env);
  if (gate.response) return gate.response;
  const denied = forbidUnless(gate.user, ["admin", "sales"]);
  if (denied) return denied;
  try {
    return json(await exportRows(context.env.DB));
  } catch (error) {
    console.error("export backup failed");
    return json({ error: "無法匯出備份" }, 500);
  }
}
