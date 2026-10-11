// 门禁引擎私有辅助：文件读取与根拼接

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsoluteAny, normalizeLexical } from "./paths.ts";

/** 将（可能为相对的）路径拼到某个根绝对路径上 */
export function joinRoot(baseAbs: string, p: string): string {
  if (isAbsoluteAny(p)) return normalizeLexical(p);
  const base = normalizeLexical(baseAbs);
  return normalizeLexical(base.replace(/\/$/, "") + "/" + p);
}

/** 读文本文件，去掉 UTF-8 BOM */
export async function readTextFile(absPath: string): Promise<string> {
  const text = await readFile(absPath, "utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 计算文件内容的 SHA-256，返回小写十六进制（供边界 pin 校验用）。
 * 对**原始字节**求哈希（不经 UTF-8 解码、不剥 BOM）——pin 生成与校验必须走同一算法，
 * 否则含 BOM/EOL 差异的文件会得到不一致的哈希。读取失败抛错，由调用方 fail-closed。
 */
export async function sha256File(absPath: string): Promise<string> {
  const bytes = await readFile(absPath);
  return createHash("sha256").update(bytes).digest("hex");
}
