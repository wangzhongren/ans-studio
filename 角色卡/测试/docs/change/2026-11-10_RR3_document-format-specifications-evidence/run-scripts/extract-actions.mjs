// RR3: extract product tool actions (write/edit/run_shell) and chief request_choice/report evidence.
import fs from "node:fs";
import path from "node:path";

const EVID = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3\\evidence";
const OUT = path.join(EVID, "extracts");
fs.mkdirSync(OUT, { recursive: true });
const projRoot = (role) => path.join(EVID, "sessions", role, "claude", "native", "projects");
function readRole(role) {
  const root = projRoot(role);
  const rows = [];
  if (!fs.existsSync(root)) return rows;
  for (const d of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, d))) if (f.endsWith(".jsonl")) {
    for (const line of fs.readFileSync(path.join(root, d, f), "utf8").split(/\r?\n/).filter(Boolean)) { try { rows.push(JSON.parse(line)); } catch {} }
  }
  return rows;
}
const flatten = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c))).join("\n") : JSON.stringify(content);
function actions(role) {
  const rows = readRole(role); const useIds = new Map(); const out = [];
  for (const j of rows) {
    if (j.type === "assistant" && Array.isArray(j.message?.content)) for (const c of j.message.content) {
      if (c?.type === "tool_use") { useIds.set(c.id, c.name); out.push({ ts: j.timestamp, phase: "use", tool: c.name, toolUseId: c.id, input: c.input }); }
    }
    if (j.type === "user" && Array.isArray(j.message?.content)) for (const c of j.message.content) if (c?.type === "tool_result") {
      out.push({ ts: j.timestamp, phase: "result", tool: useIds.get(c.tool_use_id) ?? null, toolUseId: c.tool_use_id, isError: c.is_error ?? null, text: flatten(c.content).slice(0, 4000) });
    }
  }
  return out;
}
const productActions = actions("product");
const writeEdit = productActions.filter((a) => a.phase === "use" && ["mcp__ans__write_file", "mcp__ans__edit_file"].includes(a.tool));
const shell = productActions.filter((a) => a.phase === "use" && a.tool === "mcp__ans__run_shell");
const shellResults = productActions.filter((a) => a.phase === "result" && shell.some((s) => s.toolUseId === a.toolUseId));
const summary = {
  productToolCounts: productActions.filter((a) => a.phase === "use").reduce((m, a) => { m[a.tool] = (m[a.tool] ?? 0) + 1; return m; }, {}),
  writeEditCount: writeEdit.length, shellCount: shell.length,
  writeEdit: writeEdit.map((a) => ({ ts: a.ts, tool: a.tool, path: a.input?.path, oldLen: typeof a.input?.old_string === "string" ? a.input.old_string.length : null, newLen: typeof a.input?.new_string === "string" ? a.input.new_string.length : null, contentLen: typeof a.input?.content === "string" ? a.input.content.length : null })),
  shell: shell.map((a) => ({ ts: a.ts, command: a.input?.command })),
  shellResults,
  productReport: productActions.filter((a) => a.tool === "mcp__ans__submit_report"),
  chiefRequestChoice: actions("chief").filter((a) => a.tool === "mcp__ans__request_choice"),
  chiefDispatch: actions("chief").filter((a) => a.tool === "mcp__ans__dispatch_task"),
};
fs.writeFileSync(path.join(OUT, "product-actions.json"), JSON.stringify(productActions, null, 2));
fs.writeFileSync(path.join(OUT, "rr3-actions-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2).slice(0, 8000));
