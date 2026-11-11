# 独立复核报告（第二轮）：两条固定工作流路径——实现级方案 v1.2（2026-11-10）

- 角色：ANS 「独立验收」（独立固定上下文；只写本角色 Section 1）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 复核对象：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.2.md`（**v1.2；v1/v1.1 保留不改，不是本轮目标**）
- 分支：`feat/two-fixed-workflow-paths`；复核时 HEAD `b4c061a`（方案 v1.2 提交；相对方案清点基线 `10f90c7` 仅 docs 差异，代码无变化）
- 复核日期：2026-11-10
- 复核性质：**只复核方案**（不判实施、不写产品/测试代码、不改角色卡/边界、不提交/推送/合并）；未运行真实模型/Electron；未占用 9222/9223。
- **结论：需修订（剩余 must-fix 未闭环）**——MF-1…MF-8 已闭环；v1.2 新引入 **MF-9…MF-12 共 4 项 must-fix**，须闭环后方可进入 B1。

---

## 一、依据实测（写盘前实测；命令输出见 `..._v1.2_evidence/measurements.txt`）

| 依据 | 实测（行 / 字节 / SHA-256） | 与任务书一致 |
| --- | --- | --- |
| **v1.2（本轮唯一复核目标）** | **1,325 行 / 166,834 B / `e34e60fad8d97e00c517efd6ee564fd61146a66108a87cb2c8035cc8f46cfff9`** | 是 |
| 策划 v1.2 记录 | 72 行 / 10,030 B / `443c75ea7b140e12823d4955e37ab8d7a3aa4d324bb79f55327df2f7f9d77f70` | 是 |
| 启动计划（含协调方 §七） | 90 行 / 10,914 B / `6cfee9e61ceb2774d20e192b70086b40249f9f37bde4a462abb3229419029cf8`（提交 `4c344bd`） | 是 |
| 设计 v2（唯一产品依据） | 95 行 / 8,476 B / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` | 是 |
| 第一轮复核报告（must-fix 来源） | 222 行 / 32,535 B / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` | 是（本轮不改该文件） |
| 第一轮证据 | 117 行 / 10,708 B / `3abbb1b2bb4f1d2d216921e99cd16db476c420d122e61b8cc73cfeec5e1a453c` | 是 |
| v1（保留不改） | 1,110 行 / 122,470 B / `279f55dcbf86b07f60fad62be30606758cfcd666cac83411a521609fb1446aeb` | 是 |
| v1.1（复核闭环稿，保留不改） | 1,307 行 / 162,672 B / `045115160e4724bd1671bd38896469aa575d2c1143d7ea347fef5a43261715c1` | 是（文件存在且 hash 相符） |
| 前任清点（只读） | 86 行 / 12,447 B / `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` | 是 |
| 六份架构/契约设计 | 行数与 hash 与 v1.2 头部引用逐一相符（1,242/1,056/685/979/686/438 行；`24150207…`/`1f6518b8…`/`067e3d2e…`/`886fef84…`/`1477a6e4…`/`2bb663fe…`） | 是 |

代码基线核对：v1.2 全部关键锚点按 HEAD `b4c061a` 抽查通过（代码与 `10f90c7` 一致）：`workflow-preconditions.ts:1560-1566/1590-1645/1651/1674`；`task-state.ts:365-390`（run-required :377-380）；`run-manifest.ts:478/634`；`model/runtime.ts:1365-1405/1981-2018/2089/901-985`；`model/role.ts:245-330`；`role-tool-registry.ts:52-68`；`governance-roles.ts:138-218`；`classify-shell.ts:1046/1134/1551`；`jsonl-ledger.ts:31-33`（5 MiB × 3）；`run-role.ts:1094-1116/1625-1665/1759-1764/3065-3225`；`session.ts:8557/8912/8982-8994/9000-9008/9163-9183/3261/4359`；`apply-journal.ts:2938/3182/3267/3358/3445/3541/3714/3766-3771`；`trunk-runtime.ts:770/1186-1200`；`resolve-role.ts:341+`；verifier/convener/chief/rapporteur/nominator/product 模块 cards/写区/边界。`555` 个 `*.test.ts`、doc_format `54` 个格式 id 复核一致。

---

## 二、结论摘要

1. **MF-1…MF-8 全部闭环**（逐项核验见 §三）：双矩阵模式分离、legacy 常量冻结、task.created 豁免、close/intent fixed 实现、per-flow 模式、.gitignore/clean 语义、A12 验收角色 + 应用归档、B3 写集来源，均在 v1.2 正文给出可实现的实现级处置，且 legacy 断言逐字保留。
2. **协调方决策 #1–#7（v1.2 编号；对应启动计划 §七 #2–#8）全部落入正文**；`merge-main` 的 judge 代批残留 = 0（全文无“approval 组可代批/planJudge 纳入 merge-main”表述；非判断卡 + 客户本人 + judge 只能转人工/拒绝）。Q4 只读快照、Q1 不新增客户卡、Q2 优先复用/接口失败即不支持、Q6 fail-closed 均已写明。
3. **但 v1.2 新引入 4 项 must-fix**：
   - **MF-9**：A10 的“完成”与“随后 A10 stage-request”时序自相矛盾（阶段完成发生在请求之前，按 §3.3 转移校验会拒绝该请求）；
   - **MF-10**：coordinator 决策 #1 的“名册有项目验收角色则优先”与 fixed 矩阵“chief→项目角色拒绝”直接冲突，项目验收角色无法被幕僚派发；
   - **MF-11**：§6.4 发布前置无条件要求 `A12b`，但路径 B（B4）没有 A12b——B 路径无法发布；
   - **MF-12**：路径 B 无 A9，未定义任务分支/仓库准备——B3 提交与 B4 发布的分支前置无来源（path-b basis 明确只读）。

---

## 三、MF-1…MF-8 闭环核验（逐项）

| MF | v1.2 处置锚点 | 复核结论 | 证据/备注 |
| --- | --- | --- | --- |
| **MF-1** legacy 派发矩阵被全局重写破坏 | §3.1（双矩阵原则）、§3.2 item 2（旧谓词/复合入口/`CHIEF_DISPATCHABLE_BUILT_INS`/`isConvenerBuiltInDispatchTarget` 保持原样）、§3.2 item 3（新增 `evaluateFixedPathDispatchAuthorization` 仅 fixed 路由调用）、§3.2 会话层（`routeStarDispatch` 逐字不改）、§11.1/§11.2（legacy 断言逐字保留） | **闭环** | [事实] `evaluateDispatchAuthorization`（workflow-preconditions.ts:1590）与 `routeStarDispatch`（session.ts:8912，:8982 调用旧谓词）是 legacy 现网路径；v1.2 明确不重写、不替换，fixed 使用独立谓词；`RoleDispatchPolicyInput.matrix` 缺省 `legacy-v1`，旧调用点零变化。旧测试（star-routing/i-full-chain/workflow-preconditions/roles 差分）不改 |
| **MF-2** 角色模块常量被 legacy trunk 消费 | §3.2 item 4（`CHIEF_HUB_DISPATCH.targetRoleIds` 保持五内置、`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds` 保持 `["verifier"]`；新增 `fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`；legacy 消费点不改读取源）、§3.4（legacy 列冻结、fixed 列新增）、§6.5/附录 E | **闭环** | [事实] legacy 消费点 `apply-journal.ts:3766-3771`、`trunk-runtime.ts:1186-1200` 继续读旧字段；新 fixed 字段不影响旧值。仅新增模块导出字段需接口评审登记（G-5） |
| **MF-3** fixed `task.created` 被 run-required 拒绝 | §2.2（明确现有 run-required 规则）、§7.1 fixed 校验规则（workflowId 存在 ⇒ 豁免 runId/runState；无 workflowId 时旧规则逐字保留）、附录 E（task-state keep + fixed 豁免）、§10 批次 B0 | **闭环** | [事实] `appendTaskEvent`（task-state.ts:377-380）是阻断点；v1.2 给出精确分支与 replay/收口/幂等同步要求；B0 落点明确 |
| **MF-4** close/意图确认仍绑 trunk | §3.5 item 7（close_created_task v2；fixed 用 `workflowService.closeTask`；intent 用 `workflowService.prepareIntent/finalizeIntent`）、§4.2 A3 fixed 意图确认与 close v2 实现、§7.2、附录 E | **闭环** | 与 [事实] 现有链路对齐：close 现走 `trunk-runtime.ts:770 → apply-journal.ts:3182`（runId/basisDigest/reportRef 必填）；intent 现走 run-role :1625-1665 → `apply-journal.ts:3445/3541`；v1.2 为 fixed 给出不触 trunk/CAS/doc-freeze 的替代实现，legacy 分支不动 |
| **MF-5** 模式粒度矛盾 | §3.2 会话层/§3.6（`workflowMode(projectRoot, flowId)`；run-role `workflowModeForFlow` 回调，不缓存项目级单值）、§4.1（per-flow 判定/混合项目）、§9.4、§11.1（混合项目测试） | **闭环** | project.json `workflowSchema` 仅默认/强制值；活动 legacy run 的 flow⇒legacy、新 flow⇒fixed；混合项目按 flowId 解析 |
| **MF-6** 「Git 只装代码」与 dirty/clean 冲突 | §5.2 item 3（`.gitignore` ans-managed 块 + baseline commit）、§5.2 item 4（dirty = tracked 修改/删除 + 非忽略 untracked；治理文档/`.ans` 等被 ignore 不计）、§5.5、§6.1、§6.4、§11.1 | **闭环** | 治理文档不再进入 dirty 判定；A9/A11/A13 语义一致；`.gitignore` hash 入 basis 并在发布前复核 |
| **MF-7** A12 产出/角色偏离设计 v2 | §4.2 A12（A12a/A12b；验收角色默认内置 verifier、名册有项目验收角色则优先；应用生成 `docs/acceptance/<flowId>-acceptance-vN.md` 归档）、§8.5、§12.2 Q7（协调方决策 #1 已确认） | **闭环（口径）** | 设计 v2 A12 `docs/acceptance/*` 由应用归档满足；角色写区不变（H1=0）。**但“项目验收角色优先”分支的实现被 fixed 矩阵禁止 → 见 MF-10** |
| **MF-8** B3 写集无来源 | §4.3 B2/B3 与「B3 写集来源」段（scope.files ∩ roster 属主 ∩ 角色边界；无 roster 用 boundary；越界 fail-closed；治理文档不进实现写集）、§6.3 item 3、§7.1 `change.scope-decided.effectiveWritesets`、§11.1 | **闭环** | 明确修正 v1 §6.3「无团队计划即拒绝」的字面规则 |

**MF 结论：MF-1…MF-8 全部闭环，无残留必须修复项。**

---

## 四、剩余 Must-fix（v1.2 新引入；须闭环后方可进入 B1）

### MF-9 A10 阶段完成与 A10 stage-request 的时序自相矛盾（高）

- **方案锚点**：§4.2 A10 完成条件（line 527）「先卡后请求（G-3）：A9 完成后 chief 呈任命卡；`request.resolved` …；**随后 chief 发 A10 stage-request（携选中角色）**，运营再派实现」；§4.5 A10 行（line 635）「`request.resolved` appointment … → `stage.completed`；**随后 A10 stage-request 派实现**」；§3.3 步骤 3（line 362）「有活动 workflow（advance）⇒ 校验 `stage` 是当前阶段的合法下一阶段…非法 ⇒ `stage-transition-invalid`（不创建任务）」；§4.4 转移（line 610）`A9→A10→A11`。
- **问题**：同一个 A10 被定义成“在 `request.resolved` 时 `stage.completed`”，又定义成“随后再发 A10 stage-request”。按方案自己的转移校验，A10 已完成后再请求 A10 不是“合法下一阶段”（下一阶段是 A11），该请求会被 `stage-transition-invalid` 拒绝；而“先卡后请求”又禁止在卡前发 A10 请求。两条规则不能同时成立。
- **必须的修改**：二选一并写进 §4.2/§4.4/§4.5/§11：
  - (a) A10 在卡裁定完成；卡后由 chief 发 **A11 stage-request**（stage=A11，「派实现」），A11 完成于实现任务创建/收口——需同步 A11 行、转移表与幂等键；或
  - (b) 保持「A10 = 派实现」：A10 完成条件改为“卡 resolved（前置）+ 实现任务创建（完成）”（与 A1/A4/A7 的 dispatch-complete 语义一致），A10 stage-request 在卡后发送。
  - 并补 A10/A11 顺序与非法转移负例测试。
- **影响**：不修则 A10/A11 的阶段判定不可实现/自相矛盾，B1 无法写出一致的 AC；实现会按方案自身规则 fail-closed。

### MF-10 「名册项目验收角色优先」被 fixed 矩阵禁止（高）

- **方案锚点**：§3.1 fixed 矩阵（line 274）「chief 幕僚 → 项目角色 → **拒绝** `chief-to-project-forbidden`」；§3.2 fixed 谓词（line 298）`target project → chief-to-project-forbidden`；§4.2 A12（line 529）与 §8.5（line 970）「**名册有项目验收角色则优先**（由 chief 在任务文本与目标 id 指定）」；§12.2 Q7（协调方决策 #1 已确认）。
- **问题**：若名册含项目验收角色，A12 要求 chief 派发该角色；但 fixed 矩阵明确禁止 chief→任何项目角色。该优先分支无法实现，协调方决策 #1 的“项目验收角色优先”落空。
- **必须的修改**：在 fixed 谓词/矩阵中增加**窄例外**：`from==chief && targetKind==project && purpose==review && targetRoleId==该 workflow 的 roster 验收角色` ⇒ 允许；否则仍 `chief-to-project-forbidden`。验收角色来源须由 roster/basis/A12 任务绑定并由应用核验（不采信模型自报），并补正/负例测试（名册验收角色允许；随机项目角色拒绝）。同步 §3.1/§3.2/§8.5/§11.1。
- **影响**：不修则 A12 的“项目验收角色优先”不可实现；B1 的 A12 AC 与协调方决策 #1 不一致。

### MF-11 B4 发布前置错误要求 A12b（高）

- **方案锚点**：§6.4 校验（line 829）「workflow 处于 A13/B4；A11/B3 实现任务均 accepted；**A12b 验收 accepted**；运营最终报告在案；…」；§4.3 B4（line 586）前置仅为 `B3 accepted`；设计 v2 §三 B1–B4 无验收阶段。
- **问题**：路径 B 不存在 A12b；按 §6.4 字面，B4 合并永远缺 `A12b` 前置 ⇒ 路径 B 无法发布。这与设计 v2 的 B 路径定义（B4 汇总/交付/发布）冲突。
- **必须的修改**：把发布前置按路径条件化：A13 ⇒ A12b accepted + `docs/acceptance` 归档；B4 ⇒ B3 accepted + 运营报告（如 B 路径需要独立核对，须显式新增阶段并经设计/客户确认，不在默认路径）。同步 §4.3/§6.4/§11.1 与 `release-workflow-not-ready` 判定。
- **影响**：不修则 B 路径交付不可发布；B1 的 B4 AC 错误。

### MF-12 路径 B 的任务分支/仓库准备未定义（高）

- **方案锚点**：§4.3 B1 前置（line 599）「B1 前若无 basis … 自动记录一次**只读文档快照** `basis.recorded(reason:"path-b")` …**不 git init**、不写团队计划、不弹卡」；§6.1（line 785）「任务分支：`ans/task/<workflowId>` … **A9 基线创建/切换**；实现角色只 `git add/commit`」；§4.3 B3（line 585）「任务分支提交」；§6.3/§6.4 分支/clean 前置。
- **问题**：路径 B 不经过 A9，方案没有任何步骤为 B3 创建 `ans/task/<workflowId>`（对无 Git 的既有项目也没有仓库准备）；而 B3 的提交门禁与 B4 的发布校验都以“当前分支=任务分支”为前提。path-b basis 明确是只读快照，不能承担分支创建。
- **必须的修改**：定义 B 路径的仓库/分支准备（可与 A9 分离的最小步骤）：例如在 B1/B3 派发时由应用通过 `WorkflowGitPort` 确保仓库存在（无仓库 ⇒ `b-repository-required`/最小 `git init` 二选一并写明）并从当前 HEAD 创建 `ans/task/<workflowId>`，repo/branch/tip 记入 `basis.recorded(reason:"path-b")` 的 `repo` 字段（“只读”仅指文档快照，不指分支准备）；或明确 B 路径要求既有 Git 仓库并 fail-closed，同时规定 B 路径的提交目标分支。同步 §4.3/§5.2/§6.1/§11.1 与测试（B 路径无仓库/分支创建/越界）。
- **影响**：不修则 B3 无法提交、B4 无法合并；路径 B 整体不可实现。

---

## 五、协调方决策 #1–#7 落实核对

> 编号说明：v1.2 正文/记录使用 **#1–#7**（Q7/A12、Q4、merge-main、Q1、Q2、Q6、纪律）；启动计划 §七使用 **#2–#8**（其 #1 是“先复核后 B1”的流程项）。内容一一对应，但跨文档引用存在编号错位（见 G-1）。

| v1.2 # | 决策内容 | v1.2 落实点 | 复核结论 |
| --- | --- | --- | --- |
| —（启动计划 #1） | v1.2 必须经独立复核确认 MF 闭环后才可写 B1 | 头部状态、§12.3、记录 §一 | ✓ 已写入；本报告即执行该门 |
| #1 | Q7/A12：验收角色（默认 verifier；名册项目验收角色优先）+ 应用生成 `docs/acceptance/<flowId>-acceptance-vN.md`；强度幕僚调节 | §4.2 A12（A12a/A12b）、§8.5、§12.2 Q7 | **内容已落入；但“项目验收角色优先”分支被 fixed 矩阵禁止（MF-10）** |
| #2 | Q4 路径 B 自动只读快照 `reason:"path-b"`；只读、不产生写权；drift fail-closed | §4.3 B1 前置、§5.3、§7.1、§12.2 Q4 | ✓ |
| #3 | merge-main 不可 judge 代批；必须客户本人；judge 只作用于非高风险卡；judge 只能转人工/拒绝；高风险清单不变 | §0.1/§0.2/§4.2 A13/§6.4/§7.3/§8.4/§9.2/§11.1/§12.1/§12.2 | ✓ 全文残留检查：无“approval 组/可代批/planJudge 纳入 merge-main”表述；`merge-main` 进 `GOVERNANCE_APP_OWNED_CARD_KINDS`（非判断卡），`GOVERNANCE_CARD_GROUP` 不加，`governanceCardGroup("merge-main")===undefined`；`planJudge` 排除；仅客户本人 |
| #4 | Q1：默认不新增客户卡；仅高风险动作出卡 | §8.5、§12.2 Q1 | ✓ |
| #5 | Q2：优先复用既有能力；确需新工具须 B1 钉接口/fail-closed/必要性；接口评审失败即不支持，不得强推 | §0.2、§6.4、§10.3、§12.2 Q2 | ✓（具体复用点留 B1 钉住） |
| #6 | Q6：父门替代证据 fail-closed；缺失/不匹配即拒绝；负例测试 | §3.6（live-turn + assigned-task + identity/target + 幂等；负例清单）、§11.1、§12.2 Q6 | ✓ |
| #7 | 纪律：分支开发、不合并 main、不发布/tag、不请求客户放行；旧分支留历史 | 头部、§9.2、§10、§12.3 | ✓ |

---

## 六、G 观察项（残留；非阻塞）

1. **G-1 决策编号错位**：v1.2/记录用 #1–#7，启动计划 §七用 #1–#8（含流程项）；正文「协调方决策 #3/#4/#5/#6」与启动计划编号相差 1。建议正文改引决策文本或注明映射，避免 B1 引用歧义。
2. **G-2 `cardKindsOf(roleId, matrix)` 与 `fixedCards` 不一致**：§3.7（line 454）说 fixed「过滤 legacy 卡种…proposal 仅 chief、appointment 仅 chief」，但 chief 的 legacy `cards=["intent-confirm"]` 并不含 proposal/appointment，过滤无法“新增”；§3.4 已引入 `fixedCards`。实现应按模块 `fixedCards`（新字段）取 fixed 白名单，`cardKindsOf` 文案需统一。
3. **G-3 nominator `fixedCards` 自相矛盾**：§3.4（line 395）`fixedCards=["appointment-write"]` 却又注「appointment-write 仅 legacy；fixed 抑制」；应为空集或写明抑制机制。
4. **G-4 `BUILT_IN_ROLE_MATRIX` 口径冲突**：§7.4（line 928）说更新 chief/convener/… 的 duty/mainChain/dispatchScope 文案；§3.4（line 401）/§9.1/附录 E 说 legacy 文案不改、fixed 视图在 `routing.ts`。以 legacy 冻结为准，§7.4 需改为“fixed 路由视图，legacy 矩阵不动”。
5. **G-5 新模块导出字段未列入接口评审清单**：`fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget` 是模块公开新增面；§10.3 的接口评审清单未列（只列 DispatchMatrixMode/RoleDispatchPurpose/context matrix）。建议登记，避免“不新增用例”绕过契约评审。
6. **G-6 schema 文案是全局的**：§3.5 对 dispatch_task/request_choice/request_confirmation 的“fixed 文案改为…”会改变 legacy 会话的提示文本（与 legacy 逐字保留口径相抵）；`close_created_task` 全局可选字段也会弱化 legacy 的 schema 级 fail-closed（handler 仍拒）。建议改为模式中立措辞或按模式注入（若工具面支持），并在 B1 记录。
7. **G-7 混合项目与单活动 workflow 口径**：§4.1 item 3 允许 legacy 在飞 flow 与新 fixed flow 并存；item 5 说“每项目同时至多一个活动 workflow（跨 flow 也串行）”。需说明“活动 workflow”是否仅指 fixed workflows，否则两条规则冲突（混合项目测试用例需据此钉住）。
8. **G-8 分支重试死锁**：`workflowId` 派生不含 attempt；A9 失败后用新 operationId 重试同一 workflow 会再次得到同名 `ans/task/<workflowId>`，被 `baseline-branch-exists` 永久拒绝。建议允许同一 workflow 复用其自有分支（校验分支归属）或把 attempt 纳入分支名。
9. **G-9 `git init` 初始分支不确定**：§5.2 未指定 `git init -b main`/symbolic-ref；在“main unborn”场景，baseline commit 可能落在环境默认分支（master/main），与“确保 main 存在”的确定性冲突。建议写死初始分支。
10. **G-10 stop 未定义对 open advance 请求的收口**：stop 执行口径（§3.3/§4.4）让运营关闭 open 生产任务，但 chief 创建的当前 open **advance stage-request** 的收口未写；`workflow.closed stopped` 后该请求悬挂。建议补 chief 收口/应用代收的来源与幂等。
11. **G-11 A12a/A12b 的 stage 事件来源**：A12a/A12b 是 chief→verifier（或项目验收角色）直派，不是 chief→convener stage-request；其 `stage.requested/dispatched` 由什么事件驱动（建议 task.created(to=验收角色, stage=A12a/A12b)）未写明。
12. **G-12 首个 stage-request 的标识**：§3.3 首次 advance 的 dispatch_task 幂等键为 `stage-start:<flowId>:<path>:<stage>:<attempt>`，§7.1 `stage.requested` 事件幂等键为 `stage-request:<wf>:<stage>:<attempt>`（两套键）；且首次请求时 chief 无任务，`sourceTaskId` 的来源（客户消息/轮次 id）未定义。建议统一并写明。
13. **G-13 W1 写集与 owner 不一致**：§10.1 W1 写集含 `src/common/编排/task-state.ts`（编排属主），但 owner 列为「运行时核心 + shared-code + 门禁引擎」，缺编排；团队计划阶段需纠正为单一 owner。
14. **G-14 §4.3 B1 前置仍写“无活动同 flow workflow”**：与 §4.1 item 5 的项目级单活动 workflow（跨 flow 串行）不一致，应统一。
15. **G-15 `request.resolved.documentRefs` 写入时机**：§3.7 说裁决后写入 `request.resolved`；§4.2 A3 `finalizeIntent` 说“追加 `request.resolved.documentRefs`”。事件只追加，需明确 documentRefs 在裁决事件写入、finalize 只校验 + 写 `stage.completed A3`，或定义独立事件。
16. **G-16 A12 acceptance 归档的幂等/版本**：rework 后归档是否出新 vN、归档写入失败是否阻塞 A12（§4.5 说归档写入是完成条件）需在 B1 钉住。
17. **G-17 `reworkOf` 值域**：§3.3 示例 `A12→A11` 使用 `reworkOf:"A12"`，但失败列写 `reworkOf:"A12"` 而转移表是 `A12b(rework)`；建议统一为具体子阶段或父阶段并写清。
18. **G-18 §6.2 writeset 括号只提团队计划**：`matchTaskGit` 的 writeSet 来源只写“团队计划 writesets ∩ 模块属主”，B 路径来源在 §6.3；建议交叉引用，避免实现只支持 A 路径。

---

## 七、Qs/默认项处置与 B1 残余项

### 7.1 设计 v2 §六默认项与方案 Qs

| 项 | v1.2 处置 | 复核意见 |
| --- | --- | --- |
| 设计默认 1/2 | 基线失败只回报；路径 B 幕僚判断 | 接受 |
| 设计默认 3 | stop 请求由运营执行（§3.3/§4.4） | 接受方向；见 G-10 |
| 设计默认 4 | 合并 main 必须客户本人；judge 不可代批（协调方收紧） | 接受，与决策 #3 一致 |
| Q1 | 固定路径不发 acceptance 卡；应用归档 `docs/acceptance` | 接受（协调方已确认） |
| Q2 | 优先复用既有能力；新工具须 B1 钉接口，评审失败即不支持 | 接受（协调方已确认；具体复用点留 B1） |
| Q3 | 写任务串行 + 每项目单活动 workflow | 接受（实现细节 B1 钉住；见 G-7） |
| Q4 | path-b 只读快照、不产生写权、drift fail-closed | 接受（协调方已确认） |
| Q5 | 只本地合并；push/tag 另授权 | 接受 |
| Q6 | 父门替代证据 fail-closed | 接受（协调方已确认；B1 须验收负例） |
| Q7 | A12 验收角色 + 应用归档 | 接受口径（协调方已确认）；但项目验收角色分支受 MF-10 阻塞 |

### 7.2 若 MF-9…MF-12 闭环，B1 必须钉住的残余项

1. **Q3/Q5 实现细节**：串行写任务与“每项目单活动 workflow”的范围（见 G-7）；合并仅本地、push/tag 人工授权。
2. **接口评审清单**：`RoleToolId`（若确需 `requestReleaseMerge`；否则记录“复用既有能力”的结论与理由）、`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`、`BuiltInRoleModule.context({matrix})`、`GovernanceCardKind`/`AppOwnedGovernanceCardKind` + `merge-main`、`task.created` 新字段、`dispatch_task` 新字段、`close_created_task` v2、`activate_role_documents` v2、模块新增导出字段（G-5）。评审失败即不支持，不得强推。
3. **known red 基线**：实施时重取（version-change-integration 9 红、optional-acceptance 6/2/1/3/0、`test/编排/**` 22 fail/2 skip 为参照）；同名用例不得恶化、新增确定性失败=0、新 skip=0；不改 `optional-acceptance.test.ts`。
4. **legacy 断言逐字保留**：star-routing/i-full-chain/workflow-preconditions/roles 差分/convener-module-consumption；fixed 用新增测试文件；`role-module-contract` 14→15 仅在新增工具时同步。
5. **真机全链**：隔离空项目、真实 Electron+模型、预算另报、失败即停、不占用 9222/9223。
6. **A12/A12a/A12b**：criteria/report 的 stage 事件来源（G-11）、验收归档的版本/幂等（G-16）、项目验收角色派发例外（MF-10 修复后）测试。
7. **B 路径**：仓库/分支准备（MF-12 修复后）、B3 写集派生与越界负例、B4 发布前置（MF-11 修复后）。
8. **merge-main**：仅客户本人（judge 不可代批）测试、非判断卡/账本 cardKind 白名单测试、preview 必含字段与 basis/分支漂移拒绝测试。
9. **dirty/ignore**：`.gitignore` 托管块、baseline commit、A9/A11/A13 一致、分支重试策略（G-8）。
10. **Q6 负例**：伪造 taskId/错误 creator/已关闭/停止任务/过期轮次/session 重启/fenced run/目标不存在/自派。

---

## 八、边界 / H1 / 非目标核对

- **H1=0 仍成立**：新增文件均落在既有 directory 授权——`src/common/编排/`（workflow-state/workflow-service/workflow-dispatch/basis-guard；编排）、`app/desktop/`（workflow.ts/workflow-git.ts；桌面窗口）、`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（门禁引擎目录）；编辑文件为 `src/model/runtime.ts`（运行时核心）、`src/model/role.ts`（门禁引擎）、`src/common/shared/config-loader.ts`（shared-code）、`src/provider/runtime/schema.ts|tools.ts`（运行时核心）、`src/common/roles/**`（六个角色 code 角色）、`src/common/编排/**`（编排）、`app/desktop/**`（桌面窗口）、`src/common/门禁引擎/**`（门禁引擎）。`src/common/gates/` 不改。
- **未新增角色**；未改五个内置角色与项目角色的边界模型；未新增客户可见门（`merge-main` 为应用自有非判断高风险确认卡，与 `stable-write` 同类；客户卡仍为意图/方案/任命 3 张 + 按高风险动作出现的卡）。
- **未扩大客户口径**：A12 应用归档、Q4 path-b 只读、Q1 不新增卡、Q6 fail-closed 均经协调方书面决策确认；未新增 B1 前未确认的口径（MF-9…MF-12 是内部一致性问题，不是客户口径变更）。
- **本复核未写产品/测试代码、未改角色卡/边界、未改一轮报告**；只在 `角色卡/独立验收/docs/design/` 写本轮报告与证据。

---

## 九、限制与披露

- 本复核为只读清点 + 代码锚点抽查 + 文档比对；**未运行全量确定性测试**（555 个 `*.test.ts`），known red 数字按方案/近期验收口径引用，未独立复测。
- 未运行真实 Electron/真实模型；未验证 UI 卡片呈现、judge 实际行为、merge-main 卡呈现、真实 Git 合并语义、CI/发布状态。
- 代码锚点按 HEAD `b4c061a`（代码与 `10f90c7` 一致）抽查；方案行号以 v1.2 文件为准，实施以符号名为准。
- 未访问仓库外贪吃蛇 target 与其 `.ans` 状态。
- 本报告不构成实施授权、验收或批准；不替代 B1/B2。

---

## 十、证据与未提交声明

- 证据目录：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.2_evidence/`（依据 hash/行数/字节实测、锚点抽查、残留检查记录）。
- 本报告路径：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.2.md`；报告自身行数/字节/SHA-256 在写盘后实测并登记于证据文件（不嵌入正文，避免自指）。
- **未提交声明**：本轮未 commit / push / merge / tag / 发布；未写产品/测试代码；未改角色卡/边界；未运行真实模型/Electron；未占用 9222/9223；未修改第一轮复核报告（`df1992df…`）。

---

## 附录 A：v1.2 逐项复核抽查记录（摘要）

- **merge-main/judge 残留检查**：`grep -n "merge-main|judge"` 全量核对；所有条目均为“非判断卡/客户本人/judge 不可代批/转人工或拒绝”，无“approval 组可代批/planJudge 纳入”残留。与 `GOVERNANCE_CARD_GROUP`（model/runtime.ts:944-985）现状一致：新增到 `AppOwnedGovernanceCardKind`/`GOVERNANCE_APP_OWNED_CARD_KINDS` 即派生进账本白名单且 `governanceCardGroup("merge-main")===undefined`；`planJudge`（customer-input.ts:1320-1345）对无组卡种直接返回不判断。
- **legacy 常量冻结**：`CHIEF_HUB_DISPATCH.targetRoleIds`（chief/internal/dispatch.ts:54-60，五内置）与 `CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds`（convener/index.ts:191-198，`["verifier"]`）v1.2 均不改；新 fixed 字段仅新增；legacy 消费点 `apply-journal.ts:3766-3771`、`trunk-runtime.ts:1186-1200` 读取源不变。
- **task-state**：`appendTaskEvent`（task-state.ts:365-390）run-required 规则 :377-380；v1.2 §7.1 给出 fixed 分支伪代码与旧规则保留。
- **close/intent**：`close_created_task` legacy 链 `trunk-runtime.ts:770 → apply-journal.ts:3182`；intent legacy 链 run-role.ts:1625-1665 → `apply-journal.ts:3445/3541`；v1.2 fixed 替代实现明确不触 trunk/CAS/doc-freeze。
- **A12 写区**：verifier 边界 `docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（verifier/index.ts:57-88）；独立验收角色 Section 1 仅 `角色卡/独立验收/docs/**`（boundary.md）。v1.2 由应用写 `docs/acceptance/`，不改角色边界（H1=0）。
- **设计 v2 一致性**：A12 `docs/acceptance/*` 由应用归档满足；3 卡不合并；高风险清单不变；非目标（不新增角色/门/边界模型）保持。
