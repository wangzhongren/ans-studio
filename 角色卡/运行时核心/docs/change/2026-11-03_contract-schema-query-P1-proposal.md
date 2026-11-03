# 运行时核心 P1 实现提案：`contract_check` 只读 schema topic（A0a/A0b）

- **任务 / 角色 / 阶段**：`2026-11-03-contract-schema-query`（flowId `contract-schema-query`）；运行时核心（独立固定上下文）；P1 实现提案（团队计划 §4.3：A0a + A0b）。
- **日期 / 状态**：2026-11-03；`proposal-only, no code`——只写本文件，**未改任何代码/测试，未运行测试/应用，未 commit/push/merge/release**。项目管理 P1 审核非 `recommend approval` 前 A0a 不开工。
- **写入路径**：`角色卡/运行时核心/docs/change/2026-11-03_contract-schema-query-P1-proposal.md`（本阶段唯一写盘文件）。

## 1. 输入与基线（只读实测）

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| 方案 P1.3 | 911 | `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` |
| V1 验收标准 | 725 | `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d` |
| 团队计划 | 539 | `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` |
| 独立复核 | 282 | `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f` |
| B0 基线 | 171 | `314f99414bc45e8affb2c782c5a02dc2c557b6909b8ad0ed88bc1c06c1617c1c` |

- HEAD `243d8f6a6db663a383b516aad6320c5110c7f583` / 分支 `release/v1.8.4-assets`；`git status --porcelain -- src app test` 为空。
- 写前目标文件：`runtime.ts` blob `19f4dac4…974` / sha256 `014e0b0c…c4e`；`tools.ts` blob `98b5df46…d6a` / `dfa3fb4f…c0`；`schema.ts` blob `675dc235…f0cc` / `2da78f7c…654`（完整值随 A0 退出证据复测）。

## 2. A0a 契约（`src/model/runtime.ts`，唯一冻结点）
在 `ContractCheckInput`（`:1139-1148`）之前新增枚举/类型，接口内新增可选字段：

```ts
export const CONTRACT_SCHEMA_TOPICS = ["modules", "roster", "topology"] as const;
export type ContractSchemaTopic = (typeof CONTRACT_SCHEMA_TOPICS)[number];
/** 只读 schema 主题；给出时只返回该文档的字段表与最小合法 YAML 示例（不混入 run 摘要）。 */
topic?: ContractSchemaTopic;   // ContractCheckInput 内
```

- 不改既有字段、默认值、返回类型、`ContractCheckFn`；不加角色门禁；`runtime.ts` 无其它改动。
- 枚举单一来源：`tools.ts`/`schema.ts` 只 import；A1 的 `contractSchemaText(topic)` 以 `ContractSchemaTopic` 为入参类型。

## 3. A0b 工具层（`src/provider/runtime/tools.ts`）
- `:62` 值导入改为 `import { CONTRACT_SCHEMA_TOPICS, GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";`；局部变量用 `ContractCheckInput["topic"]`（不新增类型导入）。
- `makeContractCheckTool`（`:2417-2465`）顺序：现有 flowId/roleId 读取与**角色隔离（`:2424-2426` 逐字不动）→ topic 解析/拒绝 → taskKind/moduleId → 构造 input → 调用 `fn`**。隔离失败先于 topic（topic 合法也拒绝）。
- topic 解析**读原始值** `call.args["topic"]`，不可用 `readStringArg`（其对非字符串静默返回 `undefined`，会违反 AC-6）：
  - `undefined`/`null`/空串/仅空白串（`trim()` 后为空）→ 不构造 `topic`，走 legacy；
  - 非字符串（number/boolean/array/object）→ `ok:false`，消息含「应为字符串」及 `modules|roster|topology`；
  - 非空字符串不在枚举 → `ok:false`，列枚举；回显有界（`JSON.stringify(trimmed.slice(0, 40))`）；**不调用数据源**；
  - 合法值（`trim()` 后）→ `input.topic = trimmed` 透传。
- `input` 仅在有合法 topic 时带 `topic`，legacy `seenInput` 深比较不变。
- 截断标记：topic 模式 `"\n…（已截断）"`；legacy 仍 `"\n…（已截断，完整规则见 run manifest）"`（`:2456` 原文）。`CONTRACT_CHECK_MAX_BYTES`（`:140`）不变。
- 数据源空/非字符串按 `:2453-2455` 原样处理；`fn` 异常兜底沿用 legacy（§9-6）；注册条件（`:3499-3501`）不动。

## 4. A0b schema 描述（`src/provider/runtime/schema.ts`）
- `:2` 改为 `import { CONTRACT_SCHEMA_TOPICS, GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";`。
- `contract_check`（`:630-651`）`properties` 新增 `topic: { type: "string", enum: [...CONTRACT_SCHEMA_TOPICS], description: "Optional schema topic; returns that document's field table and minimal valid YAML example (read-only; no run summary)" }`。
- `description` 追加：传 `topic`（modules|roster|topology）时只返回字段表 + 最小合法 YAML 示例（静态 schema；不读 run、不含写区摘要；可与 taskKind/flowId/moduleId 同时给出，topic 优先，后三者被忽略）。
- `promptGuidelines` 追加两条（方案 §3.7）：写模块清单/名单/拓扑前先用 `topic` 查（`publicContract` 必须非空字符串、`management` 是扁平数组）；`topic` 只读 schema，不是批准/授权。
- `required` 与 `additionalProperties: true` 不变；不新增工具。

## 5. 精确写集与非目标
- **仅 3 个文件**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`。
- **不写**：任何测试（含 `test/runtime-core/`）、`src/common/编排/**`、`app/**`、`src/common/门禁引擎/**`、`test/桌面应用/**`、`test/编排/**`、角色卡/边界/YAML/changelog、i18n、README、`package.json`、`src/common/shared/**`、构建/发布配置、`docs/{planning,scheduling,communication,acceptance}`。
- **不做**：新工具/依赖/文件/写路径/角色门禁；不改 parser 接受/拒绝集合；不 commit/push。

## 6. 测试映射（A0 自检仅 `npm run typecheck`；行为由 A2 覆盖，A0 不宣称已验证）

| AC | 落点（A2 文件） | 用例要点 |
| --- | --- | --- |
| AC-3（工具可观察部分） | `rejection-copy.test.ts` | 三 topic handler 输出 ≤4096 B 且含 schema 标识；文本字节本身由 A1 `workflow-preconditions.test.ts` 锁定 |
| AC-4 | `rejection-copy.test.ts` | `{topic:"roster"}` → `seenInput.topic === "roster"` 且 `ok:true` |
| AC-5 | `rejection-copy.test.ts` | `{topic:"foo"}` → `ok:false`、消息列三值、数据源调用 0 |
| AC-6 | `rejection-copy.test.ts` | `{topic:123}`（及 boolean/array/object）→ `ok:false`、含「应为字符串」 |
| AC-7 | `rejection-copy.test.ts` | `{topic:"roster", roleId:"other"}` → `ok:false`、含「只允许查询本角色」；隔离先于 topic |
| AC-8（工具侧） | `rejection-copy.test.ts`；session 侧 `run-pin.test.ts` | `{topic:"roster", flowId, taskKind}` → topic 优先；输出无 `^run：`/`^taskKind .*必填`/`^可写边界：` 行 |
| AC-12 | `run-pin.test.ts` + 代码审查 | `contractCheckText` 首句早退、早退前无 `getListing`/`refreshListingNow`/写盘；无 run 项目可用 |
| AC-13 | `run-pin.test.ts` + `rejection-copy.test.ts` | legacy 输出与 `seenInput` 深比较逐字不变 |
| AC-14 | A0：`npm run typecheck` exit 0；D1 复跑双端 typecheck + 全量 | — |
| AC-16 | `rejection-copy.test.ts` | `topic:null`/`""`/`"   "` → legacy（`seenInput` 无 topic）；`topic:123` → `ok:false` |
| K1.9（支持证据） | `rejection-copy.test.ts` 或既有 schema 测试（A2 定，不新增文件） | `describeTool("contract_check").parameters.properties.topic.enum` 恰为三值；`required` 不含 topic |

> AC-1/2/9/10/15/17/18 属 A1，AC-11 属 A1+A3；A0 不写这些测试。A0b 工具行为在 A2 落测前保持「未验证」，退出记录该依赖（团队计划 §4.3）。

## 7. T3 证据计划（A0 退出）
1. `npm run typecheck` 退出码 0 与原始输出。
2. 写集隔离：`git status --porcelain -- src app test` 仅 3 个文件；`git diff --cached --name-only` 为空；逐文件 before/after `git hash-object` + `sha256sum`。
3. 枚举单一来源：定义只在 `runtime.ts`；`tools.ts`/`schema.ts` 只 import；无第二份 `"modules","roster","topology"` 字面量。
4. 分层：`tools.ts`/`schema.ts` 不 import `src/common/编排/workflow-preconditions.ts`（Provider 不反向依赖编排）。
5. `contract_check` 注册点、`ContractCheckFn`、`CONTRACT_CHECK_MAX_BYTES` 不变；无 i18n/README/package 改动；候选哈希入 A0 证据。

## 8. 依赖与串行
- P1 审核通过 → **A0a 冻结**（`runtime.ts`）→ **A0b**（`tools.ts`/`schema.ts`）；A0b 可与 A1/A3 并行（写集不相交）。
- A1 消费 `ContractSchemaTopic`（`contractSchemaText(topic)`）；A2 消费 A0a + A1（session 首句早退调用 `contractSchemaText`）；A2 两测试覆盖 A0b 行为。
- A0a 冻结声明：符号/字段形状如上；任何变化回运行时核心并重跑受影响证据，不静默漂移。

## 9. 风险与 PM 裁决点

| # | 事项 | 提案口径（请 PM 确认） |
| --- | --- | --- |
| 1 | 枚举导入方向 | 按方案 §3.1/团队计划 §4.2：枚举/类型放 `runtime.ts`，工具层只 import；**不**放 `workflow-preconditions.ts`（工具层不得 import 编排模块）。 |
| 2 | topic 参数别名 | 仅 `topic`；不取 `schema`/`topic_kind`（方案与 AC-4/6/16 只定义 `topic`；别名会扩大输入面与空值组合）。 |
| 3 | 空/空白判定 | `null`/`""`/仅空白 → legacy；合法值 `trim()` 后接受（`" roster "` 视为 `roster`）；非字符串拒绝；必须读原始值，不能用 `readStringArg`。 |
| 4 | 截断标记文案 | topic：`\n…（已截断）`；legacy 逐字不变。AC 未断言 topic 标记文本，以方案 §3.3 为准。 |
| 5 | 与 A1 边界 | 工具层只校验枚举并透传 `input.topic`；schema 文本/字节预算由 A1 `contractSchemaText` 产出、经注入 `ContractCheckFn`（A2 会话）返回；工具层不 import 编排。 |
| 6 | topic 模式 `fn` 异常文案 | 沿用 legacy 兜底（提及 pin/写区）；方案未要求改、AC 不覆盖；保持逐字不变优先于文案一致性。 |

## 10. 声明

本提案未写代码/测试，未运行测试/应用，未 commit/push/merge/release；只写本文件。不是实施、不是验收；A0a/A0b 待 P1 审核 `recommend approval` 后按团队计划串行执行。
