---
flowId: role-granularity-parallel-testing
version: 1
riskTier: T3
candidate: aacf6fd209f9ed4f7006986e2c591d254e4c02cc
candidateSha256: 3f18309aa89ca1c20c4c8d8bd599df8b7afcfba1ce3cd2e3aae1e2978a664124
head: 64ed44a0ac6e75d647eadbeb3f35ae9f84625845
date: 2026-10-22
---

# 变更包：角色粒度（bounded context）与 MapReduce 并行测试

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`
- **产品 flowId**：`role-granularity-parallel-testing`
- **阶段**：N7（Reduce 终验）完成后的 N8 输入；本文件由统筹组装，交内置独立验收；**不是验收结论**。
- **记录角色**：ANS 统筹调度（Scheduler）
- **风险档位**：**T3（治理/权限/流程设计变更）**；依据技能 `references/testing.md`：治理或权限变更属于 T3，即使部分改动只涉及卡文本/文案也不能压成 T0。
- **候选身份**：工作树候选，HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`）；29 个产品/测试文件；候选清单 `角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/candidate/`。
- **候选清单哈希**：`hashes.tsv` `git hash-object` = `aacf6fd209f9ed4f7006986e2c591d254e4c02cc`；SHA-256 = `3f18309aa89ca1c20c4c8d8bd599df8b7afcfba1ce3cd2e3aae1e2978a664124`；`candidate-paths.txt` SHA-256 = `e262e788a84d9f5fad6ff191b910fddb205e3125f2965abd9676455366117611`；`full.diff` SHA-256 = `6f494efe15cc6ef8a9f6584be7bca47b5f33361c682cbcaab23c08d16a42ff15`。
- **跟踪/未跟踪摘要**：`tracked_diff_sha256`（`git diff --binary -- src app test`）= `267194bf55246e586cda3f6bfee17a5de3e1e9b4b093321d96dcb54a788f5573`；`untracked_candidate_sha256` = `621ec300f17dc87656e50bc7198caf369b4aa398fdcf0eb8417934b089c61eef`。
- **候选冻结**：本文件写盘即声明上述候选；判定前任一产品/测试文件变化会使本包与受影响证据失效，需重取并重判。
- **边界**：本文件只写 `docs/scheduling/`；不改产品代码、测试、角色卡、边界、方案、沟通记录或验收文档；不授权提交、推送、合并、发布。

## 一、候选范围与改动路径

### 1.1 按角色分组

| 角色 | 候选文件 |
| --- | --- |
| 运行时核心 | `src/model/runtime.ts`、`test/runtime-core/governance-flow-metadata.test.ts` |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts` |
| 编排 | `src/common/编排/team-plan.ts`（新）、`flow-state.ts`、`flow-service.ts`、`governance-gate.ts`、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/team-plan.test.ts`（新）、`flow-state.test.ts`、`flow-service.test.ts`、`governance-gate.test.ts`、`governance-session.test.ts` |
| 桌面窗口 | `app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts`、`operator-wiring.test.ts` |
| 测试 | `test/测试/governance-e2e-auto/fixture.ts`、`i-full-chain.test.ts`、`p-team-plan-guard.test.ts`、`b-proposal-accept-timing.test.ts`、`c-appointment-timing.test.ts`、`d-dispatch-listing.test.ts`、`q-role-granularity.test.ts`（新）、`r-mapreduce-parallel.test.ts`（新）、`test/测试/role-granularity-v2-demo.mjs`（新） |

**不包含在候选内**：`角色卡/**` 角色文档、顶层 `docs/**` 管理记录、`app/renderer/dist/**`、`test/桌面应用/e2e/main.mjs`（未改）、`test/桌面UI/**`（未改）、`src/provider/runtime/**`（未改）、`test/测试/real-entry.test.ts`（未改）。这些是证据/管理记录或未修改文件，不混入产品候选。

### 1.2 逐文件哈希（29 个）

| # | 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| 1 | `app/desktop/governance-advance.ts` | `965e46568a49c4e445ae947de3addd21a51a1d5f` | `c0eaa76920ad2159597055cb04c90662d133abd160555021e5cbfdf5588b9364` |
| 2 | `app/desktop/interface.ts` | `203e36f492f4bcc07689810bdd6c861a75e5cba9` | `a683e5a51c88f7bef1d4b9d652ec0bcadd2de1d32f8299094e1fa2b264364c88` |
| 3 | `src/common/编排/flow-service.ts` | `cdba51754e73e4d39bfbdedea7ecc788a05e76e8` | `6808144984231aa7e57f650201734c3ee00da2d9abb809682cd006344bb588b7` |
| 4 | `src/common/编排/flow-state.ts` | `ec1ba7c1706cc5b07ef17f01ef935bf529a8ea9a` | `f9c4959a8def24ecfbc317220ece27545195f1f7eaed0d930cb37a1b63252e44` |
| 5 | `src/common/编排/governance-gate.ts` | `948116e73141830342a1e8721b56163dfda53ffa` | `178ad78a5dbfdd4480fcd7469e5fb020ac976becf878218b941896a54ff7c2b2` |
| 6 | `src/common/编排/team-plan.ts` | `328737a3735f69209fd4ac8e32c26d789df16d44` | `c32f7b3ce3394ece2099389beaa5d496bb6a713341c4e116a03efd26f71c2b82` |
| 7 | `src/common/门禁引擎/governance-roles.ts` | `f074f0e15598b85cd47048652adca9bde07a5259` | `2fea2f941c90dbb611f6dcf08e332c0fcb94d9da0476a2c3b4ea753919fdfb4d` |
| 8 | `src/model/runtime.ts` | `4b96ae9db3f8f962913e2d010d5ab47bba110389` | `6d3299920982cb1191b7d9f18dc31b74d1b94e200c7acd8af7ec9bfc3cd54cfc` |
| 9 | `src/pipeline/orchestration/govern-session.ts` | `988934b43c7b2fb16c6638f79128674bc77eddef` | `e9b7dd85a6fade9e1242d2111b1a0d6a4f7c2fcb179e018f71043497e00052be` |
| 10 | `src/pipeline/orchestration/run-role.ts` | `8aa00772c5228037fcd080bcdd520a616b4ea794` | `80338c7b809f3bc0a95dfaa458cab5b92a8089eca236f9298d1d1636c5933879` |
| 11 | `test/runtime-core/governance-flow-metadata.test.ts` | `1ba4b621c682b3fb81e9cfe977ed2e8d2080697b` | `c7ef45c3e917de1570add346f01654ebc7030440025488fd67216864a3d8fa66` |
| 12 | `test/桌面应用/interface.test.ts` | `f3b8cae8c2bf637020c469e1874f675f6a2aef9f` | `e273b64156d0a24eeb6651141b02ffc05e8c881d26ad3e5f38ef3bd1e3ef5d1b` |
| 13 | `test/桌面应用/operator-wiring.test.ts` | `da29d2675969f84bf401acd0840974408a33b013` | `6f768d21c78e509db7b95dcd5e959d6bdcb4a176da0acd037ba24933bc543651` |
| 14 | `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | `3275090f4fc512bfe10961ff10f678694cd8be71` | `9f91ae70e685deddaf5025ac26789d3a60aca9db9edb701973c687e4343f1f48` |
| 15 | `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` | `f82a56df555ab9ff06d251b20bb93634a07c6f9a` | `a0aac8eb6b7f6c752ec729e8e1c4e6fb126e13bc854f09b06db6c578747e376b` |
| 16 | `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts` | `5806783c3c75f749e773d10a24939ed7cdb48919` | `e83768ae3e6d75e37bfbcc80b94cca7be33fdcca16ccd5de3594efdf89eff925` |
| 17 | `test/测试/governance-e2e-auto/fixture.ts` | `732e73433637fee3a04e61effa853969b3f58859` | `86a6f760a8222edcab021dc7c43060c9432d4a58307644cc6da7944788b1b123` |
| 18 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `21c9f621860e293cd70d87e31748aaba18dc2195` | `c94f0ed482e40b87073f137d3b67799ed8775d9bef4c60b7beab6ba30cda538b` |
| 19 | `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | `2cf62aeff9fcbd2b4f8a466146b163887d86efaa` | `c9aa791c3ca896fa8635776ff4fd3f5912f4f8bd3c68836388765795a45b28e7` |
| 20 | `test/测试/governance-e2e-auto/q-role-granularity.test.ts` | `7c306b35ad4e830f8cc7c91cc47455b7dee74a97` | `0b806ab5db6325113f089073089f9869c639d64f984a428079b80e64377847d3` |
| 21 | `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | `11be5800939647bb439d274b96fe3174e904efe4` | `040ca7e0a14055478b6febdaaf21b02636b496bae91338b30d383ee304c6d66c` |
| 22 | `test/测试/role-granularity-v2-demo.mjs` | `27dca9ec9b2247c5527a51a496bbe3cd4408cba5` | `e139b4ef9e8e1803df7f8ea09f2835574fef49c44b0ca0e06ee0ab4ed157b87a` |
| 23 | `test/编排/flow-service.test.ts` | `9bdbe3de063a0cada0bae3e0158fefc719dfe38b` | `4df55487d246d626cefe5c77288c7e83467d771bef98a5dcaaa211f0d16f43f0` |
| 24 | `test/编排/flow-state.test.ts` | `015a60ac9c39f9137a25440c2c51ff34cda9245f` | `de99803c88f535685e9f50e3f4d90448d390626c590e4fa8962f8416039b23cd` |
| 25 | `test/编排/governance-gate.test.ts` | `abcc33b26338fb8b2f8b10dcacb9fed6397c01f7` | `9bfcdd835cdb6e513796e29d8ff2500f65070667ff01d9c73c24d631aed2d417` |
| 26 | `test/编排/governance-session.test.ts` | `eb561d925ce68890296d2d41a9ef46e4bfe07aa6` | `abd26dd6fb4076ff7b9f3e87412c6beb2fba59eda9bb6664ecf4c7f7d59b1795` |
| 27 | `test/编排/team-plan.test.ts` | `402b909ade71a79efb30f68252b4e413b5701426` | `b7babe60bde270c12a4794f6ed3dd364ea001f49cb62c1ca8ab3cf8c51f50e47` |
| 28 | `test/门禁引擎/governance-standard-workflow.test.ts` | `32fc34c914ca87852fc7e779921cc57f0d37243e` | `3f7e6fa714db82debe6325eb8527fc3c541123553aebb0bc17e1ff7152541345` |
| 29 | `test/门禁引擎/governance-trio.test.ts` | `356d4433f58a6b0172afb5be11ae263c0a261e77` | `7440f91ee425ed37ee44aca9292bbe3cb03a0863dd6030283e5c3b20893b65e8` |

## 二、任务节点与证据链接

| 节点 | 阶段 | 角色 | 结果/证据 |
| --- | --- | --- | --- |
| N1 | 闸门 2 + 实施授权 | 沟通 → 客户 | `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`「闸门 2 确认与实施授权记录」 |
| N2 | 实施前验收标准 | 内置独立验收 | `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`（blob `759fcc31…`；SHA-256 `f5da3c31…`；T3；16 条标准） |
| N3 | 基线 | 测试 | `角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md` + `...-baseline-evidence/`（官方 post-standard 3528 前的 3448/3421/9/18；9 项 EPERM；typecheck/typecheck:renderer/build 0；挂起观察） |
| N4 | Map A | 运行时核心 + 门禁引擎 | 团队计划 §11.5（候选哈希、测试计数、独立复核）；角色变更记录 `角色卡/运行时核心/docs/change/...`、`角色卡/门禁引擎/docs/change/...` |
| N5 | Map B | 编排 | 团队计划 §11.7；`角色卡/编排/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`；`test/编排` 769/768/1（唯一红 N3 EPERM） |
| N6 | Map C | 桌面窗口 + 桌面UI | 团队计划 §11.9；`角色卡/桌面窗口/docs/change/...`、`角色卡/桌面UI/docs/change/...`（N/A）；桌面测试 518/518、UI 163/163、exact build 0 |
| N7 | Reduce 终验 | 测试 | `角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-phase-e.md`；`...-phase-e-evidence/manifest.md`；`canonical-e2e.log`；`final-full-parallel.log`、`final-full-serial.log`；`e2e-main/report.txt`；`demo-v2/report.txt`；`demo-legacy-v1/report.txt` |
| N8 | 独立验收 | 内置独立验收 | 待判定；本变更包为其输入，不是结论 |

## 三、T3 验证摘要（当前候选）

- **全量回归**：
  - 并行 `node --test "test/**/*.test.ts"`：3528 tests / 3501 pass / 9 fail / 18 skip / 0 todo，exit 1，约 22.6 s。
  - 串行 `node --test --test-concurrency=1 "test/**/*.test.ts"`：3528 / 3501 / 9 / 18 / 0，exit 1，300,781 ms。
  - 与 N3 基线 3448/3421/9/18 对照：+80 tests / +80 pass；失败为同一 9 项 Windows symlink EPERM，零新增红；并行与串行失败标题集合一致。
- **9 项既有 EPERM**（逐条）：`test/claude-adapter/session.test.ts:637`、`test/codex-adapter/session.test.ts:351`、`test/pi-adapter/injected-runtime.test.ts:185`、`:193`、`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46`、`:58`、`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`、`test/编排/shell-authorized-routine.test.ts:103`（声明行/抛错行见 manifest §三）。
- **静态/构建**：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；exact `npm run build:renderer` exit 0（2,654 modules，298 ms；`app/renderer/dist` 被 `.gitignore:9` 忽略、非候选）。
- **canonical e2e**：`test/测试/governance-e2e-auto/**` 99/99 exit 0；v2 完整链路 + legacy v1 链路均通过；新增 p/q/r/b/c/d v2 场景与负例。
- **Map 分片**：6 分片并行（orchestration 769/768/1；gate-engine 313/312/0/1；runtime-core 292/285/3/4；desktop-files 518/517/1 并行偶发→隔离 16/16、串行 518/518；desktop-ui 163/163；governance-e2e 99/99）；独立临时根/日志/输出；共享只读夹具 20 个 pin 哈希前后一致；失败隔离完成；manifest 合并见 `...-phase-e-evidence/manifest.md`。
- **真实启动/演示**：
  - `test/桌面应用/e2e/main.mjs` 真实 Electron：exit 0，`E2E_PASS=true`、`E2E_DONE=1`，17 截图。
  - v2 治理链 `test/测试/role-granularity-v2-demo.mjs`：exit 0，`DEMO_PASS=true`，`DEMO_DISPATCHES=role-cards,delivery-storefront,delivery-checkout-api,role-readiness,test-map-shards,integration-e2e`，8 截图。
  - legacy v1 `test/测试/phase-e-governance-demo.mjs`：exit 0，`DEMO_PASS=true`、`DEMO_IMPL_DISPATCH=true`，7 截图。
  - 模型为离线脚本桩；真实 Electron 窗口/preload/renderer/Interface/门禁/账本/客户通道为真实件；在线模型/凭据不在本轮验收面。
- **real-entry**：`test/测试/real-entry.test.ts` 未修改；定向 16/16 exit 0。

## 四、证据复用与失效说明

- **复用**：Map A/B/C 的定向/套件证据与 N3 基线仅用于同一候选/同一输入的失败分类与回归对照；Reduce 终验对最终候选重新执行了全量、canonical e2e、真实启动/演示，未把过期证据当通过依据。
- **失效**：任一候选文件（29 个中任一）变化会使本变更包、受影响分片/Reduce 证据与全量回归结论失效；`src/model/runtime.ts` 变化会使所有下游调用方证据失效；`test/测试/**` 变化会使对应 e2e/回归证据失效；`app/renderer` 源码变化会使构建证据失效（本轮未改）。
- **候选冻结**：本文件写盘后，候选以 §1.2 的 29 个哈希为准；不得在变化后的候选上沿用本包。

## 五、已知残余观察与限制（不构成验收结论）

1. **Provider 工具限制**：`flow_step_supersede` 不转发、`flow_get` 文本投影不渲染 `parallelGroup`/`dependsOn`；按团队计划 §11.6 已接受，v2 初始 flow YAML 可携带字段并通过解析/V11；Reduce/e2e 未证明必须扩 Provider 参数；未改 `src/provider/runtime/**`。
2. **桌面并行时序偶发**：Map 分片并行时 `test/桌面应用/handback-delivery.test.ts` E-1 去重一次偶发；隔离 16/16、整目录串行 518/518 通过；全量串行/并行均未把该用例列为失败；记录为偶发，非产品失败。
3. **演示环境观察**：首次把 demo 输出根放在仓库内中文证据路径时，Crew `write_file` 被治理门禁拒绝（既有 legacy demo 同样复现）；改用 ASCII 临时根后通过。首次 v2 demo 预置 `artifact.observed` 账本行缺 `actorRoleId`/`power`，账本 fail-closed；补齐后通过，属演示夹具修正，未改产品。
4. **Windows 既有失败**：9 项 symlink EPERM 为环境既有失败，逐条与 N3 基线一致；不作为通过依据，也不构成本次新增红。
5. **未验证**：真实在线模型/凭据、非 Windows 平台、打包产物；`app/renderer/dist` 为忽略的构建产物，不是候选。
6. **管理记录**：`docs/**`、`角色卡/**` 角色文档、测试证据目录均为管理/证据记录，不混入 29 文件产品候选。

## 六、效力

- 本变更包只声明当前候选与证据，不判定通过/返工/证据不足；最终判定由内置独立验收按 `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` 执行。
- 本变更包不授权提交、推送、合并、发布或任何对外操作；候选任何变化需重新组装并重判。
