# 变更包：国际化（i18n，变更 A）

- 任务 ID：`2026-10-23-i18n`
- flowId：`i18n`
- 变更：**变更 A（国际化，i18n）**；与变更 B（目录级授权 + 目录规范，T3）分别实施、分别验收、分别报告，不合并判定。
- 风险档位：**T2（跨角色/接口/契约/shared 变更）**。本变更触及渲染层、主进程、共享元数据与新增 IPC 契约，不改变治理/权限/角色边界，因此不是 T3。
- 闸门 0/1/2 与实施授权：均已确认并授权（2026-10-23），记录 `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（现行 SHA-256 `7e1cf8dbd15463552f7b75d36b1bb70663d12ee1e65f439d862416b5371c83b7`，blob `f6338b7bbb2199593f7effa9692241a81b55a92f`）。闸门 0「可以」；闸门 1「都确认，按推荐」；闸门 2 确认 i18n 团队计划并明确「确认并授权实施」；实施授权与闸门 2 分开记录在同一文件。
- 方案：`docs/planning/2026-10-23_design_i18n.md` v1（951 行，SHA-256 `844db4798033ba09d8a6c7d3d4eb49b6a90a37a7b803853e5771ed45e1146eac`，blob `04a2bc81fbd528fa2e6d285af507dd85cccc25e3`）；客户在闸门 1 确认其 v1 内容（含 §13 Q1–Q9 推荐 A）。
- 实施前验收标准：`docs/acceptance/i18n-criteria-v1.md` **v1**（691 行，SHA-256 `0d91d179a175dbdad361335a276b5f7b8319539d9dfa0a28f18b409ee204dae9`，blob `8a706111aa4c61f0c57c67b5a284cc0b22d3c330`），实施前冻结。
- 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md`（502 行，SHA-256 `5ccc758fef0f900cc113cd82b51d9cfb722f9da9bd67790d03eefc5211c6551f`，blob `26dd276d2f3157986fefbfbcf3614d5cd0dd5d6b`），与沟通记录闸门 2 确认的哈希/blob 一致；正文已冻结，状态行漂移见 §九。
- I9 记录：`角色卡/测试/docs/change/2026-10-23_change_i18n-integration.md`（164 行，blob `b62a521d8da86a65b56a354586968cca767a74ee`，SHA-256 `9cec733085ff524f6a344d98e3ac99bf21007d830aac0f9e14a9a066d61203b5`）；状态 **`verified-by-tests-only`**（仅测试证据通过；三项 I9 阻塞已关闭；**不是独立验收通过**）。
- 证据目录：`角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/rerun-final/`；目录校验清单 `角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/sha256.txt`（304 条，含 `rerun-final/` 158 条；SHA-256 `0fd0ab69e6508c81cbf878752c469c2e9f8999993c9e9da96ccd48db7504b9a0`）。
- 状态：**实施与测试完成，待独立验收（I10）**。本文件是提交给内置独立验收的候选变更包，**不是验收报告**；不判定通过/返工/证据不足，不声称 i18n 已验收或已发布。
- 日期：2026-10-23

---

## 一、候选身份

- 当前 HEAD：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`main`，`docs(release): record v1.6.0 published assets and checksums`）。
- 工作树：**未提交、未暂存**；`git diff --cached --name-only` 为空（实测）。候选 = 工作区内容；HEAD 树本身不含本变更。
- 候选基线：HEAD 提交的树。§三候选表是相对 HEAD 实际发生变化的 **i18n 产品/测试文件**；本包不对其他变更的改动字节负责。
- 候选范围：i18n B0–B4 产品/测试文件 + I9 三项阻塞修复 + I9 集成测试夹具。共 **98 个产品/测试候选文件**（新增 20、修改 78），另有 1 个共享组件登记文档只作证据/登记、不计入产品候选（§3.5）。
- `app/renderer/dist/` 是**被忽略的构建产物、非候选**；I9 以临时 outDir 重跑 `build:renderer`，产物与 `app/renderer/dist/` 逐文件一致（`build==dist`，见 `rerun-final/build-hashes.txt` vs `dist-hashes.txt`），本候选未覆盖 dist。
- 工作树尚有目录 v3、治理写卡闭环、验收返工排期、塔防 demo、`.claude/` 与管理记录等**非本候选**改动（§二）；`git status --short` 在本包写盘前为 200 条、写盘后 201 条（+1 为本包自身），条目不等于 i18n 候选数。
- 候选稳定性：候选表生成前后各复算一次 98 个文件的 `git hash-object` + `sha256sum`，两次结果逐行一致（§四）。

---

## 二、候选隔离

本变更包**只列 i18n 产品/测试候选**。以下内容即使在同一工作树，也**不是**本候选，不得以本包或 i18n 验收结论为其背书：

- 目录 v3（变更 B，T3）候选：`src/common/编排/team-plan.ts`、`src/common/编排/flow-service.ts`、`src/common/编排/directory-conformance.ts`、`src/pipeline/orchestration/**`、`src/common/门禁引擎/governance-roles.ts`、`src/model/runtime.ts`、`test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/governance-flow-metadata.test.ts`、`test/测试/governance-e2e-auto/**`、`test/测试/directory-layout.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts` 等（逐项见 §九）。
- 治理写卡闭环（T3）候选：`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`、`test/测试/redispatch-target-recompute.ts` 等。
- 验收返工排期、塔防 demo（`demos/`）、`.claude/`、`docs/communication|planning|scheduling|acceptance` 管理记录、角色卡 `docs/change/**` 证据与 memo、角色卡/边界（`boundary.md`/`boundary.yaml`/`changelog.md`）均非产品候选。
- **共享文件混有他变更上下文**：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/e2e/main.mjs` 同时含目录 v3（以及 `interface.ts`/`governance-advance.ts`/`interface.test.ts` 中的治理写卡）改动；`test/桌面应用/operator-wiring.test.ts` 另含一处目录 v3 `teamPlanSchema: 2` hunk。本包只对其中 **i18n 面**负责；这些文件的整文件字节被列入候选是为了让验收可复算，不代表本包为目录 v3/治理行为背书，也不能用本变更的验收结论为它们判通过。
- 团队计划 §4.7 的排序已遵守：i18n B0 → 目录授权实施/验收 → i18n B1–B4；共享文件未并发写（候选时间线由各角色记录与 I9 复跑证明）。

---

## 三、候选文件与哈希（工作区最终内容）

> 复算方式：逐路径 `git hash-object -- <path>` + `sha256sum -- <path>`。所有路径相对仓库根；「新增」= HEAD 中不存在。哈希为 2026-10-23 本包生成时值。

### 3.1 项目管理（16）

| # | git hash-object | sha256sum | 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `adaf5e5d928d83bea9f99502cd98f2dff3540616` | `70994c1df6d235563df977a77b7939929edcd149abd8e4cef04225aa6c91052e` | `src/common/shared/i18n/index.ts` | 新增 |
| 2 | `38001c4b83181d0f3eec78342b355acffda959a0` | `9431b06bb2d7119e7870c5a7ab58e502f1d82b9dbc2c81736a833bad5955c6f6` | `src/common/shared/i18n/locales.ts` | 新增 |
| 3 | `359974ff62b94b41491b89cba0248f36f4ed219a` | `4346aa4e724b86bbf7e7d7c27af9ef84de85648ac463861766a206fd5c91c469` | `src/common/shared/i18n/keys.ts` | 新增 |
| 4 | `1e31eb529cb8d83d9a3a37e09262c1570026a65c` | `942eb3d1933d266bb59e97f79872606ba073ea149c7a4269c39a1185c58849e6` | `src/common/shared/i18n/types.ts` | 新增 |
| 5 | `b5f32940ca14e5dc40f37ec59b3067073bd26c8b` | `c9967f7920b63d0f26c50e2b252ae67135c6494cee7d541fe2f8d07d6eae118f` | `src/common/shared/i18n/translate.ts` | 新增 |
| 6 | `6af5507796498283cc88f582ccb1bc212523aad5` | `5bcdccd09074e5539a23617d7d0caecfd5386942802c54f14a08080f4398b38a` | `src/common/shared/i18n/format.ts` | 新增 |
| 7 | `b38c7664bdbbf20ffa0ddc2ecf0de4d9bfaf0914` | `02fd19459fb8cb628b5b6d6054726852901c22abb5bd4309a5fb224727255df8` | `src/common/shared/i18n/messages/zh-CN.ts` | 新增 |
| 8 | `15cfccc73faf6cd66c1243357f822ac357c23ecb` | `9522a65d6166d4fc6c4a9562bb86e59e705d44c721ac92e73385e8e0ebe28fff` | `src/common/shared/i18n/messages/en-US.ts` | 新增 |
| 9 | `5169a7791b63802ee73f34951b66b43aed4d07a7` | `a5fedea2d6ae2fbfda9eaf03caf1a83493f0d5c76c37369342892615024ec6d2` | `src/common/shared/runtime-settings.ts` | 修改（B4） |
| 10 | `d741f6b12d8a42edb150ac40eb4619bcb71e48e9` | `2e01eaa0d137c2e0bd84d0befdbc995d14a81d444f47225ae206d4c155167799` | `src/common/shared/runtime-shared.ts` | 修改（B4） |
| 11 | `bca8e6ad8d9c36677acacef88f96faaab526f855` | `af234a1b74c695bfadfa666e540534a05fc5acaad6683a760d1527ffb7c6621f` | `test/项目管理/shared/i18n.test.ts` | 新增 |
| 12 | `3358a1428f60b1d115e9a3af5aab39601938eb12` | `05003446fd8973b9954dd10593f8f5df284d68b3d733b8832a83338f949cf7e9` | `test/项目管理/shared/i18n-guard.test.ts` | 新增 |
| 13 | `58f414f696f56b8a848c32a16a946851b6927e26` | `29541e89cc65cfe51dfab194efc0bfd4d265d5d4293c58b3fe8b740f5363da3b` | `test/项目管理/shared/i18n-guard-allowlist.ts` | 新增（I9 阻塞修复，18 条） |
| 14 | `78f9085a776a16c801240440988c566bb62c9ef1` | `132a5325f7d5d1c552ad32b31a53fe4b659f74fbfc0f46d629ce273073e1661b` | `test/项目管理/shared/i18n-guard-scanner.ts` | 新增 |
| 15 | `085dc35ae5c85cec2ba11099ca85103c34fbd8b9` | `d7e77b25291d928fe47ed1f0b23ace0782b8dd577724fc5884d7615cc79ffaac` | `test/项目管理/shared/runtime-settings.test.ts` | 修改（B4） |
| 16 | `59034062df0b7f3fbc0bc11705b003296c6a1c93` | `ce44fcb9469dd8a33c4a4870389316707516ca9685dd9084aecd3a11338a0ee8` | `test/项目管理/shared/runtime-shared.test.ts` | 修改（B4） |

### 3.2 桌面UI（49）

| # | git hash-object | sha256sum | 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `5fe20dd651f667943617c94f69291c93224166f4` | `0249f3440f4364c1aab704bf13f3b53caae6699c795ec9eb5d9ede10f534c144` | `app/renderer/src/i18n/index.ts` | 新增（facade，只再导出） |
| 2 | `f822e6bbd83335193af73a6daee1f684fc1aa1b0` | `e24599f0455afb1cddde7bce102cfe83ca044b3e077e81f09773b7f88fbc1b16` | `app/renderer/src/i18n/locale-store.ts` | 新增 |
| 3 | `5ec29faf16547c84fc660f85429771edc57282af` | `d419a0cb1f061eedf775d4ab216798949307c11757e88910c2eac74c82351df0` | `app/renderer/src/App.tsx` | 修改（B0） |
| 4 | `bd5084d90e8ffe2f60c45074aaa6b867b3ad0bf2` | `de80128f313dcc20741ac9c157466db795189178861761da1f84964dd4cad833` | `app/renderer/src/main.tsx` | 修改（B1） |
| 5 | `8c27680945897a1e39ec75c9198420d5e8d28dd9` | `6866ea181edb4d1096d54fda03ab170103adfa25afaa7bb88c407e200c9e5341` | `app/renderer/src/lib/platform.ts` | 修改（B0） |
| 6 | `b5ae1f75e72b316f5c3a15d3b444c324eb270a23` | `6fcbf23f59275939c0f68a84062dc4cb03c0721ee4ed31f5fc9d2c8eb2612dc3` | `app/renderer/src/shell/TitleBar.tsx` | 修改（B1） |
| 7 | `06de765033fda8af0638bc8eb9486240f233602b` | `1468ad25023581980c5d3dfc17c22318006b313715d4acd6403e926f447e3a32` | `app/renderer/src/shell/Sidebar.tsx` | 修改（B1） |
| 8 | `a9415dca39609e8bd772e8924c4daa42937f2025` | `73bfa960e7dbd07d68d2f3ec5fee9213e4d528718a7db5133ad75a44c795ab1a` | `app/renderer/src/shell/ChatHeader.tsx` | 修改（B1） |
| 9 | `7d7b1949a58786eb21730dfcc72fd8898f5c0039` | `c2eed0a6ab6b5dd3d179651076cf4a633e24cbe8420ec9e4e9a180f2781d5b80` | `app/renderer/src/shell/Composer.tsx` | 修改（B1） |
| 10 | `e5d1bd03e2bd0e71624a8527f5106356254f616c` | `46042e54298a21ea3c4b4475a76254aaf3e759bfee35721250d391f028405432` | `app/renderer/src/shell/Drawer.tsx` | 修改（B1） |
| 11 | `752df7cc85196369f7a9ce09a0a8fc335af46819` | `3a0d0ec72885e4d1a7c562c9fb9ca8db5b334b6f99a827fd393af24da1880ac2` | `app/renderer/src/shell/EngineSelect.tsx` | 修改（B1） |
| 12 | `bd72e3598e49719b8992d239921fafb2b4f982ec` | `b32d26a782a36eacb0b1d179b258660f90ee62822e732961c666875d154d900f` | `app/renderer/src/shell/SettingsPanel.tsx` | 修改（B0/B1） |
| 13 | `9a1176755a4e931f8303fe7c555a574db5e4b61b` | `899f4373713df4d2af48837bf8e5da6fff329fd2dd83c5a5faf18514a68a34c5` | `app/renderer/src/shell/GovernancePanel.tsx` | 修改（B1） |
| 14 | `571dad4b7f1d2f62eb7d3ddce3b1f4112520bc27` | `c29a2ef7d4e59066a85ccb3b625af94c7ba15448dd2f4f7e697c83e875ec24ed` | `app/renderer/src/shell/ReportCard.tsx` | 修改（B1） |
| 15 | `2305e62ca0f58754f9d2c9cd7d4a3473337dc7f1` | `55d05c5d213dfe01b4a6a78e668f8e9bc44c627325f7d839bceaebdd9bd3ced0` | `app/renderer/src/shell/DocumentView.tsx` | 修改（B1） |
| 16 | `43225790b26324059edc75173f63443014fe7072` | `3cc118d1c0dd7d99613811e644f72d51c23dddd27d182385f30c18a26e35a20d` | `app/renderer/src/shell/ProfilePanel.tsx` | 修改（B1） |
| 17 | `1f90fcf7b43c373b972152709267045015d53fa2` | `7ba24ab5d8b28ef581369342ff0a1db74e566e603a36cb4d8e62540b618d1c38` | `app/renderer/src/shell/QueuePanel.tsx` | 修改（B1） |
| 18 | `0a511adec8da2bbd082381a5659f26a1e867a670` | `773b35a31e396109c9b0bca14f31958f454a8ea3bcbf441f71d8487efc527d2b` | `app/renderer/src/shell/QueueSubview.tsx` | 修改（B1） |
| 19 | `acb67867b2bfae68b274ef82264e7cb4a1301e3d` | `37ecba1e5b67dd1d1b55912459711216a1ec7f0b0869de0a3e12fe59e210fbef` | `app/renderer/src/shell/WorkOverview.tsx` | 修改（B1） |
| 20 | `3ae927ec7e661d0893350bd7df1c6eefb040548f` | `dbf9d2d9ec95939f2de9d5830ed7c8bda2423d3e1191672decb2e8b98b8b9295` | `app/renderer/src/shell/ConfirmCard.tsx` | 修改（B1） |
| 21 | `cf877d7878b968352cc9b0c9418769e445944112` | `052ea23040804e4ab2872c2a6b6813ba816db92f0c1e90d3c7ae2c0393391100` | `app/renderer/src/shell/phase4a.css` | 修改（I9 阻塞修复：`@media (max-height:480px)`） |
| 22 | `62cc1f69ea5b04caa1a0a51b08e286f6d3e1b63d` | `37012bcde0202c2f460d29e85994b97d39ea871c7a4739895d41ebdd18d22f5a` | `app/renderer/src/chat/ChatRow.tsx` | 修改（B2） |
| 23 | `5f2a8949af04adbd97302858df67a82b41d5b3fd` | `9a27cb0b653048d8037123e6c3e0c32314072fe0053bb0c35fc038d063d20c82` | `app/renderer/src/chat/ChatStream.tsx` | 修改（B2） |
| 24 | `807b8b202ebdd5b98e9ef6133b6ef81c5cb294d8` | `6c5add9700c13d663fd0a6ef15a808355b325a5948779716bb34416b20c285f8` | `app/renderer/src/chat/chat-store.ts` | 修改（B2） |
| 25 | `1b0b754c2bc61c098a802277cb13361527d68916` | `d73add0740e49205a72b42ae7977af252cfcb9b17bcf8dfdb3c44494b69b05ad` | `app/renderer/src/chat/confirm-logic.ts` | 修改（B1） |
| 26 | `902269c10bcc7b02fcefa44c80dc906dda025b71` | `4bf32a9d34f7ded97f2e1a83d7a10f3966d69142aa5178910080c608854be3ff` | `app/renderer/src/chat/document-view.ts` | 修改（B2） |
| 27 | `b44ba33a7793acb86e40511a746d30d896299dc6` | `547cd43219027d7e815d6ded4327aec2179f26f780f4add6599268a90e62a182` | `app/renderer/src/chat/events.ts` | 修改（B2） |
| 28 | `f365befb78d70021370edecd405b99b1d11c873d` | `c01a9d0fdb2f70ca3f89f839c94a7afee5e7808bddf988da8e804a8eaab98a58` | `app/renderer/src/chat/governance-view.ts` | 修改（B1） |
| 29 | `21803c66119f5c469d7c448957bad8ef64800438` | `e4135e938108caa72d4fe8e29b58953ef322ac456493ec65fb903b960ee8cf30` | `app/renderer/src/chat/judge.ts` | 修改（B2） |
| 30 | `d047bdce729852835d6d204db759055a8f3bca74` | `c1b8692836e7bc8ffc7a9ad0892bebfc55c72f84387520081a75bfa7e41021f9` | `app/renderer/src/chat/markdown.ts` | 修改（B2） |
| 31 | `909fe48759783dd4d5a1332ef479c215417f50d3` | `2b90895e4cbe6f9b6fae9d9c951a3dfb564b3d395db39e7bde8e02035a27c749` | `app/renderer/src/chat/operator-view.ts` | 修改（B2） |
| 32 | `fb42bdfdec395f8c979ad7f813aa1fbb092a7eb6` | `cc17729bed91ae0dfc6e1df322b1e03ae7110cbdbcaac5d786f6dfe8e7630f19` | `app/renderer/src/chat/reasoning.ts` | 修改（B2） |
| 33 | `4631265fb86ea940be714572f97c65b213acdd95` | `32a38a2c9501e89ec654eed4a390f6b80a9ce3cdc2e4d38757bd4790f151f21d` | `app/renderer/src/chat/report-view.ts` | 修改（B2） |
| 34 | `4989595a36a58444cd805cfc3531af1716bc4539` | `62d6a4291131a933cfb28b9e8dc264811a7599f031697ce952657a3235351660` | `app/renderer/src/chat/role-view.ts` | 修改（B1） |
| 35 | `4877d82de2e65ff685be43411357f129ea453ca5` | `7bbd8b1d0c1a6bf402e19efb14c44cd323d463f618cb1ec47072beb90c21cad4` | `app/renderer/src/chat/runtime-config.ts` | 修改（B1/B4） |
| 36 | `ca211409cb39b9f5cfedd2be3093091f42abdd9d` | `00960b216bd586aea0a29e7a9d184895649b3ae060c0b6f69aa035de1516faa7` | `app/renderer/src/chat/status.ts` | 修改（B1） |
| 37 | `dfb7acb46723fe1b94104747b6c897d7f30c74f8` | `b8651b662f387d6eaadb44860f3a4d959988a843389c5b0f1b0bc6fff3aa4e87` | `app/renderer/src/chat/tool-summary.ts` | 修改（B2） |
| 38 | `fb42aae9775b3342d12da3ae5668e2f7b50bd144` | `720c0663bd909e3904ad594eba8025161edd2fc5c01f12f8f0e46bb2663d27b8` | `app/renderer/src/chat/types.ts` | 修改（B2） |
| 39 | `5bbf5f48eba18043cbcf6001d1fe3ed659e4aa03` | `d3e3cb39c61951bb38a808000545f052adea1d213b7aca7a0cec130152fde43c` | `app/renderer/src/chat/work-view.ts` | 修改（B1） |
| 40 | `3a701f9ea2bc893614e6746c2d93d00141c12d0e` | `24ff2d49e90d239e207cb7c083fe570c46484f27a92c71e5820f3240a0d8ed1c` | `app/renderer/src/stores/confirm-store.ts` | 修改（B1） |
| 41 | `4f40b1507b4cc5650b0c9f604ef7f9586e07830f` | `4cb2431a0e658f54d225f245c98582db71e63cb543ec56e27e2d61579197fda1` | `app/renderer/src/stores/drawer-store.ts` | 修改（B1） |
| 42 | `767bc5add7cd73ef3ab198cbb89260595d0d7d80` | `970e165ad7902ecd07ce70fdb6129fcd1e7e1dc911e9eada89d85a65a48e0ffc` | `app/renderer/src/stores/governance-store.ts` | 修改（B1） |
| 43 | `663ad8636964d5961280b4c65ce9707de5e5284d` | `54c9c271bccdf8b11b69ca5611b2ca02fb2faaffcc40ff25891f3c32f252ce18` | `app/renderer/src/stores/report-store.ts` | 修改（B1） |
| 44 | `36cb584d9436087765ee6e7cc8adb84ea103e5b3` | `08d5776858253e5d20e347641e1589f5f274f062d4de59ffdea27501e3150f89` | `app/renderer/src/stores/settings-store.ts` | 修改（B1） |
| 45 | `bded84b35836cea821d782f6e7a7fbc7bde1bc61` | `563e7a795f8d00dee0dd328e0ea6c46be22ca9c8bc42eb8b5c9a4854f26dfb41` | `test/桌面UI/runtime-config.test.ts` | 修改（B4） |
| 46 | `7e2e654cf4596c982130b7c843645932eb5c7d82` | `6c761264753e2c4e2b2110a53fd41fdd7326a4076423d157f4e69feec90a0e5b` | `test/桌面UI/source-guard.test.ts` | 修改（B1/B2 守卫） |
| 47 | `356bbd0b6f74fa70af84905039f030f7caa63f8e` | `6ba30a285c4ed5cd791807af4b48d606f1014be85c816757fa9d85ff5f5cbc78` | `test/桌面UI/i18n-b1-b2.test.ts` | 新增 |
| 48 | `9aafc11efb9c8a34d95f4e2ed96887ce56fce467` | `600c81540ba63c51c81b9f189e11d56853037ce9dc36360cec3e4bbb019728ee` | `test/桌面UI/i18n-store.test.ts` | 新增 |
| 49 | `9a88dc258e1512cbc1961de9f0d10cbf82385d8d` | `7fb032a2ea7e30a6c9cc81cf41c590acdd23977f2758c55afce9f442b076e861` | `test/桌面UI/i18n-view.test.ts` | 新增 |

### 3.3 桌面窗口（28）

| # | git hash-object | sha256sum | 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `427b707b62e60f14b620c0807d73a02c8323e12e` | `e7a55fd12d4e5f3bbd11e9670fc63509ac6f10b341970e1350518f2465883587` | `app/desktop/i18n.ts` | 新增 |
| 2 | `008f74d17b1290776ea0399106dbca7c6b2031e9` | `381deae724e914a4dba0a753849eb5eee63080163cfcb6a1b90c21fecb19d66e` | `app/desktop/preferences.ts` | 新增 |
| 3 | `80bb89cb214938f2127f8da5c72d1384eda692ba` | `7a02b434729689eaa83cfd622bc3dcb25ce460a1ac1ec365939c0f1bf268f158` | `app/desktop/interface.ts` | 修改（B0/B3；含目录 v3/治理 hunk） |
| 4 | `f4c997f2b330d5b5220518fe6640aac0eaf6a2b2` | `c84cf85454facff4e4013f7b8ad305da49d9a4eefd4aad63dcb1d21792c32fa7` | `app/desktop/governance-advance.ts` | 修改（B3；含目录 v3/治理 hunk） |
| 5 | `3ca397c6e7ba9660c60c44e6639d4a53ffc1d693` | `da11f50e0b51648bdc7a9394796811e91ec199a4fca6d4b78e9e95e4d22045c1` | `app/desktop/session.ts` | 修改（B3） |
| 6 | `2a1db385ad329d9db8d4810aa95041b4abcac680` | `6842f960353cf53af5c7d4a08986a15041602d4289537533b71c66121727c206` | `app/desktop/runtime-history.ts` | 修改（B3） |
| 7 | `d655bc95b0b9c9afb6541b306f014186ff6e58fd` | `b678c0f4f3dc788a8f5673d437995ebddd1f5ac49a9d4b7845447752c22b33c1` | `app/desktop/session-history.ts` | 修改（B3） |
| 8 | `e5d24d22b951ec7152facf62a6e2260073ec45f0` | `d69c79294109ebb2bafa248631be558193a5b421b4249070a9b2abc2a6dd45d2` | `app/desktop/project.ts` | 修改（B3） |
| 9 | `5e31bf723668a3fd23f507626e81b83e864ef6a8` | `7378de73696fef47051cad872ef3a62f81b34fc4c91ffbd0a68c47d2b3860bbe` | `app/desktop/runtime-config.ts` | 修改（B3/B4） |
| 10 | `7bb3449dfec0719a87c041b3eaa4aea8768d621b` | `a34846ae4a287adf2fec37defe8ed2e6e136b29a618b6b006ccbe6741391aa5e` | `app/desktop/runtime-resolution.ts` | 修改（B3/B4） |
| 11 | `bf49b31ed61b0319149dd060af267a3a67d52bc1` | `5b24c0e8bb0167c6d0ac2ec98bb16461afa2a6b466b45bad3f3d135499435b9c` | `app/desktop/composer-images.ts` | 修改（B3） |
| 12 | `616da48e2b7010c06127ce892db8d5af8115b198` | `3c09fc95db93fd7fd12785ae58cb2c649286a139f84fc9a793c7ea3a66e17d0b` | `app/desktop/confirm-card.ts` | 修改（B3） |
| 13 | `049117443573c6f844ff2f5c39572010e38d1b2e` | `2fd40074b7463fa0573dd1a1d0db0c7aa393abf5f620c3385b0797ca815209e2` | `app/desktop/customer-input.ts` | 修改（B3） |
| 14 | `574cdf2d7721acfedf5d349ea2d83c8db5264b96` | `36055abcd562c71f8df9230990a015c55f050cbb93ba177611b3a0b9ccc33ed2` | `app/desktop/operator-channel.ts` | 修改（B3） |
| 15 | `f520482d4eac907acefd23e361d96110ca7962f6` | `2fcee235fa136431545c1728ac2139c19eed12f581937dd46c68916322af1365` | `app/desktop/recovery-channel.ts` | 修改（B3） |
| 16 | `765f207841c64da20a89d9230959aa169fda50f4` | `993eec2e5ad15e3254f7e9780bd0d84188e9a88a285f3af4dd0ddbeda3327eb3` | `app/desktop/watchdog.ts` | 修改（B3） |
| 17 | `4f51b113fc765e8467321ee3e73146c37d7d65bb` | `e02f4d40136c02aadc52c009cd6ea86207f7dd4b06ee8377c3ea2aec358878db` | `app/desktop/judge-reason.ts` | 修改（B3） |
| 18 | `e7c48f58e703bb2d25733b1c9980ea7f41b85cb6` | `55830144325b073728824c6a2f9370d2fd685fc27763256b5c4992f56b0d1df4` | `app/desktop/chat-adapter.ts` | 修改（B3） |
| 19 | `7763f22e6189d6f520093dcd3e1c5d4f26825603` | `c5e64cd04cf5281c14fa295b7bc4ea36b9fcbbe5e61f7a8d2bfb70e8efd5aef0` | `app/desktop/diagnostics.ts` | 修改（B3 恢复页） |
| 20 | `49cd5530345958d2e4f5dcb2887dfabfb5b37240` | `89d822f88821ad9f16cd9be3862670f75a4582400d26a87781f42e26f2d8a98f` | `app/main.ts` | 修改（B0/B3） |
| 21 | `247985dabcbae2551c200fc85abfc39827b7002e` | `e4af7435116bcca92e4aa043213194f82d1c5b9f2bd1646a0c523c0bfa89d1f1` | `app/preload.cjs` | 修改（B0） |
| 22 | `2185ae934ab8fff6377fd02504cadc0619e44d5e` | `448b2586fe133badfbbc7abd36253d405aea04516091146467e96afcb149dda0` | `test/桌面应用/interface.test.ts` | 修改（B0/B3；含目录 v3/治理 hunk） |
| 23 | `413fccdbdf8acbd7a27e09c2aa98ea680dcb7ac5` | `358e99c245df28ad25fcba6ee24e1313b5b59706a45db589e1094c2566668146` | `test/桌面应用/multi-runtime.test.ts` | 修改（B4） |
| 24 | `bbcd9683ea70d65b621732d98273be3f35ca6ce4` | `8e98274a0c596ea7cffa200642d252a7d7d858e96840079159c0786979921351` | `test/桌面应用/pi-config.test.ts` | 修改（B4） |
| 25 | `eeb5f4e97b8005aa8fb3f50f74af71de6b1f4b38` | `8e560d11ffccfa94647a259a42bdadcb9586f0de25eec4face1daacc9fe89c65` | `test/桌面应用/session.test.ts` | 修改（B3） |
| 26 | `73c1e22dcd64e88debc5f7b62625760292db637c` | `a8c9f24617b2e03b947b2257bcff60a5c917222af279ca86d34fbf4bc11cbed7` | `test/桌面应用/operator-wiring.test.ts` | 修改（B3；另含目录 v3 一处 hunk） |
| 27 | `142e0f18d7701964053d97c6412d38809684c329` | `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b` | `test/桌面应用/e2e/main.mjs` | 修改（I9 夹具候选；含目录 v3 `preferences:get` 桩与 I9 等待修复） |
| 28 | `e78e2e050da39de9815d1b1e213e9a9eaf401bd5` | `d08988c94ece4b8bf3489ea9d9d208cf4ef9af120db0c2d4b445fa3527fe0bd1` | `test/桌面应用/boundary-refresh.test.ts` | 修改（B3；i18n-only diff 已确认，2026-10-23 补入） |

### 3.4 测试（5）

| # | git hash-object | sha256sum | 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `ab22f2b8e7dca485deefe5acde153d257975c776` | `57aa7ff82e18add312580b17dc2e7e10c6deae12b5f03d5c9e34b80bb68a0ba3` | `test/测试/i18n-integration.test.ts` | 新增（跨层集成 8/8） |
| 2 | `d37c44f88263357f71201a3ef0409cf7ccc2d755` | `a919eee53f4a25148cbce92a2853b20f7fbbe86a98d2fa330be4f7bb63355082` | `test/测试/g5-reasoning-verify/f-settings.test.ts` | 修改（B4 消费者） |
| 3 | `1c2cdc4a4d7d84d74f5fb380a77d4e704a594d9f` | `71842ced0d1ae05e551696468ad27dbcad2791239dfca003c170694d1611287e` | `test/测试/t29-pi-config-roundtrip.test.ts` | 修改（B4 消费者） |
| 4 | `6c798ae9df308704f19aa50f7d6cffa416302156` | `10765961cafc67b19485c1606347840fdce2e95008d6645da9ad76d01eaceab8` | `test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | 修改（B4 消费者） |
| 5 | `2cbd5e5a12bfdd4975b9e7ab1ccaa19f4ff71f6f` | `9505901ba077d01b43adca00ccd53e09fb542ff40d932bac665af14f84b895f2` | `test/测试/existing-project-compat-verify/b-establish.test.ts` | 修改（B1 消费者：governance-store 文案 key 化断言） |

### 3.5 登记/证据（非产品/测试候选，不计入 98）

| # | git hash-object | sha256sum | 路径 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `dfba3f62492ef67363d4f2bb0d7297cd854a3258` | `bb44760463a0b4f71cf481fb240bd8290130fbfc3f94f72912b5265e338fd63f` | `角色卡/项目管理/docs/architecture/shared-components.md` | 项目管理按 P1 登记 i18n 共享组件（组件 9）与 runtime-shared/runtime-settings 的 B4 契约；是登记/文档证据，不是产品候选 |

---

## 四、候选稳定性

- **生成前快照**：候选集更正为 98（补入 `test/桌面应用/boundary-refresh.test.ts`）后，对 §三 的 98 个产品/测试路径逐行执行 `git hash-object` + `sha256sum`，输出 98 行，整体 SHA-256 `d8373e32e4b4a5fa27694abb62904b06ae87a4df74b1114de81e472d39e3c0a5`（2026-10-23 本包更正写入前）。
- **生成后复算**：写完本变更包更正与 memo 后，对同一 98 路径再算一次，逐行 `diff` 为空；整体 SHA-256 与上值一致。**产品/测试候选零变化**。
- 写包期间唯一可能变化的是测试角色 `docs/change/...-evidence/`、`docs/scheduling/memo.md` 与本变更包；这些不是产品/测试候选，也不参与候选哈希。I9 复跑开始（17:22）之后 `app/`、`src/`、`test/` 无文件被修改（`find app src test -newermt` 0 项），说明 I9 证据对应当前产品/测试字节。
- 环境（I9 证据）：Node `v24.22.1` / npm `11.19.1`；Windows_NT MINGW64 10.0.26300；git 2.55.0.windows.5；cwd 仓库根；HEAD 与 staged 0 见 `rerun-final/environment.txt`。

---

## 五、节点表 I1–I11

| 节点 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| I1 | 闸门 2 角色指派/写集/顺序/验收安排 + 实施授权 | 已确认（2026-10-23） | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`「闸门 2 确认记录」 |
| I2 | 实施前验收标准 v1（P1–P12、T2、判定规则、证据计划） | 已冻结（2026-10-23） | `docs/acceptance/i18n-criteria-v1.md`（`0d91d179…`，691 行） |
| I3 | 基线：HEAD/工作树、typecheck、受影响套件原始输出与失败分类 | 已完成 | `角色卡/测试/docs/change/2026-10-23_change_i18n-directory-baseline.md`；`角色卡/测试/docs/change/2026-10-23-baseline-evidence/` |
| I4a | B0 共享契约：目录/类型/翻译/回退/守卫 + 共享测试 | 已完成 | `角色卡/项目管理/docs/change/2026-10-23_change_i18n-b0.md` + `…-b0-evidence/` |
| I4b | B0 接线：渲染层 facade/store + 主进程 preferences/IPC/preload/窗口 | 已完成 | `角色卡/桌面UI/docs/change/2026-10-23_change_i18n-b0.md`；`角色卡/桌面窗口/docs/change/2026-10-23_change_i18n-b0.md` |
| I5 | B1 渲染层外壳 key 化（zh 断言不变 + en-US + 布局冒烟） | 已完成 | `角色卡/桌面UI/docs/change/2026-10-23_change_i18n-b1-b2.md`；`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b2-key-supplement.md` |
| I6 | B2 渲染层聊天/面板 key 化 | 已完成 | 同上 B1/B2 记录与 `…-b1-b4-keys`；`2026-10-23_change_i18n-allowlist-tighten.md` |
| I7 | B3 主进程用户可见文本按 locale（历史不追溯） | 已完成 | `角色卡/桌面窗口/docs/change/2026-10-23_change_i18n-b3.md` + `…-b3-evidence/`；`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b3-key-supplement.md` |
| I8 | B4 共享设置元数据 key 化 + 主进程解析 + 消费者重测 | 已完成 | `2026-10-23_change_i18n-b4-metadata.md`；`2026-10-23_change_i18n-b4-desktop.md`；桌面UI `2026-10-23_change_i18n-b4.md`；测试 `2026-10-23_change_i18n-b4-consumers.md` |
| I9 | Reduce：跨层集成、消费者重测、真实 Electron、候选哈希/diff/status | **已完成（`verified-by-tests-only`，三项阻塞关闭）** | `角色卡/测试/docs/change/2026-10-23_change_i18n-integration.md` §九；`…-evidence/rerun-final/` |
| I10 | 独立验收判定 | **待进行** | 本变更包 + 标准 v1 + I9 证据 |
| I11 | 放行/回报 | 未开始 | 不在本包内 |

---

## 六、实施摘要（B0–B4 + I9 修复）

- **B0 基础设施（I4a/I4b）**：新增单一共享消息目录 `src/common/shared/i18n/`（`locales`/`types`/`keys`/`translate`/`format`/`messages/{zh-CN,en-US}`/`index`），冻结 `Locale`/`SUPPORTED_LOCALES`/`DEFAULT_LOCALE`/`resolveLocale`、`translate`/`createTranslator`、插值/`Intl.PluralRules` 复数/en→zh→key 回退与 `i18n.missing-key`/`i18n.missing-param` 诊断。渲染层新增 `app/renderer/src/i18n/index.ts`（只再导出 shared，不复制目录/resolver）与 `locale-store.ts`（localStorage 镜像、`preferences:get` 校正、广播订阅、失败回滚、DOM `lang`）。主进程新增 `app/desktop/preferences.ts`（`<userData>/ans/preferences.json`，`atomicWrite`，缺失不写、损坏/非法 locale 降级 zh-CN）、`app/desktop/i18n.ts`（当前 locale + `t`）；`interface.ts`、`app/main.ts`、`app/preload.cjs` 接入 `preferences:get`/`preferences:set-locale`/`preferences:locale-changed`、窗口/对话框/启动错误框标题。`app/renderer/index.html` 保留静态 `lang="zh-CN"` 默认，运行时由 store 更新。
- **B1/B2 渲染层（I5/I6）**：渲染层外壳、聊天、面板与纯逻辑（`shell/*`、`chat/*`、`stores/*`、`App`/`main`）迁移到 `ui.*` key；纯逻辑函数增加可选 locale（默认 zh-CN），旧中文断言逐字保留；新增 en-US 断言、`test/桌面UI/i18n-*` 测试与 source-guard 消费约束；AST 硬编码守卫 allowlist 逐批收紧（最终 18 条）。
- **B3 主进程用户可见文本（I7）**：`session.ts`、`interface.ts`、`governance-advance.ts`（仅用户可见系统行）、`runtime-history.ts`、`session-history.ts`、`project.ts`、`runtime-config.ts`、`runtime-resolution.ts`、`composer-images.ts`、`confirm-card.ts`、`customer-input.ts`、`operator-channel.ts`、`recovery-channel.ts`、`watchdog.ts`、`judge-reason.ts`、`chat-adapter.ts`、`diagnostics.ts`（恢复页）在生成点用 `main.*` key 翻译；外部 SDK/文件系统错误原文作为参数保留，机器码/协议字段不翻译；历史不追溯。`governance-advance.ts` 中发给 agent 的任务文案未翻译（按其记录只改系统行/提示，另含目录 v3 hunk）。
- **B4 共享设置元数据（I8）**：`runtime-settings.ts` 的 `label/help/choiceLabels` 改为 `labelKey/helpKey/choiceLabelKeys`（`MessageKey`），字段集/必填/choices/secret/fallbackKeys 不变；`runtime-shared.ts` 的 `demo` 改为语言中性 `"demo"` + `RUNTIME_LABEL_KEYS`；桌面窗口在构造设置视图时按当前 locale 解析回 `label/help/choiceLabels`（渲染层 IPC 契约不变）；渲染层本地 `RUNTIME_LABELS` 收敛到共享 key。消费者（`multi-runtime`、`pi-config`、`g5-f-settings`、`t29`、`turn-watch` 等）逐个重测。
- **I9 三项阻塞修复**：
  1. PM allowlist 陈旧 → `i18n-guard-allowlist.ts` 收紧到 **18 条**（移除 `app/desktop/runtime-config.ts`），shared 181/176/0/5、guard 6/6、`scanned=107 allowlisted=18 violations=0`；
  2. 200% zoom 设置保存条不可达 → `app/renderer/src/shell/phase4a.css` 增加 `@media (max-height:480px)`（面板 `block`/`overflow-y:auto`、保存条 `sticky`），真实 Electron zh/en 各 4/4 保存按钮可点；
  3. `main.mjs` REPORT_STATUS 确定性失败 → `test/桌面应用/e2e/main.mjs` 改为有界等待行模型/挂载；4 次 fresh userData 中 3 次 `E2E_PASS=true`，三项 `REPORT_STATUS_*` 在 4 次运行全 true。

---

## 七、验证证据

### 7.1 套件最终计数（I9 最终串行复跑，current candidate）

| 检查/命令 | 结果 | 原始日志 |
| --- | --- | --- |
| `node --test test/测试/i18n-integration.test.ts` | **8/8 pass**，exit 0 | `rerun-final/i18n-integration.log` |
| `node --test "test/项目管理/shared/**/*.test.ts"` | **181 tests / 176 pass / 0 fail / 5 skipped**，exit 0；guard **6/6**；`scanned=107 allowlisted=18 violations=0` | `rerun-final/shared.log` |
| `node --test "test/桌面UI/**/*.test.ts"` | **195/195 pass**，exit 0 | `rerun-final/desktop-ui.log` |
| `node --test "test/桌面应用/**/*.test.ts"`（串行，最终 run2） | **558/558 pass**，exit 0 | `rerun-final/desktop-app-serial-run2.log` |
| `node --test "test/测试/**/*.test.ts"`（串行，PATH 含 nodejs） | **822 tests / 815 pass / 1 fail / 6 skipped**，exit 1；唯一红 = `g4-skill-verify` 既有 Windows symlink EPERM | `rerun-final/test-domain-serial-run2.log` |
| `node --test "test/装配/**/*.test.ts"` | **84/84 pass**，exit 0 | `rerun-final/assembly.log` |
| `node --test "test/编排/**/*.test.ts"` | **810 tests / 809 pass / 1 fail**，exit 1；唯一红 = 既有 Windows symlink EPERM | `rerun-final/orchestration.log` |
| `npm run typecheck` | exit 0，0 错 | `rerun-final/typecheck.log` |
| `npm run typecheck:renderer` | exit 0，0 错 | `rerun-final/typecheck-renderer.log` |
| `npm run build:renderer -- --outDir <临时目录> --emptyOutDir` | exit 0；产物与 `app/renderer/dist/` 逐文件一致（`build==dist`） | `rerun-final/build-renderer.log`、`build-hashes.txt`、`dist-hashes.txt` |

**失败/复跑分类**：桌面应用首轮 557/1 的「可重入门禁 readiness 恰一次派发」为时序偶发（`interface.test.ts` 隔离 119/119、精确用例 1/1、全量复跑 558/558）；test-domain 首轮另有 `t9-block3` 因 Node 不在子进程 PATH 报 `spawn node ENOENT`，带 PATH 隔离 20/20，最终复跑只剩既有 EPERM；`i-full-chain` 最终复跑通过。上述均非 i18n 产品回归。T2 不做全量回归。

**补入候选的边界刷新测试**：`test/桌面应用/boundary-refresh.test.ts`（B3：`main.session.rebuiltSkills`/`rebuiltBoundary` key 断言）包含在 `test/桌面应用/**` 串行运行中，最终 558/558 全绿（`rerun-final/desktop-app-serial-run2.log`）；P7/P10 以该原始输出与 §3.3 #28 的候选哈希为依据。

### 7.2 真实 Electron

- `test/桌面应用/e2e/main.mjs`（真实主进程/preload/渲染 dist，fresh 临时 userData，无真实 `.env`/凭据）运行 **4 次**：run1/run3/run4 `E2E_PASS=true` 且 `E2E_FAILURES=` 空；**4 次运行 `REPORT_STATUS_UNREPORTED/FAILED/ABORTED` 全部 true**。run2 仅 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 一次失败（单点行数断言与异步行投影竞态；后续阶段行数在四次运行一致收敛 34/35/36，无持久多余气泡/重复行，随后连续两次通过），归类测试时序、非 i18n 回归。证据 `rerun-final/e2e-main-fresh-{1,2,3,4}/report.txt` 与 `*-console.log`。
- 200% / 最小尺寸冒烟（真实 dist + preload、临时 userData、桩 IPC）：zh/en **各 4/4 检查通过**——960×620 保存按钮中心命中、侧栏 208、`doc.scrollWidth=clientWidth`、面板 `flex`/`static`；480×310（200%，dpr 2）保存按钮中心命中、面板 `block`/`overflowY:auto`（scrollHeight 763(zh)/846(en) > clientHeight 210）、保存条 `sticky`、滚到底仍命中、零 console error。证据 `rerun-final/layout-200pct-{zh,en}.log`、`rerun-final/layout-200pct/{zh,en}/report.json` 与各 3 张截图。
- 跨层 i18n 契约（共享目录 parity、preferences 文件缺失不写/原子写/损坏/非法 locale/不可写降级、IPC 形状、locale store 镜像/校正/广播/失败回滚、store+真实 preferences 服务「切换→文件→重启保持」、`RUNTIME_SETTINGS` zh/en 解析）由 `i18n-integration.test.ts` **8/8** 覆盖。
- 证据边界：最终候选未重复「设置面板内切换→重启」完整手工时间线（相关文件与上一轮 I9 候选同哈希，除 `phase4a.css`）；切换/重启由集成测试 #5、`main.mjs` 与 200% 冒烟共同覆盖。未使用真实在线模型。

### 7.3 证据完整性

- `角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/sha256.txt` 304 条，覆盖 `rerun-final/` 158 条并含 I9 记录自身（`9cec7330…`）；文件 SHA-256 `0fd0ab69…`。
- 各实施角色记录：项目管理（B0、B1–B4 keys、两份 key supplement、B4 metadata、allowlist 收紧）、桌面UI（B0、B1/B2、B4）、桌面窗口（B0、B3、B4）、测试（B4 consumers、I9 集成）均在各自 `docs/change/`，含证据目录；这些是管理记录，不是产品候选。

---

## 八、残余风险与已知边界

1. **既有 Windows symlink EPERM**：test-domain `g4-skill-verify` 与 `test/编排` 各 1 项，历史基线同类失败；不计新增，但终验仍为 exit 1。
2. **桌面/e2e 时序偶发**：`main.mjs` 的 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 4 次中 1 次；桌面应用「可重入门禁」全量首轮 1 次（隔离/复跑通过）。均已隔离分类，非 i18n 回归，但属桌面窗口 owner 的测试稳定性残余。
3. **面板打开时切语言不自动刷新**：语言区与渲染层自组文案立即切换；主进程已加载的设置字段 `label/help/choices` 保持切换前语言，关闭重开设置后才按新 locale 生成。上一轮 I9 观察，未在最终候选重测；「立即生效」是否覆盖已打开面板交验收判断。
4. **未验证边界**：真实在线模型会话、非 Windows、打包应用、多窗口联动（单窗口，N/A per 团队计划 §9.24）；T2 不做全量回归（N/A 有理由）。
5. **共享文件混有他变更上下文**：`interface.ts`、`governance-advance.ts`、`interface.test.ts`、`e2e/main.mjs`、`operator-wiring.test.ts` 的整文件字节包含目录 v3/治理 hunk；本包只对 i18n 面负责，验收不得用本结论为目录 v3/治理背书。
6. **未提交/未推送/未合并/未发布**：候选只在工作区；验收通过也不授权提交，除非客户另行授权。
7. **`test/桌面应用/boundary-refresh.test.ts` 已确认并补入候选**：初版变更包按任务指令误将其列为目录 v3/治理上下文；实测工作区 diff 仅含 i18n B3 断言（`main.session.rebuiltSkills/rebuiltBoundary` key），无目录 v3/治理 hunk，故已补入 §3.3 #28。其测试包含在桌面应用 558/558 串行运行中；P7/P10 引用该日志与候选哈希。
8. **计划内真实 Electron 常驻冒烟脚本未落盘**：团队计划 §4.3 提到 `test/桌面UI/i18n-electron-smoke.mjs`；实际仓库未新增该文件，I9 的真实 Electron 切换/布局证据由桌面UI B4 证据目录的 `layout-200pct-electron-smoke.mjs` 与测试证据目录的临时 `i18n-cdp.mjs` 产出（`rerun-final/` 内为原始日志/报告/截图）。P6/P2 的真实 UI 证据存在，但脚本不是常驻交付物；验收按原始证据核对。
9. **`app/renderer/dist/` 非候选**：200% 冒烟与 `main.mjs` 使用真实 dist；I9 以临时 outDir 证明 `build==dist`，未覆盖 dist。若验收复算 dist，需按构建产物处理，不列入候选哈希。
10. **文档状态漂移**（不改变候选）：见 §九。团队计划正文冻结，状态行仍写「闸门 2 未确认/实施授权未给」；方案文件头仍写「草案 v1/闸门 1 待确认」；沟通记录现行哈希与标准 §1.4 记录的快照不同。判定以沟通确认记录与冻结内容为准。

---

## 九、排除/待澄清（不硬塞、不冒充）

### 9.1 明确不列入 i18n 候选（其他变更/上下文）

| 路径/范围 | 原因 |
| --- | --- |
| `src/model/runtime.ts`、`test/runtime-core/governance-flow-metadata.test.ts` | 目录 v3（运行时核心）候选 |
| `src/pipeline/orchestration/**`、`src/common/编排/team-plan.ts`、`flow-service.ts`、`directory-conformance.ts`、`src/common/门禁引擎/governance-roles.ts` | 目录 v3 / 治理写卡候选 |
| `test/编排/**`、`test/门禁引擎/**` | 目录 v3 候选 |
| `test/测试/governance-e2e-auto/**`、`test/测试/directory-layout.test.ts`、`test/测试/redispatch-target-recompute.ts` | 目录 v3 / 治理写卡候选 |
| `test/桌面应用/acceptance-dispatch.test.ts` | 治理写卡候选；diff 中 i18n 关键字命中 **0**，不属 i18n |
| `app/desktop/pi-config.ts`、`test/桌面应用/dispatch-delivery.test.ts`、`composer-images.test.ts`、`operator-channel.test.ts` | 团队计划中的条件文件，工作区未变化，不在候选表 |
| `package.json`、`vite.config.ts`、`tsconfig.json`、`app/renderer/tsconfig.json`、`app/renderer/index.html` | 本变更未改（无新依赖、无构建配置变更、静态 lang 保留默认） |
| `src/index.ts`、`src/interface/cli/**` | CLI 本轮不纳入（方案 Q3 A），零改动 |
| `角色卡/**/boundary.md`/`boundary.yaml`/`changelog.md`、`角色卡/**/docs/change/**`、`docs/communication|planning|scheduling|acceptance/**`（本包与 memo 除外） | 管理记录/治理记录/证据，不是产品候选 |
| `demos/`、`.claude/` | 塔防 demo 与本地配置，非本变更 |
| `app/renderer/dist/` | 被忽略构建产物，非候选 |

### 9.2 待澄清项

1. **`test/桌面应用/boundary-refresh.test.ts` 已确认并补入（2026-10-23 统筹更正）**：初版变更包按任务指令将其列为目录 v3/治理上下文并排除；实测工作区 diff 为 4+/3−，全部是 i18n B3（`session.ts` 文案改 `mainT("main.session.rebuiltSkills"...)`/`"main.session.rebuiltBoundary"` 后的断言更新），无目录 v3/治理 hunk，且该文件在权威 `boundary.md` Section 1（第 21 行）覆盖。现已加入 §3.3 #28（blob `e78e2e05…`，SHA-256 `d08988c9…`），候选数 97→98；其测试在桌面应用 558/558 串行运行中通过，P7/P10 使用 `rerun-final/desktop-app-serial-run2.log`。
2. **`test/桌面应用/operator-wiring.test.ts`**：含 i18n B3 en-US 用例 + 一处目录 v3 `teamPlanSchema: 2` 显式传参；本包已列入候选并标注混合，验收只对 i18n 面判定。
3. **`i18n-electron-smoke.mjs` 未落盘**：见 §八.8；不以此为由判 P6 无证据，但也不把临时脚本说成常驻交付物。
4. **沟通记录哈希漂移**：验收标准 §1.4 记录的意图记录 SHA-256 为 `f3098298…`（写标准时快照）；现行记录为 `7e1cf8db…`，原因是其后追加了闸门 2 确认、实施授权与目录授权验收结果。授权事实以现行记录为准，标准本身未被改写。
5. **团队计划状态行漂移**：正文冻结（哈希与闸门 2 确认一致），但文件头/§二仍写「闸门 2 未确认、实施授权未给」。按任务要求不改正文；本包 §一/§五 按沟通记录如实记录为已确认/已授权。
6. **方案文件头状态漂移**：仍写「草案 v1（待闸门 1 方案确认）」；客户已确认 v1 内容（沟通记录）且哈希一致。实施角色按方案正文符号名与实际代码为准。
7. **其余未入候选的 changed `test/桌面应用/*.test.ts` 与 `test/测试/**` 漏项扫描（2026-10-23）**：扫描范围——`test/桌面应用/` changed 测试（acceptance-dispatch、boundary-refresh、interface、multi-runtime、operator-wiring、pi-config、session）与 `test/测试/` changed/新增文件（existing-project-compat-verify/b-establish、g5-reasoning-verify/f-settings、t29、turn-watch-verify/c-cross-runtime-settings、governance-e2e-auto 7 文件、directory-layout、redispatch-target-recompute、i18n-integration）。结果：`boundary-refresh` 是唯一 i18n-only 未入候选文件，已补入；`acceptance-dispatch` 的 i18n 关键字命中为 0（治理写卡）；`governance-e2e-auto/*`、`directory-layout`、`redispatch-target-recompute` 的 diff/内容均无 i18n 命中且含目录 v3/治理改动，保持排除；其余已在 §3.3/§3.4 候选。**i18n-only 漏项 0。**

---

## 十、候选复算命令

```bash
cd C:/Users/51054/Desktop/work/ans-studio
git rev-parse HEAD                      # ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1
git diff --cached --name-only           # 应为空
git status --short                      # 工作树未提交；写盘后 201 条（含本包自身）

# 对 §三 的 98 个路径逐个复算（示例：可把表格路径放进文件后循环）
git hash-object -- "src/common/shared/i18n/index.ts"
sha256sum -- "src/common/shared/i18n/index.ts"
# ... 其余路径同法；新增文件同样可算

# 稳定性：两次输出应逐行一致
# 生成前整体快照（98 行）SHA-256：
#   d8373e32e4b4a5fa27694abb62904b06ae87a4df74b1114de81e472d39e3c0a5
```

验收时请按 §三 逐路径复算，并核对工作区内容未变；§3.5 登记文档与角色 `docs/change/**` 证据不作为产品候选哈希。本变更包不授权提交、推送、合并、发布。
