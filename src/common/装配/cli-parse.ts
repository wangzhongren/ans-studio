// 装配私有：CLI 顶层参数解析。
// 只做“把 argv 归类到某条 Interface 命令”的纯解析，不导入任何下层对象。
// 纯函数，便于 test/装配/ 单测，无需其余角色落盘即可验证。

/** 顶层调用意图（判别联合）。 */
export type Invocation =
  | { kind: "role-run"; roleId: string; taskId: string; argv: string[] }
  | { kind: "govern"; argv: string[] }
  | { kind: "doctor" }
  | { kind: "help" }
  | { kind: "unknown"; message: string };

const HELP_TOKENS = new Set(["-h", "--help", "help"]);

/** 从形如 ["--task", "T-1"] 的参数里取 --task 的值；缺省返回 ""。 */
function readOption(argv: string[], name: string): string {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === name) {
      return argv[i + 1] ?? "";
    }
    const prefix = name + "=";
    if (token.startsWith(prefix)) {
      return token.slice(prefix.length);
    }
  }
  return "";
}

/**
 * 解析顶层 argv（不含 node 与脚本路径）。
 * 约定：
 *  - 空 / help 令牌          -> help
 *  - "doctor"                -> doctor（装配自检，当前即可运行）
 *  - "role" "run" <id> --task <t> -> role-run（argv 为 "role run" 之后的剩余参数）
 *  - "role" "run" … -h/--help -> role-run（整段放行；help 判定与退码归命令层 runRoleCommand）
 *  - "govern" ...            -> govern（argv 为 "govern" 之后的剩余参数）
 */
export function parseInvocation(argv: string[]): Invocation {
  const first = argv[0];

  if (first === undefined || HELP_TOKENS.has(first)) {
    return { kind: "help" };
  }

  if (first === "doctor") {
    return { kind: "doctor" };
  }

  if (first === "role") {
    if (argv[1] !== "run") {
      return { kind: "unknown", message: `未知的 role 子命令：${argv[1] ?? "(空)"}` };
    }
    const roleId = argv[2];
    if (roleId === undefined || roleId.length === 0) {
      return { kind: "unknown", message: "缺少角色 id：用法 ans role run <角色> --task <任务>" };
    }
    const taskId = readOption(argv.slice(3), "--task");
    // P1-4 配套（2026-10-13，编排转达的跨角色缺口，见 docs/change/）：`role run` 位形里出现 `-h`/`--help`
    // 时整体放行给命令层 runRoleCommand（帮助文本与退码归它；令牌集与命令层一致：仅 "-h"/"--help"，
    // 裸 "help" 不放行）。此前 `ans role run --help`（无 --task）在此被「缺少 --task」截住、help 到不了命令层。
    if (argv.slice(2).some((t) => t === "-h" || t === "--help")) {
      return { kind: "role-run", roleId, taskId, argv: argv.slice(2) };
    }
    if (taskId.length === 0) {
      return { kind: "unknown", message: "缺少 --task：用法 ans role run <角色> --task <任务>" };
    }
    return { kind: "role-run", roleId, taskId, argv: argv.slice(2) };
  }

  if (first === "govern") {
    return { kind: "govern", argv: argv.slice(1) };
  }

  return { kind: "unknown", message: `未知命令：${first}` };
}
