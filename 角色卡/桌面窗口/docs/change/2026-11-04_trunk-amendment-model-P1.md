---
id: trunk-amendment-model-p1-proposal-desktop
type: change
title: 主干/冻结与版本变更申请模型 P1 实现提案（桌面窗口 D1）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
---

# 桌面窗口 P1 实现提案：主干/冻结与版本变更申请模型（D1）

- **任务**：`2026-11-04-trunk-amendment-model`（应用级治理特性，风险档位 T3）。本文件只是 D1 实现提案：**不写产品/测试代码、不运行实施测试、不写 boundary/changelog/角色卡、不 commit/push**；状态 `proposal-only`。
- **依据（§10.8 P1 提案任务书）**：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md` §10.8「桌面窗口」行：必须覆盖 `version-change:*`/`stable-write:*`/`refactor:*`/`doc-freeze:*` IPC；客户卡通道；客户主权；acknowledgments；R9 缓存/许可；`test/桌面应用/trunk.test.ts` + `version-change.test.ts`。
- **实施契约基线**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：**1151 行 / 实际字节 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` / 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`**（本次写盘前 `wc -l`/`sha256sum`/`tr -d '\r' | sha256sum` 实测，与增量记录一致）。
- **验收标准**：`docs/acceptance/trunk-amendment-model-criteria-v1.md` **v1.1**：**350 行**，AC-1–AC-36。按 PM 审核 §1.3-1 裁决：当前 V1 v1.1 = **350 行 / 归一化 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`**（本 worktree 实际字节同值）；增量/方案记录的 `75bf7a49…` 视为旧快照，由沟通/统筹在 G2a/E1 更正。本提案按 V1 v1.1 的 AC-1–AC-36 原文提案。
- **团队计划增量**：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md`：**468 行 / `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5`**（含 §十 P1.6 增量与 §10.8；实测一致）。原团队计划 721 行 / `ed6d3484…`（未被增量覆盖部分继续有效；其中 §4.1 D1 仍列 `app/desktop/trunk.ts`（新），P1.6 未撤销 P1.3 trunk 内部机制）。
- **基线**：分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`（= `origin/main`，含下载特性 PR #62 与 PR #61）；写盘前 `git status --porcelain -- src app test` 为空。
- **B0（按 PM 审核 §1.3-3 裁决）**：`角色卡/测试/docs/change/2026-11-04_trunk-amendment-B0-baseline.md` **最终版 221 行 / `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058`**（旧 173 行 / `27f9b94d…` 为含模板占位的中间版，**勿引用**；以测试角色最终版为准）：`test/桌面应用/**/*.test.ts` 57 文件 / 562 tests / 562 pass / 0 fail / 0 skip；T3 全量 3774/3745/11/18（9 项既有 Windows symlink EPERM + 2 项非确定性清理期 ENOTEMPTY；新增确定性失败 0、新增 skip 0）。
- **G2a（按 PM 审核 §1.3-2 裁决）**：`docs/communication/2026-11-04_gate2-addendum_trunk-amendment-B5-B10.md` **25 行 / `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201`**（含 P1.6 + B-11 补注）；V1 §1.1 引用的 16 行 / `d41665d3…` 为旧引用，沟通在合并材料更正。
- **PM P1 审核（Revision 1 依据）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：**368 行 / `2cb04caefae4074ef732e7030900bd11201a4c6a5583d74bf94814aacaf2ed93`**；结论 `needs revision`；本版按 **F1/F2/F5/F9/F10/F11** 与引用刷新修订（映射见 §十七）。审核不是实施授权、不是契约冻结。
- **边界（H1 已落地）**：`角色卡/桌面窗口/boundary.md` 第 83–84 行、`boundary.yaml` 第 242–249 行已含 **B-4** `test/桌面应用/trunk.test.ts` 与 **B-10** `test/桌面应用/version-change.test.ts`（Delta-TA-4/Delta-TA-10）；`app/desktop/` 为目录级授权，新增模块文件在目录内；`app/main.ts`、`app/preload.cjs` 为单文件授权。**B-13**（独立 `test/桌面应用/stable-write.test.ts`）为条件项，默认并入 B-10，本提案不预留、不触发；若实施证明必须拆分，停止回报并按增补程序确认。本提案**不提出 B-1..B-11 之外的边界路径、不新增角色、不扩大写权**。

## 一、只读事实（2026-11-04，HEAD 89b1fb2）

### 1.1 依赖现状

- **[事实]** `src/model/version-change.ts`、`src/provider/version-change/`、`src/service/version-change/`、`src/pipeline/orchestration/{version-change-runtime,refactor-runtime,stable-write-runtime,trunk-runtime}.ts`、`src/model/trunk.ts` **均不存在**（`find src -iname "*trunk*|*version-change*|*stable-write*|*freeze*"` 为空）；C1/C2a/C2b/C2c/S1–S4 全部未实施。
- **[事实]** `app/desktop/` 无 trunk/version-change/stable-write/refactor 模块；无 `trunk.ts`、`version-change.ts`；`test/桌面应用/trunk.test.ts`、`test/桌面应用/version-change.test.ts` 不存在（B-4/B-10 为边界已登记、待实施文件）。
- **[事实]** i18n 无 `ui.versionChange.*`/`ui.refactor.*`/`ui.freeze.*`/`ui.stableWrite.*` key（`grep src/common/shared/i18n/messages` 为空）；C3 未实施。
- **[事实]** `src/model/runtime.ts` 的 `CustomerInputRequest` 无 `acknowledgments`，`CustomerInputOutcome` 无 `acknowledged`；`GovernanceCardKind = GovernanceChoiceCardKind | GovernanceConfirmCardKind | "download"`；`GOVERNANCE_CARD_GROUP` 当前**既是**判断分组**又**被 `src/common/编排/task-state.ts:77-81` 的 `isGovernanceCardKind` 当作卡种白名单（直接读键集）。**PM 审核 §4.5 裁决**：`GOVERNANCE_CARD_GROUP` 只表达判断分组；C1 新增独立白名单 `GOVERNANCE_CARD_KINDS`（含 `stable-write`），C2a 的 `isGovernanceCardKind` 改读该白名单。
- **[事实]** 冻结守卫与 R9 baseline 已存在：`src/common/门禁引擎/versioned-doc-guard.ts`（`versionedDocOverwriteDecision`、`registerVersionedDocAfterWrite`、`verifyVersionedDocBaselines`）；`app/desktop/session.ts:164` 已只读导入 `verifyVersionedDocBaselines`。守卫语义改造（exists→frozen）与 `stableWriteDecision` 属门禁引擎（C2b），**不在 D1**。
- **[事实]** 应用自有多模式卡先例：`src/common/编排/run-manifest.ts:721-755` `buildRunChangeCard`（`kind:"choice"`、`cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`）；`app/desktop/session.ts:2122-2241` `requestRunChangeDecision`（会话选择顺序 convener→rapporteur→chief，直接调通道、**不写 request.***）；`app/desktop/session.ts:4805-5149` `requestVersionDecision`（chief `governedCardContext` + `withRequestLifecycle`，`sourceRoleId:"application"`、`notify:"none"`）。VCA/stable 卡可按后者复用生命周期。
- **[事实]** 下载特性（已合并 `89b1fb2`）的本层先例已落树：每会话运行时 + presenter + `withRequestLifecycle`（`session.ts:2940-3005`）、能力位注入（`openRoleSession.requestDownload`）、窗口关窗 fail-closed（`main.ts:649` `customerChannel.rejectAllPending` + `:943` `stopSession(null)`）、关窗/重启清空 pending（`customer-input.ts:2350` `rejectAllPending`、`session.ts:5255-5277` 重启 `request.orphaned(restart)`）。
- **[事实]** 客户主权现状：`customer-input.ts:321-333` `isApplicationDecisionReservedForCustomer`（仅 run-change/版本决策两组选项词汇）、`:344-348` `isGovernanceWriteCardKind`（appointment-write 永不判断）、`:1673-1680` `tryAutoSelectDecision` 早退；**`@决策` 指令消费者实际符号为 `tryApplyDirectiveDecision`（`:1747-1800`），只判 `cardKind==="decision"`、未调用主权排除谓词——PM 审核 §4.6/F9 已确认该缺口，D1 必须修**（`applyDecisionDirective` 是注入句柄，不是消费者函数名）。
- **[事实]** `request.*` 生命周期在 `session.ts:4222-4490` `withRequestLifecycle`：写 `request.created/presented/resolved/orphaned` + 幕僚 `request.notified`；`request.created` 的 `cardKind` 校验当前走 `GOVERNANCE_CARD_GROUP` 键集（`task-state.ts:298`；PM 裁决后改读 `GOVERNANCE_CARD_KINDS`）；`request.resolved.by` 三值 `customer|judge|directive`。
- **[事实]** `src/model/project-state.ts` 的 `project-state/v1` 视图已由 `app/main.ts:1040` 直通 `project-state:get`；P1.6 若扩展冻结/VCA/重构投影（条件），桌面原样透传、不造第二份状态。
- **[事实]** 桌面 `request_requirement_change` 的应用能力实现（`interface.ts:1600-1954`）与注入（`session.ts:2682-2687`）是「角色能力 + 应用发卡」的既有范式；下载能力同理（`interface.ts:1957/2008`）。VCA/重构/stable-write 的角色入口按同范式提案。

### 1.2 现有代码锚点（符号为准；行号只对应 89b1fb2）

| 主题 | 当前锚点 | 与 D1 的关系 |
| --- | --- | --- |
| `SessionManagerDeps` | `session.ts:583-853` | 新增 VCA/重构/stable-write 能力工厂与冻结缓存刷新依赖 |
| 应用卡会话选择 | `session.ts:2142-2159`（`requestRunChangeDecision` 内） | 提取为共享私有 helper，VCA/stable 卡复用（零行为变化） |
| 修订在途抑制 | `session.ts:2273-2351` `proposalCardFrozenRejection`/`offerRunChangeOnFrozenContract` | 增加 VCA/修正案在途抑制（§九） |
| 生命周期 | `session.ts:4222-4490` `withRequestLifecycle`；`:3822-3857` `notifyRequest`；`:3859+` `recordRequestPresented` | VCA/stable 卡复用；客户主权卡 `notify` 口径见 §五 |
| 应用自有卡范式 | `session.ts:4805-5149` `requestVersionDecision` | VCA 卡的直接模板（`sourceRoleId:"application"`） |
| 能力注入 | `session.ts:2677-2687`（需求变更）、`:2940-3005`（下载） | 注入位置与 fail-closed 范式 |
| 客户通道回包 | `customer-input.ts:2294-2347` `respondUnsafe`；`:162-164` `OperatorDecisionPayload`；`:2350` `rejectAllPending` | acknowledgments 必选校验 + 主权卡 `decidedBy` 二次校验 |
| 判断/代选/指令 | `customer-input.ts:1217` `planJudge`、`:1389` `settleJudgeOutcome`、`:1673` `tryAutoSelectDecision`、`:1747-1800` `tryApplyDirectiveDecision`（实际符号；`applyDecisionDirective` 是注入句柄） | 主权排除（词汇 + 指令消费者；F9） |
| 卡发卡前校验 | `customer-input.ts:389-...` `evaluateDecisionCardRequest`（共享 `validateDecisionCardRequest`） | VCA 卡走同一校验（application-owned 放行） |
| Interface 装配 | `interface.ts:358-624` `DesktopDeps`、`:1959-2023` `SessionManager` 构造、`:2259-2313` `requestRunChange` | 新增 deps/方法/IPC 回执 |
| 主进程 IPC | `main.ts:306` `registerHandler`、`:934-944` 关窗、`:982` run-change、`:1040` project-state | 新增 `version-change:*`/`stable-write:*`/`refactor:*`/`doc-freeze:*`/`trunk:*` |
| preload | `app/preload.cjs:22-` 白名单；`:70` `requestRunChange`；`:274-283` 客户卡通道；`:387-388` judge 结果行 | 新增白名单方法 |
| i18n | `app/desktop/i18n.ts:45-47` `mainT` | 只消费 C3 key；预期不改本文件 |

### 1.3 与在途/已完成特性的关系

- **下载特性（已合并 `89b1fb2`）**：`session.ts`/`customer-input.ts`/`interface.ts`/`main.ts` 的下载接线是既有现状，D1 只加法、不得回退；下载卡（confirm + `cardKind:"download"`）与 VCA 卡（application decision）路径互不影响。
- **幕僚委托（已搁置）**：不实施、不依赖；D1 不引入 delegator。客户主权排除仍按「未来若恢复委托，必须排除本特性卡」在注释与本提案登记（V1 §1.3 P1.6-G10）。
- **PR #61（convener workflow 写权）**：`docs/workflow.md` 运营写权保留；D1 不改写权，只接 stable-write 确认卡与 mini re-pin 的消费面（§六）。
- **锚点漂移**：方案 P1.6 行号基于 `f4c24eae` 设计快照；本提案行号只对应 `89b1fb2`，实施以符号名/文本锚点为准。

## 二、职责与分层结论

1. **D1 = Interface（桌面主进程侧）**：只做 IPC 方法/回执/白名单、卡通道选择与呈现、`CustomerInputRequest` 组装（字段来自 Pipeline 冻结载荷，不重算哈希/版本）、面板只读数据、通知/系统行、缓存刷新触发与 fail-closed 状态外显。**不做**冻结判定、VCA 状态机、目标/作者写区校验、哈希计算/比对、permit 签发/校验、trunk manifest 更新、mini re-pin——全部属门禁引擎/编排 Pipeline/Service（C2b/C2c/S4）。
2. **依赖合法**：Interface → Pipeline → Service → Provider；D1 只 import `src/model/**`（类型/常量）、`src/pipeline/orchestration/*` 公共出口（冻结后）、既有 `src/common/编排/*` 只读工具（先例：session.ts 已只读导入 `task-state`/`run-manifest`/`decision-card`/`mechanical-rejection`）。不 import Service/Provider 私有实现；不复制第二份冻结判定/卡校验/指令逻辑。
3. **单一事实源**：冻结 = R9 `versions.jsonl`（权威，编排/门禁）；`doc-freezes.json` = 派生缓存；VCA/重构/stable-write = `.ans/state/` 记录（编排）；trunk = trunk manifest（编排）。桌面只读投影 + 触发展缓存刷新，**不写 `.ans/**`**（D1 无 `.ans` 写权；现有会话层写账本均经编排 `appendTaskState`）。
4. **客户主权**：VCA 批准/拒绝、修正案逐项确认/最终应用、stable 写入确认、主干升级高危确认——全部 `decidedBy:"customer"`；判断器/「替我决策」/委托/`@决策` 指令结构性排除；桌面做词汇排除 + 结算后 `operatorId` 二次校验 + Pipeline 三重复核。
5. **不扩写权**：D1 不改变 `governance-roles.ts`、WriteGate、shell 闸、`versioned-doc-guard` 语义；convener 的 `docs/workflow.md` 写权保留但改为确认卡路径（由 B-11/门禁机械保证，D1 只呈现）。

## 三、模块与文件清单（写集）

### 3.1 新增 `app/desktop/version-change.ts`（目录授权内；§4.1 D1）

纯 Interface 模块（不依赖 electron、可在 node 下单测），职责：

| 导出（拟，实施可微调命名；语义冻结） | 职责 |
| --- | --- |
| `buildVersionChangeCard(payload): { request, metadata }` | 把 B-8 冻结的 VCA 卡载荷映射为 `CustomerInputRequest`（`kind:"choice"`、application-owned **`cardKind:"decision"` + 真实 `flowId`**）与 metadata；**不计算** hash/version/diff；字段缺失 ⇒ 不发卡（fail-closed） |
| `buildStableWriteCard(payload): { request, metadata }` | 把 B-11 冻结的 stable-write 载荷映射为轻量确认卡（**app-owned `cardKind:"stable-write"`**，独立白名单、永不判断、不要求 flowId；preview：path/base/target sha256/diff）；不计算哈希 |
| `validateStableWriteCardShape(request)` | stable-write 卡的**独立最小结构校验**（恰一 `recommended`/≥2 选项/path/base/target 字段齐全）；`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`（PM 审核 §4.5），D1 不得让该卡绕过结构校验 |
| `buildDetailItemCard(payload): { request, metadata }` | 修正案逐项确认卡（application-owned `decision`；item-apply/item-keep/item-cancel-amendment）与 `acknowledgments`（C1 对象数组） |
| `buildFinalApplyCard(payload): { request, metadata }` | 最终应用/延后卡（application-owned `decision`；apply-amendment/defer-amendment） |
| `toVersionChangeOutcome(outcome): VersionChangeDecisionOutcome` | 客户通道三态 → B-8 冻结结果形状；`decidedBy` 只认 `customer`（`operatorId` 非 `judge:`/`directive:` 且无 `judge` 审计），否则 `unavailable` |
| `toStableWriteOutcome(outcome): StableWriteApprovalOutcome` | 同上（B-11 冻结形状） |
| `createVersionChangeCardPresenter(deps): VersionChangePresenter` | 会话级 presenter：选通道会话 → 调 `withRequestLifecycle` → 返回结果；不代选、不改 VCA 状态 |
| `listVersionChangeView(projectRoot): Promise<...>` / `listStableWriteView(...)` / `listRefactorView(...)` / `listDocFreezeView(...)` | 面板只读投影（调用 S4/S2 公共查询；有界裁剪；项目相对路径 posix 化） |
| `emitVersionChangeNotice(...)` / `emitStableWriteNotice(...)` | 幕僚/运营通知与系统行（文案 C3 key；失败只诊断） |

**不做**：不读写 `.ans/**`、不判冻结/哈希/permit、不推进 VCA 状态、不写 trunk manifest、不 import Service/Provider 私有模块、不硬编码中文文案。

### 3.2 新增 `app/desktop/trunk.ts`（目录授权内；原团队计划 §4.1 D1，P1.6 未撤销）

P1.3 trunk 内部机制的桌面侧（保留并收窄）：

| 导出 | 职责 |
| --- | --- |
| `buildTrunkStateView(...)` | `trunk:state` 快照组装（trunkVersion、pinned run、stable 快照 hash、冻结缓存健康、待批 VCA 摘要、重构审计摘要、按钮禁用原因）；**唯一状态源**（U1 不造第二套） |
| `buildTrunkUpgradePreview/Confirm(...)` | 主干升级（仅紧急/恢复）preview（previewId/reason/scope/hash 绑定）；客户 UI 二次确认回执由 D1 校验（一次性 previewId、`acknowledged:true`、审计）；常规内容变更拒绝并提示走 stable-write/VCA（文案 C3） |
| `buildTrunkItemCard/buildTrunkSummaryCard(...)` | P1.3 逐项确认/汇总/最终应用卡（含 `acknowledgments`） |
| `toTrunkOutcome(outcome)` | 三态映射；`decidedBy` 只认 customer |

> 与 `version-change.ts` 的分工：trunk 面板/紧急升级/恢复/逐项卡在 `trunk.ts`；VCA/冻结/重构/stable-write IPC 在 `version-change.ts`。两者共用 `session.ts` 的通道选择 helper。

### 3.3 改 `app/desktop/session.ts`

- `SessionManagerDeps` 新增（均为可选，缺省 ⇒ 对应能力/入口不注入，fail-closed）：
  - `createVersionChangeRuntime?: ...`（B-8 公共工厂/句柄）；`createStableWriteRuntime?: ...`（B-11）；`createRefactorRuntime?: ...`（B-9）；`getTrunkRuntime?: ...`（B-2/B-3 公共查询句柄）。
  - `refreshDocFreezeCache?: (projectRoot) => Promise<{ok:true}|{ok:false,reason}>`（C2c/S4 公共入口；桌面在项目导入/会话开启/相关事件后调用）。
  - `listVersionChanges/listStableWrites/listRefactorRequests/listDocFreezes/listTrunk/...`（面板查询；S4 冻结）。
  - `submitVersionChangeCapability?`（product/proposal 会话注入）；`submitRefactorCapability?`（**convener 会话注入——重构唯一提交路径**，PM 审核 §4.7/F11）；`requestStableWriteCapability?`（convener）。
- `open()`：
  - 会话选择 helper：把 `requestRunChangeDecision` 内的会话顺序（`handbackOwnerRoleId`→`rapporteur`→`chiefTaskRoleIdOf`，均须有客户卡通道）提取为私有 `pickGovernedCardEntry(projectRoot)`；run-change 行为逐字不变；VCA/stable 卡复用同一 helper（一个实现，不复制）。
  - 能力注入：`version-upgrade` 仅 `governanceFunction === "product"`；`detail-amendment` 仅 `"proposal"`；`refactor`/stable-write 仅 `"schedule"`（convener）；未注入 ⇒ 工具不注册（最强 fail-closed）。构造/异常失败只记诊断并置 undefined。**`refactor` 只经 convener 能力提交，不提供渲→主 `refactor:request` IPC**（渲染侧无法证明 convener 身份）。
  - `LiveSession` 增加对应运行时引用；`disposeEntry` 幂等释放（await 失败只诊断、不阻断会话释放）。
  - 会话开启成功后触发 `refreshDocFreezeCache`（best-effort；失败标记缓存不健康并推 `trunk:state`）。
- `requestVersionChangeDecision(input)`（新方法，模板 = `requestVersionDecision`）：选通道会话 → `validateDecisionCardRequest({roleId:"application",governanceModel:"trio"})`（VCA 复用 decision）→ `withRequestLifecycle(sourceRoleId:"application", requestId=派生自 applicationId, notify:"none", signal=会话 lifetime+调用信号)` → 返回客户三态；**不改 VCA 状态**（状态由 B-8 根据结果为/`declined` 推进）。`sourceRoleId:"application"` 沿用 version-decision 先例。
- `requestStableWriteDecision(input)`：同上，但卡种为 `stable-write`、先走 `validateStableWriteCardShape`；presenter 供 B-11 在写入请求时调用；返回 `approved/declined/unavailable`，**不签发许可**（许可由 B-11）。
- 修订在途抑制：`proposalCardFrozenRejection` 入口增加查询——若该 flow 存在 `submitted/approved` VCA 或 `submitted/approved` detail-amendment（由 B-8 公共查询提供），**不自动弹 run-change 卡**，按 `version-change-pending` 三段式拒发原提案卡（文案 C3）；查询失败 ⇒ fail-closed（不弹卡，按原 `run-change-required` 行为）。该查询不可得 ⇒ 停止回报（§十四）。
- 通知：VCA `submitted/approved/rejected/applied`、stable `requested/written/failed`、refactor `requested/rejected/closed` 的幕僚/运营通知与系统行；`notify:"none"` 时由桌面显式发送（文案 C3）。不改 `notifyRequest` 既有语义给其他卡种。
- `trunk` 逐项卡/汇总卡/最终应用卡的 presenter 与 acknowledgments 结算调用（`trunk.ts`）。

### 3.4 改 `app/desktop/customer-input.ts`

1. **主权排除判据扩展**（`isApplicationDecisionReservedForCustomer`）：
   - **卡种**：`cardKind === "stable-write"`（app-owned）⇒ 直接认定为主权卡；
   - **decision 卡选项词汇**：VCA `approve-version-change` / `reject-version-change`（两组齐全才认定）；修正案逐项/最终 `item-apply` / `item-keep` / `item-cancel-amendment`、`apply-amendment` / `defer-amendment`、`acknowledge-none`；
   - 现状条件 `kind==="choice" && cardKind==="decision" && application===true` 保持；`stable-write` 分支同时要求 `application===true`；非 application 卡零行为变化。
2. **`@决策` 指令消费者排除（F9，AC-5 支撑）**：实际消费者为 **`tryApplyDirectiveDecision`**；在进入 `applyDecisionDirective` 注入句柄前，若 `isApplicationDecisionReservedForCustomer(entry.request)` 为真 ⇒ **返回 false**（不消费指令、不写 `directive:<id>`、不结算）。这是当前代码缺失的排除点；VCA 卡（复用 decision）与 stable-write 卡一律客户本人。
3. **判断器/代选排除**：`tryAutoSelectDecision` 既有早退继续覆盖新词汇；`planJudge` 对 decision 组仍只做确定性默认（已排除）；`stable-write` 不在 `GOVERNANCE_CARD_GROUP`（`governanceCardGroup` 返回 undefined ⇒ 永不判断）；appointment-write 主权不变。
4. **acknowledgments 必选结算（F1：以 C1 对象数组为准）**：
   - `CustomerInputRequest.acknowledgments?: CustomerInputAcknowledgement[]`（C1 形状 `{ id, label, required }`）原样透传至 `OperatorRequestPayload.request`（不加工、不重排）；
   - `OperatorDecisionPayload` 的 choice 分支增加 `acknowledged?: string[]`；`respondUnsafe` 校验：请求声明 `required` 项时，`acknowledged` 必须是字符串数组且**覆盖全部 required id**（去重后集合相等；多余/缺失均 `{ok:false}`，pending 保留）；未声明 ⇒ 旧行为零变化；
   - 结算值 `{selected, acknowledged}`；`CustomerInputOutcome.acknowledged?: string[]`（C1 形状）回传编排；**`request.resolved` 不新增 `acknowledged` 字段**（PM 审核 §4.10-5/5.3-4）；不伪造/不补默认。
5. **`decidedBy==="customer"` 二次校验（主权卡限定）**：在 `respondUnsafe` 与 `settleActive` 出口对主权卡请求做最后防线——`operatorId` 以 `judge:`/`directive:` 开头或 outcome 带 `judge` ⇒ **拒绝结算**（恢复 pending；`{ok:false}` + 文案），确保即使上游接线错误也不会把非客户选择送给 Pipeline。其他卡种零行为变化。
6. **不新增第二套判断器/队列**：VCA/stable 卡与既有客户卡共用同一 pending/queue（`activeByProject`/`waiting`）；关窗/重启 fail-closed 语义沿用。

### 3.5 改 `app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`

- `interface.ts`：
  - `DesktopDeps` 新增上述工厂/查询/能力注入字段（可选；缺省真实实现经 Pipeline 公共出口，测试可注入桩件）。
  - `SessionManager` 构造透传；`openRoleSessionFn` 镜像类型增加 `requestVersionChange?`/`requestStableWrite?`/`requestRefactor?`。
  - `DesktopInterface` 新增方法（与 §四 IPC 一一对应）：`listVersionChanges`、`presentVersionChange`、`listStableWrites`、`listRefactorRequests`、`listDocFreezes`、`getTrunkState/listTrunks`、`requestTrunkUpgrade/confirmTrunkUpgrade/requestTrunkRefreeze/abandonTrunkUpgrade/requestTrunkRecover`、`refreshFreezeCache`（内部，不挂 IPC）。**无 `requestRefactor`（重构只经 convener 能力）**。
  - 方法均做入参防御（空 `projectRoot` ⇒ 结构化失败；仅接受当前导入项目根，沿 `importedProjectRoot` 口径）；返回结构化回执（`{ok:false, code, error}`），不抛。
- `main.ts`：
  - `registerHandler` 新增通道（§四）；敏感通道 `event.sender === win.webContents` 校验（沿 `tasks:list`/`project-state:get` 先例）；渲染侧推送经 `win.webContents.send`。
  - 窗口 `closed`：既有 `customerChannel.rejectAllPending` + `stopSession(null)` 即为 VCA/stable 卡的 fail-closed；**不新增第二套 reject**。stable-write/VCA 挂起中的卡片结算为 declined(notPresented)，不签发许可、不写快照。
  - 项目切换（`app:list-project`）：刷新冻结缓存、重建 `trunk:state` 推送（新项目）；旧项目取消的面板与既有 `directiveInput.setCurrentProject` 同模式。
- `preload.cjs`：白名单方法（只经 `invoke`/`on`）；不暴露 Node 能力；新增 `onTrunkState` 订阅（含 preload 侧 last-value 回放，沿 `directive:state` 先例可选）。

### 3.6 `app/desktop/i18n.ts`（条件）

预期**不改**；只消费 C3 冻结 key（`ui.versionChange.*`/`ui.refactor.*`/`ui.freeze.*`/`ui.stableWrite.*` 及必要 `main.*`）。若必须扩展 `DesktopTexts` 形状，属条件改动并在完成报告列明；不得硬编码中文、不得加 i18n allowlist。

### 3.7 测试文件

| 路径 | 动作 | 覆盖 |
| --- | --- | --- |
| `test/桌面应用/trunk.test.ts` | **新增（B-4）** | trunk IPC 回执/状态快照/客户卡通道/acknowledgments 结算/客户主权排除/修订在途抑制/apply 对账/重启/通知/收窄升级/恢复展示 |
| `test/桌面应用/version-change.test.ts` | **新增（B-10）** | VCA 提交入口/卡通道/批准/拒绝/客户主权/冻结/迁移/bootstrap 展示/detail vs upgrade/refactor/stable-write（卡、许可状态、mini re-pin 展示）/IPC/面板/重启/旧文案 |
| `test/桌面应用/stable-write.test.ts` | **条件（B-13；默认不建）** | 仅当 B-10 无法覆盖 stable-write 桌面集成时，停止回报并经增补确认后新增 |

## 四、IPC 面（D1 拟冻结契约）

> 通道名在 D1 冻结点确定；U1 只消费本表。所有渲→主入站仅接受**当前导入项目**的 `projectRoot`；非当前窗口 sender 一律 `{ok:false}`（沿既有先例）。

| 通道 | 方向 | 入参 | 回执/载荷 | 语义与依赖 |
| --- | --- | --- | --- | --- |
| `version-change:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, items: VcaSummary[]}` / `{ok:false, code, error}` | 待批/历史 VCA 只读摘要（applicationId/kind/initiator/flow/targets/status/trunk 结果）；B-8 查询 |
| `version-change:present` | 渲→主 invoke | `{projectRoot, applicationId}` | `{ok:true, status:"presented"\|"answered"\|"declined"\|"pending"}` / `{ok:false}` | 对 submitted VCA **重新发卡**（无通道/重启后重试）；不改 VCA 状态、不代选；B-8 必须提供“可重发卡”入口 |
| `stable-write:list` | 渲→主 invoke | `{projectRoot, limit?}` | `{ok:true, items: StableWriteSummary[]}` | stable 确认/续接记录（path/kind/base/target/status/decisionId/writtenAt）；**无 drift 字段** |
| `refactor:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, items: RefactorSummary[]}` | 重构审计（requestId/convener/flow/scope/status）；客户只读。**重构提交不设渲→主 IPC**（见下） |
| `doc-freeze:list` | 渲→主 invoke | `{projectRoot, limit?}` | `{ok:true, freezes: DocFreezeSummary[], cacheHealth:"ok"\|"missing-migrated"\|"corrupt-failclosed"}` / `{ok:false, code}` | 冻结清单只读 + 缓存健康；权威=R9 baseline；桌面不重建/不解冻 |
| `trunk:state` | 主→渲 push | `TrunkStatePayloadV1` | 单一状态源：trunkVersion、pinned run、stable 快照（workflow/boundaries hash）、冻结缓存健康、待批 VCA 计数/摘要、重构审计摘要、入口禁用原因 | U1 按钮/面板**只读这一份**（原团队计划约束）；D1+U1 冻结点确定形状 |
| `trunk:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, trunks: ...}` | trunk manifest 摘要/历史（P1.3 保留） |
| `trunk:upgrade-request` | 渲→主 invoke | `{projectRoot, reason, scope}` | `{ok:true, previewId, preview}` / `{ok:false, code}` | **仅紧急/恢复**；生成一次性 preview（previewId 绑定 reason/scope/hash，短 TTL）；常规内容变更拒绝并提示 stable-write/VCA（文案 C3） |
| `trunk:upgrade-confirm` | 渲→主 invoke | `{projectRoot, previewId, acknowledged:true}` | `{ok:true, status}` / `{ok:false}` | **仅 = D1 客户 UI 对同一 preview 的高危二次确认**（非卡通道、非版本变更决策）：previewId 一次性/过期拒绝、sender 校验、审计 `highRisk.acknowledged:true`；不接受渲染自报角色身份、无 judge/委托/指令触发路径；**不得用于 VCA/stable 的客户批准** |
| `trunk:refreeze-request` / `trunk:abandon-upgrade` / `trunk:recover-request` | 渲→主 invoke | 各 P1.3 形状 | 结构化回执 | P1.3 保留（恢复/重新冻结/放弃）；不自动执行，客户确认后应用动作 |
| `session:operator-request` / `session:operator-response` / `session:operator-expired` | 主↔渲（既有） | 既有 + `request.acknowledgments`（对象数组）/`payload.acknowledged`（id 数组） | 既有 | **VCA/修正案/stable/trunk 卡一律复用**；不新增卡 IPC 类别 |
| `session:operator-judge` | 主→渲（既有） | 既有 | 既有 | 主权卡不产生 judge 结果行（结构性排除） |

- **无 VCA/修正案/stable 卡的客户批准/拒绝专用 IPC**：这些客户决定只经 `session:operator-response`（请求快照校验），防止渲→主捷径绕过卡片通道。`trunk:upgrade-confirm` 是**紧急/恢复操作的第二确认**（previewId 一次性 + 审计），不是版本变更决策，也不得被复用于 VCA/stable（PM 审核 §4.7/F11 的「二选一」：本提案选定「D1 客户 UI 二次确认」，不做 trunk 卡通道；U1 只呈现 D1 下发的确认请求、不自建确认对话框/本地判定）。
- **无 `version-change:submit` / `stable-write:request` 渲→主通道（PM 审核 §4.7/F10 已裁决）**：VCA 提交只经发起角色能力（product/rapporteur 工具）；stable 写入确认只经 B-11 presenter；面板入口只做只读展示/重发卡/「在会话中提交」说明。U1 表单必须只读，不得以表单直接提交。若客户坚持表单式提交，属 D1 IPC/写集扩展，须另行确认，不阻断本 P1。
- **重构提交只经 convener 能力工具（PM 审核 §4.7/F11）**：渲染进程不能证明 convener 身份，`refactor:request` 渲→主 IPC **不提供**；`refactor:list` 只读保留。
- **单一推送源**：只保留 `trunk:state` 主→渲推送；不设 `doc-freeze:state`/`stable-write:state`/`version-change:state`/`refactor:state`（PM 审核 §4.7/F10）；面板打开时经 `*-list` 拉取。若 U1 论证确需独立推送，须 D1 冻结点统一增改（不双状态源）。

## 五、客户卡通道与呈现（含客户主权）

### 5.1 VCA 卡（detail-amendment / version-upgrade）

- **通道**：复用治理会话客户卡通道，顺序 `handbackOwnerRoleId`（trio=convener）→ `rapporteur` → `chief`（同 `requestRunChangeDecision`）；无可用会话/通道 ⇒ VCA 保持 `submitted`，桌面回 `{ok:true,status:"pending",code:"vca-channel-unavailable"}` 并通知幕僚；**不伪造批准**，不写任何状态。
- **生命周期**：`withRequestLifecycle(sourceRoleId:"application", requestId=vc-<applicationId>, notify:"none")`；`request.created`（cardKind application-owned decision）→ `presented`（customer）→ `resolved`（by customer）。`notify:"none"` 是因为既有文案会写「角色「application」的申请」；VCA 的幕僚通知由桌面按 Pipeline 结果显式发送（§5.5）。
- **卡面（B-8 冻结载荷 → CustomerInputRequest）**：`kind:"choice"`、`title`（C3 key）、`cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`、`flowId`（VCA.flowId）、`preview`（kind/发起者/targets 的 path/version/sha256/差异入口/摘要；`version-upgrade 批准=最终内容确认；detail-amendment 批准=提交/冻结门槛，逐项确认才是内容门槛`）、选项 `approve-version-change`（不推荐）与 `reject-version-change`（`recommended:true`，安全项，与 P1.6 一致）。
  - **注意**：`validateDecisionCardRequest` 要求**恰一个** `recommended:true`；VCA 卡推荐项设为 `reject-version-change`（安全方向，与 P1.6「推荐 reject」一致）。推荐项只影响「替我决策」的确定性默认，而该卡已被主权排除，实际**永不代选**。
- **批准前哈希重验**：由 B-8 在批准动作内重算 `toSha256` 与提交定格比对；漂移 ⇒ 拒绝批准/保持 submitted 重发卡；桌面把错误码映射为卡面/系统行提示（C3），**不自动重试批准**。
- **Bootstrap**：`baseTrunk:null` 的 VCA 卡面显示 bootstrap 语义（C3）；桌面只展示，不建 trunk（S4）。
- **拒绝/超时/关窗**：目标保持草稿/旧版本；桌面不冻结、不 re-pin；卡结算为 declined 时 VCA 状态由 B-8 推进为 rejected/保持 submitted（按 B-8 语义）。

### 5.2 修正案（detail-amendment）逐项确认

- VCA 批准后，B-8 接 P1.3 amendment runtime；桌面 `trunk.ts` presenter 呈现逐项卡：`item-apply`/`item-keep`/`item-cancel-amendment`（固定词汇，application-owned decision），只针对**实际变更项**（`change:none` 不发卡，AC-28）；边界扩大勾选走 `acknowledgments`（客户本人逐项勾选）。
- 全部确认后 `apply-amendment`/`defer-amendment` 最终卡（若 B-8/S4 保留最终卡）；桌面负责 `acknowledgments` 必选结算（§3.4）。
- 逐项卡与 VCA 卡同通道、同客户主权、同生命周期；`request.resolved` 只记 `by:"customer"`。

### 5.3 stable 写入确认（workflow / role-card / boundary）

- **workflow**：B-11 在写入请求时生成卡载荷（path/baseSha256/targetSha256/diffPreview）；桌面 `buildStableWriteCard` 组装轻量确认卡（**`cardKind:"stable-write"`，app-owned、独立白名单、永不判断、不要求 flowId**；选项 `approve-stable-write`/`reject-stable-write`，推荐 `reject-stable-write`），先经 `validateStableWriteCardShape`（恰一推荐/≥2 选项/path/base/target 齐全）再经治理会话通道呈现；**客户批准 ⇒ 桌面只把 outcome 交回 B-11**；一次性许可、写入与校验由 B-11/门禁完成（§六）。
- **role-card/boundary**：沿用既有 appointment-write 卡（语义不变，D1 不改其通道/校验）；写入成功后由编排钩子 mini re-pin；桌面只刷新状态/通知/面板，不介入许可。
- **拒绝**：不生成许可、不写；桌面把拒绝结果回执给 B-11，面板显示 rejected。
- **客户主权**：两张卡都不得进入 `tryAutoSelectDecision`/`planJudge`/委托/`@决策`；appointment-write 已有排除保持；stable 卡按 §3.4 词汇排除。
- **卡种与白名单（PM 审核 §4.5/F2 冻结裁决）**：VCA/修正案逐项/最终/trunk 逐项卡复用 `cardKind:"decision"`（application-owned + 真实 flowId）；**只有 stable workflow 卡新增 app-owned 卡种 `stable-write`**。C1 把 token 加入 `GovernanceCardKind`、**不加入** `GOVERNANCE_CARD_GROUP`（`governanceCardGroup` undefined ⇒ 永不判断）；C1 新增独立白名单 `GOVERNANCE_CARD_KINDS`（`GOVERNANCE_CARD_GROUP` 键集 + `stable-write`），C2a 的 `isGovernanceCardKind` 改读该白名单；编排在 `run-role.ts` 的 `CARD_KIND_ROUTE_HINTS` 补一行 `stable-write` 编译解锁（应用自有卡、角色工具不可发起）。`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`，结构校验由 D1 `validateStableWriteCardShape` 承担（不得绕过）。

### 5.4 VCA 卡「无通道保持 submitted 可重试」

- 桌面 `version-change:present` 可对 `submitted` VCA 重发卡；重发不改变 VCA 状态、不重复写 `version.change(submitted)`；卡请求 id 幂等（同 applicationId 同 requestId），`request.created` 去重按既有 `requestIdFor`/通知去重语义。
- 重启后：pending 卡按既有 C-08 标 `request.orphaned(restart)`；VCA 仍 submitted（编排状态），面板显示「等待重新发卡」；桌面**不自动重放**旧答题、不自动批准。

### 5.5 通知与审计归属

- 幕僚（chief）通知：VCA submitted/approved/rejected/applied、stable requested/written/failed、refactor requested/closed。文案 C3；`request.notified` 仅当复用生命周期且口径正确时使用，否则桌面系统行（`delivery-note`）+ 编排账本事件双份事实各自如实。
- **不冒充客户（PM 审核 §4.1）**：`request.resolved.by` 只写 `customer`；`version.change` 的 `approved/rejected` 由 B-8 写 `decidedBy:"customer"`（+ decisionId），而 `submitted`/`applied`/`superseded` 是 application 动作（`decidedBy` 缺省；applied 可带 decisionId）——桌面不得把 application 动作写成客户。
- refactor：**无客户卡/无客户决定**；客户面板只读审计（AC-7/AC-20）。

## 六、stable-write：一次性许可、哈希校验与异常接线

> 机械执行属门禁引擎（`stableWriteDecision({projectRoot, relPath, sha256, permit, now})` **纯函数**：不写盘、不消费、不发事件）与编排（B-7/B-11 pre-write 判定 + post-write 复核消费）；本节只定义桌面消费/外显，**桌面不缓存、不签发、不复算**许可。

1. **许可生命周期与字段（PM 审核 §4.3/F5）**：`requested`（卡呈现）→ `approved`（客户批准，B-11 生成一次性许可：绑定 path/kind/roleId/baseSha256/targetSha256/decisionId + `approvedAt`，**批准后 `expiresAt` 必填**（默认 TTL 30 分钟，C2c 定常量）、`consumedAt` 可选；`baseSha256` 为 `""` 表示写入前文件不存在）→ 写入（owner 角色按批准内容写）→ `written`（`consume` + `writtenAt`）/`failed`（异常）。`rejected` 不写。**过期/一次性消费后**再写必须重新确认（桌面面板如实显示 expired）。**失败的许可同时作废（failed/consumed），不得保留可复用的 approved 许可。**
2. **判定与消费点（PM 审核 §4.3）**：pre-write 由 gate 用纯函数校验 `status==="approved"`、path/kind/roleId 与 `stableWritePathOf` 一致、`sha256===targetSha256`、`baseSha256` 与当前文件一致（新文件时不存在）、未过期、未消费、许可与**同步许可快照**逐字段一致；无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝（fail-closed）。post-write 由 B-11 `completeWrite(actualSha)` 复核：`actual===targetSha` ⇒ 在 `stable-writes` 存储锁内标 `written`/`consumedAt`、刷新许可快照、执行 mini re-pin；不符/异常 ⇒ `failed` + 许可作废、不更新快照、进恢复。桌面/渲染不缓存、不签发、不复算许可。
3. **桌面缓存纪律与写入 hash 外显**：桌面**不缓存许可**；每次 `stable-write:list`/`trunk:state` 从 S4 查询读取；窗口关闭/重启后旧许可一律按失效处理（B-11 负责标记；桌面显示「已过期，请重新确认」）。写入 hash 校验结果由 B-11/门禁给出：`failed` 记录映射为面板/系统行（含 path/old/new hash/原因），**不提供「带漂移继续」**，不发第二次自动写；TOCTOU 残余窗口如实披露（T1 故障注入），桌面不补判。
4. **mini re-pin**：确认落地后 B-11 立即更新 trunk manifest 该文件快照（`artifacts.workflow`/`artifacts.boundaries[role]`），绑 decisionId/confirmationId，写 `trunk.state(op:"stable-repinned", origin:"customer", decidedBy:"customer")`；**不升 trunkVersion、不需要 VCA**。桌面：
   - 收到 stable-repinned 记录后刷新 `trunk:state`（trunkVersion 前后不变；stable 快照新旧 hash 与确认内容一致）；
   - 面板显示「stable 确认/续接记录」（path/decisionId/old-new hash/时间），**不再展示 drift**；
   - 若 trunkVersion 被错误递增 ⇒ 记录诊断并**不回写**（事实由编排纠正），面板如实展示。
5. **角色写权**：D1 不改 convener workflow 写权、不改 appointment-write 语义、不预授权直写。
6. **无确认/伪造/过期**：门禁拒绝（C2b）；桌面显示拒绝原因、禁用入口；不伪造 `written` 事件。

## 七、R9 冻结缓存：预加载、刷新与 fail-closed

- **预加载/刷新触发点**（D1）：项目导入（`app:list-project` 成功后）、会话开启、收到/查询到 `doc.freeze`/`version.change`/`stable-repinned`/trunk 切换事实后——调用 `refreshDocFreezeCache(projectRoot)`（S4 公共入口）；失败只诊断 + 置 `trunk:state.cacheHealth="unavailable"`。
- **权威**：R9 `versions.jsonl`；`doc-freezes.json` 为派生缓存（C2b/C2c 维护）。桌面只读两者的一致/健康状态，不重建、不双写、不双判。
- **missing vs corrupt**：missing ⇒ 由编排/门禁按迁移（既有文档一律冻结）执行并返回 `missing-migrated` 健康态；corrupt/不可读 ⇒ `corrupt-failclosed`，桌面：
  - 面板显示「冻结状态不可用；版本变更/覆盖保护已 fail-closed」；
  - 禁用依赖冻结判定的入口（VCA 重发卡、stable 确认卡、trunk 升级/恢复需客户确认的恢复路径按编排可用性）；
  - 不自动重建、不自动放开覆盖（AC-21「若提供」按 P1.6 原文，桌面不虚构恢复路径）。
- **迁移展示**：既有文档 `legacy-frozen`、可证明未确认草稿 `migrated-draft`（P1.6 §4.5）由 S2 提供视图；桌面只展示标注，不解冻、不改标注。

## 八、异常 fail-closed 与恢复接线（D1 视角）

| 情形 | 桌面行为 |
| --- | --- |
| 无治理会话/客户卡通道（VCA/stable） | 返回 `pending`/`unavailable`；保持 submitted；通知幕僚；提示打开会话后重试（`version-change:present`）；不伪造批准 |
| 窗口关闭 | 既有 `rejectAllPending` + `stopSession(null)`；卡片 declined(notPresented)、不签发许可、不写快照；VCA 保持 submitted；重启后不重放答题 |
| 重启 | pending 卡 `request.orphaned(restart)`；面板从编排状态重建（VCA/stable/refactor/trunk）；旧 permit 失效显示；不自动执行 |
| 冻结缓存损坏/不可读 | fail-closed 提示 + 禁用依赖入口；不自动重建/解冻 |
| VCA 批准前哈希漂移 | B-8 拒绝批准/重发卡；桌面展示漂移原因与「重新提交」指引；不冻结/re-pin |
| VCA 执行失败（schema/roster/D3/无边界） | 桌面展示 B-8 稳定错误码（C3 文案）；trunk 不变；旧主干继续可用 |
| stable 写入哈希不符/异常 | `failed` 记录 + 恢复指引；不更新快照；无 drift |
| refactor 越界 | B-9 拒绝并返回 VCA/修正案指引；桌面显示拒绝原因；不创建重构任务 |
| trunk 升级用于常规内容 | 桌面拒绝（禁用原因：仅紧急/恢复），指引 stable-write/VCA（AC-30） |
| 主进程 IPC 入参非法/越界项目 | 结构化 `{ok:false, code}`；无副作用 |
| Pipeline/Service 查询不可用 | 只读视图返回 `{ok:false}`；`trunk:state` 标 `unavailable`；不缓存陈旧「允许」状态 |

## 九、与既有 request.*、客户主权、判断器排除、run-change 的兼容

1. **run-change**：低层 API 保留（`requestRunChangeDecision`/`run:change-request`/`applyRunChange`），UI 入口移除由 U1 执行；**修订/VCA 在途抑制**自动弹卡（§3.3）；**preload 方法保留（低层 API/既有探针兼容），U1 不展示**；D1 冻结点确认消费者，不新增第二状态源（PM 审核 §4.7）。
2. **request.***：VCA/stable 卡复用既有生命周期（`sourceRoleId:"application"`、`notify:"none"`、`request.resolved.by` 仅 customer）；`request.created.cardKind` 必须属于 C1 的 **`GOVERNANCE_CARD_KINDS` 白名单**（VCA/逐项/trunk=`decision`，stable=`stable-write`；C2a 的 `isGovernanceCardKind` 改读该白名单，PM 审核 §4.5）；`request.resolved.selectedOptionIds` 仅审计，不污染 `targetRoleIds`（既有 D3 收口保持）。
3. **客户主权**：主权卡（VCA/修正案/trunk/stable）永不进入 `planJudge`/`tryAutoSelectDecision`/**`tryApplyDirectiveDecision`**/委托（未实施）；结算后再验 `operatorId`/`judge`（§3.4-5）；Pipeline 侧再验 `decidedBy`（C2c）。
4. **appointment-write**：语义、审批链、D3 事实校验、写后刷新（`write-safety.test.ts`）**零变化**；D1 只在写入成功后消费 mini re-pin 结果。
5. **下载/需求变更**：零变化；新增能力位与通道不改变既有注入判据（项目角色仍无 `customerInput`；`TRIO_CARD_KINDS` 不改）。
6. **观测/审计三态**：D1 不写 `decidedBy` 到账本（编排写）；桌面只保证不把 judge/directive 结果送进主权 Pipeline，也不把 application 冒充 customer。

## 十、九条注意点映射（§5.4 + §10.5）

| # | 注意点（§5.4） | D1 落点 |
| --- | --- | --- |
| 1 | R9 权威 | 只读 `doc-freeze:list`/`trunk:state`；刷新 `refreshDocFreezeCache`；不写 `versions.jsonl`/不写缓存文件；一致性告警由编排提供、桌面展示 |
| 2 | 守卫真实调用点 | D1 不调 `versionedDocOverwriteDecision`/`checkVersionedDocWrite`；不改守卫；卡路径只依赖 Pipeline 呈现结果；冻结缓存刷新是唯一桌面侧联动 |
| 3 | 迁移默认 | 面板消费 `legacy-frozen`/`migrated-draft` 视图；不解冻；missing/corrupt 展示按 §七 |
| 4 | Bootstrap | VCA 卡/trunk 面板展示 bootstrap（`baseTrunk:null`、`source:"bootstrap"`）；pin 只 pin 冻结文档由编排保证；桌面不建 trunk |
| 5 | VCA 通道/重验 | 通道 convener→rapporteur→chief；无通道 pending/retry；漂移错误外显、不自动重批 |
| 6 | 重构写集 | **只经 convener 能力工具提交**（B-9 校验；无渲→主 `refactor:request`）；客户无批准卡；面板只读审计；不派 worker、不写代码 |
| 7 | detail 最小项 | 只对实际变更项发逐项卡（B-8/S4 提供）；`change:none` 不发卡；acknowledgments 必选 |
| 8 | stable 单一路径 | workflow 卡 + appointment-write 不变 + trunk 升级收窄；三路径互斥/禁用原因由 `trunk:state` 外显 |
| 9 | 基线披露 | HEAD 89b1fb2/B0 引用；锚点符号化；旧证据不复用（本提案与实施报告均披露） |

| # | 注意点（§10.5） | D1 落点 |
| --- | --- | --- |
| 1 | workflow 写路径 | 轻量确认卡（preview diff/base/target hash）；不预授权直写；appointment-write 语义不变 |
| 2 | stable 写入门禁 | 桌面只呈现/外显；许可/哈希/fail-closed 由 C2b/B-11；无 drift 展示 |
| 3 | mini re-pin | 桌面消费 stable-repinned 记录刷新快照；trunkVersion 不变；不写 manifest |
| 4 | VCA 收窄 | VCA 卡只出现在 contract/roster/execution（B-8 校验）；workflow/boundary 引导 stable 卡（C3 文案） |
| 5 | 模块归属 | 新模块在 `app/desktop/`；IPC/卡属 D1；stableWriteDecision 属门禁；B-11/S4 属编排 |
| 6 | 不升 trunkVersion | 面板/状态展示 stable 续接记录；若发现被升 ⇒ 诊断不回写 |
| 7 | 其余 §5.4 | 见上表 |

## 十一、契约冻结前澄清与 PM 裁决落实

> PM 审核（368 行 / `2cb04cae…`）已对桌面窗口 §十一-1..11 逐项裁决（审核 §5.3），F1/F2/F5/F9/F10/F11 为阻断项、本版已按裁决修订。以下保留**仍需在 C1/C2a/C2b/C2c/C3/S4/D1 冻结点落实**的事项；无剩余需重开闸门 0/1/2 的范围问题。

1. **卡种/白名单（PM 裁决已定，C1/C2a 落实）**：VCA/修正案逐项/最终/trunk 逐项卡复用 `cardKind:"decision"` + `application:true` + 真实 `flowId`；**只新增 app-owned `stable-write`**。C1：加入 `GovernanceCardKind`、新增独立白名单 `GOVERNANCE_CARD_KINDS`、**不加入** `GOVERNANCE_CARD_GROUP`；C2a：`isGovernanceCardKind` 改读白名单；编排：`run-role.ts` 的 `CARD_KIND_ROUTE_HINTS` 补 `stable-write` 一行编译解锁；`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`，D1 以 `validateStableWriteCardShape` 做独立最小结构校验。D1 不自行发明 token/白名单。
2. **S4/C2c 公共查询/呈现形状（采纳，S4 冻结）**：`listVersionChanges`、`listStableWrites`、`listRefactorRequests`、`listDocFreezes`、`listTrunk(State)`、`presentVersionChangeCard`、`presentStableWriteCard`、`refreshDocFreezeCache`、`hasPendingVersionChangeOrAmendment(flowId)` 的名称/入参/返回/错误码在 S4 冻结；只读、有界、项目相对路径、无密钥；不同形即停止回报。
3. **提交入口（PM 裁决已定）**：VCA 提交只经发起角色能力工具（product/rapporteur）；**重构只经 convener 能力工具**；stable 写入确认只经 B-11 presenter；**不新增 `version-change:submit`/`refactor:request` 渲→主 IPC**；U1 表单只读 + 「在会话中提交」说明。剩余：能力函数/工具名由运行时核心/编排（C1/S4）冻结；D1 只注入、不扩写权。
4. **`acknowledgments`（PM 裁决已定，F1）**：C1 形状 `CustomerInputAcknowledgement[]`（`{id,label,required}`）；D1 原样透传，`respondUnsafe` 按 required 结算；`CustomerInputOutcome.acknowledged: string[]`；**`request.resolved` 不加字段**。剩余：C1 最终类型名/字段以冻结为准。
5. **通知/文案归属（采纳，C3 冻结）**：VCA/stable/refactor 的幕僚通知与系统行文本 key 归 C3（`ui.*`/`main.*`；含 `ui.trunk.*` 家族）；桌面显式通知恰一次、`notify:"none"`、不硬编码。缺 key 即停止。
6. **引用版本（PM 裁决已定）**：V1 v1.1 = 350 行 / 归一化 `3c40acad…`；B0 = 221 行 / `8c6272d5…`；G2a = 25 行 / `bfac5781…`；E1/沟通负责更正旧引用（`75bf7a49…`/173 行/16 行快照不再引用）。本提案已按此更新。
7. **trunk IPC 保留集与 `trunk:state`（PM 裁决已定）**：无客户侧 `trunk:refactor-request`；保留 `trunk:state/list/upgrade-request/upgrade-confirm/refreeze-request/abandon-upgrade/recover-request`；**单一 `trunk:state` 推送**；`trunk:upgrade-confirm` 仅 = D1 客户 UI 对同一 `previewId` 的紧急/恢复二次确认（一次性/过期拒绝/审计；非卡通道、非 VCA/stable 批准捷径）。剩余：previewId 形状/TTL 与 U1 呈现协议在 D1+U1 冻结点统一。
8. **stable 卡推荐项与校验（PM 裁决已定）**：`reject-stable-write` 为 `recommended:true`；新卡种仍须恰一推荐/≥2 选项/path/base/target 齐全；结构校验由 D1 独立实现；C3 冻结卡面 key 后实施。
9. **AC-21 恢复路径「若提供」（采纳）**：桌面只展示编排是否提供恢复；不虚构恢复 IPC/自动重建；E2 按 P1.6 原文判定。
10. **`version-change:present` 重发卡（采纳）**：允许对同一 submitted VCA 多次重发；不重复写 `version.change(submitted)`、不重复通知、requestId 幂等；B-8 必须提供可重发入口。
11. **B-13 条件（采纳）**：stable-write 桌面测试并入 B-10；拆分须停止回报并经增补程序确认。
12. **stable 许可字段/消费（PM 裁决已定，F5）**：C1 补 `approvedAt`/`expiresAt`（批准后必填）/`consumedAt?`；`baseSha256=""` 表示新文件；pre-write 纯函数判定、post-write 复核后消费、失败作废许可；TTL 默认 30 分钟（C2c）。剩余：C2c 把 TTL/`expiresAt` 暴露给桌面仅用于**外显**（桌面不复算过期）。
13. **U1 的 `DECISION_KINDS` token**：`stable-write` 是否加入 U1 dialog 优先级集合，由 D1+U1 冻结点确认（一行改动、建议加入）；VCA 复用 `decision` 不需新增。

## 十二、风险与控制

| 风险 | 影响 | 控制 |
| --- | --- | --- |
| 卡种/白名单实现不一致（PM 已裁决） | 高：卡无法记账/被误判 | C1 `GOVERNANCE_CARD_KINDS` + C2a 消费 + 编排 route hint 同一形状；D1 只按冻结 token 编码 |
| VCA 卡被判断器/指令/委托代选 | 高：客户主权失效 | 词汇/卡种排除 + **`tryApplyDirectiveDecision` 排除（F9）** + `tryAutoSelectDecision` 早退 + 结算后二次校验 + Pipeline `decidedBy` 三重复核 |
| 无通道时误以为已批准 | 高 | 保持 submitted + `pending` 回执 + 通知幕僚；绝不伪造 |
| 重启后重放旧答题/自动批准 | 高 | `request.orphaned(restart)`；不重放；面板从编排状态重建 |
| 冻结缓存陈旧/损坏放行 | 高 | `refreshDocFreezeCache` 触发点列全；缺失/损坏 fail-closed 外显；不缓存“允许”结论 |
| stable 卡与 appointment-write 双路径漂移 | 中高 | workflow 只走 stable 卡；role-card/boundary 只走 appointment-write；不新增第三路径 |
| permit 过期/重复消费 | 中高 | 桌面不缓存许可；每次都查；重启后显示过期；门禁一次性校验 |
| 双状态源（trunk:state vs version-change:state） | 中 | 单一 `trunk:state` 推送；读接口只做明细 |
| `request.*` 审计与 `version.change` 重复/不一致 | 中 | `notify:"none"` + 编排事件为事实；桌面写行只做展示；E1 披露 |
| i18n 缺 key/硬编码 | 中 | 全部 `mainT`；缺 key 停止；i18n guard 零违规 |
| IPC 越权（渲染侧伪造项目根/动作） | 中 | 仅当前导入项目根；sender 校验；结构化回执；无批准捷径 IPC |
| 影响既有 run-change/version-decision/download | 中 | 加法为主；提取会话选择 helper 时 run-change 行为逐字回归；既有测试全跑 |

## 十三、验收证据贡献（D1 视角，不替代 V1）

### 13.1 AC 映射（桌面侧贡献）

| AC | D1 覆盖 / 证据 | 依赖 |
| --- | --- | --- |
| AC-3 | VCA 卡由治理会话通道呈现；发起角色/kind 由 B-8 卡面显示；幕僚仅通知（无以幕僚通道作审批的路径）；`version-change.test.ts` | B-8 |
| AC-4 | 批准/拒绝卡客户本人；`request.resolved.by:"customer"`；detail 批准后只发逐项卡；拒绝不冻结/re-pin；拒绝 `judge`/`directive` 结算；替换决策/委托/指令场景负例 | B-8/S4 |
| AC-5（桌面侧） | upgrade 卡只显示 contract/roster；批准前漂移错误外显；不代批；目标范围由 B-8 校验 | B-8 |
| AC-6（桌面侧） | 逐项卡 apply/keep/cancel + acknowledgments；只显示实际项；取消/失败不 re-pin（状态展示） | S4 |
| AC-7/AC-20（桌面侧） | 客户侧无重构按钮（U1）；**重构能力（convener 工具）无客户卡**；`refactor:list` 只读审计；越界回执带 VCA 指引 | B-9 |
| AC-8（桌面侧） | refactor 与 VCA 通道/卡分离；refactor 不写 `version.change`、无 `decidedBy` | B-9/B-8 |
| AC-9（桌面侧） | `trunk:state` 提供入口/禁用原因；客户侧无重构入口；旧 run-change UI 入口由 U1 移除（D1 保留低层 API） | U1 |
| AC-10（桌面侧） | 迁移标注展示（legacy-frozen/migrated-draft）、stable 基线无 drift 展示 | S2 |
| AC-11/AC-31（桌面侧） | 主权卡只产 customer；桌面不写 `decidedBy`；不冒充客户；通知文案区分应用动作/客户决定 | C2a |
| AC-12（桌面侧） | 重启后从 manifest/journal 恢复面板；不自动执行未完成 apply | S4 |
| AC-13（桌面侧） | appointment-write 语义不变；mini re-pin 只消费结果；`write-safety.test.ts` 回归 | S4 |
| AC-15（桌面侧） | 冻结缓存刷新触发点、缺失/损坏 fail-closed 外显；不依赖死代码 `checkVersionedDocWrite` | C2b |
| AC-16 | P1.3 桌面既有语义回归（trunk 面板/逐项/对账/通知） | S4 |
| AC-17 | 旧 run-change/版本决策 API 保留；preload 方法保留；旧文案迁移由 U1/C3 | C3/U1 |
| AC-18 | 卡通道顺序/无通道 pending；product 无 customerInput（结构）；卡面 path/version/hash/差异/语义；客户主权；detail acknowledgments；stable 卡 diff/hash；appointment-write 不变 | C1/C3 |
| AC-19（桌面侧） | 桌面不扩写权；workflow/boundary 不作为 VCA 目标（B-8）；跨作者提交不获写权（能力只在发起角色会话注入） | C1/C2c |
| AC-21 | 冻结损坏 fail-closed 提示；恢复路径（若提供）只外显 | C2c |
| AC-23（桌面侧） | 新模块零硬编码中文；key 消费完整 | C3 |
| AC-25（桌面侧） | bootstrap 卡面/面板标注；不建 trunk | S4 |
| AC-26（桌面侧） | 漂移错误外显；不自动重批 | B-8 |
| AC-27（桌面侧） | `doc-freeze:list` 与缓存健康展示；不双写双判 | C2b/C2c |
| AC-28（桌面侧） | 只发实际项卡/最终卡；none 不发卡；无四类强制 | S4 |
| AC-29（桌面侧） | 卡面 target kind 展示（contract/roster/execution）；workflow/boundary 引导 stable | B-8/C3 |
| AC-30 | 常规 stable 只走 stable 卡；trunk 升级仅紧急/恢复（禁用原因）；VCA 不显示 stable 目标 | S4/U1 |
| AC-32 | 旧 trunk 状态映射展示（proposed→submitted 等） | S4 |
| AC-33 | workflow 卡 diff/base/target hash 展示；批准写/拒绝不写；appointment-write 回归；客户主权 | B-11/C3 |
| AC-34（桌面侧） | 面板消费 stable-repinned：快照更新、decisionId 绑定、trunkVersion 不变 | B-11 |
| AC-35（桌面侧） | 无许可/伪造/过期拒绝原因外显；hash 不符 failed 展示；无 drift | C2b/B-11 |
| AC-36（桌面侧） | 面板无 drift、显示确认/续接记录；卡可查看 diff；i18n 两语言；旧文案迁移 | U1/C3 |

### 13.2 新增测试（D1 完成时；P1 不运行）

**`test/桌面应用/version-change.test.ts`（B-10）**：

1. `buildVersionChangeCard` 映射：kind/发起者/targets/path/version/sha256/diff 入口/摘要/语义说明；`application:true`、`cardKind:"decision"`、真实 flowId、`recommended` 恰一（reject）；缺字段 ⇒ 不发卡。
2. `buildStableWriteCard`/`validateStableWriteCardShape`/`buildDetailItemCard`/`buildFinalApplyCard`：`stable-write` 卡种、字段/preview/选项词汇、恰一推荐/≥2 选项/path/base/target 齐全负例；不计算哈希；`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`。
3. `SessionManager` 集成：VCA 卡经 convener→rapporteur→chief 顺序呈现（无 convener 时降级）；无通道 ⇒ `{status:"pending"}`、VCA 状态未被桌面改动、通知幕僚。
4. 批准/拒绝：`request.created/presented/resolved`（`sourceRoleId:"application"`、cardKind、by customer、selectedOptionIds）；`notify:"none"` 时不发 `request.notified`、桌面显式通知恰一次。
5. 客户主权（F9）：`judge:`/`directive:` 结算 ⇒ 拒绝（unavailable），Pipeline 不被调用；**`tryApplyDirectiveDecision` 对 VCA/stable 卡返回 false**（不消费指令、不写 `directive:<id>`、不结算）；`tryAutoSelectDecision` 不代选；appointment-write 回归。
6. acknowledgments（F1）：**对象数组** `{id,label,required}` 透传；required 缺失/多余/非数组 ⇒ `{ok:false}`、pending 保留；齐全 ⇒ settlement 值含 `acknowledged: string[]`；未声明卡零行为变化。
7. 冻结/迁移/bootstrap 展示：`doc-freeze:list` 透传视图与 cacheHealth；corrupt ⇒ 入口禁用原因；bootstrap VCA 卡面。
8. detail vs upgrade：upgrade 卡只有 contract/roster；detail 批准后逐项卡只对实际项；取消不改 trunk（桩件断言）。
9. refactor：**只经 convener 能力提交**（非 convener 会话不注入、工具不注册）；无客户卡；`refactor:list` 只读；越界指引。
10. stable-write（F5）：卡呈现/拒绝不写/批准回执；`stable-write:list` 记录无 drift；expired/失败许可不可复用展示；hash 不符 failed 展示；trunkVersion 不变。
11. IPC：`version-change:list/present`、`stable-write:list`、`refactor:list`、`doc-freeze:list` 的 sender/项目根/非法入参回执；`trunk:state` 推送形状（单状态源）；**无 `version-change:submit`/`refactor:request` 通道**（结构断言）。
12. 重启：pending 卡 `request.orphaned(restart)`；VCA 保持 submitted；`version-change:present` 可重发；不重放旧答题。

**`test/桌面应用/trunk.test.ts`（B-4）**：

1. `trunk:state` 快照（trunkVersion/pinned run/stable hash/冻结健康/待批 VCA/重构摘要/禁用原因）单一来源。
2. `trunk:list`/`trunk:upgrade-request/confirm`（紧急/复用例、常规内容拒绝）、`refreeze/abandon/recover` 回执；`trunk:upgrade-confirm` 仅接受同 previewId 的客户 UI 二次确认（一次性/过期拒绝、sender 校验、无 judge/委托/指令路径）；不得用于 VCA/stable 批准。
3. 逐项卡/汇总卡/最终卡通道 + acknowledgments（对象数组）结算 + `decidedBy` 二次校验。
4. 客户主权排除（替我决策/`tryApplyDirectiveDecision`/judge 负例）。
5. 修订/VCA 在途抑制：冻结提案卡不自动弹 run-change；显式 `run:change-request` 仍在。
6. apply 对账/重启：manifest/journal 前后状态、失败不改 trunk、重启恢复展示。
7. 通知：幕僚通知恰一次、无审批/代选。
8. 旧文案迁移的桌面侧断言（系统行 key）。

### 13.3 精确命令与证据

1. `node --test test/桌面应用/trunk.test.ts test/桌面应用/version-change.test.ts`。
2. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"`：对照 B0 桌面套件 **562/562（57 文件）**；仅允许 +新增测试；**新增确定性失败=0、新增 skip=0**；任何新增失败停止定位。
3. `npm run typecheck`（exit 0）。渲染侧 `typecheck:renderer`/`build:renderer` 由 U1 负责（T3 总口径另计）。
4. 受影响既有精确文件（均在边界单文件条目内）：`run-change.test.ts`、`run-change-trigger.test.ts`、`run-change-entry.test.ts`、`version-decision.test.ts`、`decision-service.test.ts`、`pending-card-restart.test.ts`、`session.test.ts`、`interface.test.ts`、`operator-channel.test.ts`、`rejection-copy.test.ts`、`write-safety.test.ts`、`download-request.test.ts`、`download-decision.test.ts`、`acceptance-return-card.test.ts`、`run-pin.test.ts`、`chain-enforcement.test.ts`（条件）。逐条理由在完成报告列出；不为保绿改断言/加 skip。
5. 证据：每个改动/新增文件 `git hash-object` + `sha256sum`；`git status --short`/`git diff --name-only`/`git diff --cached --name-only`（暂存空）落在 §三写集；原始输出/退出码/计数；真实 Electron 截图由 T2 统一取证（D1 可按测试角色要求提供夹具/仅读脚本，不写 `test/桌面应用/e2e/` 新脚本）。

## 十四、停止回报条件（任一命中即停止，不写代码）

1. 需要 B-1..B-11 之外的新边界路径/新角色/扩大权限（含第三个 `test/桌面应用/` 文件、`app/renderer/**`、`src/**`、`package.json`/构建配置）。
2. C1/C2a 未按 PM 裁决落实 `stable-write` 卡种/`GOVERNANCE_CARD_KINDS` 白名单/route hint，而实施又必需记账/呈现。
3. S4/C2c 不提供 §十一-2 的公共查询/呈现/刷新句柄，或形状无法按本提案适配。
4. 需要桌面计算哈希/permit/冻结判定/trunk 更新，或需要读写 `.ans/**`。
5. 需要打开项目角色 `customerInput`、修改 `TRIO_CARD_KINDS`/`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS`、或改 `validateDecisionCardRequest` 语义（超出 C1/C2b 冻结面）。
6. 判定器/委托/`@决策` 无法在不改变其他卡种行为的前提下排除主权卡。
7. 需要改动既有 run-change/版本决策/下载/需求变更语义才能完成 VCA 通道。
8. C3 缺必要 i18n key 且无法以既有 key 表达（不得硬编码/不得加 allowlist）。
9. PM 裁决的引用版本/卡种/事件归属/AC 与本提案出现实质冲突，或需要重开闸门 0/1/2。
10. 需要新增 IPC 类别之外的渲→主捷径（客户批准/拒绝直达管道）。

## 十五、必要 vs 可选、自检与状态

- **必要**：两个新模块（`version-change.ts`、`trunk.ts`）；`session.ts` 通道选择 helper + 能力注入 + 生命周期 + 抑制 + 缓存刷新；`customer-input.ts` 主权判据（含 `stable-write` 卡种与 `tryApplyDirectiveDecision` 排除）/acknowledgments 对象数组/二次校验；`interface.ts` deps/方法/装配；`main.ts` IPC/关窗/项目切换；`preload.cjs` 白名单；`trunk:state` 单一状态源；B-4/B-10 测试；受影响既有测试回归。
- **可选/不实施**：O1–O12 全部不选（V1 §1.5 N/A）；不做 VCA 批量确认/草稿协作/注册表导出/搜索/多目标拆分；不做第二套状态源/第二套卡队列/第二套判断器/第二套冻结缓存；不建 `test/桌面应用/stable-write.test.ts`（B-13 条件未触发）。
- **自检**：
  - [x] 只读核对 P1.6/V1/增量/原团队计划/B0/boundary/当前代码/PM 审核记录；未改任何输入文档。
  - [x] 写集全部在 Section 1 内（`app/desktop/` 目录、`app/main.ts`、`app/preload.cjs`、B-4/B-10 精确测试条目）；未提新边界路径/角色/权限；B-13 条件未触发。
  - [x] 未提出改 `src/**`、`app/renderer/**`、角色卡/边界、`docs/scheduling|acceptance|communication/`。
  - [x] 覆盖 §10.8 桌面行全部要点：`version-change:*`/`stable-write:*`/`refactor:*`/`doc-freeze:*` IPC；客户卡通道；客户主权；acknowledgments；R9 缓存/许可；两个测试。
  - [x] 覆盖 §5.4 九条 + §10.5 七条（§十映射）。
  - [x] 按 PM 审核 F1/F2/F5/F9/F10/F11 修订（映射见 §十七）：ack 对象数组、`stable-write` 卡种、许可字段/消费、`tryApplyDirectiveDecision`、无 submit/refactor IPC、trunk 确认约束；引用刷新（V1 `3c40acad…`、B0 221 行 `8c6272d5…`、G2a 25 行 `bfac5781…`）。
  - [x] 状态 `proposal-only`；未写产品/测试代码、未运行实施测试、未改 boundary/changelog、未 commit/push。
  - [ ] 待项目管理**复审**（按新版本/新哈希；不自行评审放行）；复审通过且 P1.6 契约冻结（C1/C2a/C2b/C2c/C3/S4）后才进入 D1。

## 十六、参考

- P1.6：`docs/planning/2026-11-04_design_trunk-amendment-model.md`（1151 行 / `fccb1f54…` / `1e260646…`）。
- V1 v1.1：`docs/acceptance/trunk-amendment-model-criteria-v1.md`（350 行 / 归一化 `3c40acad…`；PM 审核 §1.3-1 裁决为当前版本，`75bf7a49…` 旧快照由沟通/统筹更正）。
- 团队计划增量：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md`（468 行 / `911974fa…`）。
- 原团队计划：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model.md`（721 行 / `ed6d3484…`；§4.1 D1 的 `app/desktop/trunk.ts`（新）与 `trunk:*` 清单）。
- 修订版闸门 0 / IA / G2a：`docs/communication/2026-11-04_intent-change_freeze-and-refactor-ownership.md`、`docs/communication/2026-11-04_authorization_trunk-amendment-ia.md`（37 行 / `0bed4240…`）、`docs/communication/2026-11-04_gate2-addendum_trunk-amendment-B5-B10.md`（**25 行 / `bfac5781…`**；PM 审核 §1.3-2 裁决为当前版本；V1 的 16 行 `d41665d3…` 引用由沟通更正）。
- B0：`角色卡/测试/docs/change/2026-11-04_trunk-amendment-B0-baseline.md`（**最终版 221 行 / `8c6272d5…`**；桌面套件 562/562；旧 173 行/`27f9b94d…` 勿引用）。
- PM P1 审核：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（368 行 / `2cb04cae…`）。
- 同级先例（只读）：`角色卡/桌面窗口/docs/change/2026-11-04_download-requests-P1-proposal.md`、`2026-11-03_customer-authorization-plane-P1-proposal.md`。

## 十七、修订记录（Revision 1，2026-11-04）

- **触发**：PM 审核（368 行 / `2cb04cae…`）结论 `needs revision`；桌面窗口必修 F1/F2/F5/F9/F10/F11 + 引用刷新（审核 §十）。本修订只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `89b1fb2`；`git status --porcelain -- src app test` 为空。
- **上一版**：437 行 / `7fe52f3c9d34e734e3d3bee1add0bf35d511ef92634d33440bebf5ec08e0178e`（审核对象；本版取代，旧哈希不复用）。

| 审核项 | 处置（本版） | 位置 |
| --- | --- | --- |
| **F1**（阻断） | `acknowledgments` 改为 C1 **对象数组** `CustomerInputAcknowledgement[]`（`{id,label,required}`）；`respondUnsafe` 按 required 结算；`CustomerInputOutcome.acknowledged: string[]`；`request.resolved` 不加字段 | §3.4-4、§5.2、§十三 13.2 |
| **F2**（阻断） | **VCA/逐项/final/trunk 逐项 = `decision` + 真实 flowId；只新增 app-owned `stable-write`**；C1 `GOVERNANCE_CARD_KINDS` 白名单（不进 `GOVERNANCE_CARD_GROUP`）；C2a 改读白名单；编排 `run-role.ts` route hint 一行；D1 `validateStableWriteCardShape` 独立结构校验 | §三.1、§5.3、§九、§十一-1 |
| **F5**（阻断） | 许可字段 `approvedAt`/`expiresAt`（批准后必填）/`consumedAt?`；`baseSha256=""` 新文件；pre-write 纯函数、post-write 复核消费、失败作废许可、TTL 30 分钟、TOCTOU 披露；桌面只外显 | §六、§十一-12 |
| **F9**（阻断） | 符号更正为 **`tryApplyDirectiveDecision`**；明确其未调用主权谓词、D1 在其进入 `applyDecisionDirective` 前加入早退；谓词纳入 `stable-write` 卡种；列入测试（AC-5 支撑） | §1.1/§1.2、§3.4-1/2、§九、§十三 13.2 |
| **F10**（阻断） | **无 `version-change:submit` 渲→主 IPC**（VCA 只经角色能力工具）；U1 表单只读；**单 `trunk:state` 推送**，不设 `*-state` 第二源 | §四、§九、§十一-3/7 |
| **F11**（阻断） | **重构只经 convener 能力工具**（无渲→主 `refactor:request`；`refactor:list` 只读）；`trunk:upgrade-confirm` 限定为同一 previewId 的客户 UI 紧急/恢复二次确认（一次性/过期/sender/审计；非卡批准捷径） | §三.3/3.5、§四、§十一-7、§十三 |
| 引用刷新 | V1 350 行/归一化 `3c40acad…`；B0 最终版 221 行/`8c6272d5…`（旧 173 行/`27f9b94d…` 勿引用）；G2a 25 行/`bfac5781…`；PM 审核 368 行/`2cb04cae…` | 头部、§十六 |
| 非阻断 | `version.change` applied/superseded = application（不冒充客户）；函数名更正；风险/停止条件更新 | §5.5、§十二、§十四 |

- **未改项（保持）**：写集与边界（`app/desktop/` 目录、main/preload、B-4/B-10；B-13 未触发）；无新角色/扩权；桌面不写 `.ans`/不做冻结/permit/hash 判定；客户主权与 fail-closed 方向不变；不 commit/push。
- **状态**：`proposal-only`；待 PM **复审**（以本版行数/SHA-256 为准；本文件不自引用最终哈希）。
