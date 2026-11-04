---
id: download-requests-p1-review
type: change
title: 下载文件申请 P1 实现提案审核记录（项目管理）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: review-record
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 审核五份 P1 提案（只读）；结论 needs revision；列出阻断项、闸门 2 写集增补条件与计划内实施口径
---

# 下载文件申请 P1 实现提案审核记录（项目管理）

- **任务 / flowId**：`2026-11-04-download-requests` / `download-requests`；T3。
- **审核角色 / 阶段**：项目管理（technical-architecture）/ 团队计划 §5.1 **P1 审核**（审核者；本记录是审核建议，不是实施授权、不是客户闸门、不是验收结论）。
- **审核性质**：**只读审核**。本记录是本次唯一写盘文件；未改任何提案、产品/测试源码、边界/角色卡/changelog、`docs/scheduling|acceptance|communication`；未 commit/push；未运行实施测试。
- **结论（本记录）**：**`needs revision`**。五份提案均实质可审、写集大体在各自 Section 1 与团队计划 §4.3 内，且未发现边界外写入需求；但存在 **3 项跨角色契约阻断（F1/F2/F3）**、**2 项闸门 2 写集增补条件（F4/F5）**、**1 项编译顺序口径（F6）**、**1 项 G1 A 完整性缺口（F7）**与 **1 项外部入口条件（V1 经沟通确认）**。修订后按新版本/Hash 复审；在 `recommend approval` 前不进入 A1/A2/B1/C1/C2。

## 一、审核对象与输入

### 1.1 审核对象（五份提案，写盘前实测）

| # | 角色 | 提案路径 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 | `角色卡/运行时核心/docs/change/2026-11-04_download-requests-P1-proposal.md` | 427 | `84c1148ead476a6049e82d6318362bd8ffa33c0d12e75273e025b831787df951` |
| 2 | 项目管理（自身） | `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-proposal.md` | 426 | `2f9fb748b229648122ba84712770f20ad0d7666f95e5ece3c9b85663ed80a138` |
| 3 | 编排 | `角色卡/编排/docs/change/2026-11-04_download-requests-P1-proposal.md` | 720 | `c6b3737f137853b251ee23415bda53ff9d401f76295b8ec827e0063b08a754b8` |
| 4 | 桌面窗口 | `角色卡/桌面窗口/docs/change/2026-11-04_download-requests-P1-proposal.md` | 362 | `dcdabb129534bc6bf23bf2ad5bc044f893ca8567738faa522e1adc98cbae66f4` |
| 5 | 桌面UI | `角色卡/桌面UI/docs/change/2026-11-04_download-requests-P1-proposal.md` | 216 | `93f6798b700ac13cb10cacfc6e506274d2e16093599638f1c76d20d1a1432e6d` |

### 1.2 审核输入（只读实测）

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| 方案 P1.1 正文（`head -n 1017`） | 1017 | `2590b5604d17d67fea7526b0895f7fcef70a92c495fb5828e6782d86fef0d26d` |
| 方案 P1.1 全文 | 1018 | `de838c26766e26c9bc2124240e253385e8b95a397e0ff663e98e2893e9cea832` |
| 验收标准 V1 | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` |
| 团队计划 | 693 | `d9760755e80aa95cd548fd994ca7a1f448321427002eddfe1957397de4efec8e` |
| B0 基线 v2 | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` |
| 闸门 2 记录 | 13 | `d4f00c07a1c44515805a64a0c6e924ec6309e7f5c16bbab8d6d4a57941d8155d` |
| IA 记录 | 13 | `3250dfd4b5704a188cd01c33365891578d46166f3232fed1205c2fadfd2a8b97` |

- 基线 HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`；B0 v2 认证 T3 3665/3638/9/18（新增确定性失败 0、新增 skip 0）；H1 B-1..B-4 已落地（9 文件 `+38` 行）。
- **外部入口条件（阻断实施、非阻断本审核）**：V1 文件自身状态为「实施前写盘，等待沟通核对路径/版本」；团队计划 §5.3 P1 入口要求「V1 经沟通确认 + B0 完成 + H1 完成」。本审核可按现有输入执行，但 **A1/A2 开工前必须补齐 V1 的沟通确认**；本记录不自行认证 V1。

### 1.3 审核方法与只读代码核对

- 逐份通读五份提案（共 2151 行），并对照方案 P1.1 §3.1/§3.3/§4/§7/§8.3/§10、V1 AC-1..AC-29、团队计划 §4.1/§4.3/§4.5/§5.3/§6.2、`project-rules.md` 与当前代码（`c2f1630`）。
- 只读核对的关键代码锚点：`governance-judge-verdict.ts` 的 `switch (request.cardKind)` 与 `isConfirm`；`run-role.ts:2125` 的 `CardKind` 穷尽 `Record`；`test/编排/decision-card.test.ts:36-43` 的精确键集；`directive-store.ts` 的 `asDirectiveConsumer`/`CONSUMER_KEYS`/`resourceView`/`directiveRowView`；`directive-service.ts::consumerOf`/`toPublicView`；`model/directive.ts` 的 `ApprovalDirectiveFact`（无 `createdAt`）与 `CustomerDirectiveView`（有 `createdAt`）；`governance-judge-facts.ts::requiredArtifactPaths` 的 `default missing:true`；`governance-judge-evidence.ts` 的未知卡种 `artifactRequired=false`；`customer-input.ts` 的 `preauthorizeWrite`/`judgeResultSummary`；`session.ts::withRequestLifecycle` 的归属判定与 `requestIdOverride`；`decision-dialog.ts` 的 confirm 通用路径；`GovernanceJudgeContext.facts` 必填与 `GovernedToolsOptions` 字段；`jsonl-ledger.ts` 的模块级按绝对路径串行链；`docs/architecture/shared-components.md` 的实际位置。
- 未运行产品测试、未启动应用；本审核不替代 D1/T3 或 E2。

## 二、写集与边界审查

### 2.1 总表

| 角色 | 提案写集（摘要） | Section 1 / 团队计划 §4.3 | 审查结论 |
| --- | --- | --- | --- |
| 运行时核心 A1 | `src/model/download.ts`（新，B-1）、`runtime.ts`、`directive.ts`、`provider/runtime/{tools,schema}.ts`、`service/runtime/session.ts`（0 行）、2 个新测试、自身 docs | 全部在 Section 1（B-1 + 既有单文件）+ §4.3 A1 | 写集合格；`session.ts` 0 行需以 Service 级测试证明（提案已计划） |
| 项目管理 A2 | `i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | 目录授权；§4.3 A2 | 写集合格；allowlist 预期不改（若需增补即停止，属闸门 2 增量） |
| 编排 B1 | `src/provider/download/**`（B-3）、`src/service/download/**`（B-3）、`download-request.ts`（B-2）、`customer-directive.ts`、`run-role.ts`、`directive-service.ts`、`src/common/编排/{mechanical-rejection,governance-judge-facts,governance-judge-prompt,governance-judge,governance-judge-evidence}.ts`、`test/编排/**` | 大多在 Section 1 + §4.3 B1；**`src/common/编排/governance-judge-verdict.ts` 未在 §4.3 枚举**（目录授权内） | 写集必要；`verdict` 文件属**闸门 2 写集增补条件**（见 §六 F4） |
| 桌面窗口 C1 | `app/desktop/download-request.ts`（新）、`session.ts`、`customer-input.ts`、`interface.ts`、`app/main.ts`、`app/desktop/i18n.ts`（条件）、B-4 两个新测试、按需既有精确测试 | 全部在 Section 1（`app/desktop/` 目录、`app/main.ts`、B-4）+ §4.3 C1；C1 提案另列 5 个既有测试文件均在 boundary 单文件条目内 | 写集合格；`app/desktop/directive-input.ts` 若因 G8 面板数据需要修改，应补入其精确写集（目录内，非边界变更） |
| 桌面UI C2 | `app/renderer/src/chat/judge.ts`、`decision-dialog.ts`/`decision-card.ts`（条件）、样式、`test/桌面UI/download-card.test.ts`（新）、`test/桌面UI/directive-dialog.test.ts` | 大多在 Section 1 + §4.3 C2；**`app/renderer/src/stores/directive-store.ts` 未在 §4.3 枚举**（目录授权内） | 写集必要；`directive-store.ts` 属**闸门 2 写集增补条件**（见 §六 F5） |

### 2.2 两处「团队计划枚举缺口」裁决

**F4 — `src/common/编排/governance-judge-verdict.ts`（编排）**
- **必要性：成立**。只读核对 `governance-judge-verdict.ts:421` 的 `switch (request.cardKind)`：`download` 会落入 `default ⇒ manual("group-mismatch", "未知治理卡种")`；`isConfirm = request.cardKind === "appointment-write"` 使 download approve 只能返回 `{selected:[]}`，无法返回 `{confirmed:true}`；`SAFE_MANUAL_REASON_CODES` 不含 `download-facts-missing`。不加最小 `case "download"` 分支，AC-5/AC-24 的 judge approve 无法成立。B1 的事实判断正确。
- **分类：闸门 2 写集增补条件（非边界变更）**。该文件在编排 Section 1 的 `src/common/编排/` 目录授权内，不属于 B-1..B-4；但团队计划 §4.3 B1 的精确写集未枚举它，闸门 2 确认的是「精确写集」且写明「任何角色不得写写集外路径」。因此**由统筹/沟通在实施前记录写集增补**（或确认该目录内文件属于计划内精确写集的等价解释）；B1 在确认前不得实施该项。修订后的 B1 提案应把该文件列入正式写集并附本记录依据。

**F5 — `app/renderer/src/stores/directive-store.ts`（桌面UI）**
- **必要性：成立**。只读核对 `directive-store.ts`：`asDirectiveConsumer()` 是严格白名单（只接受 `shell-gate`/`decision-card`/`none`），未知 `consumer:"download"` 会让 `asDirectiveItem()` 返回 null、整条 domain 指令被渲染侧静默丢弃；`CONSUMER_KEYS` 是 `Record<DirectiveConsumer, MessageKey>`，新增枚举值必须补映射；`resourceView()` 对 domain 附加 `main.directive.receipt.noConsumerSuffix`，下载落地后该文案失真。C2 的写集判断正确。
- **分类：闸门 2 写集增补条件（非边界变更）**。该文件在 C2 Section 1 的 `app/renderer/` 目录授权内；团队计划 §4.3 C2 枚举未列 `stores/`。同 F4，由统筹/沟通记录写集增补；C2 在确认前不得实施该项。修订后的 C2 提案应把该文件列入正式写集并附本记录依据。

### 2.3 计划内实施口径（非闸门 2）

**F6 — A1/B1 编译解锁（`run-role.ts` 一行）**
- 只读核对：`run-role.ts:2125` 的 `CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind, string>>` 是穷尽 Record；A1 增 `GovernanceCardKind` 的 `"download"` 后该对象缺键，`npm run typecheck` 会在 **B1 文件**报错。`test/编排/decision-card.test.ts:36-43` 的 `GOVERNANCE_CARD_GROUP` 精确键集断言也会失败。
- **裁决：采用 A1 提案 R-1 的 R1 口径（计划内实施顺序，不是闸门 2 增补）**：
  1. A1 只写自己的 8 个路径，**不写 `run-role.ts`**；A1 完成 Model/工具/schema 后，先记录「Model 形状冻结 + 已知下游单点编译错误」的中间证据。
  2. B1 开工的第一个动作是在其既有写集 `run-role.ts` 中补 `CARD_KIND_ROUTE_HINTS` 的 `download` 一行（并完成其正常的 `requestDownload` 能力位加法），同时更新 `test/编排/decision-card.test.ts` 的精确键集断言（`test/编排/` 目录授权；§4.3「按需更新既有测试」）。
  3. A1 在合并树上重跑 `npm run typecheck`（exit 0）并记录最终 A1 出口证据；A1 冻结声明附 `run-role.ts` 的哈希与「编译解锁」注记。A1 不以「定向 typecheck」替代最终 `npm run typecheck` 的出口声明。
- 这不是写集扩张：`run-role.ts` 与 `test/编排/decision-card.test.ts` 都在 B1 的团队计划写集/目录授权内；只是把 A1 与 B1 的编译依赖按串行口径显式化。

## 三、跨角色契约一致性审查（阻断项集中）

### 3.1 A1 ↔ B1 ↔ C1 的 `RequestDownloadFn` 上下文与注入

- **已闭合**：A1 `DownloadRequestMetadata` 含 `signal/roleId/runtime/turnId/toolCallId`；B1 `DownloadRunInput` 含 `signal/toolCallId/turnId`，`DownloadRequestOptions` 含 `roleId/runtime/present/takeDownloadDirective`；C1 能力包装可把 `metadata.signal/toolCallId/turnId` 传入。任务要求的 signal/toolCallId/turnId 三件套**闭合**。
- **F10（非阻断、需冻结来源）**：A1 的 `DownloadRequestMetadata` 不含 `flowId/intentId/taskId`；`GovernedToolsOptions` 也不含这三个字段（只读核对：仅 `currentTurnId/roleId/runtime/customerInput` 等）。C1 的 `judgeContext` 需要归属键；B1 的 `DownloadRunInput`/`DownloadApprovalRequest` 也未提供。**修订要求**：C1/B1 必须明确归属键的唯一来源（C1 从会话/任务上下文取真实值，否则用合成 `"download"`；合成值不得写入 `request.created.flowId`），并在 B1 的 presenter 或 `DownloadRunInput` 中显式携带；A1 可选地在 `DownloadRequestMetadata` 增加 `flowId?/intentId?/taskId?`，但不是必须。该来源不得留空由实现自行猜测。

### 3.2 B1 `DownloadApprovalPresenter` 与 C1 W-3 的闭合 — **F1（阻断）**

只读对照：
- B1 §3.3 `DownloadApprovalRequest` 字段：`downloadId/roleId/runtime?/toolCallId?/turnId?/facts: DownloadJudgeFacts/policy/signal?`；`DownloadApprovalPresenter.present(request, hooks)` 返回 `DownloadApprovalOutcome`；`onPresented({requestId})` 提供卡片 requestId。
- C1 §4.3 要求 presenter 提供：`GovernanceJudgeFacts`（原样放入 `metadata.judgeContext.facts`）、`DownloadJudgeFacts`、归属键、`toolCallId/turnId`、`factsAvailable`。C1 §8.4 #2 明确「B1 不提供 `GovernanceJudgeFacts`/`DownloadJudgeFacts`/归属键/事实可用标志 ⇒ 停止回报」。

**缺口**：B1 的 presenter 请求**没有 `GovernanceJudgeFacts`、没有归属键、没有 `factsAvailable`**。`GovernanceJudgeContext.facts` 在 `src/model/runtime.ts` 是**必填**；C1 不能自行生成（C1 提案 §2.1 明确禁止），B1 也未提供，导致项目角色的下载卡无法构造合法的 `judgeContext`，AC-5/AC-24 的 judge 可达路径在契约层不成立。C1 按其自身停止条件会在开工前停止。

**修订要求（二选一并冻结）**：
1. **推荐**：B1 在 `DownloadApprovalRequest`（或等价 presenter spec）中增加完整判断上下文：`governanceFacts: GovernanceJudgeFacts`（下载卡可用最小形状 `{governanceModel:"trio", flowId: <真实或合成"download">, ledgerErrors:0}`，并在注释中标明合成归属）、`flowId/intentId/taskId` 归属键、`toolCallId/turnId`、`factsAvailable`；C1 原样映射到 `metadata.judgeContext`，不重算、不读 `.ans`。
2. 或 C1 在 `buildDownloadCardRequest` 中显式构造最小 `GovernanceJudgeFacts`（仅 `governanceModel/flowId/ledgerErrors`，不读账本、不计算下载策略），B1 只提供 `DownloadJudgeFacts` + 归属键；该方案需在 C1 提案中删除「C1 不生成 `GovernanceJudgeFacts`」的绝对表述并说明单一来源例外。

在上述任一形状冻结前，B1/C1 均不得进入实施；修订后按新版本复审。

### 3.3 B1 运行时生命周期、角色绑定、`downloadId` 与 presenter 返回 — **F2（阻断）**

只读对照：
- B1 §3.3 `DownloadRequestOptions` 在**工厂创建时**绑定 `projectRoot/roleId/runtime?/appVersion/present/takeDownloadDirective`；`DownloadRequestRuntime.download(input: DownloadRunInput)` 只有 `url/filename/purpose/requestId?/toolCallId?/turnId?/signal?`，**没有 `roleId/runtime/downloadId`**。
- C1 §3.1 在 Interface 按 `projectRoot` 缓存**每项目一份** `DownloadRequestRuntime`；§4.4 又要求 **C1 生成 `downloadId`** 并传给 B1；§8.2 要求运行时句柄接受 `{downloadId, projectRoot, roleId, runtime, input, signal, presentCard}`。
- B1 §3.3/§4.7 说 `downloadId` 由 Pipeline 生成（`dl-<uuid>`），并发 Map 是**模块级** `Map<normalizedProjectRoot, activeCount>`；`jsonl-ledger` 的追加链也是**模块级按绝对路径**串行（只读核对 `jsonl-ledger.ts:117`）。

**缺口**：
1. **角色绑定冲突**：每项目一份运行时会把首个会话的 `roleId/runtime/present` 固化，其他会话/角色的下载审计与卡片通道错误。C1 的每项目缓存与 B1 的工厂绑定不兼容。
2. **`downloadId` 归属冲突**：B1 说 Pipeline 生成，C1 说 C1 生成并传入；`DownloadRunInput` 没有该字段。
3. **presenter 返回形状**：B1 是 `present(request, hooks)` + `onPresented` 返回 outcome；C1 §8.2 写 `presentCard` 返回 `{outcome, requestId}`。二者不是同一签名。

**修订要求（推荐口径）**：
- **运行时生命周期**：采用 **每会话运行时**（C1 在 `open()` 中创建/持有，绑定 `roleId/runtime/present/takeDownloadDirective/appVersion`），利用 B1 的**模块级**并发 Map 与 `jsonl-ledger` 的模块级按路径串行链保证每项目执行并发 ≤2 与账本不交错；C1 删除「每项目一份运行时」的必要性表述（若仍要缓存，必须改为按 `projectRoot + roleId/runtime` 或把 `roleId/runtime/present` 移到每调用上下文）。B1 的 `DownloadRequestOptions` 可保持不变；C1 的 `SessionManagerDeps.getDownloadRuntime` 改为每会话/每角色获取。
- **`downloadId`**：以 **B1 Pipeline 生成**为唯一来源（审计 `downloads.jsonl` 的属主）；C1 不生成、不传入，从 presenter/结果中消费；C1 §4.4/§8.2 改为「B1 生成，C1 透传/消费」。
- **presenter 形状**：以 B1 的 `present(request, hooks)` + `onPresented({requestId})` 为冻结形状；C1 实现该签名，不在返回值中重复 `requestId`；`DownloadApprovalOutcome` 的 `requestId` 可作为兼容字段保留。
- 上述为 C1/B1 提案修订项，**不涉及新路径/边界**；修订后复审。

### 3.4 G8 A 面板视图语义 — **F3（阻断，AC-14/AC-27）**

只读对照：
- B1 §3.5 `consumerOf` 对 domain（allow/deny）**无条件**返回 `"download"`；`directive-service.ts::consumerOf` 当前对 domain 返回 `"none"`，`toPublicView` 的 `consumer` 来自创建时的 `consumerOf`，**不知道 epoch**。
- B1 §3.4 `takeDownloadDirective` 有 `enabledAt` 过滤，但那是**匹配路径**；面板数据路径是 `directive:list`/`directive:state` → `app/desktop/directive-input.ts:491,721` 的 `runtimeFor(projectRoot).list()` → `customer-directive.ts::list()` → `service.list()`，**不经过** `consumerEpoch()`。
- C2 §3.2 要求：作用于下载的 domain ⇒ `consumer:"download"`；早于 `enabledAt` 的旧 domain ⇒ `consumer:"none"`（或等价冻结字段 `downloadApplies:false`）；C2 明确**不比较时间、不读 epoch 文件**。B1 提案没有提供旧 domain 的视图语义，C1 提案只说「面板数据由 B1」，没有指定字段/连线。

**缺口**：AC-27 的「旧指令不作用于下载」面板标注**在现有冻结形状下无法实现**；旧指令会显示「消费者：下载」，构成误导。AC-14 的「面板 consumer 显示下载」对新指令成立，但旧指令标注缺失。

**修订要求（B1/C1/C2 三选一并冻结）**：
1. A1 在 `CustomerDirectiveView` 增加可选 `downloadApplies?: boolean`（视图字段，非账本事件）；B1 在 `customer-directive.ts::list()` 用 epoch 计算 true/false/unknown；C1 把该字段放入 `directive:list`/`directive:state` 载荷；C2 映射 `false + domain ⇒ downloadLegacyOff`。
2. 或 B1 在 `customer-directive.ts::list()` 把早于 epoch 的 domain 视图映射为 `consumer:"none"`（新指令保持 `"download"`）；C2 映射 `none + domain ⇒ downloadLegacyOff`。这不需要 A1 Model 新字段，但 B1 必须在 `list()` 的 epoch 可用性上给出实现（例如 `list({downloadEnabledAt})` 或注入 epoch store）。
3. 或等价冻结字段/API；无论哪种，**C1 的 `directive-input.ts`/`interface.ts` 若需传 epoch，应把该文件补入 C1 精确写集**（在 `app/desktop/` 目录授权内，非边界变更），且 C2 只消费冻结字段、不判 epoch。
- 在此冻结前，C2 的 AC-27 实现与 B1 的 `consumerOf` 不能同时成立；`downloadStartsNow`（G8 B）仍不得消费。

### 3.5 A2 key 与 C1/C2 消费的闭合 — **F8（条件项，非硬阻断）**

A2 提案的 37 key 与 C1/C2 需求的差异（逐项）：
- **judge 结果行标签**：A2 复用 `ui.judge.mode.approval`；C1 §4.5 允许「或 A2 等价 key」，C2 §3.1 明确接受复用。**闭合**；C1 的 §8.3 若仍把 `ui.download.judge.group.approval` 列为硬需求，应改为接受复用，避免误触发停止条件。
- **指令面板 key 命名**：A2 冻结 `ui.directive.panel.consumer.download*`；C2 提案使用 `ui.directive.consumer.downloadLegacyOff` 等方案建议名，但注明「以冻结为准」。**需 C2 在修订中逐字改为 A2 冻结名**；语义不变。
- **mechanical 摘要**：C1 §4.2 要五项（scheme/无凭据/主机公网/全部 IP 公网/文件名安全）；A2 只冻结三项（`mechanical.scheme/publicHost/publicIps`），`credentialsAbsent`/`filenameSafe` 是发卡前置条件。**建议 C1 按 A2/方案 §8.3 的三项摘要收敛**；若 AC-3 要求五项，A2 增补 2 key 并更新计数（属 A2 写集内的契约修订，不是闸门 2）。
- **完成回执**：C1 §4.5 要 final URL；A2 `main.download.notice.completed` 无 `{finalUrl}`。方案 §8.3 的成功示例不含 final URL（final URL 在工具成功回执中）。**建议 C1 从客户系统行去掉 final URL**，或 A2 增补 `{finalUrl}`（二选一，冻结）。
- **文件名来源**：C1 §4.2 要「预期文件名与来源」；A2 `main.download.card.filename` 只含文件名 + Content-Disposition 覆盖说明，无来源标签。**建议 C1 省略来源标签**（AC-3 只要求预期文件名），或 A2 增补 `filenameSource` key（二选一）。
- **G1 A 提示（F7，阻断 C1/A2 完整性）**：客户已确认 G1 A「不自动修改 `.gitignore`，完成后提示客户自行添加」。B1 §7.3 把提示归 C1；C1 提案未写该提示；A2 37 key 未覆盖。**修订要求**：C1/A2 增加完成回执中的 `.gitignore` 提示（新增 key 或并入 `notice.completed` 文案；若新增 key，A2 计数相应更新），不得硬编码中文。
- **`downloadStartsNow`**：A2 保留为 inert key（G8 A 无消费点），C2 明确不消费。**审查接受**（作为 §8.3 契约完整性条目），但修订时需在 A2 中明确标注 inert；若统筹/审核要求零死 key，可在 A2 实施前删除并更新计数（编辑性修正，不改语义）。
- **`notice.failed` 的 action/owner**：A2 保留 agent-facing 工具回执的「下一步/谁来做」；客户系统行只显示 reason+code。方案 §8.3 的失败示例含 action/owner。**审查意见**：A2 的口径可接受（客户系统行简洁、模型回执可操作）；若客户/验收要求客户回执也含 action/owner，A2 需增补 owner/action key 并更新计数——列为非阻断开放点。

### 3.6 其他跨角色契约点

- **F9（非阻断）`filenameSource` 联合不一致**：A1 `DownloadJudgeFacts.filenameSource` 为 `"url-basename" | "caller" | "fallback"`（卡片阶段无 Content-Disposition）；B1 §3.1 `resolveFilename` 的 source 含 `"content-disposition"`（执行阶段）。B1 必须把执行阶段 source 与 A1 的卡片阶段字段分开（不得把 `"content-disposition"` 赋给 `DownloadJudgeFacts.filenameSource`）；如需在结果/审计中记录执行阶段 source，另用 B1 自有类型。修订时在 B1 提案中写明。
- **F11（非阻断）C1 工厂入参**：B1 `DownloadRequestOptions` 需要 `appVersion/present/takeDownloadDirective`；C1 §3.1 只说「C1 只提供 projectRoot 与诊断」。修订后的 C1 必须显式列出这些入参（`appVersion` 来自 `app.getVersion()`/包版本；`present` 每会话；`takeDownloadDirective` 绑定项目指令运行时）。
- **F12（非阻断）`dispose()`**：B1 `DownloadRequestRuntime` 接口没有 `dispose()`；C1 §3.1 说「调用 B1 暴露的 dispose()（若有）」。修订时二选一：B1 增加 `dispose()`（若需要释放资源），或 C1 仅用信号中止 + 清缓存，不依赖不存在的接口。
- **F13（非阻断）`directive-input.ts`**：若 G8 面板数据需要把 epoch 传入 `directive:list`/`directive:state`，C1 需修改 `app/desktop/directive-input.ts`（当前 `list()` 调用点在 `:491`/`:721`）。该文件在 `app/desktop/` 目录授权内，但 C1 §7 写集未列；修订时补入精确写集（计划内，不是边界变更）。
- **F14（非阻断）C1 既有测试文件**：C1 提案列出的 `operator-channel.test.ts`、`run-change-entry.test.ts`、`version-decision.test.ts`、`acceptance-return-card.test.ts`、`run-pin.test.ts` 均在 `角色卡/桌面窗口/boundary.md` 的单文件条目内（只读核对全部命中），写集合法；完成报告须逐条说明为何受影响。
- **F18（非阻断）`RejectionOwner:"requester"`**：只读检索显示 `RejectionOwner` 只在 `mechanical-rejection.ts` 内使用，其他角色使用的是 `MechanicalRejection.owner` 字符串；未发现其他 `Record<RejectionOwner,...>` 编译点。B1 的加法不会造成跨角色 typecheck 阻断；C1 应在 `rejection-copy.test.ts` 增加 requester 显示/回归覆盖（其写集已含该文件）。
- **F22（非阻断）`takeDownloadDirective` 数据源**：`ApprovalDirectiveFact` 无 `createdAt`，B1 改读同一回放快照的 `service.list()`（含 `createdAt`）是可行的实现级落点，不改变匹配语义、不扩 Model；审查接受，但 B1 修订时需在 `customer-directive.ts` 的 API/注释中明确「同一快照、ledgerErrors 纪律不变」。

## 四、AC-1..AC-29 覆盖审查

| AC | 主要 owner（提案） | 审查状态 |
| --- | --- | --- |
| AC-1 | A1/C1/D1 | 覆盖；工具注入/CLI/判断会话结构有测试计划 |
| AC-2 | A1 | 覆盖；工具层形状校验 + 调用计数 0 |
| AC-3 | B1/C1/C2/D1/D2 | 覆盖；A2 key 与 C1 preview 对齐见 F7/F8 |
| AC-4 | A1/C1/B1/D1/D2 | 覆盖；依赖 F1 的 judgeContext 闭合 |
| AC-5 | A1/B1/C1/D1 | **受 F1 阻断**（`GovernanceJudgeFacts`/factsAvailable 未闭合） |
| AC-6 | C1/D1/D2 | 覆盖；manual 分支 + unavailableReason 防御 |
| AC-7 | B1/D1 | 覆盖；IP 判表/钉扎/rebinding 计划齐备 |
| AC-8 | B1/D1 | 覆盖；同域/跨域/降级/跳数/异常 3xx |
| AC-9 | B1/D1 | 覆盖；仅 200 写盘、204/206/其他 2xx 拒绝、无残留 |
| AC-10 | B1/C1/D1 | 覆盖；signal 由 A1 metadata 透传；无自动重试 |
| AC-11 | B1/D1 | 覆盖；文件名真值表/净化/重名/不覆盖 |
| AC-12 | B1/D1 | 覆盖；temp/fsync/rename/失败清理 |
| AC-13 | B1/C1/D1 | 覆盖；`download/` 根/符号链接/单文件名 |
| AC-14 | A1/B1/C1/C2/A2/D1/D2 | **受 F3/F4/F5 影响**（旧指令面板标注/verdict/directive-store 写集） |
| AC-15 | A1/B1/D1 | 覆盖；失败 code/成功 rename 后/无重试/once |
| AC-16 | B1/C1/D1 | 覆盖；并发 ≤2/一项目一卡；受 F2 生命周期口径影响 |
| AC-17 | B1/C1/D1 | 覆盖；`request.*` vs `downloads.jsonl` 归属/零 `request.*` |
| AC-18 | D1 | 覆盖；T3 全量、非目标、shell/写守卫不变 |
| AC-19 | A2/C1/C2/D1/D2 | 覆盖；A2 37 key/parity/零泄漏；C1/C2 消费对齐见 F8 |
| AC-20 | E1/E2 | 过程项；提案均声明证据/hash 计划 |
| AC-21 | B1/C1/D1/D2 | 覆盖；C1 的 judge deny 归属修正必要（只读核对确认） |
| AC-22 | C1/D1/D2 | 覆盖；关窗 fail-closed/卡共存 |
| AC-23 | A1/B1/C1/D1 | 覆盖；`CONFIRM_CARD_KINDS` 不变/工具层拒绝 download |
| AC-24 | A1/B1/C1/D1 | **受 F1 + F4 阻断**（judgeContext + verdict case） |
| AC-25 | A1/B1/C1/D2 | 覆盖；≤2 KiB/截断标记；key 对齐见 F8 |
| AC-26 | B1/D1 | 覆盖；TLS 三类失败/无关闭开关 |
| AC-27 | B1/C1/C2/A2/D1/D2 | **受 F3 阻断**（旧指令面板视图语义） |
| AC-28 | C1/B1/D1/D2 | 覆盖；事实失败/ unavailableReason 转客户卡/不耗预授权 |
| AC-29 | B1/D1 | 覆盖；边界状态码/仅 200 文件 |

- **无 AC 完全无 owner**；阻断集中在 AC-5/14/24/27，均可由提案修订解决，不需重开闸门 1。AC-20 由 E1/E2 负责，不要求角色提案自证。

## 五、方案 P1.1、G1–G8、P1–P9 与非目标一致性

| 项 | 审查结果 |
| --- | --- |
| G1 A（不改 `.gitignore`，完成后提示） | **F7 缺口**：B1 把提示归 C1；C1 未写；A2 无 key。需 C1/A2 修订（新 key 或并入完成回执）。不改 `.gitignore` 本身：B1/C1 均未计划修改，符合 |
| G2 A（默认 100 MB，env 仅部署方） | B1 `ANS_DOWNLOAD_MAX_BYTES` + A1 常量；模型/申请方无入口；符合 |
| G3 A（跨域 `download-redirect-cross-host` + 最终 URL，重新申请） | B1 §4.3/§3.9；符合 |
| G4 A（`*.example.com` 严格子域；`*` 任意；高危创建二次确认） | B1 §3.4 匹配；指令创建/高危语义不改（A1/B1 均声明）；符合 |
| G5 A（`once` 失败也算已消费） | B1 §3.4「返回前 durable 消费」；失败不重复使用；符合 |
| G6 A（显式端口 1–65535） | B1 §3.1/§4.2；符合 |
| G7 A（shell 暂停不覆盖下载判断） | C1 §1.1/§6 只读持久化 approval 开关、不读 `shellSessionPaused`；符合 |
| G8 A（enabledAt epoch；旧指令不授权；面板标注；不可读不重写） | 匹配/epoch/不可读不重写：B1 §3.4/§3.9 符合；**面板旧指令标注：F3 缺口**；B/C 未实现（C2/B1 声明不实施），符合 |
| P1–P9 | 五份提案均声明全部未选、不实施（进度/去重/清理/`.gitignore` 维护/代理/解压/`expectedSha256`/后台/回滚开关）；无提案实施任一，符合 |
| 错误码/owner | A1 17 码与方案 §3.3 一致（含 `download-unsupported-encoding`）；B1 17 条 `DOWNLOAD_RULES` owner/retryable 与方案一致（denied-by-directive=customer；rebinding/too-large 非重试；其余按要求）；`RejectionOwner:"requester"` 加法；符合 |
| manual 转客户卡 | C1 §5.2/§5.3 覆盖全部 manual + unavailableReason；B1 `download-facts-missing` 入 `UNVERIFIABLE`；符合 |
| 预授权路径零 `request.*` | B1 §3.9 结构测试；C1 presenter 只在卡片路径进入 `withRequestLifecycle`；符合 |
| 非目标（不改 shell 闸/写守卫/CLI/浏览器/`.gitignore` 自动维护/构建/发布） | 五份提案均声明；B1 不写 `task-state`/`request.*`；符合 |
| 测试缝/生产缝关闭 | B1 §4.9 生产工厂无 seam、`ForTest` 仅测试、impl 不被上层 import、策略不被替换 + 结构检查；审查接受为可核对证据计划；D1 仍需复核 |
| T3/B0 | B0 v2 认证；各提案只跑自身受影响套件，全量 T3 归 D1；符合团队计划 §6.3 |
| V1 入口 | **外部条件**：V1 自述等待沟通核对确认；A1/A2 开工前须补齐 |

## 六、项目规则（`角色卡/项目管理/docs/project-rules.md`）对照

| 规则 | 审查结果 |
| --- | --- |
| §一.2 五层方向/相邻层 | A1 只 import Model/shared runtime-shared；B1 只走 Service/Provider + Pipeline 公共入口；C1 只消费 A1 Model/B1 Pipeline，不 import Service/Provider；C2 只消费 preload/i18n。B1 的 `takeDownloadDirective` 用注入回调避免 Pipeline↔Pipeline 平级互调；符合 |
| §一.5 共享组件唯一实现 | B1 复用 `jsonl-ledger`/`atomic-write`/`path-primitives`/`diagnostics`，不复制；A2 不改 `jsonl-ledger.ts`/`shared-components.md`；符合。**文档缺口**：`jsonl-ledger` 未列入 project-rules §一.5 的现有组件清单；`docs/architecture/shared-components.md` 实际位于 `角色卡/项目管理/docs/architecture/shared-components.md`（B1 提案称其在 `docs/architecture/` 缺失是**路径错误**，文件存在）——均为 PM 文档维护事项，非 B1 阻断 |
| §一.6 私有 common 隔离 | B1 不 import `src/common/runtime-core/**`（运行时核心私有），改用共享 `path-primitives`；A1 不写 `src/common/**`；符合 |
| §二.3/4/5 补丁/证据/重测 | 提案均声明候选哈希、原始输出、基线对照、消费者重测；符合 |
| §二.6 不得伪装成功 | A1 fail-closed 回执、B1 `ok:false` + 稳定 code、C1 不把投递失败翻转结果；符合 |
| §二.9 风险档位 | T3；D1 全量；符合 |
| §二.10 打印/日志 | B1 用 `createDiagnosticLogger` 白名单字段，不记 URL 正文/purpose/响应体/凭据；C1/C2 按需；符合 |
| §二.13/16 卡片/开关 | **表面张力已裁决**：下载卡是**应用自有 confirm 种**（P1.1/闸门 1 已确认；AC-23 明确 `request_confirmation` 仍只 `appointment-write`），不是 `request_confirmation`/`request_choice`；规则 16 的「对应工具/fail-closed 拒绝」语义适用于既有确认/选择卡通道，不适用于本设计新增的下载卡种。下载 manual 转客户卡是方案 §4.2/F12 的客户确认口径；不构成规则冲突。**非阻断**：建议 PM 在 project-rules 后续维护中加一条范围说明（不改任何角色写权） |
| §二.17 截图上限 | D2 最多截图、不录屏；符合 |
| §四 调度记录 | 无角色写 `docs/scheduling/`；符合 |
| 提案对照完整性 | A1/C2 提案没有专门的 project-rules 对照表（C1/B1 有）；审核者已代为对照，未发现冲突；**非阻断文档缺口**，修订可选补表 |

## 七、逐提案裁决与修订要求

### 7.1 运行时核心（A1）

**结论：`recommend approval`（附本记录采纳的 D-1..D-8/R-1/R-2 口径）。** 提案写集、契约、测试、AC 映射、基线披露均在 P1.1/团队计划内；未发现边界外需求。

- **采纳 D-1..D-8**（A1 §3.8）：D-1 判别联合；D-2 `DownloadRequestMetadata`；D-3 空白 filename 视为未提供；D-4 传 trim 值；D-5 拒绝未知参数；D-6 `executionMode:"sequential"`；D-7 固定 `download-unavailable`、不带原始异常文本；D-8 常量集合如提案。
- **采纳 R-1/R-2**：R-1 按 §2.3 的 R1 串行口径；R-2 由 B1 更新 `test/编排/decision-card.test.ts`。
- **接受** `src/service/runtime/session.ts` 0 行透传（`Omit` + `…options` 已核实），以 Service 级测试证明。
- **非阻断注记**：F9 `filenameSource` 与 B1 执行阶段 source 的区分；F10 归属键来源（如需 A1 在 metadata 中加 `flowId?/intentId?/taskId?`，属 A1 写集内的编辑性加法，不阻断当前结论，但需与 B1/C1 冻结一致）。

### 7.2 项目管理（A2，自身提案）

**结论：`needs revision`（轻度）。** A2 的 37 key 内部一致、计数/parity/零泄漏/占位符方案完整，panel 前缀命名与 `ui.judge.mode.approval` 复用合理；但需修订：

1. **F7 G1 A 提示**：增加 `.gitignore` 提示的 key（或并入 `notice.completed`），并同步计数/精确文案断言。
2. **F8 消费对齐**：在冻结声明中明确 C1/C2 只能消费 A2 的 panel 前缀名与 `ui.judge.mode.approval` 复用；C1 的 mechanical 五项/final URL/filename source 需求与 A2 三项/无 final URL/无 source 的差异，按 §3.5 的二选一冻结（推荐 C1 收敛到 A2/方案 §8.3 的三项摘要、无 final URL、无 source）。
3. **`downloadStartsNow`**：保留时明确标注 inert（G8 A 无消费点）；若删除，更新计数（36/1782 或按 F7 后实际值）。
4. **自审披露**：本提案与本次审核同一上下文；A2 的结论是自检，不冒充独立审核（见 §八）。

### 7.3 编排（B1）

**结论：`needs revision`（阻断）。**

- **F1**：presenter 增补 `GovernanceJudgeFacts`/归属键/`factsAvailable`，或与 C1 冻结 C1 构造最小 `GovernanceJudgeFacts` 的例外；二选一，必须闭合 AC-5/AC-24。
- **F2**：运行时生命周期/角色绑定/`downloadId`/presenter 返回形状与 C1 冻结一致（推荐每会话运行时 + B1 生成 `downloadId` + B1 的 hook 形状）。
- **F3**：G8 A 面板旧指令视图语义（`downloadApplies`/`consumer:"none"`/等价字段）；B1 的 `list()` 必须能产出 epoch-aware 视图，C1 的 `directive:list`/`directive:state` 载荷携带，C2 消费。
- **F4**：`governance-judge-verdict.ts` 列入正式写集；在统筹/沟通记录闸门 2 写集增补后实施；修订后附本记录依据。
- **F6**：`run-role.ts` 编译解锁一行按 §2.3 R1 执行；`test/编排/decision-card.test.ts` 同步更新。
- **F9**：`filenameSource` 执行阶段 vs 卡片阶段分离。
- **F22**：`takeDownloadDirective` 读 `service.list()` 的注释/纪律明确。
- **F15**：修正 `shared-components.md` 路径表述（实际文件存在；`jsonl-ledger` 规则清单缺口可保留为 PM 文档事项）。
- 其余（SSRF/IP 判表/重定向/大小/超时/TLS/文件名/原子写/预授权/epoch/审计/测试缝）审查接受；无边界外需求。

### 7.4 桌面窗口（C1）

**结论：`needs revision`（阻断）。**

- **F1**：按 B1 冻结的 presenter 事实/归属形状消费；不自行读账本/不自造 `GovernanceJudgeFacts`，或按 §3.2 方案 2 显式构造最小 governance facts（二选一）。
- **F2**：运行时生命周期改为每会话（或与 B1 冻结等价的 per-call 上下文）；`downloadId` 由 B1 生成、C1 消费；presenter 按 B1 的 `present(request,hooks)` 实现。
- **F3**：面板数据路径接入 epoch-aware 视图（可能需要 `directive-input.ts`/`interface.ts`；补入精确写集）。
- **F7/F8**：接 A2 的 G1 提示与 key 冻结；mechanical/final URL/filename source 按 §3.5 收敛。
- **F11/F12/F13**：工厂入参（`appVersion/present/takeDownloadDirective`）列全；`dispose()` 二选一；`directive-input.ts` 如需改动补写集。
- **非阻断**：F10 归属键来源明确（真实或合成 `"download"`；合成不写 `request.flowId`）；F14 既有测试逐条理由；F18 requester 回归覆盖。
- 其余（W-2/W-3/W-4、manual 全分支、unavailableReason 防御、preauthorizeWrite 排除、judge deny 归属修正、关窗 fail-closed、B-4 测试）审查接受；无边界外需求。

### 7.5 桌面UI（C2）

**结论：`needs revision`（阻断，主要因写集口径与 G8 视图依赖）。**

- **F5**：`directive-store.ts` 列入正式写集；统筹/沟通记录闸门 2 写集增补后实施。
- **F3**：只消费 B1/C1 冻结的旧指令视图语义（`consumer:"none"` 或 `downloadApplies:false`/等价）；不在渲染侧比较 `createdAt`/读 epoch；若冻结形状不满足，停止回报。
- **F8**：逐字使用 A2 冻结的 `ui.directive.panel.consumer.download*` 与 `ui.judge.mode.approval`；不消费 `downloadStartsNow`。
- **非阻断**：F17 frontmatter `status: draft`/`related: []` 改为 `proposal-only`/`[download-requests]`；F16 可选补 project-rules 对照表。
- 其余（judge 结果行 `autoApproved`/`kindClass:"generic"`、confirm 卡复用、`directive-dialog.test.ts` 更新、AC-3/14/19/27 映射）审查接受；无边界外需求。

## 八、结论、阻断清单与后续条件

### 8.1 总体结论

**`needs revision`**。不是 `recommend approval`：存在 3 项跨角色契约阻断（F1/F2/F3）、1 项编译顺序依赖（F6）、2 项闸门 2 写集增补条件（F4/F5）与 1 项 G1 A 完整性缺口（F7）。不是 `not ready`：五份提案均已写盘且可实质审核；缺口均可在各自既有写集/边界内修订解决，**未发现需要重开闸门 1/2 的实质范围变化**，也未发现边界外写入需求。

### 8.2 阻断项（必须修订/裁决后才能 `recommend approval`）

| # | 阻断 | 涉及角色 | 类型 |
| --- | --- | --- | --- |
| F1 | B1 presenter 缺 `GovernanceJudgeFacts`/归属键/`factsAvailable`；C1 W-3 无法构造 judgeContext（AC-5/24） | B1/C1 | 提案修订（无新路径） |
| F2 | B1 工厂角色绑定 vs C1 每项目运行时；`downloadId` 归属冲突；presenter 返回形状不一致（AC-16/24 等） | B1/C1 | 提案修订（无新路径） |
| F3 | G8 A 旧指令面板视图语义缺失（AC-14/27） | B1/C1/C2 | 提案修订 + C1 面板载荷/可能 `directive-input.ts` |
| F4 | `governance-judge-verdict.ts` 未在 §4.3 枚举、但 AC-24 必需 | B1 | **闸门 2 写集增补条件**（非边界变更） |
| F5 | `directive-store.ts` 未在 §4.3 枚举、但 AC-14/27 必需 | C2 | **闸门 2 写集增补条件**（非边界变更） |
| F6 | A1/B1 编译解锁串行口径未固定 | A1/B1 | **计划内实施口径**（R1；`run-role.ts` 一行 + decision-card 测试由 B1） |
| F7 | G1 A「完成后提示客户自行添加 `.gitignore`」无 key/无 C1 回执 | A2/C1 | 提案修订（A2 key 或并入 notice.completed） |
| V1 | V1 未显示沟通核对确认 | 统筹/沟通 | **外部入口条件**；A1/A2 开工前补齐 |

### 8.3 非阻断项（修订时处理/记录）

- F8 A2/C1/C2 key 对齐（mechanical 五项 vs 三项、final URL、filename source、judge 标签复用、panel 前缀名、`downloadStartsNow` inert、`notice.failed` action/owner）。
- F9 `filenameSource` 执行阶段 vs 卡片阶段分离。
- F10 归属键来源（真实/合成 `"download"`；合成不写 `request.flowId`）。
- F11 C1 工厂入参 `appVersion/present/takeDownloadDirective` 列全。
- F12 C1 `dispose()` 二选一。
- F13 C1 `directive-input.ts` 如需改动补入精确写集。
- F14 C1 既有测试文件逐条理由（均在 boundary 单文件条目内）。
- F15 `shared-components.md` 路径纠正；`jsonl-ledger` 规则清单缺口为 PM 文档维护事项。
- F16 A1/C2 提案的 project-rules 对照表可选补齐。
- F17 C2 frontmatter 状态/related 修正。
- F18 `RejectionOwner:"requester"` 无其他编译消费点；C1 增加 requester 回归覆盖。
- F20 `downloadStartsNow` inert 保留/删除二选一。
- F22 `takeDownloadDirective` 使用 `service.list()` 的同一快照/ledgerErrors 纪律注释。

### 8.4 `recommend approval` 的前置条件

1. 五份提案按本记录修订并写盘；复审时使用新行数/SHA-256，旧哈希不得复用。
2. F4/F5 的写集增补由统筹/沟通记录（或确认等价计划内解释）；F6 的 R1 顺序由统筹在派发时明确；F7 的 G1 key 已入 A2/C1。
3. F1/F2/F3 的跨角色契约在 B1/C1/C2 修订版中**同一形状**冻结；不得各自解释。
4. V1 经沟通核对确认（路径/版本）后，A1/A2 才可开工；B1/C1/C2 仍按团队计划依赖前序冻结。
5. 复审通过后仍不授权提交/推送/合并/发布；实施须按 IA 与团队计划派发。

### 8.5 声明

- 本审核是**建议**，不是实施授权、不是客户闸门、不是验收结论；审核通过不替代 V1、IA、独立验收或客户决定。
- 本记录由项目管理上下文撰写；A2 为同一上下文的自有提案，其评估是自检，不虚构独立审核人；其余四份提案的审核基于只读提案与代码核对，未要求受影响角色提供额外评估（如后续需要，按 `references/proposal-review.md` 在独立角色上下文补评估，未获得时如实记为缺口）。
- 本记录未改任何提案/产品/测试/边界/角色卡/changelog；未 commit/push；唯一写盘文件为本记录。

---

# Revision 1 复审（2026-11-04）

> 本节在原审核记录（340 行 / SHA-256 `503aaf347be69b67bf7bc0bb6e426151f71f5f4a572dbdc32203ff711be0e530`）末尾**追加**；原记录正文与历史哈希保留、不改写。复审使用修订后的新提案哈希；旧哈希不复用。复审仍为只读：未改任何提案/产品/测试/边界/角色卡，未 commit/push。

## 一、复审对象与输入

### 1.1 五份提案（修订后，写盘前实测）

| # | 角色 | 路径 | 行数 | SHA-256 | 与上一版 |
| --- | --- | --- | --- | --- | --- |
| 1 | 运行时核心 A1 | `角色卡/运行时核心/docs/change/2026-11-04_download-requests-P1-proposal.md` | 427 | `84c1148ead476a6049e82d6318362bd8ffa33c0d12e75273e025b831787df951` | 未改 |
| 2 | 项目管理 A2 | `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-proposal.md` | 458 | `37c74edb108c7d91d8e749852ff1ce370cfebf1bb16f0418f09cd34f4622a4b5` | Revision 1 |
| 3 | 编排 B1 | `角色卡/编排/docs/change/2026-11-04_download-requests-P1-proposal.md` | 821 | `291af57c111082913105fd76af0a72a334a7c6fe543a37f1225b0085654dd405` | Revision 1 |
| 4 | 桌面窗口 C1 | `角色卡/桌面窗口/docs/change/2026-11-04_download-requests-P1-proposal.md` | 434 | `7a8db507f59fa0bb1c0307519dbb80a7f3e4ccdbab0ebd31e5bead21be94be86` | Revision 1 |
| 5 | 桌面UI C2 | `角色卡/桌面UI/docs/change/2026-11-04_download-requests-P1-proposal.md` | 255 | `52a560a5b16f5904133bea8b316b115932abced2142f72b4ecde261abea47767` | Revision 1 |

### 1.2 新增/确认输入

| 输入 | 行数 | SHA-256 | 用途 |
| --- | --- | --- | --- |
| 闸门 2 写集增补 + V1 确认记录 `docs/communication/2026-11-04_gate2-writeset-addendum_download-requests.md` | 28 | `aeff744cb852c1e2c3ac718d4640c1803c0628c826a68fbcdb260eeb91f84212` | 确认 F4/F5 写集增补、F6 顺序、V1 路径/版本可派发、B0 v2 知悉 |
| V1 | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` | 验收基线；addendum 确认 |
| B0 v2 | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` | T3 3665/3638/9/18；新增确定性失败 0、新增 skip 0 |
| 计划/方案/闸门 2/IA | — | 见原记录 §1.2 | 未变 |

- 基线 HEAD `c2f1630`；`git status --porcelain -- src app test` 为空（复审写盘前实测）。
- **V1 入口条件已闭合**：addendum §三确认 V1 路径/版本可作派发依据，文件内「等待沟通确认」字样可按 addendum 忽略/后续编辑更新；P1 入口的 V1 条件不再构成阻断。
- **F4/F5 已确认**：addendum §一确认两文件均在既有目录授权内（非边界变更，无需客户另行确认）；`governance-judge-verdict.ts` 与 `directive-store.ts` 可进入各自任务写集。F6 顺序与 B0 v2 亦在 addendum §二/§四知悉。

## 二、F1–F13 逐项关闭核对

| 项 | 复审结果 | 依据/位置 |
| --- | --- | --- |
| **F1（阻断，B1↔C1 判断上下文）** | **已关闭（语义同形）**。B1 `DownloadApprovalRequest` 提供 `factsAvailable`、`governanceFacts`（`buildGovernanceJudgeFacts({flowId})` 最小形状）、`downloadFacts`、`attribution`（真实/合成 + `flowIdIsSynthetic`）、`toolCallId/turnId`；C1 §4.3/§八.2 首选方案 1 原样映射，备选方案 2 的最小 facts 构造已写明，且要求 B1/C1 同形冻结。C1 的字段名仍有 `DownloadJudgeFacts`/`facts` 与 B1 `downloadFacts` 的表述差异（**非阻断编辑项**，C1 应按 B1 字段名逐字对齐）。 | B1 §3.3/§3.7/§6.3；C1 §二.2/§4.3/§八.2 |
| **F2（阻断，生命周期/downloadId/presenter）** | **已关闭（主口径同形）**。B1/C1 均改为**每会话运行时**；B1 生成 `downloadId`（`DownloadRunInput` 无该字段）；presenter 冻结 `present(request,hooks)+onPresented`；B1 模块级并发 Map + jsonl-ledger 模块级按路径串行链保证项目级安全。**遗留 F12 不一致**：B1 新增 `dispose()`，C1 仍称「B1 未提供 dispose()、不调用」——见 §四.3。 | B1 §3.3/§4.7/§6.3；C1 §二.4/5/§3.1/§4.4/§八.2 |
| **F3（阻断，G8 A 面板视图）** | **已关闭（形状 A 三方同形）**。B1 `CustomerDirectiveRuntime.list()` 冻结 epoch-aware 投影：旧 domain ⇒ `consumer:"none"`，新 domain ⇒ `"download"`，epoch missing/unreadable ⇒ 全部 none；C1 原样透传 `directive:list`/`directive:state` 载荷、不改 `directive-input.ts`；C2 只消费 `"download"`/`"none"+domain`，不比较时间/不读 epoch。形状 B（`downloadApplies`）仅作备选，B1/C1 已选形状 A。 | B1 §3.5/§6.2/§6.3；C1 §六；C2 §3.2/§六 |
| **F4（闸门 2 写集增补）** | **已关闭**。addendum §一确认 `src/common/编排/governance-judge-verdict.ts` 纳入 B1 写集（目录内、非边界变更）；B1 §2 #26 的条件「记录前不实施」已由该记录满足，B1 可在派发后实施。 | addendum §一；B1 §2.4 #26/§6.5/§7.4 |
| **F5（闸门 2 写集增补）** | **已关闭**。addendum §一确认 `app/renderer/src/stores/directive-store.ts` 纳入 C2 写集（目录内、非边界变更）；C2 可在派发后实施该文件的五条精确改动。 | addendum §一；C2 §三.2/§四/§八.3 |
| **F6（编译顺序）** | **已关闭**。addendum §二确认 R1 顺序；B1 §3.6/§5.2/§6.5 写明开工第一动作补 `CARD_KIND_ROUTE_HINTS.download` + 更新 `test/编排/decision-card.test.ts`；A1 在合并树上重跑最终 typecheck。 | addendum §二；B1 §3.6/§6.5 |
| **F7（G1 提示 key）** | **已关闭（A2/C1 侧）**。A2 新增 `main.download.notice.gitignoreHint`（独立 key）；C1 §4.5/§8.3 消费该 key 或合并文案，成功路径追加、失败不提示、不硬编码。 | A2 §3.1.2 #20/§3.2；C1 §4.5/§8.3 |
| **F8（A2/C1/C2 key 对齐）** | **未完全关闭（A2 阻断）**。C1/B1 修订版统一为 **mechanical 三项**（`scheme/publicHost/publicIps`）且客户系统行 **不含 final URL**（final URL 仅在工具成功回执）；A2 Revision 1 仍有 **五项 mechanical**（多 `credentialsAbsent`/`filenameSafe`）与 `completed` 的 **`{finalUrl}`**——与 C1/B1 不一致。**裁决：A2 Revision 2 必须删除这两个 mechanical key 与 `{finalUrl}`，保留 `gitignoreHint`**；最终 37 key（main 35 = card 13 + notice 5 + error 17；ui 2），计数 `ui 1092 / main 626 / shared 62 / preferences 3 = 1783`。C2 侧另有 `downloadStartsNow`/key 编号过期引用（非阻断编辑项，见 §四.5）。 | C1 §4.2/§4.5/§8.3；B1 §6.3；A2 §3.1/§3.2/§3.4；C2 §3.1/§3.2 |
| **F9（filenameSource 阶段分离）** | **已关闭**。B1 拆 `suggestCardFilename`（卡片阶段 `url-basename/caller/fallback`）与 `resolveExecutionFilename`（可 `content-disposition`）；`DownloadJudgeFacts.filenameSource` 只取卡片阶段；C1 只用 A1 卡片阶段字段。 | B1 §3.1/§5.1/§6.1；C1 §4.3/§八.2 |
| **F10（归属键）** | **基本关闭（非阻断澄清）**。B1 `DownloadRunInput.attribution` 由 C1 从会话/任务上下文提供；B1 解析第一个合法 slug，否则合成 `"download"` + `flowIdIsSynthetic`，再经 presenter `attribution` 返回 C1；C1 不写合成值到 `request.created.flowId`。C1 §4.3 目前只写「B1 presenter 携带、C1 不猜」，未明确 C1 向 `DownloadRunInput.attribution` 的输入侧；**C1 修订应补一句**：有真实值则传入，无则省略由 B1 合成（不阻断，合成值方案允许）。 | B1 §3.3/§3.7/§6.3；C1 §4.3/§八.1 |
| **F11（C1 工厂入参）** | **已关闭（形状 A 下）**。B1 `DownloadRequestOptions` 绑定 `projectRoot/roleId/runtime/appVersion/present/takeDownloadDirective`；C1 §3.1 列全并写明 `appVersion` 来自 `app.getVersion()`、presenter 每会话、`takeDownloadDirective` 绑定同一项目既有 `CustomerDirectiveRuntime`。**`takeDownloadDirective` 的访问器属独立条件项（F13）**。 | B1 §3.3/§6.3；C1 §3.1/§六 |
| **F12（dispose）** | **未关闭（C1 阻断/最小修订）**。B1 Revision 1 已提供 `DownloadRequestRuntime.dispose(): Promise<void>`（幂等，中止本运行时在途下载、释放执行槽）；C1 Revision 1 §3.1 仍称「B1 未提供 dispose()，C1 不调用」——与 B1 修订版事实不符。**裁决：C1 修订改为会话结束 `await runtime.dispose()`（B1 已提供），或由 B1 明确将 dispose 标为可选并说明信号-only 清理；二者择一，C1 不得保留「B1 未提供」的错误表述。** | B1 §3.3/§6.3；C1 §3.1/§八.2 |
| **F13（directive-input.ts）** | **裁决：F3 形状 A 不需要改该文件；F11 的 `takeDownloadDirective` 访问器是独立条件项，F4/F5 增补记录不覆盖。** 只读核对 `DirectiveInputController`（`app/desktop/directive-input.ts:142-154`）未暴露 `takeDownloadDirective` 或 `CustomerDirectiveRuntime`；`runtimeFor` 是 `createDirectiveInputController` 内部闭包（`:445`），`createDirectiveInputController` 由 `app/main.ts:558` 创建。C1 若需在同一既有 runtime 上取 `takeDownloadDirective`，必须给 `directive-input.ts` 增加窄访问器（或扩展 controller 接口）；该文件在 `app/desktop/` 目录授权内，但不在团队计划 §4.3 C1 枚举，且 **F4/F5 addendum 只确认 F4/F5，不含此文件**。C1 必须在派发前二选一：①按既有程序另报统筹/沟通，记录 `app/desktop/directive-input.ts` 的闸门 2 写集增补；②改用不修改该文件的等价接线（例如由 B1 提供每调用 resolver，或由 `interface.ts`/`main.ts` 已有对象暴露同一 runtime），并在修订中写明。未闭合前 C1 不得实施预授权接线。 | 代码只读核对；B1 §3.5/§6.3；C1 §3.1/§六/§七；addendum §一 |

- **F14**：C1 既有测试逐条理由表已列、均在 `角色卡/桌面窗口/boundary.md` 单文件条目内；复审接受（非阻断）。
- **F15**：B1 已纠正 `shared-components.md` 实际路径（`角色卡/项目管理/docs/architecture/`，`jsonl-ledger` 组件 10）；`project-rules.md` §一.5 清单滞后为 PM 文档维护项；非阻断。
- **F16**：C2 已补 project-rules 对照表；A1 仍未补专门表（非阻断文档项）。
- **F17**：C2 frontmatter 已改 `proposal-only`/`[download-requests]`；已关闭。
- **F18**：B1 只登记 owner、标注无其他编译消费点；C1 在 `rejection-copy.test.ts` 增加 requester 回归；已关闭。
- **F20**：A2 已删除 `downloadStartsNow`；C2 仍把它写成「A2 冻结的 inert key」并引用 #35/#36/#37（A2 实际为 #38/#39）——**非阻断编辑项**，C2 应改为「A2 不提供 `downloadStartsNow`（G8 B 未选）」并更新编号；C2 行为上不消费该 key，无功能影响。
- **F22**：B1 已在 `takeDownloadDirective` 注释中写明同一快照/`ledgerErrors` 纪律；已关闭。

## 三、写集与边界复审

| 角色 | 复审结果 |
| --- | --- |
| A1 | 写集未变；B-1 + 既有单文件 + `test/runtime-core/`；`session.ts` 0 行透传；无边界外需求。 |
| A2 | 写集仍为 3 文件；Revision 2 仅改 key 集合/计数（§四.1），不扩写集；allowlist 预期不改。 |
| B1 | F4 `governance-judge-verdict.ts` 已由 addendum 确认（目录内、非边界变更）；`test/编排/decision-card.test.ts` 更新在 `test/编排/` 目录授权内；其余写集在 B-2/B-3 与既有私有目录内。无边界外需求。 |
| C1 | 主体写集在 `app/desktop/` 目录、`app/main.ts`、B-4 两个测试；**`directive-input.ts` 仍为独立条件项（F13）**，F4/F5 addendum 不覆盖；F3 形状 A 本身不需要该文件。需按 §二 F13 裁决闭合后才能实施预授权接线。其余无边界外需求。 |
| C2 | F5 `directive-store.ts` 已由 addendum 确认（`app/renderer/` 目录内、非边界变更）；其余写集在 `app/renderer/` 与 `test/桌面UI/` 内。无边界外需求。 |

- **C1 `directive-input.ts` 裁决（明确）**：**F3 方案 2（B1 `list()` epoch 投影）成立时，C1 不应把 `directive-input.ts` 列为 F3 的必需增补**——面板数据由 B1 投影、C1 原样透传即可。但 **F11 `takeDownloadDirective` 访问器**是另一个需求：`DirectiveInputController` 当前不暴露 runtime/该方法，C1 若要复用同一 runtime，必须修改 `directive-input.ts`；这是**独立的闸门 2 写集增补条件**，需统筹/沟通另行记录，或改用不修改该文件的等价接线。两者不可混为一谈。
- **C2 `directive-store.ts`**：addendum §一确认，F5 关闭；C2 可在派发后实施。
- **B1 `governance-judge-verdict.ts`**：addendum §一确认，F4 关闭；B1 可在派发后实施。
- **无 B-1..B-4 边界变更需求**；两处写集增补均为既有目录内、非边界变更，已由沟通记录确认（F4/F5）；C1 `directive-input.ts` 若确需，属**第三项写集增补**，尚未确认。

## 四、A2 / C1 / C2 对齐裁决

### 4.1 A2（阻断，Revision 2 必须）

- **mechanical**：C1/B1 修订版统一为 **三项**（`main.download.card.mechanical.scheme/publicHost/publicIps`）；A2 Revision 1 有 **五项**（多 `credentialsAbsent`/`filenameSafe`）。这两项在 C1 卡片摘要中无消费点，属死 key，且与首次审核「删除死 key」的口径不一致。**裁决：A2 Revision 2 删除 `main.download.card.mechanical.credentialsAbsent` 与 `main.download.card.mechanical.filenameSafe`，保留三项。**
- **final URL**：C1 §4.5/§8.3 明确客户成功系统行 **不含 final URL**（final URL 仅在工具成功回执）；A2 `main.download.notice.completed` 仍含 `{finalUrl}`。若 C1 不传该参数，客户可见占位符/缺值，属功能不一致。**裁决：A2 Revision 2 从 `completed` 删除 `{finalUrl}`，占位符回到 `{host}/{path}/{bytes}/{sha}/{source}`。**
- **保留**：`main.download.notice.gitignoreHint`（F7）、`directiveSource`、`downloadStartsNow` 删除、panel 前缀 `ui.directive.panel.consumer.*`、judge 标签复用 `ui.judge.mode.approval`、文件名来源不显示、`notice.failed` reason+code 客户行/agent-facing action-owner 分离。
- **Revision 2 后计数**：37 key = main 35（card 13 + notice 5 + error 17）+ ui 2；`ui 1090→1092`、`main 591→626`、`shared 62`、`preferences 3`、`总 1746→1783`。测试 `DOWNLOAD_KEYS` 37、家族 13/5/17/2；`downloadStartsNow` 零命中；`completed` 占位符按上。
- **责任/影响**：A2（PM 自身）；A2 派发前必须完成 Revision 2。A1 不受影响；B1/C1/C2 的三项口径已一致。

### 4.2 结论：A2 侧仍有 1 项阻断（F8 子项）

这不是重新打开闸门 1/2：仅 A2 key 集合/文案编辑，写集不变。A2 Revision 2 后需再复审（新哈希）。

### 4.3 C1（最小修订，C1 派发前）

- **dispose（F12）**：B1 Revision 1 已提供 `dispose()`；C1 仍称 B1 未提供。C1 修订二选一：①会话结束 `await runtime.dispose()`（推荐，B1 已提供）；②B1 明确 dispose 可选并说明信号-only 清理，C1 保留不调用但删除错误表述。**C1 派发前闭合**。
- **`downloadFacts` 字段名（F1 编辑项）**：B1 字段为 `downloadFacts`；C1 §4.3/§4.4/§八.2 仍用 `DownloadJudgeFacts`/`facts` 语义名。C1 应逐字用 B1 的 `governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`，避免实现时字段错位（非阻断，但 C1 修订应改）。
- **`attribution` 输入侧（F10 澄清）**：B1 `DownloadRunInput.attribution` 由 C1 提供真实值；C1 §4.3 只写 B1 presenter 携带。C1 应补「有真实 flowId/intentId/taskId 则传入；无则省略，由 B1 合成 `"download"`；合成值不写 `request.flowId`」。非阻断（合成值允许），但需写清。
- **`directive-input.ts`（F13）**：按 §三裁决；C1 若确需修改，须另报统筹/沟通做**独立写集增补**（F4/F5 addendum 不含该文件），或改用等价接线。**C1 派发前闭合**；未闭合不得实施预授权接线。
- **其余**：F1/F2/F3/F7/F8/F9/F11/F14/F18 的 C1 侧已同形；C1 的 W-2/W-3/W-4/manual/preauthorizeWrite/归属修正/信号/测试计划审查接受；无边界外需求。

### 4.4 B1（推荐 approval）

- F1/F2/F3/F4/F6/F9/F10/F15/F18/F22 已关闭；F4/F6 addendum 确认；`dispose()` 已提供；`list()` 形状 A 与 C1/C2 同形；两阶段文件名；最小 `GovernanceJudgeFacts` 构造点明确；测试缝/安全矩阵/审计/epoch 保持。B1 无剩余阻断。
- B1 §6.3 的「C1 不需要改 `directive-input.ts`」仅针对 F3 面板投影；不覆盖 C1 F11 的 `takeDownloadDirective` 访问器（§三已裁决）。

### 4.5 C2（推荐 approval，非阻断编辑项）

- F5 addendum 确认；F3 形状 A 与 B1/C1 同形；F8 panel key 与 judge 复用对齐；F17/F16 已处置；AC-3/14/19/27 覆盖；测试/构建计划接受。
- **非阻断编辑项**：C2 §3.1 仍称「A2 冻结的 `downloadStartsNow` 是 inert key」——A2 已删除该 key；应改为「A2 不提供 `downloadStartsNow`（G8 B 未选），C2 不消费」。C2 §3.2/§五引用 #35/#36/#37 与 A2 实际 #38/#39 不一致；更新编号即可，无功能影响。

### 4.6 A1（推荐 approval，未改）

- 上一轮 `recommend approval`（附 D-1..D-8/R-1/R-2）保持；A1 未改；F4/F5/F6 不要求 A1 写 B1/C2 文件；F6 由 B1 开工第一动作 + A1 最终 typecheck 闭合。非阻断文档项：A1 仍无专门 project-rules 对照表（审核者已代为对照，无冲突）。

## 五、AC-1..AC-29、V1、T3/B0、G1–G8、P1–P9

| 维度 | 复审结果 |
| --- | --- |
| AC-1..29 覆盖/owner | 无 AC 完全无 owner；AC-5/24（F1/F4）与 AC-14/27（F3/F5）已随修订闭合；**AC-3/19/25 仍受 A2 Revision 2 的 mechanical/finalUrl 影响**；其余 AC 的 owner/证据计划保持。 |
| V1 证据计划 | addendum §三确认 V1（1056 / `4a7c66ab…`）路径/版本可派发；AC-1..29 不弱化、G1–G8 A、P1–P9 N/A；E2 按 V1 判定。 |
| T3/B0 | B0 v2（3665/3638/9/18）不变；D1 全量 T3；各角色只跑层内测试；无新增 skip/确定性失败计划。 |
| G1–G8 A | G1 `.gitignore` 提示由 A2 `gitignoreHint` + C1 成功路径消费；G2/G3/G5/G6/G7 与上一轮一致；G8 A 形状 A（旧 domain `consumer:"none"`）由 B1 `list()` + C1 透传 + C2 消费；B/C 未实施。 |
| P1–P9 | 五份提案均声明全部未选、不实施；无提案实施任一；P1–P9 记 N/A。 |
| 错误码/owner、manual、预授权零 `request.*`、测试缝/生产缝 | 保持上一轮结论；B1 修订未改变；F1/F2/F3 修订未改变安全矩阵/审计语义。 |
| 是否重开闸门 1/2 | **否**。F4/F5 为既有目录内写集增补，已由 addendum 确认、非边界变更；C1 `directive-input.ts`（若确需）为第三项独立写集增补，需另行记录，但不改变角色边界/方案口径。无方案实质变化。 |

## 六、复审结论与剩余阻断

### 6.1 总体结论

**`needs revision`**（Revision 1）。不是 `not ready`：五份提案均已修订/写盘，F1–F13 大部分关闭，F4/F5 与 V1 已由 addendum 确认，无边界外/方案实质变化。剩余阻断为 **A2 Revision 2（F8 子项）** 与 **C1 最小修订（F12 dispose + F13 独立写集增补/等价接线）**；其余为非阻断编辑项。

### 6.2 逐提案

| 提案 | 复审结论 | 说明 |
| --- | --- | --- |
| A1 运行时核心 | **`recommend approval`** | 未改；上一轮 D-1..D-8/R-1/R-2 保持；F6 由 B1 开工第一动作 + A1 最终 typecheck 闭合；可在统筹派发后进入 A1。 |
| A2 项目管理 | **`needs revision`（阻断，Revision 2）** | 删除两项 mechanical + `completed` 的 `{finalUrl}`；最终 37 key / 1092/626/62/3=1783；保留 `gitignoreHint`、`downloadStartsNow` 删除、panel 前缀/judge 复用。A2 派发前完成并复审新哈希。 |
| B1 编排 | **`recommend approval`** | F1/F2/F3/F4/F6/F9/F10/F15/F18/F22 关闭；F4/F6 addendum 确认；无剩余阻断。B1 在 A1/A2 冻结后派发。 |
| C1 桌面窗口 | **`needs revision`（最小修订）** | F12：B1 已提供 `dispose()`，C1 修正「未提供」表述并二选一（调用推荐/由 B1 标可选）；F13：`directive-input.ts` 独立写集增补或等价接线，F4/F5 addendum 不覆盖；F1 字段名 `downloadFacts`/F10 `attribution` 输入侧编辑澄清。C1 派发前闭合。 |
| C2 桌面UI | **`recommend approval`（非阻断编辑项）** | F5 addendum 确认；F3 形状 A 同形；F8 key 对齐；仅需修正 `downloadStartsNow`/编号过期引用。C2 在 C1/A2 冻结后派发。 |

### 6.3 剩余阻断与责任

| # | 阻断/条件 | 责任 | 关闭条件 |
| --- | --- | --- | --- |
| R1 | A2 Revision 2：删除 `mechanical.credentialsAbsent`/`filenameSafe` 与 `completed.{finalUrl}`；计数改 37 / 1092/626/62/3=1783 | A2（PM 自身） | 新提案写盘 + 复审新行数/SHA-256；A1 不受影响 |
| R2 | C1 dispose 与 B1 对齐（B1 已提供 dispose；C1 修正「未提供」表述并二选一） | C1 | C1 Revision 2；C1 派发前 |
| R3 | C1 `directive-input.ts` 访问器：独立闸门 2 写集增补（F4/F5 记录不覆盖）或改用等价接线 | C1/统筹/沟通 | 新写集增补记录或 C1 等价方案；C1 派发前 |
| R4 | C1 字段名 `downloadFacts`/`attribution` 输入侧编辑澄清 | C1 | C1 Revision 2；非阻断但同批处理 |
| R5 | C2 `downloadStartsNow`/key 编号过期引用 | C2 | C2 编辑修订；非阻断 |
| R6 | A2 复审（Revision 2）与 A2/C2 计数一致性 | A2/统筹 | Revision 2 后复审；A2 派发前 |

- **可先行派发**：A1、B1 的提案已 `recommend approval`；F4/F5/V1 已确认。按团队计划，A1 可先进入；A2 完成 Revision 2 后与 A1 契约并行；B1 在 A1/A2 冻结后进入；C1/C2 按依赖顺序。C1 的 R2/R3 必须在 C1 派发前闭合；C2 的 R5 可在 C2 实施前编辑处理。
- **非阻断记录**：A1 的 project-rules 对照表缺失（PM/文档项）；C1 的 `downloadFacts`/`attribution` 编辑项；C2 的编号/`downloadStartsNow` 引用；B1 的 `project-rules.md` §一.5 清单滞后（PM 文档项）；`enabledAt` 诊断白名单缺口（PM/共享组件属主）。

### 6.4 自审披露

- A2 为同一项目管理上下文的自有提案；本次复审对 A2 的评估是**自检**，不虚构独立审核人/第二个项目管理角色；A2 的 Revision 2 及后续复审仍按自检披露。
- C1/C2 作为 A2 key 的消费方，未在独立角色上下文提供额外评估；本复审按提案与代码只读核对记录，不声称其同意；若统筹需要，按 `references/proposal-review.md` 在独立角色上下文补评估。
- 复审是建议，不是实施授权、客户闸门或验收结论；A1/A2/B1/C1/C2 的实施仍须统筹派发、冻结声明、V1/IA/独立验收。

### 6.5 声明

- 本次复审只读；未改任何提案、产品/测试代码、边界/角色卡/changelog，未 commit/push。唯一写盘为本审核记录的追加小节。
- 复审使用的新哈希：A1 `84c1148e…`、A2 `37c74edb…`、B1 `291af57c…`、C1 `7a8db507…`、C2 `52a560a5…`；旧哈希（A2 `2f9fb748…`、B1 `c6b3737f…`、C1 `dcdabb12…`、C2 `93f6798b…`）不复用。F4/F5 addendum `aeff744c…`；V1 `4a7c66ab…`。

---

# Revision 2 最终复审（2026-11-04）

> 本节在审核记录既有 501 行（原 340 行 / `503aaf34…` + Revision 1 追加）末尾**追加**；原记录与历史哈希保留、不改写。复审使用最终修订版新哈希；旧哈希不复用。复审仍为只读：未改任何提案/产品/测试/边界/角色卡，未 commit/push。

## 一、复审对象与输入

### 1.1 五份提案（最终版，写盘前实测）

| # | 角色 | 行数 | SHA-256 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 A1 | 427 | `84c1148ead476a6049e82d6318362bd8ffa33c0d12e75273e025b831787df951` | 未改（上一轮已 `recommend approval`） |
| 2 | 项目管理 A2 Revision 2 | 461 | `fe474a934520e117f41b08192f9701462efe253dbda0b76b18bc31884b80065f` | 按 R1 修订 |
| 3 | 编排 B1 Revision 1 | 821 | `291af57c111082913105fd76af0a72a334a7c6fe543a37f1225b0085654dd405` | 未改（上一轮已 `recommend approval`） |
| 4 | 桌面窗口 C1 Revision 2 | 457 | `1ca957f3c5415ae3c110e78f54651b985b30bbc487e2581694590cff0f7a096d` | 按 R2/R3/R4 修订 |
| 5 | 桌面UI C2 Revision 2 | 275 | `ea47756f65765e8cb2db987f511737b23b75825a009ce8c28620aff9fdb2cd4f` | 按 R5 非阻断编辑 |

### 1.2 新增/更新输入

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 闸门 2 写集增补 + V1 确认记录（更新版） | **32** | `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310` | 新增 **一·补（F13）**：`app/desktop/directive-input.ts` 在既有目录授权内、非边界变更；条件：最小暴露面、不改既有面板行为；若 C1 给出不改文件的等价接线可不使用 |
| V1 | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` | 路径/版本已确认，可作派发依据 |
| B0 v2 | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` | T3 3665/3638/9/18；新增确定性失败 0、新增 skip 0 |
| 方案 P1.1 / 团队计划 / 闸门 2 / IA | — | 见原记录 | 未变 |

- 基线 HEAD `c2f1630`；`git status --porcelain -- src app test` 为空（复审写盘前实测）。
- **F4/F5/F13 均已确认**：F4（`governance-judge-verdict.ts`）、F5（`directive-store.ts`）见 addendum §一；F13（`directive-input.ts`）见 addendum **一·补**。三者均在既有目录授权内、非边界变更；F6 顺序见 addendum §二；V1 见 §三。
- **注意**：C1/C2 提案正文仍引用旧版 addendum `28 行 / aeff744c…`（C1 并称「F4/F5 addendum 不覆盖 directive-input.ts」）；更新版为 **32 行 / `000022cd…`** 且已含 F13 补节。该差异为**非阻断编辑项**（见 §四），以更新版 addendum 为准。

## 二、F1–F13 / R1–R6 关闭核对

| 项 | 结果 | 依据 |
| --- | --- | --- |
| A2 R1（mechanical/finalUrl/计数） | **关闭** | A2 Rev2：37 key = main 35（card 13 + notice 5 + error 17）+ ui 2；mechanical 仅 `scheme/publicHost/publicIps`；`completed` 占位符 `{host}/{path}/{bytes}/{sha}/{source}` 无 finalUrl；`gitignoreHint` 保留；`downloadStartsNow` 删除；计数 `ui 1092 / main 626 / shared 62 / preferences 3 = 1783`（key 表逐行核验：37 行唯一、家族 13/5/17/2、zh/en 占位符一致、en-US 零 Han） |
| C1 R2（dispose） | **关闭** | C1 Rev2 §3.1/§4.4 #7/§八.2：`LiveSession.downloadRuntime` + `disposeEntry` `await entry.downloadRuntime?.dispose()`（B1 Rev1 已提供幂等 `dispose()`；失败只诊断、不阻断释放）；删除「B1 未提供 dispose」错误表述 |
| C1 R3（F13 `directive-input.ts`） | **关闭（addendum 确认）** | C1 Rev2 选定方案①：`DirectiveInputController` 增加只读窄访问器 `downloadDirectiveConsumer(projectRoot)`，基于既有 `runtimeFor` 返回同一 `CustomerDirectiveRuntime.takeDownloadDirective`；不新建第二运行时/账本、不复制逻辑、无新 IPC。更新版 addendum **32 行 / `000022cd…` 一·补（F13）** 确认该文件可纳入 C1 写集（条件：最小暴露面、不改既有面板行为）；C1 可在派发后实施。F3 面板数据不需要该文件 |
| C1 R4（字段名/归因） | **关闭** | C1 Rev2 逐字对齐 B1：`governanceFacts`/`downloadFacts`/`attribution`（含 `flowIdIsSynthetic`）/`factsAvailable`；`DownloadRunInput.attribution` 有真实值则传入、无则省略由 B1 合成 `"download"`；合成值不写 `request.flowId`/`metadata.flowId`；当前会话无 flow/task 字段，默认省略（不猜） |
| C1 F3 形状 A | **关闭/同形** | B1 `list()` epoch 投影（旧 domain `consumer:"none"`、新 `"download"`）；C1 原样透传、不判 epoch、F3 不改 `directive-input.ts`；C2 消费 `"download"`/`"none"+domain`；三方同形 |
| C2 R5（downloadStartsNow/key 编号） | **关闭（消费/测试层面零引用）** | C2 Rev2 全文改为「A2 最终 37 key；`downloadStartsNow` 不存在于 A2 集合（G8 B 未选），C2 不消费、不引用」；测试只断言两个 ui key 并断言该 key 不存在/不消费；不再把它列为 A2 key 或 key 编号。**文本中仍有若干「不提供/不消费」的更正说明与一条不存在断言**（非消费）；若统筹要求字面零命中，C2 可在实施前编辑删除，不影响契约 |
| C2 F5 / F3 | **关闭** | F5 `directive-store.ts` 已由 addendum §一确认（目录内、非边界变更）；F3 形状 A 三方同形；C2 只消费两个 ui key |
| F4 / F6 | **关闭/保持** | F4 addendum §一确认；B1 §2 #26 条件已满足。F6 R1 顺序见 addendum §二；B1 开工第一动作补 `run-role.ts` 一行 + 更新 `decision-card.test.ts`；A1 最终 typecheck |
| F1/F2/F7/F8/F9/F10/F11/F14/F18/F22 | **保持关闭** | 上一轮 Revision 1 已关闭；A2 Rev2/C1 Rev2/C2 Rev2 未使其失效；C1 的 dispose/字段名修订进一步对齐 |
| F12/F13/F20 | **关闭** | F12 见 C1 R2；F13 见 C1 R3 + addendum；F20 `downloadStartsNow` 在 A2 删除、C1/C2 不消费 |

## 三、写集与边界复审

| 角色 | 结果 |
| --- | --- |
| A1 | 未改；B-1 + 既有单文件 + `test/runtime-core/`；无边界外需求。 |
| A2 | 仍为 3 文件；Rev2 只改 key 集合/计数/文案，不扩写集；allowlist 不改。 |
| B1 | F4 文件由 addendum 确认；`run-role.ts`/`decision-card.test.ts` 在写集内；其余 B-2/B-3/既有私有目录；无边界外需求。 |
| C1 | 主体写集在 `app/desktop/`、`app/main.ts`、B-4 两个测试；**F13 `directive-input.ts` 已由更新版 addendum 确认**（第三项写集增补，非边界变更）；C1 可在派发后实施；无边界外需求。 |
| C2 | F5 `directive-store.ts` 已由 addendum 确认；其余 `app/renderer/` + `test/桌面UI/`；无边界外需求。 |

- **C1 `directive-input.ts` 最终裁决**：F3 形状 A 不需要该文件；F13 的 `takeDownloadDirective` 窄访问器是独立需求，更新版 addendum 已按「最小暴露面、不改既有面板行为」确认；C1 选定方案①（同一 runtime 的窄访问器）符合 addendum 条件；未发现新增边界/权限/IPC。
- **F4/F5/F13 均为既有目录内写集增补，非 B-1..B-4 边界变更**；无重开闸门 1/2 的实质变化。

## 四、非阻断编辑项（不影响 recommend approval）

1. **C1 的 addendum 引用过期**：C1 Rev2 §1.1/§六/§八.2/§十五 仍写旧版 `28 行 / aeff744c…`，并称「F4/F5 addendum 不覆盖 `directive-input.ts`」；更新版为 **32 行 / `000022cd…`** 且含 F13 补节。**C1 实施前/完成报告中应更新引用**；不改变 C1 契约或写集。
2. **C2 的 addendum 引用过期**：C2 Rev2 §3.2/§四/§七/§八.3/Revision 2 仍写 `28 行 / aeff744c…`；F5 仍被更新版 addendum 确认，**C2 实施前更新引用即可**。
3. **C2 的 `downloadStartsNow` 字面提及**：C2 实现/测试无 key 消费；文本中的「不提供/不消费」更正说明与一条不存在断言不是 key 引用。若统筹要求字面零命中，C2 可在实施前删除这些提及；不影响结论。
4. **A1 的 project-rules 对照表**：仍未补专门表（审核者已代为对照，无冲突）；非阻断 PM 文档项。
5. **B1 的 `project-rules.md` §一.5 清单滞后**：`shared-components.md` 实际存在、`jsonl-ledger` 已登记组件 10；PM 文档维护项；非阻断。

## 五、AC-1..AC-29、V1、T3/B0、G1–G8、P1–P9

| 维度 | 结果 |
| --- | --- |
| AC-1..29 覆盖/owner | 无 AC 完全无 owner；AC-5/24（F1/F4）与 AC-14/27（F3/F5）已关闭；AC-3/19/25 随 A2 Rev2 的 37 key/三项 mechanical/无 finalUrl 对齐；其余 AC 的 owner/证据计划保持。 |
| V1 证据计划 | V1（1056 / `4a7c66ab…`）路径/版本已由 addendum 确认；AC-1..29 不弱化、G1–G8 A、P1–P9 N/A；E2 按 V1 判定。 |
| T3/B0 | B0 v2 不变（3665/3638/9/18）；D1 全量 T3；各角色只跑层内测试；无新增 skip/确定性失败计划。 |
| G1–G8 A | G1 `.gitignore` 提示由 A2 `gitignoreHint` + C1 成功路径消费；G2/G3/G5/G6/G7 保持；G8 A 形状 A（B1 `list()` 投影 + C1 透传 + C2 消费）；B/C 未实施。 |
| P1–P9 | 五份提案均声明全部未选、不实施；P1–P9 记 N/A。 |
| 错误码/owner、manual、预授权零 `request.*`、测试缝/生产缝 | 保持上一轮结论；C1 Rev2 的 dispose/字段名修订未改变安全矩阵/审计语义。 |
| 是否重开闸门 1/2 | **否**。F4/F5/F13 均为既有目录内写集增补，已由更新版 addendum 确认、非边界变更；无方案实质变化。 |

## 六、最终结论与派发

### 6.1 总体结论

**`recommend approval`**。F1–F13 的实质性阻断/条件均已关闭；F4/F5/F13 写集增补均已由沟通 addendum（更新版 32 行 / `000022cd…`）确认；V1 已确认；A2/C1/C2 的最终契约与 B1/A1 同形；无边界外需求、无重开闸门 1/2 的实质变化。C1/C2 的旧 addendum 引用为**非阻断编辑项**（以更新版 addendum 为准）。

### 6.2 逐提案

| 提案 | 结论 | 说明 |
| --- | --- | --- |
| A1 运行时核心 | **`recommend approval`** | 未改；D-1..D-8/R-1/R-2 保持；F6 顺序不变。 |
| A2 项目管理 Rev2 | **`recommend approval`** | 37 key / 1092/626/62/3=1783；mechanical 三项；completed 无 finalUrl；gitignoreHint 保留；downloadStartsNow 删除；与 C1/C2 引用一致。 |
| B1 编排 Rev1 | **`recommend approval`** | F1/F2/F3/F4/F6/F9/F10/F15/F18/F22 关闭；F4/F6 addendum 确认；无剩余阻断。 |
| C1 桌面窗口 Rev2 | **`recommend approval`** | R2 dispose/R3 F13/R4 字段关闭；F3 形状 A；F13 addendum 确认；仅需实施前更新 addendum 引用（非阻断）。 |
| C2 桌面UI Rev2 | **`recommend approval`** | F5/F3/F8 关闭；37 key 口径；downloadStartsNow 无消费；仅需实施前更新 addendum 引用/可选清理字面提及（非阻断）。 |

### 6.3 派发节点

- **A1/A2 可派发**：A1、A2 均已 `recommend approval`；F4/F5/F13 与 V1 均已确认；A1/A2 契约可并行冻结（A1 先落 Model/工具，A2 落 key；A1 最终 typecheck 按 F6 R1 在 B1 补一行后重跑）。
- **B1 在 A1/A2 冻结后派发**：B1 Rev1 已 `recommend approval`；开工第一动作 F6 一行 + `decision-card.test.ts`；F4 verdict 分支已确认，可在派发后实施。
- **C1/C2 按依赖派发**：C1 在 A1/B1/A2 冻结后；C1 F13 `directive-input.ts` 已由 addendum 确认，可在 C1 派发后实施；C2 在 C1 卡片/面板形状冻结后；C2 F5 `directive-store.ts` 已确认，可在 C2 派发后实施。
- **非阻断前置**：C1/C2 在各自派发前更新 addendum 引用到 32 行 / `000022cd…`；C1 删除「F4/F5 addendum 不覆盖」的过期表述；C2 可选清理 `downloadStartsNow` 字面提及。上述不影响契约/派发节点。

### 6.4 自审披露与声明

- A2 为同一项目管理上下文的自有提案；本次最终复审对 A2 的评估是**自检**，不虚构独立审核人/第二个项目管理角色；A2 的 Revision 2 及最终复审按自检披露。
- C1/C2 作为 A2 key 的消费方，未在独立角色上下文提供额外评估；本复审按提案与代码只读核对记录，不声称其同意；若统筹需要，按 `references/proposal-review.md` 在独立角色上下文补评估。
- 本复审是建议，不是实施授权、客户闸门或验收结论；实施仍须统筹派发、冻结声明、V1/IA/独立验收；不授权提交/推送/合并/发布。
- 本次复审只读；未改任何提案/产品/测试/边界/角色卡/changelog，未 commit/push。唯一写盘为本审核记录的追加小节。
- 最终复审使用的新哈希：A1 `84c1148e…`、A2 `fe474a93…`、B1 `291af57c…`、C1 `1ca957f3…`、C2 `ea47756f…`；旧哈希（A2 `37c74edb…`、C1 `7a8db507…`、C2 `52a560a5…`）不复用。F4/F5/F13 addendum `000022cd…`（32 行）；V1 `4a7c66ab…`。
