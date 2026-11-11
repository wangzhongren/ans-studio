# B2 最终独立验收报告：两条固定工作流路径（T3，v1）

- 日期：2026-11-11
- 角色：ANS「独立验收」（B2 最终独立验收，独立固定上下文；本文件与 `docs/acceptance/_evidence/2026-11-11_two-fixed-workflow-paths-b2/` 为本轮授权写区）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 候选：分支 `feat/two-fixed-workflow-paths`，**HEAD `8adb8fafcf419da13a220483201e8e5e8bd8f31d`**（92 提交，基于 `origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；代码基线 `10f90c7`）；`src app test` 工作树干净；无 tag、无远端分支、未合 main（EV-01）
- 判定依据：**B1 v1**（`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`，197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`，按任务书唯一冻结判据）；同时核验到 **B1 v1.1**（214 行 / 38,065 B / `e2ad4701…`）与 **B1 v1.2**（222 行 / 41,725 B / `e04dd864…`）两份后续冻结修订——v1.1/v1.2 明示「v1 逐字保留不改」，仅修订 known-red 事实（9 条 star-routing/i-full-chain 基线红、`test/编排` 22→24 fail）、AC-26 角色自有记录例外、TM-5 与 `amendBasis` 约束；本报告按任务书以 v1 条目为判定表主体，并在相应条目引用 v1.1/v1.2 的修订口径（报告 §二）
- 证据目录：`docs/acceptance/_evidence/2026-11-11_two-fixed-workflow-paths-b2/`（本角色自有；含依据实测、测试实跑输出、known-red diff、RR28 现场核验、merge-main 卡截图副本）

---

## 0. 结论摘要（先读）

1. **整体判定：不通过（未达到「全部判据通过」）**。30 条 AC 中 **29 条通过、0 条不通过、1 条未取证（AC-30）**；20 条 T 全部通过（T-19 附治理观察）；6 条 RR 中 **5 条通过、1 条未取证（RR-03）**；8 条 EV 中 7 条通过、1 条未取证（EV-06）。
2. **唯一决定性缺口 = RR-03 的「客户可玩/可开（真实 UI 验证）」**：RR28 完成 A1–A13 全链、merge-main 客户卡与本地合并（merge `152448a`），但**在合并后从未在真实 UI 中打开/游玩贪吃蛇**；verifier 的 A12b 报告明确为「运行期未验证（证据不足）」，B31 轻量验收 note 亦记录「运行期未验证（静态证据接受）」，运行根/`_evidence` 无任何游戏 UI 截图或运行记录。RR-03 作为冻结判据的这一子项**没有证据（未取证）**，故 RR-03 不成立，AC-30「RR-01…RR-06 全部通过」不成立。
3. **关联接缝（如实披露）**：A13「运行期未验证」客户交付说明未送达（merge-main 卡为标准文案；驱动在成功信号后 4 秒 finalize 打断幕僚说明回合）。该接缝本身不单独触犯 B1 的 AC/T/EV，但它与 RR-03 未做真实 UI 验证同源；已列为 B33 建议。
4. **其余全部判据通过**：fixed 矩阵/状态机/3 卡/acceptance 归档/Git v5/release merge/账本/依据钉死等代码与确定性测试均通过；三套件实跑计数与冻结 known-red **逐名一致（diff 为空）**；RR28 现场账本/卡/合并/审计与交付物哈希均核验一致。
5. **披露与限制（不影响上表但须裁定/跟踪）**：
   - **L-1**：fixed 运行期写入了 `.ans/state/versions.jsonl`（7 条）、`versions.initialized`、`doc-freezes.json`；设计 v1.3 §6.5/§9.4.5 字面将 versions/doc-freezes 列为旧账本「不写」，AC-23 字面含「versions/stable 账本」。实现依赖 R9 记录作为应用文档哈希来源（B23 的 `project_state [versions]`/team-plan hash 指引），属设计文本与实现的口径冲突，建议协调方裁定/修订（本报告 AC-23 按 AC-23 所列已退役机制口径判通过，此冲突如实列为限制）。
   - **L-2**：`docs/acceptance/snake-game-acceptance-v1.md` 内 `reportSha256=6ddf838f…` 与最终报告文件 `deb88ab2…` 不一致——A12b 收口（11:19:58.305）后，重复投递的 verifier 会话于 11:19:59.418 `edit_file` 追加「第 6 条」复核记录（14,610→14,860 B）；归档未随 report 变更出 v2，属证据链接缝（建议 B33：收口后抑制重复投递/禁止编辑，或变更即触发 v2 归档）。
   - **L-3**：RR28 `_evidence/` 未收录 `basis.jsonl`（target 内存在，记录 §二引用），未收录 merge-main/appointment 卡截图（原始运行根有，本报告已复制）；记录 §六「共 62 文件」与实测 63 文件清单不一致——属证据包打包缺口，不影响现场原件。
   - **G-1（治理观察，待裁定）**：`cdbdeb9` 在 `角色卡/桌面窗口`、`角色卡/运行时核心` 的 `boundary.md`/`boundary.yaml` 补登 5 个逐文件边界（B29/B30 客户授权；其中 4 文件同属其他角色目录级授权）。字面触及 AC-26「不改 `角色卡/**`」与 T-19；任务书列为治理观察，本报告如实列记，不据此单独判失败，等待协调方裁定。
   - **L-4**：B1 绑定表的启动计划哈希为原 blob `08450af1…`（90 行 / 10,820 B）；当前文件 `a66c47d7…`（90 行 / 11,018 B）——同一 B1 冻结提交 `ad22192` 只改了 §五 进展一行并新增团队计划，属已解释漂移。

---

## 一、判定依据实测（本角色独立复核，命令见证据 01）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| **B1 v1（任务书冻结判据）** | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | **197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`** ✅ 与任务书一致 |
| B1 v1.1（后续冻结修订） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md` | 214 / 38,065 / `e2ad4701b1bda9a994616d4543fcab8b05de2f8bfcd4c9f6ee0fcc0873e0b749` |
| B1 v1.2（后续冻结修订） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.2.md` | 222 / 41,725 / `e04dd86404e7ec8ac4376cab1c18d83d4e92bee835acbae95972fd49ae8872e7` |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 / 8,476 / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| v1.3 策划记录 | `docs/governance/rapporteur/2026-11-10_two-fixed-workflow-paths-design-record-v1.3.md` | 66 / 9,333 / `6ab9e1e9374899853836f1b0704ff619f68ee20a404a13d2a135ddd5fb9fc0b6` |
| 启动计划（当前） | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 90 / 11,018 / `a66c47d746ddf65720e27c77268a9069ceb13fc500c2a71419ad413c4d20a3d9` |
| 启动计划（B1 表记录值，git blob `160ca2a`） | 同上 | 90 / 10,820 / `08450af1b6be0cf893bea81cd73f73c990551b89c499430fd5a60d3c6cbbc215`（差异仅 `ad22192` 的 §五 进展一行） |
| 第一轮独立复核 | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md` | 222 / 32,535 / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` |
| 第二轮独立复核 | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.2.md` | 202 / 30,200 / `259ecde7aad44550e29c2d018bc452d619ce3942b57625c4bfe9e5e66b93ecd1` |
| 第三轮独立复核（B1 来源） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.3.md` | 156 / 20,635 / `550872d772cfcf986231c5f0dfc504be83e4b67d78266db348574a648753860b` |
| RR28 记录 | `角色卡/测试/docs/change/2026-11-11_RR28_two-fixed-workflow-paths.md` | 138 / 17,137 / **`dde4ecceccca348a778760f076f42e9fd0e9205ada5312fcf0a757ddabd93103`** ✅ 与 `record-file.json` 声明一致 |
| RR28 证据清单 | `..._evidence/sha256sums.txt` | **63 文件**，`sha256sum -c` → **63/63 OK**；清单 SHA-256 `72c7b4e31e2c498a30bd863d788f35d763c976f81ea8fb5c3ac7499b67063476` |

---

## 二、候选与判定口径

- 分支 `feat/two-fixed-workflow-paths` / HEAD `8adb8fa`；距 `origin/main`（`d9e3e99`）92 提交、0 落后；`git branch -r --contains HEAD` 与 `git tag --contains HEAD` 均空；仅本地分支含 HEAD（未合 main）；旧分支 `feat/initial-workflow-publication-completion` 停在 `4a0bafd`/`882d84b`，未参与本变更。
- **B1 版本口径**：任务书钉住 v1；v1/v1.1/v1.2 均声明冻结且 v1.1/v1.2 逐字保留 v1 条目。本报告逐条判定覆盖 v1 的 AC-01…AC-30、T-01…T-20、RR-01…RR-06、EV-01…EV-08；对 known-red 采用 v1.1 修订口径（`test/编排` 24 fail / 2 skip；star-routing 7 + i-full-chain 2 为基线 known-red），对角色记录采用 v1.2 的 AC-26 例外与 TM-5/`amendBasis` 约束。该版本链本身作为披露 L-5 列于 §六（任务书只引 v1，仓库实际存在更高冻结修订；两者判据条目一致，不影响结论）。
- 判定规则按 B1 §三：pass/fail/insufficient；insufficient 不得按 pass/NA；T3 不降档。

---

## 三、确定性测试实跑（本角色独立执行）

命令（工作树根，2026-11-11 11:32–11:41Z 实跑；输出原件见证据 `test-runs/`）：

```
npm run typecheck
node --test --test-concurrency=1 test/runtime-core/*.test.ts
node --test --test-concurrency=1 test/门禁引擎/*.test.ts
node --test --test-concurrency=1 test/编排/*.test.ts
node --test --test-concurrency=1 test/测试/mode-switch.test.ts test/测试/fixed-path-full-chain.test.ts test/测试/b-change-scope.test.ts
node --test --test-concurrency=1 test/桌面应用/b3-release-merge-desktop.test.ts test/桌面应用/b3-fixed-baseline-pathb.test.ts
node --test --test-concurrency=1 "test/roles/**/*.test.ts"
node --test --test-concurrency=1 test/桌面应用/fixed-path-routing.test.ts
node --test --test-concurrency=1 test/桌面应用/star-routing.test.ts test/测试/governance-e2e-auto/i-full-chain.test.ts
node --test --test-concurrency=1 test/测试/version-change-integration.test.ts
```

| 套件 | 实测计数 | 冻结 known-red 对照 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | — |
| `test/runtime-core` | **592 tests / 555 pass / 33 fail / 4 skip** | 33 失败名 vs B30 冻结 `b30-05`（`973c918f…`）**逐名一致，diff 为空** |
| `test/门禁引擎` | **570 tests / 564 pass / 5 fail / 1 skip** | 5 失败名 vs B30 冻结 `b30-07`（`8325f9d8…`）**逐名一致，diff 为空** |
| `test/编排` | **1,378 tests / 1,352 pass / 24 fail / 2 skip** | 24 失败名 vs B32 冻结 baseline（`f9513fb0…`）**逐名一致，diff 为空** |
| `mode-switch` + `fixed-path-full-chain` + `b-change-scope` | **8 / 8 pass** | 新 skip 0 |
| `b3-release-merge-desktop` + `b3-fixed-baseline-pathb` | **17 / 17 pass** | 新 skip 0 |
| `test/roles/**` | **285 / 285 pass** | 新 skip 0 |
| `fixed-path-routing`（Q6 负例） | **13 / 13 pass** | 新 skip 0 |
| `star-routing` + `i-full-chain`（B1 v1.1 9 红） | **12 tests / 3 pass / 9 fail / 0 skip** | 9 失败名与 B1.1 冻结 9 名单**逐名一致**；首错串同因（document-planning/worker-dispatch/chief-hub-flow-unavailable） |
| `version-change-integration`（B1 §二 9 红） | **12 tests / 3 pass / 9 fail / 0 skip** | 9 失败名与冻结基线**逐名一致**；首错含 `vca-channel-unavailable` |
| `optional-acceptance`（B1 §二基线 6 tests / 2 pass / 1 fail / 3 cancelled） | **未能完成独立复跑**：实跑至 1 fail / 2 pass 后，3 个 cancelled 基线用例长时间挂起（>10 分钟无新增输出），本角色主动停止；未形成完整计数 | 该文件不在本任务要求的三套件内；基线口径与 D1 记录（B5.3/B6.2/B7.2）一致，作为限制 L-6 披露 |

**结论**：T-17/T-18 通过；三套件失败名集合与冻结 known-red 逐字节一致（diff 为空；证据 02），新增确定性失败 = 0、新 skip = 0。

---

## 四、RR28 真机现场核验（只读）

运行根：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr28-2026-11-11\`（`target/`、`userData/`、`evidence/`、`rr/`），独立 Electron userData、端口 9224（记录称 9222/9223 未占用）、真实模型 `deepseek-v4-1-flash-261017`（native transcript），凭据由应用加载、本角色未读/未打印 `.env`。

| 项 | 实测（本角色） |
| --- | --- |
| target Git | 基线 `2b9ef04` → 实现提交 `9ecc566`（game-entry）→ `5428a28`（game-core，父 `9ecc566`）→ merge `152448a`（`ANS release merge ans/task/wf-7fcce8656a9bfb7fca73f124`）；当前 `main`；`git status` 干净 |
| 交付物 | `index.html` `c498a5e6…`、`src/game.js` `407e54d5…`、`src/styles.css` `aaa23cf3…`（与 `_evidence` 副本逐字节一致）；Git 跟踪仅 `.gitignore` + 3 交付物；治理文档/`角色卡`/`.ans` 均未跟踪 |
| `.gitignore` | 存在 `# >>> ans managed >>> … # <<< ans managed <<<` 托管块 |
| 账本 | `workflows.jsonl` A1–A13（含 A12 聚合）completed + `workflow.closed delivered` + `role.activated`；`tasks.jsonl` 4 卡各一次（intent-confirm/proposal/appointment/merge-main）+ A12b close note（`acceptanceIntensity=lightweight；运行期未验证…`）；`releases.jsonl` requested/confirmed(by customer)/merged（base `2b9ef04`、tip `5428a28`、merge `152448a`、files 3）；`basis.jsonl`（target 内）recorded（`bas-68e8…`，reviewRoleId=verifier）+ verified ok |
| 旧机制 | `.ans/trunk`、`.ans/runs`、`version-changes.json`、`stable-writes.json`、`stable-write-permits.json` **均不存在**；`versions.jsonl`/`versions.initialized`/`doc-freezes.json` **存在**（见 L-1） |
| 审计 | `docs/audit/shell-gate.jsonl` 20 行：allow 12（git status/log/add/commit 等）、deny 3（`git log -1 --stat`、`git rev-parse HEAD`、`git show <oid>`，readonly 白名单外形态）、无审批卡；两次 `git commit -m "<单 token>"` allow（B32 生效） |
| 客户卡 | 4 张：intent-confirm / proposal / appointment / merge-main 各一次；均由 `by:"customer"` 结算；judge 代批 0；merge-main 卡 preview 实测含 workflowId/flowId、main base OID `2b9ef04…`、branch tip OID `5428a28…`、变更文件数 3、diff stat（553 insertions）、合并方式 `merge --no-ff`、高风险提示（截图证据 `screenshots/merge-main-card-pre.jpeg`） |
| 验收归档 | `docs/acceptance/snake-game-acceptance-v1.md`（`821861…`）含 criteria/report path+sha256、结论、staffDecision、archivedAt；`reportSha256=6ddf838f…` 与最终报告 `deb88ab2…` 不一致（L-2） |
| 隔离/零触碰 | `zero-touch.json` 31 条对照（29 旧运行根全 true）；本角色未触碰 9222/9223/9224 |
| 证据清单 | `sha256sum -c` **63/63 OK**；`record-file.json` sha256 = `dde4ecce…` |

**缺失证据（RR-03 决定性）**：运行根与 `_evidence` 中**没有任何**合并后打开/游玩游戏的 UI 截图、浏览器/Playwright 记录或运行日志；verifier A12b 报告为 `blocked`（运行期未验证），B31 轻量验收 note 明确记录「运行期未验证（静态证据接受）」。即 **RR-03「客户可玩/可开（真实 UI 验证）」未执行、未取证**。

---

## 五、逐条判定

> 证据指针：`E01` = 证据目录 `01-basis-hashes.txt`；`E02` = `02-knownred-and-test-runs.txt`；`E03` = `03-rr28-target-verification.txt`；`TR/*` = `test-runs/*`；`S/*` = `screenshots/*`；`RR28` = `角色卡/测试/docs/change/2026-11-11_RR28_two-fixed-workflow-paths.md` 及其 `_evidence/`。

### 5.1 AC（30）

| 编号 | 判定 | 证据与说明 |
| --- | --- | --- |
| AC-01 | **通过** | `src/common/编排/workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization`（chief→verifier 允许；chief→convener 仅 stage-request；chief→product/rapporteur/nominator `chief-production-dispatch-forbidden`；convener→verifier `convener-to-verifier-forbidden`；self/unknown-source 拒绝；convener→内置仅 product/rapporteur/nominator）+ `test/编排/workflow-dispatch-fixed.test.ts`、`test/桌面应用/fixed-path-routing.test.ts`（13/13 pass，TR/fixed-routing.tap） |
| AC-02 | **通过** | 窄例外五条件在 `workflow-dispatch.ts`（purpose=review、target===reviewRoleId、roster review、basis reviewRoleId、targetActivated）；roster 原文 `roles[].review` 解析在 `workflow-preconditions.ts`（v4、至多一个 true）；会话侧 `app/desktop/session.ts` 从 basis/roster 取证据；负例测试见 fixed-path-routing / workflow-dispatch-fixed |
| AC-03 | **通过** | legacy 谓词/常量逐字：`evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/`CHIEF_DISPATCHABLE_BUILT_INS`/`isConvenerBuiltInDispatchTarget` 未被改语义；`CHIEF_HUB_DISPATCH.targetRoleIds` 五内置、`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds=["verifier"]` 实读一致；legacy 测试（workflow-preconditions、roles 差分、convener-module-consumption）在编排/roles 套件通过；star-routing 7 + i-full-chain 2 按 v1.1 known-red 口径同名不恶化（实跑 9/9 同名，TR/star-ifull.tap） |
| AC-04 | **通过** | Q6 fail-closed 在 `withEvidence`（sourceIsCurrent、幂等键、identity、assignedTask open/creator/stage/workflowId、stage-request sourceTaskId）；负例（伪造/已关闭/错创建者/过期轮次/session 重启/fenced/目标不存在/自派/非 reviewRoleId/未标记 review）见 fixed-path-routing（13/13）与 workflow-dispatch-fixed |
| AC-05 | **通过** | `dispatch_task` schema 新增 taskKind/workflowAction/workflowPath/workflowId/stage/reworkOf（`src/provider/runtime/schema.ts`）；`DispatchTaskPayload`/session 透传；stage-request 仅 chief→convener、sideEffect=read-only、无 module/写集（`validateStageRequestFacts`）；测试 workflow-stage-request/workflow-dispatch-fixed |
| AC-06 | **通过** | `workflowIdFor=wf-+sha256(flowId|path|sourceTaskId|requestDigest)` 无时钟/随机；首请求先算 workflowId 并统一 `stage-request:<wf>:<stage>:<attempt>`（`workflow-service.ts::requestStage`）；缺 sourceTaskId ⇒ `stage-request-source-missing`；重复请求 replay 返回原任务（workflow-stage-request 测试通过） |
| AC-07 | **通过** | open advance 不变量（`stage-request-open`）；stop 顺序（先收口 open advance → stop 请求 → 停稳证据 → closed/stop-unconfirmed）；`confirmStop` 实现；测试 workflow-stage-request / workflow-state 通过 |
| AC-08 | **通过** | `WORKFLOW_STAGE_TRANSITIONS`/`WORKFLOW_REWORK_FALLBACKS` 与 v1.3 §4.4 一致；A1/A4/A7 完成于 task.created；A2/A5/A9/A11/A12 收口于账本事件；A10 为 request.resolved（不派实现）；A10 未完成发 A11 ⇒ `stage-transition-invalid`；A12b rework→A11（reworkOf A12b）；关键事件缺失/坏行 ⇒ `workflow-corrupt`；测试 workflow-state / workflow-fixed-b131 / workflow-close-intent 通过；RR28 账本实测 A1–A13 顺序符合 |
| AC-09 | **通过** | A12a criteria 先于 A11：`requestStage` 对 A11 检查 A12a 非 pending（workflow-service.ts:903-907）；RR28 实测 A12a dispatched 11:13:31 < A11 requested 11:13:45；A12 完成 = A12b accepted + 归档（`closeTask` + `archiveAcceptance`）；项目验收角色走 AC-02 窄例外；验收强度记录于 A12b note（RR28 实证）；B31 轻量验收仅限 A12b + 归档 + 非空 note（`closeTask` 实现） |
| AC-10 | **通过** | 路径 B：`preparePathBStart`（无仓库 ⇒ `b-repository-required`，不自动 init；`basis.recorded(reason:"path-b")`；不写团队计划）；`derivePathBWriteSets`（scope.files ∩ roster 模块属主 / boundary，治理文档限产品/策划，`.ans/**`/`角色卡/**` 拒）；测试 workflow-mode / b-change-scope / b3-fixed-baseline-pathb 通过 |
| AC-11 | **通过** | `prepareReleaseMerge`：A13 需 A12b completed + `docs/acceptance` 归档（且报告字节漂移 ⇒ basis-drift）；B4 需 B3 completed + 运营报告（不要求 A12b）；缺项 ⇒ `release-workflow-not-ready`（附路径与缺失项）；RR28 A13 前归档已写入；测试 b3-release-merge-desktop（17/17） |
| AC-12 | **通过** | `workflowMode` per-flow（project.json legacy 强制、活动 legacy run/trunk 保持 legacy、其余 fixed）；每项目至多一个活动 fixed workflow（`workflow-workspace-busy`）；`writeProjectConfigWorkflowSchema` 原子写、保留既有键、失败 `project-config-write-failed`、不弹卡；mode-switch 8/8（TR） |
| AC-13 | **通过** | fixedCards：chief=`intent-confirm/proposal/appointment`、convener/rapporteur=`decision`、product/nominator/verifier=`[]`；`cardKindsOf(role, matrix)` 读 fixedCards；三卡不合并；fixed 不发 acceptance 卡；legacy D3 读取方只接受 sourceRoleId=nominator（不以 fixed 决议为 D3 证据）；RR28 4 卡各一次、appointment source:`stage-a10`/workflowId/targetRoleIds 实测在账 |
| AC-14 | **通过** | `merge-main` app-owned 非判断卡（`GOVERNANCE_APP_OWNED_CARD_KINDS` 含、`GOVERNANCE_CARD_GROUP` 不含、`governanceCardGroup("merge-main")===undefined`、`planJudge`/judge 排除、客户本人）；preview 必含字段由 `mergeMainCardPreviewText` 构造；RR28 实卡截图（S/merge-main-card-pre.jpeg）含 workflowId/flowId、base `2b9ef04…`、tip `5428a28…`、文件数 3、diff stat、merge --no-ff、高风险提示；judge 代批 0；3 确认卡 + 高风险动作卡口径成立 |
| AC-15 | **通过** | `complete_team_plan` v4（workflowId/plan；runId/baseDigest 出现即 `baseline-legacy-field-forbidden`）；`git init -b main`（失败回退 symbolic-ref；父仓库检测）；`.gitignore` 托管块 + baseline commit；任务分支 `ans/task/<wf>` 创建/复用；dirty 只算 tracked+非忽略 untracked；文档 hash/8 MiB 预算/团队计划结构校验；测试 workflow-baseline 通过；RR28 基线 `2b9ef04`/托管块/分支实测一致 |
| AC-16 | **通过** | §5.5 全部失败码在代码中实现（逐码 grep 实查：baseline-git-init-failed / parent-repository-detected / repository-dirty / gitignore-dirty / branch-exists / b-repository-required / project-config-write-failed / document-missing|unreadable|budget / team-plan-invalid / plan-hash-drift / roster-drift / legacy-field-forbidden / operation-conflict / ledger-write-failed / identity-invalid）；失败写 `stage.blocked`（code/summary/attempt）、不产生客户卡；幂等 replay；测试 workflow-baseline/workflow-mode 通过 |
| AC-17 | **通过** | 三账本 `ans-workflow/v1`/`ans-basis/v1`/`ans-release/v1`（`workflow-service.ts` 常量/读写）；5 MiB × 3 轮转；只追加 + 幂等键 replay + 坏行计数；关键事件缺失 ⇒ `workflow-corrupt`；task.created fixed（workflowId 存在 ⇒ 豁免 runId/runState；无 workflowId 旧规则保留）；request.created/resolved documentRefs；测试 workflow-ledger/workflow-state 通过；RR28 三账本事件完整 |
| AC-18 | **通过** | `closeTask`（fixed）：真实创建者、报告/状态/幂等、`task.closed` + 阶段事件、不触 trunk/CAS；`prepareIntent/finalizeIntent`（intent hash/documentRefs/`docs/intents/<intentId>.md` 校验/`stage.completed A3`，不写 doc-freeze/trunk/CAS）；legacy 实现保留；测试 workflow-close-intent 通过；RR28 A3 立即收口（B24） |
| AC-19 | **通过** | basis 记录/预算/SHA-256/bytes；A11/B1/B3/A12a/A12b/A13/B4 关键门 `verifyBasisForWorkflow`（drift ⇒ `basis-drift`）；`basis.amended`/`previousBasisId`（不跳代）；Q4 path-b 只读快照（reason:path-b，不产生写权）；`role.activated` 与 `role-activation-unrecorded`；`basis.verified` 节流（`BASIS_KEY_GATE_STAGES`）；测试 workflow-basis-b21 / workflow-ledger 通过；RR28 basis.recorded（reviewRoleId=verifier）+ basis.verified ok |
| AC-20 | **通过** | `archiveAcceptance`：`docs/acceptance/<flowId>-acceptance-vN.md`（vN 随 report 版本）、criteria/report path+sha256、结论、staffDecision、archivedAt；幂等 `acceptance:<wf>:<reportSha>`；已存在不同 hash ⇒ `acceptance-archive-failed`（不覆盖）；归档失败阻塞 A12；测试 workflow-close-intent / b3-fixed-baseline-pathb；RR28 归档实测在案（哈希见 L-2） |
| AC-21 | **通过** | `SHELL_RULES_VERSION="5"`；`matchReadonlyGit` 保留；`matchTaskGit` 仅 `git add <literal ⊆ writeSet>` / `git commit -m <single>`；`-A/--all/./glob/-F/-F -/--amend/--no-verify/-a/--author` 拒绝；其余裸 git 子命令硬拒（`git-command-not-ordinary`）；`task-git-argv-shape` 区分 scope 缺失（B32）；staged ⊆ writeSet 临界区（shell-gate/run-role）；每次 git 写审计；测试 shell-write-guard-task-git-shape / classify-shell-v5（门禁套件通过）；RR28 两次 commit allow、deny 3 次只读形态 |
| AC-22 | **通过** | 应用执行（不经 shell）、固定 argv/sanitized env；initial `git switch -c main <tip>`；merge `git switch main` + `merge --no-ff`；占用/失败 `release-main-busy`；冲突 `merge --abort` + 切回任务分支 + `release-merge-conflict`；成功 `release.merged`（base/tip/mergeOid/files/diffDigest）、停在 main；幂等 `release:<wf>:<tip>`；`release-already-merged`；拒绝/超时 `release.rejected`；不 push/tag；B 路径非 main 基线披露；测试 b3-release-merge-desktop（17/17）；RR28 merge 回执实测 |
| AC-23 | **通过（附限制 L-1）** | 已退役机制逐文件处置与实现一致：fixed 会话不注入 git_query/git_candidate/git_publish/select_run_change/request_stable_write/submit_refactor/submit_version_change/request_version_decision（run-role.ts 注入面实查）；`.ans/trunk`/`.ans/runs`/version-changes.json/stable-writes.json/stable-write-permits.json 在 RR28 target 均不存在；旧账本只读忽略（`LEGACY_STATE_IGNORED_PATHS`）；旧分支不参与；已合并修复不回退。**限制 L-1**：fixed 运行期写入了 `.ans/state/versions.jsonl`/`versions.initialized`/`doc-freezes.json`——与设计 v1.3 §6.5/§9.4.5 的「旧账本不写」字面冲突，且 AC-23 字面含「versions/stable 账本」；本报告按 AC-23 所列已退役机制（trunk/bootstrap/冻结闭包/候选 ref/run pin/stable-write 许可/VCA/refactor）口径判通过，该口径冲突须协调方裁定（见 §六 L-1） |
| AC-24 | **通过** | 6 内置角色 legacy 数据冻结（tests/roles 285/285；差分金样未改）；fixed 新增字段/context；`chief-workflow-v2.md` 与 legacy v1 字节未改；`activate_role_documents` v2（path-only + 应用回填 hash）；`close_created_task` v2；Q2：`requestReleaseMerge` **未新增**（G-IR 拒绝项，测试断言源码无该 token），merge-main 由应用构造；接口评审记录：第三轮复核 v1.3（`550872d7…`）§36/§128/§145、设计记录 v1.3（`6ab9e1e9…`）与 B0 门禁记录（EV-05） |
| AC-25 | **通过** | append-only 审计 sidecar 保留且只增字段（B4.1 `taskGit` 加法）；judge 代批保留且仅非高风险（intent/proposal/appointment/decision），merge-main 排除（`governance-judge*.ts`）；doc_format 54 格式（实测 54 条）；team-plan/v3 与 project-roster/v4（v3 兼容、可选 roles[].review）说明同步；`resolve-write.ts`/`boundary-core/parse/yaml`/`decision-card.ts` 自基线零提交；高风险清单不变（EXTERNAL_RE/watchdog/directive 未改） |
| AC-26 | **通过（附治理观察 G-1）** | H1=0 的产品/架构面：`src/common/gates/` 自 `10f90c7` 零 diff；无新角色；无新客户可见门（merge-main 为既有高风险机制具体化）；五层/依赖/边界文件格式未变。`角色卡/**` 的改动限于角色自有文档记录（v1.2 允许的 `api-spec.md`/`memo.md`/`feature-map.md` 与各角色 `docs/change/` 批次记录；功能卡/capabilities/legacy 数据逐字未改——roles 差分 285/285）。**G-1**：`cdbdeb9` 在 `角色卡/桌面窗口`/`角色卡/运行时核心` 的 boundary.md/yaml 补登 5 个逐文件条目（客户端 B29/B30 授权；4 文件同属其他角色目录级授权），字面触及「不改 `角色卡/**`」，任务书列为治理观察，待裁定（§六 G-1） |
| AC-27 | **通过** | Q1 固定不发 acceptance 卡（verifier fixedCards=[]；RR28 无 acceptance 卡）；Q2 发布合并未新增工具、应用自动呈卡（G-IR 拒绝 `requestReleaseMerge`）；Q3 写任务串行 + 每项目单活动 fixed（workflow-service）；Q5 只本地合并（workflow-git 无 push/tag；RR28 实测）；Q6 fail-closed（AC-04）；Q7 A12 验收角色（默认 verifier / roster review）+ 应用归档（AC-02/09/20） |
| AC-28 | **通过（附限制 L-3）** | 全部判据基于同一候选 `8adb8fa` 与同一工作树环境；D1 每批记录 typecheck + TAP + 失败名 diff + 写集清单（B13.1–B32 记录抽查一致）；known-red 按 §二口径；接口评审/H1/真机日志截图齐备（RR28 原件）；实现自述不替代证据。**L-3**：RR28 证据包缺 basis.jsonl/卡截图、记录文件数 62 与 63 不一致（打包缺口） |
| AC-29 | **通过** | T-01…T-20 全部执行并记录（§5.2）；新增确定性失败 0、新 skip 0；三套件失败名与冻结 known-red 逐名一致（E02） |
| AC-30 | **未取证** | RR-01…RR-06 中 RR-03 的「客户可玩/可开（真实 UI 验证）」未执行/无证据（§四、§5.3）；其余 RR 通过。按 B1 规则 3，缺失证据不得按 pass/NA ⇒ AC-30 不能通过；整体结论因此为「不通过」（见 §七） |

### 5.2 T（20）

| 编号 | 判定 | 证据指针 |
| --- | --- | --- |
| T-01 | 通过 | `test/编排/workflow-preconditions.test.ts`（legacy 逐字）+ `workflow-dispatch-fixed.test.ts` + `test/桌面应用/fixed-path-routing.test.ts`（13/13；含全组合/负例）；编排套件通过与 known-red 对照 |
| T-02 | 通过 | `test/编排/workflow-stage-request.test.ts`（字段/幂等/重复抑制/无写权/源缺失/open 不变量/stop）；编排套件通过 |
| T-03 | 通过 | `test/编排/workflow-state.test.ts`（合法/非法转移、A10→A11、A12a/A12b、rework、坏行/幂等）；编排套件通过 |
| T-04 | 通过 | `test/编排/workflow-close-intent.test.ts`（close v2/intent/documentRefs/不触 trunk）；编排套件通过 |
| T-05 | 通过 | `test/编排/workflow-mode.test.ts` + `test/测试/mode-switch.test.ts`（8/8，TR/mode-switch-fullchain-bscope.tap） |
| T-06 | 通过 | fixed task.created 豁免 run-required（task-state.ts）+ workflow-ledger 测试；编排套件通过 |
| T-07 | 通过 | `test/编排/workflow-baseline.test.ts`（git init/.gitignore/branch/dirty/预算/失败面/幂等）；编排套件通过；RR28 基线实测 |
| T-08 | 通过 | `test/编排/workflow-ledger.test.ts` + `workflow-basis-b21.test.ts`（basis/drift/verified/role.activated/path-b/坏行/不写旧账本）；编排套件通过 |
| T-09 | 通过 | `test/门禁引擎/classify-shell-v5.test.ts` + `shell-write-guard-task-git-shape.test.ts`；gates 570/564/5/1（known-red 5/5 一致） |
| T-10 | 通过 | `test/桌面应用/b3-release-merge-desktop.test.ts`（17/17 含 b3-fixed-baseline-pathb）+ 编排 release 测试；RR28 merge 回执 |
| T-11 | 通过 | `test/编排/decision-card.test.ts`（编排套件）+ `test/roles/**`（285/285）+ 桌面 customer-input 路径；RR28 3 卡实证 + merge-main 截图 |
| T-12 | 通过 | `test/编排/path-b`（workflow-mode/preparePathBStart/derivePathBWriteSets 测试）+ `test/测试/b-change-scope.test.ts`（8/8 目标集内）+ desktop pathb（17/17） |
| T-13 | 通过 | `test/roles/**` 285/285（模块差分/oracle/卡种/targets/context）；`test/门禁引擎/role-module-contract.test.ts`（gates 通过，非 5 红）；接口评审记录（EV-05） |
| T-14 | 通过 | `test/测试/mode-switch.test.ts`（8/8 目标集）+ legacy 9 红实跑同名（TR/star-ifull.tap）；旧 fixture 不回归（known-red 5/24/33 同名单） |
| T-15 | 通过 | `shell-post-audit` 相关测试（编排/gates 套件通过）+ B4.1 审计加法字段；RR28 shell-gate 20 行 |
| T-16 | 通过 | `test/测试/fixed-path-full-chain.test.ts` 3/3（TR/mode-switch-fullchain-bscope.tap） |
| T-17 | 通过 | `npm run typecheck` exit 0（E02） |
| T-18 | 通过（限制 L-6） | 三套件 known-red 33/5/24 逐名一致（E02）；star 9 同名；VCA 9 同名；optional-acceptance 未完成独立复跑（L-6） |
| T-19 | 通过（附 G-1） | `src app test` 工作树干净；`src/common/gates` 零 diff；分支 diff 仅 B 系列实现/测试/记录；`角色卡/**` 有角色自有记录（v1.2 允许）与 G-1 边界 Delta；写集外 diff 见各 B 记录（B 记录均声明写集外 diff=0） |
| T-20 | 通过 | doc_format 54 条（实测）；team-plan/v3 与 project-roster/v4（v3/v4 双字面量、roles[].review）说明/解析/错误文案同步；`test/编排/doc-format-specs.test.ts` 在编排套件通过 |

### 5.3 RR（6）与 EV（8）

| 编号 | 判定 | 证据与说明 |
| --- | --- | --- |
| RR-01 | **通过** | 全新空 target、独立 userData/9224、真实 Electron 44.7.0 + 真实模型 + 真实渲染；运行根四目录；29 旧运行根零触碰（zero-touch 31 项）；本角色未触碰 9222/9223/9224 |
| RR-02 | **通过（附披露 A13）** | A1–A13 全链账本/卡/账本事件完整；A12a 先于 A11；A12b→A12 归档；A13→merge→closed delivered；交付物在案。**A13 客户交付说明未送达**（见 L-2/§六），作为披露，不单独触犯 AC/T/EV |
| RR-03 | **未取证** | 卡记录/合并回执通过（merge-main 客户本人、merge `152448a`、不 push/tag）；**「客户可玩/可开（真实 UI 验证）」缺失**：无合并后游戏 UI 打开/游玩截图或运行记录，A12b 报告与 B31 note 均记「运行期未验证」⇒ 该子项无证据 |
| RR-04 | **通过（附 L-1/L-3）** | workflows/basis/releases 事件完整（target 内 basis.jsonl）；`.ans/trunk`/`.ans/runs` 未写入；shell-gate 有 git 审计；`.gitignore` 托管块；治理文档未跟踪；3 卡各一次 + merge-main 一次；无额外客户门；无 judge 冒充；versions/doc-freezes 写入见 L-1；basis.jsonl 未入 `_evidence` 见 L-3 |
| RR-05 | **通过** | 全链无失败；成功信号后 finalize；证据完整；未合并 ans-studio main/未打 tag/未发布 |
| RR-06 | **通过（within budget）** | 客户消息 1；卡 4（≤4，decision 0）；真实任务 21（≤60；chief 12≤18、convener 9≤18、product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 2≤4、实现写 2≤10）；Git 3 提交 + merge ≤12；墙钟约 16.5 分钟 ≤90；模型轮次/用量如实报告（无 cost_usd，不估算） |
| EV-01 | **通过** | 分支/HEAD/92 提交；无 tag/无远端/未合 main；旧分支停用（E01、§二） |
| EV-02 | **通过** | B13.1–B32 D1 记录含 typecheck/TAP/失败名 diff/文件清单（抽查一致）；本报告独立复跑补充（E02、TR/*） |
| EV-03 | **通过** | known-red 按 §二复测；三套件 diff 空；star 9 同名；VCA 9 同名（E02） |
| EV-04 | **通过** | T-01…T-20 状态表（§5.2）+ 测试原件（TR/*） |
| EV-05 | **通过** | 接口评审记录：第三轮复核 v1.3 `550872d7…`、设计记录 v1.3 `6ab9e1e9…`、B0 门禁类型记录（`DispatchMatrixMode`/`RoleDispatchPurpose`/`context({matrix})`/`workflowSchema`）；merge-main 卡种/模块导出/`project-roster/v4`/`requestReleaseMerge` 拒绝项均在记录与测试中；失败即不支持的结论为 `requestReleaseMerge` 未新增 |
| EV-06 | **未取证（部分）** | RR 日志/截图/账本/预算/隔离证明齐备（RR28 原件 + 本报告 §四），但 RR-03 真实 UI 可玩验证缺失 ⇒ 真机全链证据不完整 |
| EV-07 | **通过（附 G-1）** | 写集外 diff：各 B 记录声明 0，工作树干净；`src/common/gates/` 零 diff；`角色卡/**` 改动限于 v1.2 角色自有记录 + G-1 边界 Delta（观察） |
| EV-08 | **通过** | 本报告（B2 独立评估，含限制/披露） |

---

## 六、披露、限制与治理观察

| 编号 | 类型 | 内容 | 是否触犯 B1 判据 | 建议 |
| --- | --- | --- | --- | --- |
| **R-1** | **决定性缺口** | RR-03「客户可玩/可开（真实 UI 验证）」未执行：合并后无游戏 UI 打开/游玩记录；A12b 报告 blocked（运行期未验证）、B31 轻量验收 note 记录静态接受 | **是——RR-03，并导致 AC-30 不能通过** | 新增 tester-side 真实 UI 验证步骤（Playwright/独立浏览器打开 target `index.html`，验证键盘/计分/重开/边界碰撞，留存截图/视频与步骤），完成后重跑 RR-03（新 RR 轮次或补充验证记录须由协调方定义）；在此之前 B2 不判通过 |
| **R-2** | 关联接缝 | A13「运行期未验证」客户交付说明未送达（merge-main 卡为标准文案；驱动 4 秒 finalize 打断幕僚说明回合；chief replay `[Request interrupted by user]`） | 不单独触犯 AC/T/EV（RR-02 的「运营汇总」以账本/卡交付为据）；但与 R-1 同源，且违反 `chief-workflow-v2.md` A13 段「轻量验收须在 A13 交付说明披露」的操作纪律 | B33 候选：merge-main 卡/close 摘要携带 acceptance note 披露；驱动等待幕僚 A13 说明（或定义完成标记）再 finalize |
| **L-1** | 设计-实现口径 | fixed 运行期写入 `.ans/state/versions.jsonl`（7 条：intent baseline + proposal/modules/architecture/roster/draft-updated）、`versions.initialized`、`doc-freezes.json`（RR28 target 实测）；设计与 AC-23 字面「versions/doc-freezes 旧账本不写」冲突；B23 的 `project_state [versions]`/team-plan hash 指引依赖该记录 | **按 AC-23 所列已退役机制口径不触犯**（trunk/runs/VCA/stable/refactor 均不写；旧工具不注入）；若按「versions 账本」字面含 `versions.jsonl`，则 AC-23 应改判不通过——需协调方裁定 | 二选一：①协调方书面确认 R9 `versions.jsonl`/`doc-freezes.json` 属应用文档哈希账本（非本 T3 退役对象），同步修订设计 §6.5/§9.4.5 与 B1 AC-23 表述（新版本，不原地改）；②fixed 写门禁跳过 R9 after-write 登记与 doc-freezes 刷新，改由 basis/新账本承载哈希，并加确定性断言 |
| **L-2** | 证据链接缝 | 验收归档 `reportSha256=6ddf838f…`（归档时 14,610 B）≠ 最终报告 `deb88ab2…`（14,860 B）；A12b 收口后重复投递的 verifier 会话于 11:19:59.418 `edit_file` 追加第 6 条，归档未出 v2 | 不单独触犯 AC-09/AC-20（归档在 A12 完成时按当时字节生成、幂等键正确；A13 前 `prepareReleaseMerge` 的报告字节漂移检查已通过）；属收口后可变性接缝 | B33 候选：收口/关闭后抑制重复投递并禁止编辑已归档报告；报告变更 ⇒ 新版本 + 新归档 v2；归档写入前重算并记录 report 字节 |
| **L-3** | 证据包缺口 | RR28 `_evidence/` 未含 `basis.jsonl`（target 存在）；未含 merge-main/appointment 卡截图（原始运行根有）；记录 §六「共 62 文件」vs 实测 63 | 不影响 RR-04 实质（target 原件可核验） | 补齐证据包（basis.jsonl、ui-card-03/04、记录文件数更正） |
| **L-4** | 依据漂移 | 启动计划 B1 表哈希 `08450af1…`（原 blob `160ca2a`）≠ 当前 `a66c47d7…`；`ad22192` 仅改 §五 进展一行 | 否（B1 标准本体哈希一致；漂移已解释） | 无需动作；后续引用当前哈希 |
| **L-5** | 判据版本 | 仓库存在 B1 v1.1/v1.2（v1.2 声明「最终 B2 按本 v1.2 全量判定」），任务书只引 v1；v1.1/v1.2 逐字保留 v1 条目并仅修订 known-red/AC-26 例外/TM-5/amendBasis | 否（本报告按任务书以 v1 为主体，known-red 采用 v1.1、角色记录采用 v1.2） | 协调方在后续轮次明确 B2 的判据版本引用 |
| **L-6** | 测试限制 | `optional-acceptance` 独立复跑在 1 fail/2 pass 后挂起（3 cancelled 基线用例），未形成完整计数；该文件不在三套件要求内 | 否（B1 基线为 6/2/1/cancelled 3；D1 记录一致） | 后续由测试角色在可控超时下复跑并留存完整 TAP |
| **G-1** | 治理观察（待裁定） | `cdbdeb9` 在 `角色卡/桌面窗口`/`角色卡/运行时核心` boundary.md/yaml 补登 5 个逐文件条目（B29/B30 客户端授权；4 文件同属其他角色目录级授权）；字面触及 AC-26/T-19「不改 `角色卡/**`」 | 任务书列为治理观察；本报告不据此单独判失败，等待协调方裁定 | 裁定：若属 People-Ops 授权 delta，记录 B1 v1.3 例外（类似 v1.2 角色自有记录例外）；若否，回退该 Delta 并重核写集 |

---

## 七、最终结论

- **整体：不通过（未达到全部判据通过）**。唯一不可通过项为 **RR-03「客户可玩/可开（真实 UI 验证）」未取证**，因此 **AC-30（真机全链 RR-01…RR-06 全部通过）不成立**；EV-06 相应记为未取证。其余 29 条 AC、20 条 T、5 条 RR、7 条 EV 均通过（含 L-1/L-3/L-6 限制与 G-1 治理观察）。
- **分组计数**：AC **29 通过 / 0 不通过 / 1 未取证**；T **20 通过 / 0 不通过 / 0 未取证**；RR **5 通过 / 0 不通过 / 1 未取证**；EV **7 通过 / 0 不通过 / 1 未取证**。
- **未通过原因不是实现质量**：A1–A13 全链、3 卡、merge-main 客户卡、账本/归档、Git 普通用法、known-red 与确定性矩阵均实测通过；缺口是 RR-03 要求的**合并后真实 UI 可玩/可开验证**没有执行（verifier 无运行通道，tester 未在合并后打开游戏），且 A13 披露说明被驱动早停打断。
- **放行建议**：在下一轮 RR 中补做真实 UI 可玩验证（R-1）并修复 A13 披露通道（R-2），同时按 L-1 完成 versions 账本口径裁定、按 G-1 完成边界 Delta 裁定；上述完成后可重提 B2 复判。**在此之前，本 B2 不建议合并 ans-studio main、不打 tag、不发布。**

---

## 八、证据目录（本报告写区说明）

- 报告与证据写区：`docs/acceptance/` 与 `docs/acceptance/_evidence/2026-11-11_two-fixed-workflow-paths-b2/`（任务书二选一中的`docs/acceptance/_evidence/`）。
- `01-basis-hashes.txt`：B1 v1/v1.1/v1.2、设计 v2/v1.3、策划记录、启动计划（含原 blob）、三轮复核、RR28 记录/清单、候选身份实测哈希。
- `02-knownred-and-test-runs.txt`：三套件计数、known-red 逐名 diff（空）、star/VCA 对照、定向套件计数。
- `03-rr28-target-verification.txt`：RR28 target Git/交付物哈希/归档与报告哈希差/旧账本探测/账本审计/证据缺口。
- `test-runs/*.tap`：本角色实跑的完整输出（runtime-core、gates、orchestration、mode-switch+full-chain+b-change-scope、desktop release/pathb、roles、fixed-routing、star-ifull、vca）。
- `screenshots/merge-main-card-pre.jpeg`/`merge-main-card-after.jpeg`/`appointment-card-pre.jpeg`：RR28 原始运行根卡面证据副本（含 preview 全字段）。

## 九、纪律声明

- 本角色只做只读判定与自身报告/证据写入：未改产品代码、测试、角色卡、边界或其它角色文档；未提交/推送/合并 ans-studio main、未打 tag、未发布；未读取/打印 `.env`；未触碰/占用 9222/9223/9224；所有测试运行仅写临时目录与本证据目录。
- 所有判定为本角色独立核验所得；转述（含实现自述、RR28 记录）只作为线索，均以原始证据/实跑复核为准；不能通过项如实写为「未取证」，未为变绿放松标准或编造证据。

---

## 附：B2 增量建议清单（B33/B34 候选）

1. **B33（RR-03 收口）**：tester-side 真实 UI 可玩验证（打开 target `index.html`，验证键盘控制/计分/重开/边界碰撞；留存截图/步骤）→ 补 RR-03 证据并重判 AC-30。
2. **B33（A13 披露）**：merge-main 卡/close 摘要携带 acceptance note；驱动等待幕僚 A13 说明或定义完成标记；避免成功信号后 4 秒早停。
3. **B33（验收归档完整性）**：A12b 收口后抑制重复投递/编辑；报告字节变化触发 v2 归档；归档与最终报告 hash 一致性检查。
4. **B33（versions/doc-freezes 口径）**：按 L-1 二选一（协调方确认 + 设计/B1 修订，或 fixed 写门禁跳过 R9 登记并加断言）。
5. **B33（证据包）**：RR28 `_evidence` 补 basis.jsonl/卡截图；更正「62 文件」为 63。
6. **G-1 裁定**：People-Ops 边界 Delta 的 AC-26/T-19 例外（B1 v1.3）或回退。
