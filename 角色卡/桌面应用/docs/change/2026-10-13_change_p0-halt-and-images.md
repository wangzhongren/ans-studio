---
id: p0-halt-and-images
type: change
title: P0 收官环（桌面侧）——停止入口（P0-2 UI）+ 图片端到端接线（P0-1）；退役「图片未发送」提示
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [k-input-capsule-and-images, message-queue-and-role-state, operator-cards-and-finalize-removal]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户批准两项产品提案——P0-2「跑飞轮次的停」（编排中环已落 `RoleSessionHandle.abort?` 三态契约）与 P0-1「图片送进模型」（编排中环已落 `send(text, opts?)` 整包透传契约）；桌面侧做停止入口、图片载荷链路与三处「图片未发送」提示退役
  - date: "2026-10-13"
    kind: implemented
    summary: session.ts 加 abort(roleId) 三态回传 + DeliveryItem.opts 入队定格 + send(text, opts) 整包透传；interface.ts sendSession 主进程重校验（解码→嗅探→≤5MB，任一不合格整条拒发）+ abortSession；main/preload 加 session:abort、session:send 带载荷；renderer 聊天头 #btn-halt（role-state 快照判据、三态如实行）+ onSend 带图上送/成功清附件；chat-adapter demo prompt 接受并记录 opts（takeDemoPromptLog）
  - date: "2026-10-13"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 169 计/168 过/1 红（唯一红=既有环境红）；全量 933 计/930 过/2 红（两红均既有环境红）；e2e E2E_DONE=1（STOP_* 四检查点、IMG_QUEUE_FROZEN/IMG_PASSTHROUGH_QUEUED/IMG_PASSTHROUGH_DIRECT/IMG_REJECT_* 全 true）
  - date: "2026-10-13"
    kind: changed
    summary: 客户反馈「停止按钮位置有问题」——停止钮从聊天头移到**输入框区、发送钮左侧**（小圆钮、次级色、hover「停止当前轮次」）；与发送钮**并存**（发送钮绝不因忙碌被替换/禁用——忙碌时发消息=入队语义不变）；随此暴露并修复「直接发送路径只在轮次结束后才推 busy 快照」的前置缝（开跑即外推，与投递机同款）；e2e 加 STOP_IN_COMPOSER/CHAT_HEAD_NO_BUTTONS/STOP_VISIBLE_WITH_REAL_BUSY/SEND_ENABLED_WHILE_BUSY/SEND_QUEUES_WHILE_BUSY 检查点
---

# P0 收官环（桌面侧）：停止入口 + 图片端到端

**来源**：客户 2026-10-13 批准两项产品提案（来源登记在产品提案文档）；编排**中环**已落地契约——
`RoleSessionHandle.abort?(): Promise<RoleSessionAbortResult>`（三态语义钉死）与
`send(text, opts?: PromptOptions)`（`PromptOptions`/`PromptImage` 单一来源 `src/provider/pi/session.ts`，
**整包同一引用透传**）。本批为**桌面环**（后环），**只做接线与呈现、不做判定**。

## 1. 停止入口（P0-2 UI）

- **入口**：原挂聊天头角色名旁；**同日客户反馈后已移到输入框区（发送钮左侧）**（落定形状见 §2′）。
  **仅该角色会话忙碌时出现**——判据 = role-state **真实快照** `state.roleBusy`，`updateHaltButton`
  随 setChatHeader/onRoleState/换项目清零三处刷新（不做界面侧推测）；`hidden` 属性驱动显隐，
  无计时器（G-1）。
  **id 刻意避开 `btn-stop`**（退役「结束会话」按钮的防回潮钉按子串断言它不在渲染源里）——
  本钮停的是**当前一轮**（abort；会话保留、轮次仍以既有 `settled` 收尾），**不是**「结束会话」的恢复。
- **点击**：`d.abortSession(roleId)`（preload `session:abort` → main → Interface → `SessionManager.abort`），
  按**三态**在聊天流**如实一行**：
  - `{ok:true}` → 「已请求停止当前轮次——轮次仍会以收尾事件结束。」（**不做乐观「已停止」假象**）；
  - `{supported:false}`（句柄方法缺席与底层无 abort 同一处理）→ 「当前运行时不支持停止。」；
  - `{supported:true, ok:false}` → 「停止失败：<error>」（错误原文不吞）。
- `SessionManager.abort`：未知角色如实回 `{ok:false, supported:false}`；`handle.abort?.()` 缺席 =
  supported:false；SDK 抛错包成 `{ok:false, supported:true, error}`。重复点击幂等（无在飞轮次 = no-op，
  适配器环已测）。demo 替身不带 abort ⇒ 「当前运行时不支持停止」如实（e2e 断言该态）。

## 2. 图片端到端（P0-1）

- **渲染侧**：既有选图/粘贴/拖入不变；附件记录增 `data`（base64）；`onSend` 组
  `[{type:"image", data, mimeType}]` 随 `d.sendSession(text, images)` 上送（用户气泡带「（图片 ×N）」前缀
  保留记录）；**发送成功（直发或入队）即清附件**（载荷已定格）；失败保留可重试。
  仍要求消息**有正文**（队列条目正文形状钉死非空；图片随消息发送、不单独发图）。
- **主进程重校验（不信任渲染侧）**：`interface.sendSession` 逐张严格 base64 解码 → **魔数嗅探**定类型
  （声明 mimeType 仅线索）→ ≤5MB；**全过才组契约 `PromptOptions`** 下发；任一张不合格 ⇒
  **整条拒发**（fail-closed：绝不「丢图发文字」让客户以为图已送达）。
- **队列定格**：`DeliveryItem` 增 `opts?: PromptOptions`——忙时**入队即定格**（整包同一引用），
  `drainQueueUnsafe` 投递时原样透传 `handle.send(text, opts)`；空闲直发同一引用透传；
  **不传 opts 时调用形态与旧版逐字一致**（不构造空包）。
- **demo 适配器**（`chat-adapter.ts`，本角色边界内）：`prompt(text, opts?)` 接受并**记录**收包
  （模块级 `takeDemoPromptLog()` 环形上限 50，e2e/单测断言**透传保真**）；**行为不变**（图片不参与
  演示脚本、不落盘）。真实适配器不记录（载荷直入 SDK）。
- **退役**（不留死代码）：三处「图片未发送」提示行（空字发送/直发/入队路径）与 `imageNotWiredNote`
  函数；composer-images/interface/preload/main 的「送进模型未接」注释全部改为已接线口径。

## 2′. 停止钮位置调整（2026-10-13 同日客户反馈）＋前置缝修复

**客户反馈（原话）**：「现在停止按钮位置有问题，我觉得应该换个地方。」——聊天头角色名旁太突兀。

- **新位置（客户裁定）**：**输入框区、发送钮左侧**的小圆钮（`#btn-halt`，移入 `#composer-capsule`、
  `#btn-send` 的前一个兄弟）——同款 32px 圆形、**次级色**（描边浅底，不抢发送的实心主色；hover 提示
  「停止当前轮次」）；聊天头不再有任何按钮。`.cap-halt` 显式补 `[hidden] { display: none; }`
  （`display:flex` 会压掉 `[hidden]` 默认——同 `#pi-panel` 先例）。
- **红线保持（客户原话口径）**：**发送钮不可被替换或禁用**——「忙碌时发消息=入队」（DeliveryItem 队列）
  语义不变；停止钮与发送钮**并存**、各司其职（`updateHaltButton` 不触碰 `#btn-send`，有源码钉）。
- `updateHaltButton` 挂载点/判据不变（role-state 真实快照、三处刷新、G-1 无计时器）；点击仍走
  `abortSession` 三态如实行（措辞不变）。
- **前置缝修复（随位置调整暴露，属 P0-2 功能前提）**：直接发送路径原**只在轮次结束后**才推 busy 快照
  （旧版 `notifyRoleState` 在 `await handle.send` 之后）——长轮次（真实 pi 一轮数分钟）期间界面根本收不到
  「工作中」，停止钮与左树徽标都无从在轮次**进行中**出现（投递机路径本就「先置忙即推」；快适配器掩盖了
  这条缝，停止入口把缝暴露出来）。修复：直接路径**开跑即外推 busy=true**（与投递机同款；结束后那次保留，
  兜底快适配器竞态）。行为更准（快照 = 会话条目真实状态），不涉判定。
- **e2e harness 补线**：harness 原未接 `emitRoleState` → `session:role-state`（生产 main.ts 有、
  经 Q-1 去抖）——补上与生产同形（直推、语义一致），否则真实忙态到不了渲染侧。
- 测试同步：`renderer.test.ts` P0-2 钉组改新位置断言（胶囊内、发送钮左侧、聊天头无按钮、圆形/次级色/
  `[hidden]` 钉、显隐不触碰发送钮）；e2e 新增 `STOP_IN_COMPOSER`/`CHAT_HEAD_NO_BUTTONS`/
  `STOP_VISIBLE_WITH_REAL_BUSY`（真忙——慢轮在飞）/`SEND_ENABLED_WHILE_BUSY`/`SEND_QUEUES_WHILE_BUSY`
  （**并存钉**：忙碌时发送钮仍可用、手发即入队）全 true。

## 3. 测试与证据（2026-10-13；Node v24.14.0 / Darwin arm64）

- **新单测** `test/桌面应用/p0-halt-and-images.test.ts`（5 例）：abort 三态（demo 替身 supported:false +
  契约文案；句柄透传同一结果；抛错不吞；旧式替身与未知角色）＋ 重校验拒绝路径（坏 MIME/超 5MB 整条拒发、
  句柄不被触碰）＋ 合法图（mimeType 以嗅探为准、数据逐字、纯文本不构造空包）＋ 队列入队定格
  （settled 放行后**同一引用**投递）。
- `renderer.test.ts`：K-2 钉翻转为 P0-1（载荷上送/清附件/退役提示防回潮/重校验三件套/队列定格/Demo 记录）；
  新增 P0-2 停止入口钉（#btn-halt、三态如实行、快照判据三刷新点、session:abort 全链、结束会话不回归）；
  B-3「停止措辞唯一」钉收窄为**状态徽标的「已停止」**（轮次停止钮的「停止」措辞属 P0-2 功能面、另有钉）。
- **e2e**（真实 Electron）：停止入口 `STOP_IN_COMPOSER`/`CHAT_HEAD_NO_BUTTONS`/`STOP_HIDDEN_WHEN_IDLE`/
  `STOP_VISIBLE_WHEN_BUSY`/`STOP_LINE_UNSUPPORTED`（demo 替身 ⇒ 如实「当前运行时不支持停止」）/
  `STOP_HIDDEN_AFTER_SNAPSHOT_RESET`/`STOP_VISIBLE_WITH_REAL_BUSY`（真忙——慢轮在飞）/
  `SEND_ENABLED_WHILE_BUSY`/`SEND_QUEUES_WHILE_BUSY`（并存红线：忙碌时发送钮仍可用、手发即入队）；
  图片 `IMG_QUEUE_FROZEN`（**慢轮缝**：arm 后首轮 prompt 挂起至放行——把「忙」变成确定态，不改 demo
  本体）/`IMG_PASSTHROUGH_QUEUED`/`IMG_PASSTHROUGH_DIRECT`（IPC→重校验→队列→句柄→demo **逐字**）/
  `IMG_REJECT_BAD_MIME`/`IMG_REJECT_OVERSIZE`/`IMG_LEGACY_NOTE_ABSENT`；harness 注册 `session:abort`
  （与 app/main.ts 同形）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **169 计 / 168 过 / 1 红**
  （唯一红＝既有环境红）；全量 → **933 计 / 930 过 / 2 红**（两红均既有环境红）；
  e2e → **E2E_DONE=1**（219 true / 2 个既有预期 false）。
