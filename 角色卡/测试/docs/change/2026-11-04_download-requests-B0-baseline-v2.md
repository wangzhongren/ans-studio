# 变更记录：下载文件申请 B0 基线 v2（2026-11-04）— 状态：已认证（干净重跑，见 §13）

- 任务 ID：`2026-11-04-download-requests`
- 节点：B0 基线 v2（按统筹 2026-11-04 指令，基线更新到 `c2f1630` 后重记；B0 v1 记录保留为历史）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- **结论（最终）**：**B0 v2 已认证**。第一次 T3 尝试（§7）因其它角色并发写入 15–16 个 `src app test` 文件而不可认证（历史事实保留于 §7、§10）；工作区由统筹恢复干净后，本角色在 **17:40–17:46** 完成受控重跑（§13）：开工/运行中两次/收尾共 4 次 `git status --porcelain -- src app test` 均为空，T3 全量干净完成，六组受影响套件与静态门均完成于同一 HEAD `c2f1630` 的干净树（复用理由见 §13.2）。结论：**新增确定性失败 = 0、新增 skip = 0**。

## 1. 前置核对（开工时实测，17:24 前后）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| HEAD | `c2f163087aaf11616e5be01f80d305bf6f25af57`（PR #58 合并） | `c2f163087aaf11616e5be01f80d305bf6f25af57` | 一致（领先 f394cfb 2 个提交） |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| 产品/测试区（开工） | `git status --porcelain -- src app test` 为空 | 空（开工核对时实测；随后被并发写入破坏，见 §10） | 开工一致 |
| H1 改动 | 9 个未提交治理文件保留 | 9 个修改（`+38` 行） | 一致 |
| Node / npm | v24.22.1 / 11.19.1 | v24.22.1 / 11.19.1 | 一致 |
| `node_modules` | 可重装 | 已存在（v1 安装）；v2 重新 `npm ci` | 一致 |

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300，MSYS 3.6.10） |
| Shell | `/bin/bash.exe`（Git Bash / MinGW64） |
| Node | v24.22.1（win32 x64） |
| npm | 11.19.1 |

原始记录：`21-environment.log`。

## 3. 依赖安装（`npm ci`，17:24:40 起）

- 结果：**exit 0**；墙钟 **26s**；`added 526 packages, and audited 527 packages in 25s`；`node_modules` 顶层 377 项。
- 完整性：`package.json` SHA-256 `51b63e73…b91400d`、`package-lock.json` SHA-256 `d6ee156e…8b7685`；安装前后完全一致（`02-lockfile-compare.txt` 为空 diff）。
- allowScripts 提示同 v1（4 个包未执行 install script）；Electron 二进制未下载（§8）。
- 可用性：**有效**（完成于 17:25 前后，早于并发写入）。

## 4. H1 边界核对（17:25:14 完成）

- 门禁命令：`node --test --test-concurrency=1 "test/门禁引擎/boundary-yaml.test.ts" "test/门禁引擎/boundary-yaml-validation.test.ts" "test/门禁引擎/boundary-empty-and-builtin.test.ts"`
- 结果：**exit 0**；3 文件、**25 tests / 25 pass / 0 fail / 0 skip**；`duration_ms 440.2641`。
- 条目数（当前；H1 前基线沿用 v1 已核实的 18/21/81）：运行时核心 **19**、编排 **24**、桌面窗口 **83**；md 第 1 节行数与 yaml 条目数一致（19/24/83）。
- B-1..B-4 六条目在 md 与 yaml 均存在（行号同 v1：运行时核心 yaml:21 / md:13；编排 yaml:39/43/46 与 md:17/18/19；桌面窗口 yaml:237/240 与 md:81/82）。
- H1 diff：9 文件、`+38` 行（仅条目/注释/changelog）。
- 可用性：**有效**（完成于 17:25:14，早于并发写入）。

## 5. 静态门（17:25:19–17:25:27 完成）

| 命令 | exit | 用时 | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 2s | `tsc --noEmit` |
| `npm run typecheck:renderer` | **0** | 1s | `tsc -p app/renderer/tsconfig.json` |
| `npm run build:renderer` | **0** | 2s | built in 458ms；仅 chunk-size / 动态导入提示；产物 `app/renderer/dist/` 已忽略 |

- 可用性：**有效**（均完成于 17:25:27，早于并发写入）。

## 6. 受影响套件基线（17:26:01–17:29:11 完成，均在并发写入前）

| 套件 | 文件数 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms | 与 v1 对比 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 39 | 1 | 309 | 302 | 3 | 0 | 4 | 0 | 31,494.17 | 同 v1 |
| `test/编排/**/*.test.ts` | 60 | 1 | 757 | 756 | 1 | 0 | 0 | 0 | 14,362.34 | 同 v1 |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 175 | 170 | 0 | 0 | 5 | 0 | 8,782.81 | 同 v1 |
| `test/桌面应用/**/*.test.ts` | 55 | **0** | **539** | **539** | 0 | 0 | 0 | 0 | 71,103.12 | **+8 tests（PR #58）** |
| `test/桌面UI/**/*.test.ts` | 54 | **0** | 405 | 405 | 0 | 0 | 0 | 0 | 5,400.33 | 同 v1 |
| `test/测试/**/*.test.ts` | 91 | 1 | 581 | 574 | 1 | 0 | 6 | 0 | 75,008.65 | 同 v1 |

失败 5 项与 v1 完全相同，全部为 Windows symlink EPERM（`errno -4048`、`syscall symlink`）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 2 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 3 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 4 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 5 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |

桌面包 +8 tests 来源：PR #58 对 `test/桌面应用/{decision-service,run-change-entry,version-decision}.test.ts` 的测试新增（见 §9）。

- 可用性：**有效**（六组均完成于 17:29:11，早于并发写入 17:31:38；该时点工作区为干净的 `c2f1630` 代码）。

## 7. T3 全量基线 v2 — **不可认证（执行期间工作区被并发修改）**

### 7.1 执行与结果（原始数字，仅记录，不得作为基线）

- 文件集：407 个（与 v1 完全一致；`13-t3-file-list-diff-vs-v1.txt` 为空 diff）；静态覆盖校验 `expected=407 expanded=407 piExplicit=39 missing=0 extra=0`。
- 执行方式：同 v1 的等价显式集合（10 个目录 glob + 39 个 pi-adapter 显式文件，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`），分属同一命令。
- 起止：2026-11-04 17:29:23 → 17:34:03（+0800）；日志完成时刻 17:34:01。
- 原始计数：exit 1；**tests 3665 / pass 3638 / fail 9 / cancelled 0 / skipped 18 / todo 0**；`duration_ms 274,407.8115`。
- 失败：9/9 仍为 Windows symlink EPERM，文件:行与 v1 完全一致（claude-adapter/session:639、codex-adapter/session:351、pi-adapter/injected-runtime:185 与 :193、runtime-core/file-write-safety:97、runtime-core/session-store:46 与 :58、测试/g4-skill-verify/b-render-double-check:182、编排/shell-authorized-routine:184）。
- 跳过：18 项，与 v1 相同的源码内平台条件（含 1 项 `t.skip("chmod 语义在 Windows 不适用")`）。
- 与 v1 差异：tests +8（3657→3665）、pass +8（3630→3638），与「桌面应用套件 +8（PR #58 新增测试）」一致；fail 9 与 skip 18 不变。

### 7.2 不可认证原因

T3 运行期间（17:29:23–17:34:03），**15 个 `src app test` 文件在 17:31:38–17:32:16 被外部并发修改**（`git status` 与 mtime 见 `25-contamination-status.log`）。Node 测试进程按文件逐个加载源码/测试，部分文件在修改前加载、部分在修改后加载，导致该次全量结果是**混合树**上的计数，不满足「干净基线」要求。T3 v2 的任何数字（含 fail/skip 分类）均不得作为 D1 对照基线。

- 写集重叠风险：修改涉及 `src/provider/runtime/{tools,schema}.ts`、`src/common/编排/*`、i18n messages、多个测试文件——均为其它角色路径，非测试角色可改动。

## 8. Electron 事实（未启动、未跑 E2E）

| 项 | 值 |
| --- | --- |
| `package.json` 声明 | `electron` `44.7.0` |
| 已安装包版本 | `44.7.0` |
| 二进制 | **不存在**：`node_modules/electron/dist/electron.exe` 缺失（包无 postinstall；需 `install-electron`） |
| 启动状态 | 未启动应用、未运行 Electron/E2E |

## 9. PR #58（f394cfb→c2f1630）披露与重叠面

- 提交：`61a5889 fix(desktop): 应用决策卡（run-change/版本决策）不再被「替我决策」代选` + `c2f1630 Merge PR #58`。
- 改动 9 个文件、`+1172/-3`：
  - `app/desktop/customer-input.ts`（+39/-0）：新增应用 decision 卡保留客户的判据与 `tryAutoSelectDecision` 早退。
  - `test/桌面应用/decision-service.test.ts`（+164）、`run-change-entry.test.ts`（+74）、`version-decision.test.ts`（+168/-3）：桌面应用测试新增（对应套件 +8 tests）。
  - `角色卡/桌面窗口/docs/change/` 下 4 个 patch + 1 个记录（+172 合计）——治理产物，不属于测试角色。
- **与 C1 写集重叠**：`app/desktop/customer-input.ts` 为 C1 计划写集文件；PR #58 为同文件不同区域加法（+39 行），C1 需合并并重跑受影响证据（按团队计划 §1.5 冲突归属：`app/desktop/*` 由桌面窗口解决）。
- 与 v1 基线（f394cfb）差异的可解释性：六组受影响套件与 T3 的唯一计数差异为桌面应用 +8 tests，与 PR #58 测试新增一致；但 T3 v2 因并发修改不能用于结论。

## 10. 并发写入（阻断证据，仍在持续）

- 捕获时间：17:34:39 / 17:35:25 / 17:35:37（15 个文件）；17:36:31 / 17:36:36（增至 **16 个**）。HEAD 无新提交（仍为 `c2f1630`）。
- 17:35:25 时 `git status --porcelain -- src app test` 非空，15 个 ` M`：
  `src/common/shared/i18n/messages/{en-US,zh-CN}.ts`、`src/common/编排/{finalize,governance-judge-prompt,handback,operator-channel,shell-judge-prompt}.ts`、`src/provider/runtime/{schema,tools}.ts`、`test/pi-adapter/dispatch-task.test.ts`、`test/桌面UI/judge.test.ts`、`test/桌面UI/phase3b-electron-smoke.mjs`、`test/桌面应用/e2e/uiux-v2.mjs`、`test/编排/{handback,shell-operator-only}.test.ts`。
- 17:36:36 增至 16 个：新增 `src/pipeline/orchestration/run-role.ts`（mtime 17:35:38）。**并发写入仍在进行，最终状态以统筹处置时点的 `git status` 为准。**
- 首批 15 文件 diff：15 files changed, **46 insertions(+), 46 deletions(-)**（批量等量改写，疑为其它角色的措辞/接口修复任务）。
- 首批 mtime：2026-11-04 17:31:38.022 – 17:32:16.039；新增文件 mtime 17:35:38.852。
- 本角色未改动、未回退、未暂存上述文件；按角色边界不能触碰他人写集。

## 11. 第一次尝试判定与请求（历史）

### 11.1 B0 v2 第一次尝试判定（历史）

**当时未通过（阻断）**（最终认证见 §13）。按任务规则「若任何前置不一致…停止后续并如实报告，不伪造通过」：

- 有效（可作为 `c2f1630` 干净代码的测量，待统筹确认）：npm ci、H1 边界核对（25/25）、三项静态门（0/0/0）、六组受影响套件（数字见 §6，均完成于并发写入前）。
- 无效：T3 v2 全量（执行中被并发修改，§7.2）；收尾工作区清洁性（当前**至少 16 个**产品/测试文件未提交修改，且并发写入仍在持续，§10）。
- 因此**不能给出**「T3 新增确定性失败=0、新增 skip=0」的认证结论；六组受影响套件层面未见新增失败/skip（与 v1 相同的 5 项 EPERM、15 项平台 skip），但不能外推到全量。

### 11.2 请求统筹协调

1. 由这些未提交文件（至少 16 个）的属主角色处置（提交或撤回/移出本 worktree），恢复 `git status --porcelain -- src app test` 为空；
2. 在独占窗口内重跑 B0 v2（至少 T3 全量与收尾复核；六组套件证据若统筹接受可复用）；
3. 若这 15 个文件将形成新提交，则基线 HEAD 再次变化，需按新 HEAD 重新记录；
4. 若确认这些修改属于授权中的实施工作，请明确 B0 应在哪个提交/树状态上认证。

## 12. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 | 可用性 |
| --- | --- | --- | --- | --- |
| `00-lockfile-before.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | npm ci 前 manifest/lock | 有效 |
| `01-npm-ci.log` | `172a6a40df9654e9b69987a9e7325e0f1872e3405e9e22c0b26a0e71024a9ed3` | 28 | npm ci 原始输出 | 有效 |
| `02-lockfile-after.sha256` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | 与 before 相同 | 有效 |
| `02-lockfile-compare.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 | 空 diff | 有效 |
| `03-boundary-gate.log` | `23d533ff825573e94e64f866a4df0499d09761f7525438e2df68dc1e88241c29` | 33 | 边界门禁 25/25 | 有效 |
| `04-typecheck.log` | `928e2ceb66b85b520edb24ac0a2c79e01498045a3516dbfced40fa109a742f3b` | 5 | typecheck 0 | 有效 |
| `05-typecheck-renderer.log` | `282c727db2718e0fe75db64d0ef3d034beb002c2317d97afcf596b8bda070b01` | 5 | typecheck:renderer 0 | 有效 |
| `06-build-renderer.log` | `7f996be5c3e76cea2a238861e2392648b1b1bcece0ef0ed37b22eb51e1cc346e` | 23 | build:renderer 0 | 有效 |
| `07-suite-runtime-core.log` | `dfb2323d23ffc2036d6d35d8e2ec61ddf7003153e2b75747bd7719ead1125f9c` | 369 | 309/302/3/4 | 有效 |
| `08-suite-orchestration.log` | `5c9f4cb3811540c7e2bc2a3a6dc8f2242b8bef5ea8189e723e6347be365e59dc` | 1334 | 757/756/1/0 | 有效 |
| `09-suite-pm-shared.log` | `b5b48480da8fadc74138fc5d51452b3157405d6a4fba4071e308a521f20fafd9` | 187 | 175/170/0/5 | 有效 |
| `10-suite-desktop-app.log` | `b1e42f773d0e3aedc5ff0311ff84ddc29cb94390ae4bc325a638f0ee4ba39b50` | 561 | 539/539/0/0（PR #58 +8） | 有效 |
| `11-suite-desktop-ui.log` | `14c35bf32b84a79ee51802b7f70c3d0369d2b696ec3ddfe035797e3bb773aa0f` | 414 | 405/405/0/0 | 有效 |
| `12-suite-test-role.log` | `dd754828c22bcdaaac30008fe4374b5ecf486b2ced86311e2a3a5afe3caa3db8` | 644 | 581/574/1/6 | 有效 |
| `13-t3-file-list.txt` | `dc1b1fff3c7c1c2b2e3248b7f703c7dacae193e910fe1935f0b3c0f57ca463b3` | 407 | T3 文件清单 | 有效 |
| `13-t3-file-list-diff-vs-v1.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 | 与 v1 完全相同 | 有效 |
| `14-t3-full-regression.log` | `7456e1bf63d8bd75cc4fea2da0478dfcd8e52855f6b92c71e03ad4d0ae522d40` | 4769 | T3 v2 原始输出 | **不可认证（§7.2）** |
| `16-t3-coverage-check.log` | `2d3033b6247ca36a56b9b1b2c0b5041116e8d719be83dacad9ba1663321a13c6` | 1 | 覆盖校验 407/407 | 有效 |
| `17-final-git-state.log` | `faef7b64fab0ed1403c8db23ebc56beb2ef90cc0024d184cbdfd11e4af951590` | 25 | 收尾 git 状态（非空） | 阻断证据 |
| `18-boundary-counts.log` | `3c1ecd76e6fbd04d60ea610db5f7b17dab3a87be26157868216e6bd5dc0de149` | 17 | 边界计数与 B-1..B-4 | 有效 |
| `19-electron-facts.log` | `2fdf4295570c8f6e6ef98ef6c9694e854bdd1d3ac3d615124d466fc363cb9f62` | 25 | Electron 事实 | 有效 |
| `20-h1-diff-stat.log` | `aa20c2996373fa134293d62196f3f9322bb8848a8551105caa217c871cde5c69` | 144 | H1 diff（与 v1 相同） | 有效 |
| `21-environment.log` | `9861795b867e6e8c2daaee9df80a1038a3d67b8edd0c9fdded2ea14eb14b5cd5` | 12 | 环境 | 有效 |
| `24-pr58-delta.log` | `5e2f01079dbb55e0fe93056a82beaab9740e16599c792fe0d35d7858ef6d00ea` | 16 | PR #58 提交与 diff stat | 披露 |
| `25-contamination-status.log` | `18948062c6aae2a5d2430f48f415389e60b218c9425ed6b38fa287694367fb38` | 65 | 并发写入/阻断证据（15 文件批次） | 阻断证据 |
| `26-contamination-update.log` | `d9d801b5a99f8cde112310ff96e76aac09e5d7d849c983afb28eff782f2bf5e4` | 25 | 并发写入更新（16 文件，仍持续） | 阻断证据 |
| `27-opening-clean-state.log` | `5f5d83f7a46f3e6e9a70201e8a21839fe2daccad530e55a37de845cd5d17e492` | 8 | 受控重跑开工状态（干净） | 有效 |
| `29-t3-rerun-mid1.log` | `c11d6c58d53ca4d0b7f0324505a2bdbc2570d0278feced229b365175ab69aac6` | 4 | 运行中检查 1（17:42:22，干净） | 有效 |
| `30-t3-rerun-mid2.log` | `524d84a0027c9ac8b72cdb8dc97a8d9fe02ed4b6e4ec8a6ad5d36ed81277c4ee` | 4 | 运行中检查 2（17:43:58，干净） | 有效 |
| `31-t3-rerun-post.log` | `df577298ea485a59d8e5584a9df2326af2a23d0b6b2d915b53442d57a1a19417` | 6 | 运行后检查（17:45:48，干净） | 有效 |
| `32-t3-rerun-clean.log` | `2ffc04eba4818a71c34f168e2790934939e52c9787cdace65528dc7480c4d60c` | 4769 | 干净重跑 T3 原始输出 | **有效（认证）** |
| `33-t3-coverage-check-rerun.log` | `2d3033b6247ca36a56b9b1b2c0b5041116e8d719be83dacad9ba1663321a13c6` | 1 | 重跑前覆盖校验 407/407 | 有效 |
| `verify-t3-coverage.mjs` | `594cf59919c12212ce3ba197fd9c87899a44d8675cf04ef2700907f57b72e40b` | 45 | T3 覆盖校验脚本 | 有效 |

索引文件 `22-evidence-index.sha256` 收录以上全部文件与本记录（索引自身不入索引；其哈希见交付报告）。

## 13. 干净重跑认证（2026-11-04 17:40–17:46）

### 13.1 干净性检查（4 次，均空）

| 时点 | 检查 | 结果 |
| --- | --- | --- |
| 17:40:38–17:40:43（开工） | `git rev-parse HEAD`；`git status --porcelain -- src app test`；`git diff --cached --name-only` | HEAD `c2f1630`；产品/测试区空；暂存空（`27-opening-clean-state.log`） |
| 17:42:22（运行中，约 1.5 min） | `git status --porcelain -- src app test` | 空（`29-t3-rerun-mid1.log`） |
| 17:43:58（运行中，约 2.5 min） | 同上 | 空（`30-t3-rerun-mid2.log`） |
| 17:45:48（运行后） | 同上 + `git diff --cached --name-only` | 空；HEAD 仍 `c2f1630`（`31-t3-rerun-post.log`） |

运行期间未出现任何 `src app test` 写入，按统筹要求未中止、未重试第二次。

### 13.2 复用证据（统筹授权，同一 HEAD c2f1630、干净树）

以下证据完成于并发写入（17:31:38 起）之前，均为干净树上的实测：

| 证据 | 完成时刻 | 结果 |
| --- | --- | --- |
| H1 边界门禁（3 文件） | 17:25:14 | 25/25 pass，exit 0（`03-boundary-gate.log`） |
| 静态门（typecheck / typecheck:renderer / build:renderer） | 17:25:19–17:25:27 | exit 0 / 0 / 0（`04`–`06`） |
| 六组受影响套件 | 17:26:01–17:29:11 | 数字见 §6（含 PR #58 桌面应用 +8 tests）（`07`–`12`） |

复用理由：同 HEAD（`c2f1630`）、同依赖（`npm ci` 17:24）、同命令/环境；各日志完成时刻早于并发写入，且结果与 v1 的差异仅 PR #58 可解释（桌面应用 +8 tests）。

### 13.3 干净重跑 T3 结果

- 文件集：**407**（`33-t3-coverage-check-rerun.log`：expected=407 expanded=407 piExplicit=39 missing=0 extra=0；同 `13-t3-file-list.txt`，与 v1 清单 diff 为空）；同一等价执行方式（10 目录 glob + 39 个显式 pi 文件，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`）。
- 原始输出：`32-t3-rerun-clean.log`（4769 行）。
- 计数：**exit 1；tests 3665 / pass 3638 / fail 9 / cancelled 0 / skipped 18 / todo 0**；`duration_ms 266,189.7972`（约 266.2s）；运行区间约 17:41:1x–17:45:4x（开工检查 17:40:43，运行后检查 17:45:48）。exit 1 完全由下列 9 项既有 EPERM 失败解释。
- 失败（9/9 全部 Windows symlink EPERM，`errno -4048`、`syscall symlink`；与 v1 及首轮污染运行逐项一致）：

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

- 跳过（18，与 v1 相同）：全部为源码内平台条件（`process.platform === "win32"` / `!posix` / root；含 1 项 `t.skip("chmod 语义在 Windows 不适用")`），分布 4+6+5+1+1+1。
- 与 v1（f394cfb：407 文件 / 3657 / 3630 / 9 / 18）差异：文件集相同 **407**；tests 与 pass 各 **+8**（来自 PR #58 的桌面应用测试新增，套件 531→539）；fail **9**、skip **18** 不变；无其它差异。
- 与首轮污染运行（§7.1）差异：聚合计数相同（3665/3638/9/18），但首轮无效（混合树），**本轮（干净树）为认证依据**。

### 13.4 最终判定

- **新增确定性失败 = 0**（9 项均为既有 Windows symlink EPERM，与 v1 名单逐项一致；无非 EPERM 失败、无超时）。
- **新增 skip = 0**（18 项均为既有源码内平台条件跳过）。
- **B0 v2 认证成立**：基线 HEAD `c2f1630`、干净工作树、407 文件全量 T3 与六组受影响套件、静态门、H1 边界核对齐备；D1 须以本清单（§6、§13.3）逐项对照。
