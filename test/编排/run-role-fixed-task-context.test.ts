// test/编排/run-role-fixed-task-context.test.ts
// T3「两条固定工作流路径」B10.2（2026-11-11）：fixed 任务会话 run-role 上下文（编排）。
//
// B10.1 披露的写集外依赖：fixed review/verifier 任务（`task.created.workflowId` 存在、无 runId）
// 带真实 `taskId` 打开会话时，run-role 仍走 legacy trunk `inspectAssignedTask`（要求 runId）⇒
// 抛 `review-task-assignment-unavailable`，A12a/A12b 无法打开。本文件钉住修复口径：
//  - fixed 任务（账本 workflowId 存在）改读 fixed 任务账本事实（workflowService.inspectAssignedTask；
//    不要求 runId、不写 trunk/run）：校验 taskId 存在 / to=角色 / open / workflowId-flowId-stage，
//    并构造会话 assignment 上下文（系统提示纯事实段）；
//  - fixed verifier A12a/A12b、convener stage-request、product 生产任务带真实 taskId 均可打开；
//  - legacy 任务（无 workflowId）仍走原 trunk 路径，`review-task-assignment-unavailable` 逐字保留；
//  - 无 taskId 的聊天不构造 fixed assignment 上下文；fail-closed 不放宽（错误角色/已收口拒绝）。
//
// 只做 run-role 公开入口行为（假适配器/假会话；不启动真实模型、不占用端口、不写仓位账本之外的仓库文件）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, TaskSideEffect, WriteGate } from "../../src/model/runtime.ts";

const FLOW = "snake";
const WF = "wf-b102-fixture-0001";
const FIXED_TASK_CONTEXT_MARKER = "固定任务上下文";

interface Captured {
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (_gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

function projectOf(root: string, roleId: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [roleId],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:b102-fixed-task-context" },
    },
  };
}

async function openWithTask(options: {
  root: string;
  roleId: string;
  taskId?: string;
  workflowMode?: "fixed" | "legacy";
}): Promise<{ handle: Awaited<ReturnType<typeof openRoleSession>>; caps?: AdapterCapabilities }> {
  const captured: Captured = {};
  const handle = await openRoleSession(
    {
      roleId: options.roleId,
      project: projectOf(options.root, options.roleId),
      runtime: "pi",
      ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
      ...(options.workflowMode !== undefined ? { workflowMode: options.workflowMode } : {}),
    },
    { createAdapter: capturingFactory(captured) },
  );
  return { handle, caps: captured.caps };
}

function contextTextOf(caps: AdapterCapabilities | undefined): string {
  assert.ok(caps !== undefined, "适配器能力面应存在");
  return (caps!.contextSections ?? []).join("\n");
}

function assertAssignmentFacts(context: string, expected: {
  taskId: string;
  from: string;
  to: string;
  stage: string;
  taskKind?: string;
}): void {
  assert.match(context, new RegExp(FIXED_TASK_CONTEXT_MARKER), "fixed 任务 assignment 上下文段应注入");
  assert.ok(context.includes(`"taskId":"${expected.taskId}"`), "assignment 事实包含真实 taskId");
  assert.ok(context.includes(`"from":"${expected.from}"`), "assignment 事实包含真实创建者");
  assert.ok(context.includes(`"to":"${expected.to}"`), "assignment 事实包含真实受派人");
  assert.ok(context.includes(`"workflowId":"${WF}"`), "assignment 事实包含 workflowId");
  assert.ok(context.includes(`"flowId":"${FLOW}"`), "assignment 事实包含 flowId");
  assert.ok(context.includes(`"stage":"${expected.stage}"`), "assignment 事实包含 stage");
  assert.ok(context.includes("\"open\":true"), "assignment 事实为 open");
  if (expected.taskKind !== undefined) {
    assert.ok(context.includes(`"taskKind":"${expected.taskKind}"`), "assignment 事实包含 taskKind");
  }
}

async function seedFixedTask(root: string, input: {
  taskId: string;
  from: "chief" | "convener";
  to: string;
  stage: "A11" | "A12a" | "A12b";
  sideEffect?: TaskSideEffect;
  taskKind?: "stage-request";
  text?: string;
}): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.created", {
    taskId: input.taskId,
    from: input.from,
    to: input.to,
    text: input.text ?? `B10.2 fixed 任务 ${input.taskId}`,
    sideEffect: input.sideEffect ?? "read-only",
    idempotencyKey: `b102:${input.taskId}`,
    flowId: FLOW,
    workflowId: WF,
    stage: input.stage,
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
  }));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function seedLegacyTask(root: string, taskId: string): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.created", {
    taskId,
    from: "chief",
    to: "verifier",
    text: `B10.2 legacy 任务 ${taskId}`,
    sideEffect: "read-only",
    idempotencyKey: `b102-legacy:${taskId}`,
    flowId: "legacy-snake",
    runId: "run-legacy-1",
    runState: "draft",
  }));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ans-b102-runrole-"));
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 });
}

for (const stage of ["A12a", "A12b"] as const) {
  test(`fixed verifier ${stage}：带真实 taskId（无 runId）可打开，不抛 review-task-assignment-unavailable，注入 assignment 事实`, async () => {
    const root = tempRoot();
    try {
      const taskId = `t-b102-verifier-${stage.toLowerCase()}`;
      await seedFixedTask(root, { taskId, from: "chief", to: "verifier", stage, text: `${stage} 独立验收` });
      const { handle, caps } = await openWithTask({ root, roleId: "verifier", taskId, workflowMode: "fixed" });
      try {
        assert.ok(handle !== undefined, "fixed verifier 会话应正常打开");
        const context = contextTextOf(caps);
        assertAssignmentFacts(context, { taskId, from: "chief", to: "verifier", stage });
        // fixed 验收角色模块段照常注入（打开/注入均正常，非静默降级）。
        assert.match(context, /固定路径验收角色/, "fixed verifier 模块 context 段应注入");
      } finally {
        await handle.dispose();
      }
    } finally {
      cleanup(root);
    }
  });
}

test("fixed convener stage-request：带真实 taskId 可打开，assignment 事实含 taskKind=stage-request", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-stage-request";
    await seedFixedTask(root, {
      taskId, from: "chief", to: "convener", stage: "A11", sideEffect: "read-only", taskKind: "stage-request",
      text: "A11 实现派发：implementer",
    });
    const { handle, caps } = await openWithTask({ root, roleId: "convener", taskId, workflowMode: "fixed" });
    try {
      const context = contextTextOf(caps);
      assertAssignmentFacts(context, { taskId, from: "chief", to: "convener", stage: "A11", taskKind: "stage-request" });
      assert.match(context, /固定路径运营/, "fixed convener 模块 context 段应注入");
    } finally {
      await handle.dispose();
    }
  } finally {
    cleanup(root);
  }
});

test("fixed product 生产任务：带真实 taskId 可打开，assignment 事实含 convener→product/A11", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-product-production";
    await seedFixedTask(root, {
      taskId, from: "convener", to: "product", stage: "A11", sideEffect: "code", text: "A11 产品实现",
    });
    const { handle, caps } = await openWithTask({ root, roleId: "product", taskId, workflowMode: "fixed" });
    try {
      assertAssignmentFacts(contextTextOf(caps), { taskId, from: "convener", to: "product", stage: "A11" });
    } finally {
      await handle.dispose();
    }
  } finally {
    cleanup(root);
  }
});

test("fixed 任务按账本事实判定：未传 workflowMode（会话默认 legacy）仍走 fixed 任务分支、不抛 legacy 错误", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-no-mode";
    await seedFixedTask(root, { taskId, from: "chief", to: "verifier", stage: "A12a" });
    const { handle, caps } = await openWithTask({ root, roleId: "verifier", taskId });
    try {
      // 任务本身是 fixed（workflowId 存在）⇒ 即使调用方未给会话模式也不得走 legacy trunk 检查。
      assert.ok(handle !== undefined);
      assertAssignmentFacts(contextTextOf(caps), { taskId, from: "chief", to: "verifier", stage: "A12a" });
    } finally {
      await handle.dispose();
    }
  } finally {
    cleanup(root);
  }
});

test("legacy verifier taskId（无 workflowId）：仍走 legacy trunk 原路径，review-task-assignment-unavailable 逐字保留", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-legacy-task";
    await seedLegacyTask(root, taskId);
    await assert.rejects(
      () => openWithTask({ root, roleId: "verifier", taskId, workflowMode: "legacy" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^review-task-assignment-unavailable:/);
        return true;
      },
      "legacy 任务不得被 fixed 分支接管",
    );
  } finally {
    cleanup(root);
  }
});

test("fail-closed 不放宽：fixed 任务受派人非本角色 ⇒ fixed-task-assignment-unavailable（非 legacy 码）", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-wrong-role";
    await seedFixedTask(root, { taskId, from: "convener", to: "product", stage: "A11", sideEffect: "code" });
    await assert.rejects(
      () => openWithTask({ root, roleId: "verifier", taskId, workflowMode: "fixed" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^fixed-task-assignment-unavailable:/);
        assert.doesNotMatch(error.message, /^review-task-assignment-unavailable:/);
        return true;
      },
    );
  } finally {
    cleanup(root);
  }
});

test("fail-closed 不放宽：fixed 任务已收口 ⇒ fixed-task-assignment-unavailable（不得带已关闭任务开会话）", async () => {
  const root = tempRoot();
  try {
    const taskId = "t-b102-closed";
    await seedFixedTask(root, { taskId, from: "chief", to: "verifier", stage: "A12b" });
    const closed = await appendTaskEvent(root, taskEvent("task.closed", { taskId, by: "chief", outcome: "accepted" }));
    assert.equal(closed.ok, true, closed.ok === false ? closed.message : "");
    await assert.rejects(
      () => openWithTask({ root, roleId: "verifier", taskId, workflowMode: "fixed" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^fixed-task-assignment-unavailable:/);
        assert.match(error.message, /已收口/);
        return true;
      },
    );
  } finally {
    cleanup(root);
  }
});

test("无 taskId 的 fixed chat 不受影响：不构造 fixed assignment 上下文（chief/convener 聊天口径）", async () => {
  const root = tempRoot();
  try {
    const { handle, caps } = await openWithTask({ root, roleId: "convener", workflowMode: "fixed" });
    try {
      const context = contextTextOf(caps);
      assert.doesNotMatch(context, new RegExp(FIXED_TASK_CONTEXT_MARKER), "无任务聊天不得出现 fixed 任务上下文");
      assert.match(context, /固定路径运营/, "fixed chat 的模块 context 段保持注入");
    } finally {
      await handle.dispose();
    }
  } finally {
    cleanup(root);
  }
});
