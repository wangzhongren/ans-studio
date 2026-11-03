// src/provider/directive/impl/file-store.ts
// 客户指令账本 Provider —— 文件存储实现（2026-11-03，客户授权平面 B1）。
//
// 唯一实现复用：`src/common/shared/jsonl-ledger.ts`（A2 冻结）负责追加串行链、按大小轮转、
// 旧→新读取、坏行/文件级错误计数。本文件只做：
//   · 路径计算（相对路径常量来自 A1 `CUSTOMER_DIRECTIVES_REL`，不写字面量）；
//   · `append` 失败 → reject（Service 映射 `ledger-write-failed`）；
//   · `replay` 返回原始行 + 错误计数 + 段名（解析/业务校验在 Service，不在 Provider）。
//
// **渲染侧不得导入本文件**（含 Node API；B1 不写 app/**）。

import path from "node:path";

import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
} from "../../../common/shared/jsonl-ledger.ts";
import { CUSTOMER_DIRECTIVES_REL } from "../../../model/directive.ts";
import {
  CUSTOMER_DIRECTIVE_STORE_REL,
  type DirectiveStore,
} from "../abstract/directive-store.ts";

export interface DirectiveFileStoreOptions {
  /** 单文件上限（测试注入；缺省 = A2 默认 5 MiB）。 */
  maxBytes?: number;
  /** 保留轮转份数（测试注入；缺省 = A2 默认 3）。 */
  rotations?: number;
}

/** 项目内账本绝对路径：`<projectRoot>/.ans/state/customer-directives.jsonl`。 */
export function customerDirectiveLedgerPath(projectRoot: string): string {
  return path.join(projectRoot, ...CUSTOMER_DIRECTIVES_REL.split("/"));
}

/**
 * 构造文件存储。`relPath` 恒为 A1 常量；调用方（Service/Pipeline）据此断言单一路径。
 * 写失败不吞：`append` reject 原始错误（含 `code`），由 Service 统一映射错误码。
 */
export function createDirectiveFileStore(
  projectRoot: string,
  options: DirectiveFileStoreOptions = {},
): DirectiveStore {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("客户指令账本：projectRoot 必须是非空字符串");
  }
  const file = customerDirectiveLedgerPath(projectRoot);
  const limits = {
    maxBytes: options.maxBytes ?? DEFAULT_JSONL_MAX_BYTES,
    rotations: options.rotations ?? DEFAULT_JSONL_ROTATIONS,
  };

  return {
    relPath: CUSTOMER_DIRECTIVE_STORE_REL,
    async append(line: string): Promise<void> {
      const result = await appendJsonlLine(file, line, limits);
      if (!result.ok) {
        const error = new Error(result.message);
        if (result.code !== undefined) {
          (error as NodeJS.ErrnoException).code = result.code;
        }
        throw error;
      }
    },
    async replay() {
      const result = await readJsonlLedger<string>(
        file,
        (raw) => ({ ok: true, value: raw }),
        limits,
      );
      return {
        lines: result.values,
        errors: result.errors.length,
        files: result.files,
      };
    },
  };
}
