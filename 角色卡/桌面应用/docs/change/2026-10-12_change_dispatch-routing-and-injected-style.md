---
id: dispatch-routing-and-injected-style
type: change
title: su 派发任务路由（H-1，复用 E-1 投递机）+ 系统投递输入单独样式
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [su-handback-acceptance]
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 设计稿 H-1 实施桌面路由面（复用 E-1 投递机；契约 dispatchTask 已冻结于 provider/pi/session.ts）；同轮并入客户观察——投递输入不得长得像"客户发的消息"
  - date: "2026-10-12"
    kind: implemented
    summary: session.ts 把 E-1 投递机泛化为通用投递（DeliveryItem/按目标队列/settled 全项目放行）+ routeDispatch（校验/如实回执/队列期去重/自动开/排队/失败保留）；仅 su 会话注入 dispatchTask；renderer 注入样式（classifier 前缀表 + 手输防误伤 + 回放同类）；测试 +7 例
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 118 计/117 过/1 红（唯一红为既有环境红）；全量 792 计/789 过/2 红/1 skipped（两红均既有环境红，非本改动）
---

# su 派发任务路由（H-1）＋ 系统投递输入单独样式

**来源**：①设计稿 H-1（`dispatch_task{roleId,task,reason?}`；契约已冻结于 §4 冻结家
`src/provider/pi/session.ts`：`DispatchTaskPayload/DispatchReceipt/DispatchTaskFn`）；②客户观察——
「回头交的样式变化了，变成发送的消息了，一开始的特殊样式不见了」：投递进会话的输入以适配器的
「用户指令：…」回显成**普通气泡**，看起来像客户自己发的。

> **状态：已实施、已验证。** 实施面：`app/desktop/{session.ts, interface.ts}`、`app/renderer/{renderer.js,
> tool-rows.js, styles.css}`、`test/桌面应用/**`、本页。**未动 `src/**`**（契约只读导入）。e2e 已同步
> （注入样式/手输防误伤探针），**本轮未跑**。
>
> **同日修复指针**：真机暴露「坏形状回交事件 → 未捕获拒绝」——投递机已加三层形状防御与
> 「零未捕获拒绝」钉子，见 `../fix/2026-10-12_fix_handback-render-crash.md`（本页语义不变）。

## 一、H-1 路由（**复用 E-1 投递机，不造第二套**）

把 E-1 的单用途机泛化为**通用投递机**（`session.ts`）：

- 队列条目 `DeliveryItem{kind:"handback"|"dispatch", targetRoleId, sourceRoleId, text, dedupKey}`；
  队列按 **`项目 × 目标角色`** 存放；`settled` 时机**放行本项目各队列**（投递触发不挑目标，各队列自判
  「忙/未开」）；目标未开→**自动开启**；忙→**排队按序**（先置忙再 await，绝不并发 send）；
  失败→**如实系统行 + 放回队首**（下次时机：目标打开/下一次入队/一轮结束）——E-1 的既有文案与语义**逐字保留**。
- **`routeDispatch`（仅 su 会话注入 `dispatchTask`；数据驱动 `role.builtIn`）**：
  - **校验（如实回执给工具，绝不静默）**：`roleId/task` 空 → 拒；角色**不在本项目** → 拒；目标是
    **内置治理角色（含 su 自身）** → 拒；三种都同时放**系统行**（su 的 pane）。
  - **回执语义**：入队即回 `{ok:true,"已受理…（受理≠已完成）"}`（目标收没收到、失败与否，会在两边
    聊天流如实显示）；去重温回「已去重」。
  - **去重（写明）**：键 = `roleId\0task\0reason`——**队列期窗口**去重（载荷无 id/时间，契约钉死不扩；
    桌面无法区分"重试同一调用"与"新的一次相同文本派发"）；**投递成功即释放**——返工可再派发同文任务
    （E-1 回交的去重则**永久**——一条回交只投递一次，语义不同、各自写明）。
- **依赖登记（两项，均未落地）**：
  1. `renderDispatchPrompt`（编排）：`src/**` 现无此符号——本层以
     `session.ts::renderDispatchPromptLocal`（按设计 H-1 模板**逐字**）临时顶上；落地后改只读导入并**删本地
     函数**（**不得两处并存**）。
  2. `openRoleSession` 的入参字段名 `dispatchTask`：以钉死契约为准；编排接线落地前，真实 `run-role`
     会**静默忽略**该字段（我方透传就位）。
- **闭环核对（Req 3，已测）**：su 派发 → 目标执行 → 回交（E-1）自动投回 su → su 验收 → 需要返工则**再派**。
  除「su 的工具调用触发派发」「目标 settle 触发回交」这两个**显式输入**外，无任何事件回调会再触发派发
  ——**不自我激发**；测试以「静置后计数不变」钉住。
- **不做**：CLI 前端同等路由（一次性会话，登记）。

## 二、系统投递输入单独样式（客户观察）

- **判据单一来源（非启发式）**：投递正文由编排两名函数唯一生成——`renderHandbackPrompt` 首行固定
  `[回交] 来自 …`、`renderDispatchPrompt` 固定 `[派发] 来自 …`；适配器把**程序化输入**回显为
  `用户指令：<正文>`。故归类 =（剥掉可选 `用户指令：` 前缀后）**行首**匹配这两条定格前缀——
  前缀表在 `tool-rows.js::INJECT_PREFIXES`（**唯一改动点**，注释写明依赖）。
- **渲染**：`.msg-injected`（虚线框 + 图标 + 来源标签「**回交投递 · 来自 规划者**」/「**派发 · 来自 su**」+
  正文（Markdown/esc 单一来源））——**绝不**与 `.msg-user` 同款；D-1 **回放**的 user 行同样过分类器
  （投递行呈注入样式 + `is-replay`）。
- **手输防误伤（Req 3 的反向）**：`onSend` 记 `lastManualSend{roleId,text,at}`；回显若=本端刚手发文本
  （**同角色 + 15s 窗口**）→ 一律走普通路径；**且**前缀必须在行首（"行内提及 [回交]"不算）。两层一起
  保证「客户手输即便字面像投递前缀也不被改写样式」。

## 三、证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/*.test.ts"` → **118 计 / 117 过 / 1 红**
  （唯一红为**既有环境红** pi-config，未动）；全量 **792 / 789 / 2 红 / 1 skipped**（两红均既有环境红，非本改动）。
- **路由证据**（`dispatch-delivery.test.ts`，6 例）：自动开+模板文案投递+两边系统行；忙时排队→settled 按序；
  失败→「派发投递失败（目标 A）…**未丢弃**」+ 重试成功；校验三连（不在本项目/内置治理角色/空参数 →
  `{ok:false}` + 系统行）；**去重**：在途窗口同文两调 → 第二回「已去重」且只投一次；送达后同文再派 →
  新派发（共两次——返工回路）；**闭环**：su 派发→A 接活→A 回交→su 恰收 1 条 `renderHandbackPrompt` 原文，
  静置计数不变（不重复、不空转）。
- **注入样式证据**（`renderer.test.ts`）：分类器两态（回交/派发）+ 回放原文归类 + **非投递不误伤**
  （行内提及/未闭合前缀/普通句 → null）；渲染接线（`.msg-injected`+来源标签）；**手输防误伤判据存在**
  （`lastManualSend`+`recentManual`+15s）；**`.msg-user` 仍由 appendUser 专产（反向断言）**；回放 user 行过分类器；
  样式钩子。e2e 增 `INJECTED_STYLE_PRESENT/INJECTED_CHIP_LABEL/INJECTED_NOT_USER_BUBBLE/MANUAL_PREFIX_BUBBLE/
  MANUAL_NOT_INJECTED`（已同步、未跑）。

## 不在本轮（登记）

- CLI 路由、`renderDispatchPrompt` 落地、`openRoleSession` 字段承接（依赖 1/2 见上）。
- `renderDispatchPromptLocal` 切到编排后，本页「模板逐字」与 `dispatch-delivery.test.ts` 的期望文案需同步
  （测试注释已写明）。
