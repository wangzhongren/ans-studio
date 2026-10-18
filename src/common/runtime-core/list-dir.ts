// 普通角色只读目录列举（`list_dir` 工具）。Owner: 运行时核心。
//
// 真机噪声修复：角色没有列目录能力时只能反复猜文件名（read_file 的 ENOENT/EISDIR 噪声）。
// 本模块给**普通受治理工具集**提供只读列举——口径与 judge 的 `judge_list_dir` 同源（一层、目录带 `/`、
// 最多 200 项、敏感项不列名、项目根 + realpath 防逃逸），但**独立于 judge 预算/统计**：
// 普通角色列举不是判断会话，不占 8 次/192KB 的 judge 预算。
//
// 硬策略：路径必须解析到项目根内（realpath + 前缀比较，win32 大小写不敏感）；`..` 段、NUL、
// win32 盘符相对/ADS 一律拒绝；目录项里的 `.env*`、密钥/证书、凭据/令牌、`.git/`、`docs/audit/`、
// `.ans/**` 等敏感名**不列出**（不泄露存在性）。只读、不写盘、不执行。

import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { sensitiveClass, SHELL_JUDGE_MAX_LIST_ENTRIES } from "./shell-judge/policy.ts";

/** 失败原因码（工具层据此给人话；**不回显绝对路径**）。 */
export type ProjectListCode =
  | "invalid-path"
  | "outside-root"
  | "sensitive"
  | "not-found"
  | "not-a-directory"
  | "read-failed";

export type ProjectListResolution =
  | { ok: true; rel: string; entries: string[]; truncated: boolean }
  | { ok: false; code: ProjectListCode; pathClass?: string };

export interface ProjectListInput {
  /** 项目根（读取根）——列举与越界判定基准。 */
  projectRoot: string;
  /** 项目相对路径或项目根内的绝对路径；缺省/空串＝项目根。 */
  path?: string | undefined;
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

function segmentsOf(value: string): string[] {
  return value.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

function compareRoot(real: string, rootReal: string): boolean {
  const left = process.platform === "win32" ? real.toLowerCase() : real;
  const right = process.platform === "win32" ? rootReal.toLowerCase() : rootReal;
  const rel = relative(right, left);
  return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

/** 原始路径拒绝集（与 judge 策略同口径：空串由调用方归一为根；NUL/`..`/win32 裸冒号拒绝）。 */
function checkRawPath(raw: string): ProjectListCode | undefined {
  if (raw.includes("\u0000")) return "invalid-path";
  if (raw.replaceAll("\\", "/").split("/").some((segment) => segment === "..")) return "outside-root";
  if (process.platform === "win32") {
    const driveAbsolute = /^[A-Za-z]:[\\/]/.test(raw);
    const rest = driveAbsolute ? raw.slice(2) : raw;
    // 盘符相对（`C:foo`）、ADS（`file.txt:stream`）均含裸冒号 → 非法。
    if (rest.includes(":")) return "invalid-path";
    if (!driveAbsolute && /^[A-Za-z]:/.test(raw)) return "invalid-path";
  }
  return undefined;
}

/**
 * 列举项目内的一个目录（只列一层；目录名以 `/` 结尾；敏感项不列名；最多 200 项）。
 * 路径不存在/不可访问 ⇒ `not-found`；目标是文件 ⇒ `not-a-directory`（提示改用 read_file）。
 */
export async function resolveProjectList(input: ProjectListInput): Promise<ProjectListResolution> {
  const rawPath = input.path === undefined || input.path.trim() === "" ? "." : input.path;
  const rawProblem = checkRawPath(rawPath);
  if (rawProblem !== undefined) return { ok: false, code: rawProblem, pathClass: rawProblem === "outside-root" ? "outside-root" : "unknown" };

  const requested = isAbsolute(rawPath) ? rawPath : resolve(input.projectRoot, rawPath);

  let rootReal: string;
  let real: string;
  try {
    rootReal = await realpath(input.projectRoot);
    real = await realpath(requested);
  } catch {
    return { ok: false, code: "not-found", pathClass: "unknown" };
  }
  if (!compareRoot(real, rootReal)) return { ok: false, code: "outside-root", pathClass: "outside-root" };

  const rel = relative(rootReal, real);
  const relSegments = segmentsOf(rel);
  // 目标目录本身是敏感/应用私有目录（`.git`、`.ans`、`docs/audit` 等）⇒ 不列举。
  const targetSensitive = rel === "" ? undefined : sensitiveClass(relSegments);
  if (targetSensitive !== undefined) return { ok: false, code: "sensitive", pathClass: targetSensitive };

  let info;
  try {
    info = await lstat(real);
  } catch {
    return { ok: false, code: "not-found", pathClass: "unknown" };
  }
  if (!info.isDirectory()) return { ok: false, code: "not-a-directory", pathClass: "non-regular" };

  let names: string[];
  try {
    names = (await readdir(real)).filter((name) => sensitiveClass([...relSegments, name]) === undefined).sort((a, b) => a.localeCompare(b));
  } catch {
    return { ok: false, code: "read-failed", pathClass: "unknown" };
  }

  const truncated = names.length > SHELL_JUDGE_MAX_LIST_ENTRIES;
  const visible = names.slice(0, SHELL_JUDGE_MAX_LIST_ENTRIES);
  const entries: string[] = [];
  for (const name of visible) {
    let isDirectory = false;
    try {
      isDirectory = (await lstat(resolve(real, name))).isDirectory();
    } catch {
      // 竞态/坏链接：不猜测，按普通名列出（读取时仍会被常规工具/策略处理）。
    }
    entries.push(isDirectory ? `${name}/` : name);
  }

  return { ok: true, rel: rel === "" ? "." : slashPath(rel), entries, truncated };
}
