---
id: acceptance-return-card-a5-baseline-fix
type: change
title: 验收回交卡 A5 基线修复：phase4b harness 适配当前 DOM
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: 修复 phase4b 过期治理/operator 镜像断言；官方 phase4b PASS 64/64
  - date: "2026-11-02"
    kind: implemented
    summary: 仅改 phase4b harness；A5 15 项块指纹不变；官方 E2E 通过；未 commit/push
---

# 验收回交卡 A5 基线修复记录：phase4b harness 适配当前 DOM

- **实施角色 / 上下文**：桌面UI（渲染层测试/夹具），本上下文只承担该角色。
- **性质**：统筹授权的 **A5 同写集基线修复**（仅 `test/桌面UI/phase4b-electron-smoke.mjs`），用于解除官方 phase4b 的过期基线阻塞；**不是 A5 夹具重写**。
- **状态**：**implemented-unverified**。官方 `phase4b-electron-smoke.mjs` 已 **PASS 64 checks / 0 failures**（exit 0）；A5 的 15 项断言**逐字未改**（326 行块指纹不变）。未 commit/push、未接触客户、未判验收。

## 一、基线事实与前后哈希

| 阶段 | `test/桌面UI/phase4b-electron-smoke.mjs` | 行数 | git hash-object | SHA-256 |
| --- | --- | --- | --- | --- |
| HEAD 原始 | 含过期治理/镜像检查 | 967 | `565499b29a00e9643fda186b0639b368eec77172` | `6a30fd39f6d1fa1fa433a5ed674335b898f3f3640974359919f4b9cedb05f7c4` |
| A5 追加后（修复前） | A5 15 项块 + 原有过期检查 | 1293 | `91f5ccced5e6c0feedb1b85948134c66359ca0d2` | `b3dd05a91fb45b9d9e0cf1dd7dcf70b257ef1ebcdeddcbb3e1cc3ee22c1e347e` |
| **基线修复后（当前）** | 过期检查已适配/移除；A5 块不变 | **1209** | **`580745d1d0ffed4ce6eb5221ebf9a3892e97e7e5`** | **`bc6d1c7eb770023494ad530b1386c35320322bd1a98befd02e026f07b2a86daf`** |

- 整体 diff（vs HEAD）：`+359 / −117`，仅此文件。
- **A5 15 项块指纹**：修复前/后均为 326 行 / SHA-256 `b9cac689649ad593ebeec5c7d746eac9e400a7fbae5b0fe2af6fb3742cd82bb0`（未改）。
- 编辑前官方失败：`PHASE4B_SMOKE FAIL 1 checks / 1 failures`；首检查读取 `#governance-status`，而该治理 UI 已由 commit `98d3fe2` 移除（当前 `app/renderer/src` 无生产者，仅遗留 CSS）。失败在 A5 块之前，属 harness 基线过期。

## 二、过期检查处置清单

| 位置（修复前） | 过期原因 | 处置 |
| --- | --- | --- |
| 首检查 `five-role listing shows governance model trio and verifier` | `#governance-status` 已删除 | 改为 `five-role listing shows trio model and verifier`：当前等价事实 `window.__ansRenderer.state.governanceModel==='trio'` + 左树 verifier 行；保留原意图（trio + verifier）。 |
| Section 2 排队聚合文本 | 当前 `QueueAggregateRow` 只显示计数（`.sys-text` = `2`/`1`），不再有旧句「还有 N 个决定等待前一个决定」 | 断言改为 `.sys-text` 精确 `2`/`1`；保留唯一聚合行、无按钮、`queuedDebug` 顺序断言。 |
| Section 3 镜像/双面冻结 | 旧聊天流 `.op-mirror-*`/`.op-actions` 镜像卡已由 E 批独立决定对话框替换 | 替换为当前等价：`#decision-dialog` 单卡 + `.sys-operator-note` 聊天系统通知 + 无聊天按钮；对话框作答一次后通知显示「已处理」；保留“只答一次”语义。 |
| Section 4 排队卡 | 旧 `.op-queued`/`.op-actions` 聊天卡已移除 | 替换为当前等价：`.sys-operator-note` 显示标题/待处理、聊天无按钮、`pendingOperator[id].queued===true`；若有对话框则「稍后处理」，不代答。 |
| Sections 5–7 治理记录（pin-mismatch / establish / migrate） | `#governance-status`/`#governance-preview`/`#governance-migration` 随 `98d3fe2` 移除；当前无 DOM 等价物 | **删除**（不新增假 pass/skip），原因记录于本文件；相关 IPC 桩保留但不再作为断言。 |
| Section 14 锚点卡 `.op-deny`/`.op-confirm`/`.op-note` | 旧聊天可操作卡已移除 | 替换为当前等价：对话框 `.dd-reject` 作答一次；聊天 `.sys-operator-note` 显示「已处理」无按钮；仍保留 `replayAnchorDebug`/`rowModelDebug` 的 requestIndex/conclusionIndex 与 full rebuild DOM 复用断言。 |
| 200% 容器选择器 `.runtime-config-notice` | 页面新增 `#run-change-notice` 且同样带该 class，旧选择器命中了隐藏的第一个 | 改为精确 `#runtime-config-notice`。 |
| 200% 缺配条检查 | 旧检查在 notice 隐藏时无法验证换行；且 `.runtime-config-notice` 多元素 | 先 `window.__ansRenderer.loadPiConfig()` 触发当前引擎缺配读取，再用 `#runtime-config-notice`/`#runtime-config-message`/`#runtime-config-settings` 断言可见、换行、不裁切、按钮在视口；保留原意图。 |
| 200% 治理预览段 | 治理 UI 已移除 | **删除**（原因同上），不新增假 pass/skip。 |

- 未删除/改写 A5 的 15 项断言；未新增 skip/todo；未改产品源码、A2/A3/A4 文件、其他 E2E/测试、角色卡/边界/治理 docs。
- 旧 `.op-*` 相关 IPC 桩/`calls` 字段无断言依赖的部分保留（fixture 兼容），不伪造结果。

## 三、官方 phase4b 结果（当前候选）

| 项 | 值 |
| --- | --- |
| 命令 | `node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/tmp/a5-phase4b` |
| 时间（+08:00） | 2026-11-02T16:18:55 → 16:19:10 |
| 结论 | **PHASE4B_SMOKE PASS 64 checks / 0 failures** |
| 退出码 | **0** |
| console errors / CSP violations | **0 / 0** |
| 截图 | 13 张（含 A5 4 张：handback / delivery / dialog-200pct / report-200pct）；窗口 1360×860、960×620，200% 段 zoom=2；无 DEBUG 覆盖层 |
| 原始日志 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A5-evidence/07-phase4b-after-baseline-fix.log`（75 行 / `77c080f8bbea2c46665c5cfc8af0b315551e0aa927f8d9a58d54879bd8e3345a`） |
| report.json | `.../A5-evidence/08-phase4b-pass-report.json`（64 checks / 0 failures / 13 screenshots / 0 console error / 0 CSP；`07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e`） |
| 截图目录 / 清单 | `.../A5-evidence/screenshots/`（13 PNG） + `09-screenshots.sha256`（13 行 / `791e7c6bcdd4c34860d62fa714dbc8f44f6724cf9a547e55b1e74ece8c6629a1`） |

A5 4 张关键截图（sha256）：

- `a5-acceptance-handback.png` `65ff33bb38d96150c06929935e069cd498f5392b9e71812ff29b1465dc784aad`
- `a5-acceptance-delivery.png` `0e1eba76b4aef016f99c60a7a37ea8c4b9a59fdbd662f97fa2913e615589d772`
- `a5-acceptance-dialog-200pct.png` `d8dce81c7c39c211bdb7b89530f293eb2aefb8b6ce9ff41ceca6bc067864348e`
- `a5-acceptance-report-200pct.png` `47e6c62c1d9fd7844daa264e3b169bfafd280d122161df4e6b154a2f1269fd63`

## 四、仍存在的基线/限制

- **官方 phase4b**：当前 64/64 通过，无已知失败；A5 断言全部在官方运行中通过（日志尾部 15 项均为 true）。
- **uiux-v2**：默认运行仍有既有基线失败（`role geometry 1360` 与未注册 IPC handler `session:role-states`/`network:get-state`/`preferences:get`/`background-tasks:list`）；该文件不在本次授权写集，**未修改**，不影响官方 phase4b 结论；D1 若需该 harness 须另行修复/授权。
- **A5 记录**：原 `...-A5-implementation.md` 写于修复前，其中“官方 harness 不可跑通”是当时事实；本记录为后续状态，不回溯改写原记录。
- 未 commit/push、未接触客户、未判验收；状态 implemented-unverified，最终由 D1/E2 按 V1 判定。

## 五、写集与纪律

- 本上下文写盘：`test/桌面UI/phase4b-electron-smoke.mjs`；`...-A5-baseline-fix.md`；`A5-evidence/` 下 07/08/09 与 screenshots（及先前 A5 记录/日志）；`memo.md` 状态。
- 未写：产品源码、A2/A3/A4 文件、`app/**`、`src/**`、`uiux-v2.mjs`、`main.mjs`、其他角色测试、角色卡/边界/治理 docs。
- `git diff --cached --name-only` 为空；临时 debug 副本与 preload 调试注入已删除/还原（`phase4b-smoke-preload.cjs` 无 diff；`phase4b-a5-debug.mjs` 不存在）。
