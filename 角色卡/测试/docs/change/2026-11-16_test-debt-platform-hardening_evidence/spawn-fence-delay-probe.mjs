// Git final spawn fence 两路 fail-closed 诊断探针（2026-11-16 平台加固证据）。
// 通过延迟 `recordGitHostInterruption`（模拟 macOS FSEvents 投递延迟）观察 prepare 的两种拒绝路径：
//  - 路 A：中断在首个 spawn 边界前被观察 ⇒ `git-command-failed:null:unknown` + 1 条 cancelled-before-spawn；
//  - 路 B：中断在内部 plumbing 已启动后被观察 ⇒ `git-host-lease-invalid-before-command`，
//          已启动记录全部 started/exited-0，ref 未发布，update-ref 从不启动。
// 只读诊断，不入产品；在 plat 工作树内运行：node <本文件>
import * as fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import os from "node:os";

const moduleUrl = new URL("../../../../../src/provider/trunk/public/trunk-store.ts", import.meta.url).href;
const { initializeGitRepository, createGitCandidateStore, beginGitHostAction, endGitHostAction, recordGitHostInterruption } = await import(moduleUrl);
const { createHash } = await import("node:crypto");

const MUTATING = ["init", "hash-object", "mktree", "commit-tree", "update-ref"];
const verbOf = (fact) => Array.isArray(fact.argv) ? fact.argv.find(arg => MUTATING.includes(arg)) : undefined;

async function run(delayMs) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ans-spawn-probe-")));
  await initializeGitRepository(root);
  const objects = createGitCandidateStore(root), dir = path.join(root, ".git/ans/processes");
  await fs.mkdir(dir, { recursive: true });
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  let observed = false;
  // 模拟 FSEvents 延迟：事件到达时同步关闭 watcher，仅延迟中断观察本身（与真实用例单次投递一致）。
  const watcher = watch(dir, () => {
    observed = true;
    watcher.close();
    setTimeout(() => recordGitHostInterruption({ projectRoot: root, reason: "actual-pending-record-interruption" }), delayMs);
  });
  const input = { operationId: "actual-before-spawn-cancel", base: null, timestamp: "2026-11-05T00:00:00.000Z", message: "Real pending write", files: [{ path: "src/impl/result.txt", bytesBase64: Buffer.from("real result\n").toString("base64") }] };
  let error = "";
  try { const facts = await objects.prepare(input, undefined, lease.leaseId); error = `NO-ERROR tree=${JSON.stringify(facts.tree)}`; }
  catch (caught) { error = String(caught && caught.message ? caught.message : caught); }
  finally { watcher.close(); endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
  await new Promise(resolve => setTimeout(resolve, delayMs + 100));
  const records = [];
  for (const name of (await fs.readdir(dir)).sort()) {
    const fact = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
    records.push({ launch: fact.launch, termination: fact.termination, exitCode: fact.exitCode, pid: fact.pid, verb: verbOf(fact) });
  }
  const ref = `refs/ans/candidates/${createHash("sha256").update(input.operationId).digest("hex")}`;
  const published = await objects.readRef(ref);
  console.log(JSON.stringify({ delayMs, observed, error, candidateRefPublished: published !== null,
    updateRefLaunched: records.some(record => record.verb === "update-ref"), records }, null, 1));
}

for (const delay of [0, 20, 40, 80, 100, 120, 200]) await run(delay);
