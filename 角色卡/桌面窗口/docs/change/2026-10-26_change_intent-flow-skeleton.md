---
id: intent-flow-skeleton
type: change
title: 意图交接自动创建流程骨架；提案接受后的 Convener 文案识别 status: skeleton 并一次性替换
created: "2026-10-26"
status: implemented-unverified
---

# 意图流程骨架（桌面窗口）

## 改在哪里

- `app/desktop/session.ts::deliverIntentHandoff` / 新增私有 `ensureIntentFlowSkeleton`：意图交接**投递前**调用 Pipeline 公共出口 `ensureFlowSkeleton`（再导出源 `src/common/编排/flow-service.ts`）。
- `app/desktop/interface.ts::advanceGovernanceFlow`：读现有 `docs/flows/<flowId>.yaml`，`status === FLOW_SKELETON_STATUS`（从 `govern-session.ts` 只读导入的常量，不复制字面量）时向文案构建器传 `flowStateSkeleton`。
- `app/desktop/governance-advance.ts::buildGovernanceAdvanceMessage`：`BuildGovernanceAdvanceMessageOptions.flowStateSkeleton`；提案接受（`proposalDecision:"accept"`）分支新增骨架文案。
- 测试：`test/桌面应用/session.test.ts`、`test/桌面应用/interface.test.ts`。

## 以前怎样 / 现在怎样

触发场景：客户确认需求 → Liaison 调 `hand_off_intent` → 策划形成提案 → 客户接受提案。

- **以前**：意图交接成功、提案阶段开始前，`docs/flows/<flowId>.yaml` 尚不存在；角色 `flow_get` 报 not-found，无法登记 contract-freeze，流程文件缺失看起来像流程故障。
- **现在（意图交接时）**：桌面先按 `docs/intents/<intentId>.md` frontmatter 的 `flowId`（缺失回落 `intentId`）与 `qualityTier`（缺失/非法回落 `production`）**幂等创建**通用骨架 `docs/flows/<flowId>.yaml`：`status: skeleton`，步骤固定为 contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package / verification，全部 pending；不猜项目角色、不预写交付步骤。文件已存在（无论是否骨架）⇒ 原样保留、不覆盖。骨架创建失败（如 frontmatter 的 flowId 非法）⇒ **只记诊断，不阻断交接**；不写 `.ans`/账本。
- **现在（客户接受提案后）**：`advanceGovernanceFlow` 只读识别骨架，Convener 任务文案改为：写团队计划 → 用 `request_confirmation(cardKind=schedule-write)` 把该 YAML **一次性替换**为包含团队角色、交付步骤与 gate 的完整流程（保留 contract-freeze 已登记证据、替换后去掉 `status: skeleton`）→ 之后改用 `flow_get` / `flow_step_update` / `flow_step_supersede` 推进。
- **完整 flow（非骨架）**：文案仍为既有「用 flow 工具推进」，逐字不变。
- **无 flow**：文案仍为既有「请先写流程状态 YAML」，逐字不变。

## 不改变什么

- 不改变 flow 工具的权限与纪律：骨架替换仍走既有 `schedule-write` 确认卡；替换后仍禁止直接 `write_file` 流程 YAML（初始创建/骨架替换除外）。
- 不新增/修改 flow 步骤枚举、cardKind、治理角色或账本 kind；骨架不写客户决定。
- `hand_off_intent` 的校验/去重/每轮一次/`intent.handed-off` 仍全在编排；桌面只做投递与骨架创建。
- 不是第二套写门禁：`docs/flows/` 的写入经编排公共出口完成，桌面不直接写文件。

## 跨角色依赖（只读）

- `src/common/编排/flow-service.ts`（编排角色）：`ensureFlowSkeleton` / `buildFlowSkeletonSteps` / `FLOW_SKELETON_STATUS` 的唯一实现；桌面经 `src/pipeline/orchestration/govern-session.ts` 公共再导出消费。
- `src/common/门禁引擎/governance-roles.ts`（门禁引擎角色）：Convener 提示词已声明骨架替换路径；桌面任务文案与其对齐。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 会话测试 | `node --test "test/桌面应用/session.test.ts"` | **47/47 通过** |
| Interface 测试 | `node --test "test/桌面应用/interface.test.ts"` | **140/140 通过** |

新增用例：

- `session.test.ts`：intent frontmatter 的 flowId/qualityTier 被采用；重复交接不覆盖既有文件；intent 缺失回落 `flowId=intentId` + `production`；非法 flowId 只诊断、不阻断、不落盘。
- `interface.test.ts`：文案纯逻辑三态（skeleton / 完整 flow / 无 flow）；磁盘骨架 → Convener 收到「一次性替换」文案且应用不改写 YAML；完整 flow 仍走既有 flow 工具文案。

## 残余风险

- 骨架是通用步骤，不含项目角色/交付步骤；在 Convener 完成替换前，流程完成度/验收门不会把它当作可收尾流程（预期行为）。
- 遗留 `followUp:"nomination-after-flow"` 迁移路径（旧事件）若遇到已存在的骨架，会沿用「flow 工具推进」文案（骨架首步不是 nomination）；该路径新事件已不产生，仅迁移兼容。
- 未跑真实 Electron e2e；真实项目中的骨架→替换链路待独立验收。
