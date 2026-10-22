---
id: governance-slug-no-trailing-hyphen-s2-s3
type: change
title: 收紧共享治理 slug 契约（S2/S3：编排单一定义来源与 Flow YAML 路径显式拒绝）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-unverified
related: [governance-slug-no-trailing-hyphen, governance-slug-no-trailing-hyphen-s1, invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 按客户确认的设计 S1–S5 实施本角色 S2/S3：编排 5 个私有正则副本与 run-role 的 2 个正则改为由 Model GOVERNANCE_SLUG_PATTERN 构造；6 处文案插值；意图旧值/Flow YAML 非法文件名显式 fail-closed；定向测试 87+45+78+21 全过、test/编排 725 计 724 过（1 条既有 Windows symlink EPERM）、npm run typecheck exit 0；S4/S5 由门禁引擎/测试角色完成
---

# 收紧共享治理 slug 契约（S2/S3）

## 背景与范围

客户 2026-10-22 确认按[设计](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)的 **S1–S5 实施，O1–O4 全部不选**。运行时核心已完成 **S1**（Model 常量收紧为 `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`，见[其变更记录](../../../运行时核心/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen.md)）。本记录只覆盖编排负责的 **S2**（`src/common/编排/` 单一来源化 + 意图旧值 fail-closed）与 **S3**（`run-role.ts` 正则单一来源 + Flow YAML 路径宽捕获显式拒绝）。

以前的问题：编排持有 5 份私有旧正则副本（handoff/gate/judge-facts/flow-state/flow-service）和 2 个本地正则（`run-role.ts` 的 flowId 谓词与 Flow YAML 路径），文案里还硬编码旧正则文本。它们与 Model 同值但无机制防漂移，正是本次缺陷（「文字与实现两份口径」）的同类土壤。

## 改动在哪（位置 → 改动）

### S2：`src/common/编排/`

| 文件 | 改动 |
| --- | --- |
| `governance-handoff.ts` | 私有 `GOVERNANCE_SLUG_PATTERN = /…{1,63}$/` → 值导入 Model 的 `GOVERNANCE_SLUG_PATTERN`（字符串，别名 `_SOURCE`）并 `new RegExp(SOURCE)` 构造；**导出形状仍是 `RegExp`**（`governance-judge-intent.ts` 与 `govern-session.ts` 薄再导出自动继承，不改语义）。`invalid-intent-id`/`invalid-flow-id` 文案改为插值现行正则。**意图文件 frontmatter 的非空非法 `flowId` → 既有 `invalid-flow-id` 显式拒绝**（`不得静默当作缺席`），不再静默当作 `undefined`；空/缺席保持原回落。 |
| `governance-gate.ts` | `SLUG_RE` 改为 `new RegExp(GOVERNANCE_SLUG_PATTERN)`；5 处拒绝文案（coordinate 的 flowId/stepId、write-flow、dispatch 的 flowId/stepId）由硬编码旧正则改为 `${GOVERNANCE_SLUG_PATTERN}` 插值；`parseFlowStepIds` 的注释同步。错误码与判定逻辑不变。 |
| `governance-judge-facts.ts` | 私有 `GOVERNANCE_FLOW_ID_RE` 改为由 Model 常量构造。 |
| `flow-state.ts` | 私有 `FLOW_ID_RE` 改为由 Model 常量构造；错误文案原本就经 `${FLOW_ID_RE}` 插值，自动显示新正则（文件名 flowId、步骤 id、evidence.ref、supersedes/supersededBy 均走同一判定）。 |
| `flow-service.ts` | 私有 `FLOW_ID_RE` 改为由 Model 常量构造（get/update/supersede/`completeAcceptanceStep`/`observeFlowArtifacts` 的 id 校验全部继承）。 |
| `governance-judge-intent.ts` | 复用 handoff 的 `RegExp` 自动继承新规则；**新增显式处理**：账本 `intent.handed-off` 或提案 frontmatter 中**非空但不符合现行 slug** 的 `intentId` 不再静默 `continue`/回落，返回 `intent-unconfirmed` fail-closed，detail 点名旧值与现行规则；空/缺席保持既有回落（账本→提案 frontmatter→`docs/intents/<flowId>.md`）。 |

`govern-session.ts` 的薄再导出未改一行（导出形状仍为 `RegExp`）。

### S3：`src/pipeline/orchestration/run-role.ts`

| 位置 | 改动 |
| --- | --- |
| `GOVERNANCE_FLOW_ID_RE` / `isGovernanceFlowId` | 正则改为 `new RegExp(GOVERNANCE_SLUG_PATTERN)`（值导入 Model，先例为同文件的 `governanceCardGroup`）；**本地谓词保留**（仅本文件使用，不新增跨模块公共面）。 |
| confirm 卡拒绝文案（原两处硬编码旧正则） | 改为插值 `${GOVERNANCE_SLUG_PATTERN}`，展示现行规则。 |
| `FLOW_YAML_PATH_RE` | 由「文件名必须是合法 slug」收紧型正则改为**宽捕获** `^docs\/flows\/([^/\\]+)\.(?:yaml|yml)$`。 |
| `validateFlowYamlCard` | 新增第一步：文件名候选先经 `isGovernanceFlowId` 判定；**不合法 ⇒ 记录失败并拒绝该卡**（明确写出候选值与现行规则），不再出现「`docs/flows/flow-.yaml` 不匹配路径正则 ⇒ 被当作非 Flow YAML 目标而静默跳过 YAML 校验」的旁路。合法候选继续走既有「卡片 flowId 一致 + preview 提取 YAML + `parseFlowStateYaml`」校验。 |

## 以前怎样 → 现在怎样

触发场景：治理角色在意图文件/工具参数/确认卡里使用了尾连字符值。

- **以前**：`flow-`、`a-`、`impl-`、`intent-` 能通过编排侧 slug 校验；`docs/flows/flow-.yaml` 因路径正则不匹配而被当作普通路径，**完全不进入** Flow YAML 校验；账本里旧的非法 `intentId` 被静默跳过，判断可能误回落其他意图来源。
- **现在**：
  - 编排门禁 `write-flow`/`write-nomination`/`dispatch`/`coordinate` 对 `flow-`/`impl-` 返回既有 `missing-flow-id`/`missing-step-id`（错误码不变），文案展示新正则；
  - `flow_get`/`flow_step_update`/`flow_step_supersede`/验收收口/artifact 观察对尾连字符 id 返回既有 `missing-*` 类错误，不读写 YAML；
  - 意图交接：入参 `intentId="intent-"`/`flowId="flow-"` → `invalid-intent-id`/`invalid-flow-id`；意图文件 frontmatter 非空非法 `flowId` → `invalid-flow-id`（不再静默当作缺席）；
  - Flow YAML 解析：文件名/步骤 id/evidence.ref/supersede 引用的非法值报**具体 path**（如 `steps[4].id`），不静默忽略；
  - 确认卡声明 `docs/flows/flow-.yaml` → **显式拒绝该卡**（不发卡、不发行写路径、不写账本），文案点名非法文件名与现行规则；
  - 判断意图基准：账本/提案里的非空非法 `intentId` → `intent-unconfirmed` fail-closed（detail 点名旧值），不静默跳过或回落；
  - **旧合法值零回归**：`flow-a`、`todo-list-v1`、`intent-a`、`a--b`（连续连字符）、2/64 位边界等行为与回执不变。

## 范围与兼容

- 这是**有意的共享契约值集合收紧**（设计 C1）：常量名称/类型/导出形状不变（`governance-handoff.ts` 的再导出仍是 `RegExp`），无字段/签名/工具数量变化。
- **不做**自动裁剪、重命名、迁移或账本改写；非法旧值一律显式报错（设计 C2）。真实项目存量数据审计（O4）未授权、未执行。
- 未改 N1–N5 守卫的判定链/错误码/`notPresented` 形状；Flow YAML 写前闸的拒绝仍沿用既有 `declined`（不标 `notPresented`——该标记属 N1 守卫，O1 未授权扩张）。
- 未改 Model/Provider/门禁引擎/测试角色文件；未 git 提交；未重启应用；未触碰 `todo-demo`。

## 验证（Windows 11 / Git Bash / Node v24.22.1，cwd `C:\Users\51054\Desktop\work\ans-studio`）

1. S2 定向（4 文件）：
   `node --test "test/编排/liaison-handoff.test.ts" "test/编排/governance-gate.test.ts" "test/编排/flow-state.test.ts" "test/编排/flow-service.test.ts"`
   → **87 tests / 87 pass / 0 fail，exit 0**。
2. 意图与证据包 + 运行时核心回归（5 文件）：
   `node --test "test/编排/decision-evidence-packet.test.ts" "test/编排/decision-intent-drift.test.ts" "test/编排/confirm-preview-completeness.test.ts" "test/runtime-core/governance-slug-pattern.test.ts" "test/runtime-core/governance-flow-metadata.test.ts"`
   → **45 tests / 45 pass / 0 fail，exit 0**。
3. S3 主套件（含新增 T9 尾连字符与 `docs/flows/flow-.yaml` 用例）：
   `node --test "test/编排/governance-judge.test.ts"`
   → **78 tests / 78 pass / 0 fail，exit 0**。
4. 运行时核心交接工具回归：
   `node --test "test/runtime-core/liaison-handoff-tools.test.ts" "test/runtime-core/tools.test.ts"`
   → **21 tests / 21 pass / 0 fail，exit 0**。
5. 本角色目录全量回归：
   `node --test "test/编排/*.test.ts"`
   → **725 tests / 724 pass / 1 fail / 0 skip，exit 1**。唯一失败为 **既有 Windows 环境红**：`shell-authorized-routine.test.ts` 的符号链接用例 `EPERM: operation not permitted, symlink`（本机无符号链接权限；该文件与本改动无关、未触碰）。其余全部通过。
6. 全仓类型检查：`npm run typecheck` → **exit 0，0 条错误**。
7. 旧正则残留：`grep -rn '{1,63}' src test app --exclude-dir=dist` → **无命中**；`src/common/编排/`、`src/pipeline/orchestration/` 内全部私有副本已改为 Model 常量构造（Model 定义除外）。测试中未保留旧正则字面量（S4 的测试侧改动属门禁引擎，并行进行中）。历史 memo/changelog 按仓库惯例不追改；现行契约 `api-spec.md` 已更新。

## 与设计的偏差

- 无实质偏差。两点说明：
  1. 设计 §3.2 称 `governance-gate.ts` 有「6 处文案」硬编码旧正则；实际为 5 处运行时拒绝文案 + 1 处注释（`parseFlowStepIds` 文档），均已同步。
  2. 设计未要求 Flow YAML 写前闸的拒绝改用 `notPresented`；本次保持既有 `declined` 形状（新增用例按此断言），避免越权扩张 O1/O4 的未授权口径。

## 未验证项与跨角色依赖

- **S4（门禁引擎测试）与 S5（跨角色端到端）**：不属于编排范围。S4 由门禁引擎在不阻塞本角色的前提下并行处理；S5 由测试角色后续完成。在两者落地前，「全仓所有入口对尾连字符的拒绝」尚无跨角色端到端证据。
- **真实入口未联调**：桌面窗口、CLI `ans govern`/`ans role run` 与真实模型轮次未在本轮运行；本轮只覆盖编排纯逻辑、`openRoleSession` 确认卡包装器与指定运行时核心回归。
- **真实项目旧数据**：仓库内无尾连字符存量（设计 §4.1）；真实项目迁移/审计（O4）未授权、未实施。
- **全仓全量测试未跑**：只按设计 S2/S3 与任务清单运行了编排目录与指定 runtime-core 文件；其他角色目录的基线红/绿未评估。

## 相关链接

- 权威设计（项目管理）：[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)
- S1 运行时核心变更：[Model 常量与 Provider 测试](../../../运行时核心/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen.md)
- 现行契约文本：[api-spec.md](../../api-spec.md)
- 功能导航：[feature-map.md](../../feature-map.md)
- 相关已验收守卫：[无效治理卡守卫变更记录](2026-10-22_change_invalid-governance-card-guard.md)
