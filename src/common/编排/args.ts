// src/common/编排/args.ts
// 命令参数解析：纯函数，不依赖任何运行层，便于单元测试。
// 退出码约定见 ./exit-codes.ts（0 = 成功，非 0 = 失败）：本模块只**报告**用法错误，
// 由调用方（Interface）据此以非 0 结束。

/** 运行时选择取值（与装配对齐）：demo = 装配演示假 runtime；pi = 真实 Pi 适配器。 */
import { RUNTIME_KINDS } from "../shared/runtime-shared.ts";
export { RUNTIME_KINDS };
export type { RuntimeKind } from "../shared/runtime-shared.ts";

export interface ParsedRoleRunArgs {
  roleId: string;
  taskId: string;
  /** `--runtime` 取值；"" 表示未在 argv 指定（由装配注入或默认决定）。 */
  runtime: string;
  /** 用法错误清单（未知/多余参数、缺角色、缺 --task、非法 --runtime 等）；非空即应非 0 结束。 */
  errors: string[];
}

// 解析 `ans role run <角色> --task <id> [--runtime demo|pi]`
//（argv 为 "role run" 之后的剩余参数；容忍 role/run 前导词）。
// 严格模式：未知旗标、多余裸词、选项缺值都计入 errors，**不静默忽略**。
// 支持 `--task T-1`、`-t T-1`、`--task=T-1` 三种写法；`--runtime` 同理。
export function parseRoleRunArgs(argv: string[]): ParsedRoleRunArgs {
  const tokens = argv.filter((t) => t !== "role" && t !== "run");
  const errors: string[] = [];
  let roleId = "";
  let taskId = "";
  let runtime = "";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--task" || t === "-t") {
      const value = tokens[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) errors.push(`选项 ${t} 缺少值`);
      else taskId = value;
      i += 1;
      continue;
    }
    if (t.startsWith("--task=")) {
      const value = t.slice("--task=".length);
      if (value === "") errors.push("选项 --task 缺少值");
      else taskId = value;
      continue;
    }
    if (t === "--runtime") {
      const value = tokens[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) errors.push("选项 --runtime 缺少值");
      else checkRuntime(value, errors, (v) => (runtime = v));
      i += 1;
      continue;
    }
    if (t.startsWith("--runtime=")) {
      const value = t.slice("--runtime=".length);
      if (value === "") errors.push("选项 --runtime 缺少值");
      else checkRuntime(value, errors, (v) => (runtime = v));
      continue;
    }
    if (t.startsWith("-")) {
      errors.push(`未知参数：${t}`);
      continue;
    }
    if (!roleId) roleId = t;
    else errors.push(`多余参数：${t}`);
  }

  if (!roleId) errors.push("缺少角色 id");
  if (taskId === "") errors.push("缺少 --task");
  return { roleId, taskId, runtime, errors };
}

// 校验 --runtime 取值；非法则计入 errors（不写回）。
function checkRuntime(value: string, errors: string[], assign: (v: string) => void): void {
  if ((RUNTIME_KINDS as readonly string[]).includes(value)) assign(value);
  else errors.push(`非法的 --runtime：${value}（应为 ${RUNTIME_KINDS.join("|")}）`);
}

// 解析 `--task <id>`，缺省用 fallback（govern 命令用）。
export function parseTaskId(argv: string[], fallback: string): string {
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--task" || t === "-t") return argv[i + 1] ?? fallback;
    if (t.startsWith("--task=")) return t.slice("--task=".length) || fallback;
  }
  return fallback;
}

export interface ParsedGovernArgs {
  taskId: string;
  runtime: string;
  /** 本次治理会话要创建/重构的角色 id（可多次 `--role`；作为 scope 可写集的来源）。 */
  roleIds: string[];
  /** **目标项目目录**（可选位置参数 `ans govern <目录>`，设计 §12.3）：治理会话在此目录上建立 projectRoot。
   *  缺省（未给出）= undefined，由**装配**回退到 ans-cli 自身（`resolveProjectRoot()`）。 */
  dir?: string;
  /** 用法错误清单；非空即应非 0 结束。 */
  errors: string[];
}

// 解析 `ans govern [<目录>] [--task <id>] [--role <角色id>]…`
//（argv 为 "govern" 之后的剩余参数；容忍前导 "govern" 词）。
// **位置参数**：**可选目标目录**（设计 §12.3，`ans govern <目录>`）——治理会话对该目录建立 projectRoot；
//   缺省 = 装配回退 ans-cli 自身。至多一个裸词；第二个裸词计用法错误（不静默忽略）。
// 未知旗标计用法错误。缺省 taskId = "T-GOV-1"。
export function parseGovernArgs(argv: string[]): ParsedGovernArgs {
  const tokens = argv.filter((t) => t !== "govern");
  const errors: string[] = [];
  const roleIds: string[] = [];
  let taskId = "";
  let dir: string | undefined;
  let runtime = "";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--task" || t === "-t") {
      const value = tokens[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) errors.push(`选项 ${t} 缺少值`);
      else taskId = value;
      i += 1;
      continue;
    }
    if (t.startsWith("--task=")) {
      const value = t.slice("--task=".length);
      if (value === "") errors.push("选项 --task 缺少值");
      else taskId = value;
      continue;
    }
    if (t === "--runtime") {
      const value = tokens[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) errors.push("选项 --runtime 缺少值");
      else checkRuntime(value, errors, (v) => (runtime = v));
      i += 1;
      continue;
    }
    if (t.startsWith("--runtime=")) {
      const value = t.slice("--runtime=".length);
      if (value === "") errors.push("选项 --runtime 缺少值");
      else checkRuntime(value, errors, (v) => (runtime = v));
      continue;
    }
    if (t === "--role" || t === "-r") {
      const value = tokens[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) errors.push(`选项 ${t} 缺少值`);
      else roleIds.push(value);
      i += 1;
      continue;
    }
    if (t.startsWith("--role=")) {
      const value = t.slice("--role=".length);
      if (value === "") errors.push("选项 --role 缺少值");
      else roleIds.push(value);
      continue;
    }
    if (t.startsWith("-")) {
      errors.push(`未知参数：${t}`);
      continue;
    }
    // 位置参数：**可选目标目录**（仅一个）。第二个裸词计用法错误。
    if (dir === undefined) dir = t;
    else errors.push(`多余参数：${t}`);
  }

  if (taskId === "") taskId = "T-GOV-1";
  return { taskId, roleIds, dir, runtime, errors };
}
