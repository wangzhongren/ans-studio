// Round-1 evidence finalization (app already closed and process tree terminated).
import fs from "node:fs";
import path from "node:path";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10";
const EVID = path.join(RUN, "evidence");
const TARGET = path.join(RUN, "target");
const USERDATA = path.join(RUN, "userData");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const cp = (src, dst) => { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch (e) { console.error("cp", src, e.message); } };

cp(path.join(TARGET, ".ans/state/tasks.jsonl"), path.join(EVID, "tasks-final.jsonl"));
cp(path.join(TARGET, ".ans/state/versions.jsonl"), path.join(EVID, "versions-final.jsonl"));
const diagDir = path.join(USERDATA, "ans", "diagnostics");
if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(diagDir)) cp(path.join(diagDir, f), path.join(d, f)); }
const sessionsDir = path.join(TARGET, ".ans/sessions");
if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch (e) { console.error("sessions", e); } }

const drive = readJsonl(path.join(EVID, "drive.jsonl")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const sessionsOpened = drive.filter((r) => r.type === "role.open").map((r) => ({ roleId: r.roleId, result: r.result }));
const docFormatRows = drive.filter((r) => r.type === "doc_format.tool_use" || r.type === "doc_format.tool_result");
const dispatchRows = drive.filter((r) => r.type === "task.row").filter((r) => ["task.created", "task.reported", "project.note"].includes(r.kind));
const promptSnapshots = drive.filter((r) => r.type === "prompt.snapshot");
const summary = {
  round: "RR-round1",
  status: "halted-at-first-decisive-result: product dispatch rejected before delivery (delivery-assignment-ledger-invalid:task.created.moduleDirectory)",
  decisiveFailure: { at: "2026-11-09T16:51:29.700Z", receipt: "应用观察到失败：delivery-target-open-failed: delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法", note: drive.find((r) => r.type === "task.row" && r.kind === "project.note") ?? null },
  sessionsOpened,
  docFormatRows,
  dispatchRows,
  promptSnapshots: promptSnapshots.map((r) => ({ role: r.role, systemPromptBytes: r.systemPromptBytes, hasDocFormatGuideline: r.hasDocFormatGuideline, systemPromptSha256: r.systemPromptSha256 })),
  customerMessageSentAt: drive.find((r) => r.type === "compose.sent" && r.label === "customer")?.mark ?? null,
  wallClock: { launch: fs.readFileSync(path.join(EVID, "launch-time.txt"), "utf8").trim(), appClosedUtc: "2026-11-09T16:54:20Z(approx)", note: "Browser.close closed window; main process residue force-terminated (taskkill /T /F on our own run tree); 9223 released." },
  budget: { customerMessages: 1, cards: 0, operatorProjectMessages: 0, productDocFormatCalls: 0, chiefDocFormatCalls: docFormatRows.filter((r) => r.role === "chief" && r.type === "doc_format.tool_use").length },
};
fs.writeFileSync(path.join(EVID, "round1-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2).slice(0, 3200));
