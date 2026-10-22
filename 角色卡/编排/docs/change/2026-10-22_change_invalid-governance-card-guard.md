---
id: invalid-governance-card-guard-change
type: change
title: 治理确认卡呈现前守卫——缺 flowId/cardKind 直接退回补齐重发
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-unverified
related: [invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: created
    summary: 按客户已确认的 N1 严格口径，在编排 governedInput 加呈现前 fail-closed 守卫；删除 confirm 卡 cardKind 机械兜底；本角色测试已跑，跨角色 e2e/真机未跑
---

# 2026-10-22 变更：治理确认卡呈现前守卫（N1）

- 日期：2026-10-22
- 角色：编排
- 依据：客户 2026-10-22 确认按 N1–N5 严格口径实施、O1–O7 均不选。设计：[无效治理确认卡的应用侧守卫](../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)（§4.5、§4.6、§6.1 N1、§7.3 T1–T11）。
- 范围：`src/pipeline/orchestration/run-role.ts`（`governedInput`）、`test/编排/governance-judge.test.ts`、`test/编排/governance-session.test.ts`、本角色文档。运行时核心 N2–N4（`notPresented` 字段、工具「卡片未发出」回执、schema 描述）与门禁引擎 N5（五张角色卡文本）是已就绪依赖，本批**未改**。
- 未 git 提交；未改 `app/**`、`src/provider/**`、`src/model/**`、`src/common/门禁引擎/**`。

## 1. 用户可见的变化

治理角色调用 `request_confirmation` 时，应用在**把卡片交给客户通道之前**检查治理字段：

| 场景 | 改前 | 改后 |
| --- | --- | --- |
| 治理角色 confirm 卡缺 `cardKind`（能从路径推断） | 机械兜底成 `write` / `schedule-write` / `appointment-write` 后正常走判断链 | **拒绝**：`declined + notPresented:true`，不向客户发卡 |
| 治理角色 confirm 卡缺 `cardKind`（不能推断） | 作为旧卡直接呈现客户手动确认 | **拒绝**（同上） |
| 治理角色 confirm 卡缺 `flowId` / 格式非法 | 无 `judgeContext`，作为旧卡呈现客户手动确认 | **拒绝**（同上） |
| 治理角色 confirm 卡 `cardKind` 越权（不在该角色白名单） | 既有拒绝、不发卡 | **不变**（沿用既有文案与 `declined` 形状） |
| `liaison` 的 confirm 卡（有无 `cardKind`） | 缺 cardKind 时可能呈现客户 | **一律拒绝**（其确认卡允许集为空） |
| 普通项目角色、`single`/`su` 的 confirm 卡 | 既有路径 | **逐字不变** |
| `request_choice` 缺 `cardKind` | 按角色兜底（2026-10-20） | **不变**（O1 未授权，choice 兜底保留） |

被拒绝的卡：不调用原始客户通道（不生成 request id、不占 pending/queued、不镜像）、不计算/注入 `judgeContext`、不写客户决定账本、不发行任何写入路径。模型收到的工具回执由运行时核心的 `notPresented` 分支统一给出「治理确认卡未发出……请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」

## 2. 精确规则（`run-role.ts::governedInput`）

只对 `isTrio`（`governanceRoleOf(setup.role.id) !== undefined`，五个内置治理角色）且 `req.kind === "confirm"` 生效，按设计 §4.5 的顺序：

1. **缺 `cardKind`** → 拒绝（严格口径；2026-10-20 的 `defaultGovernanceConfirmCardKind` 及其调用、`governance.cardKind.defaulted` confirm 分支已删除）。
2. **显式 `cardKind` 不在 `TRIO_CARD_KINDS[role]`** → 沿用既有拒绝文案（「治理角色 X 不允许 cardKind=…；允许：…。本次未向客户发卡。」）。
3. **`flowId` 缺失或不符合 `^[a-z0-9][a-z0-9-]{1,63}$`（`isGovernanceFlowId`）** → 拒绝。
4. **`liaison` 的 confirm** → 一律拒绝（确认卡允许集为空；需求确认只走 `request_choice` 的 `intent-confirm`）。

拒绝返回 `{ outcome: "declined", reason, notPresented: true }`，原因文案（设计 §4.6，去掉结尾「请补齐后重新调用。」——该句由运行时核心工具模板统一追加，避免重复）：

- 缺 `cardKind`：`缺少 cardKind。治理角色的 request_confirmation 必须同时携带 flowId 与 cardKind（本角色允许：<confirm 允许集>）；本次未发行任何写入路径、未写入账本。`
- 缺/非法 `flowId`：`缺少合法的 flowId（须为非空小写 slug，匹配 ^[a-z0-9][a-z0-9-]{1,63}$）。治理角色的 request_confirmation 必须同时携带 flowId 与 cardKind（本角色允许：…）；本次未发行任何写入路径、未写入账本。`
- 两者都缺：合并列出两项，其余句子只出现一次。
- `<confirm 允许集>` 取 `TRIO_CARD_KINDS` 与工具级确认卡枚举（`write` / `appointment-write` / `schedule-write`）的交集，与设计 §4.2 的确认卡列一致；`liaison` 为「无」。

诊断：`governance.card.rejected`，只用共享白名单字段 `{ state: "not-presented", reasonCode, ok: false }`；`reasonCode` 为 `missing-card-kind` / `missing-flow-id` / `missing-card-kind-and-flow-id` / `role-not-allowed`。**不记录** `flowId` / `cardKind`（不在共享 `FIELD_NAMES` 白名单），未扩白名单；`roleId` 已在 logger 上下文。

**与设计的边界**：越权 `cardKind` 的拒绝属于设计 O4 所列「既有 app-side 拒绝」，O4 未授权，因此**不**给它补 `notPresented:true`，文案与形状逐字沿用；preview 完整性、Flow YAML 校验两条既有拒绝同样不变。

## 3. 代码位置

- `src/pipeline/orchestration/run-role.ts`
  - `governedInput`（约 L737–L853）：删除 confirm 卡 `defaultGovernanceConfirmCardKind` 兜底块；在 `isTrio` 分支按 `req.kind` 拆分 confirm 守卫与 choice 既有校验。
  - 删除 `defaultGovernanceConfirmCardKind` 函数；新增 `GOVERNANCE_CONFIRM_CARD_KINDS` 与 `confirmCardKindsOf`（仅用于拒绝文案的 confirm 允许集）。
  - 移除不再使用的 `declaredConfirmPaths` 导入（choice 兜底与 preview 完整性各自仍使用自己的路径提取）。
- `test/编排/governance-judge.test.ts`：原「缺 cardKind 兜底」用例改为「缺 cardKind 拒绝」；新增 T1–T11 矩阵。
- `test/编排/governance-session.test.ts`：原「无 cardKind 的 Lead 选择/确认不写治理账本」按新行为更新断言（两张卡都在呈现前被拒、raw 零调用、账本仍为空）。

## 4. 测试与验证（实际运行）

环境：Windows 11 Pro（10.0.26300）、Node v24.22.1、npm 11.19.1、HEAD `4d944e7`（工作树含未提交改动）。

| 命令 | 结果 |
| --- | --- |
| `node --test --test-timeout=120000 "test/编排/governance-judge.test.ts"` | **77 tests / 77 pass / 0 fail**（含 T1–T11 与 choice 兜底、显式越权、single/su/项目角色零变化断言） |
| `node --test --test-timeout=120000 "test/编排/*.test.ts"` | **716 tests / 715 pass / 1 fail**；唯一失败 `shell-authorized-routine.test.ts:103`（Windows 无 symlink 权限，EPERM，既有环境红、与本改动无关） |
| `node --test --test-timeout=120000 "test/runtime-core/governance-flow-metadata.test.ts"` | **9 tests / 9 pass**（N2/N3 的 `notPresented` 回执与 schema 描述联调） |
| `node --test --test-timeout=120000 "test/测试/governance-e2e-auto/*.test.ts"`（只读运行，测试角色套件） | **44 tests / 44 pass**（现有跨角色夹具均带齐 `flowId`+`cardKind`） |
| `npx tsc --noEmit`（全仓） | **exit 1，恰 3 条错误**，全在测试角色未跟踪目录 `test/测试/background-tasks-e2e-real-model/`（`e2e-background-real-model.ts`、`pi-smoke.ts`、`run-shell-comparison.ts`；`OrchestrationEvent` vs `SessionEvent`），与本改动无关，按要求未修 |
| 定向 typecheck（`tsc --ignoreConfig … run-role.ts governance-judge.test.ts governance-session.test.ts`） | **exit 0（0 错）** |

## 5. 未验证项 / 残余

- 设计 §7.3 的跨角色 T15–T17（真实桌面 Interface + 真实 run-role/gate/issuer/channel 的无效卡零呈现/零判断/零镜像/零账本与补齐代批）属**测试角色**，本轮未运行；真机复验（T19 对应 §九.7）也未做。
- 镜像、排队（pending/queued）由桌面在调用客户通道后才产生；守卫在 `raw` 之前返回，结构上不可达，但未做桌面侧断言。
- 严格口径是有意的行为变更：模型习惯性漏 `cardKind` 的卡以前可能被兜底通过，此后会收到可操作错误并需重发；schema 描述（N4）与角色卡文本（N5）已就绪，未在本轮验证真实模型行为。
- 全仓 typecheck 仍有上述 3 条既有错误；本改动文件定向 typecheck 为 0 错。

## 6. 跨角色待办

- 测试角色：继续按设计 §6.2/§7.3 补 T15–T17 跨角色用例；现有 `governance-e2e-auto` 44 例已实测通过。
- 无桌面/运行时核心/门禁引擎改动诉求；O1–O7 均未实施。
