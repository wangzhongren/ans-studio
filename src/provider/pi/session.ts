// 会话适配器（契约 §4 的 src/provider/pi/session.ts）。
//
// 归属：Pi适配器角色。
// 本文件导出契约 §4 冻结的全部类型与两个工厂：
//   1. createFakeRuntimeAdapter —— **仅单元测试用**，不调用任何真实 SDK，
//      按 script 模拟模型动作，动作经受治理工具（buildGovernedTools）执行。
//   2. createPiRuntimeAdapter —— 真实适配器，基于 @earendil-works/pi-coding-agent。
//
// ⚠️ 依赖隔离：本模块**静态不导入任何 Pi 包**——因此加载本模块（含假适配器与全部
//    单测）不需要安装 Pi。真实实现放在私有 src/common/pi-adapter/real-adapter.ts，
//    仅在 createPiRuntimeAdapter 的返回对象被**实际调用**时经动态 import 懒加载。

import type { ResolvedRole } from "../../model/role.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { PinEntry } from "../../model/boundary.ts";
import { buildGovernedTools } from "./tools.ts";
import { createEventQueue } from "../../common/pi-adapter/event-queue.ts";
import { resolvePiProviderConfig, type PiProviderConfigInput } from "../../common/pi-adapter/provider-config.ts";

// —————————————————————— 契约 §4 冻结类型 ——————————————————————

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SessionEvent {
  kind: "tool_call" | "denied" | "accepted" | "message" | "settled";
  summary: string;
  detail?: unknown;
}

export interface RoleSession {
  prompt(text: string): Promise<void>;
  events(): AsyncIterable<SessionEvent>;
  dispose(): Promise<void>;
}

/** 由 Pipeline 注入，绑定 resolveWrite。取值即门禁引擎的判定结果。 */
export type WriteGate = (targetPath: string) => WriteDecision;

// —————————————— shell 命令级闸（设计 §7.2 冻结形状） ——————————————
//
// **判据不同**于 WriteGate：WriteGate 判「路径是否在边界内」，ShellGate 判「这条命令是否被允许执行」。
// 两者**不可互相替代**（设计 §7.1/§7.7）：shell 里 `echo x > 路径` 的写入不经过 resolveWrite。
// ShellGate 由**编排**装配、注入；Pi适配器**不含任何审核策略**，只调用它（与工具层「任何路径判定都不在这里」同纪律）。
//
// **不含 token**（设计 §7.1 第 3 条）：旧设计的「审核签 token、扩展层凭 token 放行」已废弃——token 可由公开
// 输入确定性推导，「token 一致」证明不了「审核发生过」。审核的每调用保证放在**唯一 spawn 点 execute**。

/** ShellGate 的入参：命令原文 + 规范化 argv + 固定 cwd + 本次调用的 toolCallId（供留痕）。 */
export interface ShellReviewRequest {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
}

/** 审核结论：恰好 `allow:true` 才放行；否则拒绝并给原因。**不含 token**（票据机制已废，§7.1 第 3 条）。 */
export type ShellReviewResult = { allow: true; by: string } | { allow: false; reason: string; by: string };

/** 由编排装配并注入的命令级闸（判定策略不在本角色）。 */
export type ShellGate = (req: ShellReviewRequest) => Promise<ShellReviewResult>;

// —————————————— (a) 操作者确认通道（设计 §7.4 冻结形状） ——————————————
//
// **来历（T20）**：三型原属**编排**私有 `src/common/编排/shell-gate.ts`，导致**桌面应用**只能**逐字镜像**
// （§6 禁止跨角色导入他人私有 `common/`）。经 PM 裁定**挪入本冻结契约家**——编排**自己已把**
// `ShellGate` / `ShellReviewRequest` / `ShellReviewResult` 放在此处。编排（T21）与桌面（T22）改为从本文件
// 导入，**形状逐字不变**（本次只加类型，不改既有导出）。

/** (a) 提示操作者的入参：命令原文 + 规范化 argv + 固定 cwd + 为何升级到人 + toolCallId。 */
export interface OperatorPrompt {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
  /** 为何升级到人（(b) 拿不准 / 不可用），供提示文案。 */
  reason?: string;
}

/** (a) 操作者的裁决结果。`unavailable` 表示通道不可用（无人值守 / 界面未接）。 */
export type OperatorOutcome =
  | { outcome: "allow"; operatorId?: string }
  | { outcome: "deny"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

/**
 * 「问操作者」注入点（CLI 读 stdin / 桌面弹层）。
 * 抛错 → 视为通道不可用；超时（由编排的超时包装）→ 拒绝。二者都落「拒绝」（§7.5：a 不可用 → 拒）。
 */
export type OperatorChannelFn = (
  prompt: OperatorPrompt,
) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined;

// —————————————— 创世收口能力（finalize_bootstrap，设计 §13.1；T36） ——————————————
//
// **来历（T36）**：设计 §13.1 的 `finalize_bootstrap` 工具要调用一个由**编排**构造、注入本适配器的能力——
// 「提议收口、挂起等客户确认」（**不是「立即完成」**）。该能力的**形状**此前只在编排私有
// `src/common/编排/finalize.ts` 声明（`FinalizeBootstrapFn` / `FinalizeResult`）。
// 而 **§6 禁跨角色导入他人私有 `common/`**、**§一.2 禁 Provider 向上导入 Pipeline（编排公开面）**，
// 故 Pi适配器**无正当通路**导入它。依设计 §3.11「唯一正当落点是 `common/shared/` 或 **§4 冻结契约家**」
// 与 **T20 先例**（operator 三型逐字入本文件），把这两个形状**逐字**声明于本冻结契约家——
// **读编排私有 `finalize.ts` 确认形状、不导入、不复制实现**。编排的 `FinalizeBootstrapFn` 由**结构类型**
// 保证可注入（二者逐字一致）。**后续收敛（供编排）**：编排宜改为从本文件导入这两个形状，使来源唯一
// （与 T20→T21 收敛 operator 三型的做法一致）。

/** finalize 的结果状态（逐字取自编排 `src/common/编排/finalize.ts`；设计 §13.1）。 */
export type FinalizeStatus =
  | "completed" // 客户确认通过且写出成功
  | "declined" // 客户拒绝
  | "unavailable" // 确认通道不可用 / 未接 / 超时 → fail-closed
  | "not-genesis" // 非创世态 → 拒绝（不是静默）
  | "nothing-to-pin" // 无可 pin 之物 → 拒绝
  | "blocked"; // 未 settle / 门禁拒 / 其他失败

/** finalize 的结果（逐字取自编排 `src/common/编排/finalize.ts`；形状由编排公开面唯一决定）。 */
export interface FinalizeResult {
  ok: boolean; // === (status === "completed")
  status?: FinalizeStatus;
  message?: string;
  reason?: string;
  wrote: string[];
  pins: PinEntry[];
  roles: string[];
  projectJsonRel: string;
  manifestRel: string;
}

/**
 * **创世收口能力**（注入给 Pi适配器 `finalize_bootstrap` 工具的**确切形状**，设计 §13.1 / T36）：
 * 调用即「**提议收口并挂起等客户确认**」（**不是**「立即完成」）。返回给模型/界面的反馈见 `FinalizeResult`。
 * 形状**逐字**取自编排 `src/common/编排/finalize.ts::FinalizeBootstrapFn`（读之确认，不导入）。
 */
export type FinalizeBootstrapFn = (opts?: { acceptanceSource?: string; now?: () => Date }) => Promise<FinalizeResult>;

export interface RuntimeAdapter {
  composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }>;
  bindRole(role: ResolvedRole): Promise<RoleSession>;
}

// —————————————————————— 公共辅助 ——————————————————————

/** 由角色卡文本与边界来源拼出系统提示（不做任何判定，只做呈现）。 */
function renderSystemPrompt(role: ResolvedRole): string {
  const lines = [
    `# 角色：${role.id}`,
    "",
    role.cardText.trim(),
    "",
    `## 边界来源`,
    role.boundarySource,
  ];
  return lines.join("\n");
}

// —————————————————————— 假适配器（仅单元测试） ——————————————————————

/** 缺省脚本：一次越界写（write_file 到 src/evil.ts），用于演示"写之前被拒"。 */
const DEFAULT_FAKE_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } },
];

/**
 * 假运行时适配器：不调用任何真实 Pi SDK。
 * 按 script 逐个"模拟模型动作"，每个动作都经受治理工具集执行——因此治理判定
 * 与真实适配器走**同一条** buildGovernedTools(gate) 路径。
 *
 * writeRoot（可选）：显式给出写根后，被允许的写入会**真正落盘**（设计 §3.1）。
 * 未给出时写类工具仅判定、不落盘（fail-closed：写根不明 ⇒ 不写）——测试若需验证
 * 真实落盘，请把 writeRoot 指向临时目录，切勿指向仓库。
 */
export function createFakeRuntimeAdapter(opts: {
  gate: WriteGate;
  script?: ToolCall[];
  /** 读根（read_file 相对路径基准）；缺省 process.cwd()。 */
  readRoot?: string;
  /** 写根（write_file/edit_file 落盘安全基准）；缺省不落盘。 */
  writeRoot?: string;
  /** shell 命令级闸（设计 §7.2）；**未注入时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /** shell 固定工作目录（须钉在 projectRoot）；缺省 process.cwd()。 */
  shellCwd?: string;
  /** shell 审核硬超时（毫秒）；缺省读环境变量，再缺省 120000。 */
  shellReviewTimeoutMs?: number;
  /**
   * 创世收口能力（设计 §13.1 / T36）：由编排构造、注入。**仅当注入时** `finalize_bootstrap` 工具才注册
   * （**同 `shellGate` 的「未注入即不注册」先例**——能力注入决定注册；调用方**只在创世态**才注入）。
   */
  finalizeBootstrap?: FinalizeBootstrapFn;
}): RuntimeAdapter {
  const script = opts.script ?? DEFAULT_FAKE_SCRIPT;

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return { systemPrompt: renderSystemPrompt(role) };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      void role;
      const tools = buildGovernedTools(opts.gate, {
        readRoot: opts.readRoot,
        writeRoot: opts.writeRoot,
        shellGate: opts.shellGate,
        shellCwd: opts.shellCwd,
        shellReviewTimeoutMs: opts.shellReviewTimeoutMs,
        finalizeBootstrap: opts.finalizeBootstrap,
      });
      const byName = new Map(tools.map((t) => [t.name, t]));
      const queue = createEventQueue<SessionEvent>();

      return {
        async prompt(text: string): Promise<void> {
          queue.push({ kind: "message", summary: `用户指令：${text}` });

          for (const call of script) {
            queue.push({
              kind: "tool_call",
              summary: `模型请求调用 ${call.name}`,
              detail: call,
            });

            const tool = byName.get(call.name);
            if (tool === undefined) {
              queue.push({
                kind: "denied",
                summary: `未知工具，拒绝执行：${call.name}`,
                detail: call,
              });
              continue;
            }

            // 经受治理工具执行——判定发生在工具内部"写入之前"。
            const result = await tool.handler(call);
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
}

// —————————————————————— 真实 Pi 适配器（懒加载） ——————————————————————

/**
 * 真实 Pi 运行时适配器（契约 §4 / 附录 A）。
 *
 * 依赖隔离：本函数**同步**返回一个 RuntimeAdapter 外壳；只有其方法被调用时才经动态
 * import 加载私有实现 src/common/pi-adapter/real-adapter.ts（那里才 import Pi 包）。
 * 这样即便未安装 Pi，本模块与假适配器、全部单测仍可正常加载。
 *
 * 显式 provider（方案 b）：契约 §4 的三个必需字段不变；额外**可选**字段
 * （providerId / baseUrl / modelId / apiKeyEnvVar）用于显式指定 provider。
 * **构造时即校验**：baseUrl / modelId 缺失即抛错，绝不回落到默认端点（见 provider-config.ts）。
 */
export interface PiRuntimeAdapterOptions extends PiProviderConfigInput {
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** shell 命令级闸（设计 §7.2）；由编排装配后注入。**缺省时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /**
   * 创世收口能力（设计 §13.1 / T36）：由编排构造、注入。**仅当注入时** `finalize_bootstrap` 工具才注册
   * （**同 `shellGate` 的「未注入即不注册」先例**——能力注入决定注册；调用方**只在创世态**才注入）。
   */
  finalizeBootstrap?: FinalizeBootstrapFn;
  /** prompt 硬超时（毫秒）；缺省读 ANS_PI_PROMPT_TIMEOUT_MS，再缺省 120000。 */
  promptTimeoutMs?: number;
  /** 构造期单步硬超时（毫秒）；缺省读 ANS_PI_CONSTRUCT_TIMEOUT_MS，再缺省 120000。 */
  constructTimeoutMs?: number;
  /** shell 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。超时 = 拒绝。 */
  shellReviewTimeoutMs?: number;
}

export function createPiRuntimeAdapter(opts: PiRuntimeAdapterOptions): RuntimeAdapter {
  // 构造时预校验显式 provider 配置：缺失即**明确失败**（fail-closed，不发往默认端点）。
  // 这一步不 import Pi 包，保持懒加载性质。
  const config = resolvePiProviderConfig(opts, process.env);

  let real: RuntimeAdapter | undefined;
  const load = async (): Promise<RuntimeAdapter> => {
    if (real === undefined) {
      const mod = await import("../../common/pi-adapter/real-adapter.ts");
      real = mod.createRealPiRuntimeAdapter({ ...opts, config });
    }
    return real;
  };

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return (await load()).composeContext(role);
    },
    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      return (await load()).bindRole(role);
    },
  };
}
