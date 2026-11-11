# 项目工作流（snake-game）

flowId：snake-game
workflowId：wf-3890e8370a4f772e7c7efe09
固定路径：A（新建项目）

## 步骤表

| 步骤 | 角色 | 前置依赖 | 契约 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 产品受理/准备 | 产品（product） | 客户需求输入 | — | 受理结论与澄清点（报告） | A1 任务创建即记 stage.dispatched | 幕僚确认进入 A2 |
| A2 意图撰写 | product | A1 | 产品意图格式 project-intent/v1 | `docs/product/snake-game-intent-v1.md` | 任务 closed accepted + 应用 hash | 幕僚呈 A3 意图确认卡 |
| A3 意图确认 | 幕僚（chief） | A2 | — | 意图确认（客户 intent-confirm） | 客户确认 | 进入 A4 |
| A4 策划受理/准备 | 策划（rapporteur） | A3 | — | 受理结论与 A5 计划（报告） | 任务 closed accepted | 幕僚确认进入 A5 |
| A5 方案/模块/名单/架构 | rapporteur | A4 | project-proposal/v2、project-modules/v2、project-architecture/v1、project-roster/v4 | `docs/proposals/snake-game-{proposal,modules,roster}-v1.md`、`docs/contracts/snake-game-architecture-v1.md` | 任务 closed accepted + 应用 hash | 幕僚呈 A6 方案确认卡 |
| A6 方案确认 | 幕僚 | A5 | — | 提案确认（客户 proposal） | 客户确认 | 进入 A7 |
| A7 人事受理/准备 | 人事（nominator） | A6 | project-roster/v4 | 名单一致性与 A8 计划（报告） | 任务 closed accepted | 幕僚确认进入 A8 |
| A8 建卡/激活 | nominator | A7 | role-card/v1、boundary-md/v1、boundary-yaml/v1 | `角色卡/<roleId>/` 三文档 + role.activated | 全部名单角色激活回执 | 幕僚确认进入 A9 |
| A9 团队计划 + 基线 | 运营（convener） | A8 | team-plan/v3 | `docs/scheduling/snake-game-team-v1.md`、git 分支 `ans/task/<workflowId>`、basis.recorded | 团队计划完成 + 基线回执 | 幕僚呈 A10 任命确认卡 |
| A10 任命确认 | 幕僚 | A9 | — | 客户 D3 任命 | 客户 appointment | 进入 A11 |
| A11 实现（一模块一任务，串行） | 项目实现角色 | A10（D3）+ 团队计划 | `docs/contracts/snake-game-architecture-v1.md` | 各模块文件 + 任务分支普通 commit | 各实现任务 closed accepted + 分支有提交 | 汇总后交幕僚 |
| A12 独立验收 | verifier（幕僚直派） | A11 完成 | `docs/quality/snake-game-criteria-v1.md` | 验收报告 docs/quality/、证据 docs/verification/ | 幕僚接受 review | 幕僚收口 |
| A13 交付/合并 | 幕僚 + 应用 | A12 | — | merge-main 卡（仅客户本人确认） | 客户确认合并 | 交付完成 |

## 派发与写区约定

- 运营是生产线唯一派发者：内置 product / rapporteur / nominator 与项目实现角色；不派 verifier（独立验收由幕僚直派）。
- 一模块一任务：`moduleId` 权威，`modulePaths` 只写该模块路径；跨模块派发会被拒绝。
- 实现 worker 只写本模块文件；完成时仅做字面 `git add <本模块路径>` + `git commit`，不得 `-A`/`./`/glob/amend；不得运行任何 shell（含 node/npm/自测脚本）。
- 证据只报纯项目相对路径、commit OID 与静态自检结论；hash 由应用计算。
- 冲突或返工退回原 owner 责任链；运营不代写实现、不篡改验收。
