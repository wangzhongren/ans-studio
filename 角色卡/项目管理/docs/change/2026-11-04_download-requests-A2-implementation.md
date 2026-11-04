---
id: download-requests-a2-implementation
type: change
title: 下载文件申请 A2 i18n 实施记录（37 key，implemented-unverified）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 按 A2 Revision 2 提案落 37 个 i18n key（zh/en 成对）、更新 i18n.test.ts 计数/契约断言；PM 套件与 i18n 守卫通过；typecheck 被已知 F6 跨角色依赖阻塞（run-role.ts 缺 B1 一行）
  - date: "2026-11-04"
    kind: updated
    summary: 合并基线 f0adb49 最终静态门（PM suite 11 文件 176/171/0/5、typecheck exit 0、guard 136/22/0）+ 冻结声明 v2；PR #59 i18n 中性化不改变 A2 key 契约
---

# 下载文件申请 A2 i18n 实施记录（`implemented-unverified`）

- **任务 / flowId**：`2026-11-04-download-requests` / `download-requests`。
- **角色 / 节点**：项目管理（`src/common/shared/` 唯一写入者）/ 团队计划 §5.3 **A2（i18n 契约）**。
- **状态**：**`implemented-unverified`**。实现完成、已跑本角色单测与 `npm run typecheck`；**未验收、未启动应用、未跑 Electron/E2E**。`npm run typecheck` 当前 **exit 1**，唯一错误为已知的 F6 跨角色编译依赖（`src/pipeline/orchestration/run-role.ts:2125` 缺 B1 的 `download` 一行），**不是 A2 文件错误**；B1 补该行后须重跑并记录最终 typecheck（见 §五/§六）。
- **未 commit/push/merge/release**；未改其他角色文件、角色卡/边界/changelog、`docs/scheduling|acceptance|communication`。

## 一、依据与基线

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| A2 Revision 2 提案（实施依据） | 461 | `fe474a934520e117f41b08192f9701462efe253dbda0b76b18bc31884b80065f` |
| P1 最终复审（recommend approval） | 611 | `98373dfada8b46759a96ff95096cd00523808de305e2ec7832d89e901adb734d` |
| 闸门 2 写集增补 + V1 确认（F4/F5/F13） | 32 | `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310` |
| V1 | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` |
| B0 基线 v2 | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` |

- 分支 / HEAD：`feat/download-requests` / `c2f163087aaf11616e5be01f80d305bf6f25af57`。
- 开工检查（2026-11-04）：`git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空；三目标文件哈希与提案基线一致：
  - `zh-CN.ts` 2188 行 / `6dafeb5983fac78336063e669aaba44434eabeae06c6c6a511f537d7eb3c3b6a`；
  - `en-US.ts` 2456 行 / `8c0d15bd40d5bdbb629a75511dfb1b1fe284b1e7d8d8de86e3cea7e24c876602`；
  - `i18n.test.ts` 618 行 / `62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a`。

## 二、写集（仅三文件）

| 路径 | 变更 | 行数（候选） | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | +43 行（37 key + 注释/空行） | 2231 | `7ec4923aa09d038acd297cf6b43b8a7b22841d21` | `29402808df9ca90c887613e23c15229b9924e5fea3790a5fbf227ddf1308f8a6` |
| `src/common/shared/i18n/messages/en-US.ts` | +43 行（同 key 英文值） | 2499 | `5c5a07a1243141c6b1403c2329eec98dbb673f40` | `a2405978259d5ead2afbe81c069889d2cb164c0b47d58afb82a4501dd4019e5f` |
| `test/项目管理/shared/i18n.test.ts` | +217 / -3 行（计数/37 key 契约/占位符/删除/复用断言） | 832 | `d9cbb3d5113f568112f1dfd71199fac89696c185` | `551ab06032b9b20a538926230b9d4d1892ed6f683a98e0935fc5be180c27b36b` |

- `git diff --numstat`：zh `43/0`、en `43/0`、test `217/3`；合计 **303 insertions / 3 deletions**。
- **不写**：`i18n-guard-allowlist.ts`、`i18n-guard.test.ts`、`i18n-guard-scanner.ts`、`src/common/shared/jsonl-ledger.ts`、`docs/architecture/shared-components.md`、i18n 运行时/类型/格式化实现、其他角色文件、角色卡/边界/changelog、`docs/scheduling|acceptance|communication`、构建/发布配置。
- `git status --porcelain -- src app test` 中另有 A1 的并发授权写入（`src/model/download.ts` 新、`src/model/runtime.ts`、`src/model/directive.ts`、`src/provider/runtime/tools.ts`），不是本角色改动、未触碰本角色三文件；见 §六。

## 三、key 契约（已落盘）

### 3.1 数量与家族

- **37 key** = `main.*` 35 + `ui.*` 2。
  - `main.download.card.*` **13**：title / role / purpose / url / host / resolvedIps / resolvedIpsTruncated / filename / sizePolicy / redirectPolicy / mechanical.scheme / mechanical.publicHost / mechanical.publicIps。
  - `main.download.notice.*` **5**：completed / failed / directiveAllowed / directiveSource / gitignoreHint。
  - `main.download.error.*` **17**：invalidArguments / unsafeUrl / dnsFailed / deniedByDirective / declined / unavailable / factsMissing / rebindingDetected / redirectCrossHost / httpError / tooLarge / unsupportedEncoding / timeout / networkError / writeFailed / busy / aborted。
  - `ui.directive.panel.consumer.*` **2**：download / downloadLegacyOff。
- **计数**：`ui 1092 / main 626 / shared 62 / preferences 3 = 1783`（由 `i18n.test.ts` 实测断言通过）。
- **mechanical 仅三项**（scheme/publicHost/publicIps）；`credentialsAbsent`/`filenameSafe` 保留在 B1 `DownloadJudgeFacts`/判断/审计，不设 i18n key。
- `main.download.notice.completed` 占位符 **`{host}`/`{path}`/`{bytes}`/`{sha}`/`{source}`**，**无 `{finalUrl}`**；final URL 仅在 agent-facing 工具回执。
- `main.download.notice.gitignoreHint` 保留（G1 A）。
- **不提供** `ui.directive.panel.consumer.downloadStartsNow`（G8 B 未选）。
- 复用既有 key：`ui.judge.mode.approval`、`ui.judge.headline.autoApproved`、`ui.request.toCustomer`、`ui.request.toJudge`、`ui.directive.panel.consumer.none`、`ui.directive.panel.until.once/session/forever`。

### 3.2 落点

- `zh-CN.ts`：`main.directive.error.submitRejected` 之后插入 `main.download.card.*`（13）/`notice.*`（5）/`error.*`（17）；`ui.directive.panel.consumer.none` 之后插入 `download`/`downloadLegacyOff`（2）。既有 key 未重排、未改写值。
- `en-US.ts`：相同锚点、同 key、同顺序的英文值；`satisfies Record<MessageKey, MessageTemplate>` 编译期保证 key 齐全。
- 未改 `keys.ts`/`types.ts`/`index.ts`/`translate.ts`/`format.ts`；`MessageKey` 自动扩展。

### 3.3 测试更新（`i18n.test.ts`）

- 分区计数：`ui 1092 / main 626 / shared 62 / preferences 3 = 1783`。
- 新增 `DOWNLOAD_KEYS`（37 项）常量；断言长度/唯一性/家族 13/5/17/2。
- 37 项逐字 zh/en 精确断言；zh/en 占位符一致；en-US 零 Han。
- `completed` 占位符显式断言为 `["bytes","host","path","sha","source"]`；`resolvedIpsTruncated` 为 `["shown","total"]`。
- `ui.directive.panel.consumer.downloadStartsNow` **零命中**；`main.download.card.mechanical.` 仅三项；`ui.download.` 零命中。
- 复用 key 存在性断言（judge/source/until/consumer.none 等）。
- 既有 `B0_KEYS`/`D_RETAINED_KEYS`/`SHELL_ESCALATION_KEYS`/`ACCEPTANCE_RETURN_CARD_KEYS`/`GLOBAL_TASK_STATE_KEYS`/`DIRECTIVE_KEYS`/parity/零泄漏/旧治理 key 断言全部保留；不新增 skip/todo。

## 四、测试与静态检查（原始输出见证据目录）

| 检查 | 结果 |
| --- | --- |
| `node --test --test-concurrency=1 "test/项目管理/shared/**/*.test.ts"` | **exit 0**；11 文件；**tests 176 / pass 171 / fail 0 / cancelled 0 / skipped 5 / todo 0**；duration 8205.5027ms。B0 v2 基线 11 文件 / 175/170/0/5；+1 test 为本批新增契约测试；既有 5 项平台 skip 不变。 |
| `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts` | **exit 0**；18 tests / 18 pass / 0 fail / 0 skipped；`[i18n-guard] scanned=136 allowlisted=22 violations=0`。 |
| `npm run typecheck` | **exit 1**；唯一错误：`src/pipeline/orchestration/run-role.ts(2125,7): error TS2741: Property 'download' is missing in type '{ ... }' but required in type 'Readonly<Record<GovernanceCardKind, string>>'`。**这是已知 F6 跨角色编译依赖**：A1 已并发落 `GovernanceCardKind` 的 `"download"`（`src/model/runtime.ts:430`），B1 尚未补 `CARD_KIND_ROUTE_HINTS.download` 一行；A2 三文件无类型错误。B1 补行后须重跑 `npm run typecheck` 并记录最终结果。 |
| `git diff --cached --name-only` | 空（未暂存）。 |

## 五、冻结声明（A2，`implemented-unverified`）

```text
A2-download-request-i18n freeze v1 (Revision 2)
| baseline HEAD: c2f163087aaf11616e5be01f80d305bf6f25af57
| files:
|   src/common/shared/i18n/messages/zh-CN.ts 7ec4923aa09d038acd297cf6b43b8a7b22841d21 29402808df9ca90c887613e23c15229b9924e5fea3790a5fbf227ddf1308f8a6 (2231 lines)
|   src/common/shared/i18n/messages/en-US.ts 5c5a07a1243141c6b1403c2329eec98dbb673f40 a2405978259d5ead2afbe81c069889d2cb164c0b47d58afb82a4501dd4019e5f (2499 lines)
|   test/项目管理/shared/i18n.test.ts d9cbb3d5113f568112f1dfd71199fac89696c185 551ab06032b9b20a538926230b9d4d1892ed6f683a98e0935fc5be180c27b36b (832 lines)
| key set: 37 = main 35 (card 13 + notice 5 + error 17) + ui 2 (download/downloadLegacyOff)
| counts: ui 1092 / main 626 / shared 62 / preferences 3 = 1783
| mechanical: scheme/publicHost/publicIps only; completed: no finalUrl; gitignoreHint: present; downloadStartsNow: absent
| commands: PM suite exit 0 (11 files, 176/171/0/5); focused i18n+guard exit 0 (18/18/0/0; scanned=136 allowlisted=22 violations=0); npm run typecheck exit 1 (sole F6 run-role.ts error, not A2)
| status: implemented-unverified
| change rule: key set/count/文案变化回项目管理并重跑 i18n 测试；C1/C2 只按冻结 key 消费
```

## 六、并发写入披露与阻塞

- **A1 并发授权写入**（非本角色改动，未触碰 A2 三文件；typecheck 取证时 A1 仍在写入，见 `09-close-status.log`）：
  - `src/model/download.ts`（新，166 行，mtime 2026-11-04 18:35:36 +0800）；
  - `src/model/runtime.ts`（mtime 18:35:50；`GovernanceCardKind` 已含 `"download"`，`requestDownload` 等）；
  - `src/model/directive.ts`（mtime 18:35:54）；
  - `src/provider/runtime/tools.ts`（mtime 18:36:40）、`src/provider/runtime/schema.ts`（mtime 18:36:49）；
  - `test/runtime-core/download-contract.test.ts`（新，mtime 18:37:41）、`test/runtime-core/download-tool.test.ts`（新，mtime 18:37:57）。
- **阻塞（F6）**：`npm run typecheck` 唯一错误在 `src/pipeline/orchestration/run-role.ts:2125`（缺 `download` 键）。该文件属 B1 写集；A2 不得越界修改。按 P1 审查 R1/F6：B1 开工第一动作补 `CARD_KIND_ROUTE_HINTS.download` 一行 + 更新 `test/编排/decision-card.test.ts`，随后 A2 重跑 `npm run typecheck` 并记录最终结果。**注意**：A1 在 A2 typecheck 取证期间仍在并发写入其 `src/model/**`/`src/provider/runtime/**`/`test/runtime-core/**`；本次 typecheck 日志是当时的快照（唯一错误为 run-role.ts），A1 冻结后须由 A1/B1 按 F6 重跑最终 typecheck，A2 再补记最终静态门结果。
- 除 F6 外，A2 无阻塞；PM 套件与 i18n 守卫已通过。

## 七、证据索引

- 证据目录：`角色卡/项目管理/docs/change/2026-11-04-download-requests-A2-evidence/`。
- 关键文件：`01-pm-suite.log`、`02-typecheck.log`、`03-i18n-focused.log`、`04-status.log`、`05-candidate-hashes.txt`、`06-diff-stat.log`、`07-concurrent-a1-mtimes.log`、`09-close-status.log`、`10-typecheck-close.log`、`08-evidence-index.sha256`（索引自身不入索引）。
- 状态：`implemented-unverified`；未验收、未 commit/push；A2 实施不替代 V1/独立验收；F6 typecheck 最终证据待 B1 补行后重跑。

## 八、合并基线 f0adb49 最终静态门与冻结（2026-11-04，追加）

> 本节取代 §六/§七 的 F6 待办与旧候选哈希；旧记录保留为历史。PR #59（运行期文本去 su 中性化）合并不改变 A2 的 key 集合/契约。

- **合并基线**：HEAD `f0adb49058dd126b2b249cfa703993f65092f99b`（`3c88fae` A1/A2/B1 candidates + merge `origin/main` `f4c24ea`；含 PR #59 `edfbab0` 与 PR #60 `332e062`）。
- **A2 提交**：A2 三路径已在 `3c88fae` 提交；当前 `git status --porcelain -- src app test` **不含 A2 三文件**（clean）。当前未提交项仅 B1 的 `src/provider/download/impl/node-http.ts` 与 `test/编排/{customer-directive,unverifiable-rejection,download-judge,download-pipeline,download-provider}.test.ts` + TLS fixtures（非本角色，未触碰）。
- **最终静态门**（同一合并基线）：
  - `node --test --test-concurrency=1 "test/项目管理/shared/**/*.test.ts"`：**exit 0**；11 文件；**176 tests / 171 pass / 0 fail / 0 cancelled / 5 skipped / 0 todo**；duration 10294.9616ms。B0 v3 为 11 文件 / 176/171/0/5；**新增确定性失败 0、新增 skip 0**。
  - `npm run typecheck`：**exit 0**（无输出）。
  - `[i18n-guard] scanned=136 allowlisted=22 violations=0`。
  - 37 key 复核：`main.download.*` 35 + `ui.directive.panel.consumer.download*` 2；计数 `ui 1092 / main 626 / shared 62 / preferences 3 = 1783`（i18n.test.ts 断言通过）；parity、零 Han、占位符/删除/复用断言通过。
- **合并后候选哈希**：

| 路径 | 行数 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 2231 | `c64dfe1fbff6752a8e533cb01800d9ea64b31b81` | `2e3413767a2d7593ff4fd5ed0b533bf00a7eb9f8f8ffbceacb9b0384f2ebeac5` |
| `src/common/shared/i18n/messages/en-US.ts` | 2499 | `6d55039d6287d99bce0d1b30bf17f82fcf72aa14` | `9e3803f711ebe632a238eb2f3cb48f14764441ab7aa308cbe7b993bf5635b1fa` |
| `test/项目管理/shared/i18n.test.ts` | 832 | `d9cbb3d5113f568112f1dfd71199fac89696c185` | `551ab06032b9b20a538926230b9d4d1892ed6f683a98e0935fc5be180c27b36b` |

- **冻结声明 v2（合并基线）**：

```text
A2-download-request-i18n freeze v2 (merged baseline f0adb49)
| baseline HEAD: f0adb49058dd126b2b249cfa703993f65092f99b (3c88fae + merge f4c24ea; PR #59/#60)
| files: zh-CN.ts c64dfe1f…/2e341376… (2231); en-US.ts 6d55039d…/9e3803f7… (2499); i18n.test.ts d9cbb3d5…/551ab060… (832)
| key set: 37 = main 35 (card 13 + notice 5 + error 17) + ui 2; counts 1092/626/62/3=1783
| mechanical: three; completed: no finalUrl; gitignoreHint: present; downloadStartsNow: absent
| checks: PM suite exit 0 (11 files, 176/171/0/5); guard scanned=136 allowlisted=22 violations=0; npm run typecheck exit 0
| PR #59 merge: i18n value neutralization only; A2 key set/contract unchanged
| status: implemented-unverified (static gates green; independent acceptance pending)
```

- **证据**：`11-merged-pm-suite.log`、`12-merged-typecheck.log`、`13-merged-status.log`、`14-merged-candidate-hashes.txt`（并见 `08-evidence-index.sha256`）。
- **阻塞**：无 A2 阻塞；F6 已在合并基线解除（typecheck exit 0）。A2 仍为 `implemented-unverified`，待独立验收；未 commit/push。
