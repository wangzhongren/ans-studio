// test/桌面应用/b3-release-merge-desktop.test.ts
// T3「两条固定工作流路径」B3（2026-11-10，桌面窗口）：**merge-main 应用自有通道**（AC-14/AC-22、T-10/T-11/T-15 桌面侧）。
//
// 覆盖：
//   · `buildMergeMainCardRequest`：app-owned 非判断卡（application:true + 冻结 approve/reject 选项词汇；
//     `governanceCardGroup("merge-main")===undefined`）；preview 必含 workflowId/flowId、main base OID、
//     branch tip OID、文件数、diff stat、合并方式、高风险提示与（路径 B）非 main 基线披露；
//   · `toMergeMainCardDecision`：客户本人 approve/reject；judge/directive 的 answered 不代批（unavailable）、
//     declined 的 judge 来源 ⇒ judge-reject；应用中止 ⇒ timeout；缺失 ⇒ unavailable；
//   · `SessionManager.runFixedReleaseMerge`（真实 Git 端口 + 预置账本/归档）：客户本人确认 ⇒ 本地合并 main
//     （工作区停在 main；`release.confirmed.by=customer`；`release.merged`；`workflow.closed delivered`）；
//     客户拒绝 ⇒ `release.rejected.by=customer`；judge 拒绝/超时 ⇒ `release.rejected.by=judge`（不合并）；
//     judge approve 尝试 ⇒ 不合并、不写 confirmed、保持等待；前置不满足 ⇒ `release-workflow-not-ready`
//     且**不呈卡**；无客户卡通道 ⇒ `release-card-unavailable`（不合并、不默认通过）；
//   · 不 push/tag（本地 refs 无 tag；无 remote）。
//
// 夹具：真实临时 Git 仓库 + 账本/归档夹具；假会话（不启动 Electron/真实模型）；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  buildMergeMainCardRequest,
  MERGE_MAIN_CARD_KIND,
  MERGE_MAIN_OPTION_IDS,
  toMergeMainCardDecision,
  isApplicationDecisionReservedForCustomer,
} from "../../app/desktop/customer-input.ts";
import { createDesktopBaselineGitPort } from "../../app/desktop/workflow-git.ts";
import {
  appendBasisEvent,
  appendReleaseEvent,
  appendWorkflowEvent,
  archiveAcceptance,
  readReleaseLedger,
  readWorkflowLedger,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { governanceCardGroup, type CustomerInputOutcome, type CustomerInputRequest } from "../../src/model/runtime.ts";
import type { BasisEvent, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const WF = "wf-b3rel00000000000000000001";
const AT = "2026-11-10T10:00:00.000Z";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: roleId === "chief" ? "chief" : roleId === "convener" ? "schedule" : undefined,
  });
  return {
    projectRoot: root,
    roles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"].map(builtIn),
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface ReleaseHarness {
  mgr: SessionManager;
  requests: CustomerInputRequest[];
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
  opened: number;
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome): ReleaseHarness {
  const requests: CustomerInputRequest[] = [];
  const state: ReleaseHarness = {
    mgr: undefined as unknown as SessionManager,
    requests,
    script,
    opened: 0,
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      state.opened += 1;
      const handle: RoleSessionHandle = {
        async send(_text: string, _options?: RoleSessionSendOptions) {},
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 20; tries += 1) {
                    if (i > 0) return { value: undefined as unknown as OrchestrationEvent, done: true };
                    i += 1;
                    await tick(5);
                  }
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      void input;
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    getVersionChangeStack: () => undefined,
    customerInput: async (request) => {
      requests.push(request as unknown as CustomerInputRequest);
      return state.script(request as unknown as CustomerInputRequest);
    },
    emitEvent: () => {},
  });
  state.mgr = mgr;
  return state;
}

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function initRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B3 Test");
  git(root, "config", "user.email", "b3@test.local");
  git(root, "config", "core.autocrlf", "false");
}
function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
async function appendEvents(root: string, events: readonly WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}
function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}

/** 合法推进到 A12b completed（A13 发布前置）。 */
async function seedReleaseWorkflow(root: string): Promise<void> {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId: WF, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as WorkflowStage[]) {
    events.push(requested(WF, stage), completed(WF, stage));
  }
  events.push(requested(WF, "A12b"), completed(WF, "A12b"));
  await appendEvents(root, events);
  const view = deriveWorkflowView((await readWorkflowLedger(root)).events, (await readTaskState(root)).events);
  assert.equal(view.stage, "A12b");
  assert.equal(view.stages.A12b.status, "completed");
}

interface ReleaseRepo {
  mainOid: string;
  tipOid: string;
  branch: string;
  gitignoreSha256: string;
  reportPath: string;
  reportSha: string;
}

async function seedReleaseRepo(root: string): Promise<ReleaseRepo> {
  initRepo(root);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3\n");
  const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  assert.equal(ensured.ok, true, ensured.ok === false ? ensured.message : "");
  if (!ensured.ok) throw new Error("gitignore");
  commitAll(root, "main base");
  const mainOid = git(root, "rev-parse", "HEAD");
  const branch = taskBranchName(WF);
  git(root, "switch", "-c", branch);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3-changed\n");
  await writeFile(root, "src/new.ts", "new\n");
  const tipOid = commitAll(root, "task change");
  // A12 归档（应用生成；criteria/report 为真实文件）
  const criteriaPath = "docs/quality/snake-criteria-v1.md";
  const reportPath = `docs/quality/${FLOW}-report-v1.md`;
  await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
  await writeFile(root, reportPath, "# Report\n\n结论：通过。\n");
  const archived = await archiveAcceptance({
    projectRoot: root, flowId: FLOW, workflowId: WF,
    criteriaPath, reportPath, conclusion: "通过", staffDecision: "轻量验收",
    now: () => new Date(AT),
  });
  assert.equal(archived.ok, true, archived.ok === false ? archived.message : "");
  // basis（repo 快照与真实仓库一致；documents 空——发布前置只看 repo/.gitignore 与归档）。
  const basis: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${WF}:seed`, basisId: `bas-${WF}`, workflowId: WF, flowId: FLOW,
    documents: [], teamPlan: null,
    repo: {
      state: "initialized", branch, baseOid: mainOid, headOid: mainOid, mainUnborn: false,
      initialBranch: "main", ignorePolicy: "ans-v1", gitignoreSha256: ensured.sha256,
    },
    reviewRoleId: "verifier", operationId: "op-basis-seed", reason: "baseline", recordedBy: "application",
  };
  const appended = await appendBasisEvent(root, basis);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  return { mainOid, tipOid, branch, gitignoreSha256: ensured.sha256, reportPath, reportSha: sha(await fs.readFile(path.join(root, ...reportPath.split("/")))) };
}

function customerApprove(): CustomerInputOutcome {
  return { outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] } };
}
function customerReject(): CustomerInputOutcome {
  return { outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[1]!] } };
}

test("merge-main 卡构造：app-owned 非判断（application + 冻结选项 + 不进 GROUP）；preview 必含字段", () => {
  assert.equal(governanceCardGroup("merge-main"), undefined, "merge-main 不进 GOVERNANCE_CARD_GROUP");
  const request = buildMergeMainCardRequest({
    workflowId: WF, flowId: FLOW, releaseId: "rel-x",
    mainBaseOid: "b".repeat(40), branchTipOid: "a".repeat(40),
    branchBaseOid: "c".repeat(40), nonMainBaseline: true,
    fileCount: 2, diffStat: "2 files changed, 3 insertions(+)", mergeKind: "merge",
    highRiskNotes: ["合并 main 属发布高风险动作；必须客户本人确认。", "只本地合并：不 push/tag。"],
  });
  assert.equal(request.kind, "choice");
  assert.equal(request.cardKind, MERGE_MAIN_CARD_KIND);
  assert.equal(request.application, true);
  assert.equal(request.flowId, FLOW);
  assert.deepEqual(request.options.map((option) => option.id), [...MERGE_MAIN_OPTION_IDS]);
  const preview = request.preview ?? "";
  for (const expected of [WF, FLOW, "b".repeat(40), "a".repeat(40), "c".repeat(40), "非 main 基线", "变更文件数：2", "2 files changed", "merge --no-ff", "高风险提示"]) {
    assert.match(preview, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(isApplicationDecisionReservedForCustomer(request), true, "merge-main 为客户主权卡（judge 不可代批）");
  // 非应用卡/缺冻结选项不命中（角色工具层无法伪造）。
  assert.equal(isApplicationDecisionReservedForCustomer({ ...request, application: undefined } as CustomerInputRequest), false);
  assert.equal(isApplicationDecisionReservedForCustomer({
    ...request, options: [{ id: MERGE_MAIN_OPTION_IDS[0]!, label: "only" }],
  } as CustomerInputRequest), false);
});

test("toMergeMainCardDecision：客户本人唯一有效；judge answered 不代批；judge declined ⇒ judge-reject；中止 ⇒ timeout", () => {
  assert.equal(toMergeMainCardDecision(customerApprove()).kind, "approve");
  assert.equal(toMergeMainCardDecision(customerReject()).kind, "reject");
  assert.equal(toMergeMainCardDecision(undefined).kind, "unavailable");
  const judgeAnswered: CustomerInputOutcome = {
    outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] }, operatorId: "judge:pi",
    judge: { engine: "pi", reasonCode: "approve", cardKind: "merge-main", group: "decision" } as never,
  };
  assert.equal(toMergeMainCardDecision(judgeAnswered).kind, "unavailable", "judge approve 尝试不得授权");
  assert.equal(toMergeMainCardDecision({ outcome: "declined", operatorId: "judge:pi", reason: "judge deny" }).kind, "judge-reject");
  assert.equal(toMergeMainCardDecision({ outcome: "declined", operatorId: "system:initiator-aborted", reason: "initiator-aborted" }).kind, "timeout");
  assert.equal(toMergeMainCardDecision({ outcome: "unavailable", reason: "expired" }).kind, "timeout");
  assert.equal(toMergeMainCardDecision({ outcome: "declined", reason: "客户取消" }).kind, "reject");
});

test("runFixedReleaseMerge：客户本人确认 ⇒ 本地合并 main（confirm/merged/closed）；不 push/tag", async () => {
  const root = await tempRoot("ans-b3rel-ok-");
  const h = harness(root, () => customerApprove());
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedReleaseWorkflow(root);
    const repo = await seedReleaseRepo(root);
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");

    const result = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-release-1", summary: "交付说明",
      evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.merged, true);
    assert.equal(h.requests.length, 1, "应呈一张 merge-main 卡");
    assert.equal(h.requests[0]!.cardKind, MERGE_MAIN_CARD_KIND);
    // 真实 Git：main 已含任务分支变更（tip 是 main 的祖先）；工作区停在 main；无 tag/remote（不 push/tag）。
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main");
    assert.doesNotThrow(() =>
      execFileSync("git", ["merge-base", "--is-ancestor", `refs/heads/${repo.branch}`, "refs/heads/main"], { cwd: root }));
    assert.equal(await fs.readFile(path.join(root, "src", "new.ts"), "utf8"), "new\n");
    assert.equal(git(root, "tag"), "");
    assert.equal(git(root, "remote"), "");
    // 账本：requested → confirmed(by customer) → merged；workflow.closed delivered。
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    const kinds = releases.map((event) => event.kind);
    assert.deepEqual(kinds, ["release.requested", "release.confirmed", "release.merged"]);
    const confirmed = releases.find((event) => event.kind === "release.confirmed");
    assert.ok(confirmed !== undefined && confirmed.kind === "release.confirmed" && confirmed.by === "customer");
    const merged = releases.find((event) => event.kind === "release.merged");
    assert.ok(merged !== undefined);
    if (merged !== undefined && merged.kind === "release.merged") {
      assert.equal(merged.tipOid.hex, repo.tipOid);
      assert.equal(merged.baseOid?.hex, repo.mainOid);
      assert.match(merged.mergeOid.hex, /^[a-f0-9]{40}$/);
    }
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      (await readTaskState(root)).events,
    );
    assert.equal(view.closed?.outcome, "delivered");
    assert.equal(view.releaseId !== undefined, true);
    // request.created/resolved 由应用按 merge-main 卡落账（客户本人）。
    const tasks = await readTaskState(root);
    const created = tasks.events.find((event) => event.kind === "request.created" && event.cardKind === MERGE_MAIN_CARD_KIND);
    assert.ok(created !== undefined && created.kind === "request.created" && created.sourceRoleId === "application");
    const resolved = tasks.events.find((event) => event.kind === "request.resolved" && event.cardKind === MERGE_MAIN_CARD_KIND);
    assert.ok(resolved !== undefined && resolved.kind === "request.resolved" && resolved.by === "customer");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("runFixedReleaseMerge：客户拒绝 ⇒ release.rejected.by=customer、不合并；judge 拒绝 ⇒ by=judge；judge approve 尝试不合并", async () => {
  // 客户拒绝
  {
    const root = await tempRoot("ans-b3rel-reject-");
    const h = harness(root, () => customerReject());
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedReleaseWorkflow(root);
      const repo = await seedReleaseRepo(root);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await h.mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-reject", summary: "交付",
        evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "release-rejected");
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
      const rejected = releases.find((event) => event.kind === "release.rejected");
      assert.ok(rejected !== undefined && rejected.kind === "release.rejected" && rejected.by === "customer");
      assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false);
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch, "拒绝不合并（仍在任务分支）");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // judge declined（转人工/拒绝）：release.rejected.by=judge
  {
    const root = await tempRoot("ans-b3rel-judge-");
    const h = harness(root, () => ({ outcome: "declined", operatorId: "judge:pi", reason: "judge 转人工" }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedReleaseWorkflow(root);
      const repo = await seedReleaseRepo(root);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await h.mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-judge", summary: "交付",
        evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
      });
      assert.equal(result.ok, false);
      const rejected = (await readReleaseLedger(root)).events.find((event) => event.workflowId === WF && event.kind === "release.rejected");
      assert.ok(rejected !== undefined && rejected.kind === "release.rejected" && rejected.by === "judge");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // judge approve 尝试（answered + judge 审计）：不合并、不写 confirmed/rejected、保持等待。
  {
    const root = await tempRoot("ans-b3rel-judge-approve-");
    const h = harness(root, () => ({
      outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] }, operatorId: "judge:pi",
      judge: { engine: "pi", reasonCode: "approve", cardKind: "merge-main", group: "decision" } as never,
    }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedReleaseWorkflow(root);
      const repo = await seedReleaseRepo(root);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await h.mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-judge-approve", summary: "交付",
        evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "release-unauthorized");
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
      assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false);
      assert.equal(releases.some((event) => event.kind === "release.rejected"), false, "judge approve 尝试不写任何终态");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("runFixedReleaseMerge：超时/中止 ⇒ release.rejected（by judge，非客户确认）；前置不满足不发卡；无通道不合并", async () => {
  // 中止（timeout 等价）
  {
    const root = await tempRoot("ans-b3rel-timeout-");
    const h = harness(root, () => ({ outcome: "declined", operatorId: "system:initiator-aborted", reason: "initiator-aborted" }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedReleaseWorkflow(root);
      const repo = await seedReleaseRepo(root);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await h.mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-timeout", summary: "交付",
        evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
      });
      assert.equal(result.code, "release-rejected");
      const rejected = (await readReleaseLedger(root)).events.find((event) => event.workflowId === WF && event.kind === "release.rejected");
      assert.ok(rejected !== undefined && rejected.kind === "release.rejected" && rejected.by === "judge");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 前置不满足（A12b 未完成/无归档）：release-workflow-not-ready，且不呈卡、不写 release.requested。
  {
    const root = await tempRoot("ans-b3rel-notready-");
    const h = harness(root, () => customerApprove());
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await appendWorkflowEvent(root, {
        ...BASE, kind: "workflow.started", workflowId: WF, flowId: FLOW,
        idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
      });
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await h.mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-notready", summary: "交付", evidence: [],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "release-workflow-not-ready");
      assert.equal(h.requests.length, 0, "前置不满足不得呈卡");
      assert.equal((await readReleaseLedger(root)).events.length, 0, "不写 release.requested");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 无客户卡通道：presentAppCard undefined ⇒ release-card-unavailable；不合并、不写 confirmed。
  {
    const root = await tempRoot("ans-b3rel-nochannel-");
    const requests: CustomerInputRequest[] = [];
    const mgr = new SessionManager({
      openRoleSession: async () => ({
        async send() {},
        events() {
          return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
        },
        async dispose() {},
      } as RoleSessionHandle),
      createPiAdapterFactory: () => { throw new Error("no pi"); },
      createDemoAdapter: () => { throw new Error("no demo"); },
      buildProjectConfig,
      getListing: (r) => (r === root ? listing(root) : undefined),
      emitEvent: () => {},
    });
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedReleaseWorkflow(root);
      const repo = await seedReleaseRepo(root);
      await mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const result = await mgr.runFixedReleaseMerge({
        projectRoot: root, workflowId: WF, operationId: "op-rel-nochannel", summary: "交付",
        evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "release-card-unavailable");
      assert.equal(requests.length, 0);
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
      assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false, "无通道不默认通过");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("runFixedReleaseMerge：已合并 tip ⇒ release-already-merged（no-op 成功，不重复合并）", async () => {
  const root = await tempRoot("ans-b3rel-already-");
  const h = harness(root, () => customerApprove());
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedReleaseWorkflow(root);
    const repo = await seedReleaseRepo(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const first = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-rel-first", summary: "交付",
      evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
    });
    assert.equal(first.ok, true, first.message);
    const second = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-rel-second", summary: "交付",
      evidence: [{ path: repo.reportPath, sha256: repo.reportSha }],
    });
    assert.equal(second.ok, false);
    assert.equal(second.code, "release-already-merged");
    const mergedCount = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF && event.kind === "release.merged").length;
    assert.equal(mergedCount, 1, "不重复合并/不重复记账");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("appendReleaseEvent 夹具：release 账本 schema/幂等（guard against silent format drift）", async () => {
  const root = await tempRoot("ans-b3rel-ledger-");
  try {
    const appended = await appendReleaseEvent(root, {
      v: 1, at: AT, schema: "ans-release/v1", kind: "release.requested",
      idempotencyKey: `release-requested:${WF}:${"a".repeat(40)}`,
      releaseId: "rel-seed", workflowId: WF, flowId: FLOW, operationId: "op",
      summary: "s", evidence: [], baseOid: null,
      tipOid: { objectFormat: "sha1", hex: "a".repeat(40) }, mergeKind: "initial",
    });
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    const replayed = await appendReleaseEvent(root, {
      v: 1, at: AT, schema: "ans-release/v1", kind: "release.requested",
      idempotencyKey: `release-requested:${WF}:${"a".repeat(40)}`,
      releaseId: "rel-seed", workflowId: WF, flowId: FLOW, operationId: "op",
      summary: "s", evidence: [], baseOid: null,
      tipOid: { objectFormat: "sha1", hex: "a".repeat(40) }, mergeKind: "initial",
    });
    assert.equal(replayed.ok, true);
    if (replayed.ok) assert.equal(replayed.replay, true);
    assert.equal((await readReleaseLedger(root)).events.length, 1);
  } finally {
    await cleanup(root);
  }
});
