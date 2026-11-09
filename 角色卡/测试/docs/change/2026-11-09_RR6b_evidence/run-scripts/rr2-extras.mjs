// RR6b extras: gather remaining focused evidence into evidence2 (outside repo). Read-only on target/repo.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RR = "C:\\Users\\51054\\Desktop\\work\\ans-team-plan-run-2026-11-09";
const EVID = path.join(RR, "evidence2");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
const EX = path.join(EVID, "extras");
fs.mkdirSync(EX, { recursive: true });

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); return { src: a, dst: b, bytes: fs.statSync(b).size, sha256: sha256(fs.readFileSync(b)) }; };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

const out = { at: new Date().toISOString() };

// 1) doc-freezes post
const df = path.join(TARGET, ".ans/state/doc-freezes.json");
if (exists(df)) out.docFreezesPost = cp(df, path.join(EVID, "post", "doc-freezes-post.json"));
let dfParsed = null; try { dfParsed = JSON.parse(fs.readFileSync(df, "utf8")); } catch {}
out.docFreezesSummary = dfParsed ? { builtAt: dfParsed.builtAt ?? null, entries: Array.isArray(dfParsed.entries) ? dfParsed.entries.map((e) => ({ path: e.path, frozen: e.frozen, reason: e.reason })) : Object.keys(dfParsed) } : null;

// 2) convener native transcript tail (submit_report denial after rejection)
const convFile = path.join(TARGET, ".ans/sessions/convener/claude/native/projects/C--Users-51054-Desktop-work-ans-game2d-snake-2026-11-09-target/47cd65cf-23fc-4a78-8810-b0cfd1268c1e.jsonl");
if (exists(convFile)) {
  const lines = fs.readFileSync(convFile, "utf8").split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-8);
  fs.writeFileSync(path.join(EX, "convener-native-tail.jsonl"), tail.join("\n") + "\n");
  out.convenerTail = { file: "extras/convener-native-tail.jsonl", lines: tail.length };
}

// 3) rapporteur native transcript lines for the restored turn (13:23:40-13:24:01)
const rapFile = path.join(TARGET, ".ans/sessions/rapporteur/claude/native/projects/C--Users-51054-Desktop-work-ans-game2d-snake-2026-11-09-target/71c2e2e3-22b4-4f99-acc1-4f8462cbb9a7.jsonl");
if (exists(rapFile)) {
  const lines = fs.readFileSync(rapFile, "utf8").split(/\r?\n/).filter(Boolean);
  const keep = [];
  for (const l of lines) {
    let j = null; try { j = JSON.parse(l); } catch { continue; }
    const ts = j.timestamp;
    if (typeof ts === "string" && ts >= "2026-11-09T13:23:40" && ts <= "2026-11-09T13:24:01") {
      const row = { type: j.type, timestamp: ts, model: j.message?.model ?? null, content: Array.isArray(j.message?.content) ? j.message.content.map((c) => c.type === "tool_use" ? { type: "tool_use", name: c.name, input: c.input } : c.type === "tool_result" ? { type: "tool_result", tool_use_id: c.tool_use_id ?? null, content: typeof c.content === "string" ? c.content.slice(0, 1200) : c.content } : { type: c.type, text: typeof c.text === "string" ? c.text.slice(0, 1200) : undefined }) : undefined };
      keep.push(row);
    }
  }
  writeJson(path.join(EX, "rapporteur-native-restored-turn.json"), keep);
  out.rapporteurTurnRows = keep.length;
}

// 4) rapporteur report for restored task
const rep = path.join(TARGET, ".ans/sessions/rapporteur/claude/ans/reports/781f07fd4cc5339e470ac32d687902726e49dd8ab2f5d465a1efae906d4d956c.json");
if (exists(rep)) out.rapporteurReport = cp(rep, path.join(EX, "rapporteur-report-t-mw99xpan.json"));

// 5) new init-source (customer-turn work source binding convener task to the run)
const initDir = path.join(TARGET, ".ans/trunk/initialization-sources");
if (exists(initDir)) {
  out.initSourcesPost = fs.readdirSync(initDir).map((name) => ({ name, bytes: fs.statSync(path.join(initDir, name)).size, sha256: sha256(fs.readFileSync(path.join(initDir, name))) }));
  const newOne = out.initSourcesPost.find((x) => x.name.includes("e193e7ed"));
  if (newOne) out.initSourceNew = cp(path.join(initDir, newOne.name), path.join(EX, "init-source-e193e7ed.json"));
}

// 6) chief task text (from ledger)
const tasks = exists(path.join(TARGET, ".ans/state/tasks.jsonl")) ? fs.readFileSync(path.join(TARGET, ".ans/state/tasks.jsonl"), "utf8").split(/\r?\n/).filter(Boolean) : [];
for (const l of tasks) { let j = null; try { j = JSON.parse(l); } catch { continue; } if (j.kind === "task.created" && j.taskId === "t-mw9akvrp-d49be2d5") { fs.writeFileSync(path.join(EX, "chief-task-t-mw9akvrp.txt"), j.text ?? ""); break; } }

// 7) model disclosure
const envPath = path.join(REPO, ".env");
const envLines = exists(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => /^ANS_CLAUDE_MODEL=|^ANS_CLAUDE_REASONING_EFFORT=/.test(l)) : [];
const models = new Set();
(function scan(dir) {
  if (!exists(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { scan(p); continue; }
    if (!ent.isFile() || !ent.name.endsWith(".jsonl")) continue;
    for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean)) {
      if (!l.includes('"model"')) continue;
      let j = null; try { j = JSON.parse(l); } catch { continue; }
      if (j.message?.model) models.add(j.message.model);
    }
  }
})(path.join(TARGET, ".ans/sessions"));
fs.writeFileSync(path.join(EX, "model-disclosure.txt"), [
  "provider session dir: runtime=claude (all three sessions this run)",
  ...envLines,
  "native message.model values seen: " + [...models].join(", "),
  "note: ANS_CLAUDE_MODEL is NOT an Anthropic model; this run does not claim Claude/Anthropic.",
].join("\n") + "\n");

// 8) run-window timeline from diagnostics + ledger
const diagPath = path.join(RR, "userData2", "ans", "diagnostics", "ans-diagnostics-2026-11-09.jsonl");
const diag = exists(diagPath) ? fs.readFileSync(diagPath, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const interesting = diag.filter((j) => typeof j.at === "string" && j.at >= "2026-11-09T13:22:30" && /tasks\.restored|delivery\.(start|end|blocked|skip)|session\.open|report\.received|turn\.settled|request\.attempt|request\.first-byte|governance\.feedback/.test(String(j.event ?? "")));
fs.writeFileSync(path.join(EX, "run-window-diagnostics-timeline.txt"), interesting.map((j) => `${j.at} ${j.component ?? ""} ${j.event ?? ""} ${j.roleId ?? ""} ${j.reasonCode ?? ""} ${j.state ?? ""}`.replace(/\s+/g, " ").trim()).join("\n") + "\n");
out.diagTimeline = { file: "extras/run-window-diagnostics-timeline.txt", lines: interesting.length };

// 9) copy rr2 scripts into evidence
const scriptsSrc = path.join(RR, "rr2");
const scriptsDst = path.join(EVID, "run-scripts");
fs.mkdirSync(scriptsDst, { recursive: true });
out.runScripts = [];
for (const name of fs.readdirSync(scriptsSrc)) {
  const p = path.join(scriptsSrc, name);
  if (!fs.statSync(p).isFile()) continue;
  out.runScripts.push(cp(p, path.join(scriptsDst, name)).dst.replace(EVID + path.sep, "").split(path.sep).join("/") + " sha256=" + sha256(fs.readFileSync(p)));
}

// 10) regenerate evidence manifest (excluding itself)
function walkEvidence(dir) {
  const acc = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) acc.push(...walkEvidence(p));
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}
const evFiles = walkEvidence(EVID).filter((p) => path.basename(p) !== "evidence-manifest.txt").sort((a, b) => Buffer.compare(Buffer.from(path.relative(EVID, a)), Buffer.from(path.relative(EVID, b))));
fs.writeFileSync(path.join(EVID, "evidence-manifest.txt"), evFiles.map((p) => `${sha256(fs.readFileSync(p))} *${path.relative(EVID, p).split(path.sep).join("/")}`).join("\n") + "\n");
out.evidenceFiles = evFiles.length;

writeJson(path.join(EX, "extras-summary.json"), out);
console.log(JSON.stringify(out, null, 1));
