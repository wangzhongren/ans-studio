---
id: contract-schema-query-b0-baseline
type: change
title: contract schema query B0 基线记录
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 记录 B0 基线环境、工作树状态、双端 typecheck、三组受影响套件、T3 全量基线与 Electron 可运行性事实
  - date: "2026-11-03"
    kind: verified
    summary: 独立重跑 T3 全量至最终汇总（07-full-t3-rerun.log），与首次基线逐条一致；补齐 §六/§八/§九并记录记录自身哈希
---

# B0 基线记录：contract schema query（契约/schema 查询）

- **任务 ID**：`2026-11-03-contract-schema-query`（团队计划/方案/复核同 slug `contract-schema-query`）
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-03 / 团队计划 §五 **B0（基线）**
- **状态**：**B0 完成**。本记录只记录事实，**不实施、不验收、不判通过/返工**；不是独立验收结论。
- **入口**：按调度派发说明，客户已给实施授权（原话「授权实施：按团队计划与 P1.3 开始 V1 后的 B0/P1 与各阶段；不含提交/推送/发布。」）。团队计划 B0 入口为 **IA**；本记录不重新判定闸门，也不把实施授权当验收结论。
- **一句话事实**：HEAD `243d8f6a6db663a383b516aad6320c5110c7f583` / 分支 `release/v1.8.4-assets`；`src app test` 无本任务改动、暂存空；`npm run typecheck` 与 `typecheck:renderer` 均 exit 0；三组受影响套件合计 **72 tests / 72 pass / 0 fail / 0 skipped / 0 todo**；T3 全量基线 **3462 tests / 3435 pass / 9 fail / 18 skipped / 0 todo**（9 项均为既有 Windows symlink EPERM，exit 1，见 §六/§八）；同日独立重跑（12:07:01–12:11:31，269,457.4931 ms）计数、9 项失败与 18 项 skip 逐条一致（`07-full-t3-rerun.log`）；Electron 44.7.0 二进制与 dist 存在、本 worktree 无 Electron 进程，**未启动应用、未跑 E2E**；未 commit/push。

---

## 一、入口输入快照（只读核对）

| 项 | 实测值 | 与派发说明 |
| --- | --- | --- |
| 团队计划 | `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md`，**539 行 / SHA-256 `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c`** | 一致 |
| 方案 P1.3 | `docs/planning/2026-11-03_design_contract-schema-query.md`，**911 行 / `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85`** | 一致 |
| 独立复核 | `docs/planning/2026-11-03_review_contract-schema-query.md`，**282 行 / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`** | 观察值 |
| 沟通记录（观察值） | `docs/communication/2026-11-03_intent_contract-schema-query.md`，**124 行 / `3a27eec377022e077389b7f55a44ce95d9ed40eca61f77de8545847771168c99`** | 管理记录可能继续追加，只留观察值 |
| 实施前标准 V1 | `docs/acceptance/contract-schema-query-criteria-v1.md`：B0 开始时 **不存在**（独立验收上下文并行产出，不阻塞 B0）；B0 期间（12:05 前）已写盘，观察值 **725 行 / SHA-256 `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`** | P1 入口要求 V1 经沟通确认 + B0，由统筹核对 |

---

## 二、代码与工作树基线

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 分支 | `git branch --show-current` | `release/v1.8.4-assets` |
| HEAD | `git rev-parse HEAD` | `243d8f6a6db663a383b516aad6320c5110c7f583` |
| 产品/测试改动 | `git status --porcelain -- src app test` | **空**（B0 采集前后均为空） |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 其它工作树改动 | `git status --short` | `docs/communication/memo.md`、`docs/scheduling/memo.md` 修改；未跟踪：本任务沟通/方案/复核/团队计划 + 本 B0 证据目录——均为管理/治理文档，**非产品/测试候选** |
| 计划新增测试文件 | 受影响 6 文件逐路径检查 | 全部存在（详见 §五文件清单）；本任务按计划默认不新增独立测试文件 |

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| 时区 | Asia/Shanghai（记录内时间均 +08:00） |
| `node_modules` | 存在；`electron` **44.7.0** |

---

## 四、门禁命令结果

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 11:59:09–11:59:11 | **0** | 0 类型错误，无诊断 | `01-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 11:59:12–11:59:12 | **0** | 0 类型错误，无诊断 | `02-npm-run-typecheck-renderer.log` |

---

## 五、受影响套件基线

全部 `node --test --test-concurrency=1`，文件清单与派发逐字一致，均 exit 0。

| # | 层 | 文件组 | 起止（+08:00） | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排 | `test/编排/workflow-preconditions.test.ts`、`trio-worker-report.test.ts` | 11:59:17–11:59:20 | 26 | **26** | 0 | 0 | **0** | **0** | `03-suite-orchestration.log` |
| B | 桌面应用 | `test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 11:59:17–11:59:23 | 28 | **28** | 0 | 0 | **0** | **0** | `04-suite-desktop-app.log` |
| C | 门禁引擎 | `test/门禁引擎/view-image-cards.test.ts`、`list-project.test.ts` | 11:59:17–11:59:22 | 18 | **18** | 0 | 0 | **0** | **0** | `05-suite-gate-engine.log` |
| **合计** | — | — | 11:59:17–11:59:23 | **72** | **72** | **0** | **0** | **0** | **0** | — |

---

## 六、T3 全量基线

本轮对团队计划 §7.2 的命令做了两次独立运行：首次基线 `06-full-t3.log`（11:59–12:04）与复核重跑 `07-full-t3-rerun.log`（12:07–12:11）。两次计数、失败与 skip 逐条一致；重跑使用 §7.2 命令原文（不含 `| sort`），首次运行附加 `| sort` 仅为固定文件顺序。

| 项 | 首次基线（`06-full-t3.log`） | 复核重跑（`07-full-t3-rerun.log`，本轮实测） |
| --- | --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（§7.2 逐字） |
| cwd | worktree 根（Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300 Git Bash） | 同左 |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`） | **393** |
| 起止（+08:00） | 11:59:32–12:04:26 | **12:07:01–12:11:31** |
| 耗时 | 294,130.9777 ms ≈ 4 分 54 秒 | **269,457.4931 ms ≈ 4 分 29 秒** |
| 退出码 | **1**（因 9 项既有环境失败；非运行错误） | **1**（同上） |
| 计数 | **tests 3462 / pass 3435 / fail 9 / cancelled 0 / skipped 18 / todo 0** | **tests 3462 / pass 3435 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 失败分类 | 9 项全部既有 Windows symlink EPERM（§八）；新增确定性失败 0 | 9 项与左侧逐条相同；新增确定性失败 0 |
| skip | 18 项既有平台 skip；新增 0 | 18 项与左侧逐条相同；新增 0 |
| 原始日志 | `06-full-t3.log`（4,564 行 / 511,128 B / `5c2dcd7f…`） | `07-full-t3-rerun.log`（4,564 行 / 511,110 B / `388a52a2…`） |

文件清单：两次运行的排序清单均为 393 行、集合逐字节相同（`06-full-t3-file-list.txt` 与 `07-full-t3-rerun-file-list.txt` 的 SHA-256 同为 `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce`；`diff` 为空）。

排除项（不得当作通过）：

- `test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s），排除依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 与团队计划 §7.2；两轮**均未运行、行为未验证**。排除命令即上述 `find ... ! -name 'write-sequencing.test.ts'`。

18 项 skip（两轮逐条相同，均为既有平台 skip）：codex-adapter 1、pi-adapter 1、runtime-core file-write-safety 4、runtime-core lightweight-permission-repairs 6、门禁引擎 pin-evidence 1、shared atomic-write 5。完整清单见 `07-failure-classification.txt` 与 `07-full-t3-rerun-failure-classification.txt`。

口径说明：沟通记录「B0 状态」一节曾描述 `06-full-t3.log` 无最终汇总、尾部停在单个用例。本轮亲自核对当前文件（4,564 行 / 511,128 B / `5c2dcd7f…`）：已含完整 `ℹ tests/pass/fail/cancelled/skipped/todo/duration_ms` 汇总与 `end:`/`exit_code:` 包装行；该描述对应日志收尾前的中间状态，已由沟通记录随后的「B0 核对记录」更新。

---

## 七、Electron / E2E 可运行性（仅事实，不启动）

本任务不要求运行真实 Electron/E2E；B0 只记录可运行性事实：

| 项 | 实测值 |
| --- | --- |
| Electron 包版本 | **44.7.0** |
| Electron 二进制 | `node_modules/electron/dist/electron.exe` **存在**（`require('electron')` 解析到本 worktree 该路径） |
| 渲染入口（忽略产物） | `app/renderer/dist/index.html` **存在**；SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f`；`assets/index-HVZOxqQQ.js` 1,325,286 B、`assets/index-haa4j9RY.css` 152,847 B；`git check-ignore` 确认属 `.gitignore:9`，`git ls-files app/renderer/dist` = 0 |
| 本 worktree Electron 进程 | **0**（未启动应用） |
| 已执行 | `node -e` 级别的版本/路径存在性检查；**未启动应用、未运行 E2E、未截图、未录屏** |

---

## 八、失败清单与分类

T3 全量两轮均 **9 项失败，全部为既有 Windows symlink `EPERM`（errno -4048）环境失败**。重跑（07）与首次基线（06）按「测试文件:行 + 测试名」逐条比对，规范化 `diff` 为空；数量与历史记录一致（`docs/acceptance/acceptance-rework-routing-criteria-v1.md:165` 记「最近基线 9 项」；`角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md:102` 记「历史全量基线 9 项」，分布于 claude/codex/pi/runtime-core/编排）。

| # | 文件:行 | 测试名 | 错误类型与原始要点（重跑 07） | 分类 |
| --- | --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | `EPERM`（errno -4048），`syscall: symlink`（异步 `fs/promises`）；`ans-claude-test-paNCeh` → `…\.ans\sessions\claude-fixture\claude\native` | **既有** |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | `EPERM`（errno -4048），`syscall: symlink`（异步）；`ans-codex-tests-rm5FX8` → `ans-codex-tests-fc0FBO\.ans\sessions\codex-fixture\codex\native` | **既有** |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | `EPERM`（errno -4048），`syscall: symlink`（异步）；`p1-injection-PxLkka\outside` → `…\.ans\sessions\Pi适配器\pi\native` | **既有** |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | `EPERM`（errno -4048），`syscall: symlink`（异步）；`p1-injection-jxZWO8\outside.jsonl` → `…\native\link.jsonl` | **既有** |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | `EPERM`（errno -4048），`syscall: symlink`（异步）；`ans-core-d3-4N9IH1\actual\nested\file.txt` → `…\actual\link.txt` | **既有** |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | `EPERM`（errno -4048），`syscall: symlink`（异步）；`ans-store-Hyrnx2` → `ans-store-s7u7UN\.ans\sessions\role\codex` | **既有** |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | `EPERM`（errno -4048），`syscall: symlink`（异步）；`ans-store-3VMgYL` → `ans-store-yDXEcz\.ans\sessions\core\codex\native` | **既有** |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | `EPERM`（errno -4048），`symlinkSync`（同步 `node:fs:1937`）；`g4-outside-P82Stv` → `g4-render-ZpUxoh\docs\skills\link` | **既有** |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 | `EPERM`（errno -4048），`symlinkSync`（同步 `node:fs:1937`）；`ans-routine-outside-pO6wOj\outside.test.ts` → `ans-routine-paths-uQDyWN\test\external.test.ts` | **既有** |

- **新增确定性失败：0**（重跑 9 项与 06 逐条相同，无未知失败）；**新增 skip：0**（18 项 skip 与 06 逐条相同，均为既有平台 skip）。
- 本基线只含既有环境红；D1 以本记录为对照，判定「新增确定性失败 0、新增 skip 0」。这些失败**不算通过，也不计入新失败**。未删除/放宽任何测试或断言。
- 排除项：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，两轮均未运行；排除命令 `find test -name '*.test.ts' ! -name 'write-sequencing.test.ts'`，理由见 §六（历史 39+ 分钟无进展、CPU 约 2339s）。
- 原始失败堆栈见 `07-failure-classification.txt`（首次）、`07-full-t3-rerun-failure-classification.txt`（重跑）、`06-full-t3.log` 与 `07-full-t3-rerun.log`。

---

## 九、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-baseline.txt` | 75 | 3,620 | `45c863a85711b993b04d1f1df26958e1f67fb4a4defba7109da6f1d7926aeee0` |
| `01-npm-run-typecheck.log` | 9 | 233 | `cbec81706703aa5a1ec0babd185acaacdeacac7d8b655644a59bce39ec63fcc1` |
| `02-npm-run-typecheck-renderer.log` | 9 | 272 | `0aa2dbf9db725f6c2c36bef605809c5c40688062badd758603c448a69f1104ef` |
| `03-suite-orchestration.log` | 39 | 3,319 | `a276ee6a8c4f2d3b578323ba7e2626914f4cb3eae7830db902c10637efe78b6a` |
| `04-suite-desktop-app.log` | 41 | 3,284 | `f8ffc4849208eb46df1bf0cc14de5d3b863983cf17afe70514ff34b1041bd27f` |
| `05-suite-gate-engine.log` | 31 | 2,332 | `f4658450a52c7914703713d09aad77ae63e43908c106bfb92baa6e161f8dd95a` |
| `06-full-t3-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `06-full-t3.log` | 4,564 | 511,128 | `5c2dcd7f7b774914ee750e5b2ad71478ea1d02fead0ea0df44cf4630571a9400` |
| `07-failure-classification.txt` | 188 | 13,626 | `05e657b9a2ad5cda639d17636f5b358f8ad96df6183e9594231c2b5117275623` |
| `07-full-t3-rerun-failure-classification.txt` | 197 | 14,422 | `53419555e68b1f27694f194e42d1f009532493c1f5bce838bbed92ca36e00312` |
| `07-full-t3-rerun-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `07-full-t3-rerun.log` | 4,564 | 511,110 | `388a52a2c4a0356959e5226d16f50fd0023039935f322cf055de6908482aca9c` |
| `08-post-run-verification.log` | 27 | 1,299 | `6012764b0ee074338323f8d7a5163c322deee22d9806e93d53c2fe27bb3f42de` |
| `09a-v1-observation.txt` | 1 | 122 | `ba4ec6b0529635cb24dce397b1de2d048c567cd1e63a7cf3f26116d87453ae89` |
| `09-inventory.txt` | 16 | 1,303 | `84f75753c2061bbf600b2637b351cc0cb323c8416d15c9021c10299ec0f32fd7` |

本轮新增 `07-full-t3-rerun.log`、`07-full-t3-rerun-file-list.txt`、`07-full-t3-rerun-failure-classification.txt` 三个文件；既有 12 个文件未改动、哈希与首次写盘记录一致（目录现共 15 个文件）。重跑日志首尾包装行含 `command:` / `file_count:` / `cwd:` / `start:` / `end:` / `exit_code:`，可按 §六 命令复算。

---

## 十、B0 出口核对（只报事实）

- 基线命令/环境/计数/失败分类可复算：**是**（§三–§六、§九）。
- 确认产品/测试无本任务改动：**是**（§二；采集前后 `git status --porcelain -- src app test` 均空）。
- Electron/E2E 可运行性：**已记录事实（二进制/dist 存在、无运行进程），未启动**（§七）。
- T3 全量基线：**3462 tests / 3435 pass / 9 fail / 18 skipped / 0 todo，exit 1**；首次 294.1s（`06-full-t3.log`）与独立重跑 269.5s（`07-full-t3-rerun.log`）计数、9 项失败与 18 项 skip 逐条一致；9 项全部为既有 Windows symlink EPERM；`write-sequencing.test.ts` 已排除并记录命令/原因；新增确定性失败 0、新增 skip 0（§六/§八）。
- 未 commit / 未 push / 未改产品代码 / 未改其他角色或治理文档 / 未接触客户。
- 本记录不是验收结论；AC 判定属独立验收 E2。
- **记录版本**：本记录最终 **189 行**（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：`1c89e14ac434edf86c5859bec4274d7eec110cb24c2ecde809b9fdf06a8b70e2`。
