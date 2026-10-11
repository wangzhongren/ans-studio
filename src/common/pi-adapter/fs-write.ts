// 落盘私有辅助：写根词法校验、真实路径（符号链接/junction）复核、原子写。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
//
// 本模块**不做治理判定**——判定唯一由注入的 gate（绑定 resolveWrite）完成。这里只承担
// 设计 §6 交给写入层的两件事：
//   1. TOCTOU 与符号链接/junction 逃逸：写入前**紧邻处**再解析一次真实路径，复核仍在 writeRoot 内；
//   2. 原子写：同目录临时文件 + rename，避免半写。
//
// ✅ 语义同源（T20）：词法路径原语 normalizeLexical / compareKey / absRel / realResolveAsync 等
//    已**整体搬迁**至跨角色共享模块 `src/common/shared/path-primitives.ts`（T23，属主：项目管理），
//    本层改为**只读导入**（工程法案 §一.5「不得复制第二份」）。这消除了旧「门禁引擎 ↔ 写入层」
//    两套各自维护的镜像，保证「gate 认为在根内」与「写入层认为在根内」**逐字同源**（设计 §6.2）。
//    `checkRelativePathSafe` 是**写层专有**的名称安全校验（门禁无对应物），**保留**在本文件。

import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";

// —— 跨角色共享路径原语（**单一来源**，属主：项目管理）——
// 词法规范化与真实路径解析**整体搬迁**至 `src/common/shared/path-primitives.ts`（T23）；本层只读导入。
// 安全要害：`absRel`/`isWithinReal`/`realResolveAsync` 必须与门禁引擎**同一份**，否则「gate 认为在根内」
// 与「写入层认为在根内」可能漂移（设计 §6 风险 2–3）。
import { IS_WINDOWS, toPosix, absRel, isWithinReal, realResolveAsync } from "../../common/shared/path-primitives.ts";

// —— 向后兼容再导出（供 `test/项目管理/shared/` 收敛窗口期的「两处旧实现同答案」用例；非第二份实现）——
// 旧名 `absRelLexical` 现直接指向共享 `absRel`；`isWithinReal` / `realResolveAsync` 同名转出。
// 本层内部一律用共享名（见 guardWriteTarget / recheckParentInsideWriteRoot）。
export { absRel as absRelLexical };
export { isWithinReal, realResolveAsync };

/** Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9），含带扩展名形态。 */
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 相对写根路径的安全校验（设计 §6.4）。
 * Windows：拒绝 `:`（含 NTFS 备用数据流 `::$DATA`）、`<>"|?*`、控制字符、结尾点/空格（会被静默剥离）、
 * 保留设备名。POSIX 仅拒绝空段与 `.`/`..`。
 */
export function checkRelativePathSafe(rel: string): { ok: true } | { ok: false; reason: string } {
  const segments = toPosix(rel).split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return { ok: false, reason: "相对写根路径为空" };
  for (const seg of segments) {
    if (seg === "." || seg === "..") return { ok: false, reason: `非法路径段：${seg}` };
    if (IS_WINDOWS) {
      if (/[:<>"|?*]/.test(seg)) return { ok: false, reason: `Windows 非法字符（含 ADS/备用数据流）：${seg}` };
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f]/.test(seg)) return { ok: false, reason: `路径段含控制字符：${seg}` };
      if (/[ .]$/.test(seg)) return { ok: false, reason: `路径段以点或空格结尾（Windows 会静默剥离）：${seg}` };
      const stem = seg.split(".")[0];
      if (RESERVED_DEVICE.test(seg) || RESERVED_DEVICE.test(stem)) {
        return { ok: false, reason: `路径段为保留设备名：${seg}` };
      }
    }
  }
  return { ok: true };
}

export interface GuardedTarget {
  /** 词法绝对路径（与传给 gate 的 abs 同一个值）。 */
  abs: string;
  /** abs 相对 writeRoot 的词法相对路径。 */
  rel: string;
  /** 目标父目录（词法绝对），供 mkdir 使用。 */
  parentAbs: string;
}

/**
 * 写入前的守卫（在 gate 判定为 allowed 之后调用，仍是**任何文件系统副作用之前**，只做只读解析）：
 *   1. 词法：abs 必须在 writeRoot 之内；
 *   2. 名称安全（Windows 保留名/尾点空格/ADS 等）；
 *   3. 真实路径复核：存在祖先经 realpath 后仍必须落在 writeRoot 的真实路径之内（挡符号链接/junction 逃逸）；
 *   4. 若目标本身已是符号链接 → 拒绝（绝不写到链接指向的别处，也不静默替换链接）。
 * 任一条不满足 → 拒绝且**未创建任何文件/目录**。
 */
export async function guardWriteTarget(
  abs: string,
  writeRoot: string,
): Promise<{ ok: true; target: GuardedTarget } | { ok: false; reason: string }> {
  const rel = absRel(abs, writeRoot);
  if (rel === null) {
    return { ok: false, reason: `目标词法上不在写根（writeRoot）之内：${abs}` };
  }
  const safe = checkRelativePathSafe(rel);
  if (!safe.ok) return safe;

  const realRoot = await realResolveAsync(writeRoot);
  const realTarget = await realResolveAsync(abs);
  if (!isWithinReal(realRoot, realTarget)) {
    return {
      ok: false,
      reason: `目标经真实路径解析（符号链接/junction）逃逸出写根：${realTarget}`,
    };
  }

  // 目标本身若已是符号链接/junction，拒绝——避免写到链接指向的别处或静默替换链接。
  const existing = await lstat(abs).catch(() => null);
  if (existing !== null && existing.isSymbolicLink()) {
    return { ok: false, reason: `目标为符号链接，拒绝写入以免写到链接之外：${abs}` };
  }

  return { ok: true, target: { abs, rel, parentAbs: dirname(abs) } };
}

/**
 * mkdir 之后的二次复核（弥补判定与写入之间的时间窗）：再解析一次真实父目录，
 * 确认仍在 writeRoot 内。不满足 → 拒绝（不执行写入）。这是设计 §6.1 要求的「紧邻写入前再解析」。
 */
export async function recheckParentInsideWriteRoot(
  writeRoot: string,
  parentAbs: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const realRoot = await realResolveAsync(writeRoot);
  const realParent = await realResolveAsync(parentAbs);
  if (!isWithinReal(realRoot, realParent)) {
    return { ok: false, reason: `写入前复核：真实父目录逃逸出写根：${realParent}` };
  }
  return { ok: true };
}

/** 建立父目录（仅在 allowed 且通过守卫之后调用）。 */
export async function ensureParentDir(parentAbs: string): Promise<void> {
  await mkdir(parentAbs, { recursive: true });
}

/**
 * 原子写：在**同一目录**内建临时文件 → 写入并 fsync → rename 覆盖目标。
 * rename 在同目录内是原子替换（Windows 亦替换已存在文件）。失败时清理临时文件。
 */
export async function atomicWriteFile(abs: string, data: Buffer): Promise<void> {
  const parent = dirname(abs);
  const tmp = resolve(parent, `.ans-write-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, abs);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** 把工具参数里的目标路径解析为绝对路径（写根基准）——纯词法，不碰文件系统。 */
export function resolveWriteAbs(path: string, writeRoot: string): string {
  return isAbsolute(path) ? path : resolve(writeRoot, path);
}
