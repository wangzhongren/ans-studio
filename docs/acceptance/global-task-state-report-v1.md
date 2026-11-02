# 独立验收报告 E2：全局任务状态与幕僚版本决策权（global task state / version authority）

- **风险档位**：**T3**（方案 §10.3 定档；闸门 2 与客户实施授权确认；新增治理决策权、共享账本契约加法扩展、跨角色工具/UI/run 生命周期；不压档、不降档）。
- **判定依据**：实施前验收标准 **V1 v1.1** `docs/acceptance/global-task-state-criteria-v1.md`（**915 行 / SHA-256 `fe48dc326c918bb0c94f353df2bcd55a6d69b9f95b93ec4fdc0e259094a9847f`**）；方案 **P1.3** `docs/planning/2026-11-02_design_global-task-state-version-authority.md`（**1303 行 / `7faa3e8b348612b6151aec4046a169b8810eb2bbcf347c3866675d65f1084dc8`**；P1.2 1302 / `1573e1ef…` 为 R1–R5 基线，P1.3 仅 D-04 blocker kind 内部 id 窄更正）；团队计划 `docs/scheduling/2026-11-02_team-plan_global-task-state.md`（477 行 / `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62`）；独立复核 `docs/planning/2026-11-02_review_global-task-state-version-authority.md`（148 行 / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`；P1.0 快照 103 / `3b8d3a3a…` 另计）；沟通记录 `docs/communication/2026-11-02_intent_global-task-state.md`（写报告时 **210 行** / `fa4a3211d57ae95e56664e52a6e8e17f52a0bbb7f3bf780731ff355fb3c1ed14`；E1 表写 201 行但哈希相同，见 §1.5）；E1 变更包 `docs/scheduling/global-task-state-change-v1.md`（**401 行 / `8f94d66a3b8986a0a8b2fdf3b08ea18fcf3025fbfc200e9d73d365d432ff6f91`**）；D1 重跑记录 `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression.md`（**323 行 / `c36b72776d954323784932d608f770f0642f8f0b42e173c208c73efda107bb96`**，status `verified`）+ 证据目录 40 文件；B0 基线 167 / `5c275332…`（只作对照）。
- **候选**：HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`（分支 `feat/acceptance-return-card`，worktree `flow-improvements-wave1`）+ 工作树 A0–A5 未提交改动；**32 个产品/测试候选文件 = 30 个 `src/app/test` + README 2**，与团队计划 §4.1/§4.3 写集精确匹配；产品候选状态快照 `git -c core.quotePath=false status --porcelain -- src app test README.md README.en.md | sort` = **32 行 / SHA-256 `c767983094cadd2948f346ffd66c2de0ad2977dc7248c987ac5853f90e834ea9`**。E1 32 文件逐文件 `git hash-object` + `sha256sum` 与 E2 独立复算 **32/32 一致**；报告写盘前复测候选快照仍为 `c7679830…`（E2 的测试/E2E 未改变产品候选）。
- **选定检查**：E2 独立复跑受影响套件 **99/99 pass**（编排 45 + 桌面窗口 27 + i18n 16 + 桌面UI 11）；D-04 撤除残留守卫 **6/6 pass**；`npm run typecheck` / `typecheck:renderer` / `build:renderer` **均 exit 0**（build 376ms）；当前候选重建后 phase4b Electron E2E **PASS 69 checks / 0 failures**（exit 0，console/CSP 0，14 张截图，入口 `app/renderer/dist/index.html` `c6078edf…`）；`grep -R "acceptance-rework" src app`（排除 dist/node_modules）**0 文件**、`rework-pending` 3 文件；`run-manifest.ts`/`decision-card.ts`/`ipc.ts`/`workflow-preconditions.ts`/`versioned-doc-guard.ts` 对 HEAD **零 diff**；i18n **97 key（62+18+17）、计数 1642**。另复用 D1 重跑的同候选 T3 全量证据（见下）。
- **复用证据**：D1 重跑记录 + 40 文件证据包（同 32 文件候选；运行前后 32/32 哈希一致；E1 独立复算一致）；E1 变更包；H1 边界 6 文件与沟通核对；P1 复审 `recommend approval`；P1.3/V1.1 窄更正记录。**不引用**旧 D1（`status: superseded`）的旧候选哈希、3461/3433/10/18 与 `needs-work` 结论；不引用其它变更的通过结论。
- **消费者重测**：`run-change.test.ts`/`run-change-entry.test.ts`/`chief-workflow.test.ts`/`i18n.test.ts`/`i18n-guard.test.ts`/`test/桌面UI/project-state.test.ts` 均在 E2 独立 99/99 内通过；`run-change*.test.ts` 两文件零改动；i18n 97 key/1642 与 UI 面板同源计数通过。
- **全量回归**：D1 重跑在**当前 32 文件候选**执行 T3 全量（393 文件，排除 `test/pi-adapter/write-sequencing.test.ts`）：**tests 3462 / pass 3434 / fail 10 / cancelled 0 / skipped 18 / todo 0**，exit 1（因失败）；**新增确定性失败 0**；10 项失败 = **9 项既有 Windows symlink EPERM + 1 项间歇性 TEMP cleanup EPERM（环境，非候选）**。排除命令与原因见 §5.2；E2 未重跑 T3 全量（按 V1 §2.5 复用同候选证据，并已核对原始日志/计数/失败分类）。
- **结论**：**通过（当前候选满足 V1 v1.1）**。AC-1–AC-10 全部 `pass`，R1–R5 全部满足；无 `fail`、无 `insufficient evidence`；已知限制见 §4（均不弱化 AC，且按 V1 解释不影响通过）。本结论只表示当前候选满足 V1，**不授权提交/推送/合并/发布**。
- **取证方式**：单上下文（E2 主上下文；未启用并行 E1–E4 取证），唯一 B2、唯一结论；判断、候选核对与合并复核均由本上下文完成。
- **报告日期**：2026-11-02。

---

## 一、候选与输入核对

### 1.1 输入快照（E2 实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| V1 v1.1 | `docs/acceptance/global-task-state-criteria-v1.md` | 915 | `fe48dc326c918bb0c94f353df2bcd55a6d69b9f95b93ec4fdc0e259094a9847f` |
| 方案 P1.3 | `docs/planning/2026-11-02_design_global-task-state-version-authority.md` | 1303 | `7faa3e8b348612b6151aec4046a169b8810eb2bbcf347c3866675d65f1084dc8` |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_global-task-state.md` | 477 | `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62` |
| 复核记录 | `docs/planning/2026-11-02_review_global-task-state-version-authority.md` | 148 | `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8` |
| └ P1.0 复核快照（历史） | 同上文件历史快照 | 103 | `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07` |
| P1 审核（含复审） | `角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md` | 315 | `339c875b0f032243c77f055f18c70705ab89195fd19878794ee3e1ff2479790a` |
| 沟通记录 | `docs/communication/2026-11-02_intent_global-task-state.md` | 210 | `fa4a3211d57ae95e56664e52a6e8e17f52a0bbb7f3bf780731ff355fb3c1ed14` |
| E1 变更包 | `docs/scheduling/global-task-state-change-v1.md` | 401 | `8f94d66a3b8986a0a8b2fdf3b08ea18fcf3025fbfc200e9d73d365d432ff6f91` |
| D1 重跑记录 | `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression.md` | 323 | `c36b72776d954323784932d608f770f0642f8f0b42e173c208c73efda107bb96` |
| B0 基线（对照） | `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md` | 167 | `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58` |

### 1.2 候选身份与写集

| 检查 | 结果 |
| --- | --- |
| HEAD / 分支 | `0a123109a6b10e9b60fd1aee5f08f861455c48de` / `feat/acceptance-return-card`（worktree `flow-improvements-wave1`；HEAD 与团队计划/B0/V1 一致） |
| 产品/测试候选条目 | `git status --porcelain -- src app test` = **30 条**；README = 2 条；合计 **32** |
| 候选状态快照 | 32 行 / SHA-256 `c767983094cadd2948f346ffd66c2de0ad2977dc7248c987ac5853f90e834ea9`（与 E1 §1.1 一致） |
| E1 32 文件逐文件哈希 vs E2 复算 | **32/32 一致**（`git hash-object` + `sha256sum`；E2 用 E1 §1.2 表逐项复算） |
| 写集闭合 | 期望 32 路径 vs `git status` **精确匹配**；写集外产品/测试改动 **0**；`package.json`/锁/构建配置 **0**；staged 空 |
| 默认只读文件 | `src/common/编排/run-manifest.ts`（`81e0e03e…`）、`decision-card.ts`（`31b88e9e…`）、`app/renderer/src/chat/ipc.ts`（`470ae6d5…`）、`src/common/编排/workflow-preconditions.ts`（`83a6c7eb…`）、`src/common/门禁引擎/versioned-doc-guard.ts`（`1fb2f173…`）对 HEAD **零 diff** |
| B-1/B-2 | `src/model/project-state.ts`（B-1）、`test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`（B-2）均在写集内；`app/renderer/src/chat/project-state-view.ts` **未创建**（A4 走 `lib/platform.ts` 列内替代）；无其它边界变更 |
| 非产品候选 | H1 边界 6 文件（+20/−0）与治理/证据记录单列；本报告写盘前后产品候选不变 |
| 旧 D1 | `status: superseded`；旧候选哈希、3461/3433/10/18、`needs-work`、旧 E2E 均**未引用** |

### 1.3 E2 独立复跑（当前候选）

| 检查 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 受影响套件 | `node --test --test-concurrency=1 test/编排/project-state.test.ts test/编排/version-decision.test.ts test/编排/task-state.test.ts test/编排/run-manifest.test.ts test/编排/decision-card.test.ts test/桌面应用/project-state.test.ts test/桌面应用/version-decision.test.ts test/桌面应用/chief-workflow.test.ts test/桌面应用/run-change.test.ts test/桌面应用/run-change-entry.test.ts test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts test/桌面UI/project-state.test.ts` | **99 tests / 99 pass / 0 fail / 0 skipped / 0 todo**，exit 0（duration 4,602 ms） |
| 主 typecheck | `npm run typecheck` | exit **0**，0 类型错误 |
| D-04 守卫 | `node --test --test-concurrency=1 test/测试/entry-role-minimal-d.test.ts` | **6/6 pass**，exit 0；含「D-04 撤除残留：src/app 生产源码零命中」 |
| Token 检索 | `grep -R "acceptance-rework" src app --exclude-dir=dist --exclude-dir=node_modules -l`；`grep -R "rework-pending" … -l` | `acceptance-rework` **0 文件**；`rework-pending` **3 文件**（A0/A1/A4 落点） |
| 渲染 typecheck | `npm run typecheck:renderer` | exit **0** |
| 渲染构建 | `npm run build:renderer` | exit **0**；vite 构建 376ms；仅既有非致命 warning（chunk size / INEFFECTIVE_DYNAMIC_IMPORT） |
| Electron E2E | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-e2e-verify-65357` | **PHASE4B_SMOKE PASS 69 checks / 0 failures**，exit 0；console errors 0、CSP violations 0、14 张截图；入口 `c6078edf…` |
| i18n | 受影响套件输出 | 97 key（`ui.projectState` 62 + `ui.versionDecision` 18 + `main.versionDecision` 17）；计数 **ui 1001 / main 576 / shared 62 / preferences 3 = 1642**；violations 0 |
| 补充边界验证（临时脚本，非仓库文件） | `node C:\Users\51054\AppData\Local\Temp\ans-e2e-extra-check.mjs` | `stale=true`、`selectedBy=chief`、`focusStaleBlocker=true`；命名 `focus-next2`、`focus-next3`、超长 `-next2`（58 字符 base） |
| 候选运行后复测 | `git status --porcelain -- src app test README.md README.en.md \| sort \| sha256sum` | 32 行 / `c7679830…`（与 E1/D1 一致） |

### 1.4 D1 重跑证据核对（复用）

- D1 重跑记录与证据包绑定同一 32 文件候选：`00-candidate-identity.txt`（185 行 / 15,242 B / `41716642…`）、`16-post-run-verification.log`（54 行 / `99b9a785…`）均记录运行前后 32/32 一致；E2 独立复算 32/32 与 E1 一致。
- 关键原始日志哈希已复核：`01-npm-run-typecheck.log` `6121896f…`、`02-npm-run-typecheck-renderer.log` `cb5d9a65…`、`03-npm-run-build-renderer.log` `138cdb2a…`、`04-suite-orchestration.log` `5c2d97af…`、`05-suite-desktop-app.log` `e7ccf1d8…`、`06-suite-i18n.log` `5c542be9…`、`07-suite-desktop-ui.log` `80189d18…`、`08-d04-guard.log` `f7c4078e…`、`09-phase4b-electron-smoke.log` `38cb55b3…`、`10-full-t3.log` `9f92a5ee…`、`15-failure-classification.txt` `c5415824…`、`16-post-run-verification.log` `99b9a785…`、`phase4b-out/report.json` `aef95035…`。
- D1 受影响套件 99/99、D-04 6/6、T3 3462/3434/10/18、E2E 69/0 与 E2 独立复跑一致；D1 证据可复用（同候选、同输入/依赖、同命令/环境/夹具）。
- **旧 D1**（`2026-11-02_global-task-state-D1-regression.md`）为 `superseded`；其旧候选哈希与 `needs-work` 结论未进入本报告判断。

### 1.5 输入文档的非阻断偏差

- **E1 沟通记录行数**：E1 §输入表写「201 行」，E2 实测 **210 行**；SHA-256 与 E1 写值 **完全相同**（`fa4a3211…`），说明 E1 行数为笔误/旧测量，内容同一快照。以 SHA-256 为准；不影响候选/证据/判定。
- **方案 P1.3 历史状态行**：P1.3 头仍写「待沟通核对 P1.3；待闸门 1 客户确认」，是写于 D-04 裁决/沟通核对前的历史状态行；沟通记录「D-04 裁决与返工记录」已裁决改名并明确语义/范围/T3/写权/验收边界不变，D1 重跑已按 P1.3/V1.1 执行。按 V1 §九.3 口径，不作为 fail 依据；E2 按 P1.3 实际内容判定。
- **分支名 vs worktree 名**：实际分支 `feat/acceptance-return-card`，团队计划以 worktree 名 `flow-improvements-wave1` 指代；HEAD/候选哈希一致，不构成偏差。

---

## 二、逐项验收表（AC-1–AC-10 + R1–R5）

> 判定值：`pass` / `fail` / `insufficient evidence` / `not applicable`。本表所有行 `pass`；未使用 `not applicable`。证据路径均指当前候选；D1 原始日志在 `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression-evidence/`，E2 独立复跑结果见 §1.3。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希（摘要） | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | 全局状态视图正确、只读、部分结果、裁剪、有界、零写入（AC-1.1–1.8） | `project-state:get` 载荷/工具文本/前后哈希/坏+好 manifest/裁剪/截断/计数 | `01`/`02`/`04`/`07` 日志；E2 99/99；`test/编排/project-state.test.ts`、`test/桌面应用/project-state.test.ts`、`test/桌面UI/project-state.test.ts` | HEAD `0a12310` + 32 文件候选 `c7679830…` | A1/A2/A4/D1 | 全部子项通过；零写入/部分结果/裁剪/有界/计数有原始断言 | **pass** |
| AC-2 | 幕僚备注受控、可审计、不改机器事实（AC-2.1–2.4） | `project.focus`/`project.note` 账本行、前后哈希、重启重建、非法输入回执 | `05-suite-desktop-app.log`；E2 99/99；`test/桌面应用/project-state.test.ts` | 同上 | A2/D1 | set-focus/blocker/next-step、幂等/解除/超长/refs、重启重建均通过；任务/run/文档哈希不变 | **pass** |
| AC-3 | 版本决策卡与决定层级（AC-3.1–3.8） | 工具注入、卡载荷、request.*、judge 字段、拒绝/中止、requestId/attempt/通知 | `04`/`05` 日志；E2 99/99；`test/编排/version-decision.test.ts`、`test/桌面应用/version-decision.test.ts`、`chief-workflow.test.ts` | 同上 | A0/A1/A2/D1 | 应用自有 decision 卡、两选项/恰一推荐、pinned/多 run/pending、拒绝/超时/中止/重试均通过 | **pass** |
| AC-4 | 版本修改执行（AC-4.1–4.6） | `version.decision`、targetVersions、manifest/文档前后哈希、版本化守卫、legacy 锚点 | `04`/`05` 日志；E2 99/99；D1 T3 版本化守卫回归；`version-decision.test.ts` | 同上 | A1/A2/D1 | 同 flow/run、targetVersions 最新+1、零文档写入、不 pin、legacy 锚点；版本化守卫 T3 通过 | **pass** |
| AC-5 | 新版本开发执行（AC-5.1–5.6） | 新 flow/run manifest、旧 flow 全部活动 run closedReason、orphan、旧产物哈希、focus、执行期 pinned | `05` 日志；E2 99/99；`test/桌面应用/version-decision.test.ts`；E2 补充命名检查 | 同上 | A1/A2/D1 | 新 flow/run；两个 draft 全部关闭 + `superseded-by:<newFlowId>/<newRunId>`；旧申请 orphan(superseded)；旧产物/旧任务保留；执行期 pinned failed/run-change-required 零创建/关闭/orphan | **pass** |
| AC-6 | 边界：不绕过验收/证据/写权/闸门/其他机制（AC-6.1–6.7） | 既有护栏套件、受保护文件零 diff、卡面文案 | D1 T3 全量；E2 99/99；零 diff 检查（§1.2）；`run-change*.test.ts` | 同上 | A2/A1/D1/E2 | 验收/证据/写权/闸门/需求变更/run-change 均不变；受保护文件零 diff；卡面明确路线≠批准 | **pass** |
| AC-7 | 审计与 UI 一致性（AC-7.1–7.5） | 账本事件序列、系统行、计数、UI/i18n 测试 | `05`/`06`/`07` 日志；E2 99/99；`test/桌面UI/project-state.test.ts`；E2 E2E 69/0 | 同上 | A2/A3/A4/D1 | 审计组合/判断代批/计数公式/系统行/面板只读与同源均通过；i18n 97 key、1642 计数 | **pass** |
| AC-8 | 兼容、并发、恢复（AC-8.1–8.6） | 旧账本/旧白名单、重启对账、并发/重试、超时/中止、部分失败 | `04`/`05` 日志；E2 99/99；`task-state.test.ts`、`version-decision.test.ts` | 同上 | A1/A2/D1 | 旧账本/旧白名单、轮转、F5/executing/pinned、并发/重试、超时/中止、部分失败均通过 | **pass** |
| AC-9 | 测试、构建、证据（AC-9.1–9.5） | 测试 diff/计数、三命令、T3 全量、E2E、候选哈希 | `11`/`11b`；E2 三命令 exit 0；D1 T3 3462/3434/10/18；E2 E2E 69/0 | 同上 | A0–A5/D1/E2 | 99/99 + 6/6；新增确定性失败 0；无删测/新 skip/放宽；证据最多截图、无录屏 | **pass** |
| AC-10 | 文档与状态如实（AC-10.1–10.3） | 方案/复核/团队计划哈希与状态、沟通记录、README、角色卡、旧记录 | P1.3 1303/`7faa3e8b…`；复核 148/`22128e59…`；README 中英 diff；角色卡仅 H1；旧记录零 diff | 同上 | 策划/装配/A5/D1/E2 | P1.3 版本/历史行如实；README 中英事件清单同步；角色卡仅 H1 边界；旧记录未改写 | **pass** |
| R1 | active run 从部分扫描派生；坏+好 manifest 合法 flow active 标记正确；`listRunManifestsResult` 语义不变 | `test/编排/project-state.test.ts` R1 用例；A2 R1-e；代码 grep | E2 99/99；`04`/`05` 日志；`run-manifest.ts` 零 diff | 同上 | A1/A2/D1/E2 | 1 坏 + 1 好 manifest：好 flow 返回、active 正确；视图不调用 `findActiveRun`/`listRunManifestsResult`；无关坏 manifest 不阻断前置 | **pass** |
| R2 | 通道超时/不可用 → resolved；发起中止 → orphaned；晚到答案只诊断/角色日志 | 两层 `version-decision.test.ts`；账本事件组合 | E2 99/99；`04`/`05` 日志 | 同上 | A1/A2/D1/E2 | timeout/unavailable 写 resolved、无 version.decision；abort 写 orphaned(initiator-aborted)、无 resolved/version.decision；晚到丢弃 | **pass** |
| R3 | 执行期 pinned → version.decision(failed/run-change-required)；F5 排除 orphaned；不误判 uncertain | 执行期 pinned 测试；F5/restore 测试 | E2 99/99；`05` 日志 | 同上 | A1/A2/D1/E2 | 发卡后 pin：failed/run-change-required、零创建/关闭/orphan；F5 排除 orphaned；failed 不被改 uncertain | **pass** |
| R4 | 关闭旧 flow 全部活动 run（含多 draft）；closeReason；runId 仅上下文 | 多 draft 用例；`closedRunIds`/manifest；卡面 | E2 99/99；`04`/`05` 日志 | 同上 | A1/A2/D1/E2 | `closedRunIds` 与 partial scan 一致；两个 draft 均 closed + superseded-by；请求 runId 不限范围；关闭失败如实 | **pass** |
| R5 | P1.0 快照 103/`3b8d3a3a…` 与再复核 148/`22128e59…` 分开；复核记录未被改写 | 方案/复核/团队计划/沟通哈希 | §1.1 实测；复核记录未被改写 | 同上 | 策划/沟通/E2 | 两者分开；复核记录 148/`22128e59…` 未改写；P1.3 引用一致 | **pass** |

**总体结论**：AC-1–AC-10 全部 `pass`，R1–R5 全部满足；无 `fail`、无 `insufficient evidence` → **通过（当前候选满足 V1 v1.1）**。

---

## 三、子项判定（AC-1.1–AC-10.3）

### 3.1 AC-1（8/8 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-1.1 载荷字段/blockers kind/版本证据指针 | pass | `test/编排/project-state.test.ts`（flow/versions/evidence/notes/blockers）；`test/桌面应用/project-state.test.ts` IPC 形状；`test/桌面UI/project-state.test.ts` 详情映射；`rework-pending` 映射 |
| AC-1.2 focus 规则/cleared/derived/none/stale/不猜 `-c` | pass | focus 测试（多候选 none、唯一 derived、chief 事件、cleared）；E2 补充 stale 检查（stale=true、focus-stale blocker）；UI none/derived/stale 测试 |
| AC-1.3 多活跃 run 全部列出/run-ambiguous | pass | `focus derived` 多 draft 测试；`validateVersionDecisionContext` 多 run/pinned 测试；A2 多 run 前置测试 |
| AC-1.4 坏行/坏 manifest 部分结果/合法 flow active 正确/`listRunManifestsResult` 不变 | pass | R1 测试（1 坏 + 1 好）；A2 R1-e；`run-manifest.ts` 零 diff；代码去注释断言不含 `findActiveRun`/`listRunManifestsResult` |
| AC-1.5 读零写入/无第二状态文件 | pass | versions/零写入测试前后哈希与 `.ans/state` 清单；A2 project-state:get 前后哈希与 stateFiles `["tasks.jsonl"]` |
| AC-1.6 裁剪：chief 完整/其他治理角色/worker 无工具 | pass | trim 测试（convener 不见 worker 正文、notes 为空）；A2 clip 测试（worker `projectState` undefined）；chief-workflow 注入矩阵 |
| AC-1.7 有界/truncated/工具文本 ≤8 KiB | pass | bounds 测试（limits 1/1/1/1、`truncated=true`、计数保留、summary ≤8 KiB）；A2 chiefText 字节数断言 |
| AC-1.8 blocked/failed 分离/计数口径 | pass | blockers 测试（blocked/failed 分开、counts.blocked=1/failed=1、unclosed==state.unclosed.length、superseded/active）；A2 IPC 计数断言 |

### 3.2 AC-2（4/4 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-2.1 set-focus 存在/不存在/cleared | pass | A2 project_note 测试：focus 更新、missing flow ok:false、wrongRun 拒绝、cleared → none |
| AC-2.2 blocker/next-step 最新 active/幂等/解除/超长/refs | pass | A2 测试：同 key 同文本同 active `at` 相同、active:false、501 字拒绝、refs 6 拒绝、next-step 生效 |
| AC-2.3 不改任务/run/文档 | pass | A2 测试：任务列表不变、manifest/文档哈希不变；代码只 append `project.*` |
| AC-2.4 roleId/时间/重启重建 | pass | A2 测试：事件字段、`restoreTasks` 后 focus/notes 重建；账本摘录/哈希 |

### 3.3 AC-3（8/8 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-3.1 仅幕僚工具/无新 cardKind/角色 allowlist 不变 | pass | `chief-workflow.test.ts` 注入矩阵；`DECISION_CARD_ALLOWED_ROLES`/`decision-card.ts` 零 diff；schema 描述 |
| AC-3.2 参数校验/非法不发卡 | pass | `validateVersionDecisionRequest` 测试（slug/action/reason/refs/extra）；A2 前置测试 `version-decision-invalid`、无 request.created |
| AC-3.3 pinned → run-change-required/不改 run/文档 | pass | `validateVersionDecisionContext` pinned；A2 pinned 前置测试；run-change 套件 27/27 |
| AC-3.4 多 run → run-ambiguous/带 runId 正常 | pass | `validateVersionDecisionContext` 两 draft/带 runId；A2 多 run 前置测试 |
| AC-3.5 pending/唯一 requestId/attempt/通知不吞/第二未决重启 | pass | `versionDecisionRequestId`/`versionDecisionAttempt` 测试；A2 拒绝→重试两次不同 requestId、attempt=2、两条系统行；restore 第二未决独立 orphan |
| AC-3.6 application-owned 卡/两选项/恰一 recommended/审计 | pass | `buildVersionDecisionCard` + `validateDecisionCardRequest`；A2 卡载荷（application/decision/sourceRoleId/options/recommended）；`request.created/presented/resolved`（presented 由 `withRequestLifecycle` 写，`session.ts:3624`）与 `version.decision` 事件 |
| AC-3.7 judge 代批/字段/措辞 | pass | A2 new-flow judge 测试（executed.decidedBy judge、operatorId `judge:demo`、消息含「判断 agent 代批」）；session 写 `by: judged ? "judge"`、`judge` 字段 |
| AC-3.8 拒绝/超时/不可用/中止零执行 | pass | A2 retry/timeout/abort 测试：拒绝/超时/不可用写 resolved、无 version.decision；abort 写 orphaned(initiator-aborted)、无 resolved/version.decision；晚到丢弃 |

### 3.4 AC-4（6/6 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-4.1 同 flow/draft run/不改 manifest/文档 | pass | A2 版本修改测试：manifest/文档哈希不变、无新 flow/run |
| AC-4.2 targetVersions 最新+1/缺失 v1/写审计/不写文档 | pass | `computeTargetVersions`（intent 2、proposal 4、modules 1、roster 3、architecture 1、assets 1）；A2 targetVersions proposal 3/intent 2；文档哈希不变 |
| AC-4.3 返回派发指令/不派发/不创建任务/不写文档 | pass | A2 result action/decisionId/flowId/targetVersions/reason；事件中无 task.created |
| AC-4.4 版本化守卫：覆盖拒/新增 vN+1 允许 | pass | D1 T3 `versioned-doc-guard` 用例通过；`versioned-doc-guard.ts` 零 diff |
| AC-4.5 legacy/无 run 锚点/失败如实 | pass | `planVersionDecisionExecution` legacy `needsRunAnchor=true`；session `ensureDraftRun` 锚点/`runAnchor:"unavailable"` 代码；旧任务不变 |
| AC-4.6 不自动 pin/激活 | pass | A2 manifest 哈希/state 不变；无 pin 事件 |

### 3.5 AC-5（6/6 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-5.1 命名 `<old>-next`/`-next2`/`-n2`/slug ≤64/无 `-b/-c` | pass | A2 new-flow `focus-next`；E2 补充 `focus-next2`/`focus-next3`/58 字符 base → `-next2`；`nextVersionFlowId` 代码；无 `-b/-c` |
| AC-5.2 新 draft/旧 flow 全部活动 run closed/superseded-by/runId 仅上下文/pinned 预检 | pass | `planVersionDecisionExecution` closedRunIds 两 draft；A2 两 draft 均 closed + closeReason；关闭失败测试停止其余、failed/closedRunIds=[runA]；A2 执行期 pinned failed/零创建/零关闭/零 orphan |
| AC-5.3 旧产物/任务/manifest 保留/不自动关任务/orphan 旧申请 | pass | A2 new-flow：旧文档哈希不变、旧任务无 task.closed、旧申请 orphaned(superseded)、旧 manifest 保留 |
| AC-5.4 executed 审计字段/project.focus 指向新 flow/run/新旧映射 | pass | A2 new-flow executed：old/new ids、closedRunIds、orphanedRequestIds、decidedBy/operatorId；project.focus roleId application |
| AC-5.5 不自动创建文档/角色/任务/不自动派发 | pass | session 执行路径仅 ledger/manifest/focus 事件；A2 测试旧文档/任务不变；无 task.created |
| AC-5.6 执行期 pinned failed/run-change-required/零副作用/不误判 uncertain | pass | A2 late-pin 测试 failed/run-change-required、零创建/关闭/orphan；restore 测试 failed 不被改 uncertain |

### 3.6 AC-6（7/7 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-6.1 不是验收卡/不产生验收结论/新版本仍独立验收 | pass | 卡 cardKind decision、question 免责声明；schema 描述「路线≠内容批准」；V1/E2 独立流程 |
| AC-6.2 evidence_check/证据路径/验收卡/返工路由不变 | pass | D1 T3 全量：除 10 项已分类环境失败与 18 项既有 skip 外，其余 **3434 项 pass**，无验收/证据用例失败；受保护文件零 diff；无验收/证据文件改动 |
| AC-6.3 写权/边界不变 | pass | `run-manifest.ts`/`decision-card.ts`/`versioned-doc-guard.ts`/`workflow-preconditions.ts` 零 diff；角色卡仅 H1 6 文件；IPC 无写桥；幕僚写区未扩 |
| AC-6.4 客户闸门不变/路线卡不替代 | pass | 无闸门代码改动；卡面/描述明确路线不是客户批准；新版本仍走五步链 |
| AC-6.5 requirement change 通道不变 | pass | 无相关改动；full T3 通过；schema/描述未改语义 |
| AC-6.6 run-change 三模式/显式入口/提案冻结路径不变/无自动批准 | pass | `run-change.test.ts`/`run-change-entry.test.ts` 27/27；两文件零改动；session 无 run-change 自动批准分支 |
| AC-6.7 不自动修复当前修仙 run/不追溯/不删除旧产物 | pass | 无 xianxia 路径改动；new-flow 保留旧文档/任务/manifest；无自动修复逻辑 |

### 3.7 AC-7（5/5 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-7.1 执行/拒绝/超时/中止/晚到审计序列/append-only/无密钥 | pass | A2 version-decision 测试：`request.created/presented/resolved` + executing→executed、拒绝/超时 resolved 无 version.decision、abort orphaned 无 resolved/version.decision、晚到丢弃；账本 append-only |
| AC-7.2 judge/customer 可区分/不写成客户 | pass | session `by: judged ? "judge" : "customer"`、`operatorId` `judge:`、`judge` 字段；A2 judge 测试消息含代批措辞 |
| AC-7.3 UI 只经 IPC/同 builder/计数公式/blocked/failed 活动/i18n | pass | UI 测试 summary/details 只用 `counts.*`；A2 `counts.unclosed == listTasks.unclosed`；i18n 97 key/1642；E2E 项目状态区 5 checks |
| AC-7.4 聊天系统行覆盖请求/决定/拒绝/执行/部分失败/不刷屏 | pass | session `[系统·版本决策]` resolved-only、declined/unavailable/partialFailed/uncertain 文案；A2 重试两条系统行不被吞；i18n keys 存在 |
| AC-7.5 任务中心逐任务动作/面板只读/不直接改账本 | pass | UI 测试面板 1 个 onClick（刷新）、禁止写桥/appendTaskEvent/taskStatusOf；任务中心未被改造 |

### 3.8 AC-8（6/6 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-8.1 旧账本/旧 flow/legacy/轮转 | pass | `task-state.test.ts` 旧记录/轮转；`project-state.test.ts` 轮转后 focus derived/none；无迁移 |
| AC-8.2 旧 app 读新账本：新 kind 坏行、不阻塞、不丢数据 | pass | `task-state.test.ts`「旧白名单读新账本记坏行、不阻塞、不丢数据（AC-8.2 模拟）」 |
| AC-8.3 重启/未决 orphan/executing 对账/F5 崩溃窗口/排除 orphaned/pinned failed 不误判 | pass | A2 restore 测试：第二未决 orphan(restart)、crash resolved-without-execution → uncertain、orphaned 排除；executing→executed/uncertain、failed 不改 uncertain、不重复建 flow |
| AC-8.4 并发/重试/唯一 requestId/通知不吞/执行串行/命名唯一 | pass | `versionDecisionRequestId`/attempt 测试；A2 重试两次不同 requestId、两条系统行；prefix 碰撞测试；pending 去重；命名补充检查 |
| AC-8.5 超时/中止语义/晚到/无部分效果 | pass | A2 timeout/unavailable/abort 测试；无 version.decision/机器效果；晚到不写 resolved |
| AC-8.6 部分失败 failed/uncertain 如实/不称成功 | pass | A2 close-fail 测试：failed、closedRunIds=[runA]、runB 仍 draft、不切 focus；execution-failed 如实 |

### 3.9 AC-9（5/5 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-9.1 新增/扩展测试覆盖/不删除/无新 skip/todo/不放宽 | pass | D1 `11-test-diff-U0.txt`/`11b`：7 修改测试 +492/−5，删除仅 2 import + 3 i18n 计数旧值；无新 skip/todo/删测；E2 99/99 |
| AC-9.2 typecheck/typecheck:renderer/build:renderer | pass | E2 三命令均 exit 0；D1 同；构建入口 `c6078edf…` |
| AC-9.3 T3 全量/新增确定性失败 0/既有失败分类/排除记录 | pass | D1 `10-full-t3.log` 3462/3434/10/18；9 既有 symlink EPERM + 1 间歇 cleanup EPERM；排除 `write-sequencing.test.ts` 命令/原因/依据记录 |
| AC-9.4 证据记录/截图最多/无录屏 | pass | D1 证据 40 文件；E2E 14 截图、无录屏；候选/入口/命令/窗口尺寸记录 |
| AC-9.5 独立验收同版本/不声称通过 | pass | V1 v1.1 与 E2 同主上下文；本报告为唯一 B2；未提前声称通过 |

### 3.10 AC-10（3/3 pass）

| 子项 | 判定 | 关键证据 |
| --- | --- | --- |
| AC-10.1 方案 P1.3 版本/复核快照/状态如实 | pass | P1.3 头/版本记录：P1.0 103/`3b8d3a3a…` vs 复核 148/`22128e59…`、P1.2/P1.3 窄更正、未实施/未测试；历史状态行按 §1.5；沟通 D-04 裁决 |
| AC-10.2 角色卡/README 对齐 | pass | README 中英事件清单含 `project.focus`/`project.note`/`version.decision`；`角色卡/**` diff 仅 H1 6 文件 +20/−0；schema 三工具描述含只读/申请≠批准/路线≠内容批准/不写文档不派发 |
| AC-10.3 旧记录不改写/关系披露 | pass | 旧设计/旧验收/旧团队计划/复核记录无 diff；方案 §4.8/§4.9 关系披露存在；旧 D1 标 superseded 未改写 |

---

## 四、已知限制与判定处理

> 以下限制均来自 E1 §六与实施/审核记录；E2 按 V1 逐项核对，不自行放宽，也不把“已知限制”当成未披露的通过。

| # | 限制 | E2 核对 | 对 AC 的影响 |
| --- | --- | --- | --- |
| L1 | `rework-pending` 只按机器事实（acceptance request reject + 可选 `task.closed(outcome:"rework")`），不实现方案 §3.4「或验收返工任务未收口」的文本推断（PM A1-5）。 | 代码 `src/common/编排/project-state.ts` 注释/实测 summary 明确“不推断未收口返工任务”；A1 测试覆盖 acceptance reject 与 closed(rework) 两种机器事实；V1 AC-1.1 的 kind/字段/来源满足。方案 §3.4 同时规定派生不读任务正文/不猜意图，且“未收口返工任务”无机器关联字段；PM A1-5 是对该歧义的实现裁决。 | **pass**。V1 AC-1.1 列的是 kind 与机器来源，未要求文本推断；PM 技术裁决在范围内且已披露。若 V1 所有者认为“未收口返工任务”是 AC-1.1 的实质要求，应按 V1 §1.2 重开标准澄清，不由 E2 加严或放宽。 |
| L2 | A2 新版本开发创建侧 `ensureDraftRun` 仍经 all-or-nothing `findActiveRun`；无关坏 manifest 时如实 `execution-failed`，不新增 partial-aware 助手（PM A2-3）。 | A2 R1-e 测试：无关坏 manifest 不阻断**版本决策前置**；版本修改成功；新版本开发 `execution-failed`，旧 flow 不动。 | **pass**。V1 R1-e 只要求前置不被阻断；AC-5.2 允许创建失败如实记录 failed/旧 flow 不动；执行侧容忍无关坏 manifest 未写成 AC。若 V1 所有者解释为执行侧也必须容忍，按 V1 §1.2 停止澄清。 |
| L3 | 崩溃对账更保守：要求新 flow/run 存在、旧 flow 无 active、且存在 `project.focus(sourceDecisionId)`，否则 `uncertain`。 | A2 restore 测试：executing→executed/uncertain，missing new run→uncertain；不重复建 flow；failed 不被改 uncertain。 | **pass**。AC-8.3 要求 executed/uncertain 对账与不重复建 flow；保守实现不伪造 executed，符合 AC。 |
| L4 | A4 面板未单列 `notes[]`；notes 信息由 blockers `chief-note` 与 nextStep 覆盖；payload 契约不变。 | `ProjectStateView.notes` 由 builder 返回（A1/A2 测试），UI 测试映射 blockers/nextStep；AC-2.4 重启重建 notes 通过。 | **pass**。AC-1.1 要求 payload 含 notes；AC-7.3 未要求 UI 单列每个字段；限制已披露。 |
| L5 | `project_state` 工具摘要使用 A1 默认机器可读标签；A3 未冻结摘要标签 key（UI/卡面/系统行已走 A3 key）。 | A2 chiefText 测试只检查文本/≤8 KiB；UI/卡面/系统行 i18n 97 key 通过。 | **pass**。V1 AC-1.1 工具文本摘要无 i18n 强制；AC-7.3 UI i18n 已满足。 |
| L6 | `projectNote` 回执沿用既有中文风格并通过 i18n-guard；未新增独立 i18n key。 | A2 project_note 回执测试；`i18n-guard` violations 0。 | **pass**。V1 AC-2 未要求工具回执 i18n；i18n 守卫已通过。 |
| L7 | D-04 改名：blocker kind 内部 id `acceptance-rework` → `rework-pending`；i18n key `ui.projectState.blocker.kind.acceptanceRework` 保留。 | V1 v1.1 AC-1.1 已按 `rework-pending`；A0/A1/A4 3 文件命中；grep `acceptance-rework` 0；UI 映射测试 `rework-pending → acceptanceRework`。 | **pass**。V1 v1.1 已窄更正；E2 按 `rework-pending` 判定并在本报告记录旧→新映射。 |
| L8 | 方案 P1.3/团队计划文件头的历史状态行（“待沟通核对/闸门 2 未确认”）写于对应确认之前；P1.3 是 P1.2 的 D-04 窄更正（仅 §3.4 字面量/版本记录），V1 AC-10.1 原文写 P1.2。 | §1.5；沟通 D-04/实施记录；V1 §1.6/§九.3；P1.3 版本记录。 | **pass**。按 V1 §1.6 与 D-04 裁决，E2 将 P1.3 视为同一方案版本的窄更正，不要求方案回写 P1.2 字样，也不减弱 AC-10.1 的版本/快照/状态要求；历史状态行不作为 fail。 |

**限制结论**：以上限制均已在 E1/沟通/P1 审核中披露，未导致任何 AC 子项失去证据或降低强度；E2 未发现需要判 `fail` 或 `insufficient evidence` 的限制。

---

## 五、T3、失败分类与证据完整性

### 5.1 受影响套件（E2 独立复跑 + D1 对照）

| 层 | 文件组 | tests | pass | fail | skip | todo | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 编排 | `test/编排/{project-state,version-decision,task-state,run-manifest,decision-card}.test.ts` | 45 | **45** | 0 | 0 | 0 | E2 99/99；D1 `04-suite-orchestration.log` |
| 桌面窗口 | `test/桌面应用/{project-state,version-decision,chief-workflow,run-change,run-change-entry}.test.ts` | 27 | **27** | 0 | 0 | 0 | E2 99/99；D1 `05-suite-desktop-app.log` |
| 项目管理 | `test/项目管理/shared/{i18n,i18n-guard}.test.ts` | 16 | **16** | 0 | 0 | 0 | E2 99/99；D1 `06-suite-i18n.log` |
| 桌面UI | `test/桌面UI/project-state.test.ts` | 11 | **11** | 0 | 0 | 0 | E2 99/99；D1 `07-suite-desktop-ui.log` |
| **合计** | — | **99** | **99** | 0 | 0 | 0 | — |

- D-04 守卫：`test/测试/entry-role-minimal-d.test.ts` **6/6**（E2 与 D1 均通过）。
- i18n：97 key（62+18+17），计数 `ui 1001 / main 576 / shared 62 / preferences 3 = 1642`，`i18n-guard scanned=132 allowlisted=20 violations=0`。

### 5.2 T3 全量回归（D1 重跑，同候选）

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)`（worktree 根） |
| 环境 | Node `v24.22.1` / npm `11.19.1` / Windows 11 Pro 10.0.26300（Git Bash）/ Electron 44.7.0 / Asia/Shanghai |
| 文件数 | 393（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；`10-full-t3-file-list.txt` 393 行） |
| 计数 | tests **3462** / pass **3434** / fail **10** / cancelled **0** / skipped **18** / todo **0**；exit 1（因失败） |
| 失败分类 | **9 项既有 Windows symlink EPERM**（claude/codex/pi/runtime-core/编排/测试 g4，errno -4048）+ **1 项间歇性 TEMP cleanup EPERM**（`background-entry.test.ts:292`，`fixture.ts:52` rmSync cleanup；单文件复跑 run1 12/12、run2 11/12，第一次 D1 通过 → 非确定性环境 flake） |
| 新增确定性失败 | **0**；无失败指向候选断言/行为；无未知/无法解释失败 |
| 新 skip | **0**（18 项为既有平台 skip：codex 1、pi 1、runtime-core file-write-safety 4、lightweight-permission-repairs 6、门禁引擎 pin-evidence 1、shared atomic-write 5） |
| 排除项 | `test/pi-adapter/write-sequencing.test.ts`：既有已知挂起（39+ 分钟无进展、CPU 约 2339s；客户已决定排除），**未运行、未验证**；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`；排除命令即上述 `find … ! -name 'write-sequencing.test.ts'` |
| 原始证据 | `10-full-t3.log`（4,578 行 / 512,124 B / `9f92a5ee…`）、`15-failure-classification.txt`（207 行 / `c5415824…`）、`10-full-t3-file-list.txt`（393 行 / `a57ec953…`） |

**判定**：按 V1 AC-9.3，新增确定性失败为 0；9 项既有 EPERM 与 write-sequencing 排除均按 V1 §5.4 记录；1 项间歇 cleanup EPERM 已单列并证明非候选（非断言失败、单文件复跑不稳定、第一次 D1 通过），不构成新增确定性失败。T3 全量 **pass（含已披露环境失败）**，不是“全绿”。

### 5.3 E2E、构建与截图

- `npm run typecheck` / `typecheck:renderer` / `build:renderer`：E2 独立 exit 0；D1 同。
- E2E：`./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-e2e-verify-65357` → **PASS 69 checks / 0 failures**，exit 0，console/CSP 0，14 张截图；入口 `app/renderer/dist/index.html` SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f`（与 D1 入口一致）。
- 项目状态区 E2E 断言：`project state section renders focus and badges`、`project state IPC called once on open`、`project state read-only: only refresh button`、`project state exposes no write bridge`、`project state refresh calls IPC once more`（均 true）。
- `test/桌面应用/e2e/main.mjs` 未运行（D1 判定非必要）；E2E 证据以 phase4b 为准。
- 截图规则：最多截图、未录屏；截图来自当前候选重建后的真实运行；逐文件 SHA-256 见 D1 `phase4b-out/SHA256SUMS`；E2 已在该目录执行 `sha256sum -c SHA256SUMS`，**14 张截图 + report.json 全部 OK**。
- 证据完整性：D1 `phase4b-out/report.json`（`aef95035…`）checks 69/69 true、failures 0、console 0、CSP 0；E2 复核其哈希与内容摘要一致。

### 5.4 测试完整性/写集/README

- 测试 diff：7 个修改测试 **+492 / −5**；删除行仅 2 条被超集取代的 import + 3 条 i18n 旧计数（921/1545→1001/1642）；无删测、无新 skip/todo、断言未放宽（`11-test-diff-U0.txt` / `11b-test-diff-summary.txt`）。
- 写集：32/32 精确匹配；`package.json`/锁/构建配置零改动；`project-state-view.ts` 未创建；`ipc.ts` 未改。
- README：中英各 1 行事件清单，含 `project.focus`/`project.note`/`version.decision`；无旧形状（`13-readme-checklist.txt`）。
- 受保护文件：`run-manifest.ts`/`decision-card.ts`/`ipc.ts`/`workflow-preconditions.ts`/`versioned-doc-guard.ts` 对 HEAD 零 diff（E2 实测 hash-object；见 §1.2）。

---

## 六、结论与授权边界

- **逐项结论**：AC-1–AC-10 全部 `pass`；R1–R5 全部满足；无 `fail`、无 `insufficient evidence`。已知限制 L1–L8 均已披露且不改变 AC 判定（§四）。
- **总体结论**：**通过**。当前候选（HEAD `0a12310` + 32 文件工作树改动，候选快照 `c7679830…`）满足 V1 v1.1。
- **理由摘要**：候选与 E1/D1 32/32 哈希一致；受影响套件 99/99、D-04 6/6、三命令 exit 0、E2E 69/0；T3 全量新增确定性失败 0（9 既有 EPERM + 1 间歇 cleanup EPERM 单列）；`acceptance-rework` 已在源码中为 0、`rework-pending` 在位；受保护文件零 diff；V1 v1.1 的 `rework-pending` 映射已在报告注明。
- **不授权**：验收通过只表示当前候选满足 V1 v1.1，**不授权提交、推送、合并、发布、部署或对外操作**；这些另行授权（沟通记录闸门 2 实施授权明确不含提交/推送/发布）。
- **报告状态**：本报告是唯一 B2；未修改方案/团队计划/复核/沟通/角色卡/代码/测试；未 commit/push；未接触客户。E3 放行/回报由统筹按本结论处理。

---

## 七、来源记录（唯一 B2）

- **取证方式**：单上下文（E2 主上下文；未启用并行 E1–E4）。
- **分配摘要**：AC-1–AC-10、R1–R5、候选核对、证据复核、判断与报告全部由本上下文完成。
- **候选核对**：E1 候选快照 `c7679830…`（32 行）；E2 独立复算 32/32 `git hash-object` + `sha256sum` 与 E1/D1 一致；报告写盘前复测仍为 `c7679830…`。
- **主复核措施**：逐项核对 E1 §1.2 哈希；复核 D1 关键日志 SHA-256；独立复跑受影响套件 99/99、D-04 6/6、三命令、E2E 69/0；grep `acceptance-rework` 0；受保护文件零 diff；i18n 97 key/1642；补充 stale/命名边界检查。
- **冲突与失效记录**：无冲突；旧 D1 已 `superseded`，未引用；E1 沟通记录行数 201 vs 实测 210（同 SHA-256）作为文档笔误记录，不影响候选/证据。
- **限制**：E2 未重跑 T3 全量（按 V1 §2.5 复用同候选 D1 证据并核对原始日志/计数/分类）；E2E 仅运行 phase4b，未运行 `test/桌面应用/e2e/main.mjs`（D1 判定非必要）；无 task_ops，未使用验收凭证；T3 排除项与 1 项间歇环境失败已如实披露。

---

**本报告结论：通过（当前候选满足 V1 v1.1）；不授权提交/推送/合并/发布。**
