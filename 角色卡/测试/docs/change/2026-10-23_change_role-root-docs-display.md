# 变更记录：角色根文档展示 S6（集成/真实 Electron/候选核对，测试角色）

- **任务 ID**：`2026-10-23-role-root-docs-display`｜**产品 flowId**：`role-root-docs-display`
- **角色**：测试（Testing worker，独立子代理上下文）
- **日期**：2026-10-23
- **阶段**：团队计划 S6（跨层集成、真实 Electron、候选/写集核对、证据）
- **风险档位**：T2
- **状态**：**verified-by-tests-only（当前 Windows 候选上的测试验证已完成）**。这是测试角色的验证记录，**不是验收结论**；不声称 P1–P10 pass，不替代内置独立验收；未 commit / push / 暂存 / 合并 / 发布；未写目标项目。
- **客户授权**：`docs/communication/2026-10-23_intent_role-root-docs-display.md`「实施授权记录（2026-10-23）」按团队计划 v1 与 T2 标准 v1 实施 S2–S7（不含 commit/push/发布/目标写入）。
- **依据版本**（2026-10-23 实测复算一致）：
  - 团队计划 v1：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`；§3.6、S6、§五/§六）
  - 方案 v1：`docs/planning/2026-10-23_design_role-root-docs-display.md`（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；§8.2–§8.5、Q9 A）
  - 验收标准 v1：`docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`；P1–P10）
  - S1 基线：`角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md`（SHA-256 `a6aa70d53e7806baee108973692a460527995c3d041ab1a9e658abf561ccb353`，未改写）；上游重冻 `…-baseline-upstream-refreeze.md`（`src app test` 快照 `36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c`；记录 SHA-256 `9b77fef41a805f9da2897396392b40a7ca7705e7be3f7cd5e607abfc4afa52ac`，未改写）
  - S2+S3 记录：`角色卡/桌面窗口/docs/change/2026-10-23_change_role-root-docs-display.md`；S4：`角色卡/桌面UI/…`；S5：`角色卡/项目管理/…`（逐文件候选哈希以各自证据为准）
- **候选**：分支 `v1.7.0-work`，HEAD `6407d636b69e3f8eb12fb872e2622172bcbff583`；逐文件候选哈希见本记录 §二与证据 `s6-candidate-hashes.txt`。

## 一、环境

| 项 | 值 |
| --- | --- |
| OS / Shell | Windows 11 Pro 10.0.26300 / Git Bash 5.3.15 (MINGW64) |
| Node / npm | v24.22.1（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）/ 11.19.1（`npm.cmd`） |
| Electron | v44.7.0 |
| 仓库 / 分支 / HEAD | `C:\Users\51054\Desktop\work\ans-studio` / `v1.7.0-work` / `6407d63` |
| 暂存区 | `git diff --cached --name-only` = **0** |
| 全工作树 status | S6 开工时 168 条（含既有管理文档、S1–S5 记录/证据、`demos/`、`.claude/`；S6 证据写入后增加，均不计候选） |
| 记录时间 | 2026-10-23 23:36–23:58 +0800 |
| 原始记录 | `s6-environment.txt`、`s6-git-status-full.txt`、`s6-command-summary.txt` |

## 二、候选/写集核对

### 2.1 候选身份

- 17 个产品/测试文件（15 改 + 2 新增）全部在团队计划 §3.2–§3.5/§八.2 写集内；逐文件 `git hash-object` + `sha256sum` 与 S2/S3/S4/S5 记录**逐项一致（0 mismatch）**，见 `s6-candidate-hashes.txt`。
- 计算方式：`git hash-object <path>` + `sha256sum <path>`（worktree 原始字节）+ `wc -c`；S2/S3 记录的 baseline/candidate blob、S4/S5 记录的 candidate blob 全部命中。

| 文件 | 候选 blob | 候选 SHA-256 |
| --- | --- | --- |
| `src/model/project-document.ts` | `e501ff31112a6f6534489102af47be9250135ba9` | `0cc0827309cc66ac152a654c42e082841b5af89bc1ce29a02ef9c6d8158ab2e3` |
| `src/service/project-document/impl/read-project-document.ts` | `ef66fa6901ee720ac13efcbcc287e73825971b58` | `1895cac3bc3bff339475a49dec87cd13cf8cf861c346596610163af365e1393f` |
| `app/desktop/project.ts` | `47b41f644169e87c6f22fef87906963d6981cbc1` | `06f0480997f0954a08f258638984af90b6c4b28b10310f55c6c0878660f20438` |
| `app/desktop/interface.ts` | `b28ba1a5d16540db208e5aca123baf2eeff851a6` | `29c12b331f2412995c232811e54072e4c7c4420f0fa50c4461cc9db99c75e30b` |
| `test/桌面应用/project.test.ts` | `2f7bad44dfcbad7e9958325ce73aed56cb8b4d53` | `c476fa95f120dceda66ddf58dd434394f10dbe42a96c9efe7aaa42a672619634` |
| `test/桌面应用/project-document.test.ts` | `3699d75248361746f7a0d6fb2efb68000379a8f8` | `b1bf71888e206cab3b28ca73cb359b3c8c6e21c9888b47552042245f15745b9d` |
| `test/桌面应用/interface.test.ts` | `5715173679ca724a53e832777bf4c48c7f3fb047` | `4f5f7488ec2ff9fe2f53e6c174dc6a4678f9d30d61573169cc9ce1d8fee7c745` |
| `app/renderer/src/chat/types.ts` | `098f4658971f59ae41f421e521dc1bf55ee29600` | `a96cc9dfc0ea0931ed17bf60b9f622db5fe863cf579da5ef86bbeb463b136ecc` |
| `app/renderer/src/shell/ProfilePanel.tsx` | `a67c83a6713729109e933c9cf3314f649bf972e3` | `6b1c83d271afda2b18e4c39b6c0a29ccea8de3adf37313074bf259bdeea8d29b` |
| `app/renderer/src/stores/drawer-store.ts` | `8f0b47551af096d6542e445121141816744c9e7d` | `33ad9bfd63e92ff2f6be5252575bd39407212284a7f68b423e31022640904ea0` |
| `app/renderer/src/shell/phase4a.css` | `bc235d74c12940e60fe08e7062356a82cec1bf4c` | `944dc3dddbb9cea412cf743ab839590aecea11f6bb84a8399549c5cd8e7d425f` |
| `test/桌面UI/phase4a-electron-smoke.mjs` | `a94a5efcbfd4ec03990cc450fd15fdaa51f9d34d` | `fb32c7ab57809ddd089983ae352087516e8ed04f85e139e030449e9c1ed99479` |
| `app/renderer/src/chat/profile-docs.ts`（新增） | `de20311a7e04139d00ebad383743576536f8115b` | `d4a11e865c577db8b75359f0ee2846c7812cfb11b09b7dde536d4c477dba1d3f` |
| `test/桌面UI/profile-docs.test.ts`（新增） | `971778432601f2ce758f66d818a7065a72fa34d5` | `ea393edbb5ac0a3ee1c08a4918b3e2078a46f2681f2dc4063bead9f13d37f386` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `5700649eccc1255a3b616073a32f42d23ebeb6cb` | `c37fc29f91b5419595e3a65171ade3cad917c389b53de456a536b6979d7d9255` |
| `src/common/shared/i18n/messages/en-US.ts` | `183eddea3473701315b44c6f7be9754705051051` | `37e4ad6c08f8678b2bd3372dd44594f9040a88382f2f99194e363b3b5b4e4d0d` |
| `test/项目管理/shared/i18n.test.ts` | `1b8a35c5de5771b179fd66a6f2cd3d5b5b4e6d6c` | `048d2be66863b1f98e147f2111934123371df27f2d363ab3cc84fac9fd7d3c72` |

### 2.2 零改动与边界

- `git diff --stat -- src/provider/project-document app/preload.cjs app/main.ts package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml` **为空**；`git status --porcelain` 同路径为空（Q9 A / 无新 IPC / 无构建配置改动）。
- `test/桌面应用/` 只有 3 个既有文件 `M`，**0 个新文件**；`e2e/main.mjs` 未改。
- 角色卡/边界：4 个角色 × `boundary.md`/`boundary.yaml` **8/8 与 S1 上游重冻哈希一致**；`role-card.md` 0 改动（`s6-boundary-hashes.txt`）。
- 按需未改文件保持 HEAD blob：`app/renderer/src/chat/document-view.ts`、`app/renderer/src/shell/DocumentView.tsx`、`test/桌面UI/document-view.test.ts`、`test/桌面UI/phase4a-smoke-preload.cjs`、`test/桌面UI/source-guard.test.ts`、Service abstract/public、Pipeline（`s6-zero-diff-and-writeset.txt`）。
- 契约 additive：`RoleView.rootDocs?`、`ProjectDocumentRoleCandidates.rootDocs?`、索引 `rootDocs?`；候选 diff 中**无新增 IPC/preload/channel 行**（`s6-contract-additive.txt`）。
- 非候选状态条目：`docs/communication/*`、`角色卡/项目管理/{docs/project-rules.md,memo.md}`、S1–S5 记录/证据、`docs/communication/2026-10-23_intent-print-logging-rule.md`、`demos/`、`.claude/`；均不是本变更候选，也不为其背书（`s6-writeset-classification.txt`、`s6-noncandidate-status.txt`）。
- `app/renderer/dist/` 是 `.gitignore:9` 的构建产物，不是候选（`s6-post-run-status.txt`）。

### 2.3 S1 基线对照

- 与 S1 上游重冻 `36ae8c04…` 的 129 个“当时脏/未跟踪”路径逐文件对照：**119 same / 10 changed / 0 missing**。
- 10 个 changed 都是 S1 时已脏、本变更继续修改的文件（`interface.ts`、`project.ts`、`types.ts`、`ProfilePanel`、`drawer-store`、`phase4a.css`、`zh-CN`、`en-US`、`interface.test.ts`、`i18n.test.ts`）。
- 5 个候选修改文件在 S1 时是干净文件，故不在 S1 脏清单（Model、Service impl、`project.test.ts`、`project-document.test.ts`、`phase4a-electron-smoke.mjs`）；2 个是新文件（`profile-docs.ts`、`profile-docs.test.ts`）。
- 结论：相对当前 HEAD `6407d63` 的 `src app test` 工作树增量恰好是 17 个候选文件；S1 脏清单中 119/129 未变，10 个候选文件继续修改，未发现候选之外的内容变化。HEAD `6407d63` 是上游收口提交（checkpoint accepted i18n 等），不属于本候选；S1/重冻记录本身未改写（`s6-s1-snapshot-comparison.txt`）。

## 三、受影响套件（当前候选，原始输出见证据）

| 套件 | 命令 | 退出码 | 计数 | 失败分类 |
| --- | --- | --- | --- | --- |
| 渲染层 | `node --test "test/桌面UI/**/*.test.ts"` | 0 | **209 / 209 pass**，0 fail/0 skip/0 todo | 全部通过（含 `profile-docs.test.ts` 14 例） |
| 桌面应用目标 | `node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` | 0 | **164 / 164 pass**（23 + 20 + 121） | 全部通过；含 Windows fail-closed、memo/非法候选、旧 docs 不回归 |
| 测试角色跨层（两文件） | `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/测试/i18n-integration.test.ts` | 0 | **10 / 10 pass**（2 + 8） | 全部通过 |
| S2/S3 跨层回归（三文件） | 上条 + `test/桌面应用/su-effective-boundary.test.ts` + `test/桌面应用/genesis-bootstrap.test.ts` | 0 | **13 / 13 pass** | 与 S2/S3 记录一致 |
| i18n 单元 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | **186 tests / 181 pass / 5 skipped / 0 fail** | 5 skip 为既有 Windows `atomic-write` finalMode 平台跳过，与本变更无关 |
| 根类型检查 | `npm.cmd run typecheck` | 0 | 无诊断 | 通过 |
| 渲染类型检查 | `npm.cmd run typecheck:renderer` | 0 | 无诊断 | 通过 |
| 渲染构建 | `npm.cmd run build:renderer` | 0 | 构建成功；仅既有 >500kB chunk 警告 | 通过 |

> 任务说明中的“p1p7 + i18n-integration 预期 13/13”与实际文件计数不符：两文件是 2 + 8 = 10。13/13 是 S2/S3 的三文件跨层命令（再加入 `su-effective-boundary` 与 `genesis-bootstrap`）。两种命令本次均全绿；证据分别见 `s6-test-cross-layer.log` 与 `s6-test-cross-layer-regression.log`。

> T2 口径：未默认跑全量 T3 回归；本次覆盖受影响套件、跨层集成、真实 Electron、typecheck 与渲染构建。测试角色未修改任何被测断言、未跳过用例；所有计数来自原始日志。

## 四、真实 Electron

### 4.1 未改动的 `test/桌面应用/e2e/main.mjs`（两次）

- 命令：`./node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs`（`ANS_E2E_OUTDIR` 指向 fresh temp）。
- Run 1：exit **0**；`E2E_PASS=true`；`E2E_FAILURES=` 空；报告 `s6-e2e-run1-report.txt`，截图 `s6-e2e-run1-04-profile.png`。
- Run 2：exit **0**；`E2E_PASS=true`；`E2E_FAILURES=` 空；报告 `s6-e2e-run2-report.txt`，截图 `s6-e2e-run2-04-profile.png`。
- 真实应用诊断中观察到 `role-docs.index`、`project.listing.root-docs`、`project-document.listing.unavailable` 事件；未见崩溃/未处理错误（既有测试注入的修复探针错误为预期夹具）。

### 4.2 Phase 4A 受控冒烟（S4 已扩展 rootDocs 9 项）

- 当前候选 Run 1：**108 checks / 10 failures / exit 1**（`s6-phase4a-smoke-current.log`、`s6-phase4a-report-current.json`）。
- 当前候选 Run 2：**108 checks / 10 failures / exit 1**，失败集合与 Run 1 **完全相同**（`s6-phase4a-smoke-run2.log`、`s6-phase4a-report-run2.json`）。
- 干净 HEAD `6407d63` 基线（`git archive` + 重建 renderer）：**99 checks / 12 failures / exit 1**（`s6-phase4a-baseline-head.log`）。
- 分类：**当前 10 个失败全部是 HEAD 基线 12 个失败的子集；新增失败 = 0。** 2 个基线失败在当前候选通过：`DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS`（S4 queueMicrotask 兜底）与 `QUEUE_SUBVIEW_ESC_RETURNS_WORK_AND_FOCUS`（基线 rAF/时序浮动）。失败集中在既有设置字段/键盘、滑块、队列/抽屉焦点族；S4 诊断（隐藏窗口 220ms 仅 1 个 rAF tick）解释焦点类。详见 `s6-failure-classification.txt`。
- S4 新增的 9 项 root-doc 检查在两次当前运行中**全部 pass**：两组/顺序/count、按钮 title/aria、Windows 不可用、返回焦点、只读阅读态、refs 追加、`api-spec` 普通文本、B 空态、200% 可达。

### 4.3 真实应用 root-doc 探针（补齐未改动 e2e 未断言的 DOM）

- 未改动的 e2e 只记录 `RIGHT_HAS_DOCS=true`，没有 root-doc DOM 断言；为在**真实应用/真实仓库/Windows** 验证“三个文件名 + 点击不可用”，S6 在仓库外运行了同一 harness 的受控副本（`s6-probe-real-electron-script.mjs`；与 `e2e/main.mjs` 的差异见 `s6-probe-script.diff`），使用真实 preload、真实 renderer、真实 `createDesktopInterface` 与真实仓库 `角色卡/桌面窗口`。
- 最终 Run 3：`S6_ROOT_DOCS_THREE_NAMES_ORDER=true`（`角色卡/桌面窗口/feature-map.md` → `functional-description.md` → `api-spec.md`）；`S6_ROOT_DOCS_GROUPS_ORDER=true`（root → subdir）；`S6_ROOT_DOCS_MEMO_ABSENT=true`；`S6_ROOT_DOCS_CLICK_UNAVAILABLE=true`（停留列表态、`hasBody=false`、错误原文 `当前环境暂不支持安全读取项目文档。`）；`E2E_PASS=true`；`E2E_FAILURES=` 空。
- 截图：`s6-probe-root-docs-profile.png`（三根文档+副标签+docs/ 组）、`s6-probe-root-docs-unavailable.png`（结构化不可用、无正文）。
- 该副本**不是**产品/测试改动，未写仓库；仅作 S6 证据工具。先前两次探针迭代（重新授权前/断言过宽）保留在 `pre-final-probe/`，不作为产品失败。

## 五、角色根文档场景

完整的 17 项场景矩阵见 `s6-root-docs-scenarios.txt`（来源：Phase4A 原始输出、真实应用探针、受影响套件）。要点：

- 有 3 根文档 + docs/：两组、固定顺序、count = 3 + docs 文件数（Phase4A 103 = 3 + 100；真实仓库 311）。
- 部分缺失/无根文档/内置角色：只显示存在项、诚实空态（`ui.profile.noRoleDocs`）；不伪造。
- 角色根 `memo.md` 永不出现；`role-card.md`/`boundary` 不重复；`changelog.md` 保持独立、可选。
- `docs/` 遍历/排序/上限不回归；既有 refs 前缀不变，根文档 refs 追加在后。
- 根文档可点击：有 ref/scope 时进入既有 `DocumentView` 只读阅读态；Windows 无 refs 时停留列表态并显示既有结构化错误。
- `api-spec.md` 的 `not-applicable` 按普通 Markdown 文本展示，无 badge/特殊错误。
- 焦点回根文档按钮；200%/960 下按钮可达、无水平溢出。
- zh/en 标签齐全，文件名/路径/`not-applicable` 不翻译。

## 六、Windows / POSIX 边界

- **Windows（本次实测）**：索引元数据可列三个文件名；点击不建立 scope/不铸造 refs/不返回正文，显示既有 `UNSUPPORTED_ENVIRONMENT` 文案；真实应用探针 `hasBody=false`。不以“文件存在”冒充“正文可读”。Windows fail-closed 测试断言 `serviceReads=0`、`checkpoints=0`、无 scope/refs，且 fixture 字节/mtime 不变；诊断测试另用 `read: throw "must not read"` 桩断言不可读。真实仓库三个根文档 `git status` 干净、mtime 均早于 S6 运行（`s6-root-doc-fixture-integrity.txt`）。
- **POSIX（macOS/Linux）**：**未执行**。当前环境为 Windows 11，无法运行真实 POSIX Provider 的正文读取、符号链接/竞态与 mtime 断言；`project-document.test.ts` 在 Windows 上走 `assertWindowsFailClosed` 分支，POSIX 实读断言未执行。**不得用 Windows 结果替代 POSIX 证据。**
- 影响：独立验收按标准 v1 P5 可能判 POSIX 子项 `insufficient evidence`，由统筹安排补证或客户决定；本记录不预判。

## 七、打印/日志规则（客户 2026-10-23）

- 新代码必要诊断存在：`role-docs.index`、`role-docs.index.skipped`、`role-docs.root.skipped`、`role-docs.root.inspect-failed`、`role-docs.index.failed`、`project.listing.root-docs`、`project-document.listing(.unavailable)`、`project-document.root.skipped`、`project-document.read(.failed)`。
- 字段只含 `count`/`ok`/`reasonCode`/`errorCode`/白名单文件名（`path: name`）；**不含文档正文、文档相对路径、`.env`/令牌**。测试断言见 `project-document.test.ts`（诊断不含 `roles/A`、`not-applicable`）与 `project.test.ts`（不含被拒路径）。
- 候选 diff 无新增 `console.*`/`process.stdout|stderr`；渲染层纯模块 `profile-docs.ts` 无 Node/fs/electron/DOM。
- 频率：e2e 约 5 分钟内 `role-docs.index` 139 条（15 角色 × ~9 次 listing）、`project.listing.root-docs` 15 条；每次 listing 每角色 1 条，无定时器/重试循环、无逐文件/逐 tick 刷屏。观察项：可考虑后续把每角色索引汇总为单条摘要（非本轮阻塞）。
- 既有共享 logger 的 base context 会带 `projectRoot`（全仓既有约定；不是文档路径/正文），新事件自身未新增路径字段。详见 `s6-print-logging-check.txt`。

## 八、残余与阻塞

1. **POSIX 实读未执行**（环境限制）：正文/字节/mtime/`not-applicable`、符号链接/竞态的真实 POSIX 证据缺失；不得以 Windows 结果替代。
2. **Phase4A 10 个既有失败**：全部在 HEAD 干净基线同样失败（本次干净 HEAD 12 个），集中在设置/键盘/焦点族，与本变更无关；S6 只对新增失败负责，本次新增失败为 0。
3. **真实应用 root-doc DOM 证据由仓库外 harness 副本补齐**：未改动的 `e2e/main.mjs` 本身没有 root-doc 断言；两次未改动 e2e 均 `E2E_PASS=true`。若验收要求“未改动 e2e 直接断言 root-doc”，需桌面窗口按团队计划 §3.2/§八.11 最小追加后再复跑；本角色未改该文件（逐文件授权属桌面窗口）。
4. **`role-docs.index` 每角色一条**：可观察性足够但日志量随角色数增长；非热循环，记录为后续优化观察项。
5. **未验收**：本记录为 `verified-by-tests-only`，不是 P1–P10 判定；独立验收按标准 v1 另写报告。S6 通过不代表提交/发布授权。
6. 未 commit / push / 暂存 / 合并 / 发布；未写 `ans-gateway` 或任何目标项目；未使用真实 `.env`/凭据/在线模型；未伪造 `docs/verification/` 或 task_ops 令牌/锁/审批。

## 九、证据目录

目录：`角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-evidence/`

| 文件 | 内容 |
| --- | --- |
| `s6-environment.txt` | 时间、OS/Shell、Node/npm/Electron、HEAD/分支、暂存状态 |
| `s6-git-status-full.txt`、`s6-git-status-src-app-test.txt` | 全工作树与 `src app test` 状态 |
| `s6-candidate-hashes.txt`、`s6-candidate-paths.txt` | 17 个候选文件哈希与 S2–S5 记录逐项对照（0 mismatch） |
| `s6-writeset-classification.txt`、`s6-noncandidate-status.txt` | 候选 vs 非候选分类；无越界产品/测试路径 |
| `s6-zero-diff-and-writeset.txt` | Provider/preload/main/package/vite 零 diff、`test/桌面应用` 无新文件、按需未改文件、HEAD baseline blobs |
| `s6-boundary-hashes.txt` | 8 个 boundary 文件 vs S1 上游重冻（8/8 UNCHANGED） |
| `s6-s1-snapshot-comparison.txt` | S1 129 路径 119 same/10 changed/0 missing 与解释 |
| `s6-contract-additive.txt` | `rootDocs?` 声明、无新 IPC/preload、Model diff |
| `s6-test-desktop-ui.log` | 209/209 |
| `s6-test-desktop-app-targets.log` | 164/164 |
| `s6-test-cross-layer.log`、`s6-test-cross-layer-regression.log` | 10/10、13/13 |
| `s6-test-i18n-unit.log` | 186/181/5 skip |
| `s6-typecheck.log`、`s6-typecheck-renderer.log`、`s6-build-renderer.log` | typecheck/build 原始输出 |
| `s6-phase4a-smoke-current.log`、`s6-phase4a-report-current.json` | 当前候选 Run 1（108/10） |
| `s6-phase4a-smoke-run2.log`、`s6-phase4a-report-run2.json` | 当前候选 Run 2（108/10，同一失败集） |
| `s6-phase4a-baseline-head.log`、`s6-baseline-head-build.log`、`s6-phase4a-fail-*.txt` | 干净 HEAD 基线（99/12）与失败集合对照；基线 renderer 重建日志 |
| `s6-phase4a-*.png` | Phase4A 1360/960/200% 文档节与阅读态截图 |
| `s6-e2e-run1/2-report.txt`、`s6-e2e-run1/2-04-profile.png` | 真实 Electron e2e 两次报告与截图 |
| `s6-probe-report.txt`、`s6-probe-real-electron-run3.log` | 真实应用 root-doc 探针最终报告/输出 |
| `s6-probe-root-docs-profile.png`、`s6-probe-root-docs-unavailable.png` | 真实仓库三根文档、点击不可用截图 |
| `s6-probe-real-electron-script.mjs`、`s6-probe-script.diff` | 仓库外 harness 副本及其与 `e2e/main.mjs` 的差异 |
| `s6-failure-classification.txt` | 套件/Phase4A/e2e/探针失败分类与基线对照 |
| `s6-root-docs-scenarios.txt` | 17 项场景矩阵与 Windows/POSIX 边界 |
| `s6-print-logging-check.txt` | 打印/日志规则核对（事件、字段、频率、测试断言） |
| `s6-root-doc-fixture-integrity.txt` | 真实仓库三个根文档运行后 `git status` 干净、sha256/mtime/bytes；POSIX 未执行说明 |
| `s6-command-summary.txt` | 命令/退出码/计数/日志路径汇总 |
| `s6-post-run-status.txt` | 运行后候选仍 17 项、保护路径零变化、dist 被忽略 |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |
