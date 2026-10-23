# 变更包：目录级授权与目录规范（directory-ownership）

- 任务 ID：`2026-10-23-directory-ownership`
- flowId：`directory-ownership`
- 风险档位：**T3（治理/权限/流程设计变更）**
- 客户确认：闸门 0/1/2 均确认，记录 `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
- 方案：`docs/planning/2026-10-23_design_directory-ownership.md`（v1）
- 实施前验收标准：`docs/acceptance/directory-ownership-criteria-v1.md` **v1.1**（SHA-256 `a619ea38000e5ce0571acabb5e8dd45648edcff7355ba60d6ac99d6c2c5908a2`）
- 团队计划：`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`（SHA-256 `fdadae1abe78e578a60250c3106fe28168be007cbc6b4259a5583210dcdf5910`）
- 基线报告：`角色卡/测试/docs/change/2026-10-23_change_i18n-directory-baseline.md`（最终 323 行，SHA-256 `f5452e9816679399aa937465576131459dbdf177f5dafe72f9582d5a0114e61b`；B0 后、目录 v3 前 3591/3563/10/18，排除 `test/pi-adapter/write-sequencing.test.ts`）
- 状态：**实施与测试完成，待独立验收（D8）**；本变更包不是验收报告，不声称 T3 验收通过。
- 日期：2026-10-23

## 一、候选身份

- 当前 HEAD：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（main）
- 工作树：未提交、未暂存；候选为工作区内容。`git diff --cached --name-only` 为空。
- 基线：B0 后的工作树（i18n B0 已落地；目录 v3 实施前 3591/3563/10/18）。
- 候选范围：目录 v3 的产品代码/测试 + 客户授权的桌面窗口边界漂移校正；**不含** i18n B0 的共享消息目录/渲染层/主进程偏好接线（它们是本变更的既有上下文，不纳入目录候选，也不以本变更验收结论背书）。
- 管理记录（`docs/scheduling|acceptance|communication|planning`、角色 `docs/change` 证据）不是产品候选；候选身份以产品/测试文件哈希为准。

### 1.1 候选文件与哈希（工作区最终内容）

| # | git hash-object | sha256sum | 路径 | 归属 |
| --- | --- | --- | --- | --- |
| 1 | `68700bec4fbe8a13d3b6767e88870f1f9d7d37e1` | `f976fd0925d7661f71f1b84cf48b04cce07bc19f8b65c696c5cceecbcdc1b5e7` | `src/common/编排/team-plan.ts` | 编排 |
| 2 | `400af3c2d4a9a9338ded55d7acd106f931648456` | `a8168a73033b902084465e5d76e0e37724e6de91d6a635e503d8349a6240f5db` | `src/common/编排/directory-conformance.ts`（新增） | 编排 |
| 3 | `846ab5a03796211c219c5dea2c1e237a9e312f82` | `46204a7e6624439dcfaa4866d424186638cb33216252a9ec26ea51e8fc3e98fd` | `src/pipeline/orchestration/run-role.ts` | 编排 |
| 4 | `eac5c3df0048f41d4e098a586872b4961fd607fb` | `195b5100197486299327d038599cdf974b247aa57e79fff2dab4bafa6a3358f0` | `src/pipeline/orchestration/govern-session.ts` | 编排 |
| 5 | `2bf9b5c9be13788f7209e4ab9a92d64cf3ee69c5` | `46d657bad532fe7eabb6eb1b8dc079b7047fd96450e33b48e4ec6d5aab2c356e` | `test/编排/team-plan.test.ts` | 编排 |
| 6 | `23b3d7405d02f736abad498f12d5fa1c033a959a` | `8028c7c694c7c00d01aa5db47488dc27648ab22173a9914cbcc7c8d91b9581dc` | `test/编排/directory-conformance.test.ts`（新增） | 编排 |
| 7 | `540927402fc63cd3561b170f8b478d786216b40a` | `90b480fa7b43e31dac88e533cf12cd86641cdb0a176ca9d9c22531896ce94803` | `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 |
| 8 | `364be1a11c09ff7c28f584a6c33a600bafa1458c` | `452f7ff134e4aced40a5e35242a01ecb947ed0ef155f120d311283de0ee988a6` | `test/门禁引擎/governance-trio.test.ts` | 门禁引擎 |
| 9 | `abccf2d1af9bd79392b9d29975ae2afc494de758` | `b16a06741dd3a5770792e3917ef5c9773d934ff169e40f72a74bfe033d6427a6` | `test/门禁引擎/governance-standard-workflow.test.ts` | 门禁引擎 |
| 10 | `c50e1f44dab21d035b1a8e296f0e3749e470b9b0` | `ca6c0f09e65e4b1a4bdcae00144e13e0c313c025dfc0ec0f0ad102e0f57492f3` | `src/model/runtime.ts` | 运行时核心 |
| 11 | `d1e1ca2c66a363cdab8a9f1bebf12b6d768e2f78` | `9253e55945bfdb1cc2c120ab2e8d73bb67415b6afe39e438f56e9fb0208200f1` | `test/runtime-core/governance-flow-metadata.test.ts` | 运行时核心 |
| 12 | `61e91311207c739d560d308577135c2205feffb8` | `1f580f0f5ba5431461fbd451034ab95314651f47a4b9d7a4fc3e39548c305ed4` | `app/desktop/interface.ts` | 桌面窗口 |
| 13 | `8f90a7138a2742509c484e5c856b26497878c3e7` | `90dbfbd1cb32474b8687d11e02cbe507f1c8773f57af8e1e7bd6499975e4bb90` | `app/desktop/governance-advance.ts` | 桌面窗口 |
| 14 | `3e3b9083f646aaf0d5925d1915ab9408fd6fc842` | `45cec1f88f0a8fc3cca47443f45fea93898faf500d21bd0b1891dbf204711242` | `test/桌面应用/interface.test.ts` | 桌面窗口 |
| 15 | `679d3ce6809beea3dac0be493b9bb535ba5cc10c` | `997af101d9cd103b4945c48a05417dd8b8741d31d12cf6a8c4a98dcdd45713cb` | `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 |
| 16 | `67f0572e700fbfc9bfe65e480a37ac307909d456` | `ec77bf3be4ac359bb4b82b5698c49667fd251705ad182279842ca674140fbe7a` | `test/桌面应用/e2e/main.mjs` | 桌面窗口 |
| 17 | `9ce3caed83e87f21f4444875b054d79bf4816e69` | `ec1b2c1dde230dc758c25b361100fcbae8802ef356c75524f2fe5c22c69f5981` | `test/测试/governance-e2e-auto/fixture.ts` | 测试 |
| 18 | `da5b0c53bf3b44bdc652c15a2ee2107341ce81b6` | `c35da9810c995a3d556e2f406323a273024e5521dac77cb23c14d4f933296cee` | `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | 测试 |
| 19 | `8a1cd8a85a64250de4ff9958cc58c157adca264a` | `9689f5cbe1ec299921d6d92d3174a68369d482b985a6bd37d999c3e9d8148c52` | `test/测试/governance-e2e-auto/q-role-granularity.test.ts` | 测试 |
| 20 | `7973d367a43fbd09a893496f1d73b67e80e022e9` | `305cc0ab4027e16ea25cb5730cb6324533732385810b1b5d774a5eb516726159` | `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | 测试 |
| 21 | `a28009aeafff85fa96907f3150420d034f91d2ad` | `83c2c3905d1ed7be443c4847babc0a7129c47263707163ba107eac4f2a71b785` | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 测试 |
| 22 | `1eb758d1e0e4f8a1fb2141187a69dc8d714ee18f` | `7a4b845f4b8396a9b23ae90746197b64051a00abfea1663bee3e343af191154e` | `test/测试/directory-layout.test.ts`（新增） | 测试 |
| 23 | `aa3f78bc0ecdc69c9d0ecc0ccf565340de6311e7` | `bc0ce9cee9bf9dcdb2d45a33f61bbbf99ceb6eac6f8487e7a4f40983772616e7` | `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | 测试 |
| 24 | `b13881b8935309c123a6681f1f6017583f5d18da` | `1d12d0b4aceb293ed0315986ee82b844603d75bdde71589867bb000f5230744e` | `角色卡/桌面窗口/boundary.md` | 人事（授权漂移校正） |
| 25 | `b0e7ca9a12797a52f4f35a59e7936fe87d6c46db` | `d41e40f1b6c14a3fc94add1672fcb42ec5f73ce9bf6ec61485275d96bedfd413` | `角色卡/桌面窗口/changelog.md` | 人事（授权漂移校正） |

### 1.2 候选隔离声明

- **i18n B0 既有上下文（不是本候选）**：`src/common/shared/i18n/**`、`app/renderer/src/i18n/**`、`app/renderer/src/lib/platform.ts`、`app/renderer/src/App.tsx`、`app/renderer/src/shell/SettingsPanel.tsx`、`app/desktop/preferences.ts`、`app/desktop/i18n.ts`、`app/main.ts`、`app/preload.cjs`、`test/项目管理/shared/**`、`test/桌面UI/**`、`角色卡/项目管理/**`、`角色卡/桌面UI/**` 的 B0 记录。它们属于 i18n T2，不得用本变更验收结论背书；本变更也不为它们判通过。
- **管理记录**：`docs/communication/**`、`docs/planning/**`、`docs/scheduling/**`、`docs/acceptance/**`、角色 `docs/change/**` 证据不是产品候选。
- **边界校正**：`角色卡/桌面窗口/boundary.md`/`changelog.md` 只含客户闸门 2 授权的两条精确单文件条目（`acceptance-dispatch.test.ts`、`runtime-resolution.test.ts`）及其 changelog；不是角色/权限扩张，也不迁移现有角色。
- **未纳入**：`src/common/shared/**` 目录写入、`TaskScope`/`resolve-write.ts` 任务级硬拦、现有 `角色卡/**` 全量迁移、CLI/文档翻译。

## 二、节点 D1–D9

| 节点 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| D1 | 闸门 2 角色指派/写集/顺序/验收安排 | 已确认 2026-10-23 | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md` |
| D2 | 实施前验收标准 v1.1（含 `实现目录` 必填） | 已冻结 | `docs/acceptance/directory-ownership-criteria-v1.md`（`a619ea38…`） |
| D3 | B0 后、v3 前 T3 全量基线 | 已完成（排除已知挂起） | 基线报告 `f5452e98…`；3591/3563/10/18 |
| D4 | 编排 v3 解析/V-D/布局核对 + 门禁卡文本 + 运行时类型 | 已完成 | 角色变更记录（见 §四） |
| D5 | 桌面 v3 解析/V12/任务文案 | 已完成（含 D6 缺口修复） | `角色卡/桌面窗口/docs/change/2026-10-23_change_directory-ownership.md` |
| D6 | v3 e2e/布局核对/legacy v2 | 已完成 | 测试变更记录 `13104d88…` |
| D7 | 最终候选 T3 全量回归 + 真实 Electron | 已完成 | 最终日志 `final-full-regression-*`、`electron-e2e-final/` |
| D8 | 独立验收判定 | **待进行** | 本变更包 + 证据 |
| D9 | 放行/后续发布 | 未进行 | 不在本变更包内 |

## 三、实施摘要

- **编排**：`TEAM_PLAN_SCHEMA_V3 = 3`；v3 frontmatter `directories` 强制；模块 `实现目录` 必填（Q9 A/v1.1）；角色表 `授权目录` + `精确写集`（`唯一写集` 别名 warning，`边界` 列名 error）；目录规范 12 字段；V-D1–V-D9；卡前守卫 error 不弹卡/不写账本；`directory-conformance.ts` 纯函数布局核对；v1/v2 分支逐字保留；V11 不变。
- **门禁引擎**：Convener/Crew/Verifier 卡文本同步 v3；注册表 entries/forbidden/preauthorized、能力、内部 id/显示名、工程基线零变化。
- **运行时核心**：`GovernanceJudgeFacts.teamPlanSchema?: 1|2|3`、可选 `teamPlanDirectories?: string[]`；不新增 artifact kind/枚举。
- **桌面窗口**：`TeamPlanInfo` v3 视图（`directories`/`directorySpecs`/`moduleList.implementationDir`/`authorizedDirs`/`preciseWritesets`）；`parseTeamPlanInfo` 经 pipeline 公共出口单一解析；V12 扩展（目录/文件覆盖、new 一致、changed/existing 覆盖、来源分流、existing 迁移提示）；Crew/readiness/验收任务文案 v3；提案接受新流程默认 v3（显式 v2/legacy 保留）；e2e harness 补 `preferences:get`/`set-locale` 桩（i18n B0 缺口修复）。
- **测试**：v3 计划夹具/负例矩阵、v3 完整链路、legacy v2 链路、布局核对 e2e、MapReduce/分片不回归；`b-proposal-accept-timing` 按真实 v3 默认更新断言并保留 v2 场景。

## 四、验证证据

### 4.1 D4+D5 集成

- 串行桌面+编排+门禁+运行时核心：**1945 tests / 1936 pass / 4 fail / 5 skipped**；4 失败全为既有 Windows symlink EPERM（runtime-core 3 + 编排 shell-authorized-routine 1）；`npm run typecheck` exit 0。
- D5 interface 105/105、operator-wiring 52/52；D4 编排 796/795/1（既有 EPERM）、门禁 316/315/1 个既有跳过、运行时核心 14/14。

### 4.2 最终候选定向与全量

- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"`：**123/123 pass**（含 v3 完整链路、v2 链路、五角色链路、q11/q15、r7、b 场景 2c）。
- `node --test test/测试/directory-layout.test.ts`：**1/1 pass**（临时 git 项目根，报告与原始 `git status`/diff 一致）。
- 最终 T3 串行全量（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`，355 文件）：**3655 tests / 3628 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled**，exit 1，约 324s。
  - 9 失败全部为既有 Windows symlink EPERM（与历史清单逐条一致）；本轮 0 项桌面时序偶发；**0 项新增确定性失败**。
  - 对照基线 3591/3563/10/18：tests +64、pass +65、fail −1（基线偶发本轮未复现）、skipped 不变。
  - 原始证据：`角色卡/测试/docs/change/2026-10-23-directory-ownership-evidence/final-full-regression-serial-excluding-write-sequencing.log` 及 summary/failures。
- `npm run typecheck` / `npm run typecheck:renderer`：exit 0 / 0。

### 4.3 真实 Electron

- `ANS_E2E_OUTDIR=… electron test/桌面应用/e2e/main.mjs`：exit 0，`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、`ROLE_COUNT=16`、17 张截图；`No handler registered for 'preferences` 计数 0。
- 证据：`角色卡/测试/docs/change/2026-10-23-directory-ownership-evidence/electron-e2e-final/`（report + 截图）。
- 证据边界：真实主进程/preload/渲染进程启动与关键检查；**未使用真实模型/在线会话/凭据**；v3 语义链路由确定性 e2e 证明，不以 Electron 自检冒充模型驱动验收。

### 4.4 角色记录与证据

- 编排：`角色卡/编排/docs/change/2026-10-23_change_directory-ownership.md` + `…-evidence/`（含 01–05 原始日志/哈希）。
- 门禁引擎：`角色卡/门禁引擎/docs/change/2026-10-23_change_directory-ownership.md` + 证据（含 registry-zero-change）。
- 运行时核心：`角色卡/运行时核心/docs/change/2026-10-23_change_directory-ownership.md` + 证据（含类型闭环/旧枚举不变）。
- 桌面窗口：`角色卡/桌面窗口/docs/change/2026-10-23_change_directory-ownership.md` + 证据（interface/operator/e2e/typecheck）。
- 测试：`角色卡/测试/docs/change/2026-10-23_change_directory-ownership.md`（最终 SHA-256 `13104d88ad3e0b132710a0b24b12f32a8ab5ff7a591aac6665ff9f4d0049e00c`，blob `baec4cf68ad624ff361e6d0866fdaeebc63b487a`）+ `…-evidence/`（100 文件，`sha256.txt` `512a246d…`，`sha256sum -c` 100/100 OK）。
- 基线与验收标准：见文首。

## 五、残余风险与已知边界

1. **既有 Windows symlink EPERM（9 项）**：仅 Windows 环境，历史基线逐条一致；终验仍会保留为已知失败，不计新增。
2. **桌面会话 LRU open→send 时序偶发**：D6 出现 1 次，隔离复跑全绿；最终全量未复现；不得归为基线红，交桌面窗口 owner 关注。
3. **`test/pi-adapter/write-sequencing.test.ts` 挂起**：已知历史问题，D3/D7 均排除并在报告列明；未伪装为通过。
4. **无真实模型驱动的 v3 会话**：v3 语义由确定性 e2e 证明；真实 Electron 只证明启动/关键检查；模型在线链路不在本轮证据内。
5. **`changed`/`existing` 的“既有职责”是语义判断**：应用只做确定性检查；readiness 记录并由验收抽查。
6. **Reduce 角色豁免模块 `实现目录` 归属**：跨模块测试角色不归属单一 module，仍受整层黑名单/治理路径/重叠约束；已在编排变更记录说明。
7. **现有角色不迁移**：本仓库 `角色卡/**` 不重写；仅客户授权的桌面窗口两条精确测试条目校正。
8. **运行期策略 A**：不做任务级 `writeDirs`；越界由 boundary 目录硬拦，计划目录更细约束由任务文本/布局核对/验收保证。

## 六、候选复算命令

```bash
git rev-parse HEAD
git hash-object -- <path>   # 每个候选文件
sha256sum -- <path>         # 每个候选文件
git diff --cached --name-only   # 应为空
```

验收时请对 §1.1 的 25 个路径逐个复算，并核对工作区内容未变；管理记录/证据不作为产品候选哈希。
