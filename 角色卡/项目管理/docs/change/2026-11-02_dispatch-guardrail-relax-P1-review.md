---
id: dispatch-guardrail-relax-p1-review
type: change
title: P1 实现提案审核：派发护栏放宽（A1 编排 / B1 桌面窗口）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: [dispatch-guardrail-relax]
events:
  - date: "2026-11-02"
    kind: created
    summary: 按 references/proposal-review.md 审核 A1/B1 实现提案；结论 needs revision
  - date: "2026-11-02"
    kind: blocked
    summary: A1/B1 在按本记录修订并复审前不写产品代码
---

# P1 实现提案审核：派发护栏放宽（A1 编排 / B1 桌面窗口）

- **审核角色/上下文**：项目管理（technical-architecture，固定角色，独立只读审核上下文）。
- **审核性质**：实现提案审核（`references/proposal-review.md`），不是客户闸门、不是实施授权、不是测试结果、不是独立验收结论。
- **结论**：**`needs revision`**（详见 §7）。R1 调用协议核心可接受；A1/B1 存在需修订的 advisory 组合、legacy 事实、R3 匹配、会话层防御与测试覆盖问题；在修订并复审前 A1/B1 不写产品代码。
- **是否实质方案变化**：**否**。未发现授权矩阵、advisory 语义、写集、风险档位或客户确认范围的实质变化；不需要重开闸门 1/2。若统筹/沟通对 §5.3 的字段扩展作严格字面解释，应按团队计划 §5.4 停止回报，不自行实施。
- **未做**：未运行测试、未启动应用、未跑 E2E、未实施任何代码/测试、未 commit/push/merge/release、未接触客户。所有代码结论来自只读阅读。

## 1. 审核对象与冻结输入

以下行数与 SHA-256 为本次审核时实测，与任务输入一致。

| 对象 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A1 提案 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md` | 588 | `b007b38831f530d24c95631c21beeaf1aaec053a3f6fc428671f56775d4d1221` |
| B1 提案 | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md` | 412 | `6b89f2d58b8c18ef1f9219110e4799129390b07a16fcb62b69eb99d794edd403` |
| 客户确认方案 P1.1 | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 团队计划 v1 | `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| 实施前验收标准 V1 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` |
| 独立复核记录 | `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |

- 代码基线：worktree `flow-improvements-wave1`，HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；`git status --porcelain -- src app test` 为空，产品/测试零改动。
- B0 基线事实转引：typecheck 0；受影响套件编排 3 文件 39/39、桌面 7 文件 50/50；T3 全量 3358 / 3331 pass / 9 既有 Windows symlink EPERM / 18 skip / 0 todo。
- 只读代码核对：`src/common/编排/workflow-preconditions.ts` 的 `DispatchPreflightInput`（约 `:1133-1161`）、`evaluateDispatchPreflight`（`:1187-1372`）、`normalizeModulePath`（`:214`）；`mechanical-rejection.ts` 的 `target-card-missing`/`M5_TARGET_CARD_MISSING`；`task-state.ts:234-237/383-394`；`app/desktop/session.ts:6067/6086-6088/6110-6125/6130-6137/6138/6150-6178/6180-6222/6225-6242/6244-6277/6293-6318/6331-6349/6354-6401/7062-7094`；`tsconfig.json` 的 `include: ["src","test","app"]`、`verbatimModuleSyntax: true`；`src/model/runtime.ts:565-574` 的 `EvidenceCheckInput`（无 taskId）。

## 2. 审核方法与限制

- 按 `references/proposal-review.md` 检查需求符合、五层架构、契约/调用方、角色归属、复用、测试迁移与证据；只读核对方案、团队计划、V1、复核、B0 与代码。
- 只核对与本提案直接相关的代码/测试段落，未逐行运行；未验证运行时行为；未在真实项目复现派发。
- 未获得其他角色的新评估（本提案影响面已由 A1/B1 双角色提案、团队计划与复核覆盖；本次不另发会议/子代理）。
- 本记录只写审核结论与要求，不修改 A1/B1、不修改产品源码/测试、不写调度/验收/沟通/策划文档。

## 3. 逐项核对结论

| # | 核对项 | 结论 | 依据/说明 |
| --- | --- | --- | --- |
| 1 | R1 调用协议 | **核心通过，需修订调用图文本** | B1 §2.2 的硬授权 → chain facts → run 只读/记账 → handoff pin → 版本基线 → collector → `task.created` 与 A1 的「早调用窄步骤、晚调用 collector」一致；硬授权在 `ensureDraftRun`/`pinRun` 之前；`evaluateDispatchPreflight` 保留复合入口、同模块窄步骤复用同一谓词；无第二份硬授权。A1 §3.2 的 collector/版本基线与 B1 顺序不一致（P1-R-03）。设计 §5.3.3 的单次调用时序已被团队计划 §6.1 的已确认裁决取代，不构成新的闸门 1 变更。 |
| 2 | 契约形状 `targetExists` | **有条件通过** | 复合输入可选、窄输入必填的兼容方案可接受（见 §5.2 裁决）；不要求 B1 先行或协同改变 A1→B1 顺序；不需第三种 union/overload 形状。A1 需在冻结声明写明兼容窗口，B1 必须显式传 boolean。 |
| 3 | 新增可选事实字段 | **有条件通过** | `runFacts?`/`versionedDocBaselineViolations?` 是实现已确认 advisory 输出与 V1 §5.2「每个 code 正/负例」所必需的实施级可选事实；不是产品语义/schema/写集/档位变化。需补 legacy 事实（P1-R-02）与 pinned 模块事实澄清（P1-R-08），并在冻结声明/E1 记录为实施级扩展（见 §5.3 裁决）。 |
| 4 | advisory 产出位置 | **通过（仅主路径）** | A1 collector 应是全部 advisory 的唯一产出点；B1 只收集事实、合并/截断/呈现/诊断。B1 §2.1 的「备选：会话层追加同类 advisory」不获批准，必须按主路径执行，不得形成第二套文案/诊断。 |
| 5 | R2 锚点 | **不通过，需修订** | B1 的三分锚点（pin 失败锚定已有 draft、无 runManifest/flowId 省略锚点、pinned 校验失败/不覆盖目标或模块不锚定、不伪造 pinned、保留 `stepId=project-handoff`）与团队计划 §6.2/V1 §4.2 一致，三类 handoff 测试有映射。但 A1 的 `pinFailed` 与 `run-pin-required` 互斥规则与 B1/V1/团队计划冲突（P1-R-01）；legacy advisory 事实缺口（P1-R-02）；pinned 模块覆盖 advisory 缺事实（P1-R-08）。 |
| 6 | R3 `evidenceScopeRoots` | **不通过，需修订** | B1 §4.1 有「任务 modulePaths → 适用 roster → 角色边界最后兜底 → 空集 fail-closed」的顺序与正/负例；但 tier ① 以 `moduleId∈适用 roster` 作为门槛，与团队计划 §6.3「任务自身 modulePaths 按 taskId/creator 兼容匹配」不一致，且 creator 匹配未定义（P1-R-04）。不得新增 schema；`EvidenceCheckInput` 当前无 taskId，必须用既有 `created.to/from/moduleId/modulePaths` 定义兼容匹配并记录限制。 |
| 7 | 模块字段 | **通过（测试夹具需修正）** | B1 §5 与方案 §5.3.3/F2/AC-5.3 一致：实现目标仅属主写；verifier/合法验收目标模块存在即写 `moduleId`/`modulePaths`；文件型模块不写 `moduleDirectory`；不匹配省略并记 advisory。测试夹具示例 `src/index.ts` 与既有 `impl-core` 的 `src/` 模块重叠，会使 roster 校验失败（P1-R-06），需换非重叠文件路径。 |
| 8 | 测试迁移质量 | **基本通过，需补测** | A1 §6.1 与 B1 §7 的迁移映射逐文件、逐行覆盖；未发现删除测试、新增 skip/todo 或放松断言的计划；`run-change-entry` 源码钉更新保留必要钉。需补 R2 组合、legacy、R3、AC-2.8/AC-4 诊断、star target-not-exists、M1/M2 幂等等用例（P1-R-07）；A1 的 `liaison` 测试假设需修正（P1-R-09）。 |
| 9 | 写集/边界/非目标 | **通过** | A1 只写 `src/common/编排/{workflow-preconditions,dispatch-advisories,mechanical-rejection}.ts` 与两个 `test/编排/` 文件；B1 只写 `app/desktop/session.ts` + 7 个既有桌面测试；未列 `src/provider/runtime/schema.ts`、`app/main.ts`、renderer、`task-state` schema、`handoff.ts` 等；F4 不改；R4 由策划；i18n 默认不新增 key；H1 的 B-1/B-2 已由人事落盘，不属 B1 写集。 |
| 10 | 证据与放行 | **通过** | A1/B1 退出命令、候选哈希/逐文件 blob+sha、typecheck、契约冻结顺序、A1→B1 中间态不作候选/发布、D1 只在同一候选取证均与团队计划 §5.3/§7.3、V1 §5.5 一致。B1 证据需同时记录 A1 冻结两文件哈希；若 rebase/合并 main，按团队计划重记基线。 |

## 4. 发现

### 4.1 阻断项（必须修订后才能复审/实施）

| 编号 | 严重度 | 位置 | 问题 | 建议/精确修订 |
| --- | --- | --- | --- | --- |
| P1-R-01 | **重要（阻断）** | A1 §5.1 规则 6、§5.3 第 2/3 行；B1 §3.1、§7.2 | A1 规定 `runFacts.pinFailed=true` 时只报 `run-pin-failed`，不再报 `run-pin-required`；B1 在 handoff pin 失败时期望 `run-pin-failed + run-pin-required`，V1 §4.2 R2-c 明确 `run-pin-required` 覆盖 handoff pin 失败/早退，团队计划 §6.2 也写「记 run-pin-failed/run-pin-required 等 advisory」。按 A1 当前规则，B1 的测试与 V1 口径会冲突。 | A1 删除「pinFailed 时不再报 run-pin-required」的硬性互斥：`pinFailed=true` 时至少报 `run-pin-failed`；若 run 仍为 draft（pin 失败后通常仍在 draft），同时报 `run-pin-required`；若 run 不可用/无 manifest，按 `run-ledger-unavailable` 口径另行处理。A1 §5.3 第 3 行的「非 pinFailed」条件删除并补组合矩阵；A1 §6.2 增加「pinFailed+draft → 两个 code 同时存在且顺序固定」正例；B1 §3.1/§7.2 保持 `run-pin-failed`/`run-pin-required` 组合并断言顺序。 |
| P1-R-02 | **重要（阻断）** | A1 §5.3 第 1 行；B1 §2.2 步骤 5–6、§3.2 | A1 仅在 `run.state === "legacy"` 时产出 `run-legacy-readonly`；B1 为所有带 flowId 的派发执行 `ensureDraftRun`，legacy flow 会新建 draft，`run` 事实变为 draft，导致该 advisory 丢失。方案 §5.3.2 明确要求「由会话层 `hasLegacyFlowTask` 事实判断，不因本次创建 draft run 而丢失」。 | 二选一并在 A1/B1 同时写明：(a) B1 在 `hasLegacyFlowTask` 为真时把 collector 的 `run` 事实设为 `{state:"legacy"}`（仅 advisory 事实；任务锚点仍用本地 `runManifest` 的 draft，不把 legacy 当锚点），并更新 A1 的 `run` 字段注释/冻结声明；(b) 在 `runFacts` 中增加可选 `legacyReadonly?: boolean`，A1 以该事实触发。推荐 (a)（复用现有 `run` 事实、不再新增字段）。补测试：legacy flow + `ensureDraftRun` 成功 → 任务锚定 draft、advisory `run-legacy-readonly` 存在、旧 legacy 记录可读。 |
| P1-R-03 | **重要（阻断）** | A1 §3.2 第 6–7 步、§8.1 检查清单 | A1 的调用图把 `collectDispatchAdvisories` 列为第 6 步、`verifyVersionedDocBaselines` 列为第 7 步，但 collect 的输入又引用「第 7 步结果」；B1 §2.2 是第 7 步版本基线、第 8 步 collector，B1 的顺序才自洽。按 A1 文本实现会导致 collector 拿不到 `versionedDocBaselineViolations`。 | 将 A1 §3.2 重排为：硬授权 → 事实收集 → run 只读/记账（含 handoff pin）→ `verifyVersionedDocBaselines` → `collectDispatchAdvisories` → `task.created` → 投递/回执；并明确 handoff pin 在 run 只读/记账之后、collector 之前。更新 §3.3 分工表与 §9.3 冻结声明，使 A1/B1 调用图逐项一致。 |
| P1-R-04 | **重要（阻断）** | B1 §4.1 第 1 项、§4.2 | B1 对无 flow 锚点任务以「`created.moduleId` 存在于适用 roster」为纳入条件，把「任务自身 modulePaths」与「适用 roster」混为一层；当 roster 版本变化/模块被移除时，合法 verifier 任务的 modulePaths 会被丢弃，`scopeRoots` 可能变成「有根误空」，正撞上 V1 AC-5 的失败示例。且「creator（created.from）兼容匹配」未定义具体规则；`EvidenceCheckInput` 无 taskId，不能新增 schema。 | 精确修订：tier ① 仅用既有任务记录字段——`created.to === roleId`、`created.flowId === undefined`、creator 兼容（明确：verifier 与项目 worker 由 `created.from === "convener"` 派发；内置目标由 `created.from === "chief"`；如需两者兼容，列出精确集合）、`created.moduleId !== undefined`，直接纳入该记录的 `created.modulePaths`，**不以当前 roster 是否仍含该 moduleId 为门槛**；tier ② 才用适用 roster 的角色模块；tier ③ 才用受限角色边界兜底。补测试：无 flow verifier 正例、模块外负例、边界兜底有界/记录、roster 漂移不导致空 roots、无根 fail-closed。B1 证据中记录「taskId 精确匹配因 `EvidenceCheckInput` 无 taskId 且不得改 schema 而不可用，改用 creator+to+no-flow+moduleId」。 |
| P1-R-05 | **重要（阻断）** | B1 §2.2 第 6 条（保留 `session.ts:6086-6088` 防御） | 会话层防御 `targetRoleId === fromRoleId || (chiefRoleId !== null && targetRoleId === chiefRoleId)` 会先于 `evaluateDispatchAuthorization` 拦截「运营 → 幕僚」：它返回「不能派发给幕僚自己」的普通失败，而不是矩阵要求的 `convener-target-forbidden`。V1 AC-1.4 要求运营→产品/策划/人事/幕僚等非质检内置返回 `convener-target-forbidden`，且桌面证据需可核对。 | 将 `:6086` 防御收窄为只拦 `fromRoleId === targetRoleId`（自派），把「target=幕僚且来源非幕僚」交给矩阵；或保留防御但显式映射为 `convener-target-forbidden`（不推荐，仍属第二条判定）。补桌面测试：convener→chief 返回 `convener-target-forbidden`、无任务行/无目标会话；self 仍保留原「不能派发给幕僚自己」断言。 |
| P1-R-06 | **一般（阻断 B1 实施前）** | B1 §7.1「文件型模块」夹具 | 示例「`src/index.ts`，属主 implementer」与既有 `impl-core` 模块的 `path: src/` 重叠。`parseProjectRoster` 对模块路径做重叠/嵌套校验（`roster-module-directory-overlap`），该夹具会直接解析失败，导致文件型模块用例无法落地。 | 改用不与 `src/`、`test/` 重叠的文件路径（例如 `scripts/build.mjs`、`README.md` 或单独的 `assets/manifest.json`），并在夹具构造后断言 `parseProjectRoster` 成功；保持「文件型模块不写 moduleDirectory、任务行可读回」的断言。 |
| P1-R-07 | **重要（阻断 B1 测试计划）** | B1 §2.3、§7.1–§7.8 | 测试计划存在可核对性缺口：(a) AC-1.5 star 路径「运营→不存在项目角色」只由 `rejection-copy` 纯函数或 single 路径 `dispatch-fresh-enum` 覆盖，缺 star 会话集成「无任务行/无会话」；(b) AC-2.8 pinned 哈希漂移/roster 读取失败只有 `verifyPinnedRun` 直接测试，缺派发受理+advisory+不锚定的会话证据（V1 §2.4 要求实际行为）；(c) AC-2.6 legacy flow 的桌面派发受理+advisory 未列入 B1 测试；(d) AC-4.2/AC-4.3 的 `tasks.dispatch.advisory` 捕获与洁净派发零噪声未列入测试计划（B1 §10.1 风险 4 只提方法）；(e) `chain-enforcement` M1/M2 中首次「缺意图」派发现在会受理并占用同一幂等键，后续同文补派会被抑制，B1 只对缺名单场景提示，未覆盖该断言；(f) `run-change-entry` 的负向源码钉用裸子串，若注释保留删除说明会误红；(g) AC-1.2 的桌面来源身份拒绝目前只引用 `routeDispatch:5786-5803` 既有校验，未在 `test/桌面应用/` 找到直接覆盖 wrong-source 的用例，B1 又声明「不另造来源注入」，存在桌面证据缺口。 | 逐项补入 §7 与证据计划：(a) `star-routing` 新增 convener→不存在项目 worker，断言 `target-card-missing`、任务行不变、无目标会话；(b) `run-pin` 新增会话级 pinned 哈希漂移/roster 失败 → 受理、advisory、manifest 未改写、任务无锚点；(c) `run-pin` 新增 legacy flow 派发 → 受理、advisory、旧记录可读；(d) 新增/扩展测试用 `configureDiagnostics`/`flushDiagnostics` 捕获 `tasks.dispatch.advisory` 的 `reasonCode`，并在洁净派发断言零条；(e) M1/M2 用新任务文本验证补派，或显式断言同文复派被幂等抑制、不新增行；(f) 负向钉用精确正则或移除，且不得让注释包含该标识符；(g) 在 `star-routing`/`dispatch-fresh-enum` 或接口层补 wrong-source 用例（可用直接调用 `routeDispatch`/接口注入的非 chief/convener 来源），断言无任务行、无目标会话；若确认已有其它桌面测试覆盖，B1 在证据中逐文件引用，不能只以纯函数覆盖代替 V1 AC-1.2 的桌面证据。 |
| P1-R-08 | **一般（需明确；不单独阻断，若实现 module-missing 则需补事实）** | A1 §2.1 `run` 类型、§5.3；B1 §3.2 最后一条 | B1 说 pinned run 不覆盖目标/模块时记 `run-role-missing`/`module-missing`，但 A1 collector 的 `roster` 是最新 roster（§5.1.2 明确 latest 优先），`run` 事实只有 `state/runId/roles`，没有任何 pinned 模块清单；因此 collector 无法判断「模块不在 pinned roster」。若 B1 不传该事实，design §5.5 的 `module-missing` 覆盖会落空；若 B1 把 roster 换成 pinned，又会污染 latest 状态检查。 | 明确二选一：(a) 在既有 `run` 事实中增加可选 `modules?: readonly string[]`（最小扩展，仅 B1 传 pinned 模块 id），collector 在 run 专属 advisory 中使用该事实产出 `module-missing`；(b) 明确 pinned 模块不覆盖时只省略锚点、不产出 `module-missing`，并在 B1 证据/验收说明中记录该处与 design §5.5 的差异及理由。不得在会话层另写 advisory 文案。另请明确 `run.roles === undefined` 时是否产出 `run-role-missing`（当前 A1 不产出，B1 不锚定）；若需要提示，应给出明确文案/事实，不得伪造 roles。 |
| P1-R-09 | **一般（阻断 A1 测试修改）** | A1 §2.3 补充、§6.1 | A1 把 `liaison` 与 `su` 并列为「幕僚→非 allowlist 内置 id → target-card-missing」的测试输入。实际 `isBuiltInGovernanceRoleId("liaison")` 为 false（liaison 是已退休只读别名，不进入 `BUILT_IN_GOVERNANCE_ROLES` 注册表），会话层 `targetBuiltIn` 会是 false，真实路径是 `chief-to-project-forbidden`，不是 `target-card-missing`。 | 删除 `liaison` 作为「内置 id」的断言；使用 `su`（`isBuiltInGovernanceRoleId` 明确为 true）覆盖 `target-card-missing`；若仍要测「未知内置 id」，用纯函数显式 `targetBuiltIn:true` 的合成 case 并注明「synthetic fact，不是会话层真实枚举」，不要把它写成真实角色路径。同步 §6.1 的矩阵测试说明。 |

### 4.2 建议项（不阻断）

| 编号 | 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| P1-R-10 | 建议 | A1 §2.4；`workflow-preconditions.ts:214` | `dispatch-advisories.ts` 与 `workflow-preconditions.ts` 形成 `import type`（前者→后者）与运行期 import（后者→前者）的模块图环；`verbatimModuleSyntax` 会擦除类型导入，运行期无环，但架构检查可能把它读成 import 环。模块路径归一化在 advisories 内复制一份，存在与 `normalizeModulePath` 漂移的风险。 | 在 A1 冻结声明中明确「仅 type-only 反向引用，运行期无环，已由 `verbatimModuleSyntax` 擦除」；为 `module-path-invalid`/`module-path-outside` 增加与 roster 解析器同输入的等价性测试（至少覆盖反斜杠、绝对路径、`..`、通配、目录/文件尾斜杠）。若后续要单一来源，另立变更抽共享 helper，不在 A1 写集内临时加文件。 |
| P1-R-11 | 建议 | A1 §2.1/§2.2、B1 §2.1 | `DispatchAuthorizationInput`/`DispatchAuthorizationResult`/`DispatchAuthorizationFailure` 被导出，且 B1 写「`evaluateDispatchPreflight` 的第一行必须是 `evaluateDispatchAuthorization`」。方案 §5.3.1/§5.7 称窄输入为「内部」类型，且函数第一行字面要求无法严格成立（还需构造/Pick 参数）。 | 将窄类型视为窄步骤的公开签名（Pick 派生，不是重复输入形状），在 A1 冻结声明中列明；把 B1 的「第一行」改为「进入复合逻辑后的第一个判定步骤是 `evaluateDispatchAuthorization`」，避免实现/测试按字面做脆弱断言。 |
| P1-R-12 | 建议 | A1 §2.2 | 文中写「`fromRoleId === null` 永不成立」，应为「`chiefRoleId === null` 永不成立」；另 B1 §3.1 对「无 flowId」与「有 draft 未 pin」的二选一表述在不同行略有歧义。 | 修正笔误；在 B1 §3.1 增加一行决策矩阵：`runManifest===undefined`→`run-ledger-unavailable`；`runManifest draft 且 pin 未成功`→`run-pin-failed`(+`run-pin-required`)；`runManifest draft 且未尝试 pin`→`run-pin-required`；`pinned 校验失败`→`run-document-hash-mismatch`/`run-pinned-roster-invalid`，锚点按 §3.2。 |
| P1-R-13 | 建议 | B1 §7.5、§7.6 | `run-change-trigger` 迁移把三模式覆盖移到显式入口，但 `run-change.test.ts` 已覆盖直接方法；需避免重复/漏掉无会话兜底与提案卡路径的覆盖归属。`run-change-entry` 负向源码钉的脆弱性见 P1-R-07(f)。 | 在 B1 测试映射表中明确每个旧用例的新落点与断言语义，避免「移到别处」变成隐式删除；负向钉按 P1-R-07(f) 处理。 |

## 5. 开放点裁决

### 5.1 R1 调用协议

**裁决：核心协议可接受。**

- B1 §2.2 的调用图满足 R1：`evaluateDispatchAuthorization` 在 `refreshListingNow` + 目标事实之后、`chainDispatchFacts`/`findActiveRun`/`ensureDraftRun`/`pinRun` 之前调用；硬拒绝路径不调用 `newTaskId`/`appendTaskState`/`openInternal`/`ensureDraftRun`/`pinRun`；硬授权输入只有 `fromRoleId/targetRoleId/targetBuiltIn/targetExists/chiefRoleId/convenerRoleId` 六个事实。A1 §3.3 与 B1 §2.3 的测试落点可落地。
- `evaluateDispatchPreflight` 仍是唯一「授权 + advisory」复合公开入口；`evaluateDispatchAuthorization` 是同模块导出的窄步骤，复合入口内部复用它，不构成第二份谓词。团队计划 §6.1.3 明确允许「同模块导出的窄步骤」，V1 §4.1 R1-c 同口径。B1 不调用复合入口、只调窄步骤 + collector，避免第二次授权评估，可接受。
- A1 §3.2 的步骤编号与 B1 不一致（P1-R-03），属于需要修订的文本/冻结声明，不改变协议本身。
- 方案 §5.3.3 把调用点写在 `:6180-6222`（run 记账之后），与 §5.2 数据流/团队计划 §6.1 的「硬授权先于 run 账本写入」不一致；团队计划 §6.1 已把该冲突固定为实施协议，且闸门 2 已确认。A1/B1 按团队计划执行不属于方案实质变化，不需要重开闸门 1。
- B1 §2.2 第 6 条保留 `session.ts:6086-6088` 的「目标=幕僚/自派」防御，见 P1-R-05：必须收窄或映射，否则会形成矩阵之外的第二条目标判定并改变 AC-1.4 的 code。

### 5.2 `targetExists` 形状

**裁决：接受 A1 的「复合输入可选、窄输入必填」；不要求 B1 先行/协同改变 A1→B1 顺序；不采用第三种形状。**

- 事实依据：`test/桌面应用/rejection-copy.test.ts:54-70` 直接构造 `DispatchPreflightInput` 且不含 `targetExists`；`tsconfig.json` 的 `include` 含 `test`，`verbatimModuleSyntax: true`。若 A1 把复合输入的 `targetExists` 设为必填，A1 的 `npm run typecheck` 会因跨角色测试失败；A1 不能改桌面测试；若要求 B1 先改，违反团队计划「A1 先冻结、B1 后接线」的顺序与 A1 独立出口。
- 方案 §5.3.1 的字面「只新增 `targetExists: boolean`」是产品语义层的必填事实；A1 的窄输入 `DispatchAuthorizationInput.targetExists: boolean` 已是必填。复合输入的可选仅是为旧调用方保留编译兼容窗口，不改变硬授权矩阵：唯一使用 `targetExists` 的运营→项目 worker 分支由 B1 显式传 boolean，旧调用方的 `targetCardFound` 回退在现状语义下恰为目标枚举结果。
- 第三种形状（union/overload/新增 `DispatchPreflightInputV2`/把 `targetExists` 改为必填而给复合入口加 legacy 重载）都会新增第二公开输入形状或扩大迁移面，违反方案 §5.7/团队计划「不新增对外重复输入类型」的意图，且不如当前方案简单，不采纳。
- 条件（A1/B1 必须在实现记录/冻结声明中满足）：
  1. 仅 `targetExists` 在复合输入上可选；窄输入必填。不得把其他新字段设为「可选以兼容旧调用方」。
  2. `resolveTargetExists(input) = input.targetExists ?? input.targetCardFound` 必须为私有、唯一解析点，fail-closed；不得让 collector 或其他分支二次推断。
  3. B1 在 `routeStarDispatch` 始终显式传 boolean，不依赖回退；B1 在迁移 `rejection-copy` 时，对使用存在性分支的构造传入显式 `targetExists`（新硬负例传 `false`）。
  4. A1 单测覆盖：省略 `targetExists` + `targetCardFound=false`（运营→项目 worker）→ 硬 `target-card-missing`；省略 + `true` → 通过；显式 `false`/`true` 的窄入口矩阵；复合入口成功带 `advisories`、失败不带。
  5. A1 冻结声明明确这是「兼容窗口」；后续把复合输入收紧为必填是独立变更，不得在 B1 中静默改变。

### 5.3 `runFacts` / `versionedDocBaselineViolations` 可选字段

**裁决：有条件接受为实现级可选事实扩展；不得由 B1 在会话层另写同类 advisory。**

- 方案 §5.7 的「新增」清单只列了 `DispatchAdvisory`、`DispatchPreflightInput.targetExists`、`ok:true.advisories`、内部 `DispatchAuthorizationInput`，并明确不新增 `DispatchAdvisoryInput`；A1 的两个新可选字段确实超出该字面清单。
- 但方案 §5.3.2 要求「所有事实由会话层传入」、§4.2 已列出 `run-pin-failed`/`run-ledger-unavailable`/`run-document-hash-mismatch`/`run-pinned-roster-invalid`/`versioned-doc-baseline-violation`；现有 `run` 只有 `state/runId/roles`，无法表达 pin 失败、文档哈希漂移、pinned roster 失败；版本基线违规也没有既有字段。V1 §5.2 又要求编排单测覆盖每个 advisory code 的正/负例。因此：
  - 若不加这些事实，collector 无法覆盖上述 code；把版本基线/run 失败 advisory 留在会话层会让 B1 成为第二个 advisory 产出点，违反方案 §5.1「advisory 纯逻辑」与团队计划 §3.4 选项 E（已否决把 advisory 逻辑放桌面窗口）。
  - `run-legacy-readonly` 可以复用现有 `run.state="legacy"` 作为 advisory 事实，不必新增字段（见 P1-R-02 方案 (a)）。
  - pinned 模块覆盖需要 `run.modules?` 或等价可选事实，或明确不产出该 advisory（P1-R-08）。
- 接受条件：
  1. 仅新增 `runFacts?: { ledgerUnavailable?; pinFailed?; documentHashMismatch?; pinnedRosterInvalid? }` 与 `versionedDocBaselineViolations?: string[]`；如为 legacy/pinned 模块另需事实，按最小可选字段处理并同样记录；不得新增 `DispatchAdvisoryInput`、不得改 `TaskCreatedEvent`/`DispatchTaskPayload`/`RunManifest`/`tasks.jsonl` schema。
  2. 字段全部可选；缺省视为「无该事实」，collector 不读盘、不推断、不抛错；不得影响硬授权。
  3. A1 冻结声明把这两项标注为「会话层观察的可选事实（实施级扩展）」，并说明为何超出 §5.7 字面；B1 证据记录同一口径；统筹 E1 变更包记录「无产品语义/写集/档位变化，仅为实现已确认 advisory 输出」。
  4. A1 为每个 fact 至少一正一负；B1 只在观察到时设置，不把「未读到」误写成 false 事实。
  5. 若统筹/沟通/V1 所有者坚持 §5.7 字面不允许任何新增字段，A1 停止并回报，按团队计划 §5.4 处理；不得由 A1 自行扩为方案变更，也不得让 B1 会话层补文案。

### 5.4 advisory 产出位置

**裁决：只批准主路径；B1 的「备选」不获批准。**

- 主路径：`collectDispatchAdvisories` 是全部 code 的唯一产出点；B1 只传完整 `DispatchPreflightInput` + `runFacts` + 版本违规 + 最新 roster/D3（pinned 只用于 run 专属事实），然后合并、最多展示 3 条、`emitDeliveryNote` 一行、按 code 记诊断；文案由 A1 的 `dispatch-advisories.ts` 统一提供。
- B1 §2.1 的备选（会话层按方案 §4.2 文案追加 `run-ledger-unavailable`/`run-document-hash-mismatch`/`run-pinned-roster-invalid`/`run-pin-failed`/`versioned-doc-baseline-violation` 等）会造成第二套文案/诊断/去重逻辑，且与方案 §5.1、团队计划 §3.4 E 冲突。P1 审核结论：**不选备选**；B1 在实施记录中记录「按 P1 裁决采用主路径」。
- B1 的「同 code 去重」只能作为展示层防御；A1 必须保证同一场景不重复产出同一 code（R2 组合场景除外，`run-pin-failed`+`run-pin-required` 是不同 code）。

### 5.5 R2 锚点

**裁决：B1 的锚点三分可接受；A1 的 advisory 组合需按 P1-R-01 修订；legacy 事实按 P1-R-02；pinned 模块事实按 P1-R-08。**

| handoff 事实 | B1 锚点 | B1 advisory | 团队计划 §6.2 / V1 §4.2 | 结论 |
| --- | --- | --- | --- | --- |
| 无 runManifest / 无 flowId / run 读取或 ensureDraftRun 失败 | 省略 `flowId`/`runId`/`runState`；仍写 `stepId=project-handoff` | `run-ledger-unavailable`（无 runManifest）；无 flowId 时另有 `flow-required` | 一致 | 通过（需按 P1-R-02 处理 legacy 与 flow 事实） |
| run 为 draft，pin 失败 | 锚定已有 draft：`runId`+`runState:"draft"`+（有 flowId）`flowId`；不伪造 pinned | `run-pin-failed` + `run-pin-required`（run 仍未 pin） | 一致 | 锚点通过；A1 组合需 P1-R-01 |
| run 为 pinned，verifyPinnedRun 失败/violations | 省略三者；不锚定失效 pinned | `run-document-hash-mismatch` | 一致 | 通过 |
| pin 成功但 post-pin verify/loadPinnedRoster 失败 | 省略三者；不伪称 draft（磁盘已 pinned） | `run-document-hash-mismatch` / `run-pinned-roster-invalid` | 一致 | 通过 |
| pin 成功且 verify/roster 成功 | 合法 pinned 锚定（目标内置或项目 worker 在 roles；带 moduleId 时模块在 pin 名单） | 无 pin 失败 advisory | 一致 | 通过 |
| pinned 不含目标角色 / 模块不在 pin 名单 | 省略锚点 | `run-role-missing` / `module-missing` | 目标一致；模块事实缺（P1-R-08） | 目标通过；模块需明确 |

- 三类 handoff 测试（无 flowId、runManifest 缺失/账本不可用、pin 失败）在 B1 §3.3 均有落点；补 P1-R-07(c) 的 legacy flow 会话级证据。
- `stepId=project-handoff` 在无锚点时仍写、`handoffFound` 仍按 stepId 识别，B1 §3.1/§3.2 正确。

### 5.6 R3 `evidenceScopeRoots` 匹配

**裁决：B1 当前方案不完全满足团队计划 §6.3，需按 P1-R-04 修订后才能实施。**

- 必须保留的优先级：① 任务自身 `modulePaths`（按 taskId/creator 兼容匹配）→ ② 适用 roster 模块根（pinned 仅锚定且可读时；否则 latest）→ ③ 角色边界根仅最后兜底、限定到模块相关范围并记录来源；都没有 → `[]` → `evidence-scope-denied` fail-closed。
- 当前 B1 的「moduleId∈适用 roster」把 tier ① 与 tier ② 混同，且 creator 匹配未定义；`EvidenceCheckInput` 无 taskId，不能新增 schema。修订后仍不得新增 `src/model/runtime.ts` 或工具 schema；用既有 `created.to/from/moduleId/modulePaths` 完成匹配，并在 B1 证据中记录 taskId 精确匹配的限制。
- 正/负例必须覆盖：无 flow 锚点 verifier 任务以 modulePaths 贡献根（正）；模块外物证 `evidence-scope-denied`（负）；边界兜底位于 roster 模块内被接受且诊断 `evidence.scope.boundary-fallback`，模块外边界根不被接受；无根 fail-closed。B1 §4.2 已有正/负/兜底三类，但需补 roster 漂移/creator 不匹配/边界根越界的负例。

### 5.7 其余核对项

- **模块字段**：B1 §5 与方案 §5.3.3/F2/AC-5.3 一致；只需修正测试夹具文件路径（P1-R-06）。
- **写集/边界/非目标**：A1/B1 均在团队计划 §4.3 写集内；无未列路径；F4 不改；R4 只引用；i18n 默认不新增 key；H1 的 B-1/B-2 已落地且不计入产品候选。
- **证据与放行**：A1/B1 退出命令、候选哈希、typecheck、冻结顺序、A1→B1 中间态不候选/不发布、D1 同一候选取证均满足；B1 证据需绑定 A1 冻结两文件哈希；若 rebase/合并 main，按团队计划重记基线。

## 6. 返工要求与阻断关系

| 编号 | 负责角色 | 精确要求 | 是否阻断 |
| --- | --- | --- | --- |
| P1-R-01 | 编排（A1） | 修订 `run-pin-failed`/`run-pin-required` 组合规则与测试；B1 同步 §3.1/§7.2 | 阻断 A1 冻结与 B1 测试 |
| P1-R-02 | 编排 + 桌面窗口 | 明确 legacy advisory 事实（推荐 `run.state="legacy"` 仅作 advisory 事实；任务锚定仍用 draft），补 legacy flow 会话测试 | 阻断 A1 冻结与 B1 实现 |
| P1-R-03 | 编排（A1） | 重排 §3.2 调用图（run 记账/handoff pin → 版本基线 → collector → task.created），更新冻结声明 | 阻断 A1 冻结 |
| P1-R-04 | 桌面窗口（B1） | 修订 R3 tier ① 匹配：creator 兼容明确、任务自身 modulePaths 不以 roster 为门槛；补正/负例 | 阻断 B1 实现 |
| P1-R-05 | 桌面窗口（B1） | 收窄 `:6086` 防御或映射矩阵 code；补 convener→chief 测试 | 阻断 B1 实现 |
| P1-R-06 | 桌面窗口（B1） | 文件型模块夹具改用非重叠路径并断言 roster 解析成功 | 阻断 B1 测试落地 |
| P1-R-07 | 桌面窗口（B1） | 补 AC-1.2 wrong-source、AC-1.5 star、AC-2.8、AC-2.6、AC-4 诊断、M1/M2 幂等、负向源码钉用例 | 阻断 B1 测试计划 |
| P1-R-08 | 编排 + 桌面窗口 | 明确 pinned 模块覆盖 advisory 事实或明确不产出；明确 roles 缺失口径 | 不单独阻断（但需在冻结/证据中写清） |
| P1-R-09 | 编排（A1） | 删除 `liaison` 作为内置 id 的断言，改用 `su`/合成 targetBuiltIn | 阻断 A1 测试修改 |
| P1-R-10~13 | 编排/桌面窗口 | 建议性修正；不阻断，但 P1-R-10 的等价性测试建议随 A1 一并落地 | 否 |

- **A1/B1 在修订并复审前均不得写产品代码**。A1 的契约冻结必须在本轮修订后重新提交（新行数/SHA-256），B1 只按新冻结形状消费。
- 若修订过程中出现授权矩阵、advisory 语义、写集、档位或客户确认范围的实质变化，立即停止并回报统筹/沟通；按方案 §9.3 / 团队计划 §5.4 重开相应闸门。本记录不批准任何此类变化。

## 7. 总体结论

**`needs revision`。**

- R1 调用协议核心、`targetExists` 兼容形状、advisory 主路径、B1 锚点三分、模块字段、写集/非目标、证据计划均可接受或有条件接受。
- 阻断复审的问题集中在：R2 advisory 组合与 legacy 事实（P1-R-01/02）、A1 调用图文本（P1-R-03）、R3 tier ① 匹配（P1-R-04）、会话层 target=chief 防御（P1-R-05）、B1 测试夹具与覆盖（P1-R-06/07）、A1 `liaison` 测试假设（P1-R-09）。
- **不是 `not ready`**：未发现需要重开闸门 1/2 的方案/写集/档位实质变化；若 §5.3 的字段扩展被统筹/沟通按严格字面否决，则转为停止回报事项，由统筹决定是否重开，不由 A1/B1 自行扩大。
- **不是 `recommend approval`**：上述阻断项未修订前，A1/B1 不能进入产品代码阶段，也不能把本轮提案作为实施依据。

## 8. 未解决项、限制与复审要求

### 8.1 未解决项

1. **§5.3 字段扩展的治理解释**：本记录按「实施级可选事实扩展」接受；若统筹/沟通/V1 所有者要求严格按 §5.7 字面，需在 A1 实施前给出决定并记录，不得由实施者自行处理。
2. **R4 文档更正**：方案 §13 仍引用 P1.0 复核快照（101 行 / `232c4b1c…`）并写「仍未解决的意见：无」；按团队计划 §6.4 由策划作者在提交前/实施前做编辑性更正，或在实施记录中列为遗留文档项。P1 不自行修改 `docs/planning/`。
3. **H1 状态**：`角色卡/桌面窗口/boundary.md`/`boundary.yaml` 已含 B-1/B-2 条目；changelog 由人事/统筹确认；H1 是治理变更，不计入产品候选。
4. **E2E 可运行性**：B0 只记录 Electron/E2E 存在性；D2 需按团队计划/ V1 取证或如实记录不可用原因。
5. **未验证**：未运行 A1/B1 任何测试；B0 的 39/50/3358 基线是实施前事实，不证明提案实现可行；R1 的硬拒绝零副作用、R2 的 pin 失败锚点、R3 的证据范围均需实施/ D1 实际验证。

### 8.2 复审要求

- A1/B1 修订后，提交**新的**行数与 SHA-256；本记录只对 §1 冻结版本有效，修订版需重新核对受影响项并更新结论。
- 复审至少覆盖：P1-R-01~09 的落点、A1/B1 调用图一致性、R2 三类 handoff 测试、R3 正/负例、B1 测试夹具、A1/B1 写集仍无扩张。
- 若修订只涉及本记录列出的文本/测试计划项，不重开闸门；若触及方案语义/写集/档位/客户确认范围，按团队计划 §5.4 停止并回报。
- 本记录不代替 V1、不代替 D1/D2 证据、不代替独立验收；P1 审核通过只表示实现提案可进入实施，不表示 A1/B1 已实施或已通过验收。

---

**本文件状态：P1 审核记录（含 Revision 1/2 复审）；Revision 2 复审结论 `recommend approval`；未运行测试、未实施、未验收、未 commit/push。**

---

# Revision 2 复审（2026-11-02）

## R2.1 复审对象与基线

以下行数与 SHA-256 为本次复审时实测，与提交复审的消息一致；Revision 1 版本已被取代，本复审节只对下列版本有效。

| 对象 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A1 提案 Revision 2 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md` | 707 | `75a184b27d0b0941367eeb2107c16e1aab13535a1876b7895c48e8ccc9f212e7` |
| B1 提案 Revision 2 | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md` | 535 | `4dcb1ecab5bdfe3ddc19db243f1b83a8f4acbb2eba758716d5388e4a76f3c168` |
| 客户确认方案 P1.1 | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 团队计划 v1 | `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| V1 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` |
| 独立复核 | `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |

- 代码基线：HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；`git status --porcelain -- src app test` 为空；未运行测试/应用/E2E；未修改 A1/B1、产品源码或测试。
- 复审方式：只读核对 Revision 2 相对 Revision 1 的变更、剩余项落点、已关闭项是否回退；未运行实现代码或测试。

## R2.2 逐项关闭情况

| 编号 | Revision 2 落点 | 复审结果 |
| --- | --- | --- |
| P1-R-04-R1（B1 verifier creator） | B1 §4.1/§4.2、§12 | **已关闭**：verifier creator 改为 `created.from === "chief" || "convener"`；项目 worker 明确仅 `convener`，`chief` 来源的 implementer 任务不得进入 tier ①；creator 不匹配负例改为 `to=implementer`、`from="chief"`；新增 chief→verifier、无 flow、带 modulePaths 的正例。 |
| P1-R-08-R1（roles/modules undefined） | A1 §5.3 第 4/5 行、§6.2、§9.3；B1 §3.1 决策矩阵、§3.2 第 3/4 条、§3.3、§12 | **已关闭**：A1/B1 统一为保守口径——`run.roles === undefined`/`run.modules === undefined` 视为无事实，不产 `run-role-missing`/run 专属 `module-missing`，不锚定该 pinned run；B1 不在会话层补产；B1 证据记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制。B1 §3.1 已改为「无效 pinned 不传 `run`、只传 `runFacts`」，A1 不需要额外抑制规则。 |
| P1-R-15（A1 规则 2） | A1 §5.1 规则 2、§9.3 | **已关闭**：改为「链级 `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；run 专属 `run-role-missing` 用 `run.roles`、run 专属 `module-missing` 用 `run.modules`（pinned），不覆盖 latest 链级判定」；冻结声明同步。 |
| P1-R-14（B1 A1 依赖快照） | B1 §1.2、§2.1、§10.2、§12 | **已关闭**：B1 已把 A1 依赖从旧 588/b007b388 更新为 Revision 1 684/2d7335d8，并注明 A1 工作树已进一步修订至 707/75a…、最终哈希以 A1 退出报告冻结版为准；B1 开工时复测并绑定 `workflow-preconditions.ts`/`dispatch-advisories.ts` 两文件 blob+sha256。 |
| P1-R-16（§5.7 说明/B1 措辞） | A1 §9.3；B1 §3.1 | **已关闭**：A1 §9.3 已补「为何 `runFacts`/`versionedDocBaselineViolations`/`run.modules` 超出方案 §5.7 字面清单」及严格字面否决即停止回报的口径；B1 §3.1 已改为无效 pinned 不传 `run`、只传 `runFacts`。 |
| P1-R-01/02/03/05/06/07/09 | Revision 1 落点 | **未回退**：A1/B1 的 R2 组合、legacy advisory/锚点分离、调用图、`:6086` 收窄、文件型模块夹具、测试覆盖、`liaison` 修正均保持。 |
| P1-R-10~13 | Revision 1 落点 | **未回退**：type-only 说明/路径等价性、窄类型措辞、`chiefRoleId === null` 笔误/决策矩阵、旧用例映射均保持。 |
| PM §5.2/§5.4 | Revision 1/2 落点 | **未回退**：`targetExists` 复合可选/窄必填、私有唯一 `resolveTargetExists`、B1 显式 boolean；advisory 唯一产出点为 A1 collector，B1 不另写同类。 |
| 调用图/写集/边界/非目标 | A1 §3.2/§7；B1 §2.2/§8 | **未回退**：A1/B1 调用图仍为「硬授权 → 事实 → run 只读/记账（含 handoff pin）→ 版本基线 → collector → task.created → 投递」；A1 写集仍为 `src/common/编排/{workflow-preconditions,dispatch-advisories,mechanical-rejection}.ts` + 两个 `test/编排/` 文件 + 自身证据/api-spec/memo；B1 写集仍为 `app/desktop/session.ts` + 7 个既有桌面测试 + 自身证据/api-spec/memo；未列 `src/provider/runtime/schema.ts`、`app/main.ts`、renderer、task-state schema、handoff.ts 等；F4 不改、R4 只引用、i18n 默认不新增 key；H1 的 B-1/B-2 已落盘且不计入产品候选。 |

## R2.3 非阻断备注

- B1 §10.1 风险 1 仍写「A1 Revision 1 684…剩余 P1-R-15/08-R1 需 A1 修订并最终冻结」。A1 Revision 2 已修订这两项；B1 在实施记录/证据中应更新为 A1 最终冻结版（当前工作树 707/75a…，最终以 A1 退出报告为准），并把该行改为「等待 A1 最终冻结/绑定两文件哈希」。不影响实现口径，属文档同步。
- A1/B1 文件头与本复审记录引用的是上一轮 323 行 / `597a5859…` 快照；本复审追加后审核记录行数/哈希会变化，这是历史快照引用，不是错误；实施记录应引用本 Revision 2 复审后的记录哈希（由交付报告给出）。
- A1 §8.1 标题仍写「revision 1 已落入」，内容已包含 Revision 2 口径；属标题文字滞后，可在实施记录中顺手更正，不影响契约。
- 未运行 A1/B1 任何测试；B0 基线（39/50/3358）仍是实施前事实，不证明实现可行。A1/B1 的 typecheck/测试/证据均待实施与 D1 验证。

## R2.4 Revision 2 复审结论

**`recommend approval`。**

- Revision 2 已闭合 Revision 1 复审的剩余阻断项：P1-R-04-R1、P1-R-08-R1、P1-R-15、P1-R-14、P1-R-16；P1-R-01/02/03/05/06/07/09、P1-R-10~13、PM §5.2/§5.4、A1/B1 调用图一致性、写集/边界/非目标/F4/R4/i18n 均未回退。
- **A1/B1 可进入实施**：A1 可按 §9.3 冻结最终契约并运行其两个单测 + typecheck；B1 在 A1 最终冻结、H1 完成、P1 审核通过后按冻结形状接线并更新 7 个桌面测试。B1 开工时必须绑定 A1 最终冻结的 `workflow-preconditions.ts`/`dispatch-advisories.ts` 两文件 blob+sha256。
- 本结论是 P1 实现提案审核建议，**不代替 V1、不代替客户实施授权、不代替 D1/D2 证据、不代替独立验收、不授权 commit/push/merge/release**。A1/B1 的实际 typecheck、测试、T3 全量与验收仍按团队计划/V1 执行；若实施中出现方案/写集/档位实质变化，停止并回报统筹。
- 未解决项：仅 R2.3 的文档同步（B1 §10.1 风险 1、A1 §8.1 标题、历史快照引用）与实施前 A1 最终冻结/B1 绑定哈希；均不阻断进入实施。若上述文档同步发现契约语义变化，按团队计划 §5.4 处理。


---

# Revision 1 复审（2026-11-02）

## R1.1 复审对象与基线

以下行数与 SHA-256 为本次复审时实测，与提交复审的消息一致；原审核节 §1 的 revision 0 版本已被取代，本复审节只对下列版本有效。

| 对象 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A1 提案 Revision 1 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md` | 684 | `2d7335d89b170af42f5ef8979b27f201ebedf3629f8078859c47680012e0a131` |
| B1 提案 Revision 1 | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md` | 528 | `aef0c4cc5a913e30597093a8d5036dfa8ac3915a4c65c7d0f34e58d40db2f284` |
| 客户确认方案 P1.1 | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 团队计划 v1 | `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| V1 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` |
| 独立复核 | `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |

- 代码基线：HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；`git status --porcelain -- src app test` 为空；未运行测试/应用/E2E；未修改 A1/B1、产品源码或测试。
- 复审范围：原审核记录 §6/§8.2 与提交复审消息的 11 项；重点核对 P1-R-01~09、PM §5.2/§5.3/§5.4 裁决、调用图一致性、A1 冻结声明与 B1 证据绑定。

## R1.2 逐项关闭情况

| 编号 | Revision 1 落点 | 复审结果 |
| --- | --- | --- |
| P1-R-01 | A1 §5.1 规则 6、§5.3 第 2/3 行、§5.5、§6.2、§9.3；B1 §2.1、§3.1 决策矩阵、§3.3、§7.2、§7.4、§7.9 | **已关闭**：A1 删除互斥，`pinFailed=true` 至少报 `run-pin-failed`，run 仍 draft 时同时报 `run-pin-required`，顺序固定；B1 测试/矩阵已同步。 |
| P1-R-02 | A1 §2.1 `run` 注释、§5.1 规则 3、§5.3 第 1 行、§5.5、§6.1/§6.2/§6.3、§9.3；B1 §2.2 第 9 条、§3.1 决策矩阵、§3.2、§3.3、§7.4 | **已关闭**：`run.state="legacy"` 仅作 advisory 事实，任务锚点仍用本地 draft；B1 补 legacy flow 会话测试。 |
| P1-R-03 | A1 §3.2 重排、§3.3 对齐说明、§9.3；B1 §2.2 | **已关闭**：A1/B1 调用图一致为「硬授权 → 事实 → run 只读/记账（含 handoff pin）→ 版本基线 → collector → `task.created` → 投递」；collector 能拿到版本违规。 |
| P1-R-04 | B1 §4.1/§4.2 | **部分关闭**：tier ① 已改为 `created.to` + `created.flowId===undefined` + `created.moduleId!==undefined` + creator 兼容集合，直接纳入 `created.modulePaths`、不以 roster 为门槛；tier ②/③ 与 fail-closed 保留；补了 roster 漂移/creator 不匹配/无根用例。**剩余 verifier creator 集合问题见 P1-R-04-R1。** |
| P1-R-05 | B1 §2.2 第 6 条、§2.3、§7.2；A1 §3.2 第 2 步引用 | **已关闭**：`:6086` 收窄为仅 `fromRoleId === targetRoleId`；convener→chief 交矩阵返回 `convener-target-forbidden`，并有测试落点。 |
| P1-R-06 | B1 §5、§7.1 | **已关闭**：文件型模块夹具改为不与 `src/`、`test/` 重叠的路径（如 `scripts/build.mjs`），并断言 `parseProjectRoster` 成功、任务不写 `moduleDirectory`。 |
| P1-R-07 | B1 §2.3、§7.1–§7.4、§7.6、§7.9、§10.2 | **已关闭**：(a) star 目标不存在；(b) pinned 哈希/roster 会话级；(c) legacy flow；(d) 诊断捕获/洁净零噪声；(e) M1/M2 同文幂等；(f) 负向源码钉精确正则或移除；(g) wrong-source 桌面证据均已列入。 |
| P1-R-08 | A1 §2.1 `run.modules?`、§5.3 第 5 行、§5.4、§6.2、§9.3；B1 §2.1、§3.1 决策矩阵、§3.2、§3.3、§12 | **部分关闭**：`run.modules?` 最小可选事实已加入，run 专属 `module-missing` 有正/负例。**但 roles/modules `undefined` 时 A1 与 B1 口径冲突，见 P1-R-08-R1；A1 §5.1 规则 2 的「module-* 永远用 latest」与 run 专属 `module-missing` 冲突，见 P1-R-15。** |
| P1-R-09 | A1 §2.3、§4.1、§4.2、§6.1 | **已关闭**：`liaison` 明确为非内置（`chief-to-project-forbidden`）；真实 `target-card-missing` 用 `su`，未知内置用 synthetic `targetBuiltIn:true`。 |
| P1-R-10 | A1 §2.4、§6.2、§9.3；B1 §2.1 | **已关闭（建议项）**：type-only 环说明、路径等价性测试已加；未抽共享 helper，符合写集。 |
| P1-R-11 | A1 §2.1、§9.3；B1 §2.1 | **已关闭（建议项）**：窄类型为窄步骤公开签名；不再要求「函数第一行」源码钉。 |
| P1-R-12 | A1 §2.2、§5.5；B1 §3.1 | **已关闭（建议项）**：`chiefRoleId === null` 笔误已改；handoff 决策矩阵已加。 |
| P1-R-13 | B1 §7.5、§7.9、§12 | **已关闭（建议项）**：旧用例逐条新落点映射表已加；三模式/无会话/提案卡覆盖归属明确。 |
| PM §5.2 `targetExists` | A1 §2.2/§2.3/§6.1/§6.2/§8.1/§9.3；B1 §2.1/§2.2/§2.3/§7.3 | **已关闭**：复合可选、窄必填、私有唯一 `resolveTargetExists`、B1 显式 boolean、兼容窗口与测试均已落文。 |
| PM §5.3 `runFacts`/版本字段 | A1 §2.1、§8.1、§9.3；B1 §2.1/§2.2 | **基本关闭**：可选、不读盘/不推断/不影响硬授权、唯一产出点已写明；A1 §9.3 尚未逐字说明「超出 §5.7 字面清单」的理由（P1-R-16 建议补一句，不单独阻断）。 |
| PM §5.4 advisory 唯一产出点 | A1 §2.1/§2.4/§3.2/§8.1；B1 §2.1/§2.2/§6.4/§6.7/§12 | **已关闭**：B1 明确采用主路径，备选不再保留；文案/诊断/去重只在 A1 collector。 |
| A1/B1 调用图一致性 | A1 §3.2/§3.3/§9.3；B1 §2.2 | **已关闭**：逐项一致。 |
| A1 冻结声明/B1 证据绑定 | A1 §9.3；B1 §10.2 | **部分关闭**：A1 冻结声明覆盖新形状；B1 §10.2 说 B1 退出时绑定 A1 两文件哈希。**但 B1 §1.2/§2.1 仍引用旧 A1 588/b007，未更新到 A1 Revision 1 684/2d7335，见 P1-R-14。** |

## R1.3 剩余问题与精确修订要求

### P1-R-04-R1（重要，阻断 B1）：verifier 的 creator 兼容集合过窄

B1 §4.1 tier ① 目前把 `roleId === "verifier"` 的 creator 限定为 `created.from === "convener"`。但方案/角色文档明确「质检由运营发起或幕僚调度」，且 `evaluateDispatchAuthorization` 允许幕僚（chief）直接派 verifier；`task.created.from` 对 chief 来源写 `"chief"`。因此 chief→verifier 的无 flow 锚点任务会被排除在证据根之外，属于 R3 的「有根误空」风险，也影响 AC-5.3/AC-5.6 对 verifier 任务模块证据的保护。

**精确修订**：
- B1 §4.1 tier ① 的 verifier creator 集合改为 `created.from === "chief" || created.from === "convener"`；其它内置目标仍 `"chief"`；项目 worker 仍 `"convener"`。
- B1 §4.2 的「creator 不匹配负例」不能再用 `to=verifier, from="chief"`（修正后这是合法组合）；改用 `to=implementer`（项目 worker）、`from="chief"`、无 flow、带 modulePaths 的记录作为不匹配负例，并断言该记录不贡献根。
- 补一条 chief→verifier、无 flow、带 moduleId/modulePaths 的正例：任务保留模块元数据，`scopeRoots` 非空且包含该路径。
- 若 B1 坚持 verifier 只接受 convener，必须引用已确认规则说明 chief→verifier 任务不可能/不应作为证据来源；当前方案与角色文档不支持该限制，不采纳。

### P1-R-08-R1（重要，阻断 A1+B1）：roles/modules `undefined` 口径冲突

A1 与 B1 对「pinned manifest 未声明 roles/modules」选择了相反行为：

- A1 §5.3 第 4 行：`run.roles !== undefined` 且不含目标才产 `run-role-missing`；`run.roles === undefined` 时**不产出**（不伪造 roles）。A1 §5.3 第 5 行：`run.modules !== undefined` 且不含模块才产 run 专属 `module-missing`；`run.modules === undefined` 时**不产出**。A1 §6.2 测试也按「undefined → 不产出」。
- B1 §3.1 决策矩阵：`run.roles === undefined` → `run-role-missing`（message 明示「未声明 roles，无法证明覆盖」）；`run.modules === undefined` → `module-missing`（message 明示「未声明模块清单」）。B1 §3.2 第 3/4 条、§3.3 第 239 行、§12 P1-R-08 行也按「产出」写。

A1 是 collector 的唯一产出点；B1 不能再在会话层补 code。两者不一致会导致 B1 测试期待 A1 不产出的 advisory，或迫使 B1 违规写第二套文案。

**精确修订（推荐方案）**：对齐 A1 的保守口径——`run.roles === undefined`/`run.modules === undefined` 视为「无事实」，不产 `run-role-missing`/run 专属 `module-missing`；任务不锚定该 pinned run，B1 在证据/实施记录中记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制。B1 必须同步修改：
- §3.1 决策矩阵两行（删除「或 undefined」分支）；
- §3.2 第 3/4 条（roles/modules 缺失时不产 code，只不锚定）；
- §3.3 第 239 行（测试断言改为「不产 code + 不锚定 + 证据记录限制」）；
- §12 P1-R-08 行（状态改为「按 A1 无事实口径对齐」）；
- §3.1 第 213 行的「collector 只报对应 run advisory、不再报 run-role/module」建议改为「B1 在无效 pinned 时不向 collector 传 `run`，只传 `runFacts`」，避免给 A1 增加一条未写入契约的抑制规则。

**备选**：若 B1 希望保留「undefined → 产出」并带诚实 message，则 A1 必须修订 §5.3 第 4/5 行与 §6.2 测试，明确「undefined 也产出对应 code、message 说明无法证明覆盖」；A1/B1 重新冻结后复审。推荐前一种（A1 现状），改动更小且避免把「未知」写成「缺失角色/模块」。

### P1-R-15（一般，阻断 A1 文本/冻结）：A1 §5.1 规则 2 与 run 专属 `module-missing` 冲突

A1 §5.1 规则 2 仍写「`target-not-nominated`/`d3-*`/`roster-*`/`module-*` 永远用 latest」；但 A1 §5.3 第 5 行新增的 run 专属 `module-missing` 使用 `run.modules`（pinned 事实），不是 latest。B1 §3.1/§3.2 也按 run 专属 pinned 模块事实实现。该总则会让实现者误用 latest roster，导致 run 专属 `module-missing` 不产生或误报。

**精确修订**：A1 §5.1 规则 2 改为「链级 `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；run 专属 `run-role-missing`/`module-missing` 分别用 `run.roles`/`run.modules`（pinned），不覆盖 latest 链级判定」；A1 §9.3 冻结声明同步该口径。

### P1-R-14（一般，需 B1 更新）：B1 依赖快照仍引用旧 A1

B1 §1.2/§2.1 仍写 A1「588 行 / `b007b388…`」，并称 A1 需按 P1 修订后重新冻结；A1 Revision 1 已是 684 行 / `2d7335d8…`。B1 的代码块已采用 `run.modules?` 等 A1 Revision 1 形状，但依赖快照未更新，复审/实施时会产生版本追溯歧义。

**精确修订**：B1 §1.2/§2.1 更新为 A1 Revision 1 684 行 / `2d7335d89b170af42f5ef8979b27f201ebedf3629f8078859c47680012e0a131`，并写明「A1 最终冻结哈希以 A1 退出报告为准；B1 开工时复测并绑定两文件 blob+sha256」；B1 §10.2 已要求绑定，保留并明确记录 A1 Revision 1 与最终冻结的关系。

### P1-R-16（建议，不单独阻断）

- A1 §9.3 冻结声明已写「实施级扩展」，但未逐字说明「超出方案 §5.7 字面清单」及理由；建议补一句（理由同 P1 审核 §5.3）。A1 §8.1 第 3 点已有「严格字面否决即停止」的口径，冻结声明可引用。
- B1 §3.1 第 213 行的「collector 只报对应 run advisory」按 P1-R-08-R1 改为「B1 不传 `run`、只传 `runFacts`」后，A1 不需要新增抑制规则；若保留现文字，A1 需在 collector 中实现该抑制，属额外契约，不建议。

## R1.4 Revision 1 复审结论

**`needs revision`。**

- **已关闭**：P1-R-01、P1-R-02、P1-R-03、P1-R-05、P1-R-06、P1-R-07、P1-R-09；建议项 P1-R-10~13 已落实；PM §5.2、§5.4 已落实；A1/B1 调用图已一致。
- **剩余阻断项**：
  1. **P1-R-04-R1**（B1）：verifier creator 集合必须包含 chief，修正 creator 不匹配负例并补 chief→verifier 正例。
  2. **P1-R-08-R1**（A1+B1）：roles/modules `undefined` 的产出/不产出必须统一；推荐对齐 A1 的「无事实不产出、只不锚定并记录限制」，B1 修改 §3.1/§3.2/§3.3/§12；若选备选则 A1 需改契约并重新冻结。
  3. **P1-R-15**（A1）：§5.1 规则 2 的「module-* 永远 latest」与 run 专属 `module-missing` 冲突，需改总则/冻结声明。
- **非阻断但需更新**：P1-R-14（B1 依赖快照更新到 A1 Revision 1）、P1-R-16（A1 冻结声明补 §5.7 理由；B1 第 213 行措辞）。
- **是否阻断 A1/B1**：**是**。A1 需按 P1-R-15（及 P1-R-08-R1 选定口径）修订并重新冻结；B1 需按 P1-R-04-R1、P1-R-08-R1、P1-R-14 修订。修订后可再复审；若仅涉及上述文本/测试计划/事实口径，不重开闸门 1/2；若触及方案语义、写集、档位或客户确认范围，按团队计划 §5.4 停止回报。
- **未改变**：本轮复审未运行测试/应用/E2E，未修改 A1/B1 提案或产品代码；结论不代替 V1、D1/D2 证据、独立验收或实施授权。A1/B1 在修订并复审通过前仍不写产品代码。

