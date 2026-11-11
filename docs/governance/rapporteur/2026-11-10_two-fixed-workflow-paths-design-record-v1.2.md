# 角色记录：两条固定工作流路径实现级方案 v1.1→v1.2（业务策划 rapporteur，2026-11-10）

- 角色：ANS 内置角色「策划」（业务策划 `rapporteur`，独立固定上下文；**不是** `rapporteur-code`）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 分支：`feat/two-fixed-workflow-paths`（worktree `.claude/worktrees/trunk-amendment`；代码基线 HEAD `10f90c7`，当前 HEAD `4c344bd`（复核/协调方 docs 提交，代码无差异）；基于 `origin/main` `d9e3e99`）
- 状态：**v1.2 已产出**（v1.1 按独立复核 must-fix 闭环；v1.2 纳入协调方 2026-11-10 书面决策）；v1/v1.1 保留不改。**v1.2 必须经独立复核确认 MF-1…MF-8 全部闭环后才可写 B1；未闭环不进入 B1/实施**。本轮未实施、未测试、未验收、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- 写区：本记录在 `docs/governance/rapporteur/`；方案在 `docs/proposals/`。未写 `docs/planning/**`、`src/**`、`app/**`、`test/**`、`角色卡/**`、其他角色文档、`main`。

## 一、依据与版本实测（写盘后）

| 依据/版本 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 / 8,476 / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 独立复核报告（must-fix 来源） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md` | 222 / 32,535 / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` |
| 复核证据 | 同目录 `..._evidence/measurements.txt` | 117 / 10,708 / `3abbb1b2bb4f1d2d216921e99cd16db476c420d122e61b8cc73cfeec5e1a453c` |
| 启动计划（只读；含协调方 §七 决策） | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 90 / 10,914 / `6cfee9e61ceb2774d20e192b70086b40249f9f37bde4a462abb3229419029cf8` |
| 前任清点（只读） | `角色卡/rapporteur-code/docs/design/2026-11-10_impl_two-fixed-workflow-paths.md` | 86 / 12,447 / `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` |
| v1（被复核对象；保留不改） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md` | 1,110 / 122,470 / `279f55dcbf86b07f60fad62be30606758cfcd666cac83411a521609fb1446aeb` |
| v1.1（复核闭环稿；保留不改） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.1.md` | 1,307 / 162,672 / `045115160e4724bd1671bd38896469aa575d2c1143d7ea347fef5a43261715c1` |
| **v1.2（本版）** | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.2.md` | **1,325 / 166,834 / `e34e60fad8d97e00c517efd6ee564fd61146a66108a87cb2c8035cc8f46cfff9`** |

代码基线：`git rev-parse HEAD` = `10f90c769ce9c2a567cdd364def0037fe9019a05`（方案清点基线）；**当前 HEAD `4c344bd60702c2f0db1b973575e0d6725a71b61e`**（复核/协调方 docs 提交，代码无差异）；`origin/main` = `d9e3e99c160599e5b53a82e105939a359f69992f`。方案行号按代码基线；实施以符号名/文本锚点为准。

## 二、协调方决策（2026-11-10，预授权确认）与落点

| # | 决策 | v1.2 落点 |
| --- | --- | --- |
| 1 | **Q7/A12**：同意验收角色（默认内置 verifier；名册有项目验收角色则优先）+ 应用生成 `docs/acceptance/<flowId>-acceptance-vN.md`；验收强度由幕僚调节。 | 方案 §4.2 A12（A12a/A12b）、§8.5、§12.2 Q7；记录本表 |
| 2 | **Q4 路径 B 无 basis**：同意自动只读快照 `basis.recorded reason:"path-b"`；只读、不产生写权；drift fail-closed。 | §4.3 B1 前置、§5.3、§7.1、§12.2 Q4 |
| 3 | **merge-main judge 代批：不可代批**；合并 main 高风险、必须客户本人确认；judge 代批只作用于非高风险卡；judge 只能转人工/拒绝，不得冒充客户；高风险清单不变。 | §0.1、§0.2、§4.2 A13、§6.4、§7.3、§8.4、§9.2、§10.2、§11.1、§12.2；`merge-main` 改入 `GOVERNANCE_APP_OWNED_CARD_KINDS`（非判断卡），不进 `GOVERNANCE_CARD_GROUP` |
| 4 | **Q1 验收卡抑制**：按设计 v2——默认不新增客户卡；仅高风险动作出卡。 | §8.5、§12.2 Q1 |
| 5 | **Q2 `request_release_merge`**：优先复用既有能力；确需新工具须在 B1 钉住接口与 fail-closed 语义并说明必要性；接口评审失败即不支持，不得强推；备选不改变安全语义。 | §0.2、§6.4、§10.3、§12.2 Q2 |
| 6 | **Q6 父门替代证据**：同意，但须 fail-closed（证据缺失/不匹配即拒绝，不得默认通过）；写清 live-turn + assigned-task 等价证据与负例测试。 | §3.6、§11.1、§12.2 Q6 |
| 7 | **纪律不变**：分支开发、不合并 main、不发布/tag、不请求客户放行；旧分支停用留历史。 | 方案头部、§9.2、§10、§12.3；本记录 §六 |

## 三、MF-1…MF-8 闭环索引（v1.1 完成，v1.2 保留）

| MF | 复核问题 | 闭环落点（v1.1/v1.2） | 关键结论 |
| --- | --- | --- | --- |
| MF-1 | legacy/fixed 共用 `evaluateDispatchAuthorization`，重写破坏 legacy | 方案 §3.2、§3.6、§11.1 | **双矩阵模式分离**：旧谓词/旧函数/旧断言逐字保留；新增 fixed 谓词仅 fixed 路由调用；`matrix` 显式参数 |
| MF-2 | 角色模块常量被 legacy trunk 消费 | §3.2、§3.4、§6.5、附录 E | **不就地改 legacy 常量**：`CHIEF_HUB_DISPATCH.targetRoleIds`/`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds` 保持旧值；新增 fixed 目标集/矩阵分支；apply-journal/trunk-runtime 读取源不改 |
| MF-3 | fixed `task.created` 被 `run-required` 拒绝 | §2.2、§3.3、§7.1、附录 E | `workflowId` 存在时豁免 runId/runState；无 workflowId 时旧规则逐字保留；replay/收口/幂等同步 |
| MF-4 | `close_created_task`/意图确认仍绑 trunk | §3.5、§4.2 A3、§7.2、§10 | 补 `close_created_task` v2 fixed（workflowService，不触 trunk/CAS）与 A3 fixed 意图确认（hash/documentRefs/intent-entry，不写 doc-freeze）；legacy 不动 |
| MF-5 | 模式粒度项目级 vs per-flow | §3.6、§4.1、§9.4、§11.1 | `workflowMode(projectRoot, flowId)` per-flow；project.json 仅默认/强制；混合项目/单活动 workflow |
| MF-6 | Git 只装代码 vs dirty/clean | §5.2、§5.5、§6.1、§6.3、§6.4 | ANS `.gitignore` 托管块 + baseline commit；dirty/clean 只算 tracked + 非忽略 untracked；A9/A11/A13 一致 |
| MF-7 | A12 产物/角色偏离设计 v2 | §4.2 A12、§8.5、§12.2 Q7 | 验收角色（默认 verifier；名册项目验收角色优先）+ 应用 `docs/acceptance/*` 归档；协调方决策 #1 已确认 |
| MF-8 | B3 写集无来源 | §4.3 B2/B3、§6.3、§11.1 | B3 writeSet = B2 scope.files ∩ roster 模块属主 ∩ 角色边界；无 roster 用 boundary；越界 fail-closed |

**G 观察项**：G-1…G-20 均在方案首部“复核处置”表逐项落点（G-1 taskKind 新增；G-2 A12a/A12b；G-3 先卡后请求；G-4 确定性 workflowId；G-5 sideEffect 豁免；G-6 测试文件名；G-7 8 MiB 预算；G-8 role.activated；G-9 basis.verified 节流；G-10 appointment 来源戳；G-11 project.json 写回；G-12/13 单活动 workflow/分支；G-14 merge-main 不可 judge；G-15 stop 由运营执行；G-16/17 critical section/-m；G-18 legacyStateIgnored 展示；G-19 doc_format/contract_check；G-20 旧分支）。

## 四、v1.2 关键内容（相对 v1.1 的实质变化）

1. **merge-main 改为非判断卡**：`AppOwnedGovernanceCardKind`/`GOVERNANCE_APP_OWNED_CARD_KINDS` 加 `"merge-main"`，`GOVERNANCE_CARD_GROUP` 不加；`governanceCardGroup("merge-main")===undefined`；`planJudge` 排除；仅客户本人 approve/reject；judge 只能转人工/拒绝，不得 approve/冒充客户。所有 v1.1 中“merge-main 可 judge 代批/approval 组”的表述已全量替换（协调方决策 #3）。
2. **Q7/A12 已确认**：验收角色 + 应用 `docs/acceptance/<flowId>-acceptance-vN.md` 归档；A12a criteria、A12b report；验收强度由幕僚调节（协调方决策 #1）。
3. **Q4 已确认**：路径 B 自动只读快照 `basis.recorded reason:"path-b"`，只读、不产生写权；drift fail-closed（协调方决策 #2）。
4. **Q1 已确认**：固定路径不新增客户卡；仅高风险动作出卡（协调方决策 #4）。
5. **Q2 已确认**：优先复用既有能力；确需新工具须 B1 钉住接口/fail-closed/必要性；接口评审失败即不支持（协调方决策 #5）。
6. **Q6 已确认**：fixed 派发用 live-turn + assigned-task 等价证据，fail-closed；负例测试（协调方决策 #6）。
7. **纪律**：分支开发、不合并 main、不发布/tag、不请求客户放行；旧分支停用留历史（协调方决策 #7）。

## 五、限制与披露

- 本轮为只读清点 + 文档产出；未写产品/测试代码、未改角色卡/边界、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- v1.2 的 must-fix 闭环以 v1.1 为基础；v1.1/v1.2 的 hash 均已实测登记；v1/v1.1 保留不改。
- 行号按 HEAD `10f90c7`；实施以符号名/文本锚点为准。
- 仍需复核确认：Q3/Q5 的实现细节、`merge-main` 非判断卡的接口评审（`GOVERNANCE_APP_OWNED_CARD_KINDS`/`AppOwnedGovernanceCardKind`）、`requestReleaseMerge` 若新增的接口评审（失败即不支持）。
- 方案不构成验收、批准、实施授权或预算批准；真机全链预算另报。
- 旧 trunk/run/VCA/stable 代码保留 compat；本变更不删除、不迁移历史账本；删除/清理另立变更。

## 六、未提交声明

本轮未 commit / push / merge / tag / 发布；未写 `docs/planning/**`、`src/**`、`app/**`、`test/**`、`角色卡/**`、其他角色文档、`main`；未改角色卡/边界；未运行真实模型/Electron；未占用 9222/9223。所有写盘仅 `docs/proposals/` 与 `docs/governance/rapporteur/`。
