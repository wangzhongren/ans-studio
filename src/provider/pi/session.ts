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
//    仅在 createPiRuntimeAdapter 返回对象的 bindRole 被调用时经动态 import 懒加载。

import type { ResolvedRole } from "../../model/role.ts";
import { randomUUID } from "node:crypto";
import { buildGovernedTools } from "./tools.ts";
import { createInteractionGate } from "../../common/pi-adapter/timeout.ts";
import { createEventQueue } from "../../common/pi-adapter/event-queue.ts";
import { resolvePiProviderConfig, type PiProviderConfigInput } from "../../common/pi-adapter/provider-config.ts";
import { renderInstalledSkillsSection } from "../../common/编排/installed-skills.ts";

// The neutral Model is the sole contract owner. Explicit old-path compatibility exports.
export type {
  ToolCall, SessionEvent, PromptImage, PromptOptions, RoleSession, WriteGate,
  ShellReviewRequest, ShellReviewResult, ShellGate, OperatorPrompt, OperatorOutcome, OperatorChannelFn,
  FinalizeStatus, FinalizeResult, CustomerInputOption, CustomerInputRequest, CustomerInputOutcome,
  CustomerInputFn, CustomerInputMetadata, ReportHandbackPayload, ReportHandbackReceipt,
  ReportHandbackMetadata, ReportHandbackFn, DispatchTaskPayload, DispatchReceipt, DispatchTaskFn,
  ShellVerdictPayload, ShellVerdictFn, RuntimeAdapter,
} from "../../model/runtime.ts";
import type {
  ToolCall, SessionEvent, PromptOptions, RoleSession, WriteGate, ShellGate, CustomerInputFn,
  ReportHandbackFn, DispatchTaskFn, ShellVerdictFn, RuntimeAdapter, RuntimeProviderOptions,
} from "../../model/runtime.ts";

// —————————————————————— 公共辅助 ——————————————————————

/**
 * 由角色卡文本与边界来源拼出系统提示（不做任何判定，只做呈现）。
 *
 * G-4（客户 2026-10-16 批准）：追加「已安装技能」注入节——`renderInstalledSkillsSection`
 * （`src/common/编排/installed-skills.ts`）是这段文本的**渲染单一来源**；本函数只做一件事：
 * **非空 ⇒ 整段拼接**（逐字不改写、不重排、不另写模板）；空串（零技能/从未安装/空 projectRoot）
 * ⇒ 逐字零渲染（对照会话与未装技能角色系统提示零变化）。判据与坏件处置全在渲染器内，
 * 调用侧不预扫 `docs/skills`。假适配器与防真外壳共用本函数（测试面跨运行时逐字一致）。
 */
function renderSystemPrompt(role: ResolvedRole, projectRoot?: string): string {
  const base = [
    `# 角色：${role.id}`,
    "",
    role.cardText.trim(),
    "",
    `## 边界来源`,
    role.boundarySource,
  ].join("\n");
  const skills = renderInstalledSkillsSection(projectRoot ?? "", role.id);
  return skills === "" ? base : `${base}\n\n${skills}`;
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
  /**
   * 项目根（G-4 注入节基准）：给出时系统提示追加「已安装技能」注入节（非空才拼、逐字原样；
   * 渲染单一来源＝编排 `renderInstalledSkillsSection`）。**缺省不注入**（空 projectRoot ⇒
   * 渲染器返回空串 ⇒ 逐字零渲染，旧行为逐字不变）。
   */
  projectRoot?: string;
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
   * 客户确认制交互能力（设计 A-1）：由编排/前端构造、注入。**仅当注入时** `request_confirmation` /
   * `request_choice` 两工具才注册（**同 `shellGate` 的「未注入即不注册」先例**——
   * 判据是「有无客户通道」）。
   */
  customerInput?: CustomerInputFn;
  /** 交互等待硬超时（毫秒）；**缺省不设限**（G-1：一直等客户作答）——仅显式给出本项或环境变量 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 才计时。**超时 = 未获同意**。 */
  customerInputTimeoutMs?: number;
  /**
   * 交报告能力（设计 C-1）：由编排构造、注入。**仅当注入时** `submit_report` 工具才注册
   * （**同 `shellGate` 的「未注入即不注册」先例**；只给项目角色——su 不注入即不注册）。
   */
  reportHandback?: ReportHandbackFn;
  /**
   * 派发任务能力（设计 H-1）：由编排构造、注入。**仅当注入时** `dispatch_task` 工具才注册
   * （**只给 su**——编排对项目角色不注入 ⇒ 不存在；同 `shellGate` 先例）。
   */
  dispatchTask?: DispatchTaskFn;
  /**
   * shell 审读结论能力（R-1）：由编排构造、注入。**仅当注入时** `report_shell_verdict` 工具才注册
   * （**只给审读会话**——由调用方以是否注入表达；同 `shellGate` 先例）。
   */
  shellVerdict?: ShellVerdictFn;
}): RuntimeAdapter {
  const script = opts.script ?? DEFAULT_FAKE_SCRIPT;

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return { systemPrompt: renderSystemPrompt(role, opts.projectRoot) };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      void role;
      const tools = buildGovernedTools(opts.gate, {
        readRoot: opts.readRoot,
        writeRoot: opts.writeRoot,
        shellGate: opts.shellGate,
        shellCwd: opts.shellCwd,
        shellReviewTimeoutMs: opts.shellReviewTimeoutMs,
        customerInput: opts.customerInput,
        customerInputTimeoutMs: opts.customerInputTimeoutMs,
        reportHandback: opts.reportHandback,
        dispatchTask: opts.dispatchTask,
        shellVerdict: opts.shellVerdict,
      });
      const byName = new Map(tools.map((t) => [t.name, t]));
      const queue = createEventQueue<SessionEvent>();

      return {
        async prompt(text: string, opts?: PromptOptions): Promise<void> {
          // 假适配器没有模型，**不消费图片**——但签名保持与契约一致（K-2）；无图时事件逐字不变。
          const imageCount = opts?.images?.length ?? 0;
          queue.push({
            kind: "message",
            summary: imageCount > 0 ? `用户指令：${text}（附 ${imageCount} 张图片）` : `用户指令：${text}`,
          });

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
 * import 加载私有实现 src/common/pi-adapter/real-adapter.ts（那里才 import Pi 包）；composeContext 仅渲染文本。
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
   * 客户确认制交互能力（设计 A-1）：由编排/前端构造、注入。**仅当注入时** `request_confirmation` /
   * `request_choice` 两工具才注册（判据是「有无客户通道」）。
   */
  customerInput?: CustomerInputFn;
  /**
   * 交互等待硬超时（毫秒）；**缺省不设限**（G-1）——仅显式给出或环境变量 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`
   * 才计时。等待期间 real-adapter 会经活动闸**暂停每轮硬超时**（作答后按剩余时间恢复），
   * 「等客户」的轮次不再被整轮时限掐断。
   */
  customerInputTimeoutMs?: number;
  /**
   * 交报告能力（设计 C-1）：由编排构造、注入。**仅当注入时** `submit_report` 工具才注册
   * （判据是「本会话有回交目标」；只给项目角色——su 不注入即不注册）。
   */
  reportHandback?: ReportHandbackFn;
  /**
   * 派发任务能力（设计 H-1）：由编排构造、注入。**仅当注入时** `dispatch_task` 工具才注册
   * （**只给 su**——由编排以是否注入表达）。
   */
  dispatchTask?: DispatchTaskFn;
  /**
   * shell 审读结论能力（R-1）：由编排构造、注入（**审读会话专用**——pm-reviewer 路径）。
   * **仅当注入时** `report_shell_verdict` 工具才注册。
   */
  shellVerdict?: ShellVerdictFn;
  /**
   * 会话持久化目录（设计 D-1，重启恢复）：**给了** ⇒ 该项目角色的会话以 JSONL 落盘于该目录
   * （有最近会话即恢复，否则新建；**应逐角色隔离**，如 `<项目>/.ans/sessions/<角色>/`）；
   * **缺省** ⇒ 逐字保留旧行为（`SessionManager.inMemory`，不落盘）。适配器只读写该目录，不碰 `~/.pi`。
   */
  sessionDir?: string;
  /** prompt 硬超时（毫秒）；缺省读 ANS_PI_PROMPT_TIMEOUT_MS，再缺省 120000。 */
  promptTimeoutMs?: number;
  /** 构造期单步硬超时（毫秒）；缺省读 ANS_PI_CONSTRUCT_TIMEOUT_MS，再缺省 120000。 */
  constructTimeoutMs?: number;
  /** shell 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。超时 = 拒绝。 */
  shellReviewTimeoutMs?: number;
}

export function createPiRuntimeAdapter(opts: RuntimeProviderOptions): RuntimeAdapter;
export function createPiRuntimeAdapter(opts: PiRuntimeAdapterOptions): RuntimeAdapter;
export function createPiRuntimeAdapter(opts: RuntimeProviderOptions | PiRuntimeAdapterOptions): RuntimeAdapter {
  const input = { ...opts };
  if ("runtime" in input && input.runtime !== "pi") throw new Error(`Pi 适配器不支持 runtime: ${input.runtime}`);
  const config = resolvePiProviderConfig(input, process.env);
  const load = () => import("../../common/pi-adapter/real-adapter.ts");
  return {
    async composeContext(role) {
      // No SDK initialization is needed to render this text.
      return { systemPrompt: renderSystemPrompt(role, input.projectRoot) };
    },
    async bindRole(role) {
      const mod = await load();
      if ("tools" in input) {
        return mod.createRealPiRuntimeAdapter({ ...input, config }).bindRole(role);
      }
      // Approved v1 compatibility edge: public Pi facade -> public core tool operations.
      // Production Service inputs never take this branch or recreate tools.
      const interactionGate = createInteractionGate();
      let turnId: string | undefined;
      const currentTurnId = () => turnId;
      const tools = buildGovernedTools(input.gate, {
        ...input, readRoot: input.projectRoot, writeRoot: input.projectRoot,
        shellCwd: input.projectRoot, interactionGate, currentTurnId, runtime: "pi", roleId: role.id,
        extraCredentialEnvVars: config.apiKeyEnvVar ? [config.apiKeyEnvVar] : [],
      });
      const inner = await mod.createRealPiRuntimeAdapter({
        ...input, config, runtime: "pi", tools, interactionGate, currentTurnId,
      }).bindRole(role);
      return {
        runtime: "pi", roleId: role.id,
        get contextSource() { return inner.contextSource; },
        get nativeSessionId() { return inner.nativeSessionId; },
        get contextWarning() { return inner.contextWarning; },
        async prompt(text, options) {
          if (turnId) throw new Error("Agent is already processing a prompt.");
          turnId = randomUUID();
          try { await inner.prompt(text, options); } finally { turnId = undefined; }
        },
        events: () => inner.events(),
        abort: () => inner.abort?.(),
        dispose: () => inner.dispose(),
      };
    },
  };
}
