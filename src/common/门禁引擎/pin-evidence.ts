// 门禁引擎私有：只读 pin 证据检查（治理记录 pin 不符的重新接受恢复）。
//
// 冻结契约：角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md §5.1。
// 公共出口恒为 `src/service/boundary/resolve-boundary.ts` 的**同一函数引用**再导出；跨角色不得直接
// 导入本文件（§6：不导入其他角色私有 `common/`）。
//
// 判定口径（§5.1 逐条钉死）：
//  1. 形状：`pins` 非空数组；每项 `path` 非空字符串、`sha256` 为 64 位十六进制（大小写不敏感）；
//     否则 `invalid`，reason 说明第几项。
//  2. 路径安全：`path` 不得为绝对路径；`joinRoot(projectRoot, path)` 规范化后必须仍在项目根内；
//     逃逸 → `invalid`。
//  3. 覆盖：给出 `requiredPath` 时，必须存在一条 pin 规范化后指向同一路径；否则 `invalid`。
//  4. 逐文件：ENOENT → `missing`；stat 其它错误 / 非普通文件 / 读失败 → `unreadable`；
//     哈希小写不等于 pin（小写）→ `modified`；相等 → 一致（不进入 `files`）。
//  5. 整体：无非一致项 → `ok`，否则 `mismatch`。
//  6. digest：对**全部 pin（按原顺序）**拼接
//     `path + "\t" + pinned + "\t" + (status ?? "ok") + "\t" + (actual ?? "") + "\n"` 求 SHA-256。
//  7. 只读：不写盘、不建目录、不缓存、不改变 pin 顺序；每个目标至多一次哈希。
//  8. 唯一哈希来源：复用 `io.ts::sha256File`，不另写第二份文件哈希。

import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

import type { PinEntry, PinEvidenceFile, PinEvidenceFileStatus, PinEvidenceResult } from "../../model/boundary.ts";
import { joinRoot, sha256File } from "./io.ts";
import { absRel, compareKey, isAbsoluteAny, normalizeLexical } from "./paths.ts";

const SHA256_HEX_64 = /^[0-9a-fA-F]{64}$/;

function invalid(reason: string): PinEvidenceResult {
  return { state: "invalid", checked: 0, files: [], digest: "", reason };
}

/** 形状校验；非法返回错误说明（含第几项），合法返回 null。 */
function shapeError(pins: unknown): string | null {
  if (!Array.isArray(pins)) return "pins 必须是数组";
  if (pins.length === 0) return "pins 为空数组（至少需要一条 pin）";
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i] as Partial<PinEntry> | null | undefined;
    if (typeof p !== "object" || p === null) return `pin[${i}] 不是对象`;
    if (typeof p.path !== "string" || p.path.trim() === "") return `pin[${i}] 的 path 必须是非空字符串`;
    if (typeof p.sha256 !== "string" || !SHA256_HEX_64.test(p.sha256.trim())) {
      return `pin[${i}] 的 sha256 不是 64 位十六进制`;
    }
  }
  return null;
}

/**
 * 只读检查 `.ans` 记录的 pin 与盘上文件是否一致。
 *
 * - 形状非法 / 路径逃逸 / `requiredPath` 未被覆盖 → `state:"invalid"`（`checked:0`、`digest:""`）；
 * - 否则逐条 pin 至多一次 `stat`、至多一次 `sha256File`，只把非一致项按 pin 顺序放进 `files`；
 * - `digest` 覆盖全部 pin（含一致项），可作为预览快照在写入前重算比对（G4）。
 *
 * 本函数不写盘、不建目录、不缓存，也不改变 `pins` 顺序。
 */
export async function inspectPinnedBoundaries(input: {
  projectRoot: string;
  pins: PinEntry[];
  /** 治理边界项目相对路径；给出时必须被至少一条 pin 覆盖。 */
  requiredPath?: string;
}): Promise<PinEvidenceResult> {
  const { projectRoot, pins, requiredPath } = input;

  const shapeProblem = shapeError(pins);
  if (shapeProblem !== null) return invalid(shapeProblem);

  // 路径安全：绝对路径直接拒绝；规范化拼接后必须仍在项目根内（`..` 逃逸由 absRel 判空拦截）。
  const targets: { path: string; pinned: string; abs: string }[] = [];
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    if (isAbsoluteAny(pin.path)) return invalid(`pin[${i}] 的 path 不能是绝对路径：${pin.path}`);
    const abs = joinRoot(projectRoot, pin.path);
    if (absRel(abs, projectRoot) === null) return invalid(`pin[${i}] 的 path 逃逸出项目根：${pin.path}`);
    targets.push({ path: pin.path, pinned: pin.sha256.trim().toLowerCase(), abs });
  }

  // 覆盖：治理边界文件必须被至少一条 pin 覆盖（否则即使全部 pin 一致，su 仍不可用）。
  if (requiredPath !== undefined) {
    const requiredKey = compareKey(normalizeLexical(joinRoot(projectRoot, requiredPath)));
    const covered = targets.some((t) => compareKey(normalizeLexical(t.abs)) === requiredKey);
    if (!covered) return invalid(`治理边界文件未被任何 pin 覆盖：${requiredPath}`);
  }

  const files: PinEvidenceFile[] = [];
  const digestLines: string[] = [];

  for (const target of targets) {
    let status: PinEvidenceFileStatus | "ok" = "ok";
    let actual: string | null = null;

    try {
      const st = await stat(target.abs);
      if (!st.isFile()) {
        status = "unreadable";
      } else {
        try {
          const hash = (await sha256File(target.abs)).toLowerCase();
          actual = hash;
          if (hash !== target.pinned) status = "modified";
        } catch {
          // 读失败（权限、竞态删除等）与「不是普通文件」同归 unreadable。
          status = "unreadable";
          actual = null;
        }
      }
    } catch (err) {
      status = (err as NodeJS.ErrnoException)?.code === "ENOENT" ? "missing" : "unreadable";
      actual = null;
    }

    if (status !== "ok") {
      files.push({ path: target.path, pinned: target.pinned, actual, status });
    }
    digestLines.push(`${target.path}\t${target.pinned}\t${status}\t${actual ?? ""}\n`);
  }

  const digest = createHash("sha256").update(digestLines.join(""), "utf8").digest("hex");
  return {
    state: files.length === 0 ? "ok" : "mismatch",
    checked: targets.length,
    files,
    digest,
  };
}
