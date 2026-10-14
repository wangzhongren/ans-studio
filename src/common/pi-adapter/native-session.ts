// Pi native selection only. Directory chain security stays in the injected public store callbacks.
import { constants, readFileSync } from "node:fs";
import { access, copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { RuntimeSessionStorage } from "../../model/runtime.ts";
import type { SessionManagerSelection } from "./real-adapter.ts";

/**
 * 检测会话文件里是否含**网关不认识的工具变更块**（`tool_removal` / `tool_addition`，`inline-tools-2026-09-15`
 * beta 语义）——只认**system 消息 content 里的字面块**（用户/助手正文里出现同样字符串**不算**，防误报）。
 *
 * **背景（2026-10-12 实测澄清，如实）**：当前 SDK 的 JSONL **存的不是字面块**——中途工具装载变化落的是
 * system 消息上的 `toolsAdded`/`toolsRemoved` **元数据**（本地探针确证），字面块是**每次请求**在
 * anthropic-messages.js:1027-1041 生成、**受模型 compat 两能力位门控**。故：收窄 compat（本文件
 * `buildExplicitRuntime`）后，**存量会话重发不会再生成该块**——存量污染自动失效、**无需清洗**。
 * 本检测器是**防御性**的（防万一的旧版/他源文件真的落了字面块）：发现即**跳过该文件**，全候选都被污染则
 * **新建会话并如实告知**（fail-closed；**不清洗、不改写历史文件**——改写历史风险高且当前无对象）。
 */
export function sessionFileHasForeignToolChangeBlocks(filePath: string): boolean {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return false; // 读不到 ⇒ 交由后续 open/list 的既有错误路径处理，这里不截胡
  }
  if (!text.includes('"tool_removal"') && !text.includes('"tool_addition"')) return false;
  for (const line of text.split("\n")) {
    if (!line.includes('"tool_removal"') && !line.includes('"tool_addition"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // 坏行不影响其余判定（与 SDK 的宽容解析一致）
    }
    const message = (entry as { message?: { role?: unknown; content?: unknown } }).message;
    if (message === undefined || message.role !== "system" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const type = (block as { type?: unknown } | null)?.type;
      if (type === "tool_removal" || type === "tool_addition") return true;
    }
  }
  return false;
}

/** SDK list tolerates malformed files, so count native files before choosing fresh/recovered. */
async function nativeFiles(directory: string): Promise<string[]> {
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const paths = names.filter((name) => name.endsWith(".jsonl")).map((name) => join(directory, name));
  for (const path of paths) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Pi 原生会话文件不是普通文件：${path}`);
  }
  return paths;
}

export async function selectNativeSessionManager(
  Manager: typeof SessionManager, cwd: string, storage: RuntimeSessionStorage,
): Promise<SessionManagerSelection> {
  if (storage.runtime !== "pi") throw new Error("Pi 不得读取其他 runtime 的原生存储");
  const directory = storage.nativeDirectory;
  await storage.validateNativeDirectory?.();
  const files = await nativeFiles(directory);
  // Only Pi's explicitly supplied old role directory can be a legacy input.
  const source = files.length === 0 && storage.legacyDirectory ? storage.legacyDirectory : directory;
  const sourceFiles = source === directory ? files : await nativeFiles(source);
  let skipped = 0;
  let failure = sourceFiles.length > 0 ? "Pi 原生历史无有效模型上下文，已重新建立会话。" : undefined;
  const prepare = async () => {
    if (storage.prepareNativeDirectory) await storage.prepareNativeDirectory();
    else await mkdir(directory, { recursive: true }); // Old injected storage doubles remain compatible.
    await access(directory, constants.W_OK);
  };
  const candidates = await Manager.list(cwd, source);
  for (const info of [...candidates].sort((a, b) => b.modified.getTime() - a.modified.getTime())) {
    if (resolve(dirname(info.path)) !== resolve(source) || !sourceFiles.includes(info.path)) {
      throw new Error("Pi SDK 返回了注入目录之外的会话路径");
    }
    if (sessionFileHasForeignToolChangeBlocks(info.path)) { skipped++; continue; }
    let path = info.path;
    await storage.validateNativeDirectory?.();
    if (source !== directory) {
      await prepare();
      path = join(directory, `legacy-${randomUUID()}-${basename(info.path)}`);
      // Keep the old file unchanged. SDK open/migration/appends operate only on native copy.
      await copyFile(info.path, path, constants.COPYFILE_EXCL);
    }
    try {
      const manager = Manager.open(path, directory, cwd);
      if (manager.getSessionId() !== info.id || manager.buildSessionContext().messages.length === 0) {
        failure = "Pi 历史文件没有可恢复的模型上下文，已重新建立会话。";
        continue;
      }
      return { manager, mode: "resumed", contextSource: "resumed", sessionFile: path,
        ...(skipped ? { skippedContaminated: skipped } : {}) };
    } catch {
      failure = "Pi 原生历史恢复失败，已重新建立会话。";
    }
  }
  await prepare();
  const manager = Manager.create(cwd, directory);
  if (skipped) failure = `检测到 ${skipped} 个会话文件含网关不认识的工具变更块，已跳过恢复并新建会话。`;
  return { manager, mode: "created", contextSource: failure ? "recovered" : "fresh",
    sessionFile: manager.getSessionFile(), ...(failure ? { note: failure } : {}),
    ...(skipped ? { skippedContaminated: skipped } : {}) };
}
