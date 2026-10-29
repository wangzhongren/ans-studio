// src/common/门禁引擎/shell-write-guard.ts
// 2026-10-29（方案 v2.1 §6.3/§6.4；客户 Q1 A）：shell **写目标守卫**——确定性同步判定 + 注入 `checkWrite`。
//
// 不是「无 IO 的纯函数」：`resolveWrite` 需要边界/任务 scope/skillRoot 并调用 realpath（F4 口径）。
// 本方案把 realResolve 封在**注入的 `checkWrite` 闭包**里（装配点 `pipeline/orchestration/shell-arming.ts`
// 构造，同一份 `resolveWrite`），守卫本身不读盘、不另写第二份路径判定。
//
// 决策：
//   · `pass`   —— 无显式写目标（只读/未知命令），交既有 (c)/(b)/(a) 链；
//   · `deny`   —— 显式写目标越界/治理路径/逃逸（**直接拒绝，不弹卡、不交 judge**）；
//   · `opaque` —— 无法静态界定写目标（node 脚本/构建包脚本等）→ 交 (a) 且 `manualOnly`（开关不代批）。
//
// 显式写目标解析按程序分类；目标先按 cwd 归一化为项目相对路径（拒绝绝对越界/`..` 逃逸），再逐目标调用
// `checkWrite`（与 F4/realpath/大小写同一语义）。全部在边界内 ⇒ pass（该问客户的仍由既有审批链问）。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { TaskScope } from "../../model/decision.ts";
import path from "node:path";
import { isOpaqueShellExecution } from "./classify-shell.ts";

export interface ShellWriteGuardInput {
  argv: readonly string[];
  cwd: string;
  projectRoot: string;
  skillRoot: string;
  boundary: BoundarySection1;
  /** 任务级写集（派发时存在则收窄；缺省 = Section 1）。 */
  scope?: TaskScope;
  conditions?: readonly string[];
  /** 禁写前缀（`.ans/`、`角色卡/` 等；命中即 deny）。 */
  forbiddenPrefixes: readonly string[];
  /**
   * 注入：与 F4/写区**同一实现**（resolveWrite）。`relPath` 为项目相对 POSIX 路径；
   * realResolve/boundary/scope/skillRoot 封在本闭包内——不得另写第二份路径判定。
   */
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
}

export type ShellWriteGuardDecision =
  | { kind: "pass" }
  | { kind: "deny"; reason: string; targets: string[] }
  | { kind: "opaque"; reason: string };

const EXE_SUFFIX = /\.(exe|cmd|bat|ps1|com)$/i;

function baseName(raw: string): string {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  const segments = value.split(/[\\/]/).filter((segment) => segment !== "");
  const base = segments.length > 0 ? segments[segments.length - 1]! : value;
  return base.replace(EXE_SUFFIX, "").toLowerCase();
}

/** 项目相对化：cwd 相对项目根 → 目标相对 cwd；拒绝逃出项目根/绝对外部路径。 */
function resolveTarget(projectRoot: string, cwd: string, target: string): { rel: string } | { error: string } {
  const raw = target.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  if (raw === "") return { error: "空路径" };
  const isAbsolute = raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw);
  const projectAbs = path.resolve(projectRoot);
  let cwdAbs = path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(projectAbs, cwd);
  // 防御：执行 cwd 由适配器钉在项目根；若调用方传入的项目外/不可解析 cwd（旧测试/桩），
  // 以项目根为基准（绝不把目标按外部目录解释后放行）。
  const cwdRel = path.relative(projectAbs, cwdAbs);
  if (cwdRel.startsWith("..") || path.isAbsolute(cwdRel)) cwdAbs = projectAbs;
  const abs = isAbsolute ? path.resolve(raw) : path.resolve(cwdAbs, raw);
  const rel = path.relative(projectAbs, abs);
  if (rel === "") return { rel: "." };
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { error: `目标在项目根之外：${target}` };
  }
  return { rel: rel.replace(/\\/g, "/") };
}

/** 提取「显式写目标」类命令的目标参数（argv[0] 之后）。 */
function explicitWriteTargets(argv: readonly string[]): string[] | undefined {
  if (argv.length === 0) return undefined;
  const program = baseName(argv[0]!);
  const args = argv.slice(1);
  const nonOptions = args.filter((arg) => !arg.startsWith("-"));
  switch (program) {
    case "cp":
    case "copy":
    case "mv":
    case "move":
    case "ren":
    case "rename":
      // cp: 最后参数是目标、其余是源（源不写）；mv/rename: 源被删除——源+目标都算写目标。
      if (nonOptions.length === 0) return undefined;
      if (program === "cp" || program === "copy") return [nonOptions[nonOptions.length - 1]!];
      return nonOptions;
    case "tee":
    case "touch":
    case "mkdir":
    case "md":
    case "rm":
    case "rmdir":
    case "del":
    case "erase":
      return nonOptions.length > 0 ? nonOptions : undefined;
    case "chmod":
    case "chown":
    case "chgrp":
    case "attrib":
    case "icacls":
      // 第一个非选项是模式/属主，其余是目标。
      return nonOptions.length > 1 ? nonOptions.slice(1) : undefined;
    case "ln":
    case "mklink":
      return nonOptions.length > 0 ? [nonOptions[nonOptions.length - 1]!] : undefined;
    case "sed":
      if (!args.some((arg) => arg === "-i" || arg.startsWith("-i") || arg === "--in-place" || arg.startsWith("--in-place"))) {
        return undefined;
      }
      // `-i` 后第一个非选项是脚本表达式，其余是文件。
      return nonOptions.length > 1 ? nonOptions.slice(1) : undefined;
    case "perl":
      if (!args.some((arg) => arg === "-i" || arg.startsWith("-i"))) return undefined;
      return nonOptions.length > 1 ? nonOptions.slice(1) : undefined;
    case "dd": {
      const of = args.find((arg) => arg.startsWith("of="));
      return of !== undefined ? [of.slice(3)] : undefined;
    }
    default:
      return undefined;
  }
}

function underForbiddenPrefix(rel: string, prefix: string): boolean {
  const r = rel.toLowerCase();
  const p = prefix.toLowerCase();
  return prefix.endsWith("/") ? r === p.slice(0, -1) || r.startsWith(p) : r === p;
}

/**
 * 判定一次 shell 调用的写目标安全性（确定性、同步）。
 * 顺序：显式写目标（deny 优先）→ 不透明执行 → pass。
 */
export function evaluateShellWriteTargets(input: ShellWriteGuardInput): ShellWriteGuardDecision {
  const argv = Array.isArray(input.argv) ? input.argv.map((arg) => String(arg)) : [];
  const targets = explicitWriteTargets(argv);
  if (targets !== undefined) {
    const resolvedTargets: string[] = [];
    for (const target of targets) {
      const resolved = resolveTarget(input.projectRoot, input.cwd, target);
      if ("error" in resolved) {
        return { kind: "deny", reason: `写目标越界：${resolved.error}`, targets: [target] };
      }
      const rel = resolved.rel;
      const forbidden = input.forbiddenPrefixes.find((prefix) => underForbiddenPrefix(rel, prefix));
      if (forbidden !== undefined) {
        return {
          kind: "deny",
          reason: `写目标命中禁写路径（${forbidden}）：${rel}——治理记录/他人写区只能由对应角色或应用写。`,
          targets: [rel],
        };
      }
      const decision = input.checkWrite(rel);
      if (decision.allowed !== true) {
        return {
          kind: "deny",
          reason:
            `写目标不在你的写边界内：${rel}（${decision.reason ?? "未匹配任何边界条目"}）。` +
            "请改写到自己的可写区，或交有权限的角色执行。",
          targets: [rel],
        };
      }
      resolvedTargets.push(rel);
    }
    if (resolvedTargets.length > 0) return { kind: "pass" };
  }
  const opaque = isOpaqueShellExecution(argv);
  if (opaque.opaque) {
    return {
      kind: "opaque",
      reason:
        `${opaque.reason ?? "该命令可执行任意代码或写任意文件"}。` +
        "无法按角色写区校验，必须由客户本人确认后执行（「替我审批」不得代批）。",
    };
  }
  return { kind: "pass" };
}
