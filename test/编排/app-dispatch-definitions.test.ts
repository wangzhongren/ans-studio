// test/编排/app-dispatch-definitions.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色）：**app-dispatch/v1 应用内流程定义注册表**。
//
// 依据：docs/planning/2026-11-17_design_app-dispatch-builtins.md §三（阶段→执行者）、§4.4（类型化注册表、
// 定义 hash、JSON Schema）、§7.1（状态机沿用 workflow-state）、§三/§9.1（Q9）；Q1–Q10 裁定。
// 覆盖：
//   1. add（A1–A13，含 A12a/A12b/A12 聚合）与 modify（B1–B4）注册表覆盖、id/path/version；
//   2. 每阶段 next/reworkFallback 与 `workflow-state.ts` 冻结表**逐项一致**；`validateWorkflowDefinitions()`
//      自检通过（空错误）；driveOrder 合法边；
//   3. canonical JSON（键排序）与定义 hash 稳定（重算一致、64 hex、注册表常量同源）；定义深度只读；
//   4. 单定义/注册表 JSON Schema 可生成（draft 2020-12、stage enum、driveOrder 边界、无外部 $ref）；
//   5. `getWorkflowDefinition` fail-closed：未知 id ⇒ `workflow-definition-unknown`；版本不符 ⇒
//      `workflow-definition-version-unsupported`（不静默迁移）；路径→定义 id 映射；
//   6. 关键语义冻结：A1/A4/A7 on-dispatch、A12a/A12b review+review-role、A13/B4 release-or-close、
//      A11/B3 高风险零重派、三卡 cardKind/选项/documentKinds、merge-main appOwned、Q8 重试策略、
//      B1 fallback rapporteur、B2 应用派生、acceptance 策略（默认 standard、light accept-with-archive）。
//
// 纯数据/纯函数断言；无 I/O、无临时目录、无端口、不读 .env。

import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCEPTANCE_STRENGTHS,
  WORKFLOW_DEFINITION_HASHES,
  WORKFLOW_DEFINITION_HASHES_BY_VERSION,
  WORKFLOW_DEFINITION_IDS,
  WORKFLOW_DEFINITION_REGISTRY_SCHEMA,
  WORKFLOW_DEFINITION_SCHEMA,
  WORKFLOW_DEFINITION_VERSION,
  WORKFLOW_DEFINITION_VERSIONS,
  WORKFLOW_DEFINITIONS,
  canonicalJson,
  getWorkflowDefinition,
  listWorkflowDefinitions,
  validateWorkflowDefinitions,
  workflowDefinitionHash,
  workflowDefinitionIdForPath,
  workflowDefinitionJsonSchema,
  workflowDefinitionsJsonSchema,
  workflowDefinitionVersionsOf,
  type WorkflowDefinition,
  type WorkflowStageDefinition,
} from "../../src/common/编排/workflow-definitions.ts";
import {
  WORKFLOW_REWORK_FALLBACKS,
  WORKFLOW_STAGE_TRANSITIONS,
} from "../../src/common/编排/workflow-state.ts";
import { WORKFLOW_STAGES, type WorkflowStage } from "../../src/model/runtime.ts";

const ADD_STAGES: readonly WorkflowStage[] = [
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A12a", "A12b", "A13",
];
const MODIFY_STAGES: readonly WorkflowStage[] = ["B1", "B2", "B3", "B4"];

function stageOf(definition: WorkflowDefinition, stage: WorkflowStage): WorkflowStageDefinition {
  const found = definition.stages.find((entry) => entry.stage === stage);
  assert.ok(found !== undefined, `定义 ${definition.id} 应包含阶段 ${stage}`);
  return found!;
}

test("注册表覆盖：add=A1–A13（含 A12a/A12b/A12 聚合）、modify=B1–B4；当前版本 v3、三版本 v1/v2/v3；全项目阶段恰归属一条定义", () => {
  assert.deepEqual([...WORKFLOW_DEFINITION_IDS], ["add", "modify"]);
  // 2026-11-20（block resolver 地基 v2 → SMOKE-2 S2 v3）：定义版本 2→3；v3 = v2 + A2/A3 任务文本与
  // 角色边界对齐；v1/v2 逐字保留给在飞 app-dispatch/v1 workflow（按各自 hash 解释，不静默迁移）。
  assert.equal(WORKFLOW_DEFINITION_VERSION, 3);
  assert.deepEqual([...WORKFLOW_DEFINITION_VERSIONS], [1, 2, 3]);
  const add = WORKFLOW_DEFINITIONS.add;
  const modify = WORKFLOW_DEFINITIONS.modify;
  assert.equal(add.schema, WORKFLOW_DEFINITION_SCHEMA);
  assert.equal(add.id, "add");
  assert.equal(add.version, 3);
  assert.equal(add.path, "A");
  assert.equal(modify.schema, WORKFLOW_DEFINITION_SCHEMA);
  assert.equal(modify.id, "modify");
  assert.equal(modify.version, 3);
  assert.equal(modify.path, "B");
  assert.deepEqual(add.stages.map((entry) => entry.stage).sort(), [...ADD_STAGES].sort(), "add 阶段集合 = A1–A13（15 阶段）");
  assert.equal(add.stages.length, 15);
  assert.deepEqual(modify.stages.map((entry) => entry.stage).sort(), [...MODIFY_STAGES].sort(), "modify 阶段集合 = B1–B4");
  // 全项目阶段覆盖：每个阶段恰属一条定义（无例外、无重复）。
  for (const stage of WORKFLOW_STAGES) {
    const owners = WORKFLOW_DEFINITION_IDS.filter((id) =>
      WORKFLOW_DEFINITIONS[id].stages.some((entry) => entry.stage === stage));
    assert.deepEqual(owners.length, 1, `阶段 ${stage} 应恰归属一条定义（实际 ${owners.join("/") || "无"}）`);
  }
  assert.deepEqual(listWorkflowDefinitions().map((definition) => definition.id), ["add", "modify"], "list 顺序固定 add→modify");
});

test("next/rework 与 workflow-state.ts 冻结表逐项一致；validateWorkflowDefinitions() 自检通过", () => {
  for (const definition of listWorkflowDefinitions()) {
    for (const entry of definition.stages) {
      assert.deepEqual([...entry.next], [...WORKFLOW_STAGE_TRANSITIONS[entry.stage]], `${definition.id}/${entry.stage}: next 必须与转移表一致`);
      const canonicalRework = WORKFLOW_REWORK_FALLBACKS[entry.stage];
      if (canonicalRework === undefined) {
        assert.equal(entry.reworkFallback, undefined, `${definition.id}/${entry.stage}: 转移表无返工边，定义不得私有`);
      } else {
        assert.equal(entry.reworkFallback, canonicalRework, `${definition.id}/${entry.stage}: reworkFallback 必须与冻结映射一致`);
      }
    }
  }
  // 返工边四例（A3→A2 / A6→A5 / A12b→A11 / B2→B1）显式冻结。
  assert.equal(stageOf(WORKFLOW_DEFINITIONS.add, "A3").reworkFallback, "A2");
  assert.equal(stageOf(WORKFLOW_DEFINITIONS.add, "A6").reworkFallback, "A5");
  assert.equal(stageOf(WORKFLOW_DEFINITIONS.add, "A12b").reworkFallback, "A11");
  assert.equal(stageOf(WORKFLOW_DEFINITIONS.modify, "B2").reworkFallback, "B1");
  assert.deepEqual(validateWorkflowDefinitions(), [], "注册表自检必须零错误（漂移即失败，不自动修）");
});

test("driveOrder：A = A1…A10→A12a→A11→A12b→A12→A13；B = B1→B4；相邻对均为合法边", () => {
  assert.deepEqual([...WORKFLOW_DEFINITIONS.add.driveOrder],
    ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11", "A12b", "A12", "A13"]);
  assert.deepEqual([...WORKFLOW_DEFINITIONS.modify.driveOrder], ["B1", "B2", "B3", "B4"]);
  for (const definition of listWorkflowDefinitions()) {
    const stages = definition.stages.map((entry) => entry.stage);
    assert.equal(new Set(definition.driveOrder).size, definition.driveOrder.length, "driveOrder 不重复");
    assert.deepEqual([...definition.driveOrder].sort(), [...stages].sort(), "driveOrder 覆盖全部阶段");
    for (let index = 0; index + 1 < definition.driveOrder.length; index += 1) {
      const from = definition.driveOrder[index]!;
      const to = definition.driveOrder[index + 1]!;
      assert.equal(WORKFLOW_STAGE_TRANSITIONS[from].includes(to), true, `${from}→${to} 必须是转移表中的合法边`);
    }
  }
});

test("定义 hash：canonical JSON 键排序、SHA-256 稳定、注册表常量同源、重复计算一致", () => {
  // canonicalJson：对象键递归排序（数组顺序保留）。
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1], c: 2 } }), '{"a":{"c":2,"d":[3,1]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }), "键序不影响 canonical JSON");
  for (const id of WORKFLOW_DEFINITION_IDS) {
    const definition = WORKFLOW_DEFINITIONS[id];
    const hash = workflowDefinitionHash(definition);
    assert.match(hash, /^[a-f0-9]{64}$/, `${id} 定义 hash 必须是 64 hex`);
    assert.equal(hash, WORKFLOW_DEFINITION_HASHES[id], `${id} 注册表常量 hash 必须与重算一致`);
    assert.equal(hash, workflowDefinitionHash(definition), `${id} 重复计算稳定（无时钟/随机）`);
    const again = getWorkflowDefinition(id);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.hash, hash, "getWorkflowDefinition 返回同一 hash");
    // 逐版本 hash：v3 = 当前注册表常量；v1/v2 仍可解析且逐版本 hash 独立（旧发布值口径，供在飞对账）。
    assert.deepEqual(workflowDefinitionVersionsOf(id).map((entry) => entry.version), [1, 2, 3]);
    const v1 = getWorkflowDefinition(id, 1);
    const v2 = getWorkflowDefinition(id, 2);
    const v3 = getWorkflowDefinition(id, 3);
    assert.equal(v1.ok, true);
    assert.equal(v2.ok, true);
    assert.equal(v3.ok, true);
    if (v1.ok) {
      assert.equal(v1.definition.version, 1);
      assert.equal(v1.hash, workflowDefinitionHash(v1.definition), "v1 hash 与重算一致");
      assert.equal(v1.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][1]);
    }
    if (v2.ok) {
      assert.equal(v2.definition.version, 2);
      assert.equal(v2.hash, workflowDefinitionHash(v2.definition), "v2 hash 与重算一致");
      assert.equal(v2.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2], "v2 hash 走逐版本常量（在飞 v2 按 v2 解释）");
    }
    if (v3.ok) {
      assert.equal(v3.definition.version, 3);
      assert.equal(v3.hash, WORKFLOW_DEFINITION_HASHES[id], "v3 hash = 当前注册表常量");
      assert.equal(v3.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][3]);
    }
    if (v1.ok && v2.ok && v3.ok) {
      assert.notEqual(v1.hash, v2.hash, "v1/v2 hash 必须不同（语义已版本化）");
      assert.notEqual(v2.hash, v3.hash, "v2/v3 hash 必须不同（任务文本已版本化）");
      assert.notEqual(v1.hash, v3.hash, "v1/v3 hash 必须不同");
    }
  }
  // 两条定义 hash 不同（不是复制冒充）。
  assert.notEqual(WORKFLOW_DEFINITION_HASHES.add, WORKFLOW_DEFINITION_HASHES.modify);
});

test("定义只读：注册表/定义/嵌套数组深度冻结；篡改抛错且 hash 不受外部别名影响", () => {
  const add = WORKFLOW_DEFINITIONS.add;
  assert.equal(Object.isFrozen(WORKFLOW_DEFINITIONS), true);
  assert.equal(Object.isFrozen(add), true);
  assert.equal(Object.isFrozen(add.stages), true);
  assert.equal(Object.isFrozen(add.stages[0]), true);
  assert.equal(Object.isFrozen(add.stages[0]!.next), true);
  assert.equal(Object.isFrozen(add.stages[0]!.taskText.details), true);
  assert.throws(() => { (add as { version: number }).version = 4; }, TypeError);
  assert.throws(() => { (add.stages[0] as { title: string }).title = "篡改"; }, TypeError);
  assert.equal(add.version, 3);
  // hash 在篡改尝试后仍等于注册表常量（不含外部可变引用）。
  assert.equal(workflowDefinitionHash(add), WORKFLOW_DEFINITION_HASHES.add);
});

test("JSON Schema：单定义/注册表可生成；draft 2020-12、stage 枚举、driveOrder 边界、无外部 $ref", () => {
  const add = WORKFLOW_DEFINITIONS.add;
  const schema = workflowDefinitionJsonSchema(add);
  assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema["type"], "object");
  assert.equal(schema["additionalProperties"], false);
  const required = schema["required"] as string[];
  for (const field of ["schema", "id", "version", "path", "title", "acceptance", "driveOrder", "stages"]) {
    assert.equal(required.includes(field), true, `单定义 schema 必须要求 ${field}`);
  }
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(properties["id"], { const: "add" });
  assert.deepEqual(properties["path"], { const: "A" });
  assert.deepEqual(properties["schema"], { const: WORKFLOW_DEFINITION_SCHEMA });
  const stageIds = add.stages.map((entry) => entry.stage);
  const stagesSchema = properties["stages"] as { minItems: number; maxItems: number; items: { properties: Record<string, unknown> } };
  assert.equal(stagesSchema.minItems, stageIds.length);
  assert.equal(stagesSchema.maxItems, stageIds.length);
  const stageEnum = (stagesSchema.items.properties["stage"] as { enum: string[] }).enum;
  assert.deepEqual([...stageEnum].sort(), [...stageIds].sort(), "stage enum = 该定义阶段集合");
  const driveOrderSchema = properties["driveOrder"] as { minItems: number; maxItems: number; items: { enum: string[] } };
  assert.equal(driveOrderSchema.minItems, stageIds.length);
  assert.equal(driveOrderSchema.maxItems, stageIds.length);
  assert.deepEqual([...driveOrderSchema.items.enum].sort(), [...stageIds].sort());
  assert.equal(JSON.stringify(schema).includes("$ref"), false, "纯内联 schema（不依赖外部 $ref）");

  const registry = workflowDefinitionsJsonSchema();
  assert.equal((registry["properties"] as Record<string, Record<string, unknown>>)["schema"]["const"], WORKFLOW_DEFINITION_REGISTRY_SCHEMA);
  const definitions = (registry["properties"] as Record<string, Record<string, Record<string, unknown>>>)["definitions"];
  assert.deepEqual(definitions["required"], ["add", "modify"]);
  assert.deepEqual(Object.keys(definitions["properties"]!).sort(), ["add", "modify"]);
  const modifyPath = ((definitions["properties"]!["modify"] as unknown as {
    properties: { path: { const: string } };
  }).properties.path.const);
  assert.equal(modifyPath, "B");
  // 可序列化（导出用）。
  assert.doesNotThrow(() => JSON.stringify(registry));
});

test("getWorkflowDefinition fail-closed：未知 id/版本不符稳定码；v1/v2/v3 合法、version 4 非法；A→add、B→modify", () => {
  const unknown = getWorkflowDefinition("delete");
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "workflow-definition-unknown");
  const missing = getWorkflowDefinition(undefined);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "workflow-definition-unknown");
  // 2026-11-20（SMOKE-2 S2）：v3 为当前合法版本；v1/v2/v3 均可解析，version 4（及其它）才非法（不静默迁移）。
  const explicitV2 = getWorkflowDefinition("add", 2);
  assert.equal(explicitV2.ok, true);
  if (explicitV2.ok) assert.equal(explicitV2.definition.version, 2);
  const explicitV3 = getWorkflowDefinition("add", 3);
  assert.equal(explicitV3.ok, true);
  if (explicitV3.ok) {
    assert.equal(explicitV3.definition.version, 3);
    assert.equal(explicitV3.hash, WORKFLOW_DEFINITION_HASHES.add, "v3 hash = 当前注册表常量");
  }
  const badVersion = getWorkflowDefinition("add", 4);
  assert.equal(badVersion.ok, false);
  if (!badVersion.ok) {
    assert.equal(badVersion.code, "workflow-definition-version-unsupported");
    assert.match(badVersion.message, /不静默迁移/);
  }
  const explicit = getWorkflowDefinition("modify", 1);
  assert.equal(explicit.ok, true);
  if (explicit.ok) {
    assert.equal(explicit.definition.id, "modify");
    assert.equal(explicit.definition.version, 1);
  }
  assert.equal(workflowDefinitionIdForPath("A"), "add");
  assert.equal(workflowDefinitionIdForPath("B"), "modify");
});

test("关键语义冻结：on-dispatch/review/release-or-close/高风险零重派/三卡/merge-main/B1 回退/B2 派生", () => {
  const add = WORKFLOW_DEFINITIONS.add;
  const modify = WORKFLOW_DEFINITIONS.modify;

  // A1/A4/A7：任务创建即完成（沿用 DISPATCH_COMPLETES）。
  for (const stage of ["A1", "A4", "A7"] as const) {
    const entry = stageOf(add, stage);
    assert.equal(entry.completion, "on-dispatch", `${stage} 完成于 stage.dispatched`);
    assert.equal(entry.taskKind, "stage-execution");
    assert.equal(entry.executor, "built-in");
    assert.deepEqual([...entry.requiredEvidence], [`stage-dispatched-${stage}`]);
  }
  // A2/A5/A8/A9/A12a/A12b：任务 accepted 收口（taskKind 与执行者）。
  assert.equal(stageOf(add, "A2").completion, "task-accepted");
  assert.equal(stageOf(add, "A2").executorRole, "product");
  assert.equal(stageOf(add, "A5").executorRole, "rapporteur");
  assert.equal(stageOf(add, "A8").executorRole, "nominator");
  assert.equal(stageOf(add, "A9").executorRole, "convener");
  for (const stage of ["A12a", "A12b"] as const) {
    const entry = stageOf(add, stage);
    assert.equal(entry.executor, "review", `${stage} 由应用直派验收（Q3）`);
    assert.equal(entry.executorRole, "review-role", `${stage} review 角色优先（缺省 verifier）`);
    assert.equal(entry.taskKind, "stage-execution");
    assert.equal(entry.completion, "task-accepted");
  }
  assert.equal(stageOf(add, "A12b").requiredEvidence.includes("acceptance-archive"), true, "A12b 完成需应用归档");
  // A12 聚合：无任务，A12b + 归档后完成。
  const a12 = stageOf(add, "A12");
  assert.equal(a12.executor, "application");
  assert.equal(a12.taskKind, "none");
  assert.equal(a12.completion, "aggregate-acceptance");
  // A13/B4：release-or-close + merge-main appOwned（客户本人；judge 不可代批由卡机制保证）。
  for (const [definition, stage] of [[add, "A13"], [modify, "B4"]] as const) {
    const entry = stageOf(definition, stage);
    assert.equal(entry.completion, "release-or-close", `${stage} 只能由 release.merged/workflow.closed 完成`);
    assert.equal(entry.card?.cardKind, "merge-main");
    assert.equal(entry.card?.appOwned, true);
    assert.deepEqual([...entry.card!.optionIds], ["approve", "reject"]);
    assert.equal(entry.retry.highRiskNoRedispatch, true);
    assert.equal(entry.retry.autoRetries, 0);
  }
  // A11/B3：worker-dispatch、高风险零自动重派、全部实现任务 accepted。
  for (const [definition, stage] of [[add, "A11"], [modify, "B3"]] as const) {
    const entry = stageOf(definition, stage);
    assert.equal(entry.executor, "worker-dispatch");
    assert.equal(entry.executorRole, "convener");
    assert.equal(entry.taskKind, "worker-dispatch");
    assert.equal(entry.sideEffect, "read-only");
    assert.equal(entry.completion, "all-tasks-accepted");
    assert.equal(entry.retry.highRiskNoRedispatch, true);
    assert.equal(entry.retry.autoRetries, 0);
    assert.equal(entry.requiredEvidence.includes("all-implementation-tasks-accepted"), true);
  }
  assert.equal(stageOf(modify, "B3").highRiskCard, "decision", "B3 高风险才出 decision 卡");

  // 三张客户确认卡：kind/documentKinds/选项/推荐集（Q1 幕僚按 prompt 呈卡）。
  const a3 = stageOf(add, "A3");
  assert.equal(a3.executor, "card-prompt");
  assert.equal(a3.taskKind, "card-prompt");
  assert.equal(a3.completion, "card-resolved");
  assert.equal(a3.card?.cardKind, "intent-confirm");
  assert.deepEqual([...a3.card!.documentKinds], ["intent"]);
  assert.deepEqual([...a3.card!.optionIds], ["confirm", "revise"]);
  assert.deepEqual([...a3.card!.recommended], ["confirm"]);
  const a6 = stageOf(add, "A6");
  assert.equal(a6.card?.cardKind, "proposal");
  assert.deepEqual([...a6.card!.documentKinds], ["proposal", "roster", "modules", "architecture"]);
  assert.deepEqual([...a6.card!.optionIds], ["accept", "accept-quick", "revise", "reject"]);
  assert.deepEqual([...a6.card!.recommended], ["accept"]);
  const a10 = stageOf(add, "A10");
  assert.equal(a10.card?.cardKind, "appointment");
  assert.deepEqual([...a10.card!.documentKinds], ["roster"]);
  assert.deepEqual([...a10.card!.optionIds], [], "任命卡选项由应用按名单生成");
  assert.deepEqual([...a10.card!.recommended], []);

  // A3/A6 返工边；A10 无返工。
  assert.equal(a3.reworkFallback, "A2");
  assert.equal(a6.reworkFallback, "A5");
  assert.equal(a10.reworkFallback, undefined);

  // Q8（2026-11-20 版本化）：默认每阶段 1 次自动重试；v2/v3 耗尽 ⇒ `route-block-resolver`（交应用路由，不再停住）；
  // v1 逐字保留 `blocked`（在飞 workflow 按旧定义解释，不静默迁移）；高风险零重派；应用派生/聚合无任务无重试。
  assert.equal(stageOf(add, "A2").retry.autoRetries, 1);
  assert.equal(stageOf(add, "A2").retry.onExhausted, "route-block-resolver");
  const addV1 = getWorkflowDefinition("add", 1);
  assert.equal(addV1.ok, true);
  if (addV1.ok) assert.equal(stageOf(addV1.definition, "A2").retry.onExhausted, "blocked");
  const modifyV1 = getWorkflowDefinition("modify", 1);
  assert.equal(modifyV1.ok, true);
  if (modifyV1.ok) {
    for (const entry of modifyV1.definition.stages) {
      assert.equal(entry.retry.onExhausted, "blocked", `v1 ${entry.stage} 必须逐字保留 blocked`);
    }
  }
  for (const entry of add.stages) {
    assert.equal(entry.retry.onExhausted, "route-block-resolver", `v3 ${entry.stage} 必须交 block resolver`);
  }
  assert.equal(a12.retry.autoRetries, 0);

  // B1：worker-dispatch 主路径 + 契约/结构缺口 rapporteur 回退（按定义解析）。
  const b1 = stageOf(modify, "B1");
  assert.equal(b1.taskKind, "worker-dispatch");
  assert.deepEqual(b1.fallbackExecutor, {
    executor: "built-in",
    executorRole: "rapporteur",
    condition: "contract-or-structure-gap",
  });
  // B2：应用确定性派生（无任务、不发请求；Q4）。
  const b2 = stageOf(modify, "B2");
  assert.equal(b2.executor, "application");
  assert.equal(b2.taskKind, "none");
  assert.equal(b2.completion, "scope-decided");
  assert.equal(b2.reworkFallback, "B1");
  assert.equal(b2.taskText.details.some((line) => line.includes("b-change-scope-invalid")), true);

  // 验收策略（Q2）：定义参数、默认 standard；轻量 blocked 按 accept-with-archive（B31）。
  assert.deepEqual([...ACCEPTANCE_STRENGTHS], ["light", "standard"]);
  for (const definition of listWorkflowDefinitions()) {
    assert.equal(definition.acceptance.defaultStrength, "standard");
    assert.equal(definition.acceptance.lightBlockedDisposition, "accept-with-archive");
    assert.equal(definition.acceptance.standardBlockedDisposition, "blocked");
  }

  // taskText 模板不得为空，且保留 B 系列安全语义要点（迁入定义时逐条保留）。
  for (const definition of listWorkflowDefinitions()) {
    for (const entry of definition.stages) {
      assert.equal(entry.taskText.summary.trim() === "", false);
      assert.equal(entry.taskText.details.length > 0, true);
    }
  }
  const a11Text = stageOf(add, "A11").taskText.details.join("\n");
  assert.match(a11Text, /B26/);
  assert.match(a11Text, /B27\/B28/);
  assert.match(a11Text, /B32/);
  const a12bText = stageOf(add, "A12b").taskText.details.join("\n");
  assert.match(a12bText, /B31/);
  assert.match(stageOf(add, "A5").taskText.details.join("\n"), /project-roster\/v4/);
  assert.match(stageOf(add, "A8").taskText.details.join("\n"), /activate_role_documents/);
  assert.match(stageOf(modify, "B2").taskText.details.join("\n"), /stage-request/, "B2 说明不再产生 stage-request（B34 死锁类根除）");

  // sideEffect：内容任务 docs；请求/卡任务 read-only；应用阶段 read-only。
  assert.equal(stageOf(add, "A1").sideEffect, "docs");
  assert.equal(a3.sideEffect, "read-only");
  assert.equal(a10.sideEffect, "read-only");
  assert.equal(stageOf(add, "A11").sideEffect, "read-only");
  assert.equal(stageOf(modify, "B1").sideEffect, "read-only");
});

// —————————————— 2026-11-20（SMOKE-2 S2）：定义 v3 任务文本与角色边界一致 ——————————————

test("S2 定义文本 v3：A2 只写 docs/product 且 docs/intents 由幕僚创建/核对（B24）；A3 呈卡前核对入口；v1/v2 逐字保留、hash 冻结", () => {
  // 1) v3（当前注册表）A2：根因修复——product 只写 docs/product；docs/intents 入口由幕僚（chief，唯一写者）
  //    在 A3 呈卡前创建/核对；product 写 docs/intents ⇒ 越界 fail-closed。
  const add = WORKFLOW_DEFINITIONS.add;
  const a2Text = [stageOf(add, "A2").taskText.summary, ...stageOf(add, "A2").taskText.details].join("\n");
  assert.match(a2Text, /docs\/product\/<flowId>-intent-vN\.md/, "v3 A2 必须给出 product 写区路径");
  assert.match(a2Text, /docs\/intents\/<intentId>\.md/, "v3 A2 必须写明 docs/intents 入口文件");
  assert.match(a2Text, /幕僚/, "v3 A2 必须写明 docs/intents 的唯一写者是幕僚（chief）");
  assert.match(a2Text, /B24/);
  assert.match(a2Text, /不得写 docs\/intents/, "v3 A2 必须 fail-closed 禁止 product 写 docs/intents");
  assert.match(a2Text, /path-outside-boundary/, "越界必须落到角色边界拒绝语义");
  assert.equal(a2Text.includes("同时写 docs/intents"), false, "v3 A2 不得再要求 product 同时写 docs/intents（SMOKE-2 根因）");
  // 2) v3 A3：幕僚呈卡前创建/核对入口（B24；应用校验入口与 intent 一致）。
  const a3Text = [stageOf(add, "A3").taskText.summary, ...stageOf(add, "A3").taskText.details].join("\n");
  assert.match(a3Text, /docs\/intents\/<intentId>\.md/, "v3 A3 必须写明意图入口文件");
  assert.match(a3Text, /幕僚/, "v3 A3 必须写明由幕僚创建/核对入口");
  assert.match(a3Text, /B24/);
  assert.match(a3Text, /呈卡前|呈卡/, "v3 A3 入口核对必须在呈卡前");
  // 呈卡/回传/裁决语义逐字保留（v3 只在 details 追加入口一行，其余文本不变）。
  assert.match(a3Text, /request_choice/);
  assert.match(a3Text, /card-prompt-mismatch/);
  assert.match(a3Text, /finalizeIntent/);

  // 3) v1/v2 逐字保留：v2 A2 仍保留旧 docs/intents 要求（证明 v2 未被静默修改给在飞 workflow）。
  const ADD_A2_TEXT_V2 = {
    summary: "撰写产品意图意图文件与意图入口",
    details: [
      "产出 docs/product/<flowId>-intent-vN.md（frontmatter schema=project-intent/v1，version 与文件名一致）",
      "同时写 docs/intents/<intentId>.md 入口（B24：呈 A3 卡前应用校验入口）",
      "报告后由应用重算字节 SHA-256 并收口；hash/入口缺失 ⇒ 不收口",
    ],
  } as const;
  const ADD_A3_TEXT_V2 = {
    summary: "按应用 prompt 呈意图确认卡（intent-confirm）",
    details: [
      "应用计算 documentRefs[intent]（path+version+sha256）并发放 promptId",
      "幕僚以 request_choice 原样回传 promptId/cardKind/选项/documentRefs；不一致 ⇒ card-prompt-mismatch（不发卡）",
      "confirm ⇒ 应用 finalizeIntent 完成 A3；revise ⇒ stage.reworked A3→A2；卡属 decision 组（judge 代批语义不变）",
    ],
  } as const;
  for (const version of [1, 2] as const) {
    const def = getWorkflowDefinition("add", version);
    assert.equal(def.ok, true);
    if (!def.ok) continue;
    assert.deepEqual(stageOf(def.definition, "A2").taskText, ADD_A2_TEXT_V2, `add v${version} A2 文本必须逐字保留（旧 docs/intents 要求）`);
    assert.deepEqual(stageOf(def.definition, "A3").taskText, ADD_A3_TEXT_V2, `add v${version} A3 文本必须逐字保留`);
    assert.notDeepEqual(stageOf(def.definition, "A2").taskText, stageOf(add, "A2").taskText, "v3 不得回写旧版本");
  }
  // 版本语义：v1 必须 blocked；v2/v3 必须 route-block-resolver；注册表自检零错误。
  const v1 = getWorkflowDefinition("add", 1);
  const v2 = getWorkflowDefinition("add", 2);
  if (v1.ok) assert.equal(v1.definition.stages.every((entry) => entry.retry.onExhausted === "blocked"), true);
  for (const def of [v2, getWorkflowDefinition("add", 3)] as const) {
    if (def.ok) assert.equal(def.definition.stages.every((entry) => entry.retry.onExhausted === "route-block-resolver"), true);
  }
  assert.deepEqual(validateWorkflowDefinitions(), []);

  // 4) 定义 hash 冻结（记录 §二表格值；canonical JSON SHA-256）——v1/v2 在飞对账依据、v3 新 select。
  const FROZEN_HASHES = {
    add: {
      1: "ef7720c112c76c8d77882118af8a331b06c16aa634246aa263b0a8ce871ecbee",
      2: "9718975bc34780b4ea0be49f99890388ff21a36b87455d023392fd088b72a1e2",
      3: "c9e87ad6772a2d61149c5d1e006c58b01c2c653781f41ab409a7d167406f3d08",
    },
    modify: {
      1: "4bea23eb0b1c00c849aff0990aefefa0b045759bdbea1331ff2f932540594bb6",
      2: "41bbe743738569defa85e2295744c56545cf8d9f97c679a7025c1cfe25968445",
      3: "4ac0513401bab5a9a8f95bf157fb4cb4baffeb2975ecbf114f6b40a02aa9e539",
    },
  } as const;
  for (const id of WORKFLOW_DEFINITION_IDS) {
    for (const version of [1, 2, 3] as const) {
      const expected = FROZEN_HASHES[id][version];
      assert.equal(WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][version], expected, `${id} v${version} 逐版本 hash 冻结`);
      const lookup = getWorkflowDefinition(id, version);
      assert.equal(lookup.ok, true);
      if (lookup.ok) assert.equal(lookup.hash, expected, `${id} v${version} 解析 hash = 冻结值（无静默迁移）`);
    }
    assert.equal(WORKFLOW_DEFINITION_HASHES[id], FROZEN_HASHES[id][3], `${id} 当前 hash = v3 冻结值`);
  }
});
