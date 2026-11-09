// test/编排/git-action-authorization-wiring.test.ts
// W3b（2026-11-08「删除全部预知式门控」P1.4 §3.3.1/§3.4.3、§3.8、§4.4/§4.5、§6.1；B1 AC-1/AC-3、P1.2-AC-31；I0-1/I0-2）：
// 调用点 authorization 组合与 sidecar append 的确定性行为。
//
// 覆盖：
//  - init 成功路径：sidecar 出现在冻结路径，字段（actor/task/turn/leaseId/policyInputDigests 多键/
//    optionalEvidence/template/activeTool）正确，真实 init journal/仓库效果存在；
//  - 调用点顺序（closure → policy → current → append → execute）、R2 digest 映射与
//    不写 sidecar 的动作（git_query / prepareRunChange / finalizeRunChange / controller-stop）的源码结构守卫。
// 失败注入（AC-16）与同 operationId 重试（P1.2-AC-26）在独立进程文件中（Core 注册表是进程级的）。
//
// 说明（如实）：commit/integrate/revert、delivery、文档/计划/激活/initial workflow 发布共用同一组合函数
// （`appendGitActionAuthorizationBeforeEffects`，本文件以源码结构守卫覆盖其调用位置/映射），
// 跨角色完整效果链由 W5 集成测试与 B1 真实运行覆盖（证据 §覆盖边界）。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { test, after } from "node:test";

import { readGitActionAuthorizations, readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createInitFixture, w3bEntryOf } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring init: sidecar carries actor/task/turn/lease + init,candidate digests before effects", async () => {
  const fixture = await createInitFixture({ operationId: "w3b-init-success", opened });
  const entry = w3bEntryOf(fixture.convener.sessionId);
  const act = await fixture.runtime.gitCandidate(fixture.request);
  assert.equal(act.status, "prepared", JSON.stringify(act));
  const read = await readGitActionAuthorizations(fixture.root, fixture.request.operationId);
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.deepEqual(read.diagnostics, []);
  assert.equal(read.records.length, 1);
  const record = read.records[0]!;
  assert.equal(record.source, "git-action-authorization");
  assert.equal(record.version, 1);
  assert.equal(record.operationId, fixture.request.operationId);
  assert.equal(record.template, "init", "init 模板取真实 init 策略来源");
  assert.equal(record.actorRoleId, "convener");
  assert.equal(record.coreSessionId, fixture.convener.sessionId);
  assert.equal(record.taskId, fixture.taskId);
  assert.equal(record.runId, fixture.runId);
  assert.ok(record.turnId.length > 0 && record.turnId === entry?.lifecycle?.turnId, "turnId 为 gate 验证的真实回合");
  assert.equal(record.activeTool, "git_candidate", "activeTool 为真实活动工具名");
  assert.equal(record.projectRoot.toLowerCase(), fixture.canonical.toLowerCase(), "projectRoot 投影为 canonical 根");
  assert.match(record.rootsDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(record.policyInputDigests), ["init", "candidate"], "R2：init 两键");
  assert.match(record.policyInputDigests.init!, /^[a-f0-9]{64}$/);
  assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
  assert.notEqual(record.policyInputDigests.init, record.policyInputDigests.candidate);
  assert.ok(record.leaseId.length > 0 && record.leaseId.length <= 128, "leaseId 来自调用点持有的 mutation lease");
  assert.ok(!Object.hasOwn(record.optionalEvidence, "applicationMediation"), "PR #72：sidecar 不读/不写 applicationMediation");
  const journal = await readGitInitializationRecord(fixture.root, fixture.request.operationId);
  assert.ok(journal, "init.json 存在");
  assert.equal(journal.stage, "candidate-created");
  assert.equal(journal.operationId, fixture.request.operationId);
  assert.equal(await fs.stat(path.join(fixture.root, ".git")).then(() => true, () => false), true, "仓库已真实创建（效果在 append 之后执行）");
  fixture.held.release();
  await fixture.pumping;
});

// ———————————————— 调用点顺序 / 映射 / 不写 sidecar 的源码结构守卫 ————————————————

test("wiring guards: append sits after current gate and before effects with the frozen R2 digest mapping; run-change/stop paths never append", async () => {
  const source = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  const slice = (from: string, to: string): string => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start > 0 && end > start, `源码段可定位：${from} → ${to}`);
    return source.slice(start, end);
  };
  const commitGroup = slice('if (request.action === "commit" || request.action === "integrate" || request.action === "revert")', 'if (request.action !== "init")');
  const initGroup = slice('if (request.action !== "init")', "}, async gitPublish(");
  const delivery = slice("if (request.target !== \"delivery\")", "} };\n}");
  const business = slice("async function executeGitBusinessPublication", "export async function executeGitInitialWorkflowPublication");
  const workflow = slice("export async function executeGitInitialWorkflowPublication", "/** Acknowledges idempotent enqueue");
  const gitQuery = slice("return { async gitQuery(", "}, async gitCandidate(");

  // 顺序：第二次 gate / stale 复检之后，真实效果之前。
  assert.ok(commitGroup.indexOf("git-worker-protection-stale") < commitGroup.indexOf("appendGitActionAuthorizationBeforeEffects"), "commit：append 在 current/stale 之后");
  assert.ok(commitGroup.indexOf("appendGitActionAuthorizationBeforeEffects") < commitGroup.indexOf("executeWorkerCommit"), "commit：append 在 execute 之前");
  assert.ok(initGroup.indexOf("git-protection-basis-stale") < initGroup.indexOf("appendGitActionAuthorizationBeforeEffects"), "init：append 在 current/stale 之后");
  assert.ok(initGroup.indexOf("appendGitActionAuthorizationBeforeEffects") < initGroup.indexOf("executeInitialization"), "init：append 在 execute 之前");
  assert.ok(delivery.indexOf("git-delivery-protection-stale") < delivery.indexOf("appendGitActionAuthorizationBeforeEffects"), "delivery：append 在 current/stale 之后");
  assert.ok(delivery.indexOf("appendGitActionAuthorizationBeforeEffects") < delivery.indexOf("executeDelivery"), "delivery：append 在 execute 之前");
  assert.ok(business.indexOf("git-document-protection-stale") < business.indexOf("appendGitActionAuthorizationBeforeEffects"), "业务发布：append 在 current/stale 之后");
  assert.ok(business.indexOf("appendGitActionAuthorizationBeforeEffects") < business.indexOf("const commitAuthority"), "业务发布：append 在 commitPrepared* 之前");
  assert.ok(workflow.indexOf("initial-workflow-protection-stale") < workflow.indexOf("appendGitActionAuthorizationBeforeEffects"), "initial workflow：append 在 current/stale 之后");
  assert.ok(workflow.indexOf("appendGitActionAuthorizationBeforeEffects") < workflow.indexOf("service.commitPreparedInitialWorkflow(value"), "initial workflow：append 在 commit 之前");

  // R2 映射与模板/operationId 真实来源。
  assert.ok(commitGroup.includes("policyInputDigests: { candidate: verdict.inputDigest }"), "commit/integrate/revert ⇒ {candidate}");
  assert.ok(commitGroup.includes("template: value.policyInput.template"), "commit 模板取候选策略输入");
  assert.ok(commitGroup.includes('expectedTool: "git_candidate"'));
  assert.ok(initGroup.includes("policyInputDigests: { init: initPolicy.inputDigest, candidate: candidatePolicy.inputDigest }"), "init ⇒ {init,candidate}");
  assert.ok(initGroup.includes('template: "init"'));
  assert.ok(delivery.includes("policyInputDigests: { publication: verdict.inputDigest }"), "delivery ⇒ {publication}");
  assert.ok(delivery.includes('expectedTool: "git_publish"'));
  assert.ok(business.includes("policyInputDigests: { candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest }"), "文档/计划/激活 ⇒ {candidate,publication}");
  assert.ok(business.includes("template: authority.value.publicationPolicyInput.template"), "业务发布模板取发布策略输入");
  assert.ok(workflow.includes("policyInputDigests: { candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest }"), "initial workflow ⇒ {candidate,publication}");
  assert.ok(workflow.includes("template: authority.value.publicationPolicyInput.template"));
  assert.ok(workflow.includes("operationId: value.input.operationId"), "initial workflow 取准备阶段解析的真实 operationId");
  // append 失败 ⇒ 统一 git-action-audit-unavailable 且不执行（每个调用点都先返回）。
  for (const [name, segment] of [["commit", commitGroup], ["init", initGroup], ["delivery", delivery], ["business", business], ["workflow", workflow]] as const)
    assert.ok(segment.includes("if (!audit.ok) return fail(audit.code, audit.message)"), `${name}：append 失败 ⇒ fail-closed`);
  assert.equal((source.match(/appendGitActionAuthorizationBeforeEffects\(\{/g) ?? []).length, 5, "恰有 5 个结构化 mutation 调用点（commit 组/init/delivery/业务发布/initial workflow）");
  // 不写 sidecar 的路径：只读 query、run-change、finalize、controller-stop。
  assert.equal(gitQuery.includes("appendGitActionAuthorization"), false, "git_query 只读、本不经 gate，不写 sidecar");
  const prepareRunChange = slice("export async function prepareRunChange", "export async function finalizeRunChange");
  const finalizeRunChange = slice("export async function finalizeRunChange", "export interface ControllerStopHostPlan");
  const prepareControllerStop = slice("export async function prepareControllerStop", "export async function finalizeControllerStop");
  const finalizeControllerStop = slice("export async function finalizeControllerStop", "export async function readRunRoleContext");
  for (const [name, segment] of [["prepareRunChange", prepareRunChange], ["finalizeRunChange", finalizeRunChange],
    ["prepareControllerStop", prepareControllerStop], ["finalizeControllerStop", finalizeControllerStop]] as const)
    assert.equal(/appendGitActionAuthorization|authorization\.jsonl/.test(segment), false, `${name} 不写 sidecar`);
  // gate 输出不含 authorization（调用点组合，W2/I0-4 不变）。
  const gate = slice("export async function inspectGitActionAuthorization", "/**\n * W3b（2026-11-08");
  assert.equal(gate.includes("appendGitActionAuthorization"), false, "gate 不写 sidecar（调用点组合）");
  assert.equal(gate.includes("record.leaseId"), false, "gate 不组合 authorization 的 leaseId");
});
