---
id: ui-platform-phase5a-entry
type: change
title: UI 平台化 Phase 5A——桌面窗口入口、dev/prod 加载与 packaged smoke 实施记录
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented
revision: 1
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase5a-entry-scope, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 按 PM §十七实施 5A：新增 renderer-entry 唯一路径事实源；main.ts 5A 生产仍旧入口 + dev 回环回退 + 诊断 hook；packaged smoke 重锚 + smoke-only 入口；main.mjs 目标切换/健壮化/P1-3 新语义证据；typecheck 0、桌面 681/681、双端 e2e E2E_DONE、本地打包 smoke 全 true
  - date: "2026-10-21"
    kind: implemented
    summary: PM §19 G4/G3 重锚/等价检查落地；main 新入口 E2E_PASS=true、10 repair 全 true；G3 中 RESTORE 成功分隔行新端回归已交接桌面UI
  - date: "2026-10-21"
    kind: implemented
    summary: 5B 步骤 c：renderer-entry 收敛唯一 renderer/dist/index.html；main.ts/main.mjs/packaged smoke 切 dist；hot-path/message-queue 旧段退役；桌面 504/504；main 默认 E2E_PASS=true；verify:local 14 项全 true
---

# Phase 5A 桌面窗口实施记录（入口、dev/prod 与 packaged smoke）

依据 PM 评审 revision 11 §十七（5A 放行）与[入口方案](../design/2026-10-21_design_ui-platform-phase5a-entry-scope.md)。**5A 生产默认仍是旧入口 `app/renderer/index.html`，未切换**；旧渲染器/旧测试/vendor 未删除；未改 `package.json`/`electron-builder.yml`/release 文件；**preload 零改动、无新 IPC、零新增依赖**。

## 一、写集

| 文件 | 变更 |
| --- | --- |
| `app/desktop/renderer-entry.ts`（新增） | 唯一路径事实源：`PRODUCTION_RENDERER_RELATIVE=["renderer","index.html"]`（5A）、`BUILT_RENDERER_RELATIVE=["renderer","dist","src","index.html"]`；`resolveRendererEntry(appDir)`/`resolveBuiltRendererEntry(appDir)`；只用 `node:path` |
| `app/desktop/navigation-policy.ts`（新增，PM §17.12） | 纯导航策略：同 URL/允许入口放行、http(s) 外开、file/data/javascript 等阻止、window.open 一律 deny、外部打开去重闸 |
| `app/desktop/navigation-guard.ts`（新增，PM §17.12） | `installNavigationGuard`：will-navigate + setWindowOpenHandler 接线，仅依赖 webContents on/setWindowOpenHandler/getURL，可假件测试 |
| `app/main.ts` | 入口经 `resolveRendererEntry(HERE)`；生产 `loadFile`；dev 仅 `!app.isPackaged` + `ANS_DEV_SERVER_URL`（http/https、localhost/127.0.0.1/[::1]、无凭据）+ 8s 限时 + 一次性回退 `BUILT_RENDERER_ENTRY`；未构建⇒恢复页；`did-fail-load` hook；诊断 `window.renderer.target`/`window.dev-server.fallback`；每窗口安装导航兜底（允许入口/同 URL、http(s) 外开、恶意协议阻止、与 IPC 外开共用去重闸）；packaged smoke 传期望入口 + 收集 console/did-fail-load；**未改 CSP、webPreferences、业务 IPC** |
| `app/desktop/diagnostics.ts` | `observeWindowDiagnostics` 增可选 `options.onMainFrameLoadFailure(errorCode)`；主帧失败且 hook 返回 true 时不显示恢复页；三参调用兼容 |
| `app/desktop/packaged-smoke.ts` | `parsePackagedSmokeArguments` 增 smoke-only `--ans-renderer-entry`（仅随 `--ans-packaged-smoke`、绝对 `.html`）；`validateSmokeRendererEntry`（必须位于 `<appRoot>/app/renderer/dist/`）；`packagedSmokeScript(envPath, expectedEntryUrl)` 增 `entry/rootMounted/driver/csp/cspViolations/settingsEntryDisabled`，保留 `dom/preload/ipc/importDisabled/missingConfiguration/envPathMatches` |
| `test/桌面应用/e2e/main.mjs` | `ANS_RENDERER_ENTRY` 优先 + 默认 `resolveRendererEntry(APP_DIR)`；非法 fail-fast `RENDERER_ENTRY_ERROR`；三处写死加载替换；首行 `RENDERER_ENTRY=`；`repairCheck` 累计 + `E2E_PASS`/`E2E_FAILURES`；动作 eval/通道 promise 有界等待；null 安全；补 `shell/decision:judge-get/set` 通道；`ensurePiRuntime`（新渲染器默认 Claude，离线 demo 适配器挂 Pi）；P1-3 新语义检查；`will-navigate` 记录并阻止测试窗口离开 |
| `test/桌面应用/pi-config.test.ts` | 新参数/越界/相对/非 html 用例；`validateSmokeRendererEntry` 路径包含用例；smoke 脚本 vm 夹具按新检查重写 |
| `test/桌面应用/diagnostics.test.ts` | dev 回退 hook：接管不显恢复页；返回 false/-3/子帧仍按既有语义 |
| `test/桌面应用/ans-wiring.test.ts` | 源码钉：renderer-entry 存在且无 Electron；main.ts 不写死入口、含 `ANS_DEV_SERVER_URL`/`validateSmokeRendererEntry`；main.mjs 不写死入口、含 `RENDERER_ENTRY=`/`E2E_PASS=` |

## 二、入口与加载策略

| 场景 | 实装 |
| --- | --- |
| 5A 生产 | `app/renderer/index.html`（真实主进程实测诊断 `path=renderer/index.html`、`window.load.end ok`） |
| dev 默认 | 同生产文件入口（`electron app/main.ts`，无 dev URL） |
| dev HMR | `ANS_DEV_SERVER_URL` 回环 URL → `loadURL`；8s 超时/失败一次性回退已构建入口；回退后本窗口重载直接文件入口 |
| 5A packaged smoke | 默认经 smoke-only 覆盖加载包内 `app/renderer/dist/src/index.html`（生产默认未切） |
| 5B | 常量收敛为 `renderer/dist/index.html`；移源/改 Vite input/删旧由 5B 同批执行（本记录未做） |

**真实 dev 回退证据**（诊断日志，见 `...-phase5a-entry-evidence/dev-fallback-diagnostics.txt`）：`window.renderer.target mode=dev-url url=127.0.0.1:59999/index.html` → `window.load.failed errorCode=-102 ERR_CONNECTION_REFUSED` → `window.dev-server.fallback reasonCode=load-failed` → `window.renderer.target mode=file path=renderer/dist/src/index.html` → `window.load.end ok`。

**`.ts` 可被 main.mjs 导入（PM §17.2 验证点）**：Electron 44.7/Node 24 下 `ELECTRON_RUN_AS_NODE=1 electron --input-type=module -e "import('./app/desktop/renderer-entry.ts')"` 成功；main.mjs 两轮真实 e2e 均动态 import 该模块并输出 `RENDERER_ENTRY=`，未退回 `renderer-entry.mjs`。

## 三、main.mjs 与报告

- 323 条 `log("...` 与 22 条 `repairCheck` 名**全部保留**（静态核对 HEAD 345 个名字，除动态前缀 `REPORT_STATUS_` 与仅失败时出现的 `E2E_ERROR` 外均在新旧报告出现）。
- 报告新增行（NEW-ONLY，允许）：`RENDERER_ENTRY=`、`E2E_PASS=`、`E2E_FAILURES=`、`PROMISE_TIMEOUT=`、`EVAL_ACTION_ERROR=`、`WAIT_TIMEOUT=`、`INPUT_REPAIR_ERROR=`、`SELECT_RUNTIME_ERROR=`、`NAVIGATION_BLOCKED=`、`P13_*`。
- 旧端报告 391 个名字、新端 397 个；共同 390、仅旧 1（`P13_NEW_SEMANTICS`，旧端不适用）、仅新 7（P13 新语义 7 项）；值差异 77 条，逐名清单见证据 `report-diff.md/json`。`WAIT_TIMEOUT`/`PROMISE_TIMEOUT` 已随 §九 修复全部消失。
- **桌面UI Markdown 链接修复并行落地后的复跑**：新端 `LINK_OPEN_EXTERNAL_CALLED=true`、`NAVIGATION_BLOCKED` 不再出现（渲染侧已 preventDefault，主进程兜底未被触发）——双层修复按 §17.12 生效且无双重外开。
- **PM §17.13/§18 归因修复后的复跑**：harness 增加段间挂起清理与 React 受控 input 的 click 驱动（不改断言），PENDING/RECOVERY×3/OPX/OP1-4/anchor 全部转 true；`PROMISE_TIMEOUT` 归零。差异从 PM 批准时的 103/10 降至 **77/7**（PM §19 G4 重锚/等价检查落地后），最终冻结以新快照为准并请 PM 确认；G4/G3 处置见 §十。
- 健壮化只让失败可见：`repairCheck` 不再中途抛错；动作 eval 20s 有界；通道挂起 promise 3–15s 有界；缺失节点按 false/安全空值记录。判据未放宽。

## 四、P1-3 忙时切换安全证据（PM §17.4）

新入口（`dist/src/index.html`）真实运行，同一报告见 `p1-3-new-semantics.txt`：

```
P13_OLD_PROJECT_BUSY=true
P13_QUEUED_BEFORE_SWITCH=true RESULT={"ok":true,"queued":true,"position":1}
P13_SWITCH_IMMEDIATE=true
P13_OLD_SESSION_LIVE_AFTER_SWITCH=true
P13_RETURN_RESUMES_SESSION=true
P13_QUEUE_SURVIVES_SWITCH=true
P13_CONTINUE_AFTER_RETURN=true RESULT={"ok":true,"sessionCurrent":true}
```

**结论：满足 PM §17.4 裁定 (b) 的安全条件**——忙时切换项目立即生效；旧项目会话仍 `live`、返回后会话续接、排队消息不丢、可继续发送。未发现「会停止或丢排队」的情形，无需扩桌面UI 写集阻塞 Phase 5。`SWITCH_CONFIRM_*` 按 OLD-ONLY/REMOVED 登记（旧端 5/5 true；新端 `SWITCH_CONFIRM_ON_BUSY=false`、`SWITCH_CONFIRM_RELOADED=false`、`SWITCH_IDLE_HINT=false`），确认条本身作为 Phase 6 产品待办，由产品/客户决定（PM §17.4）。旧端对照见 `p1-3-old-semantics.txt`。

## 五、packaged smoke 与本地打包

- `npm run package:local` 成功（renderer 重建 + electron-builder zip）。
- `npm run verify:local` **ok=true**，包内旧入口与新构建产物均在；packaged smoke（smoke-only 入口覆盖到 `dist/src/index.html`）14 项检查全 true：`entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load`；`expectedEntry === entryUrl`、`consoleErrors=[]`、`loadFailures=[]`。证据：`...-phase5a-entry-evidence/local-smoke.json`（zip sha256 `b6c179b9…`，非发布 manifest）。
- 无项目时 `#tab-pi` 禁用替代旧「打开设置」断言（PM §17.3）；有项目的开/关由 main.mjs 覆盖。

## 五之二、导航兜底（PM §17.12）

- 新增 `app/desktop/navigation-policy.ts`（纯策略）：`classifyNavigation`（同 URL/允许入口放行；http/https 外开；file/data/javascript/blob/about 等阻止；非法 URL 阻止）、`classifyWindowOpen`（一律 deny，http/https 外开）、`createExternalOpenGate`（同窗口内已外开的 URL 1.5s 内不重复外开）。
- 新增 `app/desktop/navigation-guard.ts`：`installNavigationGuard(webContents, {allowedUrls, openExternal, onBlocked, onExternal})`，只依赖 `on/setWindowOpenHandler/getURL`，便于假件测试；`app/main.ts` 在每窗口安装，允许入口＝生产入口、构建入口、dev URL（仅非打包）；`openExternalFn` 与兜底共用去重闸。
- `will-navigate`：放行同 URL/允许入口；其余 `preventDefault`；http(s) 经 `shell.openExternal` 外开并记 `window.navigation.external`；其它记 `window.navigation.blocked{reasonCode}`（不记原始 file/data/javascript URL）。`setWindowOpenHandler` 恒返回 `{action:"deny"}`。
- **不改 preload、不新增 IPC、零新增依赖**；渲染侧 preventDefault 后不会触发 `will-navigate`，兜底只处理漏网；去重闸防止「渲染侧已外开 + 漏网导航」双开。
- 验证：
  - 纯策略/接线单测（`diagnostics.test.ts`）：同 URL reload 放行、https 外开恰一次且 URL 不变、file/data/javascript 阻止且不外开、`window.open` 一律 deny、去重闸窗口期。
  - **真实 Electron 探针**（`navigation-guard-electron-probe.{mjs,txt}`）：https 链接 → 外开一次、窗口 URL 不变；file → `blocked-protocol`；data/javascript → 不导航、`pwned=""`、不外开；`window.open(https)` → deny + 外开一次、URL 不变。
  - 桌面UI 链接修复并行落地后，新入口 main.mjs `LINK_OPEN_EXTERNAL_CALLED=true` 且无 `NAVIGATION_BLOCKED`（兜底未被触发）；旧入口路径不变。
  - 本地打包 `verify:local` 仍 ok、packaged smoke 14 项全 true。

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错 |
| `node --test "test/桌面应用/**/*.test.ts"` | **681/681 过**（含本批新增 hook/参数/接线用例） |
| main.mjs 旧入口 | `E2E_DONE=1`，`RENDERER_ENTRY=app/renderer/index.html`，`E2E_PASS=false`，唯一 `RECOVERY_SAME_PENDING_CARD_ONCE`（旧端 C/G4-RESOLVED，PM §19 已批准；新端 true） |
| main.mjs 新入口 | `ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/src/index.html`，`E2E_DONE=1`，`E2E_PASS=false`，10 项 repair 失败（列表见 §八），无 renderer console 错误、无 `E2E_ERROR` |
| 双端对照 | 356 共同名、102 值差异、仅旧 1、仅新 9；`report-diff.md/json` 逐条 |
| dev 回退 | 真实主进程诊断链通过（§二） |
| 非法入口 fail-fast | `ANS_RENDERER_ENTRY=relative.html` ⇒ exit 1、`report.txt` 写 `RENDERER_ENTRY_ERROR={"reason":"absolute .html required"}`（证据 `invalid-entry-report.txt`） |
| 5A 生产默认 | 真实主进程加载旧入口 `renderer/index.html`（未切换） |

## 六、自测结果

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错 |
| `node --test "test/桌面应用/**/*.test.ts"` | **504/504 过**（5B 后：683 − 178 旧四测试由桌面UI 删除 − 1 hot-path ④；见 §十一） |
| main.mjs 旧入口 | `E2E_DONE=1`，`RENDERER_ENTRY=app/renderer/index.html`，`E2E_PASS=false`，唯一 `RECOVERY_SAME_PENDING_CARD_ONCE`（旧端 C/G4-RESOLVED，PM §19 已批准；新端 true） |
| main.mjs 新入口 | `ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/src/index.html`，`E2E_DONE=1`，**`E2E_PASS=true`、`E2E_FAILURES` 空**（10 项 repair 全 true），无 renderer console 错误、无 `E2E_ERROR`；`LINK_OPEN_EXTERNAL_CALLED=true` |
| 双端对照 | 390 共同名、77 值差异、仅旧 1、仅新 7；`report-diff.md/json` 逐条 |
| dev 回退 | 真实主进程诊断链通过（§二） |
| 非法入口 fail-fast | `ANS_RENDERER_ENTRY=relative.html` ⇒ exit 1、`report.txt` 写 `RENDERER_ENTRY_ERROR={"reason":"absolute .html required"}`（证据 `invalid-entry-report.txt`） |
| 5A 生产默认 | 真实主进程加载旧入口 `renderer/index.html`（未切换） |
| 导航兜底 | 纯策略/接线单测 + 真实 Electron 探针通过（§五之二） |

## 七、5A 发现的跨角色差异（交 PM / 桌面UI / 测试）

1. **Markdown 链接导航（已双层修复）**：桌面UI 已在渲染侧拦截 `.md-link`（preventDefault，http/https 走 openExternal）；本角色产品侧 `will-navigate`/`setWindowOpenHandler` 兜底已落地（§五之二）。复跑 `LINK_OPEN_EXTERNAL_CALLED=true`、无 `NAVIGATION_BLOCKED`，无双开；真实 Electron 探针见证据。
2. **operator 卡载体差异**：新渲染器无 `op-kind-preview/select/multi`、`is-flash`、`.op-queue-aggregate` 旧类名；`OP_*`、`OPX_*`、`P1_*` 正向后缀检查在新端为 false，需按契约面重锚（旧名→新名/批准依据）。
3. **抽屉/树/状态/锚点载体差异**：`TAB_*_ACTIVE` 依赖旧 `.active` 类；`RIGHT_QUEUE_*`、`ROLE_STATE_BADGE_*`、`OPEN_CARD_AT_ARRIVAL`/`ANCHOR_*` 的 debug 字段与命名不同；`STATUS_BADGE_TEXT` 无「●」前缀；`PI_FIELD_COUNT` 5→6、`piKeys` 名集不同；`RESTORE_SU_RESTORED_FLAG` 形状不同。均列入 91 条值差异，测试角色按 MATCH/RENAME/NEW-ONLY/OLD-ONLY/REMOVED 台账逐条裁定。
4. **忙时切换确认条**：见 §四；新语义安全，确认条留 Phase 6 产品决定。
5. **恢复后重复卡**：新端在段间清理后已转 true（`RECOVERY_CARD_DIAG count:1`）；旧端仍 `RECOVERY_SAME_PENDING_CARD_ONCE=false`（2 张同 id，C 类旧红），由测试复核同因。
6. **新端 `WAIT_TIMEOUT`（4 处）**：均为 SESSION_REPAIR 同角色不重开的下游等待（`REPAIR_AFTER_STOP_OPEN_CALLS=26`），随渲染侧修复消失；无独立 harness 时序放宽（见 §九）。

## 八、未完成 / 边界

- **5B 步骤 c 已完成**：生产默认已切 `dist/index.html`；旧渲染器/vendor/旧四测试已由桌面UI 删除；`dist/index.html` 已产出。5B 其余步骤（e/f/g 等）由对应角色执行。
- **未验证**：dev server 成功路径（仅验证失败回退）；Windows/DPI/屏读；packaged smoke 在不传入口覆盖时对旧入口的检查（重锚后的检查面向新入口，5A 默认旧入口预期 false，5B 才成为默认）；真实模型/网络/`.env` 写入（按 AC 边界 missing-evidence）。
- **packaged 默认旧入口**：`verify:local` 总是传 smoke-only 覆盖到新构建产物；这是 5A 的预期用法，不是生产默认。
- **新端 repair 失败 0**：原 10 项已全部关闭（PENDING/RECOVERY×3/harness 修复，SESSION_REPAIR×5/DIAGNOSTICS 由桌面UI 修复并复验 true）。
- **PROMISE_TIMEOUT/WAIT_TIMEOUT**：均已归零（harness 驱动修复 + 渲染侧 SESSION_REPAIR 修复）。

## 九、10 项 repair 失败逐项归因（PM §17.13/§18）

| # | check | 结论 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| 1-5 | `SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND`、`EXPLICIT_RECOVERY_DELIVERS_ONCE`、`FAILED_OPEN_DOES_NOT_SEND`、`FAILED_OPEN_NO_USER_BUBBLE`、`FAILED_OPEN_NO_REPLAY` | **真实行为缺陷（渲染侧），已修复**：桌面UI 已让同角色显式选择调用 `openSession` 确认/重开 | 修复前：`REPAIR_OPEN_CALLS_BEFORE=26/AFTER=26`、stopSession 后 `sessionOpenRoleId` 仍为 `"桌面窗口"`；修复后：`BEFORE=34/AFTER=35`，5 项 repair 全 true | **桌面UI 已修**；精确交接见 9.1 |
| 6 | `PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE` | **harness 段间状态泄漏**（非产品缺陷）：前面段遗留 7 个挂起请求，恢复段 confirm 排队未呈现，`pendingId` 取了旧的 choice | 清理前 `pendingCount=7`；`PENDING_DIAG` 旧为 `count:0`，清理后 `count:1/confirmButtons:1` 且检查 true | harness 修：恢复段前 `rejectAllPending`（不改断言），已复跑 true |
| 7 | `RECOVERY_SAME_PENDING_CARD_ONCE` | 新端 **已转 true**；旧端仍 false（C 类旧红，同 id 2 张） | 清理后 `RECOVERY_CARD_DIAG count:1`；`RECOVERY_PRESENTATIONS_AT_CARD_CHECK=4` | 新端关闭；旧端 C 由测试复核 |
| 8 | `RECOVERY_OLD_REQUEST_STILL_ANSWERABLE` | **harness 状态泄漏**：`pendingId` 指向旧 choice，`operatorRespond(confirm)` 返回「决定与请求类型不符（请求是 choice）」，新 confirm 从未结算 | `RECOVERY_ANSWER_RESULT={"ok":false,"error":"决定与请求类型不符（请求是 choice）","pendingOutcome":null}` → 清理后 `{"ok":true}`、outcome answered | harness 修，已复跑 true |
| 9 | `RECOVERY_ENDED_REQUEST_NOT_REPLAYED` | 同上：未结算的 confirm 在再次 `recoveryReady` 时被重放（3→4） | `RECOVERY_PRESENTATIONS_BEFORE=3/AFTER=4` → 清理后 4→4 | harness 修，已复跑 true |
| 10 | `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` | **真实可观测性缺陷（渲染侧），已修复**：桌面UI 已接入 `reportDiagnostic`，四个 renderer.* 事件齐备 | 修复前缺 `renderer.event-error/viewport/replay/recovery`；修复后 `DIAGNOSTIC_EVENTS_COVER_OLD=true`，事件集合含四项 | **桌面UI 已修**；新检查 `DIAGNOSTIC_EVENTS_COVER_OLD` 持续守卫 |

### 9.1 交接桌面UI（精确）

1. **同角色会话确认/恢复**：`app/renderer/src/chat/chat-store.ts::selectRole`
   - 现状：`const alreadyOpen = get().sessionOpenRoleId === roleId; ... if (alreadyOpen && alreadyLoaded) { ...; return; }`。
   - 要求：显式角色选择不得只信本地 `sessionOpenRoleId`；至少调用一次 `bridge.openSession({projectRoot, roleId, runtime})`（或先用 `listLiveSessionViews` 核对，main 已无该会话则重开），以覆盖「后台被释放但前端仍保留旧开启标记」；失败路径仍 fail-closed（显示原因、不得发送、不得自动重放）。保持历史/行模型幂等，不重复回放。
   - 验证：main.mjs 新端 repair 段 5 项全 true，`REPAIR_OPEN_CALLS` 同角色 +1，`WAIT_TIMEOUT` 4 项消失。
2. **renderer.* 诊断**：`app/renderer/src/chat/ipc.ts` / `ChatStream` / `App`
   - 参照旧渲染器：`app/renderer/renderer.js` L18-19 `diagnose()` → `window.desktop.reportDiagnostic({event,fields})`；L1519/4081 `renderer.event-error`；L1755 `renderer.viewport`（`firstRow/lastRow/count/visibleCount/state`）；L5174 `renderer.replay`（`count/state`）；L6689/6691 `renderer.recovery`（`state:"ready"` / event-error）。
   - 字段必须落在 `app/desktop/diagnostics.ts` 的 `RENDERER_FIELDS` 白名单（`count/rowCount/firstRow/lastRow/visibleCount/replayPlan/state/durationMs/errorType/errorMessage`）。
   - 验证：main.mjs `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 五事件齐备；主进程窄桥无需改动。


## 十、PM §19 G4/G3 重锚与新检查（main.mjs）

**最终计数**：old 391 / new 397 / common 390 / only-old 1 / only-new 7 / 值差异 77；新端 `E2E_PASS=true`、`E2E_FAILURES` 空（10 项 repair 全 true）；旧端 `E2E_PASS=false` 仅 `RECOVERY_SAME_PENDING_CARD_ONCE`（C/G4-RESOLVED，PM 已批准）。

### 10.1 G4 批准重锚/移除（6）

| 旧名 | 处置 | 新检查名 / 值 |
| --- | --- | --- |
| `SWITCH_CONFIRM_ON_BUSY` / `SWITCH_CONFIRM_RELOADED` / `SWITCH_IDLE_HINT` | OLD-ONLY/REMOVED | 由 P13 7 项覆盖：`P13_OLD_PROJECT_BUSY`、`P13_QUEUED_BEFORE_SWITCH`、`P13_SWITCH_IMMEDIATE`、`P13_OLD_SESSION_LIVE_AFTER_SWITCH`、`P13_RETURN_RESUMES_SESSION`、`P13_QUEUE_SURVIVES_SWITCH`、`P13_CONTINUE_AFTER_RETURN`（均 true）；旧 `P13_NEW_SEMANTICS` 退役 |
| `ROLE_STATE_BADGE_WORKING_PENDING` | 重锚 | `ROLE_STATE_BADGE_SINGLE_COUNT_WORKING=true`（`.ti-count`=3、title「当前工作 1 项，排队 2 项」、`.ti-status` 只含「工作中」不含「待办」） |
| `ROLE_STATE_QUEUE_ROW` | 重锚 | `ROLE_STATE_QUEUE_ROW_WORK_OVERVIEW=true`（`#right-queue-body` 内 `.q-item`≥2、首行 `is-running`、含「当前工作」「排队」标题） |
| `INJECTED_CHIP_LABEL` | 重锚 | `INJECTED_CHIP_DELIVERY_LABEL=true`（「回交投递 · 来自 规划者」，4B 文案依据） |

### 10.2 G4 条件（5）关闭

| 旧名 | 结论 | 新检查名 / 值 |
| --- | --- | --- |
| `BOOTSTRAP_CENTER_CTA_PRESENT` / `BOOTSTRAP_MENTION_COUNT` / `BOOTSTRAP_MENTION_IN_CENTER_EMPTY` | 新旧值已一致（均 true/1/true，MATCH），并新增空态检查 | `BOOTSTRAP_EMPTY_STATE_SINGLE_TITLE=true`、`BOOTSTRAP_EMPTY_STATE_ACTION_OR_REASON=true` |
| `P1_ARRIVAL_DEBUG` | 新旧 JSON 字段不同（索引/偏移），行为等价 | `P1_ARRIVAL_DEBUG_NEW=true`（`rowModelDebug.operators` 含 `p1-card-1`、count>0、卡在视野） |
| `STATUS_LAST_EVENT_RECORDED` | 新状态字段为 `roleMeta.lastEvent`（旧 `lastSummary/lastAt`） | `STATUS_LAST_EVENT_FIELD_NEW=true` |

### 10.3 G4 修或补等价（10）

| 旧名 | 处置 | 新检查名 / 值 |
| --- | --- | --- |
| `P1_ARRIVAL_SCROLLED`、`P1_CHIP_CLICK_LOCATES`、`P1_CHIP_COUNT1_AFTER_TERMINAL`、`P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL`、`P1_CLEANUP_CHIP_HIDDEN`、`P1_SWITCHBACK_SCROLLS_TO_CARD` | 修（新 `.chat-row` 嵌套，改按 `[data-request-id]` 查询；chip 定位接受 focus 或 is-flash） | 同名检查在新端均 true |
| `P1_CHIP_SECOND_CARD` | 新端 chip 只定位第一张；第二张由 4A 工作概览「定位」覆盖 | `P1_SECOND_CARD_LOCATE_VIA_WORK_OVERVIEW=true` |
| `DENIED_OPEN_COUNT` / `HAS_DENIED_INLINE` | 新端 demo 旧形状摘要归 `sys-unknown-tool-event`；补**生产形状** denied 事件（显式 toolName/toolCallId） | `HAS_DENIED_INLINE_ANY=1`、`DENIED_REASON_VISIBLE=true` |
| `REPLAY_DEDUP_REBUILD` | 新端 `count` 含额外系统行；按“重建后文本无重复”等价 | `REPLAY_DEDUP_REBUILD_UNIQUE_TEXT=true` |

### 10.4 G3 25 行 main 侧精确等价（供测试台账逐名填）

| G3 行 | 新检查名 / 路径 |
| --- | --- |
| `OP_CARD_PRESENT`、`OP_SELECT_HAS_RADIO`、`OP_MULTI_HAS_CHECKBOX`、`OP_CARD_FROZEN`、`OPX_POINTER_IN_VIEWED_PANE` | uiux-v2 MIRROR 8/8 / JUDGE 33/33 / 4B 独立冒烟 operator 卡检查；main 行为 `OP_CONFIRM_ANSWERED`、`OP_SELECT_ANSWERED`、`OP_MULTI_ANSWERED`、`OP_CANCEL_DECLINED`、`OPX_ANSWERED`、`OPX_DUP_SINGLE_CARD`、`OPX_EXPIRED_FROZEN`（新旧均 true） |
| `RIGHT_QUEUE_RUNNING_FIRST`、`RIGHT_QUEUE_SOURCES` | `ROLE_STATE_QUEUE_ROW_WORK_OVERVIEW=true`、`RIGHT_QUEUE_SOURCES_WORK_OVERVIEW=true` |
| `BADGE_ON_WORK_WHILE_COLLAPSED`、`BADGES_CLEAR_ON_EMPTY` | `BADGE_ROLE_SINGLE_COUNT_WHILE_COLLAPSED=true`、`BADGES_CLEAR_ON_EMPTY_NEW=true` |
| `ANCHOR_CARD_AT_ARRIVAL`、`ANCHOR_ROW_AFTER_SWITCHBACK`、`OPEN_CARD_ROWS_AFTER_SWITCHBACK` | 索引差异归一化；行为 `ANCHOR_TABLE_REGISTERED=true`、`ANCHOR_STABLE_NOT_TAIL_ONCE/TWICE=true`、`ANCHOR_NO_DUPLICATE_ROW=true`、`OPEN_CARD_STABLE_AT_ANCHOR=true` |
| `DIAGNOSTIC_EVENT_NAMES`、`PENDING_DIAG`、`RECOVERY_CARD_DIAG`、`REPAIR_*_CALLS` | `DIAGNOSTIC_EVENTS_COVER_OLD=true`（含 renderer.event-error/viewport/replay/recovery）、`PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE=true`、`RECOVERY_SAME_PENDING_CARD_ONCE=true`、repair 全 true |
| `DISPATCH_ROW_NO_WITHDRAW` | `DISPATCH_ROW_NO_WITHDRAW_NEW=true` |
| `DRAWER_CLOSED_AFTER_PI` | `DRAWER_CLOSED_AFTER_PI_NEW=true`（新端以 `#drawer-close` 关闭；`aria-hidden=true`） |
| `REPORT_DELIVERY_DETAILS_COLLAPSED` | `REPORT_DELIVERY_INLINE_BODY_NEW=true`（新端投递行为内联 body，无 details） |
| `RESTORE_NO_SUCCESS_DIVIDER`、`RESTORE_SU_CHAT_SNIPPET`、`RESTORE_SU_REPLAY_ROWS`、`RESTORE_SU_RESTORED_FLAG` | RUNTIME 17/17 / FRESH 4/4；**但新端 `RESTORE_NO_SUCCESS_DIVIDER=false`（回放出现「会话记录已恢复」分隔行，违反 2026-10-13 客户「成功回放不显示分隔行」裁定）——真实回归，交接桌面UI 修复后再按 RUNTIME/FRESH 复核** |

### 10.5 待处理

- **RESTORE 成功分隔行**：新渲染器 `app/renderer/src/chat/chat-store.ts`（applyHistory 处 `sys-replay-divider`「会话记录已恢复」）在成功回放时渲染，旧端已按客户裁定删除。请桌面UI 移除成功分支分隔行（错误分支保留），再复跑 `RESTORE_NO_SUCCESS_DIVIDER`/`RESTORE_SU_*`；测试按 RUNTIME/FRESH 复核。
- `BOOTSTRAP_*` 当前新旧同值且新空态检查 true，无需 UIUX 书面依据即可 MATCH；若 UIUX 后续改空态文案/CTA，须按 §19.4 条件补依据。
- 旧端 `P1_CHIP_SECOND_CARD=true`、新端 false 由 `P1_SECOND_CARD_LOCATE_VIA_WORK_OVERVIEW` 等价覆盖，测试台账按 RENAME 登记。


## 十一、5B 步骤 c（桌面窗口）：入口收敛与旧段退役（2026-10-21）

**入口常量**：`app/desktop/renderer-entry.ts` 收敛为唯一 `RENDERER_RELATIVE=["renderer","dist","index.html"]` 与 `resolveRendererEntry(appDir)`；删除 5A 旧 `renderer/index.html` 常量与 `dist/src` 常量/`resolveBuiltRendererEntry`。`app/main.ts` 生产 `loadFile` 指向该唯一入口；dev 失败回退同一生产入口；导航兜底允许入口＝生产入口 + dev URL；生产 CSP/webPreferences 未改。

**main.mjs**：默认 `resolveRendererEntry(APP_DIR)`（=dist/index.html）；三处加载继续用 `RENDERER_ENTRY`；`RENDERER_ENTRY=` 报告行与 `ANS_RENDERER_ENTRY` 显式覆盖保留（非法绝对/.html/不存在仍 fail-fast）。

**packaged smoke**：期望入口由 `main.ts` 传入包内 `app/renderer/dist/index.html`；smoke-only `--ans-renderer-entry` 仍限包内 `app/renderer/dist/`。`npm run package:local` + `verify:local` **ok=true**，`distEntry=app/renderer/dist/index.html`，14 项检查全 true（`entry/rootMounted/driver/csp/...`），zip sha256 `fd4b76bb…`；证据 `...-phase5a-entry-evidence/5b/`。

**旧段退役（178 项台账外的两项，按 PM §17.6/§19 与桌面UI 交接）**：

- `test/桌面应用/hot-path.test.ts`：删除原 ④（旧 `renderer.js`/`vendor/markdown-it.umd.min.js`/`markdown.js` 的 Markdown 成本护栏与旧行源钉）；保留 ①②③（push-batcher 纯逻辑、300 事件风暴、mtime+size 哈希缓存）**3/3**。Markdown 受控渲染与成本覆盖由桌面UI `test/桌面UI`（npm markdown-it 封装）与真实 Electron e2e 承接。
- `test/桌面应用/message-queue.test.ts`：删除 `renderer.js`/`styles.css` 源钉与 `role-status.js` import；3 个状态准确性/接线测试改写为**主进程快照语义**（su 后台轮次 busy、不抢活动角色、队列深度）＋新渲染器源钉 `app/renderer/src/chat/ipc.ts` 的 `session:role-state`/`applyRoleState`；**14/14**。状态派生/徽标纯逻辑由桌面UI `test/桌面UI/status.test.ts` 覆盖。
- `test/桌面应用/diagnostics.test.ts` 的 `dist/src/index.html` 夹具改为 `dist/index.html`。

**自测**：

| 项 | 结果 |
| --- | --- |
| `test/桌面应用/**/*.test.ts` | **504/504 过**（683 − 178 旧四测试由桌面UI 5B 删除 − 1 hot-path ④）；message-queue 14、hot-path 3 |
| main.mjs 默认 | `RENDERER_ENTRY=<repo>/app/renderer/dist/index.html`，`E2E_PASS=true`、`E2E_FAILURES` 空；`LINK_OPEN_EXTERNAL_CALLED=true` |
| packaged smoke | `verify:local` ok，14 项全 true，`expectedEntry === entryUrl`（包内 dist/index.html），zip sha256 `fd4b76bb…` |
| `npm run typecheck` | 本角色文件 0 错；根 tsc 仅 `test/测试/uiux-v2-replay-regression.test.ts` 两条旧 `tool-rows.js`/`ui-labels.js` side-effect import 红（**测试角色属主，按指示未修**） |

**旧入口不可复跑**：旧 `renderer.js`/`styles.css`/vendor 已由桌面UI 删除；5A 旧/新快照仍保留在证据 `old/`、`new/`，5B 结果见 `5b/`。

## 附：证据

`角色卡/桌面窗口/docs/change/2026-10-21-phase5a-entry-evidence/`：

- `old/report.txt`、`old/stdout.log`、`old/*.png`（旧入口 5A 快照）
- `new/report.txt`、`new/stdout.log`、`new/*.png`（新入口同套件快照）
- `report-diff.md`、`report-diff.json`（390 共同名/77 值差异/仅旧 1/仅新 7）
- `p1-3-old-semantics.txt`、`p1-3-new-semantics.txt`
- `dev-fallback-diagnostics.txt`（真实主进程 dev 回退链）
- `invalid-entry-report.txt`（非法 `ANS_RENDERER_ENTRY` fail-fast）
- `local-smoke.json`（本地包 packaged smoke，14 项全 true）
- `entry-sha256.txt`（旧/新入口、main.ts、renderer-entry、packaged-smoke、main.mjs）

**状态**：5A 桌面窗口侧实施与 PM §19 重锚完成；5B 步骤 c（入口收敛/旧段退役/打包冒烟）完成。等待测试独立复验、PM 5B 门与独立验收；不是最终验收，不代表发布就绪。
