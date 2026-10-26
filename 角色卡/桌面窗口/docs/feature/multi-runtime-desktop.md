# 在桌面使用同一角色的不同引擎

用户在桌面选择 Pi、Codex 或 Claude，再点角色，窗口会建立该引擎的受治理会话。切换引擎后，原来的后台轮次与排队任务继续留在原引擎；历史按项目、角色和引擎展示。所有执行工具由编排与核心注册，窗口不判断写入权限。

```mermaid
flowchart TD
  choose[导入项目并选择引擎] --> listing[门禁枚举角色与只读组别]
  listing --> open[窗口按项目/角色/引擎找句柄]
  open --> same{句柄和配置/边界匹配?}
  same -->|是| reuse[复用活句柄并返回桌面 resumed]
  same -->|否 且旧轮次忙| queued[保留原轮次 新输入按原引擎排队]
  same -->|否 且空闲| safe{更新 Pi 凭据时还有旧 Pi 轮次?}
  safe -->|有| queued
  safe -->|无| rebuild[安全应用配置并重建精确引擎]
  rebuild --> pipeline[Pipeline 工厂到核心及所选适配器]
  pipeline --> native{引擎实际原生恢复结果}
  native -->|成功| recovered[桌面 recovered 已恢复]
  native -->|失败后新建| warning[fresh 加上下文重建警告]
  native -->|新建或尚未确认| fresh[fresh 无恢复承诺]
  reuse --> send[新输入 / source 引擎派发 / 回交]
  recovered --> send
  warning --> send
  fresh --> send
  send --> busy{目标忙?}
  busy -->|是| queued
  busy -->|否| turn[按固定身份执行本轮]
  queued --> end[收到精确句柄 settled]
  end --> safe
  turn --> interaction{需客户确认?}
  interaction -->|是| card[展示含项目/角色/引擎的卡片]
  card --> decision{卡仍有效且明确同意?}
  decision -->|是| issuer[编排依据原 signal 检查再发行许可]
  decision -->|否| deny[拒绝或 unavailable 不放行]
  turn --> history[核心保存隔离 ANS 回放]
  history --> replay[Pipeline 读回放 转换展示行]
  replay --> render[IPC 带三元身份 UI 按身份消费]
```

窗口在开会话、发言和队列投递前检查实际边界文件指纹及 profile revision。忙轮次不被配置重建打断；新输入入队时固定身份、图片包及可选clientMessageId。每次原prompt调用通过Core真实onTurnStarted回执绑定actualturn，事件只查该原记录；匿名派发/回交也有独立来源，未知或缺ACK不借客户ID。settled先捕获来源再清忙/启动队列，旧轮次拒绝不清新busy。该客户端ID只作原气泡显示关联，不持久化、不授予权限。派发、回交与客户消息共用 FIFO；失败回到队首，并保留其间新到的消息。LRU 只回收空闲句柄，且不回收各项目主理（`primaryRoleId`，主理会话不关闭）。旧句柄流经过身份守卫，不得清除新句柄的状态。治理唤醒（交付核证/主理阻塞协调/自动推进）按 `system` 条目录入——UI 显示「系统」、不可撤回；统筹忙时 delivered 核证合并为一条，交付核证只走统筹通道。

设置字段来自共享 `RUNTIME_SETTINGS`。视图反映文件、环境、明确 fallback 或默认来源；秘密字段永远是空 value 加 isSet。空白认证和模型不算已设置，Codex 可按真实适配器约定使用 OPENAI_API_KEY fallback。提交只接受选定引擎字段里的字符串，拒绝含用户名/密码的地址。文件经共享原子写成功后才增加 revision；失败保持原 revision。

保存后的 application 为 next-session，若该引擎仍忙则 after-active-turn。Pi 保存只写文件；任何旧 Pi 轮次忙时不更新 ambient 凭据。最后一个旧 Pi 轮次结束会唤醒各项目中等待该安全点的队列，重建后才投递新输入。Codex/Claude 的创建快照由各适配器保证。未配置或构造失败明确返回错误，不换引擎。

历史入口 `getSessionHistory` 读取核心 ANS 回放，包含用户、模型与工具行；可用的工具 target 和交互锚点随行传递。每个 ANS 用户行复制原 entry.turnId，每个事件行保留 entry.turnId ?? event.turnId及原event.kind（顶层eventKind），工具activity.turnId与顶层一致。逐事件保留delta片段与次序，同文但不同轮次分别保留，UI据这些真实字段判断history/live对应。旧Pi没有这些权威字段时仍缺省。Pi 没有 ANS 回放时可显示旧 JSONL；Codex/Claude 从不走此兼容路径。历史存在不等于模型恢复。开会话以及轮次后读取 handle 的动态 contextSource；native resumed 转桌面 recovered，native recovered 转 fresh 加警告。

确认与选择保留原 CustomerInputMetadata.signal；停止、原 signal 中止、句柄释放或窗口关闭时删除 pending 并通知旧卡失效，迟到 yes 返回 expired。shell 的原公共 callback 没有原 signal：窗口以精确句柄的串行轮次、abort/dispose/terminal/send 失败与 presenter 时限使卡失效；不声称收到了不存在的上游参数。两个卡通道都不把 signal 序列化给 renderer。

关键代码：`app/desktop/session.ts`、`runtime-config.ts`、`runtime-history.ts`、`customer-input.ts`、`operator-channel.ts`；IPC 接线在 `app/main.ts` 和 `app/preload.cjs`。完整渲染契约见 [API](../../api-spec.md)。

## 历史与证据

- [已批准总设计](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)
- [窗口独立设计与影响评估](../design/2026-10-14_design_multi-runtime-window.md)
- [窗口实施与验证记录](../change/2026-10-14_change_multi-runtime-window.md)
- [历史轮次metadata修复与受影响验证](../fix/2026-10-14_fix_history-turn-metadata.md)
- [原客户输入与真实turn显示关联](../fix/2026-10-14_fix_client-message-origin.md)

窗口单元证据证明这些主进程行为。真实 Electron 与 renderer 的完整交互仍由 U1/T1 独立验收。
