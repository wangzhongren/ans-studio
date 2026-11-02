---
id: dispatch-guardrail-relax-b1-implementation
type: change
title: B1 实施记录：派发护栏放宽——桌面窗口会话接线与 7 个桌面测试迁移
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [dispatch-guardrail-relax]
events:
  - date: "2026-11-02"
    kind: implemented
    summary: B1 完成（提案 Revision 2）；7 文件 61/61、全量桌面 462/462、typecheck 0；未验收
---

# B1 实施记录：派发护栏放宽——桌面窗口会话接线与 7 个桌面测试迁移

- **角色**：桌面窗口（Desktop Window）
- **阶段**：B1（桌面会话接线 + 7 个既有桌面测试迁移；不是 A1/D1/D2/E2）
- **状态**：**implemented-unverified**。代码/测试已按冻结 A1 契约与 B1 提案 Revision 2 落地并通过 B1 层检查；**未验收、未跑 T3 全量/E2E、未启动应用、未 commit/push**。
- **实现设计（以此为准）**：`角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md` **Revision 2，535 行 / SHA-256 `4dcb1ecab5bdfe3ddc19db243f1b83a8f4acbb2eba758716d5388e4a76f3c168`**；PM P1 审核记录 **375 行 / `9006e2bdee86e2df5608e8b65d7f4c33a565ce73688877f4a5dd1f1475a10fac`（recommend approval）**。
- **基线**：HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（tree `689a49580fd7e79a0bfae1be343597b793967f71`）；团队计划 482 行 / `4ebd41fa…`；V1 814 行 / `63c441aa…`；B0 201 行 / `547aba69…`。
- **A1 冻结输入（只读；B1 未修改）**：`workflow-preconditions.ts` 1337 行 / `9dfb5563…`；`dispatch-advisories.ts` 283 行 / `0781cd3d…`；`mechanical-rejection.ts` 190 行 / `1e1e6573…`；`test/编排/workflow-preconditions.test.ts` / `bec8c361…`；`test/编排/dispatch-advisories.test.ts` / `72a3ad0c…`。开工前后 blob+sha256 一致（§2）。
- **边界**：只写 `app/desktop/session.ts`、7 个 `test/桌面应用/` 列名文件、本角色 `docs/change/`；未写 `app/main.ts`/`app/preload.cjs`/`app/renderer/**`/`app/desktop/` 其他文件/`src/**`/`test/测试/**`/其他角色测试/`src/common/shared/**`/角色卡/边界/`docs/scheduling|acceptance|communication|planning`。

## 1. 改动清单（B1 写集）

| 路径 | 操作 | 写前 blob / sha256 | 写后 blob / sha256 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | 改 | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` / `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` | `0fd043a7627c9be031bc2f83ead1f2b11af96443` / `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` |
| `test/桌面应用/chain-enforcement.test.ts` | 改 | `9c99ccc7e10ffd3749a2b57f54bd5024f0312765` / `9a17307995f3bba32839577d8714d7e3d5910232625a76fb0258a6b8a84dd1b2` | `0cbf827a3957ed3e667dd1b8ed9fcb872133a9ec` / `9e20c8b6360180b71fc0b0407f284803b48b4f7c4657d80779fcbebda9eb633b` |
| `test/桌面应用/star-routing.test.ts` | 改 | `23fef02d5db560911d2b359f13a77301854b3b86` / `0c42a33acaf55a4539884b1697d775ed990a570fbafa972e94ef3537df036471` | `fd5c71fe4d5aa016e1220966c7e6e1dc10f19f45` / `e0bfdfd6634b6ce811a0006eee5bde4ea6e2b78790d2ada2f0b1f849ccb4ba40` |
| `test/桌面应用/rejection-copy.test.ts` | 改 | `24ce83df85adb4a5dd54a45b7a1d4ab199e4c122` / `fb75d9f8e4eb4c28a59e5a4ed00994da112dfca0cf480e11750a75991c40e13a` | `1c45af3df38671868b802f80e1a2255cd3e6d915` / `8c7e7dcee84214addd9ff96071b83059470d117209a431a43851ca997686076f` |
| `test/桌面应用/run-pin.test.ts` | 改 | `7e4ddabbccfa9194d6a292ef7a3646283279d802` / `bdf1fb6ef035594835a7e2af0c59a09e99815ff46417d114f1f3dba213c006bc` | `b66e1c91d5dc4eccefd0e62dbd5eef7df02eabd7` / `dad68b3b71c640341ed15a5e0b75020f3599f4cd75d3089c0346b592807773ed` |
| `test/桌面应用/run-change-trigger.test.ts` | 改 | `d37871f3dd6d555ac5b159f194aaf3d4b17e9894` / `142c42990bb7581aea89cd2daa9aa9c927a94b53bdfdda5777e612484df1fd9a` | `addfec596168787b78a1c3c39f0a4cbe7f2c5c2b` / `1f9f93406d763e10ba36bd26342fba10f6ccb5981bc7e35b4fc2d1f1aa691976` |
| `test/桌面应用/run-change-entry.test.ts` | 改 | `01c5e92d8e4363f381d1f3f32704a01964959dfd` / `bc0a9e51b2c7c819039d1fc35a29a1fe1fa27e5564a6dc500ad7125e39d3fe91` | `b8bbc605dae4645a2d2c663eea6bb1216688bd74` / `fc1a71f172495f198c32f735cdd43043f4818b6e794f318eb2ff6b61cf3ab16e` |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 未改 | `2b799498c572fd55111a868caa5ebda9e20fd3dc` / `fdca2a3f592db475c67f13d85a9f0d410e25131e63f6aee3fdc7d82d17f89425` | 同左（现有用例已覆盖目标不存在硬拒与缓存刷新受理，B1 复跑通过） |

- **A1 五文件开工前/退出时一致性**：`workflow-preconditions.ts` / `dispatch-advisories.ts` / `mechanical-rejection.ts` / `test/编排/workflow-preconditions.test.ts` / `test/编排/dispatch-advisories.test.ts` 的 blob+sha256 与 A1 冻结记录逐项一致（§2 表）；B1 未修改。
- 写集外产品/测试改动：**无**。`git status --porcelain -- src app test` 恰为 A1 五文件 + B1 八文件；B1 自身只改 `session.ts` + 7 个列名测试。
- `git diff --cached --name-only`：空（未暂存）；`git diff --diff-filter=D --name-only`：空（无删文件）。

## 2. A1 冻结文件一致性（开工前 = 退出时）

| 文件 | blob | sha256 |
| --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | `83a6c7ebfc5b3fe9094f3a67df5704bfdfd05be5` | `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f` |
| `src/common/编排/dispatch-advisories.ts` | `211e70467ddb7c3557d3c4a0562e7a431c01f7cf` | `0781cd3db1201a724feb9ece4837aef4d23c043fa12e202cd01f0dd8d1e30d6f` |
| `src/common/编排/mechanical-rejection.ts` | `270d0c016c4c5069cd34a8154dfcf20c8938a542` | `1e1e65736d99d371dbf13bbc18d9d88a048d17ac7fd6475ee508cca623750a62` |
| `test/编排/workflow-preconditions.test.ts` | `e1a7683eebc9f4f35d318921dd1d1a6725c0e14f` | `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b` |
| `test/编排/dispatch-advisories.test.ts` | `8744a22cdba803394d2636236d3fac17263c88bf` | `72a3ad0cf9ee87d3cd0cecc7c96847463de7c1288103f016e7d433df0620c7e5` |

## 3. 实现摘要

- **R1 调用图**：`routeStarDispatch` 在 `refreshListingNow` + 目标事实后调用 `evaluateDispatchAuthorization`（6 事实、显式 `targetExists`），通过后才 `chainDispatchFacts` / `findActiveRun` / `ensureDraftRun` / `pinRun`；硬拒绝不建任务行、不开目标会话、不产生/领养 draft run。`evaluateDispatchPreflight` 仍为唯一复合入口，B1 未调用；无第二份授权判定。
- **targetExists / chiefRoleId**：始终显式传 boolean；`chiefRoleId` 允许 null；`listing` 不可用时项目 worker 目标 `targetExists=false` → 硬 `target-card-missing`。`:6086` 收窄为仅 `from === target` 自派；convener→chief 交矩阵 `convener-target-forbidden`。
- **run 记账**：`findActiveRun`/`ensureDraftRun`（所有带 flowId 目标）/`verifyPinnedRun`/`loadPinnedRoster` 失败只记 `runFacts`（`ledgerUnavailable`/`pinFailed`/`documentHashMismatch`/`pinnedRosterInvalid`），不阻断；handoff 尽力 pin；失败不伪造 pinned。
- **R2 锚点**：draft 直接锚定；pinned 仅在 verify 通过 + roster 成功 + 目标/模块覆盖时锚定；无效/不覆盖/roles 未声明不锚定；无 runManifest/flowId 省略三者；`stepId=project-handoff` 始终写。`run.roles`/`run.modules === undefined` 按 A1 无事实口径：不产对应 code、不锚定。
- **legacy**：`hasLegacyFlowTask` 为真时 collector `run` 事实固定 `{state:"legacy"}`（仅 advisory），任务锚点仍用本地 draft。
- **R3 `evidenceScopeRoots`**：tier ① 无 flow 任务按 `to` + creator（verifier: chief|convener；其它内置: chief；项目 worker: convener）+ `moduleId` 兼容匹配，直接纳入 `modulePaths`、不以 roster 为门槛；tier ② 适用 roster；tier ③ 角色边界仅空集兜底、限定在 roster 模块路径内并记 `evidence.scope.boundary-fallback`；空集 fail-closed。
- **模块字段**：实现目标仅属主写；verifier/合法验收内置目标模块存在即写 `moduleId`/`modulePaths`；文件型模块不写 `moduleDirectory`；不匹配省略 + A1 advisory。
- **run-change**：删除 `runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail` 及调用点；保留 `proposalCardFrozenRejection`/`offerRunChangeOnFrozenContract`/`requestRunChangeDecision`/显式入口。
- **版本基线/账本/投递**：基线违规 → `versionedDocBaselineViolations` 交 collector；`appendTaskState` 失败仍 fail；`planDispatchDelivery` 与运行文案逐字未改；成功回执追加 advisory 摘要（≤3 条 + 「另有 N 项」）、`emitDeliveryNote` 一行、诊断 `tasks.dispatch.advisory`（`reasonCode`/`phase`/`mode`），无可不记。
- **i18n**：未新增 key；回执复用 `main.session.acceptedTask`，advisory 文案由 A1 `dispatch-advisories.ts` 提供。

## 4. 验证证据

| 检查 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| B1 七文件 | `node --test --test-concurrency=1 test/桌面应用/chain-enforcement.test.ts test/桌面应用/star-routing.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts test/桌面应用/run-change-entry.test.ts test/桌面应用/dispatch-fresh-enum.test.ts` | **61 tests / 61 pass / 0 fail / 0 skip / 0 todo；退出码 0** | `b1-tests.txt`（69 行 / `4d9bf590a16f5778f269db744635789f07b37faa30bde2e3eb92688b23de35b5`） |
| 类型检查 | `npm run typecheck` | **退出码 0，无错误输出** | `typecheck.txt`（4 行 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| 全量桌面补充 | `node --test --test-concurrency=1 $(find test/桌面应用 -name '*.test.ts')` | **462 tests / 462 pass / 0 fail / 0 skip / 0 todo；退出码 0**（B1 退出要求之外，用于提前发现 R3/session 回归） | `desktop-all-tests.txt`（483 行 / `bf492b42c5518ec2761f93d350e2f584decb96aa2030d8a6cdd7f30b4b1aa398`） |
| A1 冻结回归 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` | **34 tests / 34 pass / 0 fail / 0 skip / 0 todo；退出码 0** | `a1-frozen-tests.txt`（42 行 / `ab0ce3c4cc2ed067ffa3c3ae46ff809f2d33c9009ffb3038772e425a47b9dcf5`） |
| 候选树 | 临时 index：HEAD + A1 五文件 + B1 八文件 | **`f5aea50f145609f7e31d73a1a61f869ef143ce36`** | `candidate-tree.txt`（1 行 / `2c32d452527844f924f080f28ff5ea754159f7b338ea660ec9f68e8b488321e6`） |
| F4 只读核对 | `git diff -U0 -- app/desktop/session.ts` hunk 头 | hunk 位于 import、`:2045` 删除 run-change 辅助、`:6086` 接线、`:7059` 证据范围；**无 hunk 落在 `:4300–4699`**（redispatch 区域） | `f4-check.txt`（44 行 / `02306eef6d184fd6d6af88f385e3e02c4d7dcb1adcf0f6dab431ad19d9d744b9`） |
| 仓库状态 | `git status` / `git diff --cached` / 删除检查 | HEAD `c80f494`；产品/测试写集 = A1 五 + B1 八；无删文件；暂存空 | `git-baseline.txt`（75 行 / `18dda7bb9db88c5ef0cb800dc1bb5bb26bb606ada132617eec822ebc53feb0e5`） |

- 环境：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；Windows 11 Pro 10.0.26300 / Git Bash；Node v24.22.1 / npm 11.19.1。
- B0 基线 7 文件 50 tests → B1 61 tests（新增 11）、0 fail / 0 skip / 0 todo；未删除测试、未新增 skip/todo、未放松断言。
- 未运行：T3 全量回归、Electron E2E、应用启动（B1 退出不含；D1/D2 取证）。
- 已知中间态：A1→B1 已完成接线，当前工作树桌面行为为 B1 候选；不把本记录当验收结论。

## 5. 候选与写集

- 候选树：**`f5aea50f145609f7e31d73a1a61f869ef143ce36`**（HEAD tree + A1 五文件 + B1 八文件，临时 index 计算；未触碰真实 index）。
- 逐文件 blob/sha256：见 §1/§2。
- `git status --porcelain -- src app test`：A1 五文件 + B1 八文件；`git diff --cached --name-only` 空；无删除文件。
- 未 commit/push/merge/release；未启动应用；未派发其他角色；未接触客户。

## 6. 偏差、限制与未做

- **偏差**：无功能性偏差。按 B1 提案 Revision 2 与 A1 冻结契约实施；`dispatch-fresh-enum.test.ts` 未改（现有用例已覆盖目标不存在硬拒/刷新受理，B1 复跑通过）。
- **测试迁移**：`run-change-entry.test.ts` 删除 `runChangeRejectionForDispatch` 正向源码钉，保留 `proposalCardFrozenRejection`/`requestRunChangeDecision`/显式入口/`run-change-required` 码表钉；负向钉用精确正则 `/\brunChangeRejectionForDispatch\s*\(/`，源码无该标识符。
- **R3 限制**：`EvidenceCheckInput` 无 taskId 且未改 schema；tier ① 按 `created.to/from/moduleId/modulePaths` 兼容匹配，无法做 taskId 精确匹配（已在提案/本记录披露）。
- **pinned roles/modules 未声明**：按 A1 无事实口径不产 `run-role-missing`/run 专属 `module-missing`、不锚定；本记录记录「无法证明覆盖」限制。
- **未验证**：未跑 T3 全量/E2E；B1 测试与全量桌面通过不证明 T3/E2E；D1/D2 由测试角色按团队计划取证。
- **证据复用/失效**：A1 五文件或 B1 八文件、夹具、配置变化使本记录证据失效；D1 只在 A1+B1 同一候选上取证。

## 7. 证据文件

目录：`角色卡/桌面窗口/docs/change/2026-11-02-dispatch-guardrail-relax-B1-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `b1-tests.txt` | 69 | `4d9bf590a16f5778f269db744635789f07b37faa30bde2e3eb92688b23de35b5` |
| `typecheck.txt` | 4 | `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435` |
| `desktop-all-tests.txt` | 483 | `bf492b42c5518ec2761f93d350e2f584decb96aa2030d8a6cdd7f30b4b1aa398` |
| `a1-frozen-tests.txt` | 42 | `ab0ce3c4cc2ed067ffa3c3ae46ff809f2d33c9009ffb3038772e425a47b9dcf5` |
| `candidate-tree.txt` | 1 | `2c32d452527844f924f080f28ff5ea754159f7b338ea660ec9f68e8b488321e6` |
| `f4-check.txt` | 44 | `02306eef6d184fd6d6af88f385e3e02c4d7dcb1adcf0f6dab431ad19d9d744b9` |
| `git-baseline.txt` | 75 | `18dda7bb9db88c5ef0cb800dc1bb5bb26bb606ada132617eec822ebc53feb0e5` |

本记录自身行数/SHA-256 由 B1 完成报告给出（文件无法在不改变自身内容的前提下内嵌最终哈希）。
