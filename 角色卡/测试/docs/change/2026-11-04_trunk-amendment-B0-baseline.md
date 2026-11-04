# 变更记录：主干/修订法案 B0 基线（2026-11-04）

- 任务 ID：`2026-11-04-trunk-amendment-model`
- 节点：B0 基线（实施入口重记；方案/复核基于 `f4c24ea`，实施基线 = main `89b1fb2`）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（分支 `feat/trunk-amendment-model`）
- 纪律：只读产品代码；只写 `角色卡/测试/docs/change/` 本任务记录与证据；不修改产品/测试源码、角色卡；不 commit/push/暂存；不启动应用、不跑 E2E；未触碰其它 worktree。

## 1. 前置核对（开工实测）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| HEAD | main `89b1fb2` | `89b1fb2751d74c607b3a17d1b522b88061943a14` | 一致 |
| 分支 | `feat/trunk-amendment-model` | `feat/trunk-amendment-model` | 一致 |
| `origin/main` | `89b1fb2` | `89b1fb2751d74c607b3a17d1b522b88061943a14` | 一致（HEAD = origin/main） |
| 产品/测试区（开工） | `git status --porcelain -- src app test` 为空 | 空 | 一致 |
| 暂存区 | `git diff --cached --name-only` 为空 | 空 | 一致 |
| Node / npm | 未指定 | v24.22.1 / 11.19.1 | 记录 |

开工时工作树既有非本角色改动（未触碰，仅披露）：`M docs/planning/memo.md`；未跟踪 7 个规划/沟通文档（`docs/communication/2026-11-04_{intent,gate1,gate2}_trunk-amendment-model.md`、`docs/planning/2026-11-04_{design,review}_trunk-amendment-model.md`、`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model.md` 与 `...-P1.5-increment.md`）。`src app test` 开工干净。原始快照见 `00-opening-state.log`。

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300，MSYS 3.6.10） |
| Shell | `/bin/bash.exe`（Git Bash / MinGW64） |
| Node | v24.22.1（win32 x64） |
| npm | 11.19.1 |

## 3. 依赖安装（`npm ci`）

- 结果：**exit 0**；墙钟 **54s**（`npm-ci-start.txt`/`npm-ci-end.txt`）；`added 526 packages, and audited 527 packages in 54s`；`node_modules` 顶层 **377** 项（`node-modules-count.txt`）。
- 完整性：`package.json` SHA-256 `51b63e730dc2678ed647d621db5e1a283ccfc0ef465c0543fc3ea5846b91400d`、`package-lock.json` SHA-256 `d6ee156eeca5e627585ff9f8f44bcccd2c2fcea921b7195b9339ba54388b7685`；安装前后完全一致（`03-lockfile-compare.txt` 为空 diff）。与 download-requests B0 v3 相同，本基线未改依赖。
- 告警：4 个包 install script 未执行（allowScripts，同前：`@google/genai`、`electron-winstaller`、`esbuild`、`protobufjs`）；21 个依赖漏洞（18 moderate / 3 high），仅记录，不构成本任务阻断。Electron 二进制未下载（§7）。
- 沙箱：`npm ci` 正常完成，未触发祖先 `node_modules` 回退。

## 4. 基线组成与漂移披露

**漂移事实（必须披露）：** 方案 P1.4/P1.5 与复核的代码核对基线是 `f4c24eae1db4df9cfe0bdd73bfdfa471f0d6c004`；本 B0 按统筹团队计划 §1.4 更新到当前 main，实施基线为 **`89b1fb2`**（含下载特性 PR #62 与 PR #61）。方案行号只对应 `f4c24ea` 快照，实施必须以符号名/文本锚点为准。

实测基线组成（`11-baseline-composition.log`）：

| 来源 | 内容 | 说明 |
| --- | --- | --- |
| `89b1fb2`（HEAD = origin/main） | `Merge pull request #62 from wangzhongren/feat/download-requests`；父提交 `627b169` + `5653a29` | 下载特性正式合入 main |
| `627b169`（PR #61） | `fix/governance` convener-workflow-write：运营恢复 `docs/workflow.md` 精确文件写权 | 方案基线后的新增修复 |
| `5653a29`（PR #62 内） | 下载特性边界变更 B-1..B-4（闸门 2 已确认） | |
| `e7c71df` | PR #61 实提交 | |
| `3c88fae`、`604c362`、`57b5ff2`、`1d7560f`、`691846b`、`d2fc7a3`、`cb3dd23`、`16babb3` | 下载特性 A1/A2/B1..C2/D1/D2/E2 实施与测试 | 含 D1 跨层集成、D2 探针、E2 补充 |

- `f4c24ea..89b1fb2` 全仓：**282 文件、`+33397/-43`**；其中 `src app test`：**75 文件、`+10749/-43`**。
- 与 download-requests B0 v3（`f0adb49`，410 文件）的关系：本基线 T3 文件集 **420**，新增 **10** 个测试文件，全部为 PR #61/#62 引入（逐文件归因见 §6.1），无删除。
- 本记录只做基线取证，不对下载特性/PR #61 实现质量作结论。

## 5. 静态门

| 命令 | exit | 墙钟（`time`） | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 1.717s | `tsc --noEmit`（`06-typecheck.log`，4 行） |
| `npm run typecheck:renderer` | **0** | 0.757s | `tsc -p app/renderer/tsconfig.json`（`07-typecheck-renderer.log`，4 行） |
| `npm run build:renderer` | **0** | 1.638s | vite v8.3.4；2799 modules；built in 665ms；仅 chunk-size >500kB 与动态导入提示；产物 `app/renderer/dist/` 已忽略（`08-build-renderer.log`，22 行） |

## 6. T3 全量基线

### 6.1 口径与文件集

- 口径（沿用 download-requests B0 v1–v3 先例）：`node --test --test-concurrency=1` 全量 `test/**/*.test.ts`，**显式排除 `test/pi-adapter/write-sequencing.test.ts`**（既有已知挂起：3 个 test 打印 ✔ 后进程不退出；仓库验收文档有明确排除要求）。
- 文件数：`test/` 下全部 `.test.ts` **421**，排除 1 = **420**；清单 `19-t3-file-list.txt`。
- 执行方式：worktree 隔离沙箱拒绝 `$(find …)`/xargs/超长命令行，使用 **10 个目录 glob + 39 个显式 pi-adapter 文件** 的等价集合（`run-t3.sh`）；静态覆盖校验 `expected=420 expanded=420 piExplicit=39 missing=0 extra=0`（`20-t3-coverage-check.log`，`verify-t3-coverage.mjs`）。
- 与 B0 v3（410）diff：**+10 文件、无删除**（`19-t3-file-list-diff-vs-v3.txt`；归因 `19-t3-new-files-attribution.log`）：

| # | 文件 | 引入提交 |
| --- | --- | --- |
| 1 | `test/runtime-core/dispatch-workflow-writer-copy.test.ts` | `e7c71df`（PR #61） |
| 2 | `test/门禁引擎/convener-workflow-write.test.ts` | `e7c71df`（PR #61） |
| 3 | `test/桌面应用/download-request.test.ts` | `57b5ff2`（C1） |
| 4 | `test/桌面应用/download-decision.test.ts` | `57b5ff2`（C1） |
| 5 | `test/桌面UI/download-card.test.ts` | `1d7560f`（C2） |
| 6 | `test/编排/download-judge.test.ts` | `604c362`（B1） |
| 7 | `test/编排/download-pipeline.test.ts` | `604c362`（B1） |
| 8 | `test/编排/download-provider.test.ts` | `604c362`（B1） |
| 9 | `test/测试/download-requests-integration.test.ts` | `691846b`（D1） |
| 10 | `test/测试/download-requests-ac22.test.ts` | `16babb3`（E2） |

说明：`角色卡/桌面UI/docs/change/**` 下另有 3 个被跟踪的 `*.test.ts`（历史证据副本），不在 `test/` 下、不属于 T3 口径，未纳入。

### 6.2 干净性检查（运行前/运行中/运行后）

| 时点 | 检查 | 结果 |
| --- | --- | --- |
| 22:14:08（运行前） | `git status --porcelain -- src app test`；`git diff --cached --name-only`；HEAD | 空；空；`89b1fb2`（`21-t3-prerun-status.log`） |
| 22:14:21（运行中 1） | `git status --porcelain -- src app test` | 空（`22-t3-mid1.log`） |
| 22:15:18（运行中 2） | 同上 | 空（`23-t3-mid2.log`） |
| 22:20:37（运行后） | 同上 + HEAD + staged | 空；`89b1fb2`；空（`25-t3-postrun-status.log`） |

### 6.3 结果（原始数字；权威运行 = 第 1 次全量）

- **exit 1**
- **tests 3774 / pass 3745 / fail 11 / cancelled 0 / skipped 18 / todo 0**
- `duration_ms 283,871.0695`（约 283.9s）；运行区间 **22:14:18–22:19:02**（`24-t3-full-regression.log` 首尾时间戳）
- 失败构成：9 项既有 Windows symlink EPERM + 2 项非确定性清理期 ENOTEMPTY（逐项见 §6.4）。
- 重复运行尝试（`24-t3-full-regression-run2.log`）：第 2 次全量于约 22:23:45 启动，运行至 22:26:06 后无新输出逾 6 分钟（最后完成 `test/pi-adapter/injected-runtime.test.ts`，未进入汇总），于 22:31 判定停滞并手动中止；该次未产生汇总计数，**不作为基线数字**。中止后对可疑文件 `installed-mcp-servers.test.ts` 单独重跑 8/8 通过（`24f`），未复现停滞。该非确定性停滞与已知挂起排除项（`write-sequencing.test.ts`）无关，作为运行抖动风险在 §7 披露。

### 6.4 失败清单与分类（9 项既有 Windows symlink EPERM + 2 项非确定性清理期 ENOTEMPTY）

**既有 Windows symlink EPERM（9 项，与 B0 v3 名单逐名一致；`errno -4048`、`syscall symlink`）：**

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

核对说明：9 个用例名与 B0 v3 名单**逐名一致**。细微差异：B0 v3 记录中 pi-adapter 两行的「行号↔用例名」对调（v3 表把 `:185` 记为「Pi storage refuses…」、`:193` 记为「store validate callback…」）；本记录按源码实测更正为 `:185` = store validate callback…、`:193` = Pi storage refuses…（源码 `test/pi-adapter/injected-runtime.test.ts` 实测），不影响名集合一致性。

**本次新增的 2 项非确定性清理期 ENOTEMPTY（非确定性失败，不计入「新增确定性失败」）：**

| # | 文件:行 | 用例 | 错误 | 复现核验 |
| --- | --- | --- | --- | --- |
| 1 | `test/桌面应用/stuck-redispatch.test.ts:173` | needs-review：部分写入 ⇒ 不自动重派；终止未确认 ⇒ unsafe | `ENOTEMPTY: directory not empty, rmdir …\.ans\state\logs`（fixture 清理期） | 单独重跑 2/2 通过（各 10/10）；与 #2 合并重跑 16/16 通过；`桌面应用` 套件重跑 562/562 通过（`24b*`/`24d`/`16a`） |
| 2 | `test/测试/g4-skill-verify/e-handler.test.ts:29` | 护栏矩阵：无轮次/回交轮/系统轮/派发轮 ⇒ not-customer-turn（零副作用）；直聊与排队客户消息轮 ⇒ 放行 | `ENOTEMPTY: Directory not empty`（fixture 清理期 `rmSync`） | 单独重跑 2/2 通过（各 6/6）；合并重跑通过；`测试` 套件重跑 596/589/1/6（该用例通过，唯一失败为既有 EPERM）（`24c*`/`24d`/`18a`） |

两项均为 Windows 清理期（`rmdir`/`rmSync`）瞬时占用导致，**单文件与套件重跑均不复现**，判定为非确定性环境抖动，不是确定性回归。

### 6.5 「新增确定性失败、新增 skip」口径

- **新增确定性失败 = 0**：本次 fail 集合 = 9 项既有 Windows symlink EPERM（逐名与 B0 v3 一致）+ 2 项非确定性清理期 ENOTEMPTY（隔离重跑 2/2 通过、合并重跑与所属套件重跑均通过）；无非 EPERM 的确定性失败、无超时、无 cancelled。
- **新增 skip = 0**：skipped = 18，全部为源码内平台条件（`# SKIP` / `chmod 语义在 Windows 不适用`），与 B0 v3 的 18 项计数一致；10 个新增测试文件单独运行 **73 tests / 73 pass / 0 fail / 0 skip**（`24e-new-files-skip-check.log`），未引入任何新 skip。

### 6.6 受影响套件基线（团队计划 §5.3 补充口径，逐组实测）

| 套件 | 文件数 | exit | tests | pass | fail | skipped | duration_ms | 与 B0 v3 差异 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 42 | 1 | 325 | 318 | 3 | 4 | 29,176.9982 | +1 文件/+2 tests/+2 pass（`dispatch-workflow-writer-copy`，PR #61） |
| `test/编排/**/*.test.ts` | 64 | 1 | 804 | 803 | 1 | 0 | 15,093.8915 | +3 文件/+37 tests/+37 pass（download-judge/pipeline/provider） |
| `test/门禁引擎/**/*.test.ts` | 33 | **0** | 292 | 291 | 0 | 1 | 4,668.2099 | +1 文件（`convener-workflow-write`，PR #61；v3 未单列该套件） |
| `test/桌面应用/**/*.test.ts` | 57 | **0** | 562 | 562 | 0 | 0 | 69,992.5788 | +2 文件/+16 tests/+16 pass（download-request/decision；本套件含 `stuck-redispatch`，重跑全通过） |
| `test/桌面UI/**/*.test.ts` | 55 | **0** | 408 | 408 | 0 | 0 | 5,278.0008 | +1 文件/+3 tests/+3 pass（download-card） |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 176 | 171 | 0 | 5 | 8,013.4282 | 与 v3 完全相同 |
| `test/测试/**/*.test.ts` | 93 | 1 | 596 | 589 | 1 | 6 | 74,113.6876 | +2 文件/+15 tests/+15 pass（download-requests integration/ac22；唯一失败为既有 EPERM） |

说明：失败均为上述既有 EPERM（runtime-core 3、编排 1、测试 1）；`桌面应用`/`测试` 套件重跑支持 §6.4 的非确定性判定。T3 全量另覆盖 `claude-adapter`、`codex-adapter`、`pi-adapter`、`装配` 等目录。

## 7. 限制与披露

1. **基线含在途特性**：`89b1fb2` 含 PR #61（convener workflow 写权修复）与 PR #62（下载特性全量）。本 B0 只做基线取证；方案基于 `f4c24ea`，行号漂移以符号名/文本锚点消解（团队计划 §1.4）。
2. **T3 执行形式**：沙箱限制下的等价集合（10 目录 glob + 39 个显式 pi 文件），已用静态覆盖校验证明与完整清单完全一致（420/420，missing=0 extra=0）。
3. **Electron 事实**：`electron` 声明 44.7.0、安装包 44.7.0；二进制 `node_modules/electron/dist/electron.exe` **不存在**（包无 postinstall）；未启动应用、未运行 Electron/E2E（`26-electron-facts.log`）。
4. **依赖告警**：`npm ci` 报 21 个依赖漏洞（18 moderate / 3 high），仅记录。
5. **运行抖动披露**：首次全量 T3 完成且数字完整（§6.3），但其中 2 项 ENOTEMPTY 清理期失败未能隔离复现；第二次全量尝试在 `test/pi-adapter/` 后半段停滞并被中止（未产生汇总）。两者均为非确定性运行抖动，不影响「新增确定性失败=0 / 新增 skip=0」判定，但提示该环境偶发清理期/停滞问题，D1 复验时应以重跑与失败分类核对。
6. 本角色未修改任何产品/测试源码；B0 期间新增文件仅本记录与 `2026-11-04_trunk-amendment-B0-evidence/`（另有无视产物 `node_modules/`、`app/renderer/dist/`）。

## 8. 收尾状态

| 项 | 值 |
| --- | --- |
| `git rev-parse HEAD` | `89b1fb2751d74c607b3a17d1b522b88061943a14`（未变，22:33:08 复核） |
| `git branch --show-current` | `feat/trunk-amendment-model` |
| `git status --porcelain -- src app test` | 空 |
| `git diff --cached --name-only` | 空（未暂存） |
| commit/push | 未执行（HEAD 仍为 `89b1fb2`，无新提交；未 push） |

## 9. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-opening-state.log` | `d029dd86828cb1571ea005a58f9015d9c44ceeb7861fb725c93cf42fa75cd79c` | 40 | 开工 HEAD/分支/log/状态快照 |
| `01-lockfile-before.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | npm ci 前哈希 |
| `02-npm-ci.log` | `ac65dea98eebeec822b79910b38486982abf87a3419b3268c9b8e036ab7b3144` | 27 | npm ci 原始输出 |
| `03-lockfile-after.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | 与 before 相同 |
| `03-lockfile-compare.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 | 空 diff |
| `04-environment.log` | `5e154a25f3b79e22615400bab63199871c0bc509f7358e3849c0253e66881756` | 6 | 环境 |
| `06-typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | 4 | typecheck exit 0 |
| `07-typecheck-renderer.log` | `c39f84a800c8979056680c81bc1c9d0fc1cd0b8cf30560cf69f0be1ca800d93b` | 4 | typecheck:renderer exit 0 |
| `08-build-renderer.log` | `0d0e83d36496055e5ec4d538758e5ee8d5a6339919f057d1fafc34b0aa4b2eec` | 22 | build:renderer exit 0 |
| `11-baseline-composition.log` | `8b66164ecf6d5e20576e8623573d799f14aff13b062a7ff3f2d25aae22323ffa` | 15 | HEAD 组成与 f4c24ea..HEAD |
| `13a-suite-runtime-core.log` | `a416691613b77bffef2eb649ed26d116316f2af8ca2b50d548c127112b828d5a` | 384 | 325/318/3/4 |
| `14a-suite-orchestration.log` | `70827459e00f53a8749bde3004e89a7b5e7a37cbde44dd4a46629d3c6f59e860` | 1380 | 804/803/1/0 |
| `15a-suite-gate-engine.log` | `b20450d5a49780a6119287efdb9090baa4a3da48ccb7cabda8661e701ffb15d3` | 300 | 292/291/0/1 |
| `15b-suite-pm-shared.log` | `dcb1f3a7d70b84a7fef2139157caa6ae32a844a545ebd4c38ff0dfedd77e0bf0` | 187 | 176/171/0/5 |
| `16a-suite-desktop-app.log` | `b39febc2261f1642ed0d97b5309bb16e4b22cf338c1a8c1e0c2dd0c6897339ef` | 583 | 562/562/0/0 |
| `17a-suite-desktop-ui.log` | `388ea716fcfef408be336d0dfa2f9cee213223b974cdf79109d2ca101e2288ee` | 416 | 408/408/0/0 |
| `18a-suite-test-role.log` | `2479081eacc865b06538909d9c30704ed33d42b7c4498dd374f97623f723c58e` | 658 | 596/589/1/6 |
| `19-t3-file-list.txt` | `03eebf9f9b1e8653ebf20b13c0c04b1a8782e3de6656e84905a8dbaf00b48ae8` | 420 | T3 文件清单 |
| `19-t3-file-list-raw.txt` | `ed4ae32b76f23c4d7f5c21040f10cac91c399b9ce6884a578363778fed5d8e97` | 424 | 全部被跟踪 `*.test.ts`（含 3 个角色卡证据副本） |
| `19-t3-file-list-diff-vs-v3.txt` | `cad3a27f3fda0bb3c27f5df27e5cd5ef35682107344229d76046de057a9df26a` | 17 | 与 B0 v3 差异（+10 文件） |
| `19-t3-new-files-attribution.log` | `447baf709132a931ef36bb2eff534f373d577b295a0119fb9404aebc3db025d1` | 22 | 新增文件引入提交 |
| `20-t3-coverage-check.log` | `19f23125b8b4d02fdb3160ca06bcada978ae67fb8395b852439cbcb9c955ea17` | 1 | 覆盖校验 420/420 |
| `21-t3-prerun-status.log` | `0f40fd7cdd36c65c1111423e096cbe6599e3a681c0f662ccb760fa650539efb9` | 4 | 运行前检查（干净） |
| `22-t3-mid1.log` | `8d5de91945e48ce7ffe36534da564ce8920ee4c2b9b53036842141773730424f` | 2 | 运行中检查 1（干净） |
| `23-t3-mid2.log` | `cec46b06810e6a96b315c4c10b99b1a86c311b366fda5c5ca54c64f43e986cda` | 2 | 运行中检查 2（干净） |
| `24-t3-full-regression.log` | `1375a5090cde78ab0be38802587aca78d5985c316f9f0871899d06af2463a324` | 4957 | T3 全量第 1 次原始输出（权威） |
| `24-t3-full-regression-run2.log` | `d10a44c590e49047b093943d7ce8e9232759e11d22d1231500d5fd6bb03b92c3` | 358 | 第 2 次全量尝试（停滞中止，未汇总） |
| `24b-rerun-stuck-redispatch.log` | `7d24f7e9d67d12627f981495b43158ac7c9eea75a09604780aca8a14f0b78b88` | 18 | ENOTEMPTY 项隔离重跑 1（10/10） |
| `24b2-rerun-stuck-redispatch.log` | `914d2ab4c738e0f37c351ea1058096dbe1dcd76df4ac948ce5ffc89c95651484` | 18 | 隔离重跑 2（10/10） |
| `24c-rerun-g4-e-handler.log` | `3be44aef7f0dd016234476b9eee3f75f7d782cb41497e0a18d8b7ea82e21d7c2` | 14 | ENOTEMPTY 项隔离重跑 1（6/6） |
| `24c2-rerun-g4-e-handler.log` | `18f946155d6c206f8fa0eb066284d333531d786d3416942ae0171fa423bd4aa5` | 14 | 隔离重跑 2（6/6） |
| `24d-rerun-pair.log` | `1bd78326039f4dc6e669a8fa3c76db28c156c586c8a64a590616b6a6fa4e434e` | 24 | 两项合并重跑（16/16） |
| `24e-new-files-skip-check.log` | `6f79a4c6991f0943635fc218f58128cd3d0c80fd36ebd6c5d52670ab31ea22c0` | 81 | 10 个新增文件 73/73 pass、0 skip |
| `24f-rerun-installed-mcp-servers.log` | `e1ea25484bb503b501e2b02ac7eb31df0a7e77b7c8728b959c252be955375f8b` | 18 | 停滞疑点文件隔离重跑（8/8） |
| `25-t3-postrun-status.log` | `198a4e0e5868daa0c3568c99f877bcf785c95430fef544519e3a8aded866e502` | 6 | 运行后检查（干净） |
| `25b-t3-postrun-run2-status.log` | `ded0df4c29a4a8aba274742a0847c8d177b330b414f97bc3ca56a695061eb3e2` | 5 | run2 中止后检查（干净） |
| `26-electron-facts.log` | `e83da77983af5eee5e481776c4a2aeba27bfcde430ec44846bf79b21944cef77` | 5 | Electron 事实 |
| `27-closing-state.log` | `cd8121c3b88e54ff66550bdbdd97b43c5652cab1e3012307beee225d2a3edba9` | 11 | 收尾状态（干净） |
| `node-modules-count.txt` | `34f14f95d628a20e72158dab1a62b8761eee7573423dd87e317d917bf6ba29b1` | 1 | 顶层 377 项 |
| `npm-ci-start.txt` | `b58174f21fa1b20d1b6a47cd10f24362b92ef291b1454a5ebd9f71d263eddfb8` | 1 | npm ci 开始时间 |
| `npm-ci-end.txt` | `7920b6e945527a45171d73c656ac001a6a14a6100dd61376cd94b298bf6f2f52` | 1 | npm ci 结束时间 |
| `pi-adapter-explicit-files.txt` | `25e902d3feca2def15dc0b01cec02b474499ebbf14b8f3fccc04eae350f572bd` | 39 | pi-adapter 显式文件清单 |
| `run-t3.sh` | `49de095c64630d528fd6681595eb5aadc0cf8eb3f5ed7c780036c8a967683bee` | 49 | T3 执行脚本 |
| `make-index.sh` | `94375525d848a8c81bdfb1a9b36360b056e3b53635dcedb73b86f08c01e4f032` | 19 | 证据索引生成脚本 |
| `verify-t3-coverage.mjs` | `82218188d70dec03c65e36de6971fa0f4ae37709a063f96b49aa794f624a99d4` | 45 | T3 覆盖校验脚本 |

索引文件 `28-evidence-index.sha256` 收录以上全部文件与本记录（索引自身不入索引；其哈希见交付报告）；`sha256sum -c` 校验通过（`29-evidence-verify.log`）。
