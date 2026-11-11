# 独立复核报告：两条固定工作流路径——实现级方案 v1（2026-11-10）

- 角色：ANS 「独立验收」（独立固定上下文；只写本角色 Section 1）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 复核对象：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md`（实现级方案 v1）
- 分支：`feat/two-fixed-workflow-paths`；复核时 HEAD `88f5092`（docs 提交，相对方案清点基线 `10f90c7` 仅文档差异；全部代码行锚点在当前 HEAD 复核）
- 复核日期：2026-11-10
- 复核性质：**只复核方案**（不判实施、不写产品/测试代码、不改角色卡/边界、不提交/推送/合并）；未运行真实模型/Electron；未占用 9222/9223。
- **结论：需修订（must-fix 未闭环）**——MF-1…MF-8 共 8 项须闭环后方可进入 B1。

---

## 一、依据实测（写盘前实测，命令输出见 `_evidence/measurements.txt`）

| 依据 | 实测（行 / 字节 / SHA-256） | 与任务书一致 |
| --- | --- | --- |
| 设计 v2（唯一产品依据） | 95 行 / 8,476 B / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` | 是 |
| 实现级方案 v1（被复核对象） | 1,110 行 / 122,470 B / `279f55dcbf86b07f60fad62be30606758cfcd666cac83411a521609fb1446aeb` | 是 |
| 策划工作记录（只读） | 96 行 / 13,787 B / `7f4599f3ee1a4ad7fcd970892862c9b61413661ea660813a7979a4469e9b1533` | 是（任务书简称 `7f4599f3…`） |
| 启动计划（只读） | 75 行 / 8,913 B / `8b207d246b8977e5965aa30a5397f667f89726e3c5701bd4f73e54bf5c910b1b` | 是 |
| 前任清点（只读） | 86 行 / 12,447 B / `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` | 是 |
| runtime-tool-surface-dispatch-gate 设计 | 1,242 行 / `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce` | 与方案引用一致 |
| governance-authority-matrix 设计 | 1,056 行 / `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6` | 一致 |
| runtime-gate-role-module-contract 设计 | 685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` | 一致 |
| document-format-specifications 设计 | 979 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54` | 一致 |
| judge-delegated-decision-effectiveness 设计 | 686 行 / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be` | 一致 |
| team-plan-run-binding 设计 | 438 行 / `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b` | 一致 |

代码行数抽查（与方案清点一致）：`workflow-preconditions.ts` 1,687；`schema.ts` 1,861；`gates/index.ts` 253；`classify-shell.ts` 2,242；`task-state.ts` 1,296；`run-manifest.ts` 1,171；`run-role.ts` 3,669；`session.ts` 11,225；`model/runtime.ts` 4,183；`model/role.ts` 409；`jsonl-ledger.ts` 229；`apply-journal.ts` 4,030；`convener/index.ts` 692；`doc-format-specs.ts` 2,294；`project-state.ts` 1,156；`*.test.ts` 全仓 555 个；doc_format 54 个格式 id。全部与方案/记录相符。

---

## 二、结论与摘要

**结论：需修订（must-fix 未闭环）。** 方案与设计 v2 的方向和主体结构一致（两条固定路径、3 卡、派发分裂、Git 普通用法、应用账本、保留审计/judge/doc_format/写区/高风险清单），行锚点清点质量高（抽查几十处基本准确），但存在 8 项必须修复的实现级矛盾，集中在：

1. **legacy 兼容被共享谓词/共享模块数据的就地改写实际破坏**（MF-1、MF-2）——方案声称"旧路径逐字保留"，但 `evaluateDispatchAuthorization`、`CHIEF_HUB_DISPATCH`、`CONVENER_WORKER_DISPATCH_TARGETS` 均为 fixed/legacy 共用，改值即改旧路径。
2. **fixed 路径关键机制仍绑定 trunk 服务**（MF-3、MF-4）——任务账本 `run-required` 规则、`close_created_task`、意图确认卡实现都在被标记 compat-only 的 trunk 栈里，方案未给 fixed 实现。
3. **模式粒度自相矛盾**（MF-5）、**"Git 只装代码"与 dirty/clean 前置冲突**（MF-6）。
4. **B 路径写集无来源**（MF-8）、**A12 产物路径/承接角色偏离客户确认的设计 v2**（MF-7）。

MF 未闭环前，B1 无法写出可判定、可实现的验收标准。

---

## 三、Must-fix 清单

### MF-1 legacy 派发矩阵被全局重写破坏（高）

- **方案锚点**：§3.2「`evaluateDispatchAuthorization`（:1590-1645）重写为…」「`CHIEF_DISPATCHABLE_BUILT_INS`（:1560-1566）改为 `CHIEF_DISPATCH_COORDINATION`…不保留第二张『五内置』表」；§3.2 会话层「`routeStarDispatch` 保持原样（legacy 兼容）」；§12.1「旧路径逐字保留」；§11.1「legacy 项目/在飞 run 走旧路径」。
- **问题**：[事实] `routeStarDispatch`（`app/desktop/session.ts:8912`，硬授权调用在 :8982-8992）是 trio 现网唯一派发路由，legacy 与 fixed 共用同一谓词。按方案改写后：legacy 项目中 chief→product/rapporteur/nominator 将被 `chief-production-dispatch-forbidden` 拒绝（现网用例 `test/桌面应用/star-routing.test.ts:157`、`test/测试/governance-e2e-auto/i-full-chain.test.ts:142` 正走此路径）；convener→product 在 legacy 由拒绝改为允许（旧项目权限面被静默扩大）。"routeStarDispatch 保持原样"与"谓词重写"不可同时成立。`evaluateDispatchPreflight`（:1651）复用同一谓词，"advisories 仅 legacy"也需要一个未被改写的旧谓词。
- **必须的修改**：把矩阵选择显式模式化：`DispatchAuthorizationInput` 增加 `matrix: "legacy-v1" | "two-fixed-paths/v1"`（或新增独立 fixed 谓词、旧函数不动）；legacy 调用点（`routeStarDispatch`、`evaluateDispatchPreflight`、旧测试）继续使用旧矩阵，fixed 路由使用新矩阵；为两套矩阵分别给出全组合测试（含 legacy `chief→product` 允许、`convener→verifier` 拒绝的既有断言）。若确有意图改变 legacy 行为，必须在方案中列为显式口径变化并经协调方/客户确认（设计 v2 未授权改动旧项目派发权）。
- **影响**：不修则 legacy/在飞 run 的产品/策划/人事派发中断，旧项目权限面被静默放大；B1 的迁移兼容 AC 不可判定。

### MF-2 角色模块纯数据被 legacy trunk 消费，就地改值破坏旧路径（高）

- **方案锚点**：§3.2 item 4；§3.4 chief 行「`CHIEF_HUB_DISPATCH.targetRoleIds` 改为 `["convener","verifier"]`」、convener 行「`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds` 改为 `["product","rapporteur","nominator"]`」；§6.5/附录 E「trunk 代码 compat-only，不 import/不调用」。
- **问题**：[事实] 两个常量不止被 fixed 新路径使用：
  - `CHIEF_HUB_DISPATCH.targetRoleIds` 被 legacy trunk 服务消费：`src/service/trunk/impl/apply-journal.ts:3766-3771`（`isChiefHubDispatchTarget`，hub 分支与 `task.to` 五内置校验）、`src/pipeline/orchestration/trunk-runtime.ts:1192-1200`（hub 判定与 `hubRouting:"chief-hub-v1"` 注入）。缩为 `{convener,verifier}` 后，legacy 的 chief→product/rapporteur/nominator 准备派发不再被识别为 hub，`hubRouting` 缺失、Service 校验失败。
  - `CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds` 经 `workflow-preconditions.ts:1582-1584::isConvenerBuiltInDispatchTarget` 被 `trunk-runtime.ts:1186-1188` 的 `review` 路由消费：改为 `{product,rapporteur,nominator}` 后，legacy convener→product 会被当作 review 路由，而 convener→verifier 的旧 review 路由丢失。
  - 「trunk 代码 compat-only 不调用」只约束 fixed 路径，阻止不了 legacy 路径继续读取这些模块数据——模块数据只有一个版本。
- **必须的修改**：不得就地改写共享常量。二选一：(a) 角色模块按模式暴露目标集（如 `targetsFor(matrix)`），legacy 消费点取 `legacy-v1` 集合、fixed 路由取新集合；(b) 在 legacy 消费点（apply-journal/trunk-runtime）冻结使用 legacy 常量（登记为 legacy 冻结表），模块新常量只供 fixed。同步修正 §3.4/§6.5「不保留第二张表」的表述与测试。
- **影响**：不修则任何带在飞 run/历史 trunk 的项目升级后派发被破坏——与设计 v2 §五「现有项目可继续」及方案 §9.4 相悖。

### MF-3 固定路径 `task.created` 被现有账本不变量拒绝（高）

- **方案锚点**：§2.2「新路径可省略 runId，需增 workflowId/stage」；§3.3「创建 `task.created`（from:chief,to:convener,flowId,workflowId,stage…）」；附录 E「`src/common/编排/task-state.ts` keep 不变（读侧兼容新字段）」。
- **问题**：[事实] `appendTaskEvent`（`src/common/编排/task-state.ts:365-390`）对 `kind==="task.created" && flowId!==undefined` 强制要求 `runId`+`runState`，否则返回 `run-required`（:377-380）。fixed 任务恰是"flowId 有值、无 run"；唯一放行开关 `allowLegacyRun` 的注释明确只用于历史重放/测试，不能作为 fixed 依据。附录 E 的"task-state 不变"与 §2.2 自相矛盾。
- **必须的修改**：明确 tasks.jsonl 的 fixed 形态：`task.created` 可选 `workflowId`/`stage`/`taskKind`/`workflowPath`，且当 `workflowId` 存在时豁免 runId/runState（legacy 规则逐字保留）；同步 replay/校验/测试与 taskState 消费方（报告/收口/幂等）。
- **影响**：不修则 A1/A4/A7/A10 的任务创建在实现时直接 fail-closed，两条固定路径无法启动。

### MF-4 收口/意图确认仍绑定 trunk 服务（fixed 路径核心链路缺失）（高）

- **方案锚点**：§3.3/§4.2「chief 用 `close_created_task` 收口阶段请求任务」「运营对生产线任务 `close_created_task accepted`」；§4.5 完成判定依赖 `task.closed`；§3.7/A3「意图卡不变」；§3.5 item 7「保留注入 close_created_task」；§5.1 仅改 `complete_team_plan`、§4.2 仅改 `activate_role_documents`；§6.5/附录 E「trunk-runtime/apply-journal compat-only 不调用」。
- **问题**：[事实] (1) `close_created_task` 的 schema 必填 `["operationId","taskId","runId","basisDigest","reportRef","outcome"]`（`src/provider/runtime/schema.ts` direct capabilities），实现链为 `trunk-runtime.ts:770 createDirectRoleRuntime.closeCreatedTask` → `apply-journal.ts:3182 closeCreatedTask`（要求 runId+basisDigest+reportRef，经 `prepareCreatedTaskClose` 的 run 账本/CAS）。fixed 路径无 run/basis，无法满足，方案未给 fixed schema/实现。(2) 意图确认卡（A3）在 run-role 卡处理链调用 `createTrunkService(...).prepareIntentConfirmation/finalizeIntentConfirmation`（`run-role.ts` 约 :1625-1665；`apply-journal.ts:3445/3541`，snapshot/trunk 存储）。方案称"意图卡不变"，与"trunk compat-only 不调用"冲突，也未定义 fixed 替代（谁写 `docs/intents/<intentId>.md`、hash 与 documentRefs 如何入账）。
- **必须的修改**：补 `close_created_task` v2（fixed 模式：operationId/taskId/outcome/note；reportRef 按快照可选；workflowService 校验真实创建者、报告/状态、幂等并写 `task.closed` + 阶段完成事件；不进 trunk/CAS），明确实现落点与写集（W2/W3）；补 A3 意图确认 fixed 实现（应用计算 intent hash、写 request.created/resolved.documentRefs、chief 写 docs/intents 的边界保持），或显式声明保留哪个 trunk 子组件及理由并同步 §6.5 处置表。
- **影响**：不修则 A2/A5/A8/A11/A12/B1 的"任务收口"与 A3 意图卡在 fixed 路径没有可执行实现。

### MF-5 模式判定粒度自相矛盾（项目级 vs flow 级 vs 会话级）（高）

- **方案锚点**：§3.2「`workflowMode(projectRoot)`：fixed→routeFixedPathDispatch，legacy→routeStarDispatch」；§3.6「run-role 新增输入 `workflowMode:"fixed"|"legacy"`（由 desktop/CLI 从 project config 读取）」；§4.1「读 `.ans/project.json` 的 `workflowSchema`；自动判定：若该 `flowId` 存在活动 legacy run…⇒该 flow legacy；否则 fixed」；§9.4。
- **问题**：函数与配置是项目级（`workflowSchema: "two-fixed-paths/v1" | "legacy/v1"`），但自动判定与运行现实是 per-flow（同一项目可同时有 legacy 在飞 run 与新 flow）。run-role 的单一 `workflowMode` 无法让一个 convener 会话分别为两个 flow 走不同路径；`project.json` 单值也表达不了混合项目。
- **必须的修改**：锁定判定模型：建议 `workflowMode(projectRoot, flowId)`（或 `workflowSchema` + per-flow 状态表），dispatch/run-role 按被派任务的 flowId 解析；写明 `project.json` 写回含义（默认值 vs 强制值）与混合项目测试（legacy 在飞 + 新 flow 并存）。
- **影响**：不修则混合项目走错路由（新 flow 被 legacy 门禁拦截或旧 run 被 fixed 路由破坏），B1 迁移兼容 AC 不可判定。

### MF-6 「Git 只装代码」与 dirty/clean 前置冲突（高）

- **方案锚点**：§5.2 item 3「工作区 dirty ⇒ `baseline-repository-dirty`，不 stash/reset/clean」；§5.5 表；§6.1「实现任务派发时…worktree 与分支 clean（或仅本任务允许的未提交改动）」；§6.4 release「worktree clean」；设计 v2 核心原则 1「Git 只装代码」。
- **问题**：固定路径把治理文档（`docs/product`、`docs/proposals`、`docs/contracts`、`docs/scheduling`、角色卡、`docs/intents` 等）作为普通文件维护且按设计不提交进 Git；A9 基线时这些文件必然以 untracked（或已存在）出现，A13 发布时仍在工作区。按方案字面规则，A9 必失败 `baseline-repository-dirty`，A11/A13 的 clean 校验同样失败——真机全链在 git init 处就被自己的校验卡住。方案未定义 dirty/clean 相对"git 只装代码"的语义（是否忽略 untracked、是否用 .gitignore、是否只算 tracked 修改）。
- **必须的修改**：定义并测试：dirty/clean 只针对 tracked 文件修改/删除与"任务写集内"的 untracked 文件；治理文档目录（及 `.ans/**`、`node_modules/**` 等）按显式 ignore/allowlist 处理；`.gitignore` 由应用初始化并计入 basis；A9/A11/A13 三处一致。若坚持完整 clean，则必须把治理文档提交进 Git——与设计原则冲突，不可取。
- **影响**：不修则路径 A 在 A9 即失败，真机全链无法开始。

### MF-7 A12 承接角色/产物路径偏离客户确认的设计 v2（中高）

- **方案锚点**：§4.2 A12「`docs/quality/<flowId>-criteria-vN.md`、`docs/quality/<flowId>-report-vN.md`」；§8.5；§1.4 声称与设计 v2 逐条映射。
- **问题**：[事实] 设计 v2 §二 A12 的产物是 `docs/acceptance/*`（设计 v2 第 50 行）。方案未在任何章节声明该路径变更或理由。现状：内置 verifier 写区为 `docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（`src/common/roles/verifier/index.ts:57-88`）；独立验收角色 Section 1 只有 `角色卡/独立验收/docs/**`（`角色卡/独立验收/boundary.md`），`docs/acceptance/` 只经任务精确范围授权。方案选择 `docs/quality` 可保住 H1=0，但这是对客户确认文档的静默改口径，且未说明 A12 的"验收"是内置 verifier 还是项目「独立验收」角色。
- **必须的修改**：显式登记该偏差并二选一：(a) 保持 `docs/quality` 作为质检产物路径、`docs/acceptance` 留给任务范围授权的独立验收（B1/B2）记录，交协调方/客户确认；(b) 若要严格对齐设计 v2 的 `docs/acceptance/*`，需任务精确写授权（人事边界修订违反设计 v2 §七 0 边界，不可默认）。同时明确 A12 承接角色。
- **影响**：不修则 B1 可能把未经客户确认的口径变化固化为验收标准，T3 评审链（客户确认设计→方案→B1）出现断点。

### MF-8 路径 B 的写集来源缺失（B3 无团队计划）（中高）

- **方案锚点**：§6.3 item 3「任务 writeSet 来自团队计划 `roleRows[].writesets` ∩ 模块路径；无团队计划（legacy）不走本路径」；§4.3 B3；§4.3 前置「路径 B 不写团队计划」；设计 v2 §三「不涉及…团队计划」。
- **问题**：路径 B 明确不写团队计划，则 B3 实现任务的 writeSet 没有来源；按 §6.3 字面规则 B3 落入"无团队计划 ⇒ 不走本路径"，fixed 写门禁不可用，路径 B 不可实现。
- **必须的修改**：定义 B 路径写集来源（建议：B2 `change.scope-decided.scope.files` 为候选范围 ∩ 现有 roster 模块属主/角色边界；无 roster 时按角色 boundary 解析；应用重算并校验 ⊆ 属主模块路径，超出则要求走 A 或新 basis），同步 §3.1/§6.1/§6.3 与测试矩阵（B 路径写集/越界拒绝）。
- **影响**：不修则 B3 派发无法通过写门禁，修改流（路径 B）不可用。

---

## 四、G 观察项（非阻塞改进/风险/遗漏测试/文案歧义）

1. **G-1 清点错误**：§2.1 称 `dispatch_task` 含 `taskKind` 字段、枚举在 `schema.ts:799`——[事实] `dispatch_task` 目前没有 `taskKind` 属性（schema:614-800 仅 roleId/task/reason/sideEffect/expectedOutput/requestedEvidence/idempotencyKey/flowId/stepId/moduleId/modulePaths + hub 字段，`additionalProperties:true`）；`:799` 的枚举属于 `contract_check`（`ContractCheckInput.taskKind`，`model/runtime.ts:2089`），`DispatchTaskPayload`（`model/runtime.ts:1981-2018`）也没有该字段。方案应按"新增字段"处理：dispatch_task schema 属性 + DispatchTaskPayload 类型 + session 透传/校验 + contract_check 枚举同步。
2. **G-2 A12「实施前写标准」未建模**：verifier 需在实施前写 criteria、实施后判 report；方案 A12 是 A11 之后的单一阶段，仅注"标准可先写"。需定义 criteria 任务的时机、stage 绑定、幂等键（现 `review:<wf>:<tipOid>:<attempt>` 不覆盖无 tip 的标准任务）与是否参与 A12 完成判定。
3. **G-3 A10 时序/再唤醒未定义**：任命卡与 A10 stage-request 的先后未定；卡 resolved 后 convener 如何被再投递/恢复；`request.resolved` 可能发生在 stage 仍为 A9 时。建议明确"卡先裁定、再发 A10 stage-request（携带选中角色）"的顺序并写入 §4.4。
4. **G-4 幂等键不一致**：§3.3 首次建议 `stage-start:<flowId>:<path>:<stage>`，§7.1 却是 `stage-request:<wf>:<stage>:<attempt>`（wf 尚不存在）；`workflowId` 派生含 `requestedAt` 非确定性，建议由稳定输入（flowId|path|sourceTaskId|事件摘要）派生。
5. **G-5 stage-request 的 sideEffect**：`classifyTaskSideEffect` 会按任务文本把 `read-only` 升类（文本含"实现/代码"⇒`code`），而方案要求 stage-request `sideEffect=read-only` 否则拒绝；需为 stage-request 定义显式豁免或限定文本规范并加测试。
6. **G-6 测试文件名**：§11.1 建议 `test/编排/shell-audit.test.ts` 不存在；现有为 `test/编排/shell-post-audit.test.ts`。
7. **G-7 16 MiB 混淆**：§5.3 新读/哈希预算 16 MiB 与已取消的 trunk「16 MiB 清单预算」同数不同义，建议换名/换数避免审计混淆。
8. **G-8 `role.activated` 词表**：workflows.jsonl 新事件需在 model 类型/重放/`project_state`/i18n 登记；`listProject` 按磁盘枚举角色（`src/service/role/resolve-role.ts:341+`），需定义"账本 role.activated 缺失但文件在盘"的判定（建议 fail-closed 或至少告警）。
9. **G-9 `basis.verified`**：每次校验都入账会膨胀账本；建议只记 drift/摘要或设节流。
10. **G-10 `request.resolved.targetRoleIds` 语义**：现有文档注明"仅 appointment(D3)"；chief 发起的 appointment 卡沿用该字段时，需确认 legacy D3 读取方（`prepareRoleActivation` 等）不会把新卡误当 D3 证据（加来源字段或测试）。
11. **G-11 `.ans/project.json` 写回**：现只有 `finalize.ts:982` 的 reaccept 写先例且 config-loader 只读；需指定应用写入器、保留既有键、原子写与失败面。
12. **G-12 多 workflow 并存与单工作区/分支冲突**：`ans/task/<workflowId>` 分支需要应用在 A11 派发时保证当前分支正确；两个活动 workflow 交错时可能提交到错误分支。建议显式限制"每项目同时至多一个活动 workflow"或在方案中定义分支切换点（应用在 A11 派发前切换并核 clean）。
13. **G-13 release 后工作区停在 main**：下一个 workflow 的 A9 要在 main 上创建新任务分支；需定义同名分支已存在/重跑 workflowId 的处理与清理。
14. **G-14 merge-main 的 judge 证据包**：judge 看到什么、basis 漂移时如何拒绝，方案未定义；建议 B1 前补充。
15. **G-15 设计 v2 §六.3 执行者口径**：设计说"幕僚暂停/改道…由运营执行"，方案以 chief 对 stage-request `close_created_task(rejected)` 实现停/改道（chief 执行、应用记账）；需协调口径或声明"运营执行停稳、应用记账"。
16. **G-16 提交门禁间隙**：shell v5 先跑 `git diff --cached` 再执行 commit，存在检查-提交间隙；串行写任务已大幅缓解，建议实现中锁定同一临界区并测试。
17. **G-17 `git commit -F -`**：stdin 消息内容的审计/检查需明确；`--amend/--no-verify/-a/--author` 已拒绝（与方案一致）。
18. **G-18 `workflow.started.legacyStateIgnored`**：字段无消费方，建议删除或定义投影用途。
19. **G-19 doc_format 同步**：`team-plan/v3` 说明更新时，`contract_check` 文案/示例与 `doc-format-specs` 的 54 格式表要同步（方案 §9.2 已提，但未列 contract_check 文案）。
20. **G-20 旧分支**：`feat/initial-workflow-publication-completion` 暂停留历史属调度动作（启动计划 §二）；建议 B1 记录它不参与本变更，避免实现者误接。

---

## 五、Qs/默认项处置

### 5.1 设计 v2 §六四个默认项

| # | 默认项 | 复核处置 |
| --- | --- | --- |
| 1 | 基线失败可见性：只回报幕僚/运营，不弹客户卡 | **接受**（方案 §5.5 一致；失败码均为 fail-closed，不产生客户卡） |
| 2 | 路径 B 触发：幕僚判断，客户可明示覆盖 | **接受**（§4.3/§4.6）；应用不做自然语言分类，`workflow.started.trigger` 如实记录 |
| 3 | 幕僚暂停/改道：具备请求能力、由运营执行 | **接受方向，机制需对齐**（见 G-15：方案是 chief close stage-request、应用记账；建议 B1 写明"运营执行停稳"如何落实） |
| 4 | 合并 main 确认：客户本人确认卡；可 judge 代批；高风险清单不变 | **接受**（merge-main 为 approval 组、app-owned；judge 只能 approve/转人工，不冒充客户） |

### 5.2 方案 §12.2 Q1–Q6

| Q | 内容 | 复核处置 |
| --- | --- | --- |
| Q1 | 固定路径不发 acceptance 卡（验收=独立质检+幕僚决策+发布合并卡） | **可接受**（与设计 v2"只保留 3 张确认卡"一致）；建议协调方在 B1 记录"验收=质检报告+幕僚决策+merge-main 卡"，避免卡数争议 |
| Q2 | 发布合并由 chief `request_release_merge` 触发、应用执行；接口评审拒绝时的备选 | **可接受**；备选（桌面 UI 动作/应用自动呈卡）不改变安全语义，可作为接口评审失败的回退 |
| Q3 | 写任务串行（同工作区一次一个写任务） | **可接受**（确定性优先）；并行/多 worktree 另立变更；但需补 G-12 的跨 workflow 约束 |
| Q4 | 路径 B 无 basis 时自动记录只读快照（不视为基线 3 件小事） | **可接受但需协调方确认**：它是设计 v2 §一 基线准备在 B 路径的只读变体（不 git init、不写团队计划、不弹卡）；建议 B1 明确 `basis.recorded reason:"path-b"` 语义与幂等 |
| Q5 | 合并范围：只本地合并 main；push/tag/产物发布另需客户授权 | **接受**（与设计 v2 一致；方案不实现 push/tag 自动化，如实现另报） |
| Q6 | 父门：固定路径默认不调用 `evaluateChiefDispatchParent`，用 session live-turn + assigned-task 证据 | **默认可接受，但 B1 必须验收**：需证明 `sourceIsCurrent + inspectAssignedTask` 在固定路径对 chief/convener 派发 fail-closed 等价（含伪造/过期轮次测试）；否则按 gates 升级点处理 |

### 5.3 需客户/协调方单列确认

1. **A12 产物路径与承接角色**（MF-7）：`docs/acceptance/*`（设计 v2）vs `docs/quality/*`（方案，verifier 写区）；以及 A12 是内置 verifier 还是项目「独立验收」角色。
2. **若修复 MF-1/MF-2 选择改变 legacy 派发矩阵**（例如在旧项目放开 convener→product）：设计 v2 未授权改动旧项目派发权，必须客户/协调方明确。
3. **合并 main 的 judge 代批具体含义**：设计 v2 §六.4 默认允许，但建议客户在 B1 前确认"『替我审批』开启时 judge 可代批合并 main"这一具体行为。
4. **路径 B 自动 basis 快照（Q4）**：需协调方确认它不属于基线准备。

---

## 六、与设计 v2 的逐节一致性核对（摘要）

| 设计 v2 条目 | 核对结果 |
| --- | --- |
| 核心原则 1（Git 只装代码、取消治理型 Git 机制） | 方向一致；MF-6（dirty/clean）、MF-2（共享模块数据）需闭环；"取消"以"默认路径不触达、代码保留 compat"实现——语义可接受，建议 B1 明确 |
| 核心原则 2（治理状态走应用账本） | 一致（3 个新账本 + `-vN` + 文档 hash 入账、不写 Git）；MF-3/MF-4 为实现缺口 |
| 核心原则 3（派发分裂） | 方向一致（convener→生产角色；chief→verifier/阶段请求）；MF-1/MF-2（legacy 兼容） |
| 核心原则 4（幕僚产线调度） | 一致（stage-request 复用 dispatch_task）；G-2/G-3/G-4/G-5 需明确 |
| 核心原则 5（3 张卡不合并） | 一致（意图卡 chief 不变；方案/任命移 chief；不合并）；Q1 需协调方记录 |
| 核心原则 6（审计/judge/doc_format/写区/高风险清单保留） | 一致（append-only sidecar、judge、54 格式、文件级边界、高风险清单）；G-14/G-19 |
| 核心原则 7（默认固定、例外可加重） | 一致（workflowSchema + legacy/重型例外）；MF-5 粒度需修正 |
| §〇 角色权责 | 一致（幕僚/产品/策划/人事/运营/实现/验收）；验收承接角色见 MF-7 |
| §一 基线准备 3 件小事 | 一致（§5：git init/哈希入账/团队计划落盘）；失败面从 3 类扩为 10+ 稳定码——扩大的是错误分类而非客户口径，均 fail-closed 不弹卡，可接受 |
| §二 路径 A A1–A13 | 大体一致；MF-4（收口/意图）、MF-7（A12）、G-2/G-3 |
| §三 路径 B B1–B4 | 大体一致；MF-8（B3 写集） |
| §四 门/机制处置 | 一致（逐文件 keep/deprecate/compat-only）；16 MiB/租约/run 歧义是"默认不触达"而非删除——建议 B1 写明"默认路径不存在前置"的验收方式 |
| §五 在研工作影响 | 一致（旧分支暂停、已合并修复不回退、蛇 target 历史 trunk 忽略）；§9.3"活动 pinned run 继续 legacy"是更保守解释，须与 MF-1/MF-2/MF-5 一起闭环 |
| §六 四个默认项 | 全部按默认采纳（见 §5.1） |
| §七 非目标 | 一致：0 新角色、0 边界模型变化、0 新客户门（merge-main 为既有高风险确认机制的具体化）；H1=0 核验见下 |

---

## 七、边界 / H1 / 非目标核对

- **H1=0 可成立**：方案写集均落在既有 Section 1 授权内——`src/model/runtime.ts`（运行时核心）、`src/model/role.ts`（门禁引擎）、`src/common/shared/`（shared-code）、`src/common/编排/`（编排）、`app/desktop/`（桌面窗口）、`src/provider/runtime/`（运行时核心）、`src/common/门禁引擎/`（门禁引擎）、`src/common/roles/<role>/`（六个角色 code 角色）、`src/common/gates/`（不改）。新文件（`workflow-state.ts`/`workflow-service.ts`/`basis-guard.ts`/`workflow.ts`/`workflow-git.ts`）都在既有目录授权内。
- **未新增角色**；未改五个内置角色与项目角色的边界模型；`角色卡/**` 不被角色写（角色卡文本在 `src/common/roles/*` 源码内）。
- **未新增客户可见门**：`merge-main` 是既有高风险确认机制对"合并 main（发布）"的具体化（app-owned、approval 组、可 judge 代批），客户卡仍为 3 张确认卡 + 高风险动作卡；接口评审项（RoleToolId +1、RoleDispatchPurpose、GovernanceCardKind +1、task 字段、dispatch_task 字段）不是客户门。
- **本复核未写产品代码/测试/角色卡/边界/其他角色文档**；只在 `角色卡/独立验收/docs/design/` 下写本报告与证据附件。

---

## 八、限制与披露

- 本复核为只读清点 + 代码抽查 + 文档比对；**未运行确定性测试全量**（555 个 `*.test.ts`），方案引用的 known red（version-change-integration 9 红、optional-acceptance 6/2/1/3/0、test/编排 22 fail/2 skip）未独立复测，按方案自述与近期验收口径引用。
- 未运行真实 Electron/真实模型；未验证 UI 卡片呈现、judge 代批实际行为、合并执行的真实 Git 语义、CI/发布状态。
- 代码抽查覆盖：`src/common/roles/*`（6 模块关键文件）、`src/provider/runtime/schema.ts`、`src/common/编排/{workflow-preconditions,task-state,run-manifest,project-state,doc-format-specs,watchdog,shell-audit}.ts`、`src/model/{runtime,role,directive}.ts`、`src/common/gates/index.ts`、`src/common/门禁引擎/{classify-shell,role-tool-registry,governance-roles,versioned-doc-guard}.ts`、`src/pipeline/orchestration/{run-role,trunk-runtime,shell-arming}.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/common/shared/{jsonl-ledger,config-loader}.ts`、`src/service/role/resolve-role.ts`、`app/desktop/{session,version-change,customer-input}.ts`、相关测试与角色卡边界。
- 行号按当前检出复核（HEAD `88f5092`；代码与 `10f90c7` 一致）；方案个别行号为近似（±数行），核心符号均已核对。
- 未访问仓库外贪吃蛇 target（`ans-game2d-snake-2026-11-09\target` 等）与其 `.ans` 状态；其历史 trunk 处置按设计 v2 §五/方案 §9.3 文本核对。
- 本报告不构成实施授权、验收或批准；不替代 B1/B2。

---

## 九、复核证据与未提交声明

- 证据目录：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths_evidence/`（依据 hash/行数/字节实测输出、关键代码锚点抽查记录）。
- 本报告路径：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md`；本报告自身行数/字节/SHA-256 在写盘后实测并登记于证据文件（不嵌入正文，避免自指）。
- **未提交声明**：本轮未 commit / push / merge / tag / 发布；未写产品/测试代码；未改角色卡/边界；未运行真实模型/Electron；未占用 9222/9223。

---

## 附录 A：关键代码锚点核对（抽查结论）

已核实（与方案一致，符号级）：`workflow-preconditions.ts:1560-1566/1590-1645/1651/1674-1682/1171/1372/1434`；`gates/index.ts:82-100/228`；`task-state.ts:109/337/365/1246` 及 :377-380 run-required；`run-manifest.ts:478/634/856`；`model/runtime.ts:1365-1405/1460-1533/944/976/1981-2018`；`model/role.ts:245/262/77-110`；`role-tool-registry.ts:52-68`；`governance-roles.ts:138-218`；`classify-shell.ts:1046/1134/1551/2153`；`jsonl-ledger.ts:31-33`（5 MiB × 3）；`run-role.ts:1094-1116/1270-1420/1625-1665/1759-1764/1932-1959/3065-3225`；`session.ts:8557/8912/8982-8994/9000-9008/9163-9183/3261-3281/4359-4371`；`apply-journal.ts:2631/2938/3052/3182/3267/3358/3445/3541/3714/3766-3771`；`trunk-runtime.ts:770/1186-1200`;`resolve-role.ts:341+`；`verifier/index.ts:57-88`；`convener/index.ts:97/191-238`；`chief/internal/{dispatch.ts:24-139,spec.ts:61-72,tools.ts:30-37,intent-confirm.ts:38}`；`rapporteur/internal/spec.ts:90-108`；`nominator/index.ts:145-158/243-310/84-110`;`product/internal/dispatch.ts`。

与方案不符/需更正：
1. `dispatch_task` **无** `taskKind` 字段；`:799` 枚举属 `contract_check`（见 G-1）。
2. `test/编排/shell-audit.test.ts` 不存在（现有 `shell-post-audit.test.ts`，见 G-6）。
3. 设计 v2 A12 产物 `docs/acceptance/*` vs 方案 `docs/quality/*`（见 MF-7）。
