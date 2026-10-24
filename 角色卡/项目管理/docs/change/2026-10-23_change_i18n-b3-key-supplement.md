# 变更记录：i18n B3 主进程共享 key 增补（用户可见缺口分类补齐）

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key、测试、证据已写盘并自测通过；**未经独立验收**；未迁移任何消费方）
- 触发：B3 主进程迁移（`角色卡/桌面窗口/docs/change/2026-10-23_change_i18n-b3.md`，implemented-unverified）§5.2 列出 24 项共享目录缺 key。其中混有 agent-facing 任务反馈/提示、机器标识与 B4 范围，须逐项分类后再补。
- 依据：
  - 方案：`docs/planning/2026-10-23_design_i18n.md` §4.9（避免第二份文案）、§4.11（分类规则）、§9.1 B3（仅用户可见；agent 任务不翻译）
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3 / §5
  - PM 分类：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b4-keys-evidence/non-target-and-classification.md` §4（B3 非目标）
  - 冻结目录与 B0 契约：`src/common/shared/i18n/**`、`test/项目管理/shared/i18n.test.ts`
- 证据目录：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b3-key-supplement-evidence/`
- 未提交：不 commit、不 push。

## 1. 本批做了什么

只向共享消息目录新增 **21 个用户可见的 B3 `main.*` key**（zh-CN 逐字取当前 `app/desktop/` 源码；en-US 自然英文），并复用 3 个既有同文案 key；未改任何 `app/desktop/**` / `app/renderer/**` / `i18n-guard-allowlist.ts`。

- `src/common/shared/i18n/messages/zh-CN.ts`：+21 key（含 1 个复数模板 `judgeWriteHeadOverflow`）。
- `src/common/shared/i18n/messages/en-US.ts`：逐 key 英文目录（`Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `test/项目管理/shared/i18n.test.ts`：新增 3 个「B3 key 增补」用例（存在、zh 逐字、en/复用、插值/复数），分区计数 `main` 457→**478**、总数 1213→**1234**；B0/B1/B2 既有 key 值、锚点、parity/复数断言未修改或放宽。
- 证据：`classification.tsv`（24+1 项逐项分类）、`new-keys.tsv`、`reused-keys.tsv`、`kept-non-target.tsv`、`test-i18n.log`、`test-shared.log`、`guard.log`、`stale-allowlist.log`、`typecheck.log`、`env.log`、`hashes.txt`。

**未做（本批明确不做）**：不改 `app/desktop/**`、`app/renderer/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`；不改 `i18n-guard-allowlist.ts`（B3 接线与 allowlist 收紧另批）；不迁移消费方；不改现有 key 的 zh 值或名称；不新增依赖；不 commit。

## 2. B3 24 项逐项分类结论

完整逐项表（含源码位置与理由）见证据 `classification.tsv`。摘要：

| # | B3 建议 key | 分类 | 处理 |
| --- | --- | --- | --- |
| 1 | `main.session.releaseNoSession` | 用户可见（release 回执） | 新增 |
| 2 | `main.session.clarificationDelivery` | 用户可见（澄清系统行） | 新增 |
| 3 | `main.session.handbackDeliveryFailedShort` | 用户可见（投递失败行） | 新增，改名 `main.session.delivery.handbackFailedShort`（非 cAttempt 分支复用 `handbackFailed`） |
| 4 | `main.session.delivery.receivedDispatch` | 用户可见（目标 pane 系统行） | 新增 |
| 5 | `main.session.rebuildChangedRuntimeConfig` | 用户可见（系统行 `{changed}`） | 新增 |
| 6 | `main.session.install.verbInstall` / `verbUninstall` | 用户可见（install summary 系统行） | 新增 |
| 7 | `main.session.install.actionChanged` / `actionReverted` | **agent-facing**（rebuild-failed 工具回执） | 保持，不补 |
| 8 | `main.session.delivery.kindDispatchTask` | 用户可见 | **复用** `ui.events.dispatchTask`（逐字“派发任务”） |
| 9 | `main.customerInput.judgeWriteHeadZero` | 用户可见（judge 代批结果行） | 新增 |
| 10 | `main.customerInput.writePathsTail` | 用户可见（路径溢出） | 新增整句模板 `main.customerInput.judgeWriteHeadOverflow`（不拼接） |
| 11 | `main.customerInput.autoApprovalLabel` / `autoDecisionLabel` | 用户可见（客户可见拒绝文案 `{label}`） | 新增 |
| 12 | `main.operator.manualJudgeDenyConnector` | **agent-facing**（deny 工具结果，无结果行） | 保持，不补 |
| 13 | `main.composerImages.unknownType` | 用户可见（图片类型错误兜底） | **复用** `main.watchdog.repeatFailUnknown`（逐字“（未知）”） |
| 14 | `main.composerImages.defaultName` | 用户可见（图片名兜底） | **复用** `ui.composer.imageFallbackName`（逐字“图片”） |
| 15 | `main.watchdog.queueStuckSummary` / `repeatFailSummary` / `cmdTimeoutSummary` | 用户可见（队列行摘要） | 新增 `signalSummary` / `queueStuckSummary` / `repeatFailSummary` |
| 16 | `main.interface.docEmpty` | 用户可见（写卡 issue 文本） | 新增 |
| 17 | `main.interface.boundaryDeclaredMissing` | 用户可见（issue `{declared}`） | 新增 |
| 18 | `main.interface.teamPlanMissingNoRoles` | 用户可见（autoAdvanceFailed 系统行） | 新增 |
| 19 | `main.interface.roleCardsStepMissing` | 用户可见（首个 blocking issue → writeBlockingSummary） | 新增 |
| 20 | `main.interface.addRoleCardsStep` | **agent-facing**（Convener flow 补步指令） | 保持，不补 |
| 21 | `main.interface.flowStateValidationFailed` | **agent-facing**（Convener 任务抬头） | 保持，不补 |
| 22 | `main.interface.readErrorExistingSuffix` | 用户可见（issue 后缀） | 新增 |
| 23 | `main.interface.queueRecoveredLine` | 用户可见（系统行 `{lines}`） | 新增 |
| 24 | `main.interface.staleStepFact` | 用户可见（系统行 `{facts}`） | 新增 |
| + | （B3 漏列）turn-deadline 队列摘要 | 用户可见（与 #15 同类） | 并入 `main.watchdog.signalSummary`（与 cmd-timeout 摘要同文案） |

分类口径：
- **用户可见**＝应用生成、最终显示给客户/操作者的系统行/错误/提示/标签（`emitDeliveryNote`/`emitSessionEvent` 的 summary、IPC 回执、结果行人话）。
- **agent-facing**＝发给 Convener/Crew/Lead 的任务正文、工具回执/反馈、role_status/session_tail、flow 缺陷补步指令、团队计划/写卡反馈——按方案 §4.11 保持原样，不补 key。
- 机器/协议/诊断（roleId/cardKind/step id/事件/诊断码/`[系统·…]` 前缀/外部 `err.message`）与 B4（`RUNTIME_LABELS`）不在本批补 key（见 `kept-non-target.tsv`）。

## 3. 新增 key 清单（21）

| # | key | zh-CN（逐字取当前源码） | en-US | 消费点（B3 后续接线） |
| --- | --- | --- | --- | --- |
| 1 | `main.session.releaseNoSession` | 角色 {roleId} 没有打开的会话。 | Role {roleId} has no open session. | `session.ts:2471` |
| 2 | `main.session.clarificationDelivery` | Draft（提案）需要澄清：{question} | Draft (proposal) needs clarification: {question} | `session.ts:1638` |
| 3 | `main.session.delivery.receivedDispatch` | 已接收来自 {role} 的派发任务——请按任务文本执行，完成后交回报告。 | Received a dispatched task from {role} — follow the task text and hand back a report when done. | `session.ts:4381` |
| 4 | `main.session.delivery.handbackFailedShort` | 回交投递失败（来自 {sourceRoleId}）：{detail} | Handback delivery failed (from {sourceRoleId}): {detail} | `session.ts:4418`（cAttempt=true） |
| 5 | `main.session.rebuildChangedRuntimeConfig` | 运行时配置 | runtime configuration | `session.ts:1211` |
| 6 | `main.session.install.verbInstall` | 安装 | install | `session.ts:3717,3865`（summarySkill/summaryMcp `{verb}`） |
| 7 | `main.session.install.verbUninstall` | 卸载 | uninstall | 同上 |
| 8 | `main.customerInput.judgeWriteHeadZero` | judge 代批 · 代审批：确认写入 0 个路径 | judge delegation · approval: confirm writing 0 paths | `customer-input.ts:163` |
| 9 | `main.customerInput.judgeWriteHeadOverflow` | {other: judge 代批 · 代审批：确认写入 {count} 个路径（{paths}等 {count} 个）} | {one: …{count} path ({paths}, etc.); other: …{count} paths ({paths}, etc.)} | `customer-input.ts:164-166` |
| 10 | `main.customerInput.autoApprovalLabel` | 自动审批 | Auto-approval | `customer-input.ts:827,1150` |
| 11 | `main.customerInput.autoDecisionLabel` | 自动决策 | Auto-decision | 同上 |
| 12 | `main.watchdog.signalSummary` | 系统·看护 · {signal} · 角色 {roleId} | System·Watchdog · {signal} · role {roleId} | `watchdog.ts:582,714` |
| 13 | `main.watchdog.queueStuckSummary` | 系统·看护 · {signal} · 角色 {roleId}（深度 {depth}） | System·Watchdog · {signal} · role {roleId} (depth {depth}) | `watchdog.ts:608` |
| 14 | `main.watchdog.repeatFailSummary` | 系统·看护 · {signal} · 角色 {roleId}（{count} 次） | System·Watchdog · {signal} · role {roleId} ({count} times) | `watchdog.ts:639` |
| 15 | `main.interface.docEmpty` | 文件为空（需要正文） | File is empty (body required) | `interface.ts:3028` |
| 16 | `main.interface.boundaryDeclaredMissing` | 未提供 | not provided | `interface.ts:2843` |
| 17 | `main.interface.teamPlanMissingNoRoles` | 缺少团队计划/任命名单，未派发写卡任务 | Missing team plan/appointment list; card-writing task not dispatched | `interface.ts:4630` |
| 18 | `main.interface.roleCardsStepMissing` | 流程缺少 id 为 "{stepId}" 的步骤（团队计划存在但 flow 未声明 role-cards，无法完成收口；请 Convener 补齐 flow 步骤）。 | The flow is missing the step with id "{stepId}" (the team plan exists but the flow does not declare role-cards, so closure cannot complete; ask the Convener to add the flow step). | `interface.ts:3702` |
| 19 | `main.interface.readErrorExistingSuffix` | （existing/legacy：仅提醒） | " (existing/legacy: warning only)"（en 带前导空格，拼接自然） | `interface.ts:3023` |
| 20 | `main.interface.queueRecoveredLine` | - [{kind}] {summary}（角色 {roleId} · {runtime}） | - [{kind}] {summary} (role {roleId} · {runtime}) | `interface.ts:3286` |
| 21 | `main.interface.staleStepFact` | - 步骤 {stepId}（owner: {owner}，status: {status}） | - Step {stepId} (owner: {owner}, status: {status}) | `interface.ts:3365` |

逐 key 源码行号与上下文另见 `new-keys.tsv`。

## 4. 复用 vs 新增

| 缺口 | 处理 | 理由 |
| --- | --- | --- |
| #8 noTarget `{kind}` = “派发任务” | **复用** `ui.events.dispatchTask` | 与 B2 事件行标签逐字相同（zh/en 均一致）；不再收第二份。 |
| #14 图片名兜底 = “图片” | **复用** `ui.composer.imageFallbackName` | 同一语义（Composer 图片名兜底），zh/en 逐字相同。 |
| #13 类型兜底 = “（未知）” | **复用** `main.watchdog.repeatFailUnknown` | 目录内唯一逐字同文案（"（未知）"/"(unknown)"）；通用短占位，避免重复文案。 |
| #10 “等 N 个” | **新增整句模板** `judgeWriteHeadOverflow` | 方案 §4.9/任务要求避免拼接；zh 逐字保持“{paths}等 {count} 个”（源码无空格）。原 `judgeWriteHead`（≤3 路径）不变。 |
| #3 cAttempt=true | **新增短模板** `handbackFailedShort` | 现有 `handbackFailed` 恒带“保留待重试”后缀；非 cAttempt 分支逐字复用现有 key。 |
| #15 cmd-timeout / turn-deadline | **共用** `signalSummary` | 两者摘要模板逐字相同；queue-stuck/repeat-fail 带额外数据，单列。 |

未改动任何既有 key 的 zh 值；未新增重复文案（复用项见上表）。

## 5. 消费方接线契约（供 B3 后续批次）

- `session.ts`：
  - `stop` 未开会话：`main.session.releaseNoSession`；
  - `deliverClarification`：`main.session.clarificationDelivery`（`{question}`）；
  - 派发成功目标 pane 行：`main.session.delivery.receivedDispatch`（`{role}` = `roleDisplayName`）；
  - 回交失败：`cAttempt ? main.session.delivery.handbackFailedShort : main.session.delivery.handbackFailed`（`{sourceRoleId}`/`{detail}`）；
  - 边界陈旧重建：`changed = mainT("main.session.rebuildChangedRuntimeConfig")`（`{changed}`）；
  - 安装动词：`verb = mainT(acting ? "main.session.install.verbInstall" : "main.session.install.verbUninstall")`。
- `customer-input.ts`：
  - `judgeResultSummary`：0 路径 → `main.customerInput.judgeWriteHeadZero`；1–3 → 既有 `judgeWriteHead`（`tail` 逻辑删除，`{paths}`=shown）；>3 → `main.customerInput.judgeWriteHeadOverflow`（`{count}`/`{paths}`=shown，按 `count` 复数）；
  - `{label}`：`plan.group === "approval" ? mainT("main.customerInput.autoApprovalLabel") : mainT("main.customerInput.autoDecisionLabel")`。
- `watchdog.ts`：摘要改 `mainT("main.watchdog.signalSummary", { signal, roleId })`（turn-deadline/cmd-timeout）、`queueStuckSummary`（+`{depth}`）、`repeatFailSummary`（+`{count}`）。
- `interface.ts`：
  - `boundaryRoleMismatch` 的 `{declared}`：`declaredRole === undefined ? mainT("main.interface.boundaryDeclaredMissing") : JSON.stringify(declaredRole)`；
  - 读错误 existing 后缀：`` `${doc.error}${mainT("main.interface.readErrorExistingSuffix")}` ``；
  - 空文档 fullCheck：`main.interface.docEmpty`；
  - flow 缺陷 issue：`main.interface.roleCardsStepMissing`（`{stepId}`）；
  - `fail(...)`：`main.interface.teamPlanMissingNoRoles`；
  - 队列恢复行：`main.interface.queueRecoveredLine`（`{kind}`=queueKind 标签、`{summary}`、`{roleId}`、`{runtime}`）；
  - 僵尸步骤行：`main.interface.staleStepFact`（`{stepId}`/`{owner}`/`{status}`）。
- 复用处：`noTarget` 的 `{kind}` 用 `ui.events.dispatchTask`；图片类型兜底用 `main.watchdog.repeatFailUnknown`；图片名兜底用 `ui.composer.imageFallbackName`。

**仍待 B3 接线的 key（24 个 = 21 新增 + 3 复用）**：上表 21 个 `main.*`，加 `ui.events.dispatchTask`、`ui.composer.imageFallbackName`、`main.watchdog.repeatFailUnknown`。接线后 `app/desktop/` 对应位置不再含中文字面量。

## 6. 测试、typecheck 与守卫（原始输出见证据）

环境：Windows 11 / Git Bash；Node v24.22.1；npm 11.19.1；cwd `C:\Users\51054\Desktop\work\ans-studio`。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约 | `node --test "test/项目管理/shared/i18n.test.ts"` | **34 tests / 34 pass / 0 fail**，exit 0（新增 3 用例） |
| shared 套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **177 tests / 171 pass / 1 fail / 5 skipped**，exit 1 |
| 硬编码守卫 | `node --test "test/项目管理/shared/i18n-guard.test.ts"` | 6 tests / 5 pass / 1 fail，exit 1；`scanned=107 allowlisted=62 violations=0` |
| 根类型检查 | `npm run typecheck` | exit 0（无输出） |

**唯一失败为既有、与本批无关**：`i18n-guard.test.ts` 的「allowlist 纪律：无重复、已排序、无陈旧条目」在 `app/desktop/confirm-card.ts` 失败（该文件经 B3 迁移后已无可扫描中文，仍留在 B0 allowlist）。当前 allowlist 62 条中 **40 条已陈旧**（B1/B2/B3 已迁移文件；清单见 `stale-allowlist.log`）。按任务约定本批**不改** `i18n-guard-allowlist.ts`，守卫收紧另批；本批新增 key 不改变该结果（守卫只读源码，不读消息目录）。

计数变化：目录 1213→**1234** key（`ui` 691、`main` 457→**478**、`shared` 62、`preferences` 3）。`i18n.test.ts` 仅更新分区计数与新增用例；B0/B1/B2 的既有 key 值、锚点、parity、占位符、复数断言均未修改或放宽。

## 7. 写集与边界

本批写盘（仅此 4 个产品/测试/记录文件 + 证据目录）：

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `角色卡/项目管理/docs/change/2026-10-23_change_i18n-b3-key-supplement.md`（本文件）及证据目录

未触碰：`app/desktop/**`、`app/renderer/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、`i18n-guard-allowlist.ts`、`package.json`、`tsconfig*`、其他角色卡/测试目录。未新增依赖；未 commit/push。

写集外未改动证明（`...-evidence/write-set-verification.log`）：
- B3 证据 `hashes.txt` 的 24 个文件（18 个 `app/desktop/*.ts` + 4 个 `test/桌面应用` 测试 + `api-spec.md` + B3 记录）当前 `git hash-object`/`sha256sum` 逐项一致（24/24 UNCHANGED）。
- `test/项目管理/shared/i18n-guard-allowlist.ts` 的 sha256 与 B0 证据基线一致（`fdf9317a…`），本批未改。

## 8. 候选与证据

- 逐项分类：`2026-10-23_change_i18n-b3-key-supplement-evidence/classification.tsv`
- key 清单：`.../new-keys.tsv`、`.../reused-keys.tsv`
- 不补项：`.../kept-non-target.tsv`
- 原始输出：`.../test-i18n.log`、`.../test-shared.log`、`.../guard.log`、`.../stale-allowlist.log`、`.../typecheck.log`、`.../env.log`
- 写集边界：`.../write-set-verification.log`
- 哈希：`.../hashes.txt`（`git hash-object` + `sha256sum`，写盘后复算）
