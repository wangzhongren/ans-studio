# 实施记录：治理权力矩阵——编排 C3（Pipeline 取数 / 幕僚提示块 / 六角色工具门控）

- 日期：2026-11-05
- 角色：编排（Orchestration，独立固定上下文）
- 任务：`2026-11-05-governance-authority-matrix`，团队计划节点 **C3**
- 状态：**implemented-unverified**（已实现、已跑本角色测试与 typecheck；未验收、未 commit/push）
- 依据：`docs/planning/2026-11-05_design_governance-authority-matrix.md` P1.1（1056 行 / `1f6518b8…`）、团队计划 §4.3 C3/§5.1/§5.2（660 行 / `07378444…`）、本角色提案 Revision 1（`角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration.md`）、PM P1 审核（358 行 / `0128f615…`）
- 基线：当前 worktree（HEAD `0418746ae9f2ed20f389c26da34ef55840febfe6`，含 C1a/C1b/C2/C4 **未提交候选**）；`src/app/test` 中除本任务候选外无本角色改动；**未提交、未推送**。
- 环境：Windows 11 / Git Bash；Node `v24.22.1`；npm `11.19.1`。

## 1. 写集与候选

| # | 路径 | 类型 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/pipeline/orchestration/run-role.ts` | 修改 | 2938 | `22a292dba48227d1e35a029e2a403254514b4cfc11e345ef96072d340efe28ce` |
| 2 | `test/编排/governance-matrix-injection.test.ts` | 新增 | 793 | `1b8c4b564c9b6c217cc008160037cc1515109ac6238c5feb56ffe7c7aceda589` |
| 3 | `角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration-implementation.md` | 新增（本文件） | — | 见交付回报 |
| 4 | `角色卡/编排/api-spec.md`、`角色卡/编排/memo.md` | 追加 | — | 见交付回报 |

- 未写：`src/model/**`、`src/service/**`、`src/provider/**`、`src/common/**`、`app/**`、i18n、其他角色 test/docs、`docs/scheduling|acceptance|communication|planning/**`、任何角色卡/边界/YAML/根 changelog。
- 无边界变更（团队计划 §3.2/§4.1：本任务只有门禁引擎 B-1/B-2）。

## 2. 实现内容（对照提案 Revision 1）

1. **Pipeline 取数**（`loadGovernanceMatrixInput`，`run-role.ts` 内私有）：
   - `listProject(projectRoot)` 一次，`workerRoles = roles.filter(!builtIn)`；`issues`/`warnings` 映射；`roleDirectories` **逐字透传**。
   - 枚举失败：唯一载体 `roleDirectories.error`（`{found:false,totalDirs:0,archivedSkips:0,error}`）；C1b 以 `error` 优先于「尚未 bootstrap」。未造 `listingError`。
   - 字段缺失（防御分支）：记诊断 `governance.matrix.contract-violation`，按 `error` 降级；不猜 `found`/计数。
   - acceptance：仅可解析角色（内置六角色或 `project.roles[roleId]` 存在）经 `resolveBoundary(...).acceptance`；listing 占位 acceptance 不使用；worker 条目只取 listing 的 `boundary.entries`。
   - worker 卡：`displayName ← ProjectRoleSummary.cardSections.title`；`group ← group / groupDuty`；`cardSections` 仅五个章节；不解析 `cardText`。
   - `cardKindsByRole`：`TRIO_CARD_KINDS` 按 `GOVERNANCE_CONFIRM_CARD_KINDS` 拆分快照；`initiationByRole`：由 `canRequestRequirementChange/VersionDecision/StableWrite` 谓词派生（同一谓词已用于既有注入门控，行为逐字不变）。
   - 会话标志：`customerInput = governedInput !== undefined`、`download = input.requestDownload !== undefined`、`shell = shellGate !== undefined`、`shellEscalation = shellGate && shellEscalationSession`。
2. **幕僚提示块**：`trio + built-in-governance + chief`，在能力组装前计算一次（仍早于 `bindRole`）；`renderGovernanceMatrix` 传 `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS` + `GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`；非空才传单个 `contextSections`；渲染/组装失败注入固定短声明，不阻塞会话；不自动改写系统提示。
3. **六角色工具**：`governanceMatrix` 能力位仅 `governanceMatrixEnabled`（trio + 内置 + 六角色之一）注入；五个非幕僚启动不计算（闭包惰性）；工具调用每次重新取数 + `buildGovernanceMatrix` + `renderGovernanceMatrix`（TOOL/PER_ROLE 常量）；C3 预检 `roleId` 精确存在（未知不回显）、键集与 `section` 枚举；`ok:false` 仅参数/不可用；只读、零写盘/账本。
4. **不注入**：worker、`su`/single、判断会话（不经 `openRoleSession`）、`runRole` 一次性 CLI（`createAdapter(gate)` 无 capabilities）。
5. **透传**：`AdapterCapabilities.contextSections/governanceMatrix` + `createRuntimeAdapterFactory` 同名透传（C2 通道/能力位）。
6. **诊断**：`governance.matrix.build`（`trigger: session-start|tool`、`status/roles/warnings/truncated`）、`governance.matrix.unavailable`、`governance.matrix.listing.failed`、`governance.matrix.contract-violation`、`governance.matrix.acceptance.failed`；不含卡面全文/敏感信息。

## 3. 验证证据（原始结果）

| 命令 | 退出码 | 计数/结果 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/编排/governance-matrix-injection.test.ts` | 0 | tests 18 / pass 18 / fail 0 / cancelled 0 / skipped 0 / todo 0（duration ≈ 474 ms） |
| `node --test --test-concurrency=1 test/编排/governance-matrix-injection.test.ts test/测试/g4-skill-verify/h-scope-audit.test.ts` | 0 | tests 25 / pass 25 / fail 0 / cancelled 0 / skipped 0 / todo 0（含既有 `.probe` 保留字审计；本文件已改用 `capture` 命名） |
| `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | 1 | tests 925 / pass 924 / fail 1 / cancelled 0 / skipped 0 / todo 0（duration ≈ 21.7 s）；唯一失败 = `test/编排/shell-authorized-routine.test.ts:184` 既有 Windows symlink `EPERM`（与 B0 基线同类；非本任务新增） |
| `npm run typecheck` | 0 | `tsc --noEmit` 无诊断 |

- 新增测试 18 条覆盖 A–F 组（注入范围、工具门控与只读、单一来源与会话标志、快照/刷新/会话新增角色、降级/注入安全、权限零变化与常量）。
- 本文件/命令均未提交、未暂存；`git status --porcelain -- src app test` 当前含本任务与 C1a/C1b/C2/C4 候选（其他角色并行实施；本角色未触碰）。

## 4. AC 映射（编排侧证据贡献，不替代 V1 判定）

| V1 AC | 本角色证据 | 测试 |
| --- | --- | --- |
| AC-1 注入范围（Pipeline 侧） | chief 有单段提示；五非幕僚无段有工具且启动不计算；worker/su 无；runRole 无 | A1–A5、B1 |
| AC-2 只读工具注册/参数/只读 | 六角色有工具；worker/su 无；参数矩阵；零写盘/账本 | B1–B3 |
| AC-3 内置字段/发起快照 | 卡种快照与发起快照文本一致 | C1、C4 |
| AC-4 worker 解析（编排侧） | filter/issue/归档/中途新增角色/displayName | D1、E2、E4 |
| AC-5 来源与 unknown | unknown 原因/known 来源/强制力分层文本 | E4 |
| AC-6 单一来源 | 卡种/发起导航来自快照，无第二张表 | C1、C2、C4 |
| AC-7 派发导航 | 版本/重构/需求变更/验收/下载/客户路由 | C2 |
| AC-8 刷新与快照 | 启动快照不改写；工具刷新、generatedAt 更新；新增角色 acceptance-unavailable；无缓存 | A2、D1 |
| AC-9 降级/fail-closed | 枚举失败 degraded；无目录/全坏目录/归档区分 | E1、E2 |
| AC-10 权限零变化 | gate 判定调用前后一致；宿主/约定不误写 | B3、C3、E4 |
| AC-11 不落盘/不产生版本 | 项目树前后一致；无 trunk/state 账本 | B3 |
| AC-13 有界渲染 | 提示/工具/单角色常量断言；超长截断标注 | A1、E3、F3 |
| AC-15 single/su 兼容 | 无段无工具 | A4 |
| AC-16 摘要声明/固定句 | 固定句逐字、摘要声明、无授权字段 | A1、B1、E4 |
| AC-17 测试覆盖/注入安全 | 恶意/超长夹具；本文件 18/18；typecheck 0 | E3、全文 |
| AC-12/AC-14/AC-18 | 非本角色判定：AC-12/AC-14 由 T2；AC-18 由各所有者文档与 E2 | 声明 |

## 5. 未做 / 未测（如实）

- **未做**：T1 跨层集成、T2 T3 全量回归/静态检查（由测试角色）；C4a/b/c 适配器固定位置单测（本角色不改适配器）；桌面端到端（`test/测试/`）；真实运行时/应用启动；独立验收（E2）。
- **未单独测**：`roleDirectories` 缺失（契约违约）防御分支（不新增生产 seam；以代码审查/诊断核对）；判断会话不注入为结构性保证（不经过 `openRoleSession`；由 C2/T1 覆盖）。
- **未 commit/push**；未改 i18n/app/**；未写其他角色文件。

## 6. 偏差与披露

- **无语义偏差**：实现按提案 Revision 1（O-1–O-4、R-5/R-6/R-7）落地；未扩大写集。
- **路径规范化披露**：`listProject`/边界解析对目录条目去掉尾部 `/`（例如 `src/alpha/` 在矩阵文本中显示为 `src/alpha`）；测试按规范化后的实际输出断言，不改解析器。
- **基线漂移**：B0 记录于 `7ba8a33`，当前 HEAD `0418746`；按团队计划 §1.4/§6.3 与 PM R-12，实施入口须由测试角色**重记 B0**；本记录计数仅对当前候选有效，旧 B0 计数不复用。
- **诊断命名**：`roleDirectories` 缺失统一用 `governance.matrix.contract-violation`（未使用 `listing-fallback`）。
- **既有审计约束披露**：`test/测试/g4-skill-verify/h-scope-audit.test.ts` 禁止 `*.test.ts` 引用 `.probe`；本测试文件初版曾使用 `chief.probe`/`product.probe`，已按审计要求把测试夹具属性/标识符统一改名为 `capture`（语义与断言不变），组合运行 25/25 通过。
- **C1a/C1b/C2 为未提交候选**：本实现按冻结形状消费（`public.ts` 的 build/render + 三个上限常量、`roleDirectories.error`、`cardSections.title`）；若上游候选后续变更，受影响证据重跑。

## 7. 状态

`implemented-unverified`。本记录不授权提交/推送/合并/发布；验收通过也不授权上述操作。
