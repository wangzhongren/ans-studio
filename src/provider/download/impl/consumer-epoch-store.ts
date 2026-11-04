// src/provider/download/impl/consumer-epoch-store.ts
// 下载 Provider —— G8 A 项目级 epoch 文件（2026-11-04，download-requests B1；方案 §7.4）。
//
// `<projectRoot>/.ans/state/download-consumer.json`：首次 `ensure()` 以 `open("wx")` 创建并
// `fsync`；**不可读/非法 ⇒ unreadable 且不重写**。`read()` 只读（missing/ready/unreadable）。
// 文件是 app 私有运行数据，不是仓库候选、不是治理批准依据。

import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import {
  DOWNLOAD_CONSUMER_STATE_REL,
  DOWNLOAD_CONSUMER_STATE_VERSION,
  type DownloadConsumerEpochState,
  type DownloadConsumerEpochStore,
} from "../abstract/download-consumer-epoch.ts";

function statePath(projectRoot: string): string {
  return path.join(projectRoot, ...DOWNLOAD_CONSUMER_STATE_REL.split("/"));
}

function parseState(raw: string): DownloadConsumerEpochState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "unreadable", reason: "invalid-json" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { state: "unreadable", reason: "not-an-object" };
  }
  const record = parsed as Record<string, unknown>;
  if (record["version"] !== DOWNLOAD_CONSUMER_STATE_VERSION) {
    return { state: "unreadable", reason: "version-mismatch" };
  }
  const enabledAt = record["enabledAt"];
  const appVersion = record["appVersion"];
  if (typeof enabledAt !== "string" || Number.isNaN(Date.parse(enabledAt))) {
    return { state: "unreadable", reason: "enabledAt-invalid" };
  }
  if (typeof appVersion !== "string" || appVersion.trim() === "") {
    return { state: "unreadable", reason: "appVersion-invalid" };
  }
  return { state: "ready", enabledAt, appVersion };
}

export function downloadConsumerStatePath(projectRoot: string): string {
  return statePath(projectRoot);
}

/** 生产工厂：创建/读取 epoch；无测试缝（测试可注入假 store 到 Pipeline/CustomerDirectiveRuntime）。 */
export function createDownloadConsumerEpochStore(projectRoot: string): DownloadConsumerEpochStore {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("下载 epoch：projectRoot 必须是非空字符串");
  }
  const file = statePath(projectRoot);

  async function read(): Promise<DownloadConsumerEpochState> {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return { state: "missing" };
      return {
        state: "unreadable",
        reason: (error as NodeJS.ErrnoException | undefined)?.code ?? "read-failed",
      };
    }
    return parseState(raw);
  }

  return {
    read,
    async ensure(appVersion: string): Promise<DownloadConsumerEpochState> {
      const current = await read();
      if (current.state !== "missing") return current; // ready / unreadable（不重写）
      const version = typeof appVersion === "string" && appVersion.trim() !== "" ? appVersion.trim().slice(0, 64) : "unknown";
      const enabledAt = new Date().toISOString();
      const payload = `${JSON.stringify({
        version: DOWNLOAD_CONSUMER_STATE_VERSION,
        enabledAt,
        appVersion: version,
      })}\n`;
      try {
        await mkdir(path.dirname(file), { recursive: true });
      } catch (error) {
        return { state: "unreadable", reason: (error as NodeJS.ErrnoException | undefined)?.code ?? "mkdir-failed" };
      }
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(file, "wx", 0o600);
        await handle.writeFile(payload, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        return { state: "ready", enabledAt, appVersion: version };
      } catch (error) {
        if (handle !== undefined) {
          try {
            await handle.close();
          } catch {
            /* 清理尽力而为 */
          }
        }
        if ((error as NodeJS.ErrnoException | undefined)?.code === "EEXIST") {
          // 并发创建：回读既有文件；不可读则按 unreadable（不重写）。
          return read();
        }
        try {
          await unlink(file);
        } catch {
          /* 清理尽力而为 */
        }
        return { state: "unreadable", reason: (error as NodeJS.ErrnoException | undefined)?.code ?? "create-failed" };
      }
    },
  };
}
