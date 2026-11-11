# B2 独立验收报告：两条固定工作流路径（T3，预 RR 放行门，v1）

- 日期：2026-11-10
- 角色：ANS「独立验收」（独立固定上下文；任务精确范围授权写入 `docs/acceptance/`）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 节点：**B2 独立验收（预 RR 放行门）**；按 B1 冻结判据全量判定
- 候选：分支 `feat/two-fixed-workflow-paths` / **HEAD `e28923cadf957df2ef9b9f88f25b6957d07da405`**
- 基线：`origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；代码基线 `10f90c7`
- 详细记录（含全部逐条矩阵与证据索引）：`角色卡/独立验收/docs/change/2026-11-10_B2_pre-RR_two-fixed-workflow-paths.md`（267 行 / 40,790 B / `5958ba3879aa6ad5df2be0e27f43ec74c7067644576a074f5d94f169dc206888`）
- 证据目录：`角色卡/独立验收/docs/change/2026-11-10_B2_pre-RR_two-fixed-workflow-paths_evidence/`（29 个文件，逐文件 SHA-256 见 `28-evidence-index.txt`）

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收标准（冻结） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 设计 v2 | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 实现级方案 v1.3 | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| G-IR 接口评审 | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 启动计划 §七（协调方决策） | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 当前 `a66c47d746ddf65720e27c77268a9069ceb13fc500c2a71419ad413c4d20a3d9`（相对 B1 引用 `08450af1…` 仅「进展」行不同，§七逐字不变） |
| B5.2 关键证据 | `角色卡/测试/docs/change/2026-11-10_B5.2_two-fixed-workflow-paths.md` | `0ac3a0d9f937d0acb976d44529c852f60d9d5622da06aae0f9742e6cdd90de64` |

## 二、候选身份

- HEAD `e28923c`；距 `origin/main` 26 提交、0 落后；无合并提交、无 tag、未推送（无远端分支）。
- 旧分支 `feat/initial-workflow-publication-completion`（`4a0bafd`/`882d84b`）不是 HEAD 祖先，不参与。
- 候选差异面（vs `10f90c7`）：`src/` 40、`app/` 6、`test/` 60、`docs/` 9（B1 阶段）、`角色卡/` 1,259（仅 `docs/change`/`docs/design` 记录）；`src/common/gates/` 0 diff；无依赖/配置变更。
- 工作树 `src/`、`app/`、`test/` 与 HEAD 零 diff；候选外另有角色文档 `M`（非候选，见详细记录 §8-D8）。

## 三、独立取证摘要（本角色复跑）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0** |
| `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass**（路径 A 全链 / 路径 B 全链 / B 无仓库 `b-repository-required`） |
| `mode-switch` + `b-change-scope` | **5/5 pass** |
| 派发矩阵/状态机/stage-request（T-01…T-03） | **59/59 pass** |
| 收尾/基线/账本/依据/模式（T-04…T-08 套件） | **35/35 pass**；但代码扫描发现 `basis.amended`/`basis.verified` **无写入实现** ⇒ T-08 fail（AC-19，MF-B2-02） |
| 发布/路径 B/归档/文档格式（T-10…T-12、T-20） | **53/54 pass**（唯一 = TM-5 同名 known-red） |
| 门禁 fixed 套件（T-09/T-13/T-15） | **90/90 pass** |
| 六角色 fixed + 编排 fixed + 桌面 fixed | **59/59 + 70/70 + 68/68 pass** |
| `test/编排` 全域 | **1,328 / 1,302 pass / 24 fail / 2 skip**（失败名 vs 代码基线 24/24 一致） |
| `test/门禁引擎` 全域 | **528 / 522 / 5 / 1**（vs 冻结 5/5 一致） |
| `test/runtime-core` 全域 | **586 / 549 / 33 / 4**（vs 冻结 33/33 一致） |
| `test/roles` / `test/项目管理/shared` | **275/275** / **224 / 219 / 0 / 5**（既有平台 skip） |
| 旧路径 `star-routing` + `i-full-chain` | **3 pass / 9 fail**；`git archive 10f90c7` 解包复跑 **9/9 同名同因**（基线既有、非本候选回归） |
| `version-change-integration` / `optional-acceptance` / trunk 套件 | 9 红（`vca-channel-unavailable`）/ 2 pass-1 fail-挂起 / 1 冻结 known-red——均与 B1 §二 基线一致 |
| 旧谓词 + 六角色 module-consumption | **69/69 pass** |
| AC-19 代码锚点扫描（`basis.amended`/`basis.verified` 写入点） | **无写入点**：仅 model 类型/校验 + 读取方；`appendBasisEvent` 调用 = `recordBasis`(recorded) + `verifyBasisForWorkflow`(drift) ⇒ MF-B2-02（`_evidence/29-ac19-code-scan.txt`） |

## 四、逐条判定汇总

- **AC-01…AC-30**：**26 pass / 2 fail / 2 insufficient（RR 证据类）/ 0 NA**。
  - fail：**AC-03**（star-routing 7 + i-full-chain 2 = 9 条 legacy 红未在 B1 §二 known-red；AC-03 要求「逐字保留**且通过**」）；**AC-19**（`basis.amended`/`previousBasisId` 修正流程、`basis.verified` 关键门节流摘要无写入实现、A12a/A12b drift 复核缺失，且均无行为测试）。
  - insufficient：**AC-28**（仅缺 RR 真机日志/截图 = EV-06；确定性部分全 pass）、**AC-30**（RR 未执行）。
- **T-01…T-20**：**19 pass / 1 fail**（T-08 依判定规则 fail——AC-19 缺口：`basis.amended`/`basis.verified` 无实现、A12a/A12b drift 无复核/测试；T-14/T-18 附 known-red 披露；T-20 附 TM-5 同名 known-red 披露）。
- **EV-01…EV-08**：**7 pass / 1 insufficient**（EV-06 RR 未执行）。
- **RR-01…RR-06**：**未执行（预算另报）**，不计 pass。

逐条证据矩阵见详细记录 §4–§6；TAP/命令输出见证据目录（`28-evidence-index.txt`）。

## 五、放行结论：`不可进入 RR`（预 RR 放行门未通过）

**must-fix 2 项**：

**MF-B2-01（基线口径；非产品代码缺陷、非本候选回归）**：B1 冻结判据 AC-03 与 B1 §二 known-red
基线口径冲突——star-routing/i-full-chain 9 条 legacy 红在代码基线 `10f90c7` 与候选 `e28923c` 上
**同名同因、确定性复现**（根因：`e71501c`（origin/main 祖先）的生产门要求已注册项目生命周期/当前客户轮次，
测试夹具未提供；`document-planning-source-unavailable`/`worker-dispatch-source-unavailable`），
但未被 B1 §二 known-red 收录；同时 B1 §二 `test/编排` 记「22 fail」实测为 **24 fail**（名集未变）。

- **owner**：**协调方**（裁决基线口径，出 B1 新版：将 9 条主干既有红列入 known-red 并修正 22→24）；
  若裁决「修复」，处理 owner 为 `测试/编排`（test-only 夹具迁移，不得改 legacy 断言语义，须协调方单独授权）。
- **证据/复现**：详细记录 §8-D1 + `_evidence/13-legacy-star-i-full-chain.tap`、
  `_evidence/18-legacy-baseline-comparison.txt`、`_evidence/20-orch-knownred-comparison.txt`、
  G-IR 证据 `04-legacy-star-routing-i-full-chain-baseline.txt`。
- **关闭条件**：协调方书面裁决（新 B1 版本 hash 冻结）或经授权的 test-only 修复在同一候选复跑通过。

**MF-B2-02（实现缺口，owner=编排+桌面窗口）**：AC-19/T-08 要求 ① `basis.amended`/`previousBasisId`（文档修正）、
② `basis.verified`（A11/A12b/A13 关键门节流摘要）、③ A12a/A12b 验收前后 basis drift 复核（设计 v1.3 §7.2）。
现状：① `recordBasis` reason 仅 `baseline|path-b`；② `BasisAmendedEvent`/`BasisVerifiedEvent` 仅 model 类型/校验，
**全仓无写入点**；③ basis drift 复核仅限 `convener && stage∈{A11,B1,B3}` 与 A13/B4 发布链
（`session.ts:10069`、`workflow-service.ts:2783/3121`），A12a/A12b 为 chief→verifier 直派、不经该门；
`appendBasisEvent` 仅被 `recordBasis`（recorded）与 `verifyBasisForWorkflow`（drift）调用；以上均无行为测试。
B0/B1 记录将 ①② defer 至「B3/B4」，但 B3/B4 记录未闭环。

- **证据/复现**：详细记录 §8-D10 + `_evidence/29-ac19-code-scan.txt`（`grep`/代码段扫描原文）。
- **关闭条件**：实现 ①②③ + `test/编排/workflow-ledger.test.ts`/A12 链行为用例通过（同一候选复跑）；
  或 B1 新版书面 de-scope（不建议；AC-19 明文要求）。

除上述两项外：新路径主链（全链 3/3）、3 卡与 merge-main 客户本人、账本 drift fail-closed、Git v5/taskGitScope、
发布合并、迁移隔离的确定性判据**均 pass**。两项关闭后可按新依据复核并放行 RR。

### RR 必须验证的点

1. merge-main 仅客户本人确认（judge 代批/尝试 ⇒ `release-unauthorized`，无 confirmed/merged）；客户卡 = 3 张确认卡 + 1 张 merge-main，无 acceptance 卡/无额外客户门。
2. 三账本（workflows/basis/releases）事件/幂等完整；`.ans/trunk`/`.ans/runs`/versions/stable **零写入**；`docs/audit/shell-gate.jsonl` 含 git 审计；`.gitignore` 托管块生效、治理文档/角色卡/`.ans` 不被跟踪。
3. 失败即停：任何阶段失败停止并保留现场/账本/日志，如实回报；不合并 ans-studio main、不打 tag、不发布。
4. 隔离实例：全新空项目、独立 Electron userData/session、独立 `ANS_E2E_OUTDIR`；**不使用 9222/9223**。
5. 真实模型预算单独报告并取得书面授权（RR-06）。
6. A12a 先于 A11；A12b accepted + `docs/acceptance` 归档后才允许 A13/merge-main；B 路径 B4 不要求 A12b。
7. 已知限制：A6 revise 后重呈方案卡（attempt>1）未接线——RR 触发 revise 时按失败即停记录，不得伪造推进。

## 六、限制与披露（摘要）

- **D1**：star-routing 7 + i-full-chain 2 legacy 红——独立基线复跑证明为代码基线确定性陈旧测试缺陷（非环境伪影、非本候选回归）；影响 AC-03（MF-B2-01）。
- **D2**：B1 §二 known-red 计数 22 vs 实际 24；失败名集未变（不改变「新增确定性失败=0」）。
- **D3**：TM-5 同名 known-red 内容由 5→7 个字面量（+`chief-workflow/v2`、+`ans-task-git-shell/v1`，均为本特性 schema id）；不影响 AC-25 的 54 格式；若协调方按「同名内容不得恶化」严格解释需另裁决。
- **D4**：A6 revise（attempt>1）重呈卡未接线（B5.1 已披露）；不违反冻结 AC/T 文字，RR 需按失败即停处理。
- **D5**：optional-acceptance 挂起（2 pass/1 fail 后超时）与 B1 known-red 形态一致。
- **D6**：runtime-core 33/门禁 5/trunk 1 红均为冻结基线同名，无恶化。
- **D7**：merge-main 客户可见文案为中文直字面量（i18n 守卫已 allowlist）；建议后续迁 key。
- **D8**：工作树有候选外未提交角色文档 `M`（非本角色、非候选）；`src/app/test` 干净。
- **D10**：AC-19/T-08 缺口——`basis.amended`/`previousBasisId` 与 `basis.verified` 关键门节流摘要未实现
  （`recordBasis` reason 仅 `baseline|path-b`；全仓无 `basis.amended`/`basis.verified` 写入点；无行为测试；
  B0/B1 记录 defer 至 B3/B4 未闭环）⇒ MF-B2-02（owner=编排）；详见 `_evidence/29-ac19-code-scan.txt`。
- **D11**：`workflow.closed reclassified` 分支无专门测试（`confirmStop` 支持并校验，现有测试仅覆盖 `stopped`/unconfirmed/replay）；建议补一条行为用例，不另判 fail。
- 本报告为**确定性/假会话**验收；未运行真实 Electron/模型；RR 未执行（预算另报）；不构成合并/发布/客户放行授权。

## 七、未提交声明

本报告与详细记录/证据仅写入任务授权写集；**未 commit / push / merge / tag / 发布**；未修改
`src/**`、`app/**`、`test/**`、`docs/planning/**`、`docs/proposals/**`、`docs/scheduling/**`、
角色卡功能文件/边界/其它角色文档；未运行真实模型/Electron；未占用 9222/9223。

- 报告落盘实测：本文件（行/字节/SHA-256 见回报实测）；详细记录 `5958ba3879aa6ad5df2be0e27f43ec74c7067644576a074f5d94f169dc206888`（267 行 / 40,790 B）。
