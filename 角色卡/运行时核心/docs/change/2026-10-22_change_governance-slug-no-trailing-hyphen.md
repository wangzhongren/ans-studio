---
id: governance-slug-no-trailing-hyphen-s1
type: change
title: 收紧共享治理 slug 契约（S1：Model 常量 + Provider 测试/文档）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [governance-slug-no-trailing-hyphen, invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 按客户确认的设计 S1–S5 实施本角色 S1：GOVERNANCE_SLUG_PATTERN 收紧为禁止尾连字符；Provider 自动继承；新增/更新 runtime-core 测试；定向 34/34 通过、runtime-core 288 计 281 过（3 条既有 Windows symlink EPERM 环境红）、npm run typecheck exit 0；S2–S5 由编排/门禁引擎/测试角色实施
---

# 收紧共享治理 slug 契约（S1）

## 背景与范围

客户 2026-10-22 确认按[设计](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)的 **S1–S5 实施，O1–O4 全部不选**。本角色只负责 **S1**：共享 Model 常量、Provider 自动继承的测试与现行契约文档。S2/S3（编排）、S4（门禁引擎测试）、S5（测试角色端到端）不在本角色范围，本轮未触碰其文件。

设计要解决的问题：已验收的无效治理卡守卫设计把「首尾连字符」写成非法，但共享正则 `^[a-z0-9][a-z0-9-]{1,63}$` 实际允许尾连字符（`flow-`、`a-` 均匹配）。客户选择收紧正则、保持设计文字，作为独立共享变更实施。

## 改动在哪（位置 → 改动）

1. `src/model/runtime.ts`
   - `GOVERNANCE_SLUG_PATTERN` 由 `"^[a-z0-9][a-z0-9-]{1,63}$"` 改为 `"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$"`。
   - JSDoc 同步语义：**2–64 位，首尾均为小写字母/数字，内部可含连字符（连续连字符仍允许），禁止首/尾连字符**，并链接本次设计。
   - 常量类型仍为 `string`，名称/导出形状不变；`GovernanceFlowId`/`GovernanceStepId` 等类型零改动。
2. `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`
   - **未改产品逻辑**：`tools.ts` 用 `new RegExp(GOVERNANCE_SLUG_PATTERN)`，`schema.ts` 的 10 处 `pattern: GOVERNANCE_SLUG_PATTERN` 直接引用常量，均自动继承；未复制第二份正则。
   - 已核对两文件无旧正则硬编码文本，注释无需改动。
3. 测试（`test/runtime-core/`）
   - 新增 `governance-slug-pattern.test.ts`（4 例）：
     - T1/T2：常量逐字等于新值；§2.2 正反例全表（`flow-a`/`a-b`/`ab`/`todo-list-v1`/`1-a`/`a-1` 接受；单字符、65 位、`flow-`、`a-`、`flow--`、`-flow`、`Flow`、`a_b`、空串、`flow-\n` 拒绝）；`a--b` 与 64 位接受。
     - T3：五个工具（`request_confirmation`/`request_choice`/`dispatch_task`/`hand_off_intent`/`request_clarification`）的 slug `pattern` 全部等于 Model 常量；治理元数据字段可选性不变（`hand_off_intent.intentId` 仍必填）。
     - T4：五个工具分别给 `flow-`/`a-`/`impl-`/`intent-` ⇒ `ok:false`、点名字段并展示新正则；客户通道/派发/交接/澄清能力调用数均为 0。
     - T4b：合法 slug（`ab`/`a-b`/`a--b`/64 位等）在五个工具原样透传，既有合法值零回归。
   - `governance-flow-metadata.test.ts`：`request_confirmation` 非法矩阵增 `flowId="flow-"`、`flowId="a-"`、`stepId="impl-"`；`dispatch_task` 增 `flowId="flow-"` 与 `stepId="impl-"` 拒绝（并断言文案含新正则，非法值不触达派发）。
   - `liaison-handoff-tools.test.ts`：`hand_off_intent` 增 `intentId="intent-"`、`flowId="flow-"`；`request_clarification` 增 `flowId="a-"`、`intentId="intent-"`。
   - `tools.test.ts` 未改：该文件不含 slug/治理字段断言，本次行为已由上列文件覆盖，避免重复用例。
4. `角色卡/运行时核心/api-spec.md`
   - 现行契约文本（治理三权协作 W0 段）改为新正则，并注明 2026-10-22 收紧语义与本次变更链接。
   - 历史 memo/changelog 条目按仓库惯例不追改。

## 以前怎样 → 现在怎样

- **以前**：`flowId`/`stepId`/`intentId` 给 `flow-`、`a-`、`impl-`、`intent-` 能通过 Provider 形状校验（尾连字符被允许）。
- **现在**：这些值在 Provider handler 触达客户通道/派发/交接/澄清能力之前被拒绝（`ok:false`，文案点名字段并展示新正则）；JSON Schema `pattern` 同步收紧，支持 `pattern` 的客户端会更早拒绝。
- **接受集合**：2–64 位、首尾字母数字、内部可含连字符；`a--b` 等连续连字符仍合法；`ab`（最短）、64 位（最长）合法。
- **不变**：缺席治理字段＝旧调用零变化；字段形状/`required`/枚举/工具数量/`executionMode`/Service/Adapter/桌面代码均未改；合法 slug 的行为与回执不变。

## 范围与兼容

- 这是**有意的共享契约值集合收紧**（设计 C1）：常量名称、类型、导出形状不变，无字段/签名变化。
- 仓库内既有合法 slug（`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`f`、`s1`、`impl`、`verification`、`acceptance` 等）均在新正则合法集合内；本角色测试与全目录回归未见新增红。
- **跨角色未完成（不在本轮）**：编排侧仍有私有旧正则副本（`governance-handoff.ts` 的 `GOVERNANCE_SLUG_PATTERN`、`governance-gate.ts` 的 `SLUG_RE`、`flow-state.ts`/`flow-service.ts` 的 `FLOW_ID_RE`、`run-role.ts` 的本地谓词/文案），门禁引擎测试仍硬编码旧正则。在这些 S2/S3/S4 落地前，编排/门禁路径对尾连字符的拒绝尚未收紧，端到端（S5）也未验证。本角色未越界修改。

## 验证（Windows 11 / Git Bash / Node v24.22.1，cwd `C:\Users\51054\Desktop\work\ans-studio`）

1. 设计 S1 列出的定向测试（含新增文件）：
   `node --test "test/runtime-core/governance-slug-pattern.test.ts" "test/runtime-core/governance-flow-metadata.test.ts" "test/runtime-core/liaison-handoff-tools.test.ts" "test/runtime-core/tools.test.ts"`
   → **34 tests / 34 pass / 0 fail / 0 skip，exit 0**。
2. 新增文件单跑：`node --test "test/runtime-core/governance-slug-pattern.test.ts"` → **4/4 pass，exit 0**。
3. 本角色目录回归：`node --test "test/runtime-core/*.test.ts"`
   → **288 tests / 281 pass / 3 fail / 4 skip，exit 1**。3 条红均为本机 Windows 无符号链接权限的既有环境红：`file-write-safety.test.ts` 的 D3 链接用例 1 条、`session-store.test.ts` 的 symlink 用例 2 条（均 `EPERM: operation not permitted, symlink`），与本改动无关；相对本批前基线（284 计/277 过/3 红/4 skip）恰 +4 计/+4 过，**无新增红**。
4. 全仓类型检查：`npm run typecheck` → **exit 0，0 条错误**（首次运行曾报本测试文件 1 条 `never` 类型错，修正后复跑通过；不是放宽断言）。

未跑真实模型/凭据/网络；未启动或重启应用；未 git 提交；未触碰 `todo-demo`；未修改其他角色文件。

## 未验证项与跨角色依赖

- **跨层端到端未验证**：编排 S2/S3、门禁 S4、测试角色 S5 未实施；真实治理轮次中，编排门禁/Flow YAML/意图路径对尾连字符的拒绝仍取决于其私有副本。只有 Provider 层（本角色）已收紧。
- **真实入口未联调**：桌面/CLI 客户通道、三适配器与真实模型轮次未在本轮运行；本报告只证明 Provider handler、schema 与 Model 常量。
- **旧数据兼容**：仓库内无尾连字符存量（设计 §4.1 只读审计）；真实项目数据的迁移/审计（O4）未授权、未实施；本变更不做自动裁剪或重命名。

## 相关链接

- 权威设计（项目管理）：[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)
- 现行契约文本：[api-spec.md](../../api-spec.md)
- 当前功能与流程：[同一套治理工具与隔离会话](../feature/runtime-core.md)
- 相关已验收守卫：[无效治理卡守卫变更记录](2026-10-22_change_invalid-governance-card-receipt.md)
