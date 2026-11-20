# 设计记录（简版）：应用侧内置角色派发——幕僚只选流程（2026-11-17）

- 日期：2026-11-17
- 角色：ANS 内置角色「策划」（业务策划；独立固定上下文）
- 状态：**设计记录（简版）**。派发模型已由客户 2026-11-17 确认；第一步（零新依赖、在现有 `workflow-service` 上把内置角色任务派发移到应用侧）由协调代理在 `feat/app-dispatch-builtins` **实施中**。本记录只冻结设计口径与差异矩阵、风险与未决项，不含实施步骤。
- 依据：
  - 客户 2026-11-17 原话：「我现在需要引入工作流引擎，这个幕僚只能选流程，而不能派发agent，运营只能派发worker，不能派发内置的角色。」
  - 客户同日最终确认口径（协调方转达，以此为准）：①内置角色任务（产品/策划/人事/验证等）由应用侧按流程定义自动派发；②worker 任务继续由运营派发（团队计划、基线准备、集成汇总仍在运营；运营不再派发内置角色）；③幕僚只选流程，默认内置两条（新增、修改），未来可扩展；④独立验收（内置验证角色）由应用侧按流程定义派发，与运营生产派发相互独立。
  - 客户同日决定：**不引入开源工作流引擎**；原「工作流引擎选型」取消。本记录中的「流程驱动」指**应用侧确定性流程执行器**（应用代码，不是 agent、不参与业务判断、不调用模型），随 ANS 应用一起发布，**零新增依赖**。
  - T3 设计 v2：`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`；实现级方案 v1.3：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`；v2.1.0 现行代码（本 worktree HEAD `75284d2`，v2.1.0 已发布）。
- 标记约定：**[事实]** 只读核实的现行代码/文档行为；**[设计]** 本记录提议、未实施；**[默认]** 本记录默认取舍，列入 §八 未决项；**[待确认]** 需协调方/客户确认。
- 纪律：本轮**只写文档**；除本文与策划记录的文档提交/推送外，未改代码/测试/角色卡/边界，未运行产品、未合并/发布。

---

## 〇、摘要（先读这段）

1. **派发模型**：内置角色任务（产品/策划/人事/验证）由**应用侧流程驱动**按流程定义直接创建并投递；**运营只派 worker**（项目实现/分析角色）；**幕僚只选流程 + 呈客户卡**，不再派发任何 agent；**独立验收由应用侧直派**（内置 verifier 默认；名册验收角色由应用核验后直派），与运营生产派发相互独立。
2. **流程**：默认内置两条流程定义——**新增（A1–A13）**与**修改（B1–B4）**；阶段、合法转移、返工边、客户卡与 v2.1.0 保持一致；未来扩展走流程定义注册表，不改角色权限模型。
3. **第一步**：零新依赖，在现有 `src/common/编排/workflow-service.ts` 上增加「按阶段定义创建内置角色任务 + 观察报告 + 应用侧收口」的确定性驱动；在本记录中视为**实施中**，不是未决项。
4. **对 v2.1.0 的净变化**：删除幕僚的 stage-request 链与验收费派发；删除运营的内置角色派发；新增幕僚的 `select_workflow` 与「按应用发放的卡 prompt 呈卡」；新增应用侧任务来源 `from:"application"` 与任务种类；其余（三卡、judge 代批、高风险合并卡、append-only 审计、写区边界）不变。
5. **最大风险**：应用侧从「被动接收角色派发」升级为「主动驱动阶段」，任务创建/投递/报告观察/收口的恢复语义必须 fail-closed；与 v2.1.0 在飞 fixed workflow 必须按协议版本隔离，禁止中途换驱动。

---

## 一、口径演进与最终确认（只列结论）

| 时点 | 口径 | 处置 |
| --- | --- | --- |
| 2026-11-17 客户首条指令 | 引入工作流引擎；幕僚只能选流程、不能派发 agent；运营只能派 worker、不能派内置角色 | 记为变更起点 |
| 同日协调方追加 | 选用成熟开源引擎并做选型 | **已取消**（客户最终决定不引入开源引擎） |
| 同日协调方中间稿 | 「任务一律由引擎派发，人不再派发」 | **被最终口径收敛**：worker 仍由运营派发 |
| **同日最终口径（以此为准）** | 内置角色任务由应用侧按流程定义派发；worker 由运营派发；幕僚只选流程；独立验收由应用侧派发 | 本记录 §二–§七 全部按此展开 |

- 本记录**不包含**开源引擎选型矩阵、PoC 计划或迁移到第三方引擎的内容；「流程驱动」即应用侧确定性执行器。
- 与 T3 的关键差异：T3 的「幕僚逐阶段发 stage-request → 运营派全部生产线角色（含内置）→ 幕僚派验收」被替换为「幕僚只选流程 → 应用侧驱动内置角色 → 运营只派 worker → 应用侧派验收」。T3 的**流程形状**（两条路径、阶段、卡、审计、Git 普通用法）保留。

---

## 二、角色职责与「角色动作 vs 应用侧流程驱动动作」矩阵

### 2.1 最终派发权矩阵

| 来源 | 目标 | 目的 | 结论 | 稳定码 |
| --- | --- | --- | --- | --- |
| 应用侧流程驱动（非角色） | 内置 product / rapporteur / nominator / convener / verifier（按阶段定义） | stage-execution | **允许**（应用直接创建任务；不受角色派发谓词约束，但仍受阶段/定义/幂等/边界约束） | — |
| 应用侧流程驱动 | chief | card-prompt | **允许**（只发卡 prompt，不授予任何裁决权） | — |
| 幕僚 chief | 任意 agent（含 convener / verifier / 内置 / 项目角色） | 任意 | **拒绝**：固定会话不注入 `dispatch_task`；越权调用 fail-closed | `chief-dispatch-removed`（新） |
| 运营 convener | 项目 worker（targetKind=project） | production | **允许**，仅当绑定自身 open 的 `worker-dispatch` 任务，且 moduleId/属主/写集/名单校验通过 | `worker-dispatch-required`（新） |
| 运营 convener | 任意内置（product / rapporteur / nominator / verifier / chief） | 任意 | **拒绝** | `convener-builtin-dispatch-forbidden`（新） |
| 项目角色 / 其它 | 任意 | 任意 | **拒绝**（维持现状） | `unknown-source` |
| 任意 | 自身 | — | **拒绝**（维持现状） | `self-dispatch` |

- **[事实]** v2.1.0 现行固定矩阵：幕僚可派 `convener`（仅 stage-request）与 `verifier`（review），见 `src/common/编排/workflow-dispatch.ts`（`FIXED_CHIEF_BUILT_IN_TARGETS = ["convener","verifier"]`、`evaluateFixedPathDispatchAuthorization`）；运营可派 `product/rapporteur/nominator`（`FIXED_CONVENER_BUILT_IN_TARGETS`）与项目 worker；运营→verifier 拒绝。
- **[设计]** 本变更把两个内置目标集**清零**：幕僚无任何派发目标；运营无任何内置目标。应用侧任务创建不走 `evaluateFixedPathDispatchAuthorization`，由流程驱动按定义与阶段事实直接建任务，并在建任务前执行同等强度的目标枚举/阶段/幂等校验。

### 2.2 角色动作 vs 应用侧动作（含相对 v2.1.0 的增删）

| 动作 | v2.1.0 现行 | 本设计目标 | 变化 |
| --- | --- | --- | --- |
| 选择流程（新增/修改） | 幕僚以首个 `stage-request` 的 `workflowPath` 隐式选择 | 幕僚显式调用 `select_workflow`（A/B）；应用校验后写 `workflow.started` 并启动驱动 | **新增工具；语义从隐式变显式** |
| 阶段推进 | 幕僚逐阶段发 `taskKind:"stage-request"`（chief→convener），并逐次收口 | 应用侧流程驱动按合法转移自动推进；幕僚不再参与 | **删除幕僚逐阶段请求/收口** |
| 内置角色任务创建/投递 | 运营派 product/rapporteur/nominator；幕僚直派 verifier | 应用侧按阶段定义直接创建并投递 | **派发者从角色移到应用** |
| 客户卡（意图/方案/任命） | 幕僚 `request_choice` 发起并呈交 | 应用按阶段开卡（`request.created` + `card-prompt` 任务）；幕僚按 prompt 呈交；内容/选项/documentRefs/时序由应用生成 | **发起者改为应用；幕僚保留呈现** |
| 独立验收派发 | 幕僚直派 verifier（或 reviewRoleId 项目验收角色） | 应用侧直派同一组目标；验收强度由流程定义参数控制 | **派发者从幕僚移到应用；独立性保持** |
| worker 派发 | 运营派项目角色（绑定幕僚 open stage-request） | 运营派项目角色（绑定应用 open `worker-dispatch` 任务） | **语义不变；绑定来源从幕僚改为应用** |
| 团队计划 / 基线准备（A9） | 运营在幕僚 A9 stage-request 内执行 | 运营在应用 A9 `stage-execution` 任务内执行 | **执行者不变；驱动来源变更** |
| 集成汇总 / 交付（A13/B4） | 运营汇总 → 幕僚向客户交付/发布 | 运营汇总 → 应用构造 `merge-main` 卡 → 客户本人确认 → 应用合并 | **交付壳改为应用；幕僚退出** |
| 停止 / 改道 | 幕僚先收口 open advance，再发 `workflowAction:"stop"` stage-request | 应用/客户停止命令；应用停投递、收口 open 任务、核停稳证据 | **幕僚不再具备停止动作** |
| 阶段重试 / 返工 | 幕僚收口 rework + 重新发请求 | 应用按验收报告/定义策略记录 `stage.reworked` 并重发阶段任务 | **驱动改应用** |
| 验收强度 | 幕僚调节（轻量/完整） | 流程定义参数（可在选流程时给定），应用执行 | **[默认] 见 §八 Q2** |
| 审计 / judge / 高风险 | append-only、judge 代批、merge-main 客户本人 | 不变 | **不变** |

### 2.3 各角色残余职责（终态）

- **幕僚**：客户唯一入口；调用 `select_workflow` 选择流程；按应用发放的卡 prompt 呈交意图/方案/任命三卡并解释；不得派发、不得收口任务、不得重派、不得停止、不得直派验收。
- **运营**：只派 worker（项目实现/分析角色）；撰写团队计划；执行基线准备（`complete_team_plan`）；执行 A9/B4 内容任务；收口自己创建的 worker 任务；集成汇总；不再派任何内置角色。
- **产品 / 策划 / 人事 / 验证**：内容产出与报告；任务由应用侧创建；报告用 `submit_report` 回交（应用观察 `task.reported`）；人事继续用 `activate_role_documents` 建卡/激活；验证继续写 criteria/report；均无派发。
- **项目 worker**：实现/分析、任务分支提交、报告；任务由运营派发；报告回运营。

---

## 三、阶段 → 执行者表（A1–A13 / B1–B4）

> 「应用」= 应用侧流程驱动（`workflow-service`）；「任务」= `task.created` + 投递；「完成」= 应用按既有完成条件判定并写 `stage.completed`。阶段 id、合法转移与返工边沿用 `src/common/编排/workflow-state.ts`（`WORKFLOW_STAGE_TRANSITIONS`、`WORKFLOW_REWORK_FALLBACKS`），本表不改转移语义。

### 3.1 路径 A：新增

| 阶段 | 执行者 | 任务由谁创建 | 客户卡 | 完成判定（应用） | 相对 v2.1.0 |
| --- | --- | --- | --- | --- | --- |
| A1 产品受理/准备 | product（内置） | 应用（`stage-execution`） | — | 任务创建即完成（沿用 `DISPATCH_COMPLETES` A1/A4/A7） | 原：chief stage-request → convener 派 product |
| A2 意图撰写 | product | 应用 | — | 任务 accepted + 意图文档/hash 可算 | 原：运营派 |
| A3 意图确认 | 应用开卡；**幕僚呈卡** | 应用（`card-prompt` → chief） | **卡① intent-confirm** | `request.resolved` confirm + 意图入口一致 | 原：幕僚自行开卡；现内容/时序由应用给 |
| A4 策划受理/准备 | rapporteur | 应用 | — | 任务创建即完成 | 原：运营派 |
| A5 方案/名单/模块/架构/契约 | rapporteur | 应用 | — | 任务 accepted + 文档/schema/hash | 原：运营派 |
| A6 方案确认 | 应用开卡；幕僚呈卡 | 应用（`card-prompt`） | **卡② proposal** | `request.resolved` accept（documentRefs 应用计算） | 同上 |
| A7 人事受理/准备 | nominator | 应用 | — | 任务创建即完成 | 原：运营派 |
| A8 建卡/激活 | nominator | 应用 | — | 全部名单角色 `role.activated` + 文档 hash | 原：运营派 |
| A9 团队计划 + 基线 3 件小事 | convener | 应用（`stage-execution`） | — | `basis.recorded` + `stage.completed A9` | 原：幕僚 stage-request 内由运营执行 |
| A10 任命确认 | 应用开卡；幕僚呈卡 | 应用（`card-prompt`） | **卡③ appointment** | `request.resolved` appointment（targetRoleIds） | 原：幕僚自行开卡 |
| A11 实现 | 项目 worker | **应用建 `worker-dispatch` 任务 → 运营派 worker** | — | 全部实现任务 accepted + 分支 tip OID + basis 未漂移 | 原：chief A11 stage-request → 运营派 |
| A12a 验收标准 | verifier 或 reviewRoleId 验收角色 | **应用直派** | — | criteria 任务 accepted + hash（子步） | 原：幕僚直派 |
| A12b 验收报告 | verifier 或 reviewRoleId 验收角色 | **应用直派** | — | report accepted + hash + 应用归档 `docs/acceptance/*` | 原：幕僚直派并收口 |
| A13 集成/交付/发布 | convener 汇总 → 应用 | 应用（convener `stage-execution` + `merge-main` 卡） | 高风险卡 `merge-main`（应用自有；客户本人） | `release.merged` 或 `workflow.closed` | 原：运营汇总 → 幕僚交付/发布 |

### 3.2 路径 B：修改

| 阶段 | 执行者 | 任务由谁创建 | 客户卡 | 完成判定 | 相对 v2.1.0 |
| --- | --- | --- | --- | --- | --- |
| B1 影响面分析 | 默认模块属主 worker；契约/结构缺口用 rapporteur（按定义解析） | worker：应用建 `worker-dispatch` → 运营派；rapporteur：应用直派 | — | 分析任务 accepted + 报告 hash | 原：幕僚 B1 stage-request → 运营派 |
| B2 范围决定 | **应用**（确定性派生） | 不建任务、不发 stage-request | — | `change.scope-decided`（B1 报告 ∩ 名单模块属主 ∩ 角色边界） | 原：幕僚决定；现应用派生，歧义 fail-closed |
| B3 修改实现 | 项目 worker | 应用建 `worker-dispatch` → 运营派 | 高风险动作才出卡 | 全部实现任务 accepted + 提交 OID | 原：运营派（绑定幕僚请求） |
| B4 汇总/交付/发布 | convener 汇总 → 应用 | 应用（同理 A13） | `merge-main` 客户本人 | `release.merged` 或 `workflow.closed` | 原：运营汇总 → 幕僚交付 |

- **B2 说明**：现行 B2 由幕僚依据专业建议决定范围、应用在受理 B3 advance 时记录 `change.scope-decided`（v2.1.0 并已用 `b2-stage-request-forbidden` 防死锁，B34/RR31）。本设计把 B2 改为应用在 B1 完成后**确定性派生**（报告 + 名单 + 模块 + 边界），不再需要幕僚动作，也不再存在 B2 stage-request 死锁类。派生证据不足/归属不唯一 ⇒ `b-change-scope-invalid` 阻塞，不猜。
- **停止/阻塞**：任意阶段可被停止（应用/客户命令）；应用停投递、收口 open 任务、对 worker 会话要求运营停稳证据；不自动回滚 Git；`workflow.closed stopped` 的停稳证据沿用 v2.1.0 `confirmStop` 语义。
- **不新增阶段、不改 A12a/A11 并行关系**：A12a criteria 仍可在 A11 实现期间先行完成；A12b 在 A11 accepted 后派发。

---

## 四、派发协议与任务种类（应用侧）

### 4.1 任务种类（`task.created.taskKind`）

| taskKind | 来源 → 目标 | 用途 | 完成/收口 |
| --- | --- | --- | --- |
| `stage-execution`（新） | application → 内置执行者（product/rapporteur/nominator/convener/verifier） | 按阶段执行内容任务 | 报告 `task.reported` 后由**应用**按阶段完成条件收口（应用为创建者） |
| `worker-dispatch`（新） | application → convener | 请运营为某阶段派 worker（携阶段、模块清单、写集来源、验收要求） | 运营创建 worker 任务并 `close_created_task` 收口本任务（或按定义由应用收口；[默认] 运营收口，见 §八 Q6） |
| `card-prompt`（新） | application → chief | 请幕僚呈递指定客户卡（carries `promptId`、`cardKind`、`documentRefs`、选项/推荐集） | `request.resolved` 后由应用收口 |
| `stage-request` | chief → convener | **仅 v2.1.0 在飞协议兼容**；新协议不再产生 | 旧逻辑保留直至在飞 workflow 关闭 |

### 4.2 任务来源与报告路由

- **[设计]** `task.created.from` 增加 `"application"`；`task.closed.by` 同步增加 `"application"`。旧值 `"chief" | "convener"` 原样保留，旧记录读取不变。
- **[事实]** 现行 `TaskCreatedEvent.from` 类型为 `"chief" | "convener"`（`src/model/runtime.ts:1383`）；`reportTargetForTaskCreator` 仅对 chief/convener 返回角色 id，其余返回 `null`（`src/common/编排/workflow-preconditions.ts`）。
- **[设计]** 应用创建的任务：`reportTargetForTaskCreator` 返回 `null`，`submit_report` 只写 `task.reported` 到账本，由应用驱动观察事件后收口；不唤醒第二个角色，避免形成「应用→角色→应用」的额外消息面。不变量：报告只是报告，收口由真实创建者（应用）按完成条件判定。
- **[设计]** 内置执行者收到的任务不允许再派发（能力位维持 false/deny）；项目 worker 只能由运营在其 open `worker-dispatch` 任务内派发。

### 4.3 幂等键与恢复

| 对象 | 幂等键 |
| --- | --- |
| `select_workflow` 启动 | `workflow-start:<flowId>:<path>:<sourceTaskId>`（沿用） |
| 内置阶段任务 | `stage-exec:<workflowId>:<stage>:<executorRoleId>:<attempt>` |
| worker-dispatch 任务 | `worker-dispatch:<workflowId>:<stage>:<attempt>` |
| card-prompt | `card-prompt:<workflowId>:<stage>:<requestId>` |
| 收口 | `operationId`（沿用 v2.1.0 `closeTask` 幂等） |

- **恢复顺序（fail-closed）**：先写账本事件并携带 `taskId`，再创建任务；重启时应用对每个 open 阶段校验「事件存在且任务存在且投递状态一致」；任务缺失 ⇒ 用事件携带的 `taskId` 幂等重建；重复投递 ⇒ 幂等键抑制；任何不一致 ⇒ `workflow-corrupt`，不猜、不自动推进。
- **不做第二事实源**：不引入任何引擎快照/第二份状态库；`.ans/state/workflows.jsonl` + `tasks.jsonl` 仍是唯一依据；所有驱动判定可从账本重放。

### 4.4 流程定义注册表（应用内、类型化）

- **[设计]** 新增应用内流程定义（如 `src/common/编排/workflow-definitions.ts`）：每条定义含 `id`（`add` / `modify`）、`version`、`stages[]`（阶段、执行者类别与解析规则、任务文本模板、sideEffect、完成条件、客户卡、返工边、超时/重试策略）；定义随应用发布，**模型/角色不可编辑**，`select_workflow` 的取值来自注册表枚举。
- **[设计]** `workflow.started` 记录 `definition:{id,version,sha256}` 与 `protocol:"app-dispatch/v1"`；在飞 workflow 固定其定义版本，新版本只影响新 workflow；不做静默迁移。
- **扩展**：新增流程 = 注册表新增定义 + 测试；不改角色权限模型、不改客户卡机制。

---

## 五、客户卡（human task）与 judge 代批

- **开卡**：A3/A6/A10 由应用创建 `request.created`（应用计算 `documentRefs`：intent/proposal/modules/roster/architecture 的 path+sha256），并向幕僚创建 `card-prompt` 任务（携带 `promptId`）。幕僚以 `request_choice` 呈卡时，`cardKind`、选项、推荐集、`documentRefs` 必须与 prompt **逐项一致**；不一致 ⇒ `card-prompt-mismatch`，不发卡、不写记录。
- **呈现**：沿用现有客户卡通道与幕僚窗口（客户唯一入口）。幕僚可解释卡片内容，但不得增删选项、不得改写 documentRefs、不得自批、不得代客户选。
- **等待与恢复**：应用等待 `request.resolved`；默认不自动超时、不默认通过。应用重启后：`request.created` 未决 ⇒ 幂等重呈（同一 requestId）；已决 ⇒ 驱动继续；request 与 prompt 不一致 ⇒ `workflow-corrupt`。
- **judge 代批**：不变。`intent-confirm` / `proposal` / `appointment` 属 `decision` 组（`GOVERNANCE_CARD_GROUP`），顶部「替我决策」开启且真实委托时由 judge 按既有证据包与合法选项代选；judge 不冒充客户，审计来源 `judge-delegated`。`merge-main` 继续为应用自有非判断卡，**客户本人**确认，judge 只能转人工/拒绝。
- **卡预算**：仍为 3 张确认卡 + `merge-main`（+ 材料性选择/需求变更 `decision` 卡，按既有口径不计入三卡）；不新增客户可见门。不出现额外 shell 审批卡/stable-write 卡（固定路径不注入对应工具）。
- **[待确认] 呈现方式备选**：若协调方希望应用直接开卡呈现、幕僚只解释，则 `card-prompt`/`request_choice` 可收为应用自有卡（judge 分组已支持）；本记录默认「幕僚按 prompt 呈卡」（见 §八 Q1），以保留客户唯一入口与既有卡通道。

---

## 六、能力面变更清单（逐项）

### 6.1 工具/能力位

| 角色 | 项 | v2.1.0 现状 | 目标 | 方式 |
| --- | --- | --- | --- | --- |
| 幕僚 chief | `dispatch_task` | 固定会话注入；可派 convener（stage-request）与 verifier | **不再注入**（固定会话） | run-role fixed 注入过滤；模块能力位保持 legacy 冻结 |
| 幕僚 | `close_created_task` | 固定会话注入（收口 stage-request） | **不再注入** | 同上 |
| 幕僚 | `redispatch_task` / `terminate_role_run` | 固定会话注入（chief-only） | **不再注入**（重试/停止归应用） | 同上 |
| 幕僚 | `request_choice` | 自行发起三卡 | **保留**，但绑定应用 prompt（新增 `promptId` 校验） | schema 增可选字段 + run-role fixed 校验 |
| 幕僚 | `select_workflow`（新） | 无 | **新增**（仅 chief、仅 fixed；枚举 A/B） | 新 `RoleToolId`（接口评审） |
| 幕僚 | `project_state` / `doc_format` / `governance_matrix` / `project_note` / `role_activity_log` | 只读/备注 | 保留 | 不变 |
| 运营 convener | `dispatch_task` | 固定矩阵：product/rapporteur/nominator + 项目 worker | **保留，仅项目 worker**；内置目标清零 | `workflow-dispatch.ts` 目标集清零 + 模块 fixed 数据置空 |
| 运营 | `close_created_task` | 固定会话注入 | 保留（仅收口自己创建的 worker 任务） | 不变 |
| 运营 | `complete_team_plan` | 固定会话注入 | 保留（A9 内容动作） | 不变 |
| 运营 | `decision` 卡 | 保留 | 保留（材料性选择/需求变更） | 不变 |
| 运营 | `submit_refactor` / `request_stable_write` | legacy 绑定 | 固定不注入（确认现状） | 不变 |
| 产品/策划/人事/验证 | 派发能力 | false/deny | 不变 | 不变 |
| 人事 | `activate_role_documents` | 固定 v2 | 保留（A8 内容动作） | 不变 |
| 验证 | `acceptance` 卡 | 固定抑制 | 不变 | 不变 |

### 6.2 模型 / 协议 / 文本

| 项 | 变更 |
| --- | --- |
| `TaskCreatedEvent.from` | 增 `"application"`（旧值保留） |
| `TaskClosedEvent.by` | 增 `"application"` |
| `taskKind` 枚举 | 增 `stage-execution` / `worker-dispatch` / `card-prompt`；`stage-request` 保留兼容 |
| `workflow.started` | 增 `protocol:"app-dispatch/v1"` 与 `definition:{id,version,sha256}`；旧记录缺省按 `fixed-v2.1` 解释 |
| `request.created` / `request_choice` | fixed 增 `promptId`（应用写入/校验）；旧卡不传=旧行为 |
| 派发谓词 | `workflow-dispatch.ts` fixed 矩阵：幕僚目标集空；运营内置目标集空；运营 worker 需 `worker-dispatch` 证据 |
| 稳定码 | 新增 `chief-dispatch-removed`、`convener-builtin-dispatch-forbidden`、`worker-dispatch-required`、`card-prompt-mismatch`、`workflow-definition-unknown`、`workflow-definition-version-unsupported`；保留 v2.1 既有码用于兼容 |
| 角色文本 | 新增 `chief-workflow-v3.md`（fixed 只选流程+按 prompt 呈卡；v2 保留给在飞协议）；运营 fixed context 删内置派发、增 worker-dispatch 语义；其余内置角色 fixed context 注明任务来源=应用 |
| `contract_check` / `doc_format` / `governance_matrix` / i18n | 同步 fixed 口径与任务种类；legacy 文案不改 |
| 应用服务 | `workflow-service.ts` 增流程驱动（建任务/观察报告/收口/卡 prompt/定义注册表）；`requestStage` 仅为 v2.1 在飞协议保留（compat-only） |

### 6.3 不改项

- 六内置角色与项目角色的**边界模型**、角色卡格式、写区归属不变。
- 三张确认卡、judge 代批、merge-main 客户本人、高风险清单、append-only 审计、shell 审计、doc_format、Git 普通用法（v5）不变。
- 不新增角色、不新增客户可见门、不做 UI 改版。

---

## 七、状态机、失败面与审计

### 7.1 状态机

- 阶段集合、合法转移、返工边、`DISPATCH_COMPLETES`（A1/A4/A7）、A12a/A11 并行、A12b→A11 返工、A13/B4 关闭：**全部沿用 v2.1.0**（`workflow-state.ts`）。
- 变化只在**驱动者**：`stage.requested` 由应用驱动直接产生（不再由 chief stage-request 触发）；`stage.dispatched` 由应用建任务时记录（`issuedBy:"application"`，`executorKind:"built-in" | "worker-dispatch" | "review"`）；`stage.completed` 由应用按完成条件写入；`change.scope-decided` 由应用在 B1 完成后派生。
- 非法转移、未知阶段、未知定义/版本、卡 prompt 不匹配、worker 派发未绑定任务：一律 fail-closed，不建任务、不投递、不写完成事件。

### 7.2 失败与恢复

| 失败 | 码 | 处理 |
| --- | --- | --- |
| 未知流程 / 定义版本 | `workflow-definition-unknown` / `workflow-definition-version-unsupported` | `select_workflow` 拒绝；不启动 |
| 阶段非法转移 | `stage-transition-invalid`（沿用） | 拒绝；不建任务 |
| 内置执行者不可用 | `professional-role-unavailable`（沿用） | `stage.blocked`；回报客户/运营；不自动跳过 |
| 运营越权派内置 | `convener-builtin-dispatch-forbidden` | 拒绝；不建任务 |
| 运营 worker 派发无绑定 | `worker-dispatch-required` | 拒绝；不建任务 |
| 卡 prompt 不一致 | `card-prompt-mismatch` | 拒绝发卡；重发 prompt 或 blocked |
| 账本/任务不一致 | `workflow-corrupt` | 停止自动推进；交人核对 |
| 投递/会话失败 | 既有投递失败面 | 保持任务 open；重试投递；不伪造报告 |
| 停止停稳不明 | `workflow-stop-unconfirmed`（沿用） | 不写 stopped；保留现场 |
| B2 派生歧义 | `b-change-scope-invalid`（沿用） | 阻塞；不猜范围 |

- **重试**：按定义的有界重试（attempt+1、新幂等键）；高风险任务零自动重派（沿用 watchdog 语义）；重试不覆盖旧 attempt 事件。
- **重启恢复**：应用启动/打开项目时对活动 workflow 做一次对账（事件、任务、投递、卡状态）；只做幂等修复，不做语义猜测。

### 7.3 审计

- `.ans/state/workflows.jsonl`：`workflow.started`（含定义与协议版本）、`stage.requested/dispatched/completed/blocked/reworked`、`change.scope-decided`、`role.activated`、`workflow.stop-requested/stop-unconfirmed/closed`。
- `tasks.jsonl`：`task.created`（`from:"application"`）、`task.delivered/reported/closed`、`request.created/presented/resolved`（含 `promptId`/`documentRefs`）。
- `docs/audit/shell-gate.jsonl`、`releases.jsonl`、`basis.jsonl`：不变。
- judge 审计来源不冒充客户；merge-main 无 judge 来源。

---

## 八、风险与未决项

### 8.1 主要风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 应用侧主动驱动后，任务创建/投递/收口的恢复语义不完整 | 阶段卡死、重复投递、账本与任务不一致 | 事件先写且携带 taskId；幂等重建；启动对账；`workflow-corrupt` fail-closed；崩溃点矩阵测试 |
| 幕僚工具面收窄不彻底 | 旧指令诱导幕僚派发/收口/停止 | 固定会话不注入对应工具；谓词双保险；角色文本 v3 明示；负例测试 |
| 运营仍可派内置角色 | 派发权分裂回退 | fixed 内置目标集清零 + `convener-builtin-dispatch-forbidden` + 矩阵测试 |
| 卡 prompt 与卡记录不一致 | 客户卡失真/客户主权受损 | prompt 逐项校验；应用计算 documentRefs；provider 侧不采信模型自报 |
| 在飞 v2.1.0 workflow 与新协议混用 | 阶段状态被两种驱动同时写 | 协议版本钉死：旧 workflow 继续旧驱动直至关闭；新 workflow 才用新协议 |
| B2 应用派生范围错误 | 越界写/漏改 | B1 报告 + 名单 + 模块 + 边界四项派生；歧义 fail-closed；不采信模型自报 |
| `from:"application"` 破坏旧消费者 | 报告路由/卡片/状态展示异常 | 类型扩展 + 旧值保留；旧消费者对未知来源 fail-closed 或只读忽略；全组合测试 |
| 内置任务收口从角色移到应用 | 完成判定遗漏/提前完成 | 完成条件沿用 v2.1.0 既有判定（`closeTask` / `deriveWorkflowView` 的完成条件）；先报告后收口；幂等 |
| 验收独立性弱化 | 质检被生产侧影响 | 验收任务由应用直派、与运营 worker 派发分离；reviewRoleId 应用核验；审计留痕 |
| 角色文本/矩阵/代码三处漂移 | 口径不一致 | 文本、矩阵、schema 同一批更新；contract/差分测试 |

### 8.2 未决问题（问题 + 推荐默认）

| # | 问题 | 推荐默认 |
| --- | --- | --- |
| Q1 | 三张客户卡由幕僚按应用 prompt 呈，还是应用直接呈、幕僚只解释？ | **[默认]** 幕僚按 prompt 呈（保留客户唯一入口与既有卡通道；judge 分组不变）；应用直呈作备选 |
| Q2 | 验收强度（轻量/完整）由谁定？ | **[默认]** 流程定义参数；`select_workflow` 可选携带；默认「标准」；轻量验收的 A12b blocked 处置按定义策略执行并审计 |
| Q3 | 项目验收角色（roster `roles[].review===true`）由应用直派还是运营派？ | **[默认]** 应用直派（与内置 verifier 同一条验收线，保持与生产派发独立） |
| Q4 | B2 范围决定是否保留幕僚裁量？ | **[默认]** 取消裁量：应用确定性派生；歧义 fail-closed 并上报客户/运营 |
| Q5 | 停止/终止由谁触发？ | **[默认]** 客户（卡/UI）或应用策略；幕僚不再具备停止工具；停稳证据沿用 `confirmStop` |
| Q6 | `worker-dispatch` 任务的收口者？ | **[默认]** 运营收口（运营是 worker 任务创建者）；应用只以阶段完成条件判定阶段完成 |
| Q7 | 客户能否直接指定流程（绕过幕僚）？ | **[默认]** 客户可在会话中明示，幕僚据此 `select_workflow`；应用不做自然语言自动分类 |
| Q8 | `stage-execution` 任务失败后的重试上限？ | **[默认]** 每阶段 1 次自动重试，其后 `stage.blocked` 交客户/运营；高风险零自动重派 |
| Q9 | 流程定义的数据形态？ | **[默认]** 应用内类型化注册表（TS 常量 + JSON Schema 导出 + 定义 hash）；不引入 DSL、不允许模型编辑 |
| Q10 | 在飞 v2.1.0 fixed workflow 是否迁移？ | **[默认]** 不迁移：协议版本钉死，旧 workflow 走旧驱动直至关闭；只在新 workflow 使用新协议 |

---

## 九、兼容与迁移

### 9.1 与现有 `workflow-service` / stage-request 代码的复用、改造、废弃清单

| 代码/机制 | 处置 | 说明 |
| --- | --- | --- |
| `workflow-state.ts`（转移表、返工映射、`deriveWorkflowView`、完成判定） | **复用** | 阶段语义与新驱动共用；不改转移/返工边 |
| `workflow-service.ts` 账本/幂等/`closeTask` 完成条件/`prepareIntent`/`finalizeIntent`/`recordBasis`/`archiveAcceptance`/`prepareReleaseMerge`/`executeReleaseMerge`/`completeTeamPlanFixed`/`activateRoleDocumentsFixed` | **复用** | 能力内核不变；新增应用侧驱动调用面 |
| `workflow-service.ts::requestStage` 与 `taskKind:"stage-request"` | **兼容保留（compat-only）** | 仅供在飞 `fixed-v2.1` workflow；新协议不产生 |
| `workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization` | **改造** | 固定目标集：幕僚 ∅；运营内置 ∅；运营项目 worker 需 `worker-dispatch` 证据；legacy 谓词不动 |
| `closeTask` 创建者校验 / `task.closed.by` | **改造** | 增 `"application"` 来源（应用收口内置任务/卡 prompt） |
| `fixed-workflow/route.ts`（worker 派发路由、写集门、B 启动门） | **改造** | 绑定从 chief stage-request 改为应用 `worker-dispatch` 任务；其余安全门保留 |
| `fixed-workflow/cards.ts`、`card-gateway.ts`、judge / `GOVERNANCE_CARD_GROUP` | **复用** | 三卡/merge-main/judge 语义不变；卡来源改应用 prompt |
| `chief-workflow-v2.md` | **兼容保留** | 在飞 v2.1.0 会话继续注入；新协议注入新资源 v3 |
| `workflowService.closeTask` 的幕僚专用轻量 A12b 决策 | **改造** | 验收强度改定义参数；轻量验收审计口径保留，决策者从幕僚改为定义策略/应用 |
| 幕僚 `dispatch_task` / `close_created_task` / `redispatch_task` / `terminate_role_run`（固定会话） | **废弃** | 固定会话不再注入；legacy 与在飞协议不动 |
| 运营 → 内置角色派发（fixed） | **废弃** | 目标集清零；改为应用直派 |
| `stage-request-required` 证据（fixed） | **废弃（新协议）** | 由 `worker-dispatch-required` 替代；旧协议继续使用旧码 |

- **协议版本**：`workflow.started.protocol` 缺省 = `fixed-v2.1`（现存记录）；新协议 = `app-dispatch/v1`。应用按协议分派驱动：
  - `fixed-v2.1`：`requestStage` + chief stage-request + 旧派发矩阵，**逐字保留**直至 workflow 关闭；
  - `app-dispatch/v1`：本记录的流程驱动与新派发矩阵。
  - 禁止同一 workflow 中途切换协议；`project_state` 展示协议版本与提示。
- **legacy 项目/flow**：`workflowMode` 判定与 legacy 路径完全不变。
- **测试**：
  - legacy 断言不改（`test/编排/workflow-preconditions.test.ts`、`test/桌面应用/star-routing.test.ts`、`test/roles/**` 等）；
  - v2.1.0 固定路径断言按协议保留（在飞兼容），新增 `app-dispatch` 协议用例；
  - 新增：定义注册表校验（阶段全覆盖、转移合法、返工边、每阶段执行者/完成条件）、应用建任务/收口、卡 prompt 精确匹配、运营越权内置拒绝、worker 绑定、重启对账、崩溃点矩阵、B13–B34 回归；
  - `test/测试/fixed-path-full-chain.test.ts` 增加新协议全链；真实全链一次（空项目→贪吃蛇）另行授权。
- **B13–B34 修复保留**：应用计算 hash（B17/B23）、A3 卡门（B24）、团队计划回执形状（B25/B29）、模块写集派生（B26）、实现 worker 禁 shell（B27/B28）、A12b 轻量验收（B31）、提交引号（B32）、B2 死锁（B34）等语义在新协议下必须保持；任务文本模板迁入流程定义时逐条保留。
- **Gate/验收**：本记录作为设计确认材料（客户/协调方确认后放行实施）；第一步由协调代理在 `feat/app-dispatch-builtins` 实施，验收标准至少覆盖：①幕僚固定会话无派发/收口/重派/停止工具；②运营仅项目 worker 可派且需绑定；③应用建任务/观察报告/收口幂等可恢复；④阶段转移与完成判定与 v2.1.0 等价；⑤三卡+merge-main 与 judge 不弱化；⑥在飞协议隔离；⑦零新依赖；⑧legacy 测试零回归。
- **不合并/不发布**：本记录不构成实施授权或验收；合并与发布仍按客户逐次放行。

---

## 十、非目标与披露

- 不引入开源工作流引擎/DSL/第三方运行时；不新增依赖；不做引擎选型与 PoC（客户已决定取消）。
- 不改六内置角色与项目角色的边界模型；不新增角色；不新增客户可见门；不做 UI 改版。
- 不删除 v2.1.0 旧机器（`requestStage`/stage-request/旧矩阵）——保留为在飞协议兼容；清理另立变更。
- 不改变客户主权、judge 代批、merge-main 客户本人、高风险清单、append-only 审计与写区边界。
- 本文为设计记录（简版），未实施；实施与验收以 `feat/app-dispatch-builtins` 的记录为准。

---

*本文件供协调方/客户确认与实施对照；不构成实施授权、验收或客户批准。*
