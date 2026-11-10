# 角色记录：两条固定工作流路径实现级方案 v1.3（业务策划 rapporteur，2026-11-10）

- 角色：ANS 内置角色「策划」（业务策划 `rapporteur`，独立固定上下文；**不是** `rapporteur-code`）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 分支：`feat/two-fixed-workflow-paths`（worktree `.claude/worktrees/trunk-amendment`；**代码基线** `10f90c7`，当前 HEAD `b870b15`（复核/协调方 docs 提交，代码无差异）；基于 `origin/main` `d9e3e99`）
- 状态：**v1.3 已产出**（在 v1.2 基础上闭环第二轮复核 MF-9…MF-12，并统一协调方决策编号 #1–#8）；v1/v1.1/v1.2 保留不改。**v1.3 必须经独立复核确认 MF-9…MF-12 全部闭环后才可写 B1；未闭环不进入 B1/实施**。本轮未实施、未测试、未验收、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- 写区：本记录在 `docs/governance/rapporteur/`；方案在 `docs/proposals/`。未写 `docs/planning/**`、`src/**`、`app/**`、`test/**`、`角色卡/**`、其他角色文档、`main`。

## 一、依据/版本实测（写盘后）

| 依据/版本 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 / 8,476 / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 第一轮复核（MF-1…MF-8） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md` | 222 / 32,535 / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` |
| 第一轮证据 | `..._evidence/measurements.txt` | 117 / 10,708 / `3abbb1b2bb4f1d2d216921e99cd16db476c420d122e61b8cc73cfeec5e1a453c` |
| **第二轮复核（MF-9…MF-12）** | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.2.md` | 202 / 30,200 / `259ecde7aad44550e29c2d018bc452d619ce3942b57625c4bfe9e5e66b93ecd1` |
| 第二轮证据 | `..._v1.2_evidence/measurements.txt` | 96 / 11,254 / `ab027f774a421658ae32168b3d3f194a7dc46af9482deda6be222b7141f532d5` |
| 启动计划（含协调方 §七 #1–#8） | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 90 / 10,820 / `08450af1b6be0cf893bea81cd73f73c990551b89c499430fd5a60d3c6cbbc215` |
| 前任清点（只读） | `角色卡/rapporteur-code/docs/design/2026-11-10_impl_two-fixed-workflow-paths.md` | 86 / 12,447 / `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` |
| v1（保留不改） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md` | 1,110 / 122,470 / `279f55dcbf86b07f60fad62be30606758cfcd666cac83411a521609fb1446aeb` |
| v1.1（保留不改） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.1.md` | 1,307 / 162,672 / `045115160e4724bd1671bd38896469aa575d2c1143d7ea347fef5a43261715c1` |
| v1.2（保留不改） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.2.md` | 1,325 / 166,834 / `e34e60fad8d97e00c517efd6ee564fd61146a66108a87cb2c8035cc8f46cfff9` |
| **v1.3（本版）** | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | **1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8`** |

## 二、第二轮 must-fix 闭环（MF-9…MF-12）

| MF | 复核问题 | v1.3 处置 | 落点 |
| --- | --- | --- | --- |
| **MF-9** | A10 在卡裁定即完成，却又要求随后发 A10 stage-request，按合法转移会被拒 | **采用方案 (a)**：A10 仅任命确认（`request.resolved` 完成）；卡后 chief 发 **A11 stage-request**（派实现）；A11 完成于实现任务创建/全部收口；同步 A10/A11 行、转移表、完成表、幂等键（`stage-request:<wf>:A11:<attempt>`）与负例测试（A10 未完成发 A11 ⇒ `stage-transition-invalid`） | §4.2 A10/A11、§4.4、§4.5、§11.1 |
| **MF-10** | “名册项目验收角色优先”被 fixed 矩阵 chief→项目角色禁止 | fixed 谓词增加**窄例外**：`from==chief && targetKind==project && purpose==review && targetRoleId==workflow.reviewRoleId` ⇒ 允许；其余 project 仍 `chief-to-project-forbidden`。`project-roster/v4` 增加可选 `roles[].review`（至多一个 true；v3 兼容）确定验收角色；A9 basis 记录 `reviewRoleId`；应用从 roster/basis/A12 绑定核验，不采信模型自报；正/负例测试 | §3.1、§3.2、§4.2 A12、§5.4、§8.5、§11.1、§10.3 |
| **MF-11** | 发布前置无条件要求 A12b，B4 无 A12b 无法发布 | 发布前置按路径条件化：A13 ⇒ A12b accepted + `docs/acceptance` 归档；B4 ⇒ B3 accepted + 运营报告（默认不新增 B 路径独立核对阶段）；`release-workflow-not-ready` 按路径判定 | §4.3 B4、§6.4、§11.1 |
| **MF-12** | 路径 B 无 A9，任务分支/仓库准备未定义 | **采用方案 (ii)**：B1 前置要求既有 Git 仓库（无仓库 ⇒ `b-repository-required`，不自动 init）；存在则应用确保 ANS `.gitignore` 块、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、dirty 检查，并记录 `repo` 到 `basis.recorded(reason:"path-b")`；“只读”仅指文档快照，不指分支准备；B3 提交/B4 发布使用该分支；测试覆盖无仓库/分支创建/越界 | §4.3 B1/B3/B4、§5.2、§6.1、§11.1 |

**第一轮 MF-1…MF-8**：v1.1/v1.2 闭环保留（双矩阵、legacy 常量冻结、task-state 豁免、close/intent fixed、per-flow、gitignore/clean、A12 角色+归档、B3 写集）；v1.3 未回退。

## 三、协调方决策 #1–#8（v1.3 统一编号；G-1）

| # | 决策 | v1.3 落点 |
| --- | --- | --- |
| 1 | 流程门：v1.3 必须经独立复核确认 MF-9…MF-12 闭环后才可写 B1 | 头部状态、§12.3、本记录 |
| 2 | Q7/A12：验收角色（默认 verifier；roster review 项目角色优先）+ 应用 `docs/acceptance/<flowId>-acceptance-vN.md`；强度幕僚调节 | §4.2 A12、§8.5、§12.2 Q7 |
| 3 | Q4：路径 B 自动只读快照 `basis.recorded reason:"path-b"`；只读、不产生写权；drift fail-closed | §4.3、§5.3、§7.1、§12.2 Q4 |
| 4 | merge-main 不可 judge 代批；必须客户本人；judge 只作用于非高风险卡，只能转人工/拒绝，不得冒充客户；高风险清单不变 | §0.1/§0.2/§4.2 A13/§6.4/§7.3/§8.4/§9.2/§11.1/§12.2 |
| 5 | Q1：默认不新增客户卡；仅高风险动作出卡 | §8.5、§12.2 Q1 |
| 6 | Q2：优先复用既有能力；确需新工具须 B1 钉接口/fail-closed/必要性；接口评审失败即不支持 | §0.2、§6.4、§10.3、§12.2 Q2 |
| 7 | Q6：父门替代证据 fail-closed；缺失/不匹配即拒绝；负例测试 | §3.6、§11.1、§12.2 Q6 |
| 8 | 纪律：分支开发、不合并 main、不发布/tag、不请求客户放行；旧分支停用留历史 | 头部、§9.2、§10、§12.3 |

> 编号映射：v1.2 正文/记录使用 #1–#7（Q7/A12、Q4、merge-main、Q1、Q2、Q6、纪律）；启动计划 §七 #2–#8 与之一一对应（#1 为流程门）。v1.3 起统一采用启动计划编号，正文引用已重写。

## 四、v1.2 复核 G 项处置（v1.3 已逐项）

G-1 编号统一（#1–#8 + 映射）；G-2 `cardKindsOf` 用 `fixedCards`；G-3 nominator `fixedCards=[]`；G-4 legacy `BUILT_IN_ROLE_MATRIX` 不改、fixed 视图在 routing builder；G-5 模块新增导出列入接口评审；G-6 schema 文案模式中立、legacy 文案不改；G-7 单活动 **fixed** workflow（legacy 可并存）；G-8 同 workflow 分支可复用/否则 `baseline-branch-exists`；G-9 `git init -b main`；G-10 stop 前 chief 收口 open advance 请求；G-11 A12a/A12b 由 `task.created`/`task.closed` 驱动；G-12 统一 `stage-request:<wf>:<stage>:<attempt>` 与 sourceTaskId；G-13 W1 owner 加编排；G-14 B1 改为无活动 fixed workflow；G-15 documentRefs 在 request.resolved 一次写入；G-16 acceptance 归档 vN/幂等/失败阻塞；G-17 reworkOf 具体子阶段；G-18 §6.2 writeset 交叉引用 A/B 来源。

## 五、限制与披露

- 本轮为只读清点 + 文档产出；未写产品/测试代码、未改角色卡/边界、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- v1.3 以 v1.2 为基线；v1/v1.1/v1.2 保留不改；所有 hash 已实测登记。
- 行号按代码基线 `10f90c7`；当前 HEAD `b870b15`（docs 提交，代码无差异）；实施以符号名/文本锚点为准。
- 仍需复核确认：MF-9…MF-12 闭环；Q3/Q5 实现细节；`merge-main` 非判断卡（`GOVERNANCE_APP_OWNED_CARD_KINDS`/`AppOwnedGovernanceCardKind`）接口评审；`project-roster/v4` `roles[].review` 接口评审；`requestReleaseMerge` 复用/新增接口评审（失败即不支持）；Q6 负例证据。
- 方案不构成验收、批准、实施授权或预算批准；真机全链预算另报。
- 旧 trunk/run/VCA/stable 代码保留 compat；本变更不删除、不迁移历史账本；删除/清理另立变更。

## 六、未提交声明

本轮未 commit / push / merge / tag / 发布；未写 `docs/planning/**`、`src/**`、`app/**`、`test/**`、`角色卡/**`、其他角色文档、`main`；未改角色卡/边界；未运行真实模型/Electron；未占用 9222/9223。所有写盘仅 `docs/proposals/` 与 `docs/governance/rapporteur/`。
