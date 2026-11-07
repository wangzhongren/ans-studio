// test/编排/nominator-module-consumption.test.ts
// X-R3（E2 S2/S4）nominator 单元消费点回归：
//  - run-role：nominator 工具注入（activateRoleDocuments）改读已装配角色模块 `tools()`（D1 装配表校验）；
//    trio 注入同一引用，single/su/未装配回退旧角色门控；卡种白名单读模块 `cards`，默认卡种保持不默认；
//  - run-role + workflow-preconditions：D3 卡在既有 `validateAppointmentCardAgainstRoster` 之后调用
//    nominator `preflight.checkAction("appointment", stage:"d3-card")`；事实包严格按 api-spec 登记键，
//    旧/新 allow/deny 差分逐例一致；deny 走既有 `appointment-invalid` 回执（不发卡、不写账本）；
//  - trunk-runtime：三文档激活在 `validateRoleDocumentsSnapshot`/`validateBoundaryYamlText` 之后调用
//    `stage:"role-documents"` 事实包；deny 映射既有 `activation-not-ready` 回执；allow 不替代 Service；
//  - apply-journal：nominator 角色策略不在 Service 内接线（事务/账本/证据/D3 最终校验保留）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { nominatorRoleDocumentsFacts } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  nominationD3CardFacts,
  parseProjectRoster,
  rosterContainsBuiltInRoleIds,
  rosterRoleIds,
  validateAppointmentCardAgainstRoster,
} from "../../src/common/编排/workflow-preconditions.ts";
import { nominatorRoleModule } from "../../src/common/roles/nominator/index.ts";
import type { RolePreflightInput } from "../../src/model/role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { ActiveRoleEvidence, CompleteSnapshot } from "../../src/model/trunk.ts";
import { COMPLETE_SNAPSHOT_SCHEMA } from "../../src/model/trunk.ts";
import type { PreparedRoleActivation } from "../../src/service/trunk/public/trunk-service.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/model/runtime.ts";

const at = "2026-11-07T00:00:00.000Z";
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具省略装配/入口角色",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    modules:",
  "      - qa-suite",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现 CLI",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.js",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 独立测试",
  "    path: test/",
  "    category: core",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

function loadedRoster(text: string = ROSTER_TEXT) {
  const parsed = parseProjectRoster(text, "focus");
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.reason);
  return { roster: parsed.roster, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: sha(text) };
}

/** D3 卡事实键（api-spec §公共事实键 + §stage=d3-card；`intentEntryConsistent` 为可选诊断，不传）。 */
const D3_CARD_FACT_KEYS = [
  "stage",
  "flowId",
  "rosterFound",
  "rosterVersion",
  "rosterSha256",
  "rosterRoleIds",
  "rosterEnvBootstrapOmitted",
  "rosterContainsBuiltInRoleIds",
  "d3CardMultiple",
  "d3CardOptionRoleIds",
  "d3CardRecommendedRoleIds",
].sort();

const ROLE_DOCUMENTS_FACT_KEYS = [
  "stage",
  "flowId",
  "rosterFound",
  "rosterVersion",
  "rosterSha256",
  "rosterRoleIds",
  "rosterEnvBootstrapOmitted",
  "rosterContainsBuiltInRoleIds",
  "targetRoleId",
  "targetIsBuiltIn",
  "d3Present",
  "d3By",
  "d3TargetRoleIds",
  "d3RosterVersion",
  "d3RosterSha256",
  "d3DecisionId",
  "operationId",
  "planCompleted",
  "planRoleIds",
  "cardPath",
  "cardSha256",
  "boundaryMdPath",
  "boundaryMdSha256",
  "boundaryYamlPath",
  "boundaryYamlSha256",
  "boundaryWithinRoleModules",
  "boundaryMdYamlSynchronized",
  "roleCardRequiredSections",
].sort();

function nominatorPreflight(): NonNullable<typeof nominatorRoleModule.preflight> {
  const preflight = nominatorRoleModule.preflight;
  assert.ok(preflight !== undefined, "nominator 模块必须提供 preflight");
  return preflight;
}

function decide(facts: Record<string, unknown>) {
  return nominatorPreflight().checkAction({ action: "appointment", facts } as RolePreflightInput);
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

function projectConfig(root: string, governanceModel: "trio" | "single"): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel,
    builtInRoles: ["nominator"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:xr3-nominator" },
    },
  };
}

test("X-R3 run-role：trio nominator 注入模块声明的 activateRoleDocuments（同一引用）；未提供 ⇒ 缺席；single 结构不可达", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr3-roles-"));
  try {
    const activateRoleDocuments = async () => ({ ok: false as const, status: "blocked" as const, operationId: "fixture", baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" });
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "nominator", project: projectConfig(root, "trio"), activateRoleDocuments },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.caps?.activateRoleDocuments, activateRoleDocuments, "activateRoleDocuments 同一引用");
    } finally {
      await handle.dispose();
    }

    // 未提供能力 ⇒ 字段缺席（工具不注册；fail-closed）。
    const empty: Captured = {};
    const emptyHandle = await openRoleSession(
      { roleId: "nominator", project: projectConfig(root, "trio") },
      { createAdapter: capturingFactory(empty) },
    );
    try {
      assert.equal(empty.caps?.activateRoleDocuments, undefined);
    } finally {
      await emptyHandle.dispose();
    }

    // single + nominator 生产不可达（single→su，门禁引擎结构性拒绝）；旧回退分支保留但不经生产入口暴露。
    await assert.rejects(
      openRoleSession({ roleId: "nominator", project: projectConfig(root, "single"), activateRoleDocuments }, { createAdapter: capturingFactory({}) }),
      /single/,
    );
    // 模块声明与旧注入集合逐项一致（trio；single 空集）。
    assert.deepEqual([...nominatorRoleModule.tools({ governanceModel: "trio" }).tools], ["activateRoleDocuments"]);
    assert.deepEqual([...nominatorRoleModule.tools({ governanceModel: "single" }).tools], []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R3 卡种/工具切换点（源码锚点）：TRIO_CARD_KINDS.nominator 已删除；activateRoleDocuments 读模块声明并保留旧回退", async () => {
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.match(
    runRole,
    /const moduleToolsRole =[\s\S]{0,300}?setup\.role\.id === "nominator"/,
    "nominator 进入模块工具声明路径",
  );
  assert.match(runRole, /const moduleActivateRoleDocuments = moduleDeclaresTool\("activateRoleDocuments"\);/);
  assert.match(
    runRole,
    /const legacyActivateRoleDocuments = directGovernance && setup\.role\.id === "nominator" \? input\.activateRoleDocuments : undefined;/,
    "single/su/未装配回退旧角色门控",
  );
  assert.doesNotMatch(runRole, /\n {2}nominator: \["appointment", "appointment-write"\],/, "TRIO_CARD_KINDS.nominator 迁移前表项已删除");
  assert.match(runRole, /case "nominator":\s*\n\s*\/\/ X-R3[\s\S]*?return undefined;/, "nominator 默认卡种保持不默认");
  assert.match(runRole, /const module = builtInRoleModuleOf\(roleId\);\s*\n\s*if \(module !== undefined\) return module\.cards;/);
});

test("X-R3 D3 卡事实包：严格 api-spec 登记键；模块 allow；旧 validateAppointmentCardAgainstRoster 差分逐例一致", () => {
  const roster = loadedRoster();
  assert.equal(rosterContainsBuiltInRoleIds(roster.roster), false);
  assert.deepEqual(rosterRoleIds(roster.roster), ["implementer", "qa"]);

  const facts = nominationD3CardFacts({
    roster,
    multiple: true,
    optionIds: ["qa", "implementer"],
    recommendedRoleIds: ["implementer", "qa"],
  });
  assert.ok(facts !== undefined);
  if (facts === undefined) return;
  assert.deepEqual(Object.keys(facts).sort(), D3_CARD_FACT_KEYS, "只传登记键（未登记键会被模块拒绝）");
  assert.deepEqual(decide(facts), { allow: true });

  const cases: Array<{ name: string; optionIds: string[]; multiple: boolean; recommendedRoleIds: string[] }> = [
    { name: "合法", optionIds: ["qa", "implementer"], multiple: true, recommendedRoleIds: ["implementer", "qa"] },
    { name: "非多选", optionIds: ["qa", "implementer"], multiple: false, recommendedRoleIds: ["implementer", "qa"] },
    { name: "缺项", optionIds: ["implementer"], multiple: true, recommendedRoleIds: ["implementer"] },
    { name: "多项", optionIds: ["implementer", "qa", "extra"], multiple: true, recommendedRoleIds: ["implementer", "qa", "extra"] },
    { name: "含内置", optionIds: ["implementer", "qa", "chief"], multiple: true, recommendedRoleIds: ["implementer", "qa"] },
    { name: "重复项", optionIds: ["qa", "qa"], multiple: true, recommendedRoleIds: ["qa"] },
  ];
  for (const item of cases) {
    const old = validateAppointmentCardAgainstRoster({
      roster: roster.roster,
      optionIds: item.optionIds,
      multiple: item.multiple,
    });
    const candidateFacts = nominationD3CardFacts({ roster, multiple: item.multiple, optionIds: item.optionIds, recommendedRoleIds: item.recommendedRoleIds });
    assert.ok(candidateFacts !== undefined, item.name);
    if (candidateFacts === undefined) continue;
    const decision = decide(candidateFacts);
    assert.equal(decision.allow, old.ok, `旧/新 allow 位一致：${item.name}`);
  }

  // flowId 非治理 slug ⇒ 事实包不可按 api-spec 构造：返回 undefined（调用方跳过，不新增拒绝）。
  const nonSlug = { ...roster, roster: { ...roster.roster, flowId: "Focus Flow" } };
  assert.equal(nominationD3CardFacts({ roster: nonSlug, multiple: true, optionIds: ["qa", "implementer"], recommendedRoleIds: ["implementer", "qa"] }), undefined);
});

function syntheticActivation(overrides: { flowId?: string; omitD3DecisionId?: boolean } = {}): PreparedRoleActivation {
  const roster = loadedRoster();
  const planPath = "docs/scheduling/focus-team-v2.md";
  const planText = `---\n${JSON.stringify({
    schema: "teamPlanSchema:3",
    flowId: "focus",
    version: 2,
    modules: { path: "docs/proposals/focus-modules-v1.md", sha256: "1".repeat(64) },
    roster: { path: roster.path, sha256: roster.sha256 },
    roleRows: [
      { roleId: "implementer", modules: ["impl-core"], writesets: ["src/"], dependsOn: [] },
      { roleId: "qa", modules: ["qa-suite"], writesets: ["test/"], dependsOn: [] },
    ],
  })}\n---\n# Real team plan\n`;
  const resolved = {
    v: 1,
    at,
    kind: "request.resolved",
    requestId: "xr3-d3-request",
    decisionId: "xr3-d3-decision",
    by: "customer",
    cardKind: "appointment",
    choice: "implementer",
    targetRoleIds: ["implementer"],
    rosterVersion: 1,
    rosterSha256: roster.sha256,
  };
  const d3Text = JSON.stringify({
    createdBytesBase64: Buffer.from(JSON.stringify({ v: 1, at, kind: "request.created", requestId: resolved.requestId, flowId: "focus", sourceRoleId: "nominator", cardKind: "appointment", title: "D3", options: [{ id: "implementer", label: "实现" }, { id: "qa", label: "测试" }] })).toString("base64"),
    resolvedBytesBase64: Buffer.from(JSON.stringify(resolved)).toString("base64"),
  });
  const cardPath = "角色卡/implementer/role-card.md";
  const boundaryMdPath = "角色卡/implementer/boundary.md";
  const boundaryYamlPath = "角色卡/implementer/boundary.yaml";
  const files = [
    { path: roster.path, sha256: roster.sha256, bytesBase64: Buffer.from(ROSTER_TEXT).toString("base64") },
    { path: planPath, sha256: sha(planText), bytesBase64: Buffer.from(planText).toString("base64") },
    { path: ".ans/role-evidence/d3-xr3.json", sha256: sha(d3Text), bytesBase64: Buffer.from(d3Text).toString("base64") },
    { path: cardPath, sha256: "a".repeat(64), bytesBase64: "" },
    { path: boundaryMdPath, sha256: "b".repeat(64), bytesBase64: "" },
    { path: boundaryYamlPath, sha256: "c".repeat(64), bytesBase64: "" },
  ];
  const snapshot: CompleteSnapshot = {
    schema: COMPLETE_SNAPSHOT_SCHEMA,
    snapshotId: "s-xr3-activation",
    digest: "d".repeat(64),
    files,
    createdAt: at,
  };
  const ref = (file: { path: string; sha256: string }) => ({ snapshotId: snapshot.snapshotId, path: file.path, sha256: file.sha256 });
  const evidence: ActiveRoleEvidence = {
    roleId: "implementer",
    snapshotRef: { snapshotId: snapshot.snapshotId, digest: snapshot.digest },
    rosterRef: ref(files[0]!),
    planRef: ref(files[1]!),
    d3Ref: ref(files[2]!),
    activationRef: { snapshotId: snapshot.snapshotId, path: ".ans/role-evidence/activation-xr3.json", sha256: "e".repeat(64) },
    cardRef: ref(files[3]!),
    boundaryMdRef: ref(files[4]!),
    boundaryYamlRef: ref(files[5]!),
    authorizationRef: { snapshotId: snapshot.snapshotId, path: ".ans/role-evidence/authorization-implementer.json", sha256: "f".repeat(64) },
  };
  return {
    input: {
      operationId: "xr3-activation",
      flowId: overrides.flowId ?? "focus",
      planRef: { snapshotId: snapshot.snapshotId, path: planPath, sha256: sha(planText) },
      d3DecisionId: overrides.omitD3DecisionId === true ? "another-decision" : "xr3-d3-decision",
      rosterRef: { snapshotId: snapshot.snapshotId, path: roster.path, sha256: roster.sha256 },
      targetRoleId: "implementer",
      documents: {
        card: { path: cardPath, sha256: "a".repeat(64) },
        boundaryMd: { path: boundaryMdPath, sha256: "b".repeat(64) },
        boundaryYaml: { path: boundaryYamlPath, sha256: "c".repeat(64) },
      },
    },
    snapshot,
    evidence,
    expectedTrunk: { version: 2, digest: "1".repeat(64) },
    expectedActive: { revision: 0, digest: null },
    targetActive: { revision: 1, digest: "2".repeat(64) },
    noOp: false,
    role: {
      roleId: "implementer",
      cardPath,
      boundaryMdPath,
      boundaryYamlPath,
      allowedPaths: [{ path: "src/", kind: "directory" }],
    },
    writesets: ["src/"],
  };
}

test("X-R3 role-documents 事实包：严格 api-spec 登记键；模块 allow；事实不可得 ⇒ undefined（跳过而非误拒）", () => {
  const activation = syntheticActivation();
  const facts = nominatorRoleDocumentsFacts(activation);
  assert.ok(facts !== undefined);
  if (facts === undefined) return;
  assert.deepEqual(Object.keys(facts).sort(), ROLE_DOCUMENTS_FACT_KEYS, "只传登记键（未登记键会被模块拒绝）");
  assert.deepEqual(decide(facts), { allow: true });

  const nonSlug = syntheticActivation({ flowId: "Focus Flow" });
  assert.equal(nominatorRoleDocumentsFacts(nonSlug), undefined, "flowId 非治理 slug ⇒ 跳过（迁移前路径）");
  const mismatchedDecision = syntheticActivation({ omitD3DecisionId: true });
  assert.equal(nominatorRoleDocumentsFacts(mismatchedDecision), undefined, "D3 decisionId 不一致 ⇒ 跳过（Service 已拒绝）");
});

test("X-R3 切换点顺序与 Service 最终校验保留（源码锚点）", async () => {
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.match(
    runRole,
    /const rosterCard = validateAppointmentCardAgainstRoster\(\{[\s\S]*?const nominatorPreflight = builtInRoleModuleOf\("nominator"\)\?\.preflight;[\s\S]*?checkAction\(\{ action: "appointment", facts: nominatorFacts \}\)/,
    "D3 preflight 在既有名单校验之后",
  );

  const trunkRuntime = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  assert.match(
    trunkRuntime,
    /validated = validateRoleDocumentsSnapshot\(\{ snapshot: value\.snapshot, roles: \[value\.role\] \}\);[\s\S]*?const boundary = validateBoundaryYamlText\([\s\S]*?const facts = nominatorRoleDocumentsFacts\(value\);[\s\S]*?checkAction\(\{ action: "appointment", facts \}\)/,
    "role-documents preflight 在 validateRoleDocumentsSnapshot/validateBoundaryYamlText 之后",
  );
  assert.match(
    trunkRuntime,
    /checkAction\(\{ action: "appointment", facts \}\)[\s\S]*?const protection = await readGitProtectionFacts\(input\.projectRoot\);/,
    "allow 之后仍走既有 Git/Service 最终提交路径（allow 不是权限）",
  );

  const applyJournal = await fs.readFile(new URL("../../src/service/trunk/impl/apply-journal.ts", import.meta.url), "utf8");
  assert.doesNotMatch(applyJournal, /builtInRoleModuleOf|validateRoleToolDeclaration/,
    "apply-journal 不接角色工具声明策略");
  assert.doesNotMatch(applyJournal, /action: "appointment"/,
    "nominator 角色策略经 Pipeline 消费点调用");
  assert.match(
    applyJournal,
    /verifierRoleModule\.preflight\?\.checkAction\(\{[\s\S]{0,200}?action: "review"/,
    "apply-journal 唯一的角色策略消费是 verifier review 前置（X-R5）",
  );
  assert.match(applyJournal, /X-R3（E2 S4，nominator）/, "Service 侧保留不接线理由");
});
