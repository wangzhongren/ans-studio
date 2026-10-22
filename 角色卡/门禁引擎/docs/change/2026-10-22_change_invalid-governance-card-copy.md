---
id: change_invalid-governance-card-copy
type: change
title: 治理确认卡缺 flowId/cardKind 的卡文本改为「本次不发卡、退回补齐重发」
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: 五张内置治理角色卡「治理卡参数纪律」段文案与 governance-trio 断言；不实现应用侧守卫（N1 属编排），不改判定逻辑/边界/能力位
related: [invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 五卡「治理卡参数纪律」旧「被当旧卡、判断 agent 不介入并回落手动」改为「本次不发卡、不生成客户卡、未向客户呈现，应用直接退回并提示补齐重发」；测试逐字断言同步并新增五卡统一新文案用例
  - date: "2026-10-22"
    kind: verified
    summary: node --test governance-trio.test.ts 33 计/33 过/0 失败 exit 0；npm run typecheck exit 1（3 条错误均在本角色边界外的 test/测试/background-tasks-e2e-real-model/ 在飞文件，本角色改动文件 0 错）
---

# 治理确认卡缺 flowId/cardKind：卡文本改为「本次不发卡、退回补齐重发」

## 1. 改在哪里

| 位置 | 改动 |
| --- | --- |
| `src/common/门禁引擎/governance-roles.ts` 的 `LIAISON_CARD_TEXT` / `RAPPORTEUR_CARD_TEXT` / `NOMINATOR_CARD_TEXT` / `CONVENER_CARD_TEXT` / `VERIFIER_CARD_TEXT` 五段「治理卡参数纪律」 | 把「缺任何一项＝无效治理调用：会被当作旧卡、判断 agent 不介入并回落手动，必须补齐两项重发」改为「缺任何一项＝无效治理调用：本次不发卡、不生成客户卡、未向客户呈现，应用直接退回并提示补齐重发。必须补齐两项重发」 |
| `test/门禁引擎/governance-trio.test.ts` | 五卡共同断言里的 `/当作旧卡/`、`/回落手动/` 改为新文案断言 + 旧句反向断言；新增 N5/T14 用例逐字钉住五卡统一新句 |

设计依据：`角色卡/项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md`
§4.5、§4.6、§6.1 N5、§7.3 T14（客户 2026-10-22 确认 N1–N5 严格口径，O1–O7 未授权）。

## 2. 前后区别

触发场景：五个内置治理角色（Lead / 主理、Draft / 提案、Crew / 组队、Steward / 统筹、Proof / 验收）
调用 `request_confirmation`（或 `request_choice`）时漏了 `flowId` 或 `cardKind`。

- **以前**：角色卡说这类卡「会被当作旧卡、判断 agent 不介入并回落手动」——应用仍把卡交给客户，
  客户被迫手动审批（todo-demo op-14 现象）。
- **现在（卡文本口径）**：角色卡说应用会**拒绝本次发卡**、**不生成客户卡**、**不向客户呈现**，
  直接把可操作原因退回发起角色，要求补齐两项后重发。工具回执按设计 §4.6 为 `declined` +
  `notPresented`，文案明确「卡片未发出」，而不是「未获客户同意」。

**注意**：本批只改**卡文本与测试**（N5）。真正的呈现前守卫（N1，在编排
`src/pipeline/orchestration/run-role.ts::governedInput` 拒绝无效卡）由编排角色实施；运行时核心
N2–N4（`notPresented` 字段、工具回执文案、schema 描述）另行实施。守卫未落地前，卡文本描述的是
目标口径，应用行为尚未改变。

## 3. 范围与保留

- 五张卡的 `flowId` + `cardKind` **必须同时携带**的纪律逐字保留；各角色 `cardKind` 白名单不变。
- 五角色口径一致（同一句新文案）；`liaison` 仍不使用 `request_confirmation` 做治理写盘。
- 其余卡文本逐字不变：`nominator` 卡另有「先弹任命卡会因规范物证缺失回落手动」——那是判断证据
  门槛的既有语义，与本参数纪律无关，未改；旧 `su` 卡文本（single 模型）不在 N5 范围，未改。
- 不改 `run-role.ts`、Model、Provider、桌面、共享组件；不改边界、预授权、禁写、能力位与任何
  判定逻辑；不实现 N1–N4；不触碰其他角色文件与 `todo-demo`；未 git 提交。

## 4. 验证（实际运行）

环境：Windows 11，Git Bash，Node v24.22.1，cwd `C:\Users\51054\Desktop\work\ans-studio`。

| 命令 | 结果 |
| --- | --- |
| `node --test --test-timeout=120000 test/门禁引擎/governance-trio.test.ts` | exit 0；**33 tests / 33 pass / 0 fail / 0 skipped** |
| `node --test --test-timeout=120000 test/门禁引擎/*.test.ts`（本角色全套） | exit 0；**301 tests / 300 pass / 0 fail / 1 skipped**（Windows 既有 skip） |
| `npm run typecheck`（`tsc --noEmit`） | exit 1；3 条错误全部位于 `test/测试/background-tasks-e2e-real-model/`（`e2e-background-real-model.ts`、`pi-smoke.ts`、`run-shell-comparison.ts`），属测试角色未跟踪的在飞文件，与本改动无关；本角色改动的两个文件 0 错 |

窄测覆盖：五卡共同口令（`本次不发卡`、`不生成客户卡`、`未向客户呈现`、`直接退回并提示补齐重发`、
`补齐两项重发`）与旧句反向断言；新增用例逐字包含新句、每卡恰出现一次，并保留
`flowId` + `cardKind` 纪律断言。既有其他断言未删除、未放宽。

## 5. 未验证项

- 真机端到端：N1 守卫尚未落地，无法验证「无效卡零呈现/零镜像/零判断/零记账」与补齐后重发
  （T15–T17 属测试角色）。
- 模型是否按新文案补齐字段重发，取决于模型遵从，无机械保证。
- 独立验收未进行。

## 6. 边界

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、本文件、
`changelog.md`、`memo.md`。未碰 `src/pipeline/**`、`src/provider/**`、`src/model/**`、`app/**`、
`test/测试/**`、其他角色文件；未提交 Git；未触碰 `todo-demo`。
