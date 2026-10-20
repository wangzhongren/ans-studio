---
id: queued-view-restore-deskui
type: change
title: 排队聚合残留「还有 N 个决定」——queuedRequests 移出 runtime view 快照
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
related: [w6-c, runtime-view, queued-requests, e2e-uiux-v2]
---

# 排队聚合残留修复：queuedRequests 不再随 runtime view 恢复（桌面UI）

## 0. 现象与根因

- 真机：主进程队列已 0，界面仍显示「还有 7 个决定等待前一个决定」。
- 根因：渲染侧 `queuedRequests`（`requestId → OperatorRequestPayload`）被写进
  `captureRuntimeView()` 并在 `installRuntimeView()` 恢复（原 renderer.js 约 1240/1255）。
  它是**运行期事实**，只应由主进程 `session:operator-queued`（重载后 `replayPending`）重建；
  写进视图快照后，切引擎/视图恢复会把已不存在的旧排队计数复活。`replayPending` 只增不减，
  不会替渲染侧清理旧 id。
- 本侧改动仅 `app/renderer/renderer.js`、`test/桌面应用/renderer.test.ts`、
  `test/桌面应用/e2e/uiux-v2.mjs`（新增离线模式）、本记录、`changelog.md`、证据目录。
  未改 `src/**`、`app/desktop/**`、`test/测试/**`；未 git 提交。

## 1. 修法

1. **移出快照**：`captureRuntimeView()` 不再包含 `queuedRequests`；`installRuntimeView()` 不再从
   `v.queuedRequests` 赋值（也不清空——后台投递的临时 install/restore 不打断当前运行期事实）。
   `opRequests`/`replayState`/pane/行表等既有状态照旧保留。
2. **切引擎清理**：`selectRuntime()` 安装目标视图后显式 `queuedRequests = Object.create(null)`，
   并调用 `renderQueueAggregate()`——目标视图的旧聚合行按「当前无排队」移除；若主进程仍有排队，
   会经 `replayPending`/`onOperatorQueued` 重推重建（新 id、新 count）。
3. **恢复完成清理**：`applyListing()` 末尾调用 `renderQueueAggregate()`；列举/恢复完成时若
   `queuedCountForProject() === 0`，移除 pane 里可能残留的 `.op-queue-aggregate`。
   `resetPanes()` 原有的 `queuedRequests = Object.create(null)` 保持不变。
4. **只读探针**：`window.__ansRenderer.queuedDebug()` 返回当前排队 id 列表（e2e 断言旧 id 不复活）。
5. **未动**：`opRequests`、replayState、回放去重、未决卡锚定、`onOperatorQueued`/`onOperatorExpired`
   的既有语义；聚合行文案仍经 `UiLabels.governanceQueueAggregateText`。

## 2. 测试与证据

### 2.1 单测（源码不变式）

`test/桌面应用/renderer.test.ts` 的 W6-C 用例扩展：

- `captureRuntimeView` 不得含 `queuedRequests`；`installRuntimeView` 不得 `queuedRequests = v.*`；
- `selectRuntime` 必须清空 `queuedRequests` 并调用 `renderQueueAggregate()`；
- `applyListing` 恢复完成调用 `renderQueueAggregate()`；`resetPanes` 清空排队事实；
- `renderQueueAggregate` 的 `n === 0 ⇒ el.remove()` 保留。

结果：**108 计 / 108 过**。

### 2.2 真实 Electron 离线夹具

`test/桌面应用/e2e/uiux-v2.mjs` 新增 `ANS_QUEUE_VIEW_UI_ONLY=1`（trio 夹具，不依赖治理角色显示名）：

```bash
ANS_QUEUE_VIEW_UI_ONLY=1 ANS_UIUX_OUTDIR=/tmp/ans-queue-view-final \
  ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
```

**QUEUE_VIEW_UI_PASS 4**，逐步覆盖：

1. 推入两条排队（stale-q1/stale-q2）⇒ 聚合「还有 2 个决定等待前一个决定」，`queuedDebug()` 两个旧 id；
2. 切到 codex 再切回 pi（runtime view 恢复）⇒ **聚合行消失、`queuedDebug()` 为空**（旧 id 不复活）；
3. 主进程重新推一条 fresh-q1 ⇒ 聚合按**新 count 1** 显示，且不含「2 个」、`queuedDebug()` 仅 fresh-q1；
4. 推 `session:operator-expired` 清空 ⇒ 聚合移除、`queuedDebug()` 为空。

**负向对照**：临时注释掉 `selectRuntime` 的 `queuedRequests = Object.create(null)` 与
`renderQueueAggregate()` 后，同一夹具在「runtime view restore does not revive old queued requests
or aggregate」失败（exit 1）；恢复后重新全绿（`TEMP-NEG` 已清零）。

证据：`docs/change/2026-10-20-queued-view-evidence/report.json`（4 项检查全 true；运行目录
`/tmp/ans-queue-view-final`，隔离 user-data）。

### 2.3 其余验证

- `node --test "test/桌面应用/**/*.test.ts"` → **679 计 / 679 过 / 0 红 / exit 0**。
- `npm run typecheck` → **exit 0**。
- 前一批空白兜底夹具复核：`ANS_BLANK_PANE_UI_ONLY=1` → **BLANK_PANE_UI_PASS 6 / exit 0**（无回归）。
- **已知环境红（非本批）**：`ANS_MIRROR_UI_ONLY=1` 在首个断言「W6-C four-role tree…」失败——
  现行产品治理角色显示名已改为「主理 Lead / 提案 Draft」等（其他角色在途改动），夹具仍断言
  「联络官 Liaison / 报告员 Rapporteur」旧名。与本批 queuedRequests 改动无关，本角色未改该断言。

## 3. 纪律

- 未 git 提交；未读 `.env`；未打印凭据；未修改 `src/**`、`app/desktop/**`、`test/测试/**`。
- 临时负向对照已还原（`grep TEMP-NEG` 为 0）。
