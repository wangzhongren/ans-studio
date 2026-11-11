// test/桌面应用/workflow-git-port.test.ts
// T3「两条固定工作流路径」B1（2026-11-10，桌面窗口）：git init/.gitignore/merge-main **端口骨架**与
// merge-main 客户主权识别（AC-14/AC-27 Q1；G-IR MF-IR-8）。
//
// 覆盖：
//   · `createWorkflowGitPort()` 缺省实现全部 fail-closed（workflow-git-unavailable），零文件/零副作用；
//   · `mergeMainConfirmationError`：缺省/judge ⇒ `release-unauthorized`（客户本人唯一有效）；
//   · 注入部分实现：已提供的操作走实现，未提供的仍 fail-closed；
//   · customer-input：merge-main（app-owned）被识别为客户主权卡（不进判断/代选/指令）；
//     角色工具层无法伪造（无 application/选项词汇不命中）；`governanceCardGroup("merge-main")` 未定义。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createWorkflowGitPort,
  mergeMainConfirmationError,
  type MergeMainRequest,
} from "../../app/desktop/workflow-git.ts";
import {
  MERGE_MAIN_CARD_KIND,
  MERGE_MAIN_OPTION_IDS,
  isApplicationDecisionReservedForCustomer,
} from "../../app/desktop/customer-input.ts";
import { governanceCardGroup } from "../../src/model/runtime.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";

function mergeMainRequest(root: string, confirmation?: MergeMainRequest["confirmation"]): MergeMainRequest {
  return {
    projectRoot: root,
    workflowId: "wf-merge00000000000000000001",
    flowId: "snake",
    branch: "ans/task/wf-merge00000000000000000001",
    tipOid: "a".repeat(40),
    preview: {
      workflowId: "wf-merge00000000000000000001",
      flowId: "snake",
      mainBaseOid: "b".repeat(40),
      branchTipOid: "a".repeat(40),
      fileCount: 3,
      diffStat: "3 files changed, 10 insertions(+)",
      mergeKind: "merge",
      highRiskNotes: ["合并 main 属发布动作；不 push/tag"],
    },
    ...(confirmation !== undefined ? { confirmation } : {}),
  };
}

test("workflow-git 端口骨架：缺省实现全部 fail-closed（workflow-git-unavailable），零文件副作用", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-wf-git-"));
  try {
    const port = createWorkflowGitPort();
    const repo = await port.ensureRepository({ projectRoot: root });
    assert.equal(repo.ok, false);
    if (!repo.ok) assert.equal(repo.code, "workflow-git-unavailable");
    const ignore = await port.ensureGitignore({ projectRoot: root });
    assert.equal(ignore.ok, false);
    if (!ignore.ok) assert.equal(ignore.code, "workflow-git-unavailable");
    const branch = await port.prepareTaskBranch({ projectRoot: root, workflowId: "wf-1" });
    assert.equal(branch.ok, false);
    if (!branch.ok) assert.equal(branch.code, "workflow-git-unavailable");
    // 未确认 ⇒ 客户主权拒（先于「B1 未实现」）。
    const unconfirmed = await port.mergeMain(mergeMainRequest(root));
    assert.equal(unconfirmed.ok, false);
    if (!unconfirmed.ok) assert.equal(unconfirmed.code, "release-unauthorized");
    // 客户本人确认但 B1 无实现 ⇒ fail-closed 且不执行任何 git。
    const confirmed = await port.mergeMain(mergeMainRequest(root, { by: "customer", decisionId: "card-1" }));
    assert.equal(confirmed.ok, false);
    if (!confirmed.ok) assert.equal(confirmed.code, "workflow-git-unavailable");
    // 零副作用：项目根未被创建任何文件/目录。
    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("mergeMainConfirmationError：客户本人唯一有效；缺省/judge ⇒ release-unauthorized（judge 不可代批）", () => {
  assert.equal(mergeMainConfirmationError(undefined)?.code, "release-unauthorized");
  assert.equal(mergeMainConfirmationError({ by: "judge", decisionId: "judge-1" })?.code, "release-unauthorized");
  assert.equal(mergeMainConfirmationError({ by: "customer", decisionId: "card-1" }), undefined);
});

test("workflow-git 端口：注入实现生效；未提供的操作仍 fail-closed（不回落 shell/默认 git）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-wf-git-impl-"));
  try {
    const port = createWorkflowGitPort({
      ensureRepository: async () => ({ ok: true, state: "existing", branch: "main" }),
    });
    const repo = await port.ensureRepository({ projectRoot: root });
    assert.equal(repo.ok, true);
    if (repo.ok) assert.equal(repo.state, "existing");
    const branch = await port.prepareTaskBranch({ projectRoot: root, workflowId: "wf-1" });
    assert.equal(branch.ok, false, "未提供的操作保持 fail-closed");
    const merged = await port.mergeMain(mergeMainRequest(root, { by: "customer" }));
    assert.equal(merged.ok, false);
    if (!merged.ok) assert.equal(merged.code, "workflow-git-unavailable");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

function mergeMainCard(overrides: Record<string, unknown> = {}): CustomerInputRequest {
  return {
    kind: "choice",
    title: "合并 main（高风险）",
    cardKind: MERGE_MAIN_CARD_KIND,
    application: true,
    options: MERGE_MAIN_OPTION_IDS.map((id) => ({ id, label: id })),
    ...overrides,
  } as unknown as CustomerInputRequest;
}

test("merge-main 客户主权：app-owned 卡命中保留面；非应用/缺选项不命中；不进判断分组", () => {
  assert.equal(governanceCardGroup("merge-main"), undefined, "merge-main 不进 GOVERNANCE_CARD_GROUP");
  assert.equal(isApplicationDecisionReservedForCustomer(mergeMainCard()), true);
  assert.equal(isApplicationDecisionReservedForCustomer(mergeMainCard({ application: false })), false, "角色工具层无法伪造应用卡");
  assert.equal(isApplicationDecisionReservedForCustomer(mergeMainCard({ application: undefined })), false);
  assert.equal(
    isApplicationDecisionReservedForCustomer(mergeMainCard({ options: [{ id: "approve-merge-main", label: "同意" }] })),
    false,
    "缺少冻结 reject 选项词汇不命中（防误伤/伪造）",
  );
  assert.equal(isApplicationDecisionReservedForCustomer(mergeMainCard({ kind: "confirm" })), false, "只识别 choice 卡");
  // stable-write 等既有客户主权卡行为不变。
  assert.equal(isApplicationDecisionReservedForCustomer({
    kind: "choice", title: "stable", cardKind: "stable-write", application: true,
    options: [{ id: "approve-stable-write", label: "同意" }, { id: "reject-stable-write", label: "拒绝" }],
  } as unknown as CustomerInputRequest), true);
});
