// test/测试/git-action-commit-claude-e2e.test.ts
// W7（B2 v1 补证，AC-1）：受保护项目 + Claude product/worker 角色 + 本任务写集内
// `git_candidate commit` 的**完整效果链**：
//   真实 Core 回合成交来源（active git_candidate）→ `createGitRoleRuntime.gitCandidate` →
//   角色 ACL/任务绑定 → `checkGitPolicy` → 两阶段 `inspectGitActionAuthorization` 复检 →
//   host `git-mutation` lease → write-ahead sidecar `authorization.jsonl`（`{candidate}` digest 来自
//   `checkGitPolicy().inputDigest`）→ 真实 candidate journal / 对象 / ref 创建；工作树/索引按既有语义不变。
// 断言的 sidecar/journal/ref/对象全部读取临时项目根内的真实文件；不伪造 journal/ref/sidecar。
//
// 依据：B1 v1 AC-1（§2.1）；设计 P1.4 §3.3.1/§3.4.3/§3.5/§6.1；I0-1/I0-2/I0-4；B2 v1 §4 关闭条件 1。
import assert from "node:assert/strict";
import { test, after } from "node:test";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { createGitRoleRuntime, recordGitHostInventory } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitCandidateStore, createGitRefStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGitCapabilityService } from "../../src/service/trunk/public/trunk-service.ts";
import { checkGitPolicy } from "../../src/service/gate/shell-rules.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { buildWriteChain, createExecutionAssignment, exportEvidence, recordGitHostInventoryForFixture, type BoundSession } from "./git-write-chain-fixture.ts";
import { disposeOpenedSessions, entryOf, gitCandidateScript, holdableGitCandidate, sha256, sidecarPath, until } from "./git-action-cross-runtime-fixture.ts";

after(async () => { await disposeOpenedSessions(); });

const RETIRED_CODES = ["git-core-creation-proof-unavailable", "git-native-surface-unproven", "git-unclosed-effect-registered",
  "official-pure-preparation-unproven", "native-factory-plan-unavailable"];

test("AC-1：Claude product 角色在受保护项目内完成 git_candidate commit 完整链（sidecar {candidate}/journal/ref/对象，无 native 前提、旧注册表级码零命中）", async () => {
  const held = holdableGitCandidate();
  const operationId = "w7-claude-commit";
  const chain = await buildWriteChain({
    prefix: "ans-w7-commit-claude-",
    activationMode: "service",
    extras: [{ key: "worker", runtime: "claude", roleId: "impl", options: {
      gitCandidate: held.gitCandidate,
      providerFactories: { claude: options => createDemoRuntimeAdapter(options, gitCandidateScript(operationId)) },
    } }],
  });
  const worker = chain.sessions.worker as BoundSession;
  let pumping: Promise<void> | undefined;
  try {
    // 真实执行派发（控制任务 + parentTaskRef + execution dispatch + 模块任务）。
    const assignment = await createExecutionAssignment(chain, { controllerTaskId: "w7-claude-exec-task", workerTaskId: "w7-claude-worker-task" });
    // 工作树内真实内容（提交对象断言的真实来源）。
    await fsp.mkdir(path.join(chain.root, "src/impl"), { recursive: true });
    const content = "export const result = 'W7 claude worker';\n";
    await fsp.writeFile(path.join(chain.root, "src/impl/result.txt"), content);

    pumping = worker.prompt("Invoke git_candidate commit for the W7 AC-1 fixture");
    pumping.catch(() => undefined);
    await until(() => entryOf(worker.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    const actorTurnId = entryOf(worker.sessionId)?.lifecycle?.turnId;
    assert.ok(actorTurnId, "真实 Core 回合 turnId 必须可读");

    // 真实 host inventory（desktop 边界；actor 行含真实 taskId/runId）。
    assert.ok(recordGitHostInventory({ source: "desktop-session-manager", projectRoot: chain.root, observedAt: "2026-11-08T00:00:00.000Z", revision: 1,
      sessions: [
        { hostHandleId: "host-chief", roleId: "chief", runtime: "demo", phase: "live", coreSessionId: chain.sessions.chief!.sessionId, errors: [] },
        { hostHandleId: "host-worker", roleId: "impl", runtime: "claude", phase: "live", coreSessionId: worker.sessionId,
          taskId: "w7-claude-worker-task", runId: chain.execRunId, errors: [] },
        { hostHandleId: "host-workflow-convener", roleId: "convener", runtime: "demo", phase: "live",
          coreSessionId: chain.sessions.workflowConvener!.sessionId, taskId: chain.planTaskId, runId: chain.docsRunId, errors: [] },
      ],
      pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] }).ok);

    const run = chain.pin.run as { codeBasis?: { ref: string; oid?: { objectFormat: "sha1" | "sha256"; hex: string } } };
    assert.ok(run.codeBasis?.oid, "pin 必须携带真实不可变 code basis");
    if (!run.codeBasis?.oid) return;
    const base = run.codeBasis as { ref: string; oid: { objectFormat: "sha1" | "sha256"; hex: string } };
    const request = { operationId, action: "commit" as const, base, paths: ["src/impl/result.txt"], message: "W7 AC-1 actual worker result" };

    const runtime = createGitRoleRuntime({ projectRoot: chain.root, context: { actorRoleId: "impl", taskId: "w7-claude-worker-task", runId: chain.execRunId, readPaths: ["."] } });
    const result = await runtime.gitCandidate(request);
    assert.equal(result.status, "prepared", JSON.stringify(result));
    assert.ok(result.candidate && result.tree, "真实 candidate/tree 必须产生");
    if (!result.candidate) return;

    // —— sidecar：真实 write-ahead 授权行（actor/task/turn/activeTool/leaseId/policyInputDigests.candidate）——
    const sidecarFile = sidecarPath(chain.root, operationId);
    const sidecarRead = await readGitActionAuthorizations(chain.root, operationId);
    assert.equal(sidecarRead.ok, true, JSON.stringify(sidecarRead));
    if (!sidecarRead.ok) return;
    assert.equal(sidecarRead.records.length, 1, "一次真实动作恰一行授权记录");
    const record = sidecarRead.records[0]!;
    assert.equal(record.source, "git-action-authorization");
    assert.equal(record.version, 1);
    assert.equal(record.operationId, operationId);
    assert.equal(record.template, "commit", "commit 模板取候选策略输入的真实来源");
    assert.equal(record.actorRoleId, "impl");
    assert.equal(record.coreSessionId, worker.sessionId);
    assert.equal(record.taskId, "w7-claude-worker-task");
    assert.equal(record.runId, chain.execRunId);
    assert.equal(record.turnId, actorTurnId, "turnId 为真实 gate 验证回合");
    assert.equal(record.activeTool, "git_candidate", "activeTool 为该 Core 条目的真实活动工具名");
    assert.equal(record.projectRoot, chain.canonical);
    assert.match(record.rootsDigest, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(record.registryRevision));
    assert.ok(record.inventoryRevision !== undefined);
    assert.ok(record.leaseId.length > 0, "leaseId 来自真实 git-mutation lease");
    assert.deepEqual(Object.keys(record.policyInputDigests), ["candidate"], "commit 只有一个 candidate digest（R2）");
    assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
    assert.equal("applicationMediation" in (record.optionalEvidence ?? {}), false, "sidecar 不读 applicationMediation（PR #72）");
    // digest 来源：调用点 `checkGitPolicy().inputDigest` —— 独立重算同一 Service 准备并比较。
    const probe = await createGitCapabilityService({ projectRoot: chain.root, context: { actorRoleId: "impl", taskId: "w7-claude-worker-task", runId: chain.execRunId, readPaths: ["."] } }).prepareWorkerCommit(request);
    assert.ok(probe.ok, JSON.stringify(probe));
    if (!probe.ok) return;
    const probeVerdict = checkGitPolicy(probe.value.policyInput);
    assert.equal(probeVerdict.allowed, true, JSON.stringify(probeVerdict));
    assert.equal(record.policyInputDigests.candidate, probeVerdict.inputDigest, "sidecar digest 必须等于调用点 checkGitPolicy().inputDigest 的来源值");

    // —— journal / ref / 对象：真实产生的 candidate journal 与 ref ——
    const journal = await createGitRefStore(chain.root).readJournal(operationId);
    assert.ok(journal, "真实 git.json candidate journal 必须存在");
    if (!journal) return;
    assert.equal(journal.phase, "published");
    assert.equal(journal.ref, `refs/ans/candidates/${sha256(operationId)}`);
    assert.deepEqual(journal.newOid, result.candidate);
    assert.equal(journal.candidateSource?.kind, "assigned-run-task");
    assert.equal(journal.candidateSource?.taskId, "w7-claude-worker-task");
    assert.equal(journal.candidateSource?.runId, chain.execRunId);
    assert.equal(journal.candidateSource?.moduleId, "impl-core");
    assert.equal(journal.candidateSource?.pinDigest, chain.pin.pinDigest);
    const objects = createGitCandidateStore(chain.root);
    assert.deepEqual(await objects.readRef(journal.ref), result.candidate, "candidate ref 必须指向真实对象");
    const blob = await objects.readBlob(result.candidate, "src/impl/result.txt");
    assert.equal(Buffer.from(blob.bytesBase64, "base64").toString("utf8"), content, "对象内容来自真实工作树字节");
    const commit = await objects.readCommit(result.candidate);
    assert.deepEqual(commit.parents, [base.oid], "candidate 以真实 pin code basis 为唯一 parent");

    // —— 工作树/索引既有语义：worker candidate 不发布 trunk，不动工作树/索引 ——
    assert.deepEqual(await objects.readRef("refs/ans/trunk"), base.oid, "worker candidate 不移动文档 trunk 指针");
    assert.equal(await fsp.readFile(path.join(chain.root, "src/impl/result.txt"), "utf8"), content, "工作树文件保持提交来源字节");
    const status = await objects.listTree(base.oid);
    assert.equal(status.some(entry => entry.path === "src/impl/result.txt"), false, "既有 trunk 树未被候选污染");

    // —— 无 native 前提 / 旧注册表级码零命中 ——
    assert.equal(entryOf(worker.sessionId)?.lifecycle?.native, undefined, "Claude 桩件回合无 native facts（可选证据）仍完成动作");
    const receiptText = JSON.stringify(result);
    for (const code of RETIRED_CODES) assert.equal(receiptText.includes(code), false, `旧/退役码不得出现：${code}`);

    // —— sidecar 先于效果（write-ahead）的真实时间顺序 + 真实路径 ——
    const sidecarStat = await fsp.stat(sidecarFile);
    const journalFile = path.join(chain.root, ".ans/trunk/operations", sha256(operationId), "git.json");
    const journalStat = await fsp.stat(journalFile);
    assert.ok(sidecarStat.mtimeMs <= journalStat.mtimeMs, "authorization.jsonl 必须先于 git.json 效果写入（write-ahead）");

    await exportEvidence("ac1-claude-commit.json", {
      operationId, sidecar: { path: sidecarFile, records: sidecarRead.records }, result,
      journal, journalPath: journalFile, candidateRef: await objects.readRef(journal.ref),
      base, expectedDigestSource: probeVerdict.inputDigest,
    });
  } finally {
    held.release();
    if (pumping) await pumping.catch(() => undefined);
  }
});
