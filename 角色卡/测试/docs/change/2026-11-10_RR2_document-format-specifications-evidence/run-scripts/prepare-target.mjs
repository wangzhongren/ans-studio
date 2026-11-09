// RR2 (authorized correction round) prepare: copy the legitimate non-snake project jinyong-rogue-2d into
// an isolated fresh target under round2/ (skip old runtime sessions; update .ans/project.json projectRoot).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round2";
const SOURCE = "C:\\Users\\51054\\Desktop\\work\\jinyong-rogue-2d";
const TARGET = path.join(RUN, "target");
const PRE = path.join(RUN, "evidence", "pre");
fs.mkdirSync(PRE, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

function copyTree(srcDir, dstDir, relBase = "") {
  fs.mkdirSync(dstDir, { recursive: true });
  const rows = [];
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relBase === "" ? ent.name : `${relBase}/${ent.name}`;
    if (rel === ".ans/sessions") continue;
    const src = path.join(srcDir, ent.name), dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) rows.push(...copyTree(src, dst, rel));
    else if (ent.isFile()) { fs.copyFileSync(src, dst); const buf = fs.readFileSync(dst); rows.push({ rel, bytes: buf.length, sha256: sha256(buf) }); }
  }
  return rows;
}

const out = { at: new Date().toISOString(), round: "RR2", source: SOURCE, target: TARGET, skipped: [".ans/sessions"] };
const copied = copyTree(SOURCE, TARGET);
out.copiedFileCount = copied.length;
fs.writeFileSync(path.join(PRE, "target-copy-files.sha256"), copied.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");

const projPath = path.join(TARGET, ".ans/project.json");
const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
const oldRoot = proj.projectRoot;
proj.projectRoot = TARGET.replace(/\\/g, "/");
fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + "\n");
out.projectJsonRewrite = { oldRoot, newRoot: proj.projectRoot, roles: Object.keys(proj.roles ?? {}), governanceModel: proj.governanceModel, pinCount: proj.governanceBoundary?.acceptance?.pin?.length ?? 0 };

// verify role cards + boundary pins; roster v11 module list (for the customer message / evidence)
out.roles = {};
for (const roleId of Object.keys(proj.roles ?? {}).sort()) {
  const dir = path.join(TARGET, "角色卡", roleId);
  out.roles[roleId] = fs.readdirSync(dir).sort().map((f) => ({ file: f, bytes: fs.statSync(path.join(dir, f)).size, sha256: sha256(fs.readFileSync(path.join(dir, f))) }));
}
out.boundaryPinCheck = (proj.governanceBoundary?.acceptance?.pin ?? []).map((pin) => {
  const p = path.join(TARGET, pin.path);
  const actual = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
  return { path: pin.path, match: actual === pin.sha256 };
});
const rosterPath = path.join(TARGET, "docs/proposals/jinyong-rogue-2d-roster-v11.md");
const rosterText = fs.readFileSync(rosterPath, "utf8");
const section = (name) => {
  const i = rosterText.indexOf(`\n${name}:\n`);
  if (i < 0) return "";
  const rest = rosterText.slice(i + name.length + 3);
  const m = /\n(?=[A-Za-z][A-Za-z0-9]*:)/.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
};
const roleIds = [...section("roles").matchAll(/^  - id: "([a-z0-9-]+)"/gm)].map((m) => m[1]);
const modulesText = section("modules");
const moduleEntries = [];
for (const m of modulesText.matchAll(/^  - id: "([a-z0-9-]+)"\r?\n([\s\S]*?)(?=^  - id: "|(?![\s\S]))/gm)) {
  const body = m[2];
  const path = (/^    path: "([^"]+)"/m.exec(body) ?? [])[1] ?? null;
  const paths = (() => { const pm = /^    paths: \[([^\]]*)\]/m.exec(body); return pm ? [...pm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; })();
  moduleEntries.push({ id: m[1], path, paths });
}
out.roster = { path: "docs/proposals/jinyong-rogue-2d-roster-v11.md", bytes: fs.statSync(rosterPath).size, sha256: sha256(fs.readFileSync(rosterPath)), roleIds, modules: moduleEntries };

// ledger sanity: no open tasks / requests (avoid restore replays)
const lines = fs.readFileSync(path.join(TARGET, ".ans/state/tasks.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const tasks = new Map(); const resolved = new Set();
for (const j of lines) {
  if (j.kind === "request.resolved") resolved.add(j.requestId);
  if (j.taskId) {
    if (!tasks.has(j.taskId)) tasks.set(j.taskId, { created: null, delivered: false, closed: false });
    const t = tasks.get(j.taskId);
    if (j.kind === "task.created") t.created = j;
    if (j.kind === "task.delivered") t.delivered = true;
    if (j.kind === "task.closed") t.closed = true;
  }
}
out.ledger = {
  rows: lines.length,
  openUndelivered: [...tasks.entries()].filter(([, t]) => t.created && !t.closed && !t.delivered).map(([id, t]) => ({ taskId: id, to: t.created.to })),
  openRequests: lines.filter((j) => j.kind === "request.created" && !resolved.has(j.requestId)).map((j) => j.requestId),
};
writeJson(path.join(PRE, "prepare-target.json"), out);
if (out.ledger.openUndelivered.length || out.ledger.openRequests.length) { console.error("ABORT open tasks/requests"); process.exit(2); }
console.log(JSON.stringify({ targetFileCount: out.copiedFileCount, roles: Object.keys(out.roles), projectRoot: proj.projectRoot, pinsAllMatch: out.boundaryPinCheck.every((p) => p.match), roster: { roleIds, modules: moduleEntries }, ledger: { rows: out.ledger.rows, openUndelivered: 0, openRequests: 0 } }, null, 2));
