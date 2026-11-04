# 变更记录：下载文件申请 B0 基线 v3（2026-11-04）— 状态：已认证

- 任务 ID：`2026-11-04-download-requests`
- 节点：B0 基线 v3（按统筹 2026-11-04 指令，在新合并基线 `f0adb49` 上重记；B0 v1/v2 保留为历史，**本版不复用其证据**）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- 纪律：只写 `角色卡/测试/docs/change/` 证据；不修改产品/测试源码；不 commit/push/暂存；不启动应用、不跑 E2E；未触碰其它角色文件。

## 1. 前置核对（开工实测，19:00:30–19:00:56）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| HEAD | `f0adb49058dd126b2b249cfa703993f65092f99b` | `f0adb49058dd126b2b249cfa703993f65092f99b` | 一致 |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| 产品/测试区（开工） | `git status --porcelain -- src app test` 为空 | 空 | 一致 |
| 暂存区 | `git diff --cached --name-only` 为空 | 空 | 一致 |
| Node / npm | v24.22.1 / 11.19.1 | v24.22.1 / 11.19.1 | 一致 |

`git log --oneline -4`（开工实测）：

```
f0adb49 Merge remote-tracking branch 'origin/main' into feat/download-requests
3c88fae feat(download): A1/A2/B1 candidates for download-requests
f4c24ea Merge pull request #60 from wangzhongren/fix/governance-write-card-customer-confirm
332e062 fix(desktop): 治理写卡（appointment-write）永不进判断器，必须客户本人确认
```

工作树既有非本角色改动（未触碰，仅披露）：H1 9 个治理文件（`boundary.md`/`boundary.yaml`/`changelog.md` × 运行时核心/编排/桌面窗口）；另有 **2 个 api-spec.md 修改**（`角色卡/运行时核心/api-spec.md` +10、`角色卡/项目管理/api-spec.md` +12，mtime 18:59:37，属 A1/A2 文档更新，见 §10）；`docs/planning/memo.md` 修改；若干 `.tmp-*.cjs`、`docs/**`、各角色 `docs/change/**` 未跟踪文件（含 P1/A1/A2 提案与实施记录）。`src app test` 开工干净。

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300，MSYS 3.6.10） |
| Shell | `/bin/bash.exe`（Git Bash / MinGW64） |
| Node | v24.22.1（win32 x64） |
| npm | 11.19.1 |

## 3. 依赖安装（`npm ci`）

- 结果：**exit 0**；墙钟 **36s**；`added 526 packages, and audited 527 packages in 36s`；`node_modules` 顶层 377 项。
- 完整性：`package.json` SHA-256 `51b63e73…b91400d`、`package-lock.json` SHA-256 `d6ee156e…8b7685`；安装前后完全一致（`03-lockfile-compare.txt` 为空 diff）。与 v1/v2 相同，本基线未改依赖。
- allowScripts 提示同前（4 个包 install script 未执行）；Electron 二进制未下载（§9）。

## 4. 基线组成（必须披露）

HEAD `f0adb49` 是 `3c88fae` 合并 `origin/main` `f4c24ea` 的 merge commit：

| 来源 | 内容 | 与 B0 v2（c2f1630）的关系 |
| --- | --- | --- |
| `f4c24ea`（origin/main，PR #59/#60） | PR #59 运行期文本去「su」角色泄漏；PR #60 治理写卡（appointment-write）永不进判断器、须客户本人确认。`c2f1630..f4c24ea` 共 26 文件、`+1302/-49` | 并入基线 |
| `3c88fae`（本地提交） | **A1/A2/B1 实施候选**：`src/model/download.ts`、`src/provider/download/**`、`src/service/download/**`、`src/pipeline/orchestration/download-request.ts`、i18n 下载 key、runtime tools/schema、新增 runtime-core/编排测试等，**49 文件、`+4972/-19`** | **B0 v2 之后新增的实现提交；B0 v3 基线包含该实施与测试** |

说明：统筹指令表述「与 v2 的差异需由 PR #59/#60 解释」。实测差异同时来自 **`3c88fae`（A1/A2/B1）** 与 PR #59/#60：前者解释运行时核心（+2 文件/+14 tests）、编排（+1 文件/+10 tests）、项目管理（+1 test）；后者解释桌面应用（+7 tests）。本记录按实测如实拆分（§7）。

## 5. H1 边界核对（19:01:56 完成）

- 命令：`node --test --test-concurrency=1 "test/门禁引擎/boundary-yaml.test.ts" "test/门禁引擎/boundary-yaml-validation.test.ts" "test/门禁引擎/boundary-empty-and-builtin.test.ts"`
- 结果：**exit 0**；3 文件、**25 tests / 25 pass / 0 fail / 0 skip**；`duration_ms 485.718`。
- 条目数：运行时核心 **19**、编排 **24**、桌面窗口 **83**；`boundary.md` 第 1 节行数与 yaml 条目数完全一致（19/24/83）。
- B-1..B-4 六条目在 md 与 yaml 均存在（行号同前：运行时核心 yaml:21 / md:13；编排 yaml:39/43/46 与 md:17/18/19；桌面窗口 yaml:237/240 与 md:81/82）。
- H1 diff：三目录合计 **10 文件、`+48`** = H1 9 文件 `+38`（boundary/changelog，符合闸门 2 B-1..B-4）+ `角色卡/运行时核心/api-spec.md` `+10`（A1 冻结说明，非 H1）；另有 `角色卡/项目管理/api-spec.md` `+12`（A2，不在三目录统计内）。**结论：H1 边界 B-1..B-4 落地无变化，门禁通过。**

## 6. 静态门

| 命令 | exit | 用时 | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 2s | `tsc --noEmit`（A1/A2 api-spec 曾披露的 `run-role.ts` 跨角色类型缺口已由 B1 补行，本树通过） |
| `npm run typecheck:renderer` | **0** | 0s | `tsc -p app/renderer/tsconfig.json` |
| `npm run build:renderer` | **0** | 3s | built in 503ms；仅 chunk-size / 动态导入提示；产物 `app/renderer/dist/` 已忽略 |

## 7. 受影响套件基线（逐组实测；★=与 B0 v2 的差异）

| 套件 | 文件数 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms | 与 v2 差异及归因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 41 ★ | 1 | 323 ★ | 316 ★ | 3 | 0 | 4 | 0 | 32,276.78 | +2 文件/+14 tests/+14 pass：`3c88fae` A1（download-contract、download-tool） |
| `test/编排/**/*.test.ts` | 61 ★ | 1 | 767 ★ | 766 ★ | 1 | 0 | 0 | 0 | 15,986.33 | +1 文件/+10 tests：`3c88fae` B1（download-policy.test.ts） |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 176 ★ | 171 ★ | 0 | 0 | 5 | 0 | 7,910.51 | +1 test/+1 pass：A2 i18n 下载 key 契约 |
| `test/桌面应用/**/*.test.ts` | 55 | **0** | 546 ★ | 546 ★ | 0 | 0 | 0 | 0 | 74,366.81 | +7 tests/+7 pass：PR #59/#60（write-safety、decision-service 测试新增） |
| `test/桌面UI/**/*.test.ts` | 54 | **0** | 405 | 405 | 0 | 0 | 0 | 0 | 5,839.65 | 无变化 |
| `test/测试/**/*.test.ts` | 91 | 1 | 581 | 574 | 1 | 0 | 6 | 0 | 79,244.29 | 无变化 |

失败 5 项（与 v1/v2 完全相同，全部 Windows symlink EPERM，`errno -4048`、`syscall symlink`）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 2 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 3 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 4 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 5 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |

与 A1/A2 实施记录的自报数一致：runtime-core 41/323/316/3/4、PM shared 176/171/0/5（本 B0 独立复现）。

## 8. T3 全量基线（认证）

### 8.1 口径与文件集

- 口径：`node --test --test-concurrency=1` 全量 `.test.ts`，**显式排除 `test/pi-adapter/write-sequencing.test.ts`**（既有已知挂起：3 个 test 打印 ✔ 后进程不退出；仓库验收文档有明确排除要求）。
- 文件数：全部 `.test.ts` 411，排除 1 = **410**；清单 `19-t3-file-list.txt`。与 v2 清单 diff = **+3 个新文件**（`test/runtime-core/download-contract.test.ts`、`test/runtime-core/download-tool.test.ts`、`test/编排/download-policy.test.ts`），无其它增删。
- 执行方式（同 v1/v2）：worktree 隔离沙箱拒绝 `$(find …)`/xargs/超长命令行，使用 **10 个目录 glob + 39 个显式 pi-adapter 文件** 的等价集合；静态覆盖校验 `expected=410 expanded=410 piExplicit=39 missing=0 extra=0`（`20-t3-coverage-check.log`）。

### 8.2 干净性检查（预/中×2/后，均空，未触发中止）

| 时点 | 检查 | 结果 |
| --- | --- | --- |
| 19:06:36（运行前） | `git status --porcelain -- src app test`；`git diff --cached --name-only`；HEAD | 空；空；`f0adb49`（`21-t3-prerun-status.log`） |
| 19:08:01（运行中 1） | `git status --porcelain -- src app test` | 空（`22-t3-mid1.log`） |
| 19:09:46（运行中 2） | 同上 | 空（`23-t3-mid2.log`） |
| 19:12:02（运行后） | 同上 + HEAD + staged | 空；`f0adb49`；空（`25-t3-postrun-status.log`） |

### 8.3 结果

- **exit 1**（完全由 9 项既有 EPERM 失败解释）
- **tests 3697 / pass 3670 / fail 9 / cancelled 0 / skipped 18 / todo 0**
- `duration_ms 276,071.7935`（约 276.1s）；运行区间约 19:07:2x–19:11:5x（运行前检查 19:06:36，运行后检查 19:12:02）
- 失败（9/9 全部 Windows symlink EPERM，与 v1/v2 逐项一致）：

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

- 跳过（18）：全部为源码内平台条件（`process.platform === "win32"` / `!posix` / root；含 1 项 `t.skip("chmod 语义在 Windows 不适用")`），与 v1/v2 相同。

### 8.4 与既往基线差异

| 基线 | 文件 | tests | pass | fail | skip | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| v1（f394cfb） | 407 | 3657 | 3630 | 9 | 18 | 历史 |
| v2（c2f1630） | 407 | 3665 | 3638 | 9 | 18 | 历史 |
| **v3（f0adb49）** | **410** | **3697** | **3670** | **9** | **18** | +3 文件（A1/B1 测试）；tests/pass +32 = runtime-core +14（A1）+ 编排 +10（B1）+ PM +1（A2）+ 桌面应用 +7（PR #59/#60）；fail/skip 不变 |

### 8.5 结论

- **新增确定性失败 = 0**（9 项均为既有 Windows symlink EPERM，与 v1/v2 名单逐项一致；无非 EPERM 失败、无超时）。
- **新增 skip = 0**（18 项均为既有源码内平台条件跳过）。
- B0 v3 认证成立：HEAD `f0adb49`、干净工作树、410 文件全量 T3、六组受影响套件、静态门、H1 核对齐备；D1 须以 §7/§8.3 清单逐项对照。

## 9. Electron 事实（未启动、未跑 E2E）

| 项 | 值 |
| --- | --- |
| `package.json` 声明 | `electron` `44.7.0` |
| 已安装包版本 | `44.7.0` |
| 二进制 | **不存在**：`node_modules/electron/dist/electron.exe` 缺失（包无 postinstall；需 `install-electron`） |
| 启动状态 | 未启动应用、未运行 Electron/E2E |

## 10. 限制与披露

1. **基线含实施提交**：`3c88fae`（A1/A2/B1 候选）在 B0 v3 基线内；本记录只做基线取证，不对其实现质量作结论。差异归因按实测拆分（§4、§7），修正统筹「差异由 PR #59/#60 解释」的表述：PR #59/#60 只解释桌面应用 +7，其余 +25 来自 `3c88fae`。
2. **H1 之外的治理改动**：`角色卡/运行时核心/api-spec.md`（+10）、`角色卡/项目管理/api-spec.md`（+12）为 A1/A2 文档更新（mtime 18:59:37），非 H1、非本角色、未触碰；H1 本体仍为 9 文件 +38。
3. **T3 执行形式**：沙箱限制下的等价集合（10 目录 glob + 39 个显式 pi 文件），已用静态覆盖校验证明与 find 清单完全一致（410/410，missing=0 extra=0）。
4. **依赖**：`npm ci` 报 21 个依赖漏洞告警（18 moderate / 3 high），仅记录，不构成本任务阻断。
5. v1/v2 记录与证据原样保留、未复用（本版所有计数均为本次实测）。

## 11. 收尾状态

| 项 | 值 |
| --- | --- |
| `git rev-parse HEAD` | `f0adb49058dd126b2b249cfa703993f65092f99b`（未变） |
| `git branch --show-current` | `feat/download-requests` |
| `git status --porcelain -- src app test` | 空（19:12:09 复核） |
| `git diff --cached --name-only` | 空（未暂存） |
| commit/push | 未执行（HEAD 仍为 `f0adb49`，无新提交） |

B0 期间产生的文件：本记录 + `角色卡/测试/docs/change/2026-11-04_download-requests-B0-evidence-v3/`（仅本角色目录；另有忽略产物 `node_modules/`、`app/renderer/dist/`）。

## 12. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-opening-state.log` | `0925d5d535ac4a214a95810522d1157a82cab44ea7e1f2f4af397d7eb09f1459` | 69 | 开工 HEAD/分支/log/状态快照 |
| `01-lockfile-before.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | npm ci 前哈希 |
| `02-npm-ci.log` | `c82b90a08824a77d5873afd6538e2f6a99ceb765f85b8c6cb6496b9b91e846bf` | 28 | npm ci 原始输出 |
| `03-lockfile-after.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | 与 before 相同 |
| `03-lockfile-compare.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 | 空 diff |
| `04-environment.log` | `99a71f76ecdd43f66b646896406c175356333b8ed62b62c701f62971e2b29273` | 12 | 环境 |
| `05-boundary-gate.log` | `9fbd8805b75ce25bb695a19f824417a7b507c3d531a182edbb7a83bfc6d23562` | 33 | 边界门禁 25/25 |
| `06-typecheck.log` | `928e2ceb66b85b520edb24ac0a2c79e01498045a3516dbfced40fa109a742f3b` | 5 | typecheck 0 |
| `07-typecheck-renderer.log` | `d619e822febd8b647cb4f0201514abde4bc7c81741f8f6964dc3ed7861f258a1` | 5 | typecheck:renderer 0 |
| `08-build-renderer.log` | `bb8327a2e057eb998ac2047f45987a2711c5da923ed6db53f2dc8c9250653014` | 23 | build:renderer 0 |
| `09-boundary-counts.log` | `95d02924ee3c538d9466950d7d885edc71345d0ca03f546f48e993b94abc00b0` | 17 | 19/24/83 与 B-1..B-4 |
| `10-h1-diff-stat.log` | `5d8107e7a609b35e407404aefba33f042091ccc81f716780968fbd7d722fa7ce` | 163 | 三目录 diff（10 文件 +48） |
| `11-baseline-composition.log` | `751d8cfe2b13aebcabf10f49126ee25ccce08a3026f7eaa0de9ae7288c4565c8` | 91 | PR #59/#60 与 3c88fae 组成 |
| `12-extra-governance-changes.log` | `9d170088e72dd9470a014f6695cff0c8be6e17d5f702d20e4d4922f71e65eb3f` | 47 | 两份 api-spec 非 H1 改动 |
| `13-suite-runtime-core.log` | `6bae08b14220ee942070bcc295351ccaec901e03c9fde9cf8ccce93f5ba10366` | 383 | 323/316/3/4 |
| `14-suite-orchestration.log` | `50f1a92c134e1c441810c3e34afb41ba2149327b06f27d660f568604e17aa56c` | 1344 | 767/766/1/0 |
| `15-suite-pm-shared.log` | `0badb9d23315db0fdd7c905f468db876531f6072482cea11ba5f493d62233912` | 188 | 176/171/0/5 |
| `16-suite-desktop-app.log` | `d4e512d0223f68517975c46c7a1407bd5f4477b807147e358d6698e6086b1d07` | 568 | 546/546/0/0 |
| `17-suite-desktop-ui.log` | `24bc21f8e2f0cf807132df8773bbd5e6871d9bbd2d7f1954192ca6766984eaaa` | 414 | 405/405/0/0 |
| `18-suite-test-role.log` | `067ed6440bbdc2a9a7e3c3c62a3eea856a19a0d559186c106059d439b4cd74f1` | 644 | 581/574/1/6 |
| `19-t3-file-list.txt` | `d40bc0065d3c738417694cd57e6c2d67a52601b89c718da9db55f1416236b70d` | 410 | T3 文件清单 |
| `19-t3-file-list-diff-vs-v2.txt` | `4d765926325c0c2f5fae7fd9c473d5f0831b8fa696fe61680d4e713465c78919` | 5 | 与 v2 差异（+3 文件） |
| `20-t3-coverage-check.log` | `918c6332e5599067b9a0cfb9c25971f2b81ce2cecc9e4cb24e1137b3124841f0` | 1 | 覆盖校验 410/410 |
| `21-t3-prerun-status.log` | `72a6901a54f4d0a43f4900d92efeb7a3def0a1dbf6a6e4c4671d48d02e18e9d2` | 6 | 运行前检查（干净） |
| `22-t3-mid1.log` | `a1a70b34a66c3e5c6e666a0863f9e2d9d7afed4d1524b962688d7ecc703bfeb2` | 4 | 运行中检查 1（干净） |
| `23-t3-mid2.log` | `47095c143022497c11e724e261b32b42b3f4f7794447ffa2fbb21688c945d89a` | 4 | 运行中检查 2（干净） |
| `24-t3-full-regression.log` | `cf4bc0f6a83c8f639ef0a7e2a90e9953135095b7c4bf9ebb49098a31496cb690` | 4801 | T3 v3 原始输出 |
| `25-t3-postrun-status.log` | `741ba71c805149c42ce0186a20e00494501c204fface55fd6e10e28bd20e7cb8` | 6 | 运行后检查（干净） |
| `26-electron-facts.log` | `2fdf4295570c8f6e6ef98ef6c9694e854bdd1d3ac3d615124d466fc363cb9f62` | 25 | Electron 事实 |
| `27-closing-state.log` | `c51b41a8db66d0fb3cdd8c24c1e83f2ed1e8352429099e6e2c93dc1ba3dc54a9` | 10 | 收尾状态（干净） |
| `verify-t3-coverage.mjs` | `d18331de019ef4c704205c18d5b6924c4339cad4ddbe3f629d9a8b88dff659b5` | 45 | T3 覆盖校验脚本（读 19-t3-file-list.txt） |

索引文件 `28-evidence-index.sha256` 收录以上全部文件与本记录（索引自身不入索引；其哈希见交付报告）。
