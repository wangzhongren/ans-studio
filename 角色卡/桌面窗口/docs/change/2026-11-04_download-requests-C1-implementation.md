---
id: download-requests-c1-implementation
type: change
title: 变更记录：下载文件申请 C1 实施（桌面窗口：能力位/卡片组装/判断透传/生命周期）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 按 C1 P1 提案 Revision 2 完成桌面接线并由收尾上下文重跑全部 C1 检查（typecheck 0、新测试 16/16、桌面 57 文件 562/562、i18n guard violations=0）；未 commit/push
  - date: "2026-11-04"
    kind: updated
    summary: i18n guard 首跑发现 download-request.ts 兜底回执硬编码中文（1 违规），按 C1 写集最小修复为 A2 key 组装后全量重跑通过
---

# 变更记录：下载文件申请 C1 实施（桌面窗口）

- **任务 / flowId / 档位**：`2026-11-04-download-requests` / `download-requests` / **T3**。
- **角色 / 节点**：桌面窗口（固定角色，独立收尾上下文）/ 团队计划 §5.3 **C1**（桌面主进程接线）。
- **状态**：**`implemented-unverified`**。实现与 C1 可执行的验证已完成、证据已采集；**未验收、未 commit/push**；
  不替代 C2 渲染、D1 跨层/T3 全量、D2 真实 Electron 截图、E1/E2。真实运行/截图由 D1/D2 负责。
- **基线 [事实]**：分支 `feat/download-requests`，HEAD `604c362162744693e72961522fee4f3739159201`
  （`feat(download): A1/A2/B1 candidates` `3c88fae` + merge `origin/main` `f0adb49`，含 PR #59 `edfbab0` /
  PR #60 `332e062`；`604c362` 为 B1 补验提交）。本工作树 `git status --porcelain -- src app test`
  开工即为下列 C1 写集（8 项，无其他角色改动）；`git diff --cached --name-only` 为空。

## 1. 输入与版本（只读实测，与派发哈希逐字一致）

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| C1 P1 提案 Revision 2 | 457 | `1ca957f3c5415ae3c110e78f54651b985b30bbc487e2581694590cff0f7a096d` |
| B1 实施记录（编排） | 153 | `d8f3c8163497dec15c308e128d0a633d5951615964ee64a3376477fd12eaee06` |
| A2 实施记录（i18n，含合并基线冻结 v2） | 162 | `2dc48070172c0c12ba22e5a5df16cd37175f9b6cdfd9743e8022e62971a9d7f2` |
| 闸门 2 写集增补 F4/F5 + **F13** + V1 确认 | 32 | `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310` |
| B0 基线 v3（对照） | 213 | `1242c51496f03560cdcbffe48956077873c9944b9566b1f7ae45af80e966c30b` |

- F13 已由沟通确认（`000022cd…` §一·补）：`app/desktop/directive-input.ts` 允许最小窄访问器，
  条件为「改动限于最小暴露面、不改变既有指令面板行为语义」。C1 按方案①实施（见 §4.4）。

## 2. 写集（8 项 = 5 改 + 3 新；另本角色文档 2 项）

| 路径 | 动作 | 行数 | 内容 |
| --- | --- | --- | --- |
| `app/desktop/download-request.ts` | 新增 | 381 | 卡片组装 `buildDownloadCardRequest`、结果三态映射 `toDownloadApprovalOutcome`、能力包装 `createRequestDownloadCapability`、best-effort 系统行（含 G1 `.gitignore` 提示）；**不判定 URL/DNS/IP/文件名/上限/重定向，不读账本，不生成 `downloadId`** |
| `app/desktop/session.ts` | 改 | 9072 | W-1/W-2 能力位与 judge 闭包、每会话 B1 运行时 + presenter + `dispose`、`judgeNotice` 透传、`withRequestLifecycle` 下载归属修正（judge deny）+ `onPresented` 回调 |
| `app/desktop/customer-input.ts` | 改 | 2495 | W-4 `request.download` 透传；下载 manual 全量转客户；`unavailableReason` 防御；`preauthorizeWrite` 排除；`ctx.judgeNotice` 透传；`judgeResultSummary` download 分支 |
| `app/desktop/interface.ts` | 改 | 2757 | `DesktopDeps.createDownloadRuntimeFn?`/`downloadAppVersion?`；`openRoleSession.requestDownload?` 镜像；SessionManager 注入工厂/appVersion/`getDownloadDirectiveConsumer`（同一 runtime 窄访问器）；无每项目缓存/无 Interface dispose |
| `app/desktop/directive-input.ts` | 改（F13 条件增补） | 833 | `DirectiveInputController.downloadDirectiveConsumer(projectRoot)` 窄访问器：基于既有 `runtimeFor` 返回同一 `CustomerDirectiveRuntime` 的 `takeDownloadDirective`；跨项目/无项目 ⇒ undefined |
| `app/main.ts` | 改 | 1230 | `downloadAppVersion: app.getVersion()`（G8 epoch 元数据）；通道/开关/暂停语义零改动 |
| `test/桌面应用/download-request.test.ts` | 新增（B-4） | 573 | 8 例：卡片字段/归属/judgeContext 映射；三态映射；能力回执/信号/G1；SessionManager 卡片路径；预授权零卡零 `request.*`；一项目一卡排队；`preauthorizeWrite` 排除；dispose |
| `test/桌面应用/download-decision.test.ts` | 新增（B-4） | 461 | 8 例：W-2/W-4 judge 可达与 approve；judge deny 归属；manual 转客户；`unavailableReason` 防御；开关关/single；项目角色仍无 `customer_input`；同指纹重复 deny |
| `角色卡/桌面窗口/docs/change/2026-11-04_download-requests-C1-implementation.md` | 新增 | 本文件 | 实施记录 |
| `角色卡/桌面窗口/docs/change/2026-11-04_download_requests-C1-evidence/` | 新增 | 17 项 | 原始日志/补丁/哈希/索引（§8） |

- **未写**：`src/**`（A1/A2/B1 属主，工作树无改动）、`app/renderer/**`、`app/desktop/i18n.ts`（未改，
  只消费既有 `mainT` 与 A2 key）、`app/preload.cjs`（**零改动、无新 IPC**，复用
  `session:operator-request/response/judge`）、`package.json`/锁/构建配置、其他角色/边界/changelog/治理文档。
- `app/desktop/directive-input.ts` 的改动仅新增只读访问器（+import 类型）；`list()` 面板行为逐字未变
  （仍为 `result.approval`/`result.decision` 原样透传，`directive-input.ts:739-740`）。

## 3. 验证（本收尾上下文重跑；原始日志见 `...-C1-evidence/`）

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0**（无输出） | `01-typecheck.log` |
| `node --test test/桌面应用/download-request.test.ts test/桌面应用/download-decision.test.ts` | **exit 0**；**tests 16 / pass 16 / fail 0 / skipped 0**（duration ≈395ms） | `02-new-tests.log` |
| `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` | **exit 0**；**57 文件 / tests 562 / pass 562 / fail 0 / cancelled 0 / skipped 0**（≈73.9s） | `03-desktop-suite.log`；文件清单 `08-desktop-test-files.txt` |
| `node --test test/项目管理/shared/i18n-guard.test.ts` | **exit 0**；6 tests / 6 pass；`[i18n-guard] scanned=137 allowlisted=22 violations=0` | `04-i18n-guard.log` |
| 开工/收尾 `git status --porcelain -- src app test` | 均恰为 C1 写集 8 项（5 M + 3 ??） | `00-status-src-app-test.txt`、`09-close-status.log` |
| `git diff --cached --name-only` | 空（未暂存） | `00-staged.txt`、`09-close-status.log` |

- **B0 v3 对照**：`test/桌面应用/**` = 55 文件 / 546 tests / 546 pass / 0 fail / 0 skip
  → 本候选 **57 文件 / 562 / 562 / 0 / 0**；增量恰为 B-4 两个新文件 16 例；
  **新增确定性失败 = 0、新增 skip = 0**。
- **i18n 修复披露（诚实记录）**：guard 首跑 **exit 1**，唯一违规
  `app/desktop/download-request.ts:248:29 未下载`——能力包装 catch 兜底回执硬编码中文。
  已在 C1 写集内最小修复：改用 A2 冻结 key 组装
  `mainT("main.download.notice.failed", { code:"download-unavailable", reason: mainT("main.download.error.unavailable") })`；
  **未新增 i18n key、未改 allowlist、未改 `src/**`**。修复后 typecheck/新测试/桌面全量/guard 全部重跑（上表即修复后结果）。
  修复前观测见 `04a-i18n-guard-before-fix.note.txt`（`scanned` 136→137 为新增文件进入扫描面，`allowlisted` 22 不变）。
- 既有精确测试按提案 §10.2 全量覆盖：`decision-service.test.ts`/`run-change-entry.test.ts`/`version-decision.test.ts`
  （PR #58 回归）、`write-safety.test.ts`（PR #60 治理写卡客户主权）、`operator-channel`/`pending-card-restart`/
  `acceptance-return-card`/`run-pin`/`directive-input`/`session`/`interface` 均在 57 文件套件内通过，**未改任何既有断言/未加 skip**。
- `test/桌面应用/session.test.ts` 不存在于本树（陈旧边界条目）；SessionManager 断言放入两个新文件。
- 未跑 `typecheck:renderer`/`build:renderer`/Electron/E2E（C1 未触渲染面；D1/D2 负责）。

## 4. C1 接线核对（grep/diff 原文见 `07-wiring-anchors.log` 与 `05-diff-*.patch`）

### 4.1 W-1 每会话能力位（`session.ts`）

- 能力可用判据（`downloadCapable`，`session.ts:2867-2872`）：`createDownloadRuntime`、`downloadAppVersion`、
  **窗口级** `deps.customerInput`、`getDownloadDirectiveConsumer(projectRoot)` 四者齐备；缺一 ⇒ 不注入
  （`request_download` 工具结构性不存在，fail-closed）。
- 每会话构造 B1 运行时 `createDownloadRequestRuntime({ projectRoot, roleId, runtime, appVersion, present, takeDownloadDirective })`
  （`session.ts:2969`），并包装为 `RequestDownloadFn`（`createRequestDownloadCapability`，绑定会话
  `lifetimeSignal` + best-effort `emitDeliveryNote`）。
- 注入 `openRoleSession({ ..., requestDownload })`（`session.ts:3034`）；全部非判断会话（项目角色与内置治理角色）适用；
  判断会话/CLI 不经该路径。项目角色 `customerInput` 注入判据**未变**（`session.ts:2631`：
  `role.builtIn === true ? this.deps.customerInput : undefined`）——仍无 `request_confirmation`。

### 4.2 W-2 判断闭包（不打开 `customer_input`）

- `session.ts:2874`：`governanceModel === "trio" && (customerInput !== undefined || downloadCapable) && createGovernanceJudge !== undefined`。
- 仅下载可用的项目角色新增 judge 闭包；`buildCustomerInputContext`（含 `judgeNotice` extras）复用；构造失败清空 fail-closed。
- 结构证据：`download-decision.test.ts`「项目角色仍无 request_confirmation」；全套件含 PR #58/#60 回归。

### 4.3 W-3 卡片组装与 judgeContext（`download-request.ts`）

- `buildDownloadCardRequest`：`kind:"confirm"`、`cardKind:"download"`；title/preview 全部 `mainT` + A2 key
  （role/purpose/url/host/resolvedIps/resolvedIpsTruncated/filename/sizePolicy/redirectPolicy/mechanical 三项）。
- `metadata.judgeContext` 仅当 `factsAvailable === true` 且 `governanceFacts`/`downloadFacts`/`attribution` 齐备时设置；
  字段**原样**映射 `facts`/`download`/`flowId`/`toolCallId?`/`turnId?`/`intentId?`；**不构造 `unavailableReason`**。
- `attribution.flowIdIsSynthetic === true` ⇒ 不写 `request.flowId`/`metadata.flowId`；真实 flowId 才写。
- `factsAvailable:false`（或事实缺失）⇒ 省略整个 `judgeContext` + `judgeNotice`（`main.download.error.factsMissing`）直接客户卡。
- `downloadId` 只消费不生成：`grep downloadId app/desktop/*.ts app/main.ts` 仅注释命中。

### 4.4 W-4 与 manual / unavailableReason / 预授权（`customer-input.ts`）

- W-4：`planJudge` 仅当 `cardKind==="download"` 且 `judgeContext.download` 存在时 `request.download = judgeContext.download`（`:1280`，原样引用）。
- 下载 manual 分支（`:1553`，在 `aborted` 早退之后、`switch-off` 之前）：**全部 manual**
  （timeout/parse-failed/not-recommended/group-mismatch/row-failed/switch-off/ledger-unavailable/`download-facts-missing`）
  一律 `escalateJudgeOutcomeToCustomer(..., "unverifiable")`——原卡 + `judgeNotice` 转客户，不 auto-rework、不自动拒绝；
  deny 仍按 approval 组既有语义（`download-decision.test.ts` deny/重复 deny 用例）。
- `unavailableReason` 防御（`:1906`）：下载卡构造 `manualOutcome(plan, "ledger-unavailable", reason)` 转客户，
  **不 `markAutoRejected`、不 `settleActive(declined)`**；其他卡种逐字不变。
- `preauthorizeWrite` 显式排除（`:2091`）：`if (req.cardKind === "download") return undefined;`——
  即使卡面/元数据注入 `paths`/`writeBoundary` 也不会被写预授权 accept/reject（T 用例覆盖）。
- `ctx.judgeNotice` 透传（`:2211`）：非空才写 `OperatorRequestPayload.judgeNotice`（既有字段）。

### 4.5 presenter / 生命周期 / 归属（`session.ts`）

- presenter 在 `downloadRuntime` 创建前定义：`buildDownloadCardRequest` → `requestIdFor` → `withRequestLifecycle`
  （**原始通道 = 窗口级 `deps.customerInput`**，避免双生命周期；buildContext = `buildCustomerInputContext`）。
- `hooks.onPresented({ requestId })` 只由 `withRequestLifecycle` 的 `onPresented` 生命周期回调触发一次
  （客户路径：`markPresented("customer")` 后；judge 路径：`markPresented("judge")` 后）；未呈现（aborted/占位失败）不回调、不伪造。
- 信号：能力侧 `AbortSignal.any([metadata.signal, 会话 lifetime])` 传给 `runtime.download`；B1 将其并入
  `present` 请求的 `signal`（B1 `download-request.ts:584-590`）；presenter 再与会话 `interactionState.lifetime.signal` 合并。
  关窗沿既有 `rejectAllPending` + `disposeEntry`（lifetime/turn abort）fail-closed。
- 归属修正（下载卡限定，`session.ts:4429-4471`）：`judgeOrigin = operatorId.startsWith("judge:")`；
  `downloadJudge = cardKind==="download" && judgeOrigin`；`resolvedByJudge = judged || downloadJudge` 用于
  presented 判定、`by`、通知文案；其他 cardKind `resolvedByJudge === judged`，行为逐字不变（AC-21）。
- 结果映射 `toDownloadApprovalOutcome`：answered confirmed→approved；answered unconfirmed/declined→declined；
  `initiator-aborted`（未呈现）→aborted；其余→unavailable；`by` 只从 judge 审计/operatorId 事实判定。
- `dispose`（`session.ts:1662-1678`）：`disposeEntry` 在 abort 后 `await entry.downloadRuntime?.dispose()`（幂等），
  失败仅诊断 `download.runtime.dispose.failed`，不阻断会话释放。

### 4.6 F3 面板数据 / F13 访问器 / G1 提示 / PR 回归

- **F3 形状 A（原样透传）**：`directive-input.ts:739-740` 将 B1 `list()` 的 epoch-aware
  `approval`/`decision` 原样返回；C1 不判 epoch、不比较时间、不读 `download-consumer.json`；`downloadStartsNow` 不消费。
- **F13**：`directive-input.ts:161` 接口 + `:826` 实现——`downloadDirectiveConsumer(projectRoot)` 复用
  `runtimeFor(projectRoot)`（同一 `CustomerDirectiveRuntime`/账本），跨项目/无当前项目 ⇒ undefined。
  Interface 经 `getDownloadDirectiveConsumer` 传给 SessionManager（`interface.ts:1975`）。
- **G1 A**：成功路径（含预授权成功）追加 `mainT("main.download.notice.gitignoreHint")`
  （`download-request.ts:319`）；失败路径不提示；不自动修改 `.gitignore`。
- **回执**：成功 = `main.download.notice.completed`（host/path/bytes/sha/source，**无 finalUrl**）+ G1 提示；
  失败 = `main.download.notice.failed` + `main.download.error.*`（客户系统行只显示 reason+code）；投递失败只诊断。
  预授权成功以 `completed` 的 `审批来源：审批指令 #id`（`main.download.notice.directiveSource`）如实标注来源；
  A2 的 `directiveAllowed` key 不单独发系统行（实施选择，见 §7 披露）。
- **PR #60**：治理写卡（appointment-write）排除逻辑未触碰（`customer-input.ts:1224/1390/1676` 区域不在 C1 diff 内），
  全套件含「治理写卡客户主权（会话级 a/b）」用例通过。
- **PR #58**：`isApplicationDecisionReservedForCustomer`/`tryAutoSelectDecision` 函数体不在 C1 diff 内
  （`customer-input.ts:324/1673` 仅上下文），`decision-service`/`run-change-entry`/`version-decision` 回归通过。

## 5. 候选哈希（写盘后实测）

| 路径 | 行数 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `app/desktop/download-request.ts` | 381 | `0604ac0ccd74264e76c7bff475b82f544310a61d` | `7351eab8bb7765d933a17ae9f73e28426cc6345d39ea75b0b6ec66927e6af767` |
| `app/desktop/session.ts` | 9072 | `65cee0680383a6cd178c64b0b45c8370eb89b712` | `5311cb75b4490be1143f126e5d4b954916ac294a5b432775beb1bee3b3ef9705` |
| `app/desktop/customer-input.ts` | 2495 | `d98e1b5562066c9958d1b74d183cb2d4fa9f8688` | `daf397cec0398889e546149c27bbf153f0efdd070e31d49a34be2de4270fc893` |
| `app/desktop/interface.ts` | 2757 | `109fcf4dd8ea981b5b733371cbd61aca60a0ceeb` | `2d13c972e0c698c93f28dfe65dc7175b1bab6ed1c5c022c9143ae176069a1116` |
| `app/desktop/directive-input.ts` | 833 | `c79c7c346eaf405c48f9d165801975ffdb349951` | `71518cd5f0746a611bbc7f0207ba7aa06cc10dcd398c83da806b69889fb8bee1` |
| `app/main.ts` | 1230 | `a36e19e610d6db13f3d822078999379aabd51599` | `f25dd37b88ce1afa9b5c2752ce2982b035b9106f26dab2187e482a93c6ff8070` |
| `test/桌面应用/download-request.test.ts` | 573 | `8c4c442bf54930d49c45262ae7398cdf298d2d55` | `4625676b63b82d4986c1889e1be946235499244cab96c9a7a9c4e20821e9b37a` |
| `test/桌面应用/download-decision.test.ts` | 461 | `96cbb2051d509515f339b692c9c3951d53aed016` | `96dd5716fd2876b069b137ff2f4032a4fafb874114887c76e9db73fb08e9a562` |

- 逐文件明细（含行数）：`06-candidate-hashes.txt`；`git diff --stat`：5 改文件 `+239/-10`；3 新文件未跟踪。
- `git diff --cached --name-only` 空；HEAD 未变（`604c3621…`）。

## 6. 冻结声明（C1 退出，`implemented-unverified`）

```text
C1-download-requests-desktop freeze v1 (C1 proposal Revision 2)
| baseline HEAD: 604c362162744693e72961522fee4f3739159201
| role/node: 桌面窗口 / C1（Interface 层：卡片组装 + 能力位包装 + 回执投影）
| capability: request_download 仅当 createDownloadRuntime + downloadAppVersion + 窗口 customerInput
|   + 同一项目 takeDownloadDirective 四者齐备时按会话注入；缺一 ⇒ 工具不存在（fail-closed）
| card: kind=confirm, cardKind=download；title/preview 全 mainT + A2 key；
|   judgeContext 原样映射 B1 governanceFacts/downloadFacts/attribution/factsAvailable；
|   factsAvailable=false ⇒ 省略 judgeContext + judgeNotice；合成 flowId 不写 request.flowId/metadata.flowId
| runtime: 每会话一份 createDownloadRequestRuntime(projectRoot,roleId,runtime,appVersion,present,takeDownloadDirective)；
|   disposeEntry await dispose()（幂等、失败只诊断）；downloadId 由 B1 生成，C1 只消费
| judge: W-2 仅对下载可用项目角色扩 judge 闭包（不打开 customerInput/request_confirmation）；
|   W-4 仅 download 卡透传 request.download；下载 manual 全部转客户（不 auto-rework）；
|   unavailableReason ⇒ 客户卡（不 markAutoRejected）；judge deny 归属 by=judge + presented.to=judge
| write-preauthorization: preauthorizeWrite 对 cardKind=download 恒 undefined（不得经写边界代批/代拒）
| directive: list()/state 原样透传 B1 epoch-aware 视图（consumer:none/download）；C1 不判 epoch
| F13: directive-input.ts 仅新增只读 downloadDirectiveConsumer(projectRoot)（同一 CustomerDirectiveRuntime）
| notices: completed(无 finalUrl)+gitignoreHint（成功含预授权）；failed+error.*；best-effort 不翻转结果
| i18n: 只消费 A2 冻结 key（37 key 集合不变）；allowlist 22 条不变；download-request.ts 零硬编码中文
| preload: 零改动、无新 IPC（复用 session:operator-request/response/judge）
| checks: typecheck exit 0；新测试 16/16；桌面 57 files/562 tests/562 pass/0 fail/0 skip；
|   i18n-guard scanned=137 allowlisted=22 violations=0；staged 空
| status: implemented-unverified（C1 自检绿；独立验收/C2/D1/D2/E1/E2 未做）
| change rule: 卡片字段/能力位判据/归属语义变化回桌面窗口 C1 并重跑本记录全部检查
```

## 7. 未完成 / 披露 / 交接

- **未做（按团队计划归后续节点）**：C2 渲染（`app/renderer/**`）、D1 跨层与 T3 全量回归、D2 真实 Electron
  运行/截图、E1/E2；C1 不声称整体完成，也不替代 V1 独立验收。
- **A2 `directiveAllowed` key**：预授权成功未单独发该 key 的系统行，而是以
  `main.download.notice.completed` 的「审批来源：审批指令 #id」（`directiveSource`）如实标注；
  如 D1/D2 要求独立行，回 C1 追加（仍在写集内），并重跑本记录检查。
- **W-2 前置**：下载可用的项目角色会构造 judge 闭包（trio + createGovernanceJudge 存在时）；
  项目角色 `customerInput` 仍为 undefined（结构断言+全套件）。
- **`test/桌面应用/download-request.test.ts` 中 B1 stub 的 `message:"未下载"`** 属测试夹具（非扫描面），
  不影响 i18n guard；真实文案来自 A2 key。
- **残余风险**：真实 DNS/网络/跨域重定向/大文件/TLS 由 B1 证据与 D1/D2 覆盖，不在 C1 范围；
  `dispose` 为 B1 幂等语义，C1 只 await。
- **交接**：D1 以本记录 §3/§5 为对照（B0 v3 `55/546/546/0/0` → `57/562/562/0/0`）；
  D2 需真实运行验证卡片呈现/judge 路径/G1 提示；E1 披露 F13 增补使用与 i18n 修复事实。

## 8. 证据索引

- 目录：`角色卡/桌面窗口/docs/change/2026-11-04_download_requests-C1-evidence/`（17 项：16 个被索引文件 + `INDEX.sha256`）。
- `INDEX.sha256`：16 项；自身 SHA-256 `581d1dcbad0bd8dbf4e5c91121b8c769bc87c706dc1f40ce88ddf5ffdfcbe810`（索引自身与本记录不入索引）。
- 内容：`00-opening-state.log`/`00-staged.txt`/`00-status-src-app-test.txt`（开工）、`01-typecheck.log`、
  `02-new-tests.log`、`03-desktop-suite.log`、`04-i18n-guard.log`、`04a-i18n-guard-before-fix.note.txt`、
  `05-diff-tracked.patch` + 3 个新文件补丁、`06-candidate-hashes.txt`、`07-wiring-anchors.log`、
  `08-desktop-test-files.txt`、`09-close-status.log`（收尾：状态 8 项、staged 空、HEAD 不变）。
- 状态：`implemented-unverified`；未 commit/push。
