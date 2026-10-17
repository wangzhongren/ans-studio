// test/测试/shell-judge-verify/fixture.ts
// 测试角色：「替我审」+ 卡死修复独立验证夹具（2026-10-17）。
//
// 纪律：**独立构造**——只读导入产品公开面，自建临时项目/桩适配器/假 IPC/假渲染；
// 不复用实施方断言、不跑真实模型/凭据/网络、不读 `.env`。
//
// 链路（全部离线）：
//   createShellGate（真实 c 分类器桩 + 内存审计）
//     → createDesktopOperatorChannel（真实通道；桩 presenter）
//     → createShellJudge（真实编排驱动；假 createAdapter）
//     → buildShellJudgeTools（真实只读工具）→ 假适配器把模型动作交回
//     → ShellJudgeResultPayload（假渲染：真 ui-labels.js 纯映射）

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig, ResolvedRole } from "../../../src/model/role.ts";
import type {
  AdapterCapabilities,
  RuntimeAdapterFactory,
} from "../../../src/pipeline/orchestration/run-role.ts";
import type {
  RoleSession,
  RuntimeKind,
  ShellGate,
  ShellJudgeFn,
  ShellJudgeToolOptions,
  ToolDefinition,
  WriteGate,
} from "../../../src/model/runtime.ts";
import { createShellJudge as realCreateShellJudge } from "../../../src/pipeline/orchestration/govern-session.ts";
import { createShellGate, type ClassifyShellFn, type ShellClass, type ShellRules } from "../../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink, type ShellAuditRecord } from "../../../src/common/编排/shell-audit.ts";
import {
  createDesktopOperatorChannel,
  type DesktopOperatorMetadata,
  type OperatorPresenter,
  type ShellCommandDisplay,
  type ShellJudgeResultPayload,
} from "../../../app/desktop/operator-channel.ts";
import { createShellJudgeSwitch, type ShellJudgeSwitch } from "../../../app/desktop/interface.ts";
import { buildShellJudgeTools } from "../../../src/common/runtime-core/shell-judge/tools.ts";

/** 空规则集：分类器由测试注入（判定面与规则数据解耦）。 */
export const EMPTY_RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };

/** 固定档位分类器（argv[0] → decision；其余落 review）。 */
export function classifierFor(map: Record<string, ShellClass>): ClassifyShellFn {
  return (argv) => {
    const decision = map[argv[0] ?? ""] ?? "review";
    return { decision, ruleId: `test:${decision}` };
  };
}

/** 单档位分类器。 */
export function classifier(decision: ShellClass, ruleId = `test:${decision}`): ClassifyShellFn {
  return () => ({ decision, ruleId });
}

export interface TempProject {
  root: string;
  project: ProjectConfig;
  cleanup(): Promise<void>;
}

/** 临时项目：普通源码/文档 + 敏感文件哨兵（**哨兵只用于证明不泄漏，不会被判断 agent 读到**）。 */
export async function makeTempProject(): Promise<TempProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-shell-judge-verify-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# 独立验证项目\n\n用于离线判断测试。\n", "utf8");
  await writeFile(path.join(root, "src", "app.ts"), "export const answer = 42;\n", "utf8");
  await writeFile(path.join(root, "docs", "plan.md"), "计划：运行 npm test。\n", "utf8");
  await writeFile(path.join(root, ".env"), "ANS_VERIFY_SENTINEL=DO_NOT_LEAK_ENV\n", "utf8");
  return {
    root,
    project: { projectRoot: root, skillRoot: root, roles: {} },
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function judgeRole(): ResolvedRole {
  return {
    id: "verify-role",
    kind: "project",
    cardText: "# 验证角色",
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture",
    location: { card: "fixture", boundary: "fixture" },
  };
}

export const REQUEST = (toolCallId = "call-1", command = "npm test") => ({
  command,
  argv: command.split(/\s+/),
  cwd: "/proj",
  toolCallId,
});

// —————————————————————— 假判断适配器（扮演模型） ——————————————————————

export interface JudgeSeen {
  binds: number;
  prompts: string[];
  aborted: number;
  disposed: number;
  gate?: WriteGate;
  capabilities?: AdapterCapabilities;
  toolNames: string[][];
  release?: () => void;
}

export interface JudgeScript {
  /** 模型通过 report_shell_judgement 交回的原始参数（函数形式可先做读取动作）。 */
  report?: unknown | ((seen: JudgeSeen) => unknown | Promise<unknown>);
  /** 交回结论前用**真实 judge 工具**执行的动作（如读取敏感文件/耗尽预算）。 */
  beforeReport?: (tools: Map<string, ToolDefinition>, seen: JudgeSeen) => Promise<void>;
  /** bindRole 抛错（会话不可用）。 */
  bindError?: string;
  /** events 永不 settle（超时路径）；dispose/abort 时释放。 */
  silent?: boolean;
  /** 只产出一条 message（降级解析路径）。 */
  message?: string;
}

export interface FakeJudge {
  factory: RuntimeAdapterFactory;
  seen: JudgeSeen;
}

/** 构造假判断适配器：只消费注入的 judge 能力；写/命令/交互/派发工具不存在。 */
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
            const options: ShellJudgeToolOptions | undefined = capabilities?.shellJudge;
            if (options !== undefined) {
              const tools = new Map(buildShellJudgeTools(options).map((tool) => [tool.name, tool]));
              seen.toolNames.push([...tools.keys()]);
              if (script.beforeReport !== undefined) await script.beforeReport(tools, seen);
              if (script.report !== undefined) {
                const raw = typeof script.report === "function" ? await script.report(seen) : script.report;
                options.report(raw);
              }
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

// —————————————————————— 诊断记录（可选注入；不落盘） ——————————————————————

export interface RecordedDiagnostic {
  event: string;
  fields: Record<string, unknown>;
}

export function recordingLogger(): { record(event: string, fields?: Record<string, unknown>): void; error(event: string, error: unknown, fields?: Record<string, unknown>): void; events: RecordedDiagnostic[] } {
  const events: RecordedDiagnostic[] = [];
  return {
    events,
    record(event, fields) { events.push({ event, fields: fields ?? {} }); },
    error(event, error, fields) { events.push({ event, fields: { ...fields, error: error instanceof Error ? error.message : String(error) } }); },
  };
}

// —————————————————————— 真实驱动 + 真实通道 + 真实闸 ——————————————————————

export interface MakeJudgeOptions {
  project: ProjectConfig;
  runtime: RuntimeKind;
  script?: JudgeScript;
  timeoutMs?: number;
  maxDenyPerCommand?: number;
  logger?: ReturnType<typeof recordingLogger>;
}

export interface MadeJudge {
  judge: ShellJudgeFn;
  fake: FakeJudge;
}

/** 真实 `createShellJudge` + 假适配器（不触真实模型）。 */
export function makeJudge(options: MakeJudgeOptions): MadeJudge {
  const fake = fakeJudge(options.script ?? { report: { verdict: "allow", reason: "当前任务需要运行测试" } });
  const judge = realCreateShellJudge({
    project: options.project,
    runtime: options.runtime,
    createAdapter: fake.factory,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxDenyPerCommand !== undefined ? { maxDenyPerCommand: options.maxDenyPerCommand } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
  return { judge, fake };
}

export interface ChainOptions {
  root: string;
  runtime: RuntimeKind;
  /** 判断闭包；缺省 ⇒ 桌面通道不启用判断（即便开关开）。 */
  judge?: ShellJudgeFn;
  classify?: ShellClass;
  operatorOnly?: boolean;
  approveDeny?: boolean;
  /** presenter 的决定；缺省拒绝（fail-closed）。函数形式可挂起。 */
  decision?: boolean | (() => boolean | Promise<boolean>);
  /** 自定义 presenter（用于挂起卡/手工切换开关场景）。给出时 decision 不生效。 */
  presenter?: OperatorPresenter;
  /** 结果行投达（缺省收集）；抛错即模拟投达失败。 */
  emitJudgeResult?: (payload: ShellJudgeResultPayload) => void;
  turnText?: string;
  judgeChannelTimeoutMs?: number;
  operatorTimeoutMs?: number;
  /** 复用外部开关实例（已挂起卡/关闭后恢复场景）。 */
  switchState?: ShellJudgeSwitch;
}

export interface Chain {
  gate: ShellGate;
  channel: ReturnType<typeof createDesktopOperatorChannel>;
  switchState: ShellJudgeSwitch;
  audit: ReturnType<typeof createMemoryAuditSink>;
  rows: ShellJudgeResultPayload[];
  displays: ShellCommandDisplay[];
  /** 每个请求 channel 收到的 metadata（含 turnText/judge）。 */
  metadatas: DesktopOperatorMetadata[];
}

/** 完整三级链：真实 c 分类（桩）→ 真实桌面通道 → 真实判断驱动（若给 judge）。 */
export function makeChain(options: ChainOptions): Chain {
  const switchState = options.switchState ?? createShellJudgeSwitch();
  const audit = createMemoryAuditSink();
  const rows: ShellJudgeResultPayload[] = [];
  const displays: ShellCommandDisplay[] = [];
  const metadatas: DesktopOperatorMetadata[] = [];
  const signal = new AbortController().signal;
  const presenter: OperatorPresenter = options.presenter ?? {
    async present(_prompt, display) {
      displays.push(display);
      const allow = typeof options.decision === "function" ? await options.decision() : options.decision === true;
      return { allow };
    },
  };
  const channel = createDesktopOperatorChannel({
    presenter,
    operatorId: "客户",
    timeoutMs: 5000,
    env: {},
    judge: { isEnabled: () => switchState.isEnabled(), timeoutMs: options.judgeChannelTimeoutMs ?? 2000 },
    emitJudgeResult: options.emitJudgeResult ?? ((payload) => { rows.push(payload); }),
  });
  const metadata = (): DesktopOperatorMetadata => {
    const value: DesktopOperatorMetadata = {
      roleId: "verify-role",
      projectRoot: options.root,
      runtime: options.runtime,
      signal,
      ...(options.turnText !== undefined ? { turnText: options.turnText } : {}),
      ...(options.judge !== undefined ? { judge: options.judge } : {}),
    };
    metadatas.push(value);
    return value;
  };
  const gate = createShellGate({
    projectRoot: options.root,
    classifyShell: classifier(options.classify ?? "risky"),
    rules: EMPTY_RULES,
    rulesId: "verify",
    audit,
    ...(options.operatorOnly === true ? { operatorOnly: true } : {}),
    ...(options.approveDeny === true ? { approveDeny: true } : {}),
    operatorChannel: (prompt) => channel(prompt, metadata()),
    operatorTimeoutMs: options.operatorTimeoutMs ?? 5000,
    timeoutMs: 5000,
    env: {},
  });
  return { gate, channel, switchState, audit, rows, displays, metadatas };
}

export function setJudgeEnabled(chain: Chain, enabled: boolean): void {
  const reply = chain.switchState.set({ enabled });
  if (reply.ok !== true) throw new Error(`开关设置失败：${reply.error ?? "unknown"}`);
}

/** 最后一次审计记录（每个 gate 请求恰一条）。 */
export function lastAudit(chain: Chain): ShellAuditRecord {
  const record = chain.audit.records.at(-1);
  if (record === undefined) throw new Error("没有审计记录");
  return record;
}

// —————————————————————— 假渲染：真 ui-labels 纯映射 ——————————————————————

export interface UiLabelsView {
  verdict: "allow" | "deny";
  denyOverride: boolean;
  title: string;
  label: string;
  summary: string;
  engineText: string;
  operatorText: string;
  tierText: string;
  at: string;
  lines: string[];
  retryHint: string;
  toolCallId: string;
  details: Record<string, unknown>;
}

export interface UiLabelsApi {
  shellJudgeToggleView(available: boolean, enabled: boolean, busy: boolean): {
    available: boolean; enabled: boolean; checked: boolean; disabled: boolean;
    label: string; title: string; warningVisible: boolean;
  };
  shellJudgeToggleResult(previousEnabled: boolean, res: unknown): { enabled: boolean; error: string };
  shellJudgeWarningLines(): string[];
  shellJudgeResultView(payload: unknown): UiLabelsView | null;
  shellJudgeNoticeText(reasonCode: unknown): string;
}

/** 与 renderer 同序装载真 `ui-labels.js`（经典脚本挂 globalThis.ANSUiLabels）。 */
export async function loadUiLabels(): Promise<UiLabelsApi> {
  await import(new URL("../../../app/renderer/ui-labels.js", import.meta.url).href);
  const api = (globalThis as Record<string, unknown>).ANSUiLabels as UiLabelsApi | undefined;
  if (api === undefined) throw new Error("ui-labels.js 未挂 globalThis.ANSUiLabels");
  return api;
}

// —————————————————————— Service 装配捕获（三引擎工具面） ——————————————————————

export function judgeToolOptions(root: string): ShellJudgeToolOptions {
  return {
    projectRoot: root,
    report: () => {},
    stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false },
  };
}
