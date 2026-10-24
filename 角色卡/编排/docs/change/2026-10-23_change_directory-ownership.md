# 变更记录：目录级授权与目录规范（teamPlanSchema v3）——编排

- 任务 ID：`2026-10-23-directory-ownership`
- 产品 flowId：`directory-ownership`
- 角色：编排（D4 核心；v3 契约先行）
- 日期：2026-10-23
- 状态：**implemented-unverified**（已实现、定向检查通过；未经独立验收，不代表通过）
- 依据（客户已确认）：
  - 意图与闸门 0/1/2/实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
  - 策划方案 v1：`docs/planning/2026-10-23_design_directory-ownership.md`（§4–§6、§8、§9、§13 Q1–Q12 推荐 A；Q1 A `directories` 强制、Q9 A `实现目录` 必填）
  - 验收标准 v1.1：`docs/acceptance/directory-ownership-criteria-v1.md`（P1/P2/P3/P7/P8/P9/P10/P12/P13/P14）
  - 团队计划：`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`（§4.3 编排、§5 D4、§6 证据、§8 闸门 2）
- 契约输入：运行时核心已扩展的 `GovernanceJudgeFacts.teamPlanSchema?: 1 | 2 | 3` 与 `teamPlanDirectories?: string[]`（只读消费；本角色未改 `src/model/**`）。
- 写集：`src/common/编排/team-plan.ts`、新增 `src/common/编排/directory-conformance.ts`、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/team-plan.test.ts`、新增 `test/编排/directory-conformance.test.ts`、本角色自身文档与证据目录。**未写** `src/common/门禁引擎/**`、`src/model/**`、`app/**`、`test/测试/**`、`test/桌面应用/**`、`src/common/shared/**`、package/tsconfig/vite、其他角色卡/边界。

## 一、用户可见入口

- **Convener 任命卡前守卫**（`run-role.ts::validateConvenerAppointmentCard`）：Convener 发 `request_choice(cardKind=appointment)` 前，对 `teamPlanSchema: 3` 的团队计划跑 V1–V11 + **V-D1–V-D9**。任一 `error` ⇒ 不生成客户卡、不镜像、不写账本、不占 pending，把具体目录/规范问题退回 Convener；`warning`/`exception-review` 不阻断发卡（交 readiness）。
- **v3 团队计划可被接受**：frontmatter `teamPlanSchema: 3`、`directories`、模块清单 `实现目录`、角色表 `授权目录`/`精确写集`、目录规范表齐全且通过确定性校验时，守卫返回 `teamPlanSchema: 3`（类型 `1 | 2 | 3`）。
- **旧流程不受影响**：v1（缺省/`1`）与 v2（`2`）行为逐字不变；v3 不改变 flow schema/V11。
- **布局核对纯函数可用**（经 pipeline 公共出口）：`checkDirectoryLayout` 把候选改动路径映射到目录规范并逐项核对，供测试角色/验收生成布局核对报告；纯函数不读 git、不写报告。

## 二、改动摘要（按文件）

### 1. `src/common/编排/team-plan.ts`（v3 单一解析/校验，仍是唯一实现）

- 版本：新增 `TEAM_PLAN_SCHEMA_V3 = 3`；`TeamPlanParseResult.teamPlanSchema: 1 | 2 | 3`；未知 schema 报 V1 error；缺省/`1` 走 legacy、`2` 走既有 v2 分支（既有 v2 断言全部保持通过）。
- 新类型/字段：
  - `DirectoryKind = implementation|tests|docs|evidence|shared`、`DirectoryShared = none|read-only|split`、`DirectorySubdirs = string[] | "*" | "**" | "—"`、`DirectorySpec`（12 字段）。
  - `TeamPlanModule.implementationDir?`；`TeamPlanRoleRow` 新增 `authorizedDirsRaw/authorizedDirs/preciseWritesetRaw/preciseWritesets/authorizedDirIssues/preciseWritesetIssues`。
  - `TeamPlanParseResult.directories/directorySpecs`（v1/v2 为空数组）。
  - `ParseTeamPlanOptions.projectRoot?`（只读；给出时做 v3 路径 realpath 逃逸核对）。
- frontmatter `directories`：非空内联数组；每项项目相对、以 `/` 结尾、无通配符/`..`/绝对路径/盘符/UNC/空白/尾随空格或点/重复（大小写不敏感）；不得与治理关键路径或 `角色卡/` 重叠。
- 模块清单：v3 必须有 `实现目录` 列且每个 module 非空（缺失列、`—`/空 ⇒ V-D6 error；Q9 A）；角色 `implementation`/`tests`/`docs` 目录必须在对应模块 `实现目录` 内或等于模块目录（Reduce 跨模块测试角色豁免该归属检查，仍受整层黑名单/治理路径约束）。
- 角色表：v3 用 `授权目录` + `精确写集`；`唯一写集` 作为 `精确写集` 兼容别名并产生 warning；`边界` 列名在 v3 报列名 error；`授权目录` 分号分隔、每项必须在 `directories` 且规范 owner 一致；`精确写集` 为精确文件（目录项 warning，建议放 `授权目录`）；治理关键路径只能精确文件。
- 目录规范表：`目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享`（接受设计英文别名）；类型枚举、命名枚举/`*.ext`/`/regex/`、子目录 `—`/显式/`*`/`**`、扩展名 `*` 仅 docs/evidence、契约路径或 `internal`+理由、测试面必填规则、依赖存在/自依赖/重复/DAG 无环/与角色 `dependsOn` 方向一致、禁写区语法与冲突、共享枚举。
- V-D1–V-D9 全部实现（规则表见 §三）；`warning`/`exception-review` 不阻断；不调用模型，语义仍归 Convener readiness。

### 2. 新增 `src/common/编排/directory-conformance.ts`（布局核对纯函数）

- 导出 `DirectorySpec`（复用 `team-plan.ts` 类型，不复制解析）、`LayoutCheckInput`、`LayoutCheckChecks`、`LayoutCheckRow`、`LayoutCheckResult`、`checkDirectoryLayout(input)`、`layoutCheckPassed(result|rows)`。
- 规则：
  - 跳过管理记录（顶层 `docs/communication|planning|scheduling|acceptance`）与角色根工作文档（`角色卡/<roleId>/...`），结果行 `skipped: true`。
  - 最长前缀匹配 owner；无匹配/同长度多 owner/`roleDirs` 与规范 owner 不一致 ⇒ fail；可选 `roleId` 时，命中他人目录 ⇒ fail（Map 角色自检口径）。
  - 扩展名、子目录（`—`/显式/`*` 一层/`**`）、命名（目录名与文件名；`*.test.ts` 匹配全名，case 枚举匹配主名）、禁写区（前缀/文件名/`*.ext`）、路径安全（`..`/绝对/盘符/UNC/空段/尾随空格点；可选 `projectRoot` 时 realpath 逃逸）。
  - 删除按原路径核对（必须在自己目录内）；重命名取 `old -> new` 的新路径；解析 `git status --short` 前缀。
  - 不读 git、不写报告、不调用模型；路径规范化/大小写/realpath 复用 `src/common/shared/path-primitives.ts`。

### 3. `src/pipeline/orchestration/run-role.ts`

- `teamPlanRoleRowIssues(text, recommended, projectRoot)`：v3 的 V-D error 由同一 `parseTeamPlan` 产出；legacy/v2 文案不变。
- `validateConvenerAppointmentCard`：两次 `parseTeamPlan` 均带 `projectRoot`（v3 realpath 核对）；返回 `teamPlanSchema: 1 | 2 | 3`；失败路径保持「不弹卡/不写账本/不占 pending」。
- `computeJudgeContext`（appointment）：`facts.teamPlanSchema` 可为 3；新增有界 `facts.teamPlanDirectories`（≤20 项、每项 ≤96B）；不新增 artifact kind。
- Pipeline 公共出口再导出 v3 类型/函数：`TEAM_PLAN_SCHEMA_V3`、`DirectorySpec/DirectoryKind/DirectoryShared/DirectorySubdirs`、`governanceDirectoryHit`、`checkDirectoryLayout`、`layoutCheckPassed`、`LayoutCheck*`；桌面/测试只经此出口消费，**不保留第二份解析器**。

### 4. `src/pipeline/orchestration/govern-session.ts`

- `STANDARD_WORKFLOW_PROMPT` 新增「团队计划 v3（目录级授权）」块：`directories`、模块 `实现目录`（必填）、角色表 `授权目录`/`精确写集`、目录规范表、共享策略、治理关键路径、执行角色目录内自治与跨目录限制、readiness 逐目录复核；保留 v2 兼容说明。
- Convener 纪律新增 v3 写法与 readiness 的 `directories/spec/shared/layout` 逐目录列；Crew 纪律新增「按计划目录写 boundary」（目录条目 + 精确文件；`new` 一致、`changed`/`existing` 计划 ⊆ 边界；V12 写卡后校验）。
- 不改变派发权/客户入口/工具语义。

### 5. 测试

- `test/编排/team-plan.test.ts`：新增 v3 夹具与 12 个正/负用例组（见 §四）；既有 17 个 v2/v1/V11 用例逐字保留并通过。
- 新增 `test/编排/directory-conformance.test.ts`：15 个用例，覆盖目录内新增/子目录/最长前缀/他人目录/禁写区/命名/子目录越界/扩展名/路径逃逸/多 owner/split/删除/重命名/管理记录跳过/realpath。

## 三、V-D1–V-D9 实现与测试对照

| ID | 实现（`team-plan.ts`） | 测试（`team-plan.test.ts`） |
| --- | --- | --- |
| V-D1 | `parseTeamPlanDirectories`：非空/内联数组、路径安全、重复（大小写不敏感）、治理关键路径/密钥路径重叠 | 缺/空/块数组/重复/`..`/盘符/尾随点/大小写重复/12 条治理路径 |
| V-D2 | 规范表存在与列齐全、恰好覆盖 `directories`（多/少/重复）、owner 为推荐角色、必填字段、类型/共享枚举、测试面规则 | 缺表/缺列/缺行/多行/重复行/owner 非推荐/用途空/类型非法/测试面空/共享非法 |
| V-D3 | 角色 `授权目录` 在 `directories`、owner 一致、非 split 目录无孤儿、推荐角色至少一目录或精确写集（文件例外需 `粒度理由`） | 未声明目录/owner 不符/孤儿/文件例外缺理由 |
| V-D4 | 不同角色目录相同/祖先/子目录、精确文件落入他人目录、精确文件相等（`planPathsOverlap` 复用 `writesetsOverlap` + `compareKey`） | 同目录/嵌套/精确文件落入他人目录/精确文件相等 |
| V-D5 | 命名/子目录/扩展名/契约/依赖语法；依赖目标存在、自依赖/重复、DAG 无环、与角色 `dependsOn` 方向一致；禁写区冲突；split 语法 | 依赖不存在/方向不一致/成环/禁写区冲突/子目录非法/扩展名 `*`/internal 无理由 |
| V-D6 | v3 模块 `实现目录` 必填非空；角色 implementation/tests/docs 目录归属；整层名 tripwire（无理由 error / 有理由 exception-review）；单文件目录 warning | 缺列/空值/不在实现目录/整层无理由/整层有理由 exception-review/单文件 warning |
| V-D7 | 治理关键路径清单（`.ans/`、`角色卡/`、`docs/scheduling|acceptance|communication|flows|nominations|verification/`、`src/common/shared/`、`.github/workflows/`、`src/common/装配/`、`src/model/`、`.env`/密钥段）不得作普通授权目录；精确写集中的目录项同样拒绝 | 12 条治理目录（V-D1 拒绝并标注 V-D7）+ 精确写集目录（`src/common/shared/`） |
| V-D8 | shared none/read-only 唯一 owner；split 父目录不得直接分配、必须允许子目录、子目录有 owner | split 父目录被分配 |
| V-D9 | posix 规范化、`..`/空段/盘符/UNC/尾随空格点、大小写不敏感比较；给出 `projectRoot` 时对已存在祖先 realpath 逃逸核对 | `..`/UNC/角色 `授权目录` 逃逸；conformance realpath 正例 |

## 四、测试与命令（原始日志见证据目录）

- 环境：Windows 11 Pro 10.0.26300 / Git Bash；Node v24.22.1 / npm 11.19.1；HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`。
- 命令：`node --test "test/编排/**/*.test.ts"` ⇒ **796 tests / 795 pass / 1 fail / 0 skipped / 0 todo**，退出码 1。
  - 唯一失败：`test/编排/shell-authorized-routine.test.ts:103` 「node test外指符号链接路径不获委托」`EPERM: operation not permitted, symlink`——与基线（B0：9 EPERM + 1 桌面偶发）一致的既有 Windows 符号链接失败，非本变更引入。
  - 原始日志：`角色卡/编排/docs/change/2026-10-23_change_directory-ownership-evidence/01-test-orchestration.log`。
- 定向：`team-plan.test.ts` 29/29 + `directory-conformance.test.ts` 15/15 = **44/44 pass**。
- 命令：`npm run typecheck` ⇒ 退出码 1，唯一错误 `app/desktop/interface.ts(1125,5): Type '1 | 2 | 3' is not assignable to type '1 | 2'`——属并行角色桌面窗口（D5 `TeamPlanInfo` v3）尚未消费 v3 类型；本角色未修改 `app/**`，如实报告。原始日志：`.../02-typecheck.log`。
- v1/v2 legacy：既有 v2 正向/负向/V11 用例全部通过；v2 计划不要求 `directories`/`实现目录`，`TeamPlanParseResult.directories=[]`、`directorySpecs=[]`。
- V11：v3 计划在同一模块/角色/并行组下 `validateTeamPlanFlowConsistency` 返回 `[]`；flow schema 未改。

## 五、已知边界与未做项

1. **V12（计划→边界覆盖）属桌面窗口 D5**：本角色只提供 v3 解析结果/公共出口与 `new`/`changed`/`existing` 语义所需的字段；未改 `app/**`、未实现/复制 V12。
2. **v3 完整链路 e2e、布局核对 e2e、T3 全量回归、真实启动/演示属 D6/D7（测试角色）**；本角色不声称 T3 验收通过，不写 `docs/verification/`。
3. **不做任务级 `writeDirs`**（策略 A，客户已确认）：未改 `TaskScope`/F4/`resolve-write.ts`/session/dispatch/provider。
4. **`实现目录` 归属按验收标准 v1.1/Q9 A 字面执行**：角色 implementation/tests/docs 目录必须位于模块 `实现目录` 内（或等于）；Reduce 跨模块测试角色豁免该归属检查（设计未给 Reduce 模块实现目录），仍受整层黑名单/治理路径/重叠约束。
5. **单文件目录 warning 是确定性启发式**：仅当角色仅一个授权目录、无精确写集、`允许子目录` 为 `—` 且仅一种扩展名时提示，交 readiness 判断；不代表真实文件计数。
6. **realpath 逃逸核对只在给出 `projectRoot` 时执行**（卡前守卫会给出）；`parseTeamPlan` 纯文本调用只做词法核对。`directory-conformance` 的 `projectRoot`/`roleId` 为可选扩展（设计 §8.2 字段之外，向后兼容）。
7. **`directory-conformance` 删除/重命名输入约定**：接受 `git status --short` 行或纯路径；重命名取 `->` 后新路径。报告/原始 `git status` 仍由调用方保存。
8. **`app/desktop/interface.ts` 类型错误**为并行角色待办（D5），本角色未触碰；`src/model/runtime.ts`/`src/common/门禁引擎/governance-roles.ts` 的 v3 相关改动为并行角色既有上下文，不纳入本变更候选。
9. 未提交、未暂存、未推送、未合并、未发布。

## 六、候选哈希（产品代码/测试；工作区当前内容）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/编排/team-plan.ts` | `68700bec4fbe8a13d3b6767e88870f1f9d7d37e1` | `f976fd0925d7661f71f1b84cf48b04cce07bc19f8b65c696c5cceecbcdc1b5e7` |
| `src/common/编排/directory-conformance.ts` | `400af3c2d4a9a9338ded55d7acd106f931648456` | `a8168a73033b902084465e5d76e0e37724e6de91d6a635e503d8349a6240f5db` |
| `src/pipeline/orchestration/run-role.ts` | `846ab5a03796211c219c5dea2c1e237a9e312f82` | `46204a7e6624439dcfaa4866d424186638cb33216252a9ec26ea51e8fc3e98fd` |
| `src/pipeline/orchestration/govern-session.ts` | `eac5c3df0048f41d4e098a586872b4961fd607fb` | `195b5100197486299327d038599cdf974b247aa57e79fff2dab4bafa6a3358f0` |
| `test/编排/team-plan.test.ts` | `2bf9b5c9be13788f7209e4ab9a92d64cf3ee69c5` | `46d657bad532fe7eabb6eb1b8dc079b7047fd96450e33b48e4ec6d5aab2c356e` |
| `test/编排/directory-conformance.test.ts` | `23b3d7405d02f736abad498f12d5fa1c033a959a` | `8028c7c694c7c00d01aa5db47488dc27648ab22173a9914cbcc7c8d91b9581dc` |

> 哈希在文档写盘后复算；若上述文件随后变化，受影响证据失效。
