// Extract round-1 native transcript evidence (chief doc_format call/receipt, dispatch inputs/receipts, prompt snapshot).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const EVID = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\evidence";
const OUT = path.join(EVID, "extracts");
fs.mkdirSync(OUT, { recursive: true });
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const flatten = (content) => typeof content === "string" ? content : Array.isArray(content)
  ? content.map((c) => typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c))).join("\n")
  : JSON.stringify(content);

const projRoot = path.join(EVID, "sessions", "chief", "claude", "native", "projects");
const files = [];
for (const d of fs.readdirSync(projRoot)) for (const f of fs.readdirSync(path.join(projRoot, d))) if (f.endsWith(".jsonl")) files.push(path.join(projRoot, d, f));
const rows = [];
for (const f of files) for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean)) { try { rows.push({ file: path.relative(EVID, f).split(path.sep).join("/"), j: JSON.parse(line) }); } catch {} }

const docCalls = [], docResults = [], dispatchCalls = [], dispatchResults = [], promptSnapshots = [], assistantTexts = [];
const useIds = new Map();
for (const { file, j } of rows) {
  if (j.attachment?.type === "prompt_snapshot") {
    const sys = Array.isArray(j.attachment.systemPrompt) ? j.attachment.systemPrompt.join("\n\n") : String(j.attachment.systemPrompt ?? "");
    promptSnapshots.push({ ts: j.timestamp ?? null, file, bytes: Buffer.byteLength(sys), sha256: sha256(Buffer.from(sys)), sys });
  }
  if (j.type === "assistant" && Array.isArray(j.message?.content)) {
    for (const c of j.message.content) {
      if (c?.type === "tool_use" && typeof c.name === "string") {
        if (/doc_format$/.test(c.name)) { docCalls.push({ ts: j.timestamp, file, toolUseId: c.id, toolName: c.name, input: c.input, model: j.message?.model }); useIds.set(c.id, "doc"); }
        if (/dispatch_task$/.test(c.name)) { dispatchCalls.push({ ts: j.timestamp, file, toolUseId: c.id, toolName: c.name, input: c.input, model: j.message?.model }); useIds.set(c.id, "dispatch"); }
      }
      if (c?.type === "text" && typeof c.text === "string" && c.text.trim() !== "") assistantTexts.push({ ts: j.timestamp, file, text: c.text.slice(0, 4000) });
    }
  }
  if (j.type === "user" && Array.isArray(j.message?.content)) {
    for (const c of j.message.content) {
      if (c?.type === "tool_result") {
        const kind = useIds.get(c.tool_use_id);
        const text = flatten(c.content);
        if (kind === "doc") docResults.push({ ts: j.timestamp, file, toolUseId: c.tool_use_id, isError: c.is_error ?? null, text });
        if (kind === "dispatch") dispatchResults.push({ ts: j.timestamp, file, toolUseId: c.tool_use_id, isError: c.is_error ?? null, text });
      }
    }
  }
}
const write = (name, v) => fs.writeFileSync(path.join(OUT, name), typeof v === "string" ? v : JSON.stringify(v, null, 2));
write("chief-doc-format-call.json", docCalls);
write("chief-doc-format-receipt.json", docResults);
write("chief-dispatch-task-inputs.json", dispatchCalls);
write("chief-dispatch-task-receipts.json", dispatchResults);
write("chief-assistant-texts.json", assistantTexts);
write("prompt-snapshot-meta.json", promptSnapshots.map(({ sys, ...meta }) => meta));
if (promptSnapshots[0]) write("chief-system-prompt.txt", promptSnapshots[0].sys);
console.log(JSON.stringify({
  docCalls: docCalls.length, docResults: docResults.length,
  dispatchCalls: dispatchCalls.length, dispatchResults: dispatchResults.length,
  promptSnapshots: promptSnapshots.map(({ sys, ...m }) => m),
  dispatchInputs: dispatchCalls.map((c) => ({ ts: c.ts, keys: Object.keys(c.input ?? {}), roleId: c.input?.roleId ?? c.input?.to ?? null, flowId: c.input?.flowId ?? null, moduleId: c.input?.moduleId ?? null, moduleDirectory: c.input?.moduleDirectory ?? null })),
  dispatchResultHead: dispatchResults.map((r) => ({ ts: r.ts, isError: r.isError, text: r.text.slice(0, 600) })),
  docReceiptHead: docResults.map((r) => ({ ts: r.ts, bytes: Buffer.byteLength(r.text), head: r.text.slice(0, 300) })),
}, null, 2));
