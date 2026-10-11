// 分段进度日志（契约 §4 修复：让"卡在哪一步"可归因）。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
// 不 import 任何 Pi 包。
//
// 规则：
// - stage：默认开启，简短一行，走 stderr（不污染 stdout 的会话转写）。
// - trace：仅当 ANS_PI_TRACE=1/true 时开启，附更细的细节。
// - **绝不打印凭据**：本模块只记录调用方传入的字符串；调用方负责不把 token 传进来。
//   凭据状态只允许以"已提供/缺失"这类布尔描述出现。

export interface StageLogger {
  stage(message: string): void;
  trace(message: string): void;
  readonly traceEnabled: boolean;
}

export const TRACE_ENV = "ANS_PI_TRACE";

export function createStageLogger(
  env: Record<string, string | undefined>,
  prefix = "[pi]",
): StageLogger {
  const raw = env[TRACE_ENV];
  const traceEnabled = raw === "1" || raw === "true" || raw === "yes";
  return {
    traceEnabled,
    stage(message: string): void {
      process.stderr.write(`${prefix} ${message}\n`);
    },
    trace(message: string): void {
      if (traceEnabled) process.stderr.write(`${prefix} · ${message}\n`);
    },
  };
}
