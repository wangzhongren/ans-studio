---
id: governance-slug-no-trailing-hyphen
type: design
title: 收紧共享治理 slug 契约——禁止尾连字符（GOVERNANCE_SLUG_PATTERN）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: accepted
revision: 1
related: [invalid-governance-card-guard, governance-trio-review, governance-liaison-review, judge-governance-cards-review]
events:
  - date: "2026-10-22"
    kind: created
    summary: 客户在无效治理卡守卫 N1–N5 验收后选择收紧共享 GOVERNANCE_SLUG_PATTERN、禁止尾连字符，并作为独立共享变更另走方案/审核/确认/实施流程；本文件只写设计（现状、精确规则、单一来源与归属、兼容迁移、测试矩阵、必需项/可选项、影响与风险），未改代码、未测试、未验收
  - date: "2026-10-22"
    kind: customer-confirmed
    summary: 客户确认按 S1–S5 实施、O1–O4 均不选；该确认是设计与实施范围确认，不构成实施完成、测试通过或验收结论
---

# 收紧共享治理 slug 契约——禁止尾连字符

**本轮性质：设计文档（已获客户确认，status: accepted）。** 客户 2026-10-22 在无效治理卡守卫 N1–N5 的验收后明确选择：**收紧共享 `GOVERNANCE_SLUG_PATTERN`，禁止尾连字符**，并作为**独立的共享变更**另走方案/审核/确认/实施流程；不并入已验收的 N1–N5。客户已于 2026-10-22 确认按本文 **S1–S5 实施、O1–O4 均不选**；该确认是设计与实施范围确认，**不代表已实现、已测试或已验收**。本文后续只做文档修订，不改产品代码、测试或其他角色文件；未实施、未测试、未提交 Git；不触碰 todo-demo，不重启应用。已验收的 N1–N5 守卫设计与实现不在本方案修改范围。

## 一、问题与目标

### 1.1 现状：设计文字与正则不一致

| 来源 | 现行表述/行为 |
| --- | --- |
| 守卫设计 `2026-10-22_design_invalid-governance-card-guard.md` §4.3 | 格式为 `^[a-z0-9][a-z0-9-]{1,63}$`，同段文字称「大小写、下划线、**首尾连字符**、单字符、超长一律非法」 |
| 当前 Model `GOVERNANCE_SLUG_PATTERN`（`src/model/runtime.ts:136`） | `"^[a-z0-9][a-z0-9-]{1,63}$"` |
| 实际行为 | `flow-`、`a-`、`flow--` 均匹配（**尾连字符被允许**）；`-flow`、`Flow`、`a_b`、单字符、65 字符被拒绝 |
| 独立验收 `2026-10-22_change_invalid-governance-card-acceptance.md` §7.3 / F2 | 按「格式=正则」**受限通过**；明确未声称「尾连字符非法」已满足，交项目管理/客户澄清 |
| 客户决定（2026-10-22） | **按设计文字收紧正则，不修正文字**；作为独立共享变更另行授权与实施 |

这不是守卫 N1–N5 的局部缺陷，而是**共享 Model 契约**（`GOVERNANCE_SLUG_PATTERN`）与已验收设计文字之间的口径差。修改它会同时影响 `flowId` / `stepId` / `intentId` 等**所有**使用 slug 的入口，因此必须按共享变更走方案、审核、客户确认与派发实施。

### 1.2 为什么禁止尾连字符

1. **口径一致性**：守卫设计 §4.3 已把「尾连字符」写为非法；实现与验收按正则受限通过。收紧正则使实现、设计文字与最终验收口径一致，是客户明确选择的关闭方式。
2. **标识符质量**：slug 同时用作文件名（`docs/flows/<flowId>.yaml`、`docs/intents/<intentId>.md`）、账本匹配键与派发去重键。尾连字符不增加表达力，易被模型/复制粘贴当作「未完成的连接词」，在人工阅读与跨文件比对时产生歧义（`flow-` 与 `flow` 视觉相近）。
3. **不改变已有合法集合的语义**：本次只去掉「末尾连字符」这一形状，短长度、首字符、内部连字符与连续连字符的语义均保持不变（见 §2），不会重新解释任何合法 id。

这不是安全漏洞修复，也不改变任何权限或治理判定；它是一次**共享契约收紧**。

### 1.3 目标

1. 把共享 `GOVERNANCE_SLUG_PATTERN` 收紧为「首尾均为小写字母/数字，长度 2–64，内部可含连字符，**不允许尾连字符**」。
2. 让所有消费点从**单一来源**（Model 常量）派生校验，不再保留各自硬编码的同值副本；内嵌到错误文案中的正则文本也必须随常量更新。
3. 对旧值**显式拒绝或显式报告**，不得静默裁剪、重命名或改写；不自动迁移账本/流程 YAML。
4. 现有合法 slug 零回归；N1–N5 已验收行为除「多拒绝一种非法形状」外零变化。

### 1.4 受影响的入口（所有使用 slug 的地方）

| 入口/载体 | 字段 | 现行校验点 | 本变更后的行为 |
| --- | --- | --- | --- |
| `request_confirmation` | `flowId`、`stepId` | Provider schema `pattern` + handler `readGovernanceSlugArg` | 自动继承新正则；`flow-`/`a-` 在触达客户通道前拒绝 |
| `request_choice` | `flowId`、`stepId` | 同上 | 同上 |
| `dispatch_task` | `flowId`、`stepId` | 同上 + 编排派发门禁 | 同上 |
| `hand_off_intent` | `intentId`、`flowId` | Provider schema/handler + 编排 `validateIntentHandoff` | 同上；意图文件 frontmatter 的非空非法 `flowId` 显式报错 |
| `request_clarification` | `flowId`、`intentId` | Provider + 编排 | 同上 |
| `flow_get` | `flowId` | `flow-service.resolveFlowId`（无 schema `pattern`） | 服务端校验收紧 |
| `flow_step_update` | `flowId`、`stepId` | `flow-service` | 服务端校验收紧 |
| `flow_step_supersede` | `flowId`、`oldStepId`、`newStepId` | `flow-service` | 服务端校验收紧 |
| 治理门禁 `write-flow` / `write-nomination` / `write-role-card` / `dispatch` / `coordinate` | `flowId`、`stepId` | `governance-gate.ts::SLUG_RE` | 收紧；错误码不变 |
| Flow YAML | 文件名 `flowId`、顶层 `flowId`、步骤 `id`、`evidence.ref`、`supersedes`/`supersededBy` 引用 | `flow-state.ts::FLOW_ID_RE` | 收紧；非法值报具体 path |
| 意图记录 | 文件名 `intentId`、frontmatter `intentId`/`flowId` | `governance-handoff.ts` | 收紧；非空非法值显式报错 |
| 确认卡声明路径 | `docs/flows/<flowId>.yaml` | `run-role.ts::FLOW_YAML_PATH_RE` + `validateFlowYamlCard` | 宽捕获候选路径 + 显式按新 slug 拒绝，**不得静默忽略**（见 §3.4） |
| 治理账本 | `flowId`、`stepId`、`intentId` | 读取只校验 `at/kind/actorRoleId/power`，不校验 slug | 历史行保持可读；消费方对非空非法值显式处理（见 §4.2） |
| 会话回放 | 事件 metadata | 未发现重新校验 slug 的消费点 | 历史回放显示不变（见 §4.2） |
| 卡面/镜像/下一步推导 | 仅消费已校验字段 | — | 零改动 |

### 1.5 非目标

- 不修改 N1–N5 守卫设计或实现；不改变缺字段/角色白名单/判断链/镜像/账本语义。
- 不新增或删除任何字段，不改变角色权限、写边界、预授权目录。
- 不禁止**连续**连字符（`a--b` 仍合法；如需更严格见 O2）。
- 不做自动迁移、自动重命名、账本改写或「裁剪尾连字符」；不把旧值静默解释成新值。
- 不改 `app/`（桌面窗口/桌面UI）、适配器、Service 装配的代码；不触碰 todo-demo；不重启应用。
- 不修正历史设计/验收文档的既有记录（历史文档按仓库惯例不追改；新变更单独记录，见 §7.1）。

## 二、精确规则

### 2.1 建议正则

```text
旧：^[a-z0-9][a-z0-9-]{1,63}$
新：^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$
```

逐项对照：

| 语义 | 旧正则 | 新正则 | 说明 |
| --- | --- | --- | --- |
| 首字符 | `[a-z0-9]` | `[a-z0-9]` | 不变 |
| 末字符 | 允许 `[a-z0-9-]` | 必须 `[a-z0-9]` | **唯一变化：禁止尾连字符** |
| 中间字符 | `{1,63}` | `{0,62}` | 仍允许小写字母/数字/连字符，含连续连字符 |
| 最短长度 | 2（首 + 至少 1 中间） | 2（首 + 末） | 单字符仍非法 |
| 最长长度 | 64（1 + 63） | 64（1 + 62 + 1） | 不变 |
| 大小写/下划线/Unicode | 非法 | 非法 | 不变 |
| 首连字符 | 非法 | 非法 | 不变 |

说明：

- 该正则等价于「首字符字母数字 + 可选中间段（0–62 个 `[a-z0-9-]`）+ 末字符字母数字」，总长 2–64。
- 无 flags；`^`/`$` 锚定；同时适用于 JS `RegExp` 与 JSON Schema `pattern`（ECMA-262）。
- 不新增 `trim`/`normalize`/Unicode 归一化：现有各处是否 `trim` 由各入口原逻辑决定，本变更不改变。
- `GOVERNANCE_SLUG_PATTERN` 仍为**字符串**常量（Provider 直接用于 JSON Schema `pattern`，编排侧用 `new RegExp(...)` 编译）。

### 2.2 正反例（逐条）

| 值 | 结果 | 理由 |
| --- | --- | --- |
| `flow-a` | 接受 | 首尾字母数字，内部连字符 |
| `a-b` | 接受 | 最短 3 字符 |
| `ab` | 接受 | 最短 2 字符 |
| `todo-list-v1` | 接受 | 真实流程 id 形状 |
| `a--b` | 接受 | 连续连字符语义**不变**（客户本次只要求禁尾连字符） |
| `1-a`、`a-1` | 接受 | 首/尾均为字母数字 |
| `a`（单字符） | 拒绝 | 最短长度仍为 2 |
| 64 字符（如 `a`×64） | 接受 | 最长 64 不变 |
| 65 字符 | 拒绝 | 超长 |
| `flow-` | 拒绝 | **尾连字符**（本变更目标） |
| `a-` | 拒绝 | 尾连字符 |
| `flow--` | 拒绝 | 末尾仍是连字符（即使连续连字符合法，也不能以连字符结尾） |
| `-flow` | 拒绝 | 首连字符 |
| `Flow` | 拒绝 | 大写 |
| `a_b` | 拒绝 | 下划线 |
| 空串 | 拒绝 | 长度不足 |
| `flow-\n` | 拒绝 | 换行不是 `[a-z0-9]`，且现有入口不会静默 trim 换行 |

### 2.3 连续连字符的取舍

**默认保留现状（允许连续连字符）**，理由：

1. 客户本次只选择「禁止尾连字符」，未要求收紧内部连字符；扩大变更面会偏离授权。
2. 现有设计文字只点名「首尾连字符」，没有把 `--` 列为非法。
3. 客户本次未要求收紧内部连字符；仓库现有夹具中也未见依赖 `--` 的 id（如客户需要，可另行审计）。收紧内部连字符会误伤理论上的既有 id，收益不明确。
4. 连续连字符不会造成 `flow--` 这类**结尾**歧义——`flow--` 已被新正则拒绝，因为末字符必须是字母数字。

若客户希望进一步禁止连续连字符，见 O2；该选项会改变更多既有合法值，默认不纳入。

### 2.4 错误表现与「不静默」原则

- 所有拒绝必须**点名字段与值**，并展示**新**正则（从常量插值，不硬编码）。
- 不做 `trimEnd("-")`、不做自动补字符、不做大小写转换、不把非法值降级为 `undefined`。
- 工具回执保持既有形状（`ok:false` + 可操作原因）；编排拒绝保持既有 `declined`/`deny` 形状与错误码，不新增客户可见卡。
- 对历史数据：Flow YAML/意图文件的非法值报具体 path；账本中的非空非法值显式处理（§4.2），不得静默跳过。

## 三、单一来源与归属

### 3.1 主属与共享契约

- **主属：运行时核心（Model）**。`src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN` 是四个运行层共享的中立契约（项目规则 §一.2/§一.3：Model 由四层共享、不属于调用链）；其他角色只读引用。
- 本次是**值集合收紧**，不是形状/API 变更：常量仍是 `string`；`govern-session.ts` 对 `GOVERNANCE_SLUG_PATTERN`（编排 `governance-handoff.ts` 导出的 `RegExp`）的薄再导出保持原形状，桌面消费方零改动。
- 编排改为**值导入** Model 常量有既有先例：`run-role.ts` 已值导入 `governanceCardGroup`（`src/model/runtime.ts`）；项目规则允许各层只读引用 Model。原先注释「不导运行时实现」指的是不导入 Service/Provider 等**运行层实现**，Model 不是运行层，值导入不违反五层调用方向。

### 3.2 消费点清单（已核对，含精确位置）

| 位置 | 现状 | 角色归属 |
| --- | --- | --- |
| `src/model/runtime.ts:135-136` | `GOVERNANCE_SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{1,63}$"`（字符串主属） | 运行时核心 |
| `src/provider/runtime/schema.ts:2,172,180,264,270,374,380,428,448,480,485` | 10 处 `pattern: GOVERNANCE_SLUG_PATTERN`（confirm/choice/dispatch/hand_off_intent/request_clarification） | 运行时核心 |
| `src/provider/runtime/tools.ts:56,214,228`（另 1748/1801 复用 `readGovernanceSlugArg`） | `new RegExp(GOVERNANCE_SLUG_PATTERN)` + 文案插值常量 | 运行时核心 |
| `src/common/编排/governance-handoff.ts:34,94,260,294,375` | 私有 `GOVERNANCE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/`（RegExp） | 编排 |
| `src/common/编排/governance-gate.ts:58-59,143,146,157,203,251,254,329` | 私有 `SLUG_RE` + 6 处文案硬编码旧正则 | 编排 |
| `src/common/编排/governance-judge-facts.ts:29` | 私有 `GOVERNANCE_FLOW_ID_RE` | 编排 |
| `src/common/编排/flow-state.ts:60,263,336,393,430,448` | 私有 `FLOW_ID_RE` | 编排 |
| `src/common/编排/flow-service.ts:100,297,350,499,502,626,791` | 私有 `FLOW_ID_RE` | 编排 |
| `src/common/编排/governance-judge-intent.ts:17,107,127` | 复用 handoff 的 RegExp；非法 `intentId` 目前静默 `continue`/回落 | 编排 |
| `src/pipeline/orchestration/run-role.ts:801,823,1815-1819,1825` | 本地 `GOVERNANCE_FLOW_ID_RE`/`isGovernanceFlowId`；`FLOW_YAML_PATH_RE`；2 处文案硬编码旧正则 | 编排 |
| `src/pipeline/orchestration/govern-session.ts:119-128` | 薄再导出 handoff 的 `GOVERNANCE_SLUG_PATTERN`（RegExp） | 编排 |
| `test/门禁引擎/governance-standard-workflow.test.ts:230` | 测试侧硬编码 `/^[a-z0-9][a-z0-9-]{1,63}$/` | 门禁引擎 |
| `test/runtime-core/governance-flow-metadata.test.ts:217-218`、`test/runtime-core/liaison-handoff-tools.test.ts:42-43,59-60` | 断言 schema `pattern` 等于 Model 常量（自动随常量变化） | 运行时核心 |
| `角色卡/运行时核心/api-spec.md:79`、`角色卡/编排/api-spec.md:448` | 现行契约文档写入旧正则文本 | 运行时核心 / 编排 |
| 历史 memo/changelog（如 `角色卡/运行时核心/memo.md:58`、`角色卡/编排/memo.md:111`、`角色卡/运行时核心/changelog.md:152`） | 历史实施记录含旧正则 | 各自角色；**按惯例不追改历史记录** |

已核对 `app/`（桌面窗口/桌面UI）无 `a-z0-9.*1,63` 命中、无 `GOVERNANCE_SLUG_PATTERN` 命中；`src/service/runtime/session.ts` 无该模式；适配器无该模式。因此应用/桌面/适配器**不需要改代码**。

### 3.3 逐文件改动与 Section 1 依据

> 「Section 1 依据」指各角色 `boundary.md`/`boundary.yaml` 的写入白名单；实际实施仍须属于本次已授权的精确任务范围。

| ID | 角色 | 文件 | 改动 | Section 1 依据 |
| --- | --- | --- | --- | --- |
| **S1** | 运行时核心 | `src/model/runtime.ts` | `GOVERNANCE_SLUG_PATTERN` 改为 `"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$"`；JSDoc 注释同步；这是**唯一**的产品代码定义改动 | 单文件 `src/model/runtime.ts` |
| S1 | 运行时核心 | `src/provider/runtime/tools.ts`、`schema.ts` | **无需改产品逻辑**：tools 用 `new RegExp(GOVERNANCE_SLUG_PATTERN)`，schema 直接引用常量，均自动继承；仅按需校对注释 | 单文件 `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` |
| S1 | 运行时核心 | `test/runtime-core/governance-flow-metadata.test.ts`、`tools.test.ts`、`liaison-handoff-tools.test.ts`（必要时 `governance-judge.test.ts`） | 新增正则单测与 `flow-`/`a-`/`impl-`/`intent-` 负例；既有 schema 相等断言自动适配；保留旧合法 slug 正例 | 目录 `test/runtime-core/` |
| S2 | 编排 | `src/common/编排/governance-handoff.ts` | 值导入 Model 字符串（别名），`export const GOVERNANCE_SLUG_PATTERN = new RegExp(SOURCE)` 保持既有 RegExp 导出形状；`fileFlowId` 非空但不合法 ⇒ 返回既有 `invalid-flow-id`，不得静默当作缺席 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `src/common/编排/governance-gate.ts` | `SLUG_RE` 改为由 Model 常量构造；6 处文案改用常量插值（不再硬编码）；注释同步 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `src/common/编排/governance-judge-facts.ts` | 私有 `GOVERNANCE_FLOW_ID_RE` 改为由 Model 常量构造 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `src/common/编排/flow-state.ts` | 私有 `FLOW_ID_RE` 改为由 Model 常量构造；错误文案经 `${FLOW_ID_RE}` 自动显示新正则 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `src/common/编排/flow-service.ts` | 私有 `FLOW_ID_RE` 改为由 Model 常量构造 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `src/common/编排/governance-judge-intent.ts` | 复用 handoff 的 RegExp 自动继承；新增显式处理：账本 `intent.handed-off` 或提案 frontmatter 中**非空**但不符合现行 slug 的 `intentId`，不得静默跳过/回落，返回 fail-closed（`intent-unconfirmed`，detail 说明旧值不符合现行规则）；空/缺席保持既有回落 | 目录（私有）`src/common/编排/` |
| S2 | 编排 | `test/编排/liaison-handoff.test.ts`、`governance-gate.test.ts`、`flow-state.test.ts`、`flow-service.test.ts`、`decision-intent-drift.test.ts`（或 `decision-evidence-packet.test.ts`） | 新增尾连字符负例、旧合法正例与意图旧值显式处理用例 | 目录（测试）`test/编排/` |
| **S3** | 编排 | `src/pipeline/orchestration/run-role.ts` | `GOVERNANCE_FLOW_ID_RE` 改由 Model 常量构造（`isGovernanceFlowId` 保留本地谓词）；`FLOW_YAML_PATH_RE` 改为**宽捕获** `docs/flows/<单段候选>.yaml` / `.yml`，在 `validateFlowYamlCard` 内用 `isGovernanceFlowId` 显式拒绝非法 id（见 §3.4）；801/823 两处文案改用常量插值；注释同步 | 单文件 `src/pipeline/orchestration/run-role.ts` |
| S3 | 编排 | `test/编排/governance-judge.test.ts`、`flow-state.test.ts`、`confirm-preview-completeness.test.ts` | T9 增加 `flow-`/`a-`；新增声明 `docs/flows/flow-.yaml` 被显式拒绝（而非静默忽略）的用例 | 目录（测试）`test/编排/` |
| **S4** | 门禁引擎 | `test/门禁引擎/governance-standard-workflow.test.ts:230` | 删除测试侧硬编码旧正则；改为引用 Model 常量的 `new RegExp(GOVERNANCE_SLUG_PATTERN)`；补一个尾连字符负例 | 目录（测试）`test/门禁引擎/` |
| **S5** | 测试 | `test/测试/governance-e2e-auto/`（新增用例或并入现有场景） | 跨角色端到端：治理角色发 `flowId: "flow-"`/`a-`、`stepId: "impl-"`、`intentId: "intent-"` ⇒ 工具失败、零呈现/零判断/零账本；合法 slug 全链路可用 | 目录（测试）`test/测试/` |
| S1/S2 | 运行时核心 / 编排 | `角色卡/运行时核心/api-spec.md:79`、`角色卡/编排/api-spec.md:448` | 现行契约文本改为新正则；实施时在各自 `changelog.md` 新增记录，历史 memo/changelog 条目不改写 | 各自 `boundary.md` Section 1 的文档文件 |
| — | 项目管理 | `角色卡/项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md` | 本文（设计）；不改其他文件 | 目录 `角色卡/项目管理/docs/design/` |

**自动继承、无需改产品代码的消费方（实施时仅需测试确认/文档校对）：** `src/common/编排/governance-judge.ts`、`governance-judge-evidence.ts`（经 `isGovernanceJudgeFlowId`）、`src/pipeline/orchestration/govern-session.ts`（薄再导出）、`src/provider/runtime/tools.ts`/`schema.ts`（Provider 已直接引用常量）、`src/common/编排/governance-judge-intent.ts` 的 RegExp 使用点（Legacy 处理除外，见 S2）。它们不持有独立正则副本，因此不产生新的定义来源。

### 3.4 编排为什么改为 import Model，而不是保留同步副本

- **单一来源**：现在有 5 个编排私有副本 + 1 个路径正则 + Provider/测试引用；它们今天同值，但没有任何机制阻止漂移。本次缺陷的本质就是「文字与实现两份口径」。改为从 Model 构造是唯一能结构性消除同类漂移的方式。
- **不违反分层**：Model 是四层共享的中立契约，不是运行层；`run-role.ts` 已值导入 `governanceCardGroup`，先例明确。编排不导入 Service/Provider 实现，调用方向不变。
- **导出形状不变**：`governance-handoff.ts` 仍导出 `RegExp`（供 `governance-judge-intent.ts` 与 `govern-session.ts` 再导出）；只是其构造源改为 Model 字符串。桌面若未来消费该再导出，形状不变。
- **`isGovernanceFlowId` 是否改为调用单一来源**：其**正则**必须由 Model 常量构造；谓词本身保留在 `run-role.ts`（仅本文件使用），不为其新增跨模块公共面。若后续希望统一谓词，见 O3。
- **`FLOW_YAML_PATH_RE` 的特殊处理（关键）**：若只是把捕获组换成新正则，`docs/flows/flow-.yaml` 将**不再被识别为 Flow YAML 目标**，从而绕过 `validateFlowYamlCard` 的 YAML 校验——这是不可接受的静默旁路。因此改为：
  1. 路径正则宽捕获单段候选：`^docs\/flows\/([^/\\]+)\.(?:yaml|yml)$`；
  2. 在 `validateFlowYamlCard` 内先判 `isGovernanceFlowId(target.flowId)`；不合法 ⇒ 记录失败并拒绝该卡（明确写出候选值与新规则），而不是 `continue` 跳过；
  3. 合法候选继续走既有「与卡片 flowId 一致 + preview 提取 YAML + `parseFlowStateYaml`」校验。
  这样既保持单一来源，又堵住「非法文件名绕过 YAML 校验」的旁路。

### 3.5 跨角色契约

| ID | 契约 | 主属/提供方 | 消费方 | 兼容性 |
| --- | --- | --- | --- | --- |
| **C1** | `GOVERNANCE_SLUG_PATTERN` 的可接受值集合收紧为 §2.1；常量类型/名称/导出形状不变 | 运行时核心（Model） | Provider（schema/handler）、编排（gate/handoff/judge/flow/run-role）、门禁引擎测试、测试角色 | 值集合变更是**有意的共享契约变更**；无字段/签名变化；缺失字段的旧调用语义不变 |
| **C2** | 旧值不得静默重解释：非空非法值显式拒绝/显式报告；不自动裁剪、不重命名、不改写账本/流程 YAML | 运行时核心 + 编排（按数据面） | 桌面窗口（仅读取继承）、独立验收 | 历史回放零行为变化；旧项目若含尾连字符 id 需人工迁移（见 §4） |

不需要冻结新的接口面、版本号或迁移脚本；若实施中发现需要新增公共函数/字段，属另一件共享变更，须先回项目管理协调。

## 四、兼容与迁移

### 4.1 仓库内审计结果（只读）

**存量值扫描**（尾连字符 `flowId`/`stepId`/`intentId`）：均**无命中**。**正则副本扫描**：命中 Model、Provider 引用、编排 5 个私有副本、`run-role.ts` 的 2 个正则、`test/门禁引擎/governance-standard-workflow.test.ts:230`，以及角色文档/历史报告；`app/`、`src/service/`、适配器无命中。

- `grep -rn 'a-z0-9.*1,63' src app test`：命中 Model、Provider 引用、编排 5 个私有副本、`run-role.ts` 的 2 个正则、`test/门禁引擎/governance-standard-workflow.test.ts:230`，以及角色文档/历史报告；`app/`、`src/service/`、适配器无命中。
- `grep -rn '(flowId|stepId|intentId)\s*[:=]\s*["'\''][^"'\'']*-["'\'']'`：**无命中**（无引号包裹的尾连字符 id）。
- `grep -rn '^(flowId|stepId|intentId):\s*[a-z0-9-]+-\s*$'`：**无命中**（无 YAML frontmatter/Flow YAML 中的尾连字符 id）。
- `Glob docs/flows/*.{yaml,yml}`、`**/docs/flows/*.{yaml,yml}`：仓库内**没有提交的** Flow YAML 文件（流程文件由测试临时目录/真实项目生成）。
- 测试夹具抽查：`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`f`、`s1`、`impl`、`verification`、`acceptance` 等均为新正则合法值。
- 说明：`app/desktop/recovery-channel.ts` 的 `idPrefix: "rp-"`、`operator-channel.ts` 的 `"sc-"` 是应用内部 request id 前缀，不是治理 slug，不受影响。

**结论**：仓库内现有夹具/测试对收紧后正则**预期零回归**；真实项目的旧数据不在仓库内，需另行评估（O4）。

### 4.2 旧值处理策略（逐数据类型）

| 数据类型 | 读取行为 | 写入行为 | 是否静默重解释 |
| --- | --- | --- | --- |
| 新工具调用（`request_*`/`dispatch_task`/`hand_off_intent`/`request_clarification`） | Provider handler 校验；非法即 `ok:false` | 不会触达客户通道/派发/能力 | 否 |
| 新 Flow 工具调用（`flow_get`/`flow_step_update`/`flow_step_supersede`） | `flow-service` 校验；非法即 `missing-flow-id` 等 | 不写 YAML | 否 |
| 新治理门禁输入（`flowId`/`stepId`） | `governance-gate` 校验；非法即 deny（错误码不变） | 不放行写盘/派发 | 否 |
| 既有 Flow YAML（`docs/flows/<id>.yaml`） | `parseFlowStateYaml` 以文件名 `flowId` + 顶层 `flowId` + 步骤 id + evidence 引用做校验；尾连字符旧值 ⇒ **具体 path 报错、fail-closed** | 不自动重命名/不自动改内容 | 否（显式报错） |
| 旧 Markdown 流程（YAML 缺失时的回落） | `parseFlowStepIds` 用同一 slug 规则；旧尾连字符步骤 id 不再被识别 ⇒ 派发门禁报「步骤不存在」 | 不写盘 | 否（fail-closed） |
| 意图文件（`docs/intents/<intentId>.md`） | 新交接校验拒绝非法入参；frontmatter 非空非法 `flowId` 显式 `invalid-flow-id` | 不写盘 | 否 |
| 治理账本（append-only） | `entryShapeError` 只要求 `at/kind/actorRoleId/power`，**不校验 slug**；历史行可读 | 不重写历史行 | 消费方需显式处理，见下 |
| 账本中的 `intent.handed-off.intentId` | 新规则下非空非法值不得静默 `continue`；`resolveIntentReference` 返回 `intent-unconfirmed`（detail 点名旧值与新规则） | — | 否（fail-closed） |
| 提案 frontmatter 的 `intentId` | 非空非法值不得静默回落 `flow-id`；同上显式失败 | — | 否 |
| 会话回放/历史会话 | 已核对回放链路无 slug 重新校验；旧事件/卡片 metadata 原样显示 | — | 否 |
| 确认卡声明路径 `docs/flows/<id>.yaml` | 宽捕获候选后显式校验；非法即拒绝该卡 | 不发行写入路径 | 否 |
| JSON Schema `pattern` | Provider schema 自动展示新正则；客户端可能更早拒绝 | — | 否 |

> 账本本身是**历史事实**，不因本次收紧而改写；但消费方（判断意图基准、门禁）必须对旧值做**显式**处理，不能把「不符合现行 slug」误当成「没有意图」而静默换用其他来源。

### 4.3 读取兼容 vs 拒绝：建议

**默认采用「读写同一严格正则 + 显式拒绝」**：

1. 设计文字自始就称尾连字符非法；仓库内无存量，严格口径最一致。
2. 双正则（读取宽 / 写入严）会产生第二份形状来源，正是本次要消除的漂移类型；且会让「旧值可用、新值不可用」的边界长期存在。
3. fail-closed 与治理链既有原则一致；错误信息点名具体值，客户/角色可据此手工修正。

如果客户真实项目确有尾连字符 id，建议在实施前选择 O4（只读审计）评估；如确需过渡期，再选择 O1（读取兼容双正则）。**O1 也不得自动裁剪或重命名旧值**，只允许在读取路径识别旧形状并记录诊断。

### 4.4 对既有工具 schema 校验的影响

- `request_confirmation` / `request_choice` / `dispatch_task` / `hand_off_intent` / `request_clarification` 的 JSON Schema `pattern` 会在声明层面收紧；支持 `pattern` 的客户端会更早拒绝，不支持/忽略 `pattern` 的客户端仍由 Provider handler 兜底。
- `flow_get` / `flow_step_update` / `flow_step_supersede` 的 schema 原本就没有 `pattern`，由 `flow-service` 服务端校验；行为同样收紧，但 schema 形状不变。
- 字段仍全部可选（除既有必填项）；**缺席＝旧调用零变化**的语义不变；只有「给出且带尾连字符」的调用从成功变为失败，这是本变更的目标行为。

## 五、测试矩阵（待验证）

> 设计阶段只列用例；以下均**未运行**，实施后按实际命令与环境记录证据。

| ID | 层级/归属 | 场景 | 期望 |
| --- | --- | --- | --- |
| T1 | 运行时核心单元 | `GOVERNANCE_SLUG_PATTERN` 值断言 + 正反例（§2.2 全表） | 新字符串逐字相等；正例全过、反例全拒 |
| T2 | 运行时核心单元 | 长度边界：2 / 64 接受；1 / 65 拒绝；`a--b` 接受 | 符合 §2.1 |
| T3 | 运行时核心（schema） | 五个工具的 `flowId`/`stepId`/`intentId` `pattern` 等于 Model 常量；字段仍可选 | 相等且可选 |
| T4 | 运行时核心（handler） | `request_confirmation`/`request_choice`/`dispatch_task`/`hand_off_intent`/`request_clarification` 分别给 `flow-`/`a-`/`impl-`/`intent-` | `ok:false`、点名字段；客户通道/派发/能力零调用 |
| T5 | 编排单元（守卫 N1 路径） | `convener` confirm `flowId="flow-"` / `"a-"`；`cardKind=write` | `declined` + `notPresented`；`rawCalls=0`；无 `judgeContext`/账本 |
| T6 | 编排单元（意图交接） | `intentId="intent-"`、`flowId="flow-"`；意图文件 frontmatter `flowId: flow-` | 分别返回 `invalid-intent-id` / `invalid-flow-id`；不静默当作缺席 |
| T7 | 编排单元（门禁） | `coordinate`/`dispatch`/`write-flow` 给 `flowId="flow-"`；`dispatch` 给 `stepId="impl-"` | deny `missing-flow-id`/`missing-step-id`；文案含新正则；合法值仍放行 |
| T8 | 编排单元（步骤解析） | 旧 Markdown 流程含 `impl-` 步骤行 | 不被识别为步骤（fail-closed）；`impl` 正常识别 |
| T9 | 编排单元（Flow YAML 解析） | 文件名 `flow-`、顶层 `flowId: flow-`、步骤 `id: impl-`、`evidence.ref: impl-`、`supersedes` 引用 `impl-` | 返回具体 path 的校验错误；合法 YAML 不受影响 |
| T10 | 编排单元（flow-service） | `get`/`update`/`supersede` 的 `flowId`/`stepId`/`oldStepId`/`newStepId` 为尾连字符 | 拒绝（`missing-flow-id`/invalid），不写盘 |
| T11 | 编排单元（Flow YAML 路径闸） | 确认卡声明 `docs/flows/flow-.yaml`（无论是否带卡片 flowId） | **显式拒绝**该卡并点名非法 id；不得因路径正则不匹配而静默跳过 YAML 校验 |
| T12 | 门禁引擎测试 | 卡模板步骤 id 断言改为新正则；附一个 `impl-` 负例 | 模板合法 id 全过；尾连字符被拒 |
| T13 | 测试（跨角色端到端） | 治理角色脚本发 `flowId: "flow-"`/`a-`、`stepId: "impl-"`、`intentId: "intent-"` | 工具 `ok:false`；`presented=0`、`judgeRows=0`、无镜像/排队、无客户决定账本 |
| T14 | 跨角色端到端（正例） | 同一脚本改用合法 slug（如 `flow-a`） | 卡片正常呈现/判断链/账本；与改前一致 |
| T15 | 编排/账本（旧值） | 账本含 `intent.handed-off{flowId:"flow-a", intentId:"intent-"}` | `resolveIntentReference` 显式 fail-closed（`intent-unconfirmed`，detail 点名旧值）；不静默回落 `flow-id` |
| T16 | 编排（旧 Flow YAML） | 存在 `docs/flows/flow-.yaml` 且内容自洽 | 解析报 `flowId` 非法；派发门禁 deny；不自动重命名 |
| T17 | 回归 | 现有合法 slug（`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`f`、`s1`、`impl`、`verification`、`acceptance` 等）贯穿各层 | 与改前一致，零回归 |
| T18 | 静态/全量 | `npm run typecheck`；全量测试 | typecheck 0 错；全量按仓库惯例记录基线红，不得把既有失败算作本次通过 |

验证命令（实施后，按仓库既有口径；Node v24.x、Windows）：

```text
npm run typecheck
node --test "test/runtime-core/governance-flow-metadata.test.ts"
node --test "test/runtime-core/tools.test.ts"
node --test "test/runtime-core/liaison-handoff-tools.test.ts"
node --test "test/编排/*.test.ts"
node --test "test/门禁引擎/*.test.ts"
node --test "test/测试/governance-e2e-auto/*.test.ts"
node --test "test/**/*.test.ts"
```

通过判据：所有新负例被显式拒绝且无副作用；旧合法 slug 全链路零回归；旧值处理无静默路径；typecheck 0 错；测试证据记录实际命令、环境与结果。**以上均待实施后验证，本文不声称已通过。**

## 六、必需项与可选项

### 6.1 必需项（S1–S5，默认纳入）

| ID | 角色 | 范围 | 关键改动 | Section 1 依据 |
| --- | --- | --- | --- | --- |
| **S1** | 运行时核心 | Model + Provider 测试/文档 | `src/model/runtime.ts` 常量收紧；Provider 自动继承，补 schema/handler 负例与旧合法正例；`api-spec.md` 现行文本同步 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/`、角色文档 |
| **S2** | 编排 | `src/common/编排/` | 5 个私有副本改为由 Model 构造；`governance-gate.ts` 文案插值；`governance-judge-intent.ts` 旧意图值显式 fail-closed；`test/编排/` 负例与正例 | `src/common/编排/`、`test/编排/` |
| **S3** | 编排 | `src/pipeline/orchestration/run-role.ts` | `isGovernanceFlowId` 正则单一来源；`FLOW_YAML_PATH_RE` 宽捕获 + 显式非法 id 拒绝；2 处文案插值；`test/编排/` 守卫/路径用例 | `src/pipeline/orchestration/run-role.ts`、`test/编排/` |
| **S4** | 门禁引擎 | `test/门禁引擎/` | 删除测试侧硬编码旧正则，改引用 Model 常量；补尾连字符负例 | `test/门禁引擎/` |
| **S5** | 测试 | `test/测试/governance-e2e-auto/` | 跨角色端到端负例/正例；与 S1–S4 联合回归 | `test/测试/` |

依赖顺序：S1 → S2/S3 → S4 → S5 → typecheck/全量。S2 与 S3 同属编排，可由同一实施上下文完成；若拆两个上下文，须先冻结 S2 的 `governance-handoff.ts` 导出面（仍是 RegExp）。

### 6.2 可选项（O1–O4，客户 2026-10-22 已确认均不选，不实施）

客户已于 2026-10-22 确认 **O1–O4 均不选**；以下记录保留供追溯，**不得实施**。该确认不构成实施完成、测试通过或验收结论。

- [ ] **O1：读取兼容旧尾连字符值（双正则：读取宽 / 写入严）。**
  好处：已有旧项目在过渡期仍可读取旧 Flow YAML/账本意图，降低迁移冲击。
  代价：出现第二份形状定义，违背单一来源；需要明确每一条读取路径与诊断；且新操作仍不能用旧 id，兼容只是过渡，不是长期方案。
- [ ] **O2：进一步禁止连续连字符（`a--b` 非法）。**
  建议候选：`^[a-z0-9]+(?:-[a-z0-9]+)*$`，并另加长度 2–64 约束（JSON Schema 可用 `minLength`/`maxLength` 配合，或额外 lookahead）。
  好处：id 更规范、更易读。
  代价：改变客户本次未要求的语义，可能误伤既有 `--` id；测试与兼容面扩大。默认不纳入。
- [ ] **O3：抽出编排私有 `governance-slug` 模块统一谓词。**
  好处：`isGovernanceFlowId`/`isSlug`/`isGovernanceJudgeFlowId` 只保留一个实现。
  代价：新文件与新跨模块依赖；`flow-state.ts` 等纯解析模块会依赖编排公共小模块；当前「每个模块从 Model 构造 RegExp」已能保证值不漂移，收益有限。
- [ ] **O4：实施前对真实项目做只读审计（不自动迁移）。**
  扫描 `docs/flows/*-.yaml`、Flow YAML 中尾连字符 `flowId`/步骤 id、账本 `flowId`/`stepId`/`intentId` 尾连字符，输出报告交客户。若发现存量，先决定 O1 或人工迁移方案；**不得自动重命名/改写账本**。本项是运维/验收辅助，不是产品代码必需项。

## 七、影响与风险

### 7.1 对已验收守卫 N1–N5 的影响

- **不改** N1–N5 的设计、实现、测试口径；守卫的「缺 flowId/cardKind ⇒ 拒绝」逻辑不变。
- N1–N5 中 F2 的「尾连字符」文字缺口由本独立变更关闭：实施后，治理角色给 `flowId="flow-"` 会在 Provider 或编排守卫处被拒绝，不再呈现客户卡。
- 旧验收报告 §7.3 的「按格式=正则受限通过」是当时事实，**不回改**；本变更应单独取得实施/验收证据，并在新变更记录中引用旧报告 §7.3 说明该开放口径已关闭。
- 本变更**不**扩大守卫范围（例如不新增字段、不改变卡片白名单、不改变判断链）。

### 7.2 是否需要新的独立验收标准

**需要。** 建议独立验收至少覆盖：

1. 所有 slug 入口对 `flow-`/`a-`/`impl-`/`intent-` 显式拒绝，且无客户卡/判断/账本/写集副作用。
2. 2/64 长度边界、首字符、内部/连续连字符、单字符、超长、大写、下划线的正反例与 §2 一致。
3. 旧合法 slug 全链路零回归；N1–N5 既有用例不因本变更改变预期。
4. 旧 Flow YAML/账本意图值的处理为显式报错/fail-closed，无静默裁剪或回落。
5. 声明 `docs/flows/flow-.yaml` 的确认卡被显式拒绝，不能绕过 YAML 校验。
6. `npm run typecheck` 与全量测试记录真实结果（含基线红说明）。

### 7.3 零改动面（应用/桌面/适配器）

- `app/desktop/`、`app/renderer/`：未发现 slug 正则或 `GOVERNANCE_SLUG_PATTERN` 消费点；桌面读取 Flow YAML 时经 Pipeline 公共出口继承新校验，**代码零改动**；历史回放零行为变化。
- 适配器（Pi / Codex / Claude）：只消费 Provider 工具 schema 与回执，无 slug 副本；schema `pattern` 自动更新，**代码零改动**。
- Service 装配（`src/service/runtime/session.ts`）：无 slug 校验；**零改动**。
- 装配/构建：无新增依赖/接线；**零改动**（测试夹具中的 `flowId: "demo"` 仍合法）。

### 7.4 风险与处置

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 真实项目已有尾连字符 id | 旧 Flow YAML/账本意图在升级后不可用于新操作，可能阻断流程 | 实施前 O4 只读审计；如发现存量，客户决定 O1 过渡或人工迁移；不做静默自动修复 |
| 账本旧 `intentId` 被静默跳过 | 判断可能误回落其他意图来源 | S2 强制显式 fail-closed（`intent-unconfirmed`），detail 点名旧值 |
| `docs/flows/flow-.yaml` 因路径正则收紧被静默忽略 | 绕过 YAML 校验，写入未校验的流程文件 | S3 宽捕获 + 显式拒绝（§3.4） |
| 编排私有副本再次漂移 | 同类「文字/正则不一致」复发 | S2/S3 全部改为 Model 单一来源；测试断言 schema 与常量相等 |
| 测试侧硬编码旧正则 | 测试红或假通过 | S4 改引用 Model 常量 |
| 内嵌文案仍显示旧正则 | 模型按旧规则重试，体验混乱 | S2/S3 文案统一插值常量；T4/T7 断言文案含新正则 |
| JSON Schema `pattern` 与运行时不支持/差异 | 客户端行为不一致 | Provider handler 始终二次校验；schema 仅作提示 |
| 历史文档含旧正则 | 读者误以为旧值合法 | 历史 memo/changelog 不追改；更新现行 `api-spec.md`，新变更记录写明口径 |
| 64 字符边界回归 | 合法长 id 被误拒 | T2 明确 64 接受/65 拒绝；新旧最长均 64 |

### 7.5 未决问题

1. 客户是否确认 S1–S5 全部纳入、O1–O4 均不选（默认口径）？
2. 客户真实项目是否存在尾连字符的 `flowId`/`stepId`/`intentId` 存量？若存在，是否选择 O1 过渡或 O4 审计先行？
3. 是否同意「连续连字符继续允许」（O2 不纳入）？
4. 旧验收报告 §7.3 的关闭方式：是否只需新变更记录引用，还是需要独立验收在报告中追加追认附注？（按仓库惯例，历史报告不回改；建议新报告引用。）

## 八、状态与下一步

- **已做的**：只读调查代码/测试/角色文档与既有设计/验收报告；核对全部 slug 消费点、测试夹具、账本与 Flow YAML 读取路径；完成本设计文档。拟议正则另用本地 Python `fullmatch` 做过边界自检（正反例与 2/64/65 长度均符合预期）；该自检**不是**仓库测试，最终以实施后的仓库测试/typecheck 为准，本文**未在仓库运行任何测试/typecheck**。
- **未做的**：未改任何产品代码、测试、角色卡或边界；未新增/删除文件（仅本设计文档）；未运行 `npm run typecheck`/测试；未 git 提交；未触碰 todo-demo；未重启应用；未读取 `.env`/凭据/网络/真实模型。
- **状态**：**设计（draft）、未实施、未测试、未验收。**
- **下一步**：`su` 审核 → 客户确认（S1–S5 范围与 O1–O4 取舍，尤其是旧数据审计）→ 派发实施（按 §6.1 顺序）→ 独立验收（按 §7.2）→ 记录实际证据。

## 附录 A：调查方法与关键证据（只读）

- 消费点扫描：`grep -rn 'a-z0-9.*1,63' src app test`；`grep -rn 'GOVERNANCE_SLUG_PATTERN' src app test 角色卡`；`grep -rn 'isGovernanceFlowId|isGovernanceJudgeFlowId|isSlug\(|FLOW_ID_RE|SLUG_RE|GOVERNANCE_FLOW_ID_RE' src app test`。
- 存量值扫描：`grep -rn '(flowId|stepId|intentId)\s*[:=]\s*["'\''][^"'\'']*-["'\'']'`；`grep -rn '^(flowId|stepId|intentId):\s*[a-z0-9-]+-\s*$'`；`Glob docs/flows/*.{yaml,yml}` 与 `**/docs/flows/*.{yaml,yml}`。
- 账本读取形状：`src/common/编排/governance-ledger.ts:181-187` 仅要求 `at/kind/actorRoleId/power`，不校验 slug；`readGovernanceLedger` 坏行跳过但显式进 `errors`。
- Flow YAML 校验：`src/common/编排/flow-state.ts:257-295`（文件名/顶层 flowId 一致性）、`:336`（步骤 id）、`:393`（dispatch evidence ref）、`:430`/`:448`（supersedes 引用）。
- 意图解析静默分支：`src/common/编排/governance-judge-intent.ts:107`（账本非法 `intentId` 当前 `continue`）、`:127`（提案非法 `intentId` 当前回落）。
- 交接近似静默分支：`src/common/编排/governance-handoff.ts:375`（非空非法文件 `flowId` 当前按 `undefined` 处理）。
- 已核对 `app/`、`src/service/runtime/session.ts`、适配器无 slug 副本/校验点（上述 grep 无命中）。
