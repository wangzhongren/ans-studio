# 变更记录：验收返工路由 i18n 系统行 key（S5a/S5b）

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key、测试、证据已写盘并自测通过；**未经独立验收**；未接线任何消费方）
- 触发：客户已授权按团队计划 v1 与标准 v1 实施 S2–S7；本角色只做 **S5a（6 个系统行 key 契约）/ S5b（parity/typecheck）**。
- 依据：
  - 团队计划：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md` §3.5、§4.1（S5）、§4.2–§4.4
  - 方案：`docs/planning/2026-10-23_design_acceptance-rework-routing.md` §5.3.3、§6.3.3、§7.1（Q3/Q7/Q10）
  - 验收标准：`docs/acceptance/acceptance-rework-routing-criteria-v1.md` P3.13/P3.14、P9.7、P11.2
  - 冻结目录契约：`src/common/shared/i18n/{keys,types,translate}.ts`、`test/项目管理/shared/i18n.test.ts`
- 证据目录：`角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`
- 未提交：不 commit、不 push、不暂存。

## 1. 本批做了什么

只向共享消息目录新增团队计划 §3.5 指定的 **6 个 `main.governance.acceptanceRework*` 系统行 key**（zh-CN/en-US 各一份），并新增/更新 `test/项目管理/shared/i18n.test.ts` 的 parity、占位符与取值断言；未改任何消费方。

- `src/common/shared/i18n/messages/zh-CN.ts`：+6 key（key 全集参考；含参数契约与来源语义注释）。
- `src/common/shared/i18n/messages/en-US.ts`：逐 key 自然英文（`satisfies Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `test/项目管理/shared/i18n.test.ts`：新增 3 个用例（key 存在/占位符契约、来源措辞约束、zh/en 取值与插值）；分区计数 `main` 480→**486**、总数 1236→**1242**、`main` 扣除 B0 后 475→**481**。既有 parity/占位符/复数/锚点断言未删除或放宽。
- 证据：`s5b-i18n-tests.log`、`s5b-typecheck.log`、`s5b-i18n-integration-supplementary.log`、`s5b-key-values.txt`、`s5b-changed-regions.txt`、`s5b-commands.txt`、`s5b-hashes.txt`。

**未做（S5 明确不做）**：不改 `app/**`（含 S3 桌面消费方）、`src/model/**`、`src/pipeline/**`、`src/provider/**`、其他 shared 文件（`runtime-settings.ts`/`runtime-shared.ts`/`i18n/index.ts` 等）、`i18n-guard-allowlist.ts`、角色卡/边界、目标项目；不新增依赖/枚举；不改 key 名称；不 commit/push；不声称验收。

## 2. 6 个 key 与取值

| # | key | zh-CN | en-US | 占位符 | 语义/使用条件 |
| --- | --- | --- | --- | --- | --- |
| 1 | `main.governance.acceptanceReworkRoutedCustomer` | 流程 {flowId}：验收结果为客户拒绝；应用已按路由规则把返工交 Steward / 统筹（Convener）组织。 | Flow {flowId}: the customer rejected the acceptance result; the app routed the rework to Steward (Convener) under the routing rules. | `{flowId}` | 仅客户手拒来源（`sourceDetail:"customer-input"`）；写「客户拒绝」并写明接收方 Convener。 |
| 2 | `main.governance.acceptanceReworkRoutedAutomatic` | 流程 {flowId}：自动决策未通过/未完成（判断代批/自动退回）；应用已按路由规则把返工交 Steward / 统筹（Convener）组织。 | Flow {flowId}: the automatic decision did not pass or did not complete (judge proxy approval / automatic return); the app routed the rework to Steward (Convener) under the routing rules. | `{flowId}` | judge 代批 reject / judge deny / judge manual 退回；**不含「客户拒绝」**，不写成客户决定。 |
| 3 | `main.governance.acceptanceReworkPending` | 流程 {flowId}：返工路由尚未完成（等待发送或等待下一次事件重试）；应用暂不派发验收复核，也不会重复通知。 | Flow {flowId}: rework routing is not complete yet (waiting to send or waiting for the next event to retry); the app is not dispatching acceptance review for now and will not notify repeatedly. | `{flowId}` | routing record 未 `sent`（pending/failed 待重试）；本次不派 verifier，不重复刷系统行。 |
| 4 | `main.governance.acceptanceReworkReportIncomplete` | 流程 {flowId}：验收报告缺少可解析的 acceptance-rework/v1 结构化返工段（{detail}）；应用已把报告路径 {reportPath} 与解析错误交 Steward / 统筹（Convener）组织人工返工，未生成返工项、未创建流程步骤。 | Flow {flowId}: the acceptance report has no parseable acceptance-rework/v1 structured rework section ({detail}); the app passed report path {reportPath} and the parse error to Steward (Convener) for manual rework; no rework items were generated and no flow steps were created. | `{flowId}` `{reportPath}` `{detail}` | 报告缺段/坏段（`missing`/`invalid`/`unsupported`）；如实说明未生成 items、未建步骤，不解析自由文本。 |
| 5 | `main.governance.acceptanceReworkFailed` | 流程 {flowId}：返工路由失败（{detail}）；应用不声称已送达，也不会派发验收复核；修正后下一次事件会自动重试。 | Flow {flowId}: rework routing failed ({detail}); the app does not claim delivery and will not dispatch acceptance review; the next event retries automatically after the issue is fixed. | `{flowId}` `{detail}` | record 写失败（不发送）或发送失败（record `failed`）；不伪造成功，给出重试路径。 |
| 6 | `main.governance.acceptanceReworkAuditFailed` | 流程 {flowId}：返工任务已按路由规则转交，但审计记录写入失败（{detail}）；已发送事实不翻转，应用不会伪造账本，请检查账本与诊断。 | Flow {flowId}: the rework task was routed, but writing the audit record failed ({detail}); the sent fact is not reversed, the app does not fabricate ledger entries; check the ledger and diagnostics. | `{flowId}` `{detail}` | 发送成功后审计 best-effort 失败；任务可已发出、record `sent` 保持，不伪造账本。 |

措辞约束核对（自动断言见测试）：

- 客户来源写「客户拒绝」（zh）与 `customer rejected`（en）；两者都写明接收方 `Convener`。
- judge/自动来源写「自动决策未通过/未完成（判断代批/自动退回）」；zh 值**不含**「客户拒绝」，en 值**不含** `customer reject*`。
- 缺段/失败/审计失败均如实说明未生成 items、未声称已送达、已发送事实不翻转、不伪造账本，并给出可操作入口（报告路径/解析错误/下一次事件重试/检查账本与诊断）。
- 不声称路由已成功：用「已按路由规则……交/转交」（方案 §5.3.3 允许措辞），失败由 Failed/AuditFailed 系统行另行如实报告。

## 3. 消费方契约（供 S3 桌面窗口）

S5a 先于 S3 冻结 key 契约；S3 系统行必须使用以下参数，缺参会保留占位符并产生 `i18n.missing-param` 诊断：

- `acceptanceReworkRoutedCustomer` / `acceptanceReworkRoutedAutomatic` / `acceptanceReworkPending`：`{ flowId }`。
- `acceptanceReworkReportIncomplete`：`{ flowId, reportPath, detail }`（`reportPath` 为项目相对路径；`detail` 为有界解析错误，如 `items[3].owner`）。
- `acceptanceReworkFailed` / `acceptanceReworkAuditFailed`：`{ flowId, detail }`。

来源选择（Q7）：`customer-input` ⇒ RoutedCustomer；`judge` / `judge-deny` / `judge-manual` ⇒ RoutedAutomatic；未知来源按 `judge-manual` 保守处理，不得落入 RoutedCustomer。系统行落 Lead 聊天流，沿用 `note()`/`acceptanceBlockedNotified` 同类去重（方案 §6.3.3）。

## 4. 测试与 typecheck（原始输出见证据）

环境：Windows 11 / Git Bash（MINGW64_NT-10.0-26300）；Node **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm **11.19.1**；cwd `C:\Users\51054\Desktop\work\ans-studio`；HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（main）。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 套件（必跑） | `node --test "test/项目管理/shared/**/*.test.ts"` | **184 tests / 179 pass / 0 fail / 5 skipped / 0 todo**，exit 0（3 个新用例均通过） |
| 根类型检查（必跑） | `npm run typecheck`（PATH 需前置 Node 目录） | exit 0，无诊断 |
| 跨层 i18n 集成（补充只读） | `node --test "test/测试/i18n-integration.test.ts"` | **8 tests / 8 pass / 0 fail**，exit 0 |

- 5 个 skipped 为 `atomic-write.test.ts` 既有 D3 `finalMode`/umask/chmod 平台条件跳过（Windows），与本批无关；日志原文见 `s5b-i18n-tests.log`。
- 新增用例：key 存在 + 逐 key 占位符契约；客户/自动来源措辞约束（自动来源不得出现「客户拒绝」）；6 key 的 zh/en 取值与插值（缺段/失败/审计失败的可操作性断言）。
- 目录 key 数：zh-CN 与 en-US 均 **1242**（`s5b-key-values.txt`），parity 断言通过。
- `npm run typecheck` 首次因当前 shell PATH 无 `node` 而失败（`'"node"' 不是内部或外部命令`），属环境问题；前置 Node 目录后 exit 0，记录于 `s5b-typecheck.log` 与 `s5b-commands.txt`。

## 5. 写集与边界

本批写盘（产品/测试/记录 + 证据目录）：

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing.md`（本文件）
- `角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`（证据）

未触碰：`app/**`、`src/provider/**`、`src/model/**`、`src/pipeline/**`、`src/common/shared/` 其他文件（含 `runtime-settings.ts`、`runtime-shared.ts`、`i18n/index.ts`、`i18n-guard-allowlist.ts`）、`docs/**`、角色卡/边界、目标项目、`package.json`/`tsconfig*`。未新增依赖/枚举；未 commit/push/暂存。

`i18n-guard.test.ts` 无需更新：守卫扫描显式排除 `src/common/shared/i18n/messages/`（`i18n-guard.test.ts:42`），本批只新增目录文本、未新增硬编码，守卫在必跑套件中通过。

## 6. 候选哈希（写盘后复算）

`git hash-object` + `sha256sum`，完整原文见 `s5b-hashes.txt`：

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4853004daea619a82b2d760ff3218d6fd1015f1c29623d2ae15953e4e` |
| `src/common/shared/i18n/messages/en-US.ts` | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70b7b1e0ee720d619efb57aa8d305b7b8f004f4be66144476257e4b373` |
| `test/项目管理/shared/i18n.test.ts` | `26501c142dbd2c03bd6db6e135a0a29da8d46a3b` | `d8e7567797d9a324e1e2f9889b84758c81ac1b6df76f98b63c2c652f3bebac97` |

## 7. 残余风险与未决点（不声称验收）

1. **S3 尚未接线**：本批只冻结 key 与参数契约，未改 `app/desktop/**`；若 S3 传入不同参数名（如用 `{path}`/`{error}`），运行时会保留占位符并产生 `i18n.missing-param`。S3 须按 §3 参数契约消费，并由桌面测试/Electron 覆盖系统行原文。
2. **文件在 HEAD 未跟踪**：这三个文件在 `ee59296` 均为 `??`（既有 i18n 批次未提交，早于本任务）。因此无法用 `git diff` 单独呈现本变更 hunk；候选身份以文件级 `git hash-object`/`sha256sum` 为准。P11.2「共享文件只算本变更 hunk」需结合本记录 §2 的 6 个 key 区块核对；这是任务前既有状态，不由本角色改变。
3. **措辞已冻结**：新增用例逐字断言 6 个值；后续任何改词必须显式更新测试，属有意的契约变更，不得静默放宽。
4. **Node/npm 不在 PATH**：`npm run typecheck` 需先前置 `C:/Users/51054/AppData/Local/Programs/nodejs`；S7/T3 复算必须记录同一方式，否则会误报环境失败。
5. **未跑全量/Electron/T3**：S5 不负责全量回归、真实 Electron 或目标复算；本记录不构成 P3/P9/P10/P11 的验收结论，最终以 S7 与内置独立验收按当前候选判定为准。
6. **只读补充测试**：`test/测试/i18n-integration.test.ts` 由测试角色所有；本角色只运行未修改，结果仅作辅助证据。

## 8. 证据清单

- `...-evidence/s5b-i18n-tests.log`：必跑共享套件原始输出（184/179/0/5）。
- `...-evidence/s5b-typecheck.log`：`npm run typecheck` 原始输出（exit 0）。
- `...-evidence/s5b-i18n-integration-supplementary.log`：跨层 parity 补充输出（8/8）。
- `...-evidence/s5b-key-values.txt`：6 key 的 zh/en 原值与自动来源「客户拒绝」检查、目录 key 数。
- `...-evidence/s5b-changed-regions.txt`：两份目录新增区块原文。
- `...-evidence/s5b-commands.txt`：环境、命令、退出码与计数。
- `...-evidence/s5b-hashes.txt`：候选哈希与 `git status --short`。
