// src/service/version-change/impl/project-hash-port.ts
// `ProjectHashPort` 的生产实现（S2）：应用计算文件/内容/记录哈希，发起者不自报。
//
// 算法（S2 文档化）：
// · `sha256File`：项目相对路径当刻字节的 SHA-256（文件不存在 ⇒ undefined）；
// · `sha256Content`：最终内容字节（string 按 UTF-8；Uint8Array 原样）的 SHA-256；
// · `sha256Record`：申请记录的 **canonical JSON**（对象键递归排序、`undefined` 丢弃、
//   排除 `applicationSha256` 自身）的 SHA-256——与对象构造顺序/空白无关，跨版本可复算。

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { VersionChangeRecord } from "../../../model/version-change.ts";
import type { ProjectHashPort } from "../abstract/version-change-service.ts";
import { normalizeServiceRelPath } from "./targets-items.ts";

/** canonical JSON：对象键排序、数组保序、`undefined` 丢弃。 */
export function canonicalRecordJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalRecordJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalRecordJson(record[key])}`).join(",")}}`;
}

export function createProjectHashPort(projectRoot: string): ProjectHashPort {
  const root = path.resolve(projectRoot);
  return {
    async sha256File(relPath) {
      const rel = normalizeServiceRelPath(relPath);
      if (rel === undefined) return undefined;
      try {
        const bytes = await readFile(path.join(root, rel));
        return createHash("sha256").update(bytes).digest("hex");
      } catch {
        return undefined;
      }
    },

    sha256Content(content) {
      const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
      return createHash("sha256").update(bytes).digest("hex");
    },

    sha256Record(record: VersionChangeRecord) {
      const { applicationSha256: _ignored, ...rest } = record;
      return createHash("sha256").update(canonicalRecordJson(rest)).digest("hex");
    },
  };
}
