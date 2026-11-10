// Build RR3 summary from drive log + extracts.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const EVID = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3\\evidence";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const drive = fs.readFileSync(path.join(EVID, "drive.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const actions = JSON.parse(fs.readFileSync(path.join(EVID, "extracts", "rr3-actions-summary.json"), "utf8"));
const intent = fs.readFileSync(path.join(EVID, "product", "jinyong-rogue-2d-intent-v4.md"));
const card = drive.find((r) => r.type === "intent.card.presented");
const summary = {
  round: "RR3",
  status: "decisive evidence complete (product real read; intent v4; prepareIntentConfirmation committed; intent card 1 confirmed); project-role operator direct query rejected by app -> B1 RR-7 fallback",
  keyFacts: {
    dispatchAccepted: drive.find((r) => r.type === "task.row" && r.kind === "task.created") ?? null,
    productDocFormat: drive.filter((r) => r.type === "doc_format.tool_use" && r.role === "product"),
    productDocFormatReceiptBytes: drive.filter((r) => r.type === "doc_format.tool_result" && r.role === "product").map((r) => r.textBytes),
    productToolCounts: actions.productToolCounts,
    productWriteEditCount: actions.writeEditCount,
    productShellCount: actions.shellCount,
    productShellResults: actions.shellResults.map((r) => ({ ts: r.ts, isError: r.isError, text: r.text.slice(0, 200) })),
    intentDoc: { path: "docs/product/jinyong-rogue-2d-intent-v4.md", bytes: intent.length, sha256: sha(intent) },
    intentCard: card ? { requestId: card.requestId, title: card.title, marker: card.marker, at: card.ts } : null,
    intentFreeze: drive.filter((r) => String(r.type) === "diag" && /intent\.confirmation\.freeze/.test(r.event)).map((r) => ({ event: r.event, at: r.at, phase: r.phase })),
    requestResolved: drive.find((r) => r.type === "task.row" && r.kind === "request.resolved") ?? null,
    operatorProjectRoleSend: JSON.parse(fs.readFileSync(path.join(EVID, "operator-project-role-send.json"), "utf8")),
    shellCardDeny: JSON.parse(fs.readFileSync(path.join(EVID, "shell-card-deny.json"), "utf8")),
    projectRoleSession: drive.find((r) => r.type === "role.open" && r.roleId === "test-dev") ?? null,
    budget: { customerMessages: 1, cards: 1, operatorMessagesDelivered: 0, productDocFormatCalls: 1, projectRoleDocFormatCalls: 0, chiefDocFormatCalls: 0 },
    wallClock: { launch: fs.readFileSync(path.join(EVID, "launch-time.txt"), "utf8").trim(), appClosedUtc: "2026-11-09T17:15:5xZ" },
  },
};
fs.writeFileSync(path.join(EVID, "rr3-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2).slice(0, 4200));
