// Diagnostic probe for "Git final spawn fence" two-path fail-closed classification.
// Delays the fs.watch callback to emulate macOS FSEvents delivery latency seen in R6 CI x64.
import * as fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import os from "node:os";

const base = "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/misc2/src/provider/trunk/public/trunk-store.ts";
const { initializeGitRepository, createGitCandidateStore, beginGitHostAction, endGitHostAction, recordGitHostInterruption } = await import(base);

async function run(delayMs) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ans-spawn-probe-")));
  await initializeGitRepository(root);
  const objects = createGitCandidateStore(root), dir = path.join(root, ".git/ans/processes");
  await fs.mkdir(dir, { recursive: true });
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  let observed = false;
  const watcher = watch(dir, () => {
    observed = true;
    watcher.close();
    if (delayMs === 0) recordGitHostInterruption({ projectRoot: root, reason: "actual-pending-record-interruption" });
    else setTimeout(() => recordGitHostInterruption({ projectRoot: root, reason: "actual-pending-record-interruption" }), delayMs);
  });
  const input = { operationId: "actual-before-spawn-cancel", base: null, timestamp: "2026-11-05T00:00:00.000Z", message: "Real pending write", files: [{ path: "src/impl/result.txt", bytesBase64: Buffer.from("real result\n").toString("base64") }] };
  let error = "";
  try { const facts = await objects.prepare(input, undefined, lease.leaseId); error = `NO-ERROR tree=${facts.tree}`; }
  catch (e) { error = String(e && e.message ? e.message : e); }
  finally { watcher.close(); endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
  await new Promise((r) => setTimeout(r, 300)); // let delayed interruption land
  const names = await fs.readdir(dir);
  const records = [];
  for (const name of names) records.push(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
  console.log(JSON.stringify({ delayMs, observed, error, files: names.length,
    launches: records.map((r) => ({ launch: r.launch, pid: r.pid, exitCode: r.exitCode, termination: r.termination, operationId: r.operationId })) }, null, 1));
}

await run(0);
await run(100);
