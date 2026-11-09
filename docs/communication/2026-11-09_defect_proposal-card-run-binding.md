# 缺陷记录：提案确认卡「通道未受理」——draft run 未绑定提案物证（2026-11-09）

- 日期：2026-11-09
- 记录角色：ANS 沟通（Communication）
- 来源：客户在贪吃蛇真实测试中报告 UI 报错「回传失败：通道未受理——请重试」（原话引用）。

## 症状（真实运行观测）

- 幕僚经策划（rapporteur）发出「贪吃蛇小游戏 v1 提案确认」卡：`requestId=req-e6ff1693840f0ed0`，`cardKind=proposal`，`sourceRoleId=rapporteur`，flowId `snake-game`，选项 `accept`/`revise`。
- 卡片正常呈现给客户；但每次提交（客户/驱动经真实 UI 点「提交选择」）均返回失败，界面显示「回传失败：通道未受理——请重试」，可无限重试、永不成功。
- 主进程诊断（userData `ans/diagnostics/*.jsonl`）在卡片创建瞬间（02:55:31.207Z）记录：
  `event:"chief-decision.failed"`、`errorType:"Error"`、`errorMessage:"Draft request target is not bound to that run"`、`requestId:"req-e6ff1693840f0ed0"`。
  主进程 IPC `session:operator-response` 全部 `ok:false`。

## 已核实事实

1. 错误来源：`src/service/trunk/impl/apply-journal.ts`（约 :918–948）——决策请求绑定 draft run 时，要求请求的证据路径 ⊆ run manifest 的 `documents/execution` 产物引用；当前 run manifest 的 `documents` 为 `{}`、`execution.teamPlan/flow` 为 `null`，`refs.length === 0` ⇒ `unavailable("Draft request target is not bound to that run")`。
2. 目标项目 `.ans/runs/` 下存在 3 个 `run-hub-*` draft manifest，其 `documents` 均为空对象；提案/模块/名单/架构/契约 5 个文档虽已写入项目，但未绑定到 run manifest。
3. 卡片在宿主绑定失败后**仍然被呈现**给客户（`request.presented` 在案），因此客户看到的是「可重试」的失败——该卡实际不可提交；重试只会重复失败。
4. 幕僚回合被该卡阻塞（会话 `正在工作`、输入禁用），需人工 halt 才能继续。
5. 证据：`C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09\rr\evidence\`（drive.jsonl 的 dialog.seen/action 记录、ui-card-*.jpeg 截图、目标项目 `tasks.jsonl`、userData 诊断原件）。

## 影响

- 提案确认（闸门 1）在该运行中不可完成，流程阻断在提案阶段；客户侧看到无法消除的错误与无限重试。
- 这是真实测试暴露的产品缺陷：**宿主绑定失败时不应把不可提交的卡呈现为可重试**；且角色侧没有可用的「把已写文档登记/绑定到 draft run」的受支持路径（待策划核实）。

## 处置（当前）

- 已中止被阻塞的幕僚回合（halt），已向幕僚发送失败原文与指引：核对并把提案文档绑定到当前 draft run 后**重新出卡**；若角色侧无此能力，如实说明缺失环节。
- **第二次复核（确证产品侧缺陷）**：幕僚按指引重派返工（`task t-mw8ob8fp…`→rapporteur）并于 03:00:38 重新出卡 `req-2454680582827a06`（标题「确认"2D 贪吃蛇小游戏"实施提案（v1）」）；主进程在同一瞬间（03:00:38.777Z）再次记录 `chief-decision.failed`、同一 `errorMessage:"Draft request target is not bound to that run"`。复核时 `.ans/runs/` 下 4 个 run-hub draft manifest 的 `documents` 仍全部为空 ⇒ **角色侧无任何受支持路径能把提案文档绑定到 draft run，重新出卡不可能成功**（非模型操作问题）。
- 已停止自动重试与监控；卡由客户侧「稍后处理」收起，流程停在提案确认（闸门 1）。
- 本记录作为缺陷立案；修复方案与实施待客户指示后按 ANS 流程处理（候选：宿主绑定失败即不得呈现可提交卡，fail-closed 并给出可操作原因；为角色提供受支持的 run 文档登记/绑定路径，或在出卡前由应用自动完成绑定）。

## 客户修复指示（2026-11-09）

- 客户原话：「修复并继续」——明确授权按**修复快路径**处理本缺陷，并在修复后**继续贪吃蛇真实测试**。
- 快速路径判定：已确认行为=「呈现给客户的提案确认卡必须可提交/可裁决」；实际结果偏离且有可复现证据与本记录；无新增公共契约/数据模型/架构层（如需新增契约则升级为变更并回报）；风险 T1。
- 修复要求（最低）：
  1. **呈现 fail-closed**：chief-decision 宿主绑定失败时，不得把卡呈现为可重试/可提交；应把真实失败原因交回发起角色/回合（可操作、如实），并记录诊断。
  2. **合法出卡可提交**：draft run 上的提案确认卡（及其它客户决策卡）在证据真实存在时能够被正确承载——由应用在出卡时按实际项目字节完成绑定（快照+哈希）或等价的可验证机制；未知/不可读/哈希不符仍 fail-closed。
  3. 不弱化既有 pinned-run 与意图确认路径；不改写他人身份；补对应 unit/integration 测试。
  4. B1/B2 + 真实运行：修复后重跑本场景（draft run 提案卡 → 客户接受 → 流程继续），并确认无回归。

## 关联

- 同日变更立案：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`、`docs/communication/2026-11-09_intent_document-format-specifications.md`。
- 真实测试运行根：`C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09`；目标项目：`C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target`。
