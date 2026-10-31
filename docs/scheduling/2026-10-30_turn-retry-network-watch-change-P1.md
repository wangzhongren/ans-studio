# 变更包：turn-retry-network-watch P1（请求级超时 + SDK `api_retry` 诊断）

- **任务 ID**：`2026-10-30-turn-retry-network-watch`｜**批次**：P1｜**风险档位**：**T3**
- **记录角色**：统筹（Scheduler）变更包记录；执行者：本波实施上下文（按团队计划 §3.2–3.6 P1 写集）
- **日期**：2026-10-30
- **状态**：候选已实现并通过本包列示验证；**未 push、未合并 main、未发布**；交独立验收判定
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（含「P1 实施授权记录（2026-10-30，客户『P1 拍』）」；SHA-256 `d0fdda1f42d09362b174c90f1dc535c33b6d0bfa0c2e27dc1a0fce757f55ab03`）
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`；§4.3 超时/暂停/`api_retry`、§6 可观测性、§10 Q1/Q2/Q10/Q11）
  - 团队计划 v1：`docs/scheduling/2026-10-30_turn-retry-network-watch-team-plan.md`（517 行；SHA-256 `69de90a1d400d64075eaaed207e4e41e1eb9a418c5e1f73b31af72fa02e76809`；§3.2–3.6 P1、§四 4.3、§五）
  - 验收标准：`docs/acceptance/turn-retry-network-watch-criteria-v1.md`（142 行；SHA-256 `e68f16645144ad5926a6e3bd3975ab5b9b72930280787ddfa7110009baa5d1eb`；**该文件范围为 P0**，P1 正式标准由独立验收另行写盘；本包按任务书 P1 测试要求自证）
  - P0 已验收：change-package `...-change-P0.md`、证据目录 `2026-10-30_turn-retry-network-watch-P0-evidence/`（manifest `fe858efb…`）；P0 验收 pass 记录于沟通文件

---

## 一、候选身份

| 项 | 值 |
| --- | --- |
| worktree | `.claude/worktrees/request-timeouts` |
| 分支 | `feat/request-timeouts`（自 main `66f0a31`，已含 P0 与 §5A） |
| 基线 | `66f0a31`（`docs(scheduling): add turn-retry-network-watch P0 change package and evidence`） |
| 候选提交（产品+测试） | `105c187d30bedabddb6595565720bc0c04ad34a6`（tree `1200d4c123ee317abb39c1420223127d1efaf11c`；13 文件 +1534/−15） |
| 治理记录提交 | 本文件所在提交（change-package + P1 证据） |
| 逐文件哈希 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P1-evidence/candidate-file-hashes.txt`（`git hash-object` + SHA-256 + 字节数） |
| 证据 manifest | `...P1-evidence/sha256.txt`（101 文件；SHA-256 `adadec098f6869b694470e264ad4ffcc50f74030ceb4633487f485f2b6058c41`） |

**改动文件（13，均在授权写集内；无 §5A/Pi/Codex/release 文件）**：

- 运行时核心：`src/common/runtime-core/request-timeout.ts`（新增：默认值/错误类型/可注入 deadline），`src/model/runtime.ts`（`MODEL_REQUEST_TIMEOUT`/`MODEL_REQUEST_FAILED`/`RequestTimeoutKind`/错误码表/`RuntimeRequestFailureFactsV1`/提供方选项），`src/service/runtime/session.ts`（透传 + settled.detail/短报）
- Claude适配器：`src/provider/claude/session.ts`（首字节/流空闲 deadline；`system/api_retry` 消费；交互/工具/原生工具/abort 暂停；failed 终态错误码）
- 桌面窗口：`app/desktop/session.ts`（人话系统行；lastTurn/turn.settled 诊断 errorCode；role_status 末轮附错误码）
- 项目管理（i18n）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（`main.requestStatus.*` 3 key）、`test/项目管理/shared/i18n.test.ts`（计数 `542→545` / `1475→1478`）
- 新增测试（边界/目录授权内）：`test/runtime-core/request-timeout.test.ts`、`test/claude-adapter/request-timeout.test.ts`、`test/桌面应用/request-timeout-wiring.test.ts`（Delta-TR-2 名单）、`test/桌面UI/request-status.test.ts`、`test/测试/request-timeout-e2e.test.ts`

**未触改（按需最小，无需改动）**：`src/pipeline/orchestration/run-role.ts`（`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 已自动透传新选项，无需改代码）、`app/desktop/interface.ts`（系统行复用既有 `delivery-note` 通道）、`src/provider/runtime/schema.ts`、`src/common/runtime-core/timeout.ts`、`app/renderer/**`（既有 `events.ts` 已按 settled summary/delivery-note 渲染，UI 测试以生产函数验证）。**未触改**：`src/common/shared/intent-entry-contract.ts`、四卡契约句、`contract_check` 契约段/显式 intentId（§5A 只读）、Pi/Codex 源码、`package.json`/lock/release-policy/electron-builder、角色卡/边界、`src/*/shared/diagnostics.ts`。

---

## 二、不变量 → 实现 → 测试映射

| # | 要求（团队计划 P1 / 方案 §4.3 / Q1·Q2·Q10·Q11） | 实现 | 测试（真实路径） |
| --- | --- | --- | --- |
| 1 | **首字节 90s / 流空闲 300s（默认；测试可注入小值）** | `request-timeout.ts` 常量 90000/300000；`createRequestDeadline` 两阶段（首字节→空闲）；适配器解析 `options.requestFirstByteTimeoutMs/requestIdleTimeoutMs` | `test/runtime-core/request-timeout.test.ts`（默认值/到点）；`test/claude-adapter/request-timeout.test.ts`（注入 40ms 首字节超时、空闲超时；错误 code 正确）；`test/测试/request-timeout-e2e.test.ts`（编排→Service→适配器端到端） |
| 2 | **首字节口径**：assistant/user/result/system `api_retry` 任一；其余系统消息不关闭首字节、到达后重置空闲 | 适配器 pump `isFirstByteMessage` + `deadline.activity()`；首字节到达写 `request.first-byte` | 适配器空闲测试（assistant 首帧后静默）；`api_retry` 首帧即可关闭首字节（SDK 重试测试 200ms 首字节时限内多次重试不超时） |
| 3 | **计时暂停**：客户交互等待、工具执行、abort 清理停走；网络暂停由 P2 接线（本批只留中性接口） | `RequestDeadline.pause()/resume()` 引用计数；交互闸 `onChange`、ANS 工具 handler、原生工具（外来 MCP/WebSearch）PreToolUse→tool_result、turn abort 监听 | 适配器三例：交互 gate 跨 120ms 不超时/恢复后按剩余超时；工具 handler 睡 120ms（idle 40ms）不超时；abort 后无 `request.timeout` |
| 4 | **正常长回合不被误杀**：idle 而非整轮墙钟 | 每条 SDK 消息重置 idle；无总时长限制 | 适配器「每 15ms 一帧 ×5」测试：总时长 > idle 仍 completed |
| 5 | **SDK `system/api_retry` 诊断 + 角色日志一行；期间 ANS 不并发重试** | pump 消费 `SDKAPIRetryMessage`：`request.sdk-retry` + 人话 message 行；P1 无 ANS 重试（P3 复用该门槛） | 适配器 api_retry 测试：2 条诊断（attempt/max/delay/status/no_response）、2 行角色日志、`users.length===1`、最终 completed |
| 6 | **失败终态如实**：请求超时 ⇒ `failed` + errorCode（`request-timeout-first-byte`/`request-timeout-idle`），不是 `timed_out`；不伪造成功 | 适配器抛 `RequestTimeoutError`（name 刻意非 TimeoutError）；Service 归类 failed，settled.detail 带 errorCode/attempts/replaySafe/timeoutKind；summary 人话短报 | 适配器首字节/空闲测试（恰一条 settled、outcome failed）；e2e 两例（`handle.send` 失败、summary、detail、无 handback、users=1） |
| 7 | **系统行/短报/诊断齐全，客户卡人话** | 桌面 settled 处理器按 errorCode 发恰一条 `delivery-note` 人话系统行（i18n `main.requestStatus.*`）；终态行文本 = Service 人话 summary；errorCode 只在 detail/诊断 | `test/桌面应用/request-timeout-wiring.test.ts`（系统行恰一条/去重/队列继续/lastTurn/诊断）；`test/桌面UI/request-status.test.ts`（真实 `describeEvent`；可见文本不含 code） |
| 8 | **不产生额外 settled/handback**（重试属 P3） | 适配器每次 prompt 恰一条 settled；Service 终态唯一；无重试 | 适配器/e2e 断言 settled 恰一条、handback 0 |
| 9 | **不改**：`turnLastResortMs` 1h、看护 `promptTimeoutMs` 5min、`DEFAULT_TURN_ABORT_MS=0`、T1 语义；Pi/Codex 不改源码（Q10） | 常量/默认值未动；新选项仅注入 Claude（Pi/Codex 忽略未知可选字段） | 全量 T1 三例不变；`watchdog-reuse` 默认 0 断言不变；Pi/Codex 全量回归 |

**可观测性落地（字段只用 `src/common/shared/diagnostics.ts` 既有白名单；该文件未改）**：

| 事件 | 字段（实际落盘名 ← 语义来源） |
| --- | --- |
| `request.attempt.start` | `turnId`、`attempt`、`timeoutMs` ← first-byte 时限、`durationMs` ← idle 时限、`mode:"claude"` |
| `request.first-byte` | `turnId`、`attempt`、`durationMs` ← 首字节有效耗时 |
| `request.sdk-retry` | `turnId`、`attempt` ← attempt、`count` ← max_retries、`durationMs` ← retry_delay_ms、`errorCode` ← error_status（null 记 `no-response`）、`state:"no-response"` + `timeoutMs` ← no_response.waited_ms |
| `request.timeout` | `turnId`、`attempt`、`mode` ← first-byte/idle、`timeoutMs` ← 触发时限、`durationMs` ← 有效耗时、`replayPlan:"safe"/"unsafe"` ← replaySafe |
| `request.failed` | `turnId`、`errorCode`、`attempt`、`durationMs`、`replayPlan` |
| `turn.settled`（桌面，既有事件） | 追加 `errorCode`（white-listed） |

**角色日志**：`api_retry` 一行「接口请求重试中（第 N/M 次，等待 Xms）」（不含错误正文/URL/凭据）；请求失败终态由 Service settled 人话 summary + 桌面 `delivery-note` 系统行呈现。**客户可见文案不含技术 code**；errorCode 只在 detail/diagnostics/role_status（su 只读面）。

---

## 三、测试差异表（新增/重写/删除）

| 文件 | 类型 | 差异 | 理由 |
| --- | --- | --- | --- |
| `test/runtime-core/request-timeout.test.ts` | 新增 | 7 tests | deadline 纯逻辑：默认值/首字节/空闲重置/暂停引用计数/stop/关闭首字节时限/暂停中首字节（附录 B） |
| `test/claude-adapter/request-timeout.test.ts` | 新增 | 7 tests | 真实适配器：首字节/空闲/长回合/交互暂停/工具暂停/abort/api_retry 诊断与不并发（附录 B） |
| `test/桌面应用/request-timeout-wiring.test.ts` | 新增 | 3 tests | 真实 SessionManager：人话系统行/去重/队列继续/lastTurn/诊断；空闲与一般失败文案；无 code 失败不新增系统行（Delta-TR-2） |
| `test/桌面UI/request-status.test.ts` | 新增 | 4 tests | 真实 `describeEvent` 终态行/delivery-note 系统行；i18n 中英；主进程/Service/渲染层接线钉子（附录 B） |
| `test/测试/request-timeout-e2e.test.ts` | 新增 | 2 tests | 真实 openRoleSession（编排+Service）+ 真实适配器（假 SDK 传输）：两超时端到端、恰一条 settled、无 handback、零 `.ans` 写入（附录 B） |
| `test/项目管理/shared/i18n.test.ts` | 修改 | 计数 `ui 868/main 542/shared 62/preferences 3=1475` → `main 545=1478` | 3 个 `main.requestStatus.*` key（中英成对） |
| 删除/放宽断言/新增 skip | **无** | — | — |

**测试规模**：S1 358 文件 / 3077 tests（3050 pass / 9 fail EPERM / 18 skip）；P0 363 / 3094；P1 候选 **368 文件 / 3117 tests**（3090 pass / 9 fail / 18 skip；+5 文件、+23 tests 全部为新测试）。

---

## 四、验证证据（本候选）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 定向新测试 | **23/23 pass**（7+7+3+4+2） | 各测试文件运行日志与全量日志 |
| 桌面窗口全套 | **391/391 pass** | 全量日志（含 P0 turn-lease/queue-visibility/abort-unwedge/message-queue/handback 等） |
| 桌面UI 全套 | **326/326 pass** | 全量日志（含 queue-status 与 request-status） |
| 运行时核心 + Claude适配器 | 340 tests / 332 pass / 4 fail（4 = S1 既有 EPERM）/ 4 skip | 全量日志 |
| 双 typecheck | `typecheck.log` exit 0 / 0 error；`typecheck-renderer.log` exit 0 / 0 error | `typecheck-summary.txt` |
| build:renderer | exit 0（built in 458ms） | `build-renderer.log` |
| 真实 Electron E2E | **E2E_PASS=true**；`E2E_FAILURES` 空；**18 PNG** | `electron-e2e/report.txt`、`electron-e2e-summary.txt`、`electron-e2e-screenshots.sha256` |
| phase5a smoke | **40/40 checks，failures=0** | `phase5a-smoke/report.json`、`phase5a-summary.txt` |
| 全量回归 | **3117 / 3090 pass / 9 fail / 18 skip / 0 todo**；exit 1；252,744.68 ms | `full-regression-serial.log`、`full-regression-summary.txt` |
| 失败分类 | **9 项全部为 S1 既有 Windows symlink `EPERM`**（claude 1、codex 1、pi 2、runtime-core 3、`test/测试/g4-skill-verify` 1、编排 1；与 S1/P0 同集合）；**新增确定性失败 = 0、新 skip = 0、删测 = 0** | `full-regression-summary.txt` |
| 目标项目零写入 | 测试源码/日志零引用目标项目；全部夹具为 `os.tmpdir()`；E2E 的 `ANS_E2E_PROJECT` = 本 worktree | `target-zero-write.txt` |
| 默认自动中止 | `DEFAULT_TURN_ABORT_MS=0` 未改（P0 测试仍断言） | 全量日志 |

### 4.1 与 S1/P0 对照

| 指标 | S1 | P0 | P1 |
| --- | --- | --- | --- |
| 文件数 | 358 | 363 | **368** |
| tests | 3077 | 3094 | **3117** |
| pass | 3050 | 3067 | **3090** |
| fail | 9（EPERM） | 9（同集合） | **9（同集合）** |
| skip | 18 | 18 | **18** |
| T1 | 通过 | 通过 | **通过（100ms 兜底/180ms 交互暂停/3 settled 语义不变）** |

**证据入库口径**：仓库 `.gitignore` 排除 `*.log` 与 `角色卡/**/docs/**/*.png`——原始日志与 18 张截图保留在 worktree 证据目录，以 SHA-256 固化（`sha256.txt`、`electron-e2e-screenshots.sha256`）；入库的是 summary/report/diagnostics 清单。

---

## 五、风险、偏差与已知限制

1. **诊断字段映射（无新白名单）**：任务要求不改 `diagnostics.ts`；`max_retries/retry_delay_ms/no_response/firstByte/idle` 经既有字段承载（见 §二表：`count/durationMs/state+timeoutMs/timeoutMs`）。若验收要求字面字段名，需另开白名单变更（不在本批授权）。
2. **`ui.request.*` 命名冲突（偏差）**：团队计划 §3.7 写作 `ui.request.*`，但该命名空间已被「申请（application）」占用（`ui.request.title` 等）。P1 人话系统行改用 `main.requestStatus.*`（主进程生成点）；未新增 `ui.*` 前缀 key，避免语义冲突。渲染层未改源码——既有 `events.ts`/`delivery-note` 已能渲染人话文本，UI 测试以生产函数验证并加接线钉子。
3. **`run-role.ts`/`interface.ts`/`schema.ts`/`timeout.ts` 未改**：`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传新选项；系统行复用既有 `emitDeliveryNote`。均在 P1 写集内但非必需（按需最小）。
4. **环境变量未新增**：Q1 的「可 env/测试注入」在本批落实为宿主/测试选项注入（`requestFirstByteTimeoutMs/requestIdleTimeoutMs`）；未新增 env key（避免扩配置面）。默认值 90s/300s 固定。
5. **P2 接线点（中性接口）**：`RequestDeadline.pause()/resume()` 为引用计数公开接口；P2 的网络暂停只需在适配器 deadline 生命周期内按网络状态调用同一对方法（或在 `RuntimeProviderOptions` 增 `networkGate` 后订阅），不改本批语义。
6. **工具暂停边界**：ANS 工具在 handler 执行期间暂停；`PreToolUse`→handler 的调度间隙不暂停（受 300s idle 与工具自身时限约束）。原生工具（外来 MCP/WebSearch）在 PreToolUse 放行处暂停、结果帧恢复；未观测到结果的原生调用在 abort/终态时随 deadline 停止，不会误杀（也不会恢复未发生的暂停）。
7. **`api_retry` 角色日志可见性**：每条约一行系统消息（kind=message，detail.source=system）；SDK 多次重试会产生多行，但只含次数/延迟，不含错误正文/URL/凭据。
8. **一般请求失败（`MODEL_REQUEST_FAILED`）**：适配器将所有非 abort/非最后兜底的请求级失败标该 code；桌面发「本轮请求失败，已结束；请检查后重发。」人话系统行。不区分配置错误/服务端错误（P1 不扩分类）。
9. **1h 最后兜底与看护 5min 未改**；请求超时默认早于二者触发；若宿主注入更大请求时限，最后兜底仍生效。
10. **P1 正式验收标准未写盘**：现有 `docs/acceptance/turn-retry-network-watch-criteria-v1.md` 范围为 P0；本包按任务书 P1 测试要求自证，正式 pass/rework 由独立验收判定。

---

## 六、回滚

- 未提交：恢复批前文件并重跑本包验证。
- 已提交：`git revert 105c187` 并重跑；请求时限/终态无数据/schema 迁移；回滚恢复「无请求超时、无 `api_retry` 诊断」行为，1h/5min/默认 0/T1 不受影响。
- 不影响 §5A/P0/Pi/Codex/release；诊断/attempt 仅日志，无项目写入。

---

## 七、状态

- 候选：已实现、已本地验证；**未 push、未合并 main、未发布**。
- 独立验收：**请判定 pass / rework / insufficient evidence**（T3：全量 + Electron + phase5a + 目标项目零写入 + 1h/5min/默认 0/T1 不变）。
- 发布：不在本波；另走 release-policy overlay。
