# 变更记录：团队计划 v2 读取、V12 写卡覆盖与 MapReduce 任务文案（桌面窗口，Map C）

- 日期：2026-10-22
- 任务：`2026-10-22-role-granularity-parallel-testing`（产品 flowId `role-granularity-parallel-testing`）
- 阶段：Map C（桌面窗口）
- 状态：**implemented-unverified**（已实现、已跑定向测试与 typecheck；未验收、未提交、未推送、未合并、未发布）
- 依据：客户闸门 1 确认的策划方案 v1、闸门 2 团队计划、实施前验收标准 `role-granularity-parallel-testing-criteria-v1`（P1/P3/P5/P9/P11/P13/P14/G2）
- 写集：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`（既有断言回归通过、未改）、`test/桌面应用/dispatch-delivery.test.ts`（未改）、`test/桌面应用/e2e/main.mjs`（未改）、本角色文档

## 1. 改动摘要

### 1.1 `app/desktop/interface.ts`：团队计划 v2 读取与 V12

- `TeamPlanRoleRow` / `TeamPlanInfo` 扩展：`module`/`modules`/`primaryModule`/`writesets`/`contracts`/`testSurface`/`dependsOn`/`parallelGroup`/`granularityRationale`/`isMap`/`isReduce`、`modules`/`moduleList`、`planIssues`/`warnings`、`legacy`、`teamPlanSchema`。
- `parseTeamPlanInfo` 不再自建 v2 解析：**经 pipeline 公共出口 `src/pipeline/orchestration/run-role.ts`** 消费编排 `team-plan.ts` 的 `parseTeamPlan`/`teamPlanIssueMessages`；不直接 import `src/common/编排/` 私有实现，不复制第二份 v2 解析（Q9 A / P14）。
- legacy（缺省/`teamPlanSchema: 1`）：保留 v1 旧行为（frontmatter/推荐集/表头/类型/四列非空），只记一条迁移 warning；不强制模块/公开契约/测试面等 v2 字段，不阻塞旧流程。legacy 角色行读取仅为桌面旧门控保留类型与四列；v1 表格检查仍由共享 `legacyTeamPlanRoleRowIssues` 负责。
- v2：读取模块清单与角色行；`warning`（单文件写集）与 `exception-review`（整层名/多模块有理由）只记诊断，不阻断。计划 error 来源＝Convener。
- **V12**（写卡后校验）：v2 计划写集必须被该角色 `boundary.yaml` entries 覆盖（file 精确匹配；directory/conditional-directory 覆盖目录前缀；仅 project root）。new/changed 未覆盖 ⇒ Crew 阻塞并提示「若计划写集本身有误，报告 Convener 修正计划」；`existing` 未覆盖只 warning、不阻塞。boundary 缺失/解析失败等文件问题仍为 Crew，计划结构问题仍为 Convener。
- role-readiness 派发文案传入 `teamPlanSchema`/`modules`；Crew 写卡任务传入 schema/模块清单。未改客户入口、IPC 通道/载荷、派发权、角色 id/显示名/路径。

### 1.2 `app/desktop/governance-advance.ts`：任务文案

- `buildGovernanceAdvanceMessage`（实际承担 `buildProposalAcceptMessage` 的角色）：
  - proposal accept：要求团队计划 v2（frontmatter `teamPlanSchema: 2`/`modules`、模块清单、14 列角色表、五维章节、Map 组写集不相交/组内无依赖、Reduce 覆盖全部 Map、粒度理由）；legacy 迁移提醒；保留「直接发任命卡」主路径。
  - appointment → Crew：读取 module/公开契约/测试面/dependsOn/并行组/粒度理由；boundary entries 必须覆盖计划写集（V12）。
- `buildAppointmentWriteReminderMessage` 同步 v2 字段与 V12 要求。
- `buildRoleReadinessTaskMessage`：v2 模块清单、逐角色 module/contract/testSurface/parallel/dependsOn/granularity 列、Map/Reduce 与测试分片/独立证据/manifest 约束；结构校验通过不等于粒度正确。
- `buildAcceptanceCriteriaTaskMessage`：v2 标准须覆盖模块覆盖/写集/并行/dependsOn 与分片/Reduce manifest 证据规则。
- `buildAcceptanceTaskMessage`：新增第⑦条 MapReduce 证据核对（分片独立原始日志、Reduce manifest、缺失判 insufficient evidence）。
- 未改 `flowStepEvidenceKind`（按需评估后无需变更）、派发权、客户卡种/入口。

### 1.3 `app/desktop/customer-input.ts`：N/A

- 现有实现已按结构透传 appointment 的 `teamPlanPath`（仅请求对象显式携带时）；模块/并行上下文不是冻结客户请求契约字段，本轮无需新增透传，故不改客户通道/卡种。N/A 理由：无需新增字段即可完成 Map C 读取与文案要求。

## 2. 测试

在既有精确文件内新增/更新断言（未新建 `test/桌面应用/` 文件、未删除测试、未放松断言）：

- `test/桌面应用/interface.test.ts`：v2 团队计划模块清单/v2 字段读取；V12 覆盖 ⇒ readiness（含模块列/分片/Map 文案）；V12 new 未覆盖 ⇒ 退回 Crew、不派 readiness；V12 existing 未覆盖 ⇒ warning 不阻塞；v2 计划缺公开契约 ⇒ Convener 来源、不误退 Crew。
- `test/桌面应用/operator-wiring.test.ts`：proposal accept/Crew/readiness/acceptance 文案的 v2、模块清单、V12、分片、manifest 断言。
- 既有 v1 用例（`interface.test.ts` 第 1/5 项）继续通过，证明 legacy 未被强制迁移。

## 3. 检查与候选哈希

- 命令与结果见完成报告；`npm run typecheck` exit 0。
- 定向：`node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/operator-wiring.test.ts` ⇒ 171/171 pass，exit 0。
- 只读回归：`test/桌面应用/**` 518/518；`test/测试/governance-e2e-auto/**` 68/68；`test/测试/governance-{trio,judge-cards,liaison}-verify/**` 86/86。
- 候选哈希（`git hash-object` / `sha256sum`）：
  - `app/desktop/interface.ts`：`203e36f492f4bcc07689810bdd6c861a75e5cba9` / `a683e5a51c88f7bef1d4b9d652ec0bcadd2de1d32f8299094e1fa2b264364c88`
  - `app/desktop/governance-advance.ts`：`965e46568a49c4e445ae947de3addd21a51a1d5f` / `c0eaa76920ad2159597055cb04c90662d133abd160555021e5cbfdf5588b9364`
  - `test/桌面应用/interface.test.ts`：`f3b8cae8c2bf637020c469e1874f675f6a2aef9f` / `e273b64156d0a24eeb6651141b02ffc05e8c881d26ad3e5f38ef3bd1e3ef5d1b`
  - `test/桌面应用/operator-wiring.test.ts`：`da29d2675969f84bf401acd0840974408a33b013` / `6f768d21c78e509db7b95dcd5e959d6bdcb4a176da0acd037ba24933bc543651`

## 4. 未做与限制

- 未跑 Reduce/Map D、未跑 T3 全量回归（测试角色职责）；未跑真实 Electron 启动演示（Reduce）。
- Provider 工具限制不影响本 Map：`flow_step_supersede`/`flow_get` 无需携带 `parallelGroup`/`dependsOn`；本角色未扩参。
- 未验收、未提交、未推送、未合并、未发布；文档状态 `implemented-unverified`。
