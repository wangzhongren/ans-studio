---
id: operator-cards-and-finalize-removal
type: change
title: 客户交互卡与通道泛化（A-5）+ 收口面删除 + B-3「等待你确认」接线
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [markdown-history-status]
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 已批准设计稿 A-5 实施（orchestrator A-3/A-4 与 Pi适配器契约已落地）：通用交互卡 + session:operator-request/-response 通道泛化 + 删收口面 + B-3 接线
  - date: "2026-10-12"
    kind: implemented
    summary: 新增 app/desktop/customer-input.ts（通道：快照校验 + fail-closed 四条）；renderer.js 交互卡取代 finalize 链；session.ts 注入判据改 customerInput（仅 su）；interface/main/preload 同步；finalize-wiring.test.ts 以新语义重写为 operator-wiring.test.ts（+5 例）
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 94 计/93 过/1 红（唯一红为既有环境红 pi-config）；全量 706 计/703 过/2 红/1 skipped（两红均既有环境红，非本改动）；e2e 已按新形状同步+新增 OP_* 检查点，本轮未跑
---

# 客户交互卡与通道泛化（A-5）——「客户确定了才加」的桌面面；收口面删除

**来源**：pm 已批准设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`
§三 A-5（status: approved）。依赖已落地：编排 A-3（`openRoleSession` 的 `customerInput` + `confirmed-writes.ts`
发行器）与 A-4（删「提议+确认」，产物收尾改**自动**）；Pi适配器的冻结契约（`CustomerInputRequest` /
`CustomerInputOutcome` / `CustomerInputFn`，`src/provider/pi/session.ts`）。

> **状态：已实施、已验证（2026-10-12）。** 本轮**只动** `app/**`、`test/桌面应用/**` 与本角色 docs。
> e2e（真实 Electron）已同步新形状 + 新增检查点，**本轮未跑**——真实操作路径验收属「客户跑」。

## 用户会看到什么

**改前**：只有一种「收口确认卡」（完成 bootstrap 的提议 → 确认）；su 想在建角色**之前**征询客户无从表达；
系统的「完成 bootstrap」入口 + 手动的「让 su 提议收口」按钮是唯一的确认面。

**改后**：

1. **通用交互卡（四态）**：su 经 `request_confirmation` / `request_choice` 发起——**带预览的确认**（角色卡
   正文+边界摘要等长文放**折叠块**里，限高可滚）、**纯确认**、**单选**（radio）、**多选/勾选**（checkbox）。
   作答点按钮即**定格**；「不同意 / 取消」= **未获同意**（不写盘）。
2. **收口面已删**：「完成 bootstrap」入口、收口提议/确认卡、`session:finalize*` / `session:bootstrap-state`
   四 IPC 与 preload 四方法全部移除——产物收尾现由编排在 su 会话 settle 后**自动**完成（客户裁定
   「不要收口」；A-4 语义），桌面不再有任何手动触发面。
3. **B-3 接线**：有未决交互请求时，该角色左树徽标真的亮「**等待你确认**」（此前是留位）；作答（或取消）
   即熄灭；回传被通道拒绝（如非法回包）则重新亮起——只由既有事实（请求挂起）推导。

## 改在哪（文件 → 改动）

- **`app/desktop/customer-input.ts`（新增，纯逻辑）**：`createCustomerInputChannel` —— 请求/裁决的**冻结形状
  从 §4 冻结契约家只读导入**（不复制）；**per-window pending Map + 关联 id**；`respond()` **按请求快照校验**：
  选项 id 必须 ⊆ 已发、单选恰一个、类型相符、布尔型校验——**非法回包不受理**（`{ok:false}`，pending 保留）；
  归冻结三态（answered / declined / unavailable）。**fail-closed 四条**：未接线→unavailable；窗关（presenter
  抛错 / `rejectAllPending`）→ **declined**；取消/不同意→declined；**超时不在本模块**（Pi适配器工具层
  withTimeout；超时=unavailable）。
- **`app/renderer/renderer.js`**：`appendOperatorRequest` 通用交互卡（变体类 `op-kind-confirm/preview/select/multi`，
  与按钮类不冲突；预览 = `details` 折叠 + `max-height:40vh` + `pre-wrap`；提交/确认/不同意/取消；提交后定格、
  通道拒收则解冻重试并如实示原因）；B-3 `awaitingConfirm` 挂/灭；**finalize 链整体删除**
  （`appendFinalizeProposal`/`appendFinalizeResult`/`onFinalize`/`refreshBootstrapAction` 等）。
- **`app/desktop/session.ts`**：注入判据由「创世 su」改「**内置治理角色（`role.builtIn`）**」——`openRoleSession`
  入参改 `customerInput`（**每会话闭包绑定 roleId**）；删 `FinalizeResult`/`BootstrapState`/`usesFinalize`/
  `finalized`/`bootstrapState()`/`finalizeBootstrap()` 与 `genesisFinalize`/`operatorChannel`/`confirmTimeoutMs`。
- **`app/desktop/interface.ts`**：`DesktopDeps.customerInput`（`DesktopCustomerInputFn`，带 roleId 上下文）；
  删 `getBootstrapState`/`finalizeBootstrap` 与两 dep。
- **`app/main.ts`**：装配 `createCustomerInputChannel`（presenter 推 `session:operator-request`；窗关
  `rejectAllPending("窗口已关闭，未获同意…")`）+ IPC `session:operator-response`；删 finalize presenter/
  pending/两 IPC。
- **`app/preload.cjs`**：`onOperatorRequest` / `operatorRespond` **两方法替四旧**（白名单；渲染进程仍不碰 Node）。
- **`app/renderer/index.html` / `styles.css`**：删入口容器与 `.bootstrap-action`/`.sys-finalize`/`.fp-*` 样式
  （含窄屏媒体查询里的残留选择器）；新增 `.op-*` 系列。
- **测试**：**删 `finalize-wiring.test.ts`**（15 例打的是已删 API）→ **新增 `operator-wiring.test.ts`（5 例：
  confirm/choice 三态、快照校验负例、多选子集去重、取消/窗关/未接线、注入判据含 roleId 闭包绑定 + 未接通道
  不注入）**；`interface.test.ts` T36 用例改 A-5 注入判据；`renderer.test.ts` T36 段改两组 A-5 断言
  （卡片/通道齐备 + **收口面「断言它不在」防回潮**）；`e2e/main.mjs` 同步（真通道装配 + 8b 交互卡 drill：
  `OP_*` 检查点含快照校验负例与 B-3 亮/灭；`BOOTSTRAP_ACTION_REMOVED` 守卫）。

## 什么没变（防止误读）

- **界面仍不作任何判定**：发行 writeSet 在编排（`confirmed-writes.ts`）、写不写在门禁+工具——桌面只呈现
  与收集；**绝不悄悄放行**（一切不确定 → declined/unavailable）。
- **授权模型不变**（scope/genesisBootstrap/.ans 链）；shell 闸 (a) 通道（`operator-channel.ts`）**未动**
  （V1 不 arm，保持如实标注）。
- O-A1（内容漂移加固）**未采纳**、只登记（编排侧文档）；交互工具**不推广**到非治理角色（O-A2 未准）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **94 计 / 93 过 / 1 红**；**唯一红为既有环境红**
  （`pi-config.test.ts` 断言检出目录名以 `ans-cli` 结尾、本机为 `ans-runtime`——**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **706 计 / 703 过 / 2 红 / 1 skipped**；两红**均既有环境红、非本改动**：
  同上 pi-config + `test/项目管理/shared/path-primitives.test.ts` 的 macOS `/var`→`/private/var`。
  （同期 `test/测试/**`、`test/装配/**` 由各自属主在制/已修，**不在本角色范围**。）
- **快照校验证据**：`operator-wiring.test.ts` 断言「选项不在请求中 / 单选给两个 / 空选择 / 类型不符」均 `ok:false`
  且 pending 保留、合法重试成功；「伪造 id 不受理」。
- **fail-closed 证据**：未接线 → `unavailable`；`rejectAllPending`（窗关）→ `declined`；取消 → `declined`。
- **注入判据证据**：su 会话注入（roleId 闭包绑定为 `["su"]`）、普通角色不注入、未接通道时连 su 也不注入。
- **e2e**：已同步 + 新增 `OP_*` 检查点（含负例与 B-3 亮/灭）、`BOOTSTRAP_ACTION_REMOVED` 守卫，**本轮未跑**。

**并发说明（如实登记）**：本改动期间编排/Pi适配器并发的 A 组在制品持续改动 `src/**`（本层只读依赖）；
本页计数为**本改动集就位时刻**的实测。若后续 `src/**` 再改动，应复跑一次最终确认。

## 不在本轮（如实登记）

- **o-B1**：表格/图片渲染（未准，不做）；**O-A2**：交互工具推广到非治理角色（未准）。
- **真实模型端到端**（su 真的先征询再写、交互卡作答 → 发行 → 落盘）：属「客户跑」（设计 §七）。
