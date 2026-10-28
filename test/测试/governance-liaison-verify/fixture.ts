// test/测试/governance-liaison-verify/fixture.ts
// 测试角色：治理五角色（Lead / 主理）独立端到端验收夹具（2026-10-18）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造**：只读导入产品公开面（`listProject`/`openRoleSession`/`openGovernanceSession`/
//     账本/迁移/桌面 Interface/渲染纯函数），**不 import 任何实施方测试文件**。
//   · 全部在系统临时目录内进行、用后清理；不读 `.env`、不跑真实模型/凭据/网络。
//   · **适配器自建**：实施方的 `createFakeRuntimeAdapter` 不转发 W6-A 两个新能力
//     （`handOffIntent`/`requestClarification`），无法从工具调用端到端驱动；本夹具用运行时核心的
//     `buildGovernedTools` 自建一个等价假适配器（同样的「脚本 → 受治理工具 → 事件」语义），
//     把能力位逐个透传，使 `hand_off_intent`/`request_clarification` 的工具注册与编排包装器
//     在离线用例中真实执行。

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ProjectConfig, ResolvedRole } from "../../../src/model/role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type {
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  PromptOptions,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  ShellGate,
  ToolCall,
  WriteGate,
} from "../../../src/model/runtime.ts";
import type { AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import { buildGovernedTools, type ToolDefinition } from "../../../src/provider/runtime/tools.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/common/编排/governance-ledger.ts";

export const GOV_REL = "角色卡/governance-boundary.yaml";
export const INTENTS_REL = "docs/intents";

/** 旧 single 项目治理边界（条件目录；su 旧行为）。 */
export const SINGLE_GOV_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目文档",
  "  - kind: conditional-directory",
  "    path: .ans/",
  "    condition: project-init",
  "    root: project",
  "    purpose: 项目初始化",
  "",
].join("\n");

export const FIVE_ROLE_IDS = ["liaison", "rapporteur", "nominator", "convener", "verifier"] as const;

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 临时项目根 + 统一清理。 */
export function makeRoot(tag: string): { root: string; cleanup(): void } {
  const root = mkdtempSync(path.join(tmpdir(), `ans-liaison-verify-${tag}-`));
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

export function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

export function exists(root: string, rel: string): boolean {
  return existsSync(path.join(root, rel));
}

/** 项目角色：角色卡 + 边界（可用 `src/owned/<id>/`）。 */
export function writeProjectRole(root: string, roleId: string): void {
  write(root, `角色卡/${roleId}/role-card.md`, `# 角色：${roleId}\n\n独立验收夹具角色。\n`);
  write(
    root,
    `角色卡/${roleId}/boundary.yaml`,
    `role: ${roleId}\nentries:\n  - kind: directory\n    path: src/owned-${roleId}/\n    purpose: 角色代码\n`,
  );
}

/** trio 项目配置：模型显式 trio、注册表边界 + 项目接受证据（`.ans` 记录形态）。 */
export function trioProject(root: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    // 批次 A：六角色身份层（chief/product 为列表角色；旧 liaison 仍作只读别名可开会话，D 删除）。
    builtInRoles: [...FIVE_ROLE_IDS, "chief", "product"],
    governanceBoundary: {
      path: GOV_REL,
      acceptance: { accepted: true, source: "test:liaison-trio-accepted" },
    },
    ...overrides,
  };
}

/** 旧 single 项目配置（su 路径）：条件目录治理边界。 */
export function singleProject(root: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  if (!exists(root, GOV_REL)) write(root, GOV_REL, SINGLE_GOV_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: {
      path: GOV_REL,
      acceptance: { accepted: true, source: "test:single-accepted" },
    },
    ...overrides,
  };
}

/** 真实枚举（复用产品唯一实现）。 */
export function listOf(root: string): Promise<ProjectListing> {
  return listProject(root);
}

// —————————————————————— 自建假适配器（工具面端到端） ——————————————————————

/** 会话装配后的捕获面：gate 与能力（由真实 openRoleSession 构造）。 */
export interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
  boundRoleId?: string;
  /** 每次 prompt 的工具执行结果（按脚本顺序）。 */
  results?: Array<{ name: string; ok: boolean; message: string }>;
}

export function capture(): Captured {
  return {};
}

interface QueueItem<T> {
  value: T;
}

/** 最小异步事件队列（单消费者；close 后迭代结束）。 */
function createQueue<T>(): { push(value: T): void; close(): void; stream: AsyncIterable<T> } {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;
  return {
    push(value: T): void {
      const waiter = waiters.shift();
      if (waiter !== undefined) waiter({ value, done: false });
      else buffer.push(value);
    },
    close(): void {
      closed = true;
      for (const waiter of waiters.splice(0)) waiter({ value: undefined as unknown as T, done: true });
    },
    stream: {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
            if (closed) return Promise.resolve({ value: undefined as unknown as T, done: true });
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    },
  };
}

export interface ToolAdapterOptions {
  /** 脚本（每次 prompt 依次执行）。 */
  script?: ToolCall[];
  /** 按绑定角色给脚本（优先于 `script`）。 */
  scriptForRole?: (roleId: string) => ToolCall[] | undefined;
  /** 写根/读根（缺省临时项目根）。 */
  root?: string;
  /** shell 闸（缺省不注入）。 */
  shellGate?: ShellGate;
  /** 每轮 turnId（按 prompt 次序；缺省 `turn-<n>`）。 */
  turnIdFor?: (turnIndex: number) => string | undefined;
  /** 对指定角色抛错（模拟会话不可用）。参数：roleId。 */
  failForRole?: (roleId: string) => boolean;
  /** 记录每次 prompt 的文本（按角色）。 */
  prompted?: Map<string, string[]>;
}

/**
 * 自建假适配器工厂：与产品假适配器同语义（脚本 → 受治理工具 → 事件），但**逐个透传 W6-A
 * 两个新能力**到 `buildGovernedTools`（产品假适配器尚未转发，见文件头）。
 */
export function toolAdapterFactory(
  captured: Captured,
  opts: ToolAdapterOptions = {},
): (gate: WriteGate, caps?: AdapterCapabilities) => RuntimeAdapter {
  let roleId = "";
  let turnIndex = 0;
  let currentTurnId: string | undefined;
  return (gate, caps) => {
    captured.gate = gate;
    captured.caps = caps;
    captured.results = [];
    const factoryOpts = opts;
    return {
      async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
        return { systemPrompt: `# ${role.id}\n\n${role.cardText}` };
      },
      async bindRole(role: ResolvedRole): Promise<RoleSession> {
        roleId = role.id;
        captured.boundRoleId = role.id;
        const tools: ToolDefinition[] = buildGovernedTools(gate, {
          readRoot: factoryOpts.root,
          writeRoot: factoryOpts.root,
          currentTurnId: () => currentTurnId,
          roleId,
          runtime: caps?.runtime,
          ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
          ...(caps?.dispatchTask !== undefined ? { dispatchTask: caps.dispatchTask } : {}),
          ...(caps?.handOffIntent !== undefined ? { handOffIntent: caps.handOffIntent } : {}),
          ...(caps?.requestClarification !== undefined ? { requestClarification: caps.requestClarification } : {}),
          ...(caps?.reportHandback !== undefined ? { reportHandback: caps.reportHandback } : {}),
          ...(caps?.roleStatus !== undefined ? { roleStatus: caps.roleStatus } : {}),
          ...(caps?.sessionTail !== undefined ? { sessionTail: caps.sessionTail } : {}),
          ...(caps?.proposeRecovery !== undefined ? { proposeRecovery: caps.proposeRecovery } : {}),
          ...(caps?.installSkill !== undefined ? { installSkill: caps.installSkill } : {}),
          ...(caps?.uninstallSkill !== undefined ? { uninstallSkill: caps.uninstallSkill } : {}),
          ...(caps?.installMcp !== undefined ? { installMcp: caps.installMcp } : {}),
          ...(caps?.uninstallMcp !== undefined ? { uninstallMcp: caps.uninstallMcp } : {}),
          ...(factoryOpts.shellGate !== undefined ? { shellGate: factoryOpts.shellGate } : {}),
        });
        const byName = new Map(tools.map((tool) => [tool.name, tool]));
        const queue = createQueue<SessionEvent>();
        return {
          async prompt(text: string, _promptOpts?: PromptOptions): Promise<void> {
            if (factoryOpts.failForRole?.(roleId) === true) {
              throw new Error(`测试：角色 ${roleId} 会话不可用`);
            }
            turnIndex += 1;
            currentTurnId = factoryOpts.turnIdFor?.(turnIndex) ?? `turn-${turnIndex}`;
            factoryOpts.prompted?.get(roleId) ?? factoryOpts.prompted?.set(roleId, []);
            factoryOpts.prompted?.get(roleId)!.push(text);
            queue.push({ kind: "message", summary: `用户指令：${text}` });
            const script = factoryOpts.scriptForRole?.(roleId) ?? factoryOpts.script ?? [];
            for (const call of script) {
              queue.push({ kind: "tool_call", summary: `模型请求调用 ${call.name}`, detail: call });
              const tool = byName.get(call.name);
              if (tool === undefined) {
                queue.push({ kind: "denied", summary: `未知工具，拒绝执行：${call.name}`, detail: call });
                captured.results!.push({ name: call.name, ok: false, message: "工具未注册" });
                continue;
              }
              const result = await tool.handler(call);
              captured.results!.push({ name: call.name, ok: result.ok, message: result.message });
              queue.push({
                kind: result.ok ? "accepted" : "denied",
                summary: result.message,
                detail: { call, result },
              });
            }
            queue.push({ kind: "settled", summary: "会话结束" });
            queue.close();
          },
          events(): AsyncIterable<SessionEvent> {
            return queue.stream;
          },
          async dispose(): Promise<void> {
            queue.close();
          },
        };
      },
    };
  };
}

/** 消费事件流（runRole 的事件流在 settled 后关闭）。给出 `text` 时先发一轮。 */
export async function consume(
  handle: { send(text: string): Promise<void>; events(): AsyncIterable<{ kind?: string } | SessionEvent> },
  text?: string,
): Promise<Array<{ kind?: string; summary?: string }>> {
  if (text !== undefined) await handle.send(text);
  const events: Array<{ kind?: string; summary?: string }> = [];
  for await (const ev of handle.events()) events.push(ev as { kind?: string; summary?: string });
  return events;
}

/** 等待账本出现满足谓词的内容（含在飞 append 落盘；超时返回当刻快照）。 */
export async function waitForLedger(
  root: string,
  predicate: (entries: GovernanceLedgerEntry[], errors: string[]) => boolean,
  timeoutMs = 2000,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }> {
  const start = Date.now();
  for (;;) {
    await flushGovernanceLedger(root);
    const snapshot = await readGovernanceLedger(root);
    if (predicate(snapshot.entries, snapshot.errors)) return snapshot;
    if (Date.now() - start > timeoutMs) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * 种入客户对需求（intent-confirm）的决定（2026-10-18 客户拍板：initial hand_off 前必须有）。
 * `decision` 默认 accepted；传 `changes-requested` 可模拟「客户最后一条改成 revise」。
 */
export async function seedIntentConfirm(
  root: string,
  options: { flowId?: string; intentId?: string; decision?: "accepted" | "changes-requested" } = {},
): Promise<void> {
  const result = await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    ...(options.flowId !== undefined ? { flowId: options.flowId } : {}),
    ...(options.intentId !== undefined ? { intentId: options.intentId } : {}),
    actorRoleId: "liaison",
    power: "liaison",
    decisionKind: "intent-confirm",
    customerDecision: options.decision ?? "accepted",
  });
  if (!result.ok) throw new Error(`需求确认种子失败：${result.message}`);
}

/** 客户通道：choice 返回给定选项；confirm 返回给定布尔值；并记录被问到的请求。 */
export function customerChannel(opts: {
  selected?: string[];
  confirmed?: boolean;
  record?: CustomerInputRequest[];
}): CustomerInputFn {
  return (req) => {
    opts.record?.push(req);
    if (req.kind === "choice") {
      return {
        outcome: "answered",
        value: { selected: opts.selected ?? [] },
        operatorId: "test:客户",
      } satisfies CustomerInputOutcome;
    }
    return {
      outcome: "answered",
      value: { confirmed: opts.confirmed ?? false },
      operatorId: "test:客户",
    } satisfies CustomerInputOutcome;
  };
}

/** 意图记录（frontmatter 形状与评审 §5.2 一致）。 */
export function intentDoc(fields: {
  intentId: string;
  handoffKind?: string;
  goal: string;
  scope: string;
  acceptance: string;
  flowId?: string;
}): string {
  return [
    "---",
    `intentId: ${fields.intentId}`,
    ...(fields.handoffKind !== undefined ? [`handoffKind: ${fields.handoffKind}`] : []),
    `goal: ${fields.goal}`,
    `scope: ${fields.scope}`,
    `acceptance: ${fields.acceptance}`,
    ...(fields.flowId !== undefined ? [`flowId: ${fields.flowId}`] : []),
    "---",
    "",
    `# 意图 ${fields.intentId}`,
    "",
    "客户原话摘录：「先做一份离线验收提案。」",
    "",
  ].join("\n");
}

/** `hand_off_intent` 合法载荷（与 intentDoc 内容一致）。 */
export function handoffPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intentId: "intent-a",
    handoffKind: "initial",
    goal: "离线验收提案",
    scope: "只读分析",
    acceptance: "客户接受提案",
    summary: "为客户形成离线验收提案",
    flowId: "flow-a",
    ...overrides,
  };
}

/** 提案文件（frontmatter 形状与协作协议一致）。 */
export function proposalDoc(flowId: string, version = 1): string {
  return [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    "author: rapporteur",
    "status: draft",
    "---",
    "",
    `# 提案 ${flowId} v${version}`,
    "",
    "独立验收夹具提案。",
    "",
  ].join("\n");
}

/** 流程单（Markdown 表格；首格为步骤 id——派发门禁的解析口径）。 */
export function flowDoc(flowId: string, steps: string[]): string {
  return [
    `# 流程 ${flowId}`,
    "",
    "| 步骤 | 角色 | 状态 |",
    "| --- | --- | --- |",
    ...steps.map((step) => `| ${step} | A | pending |`),
    "",
  ].join("\n");
}

/** 账本条目助手。 */
export function ledgerEntry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: new Date().toISOString(),
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    ...over,
  };
}

/** 目录树快照（零写入证明；相对路径 + 类型 + 内容哈希）。 */
export function snapshotTree(root: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    let dirents;
    try {
      dirents = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbs = path.join(abs, d.name);
      const childRel = rel === "" ? d.name : `${rel}/${d.name}`;
      if (d.isDirectory()) {
        out.push(`dir:${childRel}`);
        walk(childAbs, childRel);
      } else if (d.isFile()) {
        out.push(`file:${childRel}:${sha256(readFileSync(childAbs))}`);
      }
    }
  };
  walk(root, "");
  return out;
}
