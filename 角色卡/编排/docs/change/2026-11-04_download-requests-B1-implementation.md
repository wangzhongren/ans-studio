---
id: download-requests-b1-implementation
type: change
title: 变更记录：下载文件申请 B1 实施（编排 Provider/Service/Pipeline + 指令消费者 + judge 集成）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: B1 实施完成（implemented-unverified）；未 commit/push；候选哈希与证据见 evidence 目录
---

# 变更记录：下载文件申请 B1 实施（编排）

- **角色/节点**：编排（Orchestration）/ `2026-11-04-download-requests` / B1（下载执行与指令/判断集成，T3）。
- **状态**：**implemented-unverified**——源码/测试已按冻结提案 Revision 1 落地并通过 B1 层验证；未 commit/push；未做 D1 全量 T3、C1/C2/D1/D2、E2。
- **依据**：P1 提案 Revision 1（821 行 / `291af57c…`）+ PM 最终复审 `recommend approval`（611 行 / `98373dfa…`）+ 团队计划 §4.3/§5.3/§6.2 + V1 AC-3/5/7–18/21/23–27/29 + 闸门 2 写集增补记录（`docs/communication/2026-11-04_gate2-writeset-addendum_download-requests.md` 32 行 / `000022cd…`；F4 已确认）。
- **基线**：HEAD `f0adb49058dd126b2b249cfa703993f65092f99b`（本地候选提交 `3c88fae` + 合并 origin/main `f4c24ea`）；B0 v3 `角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline-v3.md` 213 行 / `1242c51496f03560cdcbffe48956077873c9944b9566b1f7ae45af80e966c30b`（T3 410 文件 / 3697 tests / 3670 pass / 9 fail / 18 skip；编排 60 文件 / 767/766/1/0）。
- **证据目录**：`角色卡/编排/docs/change/2026-11-04_download-requests-B1-evidence/`（原始日志、候选逐文件哈希、status/diff 索引；见 §7）。

## 1. F6 首动作（编译解锁）

- `src/pipeline/orchestration/run-role.ts`：`CARD_KIND_ROUTE_HINTS` 补 `download` 一行（「下载卡只由 request_download 工具经应用通道发起；不得用 request_confirmation/request_choice 发下载卡」）。
- `test/编排/decision-card.test.ts`：`GOVERNANCE_CARD_GROUP` 精确键集加 `"download"`、`governanceCardGroup("download")==="approval"`、标题/approval 组描述同步；`request_confirmation` 枚举仍只 `appointment-write`。
- 结果：`npm run typecheck` **exit 0**（`01-typecheck.log`）；A1 按 R1 口径可在合并树上重跑最终 typecheck。

## 2. 写集与实现

### 2.1 新增（Provider/Service/Pipeline）

| 路径 | 内容 |
| --- | --- |
| `src/provider/download/abstract/download-provider.ts` | `HostResolver`/`PinnedAddress`/`DownloadTransport`/`TransportRequest`/`TransportResult`/`DownloadLimits`/`DownloadProviderError` |
| `src/provider/download/abstract/download-ledger.ts` | `DOWNLOAD_LEDGER_REL`、`DownloadLedgerEventV1`、`DownloadLedger` |
| `src/provider/download/abstract/download-consumer-epoch.ts` | `DOWNLOAD_CONSUMER_STATE_REL`、`DownloadConsumerEpochState`（ready/missing/unreadable）、`DownloadConsumerEpochStore` |
| `src/provider/download/impl/node-resolver.ts` | 全量 DNS（`dns.lookup all/verbatim`）、去重、10s 超时、IP 字面量直返、`download-dns-failed` |
| `src/provider/download/impl/node-http.ts` | Node http/https 流式传输：钉扎 lookup、`remoteAddress` 复核、逐跳重定向回调、状态/编码/长度、连接/空闲/总超时、AbortSignal、无重试、TLS 固定校验 |
| `src/provider/download/impl/file-sink.ts` | `download/` 目录真实路径守卫、`wx` 占位 + ` (n)`、`.part` 临时 + sha256 + fsync + `renameReplacingExisting`、失败清理 |
| `src/provider/download/impl/jsonl-ledger.ts` | `downloads.jsonl` 追加/读取/坏行/轮转（复用 `jsonl-ledger`） |
| `src/provider/download/impl/consumer-epoch-store.ts` | epoch 首次创建（`wx`+fsync）、只读、不可读不重写 |
| `src/provider/download/public/download-provider.ts` | 公共出口（类型/常量/生产工厂；不暴露测试缝） |
| `src/service/download/abstract/download-policy.ts` | `DownloadConfig`/`NormalizedUrl`/`IpDecision`/`DownloadPolicy`/两阶段文件名类型 |
| `src/service/download/impl/ip-policy.ts` | IPv4 拒绝清单 + IPv6 `2000::/3` 正向 + 特殊段排除（纯字节解析） |
| `src/service/download/impl/url-policy.ts` | URL/协议/凭据/端口/主机归一化/同域/消息 URL 净化 |
| `src/service/download/impl/filename.ts` | 卡片/执行两阶段文件名、Content-Disposition（filename* 优先）、净化真值表 |
| `src/service/download/impl/config.ts` | `ANS_DOWNLOAD_*` env 解析、默认值来自 A1 常量、非法回退+诊断 |
| `src/service/download/impl/download-service.ts` | `DownloadPolicy` 组合、`boundJudgeFacts` ≤2KiB（只截断 url/purpose） |
| `src/service/download/public/download-service.ts` | 公共出口（工厂/类型/常量） |
| `src/pipeline/orchestration/download-request.ts` | 每会话运行时；B1 生成 `downloadId`；presenter `present(request,hooks)+onPresented`；`dispose`；每项目并发 ≤2；预授权/epoch/审计/失败码 |

### 2.2 修改（既有文件）

| 路径 | 改动 |
| --- | --- |
| `src/pipeline/orchestration/customer-directive.ts` | `takeDownloadDirective`（`enabledAt` 必填、deny 优先、once 消费、同快照/ledgerErrors）；`list()` G8 A epoch 投影（旧 domain ⇒ `consumer:"none"`，新 domain ⇒ `"download"`）；`downloadEpochStore?` 测试缝 |
| `src/pipeline/orchestration/run-role.ts` | `AdapterCapabilities.requestDownload` + `openRoleSession` 输入/`createRuntimeAdapterFactory` 透传；F6 `CARD_KIND_ROUTE_HINTS.download` |
| `src/service/directive/impl/directive-service.ts` | `consumerOf`：domain ⇒ `"download"`；shell/decision/path 不变 |
| `src/common/编排/mechanical-rejection.ts` | `RejectionOwner:"requester"`；17 个 `download-*` 的 `DOWNLOAD_RULES`（`Record<DownloadErrorCode,...>` 穷尽）合入 `RULES`；`download-facts-missing` 入 `UNVERIFIABLE_REJECTION_CODES` |
| `src/common/编排/governance-judge-facts.ts` | W-6：`requiredArtifactPaths` `case "download"` ⇒ `{paths:[],missing:false}` |
| `src/common/编排/governance-judge-prompt.ts` | W-7：download（approval）rubric；本次请求渲染 `request.download` + 合成归属标注 |
| `src/common/编排/governance-judge-verdict.ts` | F4：`case "download"`（confirm+confirmed:true）、`isConfirm` 拆 `isWriteConfirm`/`isDownloadConfirm`、`SAFE_MANUAL_REASON_CODES` 加 `download-facts-missing` |
| `src/common/编排/governance-judge.ts` / `governance-judge-evidence.ts` | **零改动**（`contextProblem` 经 `governanceCardGroup` 通过；证据包对未知卡种 `artifactRequired=false`；B1 实际 diff 为空） |

### 2.3 测试

新增：`test/编排/download-policy.test.ts`（10）、`download-provider.test.ts`（11）、`download-pipeline.test.ts`（14）、`download-judge.test.ts`（4）；TLS 夹具 `test/编排/fixtures/download-tls/`（CA/自签/过期/主机名不匹配/有效 CA 签名；仅测试用私钥）。
既有更新：`customer-directive.test.ts`（+3：takeDownloadDirective/list 投影/consumerOf）、`unverifiable-rejection.test.ts`（download-facts-missing 正例 + 下载码负例）、`decision-card.test.ts`（F6 键集）。

## 3. 契约冻结声明（B1 退出）

以下形状冻结，C1/C2/D1 只消费；变更回 B1 并重跑受影响证据：

- Provider/Service 公共出口与 abstract 类型；生产工厂无 resolver/provider/地址放行/TLS 关闭 seam；`createDownloadRequestRuntimeForTest` 仅测试装配。
- `DownloadRequestRuntime`：`ready()`/`consumerEpoch()`/`download()`/`dispose()`；每会话一份。
- `DownloadRunInput`（url/filename?/purpose/toolCallId?/turnId?/signal?/attribution?；**无** downloadId/requestId）。
- `DownloadApprovalRequest`：`downloadId`/roleId/runtime?/toolCallId?/turnId?/`factsAvailable`/`governanceFacts`/`downloadFacts`/`attribution`/`policy`/signal?。
- `DownloadApprovalPresenter.present(request, hooks)`；`onPresented({requestId})` 为 requestId 主来源；`DownloadApprovalOutcome.requestId?` 仅兼容。
- `DownloadApprovalOutcome`（approved/declined/unavailable/aborted）、`DownloadApproval`、`DownloadRunResult`（成功 path/bytes/sha256/finalUrl/approval/message；失败 code/message/httpStatus?/detail?/redirectTo?/approval?）。
- `takeDownloadDirective({host, enabledAt, toolCallId?})` + `DownloadDirectiveQuery`/`TakeDownloadDirectiveFn`；`CustomerDirectiveRuntime.list()` epoch 投影语义。
- `consumerOf("download")`；W-6/W-7；错误码/owner/UNVERIFIABLE；`downloads.jsonl`/`download-consumer.json` 形状；每项目执行并发 ≤2；预授权路径零 `request.*`。

## 4. 验证（原始日志见证据目录）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0**（`01-typecheck.log`） |
| `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | **64 文件 / 799 tests / 798 pass / 1 fail / 0 skipped / 0 todo**（`02-orchestration-suite.log`）；唯一 fail 为 B0 v3 既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:184`） |
| 四个下载新测试文件（`--test-concurrency=1`） | **39 tests / 39 pass / 0 fail / 0 skip**（`03-download-tests.log`） |
| B0 v3 对照 | 编排 60 文件 / 767/766/1/0 → 64 文件 / 799/798/1/0；**新增确定性失败 0、新增 skip 0**；fail 仍为同一既有 EPERM |

- 测试命令未新增 runner/配置；未跑 `typecheck:renderer`/`build:renderer`（B1 不触渲染面；D1 统一跑）；未跑全量 T3（D1 在冻结候选上跑）。
- 开工/收尾 `git status --porcelain -- src app test` 均只含 B1 写集（`04-status-final.txt`）；`git diff --cached --name-only` 为空（`04-staged.txt`）。

## 5. 安全矩阵与测试映射

| 威胁/AC | B1 控制 | 测试证据 |
| --- | --- | --- |
| AC-7 SSRF / IPv4 清单 / IPv6 特殊段 / 混合 / 整数写法 | Service 判表（全部结果）；Provider 钉扎 lookup + `remoteAddress` 复核 | `download-policy.test.ts` IPv4/IPv6 表；`download-pipeline.test.ts` 混合/DNS；`download-provider.test.ts` rebinding |
| AC-8 重定向 | 仅 301/302/303/307/308；逐跳回调；跨域 `download-redirect-cross-host`；`https→http` 拒绝；>5 跳/异常 3xx/缺 Location | `download-provider.test.ts` 同域 5 码/跨域/降级/304/缺 Location/loop |
| AC-9 大小/状态 | Content-Length 与流式计数；仅 200 写盘；204/206/201/500 | `download-provider.test.ts` 超限/状态断言 + 目录无残留 |
| AC-10 超时/中止/无重试 | 连接/空闲/总超时、AbortSignal；每 hop 一次请求 | `download-provider.test.ts` 三类超时/中止/服务端 hits=3 |
| AC-11 文件名 | 两阶段优先级；净化真值表；重名 ` (1)` 不覆盖 | `download-policy.test.ts` 真值表；`download-provider.test.ts` 重名 |
| AC-12 原子性 | `.part` + fsync + rename + 失败清理 | `download-provider.test.ts` 成功无残留；超时/中止清理 |
| AC-13 目录边界 | `download/` 真实路径守卫；普通文件/符号链接拒绝；单文件名 | `download-provider.test.ts` 普通文件拒绝/创建 |
| AC-14/27 预授权 | `takeDownloadDirective` epoch/deny/allow/once/通配；`list()` 旧指令 `consumer:"none"` | `customer-directive.test.ts`；`download-pipeline.test.ts` 指令路径/epoch |
| AC-16 并发 | 模块级每项目 Map ≤2；busy；同名 Provider `wx` | `download-pipeline.test.ts` 并发/busy；`download-provider.test.ts` 重名 |
| AC-17/21 审计 | requested/decided/started/completed/failed；by 字段；预授权无 requestId；B1 无 `request.*` | `download-pipeline.test.ts` 事件序列/负例；`download-provider.test.ts` 账本坏行 |
| AC-24/25 judge | W-6/W-7；F4 verdict；facts ≤2KiB；合成归属 | `download-judge.test.ts`；`download-policy.test.ts` facts 截断 |
| AC-26 TLS | 自签/过期/主机名不匹配 ⇒ `download-network-error`；无关闭开关 | `download-provider.test.ts` 三类 TLS |
| AC-29 边界状态码 | 300/304/305/306/缺 Location/204/206/其他 2xx ⇒ http-error；仅 200 文件 | `download-provider.test.ts` |
| 生产测试缝关闭 | 生产工厂无 seam；`app/**` 无 `ForTest`；类型级 `@ts-expect-error` | `download-pipeline.test.ts` 结构/类型检查 |
| 凭据/响应体不落账 | URL 去 userinfo；错误 detail 仅状态/原因；账本字段上限 | `download-policy.test.ts`/`download-provider.test.ts` 断言 |

## 6. AC 映射（B1 交付）

| AC | B1 证据 |
| --- | --- |
| AC-3 | `download-pipeline.test.ts` presenter 上下文/字段；C1 负责卡片/`request.created/presented` |
| AC-5 | `download-judge.test.ts` W-6/W-7/F4；`download-policy.test.ts` facts ≤2KiB |
| AC-7–13 | `download-policy.test.ts` + `download-provider.test.ts`（见 §5） |
| AC-14 | `customer-directive.test.ts` takeDownloadDirective/list 投影；`download-pipeline.test.ts` 预授权路径 |
| AC-15 | `download-pipeline.test.ts` 稳定 code/presenter 失败；`download-provider.test.ts` rename 后成功/无重试 |
| AC-16 | `download-pipeline.test.ts` busy/dispose；`download-provider.test.ts` 同名 |
| AC-17 | `download-pipeline.test.ts` 事件序列/预授权无 requestId；`download-provider.test.ts` 账本 |
| AC-18 | 未触 shell 闸/写守卫/CLI；B1 diff 仅写集；受影套件见 §4 |
| AC-21 | `download-pipeline.test.ts` by:directive/customer/judge |
| AC-23 | `download-pipeline.test.ts` 无第二发卡路径/结构扫描；A1 工具夹具 |
| AC-24 | `download-judge.test.ts` verdict download approve；`download-pipeline.test.ts` presenter 上下文 |
| AC-25 | `download-policy.test.ts` boundJudgeFacts；`download-pipeline.test.ts` 截断字段 |
| AC-26 | `download-provider.test.ts` TLS 三类 |
| AC-27 | `customer-directive.test.ts` epoch 投影/匹配；`download-provider.test.ts` epoch store |
| AC-29 | `download-provider.test.ts` 状态码矩阵 |

## 7. 候选哈希与证据索引

- 候选文件清单：`...-B1-evidence/05-candidate-files.txt`（41 项：B1 源码/测试/TLS 公钥+私钥夹具）。
- 逐文件 `git hash-object`：`05-hash-object.txt`；`sha256sum`：`05-sha256.txt`；合并表：`05-candidate-hashes.txt`。
- 原始输出：`00-baseline.txt`/`00-head.txt`/`00-status-src-app-test.txt`/`00-node-npm.txt`、`01-typecheck.log`、`02-orchestration-suite.log`、`03-download-tests.log`、`04-status-final.txt`/`04-diff-stat.txt`/`04-staged.txt`。
- HEAD `f0adb49058dd126b2b249cfa703993f65092f99b`；工作区未 commit/push；staged 为空。
- 证据索引：`INDEX.sha256` 16 项 / `4db7bde718428b447ee35200fb951420117450c147edad6da93d7202db39b6a0`。

## 8. 未完成 / 风险 / 交接

- **未做（按团队计划归后续节点）**：C1 桌面接线、C2 渲染、D1 跨层/T3 全量、D2 真实 Electron 截图、E1/E2；B1 不声称整体完成。
- **F4**：`governance-judge-verdict.ts` 按闸门 2 写集增补（`000022cd…`）实施；无其它写集外路径。
- **G8 A**：epoch 创建/读取/不可读不重写已落地；面板旧指令标注依赖 C1/C2 消费 `consumer:"none"`（B1 已冻结投影）。
- **F9**：执行阶段 `content-disposition` source 不写入 `DownloadJudgeFacts`（卡片事实只取 url-basename/caller/fallback）。
- **F10**：归属键由 C1 经 `DownloadRunInput.attribution` 提供；B1 合成 `"download"` 且 `flowIdIsSynthetic`；合成值不写 `request.*`（B1 不写）。
- **测试夹具**：TLS 私钥/证书仅测试用；`download-tls` 目录内 CA key 仅供本地测试，不用于生产。
- **残余**：Windows 上真实符号链接测试按环境可能 EPERM（B0 既有）；本 B1 未新增 skip/确定性失败。
