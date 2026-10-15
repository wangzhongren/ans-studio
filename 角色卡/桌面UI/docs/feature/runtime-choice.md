---
id: desktop-runtime-choice
type: feature
title: 在桌面选择引擎并管理自己的会话与配置
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-runtime-ui-v2r1, multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: verified
    summary: 三引擎渲染流程、设置掩码及双宽离线 Electron 自测通过；真实主进程独立验收另行记录
---

# 在桌面选择引擎并管理自己的会话与配置

未导入文件夹时引擎选择禁用；导入成功（包括没有角色的空文件夹）后，用户可以在角色名旁选择 Pi、Codex 或 Claude。选择控件为浅色104×28px触发器与160px列表；方向键/Home/End只移动临时项，Enter/Space或点击才确认；当前项只收起，不重新开启会话。Escape、外点、失焦及Tab取消，Tab按自然焦点顺序离开。触发器是单焦点combobox，当前名称与已选项保持一致；列表翻转/限高，临时项滚入可见范围。每个引擎有自己的聊天记录、输入草稿、附件、待办与确认请求。切回原引擎可以继续查看原记录；切换只改变查看和下一次发送的目标，原引擎的后台任务继续运行。

导入或恢复项目后，以及每次切换引擎后，界面读取窗口的配置摘要。缺必填项时，聊天头下显示字段名称和“打开当前引擎设置”按钮；按钮直达已有设置抽屉，无需先点角色。配置读取失败如实提示，可打开设置重试；字段齐备时收起缺项条，这不代表凭据或远程服务已验证。迟到的旧引擎、旧项目或旧请求结果不覆盖当前状态。

左侧角色树保留主入口，其他角色按窗口提供的组别分组。运行时接入组的组长排在本组前面；组员及未知职责显示原文，没有组别的角色放在其他角色里。组别与组长标签只是说明，不改变任何文件权限。

## 用户操作与失败结果

```mermaid
flowchart TD
  locked[未导入文件夹 引擎禁选] --> import[成功导入或恢复项目]
  import --> choose[可选择会话引擎]
  choose --> summary[读取当前引擎配置摘要]
  summary --> incomplete{窗口返回缺项或读取失败?}
  incomplete -->|是| notice[主工作区显示提醒及设置按钮]
  notice --> settings
  incomplete -->|否| hide[收起缺项条]
  choose --> own[保存旧视图并打开新引擎自己的视图]
  own --> history[窗口按项目 角色 引擎读取可读历史]
  history --> open[窗口开启所选会话]
  open --> ok{开启成功?}
  ok -->|否| failed[显示错误 可重试或检查设置]
  ok -->|是| context[按窗口实际结果说明上下文来源]
  context --> send[输入文字 可带图片并发送]
  send --> result{窗口受理结果}
  result -->|直发| stream[显示所选引擎消息和工具结果]
  result -->|入队| queue[显示真实队列位次]
  result -->|失败| draft[恢复输入并保留附件 显示错误]
  stream --> confirm{收到确认请求?}
  confirm -->|是| answer[在原引擎原请求上作答]
  answer --> expired{窗口已失效?}
  expired -->|是| disabled[禁用旧同意并说明原因]
  expired -->|否| receipt[按受理结果定格或允许修正重试]
  stream --> stop[忙碌时点输入框左侧停止]
  stop --> abort[向窗口请求原身份 abort 如实显示受理结果]
  settings[打开右上角设置] --> masked[显示所选引擎字段 来源和缺项]
  masked --> save[输入修改并保存]
  save --> saved{窗口原子保存成功?}
  saved -->|否| retry[保留草稿 显示错误]
  saved -->|是| timing[清空机密输入 按 application 说明应用时点]
```

引擎选择立即按当前角色请求历史和开启会话。历史失败显示读取错误，开启仍由窗口按实际配置决定。后台异引擎事件进入其游离视图；旧项目事件丢弃，不能写进当前聊天。

设置抽屉复用原 Pi 设置入口。Pi 必填令牌、地址、模型，上下文窗口在高级中可留空；Codex 必填密钥和模型，地址可留空使用官方 Responses API；Claude 必填 API 密钥，模型与端点可留空使用 SDK 默认。字段名称、必填规则、有效来源、回退和帮助均由窗口 metadata 给出。机密输入为空，只显示已设置/未设置；“显示”只显示用户本次输入。保存失败保留输入；成功重读当前配置，仍缺项时继续提醒，重读失败时保留读取失败状态；成功获得新视图时清空机密输入，准确说明立即应用、下次会话应用或等当前轮次结束后应用。文件保存、必填完整性与应用时点分别说明。

停止仅请求当前项目、角色和引擎的真实 abort。请求成功不表示轮次已经结束，轮次仍由真实快照与收尾事件结束。失败或超时收尾保留错误状态。确认失效由窗口通知，界面不自行计时；旧同意不能作答新引擎。已失效 shell 弹窗只可关闭展示，关闭不再发送放行回包。

只有窗口报告原生恢复成功时才说明模型上下文已恢复。ANS 可读历史与模型上下文分别呈现；原生恢复失败后重建，保留真实原因，不按 JSONL 或索引存在推断成功。

例如：在运行时核心角色中先用 Pi 发消息，再选 Codex。Codex 视图不会带入 Pi 消息和待办；后台 Pi 仍工作。切回 Pi 能看到这段期间收到的 Pi 消息。若旧 Pi 确认已经中止，卡片保留原因，同意按钮不可继续作答。

## 实现与验证入口

渲染入口是 `renderer.js` 的 `selectRuntime` / `selectRole` / `onSend` 和事件路由；纯展示函数在 `runtime-ui.js`。数据只经 [桌面窗口实际 API](../../../桌面窗口/api-spec.md) 消费，不读取文件、SDK 或另写门禁逻辑。[本侧原始证据](../change/2026-10-14_change_multi-runtime-ui.md)记录自测候选、失败过程、命令与截图。该证据覆盖真实 Electron 的 renderer/preload 与离线 IPC；真实主进程全链路由独立测试角色验收，不宣称在线模型调用。

| 日期 | 类型 | 状态 | 变化 | 详细文档 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 设计 | 已实施 | 选择三引擎、独立会话视图、掩码设置和组摘要 | [同范围设计](../design/2026-10-14_design_multi-runtime-ui.md) |
| 2026-10-14 | 修改 | 本侧已验证 | 实际渲染实现、旧确认失效与双宽界面 | [实现证据](../change/2026-10-14_change_multi-runtime-ui.md) |

实时流和可读历史按权威turn/event/完整原文及逐次出现次数合并。full历史重建保留未被覆盖的实时内容、回交、收尾和原确认卡；没有身份的legacy不按文本猜测。用户气泡使用独立clientMessageId，仅由窗口原prompt闭包得到Core实际turn ack后绑定，同文direct/queued输入各自保留。前一静态守卫候选的自有60项和独立真实main23项通过，当时生产fingerprint一致（最新U1R2重验状态见下段）；原始红项、阶段9项与最后静态守卫迁移分别保存在[U1R记录](../fix/2026-10-14_fix_live-history-merge.md)。

当前U1R2候选：legacy full中的原确认卡只按窗口真实request/conclusion锚点重新插入，并保留原DOM/决定；明确null身份不继承当前历史token。自有60与离线Electron12通过，旧实际23因产品字节变化待T1重验，原证据不冒称当前。详见[卡片锚点修复](../fix/2026-10-14_fix_preserved-card-replay-anchor.md)。

导入前禁选与缺配置入口的最小修复已按客户确认 revision 1 实施；本侧配置专项实际 renderer 证据与独立真实主进程验收范围见[缺配置入口修复](../fix/2026-10-14_fix_runtime-missing-config-entry.md)。

引擎选择器统一浅色样式与完整键盘行为已按客户确认 v1 实施，本侧单元51项、实际renderer选择器25项及配置20/运行时16项回归通过；[实现与候选证据](../change/2026-10-14_change_engine-selector.md)说明独立真实桌面与辅助技术覆盖界限。

同一次可信工具阶段与typed输入现在按实际turn/call/phase或actualturn输入身份合并，特殊工具/请求卡只有一份生命周期表示；不同实际call/turn、blocked与result、失败/拒绝继续保留。实时/历史两向输入覆盖不靠正文猜重，未知旧记录保持事实，图文clientMessageId与阅读锚点原语义保留。必要生产源及历史字段由各属主修复，UI消费公共窗口结果；详见[重复展示修复r2](../fix/2026-10-15_fix_event-duplication.md)。

新项目导入在首次绘制角色树前清理旧项目状态，随后按新项目pending历史呈现真实恢复事实；同项目普通刷新继续保留当前状态。当前实现及新字节回归见[项目状态清理顺序](../fix/2026-10-15_fix_project-status-reset-order.md)。
