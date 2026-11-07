// test/编排/convener-module-consumption.test.ts
// X-R4（E2 S2/S4）convener 单元消费点回归：
//  - run-role：convener 工具注入（requestRequirementChange / completeTeamPlan / closeCreatedTask /
//    submitRefactor / requestStableWrite）改读已装配角色模块 `tools()`（D1 装配表校验）；trio 注入
//    同一引用（requestStableWrite 经角色策略前置包装；requestRequirementChange 编排不包装——X-R4 收尾
//    E2 评审 V-7 起角色侧前置由 Provider 工具层单一消费）；single/su/未装配回退旧角色门控；
//  - run-role：`TRIO_CARD_KINDS.convener` 已删除；`cardKindsOf` 读模块 `cards`（["decision"]），
//    默认卡种不再产生 appointment 候选（迁移前该候选被白名单过滤，净行为一致）；
//  - run-role：stable-write 角色侧前置在注入能力之前调用模块；deny 映射既有回执码
//    `stable-write-invalid` 且能力零调用；allow 不替代 Service；
//  - trunk-runtime：team-plan 角色侧前置在 abort 之后、Git/Service 最终校验之前；事实严格按
//    api-spec §5.1 登记键；deny 映射既有 `plan-path-invalid` / `plan-identity-invalid`；
//  - workflow-preconditions + apply-journal + trunk-runtime：worker 派发目标的白名单/内置目标集改读
//    模块纯数据 `CONVENER_WORKER_DISPATCH_TARGETS`（迁移前字面量 `"verifier"`，等价）；
//  - Service（apply-journal）事务/账本/证据/Git 闭包保持，不在本单元接线（源锚点断言）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";

import {
  openRoleSession,
  convenerStableWriteFacts,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import { convenerTeamPlanFacts, createDirectRoleRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { isConvenerBuiltInDispatchTarget, evaluateDispatchAuthorization } from "../../src/common/编排/workflow-preconditions.ts";
import { convenerRoleModule } from "../../src/common/roles/convener/index.ts";
import type { RolePreflightInput } from "../../src/model/role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CloseCreatedTaskFn,
  CompleteTeamPlanFn,
  CompleteTeamPlanInput,
  RequestRequirementChangeFn,
  RequestRequirementChangeInput,
  RequestStableWriteFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  SubmitRefactorFn,
  WriteGate,
} from "../../src/model/runtime.ts";

const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function trioProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["convener"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:xr4-convener" },
    },
  };
}

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

function convenerPreflight(): NonNullable<typeof convenerRoleModule.preflight> {
  const preflight = convenerRoleModule.preflight;
  assert.ok(preflight !== undefined, "convener 模块必须提供 preflight");
  return preflight;
}

function decide(action: string, facts: Record<string, unknown>) {
  return convenerPreflight().checkAction({ action, facts } as RolePreflightInput);
}

const blockers = {
  completeTeamPlan: (async input => ({ ok: false, status: "blocked", operationId: input.operationId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" })) as CompleteTeamPlanFn,
  closeCreatedTask: (async input => ({ ok: false, status: "blocked", operationId: input.operationId, taskId: input.taskId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" })) as CloseCreatedTaskFn,
  submitRefactor: (async () => ({ ok: true, requestId: "rf-1", status: "requested" })) as SubmitRefactorFn,
};

test("X-R4 run-role：trio convener 注入模块声明的五项工具（模块声明逐一对应；requestStableWrite 经前置包装，requestRequirementChange 同引用）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr4-convener-"));
  try {
    const seenRequirements: RequestRequirementChangeInput[] = [];
    const seenStableWrites: { roleId: string; kind: "workflow"; content: string }[] = [];
    const requestRequirementChange: RequestRequirementChangeFn = async input => {
      seenRequirements.push(input);
      return { ok: true, code: "dispatched", message: "已提交（运营发起）", flowId: "demo", intentId: "intent-a", requestId: "req-xr4" };
    };
    const requestStableWrite: RequestStableWriteFn = async request => {
      seenStableWrites.push(request);
      return { ok: true, requestId: "sw-xr4", status: "requested" };
    };
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "convener", project: trioProject(root), ...blockers, requestStableWrite, requestRequirementChange },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const caps = captured.caps;
      assert.ok(caps !== undefined, "trio convener 应构造能力面");
      // 模块声明：trio 五项（D1 装配表允许集逐项同序）。
      assert.deepEqual(
        [...convenerRoleModule.tools({ governanceModel: "trio" }).tools].sort(),
        ["closeCreatedTask", "completeTeamPlan", "requestRequirementChange", "requestStableWrite", "submitRefactor"],
      );
      // 无包装的能力：completeTeamPlan / closeCreatedTask / submitRefactor 同一引用。
      assert.equal(caps.completeTeamPlan, blockers.completeTeamPlan);
      assert.equal(caps.closeCreatedTask, blockers.closeCreatedTask);
      assert.equal(caps.submitRefactor, blockers.submitRefactor);
      // 包装/透传：stable-write 经前置包装；requirement-change 同一引用（前置在 Provider 工具层）。
      assert.equal(typeof caps.requestRequirementChange, "function");
      assert.equal(typeof caps.requestStableWrite, "function");
      assert.notEqual(caps.requestStableWrite, requestStableWrite, "stable-write 经模块前置包装");
      assert.equal(caps.requestRequirementChange, requestRequirementChange, "requirement-change 编排不包装（Provider 工具层单一消费）");
      const requirement = await caps.requestRequirementChange!({ intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r" });
      assert.equal(requirement.ok, true);
      assert.deepEqual(seenRequirements, [{ intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r" }], "合法载荷原样委托");
      const stable = await caps.requestStableWrite!({ roleId: "convener", kind: "workflow", content: "# workflow\n" });
      assert.equal(stable.ok, true);
      assert.deepEqual(seenStableWrites, [{ roleId: "convener", kind: "workflow", content: "# workflow\n" }], "合法请求原样委托");
    } finally {
      await handle.dispose();
    }

    // 未提供能力 ⇒ 字段缺席（工具不注册；fail-closed）。
    const empty: Captured = {};
    const emptyHandle = await openRoleSession({ roleId: "convener", project: trioProject(root) }, { createAdapter: capturingFactory(empty) });
    try {
      for (const key of ["completeTeamPlan", "closeCreatedTask", "submitRefactor", "requestStableWrite", "requestRequirementChange"] as const)
        assert.equal(empty.caps?.[key], undefined, `${key} 未注入 ⇒ 缺席`);
    } finally {
      await emptyHandle.dispose();
    }

    // single + convener 生产不可达（single→su，门禁引擎结构性拒绝）；模块 single 声明 = 旧角色门控两项。
    await assert.rejects(
      openRoleSession({ roleId: "convener", project: { ...trioProject(root), governanceModel: "single" }, ...blockers }, { createAdapter: capturingFactory({}) }),
      /single/,
    );
    assert.deepEqual([...convenerRoleModule.tools({ governanceModel: "single" }).tools].sort(), ["requestStableWrite", "submitRefactor"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R4 收尾：requirement-change 编排不包装（同一引用）；角色侧前置由 Provider 工具层单一消费；事实键按 api-spec §5.3", async () => {
  // api-spec §5.3 登记键（`actorRoleId` + 申请载荷；批准声明键不在参数面）。事实投影的单一实现
  // 在 Provider 工具层（`requirementChangePreflightFacts`）；编排不再保留第二份投影。
  const facts = {
    actorRoleId: "convener",
    changeKind: "scope",
    flowId: "demo",
    intentId: "intent-a",
    taskId: "task-a",
    summary: "s",
    rationale: "r",
    impact: "i",
    proposedIntentPatch: "p",
  };
  assert.deepEqual(decide("requirement-change", { ...facts }), { allow: true });
  // 模块用 `actorRoleId`（不是 rapporteur 的 `initiatorRoleId`）：后者是未登记键 ⇒ 拒绝。
  assert.equal(decide("requirement-change", { ...facts, initiatorRoleId: "convener" }).allow, false);
  // 缺归属键 ⇒ scope-missing。
  const missingScope = decide("requirement-change", { actorRoleId: "convener", changeKind: "scope", summary: "s", rationale: "r" });
  assert.equal(missingScope.allow, false);
  if (!missingScope.allow) assert.equal(missingScope.code, "requirement-change-scope-missing");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr4-rrc-"));
  try {
    const requestRequirementChange: RequestRequirementChangeFn = async () => ({ ok: true, code: "dispatched", message: "ok" });
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "convener", project: trioProject(root), requestRequirementChange },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      // 编排不再包装：能力位与注入函数同一引用。deny/allow 行为由 Provider 工具层在触达能力之前
      // 完成（覆盖见 `test/runtime-core/convener-requirement-change-preflight.test.ts`）。
      assert.equal(captured.caps!.requestRequirementChange, requestRequirementChange, "编排同一引用透传（无包装）");
      const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
      assert.doesNotMatch(
        runRole,
        /withConvenerRequirementChangePreflight|convenerRequirementChangeFacts|action: "requirement-change"/,
        "run-role 不再包含 requirement-change 前置包装/事实投影/模块调用",
      );
      const providerTools = await fs.readFile(new URL("../../src/provider/runtime/tools.ts", import.meta.url), "utf8");
      assert.match(
        providerTools,
        /requirementChangePreflight\(preflightRole, requirementChangePreflightFacts\(preflightRole, input\)\)/,
        "Provider 工具层为 requirement-change 前置的唯一消费点",
      );
    } finally {
      await handle.dispose();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R4 run-role：stable-write 角色前置 facts 键按 api-spec §5.2；deny 映射 stable-write-invalid、能力零调用", async () => {
  const facts = convenerStableWriteFacts({ roleId: "convener", kind: "workflow", content: "# workflow\n" });
  assert.deepEqual(Object.keys(facts).sort(), ["actorRoleId", "content", "kind"]);
  assert.deepEqual(decide("stable-write", { ...facts }), { allow: true });
  const empty = decide("stable-write", { actorRoleId: "convener", kind: "workflow", content: "" });
  assert.equal(empty.allow, false);
  if (!empty.allow) assert.equal(empty.code, "stable-write-facts-invalid");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr4-sw-"));
  try {
    const calls: string[] = [];
    const requestStableWrite: RequestStableWriteFn = async request => {
      calls.push(request.content);
      return { ok: true, requestId: "sw-xr4", status: "requested" };
    };
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "convener", project: trioProject(root), requestStableWrite },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const denied = await captured.caps!.requestStableWrite!({ roleId: "convener", kind: "workflow", content: "" });
      assert.equal(denied.ok, false);
      assert.equal(denied.errorCode, "stable-write-invalid", "deny 映射既有 stable-write-invalid 回执");
      assert.match(denied.message ?? "", /stable-write-facts-invalid/);
      assert.equal(calls.length, 0, "deny 不触达注入能力");
    } finally {
      await handle.dispose();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R4 trunk-runtime：team-plan facts 按 api-spec §5.1；deny 在 Git/Service 之前映射既有回执码", async () => {
  const input: CompleteTeamPlanInput = {
    operationId: "xr4-plan-op",
    flowId: "demo",
    baseDigest: "a".repeat(64),
    plan: { path: "docs/scheduling/demo-team-v2.md", sha256: "b".repeat(64), version: 2 },
  };
  const facts = convenerTeamPlanFacts(input);
  assert.deepEqual(Object.keys(facts).sort(), ["actorRoleId", "baseDigest", "flowId", "operationId", "plan"], "runId 未给不造键");
  assert.deepEqual(decide("team-plan", { ...facts }), { allow: true });
  const withRun = convenerTeamPlanFacts({ ...input, runId: "run-demo" });
  assert.equal("runId" in withRun, true);
  const wrongPath = decide("team-plan", { ...facts, plan: { ...input.plan, path: "docs/scheduling/other-team-v2.md" } });
  assert.equal(wrongPath.allow, false);
  if (!wrongPath.allow) assert.equal(wrongPath.code, "team-plan-path-invalid");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr4-plan-"));
  try {
    // 前置 deny：不触达 Service/Git（临时空根即可），映射迁移前 Service 首检码。
    const denied = await createDirectRoleRuntime({ projectRoot: root, actorRoleId: "convener" }).completeTeamPlan({
      ...input, plan: { ...input.plan, path: "docs/scheduling/other-team-v2.md" },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, "rejected");
    assert.equal(denied.errorCode, "plan-path-invalid");
    // 非 convener 不进入本前置（旧路径/错误码保持；此处只断言前置没有越权改写 identity 拒绝）。
    const wrongActor = await createDirectRoleRuntime({ projectRoot: root, actorRoleId: "chief" }).completeTeamPlan(input);
    assert.equal(wrongActor.ok, false);
    assert.notEqual(wrongActor.errorCode, "plan-path-invalid");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R4 卡种：TRIO_CARD_KINDS.convener 已删除、默认卡种读模块 cards（不产生 appointment 候选）", async () => {
  assert.deepEqual([...convenerRoleModule.cards], ["decision"]);
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runRole, /\n {2}convener: \["decision"\],/, "TRIO_CARD_KINDS.convener 迁移前表项已删除");
  assert.match(runRole, /case "convener":\s*\n\s*\/\/ X-R4[\s\S]*?return defaultChoiceKindFromModule\("convener", optionIds\);/,
    "convener 默认卡种按模块 cards 推导");
  assert.match(runRole, /const module = builtInRoleModuleOf\(roleId\);\s*\n\s*if \(module !== undefined\) return module\.cards;/,
    "cardKindsOf 先读已装配模块");
});

test("X-R4 派发硬授权：convener 来源读模块 dispatch()；对外 code/message 保持迁移前稳定值", () => {
  const base = { chiefRoleId: "chief", convenerRoleId: "convener" } as const;
  const allowVerifier = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "verifier", targetBuiltIn: true, targetExists: true,
  });
  assert.equal(allowVerifier.ok, true, "convener→内置 verifier（显式存在）受理");
  // 已登记更严差异（E2 评审 V-1/§7.2-3）：窄入口显式 false/缺省 ⇒ 模块 fail-closed；对外映射既有码。
  const missingVerifier = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "verifier", targetBuiltIn: true, targetExists: false,
  });
  assert.equal(missingVerifier.ok, false);
  if (!missingVerifier.ok) assert.equal(missingVerifier.code, "target-card-missing");
  const forbidden = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "product", targetBuiltIn: true, targetExists: true,
  });
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.code, "convener-target-forbidden");
  const worker = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, targetExists: true,
  });
  assert.equal(worker.ok, true, "convener→项目 worker（存在）受理");
  const workerMissing = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, targetExists: false,
  });
  assert.equal(workerMissing.ok, false);
  if (!workerMissing.ok) assert.equal(workerMissing.code, "target-card-missing");
});

test("X-R4 派发目标数据：CONVENER_WORKER_DISPATCH_TARGETS 为内置目标唯一来源；Service/Pipeline 消费点就位", async () => {
  assert.equal(isConvenerBuiltInDispatchTarget("verifier"), true);
  assert.equal(isConvenerBuiltInDispatchTarget("product"), false);
  assert.equal(isConvenerBuiltInDispatchTarget("convener"), false);
  assert.equal(isConvenerBuiltInDispatchTarget(""), false);
  const applyJournal = await fs.readFile(new URL("../../src/service/trunk/impl/apply-journal.ts", import.meta.url), "utf8");
  assert.match(applyJournal, /input\.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget\(input\.targetRoleId\)/,
    "Service review 路由读模块数据");
  assert.doesNotMatch(applyJournal, /input\.targetRoleId === "verifier"/, "迁移前 worker 派发字面量已删除（review 路由）");
  const trunkRuntime = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  assert.match(trunkRuntime, /const review = input\.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget\(input\.targetRoleId\);/,
    "Pipeline 派发准备读模块数据");
  // Service 事务/账本/证据/Git 闭包保持：completeTeamPlan / closeCreatedTask 的 Service 身份与账本校验仍在。
  assert.match(applyJournal, /if \(actor !== "convener" \|\| !input\.operationId/, "team-plan Service 最终校验保留");
  assert.match(applyJournal, /if \(\(actor !== "chief" && actor !== "convener"\)/, "closeCreatedTask Service 身份/账本校验保留");
});

test("X-R4 源码顺序：team-plan 前置在 abort 后、Git/Service 之前；稳定写前置在能力调用之前；需求变更前置不在编排", async () => {
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  const stableIndex = runRole.indexOf("const decision = preflight.checkAction({ action: \"stable-write\"");
  const stableCall = runRole.indexOf("return fn(request, signal);", stableIndex);
  assert.ok(stableIndex > 0 && stableCall > stableIndex, "稳定写前置在委托能力之前");
  assert.equal(runRole.includes("action: \"requirement-change\""), false, "需求变更前置不在编排（Provider 工具层单一消费）");

  const trunkRuntime = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  const preflightIndex = trunkRuntime.indexOf("action: \"team-plan\"");
  const protectionIndex = trunkRuntime.indexOf("const protection = await readGitProtectionFacts(input.projectRoot);", preflightIndex);
  assert.ok(preflightIndex > 0 && protectionIndex > preflightIndex, "team-plan 前置在 Git 保护事实/Service 提交之前");
  assert.ok(trunkRuntime.indexOf("if (signal?.aborted)") < preflightIndex, "abort 早于前置");
});
