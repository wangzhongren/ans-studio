---
id: shell-arm
type: change
title: 开放 shell（I-1）：桌面 arm + (a) 确认框接线（仅项目角色）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-cards-and-finalize-removal]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定 I-1「现在开放 shell，然后 shell 需要 su 审核一下。如果 su 觉得危险可以让客户决定」——桌面 DESKTOP_SHELL_GATE_ARMED 置真并把既有确认框接到 (a) 层
  - date: "2026-10-12"
    kind: implemented
    summary: operator-channel.ts flag→true + arm 文档重写（含已知风险登记）；main.ts arm 构造 (a) 通道并注入；interface/session 加 shellOperatorChannel 透传（仅项目角色注入，su 不 arm）；测试改 arm 决策 + 注入判据 + 源码钉子
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错（本角色；同期编排 shell-arming.ts 在制品 1 错属他角色）；test/桌面应用 121 计/120 过/1 红（唯一红为既有环境红）
  - date: "2026-10-12"
    kind: created
    summary: 客户**重发授权**（真机暴露：生产 arm 未注入 (c) 规则集 ⇒ 闸一律拒绝 ⇒ su 如实报「环境无 shell」）——补上 (c) 实件注入
  - date: "2026-10-12"
    kind: implemented
    summary: operator-channel.ts 增 buildDesktopShellArming（只读导入 classifyShell+defaultShellRules，失败⇒undefined）；main.ts 两件同备才 arm（(c) 失败连 (a) 也不注入）；session/interface 加 shellArming 透传（仅项目角色）；测试加引用同一性 + 失败路径 + 注入判据
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 136 计/135 过/1 红（唯一红为既有环境红）；全量 830/827/2 红（两红均既有环境红）；typecheck 0 错
---

# 开放 shell（I-1）：桌面 arm + (a) 确认框接线

**来源**：设计稿 I-1；**客户已明确授权（2026-10-12）**：「现在开放 shell，然后 shell 需要 su 审核一下。
如果 su 觉得危险可以让客户决定」。实施面：`app/desktop/{operator-channel.ts, session.ts, interface.ts}`、
`app/main.ts`、`test/桌面应用/**`、本页。**未动 `src/**`**（编排的闸装配件 `shell-arming.ts` 为在制品，见下）。

## 改在哪（文件 → 改动）

- **arm 点**：`app/desktop/operator-channel.ts::DESKTOP_SHELL_GATE_ARMED` 由 `false` → **`true`**（顶部文档整体
  重写：客户裁定日期与理由；2026-10-11「V1 不 arm」旧记录保留为历史、以新裁定为准）。
- **确认框接线（(a) 层）**：`app/main.ts` 在 arm 时构造既有通道——**M-1（同日客户裁定「这个太丑了」）前的
  形态**：`createElectronOperatorPresenter`（原生对话框：逐字命令原文 + argv + cwd（+升级原因）；**「拒绝」
  为默认高亮与取消项**，关窗＝不放行）——**M-1 已退役**，改为**应用内确认卡**（呈现端
  `createShellConfirmPresenter`，数据面经 `shell:confirm-request`/`shell:confirm-response` 两通道；
  结构/文案/取舍见 `docs/change/2026-10-12_change_shell-confirm-card.md`；fail-closed 三条逐字不变，
  另增 Esc=不放行、拒绝默认焦点）→ `createDesktopOperatorChannel` → 经 `createDesktopInterface({ shellOperatorChannel })`
  → Interface/`SessionManager` → **`openRoleSession` 入参 `shellOperatorChannel`**；编排用它装配
  (c)/(b)/(a) `ShellGate` 并注册 `run_shell`（编排的闸装配件 `src/pipeline/orchestration/
  shell-arming.ts` 已在制品中；**其 run-role 接线未落地前该字段被静默忽略**——我方透传就位，登记在案）。
- **只对项目角色**：`session.ts` 判据 `role.builtIn === true ? undefined : this.deps.shellOperatorChannel`
  ——**su 自身不 arm**（审读者不给自己开闸；数据驱动，不硬编码 "su"）。
- **历史接缝保留**：`shellGate`（已装配 gate 直注）字段未删——供直接持 gate 的调用方/测试；不再是 arm 必经路。
- **fail-closed（逐字未变）**：关窗/取消/拒绝/超时/通道抛错 → **不放行**（`createDesktopOperatorChannel`
  三条退路：deny / unavailable(超时) / unavailable(未接或抛错)；「恰好 allow:true 才 spawn」的唯一保证在
  Pi 适配器的 execute——本层只收选择）。

## 留痕核实（呈现 / 结果各去哪，如实）

- **结果进事件流（不丢）**：`run_shell` 的判定结果经工具结果回流——拒绝时 `{ok:false, message:"run_shell
  未执行：审核拒绝（…）"}`（`src/provider/pi/tools.ts:586`，`toolCallId` 逐调用透传 `:571/:576`）→ 适配器
  `tool_execution_end` 的 `isError` 映射为会话流里的 **`denied` 事件**；成功为 `accepted`/`tool_call` 行——
  即：**每条命令的最终结果都进事件流**（并经本角色既有渲染呈现）。
- **审计文件**：`by/branch`（谁审的、升级链）由编排落 `docs/audit/shell-gate.jsonl`（`buildShellGate` 内建；
  治理边界 + `shell-gate` 条件；审计失败不翻转判定）。
- **呈现本身（对话框）不在事件流**——它在系统对话框里（逐字原文），如实登记；「呈现→选择→结果」三步中，
  **选择与结果**分别经 `OperatorOutcome`（回编排）与会话事件（回界面）留痕。

## 已知风险（I-1，**如实登记**）

**本轮无沙箱**：客户放行的 shell 命令在项目目录里**真实执行**；命令内的**写入不经过 `resolveWrite`
写门禁**（`run_shell` 无 path、不进 `GOVERNED_WRITE_TOOLS`）——即：**放行的命令可以绕过写边界**。
缓解＝本条链本身（(c) 硬拒 + (b) su 审读 + **危险/拿不准一律交客户**，且每命令审计留痕）；**不等于**
消除——客户知情并已授权开放。

## 补丁（同日）：(c) 规则集**实件注入**接线（客户重发授权）

**背景（真机暴露）**：arm 后生产路径只注入了 (a) 通道、**未注入 (c) 规则集**——编排 `assembleProjectShellGate`
对「规则集未注入」的既定处置是**一律拒绝**（fail-closed），于是 su 在真机上如实报「环境无 shell」。
**客户重发授权**：把 (c) 层规则集实件接上。实施面：`app/desktop/{operator-channel.ts, session.ts,
interface.ts}`、`app/main.ts`、`test/桌面应用/operator-channel.test.ts`、本页。**未动 `src/**`**
（只读导入 `src/service/gate/shell-rules.ts`——门禁引擎经客户确认边界后落地的 Service 公开出口）。

- **构造点**（`operator-channel.ts::buildDesktopShellArming`）：**只读导入**两件——`classifyShell`
  （与门禁引擎实件**同一函数引用**，不复制实现）+ `rules = defaultShellRules()`（规则集本体）；形状
  `DesktopShellArming = Omit<AssembleShellGateOptions, "project"|"operatorChannel"|"sessionDeps">`
  （**只读转自编排**，不另立第二份）。**任何一步失败（含加载抛错）⇒ `undefined` = 不 arm**。
- **接线**（`main.ts`，与 (a) 通道**同一处**）：`shellArming = ARMED ? buildDesktopShellArming() : undefined`；
  **两件同备才 arm**——`shellArming === undefined` 时**连 (a) 通道也不构造**（`run_shell` 不注册——能力缺席
  即 fail-closed；不取「注册了但全拒」的半装态），并如实打印一行主进程日志（无敏感值）。
- **下发判据**（`session.ts`）：`shellArming` 与 `shellOperatorChannel` **同判据**——`role.builtIn === true ?
  undefined : deps.shellArming`（**仅项目角色**；su 不 arm）；透传链 main → Interface → SessionManager →
  `openRoleSession({ shellArming })`（编排 `run-role.ts` 已消费：`assembleProjectShellGate({...shellArming})`）。
- **测试**（`operator-channel.test.ts`，**19/19 绿**）：`buildDesktopShellArming` **引用同一性**
  （`arming.classifyShell === classifyShell` 实件；rules 经加载器**原样透传**——桩件 sentinel，**不真跑命令**）；
  失败路径（桩件抛错 ⇒ undefined）；注入判据扩两件（项目角色收 (c) 实件**原引用**、su 不收；未配置时
  输入里**两字段都不出现**）；arm 决策源码钉子改为「两件同备才 arm」（`shellArming !== undefined ?
  buildDesktopOperatorChannel(win) : undefined`）。
- **「是否已真正接通：是」的证据**（同文件，集成核查）：**真实 `openRoleSession` + 真实装配**（(a) 用桩件——
  绝不真弹窗；不发模型请求、不执行任何命令）——注入 `buildDesktopShellArming()` 后，能力面
  `capabilities.shellGate` **确实产出**（run-role 把它交给 Pi 适配器工厂：`capabilities?.shellGate ?? shellGate`
  ⇒ `run_shell` 注册条件成立）；另以只读源码核查钉住编排确实展开 `input.shellArming`。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `test/桌面应用/operator-channel.test.ts`（**16/16 绿**）：arm 决策（flag=true）+ **源码钉子**
  （main 按开关构造通道并注入；Interface 透传；session 仅项目角色）＋ **I-1 注入判据**（项目角色会话收到
  通道实测、su **不**注入）＋ 既有 fail-closed 三连（拒绝/超时/抛错 → 不放行；仅恰 allow 放行）＋
  历史接缝透传用例（更名保留）。
- `test/桌面应用` 全套 **121 计 / 120 过 / 1 红**——唯一红为**既有环境红** pi-config（未动）。
  `npm run typecheck`：**本角色 0 错**（同期编排 `shell-arming.ts:33` 在制品 1 错——他角色，非本改动；
  已如实报告）。
- **e2e 不 arm**（离线演示不注入通道；真实对话框路径不可无人值守跑——由单测桩覆盖）——登记。

## 依赖与待办登记

1. **编排**（**已落地**）：`run-role` 已消费 `input.shellOperatorChannel` 并按角色种类调
   `assembleProjectShellGate`（`run-role.ts:303`）；同日补丁的 `input.shellArming` 亦已被其消费
   （`shell-arming.ts` 的 (c) 注入位；字段名以落定契约为准——若改名，我方只改 `session.ts`/`interface.ts`
   两处绑定 + `operator-channel.ts` 的 `Omit` 别名）。
2. **装配**：面板/文档如需注明 shell 已开放，属其角色。
3. 「无沙箱」风险如需缓解（沙箱/白名单外置），另立提案（跨角色）。
4. **在途观察（登记）**：(b) su 模型审读在真机的实际触发/延迟/成本尚未实测（本角色有「不发真实模型请求」
   纪律）；建议客户在真机观察 su 审读行为，若判定异常另行处置。
