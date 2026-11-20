# 策划记录：应用侧内置角色派发（幕僚只选流程）设计记录 v1（2026-11-17）

- 角色：ANS 内置角色「策划」（业务策划；独立固定上下文）
- 任务：按客户 2026-11-17 指令，把「内置角色任务派发」从角色（运营/幕僚）移到应用侧流程驱动，并重写「幕僚只选流程 + 客户卡、运营只派 worker、应用侧派独立验收」的职责矩阵；只出设计文档，不改代码/测试，不合并/发布。
- 依据（口径演进，最终以此为准）：
  - 客户原话：「我现在需要引入工作流引擎，这个幕僚只能选流程，而不能派发agent，运营只能派发worker，不能派发内置的角色。」
  - 协调方最终确认：内置角色任务（产品/策划/人事/验证等）由应用侧按流程定义自动派发；worker 任务继续由运营派发（团队计划、基线准备、集成汇总仍在运营；运营不再派发内置角色）；幕僚只选流程（内置两条：新增、修改，可扩展）；独立验收（内置验证角色）由应用侧按流程定义派发，与运营生产派发相互独立。
  - 客户同日决定：**不引入开源工作流引擎**；引擎选型取消。第一步（零新依赖）在现有 `workflow-service` 上实施中（协调代理，`feat/app-dispatch-builtins`）。
- 基线：本 worktree HEAD `75284d2`（`feat/post-2.1.0`；v2.1.0 已发布）。只读核对，未运行产品/真实模型/Electron。

## 一、只读输入（实际阅读锚点）

- 设计/方案：`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`；`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`（全文）。
- 编排：`src/common/编排/workflow-service.ts`（`requestStage` :733、`recordStageDispatch` :1080、`closeTask` :1284、`prepareIntent` :1574、`finalizeIntent` :1707、`activateRoleDocumentsFixed` :1913、`recordBasis` :2185、`archiveAcceptance` :2786、`prepareReleaseMerge` :3188、`executeReleaseMerge` :3539、`completeTeamPlanFixed` :4019）；`workflow-state.ts`（转移表 :75、返工映射 :104、`deriveWorkflowView` :361）；`workflow-dispatch.ts`（fixed 谓词 :147、目标集 :25/:27、stage-request/stop 幂等键）；`task-state.ts`；`workflow-preconditions.ts::reportTargetForTaskCreator`。
- 会话/卡：`app/desktop/session/fixed-workflow/{route,cards,release-merge,panel}.ts`；`session/card-gateway.ts`；`app/desktop/customer-input.ts::planJudge`；`app/desktop/workflow.ts`。
- 角色模块：`src/common/roles/chief/internal/{spec,tools,dispatch}.ts`（`CHIEF_FIXED_CARDS`、`CHIEF_FIXED_TARGET_ROLE_IDS=["convener","verifier"]`、`dispatchTask:true`）；`src/common/roles/convener/index.ts`（fixed 内置目标 `["product","rapporteur","nominator"]`、legacy `["verifier"]`）；`src/common/门禁引擎/role-tool-registry.ts`（14 项）；`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`。
- 模型：`src/model/runtime.ts`（`TaskCreatedEvent.from: "chief"|"convener"` :1383；`taskKind` :1424；`TaskClosedEvent.by`；`WORKFLOW_STAGES`；`GOVERNANCE_CARD_GROUP`；app-owned `merge-main`/`stable-write`）。
- 历史：`git log` B13–B34（B17 hash 应用计算、B23 哈希口径、B24 A3 卡门、B25/B29 回执、B26 模块写集、B27/B28 shell 禁令、B31 A12b 轻量验收、B32 提交引号、B34 B2 死锁）；`docs/acceptance/2026-11-11_two-fixed-workflow-paths-acceptance-report-v2.md`；`docs/communication/memo.md`。

## 二、交付

- 设计记录：`docs/planning/2026-11-17_design_app-dispatch-builtins.md`
  - 329 行 / 36,637 bytes / SHA-256 `c6314e393fe22b1c7bbf0ec2a5360dc078aa5baa4551d00e7e0c58835308bcbe`
  - 结构：摘要；口径演进与最终确认；角色动作 vs 应用侧动作矩阵（含 v2.1.0 增删）；阶段→执行者表（A1–A13/B1–B4）；派发协议与任务种类（`stage-execution`/`worker-dispatch`/`card-prompt`、`from:"application"`、幂等/恢复、流程定义注册表）；客户卡与 judge；能力面变更清单；状态机/失败/审计；风险与未决项（Q1–Q10）；兼容与迁移；非目标与披露。
- 文件名说明：原任务书路径为 `..._design_workflow-engine-v1.md`；客户最终决定不引入开源引擎后，按协调方「简版设计记录」口径改名为 `..._design_app-dispatch-builtins.md`，与实施分支 `feat/app-dispatch-builtins` 对齐；**未包含**引擎选型矩阵与 PoC。

## 三、关键设计裁定（本记录内冻结）

1. **派发权三分**：应用侧流程驱动创建全部内置角色任务（product/rapporteur/nominator/convener/verifier）；运营只派项目 worker（绑定应用发放的 `worker-dispatch` 任务）；幕僚无任何 agent 派发，仅 `select_workflow` + 按 prompt 呈三卡。
2. **验收独立**：A12a/A12b 由应用侧直派内置 verifier（默认）或 `workflow.reviewRoleId` 项目验收角色（应用按 roster/basis/激活核验），不经过运营，保持生产/质检分离。
3. **B2 去人化**：范围决定改为应用在 B1 完成后确定性派生（报告 ∩ 名单模块属主 ∩ 角色边界），歧义 fail-closed；消除 v2.1.0 的 B2 死锁类（B34/RR31）在新协议中的再现条件。
4. **协议隔离**：在飞 v2.1.0 fixed workflow（`workflow.started` 无 protocol 或 `fixed-v2.1`）继续旧驱动（stage-request）直至关闭；新 workflow 用 `app-dispatch/v1`；禁止中途切换。
5. **零新依赖**：流程定义 = 应用内类型化注册表（TS 常量 + 定义 hash）；无 DSL、无第三方引擎、无第二状态库；`.ans/state/*.jsonl` 仍是唯一事实源，驱动可重放。
6. **不弱化项**：三卡 + merge-main（客户本人，judge 不可代批）、judge 代批、append-only 审计、写区边界、高风险清单、Git v5 普通用法全部保留。

## 四、未做 / 边界

- 未改代码、测试、角色卡、边界、schema；未运行 `npm`/测试/真实模型/Electron；未占用任何调试端口；未读 `.env`。
- 未写引擎选型矩阵、PoC、迁移到第三方引擎的内容（客户已取消）。
- 未实现第一步（应用侧内置派发）；实施由协调代理在 `feat/app-dispatch-builtins` 推进。
- 未修改 `docs/communication/memo.md` 的既有未提交改动；本次只提交两份新文档（设计记录 + 本记录）。

## 五、待确认 / 下一步

- 设计记录 §8.2 Q1–Q10 为未决项，均有推荐默认；优先需协调方裁定：Q1（幕僚按 prompt 呈卡 vs 应用直呈）、Q2（验收强度归属）、Q3（项目验收角色派发）、Q6（worker-dispatch 收口者）、Q10（在飞协议是否迁移）。
- 第一步验收建议（记录 §九）：幕僚固定会话无派发/收口/重派/停止工具；运营仅项目 worker 可派且需绑定；应用建任务/观察报告/收口幂等可恢复；阶段转移与完成判定与 v2.1.0 等价；三卡与 judge 不弱化；在飞协议隔离；零新依赖；legacy 测试零回归。
- 本记录不构成实施授权、验收或客户批准；合并/发布仍按客户逐次放行。
