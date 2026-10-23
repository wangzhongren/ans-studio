// 消息 key 类型 —— 从 zh-CN 参考目录推导（**key 全集单一来源**）。
//
// 属主：项目管理。`MessageKey` 是 `translate`/`createTranslator` 的 key 参数类型；
// 拼写错误在编译期失败。运行时不允许拼接 key（方案 §4.3），需要动态选择时用显式映射表。
//
// 新增 key 的步骤：先改 `messages/zh-CN.ts`（key 全集），再把同一 key 加到
// `messages/en-US.ts`；后者的 `satisfies Record<MessageKey, MessageTemplate>` 会强制齐全。

import { zhCN } from "./messages/zh-CN.ts";

/** zh-CN 参考目录的全部 key（稳定 ASCII 标识，不随文案改名）。 */
export type MessageKey = keyof typeof zhCN;
