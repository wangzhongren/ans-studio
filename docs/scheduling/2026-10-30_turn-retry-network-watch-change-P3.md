# 变更包：turn-retry-network-watch P3（仅 replay-safe 同回合安全重试）

- **任务 ID**：`2026-10-30-turn-retry-network-watch`｜**批次**：P3｜**风险档位**：**T3**（团队计划 §1.3：重试可能重复副作用；仅 replay-safe；必须全量 + Electron）
- **记录角色**：统筹（Scheduler）变更包记录；执行者：本波实施上下文（按团队计划 §3.2–3.7 P3 写集与任务书）
- **日期**：2026-10-30
- **状态**：候选已实现并通过本包列示验证；**未 push、未合并 main、未发布**；交独立验收复验
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（客户确认「A 全套（推荐）」；追加授权「p2 和 p3 我也授权」；默认自动中止保持 0、T1/1h 兜底不变）
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`；§4 请求/回合重试、§6 可观测性、§10 Q2/Q3/Q11）
  - 团队计划 v1：`docs/scheduling/2026-10-30_turn-retry-network-watch-team-plan.md`（517 行；SHA-256 `69de90a1d400d64075eaaed207e4e41e1eb9a418c5e1f73b31af72fa02e76809`；§3.2–3.7 P3 写集、§4.5、§五、附录 B、Delta-TR-1/2/3/5）
  - 验收标准 v1.2：`docs/acceptance/turn-retry-network-watch-criteria-v1.md`（335 行；SHA-256 `5cf419ffc6c3285e4ff1562dff3a03e3866930e8fd90eb8a6ef23b774e6bff03`）。**v1.2 仅含 P0/P1/P2 章节，无 P3 章节**；按任务书要求，P3 以方案 §4 与 Q10 Q2/Q3/Q11 逐条自证（见 §四），不弱于方案，并在此明确登记。
  - P0–P2 已实现基线：main `143a8cf`（含 P0/P1/P2 与图片预算移除）；Delta-TR-2 桌面窗口边界已在本基线（`7fb2b11`，含 `test/桌面应用/replay-safe-retry.test.ts` 精确授权）；Claude适配器/运行时核心/桌面窗口/项目管理/测试边界见各 `boundary.md` Section 1。
  - 验收前 P3 标准缺失的处置：本包 §四 将任务书测试要求逐条映射到真实路径测试；独立验收可据此复验。

---

## 一、候选身份

| 项 | 值 |
| --- | --- |
| worktree | `.claude/worktrees/replay-safe-retry` |
| 分支 | `feat/replay-safe-retry` |
| 基线 | `143a8cf`（main；含 P0/P1/P2/图片预算移除/Delta-TR-2） |
| 最终候选（产品+测试） | **`2af8b5059cb61df75c056e449da8d8e0875678d6`**（tree `4c1accee9e8212346ac8e511602c729c97c4ff63`；相对基线 16 文件 +1195/−57） |
| 治理记录提交 | 本文件所在提交（change-package + P3 证据） |
| 逐文件哈希 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P3-evidence/candidate-file-hashes.txt`（14 文件；`git hash-object` + SHA-256 + 字节数） |
| 证据 manifest | `...P3-evidence/sha256.txt`（**47** 文件；SHA-256 **`20c96d6a5ae02876e372a3607ef04a0c38f7e225c397c725eb381c3938c5ba2a`**；`bash verify-sha256-normalized.sh` **ok=47 failed=0**；Electron 日志为 CRLF，按归一化口径校验；口径见 `manifest-notes.txt`） |
| 证据目录 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P3-evidence/` |

**改动文件（16，均在任务书写集内）**：

- 运行时核心：`src/model/runtime.ts`（`MODEL_REQUEST_RETRY_EXHAUSTED`；`requestAttemptMax`/`requestRetryBaseMs`/`requestRetryMaxDelayMs`/`requestRetryBudgetMs` 选项；`replaySafe` 字段语义按字段名修正），`src/service/runtime/session.ts`（P3 选项透传；适配器 settled 的 attempts/replaySafe 带入终态；重试耗尽人话短报与 detail errorCode）
- Claude适配器：`src/provider/claude/session.ts`（同回合 replay-safe 重试和 replaySafe 判定、attempt/退避/预算/取消、SDK api_retry 期间不并发、终态试图）
- 桌面窗口：`app/desktop/session.ts`（`MODEL_REQUEST_RETRY_EXHAUSTED` 识别与人话系统行；turn.settled 诊断带 attempt/replayPlan）
- 项目管理（i18n）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（`main.requestStatus.retryExhausted` 中英成对）
- 新增测试：`test/claude-adapter/replay-safe-retry.test.ts`、`test/桌面应用/replay-safe-retry.test.ts`（Delta-TR-2）、`test/测试/retry-safety-e2e.test.ts`
- 既有测试更新（只按 P1 语义钉住、replaySafe 极性修正与高负载时序稳定化，不删测/不放宽）：`test/claude-adapter/request-timeout.test.ts`、`test/claude-adapter/session.test.ts`、`test/桌面应用/request-timeout-wiring.test.ts`（另：把瞬时 busy 观察替换为 `started` + 强终态观察，见 §八-9）、`test/测试/request-timeout-e2e.test.ts`、`test/项目管理/shared/i18n.test.ts`、`test/测试/g5-reasoning-verify/c-claude.test.ts`、`test/桌面应用/e2e/main.mjs`（截图辅助有界重试，见 §八-10）。

**未触改（按需最小，无需改动）**：`src/pipeline/orchestration/run-role.ts`（`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传 P3 选项）；`app/desktop/interface.ts`（人话系统行沿用既有 delivery-note 通道与 role-state，无需新字段）；`src/common/shared/diagnostics.ts`（未改白名单，只读复用）；`src/common/runtime-core/request-timeout.ts`/`network-gate.ts`（P1/P2 模块只读复用）；`src/provider/runtime/`（无新文件，Delta-TR-3）；Pi/Codex 源码（Q10，只回归）；`package.json`/lock/release-policy/electron-builder；角色卡/边界；§5A 专属段。

---

## 二、重试边界与副作用安全设计（方案 §4 逐条落地）

### 2.1 唯一安全门槛＝运行时真实状态（非模型自报）

| 不可重放来源 | 运行时置位点（`src/provider/claude/session.ts`） |
| --- | --- |
| assistant 文本 | `assistant` 帧中非空 `text` 块 ⇒ `turn.replayUnsafe = true` |
| thinking / redacted_thinking | 非空 `thinking` / `redacted_thinking` 块 ⇒ `turn.replayUnsafe = true` |
| 工具调用（ANS handler） | handler 进入即 `turn.replayUnsafe = true`（工具真正执行前） |
| 工具调用（PreToolUse 放行：ANS/外来 MCP/WebSearch） | PreToolUse allow 分支立即置位（tool handler 之前） |
| 客户交互/确认 | `InteractionGate.isWaiting()` 或 `onChange(waiting=true)` ⇒ `turn.interactionSeen = true`（等待或已回答均不可重放） |

`replaySafe = !turn.replayUnsafe && !turn.interactionSeen`。该值由适配器运行时状态计算，**不读取模型文本/自报**；每次 attempt 失败时快照一次（`lastFailureReplaySafe`），用于重试门槛与终态/诊断如实标注。

### 2.2 可重试失败分类（请求/流层，且只在在线时）

- **可重试**：P1 `RequestTimeoutFailure`（`request-timeout-first-byte` / `request-timeout-idle`）；SDK 事件流抛错/未返回结果（传输/流错误）；结果帧错误且可重试状态（`408/425/429/5xx`，无状态文本按瞬时错误）。
- **不可重试**：`AbortError`（取消优先）；1h `TURN_LAST_RESORT`；P2 `network-offline-timeout`；`networkGate` 离线；恢复中的会话（`resumeId` 存在时结果/流失败，避免同 turn 换新上下文）；思考参数确定性拒绝（`isReasoningRejection`，避免重复 4xx）；清理失败（`teardownError`）；任何有文本/thinking/工具/客户交互副作用的失败。
- **保守原则**：任何不确定一律不重试；宁可少重试。

### 2.3 attempts / 退避 / 预算 / 取消

- **attempts**：`requestAttemptMax` 缺省 3（首次 + 2 次重试），实现 clamp 1..3（注入不能放宽）；每次 attempt 仍以**同一输入、同一 turnId、同一 sdkUuid** 重开，不新增用户消息/turnId/prompt-input 行。
- **退避**：指数 `base × 2^(n-1)`，缺省 base 1000ms、单次上限 8000ms（1s/2s/4s 级别；缺省 3 attempts 实际使用 1s/2s）。退避期间 abort/dispose 立即终止；退避结束后再次检查在线与取消。
- **预算**：`requestRetryBudgetMs` 缺省 600000（10min，自本回合 prompt 起算，含退避）；预算不足不再重试，终态如实 `failed`。另加保守护栏：不因重试累计跨过 `turnLastResortMs`（1h）墙钟。
- **1h 最后兜底不变**：Service 层 `withPausableTimeout(..., turnLastResortMs, "本轮最后兜底")` 仍是整轮唯一权威上限；适配器每 attempt 的 1h 计时仅供直接使用适配器时的兜底，不改变 Service 语义。
- **取消优先**：abort/stop 立即 reject 当前 attempt；退避中 abort 立即终止且不再发起 attempt；终态 `aborted`。

### 2.4 同 turn 重开机制（不重复副作用的核心）

1. 失败且满足门槛 ⇒ **先关闭当前 SDK query/engine**（`closeEngine`：abort + input.close + query.close），确保旧请求不残留；
2. 退避（可取消）；
3. 以同一输入重新 `startEngine` → 同一 `sdkUuid`/turnId 推入新 query；
4. 每 attempt 不单独结算：整轮仍**恰一条 settled**、**恰一个 handback**（成功或失败各一份）；
5. **SDK 内部 `api_retry` 期间 ANS 不并发重试**：ANS 只在 attempt 失败（SDK 最终放弃/流终止）后决策；新 query 只在旧 query 关闭后创建。真实路径测试断言任一时刻只有一个打开的 query（`maxConcurrentQueries=1`）。

### 2.5 与 P2 网络协作

- **离线期间不发起重试**：重试前与退避后都检查 `networkGate.isOnline()`；离线失败如实结束（不自动重放）。
- **恢复窗口内由 P2 的 pause/resume 继续原请求**（5min 窗口、`network-offline-timeout` 终态、`networkOfflineFailureFacts` 可见）——P3 不改 P2 路径；P2 定向回归通过。
- 网络离线错误（`NetworkOfflineError`）明确排除在 P3 重试之外，避免与 P2 窗口叠加。

### 2.6 终态与报告（Q3）

| 情形 | 终态 | errorCode | 人话 |
| --- | --- | --- | --- |
| 重试后成功 | `completed` | — | `settled.detail` 带 `attempts=2`、`replaySafe=true`；不产生失败系统行 |
| 重试耗尽/预算耗尽 | `failed` | `MODEL_REQUEST_RETRY_EXHAUSTED` | Service 短报「本轮自动重试仍未成功，已结束。」；桌面一条 delivery-note「已自动重试仍未成功；本轮已结束，可稍后重发。」；不伪造成功 |
| 有副作用后失败 | `failed` | 底层（如 `request-timeout-idle` / `MODEL_REQUEST_FAILED`） | detail `replaySafe=false` 可见；沿用既有超时/失败人话 |
| 取消 | `aborted` | — | 既有中止文案 |
| 离线超窗 | `failed` | `network-offline-timeout` | P2 既有网络文案（P3 不叠加） |

失败后队列继续 drain；不自动重复派发；任务完成状态不伪造。

### 2.7 语义不变（Q11 / P7）

- `DEFAULT_TURN_ABORT_MS=0`、`promptTimeoutMs` 5min 仅看护提示、`turnLastResortMs` 1h 最后兜底、T1 100ms/180ms/settled/handback 语义均未改；T1 定向通过。
- 不改五步链/角色/权限/边界；Pi/Codex 源码零改动（只回归）；无 `src/provider/runtime/` 新文件；无 release/package 改动；§5A 只读。

---

## 三、`replaySafe` 字段语义修正（P1 遗留，P3 对齐）

P1 曾把错误/事实字段 `replaySafe` 置为 `turn.replayUnsafe`（true = 已有副作用），与字段名、方案 §4.3.3（安全条件 `turn.replayUnsafe === false`）、§6 诊断表（`replaySafe`）及任务书 P3 验收（「已输出文本/工具后失败 ⇒ `replaySafe=false` 可见」）相反。P3 统一为：

- `replaySafe = true` ⇒ 本回合仍可安全重放（无文本/thinking/工具/客户交互副作用）；
- `replaySafe = false` ⇒ 已产生不可重放副作用。

影响与同步更新：`createRequestTimeoutFailure`/`createNetworkOfflineFailure` 调用点传入 `!turn.replayUnsafe && !turn.interactionSeen`；错误统计字段、适配器 settled、Service 终态 detail、桌面诊断 `replayPlan` 同口径。P1/P2 e2e 的 `replaySafe` 断言同步更新（安全超时 ⇒ `true`）。该修正只涉及结构化 detail/诊断，不改变任何客户可见文案，也不改变重试决策（决策使用内部 `replayUnsafe`/`interactionSeen`）。

---

## 四、不变量 → 实现 → 真实路径测试映射（P3 自证：方案 §4 + Q2/Q3/Q11）

| # | 要求（任务书/方案） | 实现 | 真实路径测试 |
| --- | --- | --- | --- |
| 1 | 仅「无文本/thinking/工具/客户交互」时允许同回合重开；运行时状态驱动 | `turn.replayUnsafe`（文本/thinking/工具/PreToolUse）＋`turn.interactionSeen`（InteractionGate）；`replaySafe` 快照 | adapter：首字节前流失败重试成功（attempts=2、replaySafe=true）；文本后失败、工具后失败、客户交互后失败均不重试（attempts=1、replaySafe=false） |
| 2 | 一旦有其一绝不重放（如实失败） | 重试门槛硬性要求 `replaySafe`；副作用后底层 errorCode + `replaySafe=false` | adapter 文本/工具/交互三例；e2e 文本后失败（users=1、无 request.retry、replaySafe=false） |
| 3 | 最多 3 attempts（首次+2 重试） | `requestAttemptMax` 缺省 3 且 clamp ≤3 | adapter 耗尽例（users=3、configurations=3）；预算耗尽例（不再发起） |
| 4 | 退避 1s/2s/4s 级别 | `base×2^(n-1)`，base 1000、上限 8000 | adapter 耗尽例注入 10ms ⇒ 诊断 delay 10/20（1x/2x）；e2e 同断言 |
| 5 | 总预算 10min | `requestRetryBudgetMs` 缺省 600000，自 prompt 起算 | adapter 预算耗尽例（预算 10ms、首字节 40ms ⇒ 不重试、`MODEL_REQUEST_RETRY_EXHAUSTED`、attempts=1） |
| 6 | 耗尽如实 `failed` + errorCode + 短报 | Service 终态 failed + `MODEL_REQUEST_RETRY_EXHAUSTED` + 人话 summary；桌面 delivery-note 人话 | e2e 耗尽例（summary/errorCode/attempts/replaySafe）；桌面 exhaustion 例（恰一条人话系统行、无技术 code、lastTurn errorCode） |
| 7 | 整轮恰一个 settled / handback；每次 attempt 不单独结算 | 重开循环位于单次 prompt 内；Service 只发一次 settled；withHandback 按 turnId 恰一次 | adapter/e2e 断言 settled=1；e2e 断言 handback=1（成功 completed；失败 failed 且不声称完成）；桌面重复终态不重复系统行 |
| 8 | 不重复文本/工具 | 重开只发生在无输出阶段；成功 attempt 的输出只出现一次 | adapter 成功重试文本恰一次、工具 start 恰一次；e2e 成功文本恰一次、prompt-input 恰一次 |
| 9 | 取消优先（abort/stop 立即终止、不再重试） | 退避 `waitForTurn` 监听 turn signal；abort ⇒ 立即 reject；不再 continue | adapter 退避中 abort（<1s 返回、users/configurations=1、outcome aborted） |
| 10 | 离线不发起重试；恢复窗口由 P2 续跑 | 重试前/退避后检查 `networkGate.isOnline()`；离线失败如实抛出；P2 路径未改 | adapter 离线失败（无 request.retry、users=1、网络暂停诊断仍可见）；P2 定向回归（network-state-e2e/network-monitor/network-gate） |
| 11 | `networkOfflineFailureFacts` 可见 | P2 未改；P3 只排除重试 | P2 定向回归通过（errorCode/attempts/replaySafe/offlineMs） |
| 12 | SDK `api_retry` 期间 ANS 不并发 | 只在 attempt 失败后决策；先 close 再 start | adapter SDK api_retry 例（maxConcurrentQueries=1、users=2、request.sdk-retry 仍在） |
| 13 | 诊断 `request.retry` 字段齐全；一行角色日志；不外泄 prompt/凭据/URL | `attempt`、`count`←max、`durationMs`←delay、`errorCode`、`mode`←timeoutKind、`replayPlan`←replaySafe；角色日志一行人话 | adapter/e2e 诊断断言；adapter 角色日志断言不含 URL/凭据/错误正文/技术 code |
| 14 | UI/系统行如实显示重试与最终失败（人话，无技术 code 于客户卡） | 适配器角色日志一行；失败终态 delivery-note（i18n）；客户卡无 code | e2e 重试日志一行；桌面 exhaustion/完成/不安全三例；i18n 中英断言 |
| 15 | 1h/5min/默认 0/T1 不变 | 常量/默认未动；Service 1h 仍权威 | T1 定向通过；全量回归 |
| 16 | 不新增 `src/provider/runtime/` 文件、不改 Pi/Codex/release/§5A | 未触改 | diff/写集核对；Pi/Codex 全量回归 |

---

## 五、诊断与文案字段落地（不改 `src/common/shared/diagnostics.ts`）

| 事件 | 实际落盘字段（← 语义） |
| --- | --- |
| `request.retry` | `turnId`、`attempt`←即将开始的 attempt 序号（2/3）、`count`←max attempts（3）、`durationMs`←退避 delay、`errorCode`、`mode`←timeoutKind（可选）、`replayPlan:"safe"` |
| `request.failed` | `turnId`、`errorCode`（重试耗尽 = `MODEL_REQUEST_RETRY_EXHAUSTED`）、`attempt`←attempts、`durationMs`←本回合耗时、`replayPlan`←replaySafe |
| `request.timeout`（P1 沿用） | `replayPlan` 现按 `replayUnsafe || interactionSeen` 如实标注 |
| `turn.settled`（桌面） | `turnId`、`state`、`busy`、`outcome`、`errorCode`、**`attempt`←attempts**、**`replayPlan`←replaySafe** |
| 角色日志 | `接口请求未成功，正在自动重试（第 N/M 次）`（source=system，reasonCode=`claude-request-retry`，state=retrying）；不含错误正文/URL/凭据/技术 code |

**字段缺口（同 P1/P2 口径，如实登记）**：方案 §6.3 的 `request.retry` 字面字段 `delayMs`/`reason`/`replaySafe` 与 `turn.settled` 的 `attempts`/`replaySafe` 不在 `diagnostics.ts` 既有白名单；本批按「诊断白名单只读复用、不改 `src/common/shared/diagnostics.ts`」用既有字段承载（上表映射）。若验收要求字面字段名，需另开白名单变更（不在本批授权）。

**客户可见文案**：新增 i18n `main.requestStatus.retryExhausted`（zh-CN/en-US 成对；无技术 code/URL/堆栈；英文零 Han）。技术 errorCode 只进 detail/诊断/lastTurn，不进客户卡。

---

## 六、测试差异表（新增/重写/删除）

| 文件 | 类型 | 差异 | 理由 |
| --- | --- | --- | --- |
| `test/claude-adapter/replay-safe-retry.test.ts` | 新增 | **9 tests** | 真实适配器（假 SDK 传输）：重试成功、耗尽、预算耗尽、文本/工具/交互不安全、退避取消、离线不重试、SDK api_retry 不并发（附录 B） |
| `test/桌面应用/replay-safe-retry.test.ts` | 新增（Delta-TR-2） | **4 tests** | 真实 SessionManager：耗尽人话系统行/lastTurn/诊断、成功重试无失败行、不安全 replaySafe=false、i18n |
| `test/测试/retry-safety-e2e.test.ts` | 新增 | **3 tests** | 真实 openRoleSession+Service+适配器：重试成功（settled/handback 各 1）、耗尽（failed+errorCode+人话+failed handback）、文本后不重试（附录 B） |
| `test/claude-adapter/request-timeout.test.ts` | 修改 | 选项 `requestAttemptMax: 1` | 钉住 P1 超时语义（本文件不测 ANS 重试）；断言未放宽 |
| `test/claude-adapter/session.test.ts` | 修改 | 选项 `requestAttemptMax: 1` | 既有适配器语义/恢复/兼容用例不被 P3 重试改变；断言未放宽 |
| `test/测试/request-timeout-e2e.test.ts` | 修改 | `requestAttemptMax: 1`；`replaySafe` 断言按 P3 契约修正（安全超时 ⇒ true） | 钉住 P1 e2e 语义；字段语义修正见 §三 |
| `test/桌面应用/request-timeout-wiring.test.ts` | 修改 | 假 settled detail `replaySafe: true`；三处瞬时 `busy` 观察改为 `started` deferred + 强终态观察（系统行/lastTurn），断言对象不变 | 与 P3 字段语义一致；修复 P2 证据 §七-10 已登记的既有 6s 时序脆弱（见 §八-9） |
| `test/测试/g5-reasoning-verify/c-claude.test.ts` | 修改 | 选项 `requestAttemptMax: 1` | 该套件验证思考参数映射/兼容判据；负例「如实失败一次」不被 ANS 重试改变（重试由 P3 专属套件覆盖） |
| `test/桌面应用/e2e/main.mjs` | 修改 | 截图辅助 `shot()` 增加 6×200ms 有界重试（仅补拍同一屏幕） | 首帧 `capturePage` 偶发 `UnknownVizError`（P2 验收报告 F3 已登记）；截图内容/全部 E2E 断言不变（见 §八-10） |
| `test/项目管理/shared/i18n.test.ts` | 修改 | 计数 `main 546/总计 1483` → `main 547/总计 1484` | 新增 `main.requestStatus.retryExhausted` 中英成对 |
| 删除/放宽断言/新增 skip | **无** | — | — |

**测试规模**：P2 基线 372 文件 / 3144 tests（3117 pass / 9 fail EPERM / 18 skip）→ **P3 375 文件 / 3160 tests**（3133 pass / 9 fail / 18 skip；+3 文件、+16 tests 均为新测试；+16 pass = 新测试全过）。

---

## 七、验证证据（最终候选，基线 `143a8cf`）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 定向回归（P0/P1/P2/P3/T1，18 文件） | **144 / 143 pass / 1 fail（既有 Windows symlink EPERM）/ 0 skip**；P3 新套件 16/16、T1 6/6、g5 c-claude 6/6 | `targeted-regression.log` / `targeted-regression-summary.txt` |
| 全量回归 | **3160 / 3133 pass / 9 fail / 18 skip / 0 todo**；exit 1；240,133.89 ms；**375 文件**；9 红与 S1/P0/P1/P2 同集合（Windows symlink EPERM），**新增确定性失败 = 0、新 skip = 0** | `full-regression-serial.log` / `full-regression-summary.txt` / `full-regression-file-list.txt` |
| 主 typecheck | exit 0（0 error） | `typecheck.log` / `typecheck-summary.txt` |
| 渲染 typecheck / build | exit 0 / exit 0（built in 327ms） | `typecheck-renderer.log`、`build-renderer.log` |
| 真实 Electron E2E | **E2E_PASS=true**；`E2E_FAILURES` 空；**18 PNG**（含 SHOT_00_TITLEBAR） | `electron-e2e.log`、`electron-e2e/report.txt`、`electron-e2e-screenshots.sha256`、`electron-e2e-summary.txt` |
| phase5a 渲染 smoke | **40/40 checks，failures=0**；no console errors / no CSP violations；7 PNG | `phase5a.log`、`phase5a-smoke/report.json`、`phase5a-summary.txt` |
| 目标项目零写入 | 通过（测试夹具均 `os.tmpdir()`；E2E 用 worktree 根/临时 userData） | `target-zero-write.txt` |
| 候选/证据哈希 | 可复算 | `candidate-file-hashes.txt`、`sha256.txt`、`verify-sha256-normalized.sh`、`reproduce-commands.txt` |

---

## 八、偏差、风险与已知限制

1. **验收标准缺 P3 章节**（已登记）：v1.2 仅 P0/P1/P2；本包按任务书以方案 §4 + Q2/Q3/Q11 自证，§四逐条映射，不弱于方案。
2. **`replaySafe` 极性修正**（§三）：P1 曾按 `turn.replayUnsafe` 置值；P3 对齐字段名/方案/任务书。P1/P2 e2e 与该字段相关的断言同步更新（安全 ⇒ `true`）。P1/P2 已验收结论中「detail 带 replaySafe」仍成立，但该字段取值语义已由 P3 变更，建议独立验收在 P3 复验时一并核对。
3. **诊断字面字段名缺口**：`request.retry`/`turn.settled` 的 `delayMs`/`reason`/`replaySafe`/`attempts` 用既有白名单字段承载（`count`/`durationMs`/`mode`/`replayPlan`/`attempt`）；`diagnostics.ts` 未改。
4. **写集收窄（只缩不放）**：团队计划附录 B 的 `src/common/runtime-core/request-retry.ts`、`test/runtime-core/request-retry.test.ts`、`test/桌面UI/retry-status.test.ts` 未实现——任务书未列出，按任务书写集收窄；重试策略以纯函数内联在 Claude适配器，并由真实适配器/桌面/ e2e 三路测试覆盖。若团队计划要求补齐纯逻辑/UI 测试文件，需补充派发。
5. **恢复中的会话不重放**：`resumeId` 存在时结果/流失败直接如实失败（避免同一 turn 内换新上下文），保留既有 warning 文案与恢复测试语义。
6. **离线流失败与 P2 窗口的边界**：请求在离线期间自行失败时不等待 P2 窗口到期，而是如实失败（`MODEL_REQUEST_FAILED`，replaySafe 按真实状态）；P2 的窗口终态仍适用于仍在进行中的请求。这是对任务书「离线期间不发起重试（走 P2 路径）；P3 的重试只用于非网络失败（超时/流错误等）且在线」的保守实现。P2 变更包 §七-11 所述「窗口内恢复时重试」由 P2 的 pause/resume 继续**同一原请求**实现，P3 不另起新请求，避免与 P2 叠加。
7. **预算/最后兜底口径**：重试预算按墙钟自 prompt 起算（含交互暂停时间）；适配器另用 1h 墙钟护栏避免重试跨过最后兜底；Service 层 1h `withPausableTimeout` 仍是整轮唯一权威上限。
8. **风险与缓解**：重复副作用由运行时 `replayUnsafe`/`interactionSeen` 硬门槛 + 文本/工具/交互三路测试守住；SDK 重试并发由「失败后才决策 + 先 close 后 start」和并发断言守住；取消优先由退避中 abort 测试守住；终态不实由 settled/handback 恰一次与不伪造成功断言守住。
9. **既有 `request-timeout-wiring.test.ts` 时序脆弱（P2 证据 §七-10 已登记）**：测试依赖瞬时 `busy=true/false` 快照；当前机器高负载下 400×5ms 轮询会变慢，快照可能被下一次 settled/队列放行覆盖而漏看。**对照复现**：未改动的 P2 基线 worktree（`network-monitor`，候选 `d6b30ef`）在同一负载下 5/5 复现同一失败（「普通失败轮未开跑」6.28s），证明非 P3 回归。**处置（P3，写集内「既有桌面测试按需更新」）**：`failedTurn` 增加 `started` deferred（真实投递进入即结算），等待条件改为 `started` + 强终态观察（恰一条系统行 / `lastTurn.outcome`）；断言对象（系统行、lastTurn、诊断、队列继续）不变，busy 复位不变量仍由 P0 `turn-lease/queue-visibility/abort-unwedge` 专项覆盖。稳定化后单文件 6/6、定向全套通过、全量回归见 §七。
10. **E2E 截图偶发 `UnknownVizError`（P2 验收报告 F3 已登记）**：本环境首帧 `capturePage` 连续失败（17 PNG）；`shot()` 增加 6×200ms 有界重试后 **18/18 PNG**，`E2E_PASS=true`。重试仅补拍同一屏幕，不改截图内容/断言/E2E 流程；属证据采集辅助修复（`test/桌面应用/e2e/main.mjs`，写集内既有桌面测试按需更新）。**证据时序如实**：全量回归只执行 `*.test.ts`，不执行该 E2E 脚本；该文件的变更由全量回归之后单独运行的真实 Electron E2E（18 PNG、`E2E_PASS=true`）覆盖。

---

## 九、回滚

- 未提交：恢复批前文件并重跑本批验证；已提交：`git revert` 本批提交并重跑。
- 无数据/schema 迁移；队列/诊断为用户态运行数据，可保留/清理但不写项目；1h/5min/默认 0/T1 语义随回滚恢复原状；不重放已执行工具/不改历史证据。

## 十、发布与状态

- 是否发布：**否**；是否 push/合并 main：**否**；是否触发独立验收：**是**（本包 + 证据目录）。
- 候选仅来自本 worktree 相对 `143a8cf` 的 diff；主检出/其他 worktree/目标项目未参与候选。
