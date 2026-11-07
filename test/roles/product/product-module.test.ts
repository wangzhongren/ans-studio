// test/roles/product/product-module.test.ts
// product 角色模块单元测试（E1；B1 E1.1–E1.7；E0.3 §3.1–§3.5）。
//
// 本文件只 import：
//  - 模块唯一 public entry `src/common/roles/product/index.ts`（不深导 internal）；
//  - Model 类型（src/model/role.ts）；
//  - Node 内置（test/assert/fs）用于纯数据与模块图/import 扫描。
// 旧引擎 oracle 的差分在 `product-differential.test.ts`（测试专用、已注明）。

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { RoleDispatchPolicyInput, RolePreflightInput } from "../../../src/model/role.ts";
import { productRoleModule } from "../../../src/common/roles/product/index.ts";
import {
  OUT_OF_SCOPE_ACTIONS,
  VALID_VERSION_UPGRADE_FACTS,
} from "./fixtures/product-differential-fixtures.ts";

const MODULE_DIR = new URL("../../../src/common/roles/product/", import.meta.url);
const MODULE_DIR_PATH = fileURLToPath(MODULE_DIR);

// —————————————————————— 规格数据（card/capabilities/cards）——————————————————————

test("规格：id/displayName/function 与 E0.3 §3.2 product 行一致", () => {
  assert.equal(productRoleModule.id, "product");
  assert.equal(productRoleModule.displayName, "产品");
  assert.equal(productRoleModule.function, "product");
});

test("规格：card 文本/条目/预授权/禁写逐项固定（迁移前旧规格的冻结副本）", () => {
  const card = productRoleModule.card;
  assert.equal(card.text.startsWith("# 角色：产品（内置角色）\n"), true);
  assert.equal(card.text.includes("产品取舍、产品评审、产品文档"), true);
  assert.equal(card.text.includes("submit_version_change(kind=version-upgrade)"), true);
  assert.equal(card.text.endsWith("docs/skills/**`、`docs/mcp/**`。"), true);

  assert.deepEqual([...card.entries], [
    {
      root: "project",
      path: "docs/product/",
      kind: "directory",
      purpose: "产品取舍 / 产品评审 / 产品文档（D 批目标写区）",
    },
  ]);
  assert.deepEqual([...card.preauthorizedDirs], ["docs/product/"]);
  assert.deepEqual([...card.forbiddenWritePaths], [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/contracts/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/",
    "docs/workflow.md",
  ]);
});

test("规格：capabilities 七字段固定；cards 为空（D8，无 governance 卡）", () => {
  assert.deepEqual({ ...productRoleModule.capabilities }, {
    customerInput: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  assert.deepEqual([...productRoleModule.cards], []);
});

test("规格：模块与嵌套数据冻结（无可变状态），且不携带权限字段", () => {
  assert.equal(Object.isFrozen(productRoleModule), true);
  assert.equal(Object.isFrozen(productRoleModule.card), true);
  assert.equal(Object.isFrozen(productRoleModule.card.entries), true);
  assert.equal(Object.isFrozen(productRoleModule.card.preauthorizedDirs), true);
  assert.equal(Object.isFrozen(productRoleModule.card.forbiddenWritePaths), true);
  assert.equal(Object.isFrozen(productRoleModule.capabilities), true);
  assert.equal(Object.isFrozen(productRoleModule.cards), true);
  for (const forbidden of ["allowed", "authorized", "approved", "grant", "permission"]) {
    assert.equal(forbidden in productRoleModule, false);
  }
});

// —————————————————————— tools() ——————————————————————

test("tools()：trio 只声明 submitVersionChange；capabilities 同引用（D10）", () => {
  const policy = productRoleModule.tools({ governanceModel: "trio" });
  assert.deepEqual([...policy.tools], ["submitVersionChange"]);
  assert.equal(policy.capabilities, productRoleModule.capabilities);
  assert.deepEqual([...policy.reasons], []);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.tools), true);
});

test("tools()：single 不装配 trio 角色工具；运行期未知模型 fail-closed（空表 + reason）", () => {
  assert.deepEqual([...productRoleModule.tools({ governanceModel: "single" }).tools], []);
  const unknown = productRoleModule.tools({ governanceModel: "weird" } as never);
  assert.deepEqual([...unknown.tools], []);
  assert.equal(unknown.reasons.length, 1);
  assert.equal(unknown.reasons[0]?.code, "role-tools-model-unknown");
  assert.equal(unknown.reasons[0]?.messageKey, "role.product.tools.modelUnknown");
});

// —————————————————————— dispatch()（R-2 硬身份/存在性）——————————————————————

function dispatch(input: RoleDispatchPolicyInput) {
  return productRoleModule.dispatch(input);
}

test("dispatch()：chief→product（内置、存在）允许，报告期望=chief；deny 不返回报告期望", () => {
  const allowed = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(allowed, { decision: { allow: true }, reportToRoleId: "chief" });

  const denied = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(denied.decision.allow, false);
  assert.equal(denied.decision.allow === false ? denied.decision.code : "", "convener-target-forbidden");
  assert.equal(denied.reportToRoleId, undefined);
});

test("dispatch()：来源/目标硬身份负例（self/unknown/chief-to-project/target-missing）", () => {
  const self = dispatch({
    sourceRoleId: "product",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(self.decision.allow === false ? self.decision.code : "", "self-dispatch");

  const productSource = dispatch({
    sourceRoleId: "product",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(productSource.decision.allow === false ? productSource.decision.code : "", "unknown-source");

  const foreignSource = dispatch({
    sourceRoleId: "rapporteur",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(foreignSource.decision.allow === false ? foreignSource.decision.code : "", "unknown-source");

  const missingSource = dispatch({
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(missingSource.decision.allow === false ? missingSource.decision.code : "", "unknown-source");

  const chiefToProject = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(
    chiefToProject.decision.allow === false ? chiefToProject.decision.code : "",
    "chief-to-project-forbidden",
  );

  const targetMissing = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: false,
  });
  assert.equal(targetMissing.decision.allow === false ? targetMissing.decision.code : "", "target-card-missing");
  assert.equal(targetMissing.reportToRoleId, undefined);
});

test("dispatch()：非 product 目标不在模块范围；畸形输入 fail-closed", () => {
  const outOfScope = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "rapporteur",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(
    outOfScope.decision.allow === false ? outOfScope.decision.code : "",
    "dispatch-not-in-module-scope",
  );

  for (const input of [
    { targetRoleId: "", targetKind: "built-in-governance" },
    { sourceRoleId: "", targetRoleId: "product", targetKind: "built-in-governance" },
    { sourceRoleId: "chief", targetRoleId: "product", targetKind: "worker" },
    { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: "yes" },
  ] as unknown as RoleDispatchPolicyInput[]) {
    const result = dispatch(input);
    assert.equal(result.decision.allow, false);
    assert.equal(result.decision.allow === false ? result.decision.code : "", "dispatch-input-invalid");
  }
});

test("dispatch()：拒绝带稳定 code + i18n key；不修改冻结输入", () => {
  const input = Object.freeze({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance" as const,
    targetExists: true,
  });
  const before = JSON.stringify(input);
  const result = dispatch(input);
  assert.equal(result.decision.allow, false);
  if (result.decision.allow === false) {
    assert.match(result.decision.code, /^[a-z][a-z0-9-]*$/);
    assert.match(result.decision.messageKey, /^role\.product\.dispatch\.[A-Za-z]+$/);
  }
  assert.equal(JSON.stringify(input), before);
});

// —————————————————————— preflight（version-upgrade 提交前置）——————————————————————

function check(facts: Readonly<Record<string, unknown>>, action: RolePreflightInput["action"] = "version-upgrade") {
  const preflight = productRoleModule.preflight;
  assert.ok(preflight !== undefined);
  return preflight.checkAction({ action, facts });
}

test("preflight：只覆盖 version-upgrade；其他动作 action-not-covered", () => {
  for (const action of OUT_OF_SCOPE_ACTIONS) {
    const result = check({}, action);
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.code, "action-not-covered");
      assert.equal(result.messageKey, "role.product.preflight.actionNotCovered");
    }
  }
});

test("preflight：合法直接提交/首建 bootstrap 均为 allow", () => {
  assert.deepEqual(check(VALID_VERSION_UPGRADE_FACTS), { allow: true });
  assert.deepEqual(
    check({
      initiatorRoleId: "product",
      kind: "version-upgrade",
      operationId: "op-bootstrap-1",
      baseTrunk: null,
      bootstrap: true,
      targets: [{ expectedFromSha256: null }],
    }),
    { allow: true },
  );
});

test("preflight：缺键/未知键/类型不符 fail-closed", () => {
  for (const key of ["initiatorRoleId", "kind", "operationId", "baseTrunk", "targets"]) {
    const facts: Record<string, unknown> = { ...VALID_VERSION_UPGRADE_FACTS };
    delete facts[key];
    const result = check(facts);
    assert.equal(result.allow, false, `missing ${key}`);
    if (result.allow === false) {
      assert.equal(result.code, "product-facts-missing", key);
      assert.deepEqual((result.details as { factKey?: string }).factKey, key);
    }
  }

  const unknown = check({ ...VALID_VERSION_UPGRADE_FACTS, flowId: "f1" });
  assert.equal(unknown.allow === false ? unknown.code : "", "product-facts-unknown-key");

  const wrongType = check({ ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: 42 });
  assert.equal(wrongType.allow === false ? wrongType.code : "", "product-facts-invalid");

  const nonObject = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: null as unknown as Readonly<Record<string, unknown>>,
  });
  assert.equal(nonObject?.allow, false);
  assert.equal(nonObject?.allow === false ? nonObject.code : "", "product-facts-invalid");
});

test("preflight：角色/kind/修正案引用负例", () => {
  const wrongRole = check({ ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: "rapporteur" });
  assert.equal(wrongRole.allow === false ? wrongRole.code : "", "product-initiator-mismatch");

  const wrongKind = check({ ...VALID_VERSION_UPGRADE_FACTS, kind: "detail-amendment" });
  assert.equal(wrongKind.allow === false ? wrongKind.code : "", "product-kind-mismatch");

  for (const extra of [
    { amendmentId: "am-1" },
    { amendmentDocPath: "docs/proposals/f1-amendment-v1.md" },
    { amendmentItems: [] },
  ]) {
    const result = check({ ...VALID_VERSION_UPGRADE_FACTS, ...extra });
    assert.equal(result.allow === false ? result.code : "", "product-amendment-ref-forbidden");
  }
});

test("preflight：operationId/baseTrunk/bootstrap/targets 形状负例", () => {
  assert.equal(
    check({ ...VALID_VERSION_UPGRADE_FACTS, operationId: "   " }).allow === false
      ? (check({ ...VALID_VERSION_UPGRADE_FACTS, operationId: "   " }) as { code: string }).code
      : "",
    "product-operation-id-missing",
  );

  const nullBaseNoBootstrap = check({ ...VALID_VERSION_UPGRADE_FACTS, baseTrunk: null });
  assert.equal(
    nullBaseNoBootstrap.allow === false ? nullBaseNoBootstrap.code : "",
    "product-bootstrap-mismatch",
  );

  const bootstrapWithObject = check({ ...VALID_VERSION_UPGRADE_FACTS, bootstrap: true });
  assert.equal(
    bootstrapWithObject.allow === false ? bootstrapWithObject.code : "",
    "product-bootstrap-mismatch",
  );

  for (const baseTrunk of [
    { version: 0, digest: "a".repeat(64) },
    { version: 1, digest: "" },
    { version: "1", digest: "a".repeat(64) },
    [],
    "base",
  ]) {
    const result = check({ ...VALID_VERSION_UPGRADE_FACTS, baseTrunk });
    assert.equal(result.allow === false ? result.code : "", "product-base-trunk-invalid");
  }

  for (const targets of [
    [],
    [{}],
    [{ expectedFromSha256: 42 }],
    "not-array",
  ]) {
    const result = check({ ...VALID_VERSION_UPGRADE_FACTS, targets });
    assert.equal(result.allow === false ? result.code : "", "product-targets-invalid");
  }
});

test("preflight：details 只含普通可序列化数据；不修改冻结输入", () => {
  const input = Object.freeze({
    action: "version-upgrade" as const,
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS }),
  });
  const before = JSON.stringify(input);
  const result = productRoleModule.preflight?.checkAction(input);
  assert.deepEqual(result, { allow: true });
  assert.equal(JSON.stringify(input), before);

  const denied = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: { ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: "rapporteur" },
  });
  assert.ok(denied !== undefined && denied.allow === false);
  if (denied !== undefined && denied.allow === false) {
    const roundTrip = JSON.parse(JSON.stringify(denied.details));
    assert.equal(roundTrip.roleId, "product");
    assert.equal(roundTrip.action, "version-upgrade");
  }
});

// —————————————————————— context()（产品上下文/报告期望）——————————————————————

test("context()：返回稳定、唯一 id 的静态提示块；不读盘/不声明资源", () => {
  const sections = productRoleModule.context({ governanceModel: "trio" });
  assert.deepEqual(
    sections.map((section) => section.id),
    ["product-duty", "product-intent", "product-version-upgrade", "product-report"],
  );
  assert.equal(new Set(sections.map((section) => section.id)).size, sections.length);
  for (const section of sections) {
    assert.equal(section.text.trim().length > 0, true);
    assert.equal(section.resources, undefined);
  }
  assert.equal(Object.isFrozen(sections), true);
  for (const section of sections) assert.equal(Object.isFrozen(section), true);

  // 输入事实不参与：无论 facts 形状如何都返回同一份冻结数据（宿主负责脱敏/读取）。
  const withFacts = productRoleModule.context({
    governanceModel: "trio",
    facts: Object.freeze({ arbitrary: "ignored" }),
  });
  assert.equal(withFacts, sections);
});

// —————————————————————— 模块图/import/纯度静态扫描（E1.4/E1.5）——————————————————————

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listSourceFiles(full));
    else if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

test("模块图（E1.4）：根目录只有 index.ts + internal/；外部只能经 index", () => {
  const rootEntries = readdirSync(MODULE_DIR).sort();
  assert.deepEqual(rootEntries, ["index.ts", "internal"]);

  const internalFiles = listSourceFiles(path.join(MODULE_DIR_PATH, "internal"));
  assert.equal(internalFiles.length > 0, true);

  const indexSource = readFileSync(new URL("index.ts", MODULE_DIR), "utf8");
  // 恰好一个公开导出值（BuiltInRoleModule）；不额外导出策略/codes（保持 public entry 冻结面最小）。
  const exports = indexSource.match(/^export /gm) ?? [];
  assert.equal(exports.length, 1);
  assert.match(indexSource, /export const productRoleModule: BuiltInRoleModule/);
});

test("模块图（E1.5）：零跨角色/引擎 import；只依赖 Model 与 shared public entry", () => {
  const files = listSourceFiles(MODULE_DIR_PATH);
  const forbidden = [
    "门禁引擎",
    "pipeline/",
    "service/",
    "provider/",
    "app/",
    "node:",
    "roles/chief",
    "roles/rapporteur",
    "roles/nominator",
    "roles/convener",
    "roles/verifier",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map(
      (match) => match[1]!,
    );
    for (const specifier of specifiers) {
      assert.equal(
        /^(?:\.\/|(?:\.\.\/)+model\/|(?:\.\.\/)+shared\/)/.test(specifier),
        true,
        `${path.relative(MODULE_DIR_PATH, file)} imports ${specifier}`,
      );
      for (const marker of forbidden) {
        assert.equal(specifier.includes(marker), false, `${file} -> ${specifier}`);
      }
    }
  }
});

test("纯度：模块源码无 I/O/时钟/随机数/环境/可变全局", () => {
  const patterns: ReadonlyArray<readonly [string, RegExp]> = [
    ["fs read", /\breadFile(Sync)?\s*\(/],
    ["fs write", /\bwriteFile(Sync)?\s*\(/],
    ["fs readdir", /\breaddir(Sync)?\s*\(/],
    ["stat", /\bstat(Sync)?\s*\(/],
    ["clock", /\bDate\.now\b|\bnew Date\b/],
    ["random", /\bMath\.random\b/],
    ["process", /\bprocess\./],
    ["require", /\brequire\s*\(/],
    ["dynamic import", /\bimport\s*\(/],
    ["fetch", /\bfetch\s*\(/],
  ];
  for (const file of listSourceFiles(MODULE_DIR_PATH)) {
    const source = readFileSync(file, "utf8");
    for (const [label, pattern] of patterns) {
      assert.equal(pattern.test(source), false, `${path.basename(file)}: ${label}`);
    }
  }
});

test("纯策略：重复调用结果稳定，输入不被改写（tools/dispatch/preflight/context）", () => {
  const toolInput = Object.freeze({ governanceModel: "trio" as const });
  assert.deepEqual(productRoleModule.tools(toolInput), productRoleModule.tools(toolInput));

  const dispatchInput = Object.freeze({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance" as const,
    targetExists: true,
  });
  assert.deepEqual(
    productRoleModule.dispatch(dispatchInput),
    productRoleModule.dispatch(dispatchInput),
  );

  const preflightInput = Object.freeze({
    action: "version-upgrade" as const,
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS }),
  });
  assert.deepEqual(
    productRoleModule.preflight?.checkAction(preflightInput),
    productRoleModule.preflight?.checkAction(preflightInput),
  );

  assert.equal(
    productRoleModule.context({ governanceModel: "trio" }),
    productRoleModule.context({ governanceModel: "trio" }),
  );
});
