// src/interface/cli/govern.ts
// Interface 层：`ans govern` 命令的解析与输出（**真治理会话**，设计 §2.2 / §3.2 / §5.2 / §12.3，任务 T5/T32）。
//
// 契约演进：契约 §5 原冻结签名 `governCommand(argv)` **不接收**配置，是「ans govern 以退出码 2 结束」的根因。
// 装配（src/index.ts，T2）以**超集第二参** `ConfigInjection{project, configSource}` 注入（与 runRoleCommand(argv, deps)
// 同形）；本命令**接收并使用**它：
//   · 无注入 → 用法错误（EXIT_USAGE，不静默回退到第二份演示配置）；
//   · 有注入 → 建**真治理会话**（runGovernSession）：其 gate 对**项目治理边界**求值。
//
// ── 目标项目目录（T32，设计 §12.3）────────────────────────────────────────────
// 本命令现**接受目标目录**：`ans govern [<目录>]`（可选位置参数；见 `args.ts::parseGovernArgs`）。
// **解析归编排（本层），配置注入归装配（T34）**：命令把解析到的目录经 deps/会话输入**原样传递**，
// 真正的 `projectRoot` 由**装配**据它设入 `deps.project.projectRoot`（缺省 = ans-cli 自身）。
// 编排侧提供两个传递面（均为 §6 安全的 Interface 出口，装配可直接调用，无需导入编排私有 `common/`）：
//   · `resolveGovernTargetDir(argv, deps?)`：算出**生效目标目录**（argv 位置参数优先，其次 deps.targetDir）；
//   · `GovernDeps.targetDir`：装配已自行算出目录时，可直接经 deps 注入，命令不重复解析。
//
// 适配器：装配对 govern 只注入配置、**不注入**演示适配器（与 role run 不同）。故本命令缺省经 Pi适配器的真实
// 适配器工厂（createPiAdapterFactory）开会话——`ans govern` 是一条**真实治理会话**。真实会话所需凭据/provider
// 配置缺失时**明确失败**（EXIT_FAILURE），绝不静默回退（与 role run 的 pi 路径同纪律）。可经 deps.createAdapter
// 注入替身（测试/自定义运行时），不改命令语义。

import type { RuntimeAdapter, WriteGate } from "../../provider/pi/session.ts";
import { runGovernSession } from "../../pipeline/orchestration/govern-session.ts";
import { createPiAdapterFactory } from "../../pipeline/orchestration/run-role.ts";
import { parseGovernArgs } from "../../common/编排/args.ts";
import { EXIT_FAILURE, EXIT_USAGE } from "../../common/编排/exit-codes.ts";
import type { ConfigInjection } from "../../index.ts";

/** 装配注入的超集：配置（ConfigInjection）+ 可选会话适配器工厂 / 目标角色 id / 目标目录。 */
export interface GovernDeps extends ConfigInjection {
  /** 可注入会话适配器工厂（缺省 = 真实 Pi 适配器工厂）。 */
  createAdapter?: (gate: WriteGate) => RuntimeAdapter;
  /** 本次治理会话要创建/重构的角色 id（CLI `--role` 的可选兜底来源）。 */
  targetRoleIds?: string[];
  /** 目标项目目录（装配已算出的兜底；CLI 位置参数 `<目录>` 优先于它）。真正设入 projectRoot 由装配完成（T34）。 */
  targetDir?: string;
}

/**
 * 解析 `ans govern` 的**生效目标目录**（设计 §12.3）：**argv 位置参数**优先，其次装配注入的 `deps.targetDir`；
 * 都没有则 `undefined`（= 装配回退 ans-cli 自身）。
 * 供**装配（T34）**计算 `projectRoot` 用——这是 §6 安全的 Interface 出口（装配本已动态导入本模块），
 * 装配无需导入编排私有 `common/编排/args.ts`。
 */
export function resolveGovernTargetDir(argv: string[], deps?: Pick<GovernDeps, "targetDir">): string | undefined {
  return parseGovernArgs(argv).dir ?? deps?.targetDir;
}

const USAGE = "用法：ans govern [<目录>] [--task <任务>] [--role <角色id>]…";

export async function governCommand(argv: string[], deps?: GovernDeps): Promise<number> {
  // 1) 参数解析（用法错误 → EXIT_USAGE）。目标目录为**可选位置参数**（`ans govern <目录>`，设计 §12.3）；
  //    解析归编排，但真正的 projectRoot 由装配注入（本命令只把目录原样传给引擎，不自行加载配置）。
  const parsed = parseGovernArgs(argv);
  if (parsed.errors.length > 0) {
    process.stderr.write(`ans govern 用法错误：${parsed.errors.join("；")}\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  // 2) 必须收到装配注入的配置（ConfigInjection）；缺注入即以清晰错误结束（不静默自持副本）。
  if (!deps) {
    process.stderr.write(
      "错误：缺少注入配置（ConfigInjection）。ans govern 需由装配入口（src/index.ts）注入 project/configSource；" +
        "编排不自备配置副本（契约 §6 配置数据单一来源在装配）。\n"
    );
    return EXIT_USAGE;
  }

  // 3) 生效目标目录（位置参数 > deps.targetDir）：透传给引擎。装配宜据此设 project.projectRoot（T34）。
  const targetDir = resolveGovernTargetDir(argv, deps);

  // 4) 适配器：注入优先；缺省 = 真实 Pi 适配器工厂。构造期失败即非 0，不静默回退 demo。
  let createAdapter: (gate: WriteGate) => RuntimeAdapter;
  try {
    createAdapter = deps.createAdapter ?? createPiAdapterFactory(deps.project);
  } catch (err) {
    process.stderr.write(`ans govern 无法建立会话适配器：${errText(err)}\n`);
    return EXIT_FAILURE;
  }

  // 5) 真治理会话（未知内置角色、边界解析失败、会话出错等失败路径由 runGovernSession 以非 0 码返回）。
  const targetRoleIds = parsed.roleIds.length > 0 ? parsed.roleIds : deps.targetRoleIds ?? [];
  const result = await runGovernSession(
    { taskId: parsed.taskId, project: deps.project, targetRoleIds, targetDir },
    { createAdapter }
  );
  return result.code;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
