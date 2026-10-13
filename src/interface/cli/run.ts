// src/interface/cli/run.ts
// Interface 层：`ans role run` 命令的解析与输出。
//
// 只调用 Pipeline（相邻层）；不直接导入 Service / Provider 的**对象**（仅用其类型）。
// 命令解析与输出属本层；会话生命周期与编排在 Pipeline。
//
// 退出码约定（见 ../../common/编排/exit-codes.ts）：0 = 成功，非 0 = 失败。

import type { ProjectConfig } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import type { RuntimeAdapter, WriteGate } from "../../provider/pi/session.ts";
import type { RuntimeKind } from "../../common/编排/args.ts";
import type { AdapterFactoryBuilder } from "../../pipeline/orchestration/run-role.ts";
import { runRole, selectAdapterFactory } from "../../pipeline/orchestration/run-role.ts";
import { parseRoleRunArgs } from "../../common/编排/args.ts";
import { requireProjectConfig, requireTaskScope } from "../../common/编排/config.ts";
import { EXIT_OK, EXIT_USAGE } from "../../common/编排/exit-codes.ts";
import { CLI_POSITIONING } from "../../common/编排/cli-positioning.ts";

// `ans role run` 的帮助文本（`-h` / `--help`）。产品定位（P1-4，2026-10-13 客户批准的桌面体验提案）：
// 桌面是主工作台（交互式治理会话），CLI 是一次性执行器——如实指路（句子的单一来源见
// common/编排/cli-positioning.ts），不承诺本命令没有的能力。
const USAGE = `ans role run —— 运行一个受治理角色会话

用法：ans role run <角色> --task <任务> [--runtime demo|pi]

${CLI_POSITIONING}
`;

export async function runRoleCommand(
  argv: string[],
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<number> {
  // 0) 帮助（P1-4）：`-h`/`--help` 任一出现即打印用法与产品定位，退 0——不触配置、不开会话。
  //    注：真实入口 `ans role run --help`（无 --task）目前被装配 parseInvocation 判为「缺少 --task」
  //    的 unknown，help 令牌到不了本命令——**放行该位形归装配**（见 change 文档「跨角色登记」）；
  //    命令层已就位，装配放行后即端到端生效。带 --task 的位形（如 `ans role run <角色> --task T-1 --help`）
  //    经既有路由即可到达本处。
  if (argv.some((t) => t === "-h" || t === "--help")) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  // 1) 用法错误（未知/多余参数、缺角色、缺 --task、非法 --runtime）→ 非 0（EXIT_USAGE）。
  const parsed = parseRoleRunArgs(argv);
  if (parsed.errors.length > 0) {
    process.stderr.write(`ans role run 用法错误：${parsed.errors.join("；")}\n`);
    return EXIT_USAGE;
  }

  // 2) 契约 §5 冻结签名 runRoleCommand(argv, deps) 只承诺 { createAdapter }；装配以**纯值超集**
  //    注入 project / scope（可选再注入 runtime / piAdapterFactory）。缺注入即清晰错误结束。
  const injected = deps as {
    project?: ProjectConfig;
    scope?: TaskScope;
    runtime?: RuntimeKind;
    piAdapterFactory?: AdapterFactoryBuilder;
  };
  let project: ProjectConfig;
  let scope: TaskScope;
  try {
    project = requireProjectConfig(injected.project);
    scope = requireTaskScope(injected.scope);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ans role run 无法启动：${detail}\n`);
    return EXIT_USAGE;
  }

  // 3) 运行时选择（约定：--runtime demo|pi / ANS_RUNTIME，默认 demo；**装配解析并注入**）：
  //    装配通常已完成选择、直接把选定工厂注入 deps.createAdapter，并已剔除 argv 里的 --runtime；
  //    故此处置：argv 显式 --runtime（直连本命令时的兜底）优先，其次装配注入的 runtime，
  //    否则默认 demo——此时**沿用 deps.createAdapter**（即装配选定的 demo 或 pi 工厂），
  //    不自行读环境变量（env 已由装配解析，避免与装配的 argv>env 决策冲突）。
  const runtime = resolveRuntime(parsed.runtime, injected.runtime);
  const createAdapter = selectAdapterFactory(runtime, project, {
    createAdapter: deps.createAdapter,
    piFactory: injected.piAdapterFactory,
  });

  // 4) 会话编排：未知角色、边界解析失败、会话出错等失败路径由 runRole 以对应非 0 码返回。
  const result = await runRole(
    { roleId: parsed.roleId, taskId: parsed.taskId, project, scope },
    { createAdapter }
  );
  return result.code;
}

// 解析运行时取值；仅 "pi" 视为 pi，其余一律回退 demo（含未指定）。
// 不读环境变量：ANS_RUNTIME 由装配解析并注入，本层只认 argv 兜底与装配注入值。
function resolveRuntime(fromArgv: string, injected?: string): RuntimeKind {
  const candidate = fromArgv || injected || "demo";
  return candidate === "pi" ? "pi" : "demo";
}
