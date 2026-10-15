---
id: pi-runtime
type: feature
title: 使用 Pi 执行受治理角色任务
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [pi-injected-runtime-p1]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: Pi 改为消费核心注入能力并独立恢复 native 会话
  - date: "2026-10-14"
    kind: verified
    summary: 自有199项与当前全仓strict类型检查通过
---

# 使用 Pi 执行受治理角色任务

在 CLI 或桌面选择 Pi 后，角色可以读取文件、按其边界写入、请求客户确认、交报告或派发任务。实际能力由编排及核心注入；缺席的能力没有工具，Pi 自带写文件与命令工具不能绕过治理。

例如 `ans role run Pi适配器 --runtime pi --task 示例任务` 由 CLI 交给编排，再由核心 Service 选择 Pi 并准备工具、交互闸、轮次与可选存储。模型配置仍通过 Pi 现有设置；缺少端点、模型或认证时明确失败。当前功能的完整接口见 [api-spec](../../api-spec.md)。

```mermaid
flowchart TD
  entry[CLI/桌面选择 Pi] --> service[编排交给核心 Service]
  service --> inject[注入工具/原轮次/交互闸/可选存储]
  inject --> bind[Pi 固定工具定义 懒加载 SDK]
  bind --> storage{注入持久存储?}
  storage -->|否| memory[内存上下文]
  storage -->|是| validate[公共 callback 校验 native 目录]
  validate --> native{Pi native 有有效历史?}
  native -->|是| resumed[SDK 恢复成功 resumed]
  native -->|无文件| legacy{Pi 旧角色目录有历史?}
  legacy -->|有| copy[复制旧档到 Pi native 再恢复]
  copy --> resumed
  native -->|坏历史| recovered[重建 recovered+warning]
  legacy -->|无| fresh[新建 fresh]
  bind --> deny{SDK 请求注入名称?}
  deny -->|否| block[执行前拒绝]
  deny -->|是| handler[SDK 原 signal/调用 ID 交注入 handler]
  handler --> policy[核心调用写门禁/shell审核/客户或报告能力]
  policy --> wait{客户或审核等待?}
  wait -->|是| pause[共享交互闸暂停 deadline]
  pause --> answer[回答后恢复剩余时限]
  answer --> result[如实工具结果]
  wait -->|否| result
  result --> settle[SDK settled与promise结果确定 恰一个终态]
  pause --> stop[停止使原signal失效 迟到同意无效]
  stop --> settle
  result --> timeout[超时 清理原生操作]
  timeout --> settle
  timeout --> cleanup{清理成功?}
  cleanup -->|否| quarantine[隔离会话 要求重建]
  cleanup -->|是| next[允许下一轮]
  settle --> save[Service 保存实际元数据与 ANS回放]
```

成功时工具使用核心同一处理器，按注入的 sequential 模式执行，报告和派发保留所属轮次。写被拒时没有 mkdir/write，shell 未获得审核 allow 不会 spawn；这由 [运行时核心](../../../运行时核心/docs/feature/runtime-core.md) 维护，Pi 不复制其判断。

会话持久化位于 `.ans/sessions/<role>/pi/native/`。读取先校验，真正建立持久会话前才 prepare；旧 Pi JSONL 复制迁入，旧档保持不变。只扫描注入的目录直接文件，绝不读取 Codex/Claude native。实际 Pi 模型上下文恢复成功标 resumed；坏档重建标 recovered 并给出原因。桌面从 ANS 回放展示历史不代表 native 上下文恢复，旧桌面词汇须显式转换。

停当前轮使用 SDK 原始信号取消模型、工具及客户等待。当前轮最多一个终态，失败、超时与中止不谎报 completed。原生中止清理失败会隔离该会话并要求重建。下一轮有新的轮次；旧客户信号不会变成新 signal。整个会话 dispose 退订并关闭资源及事件流。SDK/model/settings/resourceLoader 封闭装配，不使用全局 Pi 持久凭据或项目外设置；原始 prompt 图片块继续透传。

旧 Pi public gate factory、tools export、原 describeTool/toPiTool 和显式 sessionDir 只作兼容；新用户链使用 Service 注入工具和隔离存储。内部旧 fs-write helper 不在生产工具执行链。SDK仍钉1.1.0；当前测试使用临时目录和本地 faux engine，未调用真实模型。

演变历史：2026-10-14 [P1 设计与独立影响](../design/2026-10-14_design_pi-injected-runtime.md) → [迁移与验证](../change/2026-10-14_change_pi-injected-runtime.md)。先前图片/停止/诊断/工具变化仍见本角色既有 change/fix 与 changelog；本文件解释当前实际 Pi SDK路径，跨角色最终验收由各原属主完成。

工具事件只有 SDK execution_start 一个开始出口，带实际turnId/toolCallId和phase=start。它表示模型请求，并不表示已获授权；治理hook拒绝phase=blocked、SDK结束phase=result均保留真实事实。Core生产路径统一typed prompt-input输入，Pi不再另发旧输入回显；direct helper默认保留兼容typed回显。见2026-10-15 [重复事件修复与SDK验证](../fix/2026-10-15_fix_canonical-tool-events.md)。
