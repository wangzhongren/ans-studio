// src/common/编排/write-journal.ts
// 2026-11-05（审计归因修复，处置回执 ANS-AUDIT-2026-11-05-001）：
// shell 执行后写审计是**时间窗 diff**，无法区分「shell 命令造成的写入」与「应用自身/并发会话的合法写入」。
// 本模块记录**经写门禁的工具写入**（write_file/edit_file 成功落盘时登记 路径+最终字节 sha256+时间），
// 供执行后审计对非应用运行态路径做归因：命中本日志 ⇒ 合法工具写入（不算越界）；未命中 ⇒ 越界（shell/
// 外部进程写入）。进程内、有界、只读消费；不写入磁盘、不写账本。
//
// 纪律：日志只作归因证据，**不改变**任何写权限；shell 重定向等绕过写工具路径的写入不会进日志，
// 仍会被执行后审计判为越界。应用运行态路径（`.ans/**`、`docs/bootstrap-manifest.md`）由审计侧按
// 「应用状态写入」记录（见 shell-post-audit），不进入本日志。

interface ToolWriteEntry {
  abs: string;
  sha256: string;
  at: number;
}

const MAX_ENTRIES = 1024;
const entries: ToolWriteEntry[] = [];

function normalize(abs: string): string {
  return abs.replace(/\\/g, "/");
}

/** 登记一次经写门禁的成功落盘（writeGuarded 原子写成功后调用）。 */
export function recordToolWrite(absPath: string, sha256: string, at: number = Date.now()): void {
  if (typeof absPath !== "string" || absPath.trim() === "" || typeof sha256 !== "string" || sha256.length === 0) return;
  entries.push({ abs: normalize(absPath), sha256: sha256.toLowerCase(), at });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

/** 该路径在 sinceMs 之后是否由工具写入过且内容一致（执行后审计归因）。 */
export function wasWrittenByTool(absPath: string, sha256: string, sinceMs: number): boolean {
  const abs = normalize(absPath);
  const sha = sha256.toLowerCase();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (entry.at < sinceMs) continue;
    if (entry.abs === abs && entry.sha256 === sha) return true;
  }
  return false;
}

/** 测试专用：清空进程内日志（不对外暴露到公开行为）。 */
export function __resetWriteJournalForTests(): void {
  entries.length = 0;
}
