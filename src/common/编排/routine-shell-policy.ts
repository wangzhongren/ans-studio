import path from "node:path";
import { absRel, isAbsoluteAny, realResolve, toPosix } from "../shared/path-primitives.ts";

/** 只能由持有客户委托的宿主注入，不接受模型或派发工具自授。 */
export interface RoutineShellPolicy {
  enabled: true;
  projectRoot: string;
  authorizationSource: "customer-delegated-routine-checks";
}

/** 窄匹配常规检查；仍须 c 非硬拒且 b 明确 allow，不能据此直接执行。 */
export function matchesDelegatedRoutineCheck(
  argv: readonly string[], cwd: string, policy?: RoutineShellPolicy,
): boolean {
  if (policy?.enabled !== true || policy.authorizationSource !== "customer-delegated-routine-checks"
    || !isAbsoluteAny(policy.projectRoot) || !isAbsoluteAny(cwd)) return false;
  if (path.resolve(cwd) !== path.resolve(policy.projectRoot)) return false;
  if (argv.length === 2 && argv[0] === "npm" && argv[1] === "test") return true;
  if (argv.length === 3 && argv[0] === "npm" && argv[1] === "run" && argv[2] === "typecheck") return true;
  if (argv[0] !== "node" || argv[1] !== "--test") return false;
  // 无附加 flag、环境包装或组合执行；默认测试发现限于项目 cwd。
  try {
    const root = realResolve(path.resolve(policy.projectRoot));
    return argv.slice(2).every((arg) => {
      if (arg === "" || arg.startsWith("-") || /[\s$`;&|<>\\]/.test(arg)) return false;
      if (toPosix(arg).split("/").includes("..")) return false;
      const abs = path.resolve(policy.projectRoot, arg);
      const rel = absRel(abs, path.resolve(policy.projectRoot));
      if (rel === null || !rel.startsWith("test/") || !/\.test\.(?:[cm]?[jt]s)$/.test(rel)) return false;
      // 最深存在祖先经共享 realpath 原语解析，外指符号链接不获委托。
      return absRel(realResolve(abs), root) !== null;
    });
  } catch { return false; }
}
