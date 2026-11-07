// test/编排/rapporteur-module-consumption.test.ts
// X-R2（E2 S2/S4）rapporteur 单元消费点回归：
//  - run-role：rapporteur 角色专属工具（requestRequirementChange / submitVersionChange /
//    selectRunChange）改读已装配角色模块 `tools()`（D1 装配表校验）；trio 注入同一引用，single+rapporteur
//    结构不可达（R-7），未注入 ⇒ 能力位缺席；卡种/默认卡读模块 `cards`（decision 卡不默认化）；
//  - version-change-runtime：`kind=detail-amendment` direct 路径在既有早退之后调用 rapporteur
//    `preflight.checkAction("detail-amendment", …)`；allow 不替代 Service（畸形目标仍由既有回执拒绝）；
//  - trunk-runtime：run-change 两个入口（direct continue-frozen 包装 / host stop+restart 准备）调用
//    `preflight.checkAction("run-change", …)`；deny 映射既有回执码/文案；allow ≠ 停稳（Service
//    `run-stop-unverified` 语义保留，wrapper 之后仍原样调用 `service.selectRunChange`）；
//  - apply-journal：rapporteur 条件仍为 Service 事务/账本/证据，不接角色模块策略（无改动守卫）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGuardFreezeRegistry } from "../../src/provider/version-change/public/version-change-store.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createDirectRoleRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { rapporteurRoleModule } from "../../src/common/roles/rapporteur/index.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestRequirementChangeFn,
  RoleSession,
  RuntimeAdapter,
  SelectRunChangeFn,
  SelectRunChangeInput,
  SessionEvent,
  SubmitVersionChangeFn,
  WriteGate,
} from "../../src/model/runtime.ts";
import { TRUNK_MANIFEST_SCHEMA, type TrunkManifest } from "../../src/model/trunk.ts";

const at = "2026-11-07T00:00:00.000Z";
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

/** rapporteur 模块必须提供 preflight（BuiltInRoleModule 中为可选字段；本单元依赖其存在）。 */
function rapporteurPreflight() {
  const preflight = rapporteurRoleModule.preflight;
  assert.ok(preflight !== undefined, "rapporteur 模块必须提供 preflight");
  return preflight;
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

const requestRequirementChange: RequestRequirementChangeFn = async () => ({
  ok: true,
  code: "dispatched",
  message: "已提交需求变更审批",
  flowId: "demo",
  requestId: "req-xr2",
});
const submitVersionChange: SubmitVersionChangeFn = async () => ({
  ok: true,
  applicationId: "vc-xr2",
  status: "submitted",
});
const selectRunChange: SelectRunChangeFn = async input => ({
  ok: false,
  status: "blocked",
  operationId: input.operationId,
  runId: input.runId,
  baseDigest: input.expectedPinDigest,
  targetDigest: null,
  errorCode: "fixture",
  message: "fixture",
});

function trioProject(root: string, roleId: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [roleId],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:xr2-rapporteur" },
    },
  };
}

function singleProject(root: string, roleId: string): ProjectConfig {
  return { ...trioProject(root, roleId), governanceModel: "single" };
}

test("X-R2 run-role：trio rapporteur 注入模块声明的三工具（同一引用）；未提供 ⇒ 缺席；single 结构不可达", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr2-roles-"));
  try {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "rapporteur", project: trioProject(root, "rapporteur"), requestRequirementChange, submitVersionChange, selectRunChange },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.caps?.requestRequirementChange, requestRequirementChange, "requestRequirementChange 同一引用");
      assert.equal(captured.caps?.submitVersionChange, submitVersionChange, "submitVersionChange 同一引用");
      assert.equal(captured.caps?.selectRunChange, selectRunChange, "selectRunChange 同一引用");
    } finally {
      await handle.dispose();
    }

    // 未提供能力 ⇒ 字段缺席（工具不注册；fail-closed）。
    const empty: Captured = {};
    const emptyHandle = await openRoleSession(
      { roleId: "rapporteur", project: trioProject(root, "rapporteur") },
      { createAdapter: capturingFactory(empty) },
    );
    try {
      assert.equal(empty.caps?.requestRequirementChange, undefined);
      assert.equal(empty.caps?.submitVersionChange, undefined);
      assert.equal(empty.caps?.selectRunChange, undefined);
    } finally {
      await emptyHandle.dispose();
    }

    // R-7：single + rapporteur 生产不可达（门禁引擎结构性拒绝）；旧回退分支保留但不经生产入口暴露。
    await assert.rejects(
      openRoleSession(
        { roleId: "rapporteur", project: singleProject(root, "rapporteur"), requestRequirementChange, submitVersionChange, selectRunChange },
        { createAdapter: capturingFactory({}) },
      ),
      /single/,
    );
    // 模块声明与旧注入集合逐项一致（trio）。
    assert.deepEqual([...rapporteurRoleModule.tools({ governanceModel: "trio" }).tools].sort(), [
      "requestRequirementChange",
      "selectRunChange",
      "submitVersionChange",
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R2 卡种：rapporteur 模块 cards 与迁移前表逐项一致；默认卡走模块且 decision 不默认化（源码锚点）", async () => {
  assert.deepEqual([...rapporteurRoleModule.cards], ["proposal", "decision"]);
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.match(runRole, /case "rapporteur":\s*\n\s*\/\/ X-R2[\s\S]*?return defaultChoiceKindFromModule\("rapporteur", optionIds\);/,
    "rapporteur 默认卡种改读模块 cards");
  assert.doesNotMatch(runRole, /case "rapporteur":\s*\n\s*return has\("accept"\) \? "proposal"/,
    "旧内联默认卡种条件已删除");
  assert.doesNotMatch(runRole, /\n {2}rapporteur: \["proposal", "decision"\],/,
    "TRIO_CARD_KINDS.rapporteur 迁移前表项已删除（模块为唯一真源）");
  assert.match(runRole, /const module = builtInRoleModuleOf\(roleId\);\s*\n\s*if \(module !== undefined\) return module\.cards;/,
    "cardKindsOf 先读已装配模块");
  assert.match(runRole, /return TRIO_CARD_KINDS\[roleId\] \?\? NO_CARD_KINDS;/, "迁移已完成角色模块缺席 ⇒ fail-closed 空集");
  assert.match(runRole, /for \(const spec of BUILT_IN_GOVERNANCE_ROLES\) \{\s*\n\s*for \(const kind of cardKindsOf\(spec\.id\)\)/,
    "卡种反推遍历六内置角色（不依赖回退表键集）");
});

test("X-R2/X-R4 run-role：requestRequirementChange 角色声明读模块（rapporteur/convener；旧内联谓词已删除）", async () => {
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.match(runRole, /function moduleRoleDeclaresTool\(roleId: string, toolId: string\): boolean \{[\s\S]*?moduleToolDeclarationOf\(roleId, "trio"\)[\s\S]*?binding\.id === toolId/,
    "角色声明统一读模块 tools()（D1 校验后的 allow/tools）");
  assert.doesNotMatch(runRole, /function canRequestRequirementChange\(/, "旧内联谓词已删除");
  assert.match(runRole, /moduleRoleDeclaresTool\(trioSpec\.id, "requestRequirementChange"\)/,
    "注入门控经模块声明（rapporteur/convener）");
  assert.match(runRole, /requirementChange: moduleRoleDeclaresTool\(spec\.id, "requestRequirementChange"\)/,
    "矩阵快照经同一模块声明");
  assert.match(runRole, /const moduleToolsRole =[\s\S]{0,300}?setup\.role\.id === "rapporteur"/);
  assert.match(runRole, /moduleDeclaresTool\("selectRunChange"\)/);
  assert.match(runRole, /const legacySelectRunChange = directGovernance && setup\.role\.id === "rapporteur" \? input\.selectRunChange : undefined;/,
    "single/su/未装配回退旧角色门控");
});

async function directFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr2-vca-"));
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  const workflow = Buffer.from("# Workflow\n", "utf8");
  await fs.writeFile(path.join(root, "docs/workflow.md"), workflow);
  const store = createFsTrunkStore(root);
  const captured = await store.captureSnapshot!({
    snapshotId: "xr2-s1",
    createdAt: at,
    files: [{ path: "docs/workflow.md", sha256: sha(workflow) }],
  });
  assert.ok(captured.ok, JSON.stringify(captured));
  if (!captured.ok) throw new Error("snapshot fixture failed");
  const manifest: TrunkManifest = {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: 1,
    source: "bootstrap",
    previous: null,
    flowId: "demo",
    runId: null,
    artifacts: {
      documents: {},
      execution: { teamPlan: null, flow: null },
      workflow: { kind: "workflow", path: "docs/workflow.md", sha256: sha(workflow) },
      boundaries: {},
    },
    snapshotRef: captured.value,
    digest: sha("xr2-manifest-1"),
    createdAt: at,
    updatedAt: at,
  };
  assert.ok((await store.compareAndSwapManifest!(null, manifest, captured.value)).ok);
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const proposalPath = "docs/proposals/demo-proposal-v2.md";
  await fs.writeFile(path.join(root, proposalPath), "---\nschema: project-proposal/v2\n---\nAmended target bytes\n");
  const amendmentPath = "docs/proposals/demo-amendment-v1.md";
  await fs.writeFile(path.join(root, amendmentPath), `---\nschema: trunk-amendment/v1\namendmentId: am-xr2\nflowId: demo\ndocVersion: 1\nbaseTrunk:\n  trunkVersion: 1\n  runId: null\n  digest: ${manifest.digest}\nitems:\n  - itemId: proposal\n    kind: contract\n    change: add\n    to: ${proposalPath}\n---\nAmendment\n`);
  const service = createTrunkService({
    projectRoot: root,
    store,
    freezeRegistry: createGuardFreezeRegistry(root, { migrationCompleted: () => true }),
  });
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const runtime = createVersionChangeRuntime({
    projectRoot: root,
    services: integration.services,
    trunkService: service,
    directTrunkService: service,
    trunkRuntime: {
      applyApproved: async () => { throw new Error("ordinary approval path forbidden"); },
      bootstrap: async () => { throw new Error("ordinary bootstrap path forbidden"); },
    },
    emitEvent: async () => {},
    notifyDirect: async () => {},
  });
  const input = {
    kind: "detail-amendment" as const,
    initiatorRoleId: "rapporteur" as const,
    flowId: "demo",
    summary: "Apply the whole detail amendment",
    operationId: "xr2-detail-submit",
    baseTrunk: { version: 1, digest: manifest.digest },
    amendmentId: "am-xr2",
    amendmentDocPath: amendmentPath,
    targets: [{ kind: "contract" as const, path: proposalPath, action: "add" as const, expectedFromSha256: null }],
  };
  return { root, store, manifest, runtime, service, proposalPath, amendmentPath, input };
}

test("X-R2 VCA direct：rapporteur detail-amendment 事实包被模块接受；allow 不替代 Service（畸形目标仍按既有码拒绝）", async () => {
  // 运行时供给的事实包与 api-spec §5.3 登记键逐字一致，且模块必须 allow（否则生产直提被误拒）。
  const decision = rapporteurPreflight().checkAction({
    action: "detail-amendment",
    facts: { initiatorRoleId: "rapporteur", kind: "detail-amendment", wholeOrder: true, legacyCardPath: "none" },
  });
  assert.deepEqual(decision, { allow: true });

  const f = await directFixture();
  try {
    // 既有早退：真实 actor 必须为 rapporteur（preflight 之前）。
    const wrongActor = await f.runtime.submitDirect({ ...f.input, kind: "version-upgrade", initiatorRoleId: "product" }, "rapporteur");
    assert.equal(wrongActor.status, "rejected");
    assert.equal(wrongActor.errorCode, "vca-role-not-allowed");

    // preflight allow 之后仍由 Service 拒绝（缺 expectedFromSha256 ⇒ 迁移前既有 vca-target-invalid），
    // 且拒绝不落盘——证明 allow 不是权限、不替代 `prepareDirectSubmission`。
    const rejected = await f.runtime.submitDirect({
      ...f.input,
      operationId: "xr2-detail-missing-expected",
      targets: [{ kind: "contract", path: f.proposalPath, action: "add" }],
    }, "rapporteur");
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.errorCode, "vca-target-invalid");
    const current = await f.store.readManifest();
    assert.ok(current.ok, JSON.stringify(current));
    if (current.ok) assert.equal(current.value.digest, f.manifest.digest, "拒绝不改变 trunk");

    // detail-amendment 不经过 product 模块：product preflight 的 initiator 校验不会误拒 rapporteur。
    assert.match(
      await fs.readFile(new URL("../../src/pipeline/orchestration/version-change-runtime.ts", import.meta.url), "utf8"),
      /else if \(input\.kind === "detail-amendment"\) \{[\s\S]*?builtInRoleModuleOf\("rapporteur"\)\?\.preflight[\s\S]*?checkAction\(\{ action: "detail-amendment", facts \}\)/,
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

const validRunChange: SelectRunChangeInput = {
  operationId: "xr2-run-choice",
  runId: "run-xr2-choice",
  expectedPinDigest: "a".repeat(64),
  targetTrunk: { version: 2, digest: "b".repeat(64) },
  mode: "continue-frozen",
  reason: "Keep the actual frozen run until its work is closed",
};

test("X-R2 run-change：模块事实包；直接 wrapper 的 deny 与迁移前 Service 首检码/文案逐字一致（旧/新双跑）", async () => {
  assert.deepEqual(
    rapporteurPreflight().checkAction({
      action: "run-change",
      facts: {
        initiatorRoleId: "rapporteur",
        mode: validRunChange.mode,
        operationId: validRunChange.operationId,
        runId: validRunChange.runId,
        expectedPinDigest: validRunChange.expectedPinDigest,
        targetTrunkVersion: validRunChange.targetTrunk.version,
        targetTrunkDigest: validRunChange.targetTrunk.digest,
        reason: validRunChange.reason,
      },
    }),
    { allow: true },
  );

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr2-runchange-"));
  try {
    const service = createTrunkService({ projectRoot: root });
    const runtime = createDirectRoleRuntime({ projectRoot: root, actorRoleId: "rapporteur", notifyDirect: async () => {} });
    const runtimeChief = createDirectRoleRuntime({ projectRoot: root, actorRoleId: "chief", notifyDirect: async () => {} });

    // 非 rapporteur 来源：模块 deny（initiator-mismatch）→ 既有 `run-change-invalid` + 迁移前文案。
    const oldChief = await service.selectRunChange(validRunChange, "chief");
    const newChief = await runtimeChief.selectRunChange(validRunChange);
    assert.equal(newChief.status, "rejected");
    assert.equal(newChief.errorCode, oldChief.ok === false ? oldChief.errorCode : "unexpected");
    assert.equal(newChief.message, oldChief.ok === false ? oldChief.message : "unexpected");
    assert.equal(newChief.errorCode, "run-change-invalid");

    // 非法 mode：模块 deny（mode-invalid）与 Service 首检同码同文案。
    const badMode = { ...validRunChange, operationId: "xr2-run-bad-mode", mode: "invented-mode" } as unknown as SelectRunChangeInput;
    const oldBadMode = await service.selectRunChange(badMode, "rapporteur");
    const newBadMode = await runtime.selectRunChange(badMode);
    assert.equal(newBadMode.status, "rejected");
    assert.equal(newBadMode.errorCode, oldBadMode.ok === false ? oldBadMode.errorCode : "unexpected");
    assert.equal(newBadMode.message, oldBadMode.ok === false ? oldBadMode.message : "unexpected");
    assert.equal(newBadMode.errorCode, "run-change-invalid");

    // 空 runId：模块 deny（facts-invalid/runId）→ 既有 `run-evidence-unavailable` + "run-corrupt"，
    // 与迁移前 Service（readRunRecord 空 id ⇒ corrupt）逐字一致。
    const emptyRunId = { ...validRunChange, operationId: "xr2-run-empty-run", runId: "" };
    const oldEmptyRunId = await service.selectRunChange(emptyRunId, "rapporteur");
    const newEmptyRunId = await runtime.selectRunChange(emptyRunId);
    assert.equal(newEmptyRunId.status, "rejected");
    assert.equal(newEmptyRunId.errorCode, oldEmptyRunId.ok === false ? oldEmptyRunId.errorCode : "unexpected");
    assert.equal(newEmptyRunId.message, oldEmptyRunId.ok === false ? oldEmptyRunId.message : "unexpected");
    assert.equal(newEmptyRunId.errorCode, "run-evidence-unavailable");

    // 空 operationId：模块 deny（facts-invalid/operationId）→ 既有 `run-change-invalid` 同文案。
    const emptyOperation = { ...validRunChange, operationId: "" };
    const oldEmptyOperation = await service.selectRunChange(emptyOperation, "rapporteur");
    const newEmptyOperation = await runtime.selectRunChange(emptyOperation);
    assert.equal(newEmptyOperation.status, "rejected");
    assert.equal(newEmptyOperation.errorCode, oldEmptyOperation.ok === false ? oldEmptyOperation.errorCode : "unexpected");
    assert.equal(newEmptyOperation.message, oldEmptyOperation.ok === false ? oldEmptyOperation.message : "unexpected");
    assert.equal(newEmptyOperation.errorCode, "run-change-invalid");

    // allow ≠ 提交成功：合法形状在无 run 证据时仍由 Service 拒绝（不是 preflight 伪造成功）。
    const noEvidence = await runtime.selectRunChange({ ...validRunChange, operationId: "xr2-run-no-evidence" });
    assert.equal(noEvidence.ok, false);
    assert.equal(noEvidence.status, "rejected");
    assert.equal(noEvidence.errorCode, "run-evidence-unavailable");
    assert.equal(noEvidence.message, "run-missing", "缺失 run 的既有 Service 文案");

    // 模块 deny 不写任何账本/运行状态（目录不存在 ⇒ 无副作用）。
    await assert.rejects(fs.access(path.join(root, ".ans/runs")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R2 run-change：stop/stop-and-restart 保留 Service `run-stop-unverified`；preflight 只做角色侧判定", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr2-stop-"));
  try {
    // 有已知 run/pin/目标但模式为 stop：迁移前 Service 在 pin 一致后返回 blocked(run-stop-unverified)。
    // 这里不重建完整 run 证据；以模块事实包 allow + 源码顺序守卫证明 preflight 不放行、不替代停稳：
    const runtimeSrc = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
    assert.match(runtimeSrc, /selectRunChange: async \(request, signal\) => \{[\s\S]*?builtInRoleModuleOf\("rapporteur"\)\?\.preflight[\s\S]*?const receipt = await service\.selectRunChange\(request, input\.actorRoleId\);/,
      "preflight 在 `service.selectRunChange` 之前，Service 调用与 stop 语义原样保留");
    assert.match(runtimeSrc, /export async function prepareRunChange[\s\S]*?builtInRoleModuleOf\("rapporteur"\)\?\.preflight[\s\S]*?service\.prepareRunChange\(/,
      "host stop/restart 准备路径同样只在既有 actor 证明之后调用 preflight，Service 两阶段校验不变");
    assert.match(runtimeSrc, /run-stop-unverified/, "既有停稳拒绝语义仍在 Service 侧");
    for (const mode of ["stop", "stop-and-restart"] as const) {
      assert.deepEqual(
        rapporteurPreflight().checkAction({
          action: "run-change",
          facts: {
            initiatorRoleId: "rapporteur",
            mode,
            operationId: `xr2-${mode}`,
            runId: "run-xr2-stop",
            expectedPinDigest: "c".repeat(64),
            targetTrunkVersion: 1,
            targetTrunkDigest: "d".repeat(64),
            reason: "Stop only through the actual lifecycle owner",
          },
        }),
        { allow: true },
        `模块 allow 只管角色侧策略（${mode}）；停稳仍归 Service/宿主`,
      );
    }
    // preflight 不写任何账本/运行状态。
    await assert.rejects(fs.access(path.join(root, ".ans")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("X-R2 接缝守卫：消费点经 Service 公共出口；apply-journal 不接 rapporteur 策略", async () => {
  const runRole = await fs.readFile(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  assert.match(runRole, /from "\.\.\/\.\.\/service\/role\/resolve-role\.ts"/);
  assert.match(runRole, /moduleToolDeclarationOf\(roleId, "trio"\)/);

  const vcaRuntime = await fs.readFile(new URL("../../src/pipeline/orchestration/version-change-runtime.ts", import.meta.url), "utf8");
  assert.match(vcaRuntime, /legacyCardPath: "none"/);
  assert.match(vcaRuntime, /wholeOrder: true/);
  assert.match(vcaRuntime, /rapporteurDetailAmendmentRejection\(decision\)/);

  const trunkRuntime = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  assert.match(trunkRuntime, /from "\.\.\/\.\.\/service\/role\/resolve-role\.ts"/);
  assert.match(trunkRuntime, /rapporteurRunChangeFacts\("rapporteur", input\.request\)/);
  assert.match(trunkRuntime, /rapporteurRunChangeRejection\(decision, "host"\)/);

  const applyJournal = await fs.readFile(new URL("../../src/service/trunk/impl/apply-journal.ts", import.meta.url), "utf8");
  assert.doesNotMatch(applyJournal, /builtInRoleModuleOf|validateRoleToolDeclaration/,
    "apply-journal 不接角色工具声明策略");
  assert.doesNotMatch(applyJournal, /action: "run-change"/,
    "rapporteur 角色策略经 Pipeline 消费点调用");
  assert.match(
    applyJournal,
    /verifierRoleModule\.preflight\?\.checkAction\(\{[\s\S]{0,200}?action: "review"/,
    "apply-journal 唯一的角色策略消费是 verifier review 前置（X-R5）",
  );
  assert.match(applyJournal, /if \(input\.mode !== "continue-frozen"\) return \{ \.\.\.rejected\("run-stop-unverified"/,
    "Service 停稳拒绝语义逐字保留");
});
