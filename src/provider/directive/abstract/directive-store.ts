// src/provider/directive/abstract/directive-store.ts
// 客户指令账本 Provider —— 抽象存储契约（2026-11-03，客户授权平面 B1）。
//
// 归属：编排（B-3 模块私有根 `src/provider/directive/`）。**纯存储，不做业务判定**：
//   · `append(line)`：追加一行 JSONL（durable 后 resolve；失败 reject）；
//   · `replay()`：旧→新读取全部段文件，返回原始行、文件级/坏行错误计数与段名清单。
//
// 纪律（B1 提案 §1.2/A2 冻结）：轮转、原子追加、坏行计数**只调用**
// `src/common/shared/jsonl-ledger.ts`；本模块不写第二份实现。路径常量单一来源在
// `src/model/directive.ts`（A1），`relPath` 必须与 `CUSTOMER_DIRECTIVES_REL` 逐字一致。
//
// 消费方：`src/service/directive/`（B1）与测试注入缝；Pipeline 公共句柄 re-export 本类型。

import { CUSTOMER_DIRECTIVES_REL } from "../../../model/directive.ts";

/** 账本相对项目根的路径（单一来源 = A1；Provider 只做 re-export/断言，不复制字面量）。 */
export const CUSTOMER_DIRECTIVE_STORE_REL = CUSTOMER_DIRECTIVES_REL;

export interface DirectiveStoreReplay {
  /** 原始 JSON 行（旧→新；已由共享辅助校验为合法 JSON）。 */
  lines: readonly string[];
  /** 坏 JSON 行 + 文件级读失败条数。 */
  errors: number;
  /** 参与读取的段名（basename；当前文件恒在列，轮转段仅存在者入列）。 */
  files: readonly string[];
}

/**
 * 指令账本存储接口（Pipeline 公共句柄 `DirectiveStore` 的物理来源；测试可注入替身）。
 * `relPath` 必须 === `CUSTOMER_DIRECTIVES_REL`（Service/Pipeline 构造期断言，防第二路径）。
 */
export interface DirectiveStore {
  readonly relPath: string;
  /** 追加一行（已序列化的单行 JSON；durable 成功后 resolve，失败 reject）。 */
  append(line: string): Promise<void>;
  /** 旧→新读取（轮转段 `.N` → … → `.1` → 当前）。 */
  replay(): Promise<DirectiveStoreReplay>;
}
