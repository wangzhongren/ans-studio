// test/测试/governance-judge-cards-verify/fixture.ts
// 测试角色：「替我审批」/「替我决策」双开关——治理判断 agent 独立验收夹具（2026-10-18）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造**：只读导入产品公开面（运行时核心只读工具、编排 driver/verdict/facts、
//     桌面客户交互通道、开关状态机、ui-labels 纯映射、账本/会话入口），**不 import 任何实施方测试**。
//   · 全部在系统临时目录内进行、用后清理；不读 `.env`、不跑真实模型/凭据/网络。
//   · 假模型两套：① 编排 driver 用的判断会话假适配器（经真实 `buildGovernanceJudgeTools` 读文件再
//     交回 `report_governance_judgement`）；② 普通角色会话假适配器（脚本 → 真实受治理工具 → 事件）。
//   · 开关状态机用产品 `createShellJudgeSwitch`（approval/decision 两个实例，主进程权威同形）。

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../../src/model/role.ts";
import type {
  AdapterCapabilities,
  RuntimeAdapterFactory,
  RuntimeAdapterFactoryOptions,
} from "../../../src/pipeline/orchestration/run-role.ts";
import type {
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceJudgeFn,
  GovernanceJudgeGroup,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
  GovernanceJudgeToolOptions,
  RoleSession,
  RuntimeAdapter,
  RuntimeKind,
  SessionEvent,
  ShellJudgeReadStats,
  ToolCall,
  ToolDefinition,
  WriteGate,
} from "../../../src/model/runtime.ts";
import { buildGovernanceJudgeTools } from "../../../src/common/runtime-core/governance-judge/tools.ts";
import { createGovernanceJudge as realCreateGovernanceJudge } from "../../../src/pipeline/orchestration/govern-session.ts";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import {
  createCustomerInputChannel,
  type CreateCustomerInputChannelOptions,
  type CustomerInputChannel,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
  type DesktopCustomerInputFn,
} from "../../../app/desktop/customer-input.ts";
import { createShellJudgeSwitch, type ShellJudgeSwitch } from "../../../app/desktop/interface.ts";
import { readGovernanceLedger, type GovernanceLedgerEntry } from "../../../src/common/编排/governance-ledger.ts";

export const FLOW = "flow-a";
export const PROPOSAL_REL = `docs/proposals/${FLOW}-v1.md`;
export const NOMINATION_REL = `docs/nominations/${FLOW}-v1.md`;
export const FLOW_REL = `docs/flows/${FLOW}.md`;

export function makeRoot(tag: string): { root: string; cleanup(): void } {
  const root = mkdtempSync(path.join(tmpdir(), `ans-governance-judge-${tag}-`));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

export function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** 标准临时项目：规范物证齐全 + 一个项目角色 + 敏感哨兵（证明 judge 读不到）。 */
export function seedProject(root: string): void {
  write(root, PROPOSAL_REL, proposalDoc());
  write(root, NOMINATION_REL, nominationDoc());
  write(root, FLOW_REL, flowDoc());
  write(root, "角色卡/project-a/role-card.md", "# 角色：project-a\n\n验收夹具。\n");
  write(root, "角色卡/project-a/boundary.yaml", "role: project-a\nentries:\n  - kind: directory\n    path: src/\n    purpose: code\n");
  write(root, "src/app.ts", "export const answer = 42;\n");
  write(root, ".env", "ANS_JUDGE_SENTINEL=DO_NOT_LEAK\n");
}

export function proposalDoc(): string {
  return [
    "---",
    `flowId: ${FLOW}`,
    "version: 1",
    "author: rapporteur",
    "status: draft",
    "---",
    "",
    `# 提案 ${FLOW} v1`,
    "",
    "goal: 离线验收判断 agent。",
    "scope: 只读验证。",
    "acceptance: 六类卡均可机械复核。",
    "",
  ].join("\n");
}

export function nominationDoc(recommended: string[] = ["project-a"]): string {
  return [
    "---",
    `flowId: ${FLOW}`,
    `recommended: [${recommended.join(", ")}]`,
    "---",
    "",
    `# 提名 ${FLOW}`,
    "",
    `候选：${recommended.join("、")}。`,
    "",
  ].join("\n");
}

export function flowDoc(): string {
  return [`# 流程 ${FLOW}`, "", "| 步骤 | 角色 | 状态 |", "| --- | --- | --- |", "| impl | project-a | done |", ""].join("\n");
}

// —————————————————————— 判断请求构造 ——————————————————————

export interface RequestOverrides {
  group?: GovernanceJudgeGroup;
  cardKind?: GovernanceJudgeRequest["cardKind"];
  roleId?: string;
  runtime?: RuntimeKind;
  flowId?: string;
  card?: CustomerInputRequest;
  paths?: string[];
  pathProbes?: Array<{ path: string; allowed: boolean; reason?: string }>;
  allowedPathRoots?: string[];
  forbiddenPaths?: string[];
  artifacts?: GovernanceJudgeRequest["artifacts"];
  recommendedRoleIds?: string[];
  facts?: Partial<GovernanceJudgeRequest["facts"]>;
}

function cardFor(kind: GovernanceJudgeRequest["cardKind"]): CustomerInputRequest {
  switch (kind) {
    case "proposal":
      return {
        kind: "choice",
        title: `提案 ${FLOW}`,
        cardKind: "proposal",
        flowId: FLOW,
        options: [
          { id: "accept", label: "接受" },
          { id: "accept-quick", label: "快捷接受" },
          { id: "revise", label: "要求修改" },
          { id: "reject", label: "拒绝" },
        ],
      };
    case "appointment":
      return {
        kind: "choice",
        title: `任命 ${FLOW}`,
        cardKind: "appointment",
        flowId: FLOW,
        multiple: true,
        options: [
          { id: "role-x", label: "角色 X" },
          { id: "role-y", label: "角色 Y" },
          { id: "role-z", label: "角色 Z" },
        ],
      };
    case "acceptance":
      return {
        kind: "choice",
        title: `验收 ${FLOW}`,
        cardKind: "acceptance",
        flowId: FLOW,
        options: [
          { id: "accept", label: "通过" },
          { id: "reject", label: "不通过" },
        ],
      };
    default:
      return {
        kind: "confirm",
        title: `写盘确认 ${FLOW}`,
        cardKind: kind,
        flowId: FLOW,
        preview: "将写入以下文件：\n- docs/proposals/flow-a-v1.md",
      };
  }
}

/** 按卡种给出默认请求（driver/桌面通道共用）；所有事实都是应用侧形状。 */
export function requestFor(kind: GovernanceJudgeRequest["cardKind"], overrides: RequestOverrides = {}): GovernanceJudgeRequest {
  const roleId =
    overrides.roleId ??
    (kind === "proposal" || kind === "acceptance" || kind === "write"
      ? "rapporteur"
      : kind === "schedule-write"
        ? "convener"
        : "nominator");
  const card = overrides.card ?? cardFor(kind);
  const artifacts =
    overrides.artifacts ??
    (kind === "proposal"
      ? { proposalPath: PROPOSAL_REL }
      : kind === "appointment"
        ? { nominationPath: NOMINATION_REL }
        : kind === "acceptance"
          ? { proposalPath: PROPOSAL_REL, flowPath: FLOW_REL }
          : kind === "appointment-write"
            ? { nominationPath: NOMINATION_REL, flowPath: FLOW_REL }
            : kind === "schedule-write"
              ? { flowPath: FLOW_REL }
              : { proposalPath: PROPOSAL_REL });
  const facts = {
    governanceModel: "trio" as const,
    flowId: overrides.flowId ?? FLOW,
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    ...(kind === "acceptance" ? { proposalDecision: "accepted" as const, dispatchedStepIds: ["impl"] } : {}),
    ...(kind === "appointment-write" ? { appointmentTargetRoleIds: ["project-a"] } : {}),
    ...overrides.facts,
  };
  const request: GovernanceJudgeRequest = {
    group: overrides.group ?? (kind === "proposal" || kind === "appointment" || kind === "acceptance" ? "decision" : "approval"),
    cardKind: kind,
    roleId,
    projectRoot: "",
    runtime: overrides.runtime ?? "claude",
    governanceModel: "trio",
    flowId: overrides.flowId ?? FLOW,
    card,
    artifacts,
    facts,
    at: new Date().toISOString(),
  };
  if (overrides.recommendedRoleIds !== undefined) request.recommendedRoleIds = overrides.recommendedRoleIds;
  if (kind === "appointment" && request.recommendedRoleIds === undefined) request.recommendedRoleIds = ["role-x", "role-y"];
  if (overrides.paths !== undefined) request.paths = overrides.paths;
  if (overrides.pathProbes !== undefined) request.pathProbes = overrides.pathProbes;
  if (overrides.allowedPathRoots !== undefined) request.allowedPathRoots = overrides.allowedPathRoots;
  if (overrides.forbiddenPaths !== undefined) request.forbiddenPaths = overrides.forbiddenPaths;
  if (kind === "write" || kind === "appointment-write" || kind === "schedule-write") {
    const paths =
      overrides.paths ??
      (kind === "write"
        ? [PROPOSAL_REL]
        : kind === "appointment-write"
          ? ["角色卡/project-a/boundary.yaml"]
          : [FLOW_REL]);
    request.paths = paths;
    request.pathProbes = overrides.pathProbes ?? paths.map((entry) => ({ path: entry, allowed: true }));
    request.allowedPathRoots =
      overrides.allowedPathRoots ??
      (kind === "write" ? ["docs/proposals/"] : kind === "appointment-write" ? ["角色卡/project-a/"] : ["docs/flows/"]);
    request.forbiddenPaths = overrides.forbiddenPaths ?? [];
  }
  return request;
}

// —————————————————————— 判断会话假适配器（真实 driver + 真实只读工具） ——————————————————————

export interface JudgeSeen {
  binds: number;
  prompts: string[];
  aborted: number;
  disposed: number;
  toolNames: string[][];
  stats?: ShellJudgeReadStats;
  gate?: WriteGate;
  capabilities?: AdapterCapabilities;
  release?: () => void;
}

export interface JudgeScript {
  /** 交回结论前用真实 judge 工具读取的项目相对路径。 */
  reads?: string[];
  /** 交回结论前自定义工具动作（如读取敏感文件/耗尽预算）。 */
  beforeReport?: (tools: Map<string, ToolDefinition>, seen: JudgeSeen) => Promise<void>;
  /** `report_governance_judgement` 的原始参数。 */
  report?: unknown;
  /** bindRole 抛错（会话不可用）。 */
  bindError?: string;
  /** events 永不 settle（超时/中止路径）；dispose/abort 时释放。 */
  silent?: boolean;
  /** 只产出一条 message（降级解析路径）。 */
  message?: string;
}

export interface FakeJudge {
  factory: RuntimeAdapterFactory;
  seen: JudgeSeen;
}

/** 假判断会话：只消费注入的 `governanceJudge` 能力；结构性不存在写/shell/交互/派发工具。 */
export function fakeJudge(script: JudgeScript = {}): FakeJudge {
  const seen: JudgeSeen = { binds: 0, prompts: [], aborted: 0, disposed: 0, toolNames: [] };
  const factory: RuntimeAdapterFactory = (gate, capabilities) => {
    seen.gate = gate;
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        seen.binds += 1;
        if (script.bindError !== undefined) throw new Error(script.bindError);
        return {
          async prompt(text: string): Promise<void> {
            seen.prompts.push(text);
            if (script.silent === true) return;
            const options: GovernanceJudgeToolOptions | undefined = capabilities?.governanceJudge;
            if (options === undefined) throw new Error("治理判断能力未注入");
            seen.stats = options.stats;
            const tools = new Map(buildGovernanceJudgeTools(options).map((tool) => [tool.name, tool]));
            seen.toolNames.push([...tools.keys()]);
            for (const rel of script.reads ?? []) {
              await tools.get("judge_read_file")!.handler({ name: "judge_read_file", args: { path: rel } });
            }
            if (script.beforeReport !== undefined) await script.beforeReport(tools, seen);
            if (script.report !== undefined) {
              options.report(script.report);
            }
          },
          async *events() {
            if (script.message !== undefined) yield { kind: "message" as const, summary: script.message };
            if (script.silent === true) {
              await new Promise<void>((resolve) => { seen.release = resolve; });
              return;
            }
            yield { kind: "settled" as const, summary: "settled" };
          },
          async abort() {
            seen.aborted += 1;
            seen.release?.();
          },
          async dispose() {
            seen.disposed += 1;
            seen.release?.();
          },
        };
      },
    };
  };
  return { factory, seen };
}

export function makeJudge(root: string, script?: JudgeScript, opts: { timeoutMs?: number; runtime?: RuntimeKind } = {}) {
  const fake = fakeJudge(script ?? {});
  const judge = realCreateGovernanceJudge({
    project: { projectRoot: root, skillRoot: root, roles: {} },
    runtime: opts.runtime ?? "claude",
    runtimeOptions: RUNTIME_OPTIONS,
    createAdapter: fake.factory,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return { judge, fake };
}

/** 默认 approve 结论（与请求形状一致）；测试可覆盖单字段。 */
export function approveOutcome(request: GovernanceJudgeRequest, overrides: Partial<GovernanceJudgeOutcome> = {}): GovernanceJudgeOutcome {
  const isConfirm = request.card.kind === "confirm";
  const selected = request.cardKind === "appointment"
    ? [...(request.recommendedRoleIds ?? [])]
    : request.cardKind === "proposal" || request.cardKind === "acceptance"
      ? ["accept"]
      : undefined;
  return {
    verdict: "approve",
    group: request.group,
    cardKind: request.cardKind,
    reasonCode: "sufficient",
    reason: "验收夹具：应用事实齐全，结论可核对。",
    engine: request.runtime,
    evidence: request.artifacts !== undefined ? Object.values(request.artifacts).filter((v): v is string => typeof v === "string") : ["fixture"],
    ...(isConfirm
      ? { value: { confirmed: true as const }, paths: request.paths, pathDecisions: (request.paths ?? []).map((entry) => ({ path: entry, ok: true })) }
      : { value: { selected } }),
    durationMs: 5,
    readCalls: 1,
    readBytes: 100,
    ...overrides,
  };
}

// —————————————————————— 桌面客户交互通道（双开关 + 判断） ——————————————————————

export interface ChannelOptions {
  root: string;
  runtime?: RuntimeKind;
  approval?: boolean;
  decision?: boolean;
  /** 判断函数；缺省为按请求自动正向 approve 的夹具。 */
  fn?: GovernanceJudgeFn;
  /** 投达结果行；抛错即模拟结果行失败。 */
  emitJudgeResult?: (payload: OperatorJudgeResultPayload) => void;
  /** 自定义 presenter；缺省记录并等 `respond`。 */
  presenter?: (payload: OperatorRequestPayload) => void;
  onNextStep?: CreateCustomerInputChannelOptions["onNextStep"];
  onQueued?: CreateCustomerInputChannelOptions["onQueued"];
  /** 通道层判断防御超时。 */
  timeoutMs?: number;
  approvalSwitch?: ShellJudgeSwitch;
  decisionSwitch?: ShellJudgeSwitch;
}

export interface ChannelHarness {
  channel: CustomerInputChannel;
  approvalSwitch: ShellJudgeSwitch;
  decisionSwitch: ShellJudgeSwitch;
  rows: OperatorJudgeResultPayload[];
  presented: OperatorRequestPayload[];
  requests: GovernanceJudgeRequest[];
  nextSteps: Array<{ payload: unknown; context: unknown }>;
  /** 以桌面会话上下文发起一次客户交互（返回编排拿到的三态）。 */
  ask(
    req: CustomerInputRequest,
    ctxOverrides?: Partial<Parameters<DesktopCustomerInputFn>[1]>,
    metadataOverrides?: Parameters<DesktopCustomerInputFn>[2],
  ): Promise<CustomerInputOutcome>;
  /** 给已呈现卡作答（走真实 respond）。 */
  answer(id: string, decision: { kind: "confirm"; confirmed: boolean } | { kind: "choice"; selected?: string[]; cancelled?: boolean }): void;
  /** 构造该卡的 `judgeContext`（默认值；可按卡种覆盖）。 */
  judgeContextFor(req: CustomerInputRequest, overrides?: Record<string, unknown>): NonNullable<Parameters<DesktopCustomerInputFn>[2]>["judgeContext"];
}

/** 默认判断函数：按请求正向 approve；可记录调用并允许逐次覆盖。 */
export function autoJudge(overrides?: (request: GovernanceJudgeRequest) => GovernanceJudgeOutcome | undefined, calls?: GovernanceJudgeRequest[]): GovernanceJudgeFn {
  return async (request) => {
    calls?.push(request);
    return overrides?.(request) ?? approveOutcome(request);
  };
}

export function makeChannel(options: ChannelOptions): ChannelHarness {
  const approvalSwitch = options.approvalSwitch ?? createShellJudgeSwitch();
  const decisionSwitch = options.decisionSwitch ?? createShellJudgeSwitch();
  approvalSwitch.set({ enabled: options.approval === true });
  decisionSwitch.set({ enabled: options.decision === true });
  const rows: OperatorJudgeResultPayload[] = [];
  const presented: OperatorRequestPayload[] = [];
  const requests: GovernanceJudgeRequest[] = [];
  const nextSteps: Array<{ payload: unknown; context: unknown }> = [];
  const fn = options.fn ?? autoJudge(undefined, requests);
  const channel = createCustomerInputChannel({
    operatorId: "客户",
    presenter: (payload) => {
      presented.push(payload);
      options.presenter?.(payload);
    },
    judge: {
      fn,
      isGroupEnabled: (group) => (group === "approval" ? approvalSwitch.isEnabled() : decisionSwitch.isEnabled()),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    },
    emitJudgeResult: (payload) => {
      rows.push(payload);
      options.emitJudgeResult?.(payload);
    },
    onNextStep: (payload, context) => {
      nextSteps.push({ payload, context });
      options.onNextStep?.(payload, context);
    },
    ...(options.onQueued !== undefined ? { onQueued: options.onQueued } : {}),
  });

  const judgeContextFor = (req: CustomerInputRequest, overrides: Record<string, unknown> = {}) => {
    const request = requestFor(req.cardKind ?? "write", { card: req });
    return {
      flowId: request.flowId,
      stepId: "step-1",
      toolCallId: "call-1",
      turnId: "turn-1",
      facts: request.facts,
      ...(request.paths !== undefined ? { paths: request.paths } : {}),
      ...(request.pathProbes !== undefined ? { pathProbes: request.pathProbes } : {}),
      ...(request.allowedPathRoots !== undefined ? { allowedPathRoots: request.allowedPathRoots } : {}),
      ...(request.forbiddenPaths !== undefined ? { forbiddenPaths: request.forbiddenPaths } : {}),
      ...(request.artifacts !== undefined ? { artifacts: request.artifacts } : {}),
      ...(request.recommendedRoleIds !== undefined ? { recommendedRoleIds: request.recommendedRoleIds } : {}),
      ...overrides,
    };
  };

  return {
    channel,
    approvalSwitch,
    decisionSwitch,
    rows,
    presented,
    requests,
    nextSteps,
    ask(req, ctxOverrides = {}, metadataOverrides = undefined) {
      const ctx = {
        roleId: "rapporteur",
        runtime: (options.runtime ?? "claude") as RuntimeKind,
        projectRoot: options.root,
        governanceModel: "trio" as const,
        ...ctxOverrides,
      };
      const metadata = {
        turnId: "turn-1",
        toolCallId: "call-1",
        flowId: FLOW,
        cardKind: req.cardKind,
        judgeContext: judgeContextFor(req),
        ...metadataOverrides,
      };
      return channel.customerInput(req, ctx, metadata) as Promise<CustomerInputOutcome>;
    },
    answer(id, decision) {
      const result = channel.respond({ id, decision });
      if (result.ok !== true) throw new Error(`respond 失败：${result.error ?? "unknown"}`);
    },
    judgeContextFor,
  };
}

/** 等一次微任务/宏任务，让异步判断/呈现推进。 */
export function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 等条件满足（默认 1s）。 */
export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待条件超时");
    await tick(5);
  }
}

// —————————————————————— 普通角色会话（账本审计端到端） ——————————————————————

/** 捕获会话装配面；工厂把真实能力（客户通道）接回假适配器。 */
export interface SessionCapture {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
  boundRoleId?: string;
  results: Array<{ name: string; ok: boolean; message: string }>;
}

export function toolAdapterFactory(
  capture: SessionCapture,
  opts: { root: string; script?: ToolCall[]; scriptForRole?: (roleId: string) => ToolCall[] | undefined },
): (gate: WriteGate, caps?: AdapterCapabilities) => RuntimeAdapter {
  let roleId = "";
  return (gate, caps) => {
    capture.gate = gate;
    capture.caps = caps;
    capture.results = [];
    return {
      async composeContext(): Promise<{ systemPrompt: string }> {
        return { systemPrompt: "" };
      },
      async bindRole(role): Promise<RoleSession> {
        roleId = role.id;
        capture.boundRoleId = role.id;
        const tools = buildGovernedTools(gate, {
          readRoot: opts.root,
          writeRoot: opts.root,
          roleId,
          runtime: caps?.runtime,
          ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
        });
        const byName = new Map(tools.map((tool) => [tool.name, tool]));
        const script = opts.scriptForRole?.(roleId) ?? opts.script ?? [];
        const queue: SessionEvent[] = [];
        let closed = false;
        return {
          async prompt(text: string): Promise<void> {
            queue.push({ kind: "message", summary: `用户指令：${text}` });
            for (const call of script) {
              queue.push({ kind: "tool_call", summary: `模型请求调用 ${call.name}`, detail: call });
              const tool = byName.get(call.name);
              if (tool === undefined) {
                queue.push({ kind: "denied", summary: `未知工具，拒绝执行：${call.name}`, detail: call });
                continue;
              }
              const result = await tool.handler(call);
              capture.results.push({ name: call.name, ok: result.ok, message: result.message });
              queue.push({ kind: result.ok ? "accepted" : "denied", summary: result.message, detail: { call, result } });
            }
            queue.push({ kind: "settled", summary: "会话结束" });
            closed = true;
          },
          events(): AsyncIterable<SessionEvent> {
            return (async function* () {
              let index = 0;
              while (true) {
                if (index < queue.length) {
                  yield queue[index++]!;
                  continue;
                }
                if (closed) return;
                await tick(1);
              }
            })();
          },
          async dispose(): Promise<void> {
            closed = true;
          },
        };
      },
    };
  };
}

/** 账本读取 + 等待谓词（含在飞 append）。 */
export async function waitForLedger(
  root: string,
  predicate: (entries: GovernanceLedgerEntry[], errors: string[]) => boolean,
  timeoutMs = 2000,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }> {
  const start = Date.now();
  for (;;) {
    const snapshot = await readGovernanceLedger(root);
    if (predicate(snapshot.entries, snapshot.errors)) return { entries: [...snapshot.entries], errors: [...snapshot.errors] };
    if (Date.now() - start > timeoutMs) return { entries: [...snapshot.entries], errors: [...snapshot.errors] };
    await tick(10);
  }
}

// —————————————————————— 真 ui-labels 纯映射 ——————————————————————

export interface UiLabelsApi {
  judgeToggleView(group: string, available: boolean, enabled: boolean, busy: boolean, options?: { singleDisabled?: boolean } | null): {
    group: string; available: boolean; enabled: boolean; checked: boolean; singleDisabled: boolean;
    disabled: boolean; label: string; title: string; note: string; warningVisible: boolean;
  };
  judgeWarningStep(enabled: boolean, shown: boolean): { shown: boolean; show: boolean };
  judgeWarningLines(groups: string[]): Array<{ text: string; strong: boolean }>;
  judgeGroupLabel(group: string): string;
  governanceJudgeNoticeText(group: string, reasonCode: string): string;
  governanceJudgeResultView(payload: unknown): {
    group: string; groupLabel: string; cardKind: string; title: string; badge: string; headline: string;
    engineText: string; operatorText: string; flowText: string; at: string; lines: string[]; toolCallId: string;
    requestId: string; details: Record<string, unknown>;
  } | null;
  governanceJudgeReasonText(reasonCode: string): string;
}

export async function loadUiLabels(): Promise<UiLabelsApi> {
  await import(new URL("../../../app/renderer/ui-labels.js", import.meta.url).href);
  const api = (globalThis as Record<string, unknown>).ANSUiLabels as UiLabelsApi | undefined;
  if (api === undefined) throw new Error("ui-labels.js 未挂 globalThis.ANSUiLabels");
  return api;
}

// —————————————————————— 会话项目配置 ——————————————————————

/** trio 项目配置：内置四角色声明 + 治理边界接受证据（不读 `.ans`）。 */
export function trioProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["liaison", "rapporteur", "nominator", "convener"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:judge-trio" },
    },
  };
}

/** single 项目配置（su 旧路径）。 */
export function singleProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:judge-single" },
    },
  };
}

export const RUNTIME_OPTIONS: RuntimeAdapterFactoryOptions = { modelId: "fixture-model" };
