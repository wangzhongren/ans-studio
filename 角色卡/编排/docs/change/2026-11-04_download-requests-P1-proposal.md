---
id: download-requests-p1-proposal-orchestration
type: change
title: P1 实现提案：下载文件申请——编排 B1（下载 Provider/Service/Pipeline + 指令消费者 + 判断集成 + G8 A epoch）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 写 B1 P1 实现提案（proposal-only；未改产品/测试代码；未 commit/push；发现 1 处团队计划写集遗漏已在 §2 与 §7.4 提案增补）
  - date: "2026-11-04"
    kind: revised
    summary: Revision 1 处置 PM P1 审核 F1/F2/F3/F4/F6/F9/F10/F11/F12/F15/F18/F22（只改本文件；冻结 presenter 判断上下文/每会话生命周期/B1 生成 downloadId/epoch-aware 指令视图；verdict 写集增补条件化；未实施）
---

# P1 实现提案：下载文件申请——编排 B1

- **角色/节点**：编排（Orchestration）/ `2026-11-04-download-requests` / P1（B1 实现提案，T3）/ **Revision 1（处置 PM P1 审核 F1/F2/F3/F4/F6/F9/F10/F11/F12/F15/F18/F22）**。
- **状态**：**proposal-only, no code**——本文件只写提案；未改产品/测试源码、`boundary.md`/`boundary.yaml`/`changelog.md`、`docs/scheduling|acceptance|communication`、其他角色文件；未 commit/push。实现须待 P1 复审 `recommend approval`、A1/A2 冻结后按团队计划进入 B1。
- **标注**：`[事实]` 只读核对；`[设计候选]` 未实现提议；`[交接]` 依赖其他角色冻结件；`[停止项]` 需回报统筹/审核，不得自行扩大。
- **审核依据（只读）**：`角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`（340 行 / `503aaf347be69b67bf7bc0bb6e426151f71f5f4a572dbdc32203ff711be0e530`；结论 `needs revision`）。本修订只回应与本提案相关的阻断/非阻断项；A1/C1/C2/A2 的对应修订由各自上下文完成，**跨角色契约以本文件冻结形状为准**（复审须同一形状）。

## 0. 结论摘要

[设计候选] B1 在既有五层、指令平面与判断平面内落地「下载申请 → 预授权/审批 → 执行 → 审计」：新增 `src/provider/download/`（Node `http`/`https` 流式下载、DNS 解析与连接钉扎、逐跳重定向、超时/上限、文件 sink、下载账本、G8 A epoch 存储）与 `src/service/download/`（URL/IP/同域/文件名/配置策略），新增 `src/pipeline/orchestration/download-request.ts` 作为 Pipeline 公共句柄，并在 `customer-directive.ts` 增加 `takeDownloadDirective` 与 **epoch-aware 面板视图投影**、在 `run-role.ts` 透传 `requestDownload` 能力位并补 `CARD_KIND_ROUTE_HINTS.download`、在 `directive-service.ts` 把 domain 指令的 `consumerOf` 改为 `"download"`、在编排私有 `common/编排/` 登记下载错误码/`RejectionOwner:"requester"`/`UNVERIFIABLE` 与 judge W-6/W-7。B1 **不写** `src/model/**`、`app/**`、`src/common/shared/**`、门禁引擎；Model/工具/运行时契约依赖 A1 冻结（§6.1）。P1–P9 全部不实施；G8 只实现 A。

[修订要点] **F1**：presenter 请求新增 `governanceFacts`（最小 `GovernanceJudgeFacts`）、`downloadFacts`、`attribution`（真实/合成归属键）、`toolCallId/turnId`、`factsAvailable`；全部由 B1 构造，C1 只映射（§3.3）。**F2**：运行时改为**每会话一份**；`downloadId` 由 B1 生成（唯一来源）；presenter 形状冻结为 `present(request, hooks)+onPresented`；新增 `dispose()`（§3.3/§6.3）。**F3**：`CustomerDirectiveRuntime.list()` 冻结 epoch-aware 投影——旧 domain 视图映射 `consumer:"none"`、新指令保持 `"download"`；C1 不改 `directive-input.ts`、C2 只消费冻结字段（§3.5）。**F4**：`governance-judge-verdict.ts` 列为**闸门 2 写集增补条件**，记录前不实施（§2/§7.4）。**F6**：B1 开工第一动作补 `run-role.ts` 的 `CARD_KIND_ROUTE_HINTS.download` 并更新 `test/编排/decision-card.test.ts` 键集；A1 在合并树上重跑最终 typecheck（§6.5）。**F9**：卡片阶段与执行阶段文件名来源分离（§3.1）。**F10**：归属键由 C1 经 `DownloadRunInput.attribution` 提供真实值，B1 统一解析/合成（§3.3）。**F15**：`shared-components.md` 实际路径纠正（§8）。**F18/F22**：`RejectionOwner` 消费点与 `service.list()` 同快照纪律注释明确（§3.4/§6.3）。

[事实/停止项] 只读核对发现**一处团队计划 §4.3 B1 写集遗漏**：`src/common/编排/governance-judge-verdict.ts` 的 `switch (request.cardKind)` 对未知卡种走 `default ⇒ manual("group-mismatch")`，且 `isConfirm` 只认 `appointment-write`。若不加最小加法分支，`cardKind:"download"` 的 judge **approve 会被压成 manual**，AC-24「approve 不被 artifact-missing/未知卡种压制」与 AC-5 无法成立。该文件在编排 Section 1 的 `src/common/编排/` 目录授权内（**不是边界外路径**），但不在团队计划 §4.3 枚举的 B1 文件清单内；按 PM 审核 **F4**，本提案将其列为**闸门 2 写集增补条件**，在统筹/沟通记录增补前**不实施**（§2 #26/§7.4）。

## 1. 事实基线（只读核对，2026-11-04）

### 1.1 基线与输入

| 项 | 值 |
| --- | --- |
| 工作区 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests` |
| 分支 / HEAD | `feat/download-requests` / **`c2f163087aaf11616e5be01f80d305bf6f25af57`**（PR #57、PR #58 均已并入） |
| 产品/测试区 | `git status --porcelain -- src app test` **为空**；`git diff --cached --name-only -- src app test` **为空**（本提案写盘前实测） |
| 团队计划 | `docs/scheduling/2026-11-04_team-plan_download-requests.md` **693 行 / `d9760755e80aa95cd548fd994ca7a1f448321427002eddfe1957397de4efec8e`** |
| 方案 P1.1 | `docs/planning/2026-11-04_design_download-requests.md` 全文 **1018 行 / `de838c26766e26c9bc2124240e253385e8b95a397e0ff663e98e2893e9cea832`**；正文（去末行快照注释）**1017 行 / `2590b5604d17d67fea7526b0895f7fcef70a92c495fb5828e6782d86fef0d26d`** |
| 实施前验收标准 V1 | `docs/acceptance/download-requests-criteria-v1.md` **1056 行 / `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49`** |
| B0 基线 v2 | `角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline-v2.md` **239 行 / `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36`**（T3 3665/3638/9/18；编排套件 60 文件 757/756/1/0；新增确定性失败 0、新增 skip 0） |
| 闸门 2 / IA | `docs/communication/2026-11-04_gate2_download-requests.md` 13 行 / `d4f00c07…`；`2026-11-04_ia_download-requests.md` 13 行 / `3250dfd4…` |
| H1 边界 | `角色卡/编排/boundary.yaml` 已含 B-2（`src/pipeline/orchestration/download-request.ts`）与 B-3（`src/provider/download/`、`src/service/download/`），实测条目在 yaml:37-47；9 个 H1 治理文件未提交修改保留 |
| Node / npm | v24.22.1 / 11.19.1；`node_modules` 已存在（B0 `npm ci`） |

### 1.2 关键现状锚点（以符号/文本为准；设计行号对应 `c8a9394`，已漂移）

[事实] 1) **指令运行时**：`src/pipeline/orchestration/customer-directive.ts`（852 行 / `e48041eaaa3c1a50e478e325937f3f2a0d495e3a9807b629293f973715eef84a`，含 PR #57 +153 行）导出 `CustomerDirectiveRuntime`，现有 `approvalFacts()`/`decisionFacts()`/`takeDirective(req,intent?)`/`applyDecisionDirective`/`revoke`/`list`；`takeDirective` 只匹配 `resource.type==="shell"`（文本锚点：`normalizeCommandText(resource.command) === command && sameDirectory(resource.cwd, cwd)`），deny 优先、standing（`session`/`forever`）优先、同档最新 `seq`，`once` 在返回前 `service.consume`，失败 ⇒ `undefined` 回落既有路径。
[事实] 2) **指令 Service**：`src/service/directive/impl/directive-service.ts` 的 `consumerOf`（文本锚点：`action.resource.type === "shell" ? "shell-gate" : "none"`）对 domain/path 恒 `"none"`；`service.list()` 返回的 `CustomerDirectiveView` **含 `createdAt`**（`toPublicView`），`list()` 同步返回 `{approval,decision,ledgerErrors}`；**`ApprovalDirectiveFact`（`src/model/directive.ts:181-188`）不含 `createdAt`**——G8 A 的 epoch 过滤不能只靠 `approvalFacts()`（§3.4 的落地说明）。
[事实] 3) **能力位**：`run-role.ts` 的 `AdapterCapabilities`（文本锚点：`customerInput?` 起始）逐项注释；`openRoleSession` 输入含 `customerDirective?: CustomerDirectiveRuntime`（文本锚点「每项目客户指令运行时」），能力对象在 `const capabilities: AdapterCapabilities = {...}` 组装；`createRuntimeAdapterFactory` 把能力逐名透传给运行时核心的 `createRuntimeAdapter`（`src/service/runtime/session.ts`，`RuntimeSessionOptions extends Omit<GovernedToolsOptions,...>`，`buildGovernedTools(options.gate, {...options})`）。未注入 ⇒ 字段缺席、工具不注册。
[事实] 4) **判断平面**：`governance-judge-facts.ts::requiredArtifactPaths` 的 `switch (request.cardKind)` 末 `default` 返回 `{paths:[],missing:true}`（未知卡种必 `artifact-missing`）；`governance-judge-verdict.ts` 在 approve 门槛中有**第二个** `switch (request.cardKind)`，末 `default` 返回 `manual("group-mismatch","未知治理卡种")`；approve 末尾 `const isConfirm = request.cardKind === "appointment-write";` 决定返回 `{confirmed:true}` 还是 `{selected}`；`SAFE_MANUAL_REASON_CODES` 不含 `download-facts-missing`。`governance-judge-evidence.ts` 对未知卡种：`isWriteCardKind`/`isDecisionCardKind` 均 false、`artifactRequired` default false——证据包本身不压下载卡。
[事实] 5) **提示词**：`governance-judge-prompt.ts` 的稳定系统提示（`buildGovernanceJudgeSystemPrompt`）按卡种列 rubric；本次请求提示（`buildGovernanceJudgePrompt`）渲染 card view、可选证据包、`request.paths`/`recommendedRoleIds`、`facts`/`turnText`；尚无 `request.download` 渲染与 download rubric。
[事实] 6) **机械拒绝**：`mechanical-rejection.ts` 的 `RejectionOwner = "chief"|...|"customer"|"app"`（无 `"requester"`）；`RULES` 为 `code → {owner,action,retryable,docs}`；`UNVERIFIABLE_REJECTION_CODES` 为「无法核对」唯一来源；`formatMechanicalRejection`/`humanRejection` 输出三段式。该文件已被 `src/provider/runtime/tools.ts`、`src/service/gate/resolve-write.ts`、`app/desktop/*` 只读导入（既有跨角色消费先例）。
[事实] 7) **可复用共享原语**：`src/common/shared/jsonl-ledger.ts`（`appendJsonlLine`/`readJsonlLedger`，追加串行链/轮转/坏行）、`src/common/shared/atomic-write.ts`（`renameReplacingExisting`/`atomicWrite`，Windows `EPERM` 有界重试）、`src/common/shared/path-primitives.ts`（`absRel`/`compareKey`/`isWithinReal`/`realResolveAsync`）、`src/common/shared/diagnostics.ts`（`createDiagnosticLogger`，字段白名单）。**`src/common/runtime-core/fs-write.ts` 是运行时核心私有 common（`guardWriteTarget` 等），按工程法案 §一.6 编排不得导入**——下载目录/真实路径复核改为直接用共享 `path-primitives` 的口径实现（§4.6），不复制也不越角色导入。
[事实] 8) **无既有下载实现**：`src/provider/download/`、`src/service/download/`、`src/pipeline/orchestration/download-request.ts` 均不存在；`rg "requestDownload|request_download|DownloadJudgeFacts" src app` 无命中（A1/C1 尚未落地）。
[事实] 9) **测试基线**：`test/编排/` 60 个测试文件；B0 v2 编排套件 757 tests / 756 pass / 1 既有 Windows symlink EPERM / 0 skip（`shell-authorized-routine.test.ts:184`）；T3 全量 3665/3638/9/18。测试入口为 `node --test "test/编排/**/*.test.ts"`，静态门 `npm run typecheck`（`tsconfig` include `src`/`test`/`app`）。
[事实] 10) **PR #57 重叠**：`customer-directive.ts` +153 行（自然语言解释预填，`interpretDirective`/`buildInterpretedPrefill`）；解释器实际位于 `src/common/编排/directive-interpreter.ts`（419 行 / `c09c2950…`），**不在** G8/预授权语义内。B1 只在同文件**新增** `takeDownloadDirective` 与相关类型，不改 `doSubmit`/解释逻辑；G8 A 的 `createdAt` 门槛对**所有**来源的 domain 指令一视同仁（含自然语言预填创建的），不按来源放宽（同毫秒边界按 §3.4 保守排除）。
[事实] 11) **PR #58 重叠**：仅 `app/desktop/customer-input.ts` + 3 个桌面测试 + 治理文档（B0 §9），不在 B1 写集内；由 C1 合并。
[事实] 12) **设计锚点漂移**：方案 P1.1 行号对应 `c8a9394`；当前 HEAD `c2f1630` 已含 PR #57/#58。本提案全部以符号/文本锚点实施，不以行号作为写入依据（团队计划 §1.5.3 第 4 项、§8.3 #10）。
[事实] 13) **PM 审核相关锚点（只读）**：`run-role.ts:2125` 的 `CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind,string>>` 是穷尽 Record——A1 增 `"download"` 后 B1 必须补 `download` 一行；`test/编排/decision-card.test.ts:36-43` 的 `Object.keys(GOVERNANCE_CARD_GROUP).sort()` 精确键集断言必须同步（F6）。`app/desktop/directive-input.ts:491/721` 的面板数据路径是 `runtimeFor(projectRoot).list()`，C1 把 B1 返回的 `consumer` 原样放入 `directive:list`/`directive:state` 载荷——因此 epoch-aware 视图可在 B1 的 `list()` 内实现，**C1 无需改该文件**（F3 方案 2）。`app/renderer/src/stores/directive-store.ts` 的 `asDirectiveConsumer` 当前严格白名单只接受 `shell-gate`/`decision-card`/`none`（C2 需按 F5 增补 `download` 并由 C2 处理旧指令 `none+domain` 文案；B1 只冻结 `consumer` 取值）。`角色卡/项目管理/docs/architecture/shared-components.md` **实际存在**（`jsonl-ledger` 已登记为组件 10，见该文件 :121）；`project-rules.md` §一.5 的现有组件清单未同步到组件 10（PM 文档维护事项，F15）。

## 2. 精确写集（B1）

> 同一文件同一时间只有本角色一个写入者；不并发写其他角色路径。所有新增源码都在 H1 已确认的 B-2/B-3 与既有私有目录内。

### 2.1 新增（Provider）

| # | 路径 | 内容 |
| --- | --- | --- |
| 1 | `src/provider/download/abstract/download-provider.ts` | 下载执行抽象契约：`HostResolver`/`ResolvedHost`/`PinnedAddress`、`DownloadTransport`/`TransportRequest`/`TransportResult`、`DownloadLimits`（Provider 自有的上限/超时子集，不 import Service 类型）、由 Pipeline 注入的文件名/重定向回调 `planFile`/`onStarted`/`onRedirect`、`DownloadProviderError` 稳定错误对象形状 |
| 2 | `src/provider/download/abstract/download-ledger.ts` | `DOWNLOAD_LEDGER_REL`（`.ans/state/downloads.jsonl`）、`DownloadLedgerEventV1` 判别联合、`DownloadLedger` 接口（`append`/`read`） |
| 3 | `src/provider/download/abstract/download-consumer-epoch.ts` | `DOWNLOAD_CONSUMER_STATE_REL`（`.ans/state/download-consumer.json`）、`DOWNLOAD_CONSUMER_STATE_VERSION=1`、`DownloadConsumerEpochState`、`DownloadConsumerEpochStore` 接口 |
| 4 | `src/provider/download/impl/node-resolver.ts` | Node `dns.promises.lookup(host,{all:true,verbatim:true})` 全量解析、去重、10s 内部超时（`DOWNLOAD_DNS_TIMEOUT_MS=10000`，非环境变量）、`download-dns-failed` 映射；IP 字面量直返 |
| 5 | `src/provider/download/impl/node-http.ts` | Node `http`/`https` 流式传输：自定义 `lookup` 只返回执行时钉扎集合、连接后 `socket.remoteAddress` 复核（含 IPv4-mapped 归一）、逐跳重定向（301/302/303/307/308，≤5 跳，回调决策）、状态码/编码/长度判定、连接/空闲/总超时、`AbortSignal`、无自动重试、`rejectUnauthorized:true` 固定 |
| 6 | `src/provider/download/impl/file-sink.ts` | `<projectRoot>/download/` 目录守卫与创建、单文件名复核、`open(final,"wx")` 占位 + ` (n)` 后缀、同目录 `<final>.<rand>.part`（`wx` 0600）、流式 sha256、`fsync`、`renameReplacingExisting(temp, placeholder)`、失败清理 `.part`/占位、绝不覆盖 |
| 7 | `src/provider/download/impl/jsonl-ledger.ts` | `downloads.jsonl` 追加（复用 `appendJsonlLine`）、读取/坏行/轮转（复用 `readJsonlLedger`）、事件形状校验；追加失败只回诊断、不抛 |
| 8 | `src/provider/download/impl/consumer-epoch-store.ts` | epoch 文件读取/首次创建（`open("wx")` + `fsync`；EEXIST 回读）、`version:1`/`enabledAt` ISO(毫秒)/`appVersion` 校验；不可读/非法 ⇒ `state:"unreadable"` 且**不重写** |
| 9 | `src/provider/download/public/download-provider.ts` | 公共出口：显式 re-export 上述 abstract 类型与生产工厂 `createNodeHostResolver`/`createNodeDownloadTransport`/`createDownloadLedger`/`createDownloadConsumerEpochStore`；不 wildcard、不额外导出 impl 内部辅助 |

### 2.2 新增（Service）

| # | 路径 | 内容 |
| --- | --- | --- |
| 10 | `src/service/download/abstract/download-policy.ts` | `DownloadConfig`（`maxBytes`/`connectTimeoutMs`/`idleTimeoutMs`/`totalTimeoutMs`/`maxRedirects`/执行并发 2）、`NormalizedUrl`、`UrlCheckResult`、`IpDecision`、`DownloadPolicy`（`checkUrl`/`classifyIp`/`isSameHostForRedirect`/`resolveFilename`/`sanitizeFilename`/`boundJudgeFacts`/`resolveConfig`）、文件名来源枚举 |
| 11 | `src/service/download/impl/ip-policy.ts` | IPv4 拒绝清单（`0.0.0.0/8`、`10/8`、`100.64/10`、`127/8`、`169.254/16`、`172.16/12`、`192.0.0/24`、`192.0.2/24`、`192.168/16`、`198.18/15`、`198.51.100/24`、`203.0.113/24`、`224/4`、`240/4`、`255.255.255.255/32`）；IPv6 **正向判定 `2000::/3` + 排除** `2001::/32`、`2001:2::/48`、`2001:10::/28`、`2001:20::/28`、`2001:db8::/32`、`2002::/16`、`3fff::/20`；纯字节解析（无第三方依赖），拒绝 zone id/非法字面量 |
| 12 | `src/service/download/impl/url-policy.ts` | `new URL` 解析、仅 `http:`/`https:`、拒绝 userinfo、host 归一（小写/去尾点/punycode/IPv6 去括号）、端口 1–65535、URL 长度 ≤2048B、同域判定（host 归一相等；`https→http` 降级拒绝；端口不参与相等）、错误消息 URL 去凭据/限长 |
| 13 | `src/service/download/impl/filename.ts` | **F9 两阶段**：`suggestCardFilename`（卡片阶段：`url-basename`/caller/兜底，无 `content-disposition`）与 `resolveExecutionFilename`（执行阶段：`Content-Disposition(filename* 优先于 filename) → URL pathname basename → 申请方建议 → download-<yyyyMMdd-HHmmss>`，source 可含 `content-disposition`）；净化：NFC、控制符、`/ \ < > : " \| ? *` → `_`、首尾空白与尾点/空格、前导点、Windows 保留设备名加 `_`、≤200 UTF-8 字节且 ≤128 字符（扩展名 ≤16）、空名兜底；纯函数 |
| 14 | `src/service/download/impl/config.ts` | 环境变量解析：`ANS_DOWNLOAD_MAX_BYTES`（默认 104857600）、`ANS_DOWNLOAD_CONNECT_TIMEOUT_MS`（15000）、`ANS_DOWNLOAD_IDLE_TIMEOUT_MS`（30000）、`ANS_DOWNLOAD_TOTAL_TIMEOUT_MS`（300000）；非法/非正 ⇒ 默认 + 诊断码；**模型/申请方无入口**；`maxRedirects=5` 为常量 |
| 15 | `src/service/download/impl/download-service.ts` | 组合实现 `DownloadPolicy`：`boundJudgeFacts` 把展示字段（`url` 保留 scheme+host+路径前段、`purpose`）截断到序列化 ≤2048B，**`scheme`/`host`/`resolvedIps`/`mechanical` 等校验字段不截断**；错误码纯映射辅助 |
| 16 | `src/service/download/public/download-service.ts` | 公共出口：显式 re-export `DownloadPolicy` 类型、`createDownloadPolicy(env?)` 工厂与纯函数（无 I/O） |

### 2.3 新增（Pipeline）

| # | 路径 | 内容 |
| --- | --- | --- |
| 17 | `src/pipeline/orchestration/download-request.ts` | 下载申请 Pipeline 公共句柄：`createDownloadRequestRuntime`（生产）/`createDownloadRequestRuntimeForTest`（仅测试装配）；**每会话一份**（绑定 roleId/runtime/present/takeDownloadDirective/appVersion）；校验 → DNS 全量解析 → 策略判定 → 事实（含 presenter 判断上下文）→ 预授权（注入回调）→ 卡片呈现（注入 presenter）→ 并发 ≤2 → 执行（Service + Provider）→ 审计（`downloads.jsonl`）→ 结构化结果；**`downloadId=dl-<uuid>` 由 B1 生成**、模块级每项目并发计数、G8 A epoch 建立/读取、`dispose()` 中止本运行时在途下载、预授权路径不写 `request.*` |

### 2.4 既有文件（本角色授权内）

| # | 路径 | 改动 |
| --- | --- | --- |
| 18 | `src/pipeline/orchestration/customer-directive.ts` | **加法**：`DownloadDirectiveQuery`/`TakeDownloadDirectiveFn` 类型 + `CustomerDirectiveRuntime.takeDownloadDirective(query)`；deny 优先、allow 补足、`once` 先 durable 消费、G8 A `enabledAt` 门槛；**`list()` 增加 epoch-aware 面板投影**（旧 domain ⇒ `consumer:"none"`，新 domain 保持 `"download"`；只读 epoch、不创建）；可选测试缝 `downloadEpochStore?`；不改 `takeDirective`/`applyDecisionDirective`/`doSubmit`/解释逻辑 |
| 19 | `src/pipeline/orchestration/run-role.ts` | `AdapterCapabilities.requestDownload?: RequestDownloadFn`；`openRoleSession` 输入同名可选并透传到 `capabilities`/`createRuntimeAdapter`；**F6 编译解锁：`CARD_KIND_ROUTE_HINTS` 增 `download` 一行**（提示「下载卡只由 request_download 经应用通道发起」）；CLI/判断会话不注入（结构缺席） |
| 20 | `src/service/directive/impl/directive-service.ts` | `consumerOf`：domain（allow/deny）返回 `"download"`；shell 仍 `"shell-gate"`、decision 仍 `"decision-card"`、path 仍 `"none"` |
| 21 | `src/common/编排/mechanical-rejection.ts` | `RejectionOwner` 加法 `"requester"`；`DOWNLOAD_RULES: Record<DownloadErrorCode, RejectionRule>`（类型级穷尽）合入 `RULES`；`UNVERIFIABLE_REJECTION_CODES` 加 `download-facts-missing`；`denied-by-directive` owner=`customer` |
| 22 | `src/common/编排/governance-judge-facts.ts` | W-6：`requiredArtifactPaths` 新增 `case "download": return { paths: [], missing: false }` |
| 23 | `src/common/编排/governance-judge-prompt.ts` | W-7：系统提示新增 download（approval）rubric；本次请求提示渲染有界 `request.download` 与合成归属标注（`flowId==="download"`） |
| 24 | `src/common/编排/governance-judge.ts` | **条件**：预计零改动（`contextProblem` 用 `governanceCardGroup`，A1 加组后通过）；仅当类型/穷尽检查需要时做加法，不改判定行为 |
| 25 | `src/common/编排/governance-judge-evidence.ts` | **条件**：预计零改动（未知卡种 `artifactRequired=false`、不属 write/decision 族）；仅当类型/证据包兼容需要时做加法 |
| 26 | `src/common/编排/governance-judge-verdict.ts` | **闸门 2 写集增补条件（PM 审核 F4；目录内、非边界变更；记录前不实施）**：`case "download"`（approve 要求 `card.kind==="confirm"` + `confirmed:true`，无 selected/pathDecisions）；`isConfirm` 拆分 `isWriteConfirm`/`isDownloadConfirm`，下载 approve 返回 `{confirmed:true}` 且**不带** `paths/pathDecisions`；`SAFE_MANUAL_REASON_CODES` 加 `download-facts-missing` |

### 2.5 新增测试

| # | 路径 | 内容 |
| --- | --- | --- |
| 27 | `test/编排/download-policy.test.ts` | Service：URL/协议/凭据/端口/归一、IPv4/IPv6 判表（含 6to4/Teredo/ORCHIDv2/文档段/整数写法/混合/`::ffff:`/NAT64）、同域/降级、文件名真值表、配置解析、2 KiB facts 截断 |
| 28 | `test/编排/download-provider.test.ts` | Provider：本地 `http`/`https` 服务（真实 socket）、200 成功/原子 rename/占位/重名不覆盖、重定向同域/跨域/降级/跳数/异常 3xx/缺 Location、大小/状态码/编码、连接/空闲/总超时/中止、TLS 自签/过期/主机名不匹配、rebinding/`remoteAddress` 复核、坏账本/轮转 |
| 29 | `test/编排/download-pipeline.test.ts` | Pipeline：事实/卡片字段、预授权 deny/allow/once/session/forever、epoch（旧指令/不可读/同毫秒）、审计归属（卡片 vs 预授权；`request.*` 零写入）、并发 ≤2/`download-busy`、presenter 失败/中止、`run-role` 能力位透传、生产/测试工厂缝隔离结构检查 |
| 30 | `test/编排/download-judge.test.ts` | W-6/W-7：`requiredArtifactPaths("download")`、verdict `case "download"` approve/confirmed、`download-facts-missing` 保留、系统 rubric 与 `request.download` 渲染/合成归属标注、facts ≤2 KiB |
| 31 | `test/编排/fixtures/download-tls/`（夹具） | 自签/过期/主机名不匹配的测试证书 PEM（实现期用 `openssl` 生成一次并入库；若环境不可生成，按 §7.4 停止回报） |

### 2.6 按需更新的既有测试

- `test/编排/customer-directive.test.ts`：新增 `takeDownloadDirective`（真实 Service + epoch）、`list()` epoch-aware 投影与 `consumerOf` domain→download 用例；不改既有断言。
- `test/编排/unverifiable-rejection.test.ts`：`download-facts-missing` 正例 + 下载错误码负例（证明不误升级）。
- `test/编排/decision-card.test.ts`（**F6**）：`GOVERNANCE_CARD_GROUP` 精确键集断言加 `"download"`；`governanceCardGroup("download")==="approval"`；同步该测试标题/approval 组描述（现为「仅 appointment-write」）；`request_confirmation` 的 `cardKind` 枚举仍为 `["appointment-write"]`；不改其他既有断言。
- 其他既有 `test/编排/` 文件：仅在编译（`CustomerDirectiveRuntime` 新方法）或行为断言确实受影响时按需更新，逐条理由在完成报告列出；**不弱化断言、不新增 skip**。

### 2.7 不写（明确）

`src/model/**`（A1）；`src/provider/runtime/**`、`src/service/runtime/**`（A1）；`src/common/shared/**`（项目管理）；`src/common/门禁引擎/**`、`src/service/gate/**`（门禁引擎）；`app/**`（C1/C2）；`test/runtime-core/**`、`test/项目管理/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/测试/**`；`package.json`/`tsconfig*`/`vite.config.ts`/`src/index.ts`/发布配方；其他角色 `docs/`、`docs/scheduling|acceptance|communication`、角色卡/边界；**不导入** `src/common/runtime-core/**`。

## 3. 契约（B1 冻结形状）

### 3.1 Service 公共入口（`src/service/download/`）

[设计候选] 纯业务规则、无 I/O、不联网、不做文件系统访问。公共出口只导出以下类型与工厂（实现细节不外泄）：

```ts
export interface DownloadConfig {
  maxBytes: number;            // 默认 104857600；env 仅部署方可调
  connectTimeoutMs: number;    // 15000
  idleTimeoutMs: number;       // 30000
  totalTimeoutMs: number;      // 300000
  maxRedirects: 5;             // 固定
  executableConcurrency: 2;    // 每项目执行并发上限
}

export interface NormalizedUrl {
  url: string;                 // 归一化、去 userinfo、≤2048B
  scheme: "http" | "https";
  host: string;                // 小写/去尾点/punycode（IPv6 去括号）
  port?: number;               // 仅显式非默认端口
  hostForTls?: string;         // 非 IP 字面量时为主机名
}

export type UrlCheckResult =
  | { ok: true; url: NormalizedUrl }
  | { ok: false; code: "download-unsafe-url"; reason: string };

export interface IpDecision { allowed: boolean; family: 4 | 6; reason?: string }

export type DownloadCardFilenameSource = "url-basename" | "caller" | "fallback";
export type DownloadExecutionFilenameSource = DownloadCardFilenameSource | "content-disposition";

export interface DownloadPolicy {
  checkUrl(raw: string): UrlCheckResult;
  classifyIp(ip: string): IpDecision;
  isSameHostForRedirect(from: NormalizedUrl, to: NormalizedUrl):
    | { kind: "same" }
    | { kind: "cross-host" }
    | { kind: "scheme-downgrade" }
    | { kind: "unsafe"; reason: string };
  /** 卡片阶段：只有 URL basename/caller/兜底，**永不返回 content-disposition**（F9）。 */
  suggestCardFilename(input: {
    url: NormalizedUrl;
    callerSuggestion?: string;
    now?: Date;
  }): { name: string; source: DownloadCardFilenameSource };
  /** 执行阶段：Content-Disposition 优先，可返回 content-disposition；结果只用于落盘/审计，不写入 DownloadJudgeFacts（F9）。 */
  resolveExecutionFilename(input: {
    contentDisposition?: string;
    url: NormalizedUrl;
    callerSuggestion?: string;
    now?: Date;
  }): { name: string; source: DownloadExecutionFilenameSource };
  sanitizeFilename(name: string): { name: string };
  boundJudgeFacts(facts: DownloadJudgeFacts): DownloadJudgeFacts; // ≤2048B，校验字段不截断
  resolveConfig(env?: NodeJS.ProcessEnv): { config: DownloadConfig; diagnostics: string[] };
  sanitizeUrlForMessage(raw: string): string; // 去 userinfo、去 query 凭据、≤2048B
}

export function createDownloadPolicy(env?: NodeJS.ProcessEnv): DownloadPolicy;
```

- **主机归一化唯一来源**：`checkUrl` 产出的 `NormalizedUrl.host` 同时用于卡片事实、预授权匹配、同域判定与 `takeDownloadDirective` 查询；不写第二份归一化。
- **IP 判表版本化**：清单常量在本模块内集中定义并注释来源/版本日期；新增特殊段按安全修复补充（AC-7 记录版本）。
- **文件名详情**：`Content-Disposition` 同时含 `filename*` 与 `filename` 时 `filename*` 优先；`filename*=UTF-8''…` 按 RFC 5987 百分号解码，解码失败视为缺失；`filename="…"` 去引号；两项都无 ⇒ URL basename ⇒ caller ⇒ 兜底。净化逐条按方案 §6.2，任一处理后不安全只会替换/兜底，**不会产生目录段**。**F9 分离**：卡片事实的 `DownloadJudgeFacts.filenameSource` 只取 `DownloadCardFilenameSource`；`content-disposition` 只出现在执行阶段结果/内部记录，不赋给 Model 字段。
- **错误映射**：Service 不直接产生 Provider 错误；`DownloadErrorCode` 联合来自 A1 Model；本模块提供纯 `code` 分类/文案键辅助（如需要）。

### 3.2 Provider 公共入口（`src/provider/download/`）

[设计候选] 抽象契约（`abstract/`）：

```ts
export interface PinnedAddress { address: string; family: 4 | 6 }
export interface ResolvedHost { addresses: PinnedAddress[]; } // 全部结果，去重保序

export interface HostResolver {
  resolve(host: string, opts?: { signal?: AbortSignal }): Promise<ResolvedHost>;
  // 失败以 { code: "download-dns-failed", detail } 抛 DownloadProviderError（稳定 code）
}

export interface DownloadLimits {
  maxBytes: number; connectTimeoutMs: number; idleTimeoutMs: number; totalTimeoutMs: number; maxRedirects: number;
}

export interface TransportRequest {
  url: string;
  pinnedAddresses: readonly PinnedAddress[];
  limits: DownloadLimits; // Provider 自有类型；Pipeline 从 Service Config 取值传入，Provider 不 import Service
  projectRoot: string;
  signal?: AbortSignal;
  onRedirect(info: { fromUrl: string; toUrl: string; hop: number }): Promise<
    | { action: "follow"; url: string; pinnedAddresses: readonly PinnedAddress[] }
    | { action: "stop"; code: DownloadErrorCode; detail?: string; redirectTo?: string }
  >;
  planFile(info: { finalUrl: string; contentDisposition?: string }): Promise<{ fileName: string }>;
  onStarted(info: { finalUrl: string; fileName: string }): void | Promise<void>;
}

export type TransportResult =
  | { ok: true; finalUrl: string; fileName: string; pathRel: string; bytes: number; sha256: string; contentType?: string; durationMs: number }
  | { ok: false; code: DownloadErrorCode; httpStatus?: number; bytesWritten: number; detail?: string; redirectTo?: string };

export interface DownloadTransport { execute(req: TransportRequest): Promise<TransportResult>; }

export interface DownloadLedgerEventV1 { /* 见 §3.9 */ }
export interface DownloadLedger {
  append(event: DownloadLedgerEventV1): Promise<{ ok: boolean; message?: string }>; // 不抛
  read(): Promise<{ events: DownloadLedgerEventV1[]; errors: number; files: string[] }>;
}

export type DownloadConsumerEpochState =
  | { state: "ready"; enabledAt: string; appVersion: string }
  | { state: "missing" }                       // read() 专用：文件不存在（ensure() 会创建）
  | { state: "unreadable"; reason: string };
export interface DownloadConsumerEpochStore {
  ensure(appVersion: string): Promise<DownloadConsumerEpochState>; // 缺失创建；不可读不重写；成功 ⇒ ready
  read(): Promise<DownloadConsumerEpochState>;                     // 只读，不创建；missing/ready/unreadable
}
```

[设计候选] 公共出口 `public/download-provider.ts` 只导出：

- 类型：`PinnedAddress`/`ResolvedHost`/`HostResolver`/`DownloadLimits`/`TransportRequest`/`TransportResult`/`DownloadTransport`/`DownloadLedgerEventV1`/`DownloadLedger`/`DownloadConsumerEpochState`/`DownloadConsumerEpochStore`；
- 常量：`DOWNLOAD_LEDGER_REL`、`DOWNLOAD_CONSUMER_STATE_REL`、`DOWNLOAD_CONSUMER_STATE_VERSION`；
- 生产工厂：`createNodeHostResolver()`、`createNodeDownloadTransport()`、`createDownloadLedger(projectRoot, ledgerLimits?)`、`createDownloadConsumerEpochStore(projectRoot)`；
- **不导出** impl 内部辅助、不 wildcard、不暴露任何可放宽解析/地址校验/超时/TLS 的选项。

[设计候选] Provider 不 import Service（层方向：Service → Provider）；它只执行「校验后的钉扎集合 + 回调策略」：`onRedirect`/`planFile` 由 Pipeline（使用 Service）注入；这样网络层不含业务判定。

### 3.3 Pipeline 公共句柄（`src/pipeline/orchestration/download-request.ts`）

[设计候选] 冻结形状（C1 消费；测试用同形状）：

```ts
export interface DownloadAttributionInput {
  /** C1 从会话/任务上下文取真实值（flowId/intentId/taskId 均可选）；全缺/非法 ⇒ B1 合成 "download"（F10）。 */
  flowId?: string;
  intentId?: string;
  taskId?: string;
}

export interface DownloadAttribution {
  flowId: string;             // 真实归属或合成 "download"
  flowIdIsSynthetic: boolean; // true ⇒ 合成值，C1 不得写入 request.created.flowId
  intentId?: string;
  taskId?: string;
}

export interface DownloadRunInput {
  url: string;
  filename?: string;
  purpose: string;
  toolCallId?: string;
  turnId?: string;
  signal?: AbortSignal;
  attribution?: DownloadAttributionInput; // F10：真实归属键的唯一来源（C1 会话/任务上下文）
}

export interface DownloadApprovalRequest {
  downloadId: string;          // B1 生成（唯一审计 id；C1 不生成/不传入）
  roleId: string;
  runtime?: RuntimeKind;
  toolCallId?: string;
  turnId?: string;
  /** F1：卡片路径恒 true；false ⇒ C1 必须省略整个 judgeContext 并附 judgeNotice（直接客户卡）。 */
  factsAvailable: boolean;
  /** F1：B1 构造的最小 GovernanceJudgeFacts（buildGovernanceJudgeFacts({flowId})，不读账本）。 */
  governanceFacts: GovernanceJudgeFacts;
  /** 卡片/判断事实（A1 Model 类型；已按 ≤2KiB 约束）。 */
  downloadFacts: DownloadJudgeFacts;
  attribution: DownloadAttribution;
  policy: { redirectPolicy: "same-host"; maxRedirects: 5 };
  signal?: AbortSignal;
}

export interface DownloadJudgeAudit {
  engine: string; model?: string; reasonCode: string;
  durationMs?: number; readCalls?: number; readBytes?: number;
}

export type DownloadApprovalOutcome =
  | { decision: "approved"; by: "customer" | "judge"; requestId?: string; judge?: DownloadJudgeAudit }
  | { decision: "declined"; by: "customer" | "judge"; requestId?: string; reason?: string; judge?: DownloadJudgeAudit }
  | { decision: "unavailable"; reason?: string }
  | { decision: "aborted" };

export interface DownloadApprovalPresenter {
  /** 冻结形状（F2）：C1 实现；只在需要卡片时调用；`onPresented` 是 requestId 的**主来源**。 */
  present(
    request: DownloadApprovalRequest,
    hooks: { onPresented(info: { requestId: string }): void },
  ): Promise<DownloadApprovalOutcome>;
}

export interface DownloadApproval {
  kind: "customer" | "judge" | "directive";
  requestId?: string;   // 卡片路径
  directiveId?: string; // 预授权路径
  judge?: DownloadJudgeAudit;
}

export type DownloadRunResult =
  | { ok: true; downloadId: string; requestId?: string; path: string; bytes: number; sha256: string;
      finalUrl: string; approval: DownloadApproval; message: string }
  | { ok: false; downloadId: string; requestId?: string; code: DownloadErrorCode; message: string;
      httpStatus?: number; detail?: string; redirectTo?: string; approval?: DownloadApproval };

export interface DownloadRequestRuntime {
  ready(): Promise<void>; // G8 A epoch 建立/读取；失败不抛
  consumerEpoch(): Promise<DownloadConsumerEpochState>; // 面板（C1）读点；不重写
  download(input: DownloadRunInput): Promise<DownloadRunResult>; // 不抛
  /** 会话级收口（F12）：中止本运行时在途下载（download-aborted）、释放本项目执行槽；幂等。 */
  dispose(): Promise<void>;
}

export interface DownloadRequestOptions {
  projectRoot: string;        // C1 从已验证会话 target 绑定；不接受模型参数
  roleId: string;             // **每会话绑定**（F2）；多角色/多会话各自一份运行时
  runtime?: RuntimeKind;
  appVersion: string;         // G8 A epoch 记录（C1 传 app.getVersion()/package 版本）
  present: DownloadApprovalPresenter; // 每会话卡片通道（F2）
  takeDownloadDirective?: TakeDownloadDirectiveFn; // C1 接 customerDirective.takeDownloadDirective
  env?: NodeJS.ProcessEnv;    // 缺省 process.env（仅部署方配置）
  now?: () => Date;
  diagnostics?: DiagnosticLogger;
}

export interface DownloadRequestTestSeams {
  resolver?: HostResolver;              // 假 DNS（安全矩阵/策略测试）
  provider?: DownloadTransport;         // 假执行器（Pipeline 单测）
  policy?: DownloadPolicy;              // 仅测试包装（生产策略仍为默认）
  ledger?: DownloadLedger;              // 内存账本
  epochStore?: DownloadConsumerEpochStore;
}

export function createDownloadRequestRuntime(opts: DownloadRequestOptions): DownloadRequestRuntime;
export function createDownloadRequestRuntimeForTest(
  opts: DownloadRequestOptions,
  seams: DownloadRequestTestSeams, // provider/resolver/policy/ledger/epochStore；仅测试
): DownloadRequestRuntime;
```

- **F1 判断上下文构造点**：`download-request.ts` 在归属解析后调用 `buildGovernanceJudgeFacts({ flowId: attribution.flowId })`（`src/common/编排/governance-judge-facts.ts`，B1 私有 common）得到最小 `GovernanceJudgeFacts`——`governanceModel:"trio"`、`flowId`、`ledgerErrors:0`、`unresolvedClarificationCount:0`、`latestDecisionKinds:[]`；**不读 `.ans`/任务账本**。`factsAvailable` 在卡片路径恒 `true`（B1 只在事实完整时调用 presenter）；若未来需要以客户卡兜底，置 `false` 并由 C1 省略 judgeContext + judgeNotice。C1 把 `governanceFacts`/`downloadFacts`/`attribution.flowId`/`toolCallId`/`turnId` 原样映射到 `metadata.judgeContext`；`factsAvailable` 只作「是否设置 judgeContext」的条件，不写入字段。
- **F10 归属解析**：`flowId`→`intentId`→`taskId` 依次用 `GOVERNANCE_SLUG_PATTERN` 校验，取第一个合法值；全缺/非法 ⇒ 合成 `"download"`（`flowIdIsSynthetic:true`）。C1 负责**不**把合成值写入 `request.created.flowId`（B1 不写 `request.*`）。
- **F2 生命周期**：**每会话一份**运行时（C1 在 `open()` 创建、会话结束 `dispose()`）；`roleId/runtime/present/takeDownloadDirective/appVersion` 在工厂绑定。每项目执行并发 ≤2 由**模块级** `Map<normalizedProjectRoot, activeCount>` 跨会话保证；`downloads.jsonl` 的不交错由共享 `jsonl-ledger` 的**模块级按绝对路径串行链**保证（只读核对 `jsonl-ledger.ts:117`）。C1 不再按项目缓存单一运行时；不再生成/传入 `downloadId`。
- **`downloadId` 唯一来源**：B1 在 `download()` 入口生成 `dl-<uuid>`；`DownloadRunInput` **没有** `downloadId/requestId` 字段。C1 从 presenter/结果消费；卡片路径的 `requestId` 由 `onPresented` 提供（主来源），`DownloadApprovalOutcome.requestId` 仅作兼容回包字段。
- **presenter 形状**：冻结 `present(request, hooks)` + `onPresented({requestId})`；C1 不得用「`presentCard` 返回 `{outcome,requestId}`」的旧形状。B1 优先使用 `onPresented` 的 requestId；两处都缺且返回 approved/declined ⇒ 按 `download-unavailable` 处理（不执行、不伪造归属）。
- **预授权注入而非平级调用**：工程法案 §一.2 禁止平级互调；`download-request.ts` 不 import/call `customer-directive.ts` 的工厂，只接收 `TakeDownloadDirectiveFn` 回调（类型由 B1 在 `customer-directive.ts` 定义并冻结）。C1 用同一 `CustomerDirectiveRuntime` 实例接线（与 shell `takeDirective` 先例同向）。
- **测试缝**：`createDownloadRequestRuntimeForTest` 是唯一接受假 resolver/provider/ledger/epoch 的入口；生产工厂的选项类型**没有**这些字段。结构检查（测试内）扫描 `app/**` 对 `ForTest` 零引用、`src/provider/download/impl/**` 只被 `test/编排/**` 与同模块 public 引用（§4.9）。
- **结果语义**：所有失败 `ok:false` + 稳定 `download-*` code；成功只在 Provider 完成原子 rename 后返回；`message` 由 Pipeline 用 `makeMechanicalRejection`/`formatMechanicalRejection` 生成（含技术 code、可操作说明、owner），不含凭据/响应体/绝对路径。
- **并发/释放**：模块级 `Map<normalizedProjectRoot, activeCount>`，执行前 acquire、`finally` release、`dispose()` 释放本运行时占用的槽；>2 ⇒ `download-busy`（不排队、不重试）。不同项目独立。
- **`ready()`/`consumerEpoch()`**：首次调用 `epochStore.ensure(appVersion)`；不可读只记诊断、按无预授权处理、不重写；面板读点返回实际状态（C1/C2 用于旧指令标注）。

### 3.4 `takeDownloadDirective`（`customer-directive.ts` 加法）

[设计候选] 冻结形状：

```ts
export interface DownloadDirectiveQuery {
  host: string;        // 已按 Service 归一化（小写/去尾点/punycode）
  enabledAt: string;   // G8 A：项目 epoch（ISO 毫秒）；必填，杜绝调用方绕过门槛
  toolCallId?: string;
}
export type TakeDownloadDirectiveFn =
  (query: DownloadDirectiveQuery) => Promise<ApprovalDirectiveDecision | undefined>;

// CustomerDirectiveRuntime 新增：
takeDownloadDirective(query: DownloadDirectiveQuery): Promise<ApprovalDirectiveDecision | undefined>;
```

语义：

1. `await service.ready()`；`getLoadError()` 或 `list().ledgerErrors > 0` ⇒ `undefined`（按无指令处理，与 `takeDirective` 同纪律）。
2. 只匹配 `target==="approval"`、`status==="active"`、`action.resource.type==="domain"` 的指令。
3. **G8 A epoch**：只考虑 `createdAt > enabledAt`（毫秒比较；**同一毫秒边界保守排除**，V1 §3.27 备注明确按方案 §7.4 实现）。`createdAt`/`enabledAt` 解析失败 ⇒ 该指令不匹配。
4. 主机匹配：非通配 ⇒ `host === query.host`；`*` ⇒ 任意；`*.example.com` ⇒ 严格子域（`query.host.endsWith(".example.com")` 且不等于 apex）；大小写/尾点已在查询侧归一。端口不参与匹配。
5. 优先级：deny 候选先于 allow；同类 standing（`session`/`forever`）先于 `once`、同档 `seq` 最新。
6. `once`：返回前 `await service.consume(id, { toolCallId })`；任何 durable 消费失败 ⇒ `undefined`（回落普通审批，绝不重复使用）。`session`/`forever` 不改状态。
7. 返回 `{ action:"allow"|"deny"; id; scope: until }`；**不抛业务错误**（异常 ⇒ `undefined`）。
8. **数据来源说明（F22）**：`ApprovalDirectiveFact` 不含 `createdAt`，因此 epoch 过滤读取同一回放快照的 `service.list()` 视图（含 `createdAt`/`status`/`target`/`action`）；`ledgerErrors` 纪律不变。**`customer-directive.ts` 的 API 注释必须写明「同一快照、ledgerErrors>0 ⇒ 按无指令、绝不重复消费」**。这是对方案 §7.1「只读 `approvalFacts()`」的**实现级落点说明**，不改变匹配语义，也不扩 Model；替代方案（A1 给 fact 加 `createdAt`）见 §7.2。
9. **与 PR #57 兼容**：不改 `doSubmit`/`buildInterpretedPrefill`；自然语言预填创建的 domain 指令与手工指令同规则（只看 `createdAt`，不看来源）。

### 3.5 `consumerOf` 与 epoch-aware 面板视图（`directive-service.ts` + `customer-directive.ts::list()`）

[设计候选] **`consumerOf`（创建时基线）**：`decision` ⇒ `"decision-card"`；`approval` 且 `resource.type==="shell"` ⇒ `"shell-gate"`；`approval` 且 `action.kind∈{allow,deny}` 且 `resource.type==="domain"` ⇒ **`"download"`**；path/其他 ⇒ `"none"`。`CustomerDirectiveView.consumer` 的联合加 `"download"` 属 A1 Model 加法；B1 只改 Service 并消费类型。

[设计候选] **F3 冻结：`CustomerDirectiveRuntime.list()` 的 epoch-aware 投影（方案 2，不扩 A1 Model、C1 不改文件）**：

- `list()` 返回的 `DirectiveListView` 中，仅对 `target==="approval"` 且 `action.kind∈{allow,deny}` 且 `action.resource.type==="domain"` 的视图做 consumer 投影：
  - epoch 可读（`DownloadConsumerEpochStore.read()` 返回 `ready`）且 `createdAtMs > enabledAtMs` ⇒ 保持 `consumer:"download"`；
  - epoch `missing`/`unreadable`/非法，或 `createdAtMs <= enabledAtMs` ⇒ 投影为 `consumer:"none"`（旧指令；C2 据此显示 `downloadLegacyOff`）。
- 其他视图（shell/decision/path、非 domain）与 `ledgerErrors` **逐字不变**；投影只改**返回值副本**，不改 Service 内存视图/账本。
- epoch 来源：`customer-directive.ts` 构造可选 `downloadEpochStore?: DownloadConsumerEpochStore`（测试注入；生产缺省 `createDownloadConsumerEpochStore(projectRoot)`）；`list()` **只读**（`read()`），**不创建** epoch；创建仍归 `download-request.ts` 的 `ready()`/`consumerEpoch()`。
- `list()` 在 `service.ready()` 后执行；`getLoadError()`/`ledgerErrors` 仍按既有 `DirectiveListResult` 语义返回 `ok:false`/错误计数；epoch 读取失败**只影响投影**（全部 domain 视为旧指令），**不改 `ledgerErrors`**（账本错误仍是 directive 账本的），并记诊断。
- **C1 数据流**：`app/desktop/directive-input.ts:491/721` 的 `runtimeFor(projectRoot).list()` 结果把 `consumer` 原样放入 `directive:list`/`directive:state` 载荷；本方案**不需要修改 `app/desktop/directive-input.ts`**（若 C1 另行选择「传 epoch」方案，需按其写集规则补文件；B1 不选）。
- **C2 数据流**：只消费冻结的 `consumer` 值——`"download"` ⇒ 下载；`"none"` 且 `target==="approval"` 且 `resource.type==="domain"` ⇒ `downloadLegacyOff`；**不在渲染侧比较 `createdAt`/不读 epoch 文件**。`"downloadStartsNow"`（G8 B）无消费点。
- **证据**：`customer-directive.test.ts` 覆盖「epoch 前 domain ⇒ none / epoch 后 ⇒ download / epoch 不可读 ⇒ 全部 none / 非 domain 不受影响」；AC-27 面板截图由 D2；`consumerOf` 三态仍由独立单元断言。

[交接] 新枚举的穷尽处理点由 C1/C2/D1 逐点核对（团队计划 §8.3 #4）；B1 冻结 `consumer` 取值集合（`"shell-gate"|"decision-card"|"none"|"download"`）与 `list()` 投影语义。`downloadStartsNow` 无消费点。

### 3.6 能力位透传与 F6 编译解锁（`run-role.ts`）

[设计候选]

- `AdapterCapabilities.requestDownload?: RequestDownloadFn`（A1 Model 类型）。
- `openRoleSession` 输入新增 `requestDownload?: RequestDownloadFn`；在 `capabilities` 组装处 `...(input.requestDownload !== undefined ? { requestDownload: input.requestDownload } : {})`；在 `createRuntimeAdapterFactory` 的能力透传处 `requestDownload: capabilities?.requestDownload`。
- **F6 编译解锁（B1 开工第一动作）**：`CARD_KIND_ROUTE_HINTS`（`run-role.ts:2125`，`Readonly<Record<GovernanceCardKind,string>>` 穷尽）补 `download: "下载卡只由 request_download 工具经应用通道发起；不得用 request_confirmation/request_choice 发下载卡"` 一行；同一提交内更新 `test/编排/decision-card.test.ts` 的 `Object.keys(GOVERNANCE_CARD_GROUP)` 精确键集（加 `"download"`）与 `governanceCardGroup("download")==="approval"` 断言。A1 不写 `run-role.ts`；A1 在合并树上重跑**最终** `npm run typecheck`（exit 0）并记录（§6.5）。
- **不做角色收窄**（与 `viewImage` 同型）：项目角色与内置治理角色只要调用方注入即可获得；判断会话不经 `openRoleSession`、CLI `runRole` 不传 ⇒ 结构性没有 `request_download`（AC-1）。
- **不改** `runRole`（CLI 一次性路径）与 `govern-session.ts`（CLI 治理前端）；桌面会话按现状直接走 `openRoleSession`（`app/desktop/session.ts` 既有裁决）。

### 3.7 判断集成（W-6/W-7 + verdict 最小加法）

[设计候选]

- **W-6**：`requiredArtifactPaths` 新增 `case "download": return { paths: [], missing: false }`；下载卡不要求任何固定物证（judge 以 `request.download` 与 `turnText` 为事实）。
- **W-7 系统 rubric**（追加在 approval 组 rubric 段）：download（approval）——只依据 `request.download` 与 `turnText`；`mechanical` 任一 false ⇒ deny（正常流程不应发卡，属防御）；`download` 缺失/不完整 ⇒ manual，`reasonCode:"download-facts-missing"`；用途为空/与 URL 明显无关 ⇒ deny 并写清原因；**不得尝试访问 URL、不得请求网络工具**；approve 需 `confirmed:true`，不要求 `selected`；evidence 至少一条（可引用 `download:` 事实）。
- **W-7 本次请求提示**：在 card view 之后追加 `request.download` 的有界 JSON（已是 ≤2KiB），并当 `request.cardKind==="download" && request.flowId==="download"` 时注明「合成归属（无 flow/task）；不得据此读取任何 flow 文档，也不得视为 flow 批准」。
- **verdict 最小加法（F4，闸门 2 写集增补条件，记录前不实施）**：`switch` 加 `case "download"`（approve 要求 confirm + confirmed:true）；拆分 `isWriteConfirm`/`isDownloadConfirm`；`SAFE_MANUAL_REASON_CODES` 加 `download-facts-missing`。缺此分支下载 approve 必落 `group-mismatch` manual（§1.2 #4）。
- **F1 映射**：C1 把 presenter 提供的 `governanceFacts` 原样放入 `metadata.judgeContext.facts`、`downloadFacts` 放入 `metadata.judgeContext.download`、`attribution.flowId` 放入 `judgeContext.flowId`（合成值只用于判断上下文，不写 `request.created.flowId`）；`factsAvailable:false` 时 C1 省略整个 `judgeContext` 并附 `judgeNotice`。B1 不构造 `CustomerInputRequest`、不写 `request.*`。
- **不改**：`governance-judge.ts` 的 driver 骨架、`governance-judge-evidence.ts` 的物证策略（预计零改动）；`governance-judge-verdict.ts` 不改其他卡种行为。

### 3.8 机械拒绝与错误码（`mechanical-rejection.ts`）

[设计候选] `RejectionOwner` 加法 `"requester"`（显示为「发起申请的角色」，owner 显示文案由 C1/i18n 决定；B1 不写用户可见 i18n）。`DOWNLOAD_RULES` 以 `Record<DownloadErrorCode, RejectionRule>` 类型强制穷尽，合入 `RULES`：

| code | owner | retryable | action 摘要 |
| --- | --- | --- | --- |
| `download-invalid-arguments` | requester | 是 | 按参数约束改正 url/filename/purpose 后重试 |
| `download-unsafe-url` | requester | 是 | 改用公网 http/https；不得含凭据/本机/私网/保留地址 |
| `download-dns-failed` | requester | 是 | 稍后或换可解析公网域名 |
| `download-denied-by-directive` | **customer** | 是 | 客户指令拒绝；需客户新授权 |
| `download-declined` | requester | 是 | 需新审批；不得改用 shell 绕过 |
| `download-unavailable` | app | 是 | 客户/判断通道不可用；检查窗口/判断配置 |
| `download-facts-missing` | app | 是 | 判断事实缺失；应用接线修复（转客户卡） |
| `download-rebinding-detected` | app | **否** | 安全事件：连接地址不在校验集合；记录诊断并告知客户 |
| `download-redirect-cross-host` | requester | 是 | 对最终 URL 重新调用 `request_download` 走完整审批 |
| `download-http-error` | requester | 是 | 检查 URL/权限/服务器状态 |
| `download-too-large` | requester | **否** | 换小文件或由部署方调整上限 |
| `download-unsupported-encoding` | app | 是 | 非 identity 编码；稍后重试/反馈 |
| `download-timeout` | requester | 是 | 超时；重新申请（无自动重试） |
| `download-network-error` | requester | 是 | 检查网络/TLS 后重新申请 |
| `download-write-failed` | app | 是 | 检查 `download/` 目录/权限后重试 |
| `download-busy` | app | 是 | 等当前下载完成后重试（每项目 ≤2） |
| `download-aborted` | app | 是 | 轮次中止；重新申请 |

`UNVERIFIABLE_REJECTION_CODES` 加入 `download-facts-missing`。`download-denied-by-directive` 用 `owner:"customer"`（默认 RULES），消息含指令 id（`#d-N`）。

### 3.9 审计事件与 epoch 文件形状（冻结）

[设计候选] `downloads.jsonl`（`<projectRoot>/.ans/state/downloads.jsonl`，append-only、可轮转、坏行容错，复用 `jsonl-ledger`）：

```ts
type DownloadLedgerEventV1 =
  | { version:1; kind:"download.requested"; downloadId:string; requestId?:string; roleId:string; runtime?:string;
      url:string; host:string; scheme:"http"|"https"; port?:number; filenameSuggestion?:string; purpose:string;
      maxBytes:number; at:string }
  | { version:1; kind:"download.decided"; downloadId:string; requestId?:string;
      by:"customer"|"judge"|"directive"; directiveId?:string; presented:boolean;
      judge?:{ engine:string; model?:string; reasonCode:string; durationMs?:number; readCalls?:number; readBytes?:number };
      at:string }
  | { version:1; kind:"download.started"; attemptId:string; downloadId:string; finalUrl:string; filename:string; at:string }
  | { version:1; kind:"download.completed"; attemptId:string; bytes:number; sha256:string;
      path:string /* 项目相对 download/<name> */; durationMs:number; contentType?:string; at:string }
  | { version:1; kind:"download.failed"; attemptId:string; code:string; httpStatus?:number; bytesWritten:number;
      detail?:string; at:string };
```

- 字段约束：`url` 去凭据且 ≤2048B；`purpose` ≤1024B；`detail` ≤500B；`path` 项目相对、含 `/`；不记录 Cookie/Authorization/响应体；`sha256` hex。
- 事件序列：`download.requested` 在 URL 通过 `checkUrl` 后立即写入（**不带 `requestId`**）；卡片路径的 `requestId` 在卡片实际呈现时由 `onPresented` 得到，并写入随后的 `download.decided`。非法参数（工具层/首步拒绝）与 `checkUrl` 失败**不写账本**。成功 = `requested → decided → started → completed`；执行前失败 = `requested → failed`；拒绝/deny = `requested → decided → failed`；批准后失败（busy/超时/落盘）= `requested → decided → [started] → failed`；中止同理。预授权路径 `decided.by:"directive"`、`presented:false`、无 `requestId`；卡片路径 `by:"customer"|"judge"`、`presented:true`、带 `requestId`。
- **`request.*` 零写入**：B1 不 import/调用 `task-state` 的 `appendTaskEvent`，`request.created/presented/resolved` 只由 C1 的 `withRequestLifecycle` 在卡片路径写；结构测试断言 B1 源码无 `request.created`/`appendTaskEvent` 字符串。
- **epoch 文件** `.ans/state/download-consumer.json`：`{version:1, enabledAt:"ISO 毫秒", appVersion:string}`；缺失创建；不可读/非法 ⇒ `unreadable`、不重写；同一毫秒边界按 §3.4 保守排除。app 私有运行数据，不是仓库候选、不是治理批准依据。

## 4. 执行编排与安全设计

### 4.1 流程顺序（每会话运行时；模块级每项目并发）

1. `download()` 入口：校验 `url`（`checkUrl`）、`purpose`（非空 ≤1024B）、`filename`（可选 ≤128 字符、无 NUL/分隔符/控制符；仅建议）；生成 `downloadId`；非法 ⇒ `download-invalid-arguments`（不解析、不联网、不发卡、不落盘）。
2. 卡片前 DNS：`resolver.resolve(host)` 全量解析（仅地址查询，不连目标主机）；失败 ⇒ `download-dns-failed`；`classifyIp` 作用于**全部**结果，任一非公网 ⇒ `download-unsafe-url`。
3. 构造 `DownloadJudgeFacts`（展示前 8 个 IP + total/truncated，`mechanical` 全 true）并 `boundJudgeFacts` ≤2KiB；解析 `attribution`（`flowId`→`intentId`→`taskId` 取第一个合法 slug，否则合成 `"download"`）并 `buildGovernanceJudgeFacts({flowId})` 得到最小 `governanceFacts`；`factsAvailable:true`。
4. 预授权：`epoch = await epochStore.ensure(appVersion)`；`epoch.state==="ready"` 且注入了 `takeDownloadDirective` ⇒ 查询 `{host, enabledAt, toolCallId}`。deny ⇒ `download-denied-by-directive`（owner=customer）；allow ⇒ 直接进入执行（不弹卡、不调 judge）。
5. 未命中 ⇒ `presenter.present({downloadId, roleId, runtime?, toolCallId, turnId, factsAvailable, governanceFacts, downloadFacts, attribution, policy, signal}, hooks)`：C1 负责卡片/生命周期/judge/客户；`present` 抛错/不可用 ⇒ `download-unavailable`；`declined` ⇒ `download-declined`；`aborted` ⇒ `download-aborted`。卡片呈现由 `onPresented` 报告 `requestId`（写入随后的 `download.decided`；`download.requested` 已在第 1 步后写、不带 `requestId`）。
6. 批准 ⇒ 并发 acquire（>2 ⇒ `download-busy`）⇒ **执行时重新解析/重新判表/钉扎**（与卡片前不同的公网结果允许）⇒ Provider 执行（逐跳回调再次解析/判表/钉扎）。
7. Provider 成功后返回 `path/bytes/sha256/finalUrl`；Pipeline 写 `download.completed` 并返回 `ok:true`；失败返回稳定 code 并写 `download.failed`（清理由 Provider 完成）。
8. 所有阶段响应 `signal` 中止（`download-aborted`）；无自动重试。

### 4.2 SSRF / DNS 钉扎 / rebinding

- 协议仅 `http`/`https`；拒绝 userinfo；端口 1–65535；host 归一化（§3.1）。
- 解析结果**全部**参与判定与钉扎；>8 只截断展示（`resolvedIpsTruncated/Total`），不截断校验集合。
- IPv4 拒绝清单与 IPv6 `2000::/3` 正向 + 特殊段排除（§2 #11）；`::ffff:127.0.0.1`、`64:ff9b::/96`、`::1`、`fc00::/7`、`fe80::/10`、`ff00::/8` 等因不在 `2000::/3` 自动拒绝；`2001::/32`、`2002::/16`、`2001:20::/28`、`3fff::/20` 等显式排除。
- 执行时 `lookup` 回调只返回**执行时校验集合**中的地址（Node `{all:true}`/单地址两种调用形状都支持）；连接后核对 `socket.remoteAddress` 属于该集合（IPv4-mapped 归一）；不在 ⇒ `download-rebinding-detected`（不落盘）。
- 卡片前与执行时两次解析都要求全公网；执行时结果可与卡片前不同（CDN）但必须仍全公网。

### 4.3 重定向

- 仅处理 `301/302/303/307/308`；最多 5 跳；`300/304/305/306`、缺 `Location` 的 3xx ⇒ `download-http-error`。
- 每跳由 Pipeline 的回调重新 `checkUrl` + 重新解析 + 重新判表 + 重新钉扎；任一不通过 ⇒ 中止。
- **同域** = 归一 host 相等（大小写/尾点/punycode 归一；端口可不同）；`https→http` 降级 ⇒ `download-unsafe-url`；`http→https`/同 scheme 允许。
- **跨域** ⇒ `download-redirect-cross-host`，不自动跟随、不自动弹新卡；消息给出 `Location` 目标（去凭据、限长），下一步「对最终 URL 重新调用 `request_download`」（G3 A）。
- 循环/超跳 ⇒ `download-http-error`（detail「重定向过多」）。

### 4.4 大小、超时、中止

| 项 | 默认 | 来源 | 行为 |
| --- | --- | --- | --- |
| 大小上限 | 104857600 | `ANS_DOWNLOAD_MAX_BYTES`/A1 常量 | `Content-Length` 明确超限 ⇒ 不读正文中止；无/不可信长度 ⇒ 流式计数超限 `destroy` ⇒ `download-too-large` |
| 连接超时 | 15000ms | `ANS_DOWNLOAD_CONNECT_TIMEOUT_MS` | 从 request 创建到 socket `connect`/`secureConnect`；超时中止 ⇒ `download-timeout` |
| 空闲超时 | 30000ms | `ANS_DOWNLOAD_IDLE_TIMEOUT_MS` | 连接后无数据计时（每个 data 重置）⇒ `download-timeout` |
| 总超时 | 300000ms | `ANS_DOWNLOAD_TOTAL_TIMEOUT_MS` | 跨全部跳/正文；超时 ⇒ `download-timeout` |
| 回合中止 | `call.signal` | C1 透传 | 立即中止并清理 ⇒ `download-aborted` |

- `Accept-Encoding: identity`；响应声明非 identity 内容编码 ⇒ `download-unsupported-encoding`（不解压，P6 未选）。
- **仅 200 写盘**；`204`/`206`/其他 2xx ⇒ `download-http-error`（不产生 0 字节文件）；4xx/5xx 读取并丢弃 ≤16KiB 诊断正文，不落盘。
- 无自动重试：连接失败/5xx/超时都不在同一调用内重试；服务端只收到一次请求（重定向按跳计）。

### 4.5 TLS

- `https.request` 默认校验开启；显式 `rejectUnauthorized: true`（无关闭选项/无环境变量）；`servername` 为非 IP 主机名；`SNI` 用归一主机名；IP 钉扎不影响证书主机名校验。
- 自签/过期/主机名不匹配 ⇒ `download-network-error`，无落盘（AC-26）；`http:` 明文允许（G6/Q3 A）。

### 4.6 文件名与落盘

- 目标：`<projectRoot>/download/`（固定、小写、单数；不接受模型指定根/子目录）。
- 目录守卫：`mkdir -p` 前后用共享 `path-primitives` 复核：`lstat(<root>/download)` 存在且为符号链接/非目录 ⇒ `download-write-failed`；`realResolveAsync(projectRoot)` 与 `realResolveAsync(downloadDir)` 比较，download 的真实路径必须恰为 `<realRoot>/download`；最终文件路径再复核（`absRel` 在根内、目标非符号链接）。
- 文件名优先级与净化见 §3.1；最终只使用单文件名（无目录段），`..`/`/`/`\`/盘符/NUL 在净化阶段即被替换或拒绝。
- 重名：`open(final,"wx")` 占位；`EEXIST` ⇒ ` (1)`…（保留扩展名）；**绝不覆盖**；同名并发由 `wx` 竞争 + 后缀保证。
- 写入：占位成功后同目录 `<final>.<rand>.part`（`wx` 0600）流式写 + sha256；完成 `fsync`/close 后 `renameReplacingExisting(temp, placeholder)`（共享原语，Windows 瞬时 EPERM 有界重试）。失败/中止：`unlink` temp + 占位；既有同名文件字节不变；失败路径不留 `.part`/占位/半成品。
- 崩溃残留：P3 未选，不做启动清理；失败路径已清理，崩溃窗口极窄（如实披露）。

### 4.7 并发

- 审批一项目一卡由 C1 既有通道保证（B1 不改）。
- 执行每项目 ≤2：**每会话运行时共享模块级**计数 Map（key=归一 projectRoot）；跨会话也合计 ≤2；超出立即 `download-busy`（不排队、不重试）；`dispose()` 释放本运行时持有槽。
- 同名并发：Provider `wx` 占位 + 后缀；失败方自动换后缀，不覆盖。
- 跨项目独立（不同根/不同计数键）。
- `downloads.jsonl` 追加由共享 `jsonl-ledger` 的模块级按绝对路径串行链保证不交错（F2 依据）。

### 4.8 安全矩阵（B1 证据）

| 威胁 | 控制（B1） | 测试/证据 |
| --- | --- | --- |
| SSRF：本机/私网/保留地址 | 协议白名单 + userinfo 拒绝 + 全量解析判表（IPv4 清单/IPv6 正向+特殊段） | `download-policy.test.ts` 逐段样本；`download-pipeline.test.ts` 混合/整数/`::ffff:` |
| DNS rebinding | 执行时重解析 + `lookup` 只返回钉扎集合 + `remoteAddress` 复核 | `download-provider.test.ts` 注入 lookup 让连接地址不在钉扎集合 ⇒ `download-rebinding-detected`，无落盘 |
| 跨域重定向借道 | 逐跳同域判定；跨域中止 + `download-redirect-cross-host` + 最终 URL | 本地双 host 服务；同域 301/302/303/307/308；降级/超跳/缺 Location |
| 大文件/慢链 | 100MB 上限 + 连接/空闲/总超时 + 中止清理 | 本地服务计数/计时 + 文件断言；无自动重试（请求数 1） |
| 文件名攻击 | 净化真值表 + 单文件名 + `wx` 占位 + 不覆盖 | `download-policy.test.ts` 真值表；`download-provider.test.ts` 文件断言 |
| 目录逃逸/符号链接 | 真实路径复核 + 非目录/符号链接拒绝 + 单文件名 | `download-provider.test.ts` 符号链接/文件占位拒绝 |
| TLS MITM | 默认校验 + 无关闭开关 | 自签/过期/主机名不匹配三例；结构检查 `rejectUnauthorized` 仅 `true` |
| 审批绕过 | 独立工具/独立能力；`request_confirmation` 白名单不变（A1）；B1 无第二发卡路径；预授权只来自客户指令 | `download-pipeline.test.ts` presenter 调用计数；结构检查 B1 不构造 cardKind/不走 `task-state` |
| 预授权越权（旧指令） | G8 A `enabledAt` 门槛；不可读按无指令、不重写 | `customer-directive.test.ts` 旧/新/不可读/同毫秒；`download-pipeline.test.ts` epoch 行为 |
| 审计伪造/错误归属 | append-only 共享 JSONL；`by` 字段固定集合；预授权路径无 `request.*` | `download-provider.test.ts` 坏行/轮转；`download-pipeline.test.ts` 事件序列/负例 |
| 压缩炸弹 | 非 identity 编码拒绝 | `download-provider.test.ts` gzip 响应 ⇒ `download-unsupported-encoding` |
| 响应体泄漏 | 错误只含状态码/原因；响应体 ≤16KiB 仅诊断丢弃 | 状态码用例 + 错误消息断言不含响应体 |
| 测试缝泄漏生产 | 生产工厂无 seam；seam 仅在 impl/测试工厂 | §4.9 结构检查 |

### 4.9 测试缝关闭（生产 capability 不可打开）

1. **生产工厂无 seam**：`createDownloadRequestRuntime` 只接收 `projectRoot/roleId/runtime/appVersion/present/takeDownloadDirective/env/now/diagnostics`；**没有** resolver/provider/policy/ledger/epochStore/loopback 放行字段。Service/Provider 的生产工厂（`createDownloadPolicy`/`createNodeHostResolver`/`createNodeDownloadTransport`）也没有地址校验放宽、`rejectUnauthorized` 关闭、超时放大等选项。
2. **测试工厂显式**：`createDownloadRequestRuntimeForTest` 仅用于 `test/编排/**`；结构检查扫描 `app/**` 与 `src/**`（除该定义文件）对 `ForTest` 的引用为 0（测试本身除外）。
3. **Provider impl 缝只在 impl**：`node-http.ts` 的 `lookup`/`agent` 覆盖参数只由 `test/编排/**` 直接 import impl 使用；`src/provider/download/public/` 不 re-export 这些内部选项；结构检查扫描 `src/pipeline/**`、`src/service/**`、`app/**` 对 `provider/download/impl` 的 import 为 0。
4. **策略不被替换**：Pipeline 生产工厂直接使用 `createDownloadPolicy()` 的 `classifyIp`；测试放行 loopback 只发生在 Provider 单测（直接传钉扎 `127.0.0.1`，不经过生产策略），Pipeline 层测试用假 Provider 观察调用，不修改生产策略。
5. **证据形式**：`download-pipeline.test.ts` 内结构断言（读源码文件做正则/import 扫描）+ 代码评审；不新增 lint 规则、不改构建。

## 5. 测试计划

### 5.1 新增测试（文件与重点）

1. **`test/编排/download-policy.test.ts`**
   - URL：`file:`/`ftp:`/`data:`/`ws:`、userinfo、空 host、显式端口 1/65535/非法、大小写/尾点/punycode/IPv6 括号、URL 长度边界。
   - IPv4：上表每个拒绝段边界（首/末地址）；公网样本（如 `93.184.216.34`）允许。
   - IPv6：`::1`、`fc00::`、`fe80::`、`::ffff:127.0.0.1`、`64:ff9b::1`、`2002::/16`、`2001::/32`、`2001:20::/28`、`2001:db8::/32`、`3fff::/20` 拒绝；`2001:4860:4860::8888`、`2606:4700::1111` 允许；非法字面量/zone id 拒绝。
   - 同域：大小写/尾点/punycode 相等；端口不同仍同域；`https→http` 降级；`http→https` 允许；`a.example.com` vs `example.com` 不同域。
   - 文件名真值表：`suggestCardFilename`（无 content-disposition；`filename*` 不参与卡片阶段）与 `resolveExecutionFilename`（`filename*` 优先、`filename`、URL basename、caller、兜底）；`..`/`/`/`\`/`<>:"|?*`/控制符/尾点空格/前导点/`CON`/`NUL.txt`/超长/空名；**F9**：执行阶段 source 含 `content-disposition`、卡片阶段 source 永不包含它。
   - 配置：缺省值、非法值回退、env 名称冻结。
   - `boundJudgeFacts`：构造超 2KiB 输入 ⇒ 序列化 ≤2048B、`url` 保留 scheme+host、`purpose` 截断、`scheme/host/resolvedIps/mechanical` 不变。
2. **`test/编排/download-provider.test.ts`**
   - 本地 `http` 服务：200 成功（内容/字节/sha256/`download/<name>`/无 `.part`/无占位残留）；Content-Disposition 覆盖；重名 ` (1)` 且既有文件字节不变；两个并发同名下载各自成功且文件不覆盖。
   - 重定向：301/302/303/307/308 同域（不同端口）跟随且逐跳回调被调用；跨域（`127.0.0.1` → `localhost`）⇒ `download-redirect-cross-host` 且不跟随；`https→http` 降级 ⇒ `download-unsafe-url`；>5 跳、300/304/305/306、缺 Location ⇒ `download-http-error`。
   - 大小/状态：Content-Length 超限、chunked 超限、204/206/201/500 ⇒ `download-http-error`/`download-too-large`，无文件/无残留。
   - 超时/中止：空闲/总超时（延迟响应/延迟 body）；连接超时用测试 Agent（`createConnection` 永不回调）；`AbortSignal` 中止 ⇒ `download-aborted`；服务端请求计数 = 1。
   - TLS：自签/过期/主机名不匹配 ⇒ `download-network-error`，无落盘；结构断言无关闭开关。
   - rebinding：注入 lookup 返回不在钉扎集合的本机地址 ⇒ `download-rebinding-detected` 且无落盘；`remoteAddress` 复核（IPv4-mapped）。
   - 账本：requested/decided/started/completed/failed 形状；坏行/轮转读取；追加失败不影响主路径。
   - 目录：`download` 为符号链接/普通文件 ⇒ `download-write-failed`；不存在时创建。
3. **`test/编排/download-pipeline.test.ts`**
   - 事实与 F1：presenter 请求包含 `downloadId`（B1 生成）、`roleId/runtime/toolCallId/turnId`、`factsAvailable:true`、`governanceFacts`（`governanceModel:"trio"/flowId/ledgerErrors:0`）、`downloadFacts`（≤2KiB）、`attribution`（真实 flowId/intentId/taskId 或合成 `"download"` + `flowIdIsSynthetic`）、`policy`；>8 个解析结果截断展示但钉扎集合是全部（假 resolver + 假 provider 捕获）。
   - F10 归属：C1 给 flowId → 真实；只给 intentId/taskId → 取第一个合法；全缺/非法 → 合成 `"download"`；合成不写 `request.*`（B1 无该写入）。
   - F2 生命周期：每会话运行时（不同 roleId/present 互不影响）；模块级并发 Map 跨两个运行时合计 ≤2；`dispose()` 中止本运行时在途下载并释放槽；`downloadId` 由 B1 生成、C1 不传。
   - 预授权：deny 优先、allow、`*.example.com` 严格子域、`*`、大小写/尾点、`once` 消费/失败回落、`session`/`forever`、epoch 旧指令不匹配/不可读/同毫秒；deny 不发卡不执行；allow 不发卡。
   - 审计：卡片路径带 `requestId`（来自 `onPresented`）、`by:"customer"|"judge"`、`presented:true`；预授权路径无 `requestId`、`by:"directive"`、`presented:false`；无 `request.*`（结构+计数器）；失败也有 `download.failed`；坏行不影响。
   - 并发：同一项目第 3 个并发 ⇒ `download-busy`；不同项目隔离；同名并发文件断言在 Provider 测试。
   - 失败：presenter 抛错 ⇒ `download-unavailable`；signal 中止 ⇒ `download-aborted`；provider 失败透传 code；成功只在 provider 成功（rename 后）返回；`onPresented` 与 outcome.requestId 都缺 ⇒ `download-unavailable`（不执行）。
   - epoch：首次创建 `{version:1,enabledAt,appVersion}`；不可读不重写；`consumerEpoch()` 返回状态。
   - `run-role` 透传：`openRoleSession({requestDownload})` 捕获 `AdapterCapabilities.requestDownload`；不传 ⇒ 缺席（结构 fail-closed）；`CARD_KIND_ROUTE_HINTS.download` 存在（F6）。
   - 指令面板投影（F3）：`CustomerDirectiveRuntime.list()` 对 epoch 前 domain ⇒ `consumer:"none"`、epoch 后 ⇒ `"download"`、epoch 不可读 ⇒ 全部 `"none"`；非 domain 不变（与 `customer-directive.test.ts` 共同覆盖）。
   - 测试缝：`createDownloadRequestRuntimeForTest` 可注入假 resolver/provider/ledger；生产工厂选项类型无 seam（type-level + 源码扫描）。
4. **`test/编排/download-judge.test.ts`**
   - W-6：`requiredArtifactPaths({cardKind:"download",...})` ⇒ `{paths:[],missing:false}`。
   - verdict：download approve + `confirmed:true` + reason/evidence ⇒ `approve`，`value.confirmed===true`、无 `selected/paths/pathDecisions`；缺 `confirmed` ⇒ `manual("not-recommended")`；手动 `manual` reasonCode `download-facts-missing` 保留（不被归一为 `model-manual`）。
   - 提示词：系统提示含 download rubric/「不得访问 URL」；请求提示含 `request.download` JSON 与合成归属标注；`request.download` 缺失时 rubric 指示 manual（字符串断言）。
   - `governanceCardGroup("download")==="approval"`（A1 冻结后的集成断言）。
5. **既有测试更新**：`customer-directive.test.ts`（`takeDownloadDirective` 真实运行时：epoch/匹配/once/consumerOf；`list()` epoch-aware 投影）、`unverifiable-rejection.test.ts`（`download-facts-missing` 正例）、`decision-card.test.ts`（F6 精确键集）；其余按编译/断言需要。

### 5.2 命令与环境

```bash
# B1 层内（受影响）
node --test "test/编排/**/*.test.ts"
npm run typecheck
```

- 环境：Windows 11 / Git Bash；Node v24.22.1；`node_modules` 已安装（B0 v2）。
- **F6 顺序**：A1 完成 Model/工具/schema 后（其自身 typecheck 可能因 `run-role.ts` 穷尽 Record 缺键而红，属已知下游单点）；B1 开工第一动作补 `CARD_KIND_ROUTE_HINTS.download` 一行并更新 `test/编排/decision-card.test.ts` 键集，随后 B1 的 `npm run typecheck` 必须 exit 0；A1 在合并树上重跑**最终** `npm run typecheck`（exit 0）并记录，A1 冻结声明附 `run-role.ts` 哈希与「编译解锁」注记。B1 不以定向 typecheck 替代最终 `npm run typecheck`。
- 计数：以实际输出记录（B0 编排 60 文件 / 757/756/1/0）；预期新增文件 4 个、tests 增加；**不得新增确定性失败、不得新增 skip**；既有 1 项 Windows symlink EPERM（`shell-authorized-routine.test.ts:184`）按 B0 分类。
- 全量 T3（407 文件、`--test-concurrency=1` 等价集合）由 D1 在冻结候选上执行；B1 不重复全量。
- 不跑 `typecheck:renderer`/`build:renderer`（B1 不触渲染面；D1 统一跑）。

### 5.3 AC 映射（B1 交付/证据）

| AC | B1 交付 | 证据（B1 层） | 交接 |
| --- | --- | --- | --- |
| AC-3 | 卡片事实（角色/用途/URL/host/port/resolvedIps+total/truncated/mechanical/filename/source/maxBytes/redirectPolicy）与 `downloadId`；presenter 请求形状 | `download-pipeline.test.ts` 字段断言 | C1 卡片/`request.created/presented`；D1/D2 截图 |
| AC-5 | F1 presenter 上下文（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`）+ W-6 + W-7 rubric/渲染 + `boundJudgeFacts` ≤2KiB | `download-pipeline.test.ts`、`download-judge.test.ts`、`download-policy.test.ts` | A1 `GovernanceJudgeRequest.download`/judge 工具集；C1 W-3/W-4 原样映射；D1 |
| AC-7 | 全量解析判表、执行时重解析、钉扎 lookup、`remoteAddress` 复核、rebinding code | `download-policy.test.ts`、`download-provider.test.ts`、结构检查 | D1 安全矩阵复跑 |
| AC-8 | 同域/跨域/降级/跳数/异常 3xx/缺 Location；Location 去凭据 | `download-provider.test.ts`、`download-policy.test.ts` | D1 |
| AC-9 | 大小上限、仅 200 写盘、204/206/其他 2xx、无残留 | `download-provider.test.ts` | D1 文件断言 |
| AC-10 | 连接/空闲/总超时、中止、无自动重试 | `download-provider.test.ts`（计数=1） | D1 |
| AC-11 | 文件名优先级/净化/重名/不覆盖 | `download-policy.test.ts`、`download-provider.test.ts` | D1 |
| AC-12 | 占位/临时/fsync/rename/失败清理/既有文件不变 | `download-provider.test.ts` | D1 故障注入 |
| AC-13 | 只写 `download/`、目录创建、符号链接/普通文件拒绝、单文件名 | `download-provider.test.ts`、`download-pipeline.test.ts` | C1 目标绑定；D1 |
| AC-14 | `takeDownloadDirective`（deny/allow/once/session/forever/归一/回落）、`consumerOf("download")`、**`list()` epoch-aware 投影**、epoch | `customer-directive.test.ts`、`download-pipeline.test.ts` | A1 枚举；C1 面板数据（`consumer` 原样）；C2 只消费 `"download"`/`"none+domain"`；A2 文案；D1/D2 |
| AC-15 | 失败 `ok:false`+稳定 code、成功在 rename 后、无自动重试、once 不重复消费 | `download-pipeline.test.ts`、`download-provider.test.ts` | A1 工具消息；D1 |
| AC-16 | **每会话运行时 + 模块级每项目执行 ≤2**/`download-busy`；同名并发不覆盖；`dispose()` 释放 | `download-pipeline.test.ts`、`download-provider.test.ts` | C1 一项目一卡、每会话创建/dispose；D1 |
| AC-17 | `downloads.jsonl` 事件（requested/decided/started/completed/failed）、归属字段、无凭据/响应体、坏行容错；预授权路径无 `request.*` | `download-provider.test.ts`、`download-pipeline.test.ts`（负例） | C1 `request.*`；D1 账本样例 |
| AC-18 | 不触 shell 闸/写守卫/CLI；B1 源码无 `task-state` 写入；受影响套件输出 | 受影响套件 + `git diff` 落写集 | D1 T3；E2 非目标核对 |
| AC-21 | `download.decided.by`/`DownloadApproval.kind` 如实；预授权路径 `directiveId`、无 `requestId`；卡片路径 `requestId` | `download-pipeline.test.ts` | C1 `request.resolved`/UI；D1/D2 |
| AC-23 | B1 无第二发卡路径；不构造 `CustomerInputRequest`/`cardKind:"download"`；只调用 presenter | `download-pipeline.test.ts` 结构断言 | A1 类型/工具夹具；D1 |
| AC-24 | F1 presenter 判断上下文 + W-6 + verdict `case "download"`（F4，闸门 2 写集增补条件）+ `SAFE_MANUAL_REASON_CODES`；approve 不被压制 | `download-pipeline.test.ts`、`download-judge.test.ts` | A1 W-1/W-5；C1 W-2/W-3/W-4；D1 |
| AC-25 | `DownloadJudgeFacts` ≤2KiB（校验字段不截断）、卡片截断标记来源 | `download-policy.test.ts`、`download-pipeline.test.ts` | C1 透传；D1/D2 截图 |
| AC-26 | TLS 三类失败 + 无关闭开关 | `download-provider.test.ts` + 结构检查 | D1 |
| AC-27 | epoch store（创建/读取/不可读不重写/同毫秒保守）+ `takeDownloadDirective` 过滤 + **`list()` 旧指令投影 `consumer:"none"`** | `customer-directive.test.ts`、`download-pipeline.test.ts` | C1 面板数据（原样）；C2 `none+domain ⇒ downloadLegacyOff`（不比较时间）；A2 文案；D1/D2 |
| AC-29 | 300/304/305/306/缺 Location/204/206/其他 2xx ⇒ `download-http-error`；仅 200 产生文件；错误不含响应体 | `download-provider.test.ts` | D1 |

## 6. 依赖、冻结与顺序

### 6.1 依赖 A1（运行时核心）冻结契约

B1 只按 A1 冻结形状消费；以下任一缺失/形状不符 ⇒ **停止回报**，不自行补 Model/工具：

1. `src/model/download.ts`：`RequestDownloadFn`、`DownloadRequestInput`{url,filename?,purpose}、`DownloadRequestResult`（至少成功 `path/bytes/sha256/finalUrl/approval`、失败 `code/message`）、`DownloadErrorCode`（§3.8 全集）、`DownloadJudgeFacts`（§4.1 字段：url/scheme/host/port?/resolvedIps/resolvedIpsTotal/resolvedIpsTruncated/filename/**filenameSource 仅卡片阶段 `"url-basename"|"caller"|"fallback"`（F9）**/purpose/maxBytes/mechanical）、下载常量（maxBytes/timeouts/URL/filename/purpose 上限）。
2. `RequestDownloadFn` **必须带执行上下文**：`(input, context:{signal?:AbortSignal; toolCallId?:string; turnId?:string})`（或等价形状；A1 `DownloadRequestMetadata` 已含 signal/roleId/runtime/turnId/toolCallId——PM 审核 §3.1 已闭合）。缺 `signal` ⇒ AC-10 中止不可实现；缺 `toolCallId/turnId` ⇒ W-3/审计字段不可达。**归属键 `flowId/intentId/taskId` 不要求 A1 metadata 提供（F10）**：由 C1 从会话/任务上下文经 `DownloadRunInput.attribution` 传入；A1 若可选加法也不改变 B1 契约。
3. `src/model/runtime.ts`：`GovernanceCardKind` 加 `"download"`；`GOVERNANCE_CARD_GROUP["download"]="approval"`；`GovernedToolsOptions.requestDownload?`；`GovernanceJudgeContext.download?`；`GovernanceJudgeRequest.download?`；`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` **不变**。
4. `src/model/directive.ts`：`CustomerDirectiveView.consumer` 联合加 `"download"`。
5. `src/provider/runtime/tools.ts`/`schema.ts`：`request_download` 工具、参数校验、注入才注册、`request_confirmation` 拒绝 `cardKind:"download"`。
6. `src/service/runtime/session.ts`：`RuntimeSessionOptions` 继承 `requestDownload`（无需额外声明）；`buildGovernedTools` 透传。

### 6.2 B1 冻结（C1/C2/D1 只消费）

- Provider/Service 公共出口与全部 abstract 类型；`DownloadPolicy`/`DownloadConfig`/`DownloadTransport`/`DownloadLedger`/`DownloadConsumerEpochStore`；生产工厂签名。
- Pipeline `DownloadRequestRuntime`（含 `dispose()`）/`DownloadRequestOptions`（每会话绑定）/`DownloadRunInput`（含 `attribution`，无 downloadId/requestId）/`DownloadRunResult`/`DownloadApprovalPresenter`（`present(request,hooks)`）/`DownloadApprovalRequest`（`factsAvailable`/`governanceFacts`/`downloadFacts`/`attribution`）/`DownloadApprovalOutcome`/`DownloadJudgeAudit`/`TakeDownloadDirectiveFn`。
- `CustomerDirectiveRuntime.takeDownloadDirective` 语义与 `DownloadDirectiveQuery`（`enabledAt` 必填）；**`CustomerDirectiveRuntime.list()` 的 epoch-aware 投影语义**（旧 domain ⇒ `consumer:"none"`；新 domain ⇒ `"download"`；C2 只消费 `consumer` 值）；`CreateCustomerDirectiveRuntimeOptions.downloadEpochStore?`（测试注入；生产缺省由 projectRoot 创建）。
- `consumerOf("download")`、错误码/owner/`UNVERIFIABLE`、W-6/W-7、G8 A epoch 语义、`downloads.jsonl`/`download-consumer.json` 形状。
- 变更须回 B1 并重跑受影响证据。

### 6.3 交接（C1/C2/D1）

- **C1（F1/F2/F10/F11/F12/F13）**：
  - **每会话创建/持有** `createDownloadRequestRuntime({projectRoot, roleId, runtime, appVersion, present, takeDownloadDirective: customerDirective.takeDownloadDirective.bind(...)})`；会话结束 `await runtime.dispose()`。**不再按项目缓存单一运行时**；多角色/多会话各自一份（模块级 Map 仍保证每项目执行 ≤2）。
  - `present(request, hooks)` 实现 B1 冻结形状：`hooks.onPresented({requestId})` 在卡片实际呈现时调用；`request.governanceFacts`/`downloadFacts`/`attribution`/`toolCallId`/`turnId` 进 `metadata.judgeContext`（`factsAvailable` 只作是否设置 judgeContext 的条件，不写入字段）；`factsAvailable:false` ⇒ 省略整个 judgeContext + `judgeNotice`（直接客户卡）；`attribution.flowIdIsSynthetic` 为 true 时**不**写 `request.created.flowId`/`metadata.flowId`。
  - **不生成/不传入 `downloadId`**；从 presenter/结果消费 B1 的 `downloadId`；`requestId` 来自 `onPresented`（主）或 outcome 兼容字段；`request.created/presented/resolved` 只卡片路径，预授权路径零 `request.*`。
  - 工具能力 `requestDownload` 转调 `runtime.download` 并把 `metadata.signal/toolCallId/turnId` 透传；归属键从会话/任务上下文填入 `DownloadRunInput.attribution`（无真实值则省略，B1 合成 `"download"`）。
  - `consumerEpoch()` 供面板旧指令标注；但 C1 若选择传 epoch 方案才需改 `app/desktop/directive-input.ts`（B1 不选；默认 B1 `list()` 已投影，C1 无需改该文件）。
  - `RejectionOwner:"requester"` 的显示/回归由 C1 的 `rejection-copy.test.ts` 覆盖（F18；B1 只登记 owner）。
  - `DownloadJudgeFacts.mechanical` 仍含 A1 Model 的五项布尔；卡片摘要按 A2 冻结的三项 key（scheme/publicHost/publicIps）渲染，C1 取对应三项，**B1 不要求 A2 增补 credentialsAbsent/filenameSafe key**（F8 收敛口径）。
- **C2（F3/F5/F8）**：只消费冻结的 `consumer` 值（`"download"` / `"none"+domain`）；不比较 `createdAt`、不读 epoch；`directive-store.ts` 的 `asDirectiveConsumer`/`CONSUMER_KEYS` 增补属 C2 的闸门 2 写集增补条件（其提案修订）。
- **D1**：跨层集成覆盖预授权/卡片/judge/客户/跨域重申请/超限/并发/epoch/审计归属；T3 全量；不合并 AC 条目。
- **E1**：披露 F4 写集增补记录、F6 串行口径、A1 契约形状、基线 `c2f1630`、PR #57 重叠。

### 6.4 与 PR #57 的兼容

- B1 在 `customer-directive.ts` 只**新增**函数/类型；不改 `doSubmit`/`buildInterpretedPrefill`/`previewHighRisk`/`interpretDirective` 接线；`src/common/编排/directive-interpreter.ts` **不改**。
- G8 A 门槛按 `createdAt` 统一适用（含自然语言预填创建的 domain 指令）；不因来源不同放宽（团队计划 §1.5.3 第 5 项）。
- 与 PR #58 无写集重叠（仅 `app/desktop/customer-input.ts` + 桌面测试），由 C1 处理。

### 6.5 阶段与顺序

- B1 入口：A1 冻结 + H1 完成（当前 H1 已落地）。**B1 开工第一动作（F6）**：补 `run-role.ts::CARD_KIND_ROUTE_HINTS.download` 一行 + 更新 `test/编排/decision-card.test.ts` 精确键集；随后 `npm run typecheck` exit 0。A1 在合并树上重跑最终 typecheck（§5.2）。
- 其余顺序：Provider abstract/impl/public → Service abstract/impl/public → Pipeline`download-request.ts` → `customer-directive.ts`（`takeDownloadDirective` + **`list()` epoch 投影**）→ `consumerOf` → `run-role.ts` 能力位（含 F6 一行）→ `mechanical-rejection`/`governance-judge-facts`/`governance-judge-prompt` → **（闸门 2 写集增补记录后）** `governance-judge-verdict.ts` 最小加法 → 测试/typecheck。
- **F4 条件**：`governance-judge-verdict.ts` 在统筹/沟通记录写集增补前**不实施**；B1 其他部分可先做，但 AC-24 的 approve 证据必须等该分支落地后才能成立。
- P1–P9 全部不实施（§7.3）；G8 只 A（B/C 不实现，diff/结构证明）。

## 7. 风险、替代、必要 vs 可选

### 7.1 主要风险与控制

| 风险 | 控制 |
| --- | --- |
| SSRF/DNS rebinding | §4.2 全量判表 + 钉扎 + `remoteAddress` + 执行时重解析；安全矩阵 |
| 跨域重定向 | 逐跳同域，跨域 `download-redirect-cross-host`；不自动跟随 |
| 大文件/慢链 | 上限 + 三类超时 + 中止清理；无自动重试 |
| 文件名/目录逃逸 | 净化真值表 + 单文件名 + `wx` + 真实路径复核 |
| 预授权越权 | G8 A epoch（`enabledAt` 必填、同毫秒保守、不可读不重写） |
| 审批绕过 | 独立工具/能力；B1 无第二发卡路径；`request_confirmation` 白名单不变（A1） |
| 测试缝泄漏 | §4.9 生产工厂无 seam + 结构检查 |
| F1 judgeContext 缺口 | presenter 由 B1 提供 `governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`；C1 只映射，不重算/不读账本（§3.3/§3.7） |
| F2 生命周期/归属 | 每会话运行时 + 模块级每项目并发 Map + B1 生成 `downloadId` + `onPresented` requestId + `dispose()`（§3.3/§4.7） |
| F3 旧指令面板 | `list()` epoch-aware 投影：旧 domain ⇒ `consumer:"none"`，C2 不用比较时间（§3.5） |
| verdict 未知卡种压制 | F4 闸门 2 写集增补 + AC-24 测试；**记录前不实施** |
| 诊断字段缺口 | `enabledAt` 不在诊断白名单（共享组件属主 PM）；epoch 文件为权威记录，诊断只记 state/reasonCode（§8 末尾缺口） |
| 代理环境 | Node 不走系统代理；P5 未选，如实失败并提示（不在 B1 实现代理） |

### 7.2 替代方案（为什么没选）

1. **epoch 过滤读取 `approvalFacts()` 而非 `service.list()`**：`ApprovalDirectiveFact` 无 `createdAt`；选 `list()`（同一回放快照、含 `createdAt/status/ledgerErrors`）避免 A1 Model 加法与跨角色往返。若审核要求 fact 带 `createdAt`，回 A1 并重跑；本提案不请求 Model 改动。
2. **Pipeline 直接 import/call `customer-directive.ts`**：工程法案 §一.2 禁止平级互调；选注入 `TakeDownloadDirectiveFn`，C1 接线（与 shell `takeDirective` 先例同向）。
3. **预热 DNS 只做一次**：方案 §5.2 要求执行时重解析钉扎；选两次解析（卡片前 + 执行时 + 逐跳）。
4. **busy 时排队**：方案 §4.5/§5.6 明确 `download-busy` 不排队；选立即失败。
5. **复用 `runtime-core/fs-write.ts::guardWriteTarget`**：该文件是运行时核心私有 common，编排不得导入（工程法案 §一.6）；选共享 `path-primitives` 的同源真实路径口径在本模块实现下载专用守卫（不复制 `guardWriteTarget` 的通用实现，只做下载目录/单文件所需复核）。
6. **Provider 公共入口暴露 resolver/policy seam**：安全评审要求生产不可打开；选生产工厂无 seam + impl/测试工厂注入（§4.9）。
7. **F1 二选一**：选「B1 在 presenter 请求中提供 `governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`」——C1 保持「不读账本、不自造 GovernanceJudgeFacts」的纪律，B1 用既有 `buildGovernanceJudgeFacts` 构造最小形状；不选「C1 自造最小 GovernanceJudgeFacts」（会在 C1 复制编排事实构造）。
8. **F2 二选一**：选「每会话运行时 + 模块级每项目并发/账本串行」；不选「每项目一份运行时」（会把首个会话的 roleId/present 固化，审计/卡片通道错位）。

### 7.3 必要 vs 可选

- **必要（AC 驱动）**：§2 全部产品文件与测试；§3 全部契约；§4 全部安全行为；W-6/W-7；verdict 最小加法（AC-24 前置）。
- **可选（未选、不实施）**：P1 进度可见；P2 在途去重；P3 启动清理；P4 `.gitignore` 维护；P5 代理；P6 压缩解压；P7 `expectedSha256`/病毒扫描；P8 后台/异步；P9 整体回滚开关。G1 A（不改 `.gitignore`，只由 C1 完成后提示）；G8 A only；G7 A（不改 shell 暂停语义）。

### 7.4 停止项（必须回报，不自行处理）

1. 需要改 `src/model/**`、`app/**`、`src/common/shared/**`、`src/common/门禁引擎/**`、`src/service/gate/**`、`package.json`/`tsconfig*`/`vite.config.ts`/`src/index.ts` 或任何 Section 1 外路径。
2. A1 冻结的 `DownloadJudgeFacts`/`RequestDownloadFn`（含上下文）/`DownloadErrorCode`/常量缺字段或形状不符（§6.1）。
3. `RejectionOwner:"requester"` 共享枚举扩展被证明不可行（按团队计划 §8.3 #6 停止，由统筹决定退路）。
4. §2 #26 `governance-judge-verdict.ts` 的**闸门 2 写集增补**未由统筹/沟通记录（F4）——记录前不实施该文件；B1 其他部分可先行，但 AC-24 的 approve 证据在该分支落地前不成立。
5. 需要新增 IPC 类别/`app/preload.cjs` 变更、第三个 `test/桌面应用/` 文件、i18n allowlist 新增等（C1/A2 范围，B1 不碰）。
6. TLS 测试证书无法在环境生成且影响 AC-26 证据（如实回报，不用假证据）。
7. 发现方案/团队计划实质冲突（落盘根/审批语义/预授权匹配/G8 选项/错误码 owner/测试缝策略）——按团队计划 §1.6 重开闸门。

## 8. 与项目规则的核对（P1 审核要求）

来源：`角色卡/项目管理/docs/project-rules.md`（160 行；本 worktree 版本）。

| 规则 | B1 处置 | 结论 |
| --- | --- | --- |
| §一.2 五层方向/相邻层 | Interface→Pipeline→Service→Provider；Pipeline 只经 Service/Provider 公共出口；不向上/跳层；预授权用注入回调避免平级互调 | 符合；替代方案已披露（§7.2 #2） |
| §一.5 共享组件唯一实现 | 复用 `jsonl-ledger`/`atomic-write`/`path-primitives`/`diagnostics`，不复制；不改共享组件 | 符合；`jsonl-ledger` 已登记于 `角色卡/项目管理/docs/architecture/shared-components.md`（组件 10，:121）；仅 `project-rules.md` §一.5 的组件清单未同步到组件 10——**PM 文档清单滞后**，B1 按已登记共享组件只读复用，不新建登记 |
| §一.6 私有 common 隔离 | 不导入 `src/common/runtime-core/**` 等他人私有 common；本角色私有 `src/common/编排/` 内加法 | 符合；`mechanical-rejection.ts` 已被其他角色既有导入（先例），B1 只做加法 |
| §二.9 风险档位 | 团队计划已定 T3；B1 提供层内证据，D1 全量 | 符合 |
| §二.10 必要打印/日志 | 用 `createDiagnosticLogger`（共享）记录 stage/outcome/reasonCode/bytes/duration/busy/state 等白名单字段；不记 URL 正文/purpose/响应体/凭据 | 符合；`enabledAt` 不在白名单（§7.1 缺口） |
| §二.13/16 卡片与开关 | 下载卡是应用自有 confirm 卡（同 `requestRequirementChange` 先例），仍走卡片通道，不在聊天口头询问；approval 组受「替我审批」开关；**manual/不可核对转客户卡**是客户闸门 1 确认的方案 §4.2/F12，与规则 16 所述 `request_confirmation` 写卡「按现状拒绝」不同卡种、不同语义 | **需 P1 审核确认**：若项目管理认为构成规则冲突，按方案（客户已确认）优先并在审核记录裁决；B1 不静默偏离 |
| §二.17 证据截图 | B1 只产层内测试/结构证据；截图属 D2 | 符合 |
| §四 调度记录 | B1 不写 `docs/scheduling/` | 符合 |

其它缺口：`project-rules.md` §一.5 的「现有共享组件」清单未同步 `shared-components.md` 的组件 7–10（含 `jsonl-ledger`）；`shared-components.md` 实际位于 `角色卡/项目管理/docs/architecture/shared-components.md`（**存在**）。均为 PM 文档维护事项，不阻断 B1（只读复用、不复制、不扩权）。

## 9. 基线披露与声明

- **基线**：HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`；产品/测试区干净、暂存空；H1 的 B-2/B-3 已在编排 `boundary.yaml` 落地；本提案不依赖 `origin/main` 后续变化；若实施入口 `origin/main` 前进，按团队计划 §1.5.3 更新基线并重记 B0（E1 披露）。
- **PR #57 重叠**：`customer-directive.ts` 852 行 / `e48041eaaa3c1a50e478e325937f3f2a0d495e3a9807b629293f973715eef84a`（+153 行自然语言解释）；解释器 `src/common/编排/directive-interpreter.ts` 419 行 / `c09c2950799c51f8cd7f1a19a00b015098febc074fb1092a4dd785835e647da9`。B1 只追加 `takeDownloadDirective`，不改解释/预填路径；G8 对所有来源统一。
- **PR #58**：不在 B1 写集（`app/desktop/customer-input.ts` 由 C1 合并）。
- **设计锚点漂移**：方案行号基于 `c8a9394`；B1 以符号/文本锚点实施（`takeDirective`/`consumerOf`/`requiredArtifactPaths`/`switch (request.cardKind)`/`SAFE_MANUAL_REASON_CODES` 等）。
- **V1/B0**：V1 1056 行 / `4a7c66ab…`；B0 v2 239 行 / `73c660c6…`（3665/3638/9/18；编排 60 文件 757/756/1/0）。
- **P1 审核（Revision 1 依据）**：`角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md` 340 行 / `503aaf347be69b67bf7bc0bb6e426151f71f5f4a572dbdc32203ff711be0e530`；本提案修订前 720 行 / `c6b3737f…`。Revision 1 处置 F1/F2/F3/F4/F6/F9/F10/F11/F12/F15/F18/F22（§10 逐项）；复审以本修订后的新行数/SHA-256 为准。
- **状态声明**：本提案 **proposal-only**——未改任何产品/测试代码、角色卡/边界/changelog、`docs/scheduling|acceptance|communication` 或其他角色文件；未 commit/push；未运行实施测试。实现状态在 B1 完成后由完成报告如实标 `implemented-unverified` 并提供候选哈希/原始输出。
- **发现汇总**：未发现边界外写入需求；发现 1 处团队计划写集遗漏（`governance-judge-verdict.ts`，目录内），按 PM 审核 **F4** 列为**闸门 2 写集增补条件**（记录前不实施）；PM 文档清单滞后 1 处（`project-rules.md` §一.5 未同步 `shared-components.md` 组件 7–10），不影响 B1 实施。`shared-components.md` 实际存在（`角色卡/项目管理/docs/architecture/`），本修订已纠正先前路径表述（F15）。

## 10. Revision 1 处置（对照 PM 审核 F1–F22）

| 项 | 处置（本修订位置） |
| --- | --- |
| **F1（阻断）** | §3.3 `DownloadApprovalRequest` 新增 `factsAvailable`、`governanceFacts`（最小 `GovernanceJudgeFacts`，`buildGovernanceJudgeFacts({flowId})` 构造）、`downloadFacts`、`attribution`（真实/合成归属键 + `flowIdIsSynthetic`）；`toolCallId/turnId` 保留；构造点、C1 映射与 `factsAvailable:false` 语义写入 §3.3/§3.7/§6.3；测试 §5.1 #3。 |
| **F2（阻断）** | §3.3 冻结**每会话运行时**（`roleId/runtime/present/takeDownloadDirective/appVersion` 工厂绑定）；**B1 生成 `downloadId`**（`DownloadRunInput` 无该字段/无 `requestId`）；presenter 冻结 `present(request,hooks)+onPresented`（outcome.requestId 仅兼容）；新增 `dispose()`；模块级每项目并发 Map + `jsonl-ledger` 串行链依据写入 §4.7；C1 交接 §6.3。 |
| **F3（阻断）** | §3.5 冻结 **`CustomerDirectiveRuntime.list()` epoch-aware 投影（方案 2）**：旧 domain ⇒ `consumer:"none"`、新 domain ⇒ `"download"`、epoch 不可读 ⇒ 全部 none；只读 epoch、不创建；C1 的 `directive-input.ts` **无需修改**；C2 只消费 `"download"`/`"none"+domain`，不比较时间。`consumerOf` 仍是创建时基线。 |
| **F4（闸门 2 写集增补条件）** | §2 #26 正式列为增补条件（PM 审核依据）；§6.5 明确记录前不实施；§7.4 停止项更新。 |
| **F6（计划内实施顺序）** | §3.6/§5.2/§6.5 冻结：B1 开工第一动作补 `run-role.ts:2125::CARD_KIND_ROUTE_HINTS.download` + 更新 `test/编排/decision-card.test.ts` 精确键集；B1 typecheck exit 0；A1 在合并树上重跑最终 typecheck。 |
| **F9（非阻断）** | §3.1 拆 `suggestCardFilename`（卡片阶段仅 url-basename/caller/fallback）与 `resolveExecutionFilename`（可 content-disposition）；`DownloadJudgeFacts.filenameSource` 只取卡片阶段；§5.1/§6.1 同步。 |
| **F10（非阻断）** | §3.3 `DownloadRunInput.attribution`（C1 从会话/任务上下文给真实 flowId/intentId/taskId）；B1 解析第一个合法 slug，否则合成 `"download"` + `flowIdIsSynthetic`；C1 不写合成值到 `request.created.flowId`（§3.7/§6.3）。 |
| **F11（非阻断）** | §6.3 列全 C1 工厂入参（`appVersion/present/takeDownloadDirective`）与每会话创建/dispose；C1 提案按其修订消费。 |
| **F12（非阻断）** | §3.3 `DownloadRequestRuntime.dispose()`（幂等；中止本运行时在途下载并释放执行槽）；§6.3 明确 C1 调用。 |
| **F15（非阻断）** | §8 纠正 `shared-components.md` 实际路径（`角色卡/项目管理/docs/architecture/shared-components.md`；`jsonl-ledger` 组件 10）；仅 project-rules §一.5 清单滞后。 |
| **F18（非阻断）** | §3.8/§6.3：`RejectionOwner:"requester"` 无其他编译消费点；C1 在 `rejection-copy.test.ts` 增加显示/回归覆盖（B1 只登记 owner）。 |
| **F22（非阻断）** | §3.4 #8：`takeDownloadDirective` 读 `service.list()` 的「同一快照、`ledgerErrors>0 ⇒ 按无指令、绝不重复消费」写入 `customer-directive.ts` API 注释；匹配语义不变。 |

> 其余 PM 审核项（F5/F7/F8/F16/F17/F20 等）属 C2/A2/C1 各自提案的修订范围，本提案只冻结 B1 侧形状并在 §6.3 标注交接；F13（`directive-input.ts`）因本修订选择 `list()` 投影方案而**不需要** C1 改该文件。F4/F6 不在本修订中实施（提案只写契约与顺序）。
