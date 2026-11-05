// 门禁引擎测试：治理权力矩阵 C1a 共享 Model 与注册表展示字段
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as matrixModel from "../../src/model/governance-matrix.ts";
import type {
  MatrixField,
  MatrixForce,
  MatrixRequestChannel,
  MatrixRoleDirectories,
  MatrixUnknownReason,
} from "../../src/model/governance-matrix.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  ROLE_CARD_REQUIRED_SECTIONS,
} from "../../src/common/门禁引擎/governance-roles.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Model：schema 常量与冻结导出面（无构建器/seam 运行时导出）", () => {
  assert.equal(matrixModel.GOVERNANCE_MATRIX_SCHEMA, "governance-matrix/v1");
  assert.deepEqual(Object.keys(matrixModel).sort(), ["GOVERNANCE_MATRIX_SCHEMA"]);
  const exported = matrixModel as unknown as Record<string, unknown>;
  assert.equal("buildGovernanceMatrix" in exported, false);
  assert.equal("buildGovernanceMatrixWith" in exported, false, "Model 不得导出 C1b 测试 seam");
  assert.equal("renderGovernanceMatrix" in exported, false);
});

test("Model：registry-unavailable 保留为契约成员（G-5b；生产不使用）", () => {
  const reason: MatrixUnknownReason = "registry-unavailable";
  assert.equal(reason, "registry-unavailable");
  // 其余 P1.1 基线成员仍可用（编译期 + 运行期）。
  const reasons: MatrixUnknownReason[] = [
    "role-card-missing",
    "boundary-missing",
    "boundary-parse-error",
    "card-section-missing",
    "not-declared-in-source",
    "acceptance-unavailable",
    "role-enumeration-failed",
    "registry-unavailable",
  ];
  assert.equal(reasons.length, 8);
});

test("Model：MatrixField/MatrixForce/MatrixRoleDirectories 加法形状可构造", () => {
  const known: MatrixField<string> = { state: "known", value: "x", source: "builtin-registry" };
  const unknown: MatrixField<string> = {
    state: "unknown",
    reason: "card-section-missing",
    detail: "缺执行原则",
    source: "role-card",
  };
  assert.equal(known.state, "known");
  assert.equal(unknown.state, "unknown");

  const force: MatrixForce = {
    hardDeny: { items: [], source: "app-rule", note: "Section 1 之外只读" },
    permitConditions: { items: ["stable 许可"], source: "app-rule", note: "条件" },
    conventions: {
      items: [],
      source: "role-card",
      note: "缺节",
      unknownReason: "card-section-missing",
    },
  };
  assert.equal(force.conventions.unknownReason, "card-section-missing");

  const dirs: MatrixRoleDirectories = {
    found: false,
    totalDirs: 0,
    archivedSkips: 0,
    error: "项目根不可读",
  };
  assert.equal(dirs.error, "项目根不可读");
});

test("Model：MatrixRequestChannel 三分量来源语义（内置 registry-capability / worker app-rule）", () => {
  const builtinChannel: MatrixRequestChannel = {
    roleLevel: { value: true, source: "registry-capability" },
    cardKinds: { items: ["intent-confirm"], source: "app-rule" },
    session: { state: "available", source: "session-snapshot", note: "本会话注入" },
  };
  const workerChannel: MatrixRequestChannel = {
    roleLevel: { value: false, source: "app-rule" },
    cardKinds: { items: [], source: "app-rule" },
    session: { state: "unavailable", source: "session-snapshot", note: "worker 不注入" },
  };
  assert.equal(builtinChannel.roleLevel.source, "registry-capability");
  assert.equal(workerChannel.roleLevel.source, "app-rule");
  assert.equal(builtinChannel.cardKinds.source, "app-rule");
  assert.equal(builtinChannel.session.source, "session-snapshot");
  assert.equal(workerChannel.session.state, "unavailable");
});

test("Model：无 I/O、不依赖运行层（源码静态检查）", () => {
  const sourcePath = resolve(REPO_ROOT, "src", "model", "governance-matrix.ts");
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /from\s+["']node:/, "Model 不得导入 node 内建模块");
  assert.doesNotMatch(
    source,
    /from\s+["']\.\.\/(service|pipeline|provider|interface)\//,
    "Model 不得依赖运行层",
  );
  assert.doesNotMatch(source, /node:fs|readFile|writeFile/, "Model 不得含 I/O");
});

test("注册表：六角色矩阵展示字段非空、只读且不进入能力位", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((spec) => spec.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(typeof spec.matrix.duty, "string", `${spec.id} duty 必须是字符串`);
    assert.ok(spec.matrix.duty.trim().length > 0, `${spec.id} duty 不得为空`);
    assert.ok(spec.matrix.mainChain.length > 0, `${spec.id} mainChain 不得为空`);
    for (const line of spec.matrix.mainChain) {
      assert.ok(line.trim().length > 0, `${spec.id} mainChain 条目不得为空`);
    }
    if (spec.matrix.cardDiscipline !== undefined) {
      assert.ok(spec.matrix.cardDiscipline.length > 0, `${spec.id} cardDiscipline 不得为空数组`);
      for (const line of spec.matrix.cardDiscipline) {
        assert.ok(line.trim().length > 0, `${spec.id} cardDiscipline 条目不得为空`);
      }
    }
    if (spec.matrix.dispatchScope !== undefined) {
      assert.ok(spec.matrix.dispatchScope.trim().length > 0, `${spec.id} dispatchScope 不得为空`);
    }
    // 展示字段只读、不进入能力位（AC-3/AC-10 的注册表面守卫）。
    assert.equal(
      Object.prototype.hasOwnProperty.call(spec.capabilities, "matrix"),
      false,
      `${spec.id} matrix 不得成为能力位`,
    );
    // 既有权限面仍在且非空（具体值由既有治理测试逐字钉住；本测试只防误删）。
    assert.ok(spec.entries.length > 0, `${spec.id} entries 不得为空`);
    assert.ok(Array.isArray(spec.preauthorizedDirs), `${spec.id} preauthorizedDirs 必须是数组`);
    assert.ok(spec.forbiddenWritePaths.length > 0, `${spec.id} forbiddenWritePaths 不得为空`);
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} shell 档位不得变化`);
  }
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((spec) => spec.id === "chief")?.capabilities.dispatchTask, true);
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((spec) => spec.id === "convener")?.capabilities.dispatchTask, true);
  for (const id of ["product", "rapporteur", "nominator", "verifier"] as const) {
    assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((spec) => spec.id === id)?.capabilities.dispatchTask, false);
  }
});

test("注册表：ROLE_CARD_REQUIRED_SECTIONS 仍含解析器使用的五个 label（单一来源）", () => {
  const labels = ROLE_CARD_REQUIRED_SECTIONS.map((section) => section.label);
  for (const label of ["能力描述", "职责与功能导航", "交接输入输出", "标准工作流", "执行原则"]) {
    assert.ok(labels.includes(label), `ROLE_CARD_REQUIRED_SECTIONS 缺少 label：${label}`);
  }
});
