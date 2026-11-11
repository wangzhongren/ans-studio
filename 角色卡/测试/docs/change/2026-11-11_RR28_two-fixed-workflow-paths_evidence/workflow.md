# snake-game 项目工作流（v1）

> 本文件为运营（convener）维护的项目工作流（workflow/v1；稳定文件名，不版本化）；内容不解析，执行绑定以 trunk/v1 artifacts.workflow 为准。
> flowId：snake-game；workflowId：wf-7fcce8656a9bfb7fca73f124。

| 步骤 | 角色 | 前置依赖 | 契约 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 受理/准备 | product | chief stage-request | — | A1 准备说明 | 任务创建（stage.dispatched A1） | 运营核对并收口 |
| A2 意图撰写 | product | A1 收口 | — | `docs/product/snake-game-intent-v1.md` | 任务 closed accepted + 应用 hash 证据 | 运营核对；A3 客户确认 |
| A3 意图确认 | chief（客户本人 confirm） | A2 收口 | — | 意图确认卡裁决（decisionId） | 客户 confirm | 应用意图确认门 |
| A4 方案受理/准备 | rapporteur | A3 确认 | — | `docs/governance/rapporteur/snake-game-a4-prep.md` | 任务创建 | 运营核对并收口 |
| A5 方案/模块/名单/架构 | rapporteur | A4 收口 | `docs/contracts/snake-game-architecture-v1.md` | `docs/proposals/snake-game-proposal-v1.md`、`snake-game-modules-v1.md`、`snake-game-roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md` | 任务 closed accepted + 应用 versions 记录 | 运营核对；A6 客户确认 |
| A6 方案确认 | chief（客户本人 accept） | A5 收口 | — | 方案确认卡裁决（proposalDecisionId） | 客户 accept | 应用方案确认门 |
| A7 人事受理/准备 | nominator | A6 accept | — | `docs/governance/nominator/snake-game-a7-prep.md` | 任务创建 | 运营核对并收口 |
| A8 建卡与激活 | nominator | A7 收口 | — | `角色卡/game-implementer/role-card.md`、`boundary.md`、`boundary.yaml` | `role.activated`（activationKey） | 应用激活与治理矩阵 |
| A9 团队计划 + 基线 | convener | A8 激活 | `docs/scheduling/snake-game-team-v1.md` | 团队计划 v1、Git baseline（main + 任务分支 `ans/task/wf-7fcce8656a9bfb7fca73f124`）、basis.recorded | `complete_team_plan` ok + basisId | 应用核属主/写集/依赖 |
| A10 任命 | chief（客户 appointment 卡） | A9 完成 | — | 客户任命裁决（D3 名单） | 客户任命 | 应用任命门 |
| A11 实现派发 | convener | A10 任命（D3） | `docs/contracts/snake-game-architecture-v1.md` | 派发给 game-implementer 的实现任务（单模块一任务：moduleId、写集、验收/证据要求） | dispatch_task 回执（受理 ≠ 完成） | 目标必须在 D3 名单内且已激活 |
| A11 实现 | game-implementer | 实现任务创建 | 同上契约 + 本工作流 | `index.html`、`src/game.js`、`src/styles.css` + `submit_report`（路径/内容要点/静态自检结论） | 提交 `git add <paths>` + `git commit -m "<message>"`（消息整体加引号），人任务分支 | 运营核报告与提交回执；不运行 shell/测试脚本 |
| A12 独立质检 | verifier（chief 创建） | 实现回交 | 意图/契约 | 验收报告与证据 | 真实 review 结论 | 独立验收；实现者不自批 |
| A12 收口/交付 | convener | verifier 报告 + chief 续接 | — | integrate 汇总、发布请求 | 应用 CAS/merge-main（客户本人确认） | 不代批、不伪造 |

## 边界与约定

- 实现者写区：`index.html` 与 `src/`（名单模块并集）；禁写 `docs/`、`.ans/`、角色卡与其他角色目录。
- 实现任务文本不得建议 worker 运行自测脚本或任何 shell 命令；worker 只写模块文件 + 字面 `git add` / `git commit`，报告只给静态自检结论。
- 证据与哈希：文档 hash 由应用在收口/归档/依据记录时按实际字节计算；worker/运营不自行计算或转抄 sha256。
- 独立质检由幕僚创建 verifier 任务并收口；运营不派 verifier、不发 acceptance 卡、不代客户验收。
- 发布合并由应用呈 merge-main 卡、仅客户本人确认；运营不代批、不冒充客户、不自行合并 main。
