#!/usr/bin/env node
// ANS CLI 可执行入口（装配层）。
// Node 24 原生擦除 TypeScript 类型，直接动态导入 src/index.ts —— 需 npm install，免构建。
//
// 收敛保证（关键）：顶层 `await main(...)` 必须**真正 resolve** 并给出退出码，进程随后正常
// 结束——不再依赖事件循环“意外排空”（那会导致 unsettled top-level await 警告与不可靠的退出码）。
// 若 main() 因未释放资源（定时器/句柄/事件流）迟迟不 resolve，入口以**兜底超时**
// （默认 5 分钟，环境变量 ANS_ENTRY_TIMEOUT_MS 可覆盖）强制以非 0 退出并说明“入口超时”。
// 绝不无限等待、绝不以默认 0 静默退出。
import { main } from "../src/index.ts";
import { resolveEntryTimeoutMs } from "../src/common/装配/entry-timeout.ts";

const timeoutMs = resolveEntryTimeoutMs(process.env);

// 兜底计时器**不** unref：这样即使 main() 挂起且没有其它活动句柄，循环仍被计时器保活，
// 到点即触发；main() 正常收敛时在 finally 里 clearTimeout，循环随之排空、进程正常退出。
let settled = false;
const timeoutTimer = setTimeout(() => {
  if (settled) return;
  process.stderr.write(
    `ans 入口超时：main() 在 ${timeoutMs} ms 内未收敛，强制以非 0 退出` +
      `（可用 ANS_ENTRY_TIMEOUT_MS 覆盖）。\n`,
  );
  // 超时属异常路径：直接以确定码退出，不再等待可能的挂起资源。
  process.exit(1);
}, timeoutMs);

try {
  const code = await main(process.argv.slice(2));
  // 用 process.exitCode（而非 process.exit）以便正常刷出 stdout 后按真实码结束。
  process.exitCode = typeof code === "number" ? code : 0;
} catch (err) {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`ans 启动失败：${detail}\n`);
  process.exitCode = 1;
} finally {
  settled = true;
  clearTimeout(timeoutTimer);
}
