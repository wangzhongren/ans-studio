# 派发护栏只保留「谁能给谁派发」方案 P1.0 复核记录

- 复核对象：`docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`（版本 P1.0，日期 2026-11-02；823 行；SHA-256 `d2f90b25749717a0061611417e27608124d87c85258a19ad79d8d914ef2afefb`；本记录按该快照只读核对）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：T3 风险档位；跨角色/共享业务契约；涉及治理、权限与派发边界；Q1–Q5 与 O1–O6 多个选装、范围仍有待客户决定，不满足轻量条件）
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、代码、测试与既有设计/验收文档；只写本复核记录）
- 闸门 0 记录：`docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`（67 行；SHA-256 `212e987fa183e739e8bcd813e14f40d376fbc86702e792e82a7735901775bb54`；客户原话「规矩护栏，应该只管控谁能给谁派发任务，而不能管任务状态是否满足」；范围＝产品派发前置）
- 复核日期：2026-11-02
- 代码基线：worktree `flow-improvements-wave1`，HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（与方案标注一致；工作树除沟通文档、方案与本复核记录外无代码改动）
- 说明：复核只作建议，不是批准、通过、验收、客户闸门或实施授权，也不替代闸门 1/2。作者处置权与不采纳权按复核规则 §9。

## 独立核对过的关键事实（只读）

- 方案与闸门 0 的行数、SHA-256 与任务输入一致；被修订基线 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 为 1330 行、SHA-256 `4a13e99b0b0dbb4aeb9141ed4a15fdddd4ec5021b88146589bdf1f4f8030e6b6`，均与方案标注一致；旧设计 P1–P11/G1–G6、M1–M13 条目存在。
- `src/common/编排/workflow-preconditions.ts:1187-1372` 的 `evaluateDispatchPreflight` 与方案 §3.1 逐行核对一致：自派 `:1189`、`chief-to-project-forbidden` `:1193-1196`、幕僚链 `:1200-1248`、幕僚→运营 `:1251-1277`（run-missing `:1255-1257`、d3-missing `:1258-1263`、D3 缺卡 `target-card-missing` `:1264-1276`）、`convener-target-forbidden` `:1285-1288`、legacy `:1290-1295`、handoff `:1296-1301`、run pin/roles `:1302-1310`、flow `:1311-1313`、模块检查 `:1318-1367`、`unknown-source` `:1371`。
- `app/desktop/session.ts` 链路口径与方案 §2/§5.3.3 基本一致：`routeDispatch:5770`、来源校验 `:5786-5803`、`routeStarDispatch:6067`、幂等抑制 `:6110-6125`、刷新枚举与目标信息 `:6130-6137`、`chainDispatchFacts:6138`、run 读取/ensureDraftRun/verify/loadPinnedRoster `:6150-6178`、preflight `:6180`、run-change 派发触发 `:6206-6222`、版本基线 `:6225-6242`、handoff pin `:6244-6276`、`task.created:6293-6312`、账本写入 `:6313-6318`、`planDispatchDelivery:6331-6349`、投递/收口 `:6354-6401`。
- 现状 `ensureDraftRun` 仅覆盖 handoff / product / rapporteur / nominator（`session.ts:6158`）；`findActiveRun` 多 pinned 返回 `run-pin-active-conflict`；`ensureDraftRun` 失败可由调用方降级。方案「扩到所有目标」的动机属实；但方案 §5.3.3 把失败点写成「task.created 的 run-required」只对幕僚→内置目标成立，运营缺交付派发当前先在 preflight 以 `run-missing` 拒绝（`:1302-1304`）。
- `task-state.ts:234-237` 的 `run-required`、`:345` 的 flowId 校验、`:383-394` 的 moduleDirectory 目录校验、`:443-444` 的旧记录 runState=legacy 读侧归一化、`:589-592` 的任务卡 legacy 合成均属实。由此方案「run 不可用时省略 flowId/runId/runState」是必要且正确的兼容选择。
- `governance-roles.ts:494-496` 的 `isBuiltInGovernanceRoleId` 含 `su`；`:144` 幕僚卡确有「应用会机械拒绝」；`:223` 运营卡确有「接交付前置（机械）」；`:407` 注释引用旧函数名（方案列为注释同步，属实）。
- `src/service/role/resolve-role.ts:215-216` 为 role-card/boundary 文件名；`:345-353`、`:358-370` 的枚举要求 role-card 与 boundary 存在且可解析（方案写作 `:347-362`，为轻微行号漂移；boundary 文件名实际还接受 `boundary.yml`，方案 §1.2 只写了 `.yaml`/`.md`）。
- `mechanical-rejection.ts:57` 的 `target-card-missing` owner=nominator 属实；`:117` 存在 `M5_TARGET_CARD_MISSING` 旧别名。`diagnostics.ts:11-20` 白名单含 `reasonCode`/`sourceRoleId`/`targetRoleId`/`phase`/`mode`/`count`。
- `runChangeRejectionForDispatch`（`session.ts:2050-2077`）与 `dispatchFrozenConflictDetail`（`:2080-2123`）只在派发 preflight 失败点 `:6209` 使用；`proposalCardFrozenRejection`（`:2131` 起）与显式入口保留；`run-change-entry.test.ts:212` 是唯一要求源码含 `runChangeRejectionForDispatch` 的钉。`docs/communication/memo.md:116` 记录客户已取消 run-change-auto-approve 并恢复到 `HEAD c80f494`，方案「不恢复」的表述与事实一致。
- `planDispatchDelivery` 的实现与文案（`handback.ts:353-378`）属实；单路径在任务创建前拒绝（`session.ts:5857-5861`），星形路径在 `task.created` 后拒绝并 `task.closed(rejected)`（`:6331-6349`）。G-1 测试对文案做逐字断言：`test/测试/g1-verify/g1-dispatch-wiring.test.ts:132`、`g1-extraction-render.test.ts:168/182`、`test/编排/dispatch-reads.test.ts:206`。
- 方案 §7.3 引用的测试文件与行号抽样核对均匹配：`workflow-preconditions.test.ts:495/562/580/836/856`；`chain-enforcement.test.ts:305/355/561/621/663/700`；`rejection-copy.test.ts:42/111`；`run-change-trigger.test.ts:242`（三模式 for 循环）/`328/380/417/444`；`run-pin.test.ts:176/308/531/552`；`star-routing.test.ts:110/132/155/173`；`run-change-entry.test.ts:195-218`；`dispatch-fresh-enum.test.ts:86`；`optional-acceptance.test.ts:111`。
- 「目标真实存在」枚举口径（role-card + boundary 可解析）与 `resolve-role` 一致；`targetBuiltIn` 现有计算 `session.ts:6132-6133` 与方案引用一致；`targetCardFound` 的 `session.ts:6201-6204` 引用一致。
- 方案 §7.4 对旧 P1/P2/P4/P11 的处置与旧设计正文基本对应；但旧 P8（旧设计 `:951`）明确包含「convener dispatchTask（实现阶段，目标限 D3 选中 worker + verifier）」，新矩阵改为「任意真实存在的项目 worker」，P8 不是「不变」；旧 P3/P5（`:947-948`）也未在 §7.4 被列出。
- 现状模块元数据写入 `session.ts:6298` 对任何能解析出的模块都写 `moduleId/moduleDirectory/modulePaths`；preflight 对 verifier 允许引用任一已绑定模块（`workflow-preconditions.ts:1318-1324`），不要求属主；旧设计 M7/P5 要求验收任务/证据逐模块携带 moduleId/modulePaths。方案 §5.3.3 新增「目标确实是该模块属主才写模块字段」与上述口径存在冲突。verifier 通常不在名单 `roles[]` 中，`evidenceScopeRoots` 的 roster 侧不会贡献根；任务 `modulePaths` 可能是其唯一证据根，而空 `scopeRoots` 会让 `isWithinEvidenceRoots`（`evidence-check.ts:148-154`）对任何物证返回 false。
- `evidenceScopeRoots`（`session.ts:7062-7093`，尤其 `:7086`）按 `created.flowId === flowId` 过滤任务并把 `created.modulePaths` 纳入证据范围；省略 flow 锚点会使这类任务不参与该范围。方案 §5.5 只概括说下游按实际记录读取，未列此消费者。
- `taskIdempotencyKey`（`task-state.ts:154-172`）默认键含 `moduleDirectory`；但 `routeStarDispatch` 的调用（`session.ts:6099-6105`）只传 `moduleId`，从不传 `moduleDirectory`。方案 §6 的幂等描述与派发路径事实不一致。`DispatchReceipt.message` 在 `src/model/runtime.ts:1001-1004` 为可选，方案 §6 写作必填形式。
- `redispatch_task` 仅注入幕僚（`run-role.ts:1280`）；`redispatchTask`（`session.ts:4476` 起）在 `attempts>=1` 时由 `chooseRedispatchTarget`（`:4324-4330`）改派到「首个非内置、非当前、非幕僚的项目角色」，并以 `created.from` 复制来源、新建 `task.created` 后投递（`:4582-4599`）。这是独立于 `routeDispatch` 的既有派发/投递路径，方案仅在 §1.5 列为范围外，未分析其与新授权矩阵的关系。
- `src/provider/runtime/schema.ts:519` 的工具描述仍写「Implementation tasks dispatched by the convener MUST carry it; the target role must own the module」；方案 O5 只覆盖内置角色卡文本，未覆盖该工具描述。
- `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 已把 `test/pi-adapter/write-sequencing.test.ts` 记为已知挂起并允许在 T3 全量回归中排除但须记录；方案 §8.1 命令直接排除该文件，未在正文引用该既有结论。
- 仓库中未发现其他名为 `dispatch-acceptance` 的契约文档或 v1 记录（`grep` 仅命中本方案）；方案 §6 的 v1→v2 版本谱系目前只是对旧设计 M1–M8/P1 的转述。
- 方案对 `su`/未知内置的收紧、`chiefRoleId === null` 的运营来源修复、删除派发触发 run-change 三项均已在方案中披露，且与闸门 0 的 Q1/Q5 和「至少保留的角色授权」可对应；未发现与闸门 0 意图明显不一致的关键信息缺失。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 核心 = 硬授权 + advisory 两层，逐项可追溯到闸门 0；run 记账、pinned 覆盖判断、run-change 删除均有必要性说明；未为「以后可能」新增抽象。F11 只是输入类型/改名的小型简化空间，不影响最小性。 |
| OD-2 必做与选装 | 通过 | O1–O6 全部在 §10 分节，有编号、理由、收益、代价、默认不实施与待确认状态，§11 有确认表；没有把选装写成必做。O5 作为后续独立事项的处理与闸门 0「角色卡/边界不在本次范围」一致。 |
| OD-3 复用 | 通过 | 复用 `chainDispatchFacts`、roster/modules 解析、`run-manifest`、`versioned-doc-guard`、`createDiagnosticLogger`、`MechanicalRejection`；不新建第二套名单/run 规格。仅 §6 契约版本谱系（F12）与 advisory 输入类型（F11）有轻微表述/重复问题。 |
| OD-4 非目标 | 通过 | §1.5 非目标与闸门 0 的 Out of scope 对应；`su` 收紧与 run-change 触发删除均有闸门 0 依据（Q1、意图第 5 条）；`planDispatchDelivery` 保留并明确请闸门 1 确认；未发现把范围外内容写成必做。 |
| OD-5 被否决的备选 | 通过 | Q1–Q5 的 B/C 与 §7.5 的迁移开关是真实比较，均有具体代价与推荐理由；未发现为凑对比编造的备选。 |
| MK-1 目标 | 通过 | 目标可追溯到闸门 0 客户原话；[现状]/[设计候选]/[待客户决定] 标记清楚；引用的源码/测试行号抽样核对基本属实（轻微漂移见「独立核对过的关键事实」）。 |
| MK-2 完整流程与失败分支 | 发现 | 成功流程、硬拒绝、投递失败、账本失败、下游拒绝均覆盖；但 handoff 的 `session.ts:6245-6247` 硬失败未处置（F1），redispatch 路径未分析（F4），省略 flow 锚点的下游消费者未列全（F5）。 |
| MK-3 输入输出 | 通过 | 派发载荷字段、回执、任务卡/系统行、诊断记录与 advisory 人话均有说明；边界情形覆盖较全。建议实施时明确 advisory 文案的中英双语一致性（方案已留条件），非阻断。 |
| MK-4 契约 | 发现 | §6 的契约主体完整（角色、输入输出、保证、版本、失效影响）；但幂等键公式与派发路径不一致（F6），v1→v2 谱系缺少可核对记录（F12）。 |
| MK-5 完成标准 | 发现 | AC-1–AC-8 大体可核对且覆盖正负例与 advisory；但 AC-3.3 与 handoff 分支冲突（F1），AC-5.3 与 verifier 模块元数据冲突（F2），旧 P8/P3/P5 的替代关系未写清（F3），G-1 文案与全量回归排除说明有缺口（F7/F8），chief→未知非内置目标的断言缺失（F10）。 |
| MK-6 风险与未决事项 | 发现 | 风险表覆盖了浪费时间、目标枚举、run 记账、测试迁移、Windows 基线等；缺少 redispatch 路径（F4）与 flow 锚点下游消费者（F5）的风险/披露；Q1–Q5 与 O1–O6 的待确认状态清楚。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | **重要** | §3.1 第 15/29 行、§5.3.3 `:6244-6276`、§8.2 AC-3.3 | handoff 分支在 `session.ts:6245-6247` 仍有 `runManifest === undefined \|\| dispatchFlowId === undefined ⇒ fail("交付运营缺少 runId")` 的硬拒绝。该分支在「幕僚→运营未带 flowId/无法推断」以及「run 读取或 ensureDraftRun 失败」时可达，直接违反「flow/run 不阻断」的闸门 0 意图与 AC-3.3（ledger 不可用仍应受理、任务不带 run/flow 锚点）。方案的逐项清单只列了 pin 失败/校验失败，没有处置这条早退。 | `app/desktop/session.ts:6244-6247`；`workflow-preconditions.ts:1302-1304`；方案 AC-3.3 | 在 §5.3.3 针对 `:6244-6276` 明确把 `:6245-6247` 改为 advisory（`run-ledger-unavailable`/`run-pin-required`），任务照常创建并省略 flow/run 锚点；补「handoff 无 flowId」与「handoff 时 run 账本不可用」的集成测试和 AC 条目。 |
| F2 | 漏重点 | **重要** | §5.3.3 `:6293-6312` 模块字段规则、§7.4.1 M7、§8.2 AC-5.3 | 「模块字段只在目标确实是该模块属主时写入」会改变验收购证：旧口径（preflight `:1318-1324`、旧设计 M7/P5）允许 verifier 引用任一已绑定模块，并要求验收任务/证据逐模块携带 `moduleId`/`modulePaths`；verifier 不是模块属主，按新规则其任务将不再写模块元数据。verifier 通常不在名单 `roles[]` 中，`evidenceScopeRoots`（`session.ts:7062-7093`）的 roster 侧不贡献根，任务 `modulePaths` 可能是唯一证据根；空 roots 会让 `isWithinEvidenceRoots`（`evidence-check.ts:148-154`）拒绝所有物证。这与 AC-5.3「验收不变」的承诺冲突，方案未给 verifier/验收目标例外。 | `workflow-preconditions.ts:1318-1324`；`session.ts:6298`、`:7062-7093`；`evidence-check.ts:148-154`；旧设计 M7/P5；方案 AC-5.3 | 明确「归属只影响授权/advisory，不影响任务元数据」：verifier（及其他合法的验收/治理目标）在模块存在于适用名单时仍写 `moduleId`/`modulePaths`；实现目标才按属主决定是否写；补 verifier 带 moduleId、文件型模块（不写 moduleDirectory）两个集成用例。 |
| F3 | 漏重点 | 一般 | §7.4 旧设计/旧验收标准处置表 | 表中把 P8 与 P6/P7/P9/P10 一并写成「不变」，但旧 P8 明确列有「convener dispatchTask（实现阶段，目标限 D3 选中 worker + verifier）」；新矩阵允许运营向任意真实存在的项目 worker 派发，P8 的权限 delta 描述已被部分取代。表中也未列出旧 P3/P5（P5 为验收逐模块证据，与 F2 直接相关）。 | `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md:947-951`（P3/P5/P8） | 把 P8 改为「部分取代」并写明「目标限 D3 选中集合」被取消；显式列出 P3 不变、P5 不变但其模块证据依赖需按 F2 保留；同步 §7.4 与 AC-5 的表述。 |
| F4 | 漏重点 | 一般 | §1.2 授权矩阵、§1.5 非目标 | 方案仅在非目标里写「任务重派/看护不改」，没有把 `redispatch_task` 作为既有派发/投递路径纳入矩阵完整性分析。该工具只给幕僚；`chooseRedispatchTarget` 在重试≥1 时会把任务改派给「首个非内置、非当前、非幕僚」的项目角色，并以原 `created.from` 记账后新建 `task.created`、投递。也就是说幕僚可通过重派把任务送到项目 worker，形式上绕开「幕僚不直接给项目 worker 派任务」的硬矩阵。该路径有安全分类/终止/上限等既有约束，但仍属「谁能给谁派发」的边界问题。 | `src/pipeline/orchestration/run-role.ts:1280`；`app/desktop/session.ts:4476-4620`、`:4324-4330`、`:4582-4599` | 在 §1.2/§2 或 §9 增加一段：列明 redispatch 是幕僚专用恢复通道、其目标选择与安全门，说明它是否视为派发入口；若不改，明确记录为范围外缺口及客户可见理由，并建议在实施阶段加只读核对。 |
| F5 | 漏重点 | 一般 | §5.5 run 记账兼容设计、§7.2 | 「任务可不带 run/flow 锚点」的下游影响只举例了 contract_check/验收 judge，没有列出按 `task.created.flowId` 过滤的实际消费者。已核实 `evidenceScopeRoots`（`session.ts:7086`）按 flowId 过滤任务并把 `modulePaths` 加入验收证据范围；无 flow 锚点的任务不会贡献范围。`escalateStuckTask` 也读取 `created.flowId`（有 `task-escalation` 兜底）。 | `app/desktop/session.ts:7062-7093`、`:4497`、`:4707`；`task-state.ts:589-592` | 在 §5.5/§7.2 增加「下游消费者」小节，至少列 evidenceScopeRoots、stuck 升级、任务卡、contract_check；对 evidenceScopeRoots 给出处置（接受并以 roster 范围兜底，或按 taskId/creator 兼容匹配），并把该影响写入风险表。 |
| F6 | 漏重点 | 一般 | §6 契约「幂等」「输出」 | §6 幂等行写默认键按 `from/to/text/moduleId/moduleDirectory` 生成，但派发实际调用 `taskIdempotencyKey` 时只传 `moduleId`（`session.ts:6099-6105`），不传 `moduleDirectory`；契约据此写测试会得到错误预期。另 §6 把 `DispatchReceipt` 写作 `{ ok, message }`，实际 `message?` 为可选。 | `task-state.ts:154-172`；`session.ts:6099-6105`；`src/model/runtime.ts:1001-1004` | 改为派发路径的真实键（`from/to/text/moduleId`，显式键优先），或说明 `moduleDirectory` 仅由内部调用方提供；`message` 标为可选。 |
| F7 | 漏重点 | 建议 | §3.1 第 30 行、§7.3、§8.2 AC-5.4 | 第 30 行说「仅把文案/说明标注为『引用完整性』」，但 §7.3 把 G-1 测试列为不变，而 G-1 测试对 `planDispatchDelivery` 的拒投文案做逐字断言（`派发未受理：引用的契约 … 不存在——未投递。`）。若实施时改文案，这些测试会失败；若改的是文档说明而非运行文案，方案应写清。 | `handback.ts:370-375`；`test/测试/g1-verify/g1-dispatch-wiring.test.ts:132`；`g1-extraction-render.test.ts:168/182`；`test/编排/dispatch-reads.test.ts:206` | 明确「保留现有运行文案，只调整文档说明」，或把上述 G-1 测试纳入 §7.3 的文案迁移；避免实施时才发现断言冲突。 |
| F8 | 漏重点 | 建议 | §8.1 全量回归命令、§8.3 | 命令用 `find … ! -name 'write-sequencing.test.ts'` 排除已知挂起测试，但正文没有说明排除原因或引用既有验收记录。既有验收标准要求「排除并记录可复现方式，不得静默跳过」。 | `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` | 在 §8.1 增加一句：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，按既有验收口径排除并在证据中记录命令；这不改变 AC-6.3 的全量回归要求。 |
| F9 | 漏重点 | 建议 | §1.4、O5 | 新行为与工具描述文本不一致的清单只列了角色卡（O5），未列 `src/provider/runtime/schema.ts:519` 的 `dispatch_task.moduleId` 描述（仍写 MUST carry、target must own）。这会让模型继续认为 moduleId 是硬性要求，与放宽后的产品行为不一致。 | `src/provider/runtime/schema.ts:515-519` | 把该工具描述加入 O5 的文案对齐范围，或在方案中说明「保留 MUST 作为推荐实践、不影响受理」；若改动文件，需在写集/团队计划中体现。 |
| F10 | 漏重点 | 建议 | §1.2 矩阵表、§4.3、§5.3.1 判定顺序、AC-1.5 | `target-card-missing` 同时用于「目标不存在」「幕僚→su/不可派发内置」「运营→不存在的项目角色」，owner 仍为 nominator、action 改为「请人事按 D3 写卡」。对 su/拼写错误的目标，这个下一步文案会误导。另 §5.3.1 判定顺序让「幕僚→未知非内置 id」落到 `chief-to-project-forbidden`（而非 `target-card-missing`），与矩阵表「不存在的目标不允许」和 §4.3 的文案分类不完全一致；AC-1.5 只覆盖了幕僚→su。 | `workflow-preconditions.ts:1191-1197`；`mechanical-rejection.ts:57`；方案 §1.2/§5.3.1 | 明确「目标 id 不存在/拼写错误」与「目标类型不允许」的优先顺序与文案；对 su/未知内置建议区分说明「该 id 不是可派发内置角色」；补一条幕僚→未知非内置 id 的 AC 或测试。 |
| F11 | 过度设计 | 建议 | §5.3.2、§5.7 | 新增 `DispatchAdvisoryInput` 与既有 `DispatchPreflightInput` 大量字段重复；同时把 `evaluateDispatchPreflight` 改名为 `evaluateDispatchAuthorization` 会带来 import/注释/测试钉的全量改动。两者都不是产品需求，属于可选简化空间。 | 方案 §5.3.2/§5.7；`workflow-preconditions.ts:1133-1161`；`governance-roles.ts:407` | 考虑复用/收窄一个输入类型（或把 advisory 输入定义为 `Pick<DispatchPreflightInput, …>`），并评估是否必须改名；若不改名，可减少迁移面。 |
| F12 | 漏重点 | 建议 | §6 契约名称/版本 | 方案把契约命名为 `dispatch-acceptance/v2`，并称 v1 为 2026-10-29 五步链机械前置；仓库中没有名为 `dispatch-acceptance` 的既有契约文档或 v1 记录，版本谱系目前只是对旧设计 M1–M8/P1 的转述。作为共享契约版本，这会削弱可追溯性。 | 全仓 `grep dispatch-acceptance` 仅命中本方案；旧设计 `2026-10-29_design-workflow-maintainers-hiring.md` §5.1/§7.2 | 在 §6 写明 v1 的准确出处（文件+章节/验收条目），或改名为不暗示不存在版本的名称（如 `dispatch-acceptance/2026-11-02`），保持版本链可核对。 |

## 复核结论

**建议修订后提交。**

方案方向与闸门 0 一致：把派发受理拆成「谁能给谁派发 + 目标真实」的硬授权与「任务状态」的 advisory，目标、范围、Q1–Q5 推荐、O1–O6 选装和旧设计处置总体清楚，事实核对准确度高，未发现关键信息缺失或与闸门 0 意图明显不一致，也未发现「暂不建议提交」级别的问题。但 F1（handoff 早退仍硬拒）与 F2（verifier 模块元数据与验收证据）属于影响客户决策/验收基线的重要发现，F3（旧 P8/P3/P5 处置）影响旧验收基线的追溯，建议作者按复核规则 §9 逐项处置并在闸门 1 前修订；F4–F12 为一般/建议级，作者可采纳、部分采纳或不采纳并记录理由，未解决意见由沟通在闸门 1 材料中披露。

**建议在闸门 1 前必须修订或明确：**

1. F1：把 `session.ts:6245-6247` 的 handoff 早退纳入 advisory 处置，补 handoff 无 flowId/run 账本不可用的 AC 与测试；否则 AC-3.3 与「flow/run 不阻断」不成立。
2. F2：明确 verifier/验收目标仍保留模块元数据，归属只影响授权/advisory；补 verifier 带 moduleId 与文件型模块的测试，避免与旧 M7/P5/AC-5.3 冲突。
3. F3：把旧 P8 改为部分取代，列出 P3/P5，并写清 P5 的模块证据依赖。

F4/F5 建议至少更新披露与风险表；F6–F12 建议同步修正，但不单独构成闸门 1 前的阻断项。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未运行任何测试、未启动应用、未跑 Electron E2E、未在真实项目复现派发；所有代码结论来自 HEAD `c80f4944…` 的静态阅读。测试文件只核对了被方案引用/与派发相关的段落，未逐行运行验证。
- 未读完 `app/desktop/session.ts`（7794 行）全文，只读了与 `routeDispatch`、`routeStarDispatch`、run 记账、run-change、任务卡/证据范围、重派相关的段落；未检查渲染层（O2 未实施，不在本次范围）。
- 未核对 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 的全部历史版本/验收记录，只核对了被方案 §7.4 引用的 P/G 表与 M1–M13 条目；旧验收报告与团队计划未逐份检查。
- 未检查所有 `task.created.flowId`/`runState` 的消费者，只抽查了 `taskCardOf`、重派、`evidenceScopeRoots`、stuck 升级与报告路由；F5 之外可能还有未列出的下游读取点。
- 未验证 `redispatch_task` 的完整运行时行为（F4 仅为代码阅读结论）；未确认客户是否愿意把重派视为独立的授权入口。
- 未检查 `src/provider/runtime/schema.ts` 中其他与新行为不一致的工具描述（只核对了 `moduleId` 一段）；未检查 `docs/` 中其他引用「应用会机械拒绝」的文本（O5 范围）。
- 未检查实际角色卡/边界 YAML 对本方案新增文件 `src/common/编排/dispatch-advisories.ts` 的边界覆盖；写集与角色定义属闸门 2/人事范围，本复核不判断。
- 未获得客户对 Q1–Q5、O1–O6 与 `planDispatchDelivery` 保留说明的任何确认；这些仍待闸门 1。复核不构成客户同意。
- 未实测既有 Windows symlink EPERM 失败名单与 `write-sequencing` 挂起；沿用仓库既有验收记录的结论，本复核不将其算作通过。
- 事实核对中的轻微偏差（`resolve-role.ts:347-362` 实为 `:345-370` 左右；`boundary.yml` 未写入 §1.2；§5.3.3 关于 convener 先以 `run-missing` 而非 `run-required` 失败的表述）不影响方案结论，建议作者顺手校正。

**未解决意见：** 无与作者的分歧记录（作者尚未对本记录作出处置）。本复核不评价实现可行性以外的产品取舍；Q1–Q5 的推荐与 O1–O6 的推荐均只是建议，客户可在闸门 1 选择其他项。

## 再复核记录

- 无（本轮为首轮完整复核）。作者按复核规则 §9 处置并更新版本后，复核只针对受影响部分进行并更新本记录。

## 再复核记录（P1.1，2026-11-02）

- 复核版本：`docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` P1.1（877 行；SHA-256 `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`；按该快照只读）。
- 复核范围（受影响部分）：§1.2、§1.4、§1.5、§2.2 第 2-14 行、§3.1 第 4/6/20/22/29/30 行、§4.2、§4.3、§5.1、§5.2、§5.3.1、§5.3.2、§5.3.3、§5.4、§5.5、§5.7、§6、§7.1–§7.4、§8.1、§8.2（AC-1.5/1.6、AC-2.4/2.5、AC-3.3、AC-5.3/5.4/5.6）、§9.1、§10（O5/O7）、§11、§12、§13；并抽查全文是否残留与 P1.0 处置冲突的旧表述。
- 复核方式：静态只读核对；未运行测试、未跑应用/E2E；作者 §13 处置表与改动章节逐项对照。

### 处置核对（F1–F12）

| 编号 | 作者处置 | 核对结果 | 依据/位置 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | 采纳 | 真实落入：§3.1 第 29 行明确 `:6245-6247` 早退；§5.3.3 `:6244-6276` 改为 advisory；§5.4 失败表、§7.3 run-pin 行、§8.1 chain-enforcement 计划、AC-3.3 均同步。 | `session.ts:6244-6247` 的现状代码与方案改动一致；AC-3.3 已覆盖「handoff 无 runManifest/无 flowId」；测试计划补了 handoff 无 flowId 用例。 | **已关闭**（方案层）；残留表述问题见 R2。 |
| F2 | 采纳 | 真实落入：§3.1 第 22 行 verifier 例外；§5.3.3 `:6293-6312` 按目标区分模块字段；§5.3.3 新增 `evidenceScopeRoots` 处置；§7.3/§8.1 补 verifier 非属主与文件型模块用例；AC-2.5/AC-5.3/AC-5.6；§7.4.1 M7。 | verifier 模块元数据保留、文件型模块不写 `moduleDirectory`、证据范围回退/ fail-closed 均已写入；与旧 M7/P5 的逐模块证据依赖一致。 | **已关闭**（方案层）；回退实现细节见 R3。 |
| F3 | 采纳 | 真实落入：§7.4 新增 P3、P5 行；P8 改为「部分取代」并写明「目标限 D3 选中 worker + verifier」被取消；其余 P8 delta 保留。 | 旧设计 `:947-951` 的 P3/P5/P8 文本与方案处置对应。 | **已关闭**。 |
| F4 | 部分采纳（披露+O7，不改行为） | 真实落入：§1.2、§1.5、§2.2 第 2-14 行、§9.1、§10 O7、§11 确认表；明确 redispatch 的目标选择、来源复制、范围外缺口与重开闸门 0/1 条件。 | `run-role.ts:1280`、`session.ts:4324-4330`、`:4476-4599` 的代码事实与披露一致。 | **仍存（未关闭）**：部分采纳只等于已披露，不等同于行为已纳入硬矩阵；后续 O7 处理。 |
| F5 | 采纳 | 真实落入：§5.5「flow/run 锚点省略时的下游消费者」表（evidenceScopeRoots、stuck 升级、任务卡、contract_check、redispatch）；§7.2、§9.1、AC-5.6。 | `evidenceScopeRoots:7062-7093`、`escalateStuckTask:4497/4707`、`task-state.ts:589-592` 与表一致。 | **已关闭**（方案层）；evidenceScopeRoots 回退口径见 R3。 |
| F6 | 采纳 | 真实落入：§6「输出」改为 `message?`；「幂等」改为派发路径实际键 `from/to/text/moduleId`，并说明 `taskIdempotencyKey` 支持 `moduleDirectory` 但派发不传。 | `task-state.ts:154-172`、`session.ts:6099-6105`、`src/model/runtime.ts:1001-1004`。 | **已关闭**。 |
| F7 | 采纳 | 真实落入：§3.1 第 30 行明确运行文案逐字不变；§7.3 新增 G-1 测试行（dispatch-reads、g1-dispatch-wiring、g1-extraction-render 保持不变）；AC-5.4。 | `handback.ts:370-375` 文案与 G-1 逐字断言一致。 | **已关闭**。 |
| F8 | 采纳 | 真实落入：§8.1 命令后说明 `write-sequencing.test.ts` 为既有已知挂起，引用 `acceptance-rework-routing-criteria-v1.md:98/162/604` 并记录排除命令。 | 既有验收标准与方案说明一致。 | **已关闭**。 |
| F9 | 采纳 | 真实落入：§1.4 补 `schema.ts:515-519`；O5 改为「角色卡 + 工具描述」；注明工具描述属代码、需团队计划/写集。 | `src/provider/runtime/schema.ts:519` 原文与方案描述一致。 | **已关闭**。 |
| F10 | 采纳 | 真实落入：§1.2 增加「类型不允许优先于不存在」；§3.1 第 4/6 行；§4.3 `target-card-missing` 文案覆盖拼写/id 与写卡未就绪；§5.3.1 判定顺序；AC-1.5/1.6。 | 与 `workflow-preconditions.ts:1191-1197`、`mechanical-rejection.ts:57` 的现状一致。 | **已关闭**。 |
| F11 | 采纳（简化） | 真实落入：§5.1/§5.3.1/§5.3.2/§5.7/§12 保留 `evaluateDispatchPreflight` 单一公开入口，取消函数改名与 `DispatchAdvisoryInput`，用 `Pick` 收窄内部输入。 | 方案已无改名计划；`governance-roles.ts` 注释同步项撤销。 | **已关闭**；但单一入口与 §5.2 数据流/调用时序出现新的不一致（R1）。 |
| F12 | 采纳 | 真实落入：§6 写明 v1 出处为旧设计 §5.1 M1–M8 与 §7.2 P1/P4/P11，并说明仓库无独立 v1 文件。 | 全仓 `dispatch-acceptance` 仅命中本方案；旧设计行号范围（约 476–494、944–954）与文件一致。 | **已关闭**。 |

### 新发现（再复核，P1.1 引入或残留）

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 漏重点 | 一般 | §5.1、§5.2、§5.3.1、§5.3.3 `:6180-6222` | 单一入口与调用时序不一致：§5.1/§5.3.1 说 `evaluateDispatchPreflight` 是单一公开入口、`ok:true` 返回 `advisories`，§5.3.3 说在 `:6180-6222` 调用它并「内部先硬授权、再 `collectDispatchAdvisories`」；但 §5.2 数据流把硬授权画在 D（早于 E 事实收集与 F run 记账），G 才收集 advisory。按 §5.3.3 的单次调用（位于 `chainDispatchFacts:6138` 与 run 记账 `:6150-6178` 之后），硬授权会发生在 run 记账之后，硬拒绝（例如运营→产品但带 flowId）仍可能先产生/领养 draft run；按 §5.2 的 D 早于 E/F，则 advisory 所需事实尚未收集，必须两次调用或另设内部授权入口，与「单一入口」表述不一致。 | 方案 §5.2 数据流、§5.3.3 表格；`session.ts:6138`、`:6150-6178`、`:6180-6222` | 明确调用协议：或保留一个内部/可导出的窄授权步骤在事实/run 记账之前调用，`evaluateDispatchPreflight` 在事后再收集 advisory；或把 `evaluateDispatchPreflight` 单次调用移到事实收集之后，并在方案中说明/接受「硬拒绝可能产生 draft run」的副作用（更干净的是先授权、后记账）。同步更新 §5.2 与 §5.3.3，并补一条「硬拒绝不产生任务/会话（如关注，也不产生 draft run）」的测试。 |
| R2 | 漏重点 | 建议 | §4.2 advisory 表、§5.4 失败表 | 表格与 F1 改动不一致：(a) §5.4 把「handoff pin 失败 / handoff 无 flowId 或 run 账本不可用」合并为「任务省略 run/flow 锚点」，但 §5.3.3 `:6293-6312` 规定 draft run 直接作为锚点；pin 失败时若已有 draft，任务应锚定 draft，而非省略锚点（AC-3.2 的「run 仍 draft/缺失」更准确）。(b) §4.2 的 `run-ledger-unavailable` 触发仍写「任意带 flowId 的派发」，但 F1 的 handoff 无 flowId 早退也会产生它；`run-pin-required` 触发仍写「运营→worker/质检」，但 handoff pin 失败/早退也可能产生它。 | 方案 §5.3.3 `:6244-6276`、`:6293-6312`；§5.4；§4.2 | 拆分 §5.4 行：pin 失败 → 任务可锚定 draft/缺失；无 runManifest/flowId → 省略锚点。同步 §4.2 的触发链描述，避免实施/测试按错口径断言。 |
| R3 | 漏重点 | 建议 | §5.3.3 `evidenceScopeRoots` 行、AC-5.6 | F2/F5 的修复给 `evidenceScopeRoots` 增加「taskId/creator 兼容匹配或 roster/角色边界根系」回退，但未定义回退优先级与「角色边界根系」的边界。角色边界（Section 1 写区）通常宽于任务模块，直接作为证据根可能放宽验收证据范围，与旧 P5「逐模块证据」口径存在张力；AC-5.6 只说「不误放行」，未给出可核对的范围。 | 方案 §5.3.3 `evidenceScopeRoots` 行、AC-5.6；`session.ts:7062-7093`；旧设计 P5/M10 | 明确优先级：任务 `modulePaths`（按 taskId/creator）→ roster 模块 → 角色边界仅作最后兜底且需限定/记录；补「无 flow 锚点 verifier + 角色边界根」的正/负例，确保不会把模块外物证算作模块证据。 |
| R4 | 漏重点 | 建议 | §13 复核记录引用、§13「仍未解决的意见」 | §13 仍把复核记录写为 101 行 / `232c4b1c…`，但本再复核追加后文件行数与哈希会变化；该引用应注明是「P1.0 复核快照」。§13 又称「仍未解决的意见：无」，但 F4 是部分采纳、未关闭（O7 后续），R1–R3 也仍存在；建议按本记录如实更新为「F4 部分采纳（未关闭）+ R1–R3 一致性问题」，避免把部分采纳说成无未解决意见。 | 方案 §13 第 855/875 行；本复核记录再复核节 | 作者在 P1.2 或提交前更新引用与「未解决意见」表述；沟通在闸门 1 材料中附本再复核记录。 |

### 再复核结论

**建议提交客户确认。**

F1–F3 与 F5–F12 的作者处置已真实落入方案，P1.0 的三项重要发现（F1/F2/F3）均已关闭；F4 为部分采纳、仍属未关闭的已披露缺口（行为未改，O7 后续，本次复核不把它当成已关闭）。P1.1 未引入新的重要产品/验收缺口；R1 是实施设计层面的调用时序/副作用一致性问题（一般），R2/R3/R4 是表格、证据范围与引用的一致性问题（建议级）。按复核规则 §8，这些均不属于影响客户决策或验收基线的重要发现，建议沟通按正常流程提交闸门 1，并在材料中如实披露 F4 与 R1–R4；若作者愿意，在提交前以 P1.2 只修订受影响段落（§5.2/§5.3.3/§5.4/§4.2/§13）可消除 R1–R4，再由沟通窄复核受影响部分。

### 未检查事项、限制与未解决意见

- 本轮只做受影响部分的窄复核，按 P1.1 快照静态阅读；未运行测试、未启动应用/E2E。P1.0 复核记录中的「未检查/未执行」事项仍成立。
- 未重新逐行核对所有 P1.1 未改动章节；只抽查与 F1–F12 相关的 §1、§2.2、§3、§4、§5、§6、§7、§8、§9.1、§10、§11、§12、§13。
- R1 的「硬拒绝可能先产生 draft run」是按方案文字与现有 session 调用顺序（`:6138` → `:6150-6178` → `:6180`）推断，未实际运行验证；实施阶段应以实际调用点确认。
- R3 的「角色边界根系」范围未在方案中定义，未检查 Section 1 解析后实际根系宽度；实施/验收时需以真实 boundary 数据核对。
- F4 未关闭：redispatch 目标选择与授权矩阵的关系只做了披露与 O7 选装，没有行为改动；客户若要求纳入硬矩阵，应按方案所述重开闸门 0/1。
- §13 引用的复核记录行数/哈希在本再复核后不再匹配；本记录已按 P1.1 追加新节，建议作者/沟通更新引用（R4）。
- 未获得客户对 Q1–Q5、O1–O7 与 `planDispatchDelivery` 保留说明的任何确认；复核不构成批准、客户闸门、验收基线或实施授权。

