// RR20 evidence extraction: native tool_use/tool_result originals + final assistant texts per role.
import fs from "node:fs";
import path from "node:path";

const R20 = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round20";
const EVID = path.join(R20, "evidence");
const SESS = path.join(EVID, "sessions");
const OUT = path.join(EVID, "extracts");
fs.mkdirSync(OUT, { recursive: true });
const rel = (p) => path.relative(EVID, p).split(path.sep).join("/");
const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const flat = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => typeof x === "string" ? x : x?.type === "text" ? x.text ?? "" : JSON.stringify(x)).join("\n") : JSON.stringify(c ?? "");

const calls = [], results = [], finals = [];
const byId = new Map();
for (const role of fs.existsSync(SESS) ? fs.readdirSync(SESS) : []) {
  const pdir = path.join(SESS, role, "claude", "native", "projects");
  if (!fs.existsSync(pdir)) continue;
  for (const proj of fs.readdirSync(pdir)) {
    const d = path.join(pdir, proj); if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".jsonl"))) {
      const fp = path.join(d, f);
      for (const line of readJsonl(fp)) {
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.type === "assistant" && Array.isArray(j.message?.content)) {
          for (const c of j.message.content) {
            if (c?.type === "tool_use") { const e = { role, ts: j.timestamp ?? null, name: c.name, id: c.id, input: c.input, model: j.message?.model ?? null }; calls.push(e); if (c.id) byId.set(c.id, e); }
            else if (c?.type === "text" && c.text) finals.push({ role, ts: j.timestamp ?? null, kind: "assistant-text", text: c.text });
          }
        }
        if (j.type === "user" && Array.isArray(j.message?.content)) {
          for (const c of j.message.content) if (c?.type === "tool_result") {
            const use = byId.get(c.tool_use_id);
            results.push({ role: use?.role ?? role, ts: j.timestamp ?? null, name: use?.name ?? null, toolUseId: c.tool_use_id, isError: c.is_error ?? null, text: flat(c.content) });
          }
        }
      }
    }
  }
}
fs.writeFileSync(path.join(OUT, "tool-calls.jsonl"), calls.map((c) => JSON.stringify(c)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "tool-results.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "assistant-texts.txt"), finals.map((f) => `===== ${f.role} @ ${f.ts} =====\n${f.text}\n`).join("\n"));
console.log(JSON.stringify({ calls: calls.length, results: results.length, assistantTexts: finals.length, names: calls.reduce((a, c) => (a[c.name] = (a[c.name] ?? 0) + 1, a), {}) }, null, 2));
