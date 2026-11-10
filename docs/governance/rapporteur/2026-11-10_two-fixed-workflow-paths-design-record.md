# 角色记录：两条固定工作流路径实现级方案（业务策划 rapporteur，2026-11-10）

- 角色：ANS 内置角色「策划」（业务策划 `rapporteur`，独立固定上下文；**不是** `rapporteur-code` 代码维护角色）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 分支：`feat/two-fixed-workflow-paths`（worktree `.claude/worktrees/trunk-amendment`；HEAD `10f90c7`，基于 `origin/main` `d9e3e99`）
- 状态：**实现级方案已产出**；待独立复核（must-fix 闭环）→ B1 冻结。本轮未实施、未测试、未验收、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- 写区：本记录在 `docs/governance/rapporteur/`（本角色 Section 1 预授权目录）；方案在 `docs/proposals/`。未写 `docs/planning/**`、`src/**`、`app/**`、`test/**`、`角色卡/**`、其他角色文档、`main`。

## 一、依据核对（写盘前实测）

| 依据 | 路径 | 实测 | 与任务书一致 |
| --- | --- | --- | --- |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 行 / 8,476 bytes / SHA-256 `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` | 是 |
| 启动计划（只读） | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 75 行 / 8,913 bytes / SHA-256 `8b207d246b8977e5965aa30a5397f667f89726e3c5701bd4f73e54bf5c910b1b`（工作树更新后版本；前任记录的 74 行 / 8,199 B / `2c7c49…` 为旧版） | 是（内容含 2026-11-10 边界口径校正） |
| 前任清点记录（只读，不替代方案） | `角色卡/rapporteur-code/docs/design/2026-11-10_impl_two-fixed-workflow-paths.md` | 86 行 / 12,447 bytes / SHA-256 `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad` | 是（其清点结论已复核并扩展，见 §三） |
| 现有架构/契约（只读） | `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` | 1,242 行 / `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce` | — |
|  | `docs/planning/2026-11-05_design_governance-authority-matrix.md` | 1,056 行 / `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6` | — |
|  | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` | — |
|  | `docs/planning/2026-11-09_design_document-format-specifications.md` | 979 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54` | — |
|  | `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` | 686 行 / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be` | — |
|  | `docs/planning/2026-11-09_design_team-plan-run-binding.md` | 438 行 / `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b` | — |

代码基线：`git rev-parse HEAD` = `10f90c769ce9c2a567cdd364def0037fe9019a05`；`git rev-parse origin/main` = `d9e3e99c160599e5b53a82e105939a359f69992f`。方案行号按此快照；实施以符号名/文本锚点为准。

## 二、本轮产物

| 产物 | 路径 | 实测 | 说明 |
| --- | --- | --- | --- |
| 实现级方案 v1 | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md` | 见完成后实测（本记录写入时同步记录；最终数值见 §七） | 唯一产品方案文档；含清点、派发/状态机/账本/Git/卡片/迁移/分工/测试/风险 |
| 本工作记录 | `docs/governance/rapporteur/2026-11-10_two-fixed-workflow-paths-design-record.md` | 见 §七 | 清点索引、关键取舍、Qs、合规披露 |

未写 `docs/contracts/`：本方案未新增跨角色架构契约文件；派发矩阵/接口增量在方案 §3 与现有契约接口评审流程中处理，默认不新增架构契约文档（任务书默认口径）。

## 三、清点覆盖（实际代码，只读）

1. **角色模块与工具面**：
   - 六角色模块：`src/common/roles/chief/{index.ts,internal/{spec,dispatch,tools,preflight,intent-confirm,card-text,context,codes,module}.ts}`、`convener/index.ts`、`product/{index.ts,internal/*}`、`rapporteur/{index.ts,internal/*}`、`nominator/index.ts`、`verifier/index.ts`；核对 cards/capabilities/dispatch/preflight/context/卡文本与报告期望。
   - `src/provider/runtime/schema.ts`：dispatch_task :614、request_choice :469、request_confirmation :283、submit_report :569、doc_format :818、governance_matrix :1462、redispatch_task :945、git 能力 :79-109、direct capabilities :37-77。
   - `src/common/gates/index.ts`：派发父门 18 reason 闭集 :82-100、`evaluateChiefDispatchParent` :228-253。
   - `src/common/编排/workflow-preconditions.ts`：`evaluateDispatchAuthorization` :1590-1645、`CHIEF_DISPATCHABLE_BUILT_INS` :1560-1566、`reportTargetForTaskCreator` :1674-1682、`parseTeamPlan` :60-112、`nominationD3CardFacts` :1434-1455。
   - `src/pipeline/orchestration/run-role.ts`：dispatch 注入 :1759-1764、模块工具 :1932-1959、写门禁 :1094-1240、卡种 :3073-3225。
2. **流程状态机/会话/卡片**：
   - `src/common/编排/task-state.ts`（任务/申请/审批事件、幂等、重放）、`run-manifest.ts`（run pin/run-change）、`project-state.ts`（状态视图）、`decision-card.ts`、`doc-format-specs.ts`、`role-log.ts`、`shell-audit.ts`。
   - `src/model/runtime.ts`（卡种/分组、task/request 事件、governance metadata）、`src/model/role.ts`（RoleToolId 14 项、RoleDispatchPolicyInput、ProjectConfig）、`src/model/version-change.ts`、`src/model/trunk.ts`、`src/model/directive.ts`、`src/model/project-state.ts`、`src/model/governance-matrix.ts`。
   - `app/desktop/session.ts`：routeDispatch :8557、routeStarDispatch :8912、硬授权 :8982-8992、convener→verifier 内联拒绝 :8993、hubPreparation :9000-9008、run pin/freeze :9163-9183、proposal 冻结拒绝 :3261-3281、direct 能力 :4359-4371。
   - `app/desktop/version-change.ts`（VCA/trunk IPC :93-116）、`trunk.ts`、`customer-input.ts`（judge 代批 :1320）、`interface.ts`、`write-preauthorization.ts`。
   - 现有 3 卡实现路径：`CHIEF_INTENT_CONFIRM_CARD`、rapporteur proposal 默认/冻结绑定、nominator appointment 校验/`validateAppointmentCardAgainstRoster`、verifier acceptance。
3. **将被取消的 Git 治理机制**：
   - `src/service/trunk/` 11 文件（apply-journal 4,030 行、abstract/public、amendment/snapshot/refreeze/derive/recovery/verify/upgrade）、`src/provider/trunk/` 6 文件（git-command 1,006、git-trunk-store 1,307、git-candidate-store 219、fs-trunk-store、abstract/public）。
   - `src/common/门禁引擎/classify-shell.ts`（v4 规则、`matchReadonlyGit` :1551、`checkGitPolicy` :1046、`SHELL_RULES_VERSION` :1134）、`versioned-doc-guard.ts`、`shell-write-guard.ts`、`pin-evidence.ts`。
   - `src/pipeline/orchestration/{trunk-runtime,version-change-runtime,stable-write-runtime,refactor-runtime}.ts`、`app/desktop/{version-change,trunk,write-preauthorization}.ts`。
   - 逐机制处置（keep/deprecate/compat-only）已写入方案 §6.5、§9.1。
4. **账本与审计**：
   - `.ans/state/{tasks,logs,customer-directives,downloads}.jsonl`、`versions.jsonl/lock/initialized`、`version-changes.json`、`refactor-requests.json`、`stable-writes.json`、`stable-write-permits.json`、`doc-freezes.json`、`download-consumer.json`；`.ans/runs/<runId>/manifest.json`；`.ans/trunk/*`；`docs/audit/shell-gate.jsonl`。
   - 文档 hash/依据绑定：`run-manifest.ts`、`parseTeamPlan`、`apply-journal.ts` activation/team-plan、`governance-judge-evidence.ts`、`versioned-doc-guard.ts`。
   - 保留机制：doc_format（54 格式）、judge 代批、写区边界、高风险清单/任务副作用。
5. **测试与真机**：
   - 555 个 `*.test.ts` 分布；强相关套件（roles/workflow-preconditions/trunk-dispatch-parent/dispatch-parent/runtime-dispatch-gate/star-routing/i-full-chain/run-pin/trunk-stable-write/bootstrap-frozen-closure/version-change 等）；known red 口径（version-change-integration 9 红、optional-acceptance 6/2/1/3/0、test/编排 22 fail/2 skip）；真机入口 `test/桌面应用/e2e/main.mjs` 等。
   - 从空项目到贪吃蛇的 A1–A13 真机步骤、隔离实例、预算另报、失败即停已写入方案 §11.3。

## 四、关键结论/取舍（方案正文的浓缩）

1. **派发矩阵**：convener→product/rapporteur/nominator/项目角色；chief→verifier + convener（仅 `taskKind:"stage-request"`）；chief→五内置/项目角色拒绝。角色模块 `dispatch()`、`evaluateDispatchAuthorization`、session 路由、schema 文案同步改；`src/common/gates/index.ts` 默认不改。
2. **幕僚调度不新增工具**：复用 `dispatch_task` 的 `stage-request` 子模式（taskKind/workflowId/stage/workflowPath 字段），运营在真实受派回合内再派发；报告/收口/幂等复用现有任务状态机。唯一新增 `RoleToolId` 是 chief 的 `requestReleaseMerge`（发布合并确认）。
3. **3 卡**：方案/任命发起人由 rapporteur/nominator 改为 chief；任命卡在角色激活之后（A8→A10），写卡授权改由 A6 方案卡 + roster 提供；固定路径不发 acceptance 卡（验收=独立质检+幕僚决策+发布合并卡），legacy 保留。
4. **状态机**：A1–A13 / B1–B4 每阶段有 stage id、执行角色、产物、卡、账本事件、幂等键、失败/停止语义；应用唯一投影/完成判定；非法转移 fail-closed。
5. **基线 3 件小事**：复用 `complete_team_plan` 工具新增固定模式（git init / 文档 hash 入账 `basis.recorded` / `parseTeamPlan` 结构校验），失败只回报运营/幕僚，不弹客户卡；`git init` 普通执行、父仓库/dirty fail-closed。
6. **Git 普通用法**：v5 shell 规则（只读白名单 + task-scope 的 add/commit；push/merge/reset 等硬拒）；实现角色在同一任务分支 `ans/task/<workflowId>` 串行提交；合并 main 只经应用 + `merge-main` 高风险确认卡（approval 组，judge 可代批），不 push/tag。
7. **账本**：新增 `.ans/state/workflows.jsonl`、`basis.jsonl`、`releases.jsonl`（3 个；jsonl-ledger 5 MiB × 3）；文档 `-vN` + SHA-256 入账；实现/验收/发布前 basis 校验，drift fail-closed；不把治理状态写进 Git。
8. **迁移**：trunk/bootstrap/冻结闭包/候选 ref/run pin/stable 许可/VCA/refactor 全部 compat-only 或 deprecate（保留代码、不注入、默认不调用）；删除另立清理变更；已合并修复不回退；蛇 target 历史 trunk 忽略。
9. **H1**：0 处边界修订；写集全部落在既有 directory/file 授权；接口评审项 = RoleToolId +1、RoleDispatchPurpose、GovernanceCardKind +1、task 字段、dispatch_task schema 字段。
10. **默认 Qs**：验收卡抑制（Q1）、发布合并发起方式（Q2）、写任务串行（Q3）、路径 B 无 basis 快照（Q4）、只本地合并（Q5）、父门不覆盖 fixed（Q6）——已在方案 §12.2 列出，需复核/协调方确认或升级。

## 五、与设计 v2 的冲突处置（详见方案附录 D）

C1 派发矩阵相反 → 重写；C2 幕僚五内置 → 改为 verifier + stage-request；C3 方案/任命发起人/验收卡 → 移 chief/抑制；C4 D3 早于写卡 → 改为方案卡授权写卡、任命卡授权实现；C5 结构化 Git → v5 普通 Git；C6 run pin/freeze/stable 前置 → 固定路径跳过；C7 治理状态在 trunk/run → 应用账本；C8 completeTeamPlan 依赖 trunk → 双模式；C9 高风险清单 → 保留；C10 不新增角色/边界/客户门 → 0/0（merge-main 为既有高风险确认具体化）。全部按设计 v2 为准，未擅自扩大客户口径。

## 六、写集外需求/阻断

- 本轮**无写集外需求**，未停止；未写 `docs/planning/**`（方案落 `docs/proposals/`，按启动计划 §三 2026-11-10 边界口径校正）。
- 需协调方/复核确认的 Q1–Q6 见方案 §12.2；若复核要求父门覆盖 fixed 派发或新增 provider 目录，属显式升级点（gates 接口评审/人事边界修订），本方案默认不做。
- 前任 `rapporteur-code` 的阻断记录（角色卡禁写 `docs/planning/`）已复核；本任务按启动计划改由业务策划写 `docs/proposals/`，未修改角色卡/边界。

## 七、最终实测（写盘后）

- 方案：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md`，**1,110 行 / 122,470 bytes / SHA-256 `279f55dcbf86b07f60fad62be30606758cfcd666cac83411a521609fb1446aeb`**（最终写盘后实测；含附录 E 逐文件处置；若复核要求修订，新版本另存并更新本记录）。
- 本记录：`docs/governance/rapporteur/2026-11-10_two-fixed-workflow-paths-design-record.md`；最终行数/字节由写盘后实测，SHA-256 由回报携带（**不嵌入本文件**，避免自指导致 hash 失效）。
- 本记录后续若因方案修订而更新，需重算并登记；不得把旧 hash 当新方案依据。

## 八、限制与披露

- 本轮为只读清点 + 文档产出；未写产品/测试代码、未改角色卡/边界、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- 清点行号按 HEAD `10f90c7`；实施以符号名/文本锚点为准；启动计划工作树已更新（75 行 / 8,913 B / `8b207d…`）。
- 方案不构成验收、批准、实施授权或预算批准；真机全链预算另报。
- 旧 trunk/run/VCA/stable 代码保留 compat；本变更不删除、不迁移历史账本；删除/清理另立变更。
- 方案与设计 v2 冲突处均以设计 v2 为准；Q1–Q6 需确认，不得自行按偏好扩大客户口径。
