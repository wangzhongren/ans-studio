# 变更包：turn-retry-network-watch P0（收尾不变量/队列可见性/看护旁路/手动停止）

- **任务 ID**：`2026-10-30-turn-retry-network-watch`｜**批次**：P0｜**风险档位**：**T3**
- **记录角色**：统筹（Scheduler）变更包记录；执行者：本波实施上下文（编排/运行时核心/桌面窗口/桌面UI，按团队计划写集）
- **日期**：2026-10-30
- **状态**：候选已实现并通过本包列示验证；**未 push、未合并 main、未发布**；交独立验收判定
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（客户「确认 A 全套（推荐）」；默认自动中止 0、T1/1h 不变）
  - 闸门 2 + P0 实施授权：同文件「闸门 2 确认与实施授权记录（2026-10-30，P0）」；团队计划 v1（517 行；SHA-256 `69de90a1d400d64075eaaed207e4e41e1eb9a418c5e1f73b31af72fa02e76809`）
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`）
  - 现场证据：`docs/communication/2026-10-30_intent_flow-improvements-after-wuxia-run.md`「运行观察」三节（17:28 失败 handback→origin 覆盖→turn.end 后无 delivery.end→busy 永不复位→target-busy 冻结队列；19:04–19:08 停止 10+ 次 ~1ms ok 零变化）

---

## 一、候选身份

| 项 | 值 |
| --- | --- |
| worktree | `.claude/worktrees/turn-retry-network-watch` |
| 分支 | `feat/turn-retry-network-watch` |
| 基线 | main `c001ce206a588d4f71dd9b46a8eaca1a7c6d5588`（tree `a24ffaa2d35ad3ad196403ef8bd86974cde32b2b`；含 §5A 合并 + Delta-TR-2 边界） |
| S1 基线提交 | `b9635bd3e41405e088750d37b201a835ddb77edb`（`test(baseline): freeze turn-retry-network-watch S1 baseline`） |
| 候选提交（产品） | `2dcb7e2a0b84ebf5e5dd5961b044b8ea43ad1d05`（23 文件 +1747/−68；源码+测试） |
| 治理记录提交 | 本文件所在提交（change-package + P0 证据；含基线证据 manifest 自身哈希修正） |
| 逐文件哈希 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P0-evidence/candidate-file-hashes.txt`（`git hash-object` + SHA-256 + 字节数） |

**改动文件（23，均在授权写集内；无 §5A/Pi/Codex/release 文件）**：

- 桌面窗口：`app/desktop/session.ts`、`app/desktop/watchdog.ts`、`app/main.ts`（role-state 去抖类型透传）
- 桌面UI：`app/renderer/src/chat/{chat-store,confirm-logic,ipc,types,work-view}.ts`、
  `app/renderer/src/shell/{QueuePanel,QueueSubview,WorkOverview}.tsx`
- 项目管理（i18n）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（6 个 `ui.queue.*` key）、
  `test/项目管理/shared/i18n.test.ts`（计数 862→868 / 1469→1475）
- 新增测试（Delta-TR-2 名单内）：`test/桌面应用/{turn-lease,queue-visibility,abort-unwedge}.test.ts`
- 新增测试（附录 B）：`test/桌面UI/queue-status.test.ts`、`test/测试/queue-recovery-e2e.test.ts`
- 受影响既有测试：`test/桌面应用/{handback-delivery,message-queue,queue-withdraw-lru,watchdog-reuse}.test.ts`

**未触改**：`src/common/shared/intent-entry-contract.ts`、四卡契约句、`contract_check` 契约段/显式 intentId、`src/provider/**`（含 Pi/Codex/Claude）、`package.json`/lock/release-policy/electron-builder、角色卡/边界（Delta-TR-2 已由 c001ce2 预置）。

---

## 二、不变量 → 实现 → 测试映射

| # | 不变量（团队计划 P0 + 现场追加） | 实现 | 测试（真实路径） |
| --- | --- | --- | --- |
| 1 | **turn lease / origin 不被失败投递覆盖或删除** | `beginDeliveryOrigin` 改为 lease 获取（busy 或已有 running ⇒ `undefined`）；`send`/`drainQueueUnsafe` 在 `await rebuildIfBoundaryStale` 前后**双重忙判据**；认领失败放回队首 | `test/桌面应用/turn-lease.test.ts`（失败回交 + 在跑回合；断言 `activeTurnId` 不被覆盖、失败回交保持重试、队列继续） |
| 2 | **settled 按 turnId 兜底清 busy（即使 origin 精确匹配不成立）** | settled 分支以 `turnId` 对照：仅「两个已知 turnId 明确不同」不清（迟到旧回合保护）；其余（origin 缺失/已删/事件缺 turnId）一律清 busy 并记 `turn.origin-missing` | `turn-lease.test.ts`（无 turnId 终局 ⇒ busy 复位；迟到旧 turnId 不误清新回合） |
| 3 | **`delivery.end|failed` 完整性（turn 先 settled、send 后解析）** | `DeliveryItem.terminalRecorded` 恰一次记账；settle 收尾补 `delivery.end`（`phase:"turn-settled"`）、撤销 `activeDeliveries`、保留已投递标记；续段不再重复/不回队 | `turn-lease.test.ts`（delivery.end 恰一次；无重复 failed） |
| 4 | **空闲但 busy 残留自愈** | 上述 settled 兜底 + `healStaleOrigin`（busy 已复位但 origin 残留时清理并记 `turn.origin-missing`） | `turn-lease.test.ts` + `test/桌面应用/queue-visibility.test.ts`（`origin-missing` 原因字段路径） |
| 5 | **手动停止必须解开 target-busy 楔死（现场 10+ 次 abort 无效）** | `abort()` 在 `handle.abort()` 成功后调用 `forceResetDeliveryState`：复位 `origins.running`/`busy`/`activeDeliveries`，被放弃在途投递落恰一次 `delivery.end`（`mode:"aborted"`，at-most-once），结算 settle 等待者并 drain；无忙态 no-op；**不伪造 turn 终局** | `test/桌面应用/abort-unwedge.test.ts`（在跑回合停止后队列继续；在途投递不重投不复活 busy；闲置幂等） |
| 6 | **队列可见性（ageMs/headKind/blockedReason/activeTurnId）** | `session:role-state` 快照新增字段（单一来源＝会话内存态），经 main 去抖原样透传，chat-store 入表，QueuePanel/工作概览呈现「为什么没动」；ACK 时补一次快照 | `test/桌面应用/queue-visibility.test.ts`（注入时钟核对 ageMs；target-busy/session-closed；activeTurnId）+ `test/桌面UI/queue-status.test.ts`（纯视图 + 端到端接线钉子） |
| 7 | **看护告警 UI-only 旁路** | `watchdogDeliver` 对**看护服务发出**的消息（`uiOnlyWhenBusy`）在目标忙时只发 UI 系统行（`delivery-note`，不触发模型/门禁）并记 `watchdog.notice.bypass(mode:"ui-only")`，不入 busy 模型队列；直接调用的系统行（MCP 安装/申请等）保持既有排队语义 | `test/桌面应用/message-queue.test.ts`（忙时旁路 + 诊断 + 不投模型；空闲仍走 system 队列）、`handback-delivery.test.ts`（旁路不挤占回交） |
| 8 | **重启后队列不排空** | settle 收尾与续段终态标记保证持久快照正确移除；恢复路径复用既有 `restorePersistedDeliveries` + drain | `test/测试/queue-recovery-e2e.test.ts`（两个真实 SessionManager，同一 store，崩溃前 queued 回交 → restore 自动续投恰一次 → 持久队列清空） |
| 9 | **默认自动中止保持 0；T1/1h/判官/权限/五步链不变** | 未改 `DEFAULT_TURN_ABORT_MS=0`、`turnLastResortMs`、judge/gate；无新增 cardKind/角色/依赖 | `watchdog-reuse.test.ts` 新增默认 0 断言；T1 在全量套件内保持不变 |

**可观测性落地**：诊断 `turn.settled`（origin-matched/missing）、`turn.origin-missing`、`turn.abort.forced`、`watchdog.notice.bypass`（mode/signal/targetRoleId/queueDepth）、`delivery.end`（`phase:"turn-settled"` / `mode:"aborted"`）；字段均在 diagnostics 既有白名单内（未改 `src/common/shared/diagnostics.ts`，只读复用）。角色日志沿用既有观察器：settle → `turn.end` 一行；旁路 UI 系统行 → `message` 一行摘要；均不含 prompt/凭据/URL。

---

## 三、测试差异表（新增/重写/删除）

| 文件 | 类型 | 差异 | 理由（对应方案/计划） |
| --- | --- | --- | --- |
| `test/桌面应用/turn-lease.test.ts` | 新增 | 4 tests | P0 收尾不变量（P6.1；Delta-TR-2）：失败投递不覆盖 origin / settled 兜底 / delivery.end 恰一次 / **并发 direct send+drain** |
| `test/桌面应用/queue-visibility.test.ts` | 新增 | 2 tests | 队列可见性（P6.2；Delta-TR-2）：ageMs/headKind/blockedReason/activeTurnId（含队列深度 9 现场形状） |
| `test/桌面应用/abort-unwedge.test.ts` | 新增 | 3 tests | 停止解楔（现场追加；Delta-TR-2） |
| `test/桌面UI/queue-status.test.ts` | 新增 | 5 tests | 队列可见 UI/接线（附录 B） |
| `test/测试/queue-recovery-e2e.test.ts` | 新增 | 1 test | 重启续跑端到端（附录 B） |
| `test/桌面应用/message-queue.test.ts` | 修改 | +1 test（P0 旁路诊断）；G-2/W2 用例改写为忙时旁路 + 空闲 system 入队/送达（不可撤回断言保留）；harness 增加 `envelopes` 留证 | P0 看护旁路（Q6）；不改宽原语义，按新口径重写 |
| `test/桌面应用/handback-delivery.test.ts` | 修改 | 1 用例改写（原「system 先入队→回交优先」→「忙时 system 不进队列→回交直投」） | P0 旁路；原意图（看护项不堵治理流）保留并强化 |
| `test/桌面应用/queue-withdraw-lru.test.ts` | 修改 | 仅注释（直接调用保持排队语义） | 说明 `uiOnlyWhenBusy` 边界 |
| `test/桌面应用/watchdog-reuse.test.ts` | 修改 | +1 test（默认自动中止 0） | P0 验证「默认 0 不变」 |
| `test/项目管理/shared/i18n.test.ts` | 修改 | 计数 `ui 862→868`、总 `1469→1475`（6 个新 key，中英成对） | 队列可见文案 |
| 删除/放宽断言/新增 skip | **无** | — | — |

**测试规模**：S1 基线 358 个 `*.test.ts` / 3077 tests（pass 3050 / fail 9 EPERM / skip 18）；P0 候选 **363 文件 / 3094 tests**（+5 文件、+17 tests：新测试 15 + message-queue 旁路诊断 1 + 默认中止 0 1；详见最终验证节）。

---

## 四、验证证据（本候选）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 定向新测试 | 15/15 pass（4+2+3+5+1） | 各测试文件运行日志（见 `P0-evidence/`） |
| 桌面窗口全套 | 386/386 pass | `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` |
| 桌面UI 全套 | 322/322 pass | `node --test --test-concurrency=1 "test/桌面UI/**/*.test.ts"` |
| 双 typecheck | exit 0 / 0 error | `typecheck.log`、`typecheck-renderer.log` |
| build:renderer | exit 0 | `build-renderer.log` |
| 真实 Electron E2E | **E2E_PASS=true**；18 PNG | `electron-e2e/report.txt`、`electron-e2e-screenshots.sha256` |
| phase5a smoke | **40/40**，failures=0 | `phase5a-smoke/report.json` |
| 全量回归 | **3094 / 3067 pass / 9 fail / 18 skip**；exit 1（9 = S1 既有 symlink EPERM；新增确定性失败 0） | `full-regression-serial.log`（SHA-256 `d4717559…`）、`full-regression-summary.txt` |
| 目标项目零写入 | 本包命令零引用零写入；`Downloads/test` 外部在线 run 写入如实记录；`jinyong-rogue-2d` 零变化 | `target-zero-write.txt`、前后元数据快照 |
| 默认自动中止 | `DEFAULT_TURN_ABORT_MS=0`（测试断言） | `watchdog-reuse.test.ts` |

### 4.1 P0 全量回归结果

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` |
| 文件数 | **363**（S1 358 + 5 新测试文件；排除已知挂起 `write-sequencing.test.ts`） |
| 结果 | **tests 3094 / pass 3067 / fail 9 / skipped 18 / todo 0**；exit 1；238,448.85 ms |
| 失败分类 | **9 项全部为 S1 既有 Windows symlink `EPERM`**（逐条同名：claude 1、codex 1、pi 2、runtime-core 3、编排 2）；**新增确定性失败 = 0、新 skip = 0、删测 = 0** |
| 与 S1 对照 | tests +17（pass +17）、fail 持平 9、skip 持平 18、文件 +5 |
| 原始日志 | `full-regression-serial.log`（SHA-256 `d471755986de831a3c9f3af3d2b139ddd236ffdc1f97995fbcf751366f526bc4`） |
| 运行期树稳定 | 运行前后全部改动/新增文件 SHA-256 一致（仅本变更包文档在运行期间编辑，非产品/测试文件） |

**E2E/phase5a 证据哈希**：`electron-e2e.log` `f56e26c1…`；`electron-e2e/report.txt` `a76be8be…`；18 PNG 逐文件哈希 `electron-e2e-screenshots.sha256`；`phase5a.log` `ac6b4031…`（40/40，failures=0）。
**typecheck/build 哈希**：`typecheck.log` `a5f2b796…`（exit 0，0 error）；`typecheck-renderer.log` `057d983c…`（exit 0）；`build-renderer.log` `da8e6295…`（exit 0）。

**证据入库口径**：仓库 `.gitignore` 排除 `*.log` 与 `角色卡/**/docs/**/*.png`——原始日志与 18 张截图保留在 worktree 证据目录，并以 SHA-256 固化（`sha256.txt`、`electron-e2e-screenshots.sha256`），不强制入库（与既有基线记录同口径）；入库的是 summary/report/diagnostics/清单。摘要见 `electron-e2e-summary.txt`、`phase5a-summary.txt`、`typecheck-summary.txt`。

---

## 五、风险与已知限制

1. **stop 强制复位的边界**：`abort` 成功返回后**无条件**复位投递层忙态（设计 §7.3.1「stop 只强制复位投递 origin，不伪造 turn」）。若底层回合仍在收尾，队列可能尝试并发投递一次；运行时服务层会拒绝（"上一轮仍在运行"），投递失败可见并保留重试——不会重复执行工具/文本，但 UI 可能看到一次失败行。
2. **settled 无/错 turnId 的兜底**：仅当事件与在跑 origin 的 turnId「两个已知且不同」时保留忙态（迟到旧回合保护）；缺 turnId 的终局会清 busy（防永久楔死）。若适配器在**新回合运行中**迟到一条无 turnId 的旧终局，可能提前清忙；运行时串行化保证不会并发执行，失败可见。
3. **看护旁路语义**：看护服务 outbound 一律带 `uiOnlyWhenBusy`；忙时告警/巡检/恢复只进 UI+诊断，不进模型上下文。巡检 `pending` 仍按服务既有语义记账（旁路也算投出；下一轮结算后在下一时机恢复模型投递），不改变看护判定/自动中止开关。
4. **queue.blocked 诊断沿用既有事件名** `delivery.blocked`（含 reasonCode/queueDepth），未另造 `queue.blocked` 第二事件，避免重复噪声。
5. **§5A 共享文件**：本批未触碰 §5A 专属段；共享文件仅 `app/desktop/session.ts` 的投递/看护段与 i18n 新增 key，未改 §5A 契约文本。
6. **工作树基线**：`c001ce2`（含 §5A 合并）。若 main 前进需按团队计划 §7.3 重核。

---

## 六、回滚

- 未提交：恢复批前文件并重跑本包验证。
- 已提交：`git revert` P0 提交并重跑；投递队列为 userData 运行数据，可保留/清理，不写项目文件；无数据/schema 迁移。
- 回滚恢复旧投递/队列语义（看护 system 重新进入忙队列；abort 不再强制复位）；不影响 §5A 独立批。

---

## 七、状态

- 候选：已实现、已本地验证；**未 push、未合并 main、未发布**。
- 独立验收：**请判定 pass / rework / insufficient evidence**（T3：全量 + Electron + 目标项目零写入 + 默认 0/T1 不变）。
- 发布：不在本波；另走 release-policy overlay。
