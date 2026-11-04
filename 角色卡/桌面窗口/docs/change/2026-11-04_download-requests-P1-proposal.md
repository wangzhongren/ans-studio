---
id: download-requests-p1-proposal-desktop
type: change
title: 下载文件申请 P1 实现提案（桌面窗口 C1，修订 2）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
---

# 桌面窗口 P1 实现提案：下载文件申请（C1，修订 2）

- **任务**：`2026-11-04-download-requests`（产品 flowId `download-requests`，风险档位 T3）。本文件只是 C1 实现提案：**不写产品/测试代码、不运行实施测试、不写 boundary/changelog、不 commit/push**；状态 `proposal-only`。
- **基线**：分支 `feat/download-requests`，HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`（含 PR #57 指令自然语言、PR #58 应用决策卡不再被「替我决策」代选）。写盘前实测 `git status --porcelain -- src app test` 为空。
- **本次修订依据**：P1 复审 Revision 1 记录 `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`（**501 行 / `7f8a3ea58782f74245aa1151ab29805fcafb73ddfa4822c84fb7d48620d99a01`**；原审核 340 行 / `503aaf34…` 保留）。复审结论 `needs revision`（C1 最小修订），剩余 **R2 dispose 对齐**、**R3 `directive-input.ts` 独立写集增补/等价接线**、**R4 `downloadFacts`/`attribution` 字段澄清**；本版逐项关闭。上一版 434 行 / `7a8db507…` 已被本版取代；复审以本版行数/SHA-256 为准。
- **输入（只读核对，哈希为写盘前实测）**：
  - 方案 P1.1 `docs/planning/2026-11-04_design_download-requests.md`：全文 **1018 行 / `de838c26…`**（正文 1017 行 / `2590b560…`）。
  - 团队计划 `docs/scheduling/2026-11-04_team-plan_download-requests.md`：**693 行 / `d9760755…`**。
  - 验收标准 V1 `docs/acceptance/download-requests-criteria-v1.md`：**1056 行 / `4a7c66ab…`**。
  - B0 v2：**239 行 / `73c660c6…`**（T3 3665/3638/9/18；`test/桌面应用/**` 539/539；新增确定性失败 0、新增 skip 0）。
  - 闸门 2 写集增补 + V1 确认记录：`docs/communication/2026-11-04_gate2-writeset-addendum_download-requests.md` **28 行 / `aeff744cb852c1e2c3ac718d4640c1803c0628c826a68fbcdb260eeb91f84212`**（确认 F4/F5、F6 顺序、V1 可派发；**不含 C1 `directive-input.ts`**）。
  - 同级 P1 提案（只读对照）：A1 **427 行 / `84c1148e…`**、B1 Revision 1 **821 行 / `291af57c111082913105fd76af0a72a334a7c6fe543a37f1225b0085654dd405`**、A2 Revision 1 **458 行 / `37c74edb…`**、C2 Revision 1 **255 行 / `52a560a5…`**。本版按 **B1 Revision 1 已冻结契约**逐字对齐（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`/`dispose()`/每会话运行时/`downloadId` B1 生成）。
- **H1/B-4**：`boundary.md` 第 81–82 行、`boundary.yaml` 第 236–241 行已落地两个桌面测试精确条目；本提案不写边界文件。

## 一、事实（只读核对，2026-11-04 c2f1630）

### 1.1 依赖与边界现状

- **[事实]** A1（`src/model/download.ts`、`runtime.ts`/`directive.ts` 加法、工具层）、B1（`src/provider/download/`、`src/service/download/`、`src/pipeline/orchestration/download-request.ts`、`takeDownloadDirective`、judge rubric/物证、`downloads.jsonl`、G8 epoch）、A2（i18n key）均**未实施**；A1/B1 提案已 `recommend approval`，A2 Revision 2 待写盘；C1 入口条件为 A1 + B1 + A2（Revision 2 复审后）冻结 + H1 完成 + V1 经 addendum 确认。
- **[事实]** `app/desktop/` 无任何 download 实现；`app/preload.cjs` 无下载专用通道；下载卡复用 `session:operator-request/response`（`app/preload.cjs:274-283`）与 `session:operator-judge`（`:387-388`），**无需新 IPC**。
- **[事实]** `app/main.ts` 的客户交互通道在窗口作用域构造（`app/main.ts:595-647`）；approval 组开关只读持久化 `shellJudgeSwitch`（`:625`），不读 `shellSessionPaused`（`:798` 仅 shell 操作者通道）。这是 G7 A 的既有接线。
- **[事实]** 指令面板数据路径为 `directive:list`/`directive:state` → `app/desktop/directive-input.ts:721` `runtimeFor(projectRoot).list()` → 原样返回 `result.approval`/`result.decision`（`:727-735`）；B1 Revision 1 的 `list()` epoch 投影（旧 domain `consumer:"none"`、新 domain `"download"`）由 C1 原样透传（F3 形状 A），**F3 不需要改 `directive-input.ts`**。
- **[事实]** `DirectiveInputController`（`app/desktop/directive-input.ts:142-154`）**未暴露** `takeDownloadDirective`/`CustomerDirectiveRuntime`；`runtimeFor` 是 `createDirectiveInputController` 内部闭包（`:445`），控制器由 `app/main.ts:558` 创建。F11 的 `takeDownloadDirective` 访问器因此是**独立于 F3 的写集问题**（R3/F13）。

### 1.2 现有代码锚点（c2f1630，符号为准）

| 主题 | 当前锚点（写盘时实测） | 与 C1 的关系 |
| --- | --- | --- |
| `customerInput` 注入 | `app/desktop/session.ts:2586` | **不改判据**；项目角色仍无 `request_confirmation` |
| 每会话 judge 闭包 | `session.ts:2820-2833`（条件 `:2821`） | W-2 扩展点 |
| 客户卡上下文构造 | `session.ts:2836-2859` `buildCustomerInputContext` | 复用；扩展 `judgeNotice` 透传 |
| `withRequestLifecycle` | `session.ts:4086-4325`（presented `:4272-4277`；resolved `:4294-4312`） | 下载卡生命周期；下载归属修正 |
| `requestIdFor` | `session.ts:3668-3684` | 卡片路径 `requestId` 唯一来源（C1 生命周期用） |
| `openRoleSession` 桌面镜像类型 | `session.ts:576-644` | 增加 `requestDownload?` |
| `planJudge` | `customer-input.ts:1190-1247` | W-4 透传 |
| `settleJudgeOutcome` | `customer-input.ts:1352-1553` | 下载 manual 分支 |
| `escalateJudgeOutcomeToCustomer` | `customer-input.ts:1321-1337` | 升级客户 |
| `presentEntryNow` / `unavailableReason` | `customer-input.ts:1828-1886` / `:1841-1870` | 判断前防御 |
| `tryAutoSelectDecision` / PR #58 判据 | `customer-input.ts:1617-1679` / `:317-329` | **不得改动** |
| `preauthorizeWrite` | `customer-input.ts:2015-2107` | 显式排除 download |
| `judgeResultSummary` | `customer-input.ts:424-454` | 增加 download 分支 |
| `directive-input.ts::list` | `directive-input.ts:714-736`（`runtimeFor().list()` `:721`；返回 `:727-735`） | F3 面板数据透传点 |
| `directive-input.ts` runtime 持有 | `directive-input.ts:142-154`（controller 接口）、`:346`、`:445` `runtimeFor` | F11 `takeDownloadDirective` 绑定来源（R3/F13） |
| `sendSession`（PR #57） | `interface.ts:2407-2473` | 不改 |
| `importedProjectRoot` | `interface.ts:907`、`:2214` | 项目根授权口径 |
| `SessionManager` 装配 | `interface.ts:1946-2004` | 增加下载工厂/appVersion 透传 |
| `app.getVersion()` | `app/main.ts`（Electron `app` 已在用） | `downloadAppVersion` 来源 |
| 窗口关闭 | `app/main.ts:649/651/669/682`、`:932-942` | 既有 fail-closed（`rejectAllPending` + session dispose） |
| i18n | `app/desktop/i18n.ts:45-47` `mainT` | 新模块只消费 key |

### 1.3 PR #57 / PR #58 重叠面

- **PR #57（`f394cfb`，提交 `2672208`）**：`session.ts` +80（解释器 import + `interpretDirective`）、`interface.ts` +21、`main.ts` +6、`directive-input.ts` +8，均为不同区域加法。C1 不得删除/回退解释器；C1 在 `session.ts` 改 `SessionManagerDeps`/`open()`/`withRequestLifecycle`，在 `interface.ts` 改 `DesktopDeps`/manager deps/返回对象，在 `main.ts` 只加 `downloadAppVersion`。
- **PR #58（`c2f1630`，提交 `61a5889`）**：`customer-input.ts` +39，新增 `isApplicationDecisionReservedForCustomer` 与 `tryAutoSelectDecision` 早退。C1 **不得改这两处**；下载卡 `kind:"confirm"`、`cardKind:"download"`，`entry.decisionCard` 恒空，天然不进入 `tryAutoSelectDecision`；既有 `decision-service.test.ts`/`run-change-entry.test.ts`/`version-decision.test.ts` 回归钉住。
- **锚点漂移**：方案行号基于 `c8a9394`；实施以符号/文本锚点为准（团队计划 §1.5.3 #4）。主要漂移：`session.ts:2498-2506`→`:2573-2586`、`:2740-2779`→`:2799-2859`、`:4006-4230`→`:4086-4325`、`:3588-3604`→`:3668-3684`；`customer-input.ts:1156-1213`→`:1190-1247`、`:1318-1519`→`:1352-1553`、`:1287-1303`→`:1321-1337`、`:1789-1840`→`:1828-1886`；`interface.ts:897-927`→`:916-940`、`:2388-2454`→`:2407-2473`；`main.ts:589-641`→`:595-647`。

### 1.4 项目规则核对（`角色卡/项目管理/docs/project-rules.md`）

- 与已确认条目无冲突：`§一.2` 五层相邻调用（C1 只消费 A1 Model/B1 Pipeline，不 import Service/Provider）；`§一.5` 共享组件只读复用；`§二.3/4/5` 证据绑定/重测；`§二.6` 不伪装成功；`§二.7/8` 设计先行/状态如实；`§二.9` T3；`§二.10` 既有诊断、不记凭据/正文；`§二.16` 客户确认走卡片（下载卡为应用自有 confirm 种，审核 §六已裁决与规则 16 不冲突）；`§二.17` 截图上限。
- 审核记录的非阻断建议（PM 后续在工程法案加范围说明、补 A1/C2 对照表）不属 C1 写集，本提案只记录。

## 二、职责与分层结论（按审核 F1/F2 修订）

1. **C1 是 Interface 层**：只做「卡片组装 + 能力位包装 + 回执投影」；**不做 URL/协议/凭据/DNS/IP/文件名/上限判定**，不读写 `.ans/**`、不读指令账本、不读写 `downloads.jsonl`、不直接发网络请求或写文件。判定/执行/审计由 B1 Pipeline（经 Service/Provider）完成。
2. **判断上下文（F1，B1 Revision 1 已冻结方案 1）**：B1 的 presenter 请求携带完整判断上下文：`governanceFacts: GovernanceJudgeFacts`（B1 用 `buildGovernanceJudgeFacts({flowId})` 构造的最小形状）、`downloadFacts: DownloadJudgeFacts`、`attribution: { flowId, intentId?, taskId?, flowIdIsSynthetic }`、`toolCallId?/turnId?`、`factsAvailable`。C1 **原样映射**到 `metadata.judgeContext`（`facts`/`download`/`flowId`），不重算、不读账本、**不自造 `GovernanceJudgeFacts`**；`factsAvailable:false` ⇒ 省略整个 judgeContext + `judgeNotice`。B1/C1 字段名逐字对齐（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`）。
3. **卡片走应用自有通道**：下载卡 `kind:"confirm"`、`cardKind:"download"`，经窗口级原始 `deps.customerInput` + `withRequestLifecycle` 呈现；不经过 `run-role.ts::governedInput` 的 `TRIO_CARD_KINDS`，不打开项目角色 `customerInput`。
4. **运行时生命周期（F2）**：采用**每会话运行时**（C1 在 `open()` 中创建/持有，绑定 `roleId/runtime/present/takeDownloadDirective/appVersion`）；B1 的**模块级**并发 Map（按归一化项目根）与 `jsonl-ledger` 模块级按绝对路径串行链保证「每项目执行并发 ≤2」与账本不交错。C1 **不**在 Interface 缓存每项目运行时。
5. **`downloadId`（F2）**：由 **B1 Pipeline 生成**（`downloads.jsonl` 属主）；C1 不生成、不传入，只从 presenter 请求/结果中消费/透传。
6. **开关语义**：下载属 approval 组，复用持久化「替我审批」开关；`shell:judge-pause` 只暂停 shell（G7 A）；C1 不新增开关、不读暂停、不做第二套判断。

## 三、设计候选：能力位与每会话接线（W-1 / W-2）

### 3.1 依赖注入与每会话运行时（F2/F11/F12）

- `SessionManagerDeps` 新增（C1 内部契约）：
  - `createDownloadRuntime?: typeof createDownloadRequestRuntime`——B1 公共工厂；缺省由 Interface 注入真实实现（沿 `createGovernanceJudge` 先例）。
  - `downloadAppVersion?: string`——G8 epoch 文件所需应用版本；由 `app/main.ts` 用 `app.getVersion()` 提供；空/缺失 ⇒ 不注入下载能力（fail-closed，工具不注册）。
  - `getDownloadDirectiveConsumer?: (projectRoot: string) => TakeDownloadDirectiveFn | undefined`——由 Interface 从既有 `deps.directiveInput` 的窄访问器取得（R3）；返回 `undefined` ⇒ 本会话不注入下载能力（fail-closed）。
- `DesktopDeps` 新增：`createDownloadRuntimeFn?: typeof createDownloadRequestRuntime`（缺省真实 B1 公共工厂）、`downloadAppVersion?: string`；`DesktopDeps.openRoleSessionFn` 镜像类型增加 `requestDownload?`。
- **每会话工厂入参（F11 列全）**：`{ projectRoot, roleId, runtime, appVersion, present, takeDownloadDirective }`：
  - `projectRoot`/`roleId`/`runtime`：`open()` 的会话 target（模型不可指定根/子目录）；
  - `appVersion`：`downloadAppVersion`（main.ts 注入）；
  - `present`：本会话 presenter（§4.4，绑定 `withRequestLifecycle` 与本会话信号）；
  - `takeDownloadDirective`：**同一项目既有 `CustomerDirectiveRuntime`** 的下载审批消费者（B1 Revision 1 冻结）；C1 在 `directive-input.ts` 增加窄访问器取得（**R3：第三项闸门 2 写集增补条件，确认前不实施**，见 §六），不另建第二本指令账本/第二个 runtime。缺该消费者 ⇒ 不注入下载能力（fail-closed）。
- **`dispose()`（R2/F12）**：B1 Revision 1 已提供 `DownloadRequestRuntime.dispose(): Promise<void>`（幂等，中止本运行时在途下载并释放执行槽）。C1 在 `LiveSession` 保存 `downloadRuntime` 引用，会话结束（`disposeEntry`）时 `await entry.downloadRuntime?.dispose()`；`dispose` 失败只记诊断，**不阻断会话释放**；幂等语义使重建/重复 dispose 安全。C1 不新增 Interface 级 dispose。
- `app/preload.cjs` **不改**；`app/main.ts` 只增加 `downloadAppVersion: app.getVersion()` 的接线（窗口作用域通道/approval 开关读取沿用既有接线，不改语义）。

### 3.2 会话能力位（W-1）

- `open()` 中构造 `requestDownload`：
  - `const takeDownloadDirective = this.deps.getDownloadDirectiveConsumer?.(req.projectRoot);`
  - 仅当 `deps.createDownloadRuntime !== undefined && deps.downloadAppVersion !== undefined && deps.customerInput !== undefined && takeDownloadDirective !== undefined` 时创建每会话运行时与能力；否则不注入（`request_download` 工具不存在）。
  - 绑定 `projectRoot`/`roleId`/`runtime`/presenter/信号；**不接受模型提供的根/子目录**。
  - 通过 `openRoleSession({ ..., ...(requestDownload ? { requestDownload } : {}) })` 交给编排 → 运行时核心 → `buildGovernedTools`。
- 对全部非判断会话（项目角色与内置治理角色）注入；判断会话/CLI 不经 `SessionManager.open`，结构上无该工具。P9 未选 ⇒ 无环境变量禁用开关。

### 3.3 W-2：每会话 `governanceJudge` 闭包条件

- 现状 `session.ts:2821`：`governanceModel === "trio" && customerInput !== undefined && deps.createGovernanceJudge !== undefined`。
- 扩为：`governanceModel === "trio" && this.deps.customerInput !== undefined && (customerInput !== undefined || downloadCapable) && this.deps.createGovernanceJudge !== undefined`，其中 `downloadCapable = requestDownload !== undefined`。
- **不改变** `session.ts:2586` 的 `customerInput` 注入判据：项目角色仍无 `request_confirmation`/`request_choice`，`confirmGated` 不变。
- 构造用同一份 `runtimeOptions`/`createAdapter`；失败清空（fail-closed）；`disposeEntry` 已有 `entry.governanceJudge = undefined`。`buildCustomerInputContext` 从活条目/本会话闭包取 `governanceJudge`，下载 presenter 复用同一 ctx（AC-24 W-2）。

## 四、设计候选：下载卡组装、judgeContext 与生命周期（W-3 / W-4 消费侧）

### 4.1 新增 `app/desktop/download-request.ts`（职责与导出）

[设计候选] 纯 Interface 模块，不 import `src/service/**`/`src/provider/**`/`src/common/编排/**`；只读导入 A1 Model 类型、B1 Pipeline 公共类型与 `./i18n.ts` 的 `mainT`。拟导出（C1 内部契约，命名实施时可微调，语义冻结）：

| 导出 | 职责 |
| --- | --- |
| `createRequestDownloadCapability(deps): RequestDownloadFn` | 组合信号、调用每会话 B1 运行时、实现 presenter、按结果投 best-effort 系统行；不生成 `downloadId` |
| `buildDownloadCardRequest(spec): { request, metadata, judgeNotice? }` | 把 B1 提供的已校验事实映射为 `CustomerInputRequest`（confirm + `cardKind:"download"`）与 `CustomerInputMetadata`（含 `judgeContext`） |
| `DownloadApprovalSpec` / `DownloadApprovalOutcome`（C1 消费类型） | 与 B1 冻结的 `present(request, hooks)` 形状对齐（§八） |

- **不做**：URL/DNS/IP/文件名/上限/重定向判定；不读写账本；不自行重试；不打开文件；不把下载内容交给模型；不生成 `downloadId`。

### 4.2 卡片字段（AC-3 / AC-25 桌面侧；F8 收敛）

`request`：

| 字段 | 值 |
| --- | --- |
| `kind` | `"confirm"` |
| `cardKind` | `"download"`（A1 只扩 `GovernanceCardKind`；**不扩** `GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS`） |
| `title` | `mainT("main.download.card.title")` |
| `preview` | 逐行：申请角色、用途、完整 URL（B1 已去凭据）、主机/端口、已解析 IP（前 8 个 + `resolvedIpsTruncated`/`resolvedIpsTotal`）、预期文件名（不展示来源标签）、大小策略（`maxBytes`，卡片阶段未知实际大小）、重定向策略（仅同域；跨域需重新申请）、`mechanical` 摘要（按 A2 冻结三项：`scheme`/`publicHost`/`publicIps`） |
| `detail` | 默认省略（不含内部绝对路径） |
| `flowId` | **仅真实归属**（B1 提供）；`intentId`/`taskId` 走 `metadata`；**合成 `"download"` 不写 `request.flowId`** |

`metadata`：`{ cardKind:"download", roleId, runtime, turnId?, toolCallId?, flowId?, intentId?, taskId?, judgeContext? }`。`roleId`/`runtime` 由会话绑定；模型不能自报。

### 4.3 judgeContext（W-3）与事实失败（F1/F10）

B1 presenter 需提供（**B1 Revision 1 冻结字段名，逐字**）：

| 语义项（B1 字段） | C1 用途 | 缺失/不满足 |
| --- | --- | --- |
| `governanceFacts: GovernanceJudgeFacts` | 原样放入 `metadata.judgeContext.facts` | 停止回报（C1 不自造；B1 用 `buildGovernanceJudgeFacts({flowId})` 构造最小形状） |
| `downloadFacts: DownloadJudgeFacts` | 原样放入 `metadata.judgeContext.download`（AC-5/25 透传） | 停止回报 |
| `attribution: { flowId, intentId?, taskId?, flowIdIsSynthetic }` | `judgeContext.flowId` 用 `attribution.flowId`；**仅 `flowIdIsSynthetic===false` 的真实 `flowId`** 才写 `request.flowId`/`metadata.flowId`；`intentId`/`taskId` 写 `metadata` | `attribution` 必填（B1 合成 `"download"` 时 `flowIdIsSynthetic:true`）；合成值不写 `request.flowId` |
| `toolCallId`/`turnId` | 放入 `judgeContext` 与 `metadata` | 可缺省（不写对应字段）；不伪造 |
| `factsAvailable` | `true` 才设置 `judgeContext` | `false` ⇒ **省略整个 `judgeContext`** + `judgeNotice`，直接客户卡 |

- **`attribution` 输入侧（R4/F10）**：C1 调 `runtime.download(input)` 时在 `DownloadRunInput.attribution` 提供**真实**归属键（若可得）；当前 `SessionOpenRequest`/`LiveSession` 不含 `flowId/intentId/taskId`，A1 `DownloadRequestMetadata` 也只有 signal/roleId/runtime/turnId/toolCallId，因此**默认省略** `attribution`，由 B1 解析/合成 `"download"` + `flowIdIsSynthetic:true`；若 A1 后续可选加 `flowId?/intentId?/taskId?`，C1 原样转发。C1 不猜、不读 flow 文档、不把合成值写入 `request.flowId`/`metadata.flowId`。B1 按 `flowId`→`intentId`→`taskId` 取第一个合法 slug，全缺/非法才合成。

- `judgeContext` **不得携带 `unavailableReason`**：C1 组装时若 B1 提供了该字段，**剥离**并按「事实不可用」处理（省略 judgeContext + `judgeNotice`），保证 W-3。
- `judgeNotice` 通过 `DesktopCustomerInputFn` 的 `ctx` 新增可选字段 `judgeNotice?: string` 传到 `OperatorRequestPayload.judgeNotice`（既有字段）；文案用 A2 冻结 key（本提案按 `main.download.error.factsMissing` 或 A2 专用 notice key 消费，不硬编码）。
- 事实失败路径不调用 judge（无 judgeContext ⇒ `planJudge` 返回 undefined ⇒ 直接 `presentNow`）；`unavailableReason` 防御见 §五。

### 4.4 presenter / 生命周期 / `requestId`（F2）

**B1 冻结形状（B1 Revision 1）**：`present(request, hooks)`，其中 `request` 含 `downloadId`（B1 生成）、`roleId/runtime?/toolCallId?/turnId?/factsAvailable/governanceFacts/downloadFacts/attribution/policy/signal?`；`hooks.onPresented({requestId})` 提供卡片 requestId（主来源；`DownloadApprovalOutcome.requestId` 仅兼容）；C1 返回 B1 冻结的 `DownloadApprovalOutcome`（映射 channel outcome）。C1 **不在返回值重复 `requestId`**。

C1 的 presenter 实现：

1. `buildDownloadCardRequest(spec)` 得到 `request`/`metadata`/`judgeNotice`。
2. 用 `session.ts::requestIdFor(projectRoot, roleId, request, metadata)` 计算 `requestId`（仅卡片路径；`downloadId` 用 B1 给的）。
3. 用一次性函数 `notifyPresented = once(() => hooks.onPresented({ requestId }))`：
   - 客户卡路径：通道 `onPresented` 在推达成功后调用 → `notifyPresented`；
   - judge 路径：`withRequestLifecycle` 结算后按 `operatorId:"judge:"`（含 deny）判定已向 judge 呈现 → `notifyPresented`；
   - 未呈现（aborted/unavailable/notPresented）⇒ 不调用（不伪造 presented）。
4. 调用 `withRequestLifecycle(projectRoot, roleId, request, metadata, raw = (r,ctx,meta)=>this.deps.customerInput!(r,ctx,meta), buildContext = buildCustomerInputContext, requestId, { signal, ...(judgeNotice?{judgeNotice}:{}), onPresented: notifyPresented })`：
   - **原始通道必须是窗口级 `this.deps.customerInput`**（不是内置角色 per-session 包装 `customerInput`，避免双生命周期）；
   - 为承载 `hooks.onPresented`，`withRequestLifecycle` 的 lifecycle 可选参数增加 `onPresented?: () => void`（C1 本地加法，其他调用方不传 ⇒ 零行为变化）：客户路径在既有 `ctx.onPresented`（presenter 推达成功）之后触发；judge 路径在 `markPresented("judge")` 完成后触发；两路径都只触发一次（C1 侧用一次性包装）。`notifyPresented` 再调用 B1 的 `hooks.onPresented({requestId})`；
   - 生命周期只在 B1 调 presenter 时进入；**预授权路径 B1 不调 presenter ⇒ 零 `request.*`、零客户卡**；
   - `request.created`（`cardKind:"download"`）→ `request.presented`（customer|judge）→ `request.resolved`（`by:customer|judge`）沿用既有实现；`request.notified` 沿用既有默认。
5. 把 channel outcome 按 B1 冻结映射为 `DownloadApprovalOutcome`（`answered{confirmed:true}`→approved；`declined`→declined + reason；`unavailable`→unavailable）；`download-aborted` 由 B1 映射稳定错误码，C1 不自造。
6. **归属修正（下载卡限定）**：`session.ts:4272-4277` 现只在 `answered` 时认定 judge；下载卡 judge **deny** 会落成 `by:"customer"` 且无 `presented`。C1 增加 `judgeOrigin = operatorId?.startsWith("judge:")` 与 `downloadJudge = request.cardKind==="download" && judgeOrigin`；用 `resolvedByJudge = judged || downloadJudge` 三处（presented 判定、`by`、notify 文案）。其他 cardKind 的 `judged` 表达式与行为不变（`resolvedByJudge===judged`）。
7. 信号：`AbortSignal.any([metadata.signal, interactionState.turn.signal, interactionState.lifetime.signal].filter(...))`；窗口关闭经既有 `customerChannel.rejectAllPending`（`main.ts:649`）+ `stopSession(null)` → `disposeEntry` 的 `interactionState.lifetime.abort()`/`turn.abort()`（`session.ts:1632-1633`）fail-closed；同时 `disposeEntry` **`await entry.downloadRuntime?.dispose()`**（B1 Revision 1 幂等 dispose，中止在途并释放槽；失败只记诊断）。C1 不新增窗口级 signal/不新增 Interface dispose。

### 4.5 judge 结果行与可见回执（F7/F8）

- `customer-input.ts::judgeResultSummary` 增加 `cardKind==="download"` 分支，返回 **A2 复用 key `ui.judge.mode.approval`**（审核 F8 已确认接受复用；若 A2 另给等价 key，以冻结为准），避免落入「确认写入 0 个路径」的写卡文案。
- 执行结果系统行（best-effort，经既有 `emitDeliveryNote`）：
  - 成功：A2 `main.download.notice.completed`（参数按 A2 冻结；**不含 final URL**——final URL 仅在工具成功回执中，审核 F8）；
  - **G1 A 提示（F7）**：成功后追加 `.gitignore` 提示——A2 新增专用 key（如 `main.download.notice.gitignoreHint`）或并入 `notice.completed` 文案；C1 只消费，**不得硬编码中文**；提示仅在成功路径（含预授权成功），失败不提示；
  - 失败：A2 `main.download.notice.failed` + `main.download.error.<code>`；客户系统行只显示 reason+code（action/owner 留在工具回执，按 A2 口径）；
  - 预授权：`main.download.notice.directiveAllowed`；
  - 投递失败只记诊断，**绝不翻转已完成的下载结果**；缺字段不伪造（缺则省略该段）。

## 五、设计候选：manual / unavailableReason / 预授权排除（`customer-input.ts`）

1. **W-4 `planJudge` 透传**：在 `planJudge` 构造 `GovernanceJudgeRequest` 处增加「仅 `cardKind==="download"` 且 `judgeContext.download` 存在」时 `request.download = judgeContext.download`（原样引用，不重算/不裁剪）；其他卡种不携带。类型来自 A1 加法。
2. **`settleJudgeOutcome` 下载 manual 分支（AC-6）**：在 `aborted` 早退之后、`switch-off` 之前插入：
   - `if (plan.cardKind === "download") { escalateJudgeOutcomeToCustomer(entry, plan.group, outcome, "unverifiable"); return; }`
   - 覆盖 `timeout`/`parse-failed`/`not-recommended`/`group-mismatch`/`row-failed`/`switch-off`/`ledger-unavailable`/`download-facts-missing` 等**全部 manual**；不自动拒绝/不自动退回，原卡 + `judgeNotice` 转客户。
   - **deny 语义不变**：approval 组 deny 仍按既有 approval 语义 `declined` 退回（不弹客户卡）；`aborted` 仍按既有取消语义。
   - 指纹去重沿用：重复 deny 仍走既有 `markAutoRejected` → 升级客户；下载 manual 分支在 `markAutoRejected` 之前，不占自动拒绝名额。
3. **`presentEntryNow` 的 `unavailableReason` 防御（AC-28）**：在 `customer-input.ts:1841` 分支入口增加下载卡特判：`cardKind==="download"` ⇒ 构造 `manualOutcome(plan, "ledger-unavailable", unavailableReason)` 并 `escalateJudgeOutcomeToCustomer(..., "unverifiable")`，**不 `markAutoRejected`、不 `settleActive(declined)`**；其他 cardKind 原逻辑逐字不变。
4. **`preauthorizeWrite` 显式排除（安全）**：在 `preauthorizeWrite` 入口（`:2015`）增加 `if (req.cardKind === "download") return undefined;`——下载卡虽为 `kind:"confirm"`，但绝不能被边界写入预授权误判为 `accept`/`reject`（即使卡面/元数据被注入 `paths`）。下载审批只走下载能力与判断/客户通道。
5. **`judgeNotice` 透传**：`DesktopCustomerInputFn` 的 `ctx` 增加可选 `judgeNotice`；`customerInput` 构造 `payload` 时复制（非空才写）；`session.ts::buildCustomerInputContext` 的 extras 与 `withRequestLifecycle` 的 buildContext extras 同步增加可选 `judgeNotice`。其他调用方不传 ⇒ 零行为变化。
6. **F18 `requester` 回归**：`RejectionOwner:"requester"` 由 A1/B1 加法；C1 在 `test/桌面应用/rejection-copy.test.ts` 增加 requester 的显示/回归覆盖（该文件在边界单文件条目内，写集合法）。
7. **不动**：`isApplicationDecisionReservedForCustomer`、`tryAutoSelectDecision`、`evaluateDecisionCardRequest`、`activeByProject`/`waiting`/`cancel`/`rejectAllPending` 既有语义；下载卡只是普通 confirm 卡进入既有队列与关窗 fail-closed。

## 六、设计候选：Interface / main / 面板数据（F3/F13）

- **`app/desktop/interface.ts`**：`DesktopDeps.createDownloadRuntimeFn?`、`downloadAppVersion?`；`SessionManager` 构造透传两者并新增 `getDownloadDirectiveConsumer: (root) => deps.directiveInput?.downloadDirectiveConsumer(root)?.takeDownloadDirective`（R3 窄访问器；未确认前该 accessor 不存在 ⇒ 下载能力 fail-closed、工具不注册）；`openRoleSessionFn` 镜像类型增加 `requestDownload?`。无每项目缓存/`getDownloadRuntime`/`disposeDownloadRequests`。**不改 `sendSession`**。
- **`app/main.ts`**：`createDesktopInterface({ ..., downloadAppVersion: app.getVersion() })`；窗口作用域通道/approval 组开关读取沿用既有接线（`:595-647`/`:625`），不改暂停语义；关窗 fail-closed 由既有 `rejectAllPending` + session dispose 信号承担。
- **F3 面板数据（AC-14/AC-27，形状 A 已冻结）**：B1 Revision 1 的 `CustomerDirectiveRuntime.list()` 做 epoch-aware 投影——早于 `enabledAt` 的 domain 视图 `consumer:"none"`、新 domain 保持 `"download"`；C1 把视图原样放入 `directive:list`/`directive:state` 载荷（`directive-input.ts:721` 的 `list()` 已返回 `result.approval`/`result.decision`，`:727-735` 原样透传），**F3 不需要改 `directive-input.ts`**。C1 不比较时间、不读 `download-consumer.json`、不判 epoch；`downloadStartsNow`（G8 B）不消费、A2 已删除该 key。
- **R3/F13 `takeDownloadDirective` 访问器——第三项闸门 2 写集增补条件（选定方案①，未确认不实施）**：B1 Revision 1 的 `DownloadRequestOptions` 在工厂创建时绑定 `takeDownloadDirective`；`DirectiveInputController`（`directive-input.ts:142-154`）当前未暴露 `CustomerDirectiveRuntime`/该方法，`runtimeFor` 是内部闭包（`:445`）、控制器由 `app/main.ts:558` 创建。C1 选定**修改 `app/desktop/directive-input.ts`** 的最小方案（不是 F3 的需求）：
  - 在 `DirectiveInputController` 接口增加一个**只读窄访问器**：`downloadDirectiveConsumer(projectRoot: string): { takeDownloadDirective: TakeDownloadDirectiveFn } | undefined`（或等价最小签名）；
  - 实现直接基于既有 `runtimeFor(projectRoot)` 返回 `{ takeDownloadDirective: runtime.takeDownloadDirective.bind(runtime) }`——**复用同一 `CustomerDirectiveRuntime` 与同一账本**，不新建第二份指令运行时/账本，不复制消费/once/冲突逻辑，不新增 IPC/渲染面；
  - 该文件位于 `app/desktop/` 目录授权内、**不在团队计划 §4.3 C1 枚举写集**，且 **F4/F5 的 addendum 不覆盖该文件**；因此列为**第三项闸门 2 写集增补条件**：须由统筹/沟通另行记录（或确认等价计划内解释）后才能实施；**未确认前 C1 不实施预授权接线**。若统筹选择不改该文件的等价接线（例如 B1 提供每调用 resolver），C1 按新形状适配并废止本项，不产生第二份指令运行时/账本。
- **`app/desktop/i18n.ts`**：预期**不改**；只消费 `mainT` 与 A2 key。若必须改 translator/`DesktopTexts` 形状，属条件改动，完成报告列明；不得新增 allowlist。
- **`app/preload.cjs`**：**预期不改**；下载卡/结果行复用既有 `session:operator-request`/`session:operator-response`/`session:operator-judge`。若确需新 IPC 类别 ⇒ 停止回报。

## 七、精确写集（C1）

| 路径 | 动作 | 内容 |
| --- | --- | --- |
| `app/desktop/download-request.ts` | **新增** | 能力包装、卡片组装、judgeContext 映射（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable` 原样）、presenter 实现、信号组合、best-effort 回执；不含判定/IO；不生成 `downloadId` |
| `app/desktop/session.ts` | 改 | `SessionManagerDeps`（`createDownloadRuntime`/`downloadAppVersion`/`getDownloadDirectiveConsumer`/`openRoleSession.requestDownload?`）；W-2 条件；每会话能力构造与注入；`LiveSession.downloadRuntime` 与 `disposeEntry` 的 `await dispose()`；`withRequestLifecycle` 的下载归属修正、`judgeNotice` extras 与 lifecycle `onPresented` 回调 |
| `app/desktop/customer-input.ts` | 改 | W-4 透传；下载 manual 分支；`unavailableReason` 防御；`preauthorizeWrite` 排除；`ctx.judgeNotice` 透传；`judgeResultSummary` download 分支 |
| `app/desktop/interface.ts` | 改 | `DesktopDeps` 两字段、SessionManager 透传（`createDownloadRuntime`/`downloadAppVersion`/`getDownloadDirectiveConsumer`）、`openRoleSessionFn` 镜像类型；无每项目缓存/dispose |
| `app/main.ts` | 改 | `downloadAppVersion: app.getVersion()`；不改通道/开关/暂停语义 |
| `app/desktop/directive-input.ts` | **条件（第三项闸门 2 写集增补；未确认不实施）** | R3 最小改动：`DirectiveInputController` 增加只读窄访问器 `downloadDirectiveConsumer(projectRoot)`，基于既有 `runtimeFor` 返回同一 runtime 的 `takeDownloadDirective`；不复制指令逻辑、不新建第二运行时/账本；F3 不需要改本文件 |
| `app/desktop/i18n.ts` | **条件** | 预期不改；仅当消费 A2 key 需要最小适配时改 |
| `app/preload.cjs` | **预期不改** | 需新 IPC 类别 ⇒ 停止回报 |
| `test/桌面应用/download-request.test.ts` | **新增（B-4）** | 能力注入/卡片字段/生命周期/项目根/并发（一项目一卡）/中止/审计归属/预授权排除/G1 提示 |
| `test/桌面应用/download-decision.test.ts` | **新增（B-4）** | W-2/W-4、项目角色 judge 可达、manual 转客户卡、unavailableReason 防御、开关关/single、指纹去重、仍无 `request_confirmation` |

**按需既有精确测试（F14：均在边界单文件条目内）**：

| 文件 | 预期受影响原因 | 处理 |
| --- | --- | --- |
| `test/桌面应用/session.test.ts` | `SessionManagerDeps`/`openRoleSession` 入参与 W-2 闭包条件 | 仅类型/捕获断言需要时更新；不弱化 |
| `test/桌面应用/interface.test.ts` | `DesktopDeps` 新字段、manager deps、`openRoleSessionFn` 类型 | 仅类型/装配断言 |
| `test/桌面应用/decision-service.test.ts` | PR #58 回归（C1 改 customer-input） | 预期零改动，必须跑 |
| `test/桌面应用/operator-channel.test.ts` | 客户/判断通道计数与开关 | 预期零改动，必须跑 |
| `test/桌面应用/rejection-copy.test.ts` | F18 `requester` 显示/回归 | 增加 requester 用例 |
| `test/桌面应用/pending-card-restart.test.ts` | 新 cardKind 读者/重启恢复 | 预期零改动，必须跑 |
| `test/桌面应用/directive-input.test.ts` | PR #57 解释器 + F3 面板视图透传 | 预期零改动；若 F13 增补则补透传断言 |
| `test/桌面应用/run-change-entry.test.ts` | PR #58 回归 | 预期零改动，必须跑 |
| `test/桌面应用/version-decision.test.ts` | PR #58 回归 | 预期零改动，必须跑 |
| `test/桌面应用/acceptance-return-card.test.ts` | `withRequestLifecycle` 签名/extras | 预期零改动，必须跑 |
| `test/桌面应用/run-pin.test.ts` | `withRequestLifecycle` 归属 | 预期零改动，必须跑 |

**不写**：`app/renderer/**`、`src/**`（A1/B1/A2 属主）、`test/桌面UI/**`、`test/测试/**`、`test/编排/**`、`test/runtime-core/**`、`test/项目管理/**`、`package.json`/锁/`tsconfig*`/`vite.config.ts`/`src/index.ts`/发布配方、`docs/scheduling|acceptance|communication/`、`角色卡/**` 边界/角色卡/根 changelog、其他角色 `docs/`。**不新建第三个 `test/桌面应用/` 文件**；不新建 `test/桌面应用/e2e/` 脚本。

## 八、与 A1 / B1 / A2 的交接契约与停止条件

### 8.1 A1（Model / 工具）

- `RequestDownloadFn` 必须把每次调用的 `{signal?, roleId?, runtime?, toolCallId?, turnId?}`（或等价元数据）传给能力；`DownloadRequestInput/Result/DownloadErrorCode/DownloadJudgeFacts` 为唯一类型来源。C1 只 import type/值，不复制定义。
- `GovernedToolsOptions.requestDownload?` 注入才注册；`GovernanceJudgeContext.download?`/`GovernanceJudgeRequest.download?` 可选加法；`GovernanceCardKind` 增 `"download"`、`GOVERNANCE_CARD_GROUP` 增 `"download":"approval"`；`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` 不变。
- `DownloadRequestMetadata` 可选增加 `flowId?/intentId?/taskId?`（审核 F10：非必须；若加，C1 可作补充来源，但仍以 B1 presenter 归属键为准）。
- 工具层负责入参形状校验与结果文案（AC-2/AC-15）；C1 不重复协议/IP 判定。

### 8.2 B1（Pipeline / 指令 / judge；B1 Revision 1 已冻结，逐字同形）

C1 消费的 **presenter/运行时需求**（字段名与 B1 Revision 1 逐字一致）：

1. **每会话运行时工厂** `createDownloadRequestRuntime({ projectRoot, roleId, runtime, appVersion, present, takeDownloadDirective })`；并发 ≤2 由 B1 模块级 Map 保证；`downloadId` 由 B1 生成（C1 只消费）。
2. **`present(request, hooks)`**：`request` 含 `downloadId`、`roleId/runtime?/toolCallId?/turnId?`、`factsAvailable`、`governanceFacts`、`downloadFacts`、`attribution`（`flowId/intentId?/taskId?/flowIdIsSynthetic`）、`policy`、`signal?`；`hooks.onPresented({requestId})` 由 C1 在卡片实际呈现（客户或 judge）后调用一次；C1 返回 B1 冻结的 `DownloadApprovalOutcome`（channel answered confirmed → approved；declined → declined；unavailable → unavailable）。C1 不自造 `GovernanceJudgeFacts`（B1 用 `buildGovernanceJudgeFacts({flowId})` 构造）。
3. B1 在卡片路径的 `downloads.jsonl` 事件中使用自己生成的 `downloadId` + `onPresented` 得到的 `requestId`；预授权路径只用 `downloadId`、无 `requestId`、**不写任何 `request.*`**。
4. B1 负责 `requiredArtifactPaths("download") = {paths:[],missing:false}`、download rubric（含「不得访问 URL」）、`download-facts-missing` 入「无法核对」集合、错误码/owner、G8 epoch、`.ans` 读写、`consumerOf`/`list()` 的 epoch-aware 视图（形状 A）；C1 不复制。
5. B1 的 `DownloadRequestRuntime.dispose(): Promise<void>` 幂等（中止本运行时在途下载、释放执行槽）；C1 在 `disposeEntry` `await` 调用（失败只诊断，不阻断会话释放）。
6. `takeDownloadDirective` 由 C1 从**同一项目既有 `CustomerDirectiveRuntime`** 取得：`directive-input.ts` 增加只读窄访问器 `downloadDirectiveConsumer(projectRoot)`，Interface 经 `getDownloadDirectiveConsumer` 传给 SessionManager（**R3 第三项闸门 2 写集增补；确认前不实施**）；不新建第二本账本/runtime。若 B1 改为每调用 resolver，C1 按新形状适配并废止窄访问器。

### 8.3 A2（i18n；F7/F8 对齐）

C1 消费（缺失即停止回报，不能硬编码、不能加 allowlist）：

- `main.download.card.title`；`main.download.card.role/purpose/url/host/filename/sizePolicy/redirectPolicy`；`main.download.card.mechanical.scheme/publicHost/publicIps`（**三项**，审核 F8）；
- IP 列表/截断展示所需 key（`resolvedIps` 前 8、`resolvedIpsTotal`、`resolvedIpsTruncated` 标记）——方案 §8.3 建议 key 表未单列，A2 需在冻结 key 集合中提供等价 key/参数；缺失即停止；
- `main.download.notice.completed/failed/directiveAllowed`；**G1 A 的 `.gitignore` 提示 key（新增专用 key 或并入 `notice.completed`）**；`main.download.error.factsMissing`（或专用 notice key）；
- judge 结果行标签：**复用 `ui.judge.mode.approval`**（审核 F8 已接受；若 A2 另给等价 key 以冻结为准）；
- 面板 consumer key：A2 冻结的 `ui.directive.panel.consumer.download*`（C2 消费；C1 只透传数据，不硬编码）；
- 既有 `main.customerInput.judgeNotDelegated`（升级 notice 复用）。

### 8.4 停止回报条件（任一命中即停止，不写代码）

1. B1 冻结接口要求 C1 做 URL/协议/DNS/IP/文件名/上限判定，或要求 C1 读 `.ans/**`、指令账本、`downloads.jsonl`、消费/过滤 domain 指令/epoch。
2. B1 Revision 1 与本提案 §八.2 不同形（presenter 形状、`downloadId` 归属、每会话运行时、`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable` 字段名）且无法按冻结形状适配。
3. A1 `RequestDownloadFn` 不提供 signal/toolCallId/turnId（无法构建生命周期/judgeContext）。
4. A2 Revision 2 后仍缺 §8.3 任一必需 key（尤其 IP 截断展示、G1 `.gitignore` 提示、事实失败 notice）。
5. 需要第三个 `test/桌面应用/` 文件、`test/桌面应用/e2e/` 脚本、`app/preload.cjs` 新 IPC 类别。
6. 需要写 `app/renderer/**`、其他角色路径、`src/**` 或边界/契约文件。
7. 需要打开项目角色 `customerInput`（`request_confirmation`）或修改 `TRIO_CARD_KINDS`/`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` 才能发下载卡。
8. 需要改变 denial/其他卡种 manual 语义，或无法在不改变其他卡种行为的前提下完成下载归属修正。
9. `app/desktop/directive-input.ts` 的**第三项闸门 2 写集增补**未获统筹/沟通确认，而预授权接线又必需（R3/F13）；确认前不得实施该接线。
10. 方案 P1.1/G1–G8/验收 V1 与本提案出现实质冲突（含 G7/G8 口径）。

## 九、AC 映射（C1 视角，不替代 V1）

| AC | C1 覆盖 / 证据 | 依赖与交接 |
| --- | --- | --- |
| AC-1 | 桌面会话（项目角色/内置治理角色）`openRoleSession` 入参含 `requestDownload`；未注入 runtime/缺 appVersion/无窗口通道 ⇒ 不含；测试断言捕获入参 | A1 工具注册；D1 CLI/判断会话 |
| AC-3 | 卡片字段/`cardKind:"download"`/`request.created`/`presented`（customer/judge）；`download-request.test.ts` + 账本样例；截图 D2 | B1 展示事实；C2 渲染；A2 三项 mechanical |
| AC-4 | 项目角色 judge 调用恰一次、`presented.to:"judge"`；approve 执行/deny 拒绝/manual 转卡；开关关/single/unavailableReason ⇒ 客户卡；仍无 `request_confirmation`；`download-decision.test.ts`；截图 D2 | A1/B1 冻结；D1/D2 |
| AC-5（桌面侧） | `judgeContext.download`→`request.download` 原样透传；`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable` 由 B1 提供、C1 原样映射（不自造）；facts/download 不被 C1 截断；≤2 KiB 由 B1/A1 | A1/B1；D1 |
| AC-6 | 下载 manual（含 `download-facts-missing`/timeout/parse/row-failed）原卡 + `judgeNotice` 转客户，不 auto-rework；同指纹重复只自动拒绝一次；`download-decision.test.ts`；截图 D2 | B1 code 登记；D1/D2 |
| AC-13 | 能力绑定会话 `projectRoot`；模型不可传根/子目录；文件系统边界由 B1 | B1/D1 |
| AC-14（桌面侧） | C1 不读/不匹配 domain 指令；面板载荷原样透传 B1 epoch-aware 视图（旧 domain `consumer:"none"`、新 domain `"download"`）；预授权路径零 `request.*`；面板「下载」由 B1/C2/A2 | B1 epoch/consumerOf；C2/A2 |
| AC-16 | 一项目一卡：下载卡进入既有 `activeByProject`/`waiting` 队列；执行并发 ≤2 由 B1 模块级 Map（每会话运行时共享）；并发同名不覆盖由 B1；`download-request.test.ts` | B1/D1 |
| AC-17 | 卡片路径 `request.created/presented/resolved`（`cardKind`、`by:customer|judge`）+ B1 自己用 `downloadId`/`onPresented` 的 `requestId` 写 `downloads.jsonl`；预授权路径零 `request.*`；不记凭据 | B1 ledger；D1 |
| AC-21 | 下载 judge approve/deny 均 `by:"judge"`（含 deny 归属修正）、presented.to judge；客户 `by:"customer"`；预授权只 `downloads.jsonl` `by:"directive"`；系统行不写成客户点击 | B1/C2；D1/D2 |
| AC-22 | 下载卡不占 shell 卡槽（独立通道）、不进指令面板；同项目 decision/confirm 卡待答时下载卡排队；关窗/回合中止 ⇒ 卡取消、不执行（既有 `rejectAllPending` + dispose 信号）；截图 D2 | C2 布局；D1/D2 |
| AC-24（W-1/2/3/4/8） | 能力注入、项目角色 judge 闭包可达、下载卡 judgeContext（B1 完整上下文原样映射）、`planJudge` 透传、结构测试（项目角色仍无 `customerInput`）；`download-decision.test.ts` | W-5/W-6/W-7 属 A1/B1；D1 |
| AC-25 | `request.download` 原样透传；卡片显示 IP 截断标记与 mechanical 三项摘要；不截断校验字段（B1）；`download-request.test.ts` + 截图 | A1/B1；D2 |
| AC-27（桌面侧） | C1 不实现 epoch、不读/过滤旧指令；面板载荷原样携带 B1 epoch-aware 视图（旧 domain `none`）；预授权路径零 `request.*`；A 子句由 B1/C2/A2 验 | B1/C2/A2；D1/D2 |
| AC-28 | 事实失败 ⇒ 省略 `judgeContext` + `judgeNotice` 直接客户卡；通道收到 `unavailableReason` 的下载卡 ⇒ 转客户卡、不 auto-rework；两条路径均不消耗预授权（B1 在 presenter 前不消费 once）；`download-request.test.ts`/`download-decision.test.ts` | B1 顺序；D1/D2 |
| AC-19（桌面侧） | 新模块/改动无硬编码中文，全部 `mainT` + A2 key；`i18n-guard.test.ts` 零违规、allowlist 无新增 | A2；C2 |
| AC-23（结构） | 下载卡不经 `request_confirmation`；`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` 未改（A1 结构测试）；C1 仅经 `request_download` 能力路径发卡 | A1/D1 |

## 十、测试计划（C1 完成时；P1 不运行）

### 10.1 新增测试

**`test/桌面应用/download-request.test.ts`**：

1. 纯函数：卡片字段映射（title/preview 各行/`cardKind:"download"`/confirm/URL/host/IP+truncated+total/mechanical 三项/filename/maxBytes/redirect）；无内部绝对路径、无来源标签。
2. 纯函数：`judgeContext` 映射——B1 的 `governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable` 原样映射；`flowIdIsSynthetic:true` 时不写 `request.flowId`/`metadata.flowId`，真实 `flowId` 才写；不设置 `unavailableReason`；`factsAvailable:false` ⇒ 省略 judgeContext + `judgeNotice`。
3. SessionManager 集成：项目角色与内置治理角色均捕获 `openRoleSession.requestDownload`；无 `createDownloadRuntime`/无 appVersion/无窗口通道/无 `takeDownloadDirective` 访问器 ⇒ 不注入；项目角色 `customerInput` 仍 undefined；捕获 `LiveSession.downloadRuntime`，会话 dispose 时 `dispose()` 恰一次（幂等、失败不阻断释放）。
4. 卡片路径：B1 stub 以 `present(request, hooks)` 调 presenter → 真 channel 客户批准；断言 `request.created/presented/resolved`（cardKind/by）、presenter payload、`hooks.onPresented({requestId})` 恰一次、B1 stub 的 `downloadId` 被消费、结果按 B1 冻结形状返回。
5. 预授权路径：B1 stub 不调 presenter 直接返回 directive 结果；断言零客户卡、零 `request.*`、无 `requestId`（B1 侧 `downloadId` 由 stub 生成）。
6. judge approve/deny：approve 执行、presented.to judge、by judge；deny 不弹客户卡、by judge（归属修正）、presented.to judge、`onPresented` 在 judge 呈现后调用一次。
7. 中止/关窗：轮次中止与 `rejectAllPending` ⇒ 卡取消、B1 执行零次、结果 `download-aborted`（B1 stub 映射）、`request.orphaned` 按既有；组合信号传入 B1；会话 dispose 调 `runtime.dispose()`。
8. 一项目一卡：先挂一张 decision/confirm 卡，下载卡 `onQueued` 排队、不呈现；前者结算后下载卡呈现。
9. `preauthorizeWrite` 排除：下载卡即使带 `paths`/`writeBoundary` 也不被写预授权 `accept`/`reject`。
10. G1 A 提示（F7）：成功结果系统行包含 `.gitignore` 提示（A2 key 文案）；失败行不含；不硬编码。
11. 项目根绑定：能力只使用会话 `projectRoot`；模型不可覆盖。
12. `attribution` 输入侧（R4）：stub 捕获 `DownloadRunInput.attribution`——有真实值时原样传入；无值时省略（B1 stub 合成 `"download"`），合成值不出现在 `request.flowId`。

**`test/桌面应用/download-decision.test.ts`**：

1. 项目角色（非 builtIn）+ trio + approval 开关开 + facts 完整：`createGovernanceJudge` 工厂被调用、judge fn 恰一次、`plan.request.cardKind==="download"`、`request.download` 深等于 ctx、`presented.to:"judge"`、approve 执行。
2. 下载 manual（`download-facts-missing`、timeout、parse-failed、row-failed、switch-off 至少各一）⇒ 原卡 + `judgeNotice` 转客户；judge 之后 `onAutoRework` 不触发；客户作答后正常结算。
3. 下载 judge deny：拒绝不弹客户卡；同指纹第二次 deny ⇒ 升级客户（不重复自动拒绝）。
4. `unavailableReason` 防御：channel 级构造带 `judgeContext.unavailableReason` 的下载卡 ⇒ 客户卡 + notice、judge 不调用、不 auto-rework。
5. 开关关（approval 组 false）⇒ 客户卡、judge 零调用；single ⇒ 客户卡、judge 零调用；无 `createGovernanceJudge` ⇒ 客户卡。
6. 结构：捕获 `openRoleSession` 入参 `customerInput === undefined`（项目角色仍无 `request_confirmation`）；`createGovernanceJudge` 仅在 `deps.customerInput` 存在时构造。
7. PR #58 回归：跑既有 `decision-service.test.ts`/`run-change-entry.test.ts`/`version-decision.test.ts`，证明 `isApplicationDecisionReservedForCustomer`/`tryAutoSelectDecision` 零变化。

### 10.2 精确命令与基线对照

1. `node --test test/桌面应用/download-request.test.ts test/桌面应用/download-decision.test.ts`。
2. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` —— 对照 B0 v2 **539/539**（55 文件）；本次只允许 +新增测试；**新增确定性失败=0、新增 skip=0**；任何新增失败停止并定位。
3. `node --test test/项目管理/shared/i18n-guard.test.ts` —— AC-19 桌面侧；allowlist 无新增（若因新模块失败，改用 key，不加 allowlist）。
4. `npm run typecheck` —— exit 0；C1 不改 renderer，`typecheck:renderer`/`build:renderer` 由 C2/D1 负责。
5. 条件追加 §七「按需既有精确测试」逐条跑并在完成报告写理由；不为了保绿改断言/加 skip。
6. 证据：每个改动/新增文件 `git hash-object` + `sha256sum`；`git status --short`、`git diff --name-only`、`git diff --cached --name-only`（暂存空）落在 §七 写集；原始命令输出/退出码/计数；完成报告状态 `implemented-unverified`。T3 全量回归与真实截图由 D1/D2/E1/E2 负责。

## 十一、基线披露、兼容与状态

- **基线**：HEAD `c2f1630`；B0 v2 已认证（T3 3665/3638/9/18、桌面套件 539/539、新增确定性失败 0、新增 skip 0）。
- **PR #57 兼容**：解释器工厂/方法原样保留；C1 只在 `SessionManagerDeps`/`open()`/`withRequestLifecycle` 加法，不触碰 `interpretDirective`/`createDirectiveInterpreter`/`directive-input.ts` 解释预填语义。
- **PR #58 兼容**：`isApplicationDecisionReservedForCustomer`/`tryAutoSelectDecision` 不改；下载 cardKind 为 confirm，`planJudge` 对 decision 的早退（`:1199`）与「替决策」代选路径均不涉及下载；既有测试回归。
- **锚点漂移**：见 §1.3；实施以符号/文本锚点为准。
- **状态如实**：本文件为 `proposal-only`；未写产品/测试代码、未运行实施测试、未改 boundary/changelog、未提交/推送。P1 复审通过、A1/B1/A2 冻结、H1 完成、V1 经沟通确认后才进入 C1。

## 十二、风险、替代方案、必要 vs 可选

### 12.1 主要风险与控制

| 风险 | 控制 |
| --- | --- |
| B1 presenter 契约不满足（事实/归属/factsAvailable/形状） | §八停止条件；B1 Revision 1 已冻结完整上下文（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`）；C1 不读账本、不自造 |
| 每会话运行时并发 >2 | B1 模块级按项目根 Map 保证；C1 不自建计数/缓存 |
| 会话结束在途下载未中止 | `disposeEntry` `await runtime.dispose()`（B1 幂等）+ 既有 signal abort；失败只诊断 |
| `downloadId` 归属冲突 | 唯一来源 B1；C1 只消费；presenter/hook 同形 |
| 项目角色 judge 不可达（F1 退化） | W-2 条件扩展 + 调用计数/`presented.to:"judge"`；AC-24 |
| manual 误 auto-rework（F12/AC-6/28） | 下载 manual 专用分支（全部 manual）+ `unavailableReason` 防御 |
| 写预授权误吞下载卡 | `preauthorizeWrite` 显式排除 + 带 `paths` 负例测试 |
| judge deny 归属写成客户 | `resolvedByJudge` 下载限定修正 + 账本断言 |
| 双生命周期/双通道 | presenter 只用窗口级原始 `deps.customerInput` + 自己的 `withRequestLifecycle` |
| G8 旧指令面板误标「下载」 | 消费 B1 epoch-aware 视图（旧 domain `consumer:"none"`/新 `"download"`）；C1 不判 epoch、不改 `directive-input.ts`（F3） |
| G1 提示缺失 | A2 key/并入 notice.completed；C1 成功路径消费；不硬编码 |
| i18n 硬编码/缺 key | 全部 `mainT` + A2 冻结 key；guard 零违规；缺 key 停止 |
| 闸门 2 写集增补未确认 | `directive-input.ts` 第三项条件标记；确认前不实施预授权接线 |
| 误改 PR #57/#58 | 仅加法/限定分支；既有测试回归 |

### 12.2 考虑过的替代方案（不采用）

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 给项目角色注入 `customerInput`（用 `request_confirmation` 发下载卡） | 否决 | 打开治理确认制/第二发卡路径，违反 AC-23 与 W-2 边界 |
| B. 让桌面计算 URL/IP/文件名/上限事实 | 否决 | Interface 不得做策略判定/网络/DNS；复制 B1 Service 规则 |
| C. 每项目缓存运行时（首版方案） | 否决 | 与 B1 工厂的 `roleId/runtime/present` 绑定冲突（审核 F2）；改为每会话运行时，B1 模块级 Map 保证并发 |
| D. C1 生成 `downloadId`（首版方案） | 否决 | 与 B1 `downloads.jsonl` 属主冲突（审核 F2）；改为 B1 生成、C1 消费 |
| E. 仅把 `download-facts-missing` 加入 `UNVERIFIABLE_REJECTION_CODES` | 否决 | 覆盖不了 timeout/parse/row-failed/switch-off；AC-6/28 不成立 |
| F. 新 IPC 类别/新卡容器 | 否决 | 复用既有 confirm 卡与 `session:operator-*`；`preload.cjs` 不改 |
| G. 下载判断跟随 `shell:judge-pause` | 否决 | G7 A：暂停 shell-only |
| H. C1 读 epoch/指令账本自行过滤旧指令 | 否决 | G8 A 属 B1；C1 复制指令平面即第二套账本/消费者 |

### 12.3 必要 vs 可选

- **必要**：W-2 闭包扩展（不打开 `customerInput`）；W-3 卡片/事实失败（B1 完整上下文原样映射）；W-4 透传；下载 manual 专用分支 + `unavailableReason` 防御；`preauthorizeWrite` 排除；下载归属修正；judge 结果行标签；每会话运行时 + `dispose()`；关窗/中止信号；G1 提示；best-effort 回执；两个新测试文件；requester 回归。
- **可选/不实施**：P1–P9 全部不选；不做下载队列面板；不做第二套卡片队列/判断器/指令账本/写门禁；不改 shell 闸/写守卫/CLI/浏览器下载/`package.json`/构建/发布。
- **G7 A**：`shell:judge-pause` 不覆盖下载判断；C1 不读暂停。
- **G8 A**：C1 不实现/不读取 epoch，不匹配/消费 domain 指令；消费 B1 epoch-aware 视图（形状 A）；预授权路径零 `request.*`；面板标注由 B1/C2/A2。
- **第三项闸门 2 写集增补条件（R3）**：`app/desktop/directive-input.ts`（仅 `takeDownloadDirective` 窄访问器；目录内、非边界变更；F4/F5 addendum 不覆盖；确认前不实施预授权接线）。

## 十三、提案自检与停止项

- [x] 只读核对 role-card/boundary/团队计划 P1.1/V1/B0/P1 复审/当前代码；未改任何输入文档。
- [x] 写集均在 Section 1 内（`app/desktop/` 目录、`app/main.ts` 单文件、B-4 两个测试条目）；`directive-input.ts` 作为**第三项**闸门 2 增补条件列出、未实施。
- [x] 未发现需要其他角色路径、`app/renderer/**`、`src/**`、第三个桌面测试文件或 preload 新 IPC 的需求；若实施出现，按 §八停止回报。
- [x] 不改 `customerInput` 注入判据、`tryAutoSelectDecision`/PR #58、解释器/PR #57、shell 闸/写守卫/CLI。
- [x] R2：B1 Revision 1 的 `dispose()` 已接入会话结束 `await`；R3：`directive-input.ts` 第三项增补条件已写明；R4：`downloadFacts`/`attribution` 输入侧已澄清。
- [x] 状态 `proposal-only`；未写产品/测试代码、未运行测试、未 commit/push。
- [ ] 待项目管理 P1 复审 Revision 2；复审通过且 A1/B1/A2（Revision 2）冻结、H1 完成、V1 经 addendum 确认后才进入 C1。

## 十四、修订记录（Revision 1，2026-11-04）

- **触发/范围**：P1 审核 **340 行 / `503aaf34…`** 结论 `needs revision`（F1/F2/F3/F7/F8/F11–F13 阻断）。本修订只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `c2f1630`；`git status --porcelain -- src app test` 为空。
- **修订后定位**：C1 侧 shape 按审核 §3.2 方案 1（推荐）+ §3.3 推荐口径冻结；B1 修订版必须同形（§八.2）。C1 的备选最小 `GovernanceJudgeFacts` 已写入，供 B1 选择方案 2 时同形冻结。

| 审核项 | 处置 | 位置 |
| --- | --- | --- |
| **F1**（阻断） | 首选 B1 presenter 提供 `GovernanceJudgeFacts`（最小 `{governanceModel:"trio", flowId, ledgerErrors:0}`）+ 归属键 + `factsAvailable`；备选 C1 构造最小 facts（仅用 B1 归属键，不读账本/不计算策略），删除「C1 不生成」绝对表述并写明字段来源 | §二.2、§4.3、§八.2 |
| **F2**（阻断） | 改为**每会话运行时**（工厂绑定 `roleId/runtime/present/takeDownloadDirective/appVersion`）；B1 模块级 Map 保证每项目并发 ≤2；`downloadId` 由 B1 生成、C1 消费；presenter 采用 B1 `present(request,hooks)` + `hooks.onPresented({requestId})`，C1 不在返回值重复 requestId | §二.4/5、§3.1、§4.4、§八.2 |
| **F3**（阻断） | 消费 B1 epoch-aware 指令视图：首选 `consumer:"none"`（旧 domain）/`"download"`（新），备选 `downloadApplies?: boolean`；C1 `directive-input.ts::list()` 原样透传至面板载荷；C1 不判 epoch/不读状态文件；`downloadStartsNow` 不消费 | §六、§8.3、§九 AC-14/27 |
| **F4** | B1 写集增补（`governance-judge-verdict.ts`）；C1 无写权，记录依赖 | §八、§十二 |
| **F5** | C2 写集增补（`directive-store.ts`）；C1 无写权，记录依赖 | §八、§九 AC-14/27 |
| **F6** | A1/B1 编译解锁 R1；C1 无写权 | §八 |
| **F7**（阻断） | G1 A `.gitignore` 提示纳入成功回执：A2 新增专用 key 或并入 `notice.completed`；C1 成功路径消费、失败不提示、不硬编码 | §4.5、§8.3、§10.1 #10 |
| **F8** | mechanical 收敛 A2 三项；成功系统行去掉 final URL（仅工具回执）；卡片省略 filename source；judge 标签复用 `ui.judge.mode.approval`；面板 key 用 A2 冻结 `ui.directive.panel.consumer.download*` | §4.2、§4.5、§8.3 |
| **F9** | B1 执行阶段 filename source 与 A1 卡片阶段字段分离；C1 只用 A1 卡片阶段字段 | §4.3、§八.2 |
| **F10** | 归属键唯一来源 B1 presenter（真实或合成 `"download"`）；合成值不写 `request.flowId`；C1 不猜；A1 的 metadata 加法可选 | §4.3、§8.1 |
| **F11** | 工厂入参列全：`projectRoot/roleId/runtime/appVersion/present/takeDownloadDirective`；appVersion 来自 `app.getVersion()` | §3.1、§六 |
| **F12** | 不调用 B1 不存在的 `dispose()`；每会话引用丢弃 + 信号中止；B1 后续若加 dispose 再按形状调用 | §3.1、§八.2 |
| **F13** | `app/desktop/directive-input.ts` 列为**闸门 2 写集增补条件**（F11 窄访问器/F3 显式透传）；确认前不实施；无边界变更 | §六、§七 |
| **F14** | 既有测试逐条理由表（均在边界单文件条目内）；不弱化断言 | §七、§十.2 |
| **F18** | `rejection-copy.test.ts` 增加 `requester` 显示/回归覆盖 | §五.6、§七、§十 |
| F15/F16/F17/F20/F22 | 属 B1/C2/A2 或 PM 文档事项；C1 记录依赖、不代改 | §八 |

- **未改项（保持）**：W-2 不打开 `customerInput`；W-4 透传；下载 manual 全部分支 + `unavailableReason` 防御；`preauthorizeWrite` 排除；judge deny 归属修正；PR #57/#58 兼容；B-4 两个测试；不写 `app/renderer/**`/`src/**`/第三个测试文件/新 IPC。
- **状态**：`proposal-only`；未运行测试/typecheck/应用；待项目管理复审（以本版行数/SHA-256 为准）。

## 十五、修订记录（Revision 2，2026-11-04）

- **触发/范围**：P1 复审 Revision 1（**501 行 / `7f8a3ea5…`**）结论 `needs revision`（C1 最小修订）；剩余 **R2 dispose 对齐**、**R3 `directive-input.ts` 独立写集增补/等价接线**、**R4 `downloadFacts`/`attribution` 澄清**。本修订只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `c2f1630`；`git status --porcelain -- src app test` 为空。
- **对齐对象**：B1 Revision 1 **821 行 / `291af57c…`**（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`/`dispose()`/每会话运行时/downloadId B1 生成）；复审 501 行 / `7f8a3ea5…`；addendum 28 行 / `aeff744c…`（F4/F5，**不含** `directive-input.ts`）。本版取代上一版 434 行 / `7a8db507…`；Revision 1 记录中的 **F1 备选方案 2**、**F3 备选 `downloadApplies`** 与 **F12/F13 旧处置**均由本节取代（历史保留、不改写；当前正文只保留 B1 Revision 1 方案 1/形状 A/dispose 与 R3 选定方案①）。

| 复审项 | 处置（本版） | 位置 |
| --- | --- | --- |
| **R2 / F12**（阻断） | B1 Revision 1 已提供 `DownloadRequestRuntime.dispose(): Promise<void>`（幂等）；C1 在 `LiveSession` 保存 `downloadRuntime`，`disposeEntry` 中 `await entry.downloadRuntime?.dispose()`（失败只诊断、不阻断释放；重建/重复调用安全）；删除「B1 未提供 dispose」错误表述 | §3.1、§4.4 #7、§7、§八.2 |
| **R3 / F13**（阻断，关键） | 选定**方案①**：修改 `app/desktop/directive-input.ts`，在 `DirectiveInputController` 增加只读窄访问器 `downloadDirectiveConsumer(projectRoot)`，基于既有 `runtimeFor(projectRoot)` 返回同一 `CustomerDirectiveRuntime` 的 `takeDownloadDirective`（不新建第二运行时/账本、不复制消费逻辑、无新 IPC）。该文件列为**第三项闸门 2 写集增补条件**（`app/desktop/` 目录内、非边界变更；F4/F5 addendum 不覆盖）；统筹/沟通确认前**不实施预授权接线**。F3 形状 A **不需要**该文件改动 | §1.1、§六、§7、§八.2/8.4 #9、§12.3 |
| **R4** | 字段逐字对齐 B1：`governanceFacts`（不再 `DownloadJudgeFacts/facts` 混用）、`downloadFacts`、`attribution`（含 `flowIdIsSynthetic`）、`factsAvailable`；C1 在 `DownloadRunInput.attribution` 输入侧：有真实值则传入，无则省略由 B1 合成 `"download"`；合成值不写 `request.flowId`/`metadata.flowId`；当前会话无 flow/task 字段，默认省略（不猜） | §4.3、§4.4、§八.1/8.2、§十 #2/#12 |
| **F3 形状 A** | B1 Revision 1 `list()` epoch 投影（旧 domain `consumer:"none"`、新 `"download"`）；C1 原样透传、不判 epoch、不改 `directive-input.ts`（F3 部分）；`downloadStartsNow` 不消费 | §1.1、§六、§九 AC-14/27 |
| **F8（A2 Revision 2）** | C1 侧保持 mechanical 三项、客户系统行无 final URL、无 filename source、judge 标签复用 `ui.judge.mode.approval`；A2 Revision 2 删除两项 mechanical 与 `{finalUrl}` 后一致（A2 责任） | §4.2、§4.5、§8.3 |
| **F1/F2/F7/F9/F10/F11/F14/F18** | 上一版已处置，保持；本版仅按 B1 字段名与 dispose 对齐 | 各节 |

- **未改项（保持）**：W-2 不打开 `customerInput`；W-4 透传；下载 manual 全部分支 + `unavailableReason` 防御；`preauthorizeWrite` 排除；judge deny 归属修正；PR #57/#58 兼容；B-4 两个测试；不写 `app/renderer/**`/`src/**`/第三个测试文件/新 IPC。
- **状态**：`proposal-only`；未运行测试/typecheck/应用；待项目管理复审 Revision 2（以本版行数/SHA-256 为准）。
