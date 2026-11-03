# 验收完成标准：给内置策划一个可查询的文档 schema（`contract_check` topic）——实施前标准 v1

- 风险档位：**T3**（闸门 2 与团队计划确认，不压档、不降档）。依据：本变更触及 `src/model/runtime.ts` 共享 Model（`CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic`）与 `contract_check` 公共工具契约（`src/provider/runtime/{tools,schema}.ts` 的入参/校验/描述），并修改内置策划卡文本（`src/common/门禁引擎/governance-roles.ts`，治理材料）。客户闸门 1 已确认「若统筹/验收按『凡触 Model/公共工具契约即 T3』管理，则按 T3 全量回归并重评」，闸门 2 确认团队计划的 T3 判定。T3 依据与全量回归计划见 §五；不因大部分改动是只读文本/文案而降档。
- 判定依据：客户闸门 0/1/2 确认记录与实施授权 `docs/communication/2026-11-03_intent_contract-schema-query.md`（写标准开始时 **117 行** / SHA-256 `8b663dbb3cb4a9b5b624acec3a3762ab0a95018d018fa5efd364f650879f9b52`；写盘期间追加「实施授权记录」后为 **124 行** / SHA-256 `3a27eec377022e077389b7f55a44ce95d9ed40eca61f77de8545847771168c99`；该文件是沟通管理记录、可能继续追加，验收引用其**确认小节/授权小节**而不引用固定行号；闸门 0 快照 64 行 / `2c11b726…` 与团队计划文件头引用的 91 行 / `7e078ad3…` 均为历史快照，不混用）；客户闸门 1 确认的策划方案 **P1.3** `docs/planning/2026-11-03_design_contract-schema-query.md`（**911 行** / SHA-256 `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85`；本文件的 AC-1–AC-18 直接取自其 §7.2，§7.1/§7.3 测试矩阵与回归命令为范围来源）；独立复核 `docs/planning/2026-11-03_review_contract-schema-query.md`（**282 行** / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`；最终结论「建议提交客户确认」；F1–F16/N1–N7 已由 P1.3 全部采纳/关闭，N8 关闭、N9 为非阻断建议；复核不是客户确认）；客户闸门 2 确认的团队计划 `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md`（**539 行** / `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c`）§1.2（T3）、§4（角色/写集/无边界变更）、§5（契约归属/串行）、§6（阶段/V1 出口）、§7（验收与证据口径）、§8（闸门 2 确认项）。团队计划只作范围、写集、阶段、证据口径与 T3 来源，不是标准来源；本文件的 AC 不得弱于方案 §7.2。
- 选定检查：**T3 口径**——受影响套件（运行时核心 `npm run typecheck`；编排 `test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts`；桌面窗口 `test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts`；门禁引擎只读回归 `test/门禁引擎/view-image-cards.test.ts`、`test/门禁引擎/list-project.test.ts`）+ **T3 全量适用回归**（`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`）+ 双端 typecheck（`npm run typecheck`、`npm run typecheck:renderer`）。**不要求真实 Electron E2E**；若验收认为 Node 证据不足并只读运行既有 E2E，则如实记录结果，不把未运行写成通过。
- 录屏与截图：**不要求录屏**。验收证据**最多使用截图**，**不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`（2026-10-27 客户规则，`references/acceptance-role.md`）。本任务不涉及渲染层/UI，默认不使用截图；如运行既有 E2E 并使用截图，必须来自当前候选真实运行、关闭 DEBUG 覆盖层，并记录 SHA-256、候选版本与拍摄命令/窗口尺寸。
- 复用证据：仅**同一候选、同一输入/依赖/夹具、同一命令、同一配置、同一环境**的证据可复用；候选、输入、依赖、契约、夹具、构建或配置变化时，受影响证据失效，只补失效部分；不得跨候选复用，不得用其它变更（如 acceptance-return-card、dispatch-guardrail-relax、i18n、shell-escalation 等）的通过结论或证据替本变更背书。
- 任务 ID / flowId：`2026-11-03-contract-schema-query` / `contract-schema-query`。
- 标准路径 / 版本 / 日期：`docs/acceptance/contract-schema-query-criteria-v1.md` / **v1** / **2026-11-03**（实施前写盘并冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准、不判定候选；写标准时**未实施产品代码、未运行实施测试、未验收**（V1 本身未运行任何测试；测试角色的 B0 基线在本文件写盘期间并行启动，见 §1.1/§1.4）。客户闸门 2 已确认；**客户实施授权已在 V1 写盘期间由沟通记录追加**（2026-11-03，原话「授权实施：按团队计划与 P1.3 开始 V1 后的 B0/P1 与各阶段；不含提交/推送/发布。」；当前沟通记录 124 行 / `3a27eec3…`），**提交/推送/合并/发布仍未授权**。HEAD 仍为基线 `243d8f6a6db663a383b516aad6320c5110c7f583`，`git status --porcelain -- src app test` 为空（无本任务产品/测试改动）。
- **本文件由内置独立验收（技能内置管理角色，不是项目 `角色卡/独立验收` worker）的唯一验收主上下文在实施前写盘；实施后的 E2 由同一主上下文按本文件判定并另写 `docs/acceptance/contract-schema-query-report-v1.md`。** 本文件不是验收报告，不含任何通过/返工/证据不足结论；完成报告、D1 回归摘要、E1 变更包的自述都不能代替验收。
- 适用变更：仅本任务（`contract_check` 只读 schema topic + 逐字段错误文案 + topology 提示 + 策划卡两行；基线 P1.3）。**验收通过只表示当前候选满足本标准，不授权提交、推送、合并、发布**，也不授权绕过客户闸门或扩大写集；提交/推送/发布另行授权。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-03） | 沟通记录「闸门 0 确认记录」：客户原话「确认闸门 0：按该意图让策划出方案。」；Q1–Q4 按推荐 **A/A/A/A**——扩展 `contract_check` 的只读 `topic`（modules/roster/topology）；字段表 + 最小合法 YAML 示例（真实解析器锁定）；逐字段校验错误（含收到类型）与 topology `management` 提示/校验口径统一；非目标（不放宽校验、不自动修复、不改写权/权限/闸门/验收）不变。闸门 0 快照 64 行 / `2c11b726b9cde5d14c6d4b9f4f3d8800f6e01afddd2c061b25230975f914931c`（历史，不混用） |
| 闸门 1：方案确认 | 已确认（2026-11-03） | 沟通记录「闸门 1 确认记录」：客户原话「确认闸门 1：方案 P1.3（Q1–Q4 A/A/A/A、T2、三项待确认建议），进入团队计划。」；确认对象为方案 P1.3（911 行 / `4d61d376…`）+ 复核记录（282 行 / `55a2d268…`）；三项建议确认——schema topic 对所有已注入 `contract_check` 的角色可查（不新增角色门禁）、不做 `management.roles` 兼容（保留顶层扁平数组严格校验）、`architectureSource` 不强制路径校验（非空字符串 + 写作约定路径）；风险档位建议 T2，并附「若统筹/验收按凡触 Model/公共工具契约即 T3 则按 T3 全量回归并重评」的条件 |
| 闸门 2：角色/写集/边界/档位/阶段/验收安排/证据口径/越界规则 | 已确认（2026-11-03） | 沟通记录「闸门 2 确认记录」：客户原话「确认闸门 2：团队计划（无边界变更、T3、角色/写集/阶段/验收口径）。」；确认对象为团队计划（539 行 / `a93bd02f…`）：参与角色与精确写集；**无边界变更（B-0，H1 不适用）**；**T3（统筹判定，不压档）**；阶段顺序 G2 → IA → V1/B0 → P1 → A0a → A0b/A1/A3 → A2 → D1 → E1 → E2 → E3；验收安排（V1/E2、AC-1–AC-18 不弱化）与证据口径（T3 全量、双端 typecheck、不要求 Electron）；越界规则 |
| 客户实施授权（IA） | **已给（2026-11-03，V1 写盘期间追加）** | 沟通记录「实施授权记录」（与「闸门 2 确认记录」分开）：客户原话「授权实施：按团队计划与 P1.3 开始 V1 后的 B0/P1 与各阶段；不含提交/推送/发布。」；范围按团队计划（539 行 / `a93bd02f…`）与方案 P1.3（911 行 / `4d61d376…`）实施；**不含提交、推送、合并、发布**（另行授权）；P1 待 V1 经沟通确认 + B0 完成后启动。写标准开始时客户尚未给 IA；该记录在 V1 写盘期间由沟通追加（当前沟通记录 124 行 / `3a27eec3…`），以当前记录为准。 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-11-03）；V1 写盘即冻结；行数与 SHA-256 由沟通/E1 在外部记录（本文件不自引用最终哈希） |

**引用快照说明**：方案 P1.3 文件头仍写「待闸门 1 客户确认」、团队计划文件头/§2 仍写「闸门 2 未确认、客户实施授权未给」——这些是写于对应确认之前的**历史状态行**，不作为当前判定依据；当前判定以 `docs/communication/` 的闸门 0/1/2 确认小节、实施授权记录与上表冻结版本为准（另见 §九.2）。

### 1.2 版本冻结与变更规则

- 本文件写盘即冻结为 **v1**；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案/契约实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- **方案/契约的实质变化**（改查询面 Q1–Q4、topic 集合、示例/字段表语义、错误码或接受/拒绝集合、`management` 口径、`architectureSource` 路径口径、写集、边界、T3、AC、验收/证据/写权/闸门）按方案 §8.6/§11 与团队计划 §5.2/§6.4 停止并重开对应闸门（必要时重开闸门 1/2）；本文件随之说明失效范围并重开 V1。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，不是实施/提交/推送/合并/发布授权；实施授权以沟通记录为准，验收结论只写在 `docs/acceptance/contract-schema-query-report-v1.md`。
- **本文件自身的最终行数与 SHA-256 由沟通/E1 在外部记录**（变更包/沟通记录）；本文件不写入、不自引用其最终哈希（避免自指循环）。若标准在确认前修订，重记哈希并重交沟通确认。

### 1.3 本轮范围（判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §3–§7 与团队计划 §1.1/§7.1）：

1. **`contract_check` topic 查询面**：新增可选只读 `topic: "modules" | "roster" | "topology"`；topic 模式只返回该文档的字段表 + 最小合法 YAML 示例；不读 run、不混入 run 摘要/写区；未知/非字符串明确拒绝；空串/空白串/`null` 走 legacy；角色隔离保留；文本 ≤4 KiB（roster 另 ≤3900 B）。
2. **schema 文本单一定义与示例锁**：枚举/类型在 `src/model/runtime.ts`；文本/示例/`contractSchemaText(topic)` 在 `src/common/编排/workflow-preconditions.ts`；工具层/会话/描述复用同一枚举；三示例由真实 parser `ok:true` 锁定，`modules[]` 逐项一致，`loadLatestRoster` 正/负例锁加载级约束。
3. **逐字段错误与 topology 提示**：roster 与 modules 文档四字段（`name`/`purpose`/`publicContract`/`architectureSource`）逐字段、带收到类型；`purpose`/`responsibility` raw-vs-effective 口径；topology `management` 提示与校验口径统一为顶层扁平数组；错误码不变、接受/拒绝集合不变。
4. **策划卡与查询指引**：`RAPPORTEUR_CARD_TEXT` 两行（先查 topic；`publicContract` 非空字符串；`management` 扁平数组）；`trio-worker-report.test.ts` 卡断言。
5. **不变面**：无新写路径/写区/角色权限/角色门禁/闸门/验收/证据规则；不改 parser 接受/拒绝集合；不改运行项目文档；不新增工具/依赖/文件。
6. **T3 证据口径**：受影响套件 + T3 全量回归（排除 `write-sequencing.test.ts` 并记录）+ 双端 typecheck；不要求 Electron E2E；新增确定性失败 0、新增 skip 0（§五）。

**明确不判定为本轮缺陷或范围的边界**（依据闸门 2 已确认版本，不是放宽）：

- 不新增 `proposal`/`architecture`/意图入口 topic；不新增独立工具 `contract_schema`；不把 schema 塞进每次 run 摘要（方案 §2 Q1–Q2）。
- 不接受 `management.roles` mapping 兼容；不把 `architectureSource` 路径改为强制校验；不加「仅策划可查」角色门禁（闸门 0 非目标 + 闸门 1 三项建议）。
- 不修改 `ans-work/科研/layer0` 或任何运行项目文档；AC-18 的真实项目检查只读，不可访问时按 §2.4/§3.18 记录。
- 不处理 roster/引用循环、demo 重复投递、run pin 哈希、版本链 M13、D3 招人逻辑等独立事项。
- 不改 `app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/common/shared/**`、`package.json`、`README*`、构建/发布配置、角色卡/边界/YAML/changelog。
- 不 commit/push/merge/release；不接触客户；不伪造 task_ops 机器状态或审批（本项目无 `.ans/project.json`，未启用 task_ops）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-03 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git branch --show-current` / `git rev-parse HEAD` | `release/v1.8.4-assets` / `243d8f6a6db663a383b516aad6320c5110c7f583`（与方案头/团队计划基线一致） |
| 工作树（写标准前快照） | `git status --porcelain -uall \| sort` 及其 SHA-256 | **6 条**：2 个管理 memo 修改（`docs/communication/memo.md`、`docs/scheduling/memo.md`）；4 个未跟踪管理记录（本任务意图/方案/复核/团队计划）。快照 SHA-256 `99b27e79d13e27c66522d8a0b3c7637e2879a65dfedc240da1c1d4bd66fa9e90`（本文件写盘前；本文件写入后快照变化，本文件属管理记录、不属产品候选） |
| 产品/测试改动 | `git status --porcelain -- src app test` | **空**（写标准时实测 0 条） |
| 沟通记录（写标准开始时 / 写盘期间） | `wc -l` / `sha256sum` | 开始时 **117 行** / `8b663dbb3cb4a9b5b624acec3a3762ab0a95018d018fa5efd364f650879f9b52`；写盘期间追加「实施授权记录」（lines 119–125）后为 **124 行** / `3a27eec377022e077389b7f55a44ce95d9ed40eca61f77de8545847771168c99`；含闸门 0/1/2 材料与确认 + 实施授权；历史快照：闸门 0 64 行 / `2c11b726…`、团队计划头引用 91 行 / `7e078ad3…`（不混用） |
| 方案 P1.3 | 同上 | **911 行** / `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` |
| 复核记录 | 同上 | **282 行** / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`（P1.0 178 行 / `87494f33…`，P1.1 237 行 / `57cc1809…`，P1.2 282 行 / `55a2d268…`；不混用） |
| 团队计划 | 同上 | **539 行** / `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（实施/取证仍须记录实测版本） |
| `package.json` 脚本 | `node -e` 读取 `scripts` | `typecheck`=`tsc --noEmit`；`typecheck:renderer`=`tsc -p app/renderer/tsconfig.json`；`build:renderer`=`vite build --config vite.config.ts`（本任务不要求 build:renderer） |
| T3 回归文件范围基线 | `find test -name '*.test.ts'` | **394** 个测试文件；其中 `write-sequencing.test.ts` **1** 个；全量命令实际纳入 **393** 个（D1 须记录实际清单与计数） |
| 任务配置 | `ls .ans/project.json` | 不存在；未启用 task_ops；不伪造任务令牌/锁/预检 |
| 代码锚点（只读核对，HEAD 成立） | Grep/Read（只读，不运行） | `ContractCheckInput` `src/model/runtime.ts:1139-1148`；`CONTRACT_CHECK_TOOL_NAME`/`CONTRACT_CHECK_MAX_BYTES=4096` `src/provider/runtime/tools.ts:139-140`；`makeContractCheckTool` `:2417-2465`（角色隔离 `:2424-2426`，数据源空/非字符串 `:2453-2455`，legacy 截断标记 `:2456`）；`contract_check` 参数/描述 `src/provider/runtime/schema.ts:630-651`；`contractCheckText` `app/desktop/session.ts:8095-8203`（首条可执行语句 `getListing` `:8096`，`refreshListingNow` `:8097`，会话层 4 KiB 截断 `:8194-8202`）；schema 常量 `src/common/编排/workflow-preconditions.ts:24-28`；`validateRosterTopology` `:294-420`（schema 提示 `:328`，management 归一化 `:334-339`，缺 convener `:340-341`，缺项目角色 `:347-349`）；`parseProjectRoster` `:443-724`（四字段合并报错 `:568-573`）；`parseProjectModules` `:727-840`（四字段合并报错 `:791-793`）；`loadLatestRoster` `:896-1069`（drift `:984-992`，reference missing/stale/inconsistent `:1018-1061`）；`validateAppointmentCardAgainstRoster` `:1087-1133`；`RAPPORTEUR_CARD_TEXT` `src/common/门禁引擎/governance-roles.ts:177-193`（`@deprecated` 注释仍由 `:332` 注册表返回）；`governanceRoleOf` `:470`；`src/service/role/resolve-role.ts:80/98` 使用 `spec.cardText` |
| 既有测试锚点 | Grep/Read（只读） | `test/桌面应用/rejection-copy.test.ts:161-198`（现有 `contract_check` 只读/角色隔离/4 KiB）；`test/桌面应用/run-pin.test.ts:522-545`（现有 session 级 `contract_check`）；`test/编排/trio-worker-report.test.ts:195-204`（现有策划卡断言）；`test/门禁引擎/view-image-cards.test.ts:16-47`（卡内容禁用项，不检查长度）；`test/门禁引擎/list-project.test.ts:31/148`（卡文本非空） |

以上只读核对用于确认基线与约束；本文件写盘未改方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未启动应用、未运行任何实施测试（仅只读核对仓库文件与哈希）。除上述只读事实外，本文件没有新增产品行为要求。

**写标准期间的并行事实**：客户实施授权记录在 V1 写盘期间由沟通追加至 `docs/communication/2026-11-03_intent_contract-schema-query.md`（124 行 / `3a27eec3…`）；测试角色已按该授权并行启动 B0，读取时点 `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` 尚未定稿（仍含 T3/失败/证据占位符），本 V1 **不引用其未定稿内容**，B0 完成状态以测试角色定稿与沟通/统筹记录为准；这些是管理/证据记录，不是产品候选。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施按闸门 2 确认的写集与团队计划阶段执行；实施授权范围以沟通记录为准。**验收通过只表示当前候选满足本标准**，不是放行文档、不是客户批准、不是发布授权。

### 1.6 与其他任务文档的版本关系

- 本文件基于方案 **P1.3**（闸门 1 确认的唯一实施基线）与团队计划（闸门 2 确认对象）编写；方案更早版本（P1.0/P1.1/P1.2）只是修订历史，不是判定基线。
- 复核记录是建议与发现来源，不是客户确认、不是标准来源；F1–F16/N1–N7 的采纳已在方案 §13 落点，N9 为 AC-17 的维护契约说明（§九.4）。
- 团队计划 §9.3 已如实记录与任务摘要的三处不一致（`trio-worker-report.test.ts` 纳入、意图快照、T2/T3）；本文件按闸门 2 确认的团队计划执行，并记录于 §九。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（AC）与核对项只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；**必须写明依据**（客户书面确认的范围变更，或本文件明确列出的读范围限制），不得用来回避必需证据 |

本任务 **AC-1–AC-18 全部适用**，默认均须给出 `pass`/`fail`/`insufficient evidence`；唯一可能使用 `not applicable` 的是 AC-18 的「真实项目文档不含占位符」只读抽查（若运行项目不在本 worktree 的授权读取范围；见 §3.18），且 AC-18 的 schema 文本警告部分不得因此豁免。

E2 报告 `docs/acceptance/contract-schema-query-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-18、K1–K8 | 本文件各条标准与重点核对项 | 本文件各条「所需证据」 | 原始输出/日志/哈希路径 | E1 变更包候选（HEAD + 逐文件 `git hash-object`/`sha256sum` + `git status --porcelain -uall \| sort` 快照 SHA-256） | 编排/桌面窗口/门禁引擎/运行时核心/测试/独立验收 | 实际观察摘要 | pass/fail/insufficient evidence/not applicable |

总体结论：**AC-1–AC-18 全部 `pass`，K1–K8 全部满足，且 T3 证据口径（§五）齐全，才算通过**；任一项 `fail` → 返工；无 `fail` 但有任一项 `insufficient evidence` → 证据不足，不得判 pass。`not applicable` 只按 §2.1 的限定使用并写依据。

### 2.2 原始证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、断言存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：`contractSchemaText(topic)` 的完整输出、工具 handler 的真实返回（`ok`/`message`/调用计数）、session 数据源的真实文本、错误码与 `reason` 原文、`loadLatestRoster` 的正/负例结果、角色卡文本原文、测试计数与失败原文、全量回归原始输出。
- 开发者自述、测试角色转述、工具「成功」、计划文字、摘要、完成报告/进度报告，都**不算原始证据**，也不能代替独立验收；验收读取原始命令输出、文件哈希、diff/status、测试计数与失败原文。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- 不得用纯函数单测代替工具层/会话层集成断言，也不得用工具层测试代替编排 parser/加载级矩阵；两侧证据都要（见 AC 映射）。
- 不得用其它变更的通过结论、摘要或测试计数替本变更背书。

### 2.3 T3 证据口径

- 按 `references/testing.md` 的唯一定义，本变更 **T3**：共享抽象（Model/公共入口/跨模块契约）与治理材料变更；默认验证为「全量适用回归 + 发布/共享抽象检查」。闸门 2 已确认 T3，本文件不压档、不降档。
- 受影响层与跨角色回归见 §5.2；**T3 全量适用回归是必需证据**（§5.4）；`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，允许排除但必须记录可复现命令、原因与既有验收依据，不得静默跳过，也不得把排除当通过。
- `npm run typecheck` 与 `npm run typecheck:renderer` 均须通过并记录退出码 0 与原始输出。
- 本任务不改渲染层/UI/窗口/IPC，**不要求** `npm run build:renderer` 或真实 Electron E2E；若运行，仅作补充证据并如实记录。
- 证据不足或候选不可复算时按 §5.8 升档补证；升档不降档。

### 2.4 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC/核对项判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何原始输出/文件（只给摘要、转述、口头自述、工具成功提示、完成报告）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；E1 变更包候选哈希与工作区不一致。
3. 新测试断言缺失、未运行、被 `skip`/`todo`，或断言被删除/放宽以保绿；既有测试被改弱。
4. AC-1/AC-2/AC-3/AC-15/AC-17 缺 `test/编排/workflow-preconditions.test.ts` 的原始断言输出；或 AC-4/5/6/7/8/16 缺工具层/session 层真实输出，只用纯函数单测证明。
5. AC-9 只测 `publicContract: true`，缺 `name`/`purpose`/`architectureSource` 的空值/非字符串矩阵；或缺 `purpose` 的 raw-vs-effective 与 `responsibility` 别名用例。
6. AC-10 缺 mapping 的 raw `object（mapping）`、缺角色文案或 v1 提示不再含「management.roles 含 convener」任一侧。
7. AC-11 只有卡文本存在、没有 `trio-worker-report.test.ts` 断言与 `view-image-cards.test.ts` 回归；或卡活动路径未只读核对。
8. AC-12 只有测试通过、没有第一句早退与早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile` 的代码证据；或 AC-13 缺 legacy `seenInput` 深比较不变证据。
9. AC-14 缺 `npm run typecheck`/`typecheck:renderer` 退出码 0；缺 §7.3 六个套件原始输出/计数；缺 T3 全量回归原始输出/计数/失败分类；新增 skip 未清零；或测试删除/弱化无逐条说明。
10. T3 全量回归未针对当前候选执行，或排除 `write-sequencing.test.ts` 未记录命令/清单/原因；把既有 Windows symlink `EPERM` 等环境失败算作通过或算作本次新增失败而未分类。
11. AC-15 缺 `loadLatestRoster` 正例或五个指定负例中任一；或正例未使用与 roster 示例 `modules[]` 逐项一致的 modules 文档。
12. AC-17 只用 `includes` 证明常量存在、没有逐 topic「恰好 3 行且等于常量期望行」的逐行断言。
13. AC-18 的 schema 文本警告断言缺失；真实项目抽查不可访问时未写明 `not applicable`/`insufficient evidence` 依据。
14. 写集外改动（产品/测试/共享层/构建/发布/角色卡/边界）或并发混入未隔离；E1 变更包把管理记录混入产品候选。
15. E1 变更包/证据缺方案版本、标准版本、候选哈希或节点对应关系；或实施/测试自评即验收结论。
16. `not applicable` 未写明依据。

**不得放宽的具体禁令**：不以时间紧降档；不以纯函数单测替代工具层/会话层证据；不以工具层测试替代编排 parser/加载级矩阵；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏或截图扣分（也不得把录屏/截图当作必需证据要求提供）；不因文档/披露项而把其证据要求归零。

### 2.5 证据复用与失效

- 同候选、同输入/依赖/夹具、同命令、同环境、同配置的证据可以复用；候选、输入、依赖、契约、夹具、构建或配置变化时，受影响证据失效，只补失效部分。
- 复用必须在 E1 变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致后才接受。
- 不得跨候选复用；不得用其它变更的证据替本变更背书；B0 基线证据只作对照，**B0 的任何通过计数不得作为当前候选证据**。
- 管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`、各角色 `docs/change/`）不纳入产品候选，其哈希变化不影响产品候选有效性；但 E1 变更包须把「产品候选」与「治理/证据记录」分开列明。
- 测试整体性：一个测试套件作为一条命令整体运行；不得把同一套件拆给多个角色再拼成「全量通过」。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置（§1.4），未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、测试计数与失败原文为准；**不得伪造任务令牌、锁、审批、机器预检、验收凭证或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- **产品候选**只列相对基线 HEAD `243d8f6` 变化、且落在闸门 2 写集内的路径（§七）。产品候选必须由 E1 变更包给出：HEAD、`git status --porcelain -uall | sort` 快照 SHA-256、逐文件 `git hash-object` + `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
- **管理记录**（本 V1、E2 报告、沟通/方案/复核/团队计划、各角色 `docs/change/` 证据）不混入产品候选；本文件写入后工作树快照变化不改变产品候选。
- **并发写同一产品文件且未隔离**的，按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 `pass`。
- 本任务无边界变更（B-0）；若出现任何角色卡/边界/YAML/changelog 改动，按越界处理（§5.8/§七）。

### 2.8 完成报告不能代替验收

- 实施角色的完成报告、自测输出、D1 回归摘要、E1 变更包的对证据描述，都只是**证据索引**；验收必须自行打开决定性原始输出（测试日志、错误原文、文本输出、哈希、diff）后才写判断。
- 「所有测试都通过」「按方案实现」等结论性摘要不构成证据；没有原始输出即 `insufficient evidence`。
- 验收不能把「工具成功」「提交成功」「构建成功」当作满足某条 AC 的证据。

---

## 三、验收项（AC-1–AC-18）

### 3.0 总表与方案映射

| ID | 方案 §7.2 标准（摘要，原文见各小节） | 所需证据（摘要） | 证据路径（计划） | 候选标识 | 产出角色 | 结果（V1 写盘时） | 判断（E2） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | 三个示例均可被真实解析器解析；modules/roster 示例 `modules[]` `deepEqual` | parser 断言原始输出（`ok:true`、deepEqual） | `test/编排/workflow-preconditions.test.ts`；D1 记录 | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-2 | roster 示例与 topology 示例单一来源 | `includes` 断言输出 | 同上 | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-3 | 三块 schema 文本 ≤4 KiB；roster 另 ≤3900 B | 字节数断言与实测值 | 同上 | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-4 | topic 透传 | `seenInput.topic` 断言 | `test/桌面应用/rejection-copy.test.ts` | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-5 | 未知 topic `ok:false`、列出可用值、数据源未被调用 | 返回原文 + 调用计数 0 | 同上 | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-6 | 非字符串 topic `ok:false`、消息含「应为字符串」 | 返回原文 | 同上 | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-7 | 角色隔离 | `{topic, roleId:other}` 返回原文 | 同上 | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-8 | topic 模式无 legacy 行；topic+flowId+taskKind 时 topic 优先 | session 输出行断言 + 工具层透传断言 | `test/桌面应用/run-pin.test.ts`、`rejection-copy.test.ts` | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-9 | 四字段逐字段错误矩阵；`purpose` raw-vs-effective；`boolean: true` | 错误码/reason 原文矩阵 | `test/编排/workflow-preconditions.test.ts` | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-10 | topology `management` 提示与校验口径一致 | mapping/缺角色/宽容读取/v1 提示原文 | 同上 | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-11 | 策划卡出现四项；`view-image-cards.test.ts`（可选 `list-project.test.ts`）全过 | 卡文本原文 + 断言/回归输出 | `test/编排/trio-worker-report.test.ts`、`test/门禁引擎/{view-image-cards,list-project}.test.ts` | E1 候选快照 | 门禁引擎（A3）写卡；编排（A1）写断言；测试（D1）回归 | 未实施/未判定 | 待 E2 |
| AC-12 | 无新写路径；topic 分支第一句早退；无 run 也可用 | 源码 diff（首句/无 IO）+ 无 run 测试输出 | `app/desktop/session.ts`、`run-pin.test.ts` | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-13 | 旧调用不变 | legacy 输出 + `seenInput` 深比较输出 | `rejection-copy.test.ts`、`run-pin.test.ts` | E1 候选快照 | 桌面窗口（A2）；测试（D1）回归 | 未实施/未判定 | 待 E2 |
| AC-14 | 双端 typecheck；§7.3 套件全过 | 退出码 0 + 六套件计数 + T3 全量（§五） | D1 记录与原始日志 | E1 候选快照 | 测试（D1）；运行时核心 typecheck | 未实施/未判定 | 待 E2 |
| AC-15 | `loadLatestRoster` 正/负例 | 正例 `ok:true` + 五负例 code 原文 | `test/编排/workflow-preconditions.test.ts`（或 `run-pin.test.ts` 既有夹具） | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-16 | 空/空白 topic 走 legacy；`topic:123` 拒绝 | `seenInput`/输出/错误原文 | `test/桌面应用/rejection-copy.test.ts` | E1 候选快照 | 桌面窗口（A2） | 未实施/未判定 | 待 E2 |
| AC-17 | 每 topic schema 常量恰好 3 行且等于常量期望行 | 逐行数组 deepEqual 输出 | `test/编排/workflow-preconditions.test.ts` | E1 候选快照 | 编排（A1） | 未实施/未判定 | 待 E2 |
| AC-18 | 占位 omissionReason 警告；真实项目文档不含占位符 | 文本断言 + 只读抽查记录 | `test/编排/workflow-preconditions.test.ts`；E2 只读检查 | E1 候选快照 | 编排（A1）；独立验收（E2 只读） | 未实施/未判定 | 待 E2 |

**映射自检**：AC-1–AC-18 与方案 §7.2 的 AC-1–AC-18 **一一对应**，标准文字逐条保留（各小节引用原文），未拆分、未合并、未删减、未弱化。本文件新增的只是**证据记录字段、判定观察点、K1–K8 重点核对项与 T3 验证口径**（后者来自闸门 2 确认的团队计划与 `references/testing.md`）；这些不新增产品行为要求，不得被用来扩大范围或加严方案。

**团队计划 §7.3 覆盖自检**：AC-1→编排；AC-2→编排；AC-3→编排；AC-4→桌面窗口；AC-5→桌面窗口；AC-6→桌面窗口；AC-7→桌面窗口；AC-8→桌面窗口；AC-9→编排；AC-10→编排；AC-11→编排测试 + 门禁引擎回归；AC-12→桌面窗口 + 代码审查；AC-13→桌面窗口；AC-14→测试 D1；AC-15→编排；AC-16→桌面窗口；AC-17→编排；AC-18→编排测试 + 独立验收只读。无遗漏。

### 3.1 AC-1 三个示例均可被真实解析器解析

- **方案标准（原文，不弱化）**：`parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE, "demo").ok === true`；`parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo").ok === true`；两者 `modules[]` `deepEqual`（N1）。
- **所需证据**：
  1. `parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE, "demo")` 返回 `ok:true` 的原始断言输出；失败时原始 `reason`。
  2. `parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo")` 返回 `ok:true` 的原始断言输出；失败时原始 `reason`。
  3. `assert.deepEqual(modules.doc.modules, roster.roster.modules)` 通过的原始输出（两示例的 `modules[]` 逐项一致，含 `purpose` 等全部字段）。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts` 新增断言；D1 回归记录与原始日志。
- **候选标识**：E1 变更包候选快照（HEAD + 逐文件 `git hash-object`/`sha256sum` + `git status --porcelain -uall | sort` 快照 SHA-256）；证据必须来自该候选。
- **产出角色**：编排（A1）产生测试与断言；测试（D1）在候选上复跑。
- **结果（V1 写盘时）**：未实施/未判定。
- **判断（E2）**：`pass` / `fail` / `insufficient evidence`（默认不适用 `not applicable`）。
- **典型 fail/insufficient**：任一 parser 返回 `ok:false`；只断言常量存在、未真实解析；两条 `modules[]` 的 `purpose` 等字段不一致；只给测试号不给原始输出。

### 3.2 AC-2 roster 示例与 topology 示例单一来源

- **方案标准（原文，不弱化）**：`PROJECT_ROSTER_SCHEMA_EXAMPLE.includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE) === true`。
- **所需证据**：该 `includes` 断言的原始输出；并确认 roster 示例文本使用的是 `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE` 插值而非第二份副本（源码摘录）。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；A1 候选源码 `src/common/编排/workflow-preconditions.ts`。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：assert 为 false；或 roster 示例内联了一份 topology 字面量、没有引用常量（即使文本相等）。

### 3.3 AC-3 三块 schema 文本 ≤4 KiB

- **方案标准（原文，不弱化）**：`Buffer.byteLength(contractSchemaText(t), "utf8") <= 4096` 对三个 topic 均成立（草案实测 2438 / 3763 / 1265 B）；roster 另断言 ≤3900 B（N3 预算守卫）。
- **所需证据**：
  1. 对 `modules`/`roster`/`topology` 三个 topic 分别的 `Buffer.byteLength(..., "utf8")` 实测值与 `<= 4096` 断言输出。
  2. `roster` 文本 `<= 3900` 的断言输出。
  3. 文本内容为完整 schema 文本（字段表 + 示例），不是被截断的片段；记录实际字节数（实现值可与草案略有差异，但必须满足上限）。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；D1 原始输出。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：任一 topic >4096；roster >3900；只给「通过」摘要无实测字节；用截断后的文本证明 ≤4 KiB。

### 3.4 AC-4 topic 透传

- **方案标准（原文，不弱化）**：工具 handler 收到的 `ContractCheckInput.topic` 与调用参数一致。
- **所需证据**：工具层测试中 `seenInput`（或等价捕获）对 `{topic:"roster"}` 等调用的断言原文，证明 `ContractCheckInput.topic === "roster"`；同时验证合法 topic 的 `ok:true`。
- **证据路径（计划）**：`test/桌面应用/rejection-copy.test.ts` 新增 topic 透传用例；D1 原始输出。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：只断言输出含 schema、不检查 `seenInput.topic`；透传值被改写/裁剪。

### 3.5 AC-5 未知 topic

- **方案标准（原文，不弱化）**：`ok:false`，消息含 `modules|roster|topology`；数据源未被调用。
- **所需证据**：
  1. `{topic:"foo"}`（或其它未知值）的返回原文：`ok:false`，消息列出可用值 `modules|roster|topology`。
  2. 数据源调用计数为 0（例如 `seenInput === undefined` / `calls === 0`）的断言输出。
- **证据路径（计划）**：`test/桌面应用/rejection-copy.test.ts`；D1 原始输出。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：返回 `ok:true` 或走了 legacy；消息缺可用值；数据源被调用；只给 `ok:false` 不检查调用计数。

### 3.6 AC-6 非字符串 topic

- **方案标准（原文，不弱化）**：`ok:false`，消息含「应为字符串」。
- **所需证据**：至少 `topic:123`（number）的返回原文：`ok:false` 且含「应为字符串」；§3.2 的 boolean/array/object 情形建议一并覆盖（作为支持证据，不单独作为 AC-6 通过条件）。
- **证据路径（计划）**：`test/桌面应用/rejection-copy.test.ts`。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：静默忽略非字符串走 legacy；消息不含「应为字符串」；返回 `ok:true`。

### 3.7 AC-7 角色隔离

- **方案标准（原文，不弱化）**：`{topic:"roster", roleId:"other"}` → `ok:false`，消息含「只允许查询本角色」。
- **所需证据**：该调用的返回原文；并证明隔离先于 topic 校验（即使 topic 合法也拒绝）。
- **证据路径（计划）**：`test/桌面应用/rejection-copy.test.ts`。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：topic 模式绕过角色隔离；返回 `ok:true`；消息不含「只允许查询本角色」。

### 3.8 AC-8 topic 模式无 legacy 行

- **方案标准（原文，不弱化）**：不得出现以 `run：` 开头、以 `taskKind ` 开头且含「必填」、以 `可写边界：` 开头的行；允许头部 `topic=<t>` 与「仅 schema 与示例……其余参数被忽略」。另测 `topic + flowId + taskKind` 同时给出：topic 优先，后三者被忽略。
- **所需证据**：
  1. session 层对三个 topic 的输出原文；对每一行按正则检查：不以 `^run：` 开头、不以 `^taskKind .*必填` 开头、不以 `^可写边界：` 开头（允许 `topic=<t>` 头部行与「仅 schema 与示例；不含 run/写区；其余参数被忽略」行）。
  2. `{topic:"roster", flowId:"focus", taskKind:"dispatch"}` 的工具层与 session 层输出：topic 被透传，输出只含 schema（无 run/角色/写区/taskKind 摘要）；`seenInput` 中 `flowId`/`taskKind` 可按既有参数构造，但不得影响 topic 输出。
  3. 三块文本不得出现字面 `taskKind`（方案 F2 的精确化结果；若实现文本第二行是「其余参数被忽略」，不得含 `taskKind`/`flowId`/`moduleId`）。
- **证据路径（计划）**：`test/桌面应用/run-pin.test.ts`（session 层行断言）；`test/桌面应用/rejection-copy.test.ts`（工具层并存参数）。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：topic 输出混入 `run：`/`taskKind ... 必填`/`可写边界：`；只检查不含 `taskKind` 字样而不检查精确 legacy 行；同时传参时拒绝或走 run 摘要。

### 3.9 AC-9 逐字段错误

- **方案标准（原文，不弱化）**：roster 与 modules 文档两侧，`name`/`purpose`/`publicContract`/`architectureSource` 各至少一个空值（未提供/`""`）与非字符串（boolean/number/array/object/null）；`publicContract: true` → 含 `publicContract`、`必须是非空字符串`、`boolean: true`；`purpose:true` 且无 `responsibility` → 含 `boolean: true`（不是「未提供」）；`purpose` 别名 `responsibility` 不误报；`purpose: ""` + `responsibility: 有效值` 按解析器语义报 `string（空）`。
- **所需证据**：
  1. roster 侧四字段矩阵：每字段至少覆盖未提供、`null`、`""`、boolean、number、array、object；断言 `ok:false`、错误码仍为 `roster-module-fields-missing`、`reason` 含字段名与收到类型。
  2. modules 文档侧同矩阵；错误码仍为 `modules-doc-fields`。
  3. `publicContract: true` → `reason` 含 `publicContract`、`必须是非空字符串`、`boolean: true`（可含「不能写 YAML 布尔 true/false」）。
  4. `purpose:true` 且无 `responsibility` → `reason` 含 `boolean: true`，不是「未提供」。
  5. `responsibility` 合法别名（`purpose` 非字符串或缺失时回退）能解析为有效 `purpose`，不误报。
  6. `purpose:""` + `responsibility: 有效值` → 按解析器语义报错，`reason` 含 `string（空）`（不回退）。
  7. 错误文案按方案 §4.1 helper 口径（支持证据）：不回声字符串内容（避免超长/敏感回显）；数组显示 `array(N)`、对象显示 `object（mapping）`、未提供显示 `未提供`、`null` 显示 `null`、数字显示 `number: <值>`。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；A1 候选源码 `src/common/编排/workflow-preconditions.ts` 的 helper/文案 diff。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：仍合并报四字段；只测 `publicContract:true`；无 `purpose`/`architectureSource` 用例；`purpose:true` 报「未提供」；`purpose:""` 回退到 `responsibility`；错误码改变；断言被放宽。

### 3.10 AC-10 topology 提示一致

- **方案标准（原文，不弱化）**：`management: {roles: [convener, implementer]}` → 消息含「写作格式」「扁平字符串数组」「management.roles」与 raw `object（mapping）`；`management: [convener]` → 消息含「缺项目角色 implementer」与「扁平」；`management: [convener, implementer, 5]` 按既有宽容读取通过（不新增拒绝）；schema v1 提示不再含「management.roles 含 convener」。
- **所需证据**：
  1. mapping 情形返回原文（`roster-topology-mismatch` 或既有错误码不变），含「写作格式」「扁平字符串数组」「management.roles」「object（mapping）」。
  2. `management: [convener]` 返回原文，含「缺项目角色 implementer」与「扁平」。
  3. `management: [convener, implementer, 5]` 解析通过（与 HEAD 行为一致，不新增拒绝）；记录该断言。
  4. topology v1（`schema: project-topology/v1`）返回的 schema 提示原文：不再含「management.roles 含 convener」，且含「扁平数组」/「roleId」等新口径。
  5. 现有宽容读取（单字符串按一元数组、数组内非字符串被过滤）保持不变；`management` 多余 id 不报错（未被新文案说成硬拒绝）。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；A1 候选源码 `workflow-preconditions.ts:328/340-341/347-349` 附近 diff。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：只改文案但 v1 提示仍含旧句；mapping 报错无 raw 类型；新增了 `management.roles` 兼容（放行语义变化）；`[convener, implementer, 5]` 被新拒绝。

### 3.11 AC-11 角色卡

- **方案标准（原文，不弱化）**：策划卡出现 `contract_check`、`topic`、`publicContract` 非空字符串、`management` 扁平数组；`view-image-cards.test.ts`（可选 `list-project.test.ts`）全过。
- **所需证据**：
  1. `governanceRoleOf("rapporteur").cardText` 原文摘录：新增两行位于产物说明之后、`名单是人事招人的唯一依据` 之前；含 `contract_check`、`topic`、`publicContract` 非空字符串、`management` 扁平数组。
  2. `test/编排/trio-worker-report.test.ts` 新增断言输出（至少 `/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/`）。
  3. `test/门禁引擎/view-image-cards.test.ts` 全过；`test/门禁引擎/list-project.test.ts` 全过（T3 回归口径要求，见 §5.3；AC-11 原文将后者标为可选，回归要求不改变 AC 判定）。
  4. 卡长实测：当前约 4246 B / 25 行，新增两行约 +366 B、约 4612 B / 27 行（以实测为准；无长度硬上限）。
  5. 活动路径只读核对：`governanceRoleOf("rapporteur")` 返回该卡（`governance-roles.ts:332`），`src/service/role/resolve-role.ts:98` 使用 `spec.cardText`；若实施发现已非活动路径，停止并回报，不得改未授权路径。
- **证据路径（计划）**：`src/common/门禁引擎/governance-roles.ts` diff；`test/编排/trio-worker-report.test.ts`；`test/门禁引擎/{view-image-cards,list-project}.test.ts`；A3 证据（`角色卡/门禁引擎/docs/change/`）；D1 回归记录。
- **候选标识**：E1 候选快照。
- **产出角色**：门禁引擎（A3）写卡；编排（A1）写卡断言（A3 后收尾）；测试（D1）回归。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：卡文本未包含四项之一；只有卡文本、无 `trio-worker-report` 断言；卡内容守卫回归失败；未核对活动路径；新增禁用字符串。

### 3.12 AC-12 无新写路径

- **方案标准（原文，不弱化）**：代码审查：topic 分支在 `contractCheckText` 第一句早退，早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；测试在无 run 的项目根可用。
- **所需证据**：
  1. `app/desktop/session.ts` 的候选 diff：`contractCheckText` 第一条可执行语句为 `if (input.topic !== undefined) return contractSchemaText(input.topic);`；该语句之前无 `getListing`、`refreshListingNow`、`writeFile`、`appendFile` 或其它 IO 调用（源码行号与 diff 原文）。
  2. session 层测试在**无 run/legacy 项目根**调用 `{topic:"modules"}`，仍返回 schema 文本；测试输出原文。
  3. 静态检查：topic 分支无写盘 API 调用；未新增 `writeFile`/`appendFile`/`mkdir`/`unlink` 等写路径。
- **证据路径（计划）**：`app/desktop/session.ts` diff；`test/桌面应用/run-pin.test.ts`。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：早退放在 `getListing`/`refreshListingNow` 之后；topic 分支仍触发磁盘读；只给测试通过无源码证据；新增任何写路径。

### 3.13 AC-13 旧调用不变

- **方案标准（原文，不弱化）**：不传 `topic` 的 `contractCheck` 输出仍含 run/角色/写区/taskKind；现有 `rejection-copy.test.ts` 的 `seenInput` 深比较不变。
- **所需证据**：
  1. 现有 `test/桌面应用/rejection-copy.test.ts:161-198` 的 `seenInput` `deepEqual` 断言（`{ flowId:"focus", roleId:"render-dev", taskKind:"dispatch", moduleId:"impl-core" }`）在当前候选上通过。
  2. 现有 `test/桌面应用/run-pin.test.ts:522-545` 的 legacy 断言（`legacy（未冻结）`、`角色：implementer`、`名下模块：impl-core`、`taskKind dispatch 必填`）在当前候选上通过。
  3. legacy 分支 diff 证明除新增首句早退外，输出组装与截断逻辑未变；legacy 截断标记仍为 `…（已截断，完整规则见 run manifest）`。
- **证据路径（计划）**：两个桌面测试文件；`app/desktop/session.ts` diff；`src/provider/runtime/tools.ts` diff。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）；测试（D1）回归。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：legacy 输出少行/文案变化；`seenInput` 深比较被修改；只给「既有测试绿」摘要无原始输出；legacy 截断标记被 topic 标记覆盖。

### 3.14 AC-14 回归与类型

- **方案标准（原文，不弱化）**：`npm run typecheck`、`npm run typecheck:renderer` 通过；§7.3 套件全过。
- **所需证据**：
  1. `npm run typecheck` 退出码 0 与原始输出。
  2. `npm run typecheck:renderer` 退出码 0 与原始输出。
  3. 方案 §7.3 六个文件的原始运行输出与计数：`test/编排/workflow-preconditions.test.ts`、`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts`、`test/编排/trio-worker-report.test.ts`、`test/门禁引擎/view-image-cards.test.ts`、`test/门禁引擎/list-project.test.ts`。
  4. **T3 全量回归**（§5.4）的原始输出与计数；本任务不改渲染层，`build:renderer`/Electron E2E 不是 AC-14 的必需项。
- **证据路径（计划）**：B0 `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md`；D1 `角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression.md` 与原始日志；E1 变更包。
- **候选标识**：E1 候选快照（D1 实际运行的就是该候选）。
- **产出角色**：测试（D1）；运行时核心提供 typecheck。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：任一 typecheck 非 0；任一 §7.3 套件失败；缺 T3 全量；新增确定性失败或新增 skip；只给「全绿」摘要无计数与原文。

### 3.15 AC-15 加载级硬拒绝

- **方案标准（原文，不弱化）**：modules 文档使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`（与 roster 示例 `modules[]` 逐项一致）+ intent/proposal/architecture + 按 `topic=roster` 文本构造的 roster → `loadLatestRoster` 为 `ok:true`；负例至少命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing`。
- **所需证据**：
  1. 正例：临时项目根包含 `PROJECT_MODULES_SCHEMA_EXAMPLE` 作为最新 modules 文档、roster 示例（或按 `topic=roster` 文本构造的 roster）、intent/proposal/architecture 文件；`loadLatestRoster` 返回 `ok:true` 的原始输出。
  2. 负例逐项：修改 roster `modules[]` → `roster-modules-drift`；引用旧版本 → `roster-reference-stale`；proposal/architecture 未引用声明版本 → `roster-reference-inconsistent`；引用文件缺失/为空 → `roster-reference-missing`；缺最新 modules 文档 → `roster-modules-doc-missing`。每项记录原始 `code` 与 `reason`。
  3. 正例的 modules 文档与 roster 示例 `modules[]` 逐项一致（见 AC-1）。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`（或 `run-pin.test.ts` 既有夹具）；D1 原始输出。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：正例用另一份 modules 夹具而非 `PROJECT_MODULES_SCHEMA_EXAMPLE`；正例因示例 `purpose` 不一致命中 drift；五个负例缺任一；只验证 parser 级不验证 loader 级。

### 3.16 AC-16 空/空白 topic

- **方案标准（原文，不弱化）**：`topic:null`、`topic:""`、`topic:"   "` → legacy 摘要（无 `topic` 透传、无 `ok:false`）；`topic:123` → `ok:false`；测试与 §3.2 表一致。
- **所需证据**：
  1. 三个空/空白调用的 `seenInput` 不含 `topic`（或等价断言）、返回 `ok:true` 且为 legacy 摘要（含 `run：`/`taskKind` 等）。
  2. `{topic:123}` 返回 `ok:false` 且含「应为字符串」。
  3. 断言与方案 §3.2 的情形表逐项对应。
- **证据路径（计划）**：`test/桌面应用/rejection-copy.test.ts`。
- **候选标识**：E1 候选快照。
- **产出角色**：桌面窗口（A2）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：空白串未 trim 就走 topic（返回 schema 或拒绝）；`topic:null` 被当作未知 topic 拒绝；`topic:123` 静默走 legacy；只测空串不测空白串。

### 3.17 AC-17 schema 版本常量单一来源

- **方案标准（原文，不弱化）**：每个 topic 的 schema 常量在完整文本中恰好出现 3 次（文档/位置行、`- schema: 字面量 …`、示例 `schema: …`），且每行等于用对应常量拼出的期望行；不残留硬编码旧字面量。
- **所需证据**：
  1. 对每个 topic，`contractSchemaText(topic).split("\n").filter((line) => line.includes(PROJECT_*_SCHEMA))` 的输出数组原文。
  2. 断言数组 `deepEqual` 用常量拼出的 3 行期望行：modules（文档行、`- schema: 字面量 …`、示例 `schema: …`）；roster（文档行、schema 行、示例）；topology（位置行、schema 行、示例）。
  3. 源码摘录证明文本构造使用 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 插值；无旧版本硬编码。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；`src/common/编排/workflow-preconditions.ts` 文本常量 diff。
- **候选标识**：E1 候选快照。
- **产出角色**：编排（A1）。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence`。
- **典型 fail/insufficient**：只断言 `includes`；某 topic 出现 2 行或 4 行；期望行未用常量拼出；残留硬编码 `project-modules/v2` 等旧字面量但不影响 includes。

### 3.18 AC-18 占位 omissionReason 不可照抄

- **方案标准（原文，不弱化）**：schema 文本含「占位 omissionReason 必须替换，不得原样提交」警告；验收检查真实项目文档不含该占位符（运行时只校验非空，本方案不加校验）。
- **所需证据**：
  1. `contractSchemaText("roster")` 原文含「占位 omissionReason 必须替换，不得原样提交」（以及示例只保证解析器通过、默认项目不要照抄省略块两条警告）。
  2. 验收对真实运行项目（若可只读访问，如 `ans-work/科研/layer0`）的名单文档只读检查：不含占位符 `<小项目省略理由；默认项目不要照抄>`；记录检查路径、文件哈希、结果。**不修改任何运行项目文档。**
  3. 若运行项目不在本 worktree 的授权读取范围：该子项记 `not applicable`（依据：验收只读范围不含运行项目；不改运行项目）或 `insufficient evidence`（不可复核原因）；**第 1 项仍必须 `pass`**，不得因无法抽查真实项目而豁免文本警告要求。
- **证据路径（计划）**：`test/编排/workflow-preconditions.test.ts`；E2 只读检查记录（写入 E2 报告的限制/证据部分，不写运行项目）。
- **候选标识**：E1 候选快照（文本断言）；运行项目抽查记录其路径与时间。
- **产出角色**：编排（A1）文本断言；独立验收（E2）只读抽查。
- **结果**：未实施/未判定。
- **判断**：`pass` / `fail` / `insufficient evidence` / `not applicable`（仅第 2 子项，须写依据）。
- **典型 fail/insufficient**：文本缺第三条警告；运行时新增了 omissionReason 占位校验（超出方案）；声称检查真实项目但无路径/哈希/结果；把不可访问写成通过。

---

## 四、重点核对项（K1–K8）

> 以下核对项把任务要求的重点风险拆成可核对项；它们**引用并支持** AC 原文，不新增或放宽 AC。K 项的失败按对应 AC 判 `fail`/`insufficient evidence`，不另设产品要求。

| ID | 核对项 | 要求与判定观察点 | 关联 AC |
| --- | --- | --- | --- |
| K1 | `contract_check` topic 契约 | topic 仅 `modules`/`roster`/`topology`；topic 模式零磁盘读、不混 run 摘要；未知/非字符串拒绝；空/空白/`null` 走 legacy；角色隔离优先；legacy 逐字不变；三块文本 ≤4 KiB，roster ≤3900 B | AC-3/4/5/6/7/8/12/13/16 |
| K2 | 三示例与加载级 | 真实 parser `ok:true`；`modules[]` `deepEqual`；`loadLatestRoster` 正例与 drift/stale/inconsistent/missing/modules-doc-missing 五负例 | AC-1/2/15 |
| K3 | 逐字段错误矩阵 | 四字段 × 空/非字符串；`purpose`/`responsibility` raw-vs-effective；boolean 报 `boolean: true`；错误码不变 | AC-9 |
| K4 | topology `management` | 扁平数组写作格式与提示一致；mapping 显示 `object（mapping）`；缺角色提示含「扁平」；既有宽容读取不变 | AC-10 |
| K5 | 策划卡两行与断言 | `RAPPORTEUR_CARD_TEXT` 两行；`trio-worker-report.test.ts` 断言；卡内容守卫回归；活动路径核对 | AC-11 |
| K6 | schema 常量单一来源 | 每 topic 恰好 3 行且等于常量期望行；无旧字面量 | AC-17 |
| K7 | 占位 omissionReason | schema 文本第三条警告；真实项目只读抽查（可 `not applicable` 并写依据） | AC-18 |
| K8 | 不变面 | 无新写路径/权限/角色门禁/边界；parser 接受/拒绝集合不变；无新工具/依赖/文件；错误码不变 | AC-9/10/12/13 + §七 |

### 4.1 K1 `contract_check` topic 契约（逐项）

- **K1.1 topic 枚举**：`CONTRACT_SCHEMA_TOPICS` 恰为 `["modules","roster","topology"]`，`ContractSchemaTopic` 由该常量派生；工具层/schema.ts/会话层不重复字面量。证据：`src/model/runtime.ts` diff、`src/provider/runtime/{tools,schema}.ts` diff、`app/desktop/session.ts` 导入。判定：枚举不符/复制字面量 → AC-4/AC-5 相关 `fail`。
- **K1.2 topic 模式零磁盘读、不混 run 摘要**：`contractCheckText` 第一条语句早退到 `contractSchemaText`；早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；无 run 的项目根也能返回。证据：源码 diff + run-pin 测试输出。判定：任何早退前 IO → AC-12 `fail`；输出含 run 行 → AC-8 `fail`。
- **K1.3 未知 topic**：`topic:"foo"` → `ok:false`，列出可用值，数据源未调用。证据：handler 返回原文 + 调用计数。判定：AC-5。
- **K1.4 非字符串 topic**：`topic:123`（及 §3.2 的 boolean/array/object）→ `ok:false`，消息含「应为字符串」，不静默忽略。判定：AC-6。
- **K1.5 空/空白/null**：`null`/`""`/`"   "` → legacy（trim 后为空视为缺省），`seenInput` 无 topic；`topic:123` 拒绝。判定：AC-16。
- **K1.6 角色隔离**：`{topic:"roster", roleId:"other"}` → `ok:false`「只允许查询本角色」；隔离先于 topic 校验。判定：AC-7。
- **K1.7 legacy 逐字不变**：不传 topic 的 `seenInput` 深比较、run/角色/写区/taskKind 输出、legacy 截断标记均不变。判定：AC-13。
- **K1.8 字节预算**：三块文本 ≤4096 B，roster ≤3900 B；实测值记录；不得靠工具层截断掩盖超限 schema。判定：AC-3。
- **K1.9（支持证据，非单独通过条件）工具描述**：`describeTool("contract_check").parameters.properties.topic.enum` 恰为三值，`required` 不含 topic，`additionalProperties` 不变（方案 §7.1 标为可选）。缺失不作 `fail`，但实施应记录。

### 4.2 K2 三示例与加载级

- 三个示例常量由 `src/common/编排/workflow-preconditions.ts` 导出；`PROJECT_ROSTER_SCHEMA_EXAMPLE` 包含 `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE`。
- `parseProjectModules(...,"demo")` 与 `parseProjectRoster(...,"demo")` 均 `ok:true`；两者 `modules[]` `deepEqual`（含 `purpose: 核心逻辑与公开接口` 等字段一致）。
- `loadLatestRoster` 正例使用 `PROJECT_MODULES_SCHEMA_EXAMPLE` 作为 modules 文档；五负例 code 逐一命中（§3.15）。
- 判定：只做 parser 级、不做 loader 级 → AC-15 `insufficient evidence`；示例漂移 → AC-1/AC-15 `fail`。

### 4.3 K3 逐字段错误矩阵

- roster 侧与 modules 文档侧都要覆盖 `name`/`purpose`/`publicContract`/`architectureSource` × 未提供/`null`/`""`/boolean/number/array/object（至少每字段一个空值 + 一个非字符串）。
- `purpose` 有效来源：`purpose` 为字符串时用 `purpose`（含空串，不回退）；否则用 `responsibility`；错误显示优先 raw `purpose`（`purpose:true` 无 `responsibility` → `boolean: true`）。
- `publicContract: true` → `boolean: true`；字符串内容不回显；`array(N)`/`object（mapping）`/`未提供`/`null` 显示与方案 §4.1 一致。
- 错误码不变：roster `roster-module-fields-missing`、modules 文档 `modules-doc-fields`。
- 判定：合并报错/缺矩阵/别名误报/错误码变化 → AC-9 `fail` 或 `insufficient evidence`。

### 4.4 K4 topology `management`

- schema 文本与错误文案统一为「顶层 `management`，写作格式是扁平字符串数组，含 convener 与全部项目角色 id」；不得出现 `management.roles` 作为推荐写法（v1 提示不再含旧句）。
- mapping → raw `object（mapping）`；缺 convener/缺角色文案含「扁平」与「写作格式」；单字符串兼容与非字符串项过滤的既有宽容读取不变；多余 id 不报错。
- 判定：提示与校验口径不一致、兼容 `management.roles`、或改宽容读取 → AC-10 `fail`，并按 §5.8 越界处理。

### 4.5 K5 策划卡两行与断言

- `RAPPORTEUR_CARD_TEXT` 两行原文（方案 §5.1）：查询指引 + 两个硬约束（`publicContract` 非空字符串；`management` 扁平数组）；位置在产物说明之后、`名单是人事招人的唯一依据` 之前。
- `test/编排/trio-worker-report.test.ts` 断言 `contract_check`、`topic:"modules"`、`publicContract.*非空字符串`、`management.*扁平数组`；`view-image-cards.test.ts`、`list-project.test.ts` 回归全过。
- 活动路径：`governanceRoleOf("rapporteur").cardText` 返回该常量（`governance-roles.ts:332`），`resolve-role.ts:98` 使用 `spec.cardText`；若 A3/P1 发现已非活动路径，停止并回报（团队计划 §4.3）。
- 卡长实测与行数记录（约 4612 B / 27 行，以实测为准）；无硬上限，但不得删改现有禁用项或引入禁用字符串。
- 判定：卡缺项/断言缺项/活动路径未核对/回归失败 → AC-11 `fail` 或 `insufficient evidence`。

### 4.6 K6 schema 常量单一来源

- 每个 topic 的 schema 常量在完整文本中恰好出现 3 行，且每行等于常量拼出的期望行（§3.17）；文本常量用同文件 `PROJECT_*_SCHEMA` 插值。
- N9 维护契约：若未来新增合法的 schema 常量提及，必须同步更新期望行集合；本轮实现必须满足当前「恰好 3 行」。
- 判定：行数/内容不符、残留旧字面量 → AC-17 `fail`。

### 4.7 K7 占位 omissionReason

- roster schema 文本含第三条警告「占位 omissionReason 必须替换，不得原样提交」；示例使用占位 `<小项目省略理由；默认项目不要照抄>`；示例前另有两条警告（只保证解析器通过；默认项目须含 env-bootstrap 或写真实省略理由）。
- 运行时仍只校验非空（不加占位校验）；真实项目只读抽查见 §3.18。
- 判定：缺警告 → AC-18 `fail`；真实项目不可访问按 §3.18 记录 `not applicable`/`insufficient evidence`。

### 4.8 K8 不变面

- 无新写路径/写区/角色权限/角色门禁/闸门/验收/证据规则；不改 `resolveWrite`/boundary/Section 1/shell 写守卫/版本化文档只读保护。
- parser 接受/拒绝集合不变：`management` 单字符串兼容、数组内非字符串过滤、多余 id 不报错、`architectureSource` 非空即通过；错误码全部不变。
- 不新增工具/依赖/文件；不改 `src/common/shared/**`、`package.json`、`README*`、构建/发布配置、角色卡/边界/YAML/changelog（B-0）。
- 判定：任一变化 → 按 §5.8 停止并回报；AC-9/AC-10/AC-12/AC-13 相关项 `fail`。

---

## 五、T3 依据与全量回归计划

### 5.1 T3 依据

- 技能 `references/testing.md` 的唯一定义：**T3 = 发布、共享抽象（Model/公共入口/跨模块契约）、治理或权限变更，或证据基础不确定；默认验证为全量适用回归 + 发布/共享抽象检查**。
- 本变更触及：
  1. **共享 Model**：`src/model/runtime.ts` 新增 `CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic?`（加法可选字段，但仍是共享 Model/跨模块契约）。
  2. **公共工具契约**：`contract_check` 的新增可选参数、枚举校验、拒绝消息、描述与 `promptGuidelines`（`src/provider/runtime/{tools,schema}.ts`）。
  3. **治理材料**：`src/common/门禁引擎/governance-roles.ts` 的内置策划卡文本（两行）。
- 客户闸门 1 已确认「若统筹/验收按『凡触 Model/公共工具契约即 T3』管理，则按 T3 全量回归并重评」；闸门 2 确认团队计划 **T3（不压档）**。本文件按 T3 判定，不采用方案 §8.6 的 T2 建议（T2 只是方案作者建议，且其自身写入升档条件；闸门 2 已按更高口径管理，不构成方案实质变更）。
- 升档不降档；若实施出现 §5.8 情形，停止并重评，必要时高于 T3。

### 5.2 受影响层与角色

| 层/角色 | 受影响内容 | 检查 |
| --- | --- | --- |
| 运行时核心（A0a/A0b） | `src/model/runtime.ts` 枚举/类型/`topic`；`src/provider/runtime/{tools,schema}.ts` 解析/校验/透传/描述 | `npm run typecheck`；枚举单一来源；无写集外改动 |
| 编排（A1） | `src/common/编排/workflow-preconditions.ts` 文本/示例/`contractSchemaText`/逐字段错误/topology 文案；`test/编排/workflow-preconditions.test.ts`；`test/编排/trio-worker-report.test.ts`（A3 后） | 两测试文件 + `npm run typecheck`；AC-1/2/3/9/10/15/17 及卡断言 |
| 桌面窗口（A2） | `app/desktop/session.ts` 首句 topic 早退；`test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 两测试文件 + `npm run typecheck`；AC-4/5/6/7/8/12/13/16 |
| 门禁引擎（A3） | `src/common/门禁引擎/governance-roles.ts` 两行；卡活动路径只读核对 | 卡文本/字节/行数；`view-image-cards.test.ts`、`list-project.test.ts` 只读回归；`npm run typecheck` |
| 项目管理（P1 审核） | 只读审核实现提案；无 i18n | P1 审核记录 `recommend approval` |
| 测试（B0/D1） | 基线、受影响套件、T3 全量回归、双端 typecheck、证据 | B0/D1 记录与原始日志 |
| 内置独立验收（V1/E2） | 本文件、E2 报告 | 按本文件判定；唯一 B2 |

跨角色回归必须覆盖：topic 透传/拒绝/legacy/隔离/并存参数/字节预算、parser 示例锁与加载级正负例、逐字段错误矩阵、topology 文案、策划卡断言、legacy 输出不变、T3 全量、双端 typecheck。

### 5.3 受影响套件命令（团队计划 §7.1；worktree 根执行）

| 层 | 命令 | 证据 |
| --- | --- | --- |
| 运行时核心 | `npm run typecheck` | 退出码 0；原始输出；枚举单一来源；无写集外改动 |
| 编排 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/trio-worker-report.test.ts`；`npm run typecheck` | parser 锁、`modules[]` deepEqual、字节守卫、错误矩阵、topology 文案、schema 常量 3 行、加载级正/负例、卡断言；原始计数 |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts`；`npm run typecheck` | topic 透传/未知/非字符串/null/空/空白/隔离/并存参数/≤4 KiB；session 早退/无 legacy 行；legacy `seenInput` 不变；原始计数 |
| 门禁引擎 | `node --test --test-concurrency=1 test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts`；`npm run typecheck` | 卡内容守卫/内置卡非空；原始计数 |
| 测试（D1） | 上述受影响套件 + T3 全量回归（§5.4）+ `npm run typecheck` + `npm run typecheck:renderer` | 计数/失败分类/候选哈希/写集 diff/status；新增确定性失败 0、新增 skip 0 |

命令若因仓库实际脚本/runner 不同而调整，须在 E1 变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。一个测试套件作为一条命令整体运行，不拆段拼「全量通过」。

### 5.4 T3 全量回归口径

- 命令（worktree 根执行；Bash）：

```bash
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')
```

- **排除项**：`test/pi-adapter/write-sequencing.test.ts` 为仓库既有已知挂起测试（历史记录长时间无进展）；依据团队计划 §7.2 与既有验收记录（`docs/acceptance/acceptance-rework-routing-criteria-v1.md` 的 T3 口径/既有验收记录）。排除时必须记录：实际命令、完整文件清单、排除文件、原因与依据；**不得静默跳过，不得把排除当通过**。
- **文件范围基线**：V1 写标准时只读统计为 **394** 个 `test/**/*.test.ts`，其中 `write-sequencing.test.ts` 1 个，命令纳入 **393** 个；D1 须记录实际执行的文件清单与计数（测试文件在实施中若有新增/删除，须能解释且不得越界）。
- **既有环境失败**：Windows symlink `EPERM` 等由 B0 记录并分类；D1 与 B0 逐项对照，**新增确定性失败必须为 0，新增 skip 必须为 0**；既有失败不算通过，也不算本次新增失败。
- 记录：命令原文、工作目录、环境（Node/npm、OS/Shell、时区）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；失败按「既有/新增」「确定性/环境」分类。
- 全量回归必须针对**当前候选**执行；候选变化（代码/测试/夹具/配置）使结果失效，需重跑受影响部分或全量。

### 5.5 双端 typecheck

- `npm run typecheck` 必须通过并记录退出码 0 与原始输出。
- `npm run typecheck:renderer` 必须通过并记录退出码 0 与原始输出（模板/渲染配置未改也必须跑；团队计划 §1.2 的 T3 口径）。
- 本任务不改渲染层，**不要求** `npm run build:renderer`；若运行，只作补充证据并记录，不作为 AC-14 通过条件。

### 5.6 Electron E2E 与截图规则

- 本变更不涉及渲染层、窗口、IPC、preload、UI 样式或交互；**不要求真实 Electron E2E**，不要求截图/录屏。
- 若验收认为 Node 证据不足并只读运行既有 E2E：记录命令、环境、原始输出/`report.json`、候选哈希、窗口尺寸；不可运行或未运行时如实记录，不判失败、不写成通过。
- 截图规则：最多使用截图，不要求录屏；截图必须来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 SHA-256、候选版本、拍摄命令/窗口尺寸；不得以录屏作为验收要求或选项；缺少录屏不构成 `fail`/`insufficient evidence`。

### 5.7 原始输出、哈希与证据路径

- 每次检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。
- 候选身份：每个改动/新增文件 `git hash-object` + `sha256sum`（工作区；CRLF/LF 差异分别记录）；HEAD；`git status --porcelain -uall | sort` 快照 SHA-256。
- 改动范围：`git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对团队计划 §4.1/§4.3 写集与 B-0；写集外改动记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言；测试删除/迁移逐条列明。
- 证据路径（计划）：
  - B0：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` + 原始日志；
  - D1：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression.md` + 原始日志；
  - 各实施角色：`角色卡/运行时核心/docs/change/`、`角色卡/编排/docs/change/`、`角色卡/桌面窗口/docs/change/`、`角色卡/门禁引擎/docs/change/`（P1 提案与 A0–A3 证据）；
  - 项目管理 P1 审核：`角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`；
  - E1 变更包：`docs/scheduling/contract-schema-query-change-v1.md`；
  - E2 报告：`docs/acceptance/contract-schema-query-report-v1.md`。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/`；要求或提供录屏。

### 5.8 升档与停止条件

- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §8.6/§11 与团队计划 §5.2/§6.4 处理（重开闸门 1/2、升档）：
  - 改 parser 接受/拒绝集合（包括但不限于接受 `management.roles`、把 `publicContract: true` 当字符串、改 `architectureSource` 为强制路径、改 `management` 宽容读取）；
  - 新增角色门禁（仅策划可查）、新增工具、新增依赖、新增文件（含新测试文件、`app/desktop/interface.ts`、`src/common/shared/**`、`package.json`、README、角色卡/边界/YAML）；
  - 改角色权限/写区/boundary/Section 1/shell 写守卫/版本化文档只读保护/闸门/验收/证据规则；
  - 改运行项目文档或自动修复名单；
  - 写集/边界/档位/阶段变化，或需要新增未列角色；
  - 证据不足以建立跨模块/全量结论（候选不可复算、T3 全量缺失/失败未分类、双端 typecheck 缺失）。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理（递增版本、记录理由、交沟通/统筹确认）。
- 证据不足时按 `references/testing.md` 升到更高档补证，最高至全量回归；不得以时间紧降档。

---

## 六、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 无 run/legacy 项目根查询 `{topic:"modules"}` | 返回 modules schema 文本；不读 listing/manifest；无 run 摘要 | 混入 run/写区或报错 → AC-8/AC-12 fail |
| `{topic:"roster"}` 正常查询 | 返回 roster 字段表 + 示例；≤4096 B（且 ≤3900 B）；首行 `topic=roster` | 超限/缺示例 → AC-3 fail |
| `{topic:"foo"}` | `ok:false`；消息列出三值；数据源未调用 | 返回 schema/legacy → AC-5 fail |
| `{topic:123}` | `ok:false`；含「应为字符串」 | 静默 legacy → AC-6 fail |
| `{topic:null}` / `{topic:""}` / `{topic:"   "}` | legacy 摘要；`seenInput` 无 topic；`ok:true` | 返回 schema 或拒绝 → AC-16 fail |
| `{topic:"roster", roleId:"other"}` | `ok:false`；「只允许查询本角色」 | 返回 schema → AC-7 fail |
| `{topic:"roster", flowId:"focus", taskKind:"dispatch"}` | topic 优先；输出仅 schema；无 `run：`/`taskKind...必填`/`可写边界：` | 走 run 摘要或拒绝 → AC-8 fail |
| 三块 schema 文本 | 每块 ≤4096 B；roster ≤3900 B；完整字段表 + 示例 | 超限/截断 → AC-3 fail |
| `publicContract: true` | `roster-module-fields-missing`（或 `modules-doc-fields`）；`reason` 含 `publicContract`、`必须是非空字符串`、`boolean: true` | 仍合并报四字段/不回显类型 → AC-9 fail |
| `purpose: true` 且无 `responsibility` | `reason` 含 `boolean: true`，不是「未提供」 | 报「未提供」→ AC-9 fail |
| `purpose: ""` + `responsibility: 有效值` | 按解析器语义报 `string（空）`（不回退） | 回退通过 → AC-9 fail |
| `responsibility` 别名合法 | 解析通过，不误报 | 误报 → AC-9 fail |
| `management: {roles: [convener, implementer]}` | 报错含「写作格式」「扁平字符串数组」「management.roles」「object（mapping）」 | 旧文案/无 raw 类型 → AC-10 fail |
| `management: [convener]` | 报缺项目角色 implementer，含「扁平」 | 旧文案 → AC-10 fail |
| `management: [convener, implementer, 5]` | 按既有宽容读取通过（不新增拒绝） | 新增拒绝 → AC-10 fail / §5.8 停止 |
| topology v1 | 提示含「扁平数组」/「roleId」，不再含「management.roles 含 convener」 | 旧句残留 → AC-10 fail |
| 策划卡 | 含 `contract_check`、`topic`、`publicContract` 非空字符串、`management` 扁平数组；守卫回归全过 | 缺项/守卫失败 → AC-11 fail |
| schema 常量行 | 每 topic 恰好 3 行且等于常量期望行 | 2/4 行或旧字面量 → AC-17 fail |
| 真实项目文档抽查 | 不含占位 `<小项目省略理由；默认项目不要照抄>`；不改运行项目 | 含占位符 → AC-18 fail；不可访问 → not applicable/insufficient 并写依据 |
| 旧调用（无 topic） | 仍含 run/角色/写区/taskKind；`seenInput` 深比较不变 | 输出变化 → AC-13 fail |
| T3 全量回归 | 命令/清单/排除理由齐全；新增确定性失败 0、新增 skip 0 | 新增失败/skip → AC-14 fail / 返工 |

---

## 七、与团队计划、写集与授权边界

- **产品/测试写集（闸门 2 确认，团队计划 §4.1/§4.3）**：仅以下文件可写：
  - `src/model/runtime.ts`（A0a：枚举/类型/`topic`）；
  - `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`（A0b：解析/校验/透传/描述）；
  - `src/common/编排/workflow-preconditions.ts`（A1：文本/示例/`contractSchemaText`/逐字段错误/topology 文案）；
  - `app/desktop/session.ts`（A2：首句 topic 早退）；
  - `src/common/门禁引擎/governance-roles.ts`（A3：策划卡两行）；
  - `test/编排/workflow-preconditions.test.ts`（A1：示例/矩阵/加载级/常量行）；
  - `test/编排/trio-worker-report.test.ts`（A1：卡断言；A3 后收尾；方案 §10.2 与团队计划 §4.1 已纳入，任务摘要未列，按闸门 2 确认的团队计划执行）；
  - `test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts`（A2：工具层/会话层）。
- **只读回归（不写入）**：`test/门禁引擎/view-image-cards.test.ts`、`test/门禁引擎/list-project.test.ts`。
- **不写**：`test/测试/` 默认不新增；`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/common/shared/**`、`package.json`、`package-lock.json`、`README*`、`tsconfig`、构建/发布配置、角色卡/边界/YAML/changelog、`docs/planning|scheduling|communication|acceptance`（除本验收写权）、运行项目文档。
- **无新增文件/依赖/工具**；不新增 `proposal`/`architecture` topic；不改 parser 接受/拒绝集合；不改角色权限/闸门/验收/证据规则。无边界变更（B-0），H1 不适用；若实施发现未列路径，**停止并回报统筹**，需要时重开闸门 2/闸门 1。
- **契约归属与串行**（团队计划 §5）：`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts` 由运行时核心唯一写入；`workflow-preconditions.ts` 与 `test/编排/*` 由编排唯一写入；`app/desktop/session.ts` 与 `test/桌面应用/{rejection-copy,run-pin}.test.ts` 由桌面窗口唯一写入；`governance-roles.ts` 由门禁引擎唯一写入；`test/门禁引擎/*` 只读。A0a 冻结前不写依赖类型；A1 文本冻结前 A2 不引用 `contractSchemaText`；A3 卡文本落地前 A1 不写新卡断言。
- 本文件是验收标准，不是团队计划、不是实施授权、不是客户闸门；团队计划的范围/角色/写集/阶段以沟通闸门 2 确认版本为准。

---

## 八、版本冻结与报告安排

- **冻结**：本文件写盘即 v1 冻结；E2 必须按本文件判定，不得在实施后为通过而修改标准、放宽断言或改变判定口径。
- **变更**：若方案/契约发生实质变化（§1.2 所列），说明失效范围（哪些 AC/T3 证据失效）并重开 V1；标准变更递增版本、记录理由、交沟通/统筹确认；候选变化只使证据失效，不改变标准。
- **E2 报告**：`docs/acceptance/contract-schema-query-report-v1.md`，由同一内置独立验收主上下文撰写。报告至少包含：
  1. 任务/阶段、客户确认的方案版本（P1.3 911 行 / `4d61d376…`）、标准版本（本文件 v1；哈希由沟通/E1 外部记录）、候选标识（E1 变更包候选快照）；
  2. 逐项验收表（AC-1–AC-18、K1–K8）：方案标准、所需证据、实际证据路径/哈希、候选版本、产出角色、结果、判断；
  3. T3 档位核对（与改动相符）、受影响套件与 T3 全量回归计数、失败分类、双端 typecheck 退出码、Electron E2E 未运行/运行记录；
  4. 证据复用/失效记录；若使用并行取证，按 `references/acceptance-parallel-evidence.md` 记录取证方式、分配摘要、候选核对、主复核、冲突与限制（E1–E4 是同一验收角色的上下文编号，不是角色、不是第二结论）；
  5. 未解决问题与限制；总体结论只能为 **通过 / 返工 / 证据不足**。
- **唯一判断**：E2 由同一主上下文判定；子上下文只取证、不判断、不写报告；沟通原样转交，不形成结论；统筹只按匹配当前候选的通过结论放行（E3）。
- **授权边界**：验收通过只表示当前候选满足 V1，**不授权提交、推送、合并、发布**；不授权接触客户或绕过客户闸门；不授权修改实施方代码/测试/断言。
- **哈希外部记录**：本文件最终行数与 SHA-256 由沟通/E1 在外部（沟通记录/变更包）记录，本文件不自引用；E2 报告引用该外部记录。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

### 9.1 设计缺口（阻断）

**无。** 方案 §7.2 的 AC-1–AC-18 可执行、可核对；每条均有明确的测试落点或代码审查/只读检查；P1.3 已关闭复核 F1–F16/N1–N7，N9 为非阻断维护说明；本文件未发现需要重开闸门 1 的设计矛盾。唯一需要实施/验收持续注意的读范围限制是 AC-18 的真实项目只读抽查（§3.18），已按团队计划 §9.2 开放点处理。

### 9.2 基线/快照说明（非缺口）

1. **意图快照**：方案头引用闸门 0 快照 64 行 / `2c11b726…`；团队计划头引用 91 行 / `7e078ad3…`（写团队计划时，尚未追加闸门 2 记录）；当前文件 117 行 / `8b663dbb…`（含闸门 2 材料与确认记录）。三者是同一沟通记录的**顺序快照**，不是三份不同基线；V1/E2 以当前文件的确认小节为准（§1.1），不引用固定行号。
2. **历史状态行**：方案 P1.3 文件头仍写「待闸门 1 客户确认」，团队计划文件头/§2/§八仍写「闸门 2 未确认、实施授权未给」——均为对应确认前的快照，不作为当前判定依据；当前以沟通记录闸门 1/2 确认小节、实施授权记录与冻结哈希为准。
3. **T2/T3 口径**：方案 §8.6 建议 T2（并附升档条件）；团队计划 §1.2 按客户闸门 1 的条件管理为 **T3**，闸门 2 已确认。V1 按 T3 判定；这不改变方案 AC/范围，只提高验证口径。若客户在后续明确改回 T2，须由客户明确指示并理解证据口径（团队计划 §8.4），V1 相应重开；在此之前不降档。
4. **AC-17 的 N9 维护契约**：复核 N9 指出「每 topic 恰好 3 行」是严格断言，未来新增合法 schema 行会使测试失败，需同步更新期望行集合。P1.3 将其记录为非阻断建议、不改 AC；V1 保留 AC-17 原文，E2 按当前「恰好 3 行」判定。实施若新增合法 schema 行，必须同步更新期望集合并记录理由，不得删除/放宽断言。
5. **`trio-worker-report.test.ts` 归属**：方案 §10.2 列出该文件，任务写集摘要未列；团队计划 §4.1/§9.3 按 `test/编排/` 目录授权纳入 A1（AC-11 需要），闸门 2 已确认。V1 按闸门 2 确认版本执行，不视为写集扩大。
6. **`RAPPORTEUR_CARD_TEXT` 活动路径**：基线 HEAD 只读核对：`governanceRoleOf("rapporteur")`（`governance-roles.ts:470`）注册表在 `:332` 返回 `RAPPORTEUR_CARD_TEXT`；`src/service/role/resolve-role.ts:98` 使用 `spec.cardText`。该常量虽带 `@deprecated` 注释（`:177`），当前仍是活动路径。A3/P1 必须再次只读核对；若实施时已非活动路径，停止并回报统筹/策划，不得改未授权路径或擅自迁移卡文本。
7. **测试文件计数基线**：V1 只读统计 394 个 `test/**/*.test.ts`，排除 1 个 `write-sequencing.test.ts` 后命令纳入 393 个；这是写标准时的基线，D1 须按当前候选记录实际清单与计数，不得用本数字替代原始输出。
8. **方案锚点**：方案与团队计划的行号基于 HEAD `243d8f6`；V1 写标准时 HEAD 未变，所有引用锚点（§1.4）逐项只读核对成立。实施前若 HEAD 前进，按方案 §11.4 以符号名/文本锚点重新核对并记录新基线。
9. **实施授权追加与 B0 并行**：沟通记录在 V1 写盘期间追加了「实施授权记录」（lines 119–125），客户原话「授权实施：按团队计划与 P1.3 开始 V1 后的 B0/P1 与各阶段；不含提交/推送/发布。」；该授权只覆盖实施，不含提交/推送/合并/发布。测试角色的 B0 记录在读取时点尚未定稿（占位符未替换），V1 不以未定稿 B0 作为证据；V1 的标准、AC、T3 口径不因该追加而变化。

### 9.3 复核建议与客户确认的区分

- 复核记录（282 行 / `55a2d268…`）的「建议提交客户确认」是复核建议，不是客户确认；闸门 1 的客户确认记录才是方案 P1.3 的确认依据；闸门 2 的客户确认记录才是团队计划/角色/写集/T3/阶段的确认依据。
- 本文件没有把复核建议、方案自检、团队计划推定或工具成功当作客户确认；V1 的 AC 只来自客户闸门 1 确认的方案 §7.2 与闸门 2 确认的验证口径。

### 9.4 本文件未做的事

- 未实施任何代码/测试修改；未运行实施测试、未跑新增测试、未 typecheck、未启动应用/Electron；只做只读文件核对、哈希计算与 `find` 统计。
- 未修改方案、复核、团队计划、沟通记录、角色卡、边界、产品源码、测试或运行项目；未 commit/push。
- 未创建验收报告、未给出任何 pass/fail 结论；E2 待实施与 D1/E1 后进行。

---

**标准结束。** 本文件 v1 由内置独立验收在实施前写盘并冻结；E2 由同一主上下文按本文件判定，另写 `docs/acceptance/contract-schema-query-report-v1.md`。本文件不授权提交、推送、合并或发布。
