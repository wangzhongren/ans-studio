// RR3 (authorized third round) prepare: copy jinyong-rogue-2d into an isolated fresh target, RESET the
// legacy runtime ledger `.ans/state/tasks.jsonl` to an empty file (original ledger preserved as read-only
// source evidence with hash), skip old runtime sessions, update .ans/project.json projectRoot.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3";
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

const out = { at: new Date().toISOString(), round: "RR3", source: SOURCE, target: TARGET, skipped: [".ans/sessions"] };
const copied = copyTree(SOURCE, TARGET);
out.copiedFileCount = copied.length;
fs.writeFileSync(path.join(PRE, "target-copy-files.sha256"), copied.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");

// preserve original legacy ledger as read-only source evidence
const ledgerPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const originalLedger = fs.readFileSync(ledgerPath);
fs.writeFileSync(path.join(PRE, "tasks-source-ledger.jsonl"), originalLedger);
out.sourceLedger = { path: ".ans/state/tasks.jsonl", bytes: originalLedger.length, sha256: sha256(originalLedger), rows: originalLedger.toString("utf8").split(/\r?\n/).filter(Boolean).length };

// RESET runtime ledger to empty (disclosed preparation; no task history in the working copy)
fs.writeFileSync(ledgerPath, "");
out.ledgerReset = { path: ".ans/state/tasks.jsonl", afterBytes: 0, afterSha256: sha256(Buffer.from("")), reason: "legacy ledger contains 10 task.created rows whose moduleDirectory (file paths without trailing /) are invalid under current validateTaskStateEvent; delivery assignment validates all ledger rows and would fail closed. Original ledger preserved at pre/tasks-source-ledger.jsonl with hash." };

const projPath = path.join(TARGET, ".ans/project.json");
const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
const oldRoot = proj.projectRoot;
proj.projectRoot = TARGET.replace(/\\/g, "/");
fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + "\n");
out.projectJsonRewrite = { oldRoot, newRoot: proj.projectRoot, roles: Object.keys(proj.roles ?? {}), governanceModel: proj.governanceModel, pinCount: proj.governanceBoundary?.acceptance?.pin?.length ?? 0 };

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
out.roster = { path: "docs/proposals/jinyong-rogue-2d-roster-v11.md", bytes: fs.statSync(rosterPath).size, sha256: sha256(fs.readFileSync(rosterPath)), roleIds: [...rosterText.matchAll(/^  - id: "([a-z0-9-]+)"/gm)].map((m) => m[1]) };

// post-reset sanity: ledger is empty and valid; no runs/doc-freezes/sessions
out.runtimeState = {
  ledgerBytes: fs.statSync(ledgerPath).size,
  hasRuns: fs.existsSync(path.join(TARGET, ".ans/runs")),
  hasDocFreezes: fs.existsSync(path.join(TARGET, ".ans/state/doc-freezes.json")),
  hasSessions: fs.existsSync(path.join(TARGET, ".ans/sessions")),
  hasTrunkManifest: fs.existsSync(path.join(TARGET, ".ans/trunk/manifest.json")),
  hasRoleEvidence: fs.existsSync(path.join(TARGET, ".ans/role-evidence")),
};
writeJson(path.join(PRE, "prepare-target.json"), out);
console.log(JSON.stringify({ targetFileCount: out.copiedFileCount, roles: Object.keys(out.roles), pinsAllMatch: out.boundaryPinCheck.every((p) => p.match), sourceLedger: out.sourceLedger, ledgerReset: out.ledgerReset, roster: out.roster, runtimeState: out.runtimeState }, null, 2));
