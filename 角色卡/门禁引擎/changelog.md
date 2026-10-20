# 门禁引擎 变更记录

## 2026-10-20 — 流程文件方法化工具（flow_get / flow_step_update / flow_step_supersede）角色卡纪律（客户拍板）

客户已拍板：「按这个方案做吧。」流程文件改为方法化工具：`flow_get`（所有角色读取）、
`flow_step_update`（更新步骤状态，`expectedRevision` 必填；Steward 可更新全部、步骤 owner 只更新
自己的步骤；`done` 必须带账本可对账 evidence）、`flow_step_supersede`（仅 Steward，旧步骤
superseded + 新步骤 pending）。本批只在**门禁引擎**边界内更新卡文本，不改判定逻辑、不实现工具。
完整记录见[变更记录](docs/change/2026-10-20_change_flow-tools-card-discipline.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、
  `test/门禁引擎/governance-standard-workflow.test.ts`、本文件、`memo.md`、
  `docs/change/2026-10-20_change_flow-tools-card-discipline.md`（新）。未碰
  `src/common/编排/**`、`src/provider/**`、`app/**`、`test/测试/**`、`src/service/**`、
  其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **Steward / 统筹**：流程 YAML **初始创建**仍用 `request_confirmation`（`cardKind=schedule-write`）；
  创建后步骤状态推进优先用 `flow_get` + `flow_step_update`（`dispatched` / `delivered` / `done` /
  `failed` / `blocked`），返工用 `flow_step_supersede`；不再为每次状态更新写文件/发写卡；
  不直接 `write_file` 流程 YAML（初始创建除外，且按现有写卡门）；`done` 前必须有账本可对账
  evidence；`expectedRevision` 来自最近一次 `flow_get`（或更新回执）的 revision，`revision-conflict`
  重读后再改、不盲目重试；步骤推进 ≠ 客户批准，需要客户决定的步骤仍走客户交互工具。
- **Crew / Draft / Proof**：用 `flow_get` 读取流程与自己负责的步骤；**不得直接写 `docs/flows/**`**；
  你只能更新自己负责的步骤：交付/回交后按账本证据用 `flow_step_update` 记录状态；证据不足
  （`insufficient-evidence`）如实报告、不把步骤标 `done`；四卡统一 expectedRevision/`revision-conflict`
  纪律；保留 id `verification` / `acceptance` 仍按既有验收卡流程。Draft 契约冻结、Crew 角色就绪、
  Proof 核对完成各有落点。
- **保留**：现有 `request_confirmation` / `cardKind` / `schedule-write` 作为初始创建与迁移兼容保留，
  未删除旧路径；五卡权力/职责/Section 1/预授权/禁写/能力位、shell 审批档、质量基线、治理卡参数、
  判断代批/deny 纪律与 flow YAML schema 契约逐字未改；Lead 本批未改。
- **测试**：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **285 计 / 284 过 / 0 红 / 1 skip**
  （基线 280/279/0/1；新增 1 例：三工具关键字、Steward 初始创建例外、禁止直接写 docs/flows、
  expectedRevision/`revision-conflict` 重读、证据不足不标 done）。既有断言按新契约更新、未放宽；
  `npm run typecheck` ⇒ **exit 0**。
- **跨角色待办（未越界）**：① 编排/运行时核心实现三工具，工具名/参数名须与卡文本一致；② 权限
  （Steward 全部 / owner 自己）与 `done` 账本证据对账必须机械执行；③ `flow_get` 的 revision 需可
  原样回传 `expectedRevision`，`revision-conflict` 结果名/形状须对齐；④ 初始创建 `schedule-write`
  旧路径保留；⑤ `verification` / `acceptance` 既有验收规则不变；⑥ 若后续要求 Lead 读取流程，
  另批更新。
- **残余风险**：卡文本是行为约束，是否先 get 再 update、冲突后是否重读无机械检查；`idempotencyKey`
  可选；旧写卡路径仍保留；真机端到端与独立复验未进行。来源：客户拍板「按这个方案做吧」（经协调方转达）。

## 2026-10-19 — 写卡被 declined 时按 reason 修正后重发确认卡；judge deny 不是客户决定（真机反馈）

真机：Crew 的 `appointment-write` 写卡内容不合规（README 归属未在提名写区表定案、tester
`boundary.yaml` 混入 Markdown 散文），判断 agent 只能 manual，客户被迫手批。客户要求判断 agent
拒绝并把原因退回 Crew 重做；编排给 approval 组增加 `deny`，桌面把 deny 转成 `declined` + 原因回投
发起角色。本批只在**门禁引擎**边界内补角色卡纪律，不改产品判定逻辑。完整记录见
[变更记录](docs/change/2026-10-19_change_declined-rewrite-discipline.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、
  `test/门禁引擎/governance-standard-workflow.test.ts`、本文件、`memo.md`、
  `docs/change/2026-10-19_change_declined-rewrite-discipline.md`（新）。未碰
  `src/common/编排/**`、`app/**`、`test/测试/**`、`src/service/**`、其他角色文件/测试、
  真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **Crew / 组队**：标准工作流 appointment-write 第 4 步增补 declined 处理；新增「**写卡被拒
  （declined）时（必须）**」段——按 `reason` 修正待写内容后**重新发确认卡**；不得绕过确认、
  不得直接 `write_file`、不得把原因当客户已同意；仍被拒则继续修正/如实报告，不循环空转、
  不重复提交同一份未修正内容。
- **Steward / 统筹**：确认卡约定后新增同款段——写流程状态 YAML 或排程写卡被 `declined` 时按
  `reason` 修正后重发确认卡；写卡完成/角色枚举出现后，按流程 YAML 继续下一步
  （派发/回交/登记），不要等客户催办。
- **五卡共同**：判断代批纪律段后新增——judge `deny` 是系统审批拒绝（拒绝本次写盘/命令），
  不是客户决定，不写入客户决定账本；不得把它当作客户意见或同意。
- **逐字保留**：五卡权力/职责/Section 1/预授权/禁写/能力位、shell 审批档、工程质量基线、
  治理卡参数、既有判断代批纪律与 flow YAML 契约均未改；未改任何判定逻辑。
- **测试**：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **284 计 / 283 过 / 0 红 / 1 skip**
  （基线 280/279/0/1；新增 1 例，覆盖 Crew/Steward declined 关键字与顺序、五卡 judge deny 定性）。
  既有断言未放宽、未删除；`npm run typecheck` ⇒ **exit 0**。
- **跨角色依赖（未越界）**：① 编排 approval 组需实现 `deny` 与 declined+原因回投；若运行时结果名
  不是 `declined`，须同批对齐卡文本；② 桌面需把 deny 转成 declined+原因回投，且不得记成客户决定/
  写入客户决定账本；③ 判断 agent 需真的能对不合规写卡内容返回 `deny` 与可操作 `reason`；
  ④ 在该通道落地前，卡文本纪律是行为约束，真机仍可能 manual。
- **残余风险**：重发/空转防护只有文本纪律，无机械次数上限；`deny` 不入账本需编排/桌面实现；
  真机端到端与独立复验未进行。来源：真机反馈与客户要求（经协调方转达）。

## 2026-10-19 — 五张内置卡流程状态统一为 YAML（唯一机器状态），Steward 标准工作流改写 YAML（客户决定）

客户原话：「这些全部改成yaml。」客户决定：流程状态改为 `docs/flows/<flowId>.yaml` 作为**唯一机器
状态**，`docs/flows/<flowId>.md` 仅人读视图；Steward 标准工作流必须写 YAML，用显式
`kind` / `evidence` / `supersedes`，避免再用 Markdown 表撞收尾门。协调方追加：Lead / Draft / Crew /
Proof 四张卡的流程状态引用也统一为该口径，Proof 标准复核按 YAML 读取。本批只做**门禁引擎**属主部分：
五张内置卡文本、测试与文档；权力、Section 1、预授权、禁写、能力位与判定逻辑零变化。
完整记录见[变更记录](docs/change/2026-10-19_change_steward-flow-yaml.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、
  `test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
  本文件、`memo.md`、`docs/change/2026-10-19_change_steward-flow-yaml.md`（新）。未碰 `app/**`、
  `src/pipeline/**`、`src/common/编排/**`、`src/service/**`、其他角色文件/测试、真实项目；
  不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **Steward 卡文本（与真实 Flow YAML 契约对齐）**：顶层 `flowId/version/qualityTier/steps`（可选
  `status` 仅人读）；步骤字段 `id/title/owner/kind/status/evidence/supersedes/supersededBy`；
  `kind ∈ dispatch|customer-decision|artifact|acceptance`；
  `status ∈ pending|dispatched|delivered|done|superseded|failed|blocked`（迁移兼容 `aborted`
  会被识别并挡门）；`evidence` 为 `{kind,ref}` 且 `kind` 与步骤 `kind` 一致（dispatch→账本
  `dispatch.accepted.stepId`、customer-decision→账本 `decisionKind`、artifact→项目相对产物路径、
  acceptance→固定 `acceptance`）；`done` 步骤必须有 `evidence`；保留 id
  `verification`/`acceptance` 只能用于唯一验收步骤（`kind: acceptance`、初始 `pending`、
  `owner: app`），Steward 不占用/不派发/不标 done，执行/证据步骤用 `verification-evidence` 等 id；
  被 retake 取代的旧步骤标 `superseded` + `supersededBy`，新步骤写 `supersedes: [...]`，
  不留 `aborted/failed` 挡门；非法 id/枚举/未知字段/缺 evidence 被应用拒绝后按提示修正 YAML，
  **不得改回 Markdown 表格**。旧 Markdown 步骤表模板删除；真实演示要求改挂执行/证据步骤。
- **其余四张卡（协调方追加）**：Lead / Draft / Crew / Proof 的治理文件命名统一为
  `docs/flows/<flowId>.yaml`（唯一机器状态；同名 `.md` 仅人读视图）；Crew 标准工作流读流程单改为
  读 YAML，Proof 标准复核改为按 YAML 读取流程状态；各自写权/禁写/能力位/纪律逐字不变。
- **逐字保留**：不拥有最终批准权、派发只依据客户已接受提案/已任命名单/流程单步骤、不派发治理角色、
  不写角色卡/不创建角色、治理角色之间不 dispatch、提名由应用后台派发、判断代批纪律、治理卡参数、
  可写目录/禁写、shell 审批档、工程质量基线、contract-freeze/集成端到端/架构模块引用、
  不自动推进/不催办。
- **测试**：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **283 计 / 282 过 / 0 红 / 1 skip**
  （基线 280/279/0/1；新增 3 例：YAML schema/保留 ID/evidence/superseded 关键字断言；
  用 `yaml` 实际解析卡内模板块校验顶层/字段/枚举/done evidence/保留 id；五卡统一口径与
  Crew/Proof 按 YAML 读取）。卡内 YAML 模板另用编排 `parseFlowStateYaml` 实测通过
  （`template-flow`）。既有断言按新契约更新、未放宽；`npm run typecheck` ⇒ **exit 0**。
- **跨角色事实/依赖（只读核读，未越界修改）**：① 编排已落盘 Flow YAML 契约
  `src/common/编排/flow-state.ts`（`parseFlowStateYaml`/`evaluateFlowCompletion`；
  `governance-gate.ts` YAML 优先、坏 YAML fail-closed；`run-role.ts` 写前校验；`governance-judge*`
  与 `governance-judge-facts.ts` 改 YAML）——五卡 schema 与其一致；② **桌面
  `app/desktop/flow-state.ts` 仍是临时实现且形状不同**（`stepId`/`kind: decision`/evidence 数组/
  无 version·qualityTier），`interface.ts` 现导入它；桌面注释与跨角色请求均写明应改导入
  `src/pipeline/orchestration/flow-state.ts` 并删除临时文件——**未完成前真机自动验收门会拒合法
  YAML**；③ 编排 `govern-session.ts` 的 `STANDARD_WORKFLOW_PROMPT`（与卡文本成对同步）仍写
  `docs/flows/<flowId>.md`，须同批更新；④ 桌面 `governance-advance.ts` 的
  `governanceFlowPath` 仍返回 `.md`（新增 `governanceFlowStatePath` 返回 `.yaml`，interface 已
  YAML 优先）；⑤ 五张卡口径已统一，代码侧文案（②③④）仍待各自属主同步。
- **残余风险**：桌面/编排两套解析形状过渡期不一致；`evidence` 无内容哈希；Markdown 人读视图可
  漂移；真机端到端与独立复验未进行。来源：客户决定原话「这些全部改成yaml。」（经任务派发转达）。

## 2026-10-19 — 五张内置治理角色卡加入「标准工作流」，阶段流转由应用负责（客户反馈）

客户原话：「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」
本批只做**门禁引擎**属主部分：五张卡文本、单一来源总则常量、测试与文档；判定逻辑、写权、禁写、
预授权、能力位与治理卡参数零变化。完整记录见
[变更记录](docs/change/2026-10-19_change_role-standard-workflows.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、
  `test/门禁引擎/governance-standard-workflow.test.ts`（新）、本文件、`memo.md`、
  `docs/change/2026-10-19_change_role-standard-workflows.md`（新）。未碰 `app/**`、
  `src/pipeline/**`、`src/common/编排/**`、`src/service/**`、其他角色文件/测试、真实项目；
  不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **总则（单一来源 `STANDARD_WORKFLOW_PRINCIPLE`，五卡逐字复用）**：阶段流转由应用负责；你按
  本角色的标准工作流执行；客户只在需求确认、提案/任命/写卡、验收卡上做决定，不承担内部角色
  调度；不要等客户催办，也不要替应用推进下一阶段。
- **五卡工作流**：Lead 接收需求→质量档位→写意图→意图确认卡→`hand_off_intent`（信息不足先问、
  不自行降档）；Draft 读意图→提案（架构/质量章节齐备才出卡）→提案卡→接受后冻结契约；Crew
  读提案与流程→提名（推荐集 + 模块—写区一一对应）→任命卡→`appointment-write` 逐路径写卡→
  角色就绪（不自行任命）；Steward 写流程单→派发项目角色→收齐回交→登记完成→**应用自动派
  Proof**（不派发治理角色、不代替验收、不催办）；Proof 标准复核（读流程单/提案/契约/架构影响
  分析→审批档 shell 真实跑测试→真实启动应用并演示→逐条核对质量基线与架构声明→验收卡），
  未真实运行/未演示/架构缺失不得建议 accept，不接受客户手动派发作为常态。
- **既有内容逐字保留**：shell 审批档单一来源行、工程质量基线全文、「不拥有最终批准权」、判断
  代批纪律、`flowId` + `cardKind` 白名单、治理文件命名、可写目录/禁写路径、各角色质量职责。
- **测试**：新增 `governance-standard-workflow.test.ts` 8 例（五卡章节与总则、五角色关键步骤、
  既有纪律逐字保留、注册表权力/边界数据不变）。**门禁引擎 280 计 / 279 过 / 0 红 / 1 skip**
  （本批新增 8 例，基线 272/271/1）；`npm run typecheck` exit 0。既有断言未放宽、未改动。
- **跨角色依赖（未越界修改，如实登记）**：① 编排 `govern-session.ts:563-586` 已存在配对的
  `STANDARD_WORKFLOW_PROMPT`，其注释明记与五卡「标准工作流」章节成对同步、单一来源在本角色
  注册表卡文案；本批后两侧语义一致，今后改文案须两处同批。② 桌面 `interface.ts:811-874` 已实现
  「流程齐备后自动派 Proof」，与本卡文本一致。③ 判断 agent 验收机械门槛仍不核对真实运行/演示
  物证，「未演示不得建议 accept」仍是行为约束。④ `dispatch_task` 对内置治理角色的拒绝已有机械
  守卫；「不代替验收、不催办」仍是行为约束。⑤ README/产品文档由文档属主同步。
- **残余风险**：工作流主要是行为约束、门禁层不解析 Markdown；自动派发的触发门在桌面/编排，
  流程单或账本口径变化时卡文本可能漂移；客户仍可在应用外手动打开 Proof；卡片变长约 7-8 行
  增加提示词成本；演示证据不可机验。真机端到端与独立复验未进行。来源：客户反馈原话（经 PM 转达）。

## 2026-10-19 — 工程质量基线新增「架构与可扩展性」，五张内置治理角色卡补架构职责（客户新批评）

客户原话：「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个架构方案啊。」
真机证据：R1/R3 两份提案只有意图/交付物/数据模型/API/权限/状态机/统计/契约/测试/分工/风险，均无
模块分解、依赖方向、扩展点、数据/契约版本与迁移策略。本批只做**门禁引擎**属主部分：基线常量与
五张卡文本、测试与文档；判定逻辑、写权、禁写、预授权、能力位与流程零变化。完整记录见
[变更记录](docs/change/2026-10-19_change_architecture-requirement.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、
  本文件、`memo.md`、`docs/change/2026-10-19_change_architecture-requirement.md`（新）。
  未碰 `app/**`、`src/pipeline/**`、`src/common/编排/**`、其他角色文件/测试、真实项目；
  不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **基线**：`ENGINEERING_QUALITY_BASELINE` 新增「架构与可扩展性」一条——模块分解与职责、依赖
  方向（无环）、数据流清晰；扩展点明确（新增状态/角色/导出格式/统计维度时改哪里、不改哪里）；
  数据 schema 与 API 契约有版本/迁移/兼容/弃用策略；横切关注点（配置/错误/日志/鉴权/测试缝）
  有归属；变更类提案必须附架构影响分析（模块/边界/兼容/回滚）。五卡逐字复用（原断言自动覆盖）。
- **角色专属职责**：Lead 把客户演进/规模/未来需求写入 acceptance、不替客户决定架构；Draft 提案
  必须含「架构方案」（新项目）或「架构影响分析」（变更）章节并覆盖五项，缺失不得建议 accept、
  不得进入实现，提案卡给客户看的内容必须包含该章节；Crew 项目角色写区与角色卡同架构模块一一
  对应、禁止重叠、每个模块有明确属主；Steward 流程与 `dispatch_task` 引用架构模块/边界，
  contract-freeze 与集成/端到端步骤必须存在、缺一不得进入验收；Proof 核对实现与架构声明一致
  （模块边界/依赖方向/扩展点/版本迁移），缺章节或偏离声明不得建议 accept。
- **测试**：`governance-trio.test.ts` 基线关键字循环追加六个架构关键字（架构与可扩展性/模块分解/
  依赖方向/扩展点/版本迁移/架构影响分析），新增 1 条专项用例（L336-410）逐条断言五角色架构职责。
  **门禁引擎 272 计 / 271 过 / 0 红 / 1 skip**（本批新增 1 例，基线 271/270/1）；
  `npm run typecheck` exit 0。既有断言未放宽、未改动。
- **跨角色依赖（未越界修改，如实登记）**：① 编排 `govern-session.ts` 逐字复制了一份
  `ENGINEERING_QUALITY_BASELINE`（其注释明记改文案须两处同步）——本批后两份副本**已不一致**，
  须编排属主补「架构与可扩展性」行；同文件 `ENGINEERING_QUALITY_STAGE_REQUIREMENTS` 与 trio
  Draft 纪律也应补架构章节要求。② 判断 agent（`governance-judge.ts`）不解析提案章节，机械门槛
  未覆盖「缺章节不得 accept」。③ 桌面提案卡呈现需确认客户能看到架构章节。④ 运行时/装配不校验
  角色卡与架构模块的对应关系。⑤ README/产品文档由文档属主同步。
- **残余风险**：架构要求是行为约束、门禁层不解析 Markdown；「模块—写区一一对应」无机械检查；
  架构声明可形式化；卡片变长增加提示词成本；编排副本同步前提示词与角色卡存在文案漂移。真机
  端到端与独立复验未进行。来源：客户新批评原话（经 PM 转达）。

## 2026-10-19 — 五张内置治理角色卡加入工程质量基线（客户批准「可以，按你说的改」）

客户批评：五个内置治理角色卡缺少统一的工程质量基线，验收可以只覆盖功能、缺少健壮性/安全/
可维护性/测试等硬约束，且存在未真实启动应用、未演示就建议验收通过的空间。客户批准原话：
「可以，按你说的改」。本批只做**门禁引擎**属主部分：注册表卡文本与测试；判定逻辑、写权、
禁写、预授权零变化。完整记录见[变更记录](docs/change/2026-10-19_change_engineering-quality-baseline.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、
  本文件、`memo.md`、`docs/change/2026-10-19_change_engineering-quality-baseline.md`（新）。
  未碰 `app/**`、`src/pipeline/**`、`src/common/编排/**`、其他角色文件/测试、真实项目；
  不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **单一来源常量**：`governance-roles.ts` 新增导出 `ENGINEERING_QUALITY_BASELINE`（逐字包含
  正确性/健壮性/安全/可维护性/可观测性/性能与容量/前端/测试/交付九条；默认生产级，客户明确选
  原型档才可放宽；「验收前必须真实启动应用并演示」为硬要求）；五张卡逐字复用。
- **角色专属职责**：Lead 意图阶段确认质量档位（未指定默认生产）并写入 acceptance；Draft 提案
  必须含「质量基线与证据计划」一节、验收标准覆盖基线；Crew 项目角色卡继承基线并逐角色写质量
  职责、测试角色须负例/边界/重启/权限用例；Steward 流程与 `dispatch_task` 带基线与真实演示、
  verification 步骤必须含「真实启动应用并演示」、未演示不得进入验收；Proof 逐项核对基线、
  无真实启动/演示证据不得建议 accept、不得以「工具无 shell」跳过可核对项（Proof 已有审批档 shell）。
- **测试**：`governance-trio.test.ts` 导入新常量并新增 1 条专项用例——五卡逐字包含基线、
  六关键字（正确性/健壮性/安全/可维护性/测试/演示）、默认生产档、禁止弱化断言、五角色专属
  要求逐条断言。**门禁引擎 271 计 / 270 过 / 0 红 / 1 skip**（本批新增 1 例，基线 270/269/1）；
  `npm run typecheck` exit 0。既有断言（shell 审批档、能力矩阵、写权/禁写、确认卡纪律等）
  未放宽、未改动。
- **跨角色依赖（未越界修改，如实登记）**：① 编排 `governance-judge.ts` 验收机械门槛只核对流程
  完成度，不核对演示证据；要让「未演示不得进入验收」成为机械硬门槛需编排属主扩展。② 编排
  `govern-session.ts` 的 `dispatch_task` 任务描述不注入基线，靠 Steward 卡片纪律执行。③ 桌面
  `session.ts` 的 `shellOperatorOnly` 仍 su-only（上一批已登记），Proof 卡的 shell 表述要等桌面
  接线后才完整成立。④ 运行时/装配写 `role-card.md` 时不校验是否继承基线（只校验 `boundary.yaml`）。
  ⑤ README/产品文档如逐项列角色质量职责，由文档属主同步。
- **残余风险**：基线主要是行为约束，门禁层不解析 Markdown；演示证据可伪造/不机验；质量档位无
  代码级字段；卡片变长增加提示词成本；`api-spec.md` 注册表代码块存在与本批无因果的旧口径
  （缺 verifier、shell 注释旧），建议另开文档校正批次。真机端到端与独立复验未进行。
  来源：客户批准原话「可以，按你说的改」（经 PM 转达）。

## 2026-10-19 — 五个内置治理角色统一 shell 审批档（客户新规则：所有角色可运行 shell，含读写与任意命令，但一律提交审批）

客户 2026-10-19 原文：「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，
只不过都要提交审批，按照原有的流程审批。」本批只做**门禁引擎**属主部分：注册表能力位与五张角色卡
文本；机制（桌面注入/编排守卫/README）属各自属主，见下「跨角色依赖」。完整记录见
[变更记录](docs/change/2026-10-19_change_all-roles-shell-approval.md)。

- **边界**：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、
  `test/门禁引擎/liaison-role.test.ts`、`api-spec.md`、本文件、`memo.md`、
  `docs/change/2026-10-19_change_all-roles-shell-approval.md`（新）。未碰 `src/pipeline/**`、`app/**`、
  其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **注册表**：五角色 `capabilities.shell` 由 `none`（liaison/rapporteur/nominator/verifier）与
  `readonly`（convener）统一改 `"operator-approve"`；su 保持 `"operator-approve"`。
  `GovernanceCapabilities.shell` 注释重写：审批档＝只读白名单直接执行、risky/review/deny 逐条提交
  客户/判断 agent 审批、拒绝/超时/不可用不放行；shell 可读写但**写入同样受审批链约束**；
  `none`/`readonly` 仅为旧数据/兼容保留。**其余能力位、边界、预授权、禁写、判定逻辑零变化。**
- **卡文本**：新增单一来源 `SHELL_APPROVAL_CARD_LINE`，五张卡逐字复用——「shell 审批档——只读白名单
  直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界，
  写文件仍优先用 write_file 并经写盘确认。拒绝、超时、通道不可用一律不放行。」Convener 旧「只读档
  …执行类 shell 留给项目角色」段、Verifier 旧「shell 面 `none`」句删除；Liaison/Rapporteur/Nominator
  各新增该段（此前无 shell 表述）。
- **测试**：`governance-trio.test.ts` 能力矩阵与两张卡的 shell 断言改审批档，新增专项用例 1 例
  （五角色 operator-approve ＋卡文本「审批」「读写」语义＋旧表述反向断言）；`liaison-role.test.ts`
  能力 deepEqual 改 `operator-approve`。**门禁引擎 270 计 / 269 过 / 0 红 / 1 skip**
  （本批新增 1 例专项用例；2026-10-18 四角色批记录基线 255 计，期间五角色批次另有增例）；
  `npm run typecheck` exit 0。
- **跨角色依赖（未越界修改，如实登记）**：① 桌面窗口 `app/desktop/session.ts` 的 `shellOperatorOnly`
  仍为 su-only（`legacyBuiltIn`），convener 仍走 `shellReadonly` 只读档——须扩到全部内置治理角色
  （`role.builtIn`）并切换 convener 档位；桌面源码扫描测试（`operator-channel.test.ts`）与注入测试
  （`dispatch-delivery.test.ts`）随其更新。② 编排 `run-role.ts` 守卫 `cap.shell !== "operator-approve"`
  行为上已自然接纳五角色，但注释仍写「审批档只属于 single/su」「trio Rapporteur/Nominator 没有 shell
  面」，与 `govern-session.ts` 提示词「shell 面仅只读档」须同批更新；`test/编排/governance-session.test.ts`
  的「rapporteur/nominator 不应注入 shellGate」断言转红待更新。③ 测试角色
  `governance-liaison-verify/a-roles-writes-caps`（L265/L313）与
  `governance-trio-verify/a-listing-sessions-writes`（L175-179）旧断言转红待更新。
  ④ `README.md` L75 治理角色只读表述须同步。
  受影响跨角色 4 文件实测 40 计 / 37 过 / 3 红（恰为上述旧断言；`d-single-compat` 全绿，su 不变）。
- **安全边界**：shell 可写、可执行任意命令，命令副作用**不受** ANS 文件写入门禁约束（可写到项目外）；
  客户/判断 agent 的逐条审批是唯一控制，拒绝/超时/不可用一律不放行；审批不改变 Section 1 写边界；
  每次判定仍落 `docs/audit/shell-gate.jsonl`（应用专用边界，角色仍不可写）。
- **残余风险**：审批疲劳与间接副作用不可见；判断 agent 代批依赖其模型质量与可用性；桌面未同步前
  convener 仍被只读档限制（更严非放宽）、其余四角色仍无 shell（能力位已放开但桌面未注入）；
  真机端到端与独立复验未进行。来源：客户 2026-10-19 新规则原文（经 PM 转达）。

## 2026-10-18 — 治理四角色 W6-A（门禁引擎）：Liaison 注册表/枚举/写权/能力 + 旧 trio 兼容

客户 2026-10-18 拍板「**三权不变、角色四名**」：新增 `liaison`（联络官，客户沟通权，主入口），
`governanceModel` 仍为 `"trio"`；旧 trio 项目自动获得 Liaison、零迁移；single/su 逐字不变。
实施口径＝PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
§4.1–§4.7 与 §十二 W6-A（本批只做**门禁引擎**；运行时核心/编排/桌面/UI 属各自属主）。

- **边界**：`src/model/role.ts`、`src/common/门禁引擎/governance-roles.ts`、
  `src/common/门禁引擎/boundary-core.ts`（仅注释）、`src/service/role/resolve-role.ts`、
  `src/service/boundary/resolve-boundary.ts`（仅注释/再导出说明）、
  `test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/list-project.test.ts`、
  `test/门禁引擎/liaison-role.test.ts`（新）、本文件、`api-spec.md`、`feature-map.md`、`memo.md`。
  **未碰** `src/model/runtime.ts`、`src/pipeline/`、`src/common/编排/`、`app/`、其他角色
  files/tests/docs、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
- **Model（`src/model/role.ts`）**：`GovernanceFunction` 增 `"liaison"` →
  `"liaison" | "proposal" | "nomination" | "schedule"`；`GovernanceModel` 注释明确 `trio` 指权力
  模型而非角色数量；`ResolvedRole.governanceFunction` 注释改为四角色。
- **注册表（`governance-roles.ts`）**：
  - `BuiltInGovernanceRoleSpec.id` 增 `"liaison"`；`BUILT_IN_GOVERNANCE_ROLES` 首位插 Liaison
    （顺序 `liaison → rapporteur → nominator → convener`，即 `listProject` 枚举顺序）；
    `displayName="联络官 Liaison"`、`function="liaison"`。
  - `GovernanceCapabilities`：`customerInput` 由字面量 `true` 改为 `boolean`；新增
    `handOffIntent`（仅 Liaison=true）与 `requestClarification`（仅 Rapporteur=true）；
    `LEGACY_SU_CAPABILITIES` 两新位显式 false（su 旧行为不多给工具）。
  - Liaison：Section 1 / 预授权只有 `docs/intents/`；`forbiddenWritePaths` =
    应用独占三项 + `角色卡/` + `docs/proposals|contracts|nominations|skills|mcp|flows|governance/`
    + `docs/workflow.md`；能力只有 `handOffIntent`，`customerInput=false`，无派发/看护/安装/
    恢复/shell（`none`）；卡文本写明「客户沟通 · 不拥有最终批准权」、`hand_off_intent` 交接约定、
    唯一写区与「不实现/不跑代码/不写测试」。
  - `BUILT_IN_ROLE_DIR_PREFIXES` 增 `角色卡/liaison/`（其余角色禁写矩阵随之覆盖）。
  - 三张旧卡同批修订：Rapporteur 去掉「理解客户意图、沟通」、改读 `docs/intents/**` 并使用
    `request_clarification`；Nominator/Convener/Rapporteur 的「不得创建第四个」改「第五个」；
    Convener 提名步骤改为「由应用后台派发（不打开/不切换客户会话）」、「三个内置治理角色」
    改为「四个」。
  - `TrioGovernanceRoleId` / `BUILT_IN_GOVERNANCE_ROLES` / `isTrioGovernanceRoleId` /
    `trioGovernanceSource` 名称保留（`trio` = 权力模型），避免无意义跨角色改名。
- **Service**：`resolveRole`/`listProject` 自动按注册表识别 Liaison（保留 id 反遮蔽、卡文本、
  `governanceFunction:"liaison"`）；trio `primaryRoleId` 改为 `"liaison"`；`resolveGovernanceRole`
  的 trio 合法 id 增 `liaison`、错误文案列四人、`function:"liaison"` 可解析。
  **缺省 `function` 仍为 `proposal`（→ rapporteur）**：这是共享解析器语义，CLI `ans govern`
  不提供 Liaison（评审 §4.5/§4.6）；桌面主入口经 `primaryRoleId` 得到 Liaison。
- **边界解析**：`resolveBoundarySection` 的 trio 分支按 `governanceRoleOf` 取条目，Liaison 自动
  生效（`<built-in:trio/liaison>`、接受证据＝`.ans` 或本次 genesis、fail-closed 不变）；single 下
  Liaison 与其余 trio 角色一样结构性拒绝（「三权角色在 single 治理模型下不可用」）。
  旧 trio 项目零迁移：`listProject` 只读 `.ans`，不重写。
- **拒绝文案（AC3 补充）**：`resolveWrite` 对 Liaison 边界的最终「未匹配条目」拒绝追加归属指引
  （`governanceWriteOwnerGuidance`，注册表单点）：提案/契约→报告员 Rapporteur、角色卡/提名/
  技能/MCP→提名官 Nominator、流程/workflow→召集人 Convener、`.ans/`/manifest/治理边界→只能由
  应用写。只改文案，放行/拒绝与 `allowedByRoot` 零变化；其他角色文案逐字不变。
  新增 1 例文案断言（共 7 例）。**编排侧前置 `forbiddenWriteDecision` 的通用文案属编排属主**，
  本角色未越界修改。
- **应用边界补 shell 审计目录（真机四角色回归修复）**：`appGovernanceEntries()` 增
  `docs/audit/`（directory，purpose「shell 命令审计（应用写）」）——四角色默认入口改为 Liaison 后，
  真机出现「shell 闸审计未落盘：目标路径未匹配任何边界条目：docs/audit/shell-gate.jsonl」。
  该目录**只给应用**，不加入任何角色的 Section 1/预授权（四角色与 su 写该路径仍被拒）。
  测试：应用边界可写 `docs/audit/shell-gate.jsonl`；四角色 + su 拒写；注册表不含该目录。
  **生效前提**：shell 审计门禁由编排 `assembleProjectShellGate` 装配，其 `pmBoundary` 当前取
  「首个内置角色的边界」；编排侧需改用 `appGovernanceBoundary`（本角色未越界修改）。
- **测试**：`governance-trio.test.ts` 更新为四人（顺序/职能/显示名/Section 1/预授权/能力/卡文本/
  禁写/写权/`resolveGovernanceRole` 文案）；`list-project.test.ts` 空项目与显式 trio 期望四人、
  `primaryRoleId=liaison`、保留 id 增 `liaison`；新增 `liaison-role.test.ts` 7 例（旧 trio 自动
  获 Liaison 且 `.ans` 逐字节不变、single 不变、`docs/intents/**` 放行/越界拒、AC3 归属文案、
  能力矩阵、保留 id）。**门禁引擎套件 255 计 / 254 过 / 0 红 / 1 skip**（Windows 专属 skip）；
  相关编排 shell 套件 143 计 / 142 过 / 1 红（Windows `symlinkSync` EPERM，与本批无关）。
- **全量与类型（如实）**：`node --test "test/**/*.test.ts"`（三层 glob）2697 计 / 2673 过 /
  **21 红** / 3 skip。其中 **5 条是本批契约性预期红，全在本角色边界外**：
  `test/测试/t9-block1-bootstrap.test.ts`（主入口仍断言 rapporteur）、
  `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`（3 内置/主入口）、
  `test/测试/governance-trio-verify/d-single-compat.test.ts`（su 能力 deepEqual 缺两新位）、
  `c-migration.test.ts`（三内置顺序）、`test/桌面应用/interface.test.ts`
  （IPC 空项目 3 内置/rapporteur）——均待编排/桌面/测试属主按 W6-A/W6-B/W6-D 更新。
  其余 16 红与本批无关：9 条 Windows `symlinkSync` EPERM、vendor markdown-it pin 不符、
  `abort running shell` 时序、5 条 `test/桌面应用/renderer.test.ts` 源码扫描（工作树在飞的
  `app/renderer/renderer.js` 修改）。
  `npx tsc --noEmit`：本角色边界内零错。首批复跑时的 3 条编排属主错误
  （`GovernancePower`/`TRIO_CARD_KINDS` 未纳 `"liaison"`）已由编排侧并行修复；AC3 复跑时剩 3 条
  全在他域新写的 liaison 测试（`test/编排/liaison-handoff.test.ts`、
  `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` 仍用被评审取代的
  `"communication"` 名称），与门禁引擎交付无关，如实登记、未越界修改。

## 2026-10-17（五）— 治理三权分立 V1 W0+W1：类型/注册表/listProject/resolveRole/resolveBoundarySection/应用治理边界

客户 2026-10-17 拍板（原话要点）：su 拆为 `rapporteur`（提案权）/`nominator`（提名权）/`convener`
（编排权），**没有任何一个角色自动拥有最终批准权**；V1 + V1b 分期；新项目 trio、旧项目默认 single
兼容；迁移后 su 隐藏/不可开启/历史只读；三人基本只读 shell；账本在 `.ans/governance/ledger.jsonl`。
实施口径＝PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
§5.1–§5.6、§六、§8.1、§九、§十一（W0/W1）、§十二。本批只做**门禁引擎 W0+W1**；编排（W2）、桌面（W3/W4）、
迁移（V1b）、独立验收（W5）均属各自属主，**不在本任务**。

- **边界**：`src/model/role.ts`（类型）、`src/common/门禁引擎/governance-roles.ts`（新，注册表）、
  `src/common/门禁引擎/boundary-core.ts`（按模型分支）、`src/service/role/resolve-role.ts`
  （listProject/resolveRole/`resolveGovernanceRole`）、`src/service/boundary/resolve-boundary.ts`
  （注册表公共再导出）、`test/门禁引擎/governance-trio.test.ts`（新，28 例）、
  `test/门禁引擎/list-project.test.ts`（空项目期望改为 trio + 3 个模型判定用例）、本文件、
  `api-spec.md`、`feature-map.md`、`memo.md`。**未碰** `src/model/runtime.ts`、
  `src/common/shared/config-loader.ts`（只读消费 PM 已落地的 `readGovernanceModel`）、
  `src/common/编排/`、`src/pipeline/`、`app/`、其他角色 files/tests/docs、真实项目；不 commit。
- **W0 类型（`src/model/role.ts`）**：新增 `GovernanceModel = "single" | "trio"`（缺省 single）、
  `GovernanceFunction = "proposal" | "nomination" | "schedule"`；`ResolvedRole.governanceFunction?`、
  `ProjectConfig.governanceModel?`。`ProjectListing.governanceModel?` 与 `ProjectRoleSummary.governanceFunction?`
  在 Service 文件：**`listProject` 恒返回模型值**；类型上设为可选，是为让其他角色在 W3 前构造的
  `ProjectListing` 测试夹具继续通过 typecheck（读取方 `?? "single"` 即旧行为）——这是本批**唯一**
  对契约字面（§5.1「`governanceModel: GovernanceModel`」）的类型级放宽，运行时契约不弱化（见下）。
- **W1 注册表（`governance-roles.ts`）**：`BUILT_IN_GOVERNANCE_ROLES` 顺序
  rapporteur→nominator→convener；`BuiltInGovernanceRoleSpec`（id/displayName/function/cardText/entries/
  preauthorizedDirs/forbiddenWritePaths/capabilities）与 `GovernanceCapabilities` 按 §5.2/§5.6 逐项；
  `governanceRoleOf`/`governanceFunctionOf`/`governanceCapabilitiesOf`（`su` 单点返回
  `LEGACY_SU_CAPABILITIES`）/`isBuiltInGovernanceRoleId`（三人+su）/`isTrioGovernanceRoleId`；
  `LEGACY_SU_PREAUTHORIZED_DIRS`＝编排既有四棵（docs/su、docs/contracts、docs/skills、docs/mcp，逐字）；
  `LEGACY_GOVERNANCE_ROLE_ID`/`LEGACY_SU_CARD_TEXT` 以 live binding 再导出（卡文本/id 单一来源仍在
  `boundary-core.ts`，未搬动一字）。**条目**：rapporteur=`docs/proposals/`、`docs/contracts/`、
  `docs/governance/rapporteur/`；nominator=`角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、
  `docs/governance/nominator/`；convener=`docs/flows/`、`docs/workflow.md`（file）、
  `docs/governance/convener/`。**禁写**按表展开为具体前缀（`.ans/`、manifest、governance-boundary、
  `角色卡/{rapporteur,nominator,convener,su}/` 等；按段比较、不实现 glob）；提名写卡仍需客户确认
  ——门禁层只给边界，确认由编排 confirmed-writes 实施（评审 §5.2/§5.6）。
- **W1 应用专用边界**：`appGovernanceEntries()` 固定三条（`角色卡/governance-boundary.yaml` file、
  `.ans/` directory、`docs/bootstrap-manifest.md` file）；`appGovernanceBoundary(acceptance)` 返回
  `boundarySource=<built-in:app-governance>` 的 Section 1。仅应用写库用，**不注入任何角色会话**。
- **W1 `resolveBoundarySection` 按模型分支（§5.3）**：`trio` 下 su → 未接受 +
  parseError「su 已归档（当前为三权治理模型），不可写入/开启」；trio 三人 → 条目取注册表
  （**绝不**读取 `governanceBoundary.path` 的条目）、`boundarySource=<built-in:trio/<id>>`，
  接受证据＝`path` 非空且 `accepted===true` 的项目记录，或 `path` 为空 + 本次显式 genesis；
  其余 fail-closed（F6 拒一切写），**不**把 path 为空的运行期同意当 trio 接受证据。`single` 下
  trio id → parseError「三权角色在 single 治理模型下不可用」；su 与项目角色的既有 1–4 步**逐字未改**。
- **W1 `listProject`（§5.4）**：先扫项目角色（保留 id 冲突 → 「与内置治理角色 id 冲突，已跳过」）、
  再读 `readGovernanceModel`；显式值优先；`.ans` 不可读 → single；无显式值且**无 `.ans/project.json`
  且无任何角色目录** → 新空项目 trio；其余 single。内置前置：single→su（逐字），trio→三人顺序；
  `primaryRoleId` single→su、trio→rapporteur。**模型判定采用「有无角色目录」而非仅 `hasRoles`**：
  全归档/半成品目录的旧项目仍 single，避免被误判为新项目（与「旧项目默认 single 兼容」一致；
  评审 §5.4 的「无项目角色」按此口径落地，已在本条如实登记）。
- **W1 `resolveRole`（§二-11/§5.4）**：trio 下 su 抛「角色 su 已归档（当前为三权治理模型），不可开启」；
  trio id 的 `cardText`/`governanceFunction` 来自注册表，保留 id 忽略 `project.roles` 映射（防遮蔽）；
  single 下 su 的 kind/卡文本/边界逐字不变。新增 Service 公共出口
  `resolveGovernanceRole(listing,{function?,roleId?})`（§5.4）：single 只认 su、传 function/他 id 抛错；
  trio 按显式 id 或 function（缺省 proposal→rapporteur），非法组合明确报错。`resolve-boundary.ts`
  再导出注册表全部数据/查询与应用边界（同一绑定，不复制）。
- **测试**：新增 `test/门禁引擎/governance-trio.test.ts` 28 例——注册表顺序/条目/预授权/能力矩阵/
  卡文本最低内容/禁写前缀（含无 glob、按段覆盖）；trio 三人边界来源与「不读治理边界文档条目」；
  genesis 接受与运行期同意 fail-closed；su 归档（边界 + resolveRole + listProject 隐藏）；
  single 下 su 逐字不变、三权角色不可用、保留 id 反遮蔽；项目角色不受影响；三人写权矩阵
  （各自可写 + 越界拒）；应用边界三项放行/越界拒；`resolveGovernanceRole` 全分支。
  `list-project.test.ts`：空目录期望改为 trio 三人 + 主入口 rapporteur（原 su 空项目断言随客户拍板
  更新），并新增旧项目 single、显式 single/trio、`.ans` 不可解析、保留 id 冲突 4 例。既有门禁用例全绿。
- **测试（实跑，win32 / Node v24.11.1 / 工作区含他角色并行改动）**：`node --test
  "test/门禁引擎/**/*.test.ts"` → **246 计 / 245 过 / 0 红 / 1 skip**（上批 218 + 28；skip 为既有
  Windows 权限用例）。全量 `node --test "test/**/*.test.ts"` → **2542 计 / 2473 过 / 66 红 / 3 skip**
  （基线 2514/2487/24/3）；**新增 46 条唯一失败全部在本角色边界外**，均为「新空项目默认 trio」
  +「single 下三权角色不可用」的**契约预期后果**：编排 `openGovernanceSession`/CLI `ans govern`/
  装配配置注入尚未传 `governanceModel`（评审 §5.4「配置传播」属 W2/装配），桌面 `buildProjectConfig`
  尚未写模型（W3），测试角色夹具仍按 su 空项目断言（W5）。`test/门禁引擎/` 零红；另 4 条基线 flaky
  （F-1 超时）本轮回绿、markdown vendor/看护源码钉等既有红与并行批次无关。`npm run typecheck` exit 0。
- **未做/待验证（如实分列）**：W2 编排（能力矩阵/预授权/禁写包装/账本/三道门禁/repin 应用边界）、
  W3 桌面、W4 UI、V1b 迁移、W5 独立验收均未开始；上述 46 条跨角色红须由对应属主按评审 §5.4/§5.6/
  §5.7 接线后回绿；真机端到端与独立复验**未进行**；本条目**不声称已验**。

## 2026-10-17（四）— 治理记录 pin 不符的重新接受恢复 A1–A3：只读 pin 证据检查公共出口

客户 2026-10-17 裁定「这个恢复入口按角色链做一下」；PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md` §5.1/§5.5/§六/§七
批准并派发本角色 A1–A3。本角色只交付**只读检测**（唯一哈希来源）；编排预览/写入（B）、桌面窗口/UI（C/D）、
测试角色端到端（E）均属各自属主，**不在本任务**。**`verifyPins` 既有行为一行未改**，新检查是独立只读入口。

- **边界**：`src/model/boundary.ts`（A1，新增 4 个只读结果类型）、`src/common/门禁引擎/pin-evidence.ts`
  （A2，新增实现）、`src/service/boundary/resolve-boundary.ts`（A3，同一函数引用再导出 + 类型再导出）、
  `test/门禁引擎/pin-evidence.test.ts`（新，12 例）、本文件、`api-spec.md`、`feature-map.md`、`memo.md`。
  **未碰** `src/common/编排/`、`app/`、`test/编排/`、`test/桌面应用/`、`test/测试/`、真实项目；不 commit。
- **A1（Model）**：`PinEvidenceFileStatus`、`PinEvidenceFile`、`PinEvidenceState`、`PinEvidenceResult`
  按 §5.1 逐字新增（字段与注释一致）；`checked` 含一致项、`files` 仅非一致项、`digest` invalid 时为空串。
- **A2（实现，`inspectPinnedBoundaries`）**：判定严格按 §5.1 的 1–8 条——① 形状：非空数组、`path` 非空、
  `sha256` 64 位十六进制（大小写不敏感），非法 `invalid` 且 reason 指明第几项；② 路径安全：绝对路径直接拒、
  `joinRoot` 规范化后 `absRel` 为空即逃逸；③ `requiredPath` 覆盖：`compareKey(normalizeLexical(joinRoot(...)))`
  比较，未覆盖 reason 逐字 `治理边界文件未被任何 pin 覆盖：<path>`；④ 逐文件：`ENOENT → missing`、
  其它 stat 错误/非普通文件/读失败 `→ unreadable`（`actual:null`）、哈希小写不等 `→ modified`、相等不进入
  `files`；⑤ 无非一致项 `ok`、否则 `mismatch`；⑥ digest 按 §5.1 第 6 条对全部 pin（原顺序、含一致项）拼接
  规范化行求 SHA-256；⑦ 只读、不缓存、每目标至多一次 `stat` + 一次 `sha256File`；⑧ 哈希复用
  `io.ts::sha256File`，未写第二份。路径原语复用 `paths.ts`（共享单一来源转出）的
  `isAbsoluteAny`/`absRel`/`compareKey`/`normalizeLexical`。
- **未复用 `verifyPins`**：`verifyPins` 首错即返回、不区分 missing/unreadable、不产出 digest、不做 pin 形状
  的 64 位十六进制校验；把它改成新实现会改变既有 F6 拒绝文案与测试期望。按任务「风险不可控就不动」，
  `boundary-core.ts` 未改，既有 `pin-acceptance.test.ts` 等逐字通过。
- **A3（Service 公共出口）**：`resolve-boundary.ts` 增
  `export { inspectPinnedBoundaries } from "../../common/门禁引擎/pin-evidence.ts";` 与 4 个类型再导出
  ——**同一函数引用**（测试断言 `===`），不复制实现。
- **测试**：新增 `test/门禁引擎/pin-evidence.test.ts` 12 例（11 通过 / 1 skip，Windows 专属权限用例）——
  全一致（含大写哈希）、单文件 modified（`pinned !== actual`、其余一致项不进入 files）、missing、unreadable
  （目录；权限用例 win32/root 跳过）、形状非法（非数组/非对象/path 空/sha256 非 64 hex）、空 pin、路径逃逸
  （`..` 与绝对路径）、requiredPath 未覆盖（reason 逐字）与规范化覆盖、digest 公式复算+稳定+任一内容变化即变、
  只读（前后目录树/大小/mtime 完全一致）、公共出口同一函数引用。全部临时目录，不碰真实项目。
- **测试（实跑）**：新增文件 **12 计 / 11 过 / 0 红 / 1 skip**；`node --test "test/门禁引擎/**/*.test.ts"`
  → **218 计 / 217 过 / 0 红 / 1 skip**（上批 206 + 12）；全量 `node --test "test/**/*.test.ts"`
  → **2262 计 / 2164 过 / 95 红 / 3 skip**——95 红**全部在本角色边界外**（本机未装 npm 依赖致
  claude/codex/MCP 相关用例 `Cannot find module`、Windows 无符号链接权限 EPERM、以及他角色并行未提交改动），
  **`test/门禁引擎/` 零红**、本批改动无新增红。`npm run typecheck` → **本角色改动文件 0 错**
  （全仓 85 处既有错均在缺失依赖的他角色文件）。环境：win32 / Node v24.11.1 / 工作区含他角色未提交改动。
- **未做/待验证（如实分列）**：编排 B（预览/写入）、桌面 C/D、测试 E 均未开始；真机端到端（pin 不符 →
  预览 → 重新接受 → 恢复 present）与独立复验**未进行**；本条目**不声称已验**。

## 2026-10-17（三）— su 卡看护段：整轮「到点检查」不中止 + 卡死才提议恢复 + 1 小时最后兜底

客户 2026-10-17 裁定「整轮不应该有超时，应该是到了时间，su 要去看下是否卡死了，如果卡死了，要想办法
让他恢复」「保留 1 小时兜底」「如果没卡死，就不管他」；PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_turn-watch-and-recover-review.md` §3.4 批准实施
（§八 步 5 门禁引擎只做 su 卡文本）。**判定逻辑一行未改**；看护/适配器机制属各自属主。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`BUILT_IN_ROLE_CARD_TEXT` 看护两段 + 头注）、
  `test/门禁引擎/su-turn-watch-convention.test.ts`（新，4 例）、
  `test/门禁引擎/su-doc-surface-convention.test.ts`（看护段断言同步旧措辞），本文件、`memo.md`、
  `feature-map.md`。**未碰** `app/**`、`src/common/编排/`、运行时核心/各适配器、他角色 files/tests/docs、
  客户项目；不 commit。
- **卡文本改动（看护职责 / 看护纪律）**：① 异常态信号「轮次逼近超时」→ **「轮次到点检查」**
  （旧措辞全卡清零）；② 新增 **「到点检查不是超时」**：到达检查时限时看护只投一条提示、**不会因此
  中止本轮**；su 先 `role_status`（必要时 `session_tail`）核对——**仍在推进，不动作**（回「状态正常，
  忽略」是合法结局）、**只有确认卡死**才用 `propose_recovery` 提议（停止本轮/重建会话/重投任务），
  **由客户一键确认、应用执行**；不得自行执行、不得承诺结果（既有句保留）；③ **1 小时为最后兜底**：
  整轮有效运行到 1 小时仍未结束，适配器中止该轮（**唯一自动整轮上限**），文案与到点检查**明确区分**；
  ④ su 自身轮次**没有到点检查**（不能检查自己），仅有 1 小时兜底；⑤ 看护纪律保留「看护消息仅如实
  告知」「不得据此假设任何写权」，并补「到点检查未发现卡死时**不动作**」。非整轮时限（shell 命令
  10 分钟 / 确认卡 120 秒等）不在卡文本另述、语义未动。
- **测试**：新增 `su-turn-watch-convention.test.ts` 4 例——旧措辞不得复现＋到点不中止；核查/不动作/
  卡死才提议的句链；1 小时兜底与 su 自轮无检查；看护纪律保留＋J-1 守卫全卡零未否定命中（含变异
  非空洞）。`su-doc-surface-convention.test.ts` 看护段断言由「轮次逼近超时」改为「轮次到点检查」
  并加**旧措辞逐字不得复现**反向断言（未放宽其他断言）。
- **测试（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **206 计 / 206 过 / 0 红 / 0 skipped**
  （上批 202 + 4）；`npm run typecheck` → 本角色改动文件 0 错（全仓其余报错均属他角色既有文件）。
  环境：win32 / 工作区含他角色未提交改动。
- **跨边界（回报、未改）**：`test/桌面应用/session.test.ts` 与 `test/测试/g2-verify/w1-signals.test.ts`
  仍断言看护信号文案「轮次逼近超时」（W1 信号、90% 边界）；按评审 §3.2，桌面窗口/编排把标签改为
  「轮次到点检查」、阈值 1.0 时须由其属主同批更新（本角色未碰）。
- **未做/待验证（如实分列）**：真机端到端（设置 1 分钟检查、长轮次观察 1 条提示且不中止）与独立复验
  **未进行**；本条目**不声称已验**。

## 2026-10-17（二）— su 卡新增「命令纪律（su 审批档）」：只读免审批、risky/review/deny 均客户逐条批准

客户 2026-10-17 裁定「这个su 的命令也改一下，不是只读，是只读的免审批，其他的要客户审批」，并追加
「deny 也走客户审批」；PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_su-shell-approval-review.md`
批准实施（§一/§3.7/§八 步 2）。本角色只做**命令纪律卡文本**（机制：编排 `operatorOnly`/`approveDeny`、
桌面 tier/policy/卡片、审计分支，均属各自属主）。**判定逻辑一行未改**。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`BUILT_IN_ROLE_CARD_TEXT` 新增段 + 头注）、
  `test/门禁引擎/su-shell-approval-convention.test.ts`（新，4 例）、本文件、`memo.md`、`feature-map.md`。
  **未碰** `app/**`、`src/common/编排/`、`src/pipeline/`、运行时核心/Pi适配器、他角色 files/tests/docs、
  客户项目；不 commit。
- **卡文本新增段（位置＝「派发失败/被拒」之后、「安装纪律（技能安装/卸载）」之前；PM 建议位置）**：
  ① **只读白名单**命令（读取/查询类，(c) 判为 allow）**免审批、直接执行**；② 其余一切命令——risky/review
  **以及原本硬拒的 deny 类**（如 `sh -c`/`eval`、提权、系统破坏等）——**都会向客户弹出确认卡，
  客户批准后才执行**；拒绝、超时、通道不可用 = **不执行**；③ **不走 pm 审读**（su 不自审）；
  ④ 确认卡会显示 `su-审批档[risky|review|deny]`、原始命令与原因；⑤ **不得**把「已提交审批」说成已获准、
  把客户口头同意当批准、自行执行未获批准的命令、声称审批会自动通过；⑥ 如实披露 **shell 命令不受 ANS
  文件写入边界约束**——批准的是这一次命令、**不是新的写权**；`sh -c`/deny 类批准后以**当前 OS 用户权限**
  执行、**可能写到项目外**（含当前 OS 用户可写的任何位置），客户审批是唯一闸；⑦ 每次判定仍落
  `docs/audit/shell-gate.jsonl`（治理边界 + `shell-gate` 条件），审计不改上述任何判定。
  **与「确认制要点」分开**：`request_confirmation` 管 `write_file`，审批卡管 `run_shell`，不得混同。
- **口径与事实对齐（如实）**：`rm`/`rmdir`/`dd` 属 **risky** 而非 deny（规则事实），故卡文本举例用
  「如 `sh -c`/`eval`、提权、系统破坏等」而**不**写「rm -rf 属 deny」；deny 面（reshell、内联求值、提权、
  系统破坏、LOLBin）按客户裁定**全部可批准**，本角色不擅设不可批准子集（评审 §七-2 的待确认项留客户）。
- **守卫与测试**：新段**零**未否定「授权/获准/放行」小句（唯一含「获准」小句带「不得」）；
  `test/门禁引擎/su-shell-approval-convention.test.ts` 4 例——位置断言；审批档关键词、deny 也须经客户批准
  （反例：不得写「deny 直接拒绝」/「无需客户审批」）；卡片披露与 shell 绕过写边界如实陈述；J-1 守卫
  小句级 + **变异非空洞验证**（合成「客户已获准执行该命令」必须被捕获）。
- **测试（实跑）**：`node --test "test/门禁引擎/su-shell-approval-convention.test.ts"` → **4/4**；
  `node --test "test/门禁引擎/**/*.test.ts"` → **202 计 / 202 过 / 0 红 / 0 skipped**（上批 198 + 4）；
  `dispatch-after-landing-convention.test.ts` + `su-doc-surface-convention.test.ts` → **22/22**；
  `npm run typecheck` → **本角色改动文件 0 错**（全仓其余报错均属他角色既有文件）。
  环境：win32 / 工作区含他角色未提交改动。
- **跨边界（回报、未改）**：机制侧（编排 `SU_APPROVAL_REASON_PREFIX`/`renderSuApprovalReason`、审计分支
  `c-risky→a-*`/`c-review→a-*`/`c-deny→a-*`、桌面 tier/policy 与卡片标题/警告）**尚未见落树**；本卡文本
  按评审钉死口径先行披露。日后若 `su-审批档[...]` 前缀、档位名或审计路径改名，须**同批**回改本段与本测试。
- **未做/待验证（如实分列）**：真机端到端（客户看卡、批准/拒绝、核对写边界披露）与独立复验**未进行**；
  本条目**不声称已验**。

## 2026-10-17 — 已有角色但无治理记录（S1）兼容 V1：A1 种子边界 Service 公共出口 + F1（I5）F6 回执恢复指引

客户 2026-10-17 裁定「推进吧，按 B+C 来」（不自动创世、不设内置常设治理写权）；PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_existing-project-compat-review.md` 批准 V1 并派发
（§一/§三/§五 A1、F1、§七、§八）。本角色只做自己边界内的 **A1**（I3 机制所需的种子边界公开出口）与
**F1**（I5，已并入 V1）。**判定逻辑零变化**（F6/F4/pin/重 pin 未动）。

- **边界**：`src/service/boundary/resolve-boundary.ts`（新增公开再导出）、`src/service/gate/resolve-write.ts`
  （F6 文案）、`test/门禁引擎/governance-seed-public-entry.test.ts`（新，5 例）、
  `test/门禁引擎/f6-denial-guidance.test.ts`（新，5 例）、本文件、`memo.md`、`feature-map.md`。
  **未碰** `app/**`、`src/common/编排/`、两份 `format-denial.ts`、他角色 files/tests/docs、客户项目；不 commit。
- **A1（PM 评审 §五 A1）**：`resolve-boundary.ts` 增
  `export { buildGovernanceSeedBoundaryForGate as buildGovernanceSeedBoundary } from "../../common/门禁引擎/governance-seed.ts";`
  ——**同一函数引用**，不复制实现、不 fork 第二份种子（§6：跨角色只经 Service 公开出口消费私有
  `common/`）；既有 `resolveBoundary` 导出与行为逐字不变。公开出口**不持久化**：调用方（编排 B1）只在
  单次 `establishGovernanceRecord` 调用栈内构造/使用，不得写入 `ProjectConfig`、`.ans` 或缓存
  （头注已写明，防退化为候选 G）。测试 `governance-seed-public-entry.test.ts`：引用同一性；
  三**普通** directory（`角色卡/`、`docs/`、`.ans/`，root 恒 project、**无 condition**）；`accepted:true`；
  source 逐字透传（含空 source 原样返回，由 F6 判定）；每次调用返回全新对象/数组；`resolveBoundary` 仍在。
- **F1（PM 评审 §三；I5 的真实组装点只有 `resolve-write.ts` F6 分支）**：新增常量 `F6_DENIAL_GUIDANCE`
  （紧随既有 `F4_DENIAL_GUIDANCE`），F6 分支 reason＝**首句逐字**
  `边界未被接受或缺少证据来源（F6）：拒绝一切写入。` ＋ **不判断 `.ans` 状态**的规范式指引
  （「可能的恢复路径：若项目已有角色但缺少 .ans/project.json → 桌面「建立治理记录」或
  `ans govern <项目目录>`（需已配置模型与凭据）；若已存在 → 检查可解析、accepted:true、pin 齐全、
  被 pin 文件未改动——程序不会自动覆盖或重新接受」）。指引**不重复首句**（保
  `test/编排/shell-gate.test.ts:370` 整句计数）；**判定条件/顺序零变化**。两份 `format-denial.ts`
  **未改**（渲染器只是 `写入被拒绝：${reason}` 包装，指引自动随 reason 带出）。文案纪律已按 §三：
  不猜状态、不说「项目角色不受影响」、不承诺自动修复、不暗示无需凭据（测试含反向断言）。
- **测试（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **198 计 / 198 过 / 0 红 / 0 skipped**
  （上条 188 + 本批 10）；两个新文件单独跑 **10/10**；`node --test "test/编排/shell-gate.test.ts"` →
  **20/20**（F6 整句计数断言 `:370` 未被破坏）；`npm run typecheck` → **本批改动文件 0 错**
  （全仓其余报错均属他角色既有文件，与本批无关）。环境：win32 / 工作区含他角色未提交改动。
- **未做/待验证（如实分列）**：I3（编排 B1/B2）、I1/I2/I4（桌面）不在本任务；真机端到端（S1 项目点
  「建立治理记录」→ su 解卡）与独立复验**未进行**；本条目**不声称已验**。
- **供下游（编排 B1）**：种子边界来自 `src/service/boundary/resolve-boundary.ts` 的
  `buildGovernanceSeedBoundary(source)`；一次性语义与来源常量由其调用栈负责，本角色只提供同一实现引用。

## 2026-10-16（六）— su 卡配套修订：G-4 V2「安装纪律」MCP 部分 + 预授权扩列第四棵（`docs/mcp`）

客户 2026-10-16「按推荐批准，开始实施」＝**V2（MCP 安装）分批实施**（四项裁定全采纳：Pi 资源工具
V1 不接／server 名含特殊字符直接拒绝／HTTP·OAuth 型 V1 只接 stdio／分期 P1 Claude→P2 Codex→P3 Pi；
PM 评审 §客户批准）；PM 派发 **wave A（契约/独立面并行）**：运行时核心（契约/声明读取器/schema
两工具/tools 两 maker）、编排（**预授权第四棵 `docs/mcp`**＋话术同步）、**门禁引擎（卡文本增 MCP
安装纪律段——本条）**、桌面UI（行渲染最小确认面）。设计规格以
`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` revision 2 为准（§5.1 声明
形态、§5.3 诚实面、§5.4 卸载、§6.2 报告模板、§九 V2 范围①）。**判定逻辑一行未改**；机制侧由各自
属主并行实施（编排与运行时核心均已见落树，见 §跨边界发现）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本「安装纪律」段增补 MCP 部分 + 确认制要点/
  规划纪律四棵修订 + 头注 V2 注）、`test/门禁引擎/su-doc-surface-convention.test.ts`（更新 6 处断言
  + 新增 2 例 + 头部注释第 1/5/6 节同步与第 9 节新增）、本文件、`memo.md`、
  `docs/fix/2026-10-16_fix_g4-v2-su-mcp-card.md`（新）。**未碰** `app/**`、
  `src/pipeline|provider|service|model` 他角色文件、他角色 tests/docs（含 `test/测试/**`）、真机轮
  目录；不 commit。
- **卡文本修订（`BUILT_IN_ROLE_CARD_TEXT`）**：① **「安装纪律」段增补 MCP 部分**（位置＝技能部分
  之后、「看护职责」段之前；独立成段）——同技能口径（**仅客户明示时**装/卸、su 不自主发起、
  **仅在客户消息发起的轮次**里执行、非客户触发的轮次调用会被如实拒绝、不设二次确认卡）；
  **先落盘再激活**（先写 `docs/mcp/<name>.md`——MCP 声明：用途 / 启动命令 command＋args / 环境变量
  **名**引用 / 适用角色列表；**凭据值与一切秘密的值绝不写入文件**——再调 `install_mcp`/
  `uninstall_mcp`；工具**自己不写盘**，声明不存在/未含目标角色/server 名不合规如实拒绝）；装/卸
  **如实报告**（`path`/`digest` 以工具回执为准、生效态同技能）；**诚实告知口径（必讲、不得省略）**
  ——**外来 MCP 工具在 ANS 门禁之外执行**（不属 `write_file`/`run_shell` 任一受治理面）：**安装＝
  能力级授予**（门禁之外的新动作面；**不得表述为逐调用受审**；不改变任何角色的**写边界**）；
  卸载＝**先改声明**再调工具、**下次会话摘除**（在跑不打断）、**已发生的副作用不可撤**（仅保证
  后续会话不再装配；此前已执行调用的外部动作/副作用不在撤销范围内；不得暗示已回滚）。② **四棵
  修订**：确认制要点段首句增 `docs/mcp/**`（你给角色安装的 MCP 声明文档）、「写入这四棵目录树」
  「预置的四棵目录树除外」；规划纪律段落盘口径句「不在预置四目录内」；头注同步（V2 注新增、
  G-4/G-1 旧段计数加 V2 指针）。
- **守卫检验（实测，脚本抽取）**：J-1 守卫小句级——全卡含「授权/获准/放行」小句**恰为既有 2 条**
  且均否定式，**新增各段命中数 0**；**安装面段级零命中**（凡含「安装/卸载/技能/MCP」小句 **21 条**，
  守卫三词命中 **0**；过滤词本批扩含 MCP）；**MCP 段切片 13 条小句零命中**；docs/su 小句不受
  「须/需要/照常/务必…确认」误伤（4 条全 false）；docs/workflow.md 小句不声称免确认/直接写/已预置
  （4 条全 false）；看护段 slice 不受波及。未动守卫、未请求收窄。
- **测试**：更新 6 处既有断言（三棵逐一点名→四棵、`写入这三棵目录树`/`预置的三棵目录树除外`→
  四棵、`不在预置三目录内`→四目录；**新增旧「三棵」计数逐字不得复现反向断言**）＋**新增 2 例**
  ——① MCP 部分关键词逐项（政策四要素＋声明四要素＋「值绝不写入文件」＋诚实告知口径五要点）＋
  位置断言；② MCP 反向断言（MCP 面小句段级零命中三词＋小句数下限；「受审」类小句否定式，**带变异
  捕获非空洞验证**）。**未放宽任何既有断言**。
- **测试与门禁（实跑）**：`node --test "test/门禁引擎/*.test.ts"` → **188 计 / 187 过 / 0 红 /
  1 skipped**（Windows 专用；较上条 186 + 新增 2 例）；J-1 守卫 + g2-verify 复跑（`dispatch-after-
  landing-convention.test.ts` + `test/测试/g2-verify/scope-audit.test.ts`）→ **15/15**；`npm run
  typecheck` → **0 错**；全量 `node --test "test/**/*.test.ts"` → **1898 计 / 1889 过 / 8 红 /
  1 skipped**（工作区含并行未提交改动）——8 红**全在本角色边界外**：g1-verify 3 红（1 条本批前
  已红＝编排第四棵；2 条本批新增红＝其变异锚点/短语清单含旧「不在预置三目录内」，属**测试**角色
  待同步的机械 三→四）＋ g4-skill-verify 5 红（d-card-guard 2 条本批新增红＝旧三棵正则/变异锚点；
  c-preauth 1 条与 h-scope-audit 2 条本批前已红＝编排/运行时核心落树的 V1 钉子待翻转）。逐条归属
  与同步指引见 fix 文档 §四。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动。
- **跨边界发现（回报、未改）**：① **编排已见落树**（`SU_PREAUTHORIZED_WRITE_DIRS` 四棵、
  govern-session/run-role 四棵话术、change 文档）——与本卡文本同口径；② **运行时核心已见落树**
  （契约/两工具/接线/读取器；schema 两工具文案与本卡「诚实告知口径」逐点同解）——但其
  `request_confirmation` 描述与 `test/runtime-core/tools.test.ts` 仍「三棵」口径，待其同批 三→四
  （请 PM 确认是否在其派发内）；③ 桌面窗口 MCP handler（wave B）未落树；④ 工具名/路径/`env:NAME`
  形态逐字取自客户批准的设计，改名须同批回改本卡文本与本批两例测试。
- **未做/待验证（如实分列）**：真机端到端复验（客户令 su 装 MCP→无卡落盘→工具行/系统行→诚实
  告知话术；卸载「副作用不可撤」如实陈述）与独立验证上下文复验**未进行**；本条目**不声称已验**。

## 2026-10-16（五）— su 卡配套修订：G-4/I6「安装纪律」段 + 预授权扩列三棵（`docs/skills`）

客户 2026-10-16「都按推荐批准，开始实施」＝**G-4（角色能力安装）十项裁定全采纳**（PM 评审
§「客户批准」）；PM 派发 **wave 1（契约层先行）**：运行时核心（I1/I2 契约＋schema 两工具＋tools
两 maker）、编排（I4 注入渲染单一来源＋I5 `SU_PREAUTHORIZED_WRITE_DIRS` 增 `docs/skills`）、
**门禁引擎（I6 su 卡「安装纪律」段，J-1 守卫避让——本条）**。设计规格以
`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` 为准（§6.1/§6.2 落点、
§4.1 两文件形态、§4.4 卸载二分、§4.5「先落盘再激活」镜像、§4.6 候选 1 预授权扩列、裁定④轮次护栏）。
**判定逻辑一行未改**；机制侧由各自属主并行实施（编排 I5 已见落树，见 §跨边界发现）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本「安装纪律」段新增 + 确认制要点/规划纪律
  三棵修订 + 头注）、`test/门禁引擎/su-doc-surface-convention.test.ts`（更新 2 处断言 + 新增 3 例 +
  头部注释第 1/5/6 节同步与第 8 节新增）、本文件、`memo.md`、
  `docs/fix/2026-10-16_fix_g4-su-skill-install-card.md`（新）。**未碰** `app/**`、
  `src/pipeline|provider|service|common` 他角色文件、他角色 tests/docs（含 `test/测试/**`）、真机轮
  目录；不 commit。
- **卡文本修订（`BUILT_IN_ROLE_CARD_TEXT`）**：① **「安装纪律」段**（位置＝「派发失败/被拒」段之后、
  **「看护职责」段之前**——紧接 J-1 派发块、与「先落盘再派发」镜像相邻；且不落入 g2-verify 看护段
  slice）——仅客户明示时安装/卸载（su 不自主发起；**仅在客户消息发起的轮次**里执行——裁定④护栏，
  机制在桌面侧；客户明示后直接办理、**不设二次确认卡**）；**先落盘再激活**（先写
  `docs/skills/<name>/SKILL.md`＋`install.md` 再调 `install_skill`/`uninstall_skill`；工具**自己
  不写盘**，只校验登记与角色、触发激活（重建目标角色会话）、如实回执）；装/卸**如实报告**
  （`path`/`digest` 以工具回执为准、生效态 `rebuilt`/`next-session`、撤销路径、登记随时可查）；
  卸载**先改登记**再调工具、**「效果已撤」与「文件保留」是两个事实**（本仓没有删除原语，不得合并
  成「已删除」）；**安装不改变任何角色的任何写边界**——技能是必读资料、不是权限。② **三棵修订**
  （裁定①）：确认制要点段首句增 `docs/skills/**`（你给角色安装的技能文档，见下「安装纪律」）、
  「写入这三棵目录树」「预置的三棵目录树除外」；规划纪律段落盘口径句「不在预置三目录内」；头注
  同步（G-4 注新增、旧段计数注明「当时范围」）。
- **守卫检验（实测，脚本抽取）**：J-1 守卫小句级——全卡含「授权/获准/放行」小句**恰为既有 2 条**
  且均否定式，**新增各段命中数 0**；**安装面段级零命中**（凡含「安装/卸载/技能」小句 11 条，
  守卫三词命中 0）；docs/su 小句不受「须/需要/照常/务必…确认」误伤（4 条全 false）；docs/workflow.md
  小句不声称免确认/直接写（4 条全 false）。未动守卫、未请求收窄。
- **测试**：更新 2 处既有断言（两棵→三棵逐一点名＋三棵计数句；`预置的两棵目录树除外`→三棵；
  `不在预置两目录内`→三目录）＋**新增 3 例**——① 预授权扩列口径（三棵逐一点名＋`你给角色安装的
  技能文档`＋`见下「安装纪律」`＋**旧「两棵/两目录」计数逐字不得复现**反向断言）；② 安装纪律
  关键词逐项（四点＋两文件/两工具/生效态/二分陈述）＋位置断言（J-1 之后、看护职责之前）；③ 反向
  断言（安装面小句段级零命中三词＋小句数下限；「不自主发起 / 合并」类小句否定式，**各带变异捕获
  非空洞验证**）。**未放宽任何既有断言**。
- **测试与门禁（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **186 计 / 185 过 / 0 红 /
  1 skipped**（Windows 专用；较上条 183 + 新增 3 例）；J-1 守卫 + G-2 独立钉子复跑
  （`dispatch-after-landing-convention.test.ts` + `test/测试/g2-verify/scope-audit.test.ts`）→
  **15/15**；`npm run typecheck` → **0 错**；全量 `node --test "test/**/*.test.ts"` → **1799 计 /
  1794 过 / 4 红 / 1 skipped**——4 红**全在本角色边界外**：g1-verify 文件 3 红（1 条本批前已红＝
  编排 I5 两棵断言；2 条本批新增红＝其变异锚点/短语清单含旧「不在预置两目录内」，属**测试**角色
  待同步的机械 两→三）+ `test/测试/g3-search-verify/pi-loopback-verify.test.ts` 1 红（本批前已红＝
  并行 cleanPatterns 批次既有跨边界红）。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动。
- **跨边界发现（回报、未改）**：① **运行时核心 `schema.ts`**（`request_confirmation` 描述与
  promptGuidelines）与 `test/runtime-core/tools.test.ts` 仍写「两棵树/唯一例外＝docs/su＋
  docs/contracts」——待其同批 两→三（请 PM 确认是否在其派发内）；② **编排 I5 已见落树**且与本卡
  文本同口径（`SU_PREAUTHORIZED_WRITE_DIRS` 三棵、run-role/govern-session 注释同改——只读核读）；
  ③ 编排 I4（`src/common/编排/installed-skills.ts`＋测试）已见落树，与本卡文本无冲突；④ 工具名/
  目录名/登记文件名逐字取自客户批准的设计——若实施改名须同批回改本卡文本与本批三例。
- **未做/待验证（如实分列）**：真机端到端复验（客户令 su 装技能→无卡落盘→工具行/系统行→报告话术；
  卸载二分陈述）与独立验证上下文复验**未进行**（含 I3/I7 后续 wave 未落树）；本条目**不声称已验**。

## 2026-10-16（四）— su 卡配套修订：G-2/G 看护职责段（看护消息先核查再动作 + 恢复只能提议 + 看护纪律）

客户按推荐**批准 G-2 按提案实施**（9 个待裁点全部采纳、V1a+V1b 同轮；见
`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」）；
V1a+V1b 派发各自属主：桌面窗口（W1-W5）、运行时核心（R1/R2）、编排（O1）、**门禁引擎（G，本条）**、
桌面UI（U1）。设计规格以 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`
为准（§二 一条原则 / §3.3 文案纪律 / §五 su 排查流程 / §六 提议制 / §七 收束）。**判定逻辑一行未改**；
机制侧由各自属主并行实施（本记录撰写时尚未落树，只读核查见 §跨边界发现）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本新增「看护职责」段 + 头注）、
  `test/门禁引擎/su-doc-surface-convention.test.ts`（新增 3 例 + 头部注释第 7 节）、本文件、`memo.md`、
  `docs/fix/2026-10-16_fix_g2-su-watchdog-card.md`（新）。**未碰** `app/**`、
  `src/pipeline|provider|service|common` 他角色文件、他角色 tests/docs、真机轮目录；不 commit。
- **卡文本修订（`BUILT_IN_ROLE_CARD_TEXT`）**：**「看护职责」段**（位置＝「派发失败/被拒」段之后、
  末段「边界（三种情形）」之前）——① 系统看护在异常态（轮次逼近超时 / 投递排队积压 / 命令超时限 /
  重复失败）投 `[系统·看护]` 消息、完成静默态投「收束提示」→ **收到后先核查、再动作**
  （`role_status`/`session_tail` 只读核对，不得仅凭告警文本下结论；结论留证 `docs/su/**`）；
  ② 恢复动作（停止本轮 / 重建会话 / 重投任务）**只能提议**（`propose_recovery`，带证据）——
  **执行与否由客户一键确认**、由应用侧执行，**不得自行执行、不得承诺结果**（未获确认即未执行、
  取消亦如实回执）；③ 看护纪律——仅如实告知、**不得据此假设任何写权**；是否处理由 su 判断
  （「状态正常，忽略」是合法结局）；处理走既有 E-1 回交与 H-1 派发，核对确认卡死后才走
  `propose_recovery`。**措辞避让**：新段**零命中**「授权/获准/放行」小句——沿 2026-10-12 先例用
  「写权」；抽取实测：新段命中数 0、全卡含三词小句恰为既有 2 条且均否定式（J-1 守卫与 G-1 钉子
  独立复跑全绿，未动守卫）。
- **测试**：`su-doc-surface-convention.test.ts` **新增 3 例**——① 看护职责关键词逐项 + 位置断言
  （J-1 段之后、末段「边界（三种情形）」之前）；② 提议制关键词（只能提议 / 一键确认 / 不得自行执行 /
  不得承诺结果 / 未获确认即未执行 / 取消亦如实回执）；③ 纪律 + **反向断言**（看护面小句段级零命中
  「授权/获准/放行」（含小句数下限防空洞）；「据此假设 / 自行执行」类小句必须否定式）。**实施中测试
  修正（如实登记）**：定向窗口模式被卡文本自身「由**应**用侧执行；…自行执行」误触发——未改卡文本
  迁就测试，改为小句级否定式断言（更稳手法），未放松（违规变体仍被捕获）。**未放宽任何既有断言**。
- **测试与门禁（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **183 计 / 182 过 / 0 红 /
  1 skipped**（Windows 专用；较上条 180 + 新增 3 例）；J-1 守卫 + G-1 独立钉子复跑
  `test/测试/g1-verify/*.test.ts` + `dispatch-after-landing-convention.test.ts` → **28/28**；
  `npm run typecheck` → **0 错**；全量 `node --test "test/**/*.test.ts"` → **1555 计 / 1554 过 /
  0 红 / 1 skipped**（较上条 1528 的增量＝本批 +3 与并行角色新用例；**零新红**——上条两条 F-2 时点红
  已由属主前推修复）。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动。
- **跨边界发现（回报、未改）**：① `role_status`/`session_tail`/`propose_recovery` 与 `[系统·看护]`
  在 `src/**`/`app/**`/`test/**` 尚无实现引用（W1-W5/R1/R2/O1/U1 未落树）——卡文本先按客户批准的
  设计写死这些名字，若实施改名须**同批**回改卡文本与三例测试；② 告警/收束文案归编排 O1 单一来源，
  前缀/叫法若有变属文案级漂移，请 PM 转达同批对齐；③ `propose_recovery` 回执三态（R2/W5）与卡文本
  「未获确认即未执行」同口径；④ 「留证 `docs/su/**`」与编排预授权同批已落树的口径互相一致。
- **未做/待验证（如实分列）**：真机端到端复验（su 收告警 → 核对 → 只提议；收束提示与终局总结）与
  独立验证上下文复验**未进行**；本条目**不声称已验**。

## 2026-10-16（三）— su 卡配套修订：G-1/A3 规划纪律（契约/工作流落盘 + 派发按地址引用 + 契约变更）

客户 2026-10-16「这些开始启动」＝**批准 G-1 按提案实施**（PM 六项裁定见
`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」）；
V1 最小闭环派发四个独立上下文：编排（`renderDispatchPrompt` 必读块＝A1）、桌面窗口（投递时算 sha256、
契约缺失拒投＝A2）、**门禁引擎（su 卡文本＝A3，本条）**、运行时核心（`dispatch_task` 描述＝A4）。
设计规格以 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md` 为准（§三/§五/§六/§九 A3）。
**判定逻辑一行未改**；机制侧由各自属主并行实施（§跨边界发现——只读核读）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本新增「规划纪律」段 + J-1 段扩展 + 头注）、
  `test/门禁引擎/su-doc-surface-convention.test.ts`（新增 3 例 + 头部注释）、本文件、`memo.md`、
  `docs/fix/2026-10-16_fix_su-planning-workflow-card.md`（新）。**未碰** `app/**`、
  `src/pipeline|provider|service|common` 他角色文件、他角色 tests/docs、真机轮目录；不 commit。
- **卡文本修订（`BUILT_IN_ROLE_CARD_TEXT`）**：① **「规划纪律」段**（紧接「确认制要点」段之后）——
  多角色/跨角色工作**先落盘再派发**：**冻结契约** `docs/contracts/<name>-v1.md`（冻结后不可变、
  任何内容变化出新版本文件、**不原地改 v1**、旧版保留可读）＋**项目工作流** `docs/workflow.md`
  （步骤表 / 完成口令 / 变更与重验流程）；**写盘口径两分**——契约属已预置 `docs/contracts/**`（直接写），
  `docs/workflow.md` **不属预置两目录**、列入**同一次规划确认**的 preview + `confirmed:true`；被派发角色
  动手前必读（按序）+ **blocked 纪律**（不符即停、不得猜、不得改契约）；**契约变更**＝新版本文件＋同步
  更新 workflow.md，走确认流程；受影响回交**作废**、**重派**、引用新地址，未受影响步骤不回滚不重跑。
  ② **J-1 段扩展**（原文逐字保留）：派发文本**按地址引用**（项目内路径、**不内嵌契约全文**）；
  「必读（按序）」块由投递系统在投递时附上（路径 + **由系统在投递时计算的 sha256**），
  **不要自己算或转抄哈希**；引用的契约不存在会被**拒投**（如实回执，补落盘后重派）。措辞零命中
  「授权/获准/放行」小句（J-1 守卫随套件全绿）；既有「预授权两目录」句**逐字未动**。
- **写盘口径调和（如实登记，PM 派发措辞「两者均属预授权目录」的更正）**：机制实况（只读核读）——
  预授权**恰为两棵目录树**（`docs/su/**` + `docs/contracts/**`，编排 `SU_PREAUTHORIZED_WRITE_DIRS`），
  `docs/workflow.md` 不在其中（设计 §六 亦定其列 preview）；若按「两者都直写」写卡文本会与卡内
  「其余一切写盘…仍须 preview」句自相矛盾且 su 直写将被 F4 拒。**卡文本按机制实况两分口径书写**，
  与并行落树的编排 A1（必读块判据/渲染）和运行时核心 A4（`dispatch_task`「先落盘再派发」文案
  「契约直写／workflow 走确认制」）**三方独立同解**；若日后 workflow.md 并入预授权（编排扩列表），
  须同批回改卡文本与本条测试（fix 文档 §四 已登记）。
- **测试**：`su-doc-surface-convention.test.ts` **新增 3 例**——① 规划纪律关键词逐项 + 位置断言
  （确认制要点之后、J-1 之前）；② J-1 扩展关键词 + 位置断言（不等客户手动转达 → 按地址引用 →
  派发 ≠ 授权）；③ 反向断言（含 `docs/workflow.md` 小句不得声称免确认/直接写——两目录预置句不得被
  扩成三目录；「原地改 / 自己算或转抄」类表述必须否定式 + 定向反面模式）。**非空洞验证**：5 组违规
  变体全部被捕获（过程中修强一处裸「可」漏捕，见 fix 文档 §五）。**未放宽任何既有断言**。
- **测试与门禁（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **180 计 / 179 过 / 0 红 /
  1 skipped**（Windows 专用；较上条 177 + 新增 3 例；复跑两次同数）；`npm run typecheck` → **0 错**
  （工作区含并行上下文未提交改动）；全量 `node --test "test/**/*.test.ts"` → **1528 计 / 1525 过 /
  2 红 / 1 skipped**——2 红如实归属（均与本角色无涉）：`test/测试/kanban-fixes-verify/f2-claim-release.test.ts`
  F-2 场景 1/2 锁定已被 A2 收口的桌面本地派发模板（实际投递已切编排单一来源格式；A2 批准项的预期
  跨边界后果），属测试角色文件；并行树时点性登记（更早一次全量曾另见 `test/桌面应用/dispatch-fresh-enum.test.ts`
  同根因第 3 红，其属主窗口内已修复前推、复跑转绿）。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动。
- **跨边界发现（回报、未改）**：① 运行时核心 A4 文案已见落树、与本卡文本同口径（契约直写／workflow
  走确认制）；② 编排 A1 必读块判据/渲染已见落树、与卡文本对「必读（按序）」块的描述一致；③ 桌面窗口
  A2 已见落树（只读核读：投递机接线编排三件套、`filePrint` 探测算哈希、契约缺失 fail-closed 拒投、
  已删本地副本 `renderDispatchPromptLocal` 收口）——**四上下文（A1/A2/A3/A4）口径互相一致**；
  ④ 全量 2 红均属**测试**角色 F-2 验证文件（见上），请 PM 转达其属主同步——本角色不代改他方文件。
- **未做/待验证（如实分列）**：真机端到端复验（su 实际落盘契约/工作流、派发文本带必读块、角色实读、
  契约缺失拒投）与独立验证上下文复验**未进行**；本条目**不声称已验**。

## 2026-10-16（二）— su 卡配套修订：`docs/su/**` + `docs/contracts/**` 免逐次确认（客户 2026-10-16 裁定；编排预置机制并行）

客户裁定原文：「这个 su 可以写 docs/su 的目录，不需要我审批」＋同日追加「还有个契约目录也可以给他写。」
⇒ 预授权范围＝ `docs/su/**` + `docs/contracts/**`（后者为 G-1 提案约定的跨角色契约落盘目录；目录约定随
G-1 本体实施，预授权先行装好）。机制侧（su 会话初始 writeSet 预置两目录树，开会话/重建均生效；仅 su、
仅该两目录树；其余写盘与其角色行为不变，fail-closed 不放松）由**编排**在其边界内并行实施；本角色按 PM
派发只做**卡文本侧**配套修订——不改这段，su 仍会逐次请求确认、客户裁定落地后行为不变（原「落盘前照常经
`request_confirmation` 客户确认」句即此问题）。**判定逻辑一行未改。**

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本两段 + 头注）、
  `test/门禁引擎/su-doc-surface-convention.test.ts`（更新 2 例 + 新增反向断言 1 例）、本文件、`memo.md`、
  `docs/fix/2026-10-16_fix_su-notes-preauth-card.md`（新）。**未碰** `app/**`、
  `src/pipeline|provider|service/其余`、`src/common` 他角色目录、他角色 tests/docs、真机轮目录
  （`ans-testbed/kanban-live-3`、`/private/tmp/ans-kanban-dev3-ad1bdf3b`，只读不写）；不 commit。
- **卡文本修订（`BUILT_IN_ROLE_CARD_TEXT`）**：①「文档面」段删除旧句「…落盘前照常经
  `request_confirmation` 客户确认」（对 docs/su 已不成立），点明跨角色契约文档目录 `docs/contracts/**`；
  ②「确认制要点」段改写——`docs/su/**` 与 `docs/contracts/**` 写盘许可**已预置**（无需逐次确认、直接写
  即可、**开会话与重建后均生效**）；**其余一切写盘**（含 `角色卡/**` 与 `docs/` 其他路径，逐一列明——
  从严口径：`docs/` 下仅这两棵目录树例外）仍须把每个路径逐条列入 `request_confirmation` 的 preview ＋
  `confirmed:true` 才发行；「按会话生效/会话重建重开需重确认」限定到**经确认发行**的路径，**预置的两棵
  目录树除外**（不受重建影响、始终可直接写入）。措辞不用「预授权」字面——J-1 守卫拦未否定的「授权」
  小句，沿用 2026-10-12 先例改用「许可/预置」（语义＝客户已预先同意、免逐次审批）。
- **测试**：`su-doc-surface-convention.test.ts`——文档面用例：删「落盘前照常经」正面断言，改断两目录
  逐一点名 + 契约文档定位，＋**反向断言旧句不得保留**；「确认制要点」用例改写（预置豁免关键词、位置
  锚句改「没有角色目录…」之后；原关键词断言全保留）＋**新增反向断言**（凡含 `docs/su` 的小句不得出现
  「须/需要/照常/务必…确认」式要求，防「笔记也要先确认」以别的措辞回塞）。**未放宽任何既有断言**。
- **测试与门禁（实跑）**：`node --test "test/门禁引擎/**/*.test.ts"` → **177 计 / 176 过 / 0 红 /
  1 skipped**（Windows 专用；较上条 176 计 + 新增反向断言 1 例）；`npm run typecheck` → **0 错**（复跑
  两次，第二次含编排当日落树改动的工作区，仍 0 错）；全量 `node --test "test/**/*.test.ts"` → 复跑两次
  均 **0 红**（**1497 → 1502 计**，计数随并行角色持续新增用例；最新 **1502 计 / 1501 过 / 0 红 /
  1 skipped**；较上条 1408 的增量全为并行角色新用例，**零新红**）。环境：Node v24.14.0 / macOS /
  工作区含他角色未提交改动。
- **跨边界发现（回报、未改）**：① 运行时核心 F-5-opt2（`schema.ts` 文案，并行中）应与本口径对齐——
  su 写两目录已免确认，该处「写盘一律先确认」式表述同属误导；② 编排预置机制**同日已见落树**（只读
  核读：`run-role.ts` `SU_PREAUTHORIZED_WRITE_DIRS = ["docs/su", "docs/contracts"]`、按
  `kind === "built-in-governance"` 仅 su、每次 gate 求值并入目标路径、开会话/重建同口径——与本卡文本
  一致；其 dated 记录同日撰写时未见、属其同批交付）；日后其口径再变须回改本卡文本与测试（核对登记于
  fix 文档 §二/§五.2）；③ G-1 本体若改契约目录名/结构，须同步卡文本「跨角色契约文档写在
  `docs/contracts/**`」句。
- **未做/待验证（如实分列）**：机制侧（编排预置）由编排属主并行实施，本任务未碰；真机端到端复验
  （su 对两目录免确认写盘成功、其余路径仍触发确认卡）**未进行**；独立验证上下文复验未进行；本条目
  **不声称已验**。

## 2026-10-16 — F-5-main：F4 拒绝信息可操作化 + `allowedByRoot` 语义修正（客户按推荐批准；PM 派发实施轮）

kanban-live 真机轮：su 的治理笔记（`docs/su/memo.md` / `docs/su/changelog.md`）落盘后被 F4 硬拒——
拒绝原文只说「不在任务 writeSet 内」，却把**边界条目**列在「允许写入的路径」下（覆盖被拒路径的 `docs`
目录赫然在列）⇒ 列表与拒绝语义**自相矛盾**、全文**零恢复指引**；su 遂请求「客户聊天授权」——该路径在
机制上不可能奏效（发行只经 `request_confirmation` 的 preview 逐条列路径 + confirmed:true，聊天消息不
进发行器）。真根因中「重建静默清零已发行集」为跨角色未登记交互（D1，桌面窗口 O-1 × 编排 issued）；
本条目实施的是**本角色文件内的 F-5-main**（D2 修复 + 模型侧指引；判定语义零放宽）。提案与完整根因链
见 `docs/fix/2026-10-15_fix_kanban-f4-governance-note.md`（§实施记录）；批准与派发见
`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §客户批准记录（F-5-opt1
派桌面窗口/编排、opt2 派运行时核心、opt3 未勾选——均不在本任务）。

- **边界**：`src/service/gate/resolve-write.ts`、`src/model/decision.ts`（**仅注释、零形状变化**——
  单一主属主敏感面，按法案 §一.5 经 PM 评审→客户批准后实施）、`src/common/门禁引擎/boundary-core.ts`、
  `test/门禁引擎/f4-denial-guidance.test.ts`（新，6 例）、`test/门禁引擎/su-doc-surface-convention.test.ts`
  （追加 1 例）、本文件、`memo.md`、上述提案文档（状态更新＋实施记录）。**未碰** `app/**`、
  `src/provider|pipeline|service/其余`、`src/common` 他角色目录、他角色 tests/docs、kanban-live 项目与
  测试角色证据目录；不 commit。
- **改动 ①（F4 reason 可操作化）**：原头 `路径在角色边界内，但不在任务 writeSet 内（F4）：<rel>`
  **逐字保留**（跨角色既有断言按该子串），其后追加指引：如需写入，把该路径逐条列入
  `request_confirmation` 的 preview 呈客户确认——`confirmed:true` 后该路径被发行进 writeSet、再重试；
  任务型会话把路径加入任务 writeSet；**许可按会话生效**（重建/重开后不自动保留，需重新确认）。
- **改动 ②（F4 分支 `allowedByRoot`＝当前已发行可写集）**：新增 `issuedByRootOf`——取 `scope.writeSet`
  中**在边界内且条件已激活**的项（逐项用与判定同源的 `pathCovers`/`isActive` 过滤；writeSet 合同为
  项目相对 ⇒ 归 project 组）；writeSet 空（或全被滤掉）⇒ 两根皆空、如实呈现「此刻什么也写不了」。
  非 F4 分支（F5 缺条件 / 未匹配 / 跨根 / F7 / 接受门）仍走 `allowedByRootOf`（边界覆盖）**逐字不变**；
  `allowedByRootOf` 注释同步限定并反指新函数。**渲染器代码零改、内容随动**（两份 `format-denial.ts`
  与编排 `output.ts` 未动）。
- **改动 ③（su 卡文本「确认制要点」段）**：`BUILT_IN_ROLE_CARD_TEXT` 在「docs/su 文档面」段后追加：
  每个路径逐条入 preview、`confirmed:true` 才发行、对话里口头同意**不算**（不能作为写盘依据）、
  写盘许可按会话生效（同会话内已确认路径不必重复确认；重建/重开需重新确认）。措辞避开 J-1 守卫的
  「授权/获准/放行」小句（本段零命中，守卫测试全绿）；头注同步登记来源。**判定逻辑一行未改。**
- **改动 ④（`decision.ts` 语义澄清注释）**：`AllowedPathsByRoot` = 非 F4 分支→边界覆盖（无任务收窄时
  即写权上界）；F4 分支→当前已发行可写集。**类型形状零变化**（引用方证据仅注释级影响）。
- **测试**：新增 `test/门禁引擎/f4-denial-guidance.test.ts`（6 例）——F4 仍拒（fail-closed）＋原头逐字
  ＋指引子串（request_confirmation/preview/confirmed:true/任务 writeSet/按会话生效/重建）＋不含旧快照
  线索＋「同路径在 writeSet 内照常放行」对照；F4 分支列表：空集⇒两空、恰列已发行项（越界/条件未激活
  不计入、边界目录本身不再出现）；非 F4 分支回归（F5/未匹配列表仍为边界覆盖）；渲染链（formatDenialMessage
  项目行＝当前可写集、指引与 reason 同现）。`su-doc-surface-convention.test.ts` 追加 1 例（要点段关键词
  ＋位置在文档面段之后；既有断言未动）。**跨角色兼容只读复核**：编排 `session-handle.test.ts:132`
  （`/不在任务 writeSet 内/`）、`confirmation-gated.test.ts:160`（`/writeSet/`）、测试 `boundary-matrix.test.ts`
  （`/F4/`＋形状）、桌面 `session.test.ts`（`/按根分组/`）依赖的原头/标题子串全部逐字保留；全量复跑证实
  零跨边界红。
- **测试与门禁（实跑）**：`node --test 'test/门禁引擎/**/*.test.ts'` → **176 计 / 175 过 / 0 红 /
  1 skipped**（Windows 专用；较实施前 169 + 新 7）；`npm run typecheck` → **0 错**；全量
  `node --test "test/**/*.test.ts"` → **1408 计 / 1407 过 / 0 红 / 1 skipped**。**如实登记**：派发/提案
  所载「2 条基线红（`test/桌面应用/pi-config.test.ts` 检出目录名、`test/项目管理/shared/path-primitives.test.ts`
  macOS `/var` 符号链接）」在当前 HEAD **未复现**——两文件单独跑 36/36 全过，且两域均不 import 本次改动
  的任何模块（不可能由本次翻绿），应为提案轮与本轮之间的既有提交已修复；全量**零新红**。
  环境：Node v24.14.0 / macOS 26.6.0 / HEAD `27bc263`（工作区含本角色未提交改动）。
- **未做/待验证（如实分列）**：opt1/opt2/opt3 不在本任务（opt1 与 opt2 派他角色、opt3 未勾选）；
  §五.5 真机验证三项（su 经 request_confirmation 更新自己笔记成功；F4 拒绝后模型能依指引自行恢复；
  重建后拒绝信息能把模型导回确认通道）与独立验证上下文复验**未进行**；本条目**不声称已验**。
  跨边界发现（回报、未改）：F4 完整消息文本变化使逐字引用旧文案的既有证据在文本上不再逐字有效
  （判定语义未动）；`writeSetContains` 跨根字符串比对维持「登记观察、不动」（PM 评审 §四.3）。

## 2026-10-14（三）— 补建功能导航 `feature-map.md`（客户要求统一补建；修复 role-card 死链）

- **背景**：`role-card.md`「系统功能导航」的链接「当前导航见[门禁引擎功能导航](feature-map.md)」自建角色
  以来指向**不存在的文件**（死链；全仓普查 5 个角色同缺，客户要求统一补建）。
- **交付**：新建 `角色卡/门禁引擎/feature-map.md`——10 条功能导航行（功能 / 一句话用途 / 状态 / 文档链接）：
  共享类型（Model 层）主属；双来源角色解析与项目枚举（`resolveRole`/`listProject`）；**归档角色约定
  （`archived: true`）**；双来源边界解析（含创世种子与内置回退）；写权判定 `resolveWrite`（含旧快照线索）；
  写权接受证据 F6（`.ans` pin 链）；shell 命令级闸 (c) `classifyShell` 与公开再导出；散文式边界响亮失败
  修复（A+C）；su 内置卡文本与治理约定文案；共享路径原语与解析 IO 辅助。
- **纪律（不虚构、不灌水、零死链）**：文档列**只链实际存在**的目标——`changelog.md` / `memo.md` /
  `role-card.md` / `boundary.yaml` / `docs/change/2026-10-12_change_su-doc-surface.md` /
  `docs/fix/2026-10-12_fix_boundary-prose-silent-empty.md` / `test/门禁引擎/archived-role.test.ts`；
  `docs/feature/`、`functional-description.md`、`api-spec.md` 尚无内容 ⇒ **不造链接**，在页首与说明中
  如实标注「待建」。**链接自检：7 个相对目标逐一核在，0 死链**；role-card 侧的死链随之闭合。
- **边界**：本文件在 Section 1 白名单内；本条同批更新本 changelog 与 `memo.md`，未动其他文件；不 commit。

## 2026-10-14（二）— 归档角色约定 `archived: true`：boundary.yaml 恢复原名原位留档；枚举静默跳过、开启 fail-closed 拒绝（客户口头指令经 PM 转达；取代上条 .frozen 方案与期望）

客户改令（PM 转达）：冻结归档目录 `角色卡/桌面应用/` 要**补回原名 `boundary.yaml`**（不再用 `.frozen`
改名方案——客户要求目录里就有这份文件）。为不让它按现有枚举规则复活成第三个活角色，PM 给定约定并由本
角色实现：边界 YAML 支持**顶层键 `archived: true`**（与 role/entries 并列，保留其余字段与注释原样）；
解析出该标记时 ① `listProject` 不枚举该角色、**不产生任何警告**（静默跳过，替代「缺少 boundary.yaml」
告警路径）；② 按 id 解析/开启入口（`resolveRole`，CLI `role run` 与桌面开启所经入口）**fail-closed 拒绝**、
错误信息明确；③ 不带该键的目录行为**完全不变**。本条目取代上条（.frozen 时期的「恰一条警告」严格期望
——上条结尾对其早有预判：「若日后实现『归档静默跳过』，只需把该期望改回 `[]`（注释已指路）」；今按新指令
如期改回）。**未实现**任何超出约定的功能。

- **边界**：`src/model/boundary.ts`（`BoundarySection1` 增可选 `archived`——本角色为主属主的共享类型，
  加可选字段向后兼容）、`src/common/门禁引擎/boundary-yaml.ts`、`src/common/门禁引擎/boundary-core.ts`、
  `src/service/role/resolve-role.ts`、`test/门禁引擎/archived-role.test.ts`（新，8 例）、
  `test/门禁引擎/list-project.test.ts`（真实仓库用例期望回改）；本文件、`memo.md`。**未碰** `app/**`、
  `test/桌面应用/**`、任何他角色目录与文件；不 commit。
- **解析层**（`boundary-yaml.ts`）：`archived` 入 `TOP_KEYS` 并**严格校验布尔**——`archived: "true"`
  （字符串）/`archived: 1` 一律解析失败（fail-closed 家族：坏配置整条拒绝，不给模糊地带）；`false`/缺省
  = 不标记（等价未归档）。新导出 `parseBoundaryYamlDoc(text)` 回传 `{ entries, archived? }`；旧入口
  `parseBoundaryYaml` 变薄包装（仍只回条目，**向后兼容**，既有调用与测试逐字不变）。`boundary-core.ts`
  的 `parseEntries` 换成 `parseEntriesDoc`（legacy `.md` 无归档标记）；`loadBoundaryFile` 解析成功且
  `archived === true` 时在结果上携带 `archived: true`——**失败路径（unaccepted）不带该标记**，归档判定
  一律走**中性读取**（accepted:false、无 pin），不依赖接受/pin 状态。
- **枚举**（`listProject`）：每个角色目录先探边界文件的归档标记，命中即**静默跳过**（不枚举、零警告）。
  探测**先于**缺 role-card.md 检查——归档目录即便缺卡也不告警（归档=对枚举不可见）。追加细则：若目录下
  子目录**全部**为归档静默跳过，则**不补**「未枚举到有效角色」汇总提示（否则该场景仍会出一条警告，
  违背「不产生任何警告」）；只要存在活目录（无论成败），汇总照发——与归档机制引入前逐个比对无行为变化
  （逐条告警顺序、缺卡优先于缺边界等均保持原样；仅边界文件的读取时机提前，纯读无副作用）。
- **开启**（`resolveRole`）：注册角色（`project.roles`）的边界文件解析出 `archived: true` ⇒ 抛
  「**角色 X 已归档，不可开启**」——CLI `role run` 与桌面 `openRoleSession` 皆经 `setupRole → resolveRole`，
  失败信息主体即该句（`setupRole` 会再包一层「角色/边界解析失败：」前缀，属编排侧既有格式、未动）。
  探测独立于治理接受证据：即便接受/pin 缺失或失效，照常先看到归档标记，无绕过口。
- **防御深度**（`resolveBoundarySection` 第 1 步）：归档角色的边界**一律不作为写权来源**——命中即返回
  未接受 + `parseError`（「角色 X 已归档（边界顶层 archived: true），其边界不予采用」）⇒ `resolveWrite`
  拒绝一切写入。覆盖「绕过 resolveRole 直接按 id 解析边界」的调用方（开启入口的明示拒绝仍在 resolveRole）。
- **测试**：新增 `test/门禁引擎/archived-role.test.ts`（8 例，**夹具、全绿**）：解析（合法键/布尔严格/
  false 与缺省不标记/loadBoundaryFile 回传）；listProject（与活角色共存静默、全归档同样静默无汇总、
  缺 role-card.md 也静默、不带 archived 键行为不变——缺边界仍逐条告警且归档不吞旁告警）；resolveRole
  （归档拒绝——无接受证据与有接受证据两态皆拒；活角色照常）；防御深度（boundary 未接受 + parseError +
  resolveWrite 全拒）。`list-project.test.ts` 真实仓库用例：期望**改回** `deepEqual(warnings, [])`，并
  加守卫「`桌面应用` 不得复活为活角色」（归档约定点 ① 的原位钉死）；注释注明等待态。
- **测试与门禁（如实分列）**：`node --test test/门禁引擎/archived-role.test.ts` → **8/8 全过**；
  `node --test "test/门禁引擎/*.test.ts"`（带引号）→ **161 计 / 159 过 / 1 红 / 1 skipped**——唯一红为
  **预期的等待态**：`list-project.test.ts` 真实仓库用例（治理侧尚未恢复文件，`角色卡/桌面应用/` 仍无
  boundary.yaml → 实得恰一条「缺少 boundary.yaml」警告 vs 期望 `[]`）；全量 `node --test "test/**/*.test.ts"`
  （带引号）→ **1054 计 / 1050 过 / 3 红 / 1 skipped**——3 红 = 上述等待态 + 两条既有基线红
  （`test/桌面应用/pi-config.test.ts` 检出目录名、`test/项目管理/shared/path-primitives.test.ts`
  macOS `/var`），**无新红**（相对上条 1046/1043/2 基线红，恰为 +8 新夹具全过、真实仓库用例转入等待态）；
  `npm run typecheck` **0 错**。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动。
- **等待态已闭（2026-10-14 当日闭环）**：治理侧已恢复 `角色卡/桌面应用/boundary.yaml`（原名 + 顶层
  `archived: true`，其余字段与注释原样）；本角色复跑——真实仓库用例**转绿**，门禁引擎套件
  **161 计 / 160 过 / 0 红 / 1 skipped**（全绿除 Windows 专用 skip）；全量 **1054 计 / 1050 过 / 3 红 / 1 skipped**，
  3 红 = 两条既有基线红 + `test/桌面应用/project.test.ts:29`（**跨角色新旧衔接、非本角色文件、未动**：
  该文件仍按 `.frozen` 过渡态断言「枚举如实跳过**并提示**缺 boundary.yaml」——归档键约定下变为
  **静默无提示**，其属主〔桌面窗口/桌面UI 侧〕需按新语义更新，已转报 PM）。恢复前曾在真实 `角色卡/`
  树临时副本上预演（warnings `[]`、桌面应用不枚举、其余活角色照常、resolveRole 抛「已归档，不可开启」
  ——与恢复后实测逐项一致，只读复制、未动归档目录本体）。归档目录内 `归档说明.md` 与 `role-card.md`
  相关链接的同步仍归其属主（**非本角色文件、未动**）。备查：su 卡文本
  （`BUILT_IN_ROLE_CARD_TEXT`）**未**提及归档约定——如日后要 su 在治理流程里主动归档角色，须另立任务
  补卡文本（留意 J-1 守卫的措辞碰撞，见上条备忘）。

## 2026-10-14 — list-project 真实枚举期望更新：如实钉住冻结归档目录（桌面应用）唯一一条预期提示

> 后续更新（同日）：客户改令恢复原名 `boundary.yaml` 并采用上文 `archived: true` 归档约定——本条期望
> 方案已由归档键约定取代；本条保留为 `.frozen` 方案时期的事实记录（同日治理侧恢复文件后，其上条目
> 复跑转绿、闭环）。

任务指明「只更新测试期望，不实现归档静默跳过」。背景事实链：客户 2026-10-14 确认「桌面应用」拆分为
**桌面UI / 桌面窗口**，旧目录 `角色卡/桌面应用/` **原位冻结归档**——其 `boundary.yaml` 已改名
`boundary.yaml.frozen`（`归档说明.md` 明记：改名后角色枚举跳过该目录，导入本仓库会有**一条**
「缺少 boundary.yaml，已跳过」系统提示，「**属预期**；如需消除，建议后续由门禁引擎支持『归档标记静默
跳过』约定」，并注「请勿改名恢复」）。PM 已按「接受该提示」处理，用户知悉。连带后果：真实枚举测试原先
断言本仓库 `warnings` 严格为空，现转红（装配角色全量跑：1046 计 / 1042 过 / 3 红 = 本项 + 两条已知基线红）。

- **定位（读出实际语义）**：取红断言在 `test/门禁引擎/list-project.test.ts:23` 用例（对 **REPO_ROOT
  真实仓库**，非夹具）原第 41 行 `assert.deepEqual(listing.warnings, [])`。运行复现实得
  `warnings === ["角色卡/桌面应用：缺少 boundary.yaml，已跳过"]`——恰一条，与 `归档说明.md` 所述一致
  （该条出自 `resolve-role.ts:176` 既有「缺 boundary.yaml」通道；`角色卡/` 下其余 11 个目录均正常枚举）。
- **改动（旧 → 新，仅此一处用例，最小改动）**：
  - 用例名：「……边界均解析成功**且无警告**」→「……边界均解析成功；**警告恰为冻结归档目录一条**」。
  - 断言：`deepEqual(warnings, [])` → `deepEqual(warnings, ["角色卡/桌面应用：缺少 boundary.yaml，已跳过"], …)`
    ——按任务给定口径取**严格等于该一行**（比「白名单+其余为空」更强：新增/缺失/改名/换序任何一条都转红）。
  - 用例内加注释注明依据（客户确认的拆分、`归档说明.md`、严格相等意图、若未来实现「归档静默跳过」须再更新期望）
    ——该注释同时是该未决选项的**唯一耦合点**（见下）。
- **未动（防越界佐证）**：其余警告断言一律保持原强度——同文件其余四处夹具用例（英文/中文/空目录、T14 坏角色）
  仍为 `deepEqual(warnings, [])` 或逐条 match；`boundary-empty-and-builtin.test.ts:194` 亦为夹具用例、
  未动；`src/**` 一行未改（无需）；「归档标记静默跳过」等新功能**本任务明确不做**。
- **测试与门禁**：`node --test test/门禁引擎/list-project.test.ts` → **7/7 全过**（含取红用例转绿）；
  `node --test "test/门禁引擎/*.test.ts"`（带引号）→ **153 计 / 152 过 / 0 红 / 1 skipped**（Windows 专用，
  与上一基线计数一致）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **1046 计 / 1043 过 / 2 红 / 1 skipped**
  ——相对装配侧取红时的 1046/1042/3 红，**恰回绿本项**，2 红**恰为两条既有基线红**（`test/桌面应用/pi-config.test.ts`
  检出目录名 ans-cli、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），无新红；
  `npm run typecheck` **0 错**。环境：Node v24.14.0 / macOS / 工作区含他角色未提交改动（未触碰其文件）。
- **对「归档静默跳过」选项的影响评估（一句话）**：本改动不替该选项背书、也不放开警告检查——它恰让该条提示
  **保持可见**直到选项落地；若日后实现，只需把本期望从「恰一行」改回 `[]`（一行改动，注释已指路），
  无结构性耦合。

## 2026-10-12 — su 卡文本末段改写：fail-closed 限定到「两者皆无」的回退情形（结清上一轮登记的未决；协调方裁定「改」）

上一轮（su 文档面，见下条）回交时如实登记了一条未决：`BUILT_IN_ROLE_CARD_TEXT` 末段「本版 fail-closed——
acceptance 未接受，故治理会话的一切写入都会被门禁在写之前拒绝（契约 §0：v1 治理会话不允许写盘）」与现状
明显冲突——它把「既无创世、项目也无治理边界文档」的**回退情形写成了普遍结论**，会误导 su 以为自己不能写盘
（真机 su 已在正常写治理产物）。**协调方裁定：改。** 本条把结论限定到真实情形；口径以 `governance-seed.ts`
头注 §12.2 与 `boundary-core.ts::resolveBoundarySection` 的现有实现为准（只读核对）。**判定逻辑一行未改。**

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本末段 + 其头注 + `builtInBoundarySection` JSDoc 一处
  同源误述）、`test/门禁引擎/su-doc-surface-convention.test.ts`（追加 2 例）、本文件、`memo.md`；**未动**
  `governance-seed.ts`、`resolveBoundarySection`/`resolveWrite` 判定、`resolve-role.ts`、任何他角色文件。
- **新末段（三分支，与实现逐条对齐）**：① 空项目 + 客户发起 bootstrap（创世）——治理种子边界生效，
  `角色卡/`、`docs/`、`.ans/` 三个目录命中即**允许写入**，你可写治理产物；② 已 bootstrap 的项目——按该项目的
  治理边界文档工作（pin 接受后**创世例外自终止**）；③ 两者皆无（回退内置、acceptance 未接受）——写入被门禁
  在写之前拒绝；**fail-closed 的本意只指这一种**。删去旧句的无条件框定（「本版 fail-closed」「一切写入都会被
  门禁在写之前拒绝」「契约 §0：v1 治理会话不允许写盘」）。头注同步登记本条裁定与三分支口径；
  `builtInBoundarySection` 的 JSDoc 原写「治理会话在 v1 不允许写盘（契约 §0）」为同源误述，一并限定（纯注释，
  无逻辑改动）。
- **测试（追加 2 例；归属判断：落 `su-doc-surface-convention.test.ts`）**：该文件正是登记该冲突的那一轮所建，
  其前提（落盘经 `request_confirmation`）与旧末段冲突；且该文件已有「includes 断言 + 小句级反向断言」两种现成
  手法。新用例：① 三分支逐点断言（「三种情形」框定、三目录写全、命中即允许写入、你可写治理产物、已 bootstrap
  的项目、治理边界文档、pin 接受后创世例外自终止、两者皆无、acceptance 未接受、写入被门禁在写之前拒绝、
  fail-closed 的本意只指这一种）；② **反向断言**——旧句逐字（「一切写入都会被门禁在写之前拒绝」「不允许写盘」
  「契约 §0」）不得出现，且**小句级**：凡含「写之前拒绝」的小句必须带情形限定（两者皆无｜这一种｜回退内置），
  防将来以别的措辞把普遍结论塞回来。分支的**行为**本身（创世可写/回退拒写）已由 `cold-start-genesis.test.ts`、
  `built-in-section-equivalence.test.ts` 在运行时钉死，本文件只钉文案（不重复造运行时用例）。
- **改中碰撞（如实记录，防再踩）**：新末段初稿「命中即放行」「pin 接受后创世授权自终止」分别撞上 J-1 守卫
  （`test/门禁引擎/dispatch-after-landing-convention.test.ts:51` 小句级：凡含 授权/获准/放行 的肯定句必须带
  否定词——其本意是防「已获授权/已放行写盘」式表述，对描述门禁行为/机制的正向句是误抓）。按任务约束**未动**
  该守卫（不在点名文件内），换用不被误抓的措辞（**允许写入** / **创世例外自终止**，后者用本仓既有术语
  「有界创世例外」），语义不变。若后续想在卡文本里正向使用这三个词，须先经协调方评估收窄该守卫。
- **测试与门禁**：本角色套件 `node --test "test/门禁引擎/**/*.test.ts"`（带引号）→ **153 计 / 152 过 / 0 红 /
  1 skipped**（Windows 专用；较基线 151/150 + 本次 2）；全量 `node --test "test/**/*.test.ts"`（带引号）→
  **909 计 / 906 过 / 2 红 / 1 skipped**——**2 红恰为基线红**（`test/桌面应用/pi-config.test.ts`
  检出目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），**无新红**；
  `npm run typecheck` **0 错**。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`
  （工作区含他角色未提交改动）。
- **如实说明**：① 执行面仍是**文案约束**（卡文本为单一来源），闸层判定不受影响、未动一行；② 桌面角色的
  docs（如 `角色卡/桌面应用/memo.md:23` 的「su 本版只读」风险条目与 changelog 里未实施的「只读提示」方案）
  仍带旧框定——**非本角色文件、未动**，供协调方转达其属主坐实「该提示方案已无必要、且会反向误导」。

## 2026-10-12 — su 自己的文档面写死 `docs/su/memo.md` / `docs/su/changelog.md` + `角色卡/` 红线（客户裁定「su 也要有自己的 memo」）

客户裁定：内置治理角色要有工作备忘录，像项目角色一样持续维护（原话「**su 也要有自己的 memo**」）。
真机已踩坑一次（改动动因，客户在界面上看到了告警）：su 把 `memo.md` / `changelog.md` 写进了
`角色卡/su/`，被角色枚举当作**重复角色**跳过并告警（`src/service/role/resolve-role.ts:164`：`角色卡/`
下每个目录都按角色 id 解析，`su` 与内置角色 id 冲突；且非角色目录还会触发「缺少 role-card.md」告警
`:171`）。本派工是**治理文案**：只动 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`）+ 其头注；判定逻辑
一行未改；`resolve-role.ts` 未动（枚举行为本身不改——任务明言）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本 + 头注）、
  `test/门禁引擎/su-doc-surface-convention.test.ts`（新，3 例）、本文件、`memo.md`、
  `docs/change/2026-10-12_change_su-doc-surface.md`；未碰 `app/**`、`src/pipeline/**`、`src/provider/**`、
  `src/service/**`、种子条目（`governance-seed.ts` 未动）、他角色 tests/docs；未在 `角色卡/` 下新建任何目录。
- **卡文本要点**（钉死的产品口径，`docs/` 本就在 su 的治理边界内、无角色语义）：① 内置治理角色自己
  **没有角色目录**——工作文档固定写在 `docs/su/memo.md`（**工作备忘录**：进行中事项 / 待确认项——有进展
  或新挂起就更新，**不等客户问**）与 `docs/su/changelog.md`（**变更记录**），落盘前照常经
  `request_confirmation` 客户确认；② **红线**——**不要**在 `角色卡/` 下建 `su`（或任何**非项目角色**）
  目录，并写清机制：该目录下每个目录都会被角色枚举**按角色 id 解析**（`su` 与内置角色 id 冲突 → 判
  「**角色重复**」跳过并告警；非角色目录 → 触发「**缺少 role-card.md**」告警）。
- **旧叙述核查（如实指出；按任务约束未顺手大改——已结清：协调方 2026-10-12 裁定「改」，见上一条变更）**：卡文本**末段**「治理会话的一切写入
  都会被门禁在写之前拒绝（契约 §0：v1 治理会话不允许写盘）」与现状**明显冲突**——T31 创世分支落地后，
  空项目 + `genesisBootstrap` 时 su 可写治理产物（`角色卡/`、`docs/`、`.ans/` 命中即放行）；已 bootstrap
  项目由项目覆盖分支按边界工作；且本条新增段落本身就以「落盘经 `request_confirmation` 确认」为前提。
  残留有效的情形只有「无创世、无项目治理边界」时回退的内置未接受边界——末段把该特殊情形写成了普遍结论。
- **测试**：新用例 3 例全绿（文档面路径与维护口径逐项断言——`docs/su/memo.md` / `docs/su/changelog.md` /
  「进行中事项」「待确认项」「有进展或新挂起就更新」「不等客户问」/「落盘前照常经」+`request_confirmation`；
  红线原文与两类告警机制断言；**反向断言**——「`角色卡/` × su」小句必须是否定/禁止式，且「不要」替换为
  「不」后不得命中肯定式「在 `角色卡/` 下建 `su`」指令，避免红线句自身被误抓，与 `temp-staging-convention`
  先例同法）。本角色套件 `node --test "test/门禁引擎/**/*.test.ts"`（带引号）→ **151 计 / 150 过 / 0 红 /
  1 skipped**（Windows 专用；较前 148 + 本次 3）；全量 `node --test "test/**/*.test.ts"`（带引号）→
  **906 计 / 903 过 / 2 红 / 1 skipped**——**2 红恰为基线红**（`test/桌面应用/pi-config.test.ts` 检出目录名、
  `test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），**无新红**；
  `npm run typecheck` 0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`（工作区含他角色未提交改动）。
- **如实说明**：执行面仍是**文案约束**（卡文本为单一来源），闸层不强制「su 必须更新 memo」；既有项目里
  因历史原因已存在的 `角色卡/su/` 目录须由 su 走治理流程清理（本角色不改任何项目与角色边界文件）。
  `feature-map.md` / `functional-description.md` 尚不存在（本任务只加文案，未新建）。

## 2026-10-12 — 旧快照线索的同步读盘加缓存（mtime+size 短路；转达自桌面的跨角色建议）

背景：桌面侧治理完事件热路径（300 事件风暴最长帧间隔 101ms→18ms）后指出——旧快照线索的**同步小读盘**
落在「每次落入未匹配分支的写尝试」上，一轮数百次写尝试时会是主进程的同步阻塞源。本派工给该读盘加
**按 `mtimeMs`+`size` 的模块级缓存/短路**；语义不变（线索仍只在「盘上覆盖、快照不覆盖」时出现；
失败仍 fail-closed；判定结果从不依赖盘面）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`reloadBoundaryEntriesSync` 加缓存 + 可注入
  `StaleBoundaryProbeIo` 桩口）、`test/门禁引擎/stale-snapshot-hint.test.ts`（追加缓存用例 2 例，
  既有 4 例断言未动）、本文件；**未动** `resolve-write.ts`（调用不变、拿到默认 io 即自动走缓存）、
  未碰他角色任何文件。
- **缓存策略**：模块级 `Map<fileAbs, { mtimeMs, size, entries|null }>`——命中（mtime+size 同）⇒
  **只做一次 `stat`，跳过读取与解析**；变更 ⇒ 重读重解析并更新缓存。解析失败的 `null` 也按
  mtime+size 记忆（坏文件不反复解析）；读盘失败（stat 失败 / stat 成功但读不到）**不写缓存**，
  下次重新判定（文件随时可能出现）。内置标签/空串无 I/O 直返 `null`。容量上限 256、超限整体清空
  （进程内边界文件数量级本就很小）。缓存条目**只读**（调用方不得改动返回数组）。
- **如实登记的判定限制**：`mtime+size` 检不出「同尺寸且 mtime 未变」的改动——真实写入都会更新
  mtime，此类碰撞仅可能出现在粗时间粒度的文件系统上；即便漏检，影响的只是**提示句**（可能未显示/
  多显示一次旧快照线索），**判定结果（allowed）从不依赖盘面**（纯函数性不变）。
- **测试**：新增 2 例全绿——① 计数桩：首次读 1 次 → 未变再调**不增加读取**（仅 stat）；**同尺寸
  内容变更（mtime 变，`utimesSync` 固定时刻求确定性）必须被重读检出**；坏文件同状态命中缓存不反复
  解析；内置标签零 I/O；文件不存在无读取。② 端到端：经 `resolveWrite` 连续两次同盘面线索一致
  （缓存透明）；盘面变更后**线索立即失效**、原文案逐字恢复。既有 4 例（触发/条件语义/反向断言/
  F4 不加线索）原样全绿。本角色套件 **148 计 / 147 过 / 0 红 / 1 skipped**；全量 **859 计 / 856 过 /
  2 红（既有环境红）/ 1 skipped**（= 协调者基线 857/854 + 本次 2）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **补偿性度量（如实）**：缓存命中路径仍每次执行一次 `statSync`（廉价系统调用，是变更检测的必要
  成本）；未做 stat 结果本身的高阶缓存（如目录时间戳），如需进一步压榨属后续优化。

## 2026-10-12 — 拒写信息补「旧边界快照」线索（客户派工；真机现象）

真机现象：su 已按流程改好角色边界（盘上文件确含新路径），但角色的**活会话持有开会话时解析的旧边界
快照** ⇒ 写入被拒，拒绝信息只说「目标路径未匹配任何边界条目」，**不提示「会话快照过期」**——排查者
（含模型自己）要绕一圈才反应过来。桌面 O-1（边界变更后自动重建旧快照会话）多能自愈；本线索服务
**残余情形**（轮次正在跑 / 未触达重建时机）。

- **边界**：`src/service/gate/resolve-write.ts`（最末「未匹配」分支追加线索）、
  `src/common/门禁引擎/boundary-core.ts`（新增同步对照重载 `reloadBoundaryEntriesSync`）、
  `test/门禁引擎/stale-snapshot-hint.test.ts`（新，4 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service/其余|app/**`、他角色 tests/docs。
- **触发判据（可判定才加，不猜测）**：**同步重读盘上边界**（`boundarySource` → projectRoot 拼接 →
  readFileSync → 与异步加载同一套 parseEntries 语义）成功，且重读结果**按与本次判定同一套语义**
  （root + pathCovers + isActive(e, scope)）**覆盖该路径**——即「盘上含、快照不含」。无法判定
  （内置 `<built-in:…>` 标签 / 空串 / 读盘失败 / 新解析报错）⇒ **原文案逐字不变**。
- **文案**（原文案后追加）：「本会话可能持有旧边界快照（盘上边界现已含该路径）——请重开会话后重试；
  本次判定不变，仍为拒绝。」——末句**防误读为放行**；判定仍拒绝（fail-closed 不变）。
- **触发面最小化**：线索只在**最终「未匹配任何边界条目」分支**——F6（未接受）/ parseError / F4
  （writeSet 收窄）/ 跨根混淆 / 条件缺失等既有拒绝理由均不加；对照只看**条目**（不做接受/pin 校验，
  与「盘上是否含该路径」无关）。
- **测试**：新用例 4 例全绿（触发 → 理由含线索且 allowed=false、allowedByRoot 不变；条件目录按同一
  套 isActive 语义对照——快照重开仍不激活时**不加**；**反向断言**——内置标签/读盘失败/盘上不含/
  新解析报错四种情形 reason **逐字等于**原文案且不含线索；F4 拒绝不加线索）。本角色套件
  **146 计 / 145 过 / 0 红 / 1 skipped**；全量 **851 计 / 848 过 / 2 红（既有环境红：桌面 pi-config
  目录名、pm shared macOS `/var`）/ 1 skipped**（= 协调者基线 847/844 + 本次 4）；`npm run typecheck`
  0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明（代价与取舍）**：对照是**每次落入该分支时的同步小读盘**（单文件、拒绝路径上，非热路径）；
  `resolveWrite` 保持**纯函数签名不变**（判定结果不依赖盘面——盘面只影响**文案里的提示句**，故同一
  输入在不同盘面下 allowed 恒同）。线索是**启发式**：盘上覆盖 + 快照不覆盖**可能**另有成因（如接受
  证据变化），故措辞用「可能」并明确「本次判定不变」；若重开后仍被拒，将看到对应真实理由（F6 等）。

## 2026-10-12 — 角色「文档面」固定清单 + 交付纪律：su 卡文本写死（客户原话「各个角色的工作流有问题，为啥不写文档呢」）

真机根因（协调者核过，如实登记）：真实项目里 su 建出的角色边界**只授了代码路径**（如「任务清单实现」
仅 `src/` + `data.json`），**一条文档路径都没有** ⇒ 门禁拒掉一切文档写入 ⇒ 角色**根本不能**维护自己的
文档（不是不写，是不能写）。本派工是**治理文案**：只动 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`）+
其头注；判定逻辑一行未改。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本 + 头注）、
  `test/门禁引擎/documentation-surface-convention.test.ts`（新，3 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service|app/**`、他角色 tests/docs。
- **卡文本要点**：① **固定文档面清单**——建/改每个项目角色时**须随边界一并授予**（逐项标 kind）：
  文件五份（`角色卡/<角色 id>/feature-map.md`、`memo.md`、`changelog.md`、`functional-description.md`、
  `api-spec.md`，kind: file）；目录四个（`角色卡/<角色 id>/docs/{design,feature,change,fix}/`，
  kind: directory）；另加该角色自己的测试目录（如 `test/<角色 id>/`，仅当该角色承担测试）；
  `temp/<角色 id>/` 按 T-1 段一并授予（既有约定保持）。② **交付纪律**——每次交付都要同步自己的文档
  （功能说明/流程、变更记录、memo、api-spec），**代码与文档同批交回**；文档缺口不得靠「下次补」。
  ③ 明示必要性：「不给 ⇒ 角色写不了自己的文档」；**无**「未列即默认可写」式表述（守「未列即只读」）。
- **种子 purpose 未动的判断（同前例）**：清单是「su 往每个角色边界里写什么」的流程文案（卡文本为
  单一来源）；种子 purpose 是创世三目录的描述，不塞流程清单（种子仍恰为三条）。
- **测试**：新用例 3 例全绿（清单**逐项**断言——五文件/四目录/测试目录/temp/kind 标注/根因句；
  交付纪律四条；**反向断言**——凡含「可选/后补/下次补」的小句必须为禁止式，且定向禁用「未列即可写」
  式表述）。本角色套件 **142 计 / 141 过 / 0 红 / 1 skipped**；全量 **839 计 / 836 过 / 2 红（既有
  环境红）/ 1 skipped**（= 协调者基线 836/833 + 本次 3）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明**：执行面仍是**文案约束**——既有项目里已建角色（只授代码路径）的修补要 su 走治理流程
  重写各自 boundary.yaml（本角色不改任何项目与角色边界文件）；清单只对**此后** su 建/改角色直接生效。

## 2026-10-12 — J-1「确认落盘后自动开工」：su 卡文本写死「落盘后立刻派发第一项开发任务」（客户原话）

客户：「这个确认了，写盘之后，要**自动启动开发**啊。」本派工是**治理文案**：只动 su 内置卡文本
（`BUILT_IN_ROLE_CARD_TEXT`）+ 其头注；判定逻辑、工具实装、编排接线一行未改。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本 + 头注）、
  `test/门禁引擎/dispatch-after-landing-convention.test.ts`（新，4 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service|app/**`、他角色 tests/docs。
- **文案要点（与 H-1 指引逐字对齐）**：① 角色与治理产物落盘（客户经 `request_confirmation` 确认、
  写入完成、自动收尾）之后，**立刻**用 `dispatch_task` 把第一项开发任务派发给对应角色——roleId 用
  刚建出的角色，task 文本**自足**（做什么 / 依据哪份文档或契约 / 完成标准），**不等客户手动转达**；
  ② **派发 ≠ 授权**——目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的
  confirmed:true；不得在任务文本里代授权限（如「已获准写 src/**」）；③ 失败语义——派发失败/被拒
  （回执「未能派发」）→ 如实告知客户原因，**不得假设已开工**；若没有可派发的角色 → 如实说明并停在
  「待客户指示」。
- **措辞与实装对齐（只读核对，未改他角色文件）**：工具名 `dispatch_task` 与参数 roleId/task（自足
  三要素）取自 `src/provider/pi/tools.ts:145` / `session.ts:252`；「派发 ≠ 授权」写权来源措辞逐字
  取自 `src/provider/pi/session.ts:248`（H-1 语义硬约束）；失败/回执语义取自同处与
  `src/common/编排/handback.ts` 的既有单一来源。未发明新词。
- **种子 purpose 未动的判断**：J-1 是**行为流程**、不涉任何目录路径；种子 purpose 是目录描述，
  按其单一来源原则不把流程文案塞进目录描述（种子亦保持三条不变）。
- **测试**：新用例 4 例全绿（「落盘 → 立刻 → dispatch_task → 派发」顺序链 + roleId/自足三要素；
  「派发 ≠ 授权」逐字措辞与「不得代授权限」；失败语义三条；**反向断言**——任何含「授权/获准/放行」
  的小句必须为禁止式/否定义，且定向禁用「派发即授权 / 已放行写盘」类表述）。本角色套件
  **139 计 / 138 过 / 0 红 / 1 skipped**；全量 **806 计 / 803 过 / 2 红（既有环境红：桌面 pi-config
  目录名、pm shared macOS `/var`）/ 1 skipped**（803 = 上轮 799 + 本次 4）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明**：① 「立刻派发」以卡文本约定表达（模型行为）——闸层无法强制「必须调用 dispatch_task」，
  约束靠文案 + 工具回执（派发与否客户在会话里可见）；② 卡文本未写 handback.ts 注记的「新建角色快照
  可能被前端旧清单误拒」工程细节（不把内部实现细节塞进角色卡；失败语义「如实告知」已覆盖其表现）。

## 2026-10-12 — 派工「shell 规则集公开再导出」：**被边界阻断，如实回报，未动一行**（边界外）

派工要求新增 `src/service/gate/shell-rules.ts`：公开再导出 `classifyShell` 与 `defaultShellRules`
（供编排 I-1 的 (c) 层注入；编排侧 `shell-arming.ts` 头注已登记「合法注入源＝门禁引擎经
`src/service/gate/` 的公开再导出，尚不存在」为跨角色待办）。

- **边界判定：不在本角色 Section 1。** `src/service/gate/` 下白名单只有**单文件**
  `src/service/gate/resolve-write.ts`、**无目录条目**；`shell-rules.ts` 未列 ⇒ 未列即只读——
  **未创建该文件**（纪律：边界更新走 Governance、不自行扩权）。待 Governance 批准后追加条目
  （建议：`- kind: file` / `path: src/service/gate/shell-rules.ts` /
  `purpose: shell 规则集公开再导出（编排 (c) 层注入源）`）再实施；实施内容（逐字转出 + 单一来源头注 +
  同源断言测试）已备妥于本轮回报。
- **核对的编排侧事实（只读，未动他角色文件）**：`src/common/编排/shell-gate.ts:50` 注释允许实件在
  `src/service/gate/` **或** `src/common/门禁引擎/`（未点名 `shell-rules.ts`）；更强的表述在
  `src/pipeline/orchestration/shell-arming.ts` 头注（注入源 = 经 `src/service/gate/` 的公开再导出，
  **尚不存在**）；未获注入 ⇒ (c) 一律拒绝（fail-closed，未因缺件而放宽）。
- **形状核对（注入即通，无需适配器）**：编排 `ClassifyShellFn = (argv, rules) => ShellClass |
  ShellClassifyDetail`；实装 `classifyShell(argv: string[], rules: ShellRules): ShellClass`
  （`src/common/门禁引擎/classify-shell.ts:308`）与 `defaultShellRules(): ShellRules`（:498）逐字可注入，
  名字与注释一致。
- **证据（本轮零代码改动，复核现状未被破坏）**：`node --test "test/门禁引擎/*.test.ts"` → **133 计 /
  132 过 / 0 红 / 1 skipped**（Windows 专用）；全量 `node --test "test/**/*.test.ts"` → **800 计 /
  797 过 / 2 红 / 1 skipped**（两红为既有环境红：桌面 pi-config 目录名、pm shared macOS `/var`；
  计数随他角色并发新增变化）；`npm run typecheck` → 0 错。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **后续（同日）：边界变更获客户确认并落盘**（Section 1 加行：`src/service/gate/shell-rules.ts`，
  purpose「shell 规则集公开再导出（编排 shell 闸 (c) 层的合法注入源；客户 2026-10-12 确认）」）⇒
  **已按备妥内容逐字落地**：新增 `src/service/gate/shell-rules.ts`（逐字转出 `classifyShell` /
  `defaultShellRules`，同一函数引用、不复制实现；头注写明单一来源）+ `test/门禁引擎/
  shell-rules-public-reexport.test.ts`（引用同一性 + 公开入口四态冒烟 + 公开/私有同输入同输出，2 例）。
  **证据**：本角色套件 **135 计 / 134 过 / 0 红 / 1 skipped**；全量 **802 计 / 799 过 / 2 红（既有环境
  红）/ 1 skipped**（799 = 上轮 797 + 本次 2）；`npm run typecheck` 0 错。编排侧**未动**：
  `shell-arming.ts` / `run-role.ts` 的注入接线属编排/装配（本角色只提供公开出口）。

## 2026-10-12 — T-1「未通过产物」暂存区：su 卡文本与治理种子文案写死 `temp/<角色 id>/` 约定（客户 2026-10-12）

客户原话：「应该增加一个 temp 文件夹，里面存储没有通过的文件，这样审核也方便点」。已裁定：**每角色一个
`<项目>/temp/<角色>/`**；**被门禁拒绝的写入内容不存**（保住「拒绝=零副作用」）。本派工是**治理文案，
不是产品代码**——判定逻辑一行未改，创世种子写集不变（仍恰为三处治理产物）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`BUILT_IN_ROLE_CARD_TEXT`）、
  `src/common/门禁引擎/governance-seed.ts`（purpose 交叉提示 + 指引注释）、
  `test/门禁引擎/temp-staging-convention.test.ts`（新，5 例）、本文件。未碰 `src/provider|pipeline|
  common/编排|common/pi-adapter|app/**`、本仓库 `.gitignore`、他人 tests/docs。
- **su 卡文本追加（单一来源）**：① 建/改每个项目角色边界时，Section 1 应包含 `temp/<角色 id>/`
  （`kind: directory`，purpose「未通过/返工产物暂存，供审核对照」）；② 退回/返工流程——被验收退回或
  要求返工的产物**先存档**进 `temp/<角色 id>/`（带日期与版本，如 `2026-10-12_草案-v2.md`），并写
  `REVIEW.md` 记「谁退的 / 为什么 / 要求什么」，然后才改主交付物，且该流程随角色卡写进新角色；
  ③ 红线——**不得**把「被门禁拒绝的写入内容」存进 temp（拒绝即零副作用）；temp 属草稿区、不参与 pin；
  ④ 项目角色建 `.gitignore` 时应忽略 `temp/`（本仓库 `.gitignore` 未动，属装配）。
- **治理种子文案同步**：`角色卡/` 条目 purpose 交叉点明「未通过/返工产物另存项目根 temp/<角色 id>/
  ——草稿区，不参与 pin」；**不加** `temp/` 种子条目（`test/测试/cli-genesis-boundary.test.ts` 钉
  「创世种子仍恰为三处治理产物」，写集不动）；完整退回流程只在 su 卡文本（单一来源，种子不复制）。
- **测试**：新用例 5 例全绿（卡文本三项约定 + 流程/红线原文 + **反向断言**：任何「拒绝 × temp」小句必须
  为禁止式、且无肯定式「把被拒内容存 temp」指令 + 种子 purpose 同步且仍恰为三条）。
  本角色套件 `node --test "test/门禁引擎/*.test.ts"` → **133 计 / 132 过 / 1 skipped**（Windows 专用）；
  全量 `node --test "test/**/*.test.ts"` → **792 计 / 789 过 / 2 红 / 1 skipped**（两红为既有环境红：
  桌面 pi-config 目录名、pm shared macOS `/var`；计数随他角色并发新增变化，本角色零新增失败）；
  `npm run typecheck` 0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **不符之处/须知悉**：种子未加 `temp/` 条目（被钉死的「恰为三处」约束；temp 目录由各角色在自己的
  accepted 边界下创建，su 创世期无此需求）；su 创世期本身不能写项目根 `.gitignore`（不在其写集），
  故「建 .gitignore 忽略 temp/」以对项目角色的约定落在卡文本（客户派工原话即如此框定）。

## 2026-10-12 — 散文式 `boundary.md` 静默解析出 0 条 → **响亮失败**（A）+ 从源头防（C）（客户在批准范围外单独裁定）

真机端到端测试抓到：su 给新角色写**散文式 Markdown** 边界文件（`角色卡/<角色>/boundary.md`，形如
「## 允许写入（白名单，仅此）」+ 反引号路径列表）。文件名白名单接受它（`BOUNDARY_NAMES`），但 legacy
表格解析器静默产出 **0 条**、`parseError` 为空 ⇒ 该角色一切写入被拒，而拒绝信息只说「未匹配任何边界
条目…允许路径：（无）」，**完全不提示「边界文件读不懂」**。`ans-playground2` 只读探针复核（三角色
`entries=0 / parseError=(无) / warnings=[]`）。客户单独裁定修 **A+C**。详见
`docs/fix/2026-10-12_fix_boundary-prose-silent-empty.md`。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/boundary-core.ts`、
  `src/common/门禁引擎/governance-seed.ts`、`src/service/role/resolve-role.ts`（仅注释）、
  `test/门禁引擎/boundary-empty-and-builtin.test.ts`（新）、本角色 `docs/fix/`、本文件。
  **未动**闸判定（`resolveWrite` 未改）、`src/provider|pipeline|common/编排|common/pi-adapter|app/**`、
  任何他人测试与 docs。
- **A（响亮失败）**：`loadBoundaryFile` 对「文件存在、被读到、但 Section 1 解析出 0 条**且非 YAML**」
  记 `parseError`（`boundary-core.ts:206`），文案含原因 + 出路（「请把该文件改写为 boundary.yaml」）。
  两条链自动随行：`resolveWrite` 既有 parseError 分支的拒绝理由携带原因（经 format-denial 渲染，
  不再只列「允许路径：（无）」）；`listProject` 既有 `parseError` 分支落 **warning**（既有通道）。
- **C（从源头防）**：`BUILT_IN_ROLE_CARD_TEXT` 写死「边界文件必须是 `角色卡/<角色 id>/boundary.yaml`
  （YAML：`role` + `entries`）」+ **最小可抄示例** + 「写 Markdown 散文/表格不会被解析」
  （`boundary-core.ts:41`）；治理种子 `角色卡/` 条目 purpose 同步点名 `boundary.yaml`（`governance-seed.ts:49`，
  格式要求的单一来源仍在 su 卡文本）。
- **合法空集如何区分（结论）**：只针对**文件解析路径**——代码合成边界（内置/治理种子/未接受段）不经
  `loadBoundaryFile`，天然不误伤；**YAML 显式 `entries: []`** 视为作者按声明格式明确表达的空集、
  **不算解析失败**（客户裁定的 O1 角落依赖此类角色仍可枚举）；只有非 YAML 文件解析出 0 条（散文/
  无表格）才是「读不懂」→ parseError；`.md` 带合法 legacy 表格照常解析（未加严）。
- **测试**：新用例 8 例全绿（散文→parseError+出路文案；listProject warning 且无「0 条且无 parseError」
  静默角色；闸链与 format-denial 呈现原因；合成边界不误伤；YAML 显式空集不误伤；legacy 表格兼容；
  su 卡文本/种子 purpose 断言）。全量 `node --test "test/**/*.test.ts"` → **726 计 / 723 过 / 2 红 /
  1 skipped**（两红为既有环境红：桌面 pi-config 目录名、pm shared macOS `/var`；723 = 基线 715 + 新增 8）；
  `npm run typecheck` 0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实登记的行为后果**：全角色边界都读不懂的项目 `hasRoles` 由 true 变 false——与既有 T14「全无效
  角色」语义一致（含「可发起 bootstrap」提示），桌面据此设 `genesisBootstrap`，su 获得**有界**修复面
  （仅 `角色卡/`、`docs/`、`.ans/`）可把散文边界改写为 boundary.yaml；修复前是死局（su 连边界都改不了）。
  真实模型端到端未验（本改不发真实模型请求）；playground2 未改（修复应由 su 走治理流程完成）。

## 2026-10-11 — T40：shell 闸 (c) 加第四档 `risky`；硬拒不再「危险即拒」（客户 2026-10-11）

客户就 **shell 闸 (c) 的判定**给了新裁定，**部分推翻**设计 §7.3「危险即硬拒终结」。方案见设计
`docs/design/2026-10-11_design_v1-full-implementation.md` **§14（尤其 §14.2/§14.3/§14.4）**、派发清单 **T40**。

### 裁定要点（客户原话）

> 危险命令（`rm` / `sh -c` 这类）**不终结**：先过 (b) pm 审读，**而且无论 pm 怎么判，都还要过 (a) 客户本人确认**
> ——**pm 不是终审，客户才是**。理由：**`rm` 不是永远错的**（删自己刚生成的临时文件合理）；一概硬拒就是
> 「过宽则天天误杀」。**但 PM 已裁（§14.5）**：`sh -c` / `eval` / `node -e` / `awk` 这类「重新引入 shell /
> 内联求值」的形态**仍然硬拒终结**——它们不是「有界的危险命令」，是「任意代码」。

- **边界**：全部落在本角色边界内——`src/model/decision.ts`、`src/common/门禁引擎/classify-shell.ts`、
  `test/门禁引擎/classify-shell.test.ts`。**未动**任何编排文件（`src/common/编排/`、`test/编排/`、`test/测试/`）。

### 改动

- **`ShellClass` 三态 → 四态**（`src/model/decision.ts`）：`"allow" | "deny" | "risky" | "review"`。
  取舍（§14.1）：用**新枚举值**而非「`review` + flag」——次序/终结显式可测。新增 `ShellRiskyRule`
  （与 `ShellHardDenyRule` 同形：`id/programs/onlyWithFlag?/onlyWithSubcommand?`）；`ShellRules` 加
  **`riskyPrograms?: ShellRiskyRule[]`**——**类型标可选、运行时必需**：`validateRules` 对缺失/非数组**一律
  deny**（fail-closed，§7.5）；标可选只为兼容尚未迁移的规则集字面量（如 `test/编排/*` 里手搓的 `ShellRules`），
  不因本档新增而使别角色文件**编不过**。`ShellVerdict.ruleId` 加 `risky:program:<id>`。
- **`classifyShell` 加第 7 步 risky**（在**硬拒之后、白名单之前**）：命中 `riskyPrograms` → 返回 `"risky"`。
  `SHELL_RULES_VERSION` **"2" → "3"**；旧 "2" 规则集因版本不符一律被拒（fail-closed）。
- **硬拒名单重划**（§14.3，原则「**只拒没有正当用途 / 放行即绕过门禁的**」；§7.10 的 `argv-noshell` 前提仍成立，
  **元字符那批仍是空转、不作任何理由**）：
  - **仍硬拒、终结**：① re-shell（`sh`/`bash`/`zsh`/`dash`/`ash`/`ksh`/`fish`/`cmd`/`powershell`/`pwsh`/`wsl`/`busybox`…）；
    ② 求值内建（`eval`/`exec`/`source`/`command`/`.`）；③ 内联求值（`node -e`/`python -c`/`perl -e`/`ruby -e`/`php -r`/`deno eval`…）；
    ④ `awk`/`gawk`（可 `system()`）；⑤ 提权（`sudo`/`doas`/`su`/`runas`/`pkexec`）；
    ⑥ 系统破坏/控制（`mkfs`/`format`/`diskpart`/`wipefs`/`fdisk`/`shutdown`/`reboot`/`halt`/`poweroff`）；
    ⑦ Windows LOLBin（`mshta`/`wscript`/`cscript`/`rundll32`/`regsvr32`/`msiexec`/`certutil`/`bitsadmin`…）。
  - **改判 `risky`**：删除（`rm`/`rmdir`/`del`/`shred`/`truncate`/`dd`…）、原地改写（`sed -i`/`perl -i`/`ruby -i`）、
    编辑器、进程/服务（`kill`/`systemctl`/`reg`…）、网络（`curl`/`wget`/`ssh`…）、**间接执行器**
    （`xargs`/`env`/`nohup`/`timeout`——**程序名在 argv 里可见**）、构建（`make`/`gradle`/`cargo`…）、
    包管理（`npm run/install`/`npx`…）、**文件写**（`cp`/`mv`/`mkdir`/`touch`/`chmod`/`tee`…）、
    `git` 写子命令与 `--output`。

### risky 为何新增

`rm` 这类**不是永远错的**（删自己刚生成的临时文件合理），一概硬拒即设计自认的「**过宽则天天误杀**」；
同时保留「模型不能单独放行」（(b) 判放行后**仍过 (a)**，客户本人看原文）。(c) 不判路径（§7.7/§14.3），
故 `risky` 管的是「危险但正当」，风险交给 **(b) 审读 + (a) 人看原文** 兜。

- **`risky` 的判据**（§14.3-B，落成规则/注释）：**只给「程序名在 argv 里以可读元素出现、语义可判」的形态**——
  因为 (a) 是**客户看命令原文**，得看得懂（`rm -rf build/` 看得懂）。**这是 (a) 能兜住 risky 的前提。**

### `sh -c` 为何仍硬拒（§14.4，核心）

`run_shell` 以 `spawn(argv[0], argv.slice(1), {shell:false})` 执行，但 **`sh -c "…"` 里的 `sh` 自己会解释那段
string ⇒ 该命令的一切影响（含写入）发生在子进程内、完全不经过 `resolveWrite`**。**放行 `sh -c`（及 `eval`/
`node -e`）＝ shell 闸与写边界对那条命令整体失效**——(a) 人虽看得到原文，但**门禁对「那段 string 会写什么」
一无所知、也无法约束**。故 **re-shell/内联求值形态仍硬拒终结、不改判 `risky`**：它们**不是「有界的危险命令」，
是「任意代码」**。同一道理，**`risky` 绝不收「命令藏在 string 里」的形态**。

### 测试与门禁

- **`test/门禁引擎/classify-shell.test.ts`** 重写（**45 例**）：四档**各有一条可达用例**；原硬拒里改判 risky 的
  （`rm`/`dd`/`sed -i`/`git` 写子命令…）现断言 **risky**；仍硬拒的（`sh -c`/`eval`/`node -e`/`awk`/`sudo`/`mkfs`/LOLBin…）
  **逐个钉死**；**反向守卫**（§14.4）：`sh -c` 一类断言 **`deny` 且 `!== risky` 且 `!== allow`**（防后人顺手放宽），
  并对 `eval`/`node -e`/`python -c`/`awk` 同法加守卫；白名单仍 `allow`、未命中仍 `review`；**规则集缺失/非法/
  版本未知/`riskyPrograms` 缺失/形状非法仍 `deny`**（fail-closed 不退化，含新增的「`riskyPrograms` 缺失 → deny」用例）。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **120 passed / 0 failed**（其中 `classify-shell.test.ts` 45 例全绿）。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零；`riskyPrograms?` 标可选，故别角色 `ShellRules` 字面量不受影响）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **632 passed / 1 failed**（基线 621/0）。

### 回报（跨角色，未动他人文件）

- **`test/测试/t9-block3-pin-shell.test.ts:248`**（属**测试**角色）：断言 `rm -rf build` → **硬拒**（`C_DENY`，
  `(b)/(a)` 不被调用）。现 `rm` 改判 **`risky`**，而**编排（`src/common/编排/shell-gate.ts`）尚未做 T41 改造**——
  它把 `risky` 当 `review` 走 (b) 分支，故 (b) 桩（`{"verdict":"allow"}`）放行 → `allow:true`，用例失败。
  **这正是本条预期、且任务明言「不要越界修」的红**——待 **T41（编排三层次序：`risky` 必过 (a)）** 与
  **T43（测试）** 同步。**本角色未改**（边界外）。
- **`test/编排/*`**（属**编排**角色）：其 `ShellRules` 字面量（`{version:"1", readOnly, hardDenyPrograms, denyTokens}`）
  因 `riskyPrograms?` **标为可选**而**仍能编译**；且这些用例**注入桩 `classifyShell`、不跑真引擎**，故**未失败**——
  如实记录以免误判。

## 2026-10-11 — 空项目不报警：删去无角色目录时的 warning（空项目是**正常状态**）

客户导入一个**没有角色目录的文件夹**后提出：「项目没有角色卡的时候也不用有错误提示啊，**这个是正常的啊**。」
核实：`resolve-role.ts::listProject` 在无 `角色卡/`、`role-cards/` 时**推了一条 warning**，而渲染侧把 warnings
统一按 `--danger`（**错误色**）画在左栏顶部（`app/renderer/styles.css` 的 `.warnings { color: var(--danger) }`）
⇒ **空项目一导入，用户先看到一条红色的「无角色目录」**。但空项目**本就是正常状态**：客户为「空文件夹 → 与 su
对话 → su 建角色」专门做了整套流程，`hasRoles:false` 与界面「项目尚未 bootstrap」提示已把它说清楚。

- **判断（本条核心）**：**warning 的语义是「有东西不对劲」**（某角色目录缺 `boundary.yaml`、边界解析失败、角色
  重复……）——**空项目不属于这一类**。既然「尚未 bootstrap」是**正常初始态**，就**不该报警**：一条红字是纯噪声，
  还会误导用户以为导入出了问题。
- **边界**：全部落在本角色边界内——`src/service/role/resolve-role.ts`、`test/门禁引擎/list-project.test.ts`。

### 改动

- **删去 warning**：`listProject` 在无角色目录时**不再 `warnings.push(...)`**（原「项目根下无角色目录……可发起
  bootstrap」那条整块删除）。**返回值其余部分逐字不动**：照常返回 `[内置 su] + hasRoles:false + primaryRoleId`
  （`roles` 仍只含内置 su 一条；`hasRoles` 仍为 false；`primaryRoleId` 仍为 `BUILT_IN_GOVERNANCE_ROLE_ID`）。
- **改注释**：原注释写「无角色目录**不再抛错**」（理由：不是错误），更新为「无角色目录**是正常状态**：既不抛错、
  **也不报警**——`hasRoles:false` 与界面「项目尚未 bootstrap」已说清，再画红字是噪声；warnings 只留给真异常」。
  函数首部 JSDoc、`ProjectListing.warnings` 字段注释、「有角色目录但无有效角色」那段注释均同步更正。
- **保留全部真异常 warning**（**未动**）：缺 `role-card.md`、缺 `boundary.yaml`、读卡失败、边界解析失败、角色
  重复，以及「**有角色目录却无有效角色**」的汇总提示——后者是真异常（有人建了目录却没建成角色），**继续报警**。

### 测试与门禁

- **`test/门禁引擎/list-project.test.ts`**：T14「导入空目录」用例——删去「warning 含『无角色目录』/『可发起
  bootstrap』」断言，改为**断言 `warnings` 为空**（`deepEqual(listing.warnings, [])`），并加**反向守卫**
  `some(w => /无角色目录/.test(w)) === false`（断言**不含**该警告，而非仅删除断言）。**正面断言全保留**：
  `hasRoles:false`、`roles` 只含内置 su、`primaryRoleId:"su"`、su 的 `builtIn/cardPath/boundaryPath/acceptance`。
  真异常用例（「有角色目录但全无效角色」→ 仍含「缺少 boundary」「未枚举到有效角色」）**逐字保留**。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **108 passed / 0 failed**。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **597 passed / 1 failed**
  （基线 598/0）。唯一失败见下，**非本角色文件、未改**。

### 回报（跨角色，未动他人文件）

- **`test/测试/t9-block1-bootstrap.test.ts:122`**（属**测试**角色）：断言「导入空文件夹 → `listing.warnings`
  含『bootstrap』或『无角色目录』」，现因本条去掉 warning 而失败（`实际 []`）。这正是本条要求回报的「**别的角色
  仍在断言那条 warning**」——需其属主同步为「warnings 为空 + hasRoles:false」。**本角色未改**（边界外）。
- **`test/桌面应用/interface.test.ts`**（属**桌面应用**角色）：`warnings:["项目根下无角色目录"]` 仅作
  `listProjectFn` 的**桩数据**，不断言真实 `listProject` 输出（其断言只关 `readOnly`/`primaryRoleId` 透传），
  故**未失败、无需改**——如实记录以免误判。

## 2026-10-11 — T31：种子边界迁入门禁引擎 + 条件目录改普通目录（消 §6 违规）

客户要做**真实端到端测试**（空文件夹 → 与 su 对话 → su 建出角色），核实发现**这条路跑不通**：空项目上
su 的 gate 对「项目根治理种子边界」求值，而种子条目**全是条件目录**——条件目录须由 `TaskScope.conditions`
显式声明 slug 才激活，桌面开 su 会话传的是 `scope: undefined`（聊天无预先任务）⇒ 条件恒不激活 ⇒
**su 一切写入被拒**。核心裁决（§12.2）：把创世的「门口」从**条件层**挪到**边界选择层**。方案出处：
设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §12（尤其 §12.2/§12.4）、派发清单 T31。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/governance-seed.ts`（**新增**）、
  `src/common/门禁引擎/boundary-core.ts`、`src/model/role.ts`、`test/门禁引擎/cold-start-genesis.test.ts`。
  `src/common/编排/bootstrap.ts` **只读、未改**（迁出方属编排，T32 收）。

### 改动

- **消 §6 违规（搬迁非 fork）**：`governanceBoundaryEntries` 与 `buildGovernanceSeedBoundaryForGate` 原在
  编排私有 `src/common/编排/bootstrap.ts`，被 `boundary-core.ts` 以 `import … from "../编排/bootstrap.ts"`
  跨角色导入——**两重违规**（跨角色导入他人私有 `common/` ＋ Service 层反向依赖 Pipeline）。现**搬迁**至
  新文件 `src/common/门禁引擎/governance-seed.ts`（`GOVERNANCE_BOUNDARY_REL` 常量一并带入，供
  `boundarySource` 标签），`boundary-core.ts` 改从本角色内 `./governance-seed.ts` 导入。**编排那份未删**
  （`bootstrap.ts` 属其边界，T32 收）——**并存窗口**内编排侧仍走自身副本，本角色改走新副本。
- **条件目录改普通目录（本次核心，§12.2）**：种子三条目 `角色卡/`、`docs/`、`.ans/` 由
  `kind: "conditional-directory"`（带 `condition` slug）改为 `kind: "directory"`（**无** `condition`）。
  于是 `scope: undefined` 下：`角色卡/…`/`docs/…`/`.ans/…` **命中即 `allowed`**；`src/**` 不匹配 → **拒**。
  **无需 scope、也无需 slug**。复核过协调方否掉「创世 scope」设想的结构性理由：`resolve-write` 的 F4 里
  `writeSet` 是**精确集合**（`compareKey` 逐项相等），表达不了「`角色卡/<对话中才定的角色>/…`」；而空
  `writeSet` 的既有语义是「拒一切」（旧治理占位正是用它 deny-all）——故把门放在**边界选择**层最干净。
- **`src/model/role.ts`**：更新 `genesisBootstrap` 文档注释，如实描述「普通目录、无需 scope/slug」的新语义。
- **`src/common/门禁引擎/boundary-core.ts`**：改 import；同步文件头/分支 3 注释（条件目录 → 普通目录）。

### 有界性复核（未破坏，仍非 blanket）

1. 种子边界**只在 `ProjectConfig.genesisBootstrap` 被显式设置**时出现（构造性事实，非自动推论）；
2. 条目**仍只有** `角色卡/`、`docs/`、`.ans/` 三个（**绝不含 `src/`、不含项目内任意文件**）；
3. **自终止**仍成立：项目自己的治理边界文档写出并经 pin 接受（`governanceBoundary.path` 非空）后，
   **项目覆盖**分支先命中、创世分支永不求值——**即便 `genesisBootstrap` 残留亦然**（结构性，不依赖调用方清除）。

### 测试与门禁

- **`test/门禁引擎/cold-start-genesis.test.ts`**：改写为反映新语义，新增 3 个 T31 用例——**要害**
  （`genesisBootstrap` 设、`scope:undefined` → su 对 `角色卡/<任意新角色>/…`、`docs/…`、`.ans/project.json`
  判 **allowed**，即本次要害）、**负面**（`scope:undefined` → `src/**`、项目根外、`README.md`/`package.json`
  **拒**）、**回归**（不设 `genesisBootstrap` → su 逐字等于内置未接受边界、拒一切写）；去除已失效的
  「条件有界（须声明 slug）」用例。
- **`test/门禁引擎/`**：`node --test test/门禁引擎/*.test.ts` → **108 passed / 0 failed**。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **554 passed / 0 failed**
  （与基线 554/0 逐字一致）。
- **并存窗口验证**：编排私有 `bootstrap.ts`（自身条件目录副本）与 `test/编排/bootstrap.test.ts`、
  `test/测试/t9-block1-bootstrap.test.ts`（走编排侧种子/项目覆盖）**全绿**——搬迁对本角色外**行为逐字不变**，
  唯一有意差异即本任务对种子条目 `kind` 的改动。

### 顺带发现（非本角色，仅供协调方）

- **又一处跨角色私有导入**：`src/common/编排/shell-gate.ts:61` `import … from "../../common/pi-adapter/timeout.ts"`
  ——编排私有 `common/` 导入 **Pi适配器**私有 `common/`（同类 §6 风险）。**未动**（非本角色边界），如实回报。

## 2026-10-11 — T25：`paths.ts` 收敛共享路径原语（删本地镜像，改同名转出）+ 修 3 处 typecheck

设计 §3.11 行 5/6 裁决：同一套词法路径语义曾被门禁引擎与 Pi适配器写入层**各自维护**，二者必须逐字同源，
否则「gate 认为在根内」与「写入层认为在根内」漂移会留**误放行**空间。词法原语已整体搬迁至
`src/common/shared/path-primitives.ts`（属主：项目管理）；本任务令门禁引擎侧**删除本地副本、改从共享模块导入**。
方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11、派发清单 T25、
`docs/change/2026-10-11_change_shared-path-primitives.md`。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/paths.ts`、`test/门禁引擎/pin-acceptance.test.ts`。
  `src/common/shared/path-primitives.ts` **只读**导入，未改（属 pm）。

### 改动

- **`src/common/门禁引擎/paths.ts`**：删去八项本地实现——`IS_WINDOWS`、`toPosix`、`isAbsoluteAny`、
  `normalizeLexical`、`compareKey`、`isUnderOrEqual`、`absRel`、`realResolve`；改为
  `export { … } from "../shared/path-primitives.ts";`（**同名转出**）。既有消费方（`io.ts`、`boundary-yaml.ts`、
  `boundary-parse.ts`、`boundary-core.ts`、`src/service/gate/resolve-write.ts`）与共享原语测试
  （`test/项目管理/shared/path-primitives.test.ts` 的「逐字同源」用例从 `paths.ts` 只读导入旧实现）导入路径与名字**均不变**。
- **行为逐字不变**：各函数体本就逐字相同；唯一文本差异是共享 `realResolve`（第 115 行）比旧本地版多包一层
  `toPosix(real)`——`normalizeLexical` 入口首行即对整串 `toPosix`，且 `tail` 片段源自已 `toPosix` 的 `q`，
  故拼接结果恒等，**无输入产生行为差异**（已核，未发现需回报的分歧）。
- **`test/门禁引擎/pin-acceptance.test.ts`（3 处 typecheck）**：原报 `b.parseError`（129/145/154 行）为
  `string | undefined`，`assert.match` 形参要求 `string`。修法：在 `assert.match` 前各补一行
  `assert.ok(typeof …parseError === "string");` 收窄类型（与文件既有 87 行同一手法）。不加长/不改变运行时断言语义。

### 测试与门禁

- **`test/门禁引擎/`**：`node --test test/门禁引擎/*.test.ts` → **108 passed / 0 failed**。
- **`npm run typecheck`**：本角色 3 处**归零**（余 8 处属 `pi-adapter`/桌面应用/编排，**未动**）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **445 passed / 0 failed**（全绿）。

## 2026-10-11 — T14/T15：`listProject` 空目录不抛错 + `primaryRoleId`；冷启动「有界创世例外」

客户推翻固定模板 `ans init`（改为「导入空文件夹 + 与内置治理角色 su 对话，由 su 建角色」）后的两项门禁引擎任务。
方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §10（尤其 §10.1/§10.2/§10.7）、派发清单 T14/T15。

- **边界**：全部落在本角色边界内——`src/model/role.ts`（`ProjectConfig` 追加可选字段）、
  `src/service/role/resolve-role.ts`、`src/common/门禁引擎/boundary-core.ts`、`test/门禁引擎/`。
  未动 `src/common/编排/bootstrap.ts`（**只读复用**其 `buildGovernanceSeedBoundaryForGate`）、未动 `app/`。

### T14 —— `listProject` 对无角色目录的文件夹不再抛错 + 新增 `hasRoles` / `primaryRoleId`

- **问题**：原 `resolve-role.ts:114` 在无 `角色卡/` 时抛「项目根下未找到角色目录」→ 桌面导入空文件夹只显示
  「导入失败」，**连 su 都看不到**；而 su 是主入口（§10.2）。
- **改法**：无角色目录（`角色卡/`、`role-cards/` 皆无）时**不抛错**——返回 `[内置 su] + warning + hasRoles:false`。
  **项目根不存在 / 不是目录 / 角色目录路径是文件仍抛错**（真错误，非「尚未 bootstrap」）。
- **新增字段**（`ProjectListing`）：`hasRoles: boolean`（有没有枚举到**项目角色**；空项目为 false，界面据此显示
  「尚未 bootstrap」并引导与 su 对话）与 `primaryRoleId: string`（**主入口角色 id = `BUILT_IN_GOVERNANCE_ROLE_ID`**，
  即内置 su）。`primaryRoleId` 由门禁引擎给、**单一来源**——桌面渲染侧据此设主位/默认选中，**不得硬编码 `"su"`**
  （§10.7，与「不硬编码角色 id」既有纪律一致）。warning 文案里的 id 亦取自常量，不写死字面量。
- **`hasRoles` 语义**：`roles.some(r => r.builtIn !== true)`——内置 su 恒在 `roles` 里，故不能只看 `roles.length`；
  有角色目录但一个有效角色都没枚举到（全缺文件/解析失败）同为 false，并补一条同义提示。

### T15 —— 冷启动「有界创世例外」（本次设计核心，机制落实）

- **问题**：su 的 gate 对**项目治理边界**求值；`ans init` 废掉后空项目上无这份边界 → 回退内置（`root:skill`、
  **未接受**）→ su 一个字都写不了。而「导入空文件夹 + 与 su 对话」必须能让 su 把角色建出来。
- **机制**（两件东西共同构成，§10.1）：
  1. **工具提供的「项目根」治理种子边界**（不落进项目，只作 gate 求值对象）：把内置边界那几条**条件目录**按
     **project 根**求值——`角色卡/`(role-restructuring)、`docs/`(docs-bootstrap)、`.ans/`(project-init)。
     **单一来源**：`boundary-core.ts` 从编排 `bootstrap.ts` **复用** `buildGovernanceSeedBoundaryForGate`
     （§10.1「改造复用」），**不另写一份**（路径/slug 两处漂移会令 F5 判定失真）。
  2. **「操作者发起的 bootstrap」作为 acceptance**：由调用方经 **`ProjectConfig.genesisBootstrap = { source }`**
     **显式**设置（源为导入空文件夹并开启 su 对话的操作者指令）；`acceptance = { accepted:true, source }`。
     `source` 即该指令，**逐路径留痕**（`docs/bootstrap-manifest.md`）据此可溯。
- **落点**：`resolveBoundarySection` 新增**第 3 步**（在「治理边界覆盖」之后、「内置」之前）；对
  **内置治理角色** + `genesisBootstrap` 存在时返回治理种子边界。**不是** `accepted:true` 的自动推论
  （那样任何已接受项目都会意外获得创世 = blanket）——故用**独立字段显式触发**。
- **两条「导入即授权」的区分（代码注释亦写明）**：
  · **已有角色的项目** = **per-role-boundary**（第 1 步「项目覆盖」，按角色各自边界）；
  · **空项目** = **有界创世**（第 3 步，仅治理产物）。
  **两者都不是空白支票**——共同上界仍是「Section 1 / 治理产物集」。
- **四条「非 blanket」性质如何落地**（每条都有测试）：
  1. **写集有界**：种子只含三项条件目录（`角色卡/`/`docs/`/`.ans/`，全部 `root:project`），**不含 `src/`、
     不含任意文件**。测试正例：`角色卡/<新角色>/{role-card,boundary,memo}`、`角色卡/governance-boundary.yaml`、
     `docs/…`、`.ans/project.json` 放行；负例：`src/**`、`app/**`、`README.md`、`任意文件.txt`、近前缀
     `角色卡_new/x.md` 一律拒（理由「未匹配任何边界条目」）。
  2. **条件有界（F5）**：三项均为 `conditional-directory`，须任务在 `scope.conditions` **显式声明** slug 才激活。
     负例：不声明、或声明**别的** slug → 写前拒，理由含「缺少条件 <slug>」。
  3. **自终止（最关键）**：第 3 步置于第 2 步**之后**——`governanceBoundary.path` 非空（项目边界文档已写出并登记）
     时第 2 步先命中、创世分支**永不求值**。测试：项目边界文档写出 + SHA-256 pin 接受后，**即便 `genesisBootstrap`
     残留**，`resolveBoundarySection` 仍走项目覆盖（`boundarySource` = 项目文件、`acceptance.source` = pin 证据）；
     此时创世能写的 `角色卡/Y/…` **写不了**（项目边界未覆盖），证明授权真的换了。对照测试：同项目**不设**该字段时
     结果一致（创世非放行因素）。**自终止是结构性的，不依赖调用方清除字段。**
  4. **逐路径留痕**：`acceptance.source` 携操作者指令（随 `resolveRole` 贯通到治理会话入口）；
     `docs/bootstrap-manifest.md`（在 `docs/` 条件目录内）在创世下**可写**——留痕路径被授权。
- **fail-closed 不放松**：`genesisBootstrap.source` 为空 → 边界虽 `accepted:true` 但 `source` 空，
  `resolveWrite` 的 **F6 接受门仍拒一切写**（不因「声称创世」而放行无证据写入）；创世**只对内置治理角色生效**，
  项目角色不受益（仍回退内置未接受）。

### 测试

- 新增 `test/门禁引擎/cold-start-genesis.test.ts`（**9 例**）：边界求值/仅作用于内置/source 空 fail-closed/
  写集有界正例/负例/条件有界/自终止/自终止对照/留痕。
- 改写 `test/门禁引擎/list-project.test.ts`：删「无角色目录抛错」断言（T14 已改语义），拆为「真错误仍抛错」
  + 「空目录不抛错（su + warning + hasRoles:false + primaryRoleId）」+「有目录但全无效角色」；真实项目/英文/中文
  三例补 `hasRoles`/`primaryRoleId` 断言。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **108 passed / 0 failed**（原 97：list-project +2、genesis +9）。
- **全量**：`node --test "test/**/*.test.ts"`（**带引号，走 Node glob**，三层路径）→ **405 passed / 0 failed**（全绿）。
  基线 393；本角色 +11；其余增量来自**并行施工的其他角色**（以 0 failed 为准）。

### 回报（跨角色）

- **编排（T16）需知情**：`boundary-core.ts` 现从 `src/common/编排/bootstrap.ts` **复用**
  `buildGovernanceSeedBoundaryForGate`。§10.4 提到该库**可改名** `governance-writes.ts`——**若改名，须同步更新本 import**。
- **桌面应用（T17）需知情**：`ProjectListing` 增了**必需**字段 `hasRoles`/`primaryRoleId`；
  `test/桌面应用/interface.test.ts` 等处构造 `ProjectListing` 字面量的用例需随之补齐这两字段
  （本环境未装 TypeScript，`npm run typecheck` 跑不了，故 `node --test` 不报；有类型检查器时会报）。
  另：空项目需由桌面/编排在导入空文件夹并开启 su 时设置 `ProjectConfig.genesisBootstrap`，创世方生效。

## 2026-10-11 — T8a：shell 规则集按「程序 + argv」重述（§7.10）+ 裁 `ShellRules.id?`

PM 复核 T7 第一步后改了两处规格，本条跟着改。方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md`
§7.10（命令解释模型）、§7.3「前提修正」、§7.1/§7.5/§7.7。

- **边界**：全部落在本角色边界内——`src/model/decision.ts`（追加类型，不改既有）、
  `src/common/门禁引擎/classify-shell.ts`、`test/门禁引擎/classify-shell.test.ts`。
- **改动动因（§7.10）**：Pi适配器执行 `spawn(argv[0], argv.slice(1), { shell:false })`——命令**不经 shell 解释**。
  因此原规则集里的**元字符硬拒**（`>` `|` `&` `;` `$(` 反引号 `<<` 换行）在这个模型下**永不以「被解释」形式出现**，
  扫它们是**空转**，更糟——给人**「拦住了重定向」的假安全感**，还误杀 `grep 'a|b'` 一类正常参数。
- **重述后的规则集结构（按「程序 + argv」分类）**：
  1. **`argv[0]` 程序黑名单**（`hardDenyPrograms`，绝对否决）：外壳/解释器 `sh bash cmd pwsh …`；破坏性
     `rm rmdir del shred truncate dd mkfs …`；写入/权限 `cp mv mkdir touch tee chmod …`；编辑器；进程/系统；
     网络；执行包装器 `xargs env eval exec sudo …`；Windows LOLBins；构建/任务运行器 `make gradlew dotnet …`；
     `npx/corepack`；**git 写子命令**（`checkout commit push reset …`）。白名单（`readOnly`）仍按只读程序：
     `ls cat grep git status/log/diff… node --version npm ls`。
  2. **危险 flag**：`ShellHardDenyRule` 的 `onlyWithFlag` 表达「程序 + flag 才判」——`sed -i`/`perl -i`（原地改写；
     普通 `sed` 仍 review）、解释器内联 `node -e`/`python -c`/`perl -e`；**新增 `git --output`**（`git-output-write`，
     `--output`/`--output=<f>` 会把结果写盘）——`git log --output=x` **由 review 改为 deny**。
  3. **写目标——按程序性质判，不看有没有 `>`**：`cp`/`mv`/`tee`/`dd`/`mkdir`/`chmod` 等**自身即写**的程序一律硬拒；
     `git checkout`/`node -e` 照样能写、照样拦。**不因「无 shell」就认为安全**（§7.10 明列）。
- **元字符那批怎么处理（结论：如实改为参数字符，不再硬拒）**：给 `ShellRules` 加可选
  `executionModel: "argv-noshell" | "shell-string"`。引擎**仅在 `executionModel !== "argv-noshell"` 时**才扫
  `denyTokens`（含换行/回车结构性拒绝）。默认规则集标 `"argv-noshell"` ⇒ 元字符**不生效**（真话）；
  **缺省（省略该字段）按最保守处理——假定 shell 会解释 ⇒ 元字符生效**（fail-closed 缺省，兼容旧规则集）。
  `denyTokens` 数据**保留在规则集里**，它是**待恢复集合**而非当前判据。理由：保留硬拒=空转+假安全+误杀；
  如实按参数处理既消除误杀，又用 `executionModel` 把「何时该恢复」编码成**机器可查**的前提。
- **★ 耦合记录（§7.10，逐字钉住）★**：上面「不扫元字符」的前提**绑定 `shell:false`**。**若执行层改回原始命令串
  或 `shell:true`，元字符规则必须恢复**——把 `rules.executionModel` 改为 `"shell-string"`（或删掉该字段走保守缺省），
  否则 `> /path`、`$(...)`、`cmd | sh` 会被**漏掉**，出现「以为拦了、其实没拦」的洞。此耦合同时写进
  `classify-shell.ts` 顶部注释、`defaultDenyTokens()` 注释与 `src/model/decision.ts` 的 `executionModel` 注释。
- **版本**：`SHELL_RULES_VERSION` `"1"`→`"2"`（规则集语义有实质变化：元字符拦截现随 `executionModel` 条件生效；
  版本闸照旧「未来格式被旧引擎误判 → 硬拒」，方向 fail-closed）。**校验新增**：`executionModel` 若存在须为已知取值
  （未知 → deny）；`id` 若存在须为非空字符串（非法 → deny）。
- **裁 `ShellRules.id?`（编排悬着的问题）：需要，已加可选 `id?: string`**。理由：§7.6 要求审计记「谁审的」——
  (c) 一层要能追「判决出自**哪一套规则集**」。当前 `classifyShellDetailed.ruleId` 只给**命中的单条规则** id
  （如 `deny:program:git-write`），不含规则集身份；编排此前被迫用调用方另传的 `rulesId` 选项。给规则集自带 `id`
  令其**自我标识、单一来源**（默认规则集 id=`"ans-default-v2"`），编排可取 `rules.id ?? rulesId ?? "default"`，
  不必 fork、不必依赖调用方记得传。**故答复编排：确需，且已由门禁引擎在 `model/decision.ts` 单一来源加上**。
- **仍拦不住（已知缺口，测试继续钉死，不假装新规则集覆盖了）**：① 间接执行类不可穷尽——`node script.js`、
  `python foo.py`、`perl script.pl`、`java -jar app.jar`、项目内 `./deploy.sh`/`./build`、任意 PATH/仓库内二进制
  → `review`；② **git 别名**（`git my-alias`）不解析 → 未知子命令 → `review`；③ 按程序名匹配、不做 PATH 解析
  （同名遮蔽二进制可放行，(c) 职责之外）；④ `sh -c "…"` 这类**在参数里重新引入 shell** 的形态**守住**——外壳本身在
  黑名单，且 `argv[0]` 含空白（整条命令串）也 deny。**（原「git log --output=x 落 review」缺口本条已闭合，改为 deny。）**
- **`test/门禁引擎/classify-shell.test.ts`（33 例，含新增）**：新增「按 argv 判写能力」——`tee`/`dd of=`/`cp`/`mv`/
  `node -e`/`python -c`/`git checkout`/`git --output` 均 deny；新增「执行模型耦合」——argv-noshell 下 `>`/`|`/`$()`/
  换行是参数字符（allow），shell-string 与缺省下恢复拦截（deny）；新增 `executionModel` 未知→deny、`id` 非法→deny。
- **测试**：`node --test "test/门禁引擎/*.test.ts"` → **97 passed / 0 failed**（原 92；classify-shell 由 28 → 33）。
- **全量**：`node --test "test/**/*.test.ts"` → **360 passed / 0 failed**（全绿）。

## 2026-10-11 — T7 第一步：shell 命令级闸 (c) 确定性规则引擎（`classifyShell`）

「给 shell，但执行前必须过 pm 审核」的第一道闸（硬地板）。写类拦截原本靠固定工具名集合 +
**路径判据**（`resolveWrite`），而 shell 里 `echo x > 路径` 的写入不经过 `resolveWrite`（§7.1）；
故 shell 需一道**判据不同**的闸——问「这条命令是否被允许执行」。方案出处：设计 §7.1/§7.2/§7.3/§7.5/§7.7。

- **边界**：`src/model/decision.ts`（**仅追加**共享类型，不改既有类型）、
  `src/common/门禁引擎/classify-shell.ts`（新增）、`test/门禁引擎/classify-shell.test.ts`（新增）。
- **落点与理由**：落在 `src/common/门禁引擎/`（本角色唯一可**新增文件**的代码目录）。**未落 `src/service/gate/`**——
  Section 1 把该目录下的 `resolve-write.ts` 列为**单文件**条目（非目录条目），新增 `classify-shell.ts` 会越界；
  按「越界回报、不动手」取其唯一授权目录。**待协调（回报）**：设计 §7.4 允许 `src/service/gate/`，且按
  「不得导入其他角色私有 common」的约定，装配方（编排）消费 `classifyShell` 需要一个**公开 service 入口**
  （如 `src/service/gate/classify-shell.ts` 再导出）——需 Governance 更新 Section 1；**本角色未自行新增该文件**。
- **接口（冻结契约 §7.4，照做）**：纯函数 `classifyShell(argv, rules) => "allow" | "deny" | "review"`；
  另导出 `classifyShellDetailed(argv, rules) => { decision, reason, ruleId }`（**附加**、非改形状，供审计取规则 id §7.6）、
  `defaultShellRules()`、`SHELL_RULES_VERSION`。
- **三态语义（§7.3）**：白名单命中 → `allow`；硬拒命中 → `deny`（**绝对否决**，不可被 (b)/(a) 翻案）；都不命中 → `review`。
  **硬拒先于白名单**判定（白名单程序带危险记号，如 `echo x > f`、`cat x | sh`，整体 deny）。
- **默认（未命中）判 `review` 而非 `deny`**：理由——(c) 是**硬地板**而非唯一闸；其上 (b) pm 审读 (a) 操作者兜底，
  存在的意义正是裁决「常规命令」；若 (c) 默认 deny，则 (b)/(a) 无立锥之地，且「过宽则天天误杀」。
  **注意**：T7 第一步 (b)/(a) 未接，装配方对 `review` **默认拒绝**（设计 T7 验收）——此「白名单或拒」是**装配方的
  fail-closed 桥接**，不是 (c) 的语义。
- **选定的规则集**（数据驱动，见 `defaultShellRules()`；原则：已知危险就拒、只读就放、其余交 (b)/(a)）：
  - **白名单（只读、非执行）**：`ls pwd cat head tail wc grep rg findstr diff echo date whoami hostname uname which where printenv stat readlink basename dirname`；
    `git`（仅只读子命令 `status/log/diff/show/blame/ls-files/ls-tree/shortlog/whatchanged/describe/rev-parse/rev-list/merge-base/cat-file/grep/show-ref/name-rev/for-each-ref/var/count-objects/fsck`，且 `--output/-o` 列 blockedFlags）；`node --version/-v`；`npm ls/list/--version/-v/view/outdated/root/prefix`。
  - **硬拒程序**：外壳 `sh bash zsh dash ash ksh csh tcsh fish busybox cmd powershell pwsh wsl winpty script expect`；
    破坏性 `rm rmdir del erase rd shred truncate dd mkfs format diskpart fdisk wipefs srm`；写入/权限
    `touch mkdir md cp mv move rename ln mklink install tee patch chmod chown attrib icacls takeown mount umount …`；
    编辑器 `vi vim nvim nano emacs ed notepad`；进程/系统 `kill taskkill shutdown reboot reg schtasks crontab systemctl …`；
    网络 `curl wget scp sftp ftp rsync nc ssh psexec …`；执行包装器 `xargs env nohup nice timeout watch sudo su runas eval exec source command …`；
    解释器内联 `node/python/perl/ruby/php/lua -e/--eval/-c/-r …`；原地改写 `sed/perl/ruby -i/--in-place`；`awk`（可 system()/重定向）；
    Windows LOLBins `osascript wscript cscript mshta rundll32 regsvr32 msiexec certutil bitsadmin …`；构建/任务运行器
    `make just rake gradle gradlew mvn ant msbuild dotnet cargo go`；`npx corepack`；git 写子命令 `commit push pull fetch checkout reset clean merge rebase …`。
  - **硬拒记号（子串，逐 argv 元素扫）**：`>` `|` `&` `;` `$(` 反引号 `<<`（`>` 覆盖 `>>`/`2>`；`&` 覆盖 `&&`/`&>`；`|` 覆盖 `||`/`|&`），
    外加**结构性恒拒**的换行/回车。
- **fail-closed 如何「结构上不可能退化」**（§7.5 第一条）：`classifyShell` **要求显式传入 rules**（无默认参数、无 rules 可选重载）；
  `rules` 缺失/非对象/版本未知/形状非法 → `deny`；`argv` 缺失/为空/含非字符串元素 → `deny`；换行/回车结构性恒拒；
  `argv[0]` 为空或含空白 → `deny`。**唯一通向 `allow` 的分支是「命中一条通过校验的白名单条目」**——无规则 ⇒ 结构上到不了 allow；
  空规则集只到 `review`、绝不到 `allow`（有测试钉死）。
- **`argv` 而非命令串（§7.2）**：(1) 直接 spawn 时 `> | & ;` 本是普通字符，但上层可能按空白切分命令串，故仍**逐元素子串扫**危险记号；
  (2) `sh -c "…"` 把真实命令藏在参数里、无法可靠反推：**外壳/解释器本身就在硬拒名单**，且「`argv[0]` 含空白」（塞进来的是整条命令串而非程序名）也判 `deny`。
- **如实登记的已知缺口**（各以断言钉死在案，不假装不存在）：① 间接执行类不可穷尽——拒了命名的 `npm run`/`make`/`gradlew`/`dotnet run`，
  但 `node script.js`、`python foo.py`、`perl x.pl`、`java -jar`、项目内 `./deploy.sh`/`./build`、任意 PATH/仓库内二进制、git 别名都落 `review`；
  ② 白名单程序冷门写开关（`git log --output=x` 落 `review` 而非 deny）；③ 按程序名匹配、不做 PATH 解析（遮蔽二进制可放行，(c) 职责之外）；
  ④ 有意过头拦截：`grep 'a|b'`、`grep 'a>b'` 判 `deny`（因 `|`/`>` 必须拒，否则 `cat x | sh` 会放行）。
- **与 `GOVERNED_WRITE_TOOLS` 的关系（§7.7）**：`run_shell` **不加入**该写类集合；本引擎走**独立的命令级判据**、不喂 `resolveWrite`。
- **测试**：新增 `test/门禁引擎/classify-shell.test.ts`（**28 例**）。
  `node --test "test/门禁引擎/*.test.ts"` → **92 passed / 0 failed**（原 64 + 本条 28）。
- **全量**：`node --test "test/*/*.test.ts"` → **317 passed / 0 failed**（全绿）。注：其它 T7 角色**并行施工**，全量测试数在变
  （本角色开工基线 253 → 交付时 314→317），故以「**0 failed**」为准，不写死数字。本角色相关套件 `test/门禁引擎/` 恒 92/0。
- **未做/待接**：(b) pm 审读、(a) 操作者通道、审计落盘、`run_shell` 工具、扩展 token 兜底——属 T7 其它部分（Pi适配器/编排/pm）与 T8；本角色只交付 (c)。

## 2026-10-11 — T1：`.ans` SHA-256 pin 与 acceptance 链（F6 由「配置自称」升级为「可验证证据」）

把 `Acceptance` 的 `accepted: true` 从**谁都能写的配置自称**升级为**可验证证据**：边界文件被
SHA-256 pin 钉死，篡改即失效、fail-closed。方案出处：设计 §3.3、§5.3（T1）。

- **边界**：全部落在本角色边界内——`src/model/boundary.ts`、`src/common/门禁引擎/io.ts`、
  `src/common/门禁引擎/boundary-core.ts`、`test/门禁引擎/pin-acceptance.test.ts`。
- **Model 形状（本角色定，论证见下）**：`Acceptance` 增可选 `pin?: PinEntry[]`，
  `PinEntry = { path: string; sha256: string }`。
  - **逐文件而非项目级**：一个项目的边界文件不止一份（每角色一份 + 治理边界文档），
    单个项目级 hash 表达不了「接受的是哪几份、各自 hash 是什么」。
  - **数组而非映射**：每条证据自述「哪个文件 → 哪个 hash」，与顺序无关，且失败时能逐条定位是哪条 pin 不符。
  - **硬约束**：声明了 pin 时，`accepted === true` 必须能追到某个固定 hash（见下校验）。
- **校验（`boundary-core.ts::loadBoundaryFile`）**：仅当 `accepted === true && pin !== undefined` 时启用。
  1. 校验 pin 形状（非空数组、每条 `path/sha256` 非空）——非法即未接受；
  2. 对**每一条** pin 指向的文件按**原始字节**算 SHA-256（`io.ts::sha256File`）与声明比对
     （十六进制、大小写不敏感）；**读不到/不存在 → 视为不匹配**（fail-closed）；
  3. 要求**当前加载的边界文件被至少一条 pin 覆盖**——否则不得凭无关 pin 认可。
  任一不过 → 返回 `{ entries: [], acceptance: { accepted: false, source: "" }, parseError: <原因> }`。
- **pin 不匹配时 acceptance 变成什么**：`{ accepted: false, source: "" }`（**未接受**，且 **source 清空**）。
  不采用「带说明性 source」——那会留下一个「有证据来源」的观感，制造「看起来被接受其实没有」的中间态。
  失败原因如实写入既有的 `parseError` 通道；下游 `resolveWrite` 的顺序是 parseError → F6 → …，
  两处都只认 `accepted` 真假，故**仍 fail-closed、拒一切写**，无需改 `resolve-write.ts`。
- **算 hash 读哪个路径 / 读失败的判定**：读 pin 的 `path`（相对项目根解析，或绝对路径），即项目根上的边界文件；
  读失败按**不匹配**处理（已确认 fail-closed 倾向）。哈希对**原始字节**（不剥 BOM）——pin 生成与校验必须同算法，
  否则含 BOM/EOL 差异的文件会得到不一致的哈希（测试 §9 专门验证）。
- **无 pin / 无 `.ans` 不放松**：`pin === undefined` 时沿用旧的 `source` 自称来源（向后兼容——
  `DEMO_ACCEPTANCE`、各角色注入的 `governanceBoundary.acceptance`、既有测试配置均无 pin，行为不变）；
  无 `.ans`（无治理边界）时仍走 `resolveBoundarySection` 分支 3 的**内置未接受**路径。
- **展示路径非绕过口**：`listProject` 对所列边界传 `{ accepted: false, source: "" }`（无 pin），
  故 pin 校验不触发、条目照常返回供展示，但 `accepted` 恒为 false；测试 §8 固定此语义。
- **测试**：新增 `test/门禁引擎/pin-acceptance.test.ts`（9 例）——pin 匹配→accepted；不匹配→未接受→`resolveWrite` 拒一切写；
  无 pin（向后兼容）；无 `.ans`→内置未接受→拒写；pin 指向文件不存在→fail-closed；pin 未覆盖当前文件→未接受；
  pin 形状非法→未接受；展示路径未误接受；按原始字节（含 BOM）求哈希。
- **结果**：`node --test "test/门禁引擎/*.test.ts"` → **64 passed / 0 failed**（原 55 + 本条 9）。
- **全量**：`node --test "test/*/*.test.ts"` 的**失败全部集中在** `test/pi-adapter/tools.test.ts`
  （`未真正落盘` 断言 vs 该角色 T3 已改的「已获准并落盘/写入」真写盘措辞）——**属 Pi适配器 角色 T3 的
  并行改动**（`src/provider/pi/tools.ts` 真写盘），**与本条 T1 无关**（该文件不 import 本条改动的任何模块）。
  除 pi-adapter 外**全部套件 204/204 全绿**；本角色开始前全量基线为 229/229。注：并发期间全量测试数在变
  （229→238→252），故不写死全量数字，只锚定「与本条相关的套件全绿 + 失败全在 pi-adapter」。
  **越界回报、未动手**。

## 2026-10-11 — 内置治理角色 su 补入 listProject 枚举 —— 复核通过（有保留）

客户问「界面里怎么没看到 su」。su = SKILL.md 的内置治理角色 **ANS Governance**，无 `角色卡/` 目录，
故 `listProject`（只枚举 `角色卡/*/` 与 `role-cards/*/`）从不列出它；但 `resolveRole` 本就认它
（不在 `project.roles` 即下沉 `built-in-governance`）。改动由引擎枚举侧合成一条内置角色条目。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/boundary-core.ts`、
  `src/service/role/resolve-role.ts`、`test/门禁引擎/list-project.test.ts`。
- **来源与流程**：本改动系**顶层会话越过角色边界直接改的**；客户已判定该流程不对，决定
  「代码保留、由负责角色（本角色）复核并补记录」。以下记录为**本角色独立复核并采纳**，非改动人。
- **文件**：新增 `src/common/门禁引擎/boundary-core.ts` 导出 `BUILT_IN_GOVERNANCE_ROLE_ID`（`"su"`）、
  `BUILT_IN_ROLE_CARD_TEXT`（多行说明）、`builtInBoundarySection()`；`resolveBoundarySection` 分支 3
  改为 `return builtInBoundarySection();`。`src/service/role/resolve-role.ts` 的 `resolveRole` 对 su 取
  `BUILT_IN_ROLE_CARD_TEXT`（原为空串），`ProjectRoleSummary` 增可选 `builtIn?`，`listProject` 先合成
  一条 su 条目（`roleId:"su"`、空卡/边界路径、`builtIn:true`、`builtInBoundarySection()`）预置进 `seen`
  并排序后 `unshift` 使其恒排第一。`test/门禁引擎/list-project.test.ts` 三处期望值加 `"su"`。
- **等价性验证（本角色新写）**：`test/门禁引擎/built-in-section-equivalence.test.ts`（5 例全绿）证明
  `builtInBoundarySection()` 与改动前分支 3 内联对象**逐字段一致**（entries 来自 `builtInEntries()`、
  `boundarySource=BUILT_IN_SOURCE`、`acceptance={accepted:false,source:""}`、无 `parseError`），每次调用
  返回全新数组（无共享可变状态），`resolveBoundarySection` 对 su / 任意未知角色仍落同一内置分支。
- **fail-closed 未破坏**：su 由枚举合成的条目 `acceptance.accepted===false`，仅供展示；真实写入路径仍经
  `resolveBoundarySection("su",…)` → 内置未接受 → `resolveWrite` 的 F6 接受门**拒绝一切写入**（契约 §0）。
  等价性测试内含 `resolveWrite` 对 su 边界放行断言全为 false。
- **测试**：`node --test "test/门禁引擎/*.test.ts"` → **53 passed / 0 failed**（原 48 + 本角色新增 5）。
- **语义提示**：`listProject` 对本仓库由 7 条变 8 条（su + 7 项目角色），语义由「枚举有角色目录的角色」
  扩为「枚举引擎可寻址的全部角色」；消费者须认 `builtIn` 与空 `cardPath/boundaryPath`。项目若真存在
  `角色卡/su/` 目录会被 `seen` 预置命中并记 warning 跳过（已知副作用）。

- **保留意见（id `"su"`）**：`"su"` 是客户对内置治理角色的**俗称**，非 SKILL.md 正式名
  （正式名 `ANS Governance`，该节无 id）。以俗称作引擎规范 id，令 id 与角色本体名分裂，
  `BUILT_IN_ROLE_CARD_TEXT` 不得不用「ANS Governance（su）」散文弥合。主张：或改以正式名 slug
  （如 `ans-governance`）为 id、`su` 作别名，或显式记录「`su` 为约定别名」。本角色**暂不改 id**：
  桌面应用及其测试、项目记忆均已使用 `"su"`，改 id 属跨角色联动，超出本角色边界——须走治理流程。
- **旁注（边界外，须回报，本角色未改）**：`src/pipeline/orchestration/run-role.ts::setupRole` 对
  **未登记在 `project.roles`** 的角色一律以 `EXIT_USAGE` 拒绝，故桌面端「点 su 开启聊天」仍会失败；
  修复点在 `src/pipeline/**`（本角色边界外）。见 `角色卡/桌面应用/changelog.md` 同日记事。

## 2026-10-14：G1 角色协作组摘要

按已批准 ANS-RUNTIME-V2 revision 1 的必要范围，在既有角色结果增加可选只读 group/groupDuty，卡正文单一解析；旧卡缺值不添加属性，归档/内置/角色kind/接受/写权保持既有语义。Model与两处Service结果使用同一 RoleGroupMetadata，未改权限或角色卡。新增8例通过，门禁168通过/0失败/1 Windows专属跳过，完整typecheck通过。当前用法见[功能说明](docs/feature/role-group-metadata.md)，实际契约见[API](api-spec.md)，候选及原始检查摘要见[变更记录](docs/change/2026-10-14_change_role-group-metadata.md)。桌面透传和呈现由对应属主继续验证。
