# 工作流（snake-game / 路径 A）

稳定工作流文档（workflow/v1）。flowId=`snake-game`，workflowId=`wf-5f518ee14f687c8c8f3c6966`。
本表由运营维护；每个阶段仅由幕僚真实 `stage-request` 驱动，门禁/契约细节以应用回执与 `contract_check` 为准。

| 步骤 | 角色 | 前置依赖 | 契约/格式 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 受理/准备 | 首席受理，运营只读准备 | 客户目标已录入（flow=snake-game） | — | `docs/governance/convener/snake-game-a1-intake-v1.md`；本文件 | 运营 `submit_report` 回幕僚 | 受理结论、项目现状、后续前置与风险齐备 |
| A2 意图撰写 | product | A1 已收口，幕僚另发 stage-request | `project-intent/v1` | `docs/product/snake-game-intent-v1.md` | product `submit_report` | 幕僚核意图覆盖：键盘控制、计分、重开、边界碰撞（撞墙判定）并给出可验收口径 |
| A3 需求确认 | chief 发 intent-confirm 卡，客户本人回答 | A2 意图已提交 | `project-intent/v1` | 客户意图确认卡 | 客户明确确认（开启「替我决策」时判断 agent 按推荐项） | 客户确认结果入账 |
| A4 提案 | rapporteur | A3 意图确认 | `project-proposal/v2`、`project-modules/v2` | `docs/proposals/` 提案与模块清单 | rapporteur `submit_report` | 幕僚核提案与已确认意图一致 |
| A5 团队计划 | convener | A4 提案与模块清单可用 | `team-plan/v3` | `docs/scheduling/snake-game-team-v1.md` | `complete_team_plan` 成功 | 应用核模块属主、写区、分工、依赖 |
| A6 提案确认 | chief 发 proposal 卡，客户本人回答 | A4/A5 就绪 | — | 客户提案确认卡 | 客户明确接受提案 | 客户确认结果入账 |
| A7 名单 | rapporteur | A6 提案确认 | `project-roster/v3`、`project-topology/v2` | 名单（角色与模块归属，含拓扑图块） | rapporteur `submit_report` | 幕僚核名单模块归属与拓扑合法 |
| A9 基线小事 | convener（Git 由应用执行） | 团队计划 v4 已提交 | `team-plan/v3` | `git init -b main`、`.gitignore` 托管块、baseline commit、任务分支 `ans/task/<workflowId>` | 应用 baseline 回执成功 | 无 `baseline-*` 失败，不弹客户卡 |
| A10 任命 | convener 发 appointment 卡；Crew 按 D3 名单写卡 | A6 提案确认、D3 选中名单 | `role-card/v1`、`boundary-md/v1`、`boundary-yaml/v1` | `角色卡/<role>/...` | 应用 D3 选中 + 任命回执 | 客户任命完成，仅名单内角色被写卡 |
| A11 实现 | convener 派项目 worker（模块属主） | A10 任命完成、本工作流就位、A9 基线就绪 | 按模块契约与 `docs/workflow.md`（地址引用） | 任务分支 `ans/task/<workflowId>` 普通 add/commit、证据文件（纯路径） | worker `submit_report` 回 convener | 模块验收标准满足、证据路径齐备（hash 由应用计算） |
| A12 独立验收 | chief 创建 verifier | A11 实现报告与真实集成候选 OID | `ans-criteria/v1`、`quality-report/v1` | `docs/verification/`、`docs/acceptance/` | verifier 报告经 chief 收口 | review accepted（convener 不派质检、不代客户验收） |
| A13 发布合并 | 应用呈 merge-main 卡，仅客户本人确认 | A12 accepted，且满足 M0/权限/stopfacts | — | main 合并结果 | 客户本人确认 merge-main | 发布回执，无伪造 OID |

## 约定

- 证据口径：任务 `evidence[]` 每项为纯项目相对文件路径；内容/frontmatter 要点与结论写在报告正文；文档 hash 由应用在收口/归档/依据记录时按实际字节计算，worker 不计算、不附 sha256。
- 客户卡预算：A3 intent-confirm / A6 proposal / A10 appointment 共 3 张确认卡，A13/B4 merge-main 由应用呈、仅客户本人确认；decision 卡只用于材料性选择，不计入 3 张。
- 阶段边界：A2 意图正文由 product 撰写，运营不代写；本项目源码只由项目 worker 写，运营不写实现。
- 本文件随实际阶段推进与回执更新；稳定文件名不版本化。
