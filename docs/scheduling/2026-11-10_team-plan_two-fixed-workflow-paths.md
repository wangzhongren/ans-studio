# 团队计划：两条固定工作流路径（T3，2026-11-10）

- **任务 ID**：`2026-11-10-two-fixed-workflow-paths`
- **产品/流程 flowId（拟）**：`ans-two-fixed-workflow-paths`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-10
- **状态**：**B1 已冻结，团队计划生效；实现未开始**。分支 `feat/two-fixed-workflow-paths`；**全链跑通前不合并 main、不发布/tag、不请求客户放行**；旧分支 `feat/initial-workflow-publication-completion` 暂停留历史（`4a0bafd`/`882d84b`），不参与本变更。
- **风险档位**：**T3**（产品级重构；改变角色权责/派发权、默认流程状态机、Git 治理机制退役、需迁移/废弃清单、确定性测试 + 真机全链）。
- **唯一产品依据**：`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`（95 行 / 8,476 B / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d`）。
- **实现依据（冻结）**：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`（1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8`；v1/v1.1/v1.2 历史）。
- **B1（冻结，唯一判据）**：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`；AC-01…AC-30、T-01…T-20、RR-01…RR-06、EV-01…EV-08，全部 `未取证`）。
- **第三轮独立复核（通过）**：`角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.3.md`（156 行 / 20,635 B / `550872d772cfcf986231c5f0dfc504be83e4b67d78266db348574a648753860b`）；前两轮 `df1992df…`/`259ecde7…`。
- **协调方决策（预授权）**：`docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` §七 #1–#8（90 行 / 10,820 B / `08450af1b6be0cf893bea81cd73f73c990551b89c499430fd5a60d3c6cbbc215`）；含 **merge-main 必须客户本人、judge 不可代批**、Q7/A12、Q4、Q1、Q2、Q6 与纪律。
- **基线/HEAD**：分支 `feat/two-fixed-workflow-paths`，当前 HEAD `2b5d208`（B1 冻结提交；**代码基线 `10f90c7`**，自 `10f90c7` 起仅 docs 提交，无产品代码差异）；`origin/main` `d9e3e99`。

---

## 一、任务（按 B1/v1.3，不扩大）

1. **派发分裂**：运营（convener）为生产线唯一派发者（product/rapporteur/nominator/项目生产角色/实现角色）；幕僚（chief）只派独立验收 verifier + `stage-request`（含 A11 派实现请求）；chief 不再派生产线角色；fixed 窄例外仅 `purpose=review && targetRoleId==workflow.reviewRoleId`（roster `roles[].review`）。
2. **两条固定路径**：A1–A13/B1–B4 状态机、per-flow 模式、3 张卡（意图/方案/任命，不合并）、A10/A11 时序、A12a/A12b 验收、路径 B 既有 Git 仓库/分支准备、发布前置按路径条件化。
3. **Git 普通用法**：任务分支 `ans/task/<workflowId>` add/commit；合并 main 只经应用 + **客户本人确认卡**（judge 不可代批）；push/tag/发布产物拒绝/另授权；shell v5 审计保留。
4. **应用账本**：`workflows.jsonl`/`basis.jsonl`/`releases.jsonl`、文档 `-vN` + SHA-256 入账、per-flow 依据校验/drift fail-closed、Q4 path-b 只读快照、A12 `docs/acceptance` 归档。
5. **迁移/废弃**：trunk/bootstrap/冻结闭包/候选 ref/run pin/stable-write 许可/VCA/refactor 默认路径不触达，保留 compat-only；旧账本只读忽略；已合并修复不回退；蛇 target 历史 trunk 忽略。
6. **保留不弱化**：审计 sidecar、judge（仅非高风险卡）、doc_format 54 格式、文件级写区边界、高风险清单；无新角色/客户门/边界模型变化；H1=0。

## 二、五维判断与角色

| 维度 | 判断 |
| --- | --- |
| 责任独立性 | 保留现有角色：运营/幕僚/产品/策划/人事/验收、编排、桌面窗口、运行时核心、门禁引擎、gates-code、shared-code、测试、独立验收。无新增/拆分/合并。 |
| 范围归属 | 全部写集在既有 Section 1；**H1=0**；`src/common/gates/` 不改；不改角色卡/边界模型/权限/客户门。 |
| 契约影响 | 无新客户可见门；接口评审项见 §四；merge-main 为既有高风险确认机制具体化（应用自有非判断卡）。 |
| 证据独立性 | L1 各 owner 单测 → L2 跨层集成 → L3 D1 → L4 独立 B2 → L5 真机全链；Scheduler 不判验收。 |
| 协调成本 | 高：B0–B5 串行依赖、六角色模块、接口评审、legacy 兼容、真机全链；单一 owner/零重叠。 |

## 三、写集与 owner（单一 owner、零重叠；按 B1/v1.3 §10）

### B0 基础设施/账本

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/**` | workflow/basis/release 类型、task 字段、merge-main 卡种、`AppOwnedGovernanceCardKind`、schema/task 字段骨架 |
| 编排 | `src/common/编排/task-state.ts`、`src/common/编排/workflow-state.ts`（新）、`workflow-service.ts`（新骨架）、`basis-guard.ts`（新）、`test/编排/**` | fixed `workflowId` 豁免 run-required、投影/账本骨架、per-flow 模式骨架、basis/.gitignore 骨架 |
| shared-code | `src/common/shared/config-loader.ts`、`test/项目管理/shared/**` | `workflowSchema?: "two-fixed-paths/v1"\|"legacy/v1"`；默认/强制语义 |
| 门禁引擎 | `src/model/role.ts`、`test/门禁引擎/**` | `DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`/`context({matrix})` 类型 |

### B1 派发权/状态机

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| 编排 | `src/common/编排/workflow-preconditions.ts`（legacy 谓词不改）、`workflow-dispatch.ts`（新）、`run-role.ts`、`governance-judge-*`（merge-main 排除）、`project-state.ts`、`workflow-state.ts`、`workflow-service.ts`、`task-state.ts`、`test/编排/**` | fixed 谓词/矩阵、stage-request、closeTask/prepareIntent/finalizeIntent、per-flow 路由、阶段转移/完成、judge 排除 |
| 桌面窗口 | `app/desktop/session.ts`、`app/desktop/workflow.ts`（新）、`workflow-git.ts`（新）、`customer-input.ts`、`interface.ts`（必要时 IPC）、`test/桌面应用/**` | routeFixedPathDispatch、direct 能力过滤、merge-main 通道、会话上下文 |
| 测试 | `test/测试/stage-request-integration.test.ts`（新） | stage-request 跨层正/负例、幂等、stop |

### B2 角色模块/工具面

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| chief-code | `src/common/roles/chief/**`、`test/roles/chief/**` | fixedCards/targets/context；legacy 数据/卡文本冻结；requestReleaseMerge 条件注入 |
| convener-code | `src/common/roles/convener/**`、`test/roles/convener/**` | fixed 生产线派发目标；legacy 常量冻结 |
| product-code | `src/common/roles/product/**`、`test/roles/product/**` | fixed 提示/能力；legacy 冻结 |
| rapporteur-code | `src/common/roles/rapporteur/**`、`test/roles/rapporteur/**` | fixed 提示/能力；legacy 冻结 |
| nominator-code | `src/common/roles/nominator/**`、`test/roles/nominator/**` | fixedCards=[]（任命卡归 chief）；legacy 冻结 |
| verifier-code | `src/common/roles/verifier/**`、`test/roles/verifier/**` | fixed 验收角色提示/能力；legacy 冻结 |
| 运行时核心 | `src/provider/runtime/schema.ts`、`tools.ts`、`test/runtime-core/**` | dispatch_task 新字段、close_created_task v2、request_release_merge（按接口评审）、文案模式中立 |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts`、`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（新）、`src/service/governance-matrix/**`、`test/门禁引擎/**` | fixed 矩阵视图；legacy `chief-workflow.md` 不改；v2 资源 |
| 编排 | `src/common/编排/doc-format-specs.ts`（如 roster v4 说明需要）、`test/编排/**` | `project-roster/v4` 兼容说明；54 格式 id 不变 |

### B3 桌面/卡片

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| 桌面窗口 | `app/desktop/**`、`test/桌面应用/**` | 3 卡呈现/绑定、merge-main 客户本人（非判断卡/judge 拒绝）、direct 能力过滤、workflow 状态显示、fixed 模式隐藏/只读 VCA/trunk 面板、.gitignore/clean |
| 编排 | `src/common/编排/workflow-service.ts`、`workflow-state.ts`、`release` 逻辑、`test/编排/**` | 发布合并执行/幂等/冲突、A13/B4 前置条件化、卡片数据、账本 |
| 测试 | `test/测试/**`（跨层） | 发布/卡片/账本集成 |

### B4 迁移/废弃

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| 门禁引擎 | `src/common/门禁引擎/classify-shell.ts`、`governance-roles.ts`、`src/service/governance-matrix/**`、`test/门禁引擎/**` | shell v5（add/commit 允许、push/merge/reset 等拒绝、staged 越界、临界区、审计）、fixed 矩阵视图 |
| 编排 | `src/common/编排/**`、`src/pipeline/orchestration/**`（仅 fixed 兼容所需）、`test/编排/**` | legacy 不注入旧工具、fixed 不触达 trunk/run/stable、旧账本只读忽略、B 写集来源 |
| 桌面窗口 | `app/desktop/**`、`test/桌面应用/**` | 注入过滤、fixed 面板只读、legacy 兼容 |
| gates-code | `src/common/gates/` **不改**；`test/gates/**` 只读回归 | 接口评审/差分确认；若必须改 gates 则停止并升级 |

### B5 测试/真机

| Owner | 文件/目录 | 内容 |
| --- | --- | --- |
| 测试 | `test/测试/**` 新/更新：`fixed-path-full-chain.test.ts`、`mode-switch.test.ts`、`path-b-baseline.test.ts`、`b-change-scope.test.ts`、`existing-project-compat-verify` 等；全量回归 | T-01…T-20 执行、跨层全链、真机脚本/证据 |
| 各 owner | 各自 `test/<domain>/**` | 本角色单测（B0–B4 已随批） |
| 独立验收 | `角色卡/独立验收/docs/**`、`docs/acceptance/**`（任务精确范围） | B2 全量判定、报告、真机见证 |

- **写集外 diff=0**：不写 `src/common/gates/`、`角色卡/**`、`classify-shell.ts` 之外的门禁策略、doc-format 注册表新 id、角色卡/边界/权限/roster 模型；不新增依赖/目录/客户门。
- **旧断言**：legacy 断言逐字保留；fixed 新增断言；不得删除/弱化 fail-closed；不新增 skip/force-exit。
- **顺序**：B0 → 接口评审 G-IR → B1 → B2 → B3 → B4 → B5 → D1 → B2 → RR；同文件同 owner 串行。

## 四、接口评审门（非客户门；评审失败即不支持）

在 B0 类型落地后、B1/B2 使用前，由 **门禁引擎牵头，运行时核心 + shared-code + gates-code + 六角色 code 代表**评审并留痕（`角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md`）：

1. `DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`/`context({matrix})`；
2. `RoleToolId`：**优先复用既有 direct capability**；确需 `requestReleaseMerge` 时评审必要性/接口/fail-closed；**失败即不支持，不得强推**；
3. `merge-main` 卡种（`GovernanceCardKind`/`AppOwnedGovernanceCardKind`；非判断卡、不进 `GOVERNANCE_CARD_GROUP`、`planJudge` 排除）；
4. `task.created` 新字段（`workflowId/stage/taskKind/workflowPath`；workflowId 豁免 run-required）；
5. `dispatch_task` 新字段（`taskKind`/`workflowAction`/`workflowPath`/`workflowId`/`stage`/`reworkOf`）与 `DispatchTaskPayload`；
6. `close_created_task` v2、`activate_role_documents` v2；
7. 模块新增导出（`fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`）；
8. `project-roster/v4 roles[].review`（v3 兼容、可选、至多一个 true）。

评审记录须含结论与影响；失败项不得进入实现（改用既有能力或停止升级）。

## 五、阶段计划与出口

| 节点 | 内容 | Owner | 前置 | 出口 |
| --- | --- | --- | --- | --- |
| G-IR | 接口评审（§四） | 门禁引擎牵头 | B0 类型 | 评审记录；失败项 0 或已回退 |
| B0 | 基础设施/账本 | §三 B0 | 基线 | typecheck 0；新增单测；旧测试零回归；候选 hash |
| B1 | 派发权/状态机 | §三 B1 | B0+G-IR | legacy 全组合逐字通过；fixed 矩阵/stage/close/intent 单测；候选 hash |
| B2 | 角色模块/工具面 | §三 B2 | B1 | legacy 差分不变；fixed 差分；工具/卡种/接口记录 |
| B3 | 桌面/卡片 | §三 B3 | B2 | 3 卡/merge-main 客户本人/judge 拒绝/无 trunk 写入；集成测试 |
| B4 | 迁移/废弃 | §三 B4 | B3 | shell v5；legacy compat；fixed 不触旧机制；B 写集越界拒绝 |
| B5/D1 | 全量确定性 + 跨层全链 | 测试 + owners | B0–B4 | T-01…T-20；typecheck；known red 不恶化；D1 记录 |
| B2 验收 | 独立 B2 | 独立验收 | D1 | 按 B1 AC-01…AC-30 全量；pass/fail/insufficient；EV-01…EV-08 |
| RR | 空项目→贪吃蛇真机全链 | 测试 + 独立验收 | B2 放行；预算书面授权 | RR-01…RR-06；隔离实例；失败即停；不合并/发布 |
| 交付 | 里程碑如实回报 | Scheduler/运营 | RR | 全链跑通；未合并/未发布；客户另行授权 |

## 六、验收与证据（按 B1）

- **同一候选**：D1/B2/RR 基于同一实现分支 HEAD 与环境；每批提交后记录候选文件逐文件 raw SHA-256 + 可复算聚合；写集外 diff=0。
- **D1 每批**：`npm run typecheck` + 受影响套件 before/after TAP + 失败名集合 diff + 文件清单/写集外 diff=0；记录在 owner `角色卡/<role>/docs/change/2026-11-10_*two-fixed-workflow-paths*.md` + `_evidence/`。
- **known red**（B1 §二）：version-change-integration 9 红（`vca-channel-unavailable`）、optional-acceptance 6/2/1/3/0、`test/编排/**` 22 fail/2 skip；同名不恶化、新增确定性失败=0、新 skip=0；不改 `optional-acceptance.test.ts`。
- **B2**：独立验收按 B1 AC/T/RR/EV 全量，不采纳实现自述；B2 报告 `docs/acceptance/` + 自身 docs。
- **证据分层**：L1 owner 单测 → L2 跨层 → L3 D1 → L4 B2 → L5 真机；所有 hash/命令/日志可复现。
- **接口评审**：EV-05 记录；失败项不得进入实现。
- **H1/边界**：T-19；写集外 diff=0；`角色卡/**`、`src/common/gates/` 未改。

## 七、真机全链（RR；预算另报）

- **隔离实例**：全新空项目目录；独立 Electron userData/session、独立 `ANS_E2E_OUTDIR`；**不使用 9222/9223**；真实 Electron + 真实模型 + 真实 UI；失败即停。
- **路径 A**：空项目 → 幕僚 → 贪吃蛇需求 → 意图卡 → 产品意图 → 策划方案/模块/名单/架构/契约 → 方案卡 → 人事建卡/激活 → 团队计划+基线（git init/哈希入账/计划落盘）→ 任命卡 → A10 → A11 stage-request → 运营派实现 → `ans/task/<workflowId>` 串行提交 → A12a/A12b 验收 + `docs/acceptance` 归档 → 运营汇总 → merge-main 客户本人确认 → 应用本地合并 main → 客户可玩。
- **检查**：`workflows/basis/releases` 账本完整；`.ans/trunk`/`.ans/runs` 未被新路径写入；`docs/audit/shell-gate.jsonl` 有 git 审计；`.gitignore` 托管块生效；3 张卡各一次；无额外客户门；无 judge 冒充客户。
- **预算**：真实模型轮次/费用单独报告；本团队计划不含预算批准。
- **禁止**：不合并 ans-studio main、不打 tag/发布产物、不请求客户放行；全链跑通后才交付。

## 八、协调项、决策与纪律

1. **协调方决策**（启动计划 §七 #1–#8）：v1.3 已复核通过；Q7/A12、Q4、Q1、Q2、Q6 已确认；**merge-main 必须客户本人、judge 不可代批**；纪律不变。
2. **Q3/Q5**：写任务串行 + 每项目至多一个活动 fixed workflow；只本地合并 main，push/tag/产物发布另授权（B1 AC-12/AC-22/AC-27）。
3. **接口评审**：§四；`requestReleaseMerge` 优先复用，失败即不支持；`project-roster/v4` v3 兼容。
4. **旧分支/旧机制**：旧分支停用留历史；trunk/run/VCA/stable compat-only，默认不触达；删除/清理另立变更。
5. **Scheduler 不判验收、不写产品代码；不推送/合并/发布**；实施角色只在自身 Section 1 与 B1/本计划精确范围写；实现/测试提交由各 owner 在分支执行。
6. **升级条件**：写集外文件、新依赖、权限/边界/客户门变化、预算提升、接口评审失败、legacy 断言必须改写——任一出现即停止并回报，不得自行扩围/强推。

## 九、写盘边界与下一步

- 本计划只写 `docs/scheduling/`；不写产品/测试/角色卡/边界/验收判据；不判验收；不实施；不推送/合并/发布。
- 下一步：**B0 基础设施/账本 + G-IR 接口评审** 派发；随后 B1→B2→B3→B4→B5→D1→B2→RR；每批里程碑如实回报。
