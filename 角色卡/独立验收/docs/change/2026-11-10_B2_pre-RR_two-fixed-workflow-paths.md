# B2 独立验收（预 RR 放行门）：两条固定工作流路径（T3，2026-11-10）

- 日期：2026-11-10
- 角色：ANS「独立验收」（独立固定上下文；本文件仅写入本角色写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3）
- 节点：**B2 独立验收（预 RR 放行门）**——按 B1 冻结判据全量判定；本文件不构成合并/发布/客户放行授权
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 分支/候选：`feat/two-fixed-workflow-paths` / **HEAD `e28923cadf957df2ef9b9f88f25b6957d07da405`**（B5/B5.1/B5.2 已提交）
- 基线：`origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；代码基线 `10f90c7`（B1 冻结时代码态）
- 纪律：只写本角色验收记录/证据；**不修改产品/测试代码、不改角色卡/边界、不提交/推送/合并/发布**；
  不运行真实 Electron/真实模型；不占用 9222/9223；未执行 RR（预算另报）。

---

## 0. 结论摘要（先读）

1. **候选身份**：HEAD `e28923c`，分支 `feat/two-fixed-workflow-paths`，距 `origin/main`（`d9e3e99`）
   26 个提交、0 落后；**无合并提交、无 tag、无远端分支**（分支未推送）；旧分支
   `feat/initial-workflow-publication-completion` 的 `4a0bafd`/`882d84b` 不是 HEAD 祖先（不参与）。
   工作树 `src/`、`app/`、`test/` 与 HEAD 零 diff（候选代码/测试洁净）。
2. **依据 hash 全部实测一致**：B1 `b607f100…`、设计 v2 `b075829b…`、v1.3 `ae737dcf…`、
   G-IR `08e01726…`、团队计划 `4c63ccbc…`、启动计划当前 `a66c47d7…`（相对 B1 引用的 `08450af1…`
   仅更新「进展」一行，§七决策逐字不变）、B5.2 `0ac3a0d9…`。
3. **独立复跑（不采信自述）**：`npm run typecheck` **exit 0**；
   `test/测试/fixed-path-full-chain.test.ts` **3/3 pass**（两次运行一致）；
   `mode-switch` + `b-change-scope` **5/5 pass**；20+ 关键套件（派发矩阵/状态机/收尾/基线/账本/依据/
   发布/路径 B/归档/文档格式/Git v5/角色模块/桌面 fixed）**全部 pass**；
   全域只读复跑：`test/编排` **1,328 / 1,302 pass / 24 fail / 2 skip**（失败名集合与代码基线 `10f90c7`
   的 B0 before TAP **24/24 逐名一致**）、`test/门禁引擎` **528 / 522 / 5 / 1**（与冻结 5 名一致）、
   `test/runtime-core` **586 / 549 / 33 / 4**（与冻结 33 名一致）、`test/roles` **275/275**、
   `test/项目管理/shared` **224 / 219 / 0 / 5**（既有平台 skip）。
4. **逐条判定**：AC **26 pass / 2 fail / 2 insufficient（均 RR 证据类）/ 0 NA**；
   T-01…T-20 **19 pass / 1 fail（T-08）**（附披露）；EV **7 pass / 1 insufficient（EV-06 RR 未执行）**；
   RR-01…RR-06 **未执行（预算另报）**，不计 pass。
5. **放行结论：`不可进入 RR`**（must-fix 2 项）：**MF-B2-01**（AC-03 与 B1 §二 known-red 的基线口径冲突；
   owner=协调方；**不是本候选的产品代码回归**——9 条红在代码基线 `10f90c7` 独立复现同名同因，见 §8-D1）；
   **MF-B2-02**（AC-19/T-08 缺口：`basis.amended`/`previousBasisId` 修正流程、`basis.verified` 关键门节流
   与 **A12a/A12b drift 复核**均 **无实现、无行为测试**——`appendBasisEvent` 仅被 `recordBasis`（recorded）与
   `verifyBasisForWorkflow`（drift）调用，A12a/A12b 为 chief→verifier 直派、不经 `convener` basis 门；
   B0/B1 记录将其 defer 至 B3/B4 但无闭环，见 §8-D10）。除这两项外，其余确定性 AC/T/EV 均 pass；
   协调方裁决/修复后可按新依据复核。
6. **未提交声明**：本记录与 `_evidence/` 仅写入本轮工作树；**未 commit / push / merge / tag / 发布**；
   未运行真实模型/Electron；未占用 9222/9223。

---

## 1. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收标准（冻结，唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`（197 行 / 33,722 B） |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| G-IR 接口评审记录 | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 启动计划 + 协调方决策 §七 | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 当前 `a66c47d746ddf65720e27c77268a9069ceb13fc500c2a71419ad413c4d20a3d9`（90 行；B1 引用态为 `08450af1…`，diff 仅「进展」一行，§七 #1–#8 逐字不变） |
| B5.2 关键证据（去 glue 全链） | `角色卡/测试/docs/change/2026-11-10_B5.2_two-fixed-workflow-paths.md` | `0ac3a0d9f937d0acb976d44529c852f60d9d5622da06aae0f9742e6cdd90de64`（203 行） |

- 证据索引（含全部 TAP/命令输出的逐文件 SHA-256）：`_evidence/28-evidence-index.txt`。

---

## 2. 候选、基线与环境

| 项 | 实测 |
| --- | --- |
| 分支 | `feat/two-fixed-workflow-paths`（工作树 HEAD = 分支 tip） |
| 候选 HEAD | **`e28923cadf957df2ef9b9f88f25b6957d07da405`**（`test(workflow): B5 full-chain deterministic validation and B5.1 production wiring`） |
| 基线 | `origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；`git merge-base HEAD origin/main` = `d9e3e99`；`rev-list --left-right --count` = `0 26` |
| 合并/发布 | `git log --merges origin/main..HEAD` **空**；`git tag --points-at HEAD` **0**；`git tag --list '*two-fixed*'` **0**；无远端 two-fixed 分支（未推送） |
| 旧分支 | `feat/initial-workflow-publication-completion` 存在本地；`4a0bafd`/`882d84b` **不是** HEAD 祖先（`git merge-base --is-ancestor` = 否） |
| 候选差异面（vs 代码基线 `10f90c7`） | `src/` 40 文件、`app/` 6 文件、`test/` 60 文件、`docs/` 9（B1 阶段文档）、`角色卡/` 1,259（**全部为 `docs/change/` 与 `docs/design/` 记录**）；`src/common/gates/` **0 diff**；`package.json`/锁文件/`tsconfig.json`/`.gitignore` **0 diff**（无新依赖） |
| 新文件 | `src/`：`basis-guard.ts`（B0）、`workflow-dispatch.ts`、`workflow-service.ts`、`workflow-state.ts`、`task-git-gate.ts`、`chief-workflow-v2.md`；`app/`：`workflow.ts`、`workflow-git.ts`；均在既有 directory 授权内 |
| 候选文件 hash（抽查） | `test/测试/fixed-path-full-chain.test.ts` `19fb8661…`（= B5.2 记录）、`mode-switch.test.ts` `b38596b8…`、`b-change-scope.test.ts` `a7f97744…`（= B5/B5.2 记录）、`app/desktop/session.ts` `2b9f61b7…`、`app/desktop/workflow.ts` `072b312d…`（= B5.1/B5.2 记录） |
| 环境 | Node v24.22.1；npm 11.19.1；Windows 11；分支工作树；未启动 Electron/模型；未占用 9222/9223 |
| 工作树状态 | `git status --porcelain -- src app test` **空**。工作树另有**候选外**未提交 `M`：`角色卡/chief-code/api-spec.md`、`角色卡/product-code/api-spec.md|feature-map.md|memo.md`（角色文档编辑，非候选、非本角色改动；见 §8-D8） |

- 证据：`_evidence/01-candidate-and-baseline.txt`、`_evidence/02-write-set-boundary.txt`、`_evidence/22-candidate-hashes.txt`。

---

## 3. 独立取证（命令/结果/证据）

> 全部由本角色独立执行；未采信批次记录自述作为判据替代。TAP 均落盘于 `_evidence/`。

| # | 命令（在候选工作树执行） | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **exit 0**（无诊断） | `27-typecheck.txt` |
| 2 | `node --test --test-concurrency=1 test/测试/fixed-path-full-chain.test.ts` | **3/3 pass**（路径 A 全链；路径 B 全链；B 无仓库 fail-closed） | `05-full-chain.tap` |
| 3 | `node --test --test-concurrency=1 test/测试/mode-switch.test.ts test/测试/b-change-scope.test.ts` | **5/5 pass** | `04-mode-switch-and-b-change-scope.tap` |
| 4 | 派发/状态机/stage-request：`workflow-dispatch-fixed`、`workflow-preconditions`、`workflow-state`、`workflow-stage-request` | **59/59 pass** | `06-dispatch-state-stage.tap` |
| 5 | 收尾/基线/账本/依据/模式：`workflow-close-intent`、`baseline-service`、`workflow-ledger`、`basis-guard`、`task-state-fixed`、`workflow-mode` | **35/35 pass** | `07-close-baseline-ledger-basis-mode.tap` |
| 6 | 发布/路径 B/归档/文档格式：`release-merge`、`path-b-baseline`、`acceptance-archive`、`acceptance-judge-minimal`、`doc-format-specs`、`roster-v4` | **53/54 pass**；唯一 fail = `TM-5 schema 字面量全仓扫描`（**同名 known-red，见 §8-D3**） | `08-release-pathb-archive-docfmt.tap` |
| 7 | 门禁 fixed 套件（shell v5/临界区/模块面/矩阵/契约/只读/chief v2 资源/出口） | **90/90 pass** | `09-gates-suites.tap` |
| 8 | 六角色 fixed 模块套件（chief/convener/nominator/product/rapporteur/verifier） | **59/59 pass** | `10-roles-fixed-suites.tap` |
| 9 | 编排其余 fixed 套件（task git/run-role fixed/启动/基线/投影/审计） | **70/70 pass** | `11-orch-remaining-suites.tap` |
| 10 | 桌面 fixed 套件（路由/基线路径B/3卡/发布/自动呈卡/task git 端口/生产接线） | **68/68 pass** | `12-desktop-fixed-suites.tap` |
| 11 | 旧路径：`star-routing` + `i-full-chain` | **3 pass / 9 fail**（与代码基线 `10f90c7` 解包复跑 **9/9 同名同因**，见 §8-D1） | `13-…tap`、`18-legacy-baseline-comparison.txt` |
| 12 | 旧 trunk 套件（events/runtime/service/store） | **27 pass / 1 fail**（`applyStableSnapshot…` = 冻结 known-red 同名） | `14-trunk-legacy-suites.tap` |
| 13 | `version-change-integration`（B1 §二 known-red） | **3 pass / 9 fail**（`vca-channel-unavailable` 同源；与基线同数同名） | `15-version-change-knownred.tap` |
| 14 | 旧谓词 + 六个 module-consumption 套件 | **69/69 pass** | `19-legacy-preconditions-module-consumption.tap` |
| 15 | `test/编排` 全域 | **1,328 / 1,302 pass / 24 fail / 2 skip**；失败名 vs 冻结基线 **24/24 一致** | `16-orch-domain-full.tap`、`20-orch-knownred-comparison.txt` |
| 16 | `test/门禁引擎` 全域 | **528 / 522 / 5 / 1**；失败名 vs 冻结 **5/5 一致** | `21-gates-domain-full.tap`、`26-…txt` |
| 17 | `test/runtime-core` 全域 | **586 / 549 / 33 / 4**；失败名 vs 冻结 **33/33 一致** | `23-runtime-core-domain.tap` |
| 18 | `test/roles` 全域 | **275/275 pass** | `24-roles-domain-full.tap` |
| 19 | `test/项目管理/shared` 全域 | **224 / 219 / 0 / 5**（5 = 既有 Windows 平台 skip） | `25-shared-domain.tap` |
| 20 | `optional-acceptance`（B1 §二 known-red；外部 150s 超时） | 已完成 2 pass / 1 fail 后在测试 4 前挂起（exit 124）；与 B1 known-red「2/1/3」形态一致 | `17-optional-acceptance-knownred.tap` |
| 21 | 代码锚点扫描：`grep -rn "basis.verified\|BasisVerifiedEvent"` / `grep -rn "basis.amended\|previousBasisId"` / `grep -rn "await appendBasisEvent"` | `basis.verified` 仅 `src/model/runtime.ts` 类型+校验（无写入）；`basis.amended` 仅 model 读取/校验（`recordBasis` reason 仅 `baseline\|path-b`，无 amended 写入）；`appendBasisEvent` 仅 2 个调用点（`recordBasis`-recorded、`verifyBasisForWorkflow`-drift）⇒ **AC-19 缺口（MF-B2-02）** | 本报告 §8-D10（命令输出） |

- 基线对照方法（§8-D1）：`git archive 10f90c7` 解包至临时目录 + `node_modules` junction（只读），
  同一命令复跑 `star-routing`/`i-full-chain`，运行后 junction/临时目录已清理；未触碰任何分支/工作树代码。

---

## 4. 逐条判定：AC-01…AC-30

> 规则：pass/fail/insufficient/NA（B1 §三）；证据 = 本报告 §3 已复跑套件 + 代码锚点抽查 + 批次记录（仅作索引，不替代证据）。

| 编号 | 判定 | 关键证据（复跑 + 锚点） |
| --- | --- | --- |
| AC-01 | **pass** | `workflow-dispatch-fixed` 全组合（convener→product/rapporteur/nominator 允许、→verifier `convener-to-verifier-forbidden`、→chief/su `convener-target-forbidden`；chief→verifier 允许、→production `chief-production-dispatch-forbidden`、→convener 仅 stage-request；self/unknown 拒绝）；桌面 `fixed-path-routing` 负例零任务。TAP：06/12 |
| AC-02 | **pass** | MF-10 窄例外正/负例（reviewRoleId + roster `roles[].review` + basis 一致 + `role.activated`；未激活/未标记/不匹配 ⇒ `review-role-invalid`/`chief-to-project-forbidden`）。TAP：06（`workflow-dispatch-fixed`）/12（`fixed-path-routing`）；`workflow-preconditions.ts:1747-1752` |
| AC-03 | **fail**（见 MF-B2-01） | 谓词/常量/`routeStarDispatch` 逐字未改（`workflow-preconditions` 69/69、module-consumption 全过；桌面 B1 记录 legacy 注入面清单）；**但** star-routing 7 + i-full-chain 2 = **9 条 legacy 红**（`document-planning-source-unavailable`/`worker-dispatch-source-unavailable`，e71501c 引入的生产门 vs 陈旧测试夹具），且**不在 B1 §二 known-red**；AC-03 要求「逐字保留**且通过**」。**独立基线复跑证明 9/9 在 `10f90c7` 同名同因**——非本候选回归，但判据未满足。证据：13/18 |
| AC-04 | **pass** | Q6 fail-closed：无 live-turn/来源变更/缺幂等/assigned-task 缺失不匹配/伪造或已关闭父任务/自派/非 reviewRoleId ⇒ 拒绝且零任务（`workflow-dispatch-fixed` + `fixed-path-routing` 证据负例）。TAP：06/12 |
| AC-05 | **pass** | `dispatch_task` 六字段 schema（`schema.ts` `taskKind/workflowAction/workflowPath/workflowId/stage/reworkOf`）+ `contract_check.taskKind` 同步；stage-request 仅 chief→convener、`read-only`、无 module/写集（写/读两侧，`task-state-fixed`）。TAP：07 |
| AC-06 | **pass** | `workflowIdFor = wf-+sha256(flowId|path|sourceTaskId|requestDigest).slice(0,24)`（`workflow-service.ts:578`）；首请求统一 `stage-request:<wf>:<stage>:<attempt>`；`sourceTaskId` 缺失 ⇒ `stage-request-source-missing` 不创建；重复请求 replay。TAP：06 |
| AC-07 | **pass** | open advance 不变量（`stage-request-open`）；stop = 收口 open advance → `workflowAction:"stop"` → 停稳证据齐全 `workflow.closed stopped`，不明 ⇒ `workflow-stop-unconfirmed`（不写 stopped）；不自动回滚 Git。TAP：06 |
| AC-08 | **pass** | A1–A13/B1–B4 合法/非法转移、A10→A11 顺序门（未完成发 A11 ⇒ `stage-transition-invalid`/corrupt）、A12a/A12b 与 rework（MF-IR-1 `stage:A11/reworkOf:A12b`）、坏行 `workflow-corrupt`。TAP：06；全链 05 |
| AC-09 | **pass** | A12a criteria 未创建发 A11 ⇒ `stage-transition-invalid`（实施前写标准）；A12b accepted + report hash + 应用归档 ⇒ A12 聚合；归档失败阻塞。TAP：06/07/08；全链 05 |
| AC-10 | **pass** | B1 前置（无活动 fixed workflow + 既有 Git 仓库；无仓库 `b-repository-required` 不自动 init）、`.gitignore`/baseline/branch/dirty、`basis.recorded(reason:"path-b")` 只读；B3 写集 = scope ∩ roster 属主 ∩ 边界（越界 `b-change-scope-invalid`）。TAP：08/12；全链 B 05 |
| AC-11 | **pass** | A13 需 A12b accepted + 归档；B4 仅需 B3 accepted + 运营报告（不要求 A12b）；缺失 ⇒ `release-workflow-not-ready`（附项）。TAP：08 |
| AC-12 | **pass** | per-flow 模式、legacy 在飞 + fixed 并存、每项目至多一个活动 fixed workflow（`workflow-workspace-busy`）、project.json 原子写回/保留键/失败 `project-config-write-failed` 不弹卡。TAP：04/07 |
| AC-13 | **pass** | 3 卡：intent-confirm（documentRefs/marker/stage 戳）、proposal（5 件 documentRefs + A6）、appointment（名单选项 multiple + `source:"stage-a10"`/workflowId）；fixed 不发 acceptance 卡；`cardKindsOf` fixed 只读 `fixedCards`。TAP：12；全链 05 |
| AC-14 | **pass** | `merge-main` ∈ `AppOwnedGovernanceCardKind`/`GOVERNANCE_APP_OWNED_CARD_KINDS`，**不在** `GOVERNANCE_CARD_GROUP`（`governanceCardGroup==undefined`）；judge 一律 manual（`merge-main-customer-only`）；preview 含 workflowId/flowId/base OID/tip OID/文件数/diff stat/合并方式/高风险提示；`release.confirmed.by` 仅 `customer`。锚点：`runtime.ts:898-910/952-977`、`governance-judge.ts:165-171`、`governance-judge-verdict.ts:336-343`；TAP：08/12；全链 05 |
| AC-15 | **pass** | `complete_team_plan` v4（`workflowId`；`runId/baseDigest` 出现 ⇒ `baseline-legacy-field-forbidden`）；git init -b main/父仓库检测/`.gitignore` 托管块/baseline commit/branch 复用/dirty 口径/文档预算（32 文件、单文件 4 MiB、总 8 MiB）。TAP：07 |
| AC-16 | **pass** | §5.5 全部失败码按真实原因 fail-closed、失败不弹卡、replay 原回执、`stage.blocked` 带 code/summary/attempt。TAP：07（失败面用例） |
| AC-17 | **pass** | 三账本 `workflows/basis/releases.jsonl`（`ans-workflow/v1`/`ans-basis/v1`/`ans-release/v1`，5 MiB×3 轮转）；幂等/坏行计数/`workflow-corrupt`；fixed `task.created` 豁免 runId、旧 run-required 逐字保留；`request.created/resolved` documentRefs。TAP：07 |
| AC-18 | **pass** | `close_created_task` v2（fixed 3+1；真实创建者/报告/状态/幂等；不触 trunk/CAS；legacy 必填逐字保留）；`prepareIntent/finalizeIntent`（intent hash/documentRefs/`docs/intents/<id>.md` 校验；不写 doc-freeze/trunk）。TAP：07 |
| AC-19 | **fail**（见 MF-B2-02） | 已实现且通过：basis 发现/预算/SHA-256/bytes 与 `basis.recorded` 一致；A11/B1/B3 派发前与 A13/B4 发布前 drift 校验（`verifyBasisForWorkflow`，不一致 ⇒ `basis-drift` + `basis.drift`）；Q4 path-b 只读不授写权；`role.activated` 登记 + `role-activation-unrecorded`。**未实现/未测**：① `basis.amended`/`previousBasisId` 修正流程（`recordBasis` reason 仅 `baseline\|path-b`；全仓无 `basis.amended` 写入点）；② `basis.verified` 关键门节流摘要（`BasisVerifiedEvent` 仅 model 类型/校验，`appendBasisEvent` 仅 recorded/drift 两类调用）；③ **A12a/A12b 前 drift 校验缺失**（`app/desktop/session.ts:10069` 的 basis 复核仅限 `fromRoleId===convener && stage∈{A11,B1,B3}`；A12a/A12b 为 chief→verifier 直派，不经该门；归档仅重算当时字节 hash，不与 `basis.recorded` 比对）。B0/B1 记录 defer 至 B3/B4 但无批次闭环记录。TAP：07/08；代码扫描见 §3-#21 |
| AC-20 | **pass** | `docs/acceptance/<flowId>-acceptance-vN.md` 生成（flowId/workflowId、criteria/report path+sha256、结论、幕僚决策、时间；版本随 report；幂等 `acceptance:<wf>:<reportSha>`；失败阻塞 A12）；不改角色边界。TAP：08；全链 05 |
| AC-21 | **pass** | `SHELL_RULES_VERSION="5"`（v4 规则集版本不符整条拒）；`matchReadonlyGit` 保留；`matchTaskGit` 仅 `git add <literal ⊆ writeSet>`/`git commit -m`，拒 `-A/--all/./glob`、`-F -`/`-F file`/`--amend/--no-verify/-a/--author`；push/fetch/pull/remote/tag/merge/rebase/reset/clean/checkout/switch/stash/worktree/submodule/config/update-ref 硬拒 `git-command-not-ordinary`；staged ⊆ writeSet 与 commit 同临界区（`git-critical-section-busy`）；无 taskGitScope 写 Git 拒；git 写命令落 `docs/audit/shell-gate.jsonl`。锚点：`classify-shell.ts:1142/1991/2111`；TAP：09/11 |
| AC-22 | **pass** | 应用执行合并（固定 argv/sanitized env）；main unborn ⇒ `mergeKind:"initial"`；存在 ⇒ `--no-ff`、冲突 abort+切回+`release-merge-conflict`、占用 `release-main-busy`；`release.merged`（baseOid/tipOid/mergeOid/files/diffDigest）；幂等 `release:<workflowId>:<tipOid>`；`release-already-merged`；`release.rejected`；不 push/tag；B 路径 preview 披露 base OID + diff stat。TAP：08/12；全链 05 |
| AC-23 | **pass** | 默认路径不触达旧机制：全链断言 `.ans/trunk`/`.ans/runs` 不存在；fixed 会话不注入 `git_query/git_candidate/git_publish/select_run_change/request_stable_write/submit_refactor/submit_version_change/request_version_decision`（`run-role.ts:2747/2769/2787-2804` 扫描 + 桌面测试）；旧账本只读忽略（`legacyStateIgnored`）；旧分支不参与；已合并修复（judge/doc-format/提案卡绑定/bootstrap 闭包）测试无回归。TAP：05/11/12/14 |
| AC-24 | **pass** | 六内置角色 legacy 数据冻结 + fixed 新增 `fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget` + fixed context 段 + `chief-workflow-v2.md`（legacy `chief-workflow.md` 不改）；`activate_role_documents` v2；**未新增 `requestReleaseMerge`**（G-IR §六；源码/注入面/测试三向扫描）；接口评审记录 G-IR §四/§九 + 各 owner 闭环（MF-IR-1…8）。TAP：09/10/11；G-IR `08e01726…` |
| AC-25 | **pass** | append-only 审计 sidecar 不减少（`shell-post-audit` 过）；judge 代批仅非高风险卡、`merge-main` 不可代批（`acceptance-judge-minimal` 过）；doc_format **54 id** 保留（TM-1 deepEqual 54 过）、team-plan/v3 与 project-roster/v4 文案同步、不新增格式 id；写区边界（`src/common/gates/`、`resolve-write.ts`、boundary 文件）0 diff；高风险清单不变（`HIGH_RISK_MERGE_NOTES` 仅新增披露文案，客户卡/high-risk 机制未改）。TAP：08/09；§2 diff |
| AC-26 | **pass** | H1=0：无边界修订；`src/common/gates/` 0 diff；`角色卡/**` 仅 `docs/change`/`docs/design` 记录，无角色功能文件改动；无新角色/新客户门；五层架构/依赖方向/边界格式不变；UI 无改版（`app/renderer` 0 diff）。证据：02/22 |
| AC-27 | **pass** | Q1 固定路径不发 acceptance 卡（`acceptance-card-suppressed`）；Q2 不新增 requestReleaseMerge（G-IR 拒绝）；Q3 写任务串行 + 单活动 fixed workflow；Q5 只本地合并、push/tag/产物不执行；Q6 fail-closed（AC-04）；Q7 验收角色默认 verifier / roster review 优先 + `docs/acceptance` 归档。TAP：05/06/08/12 |
| AC-28 | **insufficient**（**仅** RR 证据缺；确定性部分 pass） | 同一候选/环境；每批 D1 记录（typecheck + before/after TAP + 失败名 diff + 写集外 diff=0）齐全并与本角色复跑一致；known red 按 §二 口径不恶化（见 §5 T-18 与 §8-D2/D3）；接口评审/H1=0 证据齐全；**真机日志/截图（EV-06）未执行**——属 RR 阶段，按任务「除 RR 外」口径不计预 RR 门阻挡，RR 完成后须转 pass |
| AC-29 | **pass**（按记录口径） | T-01…T-20 全部执行；T-08 依判定规则记录 **fail**（AC-19 缺口，§5）；新增确定性失败 0、新 skip 0（见 §5）；TM-5 为同名 known-red（§8-D3） |
| AC-30 | **insufficient（RR 未执行，预算另报）** | RR-01…RR-06 未执行；不得计 pass |

---

## 5. 逐条判定：T-01…T-20（确定性矩阵）

| 编号 | 判定 | 覆盖与结果 |
| --- | --- | --- |
| T-01 | **pass** | `workflow-dispatch-fixed` 全组合 + legacy 旧断言（`workflow-preconditions`）；`fixed-path-routing` 桌面矩阵/证据负例；59/59 + 68/68 |
| T-02 | **pass** | `workflow-stage-request`（字段/幂等/重复抑制/无写权/open/stop/sourceTaskId）+ 全链 replay；59/59 |
| T-03 | **pass** | `workflow-state` A1–A13/B1–B4、A10→A11、A12a/A12b/rework、attempt、坏行；59/59 + 全链 3/3 |
| T-04 | **pass** | `workflow-close-intent`（close v2 创建者/报告/幂等；intent hash/documentRefs/finalize；不触 trunk）；35/35 |
| T-05 | **pass** | `workflow-mode` + `mode-switch`（legacy 在飞 + fixed 并存、配置写回失败 fail-closed）；5/5 |
| T-06 | **pass** | `task-state-fixed`（workflowId 豁免 runId、旧 run-required 保留、replay/收口）；35/35 |
| T-07 | **pass** | `baseline-service`（init/-b main/父仓库/.gitignore/dirty/branch 复用/预算/全部失败面/幂等）；35/35 |
| T-08 | **fail**（AC-19 缺口） | `workflow-ledger` + `basis-guard` 已通过（三账本 schema/坏行/轮转/basis drift/activated/path-b/不写旧账本；35/35）；**但**测试点要求的「basis 记录/**修正**」「**`basis.verified` 节流**」无实现（无 `basis.amended`/`basis.verified` 写入点），且 **A12a/A12b drift 复核缺失**、无任何相关测试覆盖——见 §8-D10 |
| T-09 | **pass** | `classify-shell-v5` + `shell-task-git-gate/execution` + `b42-task-git-port-desktop`（add/commit 白名单、拒绝集、staged 越界、临界区、审计行）；90/90 + 70/70 + 68/68 |
| T-10 | **pass** | `release-merge` + `b3-release-merge-desktop`/`b31-…`（初始/合并/冲突/拒绝/幂等/客户本人/前置条件化/不 push-tag）；08/12 + 全链 |
| T-11 | **pass** | `b3-fixed-cards-panel` + `acceptance-archive` + 全链（3 卡各一次、归档版本/幂等、merge-main 非判断/仅客户）；12/08 |
| T-12 | **pass** | `path-b-baseline` + `b-change-scope` + `b3-fixed-baseline-pathb`（无仓库 `b-repository-required`、分支创建/复用、dirty/越界拒绝、B3 写集派生、B4 不要求 A12b）；08/12 + 全链 |
| T-13 | **pass** | `test/roles/**` 275/275 + `fixed-role-module-surface`/`governance-matrix-fixed-view`/`role-module-contract`（15 项）；G-IR 记录在案 |
| T-14 | **pass**（附披露） | legacy 项目/在飞 run 走旧路径（`mode-switch` 5/5）；fixed 不写 `.ans/trunk`/`.ans/runs`（全链断言）；旧账本忽略；旧 fixture **不回归**（star-routing/i-full-chain 9 红与 `10f90c7` 基线同名同因——见 §8-D1；trunk 套件仅 1 条冻结 known-red） |
| T-15 | **pass** | `shell-post-audit`（审计行不减）+ release 审计字段 + 全链（`release.confirmed.by:"customer"`、judge 无代批、merge-main 无 judge-delegated 来源）；11/08/全链 |
| T-16 | **pass** | `fixed-path-full-chain.test.ts` **3/3**（去 glue、生产接线触发；A/B 两路 + 无仓库负例） |
| T-17 | **pass** | `npm run typecheck` exit 0；renderer 未触及（`app/renderer` 0 diff），无需 `typecheck:renderer` |
| T-18 | **pass**（附披露） | known red 复测：`test/编排` 24/24、`test/门禁引擎` 5/5、`test/runtime-core` 33/33 名集与冻结一致；version-change 9、optional-acceptance 形态一致；star-routing/i-full-chain 9 与代码基线同名同因；**新增确定性失败=0、新 skip=0**；TM-5 内容增长见 §8-D3（同名、需协调方确认口径） |
| T-19 | **pass** | 写集外 diff=0；`src/common/gates/` 0；`角色卡/**` 功能文件 0；新文件均在既有 directory 授权；无新依赖。证据 02/22 |
| T-20 | **pass** | doc_format **54 格式** deepEqual（TM-1 过）；team-plan/v3 文案与 `contract_check` 同步；`project-roster/v4` v3 兼容 + 可选 `roles[].review`（至多一个 true）解析/示例/错误文案；TM-5 同名 known-red 披露见 §8-D3 |

---

## 6. 证据判定：EV-01…EV-08 与 RR 状态

| 编号 | 判定 | 说明/证据 |
| --- | --- | --- |
| EV-01 | **pass** | 候选身份：分支/HEAD/26 提交/无 tag/无合并/未推送/旧分支排除（§2；`01-candidate-and-baseline.txt`） |
| EV-02 | **pass** | 每批 D1：typecheck + 受影响套件 before/after TAP + 失败名 diff + 写集外 diff=0；本角色抽查复跑一致（§3；各 `角色卡/*/docs/change/2026-11-10_*`） |
| EV-03 | **pass** | known red 复测：version-change 9、optional-acceptance 2/1/hang、编排 24、门禁 5、runtime-core 33、star-routing/i-full-chain 9（基线对照见 §8-D1）；新增确定性失败=0/新 skip=0 |
| EV-04 | **pass** | T-01…T-20 执行结果见 §5（TAP/命令落盘） |
| EV-05 | **pass** | G-IR 记录 `08e01726…`（评审结论 + MF-IR-1…8 条件与 owner）+ 六角色/运行时/编排/门禁/桌面闭环记录；`requestReleaseMerge` 明确拒绝 |
| EV-06 | **insufficient（RR 未执行）** | 真机全链日志/截图/账本/预算未产生；RR-01…RR-06 预算另报 |
| EV-07 | **pass** | H1/边界：写集外 diff=0；`src/common/gates/`、`app/renderer` 0 diff；`角色卡/**` 功能文件 0；边界授权清单见 02/22 |
| EV-08 | **pass** | 本报告（B2 独立报告，含逐条矩阵/限制/披露） |

- **RR-01…RR-06：未执行（预算另报），不计 pass。**

---

## 7. 放行结论

### 7.1 判定：`不可进入 RR`（预 RR 放行门未通过）

- 门条件：确定性 AC/T/EV（除 RR 外）全部 pass 且无 must-fix。
- 实际：**AC-03 = fail、AC-19 = fail**；T-08 = fail（AC-19 缺口）；AC-28/AC-30 为 RR 证据类 insufficient
  （按「除 RR 外」不计阻挡）。
- must-fix：**2 项**（MF-B2-01 基线口径；MF-B2-02 实现缺口）：

| ID | 事项 | 证据/复现 | owner | 关闭条件 |
| --- | --- | --- | --- | --- |
| **MF-B2-01** | AC-03 要求 star-routing/i-full-chain 的 legacy 断言「逐字保留**且通过**」，但两套件在候选与代码基线 `10f90c7` 均为 **9 红**（star-routing 7 + i-full-chain 2，错误 `document-planning-source-unavailable`/`worker-dispatch-source-unavailable`；根因：`e71501c`（2026-11-07，origin/main 祖先）引入「已注册项目生命周期 + 当前客户轮次」生产门，而测试夹具未提供 `getRegisteredProjectLifecycle`，确定性失败）；B1 §二 known-red **未列**这 9 条。另 B1 §二 `test/编排` 记「22 fail」实测为 **24 fail**（B0 before TAP 与 B2 复跑一致，名集未变）——同属基线口径文档缺口。 | `_evidence/13-legacy-star-i-full-chain.tap`、`_evidence/18-legacy-baseline-comparison.txt`（10f90c7 解包复跑 9/9 同名）、G-IR 证据 `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths_evidence/04-legacy-star-routing-i-full-chain-baseline.txt`、`_evidence/20-orch-knownred-comparison.txt` | **协调方**（裁决 B1 基线口径，出 B1 新版：把 9 条主干既有红列入 known-red 并修正 22→24）；若裁决为「修复」，处理 owner 为 `测试/编排`（test-only 夹具迁移，**不得改 legacy 断言语义**，需协调方单独授权） | 协调方书面裁决（B1 新版 hash 冻结）或经授权的 test-only 修复落地并在同一候选复跑通过 |
| **MF-B2-02** | AC-19/T-08 要求：① `basis.amended`/`previousBasisId`（文档修正）；② `basis.verified`（A11/A12b/A13 关键门节流摘要）；③ A12a/A12b 验收前后 basis drift 校验。实现现状：① `recordBasis` reason 仅 `baseline\|path-b`（无 amendment 路径）；② `BasisAmendedEvent`/`BasisVerifiedEvent` 仅 model 类型/校验，全仓 **无写入点**；③ basis drift 复核仅在 `convener && stage∈{A11,B1,B3}` 与 A13/B4 发布链（`session.ts:10069`、`workflow-service.ts:2783/3121`），A12a/A12b 无复核；`appendBasisEvent` 仅被 recorded/drift 调用；以上均无行为测试。B0/B1 记录将 ①② defer 至「B3/B4」，但 B3/B4 记录未闭环。设计 v1.3 §7.2 要求「只在 A11/A12b/A13 关键门写摘要或 drift」「A12a/A12b 验收前后复核 basis」「文档修正：新 -vN + basis.amended」。 | §3-#21 代码扫描；`src/common/编排/workflow-service.ts:1947-1960/2055/2239-2276`；`app/desktop/session.ts:10069/10379-10465`；`src/model/runtime.ts:2204-2246`；`_evidence/07-close-baseline-ledger-basis-mode.tap`（无 amended/verified 用例） | **编排 + 桌面窗口**（实现 `basis.amended` writer/`previousBasisId`、`basis.verified` 关键门节流摘要、A12a/A12b drift 复核 + 行为测试）；或协调方以 **B1 新版**明确 de-scope（不建议：AC-19 明文要求） | 实现 + `test/编排/workflow-ledger.test.ts`/A12 链行为用例通过（同一候选复跑）；或 B1 新版书面 de-scope（hash 冻结） |

- 说明：其余 28 条 AC 中 26 pass、2 insufficient（AC-28/AC-30，均为 RR 证据缺；确定性部分 pass）。
  **MF-B2-02 是唯一实现缺口**（basis 修正/验证账本），MF-B2-01 是既有主干红与冻结判据的口径冲突；
  两者均不否定新路径主链（全链 3/3、卡片/账本/发布/Git v5/迁移隔离）的确定性通过。

### 7.2 RR 必须验证的点（MF-B2-01/MF-B2-02 关闭后、RR 执行时）

1. **客户本人与 judge**：merge-main 卡只由客户本人 approve/reject；judge 尝试 ⇒ `release-unauthorized`
   且无 `release.confirmed`/`release.merged`；客户卡总数 = 3 张确认卡 + 1 张 merge-main（无 acceptance 卡/无额外客户门）。
2. **账本/审计**：`.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` 事件完整、幂等键与 schema 一致；
   `.ans/trunk`/`.ans/runs`、versions/stable 账本**零写入**；`docs/audit/shell-gate.jsonl` 有 git add/commit 审计行；
   `.gitignore` 托管块存在、治理文档/角色卡/`.ans` 不被 Git 跟踪。
3. **全链失败即停**：任何阶段失败 → 停止、保留现场/账本/日志、按真实错误回报；不合并 ans-studio main、
   不打 tag、不发布产物、不上报成功（RR-05）。
4. **隔离实例**：全新空项目目录；独立 Electron userData/session、独立 `ANS_E2E_OUTDIR`；**不使用 9222/9223**（RR-01）。
5. **预算**：真实模型使用量/费用单独报告，并取得书面预算授权（RR-06）。
6. **A12/A13 顺序与归档**：A12a criteria 先于 A11；A12b accepted + `docs/acceptance` 归档后才允许 A13/merge-main；
   B 路径 B4 不要求 A12b（AC-09/AC-11/AC-20）。
7. **已知限制**：A6 revise 后重呈方案卡（attempt>1）未接线（§8-D4）——RR 若触发 revise，按「返工重呈不支持」记录并停止，不得伪造推进。
8. **star-routing/i-full-chain**：RR 不依赖这两套件；但 MF-B2-01 关闭前不得把 B2 计为通过。

---

## 8. 独立风险与披露

| # | 事项 | 事实/证据 | 对 B1 判据的影响 |
| --- | --- | --- | --- |
| **D1** | **star-routing 7 + i-full-chain 2 legacy 红（9 条）** | 候选复跑 3 pass/9 fail；`git archive 10f90c7` 解包复跑 **9/9 同名同因**（`document-planning-source-unavailable`/`worker-dispatch-source-unavailable`）；根因 `e71501c`（origin/main 祖先）生产门要求 `getRegisteredProjectLifecycle` + 当前客户轮次，测试夹具未提供；G-IR 已登记该风险；桌面 B1 记录称「linked-worktree 环境性」，**本角色独立复跑证明其为代码基线确定性陈旧测试缺陷（非环境伪影、非本候选回归）** | **影响 AC-03**（判 fail，MF-B2-01）；不影响 AC-01/02/04 等新路径判据 |
| **D2** | B1 §二 known-red 计数偏差 | `test/编排` B1 写「22 fail/2 skip」，B0 before TAP（`10f90c7`）与本角色 HEAD 复跑均为 **24 fail/2 skip**，失败名集合 24/24 未变（B0 before=after）；`test/桌面应用` 的 star-routing 7/i-full-chain 2 未列（见 D1） | 不改变「新增确定性失败=0」结论；但 B1 基线口径需随 MF-B2-01 一并修正（B1 新版） |
| **D3** | TM-5（schema 字面量扫描）同名 known-red 的**内容增长** | 基线 `10f90c7` 失败内容 5 个字面量（`ans-basis/v1`、`ans-release/v1`、`ans-workflow/v1`、`legacy/v1`、`two-fixed-paths/v1`）；B3 前 6 个（+`chief-workflow/v2`）；HEAD 7 个（+`ans-task-git-shell/v1`）。B2/B4.1 记录未逐字披露新增两项；测试名与数量不变 | 按「失败名集合」口径 T-18 pass；若协调方按「同名内容不得恶化」严格解释，需新增裁决/白名单登记（doc-format spec 显式白名单+理由）。不影响 AC-25 的 54 格式要求 |
| **D4** | **A6 revise 后重呈卡（attempt>1）未接线**（已知限制，B5.1 披露） | A6 revise ⇒ `stage.reworked A5`（状态机/测试支持）；桌面方案卡 marker 幂等键固定 attempt=1，返工后重呈需 attempt>1 的新请求，本轮未接；该窗口下 accept 不伪造 `stage.completed A6` | 不违反 B1 冻结 AC/T 文字（T-03 的 attempt 语义在服务/状态机层覆盖；全链不涉 revise）；**RR 若触发 revise 需按失败即停记录**；建议后续批次接线 |
| **D5** | optional-acceptance 挂起 | 外部 150s 超时：已完成 `not ok 1` + `ok 2` + `ok 3`，测试 4 前挂起（exit 124）；与 B1 §二「6 tests / 2 pass / 1 fail / 3 cancelled」形态一致；未改该文件 | 不新增失败；属既有环境/挂起 known-red |
| **D6** | runtime-core 33 红 / 门禁 5 红 / trunk 1 红 | 与冻结名集 33/33、5/5、1/1 逐名一致（B4.1/B3.1/B5 基线）；均为既有环境/基线红，未恶化 | 不影响新增判据；T-18 pass |
| **D7** | merge-main 卡客户可见文案为未 key 化中文字面量（B3.1 引入） | shared-code B5.1 记录 §6 披露：`buildMergeMainCardRequest` 标题/问题/选项/preview 为中文直字面量，i18n 守卫已 allowlist；建议后续迁共享 key | B1 无 i18n AC；不影响判定；**RR 客户可见前建议确认文案质量** |
| **D8** | 工作树候选外未提交改动 | `角色卡/chief-code/api-spec.md`、`角色卡/product-code/{api-spec,feature-map,memo}.md` 为 `M`（角色文档编辑，含 T3 B2 段落），**不在 HEAD 候选内**、非本角色改动；`src/app/test` 干净 | 不影响「同一候选」测试判定（代码/测试与 HEAD 一致）；提交时需 owner 另行处理，勿混入候选 |
| **D9** | 工作树 `.tmp-*`/`.commit-msg-*`/`.pr-*` 等未跟踪物 | 为并行会话/历史产物，非候选 | 不影响判定；不得计入交付 |
| **D10** | **AC-19/T-08 缺口：`basis.amended`/`previousBasisId`、`basis.verified` 节流与 A12a/A12b drift 校验未实现** | 代码扫描：`basis.verified` 仅 `src/model/runtime.ts:2220-2246/2473`（类型+校验），`basis.amended` 仅 model 读取/校验与 `workflowOwnsTaskBranch` 读取；`recordBasis` reason 仅 `baseline\|path-b`（`workflow-service.ts:1947-1960`）；`appendBasisEvent` 仅 2 个调用点（`:2194` recorded、`:2270` drift）；`app/desktop/session.ts:10069` 的 drift 复核条件为 `fromRoleId===convener && stage∈{A11,B1,B3}`，A12a/A12b（chief→verifier 直派）无 basis 复核；`buildFixedCloseEvidence`/`archiveAcceptance` 只重算当时字节 hash、不与 `basis.recorded` 比对。测试：`workflow-ledger`/`basis-guard` 无 amended/verified 行为用例，A12a/A12b 无 drift 用例；B0/B1 记录 defer 至 B3/B4，B3/B4 记录未闭环（`编排 B1 记录 :267`）。设计 v1.3 §7.2 要求关键门写摘要或 drift + 文档修正走 `basis.amended` + A12a/A12b 复核 basis | **影响 AC-19（fail）与 T-08（fail）**；MF-B2-02；不影响 A11/B1/B3/A13/B4 已实现的漂移 fail-closed |
| **D11** | `workflow.closed reclassified` 分支无专门测试 | `confirmStop` 支持 `outcome:"stopped\|reclassified"` 并校验（`workflow-service.ts:2368-2390`），记录同一 `workflow.closed` 事件；现有测试仅覆盖 `stopped`/`stop-unconfirmed`/replay（`workflow-stage-request.test.ts:301-331`），reclassified 分支仅有代码锚点 | 不另判 fail（同一已测路径的参数分支）；建议补一条行为用例 |

---

## 9. 限制与未执行项

- 本 B2 为**确定性/假会话**验收：未运行真实 Electron、真实模型、真实 UI；**RR-01…RR-06 未执行（预算另报）**。
- 未运行全仓每文件测试：按 B1 known-red 域（编排/门禁/runtime-core/roles/shared/桌面 fixed + 三套 legacy）
  做独立复跑与逐名对照；其余未被本变更触达的目录按批次 D1 记录引用（不据此声称全绿）。
- `test/桌面应用` 全域因既有挂起套件（directive-decision/stuck-redispatch/session-rebuild-race/optional-acceptance）
  未整域复跑；fixed 相关 8 套件 + 三套 legacy 已独立复跑并记录。
- 本报告不构成合并/发布/客户放行授权；不替代 RR 真机证据与客户确认。

## 10. 未提交声明

- 本记录与 `_evidence/`（含 29 个证据文件）仅写入本角色写集；**未 commit / push / merge / tag / 发布**；
  未修改 `src/**`、`app/**`、`test/**`、`docs/planning/**`、`docs/proposals/**`、`docs/scheduling/**`、
  角色卡功能文件/边界/其它角色文档；未运行真实模型/Electron；未占用 9222/9223。
- 报告落盘后实测（行/字节/SHA-256）见回报与 `_evidence/28-evidence-index.txt`；
  `docs/acceptance/2026-11-10_two-fixed-workflow-paths-report-v1.md` 为对外报告副本（引用本记录）。
