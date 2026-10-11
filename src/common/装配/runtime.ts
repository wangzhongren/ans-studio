// 装配私有：运行时选择（demo 假替身 / pi 真实适配器）。
//
// 约定（与编排对齐）：
//   - 命令行 `--runtime demo|pi`；环境变量 `ANS_RUNTIME`；**默认 demo**。
//   - 优先级：命令行 > 环境变量 > 默认。
//   - 纯函数、不导入下层对象，便于 test/装配/ 单测。
//
// 设计要点（"静默降级比报错更坏"）：选 pi 但缺凭据时，装配层**预先**报错并非 0 退出，
// 绝不悄悄退回 demo、绝不假装成功。

// §6 单一来源（T24）：`RuntimeKind` / `DEFAULT_RUNTIME` / `PI_CREDENTIAL_ENV_VARS` 已收进
// `src/common/shared/runtime-shared.ts`（项目管理属主，只读导入）。本模块**删本地副本**，
// 改为「导入 + 再导出」——既满足「不得有第二份实现」（工程法案 §一.5），又使本模块既有
// 公开面逐字不变（消费方 `test/装配/`、以及收敛窗口期 pm 的一致性核对测试仍按原名取用）。
import {
  RUNTIME_KINDS,
  DEFAULT_RUNTIME,
  PI_CREDENTIAL_ENV_VARS,
  type RuntimeKind,
} from "../shared/runtime-shared.ts";

export type { RuntimeKind };
export { DEFAULT_RUNTIME, PI_CREDENTIAL_ENV_VARS };

/** 合法取值集合（用于校验与错误信息）。单一来源 = shared 的 `RUNTIME_KINDS`。 */
export const RUNTIME_VALUES: readonly RuntimeKind[] = RUNTIME_KINDS;

/** 选择结果的来源，供 doctor/help 如实标注。 */
export type RuntimeSource = "argv" | "env" | "default";

export interface RuntimeSelection {
  runtime: RuntimeKind;
  source: RuntimeSource;
}

export type RuntimeResolution =
  | { ok: true; selection: RuntimeSelection }
  | { ok: false; message: string };

/** 从完整 argv 抽出的 --runtime 选项。present=false 表示未出现。 */
export interface RuntimeFlag {
  present: boolean;
  value: string;
}

function isRuntimeKind(value: string): value is RuntimeKind {
  return (RUNTIME_VALUES as readonly string[]).includes(value);
}

/**
 * 从**完整** argv 里抽出 `--runtime <值>` / `--runtime=<值>`，返回剔除该选项后的 argv
 * 与原始值。在任何位置出现均可；剔除后其余下游解析器（parseInvocation /
 * parseRoleRunArgs）不会再看到它——避免其被当作“未知参数”而误报用法错误。
 */
export function extractRuntimeArg(argv: string[]): { argv: string[]; flag: RuntimeFlag } {
  const rest: string[] = [];
  let present = false;
  let value = "";

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--runtime") {
      present = true;
      value = argv[i + 1] ?? "";
      i += 1; // 跳过取值（无值时 value 取空串表示“缺值”）
      continue;
    }
    const prefix = "--runtime=";
    if (token.startsWith(prefix)) {
      present = true;
      value = token.slice(prefix.length);
      continue;
    }
    rest.push(token);
  }

  return { argv: rest, flag: { present, value } };
}

/**
 * 依「命令行 > 环境变量 > 默认」解析运行时。
 * 非法取值（含 --runtime 缺值、ANS_RUNTIME 非法）一律返回 ok=false，由调用方非 0 结束——
 * 不静默忽略。
 */
export function resolveRuntime(
  flag: RuntimeFlag,
  env: Record<string, string | undefined>,
): RuntimeResolution {
  if (flag.present) {
    if (flag.value === "") {
      return { ok: false, message: `选项 --runtime 缺少值：应为 ${RUNTIME_VALUES.join(" 或 ")}` };
    }
    if (!isRuntimeKind(flag.value)) {
      return { ok: false, message: `无效的 --runtime 值：${flag.value}（应为 ${RUNTIME_VALUES.join(" 或 ")}）` };
    }
    return { ok: true, selection: { runtime: flag.value, source: "argv" } };
  }

  const fromEnv = env.ANS_RUNTIME;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    if (!isRuntimeKind(fromEnv)) {
      return { ok: false, message: `无效的 ANS_RUNTIME 值：${fromEnv}（应为 ${RUNTIME_VALUES.join(" 或 ")}）` };
    }
    return { ok: true, selection: { runtime: fromEnv, source: "env" } };
  }

  return { ok: true, selection: { runtime: DEFAULT_RUNTIME, source: "default" } };
}

/** 环境里是否存在任一 Pi 凭据变量（去空白后非空即算存在）。 */
export function hasPiCredential(env: Record<string, string | undefined>): boolean {
  return PI_CREDENTIAL_ENV_VARS.some((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}
