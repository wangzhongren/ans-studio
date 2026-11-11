# 项目工作流（two-fixed-paths / v1）

- flowId：`snake-game`
- 客户目标（原话）：做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）。
- 本期采用固定路径 A（内置治理角色 + 项目生产角色），步骤、角色与交接物如下。

## 步骤表

| 步骤 | 阶段 | 角色 | 前置依赖 | 契约 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 产品受理与准备 | A1 | product | 客户目标已由幕僚转达 | — | 受理/准备结论（目标理解、范围边界草案、验收要点草案、待澄清问题、意图文档路径草案）；可由运营汇总 | 产品提交 A1 受理报告（不入意图正文） | 仅受理/准备，不写 `docs/product/` 意图正文 |
| A2 意图撰写 | A2 | product | A1 受理结论 | — | `docs/product/snake-game-intent-vN.md` | 意图文档落盘并交回报告 | 覆盖键盘控制、计分、重开、边界碰撞四项 |
| A3 意图确认 | A3 | chief（客户卡） | A2 意图文档 | — | 客户 intent-confirm 决定 | 客户确认 | 客户本人确认，不由 AI 代批 |
| A4 提案撰写 | A4 | rapporteur | A3 意图确认 | — | 提案文档 | 提案落盘 | 方案/契约/成本边界清晰 |
| A5 团队名单/模块拓扑 | A5 | nominator | A4 提案 | — | roster / modules / topology | 名单与拓扑落盘并通过校验 | 模块属主、写区、依赖完整 |
| A6 提案客户确认 | A6 | chief（客户卡） | A5 名单/拓扑 | — | 客户 proposal 决定 | 客户确认 | 客户本人确认 |
| A7 团队计划 | A7 | convener | A6 提案确认 | — | `docs/scheduling/snake-game-team-v<N>.md` | `complete_team_plan` 回执 ok | 应用核属主/写区/分工/依赖通过 |
| A8 任命 | A8 | nominator/crew（客户 appointment 卡） | A7 团队计划 + A6 | — | 角色卡与边界 | 客户任命（D3） | 名单内角色，appointment-write 逐路径确认 |
| A9 基线 | A9 | convener（应用执行） | A8 任命 | — | `git init -b main`、`.gitignore` 托管块、baseline commit、任务分支 `ans/task/<workflowId>` | baseline 回执 | 失败按 `baseline-*` fail-closed |
| A10 客户任命确认 | A10 | chief（客户卡） | A8 | — | 客户 appointment 决定 | 客户确认 | 仅客户本人 |
| A11 实现派发与执行 | A11 | convener → 项目 worker | A7/A8/A9 | `docs/contracts/<name>-v<N>.md` | 各模块实现与提交（`ans/task/<workflowId>` 分支） | worker `submit_report` 回运营 | 按任务验收与证据要求，属主写集内 |
| A12 集成与归档 | A12 | convener | A11 各模块完成 | 同上 | 集成候选、`docs/acceptance/` | 集成汇总报告 | 差异逐项归属、冲突退原属主 |
| A13 独立验收 | A13 | 幕僚创建 verifier | A12 候选 | 验收标准 | 验收报告 | review 结论 | 独立质检，运营不代验收 |
| B4 发布合并 | B4 | 应用呈 merge-main 卡（客户本人确认） | A13 通过 + 授权 | — | main 合并 | 客户确认回执 | 运营不代批、不自行合并 main |

## 约定

- 生产线唯一派发者：convener 派 product / rapporteur / nominator 与项目生产角色；幕僚不直接派生产线角色。
- 不派 verifier：独立验收由幕僚创建；`convener→verifier` 被拒。
- 任务证据只写路径、内容/frontmatter 实际值与结论；哈希由应用在收口/归档时计算，worker 不用 shell 计算或探测环境。
- Git 只走结构化 `git_query` / `git_candidate` / `git_publish`；不裸改用户分支或远端。
- 客户确认卡预算：A3 / A6 / A10 共 3 张确认卡 + B4 merge-main（应用呈）；本表不额外诱导客户审批。
