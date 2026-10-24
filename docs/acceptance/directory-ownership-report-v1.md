**风险档位：T3（治理/权限/流程设计变更）｜判定依据：客户确认的目录授权方案 v1 + 验收标准 v1.1（P1–P15/G1–G3）+ 技能 `references/testing.md`（T3 适用全量回归）｜选定检查：25 个候选文件哈希复算、T3 串行全量回归、`governance-e2e-auto` 123/123、`directory-layout` 1/1、双端 typecheck、真实 Electron、v3/legacy 链路、V-D/V12/卡文本/readiness 证据，以及两项验收补充定向检查（V-D7 密钥路径、V-D9 realpath）｜复用证据：同候选的最终测试记录与原始日志（`角色卡/测试/docs/change/2026-10-23_change_directory-ownership.md` + `2026-10-23-directory-ownership-evidence/`；各 owner 记录）｜全量回归：已执行——最终候选 355 文件（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`）3655/3628/9/18，9 项均为既有 Windows symlink EPERM，0 项新增确定性失败**

# 验收报告：目录级授权与目录规范（directory-ownership）

- 任务 ID：`2026-10-23-directory-ownership`
- 产品 flowId：`directory-ownership`
- 验收标准：`docs/acceptance/directory-ownership-criteria-v1.md` **v1.1**（SHA-256 `a619ea38000e5ce0571acabb5e8dd45648edcff7355ba60d6ac99d6c2c5908a2`；blob `18b7eaf3fa2d03021bdf9d73f8fd69817c007a85`）
- 验收基线：客户闸门 1 确认的策划方案 v1 `docs/planning/2026-10-23_design_directory-ownership.md`（SHA-256 `0f36fcd297bbefebb8826e5de41e9b2342cdd68a1bbe7e85c593bb100cc97ad6`）；上位依据 `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（SHA-256 `f3098298f19ef21db2d473b88321e7ac18df23fee0cbea3813ba55fcb5d776a6`）
- 变更包：`docs/scheduling/directory-ownership-change-v1.md`（133 行；SHA-256 `1bc2c49110dffdb764b9a9ba2038417b090865e73bf8dab4c7a8ed632aac0e43`；blob `1a96a470d1592e2290da9419db9cc3a782062d12`）
- 候选：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；25 个候选文件工作区哈希（见 §二）
- 基线记录：`角色卡/测试/docs/change/2026-10-23_change_i18n-directory-baseline.md`（323 行；SHA-256 `f5452e9816679399aa937465576131459dbdf177f5dafe72f9582d5a0114e61b`）；B0 后、v3 前 3591/3563/10/18
- 最终测试记录：`角色卡/测试/docs/change/2026-10-23_change_directory-ownership.md`（229 行；SHA-256 `13104d88ad3e0b132710a0b24b12f32a8ab5ff7a591aac6665ff9f4d0049e00c`；blob `baec4cf68ad624ff361e6d0866fdaeebc63b487a`；状态 `verified-by-tests-only`，不是验收通过）
- 判定日期：2026-10-23
- 结论：**通过（当前候选）**
- 报告性质：独立验收报告；不是客户确认记录；不授权提交、推送、合并或发布；不为 i18n T2 背书。

---

## 一、判定结论与总体依据

### 1.1 结论

当前候选（HEAD `ee59296` + 工作区 25 个候选文件）满足客户确认的目录授权方案 v1 与验收标准 v1.1 的全部适用验收项（P1–P15、G1–G3），判定为 **通过**。

通过仅表示当前候选满足标准 v1.1；不表示已提交、已发布或已获客户验收确认。i18n（T2）是独立变更，本报告不为其判定或背书。

### 1.2 为什么不是证据不足

- 25 个候选文件 `git hash-object` 与 `sha256sum` 全部复算一致（25/25）；HEAD、工作区、暂存区可复算。
- T3 串行全量回归对最终候选执行：3655 tests / 3628 pass / 9 fail / 18 skipped / 0 todo；9 项失败逐条命中基线既有 Windows symlink EPERM 清单；本轮 0 项新增确定性失败。
- v3 完整链路、legacy v2 链路、`governance-e2e-auto` 123/123、布局核对 e2e 1/1、双端 typecheck 0、真实 Electron `E2E_PASS=true` 均有原始日志/报告。
- 验收标准中两项未被 owner 测试矩阵显式覆盖的负例（V-D7 密钥路径、V-D9 realpath 逃逸）已由验收判定时的补充定向检查验证（见 §三.6）。
- 主要残余限制是「无真实模型驱动的 v3 会话」与「已知 `write-sequencing` 挂起排除」，二者均在方案/团队计划证据边界内，且有真实 Electron 启动与确定性 e2e 补足；不是缺失必要证据。

---

## 二、候选身份复算

### 2.1 仓库身份

| 项 | 实测值 | 结果 |
| --- | --- | --- |
| HEAD | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` | 与变更包一致 |
| 分支 | `main` | 与变更包一致 |
| `git diff --cached --name-only` | 空 | 无暂存 |
| 工作树候选 | 25 个候选文件哈希全部与变更包一致 | 25/25 |
| 产品/测试越界 | 25 个候选之外无本变更新增改动；i18n B0 与管理记录为既有上下文 | 见 G2 |

### 2.2 25 个候选文件复算

复算方法：对变更包 §1.1 的每个路径执行 `git hash-object -- <path>` 与 `sha256sum -- <path>`，与变更包值逐项比较。新增文件去掉路径后的「（新增）」标记。结果：**25/25 一致，0 不匹配**。

| # | 路径 | `git hash-object` | `sha256sum` | 复算 |
| --- | --- | --- | --- | --- |
| 1 | `src/common/编排/team-plan.ts` | `68700bec4fbe8a13d3b6767e88870f1f9d7d37e1` | `f976fd0925d7661f71f1b84cf48b04cce07bc19f8b65c696c5cceecbcdc1b5e7` | 一致 |
| 2 | `src/common/编排/directory-conformance.ts` | `400af3c2d4a9a9338ded55d7acd106f931648456` | `a8168a73033b902084465e5d76e0e37724e6de91d6a635e503d8349a6240f5db` | 一致 |
| 3 | `src/pipeline/orchestration/run-role.ts` | `846ab5a03796211c219c5dea2c1e237a9e312f82` | `46204a7e6624439dcfaa4866d424186638cb33216252a9ec26ea51e8fc3e98fd` | 一致 |
| 4 | `src/pipeline/orchestration/govern-session.ts` | `eac5c3df0048f41d4e098a586872b4961fd607fb` | `195b5100197486299327d038599cdf974b247aa57e79fff2dab4bafa6a3358f0` | 一致 |
| 5 | `test/编排/team-plan.test.ts` | `2bf9b5c9be13788f7209e4ab9a92d64cf3ee69c5` | `46d657bad532fe7eabb6eb1b8dc079b7047fd96450e33b48e4ec6d5aab2c356e` | 一致 |
| 6 | `test/编排/directory-conformance.test.ts` | `23b3d7405d02f736abad498f12d5fa1c033a959a` | `8028c7c694c7c00d01aa5db47488dc27648ab22173a9914cbcc7c8d91b9581dc` | 一致 |
| 7 | `src/common/门禁引擎/governance-roles.ts` | `540927402fc63cd3561b170f8b478d786216b40a` | `90b480fa7b43e31dac88e533cf12cd86641cdb0a176ca9d9c22531896ce94803` | 一致 |
| 8 | `test/门禁引擎/governance-trio.test.ts` | `364be1a11c09ff7c28f584a6c33a600bafa1458c` | `452f7ff134e4aced40a5e35242a01ecb947ed0ef155f120d311283de0ee988a6` | 一致 |
| 9 | `test/门禁引擎/governance-standard-workflow.test.ts` | `abccf2d1af9bd79392b9d29975ae2afc494de758` | `b16a06741dd3a5770792e3917ef5c9773d934ff169e40f72a74bfe033d6427a6` | 一致 |
| 10 | `src/model/runtime.ts` | `c50e1f44dab21d035b1a8e296f0e3749e470b9b0` | `ca6c0f09e65e4b1a4bdcae00144e13e0c313c025dfc0ec0f0ad102e0f57492f3` | 一致 |
| 11 | `test/runtime-core/governance-flow-metadata.test.ts` | `d1e1ca2c66a363cdab8a9f1bebf12b6d768e2f78` | `9253e55945bfdb1cc2c120ab2e8d73bb67415b6afe39e438f56e9fb0208200f1` | 一致 |
| 12 | `app/desktop/interface.ts` | `61e91311207c739d560d308577135c2205feffb8` | `1f580f0f5ba5431461fbd451034ab95314651f47a4b9d7a4fc3e39548c305ed4` | 一致 |
| 13 | `app/desktop/governance-advance.ts` | `8f90a7138a2742509c484e5c856b26497878c3e7` | `90dbfbd1cb32474b8687d11e02cbe507f1c8773f57af8e1e7bd6499975e4bb90` | 一致 |
| 14 | `test/桌面应用/interface.test.ts` | `3e3b9083f646aaf0d5925d1915ab9408fd6fc842` | `45cec1f88f0a8fc3cca47443f45fea93898faf500d21bd0b1891dbf204711242` | 一致 |
| 15 | `test/桌面应用/operator-wiring.test.ts` | `679d3ce6809beea3dac0be493b9bb535ba5cc10c` | `997af101d9cd103b4945c48a05417dd8b8741d31d12cf6a8c4a98dcdd45713cb` | 一致 |
| 16 | `test/桌面应用/e2e/main.mjs` | `67f0572e700fbfc9bfe65e480a37ac307909d456` | `ec77bf3be4ac359bb4b82b5698c49667fd251705ad182279842ca674140fbe7a` | 一致 |
| 17 | `test/测试/governance-e2e-auto/fixture.ts` | `9ce3caed83e87f21f4444875b054d79bf4816e69` | `ec1b2c1dde230dc758c25b361100fcbae8802ef356c75524f2fe5c22c69f5981` | 一致 |
| 18 | `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | `da5b0c53bf3b44bdc652c15a2ee2107341ce81b6` | `c35da9810c995a3d556e2f406323a273024e5521dac77cb23c14d4f933296cee` | 一致 |
| 19 | `test/测试/governance-e2e-auto/q-role-granularity.test.ts` | `8a1cd8a85a64250de4ff9958cc58c157adca264a` | `9689f5cbe1ec299921d6d92d3174a68369d482b985a6bd37d999c3e9d8148c52` | 一致 |
| 20 | `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | `7973d367a43fbd09a893496f1d73b67e80e022e9` | `305cc0ab4027e16ea25cb5730cb6324533732385810b1b5d774a5eb516726159` | 一致 |
| 21 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `a28009aeafff85fa96907f3150420d034f91d2ad` | `83c2c3905d1ed7be443c4847babc0a7129c47263707163ba107eac4f2a71b785` | 一致 |
| 22 | `test/测试/directory-layout.test.ts` | `1eb758d1e0e4f8a1fb2141187a69dc8d714ee18f` | `7a4b845f4b8396a9b23ae90746197b64051a00abfea1663bee3e343af191154e` | 一致 |
| 23 | `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | `aa3f78bc0ecdc69c9d0ecc0ccf565340de6311e7` | `bc0ce9cee9bf9dcdb2d45a33f61bbbf99ceb6eac6f8487e7a4f40983772616e7` | 一致 |
| 24 | `角色卡/桌面窗口/boundary.md` | `b13881b8935309c123a6681f1f6017583f5d18da` | `1d12d0b4aceb293ed0315986ee82b844603d75bdde71589867bb000f5230744e` | 一致 |
| 25 | `角色卡/桌面窗口/changelog.md` | `b0e7ca9a12797a52f4f35a59e7936fe87d6c46db` | `d41e40f1b6c14a3fc94add1672fcb42ec5f73ce9bf6ec61485275d96bedfd413` | 一致 |

**候选稳定性**：最终测试记录 §1.2 的 `final-candidate-hashes-start.txt` 与 `final-candidate-hashes-end.txt` 对 12 个桌面/测试文件运行前后逐字节一致；本次验收复算又对全部 25 个候选文件确认未变。

### 2.3 候选隔离

- **i18n B0 既有上下文（不是本候选）**：`src/common/shared/i18n/**`、`app/renderer/src/i18n/**`、`app/renderer/src/App.tsx`、`app/renderer/src/lib/platform.ts`、`app/renderer/src/shell/SettingsPanel.tsx`、`app/desktop/preferences.ts`、`app/desktop/i18n.ts`、`app/main.ts`、`app/preload.cjs`、`test/项目管理/shared/**`、`test/桌面UI/**`、`角色卡/项目管理/**`、`角色卡/桌面UI/**` 的 B0 记录。本报告不为它们判通过。
- **共享文件内的 B0 上下文**：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts` 同时含 i18n B0 偏好接线/测试与本次 v3 改动；其候选哈希包含两部分。本报告只对 v3 部分判定，不把 B0 计入本变更通过背书。
- **管理记录**：`docs/communication/**`、`docs/planning/**`、`docs/scheduling/**`、`docs/acceptance/**`、角色 `docs/change/**` 证据不是产品候选。
- **边界校正**：`角色卡/桌面窗口/boundary.md`/`changelog.md` 只含客户闸门 2 授权的两条精确单文件条目及其 changelog。

---

## 三、T3 全量回归、失败分类与证据复用

### 3.1 最终候选 T3 串行全量

| 项 | 值 |
| --- | --- |
| 命令 | `mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"` |
| 文件数 | **355**（`test/**/*.test.ts`，排除 `test/pi-adapter/write-sequencing.test.ts`） |
| 计数 | **3655 tests / 3628 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled** |
| 退出码 | 1（9 项既有 EPERM） |
| 时间 | 2026-10-23 12:34:06 → 12:39:31（约 324 s） |
| 原始日志 | `角色卡/测试/docs/change/2026-10-23-directory-ownership-evidence/final-full-regression-serial-excluding-write-sequencing.log` |
| 摘要/失败原文 | 同目录 `final-full-regression-summary.txt`、`final-full-regression-failures.txt`、`full-regression-excluded-file-list.txt` |

### 3.2 与基线对照

| 指标 | 基线（B0 后、v3 前） | 最终候选 | 差额 |
| --- | --- | --- | --- |
| tests | 3591 | 3655 | +64 |
| pass | 3563 | 3628 | +65 |
| fail | 10（9 EPERM + 1 桌面偶发） | 9（仅 9 EPERM） | −1（基线偶发未复现） |
| skipped | 18 | 18 | 0 |
| todo | 0 | 0 | 0 |
| 新增确定性失败 | — | **0** | — |

**归因**：+64 tests = 测试角色新增 +25（v3 语义 24 + 布局 e2e 1）+ D4 `test/编排/directory-conformance.test.ts` +15 + 其余 D4/D5 上下文 +24。+65 pass 与 −1 fail 对应新增通过及基线桌面偶发未复现。

### 3.3 9 项失败分类（全部为既有 Windows symlink EPERM）

1. `native symlink and storage runtime mismatch fail before SDK query`（`test/claude-adapter/session.test.ts`）
2. `native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary`（`test/codex-adapter/session.test.ts`）
3. `store validate callback rejects directory symlink before Pi parse or new native write`（`test/pi-adapter/injected-runtime.test.ts`）
4. `Pi storage refuses file symlink and role/runtime mismatch without touching other storage`（`test/pi-adapter/injected-runtime.test.ts`）
5. `D3 linked workspace root remains usable; linked target itself is not replaced`（`test/runtime-core/file-write-safety.test.ts`）
6. `store: traversal, mismatched scope and symlinked runtime directories rejected`（`test/runtime-core/session-store.test.ts`）
7. `store: native validation stays lazy and native symlink is rejected before effects`（`test/runtime-core/session-store.test.ts`）
8. `读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛`（`test/测试/g4-skill-verify/b-render-double-check.test.ts`）
9. `node test外指符号链接路径不获委托；项目内测试路径获委托`（`test/编排/shell-authorized-routine.test.ts`）

错误均为 `EPERM: operation not permitted, symlink ...`（errno -4048），与基线报告 §5.2(A) 的 9 项历史清单逐条一致；本轮未出现基线 §5.2(D) 的桌面时序偶发。`write-sequencing.test.ts` 为已知挂起（3 个用例完成但进程不退出），基线/最终均按同一处置排除并记录，不计 pass/fail；这是残余证据边界，不是新增失败。

### 3.4 定向测试与真实启动

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | 123/123 pass，exit 0 | `final-governance-e2e-auto-suite.log` |
| `node --test test/测试/directory-layout.test.ts` | 1/1 pass，报告含逐路径核对与原始 status/diff | `final-directory-layout.log` |
| `npm run typecheck` | exit 0，0 诊断 | `final-typecheck.log` |
| `npm run typecheck:renderer` | exit 0，0 诊断 | `final-typecheck-renderer.log` |
| 真实 Electron `electron test/桌面应用/e2e/main.mjs` | exit 0；`E2E_PASS=true`；`E2E_FAILURES=` 空；17 张截图；`preferences` 未注册错误 0 | `final-electron-e2e-main.log`、`final-electron-e2e-summary.txt`、`electron-e2e-final/report.txt` + 截图 |

真实 Electron 使用真实主进程/preload/渲染进程，但模型为既有离线/演示路径，未使用真实模型/在线会话/凭据；v3 语义链路由确定性 e2e 证明，Electron 只证明真实启动/退出与关键检查。

### 3.5 证据完整性与复用

- 证据目录共 100 个文件；`sha256.txt`（SHA-256 `512a246d…`）执行 `sha256sum -c` 为 **100/100 OK**（含测试记录自身）。
- 本报告复用同候选、同输入/依赖、同命令的最终测试记录与原始日志；未重跑全量（符合团队计划「不默认重跑全量，优先复用」）。
- 最终测试记录 §1.2 的 `final-candidate-hashes-start/end` 证明 12 个桌面/测试文件在最终测试前后未变；本次验收复算 25/25 候选哈希一致。

### 3.6 验收补充定向检查（标准 P6/P7 的两项显式负例）

owner 测试矩阵的 V-D1 治理路径负例覆盖 12 条治理目录，但未显式覆盖 `.env/` 密钥段；`directory-conformance` 的 realpath 用例只覆盖项目内正例。验收判定时在系统临时目录执行两项补充检查（不修改仓库、不写产品/测试文件）：

1. **V-D7 密钥路径**：构造含 `directories: [..., .env/]` 的 v3 计划，调用 `parseTeamPlan`；输出 `ok=false`，错误含「目录「.env/」命中密钥/环境路径段「.env」；不得作为普通授权目录」，判定 `hasSecretMessage=true`。临时脚本：`C:\Users\51054\AppData\Local\Temp\vd7-secret-check.mjs`（未入库）。
2. **V-D9 realpath 逃逸**：在系统临时根创建 `link` junction 指向项目外目录，构造 `directories: [link/, ...]` 的 v3 计划并传 `projectRoot`；输出 `ok=false`，错误含「目录/授权目录/模块实现目录「link/」经 realpath 解析后逃出项目根」，判定 `hasRealpathEscape=true`。临时脚本：`C:\Users\51054\AppData\Local\Temp\vd9-realpath-check.mjs`（未入库）。

两项检查补足了标准 P6/P7 的最低负例证据；未改变候选，也未改变标准。

---

## 四、逐项判定（P1–P15 + G1–G3）

| ID | 标准摘要 | 主要证据 | 结果 | 判定依据/备注 |
| --- | --- | --- | --- | --- |
| P1 | v3 schema/类型闭环/v1/v2 不变 | `team-plan.ts`/`run-role.ts`/`interface.ts`/`runtime.ts` diff；`teamPlanSchema: 1/2/3`；v3 正例；v1/v2 测试 | **pass** | `TEAM_PLAN_SCHEMA_V3=3`；未知 schema 被 V1 拒绝；`唯一写集` 别名 warning、`边界` 列 v3 error；v1/v2 分支逐字保留；`GovernanceJudgeFacts.teamPlanSchema?: 1/2/3` 与 `teamPlanDirectories?` 已落地；未新增 artifact kind。 |
| P2 | frontmatter/规范表/角色表三处一致 | V-D1/V-D2/V-D3 正负例；`team-plan.test.ts` v3 正向；q11/q12 | **pass** | `directories`、规范表、角色 `授权目录` 三集合一致；未声明/孤儿/owner 不符/重复均 error；v3 正例解析 6 条规范、0 error/warning。 |
| P3 | DirectorySpec 字段/语法/`实现目录` 必填 | 解析/负例矩阵；`V-D5`/`V-D6` 测试；`directory-conformance` 字段规则 | **pass** | 12 字段、类型/命名/子目录/扩展名/契约/测试面/依赖 DAG/禁写区/共享均校验；`实现目录` 缺失列/空值/角色目录不在模块实现目录内均 error；v1/v2 不受影响。结构通过不代替语义正确（readiness/验收另判）。 |
| P4 | 唯一 owner/不重叠 | V-D2/V-D3/V-D4 测试；重叠矩阵 | **pass** | 同目录/祖先/嵌套/精确文件落入他人目录/精确文件相等均 error；split 父目录除外且不得直接分配；无孤儿。 |
| P5 | 共享策略 | V-D8 测试；`src/common/shared/` diff 为空 | **pass** | none/read-only/split 校验；split 父目录直接分配/无子目录/子目录无 owner 均 error；shared 仍由项目管理唯一 owner，未作为执行角色授权目录。 |
| P6 | 治理关键路径精确授权 | V-D1/V-D7 12 条负例；补充 `.env/` 检查；shared/model diff 为空 | **pass** | `.ans`、角色卡、scheduling/acceptance/communication/flows/nominations/verification、`src/common/shared`、`src/model`、`.github/workflows`、`src/common/装配` 均拒绝为目录授权；`.env`/密钥段补充检查拒绝；`src/common/shared`/`src/model/{boundary,role,decision}.ts`/`resolve-write.ts` 零改动。release 文件级精确例外依赖 boundary/V12，未发现候选计划把 release 文件分配给非装配角色。 |
| P7 | V-D1–V-D9 九条规则 | 规则 ID/severity；逐规则负例；卡前守卫测试；补充 realpath 检查 | **pass** | V-D1–D9 全部实现；error 在 `validateConvenerAppointmentCard` 发卡前阻断（测试断言不发卡/不判断/不写账本/不派 Crew）；warning/exception-review 不阻断；不调用模型；realpath 逃逸补充检查通过。 |
| P8 | V12 扩展 | `interface.test.ts` 8 个 v3 用例；V12 正负例日志 | **pass** | 计划目录/精确文件覆盖；`new` 集合一致（更宽/更窄均阻塞）；`changed`/`existing` 计划 ⊆ 边界，更宽限模块实现目录、越出 warning+readiness；existing 只 warning+迁移提示；来源分流 Crew/Convener 可观察；V12 失败不派 readiness；v2 V12 逐字保留。 |
| P9 | v1/v2 legacy 逐字不变 | v1/v2 测试；v2 完整链路；旧文件 diff | **pass** | 缺省/1 只跑旧表格检查；2 按 V1–V12 不变；v2 完整链路在 123/123 中通过；旧 v1/v2 计划/flow/角色卡/夹具未删除/批量迁移；v3 不改 flow schema/V11；`实现目录` 必填只作用于 v3。 |
| P10 | 卡前守卫/卡文本/任务文案 | `governance-trio`/`governance-standard-workflow` 断言；`interface.test.ts` v3 文案；`operator-wiring` 52/52 | **pass** | Convener 卡要求 v3 计划/目录规范/每个 module 非空 `实现目录`/授权目录/精确写集/共享/治理路径/readiness 列；Crew 卡要求目录条目+精确文件、new 一致、不改规范/不跨目录；Verifier 卡要求布局报告+原始证据、结构通过≠语义正确；任务文案默认 v3、显式 v1/v2 保留；注册表 entries/forbidden/preauthorized 零变化。 |
| P11 | readiness 目录记录 | v3 完整链路 readiness 断言；`directories/spec/shared/layout` 列；任务文案 | **pass** | e2e readiness 记录含 `directories/spec/shared/layout` 及 v2 列；gap 退回 Crew/Convener；应用不宣称语义正确；Q10 计划/规范变更只由 Convener 新版本写、角色/范围实质变化重开闸门 2（卡文本/任务文案覆盖）。 |
| P12 | 布局核对纯函数/报告可复算 | `directory-conformance.ts`；15 个单测；`directory-layout` e2e 1/1；报告含原始 status/diff/候选哈希 | **pass** | 纯函数不读 git/不写报告；最长前缀 owner、无/多 owner fail、类型/子目录/命名/禁写区/路径安全、删除原路径/重命名新路径、管理记录与角色根跳过；e2e 报告行数等于原始 `git status` 行数、路径/哈希可复算，fail 未被标 pass；结构通过不代替语义正确。 |
| P13 | 运行期策略 A/非目标 | diff/grep：`decision.ts`/`resolve-write.ts`/session/provider 未改；无 `writeDirs`；枚举/派发/入口/基线未改 | **pass** | 未做任务级 `writeDirs`；`TaskScope`/F4/session/dispatch/provider 未改；边界目录仍硬拦越界；任务文案写明授权目录/规范/不得跨目录/改规范；未新增 cardKind/FlowStepKind/GovernancePower/GovernanceDecisionKind/artifact；未改派发权/客户入口/角色命名/工程基线。 |
| P14 | Map/Reduce 与测试分片不回归 | `q-role-granularity` q11–q15；`r-mapreduce-parallel` r6/r7；v3/legacy 链路；全量回归 | **pass** | v3 不改 flow schema/V11；Map 并行组、dependsOn、Reduce 覆盖全部 Map 保持；v3 分片独立根/日志/输出、失败隔离、manifest；legacy v2 链路通过；全量 0 新增确定性失败。`write-sequencing` 已知挂起排除是残余证据边界。 |
| P15 | 现有角色不迁移 | `git diff -- 角色卡/**`；boundary 校正 diff；旧计划/flow 哈希；无 role-card.md/boundary.yaml 改动 | **pass** | 未迁移/重写任何现有角色；无新增角色卡；无 `role-card.md`/`boundary.yaml` 改动；唯一 boundary 改动是闸门 2 授权的桌面窗口两条精确单文件条目+changelog。其余 `角色卡/**` 改动为各 owner 自身文档（`api-spec.md`/`memo.md`/`docs/change`）与 i18n B0 的桌面UI/项目管理文档；前者属团队计划 §4.3「自身文档」写集，后者是既有上下文，均不是角色定义/边界迁移。若按标准 §4.3.15 判定方法的字面「除边界校正外为空」，这些文档更新会形成口径冲突；按标准正文「现有角色不迁移」与团队计划写集判 pass，并列为残余口径风险。 |
| G1 | 变更包完整/候选可复算 | 变更包 133 行/哈希；25/25 复算；HEAD/status/cached | **pass** | 变更包含任务 ID、flowId、候选哈希、HEAD、改动路径、D1–D9、证据链接、T3、复用/失效说明；25 个候选文件 25/25 一致；管理记录未混入产品候选。 |
| G2 | 写集与授权 | `git status`/`diff --name-only`/`--stat`/`--cached`；与团队计划 §4.3/§八 对照 | **pass** | 25 个候选路径中 24 个在团队计划 §4.3/§八逐角色写集内；`test/桌面应用/e2e/main.mjs` 是 `角色卡/桌面窗口/boundary.md` 既有精确单文件条目，D5 仅补 `preferences:get`/`set-locale` 内存桩（i18n B0 harness 缺口修复），未在团队计划 §4.3 桌面写集中显式枚举，按既有精确文件授权与协调口径记录为**写集粒度 caveat**，不视为新增产品行为或新文件。无 `test/桌面应用/` 新建文件；无提交/推送/合并/发布；worker 未写 `docs/scheduling`、`docs/acceptance`、`docs/verification`；角色自身文档按 §4.3 允许；i18n B0 与管理记录为既有上下文。`app/desktop/interface.ts`/`governance-advance.ts`/`test/桌面应用/interface.test.ts` 内含 B0 偏好接线/测试，候选哈希包含两部分，本报告只对 v3 部分判定；`e2e/main.mjs` 的 `preferences:get` 桩按桌面候选记录，不视为 i18n 通过。 |
| G3 | 文档状态/版本记录 | 测试记录状态 `verified-by-tests-only`；角色记录 `implemented-unverified`；发布记录对照 | **pass** | 未把设计写成已实施；未把测试写成验收通过；未写 `verified` 到产品文档；未与 v1.6.0 发布记录/冻结源混；未声称提交/推送/发布。 |

### 4.1 关键项补充说明

- **P6**：release/packaging 的**文件级**精确例外（如 `package.json`）由 boundary/V12 与既有治理授权约束，V-D7 只拒绝目录形式；候选计划未出现把 release 文件分配给非装配角色的情况。`.env`/密钥段的目录形式已由补充检查确认拒绝。该项按 pass 记录，残余风险见 §五。
- **P8**：`changed`/`existing` 的「既有职责」仍是语义判断，应用只做确定性模块实现目录核对并给 warning；readiness 记录由 Convener 负责。e2e 覆盖了 changed 越出 warning 与 existing 迁移提示，但未证明真实模型会写出高质量 readiness；按标准 P8/P11 的证据口径判 pass，语义质量列为残余风险。
- **P11/P12**：v3 语义链路由确定性 e2e（脚本桩 + 真实 gate/interface/ledger/客户通道/判断 driver）证明；真实 Electron 只证明启动/退出与关键检查，未使用真实模型/在线会话/凭据。标准允许该证据组合；不把 mock 当成真实模型验收。
- **P15**：角色自身文档更新与「角色卡/边界改动」的口径已在表中说明；未发现任何角色被迁移到 v3 或边界被重写（除授权校正）。
- **G2**：i18n B0 与 v3 共享同一批桌面文件；本报告不为 B0 判通过，也不把 B0 证据计入 v3 通过。两变更仍分别验收、分别报告。

---

## 五、证据边界与残余风险

1. **无真实模型驱动的 v3 会话**：v3 语义由确定性 e2e 证明；真实 Electron 自检使用离线/演示模型路径。未声称跑过真实模型/在线会话/凭据；这是团队计划 §6.4 已记录的证据边界，不是缺失必要证据。
2. **`write-sequencing.test.ts` 已知挂起**：基线（§四）与最终（§5.4）均在该文件 3 个用例打印 `✔` 后进程不退出；最终全量排除该文件，355/356 文件。该文件不计 pass/fail；残余证据边界，需在后续环境/runner 修复后补跑。
3. **桌面会话 LRU open→send 时序偶发**：D6 出现 1 次（新实例），隔离复跑全绿；最终全量未复现。最终 9 项失败全部是 EPERM，未把偶发算作通过或新增失败；建议桌面窗口 owner 继续关注。
4. **`changed`/`existing` 的「既有职责」是语义判断**：应用只做确定性核对 + warning；readiness 记录质量是残余风险。验收未把「没有 warning」当成语义正确。
5. **Reduce 角色豁免模块 `实现目录` 归属**：跨模块测试角色不归属单一 module，仍受整层黑名单/治理路径/重叠约束；实现与方案示例/团队计划 reduce 角色一致。若按 P3/P7 字面要求所有角色都必须在模块实现目录内，Reduce 是设计例外，需沟通确认；本报告按方案示例与团队计划判 pass。
6. **release/packaging 文件级精确例外**：V-D7 只拒绝目录形式；`package.json` 等精确文件依赖 boundary/V12 与既有治理授权。候选计划未出现越权分配；残余风险为「计划若把 release 文件精确写给非装配角色，V-D7 不直接拦截」。建议后续在计划校验或 readiness 中补强。
7. **P15 标准/团队计划口径张力**：角色自身文档（api-spec/memo/docs/change）按团队计划 §4.3 允许更新，但标准 §4.3.15 判定方法写「除边界校正外为空」；本报告按标准正文「现有角色不迁移」与团队计划写集判 pass。建议统筹在标准 v1.2 中明确「角色卡/边界定义」与「角色自身文档」的区别，避免下一轮误判。
8. **i18n B0 共享文件**：`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts` 内含 B0 偏好接线/测试；本报告只对 v3 部分判定，不为 B0 背书。i18n T2 需独立验收。
9. **证据复用**：本报告复用同候选的最终测试记录与原始日志；未重跑全量。补充定向检查只针对两项未被 owner 矩阵显式覆盖的负例，未改变候选。
10. **`test/桌面应用/e2e/main.mjs` 写集粒度 caveat**：该文件是 `角色卡/桌面窗口/boundary.md` 既有精确单文件条目，D5 只补 `preferences:get`/`set-locale` 内存桩（i18n B0 harness 缺口修复），未在团队计划 §4.3 桌面写集中显式枚举。本报告按既有精确文件授权与协调口径记录为写集粒度 caveat，不视为新增产品行为或新文件；若统筹要求严格按团队计划 §4.3 枚举，需在变更包/计划中补记该路径，不影响 v3 行为判定。
11. **无 task_ops**：未启用 `.ans/project.json`；未伪造令牌、锁、审批、机器预检或账本状态。

---

## 六、结论与放行边界

- **总体结论：通过（当前候选）**。P1–P15、G1–G3 全部适用行 pass；无 fail、无 insufficient evidence、无整行 not applicable。
- 通过只对当前候选（HEAD `ee59296` + §二 25 个候选哈希）有效；候选变化后按标准 §3.3 重新判断受影响部分。
- 通过不授权提交、推送、合并、发布或任何对外操作；不改变闸门 2 写集、T3 档位或 i18n T2 的独立判定。
- 建议后续跟踪：`write-sequencing.test.ts` 挂起、桌面 LRU 时序偶发、release 文件级精确例外、P15 角色文档口径、`changed`/`existing` readiness 语义质量。
- 本报告是独立验收结论，不是客户确认记录；客户确认仍以 `docs/communication/` 的记录为准。

---

**判定人：内置独立验收（ANS 技能）**
**判定日期：2026-10-23**
