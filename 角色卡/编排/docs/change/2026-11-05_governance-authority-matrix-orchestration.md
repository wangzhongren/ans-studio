---
id: governance-authority-matrix-p1-orchestration
type: change
title: P1 实现提案：治理权力矩阵——编排（C3：Pipeline 取数 / 幕僚提示块 / 六角色工具门控）
created: "2026-11-05"
updated: "2026-11-05"
timezone: Asia/Shanghai
status: implemented-unverified
related: [governance-authority-matrix]
events:
  - date: "2026-11-05"
    kind: created
    summary: 写编排 C3 实现提案（proposal-only；未改产品/测试代码；未 commit/push；依赖 C1a+C1b+C2 冻结后实施）
  - date: "2026-11-05"
    kind: revised
    summary: Revision 1 处置项目管理 P1 审核 O-1–O-4（枚举失败载体改 roleDirectories.error；worker 显示名改 cardSections.title→WorkerRoleInput.displayName；删除 roleDirectories 猜测回退；上限常量改从 C1b 导入）并对齐 R-5/R-6/R-7；只改本文件
  - date: "2026-11-05"
    kind: status-closed
    summary: 文档状态收口为 implemented-unverified（E2：AC-1–AC-17 pass，唯一 fail=AC-18 文档状态；候选快照 839b922f…；T2 typecheck 0、T3 4,130/4,103/9/18、新增失败/skip=0；E2 报告 169 行 / fe983bc2…）；未 verified、未 commit/push
---

# P1 实现提案：治理权力矩阵——编排（C3）

- **角色/节点**：编排（Orchestration）/ `2026-11-05-governance-authority-matrix` / **P1 实现提案（C3）**，风险档位 **T3**（随任务定档，不降档）。**Revision 1（处置 PM P1 审核 O-1–O-4，并对齐 R-5/R-6/R-7）**。
- **PM 审核依据（只读）**：`角色卡/项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md`：**358 行 / SHA-256 `0128f615a7cfe52df36351036f4246d1b91efc236c7cce3852325639eccc762f`**（本修订写盘前实测）。批次结论 `needs revision`（非驳回）；编排必改项 O-1–O-4；跨提案裁决 R-1–R-14 同时生效。
- **审核依据**：待项目管理按 `references/proposal-review.md` 复审本修订（对照客户确认的 P1.1 与团队计划 §4.3 C3、§5.1/§5.2、§6）。本提案**不是**客户批准、不是实施授权、不是验收结论。
- **状态**：**implemented-unverified（文档状态收口）**。提案阶段为 `proposal-only`；实现已完成（见 `2026-11-05_governance-authority-matrix-orchestration-implementation.md` **89 行 / SHA-256 `06bde83bf5c649f02de0436611fd7b36ee81fc0384be0a8d248fefc8a276a7dc`**），E2 判定 **AC-1–AC-17 全部 pass**，唯一 `fail` 为 **AC-18「文档状态收口」**；本次仅做文档收口，**不写 verified**、未 commit/push。实现候选快照 `839b922f…`；T2 证据：`npm run typecheck` exit 0、T3 全量 **4,130 / 4,103 / 9 / 18**、新增确定性失败与新增 skip 均为 **0**；E2 报告 `docs/acceptance/governance-authority-matrix-report-v1.md`：**169 行 / SHA-256 `fe983bc22d58e3faf9b2e80fc3c90f4293f01188c141deba76a09e80c74db885`**。
- **实施契约基线（唯一）**：`docs/planning/2026-11-05_design_governance-authority-matrix.md` **P1.1**：**1056 行 / SHA-256 `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`**（本提案写盘前实测，与闸门 1/团队计划/V1 记录一致）。AC 以 P1.1 §6 **AC-1–AC-18** 为准；本角色证据只覆盖其中列明的子集（§6）。
- **执行安排**：`docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`：**660 行 / SHA-256 `07378444cb62fc714a7cce0a492ce5a12b5b7d0a0868f4602edb0be134fc7805`**（写盘前实测）。C3 写集/依赖/出口以该计划 §4.3（编排）与 §5.1/§5.2 为准。
- **验收标准**：`docs/acceptance/governance-authority-matrix-criteria-v1.md`：**327 行 / SHA-256 `f672052882f4937eac69fed617c309bb6cc6d4ed0cc68f280fe280797a5f3a2f`**（写盘前实测）。AC 行文以 V1 §三 为准；本提案只声明本角色证据贡献，不替代 E2 判定。
- **闸门与授权记录**：`docs/communication/2026-11-05_intent_governance-authority-matrix.md`：**76 行 / SHA-256 `b8d7a18f38b86ae366f7ec1302f061bc2e478943025256161631758239eb3bbb`**（闸门 0/1/2 + IA + V1 核对；写盘前实测）。
- **B0 基线（只读引用）**：`角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-B0-baseline.md`：**323 行 / SHA-256 `a51c466eab3c4e8984d9776be387b6901a0be6ad6b04b46c77443567bf4c4355`**（写盘前实测；其记录的 HEAD 为 `7ba8a33`，与本提案写盘时的 HEAD 存在漂移，见 §9-D5）。
- **标注**：`[事实]` 只读核对；`[设计候选]` 未实现的提议；`[交接]` 依赖其他角色冻结件；`[停止项]` 必须回报统筹/审核，不得自行扩大。
- **授权范围**：本提案只落在 `角色卡/编排/boundary.md` Section 1 已确认的 `src/pipeline/orchestration/run-role.ts`（单文件）与 `test/编排/`（目录）内；**无边界变更**（团队计划 §3.2/§4.1/§4.5：只有门禁引擎 B-1/B-2）。不提出任何新路径/角色/权限。

### Revision 1 处置摘要（PM 审核 O-1–O-4）

| 项 | 处置 | 落点 |
| --- | --- | --- |
| **O-1** 枚举失败载体 | **采纳 R-2**：统一消费 `MatrixRoleDirectories.error`（`roleDirectories.error?: string`）；删除 `listingError` 方案；枚举失败时传 `{found:false,totalDirs:0,archivedSkips:0,error:<message>}`；「项目根不可读 / 无目录 / 全坏目录」映射见 §3.1；`role-enumeration-failed` 仅作 C1b 生成的原因码，不成为第二输入字段 | §3.1-1、§9-D1 |
| **O-2** worker 显示名 | **采纳 R-3**：`ProjectRoleSummary.cardSections.title` 为唯一解析来源，C3 填入 `WorkerRoleInput.displayName`；组装器只读 `WorkerRoleInput.displayName`；缺 H1 ⇒ `unknown(not-declared-in-source)` | §3.1-3、§9-D3 |
| **O-3** 删除猜测回退 | **采纳**：删除 `roleDirectories ?? 保守回退`；字段缺失视为**契约违约**，记诊断并按降级/不可用诚实处理；不用 `workerRows.length>0 || warnings.length>0` 猜 `found` | §3.1-1、§9-D1 |
| **O-4** 上限常量 | **采纳 R-4**：16000/48000/1500 等从 **C1b 公共入口导出的命名常量**导入，`run-role.ts` 不写死字面量；三个使用点见 §3.2/§3.3；C1b 未导出则先回 C1b 补 | §3.2、§3.3、§9-D4 |
| 对齐项 | R-5（`contextSections` 单一通道与空值语义）、R-6（判断会话防御）、R-7（空串元素过滤）只影响注入表述：C3 仅在非空时传**单个**段，非 chief 缺席（不传 `[]`/`[""]`）；判断会话结构性不注入，适配器另有防御（C4 落） | §3.2、§3.4、§9-D12 |

> 本修订未扩大写集；D2/D5/D5b/D6/D7/D8/D9/D10/D11 按 PM §七.4 采纳，维持原表述（基线更新至 `ebbc2fc`）。

## 0. 结论摘要

[设计候选] 编排在 C3 只做**取数、注入与门控**三件事，不做矩阵组装/渲染（C1b 纯 Service）、不做提示拼接（C4a/b/c）、不定义契约形状（C1a/C2）：

1. **Pipeline 取数**（仅 `governanceModel==="trio"` 且会话角色是六个内置治理角色之一、且在需要时）：`openRoleSession` 调 `listProject(projectRoot)` 枚举 worker（`filter(!builtIn)`）与 issues/warnings/roleDirectories；对**可解析角色**（内置六角色，或 `project.roles[roleId]` 存在）经 Service 公开出口 `resolveBoundary(roleId, project)` 取 `.acceptance`；worker 卡章节只消费 `listProject` 返回的共享结构化解析结果（`cardSections` 等，C1a）；`TRIO_CARD_KINDS` 作为**快照**按 `GOVERNANCE_CONFIRM_CARD_KINDS` 拆成 `cardKindsByRole`；`initiationByRole` 由本文件既有角色门控派生；会话标志取本会话真实注入状态。**纯矩阵 Service 不调用任何 Service、不读盘**——所有数据由 Pipeline 供给。
2. **幕僚必读块**：`trio + built-in-governance + chief` 时，在 `adapter.bindRole` 前计算**一次**，经 C2 的 `contextSections` 通道交给适配器；文本由 C1b 渲染器生成（数据化分隔、固定句、提示注入限长均在渲染器内实现），编排只传 C1b 导出的提示上限常量 `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`（16000）与非空才拼；矩阵不可用时注入简短「矩阵不可用（原因）；不得据此推断权限」，**不阻塞会话**；不自动改写系统提示。
3. **六角色只读工具**：仅 trio 六个内置治理角色注入 `governanceMatrix` 能力（`注入才注册`）；**五个非幕僚启动时不计算**；工具 handler 每次调用**重新取数 + 纯组装/渲染**（`maxChars` = C1b 导出的 `GOVERNANCE_MATRIX_TOOL_MAX_CHARS`，48000）；参数只接受 `roleId`/`section`，未知 roleId/非法 section/多余字段一律 `ok:false` 且不回显未列出的角色/路径/能力值；工具只读，不写盘、不写账本、不产生 trunk/VCA/stable-write 事件。
4. **不注入**：worker 项目角色、`su`（single 旧模型）、判断会话（shell judge / governance judge，结构性不经过 `openRoleSession`）、`runRole` 一次性 CLI 路径（保持 `createAdapter(gate)` 无能力注入，逐字不变）。
5. **零权限影响**：矩阵能力不进入 `gate`、派发预检、客户卡校验、冻结/trunk/VCA/stable-write 判定；`TRIO_CARD_KINDS` 仍是本文件唯一 role→cardKind 来源；不新增角色/卡种/能力位语义。

**一句话**：编排把「谁取数、何时注入、给谁注册工具」做成 `openRoleSession` 内的一处惰性实现：取数用既有 Service 公开出口，组装渲染交给 C1b 纯 Service，提示与工具面交给 C2/C4；worker/su/判断/CLI 一次性路径零变化。

## 1. 事实基线（只读核对，2026-11-05，HEAD `ebbc2fc`）

### 1.1 基线与输入（本 worktree 实测）

| 项 | 值 |
| --- | --- |
| 工作区 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（未切换目录） |
| 分支 / HEAD | `feat/governance-authority-matrix` / **`ebbc2fcffcc5cd1c2163db72bcfb1c03d599e3e6`**（Merge PR #66；与本地 `origin/main` 相同） |
| 产品/测试区 | 本修订写盘前实测 `git status --porcelain -- src app test` **空（0 条）**、`git diff --cached --name-only` **空**；提案初版写盘时的并发 VCA 改动（`run-manifest.ts`、`version-change-runtime.ts` 及两个测试）已合入 `c3e50f5`/`ebbc2fc`，当前无并发源码改动（见 §9-D5b） |
| 方案 P1.1（唯一实施契约基线） | 1056 行 / `1f6518b8…`（§1 头部已列） |
| 团队计划 | 660 行 / `07378444…`（同上） |
| V1 实施前标准 | 327 行 / `f6720528…`（同上） |
| 闸门 0/1/2 + IA 记录 | 76 行 / `b8d7a18f…`（同上） |
| PM P1 审核记录 | 358 行 / `0128f615…`（批次 `needs revision`；编排必改 O-1–O-4；R-1–R-14 裁决） |
| B0 基线 | 323 行 / `a51c466e…`；其中 HEAD 为 `7ba8a33`（**已漂移**：本修订写盘时 HEAD 为 `ebbc2fc`，经 `dc21fc1`/PR #65 与 `ebbc2fc`/PR #66，见 §9-D5） |
| Node / npm | `v24.22.1` / `11.19.1`（B0 记录同值；实施时 B0 重记须复测） |
| 任务配置 | 无 `.ans/project.json`（未启用 task_ops；不伪造任务令牌/审批/锁/预检记录） |
| 依赖状态 | `node_modules` 已安装（B0 实测可加载；实施入口按团队计划重记 B0） |

### 1.2 关键现状锚点（以符号/文本为准；行号为 `ebbc2fc` 快照锚点，`run-role.ts` 未受 PR #65/#66 影响；实施时以符号为准）

[事实] 1) **两条会话路径**：`src/pipeline/orchestration/run-role.ts`（2622 行 / SHA-256 前缀 `121f47d7169007c0`）头部即写明：`runRole`（`:368`，CLI 一次性：解析 → gate → adapter → `bindRole` → prompt 一轮）与 `openRoleSession`（`:567`，桌面会话句柄多轮）。本特性只接 `openRoleSession`；`runRole` 的 `createAdapter(gate)`（`:419`）无 capabilities。

[事实] 2) **角色/边界解析**：`openRoleSession` 先 `setupRole`（`:785`；实现 `:1890-1921`，内部 `resolveRole` + `resolveBoundary` 公开出口）。`resolveRole`：`src/service/role/resolve-role.ts:48`；`listProject`：同文件 `:264`，返回 `ProjectListing`（`:130`，含 `roles`/`warnings`/`hasRoles`/`primaryRoleId`/`governanceModel`），`roles` **前部含六个内置角色**（`:404-432`），worker 行在 `:373` 进入。`resolveBoundary`：`src/service/boundary/resolve-boundary.ts:9`（薄再导出，同源委托私有 `resolveBoundarySection`，`boundary-core.ts:572`）。`run-role.ts` 当前**已导入** `resolveRole` 与 `resolveBoundary`（`:73-74`），**未导入** `listProject`。

[事实] 3) **角色卡章节现状**：worker 卡文本由 `listProject` 读取并经 `parseRoleGroupMetadata(cardText)`（`resolve-role.ts:373`）解析组别；**尚无**结构化章节字段（`cardSections` 由 C1a 加法）。`角色卡/门禁引擎/api-spec.md:68` 明确消费者不得导入私有解析器、不得自行解析 `cardText`——编排不解析。

[事实] 4) **能力注入点**：`openRoleSession` 在 `:1540-1582` 组装 `AdapterCapabilities`（`interface` 定义 `:259`），在 `:1583-1590` 经 `createAdapter(...)` + `adapter.bindRole(setup.role)` 建会话。`createRuntimeAdapterFactory`（`:2481-2559`）把能力位逐字映射进 `createRuntimeAdapter` 的选项；`createRuntimeAdapter`：`src/service/runtime/session.ts:142`，普通会话走 `buildGovernedTools`（`:190`）。

[事实] 5) **卡种单一来源**：`TRIO_CARD_KINDS`（`:2200-2219`；chief `intent-confirm`、product `[]`、rapporteur `proposal`/`decision`、nominator `appointment`/`appointment-write`、convener `decision`、verifier `acceptance`）；`GOVERNANCE_CONFIRM_CARD_KINDS`（`:2291`，`["appointment-write"]`）；`TRIO_CARD_ORIGINATORS`（`:2225`）由前者反推。卡种白名单在 `governedInput` 包装器内判定（`:974-1095`、`:1220`）。

[事实] 6) **既有发起门控**：`requestRequirementChange` 仅 rapporteur/convener（`:1527-1530`）；`projectNote`/`requestVersionDecision` 仅 chief（`:1420-1421`）；`submitVersionChange` 仅 product/rapporteur、`submitRefactor`/`requestStableWrite` 仅 convener（`:1535-1538`）。Model 常量 `VERSION_CHANGE_INITIATOR_BY_KIND`（`src/model/version-change.ts:53`）与 `REFACTOR_REQUESTED_BY`（`:394`）已在 Model，矩阵直接复用，不迁移。

[事实] 7) **会话标志来源**：`governedInput` 仅 `confirmationMode`（`:826-827`）为真时存在（产品 `capabilities.customerInput=false` —— `governance-roles.ts:299-325` 注册表）；`shellGate` 在 `:1475-1524` 装配（审批档/只读档/三层链）；`shellEscalationSession` 在 `:1449-1458` 创建；`requestDownload` 按宿主注入透传（`:1553`）。这些都在 `capabilities` 组装点之前可得。

[事实] 8) **判断会话隔离**：shell judge / governance judge 由 `src/common/编排/shell-judge.ts`、`governance-judge.ts` 自建一次性会话（经 `createAdapter(gate,{persistSession:false,shellJudge|governanceJudge})`），**不经过 `openRoleSession`**，也就拿不到本特性注入的任何能力/提示段。

[事实] 9) **契约现状（C1/C2 尚未落地）**：本提案写盘前 `grep -rn "contextSections\|governance_matrix\|governanceMatrix" src/ test/ app/` **零命中**；`GovernedToolsOptions`（`src/model/runtime.ts:2604`）无 `governanceMatrix`；`RuntimeProviderOptions`（`:2818`）无 `contextSections`；`RuntimeSessionOptions`（`src/service/runtime/session.ts:38`）亦无。`src/model/governance-matrix.ts` 与 `src/service/governance-matrix/` **不存在**（待 C1a/C1b 新建；B-1/B-2 已由人事落边界）。

[事实] 10) **测试现状**：`test/编排/` 现有 79 个 `*.test.ts`（B0：905 tests / 904 pass / 1 fail=既有 Windows symlink EPERM / 0 skip）；夹具惯例见 `test/编排/chat-handback-scope.test.ts`（fake adapter 捕获 `AdapterCapabilities`）与 `test/编排/appointment-roster.test.ts:123-124`（trio `ProjectConfig` + `builtInRoles` 六角色）。当前无 `governance-matrix-injection.test.ts`。

[事实] 11) **基线漂移**：B0 记录 HEAD `7ba8a33`（PR #64）；提案初版写于 `dc21fc1`（PR #65），本修订写于 `ebbc2fc`（PR #66，`c3e50f5` 名单升级回绑）。按团队计划 §1.4/§6.3、V1 §4.2 与 PM R-12，实施入口必须更新基线并**重记 B0**，旧 B0 计数不得复用（§9-D5）。

### 1.3 只读声明

本节核对全部为只读：未运行测试/应用，未改代码/测试/角色卡/边界/方案/复核/沟通/调度/验收文档，未 commit/push。

## 2. 精确写集

> 同一文件同一时间只有本角色一个写入者。全部路径在既有 Section 1 单文件/目录内；**无新增模块根、无边界变更**。

### 2.1 产品源码（单文件）

| # | 路径 | 改动 |
| --- | --- | --- |
| 1 | `src/pipeline/orchestration/run-role.ts` | ①新增导入：`listProject`（`src/service/role/resolve-role.ts`）、`BUILT_IN_GOVERNANCE_ROLES`（既有公开再导出，用于六角色 id/acceptance 枚举）、C1b 纯矩阵 Service 公共入口与导出常量、`src/model/governance-matrix.ts` 类型（只读引用）；②`AdapterCapabilities` 新增可选 `contextSections?: readonly string[]`、`governanceMatrix?: GovernanceMatrixFn`；③新增私有的取数/构造辅助（见 §3.1）与 `createGovernanceMatrixCapability(...)`（见 §3.3）；④`openRoleSession` 内：chief 启动块（§3.2）与六角色工具注入（§3.3）；⑤`createRuntimeAdapterFactory` 两个字段同名透传；⑥诊断事件（§3.6）。**不改** `runRole`、不改既有 gate/卡种/发起门控的行为。 |

### 2.2 测试（目录授权）

| # | 路径 | 内容 |
| --- | --- | --- |
| 2 | `test/编排/governance-matrix-injection.test.ts`（新增） | Pipeline 侧注入/门控/取数/刷新/降级/注入安全/零写盘测试（§6）。 |
| 3 | `test/编排/` 既有文件（**按需**，预计不改） | 若实施证明既有提示/能力断言受加法影响，只做**加法式**更新；逐条理由与 diff 写入完成报告，**不得弱化既有断言**。 |
| 4 | `test/编排/fixtures/`（按需） | 临时 trio 项目/worker 夹具；仅当内联构造过大时新增，均在已授权目录内。 |

### 2.3 本角色文档（目录授权）

| # | 路径 | 内容 |
| --- | --- | --- |
| 5 | `角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration.md` | 本提案（当前唯一写入）。 |
| 6 | `角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration-implementation.md`（实施后，按需） | 实施记录：候选哈希、命令/退出码/计数、与提案偏差、未测项如实披露；证据如需截图按客户规则（本特性无 UI，截图非必需、禁录屏）。 |
| 7 | `角色卡/编排/api-spec.md`、`角色卡/编排/memo.md` | `openRoleSession` 的矩阵注入行为与工具门控对外表现；按既有格式追加。 |
| 8 | `角色卡/编排/feature-map.md`、`docs/feature/<feature-id>.md`（实施后按技能要求） | 当前行为说明与历史链接；不虚构功能。 |

### 2.4 不写（明确）

- **不写**：`src/model/**`、`src/service/**`、`src/provider/**`、`src/common/**`、`app/**`、`package.json`/lock/`tsconfig*`/`vite.config.ts`/`src/index.ts`/`bin/ans.js`、i18n messages、`test/项目管理/shared/**`、`test/桌面应用/**`、其他角色 `test/**`、`docs/scheduling|acceptance|communication|planning/**`、任何角色卡/边界/YAML/根 changelog。
- **不迁移**：VCA/refactor/stable-write/version-decision 既有门控；`TRIO_CARD_KINDS`/`GOVERNANCE_CONFIRM_CARD_KINDS` 留在本文件原位，**不复制第二张表**。
- **不接入判定**：`gate`、派发预检、客户卡校验、冻结/trunk/VCA/stable-write 一律不读取矩阵。

## 3. 实现设计（C3 落点）

### 3.1 Pipeline 取数：`loadGovernanceMatrixInput`

[设计候选] 在 `run-role.ts` 内新增一个**私有异步辅助**（名字候选，实施以审核结论为准）：

```ts
async function loadGovernanceMatrixInput(
  project: ProjectConfig,
  sessionFlags: GovernanceMatrixSessionFlags,
  generatedAt: string,
  log: DiagnosticLogger,
): Promise<GovernanceMatrixInput>
```

职责与步骤（对应 P1.1 §4.2.1/§5.2；**只读**）：

1. **枚举**：`const listing = await listProject(project.projectRoot)`。
   - worker 行：`listing.roles.filter((role) => role.builtIn !== true)`（F9；`roles` 含内置六角色，**不得重复算成 worker**）。
   - `issues`：`listing.issues ?? []`；`warnings`：`listing.warnings`；`roleDirectories`：**逐字透传** `listing.roleDirectories`（R-2/O-1/O-3）。三分状态由 C1b 渲染，C3 不猜：
     - **项目根不可读/枚举抛错** ⇒ `{found:false, totalDirs:0, archivedSkips:0, error:<message>}`；`error` 非空 ⇒ worker 段 `unavailable`、`status:"degraded"`，**优先于**「尚未 bootstrap」。
     - **无角色目录（正常初始态）** ⇒ `{found:false, totalDirs:0, archivedSkips:0}`（无 `error`）⇒「项目尚未 bootstrap，暂无 worker 角色」。
     - **有目录但全部解析失败** ⇒ `{found:true, totalDirs:N, archivedSkips:M}` + `issues`/`warnings`、无 `error` ⇒「角色目录存在但无有效角色（见 issues/warnings）」。
   - **枚举失败**（`listProject` 抛错：项目根不存在/不是目录、`角色卡` 路径是文件、无读权限等）：catch 后按上述第一项构造降级输入（`error` 填失败原因，消息有界、不含卡面）；`role-enumeration-failed` 只由 C1b 生成 `MatrixWarning` 原因码，**不是**第二输入字段。**内置六角色仍由注册表渲染**，会话不因此打不开。
   - **`roleDirectories` 缺失（契约违约，防御分支）**：不得猜测 `found`/计数；记诊断 `governance.matrix.contract-violation`，按上述第一项传入 `{found:false,totalDirs:0,archivedSkips:0,error:"listProject 未返回 roleDirectories（契约违约）"}`，由 C1b 按 `error` 降级渲染。该分支不在生产路径加测试缝，以代码审查/诊断事件核对（§6.2 注）。
2. **acceptance（只对可解析角色）**：对 `BUILT_IN_GOVERNANCE_ROLES` 六 id ∪（worker 行中 `project.roles?.[roleId] !== undefined` 的 id），逐个 `await resolveBoundary(roleId, project)` 并只取 `.acceptance`：
   - 映射为 `{ state:"known", accepted, evidence: acceptance.source, basis:"runtime" }`。
   - 单角色抛错：catch → 该角色 `{ state:"unknown", reason:"acceptance-unavailable", detail }` + 诊断；不影响其他角色与整体构建。
   - **不在 `project.roles` 快照中的会话中途新增角色**：不调用、不出现在 map 中；C1b 渲染为 `unknown（该角色不在开会话快照中，请重开会话）`（F5）。
   - **不**使用 `listing.roles[].boundary.acceptance`（listing 为中性占位 `accepted:false`）；**不**把 `resolveBoundary` 的 `entries` 当作 worker 声明（worker 声明只取 `listing.roles[].boundary.entries`，见 §9-D2）。
3. **worker 卡数据（共享解析消费，R-3/O-2）**：`WorkerRoleInput` 逐行映射：`roleId`、`displayName: row.cardSections?.title`（`ProjectRoleSummary.cardSections.title` 为唯一解析来源；`ProjectRoleSummary.displayName` 语义不变、仍只给内置角色、worker 不用）、`group`、`cardSections`（按 C1a 冻结的章节形状透传；组装器只读 `WorkerRoleInput.displayName`）、`boundary: { entries: row.boundary.entries.map(→{path,kind,purpose}), boundarySource: row.boundary.boundarySource }`、`cardPath`、`boundaryPath`。缺 H1 ⇒ `displayName` 缺席，C1b 渲染 `unknown(not-declared-in-source)`。**不读取、不解析 `cardText`**。
4. **卡种快照（单一来源）**：

   ```ts
   const cardKindsByRole = Object.fromEntries(
     BUILT_IN_GOVERNANCE_ROLES.map((spec) => [spec.id, {
       choice: TRIO_CARD_KINDS[spec.id].filter((kind) => !GOVERNANCE_CONFIRM_CARD_KINDS.includes(kind)),
       confirm: TRIO_CARD_KINDS[spec.id].filter((kind) => GOVERNANCE_CONFIRM_CARD_KINDS.includes(kind)),
     }]),
   );
   ```

   **不新写第二张 role→cardKind 表**；`GOVERNANCE_CONFIRM_CARD_KINDS` 与 `TRIO_CARD_KINDS` 仍在本文件原位（AC-6）。
5. **发起快照**：`initiationByRole` 由本文件既有角色门控**派生**（`requirementChange`：rapporteur/convener；`versionDecision`：chief；`stableWrite`：convener）。为保持单一来源，建议把三处既有内联判定收成一个本文件私有谓词（如 `governanceInitiationOf(roleId)`），门控点与快照都用它；**行为逐字不变**，以全六角色行为对照测试钉住（AC-10）。
6. **会话标志（本会话真实注入状态）**：`{ customerInput: governedInput !== undefined, download: input.requestDownload !== undefined, shell: shellGate !== undefined, shellEscalation: shellGate !== undefined && shellEscalationSession !== undefined }`。**宿主未注入 ≠ 角色无权**：这些值只表示「本会话可用性」，角色级能力由注册表/角色卡渲染。
7. `generatedAt`：每次取数时 `new Date().toISOString()`（同一请求内只取一次，避免渲染内不一致）。
8. `governanceModel: "trio"`（本特性只在 trio 启用；single 不进入该辅助）。

**分层纪律**：本辅助是 Pipeline；它调用 Service 公开出口（`listProject`、`resolveBoundary`）并读 Model 类型。**纯矩阵 Service 不调用任何 Service、不读盘/写盘**；若 C1b 冻结入口与此不符（例如要求 Service 自行枚举），属违背 P1.1 F1 的契约冲突——**停止回报**（§7.2）。

### 3.2 幕僚必读块（会话启动，一次快照）

[设计候选] 在 `openRoleSession` 中、`capabilities` 组装之前（`:1540` 前；此时 `shellGate`/`shellEscalationSession`/`governedInput` 均已就绪，仍满足 P1.1「`setupRole` 成功后、`adapter.bindRole` 前」）：

```ts
const matrixEnabled = governanceModel === "trio" && builtInGovernance && isTrio;
const isChief = trioSpec?.id === "chief";
if (matrixEnabled && isChief) {
  try {
    const inputSnapshot = await loadGovernanceMatrixInput(project, sessionFlags, new Date().toISOString(), log);
    const matrix = buildGovernanceMatrix(inputSnapshot);            // C1b 纯组装
    if (matrix.status === "unavailable") throw new Error("registry-unavailable");
    const text = renderGovernanceMatrix(matrix, {
      maxChars: GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,       // C1b 导出常量（16000）
      perRoleMaxChars: GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS, // C1b 导出常量（1500）
    });
    if (text.length > 0) contextSections = [text];                  // 非空才传单个段（R-5/R-7）
    log.record("governance.matrix.build", { trigger: "session-start", status: matrix.status, truncated: matrix.render.truncated });
  } catch (err) {
    contextSections = [GOVERNANCE_MATRIX_UNAVAILABLE_NOTICE];      // 短声明，不含卡面/堆栈
    log.error("governance.matrix.unavailable", err, { trigger: "session-start" });
  }
}
```

- **上限常量（O-4/R-4/G-3）**：`GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`（16000）、`GOVERNANCE_MATRIX_TOOL_MAX_CHARS`（48000）、`GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`（1500）均由 **C1b 公共入口导出**，C3 `import` 并在渲染调用处显式传入、**不在 `run-role.ts` 写任何字面量**；单字段上限（80/500/800/300）由 C1b 渲染器内部作为默认使用（C3 不重定义）。使用点：①幕僚提示块渲染：`maxChars = GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`、`perRoleMaxChars = GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`；②工具渲染：`maxChars = GOVERNANCE_MATRIX_TOOL_MAX_CHARS`、`perRoleMaxChars = GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`；③单字段上限在 C1b 渲染器默认内生效。常量名以 C1b 冻结名为准；若 C1b 未导出，先回 C1b 补（§9-D4）。
- **`contextSections` 单一通道与空值语义（R-5/R-7）**：仅当 `matrixEnabled && isChief` 且渲染文本**非空**时传 `[text]` 一个元素；其余会话字段**缺席**（不传 `[]`、不传 `[""]`）。若渲染器防御性返回空串（不应发生），视为无段（不注入），不依赖适配器过滤来兜底；适配器另按 R-5/R-7 统一把 `undefined`/`[]`/全空串元素视为逐字不变。
- **判断会话（R-6）**：判断会话不经过 `openRoleSession`，C3 结构上不传 `contextSections`/`governanceMatrix`；适配器侧另有防御性置空（C4a/b/c 按 P-1/C-1/R-6 落），两层均不改变注入范围或角色判定。
- **数据化分隔/固定声明/清洗/限长/截断**：全部由 C1b 渲染器实现（P1.1 §4.3.4；本角色不复制）。编排只负责「整段作为单个 context 段、按序传入、不改写」；矩阵文本中的固定句「矩阵未列出≠无权限；宿主未注入≠角色无权」与摘要声明必须由渲染器保证，本角色测试做端到端断言（§6）。
- **不可用降级**：注入固定短声明（如 `# 治理权力矩阵\n> 矩阵不可用（<原因码>）；不得据此推断权限。`），**不阻塞会话**；不把异常文本/堆栈/项目绝对路径写进提示。
- **不自动改写系统提示**：会话中不重算、不写回；刷新只经工具。

### 3.3 六角色只读工具 `governance_matrix`（调用时现算）

[设计候选] 同一 `openRoleSession` 内为六个内置治理角色构造能力函数：

```ts
const governanceMatrix: GovernanceMatrixFn | undefined =
  matrixEnabled
    ? async (request = {}) => {
        try {
          const keys = Object.keys(request);
          if (keys.some((key) => key !== "roleId" && key !== "section")) {
            return { ok: false, message: "参数不受支持：只接受 roleId 与 section。" };
          }
          const section = request.section;
          if (section !== undefined && section !== "all" && section !== "roles" && section !== "routing") {
            return { ok: false, message: "section 仅支持 all / roles / routing。" };
          }
          const inputSnapshot = await loadGovernanceMatrixInput(project, sessionFlags, new Date().toISOString(), log);
          const matrix = buildGovernanceMatrix(inputSnapshot);
          if (matrix.status === "unavailable") {
            return { ok: false, message: "治理权力矩阵暂不可用；不得据此推断权限。" };
          }
          if (request.roleId !== undefined && !matrix.roles.some((role) => role.roleId === request.roleId)) {
            return { ok: false, message: "未找到该角色；请使用矩阵中已有的 roleId（可用 section 过滤）。" };
          }
          const message = renderGovernanceMatrix(matrix, {
            maxChars: GOVERNANCE_MATRIX_TOOL_MAX_CHARS,           // C1b 导出常量（48000）
            perRoleMaxChars: GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS, // C1b 导出常量（1500）
            ...(request.roleId !== undefined ? { roleId: request.roleId } : {}),
            ...(section !== undefined ? { section } : {}),
          });
          log.record("governance.matrix.build", { trigger: "tool", status: matrix.status, truncated: matrix.render.truncated });
          return { ok: true, message };
        } catch (err) {
          log.error("governance.matrix.unavailable", err, { trigger: "tool" });
          return { ok: false, message: "治理权力矩阵暂不可用；不得据此推断权限。" };
        }
      }
    : undefined;
```

- **注册条件**：`matrixEnabled`（trio + 内置治理 + 六角色之一）才注入 `capabilities.governanceMatrix`；未注入 ⇒ C2 的 Provider `注入才注册`，工具不存在。worker、`su`、判断会话、`runRole` 均不注入。
- **启动不计算**：五个非幕僚的 `governanceMatrix` 是惰性闭包，`openRoleSession` 期间**不调用** `loadGovernanceMatrixInput`；仅 chief 启动块调用一次。证据：诊断事件 `governance.matrix.build{trigger:"session-start"}` 只在 chief 出现（§6）。
- **参数校验分工**：C2 的 Provider 做 JSON Schema/多余字段拒收；本函数**再次防御性**校验键集与 `section` 枚举，并按**新鲜矩阵**校验 `roleId` 精确存在。错误信息**不回显**请求的未知 roleId、任何路径或能力值（AC-2）。
- **结果语义**：`ok:false` 仅表示「参数不受支持 / 矩阵不可用」，**不是「没有权限」**；降级但可展示时 `ok:true` 且文本内 `status: degraded`。工具结果无 `allowed`/`denied` 等判定字段。
- **只读**：函数只调 `listProject`/`resolveBoundary`/C1b 纯函数 + 诊断日志；不写项目文件、不写 `.ans/trunk`/`.ans/state`、不产生 trunk/VCA/freeze/stable-write 事件（AC-11）。
- **量值与截断**：工具文本上限只由 C1b 渲染器按导入的 `GOVERNANCE_MATRIX_TOOL_MAX_CHARS`（48000）与 `GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`（1500）执行；C3 不做第二次截断、不改写文本。渲染器若防御性返回空串，按 `ok:false`「矩阵不可用」处理（不返回空 `ok:true`）。
- **刷新**：每次调用重新 `listProject` + `resolveBoundary` + 组装/渲染；`generatedAt` 更新；同一请求内只读一次目录/文件（P1.1 §4.4）。

### 3.4 不注入的路径（保持逐字不变）

| 路径 | 现状 | 本提案处理 |
| --- | --- | --- |
| worker 项目角色 | `openRoleSession` 可开项目角色 | `builtInGovernance=false` ⇒ `matrixEnabled=false`；无提示段、无工具、任务文本/派发链/边界不变。 |
| `su`（single 旧模型） | `governanceModel!=="trio"`、`trioSpec===undefined` | `matrixEnabled=false`；提示、工具集合、边界、客户通道逐字不变（AC-15）。 |
| 判断会话（shell judge / governance judge） | 不走 `openRoleSession`；`createAdapter(gate,{shellJudge|governanceJudge})` | 结构性不注入；本角色不改 `src/common/编排/{shell-judge,governance-judge}.ts`；适配器另按 R-6 防御性置空（C4 落）。 |
| `runRole`（CLI `ans role run`，一次性） | `createAdapter(gate)`（`:419`），无 capabilities | **零改动**；新增回归测试断言 `capabilities===undefined`（§6）。 |
| 非幕僚五内置角色 | 走 `openRoleSession` | 有工具、**无**提示段、**启动不计算**。 |

### 3.5 适配器工厂与 C2 通道透传

[设计候选] `AdapterCapabilities` 增加两个可选字段，`createRuntimeAdapterFactory` 逐字透传：

```ts
...（capabilities?.contextSections !== undefined ? { contextSections: capabilities.contextSections } : {}),
governanceMatrix: capabilities?.governanceMatrix,
```

- `contextSections` 由 C2 在 `RuntimeSessionOptions`/`RuntimeProviderOptions` 承载（`RuntimeSessionOptions` 实际定义在 `src/service/runtime/session.ts:38`；团队计划 §八-1），C4a/b/c 按固定位置拼接（P1.1 §4.3.1）。本角色只保证「只有 chief 非空、其余缺席、按序原样传递」；工厂仅在字段**已定义**时透传，**不传空数组**（R-5）。
- `governanceMatrix` 由 C2 的 `GovernedToolsOptions.governanceMatrix?: GovernanceMatrixFn` 承载；Provider handler 只调用注入函数，参数形状校验在 Provider（C2），本函数据此再校验（§3.3）。工具描述/guidelines（只读、unknown、强制力、刷新、非批准/非验收证据）由 C2 写，本角色不复制文案表。

### 3.6 诊断与观测（项目规则 #10）

`log = createDiagnosticLogger({ component: "orchestration.session", projectRoot, roleId })`（既有）记录：

- `governance.matrix.build`：`{ trigger: "session-start" | "tool", status, roles, warnings, truncated }`（不含卡面全文/敏感信息）。
- `governance.matrix.unavailable`：错误对象 + `trigger`（错误即时输出，不吞）。
- `governance.matrix.listing-fallback`：仅当 C1a 加法字段缺省时。
- 启动/工具两时点的 `generatedAt` 不写入日志正文（避免噪声）；测试以 `build` 事件计数与文本内容断言。

诊断只影响可观察性，**不改变控制流**（失败路径本身即降级语义）。

## 4. 与上游契约的依赖与消费边界

### 4.1 冻结依赖（[交接]）

| 依赖 | 属主/写集 | 本角色消费方式 | 未冻结时的处理 |
| --- | --- | --- | --- |
| `src/model/governance-matrix.ts`（`GOVERNANCE_MATRIX_SCHEMA`、`MatrixField`/`MatrixComposite`/`GovernanceMatrix`/`GovernanceMatrixInput`/`WorkerRoleInput`/`BuildGovernanceMatrixFn`/`RenderGovernanceMatrixFn`/`RenderGovernanceMatrixOptions`/`GovernanceMatrixFn` 等） | 门禁引擎（C1a，B-1） | 只读类型导入；不定义/不改形状 | **不施工 C3**；先等 C1a 冻结 |
| `ProjectListing.issues?`/`roleDirectories?`（含 `MatrixRoleDirectories.error?: string`，R-2）、`ProjectRoleSummary.cardSections?`（含 `title`，R-3）与 `角色卡/门禁引擎/api-spec.md` | 门禁引擎（C1a） | 经 `listProject` 消费结构化结果；`displayName ← cardSections.title`；不解析 `cardText`、不导入私有解析器 | 同上 |
| `src/service/governance-matrix/` 纯组装/渲染公开入口（**导出上限命名常量**，R-4/G-3；含 unknown/固定句/数据化包裹语义） | 门禁引擎（C1b，B-2） | Pipeline 调公开入口并 `import` 常量；Service 不调用其他 Service、不读盘 | **不施工 C3**（团队计划 §5.2：C3 依赖 C1b+C2） |
| `GovernedToolsOptions.governanceMatrix?`、`RuntimeProviderOptions.contextSections?`、`RuntimeSessionOptions` 透传、`governance_matrix` 工具注册/schema/guidelines | 运行时核心（C2） | 能力位逐字透传；工具 handler 由 C2 实现 | **不施工 C3**；若 C2 字段名/形状不同，按冻结契约消费并回报偏差 |
| 三适配器固定位置拼接 | Pi/Claude/Codex（C4a/b/c） | 只传 `contextSections`，不改适配器 | 可与 C3 并行，但 T1 前需全部退出门 |

### 4.2 单一来源与不复制清单

- `TRIO_CARD_KINDS`、`GOVERNANCE_CONFIRM_CARD_KINDS`：保持本文件唯一来源；C3 只把它们**快照**进 `cardKindsByRole`。
- `VERSION_CHANGE_INITIATOR_BY_KIND`、`REFACTOR_REQUESTED_BY`：C1b 直接读 Model（P1.1 §2-5a）；C3 不复制、不迁移。
- 六角色注册表展示字段（duty/mainChain/…）：C1b 读；C3 不读 `cardText`、不另写摘要。
- `CHOICE_CARD_KINDS`/`CONFIRM_CARD_KINDS`（Provider 层）：C3 不引用、不复制。
- `APP_ROUTING_RULES`（C1b 唯一新增小表）：C3 不新增路由表；`cardKindsByRole`/`initiationByRole` 是既有数据的快照，不是新表。

### 4.3 层与调用方向

`Interface → Pipeline → Service → Provider`；Model 共享。C3 新增调用仅为 Pipeline → Service 公开出口（`listProject`、`resolveBoundary`、C1b 纯 Service）与 Model 类型读取；**不导入** `src/common/门禁引擎/**` 私有实现、**不导入** Provider；除既有导入（含 `createDiagnosticLogger`）外**不新增**对 `src/common/**` 的依赖。C1b 纯 Service 不反向调用 Pipeline/Provider/其他 Service。

## 5. 关键流程（示意）

```mermaid
flowchart TD
  A[openRoleSession：setupRole 成功] --> B{governanceModel=trio 且内置六角色?}
  B -->|否（worker/su）| Z[无矩阵段、无工具；行为逐字不变]
  B -->|是| C[组装能力（shell/governedInput/下载/升级）]
  C --> D{role=chief?}
  D -->|是| E[loadGovernanceMatrixInput<br/>listProject + 可解析角色 resolveBoundary(.acceptance)<br/>共享 cardSections + 卡种/发起/会话快照]
  E --> F[buildGovernanceMatrix（纯）→ render（C1b 提示上限常量）]
  F --> G[capabilities.contextSections=[text]]
  E -->|来源失败| H[短声明：矩阵不可用；不得据此推断权限]
  H --> G
  D -->|否| I[仅 capabilities.governanceMatrix（惰性）]
  G --> J[createAdapter → bindRole]
  I --> J
  J --> K{工具调用 governance_matrix}
  K --> L[重新取数 + 组装/渲染（C1b 工具上限常量）；参数校验/过滤]
  L --> M[ok:true（可 degraded）或 ok:false（参数/不可用）]
```

## 6. 测试计划与 V1 证据贡献

### 6.1 命令与环境

| 项 | 值 |
| --- | --- |
| 目标套件 | `node --test --test-concurrency=1 "test/编排/**/*.test.ts"`（B0：79 文件 / 905 tests / 904 pass / 1 既有 EPERM / 0 skip） |
| 目标文件 | `node --test --test-concurrency=1 test/编排/governance-matrix-injection.test.ts` |
| 静态 | `npm run typecheck`（必须通过）；`typecheck:renderer`/`build:renderer` 默认 N/A（不改渲染面，记录理由） |
| 环境 | Node `v24.22.1`、npm `11.19.1`、Windows 11 / Git Bash（B0 同值；实施时重记） |
| 证据 | 候选哈希（`git hash-object`+`sha256sum`）、`git status --porcelain -uall | sort` 快照、命令/退出码/计数/失败原文；未跑项如实披露 |

### 6.2 测试清单（新文件，按 AC 分组）

| 组 | 用例 | 断言要点 | 覆盖 V1 AC |
| --- | --- | --- | --- |
| A 注入范围 | A1 chief（trio + builtInRoles 六角色） | fake adapter 捕获 `contextSections`：**恰一个**非空字符串；含标题、`generatedAt`、摘要声明、固定句逐字「矩阵未列出≠无权限；宿主未注入≠角色无权」；长度 ≤ `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`（C1b 导出常量，值 16000）；`governanceMatrix` 能力存在 | AC-1、AC-16 |
| | A2 五个非幕僚内置角色各自开会话 | `contextSections === undefined`（**不是** `[]`/`[""]`）、`governanceMatrix` 为函数；诊断中**无** `trigger:"session-start"` 的 `governance.matrix.build` | AC-1、AC-8 |
| | A3 worker 项目角色 | 无 `contextSections`、无 `governanceMatrix`、无诊断 build 事件 | AC-1 |
| | A4 single + `su` | 无段无工具；提示/能力集合与基线相同（AC-15 的编排侧） | AC-15 |
| | A5 `runRole`（CLI 一次性） | fake `createAdapter` 收到 `capabilities===undefined`；不发生矩阵取数/工具注册 | AC-1（cli 子句） |
| B 工具 | B1 六角色工具调用 | `ok:true`；文本含六角色行/worker 行/导航/固定句；`generatedAt` 为调用时点 | AC-2、AC-16 |
| | B2 参数矩阵 | 合法 `roleId` 过滤只含该角色；`section:"routing"` 只含导航；未知 roleId→`ok:false` 且消息**不含**该 id/任何路径；非法 section→`ok:false`；多余字段→`ok:false` | AC-2 |
| | B3 只读 | 调用前后临时项目树哈希一致；无 `.ans/trunk`/`.ans/state` 新文件；无 `doc.freeze`/`trunk.state`/`version.change` 事件（诊断目录在项目外） | AC-2、AC-11 |
| C 单一来源 | C1 卡种派生 | 六角色 `request_choice`/`request_confirmation` 分组文本与 `TRIO_CARD_KINDS`+`GOVERNANCE_CONFIRM_CARD_KINDS` 期望一致（`appointment-write` 只在 nominator 的 confirmation；product 无） | AC-6、AC-3（编排侧快照一致性） |
| | C2 发起与路由 | 版本升级→product；细节修正/修正案→rapporteur；重构/stable 写入→convener；需求变更→rapporteur/convener；版本决策→chief；验收→verifier（文本断言） | AC-7（编排侧） |
| | C3 会话标志 | 注入 customerInput/requestDownload/shellOperatorOnly 时文本显示「本会话可用/已 arm」；未注入时显示「不可用/未 arm」；product 即使宿主给 customerInput 也显示会话不可用（注册表 `customerInput=false`→`governedInput` 缺席） | AC-10、AC-16 |
| D 快照/刷新 | D1 启动快照不自动改写 | 开会话后新建 worker B、改 worker A 边界；prompt 段（fake 捕获）仍为旧值；工具调用显示 B 与 A 新值 | AC-8 |
| | D2 `generatedAt` 更新 | 两次调用间隔 ≥5ms，`generatedAt` 变化；内容反映新边界 | AC-8 |
| | D3 会话中途新增角色 | 工具中 B 的 acceptance 显示 `unknown（请重开会话）`（`acceptance-unavailable`），**不**显示「已接受」；快照内角色显示真实 acceptance（listing 占位不被使用） | AC-8、AC-9 |
| | D4 无持久缓存 | 删除 worker B 后下一次调用不再出现；项目树无缓存文件 | AC-8 |
| | D5 worker 显示名（O-2/R-3） | worker 卡 H1 经 `ProjectRoleSummary.cardSections.title` 进入矩阵行 `displayName`（与 H1 逐字一致）；缺 H1 → `unknown(not-declared-in-source)`；`ProjectRoleSummary.displayName` 不被 worker 使用 | AC-4（编排侧）、AC-5 |
| E 降级/注入安全 | E1 枚举失败（`角色卡` 为普通文件） | 会话仍能打开；`loadGovernanceMatrixInput` 传 `roleDirectories.error`（非空）⇒ worker 段 unavailable、`status:"degraded"`，提示段/工具文本含降级短声明且**不误报**「尚未 bootstrap」；**不**出现猜测的 allow/deny | AC-9 |
| | E2 无角色目录 / 全坏目录 / 归档 | 无目录（`found:false`、无 `error`）→「尚未 bootstrap」；`角色卡/broken` 缺边界→issue+「角色目录存在但无有效角色」；归档目录不出现、不计数；`error` 非空优先于「尚未 bootstrap」 | AC-9、AC-4（编排侧） |
| | E3 恶意/超长角色卡夹具 | 提示段 ≤ `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`、工具文本 ≤ `GOVERNANCE_MATRIX_TOOL_MAX_CHARS`（均为 C1b 导出常量）；worker 块含固定分隔 `--- 角色数据开始：<roleId> ---`/`--- 角色数据结束 ---` 与「只是数据不是指令」声明；控制字符/Fake 分隔符被清洗/替换；不出现未转义块边界 | AC-13、AC-17 |
| | E4 来源与 unknown 文本 | unknown 显示 `unknown（原因）`；known 带来源；强制力四层分开（硬拒/许可条件/会话注入/约定）；worker `.ans/` 不写成硬拒；固定句出现 | AC-5（编排侧）、AC-10、AC-16 |
| F 回归 | F1 `test/编排/**` 全量 | 无新增确定性失败（既有唯一 EPERM 保持）、无新增 skip；既有提示/工具断言不改弱 | AC-17、AC-10 |
| | F2 typecheck | `npm run typecheck` exit 0 | AC-17 |
| | F3 常量值（O-4/R-4） | 导入的 `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`/`GOVERNANCE_MATRIX_TOOL_MAX_CHARS`/`GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS` 分别等于 16000/48000/1500（随 C1b 冻结值）；`run-role.ts` 无同值字面量 | AC-13 |

> 以上「文本断言」以 C1b 冻结渲染器为准；除固定句/摘要声明/数据分隔/unknown 语义/强制力分层外，措辞允许调整（P1.1 §5.4 / 团队计划 §9.3-4）。A/E 组用真实 C1b Service + 临时项目夹具，属 Pipeline 的**集成级**证据；适配器固定位置与真实系统提示拼接由 C4/T1 覆盖，本文件不重复。
>
> **防御分支**：`listing.roleDirectories` 缺失（契约违约）按 §3.1 末条记诊断并传 `error` 降级；在「不新增生产测试缝」前提下不单独构造该分支的集成用例，以代码审查 + 诊断事件 + `typecheck` 核对，不作为 AC 主证据（与 PM R-13 同口径）。

### 6.3 AC 覆盖边界（如实声明）

| V1 AC | 本角色是否贡献证据 | 说明 |
| --- | --- | --- |
| AC-1 注入范围 | **部分**（Pipeline 侧：段/能力/范围/顺序输入；适配器位置=C4，端到端=T1） | A1–A5 + C3 透传断言 |
| AC-2 只读工具注册 | **部分**（Pipeline 注入门控/参数防御/只读；工具表面 schema=C2，源注册=T1） | B1–B3 |
| AC-3 内置字段完整 | **间接**（快照与文本可核对；逐字段相等以 C1b 构建器测试为准） | C1、E4 |
| AC-4 worker 解析 | **部分**（filter/issue/归档/中途新增角色/displayName 映射；解析器=C1a/C1b） | D3、D5、E2 |
| AC-5 来源与 unknown | **间接**（文本；schema/构建器=C1a/C1b） | E4 |
| AC-6 单一来源 | 是（编排侧：快照唯一来源、无第二张表） | C1 |
| AC-7 派发导航 | **部分**（快照/文本；构建器=C1b） | C2 |
| AC-8 刷新与快照 | 是（编排侧全部） | D1–D4、A2 |
| AC-9 降级/fail-closed | 是（编排侧） | E1–E2 |
| AC-10 权限零变化/强制力 | **部分**（gate 对照/无接入；全文分层=C1b/T1） | C3、E4、F1 |
| AC-11 不落盘/不产生版本 | 是（编排侧） | B3 |
| AC-12 不新增/不改变角色与边界 | 否（由 AC-12/T2 diff 审查；本角色不改边界/注册表） | 声明 |
| AC-13 有界渲染 | **部分**（注入长度上限断言；渲染器=C1b） | E3 |
| AC-14 i18n | 否（本角色零 i18n key；由 T2 判定） | 声明 |
| AC-15 single/su 兼容 | **部分**（编排侧；适配器/端到端=C4/T1） | A4 |
| AC-16 摘要声明/固定句 | **部分**（文本断言；渲染器=C1b） | A1、B1、C3、E4 |
| AC-17 测试覆盖/注入安全 | **部分**（本角色覆盖清单 + 恶意夹具；全量=T2，适配器=C4） | E3、F1、F2 |
| AC-18 文档与披露 | **部分**（本角色提案/实施记录如实；api-spec 更新） | §2.3/§11 |

## 7. 实施顺序、依赖与停止项

### 7.1 顺序

1. 前置：P1 审核通过；C1a 冻结；**C1b + C2 冻结**（团队计划 §5.2：C3 依赖二者；C4a/b/c 可与 C3 并行）；基线更新 + B0 重记；本角色范围预留。
2. 实现 `run-role.ts`（先取数辅助与工厂透传，再 chief 提示块，再工具能力；每步跑定向测试）。
3. 新增 `test/编排/governance-matrix-injection.test.ts`，逐组点亮。
4. 回归 `test/编排/**` + `npm run typecheck`；记录候选哈希与原始输出。
5. 交 T1（跨层）与 T2（T3 全量）；E1/E2 另属统筹/验收。

### 7.2 停止项（必须回报，不自行处理）

- C1a/C1b/C2 冻结形状与本提案假设不一致，且需要改变行为/语义（尤其：纯 Service 要求自行枚举或调用其他 Service；`contextSections`/`governanceMatrix` 名称或位置不同；`GovernanceMatrixInput` 无法承载枚举失败）。
- 需要写 `src/model/**`、`src/service/**`、`src/provider/**`、`src/common/**`、`app/**`、`test/桌面应用/**`、i18n、其他角色测试/文档，或需要新增边界。
- 需要把矩阵接入 `gate`/派发预检/客户卡/冻结/trunk/VCA/stable-write，或让矩阵成为批准/验收/证据。
- 需要启用任一 O-1–O-8、给 worker 注入、改 `runRole`、改 su/single 行为。
- 基线更新暴露方案未覆盖的语义冲突（如既有角色 id/能力位变化）。
- 任何命令出现新增确定性失败或新增 skip，且不能归因于 B0 基线。

## 8. 风险与控制

| ID | 风险 | 控制 |
| --- | --- | --- |
| R1 | matrix Service 被写成「自己取数」→ Service→Service/读盘违规 | 本提案明确 Pipeline 供给全部输入；C3 实施前核对 C1b 公共入口签名；违反即停止（§7.2） |
| R2 | `listing` acceptance 占位被当真实接受状态 | 只用 `resolveBoundary(...).acceptance`；worker 条目只用 listing 声明；D3 测试钉住 |
| R3 | 会话中途新增角色被误报「已接受」 | 仅 `project.roles` 快照内调用；否则 `acceptance-unavailable`；D3 |
| R4 | 五角色启动计算使开会话变慢/出错 | 惰性闭包 + 诊断事件断言；A2 |
| R5 | 提示注入（恶意 worker 卡） | C1b 渲染器数据化/清洗/限长；C3 只注入渲染文本并断言上限/分隔（E3） |
| R6 | 工具参数探测未知角色/路径 | 键集/枚举校验 + 新鲜矩阵精确匹配 + 通用错误文案（B2） |
| R7 | 矩阵拖慢会话或抛错阻塞开局 | 全部构建/渲染包在 try/catch；chief 失败注入短声明；工具失败 `ok:false`（A1/E1） |
| R8 | 与既有 `gate`/卡种/发起门控冲突 | 不动 gate/卡种表；`initiationByRole` 由既有谓词派生并做行为对照（C3/F1） |
| R9 | 契约漂移导致返工 | C1a/C1b/C2 冻结后施工；偏差如实披露；旧证据不复用 |
| R10 | 基线漂移（B0 7ba8a33 ↔ 当前 ebbc2fc） | 实施入口更新基线并重记 B0（§9-D5）；旧计数不复用 |

## 9. 偏差、澄清与如实披露（对照 P1.1/团队计划）

> 以下为**提案时点发现**的偏差、澄清与披露；不改变方案产品口径。D1/D3/D4 已由 PM 审核（R-2/R-3/R-4）裁决并在 Revision 1 收敛；D2/D5/D5b/D6/D7/D8/D9/D10/D11 按 PM §七.4 采纳维持；D12 为 R-5/R-6/R-7 的注入表述对齐。

- **D1（枚举失败载体，O-1/R-2 已裁决）**：唯一载体为 C1a 的 `MatrixRoleDirectories.error?: string`（`roleDirectories.error`）；**不新增** `listingError`。C3 在 `listProject` 抛错时传 `{found:false,totalDirs:0,archivedSkips:0,error:<message>}`；C1b 以 `error` 非空优先于「尚未 bootstrap」判定，并生成 `MatrixWarning{code:"role-enumeration-failed"}`（**仅原因码**，不是第二输入字段）。三分映射（项目根不可读 / 无目录 / 全坏目录）见 §3.1-1。字段缺失（契约违约）按 §3.1 末条记诊断并降级，**不猜测** `found`/计数（O-3）。
- **D2（worker 声明边界来源）**：worker 可写条目**只取** `listProject().roles[].boundary.entries`；`resolveBoundary(...)` 只贡献 `.acceptance`。这与团队计划 §八-2/§八-3、V1 §七-2/§七-3 一致；C3 不把治理边界覆盖分支的 `entries` 当 worker 声明。若 C1b 渲染器期望其他来源，停止回报。
- **D3（worker 显示名载体，O-2/R-3/G-1 已裁决）**：`ProjectRoleSummary.cardSections.title` 为唯一解析来源；C3 填入 `WorkerRoleInput.displayName`；C1b 组装器只读 `WorkerRoleInput.displayName`（不直接读 `cardSections.title`）；`ProjectRoleSummary.displayName` 语义不变（仍只给内置角色）。缺 H1 ⇒ `unknown(not-declared-in-source)`。
- **D4（上限常量归属，O-4/R-4/G-3 已裁决）**：C1b 公共入口导出命名常量（提示 16000 / 工具 48000 / 单角色 1500 及单字段 80/500/800/300）；C3 `import` 并在渲染调用处显式传入提示/工具/单角色三个常量，**不在 `run-role.ts` 写任何字面量**。使用点：提示块 `maxChars = GOVERNANCE_MATRIX_PROMPT_MAX_CHARS` + `perRoleMaxChars = GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`；工具 `maxChars = GOVERNANCE_MATRIX_TOOL_MAX_CHARS` + `perRoleMaxChars = GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`；单字段上限由 C1b 渲染器默认使用（C3 不重定义）。常量名以 C1b 冻结名为准；若 C1b 未导出，先回 C1b 补，不在 C3 复制。
- **D5（基线漂移，R-12）**：B0 记录 HEAD `7ba8a33`；提案初版写于 `dc21fc1`（PR #65）；本修订写于 `ebbc2fc`（PR #66，含 `c3e50f5` 名单升级回绑）。按团队计划 §1.4/§6.3、V1 §4.2 与 PM R-12，实施入口必须更新分支到当时 `origin/main` 并由测试角色**重记 B0**；`7ba8a33` 的计数只作历史参考，旧证据不复用。
- **D5b（并发写披露）**：提案初版写盘时同一 worktree 出现的两个非本角色并发源码修改（`src/common/编排/run-manifest.ts`、`src/pipeline/orchestration/version-change-runtime.ts` 及 `test/编排/{run-manifest,version-change-runtime}.test.ts`，VCA 名单/拓扑 re-pin 相关）已在 `c3e50f5`/`ebbc2fc` 合入；本修订写盘前 `git status --porcelain -- src app test` 为空。实施入口仍须按团队计划 §1.5 重新核对单写者并更新基线。
- **D6（chief 注入时点措辞）**：P1.1 §4.3.1 写「`setupRole` 成功后、`adapter.bindRole` 前」。为让 `session.shell`/`shellEscalation` 标志反映**本会话实际装配结果**，C3 把计算点放在能力组装前（仍在 `bindRole` 前，语义不变）；不改变注入范围/内容/上限。
- **D7（product 的 customerInput 会话标志）**：注册表 `product.capabilities.customerInput=false`，`openRoleSession` 的 `governedInput` 对 product 恒为 `undefined`。C3 的会话标志用 `governedInput !== undefined`（真实注入），而不是宿主原始入参 `input.customerInput !== undefined`；避免把「宿主给了通道但本角色不可用」误写成「本会话可用」（符合 F11 的宿主观与角色观分离）。
- **D8（「五角色启动不计算」的证据方式）**：本角色**不新增生产测试缝**。以诊断事件 `governance.matrix.build{trigger}` 的时点/数量 + 行为（开会话后新建角色仅工具可见、prompt 段不变）证明惰性；若 PM 要求更强的结构证明，可由 T1/T2 做源码级检查。
- **D9（`resolveBoundary` 公开出口）**：按团队计划 §八-2/V1 §七-2，C3 使用 `src/service/boundary/resolve-boundary.ts::resolveBoundary`，不导入门禁引擎私有 `resolveBoundarySection`。P1.1 §4.2.1 的旧函数名按公开出口口径执行。
- **D10（`RuntimeSessionOptions` 位置）**：按团队计划 §八-1，实际定义在 `src/service/runtime/session.ts:38`；C2 在该文件/`RuntimeProviderOptions` 落 `contextSections`。C3 的 `AdapterCapabilities`/工厂只做 Pipeline 侧透传，不改 Service。若 C2 选择只在 `RuntimeProviderOptions` 暴露而 `RuntimeSessionOptions` 不继承该字段，C3 的工厂调用会编译失败——按 C2 冻结结果调整透传位置并披露。
- **D11（工具参数校验分工）**：C2 Provider 负责 JSON Schema/多余字段；C3 注入函数再做键集/枚举/roleId 存在性校验（针对新鲜矩阵）。两者不合并成第二套 schema；测试覆盖两层（B2 覆盖 C3 侧；C2 侧由运行时核心测试覆盖）。
- **D12（R-5/R-6/R-7 对齐）**：`contextSections` 单一 `readonly string[]` 通道；Service 仅在已定义时透传；三适配器把 `undefined`/`[]`/全空串元素视为系统提示逐字不变，并在判断会话（`judgeMode`/`shellJudge`/`governanceJudge`）防御性置空。C3 只在渲染文本**非空**时传**单个**段；非 chief 会话 `contextSections` 缺席（不传 `[]`/`[""]`）；判断会话结构性不经过 `openRoleSession`，C3 不传任何矩阵字段；C3 不依赖适配器过滤兜底（过滤是 C4 的防御层，不是 C3 的语义）。

## 10. 与项目规则的核对（P1 审核用）

> `角色卡/项目管理/docs/project-rules.md` 当前为**草稿**；草案不当作已生效约束。以下只核对与已确凿事实/已确认要求的关系。

| 规则 | 与本提案的关系 |
| --- | --- |
| 五层调用方向 | C3 只新增 Pipeline→Service 公开出口与 Model 类型读取；不跨层、不反向。 |
| 单一主属主 | `governance-matrix/v1`、`ProjectListing` 加法、纯矩阵 Service、运行时通道、适配器拼接各有唯一主属（门禁引擎/运行时核心/三适配器）；C3 只消费。 |
| 未列即只读 / 写集 | 写集 = `run-role.ts` + `test/编排/` + 本角色文档；无边界变更。 |
| 风险档位 T3 | 全量适用回归 + typecheck；本角色只贡献受影响套件证据，T2 由测试角色执行。 |
| 日志规则 #10 | 诊断事件 `governance.matrix.build/unavailable`；不记录卡面全文/敏感信息。 |
| 证据纪律 | 提案与实施记录如实区分「未实施/未测试/implemented-unverified」；不把计划写成结果。 |
| 截图规则 | 本特性无 UI 变更，截图非必需；如提供最多截图、不得录屏。 |

**冲突/缺口**：未发现与当前已确认规则冲突；PM 审核 R-2/R-3/R-4/R-5–R-7 已裁决本提案原 D1/D3/D4 与注入空值语义，本修订已按裁决收敛，无未决冲突；R-9 的 `application` 路由验收解释属门禁引擎/沟通与验收事项，不影响本角色写集。

## 11. 声明

- 本提案（Revision 1）在提案阶段**未实施**；**当前状态已收口为 `implemented-unverified`**：实现记录见 `2026-11-05_governance-authority-matrix-orchestration-implementation.md`（89 行 / `06bde83b…`），E2 判定 AC-1–AC-17 pass、唯一 fail 为 AC-18 文档状态（本次仅做文档收口）。**不写 verified**；未 commit/push。提案初版写盘时 HEAD `ebbc2fc`、`src/app/test` 干净；初版写盘时的并发 VCA 改动已合入该基线（§9-D5b）。
- 本提案不授权派发、不授权修改写集/边界/角色卡/方案/沟通/调度/验收文档、不授权提交/推送/合并/发布。
- E2 已按 V1 判定 AC-1–AC-17 pass（AC-18 由本次文档状态收口处置）；本文件保持 `implemented-unverified`，**不写 verified**；验收通过/文档收口均不授权提交、推送、合并、发布。
- 若 P1.1/团队计划/冻结契约发生实质变化（注入范围、unknown 语义、单一来源、写集/边界、档位），本提案随之失效，按技能重开相应闸门并回报统筹。

## 12. 文档状态收口（E2 后，仅文档）

- **本文件状态**：`implemented-unverified`（**不是** `verified`；验收通过只表示当前候选满足 V1，不授权提交/推送/合并/发布）。
- **实现记录**：`角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration-implementation.md`（89 行 / SHA-256 `06bde83bf5c649f02de0436611fd7b36ee81fc0384be0a8d248fefc8a276a7dc`）。
- **实现候选快照**：`839b922f…`（E2 判定所用候选）。
- **T2 证据**：`npm run typecheck` exit 0；T3 全量 **4,130 / 4,103 / 9 / 18**（tests / pass / fail / skipped）；新增确定性失败 = **0**、新增 skip = **0**（9 项失败按重记后的 B0 基线分类为既有 Windows symlink EPERM，非本任务新增）。
- **E2 报告**：`docs/acceptance/governance-authority-matrix-report-v1.md`（**169 行 / SHA-256 `fe983bc22d58e3faf9b2e80fc3c90f4293f01188c141deba76a09e80c74db885`**）：AC-1–AC-17 全部 `pass`，唯一 `fail` 为 AC-18 文档状态（本文件收口即处置该条；最终判定仍以验收主上下文为准）。
- **范围**：本节仅为文档状态收口；未改代码/测试/边界/其他角色文件；未 commit/push。
