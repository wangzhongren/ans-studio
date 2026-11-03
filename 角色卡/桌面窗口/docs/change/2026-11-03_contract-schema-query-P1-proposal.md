---
id: contract-schema-query-desktop-window-proposal
type: change
title: contract schema query 桌面窗口侧短实现提案（A2）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: draft
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 写 A2 桌面窗口侧 proposal-only 短实现提案（session 首句 topic 早退 + 两测试）；未改代码/测试
---

# contract schema query 桌面窗口侧短实现提案（A2）

- **任务 ID / flowId**：`2026-11-03-contract-schema-query` / `contract-schema-query`
- **角色**：桌面窗口（Desktop Window），独立上下文
- **阶段**：P1 实现提案（团队计划 §4.3/§6.1 A2；入口 = P1 审核通过 + A0a/A1 依赖就绪）
- **日期**：2026-11-03
- **状态**：**`proposal-only, no code`**。只写 A2 接线口径、测试计划与 AC 映射；**未改产品源码/测试，未运行测试，未 commit/push**。产出交项目管理 P1 审核；非 `recommend approval` 前 A2 不开工。
- **写入路径**：`角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-proposal.md`（本阶段唯一写盘文件）。

**一句话：** `contract_check` 的 topic 查询在桌面会话层只加一条首句早退——`input.topic` 存在时直接返回编排的 `contractSchemaText`，在 `getListing`/`refreshListingNow` 与任何写盘之前；legacy 摘要逐字不变，topic 模式零磁盘读、不混 run 摘要，由工具层 4 KiB 截断兜底。

## 1. 输入与基线（只读实测，2026-11-03）

- HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`（`release/v1.8.4-assets`）；`git status --porcelain -- src app test` 为空；方案 P1.3 911 行 / `4d61d376…`；V1 725 行 / `1100184…`；团队计划 539 行 / `a93bd02f…`；复核 282 行 / `55a2d268…`；B0 171 行 / `314f9941…`。
- 目标文件写前基线：`app/desktop/session.ts` 8790 行 / sha256 `86c84c4d…` / blob `bbf0f9d3…`；`test/桌面应用/rejection-copy.test.ts` 268 行 / `8c7e7dce…` / `1c45af3d…`；`test/桌面应用/run-pin.test.ts` 830 行 / `dad68b3b…` / `b66e1c91…`。

## 2. 契约与接线（A2 唯一产品改动）

```ts
private async contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput): Promise<string> {
  if (input.topic !== undefined) return contractSchemaText(input.topic);   // 第一条语句
  let listing = this.deps.getListing(projectRoot);                          // legacy 起点，逐字不变
```

- **导入**：把 `contractSchemaText` 加入 `session.ts:133-142` 既有 `src/common/编排/workflow-preconditions.ts` 导入块；不新增依赖边，不复制枚举/文本/示例。
- **无 IO**：早退在 `getListing`（:8096）、`refreshListingNow`（:8097）与任何写盘之前；topic 模式零磁盘读、不依赖项目导入/run 是否存在（AC-12）。
- **legacy 逐字不变**：`let listing` 起至 4096 截断/返回（:8194-8202）一行不动；diff 仅 import + 首句早退。legacy 截断标记 `\n…（已截断）` 与工具层 `\n…（已截断，完整规则见 run manifest）` 均不变。
- **不预截断**：topic 模式 session 返回完整 `contractSchemaText`，不走 session 4096 分支；工具层 A0b `truncateUtf8` 按 `CONTRACT_CHECK_MAX_BYTES`（4096）兜底，topic 标记 `\n…（已截断）`。
- **非法/空值**：未知 topic、非字符串由工具层 A0b 拒绝（数据源不被调用、session 不收到）；`null`/空串/仅空白串不构造 `topic`，走 legacy。session 只消费 A0a 的 `ContractSchemaTopic | undefined`，不做第二份枚举/字面量校验。

## 3. 精确写集（3 个文件）

- 写：`app/desktop/session.ts`（唯一产品源码）；`test/桌面应用/rejection-copy.test.ts`（工具层）；`test/桌面应用/run-pin.test.ts`（session 层）。
- 不写：`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/编排/**`、`src/common/门禁引擎/**`、`app/desktop/` 其他文件、`app/preload.cjs`、`app/main.ts`、`app/renderer/**`、i18n/`src/common/shared/**`、`package.json`、README、角色卡/边界；不新增测试文件（工具描述可选用例放 `rejection-copy.test.ts`，团队计划 §9.2）。

## 4. 测试计划与 AC 映射

### 4.1 `rejection-copy.test.ts`（工具层；数据源接真实 `contractSchemaText`）

| 用例组 | 断言 | AC |
| --- | --- | --- |
| topic 透传 | `{topic:"roster"}` → `seenInput.topic==="roster"`、`ok:true` | AC-4 |
| 未知 topic | `{topic:"foo"}` → `ok:false`、含 `modules\|roster\|topology`、`seenInput===undefined`（0 调用） | AC-5 |
| 非字符串 | `{topic:123}` → `ok:false`、含「应为字符串」；boolean/array/object 支持证据 | AC-6 |
| 角色隔离 | `{topic:"roster", roleId:"other"}` → `ok:false`、含「只允许查询本角色」、未调用数据源 | AC-7 |
| 并存参数 | `{topic:"roster", flowId:"focus", taskKind:"dispatch"}` → topic 透传、输出只含 schema | AC-8 |
| ≤4096 | 三 topic 均 `ok:true`、≤4096 B、含 `contract_check topic=<t>` 与对应 schema 常量 | AC-3 |
| 空/空白/null | `null`/`""`/`"   "` → `ok:true` legacy、`seenInput` 无 `topic` 键；`topic:123` 拒绝 | AC-16 |
| legacy 深比较 | 现有 :161-198 用例不动：`seenInput` 仍 `deepEqual {flowId,roleId,taskKind,moduleId}` | AC-13 |
| 工具描述（可选） | `describeTool("contract_check").parameters.properties.topic.enum` = 三值、`required` 不含 topic | K1.9 |

### 4.2 `run-pin.test.ts`（session 层）

| 用例组 | 断言 | AC |
| --- | --- | --- |
| 首句早退/无 run | 空临时根（无项目文件、无 run/flow）open 后 `contractChecks.<role>({topic:"modules"})` 返回 schema 文本 | AC-8/12 |
| 无 legacy 行 | 三 topic 逐行断言：不以 `^run：`、`^taskKind .*必填`、`^可写边界：` 开头 | AC-8 |
| 字节上限 | 三 topic 输出均 ≤4096 B | AC-3 |
| 并存参数 | `{topic:"roster", flowId:"focus", taskKind:"dispatch"}` 输出与 `{topic:"roster"}` 一致、无 legacy 行 | AC-8 |
| legacy 不变 | 现有 :522-545 用例逐字不动（`legacy（未冻结）`/`角色：implementer`/`名下模块：impl-core`/`taskKind dispatch 必填`） | AC-13 |

## 5. T3 验证与证据

- 受影响套件：`node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts`；`npm run typecheck`；D1 补 T3 全量与 `typecheck:renderer`。
- AC-12 代码证据：`git diff -U0 app/desktop/session.ts` 仅 import + 首句早退，早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；run-pin 空根用例为行为证据。无新 IPC/preload/渲染/写路径；不要求 Electron E2E。B0 桌面组 28 tests 基线全过；A2 只增用例，不删/不弱化、不新增 skip。

## 6. 依赖与串行

- **A0a + A1**：`src/model/runtime.ts` 的 `CONTRACT_SCHEMA_TOPICS`/`ContractSchemaTopic`/`ContractCheckInput.topic` 与 `workflow-preconditions.ts` 的 `contractSchemaText(topic)` 均冻结后 A2 才写 `session.ts`；A2 不复制文本/示例。
- **A0b**：`tools.ts` 的 topic 解析/校验/透传 + topic 截断标记；`rejection-copy` topic 用例即 A0b 的跨角色测试面（团队计划 §4.3）。
- 顺序：P1 审核 → A0a → A0b/A1（并行）→ A2 → D1；A2 不提前写依赖类型的代码。

## 7. 风险与 PM 裁决点

| # | 点 | 本提案口径 |
| --- | --- | --- |
| 1 | 早退位置 | 必须是 `contractCheckText` 第一条语句（注释不算）；AC-12 以 diff 核对 |
| 2 | tool 参数别名 | P1.3 §3.1 只读 `call.args["topic"]`；A0b 提案同为仅 `topic`（不取 `schema`/`topic_kind`）；如需别名请 PM 裁决（会扩大输入面） |
| 3 | 空串/空白串 | `null`/`""`/仅空白 trim 后为空走 legacy；非字符串拒绝（AC-16）；归 A0b，A2 测试锁定 |
| 4 | 截断归属 | session 不预截断 topic；工具层 `truncateUtf8` 4096 兜底；A1 文本超限应在 AC-3 先失败，不得靠截断掩盖 |
| 5 | legacy 逐字不变 | 只加 import + 首句；既有 `seenInput` 深比较与 run-pin legacy 断言是护栏 |

## 8. 声明

未写实现代码/测试，未改任何产品/测试文件，未运行测试/typecheck，未 commit/push，未接触客户。本文件仅为提案。
