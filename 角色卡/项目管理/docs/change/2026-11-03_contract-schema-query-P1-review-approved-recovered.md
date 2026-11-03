---
id: contract-schema-query-p1-review
type: change
title: P1 实现提案审核：contract_check 只读 schema topic（运行时核心 / 编排 / 桌面窗口 / 门禁引擎）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: draft
related: [contract-schema-query]
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 references/proposal-review.md 审核 A0/A1/A2/A3 四份 P1 短实现提案；结论 recommend approval；列实施前必须落实项、owner 与复审要求
---

# 恢复版说明（P1 审核记录）

- **恢复版事实**：本文件按原项目管理 P1 审核记录重出。原版路径为 `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`，**293 行 / SHA-256 `d547b90d47615ef00556a65558fdcde6ad307e0286d3bd457624c977d46256ea`**，结论 `recommend approval`，含 P1-CSQ-01–10。
- **当前原路径为事故版**：同一路径现为 **272 行 / SHA-256 `4469ce2d50f0b4117f154288e996e1bdecd1990126c132510e8c26885eaa87b9`**（另一重复 PM 上下文写入；其 §0 自述以原 293 版为准）。**本恢复版保留该 272 文件不改**。
- **恢复方式与一致性**：由原 PM 上下文按原 293 内容重出。原 frontmatter 与正文（原 H1 至结尾）保持逐字节一致；正文（原 H1 至结尾，42,198 B）的 SHA-256 为 `f297b2674ce3510eea7d9916a65adae289c8991504b3f8b7dda7225a8df5c2b0`。本恢复版仅在 frontmatter 之后新增本说明，故**整文件 SHA-256 与原版不同：这是重建版，不是整文件逐字节恢复**。
- **用途与边界**：供统筹/E1/E2 读取原 `recommend approval` 结论与 P1-CSQ-01–10；本文件不是客户批准、不是闸门、不是独立验收结论；未改原 272 文件、未改方案/实现/其它文档，未 commit/push。

# P1 实现提案审核：`contract_check` 只读 schema topic（运行时核心 / 编排 / 桌面窗口 / 门禁引擎）

- **审核角色 / 上下文**：项目管理（technical-architecture，固定角色，本上下文只承担该角色，独立 worker 上下文）。
- **审核性质**：实现提案审核（`references/proposal-review.md`）；不是客户闸门、不是实施授权、不是测试结果、不是独立验收结论，也不授权 commit/push/merge/release。
- **审核对象版本**（本记录只对下列版本有效；任一提案改动后须重新核对受影响项）：

| 对象 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A0 运行时核心 P1 提案 | `角色卡/运行时核心/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 100 | `57838e461aa36cc98538a4fad823626c80109314a9c1a41eb7a3d6b8cb595d41` |
| A1 编排 P1 提案 | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 90 | `70e36ea4e8e50a0c0942a2b305351a6b40c4a00ca48eae8730f9cf4e87cddaff` |
| A2 桌面窗口 P1 提案 | `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 100 | `bb04be77865ecf13b3e6db36b4c093001c0541a6c88820c83c3812f5bb194bc0` |
| A3 门禁引擎 P1 提案 | `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 81 | `f44f1b98590fe271f639fa61d6ce35767fa1a80375b25cce4cc9169a6364c593` |

- **结论**：**`recommend approval`**。四份提案均为 `recommend approval`（附实施前必须落实项，见 §二/§八）；未发现阻断项、方案/写集/档位/AC 实质变化或跨提案契约冲突。A1 提案 §1 有一处措辞与方案文本不一致、A2 测试映射缺一条 AC-8 证据断言，均可在各自实施前按本记录落实，不需重开 P1。
- **可进入的下一步**：P1 通过后**可进入 A0a（Model 冻结：`CONTRACT_SCHEMA_TOPICS` / `ContractSchemaTopic` / `ContractCheckInput.topic`）**；A0a 退出后 A0b/A1/A3 可按团队计划并行，A2 待 A0a+A1（工具层 topic 用例还依赖 A0b 落地）后实施，A1 的 `trio-worker-report.test.ts` 卡断言在 A3 卡文本落地后追加；D1/E1/E2/E3 按团队计划顺序。P1 审核不代替 V1、客户实施授权或独立验收。
- **未做**：未运行测试/typecheck、未启动应用/Electron、未实施任何产品/测试代码、未修改四份提案或方案/团队计划/V1/沟通/角色卡/边界、未 commit/push/merge/release、未接触客户。代码结论来自 HEAD `243d8f6` 的只读阅读、哈希计算与一次只读内存卡片模拟。

## 一、冻结输入与只读基线

### 1.1 输入（2026-11-03 审核时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 客户闸门 1 确认的策划方案 P1.3 | `docs/planning/2026-11-03_design_contract-schema-query.md` | 911 | `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` |
| 实施前验收标准 V1 | `docs/acceptance/contract-schema-query-criteria-v1.md` | 725 | `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d` |
| 团队计划（闸门 2 确认） | `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md` | 539 | `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` |
| 独立复核（最终 282 行） | `docs/planning/2026-11-03_review_contract-schema-query.md` | 282 | `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` | 171 | `314f99414bc45e8affb2c782c5a02dc2c557b6909b8ad0ed88bc1c06c1617c1c` |
| A0 运行时核心 P1 提案 | 见文首对象表 | 100 | `57838e461aa36cc98538a4fad823626c80109314a9c1a41eb7a3d6b8cb595d41` |
| A1 编排 P1 提案 | 见文首对象表 | 90 | `70e36ea4e8e50a0c0942a2b305351a6b40c4a00ca48eae8730f9cf4e87cddaff` |
| A2 桌面窗口 P1 提案 | 见文首对象表 | 100 | `bb04be77865ecf13b3e6db36b4c093001c0541a6c88820c83c3812f5bb194bc0` |
| A3 门禁引擎 P1 提案 | 见文首对象表 | 81 | `f44f1b98590fe271f639fa61d6ce35767fa1a80375b25cce4cc9169a6364c593` |

- 四份提案引用的输入哈希与本记录实测一致（方案 911 行 / `4d61d376…`；V1 725 行 / `11001844…`；团队计划 539 行 / `a93bd02f…`；复核 282 行 / `55a2d268…`；B0 171 行 / `314f9941…`）。
- 分支 / HEAD：`release/v1.8.4-assets` / `243d8f6a6db663a383b516aad6320c5110c7f583`；`git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空。
- 工程法案：`角色卡/项目管理/docs/project-rules.md`（草稿，160 行）相关约束已核对——§一.2 五层调用方向、§一.3 Model 共享、§一.5 共享抽象单一主属主、§二.9 风险档位、§二.10 打印/日志、§二.11 独立验收、§二.17 验收证据最多截图/不要求录屏；本任务按团队计划 T3 管理，未发现与法案冲突。法案缺失/草稿部分不当作已接受约束。

### 1.2 目标文件只读基线（提案引用值复核，全部成立）

| 文件 | blob（git hash-object） | sha256 |
| --- | --- | --- |
| `src/model/runtime.ts` | `19f4dac4d9343144a8674c23afaa1c053e9c7974` | `014e0b0cf214f765f3b700335976d904109b8facf0d88f3f4323aef117dccc4e` |
| `src/provider/runtime/tools.ts` | `98b5df46957db795d6466c1dc4d4eace73155d6a` | `dfa3fb4fe1fa58bc92fdceac0d6eef5862c39c2534add372c00662bb78e3bac0` |
| `src/provider/runtime/schema.ts` | `675dc23532fddbabb64a7aacb0aa5effe946f0cc` | `2da78f7c6462875c6789067ca9cfd7e814dd527f71cd4de993d611c2f6106654` |
| `app/desktop/session.ts`（8790 行） | `bbf0f9d37031a3d15533d1cd84ca3207f86562a8` | `86c84c4db272209c471d2ad802dee29f85e6afbe9f3609be093dc96ba2acbed3` |
| `test/桌面应用/rejection-copy.test.ts`（268 行） | `1c45af3df38671868b802f80e1a2255cd3e6d915` | `8c7e7dcee84214addd9ff96071b83059470d117209a431a43851ca997686076f` |
| `test/桌面应用/run-pin.test.ts`（830 行） | `b66e1c91d5dc4eccefd0e62dbd5eef7df02eabd7` | `dad68b3b71c640341ed15a5e0b75020f3599f4cd75d3089c0346b592807773ed` |
| `src/common/门禁引擎/governance-roles.ts`（615 行） | `21ccc7bec05609cc3e5e0639ebde972b4ba1f988` | `8021761c0e7b767f3a809bb8ffe9a4f799dc6e1738457893cde3541c9439340d` |

- 代码锚点只读核对（HEAD 成立）：`ContractCheckInput` `src/model/runtime.ts:1139-1148`；`CONTRACT_CHECK_MAX_BYTES=4096` `tools.ts:140`；`makeContractCheckTool` `:2417-2465`（角色隔离 `:2424-2426`，数据源空/非字符串 `:2453-2455`，legacy 截断标记 `:2456`）；`readStringArg` `:232-238`（非字符串返回 `undefined`，A0 指出的规避必要）；`contract_check` 注册 `:3499-3501`；`contract_check` 参数/描述 `schema.ts:630-651`（当前无 `required` 键，`additionalProperties: true`）；`contractCheckText` `app/desktop/session.ts:8095-8203`（首个可执行语句 `getListing` `:8096`，`refreshListingNow` `:8097`，会话截断 `:8194-8202`）；`contractCheck` 注入 `session.ts:2545-2546`；schema 常量 `workflow-preconditions.ts:24-28`；`validateRosterTopology` `:294-420`（schema 提示 `:328`，management 归一化 `:334-339`，缺 convener `:340-341`，缺角色 `:347-349`）；`parseProjectRoster` `:443-724`（四字段 `:568-573`）；`parseProjectModules` `:727-840`（四字段 `:791-793`）；`loadLatestRoster` `:895-1069`（drift `:984-992`，reference missing/stale/inconsistent `:1018-1061`）；`RAPPORTEUR_CARD_TEXT` `governance-roles.ts:178-193`；注册表 `:329-332`；`governanceRoleOf` `:470`；`resolve-role.ts:97-98`；`run-role.ts:1455`；Provider 使用 `role.cardText`：`real-adapter.ts:352`、`claude/session.ts:192`、`codex/session.ts:354`、`pi/session.ts:82`、`runtime/tools.ts:3616`（均与 A3 §3 引用一致）。
- 既有测试锚点：`rejection-copy.test.ts:161-198`（legacy `seenInput` 深比较、角色隔离、4 KiB）、`:184-198`（超长截断）；`run-pin.test.ts:522-545`（session legacy）、`:573-660`（§5A 四角色 contract_check，A2 不得回归）、`:257`（pinned run 的 legacy 调用）；`trio-worker-report.test.ts:195-204`（策划卡既有断言）；`view-image-cards.test.ts:16-47`（禁用字符串，不检查长度）；`list-project.test.ts:31`（卡文本非空）。
- B0 基线事实（转引，不重跑）：受影响三组 **72 tests / 72 pass / 0 fail / 0 skip / 0 todo**（编排 26、桌面 28、门禁 18）；T3 全量 **393 文件 / 3462 tests / 3435 pass / 9 fail（全部既有 Windows symlink EPERM）/ 18 skipped / 0 todo**，exit 1；`write-sequencing.test.ts` 排除并记录；双端 typecheck exit 0；Electron 44.7.0 二进制/dist 存在、无运行进程、未跑 E2E。
- 只读卡片模拟：`governanceRoleOf("rapporteur").cardText` 当前 **4246 B / 25 行**；按 A3 两行原文模拟插入后 **4612 B / 27 行（+366 B）**，A1 四条卡断言正则（`/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/`）全部命中；`名单是人事招人的唯一依据` 全文唯一，插入点在产物说明行（`:183`）之后、该锚点行（`:184`）之前。
- A3 `@deprecated` 注释来源只读核对：`c2b6cf9`（batch-D1）删除 `LIAISON_CARD_TEXT` 时留下该注释；现注释紧邻 `RAPPORTEUR_CARD_TEXT`，但 rapporteur 常量仍由注册表与 `resolve-role.ts`/Provider 使用，**是活动路径**，A3 的结论成立。

### 1.3 审核方法与限制

- 按 `references/proposal-review.md` 检查需求符合、五层架构与依赖方向、共享契约/公共导出、角色归属、复用、测试映射与证据；只读核对方案、V1、团队计划、复核、B0、四份提案与相关代码/测试段落。
- 四份提案即四个实施角色（运行时核心、编排、桌面窗口、门禁引擎）各自 owner 的书面提案；跨角色依赖（A0b 工具行为由 A2 测试覆盖、A3 卡文本由 A1 断言、A1 卡断言等 A3）已在提案中声明，未发现未解决的分歧。本次未另启其它角色的独立评估上下文；这是本审核的限制，不是对未声明影响的推定。
- 未运行测试、typecheck、应用或 Electron；未实施任何代码；卡片字节/正则为只读内存模拟；B0 计数为转引。未验证实现后的真实字节数、真实 session 行为、真实工具 handler 返回或 E2E。
- `角色卡/项目管理/docs/project-rules.md` 为草稿；本次只核对其中与变更直接相关的已确认条目，不把未确认内容当约束。

## 二、逐份结论

| 提案 | 结论 | 必须修改 / 落实项（实施前） | owner |
| --- | --- | --- | --- |
| A0 运行时核心（A0a/A0b） | **`recommend approval`** | P1-CSQ-01：`schema.ts` 的 `promptGuidelines` 必须按方案 §3.7 两条原文逐字写入（不得只写摘要；保留「不能写 true/false」与「不要因查询成功就认为文档已通过校验」）。P1-CSQ-02：topic 模式截断标记由 A0b 实现，A2 增加超长注入测试（见 A2）。 | A0（P1-CSQ-01）；A0+A2（P1-CSQ-02） |
| A1 编排 | **`recommend approval`** | P1-CSQ-03：§1 的「文本不出现字面 `taskKind`/`flowId`/`moduleId`」必须更正为「全文不出现字面 `taskKind`；`flowId`/`moduleId` 仅限制在首两行（实际第二行）」。P1-CSQ-04：AC-15 正例明确 roster 文档用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`、modules 文档用 `PROJECT_MODULES_SCHEMA_EXAMPLE`，不得把完整 `contractSchemaText("roster")` 当 roster 文件。P1-CSQ-05（建议）：AC-10 补错误码 `roster-topology-mismatch` 不变与「多余 id 不报错」用例。P1-CSQ-06（记录）：`management` 空串显示口径（`string（空）` vs 方案 §4.2 简写「string」）在实现记录中固定。 | A1 |
| A2 桌面窗口 | **`recommend approval`** | P1-CSQ-07：为三个 topic 的 session 输出补 `!text.includes("taskKind")` 断言（V1 AC-8 证据第 3 项）；A1 文本测试亦可同时锁。P1-CSQ-02：`rejection-copy.test.ts` 用超长注入 `fn` 验证 topic 专用截断标记 `\n…（已截断）`（不是 `run manifest` 标记）。P1-CSQ-08：`rejection-copy` 的 topic 用例依赖 A0b 已落地，A2 入口/证据中记录该前置。P1-CSQ-09（建议）：`describeTool("contract_check")` 的 `topic.enum`/`required` 用例在 `rejection-copy.test.ts` 落地；若不写，A2 证据记录 K1.9 未测（不判 fail）。 | A2 |
| A3 门禁引擎 | **`recommend approval`** | P1-CSQ-10：`@deprecated` 历史注释**保留不改**（见 §八 A3-1）；卡长 4612 B/27 行接受；活动路径核对已成立。无其它必须修改项。 | A3 |

### 2.1 A0（运行时核心）

- **契约形状正确**：枚举/类型放 `src/model/runtime.ts`（`CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic?`），`tools.ts`/`schema.ts` 只 import；工具层不 import `workflow-preconditions.ts`，符合方案 §3.1/§3.4、团队计划 §4.2/§5.1 与五层依赖方向。
- **topic 解析正确**：读取原始 `call.args["topic"]`（明确不能用 `readStringArg`，否则非字符串被静默当作缺省，违反 AC-6）；`undefined`/`null`/空串/仅空白 → legacy；非字符串 → `ok:false`「应为字符串」；未知非空串 → `ok:false` 并列出三值、有界回显；合法 trim 后透传；`input` 仅在有合法 topic 时带 `topic`，legacy `seenInput` 深比较不变。
- **顺序正确**：现有角色隔离（`:2424-2426`）→ topic 校验 → 数据源；角色隔离先于 topic，即使 topic 合法也拒绝其他角色。
- **截断标记正确**：topic `\n…（已截断）`、legacy 逐字不变、`CONTRACT_CHECK_MAX_BYTES=4096` 不变；数据源空/非字符串与异常兜底沿既有路径，注册条件不变。
- **唯一发现问题**：§4 对 `promptGuidelines` 只写了摘要（P1-CSQ-01）；实现须按方案 §3.7 逐字写入两条。A0 自检仅 `npm run typecheck`、A0b 行为由 A2 覆盖的声明诚实（P1-CSQ-08）。

### 2.2 A1（编排）

- **单一定义与文本构造正确**：只 `import type` `ContractSchemaTopic`；`contractSchemaText(topic: ContractSchemaTopic): string` 与 A2 的 `contractSchemaText(input.topic)` 调用一致；三示例常量导出、roster 示例插值 topology 示例、文本用 `PROJECT_*_SCHEMA` 常量插值、三块 ≤4096 B（roster ≤3900 B）。
- **错误文案与语义正确**：`describeContractValue` 口径与方案 §4.1 一致；四字段顺序 `name → purpose → publicContract → architectureSource`、命中第一个非法字段即返回；`purpose`/`responsibility` raw-vs-effective、`purpose:true` 显示 `boolean: true`、`purpose:""` 不回退；错误码 `roster-module-fields-missing`/`modules-doc-fields` 不变；topology 三处文案与方案 §4.2/§4.3 一致；宽容读取（单字符串、过滤非字符串项、多余 id）不变。
- **测试映射完整**：AC-1/2/3/9/10/11/15/17/18 均有具体用例；卡断言在 A3 后追加；写集为 1 源码 + 2 测试。
- **必须澄清两点**：§1 对 `flowId`/`moduleId` 的「全文不出现」表述与方案 §3.5 文本（`<flowId>` 字段名/占位必然存在）及自身 §5「无字面 `taskKind`」矛盾（P1-CSQ-03）；AC-15 正例的 roster 文档必须用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`，不是完整 schema 文本（P1-CSQ-04）。两项不改变契约/写集/AC，A1 实施前更正即可。

### 2.3 A2（桌面窗口）

- **接线正确**：`contractCheckText` 第一条可执行语句为 `if (input.topic !== undefined) return contractSchemaText(input.topic);`，早退在 `getListing`/`refreshListingNow` 与任何写盘之前；import 加入既有 `workflow-preconditions.ts` 导入块，不新增依赖边；legacy 路径逐字不变；session 不预截断，工具层 `truncateUtf8` 以 `CONTRACT_CHECK_MAX_BYTES` 兜底。
- **测试计划覆盖 AC-4/5/6/7/8/12/13/16**：topic 透传、未知/非字符串、角色隔离、并存参数、三 topic ≤4096 B、空/空白/null legacy、legacy `seenInput` 深比较、空根 session 早退；工具描述可选。
- **必须补两点**：AC-8 证据第 3 项缺 `!text.includes("taskKind")` 断言（P1-CSQ-07）；topic 专用截断标记未测（P1-CSQ-02，非 AC 但方案 §3.3 要求）。**排期注意**：`rejection-copy` 的 topic 用例依赖 A0b 落地（P1-CSQ-08）；空根 fixture 使用既有 harness（`getListing` 对同一 root 返回角色表）可行，若 `open` 仍需最小项目文件，可写最小空项目但不得创建 run/flow，并在证据中记录。

### 2.4 A3（门禁引擎）

- **卡文本逐字正确**：两行与方案 §5.1 完全一致（直引号/反引号），插入位置在产物说明（`:183`）之后、`名单是人事招人的唯一依据`（`:184`，全文唯一）之前；模拟插入 +366 B → 4612 B / 27 行，四条 A1 正则命中，`view-image-cards` 禁用项零命中；只改 `RAPPORTEUR_CARD_TEXT`，不改权限/边界/判定。
- **活动路径已核实**：`governanceRoleOf("rapporteur")` 注册表 `:329-332` → `resolve-role.ts:97-98` → `run-role.ts:1455` → 各 Provider `role.cardText`；`@deprecated` 注释是 `c2b6cf9` 删除 `LIAISON_CARD_TEXT` 的残留，不是停用声明。A3 的结论与引用成立。
- **无必须修改项**；P1-CSQ-10 记录注释保留决策；卡长/活动路径决策见 §八。

## 三、跨提案一致性核对

| # | 核对项 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | topic 仅 `topic`、无别名 | **一致** | A0 §9-2（不取 `schema`/`topic_kind`）；A2 §7-2 同口径；A1/A3 不涉入参。 |
| 2 | `ContractSchemaTopic`/枚举单一来源 | **一致** | A0a 在 `src/model/runtime.ts` 定义；A0b `tools.ts`/`schema.ts` 只 import；A1 只 `import type`；A2 经 `ContractCheckInput.topic` 消费，不复制枚举。 |
| 3 | 工具层不 import 编排 | **一致** | A0 §5/§7-4 明确；`tools.ts`/`schema.ts` 只依赖 `model/runtime.ts`；A1 文本经 `ContractCheckFn` 注入而非工具层直连。 |
| 4 | A1 `contractSchemaText(topic)` 签名与 A2 调用 | **一致** | A1：`(topic: ContractSchemaTopic) => string`；A2 首句 `input.topic !== undefined` 后调用，类型收窄正确。 |
| 5 | topic 截断标记 / `CONTRACT_CHECK_MAX_BYTES` | **一致（测试待补）** | A0/A2 均为 topic `\n…（已截断）`、legacy `\n…（已截断，完整规则见 run manifest）`；4096 不变；P1-CSQ-02 补测试。 |
| 6 | 空/空白/null 语义 | **一致** | A0：`undefined`/`null`/`""`/仅空白 → legacy；合法 trim 后接受；非字符串拒绝；A2 测试覆盖（AC-16）。 |
| 7 | 角色隔离先于 topic | **一致** | A0 §3：隔离 `:2424-2426` 逐字不动 → topic；A2 测试 `{topic,roleId:"other"}` 拒绝且数据源未调用。 |
| 8 | A2 第一句早退 | **一致** | A2 §2 代码块第一条可执行语句；早退前无 `getListing`/`refreshListingNow`/写盘；AC-12 以 diff 核对。 |
| 9 | A3 卡文本与 A1 断言字符串 | **一致** | A3 两行原文 + A1 四条正则；只读模拟全部命中（见 §1.2）。 |
| 10 | `trio-worker-report` 断言在 A3 后由 A1 追加 | **一致** | A1 §2/§3、A3 §5、团队计划 §4.3/§5.2 同口径；A3 不写该测试。 |

**结论**：跨提案无契约冲突；唯一跨文本一致性问题是 A1 §1 的 `flowId`/`moduleId` 绝对表述（P1-CSQ-03），属提案措辞，不改契约。

## 四、契约冻结核对

| 冻结点 | 提案 | 冻结形状 | 核对结果 |
| --- | --- | --- | --- |
| Model 枚举/类型/字段 | A0a | `CONTRACT_SCHEMA_TOPICS = ["modules","roster","topology"] as const`；`ContractSchemaTopic`；`ContractCheckInput.topic?: ContractSchemaTopic` | 与方案 §3.1/团队计划 §4.3 逐字一致；`ContractCheckFn`/既有字段/返回类型不变。 |
| 工具参数/描述 | A0b | `topic: { type:"string", enum:[...CONTRACT_SCHEMA_TOPICS], description: "Optional schema topic; returns that document's field table and minimal valid YAML example (read-only; no run summary)" }`；description 追加；`required`/`additionalProperties:true` 不变 | 参数与 description 逐字一致；`promptGuidelines` 必须用方案 §3.7 两条原文（P1-CSQ-01）；当前 schema 无 `required`，保持无 `required` 即满足 K1.9。 |
| schema 文本/示例/错误文案 | A1 | 三个 topic 文本、三个示例常量、`contractSchemaText(topic)`、`describeContractValue`、四字段与 topology 文案 | 文本模板与方案 §3.5/§4.1/§4.2/§4.3 一致；错误码/接受拒绝集合不变；A1 §1 的 `flowId`/`moduleId` 绝对表述需更正（P1-CSQ-03）；`management` 空串显示口径记录（P1-CSQ-06）。 |
| session 早退 | A2 | `contractCheckText` 第一条语句 `if (input.topic !== undefined) return contractSchemaText(input.topic);`；import 既有编排模块 | 与方案 §3.3 逐字一致；legacy 逐字不变；不预截断。 |
| 策划卡文本 | A3 | `RAPPORTEUR_CARD_TEXT` 两行（方案 §5.1 原文）；位置在产物说明之后、`名单是人事招人的唯一依据` 之前 | 逐字/位置/字节均核对成立；`@deprecated` 注释保留（P1-CSQ-10）。 |
| 错误码/命名/字段 | A1/A0 | roster `roster-module-fields-missing`、modules `modules-doc-fields`、topology 既有 `roster-topology-mismatch` 等不变 | 无错误码变化；无字段/命名冲突；`ContractSchemaTopic` 单数、`CONTRACT_SCHEMA_TOPICS` 复数与方案一致。 |

**结论**：契约冻结项无字段、命名、错误码或结构冲突；需落地的只是 A0 的 promptGuidelines 原文、A1 的两处措辞澄清与一处记录口径（均为文案/测试层，不改变契约）。

## 五、写集、边界与非目标核对

| 提案 | 提案写集 | 团队计划 §4.1/§4.3 | 新增文件 | 结论 |
| --- | --- | --- | --- | --- |
| A0 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` | A0a/A0b 同三文件 | 无 | 通过；`src/model/runtime.ts` 唯一写入；无测试/编排/桌面/门禁写入。 |
| A1 编排 | `src/common/编排/workflow-preconditions.ts`、`test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts` | 1 源码 + 2 测试（含 A3 后卡断言） | 无 | 通过；卡断言在 A3 后追加；不写 model/provider/desktop/门禁。 |
| A2 桌面窗口 | `app/desktop/session.ts`、`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts` | 1 源码 + 2 测试 | 无 | 通过；不写 `interface.ts`/`main.ts`/`preload.cjs`/`renderer/**`/`src/**`。 |
| A3 门禁引擎 | `src/common/门禁引擎/governance-roles.ts` | 1 源码 | 无 | 通过；`test/门禁引擎/**` 只读回归，不写 `trio-worker-report.test.ts`。 |

- 合计产品/测试写集 **10 个路径**，与团队计划 §4.1/§4.3、方案 §10.2 完全一致；**无新增文件、无新增依赖、无新增工具、无 i18n key、无边界变更（B-0，H1 不适用）**。
- 单写者/串行：A0a 先冻结 `runtime.ts`；A0b/A1/A3 写集不相交可并行；A2 待 A0a+A1（工具层用例还依赖 A0b）；A1 卡断言待 A3；D1 只用同一候选只读取证。提案均遵守，无越界写入。
- 非目标：不放宽/收紧 parser 接受拒绝集合、不兼容 `management.roles`、不强制 `architectureSource` 路径、不改权限/闸门/验收/证据、不改运行项目文档；四份提案一致。**未发现写集外路径或边界变更需求。**

## 六、AC-1–AC-18 与 K1–K8 覆盖

### 6.1 AC 映射

| AC | 产出提案/证据落点 | 覆盖判断 | 备注 |
| --- | --- | --- | --- |
| AC-1 | A1 `workflow-preconditions.test.ts`：示例 parser `ok:true` + `modules[]` `deepEqual` | 覆盖 | — |
| AC-2 | A1：roster 示例 `includes` topology 示例 | 覆盖 | — |
| AC-3 | A1 三块文本字节 ≤4096/roster ≤3900；A2 工具/session 输出 ≤4096 | 覆盖 | A2 的 topic 截断标记另见 P1-CSQ-02。 |
| AC-4 | A2 `rejection-copy.test.ts`：`seenInput.topic === "roster"` | 覆盖 | — |
| AC-5 | A2：`{topic:"foo"}` `ok:false`、列三值、`seenInput === undefined` | 覆盖 | — |
| AC-6 | A2：`{topic:123}` 及 boolean/array/object 拒绝、含「应为字符串」 | 覆盖 | — |
| AC-7 | A2：`{topic:"roster",roleId:"other"}` 拒绝、数据源未调用 | 覆盖 | — |
| AC-8 | A2 `run-pin`/`rejection-copy`：无 legacy 行、并存参数 topic 优先；A1 文本无字面 `taskKind` | **基本覆盖，缺一条断言** | P1-CSQ-07：补 `!text.includes("taskKind")`（V1 §3.8 证据第 3 项）；A2 现有行断言不足以证明该子项。 |
| AC-9 | A1：四字段 × 空/非字符串矩阵、`purpose` raw-vs-effective、`boolean: true`、错误码不变 | 覆盖 | — |
| AC-10 | A1：mapping/缺角色/宽容读取/v1 提示 | 覆盖 | P1-CSQ-05 建议补错误码与多余 id 断言。 |
| AC-11 | A3 卡文本 + A1 `trio-worker-report` 断言 + D1 门禁回归 + 活动路径 | 覆盖 | 卡断言必须在 A3 后追加。 |
| AC-12 | A2 首句早退 + 无 run 空根测试 + 代码审查 | 覆盖 | 空根 fixture 见 §八 A2-1。 |
| AC-13 | A2 legacy `seenInput` 深比较 + run-pin legacy 输出/标记不变 | 覆盖 | 既有 `run-pin:573-660` 亦须保持。 |
| AC-14 | D1：双端 typecheck + §7.3 六套件 + T3 全量；A0/A1/A2/A3 各自 typecheck/受影响套件 | 覆盖（D1 负责） | P1 提案不产生 AC-14 证据。 |
| AC-15 | A1 `loadLatestRoster` 正例（示例常量）+ 五负例 | 覆盖，需澄清 fixture | P1-CSQ-04：roster 用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`，modules 用 `PROJECT_MODULES_SCHEMA_EXAMPLE`。 |
| AC-16 | A2：`null`/`""`/`"   "` legacy、`topic:123` 拒绝 | 覆盖 | — |
| AC-17 | A1：每 topic schema 常量恰 3 行且等于常量期望行 | 覆盖 | — |
| AC-18 | A1：roster 文本第三条警告；E2 真实项目只读抽查 | 覆盖（E2 负责子项） | 运行项目不可访问时按 V1 记 `not applicable`/`insufficient evidence`。 |

### 6.2 K1–K8

| K | 负责/证据 | 覆盖判断 |
| --- | --- | --- |
| K1（topic 契约） | A0/A2；K1.1–K1.8 在提案中均有落点 | 覆盖；K1.9 工具描述测试可选（P1-CSQ-09，未测不判 fail 但须记录）。 |
| K2（三示例/加载级） | A1 | 覆盖（AC-15 fixture 按 P1-CSQ-04）。 |
| K3（逐字段矩阵） | A1 | 覆盖。 |
| K4（topology management） | A1 | 覆盖；建议补错误码/多余 id（P1-CSQ-05）。 |
| K5（策划卡两行/断言/活动路径） | A3 + A1 + D1 | 覆盖；A3 活动路径已核实。 |
| K6（schema 常量单一来源） | A1 | 覆盖（AC-17 恰 3 行）。 |
| K7（占位 omissionReason） | A1 + E2 | 文本覆盖；真实项目抽查属 E2。 |
| K8（不变面） | A0/A1/A2/A3 非目标 + 写集核对 | 覆盖；未发现放行语义/权限/边界/依赖/文件变化。 |

**结论**：AC-1–AC-18 均有落点；唯一实际缺口是 **AC-8 证据第 3 项的字面 `taskKind` 断言**（P1-CSQ-07）。K1.9 为可选支持证据，K7 真实项目子项归 E2，AC-14 归 D1；不构成 AC 缺失。

## 七、T3 证据核对

- **档位**：团队计划 §1.2 与 V1 定为 **T3（不压档）**，依据是 `src/model/runtime.ts` 共享 Model 加法可选字段、`contract_check` 公共工具契约与策划卡治理文本；四份提案均按 T3 记录受影响套件 + D1 全量 + 双端 typecheck，未自行降档。与工程法案 §二.9 一致。
- **受影响套件**：编排 `test/编排/{workflow-preconditions,trio-worker-report}.test.ts`；桌面 `test/桌面应用/{rejection-copy,run-pin}.test.ts`；门禁 `test/门禁引擎/{view-image-cards,list-project}.test.ts`（只读回归）；运行时核心 `npm run typecheck`。B0 基线三组 **72/72 pass**，A1/A2/A3 与提案一致。
- **T3 全量**：B0 已记录 **393 文件 / 3462 tests / 3435 pass / 9 fail（全部既有 Windows symlink EPERM）/ 18 skip / 0 todo**、排除 `write-sequencing.test.ts` 的命令/原因；D1 必须对当前候选重跑并按 B0 对照「新增确定性失败 0、新增 skip 0」，不得把既有失败当通过。
- **双端 typecheck**：B0 `typecheck`/`typecheck:renderer` 均 exit 0；D1 重跑。A0 只做 typecheck、A0b 行为由 A2 测试覆盖的声明诚实；A1/A2/A3 均要求各自 typecheck。
- **Electron**：按 V1/团队计划不要求真实 Electron E2E、截图或录屏；B0 只记录 44.7.0 二进制/dist 存在、无运行进程；如运行 E2E 只作补充证据，不能写成默认通过。
- **可核对性**：B0 的证据目录含原始日志与哈希；四份提案均要求 before/after `git hash-object` + `sha256sum`、`git status --porcelain -uall | sort`、命令/退出码/计数/失败分类；候选由 D1 实际运行，E1 变更包复算。**P1 提案不提供实现证据，本审核不把任何提案自述当证据。**
- **日志规则**：本变更无新增 I/O、状态迁移或外部调用；不新增日志点符合工程法案 §二.10「必要处」；若实施发现可观察性需要，只使用既有 diagnostics/既有输出，不新增日志框架或依赖。

**结论**：T3 证据计划完整、可核对；无 Electron 要求；D1/E1/E2 为证据与判定 owner，P1 审核不代替它们。

## 八、PM 裁决点逐条回复

### 8.1 A0

| # | 事项 | PM 裁决 | 理由/边界 |
| --- | --- | --- | --- |
| A0-1 | 枚举导入方向 | **同意**：枚举/类型放 `src/model/runtime.ts`，工具层只 import；不放 `workflow-preconditions.ts` | 方案 §3.1/§3.4、团队计划 §4.2；避免 Provider 反向依赖编排。 |
| A0-2 | topic 参数别名 | **同意仅 `topic`**：不取 `schema`/`topic_kind`；模型误用其他键时视为缺省走 legacy | 方案/AC-4/6/16 只定义 `topic`；别名会扩大输入面与空值组合；schema 描述已宣传 `topic`，风险可接受；A0 证据记录该取舍。 |
| A0-3 | 空/空白判定 | **同意**：`undefined`/`null`/`""`/仅空白 → legacy；合法值 `trim()` 后接受（`" roster "` → `roster`）；非字符串拒绝；必须读原始 `call.args["topic"]`，不用 `readStringArg` | `readStringArg` 对非字符串静默返回 `undefined`，会违反 AC-6；方案 §3.2 表。 |
| A0-4 | 截断标记文案 | **同意**：topic `\n…（已截断）`；legacy `\n…（已截断，完整规则见 run manifest）` 逐字不变；`CONTRACT_CHECK_MAX_BYTES=4096` 不变 | 方案 §3.3；AC 未断言 topic 标记文本，但方案要求区分；P1-CSQ-02 由 A2 补防御测试。 |
| A0-5 | 与 A1 边界 | **同意**：工具层只校验枚举并透传 `input.topic`；schema 文本/字节预算由 A1 `contractSchemaText` 产生、经注入 `ContractCheckFn`（A2 会话）返回；工具层不 import 编排 | 方案 §3.4/团队计划 §4.2；分层要求。 |
| A0-6 | topic 模式 `fn` 异常文案 | **同意沿用 legacy 兜底、保持逐字不变**；不新增 topic 专用异常文案 | 方案/AC 未要求；新增文案会扩大契约面；该文案提及 pin/写区虽不完全贴合 topic，但无功能影响；如未来要改，另立文案变更并补 AC。 |

### 8.2 A1

| # | 事项 | PM 裁决 | 理由/边界 |
| --- | --- | --- | --- |
| A1-1 | 错误文案措辞 | **按方案 §4.1/§4.2/§4.3 模板逐字实现**；`<N>` 1-based；`publicContract` 追加「不能写 YAML 布尔 true/false」、`architectureSource` 追加「应为项目相对路径…」；不得同义替换/润色；测试锁定最终文案 | 已确认方案文本；AC-9/AC-10 以文案为判定观察点；任何改字需重新核对 V1/AC。 |
| A1-2 | `describeContractValue` | **同意**：内部 helper；`未提供`/`null`/`string（空）`/`string`/`boolean: true/false`/`number: <v>`/`array(N)`/`object（mapping）`；不回显字符串内容；`purpose` raw-vs-effective 按方案 §4.1 | 方案 §4.1；`purpose:true` 必须显示 `boolean: true`、`purpose:""` 不回退。 |
| A1-3 | 字节预算 | **同意**：三块 ≤4096 B、roster ≤3900 B（草案 2438/3763/1265 B，实现后 ±数 B 可接受）；任何新增字段先压缩或拆子 topic（拆子 topic 属方案变更，重开闸门 1）；不得依赖工具截断掩盖超限 | 方案 §3.5/§8.2、AC-3、V1 K1.8；roster 余量仅约 137 B（对 3900 守卫）。 |
| A1-4 | `flowId`/`moduleId` 字面表述 | **必须更正（P1-CSQ-03）**：全文只禁止字面 `taskKind`；`flowId`/`moduleId` 只禁止出现在首两行（实际第二行）；`<flowId>` 占位与 `flowId:` 字段名是方案 §3.5 要求，不能被删 | 方案 §3.3、V1 §3.8 证据第 3 项、A1 自身 §5「无字面 `taskKind`」；若按 A1 §1 绝对表述实现会破坏 schema 字段表。 |
| A1-5 | AC-15 正例 fixture | **必须澄清（P1-CSQ-04）**：roster 文档用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`（内含 topology 示例），modules 文档用 `PROJECT_MODULES_SCHEMA_EXAMPLE`；不得把完整 `contractSchemaText("roster")` 输出当 roster 文件（含字段表，parser 会失败） | 方案 §3.6、V1 AC-15、P1.2 复核实测「两个示例 + intent/proposal/architecture → loadLatestRoster ok:true」。 |
| A1-6 | `management` 空串显示 | **记录口径（P1-CSQ-06）**：`describeContractValue("")` 返回 `string（空）`，方案 §4.2 简写「字符串 → string」；建议按 helper 一致（`string（空）`）并在实现记录说明；不新增 AC | 方案未给空串 management 的精确断言；两者均为提示文案，不影响放行；不得实现成两种不一致口径。 |

### 8.3 A2

| # | 事项 | PM 裁决 | 理由/边界 |
| --- | --- | --- | --- |
| A2-1 | 空根 fixture | **同意**用既有 `run-pin` harness 的空临时根（不 `writeProject`；harness `getListing` 对同一 root 返回角色表），`open` 后从 `h.contractChecks.<role>` 调 `{topic:"modules"}` 断言返回 schema 文本；若 `open` 仍需最小项目文件，可写最小空项目但**不得创建 run/flow**，并在证据中记录 | AC-12/AC-8 需要「无 run/项目根可用」行为证据；零磁盘读仍由源码 diff 证明，不把行为测试当结构证明。 |
| A2-2 | 早退位置 | **同意**：必须是 `contractCheckText` 第一条可执行语句（注释不算）；diff 仅 import + 首句；早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile` | 方案 §3.3、AC-12、K1.2；A2 §2 代码块正确。 |
| A2-3 | legacy 不变 | **同意**：现有 `rejection-copy:161-198`、`run-pin:522-545`、`run-pin:573-660`、`:257` 的 legacy 用例全部保持；`seenInput` 深比较、legacy 输出、session/tool 截断标记逐字不变 | AC-13/K1.7；新增 import+首句不得改变 legacy 文本或调用参数。 |
| A2-4 | AC-8 字面 `taskKind` | **必须补（P1-CSQ-07）**：三个 topic 的 session 输出加 `!text.includes("taskKind")`；可在 `run-pin` 或 `rejection-copy`；A1 文本测试可同时锁 | V1 §3.8 证据第 3 项；现有「不以 `^taskKind .*必填` 开头」的行断言不足。 |
| A2-5 | topic 截断标记 | **建议补（P1-CSQ-02）**：用超长注入 `fn`（如 `"x".repeat(10000)`）在 `{topic:"roster"}` 下断言输出 ≤4096 且含 topic 标记（不是 `run manifest` 标记） | 方案 §3.3 要求标记区分；非 AC，但防御性测试成本低；P1-CSQ-02 与 A0b 共同闭环。 |
| A2-6 | A0b 依赖 / 工具描述 | **排期记录（P1-CSQ-08）**：`rejection-copy` 的 topic 用例依赖 A0b 已落地；A2 入口/证据写明 A0b 完成状态。**P1-CSQ-09（建议）**：`describeTool("contract_check")` 的 `topic.enum`/`required` 用例放 `rejection-copy`；不写则记录 K1.9 未测 | 团队计划 §4.3 说明 A0b 行为由 A2 测试覆盖；K1.9 在 V1 中为可选支持证据，未测不判 fail 但须记录。 |

### 8.4 A3

| # | 事项 | PM 裁决 | 理由/边界 |
| --- | --- | --- | --- |
| A3-1 | `@deprecated` 历史注释 | **保留不改（P1-CSQ-10）**；记录其来源（`c2b6cf9` 删除 `LIAISON_CARD_TEXT` 残留）与活动路径事实 | 改注释属另一文案整理，不在 A3 两行写集；清理会扩大 diff 并与 A1/AC-11 证据同步；本任务不做。 |
| A3-2 | 卡长 | **接受 4612 B / 27 行（+366 B）**；无硬上限；若 PM/策划要求控制长度，备选仅保留第一行，需方案 §5.2/§8.4 变更并重开闸门 1，本次不采纳 | 方案 §5.2/§8.4；实测与复核一致；`view-image-cards` 只查禁用项。 |
| A3-3 | 活动路径 | **核对成立**：注册表 `:329-332`、`resolve-role.ts:97-98`、`run-role.ts:1455`、各 Provider `role.cardText`；实施若发现已非活动路径，**停止并回报统筹/策划**，不改未授权路径/不擅自迁移 | 团队计划 §4.3/§9.2；`@deprecated` 不是停用声明。 |
| A3-4 | 文案精确措辞 | **逐字使用方案 §5.1（含直引号/反引号）**；不改字；改字会使 A1 正则/AC-11 失效，需先同步文案再实施 | 方案 §5.1；A1 四条正则与模拟全部命中。 |
| A3-5 | 与 A1 断言对齐 | **确认**：A1 在 A3 卡文本落地后追加四条断言；A3 不预写测试、不改 `trio-worker-report.test.ts`；若 A1 复审要求不同正则，先同步文案再实施 | 团队计划 §4.3/§5.2；单写者规则。 |

## 九、未解决项、复审要求与限制

### 9.1 未解决项

1. **P1-CSQ-01（A0）**：`schema.ts` 的 `promptGuidelines` 必须按方案 §3.7 两条原文写入；A0b 退出证据须含该文本的只读核对；`describeTool("contract_check")` 的 `topic` 检查由 A2 在 `rejection-copy.test.ts` 落地，或由 A0b 以只读命令记录（K1.9 为可选支持证据）。
2. **P1-CSQ-02（A0/A2）**：topic 模式截断标记 `\n…（已截断）` 的实现与 A2 超长注入测试；不要求改 AC，但方案 §3.3 要求区分标记。
3. **P1-CSQ-03（A1）**：更正 A1 §1 的 `flowId`/`moduleId` 绝对表述；实现/测试按「全文无字面 `taskKind`；`flowId`/`moduleId` 只在第二行禁止」执行；A1 实施记录写明。
4. **P1-CSQ-04（A1）**：AC-15 正例 fixture 明确使用两个示例常量；`loadLatestRoster` 正例必须用 `PROJECT_MODULES_SCHEMA_EXAMPLE` 作 modules 文档、`PROJECT_ROSTER_SCHEMA_EXAMPLE` 作 roster。
5. **P1-CSQ-05/06（A1，建议/记录）**：AC-10 补错误码/多余 id 断言；`management` 空串显示口径记录。
6. **P1-CSQ-07（A2）**：AC-8 字面 `taskKind` 断言；P1-CSQ-08/09（A2）排期依赖与 K1.9 记录。
7. **P1-CSQ-10（A3）**：`@deprecated` 注释保留记录；无改代码要求。

以上均**不构成阻断项**：不改变契约形状、写集、边界、档位、AC 或客户确认范围；可在各角色实施前/实施记录中落实。若任何角色认为需要改变上述任一项的契约/写集/AC/范围，**停止并回报统筹/沟通**，按方案 §8.6/§11 与团队计划 §5.2/§6.4 重开 P1/闸门 1/2。

### 9.2 复审要求

- 本记录只对文首四份提案版本（行数/SHA-256 见 §1.1）有效；任一提案实质改动（契约形状、写集、测试映射、AC 范围、T3 口径）后，须提交新版本并重新核对受影响项；仅文字澄清（P1-CSQ-03/04）与测试补充（P1-CSQ-07）不要求完整重审，但 A1/A2 退出证据须逐项引用本记录并说明落实。
- 复审至少覆盖：A0b 的 promptGuidelines/`topic` schema；A1 的文本/示例/错误文案/AC-8/AC-15；A2 的早退/AC-8/截断标记/legacy；A3 的卡文本/活动路径；写集仍为 10 个路径；T3 仍为团队计划/V1 口径。
- 不把本审核当作 V1、客户实施授权、D1 证据或独立验收结论；若 V1 的 AC/K 口径或客户确认版本变化，本记录中受影响结论失效并重审。

### 9.3 限制

- 未运行任何测试、typecheck、应用、Electron/E2E；未实施代码；卡片字节/正则来自只读内存模拟，不代替 A3 实施后的真实测量。
- 未逐行读完 `session.ts`、`tools.ts`、`workflow-preconditions.ts` 等大文件；只读核对与 `contract_check`、schema 文本、错误文案、角色卡、loader、测试相关段落。
- 未另启其它角色的独立评估上下文；四份提案为各自 owner 的书面提案，跨角色依赖已在其正文声明；未发现未解决分歧。若后续出现 owner 间分歧，按 `references/proposal-review.md` 的受影响角色评估/会议流程处理。
- `角色卡/项目管理/docs/project-rules.md` 为草稿；本次只核对相关已确认条目，不把未确认内容当约束。
- B0 计数为转引；D1 必须以当前候选原始输出复核，不能引用本记录的转引作为证据。

## 十、总体结论

**`recommend approval`。**

- 四份提案均 `recommend approval`：契约形状/单一来源/分层/写集/AC-1–AC-18 映射/T3 口径/非目标与团队计划 §4–§7、方案 P1.3、V1 一致；未发现阻断项或需要重开闸门 1/2 的实质变化。
- 需在各自实施前落实：A0 的 promptGuidelines 原文（P1-CSQ-01）；A1 的两处措辞澄清（P1-CSQ-03/04）；A2 的 AC-8 断言与截断标记测试（P1-CSQ-07/02）；A3 的注释保留记录（P1-CSQ-10）。均为文案/测试/证据层，不改变契约、写集、档位或 AC。
- **可进入 A0a（Model 冻结）**：`src/model/runtime.ts` 的 `CONTRACT_SCHEMA_TOPICS`/`ContractSchemaTopic`/`ContractCheckInput.topic?` 可先落地；之后 A0b/A1/A3 按团队计划并行，A2 待 A0a+A1（工具层用例还依赖 A0b），A1 的卡断言待 A3，D1/E1/E2/E3 按序。P1 审核**不代替** V1、客户实施授权、D1 测试或独立验收，也不授权 commit/push/merge/release。
- **客户确认事项**：无新增。本审核的全部条件均在客户已确认的 P1.3（911 行 / `4d61d376…`）、V1（725 行 / `11001844…`）与团队计划（539 行 / `a93bd02f…`）范围内；若 A1/A2 的澄清被认为需要改变契约、AC、写集或范围，则按 §9.1 停止并回报统筹/沟通，重开对应闸门，不自行扩大授权。

---

**本文件状态：P1 审核记录；结论 `recommend approval`；未修改四份提案/方案/团队计划/V1/沟通/验收/角色卡/边界，未实施、未运行测试/typecheck/E2E、未 commit/push。**
