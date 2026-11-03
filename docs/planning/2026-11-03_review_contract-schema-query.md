# 给内置策划一个可查询的文档 schema（`contract_check` topic）方案复核记录

- 复核对象：`docs/planning/2026-11-03_design_contract-schema-query.md`（版本 **P1.0**，2026-11-03；**802 行**；SHA-256 `e20c3fd72352238a2b58026ddbfcab6b09fb5ef03212725544f2d3fe67a3b2e5`；复核按该快照只读，未改方案正文）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：跨 Model / 编排 / Provider / 桌面 / 门禁多模块；新增公共工具参数与 `ContractCheckInput` 可选字段；修改角色卡与三份文档 schema 文本；涉及验收标准与错误契约，不满足轻量条件）
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、现有代码/测试与本地快照；只写本复核记录）
- 闸门 0 记录：`docs/communication/2026-11-03_intent_contract-schema-query.md`（**64 行**；SHA-256 `2c11b726b9cde5d14c6d4b9f4f3d8800f6e01afddd2c061b25230975f914931c`；客户确认 Q1–Q4 按推荐 A/A/A/A；闸门 0 确认记录在本文件 lines 60–64）
- 复核日期：2026-11-03
- 代码基线：worktree `flow-improvements-wave1` HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`（与方案头一致）；历史设计 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 1330 行 / SHA-256 `4a13e99b0b0dbb4aeb9141ed4a15fdddd4ec5021b88146589bdf1f4f8030e6b6`（与方案头一致）
- 说明：本记录只作建议，不是批准、客户闸门、实施授权或验收基线；方案正文只由作者处置。复核未改方案、代码、测试、意图、沟通或验收文件，未 commit/push。

## 独立核对过的事实（只读）

### 1. 快照、意图与基线

- 复核对象与任务输入的行数、SHA-256 一致；方案头引用的意图快照（64 行 / `2c11b726…`）与当前 worktree 的意图文件一致。
- 意图文件当前含闸门 0 确认记录（lines 60–64）：客户原话、Q1–Q4 A/A/A/A、非目标（不放宽校验、不自动修复、不改写权/权限/闸门/验收）、下一步（方案需覆盖查询面、字段/示例、错误文案、角色卡、测试与验收标准）。方案 §2 与 §9 的内容与该记录一致。
- 任务提示「意图文件在快照后追加了闸门 0 记录、当前文件更长」在本 worktree 未出现：当前文件为 64 行且哈希恰为方案头引用的快照哈希；若沟通手上另有更长版本，闸门 1 前应以该版本再核对一次内容，而不是以行数为准。
- 历史设计 §5.2 的字段/示例已读；方案 §8.3 对历史设计两处超出实现口径的记录（`category` 2–64 vs 解析器 1–32；治理路径父目录 vs 解析器只匹配治理前缀/子路径）经实测成立（见 §3 边界测试）。

### 2. 相关代码/测试位置

已只读核对并在 HEAD 上成立：

- `src/model/runtime.ts:1139-1148`：`ContractCheckInput`（`flowId`/`roleId`/`taskKind`/`moduleId`）与 `ContractCheckFn`。
- `src/provider/runtime/tools.ts:139-140`：`CONTRACT_CHECK_TOOL_NAME` 与 `CONTRACT_CHECK_MAX_BYTES = 4096`；`:2417-2465`：`makeContractCheckTool`（角色隔离在 `:2424-2426`；数据源空/非字符串在 `:2453-2455`；legacy 截断标记在 `:2456`）；`:3499-3501`：仅当注入 `contractCheck` 时注册。
- `src/provider/runtime/schema.ts:630-651`：`contract_check` 参数与描述；该文件 `:2` 已从 `src/model/runtime.ts` 导入 `GOVERNANCE_SLUG_PATTERN`。
- `app/desktop/session.ts:8095-8203`：`contractCheckText`；第一条可执行语句是 `getListing`（`:8096`），随后 `refreshListingNow`（`:8097`）；会话层 4 KiB 截断在 `:8194-8202`；`contractCheck` 对所有角色注入（`:2545-2546`）。
- `src/common/编排/workflow-preconditions.ts`：schema 常量 `:24-28`；`validateRosterTopology` `:294-419`（schema 不匹配提示 `:328`；`management` 归一化与报错 `:334-351`）；`parseProjectRoster` `:443-724`；`parseProjectModules` `:727-840`；`loadLatestRoster` `:896-1068`；`validateAppointmentCardAgainstRoster` `:1087-1133`。
- `src/common/门禁引擎/governance-roles.ts:178-193`：`RAPPORTEUR_CARD_TEXT`；新增位置在 `:183` 产物说明之后、`:184` 名单句之前。
- 测试：`test/桌面应用/rejection-copy.test.ts:161-198`（现有 `contract_check` 只读/角色隔离/4 KiB 用例）；`test/桌面应用/run-pin.test.ts:522-545`（现有 session 级 `contract_check` 用例）；`test/编排/trio-worker-report.test.ts:195-204`（现有策划卡断言）；`test/门禁引擎/view-image-cards.test.ts:16-47`（只检查卡文本禁用项，不检查长度）。
- 分层/依赖：`schema.ts` 与 `tools.ts` 已有从 `model/runtime.ts` 的值导入先例；`app/desktop/session.ts:135-142` 已从 `workflow-preconditions.ts` 导入；`dispatch-advisories.ts:11` 用 `import type` 反向引用 `workflow-preconditions.ts`，运行期无环。方案把枚举/类型放 `src/model/runtime.ts`、文本/示例/解析 helper 放 `workflow-preconditions.ts`、工具层只导入枚举的安排，未发现循环依赖或非法层间调用。

### 3. 真实解析器与字节数核对（只读、内存）

核对方法：用 Node 24（本机 `v24.22.1`，直接运行 `.ts` 类型剥离）动态 `import()` `src/common/编排/workflow-preconditions.ts`；用临时脚本（在系统临时目录，未写入仓库）从方案 §3.5 的三个 ````text` 块提取“完整文本”，再从各块提取最小示例常量，分别调用真实 `parseProjectModules` / `parseProjectRoster`。方案 §3.6 的测试实际解析的是示例常量，不是带字段表头的完整文本；以下两种对象都测了。

命令形态（只读；实际脚本在临时目录，未入库）：

```bash
node --input-type=module -e "const m = await import('file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/flow-improvements-wave1/src/common/编排/workflow-preconditions.ts'); const r = m.parseProjectRoster(exampleText, 'demo'); console.log(JSON.stringify(r));"
node --input-type=module -e "const g = await import('file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/flow-improvements-wave1/src/common/门禁引擎/governance-roles.ts'); console.log(Buffer.byteLength(g.governanceRoleOf('rapporteur').cardText, 'utf8'));"
```


**完整文本块字节数（UTF-8）：**

| topic | 无尾随换行 | 加一个换行 |
| --- | --- | --- |
| `modules` | **2308 B** | 2309 B |
| `roster` | **2972 B** | 2973 B |
| `topology` | **1310 B** | 1311 B |

与方案 §3.5 的 2308 / 2972 / 1310 完全一致；三者均低于 4096，最小余量为 1124 B（>1 KiB）。

**最小示例常量（从 §3.5 提取）：**

| 示例 | 字节数 | 真实解析结果 |
| --- | --- | --- |
| `PROJECT_MODULES_SCHEMA_EXAMPLE` | 282 B | `parseProjectModules(..., "demo")` → `ok:true`，modules `["core"]` |
| `PROJECT_ROSTER_SCHEMA_EXAMPLE` | 822 B | `parseProjectRoster(..., "demo")` → `ok:true`，roles `["implementer"]`，modules `["core"]`，`envBootstrap={omitted:true, omissionReason:"最小示例省略装配/入口角色"}`，引用为 `docs/product/demo-intent-v1.md` |
| `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE` | 171 B | 作为 roster 示例的 ```topology 块随 roster 解析通过 |

- `rosterExample.includes(topologyExample)`、完整 `roster` 文本包含 `roster` 示例、完整 `roster` 文本包含 `topology` 示例、完整 `modules` / `topology` 文本包含各自示例，均为 `true`（支持 §3.6 的 `<text>.includes(<example>)` 断言方向）。
- 方案 §1.5 的基线复现与当前 HEAD 完全一致：把 roster 示例的 `publicContract` 改成 `true` / `false` / `""`、缺 `name`、`name:null` / `name:""`、`purpose:true`、`architectureSource:false`，均返回 `roster-module-fields-missing`，reason 仍为 `模块 core 缺 name/purpose/publicContract/architectureSource（均须非空）。`；把 `management` 改成 mapping 返回 `roster-topology-mismatch` / `拓扑图 management 必须含 convener（运营管理项目角色）。`；`management: [convener]` 返回 `拓扑图 management 缺项目角色 implementer（运营对项目角色的管理关系不完整）。`；topology v1 返回方案 §4.3 所列旧 schema 提示。
- `management: [convener, implementer, 5]` 通过（数组内非字符串被过滤）；`management: convener` 只当一元数组，因缺 implementer 报错；与方案 §4.2「既有宽容读取、本次不改」一致。
- modules 文档侧同样复现：`publicContract:true`、缺 `name`、`name:null`、`name:42`、`architectureSource:false`、`purpose:""`、`purpose:true` 均返回 `modules-doc-fields` 与合并 reason `模块清单 core 缺 name/purpose/publicContract/architectureSource。`；`responsibility` 兼容别名可解析；`category` 大写 `CORE` 可解析并保留原值；`category` 32 字符可解析、33 字符拒绝；`id` 64 字符可解析、65 字符拒绝、尾连字符/首连字符/大写拒绝；`paths` 21 项拒绝。
- 治理路径边界：`path: docs/` 与 `path: docs` 通过；`path: .ans/`、`path: foo/docs/proposals/x/`、`path: docs/proposals/x.md` 被拒（`modules-doc-directory`）。这确认了方案 §8.3 对历史设计「治理路径父目录也拒绝」与解析器实际行为的差异记录。

### 4. 角色卡与既有测试

- `governanceRoleOf(id).cardText` 实测：rapporteur **4246 B / 25 行**；chief 3952 B / 33 行；product 1928 B / 20 行；nominator 3480 B / 32 行；convener 2051 B / 12 行；verifier 1338 B / 11 行。与方案 §5.2 的六卡大小完全一致。
- 方案新增两行卡文本按原文实测：含换行共 **366 B**；加入后 rapporteur 约 **4612 B / 27 行**（方案写「约 +365 B / 4611 B」，差 1 字节，属取整表述，不影响结论）。`view-image-cards.test.ts` 只检查禁用文本，不检查长度；未发现卡长硬上限。
- 基线相关套件已运行：`node --test test/编排/workflow-preconditions.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/编排/trio-worker-report.test.ts` → **54 tests / 54 pass / 0 fail**（约 3.8 s）。现有 `contract_check` 用例、session 用例与策划卡断言均绿；方案 §7.1 的回归方向成立。

### 5. 加载器/前置校验（方案 schema 文本未完全覆盖）

`loadLatestRoster` 在解析之后还有一组**硬拒绝**（不是 advisory）：

- 名单文件名版本 vN 与 frontmatter `version` 一致（`:930-936`）；
- 必须存在最新 `docs/proposals/<flowId>-modules-vN.md`（`:938-956`）；
- 若名单写了 `modulesDoc`，必须指向最新模块清单（`:957-966`）；
- 模块清单文件名版本与 frontmatter version 一致、解析通过（`:967-983`）；
- roster `modules[]` 必须与权威模块清单**逐项一致**（`:984-992`，`roster-modules-drift`）；
- `intent` / `proposal` / `architecture` 引用必须存在、非空（`:1018-1028`）；
- 引用必须指向各自最新版本（`:1029-1037`，`roster-reference-stale`）；
- proposal 正文必须引用名单声明的 intent 路径（`:1048-1054`，`roster-reference-inconsistent`）；
- architecture 正文必须引用名单声明的 proposal 路径（`:1055-1061`，`roster-reference-inconsistent`）。

`validateAppointmentCardAgainstRoster` 还在 D3 阶段硬性要求：未省略 `envBootstrap` 时名单必须含 `env-bootstrap` 角色（`:1113-1131`）。方案 §3.5.2 对 env-bootstrap 的「角色存在性另由招人前置校验」表述成立，但对上述引用/模块清单/版本链硬校验基本未写入 schema 文本，见 F1。

### 6. 其他合同/边界核对

- **零磁盘读 / 不混 run 摘要**：`contractCheckText` 当前第一条可执行语句是 `getListing`（`session.ts:8096`），随后 `refreshListingNow`（`:8097`）；按方案 §3.3 把 `if (input.topic !== undefined) return contractSchemaText(input.topic);` 放在第一条语句，即可在两者之前返回。`contractSchemaText` 只返回静态文本，故 topic 模式零磁盘读、不混 run 摘要的结构成立（前提：实现按此次序；当前 HEAD 未实现）。
- **旧调用逐字不变**：方案 §3.1 只在 `topic` 为非空且合法字符串时构造 `input.topic`；不传 / null / 空串不构造，session 现有 legacy 分支不动；工具层 legacy 截断标记（`tools.ts:2456`）与 topic 标记分开；`schema.ts` 的 `required` / `additionalProperties` 不变。现有 `rejection-copy.test.ts:161-198` 的 `seenInput` deepEqual 与 `run-pin.test.ts:522-545` 的 legacy 断言继续成立。
- **文案对照**：方案 §4.3 五条旧文案与 HEAD 逐字核对成立（`workflow-preconditions.ts:568-573`、`:791-793`、`:328`、`:340-341`、`:347-349`）；错误码不变。新 topology schema 提示与校验器实际读法一致（不读 `category`、`management` 是顶层、convener + 全部项目角色）；唯一宽容读取差异是单字符串（F11）。
- **architectureSource 路径**：代码只做 `typeof string ? trim : ""` 与非空检查（`:561-562`、`:784-785`），没有路径形状校验；方案 §4.5 保持「写作约定、非强制」与意图一致。新增错误文案只是提示，不改变放行。
- **示例防漂移**：方案 §3.6 用真实 `parseProjectModules` / `parseProjectRoster` 锁示例常量，完整文本用示例常量插值；我实测三示例均 `ok:true`。字段表是散文，方案 §8.3 已披露不能完全机械锁，并建议 parser 入口注释；schema 版本字面量的重复见 F10。
- **角色卡可见性**：方案 §6 明确「所有已注入 `contract_check` 的角色可查 topic；不新增角色门禁」，不会误导为「必须仅策划可查」；角色卡本身是策划卡，新增两行是策划工作流指引。`governanceRoleOf("rapporteur").cardText` 实测 4246 B / 25 行，新增两行 366 B，加入后约 4612 B / 27 行；无长度硬上限。
- **写集 / 实施阶段**：§10 明确「仅供统筹判断；不是团队计划」；§10.2 写集全部落在 `src/model/`、`src/common/编排/`、`src/provider/runtime/`、`app/desktop/`、`src/common/门禁引擎/`、`test/编排/`、`test/桌面应用/` 的单文件范围，无新增文件，与任务给定边界一致。
- **§12 待确认**：第 1 项（topic 可见范围）是真正的客户选择，若改成仅策划可查会新增角色门禁并升 T3 / 扩写集；第 2/3 项已被闸门 0 非目标排除，若客户改主意同样升 T3 / 另立意图（F13）。
- **§8 风险披露**：4 KiB、角色卡长度、工具描述/API 兼容、示例漂移、无新写路径、回滚均有章节；F4 补 T2/Model、F8 补 envBootstrap 示例复制风险、F14 补回滚粒度。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 复用现有 `contract_check` 工具、注入、4 KiB 与 role 隔离路径；Q1 的 B/C/D 备选有真实代价比较（§2.1）；错误文案与角色卡对应闸门 0 Q4/下一步；未发现为「以后可能」新增抽象或工具。 |
| OD-2 必做与选装 | 通过（附建议） | 方案没有把选装伪装成必做；§12 三项是设计选择而非默认勾选。但第 2/3 项其实是闸门 0 非目标已排除的「放宽/收紧校验」，作为并列待决项可能诱导范围扩张（F13）。 |
| OD-3 复用 | 通过（附建议） | 复用真实 parser、现有工具、现有错误码、现有测试文件与既有 4 KiB 截断；示例常量单一来源；唯一可见重复是 schema 版本字面量未复用同文件常量（F10）。 |
| OD-4 非目标 | 通过 | §9 明确不放宽校验、不自动修复、不改写权/权限/闸门/验收/证据、不新增写路径；未发现超出闸门 0 的扩张。角色卡两行属于意图「下一步」明确要求覆盖的角色卡范围。 |
| OD-5 被否决的备选 | 通过 | Q1–Q4 的 B/C/D（以及 §3.3 的两种不采用备选）是真实比较，代价可核对；未发现为凑数编造的备选。 |
| MK-1 目标 | 通过（附注） | 目标可追溯到闸门 0 原话与 Q1–Q4；事实与设计候选有 `[现状]`/`[设计候选]` 标记。`ans-work/科研/layer0` 的「11 模块 / 6 角色」来自意图记录，复核未独立重跑该项目，见限制。 |
| MK-2 完整流程与失败分支 | 发现 | 写前查询 → 写文档 → 解析/拒绝 → 按错误修正的成功路径和 topic 未知/非字符串/空值/数据源失败/截断/legacy 分支基本完整；但 schema 文本未覆盖加载器层的引用/模块清单/版本链硬拒绝（F1），AC-8 与方案文本自相矛盾（F2）。 |
| MK-3 输入输出 | 发现 | 三个 topic 的字段类型/必填/约束多数经真实解析器核对成立；`path`/`paths` 的「二选一」与「同时给出时 paths[0] 必须等于 path」自相矛盾（F7）；roster 顶层「必填」与可选项并列（F6）；`publicContract` 的示例路径与 `architectureSource` 混淆（F9）；`envBootstrap.omitted:true` 的最小示例有复制风险（F8）。 |
| MK-4 契约 | 发现 | `ContractCheckInput.topic` 可选、未知/非字符串拒绝、未知值有界回显、legacy 逐字不变、角色隔离优先、4 KiB 防御的方向可核对；但未写入加载器层跨文档硬约束（F1），工具描述「与 taskKind 互斥」与「topic 优先并忽略」矛盾（F3），T2 档位未处理 `src/model/runtime.ts`/公共工具契约的 T3 条款（F4），`management` 的「收到」取值未定义（F11）。 |
| MK-5 完成标准 | 发现 | AC-1–AC-14 大多可逐条核对，AC-1/AC-2/AC-3 已用真实 parser/字节数验证可行；AC-8 按字面无法通过（F2）；逐字段错误只测了 name/publicContract/architectureSource，未覆盖 purpose 及四种字段的空/非字符串组合（F5）；`topic:null`/空串/空白串的 legacy 行为无 AC/测试（F12）；回归清单未含角色卡内容守卫（F15）。 |
| MK-6 风险与未决事项 | 发现 | §8 覆盖 4 KiB、角色卡长度、工具描述兼容、示例漂移、无新写路径、回滚；但未把「schema 文本漏加载器硬校验」作为风险（F1）、未披露 envBootstrap 最小示例的复制风险（F8）、T2/Model 的升档条件不完整（F4）、§10.3 回滚未说明错误文案（F14）。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | **重要** | 方案 §3.5.2 lines 299、304-309；§3.5 note line 255；§1.6 line 95 | schema 文本没有完整写出**加载器层的硬拒绝**：`intent`/`proposal`/`architecture` 必须存在、非空且指向最新版本；必须有最新 modules 文档；roster `modules[]` 必须与 modules 文档逐项一致；proposal 必须引用 intent、architecture 必须引用 proposal。文本还把 roster `modules[]` 说成「解析器不在此处比对」，容易被读成「不校验」。策划按查询结果写完仍可能被 `roster-reference-stale` / `roster-reference-missing` / `roster-modules-drift` / `roster-reference-inconsistent` 拒绝，正好违背本次「不再盲猜」的目标。 | `workflow-preconditions.ts:930-1068`（尤其 `:984-992`、`:1018-1037`、`:1048-1061`）；方案 §3.5 note line 255「精确版本引用……不由本解析器校验」；§1.6 line 95「照抄即可解析」 | 在 `topic=roster` 文本增加「加载校验（硬拒绝）」小节，写明上述引用/模块清单/版本链约束及对应 code；把「解析器不在此处比对」改为「加载时会与最新 modules 文档逐项比对（roster-modules-drift）」；`topic=modules` 补充其文件版本与 flowId 由加载器校验。同步增加 AC/测试：按 schema 文本写的完整 roster 至少通过 `loadLatestRoster` 的引用/漂移检查（可用现有 `run-pin` 夹具扩展）。 |
| F2 | 漏重点 | **重要** | 方案 AC-8 line 643；§7.1 line 627；§3.5.1 line 261、§3.5.2 line 298、§3.5.3 line 360；§3.3 line 216 | AC-8/§7.1 要求 topic 模式输出「不含 `taskKind`」，但方案自己的三块 schema 文本第二行都含 `flowId/taskKind/moduleId 被忽略`；若按字面写 `assert.doesNotMatch(text, /taskKind/)` 必然失败。§3.3 还说「输出首行明示 topic 模式只返回字段表与示例」，实际该明示在第二行，首行只有 header 与「查询不构成放行/授权」。 | 方案 §3.5 三块文本第 2 行；AC-8；§7.1 会话层行；我按方案文本提取实测：三块完整文本均含字面 `taskKind`，首行为 `contract_check topic=<t>（只读 schema；查询不构成放行/授权）` | 把 AC-8/§7.1 改为「不含 legacy 行」的精确断言（例如不得出现以 `run：` 开头、以 `taskKind ` 开头且含「必填」、以 `可写边界：` 开头的行），明确允许第二行的忽略提示；同步把 §3.3 的「首行明示」改为「首两行明示」或把该提示移到首行。 |
| F3 | 漏重点 | 一般 | 方案 §3.7 line 450；§3.3 lines 216-218 | 工具描述写「与 taskKind 互斥，topic 优先并忽略 taskKind/flowId/moduleId」；但方案明确选择不拒绝同时给出（因为模型常顺手带 flowId），实际行为是「可同时给出，topic 优先」。模型-facing 描述自相矛盾，可能让模型误以为同时传会被拒绝而省略本可传的参数，或反过来预期错误。 | 方案 §3.3「备选（不采用）：topic 与 taskKind 同时给出时拒绝」；§3.7 description 追加句 | 改为「可与 taskKind/flowId/moduleId 同时给出；topic 优先，后三者被忽略」，删除「互斥」；在 AC-8 补一个同时传 `topic + flowId + taskKind` 的透传/忽略用例。 |
| F4 | 漏重点 | 一般 | 方案 §8.6 lines 702-717；§3.4 line 242；`src/model/runtime.ts:1139-1148` | 方案建议 T2，但改动包含 `src/model/runtime.ts` 的 `ContractCheckInput` 新可选字段、`schema.ts` 的公共工具参数/描述与跨模块契约。`references/testing.md` 的 T3 条款含「shared-abstraction change (Model, public entry, cross-module contract)」；方案只用「不改权限/放行」论证 T2，没有正面处理该条款。T2 可能仍成立（加法可选字段、无行为破坏），但当前论证不足以让验收/统筹自行判定。 | `references/testing.md` 风险档位表；`src/model/runtime.ts:1139-1148`；`src/provider/runtime/schema.ts:630-651`；方案 §8.6 | 在 §8.6 增一句：本改动对 Model 是**加法可选字段**、对工具是**加法可选参数**，不构成 breaking shared abstraction；若复核/验收按「凡触 Model 或公共工具契约即 T3」管理，则按 T3 执行全量回归并重评档位。把该条件写入升档条件。 |
| F5 | 漏重点 | 一般 | 方案 §4.1 lines 489-503；§7.1 line 625；AC-9 line 644 | 逐字段错误的**测试/AC 覆盖不全**：只明确测 `publicContract:true`、缺 `name`、`architectureSource:false`；没有 `purpose` 用例，也没有四种字段各自的「空字符串/非字符串」组合。`purpose` 还有 `responsibility` 兼容别名：现有解析在 `purpose` 非字符串时回退到 `responsibility`，但方案没有说明新 helper 描述的是 raw `purpose` 还是归一化后的有效值；若按 raw 值报错，会把合法的别名写法误报。 | `workflow-preconditions.ts:546-552`、`:561-573`、`:771-785`、`:791-793`；方案 §4.1「purpose 的 responsibility 兼容别名保留」 | 用参数化用例覆盖 `name/purpose/publicContract/architectureSource` × `未提供/null/空字符串/boolean/number/array/object`（至少每字段一个空与非字符串），roster 与 modules 文档两侧都测；在 §4.1 写明 helper 接收 raw 值、但 `purpose` 检查使用 `purpose` 或 `responsibility` 归一化后的有效值。 |
| F6 | 漏重点 | 一般 | 方案 §3.5.2 lines 300、307-308 | roster 文本标题写「frontmatter 顶层（必填；值不可为 null）」，但紧接着把 `modulesDoc` 写成「可选」、`envBootstrap` 写成「可省略」。标题与条目矛盾，模型可能误以为两个可选项也必须写，或反过来误解「必填」范围。 | 方案 §3.5.2；`parseProjectRoster` 对 `record.modulesDoc`/`record.envBootstrap` 的省略处理（`workflow-preconditions.ts:483-484`、`:651-665`） | 把标题改为「顶层字段（必填项的值不可为 null；可选项见下）」，或分成「必填」与「可选」两小节。 |
| F7 | 漏重点 | 一般 | 方案 §3.5.1 lines 273-274 | `path` 行写「与 paths 二选一（普通模块只写 path）」，`paths` 行又写「与 path 同时给出时 paths[0] 必须等于 path」；两行自相矛盾。解析器实际允许同时给出（只要相等），不是严格二选一。 | `workflow-preconditions.ts:574-580`；方案 §3.5.1 | 统一写为「通常只写其一；同时给出时 `paths[0]` 必须等于 `path`（解析器接受）」，或明确「同时给出仅作兼容，不建议」。 |
| F8 | 漏重点 | 一般 | 方案 §3.5.2 lines 316-326；§8.7 line 723 | 最小 roster 示例用 `envBootstrap: {omitted:true, omissionReason:"最小示例省略装配/入口角色"}`；该理由不是项目真实省略理由。模型照抄示例到真实名单时，解析器和 D3 只要求「非空理由」，可能把默认必带的 `env-bootstrap` 错误省略。§8.7 只提示替换 `demo` flowId，未提示替换/删除该省略理由。现有测试夹具（如 `workflow-preconditions.test.ts:620-716`）默认含 env-bootstrap，可作为更安全示例的基础。 | 方案 §3.5.2 示例；`workflow-preconditions.ts:667-676`（omissionReason 只查非空）；`:1113-1131`（D3 只按 omitted 判断）；现有测试夹具 | 把示例理由改成明显需要替换的占位（如 `<小项目省略理由；默认项目不要照抄>`），并在 §8.7 增加一行风险；或把最小示例改成含 env-bootstrap 的最小形状（体积仍远低于 4 KiB）。 |
| F9 | 漏重点 | 建议 | 方案 §3.5.1 line 275 | `publicContract` 的示例写「`internal（资源约定）` 或 `docs/contracts/<flowId>-architecture-v1.md`」，后者与 `architectureSource` 的示例路径相同；两个字段语义不同（公开契约 vs 架构来源），容易让模型把两者写成同一个值。 | 方案 §3.5.1 示例中 `publicContract: internal（核心约定）` 与 `architectureSource: docs/contracts/demo-architecture-v1.md`；历史设计 §5.2 用 `publicContract: docs/contracts/handbook-style-v1.md` | 改用独立的契约文档示例（如 `docs/contracts/<flowId>-contract-v1.md` 或 `internal（核心约定）`），保留 `architectureSource` 的架构路径示例；或明确说明「architecture 路径只是允许的示例，不代表推荐」。 |
| F10 | 漏重点 | 建议 | 方案 §3.5.1-3.5.3（lines 262、299、361）；§3.6 lines 413-418；`workflow-preconditions.ts:24-28` | schema 版本字面量 `project-modules/v2`、`project-roster/v3`、`project-topology/v2` 在文本中重复出现，而同文件已有 `PROJECT_MODULES_SCHEMA` / `PROJECT_ROSTER_SCHEMA` / `PROJECT_TOPOLOGY_SCHEMA` 常量；方案只把**示例**做成常量插值，没有把版本字面量也纳入单一来源。未来升 schema 版本时文本可能漏改。 | 方案 §3.6 只示例插值；`workflow-preconditions.ts:25-28` | 在文本构造中用常量插值（例如 `` `schema: ${PROJECT_MODULES_SCHEMA}` ``），或增加测试断言文本包含三个常量值，避免字面量漂移。 |
| F11 | 漏重点 | 建议 | 方案 §4.2 lines 520、528；`workflow-preconditions.ts:334-339` | `management` 的新错误文案说「必须是扁平字符串数组」，但现有解析器把单个字符串当一元数组、把数组里的非字符串过滤掉，实际接受范围比文案宽。方案 §4.2 已说明「不改宽容读取」，但文案的「必须是」仍与「提示与校验口径统一」的目标不完全一致；另外 `收到 <received>` 没有说明是 raw `management` 还是归一化后的数组。 | 方案 §4.2 注意条；`workflow-preconditions.ts:334-339` | 文案改为「写作格式为扁平字符串数组（如 `management: [convener, <全部项目角色 id>]`）；解析器兼容单字符串但不推荐」，并明确 `收到` 取自 raw `management`（mapping 显示 `object（mapping）`，数组显示 `array(N)`）。 |
| F12 | 漏重点 | 建议 | 方案 §3.2 lines 206-210；§8.7 line 725；§7.1/§7.2 | `topic` 缺省/null/空字符串走 legacy 的语义已写，但没有任何 AC/测试覆盖；空白字符串（仅空格）也会被 `trim` 成空串走 legacy，方案只写「空字符串」。若模型产出一个空白或空值，可能静默拿到 run 摘要而不是 schema，和方案对非字符串「不静默忽略」的理由不一致。 | 方案 §3.2 表；§3.1 代码片段的 `trim()`；§8.7 | 在工具层测试补 `topic:null`、`topic:""`、`topic:"   "` 的 legacy 行为断言，并明确空白串视为缺省；如不希望静默回退，可把空白串与非字符串一样拒绝并在 AC 中说明。 |
| F13 | 漏重点 | 建议 | 方案 §12 lines 798-800 | 第 2 项（`management.roles` 兼容）与第 3 项（`architectureSource` 强制路径）已被闸门 0 非目标「不放宽任何校验」「不收紧」排除；把它们与第 1 项（可见范围）并列为待客户决定，可能让客户以为本次可以顺手选择放宽/收紧，增加范围不确定性。 | 意图文件 lines 43-47（非目标）；方案 §4.4、§4.5；§12 | 保留第 1 项作为真实确认项；第 2/3 项改为「本方案不做；若客户改变闸门 0 非目标，需另立意图并按 T3 重评」，不作为并列可选项。 |
| F14 | 漏重点 | 建议 | 方案 §10.3 line 771 | 回滚说明「删除 topic 分支与常量、恢复角色卡即可」，但方案还包括两处逐字段错误文案、topology 提示文案、schema 文本/示例常量与工具描述；若回滚整个功能，这些改动要么保留（需说明是独立改进），要么也应回滚。当前表述不完整。 | 方案 §4、§10.3 | 写明回滚粒度：topic 分支/枚举/工具描述回滚；错误文案与 schema 文本是否保留由作者/客户决定；无状态迁移，不影响已写文档。 |
| F15 | 漏重点 | 建议 | 方案 §7.3 lines 653-660；`test/门禁引擎/view-image-cards.test.ts:16-47` | 改动了 `RAPPORTEUR_CARD_TEXT`，但 §7.3 回归命令只列了四个测试文件，没有列角色卡内容守卫 `view-image-cards.test.ts`（以及 `list-project.test.ts` 的卡非空检查）。新增两行不含现有禁用字符串，风险低，但把该测试加入回归成本极低。 | 方案 §5、§7.3；`view-image-cards.test.ts` 的禁用项列表 | 在 §7.3 增加 `node --test test/门禁引擎/view-image-cards.test.ts`（可选加 `list-project.test.ts`），并在 AC-11 的核对方式中提及。 |
| F16 | 漏重点 | 建议 | 方案 §5.2 line 580 | 方案写「约 +365 字节 / 4611 字节」；按原文实测为 **+366 字节 / 4612 字节 / 27 行**。差 1 字节来自换行/取整，不影响「同量级、无硬上限」的结论，但建议与实测或「约」表述对齐。 | 实测 `governanceRoleOf("rapporteur").cardText` 4246 B / 25 行；新增两行含换行 366 B | 改为「实测 +366 B，约 4612 B / 27 行」或保留「约」并注明实测值。 |

## 复核结论

**建议修订后提交。**

方案的核心方向成立：它只扩展现有 `contract_check` 的只读查询面，没有新增工具、放宽校验、自动修复、改权限/闸门/验收，也没有新增写路径；`topic` 的未知/非字符串/legacy/角色隔离/4 KiB 设计与现有代码结构相容；三个示例经真实 `parseProjectModules` / `parseProjectRoster` 解析为 `ok:true`，完整文本字节数与方案 §3.5 完全一致；现有相关套件 54/54 绿；分层与依赖安排未发现循环或越层。闸门 0 的 Q1–Q4 A/A/A/A 与意图非目标均可追溯，未发现过度扩张。

但有 **两项重要发现**会影响客户确认的 schema 完整性与验收基线，建议在闸门 1 前先修订：

1. **F1**：schema 文本漏掉 `loadLatestRoster` 的引用/模块清单/版本链硬拒绝，且「解析器不在此处比对」的表述会低估实际校验；按查询结果写的文档仍可能被加载层拒绝，和「可查 schema、不再盲猜」的目标冲突。
2. **F2**：AC-8/§7.1 要求输出不含 `taskKind`，但方案自己的三块文本第二行都含 `taskKind`；按字面写的验收测试无法通过，且 §3.3 的「首行明示」与文本实际行序不一致。

F3–F8 为 **一般** 级，影响工具描述/模型行为、T2 档位论证、逐字段错误覆盖、roster 必填/可选表述、path/paths 规则与 envBootstrap 示例的复制风险；F9–F16 为 **建议** 级，主要是示例选择、字面量单一来源、management 文案、空值测试、§12 项框定、回滚粒度与回归清单。作者可按复核规则 §9 逐项处置（采纳/部分采纳/不采纳并记录理由）；未解决意见由沟通在闸门 1 材料中如实披露，由客户决定。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 方案尚未实施；未运行 `contractSchemaText`、未跑新增测试、未做 `npm run typecheck` / `typecheck:renderer`；本记录只验证了现有 parser 与方案文本，不构成对实现候选的验收。
- 未启动应用/Electron、未做 UI/卡片渲染、未验证角色卡在真实系统提示中的长度/可读性；卡长结论来自 `governanceRoleOf(...).cardText` 的静态字节/行数。
- 未独立重跑 `ans-work/科研/layer0`；方案 §1.3 的「11 模块 / 6 角色」来自意图记录，不是本次复核的实测。该运行项目不在本 worktree 的读取范围内，且复核不修改任何运行项目。
- 未逐行读完 `app/desktop/session.ts`、`src/provider/runtime/tools.ts`、`src/common/编排/workflow-preconditions.ts` 等大文件；只读了与 `contract_check`、schema 文本、错误文案、角色卡、loader、测试相关的段落。
- 未验证 `topic` 在所有运行时（Pi/其他适配器）中的注入与截断行为；只核对了桌面 `SessionManager` 的注入路径（`session.ts:2545-2546`）与工具注册路径（`tools.ts:3499-3501`）。
- 未运行 `view-image-cards.test.ts`、`list-project.test.ts` 等角色卡相关测试；只读了禁用项列表；基线只跑了方案 §7.3 的四个文件。
- 未验证实现后文本的最终字节数；方案文本可能因实现时的插值/尾随换行/缩进产生 1–2 字节差异，但当前余量 >1 KiB，不会逼近 4096。
- 未核对 `src/model/runtime.ts` 之外是否还有 `ContractCheckInput` 的等价类型或 schema 副本；未发现公开别名，但未做全仓 exhaustive 类型审计。
- 未验证历史设计 §5.2 之外的历史方案/验收记录对本次 schema 文本的潜在影响；只按方案头引用的 §5.2 与哈希核对。
- 未验证任务提示所称「意图文件在快照后更长」的版本；本 worktree 当前文件 64 行且哈希与方案头一致。若沟通持有另一份更长的意图快照，请以该快照重新核对 Q1–Q4 与非目标。

**未解决意见：**

1. **F1/F2 是本次复核的核心未解决意见。** 作者可以选择不采纳，但建议至少在闸门 1 材料中如实披露；客户最终决定是否以当前 schema 范围确认为「足够可查」。
2. **T2 vs T3**：本记录不预先批准 T2；若验收/统筹按 `references/testing.md` 的 Model/公共工具契约条款判为 T3，作者应在 §8.6 采纳并补全量回归。复核不改变风险档位的最终责任。
3. **§12 第 1 项（topic 可见范围）** 是真实的客户选择；第 2/3 项建议如实标为「本方案不做、改变需另立意图」，不要作为并列选项诱导范围扩张（F13）。
4. **envBootstrap 最小示例**是否要改成含 env-bootstrap 的示例，属作者取舍；本复核只指出复制风险与现有测试夹具可作为更安全基础（F8）。
5. 复核记录按任务指定写入 `docs/planning/2026-11-03_review_contract-schema-query.md`；本记录不是客户确认记录、不是验收报告、不是任务状态，不授予任何实施或提交权限。

## 再复核记录（如发生）

### P1.1（2026-11-03）

- 复核版本：`docs/planning/2026-11-03_design_contract-schema-query.md` **P1.1**，**873 行**，SHA-256 `7eb233392d242d1b537bb54f929e73c2d9d6aacf832179ec5371eb27b20aeb250`（按该快照只读；P1.0 部分保持不变，本节只复核受影响部分）
- 复核范围：§0/§1.6、§3.2–§3.7、§4.1–§4.3、§5.2、§7.1–§7.3、§8.4–§8.7、§10.2–§10.3、§12、§13；未重读 P1.0 未受影响章节的全文。
- 复核方法：先读 §13 逐项处置，再核对对应正文/AC/风险/角色卡；重新从 P1.1 文本提取三块 `contract_check topic` 文本与示例，用真实 `parseProjectModules` / `parseProjectRoster` 与 `loadLatestRoster` 在内存/临时目录验证；重新跑方案 §7.3 的六个基线套件；未改方案/代码/测试/意图/沟通/验收，未 commit/push。

**F1–F16 处置核对**

| 发现 | 状态 | 窄复核说明 |
| --- | --- | --- |
| F1 | 已关闭（核心） | `topic=roster` 已增「加载校验（硬拒绝）」段（P1.1 lines 317–322），列出 `roster-missing`、`roster-version-invalid`、`roster-modules-doc-missing/invalid`、`roster-modules-drift`、`roster-reference-missing/stale/inconsistent` 及 proposal→intent / architecture→proposal 版本链；`topic=modules` 增加加载校验行（line 266）；§3.5 note 明示示例只保证解析器通过；§1.6 改为「照抄可过解析；加载级约束须一并满足」；AC-15/§7.1 加载级行/§3.6 加载级测试已补。负例在临时目录实测：`roster-modules-drift` / `roster-reference-stale` / `roster-reference-inconsistent` / `roster-reference-invalid` / `roster-reference-missing` / `roster-modules-doc-missing` / `roster-version-invalid` 均可命中；但正例 fixture 与示例对齐存在 N1。 |
| F2 | 已关闭 | 三块完整文本第二行已改为「（仅 schema 与示例；不含 run/写区；其余参数被忽略）」，实测三块均无字面 `taskKind`/`flowId`/`moduleId`；首行为 `contract_check topic=<t>（只读 schema；查询不构成放行/授权）`，第二行为该提示；AC-8/§7.1 改为精确 legacy 行断言（`^run：`、`^taskKind .*必填`、`^可写边界：`），三块均不命中；§3.3「首两行」与文本一致。 |
| F3 | 已关闭 | §3.3/§3.7 已删除「互斥」，改为「可与 taskKind/flowId/moduleId 同时给出；topic 优先，后三者被忽略」；§7.1 工具层与 AC-8 增加同时传 `topic + flowId + taskKind` 用例。 |
| F4 | 已关闭 | §8.6 新增对 `references/testing.md` T3 条款的正面说明（Model 加法可选字段、工具加法可选参数、非 breaking shared abstraction；若统筹/验收按「凡触 Model/公共工具契约即 T3」管理则按 T3 重评），升档条件同步加入该条。T2 论证可核对；最终档位仍由统筹/验收判定，复核不预先批准。 |
| F5 | 已关闭（附建议） | §4.1 写明 `purpose`/`responsibility` 的 raw-vs-effective 口径；新增四字段 × 未提供/null/空串/boolean/number/array/object 矩阵（roster 与 modules 文档两侧）；AC-9 扩展 purpose 与别名。N5 建议明确 `purpose:true` 且无 responsibility 时的期望文案。 |
| F6 | 已关闭 | §3.5.2 标题改为「必填项的值不可为 null；可选项见下」，与 `modulesDoc`/`envBootstrap` 可选条目一致。 |
| F7 | 已关闭 | §3.5.1 `path` 改为「普通模块只写本项」；`paths` 改为「与 path 同时给出时 paths[0] 必须等于 path（兼容写法，不建议同时写）」，无「二选一」矛盾。 |
| F8 | 已关闭（附建议） | roster 示例的 `omissionReason` 改为占位 `<小项目省略理由；默认项目不要照抄>`，示例前加两条警告（只保证解析器通过；默认项目须含 env-bootstrap 或写真实省略理由）；§8.7 同步。N4：占位符仍是非空字符串，parser/D3 仍会接受，警告不能强制替换；建议明确「占位符不得原样提交」或改含 env-bootstrap 的示例。 |
| F9 | 已关闭 | §3.5.1 `publicContract` 示例改为 `docs/contracts/<flowId>-contract-v1.md`，与 `architectureSource` 的 architecture 路径区分；正文示例仍用 `internal（核心约定）`。 |
| F10 | 已关闭（附建议） | §3.6 文本常量用 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 插值；AC-17 断言三块文本分别包含常量值。N2：AC-17 只证明「至少一处」出现常量，不能证明所有出现处都插值；未来升版仍可能留下旧字面量。 |
| F11 | 已关闭 | §4.2/§4.3 改为「写作格式是扁平字符串数组」；「收到」取 raw `management`（mapping → `object（mapping）`、数组 → `array(N)`、字符串 → `string`、未提供 → `未提供`）；说明单字符串兼容与非字符串项过滤的既有宽容读取。 |
| F12 | 已关闭 | §3.2 明确 `null`/`""`/仅空白串 `trim` 后走 legacy；AC-16 增加三项 legacy 测试与 `topic:123` 拒绝；§8.1/§8.7 同步。 |
| F13 | 已关闭 | §12 只保留「topic 可见范围」为真实确认项；`management.roles` 兼容与 `architectureSource` 强制路径改为「本方案不做；改变非目标需另立意图并按 T3 重评」，不再并列。 |
| F14 | 已关闭 | §10.3 写明回滚粒度：topic 查询面可整体回滚；schema 文本/逐字段错误文案是独立改进可保留；整体回滚则全部恢复；无状态迁移。 |
| F15 | 已关闭 | §7.3 加入 `view-image-cards.test.ts`（可选 `list-project.test.ts`）；AC-11 同步。N7：§10.3 的「实施前基线」命令仍只列四个文件，与 §7.3 不完全一致，建议同步或注明可选。 |
| F16 | 已关闭 | §5.2/§8.4 改为实测 +366 B / 约 4612 B / 27 行，与本次复核实测一致。 |

**P1.1 重新实测**

- 三块完整文本（UTF-8，无尾随换行）：`modules` **2438 B**、`roster` **3680 B**、`topology` **1265 B**，与 P1.1 自检完全一致；均 <4096，roster 余量 416 B（见 N3）。
- 三块文本均无字面 `taskKind`；首行/第二行与 F2 描述一致；legacy 行正则（`^run：`、`^taskKind .*必填`、`^可写边界：`）均不命中。
- 示例常量：modules 282 B、roster 835 B（占位 `omissionReason` 非空）、topology 171 B；`parseProjectModules(...,"demo")` 与 `parseProjectRoster(...,"demo")` 均 `ok:true`；roster 示例包含 topology 示例，三块完整文本分别包含各示例。
- 加载级：用 **与 roster 示例匹配** 的 modules 文档（把 modules 示例的 `purpose: 核心逻辑与公开接口` 改为 `核心逻辑`）构造 intent/proposal/architecture/modules/roster 临时项目 → `loadLatestRoster` `ok:true`；负例分别命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`，另测 `roster-reference-missing`、`roster-reference-invalid`、`roster-modules-doc-missing`、`roster-version-invalid` 均可命中。
- **N1 实测**：若直接把 `topic=modules` 示例作为 modules 文档、与 `topic=roster` 示例一起加载，`loadLatestRoster` 返回 `roster-modules-drift`——两个示例都使用 `flowId: demo`、模块 id `core`，但 `purpose` 不同（modules 示例 `核心逻辑与公开接口`，roster 示例 `核心逻辑`）。只有把两者 `purpose` 对齐后正例才 `ok:true`。
- 角色卡：rapporteur 4246 B / 25 行；新增两行 +366 B，加入后约 4612 B / 27 行（与 F16 一致）。
- 基线：`node --test` 六个文件（§7.3 全部）→ **72 tests / 72 pass / 0 fail**（约 3.9 s）；代码 HEAD 未变，P1.1 只改方案文档。
- 写集/范围：§10.2 写集与 P1.0 相同，未新增文件；§7.3 新增的是 `test/门禁引擎/` 的**运行命令**，不是写集；§12 已收窄；未发现范围扩张或写集越界。

**P1.1 剩余发现**

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | 漏重点 | **重要** | P1.1 §3.5.1 lines 282–295、§3.5.2 lines 323–335、§3.6 line 448、AC-15 line 679 | `topic=modules` 示例与 `topic=roster` 示例同用 `flowId: demo`、模块 `core`，但 `purpose` 不同；把 modules 示例作为 modules 文档与 roster 示例一起交给 `loadLatestRoster` 实测返回 `roster-modules-drift`。AC-15 正例说「按 topic=roster 文本构造的完整 roster（含 modules 文件）」但没有要求 modules 文档的 `modules[]` 与 roster 示例逐项一致；测试作者若自然复用 modules 示例，正例会失败。P1.1 自检只验证 parser 级，未覆盖该跨文档一致性。 | 我用 P1.1 文本提取的 modules 示例（`purpose: 核心逻辑与公开接口`）与 roster 示例（`purpose: 核心逻辑`）构造临时项目：`loadLatestRoster` → `roster-modules-drift`；把 modules 文档 `purpose` 改为 `核心逻辑` 后 → `ok:true`。`workflow-preconditions.ts:984-992` 的逐项 JSON 比较。 | 二选一：① 把两个示例的模块字段（至少 `purpose`）对齐，使「modules 示例 + roster 示例」可直接构成加载级正例；或 ② 明确声明两个示例是独立片段，并在 AC-15/§3.6 指定正例 fixture 必须使用「与 roster `modules[]` 逐项一致」的 modules 文档。建议同时加一个测试断言 `parseProjectModules(modulesExample).doc.modules` 与 `parseProjectRoster(rosterExample).roster.modules` 逐项一致（或显式说明不要求一致）。 |
| N2 | 漏重点 | 建议 | §3.6 lines 422–443、AC-17 line 681 | AC-17 只断言 `contractSchemaText(topic).includes(PROJECT_*_SCHEMA)`；这只能证明文本中至少一处出现常量，不能证明「文档行、schema 行、示例」所有出现处都已插值。未来升 schema 版本时仍可能留下旧字面量而测试通过。 | P1.1 声称「所有出现处都用常量插值」；三块文本中每个版本值出现多次（文档行、schema 行、示例）。 | 增加更强的断言：例如断言文本不含任何硬编码版本正则（在常量变更时测试才有效），或对文本的每个预期 schema 行分别断言使用常量插值；至少把「所有出现处」写成测试可核对的结构。 |
| N3 | 漏重点 | 建议 | §3.5 line 391、§8.2 line 711、AC-3 line 667 | roster 文本 3680 B，距 4096 仅 416 B。当前可接受（AC-3 断言 ≤4096），但余量已从 P1.0 的 >1 KiB 降到约 10%；未来任何字段增加或实现插值/换行增加都可能逼近工具层截断。 | 实测 3680 B；4096 - 3680 = 416 B；方案已说明到限时压缩/拆子 topic。 | 可接受当前版本；建议增加预算守卫（例如测试断言 roster 文本 ≤ 3900 B）或在 §3.5/§8.2 明确「任何新增字段必须先拆子 topic/压缩，不能只依赖 4 KiB 截断」。 |
| N4 | 漏重点 | 建议 | §3.5.2 lines 323–335、§8.7 line 760、§13 F8 line 863 | 占位 `omissionReason: <小项目省略理由；默认项目不要照抄>` 仍是非空字符串；parser/D3 只要求非空，模型若原样照抄省略块，仍可能通过校验并错误省略 env-bootstrap。两条警告是提示，不是强制。 | `workflow-preconditions.ts:667-676`（只查非空）；`:1113-1131`（D3 只按 omitted 判断）；P1.1 示例占位符实测可解析为字符串。 | 在警告中加一句「占位符必须替换，不得原样提交」；或把最小示例改为含 env-bootstrap 的形状（roster 余量 416 B，需先评估 N3）。 |
| N5 | 漏重点 | 建议 | §4.1 line 501、§4.1 matrix lines 503–512、AC-9 line 673 | `purpose` 的有效来源规则已写入，但未明确 `purpose:true` 且 `responsibility` 缺失时应显示 raw `purpose` 的类型（`boolean: true`）还是有效来源的「未提供」。测试矩阵要求覆盖该情形，但没有给出期望文案，实施/验收可能各自解释。 | P1.1 §4.1「错误显示这个有效来源的 raw 类型/值」；`purpose` 非字符串时回退 `responsibility`，缺失则为空。 | 在 §4.1 矩阵/AC-9 增一行期望：`purpose:true` + 无 responsibility → 错误文案使用哪一来源；建议仍显示用户实际写错的字段类型（`boolean: true`），避免「收到 未提供」掩盖真实错误。 |
| N6 | 漏重点 | 建议 | AC-15 line 679、§7.1 line 654 | AC-15 只列 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent` 三个负例；schema 文本还列了 `roster-reference-missing`、`roster-modules-doc-missing`、`roster-modules-doc-invalid`、`roster-version-invalid`，AC-15 未要求覆盖这些 code。 | 我在临时目录实测这些 code 均可命中；现有 `workflow-preconditions.test.ts` 有部分引用/版本负例，但 AC-15 没点名。 | 在 AC-15/§7.1 补「至少覆盖 `roster-reference-missing` 与 `roster-modules-doc-missing`」或注明已有既有测试覆盖；不要求重复全部 loader 测试。 |
| N7 | 漏重点 | 建议 | §10.3 line 810、§7.3 lines 685–694 | §7.3 回归命令已加 `view-image-cards.test.ts` / `list-project.test.ts`，但 §10.3 的「实施前基线」仍只列四个文件，表述不一致。 | 两处命令不一致；不影响设计。 | 同步 §10.3 的基线命令，或注明后两项为可选回归。 |

**P1.1 窄复核结论**

**建议再次修订。**

P1.1 的 F1–F16 处置均已真实落入正文/AC/风险/角色卡（F1 的加载级文本/AC-15 已补，残余为 N1 的示例/AC-15 fixture 对齐）：加载级硬拒绝、AC-15、`taskKind` 字面量/AC-8、`topic` 与 `taskKind` 并存、T2/Model 论证、四字段矩阵、必填/可选、path/paths、envBootstrap 警告、publicContract 示例、schema 常量、management raw 文案、空/空白 topic、§12 收窄、回滚粒度、卡内容守卫与卡长实测均已落入正文/AC/风险/角色卡；三块文本实测 2438/3680/1265 B，示例 parser 级 `ok:true`，基线六套件 72/72 绿；未发现范围扩张或写集越界。

但 **N1（重要）** 是新引入的跨示例/AC 一致性问题：`topic=modules` 示例与 `topic=roster` 示例在同一 `demo`/`core` 上 `purpose` 不同，直接组合会被 `loadLatestRoster` 判为 `roster-modules-drift`；AC-15 正例未指定 modules fixture 必须与 roster `modules[]` 逐项一致，测试作者按自然方式复用示例会失败。这正好落在本次「可查 schema、减少盲试」的核心目标上，且修复很小（对齐一个字段或明确 fixture 要求）。建议作者先出一个小版本（P1.2）处理 N1，并顺手处理 N2–N7 的建议；N1 修复后只需窄复核示例/AC-15 受影响部分，不需要重新全文复核。其余 N2–N7 为建议级，不单独构成阻断。

**P1.1 窄复核限制**：未实施/未运行 `contractSchemaText`、未跑新增测试、未 typecheck；未启动应用/UI；未独立重跑 `ans-work/科研/layer0`；未验证所有运行时注入；P1.0 未受影响章节未重读。上述事实来自 P1.1 文本提取、真实 parser/`loadLatestRoster` 临时目录验证与六个基线套件的只读运行。

### P1.2（2026-11-03）

- 复核版本：`docs/planning/2026-11-03_design_contract-schema-query.md` **P1.2**，**906 行**，SHA-256 `eca89ff096032e3ed5bd3dac843bc5c06cf7fa1bd95cd626155e35e532602473`（按该快照只读；P1.0/P1.1 部分保持不变，本节只复核受影响部分）
- 复核范围：§3.5.1–§3.5.3、§3.6、§4.1、§7.1–§7.3、§8.2/§8.7、§10.2–§10.3、§11、§12、§13/§13.1；未重读 P1.0/P1.1 未受影响章节全文。
- 复核方法：先读 §13/§13.1 处置，再核对正文/AC/风险/角色卡；从 P1.2 重新提取三块 `contract_check topic` 文本与示例，用真实 `parseProjectModules` / `parseProjectRoster` / `loadLatestRoster` 在临时目录验证正/负例；统计每块文本的 schema 常量行；重新跑 §7.3 六个基线套件；未改方案/代码/测试/意图/沟通/验收，未 commit/push。

**N1–N7 处置核对**

| 发现 | 状态 | 窄复核说明 |
| --- | --- | --- |
| N1 | 已关闭 | roster 示例的 `purpose` 已改为 `核心逻辑与公开接口`，与 modules 示例逐项一致；实测 `parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE,"demo").doc.modules` 与 `parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE,"demo").roster.modules` `deepEqual` 为 true（两示例均 1 模块，全部字段一致）。§3.6 增加该 `deepEqual` 断言；AC-1/AC-15/§7.1 明确正例使用 `PROJECT_MODULES_SCHEMA_EXAMPLE` 作为 modules fixture；§8.7 增加示例漂移风险行。实测两示例 + intent/proposal/architecture 构造临时项目 → `loadLatestRoster` 为 `ok:true`（1 模块 / 1 角色）；修改 roster 模块字段后 `roster-modules-drift` 仍可命中。 |
| N2 | 已关闭（附建议） | 实测三块文本中每个 schema 常量恰好出现 3 行，且行内容分别是「文档/位置行」「`- schema: 字面量 …`」「示例 `schema: …`」，与用常量拼出的期望行一致；AC-17/§7.1/§3.6 已改为该断言。N9：精确 3 行是严格计数；未来若新增合法的 schema 常量提及（例如新的提示行），测试会失败，需同步更新期望；建议在 AC-17 注明这一维护契约，或改为「所有包含版本样式的行都必须是期望行之一」的断言。当前文本无误伤。 |
| N3 | 已关闭 | 实测 roster 文本 **3763 B**，满足 ≤3900 B 预算守卫（距守卫 137 B，距硬上限 4096 为 333 B）；§3.5/§8.2/AC-3/§3.6 已落入守卫与「新增字段先压缩或拆子 topic」规则。当前可接受；后续新增字段必须先评估该预算。 |
| N4 | 已关闭（附建议） | `topic=roster` 文本新增第三条警告「占位 omissionReason 必须替换，不得原样提交」（line 327）；AC-18 增加「schema 文本含警告、真实项目文档不含占位符」的验收检查。运行时仍只校验非空，符合非目标；建议实施/验收时把「占位符不得原样提交」作为真实项目文档检查项，必要时在模板/回执中提示。 |
| N5 | 已关闭 | §4.1 明确错误显示优先取 raw `purpose`：`purpose:true` 且无 `responsibility` → `boolean: true`（不是「未提供」）；`purpose` 缺省/null 时才显示 `responsibility` 的 raw 类型；矩阵与 AC-9 同步。 |
| N6 | 已关闭 | AC-15/§7.1/§3.6 已增 `roster-reference-missing` 与 `roster-modules-doc-missing` 负例；临时目录实测两者分别命中对应 code（另实测 `roster-modules-doc-invalid`/`roster-version-invalid` 也可命中，未全部列入 AC）。 |
| N7 | 已关闭 | §10.3 的「实施前基线」命令已同步为 §7.3 的六个文件（含 `view-image-cards.test.ts` / `list-project.test.ts`）。 |

**P1.2 重新实测**

- 三块完整文本（UTF-8，无尾随换行）：`modules` **2438 B**、`roster` **3763 B**、`topology` **1265 B**，与 P1.2 自检一致；均 <4096，roster 满足 ≤3900 B 预算守卫；三块均无字面 `taskKind`。
- 示例常量：modules 282 B、roster 850 B（`purpose` 对齐后比 P1.1 的 835 B 增加）、topology 171 B；`parseProjectModules(...,"demo")` 与 `parseProjectRoster(...,"demo")` 均 `ok:true`；两者 `modules[]` `deepEqual` 为 true；roster 示例包含 topology 示例，三块完整文本分别包含各示例。
- 加载级：用两个示例 + intent/proposal/architecture 构造临时项目 → `loadLatestRoster` 为 `ok:true`（1 模块 / 1 角色）；改动 roster 模块字段 → `roster-modules-drift`；移除 modules 文档 → `roster-modules-doc-missing`；移除 intent 文件 → `roster-reference-missing`。
- schema 常量行：modules 的 `project-modules/v2` 恰好 3 行（文档行、`- schema: 字面量 …`、示例 `schema: …`）；roster 的 `project-roster/v3` 恰好 3 行（文档行、schema 行、示例）；topology 的 `project-topology/v2` 恰好 3 行（位置行、schema 行、示例）；行内容与常量拼出的期望行一致，当前无额外合法/非法命中。
- 角色卡：rapporteur 4246 B / 25 行；新增两行 +366 B，加入后约 4612 B / 27 行（与 F16 一致）。
- 基线：`node --test` 六个文件（§7.3 全部）→ **72 tests / 72 pass / 0 fail**（约 3.8 s）；代码 HEAD 未变，P1.2 只改方案文档。
- 写集/范围：§10.2 写集与 P1.0/P1.1 相同，未新增文件；§7.3 新增的是运行命令，不是写集；§12 仍只保留 topic 可见范围为真实确认项；未发现范围扩张或写集越界。

**P1.2 剩余发现**

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| N8 | 漏重点 | 建议 | §11 lines 837–840（版本记录表）；顶部版本记录 lines 14–19 | 顶部版本记录已含 P1.2 行，但 §11 的「版本记录」表仍只有 P1.0/P1.1；§11.2 自己要求每轮实质修改在 §11 版本记录追加一行，当前自相矛盾。 | P1.2 为实质修订；§11 表缺少 P1.2；顶部表已有 P1.2。 | 在 §11 版本记录表补 P1.2 行（摘要/状态与顶部一致），保持文档自洽；不影响设计/AC。 |
| N9 | 漏重点 | 建议 | §3.6 line 450、§7.1 line 669、AC-17 line 697 | AC-17 要求「每个 topic 的 schema 常量恰好 3 行且每行等于常量拼出的期望行」。当前实测确实恰好 3 行且匹配；但若未来新增合法的 schema 常量提及（如新的提示/错误示例行），测试会因行数增加失败，属于严格维护约束。 | 当前三块文本各 3 行；方案未说明未来合法新增的更新方式。 | 在 AC-17 注明「新增合法 schema 行必须同步更新期望行集合」；或改为「所有包含 schema 版本样式的行都必须是期望行之一」并保留无旧字面量断言。当前不阻断。 |

**P1.2 窄复核结论**

**建议提交客户确认。**

P1.2 已真实关闭 P1.1 窄复核的 N1–N7：modules/roster 示例模块字段 `deepEqual`、§3.6/AC-1/AC-15/§7.1 的加载级正例 fixture、跨示例漂移风险行（N1）；AC-17 每 topic 恰好 3 行且等于常量期望行的断言（N2）；roster 3763 B ≤3900 B 预算守卫（N3）；第三条占位警告与 AC-18（N4）；`purpose:true` 的 raw 类型文案（N5）；AC-15 两个 missing 负例（N6）；§10.3 六文件基线命令（N7）。三块文本实测 2438/3763/1265 B，示例 parser 级 `ok:true` 且 `modules[]` `deepEqual`，两示例 + 四个文件 `loadLatestRoster` 为 `ok:true`，drift/missing 负例命中，基线六套件 72/72 绿；未发现范围扩张或写集越界。

剩余 N8（§11 版本记录表漏 P1.2）与 N9（AC-17 精确行数的未来维护契约）均为 **建议**，不构成阻断；作者可在闸门 1 前顺手修正，不需再次完整复核。没有新的重要发现，也没有发现与闸门 0 意图不一致或需要客户重新决策的新问题。复核记录本次追加后的最终行数/SHA-256 见交付回执；方案 §13 当前引用的是 P1.1 快照 237 行/hash，闸门 1 材料应以最终复核记录文件为准，作者可在 §13 补 P1.2 复核引用。

**P1.2 窄复核限制**：未实施/未运行 `contractSchemaText`、未跑新增测试、未 typecheck；未启动应用/UI；未独立重跑 `ans-work/科研/layer0`；未验证所有运行时注入；P1.0/P1.1 未受影响章节未重读。上述事实来自 P1.2 文本提取、真实 parser/`loadLatestRoster` 临时目录验证与六个基线套件的只读运行。

