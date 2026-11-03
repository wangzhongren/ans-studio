---
id: customer-authorization-plane-c2-implementation
type: change
title: 客户授权平面 C2 实施记录：渲染层回显抑制、确认对话框、指令面板与 AC-22 卡内入口
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - 角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A3-implementation.md
  - 角色卡/桌面窗口/docs/change/2026-11-03_customer-authorization-plane-C1-implementation.md
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 C2 P1 Revision 2（recommend approval）实施渲染层 store/对话框/面板/Composer 回显抑制/ConfirmCard 卡内入口/CSS 与测试；UI 401/401、双端 typecheck 0、build 0、phase3b 45/45、phase5a 48/48、补充 Electron 探针 20/20
---

# 客户授权平面 C2 实施记录：渲染层

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：桌面UI（固定角色；本上下文只承担该角色）/ 团队计划 §5.1 **C2（渲染层）**。
- **状态**：**`implemented-unverified`**。实施完成、证据已采集；**未验收、未 commit/push**，不替代 D1/D2/E1/E2。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；开工前全仓 `npm run typecheck` **exit 0**、`npm run typecheck:renderer` **exit 0**；`git status --porcelain -- src app test` 为 A1/A2/A3/B1/C1 未提交候选（38 项；见 `00a-git-status-start.txt`）。C2 只写 `app/renderer/**`、`test/桌面UI/**` 与自身证据；A1/A2/A3/B1/C1 候选哈希写前=写后（`08-unchanged-a1-a2-a3-b1-c1.log`，0 mismatch）。

## 1. 输入与冻结事实（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | ---: | --- | --- |
| C2 P1 提案（Revision 2） | 180 | `cde65f8059ea4219561746d59e40e36b7b72e9d2b760ed76328cd537c83042f5` | 确认写集/AC-22 A2/停止项 |
| P1 审核记录（含 R1/R2，`recommend approval`） | 397 | `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c` | P1-CAP-05/06/07/08/12/15/16/17/18 |
| 团队计划（含 §十三增补） | 664 | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | v1 653/`37e6bd0d…` + C2 写集增补 |
| 方案 P1.2（盘上编辑性等价；P1.1 未单独落盘） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | 冲突以 P1.1（1199/`7875ad6a…`）为准 |
| V1 实施前标准 | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-1..AC-24 |
| B0 基线 | 239 | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | 374 UI 测试基线 |
| A3 实施记录（key 冻结） | 135 | `51dcf2fdc0ce9a90e9ab59c89e66a8e2223e482d6ae3f4b7babff589ccaa2367` | 104 新 key、总计 1746、cardEntry 14 |
| C1 实施记录 + 冻结声明 | 208 | `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6` | 五通道/五方法/`SendResult`/handshake |

- **C1 冻结消费**：`directive:confirm-request`/`directive:confirm-response`/`directive:list`/`directive:revoke`/`directive:state`；preload `onDirectiveConfirmRequest`/`directiveConfirmRespond`/`listDirectives`/`revokeDirective`/`onDirectiveState`；`directivesEnabled`/`confirmable`/`directiveConfirmRespond`；`DirectiveListView {active,consumed,revoked,expired}`；`SendResult.directive`/`directiveCancelled`。未改 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`app/renderer/src/lib/platform.ts`。
- **A3 冻结消费**：所有用户可见文案只用 `ui.directive.*`/`main.directive.receipt.noConsumerSuffix`/既有 `ui.composer.*` key；标记值 `@审批`/`@决策` 以数据常量传入占位符；新源码去注释后零 Han（测试断言 + 全仓 guard 仅剩 C1 既有项，见 §5）。

## 2. 写集与实际改动

### 2.1 修改（4）

| 路径 | 行数 | SHA-256 | `git hash-object` | 改动 |
| --- | ---: | --- | --- | --- |
| `app/renderer/src/chat/ipc.ts` | 612 | `5d7ff9e66f7966554d9d23b0674a37d13b7124577ef7a89383f0d8b3cee518af` | `9696f0c28b6dcebc6fc3cb5afe86eebbf88e1641` | `DirectiveBridge` 重导出 + `directiveBridgeOf` 五方法结构断言；订阅 `onDirectiveState`/`onDirectiveConfirmRequest`；项目切换 `clearProject` |
| `app/renderer/src/shell/Composer.tsx` | 1011 | `0a19060b49fcb33e2198e5cff81604dece660acdb9b7dc47f75cec4e6439d7b6` | `9afe743b94393001aca9a2928b5adc60adacf928` | 共享解析器回显抑制（仅能力位 true）；`ensureInitialRead`；`res.directive`/`directiveCancelled`/迟到撤回；面板入口；挂载对话框/面板 |
| `app/renderer/src/shell/ConfirmCard.tsx` | 944 | `e997aa3c44e2dd1f72a30e9167042682d57d4670be0b37248b4ec2e3d9e21011` | `ab01730e6a4e026b9bc7a6400e1b684503079f96` | 三卡 `CardDirectiveEntry`；target 只取卡载荷 fail-closed；overlay 让位/卡内 Esc 折叠 |
| `app/renderer/src/shell/shell.css` | 3882 | `a188012d0e0feaedc767de9f348afd03c8f8d26543119750d0236d3c0c3760d8` | `3b873626ab9fa7444223d9e415f6647702e32c34` | 追加 z90 对话框/z95 面板/字段/高危/行/卡内入口样式；既有 `.sc-overlay` z60 未改 |

### 2.2 新增（5）

| 路径 | 行数 | SHA-256 | `git hash-object` |
| --- | ---: | --- | --- |
| `app/renderer/src/stores/directive-store.ts` | 1067 | `5096ba6961615edd4c3caa8083f3f274510851c34a17d852876dbd28cf82e844` | `40e84a115faf79efa3b434f9806a8bcceb41393a` |
| `app/renderer/src/chat/directive-dialog.tsx` | 262 | `897223a08b3e2b1c8f90d5df37289dd9e797c277b593b21b62167a69cb4527d7` | `c80bfdbd475b296578728a3e0ee343358a0c72b1` |
| `app/renderer/src/chat/directive-panel.tsx` | 283 | `c96f6cd245a25e5b655258738a47942ad3fd01ea4dd71cdf33ba5eea016bdc4f` | `64e60250754a640d6dcbcea90b63879616fdfd13` |
| `test/桌面UI/directive-dialog.test.ts` | 396 | `51547abf05888cd1ee422b732819dc71725aba19cfc9e55109bb775658d62962` | `d7b03041cce352eadd9e9f6a15c80b32286585b8` |
| `test/桌面UI/directive-panel.test.ts` | 441 | `6ab90d2238043655d8ea19eaa443f30ba162fa662b95117ad0d13ded8def1e0a` | `c507a74f012b3070477ae8f3d4bfd7728d81f0d5` |

- **写前哈希**：`00b-writeset-sha256-before.txt`（4 个既有文件）；写后：`11-writeset-sha256-after.txt`。`test/桌面UI/phase3b-electron-smoke.mjs`/`phase4b-electron-smoke.mjs`/`phase5a-electron-smoke.mjs` **零 diff**（写前=写后：`3de365a7…`/`bd6fdba1…`/`c68b7483…`）。
- **未写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`app/renderer/src/lib/platform.ts`、`App.tsx`、`ChatHeader.tsx`、`Drawer.tsx`、`package.json`/`tsconfig*`/`vite.config.ts`、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`。无新依赖、无构建配置改动、无新通道。
- **A1/A2/A3/B1/C1 未变**：`08-unchanged-a1-a2-a3-b1-c1.log`（C1 记录的 22 + 11 个候选逐字一致，`UNCHANGED_FAILURES=0`）。

## 3. 实现要点

### 3.1 `stores/directive-store.ts`

- 冻结载荷结构断言 + 窄化（`asDirectiveConfirmRequest`/`asDirectiveStateView`/`asDirectiveListReply`/`asDirectiveListView`），非法载荷不造对话框/列表；不使用 `any`。
- `directivesEnabled` 首帧 false；`ensureInitialRead(projectRoot, timeout=750ms)` 有界等待一次 `listDirectives`，成功应用双视图，超时/失败保持 false 并按普通消息发送；并发调用去重；项目切换重置。
- 确认/取消：`respondConfirm` 只发送请求快照 `prefill{action,scope,until}`，高危勾选才附 `acknowledged:true`；`confirmable:false`/高危未勾选本地也拒绝发送；过期回包本地收起（fail-closed，不伪造回执）；确认/取消/过期后清空卡内入口状态，避免陈旧“确认对话框已打开”提示。
- 列表/撤销：`refresh`/`revoke` 只走冻结通道；失败显示主进程错误文本；`ledgerErrors > 0` 由面板如实横幅。
- 项目切换 `clearProject(previousRoot,nextRoot)` 清空 pending/双视图/账本错误/面板/卡内入口；旧项目迟到 `directive:state` 按 `projectRoot` 丢弃，不置 `listLoaded`。
- 卡内入口：`cardDirectiveTarget` 只认卡载荷 `projectRoot/roleId/runtime`，三者必须非空、runtime 合法且与当前项目/引擎一致；缺失/非法/跨项目/跨引擎 ⇒ 不调用 sendSession。`submitFromCardEntry` 再次校验 + A1 命中；只经 `sendSession`，不写聊天气泡、不调用 shell/recovery 应答；成功清空输入并显示“确认对话框已打开”状态。
- 纯视图：`directiveDialogView`（原文/动作/范围/资源/期限/未识别/高危/撤销目标）、`directiveRowView`（状态/consumer/期限提示/可撤销）、`groupDirectiveList`（active 与 consumed→revoked→expired）、key 映射；全部可由 Node 直接导入。

### 3.2 `chat/directive-dialog.tsx` / `chat/directive-panel.tsx`

- 均为 `createPortal(..., document.body)`；对话框 z90、面板 z95；只引既有令牌。
- 对话框：默认焦点取消；Esc/×/取消 = `decision:"cancel"`；Tab/Esc capture 自陷并 `stopImmediatePropagation`；面板打开时让位；`confirmable:false` 显示 A3 不完整解析并禁用确认；高危未勾选禁用；decision 载荷的 `decisionGroupEnabled` 只读显示；domain/path 资源标注 A3 `main.directive.receipt.noConsumerSuffix`（仅记录、暂无消费者、不影响执行）；输入式撤销按 `rawText`/`unrecognized` 识别 `#d-<seq>` 并渲染 revoke 字段。
- 面板：审批/决策两个逻辑分区；active 与历史组；行显示动作/范围/资源/期限/状态/consumer/`(id, createdAt)`；仅 active 撤销；shell/recovery 待答徽标只读 `confirm-store`；不占 `shellCardSlot`、不进队列、不自动关闭/合并卡；错误与账本坏行如实显示。
- 初版用 `requestAnimationFrame` 聚焦，补充 Electron 探针发现隐藏窗口不触发（焦点留在 body）→ 改为 effect 内同步聚焦；探针复验通过。

### 3.3 `chat/ipc.ts` / `shell/Composer.tsx`

- `DirectiveBridge` 类型定义在 store、由 `ipc.ts` 重导出并在 `ipc.ts` 内做 `unknown` 五方法结构断言（`directiveBridgeOf`）；`lib/platform.ts` 不在写集，root `typecheck` 会把 store 的 type-only 依赖纳入且无 `@/` alias——类型放 store 是双端 typecheck 同时为 0 的折中，未弱化 `DesktopBridge`。
- 安装：设置项目根 → `attachBridge` → 订阅 `directive:state`（preload 缓存同步回放）/`directive:confirm-request`；项目切换清空渲染侧指令状态。
- Composer：发送前对 `el.value` 原文调用 A1 `parseDirectiveMarker`；仅 `directivesEnabled===true` 时跳过 `appendLocalUser`；未命中/近失配/能力位 false/旧桥按既有路径逐字不变。`res.directive` 不画气泡/不标角色错误/不失效会话；`directiveCancelled` 恢复草稿并如实提示；能力位未知竞态下主进程仍拦截时按 `clientMessageId` 移除刚画的乐观行；`res.directive` 成功后刷新列表。控件行新增 `#btn-directive-panel`（能力位 false 禁用并给 A3 说明）。

### 3.4 `shell/ConfirmCard.tsx`（AC-22，W-1=A）

- 三张 `.sc-overlay`（shell/升级/恢复）页脚各有一个默认折叠入口；默认焦点仍是拒绝/取消；入口 ID 前缀 `sc-`/`se-`/`rc-`。
- target 只取卡载荷 `{projectRoot,roleId,runtime}`，不再从 Composer/选中角色推断；缺失/非法/跨项目/跨引擎 ⇒ 入口禁用/提交拒绝、A3 行内错误、零 `sendSession`、零气泡、零落账、不回退当前选择。
- 输入只接受 A1 命中；提交走同一 `bridge.sendSession`（`{clientMessageId}`），不调用 `respondShell`/`respondEscalation`/`respondRecovery`；成功由主进程推 `directive:confirm-request`，对话框在 shell 卡之上打开，shell 卡保持待答。
- 卡内 Esc 只折叠输入区（document 陷阱先检查已展开入口）；`directive-store.overlayOpen` 时 ConfirmCard 的 Tab/Esc 陷阱直接 return；对话框/面板 capture 处理并 `stopImmediatePropagation`，关闭后焦点回到入口（或拒绝按钮）。
- 不占 `shellCardSlot`、不进一项目一卡队列、不改 `pendingCount/pendingRoles/judgingCount`、不合并/自动关闭 shell 卡。

### 3.5 `shell/shell.css`

- 只追加：`.directive-dialog-overlay`（fixed/inset 0/z-index 90）、`.directive-panel-overlay`（z-index 95）、卡片/字段/高危/行/待答徽标/卡内入口；`width: min(..., calc(100vw - 32px))`、`overflow-wrap:anywhere`；既有 `.sc-overlay{...z-index:60}` 与 `.sc-card` 语义未改；颜色只用既有令牌。

## 4. 验证与原始结果

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck`（开工前） | **exit 0** | `01a-typecheck-before.log` |
| 2 | `npm run typecheck:renderer`（开工前） | **exit 0** | `01b-typecheck-renderer-before.log` |
| 3 | `npm run typecheck`（写后） | **exit 0**（1.48s） | `01c-typecheck-after.log`、`01e-timing-typecheck.txt` |
| 4 | `npm run typecheck:renderer`（写后） | **exit 0**（0.68s） | `01d-typecheck-renderer-after.log`、`01f-timing-typecheck-renderer.txt` |
| 5 | `node --test --test-concurrency=1 "test/桌面UI/*.test.ts"` | **401 tests / 401 pass / 0 fail / 0 skipped / 0 todo，exit 0，5391.11ms**（B0 374 + 新增 27；新增确定性失败 0、新增 skip 0） | `02-tests-ui.log` |
| 6 | `npm run build:renderer` | **exit 0**，`built in 346ms`（Vite 8.3.4；仅既有 chunk-size/dynamic-import 警告） | `03-build-renderer.log` |
| 7 | `electron test/桌面UI/phase3b-electron-smoke.mjs ...`（**不修改**） | **exit 0；45/45 checks，0 failures，18 截图，0 console error，0 CSP** | `04-phase3b-smoke.log`、`phase3b-smoke/report.json` |
| 8 | `electron test/桌面UI/phase5a-electron-smoke.mjs ...`（**不修改**） | **exit 0；48/48 checks，0 failures，7 截图，0 console error，0 CSP** | `05-phase5a-smoke.log`、`phase5a-smoke/report.json` |
| 9 | 补充真实 Electron 探针（evidence-only，真实主→渲 IPC + 五方法 preload 替身） | **exit 0；20/20 checks，0 failures，3 截图，0 console error，0 CSP** | `06-c2-ui-probe.log`、`probe-run/report.json`、`01/02/03-*.png` |
| 10 | `node --test .../i18n-guard.test.ts` | **exit 1**，仅 `app/desktop/directive-input.ts:324 撤销`（C1 既有文件，非 C2；C2 新源码零 Han） | `07-i18n-guard.log` |

- **失败分类**：`test/桌面UI` 无新增确定性失败、无新增 skip；phase3b/phase5a 原样通过、零 diff；补充探针 0 失败。全仓 i18n guard 的 1 条为 C1 候选既有（C2 未触碰 `app/desktop/**`，按纪律不修）。
- **环境**：Node `v24.22.1`；npm `11.19.1`；Windows 11 Pro 10.0.26300（MINGW64/Git Bash）；Electron（项目依赖）；worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`；时区 Asia/Shanghai。
- **候选身份**：`12-candidate-hashes.txt`（行数 + SHA-256 + `git hash-object`）；`dist/` 为忽略产物、非候选。C2 证据脚本/日志非产品候选。

## 5. AC 映射（C2 证据；不替代 V1/D1/D2）

| AC | C2 证据 |
| --- | --- |
| AC-1（UI） | `directive-dialog.test.ts`：共享解析器/空正文视图；Composer 源码守卫「能力位 true 且命中才抑制」；补充探针命中后无“发给幕僚”气泡、卡内输入提交；近失配/未命中按普通发送由 `Composer` 既有路径 + 测试断言 |
| AC-3 | 对话框原文/动作/范围/资源/期限/未识别/`confirmable:false`；补充探针真实渲染与确认禁用 |
| AC-4 | `directiveCancelled` 恢复草稿；取消/失效零假回执；项目切换清空（store 测试 + 探针） |
| AC-5 | C2 不拼接回执；只渲染 C1 系统行（`delivery-note` 既有映射，未加分支）；对话框/面板不伪造“已记录/已撤销” |
| AC-10 | 零新增字段/零新渲染分支；既有 `sys-call sys-delivery-note` 系统行；D2 截图待补 |
| AC-11/12/16/24 | 面板 active/历史分组、状态/consumer、active 撤销、`ledgerErrors` 横幅、`(id, createdAt)`；store 测试 + 探针 |
| AC-13 | 高危原因只显示不重算；未勾选确认禁用；勾选后回包 `acknowledged:true`；探针实测 |
| AC-17 | 全部用户可见文案只经 A3 key；新源码零 Han；中英由 locale store 切换 |
| AC-22 | 三卡入口/默认折叠/默认焦点拒绝/Esc 只折叠输入区/overlay 让位；target 只取卡载荷严格 fail-closed；不占卡槽/队列/计数；面板徽标/不自动关闭；探针真实 IPC 20/20 + 3 截图 |
| AC-15/18/19/20/23 | 非 C2 主责：AC-15 无指令路径逐字不变（UI 401/401 + phase3b 45/45）；AC-18 本记录+证据+候选哈希；AC-19 基线 `4c3a6e4`，rebase 由统筹/E1；AC-20 无 `@边界`/英文别名/全角/新通道/新依赖（源码守卫 + diff）；AC-23 not applicable（O9 未选，只实现基础 `directivesEnabled`） |

## 6. 披露、交接与停止项

1. **`DirectiveBridge` 类型位置**：类型定义在 `stores/directive-store.ts`，`chat/ipc.ts` 重导出并在该文件内做结构断言。原因：root `npm run typecheck` 会跟随 test 的 type-only 依赖进入 store（无 `@/` alias）；若类型留在 `ipc.ts`，root typecheck 会把整份 `ipc.ts` 拉入 Node 配置并报 `@/` alias/DOM 错误。双端 typecheck 均 0，未弱化类型；C1 冻结的五个方法名/载荷未变。
2. **能力位未知竞态**：`ensureInitialRead` 有界 750ms；超时按 false 普通发送。若主进程在竞态中仍按指令拦截（`res.directive`），`Composer` 按文本移除刚画的乐观行（不伪造回执/不标角色错误）。正常 handshake 下不会走到该路径。
3. **旧 preload**：phase3b/4b/5a 夹具无五方法 ⇒ 面板/卡内入口禁用并显示 A3 能力不可用说明；普通聊天/既有 shell 卡行为不变（phase3b 45/45、phase5a 48/48 原样通过）。
4. **i18n guard 既有红**：`test/项目管理/shared/i18n-guard.test.ts` 仅报 C1 `app/desktop/directive-input.ts:324` 的 `撤销` 字面量；C2 按纪律不改 C1 文件。C2 新源码零 Han 由 `directive-dialog.test.ts` 断言。请 D1/E1/C1 属主收口。
5. **真实截图**：C2 补充探针生成 3 张（shell 卡+入口、确认对话框+高危、面板+待答徽标）；D2 仍应按 V1 要求拍摄命中→对话框→回执、AC-10 冲突系统行、面板撤销、项目切换等完整截图组。
6. **未运行**：全仓 T3 全量、桌面应用套件、双端等价 e2e、`uiux-v2` 等由 D1/E1 执行；C2 只记录本角色出口命令。
7. **无停止项**：未发现需要改 `app/desktop/**`/`src/**`/`lib/platform.ts`/扩写集/新依赖；A1/A3/C1 冻结契约够用。

## 7. 冻结声明（C2）

- **冻结对象**：本次 C2 渲染组件/入口/消费契约——`stores/directive-store.ts` 的 `DirectiveBridge`/视图/动作形状，`DirectiveDialog`/`DirectivePanel` 的 DOM 契约，`Composer` 回显抑制判据（A1 解析器 + `directivesEnabled===true` + `res.directive`/`directiveCancelled`），`ConfirmCard` 三卡入口与 target fail-closed 规则，以及 `shell.css` 的 z90/z95 层级。
- **消费规则**：只按 C1 冻结五通道/五方法/字段名与 A3 冻结 key；缺 key/字段变更须回本角色重跑 `test/桌面UI/*.test.ts` + `typecheck:renderer` + `build:renderer` + phase3b/phase5a/探针，并更新本证据目录；不硬编码、不自造 key、不新增通道/依赖。
- **性质**：冻结的是 C2 对下游的渲染契约，不是验收结论；D1/D2/E1/E2 可基于本候选复跑并汇总。

## 8. 证据清单

目录：`角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-C2-evidence/`

| 文件 | 说明 |
| --- | --- |
| `00a-git-status-start.txt` / `09-git-status-end.txt` | 开工/结束 `git status --porcelain -- src app test` |
| `00b-writeset-sha256-before.txt` / `11-writeset-sha256-after.txt` | 写集 SHA-256 写前/写后 |
| `01a..01f` | 双端 typecheck 写前/写后 + 计时 |
| `02-tests-ui.log` | `test/桌面UI/*.test.ts` 401/401 |
| `03-build-renderer.log` | `build:renderer` |
| `04-phase3b-smoke.log` + `phase3b-smoke/` | phase3b 45/45 + 18 截图（未修改） |
| `05-phase5a-smoke.log` + `phase5a-smoke/` | phase5a 48/48 + 7 截图（未修改） |
| `06-c2-ui-probe.log` + `probe-run/` | 补充真实 IPC 探针 20/20 + 3 截图 |
| `07-i18n-guard.log` | 全仓 i18n guard（仅 C1 既有项） |
| `08-unchanged-a1-a2-a3-b1-c1.log` | A1/A2/A3/B1/C1 候选逐字一致 |
| `10-diff-stat-renderer-ui.txt` | `git diff --stat -- app/renderer test/桌面UI` |
| `12-candidate-hashes.txt` | 9 个 C2 候选行数/SHA-256/`git hash-object` |
| `13-evidence-hashes.txt` | 本目录文件行数/SHA-256（最后生成） |
| `verify-unchanged.mjs` / `candidate-hashes.mjs` / `run-c2-ui-probe.mjs` / `c2-probe-preload.cjs` | 证据辅助脚本（非产品候选；不进入 `test/桌面UI`） |

**本文件状态：`implemented-unverified`；未验收、未 commit/push。**
