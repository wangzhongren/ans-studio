# 变更包：turn-retry-network-watch P2（网络状态监听 + 离线安全暂停/恢复窗口；F1 返工后 v2）

- **任务 ID**：`2026-10-30-turn-retry-network-watch`｜**批次**：P2｜**风险档位**：**T2**（团队计划 §1.3：不改权限/自动中止；每批仍全量 + Electron + phase5a）
- **记录角色**：统筹（Scheduler）变更包记录；执行者：本波实施上下文（按团队计划 §3.3–3.7 P2 写集）
- **日期**：2026-10-30（v2：F1 返工后更新）
- **状态**：候选已实现并通过本包列示验证；**未 push、未合并 main、未发布**；交独立验收复验
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（客户确认「A 全套（推荐）」；追加授权「p2 和 p3 我也授权」）
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`；§5 网络、§6 可观测性、§10 Q4/Q5）
  - 团队计划 v1：`docs/scheduling/2026-10-30_turn-retry-network-watch-team-plan.md`（517 行；§3.3–3.7 P2、§四 4.4、§五）
  - 验收标准 v1.2：`docs/acceptance/turn-retry-network-watch-criteria-v1.md`（335 行；SHA-256 `5cf419ffc6c3285e4ff1562dff3a03e3866930e8fd90eb8a6ef23b774e6bff03`；P2 §11 补写于实施后，不追溯为实施前标准）
  - 独立验收 v1：`docs/acceptance/2026-10-30_wave2-P2-acceptance-report-v1.md`（101 行；SHA-256 `b5290edb274efa348c7bb91d482c75f2415b7f0ea7926a57977e1bfa7e1ae449`；**判定 rework：F1 阻断 + F2/F3 证据**）
  - P0/P1 已验收：change-package `...-change-P0.md`/`...-change-P1.md`；P1 治理记录 `3c334b8`；rebase 基线 main `aa6b87c`（含 view_image 预算移除）

---

## 一、候选身份

| 项 | 值 |
| --- | --- |
| worktree | `.claude/worktrees/network-monitor` |
| 分支 | `feat/network-monitor`（rebase 后基线 `aa6b87c`，已含 P0/P1/§5A） |
| 基线 | `aa6b87c`（rebase 后 main；含 `feat(runtime): remove the per-turn view_image budget`） |
| 基础 P2 候选（rework 输入） | `b02d1fd`（tree `d75b911c57f6c165cd29e39a0d2c2b71733b3484`） |
| **最终候选（产品+测试，F1 修复）** | **`d6b30ef1d390f3a1f82217b17db9f71366aabcf6`**（tree `da4d3cd3235c3a5eadcde76745459ed4f178cdec`；相对基线 23 文件 +2120/−29） |
| 治理记录提交 | 本文件所在提交（change-package + P2 证据 v2） |
| 逐文件哈希 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P2-evidence/candidate-file-hashes.txt`（23 文件；`git hash-object` + SHA-256 + 字节数） |
| 证据 manifest | `...P2-evidence/sha256.txt`（50 文件；SHA-256 **`f66749af0b750e783f44b0997ae5803dbe02da6de0676e8a183ace6485e8efc5`**；本 worktree `sha256sum -c` 通过；跨换行校验 `bash verify-sha256-normalized.sh` 通过；口径见 `manifest-notes.txt`） |
| 证据目录 | `角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-P2-evidence/` |

**改动文件（23，均在授权写集内）**：

- 运行时核心：`src/common/runtime-core/network-gate.ts`（新增：`NetworkGate` 实现/离线窗口守卫/网络失败错误形状），`src/model/runtime.ts`（`NetworkState`/`NetworkGate`/`NETWORK_OFFLINE_TIMEOUT` + 提供方选项），`src/service/runtime/session.ts`（网关/窗口透传 + settled.detail/人话短报）
- Claude适配器：`src/provider/claude/session.ts`（离线 pause / 恢复 resume / 窗口耗尽 `network-offline-timeout`；不重放）
- 桌面窗口：`app/main.ts`（`net.isOnline` 初始+5s 采样、powerMonitor 提示、IPC 推送）、`app/preload.cjs`（受限网络桥）、`app/desktop/network-monitor.ts`（新增：纯逻辑监听/防抖/power 提示；**F1 修复：探针异常保持已知状态**）、`app/desktop/interface.ts`（网络状态 → SessionManager）、`app/desktop/session.ts`（离线队列保留/`blockedReason:"network"`/恢复 drain；网络失败系统行）
- 桌面UI：`app/renderer/src/chat/status.ts`（`networkStatusView` 纯函数）、`app/renderer/src/chat/role-status-view.ts`（`NetworkStatusLine`）、`app/renderer/src/chat/chat-store.ts`（网络快照/恢复行 8s 收起）、`app/renderer/src/chat/ipc.ts`（订阅 + 渲染 online/offline 提示上报；**F1 返工加固旧 preload 无 `getNetworkState` 时的首屏拉取判断**）、`app/renderer/src/lib/platform.ts`（桥类型）、`app/renderer/src/shell/ChatHeader.tsx`（状态行）
- 项目管理（i18n）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（`ui.network.*` 4 key + `main.networkStatus.offlineTimeout`）、`test/项目管理/shared/i18n.test.ts`（计数 `868/545/1478` → `872/546/1483`）
- 新增测试：`test/runtime-core/network-gate.test.ts`、`test/桌面应用/network-monitor.test.ts`（Delta-TR-2 名单；**F1 补 4 例**）、`test/桌面UI/network-status.test.ts`、`test/测试/network-state-e2e.test.ts`（**F1 补 3 例：adapter 探针异常、队列探针异常、网络失败系统行**）
- 既有测试更新：`test/桌面应用/e2e/main.mjs`（+15 行：注册 `network:get-state`/`network:renderer-state` 镜像 main.ts；新增 `NETWORK_STATUS_OFFLINE_VISIBLE`/`NETWORK_STATUS_RECOVERED_VISIBLE` 硬检查；截图数 18）

**未触改（按需最小，无需改动）**：`src/pipeline/orchestration/run-role.ts`（`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传 `networkGate`/`networkRetryWindowMs`）；`src/common/shared/diagnostics.ts`（未改白名单）；`src/provider/runtime/`（无新文件，Delta-TR-3）；Pi/Codex 源码（Q10）；`package.json`/lock/release-policy/electron-builder；角色卡/边界；§5A 专属段。

---

## 二、F1 返工（验收 v1 阻断项）

**缺陷（验收报告 F1）**：`app/desktop/network-monitor.ts` 的 `safeProbe` 在 `probe()` 抛错时返回 `true`；已知离线时一次探针异常会被 `evaluate(true)` 迁成在线，触发 `onState`、队列 drain、适配器 request deadline resume。独立真实探针已复现（离线 false→true；启动即离线 + 抛错同样）。

**修复（最终候选 `d6b30ef`）**：

- `safeProbe` 改为三态：`true` 在线 / `false` 离线 / **`undefined` 未知（探针抛错）**。
- `start()`、5s 采样、1s 稳定窗口重探、`probeNow()`（渲染提示/power/测试）全部对 `undefined` **不做任何迁移**：保持已知状态，不调用 `transition`/`gate.apply`/`onState`，因此**不 drain 队列、不 resume 请求计时**。
- 启动首采样即抛错：保持保守在线占位（`source:"unknown"`），不产生迁移；后续成功采样可正常判定/纠正。
- 附带加固（验收报告低风险项）：`ipc.ts` 首屏网络快照改为显式判断桥方法返回值，旧 preload 缺方法时不构造 `.then` 链。

**新增测试（真实路径）**：

| 层级 | 测试 | 断言 |
| --- | --- | --- |
| monitor（假时钟） | `F1：已知离线 + 探针异常` | 保持离线；`gate.isOnline()=false`；`onState` 迁移数不变；采样/`probeNow` 均不迁移 |
| monitor（假时钟） | `F1：启动即离线 + 探针异常` | 保持离线；不产生新迁移 |
| monitor（假时钟） | `F1：启动首采样探针异常` | 在线占位（unknown）不迁移；后续采样可正常判离线 |
| monitor（**真实计时**） | `F1 真实计时（默认时钟）` | 已知离线 + 抛错跨多个真实采样周期仍离线、无 `onState` |
| e2e（真实 openRoleSession+适配器+真实 monitor） | `e2e F1：已知离线 + 探针异常` | 不 resume deadline（跨 150ms > 40ms first-byte 不超时）、无终态；真正恢复后 completed、users=1、无 handback |
| e2e（真实 SessionManager+真实 monitor） | `e2e F1 队列：已知离线 + 探针异常` | 不 drain、不投递；`blockedReason:"network"` 保持；真正恢复后恰投递一次 |
| e2e（真实 SessionManager） | `e2e 网络失败系统行` | `settled(failed, network-offline-timeout)` ⇒ 恰一条 `delivery-note` 人话系统行，无技术 code（补验收报告建议项） |

既有 P2 语义（暂停/恢复/超窗/队列/UI/诊断）与 P0/P1 回归均未改变（见 §五）。

---

## 三、不变量 → 实现 → 测试映射（P4.1–P4.4 / Q4·Q5 / 任务书 P2）

| # | 要求 | 实现 | 测试（真实路径） |
| --- | --- | --- | --- |
| 1 | **网络权威来源＝主进程**：`net.isOnline` 初始 + 5s 采样（含启动首采样）；渲染 `online/offline` 只作提示；powerMonitor 只提示/重探 | `app/main.ts` 建 monitor（`probe: net.isOnline`）；`app/desktop/network-monitor.ts` 状态机 + 采样；渲染经 `network:renderer-state` 上报，主进程重探纠正 | `test/桌面应用/network-monitor.test.ts`（首采样/采样间隔/渲染提示只重探/渲染误报纠正/探针异常保持已知状态）；`test/桌面UI/network-status.test.ts`（IPC 接线钉子） |
| 2 | **防抖**：连续 2 次离线采样或 1s 稳定窗口才判离线；1 次瞬时抖动不判；恢复立即 | monitor：首见离线起稳定窗口（窗口到点重探）、连续采样计数；online 采样立即恢复；默认 5s/2 次/1s，可注入 | `test/桌面应用/network-monitor.test.ts`（稳定窗口/连续 2 次/抖动恢复/恢复立即） |
| 3 | **锁屏 ≠ 离线**；suspend/resume 触发重探 | `notePower` 只记 `network.power` 诊断并重探；锁屏/解锁从不直接置离线 | `test/桌面应用/network-monitor.test.ts`（lock/unlock 保持在线；suspend/resume 各重探一次；单次离线重探不因解锁判离线） |
| 4 | **离线安全暂停优先**：进行中的模型请求对 P1 `RequestDeadline` pause（计时停走，不触发超时），恢复后 resume | Claude 适配器 `startNetworkWatch`：订阅 gate；offline ⇒ `deadline.pause()`（引用计数，与交互/工具暂停可嵌套）；online ⇒ `resume()`；attempt 结束/abort 退订并清窗口 | `test/测试/network-state-e2e.test.ts`（离线跨 40ms 首字节时限不失败；恢复后 completed；**探针异常不 resume**；恰一条 settled、无 handback、users=1）；`test/claude-adapter` 全量回归 |
| 5 | **恢复窗口 5min（可注入）**：离线超过窗口 ⇒ 明确 errorCode 失败并如实终态 | `network-gate.ts` 窗口守卫 + `createNetworkOfflineFailure`（name `NetworkOfflineError`，code `network-offline-timeout`）；适配器窗口到点 reject；Service 归 failed、settled.detail 带 errorCode/attempts/replaySafe、summary 人话 | `test/runtime-core/network-gate.test.ts`（默认 300000/窗口语义/错误形状）；`test/测试/network-state-e2e.test.ts`（注入 60ms ⇒ send 失败、恰一条 settled(failed)、人话短报、无 handback、无额外 settled） |
| 6 | **队列**：离线期间保留并在数据面标 `blockedReason:"network"`；恢复后按既有投递机制继续 | `SessionManager.applyNetworkState` + `drainQueueUnsafe` 离线不认领；`notifyRoleState` 网络优先阻塞原因；恢复对全部有队列项目走既有 `drainAllQueuesFor` | `test/测试/network-state-e2e.test.ts`（真实 SessionManager：离线队列保留/不投递/`blockedReason:network`；**探针异常不 drain**；恢复后恰投递一次、不重复）；`test/桌面应用` 全套（P0 队列可见性回归） |
| 7 | **UI**：状态行「离线/已恢复/等待网络」人话（i18n；客户卡无技术 code；`aria-live="polite"`） | `networkStatusView` + `NetworkStatusLine` 会话头状态行；`ui.network.*` 中英；恢复行 8s 收起；离线 title 说明请求计时暂停、队列等待网络 | `test/桌面UI/network-status.test.ts`（纯函数/组件/i18n/无 ECONNRESET/URL/凭据）；`test/桌面应用/e2e/main.mjs`（真实 renderer+preload+IPC：离线/恢复可见，无技术 code） |
| 8 | **不自动重放已完成/失败回合**（重试属 P3） | 适配器窗口耗尽只 reject 当前 attempt；P2 无 ANS 重试；恢复只 resume 仍在进行中的请求，不重发旧回合；桌面只放行队列，不重放已完成/失败回合 | e2e：窗口 e2e 断言 users=1、无 handback；恢复/探针异常 e2e 断言 users=1、恰一条 settled；队列 e2e 断言恢复后恰投递一次 |
| 9 | **诊断 `network.*`**：离线/恢复/暂停/恢复窗口耗尽/锁屏提示；仅用既有白名单字段 | monitor：`network.state`/`network.power`/`network.hint`；适配器：`network.request.pause`/`resume`/`timeout`；`diagnostics.ts` 未改 | `test/桌面应用/network-monitor.test.ts`（字段全部 ⊆ 白名单）、e2e（pause/resume/timeout 诊断存在且 errorCode 正确） |
| 10 | **不变**：默认自动中止 0、1h/5min/T1 语义、五步链/权限/边界、Pi/Codex 源码、`src/provider/runtime/` 无新文件、§5A 只读 | 常量/默认值未动；新选项仅 Claude 消费；Pi/Codex 忽略未知可选字段；无权限/角色/边界改动 | 全量 3144（9 既有 EPERM/18 skip 不变）；T1 10/10；`watchdog-reuse` 默认 0 断言不变；Pi/Codex 全量回归 |

### 诊断字段落地（不改 `src/common/shared/diagnostics.ts`）

| 事件 | 实际落盘字段（← 语义） |
| --- | --- |
| `network.state` | `state`←online/offline、`mode`←来源（main-net/renderer/power）、`reasonCode`←initial/interface-down/renderer-offline/probe/resume、`durationMs`←稳定/防抖时长 |
| `network.hint` | `state`←渲染提示的 online/offline、`mode:"renderer"` |
| `network.power` | `state`←suspend/resume/lock/unlock、`mode:"power"` |
| `network.request.pause` | `turnId`、`attempt`、`state:"offline"`、`mode:"claude"` |
| `network.request.resume` | `turnId`、`attempt`、`state:"online"`、`mode:"claude"` |
| `network.request.timeout` | `turnId`、`attempt`、`errorCode:"network-offline-timeout"`、`timeoutMs`←窗口、`durationMs`←离线时长、`mode:"offline-window"` |

**字段缺口（已报告，验收裁定可接受）**：方案 §6.3 的 `network.state` 字段名 `online`/`source`/`stableForMs`/`reason` **不在** `diagnostics.ts` 既有白名单；本批按「不改白名单」的任务约束用既有字段承载（上表映射）。若验收要求字面字段名，需另开白名单变更（不在本批授权）。

---

## 四、测试差异表（新增/重写/删除）

| 文件 | 类型 | 差异 | 理由 |
| --- | --- | --- | --- |
| `test/runtime-core/network-gate.test.ts` | 新增 | 4 tests | 网关通知/离线窗口/失败形状（附录 B） |
| `test/桌面应用/network-monitor.test.ts` | 新增 | **11 tests** | 首采样/防抖/连续采样/恢复/渲染提示/power/诊断白名单 + **F1 四例（含真实计时）**（Delta-TR-2） |
| `test/桌面UI/network-status.test.ts` | 新增 | 6 tests | 离线/恢复视图、组件 aria、i18n、接线钉子（附录 B） |
| `test/测试/network-state-e2e.test.ts` | 新增 | **6 tests** | 真实 openRoleSession+适配器（假 SDK）+ 真实 SessionManager + 真实 monitor：暂停恢复/窗口失败/队列 + **F1 adapter 探针异常/队列探针异常/网络失败系统行**（附录 B） |
| `test/桌面应用/e2e/main.mjs` | 修改 | +15 行；+2 硬检查 | 镜像 main.ts 注册网络 IPC；真实 renderer/preload 网络状态行可见性 |
| `test/项目管理/shared/i18n.test.ts` | 修改 | 计数 `ui 868/main 545=1478` → `ui 872/main 546=1483` | 4 个 `ui.network.*` + 1 个 `main.networkStatus.*`（中英成对） |
| 删除/放宽断言/新增 skip | **无** | — | — |

**测试规模**：P1 368 文件 / 3117 tests（3090 pass / 9 fail EPERM / 18 skip）→ P2 基础 372 / 3137；**P2 F1 返工 372 文件 / 3144 tests**（3117 pass / 9 fail / 18 skip；+4 文件、+27 tests 全部为新测试）。

---

## 五、验证证据（最终候选 `d6b30ef`，rebase 基线 `aa6b87c`）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 全量回归 | **3144 / 3117 pass / 9 fail / 18 skip / 0 todo**；exit 1；236,624.70 ms；372 文件 | `full-regression-serial.log`（SHA-256 `27599bfc…8815bd`）、`full-regression-summary.txt`、`full-regression-file-list.txt` |
| 失败分类 | **9 项全部为 S1/P0/P1 既有 Windows symlink `EPERM`**（同集合：claude 1、codex 1、pi 2、runtime-core 3、测试/g4 1、编排 1）；**新增确定性失败 = 0、新 skip = 0、删测 = 0** | `full-regression-summary.txt` |
| 桌面窗口全套 | **402/402 pass** | `targeted-desktop-app.log`（SHA-256 `cf4b4ac8…3a77`） |
| 桌面UI 全套 | **332/332 pass** | `targeted-desktop-ui.log`（`1259c26a…4830`） |
| 运行时核心 + Claude适配器 | 344 tests / 336 pass / 4 fail（4 = S1 既有 EPERM）/ 4 skip | `targeted-runtime-core-claude.log`（`a80c4c12…acec`） |
| T1 + P1 e2e + P2 e2e | **16/16 pass**（T1/P1 10 + P2 6） | `targeted-t1-request-timeout.log`（`45b906bb…1ede`） |
| P2 新单测/UI/i18n | **27/27 pass**（4+11+6+i18n 6） | `targeted-network-unit.log`（`6bc25c12…9363`） |
| P2 e2e 单文件 | **6/6 pass** | `targeted-network-e2e.log`（`06579bb1…8a2c`） |
| 双 typecheck | `typecheck.log` exit 0 / 0 error；`typecheck-renderer.log` exit 0 / 0 error | `typecheck-summary.txt`、`typecheck.log`（`f8458c2a…00ed`）、`typecheck-renderer.log`（`bb9d7ec8…f3fa`） |
| build:renderer | exit 0（built in 346ms） | `build-renderer.log`（`01279e2a…6da6`） |
| 真实 Electron E2E | **E2E_PASS=true**；`E2E_FAILURES` 空；**18 PNG**；`NETWORK_STATUS_OFFLINE_VISIBLE=true`、`NETWORK_STATUS_RECOVERED_VISIBLE=true` | `electron-e2e/report.txt`、`electron-e2e-summary.txt`、`electron-e2e-screenshots.sha256`、`electron-e2e.log`（`0f3f9ba5…bc75`） |
| phase5a smoke | **40/40 checks，failures=0**；no console errors / no CSP violations；7 PNG | `phase5a-smoke/report.json`、`phase5a-summary.txt`、`phase5a.log`（`37ba886e…8c63`） |
| 目标项目零写入 | 测试源码/日志零引用目标项目；夹具均为 `os.tmpdir()`；E2E 默认 worktree 为项目、OUTDIR 在证据目录 | `target-zero-write.txt` |
| 默认自动中止 | `DEFAULT_TURN_ABORT_MS=0` 未改（P0/看护测试仍断言） | 全量日志 |

### 5.1 与 S1/P0/P1/base P2 对照

| 指标 | S1 | P0 | P1 | P2 base | P2 F1 rework |
| --- | --- | --- | --- | --- | --- |
| 文件数 | 358 | 363 | 368 | 372 | **372** |
| tests | 3077 | 3094 | 3117 | 3137 | **3144** |
| pass | 3050 | 3067 | 3090 | 3110 | **3117** |
| fail | 9（EPERM） | 9（同集合） | 9（同集合） | 9（同集合） | **9（同集合）** |
| skip | 18 | 18 | 18 | 18 | **18** |
| T1 | 通过 | 通过 | 通过 | 通过 | **通过** |

### 5.2 证据可复算口径（F2 修正）

- `sha256.txt`：50 个证据文件（不含自身）；**本 worktree 直接 `sha256sum -c sha256.txt` 通过**（manifest 与文本证据均为 LF 生成）。
- 生成口径：文本证据（`.txt/.log/.json/.sha256/.sh`）先去 CR（LF）再哈希；PNG 截图按二进制原样哈希。
- 跨 checkout 复算：`bash verify-sha256-normalized.sh`（对 manifest 行与文本内容去 CR，PNG 原样），已验证 **ok=50 failed=0**；说明见 `manifest-notes.txt`。
- manifest SHA-256：`f66749af0b750e783f44b0997ae5803dbe02da6de0676e8a183ace6485e8efc5`。
- 原始日志/PNG 按 `.gitignore` 不入库，保留在证据目录并以哈希固化；入库为 summary/report/candidate hashes/manifest/notes/verifier。

---

## 六、验收 v1 发现处置

| 发现 | 处置 |
| --- | --- |
| **F1（阻断）探针异常把已知离线翻成在线** | **已修复**（`d6b30ef`）：三态探针 + 异常不迁移；新增 7 个真实路径测试（monitor 假时钟 3 + 真实计时 1 + e2e adapter 1 + e2e 队列 1 + 网络失败系统行 1，其中系统行为验收建议补测）。待复验 P2-I1。 |
| **F2（证据定稿）change-package/manifest pre-rebase、CRLF 不可校验** | 已更新为基线 `aa6b87c` / 最终候选 `d6b30ef`；manifest 重新生成（50 文件，本 worktree `sha256sum -c` 通过 + 跨 checkout 归一化校验通过）；所有日志/报告/截图基于最终候选重跑。 |
| **F3 E2E 18 PNG** | 本轮最终候选真实 Electron 复跑生成 **18 PNG**（`SHOT_00_TITLEBAR` 成功），`E2E_PASS=true`；无需豁免。验收两轮 17 PNG 的 `UnknownVizError` 为已知偶发（本轮未复现）。 |
| 诊断字段复用 / Pi/Codex 不暂停 / 超窗 reject / 私有引用 / 初始状态语义 | 验收裁定可接受，**未改动语义**（见 §七 风险）。 |
| P1 `request-timeout-wiring` 单文件时序脆弱 | **既有测试问题，非 P2 回归**：本轮 targeted 目录套件曾复现 1 次 6s 超时，单文件复跑亦复现不同用例；重跑目录 402/402 通过；全量 3144 中该文件通过。未修改该测试（避免扩大写集）。 |
| 直接 send 与离线 / 状态行样式 / 网络失败系统行测试 | 系统行测试**已补**；直接 send 离线仍为低风险记录（§七）；样式未改（E2E 可见性/文本正常，UI 视觉复核建议保留）。 |

---

## 七、风险、偏差与已知限制

1. **验收标准来源（时序如实）**：P2 §11 验收标准 v1.2 补写于 P2 实施后，不追溯为实施前标准；本包按方案 §5/Q4/Q5 + v1.2 自证。
2. **诊断字段映射（无新白名单）**：`online/source/stableForMs/reason` 不在既有白名单；用 `state/mode/durationMs/reasonCode` 承载（验收裁定可接受）。`diagnostics.ts` 未改。
3. **Pi/Codex 的进行中请求不暂停（Q10 范围）**：pause/resume 只在 Claude 适配器接线；**桌面队列阻塞对所有 runtime 生效**。Pi/Codex 源码零改动、全量回归通过；同接口接入另行评估（Q10/Delta-TR-1）。
4. **窗口耗尽的时序（如实失败，不重放）**：离线超过 `networkRetryWindowMs` 直接 reject 当前 attempt（终态 failed + `network-offline-timeout`），即使 SDK 当时因工具/交互等待而暂停计时；不伪造工具结果、不自动重放。验收裁定可接受，P3 可细化。
5. **跨角色私有 common 引用（与 P1 同先例）**：`app/desktop/network-monitor.ts`/`session.ts` 引用 `src/common/runtime-core/network-gate.ts`；验收裁定可接受为低风险。
6. **`run-role.ts` 未改**：`RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions,…>` 自动透传新选项（与 P1 同口径）。
7. **初始状态语义**：初始在线由渲染首屏 `get-state` 拉取（不发事件）；初始离线发一次事件并立即生效。验收裁定可接受。
8. **直接 send 与离线（低风险缺口）**：`SessionManager.send` 空闲直发路径不做网络检查；离线时新客户消息仍会开一轮（适配器会 pause），但不进入队列。P2 任务书重点在 `drainQueue` 队列；若要求「所有新模型投递离线保留」，需在 send 入口补检查（另立提案）。
9. **状态行样式**：未新增 `.network-status-line` CSS；E2E 可见性/文本正常；视觉样式建议 UI 复核（低）。
10. **P1 单文件时序脆弱（既有）**：`test/桌面应用/request-timeout-wiring.test.ts` 单文件/目录首跑偶发 6s 超时（P1 候选同样复现）；全量套件与目录重跑通过。未在本批修改（不在 P2 写集）。
11. **P3 接线点（离线判定 ↔ replay-safe 重试）**：`NetworkGate` + `networkOfflineFailureFacts`（offlineMs/attempts/replaySafe）+ 5min 窗口是 P3 输入；P3 必须仅在 `replayUnsafe=false` 且窗口内恢复时重试，超窗/有副作用一律不重放。P2 已用 e2e 钉住「users=1、无 handback、恢复仅继续原请求/队列恰一次」。
12. **E2E harness 更新**：`test/桌面应用/e2e/main.mjs` 补注册网络 IPC 与 2 条硬检查；不改生产接口、保留 18 张截图。

---

## 八、回滚

- 未提交：恢复批前文件并重跑本包验证。
- 已提交（F1 返工后）：只回滚 F1 `git revert d6b30ef`（保留 base P2）；整体回滚 P2 `git revert b02d1fd d6b30ef`（按提交序处理）并重跑。网络状态为运行时/UI 提示，无数据/schema 迁移；回滚恢复「无网络监听、无离线暂停/队列 network 阻塞」行为；默认 0/1h/5min/T1 不受影响；不触碰 Pi/Codex/§5A/release。
- 不影响 P0/P1/§5A；诊断/网络状态仅日志与内存，无项目写入。

---

## 九、状态

- 候选：已实现、已本地验证（最终候选 `d6b30ef`）；**未 push、未合并 main、未发布**。
- 独立验收：**请复验 P2-I1（F1）并判定 pass / rework / insufficient evidence**（T2：全量 + Electron + phase5a + 目标项目零写入 + 默认 0/1h/5min/T1 不变；证据口径见 §5.2）。
- 发布：不在本波；另走 release-policy overlay。
