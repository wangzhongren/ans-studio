// 跨角色共享路径原语（**单一来源**）。
//
// **属主：项目管理**（`src/common/shared/` 的唯一写入者）。**消费方：Pi适配器、门禁引擎**
// ——只读导入，**不得复制第二份实现**（工程法案 §一.5、`docs/architecture/shared-components.md`）。
//
// **来历（T23）**：本模块由设计 §3.11 裁决收敛。此前**同一套词法路径语义**被两处**各自维护**：
//   · 门禁引擎 `src/common/门禁引擎/paths.ts`（gate 据此判「目标是否在写根内」）；
//   · Pi适配器写入层 `src/common/pi-adapter/fs-write.ts`（写入前据此做**最后一道**纵深防御复核）。
// 二者**必须逐字同源**——否则「gate 认为在根内」与「写入层认为在根内」可能漂移，留下**误放行**空间
// （设计 §6 风险 2–3「写根与 gate 同源」）。故：**词法原语整体搬迁**到此（搬迁，非 fork），
// 两处旧本地副本由 T20（Pi适配器）/ T25（门禁引擎）改为从本模块导入并删除。
//
// **本层只做纯词法/真实路径解析，不做任何治理判定**——判定唯一由门禁引擎 `resolveWrite` 完成。
//
// 行文依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 行 5/6。

import { existsSync, realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";

/** 是否 Windows（大小写不敏感判定、比较键折叠在此处统一）。 */
export const IS_WINDOWS = process.platform === "win32";

/** 反斜杠统一为正斜杠。 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 是否为绝对路径（POSIX 前导斜杠、Windows 盘符或 UNC）。 */
export function isAbsoluteAny(p: string): boolean {
  const q = toPosix(p);
  if (q.startsWith("/")) return true;
  if (/^[a-zA-Z]:\//.test(q)) return true;
  return false;
}

/**
 * 词法规范化：解析 "." 与 ".."、折叠重复斜杠（不触碰文件系统）。
 * 绝对路径越过根的多余 ".." 被丢弃；相对路径开头的 ".." 保留。
 */
export function normalizeLexical(p: string): string {
  const q = toPosix(p);
  const driveMatch = /^([a-zA-Z]:)/.exec(q);
  const drive = driveMatch ? driveMatch[1] : "";
  const body = drive ? q.slice(drive.length) : q;
  const isAbs = body.startsWith("/");
  const segs = body.split("/");
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs && !drive) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  if (drive) return drive + "/" + joined;
  if (isAbs) return "/" + joined;
  return joined;
}

/** 比较键：Windows 大小写不敏感。 */
export function compareKey(p: string): string {
  const q = toPosix(p);
  return IS_WINDOWS ? q.toLowerCase() : q;
}

/** b 是否等于 base 或位于 base 之下（入参为根内相对路径）。 */
export function isUnderOrEqual(rel: string, base: string): boolean {
  const r = compareKey(rel);
  const b = compareKey(base);
  if (b === "") return true;
  if (r === b) return true;
  const prefix = b.endsWith("/") ? b : b + "/";
  return r.startsWith(prefix);
}

/** 绝对路径 abs 相对 base 的相对路径；不在 base 下返回 null。 */
export function absRel(abs: string, base: string): string | null {
  const normAbs = normalizeLexical(abs);
  const a = compareKey(normAbs);
  const b = compareKey(normalizeLexical(base));
  if (a === b) return "";
  const prefix = b.endsWith("/") ? b : b + "/";
  if (a.startsWith(prefix)) return normAbs.slice(prefix.length);
  return null;
}

/** targetReal 是否等于 rootReal 或位于其下（均为绝对真实路径）。 */
export function isWithinReal(rootReal: string, targetReal: string): boolean {
  return absRel(targetReal, rootReal) !== null;
}

/**
 * 真实路径解析（同步）：对存在的最深祖先做 realpath（解析符号链接/junction），
 * 不存在的那段按词法拼回。用于判断目标是否逃逸出受治理根。
 *
 * 原语选择：**优先 `realpathSync.native`**（Windows 走 GetFinalPathNameByHandle，规范化大小写），
 * 失败回退 JS 版 `realpathSync`。此即门禁引擎原语义，逐字搬迁。
 */
export function realResolve(absPath: string): string {
  const norm = normalizeLexical(absPath);
  let current = norm;
  const tail: string[] = [];
  for (let guard = 0; guard < 4096; guard++) {
    if (existsSync(current)) {
      let real: string;
      try {
        real = realpathSync.native(current);
      } catch {
        real = realpathSync(current);
      }
      if (tail.length === 0) return normalizeLexical(real);
      return normalizeLexical(toPosix(real) + "/" + tail.slice().reverse().join("/"));
    }
    const q = toPosix(current);
    if (/^[a-zA-Z]:\/$/.test(q) || q === "/" || q === "") return norm;
    const idx = q.lastIndexOf("/");
    if (idx <= 0) return norm;
    tail.push(q.slice(idx + 1));
    current = q.slice(0, idx);
  }
  return norm;
}

/**
 * 真实路径解析（异步）：算法与 {@link realResolve} **逐字相同**，仅 realpath 原语为 async 版。
 * 此即 Pi适配器写入层原语义，逐字搬迁。
 *
 * **与同步版的语义关系**（设计 §3.11：「realpath（sync/async）可各自实现但须复核一致」）：
 * 二者对同一输入给同一答案，由 `test/项目管理/shared/path-primitives.test.ts` 的
 * 「两处旧实现同答案」用例钉死（含大小写、符号链接/junction、不存在尾部）。
 */
export async function realResolveAsync(absPath: string): Promise<string> {
  const norm = normalizeLexical(absPath);
  let current = norm;
  const tail: string[] = [];
  for (let guard = 0; guard < 4096; guard++) {
    if (existsSync(current)) {
      let real: string;
      try {
        real = await realpath(current);
      } catch {
        real = normalizeLexical(current);
      }
      if (tail.length === 0) return normalizeLexical(real);
      return normalizeLexical(toPosix(real) + "/" + tail.slice().reverse().join("/"));
    }
    const q = toPosix(current);
    if (/^[a-zA-Z]:\/$/.test(q) || q === "/" || q === "") return norm;
    const idx = q.lastIndexOf("/");
    if (idx <= 0) return norm;
    tail.push(q.slice(idx + 1));
    current = q.slice(0, idx);
  }
  return norm;
}
