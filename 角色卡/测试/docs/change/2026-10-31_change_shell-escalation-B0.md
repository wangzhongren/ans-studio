# 基线记录：shell 判拒后的客户确认通道（shell-deny-customer-escalation）B0 实施前基线

- **任务 ID**：`2026-10-31-shell-deny-customer-escalation`（T3）
- **记录角色**：测试（Testing）
- **日期**：2026-10-31
- **阶段**：B0 实施前基线（团队计划 §5.1/§5.3；§六 T3 验证口径）
- **风险档位**：**T3**
- **状态**：**baseline-recorded（基线已记录）**；本记录只陈述实施前实测，不构成任何验收结论
- **授权依据**：
  - 闸门 0/1/2 与实施授权：`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（78 行；SHA-256 `11f0c3272d5daaa0d1c9c74315df7f8d7ec016522089996a7cd50ebeea986a97`）
  - 客户确认方案 v1.3：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行；SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`）
  - 团队计划：`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行；SHA-256 `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）
  - 实施前验收标准 V1：`docs/acceptance/shell-escalation-criteria-v1.md`（1320 行；SHA-256 `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`）
- **基线身份**：worktree `.claude/worktrees/flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `9f670fb2c7d403baf995071055d697c50714c905`（tree `580df4b215330c5f171c2f4dbc48cd491c53f561`）
- **工作树前提**：B0 全程未改产品源码、测试、配置、角色卡或边界；`git diff --cached --name-only` 为空；`git status --short -- src test app` 为空。既有变更仅 H1 边界条目（7 个治理文件）、两份 memo 与 5 份未跟踪管理文档（详见 §三.1）。

---

## 一、环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-31 21:06:41 +0800 起；全量 21:07:57 → 21:12:21 | `git-state.log`、`full-suite-meta.log`、`full-suite-exit.txt` |
| OS / Shell | Windows 11 Pro 10.0.26300；MINGW64 / Git Bash 3.6.10-710e5275.x86_64；`SHELL=/bin/bash.exe`、`MSYSTEM=MINGW64` | `env.log` |
| Node / npm | **v24.22.1 / 11.19.1** | `env.log` |
| Git | 2.55.0.windows.5 | `env.log` |
| 平台 | win32 x64（`process.platform`/`arch`/`os.release()` = win32 x64 10.0.26300） | `env.log` |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1` | `env.log` |
| HEAD / tree | `9f670fb2…` / `580df4b2…` | `git-state.log` |
| 依赖安装 | `npm ci --no-audit --no-fund` 已在本 worktree 执行：exit 0，526 packages，31s；日志 `npm-ci.log`（`wc -l` = 14；末行无换行，显示 15 行；SHA-256 `f45de6aa311da568f40cab16f36848d9f3cab78321e5ec9e31fa3a1b4dda20e0`） | `npm-ci.log` |
| Electron | 包 `electron@44.7.0` 存在，但 `node_modules/electron/dist/` 与 `node_modules/electron/path.txt` **缺失**，`node_modules/electron/dist/electron.exe` 不存在（D2 真实 E2E 环境缺口，B0 只记录不处理） | `env.log` |
| npm allowScripts | `npm ci` 报告 4 个依赖 install script 未被 allowScripts 覆盖：`@google/genai@2.21.0`（preinstall）、`electron-winstaller@5.4.0`（install）、`esbuild@0.28.2`（postinstall）、`protobufjs@7.6.6`（postinstall） | `npm-ci.log` |
| task_ops | **未启用**：`.ans/project.json` 不存在（`.ans/` 目录仅含 `sessions/`）；本记录不伪造任何机器状态 | `env.log` 补记 |
| 写入范围 | 仅本文件（`角色卡/测试/docs/change/2026-10-31_change_shell-escalation-B0.md`）；原始日志写入仓库外临时目录 | 本记录 |

---

## 二、输入文档核验（B0 冻结）

| 文档 | 行数 | SHA-256 | 与任务卡/沟通记录对照 |
| --- | --- | --- | --- |
| `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（方案 v1.3） | 857 | `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` | 与任务卡、沟通记录闸门 1 一致 |
| `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（团队计划） | 575 | `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203` | 与任务卡、沟通记录闸门 2 一致 |
| `docs/acceptance/shell-escalation-criteria-v1.md`（实施前验收标准 V1） | 1320 | `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b` | 与任务卡、沟通记录 V1 核验一致 |
| `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（闸门/授权记录） | 78 | `11f0c3272d5daaa0d1c9c74315df7f8d7ec016522089996a7cd50ebeea986a97` | 含闸门 0/1/2、实施授权、V1/H1 核验 |

原始命令与输出：`input-hashes.log`（15 行；SHA-256 `374736b87c4210f554a1c3a3b69a7282b7724f570eb51aa8b7c6165f4d4e3395`）。

---

## 三、命令与结果

### 3.1 仓库状态

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `git rev-parse HEAD` | 0 | `9f670fb2c7d403baf995071055d697c50714c905` |
| `git status --short` | 0 | 9 个已修改：7 个 H1 治理文件（`角色卡/桌面窗口/boundary.md`、`boundary.yaml`、`changelog.md`；`角色卡/编排/boundary.md`、`changelog.md`；`角色卡/门禁引擎/boundary.md`、`changelog.md`）+ `docs/acceptance/memo.md`、`docs/scheduling/memo.md`；5 个未跟踪管理文档（见下） |
| `git diff --cached --name-only` | 0 | 空 |
| `git status --short -- src test` | 0 | 空（无产品代码/测试改动） |
| `git diff --stat` | 0 | 9 files changed, 32 insertions(+)，全部为治理/memo 文档 |

未跟踪的 5 份管理文档（B0 输入或治理记录，非产品代码）：`docs/acceptance/shell-escalation-criteria-v1.md`、`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`、`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`、`docs/planning/2026-10-31_review_shell-deny-customer-escalation.md`、`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`。

原始输出：`git-state.log`（37 行；SHA-256 `977a0a4c4b22519284850c8a9f1c08f6fc6fbb9b0e4bee7ff8d61147a7b28396`）。

### 3.2 类型检查与渲染构建

| # | 命令 | 退出码 | 结果 | 日志（行数 / SHA-256） |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | 0 错误 | `typecheck.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| 2 | `npm run typecheck:renderer` | **0** | 0 错误 | `typecheck-renderer.log`（4 / `dddee1c8ed7a0c6f76fba926ae9f6de01643f83dbecf8fd46213642f48226cc6`） |
| 3 | `npm run build:renderer` | **0** | vite v8.3.4，2793 modules transformed，built in 501ms；输出 `app/renderer/dist/`（git 忽略，未进入 `git status`） | `build-renderer.log`（22 / `e3564f1c2101cdc3308e49927d4137a8b6c4a81b2ad8136e49951a9afc568de1`） |

构建告警（非失败）：chunk > 500 kB；`decision-center-store.ts` 动态导入同时被静态导入，动态导入无法单独分块。

### 3.3 受影响层基线

| 层 | 命令 | 退出码 | tests | pass | fail | skip | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"` | 0 | 277 | 276 | 0 | 1 | 0 | 1242.4282 | 无；1 skip = `pin-evidence.test.ts` unreadable（权限） |
| 编排 | `node --test "test/编排/**/*.test.ts"` | **1** | 563 | 562 | **1** | 0 | 0 | 1844.9645 | `shell-authorized-routine.test.ts:103` EPERM symlink |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"` | **1** | 272 | 265 | **3** | 4 | 0 | 15381.1522 | `file-write-safety.test.ts:97`、`session-store.test.ts:46`、`:58`，均 EPERM symlink |
| 项目管理/shared | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | 154 | 149 | 0 | 5 | 0 | 5067.5755 | 无；5 skip = `atomic-write.test.ts` mode/umask |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"` | 0 | 337 | 337 | 0 | 0 | 0 | 702.3849 | 无 |
| 桌面应用/operator-channel | `node --test test/桌面应用/operator-channel.test.ts` | 0 | 56 | 56 | 0 | 0 | 0 | 996.0163 | 无 |

日志（行数 / SHA-256）：

- `affected-gate.log`：285 / `d5efc260a23627e47ade62ca533c7169ac61f4305a0637ad31d17e7b63a3a013`
- `affected-orchestration.log`：1135 / `60ea69e990427e7432ddea17435fe3142041ccab6d1659da6453ca118b284e39`
- `affected-runtime-core.log`：331 / `7ec39c610aa46de77091e3c18ce1a7c8d656eede67b1e23e1ecda20ddcebf126`
- `affected-project-mgmt-shared.log`：165 / `f13d5428df2619208aea0b2778d38131d086ee0292f9ab2106326b97bbae316b`
- `affected-desktop-ui.log`：345 / `288e9522a05c4476032848935fd56e06e1ed3c5f58546046335e33d39b33a11a`
- `affected-operator-channel.log`：64 / `3379b999dd0aae5a350bb8256f1f9749a3cafad1f65964e6cd0d08acffe7061e`

### 3.4 T3 全量回归

| 项 | 值 |
| --- | --- |
| 命令（实际） | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` |
| cwd | 本 worktree 根 |
| 文件数 | **378**（全部 `*.test.ts` 379 个，排除 1 个 `test/pi-adapter/write-sequencing.test.ts`）；文件清单 `full-suite-files.txt`（378 行；SHA-256 `bce2cc77f5a25dc43b03d0a5e891cefbd3486f05fd33ef2c1c6e3d51748be281`），已排序且无重复 |
| 排除理由 | 按团队计划 §6.3 与 V1 AC-27：`write-sequencing.test.ts` 为**历史串行写测试**，沿用既有运行方式排除；理由按标准写入本证据 |
| 时间 | 2026-10-31T21:07:57+08:00 → 2026-10-31T21:12:21+08:00（duration_ms 264049.0361） |
| 结果 | **tests 3193 / pass 3166 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 退出码 | **1** |
| 原始日志 | `full-suite.log`（4285 行；SHA-256 `7cd10bb0edd277c1e0864fc9bdacf7cc0d686ea71fb203c9a495f89704e5b361`）；退出码 `full-suite-exit.txt`（2 行；SHA-256 `2cd622c8c8c9a2663e69a5ae56be87392d78107fa26b074d5f51fce2eba2beb2`）；命令/文件清单 `full-suite-meta.log`（385 行；SHA-256 `6dfc143d02789dd1de4bac26c1fbb9f679e13d6ab3db6709c92e7644e73866f4`） |

#### 3.4.1 失败清单（9 项，全部为 EPERM symlink）

| # | 测试文件:行 | 测试名 | 错误原文（关键行） |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-claude-test-wAVaJp' -> '…\Temp\ans-claude-test-wAVaJp\.ans\sessions\claude-fixture\claude\native'` |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-codex-tests-gC1ZcN' -> '…\Temp\ans-codex-tests-NjMJTy\.ans\sessions\codex-fixture\codex\native'` |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | `Error: EPERM: operation not permitted, symlink '…\Temp\p1-injection-E6XJri\outside' -> '…\Temp\p1-injection-E6XJri\.ans\sessions\Pi适配器\pi\native'` |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | `Error: EPERM: operation not permitted, symlink '…\Temp\p1-injection-cs60Zh\outside.jsonl' -> '…\Temp\p1-injection-cs60Zh\.ans\sessions\Pi适配器\pi\native\link.jsonl'` |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-core-d3-tB9Jck\actual\nested\file.txt' -> '…\Temp\ans-core-d3-tB9Jck\actual\link.txt'` |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-store-Bzh19w' -> '…\Temp\ans-store-FZfiZc\.ans\sessions\role\codex'` |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-store-sRdjY7' -> '…\Temp\ans-store-zTXBHh\.ans\sessions\core\codex\native'` |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | `Error: EPERM: operation not permitted, symlink '…\Temp\g4-outside-EIPSQA' -> '…\Temp\g4-render-UVnEEd\docs\skills\link'` |
| 9 | `test/编排/shell-authorized-routine.test.ts:103` | node test外指符号链接路径不获委托；项目内测试路径获委托 | `Error: EPERM: operation not permitted, symlink '…\Temp\ans-routine-outside-7I7o4z\outside.test.ts' -> '…\Temp\ans-routine-paths-PAtt7V\test\external.test.ts'` |

共同签名：`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`；失败发生在测试夹具创建符号链接阶段。完整堆栈见 `full-suite.log`（失败块自第 4146 行起）。其中第 5–7 项在 `affected-runtime-core.log`、第 9 项在 `affected-orchestration.log` 复跑中同样出现，计数与全量一致。

#### 3.4.2 跳过清单（18 项，均为既有平台跳过）

| 文件 | 数量 | 跳过原因 / 测试 |
| --- | --- | --- |
| `test/runtime-core/file-write-safety.test.ts` | 4 | `D3 write and edit preserve existing ordinary modes and strip special bits` 等 4 项 mode/umask 语义，`# SKIP` |
| `test/测试/lightweight-permission-repairs.test.ts` | 6 | `D3 AC3/5`、`AC4`、`AC5`、`AC6`（2 项）、`AC7`，`# SKIP`（权限/umask 语义） |
| `test/项目管理/shared/atomic-write.test.ts` | 5 | `D3 finalMode…`、严格 umask、chmod/sync 失败、chmod 后中止等，`# SKIP`（mode/umask 语义） |
| `test/codex-adapter/session.test.ts` | 1 | `owned native process group cleanup kills a wrapper and child that ignore SIGTERM`，`# SKIP` |
| `test/pi-adapter/session-persistence.test.ts` | 1 | `会话目录不可写：明确抛错…`，`# chmod 语义在 Windows 不适用` |
| `test/门禁引擎/pin-evidence.test.ts` | 1 | `unreadable（权限）：文件不可读 → status=unreadable、actual=null`，`# SKIP` |
| **合计** | **18** | 与参考基线 skip 数一致；新增 skip = 0 |

### 3.5 失败分类

| 分类 | 数量 | 明细 |
| --- | --- | --- |
| 既有环境失败（Windows symlink/EPERM） | **9** | §3.4.1 全部 9 项；`errno -4048` / `EPERM` / `symlink`；测试夹具需要创建符号链接，当前 Windows 账户/进程无此权限 |
| 其它确定性失败 | **0** | — |
| 无法分类 | **0** | — |
| 新增失败（相对既有环境基线） | **0** | 全量 9 fail 与团队计划 §1.2 参考基线（3193 tests / 3166 pass / 9 fail / 18 skip，全部为既有 Windows symlink EPERM）**完全一致**；受影响层复跑出现的是同一批 EPERM |
| 新增 skip/todo | **0** | 全量 skip 18、todo 0，与参考基线一致 |

---

## 四、基线结论

1. **基线可用**：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 全部 exit 0；受影响 6 个层命令均已执行并记录计数；T3 全量回归已执行（378 文件、3193 tests、264,049 ms、exit 1）。
2. **失败分类明确**：9 个 fail 全部为既有 Windows symlink `EPERM` 环境失败；无其它确定性失败，无无法分类项；新增确定性失败 = 0、新增 skip = 0。全量计数与团队计划 §1.2 参考基线逐项一致（3193 / 3166 / 9 / 18 / 0）。
3. **无产品代码改动**：B0 全程 `git status --short -- src test app` 为空、`git diff --cached --name-only` 为空；工作树既有变更仅为 H1 治理文件、memo 与未跟踪管理文档。`build:renderer` 输出 `app/renderer/dist/` 被 git 忽略，未进入状态。
4. **环境缺口（交 D2/装配处理，B0 不处理）**：`electron@44.7.0` 包存在但 `node_modules/electron/dist/`、`path.txt`、`electron.exe` 缺失，真实 Electron E2E 在当前 worktree 不可执行；需装配角色/项目管理安排补装或授权的等价环境。`npm ci` 的 allowScripts 策略挡住了 4 个依赖的 install script（列表见 §一），是否影响后续 E2E/打包需装配确认。
5. **范围声明**：B0 未启动应用、未运行真实 Electron E2E、未做截图；未 commit/push/merge/release；未伪造 task_ops/机器状态。
6. 本记录不是候选、不是验收报告；不宣布任何变更通过。

---

## 五、证据文件清单（仓库外临时目录）

目录：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\b0\`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `affected-desktop-ui.log` | 345 | `288e9522a05c4476032848935fd56e06e1ed3c5f58546046335e33d39b33a11a` |
| `affected-gate.log` | 285 | `d5efc260a23627e47ade62ca533c7169ac61f4305a0637ad31d17e7b63a3a013` |
| `affected-operator-channel.log` | 64 | `3379b999dd0aae5a350bb8256f1f9749a3cafad1f65964e6cd0d08acffe7061e` |
| `affected-orchestration.log` | 1135 | `60ea69e990427e7432ddea17435fe3142041ccab6d1659da6453ca118b284e39` |
| `affected-project-mgmt-shared.log` | 165 | `f13d5428df2619208aea0b2778d38131d086ee0292f9ab2106326b97bbae316b` |
| `affected-runtime-core.log` | 331 | `7ec39c610aa46de77091e3c18ce1a7c8d656eede67b1e23e1ecda20ddcebf126` |
| `build-renderer.log` | 22 | `e3564f1c2101cdc3308e49927d4137a8b6c4a81b2ad8136e49951a9afc568de1` |
| `env.log` | 39 | `4a9e8c6b55cdbb19226c82a0c1404b2240540c1bed47ff097b38f086534d26dd` |
| `full-suite-exit.txt` | 2 | `2cd622c8c8c9a2663e69a5ae56be87392d78107fa26b074d5f51fce2eba2beb2` |
| `full-suite-files.txt` | 378 | `bce2cc77f5a25dc43b03d0a5e891cefbd3486f05fd33ef2c1c6e3d51748be281` |
| `full-suite-meta.log` | 385 | `6dfc143d02789dd1de4bac26c1fbb9f679e13d6ab3db6709c92e7644e73866f4` |
| `full-suite.log` | 4285 | `7cd10bb0edd277c1e0864fc9bdacf7cc0d686ea71fb203c9a495f89704e5b361` |
| `git-state.log` | 37 | `977a0a4c4b22519284850c8a9f1c08f6fc6fbb9b0e4bee7ff8d61147a7b28396` |
| `input-hashes.log` | 15 | `374736b87c4210f554a1c3a3b69a7282b7724f570eb51aa8b7c6165f4d4e3395` |
| `npm-ci.log` | 14 | `f45de6aa311da568f40cab16f36848d9f3cab78321e5ec9e31fa3a1b4dda20e0` |
| `typecheck-renderer.log` | 4 | `dddee1c8ed7a0c6f76fba926ae9f6de01643f83dbecf8fd46213642f48226cc6` |
| `typecheck.log` | 4 | `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435` |

清单文件：`evidence-manifest.txt`（18 行；SHA-256 `899ac225caf358b81fbed77bec87f1b754193ff30bb1ed5743f9d3fbeec7739e`）。

---

## 六、写入边界与限制

- 写入边界：仅本文件（`角色卡/测试/docs/change/` 下新证据记录）；未修改产品源码、测试、配置、角色卡或边界。
- 原始日志位于仓库外临时目录；本记录用路径 + 行数 + SHA-256 绑定，便于复算。
- 未运行的检查：真实 Electron E2E、真实截图（环境缺口见 §四.4）；B0 不要求，D2 负责。
- 若后续 HEAD、Node/npm、依赖、输入文档或夹具变化，本基线证据失效，需重新记录。
