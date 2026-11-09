# 缺陷记录：团队计划登记被拒——run-ambiguous / plan-path-invalid（2026-11-09）

- 日期：2026-11-09
- 记录角色：ANS 沟通（Communication）
- 来源：贪吃蛇真实测试恢复运行 RR5（客户已指示「修复并继续」的延续）中观测到的下一道阻塞门。

## 症状（RR5 真实运行观测）

- 提案链已通（A′/B 修复生效）：全新提案确认卡 `req-4d9cad12f7f51043` 真实呈现，客户经真实 UI 接受（`by:"customer"`、`operatorId:"51054"`、`accept`），`interaction.response.end ok:true`，A′ 决策快照 `decision-8231a86c…`（50,008 B / 6 files，5 份真实文档与磁盘逐字节一致）。
- 下一步 chief 派发 convener（`t-mw8tsyms-8eb2422f`）登记团队计划；convener 两次 `complete_team_plan` 均被应用拒绝：
  `errorCode:"plan-path-invalid"`、`message:"Plan path and declared version must identify the real flow team plan"`（`baseDigest` 为空串摘要、`targetDigest:null`）。
- 应用状态（`project_state`）：`run=none`、`unclosed=8`（8 个未关闭 draft run，`pinned=none`）、任务分散在多个 runId；`contract_check` 只给出 `run-hub-c9791d… state=draft`；`evidence_check` 因无已 pin criteria 返回 `criteria-ref-mismatch`。
- convener 合成为阻塞事实：`run-ambiguous`（多个活动 run，需指定 runId）；且应用未向角色暴露把文档登记/绑定到 run 或生成合法 `sha256/baseDigest` 的能力（禁 run_shell、target 非 git 仓库无 trunk）。
- 效果：未发任命卡、未创建新角色、未派实现、无游戏产物；convener 两次如实交回 `blocked` 报告，chief 记录 project.note（blocker）。

## 影响

- 真实链路在「团队计划登记」这一步被阻断：修复后的提案链无法推进到任命/实现/出游戏。
- 现象与「多轮失败尝试累积 8 个 draft run、无任何 pin、无规范 run 选择」相关；RR5 证据：`角色卡/测试/docs/change/2026-11-09_RR5_snake-restore-proposal-flow.md` + `2026-11-09_RR5_evidence/`（complete_team_plan 回执原文、project_state/contract_check 原文、convener 报告原件、账本、UI 截图）。

## 待办方向（供策划清点与设计）

1. 明确多 draft run 时「规范 run」的选择/收敛语义：应用侧选择或要求 chief 以受支持动作（如 run change/关闭旧 run）收敛；不得要求角色凭猜测。
2. `complete_team_plan` 的 `baseDigest/sha256` 合法来源：应用在出卡/登记时按实际字节提供，或工具契约改为应用侧计算；未知/不可读仍 fail-closed。
3. 复核「提案确认后 run pin/团队计划路径」的既有设计（`plan-path-invalid` 的校验是否与真实团队计划的落盘路径一致）。
4. 附带如实披露（非本门）：RR5 会话 `message.model` 实测为 `deepseek-v4-flash`（.env 配置的模型；非 Anthropic Claude）；提案卡执行阶段另有既有 judge 工具面错误（已在 RR4/S1 记录，不属本门）。

## 处置（当前）

- 本记录立案；RR5 已按预算停止（卡 2/≤4、消息 1/≤2、墙钟 ≈8m37s/≤45m，无驱动重试；偏差：门后多跑 ≈1m37s 由驱动未识别 blocked 报告导致，如实记录）。
- 是否作为修复/变更实施，按客户指示执行。

## 客户裁定（2026-11-09，职责归属；经历史核对后修正）

- 客户原话：「策划写两个计划吧，怎么是运营写呢。」「所有的方案都是策划来写啊。」→ 经协调方核对 ans-studio 仓库历史（团队计划自 2026-10-22 提交 `64ed44a` 起归 Steward/统筹，即现运营；策划一直写方案类文档）并回报后，客户修正：「**那团队计划还是归运营把**」。
- **最终裁定**：
  1. **方案类文档**（提案、人员名单、模块清单、架构、契约等）一律由**策划（rapporteur）**撰写——这是 ans-studio 既有分工，维持不变。
  2. **团队计划仍归运营（convener/统筹职能）**撰写与登记——与 2026-10-22 治理分工（`64ed44a`）、塔防 demo（历史版本"作者：Steward / 统筹（convener）"）及当前实现一致；运营写团队计划**不是**错误，不做职责变更。
  3. RR5 的实际缺陷按原「待办方向」处理：**规范路径/格式**（团队计划必须为 `docs/scheduling/<flowId>-team-v<N>.md`，格式说明并入「文档格式说明」变更、由测试钉住、全角色可读）与 **run-ambiguity / baseDigest 合法来源**（应用侧解决）。
  4. 不实施任何"团队计划改由策划撰写"的角色卡/边界/提示词变更；完成后 RR6 继续贪吃蛇真实测试。
