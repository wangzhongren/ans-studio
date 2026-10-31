// src/common/编排/routine-shell-policy.ts
// 宿主客户委托的「常规检查」窄政策（只由持有客户委托的宿主注入，不接受模型/派发工具自授）。
//
// 2026-10-31（shell 判拒升级方案 v1.3 §5.3）：形态判断改为复用门禁引擎的**唯一**确定性白名单谓词
// `matchRoutineShellCommand`——经 Service 公开出口 `src/service/gate/shell-rules.ts` 消费（同一函数引用，
// 跨角色不得导入门禁引擎私有 `common/`）。但委托策略**只接受原委托清单的三个 id**：
//   `npm-test`（`npm test`）、`npm-run-typecheck`（`npm run typecheck`）、`node-test`（受限路径）。
// **不继承** 2026-10-31 白名单新增形态（`npm ci` / `tsc --noEmit` / `npm run test|lint|check`）——
// 那些形态由 (c) 分类器对**所有角色**确定性放行（不经委托），委托面不扩大（方案 §5.3 末条）。
//
// `node --test` 的**路径**校验仍在本文件内完成（谓词只管 argv 形状）：项目根/cwd 相等、每个 path 经
// 既有 realpath/越界/后缀/元字符校验——外指符号链接不获委托。
import path from "node:path";
import { absRel, isAbsoluteAny, realResolve, toPosix } from "../shared/path-primitives.ts";
import { matchRoutineShellCommand } from "../../service/gate/shell-rules.ts";

/** 只能由持有客户委托的宿主注入，不接受模型或派发工具自授。 */
export interface RoutineShellPolicy {
  enabled: true;
  projectRoot: string;
  authorizationSource: "customer-delegated-routine-checks";
}

/** 委托策略只接受的三个 id（方案 §5.3/§5.4：新增白名单形态不自动继承给委托）；id 为冻结契约。 */
const DELEGATED_ROUTINE_IDS: ReadonlySet<string> = new Set(["npm-test", "npm-run-typecheck", "node-test"]);

/** 窄匹配常规检查；仍须 c 非硬拒且 b 明确 allow，不能据此直接执行。 */
export function matchesDelegatedRoutineCheck(
  argv: readonly string[], cwd: string, policy?: RoutineShellPolicy,
): boolean {
  if (policy?.enabled !== true || policy.authorizationSource !== "customer-delegated-routine-checks"
    || !isAbsoluteAny(policy.projectRoot) || !isAbsoluteAny(cwd)) return false;
  if (path.resolve(cwd) !== path.resolve(policy.projectRoot)) return false;
  // 谓词签名是 `string[]`（readonly 数组需复制）；形态判定只有门禁引擎这一份实现。
  const args = [...argv];
  const routine = matchRoutineShellCommand(args);
  if (routine === undefined || !DELEGATED_ROUTINE_IDS.has(routine.id)) return false;
  if (routine.id !== "node-test") return true; // `npm test` / `npm run typecheck`：谓词已精确匹配。
  // `node --test <paths...>`：谓词只管形状；每个 path 仍做既有 realpath/越界/后缀校验。
  try {
    const root = realResolve(path.resolve(policy.projectRoot));
    return args.slice(2).every((arg) => {
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
