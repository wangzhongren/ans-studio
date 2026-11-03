// src/common/shared/jsonl-ledger.ts
// 项目管理（2026-11-03，customer-authorization-plane A2）：共享 JSONL 账本辅助。
//
// 用途：把「追加一行 / 按大小轮转 / 旧→新读取 / 坏行与忽略行计数」收敛为**单一实现**。
// 消费方：编排 `src/common/编排/task-state.ts`（B1 同变更迁移，行为逐字不变）与
// `src/provider/directive/`（B1 指令账本）；两者**只读导入**，不得复制第二份轮转/原子追加实现。
//
// 契约（A2 冻结；变更须回项目管理重跑证据）：
//   · 纯 Node（仅 `node:fs` / `node:path`）；不依赖 Model/运行层/诊断，不读 env，
//     不硬编码 `.ans` 路径；**渲染侧不得导入**（含 Node API）。
//   · 追加：先递归建目录；「当前大小 + 本次行字节数 > maxBytes」在追加前轮转；
//     `appendFile` UTF-8 `flag:"a"`；按**绝对路径**维护进程内串行 Promise 链
//     （同文件不交错，不同账本互不阻塞；链尾清理）；写失败**不抛**，返回结构化结果。
//   · 轮转：`.N` 最旧、`.1` 最新；`i=N..1` 依次 rename——`i=1` 当前→`.1`，
//     `i>1` `.i-1`→`.i`；`ENOENT` 容忍；`unlink(file.N+1)` 仅作越界份防御性清理。
//   · 读取：`.N`→…→`.1`→当前（旧→新）；跳过空行；坏 JSON / parser 拒绝 ⇒
//     `errors + badLines++`；parser 返回 `ignore` ⇒ `ignoredLines++`；
//     文件级读失败（非 ENOENT）⇒ `errors`（`line=0`）后继续；`ENOENT` 跳过；
//     `files` 为参与读取的段名（当前文件恒在列，轮转段仅存在者入列）。
//   · limits：`maxBytes` / `rotations` 由调用方传入；env 解析留在消费方。

import { promises as fs } from "node:fs";
import path from "node:path";

/** 默认单文件上限：5 MiB（与 `task-state.ts` 现状一致）。 */
export const DEFAULT_JSONL_MAX_BYTES = 5 * 1024 * 1024;
/** 默认保留轮转份数：3（与 `task-state.ts` 现状一致）。 */
export const DEFAULT_JSONL_ROTATIONS = 3;

export interface JsonlLedgerLimits {
  /** 单文件字节上限；未提供/非法时用 `DEFAULT_JSONL_MAX_BYTES`。 */
  maxBytes?: number;
  /** 保留的轮转份数；未提供/非法时用 `DEFAULT_JSONL_ROTATIONS`。 */
  rotations?: number;
}

export type JsonlAppendResult =
  | { ok: true; path: string }
  | { ok: false; message: string; code?: string; cause?: unknown };

export type JsonlParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }
  | { ok: "ignore" };

export interface JsonlReadError {
  /** 来源文件（basename）。 */
  file: string;
  /** 1 起行号；文件级读失败为 0。 */
  line: number;
  message: string;
}

export interface JsonlReadResult<T> {
  /** 参与读取的段名（basename，旧→新；当前文件恒在列）。 */
  files: string[];
  values: T[];
  errors: JsonlReadError[];
  /** 坏 JSON + parser 拒绝的行数（文件级读失败不计入）。 */
  badLines: number;
  /** parser 返回 `ignore` 的行数。 */
  ignoredLines: number;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function resolveLimits(limits?: JsonlLedgerLimits): { maxBytes: number; rotations: number } {
  return {
    maxBytes: positiveInt(limits?.maxBytes, DEFAULT_JSONL_MAX_BYTES),
    rotations: positiveInt(limits?.rotations, DEFAULT_JSONL_ROTATIONS),
  };
}

/**
 * 候选段文件（绝对路径，旧→新）：`.N` … `.1` → 当前。
 * 仅计算命名，不检查存在性；读取方按存在性纳入。
 */
export function jsonlSegmentFiles(file: string, rotations: number = DEFAULT_JSONL_ROTATIONS): string[] {
  const canonical = path.resolve(file);
  const count = positiveInt(rotations, DEFAULT_JSONL_ROTATIONS);
  const segments: string[] = [];
  for (let i = count; i >= 1; i -= 1) segments.push(`${canonical}.${i}`);
  segments.push(canonical);
  return segments;
}

async function rotateIfNeeded(file: string, incomingBytes: number, maxBytes: number, rotations: number): Promise<void> {
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (size + incomingBytes <= maxBytes) return;
  // `.N` 最旧、`.1` 最新：i=1 当前→.1；i>1 `.i-1`→`.i`（后移覆盖旧 `.N`）。
  for (let i = rotations; i >= 1; i -= 1) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      await fs.rename(from, to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  // 越界份防御性清理：正常轮转不产生 `.N+1`，仅清历史遗留。
  try {
    await fs.unlink(`${file}.${rotations + 1}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** 每文件追加串行链（键 = 绝对路径；同进程内不交错）。 */
const appendChains = new Map<string, Promise<unknown>>();

/**
 * 追加一行 JSONL。`jsonText` 必须已经是单行 JSON 文本（不含裸 `\r`/`\n`）。
 * 写失败不抛：返回 `{ok:false,message,code?,cause?}`，由消费方决定诊断/回执。
 */
export function appendJsonlLine(
  file: string,
  jsonText: string,
  limits?: JsonlLedgerLimits,
): Promise<JsonlAppendResult> {
  if (typeof jsonText !== "string") {
    return Promise.resolve({ ok: false, code: "invalid", message: "jsonText 必须是字符串" });
  }
  if (jsonText.includes("\n") || jsonText.includes("\r")) {
    return Promise.resolve({ ok: false, code: "multiline", message: "jsonText 不能包含裸换行（multiline）" });
  }
  const canonical = path.resolve(file);
  const line = `${jsonText}\n`;
  const incomingBytes = Buffer.byteLength(line, "utf8");
  const { maxBytes, rotations } = resolveLimits(limits);
  const previous = appendChains.get(canonical) ?? Promise.resolve();
  const next = previous.then(async (): Promise<JsonlAppendResult> => {
    try {
      await fs.mkdir(path.dirname(canonical), { recursive: true });
      await rotateIfNeeded(canonical, incomingBytes, maxBytes, rotations);
      await fs.appendFile(canonical, line, { encoding: "utf8", flag: "a" });
      return { ok: true, path: canonical };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        ...(typeof code === "string" ? { code } : {}),
        cause: err,
      };
    }
  });
  const settled = next.then(() => undefined, () => undefined);
  appendChains.set(canonical, settled);
  void settled.finally(() => {
    if (appendChains.get(canonical) === settled) appendChains.delete(canonical);
  });
  return next;
}

/**
 * 旧→新读取 JSONL 账本：`.N` … `.1` → 当前。
 * `parse` 收到**原始行文本**（helper 已先行 `JSON.parse` 判断坏 JSON）；
 * 返回 `ignore` 表示该行是「不认识的合法事件」——计数但不报错。
 */
export async function readJsonlLedger<T>(
  file: string,
  parse: (raw: string) => JsonlParseResult<T>,
  limits?: JsonlLedgerLimits,
): Promise<JsonlReadResult<T>> {
  const canonical = path.resolve(file);
  const { rotations } = resolveLimits(limits);
  const candidates = jsonlSegmentFiles(canonical, rotations);
  const files: string[] = [];
  const values: T[] = [];
  const errors: JsonlReadError[] = [];
  let badLines = 0;
  let ignoredLines = 0;

  for (const source of candidates) {
    const isCurrent = source === canonical;
    if (!isCurrent) {
      try {
        await fs.access(source);
      } catch {
        continue;
      }
    }
    files.push(path.basename(source));
    let raw: string;
    try {
      raw = await fs.readFile(source, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      errors.push({ file: path.basename(source), line: 0, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.trim() === "") return;
      try {
        JSON.parse(line);
      } catch (err) {
        badLines += 1;
        errors.push({
          file: path.basename(source),
          line: index + 1,
          message: `JSON 坏行：${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }
      const parsed = parse(line);
      if (parsed.ok === true) {
        values.push(parsed.value);
        return;
      }
      if (parsed.ok === "ignore") {
        ignoredLines += 1;
        return;
      }
      badLines += 1;
      errors.push({ file: path.basename(source), line: index + 1, message: parsed.message });
    });
  }

  return { files, values, errors, badLines, ignoredLines };
}
