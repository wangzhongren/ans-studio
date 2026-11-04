# 变更记录：下载文件申请 A1（运行时核心）— Model / 工具契约 / 运行时透传

- **任务 / 节点 / 角色**：`2026-11-04-download-requests`（flowId `download-requests`，T3）/ A1 / 运行时核心（独立固定上下文）。
- **日期 / 状态**：2026-11-04；**`implemented-unverified`**（已实施、层内测试已跑；未独立验收、未 commit/push/merge/release）。
- **依据**：客户闸门 1 确认的 P1.1（正文 1017 行 / `2590b560…`）；P1 审核最终复审 `recommend approval`（`角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`，611 行 / `98373dfada8b46759a96ff95096cd00523808de305e2ec7832d89e901adb734d`）；本角色 P1 提案（427 行 / `84c1148ead476a6049e82d6318362bd8ffa33c0d12e75273e025b831787df951`，未改）；闸门 2 写集增补 + V1 确认记录（32 行 / `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310`，含 F6 R1 口径）；V1（1056 行 / `4a7c66ab…`）；团队计划（693 行 / `d9760755…`）；B0 v2（239 行 / `73c660c6…`）。
- **基线**：HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`；分支 `feat/download-requests`；Node `v24.22.1` / npm `11.19.1`；OS `MINGW64_NT-10.0-26300`（Git Bash）。
- **写入路径**：本记录 + `2026-11-04_download-requests-A1-evidence/`（原始日志与哈希索引）+ `api-spec.md` 追加。**未写任何其他角色文件、边界/YAML/changelog、`docs/{planning,scheduling,acceptance,communication}`；未 commit/push。**

## 1. 开工核对与并发披露

- 开工 `git status --porcelain -- src app test` 非空：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 与 `test/项目管理/shared/i18n.test.ts` 为 **A2（项目管理）并行授权写入**（团队计划 §5.2 允许 A1/A2 并行，写集不相交）；**A1 写集未被触碰**，按授权并行继续。除此之外未观察到其他非本角色写入；收尾仍仅上述 A2 文件 + A1 文件。
- 收尾 `git status --porcelain -- src app test`：A1 为 `M src/model/{runtime,directive}.ts`、`M src/provider/runtime/{tools,schema}.ts`、`?? src/model/download.ts`、`?? test/runtime-core/download-{contract,tool}.test.ts`；A2 三文件保持并行；`git diff --cached --name-only` 为空（未暂存）。
- `src/service/runtime/session.ts` **未改（0 行）**：sha256 `e36ffc22…` 与写前基线一致；W-1 Service 段由 `RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>` + `buildGovernedTools(options.gate, {…options})` 结构性透传，由 Service 级测试证明。

## 2. 精确写集与候选哈希（工作区实测）

| 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- |
| `src/model/download.ts` | 新增 | 166 | `3a14bf049843b2765212367b0e72c9aaf9a71fc8` | `3dbdcb52f80569323633d45f7cadb19b934638bbef0b4b797ebb9a7160c7d278` |
| `src/model/runtime.ts` | 加法 | 2794 | `a3545bedf84c4abfc74cace914d4ed6a126f4246` | `13459b987b1d4e5c3ae40749f1ca1b0456a262e183b9ceb3278b1ad0520f0344` |
| `src/model/directive.ts` | 加法 | 317 | `3636bca8b3332a287a322cb22197edeac14d37fa` | `5c522c44522257e222781dbeea66a0065d2f1239acde317b5138c923f960e688` |
| `src/provider/runtime/tools.ts` | 加法 | 3890 | `9cf198cb421226d222657f63edbb9a17fa21ac74` | `5d64eb7bf278e4012ce886419e16128dad45f3f0c09235f7f9c30b9a5acdd85b` |
| `src/provider/runtime/schema.ts` | 加法 | 1475 | `858a29caf83a257eca905382b4dadd4d0af46a48` | `cfdc9ef75989ed3917e458a6fe66968941df4e4b98f2caab5377182e23c5d0e2` |
| `src/service/runtime/session.ts` | 不改（0 行） | 721 | `003d15928ff27b9427cef00ed30541ebe9395426` | `e36ffc226cc95ba7d25fd643b1c182c2e0694ef55f36d0b6b6a74ccd284d4d60` |
| `test/runtime-core/download-contract.test.ts` | 新增 | 255 | `eefe8e3f869df81f778ffe560f842bbd360e6018` | `b16b7163aea63fe8f820d9afa163cfeb11ab338b537587adf1bce7612bd62bc9` |
| `test/runtime-core/download-tool.test.ts` | 新增 | 390 | `8252ace7f8542fdc08188e65b451313b339bb905` | `71d34c67e7ad1f4281312ebdffa4b5255cafa7e7a739e82355131ae223a1bcc9` |

既有 runtime-core 测试**未改**（默认工具面/确认工具行为断言均未受影响）。

## 3. 实施内容（冻结面）

- **`src/model/download.ts`（新）**：`DOWNLOAD_REQUEST_SCHEMA="download-request/v1"`；常量 `DOWNLOAD_DEFAULT_MAX_BYTES=104857600`、`URL_MAX_BYTES=2048`、`PURPOSE_MAX_BYTES=1024`、`FILENAME_MAX_CHARS=128`、`FILENAME_MAX_BYTES=200`、`JUDGE_FACTS_MAX_BYTES=2048`、默认连接/空闲/总超时 `15000/30000/300000` ms；`DownloadErrorCode` 17 值 + `DOWNLOAD_ERROR_CODES` 冻结数组；`DownloadRequestInput{url,filename?,purpose}`；`DownloadRequestMetadata{signal?,roleId?,runtime?,turnId?,toolCallId?}`；`DownloadApprovalSource`；`DownloadRequestResult` 判别联合（成功必带 `message/path/bytes/sha256/finalUrl/approval`，失败必带 `message/code`）；`RequestDownloadFn(input, metadata?)`；`DownloadJudgeFacts`（url/scheme/host/port?/resolvedIps/resolvedIpsTotal/resolvedIpsTruncated/filename/filenameSource/purpose/maxBytes/mechanical）。只 import type `RuntimeKind`（`common/shared/runtime-shared.ts`），不 import `runtime.ts`（无双向循环）、无 I/O。
- **`src/model/runtime.ts`（加法）**：`GovernanceCardKind` 增 `"download"`（`GovernanceConfirmCardKind` 仍仅 `appointment-write`）；`GOVERNANCE_CARD_GROUP.download="approval"`（任务账本 cardKind 白名单随键集接受、`governanceCardGroup("download")==="approval"`）；`GovernedToolsOptions.requestDownload?`；`GovernanceJudgeRequest.download?` / `GovernanceJudgeContext.download?`（仅 `cardKind==="download"`）；`GovernanceJudgeFacts` 未加字段；事件类型 `request.created/resolved.cardKind` 自动接受 `"download"`。
- **`src/model/directive.ts`（加法）**：`CustomerDirectiveView.consumer` 增 `"download"`；注释同步（`none` 收窄为 path 等）；指令创建/撤销/高危语义与 PR #57 解释器类型未改。
- **`src/provider/runtime/tools.ts`（加法）**：`REQUEST_DOWNLOAD_TOOL_NAME`；`readDownloadInput` 形状校验（未知参数；url 非空/≤2048 B/可解析/仅 http(s)/host 非空/无 userinfo；purpose 非空/≤1024 B；filename 可选/≤128 码点/无 NUL·控制符·路径分隔符；纯空白 filename 视作未提供）；`downloadReceiptMessage` 运行时复核（成功路径 `download/<单文件名>`、bytes 非负整数、sha256 64 hex、finalUrl 非空、approval 三形状；失败 code 必须在 `DOWNLOAD_ERROR_CODES`，消息缺 code 时追加 `[技术 code：…]`；契约外/抛错 fail-closed，抛错固定 `download-unavailable` 且不带原始异常文本）；`buildGovernedTools` **仅在注入 `options.requestDownload` 时注册**；`abortedToolResult` 增下载分支（不假设已下载/未下载）。
- **`src/provider/runtime/schema.ts`（加法）**：`describeTool("request_download")`（`required:["url","purpose"]`、`additionalProperties:false`、`executionMode:"sequential"`、中文描述钉「申请≠批准/三条审批路径/稳定 code/不自动重试/跨域重申请/download 限定/不得用 request_confirmation」与 3 条 guidelines）。
- **`src/service/runtime/session.ts`**：不改（见 §1）。

## 4. 验证（原始输出见证据目录）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| runtime-core 全目录 | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | exit 1；**41 文件**（B0 39 + 2 新）；**tests 323 / pass 316 / fail 3 / cancelled 0 / skipped 4 / todo 0**；duration 30581.74 ms |
| 失败分类 | 同上 | 3 项与 B0 v2 **逐名一致**，均为既有 Windows symlink EPERM：`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46`、`:58`；**新增确定性失败 0、新增非 EPERM 失败 0、新增 skip 0** |
| 新增测试定向 | `node --test --test-concurrency=1 test/runtime-core/download-contract.test.ts test/runtime-core/download-tool.test.ts` | **exit 0；14 tests / 14 pass / 0 fail / 0 skip** |
| typecheck | `npm run typecheck` | **exit 1；恰 1 个错误，位于 B1 写集**：`src/pipeline/orchestration/run-role.ts(2125,7): error TS2741: Property 'download' is missing … Readonly<Record<GovernanceCardKind, string>>`；**无其它错误** |
| 暂存区 | `git diff --cached --name-only` | 空 |

- **B0 v2 对照**：runtime-core `39 → 41` 文件、`309 → 323` tests、`302 → 316` pass、fail `3 → 3`（同名）、skip `4 → 4`；**新增确定性失败 = 0、新增 skip = 0**。
- **F6/R-1 条件（按 addendum §二与审核复审）**：唯一 typecheck 红点在 B1 文件 `run-role.ts:2125`；A1 不改该文件。最终 A1 `typecheck` 冻结证据须待 B1 开工第一动作补 `CARD_KIND_ROUTE_HINTS.download` 一行（并更新 `test/编排/decision-card.test.ts` 键集断言）后，在合并树上重跑 `npm run typecheck`（exit 0）并记录。**本记录不宣称 repo-wide typecheck 已通过。**

## 5. AC 覆盖（A1 承担部分）

- **AC-1**：`request_download` 仅注入才注册；未注入不在工具面；Service 普通会话透传、`governanceJudge`/`shellJudge` 会话均无（`04-new-tests.log`）；CLI 归 D1。
- **AC-2**：非法 url/purpose/filename/未知参数 ⇒ `ok:false` + `download-invalid-arguments` + 「未发卡、未联网」，能力调用 0；边界值（2048 B url / 1023 B purpose / 128 码点 filename）合法。
- **AC-15（工具层）**：成功原样转达；17 个失败码逐个带 code；契约外回执/抛错 fail-closed；每次调用能力恰一次、无自动重试。（rename 后成功、`once` 不重复消费归 B1/D1。）
- **AC-23**：`GovernanceConfirmCardKind` 仍仅 `appointment-write`（`@ts-expect-error` 锁定）；`request_confirmation` 以 `cardKind:"download"` 调用被拒且不触达客户通道；schema enum 仍 `["appointment-write"]`；`request_download` 是唯一下载卡工具路径。
- **AC-25（Model 侧）**：`GovernanceJudgeContext.download` ↔ `GovernanceJudgeRequest.download` 可选/双向同形；`GovernanceJudgeFacts` 无 download（`@ts-expect-error`）；`DownloadJudgeFacts` 字段与 `DOWNLOAD_JUDGE_FACTS_MAX_BYTES=2048` 锁定；截断/卡片标记归 B1/C1/D1。
- **AC-14（Model 侧）**：`CustomerDirectiveView.consumer` 加 `"download"` 且既有值不回归（`consumerOf` 行为归 B1）。
- **AC-24（Model/工具侧）**：W-1 字段与 Service 透传、W-5 字段；W-2/W-3/W-4/W-6/W-7/W-8 归 C1/B1，D1 调用计数。

## 6. 契约冻结声明（A1，含 F6 条件）

> 本节为合并前（`c2f1630`）的中间冻结声明；F6 编译解锁条件已在 **§9 合并基线 f0adb49** 关闭，最终声明见 §9 与 `…-A1-evidence/19-freeze-statement-final.txt`。

```text
A1-download-request-model freeze v1
| baseline HEAD: c2f163087aaf11616e5be01f80d305bf6f25af57
| files: src/model/download.ts 3a14bf049843b2765212367b0e72c9aaf9a71fc8 3dbdcb52f80569323633d45f7cadb19b934638bbef0b4b797ebb9a7160c7d278
|        src/model/runtime.ts a3545bedf84c4abfc74cace914d4ed6a126f4246 13459b987b1d4e5c3ae40749f1ca1b0456a262e183b9ceb3278b1ad0520f0344
|        src/model/directive.ts 3636bca8b3332a287a322cb22197edeac14d37fa 5c522c44522257e222781dbeea66a0065d2f1239acde317b5138c923f960e688
|        src/provider/runtime/tools.ts 9cf198cb421226d222657f63edbb9a17fa21ac74 5d64eb7bf278e4012ce886419e16128dad45f3f0c09235f7f9c30b9a5acdd85b
|        src/provider/runtime/schema.ts 858a29caf83a257eca905382b4dadd4d0af46a48 cfdc9ef75989ed3917e458a6fe66968941df4e4b98f2caab5377182e23c5d0e2
|        src/service/runtime/session.ts 003d15928ff27b9427cef00ed30541ebe9395426 e36ffc226cc95ba7d25fd643b1c182c2e0694ef55f36d0b6b6a74ccd284d4d60（unchanged）
|        test/runtime-core/download-contract.test.ts eefe8e3f869df81f778ffe560f842bbd360e6018 b16b7163aea63fe8f820d9afa163cfeb11ab338b537587adf1bce7612bd62bc9
|        test/runtime-core/download-tool.test.ts 8252ace7f8542fdc08188e65b451313b339bb905 71d34c67e7ad1f4281312ebdffa4b5255cafa7e7a739e82355131ae223a1bcc9
| commands: node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"（exit 1；41 files / 323 tests / 316 pass / 3 fail（既有 EPERM 逐名）/ 4 skip）；node --test …download-contract.test.ts …download-tool.test.ts（exit 0；14/14）；npm run typecheck（exit 1；唯一红点 src/pipeline/orchestration/run-role.ts:2125，B1 写集，F6 R1）
| surface: DownloadErrorCode(17)/DownloadRequestInput/DownloadRequestResult(判别联合)/DownloadJudgeFacts/RequestDownloadFn/常量；GovernanceCardKind+"download"；GOVERNANCE_CARD_GROUP.download=approval；GovernedToolsOptions.requestDownload；GovernanceJudgeContext/Request.download；CustomerDirectiveView.consumer+"download"；request_download schema/注册/形状校验/回执复核
| status: implemented-unverified
| change rule: 任何形状变化回运行时核心重跑 A1 并使其消费方证据失效；最终 typecheck 冻结证据待 B1 补 run-role.ts 一行后在合并树重跑
```

## 7. 证据索引

| 文件 | 内容 |
| --- | --- |
| `2026-11-04_download-requests-A1-evidence/00a-env.txt` | 环境（HEAD/Node/npm/OS/Shell） |
| `2026-11-04_download-requests-A1-evidence/00b-baseline-status.txt` | 开工基线/写前哈希/A2 并行披露 |
| `2026-11-04_download-requests-A1-evidence/01-runtime-core.log` | runtime-core 全目录原始输出 + `exit=1`（本地保留；`*.log` 被 `.gitignore` 忽略） |
| `2026-11-04_download-requests-A1-evidence/02-typecheck.log` | `npm run typecheck` 原始输出 + `exit=1`（唯一 B1 红点；本地保留） |
| `2026-11-04_download-requests-A1-evidence/03-identity.log` | HEAD/环境/status/diff/逐文件 `git hash-object` + sha256（本地保留） |
| `2026-11-04_download-requests-A1-evidence/04-new-tests.log` | 两个新测试定向原始输出 + `exit=0`（14/14；本地保留） |
| `2026-11-04_download-requests-A1-evidence/05-runtime-core-summary.txt` | runtime-core 计数/失败名/B0 对照/新增失败与 skip=0 |
| `2026-11-04_download-requests-A1-evidence/06-new-tests-summary.txt` | 新增测试 14/14 与覆盖清单 |
| `2026-11-04_download-requests-A1-evidence/07-candidate-hashes.txt` | 候选逐文件行数/`git hash-object`/sha256 |
| `2026-11-04_download-requests-A1-evidence/08-scope-status.txt` | 收尾 status/diff/staged 空/A2 并行标注 |
| `2026-11-04_download-requests-A1-evidence/09-static-checks.txt` | typecheck 原始错误与 F6 判定 |
| `2026-11-04_download-requests-A1-evidence/10-freeze-statement.txt` | 冻结声明（含 F6 条件） |
| `2026-11-04_download-requests-A1-evidence/11-evidence-hashes.txt` | 证据文件逐项 sha256 |
| `2026-11-04_download-requests-A1-evidence/12-runtime-core-merged.log` | 合并基线 f0adb49 runtime-core 全目录原始输出 + `exit=1`（本地保留） |
| `2026-11-04_download-requests-A1-evidence/13-typecheck-merged.log` | 合并基线 `npm run typecheck` 原始输出 + `exit=0`（本地保留） |
| `2026-11-04_download-requests-A1-evidence/14-new-tests-merged.log` | 合并基线新增测试定向原始输出 + `exit=0`（14/14；本地保留） |
| `2026-11-04_download-requests-A1-evidence/15-merged-identity.txt` | 合并基线 HEAD/提交/B1 未提交清单/合并后候选哈希 |
| `2026-11-04_download-requests-A1-evidence/16-runtime-core-merged-summary.txt` | 合并基线 runtime-core 计数/失败名/零新增失败与 skip |
| `2026-11-04_download-requests-A1-evidence/17-static-checks-merged.txt` | 合并基线 typecheck exit 0 与 F6 解锁判定 |
| `2026-11-04_download-requests-A1-evidence/18-new-tests-merged-summary.txt` | 合并基线新增测试 14/14 |
| `2026-11-04_download-requests-A1-evidence/19-freeze-statement-final.txt` | **最终冻结声明**（合并基线、F6 关闭、typecheck 0） |

## 8. 边界与未做事项

- 未写 `src/pipeline/**`、`src/common/**`、`app/**`、`src/common/shared/**`、其他角色测试/文档、角色卡/边界/YAML/changelog、`docs/{planning,scheduling,acceptance,communication}`；`run-role.ts` 与 `test/编排/decision-card.test.ts` 的 F6 一行/断言更新归 B1。
- 未实现 P1–P9；未新增未使用字段；未写 `RejectionOwner:"requester"`（B1）；未 commit/push/merge/release。
- 状态：**`implemented-unverified`**；独立验收由内置独立验收按 V1 判定。

## 9. 合并基线 f0adb49 最终静态门与冻结声明（F6 已解锁）

- **基线**：HEAD `f0adb49058dd126b2b249cfa703993f65092f99b`（`3c88fae` + 合并 `origin/main` `f4c24ea` / PR #60）；A1 7 路径已提交在 `3c88fae`；工作树对 A1 路径无本地改动。
- **合并整合**：`3c88fae..HEAD` 仅对共享 `src/provider/runtime/tools.ts`/`schema.ts` 带入上游 PR #60 的措辞（su → 内置治理角色）；A1 download 段完整保留；`src/model/{download,runtime,directive}.ts` 与两个 A1 测试无变化。
- **F6 已解锁**：B1 已在 `src/pipeline/orchestration/run-role.ts` 的 `CARD_KIND_ROUTE_HINTS` 补 `download`（约 `:2144`）并更新 `test/编排/decision-card.test.ts` 键集断言；`npm run typecheck` 在合并基线 **exit 0**。
- **合并基线候选哈希**（详见 `15-merged-identity.txt`）：
  - `src/model/download.ts` 166 / `3a14bf049843b2765212367b0e72c9aaf9a71fc8` / `3dbdcb52f80569323633d45f7cadb19b934638bbef0b4b797ebb9a7160c7d278`（不变）
  - `src/model/runtime.ts` 2794 / `a3545bedf84c4abfc74cace914d4ed6a126f4246` / `13459b987b1d4e5c3ae40749f1ca1b0456a262e183b9ceb3278b1ad0520f0344`（不变）
  - `src/model/directive.ts` 317 / `3636bca8b3332a287a322cb22197edeac14d37fa` / `5c522c44522257e222781dbeea66a0065d2f1239acde317b5138c923f960e688`（不变）
  - `src/provider/runtime/tools.ts` 3890 / `7ac2413107827dacbb8f526a7adf358e6b27f90a` / `cebcbd1bc1e6494f921302a86c914255e2ac18754782840100d3fc413495ee33`（合并整合）
  - `src/provider/runtime/schema.ts` 1475 / `861063763f4cb4dde836c7de24d04db5fac58d78` / `1ef6fb78b8c79c5c8dc2fc168419c4cb659bb2e6ec8fd522cd364d0628a1b371`（合并整合）
  - `src/service/runtime/session.ts` 721 / `003d15928ff27b9427cef00ed30541ebe9395426` / `e36ffc226cc95ba7d25fd643b1c182c2e0694ef55f36d0b6b6a74ccd284d4d60`（unchanged）
  - `test/runtime-core/download-contract.test.ts` 255 / `eefe8e3f869df81f778ffe560f842bbd360e6018` / `b16b7163aea63fe8f820d9afa163cfeb11ab338b537587adf1bce7612bd62bc9`（不变）
  - `test/runtime-core/download-tool.test.ts` 390 / `8252ace7f8542fdc08188e65b451313b339bb905` / `71d34c67e7ad1f4281312ebdffa4b5255cafa7e7a739e82355131ae223a1bcc9`（不变）
- **最终验证**：runtime-core 全目录 exit 1；41 文件 / **323 tests / 316 pass / 3 fail / 4 skip**（3 fail 与 B0 v3 逐名一致：`file-write-safety.test.ts:97`、`session-store.test.ts:46`/`:58`，既有 Windows symlink EPERM；**新增确定性失败 0、新增 skip 0**）；新增测试定向 exit 0（14/14）；`npm run typecheck` **exit 0**。原始输出 `12/13/14-*.log`，摘要 `16/17/18-*.txt`。
- **最终冻结声明**：见 `…-A1-evidence/19-freeze-statement-final.txt`（`A1-download-request-model freeze v1 (FINAL, merged baseline)`；`compile-unlock: CLOSED`；`status: implemented-unverified`）。
- **范围**：工作树的 8 项 `src app test` 未提交改动均为 B1（`src/provider/download/impl/node-http.ts` + `test/编排/**`），本角色未触碰/未回退；本角色仅改本记录/证据/`api-spec.md`；未 commit/push。
