// test/编排/verifier-module-consumption.test.ts
// X-R5（E2 S2/S4）verifier 单元消费点回归：
//  - run-role：verifier 工具注入读已装配角色模块 `tools()`——**合法空声明**（D1 allow/[]，
//    14 项 RoleToolId 均不含 verifier），trio 不注入任何专属工具；single/未装配保持旧路径；
//  - run-role：`TRIO_CARD_KINDS.verifier` 表项已删除；`cardKindsOf` 读模块 `cards`
//    （["acceptance"]）；默认卡种按模块 cards 推导（选项含 accept ⇒ acceptance）；
//  - apply-journal：`prepareReviewTask` 在宿主材料（reviewBasisRef）产出后、返回前调用 verifier
//    模块 review preflight；事实键严格按 api-spec 登记（`reviewTarget`/`criteria`），未登记键不传；
//    deny 映射既有 `trunk-item-invalid` 回执；allow 不替代独立验收/证据核验；
//    已指派 review 材料读取（`readReviewTaskContext`）与普通调查任务不调用前置；
//  - 路由核对：Service/Pipeline 不调用 verifier 模块 `dispatch()`（E2 评审 X-2/X-4：目标模块
//    diff-only）；convener review 路由仍读来源模块纯数据（X-R4）；Service 事务/账本/证据核验保留。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  openRoleSession,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import { verifierReviewFacts } from "../../src/service/trunk/impl/apply-journal.ts";
import { verifierRoleModule } from "../../src/common/roles/verifier/index.ts";
import { validateRoleToolDeclaration } from "../../src/service/role/resolve-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  ActivateRoleDocumentsFn,
  CloseCreatedTaskFn,
  CompleteTeamPlanFn,
  DispatchTaskFn,
  ProjectStateFn,
  RequestRequirementChangeFn,
  RequestStableWriteFn,
  RoleSession,
  RuntimeAdapter,
  SelectRunChangeFn,
  SessionEvent,
  SubmitRefactorFn,
  SubmitVersionChangeFn,
  WriteGate,
} from "../../src/model/runtime.ts";

function trioProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["verifier"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:xr5-verifier" },
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

/** 注入面探针：被注入即调用 ⇒ 抛错（证明 verifier 未获得任何 RoleToolId 专属工具）。 */
function notDeclared(label: string): (...args: never[]) => Promise<never> {
  return async () => {
    throw new Error(`xr5 fixture: ${label} must not be injected for verifier`);
  };
}

function verifierPreflight(): NonNullable<typeof verifierRoleModule.preflight> {
  const preflight = verifierRoleModule.preflight;
  assert.ok(preflight !== undefined, "verifier 模块必须提供 preflight");
  return preflight;
}

const TARGET = {
  operationId: "xr5-review-op",
  candidate: { objectFormat: "sha1" as const, hex: "a".repeat(40) },
};
const REVIEW_BASIS_REF = {
  kind: "git-candidate-review" as const,
  candidateOperationId: TARGET.operationId,
  candidate: TARGET.candidate,
  criteria: [
    {
      oid: { objectFormat: "sha1" as const, hex: "c".repeat(40) },
      path: "docs/proposals/demo-proposal-v1.md",
      sha256: "d".repeat(64),
    },
  ],
};

const RUN_ROLE = new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url);
const APPLY_JOURNAL = new URL("../../src/service/trunk/impl/apply-journal.ts", import.meta.url);
const TRUNK_RUNTIME = new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url);

test("X-R5 run-role：verifier 工具声明为空（D1 allow/[]），trio 不注入任何 RoleToolId 专属工具", async () => {
  const declaration = validateRoleToolDeclaration(
    "verifier",
    verifierRoleModule.tools({ governanceModel: "trio" }).tools,
  );
  assert.equal(declaration.allow, true, "空声明是合法声明");
  assert.deepEqual([...declaration.tools], []);
  assert.deepEqual([...declaration.reasons], []);
  // 单一真源：模块 capabilities 与 tools() 返回同一引用（D10）。
  assert.equal(
    verifierRoleModule.tools({ governanceModel: "trio" }).capabilities,
    verifierRoleModule.capabilities,
  );

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr5-verifier-"));
  try {
    const projectState: ProjectStateFn = async () => ({ ok: true, message: "fixture" });
    const declaredInputs = {
      submitVersionChange: notDeclared("submitVersionChange") as unknown as SubmitVersionChangeFn,
      selectRunChange: notDeclared("selectRunChange") as unknown as SelectRunChangeFn,
      completeTeamPlan: notDeclared("completeTeamPlan") as unknown as CompleteTeamPlanFn,
      activateRoleDocuments: notDeclared("activateRoleDocuments") as unknown as ActivateRoleDocumentsFn,
      closeCreatedTask: notDeclared("closeCreatedTask") as unknown as CloseCreatedTaskFn,
      submitRefactor: notDeclared("submitRefactor") as unknown as SubmitRefactorFn,
      requestStableWrite: notDeclared("requestStableWrite") as unknown as RequestStableWriteFn,
      requestRequirementChange: notDeclared("requestRequirementChange") as unknown as RequestRequirementChangeFn,
      dispatchTask: notDeclared("dispatchTask") as unknown as DispatchTaskFn,
      projectState,
    };
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "verifier", project: trioProject(root), ...declaredInputs },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const caps = captured.caps;
      assert.ok(caps !== undefined, "verifier 能力面应存在（projectState 注入）");
      assert.equal(caps.projectState, projectState, "共有只读工具 projectState 原样透传");
      for (const key of [
        "submitVersionChange",
        "selectRunChange",
        "completeTeamPlan",
        "activateRoleDocuments",
        "closeCreatedTask",
        "submitRefactor",
        "requestStableWrite",
        "requestRequirementChange",
        "dispatchTask",
        "roleStatus",
        "sessionTail",
        "installSkill",
        "installMcp",
      ] as const) {
        assert.equal(caps[key], undefined, `${key} 未被 verifier 模块声明 ⇒ 不注入`);
      }
    } finally {
      await handle.dispose();
    }

    // 未注入任何角色能力 ⇒ 引擎自有工具面（governanceMatrix 等）仍存在，但 RoleToolId 专属工具不注册。
    const empty: Captured = {};
    const emptyHandle = await openRoleSession(
      { roleId: "verifier", project: trioProject(root) },
      { createAdapter: capturingFactory(empty) },
    );
    try {
      for (const key of [
        "submitVersionChange",
        "selectRunChange",
        "completeTeamPlan",
        "activateRoleDocuments",
        "closeCreatedTask",
        "submitRefactor",
        "requestStableWrite",
        "requestRequirementChange",
        "dispatchTask",
      ] as const) {
        assert.equal(empty.caps?.[key], undefined, `${key} 未注入 ⇒ 缺席`);
      }
    } finally {
      await emptyHandle.dispose();
    }

    // 源码接缝：verifier 经模块 tools() 读取（moduleToolsRole 含 verifier）。
    const source = await fs.readFile(RUN_ROLE, "utf8");
    assert.ok(
      /const moduleToolsRole =[\s\S]{0,400}?setup\.role\.id === "verifier"/.test(source),
      "moduleToolsRole 必须包含 verifier（empty declaration 经 D1 校验）",
    );
    assert.ok(
      /moduleToolDeclarationOf\(setup\.role\.id, governanceModel\)/.test(source),
      "verifier 空声明仍经 moduleToolDeclarationOf + D1 校验",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R5 卡种：TRIO_CARD_KINDS.verifier 表项已删除；cardKindsOf 读模块 cards；默认卡种按模块数据", async () => {
  assert.deepEqual([...verifierRoleModule.cards], ["acceptance"]);
  const source = await fs.readFile(RUN_ROLE, "utf8");
  const table = /const TRIO_CARD_KINDS:[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  assert.ok(table !== null, "TRIO_CARD_KINDS 块必须可定位");
  const entries = table[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"));
  assert.equal(
    entries.some((line) => /^verifier\s*:/.test(line)),
    false,
    "TRIO_CARD_KINDS.verifier 表项已删除（注释中的历史锚点不是表项）",
  );
  assert.ok(
    /case "verifier":[\s\S]{0,400}?return defaultChoiceKindFromModule\("verifier", optionIds\);/.test(source),
    "verifier 默认卡种按模块 cards 推导",
  );
  assert.ok(
    /const module = builtInRoleModuleOf\(roleId\);\s*\n\s*if \(module !== undefined\) return module\.cards;/.test(source),
    "cardKindsOf 先读已装配模块",
  );
  assert.equal((source.match(/const TRIO_CARD_KINDS/g) ?? []).length, 1, "单一 TRIO_CARD_KINDS 表");
});

test("X-R5 apply-journal：review 前置事实键严格按 api-spec（恰好 reviewTarget/criteria）；未登记键 deny", () => {
  const facts = verifierReviewFacts({ target: TARGET, reviewBasisRef: REVIEW_BASIS_REF });
  assert.deepEqual(Object.keys(facts).sort(), ["criteria", "reviewTarget"]);
  assert.deepEqual(verifierPreflight().checkAction({ action: "review", facts }), { allow: true });

  // 走私验收结论（未登记键）⇒ deny，且模块只回诊断结论，不读取其值。
  const smuggled = verifierPreflight().checkAction({
    action: "review",
    facts: { ...facts, accepted: true, passed: true, approved: true },
  });
  assert.equal(smuggled.allow, false);
  if (!smuggled.allow) {
    assert.equal(smuggled.code, "review-facts-unknown-key");
    assert.deepEqual(smuggled.details, {
      action: "review",
      unknownKeys: ["accepted", "approved", "passed"],
    });
    assert.equal("messageKey" in smuggled, true);
    assert.equal(typeof (smuggled as { messageKey?: unknown }).messageKey, "string");
  }

  const missing = verifierPreflight().checkAction({
    action: "review",
    facts: { reviewTarget: TARGET },
  });
  assert.equal(missing.allow, false);
  if (!missing.allow) assert.equal(missing.code, "review-facts-missing");

  const badCriteria = verifierPreflight().checkAction({
    action: "review",
    facts: { reviewTarget: TARGET, criteria: [] },
  });
  assert.equal(badCriteria.allow, false);
  if (!badCriteria.allow) assert.equal(badCriteria.code, "review-criteria-invalid");
});

test("X-R5 apply-journal：review 前置在 prepareReviewTask 材料产出后、返回前；指派读取不调用；deny 映射既有回执", async () => {
  const source = await fs.readFile(APPLY_JOURNAL, "utf8");
  const start = source.indexOf("export async function prepareReviewTask");
  const end = source.indexOf("export async function readAssignedReviewContext", start);
  assert.ok(start > 0 && end > start, "prepareReviewTask 必须可定位");
  const body = source.slice(start, end);
  const material = body.indexOf("const material = await readReviewMaterial(deps, input);");
  const preflight = body.indexOf('action: "review"');
  const success = body.indexOf("return { ok: true, value: { ...material.value");
  assert.ok(material > 0, "宿主材料读取在函数内");
  assert.ok(preflight > material, "前置在 reviewBasisRef 材料产出之后");
  assert.ok(success > preflight, "前置在返回/提交之前");
  assert.match(body, /if \(decision !== undefined && !decision\.allow\)/);
  assert.match(
    body,
    /return fail\("trunk-item-invalid", `Final review material was rejected by the verifier role precondition/,
    "deny 映射既有 trunk-item-invalid 回执（不新增错误码）",
  );
  assert.match(source, /export function verifierReviewFacts\(/);

  // 已指派 review 材料读取 / 普通调查任务：不调用角色策略前置。
  const readStart = source.indexOf("async function readReviewTaskContext");
  const readEnd = source.indexOf("async function readTextQualityProof", readStart);
  assert.ok(readStart > 0 && readEnd > readStart);
  assert.equal(
    source.slice(readStart, readEnd).includes('action: "review"'),
    false,
    "readReviewTaskContext（含普通调查任务）不调用 review 前置",
  );
});

test("X-R5 路由核对：不调用 verifier dispatch（diff-only）；convener review 路由读来源模块数据；Service 证据核验保留", async () => {
  const applyJournal = await fs.readFile(APPLY_JOURNAL, "utf8");
  const trunkRuntime = await fs.readFile(TRUNK_RUNTIME, "utf8");
  for (const [file, source] of [
    ["apply-journal.ts", applyJournal],
    ["trunk-runtime.ts", trunkRuntime],
  ] as const) {
    assert.equal(
      /verifierRoleModule\s*\.\s*dispatch/.test(source),
      false,
      `${file} 不得调用 verifier 模块 dispatch()（E2 X-2/X-4 diff-only）`,
    );
  }
  // 唯一 verifier 角色侧消费 = review preflight（apply-journal S4）。
  assert.match(applyJournal, /verifierRoleModule\.preflight\?\.checkAction\(/);
  // convener review 路由仍读来源模块纯数据（X-R4）。
  assert.match(applyJournal, /input\.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget\(input\.targetRoleId\)/);
  assert.doesNotMatch(applyJournal, /input\.targetRoleId === "verifier"/);
  assert.match(trunkRuntime, /const review = input\.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget\(input\.targetRoleId\);/);
  // hub 目标列表属 chief 来源路由（X-R5 时未改；X-R6 已切读 CHIEF_HUB_DISPATCH 纯数据）。
  assert.match(trunkRuntime, /const hub = input\.fromRoleId === CHIEF_HUB_DISPATCH\.sourceRoleId/);
  assert.match(trunkRuntime, /CHIEF_HUB_DISPATCH\.targetRoleIds\.some\(\(roleId\) => roleId === input\.targetRoleId\)/);
  assert.doesNotMatch(
    trunkRuntime,
    /\["product", "rapporteur", "nominator", "convener", "verifier"\]\.includes\(input\.targetRoleId\)/,
    "X-R6 后 hub 目标表不得保留第二份字面量",
  );
  // Service 任务/账本/证据核验保留（不因模块化放宽）。
  assert.match(applyJournal, /if \(input\.actorRoleId !== "verifier" \|\| creations\.length !== 1/);
  assert.match(applyJournal, /async function readTextQualityProof/);
  assert.match(applyJournal, /if \(!review\.ok\) return invalid\(review\.message \?\? review\.code\);/);
});

test("X-R5 收尾：临时三态开关与 legacy 分支已删除（无残留）", async () => {
  // 名字拆开构造，避免本测试自身成为残留扫描的假命中。
  const needle = ["VERIFIER", "E2", "CONSUMPTION"].join("_");
  for (const [name, file] of [
    ["run-role.ts", RUN_ROLE],
    ["apply-journal.ts", APPLY_JOURNAL],
  ] as const) {
    const source = await fs.readFile(file, "utf8");
    assert.equal(source.includes(needle), false, `${name} 不得残留临时三态开关`);
  }
});
