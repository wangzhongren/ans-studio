// verifier 角色模块单测（greenfield E1；契约 E0.3 §3.1/§3.2/§3.3/§3.4/§3.5）。
//
// 覆盖：模块数据/能力位/卡种；tools() 空声明；dispatch() 硬身份/存在性 + 报告期望；
// preflight(review) 的 reviewTarget/最终候选/CID/criteria 纯策略（缺事实 fail-closed）；
// context() 的 acceptance 卡数据/报告期望；纯函数/无副作用；单入口/依赖方向静态扫描。
//
// 只读 import Model 与旧 oracle（差分在 `verifier-differential.test.ts`）；本文件不修改任何实现。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RoleDispatchPolicyInput, RolePreflightInput } from "../../../src/model/role.ts";
import { GOVERNANCE_CARD_KINDS } from "../../../src/model/runtime.ts";
import { verifierRoleModule } from "../../../src/common/roles/verifier/index.ts";
import {
  ORACLE_DISPATCH_CASES,
  ORACLE_PREFLIGHT_CASES,
  validReviewFacts,
} from "./oracle-fixture.ts";

const MODULE_DIR = new URL("../../../src/common/roles/verifier/", import.meta.url);
const MODULE_ENTRY = new URL("../../../src/common/roles/verifier/index.ts", import.meta.url);

// —————————————————————— 模块数据 / 能力位 / 卡种 ——————————————————————

test("模块数据：id/displayName/function/cards/capabilities 与旧规格一致且只读", () => {
  assert.equal(verifierRoleModule.id, "verifier");
  assert.equal(verifierRoleModule.displayName, "质检");
  assert.equal(verifierRoleModule.function, "verification");
  assert.deepEqual([...verifierRoleModule.cards], ["acceptance"]);
  // D8：卡种是 Model 卡种闭集成员（闭集真源仍归 Model；金样冻结了裁剪后的有效集）。
  for (const kind of verifierRoleModule.cards) {
    assert.equal(GOVERNANCE_CARD_KINDS.includes(kind), true, kind);
  }
  assert.equal(verifierRoleModule.capabilities.customerInput, true);
  assert.equal(verifierRoleModule.capabilities.dispatchTask, false);
  assert.equal(verifierRoleModule.capabilities.roleStatus, false);
  assert.equal(verifierRoleModule.capabilities.sessionTail, false);
  assert.equal(verifierRoleModule.capabilities.installSkill, false);
  assert.equal(verifierRoleModule.capabilities.installMcp, false);
  assert.equal(verifierRoleModule.capabilities.shell, "operator-approve");
  // 契约不含私有展示摘要/旧 cardText 字段。
  for (const absent of ["matrix", "cardText"]) assert.equal(absent in verifierRoleModule, false);
  // 纯数据冻结：外部不能改写模块数据。
  assert.equal(Object.isFrozen(verifierRoleModule), true);
  assert.equal(Object.isFrozen(verifierRoleModule.capabilities), true);
  assert.equal(Object.isFrozen(verifierRoleModule.cards), true);
  assert.equal(Object.isFrozen(verifierRoleModule.card), true);
  assert.equal(Object.isFrozen(verifierRoleModule.card.entries), true);
});

test("卡/边界：Section 1 三条目录、预授权与禁写清单为纯数据", () => {
  const card = verifierRoleModule.card;
  assert.equal(card.text.startsWith("# 角色：质检（内置角色）"), true);
  assert.equal(card.text.includes("不批准、不代客户验收"), true);
  assert.deepEqual(
    card.entries.map((entry) => [entry.root, entry.path, entry.kind]),
    [
      ["project", "docs/quality/", "directory"],
      ["project", "docs/verification/", "directory"],
      ["project", "docs/governance/verifier/", "directory"],
    ],
  );
  assert.deepEqual([...card.preauthorizedDirs], [
    "docs/quality/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  // 应用独占写路径 + 各内置角色目录 + 自身禁写清单均在（逐项语义，不构成权限）。
  for (const forbidden of [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"]) {
    assert.equal(card.forbiddenWritePaths.includes(forbidden), true, forbidden);
  }
  assert.equal(card.forbiddenWritePaths.includes("角色卡/verifier/"), true);
  assert.equal(card.forbiddenWritePaths.includes("docs/workflow.md"), true);
});

// —————————————————————— tools() ——————————————————————

test("tools()：verifier 无额外 RoleToolId（空声明），capabilities 与 spec 同引用（D10）", () => {
  for (const governanceModel of ["trio", "single"] as const) {
    const policy = verifierRoleModule.tools({ governanceModel });
    assert.deepEqual([...policy.tools], []);
    assert.deepEqual([...policy.reasons], []);
    assert.equal(policy.capabilities, verifierRoleModule.capabilities);
    assert.equal(Object.isFrozen(policy.tools), true);
    assert.equal(Object.isFrozen(policy.reasons), true);
  }
  // 未知 id 无法从本模块产生：空数组天然满足闭集；引擎装配侧对越权 id fail-closed。
});

// —————————————————————— dispatch() ——————————————————————

test("dispatch()：fixture 表（硬身份/存在性 + 报告期望）", () => {
  for (const fixture of ORACLE_DISPATCH_CASES) {
    const result = verifierRoleModule.dispatch(fixture.input);
    assert.equal(result.decision.allow, fixture.expectedAllow, fixture.name);
    if (fixture.expectedAllow) {
      assert.equal(result.reportToRoleId, fixture.expectedReportToRoleId, fixture.name);
    } else {
      assert.equal(result.reportToRoleId, undefined, fixture.name);
      assert.equal(result.decision.allow === false ? result.decision.code : "", fixture.expectedCode, fixture.name);
      assert.equal(
        result.decision.allow === false ? typeof result.decision.messageKey : "",
        "string",
        fixture.name,
      );
      assert.equal(
        result.decision.allow === false ? result.decision.messageKey.length > 0 : false,
        true,
        fixture.name,
      );
    }
  }
});

test("dispatch()：不修改调用方输入（纯策略）", () => {
  const input: RoleDispatchPolicyInput = Object.freeze({
    sourceRoleId: "chief",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  const snapshot = structuredClone(input);
  const result = verifierRoleModule.dispatch(input);
  assert.deepEqual(result.decision, { allow: true });
  assert.deepEqual(input, snapshot);
});

test("dispatch()：允许时 reportToRoleId 是真实来源（差分期望，不是路由）", () => {
  const chief = verifierRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(chief.reportToRoleId, "chief");
  const convener = verifierRoleModule.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(convener.reportToRoleId, "convener");
});

// —————————————————————— preflight(review) ——————————————————————

test("preflight：只覆盖 review；其他动作 fail-closed（action-not-covered）", () => {
  const actions = [
    "version-upgrade",
    "detail-amendment",
    "run-change",
    "requirement-change",
    "version-decision",
    "stable-write",
    "appointment",
    "team-plan",
    "git-action",
  ] as const;
  for (const action of actions) {
    const decision = verifierRoleModule.preflight!.checkAction({ action, facts: validReviewFacts() });
    assert.equal(decision.allow, false, action);
    assert.equal(decision.allow === false ? decision.code : "", "action-not-covered", action);
  }
});

test("preflight(review)：fixture 表（reviewTarget/最终候选/CID/criteria；缺事实 deny）", () => {
  for (const fixture of ORACLE_PREFLIGHT_CASES) {
    const input: RolePreflightInput = { action: "review", facts: fixture.facts };
    const decision = verifierRoleModule.preflight!.checkAction(input);
    assert.equal(decision.allow, fixture.expectedAllow, fixture.name);
    if (fixture.expectedAllow) {
      assert.deepEqual(decision, { allow: true }, fixture.name);
    } else {
      assert.equal(decision.allow === false ? decision.code : "", fixture.expectedCode, fixture.name);
      assert.equal(
        decision.allow === false ? decision.messageKey.startsWith("role.verifier.preflight.") : false,
        true,
        fixture.name,
      );
      // details 只能是 JSON 可序列化普通数据；不回显原始输入/证据内容。
      if (decision.allow === false && decision.details !== undefined) {
        assert.equal(typeof decision.details, "object");
        assert.doesNotThrow(() => JSON.stringify(decision.details));
      }
    }
  }
});

test("preflight(review)：任何未登记事实键 ⇒ deny（E0.3 §3.4/D4；E2 P5 修复）", () => {
  const base = validReviewFacts();
  // E2 接口评审 D-VER-1 实测走私输入：
  // 合法 reviewTarget/criteria + {accepted:true,passed:true,approved:true,smuggledDecision:"accept"}。
  const smuggled = verifierRoleModule.preflight!.checkAction({
    action: "review",
    facts: { ...base, accepted: true, passed: true, approved: true, smuggledDecision: "accept" },
  });
  assert.equal(smuggled.allow, false);
  assert.equal(smuggled.allow === false ? smuggled.code : "", "review-facts-unknown-key");
  assert.equal(
    smuggled.allow === false ? smuggled.messageKey : "",
    "role.verifier.preflight.reviewFactsUnknownKey",
  );
  assert.deepEqual(smuggled.allow === false ? smuggled.details : undefined, {
    action: "review",
    unknownKeys: ["accepted", "approved", "passed", "smuggledDecision"],
  });

  // 任一未登记键（无论数量/值）都拒绝；值 false/undefined 也不算登记键。
  for (const extra of [
    { accepted: false },
    { passed: false },
    { approved: false },
    { smuggledDecision: "accept" },
    { unknownKey: 1 },
    { approved: undefined },
  ] as ReadonlyArray<Record<string, unknown>>) {
    const decision = verifierRoleModule.preflight!.checkAction({
      action: "review",
      facts: { ...base, ...extra },
    });
    assert.equal(decision.allow, false, JSON.stringify(extra));
    assert.equal(decision.allow === false ? decision.code : "", "review-facts-unknown-key", JSON.stringify(extra));
    assert.deepEqual(decision.allow === false ? decision.details : undefined, {
      action: "review",
      unknownKeys: [Object.keys(extra)[0]!],
    });
  }

  // 未登记键先于缺键/形状判定（fail-closed，不读取其值）。
  const unknownAndMissing = verifierRoleModule.preflight!.checkAction({
    action: "review",
    facts: { criteria: base["criteria"], accepted: true },
  });
  assert.equal(unknownAndMissing.allow === false ? unknownAndMissing.code : "", "review-facts-unknown-key");
  const unknownAndInvalidShape = verifierRoleModule.preflight!.checkAction({
    action: "review",
    facts: {
      ...base,
      reviewTarget: { operationId: "", candidate: { objectFormat: "sha1", hex: "0".repeat(40) } },
      accepted: true,
    },
  });
  assert.equal(unknownAndInvalidShape.allow === false ? unknownAndInvalidShape.code : "", "review-facts-unknown-key");

  // 未登记键排序稳定（与对象键插入顺序无关）。
  const reversed = verifierRoleModule.preflight!.checkAction({
    action: "review",
    facts: { passed: true, ...base, accepted: true },
  });
  assert.deepEqual(reversed.allow === false ? reversed.details : undefined, {
    action: "review",
    unknownKeys: ["accepted", "passed"],
  });

  // 已登记键合法输入行为不变：仍 allow。
  assert.deepEqual(verifierRoleModule.preflight!.checkAction({ action: "review", facts: base }), {
    allow: true,
  });
});

test("preflight(review)：未登记键拒绝不修改调用方事实包（纯策略）", () => {
  const facts = Object.freeze({ ...validReviewFacts(), accepted: true, passed: true });
  const snapshot = structuredClone(facts);
  const decision = verifierRoleModule.preflight!.checkAction(
    Object.freeze({ action: "review", facts }),
  );
  assert.equal(decision.allow, false);
  assert.deepEqual(facts, snapshot);
});

test("preflight(review)：不修改事实包（纯策略）", () => {
  const facts = Object.freeze(validReviewFacts());
  const input: RolePreflightInput = Object.freeze({ action: "review", facts });
  const snapshot = structuredClone(input);
  const decision = verifierRoleModule.preflight!.checkAction(input);
  assert.deepEqual(decision, { allow: true });
  assert.deepEqual(input, snapshot);
});

// —————————————————————— context() ——————————————————————

test("context()：two 静态段（acceptance 卡数据 + 报告期望），id 唯一、文本非空", () => {
  const sections = verifierRoleModule.context({ governanceModel: "trio" });
  assert.equal(sections.length, 2);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["verifier-acceptance-card", "verifier-report-expectation"],
  );
  for (const section of sections) {
    assert.equal(typeof section.text, "string");
    assert.equal(section.text.length > 0, true);
    assert.equal(section.resources, undefined);
  }
  const acceptance = sections[0]!.text;
  assert.equal(acceptance.includes("acceptance"), true);
  assert.equal(acceptance.includes("accept"), true);
  assert.equal(acceptance.includes("reject"), true);
  assert.equal(acceptance.includes("不得自批"), true);
  const report = sections[1]!.text;
  assert.equal(report.includes("docs/quality/"), true);
  assert.equal(report.includes("docs/verification/"), true);
  assert.equal(report.includes("submit_report"), true);
  assert.equal(report.includes("CID"), true);
  assert.equal(report.includes("criteria"), true);
});

test("context()：纯静态模板（单/trio、有无 facts 输出一致；输入不被修改）", () => {
  const trio = verifierRoleModule.context({ governanceModel: "trio" });
  const single = verifierRoleModule.context({ governanceModel: "single" });
  const withFacts = verifierRoleModule.context({
    governanceModel: "trio",
    facts: Object.freeze({ flowId: "flow-1", anything: true }),
  });
  assert.deepEqual(trio, single);
  assert.deepEqual(trio, withFacts);
  assert.equal(Object.isFrozen(trio), true);
});

// —————————————————————— 纯函数 / 单入口 / 依赖方向静态扫描 ——————————————————————

test("模块根只有唯一 public entry index.ts（不散放文件）", () => {
  const files = readdirSync(fileURLToPath(MODULE_DIR)).sort();
  assert.deepEqual(files, ["index.ts"]);
});

test("依赖方向：只 import Model public entry；无引擎/门控/pipeline/service/provider/app/其他角色/node: 依赖", () => {
  const source = readFileSync(MODULE_ENTRY, "utf8");
  const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]!);
  assert.equal(specifiers.length > 0, true);
  for (const specifier of specifiers) {
    assert.equal(specifier.startsWith("../../../model/"), true, `非法依赖：${specifier}`);
    for (const forbidden of [
      "门禁引擎",
      "pipeline",
      "service",
      "provider",
      "app/",
      "common/roles/",
      "common/gates",
      "node:",
    ]) {
      assert.equal(specifier.includes(forbidden), false, `越界依赖：${specifier}`);
    }
  }
  // 无动态 import / 无 I/O 依赖。
  assert.equal(/\bimport\s*\(/.test(source), false);
});

test("唯一 public entry 只导出一个 BuiltInRoleModule", () => {
  const source = readFileSync(MODULE_ENTRY, "utf8");
  const exports = [...source.matchAll(/^export /gm)];
  assert.equal(exports.length, 1);
  assert.equal(source.includes("export const verifierRoleModule"), true);
});

test("纯函数：重复调用返回结构一致（无可变状态/时钟/随机数）", () => {
  const dispatchInput: RoleDispatchPolicyInput = {
    sourceRoleId: "chief",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  };
  const preflightInput: RolePreflightInput = { action: "review", facts: validReviewFacts() };
  assert.deepEqual(verifierRoleModule.dispatch(dispatchInput), verifierRoleModule.dispatch(dispatchInput));
  assert.deepEqual(
    verifierRoleModule.preflight!.checkAction(preflightInput),
    verifierRoleModule.preflight!.checkAction(preflightInput),
  );
  assert.deepEqual(
    verifierRoleModule.tools({ governanceModel: "trio" }),
    verifierRoleModule.tools({ governanceModel: "trio" }),
  );
});
