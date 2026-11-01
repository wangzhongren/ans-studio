# 变更包 v1：验收判断的提案物证路径修复（acceptance evidence proposal path，T2）

- 任务 ID / flowId：`2026-11-01-acceptance-evidence-path` / `acceptance-evidence-path`
- 记录角色：ANS 统筹调度（Scheduler，独立上下文）
- 日期：2026-11-01
- 风险档位：**T2（跨模块缺陷修复：app/desktop ↔ src/common/编排；不改判断规则/权限/契约形状）**
- 状态：**E2b 通过（AC-1–AC-8 全部 pass，8/8）；本变更包为 E3 提交前重冻版；通过仅对 v1 候选 + 管理记录成立，本版只更新治理记录（E1 状态、v1/v2 验收报告、memo、沟通记录与派发记录），产品/测试 5 文件哈希未变；未 commit/push；不发行**
- 依据：客户确认方案 P1.2（396 行 / SHA-256 `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）；闸门 2 确认团队计划（431 行 / `94f80cff…`）；V1 标准（580 行 / `8f3e4b73…`）；E2b 报告 v2（146 行 / `06f142051431dc17fc88a3ec36744bbf29a9d3d65f59dd879eb8304843fda151`）；沟通/授权记录 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（当前 115 行 / `f96d02ef…`，含闸门 0/1/2、实施授权、V1/B-1 核验、方法 A 现场确认、E2b 结果）。
- **版本历史**：E1 首版 125 行 / `ce66e25a…`（E2 首判对象）；E2 首判 `docs/acceptance/acceptance-evidence-path-report-v1.md`（249 行 / `cc274259…`）判 AC-8 证据不足；E2b 报告 v2（146 行 / `06f14205…`）判 **通过 8/8**；本版 v2 为 E3 重冻（新增 v1/v2 报告、memo/沟通/派发记录更新与状态行，产品/测试 5 文件不变）。
- 记录性质：本文件是统筹的变更包，不是验收结论；E2b 结论见 `docs/acceptance/acceptance-evidence-path-report-v2.md`（通过，仅对当前候选）。

## 一、候选身份与冻结

| 项 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/flow-improvements-wave1` / `eb77fadafc4df40594938798645da111665027c3`（无新提交） |
| 工作树候选 | **25 个文件**：**产品/测试 5**（app 1 + src 1 + test 3）、**治理/记录 20**（docs/角色卡/验收/计划/边界，含本变更包与 v1/v2 报告）；无改名/删除 |
| 暂存区 | `git diff --cached --name-only` 为空（未暂存） |
| 候选清单 | 本文件 §四列出 **24 项**（除本变更包自身）；本变更包自身最终哈希由统筹在写盘后回报沟通；原始清单 `C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\E1\candidate-manifest-e3.tsv`（25 行 / SHA-256 `e32b19537e2d55c9e7c45d692f378c743e3673a59f518b9489676def799c70a8`，含 E1 写盘前快照） |
| 冻结规则 | §四 的 blob/sha256 为 E2 冻结依据；E2 前任何产品/测试文件变化即本候选失效；E2 报告/memo 为验收产物（管理记录），不混入产品候选 |
| 未改动的发布/构建面 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 均未改；`app/renderer/dist/` 为忽略产物、非候选 |

### 1.1 输入与确认版本

| 输入 | 版本/哈希 |
| --- | --- |
| 闸门 0/1/2 + 实施授权 + V1/B-1 核验 + 方法 A 现场确认 + E2b 结果 | `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（115 行 / `f96d02ef…`；历史快照 53/61/76/83/102 行见方案/团队计划/V1/E1 首版/E2b 报告，不混用） |
| 客户确认方案 | `docs/planning/2026-11-01_design_acceptance-evidence-path.md` P1.2（396 行 / `355cbf1c…`） |
| 独立复核 | `docs/planning/2026-11-01_review_acceptance-evidence-path.md`（124 行 / `25bc602e…`） |
| 团队计划（闸门 2 对象） | `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（431 行 / `94f80cff…`） |
| 实施前验收标准 V1 | `docs/acceptance/acceptance-evidence-path-criteria-v1.md`（580 行 / `8f3e4b73…`；AC-1–AC-8） |
| E2 首判报告 | `docs/acceptance/acceptance-evidence-path-report-v1.md`（249 行 / `cc274259…`；AC-8 insufficient evidence，未改） |
| E2b 复判报告 | `docs/acceptance/acceptance-evidence-path-report-v2.md`（146 行 / `06f14205…`；AC-1–AC-8 全部 pass，8/8） |
| B0 基线 | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（261 行 / `147c04fd…`） |

## 二、节点、交付与最终证据

| 节点 | 角色 | 最终结果 | 证据（路径 / 行数 / SHA-256） |
| --- | --- | --- | --- |
| G2 | 沟通 → 客户 | 闸门 2 + 实施授权（提交/推送/合并/发行不在授权内） | 沟通记录（见 §1.1） |
| H1 | 人事 | B-1：桌面窗口 boundary.md+yaml 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目（3 治理文件 / 7 行；md/yaml 一致） | 见 §四清单；边界解析器 17/17 |
| V1 | 内置独立验收 | AC-1–AC-8 实施前标准（AC-8 只以方法 A 为充分证据） | `docs/acceptance/acceptance-evidence-path-criteria-v1.md` / 580 / `8f3e4b73…` |
| B0 | 测试 | typecheck/typecheck:renderer/build 0；受影响 48/48；桌面应用 444/444；编排 639/638/1（既有 EPERM）；试跑现场事实 | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md` / 261 / `147c04fd…` |
| A1 | 桌面窗口 | `session.ts` 按 pinned > 最新 `-proposal-vN` > 缺失修复（+10/−1）；新增 7 项 session 测试；required 22/22、桌面目录 451/451；typecheck 0 | `角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md` / 121 / `92151e9d…`；`session.ts` `ca3d96b3…`/`d60ba7c8…`；新测试 `ff2db774…`/`a1be01dd…` |
| A2 | 编排 | facts 文案对齐（`-proposal-v1.md`）+ 注释；新增 facts 6 例；minimal 更新；targeted 39/39；编排目录 645/644/1（既有 EPERM）；typecheck 0 | `角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md` / 147 / `7964d5fb…`；`facts.ts` `49b960c3…`/`e3ed3ad1…`；新测试 `6346f811…`/`6eb08244…`；minimal `db398766…`/`39a11243…` |
| D1 | 测试 | 方案 §5.3 **61/61**；桌面目录 **451/451**；编排目录 **645/644/1**（唯一失败=B0 同项 EPERM）；typecheck/typecheck:renderer/build 0；AC-1–AC-7 映射；新增失败 0、新增 skip 0 | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md` / 206 / `f3654135…` |
| D2 | 测试（真实方法 A） | 候选重启（PID 23844，10:14:26 启动、10:28:46 停止，userData `…\Roaming\Electron`，CDP 9235）；别名移出（10:17:53）→ 重发验收卡 `req-bbeb75a3009b6c32`（2026-11-01T02:22:13.112Z）→ `by=judge`、`operatorId=judge:pi`、`choice=accept`、`reasonCode=sufficient`、`judge.evidence` 含 `docs/proposals/textkit-cli-proposal-v1.md` 且不含别名、无「物证不可读」→ 别名还原（10:27:21，sha `d6cad5f2…` 与移出前一致）；**AC-8（D2 视角）pass** | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D2.md` / 250 / `0a125838…`；证据 `…\ans-acceptance-evidence-path-evidence\D2\`（manifest 34 行 / `7a25ab69…`） |
| E1 | 统筹 | 本变更包（候选 24 项 + 行数/哈希 + 验证摘要） | 本文件 |
| E2 | 内置独立验收 | **E2b 通过（AC-1–AC-8 8/8）**；首判 v1 证据不足（AC-8） | `docs/acceptance/acceptance-evidence-path-report-v1.md`（249/`cc274259…`）+ `docs/acceptance/acceptance-evidence-path-report-v2.md`（146/`06f14205…`） |
| E3 | 统筹 → 沟通 | 按 E2 结论放行/返工；提交/推送另行授权；不发行 | 本文件 + 沟通记录 |

## 三、验证摘要与证据复用

### 3.1 检查汇总（最终候选）

| 检查 | 结果 |
| --- | --- |
| 方案 §5.3 七文件（`--test-concurrency=1`） | **61 tests / 61 pass / 0 fail / 0 skip / 0 todo**（B0 48 + A1 7 + A2 6） |
| `test/桌面应用/*.test.ts` | **451 / 451**（B0 444 + A1 7） |
| `test/编排/**/*.test.ts` | **645 / 644 / 1 / 0 / 0**；唯一失败 `shell-authorized-routine.test.ts:184` 既有 Windows symlink EPERM（B0 同项）；**新增确定性失败 0、新增 skip 0** |
| `npm run typecheck` / `typecheck:renderer` / `build:renderer` | 均 exit 0（build 产物与 D1 一致；`dist/` 忽略非候选） |
| 真实试跑方法 A（D2） | 别名移出/还原 sha `d6cad5f2…` 一致；新请求 `req-bbeb75a3009b6c32`；`by=judge`/`choice=accept`/`reasonCode=sufficient`；`judge.evidence` 含真提案、不含别名；无「物证不可读」；`integrity.complete=true`、`conflicts=0` |
| **E2b 独立复判** | `docs/acceptance/acceptance-evidence-path-report-v2.md`（146/`06f14205…`）：**AC-1–AC-8 全部 pass（8/8）**；产品/测试 5 文件与 D2 原始证据未变；方法 A 现场确认记录由客户确认小节满足；沟通记录/memo 为管理记录追加（按 V1 分离） |
| 失败分类 | 唯一红为既有环境失败（编排目录 `shell-authorized-routine.test.ts:184` EPERM）；无新增失败/skip/todo |

### 3.2 AC-1–AC-8 证据映射（供 E2）

| AC | 证据 |
| --- | --- |
| AC-1 pinned 优先/无 proposal 不回退 | A1 T1/T1b（session 集成）；D1 复跑 |
| AC-2 无 pin 最新版本/别名不选 | A1 T2/T2b；D1 复跑；`session.ts` 仅复用 `readIntentEntryFacts`（shared 零 diff） |
| AC-3 无提案缺失/文案 | A1 T3（含 `buildDecisionEvidencePacket`：`ok=false`、`artifact-missing`、reason 含 `docs/proposals/focus-proposal-v1.md`、不含 `focus-v1.md`）；A2 facts 断言；D1 抽样 |
| AC-4 `requiredArtifactPaths` 文案 | A2 facts 6 例；D1 复跑 |
| AC-5 试跑形状证据包路径/sha | A1 T4；D1 抽样 `aliasInEvidence=false`、真路径/sha/bytes |
| AC-6 pinned 不可读 fail-closed | A1 T5；`governance-judge.ts` 零 diff（既有 :324-339 控制流未改） |
| AC-7 无回归/写集 | typecheck 0；§5.3 61/61；桌面/编排目录；既有测试零 diff；5 文件写集；无新增 skip/todo |
| AC-8 真实方法 A | D2：别名移出/还原 sha、请求 id/时间、`by/choice/reasonCode`、`judge.evidence` 真提案、无「物证不可读」、候选/run id；方法 B 未用、未关闭「替我决策」、未客户手批 |

### 3.3 证据复用/失效

- B0 仅作基线；A1/A2 层测试与 D1 跨模块回归在同一候选（5 文件哈希一致）上执行；D2 使用 A1/A2 修复后的候选构建并在应用候选实例上执行方法 A。
- 产品/测试 5 文件在 D1/D2 前后哈希未变；管理记录（报告/memo/沟通/任务账本）变化不改变产品证据。
- 若 E2 前产品/测试文件或方案/V1 变化：受影响证据失效，重取并重写变更包。

## 四、候选清单（24 项，不含本变更包自身；E3 冻结）

> 状态：`M`=已跟踪修改，`??`=未跟踪新增。本变更包自身不在表内（写盘后哈希见统筹回报）。

| 状态 | 路径 | 行数 | git blob | SHA-256 | 类别 |
| --- | --- | --- | --- | --- | --- |
|  M | `app/desktop/session.ts` | 7794 | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` | 产品/测试 |
|  M | `src/common/编排/governance-judge-facts.ts` | 332 | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` | 产品/测试 |
|  M | `test/编排/acceptance-judge-minimal.test.ts` | 145 | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` | 产品/测试 |
| ?? | `test/桌面应用/acceptance-proposal-path.test.ts` | 419 | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` | 产品/测试 |
| ?? | `test/编排/governance-judge-facts.test.ts` | 133 | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` | 产品/测试 |
|  M | `docs/acceptance/memo.md` | 85 | `ddf31e957fef9c69a256301155baf9b50dcdb4f4` | `e94d88e0840d08ac499eb83e754771225678e04033ed4afee284a0f24dc0d29a` | 治理/记录 |
|  M | `docs/scheduling/memo.md` | 55 | `a07410d93796ee47038c79bc0007294c8854a1b3` | `b3c4df178473b74f67230951494f0e6fc4c0bea38c0b66f62631bc0e32638326` | 治理/记录 |
|  M | `角色卡/桌面窗口/boundary.md` | 90 | `c6ba7aeea88589062519b37ec43faf80cb2e6c97` | `c924b3dc6bbd5b377d64bbea2a86143b4e43dff0ea8fceffae02cce491f51baf` | 治理/记录 |
|  M | `角色卡/桌面窗口/boundary.yaml` | 239 | `3f19ca65cd3456f1a913ac4f44a75bab2531a448` | `0841d7ae1fc9cf41a526f6425a282b14d7c596facd73531c06341c179fcf2ae1` | 治理/记录 |
|  M | `角色卡/桌面窗口/changelog.md` | 195 | `2d66383e45a5a3ec95ede7e172540353b2ac6629` | `f98c23c3c8343340c128015787e256c0c8bf0db0d459d817c02133cd27350216` | 治理/记录 |
|  M | `角色卡/桌面窗口/memo.md` | 126 | `9d7a62020601f432b3f936da4f4c559aa2963eca` | `c1e994c82b04a3543a99663fbe30e163c254b3ac4b3c23ecb5d5043c91e46406` | 治理/记录 |
| ?? | `docs/acceptance/acceptance-evidence-path-criteria-v1.md` | 580 | `97caa120279eabe981e248df4e3a27f25fe666ab` | `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179` | 治理/记录 |
| ?? | `docs/acceptance/acceptance-evidence-path-report-v1.md` | 249 | `c084ae508a51edd7effb9e537a03506e3c41a34d` | `cc274259e008dca7a87997250112dfa27d1e27a95365697826f4a37b1d24b946` | 治理/记录 |
| ?? | `docs/acceptance/acceptance-evidence-path-report-v2.md` | 146 | `d4fb6ae295d9030b16b8c5f31f415c024aebc04e` | `06f142051431dc17fc88a3ec36744bbf29a9d3d65f59dd879eb8304843fda151` | 治理/记录 |
| ?? | `docs/communication/2026-11-01_intent_acceptance-evidence-path.md` | 115 | `5641eb431a2ad37cbeefb07c87808175643293e3` | `f96d02efc9e3e2e554f00b0188a8b15f8dc7eb522071bbb91b10f464bd87d80f` | 治理/记录 |
| ?? | `docs/planning/2026-11-01_design_acceptance-evidence-path.md` | 396 | `9dc5f7297a7c88aecaa7229be63ebfb444b99345` | `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9` | 治理/记录 |
| ?? | `docs/planning/2026-11-01_review_acceptance-evidence-path.md` | 124 | `9956faa8494d1710f8df1f03496ee13001f362de` | `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6` | 治理/记录 |
| ?? | `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md` | 431 | `d2ef9383beb299d009d47039d849d489d473288b` | `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3` | 治理/记录 |
| ?? | `docs/scheduling/acceptance-evidence-path-baseline-and-dispatch-v1.md` | 96 | `6d594a03c0b550e77506f6afc40fc79aa9df888a` | `8ef3144359cf367d3e67cd630f88bedb5d63a926b08fb3a6690b32532e8822dc` | 治理/记录 |
| ?? | `角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md` | 121 | `d9d178fb8012ae73ab0e1011b0f07c8a092ce8ff` | `92151e9d79c258d0b872c6edc16cb5d326cc8fe51f48853bac15e9ff83684b8d` | 治理/记录 |
| ?? | `角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md` | 147 | `dfd3adebdc61aab94dfc0bc79d8f4a136990fdd0` | `7964d5fbdcac6db66b1845e3534877279c09d6ad6c983c5438d7ff5fc3a356db` | 治理/记录 |
| ?? | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md` | 261 | `1d197388e4a88d857d5c4a34fa3245d5f86422b6` | `147c04fddb66a2fd86345a721b8dcd45d323e8bbdc40831fa55ff0b389543fc3` | 治理/记录 |
| ?? | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md` | 206 | `f422393c5019c76a0334aebf5cf3d0fcf387b922` | `f3654135fc38d903ebf7665d42c79cc15f3e37e41242cec7d63497b09f0386dd` | 治理/记录 |
| ?? | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D2.md` | 250 | `cca672360545b9abc39e09aedab972adf2bf4902` | `0a125838fd16a6c30eaf29a6d6c1f48fa0d5d9b03dd93f7f2fa34ec3486c6b67` | 治理/记录 |

## 五、建议提交拆分（E2b 已通过；提交授权后执行；本任务不 commit/push）

- **推荐两个提交**：
  1. **实施与测试（5 文件）**：`app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、`test/桌面应用/acceptance-proposal-path.test.ts`、`test/编排/governance-judge-facts.test.ts`、`test/编排/acceptance-judge-minimal.test.ts`。建议信息：`fix(acceptance): 验收 judgeContext 提案物证路径（pinned > 最新 -proposal-vN > fail-closed）`。
  2. **治理与记录（20 文件，含本变更包与 v1/v2 报告）**：`docs/**`、`角色卡/**`（方案/复核/闸门/团队计划/V1/B-1/报告/memo/验收报告）。建议信息：`docs(acceptance-evidence-path): 方案/闸门/团队计划/验收标准/验收与实施记录`。
- **备选单提交**（25 文件）：适合仓库单提交惯例。
- **不发行**：不打 tag、不升版本、不构建/上传发布包、不写发布说明；`release-policy.mjs` 保持 `v1.8.3`。
- 提交/推送/合并需客户另行授权；实施角色与统筹不自行 commit/push。

## 六、状态与限制

- **E2b 已通过（AC-1–AC-8 全部 pass，8/8）**：`docs/acceptance/acceptance-evidence-path-report-v2.md`（146/`06f14205…`）；通过仅对当前产品/测试候选（5 文件，与 E1 首版一致）成立；v1（249/`cc274259…`）为 AC-8 证据不足首判，未改。
- 本变更包为 **E3 提交前重冻（v2）**：新增 v1/v2 报告、更新 memo/沟通/派发记录与 E1 状态；产品/测试 5 文件逐字节未变，E2b 结论对产品候选成立；治理记录重冻符合 E2b 报告 §九的 E3 要求。
- **提交前核对**：HEAD `eb77fad`；工作树 25 文件（9 M + 16 ??）；`git diff --cached` 空；无改名/删除；发布/构建面零 diff；`release-policy.mjs` 保持 `v1.8.3`；`app/renderer/dist/` 忽略产物非候选。
- **提交/推送/合并不在本轮既有授权内**；由沟通向客户请示，获明示后执行。**不发行**。
- 沟通记录当前 115 行 / `f96d02ef…`、acceptance memo 85 行 / `e94d88e0…` 为管理记录；若继续追加，仅这两行哈希变化，产品/测试 5 文件不受影响。
- 本变更包自身 SHA-256 由统筹在写盘后回报沟通（不写入正文以避免自引用）；原始 25 行候选清单在 `%TEMP%\ans-acceptance-evidence-path-evidence\E1\candidate-manifest-e3.tsv`（E1 写盘前快照），最终 25 行清单（含 E1 最终哈希）由统筹交付回报给出。
- 未 commit/push；未发行；未联系客户。