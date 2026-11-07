// test/编排/chief-module-consumption.test.ts
// E2 X-R6（chief 单元）消费点接线回归：编排/Service 对 chief 角色模块纯数据/策略的消费。
//
// 覆盖（只看本次切换点；行为差分与 B0 对照见证据文档）：
//  - run-role：6 项工具注入读模块 `tools()` + D1 校验（closeCreatedTask 保留 directGovernance；
//    decidePendingRequest 仍只属独立决策上下文）；旧角色门控仅作 single/su/未装配回退。
//  - run-role：卡种 `TRIO_CARD_KINDS.chief` 已删除（模块 `cards` 唯一真源）；默认 intent-confirm
//    与 intent-confirm 条件读 `CHIEF_INTENT_CONFIRM_CARD`。
//  - apply-journal：hub 分支来源/目标/路由/purpose/schema 读 `CHIEF_HUB_DISPATCH`；Service 事务/
//    账本/证据核验保留。
//  - trunk-runtime：hub 目标集合读模块数据；documents/coordination/rolePreparation 属引擎路由保留。
//  - version-decision：注入与矩阵发起读模块声明；迁移前谓词仅作回退。
//
// 本文件只做只读源码接缝 + 公开入口行为断言；不启动真实模型、不写真实账本。

import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  ActivateRoleDocumentsFn,
  CloseCreatedTaskFn,
  CompleteTeamPlanFn,
  DecidePendingRequestFn,
  ProjectNoteFn,
  RedispatchTaskFn,
  RequestVersionDecisionFn,
  RoleActivityLogFn,
  RoleSession,
  RuntimeAdapter,
  SelectRunChangeFn,
  SessionEvent,
  TerminateRoleRunFn,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import {
  validateRoleToolDeclaration,
} from "../../src/common/门禁引擎/role-tool-registry.ts";
import { CHIEF_HUB_DISPATCH, CHIEF_INTENT_CONFIRM_CARD, CHIEF_TOOL_IDS } from "../../src/common/roles/chief/index.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_ROLE = path.join(REPO_ROOT, "src", "pipeline", "orchestration", "run-role.ts");
const APPLY_JOURNAL = path.join(REPO_ROOT, "src", "service", "trunk", "impl", "apply-journal.ts");
const TRUNK_RUNTIME = path.join(REPO_ROOT, "src", "pipeline", "orchestration", "trunk-runtime.ts");

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
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

function trioChiefProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:chief-module-consumption" },
    },
  };
}

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-chief-consumption-"));
  try {
    return await fn(root);
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

const roleActivityLog = (() => undefined) as RoleActivityLogFn;
const terminateRoleRun = (() => undefined) as TerminateRoleRunFn;
const redispatchTask = (() => undefined) as RedispatchTaskFn;
const projectNote = (() => ({ ok: true })) as unknown as ProjectNoteFn;
const requestVersionDecision = (async () => ({ ok: true })) as unknown as RequestVersionDecisionFn;
const closeCreatedTask: CloseCreatedTaskFn = async input => ({
  ok: false,
  status: "blocked",
  operationId: input.operationId,
  taskId: input.taskId,
  baseDigest: null,
  targetDigest: null,
  errorCode: "fixture",
  message: "fixture",
});
const selectRunChange: SelectRunChangeFn = async input => ({
  ok: false,
  status: "blocked",
  operationId: input.operationId,
  baseDigest: null,
  targetDigest: null,
  errorCode: "fixture",
  message: "fixture",
});
const completeTeamPlan: CompleteTeamPlanFn = async input => ({
  ok: false,
  status: "blocked",
  operationId: input.operationId,
  baseDigest: null,
  targetDigest: null,
  errorCode: "fixture",
  message: "fixture",
});
const activateRoleDocuments: ActivateRoleDocumentsFn = async input => ({
  ok: false,
  status: "blocked",
  operationId: input.operationId,
  baseDigest: null,
  targetDigest: null,
  errorCode: "fixture",
  message: "fixture",
});

// ——————————————————————— 工具注入 ———————————————————————

test("X-R6 工具：模块 trio 声明 6 项经 D1 allow；trio chief 实际注入 6 项且同一引用", async () => {
  const validation = validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS);
  assert.equal(validation.allow, true);
  assert.deepEqual(validation.tools.map(binding => binding.id), [...CHIEF_TOOL_IDS]);
  assert.deepEqual(validation.tools.map(binding => binding.name), [
    "role_activity_log",
    "terminate_role_run",
    "redispatch_task",
    "project_note",
    "request_version_decision",
    "close_created_task",
  ]);
  assert.equal(CHIEF_TOOL_IDS.includes("decidePendingRequest"), false, "decidePendingRequest 不属普通会话声明");

  await withRoot(async root => {
    const captured: Captured = {};
    const direct = {
      roleActivityLog,
      terminateRoleRun,
      redispatchTask,
      projectNote,
      requestVersionDecision,
      closeCreatedTask,
      selectRunChange,
      completeTeamPlan,
      activateRoleDocuments,
    };
    const handle = await openRoleSession(
      { roleId: "chief", project: trioChiefProject(root), ...direct },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const expected = [
        "roleActivityLog",
        "terminateRoleRun",
        "redispatchTask",
        "projectNote",
        "requestVersionDecision",
        "closeCreatedTask",
      ] as const;
      for (const key of expected) assert.equal(captured.caps?.[key], direct[key], `${key} 未按模块声明注入同一引用`);
      for (const key of ["selectRunChange", "completeTeamPlan", "activateRoleDocuments"] as const) {
        assert.equal(captured.caps?.[key], undefined, `${key} 不得注入给 chief`);
      }
    } finally {
      await handle.dispose();
    }
  });
});

test("X-R6 工具（源码接缝）：moduleToolsRole 含 chief；旧门控仅作回退；closeCreatedTask 保留 directGovernance", async () => {
  const source = await fsp.readFile(RUN_ROLE, "utf8");
  assert.match(
    source,
    /const moduleToolsRole =[\s\S]{0,400}?setup\.role\.id === "chief";/,
    "moduleToolsRole 必须包含 chief（6 项声明经 D1 校验）",
  );
  assert.match(source, /moduleToolDeclarationOf\(setup\.role\.id, governanceModel\)/);
  // 旧角色门控回退值逐字保留（single/su/未装配模块）。
  for (const id of ["roleActivityLog", "terminateRoleRun", "redispatchTask", "projectNote"]) {
    assert.ok(
      source.includes(`const ${id} = trioSpec?.id === "chief" ? input.${id} : undefined;`),
      `旧回退门控缺失：${id}`,
    );
  }
  assert.ok(
    source.includes("const requestVersionDecision = trioSpec !== undefined && canRequestVersionDecision(trioSpec.id) ? input.requestVersionDecision : undefined;"),
    "requestVersionDecision 旧回退门控缺失",
  );
  assert.ok(
    source.includes('const closeCreatedTask = directGovernance && (setup.role.id === "chief" || setup.role.id === "convener") ? input.closeCreatedTask : undefined;'),
    "closeCreatedTask 旧合并门控缺失",
  );
  assert.match(source, /const effectiveCloseCreatedTask = moduleCloseCreatedTask === undefined[\s\S]{0,200}?moduleCloseCreatedTask && directGovernance/);
  assert.doesNotMatch(source, /setup\.role\.id !== "convener" \|\| moduleCloseCreatedTask !== false/, "convener 专用收窄已由模块驱动替代");
});

// ——————————————————————— 卡种 / 默认卡 / intent-confirm ———————————————————————

test("X-R6 卡种：TRIO_CARD_KINDS.chief 表项已删除；默认卡由模块卡数据驱动", async () => {
  assert.deepEqual([...CHIEF_INTENT_CONFIRM_CARD.optionIds], ["confirm", "revise"]);
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.cardKind, "intent-confirm");
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.requiredOptionId, "confirm");

  const source = await fsp.readFile(RUN_ROLE, "utf8");
  const table = /const TRIO_CARD_KINDS:[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  assert.ok(table !== null, "TRIO_CARD_KINDS 块必须可定位");
  const entries = table[1]!
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "" && !line.startsWith("//"));
  assert.equal(entries.some(line => /^chief\s*:/.test(line)), false, "TRIO_CARD_KINDS.chief 表项已删除");
  assert.equal(/chief:\s*\[/.test(table[1]!), false, "不得保留旧表项的源码副本（含注释）");
  assert.match(table[1]!, /X-R6（E2 S2\/D8）：chief 表项已删除/);

  assert.match(
    source,
    /case "chief":[\s\S]{0,500}?optionIds\.includes\(CHIEF_INTENT_CONFIRM_CARD\.requiredOptionId\)[\s\S]{0,200}?cardKindsOf\("chief"\)\.includes\(CHIEF_INTENT_CONFIRM_CARD\.cardKind\)/,
    "chief 默认卡必须读模块卡数据（requiredOptionId + cards 白名单）",
  );
  assert.match(source, /cardKindsOf\("chief"\)\.includes\(CHIEF_INTENT_CONFIRM_CARD\.cardKind\)/);
});

test("X-R6 intent-confirm：准备分支与协调者 choice 守卫读模块卡数据；文案保持既有口径", async () => {
  const source = await fsp.readFile(RUN_ROLE, "utf8");
  assert.match(
    source,
    /setup\.role\.id === "chief" && cardKind === CHIEF_INTENT_CONFIRM_CARD\.cardKind && effectiveReq\.kind === "choice"/,
    "intent-confirm 准备分支必须读模块 cardKind",
  );
  assert.match(
    source,
    /!optionIds\.includes\(CHIEF_INTENT_CONFIRM_CARD\.requiredOptionId\)[\s\S]{0,120}?cardKind === CHIEF_INTENT_CONFIRM_CARD\.cardKind/,
    "协调者 choice 守卫必须读模块 requiredOptionId/cardKind",
  );
  assert.ok(source.includes("intent-confirm 必须有 confirm/revise 选项"), "卡面用户文案保持既有口径（模块数据不含文案）");
});

// ——————————————————————— apply-journal hub ———————————————————————

test("X-R6 apply-journal：hub 来源/目标/路由/purpose/schema 读模块；证据核验字面量保留", async () => {
  assert.deepEqual([...CHIEF_HUB_DISPATCH.targetRoleIds], ["product", "rapporteur", "nominator", "convener", "verifier"]);
  const source = await fsp.readFile(APPLY_JOURNAL, "utf8");
  assert.match(source, /import \{ CHIEF_HUB_DISPATCH \} from "\.\.\/\.\.\/\.\.\/common\/roles\/chief\/index\.ts";/);
  assert.match(source, /function isChiefHubDispatchTarget\(roleId: string\): boolean \{\s*\n\s*return CHIEF_HUB_DISPATCH\.targetRoleIds\.some/);
  assert.match(source, /if \(input\.hubRouting === CHIEF_HUB_DISPATCH\.routing\)/);
  assert.match(source, /input\.fromRoleId !== CHIEF_HUB_DISPATCH\.sourceRoleId \|\| !isChiefHubDispatchTarget\(input\.targetRoleId\)/);
  assert.match(source, /host\.parent\.roleId !== CHIEF_HUB_DISPATCH\.sourceRoleId/);
  assert.match(source, /schema: CHIEF_HUB_DISPATCH\.workSourceSchema, kind: creator \? "creator-report" : "customer-turn", purpose: CHIEF_HUB_DISPATCH\.purpose, hubRouting: CHIEF_HUB_DISPATCH\.routing/);
  assert.match(source, /purpose: CHIEF_HUB_DISPATCH\.purpose, hubRouting: CHIEF_HUB_DISPATCH\.routing/);
  // Service 事务/账本/证据核验保留（目标表副本仍在证据绑定点；不是第二权限源）。
  assert.ok(
    source.includes('!["product", "rapporteur", "nominator", "convener", "verifier"].includes(event.to)'),
    "journal apply 的 task.created 证据绑定必须保留逐字校验",
  );
  assert.match(source, /value\.targetRoleId !== event\.to/);
  assert.match(source, /task\.hubRouting !== "chief-hub-v1"/);
  assert.match(source, /input\.targetRoleId !== "verifier" \|\| input\.moduleId !== undefined/);
  // 非 hub 的 chief→built-in 文档/协调/角色准备路由来源判定同读模块 sourceRoleId（目标映射保留）。
  assert.match(source, /const coordination = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && input\.targetRoleId === "convener"/);
  assert.match(source, /const rolePreparation = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && input\.targetRoleId === "nominator"/);
  assert.match(source, /if \(input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && \(\["product", "rapporteur"\]\.includes\(input\.targetRoleId\)/);
});

// ——————————————————————— trunk-runtime hub ———————————————————————

test("X-R6 trunk-runtime：hub 目标集合读模块；documents/coordination/rolePreparation 引擎路由保留", async () => {
  const source = await fsp.readFile(TRUNK_RUNTIME, "utf8");
  assert.match(source, /import \{ CHIEF_HUB_DISPATCH \} from "\.\.\/\.\.\/common\/roles\/chief\/index\.ts";/);
  assert.match(source, /const hub = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId\s*\n\s*&& CHIEF_HUB_DISPATCH\.targetRoleIds\.some\(\(roleId\) => roleId === input\.targetRoleId\);/);
  assert.doesNotMatch(
    source,
    /\["product", "rapporteur", "nominator", "convener", "verifier"\]\.includes\(input\.targetRoleId\)/,
    "hub 目标表不得保留第二份字面量",
  );
  assert.match(source, /const documents = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && \["product", "rapporteur"\]\.includes\(input\.targetRoleId\);/);
  assert.match(source, /const coordination = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && input\.targetRoleId === "convener";/);
  assert.match(source, /const rolePreparation = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId && input\.targetRoleId === "nominator";/);
  assert.match(source, /\.prepareRoleDispatch\(\{ \.\.\.input, \.\.\.\(hub \? \{ hubRouting: CHIEF_HUB_DISPATCH\.routing \} : \{\}\) \}\)/);
  // controller resume 的 hub:true 与证据条件不在本单元替换范围（保留）。
  assert.match(source, /evaluateChiefDispatchParent\(\{ host: context, core, hub: true \}\)\.ok/);
});

// ——————————————————————— version-decision ———————————————————————

test("X-R6 version-decision：注入与矩阵发起读模块声明；迁移前谓词仅回退", async () => {
  const source = await fsp.readFile(RUN_ROLE, "utf8");
  assert.match(source, /const effectiveRequestVersionDecision = moduleToolValue\("requestVersionDecision", requestVersionDecision, input\.requestVersionDecision\);/);
  assert.match(source, /versionDecision: moduleRoleDeclaresTool\(spec\.id, "requestVersionDecision"\)/);
  assert.match(source, /function canRequestVersionDecision\(roleId: string\): boolean \{\s*\n\s*return roleId === "chief";\s*\n\}/);
  assert.match(source, /迁移前版本决策发起谓词（X-R6 起仅作\*\*模块未装配回退\*\*/);
});

// ——————————————————————— 收尾 ———————————————————————

test("X-R6 收尾：临时三态开关与 legacy 分支已删除（无残留）", async () => {
  // 名字拆开构造，避免本测试自身成为残留扫描的假命中。
  const needle = ["CHIEF", "E2", "CONSUMPTION"].join("_");
  for (const file of [RUN_ROLE, APPLY_JOURNAL, TRUNK_RUNTIME]) {
    const source = await fsp.readFile(file, "utf8");
    assert.equal(source.includes(needle), false, `${path.basename(file)} 不得残留临时回滚开关`);
  }
  const runRole = await fsp.readFile(RUN_ROLE, "utf8");
  assert.equal((runRole.match(/const TRIO_CARD_KINDS/g) ?? []).length, 1, "单一 TRIO_CARD_KINDS 表");
  assert.equal((runRole.match(/canRequestVersionDecision/g) ?? []).length, 2, "谓词定义 + 回退调用各一处");
});

// 保持 decidePendingRequest 类型被引用（独立决策上下文语义由 run-role-submit-capabilities 覆盖）。
const _decidePendingRequestType: DecidePendingRequestFn | undefined = undefined;
void _decidePendingRequestType;
