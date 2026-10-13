---
id: p01-images-p02-abort-handle
type: change
title: 会话句柄两处新增（P0-1 图片透传 / P0-2 停当前轮次）：中环编排句柄层
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [desktop-ux-improvement-proposal]
events:
  - date: "2026-10-13"
    kind: designed
    summary: 产品提案 desktop-ux-improvement-proposal P0-1/P0-2 客户批准；Pi适配器前环已落（契约 `RoleSession.abort?` + `PromptOptions.images`，契约钉死）
  - date: "2026-10-13"
    kind: implemented
    summary: 编排中环——RoleSessionHandle 增 abort?（三态如实）与 send 透传 PromptOptions（原样、不克隆）；审读会话路径核实不受影响；桌面接线为后环
  - date: "2026-10-13"
    kind: verified
    summary: test/编排 182/182（+8）；typecheck 全仓零错；全量 927 计/924 过，仅剩 2 条既有基线红
---

# P0-1 / P0-2 编排句柄层（中环）

> 依据：产品提案 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md` 的 **P0-1（图片随消息送进模型）** 与 **P0-2（跑飞轮次的「停」）**，客户 2026-10-13 批准。**前环已落地并钉死契约**（`src/provider/pi/session.ts`）：`RoleSession` 增可选 `abort?(): Promise<void> | void`（停当前轮不销毁会话、无在飞轮次=no-op、中止后 settled 仍发射、等待中的客户确认一并 fail-closed、错误如实上抛）与 `PromptOptions.images`；真适配器实现见 `real-adapter.ts::makeRoleSession`（abort 透传 Pi SDK `session.abort()`）。**本改动是中环**：把这些能力上抛到编排句柄面；**后环**（桌面接线：停止按钮出现时机、聊天流如实一行、入队定格）归桌面环节。

## 改在哪里（位置 → 改动）

**`src/pipeline/orchestration/run-role.ts`（唯一改动源文件）**

1. **`RoleSessionHandle.abort?()`（P0-2）**：新增**可选方法** `abort?(): Promise<RoleSessionAbortResult>`，返回形状 `RoleSessionAbortResult = { ok: boolean; supported: boolean; error?: string }`，**三态语义钉死**：
   - `{ ok:true, supported:true }` —— 已向底层会话请求停止当前轮次（轮次以 `settled` 正常收尾）；
   - `{ ok:false, supported:false, error:"当前运行时不支持停止" }` —— 底层会话**不带 abort**（如 demo 替身/假适配器）：**如实告知该运行时不支持停止，绝不假装已停**；
   - `{ ok:false, supported:true, error:<错误原文> }` —— 底层有 abort 但 SDK 报错：错误原文（`errText`）如实放入 `error`，**不吞、不谎报已停**。
   - **不销毁会话**（abort ≠ dispose）：abort 后句柄仍可继续 `send`，历史与模型上下文保留。
   - 实现：判 `session.abort === undefined` → `supported:false` 分支；否则 `await session.abort()`，try/catch 把报错转成 `ok:false, supported:true, error`（**选择「结果承载错误」而非 reject**：本方法返回结构化三态正是为让调用方如实渲染三态，且避免桌面侧未处理 rejection；错误原文逐字保留）。
   - **为何是可选方法**：同契约 `RoleSession.abort?` 自己的先例（「契约演进，同 PromptOptions 先例：既有实现/替身不实现它也完全合法」）——句柄面上把方法设为**必选**会强制**既有替身**（`test/桌面应用/**` 的桩句柄等，不属本角色写入边界）全部补实现，造成跨角色破损；设为可选则消费规则与契约层**同构**：`handle.abort?.()`，**方法缺席（旧替身）与 `supported:false` 同一处理**——如实告知不支持，绝不假装已停。**`openRoleSession` 返回的句柄恒实现本方法**（测试钉住 `typeof handle.abort === "function"`），缺席只出现在替身。

2. **`RoleSessionHandle.send` 透传图片（P0-1）**：签名扩为 `send(text: string, opts?: PromptOptions): Promise<void>`——
   - `opts` **整包原样透传**给底层会话 `prompt(text, opts)`（**同一引用**，不克隆不筛选；`PromptOptions` 从契约家 `src/provider/pi/session.ts` 只读导入，**不复制形状**；`images` 为契约 `PromptImage` 块，**空数组 = 无图**，同样原样透传）；
   - **不传 `opts` 时行为逐字不变**：实现保持单参调用形态 `session.prompt(text)`（测试钉住「恰 1 个实参」——比仅值相等更严，连调用形态都逐字）；
   - 多模态与否不由本层猜测（契约已写明）；队列**入队定格**与桌面接线归后环，本层只保证句柄层透传保真。

3. **其余全部未动**：gate/确认制/回交/自动收尾/shell arm/sessionDir/一次性路径 `runRole` 等逐字不变。

## 核实（只读）：pm-reviewer 审读会话不受影响

`src/pipeline/orchestration/pm-reviewer.ts` 的审读会话（`persistSession:false` 的 isolated 会话）只消费句柄的 `send(text)`（**单参**）、`events()`、`dispose()`：
- `send` 是**加可选参**——单参调用形态与旧版逐字一致（有专门用例钉住），行为零变化；
- `abort` 是**纯新增**的可选方法——审读路径从不调用它；
- `persistSession:false` 只影响 `sessionDir` 计算（本轮未动）。
结论：两项改动只动对外句柄面，审读路径不受波及。

## 测试（`test/编排/session-abort-images.test.ts`，8 例，全程桩适配器不触网）

- **P0-2 abort 三态**：① 会话有 abort（异步 Promise）⇒ `{ok:true,supported:true}`、透传恰 1 次、**disposes===0**（不销毁）、abort 后 `send` 照发；② abort 为**同步 void**（契约允许 `Promise<void>|void`）⇒ 同样 ok；③ 会话**不带 abort**（替身形状：对象上无该字段）⇒ `{ok:false,supported:false,error:"当前运行时不支持停止"}`、不销毁、send 照发（如实告知 ≠ 拒绝对话）；④ SDK 报错 ⇒ `{ok:false,supported:true,error:"SDK 网关拒绝：内部错误"}`（错误原文逐字）、不销毁；⑤ **假适配器端到端**（`createFakeRuntimeAdapter`，demo 替身形状）⇒ supported:false 如实。首例另钉 `typeof handle.abort === "function"`（openRoleSession 句柄恒实现）。
- **P0-1 send 透传**：⑥ 带 `{images:[IMG]}` ⇒ 桩收到的实参**逐字相等**（text、`{images:[…]}` 深相等）且 opts 为**同一引用**（原样透传不克隆）；⑦ `{images:[]}`（空数组=无图）⇒ 原样透传不吞字段；⑧ 不传 opts ⇒ `prompt` **恰 1 个实参**（调用形态与旧版逐字一致；既有用例全绿为行为不变佐证）。

## 如何确认（实际结果）

- `test/编排/` **182/182**（基线 174 + 8）。
- `npm run typecheck` **全仓零错**（含 `test/桌面应用/**`——abort 设为可选方法后既有替身桩零破损）。
- 全量 `node --test "test/**/*.test.ts"`（**引号带**）**927 计 / 924 过 / 2 红 / 1 skipped**——2 红均为**既有基线红**（`test/桌面应用/pi-config.test.ts` 面板键目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），已单独复跑确认为独立失败，**无新红**。
- 环境：Node v24.14.0、Darwin 25.6.0。未 git 操作、未重启桌面应用、未发真实模型请求。
- 真机验收（真模型长轮次点停、发图回答体现图片内容、>5MB 挡、忙时带图入队带图投递）属**后环接线完成后的客户跑**。

## 后环登记（归桌面应用）

1. 停止入口：聊天头当前角色名旁「停止」钮（仅工作中出现；空闲不出）；点击调 `handle.abort?.()`，按三态结果在聊天流**如实一行**（不支持停止的运行时如实说明，绝不假装已停）；轮次以 `settled` 收尾。
2. 图片接线：`session:send` IPC 增可选 `images`（主进程**重新**过 `validateImage`/`sniffImageMime`）；`SessionManager.send` 与队列 `DeliveryItem` 增图片载荷（**入队即定格**）；退役三处「未接线」提示行与 `imageNotWiredNote`。
