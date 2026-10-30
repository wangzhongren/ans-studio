# 基线记录：回合级重试与网络状态监听（turn-retry-network-watch）S1 实施前基线

- **任务 ID**：`2026-10-30-turn-retry-network-watch`（产品 flowId `turn-retry-network-watch`）
- **记录角色**：测试（Testing）S1 基线职责；由本波实施上下文按统筹派发执行（团队计划 §3.8 / §5.2 W0）
- **日期**：2026-10-30
- **阶段**：P0 开工前 S1 基线冻结（团队计划 §四 4.0/4.2；§五 5.1/5.3）
- **风险档位**：P0 **T3**
- **状态**：**基线（baseline-recorded）**；未实施、未验收；本记录只陈述实施前实测，不构成任何验收结论
- **授权依据**：
  - 闸门 0/1：`docs/communication/2026-10-30_intent_turn-retry-network-watch.md`（客户「确认 A 全套（推荐）」；默认自动中止 0、T1/1h 不变）
  - 闸门 2 + P0 实施授权：同文件「闸门 2 确认与实施授权记录（2026-10-30，P0）」（团队计划 v1 517 行；SHA-256 `69de90a1d400d64075eaaed207e4e41e1eb9a418c5e1f73b31af72fa02e76809`）；P1–P3 授权另行
  - 方案 v1.1：`docs/planning/2026-10-30_design_turn-retry-network-watch.md`（648 行；SHA-256 `980178be0908afcf74d9fc1ea6fd3192f0609329500603ea0ac96a742bdfe299`）
  - 现场证据：`docs/communication/2026-10-30_intent_flow-improvements-after-wuxia-run.md`「运行观察」三节（17:28 busy 楔死；19:04–19:08 停止按钮 10+ 次 ~1ms ok 但零变化）
- **基线身份**：worktree `.claude/worktrees/turn-retry-network-watch`，分支 `feat/turn-retry-network-watch`，HEAD `c001ce206a588d4f71dd9b46a8eaca1a7c6d5588`（tree `a24ffaa2d35ad3ad196403ef8bd86974cde32b2b`；`merge: wave2 §5A intent-entry contract visibility`；含 Delta-TR-2 边界 6 文件授权）
- **工作树前提**：`git status` 起始为空（仅本证据目录未跟踪）；S1 全程未改任何产品/测试源码

---

## 一、环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-30 19:49:03 +0800（环境快照）；全量 19:49:20 → 19:53:33 | `environment.txt` |
| OS / Shell | Windows 11 Pro 10.0.26300；`MINGW64_NT-10.0-26300 ... 3.6.10-710e5275.x86_64`（Git Bash） | `environment.txt` |
| Node / npm | **v24.22.1 / 11.19.1** | `environment.txt` |
| Electron | **44.7.0**（`node_modules/electron`） | `environment.txt` |
| 仓库 | `.claude/worktrees/turn-retry-network-watch`；分支 `feat/turn-retry-network-watch` | `environment.txt` |
| HEAD / tree | `c001ce2…` / `a24ffaa2…` | `environment.txt` |

---

## 二、S1 基线结果（实施前）

### 2.1 全量回归

| 项 | 值 |
| --- | --- |
| 命令（实际） | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` |
| cwd | 本 worktree 根 |
| 文件数 | **358**（全部 `*.test.ts` 359，排除 `test/pi-adapter/write-sequencing.test.ts` 1 个——历史已知挂起，沿用既有排除口径） |
| 结果 | **tests 3077 / pass 3050 / fail 9 / skipped 18 / todo 0** |
| 退出码 / 耗时 | **1** / 246,779 ms |
| 原始日志 | `full-regression-serial.log`（SHA-256 见 `sha256.txt`） |
| 失败分类 | **9 项全部为既有 Windows symlink `EPERM`**（errno -4048；claude 1、codex 1、pi 2、runtime-core 3、编排 2），与 §5A 记录 `3077/3050/9/18` 及本地基线一致；**无其他确定性失败、无新增 skip/todo**（详见 `full-regression-summary.txt`） |
| 跳过 18 | 既有平台跳过（file-write-safety 4、lightweight-permission-repairs 6、codex 1、pi 1、pin-evidence 1、atomic-write 5） |

### 2.2 类型检查与构建

| # | 命令 | 退出码 | 错误数 | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | 0 | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | 0 | `typecheck-renderer.log` |
| 3 | `npm run build:renderer` | **0** | —（built in 493ms） | `build-renderer.log` |

### 2.3 真实 Electron E2E

| 项 | 值 |
| --- | --- |
| 命令 | `ANS_E2E_PROJECT=<worktree root> ANS_E2E_OUTDIR=electron-e2e node_modules/.bin/electron test/桌面应用/e2e/main.mjs` |
| 结果 | **E2E_PASS=true**；`E2E_FAILURES` 空；退出码 0 |
| 截图 | **18 PNG**（`electron-e2e/*.png`；逐文件 SHA-256 `electron-e2e-screenshots.sha256`） |
| 报告 | `electron-e2e/report.txt`（摘要 `electron-e2e-summary.txt`） |

### 2.4 渲染 smoke（phase5a，P0 必跑）

| 项 | 值 |
| --- | --- |
| 命令 | `node_modules/.bin/electron test/桌面UI/phase5a-electron-smoke.mjs "" phase5a-smoke` |
| 结果 | **40/40 checks，failures=0**；退出码 0 |
| 报告 | `phase5a-smoke/report.json`（摘要 `phase5a-summary.txt`） |

### 2.5 目标项目零写入核对

- `C:/Users/51054/Desktop/work/jinyong-rogue-2d`：前后元数据指纹仅 header 时间行不同，**零文件变化**。
- `C:/Users/51054/Downloads/test`：前后元数据指纹差 178 行——**全部来自该项目的在线 ANS 会话外部写入**（`.ans/sessions/**`、`.ans/state/**` 持续增长，项目角色同时在写 `src/`、`tests/`、`docs/`；窗口内 mtime 连续推进）。基线命令对目标项目**零引用零写入**：`test/` 源码 grep `Downloads/test` = 0；全部基线日志 grep 同一路径 = 0；全量用 `%TEMP%` 夹具；E2E 的 `ANS_E2E_PROJECT` 指向本 worktree、输出目录为本证据目录。
- 结论：**本基线对两个目标项目零写入**；`Downloads/test` 的外部变化如实记录、不归因于本基线。详见 `target-zero-write.txt`。

---

## 三、P0 写集起始哈希（写前基线）

见 `target-file-hashes-before.txt`（路径 | `git hash-object` | `sha256` | 字节数）。涵盖 `app/desktop/{session,watchdog,interface}.ts`、`app/main.ts`、`app/preload.cjs`、渲染 `chat/`、`shell/`、i18n messages 与受影响测试的起始内容。P0 候选只应包含相对该表变化的写集内文件。

---

## 四、基线结论

1. **基线可用**：双 typecheck 0、build 0；全量 3077/3050/9/18，确定性失败恰为 9 项既有 Windows symlink `EPERM`；真实 Electron `E2E_PASS=true`（18 PNG）；phase5a 40/40；目标项目零写入。
2. **P0 红旗线**：新增确定性失败 = 0；不删测、不放宽断言、不新增 skip/todo。9 项 EPERM 与 18 项平台 skip 单列对照，不得掩盖。
3. **基线不评价 §5A**：`c001ce2` 已含 §5A 合同可见性合并；本波 P0 不触改 §5A 专属段（`src/common/shared/intent-entry-contract.ts`、四卡契约句、contract_check 契约段/事实、显式 intentId 解析）。
4. **排除项**：`test/pi-adapter/write-sequencing.test.ts`（3 例）不纳入计数（已知挂起，沿用历史口径）。
5. 本记录不是候选、不是验收报告；不宣布任何变更通过。

---

## 五、证据边界声明

- 未启用 task_ops；不伪造任务令牌/锁/审批。
- 未改产品/测试源码（`git status` 仅本证据目录）；未修改断言；未新建 `test/桌面应用/` 文件。
- 未使用真实 `.env`/凭据/客户账号；全部夹具为临时目录/loopback。
- 未 commit/push/合并/发布（本基线随后单独提交为 `test(baseline): freeze turn-retry-network-watch S1 baseline`）。
- 写入边界：仅 `角色卡/测试/docs/change/`（本记录 + 证据目录）。

---

## 六、证据文件

目录：`角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 日期/机器/Node/npm/Electron/HEAD/tree/状态 |
| `target-file-hashes-before.txt` | P0 写集起始 `git hash-object` + `sha256` + 大小 |
| `full-regression-file-list.txt` | 358 文件清单 |
| `full-regression-serial.log` | 全量原始 stdout/stderr（3077/3050/9/18；exit 1） |
| `full-regression-summary.txt` | 计数、9 失败分类、18 skip 分类、排除说明 |
| `typecheck.log` / `typecheck-renderer.log` / `build-renderer.log` | 双类型检查与渲染构建原始输出 |
| `typecheck-summary.txt` | 三条命令退出码摘要 |
| `electron-e2e.log` / `electron-e2e-summary.txt` / `electron-e2e/report.txt` | 真实 Electron E2E 原始日志、摘要、报告 |
| `electron-e2e-screenshots.sha256` | 18 张截图逐文件 SHA-256 |
| `phase5a.log` / `phase5a-summary.txt` / `phase5a-smoke/report.json` | phase5a smoke 原始输出、摘要、40 项检查报告 |
| `target-test-files-before.txt` / `target-test-files-after.txt` | `Downloads/test` 前后只读元数据指纹 |
| `target-jinyong-files-before.txt` / `target-jinyong-files-after.txt` | `jinyong-rogue-2d` 前后只读元数据指纹 |
| `target-zero-write.txt` | 零写入方法与归因说明 |
| `sha256.txt` | 证据目录全部文件 SHA-256（收尾生成） |
