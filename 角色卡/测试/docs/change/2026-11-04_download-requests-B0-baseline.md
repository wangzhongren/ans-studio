# 变更记录：下载文件申请 B0 基线（2026-11-04）

- 任务 ID：`2026-11-04-download-requests`
- 节点：B0 基线（团队计划 `docs/scheduling/2026-11-04_team-plan_download-requests.md` §5.1 / §5.3）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- 本轮纪律：只取证；不修改产品/测试源码；不 commit / push / 暂存；不启动应用、不跑 E2E；只写本角色证据目录（`角色卡/测试/docs/change/`）。

## 1. 前置核对（开工时实测）

| 项 | 期望（任务给定） | 实测 | 结论 |
| --- | --- | --- | --- |
| HEAD | `f394cfb7f419ce5ef95e936d2cba9c7ac2da071f` | `f394cfb7f419ce5ef95e936d2cba9c7ac2da071f` | 一致 |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| 产品/测试区 | `git status --porcelain -- src app test` 为空 | 空 | 一致 |
| Node / npm | v24.22.1 / 11.19.1（以实测为准） | v24.22.1 / 11.19.1 | 一致 |
| `node_modules` | 初始不存在 | 不存在 | 一致 |
| H1 改动 | 运行时核心/编排/桌面窗口各 `boundary.md`、`boundary.yaml`、`changelog.md` 共 9 个未提交治理改动 | 9 个修改（`+38` 行），详见 §4 | 一致；未修改/未回退 |
| 其它既有本地改动 | `docs/planning/memo.md`、`.tmp-*.cjs`、`docs/communication/`、`docs/planning/`、`docs/scheduling/` 管理文档 | 均在，未触碰 | 一致 |

B0 期间观察到 `docs/communication/2026-11-04_authorization_decision-card-autoselect-merge.md` 新增（非本角色产物，未触碰；属并发管理文档，不影响产品/测试区核对）。

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300，MSYS 3.6.10） |
| Shell | `/bin/bash.exe`（Git Bash / MinGW64） |
| Node | v24.22.1（win32 x64） |
| npm | 11.19.1 |

原始记录：`21-environment.log`。

## 3. 依赖安装（`npm ci`）

- 命令：`npm ci`（在 worktree 根执行）
- 结果：**exit 0**；墙钟 **21s**；`added 526 packages, and audited 527 packages in 21s`；`node_modules` 顶层 377 项。
- 审计信息（非阻断）：`21 vulnerabilities (18 moderate, 3 high)`。
- 完整性：`package.json` SHA-256 `51b63e73…b91400d`、`package-lock.json` SHA-256 `d6ee156e…8b7685`；安装前后完全一致（`02-lockfile-compare.txt` 为空 diff）。
- 安装脚本提示（npm 11 allowScripts，非阻断）：`@google/genai`（preinstall no-op）、`electron-winstaller`（install）、`esbuild`（postinstall）、`protobufjs`（postinstall）4 个包的 install script 未执行；随后三项静态门与全部 Node 测试均正常通过。
- Electron 二进制：**未下载**（见 §8）。

证据：`01-npm-ci.log`、`00-lockfile-before.sha256`、`02-lockfile-after.sha256`、`02-lockfile-compare.txt`。

## 4. H1 边界核对

命令：

```bash
node --test --test-concurrency=1 "test/门禁引擎/boundary-yaml.test.ts" "test/门禁引擎/boundary-yaml-validation.test.ts" "test/门禁引擎/boundary-empty-and-builtin.test.ts"
```

结果：**exit 0**；3 个文件、**25 tests / 25 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**；`duration_ms 460.5545`。

条目数（`boundary.yaml` 的 `- kind:` 条目数；`boundary.md` 第 1 节表格行数；HEAD 列为未含 H1 未提交改动时的基线）：

| 角色 | HEAD（H1 前） | 当前（H1 后） | md 第 1 节行数 | md/yaml 一致 |
| --- | --- | --- | --- | --- |
| 运行时核心 | 18 | **19** | 19 | 是 |
| 编排 | 21 | **24** | 24 | 是 |
| 桌面窗口 | 81 | **83** | 83 | 是 |

B-1..B-4 条目在 md 与 yaml 中均存在（行号为当前文件）：

| 变更 | 条目 | boundary.yaml | boundary.md |
| --- | --- | --- | --- |
| B-1 | `src/model/download.ts` | `角色卡/运行时核心/boundary.yaml:21` | `角色卡/运行时核心/boundary.md:13` |
| B-2 | `src/pipeline/orchestration/download-request.ts` | `角色卡/编排/boundary.yaml:39` | `角色卡/编排/boundary.md:17` |
| B-3 | `src/provider/download/` | `角色卡/编排/boundary.yaml:43` | `角色卡/编排/boundary.md:18` |
| B-3 | `src/service/download/` | `角色卡/编排/boundary.yaml:46` | `角色卡/编排/boundary.md:19` |
| B-4 | `test/桌面应用/download-request.test.ts` | `角色卡/桌面窗口/boundary.yaml:237` | `角色卡/桌面窗口/boundary.md:81` |
| B-4 | `test/桌面应用/download-decision.test.ts` | `角色卡/桌面窗口/boundary.yaml:240` | `角色卡/桌面窗口/boundary.md:82` |

H1 diff：9 个文件、`+38` 行，仅条目/注释/changelog（无 id/能力描述变更）。**结论：H1 与闸门 2 的 B-1..B-4 一致，边界门禁测试通过。**（本节为核对，测试角色未改动任何边界文件。）

证据：`03-boundary-gate.log`、`18-boundary-counts.log`、`20-h1-diff-stat.log`。

## 5. 静态门

| 命令 | exit | 用时 | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 1s | `tsc --noEmit` |
| `npm run typecheck:renderer` | **0** | 1s | `tsc -p app/renderer/tsconfig.json` |
| `npm run build:renderer` | **0** | 2s | `vite build`（built in 448ms）；仅 chunk-size / 动态导入提示，无错误；产物 `app/renderer/dist/` 已被 `.gitignore` 忽略 |

证据：`04-typecheck.log`、`05-typecheck-renderer.log`、`06-build-renderer.log`。

## 6. 受影响套件基线

均使用 `node --test --test-concurrency=1` 串行执行；文件数为对应 `find` 口径的 `.test.ts` 数。

| 套件 | 文件数 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 39 | 1 | 309 | 302 | 3 | 0 | 4 | 0 | 31,237.33 |
| `test/编排/**/*.test.ts` | 60 | 1 | 757 | 756 | 1 | 0 | 0 | 0 | 14,517.64 |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 175 | 170 | 0 | 0 | 5 | 0 | 8,564.03 |
| `test/桌面应用/**/*.test.ts` | 55 | **0** | 531 | 531 | 0 | 0 | 0 | 0 | 71,165.53 |
| `test/桌面UI/**/*.test.ts` | 54 | **0** | 405 | 405 | 0 | 0 | 0 | 0 | 5,405.07 |
| `test/测试/**/*.test.ts` | 91 | 1 | 581 | 574 | 1 | 0 | 6 | 0 | 77,115.45 |

失败分类（5 项，全部为 Windows 符号链接权限 EPERM，`errno -4048`、`syscall symlink`，属既有环境类，不是本任务新增断言失败）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 2 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 3 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 4 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 5 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |

跳过分类（本组合计 15 项：runtime-core 4 + 项目管理 shared 5 + 测试 6），全部为源码内平台条件跳过（`process.platform === "win32"` / `!posix`），见 §7 汇总。

证据：`07-suite-runtime-core.log`、`08-suite-orchestration.log`、`09-suite-pm-shared.log`、`10-suite-desktop-app.log`、`11-suite-desktop-ui.log`、`12-suite-test-role.log`。

## 7. T3 全量基线

### 7.1 口径与排除项

仓库既有 T3 口径（团队计划 §6.3）：`node --test --test-concurrency=1` 全量 `.test.ts`，**排除 `test/pi-adapter/write-sequencing.test.ts`**。排除理由：该文件为既有已知挂起（3 个 `test()` 打印 ✔ 后进程不退出），见 `docs/acceptance/acceptance-rework-routing-criteria-v1.md`（“已知挂起测试存在…T3 全量必须排除并记录”）与 `docs/acceptance/acceptance-rework-routing-report-v1.md`（360 文件显式排除记录）。文件确实存在（`test/pi-adapter/write-sequencing.test.ts`），排除为显式、可复现，不是静默跳过。

文件集：`find test -name '*.test.ts' ! -name 'write-sequencing.test.ts'` = **407** 个文件（全部 408 个 `.test.ts` 中排除 1 个），清单保存于 `13-t3-file-list.txt`。

### 7.2 执行方式说明（等价替换，未增减文件）

本会话为 worktree 隔离沙箱，拒绝执行 `node --test … $(find …)`（运行时计算参数）、`xargs` 与超长显式命令行。实际执行使用**等价的显式集合**：

- 10 个目录 glob（`test/claude-adapter/*.test.ts`、`test/codex-adapter/*.test.ts`、`test/runtime-core/**/*.test.ts`、`test/桌面UI/**/*.test.ts`、`test/桌面应用/**/*.test.ts`、`test/测试/**/*.test.ts`、`test/编排/**/*.test.ts`、`test/装配/**/*.test.ts`、`test/门禁引擎/**/*.test.ts`、`test/项目管理/shared/**/*.test.ts`）
- 加 `test/pi-adapter/` 的 **39 个显式文件**（该目录唯一需要排除的文件即 `write-sequencing.test.ts`）

静态覆盖校验（`verify-t3-coverage.mjs`，只做 glob 展开比对、不执行测试）：`expected=407 expanded=407 piExplicit=39 missing=0 extra=0`。与 `find` 清单完全一致，无遗漏、无额外文件。

### 7.3 结果

- **exit 1**（由既有 EPERM 失败导致）
- **tests 3657 / pass 3630 / fail 9 / cancelled 0 / skipped 18 / todo 0**
- `duration_ms 267,444.7848`（约 267.4s）；墙钟 2026-11-04 16:56:21 → 17:00:55（+0800），约 274s
- 失败 **9/9 全部为 Windows 符号链接 EPERM**（`errno -4048`、`code EPERM`、`syscall symlink`；日志中 `EPERM: operation not permitted, symlink` 计数 = 9），非 EPERM 失败 = 0：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | store validate callback rejects directory symlink before Pi parse or new native write |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- 跳过 **18** 项，全部为源码内平台条件（Windows/非 POSIX）跳过，无新增 skip：

| 来源文件 | 数量 | 条件 |
| --- | --- | --- |
| `test/runtime-core/file-write-safety.test.ts` | 4 | `skip: process.platform === "win32"` |
| `test/测试/lightweight-permission-repairs.test.ts` | 6 | `skip: !posix` |
| `test/项目管理/shared/atomic-write.test.ts` | 5 | `skip: process.platform === "win32"` |
| `test/codex-adapter/session.test.ts` | 1 | `skip: process.platform === "win32"` |
| `test/门禁引擎/pin-evidence.test.ts` | 1 | `skip: win32 或 root` |
| `test/pi-adapter/session-persistence.test.ts` | 1 | 运行时 `t.skip("chmod 语义在 Windows 不适用")` |

### 7.4 结论

- **新增确定性失败 = 0**（9 项失败全部属于既有 Windows symlink EPERM 类别，与仓库既有基线名单同类；无其它失败、无超时、无断言失败）。
- **新增 skip = 0**（18 项均为既有源码内平台条件跳过）。
- 本 B0 结果作为 D1 回归对照基线；D1 须重跑并逐项对照本清单。

证据：`13-t3-file-list.txt`、`14-t3-full-regression.log`、`16-t3-coverage-check.log`、`verify-t3-coverage.mjs`。

## 8. Electron 事实（未启动、未跑 E2E）

| 项 | 值 |
| --- | --- |
| `package.json` 声明 | `electron` `44.7.0`（devDependencies） |
| 已安装包版本 | `44.7.0`（`node_modules/electron/package.json`） |
| 二进制 | **不存在**：`node_modules/electron/dist/electron.exe` 缺失；`dist/` 目录未创建 |
| 原因（如实记录） | Electron 44 包本身无 postinstall script；二进制需经 `install-electron`（`node_modules/.bin/install-electron`，即包内 `install.js`）另行下载；本轮 `npm ci` 未触发（allowScripts 提示见 §3） |
| 启动状态 | **未启动应用、未运行任何 Electron/E2E 测试**（B0 范围） |

证据：`19-electron-facts.log`。

## 9. 限制与偏差

1. T3 命令形式因 worktree 隔离沙箱限制改为“目录 glob + 显式文件集合”，已用静态覆盖校验证明与 `find` 清单完全一致（407/407，missing=0、extra=0）；计数、失败与跳过分类均来自真实执行日志。
2. Electron 二进制缺失导致 D2 前若需真实运行，须先执行 `install-electron` 下载二进制（D2 属测试+桌面窗口+桌面UI，非 B0 范围）。
3. 一次**补充性**分组复跑（非必需证据）在 600s 超时并转入后台后停滞，已终止；其部分日志保留为 `15-suite-remaining-groups.log`（467 行，**未完成，不用于任何基线计数**）。T3 全量证据以上文 §7 单次完整运行为准。
4. `npm ci` 给出 21 个依赖漏洞告警（18 moderate / 3 high）。仅记录，不构成本任务阻断；如需处置由项目管理角色决定。
5. B0 期间 `docs/communication/` 有并发管理文档新增（非本角色产物），本角色未触碰。

## 10. 收尾状态

| 项 | 值 |
| --- | --- |
| `git rev-parse HEAD` | `f394cfb7f419ce5ef95e936d2cba9c7ac2da071f`（未变） |
| `git branch --show-current` | `feat/download-requests` |
| `git status --porcelain -- src app test` | 空 |
| `git diff --cached --name-only` | 空（未暂存） |
| commit/push | 未执行（HEAD 仍为 `f394cfb`，PR #57 合并提交） |

B0 期间产生的文件（仅限本角色证据目录；另有忽略产物 `node_modules/`、`app/renderer/dist/`）：

```
角色卡/测试/docs/change/2026-11-04_download-requests-B0-evidence/
```

以及本记录 `角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline.md`。

## 11. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-lockfile-before.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | `npm ci` 前 manifest/lock 哈希 |
| `01-npm-ci.log` | `c1a3917d9ab2798e6bc0fc1e2dcf9239d312b86e5781b436a824854551e06706` | 28 | `npm ci` 原始输出（含 exit/耗时） |
| `02-lockfile-after.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | `npm ci` 后哈希（与 before 相同） |
| `02-lockfile-compare.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 | 空 diff（一致） |
| `03-boundary-gate.log` | `c9cbf935cd21caa930b0f489415b7e7e6745277e68654b67604e8dfede3aadec` | 33 | 边界门禁 3 文件原始输出 |
| `04-typecheck.log` | `605bc6082ef21f5299348e72ea2a248a62ac49ddbc213431f7c55256631f1977` | 5 | typecheck 原始输出 |
| `05-typecheck-renderer.log` | `282c727db2718e0fe75db64d0ef3d034beb002c2317d97afcf596b8bda070b01` | 5 | typecheck:renderer 原始输出 |
| `06-build-renderer.log` | `9a30e2d5f766ac38cf1323f38f4911770b53c93fbaddd4ddbcaa6dc387159258` | 23 | build:renderer 原始输出 |
| `07-suite-runtime-core.log` | `85ea330660dd426b4d12b03890204807d55270be040b0fafde1d1989904f434c` | 369 | runtime-core 受影响套件 |
| `08-suite-orchestration.log` | `2df91d81bd203a4289fc48ba051146f6d64f88a34a71a5e01105e9ab6dd61c6f` | 1334 | 编排受影响套件 |
| `09-suite-pm-shared.log` | `5e29a8ad5139f7d758152a663afe888ebc3d94f2e6aa53dfbf4882b61e138245` | 187 | 项目管理 shared |
| `10-suite-desktop-app.log` | `b17ca129e338b45f2b5b679c9eb6e95ef52af277aafa52de3bdfcb1a028f7abd` | 553 | 桌面应用 |
| `11-suite-desktop-ui.log` | `fecc09b95790250791c19a3f6e416bd73284260e6052c68f1ddef9e3bda2bfcc` | 414 | 桌面UI |
| `12-suite-test-role.log` | `3527a37592391578af4223305c085f09a197817e8ddcb1d2b0a67951ace0fa03` | 644 | 测试角色套件 |
| `13-t3-file-list.txt` | `dc1b1fff3c7c1c2b2e3248b7f703c7dacae193e910fe1935f0b3c0f57ca463b3` | 407 | T3 文件清单（find 口径） |
| `14-t3-full-regression.log` | `05eb90026e572dcca2165453adefb529a51b7cb4f125c157113ecb84a5b4f727` | 4761 | T3 全量原始输出 |
| `15-suite-remaining-groups.log` | `c433322006307744a833c9741ab9a569f954cef39bc181b78f3a0a8b38745d5b` | 467 | 补充分组复跑：未完成，不用于基线 |
| `16-t3-coverage-check.log` | `2d3033b6247ca36a56b9b1b2c0b5041116e8d719be83dacad9ba1663321a13c6` | 1 | 覆盖校验输出 |
| `17-final-git-state.log` | `956fbd8896cfe965ed3642d70e203572c145ca37d0482031bb3db1a773bdbd7f` | 35 | 收尾 git 状态 |
| `18-boundary-counts.log` | `320f4e619a7a8309716040ae6ec4a62889268b170aad4c89d5cb7336d5a85664` | 21 | 边界条目计数与 B-1..B-4 |
| `19-electron-facts.log` | `2fdf4295570c8f6e6ef98ef6c9694e854bdd1d3ac3d615124d466fc363cb9f62` | 25 | Electron 事实 |
| `20-h1-diff-stat.log` | `aa20c2996373fa134293d62196f3f9322bb8848a8551105caa217c871cde5c69` | 144 | H1 diff stat + 全文 |
| `21-environment.log` | `f70def5c0148f05687858b00062056279aa927c5baf902c65dd93981409ffa1d` | 12 | 环境 |
| `verify-t3-coverage.mjs` | `594cf59919c12212ce3ba197fd9c87899a44d8675cf04ef2700907f57b72e40b` | 45 | T3 文件集静态覆盖校验脚本 |
| `23-post-record-state.log` | `a8bada233242bfac59e0be6f73c9c53ef1dc2b2f9bd440fa6379f9e6e7849955` | 10 | 记录写盘后的收尾复核 git 状态 |

索引文件 `22-evidence-index.sha256` 收录以上全部文件与本记录的 SHA-256（索引自身不入索引；其哈希见交付报告）。
