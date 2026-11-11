// test/编排/run-role-fixed-b31.test.ts
// T3「两条固定工作流路径」B3.1（2026-11-10，编排侧）：
//  ① fixed A3 意图确认卡——run-role 改调 `workflowService.prepareIntent/finalizeIntent`（应用算
//     intent hash/documentRefs/marker、docs/intents 校验、stage.completed A3），**不触** legacy trunk
//     `prepareIntentConfirmation/finalizeIntentConfirmation`/doc-freeze；卡事实/呈现与 legacy 同等语义；
//     finalize 失败 ⇒ pending-recovery（不静默通过）。legacy 分支仍走 trunk（marker 带 snapshot=）。
//  ② fixed chief 任命卡发起——fixedCards 矩阵允许 chief（legacy 仍仅 nominator 逐字）；选项=名单角色、
//     multiple、推荐集=名单顺序（应用重建）；A10 在办标记（stage.requested A10）⇒ `request.resolved`
//     后 `stage.completed A10` 合法，随后 A12a criteria 先派、chief 发 A11 stage-request 成功。
// 全程桩适配器 + 临时项目；不启动真实模型/Electron；不占用 9222/9223；无 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import {
  appendWorkflowEvent,
  readWorkflowLedger,
  requestStage,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView, nextStages } from "../../src/common/编排/workflow-state.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WorkflowEvent,
  WorkflowStage,
  WriteGate,
} from "../../src/model/runtime.ts";

const FLOW = "focus";
const D = "a".repeat(64);
const NOW_ISO = "2026-11-10T10:00:00.000Z";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const INTENT_TEXT = [
  "---",
  "schema: project-intent/v1",
  "flowId: focus",
  "version: 1",
  "intentId: focus-intent",
  "goal: 固定路径意图",
  "scope: B3.1 编排修复",
  "acceptance: 固定卡不触 trunk",
  "---",
  "# 意图",
  "",
  "固定路径的意图正文（卡片 preview 应包含本正文，与 legacy 同等语义）。",
  "",
].join("\n");

// project-roster/v4（B1 MF-IR-7）：fixed 路径名单 —— 角色顺序 implementer → qa；qa 为项目验收角色。
const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v4",
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
  "    review: true",
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

interface FixedProject {
  root: string;
  project: ProjectConfig;
}

/** 临时项目：trio + 意图/意图入口/名单/模块/提案/架构夹具（不触真实模型/网络）。 */
function fixedProject(options: { intentEntry?: boolean } = {}): FixedProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-b31-orch-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "product", "focus-intent-v1.md"), INTENT_TEXT, "utf8");
  if (options.intentEntry !== false) {
    fs.mkdirSync(path.join(root, "docs", "intents"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "intents", "focus-intent.md"), "---\nintentId: focus-intent\n---\n# 意图入口\n", "utf8");
  }
  fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "proposals", "focus-roster-v1.md"), ROSTER_TEXT, "utf8");
  const parsedRoster = parseProjectRoster(ROSTER_TEXT);
  if (!parsedRoster.ok) throw new Error(`fixture roster invalid: ${parsedRoster.reason}`);
  fs.writeFileSync(
    path.join(root, "docs", "proposals", "focus-modules-v1.md"),
    ["---", "schema: project-modules/v2", "flowId: focus", "version: 1",
      `modules: ${JSON.stringify(parsedRoster.roster.modules)}`, "---", "# 模块清单"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "docs", "proposals", "focus-proposal-v1.md"),
    "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "contracts", "focus-architecture-v1.md"),
    "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "角色卡"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "governance-boundary.yaml"), "role: governance\nentries: []\n");
  const project: ProjectConfig = {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:b31-orchestration" },
    },
  };
  return { root, project };
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function stubAdapter(): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
  gate: () => WriteGate | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  let capturedGate: WriteGate | undefined;
  return {
    caps: () => captured,
    gate: () => capturedGate,
    createAdapter: (gate, capabilities) => {
      captured = capabilities;
      capturedGate = gate;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "会话结束" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

async function withSession<T>(
  options: {
    roleId: string;
    project: ProjectConfig;
    customerInput: CustomerInputFn;
    workflowModeForFlow?: (flowId: string) => "fixed" | "legacy";
    taskId?: string;
  },
  fn: (caps: AdapterCapabilities, gate: WriteGate | undefined) => Promise<T>,
): Promise<T> {
  const stub = stubAdapter();
  const handle = await openRoleSession(
    {
      roleId: options.roleId,
      project: options.project,
      customerInput: options.customerInput,
      ...(options.workflowModeForFlow !== undefined ? { workflowModeForFlow: options.workflowModeForFlow } : {}),
      ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
    },
    { createAdapter: stub.createAdapter },
  );
  try {
    assert.ok(stub.caps() !== undefined, "适配器必须收到能力对象");
    assert.ok(stub.caps()!.customerInput !== undefined, "确认制会话必须注入 customerInput 包装器");
    return await fn(stub.caps()!, stub.gate());
  } finally {
    await handle.dispose();
  }
}

const BASE = { v: 1 as const, at: NOW_ISO, schema: "ans-workflow/v1" as const, path: "A" as const };

function startedEvent(workflowId: string): WorkflowEvent {
  return {
    ...BASE,
    kind: "workflow.started",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`,
    trigger: { by: "chief", reason: "seed" },
    sourceTaskId: "t-src",
  };
}

function requestedEvent(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE,
    kind: "stage.requested",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:1`,
    stage,
    requestTaskId: `t-req-${stage}-1`,
    requestDigest: D,
    attempt: 1,
  };
}

function completedEvent(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE,
    kind: "stage.completed",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`,
    stage,
    cause: { kind: "seed", ref: `seed-${stage}` },
    artifacts: [],
  };
}

/** 合成 A1..<last> 逐阶段 requested+completed 的合法账本。 */
async function seedWorkflowThrough(root: string, workflowId: string, stages: readonly WorkflowStage[]): Promise<void> {
  const events: WorkflowEvent[] = [startedEvent(workflowId)];
  for (const stage of stages) {
    events.push(requestedEvent(workflowId, stage), completedEvent(workflowId, stage));
  }
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

const intentCard = (): CustomerInputRequest => ({
  kind: "choice",
  title: "需求意图确认",
  cardKind: "intent-confirm",
  flowId: FLOW,
  question: "请确认意图",
  options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
});

const appointmentCard = (optionIds: string[], multiple = true): CustomerInputRequest => ({
  kind: "choice",
  title: "任命确认（按名单）",
  cardKind: "appointment",
  flowId: FLOW,
  multiple,
  options: optionIds.map((id) => ({ id, label: `模型标签-${id}` })),
});

// ————————————————— ① fixed A3 意图确认卡 —————————————————

test("fixed A3：prepareIntent/finalizeIntent（marker 无 snapshot、stage.completed A3、不触 trunk/doc-freeze）", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const requestId = "req-intent-b31-1";
    const captured: { request?: CustomerInputRequest; metadata?: CustomerInputMetadata } = {};
    let rawCalls = 0;
    const raw: CustomerInputFn = async (request, metadata) => {
      rawCalls += 1;
      captured.request = request;
      captured.metadata = metadata;
      assert.equal(request.kind, "choice");
      if (request.kind === "choice") {
        assert.match(
          request.question ?? "",
          /\[ans-intent-evidence path=docs\/product\/focus-intent-v1\.md sha256=[0-9a-f]{64} version=1\]/,
          "fixed marker 由 workflowService.prepareIntent 生成（path/sha256/version）",
        );
        assert.doesNotMatch(request.question ?? "", /snapshot=/, "fixed 不调用 legacy trunk prepareIntentConfirmation（其 marker 带 snapshot=）");
        assert.match(request.preview ?? "", /固定路径的意图正文/, "preview 含意图正文（与 legacy 同等语义）");
      }
      const created = taskEvent("request.created", {
        requestId,
        flowId: FLOW,
        cardKind: "intent-confirm",
        sourceRoleId: "chief",
        title: request.title,
        options: request.kind === "choice" ? request.options.map((option) => ({ id: option.id, label: option.label })) : [],
      });
      assert.equal((await appendTaskEvent(root, created)).ok, true);
      const resolved = taskEvent("request.resolved", {
        requestId,
        cardKind: "intent-confirm",
        decisionId: `decision-${requestId}`,
        selectedOptionIds: ["confirm"],
        documentRefs: [{ kind: "intent", path: "docs/product/focus-intent-v1.md", sha256: sha(INTENT_TEXT), version: 1 }],
        by: "customer",
        choice: "confirm",
      });
      assert.equal((await appendTaskEvent(root, resolved)).ok, true);
      return { outcome: "answered", value: { selected: ["confirm"] }, decisionId: `decision-${requestId}` } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
        assert.equal(rawCalls, 1, "fixed A3 卡必须到达客户通道（不被 legacy trunk 校验早退）");
        assert.equal(outcome?.outcome, "answered");
        assert.deepEqual(
          outcome?.outcome === "answered" ? outcome.intentConfirmation : undefined,
          { status: "committed" },
          "fixed finalize 成功 ⇒ 工具回执 intentConfirmation=committed（与 legacy 语义一致）",
        );
      },
    );
    const ledger = await readWorkflowLedger(root);
    const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
    assert.ok(wfEvents.some((event) => event.kind === "stage.requested" && event.stage === "A3"), "prepareIntent 记 A3 卡在办");
    const completed = wfEvents.find((event) => event.kind === "stage.completed" && event.stage === "A3");
    assert.ok(completed !== undefined, "finalizeIntent 记 stage.completed A3");
    if (completed?.kind === "stage.completed") {
      assert.equal(completed.cause.kind, "intent-confirmed");
      assert.equal(completed.cause.ref, requestId);
    }
    assert.equal(fs.existsSync(path.join(root, ".ans", "trunk")), false, "不触 legacy trunk");
    assert.equal(fs.existsSync(path.join(root, ".ans", "state", "doc-freezes.json")), false, "不写 doc-freeze");
  } finally {
    cleanup(root);
  }
});

test("fixed A3：docs/intents 入口缺失 ⇒ finalize 失败 pending-recovery（不写 stage.completed A3、不静默通过）", async () => {
  const { root, project } = fixedProject({ intentEntry: false });
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const requestId = "req-intent-b31-missing";
    let rawCalls = 0;
    const raw: CustomerInputFn = async (request) => {
      rawCalls += 1;
      assert.equal(request.kind, "choice");
      const created = taskEvent("request.created", {
        requestId,
        flowId: FLOW,
        cardKind: "intent-confirm",
        sourceRoleId: "chief",
        title: request.title,
        options: request.kind === "choice" ? request.options.map((option) => ({ id: option.id, label: option.label })) : [],
      });
      assert.equal((await appendTaskEvent(root, created)).ok, true);
      const resolved = taskEvent("request.resolved", {
        requestId,
        cardKind: "intent-confirm",
        decisionId: `decision-${requestId}`,
        selectedOptionIds: ["confirm"],
        documentRefs: [{ kind: "intent", path: "docs/product/focus-intent-v1.md", sha256: sha(INTENT_TEXT), version: 1 }],
        by: "customer",
        choice: "confirm",
      });
      assert.equal((await appendTaskEvent(root, resolved)).ok, true);
      return { outcome: "answered", value: { selected: ["confirm"] }, decisionId: `decision-${requestId}` } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
        assert.equal(rawCalls, 1);
        assert.equal(outcome?.outcome, "answered");
        const confirmation = outcome?.outcome === "answered" ? outcome.intentConfirmation : undefined;
        assert.equal(confirmation?.status, "pending-recovery", "finalize 失败 ⇒ pending-recovery");
        assert.equal(confirmation?.code, "intent-entry-missing");
      },
    );
    const ledger = await readWorkflowLedger(root);
    assert.equal(
      ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A3"),
      false,
      "intent entry 缺失时不得写 stage.completed A3",
    );
  } finally {
    cleanup(root);
  }
});

test("legacy A3：chief 意图链仍走 trunk prepareIntentConfirmation（marker 带 snapshot=；不写 fixed 账本）", async () => {
  const { root, project } = fixedProject();
  try {
    const captured: { request?: CustomerInputRequest; metadata?: CustomerInputMetadata } = {};
    let rawCalls = 0;
    const raw: CustomerInputFn = async (request, metadata) => {
      rawCalls += 1;
      captured.request = request;
      captured.metadata = metadata;
      return { outcome: "declined", reason: "stub-channel-declined" } satisfies CustomerInputOutcome;
    };
    // 缺省（无 workflowMode/workflowModeForFlow）＝ legacy；逐字旧行为。
    await withSession({ roleId: "chief", project, customerInput: raw }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "declined");
    });
    assert.equal(rawCalls, 1, "legacy trunk prepare 成功后照常呈现（stub 拒绝）");
    assert.match(
      captured.request?.kind === "choice" ? captured.request.question ?? "" : "",
      /\[ans-intent-evidence snapshot=[^\]]+ path=docs\/product\/focus-intent-v1\.md sha256=[0-9a-f]{64} version=1\]/,
      "legacy marker 仍由 trunk prepareIntentConfirmation 生成（带 snapshot=）",
    );
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.length, 0, "legacy 分支不写 fixed workflow 账本（stage.requested A3 仅 fixed）");
  } finally {
    cleanup(root);
  }
});

// ————————————————— ② fixed chief 任命卡（A10） —————————————————

test("fixed chief 任命卡：选项=名单（顺序/标签/推荐集由应用重建）、multiple、judgeContext 推荐集=名单顺序", async () => {
  const { root, project } = fixedProject();
  try {
    // B15.3：任命卡要求活动 workflow + A9 completed（fail-closed 前置）。
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"]);
    const captured: { request?: CustomerInputRequest; metadata?: CustomerInputMetadata } = {};
    let rawCalls = 0;
    const raw: CustomerInputFn = async (request, metadata) => {
      rawCalls += 1;
      captured.request = request;
      captured.metadata = metadata;
      return { outcome: "answered", value: { selected: ["implementer"] } } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const outcome = await caps.customerInput!(appointmentCard(["qa", "implementer"]), { flowId: FLOW });
        assert.equal(outcome?.outcome, "answered");
        assert.equal(rawCalls, 1, "fixed 矩阵 chief 可发起 appointment（fixedCards 含 appointment）");
      },
    );
    const request = captured.request;
    assert.ok(request !== undefined && request.kind === "choice");
    if (request?.kind !== "choice") return;
    assert.equal(request.multiple, true);
    assert.deepEqual(
      request.options.map((option) => option.id),
      ["implementer", "qa"],
      "选项按名单顺序重建（不采信模型自报顺序）",
    );
    assert.deepEqual(
      request.options.map((option) => option.label),
      ["实现者", "测试"],
      "选项标签取名单 displayName",
    );
    assert.deepEqual(
      request.options.map((option) => option.recommended === true),
      [true, true],
      "推荐集=名单顺序（应用从 roster 生成）",
    );
    assert.match(request.preview ?? "", /人员\+模块拓扑图/, "preview 附加名单拓扑图");
    assert.deepEqual(
      captured.metadata?.judgeContext?.recommendedRoleIds,
      ["implementer", "qa"],
      "judgeContext.recommendedRoleIds=名单顺序（fixed 矩阵卡同样生成判断上下文）",
    );
  } finally {
    cleanup(root);
  }
});

test("fixed 任命卡发起人：nominator/convener 被拒（fixedCards 无 appointment）；选项不一致/非多选不发卡", async () => {
  for (const roleId of ["nominator", "convener"]) {
    const { root, project } = fixedProject();
    try {
      let rawCalls = 0;
      const raw: CustomerInputFn = async () => {
        rawCalls += 1;
        return { outcome: "answered", value: { selected: ["implementer", "qa"] } } satisfies CustomerInputOutcome;
      };
      await withSession(
        { roleId, project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
        async (caps) => {
          const outcome = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
          assert.equal(outcome?.outcome, "declined", `${roleId} fixed 任命卡必须被拒`);
          assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
          assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /幕僚|chief/);
          assert.equal(rawCalls, 0, `${roleId} 的 fixed 任命卡不得触达客户通道`);
        },
      );
    } finally {
      cleanup(root);
    }
  }
  {
    const { root, project } = fixedProject();
    try {
      let rawCalls = 0;
      const raw: CustomerInputFn = async () => {
        rawCalls += 1;
        return { outcome: "answered", value: { selected: ["implementer"] } } satisfies CustomerInputOutcome;
      };
      await withSession(
        { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
        async (caps) => {
          const missing = await caps.customerInput!(appointmentCard(["implementer"]), { flowId: FLOW });
          assert.equal(missing?.outcome, "declined");
          assert.equal(missing?.outcome === "declined" ? missing.notPresented : undefined, true);
          assert.match(missing?.outcome === "declined" ? missing.reason ?? "" : "", /名单/);
          const notMultiple = await caps.customerInput!(appointmentCard(["implementer", "qa"], false), { flowId: FLOW });
          assert.equal(notMultiple?.outcome, "declined");
          assert.match(notMultiple?.outcome === "declined" ? notMultiple.reason ?? "" : "", /多选|multiple/);
          assert.equal(rawCalls, 0, "选项不一致/非多选均不得触达客户通道");
        },
      );
    } finally {
      cleanup(root);
    }
  }
});

test("legacy 任命卡发起人逐字不变：chief 被拒（仅 nominator）；nominator 照常发卡", async () => {
  {
    const { root, project } = fixedProject();
    try {
      let rawCalls = 0;
      const raw: CustomerInputFn = async () => {
        rawCalls += 1;
        return { outcome: "answered", value: { selected: ["implementer", "qa"] } } satisfies CustomerInputOutcome;
      };
      await withSession({ roleId: "chief", project, customerInput: raw }, async (caps) => {
        const outcome = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(outcome?.outcome, "declined");
        assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
        assert.equal(
          outcome?.outcome === "declined" ? outcome.reason : undefined,
          "招人决定卡（appointment）只能由人事（nominator）发起；本次未向客户发卡、未写任何记录。",
          "legacy 拒绝文案逐字不变",
        );
        assert.equal(rawCalls, 0);
      });
    } finally {
      cleanup(root);
    }
  }
  {
    const { root, project } = fixedProject();
    try {
      let rawCalls = 0;
      const raw: CustomerInputFn = async (request) => {
        rawCalls += 1;
        assert.equal(request.kind, "choice");
        return { outcome: "answered", value: { selected: ["implementer"] } } satisfies CustomerInputOutcome;
      };
      await withSession({ roleId: "nominator", project, customerInput: raw }, async (caps) => {
        const outcome = await caps.customerInput!(appointmentCard(["qa", "implementer"]), { flowId: FLOW });
        assert.equal(outcome?.outcome, "answered");
        assert.equal(rawCalls, 1, "legacy nominator 仍可发起任命卡（旧行为逐字保留）");
      });
    } finally {
      cleanup(root);
    }
  }
});

test("fixed A10：卡在办标记 stage.requested A10 ⇒ request.resolved 后 stage.completed A10 合法；A12a 先派后 A11 stage-request 成功", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"]);
    const requestId = "req-a10-b31-1";
    let rawCalls = 0;
    // 模拟应用通道/桌面 B3（固定卡绑定与裁决后的阶段事件）：request.created/resolved（workflowId/stage
    // A10/targetRoleIds）+ `stage.completed A10`（应用唯一实现，幂等键与桌面一致）。
    const raw: CustomerInputFn = async (request) => {
      rawCalls += 1;
      assert.equal(request.kind, "choice");
      const created = taskEvent("request.created", {
        requestId,
        flowId: FLOW,
        cardKind: "appointment",
        workflowId,
        stage: "A10",
        sourceRoleId: "chief",
        title: request.title,
        options: request.kind === "choice" ? request.options.map((option) => ({ id: option.id, label: option.label })) : [],
      });
      assert.equal((await appendTaskEvent(root, created)).ok, true);
      const resolved = taskEvent("request.resolved", {
        requestId,
        cardKind: "appointment",
        decisionId: `decision-${requestId}`,
        targetRoleIds: ["implementer"],
        workflowId,
        stage: "A10",
        by: "customer",
        choice: "implementer",
      });
      assert.equal((await appendTaskEvent(root, resolved)).ok, true);
      const completion: WorkflowEvent = {
        v: 1,
        at: NOW_ISO,
        schema: "ans-workflow/v1",
        kind: "stage.completed",
        workflowId,
        flowId: FLOW,
        path: "A",
        idempotencyKey: `stage-complete:${workflowId}:A10:${requestId}`,
        stage: "A10",
        cause: { kind: "appointment-confirmed", ref: requestId },
        artifacts: [],
      };
      const appended = await appendWorkflowEvent(root, completion);
      assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
      return { outcome: "answered", value: { selected: ["implementer"] }, decisionId: `decision-${requestId}` } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const outcome = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(outcome?.outcome, "answered");
        assert.equal(rawCalls, 1);
        // B15.3：A10 已完成后再呈任命卡 ⇒ fail-closed（appointment-card-already-completed），不得再触达客户通道。
        const again = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(again?.outcome, "declined");
        assert.equal(again?.outcome === "declined" ? again.notPresented : undefined, true);
        assert.match(again?.outcome === "declined" ? again.reason ?? "" : "", /appointment-card-already-completed/);
        assert.equal(rawCalls, 1, "A10 已完成不得再次发卡");
      },
    );
    const ledger = await readWorkflowLedger(root);
    const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
    const a10Requested = wfEvents.find((event) => event.kind === "stage.requested" && event.stage === "A10");
    assert.ok(a10Requested !== undefined, "呈卡时 run-role 记 stage.requested A10（卡在办）");
    if (a10Requested?.kind === "stage.requested") {
      assert.equal(a10Requested.idempotencyKey, `stage-request:${workflowId}:A10:1`);
      assert.match(a10Requested.requestTaskId, /^appointment-card:focus:/);
    }
    const view = deriveWorkflowView(wfEvents);
    assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
    assert.equal(view.stage, "A10");
    assert.equal(view.stages.A10.status, "completed", "A10 完成于 request.resolved（应用通道）");
    assert.ok([...nextStages(view)].includes("A11"), "A10 完成后 nextStages 含 A11");
    // 卡后：A12a criteria 先派（G-1/AC-09），随后 chief 发 A11 stage-request。
    const criteria: WorkflowEvent = {
      v: 1,
      at: "2026-11-10T10:01:00.000Z",
      schema: "ans-workflow/v1",
      kind: "stage.dispatched",
      workflowId,
      flowId: FLOW,
      path: "A",
      idempotencyKey: `stage-dispatch:${workflowId}:A12a:t-criteria-1`,
      stage: "A12a",
      taskId: "t-criteria-1",
      targetRoleId: "verifier",
    };
    assert.equal((await appendWorkflowEvent(root, criteria)).ok, true);
    const a11 = await requestStage({
      projectRoot: root,
      flowId: FLOW,
      stage: "A11",
      workflowId,
      workflowPath: "A",
      requestDigest: sha("A11 实现派发：携客户选中角色 implementer"),
      sourceTaskId: "t-chief-turn-2",
      text: "A11 实现派发：implementer（客户选中子集）",
    });
    assert.equal(a11.ok, true, a11.ok === false ? a11.message : "");
    const after = deriveWorkflowView((await readWorkflowLedger(root)).events.filter((event) => event.workflowId === workflowId));
    assert.equal(after.stage, "A11");
  } finally {
    cleanup(root);
  }
});

test("fixed A10 在办标记幂等：同一 workflow 再次呈卡被拒（appointment-card-pending）、不重复写 stage.requested A10、不产生 corrupt", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"]);
    let rawCalls = 0;
    const raw: CustomerInputFn = async (request) => {
      rawCalls += 1;
      assert.equal(request.kind, "choice");
      return { outcome: "declined", reason: "stub-channel-declined" } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const first = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(first?.outcome, "declined");
        assert.equal(rawCalls, 1);
        // B15.3：A10 在办（requested）⇒ 重复呈卡 fail-closed，不得再触达客户通道。
        const second = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(second?.outcome, "declined");
        assert.equal(second?.outcome === "declined" ? second.notPresented : undefined, true);
        assert.match(second?.outcome === "declined" ? second.reason ?? "" : "", /appointment-card-pending/);
        assert.equal(rawCalls, 1, "A10 在办时不得重复发卡");
      },
    );
    const ledger = await readWorkflowLedger(root);
    const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
    const requestedA10 = wfEvents.filter((event) => event.kind === "stage.requested" && event.stage === "A10");
    assert.equal(requestedA10.length, 1, "A10 在办标记只写一次（重复呈卡被拒）");
    const view = deriveWorkflowView(wfEvents);
    assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
    assert.equal(view.stage, "A10");
    assert.equal(view.stages.A10.status, "requested");
  } finally {
    cleanup(root);
  }
});

test("fixed A10 未到窗口：A9 未完成时任命卡 fail-closed（stage-transition-invalid，不发卡）", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);
    let rawCalls = 0;
    const raw: CustomerInputFn = async () => {
      rawCalls += 1;
      return { outcome: "declined", reason: "must-not-present" } satisfies CustomerInputOutcome;
    };
    await withSession(
      { roleId: "chief", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (caps) => {
        const outcome = await caps.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: FLOW });
        assert.equal(outcome?.outcome, "declined");
        assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
        assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /stage-transition-invalid/);
        assert.equal(rawCalls, 0, "A9 未完成不得发任命卡");
      },
    );
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) => event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "A10").length, 0);
  } finally {
    cleanup(root);
  }
});

// ————————————————— ③ B16：fixed A8 角色草稿写权（RR11 失败修复） —————————————————

test("B16 fixed A8：nominator 角色草稿写权来自 fixed roster；未知角色/非 A8/legacy 无 D3 仍拒", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]);
    assert.equal((await appendWorkflowEvent(root, requestedEvent(workflowId, "A8"))).ok, true);
    const created = taskEvent("task.created", {
      taskId: "t-b16-a8", from: "convener", to: "nominator", text: "A8 建卡/激活",
      sideEffect: "docs", idempotencyKey: "work:b16:a8", flowId: FLOW, workflowId, stage: "A8",
    });
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    const raw: CustomerInputFn = async () => ({ outcome: "declined", reason: "no-card" });
    await withSession(
      { roleId: "nominator", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy"), taskId: "t-b16-a8" },
      async (_caps, gate) => {
        assert.ok(gate !== undefined);
        // fixed roster roles implementer/qa ⇒ 三文件写权；未知角色/其它写区仍拒。
        for (const rel of [
          "角色卡/implementer/role-card.md",
          "角色卡/implementer/boundary.md",
          "角色卡/qa/boundary.yaml",
        ]) {
          const decision = gate!(rel);
          assert.equal(decision.allowed, true, decision.allowed === false ? decision.reason : "");
        }
        const unknownRole = gate!("角色卡/evil/role-card.md");
        assert.equal(unknownRole.allowed, false, "非 roster 角色不得获得角色草稿写权");
        assert.match(unknownRole.allowed === false ? unknownRole.reason : "", /Role drafts require/u);
        const otherWrite = gate!("docs/product/x.md");
        assert.equal(otherWrite.allowed, false, "角色卡之外写区不因 B16 放开");
      },
    );
    // legacy/无 fixed A8 任务：仍走 trunk prepareRoleDraftScope（无 D3 ⇒ 空集 fail-closed）。
    await withSession(
      { roleId: "nominator", project, customerInput: raw, workflowModeForFlow: (flowId) => (flowId === FLOW ? "fixed" : "legacy") },
      async (_caps, gate) => {
        assert.ok(gate !== undefined);
        const denied = gate!("角色卡/implementer/role-card.md");
        assert.equal(denied.allowed, false, "legacy（无 fixed A8 任务）不得授予角色草稿写权");
        assert.match(denied.allowed === false ? denied.reason : "", /Role drafts require/u);
      },
    );
  } finally {
    cleanup(root);
  }
});
