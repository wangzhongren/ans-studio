# 变更包：turn-retry-network-watch P2（网络状态监听 + 离线安全暂停/恢复窗口）

- **任务 ID**：`2026-10-30-turn-retry-network-watch`｜**批次**：P2｜**风险档位**：**T2**（团队计划 §1.3：不改权限/自动中止；每批仍全量 + Electron + phase5a）
- **记录角色**：统筹（Scheduler）变更包记录；执行者：本波实施上下文（按团队计划 §3.3–3.7 P2 写集）
- **日期**：2026-10-30
- **状态**：候选已实现并通过本包列示验证；**未 push、未合并 main、未发布**；交独立验收判定
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（客户确认「A 全套（推荐）」；追加授权「p2 和 p3 我也授权」）
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`；§5 网络、§6 可观测性、§10 Q4/Q5）
  - 团队计划 v1：`docs/scheduling/2026-10-30_turn-retry-network-watch-team-plan.md`（517 行；§3.3–3.7 P2、§四 4.4、§五）
  - 验收标准：`docs/acceptance/turn-retry-network-watch-criteria-v1.md`（237 行；**范围为 P0+P1，无 P2 章节**）——按任务书「如 P2 章节缺失，按方案 §5 与 Q4/Q5 自证」执行；正式判定由独立验收另行写盘
  - P0/P1 已验收：change-package `...-change-P0.md`/`...-change-P1.md`；P1 候选 `105c187`、P1 治理记录 `3c334b8`（本批基线）

---

## 一、候选身份

| 项 | 值 |
| --- | --- |
| worktree | `.claude/worktrees/network-monitor` |
| 分支 | `feat/network-monitor`（自 `3c334b8`，已含 P0/P1/§5A） |
| 基线 | `3c334b806081ad295c39934e598f5a4238996d30` |
| 候选提交（产品+测试） | `fa72f4006a9825bd68dc906fab61a41c0df55595`（tree `746db9b373a67cd8ffa438fe85b3246bc8ad14d5`；23 文件 +1820/−29） |
| 治理记录提交 | 本文件所在提交（change-package + P2 证据） |
| 逐文件哈希 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P2-evidence/candidate-file-hashes.txt`（`git hash-object` + SHA-256 + 字节数，23 文件） |
| 证据 manifest | `...P2-evidence/sha256.txt`（47 文件；SHA-256 `2b76e3dcf623751387bc9c5f50a1c83129f97a48583fe64ae3e2057d07add4e2`） |

**改动文件（23，均在授权写集内）**：

- 运行时核心：`src/common/runtime-core/network-gate.ts`（新增：`NetworkGate` 实现/离线窗口守卫/网络失败错误形状），`src/model/runtime.ts`（`NetworkState`/`NetworkGate`/`NETWORK_OFFLINE_TIMEOUT` + 提供方选项），`src/service/runtime/session.ts`（网关/窗口透传 + settled.detail/人话短报）
- Claude适配器：`src/provider/claude/session.ts`（离线 pause / 恢复 resume / 窗口耗尽 `network-offline-timeout`；不重放）
- 桌面窗口：`app/main.ts`（`net.isOnline` 初始+5s 采样、powerMonitor 提示、IPC 推送）、`app/preload.cjs`（受限网络桥）、`app/desktop/network-monitor.ts`（新增：纯逻辑监听/防抖/power 提示）、`app/desktop/interface.ts`（网络状态 → SessionManager）、`app/desktop/session.ts`（离线队列保留/`blockedReason:"network"`/恢复 drain；网络失败系统行）
- 桌面UI：`app/renderer/src/chat/status.ts`（`networkStatusView` 纯函数）、`app/renderer/src/chat/role-status-view.ts`（`NetworkStatusLine`）、`app/renderer/src/chat/chat-store.ts`（网络快照/恢复行 8s 收起）、`app/renderer/src/chat/ipc.ts`（订阅 + 渲染 online/offline 提示上报）、`app/renderer/src/lib/platform.ts`（桥类型）、`app/renderer/src/shell/ChatHeader.tsx`（状态行）
- 项目管理（i18n）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（`ui.network.*` 4 key + `main.networkStatus.offlineTimeout`）、`test/项目管理/shared/i18n.test.ts`（计数 `868/545/1478` → `872/546/1483`）
- 新增测试：`test/runtime-core/network-gate.test.ts`、`test/桌面应用/network-monitor.test.ts`（Delta-TR-2 名单）、`test/桌面UI/network-status.test.ts`、`test/测试/network-state-e2e.test.ts`
- 既有测试更新：`test/桌面应用/e2e/main.mjs`（+15 行：注册 `network:get-state`/`network:renderer-state` 镜像 main.ts；新增 `NETWORK_STATUS_OFFLINE_VISIBLE`/`NETWORK_STATUS_RECOVERED_VISIBLE` 硬检查；截图数不变 18）

**未触改（按需最小，无需改动）**：`src/pipeline/orchestration/run-role.ts`（`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传 `networkGate`/`networkRetryWindowMs`）；`src/common/shared/diagnostics.ts`（未改白名单）；`src/provider/runtime/`（无新文件，Delta-TR-3）；Pi/Codex 源码（Q10）；`package.json`/lock/release-policy/electron-builder；角色卡/边界；§5A 专属段（`governance-judge-intent.ts`/`governance-roles.ts`/`contractCheckText`/`ui.intent.*`）。

---

## 二、不变量 → 实现 → 测试映射（P4.1–P4.4 / Q4·Q5 / 任务书 P2）

| # | 要求 | 实现 | 测试（真实路径） |
| --- | --- | --- | --- |
| 1 | **网络权威来源＝主进程**：`net.isOnline` 初始 + 5s 采样（含启动首采样）；渲染 `online/offline` 只作提示；powerMonitor 只提示/重探 | `app/main.ts` 建 monitor（`probe: net.isOnline`）；`app/desktop/network-monitor.ts` 状态机 + 采样；渲染经 `network:renderer-state` 上报，主进程重探纠正 | `test/桌面应用/network-monitor.test.ts`（首采样/采样间隔/渲染提示只重探/渲染误报纠正/探针异常不误判）；`test/桌面UI/network-status.test.ts`（IPC 接线钉子） |
| 2 | **防抖**：连续 2 次离线采样或 1s 稳定窗口才判离线；1 次瞬时抖动不判；恢复立即 | monitor：首见离线起稳定窗口（窗口到点重探）、连续采样计数；online 采样立即恢复；默认 5s/2 次/1s，可注入 | `test/桌面应用/network-monitor.test.ts`（稳定窗口/连续 2 次/抖动恢复/恢复立即） |
| 3 | **锁屏 ≠ 离线**；suspend/resume 触发重探 | `notePower` 只记 `network.power` 诊断并重探；锁屏/解锁从不直接置离线 | `test/桌面应用/network-monitor.test.ts`（lock/unlock 保持在线；suspend/resume 各重探一次；单次离线重探不因解锁判离线） |
| 4 | **离线安全暂停优先**：进行中的模型请求对 P1 `RequestDeadline` pause（计时停走，不触发超时），恢复后 resume | Claude 适配器 `startNetworkWatch`：订阅 gate；offline ⇒ `deadline.pause()`（引用计数，与交互/工具暂停可嵌套）；online ⇒ `resume()`；attempt 结束/abort 退订并清窗口 | `test/测试/network-state-e2e.test.ts`（离线跨 40ms 首字节时限不失败；恢复后 completed；恰一条 settled、无 handback、users=1）；`test/claude-adapter` 全量回归 |
| 5 | **恢复窗口 5min（可注入）**：离线超过窗口 ⇒ 明确 errorCode 失败并如实终态 | `network-gate.ts` 窗口守卫 + `createNetworkOfflineFailure`（name `NetworkOfflineError`，code `network-offline-timeout`）；适配器窗口到点 reject；Service 归 failed、settled.detail 带 errorCode/attempts/replaySafe、summary 人话 | `test/runtime-core/network-gate.test.ts`（默认 300000/窗口语义/错误形状）；`test/测试/network-state-e2e.test.ts`（注入 60ms ⇒ send 失败、恰一条 settled(failed)、人话短报、无 handback、无额外 settled） |
| 6 | **队列**：离线期间保留并在数据面标 `blockedReason:"network"`；恢复后按既有投递机制继续 | `SessionManager.applyNetworkState` + `drainQueueUnsafe` 离线不认领；`notifyRoleState` 网络优先阻塞原因；恢复对全部有队列项目走既有 `drainAllQueuesFor` | `test/测试/network-state-e2e.test.ts`（真实 SessionManager：离线队列保留/不投递/`blockedReason:network`；恢复后恰投递一次、不重复）；`test/桌面应用` 全套（P0 队列可见性回归） |
| 7 | **UI**：状态行「离线/已恢复/等待网络」人话（i18n；客户卡无技术 code；`aria-live="polite"`） | `networkStatusView` + `NetworkStatusLine` 会话头状态行；`ui.network.*` 中英；恢复行 8s 收起；离线 title 说明请求计时暂停、队列等待网络 | `test/桌面UI/network-status.test.ts`（纯函数/组件/i18n/无 ECONNRESET/URL/凭据）；`test/桌面应用/e2e/main.mjs`（真实 renderer+preload+IPC：离线/恢复可见，无技术 code） |
| 8 | **不自动重放已完成/失败回合**（重试属 P3） | 适配器窗口耗尽只 reject 当前 attempt；P2 无 ANS 重试；恢复只 resume 仍在进行中的请求，不重发旧回合；桌面只放行队列，不重放已完成/失败回合 | e2e：窗口 e2e 断言 users=1、无 handback；恢复 e2e 断言 users=1、恰一条 settled；队列 e2e 断言恢复后恰投递一次 |
| 9 | **诊断 `network.*`**：离线/恢复/暂停/恢复窗口耗尽/锁屏提示；仅用既有白名单字段 | monitor：`network.state`/`network.power`/`network.hint`；适配器：`network.request.pause`/`resume`/`timeout`；`diagnostics.ts` 未改 | `test/桌面应用/network-monitor.test.ts`（字段全部 ⊆ 白名单）、e2e（pause/resume/timeout 诊断存在且 errorCode 正确） |
| 10 | **不变**：默认自动中止 0、1h/5min/T1 语义、五步链/权限/边界、Pi/Codex 源码、`src/provider/runtime/` 无新文件、§5A 只读 | 常量/默认值未动；新选项仅 Claude 消费；Pi/Codex 忽略未知可选字段；无权限/角色/边界改动 | 全量 3137（9 既有 EPERM/18 skip 不变）；T1 10/10；`watchdog-reuse` 默认 0 断言不变；Pi/Codex 全量回归 |

### 诊断字段落地（不改 `src/common/shared/diagnostics.ts`）

| 事件 | 实际落盘字段（← 语义） |
| --- | --- |
| `network.state` | `state`←online/offline、`mode`←来源（main-net/renderer/power）、`reasonCode`←initial/interface-down/renderer-offline/probe/resume、`durationMs`←稳定/防抖时长 |
| `network.hint` | `state`←渲染提示的 online/offline、`mode:"renderer"` |
| `network.power` | `state`←suspend/resume/lock/unlock、`mode:"power"` |
| `network.request.pause` | `turnId`、`attempt`、`state:"offline"`、`mode:"claude"` |
| `network.request.resume` | `turnId`、`attempt`、`state:"online"`、`mode:"claude"` |
| `network.request.timeout` | `turnId`、`attempt`、`errorCode:"network-offline-timeout"`、`timeoutMs`←窗口、`durationMs`←离线时长、`mode:"offline-window"` |

**字段缺口（按要求先报告）**：方案 §6.3 的 `network.state` 字段名 `online`/`source`/`stableForMs`/`reason` **不在** `diagnostics.ts` 既有白名单；本批按「不改白名单」的任务约束用既有字段承载（上表映射）。若验收要求字面字段名，需另开白名单变更（不在本批授权）。

---

## 三、测试差异表（新增/重写/删除）

| 文件 | 类型 | 差异 | 理由 |
| --- | --- | --- | --- |
| `test/runtime-core/network-gate.test.ts` | 新增 | 4 tests | 网关通知/离线窗口/失败形状（附录 B） |
| `test/桌面应用/network-monitor.test.ts` | 新增 | 7 tests | 首采样/防抖/连续采样/恢复/渲染提示/power/诊断白名单（Delta-TR-2） |
| `test/桌面UI/network-status.test.ts` | 新增 | 6 tests | 离线/恢复视图、组件 aria、i18n、接线钉子（附录 B） |
| `test/测试/network-state-e2e.test.ts` | 新增 | 3 tests | 真实 openRoleSession+适配器（假 SDK）+ 真实 SessionManager：暂停恢复/窗口失败/队列（附录 B） |
| `test/桌面应用/e2e/main.mjs` | 修改 | +15 行；+2 硬检查 | 镜像 main.ts 注册网络 IPC；真实 renderer/preload 网络状态行可见性 |
| `test/项目管理/shared/i18n.test.ts` | 修改 | 计数 `ui 868/main 545=1478` → `ui 872/main 546=1483` | 4 个 `ui.network.*` + 1 个 `main.networkStatus.*`（中英成对） |
| 删除/放宽断言/新增 skip | **无** | — | — |

**测试规模**：P1 368 文件 / 3117 tests（3090 pass / 9 fail EPERM / 18 skip）→ P2 **372 文件 / 3137 tests**（3110 pass / 9 fail / 18 skip；+4 文件、+20 tests 全部为新测试）。

---

## 四、验证证据（本候选）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 定向新测试（含 i18n 计数） | **23/23 pass**（network-gate 4 + network-monitor 7 + network-status 6 + i18n.test 6） | `targeted-*.log`、全量日志 |
| 定向 e2e | **3/3 pass**（暂停恢复/窗口失败/队列） | `targeted-network-e2e.log`、全量日志 |
| 桌面窗口全套 | **398/398 pass** | `targeted-desktop-app.log` |
| 桌面UI 全套 | **332/332 pass** | `targeted-desktop-ui.log` |
| 运行时核心 + Claude适配器 | 344 tests / 336 pass / 4 fail（4 = S1 既有 EPERM）/ 4 skip | `targeted-runtime-core-claude.log` |
| T1 + P1 e2e | **10/10 pass** | `targeted-t1-request-timeout.log` |
| 双 typecheck | `typecheck.log` exit 0 / 0 error；`typecheck-renderer.log` exit 0 / 0 error | `typecheck-summary.txt` |
| build:renderer | exit 0（built in 391ms） | `build-renderer.log` |
| 真实 Electron E2E | **E2E_PASS=true**；`E2E_FAILURES` 空；**18 PNG**；`NETWORK_STATUS_OFFLINE_VISIBLE=true`、`NETWORK_STATUS_RECOVERED_VISIBLE=true` | `electron-e2e/report.txt`、`electron-e2e-summary.txt`、`electron-e2e-screenshots.sha256` |
| phase5a smoke | **40/40 checks，failures=0**；no console errors / no CSP violations | `phase5a-smoke/report.json`、`phase5a-summary.txt` |
| 全量回归 | **3137 / 3110 pass / 9 fail / 18 skip / 0 todo**；exit 1；249,533.45 ms | `full-regression-serial.log`、`full-regression-summary.txt` |
| 失败分类 | **9 项全部为 S1/P0/P1 既有 Windows symlink `EPERM`**（同集合：claude 1、codex 1、pi 2、runtime-core 3、测试/g4 1、编排 1）；**新增确定性失败 = 0、新 skip = 0、删测 = 0** | `full-regression-summary.txt` |
| 目标项目零写入 | 测试源码/日志零引用目标项目；夹具均为 `os.tmpdir()`；E2E 默认 worktree 为项目、OUTDIR 在证据目录 | `target-zero-write.txt` |
| 默认自动中止 | `DEFAULT_TURN_ABORT_MS=0` 未改（P0/看护测试仍断言） | 全量日志 |

### 4.1 与 S1/P0/P1 对照

| 指标 | S1 | P0 | P1 | P2 |
| --- | --- | --- | --- | --- |
| 文件数 | 358 | 363 | 368 | **372** |
| tests | 3077 | 3094 | 3117 | **3137** |
| pass | 3050 | 3067 | 3090 | **3110** |
| fail | 9（EPERM） | 9（同集合） | 9（同集合） | **9（同集合）** |
| skip | 18 | 18 | 18 | **18** |
| T1 | 通过 | 通过 | 通过 | **通过** |

**证据入库口径**：仓库 `.gitignore` 排除 `*.log` 与 `角色卡/**/docs/**/*.png`——原始日志与截图保留在 worktree 证据目录，以 SHA-256 固化（`sha256.txt`、`electron-e2e-screenshots.sha256`）；入库的是 summary/report/diagnostics 清单与 18+7 张截图的哈希。

---

## 五、风险、偏差与已知限制

1. **验收标准缺 P2 章节（按任务书自证）**：`docs/acceptance/turn-retry-network-watch-criteria-v1.md` 范围为 P0+P1；本包按任务书「P2 章节缺失 ⇒ 按方案 §5 与 Q4/Q5 自证并标明的」执行，正式 pass/rework 由独立验收判定。
2. **诊断字段映射（无新白名单）**：方案 §6.3 的 `online/source/stableForMs/reason` 不在既有白名单；用 `state/mode/durationMs/reasonCode` 承载（见 §二表）。`diagnostics.ts` 未改；若验收要求字面字段名需另开白名单变更。
3. **Pi/Codex 的进行中请求不暂停（Q10 范围）**：网络 pause/resume 只在 Claude 适配器接线（P1 `RequestDeadline` 仅 Claude 消费）；**桌面队列阻塞对所有 runtime 生效**。Pi/Codex 源码零改动、全量回归通过；同接口接入另行评估（Q10/Delta-TR-1）。
4. **窗口耗尽的时序（如实失败，不重放）**：离线超过 `networkRetryWindowMs` 直接 reject 当前 attempt（终态 failed + `network-offline-timeout`），即使 SDK 当时因工具/交互等待而暂停计时；不伪造工具结果、不自动重放。P3 可按 replay-safe 门槛细化取消/重试顺序。
5. **跨角色私有 common 引用（与 P1 同先例）**：`app/desktop/network-monitor.ts`/`session.ts` 引用 `src/common/runtime-core/network-gate.ts`（P1 已由 `app/desktop/session.ts` 引用 `request-timeout.ts` 开先例）；若独立验收对本波引用面有异议，可将 `createNetworkGate` 上移到 Model/公开入口，不改行为。
6. **`run-role.ts` 未改**：`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传新选项（与 P1 同口径）；主进程 `runtimeOptions: { networkGate }` 经 Interface → SessionManager → 工厂 → Service → Provider。
7. **`network.state` 只在 online 变化时外推**：初始在线由渲染首屏 `network:get-state` 拉取（不发事件）；初始离线会发一次事件并立即生效（无「已知在线」可抖）。
8. **渲染 `online/offline` 只是提示**：只触发主进程重探 `net.isOnline()`；不使用 `navigator.onLine` 作权威，不因渲染丢事件改变主进程判定。
9. **P3 接线点（离线判定 ↔ replay-safe 重试）**：`NetworkGate` + `networkOfflineFailureFacts`（offlineMs/attempts/replaySafe）+ 5min 窗口是 P3 的输入；P3 重试必须仅在 `replayUnsafe=false` 且窗口内恢复时进行，窗口耗尽/有副作用一律不重放；P2 已有测试钉住「users=1、无 handback、恢复后仅继续原请求/队列恰一次」。
10. **E2E harness 更新**：`test/桌面应用/e2e/main.mjs` 补注册 `network:get-state`/`network:renderer-state`（镜像 `app/main.ts`）并新增两条网络状态硬检查；不改生产接口、不改截图数量（18）。
11. **窗口期间交互卡/T1 语义**：P2 未改 `InteractionGate`/1h 最后兜底/T1；请求 deadline 的 pause 引用计数与既有交互/工具暂停并存，T1 10/10 通过。

---

## 六、回滚

- 未提交：恢复批前文件并重跑本包验证。
- 已提交：`git revert fa72f40` 并重跑；网络状态为运行时/UI 提示，无数据/schema 迁移；回滚恢复「无网络监听、无离线暂停/队列 network 阻塞」行为；默认 0/1h/5min/T1 不受影响；不触碰 Pi/Codex/§5A/release。
- 不影响 P0/P1/§5A；诊断/网络状态仅日志与内存，无项目写入。

---

## 七、状态

- 候选：已实现、已本地验证；**未 push、未合并 main、未发布**。
- 独立验收：**请判定 pass / rework / insufficient evidence**（T2：全量 + Electron + phase5a + 目标项目零写入 + 默认 0/1h/5min/T1 不变）。
- 发布：不在本波；另走 release-policy overlay。
