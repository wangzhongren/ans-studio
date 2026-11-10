// test/roles/product/product-fixed.test.ts
// product 模块 fixed 矩阵测试（T3「两条固定工作流路径」B2；AC-24/T-13；v1.3 §3.4；G-IR §5.7/MF-IR-4）。
//
// 口径：
//  - legacy 数据/行为逐字冻结：本文件**只读断言** legacy `cards`/`capabilities`/`context({})`/
//    `dispatch`（缺省与显式 `"legacy-v1"`）未被 fixed 改动；legacy 差分仍由未修改的
//    `product-module.test.ts`/`product-differential.test.ts` 覆盖；
//  - fixed 只在 `matrix:"two-fixed-paths/v1"`：`fixedCards=[]`；fixed context 段（意图撰写/修订、
//    报告回运营；不派发/不实现/不自行改方案；意图确认卡由幕僚呈）；fixed dispatch
//    （convener→product 允许、chief→product 拒绝 `chief-production-dispatch-forbidden`）；
//  - B9.1（RR4 修复）：fixed 报告段要求交付报告写清产物路径与内容/frontmatter 实际值；hash/sha256
//    由应用计算，禁止 worker 用 `run_shell`/`certutil`/`Get-FileHash`/PowerShell 等 shell 计算 hash
//    （shell 属高风险审批动作；fixed 流程不需要为 hash 触发客户审批卡）；证据由应用/报告生成；
//  - 不新增工具/卡：`tools()` 不变、无 `requestReleaseMerge`；不新增 skip/force-exit。
//
// 本文件只 import 模块唯一 public entry、Model 类型与 Node 内置；不深导 internal。

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { RoleDispatchPolicyInput, RoleDispatchPolicy } from "../../../src/model/role.ts";
import { productRoleModule } from "../../../src/common/roles/product/index.ts";
import { VALID_VERSION_UPGRADE_FACTS } from "./fixtures/product-differential-fixtures.ts";

const MODULE_DIR = new URL("../../../src/common/roles/product/", import.meta.url);
const MODULE_DIR_PATH = fileURLToPath(MODULE_DIR);
const FIXED: "two-fixed-paths/v1" = "two-fixed-paths/v1";

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listSourceFiles(full));
    else if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  return productRoleModule.dispatch(input);
}

// —————————————————————— fixedCards（MF-IR-4；fixed=[]）——————————————————————

test("fixedCards：product fixed=[]（冻结；legacy cards 逐字不变仍为空）", () => {
  const fixedCards = productRoleModule.fixedCards;
  assert.ok(fixedCards !== undefined, "六模块 B2 后 product 必须提供 fixedCards");
  assert.deepEqual([...fixedCards], []);
  assert.equal(Object.isFrozen(fixedCards), true);
  // legacy cards 仍为空且为独立冻结数组（fixed 不从 legacy 过滤/推导）。
  assert.deepEqual([...productRoleModule.cards], []);
  assert.equal(Object.isFrozen(productRoleModule.cards), true);
  // 模块对象仍冻结；fixedCards 不夹带权限字段。
  assert.equal(Object.isFrozen(productRoleModule), true);
  for (const forbidden of ["allowed", "authorized", "approved", "grant", "permission"]) {
    assert.equal(forbidden in productRoleModule, false);
  }
});

// —————————————————————— context：legacy 逐字冻结 / fixed 新段 ——————————————————————

const LEGACY_CONTEXT_TEXTS = [
  "产品职责：产品取舍、产品评审、产品文档；按实际目标/范围缺口补足或升级产品意图，供需要该依据的策划使用。只写 `docs/product/`；不写提案/名单/架构/角色卡；不实现、不招人。",
  "产品意图版本化：写 `docs/product/<flowId>-intent-vN.md`（新需求/变更出新版本，不原地改，旧版只读），必含目标用户与场景、要解决的问题、范围与非目标、成功/验收标准、客户原话与约束、质量档位；不写实现方案。",
  "产品升级：用实际注入的 `submit_version_change(kind=version-upgrade)` 整单直接提交（operationId、显式 base 与每目标 expectedFromSha256）；应用完成结构/引用/路径/hash/权限/base 校验后直接切换有效 trunk，不等待 VCA 批拒。提交后通知不等于替策划决定旧 run 择时；旧 run 不自动重 pin。",
  "报告期望：收到幕僚派发的任务完成后，必须用 `submit_report` 回短报（完成/阻塞/证据/遗留）到真实任务创建者（幕僚/Chief）；缺关键信息先报阻塞，由幕僚发卡或转客户，不猜。",
] as const;

test("context(legacy)：缺省与显式 `legacy-v1` 返回同一冻结旧段（id/顺序/文本逐字冻结）", () => {
  const byDefault = productRoleModule.context({ governanceModel: "trio" });
  const explicitLegacy = productRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" });
  assert.equal(explicitLegacy, byDefault, "显式 legacy-v1 必须与缺省同引用（逐字不变）");
  assert.deepEqual(
    byDefault.map((section) => section.id),
    ["product-duty", "product-intent", "product-version-upgrade", "product-report"],
  );
  assert.deepEqual(
    byDefault.map((section) => section.text),
    [...LEGACY_CONTEXT_TEXTS],
    "legacy context 文本逐字冻结（B2 不得就地改 legacy 数据）",
  );
  for (const section of byDefault) assert.equal(section.resources, undefined);
  assert.equal(Object.isFrozen(byDefault), true);
  for (const section of byDefault) assert.equal(Object.isFrozen(section), true);
  // legacy 不受 facts 影响（同一引用）。
  assert.equal(
    productRoleModule.context({ governanceModel: "trio", facts: Object.freeze({ arbitrary: "ignored" }) }),
    byDefault,
  );
});

test("context(fixed)：只在 matrix=fixed 返回新段；内容覆盖意图撰写/报告回运营/边界；legacy 不混入", () => {
  const fixedSections = productRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  assert.notEqual(fixedSections, productRoleModule.context({ governanceModel: "trio" }));
  assert.deepEqual(
    fixedSections.map((section) => section.id),
    ["product-fixed-duty", "product-fixed-boundary", "product-fixed-report"],
  );
  assert.equal(Object.isFrozen(fixedSections), true);
  for (const section of fixedSections) {
    assert.equal(Object.isFrozen(section), true);
    assert.equal(section.text.trim().length > 0, true);
    assert.equal(section.resources, undefined);
  }
  const text = fixedSections.map((section) => section.text).join("\n");
  // 任务派发冻结口径：按运营派发写意图；不派发/不实现/不自行改方案；意图确认卡由幕僚呈。
  assert.match(text, /docs\/product\/<flowId>-intent-vN\.md/u);
  assert.match(text, /运营（convener）派发/u);
  assert.match(text, /不派发任务、不实现、不招人/u);
  assert.match(text, /不自行改方案\/名单\/架构\/角色卡/u);
  assert.match(text, /意图确认卡由幕僚呈/u);
  assert.match(text, /submit_report/u);
  assert.match(text, /运营（convener）/u);
  // legacy 专属内容不混入 fixed（VCA/版本升级直接提交是 legacy 语义）。
  assert.equal(text.includes("submit_version_change"), false);
  // 确定性/纯函数：同输入同引用，不读 facts。
  assert.equal(
    productRoleModule.context({ governanceModel: "trio", matrix: FIXED }),
    fixedSections,
  );
  assert.equal(
    productRoleModule.context({ governanceModel: "single", matrix: FIXED, facts: Object.freeze({ x: 1 }) }),
    fixedSections,
  );
  // fixed 读取不改变 legacy 返回值。
  assert.deepEqual(
    productRoleModule.context({ governanceModel: "trio" }).map((section) => section.id),
    ["product-duty", "product-intent", "product-version-upgrade", "product-report"],
  );
});

test("context(fixed, B9.1)：报告/证据口径——路径+frontmatter 实际值；hash 由应用计算，禁止 worker shell hash", () => {
  const fixedSections = productRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  const report = fixedSections.find((section) => section.id === "product-fixed-report");
  assert.ok(report !== undefined, "fixed context 必须保留 product-fixed-report 段");
  const text = report.text;

  // 完成文档/代码后：只报告产物路径、内容/frontmatter 实际值与结论。
  assert.match(text, /只报告产物路径、内容\/frontmatter 实际值与结论/u);
  // 哈希口径：不要自己算/转抄；sha256 由应用在收口/归档/依据校验时计算。
  assert.match(text, /不要自己算或转抄哈希/u);
  assert.match(text, /`sha256` 由应用计算/u);
  assert.match(text, /任务收口/u);
  assert.match(text, /归档/u);
  assert.match(text, /documentRefs\/依据校验/u);
  assert.match(text, /报告\/证据只引用应用给出的值/u);
  // RR4 回归防线：明确禁止 worker 用 shell 算 hash，并点名实测诱导命令。
  assert.match(text, /不得用 shell 算 hash/u);
  assert.match(text, /`run_shell`/u);
  assert.match(text, /`certutil -hashfile`/u);
  assert.match(text, /`Get-FileHash`/u);
  assert.match(text, /PowerShell\/pwsh/u);
  assert.match(text, /`sha256sum`/u);
  assert.match(text, /hash 不是 worker 产物/u);
  // shell 属高风险审批动作；fixed 4 卡预算内不需要为 hash 触发任何客户卡。
  assert.match(text, /shell 属高风险审批动作/u);
  assert.match(text, /本流程不需要为 hash 触发任何客户卡/u);
  // 任务文本仍要求给出 sha256 时：改为路径+frontmatter 实际值，注明来源/路径，不自行用 shell。
  assert.match(text, /任务文本要求给出 sha256 时/u);
  assert.match(text, /改为「路径 \+ frontmatter 实际值；hash 由应用计算」/u);
  assert.match(text, /注明来源与路径，不自行用 shell/u);
  assert.match(text, /任务文本不写「给出\/附上 sha256」/u);
  // 证据由应用/报告生成。
  assert.match(text, /证据由应用\/报告生成/u);
  assert.match(text, /submit_report/u);

  // fixed-only：legacy context 逐字保持旧口径，不混入 B9.1 的 shell/hash 策略。
  const legacyText = productRoleModule.context({ governanceModel: "trio" }).map((section) => section.text).join("\n");
  for (const token of ["run_shell", "certutil", "Get-FileHash", "PowerShell", "不要自己算或转抄哈希", "hash 不是 worker 产物"]) {
    assert.equal(legacyText.includes(token), false, `legacy context 不得含 fixed-only 内容：${token}`);
  }

  // 确定性/纯函数：同输入同引用。
  assert.equal(productRoleModule.context({ governanceModel: "trio", matrix: FIXED }), fixedSections);
});

// —————————————————————— dispatch：legacy 逐字不变 / fixed 新增语义 ——————————————————————

const LEGACY_DISPATCH_CASES: readonly RoleDispatchPolicyInput[] = Object.freeze([
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: false },
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "project", targetExists: true },
  { sourceRoleId: "convener", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "convener", targetRoleId: "product", targetKind: "project", targetExists: true },
  { sourceRoleId: "rapporteur", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "product", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
]);

test("dispatch(legacy)：缺省与显式 `legacy-v1` 逐例同判定（legacy 分支未因 fixed 改动）", () => {
  for (const input of LEGACY_DISPATCH_CASES) {
    const byDefault = dispatch(input);
    const explicitLegacy = dispatch({ ...input, matrix: "legacy-v1" });
    assert.deepEqual(explicitLegacy, byDefault, JSON.stringify(input));
  }
  // 关键 legacy 锚点：chief→product 允许、convener→product 拒绝（不受 fixed 数据影响）。
  assert.deepEqual(
    dispatch(LEGACY_DISPATCH_CASES[0]!),
    { decision: { allow: true }, reportToRoleId: "chief" },
  );
  const convenerLegacy = dispatch(LEGACY_DISPATCH_CASES[3]!);
  assert.equal(convenerLegacy.decision.allow === false ? convenerLegacy.decision.code : "", "convener-target-forbidden");
});

test("dispatch(fixed)：convener→product（内置、存在）允许，报告期望=convener", () => {
  const result = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
    purpose: "production",
  });
  assert.deepEqual(result, { decision: { allow: true }, reportToRoleId: "convener" });
});

test("dispatch(fixed)：chief→product 拒绝 fixed-only 稳定码 `chief-production-dispatch-forbidden`", () => {
  const result = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.equal(result.decision.allow, false);
  if (result.decision.allow === false) {
    assert.equal(result.decision.code, "chief-production-dispatch-forbidden");
    assert.equal(result.decision.messageKey, "role.product.dispatch.chiefProductionForbidden");
  }
  assert.equal(result.reportToRoleId, undefined);
  // 目标不存在也不改变 fixed 稳定码（幕僚本就不该派生产线；先按身份拒绝）。
  const missing = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: false,
    matrix: FIXED,
  });
  assert.equal(missing.decision.allow === false ? missing.decision.code : "", "chief-production-dispatch-forbidden");
});

test("dispatch(fixed)：存在性/身份冲突/自我/来源/范围负例均 fail-closed", () => {
  const missing = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: false,
    matrix: FIXED,
  });
  assert.equal(missing.decision.allow === false ? missing.decision.code : "", "target-card-missing");
  const missingUndefined = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    matrix: FIXED,
  });
  assert.equal(missingUndefined.decision.allow === false ? missingUndefined.decision.code : "", "target-card-missing");

  for (const input of [
    { sourceRoleId: "convener", targetRoleId: "product", targetKind: "project", targetExists: true, matrix: FIXED },
    { sourceRoleId: "chief", targetRoleId: "product", targetKind: "project", targetExists: true, matrix: FIXED },
  ] as unknown as RoleDispatchPolicyInput[]) {
    const result = dispatch(input);
    assert.equal(result.decision.allow, false);
    assert.equal(result.decision.allow === false ? result.decision.code : "", "dispatch-input-invalid");
  }

  const self = dispatch({
    sourceRoleId: "product",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.equal(self.decision.allow === false ? self.decision.code : "", "self-dispatch");

  const unknown = dispatch({
    sourceRoleId: "rapporteur",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.equal(unknown.decision.allow === false ? unknown.decision.code : "", "unknown-source");

  const missingSource = dispatch({
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.equal(missingSource.decision.allow === false ? missingSource.decision.code : "", "unknown-source");

  const outOfScope = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "rapporteur",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.equal(
    outOfScope.decision.allow === false ? outOfScope.decision.code : "",
    "dispatch-not-in-module-scope",
  );

  const badShape = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: "yes",
    matrix: FIXED,
  } as unknown as RoleDispatchPolicyInput);
  assert.equal(badShape.decision.allow === false ? badShape.decision.code : "", "dispatch-input-invalid");
});

test("dispatch(fixed)：纯函数/输入只读/确定性（同一输入同判定，不修改冻结输入）", () => {
  const input = Object.freeze({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance" as const,
    targetExists: true,
    matrix: FIXED,
    purpose: "production" as const,
  });
  const before = JSON.stringify(input);
  assert.deepEqual(dispatch(input), dispatch(input));
  assert.equal(JSON.stringify(input), before);
});

// —————————————————————— 工具/卡/拒绝项不新增 ——————————————————————

test("不新增工具/卡：tools() 仍只声明 submitVersionChange；fixedCards 空；无 requestReleaseMerge", () => {
  const trio = productRoleModule.tools({ governanceModel: "trio" });
  assert.deepEqual([...trio.tools], ["submitVersionChange"]);
  assert.deepEqual([...productRoleModule.tools({ governanceModel: "single" }).tools], []);
  assert.deepEqual([...productRoleModule.cards], []);
  assert.deepEqual([...(productRoleModule.fixedCards ?? [])], []);

  for (const file of listSourceFiles(MODULE_DIR_PATH)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/, path.basename(file));
    assert.doesNotMatch(source, /registerTool|newToolId/, path.basename(file));
  }
});

test("legacy preflight 不变：version-upgrade 合法事实仍 allow（fixed 未改 preflight）", () => {
  const result = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: VALID_VERSION_UPGRADE_FACTS,
  });
  assert.deepEqual(result, { allow: true });
  const denied = productRoleModule.preflight?.checkAction({
    action: "version-upgrade",
    facts: { ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: "rapporteur" },
  });
  assert.equal(denied?.allow === false ? denied.code : "", "product-initiator-mismatch");
});
