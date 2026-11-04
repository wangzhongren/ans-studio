---
id: trunk-amendment-desktop-ui-p1-proposal
type: change
title: 主干/冻结与版本变更申请模型 P1 桌面UI实现提案（U1，proposal-only，Rev 1）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
related: [trunk-amendment-model]
events:
  - date: "2026-11-04"
    kind: created
    summary: 写 U1 渲染层 proposal-only 实现提案（版本变更面板/stable 确认卡与续接记录/重构审计/主干面板无 drift/主干升级收窄/i18n 消费清单/旧文案迁移/九条注意点映射/澄清项/风险/截图点）；未改产品代码/测试/样式/其它角色文档
  - date: "2026-11-04"
    kind: revised
    summary: 按 PM 审核（368 行 / 2cb04cae…，needs revision）做 Rev 1：F1 acknowledgments 以 C1 对象数组为准且回传 acknowledged string[]；F2 stable workflow 卡为 app-owned stable-write 卡种（独立白名单、永不判断），VCA/逐项/trunk 卡为 decision；F10 提交改为只读指引（VCA/重构只经角色能力工具，无渲→主提交 IPC），主→渲状态推送仅 trunk:state；Q9 refactor 五状态（含 superseded）；Q11 stable 卡文本由 D1 用 C3 key 组装、U1 原样展示；i18n 需求清单由 114 调整为 99 并提交 C3 冻结；引用刷新为 B0 221 行/8c6272d5…、V1 350 行/3c40acad…、G2a 25 行/bfac5781…。未改产品代码/测试/样式/其它角色文档
---

# 主干/冻结与版本变更申请模型 P1 桌面UI实现提案（U1，Rev 1）

- **任务 / flowId / 档位**：`2026-11-04-trunk-amendment-model` / `trunk-amendment-model` / **T3**（P1.6 §8.1、V1 v1.1 §1.6）。
- **角色 / 节点**：桌面UI（渲染层 `app/renderer/`）；团队计划增量 §10.6 **Batch 4 / U1**（渲染 UI）。前置：D1 桌面接线冻结 + C3 i18n 契约冻结。
- **状态**：**`proposal-only, no code`**（Rev 1，按 PM 审核 `needs revision` 修订，待复审）。只写本文件；未改产品代码/测试/样式/i18n 目录/其它角色文档；未运行测试/typecheck/构建；未启动应用；未 commit/push；未接触客户；**不自行评审放行**。
- **一句话结论**：渲染层只做**展示与回传**——把 D1 已判定的 VCA/冻结/stable/重构/主干事实转写为面板、卡面与纯视图模型；客户侧移除 `#run-change` 与「重构」入口，新增「版本变更」与收窄的「主干升级」；**VCA/重构的提交只经发起角色的能力工具，渲染侧不提供提交表单、不新增渲→主提交 IPC**；主→渲状态推送只消费单一 `trunk:state`；stable 确认卡复用既有决策卡渲染（D1 用 C3 key 组装 path/base/target/diff 文本），主干面板展示 stable 确认/续接记录且**不再有 drift**；全部新文案消费 C3 冻结的 `ui.versionChange.*`/`ui.stableWrite.*`/`ui.refactor.*`/`ui.freeze.*`/`ui.trunk.*`，中英成对。

## 一、输入、基线与只读事实

### 1.1 基线与冻结输入（写本提案/Rev 1 前实测）

| 项 | 值 | 说明 |
| --- | --- | --- |
| 分支 / HEAD | `feat/trunk-amendment-model` / `89b1fb2751d74c607b3a17d1b522b88061943a14` | 与团队计划增量基线 `89b1fb2` 一致 |
| 产品/测试区 | `git status --porcelain -- src app test` **为空**（Rev 1 前实测；Rev 1 仅改本文件） | 本角色未改任何产品/测试文件 |
| P1.6 实施契约基线 | `docs/planning/2026-11-04_design_trunk-amendment-model.md` **1151 行 / SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`**（归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`） | §4.5.1 stable 确认即写/mini re-pin、§4.10 UI、§5.2.1、§7.2 AC-1–AC-36、§9 G1–G11 |
| V1 验收标准 | `docs/acceptance/trunk-amendment-model-criteria-v1.md` **350 行 / 归一化 SHA-256 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`**（审核裁决值；`75bf7a49…` 为旧快照，不再引用） | AC-1–AC-36；本提案引用 AC-9/10/17/18/20/23/30/33/34/36 等渲染侧相关项 |
| 团队计划增量 | `docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md` **468 行 / SHA-256 `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5`** | §10.3 桌面UI 无新 B、§10.5 注意点、§10.8 P1 任务书 |
| IA（stable 最终决定） | `docs/communication/2026-11-04_authorization_trunk-amendment-ia.md` **37 行 / SHA-256 `0bed4240687b3e532d2c2e9ef2374e16ed69042b7ea3fb36982ede136ee28573`** | 「确认即写 + mini re-pin」取代早期记录式；提交/合并/发布另授权 |
| 修订版闸门 0 | `docs/communication/2026-11-04_intent-change_freeze-and-refactor-ownership.md` **36 行 / `cda7c52d…`** | 重构=运营发起/应用调度层管理；冻结=客户确认才冻结；VCA 直交客户 |
| G2a 增补 | `docs/communication/2026-11-04_gate2-addendum_trunk-amendment-B5-B10.md` **25 行 / SHA-256 `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201`**（含 P1.6 + B-11 补注；旧 16 行/`d41665d3…` 为早期快照） | 桌面UI 无 B-x；不改边界 |
| B0 基线（测试最终版） | `角色卡/测试/docs/change/2026-11-04_trunk-amendment-B0-baseline.md` **221 行 / SHA-256 `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058`**（旧 173 行 / `27f9b94d…` 为含占位中间版，**不引用**） | `test/桌面UI/**` 55 文件 / 408 tests / 408 pass / 0 fail / 0 skip；`typecheck:renderer` exit 0；`build:renderer` exit 0 |
| PM 审核记录 | `角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md` **368 行 / SHA-256 `2cb04cae…`**，结论 `needs revision` | Rev 1 依据：F1/F2/F10；U1 Q3/Q9/Q11 裁决；§4.7/§4.8/§八 非阻断修订 |

### 1.2 本角色边界与授权

- Section 1（`角色卡/桌面UI/boundary.md`/`boundary.yaml`）为目录授权：`app/renderer/` 与 `test/桌面UI/`。本提案全部新增/修改均在该目录内，**不需要边界变更、不涉及 B-1..B-11**。
- 渲染进程不得直接接触 Node/文件系统；一切能力经 preload 白名单 IPC（通道与主进程实现属「桌面窗口」D1）。渲染进程内不得出现第二份边界判断；判定唯一来源是门禁引擎（经主进程）。
- U1 入口条件：D1 冻结（IPC/卡通道形状）+ C3 冻结（i18n key 集合）。**D1/C3 冻结前不写引用新 IPC/新 key 的渲染代码**；本提案不提前开工。

### 1.3 渲染层现状（只读核实；行号为 HEAD `89b1fb2` 快照，实施以符号名为准）

- **会话头旧入口**（`app/renderer/src/shell/ChatHeader.tsx`）：`#run-change` 按钮（`:260-273`）、忙碌/结果行状态（`:65-66`）、视图计算 `runChangeButtonView`（`:151-159`）、`requestRunChange` 调用（`:161-177`）、结果提示条 `#run-change-notice`（`:324-332`）、导入（`:20`）。**没有任何「重构」按钮**（P1.3 未实施；本特性是首次落地，须确保不引入）。
- **旧入口纯逻辑**（`app/renderer/src/chat/run-change-view.ts`）：`runChangeButtonView()`（`:38-64`）依赖 `ui.runChange.*`；`runChangeReplyMessage()`（`:67-85`）；`pinnedRunsOf()`（`:34-36`）。
- **抽屉**（`app/renderer/src/stores/drawer-store.ts:34`）：`DrawerTab = "card" | "work" | "pi" | "document" | "decisions" | "tasks" | null`；`fallbackTabId`（`:191-195`）。`app/renderer/src/shell/Drawer.tsx`：标题映射（`:70-80`）、内容分发（`:256-260`）、滚动恢复排除项（`:116`）。
- **决策卡渲染**（`app/renderer/src/chat/decision-dialog.ts`）：`DECISION_KINDS = {proposal, appointment, acceptance, intent-confirm, decision}`（`:58`）；`decisionPriority()`（`:115-123`，`risk:"high"`/`destructive` ⇒ 0，`appointment-write` ⇒ 1，决策类 ⇒ 2，其余 ⇒ 3）；`decisionView()`（`:135-180`）对非 `choice` 一律按 `confirm` 呈现；字段 `title/question/preview/detail/cardKind/paths/options/multiple/recommendedId/judgeNotice`。`DecisionDialog.tsx`：打开时**预选 recommended**（`:77-78`）；选项渲染（`:293-326`）；作答路径 `respondOperator`（`:148-154`、`:184`；`chat-store.ts:1945-1995`）。**当前无 `acknowledgments` 渲染/回传**。
- **决策面板**（`app/renderer/src/chat/DecisionCenterPanel.tsx`）：只读 `pendingOperator`/`queuedOperator` 与行模型；「处理」打开模态对话框（`:50-76`）。新卡种无需新面板即可进入。
- **项目状态**（`app/renderer/src/chat/ProjectStatePanel.tsx:206-208`）：`summary.pinned` 时显示 `ui.projectState.pinnedHint`；该 key 当前值仍指向「契约变更·重开 run」（zh `:1982`，en `:2250`）。
- **判批开关**（`app/renderer/src/shell/Composer.tsx:835-917`）：`#auto-approve-toggle`（approval 组）与 `#judge-decision-toggle`（decision 组），状态来自主进程 `shell:judge-state`/`decision:judge-state`；提示行 `ui.decisionDialog.switchHint`（`:799-804`）。
- **桥类型**（`app/renderer/src/lib/platform.ts`）：`DesktopBridge`（`:62`）以**可选方法**扩展（如 `requestRunChange?` `:76`、`getProjectState?` `:105`）；渲染侧以 `typeof bridge?.x === "function"` 判能力，缺失即禁用并给原因。
- **i18n**：渲染层经 `app/renderer/src/i18n/index.ts` 再导出 shared `translate`/`MessageKey`；key 不存在时 `MessageKey` 类型不成立。shared 目录当前**不存在** `ui.trunk.*`/`ui.versionChange.*`/`ui.stableWrite.*`/`ui.refactor.*`/`ui.freeze.*`（实测）；旧 key `ui.runChange.entry`（zh `:944`）、`ui.projectState.pinnedHint`（zh `:1982`）存在。
- **i18n 守卫**（`test/项目管理/shared/i18n.test.ts`）：分区计数固定、zh/en parity、英文零中文泄漏；`ui.projectState.*` 另有 62-key 使用守卫（`test/桌面UI/project-state.test.ts:37-`），新建 key 家族不得改写既有家族断言。

### 1.4 目标文件基线指纹（HEAD `89b1fb2` 工作区实测；Rev 1 前未改动）

| 文件 | `git hash-object`（blob） | SHA-256 |
| --- | --- | --- |
| `app/renderer/src/shell/ChatHeader.tsx` | `5463af798bac4bbd433006f43d0004dadca72d45` | `6e5e944a5869fcd4922bea2297c16ec90a6183895b13b81bf9a14812aba5c7d8` |
| `app/renderer/src/chat/run-change-view.ts` | `295549e7a3c7590a271f62bbab43ddb545a00b99` | `a109c0d68b05a8c84e5a5dc4cb4df83d5aac9db06e71dacd3aa39e596046a15d` |
| `app/renderer/src/shell/Drawer.tsx` | `71bee5e56e501b5d808338398d665fdcb82886d2` | `0afea46f2e4d3f2f9be735ed99a63576cceb03fee16fa208835021fa0f37143d` |
| `app/renderer/src/stores/drawer-store.ts` | `fd5478a4908a2475338a8dd2508a882d52ca3239` | `f87f5f559eeb1f474f4bb19060f98f6c325a4b1af871dbce4ed0f866f1cb4eb5` |
| `app/renderer/src/chat/DecisionDialog.tsx` | `1301ca0f3594a7f079d7fbaf352ec2473632f749` | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| `app/renderer/src/chat/decision-dialog.ts` | `1548f1d452ce84b2796687afe974e4280f2730fc` | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| `app/renderer/src/chat/decision-card.ts` | `9c1d36b4aa561981b48e58a0a6fe9aff6fba76c8` | `6ff3f120b5efcf4bfca8e299d7fbee5df4a4d85bbca8e8458736c85c00f11753` |
| `app/renderer/src/chat/ProjectStatePanel.tsx` | `4d7e09953f26b1f56e5006d881e2e9ebcf29ee52` | `a18bbceab8edf4c1cf78f49e62e3cc7b61ecfe28db13dbd285927849235e3a06` |
| `app/renderer/src/shell/Composer.tsx` | `69311cd201b7c832f1ba75ecd1178000f5383ab7` | `b64fefc913216df85c9e33265720d26b3467c3878bfd341be69651cb4fa2bdde` |
| `app/renderer/src/lib/platform.ts` | `29069f196d91eb61ce2c7c11492695c249ad44f0` | `604a0aef17628ac335d5a9e428695a2ba565aeae5d1e60774d3b426360e7d7fe` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `c64dfe1fbff6752a8e533cb01800d9ea64b31b81` | `2e3413767a2d7593ff4fd5ed0b533bf00a7eb9f8f8ffbceacb9b0384f2ebeac5` |
| `src/common/shared/i18n/messages/en-US.ts` | `6d55039d6287d99bce0d1b30bf17f82fcf72aa14` | `9e3803f711ebe632a238eb2f3cb48f14764441ab7aa308cbe7b993bf5635b1fa` |
| `test/桌面UI/run-change-view.test.ts` | `f7bd58fe3525417795e374de7c21862c8e22bb17` | `7d06c615c014cb72aeae810cba177ba0c53a1edfc59890b1afa2a07e301a7ff9` |
| `test/桌面UI/project-state.test.ts` | `fda47ca16f756a25d696ad68369bf754a0334e37` | `060f2d94d765d3a67b4386729ce618cf7d5318cc2e0b0218ff30da540c1c6e82` |

## 二、提案结论与范围

**结论**：U1 交付一个「主干与版本变更」抽屉面板（三个分段：版本变更 / 主干 / 重构）+ 两个会话头入口（版本变更、收窄的主干升级）+ 纯视图模型（`version-change-view.ts`、`trunk-view.ts`）+ 决策卡 `acknowledgments` 渲染；移除 `#run-change` 与会话头旧状态，不引入第二套按钮状态源、不引入 drift、不实现 IPC、不做任何边界/哈希/权限判定。**提交动作不在渲染层**：VCA 提交只经发起角色（产品/策划）的能力工具；重构申请经运营会话能力（或 D1 校验活动会话后的受控通道）；渲染侧只显示状态与入口指引。

**In scope（本提案覆盖）**

1. `ChatHeader`：移除 `#run-change` 及旧结果提示；新增「版本变更」与「主干升级（仅紧急/恢复）」入口与禁用原因；客户侧无「重构」按钮。
2. 新增 `VersionChangePanel`（待批/历史 VCA、冻结/迁移状态、通道不可用状态、**只读提交指引**、卡面事实展示、`submitted` 重发卡）。
3. 新增 `RefactorPanel`（运营侧提交指引、客户只读审计；无批准按钮、无渲染侧自报身份表单）。
4. 新增 `TrunkPanels`（当前主干、冻结清单、stable 确认/续接记录、升级历史、紧急/恢复入口；**无 drift 区**）。
5. `version-change-view.ts`/`trunk-view.ts` 纯视图逻辑（入口矩阵、状态/标签映射、禁用原因、行视图；无 DOM/IPC/文件系统）。
6. 决策卡 `acknowledgments`（C1 对象数组）渲染与 `acknowledged` 回传；VCA/逐项/trunk 卡（`cardKind:"decision"`）与 stable workflow 卡（app-owned `stable-write`）经既有 `DecisionDialog` 渲染。
7. i18n 消费清单（提交 C3 冻结；本角色不写 shared 目录）与旧文案迁移的渲染侧动作。
8. `test/桌面UI/` 新增/更新测试；`typecheck:renderer` + `build:renderer`；T2 截图点。

**Out of scope（明确不做）**

- 不实现 IPC/preload/主进程/会话接线（`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`package.json`/构建配置），不写 `src/**`、shared i18n 目录、其它角色测试。
- **不新增渲→主提交 IPC（无 `version-change:submit`）**；不渲染 VCA/重构提交表单；不接受渲染侧自报角色身份。
- 不判定「能不能写/能不能批准/是否冻结/目标是否合法/哈希是否一致」；不读 `.ans/`、不重算哈希、不解析签名/许可。
- 不新增角色/权限/写权；不改边界/三道闸门/验收规则。
- 不提供文件级 diff 查看器（O7 未选；diff 只显示 D1 给的有界文本）。
- 不做任何自动选择/代答/预提交；不改变判断器/委托/`替我决策`行为（D1 冻结排除谓词）。
- 不展示 drift；不恢复记录式 drift 文案/字段。

## 三、入口矩阵与信息架构

### 3.1 入口矩阵（按 `governanceFunction` 派生，不硬编码角色 id）

> 角色显示名沿既有 `findRole`/`roleDisplayName`（按 `governanceFunction` 派生，`role-view.ts:62-95`）；入口可见性同法派生（`schedule`=运营、`product`=产品、`proposal`=策划、`chief`=幕僚、`verification`=质检；项目自定义角色无 `governanceFunction` ⇒ 不显示角色侧入口，不按 id 猜测）。

| 侧 | 入口 | 行为 | 可见/禁用 |
| --- | --- | --- | --- |
| 客户（通用） | 会话头「版本变更」 | 打开抽屉「主干与版本变更」面板的「版本变更」分段：待批/历史 VCA、冻结/迁移状态、提交指引 | 始终可见；桥缺 `version-change` 能力 ⇒ 禁用 + `ui.versionChange.disabledUnavailable` |
| 客户（通用） | 会话头「主干升级」 | 打开同一面板的「主干」分段（紧急/恢复区） | 无主干/桥缺失/状态读取失败 ⇒ 禁用并给原因（§4.4） |
| 客户（通用） | 面板「重构」分段 | 只读审计列表 + 提交指引（AC-20） | 只读；无批准/关闭按钮、无渲染侧提交表单 |
| 运营（schedule） | 面板「重构」分段内指引 | 说明「重构申请在运营会话中经能力工具提交」；面板只读显示状态 | 仅 `governanceFunction === "schedule"` 显示指引；**不提供渲→主申请表单**（身份由会话/主进程保证） |
| 产品（product） | 面板「版本变更」分段内指引 | 说明「版本升级在发起角色会话中提交」；kind 由能力工具固定 | 仅 `governanceFunction === "product"` 显示指引；**无表单/无渲→主提交** |
| 策划（proposal） | 同上 | 说明「修正案在发起角色会话中提交」；kind 由能力工具固定 | 仅 `governanceFunction === "proposal"` 显示指引；**无表单** |
| 幕僚（chief） | 无专属入口 | 只收通知/系统行（主进程）；渲染侧不提供审批/转发按钮 | — |

> 客户侧**不存在**「重构」按钮（AC-9）；本提案不新增任何客户可点的重构/批准控件。VCA 批准/拒绝**只在决策卡**（`DecisionDialog`）完成，面板只提供「处理」跳转，避免第二作答通道。产品/策划提交入口的 AC-9 证据按「能力工具注入 + 面板可见指引」呈现（审核 §4.7）。

### 3.2 `ChatHeader.tsx` 改动

- **移除**：`#run-change` 按钮块（`:260-273`）、`runChangeBusy`/`runChangeNotice` 状态（`:65-66`）、`runChangeButtonView`/`requestRunChange`（`:151-177`）、`#run-change-notice`（`:324-332`）、`run-change-view` 导入（`:20`）与 `bridge.requestRunChange` 使用。**不保留隐藏按钮**（AC-17：UI 入口移除）。
- **新增** `#version-change`（label `ui.versionChange.entry`）：`onClick` → 打开面板「版本变更」分段（内部复用既有 `openDrawerTab` 语义）；title/aria 用 `versionChangeEntryView(...)` 结果（可用给用法提示、禁用给原因）。
- **新增** `#trunk-upgrade`（label `ui.trunk.entry`）：打开面板「主干」分段的紧急/恢复区；禁用原因由 `trunkUpgradeEntryView(...)`（§五）给出；`ui.trunk.entryHint` 说明「仅紧急/恢复」。
- **可选（UIUX 确认后）**：`#version-change` 上显示待批 VCA 计数角标（数据只来自 D1 快照的 `pendingCount`，不本地统计卡片）。
- 其余按钮/角标（工作、决策、任务、角色资料、引擎选择）**零变化**。
- 旧 `#run-change` 的跨角色影响：`test/桌面应用/e2e/main.mjs:630-633`、`test/桌面应用/run-change-*.test.ts` 属「桌面窗口」D1 写集，D1 需同步更新（本提案只提醒，不改）。

### 3.3 抽屉与面板骨架

- `DrawerTab` 增加 `"trunk-version"`（`drawer-store.ts:34`）；`fallbackTabId` 补该值（返回 `#version-change` 触发元素的回退策略）；`Drawer.tsx` 标题映射 `ui.trunk.panelTitle`，内容分发 `<TrunkVersionPanel />`。
- **面板形态（审核 Q8 已采纳）**：单抽屉 tab + 三分段（`segment.versionChange`/`segment.trunk`/`segment.refactor`），与 P1.6「主干与版本变更面板」语义一致；两个会话头入口分别打开对应分段（`#trunk-upgrade` 额外滚动/聚焦紧急区）。
- 分段状态放新增 `stores/version-change-store.ts`（`segment`、快照、`issue`、`loading`、`refresh()`），不塞进 `drawer-store` 的阅读态；`Drawer` 的滚动恢复排除项（`:116`）需把 `"trunk-version"` 视为不按角色阅读态恢复（或明确纳入，实施时按现有 a11y/滚动语义二选一并测试）。
- 面板三件套：`TrunkPanels.tsx`（壳 + 主干分段）、`VersionChangePanel.tsx`、`RefactorPanel.tsx`，均只渲染视图模型；分段切换用 `role="tablist"`/`aria-selected`，焦点顺序与 Esc 行为沿用抽屉（不新增模态）。

### 3.4 数据装载与刷新（只消费 D1 冻结 IPC；单一推送源）

- **D1 冻结候选 IPC**（审核 §4.7；U1 按 D1 冻结名消费，不自造捷径）：`version-change:list`、`version-change:present`（对 `submitted` 重发卡，幂等）、`stable-write:list`、`refactor:list`、`doc-freeze:list`、`trunk:state`（主→渲推送）、`trunk:list`、`trunk:upgrade-request`、`trunk:upgrade-confirm`（仅绑定 previewId 的客户二次确认）、`trunk:refreeze-request`、`trunk:abandon-upgrade`、`trunk:recover-request`。**没有 `version-change:submit`**；`refactor:request` 仅在 D1 冻结为「活动 convener 会话校验」形式时由 U1 消费（默认不用，见 §4.3）。
- **状态推送单一来源**：只订阅 `trunk:state`（主→渲）；**不设** `version-change:state`/`stable-write:state`/`refactor:state`。面板打开时拉取快照 + 手动「刷新」+ `trunk:state` 到达时刷新相关快照；**不轮询**。若 U1 后续论证确需独立推送，须在 D1 冻结点统一增改（不双状态源），本提案不预留第二来源。
- 方法缺失（旧 preload）⇒ 能力禁用并给固定原因，不抛错、不假装可用。
- 快照带 `schema`/版本号；渲染侧防御解析（`asRecord` + 字段白名单，非法返回 null ⇒ `schemaUnsupported`，不猜）。
- 冻结状态 `corrupt/unavailable` ⇒ 面板顶部常驻 fail-closed 提示（`ui.freeze.failClosed`），所有 stable/VCA 相关操作入口保持禁用；不提供本地恢复/重建按钮（恢复属 D1/客户确认）。
- 所有动作回执（`version-change:present`/trunk 请求/恢复等）只显示 D1 返回文本/错误原文；UI 不做二次解释或重试自动化。

## 四、面板与卡面规格

### 4.1 `VersionChangePanel.tsx`（版本变更）

自上而下：

1. **状态条**：主干版本（`ui.trunk.version` / `ui.trunk.versionNone`）、冻结注册表状态（ready / unavailable / corrupt-fail-closed）、客户卡通道状态（D1 事实；不可用显示 `ui.versionChange.noChannel` 说明，不伪造批准）。
2. **待批**（`status === "submitted"` / `approved` 且可重试）：每行显示 kind（`ui.versionChange.kind.detailAmendment|versionUpgrade`）、发起者（显示名）、flowId、targets（`path · v{version} · {hash}`，超 3 项折叠 `ui.versionChange.targetMore`）、status、摘要、提交哈希；`diff` 只在 D1 提供有界文本时以 `<pre>` 原样展示（`ui.versionChange.diff`），**不做文件级 diff 解析**；语义说明按 kind 固定展示（`semantics.versionUpgrade`/`semantics.detailAmendment`，对应 AC-18/F43 与 P1.6 §4.4 卡面语义）。
3. **行操作**：`ui.versionChange.openCard` → `useDrawerStore.openTab("decisions")`；面板不直接回答。无可用通道时行内显示 `ui.versionChange.noChannel`，并提供 `ui.versionChange.presentAction`（调用 `version-change:present` 重发卡；回执如实显示；不伪造批准）。
4. **历史**（approved/rejected/applied/superseded）：kind/flow/status/decisionId·时间/resultTrunkVersion/journalId（短）。
5. **冻结清单**：`path · v{version} · {hash} · {reason}`；迁移标注 `ui.freeze.migratedLegacy`/`migratedDraft`；状态 `ui.freeze.status.frozen|draft`；只读。
6. **提交指引（只读，F10）**：产品/策划各自显示 `ui.versionChange.submitGuidance`（「提交在发起角色会话中经能力工具完成；本面板只显示状态与入口说明」）；如 D1 快照提供能力可用性事实（如 `submitCapabilityAvailable`），只照实显示可用/不可用，**不渲染任何表单字段、提交按钮或渲→主提交调用**。kind/target 范围（version-upgrade 仅 contract/roster；detail 可含 execution；workflow/boundary/product-intent 不在 VCA）由发起能力与 S2 校验负责；面板只在事实行中展示 D1 给出的 kind/targets。

> 渲染侧不得显示「覆盖/冻结漂移」「允许继续」类旧语义；不得出现 drift 入口。

### 4.2 stable 确认卡与「stable 续接记录」（无 drift）

**stable 写入确认卡（workflow；AC-33/AC-34；审核 F2/Q11）**

- 卡为 app-owned 卡种 `stable-write`（C1 定义；**不进入 `GOVERNANCE_CARD_GROUP`，永不判断/永不代选**）；D1 负责发出与结构校验（恰一推荐项/≥2 选项/path/base/target 字段齐全）。
- 渲染侧**复用既有 `DecisionDialog` 通用渲染**：`request.preview`（`<pre>`，保留换行）与 `request.detail` 原样显示；**D1 用 C3 冻结的 `ui.stableWrite.confirm.*` key 组装** path / baseSha256 / targetSha256 / diff preview / 语义说明，U1 **原样展示、不拼装第二套**。
- 卡面要求：标题含目标路径；`base/target` 哈希**完整、不截断**（等宽容器）；diff 有界；语义句固定为「批准后立即写入并刷新主干快照（不升主干版本）；拒绝则不写入」（C3 key 文案，D1 组装）。
- 选项由 D1 冻结（建议 `approve-stable-write`/`reject-stable-write`，recommended = reject）；渲染侧沿用既有「预选 recommended」行为，不提供第三个选项、不加自动提交。role-card/boundary 继续走既有 appointment-write 卡（语义不变）；渲染侧**不改** `ConfirmCard.tsx`/appointment-write 渲染路径，只在 mini re-pin 记录中展示结果。

**stable 续接记录（AC-36；`TrunkPanels` 内）**

- 每条记录：`path`、kind（workflow/role-card/boundary）、`decisionId`/`confirmationId`、`oldSha → newSha`（完整等宽）、`time`；来源为 D1 快照的 `trunk.state(op:"stable-repinned")` 投影，渲染侧不重算哈希、不比对文件。
- 顶部固定说明：`ui.stableWrite.record.unchangedVersion`（stable 确认不升 trunkVersion）与 `ui.stableWrite.confirm.noDrift`（不再显示漂移）。
- **不展示 drift**：不渲染 drift 区块、不显示「drift/drifted/漂移」状态值；若 D1 快照中仍有 `drift` 字段（旧数据），渲染侧**忽略**并在提案评审记录中报告（不显示、不迁移为别种状态）。i18n 守卫扫描渲染源码，新增文案不含 drift 语义（`ui.stableWrite.confirm.noDrift` 为唯一「不再显示漂移」解释句，C3 复核措辞）。

### 4.3 `RefactorPanel.tsx`（重构）

- **审计列表（客户只读，AC-20）**：requestId、title、status（requested/accepted/closed/rejected/**superseded**，审核 Q9 五值）、scope（modules/paths/roles）、reason 摘要、时间；固定说明 `ui.refactor.auditOnly`（应用调度层机械管理、不产生主干版本、客户只读）。**无批准/拒绝/关闭按钮**，不阻塞 VCA 展示。
- **运营提交指引（只读，F10）**：仅 `governanceFunction === "schedule"` 显示 `ui.refactor.submitGuidance`（「重构申请在运营会话中经能力工具提交；本面板只读显示审计」）。**不提供渲→主自报表单**；**不接受渲染侧自报角色身份**。
- 若 D1 在冻结点提供「活动 convener 会话校验」的 `refactor:request` 并明确允许 U1 触发，U1 只按冻结形状加一个**不含身份字段**的申请动作（title/reason/scope 由冻结载荷定义，身份由 D1 校验）；默认本提案不实现该动作（见 Q1/§十二）。越界/拒绝错误原文显示；渲染侧不判断 scope 是否越界。

### 4.4 `TrunkPanels.tsx`（主干；无 drift，升级收窄）

- **当前主干**：`ui.trunk.version`；无主干显示 `ui.trunk.versionNone` + bootstrap 说明（若 D1 快照标 `bootstrap`，只显示事实，不引导本地操作）。
- **stable 文件快照**：workflow/role-card/boundary 的当前哈希与最近确认记录（§4.2）；不再有 drift 状态。
- **冻结清单**：引用 §4.1 的冻结视图（同一 `FrozenDocView`，避免第二实现）。
- **升级历史**：紧急/恢复历史（若 D1 提供）；空态 `ui.trunk.history.empty`。
- **紧急/恢复区（收窄，AC-30/F11）**：
  - 固定说明 `ui.trunk.emergencyOnly`：仅紧急/恢复；不能修改版本化文档或常规 stable 内容；常规 stable 走确认即写、版本化走 VCA。
  - 入口 `#trunk-upgrade` 仅在 D1 快照报告「有主干 + 桥能力」时可用；否则按 `ui.trunk.upgrade.disabledNoTrunk|disabledUnavailable|disabledUnknown` 禁用。
  - 「请求升级」表单只收 reason（必填；scope 若 D1 冻结则照冻结）；提交调 `trunk:upgrade-request`，**高危二次确认由 D1 客户 UI/卡完成**（`trunk:upgrade-confirm` 仅绑定已生成 preview（previewId）的二次确认，或 decision 卡通道；二选一由 D1 冻结点明确，U1 遵守）。渲染侧**不自建确认对话框、不提供渲→主批准捷径**；提交回执只显示 `ui.trunk.upgrade.success`（「已提交，请在确认中二次确认」），不显示为已升级。judge/委托/指令不得触发确认路径（D1 保证）。
  - `trunk:refreeze-request`/`trunk:abandon-upgrade`/`trunk:recover-request` 若 D1 冻结为渲→主动作，U1 可按冻结形状提供按钮（完成升级并重新冻结 / 放弃升级 / 恢复）；确认/审计由 D1 处理；渲染侧只显示回执与刷新后快照。
  - 升级/恢复成功后只按 D1 快照刷新显示；渲染侧不推断新版本号。
- **恢复**：只显示 D1 提供的恢复状态/说明；不提供本地重建/解冻按钮（恢复需客户确认，属 D1/服务层）。

### 4.5 detail 逐项确认卡（`acknowledgments`；审核 F1/§4.10-5）

- **形状以 C1 为准**：`CustomerInputAcknowledgement[]`（`{id, label, required}` 对象数组）；D1 透传对象数组并在 `respondUnsafe` 按 `required` 结算；客户回传 `CustomerInputOutcome.acknowledged: string[]`（已勾选 id 列表）。**不采用 `string[]` 的旧表述**。
- `decision-dialog.ts` 视图层防御读取：非数组/空 id/非字符串 label 的项丢弃；视图增加 `acknowledgments: {id,label,required}[]` 与已勾选集合。
- `DecisionDialog.tsx`：在选项区上方渲染必选勾选项（`checkbox`，逐项独立），必选项未勾选时**禁用正向提交**（`canSubmit` 追加条件）；回传 payload 携带 `acknowledged` 数组（字段名/位置以 C1/D1 冻结为准，按审核默认 `acknowledged: string[]`）。客户主权：不预勾选、不默认全选。
- 只在 `acknowledgments` 存在时启用该区块；既有卡种行为零变化。

### 4.6 `DecisionDialog`/`decision-card` 兼容（审核 F2/Q3）

- **VCA 卡（含 detail 逐项/最终/trunk 逐项）复用 `cardKind:"decision"` + `application:true` + 真实 `flowId`**：既有 `DECISION_KINDS` 已含 `decision`，渲染侧无需新 token；`decision-card.ts` 的现有特殊卡面按 `cardKind === "decision"` 生效（既有行为）。
- **stable workflow 卡为 app-owned `stable-write`**：由 C1 定义、D1 发出；**不进入 `GOVERNANCE_CARD_GROUP`**（永不判断；该分组属 C1/C2a，U1 不碰）。U1 在 D1 冻结点把 `stable-write` 加入渲染侧 `DECISION_KINDS`（**一行改动**，仅用于对话框优先级/破坏性样式；建议加入），不参与任何判断器/代选。
- 优先级：VCA/trunk 卡由 D1 载荷决定 `risk`（`decisionPriority` 既有逻辑，risk high ⇒ 0）；stable-write 加入 `DECISION_KINDS` 后为 priority 2；`appointment-write` 既有优先级/破坏性语义不变。
- 预选 recommended 行为保留：VCA/stable 卡 recommended 必须为 **reject**（P1.6 §4.4 安全项）；若 D1 载荷把 approve 标 recommended，渲染侧如实预选但该问题按契约缺陷回报（不在渲染侧改写推荐）。
- 不作答通道：面板只跳转「决策」；不在面板内直接 send。

## 五、纯逻辑模块（`version-change-view.ts` / `trunk-view.ts`）

两模块只接收 D1 快照/回执的**事实形状**并输出视图模型；无 DOM、无 IPC、无文件系统、无哈希重算、无权限判断；对未知形状返回 null/空视图并给 `schemaUnsupported`/降级原因。函数（设计候选，实施可微调命名，语义不变）：

**`version-change-view.ts`**

- `asVersionChangeSnapshotView(raw)`：防御解析 `schema/trunkVersion/freezeState/channelState/pending/history/frozenDocs/pendingCount`；非法 ⇒ null。
- `versionChangeRowView(raw, locale)`：kind/status 标签、发起者显示名、targets 行（完整值来自 D1，渲染按固定长度截断**仅显示**、不用于核对）、语义 key、可跳转标记、no-channel 标记、可重发标记、decisionId/time/resultTrunkVersion/journalId。
- `versionChangeEntryView({ bridgeAvailable, snapshot, snapshotError })`：会话头入口可见/可用/原因。
- `vcaSubmitGuidanceView({ governanceFunction, snapshot })`：产品/策划只读提交指引（可见性/说明 key/能力可用性事实）；**无表单字段**。
- `refactorGuidanceView({ governanceFunction })` 与 `refactorRowView(...)`：运营指引 + 审计行（status 五值映射）。
- `stableRecordView(record, locale)`：path/kind/decisionId/oldSha/newSha/time 行；无 drift 字段。
- `freezeDocView(doc, locale)`：冻结/草稿/迁移标注/reason 标签。
- `trunkUpgradeReceiptView(reply, locale)`：只输出「已提交，待确认」/失败；绝不输出「已升级」。
- 常量：`VCA_STATUS_KEYS`、`VCA_KIND_KEYS`、`REFACTOR_STATUS_KEYS`（五值）、`FREEZE_REASON_KEYS`（九类）（`Record<enum, MessageKey>`，编译期强制穷尽；未知枚举值 ⇒ 不显示或 generic 标签，不猜）。

**`trunk-view.ts`**

- `trunkPanelView(raw, locale)`：版本标签/分段计数/空态。
- `trunkUpgradeEntryView({ bridgeAvailable, hasTrunk, snapshotError, recoveryAvailable })`：visible/enabled/disabledReasonKey/title。
- `stableRecordGroupView(records)`：按 kind 分组、空态、版本不变提示。
- 不导出任何 hash 校验、路径判定、范围校验函数。

## 六、i18n 消费清单（提交 C3 冻结；渲染侧不写 shared 目录）

### 6.1 约定

- key 由项目管理在 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 一次性新增并冻结；渲染侧只消费（`MessageKey` 编译期校验）。本节清单是渲染侧的**需求清单**（审核 §4.8），最终 key 名/文案/计数以 C3 冻结为准；新增/改名由 C3 记录，渲染侧不自行加 key、不硬编码中文。
- 中英成对、`ui.*` 前缀、`{param}` 插值；禁止在渲染源码出现中文/英文可见字面量。
- `ui.trunk.*` 未在团队计划增量 §4.1 C3 行列出，但 P1.6 trunk 面板需要，属 **C3 目录内 key 家族扩展**，由 C3 在提案/实施记录披露、E1 引用（审核 §4.8/§八-15）。
- 既有 `ui.versionDecision.*`/`ui.run.change.*`/`ui.runChange.*` 保留（低层 run-change/版本决策保留，G11）；只做文案值迁移。
- **Rev 1 计数说明**：F10 表单改只读后，移除原 `ui.versionChange.submit.*` 11 key 与 `ui.refactor.submit.*` 8 key，新增 2 条提交指引 key、`ui.refactor.status.superseded` 与 `ui.versionChange.presentAction`；需求清单由 114 调整为 **99 key**（versionChange 34 / stableWrite 12 / refactor 14 / freeze 17 / trunk 22）。最终以 C3 冻结集合为准。

### 6.2 建议 key 清单（中英成对）

**`ui.versionChange.*`（VCA）**

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.versionChange.entry` | 版本变更 | Version changes |
| `ui.versionChange.entryHint` | 查看待批与历史版本变更申请；批准/拒绝在决策卡完成。 | Review pending and past version-change applications; approve or reject them on the decision card. |
| `ui.versionChange.disabledUnavailable` | 当前桌面桥未提供版本变更入口（重启应用后重试）。 | The desktop bridge does not provide version changes yet (restart the app and retry). |
| `ui.versionChange.disabledUnknown` | 无法读取版本变更状态（{detail}）；请刷新后重试。 | Cannot read version-change state ({detail}); refresh and retry. |
| `ui.versionChange.loading` | 正在读取版本变更… | Loading version changes… |
| `ui.versionChange.empty` | 暂无版本变更申请。 | No version-change applications. |
| `ui.versionChange.loadError` | 版本变更读取失败：{detail} | Failed to load version changes: {detail} |
| `ui.versionChange.schemaUnsupported` | 版本变更数据版本不受支持。 | Unsupported version-change data schema. |
| `ui.versionChange.tabPending` | 待批 | Pending |
| `ui.versionChange.tabHistory` | 历史 | History |
| `ui.versionChange.tabFrozen` | 冻结清单 | Frozen documents |
| `ui.versionChange.kind.detailAmendment` | 修正案 | Detail amendment |
| `ui.versionChange.kind.versionUpgrade` | 版本升级 | Version upgrade |
| `ui.versionChange.initiator` | 发起者：{role} | Initiator: {role} |
| `ui.versionChange.flow` | 流程：{flowId} | Flow: {flowId} |
| `ui.versionChange.status.draft` | 草稿 | Draft |
| `ui.versionChange.status.submitted` | 待确认 | Submitted |
| `ui.versionChange.status.approved` | 已批准（执行中） | Approved (applying) |
| `ui.versionChange.status.rejected` | 已拒绝 | Rejected |
| `ui.versionChange.status.applied` | 已生效 | Applied |
| `ui.versionChange.status.superseded` | 已被取代 | Superseded |
| `ui.versionChange.targetLine` | {path} · v{version} · {hash} | {path} · v{version} · {hash} |
| `ui.versionChange.targetMore` | 另有 {count} 项 | {count} more targets |
| `ui.versionChange.summary` | 摘要：{summary} | Summary: {summary} |
| `ui.versionChange.hash` | 提交哈希：{hash} | Submitted hash: {hash} |
| `ui.versionChange.diff` | 差异预览 | Diff preview |
| `ui.versionChange.semantics.versionUpgrade` | 批准 = 最终内容确认；批准后冻结目标并切换主干。 | Approval is the final content confirmation; approved targets are frozen and the trunk switches. |
| `ui.versionChange.semantics.detailAmendment` | 批准 = 提交/冻结门槛；逐项确认才是内容门槛。 | Approval is the submission/freeze gate; item confirmations are the content gate. |
| `ui.versionChange.openCard` | 在决策面板处理 | Handle in Decisions |
| `ui.versionChange.presentAction` | 重新发卡 | Resend card |
| `ui.versionChange.noChannel` | 申请已记录；未找到客户卡通道，请打开客户会话后重试。 | The application is recorded; no customer card channel is available. Open a customer session and retry. |
| `ui.versionChange.decision` | 决定：{decisionId} · {time} | Decision: {decisionId} · {time} |
| `ui.versionChange.resultTrunk` | 结果主干：t{version} | Resulting trunk: t{version} |
| `ui.versionChange.submitGuidance` | 提交在发起角色（产品/策划）的会话中经能力工具完成；本面板只显示状态与入口说明。 | Submission happens in the initiator role's session (product/planning) via its capability tool; this panel only shows status and entry guidance. |

**`ui.stableWrite.*`（stable 确认与续接记录；`confirm.*` 由 D1 组装卡面、U1 原样展示）**

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.stableWrite.record.section` | stable 文件确认/续接 | Stable-file confirmations |
| `ui.stableWrite.record.line` | {path} · {decisionId} · {oldSha} → {newSha} · {time} | {path} · {decisionId} · {oldSha} → {newSha} · {time} |
| `ui.stableWrite.record.empty` | 暂无 stable 文件确认记录。 | No stable-file confirmations yet. |
| `ui.stableWrite.record.unchangedVersion` | stable 确认不升主干版本。 | Stable confirmations do not raise the trunk version. |
| `ui.stableWrite.kind.workflow` | workflow | Workflow |
| `ui.stableWrite.kind.roleCard` | 角色卡 | Role card |
| `ui.stableWrite.kind.boundary` | 边界 | Boundary |
| `ui.stableWrite.confirm.baseHash` | 写入前哈希（base）：{hash} | Base hash: {hash} |
| `ui.stableWrite.confirm.targetHash` | 写入后哈希（target）：{hash} | Target hash: {hash} |
| `ui.stableWrite.confirm.diff` | 变更预览 | Diff preview |
| `ui.stableWrite.confirm.semantics` | 批准后立即写入并刷新主干快照（不升主干版本）；拒绝则不写入。 | Approval writes immediately and refreshes the trunk snapshot (no trunk-version bump); rejection writes nothing. |
| `ui.stableWrite.confirm.noDrift` | stable 文件确认后自动续接，不再显示漂移。 | Stable files continue automatically after confirmation; drift is no longer displayed. |

**`ui.refactor.*`（重构）**

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.refactor.entry` | 重构 | Refactors |
| `ui.refactor.panelTitle` | 重构审计 | Refactor audit |
| `ui.refactor.auditOnly` | 只读：重构由应用调度层机械管理，不产生主干版本，客户不批准。 | Read-only: refactors are managed mechanically by the application scheduler, create no trunk version, and need no customer approval. |
| `ui.refactor.status.requested` | 已申请 | Requested |
| `ui.refactor.status.accepted` | 已接受 | Accepted |
| `ui.refactor.status.closed` | 已完成 | Closed |
| `ui.refactor.status.rejected` | 已拒绝 | Rejected |
| `ui.refactor.status.superseded` | 已被取代 | Superseded |
| `ui.refactor.empty` | 暂无重构记录。 | No refactor records. |
| `ui.refactor.summary` | 说明：{reason} | Reason: {reason} |
| `ui.refactor.scope` | 范围：{paths} | Scope: {paths} |
| `ui.refactor.boundaryHint` | 涉及契约/边界/stable 文件时会被拒绝并转版本变更申请。 | Requests touching contracts, boundaries or stable files are rejected and redirected to a version-change application. |
| `ui.refactor.disabledUnavailable` | 当前桌面桥未提供重构审计（重启应用后重试）。 | The desktop bridge does not provide refactor audit (restart the app and retry). |
| `ui.refactor.submitGuidance` | 重构申请在运营会话中经能力工具提交；本面板只读显示审计。 | Refactor requests are submitted in the operator session via its capability tool; this panel shows the audit read-only. |

**`ui.freeze.*`（冻结状态/迁移/原因；reason 与 C1 `DOC_FREEZE_REASONS` 九类一一对应，`migrated-draft` 只作迁移标记不作 reason）**

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.freeze.status.frozen` | 已冻结 | Frozen |
| `ui.freeze.status.draft` | 草稿（未冻结） | Draft (not frozen) |
| `ui.freeze.migratedLegacy` | 迁移：历史文档按已冻结处理 | Migrated: treated as frozen |
| `ui.freeze.migratedDraft` | 迁移：已证明未确认的草稿 | Migrated: proven unconfirmed draft |
| `ui.freeze.failClosed` | 冻结状态不可用；覆盖保护已按冻结处理（fail-closed）。 | Freeze state is unavailable; overwrite protection fails closed. |
| `ui.freeze.unavailable` | 冻结清单暂不可用。 | Frozen registry unavailable. |
| `ui.freeze.listLine` | {path} · v{version} · {hash} · {reason} | {path} · v{version} · {hash} · {reason} |
| `ui.freeze.empty` | 暂无冻结文档记录。 | No frozen documents. |
| `ui.freeze.reason.vcaApproved` | 客户批准版本变更 | Approved (version change) |
| `ui.freeze.reason.versionUpgradeApproved` | 客户批准版本升级 | Approved (version upgrade) |
| `ui.freeze.reason.detailItemApplied` | 逐项确认生效 | Item applied |
| `ui.freeze.reason.amendmentSubmitted` | 修正案提交冻结 | Amendment submitted |
| `ui.freeze.reason.handoffPinBootstrap` | 首次 pin 冻结 | First pin bootstrap |
| `ui.freeze.reason.bootstrapVcaApproved` | 启动申请批准 | Bootstrap VCA approved |
| `ui.freeze.reason.migratedLegacy` | 迁移冻结 | Migrated legacy |
| `ui.freeze.reason.proposalConfirmed` | 方案确认 | Proposal confirmed |
| `ui.freeze.reason.intentConfirmed` | 意图确认 | Intent confirmed |

**`ui.trunk.*`（面板/收窄升级；P1.3 时代的 trunk 面板 key 尚未落地，须纳入 C3，见 §十二）**

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.trunk.entry` | 主干升级 | Trunk upgrade |
| `ui.trunk.entryHint` | 仅用于紧急/恢复（manifest 损坏、紧急 re-pin）；常规变更请走 stable 确认或版本变更申请。 | For emergencies and recovery only (corrupt manifest, emergency re-pin); use stable confirmation or version-change applications for routine changes. |
| `ui.trunk.panelTitle` | 主干与版本变更 | Trunk and version changes |
| `ui.trunk.segment.versionChange` | 版本变更 | Version changes |
| `ui.trunk.segment.trunk` | 主干 | Trunk |
| `ui.trunk.segment.refactor` | 重构 | Refactors |
| `ui.trunk.version` | 主干版本：t{version} | Trunk version: t{version} |
| `ui.trunk.versionNone` | 尚未建立主干。 | No trunk yet. |
| `ui.trunk.section.current` | 当前主干 | Current trunk |
| `ui.trunk.section.stable` | stable 文件快照 | Stable-file snapshots |
| `ui.trunk.section.history` | 升级历史 | Upgrade history |
| `ui.trunk.section.upgrade` | 紧急/恢复 | Emergency / recovery |
| `ui.trunk.emergencyOnly` | 主干升级仅用于紧急/恢复；不能修改版本化文档或常规 stable 内容。 | Trunk upgrade is only for emergencies and recovery; it cannot change versioned documents or routine stable content. |
| `ui.trunk.upgrade.disabledNoTrunk` | 当前项目没有主干，无法升级。 | No trunk exists to upgrade. |
| `ui.trunk.upgrade.disabledUnavailable` | 当前桌面桥未提供主干升级入口（重启应用后重试）。 | The desktop bridge does not provide trunk upgrade (restart the app and retry). |
| `ui.trunk.upgrade.disabledUnknown` | 无法读取主干状态（{detail}）；请刷新项目后重试。 | Cannot read trunk state ({detail}); refresh the project and retry. |
| `ui.trunk.upgrade.highRisk` | 高风险事项：升级/恢复需客户二次确认并记录审计。 | High risk: customer double confirmation and an audit record are required. |
| `ui.trunk.upgrade.reason` | 紧急原因 | Emergency reason |
| `ui.trunk.upgrade.submit` | 请求升级 | Request upgrade |
| `ui.trunk.upgrade.success` | 已提交主干升级请求；请在确认中二次确认。 | Trunk-upgrade request submitted; confirm it with double confirmation. |
| `ui.trunk.history.empty` | 暂无升级历史。 | No upgrade history. |
| `ui.trunk.stable.empty` | 暂无 stable 确认记录。 | No stable confirmation records. |

> 本表草案合计 **99 key**（versionChange 34 / stableWrite 12 / refactor 14 / freeze 17 / trunk 22；最终计数由 C3 冻结并在 `test/项目管理/shared/i18n.test.ts` 分区断言中登记）。渲染侧不自行新增别名；若 C3 合并/改名，按冻结集合调整消费。

### 6.3 旧文案迁移（渲染侧动作）

| 旧 key/位置 | 现值（zh） | 迁移要求 | 渲染侧动作 |
| --- | --- | --- | --- |
| `ui.runChange.entry`（zh `:944`） | 契约变更 · 重开 run | 值改为指向「版本变更」（如「版本变更」）；低层 run-change 保留 | 移除 `#run-change` 按钮后，会话头不再消费该 key；`run-change-view.ts` 保留为低层内部/回执用途（Q6 裁决），删除按钮级用例 |
| `ui.runChange.entryHint` | 当前 run 已冻结时… | 语义保留（低层卡仍在），但不得再作为客户主入口提示 | 不再在会话头显示 |
| `ui.projectState.pinnedHint`（zh `:1982`） | …请走契约变更·重开 run。 | 值改为指向「版本变更」（必要时提及主干升级仅紧急/恢复） | `ProjectStatePanel.tsx` 代码不变（值迁移）；「打开版本变更」按钮默认不做（Q8 裁决） |
| `main.versionDecision.error.runChangeRequired` | …请走契约变更·重开 run。 | 主进程文案迁移（D1/C3） | 渲染侧只显示主进程返回文本，不硬编码 |
| `version-decision.ts` 硬编码文案 | — | 编排角色迁移（非渲染） | 不在本角色写集 |

其余旧 key（`ui.runChange.presented/answered*/failed` 等）保留给低层卡/回执；渲染侧不新增第二套 run-change 按钮状态源（`run-change-view.ts` 保留内部，Q6 裁决消费者由 D1 冻结点确认）。

## 七、兼容性

1. **既有客户卡**：VCA/逐项/trunk 卡为 `cardKind:"decision"`（复用既有特殊卡面/对话框）；stable workflow 卡为 app-owned `stable-write`（不进判断分组、永不代选）；`ConfirmCard.tsx`（shell/appointment-write）路径零改动（AC-13/AC-33 的 appointment-write 语义回归）。
2. **判批开关**（`Composer.tsx:835-917`）：不新增开关、不改状态源；**stable-write 卡不得进入判断器**（C1 `GOVERNANCE_CARD_GROUP` 不含该 token；渲染侧无判断逻辑）；VCA/trunk/detail 卡的客户主权由 D1 `customer-input.ts`（含 `tryApplyDirectiveDecision` 排除修复）与 C1 选项词汇保证；渲染侧没有按开关隐藏/自动作答的逻辑；卡出现即从 `pendingOperator` 渲染（与既有卡一致），`judgeNotice` 有则显示。
3. **委托排除**（幕僚委托特性已搁置，`2026-11-04_park_rapporteur-decision-delegation.md`）：渲染侧不依赖、不新增委托 UI；排除逻辑在 D1/C1，渲染侧只显示 `judgeNotice`/结果行。
4. **低层 run-change/版本决策**（G11）：API 保留；UI 入口移除；`ui.versionDecision.*` 卡（如仍从低层触发）继续由既有 `DecisionDialog` 渲染，零改动。
5. **`acknowledgments`**：C1 对象数组（`{id,label,required}`）；仅新增渲染区块与 `acknowledged: string[]` 回传；既有卡无该字段 ⇒ 行为不变。
6. **项目状态**：`ui.projectState.pinnedHint` 仅值迁移；62-key 使用守卫与面板结构不变。
7. **跨角色注意**：`#run-change` 移除会破坏 `test/桌面应用/e2e/main.mjs:630-633` 与 `test/桌面应用/run-change-*.test.ts` 的既有断言——这些属 D1 写集，D1 须同步更新（本提案不改、不运行）。渲染侧 `test/桌面UI/run-change-view.test.ts` 由本角色按 Q6 结论更新。
8. **提交与身份**：渲染侧不提交 VCA、不自报角色身份；产品/策划经角色能力工具、运营经 convener 能力（或 D1 校验活动会话）。任何「渲→主提交捷径」不在本提案内。
9. **无 drift**：不新增 drift 字段/文案/区块；旧数据若有 drift 字段按 §4.2 忽略并报告。

## 八、模块/文件清单（均在 `app/renderer/` 与 `test/桌面UI/` 内）

| 类别 | 路径 | 内容 | 说明 |
| --- | --- | --- | --- |
| **修改** | `app/renderer/src/shell/ChatHeader.tsx` | 移除 `#run-change`/旧状态/旧提示条；新增 `#version-change`、`#trunk-upgrade`、禁用原因、可选待批角标 | 唯一会话头改动 |
| **新增** | `app/renderer/src/chat/version-change-view.ts` | VCA/冻结/重构/入口/回执纯视图逻辑（§五） | Node 可测、无 DOM |
| **新增** | `app/renderer/src/chat/VersionChangePanel.tsx` | 版本变更分段（待批/历史/冻结/**只读提交指引**/重发卡） | 只渲染视图模型；无提交表单 |
| **新增** | `app/renderer/src/chat/RefactorPanel.tsx` | 重构审计 + 运营**只读提交指引** | 无批准按钮、无渲→主申请表单 |
| **新增** | `app/renderer/src/chat/trunk-view.ts` | 主干面板/升级收窄/stable 记录纯视图逻辑（§五） | Node 可测、无 DOM |
| **新增** | `app/renderer/src/chat/TrunkPanels.tsx` | 面板壳（三分段）+ 主干分段（当前/冻结/stable 记录/历史/紧急恢复） | 无 drift 区 |
| **新增** | `app/renderer/src/stores/version-change-store.ts` | 快照/分段/加载/刷新状态（zustand） | 会话头角标与面板共用；不复制主进程判定 |
| **修改** | `app/renderer/src/shell/Drawer.tsx` | `"trunk-version"` 标题/内容分发/滚动/焦点边界 | a11y 不变 |
| **修改** | `app/renderer/src/stores/drawer-store.ts` | `DrawerTab` 增加 `"trunk-version"`；`fallbackTabId` | 单值加法 |
| **修改** | `app/renderer/src/chat/ipc.ts` | 只订阅单一 `trunk:state` → store；**不订阅** `version-change:state`/`stable-write:state`/`refactor:state`；无事件则不改 | 能力探测，旧 preload 无副作用 |
| **修改** | `app/renderer/src/chat/decision-dialog.ts` | `acknowledgments` 防御视图（C1 对象数组）+（D1 冻结点）`stable-write` 入 `DECISION_KINDS` 一行 | 既有卡零变化 |
| **修改** | `app/renderer/src/chat/DecisionDialog.tsx` | 渲染必选勾选项、提交门槛、回传 `acknowledged` | 客户主权：不预勾选 |
| **修改** | `app/renderer/src/lib/platform.ts` | `DesktopBridge` 可选方法声明（按 D1 冻结表；**无 `version-change:submit`**） | 通道实现属 D1 |
| **按需** | `app/renderer/src/shell/phase4b.css` 或 `shell.css` | 面板/记录行样式（只追加、只引现有令牌） | 不改既有规则 |
| **新增测试** | `test/桌面UI/version-change-view.test.ts` | 入口矩阵/状态/行/指引/回执/禁止 drift（纯逻辑） | 见 §十 |
| **新增测试** | `test/桌面UI/trunk-view.test.ts` | 主干面板/升级收窄/stable 记录/无 drift | 见 §十 |
| **按需更新** | `test/桌面UI/run-change-view.test.ts`、`test/桌面UI/project-state.test.ts`、`test/桌面UI/decision-dialog.test.ts`、`test/桌面UI/dialog-*.test.ts` | 入口移除后的内部保留断言、`acknowledgments` 用例 | 不弱化既有断言 |
| **不写** | `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`test/项目管理/**`、`package.json`/`tsconfig*`/`vite.config.ts`、`docs/**`、`角色卡/**`（本提案除外） | — | 需要上述路径 ⇒ 停止回报 |

## 九、九条注意点与 §10.5 映射（渲染侧）

### 9.1 团队计划增量 §5.4 九条

| # | 注意点 | 渲染侧落点 | 证据/测试 |
| --- | --- | --- | --- |
| 1 | R9 权威 | 渲染侧不读 `.ans`；冻结清单/状态只来自 D1 快照；不一致/不可用如实显示 fail-closed，不在本地派生冻结 | `version-change-view` 防御解析；面板截图（fail-closed 态） |
| 2 | 守卫真实调用点 | 渲染侧不参与写门禁；冻结拒绝文案由主进程/角色工具返回，渲染只显示 | 不新增本地放行/编辑入口 |
| 3 | 迁移默认 | 冻结清单显示 `migrated-legacy`/`migrated-draft` 标注；不把缺失当 draft、不把损坏当空 | 视图单测 + 截图（迁移标注） |
| 4 | Bootstrap | 面板只显示 bootstrap 来源事实；VCA 提交属能力工具/S2，渲染不判断 `baseTrunk`；无死锁文案 | 行视图单测 |
| 5 | VCA 通道/重验 | 无通道显示 `ui.versionChange.noChannel` + 重发卡说明；不显示批准路径；不在渲染侧重算/比对哈希，只显示 D1 提交哈希 | 单测 + 截图（无通道态） |
| 6 | 重构写集 | 渲染只显示审计与指引，不提供 scope/路径选择或身份自报；越界拒绝原文显示；不判 scope 合法性 | 视图单测 + 截图（指引/拒绝原文） |
| 7 | detail 最小项 | 只渲染 D1 给出的实际 targets/items；无四类覆盖/none 汇总卡/覆盖勾选 UI | 行视图单测 |
| 8 | stable 单一路径 | 主干面板无 drift；「主干升级」入口仅紧急/恢复（文案+禁用原因）；常规 stable 引导确认卡、版本化引导 VCA | AC-30/AC-36 截图 |
| 9 | 基线披露 | 本提案引用 `89b1fb2`；U1 证据按当前候选；旧截图不复用；截图规则见 §十一 | E1/E2 引用 |

### 9.2 P1.6 §10.5 实施注意点（在九条基础上）

| # | 注意点 | 渲染侧落点 |
| --- | --- | --- |
| 1 | workflow 写路径 | 确认卡展示 path/base/target/diff（D1 用 C3 key 组装）；渲染侧不提供 workflow 直写入口（本就没有） |
| 2 | stable 写入门禁 | 渲染侧不持有/校验许可；只显示 D1 的批准/拒绝/失败事实；fail-closed 态如实展示 |
| 3 | mini re-pin | 主干面板展示 `stable-repinned` 记录（old→new hash/decisionId/time）；不本地更新/推断快照 |
| 4 | VCA 收窄 | 渲染不提供 kind/target 选择与表单；VCA 事实行只显示 D1 给出的 contract/roster/execution；workflow/boundary/product-intent 不进入 VCA 由 S2/能力工具保证；渲染不造入口 |
| 5 | 模块归属 | 全部改动在 `app/renderer/**`（UI）与 `test/桌面UI/**`；i18n 目录属项目管理；IPC/卡通道属 D1；门禁判定属门禁引擎 |
| 6 | 不升 trunkVersion | 面板与 stable 记录固定显示「stable 确认不升主干版本」；升级按钮不因 stable 记录变化而出现 |
| 7 | 其余 §5.4 继续有效 | 见 9.1 |

### 9.3 G1–G11 的渲染侧含义（引用）

- G1：VCA 客户呈现 = 卡 + 面板（卡由 D1 发；面板由本提案）。
- G2：detail 逐项确认（渲染 `acknowledgments`）。
- G3：version-upgrade 目标仅 contract/roster（渲染不提供 target 编辑；事实展示）。
- G4：主干升级收窄（只紧急/恢复）。
- G5：迁移标注显示（不判迁移）。
- G6：幕僚仅通知（渲染无审批按钮）。
- G7：重构客户只读审计（无批准/关闭）。
- G8：草稿写区（渲染不提供跨写区入口）。
- G9：stable 确认即写 + mini re-pin（卡面/记录展示）。
- G10：顺序与 git 化无关（U1 在 D1+C3 之后）。
- G11：低层 run-change/版本决策保留、UI 入口移除、文案迁移。

## 十、测试与构建计划

### 10.1 命令与基线（B0 221 行 / `8c6272d5…`；U1 出口）

| 命令 | 基线（B0） | U1 出口 |
| --- | --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | 55 文件 / 408 tests / 408 pass / 0 fail / 0 skip | +2 新文件（version-change-view、trunk-view）；新增确定性失败 = 0、新增 skip = 0；受影响断言按 §10.3 更新并在完成报告逐条列理由 |
| `npm run typecheck:renderer` | exit 0 | exit 0（证明 C3 `MessageKey` 与 D1 桥类型消费成立） |
| `npm run build:renderer` | exit 0 | exit 0；`app/renderer/dist/` 为忽略产物、非候选 |
| 候选哈希 | — | 每个改动/新增文件 `git hash-object` + `sha256sum`；`git status --short` 必须落在本角色写集内；不暂存、不 commit/push |

- 单测阶段**不启动 Electron**；真实运行截图由 T2 统一执行（本角色参与，见 §十一）。
- 实现顺序：C3/D1 冻结 → 纯逻辑模块 + 单测 → 面板/抽屉/会话头 → 卡面 `acknowledgments` → 构建/扫描。若 D1 快照形状与 §3.4 不一致，停止回报（不写兼容层猜测）。

### 10.2 新增测试要点

`test/桌面UI/version-change-view.test.ts`：

1. 入口矩阵：客户/`schedule`/`product`/`proposal`/`chief`/无 governanceFunction；桥缺失/快照错误 ⇒ disabled + 正确 key；label 走 translate（zh/en）。
2. VCA 行视图：kind/status 标签映射（六状态）；发起者显示名按 governanceFunction；targets 行格式与折叠计数；语义 key 按 kind 固定；no-channel 标记 + 重发卡标记；decisionId/time/resultTrunkVersion/journalId 透传；未知 status ⇒ 不猜测。
3. 防御解析：非对象/错 schema/字段类型错 ⇒ null；坏行不阻塞其它行。
4. 冻结行：frozen/draft/migrated-legacy/migrated-draft/reason 映射；fail-closed 视图。
5. 重构：审计 status 五值（含 superseded）映射；运营指引可见性、客户无提交入口、`auditOnly`/`submitGuidance` key。
6. **只读提交（F10 断言）**：产品/策划指引视图无任何提交按钮/字段模型；渲染源码（面板/视图/ChatHeader）扫描无 `version-change:submit`/`refactor:request` 自报身份调用；kind/target 不出现在可编辑控件中。
7. **无 drift 断言**：视图模型不输出 drift 字段；渲染源码扫描无 `drift`/`漂移` 字面量（排除 `noDrift` key 引用）。

`test/桌面UI/trunk-view.test.ts`：

1. 主干版本/空主干标签；stable 记录分组（workflow/role-card/boundary）与空态；记录行 old→new hash/decisionId/time；版本不变提示。
2. 升级入口：无主干/桥缺失/读取失败/可用四态与原因 key；`emergencyOnly` 文案 key；回执只显示「已提交，待确认」，绝不含「已升级/成功升级」。
3. 面板分段/标题 key 映射；无 drift 区。

`test/桌面UI/decision-dialog.test.ts`（扩展）：

1. `acknowledgments` 防御读取（C1 对象数组）：缺失 ⇒ 空数组且 `canSubmit` 规则不变；必选项未勾选 ⇒ 不可提交；勾选后 payload 含 `acknowledged: string[]`。
2. `stable-write` token 加入 `DECISION_KINDS` 后仅影响本地优先级/样式；`appointment-write` 不变；未知卡种仍 confirm 回落；`decision-card.ts` 不接管。

`test/桌面UI/run-change-view.test.ts`（Q6 裁决）：保留模块为低层内部/回执用途，删除按钮级用例并保留回执用例；理由写入完成报告；不弱化其它断言。

### 10.3 既有测试更新（仅列必要项）

- `test/桌面UI/project-state.test.ts`：预计**不改**（key 值迁移不影响 62-key 守卫；若断言中文值，按 C3 迁移后更新）。
- `test/桌面UI/run-change-view.test.ts`：见上。
- `test/桌面UI/decision-dialog.test.ts` / `dialog-*.test.ts`：仅追加 `acknowledgments` 用例；既有断言不改。
- 其它 `test/桌面UI/**` 只运行、不修改；如需修改第三个非计划测试，停止回报。

## 十一、验收证据贡献（T2 截图点；最多截图、不录屏）

| 截图/证据 | 覆盖 AC | 内容 |
| --- | --- | --- |
| S1 会话头（客户侧） | AC-9/AC-17 | 无「重构」按钮、无 `#run-change`；「版本变更」+「主干升级」入口及禁用原因（含桥缺失/无主干态） |
| S2 版本变更面板·待批/历史/指引 | AC-18/AC-22/AC-23 | kind/发起者/targets/path/version/sha256/摘要/语义说明；历史含 decisionId/时间/结果主干；**只读提交指引**（能力工具说明）；中英各一 |
| S3 VCA 批准/拒绝卡 | AC-18/AC-4 | 卡面 targets/hash/差异入口/语义说明；recommended=reject；客户主权（无代选痕迹） |
| S4 detail 逐项卡 `acknowledgments` | AC-18/AC-28 | 必选勾选（对象数组渲染）、未勾选不可提交、只列实际变更项 |
| S5 workflow stable 写入确认卡 | AC-33/AC-34/AC-36 | path/base/target 完整哈希、diff 预览、语义句（D1 用 C3 key 组装、U1 原样展示）；批准/拒绝 |
| S6 主干面板 stable 续接记录 | AC-34/AC-36/AC-30 | old→new hash/decisionId/confirmationId/时间；无 drift 区；trunkVersion 不变；中英各一 |
| S7 主干升级收窄 | AC-30/AC-9 | 紧急/恢复说明；无主干禁用原因；提交后仅「待确认」；高危二次确认由 D1 客户 UI/卡完成 |
| S8 重构面板 | AC-20/AC-7(UI 侧) | 运营只读提交指引；客户只读审计行（含 superseded）；无批准/关闭；越界拒绝原文 |
| S9 冻结/迁移/异常态 | AC-10/AC-21/AC-36 | migrated-legacy/migrated-draft 标注；fail-closed 提示；无通道 VCA 状态 + 重发卡 |
| S10 旧文案迁移 | AC-17 | `ui.projectState.pinnedHint` 指向「版本变更」；旧入口不存在；低层卡文案不误导 |

- 规则：真实 Electron 当前候选、关闭 DEBUG 覆盖层；记录截图 SHA-256、候选 HEAD、拍摄命令、窗口尺寸；**不要求/不提供录屏**；证据存 `角色卡/桌面UI/docs/change/2026-11-04_trunk-amendment-model-evidence/`（T2 时创建）。若真实运行不可得，如实披露，相关 AC 不得以单测替代。
- 单测/构建证据：`test/桌面UI` 原始输出、`typecheck:renderer`、`build:renderer`、候选逐文件哈希，路径同上目录。
- AC-9 的产品/策划/运营入口证据按「能力工具注入（D1）+ 面板可见指引（U1）」呈现；若 D1 能力不可注入或不可观察，如实记缺口（见 R11）。

## 十二、契约冻结前澄清项

### 12.1 已按 PM 审核裁决（Rev 1 采纳，待各冻结点落形）

| # | 事项 | 裁决 |
| --- | --- | --- |
| F1/Q3-ack | `acknowledgments` 形状 | **C1 对象数组** `CustomerInputAcknowledgement[]`（id/label/required）；D1 透传并按 required 结算；回传 `acknowledged: string[]`；U1 按对象数组渲染 |
| F2/Q3-card | 卡种 | VCA/逐项/trunk = `decision`（含 `application:true` + flowId）；stable workflow = app-owned `stable-write`（不进 `GOVERNANCE_CARD_GROUP`、永不判断）；U1 仅在冻结点把 `stable-write` 加入本地 `DECISION_KINDS`（一行，建议） |
| F10/Q4 | 提交入口 | VCA 只经发起角色能力工具；**不新增渲→主提交 IPC**；U1 表单改只读指引；AC-9 证据 = 能力工具 + 面板指引 |
| F10 | 状态推送 | 单一 `trunk:state`；不设 `version-change:state`/`stable-write:state`/`refactor:state`；面板打开拉取 + trunk:state 刷新 |
| F11/Q5 | trunk 高危确认 | 确认在 D1 客户 UI/卡；`trunk:upgrade-confirm` 仅绑定 previewId 的二次确认；U1 不自建确认对话框、不提供渲→主批准捷径；回执只显示「待确认」 |
| Q6 | `run-change-view.ts` | 保留低层内部/回执用途；删除按钮级用例；消费者由 D1 冻结点确认 |
| Q7 | 差异展示 | 不做文件级 diff（O7 未选）；只显示 D1 有界文本（含完整 hash） |
| Q8 | 面板导航 | 单 tab 三分段；`ui.projectState.pinnedHint` 加动作按钮默认不做 |
| Q9 | 枚举 | VCA 六状态；refactor 五值（含 superseded）；freeze reason 九类；trunk op 集；与 C1/C2c 一致，映射表冻结后写死 token |
| Q11 | stable 卡文本 | D1 用 C3 `ui.stableWrite.confirm.*` key 组装 preview/detail（单一实现）；U1 原样展示；不得两套 |

### 12.2 仍需澄清/冻结点确认（阻塞对应实现）

| # | 澄清项 | 归属 | 阻塞点/默认 |
| --- | --- | --- | --- |
| Q1 | **D1 IPC/快照最终形状**：§3.4 冻结候选名、请求/回执字段、快照 schema/错误码与 `trunk:state` 载荷；`refactor:request` 是否采用「活动 convener 会话校验」并允许 U1 触发（默认不触发） | 桌面窗口（D1） | U1 入口条件；未冻结不写引用代码 |
| Q2 | **C3 最终 key 名/计数/措辞**：本提案 99 key 为需求清单（含 `ui.trunk.*` 22、`ui.stableWrite.*` 12）；C3 记录 `ui.trunk.*` 目录内扩展并交 E1 披露；旧 key 值迁移文案 | 项目管理（C3） | U1 入口条件；渲染侧不预造 key |
| Q10 | 会话头待批角标是否要（数据源 D1 `pendingCount`；可选、不本地统计） | UX/项目管理 | 默认可选；D1 提供则显示 |

> 以上澄清不改 P1.6 语义、不改 AC；结果写入审核/冻结记录。**本提案不自行评审放行。**

## 十三、风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | D1 快照/卡种与渲染假设不一致 | 高：面板/卡面错误或崩溃 | 防御解析 + 能力探测；Q1 冻结前不写消费代码；不一致即停止回报 |
| R2 | 冻结点 token 偏差（`stable-write`/`decision`/状态枚举） | 中高：卡不显示或优先级错误 | 按审核裁决冻结；`stable-write` 一行入 `DECISION_KINDS`；测试覆盖 `decisionPriority`/未知状态 |
| R3 | C3 key 冻结晚于 U1 | 高：`MessageKey` 不成立，无法编译 | 顺序硬约束（D1 + C3 → U1）；不预造 key/不硬编码 |
| R4 | 移除 `#run-change` 破坏既有桌面 e2e/测试 | 中：T1/T3 红 | 跨角色提醒 D1 更新 `test/桌面应用/**`；本角色更新 `test/桌面UI/run-change-view.test.ts`；完成报告列明 |
| R5 | 抽屉新 tab 的焦点/滚动/a11y 回归 | 中：可用性/验收 | 复用既有 tab 语义（role=tablist、Esc、焦点返回）；dialog-a11y/抽屉测试覆盖 |
| R6 | 角色侧指引依赖 `governanceFunction` | 中：项目角色看不到提交指引 | 设计即如此（不按 id 猜）；无 governanceFunction ⇒ 隐藏并保留客户侧面板 |
| R7 | 面板数据量大/长哈希展示 | 中：可读性 | targets/记录按 D1 `truncated` 提示；哈希完整等宽显示（不截断核对用值）；列表虚拟化不在本轮（O7 未选） |
| R8 | T2 截图不可得 | 中：AC-9/20/36 证据不足 | 如实披露；不以单测替代；E2 判 `insufficient evidence`，不伪造 |
| R9 | drift 旧语义回流 | 中：与 P1.6 冲突 | 源码扫描 + 视图模型无 drift 字段；旧数据 drift 字段忽略并报告 |
| R10 | 预选 recommended 与客户主权边界 | 中低：误读为代选 | 既有行为保留；VCA/stable recommended 由 D1 冻结为 reject；不新增自动提交；测试断言无自动 send |
| R11 | AC-9 入口证据依赖 D1 能力工具注入的可观察性 | 中：验收证据不足 | 与 D1/T2 对齐截图与工具注入证据；不可观察则如实记缺口，不伪造 |
| R12 | 客户期望表单式提交 | 中：范围/契约变化 | 按审核 F10：表单属 D1 IPC/写集扩展，须另行确认；本提案默认只读指引 |

## 十四、停止回报条件与声明

**停止回报（不在本提案内自行扩写）**：

1. D1 冻结形状要求渲染侧实现判定/哈希校验/许可校验，或需要新增 IPC/preload 方法实现（属 D1）。
2. 要求渲染侧新增 VCA/重构提交 IPC 或表单（审核 F10 裁决只读；表单属写集扩展，须另行确认）。
3. C3 未冻结所需 key，或要求渲染侧写 shared i18n 目录。
4. 需要 `app/renderer/**`、`test/桌面UI/**` 之外的任何路径（含 `app/desktop/**`、`src/**`、`test/桌面应用/**`、角色卡/边界）。
5. 需要新增角色/写权/权限、改变 stable/VCA/冻结语义、恢复 drift、启用 O1–O12 任一项。
6. VCA/stable 卡需要渲染侧自建确认对话框、自动作答或接受自报身份。
7. 需要文件级 diff 查看器或结构化 diff 解析（超出有界 preview 文本）。

**声明**：本提案为 proposal-only（Rev 1）；未改产品代码/测试/样式/i18n/其它角色文档；未运行测试/typecheck/构建；未启动应用；未 commit/push；未接触客户；未自行评审放行。提交/合并/发布不在本提案授权内。U1 实施须在复审通过、D1 + C3 冻结后由统筹派发，并按本提案 §十 出口验收。
