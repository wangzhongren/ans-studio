# 意图记录：删除全部预知式门控（2026-11-08）

- 日期：2026-11-08
- 记录角色：ANS 沟通（Communication）
- 客户原话：「这个预知门控全部删掉」

## 理解

「预知式门控」= 要求应用在**动作发生之前**就预知/证明未来能力面的检查，包括：
1. 会话创建准入的 `native factory plan` 要求（预知工具/工厂/传输/进程面）——正在实施的「会话准入按操作审批」变更已在删除；
2. `hasUnconfinedScriptTools` 在**创建期**拒绝 `run_shell`/`start_background_task`——同上，创建期拒绝改为按操作审批；
3. `inspectInitializationProtection` 的**注册表级**要求（进程内所有 active Core 条目必须有 Codex 原生 strict observed/processCoverage complete/native factoryPlan）；
4. 所有 `native-plan-*`、`native-tool-*`、`process-coverage-*` 等**基于预知面**的拒绝原因；
5. Codex strict native plan 作为**门控要求**的部分（可保留为可选证据，不作为放行前提）。

## 替代原则（不可弱化）

- **动作时授权**：执行动作时核真实角色/任务/回合/项目身份 + 角色既有 ACL/写集 + 审批 + 审计；
- 写入/外部副作用必须经审批链与审计（沿用「会话准入按操作审批」建立的 binding/审计路径）；
- 身份或权限无法证明时 fail-closed；unknown 不冒充 observed；
- 不开放无审批的自由 shell / Git 写；不改写权/角色边界/客户主权；不建 DSL。

## 流程

- 正在实施的「会话准入按操作审批」变更继续（其本身即在删除第 1/2 类预知检查）。
- 已并行启动的「Git 写/初始化」方案**扩大范围为「删除全部预知式门控」**：逐项列出被删除的检查/原因（file:line → 删除/替换），给出替代的按操作授权设计、测试同步与验收标准；随后按预授权流程实施、真实运行验证。
- 旧测试若断言被删除的预知行为，按新契约同步更新（属契约变更，非放宽断言；删除/改写需逐条记录并由验收判定）。

## 关联

- 当前变更方案：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（P1.3）
- 下一变更方案（待出）：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`（范围已扩大）
- 阻塞链与真实运行证据：`角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`
