# 变更记录：目录级授权 v3 桌面窗口（v3 解析消费 / V12 扩展 / 任务文案）

- **任务**：`2026-10-23-directory-ownership`（变更 B，风险档位 **T3**），节点 **D5（Map B：桌面消费）**
- **记录角色**：桌面窗口 worker，独立角色上下文
- **日期**：2026-10-23
- **状态**：**implemented-unverified**（实现完成、本角色 `interface.test.ts` 与 `npm run typecheck` 已跑；**未做 D6/D7 e2e、全量回归、真实启动/演示与独立验收；未 commit/push**）
- **授权与依据**：
  - 客户闸门 0/1/2 确认与实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
  - 方案：`docs/planning/2026-10-23_design_directory-ownership.md`（§5.3 V12 扩展、§7、§8.2、§8.3；Q5 A 运行期策略 A、Q9 A `实现目录` 必填）
  - 实施前验收标准 v1.1：`docs/acceptance/directory-ownership-criteria-v1.md`（P1/P8/P9/P10）
  - 团队计划：`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`（§4.3 桌面窗口、§5 D5、§6 证据、§8 闸门 2）
  - D4 已冻结契约：`src/common/编排/team-plan.ts`（v3 解析/V-D1–D9）、新增 `src/common/编排/directory-conformance.ts`、公共出口 `src/pipeline/orchestration/run-role.ts`（`TEAM_PLAN_SCHEMA_V3`/`parseTeamPlan`/`parseWritesetCell`/`writesetsOverlap`/`isGovernanceWritesetPath`/`governanceDirectoryHit`/`teamPlanIssueMessages`/`checkDirectoryLayout`/`layoutCheckPassed` 及 v3 类型）、运行时核心 `GovernanceJudgeFacts.teamPlanSchema?: 1|2|3`、门禁引擎三张卡文本 v3
- **基线**：`main` / HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`。写前 `npm run typecheck` 唯一红：`app/desktop/interface.ts(1125,5)` TS2322（`1 | 2 | 3` 不可赋给 `1 | 2`）；写前 `node --test test/桌面应用/interface.test.ts` 97/97 pass。原始记录见 `2026-10-23_change_directory-ownership-evidence/environment.txt`。
- **并发上下文**：工作树同时存在 i18n B0（`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`app/desktop/i18n.ts`、`preferences.ts` 及其 `interface.ts` 偏好接线、`interface.test.ts` i18n 用例）与人事按闸门 2 的 `boundary.md`/`changelog.md` 漂移校正——均属并发上下文，不纳入本变更新增候选；本记录只描述 D5 改动。

---

## 一、本批交付（D5 桌面消费）

### 1.1 类型闭环与单一解析器（`app/desktop/interface.ts`）

- `TeamPlanInfo.teamPlanSchema` 扩为 **`1 | 2 | 3`**；新增 v3 视图字段：`directories: string[]`（frontmatter `directories`）、`directorySpecs: DirectorySpec[]`（目录规范表）、`moduleList` 保留模块 `实现目录`（`TeamPlanModule.implementationDir`）。
- `TeamPlanRoleRow` 新增 v3 视图字段 `authorizedDirs`/`preciseWritesets`（`WritesetEntry[]`；v1/v2 为空）与 `authorizedDirsRaw`/`preciseWritesetRaw`（视图/文案）。
- `parseTeamPlanInfo` 仍**只经** `src/pipeline/orchestration/run-role.ts` 公共出口消费 `parseTeamPlan`/`teamPlanIssueMessages`，**未复制 v3 解析/V-D 规则**；v3 返回 `teamPlanSchema: 3` 与目录/规范信息；v1/v2 legacy 分支行为与文案逐字保留（含「团队计划未声明 teamPlanSchema: 2…」迁移 warning）。
- 修复 `app/desktop/interface.ts(1125,5)` TS2322（typecheck 现已 0 错误）。

### 1.2 V12 扩展（`validateAppointmentArtifacts`，Crew 写卡后、readiness 前）

仅对 `teamPlanSchema: 3` 生效（v2 分支逐字保留）：

- **覆盖**：每个计划 `授权目录` 必须被该角色 `boundary.yaml` 的 `directory`/`conditional-directory`（same/ancestor）覆盖；每个 `精确写集` 文件必须被 `file` 或 `directory` 覆盖。覆盖判定复用编排解析器给出的 `WritesetEntry` + `writesetsOverlap`，路径规范化/大小写复用 `src/common/shared/path-primitives.ts`（`compareKey`/`isUnderOrEqual`）。
- **`new` 角色**：boundary 目录条目（排除角色根 `角色卡/<roleId>/`）必须与计划 `授权目录` **集合一致**——不得更宽（额外/祖先目录）也不得更窄（被祖先覆盖但缺少逐条目录条目）；违反阻塞并退回 Crew。
- **`changed`/`existing`**：计划 ⊆ 边界即可；边界更宽部分在该角色模块 `实现目录`（模块清单，排除 `reduce`）内可接受；越出模块实现目录或多模块扩张 → **warning + readiness**（不硬拒）；`existing` 的宽边界只 warning + 迁移提示（下次实质变更时收窄/迁移），不强制重写。
- **来源分流**：Crew 文件问题（boundary 条目/覆盖/`new` 一致性）反馈 Crew；计划问题（授权目录缺目录规范行、模块缺 `实现目录`）来源 Convener；问题列表带 `source`/`warning`，可供任务文案/readiness 使用。
- **V12 任一阻塞 ⇒ 不派 readiness、不写 readiness 派发账本**；仅 warning（existing/宽边界）不阻塞。
- **v2 V12 逐字不变**：精确写集必须被 entries 覆盖；existing 只 warning；文案保持原文。

### 1.3 任务文案（`app/desktop/governance-advance.ts`）

- `teamPlanSchema` 选项类型统一为 **`1 | 2 | 3`**（`BuildGovernanceAdvanceMessageOptions`、`buildAppointmentWriteReminderMessage`、`buildRoleReadinessTaskMessage`、`buildAcceptanceCriteriaTaskMessage`、`BuildAcceptanceTaskMessageOptions`）。
- 仅 v3 追加：
  - **Crew 写卡**（`buildGovernanceAdvanceMessage` appointment/role-card-write 分支 + `buildAppointmentWriteReminderMessage`）：boundary 按 `授权目录` 写目录条目、按 `精确写集` 写文件条目；`new` 边界与计划一致（排除角色根、不得更宽/更窄）；`changed`/`existing` 计划 ⊆ 边界且更宽部分限于模块实现目录/既有职责；不得改目录规范/跨目录/写他人目录；治理关键路径（角色卡/边界、`.ans`、`src/common/shared`、release/packaging、密钥）只精确授权；文案含计划 `授权目录` 摘要。
  - **readiness**（`buildRoleReadinessTaskMessage`）：逐角色核对授权目录+精确写集；逐目录核对目录规范/共享策略/治理关键路径；三处一致、唯一 owner、不重叠、模块实现目录、`new` 一致、`changed`/`existing` 覆盖与宽边界依据；readiness 记录列 **`directories/spec/shared/layout`** 并保留 v2 列；文案含目录与模块实现目录摘要（`module→dir`）。
  - **验收**（`buildAcceptanceCriteriaTaskMessage` ⑩ / `buildAcceptanceTaskMessage` ⑧）：标准/验收须覆盖 v3 schema、V-D1–D9/V12、共享/治理关键路径、布局核对（改动路径 → 目录规范）并附**原始 `git status`/`diff`（含未跟踪）与候选哈希**；报告与候选不符或 fail 仍判 pass 不得建议 accept。
- **legacy v2 文案逐字保留**（v3 追加段仅在 `teamPlanSchema === 3` 时拼接）；**发给 agent 的任务文案本轮不翻译**（i18n B3 只翻译用户可见系统行）。

### 1.3a D6 缺口修正（2026-10-23 追加）

D6 测试发现提案接受后的 Convener 任务文案仍默认写 v2（与 v3 卡文本/Crew/readiness/验收不一致，真实模型可能照任务文案写 v2）。本批修正：

- `buildGovernanceAdvanceMessage` proposal-accept 分支：**新流程默认 v3**——要求 frontmatter `teamPlanSchema: 3` + 非空 `directories`、模块清单每个 module 的非空 `实现目录`（Q9 A）、角色表 `授权目录`+`精确写集`、目录规范表（12 字段）、每目录唯一 owner/不重叠/共享策略、治理关键路径只精确授权、readiness 逐目录 `directories/spec/shared/layout`；不再出现「新流程默认 v2」。
- **v2/legacy 续接分支保留**：调用方显式传 `teamPlanSchema: 1|2`（已有计划）时，原 v2 文案逐字不变；`interface.ts` 提案派发现在读取既有团队计划并把实际 schema 传给文案（无既有计划 ⇒ 不传 ⇒ v3 默认）。
- `interface.ts` 同口径修正：计划修正反馈（`buildAppointmentPlanFeedback`）按实际 schema 提示 v3（directories/实现目录/授权目录/精确写集/目录规范），v2/legacy 文案不变；「客户手选与推荐集不同」系统行按实际 schema 提示「修订团队计划为 v3/v2」。
- e2e harness（非产品）：`test/桌面应用/e2e/main.mjs` 自建窗口不经过 `app/main.ts`，确认 `No handler registered for 'preferences:get'` 是 harness 注册缺口（真实主进程经 `registerPreferencesIpc` 注册）。已在 harness `registerIpc` 按真实契约同形补 `preferences:get` / `preferences:set-locale` 内存桩（不写盘、不触仓库 `.ans`/`.env`），未改产品代码。

### 1.4 测试（只改既有精确文件）

`test/桌面应用/interface.test.ts` 新增 **8** 例（未新建 `test/桌面应用/` 文件）：

1. v3 任务文案：Crew/readiness/验收标准/验收任务含授权目录/规范/布局；**提案接受后新流程默认 v3**（含 `teamPlanSchema: 3`/`directories`/`实现目录`/`授权目录`/`精确写集`/目录规范/readiness 列，且不再默认 v2），显式 v2 续接保留原 v2 文案；v2 文案不出现 v3 追加段；
2. v3 计划解析读取（授权目录/精确写集/目录规范/实现目录）+ V12 覆盖通过 ⇒ readiness 文案含目录与 `directories/spec/shared/layout`、账本 `stepId=role-readiness`；
3. v3 `new` 授权目录未被 boundary 覆盖 ⇒ 退回 Crew、不派 readiness；
4. v3 `new` boundary 目录比计划宽（额外目录）⇒ 阻塞；
5. v3 `new` 被祖先目录覆盖但未逐条对应计划目录（集合不一致/更窄）⇒ 阻塞；
6. v3 `changed` 边界更宽越出模块实现目录 ⇒ warning（不硬拒）+ 未覆盖精确写集仍阻塞；
7. v3 `existing` 宽边界只 warning + 迁移提示，仍派 readiness；
8. v3 来源分流：目录规范缺失（计划问题）⇒ 反馈 Convener、不退回 Crew。

既有 v2/V12/legacy 断言未删除、未放宽；`test/桌面应用/operator-wiring.test.ts` 仅因提案接受文案变化做**显式 v2 续接**适配（新增 `teamPlanSchema: 2` 以断言原 v2 文案逐字保留），并复跑 52/52 pass。

---

## 二、用户可见入口

| 入口 | 代码位置 | 行为 |
| --- | --- | --- |
| 团队计划读取（Crew/readiness/验收共用） | `app/desktop/interface.ts::parseTeamPlanInfo`（经 `run-role.ts` 公共出口） | v3 返回 `teamPlanSchema: 3` + `directories`/`directorySpecs`/`moduleList.implementationDir`/角色 `authorizedDirs`·`preciseWritesets` |
| Crew 写卡任务 | `governance-advance.ts::buildGovernanceAdvanceMessage`（appointment/role-card-write）、`buildAppointmentWriteReminderMessage`；派发 `interface.ts::advanceGovernanceFlow` | v3 明确授权目录+精确写集写边界、`new` 一致、`changed`/`existing` 覆盖、目录规范/治理关键路径 |
| 写卡后 V12 门控 | `interface.ts::validateAppointmentArtifacts` → `reportAppointmentArtifactIssues` | 阻塞 ⇒ 按来源反馈 Crew/Convener、不派 readiness；warning ⇒ 只诊断、继续 |
| role-readiness 任务 | `governance-advance.ts::buildRoleReadinessTaskMessage`；派发 `interface.ts::advanceGovernanceFlow` post-write 检查 | v3 逐目录 `directories/spec/shared/layout`、目录规范/共享/治理路径/边界对齐复核 |
| 实施前标准 / 验收任务 | `governance-advance.ts::buildAcceptanceCriteriaTaskMessage` / `buildAcceptanceTaskMessage`；派发 `interface.ts` 验收门槛 | v3 标准/验收含布局核对报告 + 原始 `status`/`diff` + 候选哈希 |

---

## 三、验证（本角色，当前候选）

环境：Windows 11 + Git Bash；Node **v24.22.1** / npm **11.19.1**（`export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`）；cwd 仓库根。

| # | 命令 | 退出码 | 计数 | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `node --test test/桌面应用/interface.test.ts` | **0** | **105 tests / 105 pass / 0 fail / 0 skip / 0 todo**（基线 97 + 本批 8） | `2026-10-23_change_directory-ownership-evidence/interface-test.log` |
| 2 | `node --test --test-name-pattern "v3" test/桌面应用/interface.test.ts` | **0** | **8 tests / 8 pass / 0 fail**（本批聚焦） | `.../interface-test-v3-focused.log` |
| 3 | `node --test test/桌面应用/operator-wiring.test.ts`（显式 v2 续接适配，v2 文案回归） | **0** | **52 tests / 52 pass / 0 fail** | `.../operator-wiring.log` |
| 4 | `npm run typecheck` | **0** | 0 个 `error TS`（基线唯一红已修复；当前含编排/门禁/运行时核心 v3 并行改动，全部通过） | `.../typecheck.log` |
| 5 | `./node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs`（真实 Electron 自检台；D6 追加验证 preferences 桩） | **0** | **E2E_PASS=true / E2E_FAILURES=（空）/ E2E_DONE=1**；`No handler registered for 'preferences…'` **0** 处 | `.../e2e-main-report.txt`、`.../e2e-main-summary.txt`、`.../e2e-main-stdout.log` |
| 6 | `node --check test/桌面应用/e2e/main.mjs` | **0** | 语法通过 | 见 `.../e2e-main-summary.txt` 上下文 |

**时序偶发说明**：本批最终候选连续复跑 `interface.test.ts` 均全绿（105/105、exit 0）；开发中曾出现一次新增用例等待/账本落盘时序（已在用例内改为有界轮询），未观察到既有桌面时序偶发。原始日志保留；若并行全量出现桌面时序偶发，按验收标准以隔离/串行复跑分类（不在本批）。

**写集核对**：本批改动仅 `app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/operator-wiring.test.ts`（条件精确文件：提案接受文案断言）、`test/桌面应用/e2e/main.mjs`（既有精确文件：harness 偏好桩）、`角色卡/桌面窗口/api-spec.md` 及本记录/证据；未触碰 `app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`、其他 `test/**`、package/tsconfig/vite、其他角色卡/边界、`docs/scheduling|acceptance|communication`；**未新建 `test/桌面应用/` 文件**；无新依赖；未提交/未暂存。

---

## 四、候选哈希（工作区，未提交）

完整原始输出（`git hash-object` + `sha256sum`，含证据文件）见 `2026-10-23_change_directory-ownership-evidence/hashes.txt`。

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/interface.ts` | `61e91311207c739d560d308577135c2205feffb8` | `1f580f0f5ba5431461fbd451034ab95314651f47a4b9d7a4fc3e39548c305ed4` |
| `app/desktop/governance-advance.ts` | `8f90a7138a2742509c484e5c856b26497878c3e7` | `90dbfbd1cb32474b8687d11e02cbe507f1c8773f57af8e1e7bd6499975e4bb90` |
| `test/桌面应用/interface.test.ts` | `3e3b9083f646aaf0d5925d1915ab9408fd6fc842` | `45cec1f88f0a8fc3cca47443f45fea93898faf500d21bd0b1891dbf204711242` |
| `test/桌面应用/operator-wiring.test.ts` | `679d3ce6809beea3dac0be493b9bb535ba5cc10c` | `997af101d9cd103b4945c48a05417dd8b8741d31d12cf6a8c4a98dcdd45713cb` |
| `test/桌面应用/e2e/main.mjs` | `67f0572e700fbfc9bfe65e480a37ac307909d456` | `ec77bf3be4ac359bb4b82b5698c49667fd251705ad182279842ca674140fbe7a` |
| `角色卡/桌面窗口/api-spec.md` | `5a959b8fb3912df2ce90c3a216d06c2fd9897081` | `0000e045af6e8b5a77c1f69de1a55e9c9bf759c37851da53c6e6e811888bf95f` |

> 本记录与证据日志的哈希在 `hashes.txt`（写盘后补录）；`test/桌面应用/e2e/main.mjs` 仅补 harness 偏好桩（非产品），`operator-wiring.test.ts` 仅做显式 v2 续接适配（断言未放宽）。

---

## 五、已知边界与未做项

1. **D6/D7 不在本批**：跨角色 v3 夹具/负例/完整链路/布局核对 e2e、T3 全量回归（`node --test "test/**/*.test.ts"`）、真实启动/演示由测试角色与验收按团队计划执行；本记录**不声称 T3 验收通过**、不声称 v3 端到端已验。D5 修正后额外跑了既有真实 Electron 自检台（`E2E_PASS=true`）仅用于验证 e2e harness 的 preferences 桩与既有链路未回归，不替代 D6/D7。
2. **运行期策略 A（客户 Q5 A）**：本轮未改任务级 `writeDirs`/`TaskScope`/F4/session/派发；计划目录的更细约束由边界目录（运行期硬拦）+ 任务文本 + V12/readiness/布局核对保证。计划目录比边界窄时，写盘由边界拦、越界由验收发现——属已确认策略，不是本批缺陷。
3. **「既有职责」是语义判断**：V12 确定性核对模块实现目录与目录集合；`changed`/`existing` 宽边界的「既有职责」依据由 Convener readiness 逐条记录（V12 的 warning 已把该项交给 readiness），应用不宣称语义正确。
4. **v3 仅作用于 `teamPlanSchema: 3`**：v1 legacy/v2 计划行为、文案与 V12 均不变；迁移不设硬截止、不重写历史计划/边界。
5. **`test/桌面应用/` 逐文件授权**：未新建文件；`acceptance-dispatch.test.ts`/`runtime-resolution.test.ts` 未写（按团队计划 §4.5 属 Markdown/YAML 漂移校正范围，交人事/闸门 2）。
6. **agent 任务文案未翻译**：本批新增/调整的任务文案保持中文；i18n B3 只翻译用户可见系统行。
7. **未 commit / 未 push / 未暂存**；本记录是 D5 实施记录（`implemented-unverified`），不是测试报告、不是验收结论。

---

## 六、证据文件

目录：`角色卡/桌面窗口/docs/change/2026-10-23_change_directory-ownership-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 日期、cwd、branch/HEAD、Node/npm、写前基线（typecheck 唯一红 + interface 97/97）与并发上下文说明 |
| `interface-test.log` | `node --test test/桌面应用/interface.test.ts` 原始输出（105/105、exit 0） |
| `interface-test-v3-focused.log` | 本批 8 例聚焦复跑（8/8、exit 0） |
| `operator-wiring.log` | 未改文件回归 `node --test test/桌面应用/operator-wiring.test.ts`（52/52、exit 0） |
| `typecheck.log` | `npm run typecheck` 原始输出（无错误、exit 0） |
| `git-status.txt` / `git-diff-stat.txt` / `git-diff-name-only.txt` | 工作区原始 status/diff 清单（含并发上下文） |
| `e2e-main-report.txt` / `e2e-main-stdout.log` / `e2e-main-summary.txt` | 真实 Electron 自检台原始报告与 stdout（E2E_PASS=true / E2E_FAILURES 空；preferences handler 错误 0 处） |
| `hashes.txt` | 候选文件、本记录与证据文件的 `git hash-object`/`sha256sum` |
