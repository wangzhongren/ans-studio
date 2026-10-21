---
id: claude-session
type: feature
title: 选择 Claude 后继续受治理的角色对话
created: "2026-10-14"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [multi-runtime-integration-v2, claude-governed-session-v2-a1]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: Claude Provider 已实现并通过临时实际 SDK/MCP 离线测试，待项目装配复测
  - date: "2026-10-16"
    kind: implemented
    summary: G-3 联网搜索能力位（默认关）实施；本角色 32/32 与本地回环 probe 通过，真网关 side-query 与桌面呈现待验
---

# 选择 Claude 后继续受治理的角色对话

选择 Claude 后，角色会话仍通过 ANS 判断写入与执行权限。源码已实现；CLI/桌面的选择入口由各自属主接线，正常依赖已经安装；最终项目组合测试仍由集成与测试属主继续。无需模型账号的本角色测试已验证生产 MCP handlers 与连续轮次。

核心 Service 选择 `createClaudeRuntimeAdapter` 并注入工具、客户等待闸和存储。固定角色的第一条 prompt 才加载 SDK、检查 API key 并启动流式会话；后续消息复用活 query。缺依赖、缺认证或配置错误直接失败。只有传入的 ANS MCP 工具可用；SDK 原生工具清空，工具调用在副作用前交给公共治理 handler。

```mermaid
flowchart TD
  input[选择 Claude 后输入角色任务] --> bind[Service 固定角色并注入能力]
  bind --> display{required projector/register 可用?}
  display -->|否| reject[SDK前拒绝构造]
  display -->|是| profile[绑定同一环境快照的展示profile]
  profile --> first[首次 prompt 懒加载及认证]
  first --> check{依赖/配置可用?}
  check -->|否| fail[失败 settled]
  check -->|是| sdk[流式 query 仅注册 ANS MCP]
  sdk --> tool{工具来源及当前轮有效?}
  tool -->|否| deny[拒绝 无副作用]
  tool -->|是| handler[顺序调用公共 handler]
  handler --> gate{ANS 允许?}
  gate -->|否| deny
  gate -->|等客户| wait[暂停 prompt 计时 等明确回应]
  wait -->|停止| abort[中止信号 关闭旧 query]
  wait -->|回应| handler
  gate -->|是| effect[执行并返回真实回执]
  handler --> project[真实args/rule/result经注入投影器]
  effect --> project
  project --> queue[安全展示事件入队 身份不改写]
  sdk --> result[实际 SDK 结果]
  result -->|原生 ID 匹配且成功| restore[更新真实恢复状态]
  result -->|恢复未确认且失败| rebuilt[清除失效 ID 附警告]
  rebuilt --> next[下一条明确输入新建上下文]
  result --> settle[一次 settled 带 outcome/turnId]
  abort --> settle
  settle --> save[Service 保存索引与可读回放]
```

客户等待期间可以停止：旧轮次的工具保留旧 signal，迟到回答不能恢复授权或提交报告，下一条输入可以继续。SDK MCP 有约 24.8 天硬超时上限，适配器禁用自动后台化并暂停 ANS prompt timer，但不承诺原生无限等待。完成一轮只表示该次 prompt 已终止；提交报告/派发是否成功看其真实回执。

开启 persistence 时，原生配置根位于注入的 `.ans/sessions/<role>/claude/native`。核心回放在同 runtime 隔离目录；回放能阅读旧对话，不证明原生上下文恢复。首次拿到旧 ID 时只待确认；实际成功 result 才显示 resumed。恢复未确认且本轮失败时清除 ID，下一条明确输入重新开始并保留 warning。没有 storage 时使用临时配置、不创建项目 `.ans`，关闭时清理。

## 思考参数不支持时继续

用户保存的档位交给 SDK：未设沿用 SDK 默认，off 请求关闭，low/medium/high/xhigh 传 effort；SDK 仍可能忽略或限制档位，不能把保存成功当成服务端已采用。第一条活动输入会显示 system 配置消息。

```mermaid
flowchart TD
  configured[按保存配置提交] --> response{SDK 结果}
  response -->|正常| done[完成当前轮]
  response -->|明确的400或422思考参数拒绝| safe{本轮尚无正常输出或工具启动?}
  response -->|鉴权 限流 其他故障| failure[按原故障处理 保留原配置]
  safe -->|否| failure
  safe -->|是| trying[提示正在兼容 重建子进程一次]
  trying --> bare[局部双env 真正省略thinking与effort]
  bare -->|正常完成| remember[提示兼容完成 后续本活会话沿用]
  bare -->|失败 取消 超时| reset[不记兼容 下一轮仍按原配置]
  remember --> done
  reset --> failure
```

仅在明确参数拒绝时采用兼容请求，普通接口可用时自动完成同一任务。`CLAUDE_CODE_EFFORT_LEVEL=unset` 与 `CLAUDE_CODE_DISABLE_THINKING=1` 只写兼容 SDK 子进程环境；不改主进程环境或保存设置。空 SDK 选项本身不能去参，因此不可用默认 high 冒充 low。只有正常完成才记住兼容方式，设置改变并重建后重新采用用户配置。SDK 自身运输重试保持。

正常文本/思考输出、任何 tool_use，或 ANS/外来 MCP/WebSearch 放行时即禁止整轮重放；SDK 标记的合成 API 错误帧不算正常输出。尝试、完成及配置说明都属于普通 system message，不作为模型思考正文或助手反馈。原有失败、停止与原生会话恢复语义保持；不承诺中途失败后无损续接。

真实 SDK 验证请求体字段与生命周期，不证明所有第三方网关会采用档位或接受 beta headers。旧 Sonnet/Haiku 可能不消费 effort，4.6 模型可能将 xhigh 钳到 high，本次不增加预算映射。当前修复与验证见 [2026-10-21 记录](../fix/2026-10-21_fix_reasoning-compatibility.md)。

API 最短使用方式是由核心 `createRuntimeAdapter({runtime:'claude', gate, projectRoot, skillRoot})` 选择本工厂；provider 直接调用只用于已注入完整能力的调用方和测试，详见[公开接口](../../api-spec.md)。配置 `ANTHROPIC_API_KEY` 为必需；模型 `ANS_CLAUDE_MODEL` 和 endpoint `ANTHROPIC_BASE_URL` 可选。只接受 API key，不尝试订阅登录。

2026-10-16（G-3 期1）：新增联网搜索能力位 `ANS_CLAUDE_WEB_SEARCH`（默认关，关时工具面/钩子/事件逐字不变）。开启时内置 `WebSearch` 可用并由 PreToolUse 放行分支自动批准（不注入 `updatedInput`、不改写模型输入；hook deny 先于 allowedTools，故该分支为必需项）；搜索执行经 CLI 同端点 side-query（服务端工具声明 `web_search_20250305`），成功/网关错误/预算文案均如实进工具事件（`native-start`/`native-result`，失败不毁轮次，query 成功时在结果文本可见）。客户真网关 side-query 与桌面行呈现待验；见[实施记录](../fix/2026-10-16_impl_web-search.md)。

当前正式包28项测试、接入Core required-v1的真实bundledCLI本地回环probe及整仓类型检查通过；真实账号、外部模型和最终项目组合尚未验证。工具start/result携带真实输入规则与可选execution，原MCP content不变；只有原Turn可证明的hook拒绝有blocked，未知hook只发诊断。C新元数据由Core先剥离，Claude收到的模型原文/图片不变。详见[本轮验证](../change/2026-10-15_change_tool-display-projection.md)。

| 日期 | 类型 | 状态 | 变化 | 详细记录 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 设计 | 已实施 | 确定 SDK 能力隔离、MCP schema 与生命周期 | [设计](../design/2026-10-14_design_claude-governed-session.md) |
| 2026-10-14 | 修改 | 项目复测待执行 | 新增 Claude 适配器并完成本角色临时离线验证 | [证据](../change/2026-10-14_change_claude-runtime.md) |

| 2026-10-14 | 修复 | 已验证 | 移除bare、按wire标记关联真实nativeprompt_id并冻结环境快照 | [原生证据](../fix/2026-10-14_fix_claude-native-hook-identity.md) |

| 2026-10-15 | 修改 | 本角色验证通过，完整流待集成 | A4工具展示与C2.tp1 SDK运输保护 | [实施证据](../change/2026-10-15_change_tool-display-projection.md) |

| 2026-10-15 | 测试修复 | 本角色29/29、tsc通过 | 发布高负载确认等待夹具用显式逻辑时钟保留50ms/100ms契约，并加精确超时负对照；生产不变 | [记录](../fix/2026-10-15_fix_release-test-clock.md) |

| 2026-10-16 | 修改 | 已实施待验证 | G-3 联网搜索能力位（默认关）：PreToolUse 放行分支、工具声明与 native 事件消费；32/32、类型检查与本地回环 probe 通过，真网关/桌面待验 | [实施记录](../fix/2026-10-16_impl_web-search.md) |
