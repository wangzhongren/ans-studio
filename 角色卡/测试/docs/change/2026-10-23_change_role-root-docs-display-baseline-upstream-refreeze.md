# 上游快照重冻（补充记录）：角色根文档展示 S1 的 `src app test` 基线

- 日期：2026-10-23
- 角色：测试（Testing worker，独立子代理上下文）
- 状态：**S1 上游快照补充重冻（`upstream-refreeze`）**；不改写原 S1 基线记录，不构成实施/候选/验收结论
- 关联变更：flow_step_update 的 artifact.observed 时序修复（T2 小变更，v1.7.0）
- 关联基线：`角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md`（271 行；SHA-256 `a6aa70d53e7806baee108973692a460527995c3d041ab1a9e658abf561ccb353`。本记录只读引用，**未改写**；其历史快照 `af53fea6…` 保留原样）
- 重冻原因：artifact 时序修复改变了 `src/common/编排/flow-service.ts` 与 `test/编排/flow-service.test.ts`，S1 记录的 `src app test` 129 文件整体快照 `af53fea60be3efd6ca2f6ef1fdd4cbaabd60b64301e5f4ca7a8e8f2d98b9328e` 已不再是当前上游。

## 一、身份与环境

| 项 | 值 |
| --- | --- |
| 仓库 / 分支 | `C:\Users\51054\Desktop\work\ans-studio` / `main` |
| HEAD | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`） |
| 暂存区 | `git diff --cached --name-only` 为空（0 项） |
| 记录时间 | 2026-10-23 22:25–22:32 +0800 |
| Node / npm | v24.22.1（显式路径）/ 11.19.1（`npm.cmd`） |
| `src app test` 状态条数 | **121**（`git status --porcelain -- src app test`） |
| `src app test` 展开文件数 | **129**（`-uall`） |
| 全工作树状态条数 | 238（2026-10-23 22:26 捕获，含本重冻证据目录与管理文件；写入本记录与验证记录两个未跟踪文件后为 240。不是产品候选） |

## 二、重冻方法（可复算）

脚本：`tool-snapshot.mjs`（本目录），对 `git -c core.quotePath=false status --porcelain=v1 -z -uall -- src app test` 的 NUL 分隔记录解析（含 rename 双路径），按 UTF-8 字节序排序：

- 逐文件 `sha256sum`（缺失/非常规文件记标记，本次无缺失）；
- **整体快照** = `sha256( Σ "<sha256>  <path>\n" )`；
- **文件清单快照** = `sha256( Σ "<path>\n" )`。

复算方式：

```sh
sha256sum current-src-app-test-hashes.txt   # 应等于整体快照
sha256sum current-src-app-test-files.txt    # 应等于文件清单快照
```

## 三、新上游快照

| 项 | 值 |
| --- | --- |
| 文件数 | **129** |
| 整体快照（`src app test`） | **`36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c`** |
| 文件清单快照 | `26d5f4d0d71c08c8db0dfe514cb9d47580b106180e3c177f70550e2118677c48` |
| 文件清单 | `current-src-app-test-files.txt` |
| 逐文件哈希 | `current-src-app-test-hashes.txt` |
| 完整快照文件 | `current-src-app-test-snapshot.txt`；摘要 `current-src-app-test-snapshot.sha256` |

- 可复算核对：`sha256sum current-src-app-test-hashes.txt` = `36ae8c04…`；`sha256sum current-src-app-test-files.txt` = `26d5f4d0…`。
- 该快照是**规范化内容快照**，对 129 个文件逐一有哈希；不是某个证据文件的文件哈希。

## 四、与原 S1 基线的差异

### 4.1 文件清单

- S1 `worktree-start-src-app-test-files.txt` 的 129 条路径（C 风格引号转义）经反解后，与当前 129 条路径**完全一致**：仅 S1 有 0、仅当前有 0。
- 因此本次重冻没有新增/删除 `src app test` 路径。

### 4.2 逐文件哈希

| 项 | 数量 | 结论 |
| --- | --- | --- |
| S1 有内容哈希的路径 | 82 | **82/82 与当前逐字节一致** |
| S1 只有 `DELETED_OR_MISSING` 标记的路径 | 47 | 见 §4.3 |
| S1 清单总数 | 129 | 与当前一致 |

### 4.3 S1 证据缺陷与 47 个无基线哈希路径（重要）

- S1 的 `worktree-start-src-app-test-hashes.txt` 对 47 个**非 ASCII 路径**（`src/common/编排/…`、`test/桌面UI/…`、`test/测试/…`、`test/编排/…`、`test/项目管理/…` 等）写入的是 `DELETED_OR_MISSING  "<C 转义引号路径>"`，不是文件内容哈希。原因是 S1 生成脚本把 `git status` 的 C 风格引号路径当作字面文件名处理，47 条因此失败。
- 因此 S1 的“`src app test` 129 文件快照 `af53fea6…`”实际上只是 `worktree-start-src-app-test-hashes.txt` 这个证据文件的 SHA-256（已复算确认：`sha256sum` 该文件 = `af53fea6…`），**不是 129 个文件内容的规范快照**。S1 的 `worktree-end…` 与 `worktree-freeze-all…` 也有同样缺陷（全量冻结 691 条中 482 条为标记）。
- 本记录不改写 S1 基线记录，也不把该缺陷归因于本次修复；重冻记录提供规范快照供 S2 起使用。

对这 47 个路径，本次逐文件记录当前 SHA-256 并核对 mtime（`s1-comparison.txt` 的 `paths without S1 content hash` 段）：

| 项 | 值 |
| --- | --- |
| 无 S1 内容哈希的路径 | 47 |
| mtime 晚于 S1 冻结时点（2026-10-23 21:56:30 +0800） | **2**：`src/common/编排/flow-service.ts`（22:20:20）、`test/编排/flow-service.test.ts`（22:22:03） |
| 其余 45 个路径 mtime | 均早于 S1 冻结，最晚 `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` 20:52:09 |

**差异结论**：S1 之后 `src app test` 的变化**仅来自本次 artifact 修复的 2 个文件**；其余 127 个文件由 82 个逐字节哈希一致 + 45 个 mtime 早于 S1 冻结共同确认。

## 五、角色根文档展示目标文件：未变

对照 S1 `target-hashes.txt`（34 个条目，2026-10-23 21:48:29 +0800）：

- **33 个当前文件 SHA-256 与字节数逐项一致**；
- **1 个（`app/renderer/src/chat/profile-docs.ts`）仍按预期不存在**（S1 计划新增文件，S1 时即不存在）；
- **0 个变化**。

代表性目标文件（完整逐项见 `target-files-comparison.txt`）：

| 文件 | `git hash-object` | SHA-256 | 结论 |
| --- | --- | --- | --- |
| `app/desktop/project.ts` | `e5d24d22b951ec7152facf62a6e2260073ec45f0` | `d69c79294109ebb2bafa248631be558193a5b421b4249070a9b2abc2a6dd45d2` | 未变（23,615 B） |
| `app/desktop/interface.ts` | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` | 未变（336,550 B） |
| `src/model/project-document.ts` | `980504823f3dd35b48801663d52be6c99d1f7c2f` | `bdae97e739d18bbe3a7da7b79f231fab5954d0c056bc4888e6598dae8e556d72` | 未变（1,843 B） |
| `app/renderer/src/shell/ProfilePanel.tsx` | `43225790b26324059edc75173f63443014fe7072` | `3cc118d1c0dd7d99613811e644f72d51c23dddd27d182385f30c18a26e35a20d` | 未变 |
| `app/renderer/src/shell/DocumentView.tsx` | `2305e62ca0f58754f9d2c9cd7d4a3473337dc7f1` | `55d05c5d213dfe01b4a6a78e668f8e9bc44c627325f7d839bceaebdd9bd3ced0` | 未变 |
| `app/renderer/src/chat/document-view.ts` | `902269c10bcc7b02fcefa44c80dc906dda025b71` | `4bf32a9d34f7ded97f2e1a83d7a10f3966d69142aa5178910080c608854be3ff` | 未变 |
| `app/renderer/src/chat/types.ts` | `fb42aae9775b3342d12da3ae5668e2f7b50bd144` | `720c0663bd909e3904ad594eba8025161edd2fc5c01f12f8f0e46bb2663d27b8` | 未变 |
| `app/renderer/src/stores/drawer-store.ts` | `4f40b1507b4cc5650b0c9f604ef7f9586e07830f` | `4cb2431a0e658f54d225f245c98582db71e63cb543ec56e27e2d61579197fda1` | 未变 |
| `app/renderer/src/shell/phase4a.css` | `cf877d7878b968352cc9b0c9418769e445944112` | `052ea23040804e4ab2872c2a6b6813ba816db92f0c1e90d3c7ae2c0393391100` | 未变 |

- Service/Pipeline/Provider 文件（`src/service/project-document/**`、`src/pipeline/project-document/**`、`src/provider/project-document/**`）、i18n messages、以及 `test/桌面应用/project.test.ts`、`test/桌面应用/project-document.test.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/e2e/main.mjs`、`test/桌面UI/document-view.test.ts`、`test/桌面UI/role-view.test.ts`、`test/桌面UI/phase4a-electron-smoke.mjs`、`test/桌面UI/phase4a-smoke-preload.cjs`、`test/桌面UI/source-guard.test.ts`、`test/测试/p1p7-document-integration.test.ts`、`test/测试/i18n-integration.test.ts`、`test/项目管理/shared/i18n{,-guard}.test.ts` 均逐项一致。
- **边界文件 8/8 未变**（`角色卡/{桌面窗口,桌面UI,项目管理,测试}/boundary.{md,yaml}`，见 `boundary-comparison.txt`）。

## 六、S2 使用约定

1. **S2 起以新快照 `36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c` 作为角色根文档展示任务的上游 `src app test` 基线**；以 `current-src-app-test-files.txt` / `current-src-app-test-hashes.txt` 做候选前后对照。
2. 原 S1 记录及其历史哈希 `af53fea6…`、目标文件表、基线结论保留不变；本记录只是补充上游快照，不替换、不改写 S1 记录。
3. 角色根文档展示候选仍应只包含相对 S1 目标表的增量；本次 artifact 修复的 2 个文件是**另一个独立 T2 变更的候选**，不并入角色根文档展示候选；S2 若触及同一文件必须按新快照说明来源与窗口。
4. 若 S2 开始前上游继续变化，按本记录 §二方法重新计算并再次冻结；不要在旧的 `af53fea6…` 上继续累加。

## 七、残余与说明

1. **S1 证据缺陷**：47/129 非 ASCII 路径缺内容哈希（`DELETED_OR_MISSING` 标记），全量冻结快照同缺陷；本记录已提供规范替代，但不追溯改写 S1 证据目录。
2. **管理文档漂移（非本变更候选）**：S1 之后新增 `docs/planning/2026-10-23_design_artifact-observation-race.md`、`角色卡/编排/docs/change/2026-10-23_change_artifact-observation-race.md` 与证据目录；`docs/communication/2026-10-23_intent_artifact-observation-race.md` 从 46 行更新为 54 行（补闸门 1 授权）；`docs/planning/memo.md`、`docs/communication/memo.md` 有更新。均不属于 `src app test` 上游快照范围。
3. **全量工作树未重冻**：本记录只重冻角色根文档基线所需的 `src app test` 范围；S1 的全量冻结 `ace00e17…`（691 文件）未重算，且同样受 §七.1 引号缺陷影响；若后续需要全量快照，应按规范方法重新生成。
4. **未提交**：本记录与两个证据目录不进入暂存；未 commit/push/合并/发布。
5. **Windows 环境**：路径大小写/编码按 Git Bash 与 `core.quotePath=false` 处理；换平台复算时需保持同一排序与行格式（`<sha256>  <path>\n`）。

## 八、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-role-root-docs-display-baseline-upstream-refreeze-evidence/`

| 文件 | 内容 |
| --- | --- |
| `current-src-app-test-snapshot.txt` | 新快照完整输出（计数、整体/清单哈希、129 路径、逐文件哈希、JSON 明细） |
| `current-src-app-test-files.txt` / `current-src-app-test-hashes.txt` | 129 文件清单 / 逐文件 SHA-256（可复算整体快照） |
| `current-src-app-test-snapshot.sha256` | 新整体快照摘要 |
| `current-status-readable.txt` | 当前全工作树 `git status`（`core.quotePath=false`，22:26 捕获） |
| `final-status-readable.txt` | 写入记录后的最终全工作树 `git status`（240 条；相对 22:26 捕获只新增两条测试角色记录） |
| `current-counts-and-mtimes.txt` | 状态条数、文件数、两候选 mtime、S1 冻结后 `src app test` 变更文件 |
| `s1-comparison.txt` | 与 S1 清单/哈希/mtime/目标文件/边界文件的逐项对照与差异列表（`(none)`） |
| `target-files-comparison.txt` | 34 个目标文件的 S1 哈希 vs 当前哈希（33 unchanged、0 changed、1 absent-as-expected） |
| `boundary-comparison.txt` | 8 个边界文件哈希对照（8/8 UNCHANGED） |
| `tool-snapshot.mjs` / `tool-compare-s1.mjs` | 重冻与对照脚本（只读） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |
