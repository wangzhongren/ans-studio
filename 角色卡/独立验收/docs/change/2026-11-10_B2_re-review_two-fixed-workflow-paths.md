# B2 复判（预 RR 放行门）：两条固定工作流路径（T3，2026-11-10）

- 日期：2026-11-10
- 角色：ANS「独立验收」（独立固定上下文；本文件仅写入本角色写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3）
- 节点：**B2 复判（预 RR 放行门）**——按 **B1 v1.1**（冻结 `e2ad4701…`）对 B2 预验收 MF-B2-01/02 的关闭情况与候选 `79e16a1` 全量重判；本文件不构成合并/发布/客户放行授权
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 分支/候选：`feat/two-fixed-workflow-paths` / **HEAD `79e16a14bd3467219ecb861c38a48ab47b993038`**（B2.1 编排/桌面 + B1 v1.1 + B5.3 已提交）
- 基线：`origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；代码基线 `10f90c7`（B1 冻结时代码态）
- 纪律：只写本角色验收记录/证据；**不修改产品/测试代码、不改角色卡/边界、不提交/推送/合并/发布**；
  不运行真实 Electron/真实模型；不占用 9222/9223；**RR 未执行（预算另报）**

---

## 0. 结论摘要（先读）

1. **MF-B2-01：已关闭**。B1 v1.1（`e2ad4701…`，214 行 / 38,065 B）已把 9 条 star-routing/i-full-chain
   基线红逐名列入 §二 known-red、`test/编排` 22→24 更正、AC-03 措辞明确（legacy 断言逐字保留、
   9 红按 known-red 口径「同名不恶化、不新增、**不要求 pass**」、不得弱化断言）。本角色**独立复跑**：
   候选 `79e16a1` 与代码基线 `10f90c7`（`git archive` 纯净解包）两侧均 **12 tests / 3 pass / 9 fail**，
   失败**名称+首条错误串 9/9 完全一致**（`13`/`14`）；`test/编排` 域 **1,335 / 1,309 pass / 24 fail / 2 skip**，
   24 失败名 vs B0 冻结 before 清单 **24/24 逐名一致**（`08`/`09`）。**非候选回归，判据口径已对齐。**
2. **MF-B2-02：已关闭**。编排 B2.1 新增 `amendBasis`（`basis.amended`/`previousBasisId`）、
   `basis.verified` 关键门节流（`BASIS_KEY_GATE_STAGES` A11/B1/B3/A12a/A12b/A13/B4）、
   `verifyBasisForStage`；桌面 B2.1 在 **A12a/A12b accepted 收口前**调用 `verifyBasisForStage`，
   A11/B1/B3 派发门补 `stage`，A13/B4 发布服务两处复核带 `stage`。本角色**独立复跑**：
   `workflow-basis-b21.test.ts` **7/7**、`b21-basis-gate-desktop.test.ts` **6/6**、全链 **3/3**、
   桌面 fixed 套件 **77/77**；代码锚点确认 `basis.verified`/`basis.amended` 单一写入点、
   drift 以磁盘真实字节复核（`verifyBasisDocuments`）**fail-closed、无伪造**。
3. **候选身份**：`79e16a1`，距 `origin/main` **30 提交、0 落后**；**无合并提交、无 tag、未推送**；
   旧分支 `4a0bafd`/`882d84b` 不是 HEAD 祖先；工作树 `src`/`app`/`test` 与 HEAD 零 diff；
   `src/common/gates/` 0 diff；无依赖/配置变更（`01`）。
4. **独立复跑矩阵（同一候选 `79e16a1`）**：`npm run typecheck` **exit 0**；
   `fixed-path-full-chain` **3/3**；`mode-switch`+`b-change-scope` **5/5**；
   `test/编排` **1,335/1,309/24/2**（24/24 名集一致）；`test/门禁引擎` **528/522/5/1**（5/5 一致）；
   `test/runtime-core` **586/549/33/4**（33/33 一致）；`test/roles` **275/275**；
   `test/项目管理/shared` **224/219/0/5**；旧谓词+六角色 module-consumption **69/69**；
   `version-change-integration` **3 pass / 9 fail（`vca-channel-unavailable`，known-red）**；
   `optional-acceptance` 150s 超时挂起（2 pass/1 fail/3 未运行，与 B1 §二形态一致）。
5. **逐条判定**：AC **28 pass / 0 fail / 2 insufficient（AC-28/AC-30 仅 RR 证据类）/ 0 NA**；
   T-01…T-20 **20 pass / 0 fail**（T-08 由 fail 转 pass）；EV **7 pass / 1 insufficient（EV-06 RR 未执行）**；
   **RR-01…RR-06 未执行（预算另报），不计 pass**。
6. **放行结论：`可进入 RR`**（预 RR 放行门通过）。RR 必验点/预算见 §9；进入前协调方确认项见 §10.2。
7. **未提交声明**：本记录与 `_evidence/` 仅写入本轮工作树；**未 commit / push / merge / tag / 发布**；
   未运行真实模型/Electron；未占用 9222/9223。

---

## 1. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| **B1 v1.1（冻结，唯一判据）** | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md` | 214 / 38,065 / `e2ad4701b1bda9a994616d4543fcab8b05de2f8bfcd4c9f6ee0fcc0873e0b749` |
| B1 v1（前版，逐字保留不改） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| B2 预验收（MF-B2-01/02 来源） | `角色卡/独立验收/docs/change/2026-11-10_B2_pre-RR_two-fixed-workflow-paths.md` | 267 / 40,790 / `5958ba3879aa6ad5df2be0e27f43ec74c7067644576a074f5d94f169dc206888` |
| B2.1 编排记录（MF-B2-02 实现） | `角色卡/编排/docs/change/2026-11-10_B2.1_two-fixed-workflow-paths.md` | 216 / 16,340 / `a7bb4bff8fa5c77cbc46e33a1fa8e72fee02be6875b8392d20cf16ae36743817` |
| B2.1 桌面记录（A12a/A12b 接线） | `角色卡/桌面窗口/docs/change/2026-11-10_B2.1_two-fixed-workflow-paths-desktop.md` | 226 / 18,452 / `c110313a27fb0d86331a044296cc1b977b6cf9995ad241156443dffea24d0ac1` |
| B5.3 记录（B2.1 后全链/D1） | `角色卡/测试/docs/change/2026-11-10_B5.3_two-fixed-workflow-paths.md` | 183 / 14,704 / `c69d469cd4cf4707a6116b684a5ec60ba0f9c4ff83f2a1099cff173a905bc88f` |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 / 8,476 / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| G-IR 接口评审记录 | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 / 35,665 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |

- 全部与任务给定值一致；B1 v1.1 由 B2.1 提交 `5820fe4` 冻结入候选。
- 证据索引（逐文件 SHA-256）：`_evidence/90-evidence-index.txt`。

## 2. 候选、基线与环境

| 项 | 实测 |
| --- | --- |
| 分支 | `feat/two-fixed-workflow-paths`（工作树 HEAD = 分支 tip） |
| 候选 HEAD | **`79e16a14bd3467219ecb861c38a48ab47b993038`**（`docs(test): B5.3 full-chain and D1 rerun after B2.1 basis gates`） |
| 基线 | `origin/main` `d9e3e99…`；`git merge-base` = `d9e3e99`；`rev-list --left-right --count` = **0 / 30** |
| 合并/发布 | `git log --merges origin/main..HEAD` **空**；`git tag --points-at HEAD` 0；`git tag --list '*two-fixed*'` 0；无远端 two-fixed 分支（未推送） |
| 旧分支 | `4a0bafd`/`882d84b` **不是** HEAD 祖先（不参与） |
| 候选差异面（vs `10f90c7`） | `src/app/test` 108 文件；`src/common/gates/` **0 diff**；`package.json`/锁文件/`tsconfig.json`/`.gitignore` **0 diff** |
| B2.1 实现文件（实测 hash = 记录） | `src/common/编排/workflow-service.ts` `dda6a002…`；`app/desktop/session.ts` `05c6a50c…`；`test/编排/workflow-basis-b21.test.ts` `0c59f748…`；`test/桌面应用/b21-basis-gate-desktop.test.ts` `d6978bd0…`；`test/桌面应用/b3-fixed-baseline-pathb.test.ts` `8be70617…`；`test/桌面应用/b31-fixed-release-auto-desktop.test.ts` `01010d29…` |
| 环境 | Node v24.22.1；npm 11.19.1；Windows 11；分支工作树；未启动 Electron/模型；未占用 9222/9223 |
| 工作树状态 | `git status --porcelain -- src app test` **空**（候选代码/测试洁净） |

- 证据：`_evidence/01-candidate-and-baseline.txt`、`_evidence/02-write-set-boundary.txt`。

## 3. 独立取证（命令 / 结果 / 证据）

> 全部由本角色在候选 `79e16a1` 工作树独立执行；未采信批次自述作为判据替代。TAP 落盘于 `_evidence/`。

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **exit 0** | `03-typecheck.txt` |
| 2 | `node --test --test-concurrency=1 --test-reporter=tap test/测试/fixed-path-full-chain.test.ts` | **3/3 pass**（路径 A / 路径 B / B 无仓库 fail-closed） | `04-full-chain.tap` |
| 3 | `mode-switch` + `b-change-scope` | **5/5 pass** | `05-mode-switch-b-change-scope.tap` |
| 4 | B2.1 服务：`test/编排/workflow-basis-b21.test.ts` | **7/7 pass** | `06-basis-b21.tap` |
| 5 | B2.1 桌面：`test/桌面应用/b21-basis-gate-desktop.test.ts` | **6/6 pass** | `07-b21-desktop.tap` |
| 6 | `test/编排/**/*.test.ts` 全域 | **1,335 tests / 1,309 pass / 24 fail / 2 skip**；24 失败名 vs B0 冻结 **24/24 一致** | `08`、`09` |
| 7 | `test/门禁引擎/**/*.test.ts` 全域 | **528 / 522 / 5 / 1**；5 失败名 vs B2 预验收证据 **5/5 一致** | `10`、`10b` |
| 8 | `test/runtime-core/**/*.test.ts` 全域 | **586 / 549 / 33 / 4**；33 失败名 vs B2 预验收证据 **33/33 一致** | `18`、`18b` |
| 9 | `test/roles/**/*.test.ts` 全域 | **275/275 pass** | `11-roles-domain-full.tap` |
| 10 | `test/项目管理/shared/**/*.test.ts` | **224 / 219 / 0 / 5**（既有 Windows 平台 skip） | `19-shared-domain.tap` |
| 11 | 旧谓词 + 六角色 module-consumption（7 套件） | **69/69 pass** | `20-legacy-preconditions-module-consumption.tap` |
| 12 | 桌面 fixed 套件（9 文件：路由/基线路径B/3卡/发布/自动呈卡/task git 端口/生产接线/workflow-git） | **77/77 pass** | `15-desktop-fixed-suites.tap` |
| 13 | 旧路径 `star-routing` + `i-full-chain`（候选 `79e16a1`） | **12 / 3 pass / 9 fail** | `12-legacy-star-i-full-chain-head.tap` |
| 14 | 同上（代码基线 `10f90c7` 纯净解包 + node_modules junction 只读） | **12 / 3 pass / 9 fail**；名称+首条错误串 **9/9 一致** | `13-legacy-star-i-full-chain-baseline10f90c7.tap`、`14-legacy-baseline-comparison.txt` |
| 15 | `version-change-integration`（B1 §二 known-red） | **12 / 3 pass / 9 fail**（`vca-channel-unavailable`） | `16-version-change-knownred.tap` |
| 16 | `optional-acceptance`（150s 外部 watchdog） | exit 124；已完成 2 pass / 1 fail 后挂起（与 B1 §二 6/2/1/3 形态一致） | `17-optional-acceptance-knownred.tap` |
| 17 | 代码锚点扫描：`kind:"basis.verified"`/`kind:"basis.amended"` 写入点、`appendBasisEvent` 调用点 | `basis.verified` 仅 `workflow-service.ts:2594`；`basis.amended` 仅 `:2498`；`appendBasisEvent` 4 调用点（recorded/drift/amended/verified）；无隐藏写入 | 本报告 §5.2 |
| 18 | 基线对照方法 | `git archive 10f90c7` 解包临时目录 + `node_modules` junction（只读）；运行后 junction/临时目录已清理；未触碰分支/工作树代码 | `14` |

## 4. MF-B2-01 复判：**已关闭**

### 4.1 B1 v1.1 修订内容核对（逐项）

| B2 预验收要求 | B1 v1.1 实测 | 判定 |
| --- | --- | --- |
| 9 条 star-routing/i-full-chain 基线红列入 §二 known-red | §二 逐名列出 9 条（star-routing 7 + i-full-chain 2），注明 `10f90c7` 同名同因、非候选回归、测试夹具缺陷（`e71501c` 生产门要求已注册项目生命周期/当前客户轮次）、不修改 legacy 断言语义 | ✅ |
| `test/编排` 22 fail → 24 fail 更正 | §二 改为 **24 fail / 2 skip**（注明 v1 误记、失败名集合与基线 24/24 一致未变） | ✅ |
| AC-03 措辞明确、不要求 legacy 9 红 pass、不弱化断言 | AC-03 改为：legacy 断言逐字保留、**不得弱化/改写/删除**；workflow-preconditions、roles 差分、convener-module-consumption 须通过；star-routing 7 + i-full-chain 2 为 §二 known-red，按 known-red 口径（同名不恶化、不新增、**不要求 pass**） | ✅ |
| 同步 §三/§八/T-14/T-18/EV-03 | 均已同步（§三规则 6 明确 known-red 仅限 §二列名清单、未列名失败计 fail） | ✅ |

- B1 v1 文件未改（`b607f100…` 不变）；v1.1 由 `5820fe4` 冻结入候选；B2 预验收记录 hash 不变。

### 4.2 独立复跑（9 红基线对照）

- 候选 `79e16a1`：**12 tests / 3 pass / 9 fail / 0 skip**。
- 代码基线 `10f90c7`（`git archive` 纯净解包 + junction 只读）：**12 / 3 / 9 / 0**。
- 对照：失败名 **head-only 0 / baseline-only 0**；**名称+首条错误串 9/9 IDENTICAL**
  （`document-planning-source-unavailable`×5、`worker-dispatch-source-unavailable`×1、
  `chief-hub-flow-unavailable`×2、1 条下游正则不匹配）。⇒ 确定为**代码基线既有确定性测试夹具缺陷，非候选回归**；
  与 B1 v1.1 §二 清单逐条一致。**不要求其为 pass，判据不弱化。**

### 4.3 独立复跑（`test/编排` 24 fail 计数更正）

- 候选 `79e16a1`：**1,335 tests / 1,309 pass / 24 fail / 2 skip**；失败名 vs
  `角色卡/编排/docs/change/2026-11-10_B0_two-fixed-workflow-paths_evidence/fails-before.txt`（`10f90c7` before 冻结）
  **24/24 逐名一致**，diff 空（`09`）。2 个 skip 与冻结一致、无新 skip。
- 由此：B1 v1.1「22→24」更正属实；B2.1 新增 7 测试全绿（1,328→1,335、pass +7、fail 不变）。

## 5. MF-B2-02 复判：**已关闭**

### 5.1 实现核对（代码锚点）

| 要求（B2 预验收 MF-B2-02） | 实现（候选 `79e16a1`） | 判定 |
| --- | --- | --- |
| ① `basis.amended`/`previousBasisId` 修正流程 | `workflow-service.ts::amendBasis`（:2317-2522）：新 basis 追加 `basis.amended`、`previousBasisId` 指向最新旧记录、旧记录保留；同路径改字节/kind 消失 ⇒ `basis.drift` + `basis-hash-mismatch` fail-closed；幂等键 `amend:<wf>:<prev>:<digest>` replay；同 operationId 不同内容 ⇒ `baseline-operation-conflict`；不产生写权（不写阶段/激活/发布/客户卡）；path-b 只读快照修正拒绝团队计划声明；`recordedBy:"application"` | ✅ |
| ② `basis.verified` 关键门节流摘要 | `BASIS_KEY_GATE_STAGES = ["A11","B1","B3","A12a","A12b","A13","B4"]`（:2530）；`verifyBasisForWorkflow` 仅在关键门且「同 basis + 同 documents digest」未记过时追加 `basis.verified`（`{basisId, checkedAt, ok, documents:[{path,sha256,ok}]}`，:2590-2603）；普通读取（无 stage）不写；drift 必写 `basis.drift`（:2577-2582） | ✅ |
| ③ A12a/A12b drift 收口 | 服务新增 `verifyBasisForStage`（:2611-2628，非法 stage ⇒ `stage-transition-invalid`）；桌面 `session.ts::verifyFixedReviewCloseBasis`（:10391-10411）在 fixed `close_created_task` **accepted 收口前**按真实 `task.created` 的 `workflowId/stage` 调用（只认账本、不认自报）；drift/缺失 ⇒ `basis-drift`/`basis-missing` 原样透传，**不写 `task.closed`、不生成归档、不伪造 verified**；同 operationId 已收口 ⇒ 交给 `closeTask` replay | ✅ |
| A11/B1/B3 派发前复核补 stage | `session.ts:10070-10074`：`verifyBasisForWorkflow({projectRoot, workflowId, stage: d.stage})`——一致 ⇒ 节流入账；drift/缺失 ⇒ 拒绝派发、不建任务 | ✅ |
| A13/B4 发布前复核 | `workflow-service.ts:3137`（`prepareReleaseMerge` 呈卡前）与 `:3475`（`executeReleaseMerge` 执行前）均传 `stage: targetStage` | ✅ |
| drift 以真实字节复核、无伪造 | `basis-guard.ts::verifyBasisDocuments`（:293-314）对每个文档从磁盘读取实际 bytes 并计算 SHA-256 对比记录值；缺失记 `actualSha256:null`；本角色代码审读确认无「信任账本/自报」路径 | ✅ |
| 行为测试 | 编排 `workflow-basis-b21.test.ts` **7 tests**（修正正/负/幂等、节流、7 关键门 drift 阻断、A12a/A12b 直派、path-b、非法 stage）；桌面 `b21-basis-gate-desktop.test.ts` **6 tests**（A12a/A12b 一致/漂移/缺失/恢复/rework 边界、A11/B3 派发门、legacy 不触达） | ✅ |

- **事件写入点唯一性**（`kind:"basis.verified"` / `kind:"basis.amended"` 全仓扫描，§3-#17）：
  仅 `workflow-service.ts` 两处；`appendBasisEvent` 4 个调用点 = `recordBasis`(recorded)、
  `appendBasisDriftEvents`(drift)、`amendBasis`(amended)、`verifyBasisForWorkflow`(verified)——
  B2 预验收 §8-D10 的「无写入点/仅 2 调用点」缺口已实际闭环，非注释/自述。
- **模型事件形状**：`src/model/runtime.ts` `BasisAmendedEvent`（`previousBasisId` 必填）/
  `BasisVerifiedEvent` 校验通过；`BasisRecordedEvent.reason` 枚举已含 `amendment`（model 未改）。
- **B2.1 写集/回归**：`src/common/编排/workflow-service.ts`（+410/−28）与 `app/desktop/session.ts`（+39/−1）
  为仅有的产品代码变更；`recordBasis` 本体与既有 release 逻辑未改（仅补 `stage` 参数）；
  无新依赖；`src/model/**`、`src/common/gates/**` 0 diff。新增测试无 `.skip`/`only`/force-exit。

### 5.2 独立复跑（不采信自述）

- `workflow-basis-b21.test.ts`：**7/7 pass**（`06`）。
- `b21-basis-gate-desktop.test.ts`：**6/6 pass**（`07`）。
- 全链 `fixed-path-full-chain.test.ts`：**3/3 pass**（`04`）——B2.1 新门对合法 basis 不误拦：
  A11 派发门、A12a 收口门、A13/B4 发布门在全链中均放行并完成归档/合并。
- 桌面 fixed 套件 9 文件：**77/77 pass**（`15`），含 B2.1 适配后的
  `b3-fixed-baseline-pathb`（B1 派发 ⇒ `basis.verified` 入账断言）与
  `b31-fixed-release-auto-desktop`（无 basis ⇒ `basis-missing` 拒绝收口 + 归档缺失 ⇒ `release-workflow-not-ready` 双覆盖）。

## 6. 逐条判定：AC-01…AC-30（B1 v1.1）

> 规则：pass/fail/insufficient/NA（B1 §三）；证据 = 本角色复跑（TAP）+ 代码锚点 + 批次记录（仅索引）。

| 编号 | 判定 | 关键证据（复跑/锚点） |
| --- | --- | --- |
| AC-01 | **pass** | `workflow-dispatch-fixed` + `workflow-preconditions`（域内全绿）+ `fixed-path-routing`（15 内）：convener→内置/项目允许、→verifier `convener-to-verifier-forbidden`、chief→verifier 允许、chief→convener 仅 stage-request、chief→production `chief-production-dispatch-forbidden`、self/unknown 拒绝 |
| AC-02 | **pass** | MF-10 窄例外正/负例（reviewRoleId + roster `roles[].review` + basis 一致 + `role.activated`；未激活/未标记/不匹配 ⇒ 拒绝）——`workflow-dispatch-fixed`/`fixed-path-routing` 全绿 |
| AC-03 | **pass**（v1.1 口径；附 §10-D3 披露） | 谓词/常量/`routeStarDispatch` 未改（`src/common/roles/chief/internal/dispatch.ts` 0 diff；`CONVENER_WORKER_DISPATCH_TARGETS` 未改；`evaluateDispatchAuthorization`/`evaluateDispatchPreflight` 分支无删除）；`workflow-preconditions`+六角色 module-consumption **69/69**；roles 差分 **275/275**；star-routing 7 + i-full-chain 2 = **9 红与 `10f90c7` 同名同因**（§4.2），按 §二 known-red 口径判定、不要求 pass |
| AC-04 | **pass** | Q6 fail-closed 负例（伪造 taskId/错误 creator/已关闭或停止任务/过期轮次/session 重启/fenced run/目标不存在/自派/非 reviewRoleId）全拒绝且零任务——`workflow-dispatch-fixed`/`fixed-path-routing` |
| AC-05 | **pass** | `dispatch_task` 六字段 + `contract_check.taskKind`；stage-request 仅 chief→convener、read-only、无 module/写集——`task-state-fixed` 域内全绿 |
| AC-06 | **pass** | `workflowIdFor = wf-+sha256(...)`；统一 `stage-request:<wf>:<stage>:<attempt>`；`sourceTaskId` 缺失拒绝；replay——`workflow-stage-request` 域内全绿 |
| AC-07 | **pass**（附 D9 建议补测） | open advance 不变量、stop 收口顺序/停稳不明 `workflow-stop-unconfirmed`；不自动回滚 Git——`workflow-stage-request` 域内全绿 |
| AC-08 | **pass** | A1–A13/B1–B4 转移、A10→A11 顺序门、A12a/A12b/rework、坏行 `workflow-corrupt`——`workflow-state` + 全链 3/3 |
| AC-09 | **pass** | A12a criteria 先于 A11（否则 `stage-transition-invalid`）；A12b accepted + report hash + 归档；归档失败阻塞——`workflow-state`/`acceptance-archive`/桌面 b21 6/6/全链 |
| AC-10 | **pass** | B1 前置/`b-repository-required`/`.gitignore`/baseline/branch/dirty、`basis.recorded(reason:"path-b")`、B3 写集派生——`path-b-baseline`/`b-change-scope`/全链 B 路径 |
| AC-11 | **pass** | A13 需 A12b accepted + 归档；B4 仅需 B3 + 运营报告；缺失 `release-workflow-not-ready`——`release-merge` + desktop b31 |
| AC-12 | **pass** | per-flow 模式、legacy 在飞 + fixed 并存、`workflow-workspace-busy`、project.json 原子写回/失败不弹卡——`workflow-mode` + `mode-switch` 5/5 |
| AC-13 | **pass** | 3 卡字段/发起人/documentRefs、`source:"stage-a10"`/workflowId、fixed 不发 acceptance 卡、`cardKindsOf` fixed 只读 `fixedCards`——`b3-fixed-cards-panel` + 全链 |
| AC-14 | **pass** | `merge-main` ∈ `GOVERNANCE_APP_OWNED_CARD_KINDS`、不在 `GOVERNANCE_CARD_GROUP`（`governanceCardGroup==undefined`，`runtime.ts:910/974`）；judge 一律转人工/拒绝（`governance-judge.ts:165-171`、`merge-main-customer-only`）；preview/客户本人/`release.confirmed.by:"customer"`——`b3-release-merge-desktop`/`b31`/`acceptance-judge-minimal` |
| AC-15 | **pass** | `complete_team_plan` v4、`git init -b main`、`.gitignore` 托管块/baseline、branch 复用/冲突、dirty 口径、8 MiB 预算——`baseline-service` 域内全绿 |
| AC-16 | **pass** | §5.5 失败码 fail-closed、失败不弹卡、replay、`stage.blocked`——`baseline-service` 失败面用例全绿 |
| AC-17 | **pass** | 三账本 schema/幂等/坏行/轮转；fixed `task.created` 豁免 runId；`request.created/resolved` documentRefs——`workflow-ledger` 域内全绿 |
| AC-18 | **pass** | `close_created_task` v2、`prepareIntent/finalizeIntent`、不触 trunk/CAS、legacy 逐字保留——`workflow-close-intent` 域内全绿 |
| AC-19 | **pass**（MF-B2-02 关闭；附 §10-D4 披露） | §5 全部锚点 + 行为测试（7/7 + 6/6 + 全链 3/3 + 桌面 77/77）；A11/B1/B3/A12a/A12b/A13/B4 七关键门 drift 阻断均有行为用例；`basis.amended`/`previousBasisId` 实现+测试；`basis.verified` 节流；Q4 path-b 只读；`role.activated`/`role-activation-unrecorded` 保持 |
| AC-20 | **pass** | `docs/acceptance/<flowId>-acceptance-vN.md` 生成/版本/幂等/失败阻塞——`acceptance-archive` + 桌面 b21 用例 1/全链 |
| AC-21 | **pass** | `SHELL_RULES_VERSION="5"`（`:1142`）、`matchReadonlyGit`（`:1572`）/`matchTaskGit`（`:1991`）白名单与拒绝集、临界区、审计行——`test/门禁引擎` 域内全绿 + `b42-task-git-port-desktop` |
| AC-22 | **pass** | 应用执行合并/固定 argv/sanitized env/initial vs merge/冲突 abort/幂等/`release-already-merged`/不 push-tag/B 路径 base OID 披露——`release-merge` + `b3-release-merge-desktop` + 全链 |
| AC-23 | **pass** | fixed 全链断言无 `.ans/trunk`/`.ans/runs`；fixed 会话不注入旧工具；旧账本只读忽略；旧分支不参与；trunk 套件 1 冻结 known-red（含于 24 名单）——全链 + 域内 |
| AC-24 | **pass** | 六内置 legacy 冻结（`chief/internal/dispatch.ts` 0 diff；`CONVENER_WORKER_DISPATCH_TARGETS` 未改；差分/oracle 0 diff）；fixed 新字段/context/`chief-workflow-v2.md`；`activate_role_documents` v2；`requestReleaseMerge` 未新增——`test/roles` 275/275 + `role-module-contract` + G-IR |
| AC-25 | **pass**（附 D7 披露） | append-only 审计不减少（`shell-post-audit` 域内全绿）；judge 代批保留且 merge-main 不可代批；doc_format **54 id** deepEqual 保持；roster v4 兼容；写区边界 0 diff；高风险清单不变 |
| AC-26 | **pass**（附 §10-D2 披露） | H1=0：无边界修订；`src/common/gates/` **0 diff**；无新角色/新客户门；五层架构/依赖方向/边界格式不变；UI 0 diff；`角色卡/**` 边界/role-card/权限模型 0 diff（4 个角色自有记录文档见 D2） |
| AC-27 | **pass** | Q1 fixed 不发 acceptance 卡；Q2 未新增 requestReleaseMerge（G-IR 拒绝）；Q3 串行 + 单活动 fixed workflow；Q5 只本地合并；Q6 fail-closed；Q7 验收角色 + 归档——对应套件全绿 |
| AC-28 | **insufficient（仅 RR 证据缺）** | 同一候选/环境；D1 记录 + 本角色复跑一致；known red 不恶化；G-IR/H1 证据齐全；**EV-06 真机日志/截图未产生（RR 阶段）**——确定性部分 pass，不计 fail |
| AC-29 | **pass** | T-01…T-20 全部执行；无 fail 项；新增确定性失败 **0**、新 skip **0**（见 §7） |
| AC-30 | **insufficient（RR 未执行，预算另报）** | RR-01…RR-06 未执行；不计 pass |

## 7. 逐条判定：T-01…T-20（确定性矩阵）

| 编号 | 判定 | 覆盖与结果 |
| --- | --- | --- |
| T-01 | **pass** | `workflow-dispatch-fixed` + `workflow-preconditions`（69/69 含）+ `fixed-path-routing`（15 内） |
| T-02 | **pass** | `workflow-stage-request`（字段/幂等/重复抑制/无写权/open/stop/sourceTaskId/全链 replay）域内全绿 |
| T-03 | **pass** | `workflow-state` A1–A13/B1–B4 + A10→A11 + A12a/A12b/rework + attempt + 坏行；全链 3/3 |
| T-04 | **pass** | `workflow-close-intent`（close v2/intent hash/documentRefs/不触 trunk）域内全绿 |
| T-05 | **pass** | `workflow-mode` + `mode-switch` 5/5 |
| T-06 | **pass** | `task-state-fixed`（workflowId 豁免 runId/旧 run-required/replay/收口）域内全绿 |
| T-07 | **pass** | `baseline-service`（init/-b main/父仓库/.gitignore/dirty/branch/预算/失败面/幂等）域内全绿 |
| T-08 | **pass**（**由 fail 转 pass**） | `workflow-ledger`/`basis-guard` 域内全绿 + **`workflow-basis-b21.test.ts` 7/7**（`basis.amended`/`previousBasisId`、`basis.verified` 节流、A11/B1/B3/A12a/A12b/A13/B4 drift）+ **`b21-basis-gate-desktop.test.ts` 6/6**（A12a/A12b 收口门、A11/B3 派发门、legacy 不触达）——B2 预验收缺口闭环 |
| T-09 | **pass** | `classify-shell-v5` + `shell-task-git-gate/execution`（门禁域全绿）+ `b42-task-git-port-desktop` |
| T-10 | **pass** | `release-merge` + `b3-release-merge-desktop`/`b31`（前置条件化/客户本人/不 push-tag） |
| T-11 | **pass** | `b3-fixed-cards-panel` + `acceptance-archive` + 全链（3 卡各一次、归档版本/幂等、merge-main 非判断/仅客户） |
| T-12 | **pass** | `path-b-baseline` + `b-change-scope` 2/2 + `b3-fixed-baseline-pathb`（B4 不要求 A12b） |
| T-13 | **pass** | `test/roles` **275/275** + `role-module-contract`/`governance-matrix-fixed-view`（门禁域全绿）；G-IR 在案 |
| T-14 | **pass**（附 known-red 披露） | `mode-switch` 3/3；fixed 不写 `.ans/trunk`/`.ans/runs`（全链断言）；旧账本忽略；旧 fixture **9 红与 `10f90c7` 同名同因**（§4.2）、trunk 1 冻结 known-red |
| T-15 | **pass** | `shell-post-audit`（审计行不减，域内全绿）+ release 审计字段 + 全链（`release.confirmed.by:"customer"`、judge 无代批） |
| T-16 | **pass** | `fixed-path-full-chain.test.ts` **3/3**（路径 A / 路径 B / B 无仓库） |
| T-17 | **pass** | `npm run typecheck` **exit 0**（renderer 未触及，无需 typecheck:renderer） |
| T-18 | **pass**（附 D7 披露） | known red 复测：编排 24/24、门禁 5/5、runtime-core 33/33 名集与冻结一致；version-change 9（`vca-channel-unavailable`）；optional-acceptance 2/1/挂起形态一致；star-routing/i-full-chain 9 与代码基线同名同因；**新增确定性失败=0、新 skip=0** |
| T-19 | **pass**（附 D2 披露） | 写集外 diff=0（`src/app/test` 与 HEAD 零 diff）；`src/common/gates/` 0；新文件均在既有 directory 授权；无新依赖；4 个角色自有记录文档（D2） |
| T-20 | **pass**（附 D7 披露） | doc_format **54 格式** deepEqual（`doc-format-specs` 域内全绿）；team-plan/v3 文案同步；roster/v4 v3 兼容 + 可选 `roles[].review`（`roster-v4` 域内全绿）；TM-5 同名内容增长披露 |

## 8. 证据判定：EV-01…EV-08 与 RR 状态

| 编号 | 判定 | 说明/证据 |
| --- | --- | --- |
| EV-01 | **pass** | 候选身份：分支/HEAD `79e16a1`/30 提交/无 tag/无合并/未推送/旧分支排除（§2；`01`） |
| EV-02 | **pass** | 每批 D1：B2.1 编排/桌面 before-after TAP + 失败名 diff + 写集外 diff=0；B5.3 全链/D1；本角色独立复跑一致（§3） |
| EV-03 | **pass** | known red 复测：9 红基线对照（9/9 同名同因）、编排 24/24、门禁 5/5、runtime-core 33/33、version-change 9、optional 形态一致；新增确定性失败 0/新 skip 0 |
| EV-04 | **pass** | T-01…T-20 执行结果见 §7（TAP/命令落盘） |
| EV-05 | **pass** | G-IR `08e01726…`（评审结论 + MF-IR-1…8 条件与 owner）+ 各 owner 闭环记录；`requestReleaseMerge` 明确拒绝 |
| EV-06 | **insufficient（RR 未执行）** | 真机全链日志/截图/账本/预算未产生；RR-01…RR-06 预算另报 |
| EV-07 | **pass**（附 D2 披露） | 写集外 diff=0；`src/common/gates/`、`app/renderer` 0 diff；角色边界/role-card/权限模型 0 diff；边界授权清单见 02 |
| EV-08 | **pass** | 本报告（B2 复判独立报告，含逐条矩阵/限制/披露） |

- **RR-01…RR-06：未执行（预算另报），不计 pass。**

## 9. 放行结论：**`可进入 RR`**（预 RR 放行门通过）

### 9.1 判定

- 门条件：确定性 AC/T/EV（除 RR 证据类）全部 pass 且无 must-fix。
- 实际：**AC 28 pass / 0 fail / 2 insufficient（AC-28/AC-30 = RR 证据类）；T 20/20 pass；EV 7 pass / 1 insufficient（EV-06）**。
- **MF-B2-01 已关闭**（B1 v1.1 `e2ad4701…` 冻结 + 9/9 基线对照 + 24/24 编排 known-red 一致）。
- **MF-B2-02 已关闭**（`basis.amended`/`previousBasisId` + `basis.verified` 节流 + A11/B1/B3/A12a/A12b/A13/B4 drift 收口；13 项新测试 + 全链 3/3 + 桌面 77/77 独立复跑）。
- **无剩余 must-fix。**

### 9.2 RR 必验点（执行 RR 时必须逐项验证）

1. **隔离实例（RR-01）**：全新空项目目录；独立 Electron userData/session、独立 `ANS_E2E_OUTDIR`；
   **不使用 9222/9223**（隔离端口或不开远程调试）；真实 Electron + 真实模型。
2. **空项目→贪吃蛇全链（RR-02）**：3 张确认卡（intent-confirm/proposal/appointment）各一次；
   A10 任命确认 ⇒ A11 stage-request ⇒ 运营派实现 ⇒ 实现角色在 `ans/task/<workflowId>` 串行提交；
   A12a criteria **先于** A11；A12b accepted + 应用生成 `docs/acceptance/snake-acceptance-v1.md`。
3. **发布合并（RR-03）**：merge-main 卡**仅客户本人** approve/reject；judge 尝试 ⇒ 转人工/拒绝、
   无 `release.confirmed`/`release.merged`；应用本地合并（不 push/tag）；合并后客户可玩（真实 UI）。
4. **账本/审计（RR-04）**：`.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` 事件完整；
   `.ans/trunk`/`.ans/runs`、versions/stable 账本**零写入**；`docs/audit/shell-gate.jsonl` 有 git add/commit
   审计行；`.gitignore` 托管块存在、治理文档/角色卡/`.ans` 不被 Git 跟踪；无额外客户门；无 judge 冒充客户。
5. **失败即停（RR-05）**：任何阶段失败 ⇒ 停止、保留现场/账本/日志、按真实错误回报；
   不合并 ans-studio main、不打 tag、不发布产物、不上报成功。
6. **预算（RR-06）**：真实模型使用量/费用单独报告；须先取得书面预算授权（本复判不构成预算批准）。
7. **A12/A13 顺序与归档**：A12a criteria 先于 A11；A12b accepted + 归档后才允许 A13/merge-main；
   B 路径 B4 不要求 A12b（AC-09/AC-11/AC-20）。
8. **B2.1 basis 门的真机行为**：A11/B1/B3 派发前、A12a/A12b 收口前、A13/B4 发布前 basis 一致时
   正常放行并节流入账 `basis.verified`；若出现文档字节漂移 ⇒ 必须 fail-closed（`basis-drift`）、
   不派发/不收口/不发布——真机日志须能佐证（`basis.jsonl` 事件）。
9. **已知限制**：A6 revise 后重呈卡（attempt>1）未接线（§10-D8）——RR 若触发 revise，按失败即停记录，
   不得伪造推进；`workflow.closed reclassified` 无专门行为用例（§10-D9），RR 若使用须人工见证。

## 10. 独立风险与披露

| # | 事项 | 事实/证据 | 对判定/RR 的影响 |
| --- | --- | --- | --- |
| **D1** | B1 v1.1 事实更正已独立复核 | 9 红两侧 12/3/9、9/9 同名同因；编排 24/24 名集一致（§4） | MF-B2-01 关闭依据；不改变其它判据 |
| **D2** | **4 个角色自有记录文档进入候选**（提交 `89e0ed6`） | `角色卡/chief-code/api-spec.md`、`角色卡/product-code/{api-spec,feature-map,memo}.md`（+131/−13，纯文档：B2 fixed 面说明/API 报告/memo）。两角色 `boundary.yaml` **明确授权**这些文件（“模块 public API 实现报告/本角色工作备忘录/功能导航”）；无 role-card/boundary/权限/roster 模型变更；无行为变化 | AC-26/EV-07 按「不改角色卡功能/边界文件、角色自有记录文档属既有 directory/file 授权」判定 **pass**；**严格字面读法**（`角色卡/**` 未改）下需协调方确认（§10.2-1）。不影响 H1=0 |
| **D3** | `workflow-preconditions.test.ts` 2 行文档断言更新（T-20 同步） | `10f90c7→HEAD` diff：AC-17 文档 schema 常量期望从「必须恰为 project-roster/v3」改为「v3 或 v4」（`_evidence/02` 内含 diff 摘要）。该更新由 T-20「`project-roster/v4` 说明同步」强制；未触碰任何派发授权断言/差分 | AC-03 按「legacy **派发断言**逐字保留、文档文案按 T-20 同步」判定 pass；**严格字面读法**（该文件任何断言不得改写）下需协调方确认（§10.2-2）。B2 预验收已按同口径通过该套件 |
| **D4** | `amendBasis` 无生产调用点 | 全仓 `amendBasis` 仅测试调用；桌面/运行时未接线触发入口。设计 v1.3 §5.3/§7.2 要求「文档修正 ⇒ 新 -vN + basis.amended」，服务能力已实现并行为测试；触发时机属应用操作，当前无会话/工具入口 | AC-19 判 pass（机制+测试齐备）；**RR 若需修正治理文档**：当前只能由应用侧服务调用（需协调方单独授权）或停止，不得绕过 basis 账本 |
| **D5** | 全链夹具的 A12b 不经桌面收口门（既有夹具走服务直连 `closeTask`） | B5.3 §0 已披露；桌面 A12b 门由 `b21-basis-gate-desktop.test.ts` 用例 1 与桌面域回归覆盖（本角色 6/6 + 77/77 复跑） | 不影响判定；**RR 使用真实桌面路径**，A12b 收口门将在真机被实际执行（RR 必验点 8 佐证） |
| **D6** | `optional-acceptance` 挂起 | 150s 外部超时：已完成 `not ok 1` + `ok 2` + `ok 3`，测试 4 前挂起（exit 124）；与 B1 §二 6/2/1/3 形态一致；未改该文件 | 既有环境/挂起 known-red；不新增失败 |
| **D7** | TM-5（schema 字面量扫描）同名 known-red 的内容增长 | 基线 `10f90c7` 5 个字面量 → 候选 7 个（+`chief-workflow/v2`、+`ans-task-git-shell/v1`）；测试名/数量不变 | 按「失败名集合」口径 T-18 pass；若协调方改按「同名内容不得恶化」严格解释，需裁决/白名单登记（B2 预验收 D3 同项） |
| **D8** | A6 revise 后重呈卡（attempt>1）未接线（B5.1 披露，carried） | A6 revise ⇒ `stage.reworked A5` 支持；桌面方案卡 marker 幂等键固定 attempt=1；返工重呈未接 | 不违反 B1 冻结文字；RR 若触发按失败即停记录 |
| **D9** | `workflow.closed reclassified` 分支无专门行为用例（B2 预验收 D11，carried） | `confirmStop` 支持并校验 `stopped\|reclassified`；现有测试仅覆盖 stopped/stop-unconfirmed/replay | 不另判 fail（同一已测路径参数分支）；建议后续补测 |
| **D10** | 本复判未整域重跑 `test/测试`（119 文件） | B5.3 在 `89e0ed6`（与 `79e16a1` 仅差 B5.3 文档提交）域运行 711/654/38/1/18 与 B5.2 逐项相等；本角色独立重跑关键文件（全链 3/3、mode-switch/b-change-scope 5/5、legacy 3/9、version-change 9） | 不影响判定；D1 域结果按 B5.3 证据引用，未声称本角色整域复跑 |
| **D11** | 本复判未整域重跑 `test/桌面应用`（既有挂起套件） | B2.1 桌面记录提供全量 before/after（失败名 diff added 0/removed 0，excl 环境/非确定项）；本角色独立重跑 B2.1 新套件 6/6 + 9 个 fixed 套件 77/77 | 不影响判定；环境项（genesis-bootstrap/p0-halt linked-worktree）见 B2.1 记录 |
| **D12** | 共享机器/并发 | 本批复跑均在候选工作树串行/独占域运行；编排域 223s、门禁 118s、runtime-core 50s 期间无额外一次性异常；`optional-acceptance` 挂起为既有 known-red | 不改变结论 |

### 10.1 RR 预算与另报

- RR-01…RR-06 需真实 Electron + 真实模型 + 独立实例；**预算另报、另授权**；本复判不构成预算批准。

### 10.2 进入 RR 前协调方确认项（非 must-fix，均为口径确认）

1. **D2**：确认 `89e0ed6` 的 4 个角色自有记录文档（api-spec/memo/feature-map）在 AC-26/EV-07 下
   按「既有 file 授权 + 角色记录」处理（本角色判定 pass）；若采用严格字面读法，需 B1 v1.2 或从候选移除（docs-only）。
2. **D7**：确认 TM-5 同名 known-red 内容增长的判定口径（B2 预验收 D3 同项，建议白名单登记 + 理由）。
3. **D4**：确认 RR 不涉及治理文档修正；如需要，按应用侧服务调用 + 协调方单独授权，不绕过 basis 账本。

## 11. 限制与未执行项

- 本复判为**确定性/假会话**验收：未运行真实 Electron、真实模型、真实 UI；**RR-01…RR-06 未执行（预算另报）**。
- 未整域重跑 `test/测试`（119 文件）与 `test/桌面应用`（既有挂起套件）——见 D10/D11；单独重跑的关键
  套件/域见 §3。未运行全仓每文件测试；其余域按批次 D1 记录引用（不据此声称全绿）。
- 9 条 star-routing/i-full-chain 红经独立基线对照确认为既有夹具缺陷；本复判**未修改任何 legacy 断言/夹具**。
- 本报告不构成合并/发布/客户放行授权；不替代 RR 真机证据与客户确认。

## 12. 未提交声明与证据索引

- 本记录与 `_evidence/` 仅写入本角色写集：
  `角色卡/独立验收/docs/change/2026-11-10_B2_re-review_two-fixed-workflow-paths.md`、
  `角色卡/独立验收/docs/change/2026-11-10_B2_re-review_two-fixed-workflow-paths_evidence/`、
  `docs/acceptance/2026-11-10_two-fixed-workflow-paths-report-v1.1.md`（对外报告新版本，不原地改 v1）。
- **未 commit / push / merge / tag / 发布**；未修改 `src/**`、`app/**`、`test/**`、`docs/planning/**`、
  `docs/proposals/**`、`docs/scheduling/**`、角色卡功能文件/边界/其它角色文档；未运行真实模型/Electron；
  未占用 9222/9223。
- 落盘后实测（行/字节/SHA-256）见回报与 `_evidence/90-evidence-index.txt`。

## 13. 证据清单（`_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-candidate-and-baseline.txt` | 候选/基线/合并/tag/推送/旧分支/工作树/依赖边界 |
| `02-write-set-boundary.txt` | 写集边界与 legacy 测试文件 diff 摘要（含 workflow-preconditions 2 行更新） |
| `03-typecheck.txt` | `npm run typecheck` exit 0 |
| `04-full-chain.tap` | `fixed-path-full-chain.test.ts` 3/3 |
| `05-mode-switch-b-change-scope.tap` | `mode-switch` + `b-change-scope` 5/5 |
| `06-basis-b21.tap` | `workflow-basis-b21.test.ts` 7/7 |
| `07-b21-desktop.tap` | `b21-basis-gate-desktop.test.ts` 6/6 |
| `08-orch-domain-full.tap` | `test/编排` 全域 1,335/1,309/24/2 |
| `09-orch-knownred-comparison.txt` | 24 失败名 vs B0 冻结 before（24/24 一致） |
| `10-gates-domain-full.tap` | `test/门禁引擎` 全域 528/522/5/1 |
| `10b-gates-knownred-comparison.txt` | 5 失败名 vs B2 预验收证据（5/5 一致） |
| `11-roles-domain-full.tap` | `test/roles` 275/275 |
| `12-legacy-star-i-full-chain-head.tap` | 候选 `79e16a1` star-routing + i-full-chain（12/3/9） |
| `13-legacy-star-i-full-chain-baseline10f90c7.tap` | `10f90c7` 纯净解包同两套件（12/3/9） |
| `14-legacy-baseline-comparison.txt` | 9 红名称+首条错误串对照（9/9 IDENTICAL） |
| `15-desktop-fixed-suites.tap` | 桌面 fixed 9 套件 77/77 |
| `16-version-change-knownred.tap` | version-change 12/3/9（`vca-channel-unavailable`） |
| `17-optional-acceptance-knownred.tap` | optional-acceptance 挂起（2 pass/1 fail/3 未运行，exit 124） |
| `18-runtime-core-domain.tap` | `test/runtime-core` 全域 586/549/33/4 |
| `18b-runtime-core-knownred-comparison.txt` | 33 失败名 vs B2 预验收证据（33/33 一致） |
| `19-shared-domain.tap` | `test/项目管理/shared` 224/219/0/5 |
| `20-legacy-preconditions-module-consumption.tap` | 旧谓词 + 六角色 module-consumption 69/69 |
| `90-evidence-index.txt` | 全部证据文件与产出文件 SHA-256 索引（不含自身） |
