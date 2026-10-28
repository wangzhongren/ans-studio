# entry-role-minimal 批次 F 变更记录（项目管理）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 提交：F 代码/测试 `e008187`（本角色无产品源码改动）。

## 范围

- **`project-rules` 最终核对**：`角色卡/项目管理/docs/project-rules.md` §二.13/15/16 已按 D 批（Delta-7）修订——decision 卡由需要该决定的内置角色直接提交、应用呈现/裁决；§二.15「产品执行」→「幕僚执行」；§二.16 各内置角色直接提交、两开关独立、fail-closed，移除 `write`/`schedule-write`；**§二.9/11/12（ANS 交付流程）不变**。F 无新增修改。
- **i18n 终态核对**：F 未改共享 i18n；`ui 850 / main 541 / shared 62 / preferences 3 = 1456`，zh/en parity、en-US 泄漏 0、旧 flow/triage/gate/ledger/acceptance/liaison key 0（全量 `i18n.test.ts` 通过）。

## 验证

- 规范全量 2908/2878/12/18；`i18n.test.ts`、`i18n-guard`、`i18n-b1-b2` 全过；`npm run typecheck` exit 0。
- 未改产品代码/测试/角色卡/边界；不 push/合 main。
