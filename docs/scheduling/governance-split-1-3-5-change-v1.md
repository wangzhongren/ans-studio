---
flowId: governance-split-1-3-5
version: 1
riskTier: T3
candidate: 743f41fe07eb172624dd4353dc1e51bb8042cb0f
candidateSha256: 2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503
head: c3693ecdcb78bd83def351c0f2967571dad7174c
status: pending-acceptance
---

# 变更包：governance-split-1-3-5

- **任务 ID**：`2026-10-22-governance-split-1-3-5`
- **产品 flowId**：`governance-split-1-3-5`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-10-22
- **风险档位**：**T3（治理/权限变更）**
- **状态**：**变更包已组装，交内置独立验收判定；尚未验收、未宣布通过**
- **验收基线**：客户闸门 1 确认的策划方案 v1（`docs/planning/2026-10-22_design_governance-split-1-3-5.md`）+ 闸门 0 意图记录
- **验收标准**：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（`git hash-object` = `85f50a7bd26097e43d10400ef5cbcc579be22166`；SHA-256 = `e97eadec8ca41205c515b3ae559259e9de006c93b17a7f4ad898752c65346259`；沟通已确认）

## 一、候选与范围

### 1.1 候选身份

| 项 | 值 |
| --- | --- |
| HEAD | `c3693ecdcb78bd83def351c0f2967571dad7174c`（前后一致，未提交） |
| 候选清单 | `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/candidate/hashes.tsv` |
| 候选清单哈希 | `git hash-object` = `743f41fe07eb172624dd4353dc1e51bb8042cb0f`；SHA-256 = `2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503` |
| 候选文件数 | **53** 个产品/测试文件（清单逐文件 `git hash-object` + `sha256sum`，2026-10-22 复核全部与工作树一致） |
| 暂存状态 | `git diff --cached --name-only` 为空；未暂存、未提交、未推送 |
| 候选范围 | 阶段 B（Model/Provider）、阶段 C（门禁引擎/编排）、阶段 D（桌面窗口/桌面UI）、阶段 E（测试终验/real-entry 更新/canonical e2e）的全部产品/测试改动 |

**候选口径**：产品/测试候选以 53 个文件的哈希为准。`角色卡/*` 下的 api-spec/memo/change 记录、`docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/` 是管理/证据记录，不混入产品候选；`app/renderer/dist/` 被 `.gitignore` 忽略，不是候选路径。

### 1.2 改动分组

| 组 | 文件数 | 说明 |
| --- | --- | --- |
| Model / Provider（运行时核心） | 4 | `src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts`、`test/runtime-core/governance-flow-metadata.test.ts` |
| 门禁引擎 | 4 | `src/common/门禁引擎/governance-roles.ts` + 3 个 `test/门禁引擎/` 测试 |
| 编排 | 18 | 11 个产品文件（`src/common/编排/**`、`src/pipeline/orchestration/{run-role,govern-session}.ts`）+ 7 个 `test/编排/` 测试 |
| 桌面窗口 | 8 | `app/desktop/{customer-input,governance-advance,interface}.ts` + 5 个 `test/桌面应用/` 既有精确测试（含 dispatch-delivery 补充修复） |
| 桌面UI | 4 | `app/renderer/src/chat/{governance-view,role-view}.ts` + 2 个 `test/桌面UI/` 测试 |
| 测试（终验） | 15 | `test/测试/**`：real-entry、canonical e2e/负例/fixture、phase-e demo |
| **合计** | **53** | 完整逐文件哈希见附录 |

### 1.3 主要行为变化（概括）

- **第 1 项**：Convener 写团队计划（`docs/scheduling/<flowId>-team-vN.md`）并发起 appointment 卡；Crew 只读团队计划、按任命名单写卡；应用在 appointment 决定后派 Crew（运行期+账本双重去重、重启恢复），写卡结构校验通过后才派 Convener 做 `role-readiness`；写权：Convener +`docs/scheduling/`、Crew −`docs/nominations/`、Verifier +`docs/acceptance/`。
- **第 5 项**：Crew 写卡补齐能力/职责/必读/交接/原则/质量/工作流/交付物；`validateAppointmentArtifacts` 结构硬校验 + Convener readiness 语义复核；计划缺细节报告 Convener。
- **第 3 项**：Verifier 实施前写 `docs/acceptance/<flowId>-criteria-v1.md`；实施后先核对 T0–T3、复用同候选证据、只补缺失/失效/高风险；变更包标 `riskTier`；报告首行五项、报告档位不得低于变更包；O2 派发前标准门槛。
- **非目标**：第 2 项客户入口、第 4 项派发权、角色 id/显示名/路径、工程基线文本、历史 nomination/flow/角色卡均未改。

## 二、任务节点

| 节点 | 内容 | 状态 |
| --- | --- | --- |
| N1 | 闸门 2 + 客户实施授权 | 已完成（2026-10-22，`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`） |
| N2 | 实施前验收标准 | 已完成（路径/哈希见上；沟通确认） |
| N3 | 阶段 A 基线回归 | 已完成（基线记录与证据见 §三） |
| N4 | 阶段 B Model/Provider 契约 | 已完成（`implemented-unverified`；候选哈希 §附录） |
| N5 | 阶段 C 门禁引擎 | 已完成（`implemented-unverified`） |
| N6 | 阶段 C 编排 | 已完成（`implemented-unverified`） |
| N7 | 阶段 D 桌面窗口（含 dispatch-delivery 补充修复） | 已完成（`implemented-unverified`；补充修复 52/52） |
| N8 | 阶段 D 桌面UI | 已完成（`implemented-unverified`） |
| N9 | 阶段 E 测试终验 + T3 全量回归 + 真实启动/演示 + canonical e2e | 已完成（`verified-by-tests-only`，不宣布验收通过） |
| N10 | 变更包 + 独立验收判定 | 本文件为变更包；验收**待判定** |
| N11 | 放行/沟通回报 | 未开始（待 N10） |

## 三、证据链接

### 3.1 闸门与标准

- 闸门 0/1/2 与实施授权：`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`。
- 团队计划与逐阶段记录：`docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`（§11.1–§11.12）。
- 验收标准：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（哈希见上）。

### 3.2 阶段 A 基线

- 基线记录：`角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-baseline.md`。
- 原始证据：`角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-baseline-evidence/`。
- 结果：HEAD `c3693ec...`；typecheck 0、typecheck:renderer 0；全量 run1 3416/3386/12/18、run2 3416/3388/10/18；确定性既有失败 10（9 个 Windows symlink EPERM + `real-entry.test.ts:38` 因 `docs/scheduling/` 存在）；偶发 2（仅 run1）。

### 3.3 各阶段实现证据

- 阶段 B：`角色卡/运行时核心/docs/change/2026-10-22_change_governance-split-1-3-5-model-provider.md`。
- 阶段 C 门禁引擎：`角色卡/门禁引擎/docs/change/2026-10-22_change_governance-split-1-3-5-roles.md`。
- 阶段 C 编排：`角色卡/编排/docs/change/2026-10-22_change_governance-split-1-3-5-flow.md`。
- 阶段 D 桌面窗口：`角色卡/桌面窗口/docs/change/2026-10-22_change_governance-split-1-3-5-desktop.md`。
- 阶段 D 桌面UI：`角色卡/桌面UI/docs/change/2026-10-22_change_governance-split-1-3-5-ui-copy.md`。
- 阶段 D 补充修复：`test/桌面应用/dispatch-delivery.test.ts`（hash `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232`；52/52；§11.11）。
- 阶段 E 报告：`角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-phase-e.md`（`verified-by-tests-only`）。
- 阶段 E 原始证据：`角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/`（全量/套件/typecheck/build/真实启动/演示/候选哈希，约 5.4 MB）。

### 3.4 T3 全量回归（当前候选）

| 运行 | 命令 | 结果 | 失败分类 |
| --- | --- | --- | --- |
| 测试角色 run1 | `node --test "test/**/*.test.ts"` | tests 3448 / pass 3421 / fail 9 / skipped 18（exit 1，约 22.6s） | 9 项全部为阶段 A 既有 Windows symlink EPERM；零新增红 |
| 测试角色 run2 | 同上 | 3448 / 3421 / 9 / 18（exit 1，约 23.0s） | 同上 |
| 统筹复核 run1（并行） | 同上 | 3448 / 3420 / 10 / 18（exit 1） | 9 项既有 EPERM + 1 项并发偶发：`test/桌面应用/interface.test.ts`「任命→Crew 写卡主路径…」（隔离/整文件复跑 1/1、79/79 通过） |
| 统筹复核 run2（并行） | 同上 | 3448 / 3419 / 11 / 18（exit 1） | 9 项既有 EPERM + 2 项并发偶发：上述用例 + `test/桌面应用/acceptance-dispatch.test.ts`「2026-10-20 verifier settle…」（隔离复跑 25/25 通过） |
| 统筹复核（串行） | `node --test --test-concurrency=1 "test/**/*.test.ts"` | **3448 / 3421 / 9 / 18（exit 1，约 295s）** | **9 项全部为阶段 A 既有 Windows symlink EPERM；零新增红** |

- **9 项既有 EPERM 逐条指名**：`test/claude-adapter/session.test.ts:637`；`test/codex-adapter/session.test.ts:351`；`test/pi-adapter/injected-runtime.test.ts:185、193`；`test/runtime-core/file-write-safety.test.ts:97`；`test/runtime-core/session-store.test.ts:46、58`；`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`（symlink 调用在 :197）；`test/编排/shell-authorized-routine.test.ts:103`。
- **零新增红的口径**：串行全量与测试角色两次并行全量均为 9 项既有 EPERM；统筹两次并行全量出现 2 个桌面测试的并发偶发（隔离/串行均通过），已如实记录，不作为基线红，也不作为产品缺陷。阶段 E 其余命令：`npm run typecheck` exit 0、`npm run typecheck:renderer` exit 0、`npm run build:renderer` exit 0（dist 已忽略）。
- **残余观察**：一次全量在未修改的 `test/pi-adapter/write-sequencing.test.ts` 挂起 >10 min，终止后同一命令重跑 22.6s 正常；如实登记为环境/并发观察项。

### 3.5 canonical e2e/跨角色

- `test/测试/governance-e2e-auto` 68/68、`governance-trio-verify` 22/22、`governance-judge-cards-verify` 36/36、`governance-liaison-verify` 28/28，共 **154/154 exit 0**。
- 覆盖：提案接受→Convener 团队计划+appointment→Crew 写卡→readiness→实施→标准/变更包→Verifier→acceptance；负例：客户取消/拒绝不派、团队计划缺失/flowId 不符/推荐集空/含内置角色/选项不一致/角色行缺项、Crew 未写卡不派 Convener、缺标准拒绝派发、证据不足、报告首行缺五项、报告档位低于变更包（降档被拒，升档可批）。
- `real-entry.test.ts`：改为运行前后递归快照 `docs/scheduling/`（逐文件 SHA-256），断言演示不新增记录、不改写既有管理记录，并加空集反向守卫；单文件 16/16 exit 0；原基线红消失（确定性红 10→9）。

### 3.6 真实启动/演示

- 既有真实 Electron 总自检：`test/桌面应用/e2e/main.mjs` → exit 0，`E2E_PASS=true`、`E2E_DONE=1`，17 张截图；证据 `.../phase-e-evidence/electron-e2e/`（含 `report.txt`、`stdout.log`）。
- 治理链路演示：`test/测试/phase-e-governance-demo.mjs` → `DEMO_PASS=true`；真实 Electron 窗口 + 真实 preload/renderer/DesktopInterface/账本/客户通道（仅模型为脚本桩）；`DEMO_DECISIONS=proposal-accept,appointment,appointment-write,acceptance`、`DEMO_IMPL_DISPATCH=true`；7 张关键截图（appointment/Crew 写卡/readiness/acceptance 等）；证据 `.../phase-e-evidence/governance-demo/`。
- 限制如实记录：离线无真实凭据时产品自动验收派发按设计不启动；演示以真实 Verifier 会话显式驱动，门禁/judge/账本仍是产品代码。

## 四、档位依据

- 本变更改变内置治理角色职责/写权、appointment 卡发起人、流程步骤归属、验收标准/档位/证据来源，属**治理/权限变更**；依据技能 `references/testing.md`，治理或权限变更永远是 **T3**，即使部分改动只涉及文档/角色卡文本也不能压成 T0。
- 已执行适用 T3 全量回归（§3.4）、layer/契约测试、canonical e2e、真实启动/演示；未以「只改文案」压档。

## 五、复用证据与失效说明

- **阶段 A 基线**只用于失败分类（既有 EPERM/既有偶发），不是候选通过证据。
- **阶段 B/C/D layer 证据**对当前候选有效：候选文件哈希与各阶段报告一致（目录/测试命令同源）；阶段 D 补充修复后仅 `test/桌面应用/dispatch-delivery.test.ts` 变化，其 52/52 已重跑，其余阶段 D 四个精确测试 198/198 未受该文件变化影响（测试文件本身不改变产品候选）；阶段 E 已对最终候选重跑全量与 canonical e2e。
- **阶段 E 全量/真实启动/演示**是当前候选的最新证据；候选任何文件再变化（含测试文件）都会使受影响证据失效，需重跑对应检查。
- 验收可复用测试角色两次并行全量、统筹串行全量、隔离复跑与 canonical e2e 证据；不需要为了「验收」全量重跑，但应按标准核对候选与证据匹配。

## 六、已知问题与未决事项

1. **并行全量下的桌面测试偶发**：`test/桌面应用/interface.test.ts`「任命→Crew 写卡主路径…」与 `test/桌面应用/acceptance-dispatch.test.ts`「verifier settle…」只在全量并行负载下偶发失败，隔离/整文件/串行均通过；不是产品缺陷，但属并发敏感的测试稳定性问题。验收可按标准判断是否要求桌面窗口进一步稳定测试；本轮未越界修改它们。
2. **pi-adapter 瞬时挂起**：一次全量在 `test/pi-adapter/write-sequencing.test.ts` 挂起 >10 min，重跑正常；记为环境/并发观察项，非候选红。
3. **9 项既有 Windows symlink EPERM**：环境无创建符号链接权限；逐条见 §3.4，非本次新增。
4. **真实模型/凭据/网络**：未跑真实 Pi/Claude/Codex 在线模型；真实启动/演示用 Electron + 脚本桩模型，门禁/judge/账本为产品代码。工程基线要求的「真实启动应用并演示」已满足；在线模型不属于本任务验收面。
5. **验收待判定**：本变更包不构成通过结论；独立验收按标准与证据判断 pass / rework / insufficient evidence。

## 七、附：候选文件哈希表（53 个产品/测试文件）

> 2026-10-22 复核：逐行 `git hash-object` 与工作树一致（mismatches=0）。`sha256` 为工作区内容；CRLF/LF 表示差异按同表示对照，不互相误判。

| 路径 | git hash-object | sha256 |
| --- | --- | --- |
| `app/desktop/customer-input.ts` | `98ed6fc3bdae3a4f252478fd2b0755cbcd2225d5` | `91604cf07178ac68378439d77eefe4e80058e7fb25fb4c0ad9fd831cc00967b3` |
| `app/desktop/governance-advance.ts` | `39f8d391f962f7e58edbfd757f02278dc0cdaa7d` | `64680dabc69b1b9e42b68411fcc1f85b4120a6b2dadfbca97a738b5256313319` |
| `app/desktop/interface.ts` | `2f0282d827ed6a76b42021a7fd52757d891838b9` | `d3992ab9b74d571ac834630b506784c2853ba75ed27031f364ed428fa8782512` |
| `app/renderer/src/chat/governance-view.ts` | `f72188bd8737c6056727062f3b3487a9960d2f62` | `4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48` |
| `app/renderer/src/chat/role-view.ts` | `a3ad631cf0e9d76b40598effd8270f5c8fabe766` | `268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b` |
| `src/common/编排/flow-service.ts` | `2679703027850c948772fd59f93cc1ed171d08d1` | `828d0c9cbc8800631d20af7e976748c98d31999ecc551ec659978ea8ad31d5e4` |
| `src/common/编排/flow-state.ts` | `02ee95429e00c4c9f98534bfa21e950c40523013` | `baeb2e4a7ab4d2842db63d918433dc6ca4d649249f8f41ed3f54a3f7a0dc28bd` |
| `src/common/编排/governance-gate.ts` | `d932a6e5b3fe4e1e0193a26bb5a764c7c1b1a40e` | `5cc9d25ae87c1f92081bf64b7f3214e56fdaa27b3d49ff8dadfd4d093c22a820` |
| `src/common/编排/governance-judge-evidence.ts` | `803dc791271a31278ccf333eac31124551eefa2a` | `aedffe9cc67dc487d4777dad0d4d867e69ca1aaf4f73e4b583559457196f15d9` |
| `src/common/编排/governance-judge-facts.ts` | `66cd2ad15c78392a27a02047c06d19f56d25fc67` | `b921bf3a1b0dce76c4269db9419657e7550f2ca58147aa61e55c5ced1fb482ac` |
| `src/common/编排/governance-judge-prompt.ts` | `e6eb723424045ab00add38241fa94a10e9597042` | `e97597f0098693477899bd522a4a15f87c5fed6af2c3657fbefb8df63ada71cf` |
| `src/common/编排/governance-judge-verdict.ts` | `ed14a98d9800df5debf6bb6f8aa49b204a8dfca6` | `0228962b7ea131f05e900cbcd3db5295bfde298449c91e70ecd707686d4570f7` |
| `src/common/编排/governance-judge.ts` | `a0d315e60579dbcd11e21ec72e816eecaecda7d8` | `e398ada20751cf087c685574fd3c27a97c54aae0521d00fc7bfaa03dec768e93` |
| `src/common/编排/governance-ledger.ts` | `c29a78ae763769f9e204c7dc59a5eb2667df8b61` | `5fd7750c94db65fdc8a10b7155ffa4aec6fa3a99919c3d7a7bd4cb18e225c96b` |
| `src/common/门禁引擎/governance-roles.ts` | `4573b5cc2da48f79e5abd3ed5e76503ac120a471` | `d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f` |
| `src/model/runtime.ts` | `120db534d7952f3320d34f21afe222067b2b744c` | `d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9` |
| `src/pipeline/orchestration/govern-session.ts` | `c6723b8c9d9da14ea554b4ed081936ab6edc32fa` | `103dff0c1e555963e8ac7217da7adc06fac0f8764308989bdccdac0c33c56eb1` |
| `src/pipeline/orchestration/run-role.ts` | `e77e9ffd34304a4f0c47708f15223dea5544bd6e` | `55f11d2dca9696cd5036e67e9748f4789ae1fb04bca7fc6aa30eb0ecd64a86db` |
| `src/provider/runtime/schema.ts` | `cefd13ea40700fc8d5f5f6b37f4aa63b79fb52ab` | `4c3c7a710f5d6a3995440ad7fe68a677110d3850cbc3282647bb28fe396d24c3` |
| `src/provider/runtime/tools.ts` | `2023e9f08be24c577f8c1adc91fc8f5d8792271b` | `c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `becc8b899cae085fe0ccc8acbca82b5646bfbb43` | `ce2d018f4449398e27ac0184faf5b13be3138655b2bb5fc86885941e6495077b` |
| `test/桌面UI/governance-view.test.ts` | `38634fec1a4db39d07534752517e8395d2e489ba` | `1dc1a82e4db1b268f46095398dcf07664a3c47d048a02774e93c249afdf0aac6` |
| `test/桌面UI/role-view.test.ts` | `7cbccd4a00fca9cc55d42c5badd9e15c95999f72` | `6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `0b4a1ca63425cf6fdec3323d53add34a5234ea10` | `c87341ec7c76864c86d0be88b618c7e16d370df09041e19ab0fa3b34a9eb1149` |
| `test/桌面应用/dispatch-delivery.test.ts` | `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232` | `c3117b2586dc71939f338dae6fee30a08f0c89c255c0512587d1f1616a02554a` |
| `test/桌面应用/interface.test.ts` | `0244d9da29b5c799df56ed841149595636e4a25b` | `ea4425786e809055e2faab6e0e51986777396d599cf1c9099a77d7ea17a0dae1` |
| `test/桌面应用/operator-wiring.test.ts` | `ac8e5dbd7f30dc978e8fdd09978fa485a382b226` | `937274166c4ff45904c97bae8ff5cfa8aacfcefff42825254b97a067990c3c34` |
| `test/桌面应用/session.test.ts` | `19ce26b0819aaeb10f4e59f308fecd9f9db53f2e` | `05f2c6015d58bee2f34d40a8de2afad35fc0b303d48c103862e1bf9b7c6c187d` |
| `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | `fac7232bedffe6b5deabf00791f288cc1283bbb9` | `47caabcf0435d19c2c568c7ad72800147f9ec222cf10666ca8a3aeae60efc4b6` |
| `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` | `b8ca13891c37c639fb88aa63a8c939c8912752a7` | `dd1239edc9f2a053c56a9dafbc20e1273f65eaea8e064a84d2864d9f54327fa1` |
| `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts` | `83200081391dc97bd03230ab2df0b93eb3522234` | `3e7273a62c541aae35d1e065f7434c3be4a8fde26604fb25ffe2bef33173a762` |
| `test/测试/governance-e2e-auto/f-acceptance-gate.test.ts` | `b8ebde757d9ceb5483146114cc7e1d6f3fdba76c` | `97af55e68337b468eb180db23c6e90f6adaef54aa013c7a65c677a54988e7e3a` |
| `test/测试/governance-e2e-auto/fixture.ts` | `2683fe29f7da60c09dd810391c6c621d813b46aa` | `87f8c3a98d8cc8786abce8ebc7ad751a15fc6760960a0568240310297efb3ace` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `908bedcdabddb207652104905dcf4c3720b87c4e` | `de1d132322cfc3a42a5219c729504d0586027291ec7b39e5dc333eb6e55a06de` |
| `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | `3675e3e3957e3e83f74f810d0d4dd3ffac2f68cb` | `78e526b2f2caf2bcbd40255f2444c8e26da47fe44e37e44e3d17a03cd8eefc3a` |
| `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts` | `a584c737c0818cb998eedb1b9cd39e0251b7658d` | `6dddb7d714226a7269aa510cf1865dfd7238700c45e36f4af5c99a92107a96a6` |
| `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts` | `66b2e9928d2a4d5ae65c3466c2cf7d94a882bf87` | `fd71ce11b49e86fe324580e8b18a16092361d0e7d1b2bc255da5a0d476c88474` |
| `test/测试/governance-judge-cards-verify/e-queue-once.test.ts` | `e225a367b08cfa17db9e4c4a2a7c268698cc7de6` | `be3bca279a55d384ed37466cecd7880680e6bf26a8432cd4e6aed541fc92ec7c` |
| `test/测试/governance-judge-cards-verify/fixture.ts` | `10c147deea3dbdfd459bfab1a8ebed41028709e3` | `e984f7b95e3bdb3ec9ba6b636536055194af669d1d6fedd7a9d1ceea82f3bc94` |
| `test/测试/governance-liaison-verify/e-audit.test.ts` | `032372f19afe30e02ef757a4746b958287f36c03` | `e5a1609c9031c5599b8de262569b9a9256fd329ebd14012d24120839dd2dc82b` |
| `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts` | `0127c1c90d4d6981827057845015e001256ab3ee` | `3c947c0aedb4716f9f323c883d6a62da0e874d18e8a7ebdfa44a50eee82da931` |
| `test/测试/phase-e-governance-demo.mjs` | `b6c9ffbbc6f0f1d70ba2116339fa40a416baa5dd` | `5d37b2d8fba0311df73b8b0b8f32256a6a03aa36152e3cafb1da545bd9cd7057` |
| `test/测试/real-entry.test.ts` | `d331de90dbfe37f8c2236760466920d4700308dd` | `5e858496d436b8c9e620a3ffed1d0e674d09e6dc60be875fb9cb523d94507884` |
| `test/编排/decision-evidence-packet.test.ts` | `3c6b189d95f97dac5e7330d45095b53633780bb5` | `06a085e279c1fcee0da9d667fab7814c3a9e49337e53e437fcdddc0f4589f250` |
| `test/编排/decision-intent-drift.test.ts` | `e620aa957e6b016bdab602daf81a4e50b9f2ed3b` | `0132c780a6adb86219d6ec0f7e758cee03b133fba8097c8aaaa97f648934cd4e` |
| `test/编排/flow-service.test.ts` | `0c5353087f498641003f6bcb65b3e4ebdc968716` | `5496b31f51dffd09742ce3700e13eb15085c4a27e76771447f951e6aeb941772` |
| `test/编排/flow-state.test.ts` | `b4f3965ceee4a1a68e5daf359f50d03ddf2b5a03` | `7d4320c02d1d1101243921065ca9dbd7dc8c1e0af4e20c1906a323bfe3da9a04` |
| `test/编排/governance-gate.test.ts` | `edec4821982a0fa437f736a9bf25e39caa64213a` | `81e191d8730eaad684b56d9e492e1c8a29c9a8248a0a77907d31835dca996c09` |
| `test/编排/governance-judge.test.ts` | `97d320f4d0ecdee5bcceab6f574a81543f589453` | `c5c4a2651ad89e2ed514ffb279f27d93e46c408cb13bc16823fed57d1f201457` |
| `test/编排/governance-session.test.ts` | `37c5398468a6cb6b57e416fc3e7fdd9d7319ea1d` | `b02436e4eef8b3724042fb19c5f330e63d164044b56c966f0aa277c37488da16` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `813b46939417c93c52d02e982e5a5a219a06d884` | `0b0ec21366b587d038d5b1f3b8af8559943b24a489d5a2fdf5632cfa88d15b02` |
| `test/门禁引擎/governance-trio.test.ts` | `daaa9f4f7e01a499b4929a5b3470688d28bb2f08` | `880e9442f2fc76c9ea64e56d8022fd68e26ce24c4db9f11be0bd8d0e14acb09e` |
| `test/门禁引擎/liaison-role.test.ts` | `7721c99f7de3d15ff38a248b6f1d1f6f0f7ea353` | `bdf24561cd87061b61cb7793f57044cf2c074989b5501d9076062156c43a38b8` |

## 八、验收请求

- 请内置独立验收按 `docs/acceptance/governance-split-1-3-5-criteria-v1.md` 与本变更包判定当前候选：**通过 / 返工 / 证据不足**。
- 本变更包不构成客户批准、测试通过或验收通过；验收结论只对其判定的候选有效。
- 通过不授权提交、推送、合并、发布或任何对外操作。
