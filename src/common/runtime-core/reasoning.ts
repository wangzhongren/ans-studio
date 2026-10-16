// 运行时核心私有辅助：推理强度（G-5 wave 1 契约层）——中立档位归一 + 环境读写面 + 事件文案常量。
//
// 归属：运行时核心私有辅助（src/common/runtime-core/）。不 import 任何 SDK 包，可在纯单测中加载。
//
// 分层（沿评估 `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md` §五）：
// · 本模块＝**中立归一**（env 原值 → `ReasoningEffortV1`）：合法五值（trim＋忽略大小写）；
//   未设/空串/纯空白＝未设（留空＝平台默认，静默——面板 help 的「留空＝维持平台默认」的读取侧落点）；
//   其余一律 invalid（**绝不猜档**）——Service 侧按未设处理＋诊断如实，绝不毁会话。
// · 各平台原生落点（off/low/medium/high/xhigh 分别映射到什么）**不在此层**：适配器纯消费
//   `RuntimeProviderOptions.reasoningEffort`，映射表冻结点见 `src/model/runtime.ts` 该字段注释。
// · 推理事实的投影单点实现（脱敏＋预算）在 `tool-display.ts` 的 `projectReasoningDetail`
//   （与 protectText/凭据清单同源）；本模块只导出 Service 需要的文案常量。

import type { ReasoningEffortV1, RuntimeKind } from "../../model/runtime.ts";

/** 合法档位全集（唯一来源；顺序即产品档位梯 关/低/中/高/极高）。值域扩展点唯一＝本数组＋模型层联合类型。 */
export const REASONING_EFFORT_VALUES: readonly ReasoningEffortV1[] = Object.freeze([
  "off",
  "low",
  "medium",
  "high",
  "xhigh",
]);

/** 每运行时 env 键（PM 冻结；与 `RUNTIME_SETTINGS` 注册字段逐字一致——桌面面板写入的即是这些键）。`demo` 无键面。 */
export const REASONING_EFFORT_ENV_KEYS: Readonly<Record<Exclude<RuntimeKind, "demo">, string>> = Object.freeze({
  claude: "ANS_CLAUDE_REASONING_EFFORT",
  codex: "ANS_CODEX_REASONING_EFFORT",
  pi: "ANS_PI_REASONING_EFFORT",
});

/** 是否恰为合法档位字面值（大小写敏感＝规范形；宽松归一走 `normalizeReasoningEffortValue`）。 */
export function isReasoningEffortV1(value: unknown): value is ReasoningEffortV1 {
  return typeof value === "string" && (REASONING_EFFORT_VALUES as readonly string[]).includes(value);
}

/**
 * 归一结果的**三态**（未设/已设/非法三分，调用方据此决定「不注入字段/注入/不注入＋诊断」）：
 * `invalid.raw` 为 trim 后截断 64 字符的原值（仅供诊断描述；**不落会话、不落声明**）。
 */
export type ReasoningEffortResolution =
  | { readonly state: "unset" }
  | { readonly state: "set"; readonly effort: ReasoningEffortV1 }
  | { readonly state: "invalid"; readonly raw: string };

/**
 * 归一单个 env 值：`undefined`/`null`/空串/纯空白 ⇒ `unset`（静默——留空是**合法默认态**，不诊断）；
 * trim＋忽略大小写后命中五值之一 ⇒ `set`（规范小写形）；其余 ⇒ `invalid`（含 `minimal`/`max`/`ultra`
 * 等平台侧存在但中立 v1 未收编的档、中文标签、任意串——读取侧不发明别名，UI 标签→规范值的映射归写入侧）。
 */
export function normalizeReasoningEffortValue(raw: string | undefined | null): ReasoningEffortResolution {
  if (raw === undefined || raw === null) return { state: "unset" };
  const trimmed = raw.trim();
  if (trimmed === "") return { state: "unset" };
  const lowered = trimmed.toLowerCase();
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(lowered)
    ? { state: "set", effort: lowered as ReasoningEffortV1 }
    : { state: "invalid", raw: trimmed.slice(0, 64) };
}

/** 按运行时解析（纯读给入 env 快照；默认 `process.env`。`demo` 无键面＝恒 `unset`）。 */
export function resolveReasoningEffort(
  runtime: RuntimeKind,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReasoningEffortResolution {
  if (runtime === "demo") return { state: "unset" };
  return normalizeReasoningEffortValue(env[REASONING_EFFORT_ENV_KEYS[runtime]]);
}

/**
 * 推理事件的定格 summary（Service 在投影单点强制覆盖适配器随载荷带来的 summary——**承载语义
 * 全在 detail，summary 只是不随平台变化的如实标签**，杜绝未脱敏的随载荷文本借 summary 外流）。
 */
export const REASONING_EVENT_SUMMARY = "已思考";

/** 推理投影失败的定格 summary（沿「工具详情无法安全显示」形态；绝不伪装内容、绝不毁轮次）。 */
export const REASONING_DIAGNOSTIC_SUMMARY = "推理内容无法安全显示";
