# snake-game A1 受理/准备记录（product 侧）v1

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 路径：A
- 阶段：A1 受理/准备（product 侧只读准备）
- 任务：`#t-mwbn1cgn-4ca425b7`（from convener）
- 依据：`docs/workflow.md` A1 行（首席受理，运营只读准备；A1 交接物 `docs/governance/convener/snake-game-a1-intake-v1.md`）

本文件只做受理与准备，不含产品意图正文。意图正文属 A2，须由幕僚另发 stage-request 后写入
`docs/product/snake-game-intent-v1.md`（`project-intent/v1`）。

## 一、需求受理结论

**已受理**。客户目标：在当前项目里做一个贪吃蛇游戏，要求四项功能：

1. 键盘控制；
2. 计分；
3. 重开；
4. 边界碰撞（撞墙判定）。

客户原话要点已原样复述，未增删功能项、未替客户扩范围。本阶段未撰写意图正文、未写任何项目源码、未做实现。

## 二、当前项目现状（只读事实）

以应用只读事实（`list_dir` / `project_state`）为准，未做任何 shell 环境探测：

- 项目根仅有 `docs/`，其下为 `docs/workflow.md` 与 `docs/governance/convener/snake-game-a1-intake-v1.md`；
- 无产品文档（`docs/product/` 本文件为本目录首个产物）、无 `docs/intents/`、`docs/proposals/`、`docs/contracts/`、`docs/scheduling/`、`docs/verification/`、`docs/acceptance/`；
- 当前不是 Git 仓库（无 baseline、无任务分支）；
- 无 run（`run=none`，固定路径由 stage-request 驱动）；
- 无 roster、无模块清单、无 UI/构建配置，项目为空白起步。

## 三、实现所需的前置条件（供 A2 及后续阶段）

1. **A2 意图**：`project-intent/v1`，本侧可写目录 `docs/product/`；frontmatter 至少含 `intentId`（小写 slug，全文唯一，不得用 flowId 代替）、`flowId`、`version`，并与意图入口 `docs/intents/<intentId>.md` 三处一致。
2. **A3 需求确认**：客户 intent-confirm 卡，客户本人回答；意图须对四项功能各给出可验收口径。
3. **A4 提案 + 模块清单**（rapporteur）：`project-proposal/v2`、`project-modules/v2`；提案须与已确认意图一致。
4. **A5 团队计划**（convener）：`team-plan/v3`，模块属主/写区/分工/依赖由应用校验。
5. **A6 提案确认**：客户 proposal 卡。
6. **A7 名单 + 拓扑**（rapporteur）：模块归属合法后实现任务才可派发。
7. **A9 基线**：团队计划 v4 已提交后由应用执行 `git init -b main`、`.gitignore` 托管块、baseline commit、任务分支 `ans/task/<workflowId>`；未就绪前不得派实现任务。
8. **A10 任命**：仅 D3 名单内角色被写卡。
9. **A11 实现 / A12 独立验收 / A13 发布**：产品侧不参与实现、不派质检、不代客户验收；发布仅客户本人确认 merge-main。

## 四、风险与待定项（本阶段只列，不决定）

1. **运行形态未定**：浏览器单页或终端程序未指定，决定键盘事件模型与渲染方式，直接影响「键盘控制」的验收口径。
2. **技术栈与工具链未定**：本阶段不做 shell 探测；实现栈须在提案/模块清单阶段由策划按项目事实确定。
3. **计分口径未定**：得分事件（吃食物 +N）、是否累计、重开是否清零分数。
4. **重开语义未定**：重开后是否重置分数、蛇身长度、速度与食物位置；是否需确认或即时生效。
5. **撞墙判定行为未定**：边界碰撞是「立即游戏结束」还是「阻止移动」，二者验收差异明显，须 A2 明确。
6. **键盘映射未定**：方向键/WASD、是否禁止 180° 反向、失焦/暂停行为。
7. **节奏与难度未定**：初始速度、是否随分数加速、刷新节拍与手感目标（质量档位需 A2 给出，如「原型可用」vs「可交付演示」）。
8. **视觉/音效资产无来源**：若要外部素材须走 `request_download` 审批，不得用未授权资源。
9. **空白项目 + 无 Git**：A9 基线是隐藏前置，缺失会导致 A11 无法开始。
10. **客户卡预算**：A3/A6/A10 三张确认卡 + A13 merge-main；材料性选择走 decision 卡，不诱导额外审批。

## 五、结论

- A1 受理/准备（product 侧）完成：需求已受理并复述，项目现状已按只读事实登记，前置条件与风险待定项已列出，可供 A2 意图撰写直接取用。
- 未写意图正文、未写源码、未派任务、未发客户卡、未计算或申报任何 hash（hash 由应用在收口/归档时按实际字节计算）。
