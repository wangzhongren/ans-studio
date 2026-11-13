// test/桌面应用/session-source.ts
// B0（2026-11-13，方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md §4.4）：
// app/desktop/session.ts 源码钉子的**聚合读取器**。
//
// 背景：14 个测试文件直接读取 app/desktop/session.ts 的源码文本，断言关键接线/顺序/计数。
// 重构（barrel + app/desktop/session/** 协作模块）后这些断言必须继续有效，因此统一经本读取器取源码：
//  - readSessionSource()：按固定顺序拼接 barrel 与未来模块文件；
//  - readSessionModule(name)：读取单个模块（方法边界/相邻顺序钉子用），模块不存在时回退到 B0 单文件内容。
//
// 固定拼接顺序（确定、与文件系统枚举顺序无关）：
//   1) app/desktop/session.ts（barrel，恒为第一段）；
//   2) app/desktop/session/ 下全部 .ts（递归），按「相对 app/desktop/session 的路径」以代码单元序
//      （a < b 的确定性比较，不用 localeCompare）升序排列；非 .ts 文件忽略。
//   各段之间以单个换行 "\n" 连接；模块目录不存在时仅返回 barrel 内容（B0：与单文件逐字节一致）。
//
// readSessionModule 解析规则：
//   候选 = app/desktop/session/<name>.ts（name 可含子路径，如 "delivery/queue"、"lifecycle/send"）。
//   存在则返回该文件；否则回退到 app/desktop/session.ts 的当前内容（B0 语义：单文件即全量源码）。
//   注意：barrel 切换（B7）后回退只应发生在「模块尚未迁出」的批次；钉子使用的模块名必须在
//   对应批次前已存在（当前 run-change / lifecycle/send / delivery/queue 均按目标架构命名，B0 走回退）。
//
// baseDir 参数仅为测试注入（如用临时目录构造未来目录结构以验证拼接顺序），生产调用不传。

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function collectSessionModuleFiles(moduleDir: string, prefix = ""): string[] {
  let entries;
  try {
    entries = readdirSync(moduleDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectSessionModuleFiles(path.join(moduleDir, entry.name), rel));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(rel);
    }
  }
  return files.sort(compareCodeUnits);
}

function existsFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** 按固定顺序拼接 barrel 与未来 session/ 下的模块源码（见文件头注释）。 */
export function readSessionSource(baseDir: string = REPO_ROOT): string {
  const barrelPath = path.join(baseDir, "app", "desktop", "session.ts");
  const moduleDir = path.join(baseDir, "app", "desktop", "session");
  const parts = [readFileSync(barrelPath, "utf8")];
  for (const rel of collectSessionModuleFiles(moduleDir)) {
    parts.push(readFileSync(path.join(moduleDir, ...rel.split("/")), "utf8"));
  }
  return parts.join("\n");
}

/** 读取单个模块；模块文件不存在时回退到 B0 单文件内容（见文件头注释）。 */
export function readSessionModule(name: string, baseDir: string = REPO_ROOT): string {
  const normalized = name.replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (normalized.length === 0 || segments.some((seg) => seg === "" || seg === "." || seg === "..")) {
    throw new Error(`readSessionModule: 非法模块名 ${JSON.stringify(name)}`);
  }
  const candidate = path.join(baseDir, "app", "desktop", "session", ...segments) + ".ts";
  if (existsFile(candidate)) return readFileSync(candidate, "utf8");
  return readFileSync(path.join(baseDir, "app", "desktop", "session.ts"), "utf8");
}
