// RR document-format-specifications: prepare isolated target by copying a legitimate non-snake
// existing project (jinyong-rogue-2d: trio governance, 8 project roles with role-card.md+boundary.yaml,
// appointment/appointment-write ledger records and accepted governance boundary pins).
// Preparation only; outside repo; does not touch snake roots; does not launch the app.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10";
const SOURCE = "C:\\Users\\51054\\Desktop\\work\\jinyong-rogue-2d";
const TARGET = path.join(RUN, "target");
const EVID = path.join(RUN, "evidence");
const PRE = path.join(EVID, "pre");
fs.mkdirSync(PRE, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

function copyTree(srcDir, dstDir, relBase = "") {
  fs.mkdirSync(dstDir, { recursive: true });
  const rows = [];
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relBase === "" ? ent.name : `${relBase}/${ent.name}`;
    // Skip old runtime session state (not activation evidence; avoids stale resume side effects).
    if (rel === ".ans/sessions") continue;
    const src = path.join(srcDir, ent.name), dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) rows.push(...copyTree(src, dst, rel));
    else if (ent.isFile()) { fs.copyFileSync(src, dst); const buf = fs.readFileSync(dst); rows.push({ rel, bytes: buf.length, sha256: sha256(buf) }); }
  }
  return rows;
}

const out = { at: new Date().toISOString(), source: SOURCE, target: TARGET, skipped: [".ans/sessions"] };

// 1) preseed source identity (read-only, legitimate non-snake project)
const roleDirs = fs.readdirSync(path.join(SOURCE, "角色卡"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
out.sourceRoleDirs = roleDirs;
out.sourceFiles = {};
for (const roleId of roleDirs) {
  const dir = path.join(SOURCE, "角色卡", roleId);
  out.sourceFiles[`角色卡/${roleId}`] = fs.readdirSync(dir).sort().map((f) => {
    const buf = fs.readFileSync(path.join(dir, f));
    return { file: f, bytes: buf.length, sha256: sha256(buf) };
  });
}
for (const rel of ["角色卡/governance-boundary.yaml", ".ans/project.json", ".ans/state/tasks.jsonl", ".ans/state/versions.jsonl"]) {
  const p = path.join(SOURCE, rel);
  const buf = fs.readFileSync(p);
  out.sourceFiles[rel] = { bytes: buf.length, sha256: sha256(buf) };
}

// 2) copy (minus .ans/sessions)
const copied = copyTree(SOURCE, TARGET);
out.copiedFileCount = copied.length;
fs.writeFileSync(path.join(PRE, "target-copy-files.sha256"), copied.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");

// 3) point .ans/project.json projectRoot at the new isolated target (routes only; pins/files unchanged)
const projPath = path.join(TARGET, ".ans/project.json");
const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
const oldRoot = proj.projectRoot;
proj.projectRoot = TARGET.replace(/\\/g, "/");
fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + "\n");
out.projectJsonRewrite = { path: ".ans/project.json", oldRoot, newRoot: proj.projectRoot, roles: Object.keys(proj.roles ?? {}), governanceModel: proj.governanceModel, acceptanceAccepted: proj.governanceBoundary?.acceptance?.accepted === true, pinCount: proj.governanceBoundary?.acceptance?.pin?.length ?? 0 };

// 4) verify preseeded roles in target (card + boundary files present)
out.targetRoles = {};
for (const roleId of roleDirs) {
  const dir = path.join(TARGET, "角色卡", roleId);
  const files = fs.readdirSync(dir).sort();
  out.targetRoles[roleId] = files.map((f) => {
    const buf = fs.readFileSync(path.join(dir, f));
    return { file: f, bytes: buf.length, sha256: sha256(buf) };
  });
}
// role card & boundary hash equality with source (acceptance pins still valid for boundary.yaml)
out.boundaryPinCheck = (proj.governanceBoundary?.acceptance?.pin ?? []).map((pin) => {
  const p = path.join(TARGET, pin.path);
  const actual = exists(p) ? sha256(fs.readFileSync(p)) : null;
  return { path: pin.path, pin: pin.sha256, actual, match: actual === pin.sha256 };
});
out.roleCardCheckAllMatch = Object.entries(out.sourceFiles).filter(([k]) => k.startsWith("角色卡/") && k !== "角色卡/governance-boundary.yaml").every(([rel, files]) => {
  const targetFiles = out.targetRoles[path.basename(rel)];
  return Array.isArray(files) && targetFiles && files.length === targetFiles.length && files.every((f, i) => f.file === targetFiles[i].file && f.sha256 === targetFiles[i].sha256);
});

// 5) ledger activation evidence summary (legacy-model appointment/appointment-write/acceptance)
const lines = fs.readFileSync(path.join(TARGET, ".ans/state/tasks.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const cardKinds = {};
const requestResolved = {};
const tasks = new Map();
for (const j of lines) {
  if (j.kind === "request.created") cardKinds[j.cardKind ?? "?"] = (cardKinds[j.cardKind ?? "?"] ?? 0) + 1;
  if (j.kind === "request.resolved") requestResolved[j.requestId] = j;
  if (j.taskId) {
    if (!tasks.has(j.taskId)) tasks.set(j.taskId, { created: null, delivered: false, reports: 0, closed: false });
    const t = tasks.get(j.taskId);
    if (j.kind === "task.created") t.created = j;
    if (j.kind === "task.delivered") t.delivered = true;
    if (j.kind === "task.reported") t.reports++;
    if (j.kind === "task.closed") t.closed = true;
  }
}
const openUndelivered = [...tasks.entries()].filter(([, t]) => t.created && !t.closed && !t.delivered).map(([id, t]) => ({ taskId: id, to: t.created.to, at: t.created.at }));
const openRequests = lines.filter((j) => j.kind === "request.created" && !requestResolved[j.requestId]).map((j) => j.requestId);
out.ledger = { rows: lines.length, cardKinds, openUndeliveredCount: openUndelivered.length, openRequestsCount: openRequests.length, openUndelivered, openRequests };
if (openUndelivered.length || openRequests.length) {
  out.abort = "source project has open tasks/requests; target copy would replay them";
  writeJson(path.join(PRE, "prepare-target.json"), out);
  console.error("ABORT", out.abort);
  process.exit(2);
}

writeJson(path.join(PRE, "prepare-target.json"), out);
console.log(JSON.stringify({ targetFileCount: out.copiedFileCount, roles: roleDirs, projectJsonRewrite: out.projectJsonRewrite, roleCardCheckAllMatch: out.roleCardCheckAllMatch, boundaryPinCheckAllMatch: out.boundaryPinCheck.every((p) => p.match), ledger: { rows: out.ledger.rows, cardKinds, openUndelivered: 0, openRequests: 0 } }, null, 2));
