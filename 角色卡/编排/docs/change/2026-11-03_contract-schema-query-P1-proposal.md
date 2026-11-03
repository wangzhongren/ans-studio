---
id: contract-schema-query-a1-implementation-proposal
type: change
title: A1 实现提案（P1）：contract_check schema topic——编排文本/示例/逐字段错误
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: draft
related: [contract-schema-query]
events:
  - date: "2026-11-03"
    kind: created
    summary: 写 A1 短实现提案（proposal-only；未改代码/测试；未 commit/push）
---

# A1 实现提案（P1）：`contract_check` schema topic——编排文本、示例与逐字段错误

- **角色**：编排（Orchestration）。**任务/节点**：`2026-11-03-contract-schema-query` / P1（A1 提案；T3）。**状态**：**proposal-only, no code**——未改产品源码/测试/其它路径，未 commit/push；等待项目管理 P1 审核与 A0a 冻结后再进入 A1。
- **依据（只读，实测哈希与任务一致）**：方案 P1.3 911 行/`4d61d376…`；V1 725 行/`11001844…`；团队计划 539 行/`a93bd02f…`；复核 282 行/`55a2d268…`；B0 171 行/`314f9941…`。
- **基线**：worktree `flow-improvements-wave1`，HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；`git status --porcelain -- src app test` 为空。代码锚点：schema 常量 `:24-28`、topology `:294-420`（`:328/:340-341/:347-349`）、roster 四字段 `:568-573`、modules 文档四字段 `:791-793`、`loadLatestRoster` `:895-1069`；测试 `trio-worker-report.test.ts:195-204`。

## 1. 契约/函数（A1 退出冻结；`src/common/编排/workflow-preconditions.ts`）

- 仅 `import type { ContractSchemaTopic } from "../../model/runtime.ts"`（A0a 主属；不新增运行期依赖，不导入 Provider）。
- 导出：`contractSchemaText(topic: ContractSchemaTopic): string`；三个示例常量 `PROJECT_MODULES_SCHEMA_EXAMPLE` / `PROJECT_ROSTER_SCHEMA_EXAMPLE` / `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE`（后者被 roster 示例直接插值，单一来源）。
- 三个文本常量 `CONTRACT_{MODULES,ROSTER,TOPOLOGY}_SCHEMA_TEXT` 由行数组 `.join("\n")` 构造；首两行为 `contract_check topic=<t>（只读 schema；查询不构成放行/授权）` 与 `（仅 schema 与示例；不含 run/写区；其余参数被忽略）`；**全文不出现字面 `taskKind`；`flowId`/`moduleId` 仅限制在首两行（实际第二行），`<flowId>` 占位与 `flowId:` 字段名按 P1.3 保留**（P1-CSQ-03）。
- 文档行、`- schema: 字面量 …`、示例的 schema 版本全部用同文件 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 插值（单一来源）；roster 文本含「加载校验（硬拒绝）」段与三条警告（示例仅保证解析器通过；默认项目须含 env-bootstrap；占位 `omissionReason` 必须替换）。
- 纯函数、**零磁盘读/零写盘**；topic 模式只返回 schema/示例，不读 run、不混 run 摘要。字节守卫：三块均 ≤4096 B，roster 另 ≤3900 B（作者保证 + 测试锁死；工具层截断仅作防御）。

## 2. 逐字段错误与 topology 文案（错误码不变、接受/拒绝集合不变）

- 新增内部 helper `describeContractValue(value: unknown)`：`未提供` / `null` / `string（空）` / `string` / `boolean: true|false` / `number: <v>` / `array(N)` / `object（mapping）`；不回显字符串内容。
- roster 与 modules 文档两处改为按 `name → purpose → publicContract → architectureSource` 顺序逐字段检查，命中第一个非法字段即返回（一条消息只报一个字段）。
- `purpose` 的 raw-vs-effective：有效值 = `typeof purpose === "string" ? purpose : responsibility`（含空串，不回退）；错误显示优先 raw `purpose`（存在且非 `null`），仅缺省/`null` 时显示 raw `responsibility`。
- 旧/新文案对照（`<N>` 为 1-based 项号）：
  | 位置 | 旧文案（逐字） | 新文案（模板） |
  | --- | --- | --- |
  | roster 四字段 `:568-573` | `模块 ${id} 缺 name/purpose/publicContract/architectureSource（均须非空）。` | `名单模块第 <N> 项（id=<id>）的 <field> 必须是非空字符串（收到 <received>）。`（publicContract 追加「不能写 YAML 布尔 true/false」；architectureSource 追加「应为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）」） |
  | modules 文档四字段 `:791-793` | `模块清单 ${id} 缺 name/purpose/publicContract/architectureSource。` | 前缀改为 `模块清单第 <N> 项（id=<id>）的 <field> 必须是非空字符串（收到 <received>）。`，其余同上 |
  | topology schema `:328` | `…（schema: project-topology/v2；modules[].path 或 paths[] + category，management.roles 含 convener 与全部项目角色）…` | `…（modules[] 每项 id/path 或 paths[]/roleId；roles[] 每项 id/modules[]；management 为扁平数组，含 convener 与全部项目角色 id），不做静默归一化。` |
  | management 缺 convener `:340-341` | `拓扑图 management 必须含 convener（运营管理项目角色）。` | `拓扑图 management 的写作格式是扁平字符串数组（如 management: [convener, <全部项目角色 id>]），且必须含 convener；收到 <raw>（mapping → object（mapping），数组 → array(N)）；解析器兼容单个字符串（不推荐），不接受 management.roles 这种 mapping。` |
  | management 缺角色 `:347-349` | `拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）。` | 原句 + `；management 是扁平字符串数组，须含 convener 与全部项目角色 id。` |
- 错误码不变：roster `roster-module-fields-missing`；modules 文档 `modules-doc-fields`。宽容读取（单字符串、过滤非字符串项、多余 id）不变；parser 入口加注释「改校验/文案必须同步 `contractSchemaText` 与三个示例常量」。
- 策划卡断言（`test/编排/trio-worker-report.test.ts`）**在 A3 卡文本落地后**追加；本提案只写计划，不提前写、不代写卡。

## 3. 精确写集（3 文件；不写 model/provider/desktop/门禁/i18n/README）

1. `src/common/编排/workflow-preconditions.ts`：函数、三示例、三文本、helper、逐字段错误、topology 文案、parser 注释。
2. `test/编排/workflow-preconditions.test.ts`：§4 的 AC-1/2/3/9/10/15/17/18 用例。
3. `test/编排/trio-worker-report.test.ts`：仅 AC-11 策划卡断言（A3 后追加）。
   `src/model/runtime.ts`（A0a）、`app/desktop/session.ts`（A2）、`governance-roles.ts`（A3）与桌面/门禁测试均不在本写集；本角色只读引用。

## 4. 测试映射（`workflow-preconditions.test.ts`，除注明外）

| AC | 具体用例组 |
| --- | --- |
| AC-1 | 示例 parser 组：`parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE,"demo").ok === true`；`parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE,"demo").ok === true`；两示例 `modules[]` `deepEqual`（N1） |
| AC-2 | `PROJECT_ROSTER_SCHEMA_EXAMPLE.includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE) === true` |
| AC-3 | 字节组：三 topic `Buffer.byteLength(contractSchemaText(t),"utf8") <= 4096`；roster 另 `<= 3900`；断言文本含完整字段表 + 示例（非截断片段） |
| AC-9 | 逐字段矩阵组：roster 与 modules 文档两侧 × `name`/`purpose`/`publicContract`/`architectureSource` × {未提供,`null`,`""`,boolean,number,array,object}；每字段断言 `ok:false`、错误码不变、reason 含字段名与收到类型；`publicContract:true` → `boolean: true`；`purpose:true` 无 responsibility → `boolean: true`（非「未提供」）；`responsibility` 合法别名通过；`purpose:""` + responsibility 有效 → `string（空）` |
| AC-10 | topology 组：`management:{roles:[convener,implementer]}` → 含「写作格式」「扁平字符串数组」「management.roles」「object（mapping）」；`[convener]` → 含「缺项目角色 implementer」与「扁平」；`[convener,implementer,5]` 按既有宽容读取通过；v1 提示不含「management.roles 含 convener」且含「扁平数组」/「roleId」 |
| AC-11 | `trio-worker-report.test.ts` 策划卡组（A3 后）：`/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/` |
| AC-15 | `loadLatestRoster` 组：正例 roster 文档用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`、modules 文档用 `PROJECT_MODULES_SCHEMA_EXAMPLE`（两示例 `modules[]` 逐项一致）+ intent/proposal/architecture → `ok:true`；不得把完整 `contractSchemaText("roster")` 当 roster 文件（P1-CSQ-04）；五负例命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing` |
| AC-17 | schema 常量行组：每个 topic 过滤含对应 `PROJECT_*_SCHEMA` 的行，断言恰 3 行且 `deepEqual` 用常量拼出的期望行（modules：文档行/字面量行/示例行；roster/topology 同理） |
| AC-18 | `contractSchemaText("roster")` 含「占位 omissionReason 必须替换，不得原样提交」及另两条警告（真实项目抽查属 E2 只读） |

## 5. T3 证据计划（A1 退出；D1 另跑全量）

- 命令：`node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/trio-worker-report.test.ts`；`npm run typecheck`。A1 不重复 D1 的 T3 全量；B0 基线（同一 HEAD）为 26/26 pass、typecheck exit 0。
- 本 P1 只读实测（HEAD `243d8f6`；临时脚本在系统临时目录，不写仓库）：三块文本 UTF-8 无尾随换行 **2438 / 3763 / 1265 B**（均 ≤4096，roster ≤3900）；示例 **282 / 850 / 171 B**；`parseProjectModules`/`parseProjectRoster` 均 `ok:true`，`modules[]` `deepEqual` true，roster 示例含 topology 示例，三块文本均含各自示例且无字面 `taskKind`；schema 常量行 **3/3/3** 且与期望行一致。
- 实现后以测试断言重测上述字节与示例（措辞差异允许 ±数 B，但必须满足上限）；保留原始命令/输出与文件哈希。

## 6. 依赖与串行

- **A0a 先冻结** `ContractSchemaTopic`/`CONTRACT_SCHEMA_TOPICS`/`ContractCheckInput.topic`；A1 只 `import type`，不复制枚举，不写 Model。
- **A2 消费 A1**：`contractCheckText` 首句 `return contractSchemaText(input.topic)`；A1 文本冻结前 A2 不引用。
- **A3 先落卡文本**：AC-11 卡断言在 A3 完成后由 A1 追加；不提前写、不代写 `governance-roles.ts`。
- 团队计划 §5：`workflow-preconditions.ts` 与 `test/编排/*` 编排单写者；A1 与 A0b/A3 写集不相交可并行；A2 等 A0a+A1。

## 7. 风险与 PM 裁决点

- **4 KiB/3900 预算**：roster 3763 B，距 4096 余 333 B、距 3900 余 137 B；任何新增字段先压缩或拆子 topic（拆子 topic 属方案变更，重开闸门 1）。
- **示例漂移**：modules/roster 示例必须逐项一致；AC-1 `deepEqual` 与 AC-15 正例同锁；改动任一示例须同步另一份。
- **`purpose` 别名**：按 §2 的 raw-vs-effective 口径；`purpose:true` 不得报「未提供」，`purpose:""` 不得回退 `responsibility`。
- **错误文案措辞**：新增「不能写 YAML 布尔 true/false」「应为项目相对路径…」仅为提示，不改放行；测试按最终文案锁定，需 PM/A1 确认措辞基线。
- **A3 卡路径**：`RAPPORTEUR_CARD_TEXT` 带 `@deprecated` 但由 `governanceRoleOf("rapporteur")` 返回、`resolve-role.ts:98` 使用 `spec.cardText`；A3 P1 已要求只读核对，若已非活动路径则停止并回报统筹/策划，不改未授权路径。

## 8. 声明

本文件为 proposal-only：未改任何产品源码/测试/其它路径，未运行实施测试（仅只读 parser 预演、基线命令与字节实测），未 commit/push；不含实施证据或验收结论。
