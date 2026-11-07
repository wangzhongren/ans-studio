// test/roles/product/product-differential.test.ts
// product 模块差分测试（E1；B1 E1.7 / 契约 §7.3「E1 过渡期权威 = 旧引擎 oracle」）。
//
// **测试专用 oracle import（只读，不修改旧引擎）**：
//  - `src/common/门禁引擎/governance-roles.ts`：旧 product 规格（卡/条目/预授权/禁写/capabilities）；
//  - `src/common/门禁引擎/role-tool-registry.ts`：D1 唯一装配表（id→name→允许角色）；
//  - `src/common/编排/workflow-preconditions.ts`：旧硬授权谓词 + 报告目标（编排稳定公开只读入口）；
//  - `src/pipeline/orchestration/run-role.ts`：私有 `TRIO_CARD_KINDS` 的**源码文本**提取（D8 卡种；
//    该常量未导出，测试只读文本、不 import 私有值，不构成第二份生产来源）。
// 这些 import 只出现在测试中；`src/common/roles/product/` 的生产模块零引擎 import。
//
// 差分口径：同一 fixture 下，module 输出 vs 旧 oracle 逐字段（allow/deny、reportToRoleId、规格数据）。
// 允许的差异必须带编号（D-DISP-*/D-PRE-*），并在 evidence 中列明；无编号 = 零差异。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { RoleDispatchPolicyInput, RoleToolId } from "../../../src/model/role.ts";
import { VERSION_CHANGE_INITIATOR_BY_KIND } from "../../../src/model/version-change.ts";
import { productRoleModule } from "../../../src/common/roles/product/index.ts";
// 测试专用 oracle（只读；旧引擎在 E2 切换前仍是权威）。
import { governanceRoleOf } from "../../../src/common/门禁引擎/governance-roles.ts";
import {
  ROLE_TOOL_CATALOG,
  roleToolCatalogEntryOf,
  validateRoleToolDeclaration,
} from "../../../src/common/门禁引擎/role-tool-registry.ts";
import {
  evaluateDispatchAuthorization,
  reportTargetForTaskCreator,
} from "../../../src/common/编排/workflow-preconditions.ts";
import {
  DISPATCH_FIXTURES,
  PREFLIGHT_FIXTURES,
  VALID_VERSION_UPGRADE_FACTS,
  type PreflightFacts,
} from "./fixtures/product-differential-fixtures.ts";

// —————————————————————— 规格数据：逐字段对照旧注册表 ——————————————————————

test("差分：card/displayName/function/capabilities 与旧 product 规格逐字段一致（差异=0）", () => {
  const oracle = governanceRoleOf("product");
  assert.ok(oracle !== undefined, "旧注册表必须存在 product 规格（E1 过渡期权威）");

  assert.equal(productRoleModule.id, oracle.id);
  assert.equal(productRoleModule.displayName, oracle.displayName);
  assert.equal(productRoleModule.function, oracle.function);

  assert.equal(productRoleModule.card.text, oracle.cardText);
  assert.deepEqual([...productRoleModule.card.entries], [...oracle.entries]);
  assert.deepEqual(
    [...productRoleModule.card.preauthorizedDirs],
    [...oracle.preauthorizedDirs],
  );
  assert.deepEqual(
    [...productRoleModule.card.forbiddenWritePaths],
    [...oracle.forbiddenWritePaths],
  );
  assert.deepEqual({ ...productRoleModule.capabilities }, { ...oracle.capabilities });
});

test("差分（D8）：cards 与旧私有 TRIO_CARD_KINDS.product 一致（源码文本提取 oracle）", () => {
  const source = readFileSync(
    new URL("../../../src/pipeline/orchestration/run-role.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const TRIO_CARD_KINDS");
  assert.ok(start >= 0, "run-role.ts 必须包含 TRIO_CARD_KINDS");
  const end = source.indexOf("\n};", start);
  assert.ok(end > start, "TRIO_CARD_KINDS 块必须可定位");
  const block = source.slice(start, end);
  const productRow = /(^|\n)\s*product:\s*\[([^\]]*)\]/.exec(block);
  assert.ok(productRow !== null, "TRIO_CARD_KINDS 必须包含 product 行");

  const oracleCards = (productRow[2] ?? "")
    .split(",")
    .map((token) => token.trim().replace(/^["']|["']$/g, ""))
    .filter((token) => token !== "");
  assert.deepEqual([...productRoleModule.cards], oracleCards);
  assert.deepEqual([...productRoleModule.cards], []);
});

// —————————————————————— tools：D1 装配表 + 旧 run-role 门控 ——————————————————————

test("差分：tools() trio 与旧 run-role 注入门控一致；D1 装配表整单放行且映射正确", () => {
  const trio = productRoleModule.tools({ governanceModel: "trio" });
  // 旧门控：`setup.role.id === "product" || setup.role.id === "rapporteur" ? input.submitVersionChange : undefined`。
  assert.deepEqual([...trio.tools], ["submitVersionChange"]);
  assert.equal(trio.capabilities, productRoleModule.capabilities);

  assert.deepEqual(validateRoleToolDeclaration("product", [...trio.tools]), {
    allow: true,
    tools: [{ id: "submitVersionChange", name: "submit_version_change" }],
    reasons: [],
  });
  assert.equal(roleToolCatalogEntryOf("submitVersionChange")?.name, "submit_version_change");

  // single：不装配 trio 角色专属工具（Model TrustedToolPolicyInput 注释）。
  assert.deepEqual([...productRoleModule.tools({ governanceModel: "single" }).tools], []);
});

test("差分（D1）：product 对每个未授权 catalog id 声明均整单拒绝（越权 fail-closed）", () => {
  for (const entry of ROLE_TOOL_CATALOG) {
    const allowed = entry.allowedRoleIds.includes("product");
    const validation = validateRoleToolDeclaration("product", [entry.id]);
    assert.equal(validation.allow, allowed, `product/${entry.id}`);
    if (!allowed) {
      assert.deepEqual(validation.tools, []);
      assert.deepEqual(
        validation.reasons.map((reason) => reason.code),
        ["role-tool-not-allowed"],
      );
    }
  }
  // 未知 id（snake_case/闭集外）不注入、不静默忽略。
  for (const unknown of ["submit_version_change", "dispatch_task", "notATool"]) {
    const validation = validateRoleToolDeclaration("product", [unknown]);
    assert.equal(validation.allow, false);
    assert.deepEqual(validation.tools, []);
  }
  // 模块声明的每个 id 都必须是 RoleToolId（类型层已约束；运行期再断言属于 product 允许集）。
  for (const id of productRoleModule.tools({ governanceModel: "trio" }).tools as readonly RoleToolId[]) {
    assert.equal(roleToolCatalogEntryOf(id)?.allowedRoleIds.includes("product"), true);
  }
});

// —————————————————————— dispatch：旧硬授权谓词差分 ——————————————————————

function oldDispatch(input: RoleDispatchPolicyInput) {
  return evaluateDispatchAuthorization({
    fromRoleId: input.sourceRoleId ?? "",
    targetRoleId: input.targetRoleId,
    targetBuiltIn: input.targetKind === "built-in-governance",
    targetExists: input.targetExists === true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
  });
}

test("差分（dispatch）：product 相关夹具 allow/deny 与旧谓词一致；差异按编号列明", () => {
  for (const fixture of DISPATCH_FIXTURES) {
    const actual = productRoleModule.dispatch(fixture.input);
    const old = oldDispatch(fixture.input);

    assert.equal(
      actual.decision.allow,
      fixture.expected.allow,
      `${fixture.id}: module allow`,
    );
    if (actual.decision.allow === false && fixture.expected.code !== undefined) {
      assert.equal(actual.decision.allow === false ? actual.decision.code : "", fixture.expected.code, fixture.id);
      assert.equal(actual.reportToRoleId, undefined, `${fixture.id}: deny 不返回报告期望`);
    }
    if (actual.decision.allow) {
      assert.equal(actual.reportToRoleId, fixture.expected.reportToRoleId, fixture.id);
      // 报告期望 = 旧 oracle 的期望创建者（sourceRoleId ≈ creator）。
      const expectedCreator = reportTargetForTaskCreator({
        creator: fixture.input.sourceRoleId as "chief" | "convener",
        chiefRoleId: "chief",
        convenerRoleId: "convener",
      });
      assert.equal(actual.reportToRoleId, expectedCreator, fixture.id);
    }

    if (fixture.difference === undefined) {
      assert.equal(old.ok, fixture.expected.allow, `${fixture.id}: 应零差异`);
    } else {
      assert.notEqual(old.ok, fixture.expected.allow, `${fixture.id}: 差异 ${fixture.difference} 应被列明`);
    }
  }
});

test("差分（dispatch）：拒绝结果始终带稳定 code/messageKey，且不返回 reportToRoleId", () => {
  for (const input of [
    { sourceRoleId: "convener", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: "product", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance" },
  ] as const) {
    const result = productRoleModule.dispatch(input);
    assert.equal(result.decision.allow, false);
    if (result.decision.allow === false) {
      assert.equal(typeof result.decision.code, "string");
      assert.equal(typeof result.decision.messageKey, "string");
      assert.match(result.decision.messageKey, /^role\.product\.dispatch\./);
    }
    assert.equal(result.reportToRoleId, undefined);
  }
});

// —————————————————————— preflight：旧 VCA/trunk 角色侧条件镜像差分 ——————————————————————

/**
 * 旧角色侧条件镜像（测试 oracle；逐条对应旧实现，不复制进生产模块）：
 *  - `VERSION_CHANGE_INITIATOR_BY_KIND`（`src/model/version-change.ts`）角色映射；
 *  - `version-change-runtime.ts::submitDirect` / `apply-journal.ts::prepareDirectSubmission`
 *    （operationId 非空、baseTrunk 显式、每目标 expectedFromSha256）；
 *  - `vca-service.ts::validateBaseTrunk`（baseTrunk null ⇔ bootstrap）；
 *  - `vca-service.ts::validateAmendmentRefs`（version-upgrade 不得引用修正案/items）。
 * 不镜像 Service 的 hash/结构/权限/版本链/当前 trunk 全等校验（preflight 不复制最终校验）。
 */
function oldRoleSideVcaAllows(facts: PreflightFacts): boolean {
  const kind = facts["kind"];
  const expectedRole =
    kind === "version-upgrade" || kind === "detail-amendment"
      ? VERSION_CHANGE_INITIATOR_BY_KIND[kind]
      : undefined;
  if (expectedRole === undefined || facts["initiatorRoleId"] !== expectedRole) return false;

  if (typeof facts["operationId"] !== "string" || facts["operationId"].trim() === "") return false;
  if (!Object.hasOwn(facts, "baseTrunk") || facts["baseTrunk"] === undefined) return false;

  const bootstrap = facts["bootstrap"] === true;
  if (facts["baseTrunk"] === null) {
    if (!bootstrap) return false;
  } else if (bootstrap) {
    return false;
  }

  if (
    kind === "version-upgrade"
    && (facts["amendmentId"] !== undefined
      || facts["amendmentDocPath"] !== undefined
      || facts["amendmentItems"] !== undefined)
  ) {
    return false;
  }

  const targets = facts["targets"];
  if (!Array.isArray(targets)) return false;
  for (const target of targets) {
    if (
      target === null
      || typeof target !== "object"
      || !Object.hasOwn(target, "expectedFromSha256")
    ) {
      return false;
    }
  }
  return true;
}

test("差分（preflight）：version-upgrade 角色侧条件与旧 VCA/trunk 镜像一致；差异按编号列明", () => {
  for (const fixture of PREFLIGHT_FIXTURES) {
    const actual = productRoleModule.preflight?.checkAction({
      action: "version-upgrade",
      facts: fixture.facts,
    });
    assert.ok(actual !== undefined, "product 模块必须提供 preflight");
    assert.equal(actual.allow, fixture.expected.allow, `${fixture.id}: module allow`);
    if (actual.allow === false && fixture.expected.code !== undefined) {
      assert.equal(actual.code, fixture.expected.code, fixture.id);
      assert.equal(typeof actual.messageKey, "string");
      assert.match(actual.messageKey, /^role\.product\.preflight\./);
    }

    const oldAllows = oldRoleSideVcaAllows(fixture.facts);
    if (fixture.difference === undefined) {
      assert.equal(oldAllows, fixture.expected.allow, `${fixture.id}: 应零差异`);
    } else {
      assert.notEqual(oldAllows, fixture.expected.allow, `${fixture.id}: 差异 ${fixture.difference} 应被列明`);
    }
  }
});

test("差分（preflight）：合法基线事实确实允许（正例锚点），并保持 JSON 可序列化 details", () => {
  const actual = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: VALID_VERSION_UPGRADE_FACTS,
  });
  assert.deepEqual(actual, { allow: true });

  const denied = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: { ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: "rapporteur" },
  });
  assert.ok(denied !== undefined && denied.allow === false);
  if (denied !== undefined && denied.allow === false) {
    assert.equal(JSON.parse(JSON.stringify(denied.details)) !== undefined, true);
  }
});
