// src/provider/download/impl/file-sink.ts
// 下载 Provider —— 文件 sink：占位/临时/原子 rename（2026-11-04，download-requests B1；方案 §6）。
//
// 只写 `<projectRoot>/download/`；单文件名（无目录段）；`open(final,"wx")` 占位防覆盖，
// 重名 ` (n)` 后缀；同目录 `<final>.<rand>.part`（wx 0600）流式写 + sha256 + fsync，
// 成功后 `renameReplacingExisting(temp, placeholder)`（共享原子写原语的 Windows EPERM 有界重试）。
// 失败/中止清理 temp 与占位；既有同名文件字节不变。目录/真实路径复核直接复用共享
// `path-primitives`（不导入运行时核心私有 common `fs-write.ts`）。

import { createHash } from "node:crypto";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

import { renameReplacingExisting } from "../../../common/shared/atomic-write.ts";
import {
  absRel,
  compareKey,
  isWithinReal,
  realResolveAsync,
} from "../../../common/shared/path-primitives.ts";
import { DownloadProviderError } from "../abstract/download-provider.ts";

const PLACEHOLDER_LIMIT = 10_000;

/** 仅测试装配的故障注入钩子（生产公共工厂不暴露；上层不得使用）。 */
export interface DownloadSinkHooks {
  /** 替换 rename（抛错模拟 rename 失败）。 */
  rename?: (from: string, to: string) => Promise<void>;
  /** 写入前钩子（抛错模拟写盘失败；收到本次 chunk）。 */
  beforeWrite?: (chunk: Buffer) => void | Promise<void>;
}

export interface DownloadSink {
  /** 实际最终文件名（含重名后缀）。 */
  readonly fileName: string;
  /** 项目相对路径 `download/<name>`。 */
  readonly pathRel: string;
  write(chunk: Buffer): Promise<void>;
  commit(): Promise<{ bytes: number; sha256: string }>;
  abort(): Promise<void>;
}

function writeError(error: unknown): DownloadProviderError {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return new DownloadProviderError(
    "download-write-failed",
    typeof code === "string" ? code : error instanceof Error ? error.message : "write failed",
  );
}

function assertSingleFileName(name: string): void {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\u0000") ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new DownloadProviderError("download-write-failed", "invalid filename");
  }
}

async function ensureDownloadDir(projectRoot: string): Promise<{ downloadDir: string; realRoot: string; realDownload: string }> {
  const downloadDir = path.join(projectRoot, "download");
  try {
    await mkdir(downloadDir, { recursive: true });
  } catch (error) {
    throw writeError(error);
  }
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(downloadDir);
  } catch (error) {
    throw writeError(error);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new DownloadProviderError("download-write-failed", "download-is-not-a-directory");
  }
  const realRoot = await realResolveAsync(projectRoot);
  const realDownload = await realResolveAsync(downloadDir);
  const expected = path.join(realRoot, "download");
  if (!isWithinReal(realRoot, realDownload) || compareKey(realDownload) !== compareKey(expected)) {
    throw new DownloadProviderError("download-write-failed", "download-dir-escape");
  }
  return { downloadDir, realRoot, realDownload };
}

function splitExtension(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || name.length - dot - 1 > 16) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension: name.slice(dot) };
}

async function createPlaceholder(
  downloadDir: string,
  baseName: string,
): Promise<{ full: string; fileName: string }> {
  const { stem, extension } = splitExtension(baseName);
  for (let index = 0; index < PLACEHOLDER_LIMIT; index += 1) {
    const fileName = index === 0 ? baseName : `${stem} (${index})${extension}`;
    const full = path.join(downloadDir, fileName);
    try {
      const handle = await open(full, "wx", 0o600);
      await handle.close();
      return { full, fileName };
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "EEXIST") continue;
      throw writeError(error);
    }
  }
  throw new DownloadProviderError("download-write-failed", "filename-exhausted");
}

async function recheckFinalTarget(full: string, projectRoot: string, realRoot: string, realDownload: string): Promise<void> {
  const rel = absRel(full, projectRoot);
  if (rel === null || !rel.replace(/\\/g, "/").startsWith("download/")) {
    throw new DownloadProviderError("download-write-failed", "target-outside-download");
  }
  const real = await realResolveAsync(full);
  if (!isWithinReal(realRoot, real) || compareKey(path.dirname(real)) !== compareKey(realDownload)) {
    throw new DownloadProviderError("download-write-failed", "target-realpath-escape");
  }
  try {
    const current = await lstat(full);
    if (current.isSymbolicLink() || !current.isFile()) {
      throw new DownloadProviderError("download-write-failed", "target-not-regular-file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return;
    if (error instanceof DownloadProviderError) throw error;
    throw writeError(error);
  }
}

/**
 * 创建 sink：先目录守卫 → 占位（wx，不覆盖）→ 同目录 `.part`（wx）。
 * 调用方必须 `commit()` 或 `abort()`；失败时 sink 自身尽力清理。
 */
export async function createDownloadSink(
  projectRoot: string,
  requestedFileName: string,
  hooks?: DownloadSinkHooks,
): Promise<DownloadSink> {
  assertSingleFileName(requestedFileName);
  const { downloadDir, realRoot, realDownload } = await ensureDownloadDir(projectRoot);
  const placeholder = await createPlaceholder(downloadDir, requestedFileName);
  await recheckFinalTarget(placeholder.full, projectRoot, realRoot, realDownload);
  const tempPath = path.join(
    downloadDir,
    `.${placeholder.fileName}.${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.part`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(tempPath, "wx", 0o600);
  } catch (error) {
    await unlink(placeholder.full).catch(() => undefined);
    throw writeError(error);
  }
  let closed = false;
  let finished = false;
  const hash = createHash("sha256");
  let bytes = 0;

  async function cleanup(): Promise<void> {
    if (!closed) {
      closed = true;
      try {
        await handle!.close();
      } catch {
        /* 清理尽力而为 */
      }
    }
    try {
      await unlink(tempPath);
    } catch {
      /* 清理尽力而为 */
    }
    try {
      await unlink(placeholder.full);
    } catch {
      /* 清理尽力而为 */
    }
  }

  return {
    fileName: placeholder.fileName,
    pathRel: `download/${placeholder.fileName}`,
    async write(chunk: Buffer): Promise<void> {
      if (finished) throw new DownloadProviderError("download-write-failed", "sink-finished");
      try {
        if (hooks?.beforeWrite !== undefined) await hooks.beforeWrite(chunk);
        await handle!.write(chunk);
      } catch (error) {
        throw writeError(error);
      }
      hash.update(chunk);
      bytes += chunk.length;
    },
    async commit(): Promise<{ bytes: number; sha256: string }> {
      if (finished) throw new DownloadProviderError("download-write-failed", "sink-finished");
      finished = true;
      try {
        await handle!.sync();
        await handle!.close();
        closed = true;
        if (hooks?.rename !== undefined) await hooks.rename(tempPath, placeholder.full);
        else await renameReplacingExisting(tempPath, placeholder.full);
      } catch (error) {
        await cleanup();
        throw writeError(error);
      }
      return { bytes, sha256: hash.digest("hex") };
    },
    async abort(): Promise<void> {
      if (finished) return;
      finished = true;
      await cleanup();
    },
  };
}
