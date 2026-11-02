// test/编排/dispatch-advisories.test.ts
// 2026-11-02（dispatch-guardrail-relax A1）：派发 advisory 纯逻辑矩阵。
// 覆盖 23 个 code 的正/负例、链顺序、R2 组合、legacy、run 专属模块、latest/pinned 分离、
// 模块路径等价性、空 advisory、永不返回拒绝。
import test from "node:test";
import assert from "node:assert/strict";

import { collectDispatchAdvisories, type DispatchAdvisory } from "../../src/common/编排/dispatch-advisories.ts";
import type { DispatchPreflightInput, ProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";

const ROSTER: ProjectRoster = {
  schema: "project-roster/v3",
  flowId: "focus",
  version: 1,
  intent: "docs/product/focus-intent-v1.md",
  proposal: "docs/proposals/focus-proposal-v1.md",
  architecture: "docs/contracts/focus-architecture-v1.md",
  envBootstrap: { omitted: false },
  modules: [
    { id: "impl-core", name: "核心实现", purpose: "实现", paths: ["src/"], path: "src/", category: "core", publicContract: "src/index.ts", architectureSource: "docs/contracts/focus-architecture-v1.md" },
    { id: "impl-test", name: "实现测试", purpose: "测试", paths: ["tests/"], path: "tests/", category: "core", publicContract: "tests/", architectureSource: "docs/contracts/focus-architecture-v1.md" },
    { id: "qa-suite", name: "质量核对", purpose: "质量", paths: ["test/"], path: "test/", category: "core", publicContract: "test/", architectureSource: "docs/contracts/focus-architecture-v1.md" },
    { id: "env-resources", name: "环境装配", purpose: "环境", paths: ["package.json"], path: "package.json", category: "env", publicContract: "package.json", architectureSource: "docs/contracts/focus-architecture-v1.md" },
    { id: "entry-index", name: "项目入口", purpose: "入口", paths: ["index.html"], path: "index.html", category: "entry", publicContract: "index.html", architectureSource: "docs/contracts/focus-architecture-v1.md" },
  ],
  roles: [
    { id: "implementer", displayName: "实现者", purpose: "实现", capability: "TS", modules: ["impl-core"] },
    { id: "qa", displayName: "测试", purpose: "质量", capability: "测试", modules: ["qa-suite"] },
    { id: "env-bootstrap", displayName: "环境装配", purpose: "环境", capability: "build", modules: ["env-resources", "entry-index"] },
  ],
};

const OK_ROSTER = { ok: true as const, roster: ROSTER, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "a".repeat(64) };

function input(overrides: Partial<DispatchPreflightInput> = {}): DispatchPreflightInput {
  return {
    fromRoleId: "chief",
    targetRoleId: "product",
    targetBuiltIn: true,
    targetExists: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
    flowId: "focus",
    intent: { found: true, candidates: 1 },
    proposalFound: true,
    architectureFound: true,
    roster: OK_ROSTER,
    d3Selected: ["implementer"],
    moduleId: "impl-core",
    handoffFound: true,
    targetCardFound: true,
    ...overrides,
  };
}

function convenerInput(overrides: Partial<DispatchPreflightInput> = {}): DispatchPreflightInput {
  return input({ fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, ...overrides });
}

function codes(value: DispatchPreflightInput): string[] {
  return collectDispatchAdvisories(value).map((item) => item.code);
}

function find(value: DispatchPreflightInput, code: string): DispatchAdvisory | undefined {
  return collectDispatchAdvisories(value).find((item) => item.code === code);
}

test("幕僚链：flow/intent/proposal/roster/modules/env/d3/cards 正负例", () => {
  assert.ok(codes(input({ targetRoleId: "rapporteur", flowId: undefined })).includes("flow-required"));
  assert.equal(codes(input({ targetRoleId: "rapporteur" })).includes("flow-required"), false);
  assert.ok(codes(input({ targetRoleId: "rapporteur", intent: { found: false, candidates: 0 } })).includes("intent-missing"));
  assert.equal(codes(input({ targetRoleId: "rapporteur" })).includes("intent-missing"), false);

  assert.ok(codes(input({ targetRoleId: "nominator", proposalFound: false })).includes("proposal-missing"));
  assert.ok(codes(input({ targetRoleId: "nominator", architectureFound: false })).includes("proposal-missing"));
  assert.equal(codes(input({ targetRoleId: "nominator" })).includes("proposal-missing"), false);

  assert.ok(codes(input({ targetRoleId: "nominator", roster: undefined })).includes("roster-missing"));
  assert.equal(codes(input({ targetRoleId: "nominator" })).includes("roster-missing"), false);

  const noModulesRoster: ProjectRoster = { ...ROSTER, modules: [] };
  assert.ok(
    codes(input({ targetRoleId: "nominator", roster: { ...OK_ROSTER, roster: noModulesRoster } })).includes("roster-modules-missing"),
  );
  assert.equal(codes(input({ targetRoleId: "nominator" })).includes("roster-modules-missing"), false);

  const noEnvRoster: ProjectRoster = { ...ROSTER, roles: ROSTER.roles.filter((role) => role.id !== "env-bootstrap") };
  assert.ok(
    codes(input({ targetRoleId: "nominator", roster: { ...OK_ROSTER, roster: noEnvRoster } })).includes("env-bootstrap-missing"),
  );
  assert.equal(codes(input({ targetRoleId: "nominator" })).includes("env-bootstrap-missing"), false);

  assert.ok(codes(input({ targetRoleId: "convener", d3Selected: [] })).includes("d3-missing"));
  assert.equal(codes(input({ targetRoleId: "convener" })).includes("d3-missing"), false);

  const cards = find(
    input({ targetRoleId: "convener", d3Selected: ["implementer"], targetCardFound: false, missingSelectedCardIds: ["implementer"] }),
    "d3-selected-cards-incomplete",
  );
  assert.ok(cards);
  assert.match(cards.message, /implementer/);
  assert.match(cards.message, /内置角色/);
  assert.equal(codes(input({ targetRoleId: "convener" })).includes("d3-selected-cards-incomplete"), false);
});

test("运营链：handoff/module-required/missing/not-owned/path/nominated 正负例", () => {
  assert.ok(codes(convenerInput({ handoffFound: false })).includes("handoff-missing"));
  assert.equal(codes(convenerInput({ handoffFound: true })).includes("handoff-missing"), false);

  assert.ok(codes(convenerInput({ moduleId: undefined })).includes("module-required"));
  assert.equal(codes(convenerInput({ moduleId: "impl-core" })).includes("module-required"), false);

  assert.ok(codes(convenerInput({ moduleId: "nope" })).includes("module-missing"));
  assert.equal(codes(convenerInput({ moduleId: "impl-core" })).includes("module-missing"), false);

  assert.ok(codes(convenerInput({ moduleId: "impl-test" })).includes("module-not-owned"));
  assert.equal(codes(convenerInput({ moduleId: "impl-core" })).includes("module-not-owned"), false);

  assert.ok(codes(convenerInput({ modulePaths: ["../x"] })).includes("module-path-invalid"));
  assert.equal(codes(convenerInput({ modulePaths: ["src/a.ts"] })).includes("module-path-invalid"), false);

  assert.ok(codes(convenerInput({ modulePaths: ["tests/a.ts"] })).includes("module-path-outside"));
  assert.equal(codes(convenerInput({ modulePaths: ["src/a.ts"] })).includes("module-path-outside"), false);

  assert.ok(codes(convenerInput({ d3Selected: [] })).includes("target-not-nominated"));
  assert.equal(codes(convenerInput({ d3Selected: ["implementer"] })).includes("target-not-nominated"), false);
});

test("独立 run advisory：legacy/pin/roles/ledger/hash/roster 正负例", () => {
  assert.ok(codes(convenerInput({ run: { state: "legacy" } })).includes("run-legacy-readonly"));
  assert.equal(codes(convenerInput({ run: { state: "draft", runId: "r1" } })).includes("run-legacy-readonly"), false);

  assert.ok(codes(convenerInput({ run: { state: "draft", runId: "r1" } })).includes("run-pin-required"));
  assert.ok(codes(input({ targetRoleId: "convener", run: { state: "draft", runId: "r1" } })).includes("run-pin-required"));
  assert.equal(codes(convenerInput({ run: { state: "pinned", runId: "r1", roles: ["implementer"] } })).includes("run-pin-required"), false);
  assert.equal(codes(input({ targetRoleId: "product", run: { state: "draft", runId: "r1" } })).includes("run-pin-required"), false);

  assert.ok(codes(convenerInput({ runFacts: { pinFailed: true } })).includes("run-pin-failed"));
  assert.equal(codes(convenerInput({ runFacts: { pinFailed: false } })).includes("run-pin-failed"), false);

  assert.ok(codes(convenerInput({ run: { state: "pinned", runId: "r1", roles: ["qa"] } })).includes("run-role-missing"));
  assert.equal(codes(convenerInput({ run: { state: "pinned", runId: "r1", roles: ["implementer"] } })).includes("run-role-missing"), false);
  assert.equal(codes(convenerInput({ run: { state: "pinned", runId: "r1" } })).includes("run-role-missing"), false);

  assert.ok(codes(convenerInput({ runFacts: { ledgerUnavailable: true } })).includes("run-ledger-unavailable"));
  assert.equal(codes(convenerInput({ runFacts: { ledgerUnavailable: false } })).includes("run-ledger-unavailable"), false);

  assert.ok(codes(convenerInput({ runFacts: { documentHashMismatch: true } })).includes("run-document-hash-mismatch"));
  assert.equal(codes(convenerInput({ runFacts: { documentHashMismatch: false } })).includes("run-document-hash-mismatch"), false);

  assert.ok(codes(convenerInput({ runFacts: { pinnedRosterInvalid: true } })).includes("run-pinned-roster-invalid"));
  assert.equal(codes(convenerInput({ runFacts: { pinnedRosterInvalid: false } })).includes("run-pinned-roster-invalid"), false);

  assert.ok(codes(convenerInput({ versionedDocBaselineViolations: ["docs/product/x.md"] })).includes("versioned-doc-baseline-violation"));
  assert.equal(codes(convenerInput({ versionedDocBaselineViolations: [] })).includes("versioned-doc-baseline-violation"), false);
});

test("链顺序：每个链只报首个未满足项", () => {
  const chief = codes(input({ targetRoleId: "nominator", flowId: undefined, proposalFound: false, roster: undefined }));
  assert.ok(chief.includes("flow-required"));
  assert.equal(chief.includes("proposal-missing"), false);
  assert.equal(chief.includes("roster-missing"), false);

  const proposal = codes(input({ targetRoleId: "nominator", proposalFound: false, roster: undefined }));
  assert.ok(proposal.includes("proposal-missing"));
  assert.equal(proposal.includes("roster-missing"), false);

  const roster = codes(input({ targetRoleId: "nominator", roster: undefined }));
  assert.ok(roster.includes("roster-missing"));
  assert.equal(roster.includes("roster-modules-missing"), false);

  const noModulesRoster: ProjectRoster = { ...ROSTER, modules: [] };
  const modules = codes(input({ targetRoleId: "nominator", roster: { ...OK_ROSTER, roster: noModulesRoster } }));
  assert.ok(modules.includes("roster-modules-missing"));
  assert.equal(modules.includes("env-bootstrap-missing"), false);

  const handoff = codes(convenerInput({ handoffFound: false, flowId: undefined, moduleId: undefined }));
  assert.ok(handoff.includes("handoff-missing"));
  assert.equal(handoff.includes("flow-required"), false);
  assert.equal(handoff.includes("module-required"), false);

  const flow = codes(convenerInput({ flowId: undefined, moduleId: undefined }));
  assert.ok(flow.includes("flow-required"));
  assert.equal(flow.includes("module-required"), false);

  const moduleRequired = codes(convenerInput({ moduleId: undefined, d3Selected: [] }));
  assert.ok(moduleRequired.includes("module-required"));
  assert.equal(moduleRequired.includes("target-not-nominated"), false);

  const nominated = codes(convenerInput({ d3Selected: [] }));
  assert.ok(nominated.includes("target-not-nominated"));
});

test("独立追加：链级 advisory 与 run 级 advisory 可同时存在", () => {
  const both = codes(input({ targetRoleId: "convener", d3Selected: [], run: { state: "draft", runId: "r1" } }));
  assert.ok(both.includes("d3-missing"));
  assert.ok(both.includes("run-pin-required"));
  assert.ok(both.indexOf("d3-missing") < both.indexOf("run-pin-required"));
});

test("R2 组合：pinFailed + draft 同时产 run-pin-failed 与 run-pin-required，顺序固定", () => {
  const result = codes(convenerInput({ run: { state: "draft", runId: "r1" }, runFacts: { pinFailed: true } }));
  assert.ok(result.includes("run-pin-failed"));
  assert.ok(result.includes("run-pin-required"));
  assert.ok(result.indexOf("run-pin-failed") < result.indexOf("run-pin-required"));
  const noDraft = codes(convenerInput({ runFacts: { pinFailed: true } }));
  assert.ok(noDraft.includes("run-pin-failed"));
  assert.equal(noDraft.includes("run-pin-required"), false);
});

test("legacy：run.state=legacy 仅产 run-legacy-readonly，不产 run-pin-required", () => {
  const result = codes(convenerInput({ run: { state: "legacy" } }));
  assert.ok(result.includes("run-legacy-readonly"));
  assert.equal(result.includes("run-pin-required"), false);
});

test("latest/pinned 分离：链级用 latest，run 专属用 run.roles/run.modules", () => {
  const latest = codes(convenerInput({ d3Selected: ["implementer"], run: { state: "pinned", runId: "r1", roles: ["qa"] } }));
  assert.ok(latest.includes("run-role-missing"));
  assert.equal(latest.includes("target-not-nominated"), false);

  const runModule = codes(convenerInput({ moduleId: "impl-core", run: { state: "pinned", runId: "r1", roles: ["implementer"], modules: ["impl-test"] } }));
  assert.ok(runModule.includes("module-missing"));
  assert.equal(runModule.filter((code) => code === "module-missing").length, 1);

  const covered = codes(convenerInput({ moduleId: "impl-core", run: { state: "pinned", runId: "r1", roles: ["implementer"], modules: ["impl-core"] } }));
  assert.equal(covered.includes("module-missing"), false);

  const noModules = codes(convenerInput({ moduleId: "impl-core", run: { state: "pinned", runId: "r1", roles: ["implementer"] } }));
  assert.equal(noModules.includes("module-missing"), false);
});

test("verifier 例外：模块存在即不要求属主，无 target-not-nominated/run-role-missing", () => {
  const baseVerifier = convenerInput({ targetRoleId: "verifier", targetBuiltIn: true, moduleId: "impl-core", d3Selected: [], run: { state: "pinned", runId: "r1", roles: ["qa"] } });
  const result = codes(baseVerifier);
  assert.equal(result.includes("module-not-owned"), false);
  assert.equal(result.includes("module-path-outside"), false);
  assert.equal(result.includes("target-not-nominated"), false);
  assert.equal(result.includes("run-role-missing"), false);
  assert.ok(codes(convenerInput({ targetRoleId: "verifier", targetBuiltIn: true, moduleId: "nope" })).includes("module-missing"));
  assert.ok(codes(convenerInput({ targetRoleId: "verifier", targetBuiltIn: true, moduleId: "impl-core", roster: undefined })).includes("roster-missing"));
});

test("模块路径等价性：反斜杠/绝对路径/../通配/目录与文件尾斜杠", () => {
  const check = (modulePaths: string[]): string[] => codes(convenerInput({ modulePaths }));
  assert.equal(check(["src\\a.ts"]).some((code) => code.startsWith("module-path-")), false);
  assert.equal(check(["src/a.ts"]).some((code) => code.startsWith("module-path-")), false);
  assert.equal(check(["src"]).some((code) => code.startsWith("module-path-")), false);
  assert.equal(check(["src/"]).some((code) => code.startsWith("module-path-")), false);
  assert.ok(check(["/x"]).includes("module-path-invalid"));
  assert.ok(check(["C:/x"]).includes("module-path-invalid"));
  assert.ok(check(["../x"]).includes("module-path-invalid"));
  assert.ok(check(["src/*"]).includes("module-path-invalid"));
  assert.ok(check(["tests/a.ts"]).includes("module-path-outside"));
  assert.ok(check(["package.json"]).includes("module-path-outside"));
});

test("独立 run advisory 顺序固定；链级 module-missing 已产出时不重复 run 专属同 code", () => {
  const ordered = codes(convenerInput({
    run: { state: "pinned", runId: "r1", roles: ["qa"], modules: ["impl-test"] },
    runFacts: { pinFailed: true, ledgerUnavailable: true, documentHashMismatch: true, pinnedRosterInvalid: true },
    versionedDocBaselineViolations: ["docs/product/x.md"],
  }));
  assert.deepEqual(ordered, [
    "run-pin-failed",
    "run-role-missing",
    "module-missing",
    "run-ledger-unavailable",
    "run-document-hash-mismatch",
    "run-pinned-roster-invalid",
    "versioned-doc-baseline-violation",
  ]);

  const chainModuleMissing = codes(convenerInput({
    moduleId: "nope",
    run: { state: "pinned", runId: "r1", roles: ["implementer"], modules: ["impl-core"] },
  }));
  assert.equal(chainModuleMissing.filter((code) => code === "module-missing").length, 1);
});

test("verifier run 专属模块覆盖：pinned modules 不含 moduleId 时产 module-missing", () => {
  const result = codes(convenerInput({
    targetRoleId: "verifier",
    targetBuiltIn: true,
    moduleId: "impl-core",
    d3Selected: [],
    run: { state: "pinned", runId: "r1", roles: ["qa"], modules: ["impl-test"] },
  }));
  assert.ok(result.includes("module-missing"));
});

test("convener→chief：collector 不产状态提示（授权拒绝由硬矩阵覆盖）", () => {
  const result = codes(convenerInput({ targetRoleId: "chief", targetBuiltIn: true }));
  // collector 不产出授权拒绝；此处只确认不产 target-not-nominated/module-* 等状态提示。
  assert.equal(result.includes("target-not-nominated"), false);
  assert.equal(result.includes("module-not-owned"), false);
});

test("空 advisory 与永不返回拒绝", () => {
  assert.deepEqual(collectDispatchAdvisories(input()), []);
  const minimal = collectDispatchAdvisories(input({ roster: undefined, run: undefined, d3Selected: [] }));
  assert.ok(Array.isArray(minimal));
  assert.equal(Object.prototype.hasOwnProperty.call(minimal, "ok"), false);
});
