---
flowId: snake-game
intentId: snake-game
stage: A8
version: 1
author: nominator
status: recorded
kind: a8-role-activation-record
date: 2026-11-11
workflowId: wf-f7e54091de068cb28e4e6998
taskId: t-mwbthn8s-288f1d55
roster: docs/proposals/snake-game-roster-v1.md
proposalDecisionId: decision-req-a6b3741f0b3ce498
---

# snake-game A8 建卡与激活记录（人事）

> 本记录只留痕 A8 实际写盘与 `activate_role_documents` 真实回执；不含自行计算的 sha256，不构成验收或批准。

## 1. 建卡（15 路径，均按名单机械生成）

| 角色 | 边界条目（模块并集） | 三文档 |
| --- | --- | --- |
| env-bootstrap | `styles/`（directory）、`index.html`（file） | `角色卡/env-bootstrap/{role-card.md,boundary.md,boundary.yaml}` |
| game-logic | `src/core/`（directory） | `角色卡/game-logic/{role-card.md,boundary.md,boundary.yaml}` |
| input-ctrl | `src/input/`（directory） | `角色卡/input-ctrl/{role-card.md,boundary.md,boundary.yaml}` |
| ui-render | `src/render/`（directory） | `角色卡/ui-render/{role-card.md,boundary.md,boundary.yaml}` |
| app-shell | `src/app/`（directory） | `角色卡/app-shell/{role-card.md,boundary.md,boundary.yaml}` |

- 角色卡均含 10 必填章节（组别/工作立场/能力描述/职责与功能导航/必读资料/交接输入输出/执行原则/质量职责/标准工作流/交付物清单）。
- boundary.md Section 1 表格与 boundary.yaml 条目恒等（仅 root/kind/path/condition 参与恒等）；boundary.yaml 顶层仅 `role` 与 `entries`，未写 `version`/`roleId`/`root`。
- 未写名单外角色、未扩张边界、未写其他角色目录或治理路径。

## 2. `activate_role_documents` v2 真实回执（逐角色一次）

调用参数口径：`flowId=snake-game`、`workflowId=wf-f7e54091de068cb28e4e6998`、`proposalDecisionId=decision-req-a6b3741f0b3ce498`、`roster{path}` 与 `documents{card,boundaryMd,boundaryYaml}{path}` 仅传路径（未传任何 sha256）。

| targetRoleId | ok | rosterSha256（应用回执值） | activationKey | replay | stageCompleted |
| --- | --- | --- | --- | --- | --- |
| env-bootstrap | true | 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | role-activation:wf-f7e54091de068cb28e4e6998:env-bootstrap:5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | false | false |
| game-logic | true | 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | role-activation:wf-f7e54091de068cb28e4e6998:game-logic:5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | false | false |
| input-ctrl | true | 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | role-activation:wf-f7e54091de068cb28e4e6998:input-ctrl:5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | false | false |
| ui-render | true | 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | role-activation:wf-f7e54091de068cb28e4e6998:ui-render:5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | false | false |
| app-shell | true | 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | role-activation:wf-f7e54091de068cb28e4e6998:app-shell:5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0 | false | true |

说明：以上为回执实际字段；回执未包含独立的 `activationDigest` 字段，本记录不虚构该值，以 `activationKey`（内容绑定）与 `rosterSha256`（应用计算值）为实际证据。第 5 个角色回执 `stageCompleted=true`，表示应用侧 A8 阶段完成判定成立。

## 3. 结论与边界留痕

- 5 个名单角色均产生真实 `ok:true` 激活回执（`replay:false`，非重放），A8 完成条件满足；未失败、无 code/missing/owner 需回退。
- 未发起任何 appointment / appointment-write 卡（固定路径 fixedCards 空），未要求或伪造客户许可。
- 未运行 shell、未计算或转抄任何 sha256（表中 rosterSha256 为应用回执值）、未改名单/提案/模块清单/架构/产品意图、未派生产任务、未招名单外角色、未联系客户。

## 4. 遗留

- 任命确认卡由幕僚在 A10 呈交；实现任务由运营在 A11 按「一模块一任务」派给上表属主。
- 角色边界与写区以应用激活记录为准；本记录不新增任何权限。
