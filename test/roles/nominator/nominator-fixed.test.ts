// test/roles/nominator/nominator-fixed.test.ts
// nominator 模块 T3「两条固定工作流路径」B2 fixed 批次测试（MF-IR-4 / v1.3 §3.4 nominator 行）。
//
// 覆盖：
//  1. fixed 数据：`fixedCards` 恒为空集（任命卡归幕僚；appointment-write 仅 legacy；fixed 抑制）
//     ——纯数据、冻结、与 legacy `cards` 不同引用；
//  2. legacy 冻结：`context({})` / 未传 matrix / 显式 `matrix:"legacy-v1"` 逐字返回旧段（同一引用），
//     fixed 段只在 `matrix:"two-fixed-paths/v1"` 返回；
//  3. fixed context 段：按运营派发、按名单机械建卡/边界/激活、不自行增删角色、不发起任命卡/不派发；
//     无资源引用（模块不读盘）、确定性、无 legacy section；
//  4. 不新增工具/卡：`tools()` / `cards` / `capabilities` / `card.text` / dispatch / preflight 均不因
//     fixed 批次改变（legacy 差分见 nominator-differential.test.ts，本文件不改它）。
//
// 本文件只测本角色模块；不 import 旧引擎（differential oracle 在 nominator-differential.test.ts）。
// 不新增 skip/force-exit；不写盘。

import { test } from "node:test";
import assert from "node:assert/strict";

import { nominatorRoleModule } from "../../../src/common/roles/nominator/index.ts";
import type { DispatchMatrixMode, RoleContextInput } from "../../../src/model/role.ts";

const FIXED: DispatchMatrixMode = "two-fixed-paths/v1";
const LEGACY: DispatchMatrixMode = "legacy-v1";

// —————————————————————— fixed 数据：fixedCards 空集 ——————————————————————

test("fixedCards：恒为空集且冻结——任命卡归幕僚、appointment-write 仅 legacy（G-3）", () => {
  const fixedCards = nominatorRoleModule.fixedCards;
  assert.ok(fixedCards !== undefined, "nominator 必须提供 fixedCards（MF-IR-4 六模块均提供）");
  assert.deepEqual([...fixedCards!], [], "nominator fixedCards 恒为空集");
  assert.equal(fixedCards!.length, 0);
  assert.equal(Object.isFrozen(fixedCards), true, "fixedCards 必须是冻结纯数据");
  // 不是 legacy `cards` 的事后过滤/同一引用。
  assert.notEqual(fixedCards, nominatorRoleModule.cards);
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
  // 空集不包含 appointment/appointment-write/acceptance 等任何卡种。
  for (const kind of ["appointment", "appointment-write", "acceptance", "merge-main"]) {
    assert.equal(fixedCards!.includes(kind as never), false);
  }
});

// —————————————————————— legacy 冻结：context 旧段逐字不变 ——————————————————————

test("legacy context 冻结：缺省/未传 matrix/显式 legacy-v1 逐字返回旧段（同一引用，3 sections）", () => {
  const baseline = nominatorRoleModule.context({ governanceModel: "trio" });
  assert.deepEqual(
    baseline.map((section) => section.id),
    ["nominator-appointment-card", "nominator-appointment-write", "nominator-report-expectation"],
  );

  const variants = [
    nominatorRoleModule.context({ governanceModel: "single" }),
    nominatorRoleModule.context({ governanceModel: "trio", matrix: LEGACY }),
    nominatorRoleModule.context({ governanceModel: "single", matrix: LEGACY }),
    // 兼容旧调用方：类型外缺省输入（runtime 不传/传空）也必须回旧段（fail-safe）。
    nominatorRoleModule.context({} as unknown as RoleContextInput),
  ];
  for (const sections of variants) {
    assert.equal(sections, baseline, "legacy 调用必须返回同一 legacy 段引用（逐字不变）");
    assert.equal(JSON.stringify(sections).includes("two-fixed-paths"), false);
  }
  // 旧段文本与既有语义保持不变（关键锚点；全文差分由证据指纹覆盖）。
  const byId = new Map(baseline.map((section) => [section.id, section.text]));
  assert.equal(byId.get("nominator-appointment-card")?.includes("cardKind=appointment"), true);
  assert.equal(byId.get("nominator-appointment-write")?.includes("cardKind: `appointment-write`"), true);
  assert.equal(byId.get("nominator-report-expectation")?.includes("task.created.from"), true);
  for (const section of baseline) assert.equal(section.resources, undefined);
});

// —————————————————————— fixed context：新段只在 fixed 矩阵返回 ——————————————————————

test("fixed context：matrix=two-fixed-paths/v1 返回固定段（3 sections；无 legacy 段、无资源引用）", () => {
  const fixedSections = nominatorRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  assert.deepEqual(
    fixedSections.map((section) => section.id),
    ["nominator-fixed-duty", "nominator-fixed-activation", "nominator-fixed-report"],
  );
  // 不与 legacy 段同引用、不混入 legacy section id。
  assert.notEqual(fixedSections, nominatorRoleModule.context({ governanceModel: "trio" }));
  for (const legacyId of [
    "nominator-appointment-card",
    "nominator-appointment-write",
    "nominator-report-expectation",
  ]) {
    assert.equal(fixedSections.some((section) => section.id === legacyId), false);
  }
  // 无资源引用：模块不读盘。
  for (const section of fixedSections) {
    assert.equal(section.resources, undefined);
    assert.ok(section.text.trim().length > 0);
  }
  // 确定性：重复调用同一引用/同值。
  assert.equal(nominatorRoleModule.context({ governanceModel: "trio", matrix: FIXED }), fixedSections);
  // 冻结纯数据。
  assert.equal(Object.isFrozen(fixedSections), true);
});

test("fixed context 口径：按运营派发、按名单机械建卡/激活、不自行增删角色、不发起任命卡/不派发", () => {
  const fixedSections = nominatorRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  const duty = fixedSections.find((section) => section.id === "nominator-fixed-duty")?.text ?? "";
  const activation =
    fixedSections.find((section) => section.id === "nominator-fixed-activation")?.text ?? "";
  const report = fixedSections.find((section) => section.id === "nominator-fixed-report")?.text ?? "";

  // 派发口径：人事任务由运营（convener）派发；人事不派发。
  assert.match(duty, /运营（convener）派发/);
  assert.match(duty, /人事不派发任何任务/);
  // 任命卡归幕僚；fixed 不发 appointment / appointment-write。
  assert.match(duty, /任命确认卡由幕僚/);
  assert.match(duty, /不发起 appointment \/ appointment-write 卡/);
  assert.match(duty, /fixedCards 空/);
  assert.match(duty, /不自行增删角色/);
  // 名单 + 提案决定驱动的机械建卡/边界/激活。
  assert.match(activation, /A7\/A8/);
  assert.match(activation, /名单/);
  assert.match(activation, /提案决定/);
  assert.match(activation, /role-card\.md/);
  assert.match(activation, /boundary\.md/);
  assert.match(activation, /boundary\.yaml/);
  assert.match(activation, /模块的文件\/目录并集/);
  assert.match(activation, /activate_role_documents/);
  assert.match(activation, /role\.activated/);
  assert.match(activation, /activation-hash-drift/);
  // 报告回任务真实创建者（固定路径 = 运营）。
  assert.match(report, /task\.created\.from/);
  assert.match(report, /submit_report/);
});

// —————————————————————— 不新增工具/卡；legacy 策略面不因 fixed 改变 ——————————————————————

test("不新增工具/卡：fixed 批次不改 tools/cards/capabilities/card.text（legacy 冻结）", () => {
  const trio = nominatorRoleModule.tools({ governanceModel: "trio" });
  const single = nominatorRoleModule.tools({ governanceModel: "single" });
  assert.deepEqual([...trio.tools], ["activateRoleDocuments"]);
  assert.deepEqual([...single.tools], []);
  assert.equal(trio.capabilities, nominatorRoleModule.capabilities);
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
  assert.equal(nominatorRoleModule.card.text.startsWith("# 角色：人事（内置角色）"), true);
  // 无 fixed 专属工具/卡字段被误加进策略输出。
  for (const forbidden of ["fixedTools", "fixedTargetRoleIds", "fixedAllowedBuiltInRoleIds"]) {
    assert.equal(forbidden in trio, false);
    assert.equal(forbidden in nominatorRoleModule, false);
  }
});

test("fixed 矩阵不改变本模块 legacy dispatch 判定（fixed 派发权威在编排 workflow-dispatch.ts，不在角色模块）", () => {
  // 本模块 dispatch() 只承载 legacy 硬身份/存在性语义（R-2）；fixed 派发（convener→nominator 允许等）
  // 由编排 `src/common/编排/workflow-dispatch.ts` 的 fixed 谓词实现，模块不复制第二张表。
  const cases = [
    { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance" as const, targetExists: true },
    { sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "built-in-governance" as const, targetExists: true },
    { sourceRoleId: "product", targetRoleId: "nominator", targetKind: "built-in-governance" as const, targetExists: true },
  ];
  for (const input of cases) {
    const legacy = nominatorRoleModule.dispatch(input);
    const fixed = nominatorRoleModule.dispatch({ ...input, matrix: FIXED });
    const explicitLegacy = nominatorRoleModule.dispatch({ ...input, matrix: LEGACY });
    assert.deepEqual(fixed, legacy, `matrix=fixed 不得改变模块 legacy 判定：${input.sourceRoleId}`);
    assert.deepEqual(explicitLegacy, legacy);
  }
});

test("preflight 不因 fixed 批次改变：appointment 动作集与 stage 语义保持 legacy", () => {
  const preflight = nominatorRoleModule.preflight;
  assert.ok(preflight !== undefined);
  // fixed 路径不新增动作；非 appointment 动作仍 action-not-covered。
  assert.deepEqual(preflight!.checkAction({ action: "team-plan", facts: {} }), {
    allow: false,
    code: "action-not-covered",
    messageKey: "role.preflight.actionNotCovered",
    details: { action: "team-plan" },
  });
  // appointment 事实包缺键仍 fail-closed（不新增 fixed stage:"activation" 分支）。
  const decision = preflight!.checkAction({ action: "appointment", facts: {} });
  assert.equal(decision.allow, false);
  if (decision.allow === false) {
    assert.equal(decision.code, "appointment-facts-missing");
  }
});

// —————————————————————— 纯策略：fixed 读取不修改模块/输入 ——————————————————————

test("纯策略：fixed context 读取不改写模块数据与调用输入", () => {
  const before = JSON.stringify(nominatorRoleModule);
  const input = Object.freeze({ governanceModel: "trio" as const, matrix: FIXED });
  const inputBefore = JSON.stringify(input);

  nominatorRoleModule.context(input);
  nominatorRoleModule.context(input);

  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(nominatorRoleModule), before);
  // fixedCards 仍为空集、legacy cards 仍两卡（读取后）。
  assert.deepEqual([...(nominatorRoleModule.fixedCards ?? [])], []);
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
});
