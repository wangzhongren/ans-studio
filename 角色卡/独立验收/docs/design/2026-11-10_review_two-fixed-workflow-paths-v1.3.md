# 独立复核报告（第三轮）：两条固定工作流路径——实现级方案 v1.3（2026-11-10）

- 角色：ANS 「独立验收」（独立固定上下文；只写本角色 Section 1 与本任务授权的 B1 新文件）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 复核对象：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`（**v1.3；v1/v1.1/v1.2 保留不改，不是本轮目标**）
- 分支：`feat/two-fixed-workflow-paths`；复核时 HEAD `67b728f`（v1.3 提交；相对方案清点基线 `10f90c7` 仅 docs 差异，代码无变化）
- 复核日期：2026-11-10
- 复核性质：**只复核方案**（不判实施、不写产品/测试代码、不改角色卡/边界、不提交/推送/合并）；未运行真实模型/Electron；未占用 9222/9223。
- **结论：建议提交（可进入 B1）**——MF-9…MF-12 全部闭环，MF-1…MF-8 保持闭环，协调方决策 #1–#8 全量落入且无残留；v1.3 未引入新的阶段/矩阵/发布/账本 must-fix。B1 已按本轮结论同轮写入（见 §九）。

---

## 一、依据实测（写盘前实测；命令输出见 `..._v1.3_evidence/measurements.txt`）

| 依据 | 实测（行 / 字节 / SHA-256） | 与任务书一致 |
| --- | --- | --- |
| **v1.3（本轮唯一复核目标）** | **1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8`** | 是 |
| 策划 v1.3 记录 | 66 行 / 9,333 B / `6ab9e1e9374899853836f1b0704ff619f68ee20a404a13d2a135ddd5fb9fc0b6` | 是 |
| 启动计划（含协调方 §七 #1–#8） | 90 行 / 10,820 B / `08450af1b6be0cf893bea81cd73f73c990551b89c499430fd5a60d3c6cbbc215` | 是（当前内容；见 G-12 提交引用修正） |
| 设计 v2（唯一产品依据） | 95 行 / 8,476 B / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` | 是 |
| 第二轮复核（MF-9…MF-12 来源） | 202 行 / 30,200 B / `259ecde7aad44550e29c2d018bc452d619ce3942b57625c4bfe9e5e66b93ecd1` | 是（未改动） |
| 第二轮证据 | 96 行 / 11,254 B / `ab027f774a421658ae32168b3d3f194a7dc46af9482deda6be222b7141f532d5` | 是 |
| 第一轮复核（MF-1…MF-8 来源） | 222 行 / 32,535 B / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` | 是（未改动） |
| 第一轮证据 | 117 行 / 10,708 B / `3abbb1b2bb4f1d2d216921e99cd16db476c420d122e61b8cc73cfeec5e1a453c` | 是 |
| v1 / v1.1 / v1.2（保留不改） | `279f55dc…`/1,110 行；`04511516…`/1,307 行；`e34e60fa…`/1,325 行 | 是 |
| 前任清点（只读） | 86 行 / 12,447 B / `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` | 是 |
| 六份架构/契约设计 | 行数与 hash 与 v1.3 头部引用逐一相符 | 是 |

代码基线核对：v1.3 全部关键锚点按 HEAD `67b728f` 抽查通过（代码与 `10f90c7` 一致）：`workflow-preconditions.ts:1560-1566/1590-1645/1651/1674`；`task-state.ts:365-390`（run-required :377-380）；`model/runtime.ts:1365-1405/1981-2018/2089/901-985`；`model/role.ts:245-330`；`role-tool-registry.ts:52-68`；`classify-shell.ts:1046/1134/1551`；`jsonl-ledger.ts:31-33`；`run-role.ts:1094-1116/1625-1665/1759-1764/3065-3225`；`session.ts:8557/8912/8982-8994/9000-9008/9163-9183/3261/4359`；`apply-journal.ts:2938/3182/3267/3358/3445/3541/3714/3766-3771`；`trunk-runtime.ts:770/1186-1200`；`resolve-role.ts:341+`；六角色模块 cards/写区/边界。`555` 个 `*.test.ts`、doc_format `54` 个格式 id 复核一致。

---

## 二、结论摘要

1. **MF-9 A10/A11 时序已按 (a) 闭环**：A10 仅任命确认、`request.resolved` 即完成、不在 A10 派实现；卡后 chief 发 **A11 stage-request** 派实现；A11 完成于全部选中实现任务 `task.closed accepted` + 分支 tip；A10 未完成发 A11 ⇒ `stage-transition-invalid`；§4.2/§4.4/§4.5/§11.1 口径一致，负例覆盖。
2. **MF-10 项目验收角色窄例外已闭环**：fixed 谓词 `from==chief && targetKind==project && purpose==review && targetRoleId==workflow.reviewRoleId` 允许，其余 project 仍拒绝；`project-roster/v4` 可选 `roles[].review`（至多一个 true、v3 兼容、无标记默认 verifier）；A9 basis 记录 `reviewRoleId`；应用从 roster/basis/A12 绑定核验，不采信模型自报；正/负例测试入矩阵。
3. **MF-11 发布前置已按路径条件化**：A13 ⇒ A12b accepted + `docs/acceptance` 归档；B4 ⇒ B3 accepted + 运营报告（不要求 A12b）；`release-workflow-not-ready` 按路径附缺失项。
4. **MF-12 路径 B 仓库/分支准备已闭环**：B1 前置要求既有 Git 仓库（无仓库 ⇒ `b-repository-required`，不自动 init）；应用确保 `.gitignore` 托管块、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、dirty 检查，并将 `repo` 记入 `basis.recorded(reason:"path-b")`；“只读”仅指文档快照，不指仓库/分支准备。
5. **MF-1…MF-8 保持闭环**（v1.3 未回退）；**协调方决策 #1–#8 全量落入**，编号已统一为启动计划 §七 编号；merge-main 仍为非判断卡、客户本人、judge 不可代批（全文无残留）。
6. 残留均为**非阻塞 G 观察项**（见 §六），包括 A12a 是否作为 A11 前置、B 路径分支基线（当前 HEAD 而非 main）的合并风险、stop 收口顺序措辞等——已纳入 B1 钉住项，不构成 must-fix。

---

## 三、MF-9…MF-12 闭环核验（逐项）

### MF-9 A10/A11 时序 — 闭环

- **v1.3 处置**：§4.2 A10（line 567）「A10 仅任命确认——`request.resolved` cardKind=appointment + `targetRoleIds`=选中（带 `source:"stage-a10"`/`workflowId`）⇒ `stage.completed A10`；**不**在 A10 发派实现请求」；§4.2 A11（line 568）「幕僚发 **A11 stage-request**（携选中角色）→ 运营派实现角色…A11 stage-request 创建 ⇒ `stage.dispatched A11`；所有选中角色实现任务 closed accepted + 分支有提交 + 依据未漂移 ⇒ `stage.completed A11`；A10 未 accepted 时发 A11 ⇒ `stage-transition-invalid`」；§4.4（line 658-659）`A6(accept)→A7→A8→A9→A10→A11` 与 `A10→A12a→A11→A12b→A13→closed`；§4.5（line 685-686）A10 完成于 `request.resolved`、A11 完成于实现任务 accepted；§11.1（line 1139-1140）A10→A11 顺序、A10 未完成发 A11 拒绝、A11 完成条件与 MF-10 正/负例测试。
- **复核结论**：原「A10 完成后再发 A10 stage-request（被 stage-transition-invalid 拒绝）」的矛盾已消除；A10=A 卡、A11=派实现 的边界清晰，完成条件与幂等键（`stage-request:<wf>:A11:<attempt>`）一致。**闭环**。
- **残留（G-1）**：§4.4 同时列出 `A10→A11`（主链）与 `A10→A12a→A11`；A11 前置只要求 A10 accepted，未要求 A12a 完成。设计 v2「实施前写标准」与「A12a 可先派」的组合需在 B1 钉住 A11 是否要求 A12a（建议 B1 以设计口径要求 criteria 先于实现派发，或明确轻量强度下的豁免与记录）。

### MF-10 幕僚派项目验收角色窄例外 — 闭环

- **v1.3 处置**：§3.1（line 304）fixed 矩阵新增「chief→项目验收角色（`workflow.reviewRoleId`，仅 `purpose=review`）允许」；§3.2（line 330-337）fixed 谓词算法 `target project && purpose==review && targetExists && targetRoleId==workflowView.reviewRoleId → allow`，其余 project ⇒ `chief-to-project-forbidden`；§3.6（line 468-469）Q6 证据第 5 条：roster 原文 `roles[].review===true`、basis `reviewRoleId` 一致、角色已 `role.activated`，否则拒绝；负例含非 reviewRoleId 项目角色、未标记 review 的角色；§5.4（line 805）`project-roster/v4` 可选 `roles[].review`（至多一个 true；v3 兼容；无标记⇒默认 verifier），A9 basis 记录 `reviewRoleId`；§7.4（line 985）fixed 矩阵视图含项目验收角色；§8.5（line 1027）A12 承接角色与窄例外；§9.2/§10.3 文档与接口评审；§11.1（line 1140）正/负例测试。
- **复核结论**：协调方决策 #2「名册有项目验收角色则优先」在 fixed 矩阵内可实现且 fail-closed；应用核验、不采信模型自报。**闭环**。
- **残留（G-9）**：`project-roster/v4` 复用既有 roster doc-format id 的“v3/v4 双字面量”兼容语义需在接口评审/团队计划钉住（§9.2 已声明不新增格式 id）。

### MF-11 B4 发布前置路径条件化 — 闭环

- **v1.3 处置**：§4.3 B4（line 626）前置「B3 accepted + 运营报告（MF-11：不要求 A12b）」；§6.4（line 882-886）公共前置 + A13 额外「A12b accepted + `docs/acceptance` 归档已写入」+ B4「不要求 A12b；B4 前置 = B3 accepted + 运营报告；默认不新增 B 路径独立核对阶段」；`release-workflow-not-ready` 附路径与缺失项；§11.1（line 1148）A13/B4 分支用例。
- **复核结论**：路径 B 不再被不存在的 A12b 阻塞，且未静默新增 B 路径验收阶段。**闭环**。

### MF-12 路径 B 仓库/分支准备 — 闭环

- **v1.3 处置**：§4.3 B1（line 623）前置「既有 Git 仓库（否则 `b-repository-required`），不自动 init」；§4.3「B 路径仓库/分支准备」（line 628-634）要求既有仓库、确保 `.gitignore` 托管块与 baseline commit、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、dirty 检查、`basis.recorded(reason:"path-b")` 记录 `repo{state,branch,baseOid,headOid?,ignorePolicy,gitignoreSha256}`，明确“只读”仅指文档快照；§5.2 item 6（line 763）B 路径最小准备；§5.5（line 817）失败码；§11.1（line 1149）path-b 测试。
- **复核结论**：B3 提交与 B4 发布的仓库/分支前置有明确来源且 fail-closed。**闭环**。
- **残留（G-2）**：B 路径分支「从当前 HEAD（不强制 main）」创建，而 B4 合并到 main——若 HEAD 非 main，`git merge --no-ff` 可能带入非 main 历史。建议 B1 钉住 base OID/diff stat 披露，或要求 HEAD==main / 限定合并范围。

---

## 四、MF-1…MF-8 保持闭环（v1.3 未回退）

- MF-1 双矩阵模式分离：§3.2 item 2 旧谓词/复合入口/`CHIEF_DISPATCHABLE_BUILT_INS`/`isConvenerBuiltInDispatchTarget` 保持原样；`routeStarDispatch` 逐字不改；legacy 断言逐字保留（§11.2）。
- MF-2 legacy 常量冻结：`CHIEF_HUB_DISPATCH.targetRoleIds` 五内置、`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds=["verifier"]` 不变；新增 fixed 目标集；legacy 消费点（apply-journal/trunk-runtime）读取源不变。
- MF-3 fixed `task.created`：`workflowId` 存在 ⇒ 豁免 runId/runState；无 workflowId 旧规则逐字保留（§7.1 伪代码）。
- MF-4 close/intent fixed：`close_created_task` v2（workflowService.closeTask，不触 trunk/CAS）；A3 `prepareIntent/finalizeIntent`（documentRefs 在 request.resolved 一次写入，G-15）；legacy 不动。
- MF-5 per-flow 模式：`workflowMode(projectRoot, flowId)`；project.json 仅默认/强制；混合项目按 flowId 解析；单活动 **fixed** workflow（G-7）。
- MF-6 `.gitignore` 托管块 + baseline commit；dirty 只算 tracked + 非忽略 untracked；A9/A11/A13 一致。
- MF-7 A12 验收角色 + 应用 `docs/acceptance/<flowId>-acceptance-vN.md` 归档（版本随 report 递增、幂等 `acceptance:<wf>:<reportSha>`、失败阻塞 A12，G-16）。
- MF-8 B3 writeSet = B2 scope.files ∩ roster 属主 ∩ 角色边界；无 roster 用 boundary；越界 fail-closed；§6.2/§6.3 交叉引用（G-18）。

---

## 五、协调方决策 #1–#8 落实核对（v1.3 已统一编号）

| # | 决策 | v1.3 落点 | 复核结论 |
| --- | --- | --- | --- |
| 1 | 流程门：v1.3 经独立复核确认 MF-9…MF-12 闭环后才可写 B1 | 头部状态、§12.3、记录 | ✓（本报告即执行该门；结论：闭环） |
| 2 | Q7/A12：验收角色（默认 verifier；roster review 项目角色优先）+ 应用 `docs/acceptance/<flowId>-acceptance-vN.md`；强度幕僚调节 | §4.2 A12、§8.5、§12.2 Q7 | ✓（窄例外 MF-10 已闭环） |
| 3 | Q4：path-b 只读快照、不产生写权、drift fail-closed | §4.3、§5.3、§7.1、§12.2 Q4 | ✓ |
| 4 | merge-main 不可 judge 代批；必须客户本人；judge 只作用于非高风险卡、只能转人工/拒绝；高风险清单不变 | §0.1/§0.2/§4.2 A13/§6.4/§7.3/§8.4/§9.2/§11.1/§12.2 | ✓ 全文残留=0（非判断卡；不进 `GOVERNANCE_CARD_GROUP`；`planJudge` 排除；仅客户本人） |
| 5 | Q1：默认不新增客户卡；仅高风险动作出卡 | §8.5、§12.2 Q1 | ✓ |
| 6 | Q2：优先复用；确需新工具 B1 钉接口/fail-closed/必要性；接口评审失败即不支持 | §0.2、§6.4、§10.3、§12.2 Q2 | ✓ |
| 7 | Q6：父门替代证据 fail-closed；负例 | §3.6、§11.1、§12.2 Q6 | ✓（含 review-role 负例） |
| 8 | 纪律：分支开发、不合并 main、不发布/tag、不请求客户放行；旧分支留历史 | 头部、§9.2、§10、§12.3 | ✓ |

---

## 六、G 观察项（残留；非阻塞）

1. **G-1 A12a 与 A11 的先后门**：§4.4（line 658-659）同时列 `A10→A11` 与 `A10→A12a→A11`；A11 前置仅 A10 accepted。设计 v2 要求「实施前写标准」，建议 B1 钉住 A11 stage-request 是否要求 A12a criteria 已完成（或轻量强度的豁免与记录）。
2. **G-2 B 路径分支基线**：§4.3 B 路径从「当前 HEAD（不强制 main）」建分支；B4 合并 main 可能带入非 main 历史。建议 B1 钉住 base OID/分支与 main 的 diff 披露，或要求 HEAD==main。
3. **G-3 stop 收口顺序措辞**：§3.3（line 399/409）与 §12.2（line 1212）为「先收口 open advance 请求 → 再发 stop 请求」；§4.4（line 670）写「发 stop → 记 stop-requested → 必须收口（否则 workflow.stop-unconfirmed）」。结果一致但失败码/检查点不同，建议统一叙述（以实现 §3.3 校验为准，§4.4 作为最终复核）。
4. **G-4 Appendix E 矩阵措辞**：附录 E（line 1373）`governance-roles.ts | keep + matrix 文案` 与 §7.4/§9.1「legacy 文案不改、fixed 视图在 routing builder」不完全一致（显示层，无行为影响）。
5. **G-5 分支规则交叉引用**：§6.1（line 838）「同名分支存在 ⇒ baseline-branch-exists」未带 §5.2 的“同 workflow 可复用自有分支”例外，建议交叉引用。
6. **G-6 首个 stage-request 幂等键**：§3.3 表（line 385）「首次可省略 workflowId（应用生成并回执）」，而幂等键（line 388）含 `<workflowId>`。建议明确首请求由应用计算键（模型可省略），或接受模型省略 idempotencyKey。
7. **G-7 `requestReleaseMerge` 条件化**：§3.4 chief fixed 表无条件列 `requestReleaseMerge`，而 Q2 为“优先复用、确需才新增”。建议按 Q2 结论条件化注入。
8. **G-8 promptGuidelines 的 fixed 文案**：§3.5 item 1 在全局 promptGuidelines 增「stage-request…stop 由运营执行停稳」等 fixed 特有文案，可能进入 legacy 会话提示（与 G-6 模式中立原则相抵）；建议仅由 fixed preamble/context 注入。
9. **G-9 `project-roster/v4` 兼容语义**：doc-format「复用 roster 条目、不新增格式 id」（§9.2）需明确 v3/v4 双字面量接受策略与旧解析器兼容；接口评审已列（§10.3）。
10. **G-10 A11 `stage.dispatched` 语义**：A11「stage-request 创建 ⇒ stage.dispatched」与 A1/A4/A7「生产任务创建 ⇒ stage.dispatched」的语义不完全一致（文档口径，无行为冲突）。
11. **G-11 混合项目并行风险**：legacy 在飞 flow 与 fixed workflow 共用同一工作区/工作树（§4.1 item 5 允许并存）；建议评估 legacy trunk 的 worktree/index 与 fixed 分支切换的相互影响，必要时要求 legacy flow 关闭后再开 fixed workflow（B1 可作风险登记）。
12. **G-12 启动计划提交引用**：v1.3 头部（line 9）写「90 行 / 10,820 bytes / `08450af1…`；提交 `4c344bd`」——`4c344bd` 的启动计划 hash 为 `6cfee9e6…`，当前 `08450af1…` 来自 `b870b15`（进展行更新）。hash/行数正确，仅提交引用需修正。

---

## 七、设计 v2 一致性与 B1 可写性

- 设计 v2 核心原则 1–7、§〇 角色权责、§一 基线 3 件小事、§二 A1–A13（含 A12a/A12b）、§三 B1–B4、§四 门/机制处置、§五 在研影响、§六 四个默认项（第 4 项按协调方决策 #4 收紧）、§七 非目标：v1.3 全部覆盖且未扩大客户口径。
- **B1 可写性：通过**。v1.3 无剩余 must-fix；B1 已同轮写入 `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（绑定设计 v2/v1.3/三轮复核/协调方决策/启动计划 hash；全部判据初始 `未取证`）。
- B1 钉住的残余项：G-1 A12a/A11 先后门；G-2 B 路径分支基线；G-3 stop 收口顺序；G-6 首请求幂等键；G-7 `requestReleaseMerge` 条件化；G-9 roster v4 兼容；Q3/Q5 实现细节；接口评审清单；known red 基线重取；legacy 断言逐字保留；真机预算/隔离；Q6 负例；merge-main 客户本人测试。

---

## 八、边界 / H1 / 非目标核对

- **H1=0 成立**：新增文件均在既有 directory 授权——`src/common/编排/`（编排）、`app/desktop/`（桌面窗口）、`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（门禁引擎目录）；编辑文件为 `src/model/runtime.ts`（运行时核心）、`src/model/role.ts`（门禁引擎）、`src/common/shared/config-loader.ts`（shared-code）、`src/provider/runtime/schema.ts|tools.ts`（运行时核心）、`src/common/roles/**`（六个角色 code 角色）、`src/common/编排/**`（编排）、`app/desktop/**`（桌面窗口）、`src/common/门禁引擎/**`（门禁引擎）。`src/common/gates/` 不改。
- **未新增角色**；未改五个内置角色与项目角色的边界模型；`project-roster/v4 roles[].review` 是文档 schema 可选字段，不是角色/边界模型变化；应用写 `docs/acceptance/` 为应用自有归档，不要求角色越界。
- **未新增客户可见门**：`merge-main` 为应用自有非判断高风险确认卡（与 `stable-write` 同类；不进 `GOVERNANCE_CARD_GROUP`；客户本人；judge 不可代批），客户卡仍为意图/方案/任命 3 张 + 按高风险动作出现的卡；高风险清单不变。
- **未扩大客户口径**：Q1/Q2/Q4/Q6/Q7 均经协调方书面决策确认；Q3/Q5 按方案（B1 钉住）。
- 本复核未写产品/测试代码、未改角色卡/边界、未改前两轮报告；只在 `角色卡/独立验收/docs/design/` 与本任务授权的 B1 路径写文件。

---

## 九、本轮 B1（同轮写入）

- B1 路径：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（任务精确范围授权；新文件）。
- B1 绑定：设计 v2 `b075829b…`；v1.3 `ae737dcf…`；复核 v1 `df1992df…`、v1.2 `259ecde7…`、v1.3 本报告（hash 见证据文件）；启动计划/协调方决策 `08450af1…`；启动计划 §七 #1–#8。
- B1 全部判据初始状态为 `未取证`；判定规则、T 矩阵、RR、EV、限制见 B1 正文。

---

## 十、限制与披露

- 本复核为只读清点 + 代码锚点抽查 + 文档比对；**未运行全量确定性测试**（555 个 `*.test.ts`），known red（version-change-integration 9 红、optional-acceptance 6/2/1/3/0、test/编排 22 fail/2 skip）按方案/近期验收口径引用，未独立复测。
- 未运行真实 Electron/真实模型；未验证 UI 卡片呈现、judge 实际行为、merge-main 卡呈现、真实 Git 合并语义、CI/发布状态。
- 代码锚点按 HEAD `67b728f`（代码与 `10f90c7` 一致）抽查；方案行号以 v1.3 文件为准，实施以符号名为准。
- 未访问仓库外贪吃蛇 target 与其 `.ans` 状态。
- 本报告与 B1 不构成实施授权或客户批准；B2 按 B1 全量判定。

---

## 十一、证据与未提交声明

- 证据目录：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.3_evidence/`（依据 hash/行数/字节实测、锚点抽查、残留检查记录、本报告与 B1 哈希）。
- 本报告路径：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.3.md`；自身行数/字节/SHA-256 见证据文件（不嵌入正文，避免自指）。
- **未提交声明**：本轮未 commit / push / merge / tag / 发布；未写产品/测试代码；未改角色卡/边界；未运行真实模型/Electron；未占用 9222/9223；未修改前两轮复核报告。
