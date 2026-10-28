# entry-role-minimal：三条在办方案处置记录（Q13 A 合并包）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜记录角色：策划（Planning）｜风险档位：**T2**（处置/归档记录，不改产品代码）
- 依据：客户闸门 1 确认（方案 v9.2 Q13 **A**：保持合并一包；三条机器部分在合并包内按本方案重审/取代；文档/文字原则按需保留）；`docs/planning/2026-10-28_design_entry-role-product-builtin.md` §11/P12/Q13；`docs/scheduling/2026-10-28-entry-role-minimal-team-plan.md` §4.6；验收标准 F-06/FIN（P12）。
- 性质：**处置与归档口径记录**，不是验收结论，不是客户新决定。本记录**不把任何一条写成「关闭」**——三条方案仍属客户已确认的合并包；本记录只登记「机器部分按本方案重审/取代、文档/文字原则按需保留」的执行事实与检索证据。

## 一、三条在办方案与处置

| 方案 | 客户已确认状态 | 机器部分（不实现） | 本变更中的处置 | 文档/文字原则 |
| --- | --- | --- | --- | --- |
| 性能按需 v2.1（`docs/planning/2026-10-28_design_planning-performance-criteria-optional.md`） | 合并一包（闸门 0 已确认；排期 delta 由闸门 1 处理） | gate 证据检查（`gateKindEvidenceIssue`）、默认性能 gate 规划 | 随 D 批撤除 gate/flow/team-plan/acceptance 机器一并**不再实现**；最小系统无默认性能 gate ⇒「性能按需」自动成立 | 保留为文档原则：性能验收仅在客户明确要求或确有门槛时纳入；本变更不新增任何默认性能文本/检查 |
| 统筹分阶段 v2（`docs/planning/2026-10-28_design_steward-phased-planning.md`） | 合并一包 | flow YAML、阶段放行、团队计划、骨架/占位、门禁机器 | 随 D 批撤除 flow/team-plan/骨架一并**不再实现**；最小系统无阶段机 | 保留为可选分析提示（运营 worker 可按需分阶段思考）；**不加流程/文件/校验** |
| 项目架构 v2（`docs/planning/2026-10-28_design_planning-project-architecture.md`） | 合并一包 | V4 项目架构交付物、团队计划「架构来源」机械校验、验收 ⑤、卡前守卫、legacy 兼容 | 随 D 批撤除团队计划/验收机器一并**不再实现** | 文档部分按需保留：策划可按任务写人读架构说明（如 `docs/contracts/<flowId>-architecture-v1.md`）；不新增固定路径/版本校验/卡前守卫 |

## 二、与「合并一包」的关系

- 客户闸门 1 已确认 **Q13 A：保持合并一包**；本变更（entry-role-minimal）作为合并包地基。三条方案的**机器部分**在合并包内按本方案重审/取代（客户闸门 1 确认取代关系）；三条方案的**文档/文字原则**按需保留（上表）。
- 本记录**不构成**对三条方案的「关闭/归档」新决定：若未来客户重新决定（Q13 B/C），应按客户决定与合并包流程另行记录；本记录不改变客户已确认的合并一包事实。
- 本变更未实现三条的任何机器部分（性能 gate 检查、分阶段 flow/团队计划、项目架构 V4/团队计划/验收 ⑤）；未新增相关目录/文件/校验/卡种。

## 三、检索与零残留证据

- 生产源码（`src/`、`app/`，排除 `dist/`/`node_modules/`）检索 D-04 撤除标识：`governance-gate|governance-ledger|flow_get|flow_step_update|flow_step_supersede|flow-service|flow-state|team-plan|acceptance-triage|acceptance-rework|request_acceptance|request_gate_review|request_boundary_change|hand_off_intent|request_clarification|schedule-write|report_artifact_ready|docs/flows/|ledger\.jsonl` ⇒ **0 命中**（F-05 复核，2026-10-29 工作树）。
- 三条机器模块（`flow-service.ts`/`flow-state.ts`/`team-plan.ts`/`acceptance-triage.ts`/`acceptance-rework.ts`/`governance-gate.ts`/`governance-ledger.ts` 等）已在 D 批删除；对应测试同步删除/重写（见 `change-D` §7、`change-F` 合并差异表）。
- 项目架构/性能/分阶段的文档文件仍保留于 `docs/planning/`、`docs/communication/`（只读历史材料），不被产品代码引用；`docs/flows/` 不再产生（最小系统无 flow 文件）。
- 团队计划「架构来源/阶段/性能 gate」相关机械校验与卡前守卫随 D 批撤除；最小系统无对应工具/卡种/账本字段。

## 四、边界与回退

- 本记录只写 `docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md`，不改产品代码/测试/角色卡/边界。
- 若客户未来重决三条方案：按客户新决定恢复/调整文档与机器部分需另开变更（闸门 0→1→2），不直接改本记录。
- 回退：删除本文件不影响任何产品行为；三条方案的历史文档与客户确认记录保持原样。
