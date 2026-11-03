---
id: customer-authorization-plane-p1-review
type: change
title: P1 实现提案审核：客户授权平面（五角色）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: recommend-approval
related: [customer-authorization-plane]
events:
  - date: "2026-11-03"
    kind: created
    summary: 只读审核运行时核心/项目管理/编排/桌面窗口/桌面UI 五份 P1 提案；结论 needs revision（含 1 项需统筹/闸门 2 裁决的阻断项）
  - date: "2026-11-03"
    kind: revised
    summary: 窄复审 Revision 1：复算五份修订稿哈希；P1-CAP-01..08 七项闭合、P1-CAP-08 部分；新增 P1-CAP-15（C1 卡内入口未明确）与 P1-CAP-16（C2 phase3b/4b 写集文字越界）；结论仍 needs revision
  - date: "2026-11-03"
    kind: revised
    summary: 窄复审 Revision 2：复算五份修订稿与输入哈希；P1-CAP-15/16/17/18 全部闭合，跨提案一致性与写集核对通过；结论 recommend approval，P1 收口，可进入 A1/A2/A3 契约冻结
---

# P1 实现提案审核：客户授权平面（五角色）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**（闸门 2 已确认，本次不重判）。
- **审核角色 / 节点**：项目管理（固定角色、独立只读上下文）；团队计划 §5.1 **P1 实现提案与审核**；按 `ans-governed-construction/references/proposal-review.md` 与团队计划 §5.1/§7 执行。
- **审核性质**：实现提案审核；**不是客户批准、不是闸门、不是实施授权、不是测试结果、不是验收结论**，不替代 V1/E2。
- **结论**：**`needs revision`**。五份提案方向、写集主体、分层与 T3 口径基本符合已确认的 P1.1/V1/团队计划，但存在**契约冻结前必须收口的修订项**；其中 **P1-CAP-08（AC-22 shell 卡模态冲突）不是任一作者可在现有写集内单独修复**，必须由统筹/闸门 2（必要时闸门 1）裁决。**在全部阻断项收口前，不建议进入契约冻结，A1/A2/A3/B1/C1/C2 均不开工。**
- **写入**：仅本文件（`角色卡/项目管理/docs/change/`，本角色 Section 1 目录条目）。未改提案、产品/测试代码、其他角色文档、角色卡、边界、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`；未 commit/push；未接触客户。

## 一、审核对象与哈希（审核时点复算）

| # | 角色 | 提案路径 | 行数 | SHA-256 | 与作者回报 |
| --- | --- | --- | --- | --- | --- |
| 1 | 运行时核心（A1） | `角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | **148** | `9ab7ce0a7caeee5e9fd32733c7012259eb5b48b4ffe2ff318a30fc4309a82147` | 一致 |
| 2 | 项目管理（A2/A3） | `角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | **150** | `cf362147812d02bdea0e37bfa4795fb8e43f6c4f1d158ce7f46f6fb0098c0536` | 一致 |
| 3 | 编排（B1） | `角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | **161** | `998abd9bd7534ba04fcf2807eff8b3e640f81c12d12a22f723c809295ee2ab33` | 一致 |
| 4 | 桌面窗口（C1） | `角色卡/桌面窗口/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | **180** | `eec49e65a1c10d51ef6ba250f2d84819d2673824105b3afbddeac1876d7df546` | 一致 |
| 5 | 桌面UI（C2） | `角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | **112** | `fe113942caad08aedfaf1b9565cddcd034eb6552098547bc1d8095bdbd16f743` | 一致 |

五份均为 `proposal-only, no code`。审核时点 HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空、`git diff --cached --name-only` 为空。H1 的 B-1..B-4 七条边界条目已落地（运行时核心 +2、编排 +3、桌面窗口 +2）。

## 二、输入版本与基线（审核时点复算）

| 输入 | 行数 | SHA-256 | 备注 |
| --- | --- | --- | --- |
| 团队计划 v1（闸门 2 确认） | **653** | `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3` | 范围/写集/阶段/证据口径依据 |
| 方案 P1.1（闸门 1 客户确认版，语义基线） | **1199** | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` | 冲突时以 P1.1 为准 |
| 方案 P1.2（盘上当前，R1/R2 编辑性收口） | **1209** | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | V1 §1.2.1 已确认语义等价；不重开闸门 1 |
| 独立复核记录 | **132** | `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3` | P1.0 F1–F9 + P1.1 再复核 |
| V1 实施前标准（含 §1.2.1 版本注记） | **1171** | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-1..AC-24 判定依据 |
| 沟通记录（当前） | **150** | `5d2858cdc42be602fe751cfee0882166e9ac07bd89486f4816bc5efcacc34a5e` | 含闸门 0/1/2、IA、V1/P1.2/B0/H1 记录；V1 引用的 120 行/`e0b89c26…` 为历史快照 |
| B0 基线记录 | **239** | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | rebase 后基线；T3 3479/3452/9/18 |

- 方案 P1.1 与 P1.2 的语义等价以 V1 §1.2.1 与沟通记录「P1.2 编辑性收口记录」为准；五份提案均未把 P1.2 当成新的语义基线（C1 的“按 P1.2 文本施工”措辞见 P1-CAP-11，属表述收口，不是新基线）。
- **T3 验证口径核对**：五份提案的退出命令均为仓库既有命令（各层 `node --test --test-concurrency=1` + `npm run typecheck`，C2 另 `typecheck:renderer`/`build:renderer`/真实截图）；失败分类引用 B0 既有 Windows symlink EPERM 清单（A1 组 3、B1 组 1、PM 组 0、T3 全量 9，全量由 D1 执行），候选身份均要求 `git hash-object`+`sha256sum`、冻结声明与 `docs/change/…-evidence/` 路径；未发现依赖未授权文件。具体差异：B1 额外要求 `task-state` 等价回归，A2 要求 `jsonl-ledger` 单测，C1 目标文件命令为 B-4 两个新测试 + 按需既有文件。命令与证据路径整体可执行；B1 的 `task-state` 等价回归须先等 A2 冻结（B1 §7 已载明）。
- 本审核只读执行了 `wc -l`、`sha256sum`、`git status`、`git rev-parse HEAD`、`grep`/`sed` 代码阅读与文件存在性检查；**未运行测试/typecheck/构建/应用/E2E，未改任何产品/测试代码**。提案中的 B0 计数与测试命令作为输入事实核对，不是本次重跑结果。

## 三、逐提案结论

### 3.1 运行时核心（A1）——`needs revision`

- **必改 P1-CAP-01**：A1 提案只列了 `ShellReviewResult`/`CustomerInputOutcome` 与 `project-state` 枚举，**未列** `src/model/runtime.ts` 中 `RequestResolvedEvent.by` 的 `"directive"` 扩展及 `RequestResolvedEvent`/`VersionDecisionEvent` 的可选 `directiveId`。这是 Q9 A 与 AC-10/AC-15 的必需编译面；属 A1 既有单文件内的必要补全，**不是新路径/写集扩张**。
- 其余通过：`directive-marker.ts` 零 import 与渲染侧共享；`directive.ts` 类型/事件/视图/高危谓词与 `runtime.ts` 单向依赖；高危谓词接受 `decisionGroupEnabled`（Q7 A/R2）；`ShellReviewResult.directive` 与 `CustomerInputOutcome.directive` 形状符合团队计划 §4.3；`directive-marker.test.ts`/`directive-contract.test.ts` 与 T3/冻结声明可执行；未新增依赖/构建配置。
- **验收条件**：提案补入上述 runtime.ts 三个字段的逐项说明与测试断言；A1 冻结后 `npm run typecheck` 0，B1/C1 对 A1 冻结形状可 typecheck；不新增文件/路径。

### 3.2 项目管理（A2/A3）——`needs revision`

- **必改 P1-CAP-02**：A2 §1.1 轮转描述把 `.1` 写成“最旧”、`.N` 写成“最新”，与 §1.2 等价清单及真实 `task-state.ts:233-258` 相反。真实行为是 **`.N` 最旧、`.1` 最新**（`i=1` 时当前文件移到 `.1`；读取 `.N`→`.1`→当前为旧→新）。§1.2 第 3 条“最老 `.N+1` 删除”也需按实际 `unlink(file.N+1)` 防御性清理口径改写。该错误会直接污染 A2 契约与 B1 的 `task-state` 等价回归。
- **非阻断 P1-CAP-09**：A3 语义类别覆盖了回执/应用结果/冲突/面板/确认面板/高危/错误/Q9 归属，但未逐字列出 C2 所需“能力不可用/旧版本主进程”文案；应在 A3 冻结时纳入（可归 `ui.directive.error.*`）。
- **非阻断 P1-CAP-10**：A2 退路 B 的“V1 的 AC-6/AC-15 按 B 口径调整”应改为“按 V1 §九.6 提供 B 证据、不改 V1 文本”；V1 已冻结，不得由 PM 自行调整标准。
- 其余通过：A2 追加/串行/读取/坏行/`ignore`/`multiline`/limits/路径参数化契约与 `task-state` 主体等价；A3 1642 key 基线、`GLOBAL_TASK_STATE_KEYS` 97→98、`uiVersionDecision` 18→19、四条回执模板与 `ui.versionDecision.decidedBy.directive` 均准确；`i18n-guard-allowlist.ts` 不在本任务逐项写集，若新增文件零 Han 则无需更新（见 P1-CAP-09）。
- **验收条件**：A2 按真实 task-state 修正轮转年龄/等价清单并给出对应测试断言；A3 冻结 key 清单覆盖 C1/C2 所需类别（含能力禁用/旧主进程）；不改 V1；A2/A3 候选哈希与 T3 证据可复算。

### 3.3 编排（B1）——`needs revision`

- **必改 P1-CAP-03**：B1 §1.1 的公共句柄使用了 `SubmitFromInput`、`SubmitResult`、`DirectivePresenter`、`DirectiveStore`、`ApprovalDirectiveDecision`、`DecisionCardFacts`、`DecisionHooks`、`DecisionApplyResult`、`RevokeResult`、`DirectiveListResult` 等未定义类型；这些是 C1 直接消费/实现的跨角色契约，P1 阶段至少应给出冻结形状或明确指向 A1/现有 Model 类型。另：B1 §1.1/§8.6 写 `hooks.deliver`，C1 §三要求 `emitResult` 且“抛错 ⇒ 不消费/返回 undefined”；两者名称与语义必须统一。
- **必改 P1-CAP-04**：B1 Service 在落账前“调用 A1 谓词、主进程复算”高危；A1 谓词要求 `decisionGroupEnabled`，但 B1 的 `SubmitFromInput` 未声明该入参，C1 的提交快照也未声明向 B1 传开关状态。Q7 A 下“开关关闭时项目级 `select-recommended`”高危（AC-13）无法闭合。
- **非阻断 P1-CAP-13**：`CUSTOMER_DIRECTIVE_ID_PATTERN`/`CUSTOMER_DIRECTIVES_REL`/字段上限应引用 A1 常量，避免 B1 `task-state`/`run-manifest` 复制字面量漂移。
- 其余通过：Provider/Service/Pipeline 写集与 B-2/B-3 一致；`takeDirective` 注入与 `readonlyOnly` 守卫、审批顺序矩阵（deny 先于 `c=allow`、allow 只在 review/risky、script 不适用、once 原子消费、审计 `directive:{id,scope}`）、Q9 校验/映射点、`task-state` 迁移归属与退路 B 停止条件均与方案/团队计划一致。
- **验收条件**：B1 提案追加导出类型清单（每个字段名/联合/可选性/错误语义）并与 C1 逐项对照；`DecisionHooks`/`emitResult` 只保留一个名称与语义；`decisionGroupEnabled` 从 C1 主进程快照传入并在 Service/Pipeline 复算；B1 冻结后 C1 类型检查通过。

### 3.4 桌面窗口（C1）——`needs revision`

- **必改 P1-CAP-05**：C1/C2 的 IPC/preload 命名字段不一致：C1 `directive:state`/`directive:list` 使用 `enabled`，C2 消费 `directivesEnabled`；C1 `directive:confirm-request` 使用 `confirmable`，C2 使用 `canConfirm`；C1 preload 方法 `directiveRespond`，C2 使用 `directiveConfirmRespond`。应在 C1 冻结前统一。
- **必改 P1-CAP-06**：C1 在决策冲突/不匹配路径新增 `directiveNotice`（C2 渲染），但 C2 提案未消费该字段；必须冻结投递方式（现有 operator-request 载荷字段或系统行）并在 C2 实现，否则 AC-10 的“冲突/不匹配显示说明”无 UI 证据。
- **必改 P1-CAP-07**：C1 只承诺启动/项目切换/重载推送 `directivesEnabled:true`，未承诺“首次可输入前已推送/可初始读取”；C2 §十.3 已指出该窗口会导致先画气泡、主进程拦截后无法安全撤回。应由 C1 明确 handshake/初始读/顺序，或由 C2 在 `res.directive` 到达时撤回已画气泡；二者必须选一。
- **必改 P1-CAP-08（与 C2/统筹共同）**：C1 AC-22 行只覆盖“不占 `shellCardSlot`/一项目一卡、项目切换取消、session 按项目账本”，但未覆盖 V1 AC-22 的“shell 卡待答时仍可输入指令”；如 §五 P1-CAP-08 所述，当前 C1/C2 写集均不能修改 `ConfirmCard` 全屏模态，C1 的 AC-22 映射存在过度声明。
- **非阻断 P1-CAP-11**：C1 写“本提案按 P1.2 文本施工”，应补“冲突时 P1.1 为准”；`test/桌面应用/session.test.ts` 在 boundary 列出但磁盘不存在，提案不创建它是正确的（Q9 SessionManager 断言放 B-4 新测试/既有 `run-change`/`version-decision` 可接受）；该陈旧边界条目不属本任务修正范围。
- **非阻断 P1-CAP-14**：应用运行级 `sessionId` 的生成/注入位置未在 C1 提案明确，应在 C1 冻结声明中写清（项目切换不重置）。
- 其余通过：`interface.ts:1406-1411` 旧读者在 Q9 逐点范围且属 C1 既有 `interface.ts` 单文件写集，提案补充发现正确；`request.presented.to` 不应扩展（见 §四）；`SendResult.directive/directiveCancelled`、decision 消费者 `directing`、`once` durable 失败回落、冲突/不匹配绕过 `tryAutoSelectDecision`、项目切换取消未决、面板不占卡槽/队列等均与方案一致。
- **验收条件**：C1 提案中的 IPC/preload 表与 C2 消费表逐字段一致；高危开关入参、`directiveNotice`、能力位时序、AC-22 部分均有明确落点；C1 目标测试 + `npm run typecheck` 可执行；不新增第三个 `test/桌面应用/` 新文件。

### 3.5 桌面UI（C2）——`needs revision`

- **必改 P1-CAP-08（与 C1/统筹共同）**：C2 §十.2 正确指出 `ConfirmCard.tsx` 的 `.sc-overlay` 为 `position:fixed; inset:0; z-index:60` 的 `aria-modal` 覆盖层，覆盖 Composer；C2 写集不含 `ConfirmCard.tsx`/`shell.css`/`App.tsx`，因此 AC-22“shell 卡待答时仍可输入指令”在当前写集下不可达。该条是 **V1 AC-22 的 fail 条件**，必须由统筹/闸门 2（必要时闸门 1）决定写集或方案调整，C2 不得自行扩写集。
- **必改 P1-CAP-05**：C2 应按 C1 冻结名消费 `directivesEnabled`/`confirmable`（或 C1 改为 C2 名称）与 `directiveRespond`/`directiveConfirmRespond` 之一；C2 不能只写“C1 冻结名为准”而保留三处候选名。
- **必改 P1-CAP-06**：C2 需明确消费/渲染 C1 的 `directiveNotice`（或改由 C1 系统行承载并在 C2 不新增字段）。
- **非阻断 P1-CAP-12**：C2 的 AC 映射表未列 AC-18/AC-19/AC-20/AC-15/AC-23 的引用（其 §一/§七/§九 已有事实）；建议补“非 C2 主责/由 D1/E1/E2 覆盖”的说明。`lib/platform.ts` 不在 C2 写集而用 `ipc.ts` 内结构断言/窄化，属团队计划写集下的可行折中；`typecheck:renderer` 必须能证明新 bridge 方法可用。
- 其余通过：面板入口选择“Composer 控件行内按钮”**在 C2 写集内**（`Composer.tsx`），与方案 §4.1/Q10 A 不冲突（方案未规定入口位置；若 UIUX 要求 ChatHeader/Drawer 入口则属写集外，需另行裁决）；回显抑制以共享 `parseDirectiveMarker` + `directivesEnabled` 为唯一判据；对话框/面板字段、高危勾选、撤销、项目切换、旧主进程降级、i18n 只消费 A3 key、无新依赖/构建改动均与方案一致。
- **验收条件**：C2 提案明确 AC-22 的阻断事实与统筹裁决请求；IPC 字段名与 C1 完全一致；`directiveNotice` 有消费路径；AC-18/19/20/15/23 映射补注；`test/桌面UI/*.test.ts` + `typecheck:renderer` + `build:renderer` + 真实截图证据可执行。

## 四、跨提案一致性核查表（逐项实测，不采信作者自述）

| # | 核查项 | 结论 | 事实/依据 |
| --- | --- | --- | --- |
| 1 | Q9 A：`src/model/runtime.ts` 是否覆盖 `RequestResolvedEvent.by` 加 `"directive"`、`VersionDecisionEvent` 可选 `directiveId` | **不通过（P1-CAP-01）** | 实测 `runtime.ts:804-836` `by: "judge" \| "customer"`、`runtime.ts:918-938` 无 `directiveId`；A1 §2.4/§2.5 未列；B1/C1 提案正确指出该缺口。补全在 A1 既有 `runtime.ts` 单文件内，不扩边界。 |
| 2 | 高危谓词是否接受 `decisionGroupEnabled`（Q7 A） | **A1 通过；跨层未闭合（P1-CAP-04）** | A1 §2.3 `DirectiveHighRiskInput` decision 分支含 `decisionGroupEnabled: boolean`；B1 `SubmitFromInput` 未声明、C1 提交快照未声明传递；A1 谓词本身符合 Q7 A/R2。 |
| 3 | `ShellReviewResult.directive.scope`、`directiveId`、`CustomerInputOutcome.directive` 三处形状 | **部分通过** | `ShellReviewResult.directive = {id, scope: once\|session\|forever}`（团队计划 §4.3/A1 §2.4）；`CustomerInputOutcome.directive = {id, action}`（团队计划 §4.3/A1 §2.4）；`directiveId` 为 `RequestResolvedEvent`/`VersionDecisionEvent`/run-manifest 的可选字段（A1 补全后）。P1.1 §6.2 第 8 条“`directive:{id, action, scope}`”与 §8.3/团队计划/V1 的 `{id, action}` 存在文字歧义，见 W-2；三者以 `id` 关联，不是同一形状，当前无强制合并。 |
| 4 | B1 `applyDecisionDirective` 是否提供“可见结果行先于 durable consume”钩子 | **不通过（P1-CAP-03）** | B1 §1.1 `hooks?: DecisionHooks` 未定义；§8.6 用 `hooks.deliver`；C1 §三硬条件要求 `emitResult` 且抛错不消费。语义方向一致，名称/形状未冻结。 |
| 5 | `request.presented.to` 现仅 customer/judge；是否需扩 `"directive"` | **不需要扩展（结论）** | 实测 `RequestPresentedEvent.to` 仅 `"customer" \| "judge"`（`runtime.ts:796-801`），写入点 `markPresented("customer")`/`markPresented("judge")`（`session.ts:4083-4093`/`:4167`）。指令代选/拒绝在 `presentEntryNow` 之前完成，**不写 `request.presented`**；冲突/不匹配时卡片照常呈现给客户，写 `to:"customer"` 是准确的。指令归属应写 `request.resolved.by:"directive"`+`directiveId`，不应伪造 presented 到不存在的通道。C1 的开放点据此关闭。 |
| 6 | `app/desktop/interface.ts:1406-1411` 旧读者是否在 Q9 逐点更新范围、是否属 C1 既有单文件写集 | **通过（C1 必须实现）** | 实测 `interface.ts:1406-1411` 以 `judge:` 前缀否则 `customer`，会把 `directive:<id>` 误记为 customer；`interface.ts` 是团队计划 §4.3 C1 写集内单文件；属 Q9 A“逐点更新旧读者”必要项，不是计划外扩写。 |
| 7 | `test/桌面应用/session.test.ts` 在 boundary 列出但磁盘不存在；提案不创建、Q9 断言放 B-4/既有文件是否可接受 | **可接受（非阻断）** | 实测 `test/桌面应用/session.test.ts` 不存在；`boundary.md:39`/`boundary.yaml:99` 仍有陈旧条目。C1 提案不创建它、把 Q9 SessionManager 断言放入 B-4 新测试或既有 `run-change.test.ts`/`version-decision.test.ts`，不违反写集，足以支撑 AC-15；不建议在本任务顺手修边界漂移（团队计划 §4.5）。 |
| 8 | AC-22 模态冲突（重点） | **阻断（P1-CAP-08）** | `ConfirmCard.tsx:141/295/550` 使用 `.sc-overlay`；`shell.css:1125-1133` `position:fixed; inset:0; z-index:60`；`App.tsx:180` 将其渲染在 `<Composer />` 之上；三个 shell/recovery 卡均 `aria-modal="true"`。shell 卡待答时 Composer 被全屏覆盖，客户无法输入 `@审批`。C1 写集不含 `app/renderer/**`；C2 提案自限不含 `ConfirmCard.tsx`/`shell.css`/`App.tsx`（团队计划 §4.3 C2 虽允许样式文件，但行为改动在 `ConfirmCard.tsx`，不在本提案写集）；C2 §十.2 已如实披露。**结论：当前 C2 写集内不可解决，必须写集/边界调整或方案/UIUX 裁决；V1 AC-22 的 fail 条件明确包含“shell 卡待答时无法打开指令面板”。** |
| 9 | 桌面UI 面板入口（Composer 控件行内按钮）是否在 C2 写集内、是否与方案 §4.1/Q10 A 冲突 | **通过（非阻断）** | `Composer.tsx` 在团队计划 §4.3 C2 写集；方案 §4.1/Q10 A 只要求独立指令面板 + 提交模态，未规定入口位置；入口按钮在既有 `composer-controls` 行内，不新增路径/依赖。若 UIUX 改到 `ChatHeader`/`Drawer` 才需另批写集。 |
| 10 | 能力位时序：C1 是否保证先推 `directivesEnabled`/提供初始读再允许输入 | **不通过（P1-CAP-07）** | C1 §2.5 只写“启动/项目切换/重载推送”，未写输入前完成；C2 §三默认 `false`、§十.3 指出首输窗口会先画气泡。C1 可在 `main.ts`/preload 内加初始化握手，C2 可在 `Composer.tsx`/store 加迟到状态撤回；必须二选一并冻结。 |
| 11 | A3 key 集合是否覆盖 C2/C1 所需文案；`i18n-guard-allowlist.ts` 是否需要更新 | **部分通过（P1-CAP-09）** | A3 §2.2 覆盖回执/应用结果/冲突/面板/对话框/高危/错误/Q9；C2 §五/§六另需“能力不可用/旧版本主进程”说明，A3 未逐字列出，应在冻结时纳入。`i18n-guard-allowlist.ts` 不在本任务逐项写集；新增 C1/C2 文件若保持零 Han 则无需更新；若需新增 allowlist 条目，属写集扩张，须统筹/闸门 2，不得自行加。 |
| 12 | 共享 JSONL A/退路 B、`task-state` 等价回归归属与证据 | **通过（P1-CAP-02 修正后）** | A2 主属 `src/common/shared/jsonl-ledger.ts`；B1 在同一变更迁移 `task-state.ts` 并在 `test/编排/` 做等价回归（A2 §5/B1 §7）；退路 B 由 B1 停止回报、统筹按团队计划 §10.2 决定并在 E1 披露。A2 轮转年龄文字错误须先修（P1-CAP-02）；V1 §九.6 已给 B 的零改动证明口径。 |
| 13 | IPC/preload 形状跨 C1/C2 一致性 | **不通过（P1-CAP-05/06）** | 三处命名不一致：`enabled` vs `directivesEnabled`、`confirmable` vs `canConfirm`、`directiveRespond` vs `directiveConfirmRespond`；`directiveNotice` 仅 C1 提案有、C2 未消费。必须冻结一组名称/载荷。 |
| 14 | 版本与治理：P1.1/P1.2 等价、未把 P1.2 当新基线、无实质方案/计划冲突 | **基本通过；1 项需统筹** | 五份均以 P1.1 为确认基线，P1.2 仅 R1/R2 等价映射；C1 “按 P1.2 文本施工”建议补“冲突以 P1.1 为准”（P1-CAP-11）。除 P1-CAP-08 外未发现方案实质冲突；P1.1 §6.2 文字歧义见 W-2。 |

## 五、发现清单

| ID | 严重度 | 阻断/非阻断 | 所有者 | 发现 | 要求动作 | 依据 |
| --- | --- | --- | --- | --- | --- | --- |
| **P1-CAP-01** | 高 | **阻断（A1 冻结前）** | 运行时核心（A1） | `runtime.ts` 未补 `RequestResolvedEvent.by:"directive"`、`RequestResolvedEvent.directiveId?`、`VersionDecisionEvent.directiveId?`；Q9 A/AC-10/AC-15 无法 typecheck | 在 A1 提案 §2.4/§2.5 增加三项逐字说明与契约测试；`RequestPresentedEvent.to` 保持不动；仍只写 A1 既有四文件+两测试 | P1.1 §9.2/Q9 A；团队计划 §4.3 B1；V1 AC-10/AC-15；实测 `runtime.ts:804-836`/`:918-938` |
| **P1-CAP-02** | 中 | **阻断（A2 冻结前）** | 项目管理（A2） | A2 轮转年龄写反（`.1` 最旧/.N 最新），与真实 `task-state` 及 §1.2 等价清单矛盾；“最老 `.N+1` 删除”措辞不准确 | 修正为 `.N` 最旧、`.1` 最新；按 `task-state.ts:233-258` 改写等价清单第 3 条；轮转测试断言 `.N→…→.1→当前` 读取顺序与 `.1` 最新；重跑 A2 基线 | 实测 `task-state.ts:233-258`、`:651-699`；V1 AC-6/AC-15；B1 `task-state` 等价回归 |
| **P1-CAP-03** | 高 | **阻断（B1 冻结前）** | 编排（B1） | §1.1 公共句柄使用 10 个未定义类型；`hooks.deliver` 与 C1 `emitResult` 名称/语义不一致 | 逐一定义 `SubmitFromInput`/`SubmitResult`/`DirectivePresenter`/`DirectiveStore`/`ApprovalDirectiveDecision`/`DecisionCardFacts`/`DecisionHooks`/`DecisionApplyResult`/`RevokeResult`/`DirectiveListResult` 的字段名/联合/可选性/错误语义，或指向 A1/现有 Model 冻结类型；统一可见行钩子名称与“抛错不消费”语义；加 C1 双向可赋值断言 | B1 §1.1/§8.6；C1 §三硬条件；方案 §8.3/§6.2；V1 AC-10/AC-13 |
| **P1-CAP-04** | 高 | **阻断（AC-13 冻结前）** | 编排（B1）+ 桌面窗口（C1） | 高危谓词需 `decisionGroupEnabled`，但 B1 `SubmitFromInput`/C1 提交快照未声明该值；开关关闭时项目级 `select-recommended` 高危无法闭合 | B1 入参增加 `decisionGroupEnabled: boolean`（或等价回调）；C1 以主进程 `decisionJudgeSwitch` 当刻快照传入；Service/Pipeline 与 C1 面板重算使用同一值；补 AC-13 测试（开关开/关、项目级/单 flow） | A1 §2.3；方案 §4.3/Q7 A；V1 AC-13；C1 §2.3 |
| **P1-CAP-05** | 中 | **阻断（C1/C2 冻结前）** | 桌面窗口（C1）+ 桌面UI（C2） | IPC/preload 三处命名不一致：`enabled` vs `directivesEnabled`；`confirmable` vs `canConfirm`；`directiveRespond` vs `directiveConfirmRespond` | C1 §2.4 表与 preload 冻结一组名称/载荷；C2 按冻结名消费；更新 C1/C2 测试与 AC-2/AC-3 证据 | C1 §2.4 第 68-74 行；C2 §三/§五；方案 §3.3/R1；V1 AC-2/AC-3/AC-22 |
| **P1-CAP-06** | 中 | **阻断（AC-10 UI 冻结前）** | 桌面窗口（C1）+ 桌面UI（C2） | C1 决策冲突/不匹配新增 `directiveNotice`，C2 未消费；UI 无该说明的渲染/测试 | 冻结投递方式：现有 operator-request 载荷字段（C1 定义、C2 渲染）或系统行（C1 `emitEvent`、C2 既有系统行）；补 AC-10 冲突/不匹配 UI 证据 | C1 §三/§五；C2 §四/§五；方案 §6.2 第 5–7 条；V1 AC-10 |
| **P1-CAP-07** | 中 | **阻断（AC-2 冻结前）** | 桌面窗口（C1）+ 桌面UI（C2） | `directivesEnabled:true` 推送晚于首次可输入时，C2 默认 false 会先画气泡；主进程拦截后气泡无法安全撤回 | C1 保证启动/项目切换/重载在可输入前完成推送或提供初始读/ack；或 C2 在 `res.directive` 到达时按 `clientMessageId` 撤回已画气泡；二者择一并写入冻结声明与测试 | C2 §十.3；C1 §2.5；V1 AC-2/AC-22；Composer.tsx:282-286 |
| **P1-CAP-08** | 高 | **阻断（整体；需统筹/闸门 2）** | 统筹（裁决）+ 桌面窗口（C1）+ 桌面UI（C2） | `ConfirmCard` 全屏 `aria-modal` 覆盖 Composer；shell 卡待答时客户无法输入 `@审批`；C1 写集不含 `app/renderer/**`，C2 提案自限不含 `ConfirmCard.tsx`/`shell.css`/`App.tsx`，AC-22 该子句不可达（V1 明确列为 fail） | 统筹/沟通在闸门 2（必要时闸门 1/UIUX）决定：A) 扩 C2 写集至 `ConfirmCard.tsx`（+按需 `shell.css`）使 shell 卡非阻塞或在卡内提供指令入口；B) 改 UI/方案以提供高于 shell 卡的全屏入口（仍须解决“输入 `@审批`”的语义）；C) 若改 V1 文本，递增 V1 版本并按闸门 1 重开。C1/C2 不得自行扩写集 | V1 AC-22（§3.22）；方案 §3.5 共存段；实测 `ConfirmCard.tsx:141/295/550`、`shell.css:1125-1133`、`App.tsx:180`；C2 §十.2；C1 §六 AC-22 行 |
| P1-CAP-09 | 低 | 非阻断（A3 冻结前条件） | 项目管理（A3） | A3 未逐字覆盖 C2 的“能力不可用/旧版本主进程”说明；`i18n-guard-allowlist.ts` 是否需更新未定 | A3 冻结 key 清单纳入该类别（可归 `ui.directive.error.*`）并让 C2 按 key 消费；确认新 C1/C2 文件零 Han，则 allowlist 不改；若需新增 allowlist，停止并交统筹，不自行扩写集 | C2 §五/§六/§十.4；A3 §2.2；`test/项目管理/shared/i18n-guard-allowlist.ts` |
| P1-CAP-10 | 低 | 非阻断 | 项目管理（A2） | 退路 B 写“V1 的 AC-6/AC-15 按 B 口径调整”，易被读成修改已冻结 V1 | 改为“按 V1 §九.6 提供 Provider 独立实现/独立测试 + `task-state` 零改动证明，不改 V1 文本/版本”；E1 披露 | V1 §九.6；A2 §1.5；团队计划 §10.2 |
| P1-CAP-11 | 低 | 非阻断 | 桌面窗口（C1） | C1 的 AC-22 行只覆盖部分子句（未含“shell 卡待答仍可输入”）；“按 P1.2 文本施工”未写冲突规则；`session.test.ts` 边界陈旧 | AC-22 行改为如实标注“部分可覆盖，P1-CAP-08 阻断”；补“冲突以 P1.1 为准”；不创建 `session.test.ts`，Q9 断言放 B-4/既有测试；边界漂移另报统筹，不顺手修 | C1 §一/§六/§八；V1 AC-22；`boundary.md:39`/`boundary.yaml:99`；B0 `test/桌面应用` 53 文件 |
| P1-CAP-12 | 低 | 非阻断 | 桌面UI（C2） | AC 表未列 AC-18/19/20/15/23 的引用；`lib/platform.ts` 类型折中需 `typecheck:renderer` 证明 | 补“非 C2 主责/由 D1/E1/E2 覆盖”说明；确保 `ipc.ts` 结构断言/窄化通过 `typecheck:renderer` 且不弱化类型；AC-18/19/20/15/23 在 C2 的职责边界写清 | C2 §八/§九；团队计划 §4.3 C2；V1 §6.2 |
| P1-CAP-13 | 低 | 非阻断 | 运行时核心（A1）+ 编排（B1） | B1 `task-state`/`run-manifest` 使用 `^d-[1-9][0-9]*$` 等字面量，可能与 A1 常量漂移 | B1 优先 import A1 `CUSTOMER_DIRECTIVE_ID_PATTERN`/`CUSTOMER_DIRECTIVES_REL`/字段上限；若必须字面量，加 A1/B1 双向契约断言 | A1 §2.2；B1 §1.2/§5；项目规则单一来源 |
| P1-CAP-14 | 低 | 非阻断 | 桌面窗口（C1） | 应用运行级 `sessionId` 的生成/注入位置未在 C1 提案明确（B1 要求 C1 生成并注入） | C1 冻结声明中写明生成位置（主进程启动）、生命周期（项目切换不重置）、传给 `createCustomerDirectiveRuntime` 的路径；补 AC-11 测试 | B1 §9；C1 §八；方案 §5.3；V1 AC-11 |

## 六、需统筹裁决项（写集/边界/方案）

- **W-1（写集/边界，阻断）AC-22 模态冲突**：事实见 P1-CAP-08。建议统筹在进入契约冻结前完成以下之一：(a) 闸门 2 增补 C2 写集（`app/renderer/src/shell/ConfirmCard.tsx`，按需 `shell.css`；后者团队计划 §4.3 C2 已允许样式文件，但需 C2 提案明确纳入），由 C2 设计“shell 卡不阻塞 Composer”或卡内指令入口（涉及既有 shell 卡 UI/测试回归，须 C1/C2 协商）；(b) 由 UIUX/沟通给出高于 shell 卡的全屏指令入口方案并同步修正 AC-22 的“输入 `@审批`”语义；(c) 若客户接受改 V1 AC-22 文本，按 V1 §1.2 递增版本并重开闸门 1。**C1/C2 不得自行扩写集，PM 不代批。**
- **W-2（方案文字，非阻断）P1.1 §6.2 与 §8.3 的 `CustomerInputOutcome.directive` 形状**：§6.2 第 8 条写 `{id, action, scope}`，§8.3/团队计划 §4.3/V1 按 `{id, action}`。本审核结论：以 §8.3/团队计划/V1 的 `{id, action}` 为冻结形状，`scope` 由账本/`directiveId` 关联；不据此重开闸门 1。建议策划/统筹在后续文字收口（P1.3/注记）中记明，不改语义。
- **W-3（方案/标准，非阻断）A2 退路 B**：若 A2 等价回归失败，按团队计划 §10.2 由统筹决定退路 B；V1 §九.6 已给零改动证明口径，**不改 V1 文本**；E1 必须披露实际路径与失败证据。
- **W-4（边界文字，非阻断）`test/桌面应用/session.test.ts` 陈旧条目**：boundary md/yaml 仍列该文件但磁盘不存在；本任务不创建、不修正（团队计划 §4.5 不要求顺手修无关漂移）；建议 H1/统筹在后续变更中单独处理，避免把“既有精确条目”误读成必须创建。
- **W-5（写集，非阻断/条件）`i18n-guard-allowlist.ts`**：不在本任务 PM 逐项写集；若 C1/C2 新文件保持零 Han，无需更新。若实施确需新增 allowlist，属写集扩张，停止回报统筹/闸门 2。
- **W-6（结论性，无需裁决）`request.presented.to`**：不扩 `"directive"`；理由见 §四第 5 行。C1/C2 不应伪造 presented；归属只写 `request.resolved.by`/`decidedBy`/`directiveId`。
- **W-7（结论性，无需裁决）`interface.ts:1406-1411`**：在 Q9 逐点范围且属 C1 既有 `interface.ts` 单文件写集；C1 必须修，不构成计划外扩写。

## 七、AC-1..AC-24 覆盖核对（跨五份提案）

| AC | 主要提案/证据 | 覆盖状态 |
| --- | --- | --- |
| AC-1 识别规则 | A1 解析器 + C1 拦截 + C2 面板 + D2 | 覆盖；A1 测试/ C1 带图拒绝/ C2 空正文禁用 |
| AC-2 命中不投递/未命中零变化 | C1 + D1/D2 | 覆盖；**P1-CAP-07** 能力位时序需收口 |
| AC-3 面板字段/确认禁用 | C1 IPC + C2 UI + D2 | 覆盖；**P1-CAP-05** 命名需统一 |
| AC-4 取消/关窗/不可用/写失败 | C1 + C2 + D1 | 覆盖 |
| AC-5 回执精确/durable/不含原文 | A3 + C1 + C2 + D2 | 覆盖；A3 四条模板准确 |
| AC-6 账本 schema/ID/轮转/坏行/幂等 | A1 + B1 + D1 | 覆盖；**P1-CAP-02** 轮转文字必须先修 |
| AC-7 target 隔离 | A1 + B1 + C1 + D1 | 覆盖；A1 类型分离、B1 双 facts、C1 只读 decision |
| AC-8 审批 allow/once/硬地板 | B1 + D1/D2 | 覆盖；顺序矩阵与 `readonlyOnly` 守卫有落点 |
| AC-9 审批 deny/顺序/不翻案 | B1 + D1 | 覆盖；deny 先于 `c=allow` 与 B1 §4 一致 |
| AC-10 决策规则/冲突/默认推荐绕行/Q9 四处 | A1 + B1 + C1 + A3 + D2 | 覆盖；**P1-CAP-01/03/04/06** 需收口 |
| AC-11 期限/重启失效/分组 | B1 + C1 + C2 + D2 | 覆盖；**P1-CAP-14** sessionId 归属需写清 |
| AC-12 撤销/同 target/状态 | B1 + C1 + D2 | 覆盖 |
| AC-13 高危谓词/主进程复核/Q7 A | A1 + C1 + C2 + D2 | 覆盖；**P1-CAP-04** 开关入参需闭合 |
| AC-14 不授权代码/角色卡/边界 | A1 + B1 + C1 + D1 | 覆盖；结构检查与 hard-floor 测试 |
| AC-15 回归/旧读者逐点核对 | C1 + B1 + 各角色 + D1/T3 | 覆盖；**P1-CAP-01/11** 需收口；`interface.ts:1406` 已纳入 |
| AC-16 坏账本/主路径不受阻 | B1 + C1 + D1/D2 | 覆盖 |
| AC-17 i18n 中英成对/无硬编码 | A3 + C2 + D1 | 覆盖；**P1-CAP-09** 能力禁用文案需纳入 |
| AC-18 T3 证据/截图/如实状态 | 各角色 + E1/E2 | 覆盖；候选哈希/冻结声明/证据路径可执行 |
| AC-19 与 `contract-schema-query` 重叠 | A1/C1/统筹/E1 | 覆盖；基线 `4c3a6e4`、rebase 证据重跑口径一致 |
| AC-20 非目标核对 | E1/E2 + 各角色 diff | 覆盖；五份均声明不实施 O1–O11 |
| AC-21 闸门 1 单独决定 Q5/Q9 | 沟通/V1/E2 | 已满足（Q5 A/Q9 A 有客户单独选择记录） |
| AC-22 面板共存/项目切换 | C1 + C2 + D1 | **阻断（P1-CAP-08）**；其余共存/项目切换子句 C1/C2 有落点 |
| AC-23 O9 回滚开关 | E2 记 N/A | N/A（O9 未选）；C1 §六明确 N/A，其他提案不实施 O9 |
| AC-24 账本重置/ID 重号披露 | B1 + C1 + C2 + E2 | 覆盖；`(id, createdAt)` 由 C1/C2 展示；仅 O11 子句按 V1 N/A |

**覆盖结论**：AC-1..AC-24 均有明确主责/证据提案，无整条落空；但 AC-2/AC-6/AC-10/AC-13/AC-15/AC-17/AC-22 受上述阻断/条件项影响，**当前不能判 pass**。AC-23 整体与 AC-24 的 O11 子句按 V1 记 `not applicable`，依据为闸门 1「O1–O11 不实施」与团队计划 §7.1。

## 八、结论与理由

**总体结论：`needs revision`。** 不建议进入契约冻结，也不建议任何角色开始写产品代码。

理由：

1. **契约冻结前的硬缺口**：P1-CAP-01（Q9 runtime 字段）、P1-CAP-03（B1 公共句柄类型/可见行钩子）、P1-CAP-04（高危开关入参）、P1-CAP-05（C1/C2 IPC 命名）、P1-CAP-06（`directiveNotice`）、P1-CAP-07（能力位时序）均可在原提案/原写集内修订，但必须先修订并复审。
2. **A2 共享辅助的真实等价性**：P1-CAP-02 是提案文本与 `task-state.ts` 实际行为的直接矛盾，若按文字实施会污染共享辅助与 `task-state` 等价回归，必须先修。
3. **AC-22 是计划/写集层面的不可达**：P1-CAP-08 不是提案文字可以单独修复的问题；`ConfirmCard` 全屏 `aria-modal` 覆盖 Composer，而 C1 写集不含 `app/renderer/**`，C2 提案自限不含 `ConfirmCard.tsx`（行为改动所在）；V1 AC-22 明确把“shell 卡待答时无法打开指令面板”列为 `fail`；因此 **在统筹/闸门 2 给出写集/方案裁决前，不能批准任何提案进入冻结**。这不是对 C1/C2 作者的返工要求，C2 已如实披露，本审核确认其事实成立。
4. **非阻断项**：P1-CAP-09..14 及 W-2..W-5 可在修订/冻结时一并收口，不单独阻断；`request.presented.to` 不需要扩展、`interface.ts:1406` 在 C1 写集内、`test/桌面应用/session.test.ts` 不创建均可接受。

**复审与冻结条件**：

- 各提案 owner 按 §五 提交窄修订（不必重写全文）；项目管理按受影响项复审。
- 统筹先处理 W-1（AC-22）并给出书面裁决；若涉及写集/边界增补，按闸门 2 流程；若涉及 V1 文本变更，按 V1 §1.2 递增版本并重开闸门 1。未裁决前不进入 A1/A2/A3/B1/C1/C2 实施。
- 复审通过并取得 `recommend approval` 后，才可进入 A1/A2/A3 契约冻结；A1/A2/A3 冻结后再按团队计划顺序 B1 → C1 → C2。**本记录不是客户批准、不是实施授权、不是验收结论。**
- 本审核未运行测试/typecheck/构建/应用/E2E；未改产品/测试/提案/角色卡/边界/调度/验收/沟通；未 commit/push。

**本文件状态：P1 审核记录；总体结论 `needs revision`；未运行测试、未实施、未验收、未 commit/push。**

---

## 复审记录（Revision 1，2026-11-03）

- **复审性质**：P1 实现提案**窄复审（Revision 1）**，只核原审核 8 项阻断的闭合、6 项非阻断的处置与跨提案一致性。**不是客户批准、不是闸门、不是实施授权、不是测试结果、不是验收结论**；不替代 V1/E2。
- **复审方式**：只读。复算五份修订稿与输入哈希，核对 `git rev-parse HEAD`、`git status --porcelain -- src app test`，按符号/文本锚点抽读 `src/model/runtime.ts`、`src/common/编排/task-state.ts`、`app/desktop/interface.ts`、`app/desktop/operator-channel.ts`、`app/renderer/src/shell/ConfirmCard.tsx`、`app/renderer/src/shell/shell.css`、`app/renderer/src/chat/events.ts` 等；**未运行测试/typecheck/构建/应用/E2E**，未改提案/产品/测试/其他角色文档/角色卡/边界/`docs/scheduling/`/`docs/acceptance/`/`docs/communication/`，未 commit/push。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空。

### 一、复审对象与哈希（复算一致）

| # | 对象 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 P1 修订稿 | **172** | `f25702918d59cb1ce4b5c51f538c16edbb5c89c26b8915f8152d7e263f0cf8f4` | 与任务表一致；`Revision 1` |
| 2 | 项目管理 P1 修订稿 | **168** | `7f69db8f47f17501c0811759b611c07dc8f74966cacf63885c595a34e8451809` | 与任务表一致；`Revision 1` |
| 3 | 编排 P1 修订稿 | **242** | `0d98e2004a6e7b07c749158ca8c582220d649eec437f9274cb14385384e97778` | 与任务表一致；`Revision 1` |
| 4 | 桌面窗口 P1 修订稿 | **210** | `866596f0afb8c0ab38c5c1626a61584dcfb818b24e4271e186814dae3864fc55` | 与任务表一致；`Revision 1` |
| 5 | 桌面UI P1 修订稿 | **162** | `40c47efd8c4314f410064710bd8e287cdf1082d9953f781491948e159c91d52a` | 与任务表一致；`Revision 1` |
| 6 | 团队计划（含 §十三增补） | **664** | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | 与任务表一致；v1 653/`37e6bd0d…` + §十三 |
| 7 | 方案 P1.2（盘上当前） | **1209** | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | 与任务表一致；R1/R2 编辑性等价 |
| 8 | 方案 P1.1（确认基线快照） | **1199** | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` | 由 P1.2 头注/团队计划引用；盘上未单独落盘，未当作独立文件复算 |
| 9 | V1 实施前标准 | **1171** | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | 与任务表一致 |
| 10 | 沟通记录（当前） | **168** | `9f19821e2bc725d24b66d73029fb08f1b7f2c3bd8ac92a32adcbce8ed54c0e0c` | 与任务表一致；含 P1 审核与 W-1=A |
| 11 | B0 基线记录 | **239** | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | 与任务表一致 |
| 12 | 原 P1 审核记录 | **193** | `65f888a6f35b02439fae553d553d9471769f88a242f7eda0556032c09e41d1b2` | 与任务表一致；本复审保留原文并追加本节 |

- **哈希结论**：五份修订稿与全部输入均与任务表一致，无停止项。P1.1 为闸门 1 客户确认基线，当前盘上以 P1.2 承载 R1/R2 编辑性收口；V1 §1.2.1 与沟通记录均确认语义等价，冲突以 P1.1 为准。
- **复审边界**：A2 修订稿所列“复跑 158/153/0/5/0，exit 0”为作者自述；本复审用 B0 第 114 行（项目管理 shared 组 10 文件 / 158 tests / 153 pass / 0 fail / 5 skip）核对一致，**未独立重跑**。

### 二、逐项阻断闭合表（P1-CAP-01..08）

| ID | 原审核要求 | Revision 1 落点与独立核对 | 结论 |
| --- | --- | --- | --- |
| **P1-CAP-01** | A1 补 `RequestResolvedEvent.by:"directive"`、`RequestResolvedEvent.directiveId?`、`VersionDecisionEvent.directiveId?`；`RequestPresentedEvent.to` 不动；常量单一来源 | A1 §2.4（第 79-83 行）逐项补入；§2.5（第 87 行）扩 `VersionDecisionDecidedBy`；§2.7（第 99-105 行）加编译期正/负例与双向可赋值；§4（第 114 行）写集注明。实测 `runtime.ts` 现为 `to:"customer"\|"judge"`、`by:"judge"\|"customer"`、`VersionDecisionEvent` 无 `directiveId`，修订为加法式扩展，不改变旧语义。B1 §5、C1 §四均按该冻结面消费 | **closed** |
| **P1-CAP-02** | A2 轮转年龄改 `.N` 最旧、`.1` 最新；等价清单第 3 条与测试断言按真实 `task-state.ts:233-258`；给复跑基线 | A2 §1.1（第 31 行）、§1.2 第 3 条（第 39 行）、§1.3（第 48 行）、§9（第 157/161 行）均改为 `.N` 最旧、`.1` 最新，`unlink(file.N+1)` 仅越界份防御性清理；测试断言含“当前→`.1`、`.1` 最新、`.N` 最旧”和读取 `.N`→…→`.1`→当前。实测 `task-state.ts:233-258` 的 `i=N..1`、`i=1` 当前→`.1`、`i>1` `.i-1`→`.i` 与 `unlink(N+1)` 一致；`:650-699` 读取顺序一致。复跑基线 158/153/0/5/0 与 B0 组 E 一致 | **closed** |
| **P1-CAP-03** | B1 逐一给出 10 个公共句柄/跨角色类型的字段、联合、可选性、错误语义；`emitResult` 唯一可见行钩子，抛错/拒绝不消费；C1 双向可赋值断言 | B1 §1.1（第 38-118 行）定义 `SubmitFromInput`/`SubmitResult`/`DirectivePresenter`/`DirectiveStore`/`ApprovalDirectiveDecision`/`DecisionCardFacts`/`DecisionHooks`/`DecisionApplyResult`/`RevokeResult`/`DirectiveListResult` 及辅助类型；`DecisionHooks.emitResult` 注明唯一、无 `deliver` 别名；§8.6（第 219 行）明确抛错/拒绝/无钩子 ⇒ 不消费、返回 `undefined`；§7（第 207 行）安排 B1↔C1 双向可赋值断言。C1 §三（第 88 行）、§七.7（第 164 行）对齐 | **closed** |
| **P1-CAP-04** | `SubmitFromInput.decisionGroupEnabled` 必填；C1 以主进程 `isGroupEnabled("decision")` 提交当刻快照传入；Service/Pipeline/面板复算同值；AC-13 2×2 测试计划 | B1 §1.1（第 50 行）必填、无默认；§1.1 说明（第 114 行）C1 提交当刻读取 `decisionJudgeSwitch`、同一值进 presenter/Service/Pipeline；§6 AC-13（第 194 行）、§7 2×2（第 205 行）。C1 §2.3（第 56 行）、§六 AC-13（第 140 行）、§七.5（第 162 行）。实测 `app/main.ts:344` 有 `decisionJudgeSwitch`、`:560` 有 `isGroupEnabled("decision")` 映射 | **closed** |
| **P1-CAP-05** | C1 冻结名/载荷表与 C2 消费表逐字一致；`directivesEnabled`/`confirmable`/`directiveConfirmRespond`、五个 preload 方法、`DirectiveListView` 无候选名残留 | C1 §2.4（第 68-74 行）冻结五通道与五个 preload 方法；C2 §五（第 66-72 行）逐字段消费并声明 C1 为 source of truth。逐项比对：通道名、字段名、载荷字段完全一致；`directive:list` 仅“，”与“；”标点差异，`directive:state` 仅多“与 directive:list 成功视图同形”说明括注，**无名称/载荷差异**。C1 §2.4 明写弃用 `enabled`/`canConfirm`/`directiveRespond`，C2 正文无候选名残留 | **closed**（仅标点/说明性差异，已记录） |
| **P1-CAP-06** | 冻结 `directiveNotice` 投递方式；C2 消费/渲染或改系统行；补 AC-10 冲突/不匹配 UI 证据 | C1 §三（第 86-87 行）选**既有系统行**：`emitDirectiveNotice`（`main.ts` 既有 `emitEvent`）投 `delivery-note`，A3 `main.directive.decision.*` 两条 key，零新增载荷字段；C2 §四（第 55 行）零新增字段/零新渲染分支、沿用既有 `chat/events.ts` 映射，§九 AC-10（第 112 行）。实测 `chat/events.ts:646-649` 已有 `detail.source==="delivery-note"` → `sys-call sys-delivery-note` 系统行 | **closed** |
| **P1-CAP-07** | C1 主进程先行握手（`did-finish-load`/`app:list-project`/`app:recovery-ready`/preload 缓存回放/`directive:list` 含 `directivesEnabled`）；C2 首发送前有界初始读，失败按 false；无需撤回或保留兜底 | C1 §2.5（第 78-79 行）逐项给出 `did-finish-load` 推送、`app:list-project`/`app:recovery-ready` 重推、preload 缓存并在 `onDirectiveState` 注册时同步回放、`directive:list` 成功载荷含 `directivesEnabled`；C2 §二（第 42 行）`ensureInitialRead()` 有界超时/失败按 false 正常发送并画气泡，§五（第 73 行）消费缓存回放；迟到 `res.directive` 保留移除乐观气泡兜底 | **closed** |
| **P1-CAP-08** | AC-22 写集/模态冲突由统筹/闸门 2 裁决；C2 在增补写集内设计；C1 纠正 AC-22 映射并协同 | 客户 W-1=A 已记录（沟通第 162-167 行）：C2 写集增补 `ConfirmCard.tsx`（按需 `shell.css`），保持 V1 AC-22 原语义；团队计划 §十三（第 657-663 行）同文，`app/renderer/` 既有目录边界无需 H1。C2 §八（第 91-102 行）选 A2 卡内指令入口：三张卡入口、默认折叠、焦点/Esc 互斥、z-index 90/95、待答 shell 卡徽标、不占 `shellCardSlot`/不进队列/不计 `pendingCount`、既有 shell 卡回归清单与 AC-22 证据；C1 §六 AC-22 行（第 149-153 行）改为“主进程侧部分覆盖 + C2 增补写集负责”，不再单方声称覆盖。V1 AC-22 第 864-890 行“shell 卡待答时仍可输入指令并打开面板”由卡内入口满足 | **部分**：设计层面闭合；C1 对“卡内入口经同一 `sendSession`、Composer 未开会话时不得回退普通聊天”的显式承诺/测试缺失，见 **P1-CAP-15** |

**阻断闭合小结**：P1-CAP-01/02/03/04/05/06/07 七项 **closed**；P1-CAP-08 **部分**（C2 设计与写集已闭合，C1 卡内入口协同项未闭合）。

### 三、非阻断处置表（P1-CAP-09..14）

| ID | 原审核要求 | Revision 1 处置 | 结论 |
| --- | --- | --- | --- |
| **P1-CAP-09** | A3 纳入“能力不可用/旧版本主进程”文案类别；确认 allowlist 不改或停止回报 | A2 §2.2（第 78 行）新增“能力不可用/旧版本主进程”类别（归 `ui.directive.error.*`），§8 第 3 项（第 148 行）明确新增 C1/C2 文件零 Han 则 `i18n-guard-allowlist.ts` 不改，确需新增条目则停止回报统筹；C2 §五（第 74 行）按 key 消费 | **closed** |
| **P1-CAP-10** | A2 退路 B 改为按 V1 §九.6 提供 B 证据、不改 V1 文本/版本 | A2 §1.5（第 58 行）已改为“Provider 独立实现/独立测试 + `task-state` 零改动证明，不改 V1 文本/版本”；E1 披露实际路径与失败证据 | **closed** |
| **P1-CAP-11** | C1 AC-22 行如实标注；补“冲突以 P1.1 为准”；不创建 `test/桌面应用/session.test.ts` | C1 §一（第 15 行）写“按 P1.2 文本施工，冲突以 P1.1 为准”；§六 AC-22 行（第 149-153 行）如实标注部分覆盖；§五（第 123 行）/§七.7（第 164 行）明确不创建 `session.test.ts`，Q9 断言放 B-4/既有 `run-change`/`version-decision` | **closed** |
| **P1-CAP-12** | C2 AC 表补 AC-15/18/19/20/23 说明；`typecheck:renderer` 证明 `ipc.ts` 类型折中 | C2 §九（第 117-121 行）逐条补“非 C2 主责/由 D1/E1/E2 覆盖”；§五（第 75 行）明确 `lib/platform.ts` 不在写集，`ipc.ts` 内 `unknown`+类型守卫，由 `npm run typecheck:renderer` 证明，无法证明即停止回报 | **closed** |
| **P1-CAP-13** | B1 优先 import A1 常量，避免 `task-state`/`run-manifest` 字面量漂移 | A1 §2.2（第 63 行）、§2.7（第 99-105 行）声明 `CUSTOMER_DIRECTIVE_ID_PATTERN`/`CUSTOMER_DIRECTIVES_REL`/五个上限常量单一来源；B1 §1.2（第 122 行）、§5（第 179 行）、§7（第 206 行）改为 import A1 常量并加正反例断言 | **closed** |
| **P1-CAP-14** | C1 写明应用运行级 `sessionId` 生成/注入位置、项目切换不重置 | C1 §2.5（第 80 行）明确 `app/main.ts` 在应用启动生成一次 `crypto.randomUUID()`，经 `DesktopDeps.directiveSessionId` 传入，每个项目 runtime 同值，项目切换不重置、重启失效；§七.8（第 165 行）补 AC-11 测试 | **closed** |

**非阻断小结**：P1-CAP-09..14 **全部 closed**；W-2（`CustomerInputOutcome.directive` 以 `{id, action}` 为冻结形状）由 A1 §2.4 明示；W-4（`session.test.ts` 陈旧边界）本任务不创建、不修；W-6（`request.presented.to` 不扩）由 A1 §2.4/C1 §四遵守；W-7（`interface.ts:1406-1411`）在 C1 既有单文件写集内，C1 §四已纳入。

### 四、跨提案一致性核查表

| # | 核查项 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | A1 `runtime.ts` 三个 Q9 字段 ↔ B1 校验/映射 ↔ C1 四处写入/展示 | **通过** | A1 §2.4/§2.5；B1 §5（第 178-180 行）；C1 §四（第 94-100 行）；均以 `directiveId?`/`"directive"` 为加法式扩展，`request.presented.to` 不扩 |
| 2 | B1 10 个公共句柄类型 ↔ C1 消费/实现 | **通过** | B1 §1.1 定义；C1 §2.3（第 45-54 行）`submitFromInput`/`list`/`revoke`/`state` 形状与 §八.172-174 冻结清单逐项对应；§七.7 双向可赋值 |
| 3 | `decisionGroupEnabled` A1 谓词 ↔ B1 入参/复算 ↔ C1 快照/面板 | **通过** | A1 §2.3（第 70 行）必填；B1 §1.1（第 50 行）必填、§1.1 说明（第 114 行）同值；C1 §2.3（第 56 行）当刻快照、§七.5 2×2 |
| 4 | C1 `directive:*` 五通道/五 preload 方法 ↔ C2 消费 | **通过（仅标点/说明性差异）** | C1 §2.4 表与 C2 §五表逐字段一致；`directivesEnabled`/`confirmable`/`directiveConfirmRespond` 无候选名残留；`DirectiveListView` 均为 `{active,consumed,revoked,expired}` |
| 5 | AC-10 冲突/不匹配说明投递 | **通过** | C1 选 `emitDirectiveNotice`→既有 `emitEvent` `delivery-note`；C2 零新增字段、既有系统行渲染；A3 `main.directive.decision.*` |
| 6 | 能力位握手时序 | **通过** | C1 §2.5 主进程先行 + preload 缓存回放；C2 §二 `ensureInitialRead()` 有界超时/失败 false；迟到 `res.directive` 兜底 |
| 7 | AC-22/W-1=A 的 C1/C2 分工 | **部分** | C2 §八 A2 设计完整；C1 §六 AC-22 映射已纠正；但 C1 未显式承诺/测试“卡内入口 `sendSession` + Composer 未开会话”路径 → **P1-CAP-15** |
| 8 | 五份修订稿写集 vs 团队计划 §4.3 + §十三 | **部分** | A1/A2/B1/C1 均在写集内；C2 的 `ConfirmCard.tsx`/`shell.css` 有 §十三授权；但 C2 §七/§八.102 将 `phase3b/phase4b` 写成“条件更新/冒烟扩展”，超出 §4.3 C2 精确写集（仅 `phase5a` 条件更新）→ **P1-CAP-16** |
| 9 | 版本与治理：P1.1/P1.2 等价、V1/沟通/方案未改、无待重开闸门 | **通过** | 哈希复算一致；五份修订稿均声明以 P1.1 为确认基线、P1.2 仅 R1/R2 编辑性；W-1=A 已在闸门 2 记录；无新方案/V1 文本变更 |
| 10 | 无新依赖/构建配置/计划外路径/第三个 `test/桌面应用/` 新文件 | **通过（C2 文字项除外）** | 五份均声明无新依赖/构建改动；C1 仅 B-4 两个新测试；C2 无 `test/桌面应用/` 新文件；`phase3b/4b` 文字项见 P1-CAP-16 |

### 五、残留发现

| ID | 严重度 | 所有者 | 发现 | 要求动作 | 依据 |
| --- | --- | --- | --- | --- | --- |
| **P1-CAP-15** | 高（阻断 C1/C2 冻结） | 桌面窗口（C1） | C1 §2.1 已覆盖“`sendSession` 命中即调用 `directiveInput.submitFromInput`、绝不 `manager.send`/`handle.send`、target 缺失/未注入 fail-closed 不回退幕僚”；但**未明确** C2 §八.100 的“shell 卡待答时经卡内入口走同一 `bridge.sendSession`、target 取卡载荷 `projectRoot/roleId/runtime`、即使 Composer 当前未开会话也不得回退普通聊天”，也未把该场景列入 C1 测试/冻结声明。C2 的 A2 是 AC-22 的唯一落点，该协同不能只靠推断 | C1 窄修订：在 §2.1/§五/§七 明确该路径（目标来自卡载荷；不依赖 Composer 当前会话/选中角色；target 无效即 fail-closed；命中不写 `lastUserText`/不产生角色轮次）；在 `directive-input.test.ts`/`directive-decision.test.ts` 增加“shell 卡待答 + 无开会话 → 卡内 `@审批` → `submitFromInput` 一次、`manager.send`/`handle.send` 零次、`directive:confirm-request` 推达”的断言；更新 AC-22 协同注 | C2 §八.95/§八.100；C1 §2.1（第 32 行）、§2.3（第 45-60 行）、§五/§七；V1 AC-22（第 864-890 行）；沟通 W-1=A（第 162-167 行） |
| **P1-CAP-16** | 中（阻断 C2 冻结） | 桌面UI（C2） | C2 §七（第 87 行）写“条件更新 `phase3b-electron-smoke.mjs`、`phase4b-electron-smoke.mjs`、`phase5a-electron-smoke.mjs`”，§八.102 又写“`phase3b`/`phase5a` 冒烟扩展”；但团队计划 §4.3 C2 只允许条件更新 `phase5a-electron-smoke.mjs`，未授权 `phase3b/phase4b`。C2 §八.101 同时说 `phase3b` 必须原样通过、`phase4b` 不需要更新，文本自相矛盾 | C2 窄修订：把 `phase3b/phase4b` 明确为**只运行、不修改**，从 §七“条件更新”和 §八.102“扩展”中删除；只保留 `phase5a` 的条件更新（§4.3 已授权）。若实施确需修改 `phase3b/phase4b`，停止回报统筹/闸门 2 增补写集，不得自行扩写集 | 团队计划 §4.3 C2（第 302-303 行）；C2 §七（第 87 行）、§八.101（第 101 行）、§八.102（第 102 行） |
| **P1-CAP-17** | 低（非阻断，A3 冻结前收口） | 项目管理（A2/A3）+ 桌面UI（C2） | A2 §2.2 的 A3 key 类别覆盖回执/应用结果/决策冲突/指令面板/确认面板/高危/错误/能力不可用/Q9，但未列 C2 AC-22 卡内入口所需“按钮/占位/提交/打开面板/禁用/状态/待答 shell 卡徽标”类别；C2 §六（第 81 行）要求 A3 必须纳入并在缺 key 时停止回报 | A3 冻结时新增 `ui.directive.cardEntry.*`（或等价）类别并纳入 `DIRECTIVE_KEYS`/计数/parity；C2 按 key 消费，不硬编码。不阻断本轮，但须在 A3 冻结前收口 | C2 §六（第 81 行）；A2 §2.2（第 69-79 行）、§2.4（第 94-96 行） |
| **P1-CAP-18** | 低（非阻断，C2 冻结前收口） | 桌面UI（C2） | C2 §八.95 写“target 取卡载荷 `projectRoot/roleId/runtime`（缺失回退当前选择）”；若卡载荷缺 `projectRoot`/`roleId`/`runtime`，回退“当前选择”可能把指令提交到与卡片不一致的项目/角色。C1 §2.1 对 target 缺失是 fail-closed，C2 的回退口径与之不完全一致 | C2 冻结前改为严格 fail-closed：卡载荷缺有效 target 时禁用入口并说明，不回退当前选择；如确需回退，限定为“同项目同角色同引擎”并写测试。非阻断，但影响授权归属清晰度 | C2 §八.95；C1 §2.1（第 32 行）；方案 §5.3/§9.2（归属与项目隔离） |

**非阻断备注**：C1 §2.3 `list(projectRoot): Promise<DirectiveListView | {ok:false, error}>` 与 §2.4 `directive:list` 返回 `approval`/`decision` 双视图的对应关系建议在 C1 冻结声明中写清（`list` 是否按 target 拆分）；不构成阻断。C1/C2 的 IPC 表“逐字”差异仅为标点与说明括注，不建议返工。

### 六、版本、治理与写集核对

- **版本纪律**：五份修订稿均以 P1.1（1199/`7875ad6a…`）为确认基线，P1.2（1209/`1748ad2d…`）仅作 R1/R2 编辑性等价引用；V1（1171/`51ac0f50…`）、沟通记录（168/`9f19821e…`）、方案 P1.2、团队计划（664/`ecac818c…`）哈希均与任务表一致；**未发现 V1/沟通/方案/计划的实质改动，无待重开闸门项**。
- **基线**：五份修订稿均以 `4c3a6e4` 为代码基线；本次复审实测 HEAD 一致、`git status --porcelain -- src app test` 为空；H1 的 B-1..B-4 已落地，C2 的 `ConfirmCard.tsx`/`shell.css` 在 `app/renderer/` 既有目录授权内，无需 H1。
- **写集**：A1（4 产品 + 2 测试）、A2（`jsonl-ledger.ts` + 测试 + i18n messages + `i18n.test.ts` + `shared-components.md`）、B1（Provider/Service/Pipeline + 6 既有编排文件 + 2 新测试 + 按需既有测试）、C1（`directive-input.ts` + `interface.ts`/`session.ts`/`customer-input.ts`/`requirement-change.ts`/`recovery-channel.ts`/`main.ts`/`preload.cjs` + B-4 两新测试 + 按需既有测试 + 条件 `e2e/main.mjs`）均在 §4.3 写集内；C2 的 `Composer.tsx`/`ipc.ts`/三个新文件/两个新测试/`shell.css`/`ConfirmCard.tsx` 在 §4.3 + §十三内，**但 `phase3b/phase4b` 文字项越界（P1-CAP-16）**。
- **无计划外文件/依赖/构建配置**：五份均声明不新增依赖、不改 `package.json`/`tsconfig*`/`vite.config.ts`/发布配方；C1 未创建第三个 `test/桌面应用/` 新文件；C2 未写 `App.tsx`/`lib/platform.ts`/`app/desktop/**`/`app/main.ts`/`app/preload.cjs`/`src/**`。

### 七、结论、理由与复审条件

- **总体结论：`needs revision`。** 不建议进入 A1/A2/A3 契约冻结，也不建议开始写产品代码。
- **理由**：
  1. 原 8 项阻断中 7 项已闭合，P1-CAP-08 的 C2 设计/W-1=A/写集已闭合；剩余问题不是方案或写集层面的不可达，而是两处**窄修订即可收口**的契约/写集文字项。
  2. **P1-CAP-15** 影响 AC-22 的唯一落点：C2 的卡内入口必须经 C1 的 `sendSession` 在“无开会话”场景下受理，C1 修订稿只给了通用拦截规则，未显式承诺该场景、未列入测试；在冻结前必须补成可核对的契约与断言。
  3. **P1-CAP-16** 是 C2 写集文字越界：`phase3b/phase4b` 不在团队计划 §4.3 C2 精确写集内，且 C2 §七/§八 自相矛盾；若按文字实施会造成计划外测试改动。C2 不需要扩写集，只需改为“只运行、不修改”。
  4. 不判 `not ready`：没有发现需要改 V1/方案/团队计划/边界或重开闸门的实质问题；两处修订均在原写集内，可由原 owner 窄修订后复审。
- **复审条件（下一轮只审这些）**：
  - C1 按 P1-CAP-15 补显式契约与测试；C2 按 P1-CAP-16 改 §七/§八.102 写集措辞（`phase3b/phase4b` 只运行不修改）。
  - P1-CAP-17/18 为非阻断，可在 A3/C2 冻结前收口，不作为本轮复审阻断；C1 的 `list` 双视图对应关系建议在冻结声明中写清。
  - 下一轮复审聚焦：C1 卡内入口/无开会话路径、C2 写集文字、C1/C2 IPC 冻结表一致性、A3 卡内入口 key 类别；其余已闭合项不再重开，除非修订引入新形状。
- **进入契约冻结的前置条件（在下一轮 `recommend approval` 之后）**：
  1. A1/A2/A3 可并行冻结；A2/A3 冻结先于 B1；A1+A2 冻结先于 B1；B1 冻结先于 C1；C1 IPC/preload 冻结先于 C2。
  2. H1 已完成、B0 基线 `4c3a6e4` 有效、V1/P1.1 未改；C2 的 `phase3b/phase4b` 回归只运行不修改；`phase5a` 仅按 §4.3 条件更新。
  3. A3 冻结的 key 集合含 P1-CAP-17 的卡内入口类别；C1 冻结的 IPC/preload 表与 C2 消费表逐字段一致；C1 的 `sendSession` 卡内入口路径有测试证据。
  4. 未取得下一轮 `recommend approval` 前，A1/A2/A3/B1/C1/C2 均不开工；本记录不是客户批准、不是实施授权、不是验收结论。
- **声明**：本复审只读；未运行测试/typecheck/构建/应用/E2E（A2 复跑数据按 B0 核对，未独立重跑）；未改提案/产品/测试/其他角色文档/角色卡/边界/`docs/scheduling/`/`docs/acceptance/`/`docs/communication/`；未 commit/push。

**本文件状态：P1 审核记录（Revision 1 止）；该时点总体结论 `needs revision`；Revision 2 复审见下节。**

---

## 复审记录（Revision 2，2026-11-03）

- **复审性质**：P1 实现提案**窄复审（Revision 2）**，只核 P1-CAP-15/16/17/18 的闭合与跨提案一致性；不重开 Revision 1 已 `closed` 项，除非本轮修订引入新形状。**不是客户批准、不是闸门、不是实施授权、不是测试结果、不是验收结论**；不替代 V1/E2。沟通记录当前 174 行 / `80b9170d…` 新增的“提交/合并预授权”节不改变 P1 口径，本复审**不据此执行提交**。
- **复审方式**：只读。复算五份修订稿与全部输入哈希，核对 `git rev-parse HEAD`、`git status --porcelain -- src app test`；抽读五份提案、团队计划 §4.3/§十三、方案 §3.5/§6.2/§7.1/§9.2、V1 §1.2.1/AC-22、沟通记录 W-1=A 节，以及 `app/desktop/interface.ts`、`app/preload.cjs`、`app/desktop/session.ts`、`app/desktop/operator-channel.ts`、`app/desktop/shell-escalation.ts`、`app/desktop/recovery-channel.ts`、`app/renderer/src/shell/ConfirmCard.tsx`、`app/renderer/src/chat/confirm-logic.ts`、`src/common/shared/runtime-shared.ts` 的符号/文本锚点。**未运行测试/typecheck/构建/应用/E2E**；未改提案/产品/测试/其他角色文档/角色卡/边界/`docs/scheduling/`/`docs/acceptance/`/`docs/communication/`；未 commit/push。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空。

### 一、复审对象与哈希（复算一致）

| # | 对象 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 P1 修订稿 | **172** | `f25702918d59cb1ce4b5c51f538c16edbb5c89c26b8915f8152d7e263f0cf8f4` | 与任务表一致；未变 |
| 2 | 项目管理 P1 修订稿 | **215** | `bc630843673d1b8fd7c77e07a85874e8b86e8abd9c471eb2b40881aab637cff1` | 与任务表一致；`Revision 2`（P1-CAP-17） |
| 3 | 编排 P1 修订稿 | **242** | `0d98e2004a6e7b07c749158ca8c582220d649eec437f9274cb14385384e97778` | 与任务表一致；未变 |
| 4 | 桌面窗口 P1 修订稿 | **232** | `13f1fd1c93f3d5713f37b094554c36cba33a622ded817fd9eb4e178319e8e9a3` | 与任务表一致；`Revision 2`（P1-CAP-15） |
| 5 | 桌面UI P1 修订稿 | **180** | `cde65f8059ea4219561746d59e40e36b7b72e9d2b760ed76328cd537c83042f5` | 与任务表一致；`Revision 2`（P1-CAP-16/18） |
| 6 | 团队计划（含 §十三增补） | **664** | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | 与任务表一致；v1 653 / `37e6bd0d…` + §十三 |
| 7 | 方案 P1.2（盘上当前） | **1209** | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | 与任务表一致；R1/R2 编辑性等价 |
| 8 | 方案 P1.1（确认基线快照） | **1199** | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` | 由 P1.2 头注/团队计划/V1 引用；盘上未单独落盘，未独立复算 |
| 9 | V1 实施前标准 | **1171** | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | 与任务表一致 |
| 10 | 沟通记录（当前） | **174** | `80b9170d909402d4363155b66af581a424ac5b7ee562b6399ff66c98b7240a3a` | 与任务表一致；含 W-1=A 与提交/合并预授权 |
| 11 | B0 基线记录 | **239** | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | 与任务表一致 |
| 12 | 本审核记录（Revision 1 止） | **306** | `8427ff02c138562916fe8a84c5f1378a055276163bc8d4b4916b58347d92b1e0` | 本轮追加前复算；保留原正文并追加本节 |

- **哈希结论**：五份修订稿与全部输入均与任务表一致，无停止项。P1.1 为闸门 1 客户确认基线，盘上以 P1.2 承载 R1/R2 编辑性收口；V1 §1.2.1 与沟通记录均确认语义等价，冲突以 P1.1 为准。
- **复审边界**：A2 修订稿所称“复跑 158/153/0/5/0，exit 0”为 Revision 1 作者自述；本轮用 B0 第 114 行核对一致，**未独立重跑**。

### 二、P1-CAP-15/16/17/18 闭合表

| ID | 原复审要求 | Revision 2 落点与独立核对 | 结论 |
| --- | --- | --- | --- |
| **P1-CAP-15** | C1 明确“shell 卡待答、Composer 未开会话”时卡内入口走同一 `bridge.sendSession`、target 取卡载荷 `{projectRoot,roleId,runtime}`；命中即 `submitFromInput`，不得回退 `manager.send`/`handle.send`/普通聊天；target 缺失/非法/跨项目 fail-closed、不回退当前选择；给出 `directive-input.test.ts` 断言；写清 `list(projectRoot)` 与 `directive:list`/`directive:state` 双视图映射 | C1 §2.1（第 34 行）逐字写明同一 `bridge.sendSession(text, images, target, {clientMessageId})`、卡内 `images=[]`、target 取卡载荷、不读 Composer 当前会话/选中 target、未开会话或 target 不同也不回退 `manager.send`/`handle.send`/普通聊天；target 缺失必填项/非法/跨项目 ⇒ `{ok:false,error}`（不落账、不投递、无回执、不回退当前选择）；§2.3（第 52/63 行）`list(projectRoot): Promise<DirectiveListResult>` 与 `directive:list`/`directive:state` 同一 service 视图（`{approval,decision,ledgerErrors}` 一一映射、不新增跨 target 字段、不跨项目聚合）；§五（第 121 行）与 §七.9（第 169 行）把“卡内入口 + Composer 未开会话 + 无/非法/跨项目 target”列入 `directive-input.test.ts`，断言 `directive:confirm-request` 推达、`submitFromInput` 恰一次、`manager.send`/`handle.send` 零次、无角色轮次/`lastUserText` 变化；§六 AC-22（第 152/156 行）与 §七.4（第 164 行）纳入冻结声明。独立核对：`interface.ts:651/2339` 的 `sendSession(input:{text,images?,target?,metadata?})` 与 `preload.cjs:65` 的四参传递可承载 `metadata.clientMessageId`（`session.ts:336-349`）；shell 卡载荷 `ShellConfirmRequest`（`operator-channel.ts:870-934`）含 `roleId?/projectRoot?/runtime?` 并由 metadata 填充，升级卡（`shell-escalation.ts:68-70`）三者必填，恢复卡（`recovery-channel.ts:39-45`）`roleId` 必填、`projectRoot/runtime` 可选 | **closed** |
| **P1-CAP-16** | C2 `phase3b`/`phase4b` 改为“只运行、不修改”；仅 `phase5a` 条件更新；删除越界表述并保留停止口径；与 §八.101 一致 | C2 §七（第 90 行）明确 `phase3b`/`phase4b` **只运行、不修改**，仅按团队计划 §4.3 条件更新 `phase5a`，确需修改前两者则停止回报统筹/闸门 2；§八回归清单（第 104 行）写 `phase3b` 原样通过、不修改，`phase4b` 只运行、不需更新，`phase5a` 是唯一允许条件更新的冒烟文件；§八 AC-22 证据（第 105 行）同口径；§十四（第 174 行）记录处置。全文检索无“条件更新/扩展 `phase3b`/`phase4b`”的现行表述（Revision 1 历史表第 160 行仅保留“`phase3b`/`phase5a` 冒烟”，不构成实施指令） | **closed** |
| **P1-CAP-17** | A3 新增 `ui.directive.cardEntry.*` 类别与 14 个具体 key，覆盖卡内入口标签/展开/输入/提交/取消/状态/错误/徽标；C2 按 key 消费；计数策略含新类别；无新增文件/依赖 | A2 §2.2（第 78 行）新增 `ui.directive.cardEntry.*` 类别；§2.5（第 100-125 行）列 14 个 key：`entryLabel`/`expand`/`collapse`/`inputPlaceholder`/`submit`/`cancel`/`openPanel`/`status.submitting`/`status.confirmOpened`/`error.notDirective`/`error.invalidTarget`/`error.submitFailed`/`pendingShell.badge`/`pendingShell.note`；§2.4（第 94-97 行）新增 `DIRECTIVE_CARD_ENTRY_KEYS`（14）并纳入 `DIRECTIVE_KEYS`/parity/占位符/en-US 零 Han 循环，分区与总数按实测更新（示意 `ui` 1001→1015、总数 1642→1656，以实测为准）；C2 §六（第 84 行）声明按 key 消费、缺 key 停止回报；C2 §八（第 97 行）卡内入口的状态/错误/徽标使用 A3 key。独立核对：14 个 key 唯一、无 `main.*`/`shared.*` 新增，写集未新增文件/依赖 | **closed** |
| **P1-CAP-18** | C2 卡载荷 target 缺失/非法/跨项目严格 fail-closed（入口禁用或提交被拒、不调用 `sendSession`、不画气泡、不落账、不回退当前选择），与 C1 fail-closed 一致 | C2 §八“UI/交互”（第 97 行）写明卡载荷 target 无效时入口禁用并显示 A3 错误；“提交路径”（第 98 行）写明 target 只取卡载荷 `{projectRoot,roleId,runtime}`，三者须为非空字符串、`runtime` 属 `"pi"\|"codex"\|"claude"`、`projectRoot/runtime` 与当前项目/引擎一致、`roleId` 取卡片所属角色且不回退 Composer 当前选择；任一缺失/非法/跨项目 ⇒ 严格 fail-closed（入口禁用或提交被拒、行内 A3 错误、不调用 `sendSession`、不画气泡、不落账、不回退当前选择）；§八回归清单（第 104 行）补“零 `sendSession` 调用、零气泡/零落账”断言；§九 AC-22（第 118 行）与 §十四（第 175 行）同步。C1 对侧 §2.1（第 34 行）以 `projectRoot === recoveryProjectRoot`、`roleId` 在 `ProjectListing.roles` 内、`runtime` 若提供须有效，缺失/非法/跨项目 fail-closed；两提案方向一致（`runtime` 严格度差异见 §四 N1） | **closed** |

**闭合小结**：P1-CAP-15/16/17/18 **全部 closed**；四项均落在原提案与原写集内，未发现需扩写集、边界或方案变更的残留阻断项。

### 三、跨提案一致性核查表

| # | 核查项 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | C1 冻结 IPC/preload 名与载荷 ↔ C2 消费表逐字一致 | **通过** | 两表五行通道、字段名、载荷结构完全一致；差异仅 `directive:list` 成功/失败之间的“，/；”标点与 C1 `directive:state` 的“（与 directive:list 成功视图同形）”说明括注，无名称/载荷差异。C2 正文只出现 `directivesEnabled`/`confirmable`/`directiveConfirmRespond`，旧候选名仅作为“弃用”说明出现 |
| 2 | C2 A2 卡内入口 ↔ C1 P1-CAP-15 的接口/错误语义 | **通过** | 同一 `bridge.sendSession(text, [], target, {clientMessageId})`；target 均取卡载荷 `{projectRoot,roleId,runtime}`；均不回退 `manager.send`/`handle.send`/普通聊天、不画气泡、不落账；均要求 target 缺失/非法/跨项目 fail-closed。`runtime` 严格度差异为非阻断 N1 |
| 3 | B1 `emitResult`/`decisionGroupEnabled`/类型 ↔ C1 快照 | **通过** | B1 §1.1（第 50/84 行）`SubmitFromInput.decisionGroupEnabled: boolean` 必填、`DecisionHooks.emitResult` 唯一钩子；§1.1 说明（第 114 行）与 §8（第 219 行）均要求“先 `await emitResult`，抛错/拒绝 ⇒ 不消费、返回 `undefined`”；C1 §2.3（第 49/58 行）同一字段进提交快照、§三（第 91 行）以 `{emitResult}` 调用、§八（第 177 行）按 B1 Revision 1 冻结面消费；`SubmitResult`/`DirectivePresenter`/`DirectiveListResult` 形状与 C1 使用一致 |
| 4 | A3 key 覆盖 C2 卡内入口与能力不可用 | **通过** | A3 §2.2（第 78-79 行）同时列 `ui.directive.cardEntry.*` 与 `ui.directive.error.*` 能力不可用类别；§2.5 14 key 覆盖入口/展开/输入/提交/取消/打开面板/状态/错误/徽标；C2 §六（第 84 行）按 key 消费、缺 key 停止回报；C2 §八（第 97 行）引用 A3 错误文案 |
| 5 | A1/B1 常量一致性 | **通过** | A1 §2.2（第 46-48 行）单一来源导出 `CUSTOMER_DIRECTIVE_ID_PATTERN`/`CUSTOMER_DIRECTIVES_REL`/五个上限；B1 §1.2（第 122 行）、§5（第 179 行）、§7（第 206 行）import A1 常量并加正反例断言；C1 §2.4 的 `DirectiveListView` 形状与 B1 §1.1（第 93 行）一致 |
| 6 | C1 `list(projectRoot)` ↔ `directive:list`/`directive:state` 双视图 | **通过** | C1 §2.3（第 52/63 行）与 §七.4（第 164 行）明确同一 service 视图、一一映射、不新增跨 target 字段/不跨项目聚合；B1 §1.1（第 94-96 行）`DirectiveListResult` 为 `{ok:true,projectRoot,approval,decision,ledgerErrors}`；C2 §五按同形载荷消费 |
| 7 | 五份修订稿写集 ↔ 团队计划 §4.3 + §十三 | **通过** | A1（4 产品 + 2 测试）、A2/A3（`jsonl-ledger.ts` + 测试 + i18n messages + `i18n.test.ts` + `shared-components.md`）、B1（Provider/Service/Pipeline + 8 既有编排文件 + 2 新测试 + 按需既有测试）、C1（`directive-input.ts` + 7 既有桌面文件 + 2 新测试 + 按需既有测试 + 条件 `e2e/main.mjs`）均在 §4.3；C2 的 `ConfirmCard.tsx`/按需 `shell.css` 有 §十三授权，其余在 §4.3。C1 未建第三个 `test/桌面应用/` 新文件；C2 未写 `test/桌面应用/**`；无新依赖/构建配置 |
| 8 | 版本与治理：P1.1/P1.2 等价、输入未被提案改写、无待重开闸门 | **通过** | 哈希复算一致；五份修订稿均以 P1.1 为确认基线、P1.2 仅 R1/R2 编辑性；V1/沟通/方案 P1.2/团队计划 v1 未被提案改写；W-1=A 已在闸门 2 记录（沟通第 162-167 行、团队计划 §十三），P1-CAP-15..18 均不需重开闸门 1/2；沟通 174 行仅追加“提交/合并预授权”，不改变 P1 口径 |
| 9 | 无候选名/旧措辞残留 | **基本通过（非阻断 N2）** | `enabled`/`canConfirm`/`directiveRespond`/`deliver` 只作为弃用/否定说明出现；C2 §十四“保留”行仍写“系统行 `directiveNotice` 零新增字段”，该名是已删除的载荷字段，现行实现应表述为 `emitDirectiveNotice`→`delivery-note` 系统行（N2） |
| 10 | 测试/证据计划可执行 | **通过** | C1：`node --test --test-concurrency=1 test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts` + `npm run typecheck`；C2：`node --test "test/桌面UI/*.test.ts"` + `npm run typecheck:renderer` + `npm run build:renderer` + 真实 Electron 截图；A3：`test/项目管理/shared/*.test.ts` + `npm run typecheck`；证据路径与候选哈希口径与 B0/团队计划一致。本轮未运行这些命令 |

### 四、残留发现（均为非阻断）

| ID | 级别 | 所有者 | 发现 | 建议动作 | 依据 |
| --- | --- | --- | --- | --- | --- |
| **N1** | 低（非阻断，冻结前措辞） | 桌面窗口（C1）+ 桌面UI（C2） | C1 写 `runtime` “若提供须为有效 `RuntimeKind`”，C2 写三者必须均为非空字符串且 `runtime` 只列 `"pi"\|"codex"\|"claude"`；实际 `RuntimeKind` 还含 `"demo"`（`runtime-shared.ts:19`），且恢复卡的 `projectRoot`/`runtime` 为可选。两者都 fail-closed，无安全/契约风险，但冻结声明若不统一，卡内入口在缺 `runtime`/`demo` 场景的可达性会出现解释差异 | C1/C2 冻结声明统一一句：要么 C2 接受完整 `RuntimeKind`（含 `demo`），要么明确排除 `demo` 并写“缺 `runtime` 时入口禁用”；恢复卡缺省行为在 C2 测试中注明 | C1 §2.1（第 34 行）；C2 §八（第 98 行）；`src/common/shared/runtime-shared.ts:19`；`recovery-channel.ts:39-45` |
| **N2** | 低（非阻断，冻结前措辞） | 桌面UI（C2） | C2 §十四“保留”行（第 178 行）写“系统行 `directiveNotice` 零新增字段”；`directiveNotice` 是 Revision 1 已删除的载荷字段，现行方案是 C1 `emitDirectiveNotice` 经既有 `emitEvent` 投 `delivery-note` 系统行，C2 零新增字段/零渲染分支 | 冻结前把该行改为“`emitDirectiveNotice`→既有 `delivery-note` 系统行，零新增载荷字段”，避免被读成新的冻结字段 | C1 §三（第 89 行）；C2 §四（第 58 行）/§九（第 115 行）；P1-CAP-06 处置 |
| **N3** | 低（非阻断，输入快照） | 运行时核心（A1）+ 编排（B1）+ 桌面UI（C2）+ 桌面窗口（C1） | A1/B1 未变稿仍引用沟通 168 行 / `9f19821e…`；当前 174 行 / `80b9170d…` 仅追加“提交/合并预授权”。C1/C2 Revision 2 的输入行分别引用 C2 162 行 / `40c47efd…` 与 C1 210 行 / `866596f0…` 的修订前快照；现行契约未变 | 无需返工；冻结声明/完成记录引用当前 174 行与各自现行哈希即可 | A1 §1；B1 卷首；C1 §十；C2 §十四；沟通记录尾部 |
| **N4** | 低（非阻断，冻结前说明） | 桌面UI（C2） | C2 §八称三张卡（shell 确认/升级/恢复）均有入口，但恢复卡载荷 `projectRoot`/`runtime` 为可选；按 C2 严格 fail-closed，缺任一即入口禁用。AC-22 的“shell 卡待答”主场景不受影响，但 C2 不应承诺恢复卡入口始终可用 | C2 冻结前在 §八/测试中注明：恢复卡缺有效 target 时入口禁用并显示 A3 错误；不新增字段/不要求 C1 扩写集 | C2 §八（第 97-98 行）；`recovery-channel.ts:39-45`；V1 AC-22 |
| **N5** | 低（非阻断，A3 冻结时） | 项目管理（A3） | A3 的 `ui` 1001→1015、总数 1642→1656 为示意计数；A3 已声明以冻结时实测为准 | A3 冻结时按实际 `i18n.test.ts` 计数更新并记录命令/输出；不预设数字 | A2 §2.4（第 97 行）；A3 冻结声明 |

**非阻断备注汇总**：N1–N5 均可在各自冻结声明/完成记录中收口，不需要修改方案、V1、团队计划、边界或重开闸门 1/2；不影响 P1 结论。

### 五、结论、理由与进入契约冻结的条件

- **总体结论：`recommend approval`。** P1-CAP-15/16/17/18 全部闭合；跨提案冻结面一致；写集/边界与治理版本核对通过；未发现需扩写集、改方案/边界/计划或重开闸门的残留项。
- **理由**：
  1. **P1-CAP-15**：C1 已把“shell 卡待答 + Composer 未开会话”的卡内入口写成可核对契约——同一 `bridge.sendSession`、target 取卡载荷、命中即 `submitFromInput`、不回退 `manager.send`/`handle.send`/普通聊天、target 无效 fail-closed；`directive-input.test.ts` 断言与 `list(projectRoot)` 双视图映射均已写入冻结声明。
  2. **P1-CAP-16**：C2 已删除 `phase3b`/`phase4b` 的越界更新表述，明确“只运行、不修改”，仅保留 `phase5a` 条件更新与停止回报口径，与 §4.3/§十三一致。
  3. **P1-CAP-17**：A3 已新增 `ui.directive.cardEntry.*` 类别与 14 个 key，覆盖卡内入口标签/展开/输入/提交/取消/状态/错误/徽标；计数策略纳入 `DIRECTIVE_CARD_ENTRY_KEYS`/`DIRECTIVE_KEYS`；未新增文件/依赖，C2 按 key 消费。
  4. **P1-CAP-18**：C2 已把卡载荷 target 缺失/非法/跨项目改为严格 fail-closed，并补“零 `sendSession`、零气泡、零落账、不回退当前选择”断言；与 C1 主进程 fail-closed 方向一致。
  5. **跨提案一致性**：C1/C2 五通道/五 preload 方法/载荷逐字段一致；B1 `emitResult`/`decisionGroupEnabled`/公共句柄与 C1 快照一致；A3 key 覆盖 C2 卡内入口与能力不可用；A1/B1 常量单一来源；无候选名/旧措辞的现行残留（N2 为说明性措辞）。
  6. **治理/版本**：五份修订稿与全部输入哈希一致；P1.1 确认基线 + P1.2 编辑性等价；V1/沟通/方案/团队计划 v1 未被提案改写；W-1=A 已在闸门 2 记录；无待重开闸门项。沟通记录的提交/合并预授权不改变 P1 口径，本复审不据此执行提交。
- **P1 收口，可进入契约冻结；A1/A2/A3 并行、A2/A3 先冻结、B1→C1→C2 顺序。**
- **进入契约冻结的条件**：
  1. A1/A2/A3 可并行冻结；A2/A3 冻结先于 B1；A1+A2 冻结先于 B1；B1 冻结先于 C1；C1 的 IPC/preload 冻结先于 C2。
  2. A3 冻结 key 集合含 P1-CAP-17 的 14 个 `ui.directive.cardEntry.*` 与能力不可用类别，计数按实测更新；C2 只按 key 消费，缺 key 停止回报。
  3. C1 冻结声明含卡内入口 `sendSession` 契约、`list(projectRoot)` 与 `directive:list`/`directive:state` 双视图、`directive-input.test.ts` 的卡内入口/无开会话/无或非法或跨项目 target 证据；不创建第三个 `test/桌面应用/` 新文件。
  4. C2 冻结时 `phase3b`/`phase4b` 只运行不修改，`phase5a` 仅条件更新；`ConfirmCard.tsx`/按需 `shell.css` 为唯一 §十三 增补，不新增依赖/构建配置。
  5. 基线 `4c3a6e4` 有效；若 rebase，受影响证据重跑；本记录不是客户批准、不是实施授权、不是测试结果、不是验收结论，实施仍需按团队计划与已记录授权推进。
- **需统筹裁决项**：**无新增**。W-1=A 已由客户在闸门 2 记录；P1-CAP-15..18 均在原写集内闭合；N1–N5 属 C1/C2/A3 冻结前文字/说明收口，不构成写集/边界/方案变更，不需要重开闸门。若冻结时发现需新增通道字段、修改 `phase3b`/`phase4b`、改 V1/方案文本或扩写集，按停止项回报统筹，不自行扩写。
- **声明**：本复审只读；未运行测试/typecheck/构建/应用/E2E（A2 复跑数据按 B0 核对，未独立重跑）；未改提案/产品/测试/其他角色文档/角色卡/边界/`docs/scheduling/`/`docs/acceptance/`/`docs/communication/`；未 commit/push；不据沟通记录预授权执行提交。

**本文件状态：P1 审核记录（含 Revision 1/Revision 2 窄复审）；总体结论 `recommend approval`；未运行测试、未实施、未验收、未 commit/push。**
