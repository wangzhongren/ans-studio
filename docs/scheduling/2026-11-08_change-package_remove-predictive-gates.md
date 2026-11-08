# 变更包（E3-B）：删除全部预知式门控 + Git 写/仓库初始化改为「动作时授权」

- **任务 ID**：`2026-11-08-remove-predictive-gates`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08
- **性质**：E3 终验变更包，交内置独立验收按 B1 v1 判定 B2；**不是验收结论**；不授权提交/推送/合并/发布（发布/tag 除外未授权）。
- **风险档位**：**T3**（P1.4 §4.3；治理/权限/审批/审计语义 + 删除受保护项目 Git 写门进程级闭包 + 跨运行时核心/编排/trunk/桌面共享契约；不压档）。
- **依据**：
  - 设计 **P1.4**（P1.3 纯文本勘误，语义等价）：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`（822 行 / 124,066 bytes / SHA-256 `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc`；取代 P1.3 803 行 / `94f71fcb…`）。
  - 复核记录：`docs/planning/2026-11-08_review_git-write-init-approval-based.md`（178 行 / `a2468ed0…`；F1–F12/R1–R10/S1–S5 已关闭）。
  - **B1 唯一判据**：`docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / SHA-256 `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c`；冻结、全部条目原先 `未取证`）。
  - 团队计划（闸门 2 对象，冻结）：`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / 66,827 bytes / `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808`）。
  - 派发/状态/I0 记录：`docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`（本包写盘前 104 行 / `5de8a556…`；含 I0-1–I0-12 冻结与各批状态）。
  - **B2 v1 报告**：`docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md`（183 行 / `6af7f394…`；**insufficient evidence 33/0/6/1**；6 项=AC-1/AC-2/AC-4/AC-8/P1.2-AC-25/P1.2-AC-31 完整效果链未构造；无 fail/安全返工）。W7 补证见 §三 D1-R1 与 §十。
  - 闸门 1/2 留痕：`docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`（47 行 / `63a62a34…`）。
  - 客户指令/预授权/B0 豁免：`…2026-11-08_intent_remove-predictive-gates.md`（33 行 / `603e7ef9…`）；`…2026-11-07_preauthorization_proceed-without-gates.md`（38 行 / `e2bdd96b…`）；`…2026-11-08_waiver_baseline_session-admission.md`（18 行 / `d7a699d2…`；协调方确认豁免沿用覆盖本变更，不作正式 B0 重登记）。
  - **回归参考基线**：第一变更 E3 T3 + B2 补证组合 = **4,982 tests / 4,753 pass / 196 fail / 1 cancelled / 32 skip**（E3 `角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`，169 行 / `5cba2d54…`：4,979/4,750/196/1/32；补证 `2026-11-08_B2-gap-integration.md`，89 行 / `54c0db31…`：+3/3 pass）。
  - 第一变更收尾（只读）：PR #73 MERGED（merge commit `bac1f94c…`，2026-11-08T08:48:27Z，协调方通知；本地 HEAD `3f249e2` 为合并前分支尖端、内容相同，无需 fetch）；B2 v2 `docs/acceptance/2026-11-08_session-admission-approval-report-v2.md`（`71b41879…`，pass 35/0/0/6）。

---

## 一、候选身份

- **基线与环境**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`）；暂存 0；Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300（Git Bash）。
- **候选 44 文件（W7 后）**：`git status --porcelain -- src app test` = 44 项（**17 修改 + 27 新增 + 0 删除**；`src/` 8、`app/` 1、`test/` 35）。W7（B2 v1 补证）新增 6 个测试/夹具文件；**原 38 文件逐文件哈希 38/38 不变（产品零改动）**。
- **聚合身份（当前候选，本包写盘前独立复算）**：`787bd9109c6ce13f27eed4dbd396b0dc9a6fce26834b96c7f6c3e37391ff2475`（算法：逐文件 `sha256sum`；行格式 `<raw_sha256>  <path>`（两空格）；`LC_ALL=C` 按整行排序；逐行 `\n` 连接后 SHA-256）。38 子集聚合仍为 `9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`（D1/E3/RR 证据均在该 38 文件候选上取得）。
- **稳定性 manifest（W7 后）**：`src app test` 全量 **1,105 文件 / `4b5ed42fff69013b66c09bff3820ca820512220ec8f5ca18756965d1ebe7a128`**（D1 口径；W7 运行前后 diff 0 行；与 38 文件时 1,099/`bf190ee5…` 的差 = 新增 6 文件）。
- **T1 三文件（基线既有、不属本变更 delta）**：`src/common/claude-adapter/schema.ts`（`afe70c62…`）、`test/claude-adapter/session.test.ts`（`f0db260e…`）、`test/claude-adapter/schema.test.ts`（`358ac967…`）；已于第一变更随基线提交，不计入本变更候选。
- **不进候选**：`docs/`、角色卡证据、未跟踪临时文件；管理文档不入 `src app test` 候选。
- **逐文件候选哈希**（两空格格式，`LC_ALL=C` 排序）：

| 路径 | SHA-256 |
| --- | --- |
| `app/desktop/session.ts` | `0132cd4e935ccd7f5eae05344991b818e072cf090f783d589c5541b13924cae5` |
| `src/model/runtime.ts` | `b4164765c47c8917d8a46e50a07ef28883d7ac6085eb29fc45bcd80cb932ff49` |
| `src/pipeline/orchestration/run-role.ts` | `53459ba43c51ef4c8c9086e7c6bbfa499028de7680c3f4d4acbbc5a93b556db3` |
| `src/pipeline/orchestration/trunk-runtime.ts` | `ce80e1626ba32a3a0e1e4ff10f5ca396d26c49940a837ff6459d1471d5b1d1a9` |
| `src/provider/trunk/impl/git-command.ts` | `47819a1955c64f29662068e2ad4d5aa0a2482d0cb80351753f1832930100d0f0` |
| `src/provider/trunk/public/trunk-store.ts` | `abf08fc80f9c2b22f3ea2ca80306dde4734da4704f0caee969b3b368acbe5397` |
| `src/service/runtime/session.ts` | `51c9a56ec633604c6b8d9beaeda4a1c3b7d66bf69719de836d5807c2668f3cc6` |
| `src/service/trunk/impl/apply-journal.ts` | `5d9b18887617acbfcda897ce31435accb1b22fa7e16438ef34280809b726326f` |
| `test/runtime-core/git-capability-tools.test.ts` | `93bb78c228dffe7ecb0637e53db0133e7540dea8a1cc57414e7def6ffb8e3481` |
| `test/runtime-core/session-lifecycle.test.ts` | `2904f4a932400065141a1768b7ed1f9239f8b7e075fd7c7a089c398207489098` |
| `test/runtime-core/drain-predicate.test.ts`（新增） | `62e73b75efc537bbb0ad35d745da7931a13deb5062939bdca2953886a14e8c7a` |
| `test/runtime-core/codex-native-optional.test.ts`（新增） | `d9d3d75b470f9b3b5549f3c01d9a0f88ae0ad2545bd0d5e14ba0511b0ce42342` |
| `test/编排/trunk-dispatch-parent.test.ts` | `6c252b1ea3bdafca6720677c3039b1d70241c15602375217336d80370f4ce6d3` |
| `test/编排/rapporteur-module-consumption.test.ts` | `1df551448b2f6eb401fa8c2f9998e467fbdc8caf0b814e93b8fea34de0ae8fce` |
| `test/编排/stable-write-runtime.test.ts` | `2f39b4b5d9260d7bd797b9884c24f11c0cf5dcf90aa7fc7cf96145b7556ead98` |
| `test/编排/git-action-authorization-sidecar.test.ts`（新增） | `910f9dc2e6889a768bd9e7d5e4ac01b3dbcbb7c02b47bd626e8c39721cc2ad0b` |
| `test/编排/git-action-authorization-gate.test.ts`（新增） | `33b932a1576a3bc2f5bb9dfe4f68dd4363f2eadd9a7bac9841920f3376b543f8` |
| `test/编排/git-action-authorization-wiring.test.ts`（新增） | `499891bf52a0bb76e42a1abb46404b6a12377b3b2a66b538a1c20b4277197b85` |
| `test/编排/git-action-authorization-wiring-audit-failure.test.ts`（新增） | `a28d6176f21226a3665d3cc0ab0e28de47f2530e38216fab104765e69c9d3792` |
| `test/编排/git-action-authorization-wiring-publication.test.ts`（新增） | `4d6e78f9994db1c7d40dcb3761fca358d9454606931b18f66e653b209ec22af8` |
| `test/编排/git-action-authorization-wiring-publication-audit-failure.test.ts`（新增） | `95fdaf3d5bb77a7306ebfb5d53e4c7cfc2989c20e59eebb6ebc7de6bee20d933` |
| `test/编排/git-action-authorization-wiring-document.test.ts`（新增） | `16f5e9fc1a1baaa2625f9fc251b7020f7c367515edb0f2baf6ac02b5933285f8` |
| `test/编排/git-action-authorization-wiring-document-audit-failure.test.ts`（新增） | `d5ecfaba2465e521184b39259c77be838572ed17bec9e814d53254a83c6febb9` |
| `test/编排/git-action-authorization-wiring-initial-workflow.test.ts`（新增） | `3e335b5f1fe217ec79494a833ede7dbc935edf6a18ded5be0a13994cf9bb4d46` |
| `test/编排/git-action-authorization-wiring-initial-workflow-audit-failure.test.ts`（新增） | `b3972b95e7d429edceb33794bba985325164e6bc04352f73d08fc8cc5756f0f0` |
| `test/编排/git-action-authorization-wiring-retry.test.ts`（新增） | `268e27cdc1cea15fd8efb2cd1d8ec0ae8361683aac643723e6a06358c76be596` |
| `test/编排/fixtures/git-action-authorization-wiring.ts`（新增） | `0f47a9ef2664a818b72a661d07bc689783768faf04e7f03137f7fcc14e7fd49c` |
| `test/编排/git-operation-sidecar-tolerance.test.ts`（新增） | `8416f7a65a7ebb965fc7b906d507a7c0a0d4bb960e31739cedd943b2557f8476` |
| `test/测试/runtime-dispatch-gate-integration.test.ts` | `3abfff69fafdbf663ee8df47372977d055fa90d14652307a8b54690ffc3cf3c8` |
| `test/测试/session-admission-approval-q9-integration.test.ts`（Q16 改写） | `3b3e3448a68d95813b94325f956e0241b3ef65b862e209fe808d2bc463cfa352` |
| `test/测试/git-role-workflows-e2e.test.ts` | `27bbb12f4c573b64c1dff6d7ca8d9376df0d5301a11a2bc0c2ff251f7665efa5` |
| `test/测试/git-action-cross-runtime-init.test.ts`（新增） | `f00e2c6855f1467ac3512cf8481ad69ff7cb0d5c362b14b9ba4a4dbc2621efb0` |
| `test/测试/git-action-cross-runtime-pi-init.test.ts`（新增） | `5f06cff89e6b6c6636dc6d449ec60064e061fc9d7b7f0d48d3fe47beac35c2f8` |
| `test/测试/git-action-cross-runtime-codex-init.test.ts`（新增） | `9e3e21cd6dd2408c10898191ed0e0c08592addeb802848bf77ced0979b52af04` |
| `test/测试/git-action-cross-runtime-audit-failure.test.ts`（新增） | `df498cfd1eccaab8489d401f01d23a2cb50d30da6385ac6d302c57b9e8b1eb53` |
| `test/测试/run-stop-host-continuation-integration.test.ts`（新增） | `dd0fc949b3948fa35c2831dcbbe8b10e9df02de2f46641b65dc3f0cc343a91c1` |
| `test/测试/git-action-cross-runtime-fixture.ts`（新增，夹具） | `4ef13f1c6e3880ed8720e05ba086e84464db8c867db3bc319992be2613ac749d` |
| `test/桌面应用/chief-workflow.test.ts` | `457214b54c9fe0dc0d5ebc354079a7e2fbfb1b5374e33c5866fce44826270866` |
| `test/测试/git-action-commit-claude-e2e.test.ts`（W7 新增） | `d370b95126aa97c14d453be726258ea42f1aade1d7f7eb5218454616ead16335` |
| `test/测试/git-action-commit-pi-e2e.test.ts`（W7 新增） | `79fe9ab0570ab7c50a1aa3d6fa6c8c618a48d838414b38a0b4776c65e59f774c` |
| `test/测试/git-action-delivery-claude-e2e.test.ts`（W7 新增） | `5ae311d2096120dfa25e8937d4b67888d9f7be3eb24691e9fc35e91b712d2868` |
| `test/测试/git-action-activation-e2e.test.ts`（W7 新增） | `be863b4c9e3a6d55f01ada1c291ffbde1b1c7e1db1781e26f210e36ffcc722f1` |
| `test/测试/git-run-stop-host-continuation-e2e.test.ts`（W7 新增） | `908fb651bde3dc74ccae19866f460d943022777daeeb17f3d38cd61ceb890212` |
| `test/测试/git-write-chain-fixture.ts`（W7 新增，夹具） | `b1b43b1e44a26656c4effda341b47d8f5a38d42c6cc5f13162e62e812196dbd4` |

---

## 二、改动面（按 owner；详细见各批证据）

| owner | 改动摘要 | 代表文件 | 证据（路径 / SHA-256） |
| --- | --- | --- | --- |
| 运行时核心 | `isRuntimeSessionDrained` 纯函数 + 显式 reason 白名单（I0-3）；`prepareRole` F5/R9（plan.native 可选投影/`ensureAdapter` 回落/`bindRole` 条件核对）；A9/D6 `official-pure-preparation-unproven` 退役、construction 真实边界；C9 `stopAndInspect` disposed/活动循环 drain；D8 证据保留；R14 再改写 + drain/F5/F7 测试 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/` | `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md` / `b6d4f688e797e756d1875b6a2d4916c5eed1e8a8f538d37d0d26a8d657b53fa5` |
| 编排 | ① `inspectGitActionAuthorization`（H1–H14、B8–B10 删除、expectedActor/expectedTool/mode/hostContinuation、output actor/controls/optionalEvidence）；C1–C4 + host-continuation（F2/R1）；Q8 nativeInstanceId 可选；run-role A10/C7；apply-journal C5 | `src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts`、`src/service/trunk/impl/apply-journal.ts` | `角色卡/编排/docs/change/2026-11-08_W2_remove-predictive-gates.md` / `fa166eede22e43868c9f5b2d5862c2e61b582dbf70a71b843c10b53e083c9cc3` |
| 编排 | ② sidecar 基础设施：`appendGitActionAuthorization`/`readGitActionAuthorizations` + 路径安全/预算/JSONL 容错 + 公共导出（纯加法） | `src/provider/trunk/impl/git-command.ts`、`public/trunk-store.ts` | `角色卡/编排/docs/change/2026-11-08_W3a_git-action-authorization-sidecar.md` / `6a07a92251fe6f952f045deb5026bda9f90dee3640f4a7d8766e6a32983a3833` |
| 编排 | ③ sidecar 调用点接线（5 个结构化 mutation、R2 多 verdict digests、失败⇒`git-action-audit-unavailable`）；init/计划/文档/initial workflow E2E + AC-16 注入；I0-11/I0-12 扫描器容忍 | `trunk-runtime.ts`、`git-command.ts`、`test/编排/` | `角色卡/编排/docs/change/2026-11-08_W3b_remove-predictive-gates.md` / `1547235ee034b42b21f38a23960598f701855c06170346a0044095a9e38326b0` |
| 桌面窗口 | `ownedRunStopMembers` native 可选（absent 允许/present-but-changed 拒绝）；`executeOwnedRunStop` 用 drain；既有测试文件扩展 | `app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts` | `角色卡/桌面窗口/docs/change/2026-11-08_W4_remove-predictive-gates.md` / `210d2066171fbd134879750beeeb58289a632052d1c88383b5e0cc7c050ddb1a` |
| 测试 | W5：Q16 q9 改写、N15 源码断言改写、e2e 评估、跨角色集成 5 文件 8 用例 | `test/测试/` | `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md` / `8d678fff76d69c2cdde6b92aef84bf96a3c95f81317591f4479c0a42cf31458f` |
| Codex 适配器 | **N/A（默认零写入）**：`plan.native` 投影/`ensureAdapter`/`bindRole` 按 R9 归运行时核心；D1/D2/D6 证据语义未改；无适配器文件改动 | — | W1 证据 §F5/R9；I0-7 |
| 测试（W7 补证） | B2 v1 的 6 项缺口：Claude/Pi commit、delivery、activation、deferred run-stop finalize 的确定性完整效果链 E2E + 夹具（真实 service/assemble/Git 能力路径；真实 ref/journal/sidecar） | `test/测试/git-action-*-e2e.test.ts`、`test/测试/git-run-stop-host-continuation-e2e.test.ts`、`test/测试/git-write-chain-fixture.ts` | `角色卡/测试/docs/change/2026-11-08_W7_b2-gap-e2e.md` / `3fe62b905c7f7a746c5ed9235f74c07252d2e7dac0f8cc84d0c3fa121a7e67d3`；D1-R1 增补 / `4e52a01f…` |

---

## 三、D1 确定性验证

- **候选**：38 文件 / 聚合 `9462391e…`；manifest 1,099 / `bf190ee5…`（前后 diff 0）；HEAD/tree/分支/暂存前后不变。
- **受影响套件（276 文件，逐文件独立进程；90s 登记挂起/其余 300s；无 force-exit/timeout）**：合计 2,429 tests / 2,291 pass / 111 fail / 2 cancelled / 25 skip；分套件：
  - `test/runtime-core` 59 文件 535/498/33/0/4 —— 与 W1 基线完全一致（失败 33/33、skip 4/4 diff 0）。
  - `test/编排` 107 文件 1122/1098/22/0/2 —— 与 W2/W3b 基线完全一致（失败 22/22、skip 2/2 diff 0）。
  - `test/测试` 107 文件 682/623/40/1/18 —— 106/107 文件计数与 W5 基线一致；**新增确定性失败 0、新 skip 0**；预期红→绿（q9/N15/跨运行时/host-continuation）全绿。
  - `chief-workflow` + `codex-adapter` 抽检 3 文件 90/72/16/1/1。
- **环境性差异（2 处，隔离复跑分类，非候选回归）**：① `test/测试/git-role-workflows-e2e.test.ts` 全量 300s watchdog；隔离复跑 19/7/0/0/12 自然退出 0（Q2 P2 260.0s，机器性能阈值）；② `chief-workflow` W29 12s 测试超时级联（同候选 W4 基线 5.5–6.7s 通过；全局慢机佐证）——E3 复测均未复现（见 §五）。
- **静态门**：`npm run typecheck` exit 0；渲染/构建 N/A（未触及 `app/renderer/`/`app/main.ts`；候选 `app/` 仅 `app/desktop/session.ts`）。
- **证据**：`角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`（**W7 后 244 行 / `4e52a01fef04a91894cf62119c6c2b71979bdc398cf4d2d6f828aff23e2a4971`**；原 205 行 / `10418f38…`；D1-R1 增补见下）+ `2026-11-08_D1_evidence/`（276+ 原始日志、逐文件 TSV、失败/skip diff、隔离复跑、manifest/聚合快照）。
- **D1-R1（W7 后增补，B2 v1 补证）**：B2 v1 的 6 项 insufficient（AC-1/AC-2/AC-4/AC-8/P1.2-AC-25/P1.2-AC-31）由 W7 以**确定性完整效果链**补证（5 个新测试文件 + 1 夹具，5/5 pass；真实 init/trunk/plan/activation/pin 链 + 真实 `createGitRoleRuntime`/服务/store，读取临时项目根内真实 journal/sidecar/refs 原件；不伪造、不跑真实模型）：AC-1 Claude 桩件 product(`impl`) `git_candidate commit`（sidecar `{candidate}`/`git.json`/candidate ref/对象/写前时序）；AC-2 Pi commit 同构；AC-4 Claude convener `git_publish delivery`（sidecar `{publication}`/`git.json`/delivery ref）；AC-8/P1.2-AC-25 deferred run-stop `prepareRunChange(deferred)→finalizeRunChange(host-continuation)→commitPreparedRunChange`（真实 run transition journal：state=cancelled、receipt=applied、instance drain、hostStops fenced/targetSeq；run-stop 零 sidecar；taskId/记录/requestDigest 负例）；P1.2-AC-31 activation（`executeGitActiveRolePublication`：sidecar `{candidate,publication}`、activation journal、activeRevision=1/activeRoles.impl）。套件：test/测试 **687/629/39/1/18**（+5/+5/0/0/0；107 既有文件逐文件 0 差异）、test/编排 **1122/1098/22/0/2**（不变）、typecheck 0；**新增确定性失败 0、新 skip 0**。新候选 44 文件聚合 `787bd910…`、manifest 1,105/`4b5ed42f…`（38 子集聚合 `9462391e…` 不变）。

---

## 四、RR 真实运行最小验证（真实 Claude）

- **环境**：受保护目标项目（init-source 于 product 会话前 137 ms 落盘 ⇒ `required`）+ 真实 Claude + 真实桌面 UI（仓库外临时根/临时 userData/launcher import 仓库 `app/main.ts`；`.env` 仅应用使用、未读取/打印/复制；治理记录与审计门禁预检按第一变更 RR 方法）。
- **AC-22（达成）**：单条客户消息 → `dispatch_task` 父门 accepted → `task.created` → product `session.open.ready`（`session.open.end ok=false`=0）→ 任务投递 → product 真实回合（`request.attempt.start`）；两次尝试均复现。
- **AC-23（如实下一真实门）**：`write_file docs/product/rr-git-note.md` 成功；`git_query template=branch-list` `status=observed`（真实任务/运行绑定 + `checkGitPolicy`）；`git_candidate{action:commit…}` 在 **Claude MCP schema 层**被拒：`MCP error -32602 invalid_union`，commit 分支 `unrecognized_keys ["__ans_call_context"]`，未到达应用处理器；零效果（无 prepared/journal/sidecar、refs 仅 `refs/heads/master`）。**确定性复现**（真实 describeTool+toClaudeSchema；git_query/write_file 通过）。涉及 `src/provider/claude/session.ts:84`（`CALL_CONTEXT_ARG="__ans_call_context"`）与 `src/provider/runtime/schema.ts:97-101`（顶层 `oneOf` + 分支 `additionalProperties:false`）；**三文件均零候选 delta（git diff HEAD 为空）——基线既有缺陷，不属本变更**；本变更未修复（写集外/scope 外），作为下一真实门如实披露。
- **AC-24（预算/偏差，attempt 2 为准）**：1 条消息 / chief 1 回合 / product 1 回合 / dispatch 应用处理器 1 次 / **应用层 Git 调用 1 次** / 审批卡 0 / 墙钟 ≈39.8 s / 无自动重试；决定性证据后立即停止。偏差如实：attempt 1 fixture `.git/config [user]` 触发既有 `git-config-section-unsupported`（更正后 attempt 2；attempt 1 证据保留不作 AC 事实）；attempt 2 submit_report 后 0.6 s 停止导致报告投递中止（`delivery.failed` dispatch AbortError，`tasks.jsonl` 投递/报告行未落账，报告正文以 SDK 会话原件为准）；导入自动化两次超时后改用有界 SendMessageTimeout 成功。
- **候选稳定性**：38 文件聚合 `9462391e…`、manifest 1,099/`bf190ee5…` 运行前后 diff 0。
- **不宣称**：六角色闭环、发布、Codex/Pi 真实运行、git_candidate 任何动作真机可达应用层、审批卡真机、长期稳定性。
- **证据**：`角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（141 行 / 23,223 bytes / `c40011de85229528f2ec10fa198d06e30f1acbbb0c3cc2a3cd5d30e80da5ecbf`）+ `2026-11-08_RR_evidence/`（85 文件；索引 `af4ec649…`）。

---

## 五、E3-F 全量 T3 终验

- **候选冻结核对**：聚合 `9462391e…`、manifest 1,099/`bf190ee5…` 前/中/后同值（diff 0）；HEAD/tree/分支/暂存不变。
- **方法**：540 个测试文件（参照 E3 520 + 新增 20：19 个本变更新测试文件 + 1 个第一变更 B2 补证；删除 0）；逐文件独立进程 `timeout -k 5 <TO> node --test --test-concurrency=1 <file>`；6 个登记挂起文件 90s watchdog、其余 300s；**未用 `--test-force-exit`/`--test-timeout`**；未删测试/未放宽断言/未加 skip。
- **结果**：534 自然完成 + 6 登记挂起；**5,032 tests / 4,807 pass / 192 fail / 1 cancelled / 32 skipped / 0 todo**。
- **与参照组合（4,982/4,753/196/1/32）对照（文件+测试名多重集）**：差值 **+50 tests / +54 pass / −4 fail / skip 不变**；**新增确定性失败 = 0、新 skip = 0**（31 条打印 skip 名与参照完全一致；cancelled 同为 `turn-watch-verify/b-last-resort`）。
  - 新增失败 1 条：`chief-workflow` W20「真实 R9 竞争」= ENOTEMPTY 清理竞态（非产品断言；隔离复跑该变体通过、同组另一变体失败 ⇒ 波动族）。
  - 消失 4 条：`chief-workflow` W47 select/revise、selected（波动族，隔离复跑再现失败）＋ `t1-real-cli`「T1 actual bin govern/codex…」（参照失败 `runtime-prepared-configuration-changed`；W1 F5/R9 后回落工厂不再抛该码 ⇒ **预期红→绿**；W5 before/after、D1、本轮主跑+复跑 5/5 通过）。
  - **新增测试全绿**：19 个新文件 44 用例 + 既有文件内新增 6 用例；q9 1/1、N15 10/10 绿。
  - D1 环境性差异均未复现：e2e 195.3s 自然退出（19/7/0/0/12）；chief-workflow W29 组全过（5.5–6.2s）；Node runner 崩溃类未复现（e-pi 11/11、git-trunk-store 13/13、c-claude 6/6）。
- **删除清单/死代码扫描（限本变更）**：退役 6 码 `src/` 仅 4 行注释、`app/` 0 命中（生产零产生；测试内均为负向断言/注释）；旧名 `inspectInitializationProtection` 仅 1 处溯源注释（src）+ 7 处测试注释/断言；新码 3 个均存在并使用；**写门零 `applicationMediation`**；**drain 无 `native:` 前缀通配**（显式白名单 2+4 项，`native:pi-sdk-idle-not-observed` 不在白名单）；sidecar 预算 **4 KiB/16/64 KiB**（常量且强制）；**Q18 无新增回切开关**。
- **静态门**：`npm run typecheck` exit 0；`typecheck:renderer`/`build:renderer` N/A（候选 `app/` 仅 `app/desktop/session.ts`；`app/renderer/**`、`app/main.ts` 零改动）。
- **证据**：`角色卡/测试/docs/change/2026-11-08_E3-F_remove-predictive-gates.md`（247 行 / 29,581 bytes / `41a4a2154b1cc8d8fa791a0bfb8fbcbbe95ba5d1cbe6eb375d15346a8b49a852`）+ `2026-11-08_E3-F_evidence/`（540 逐文件日志、逐文件结果 TSV、对照/分类、扫描、候选/manifest 快照；索引 633 行 / `44f9365614fa0e3f5606db2fda8e6e47fe1675658b501867c7901c41616fbe85`）。
- **候选增量说明（W7）**：E3-F 于 38 文件候选（`9462391e…`）上取得；W7 为 B2 v1 补证新增 6 个测试/夹具文件（产品零改动；38 文件哈希 38/38 不变），其新增/受影响套件复跑见 §三 D1-R1；按 B1 复用规则由 B2 判定是否接受 E3-F 证据在增量候选上的复用。

---

## 六、删除清单与单轨迁移

- **退役（不再产生）**：`git-core-creation-proof-unavailable`、`git-native-surface-unproven`、`git-unclosed-effect-registered`、`official-pure-preparation-unproven`；`native-factory-plan-*`/`native-tool-*`/`process-coverage-*` 作为**门控**删除（保留为证据）。第一变更已退役项确认零残留：`required-scope-unconfined-script-tools`、`runtime-protected-scope-unmediated-app-execution-planned`。
- **新增**：`git-action-audit-unavailable`、`git-core-in-flight-unproven`、`git-core-inspection-unavailable`。
- **语义收窄（码保留）**：`git-old-core-programs-unproven`、`git-role-capability-guard-unproven`、`run-stop-member-lifecycle-unproven`、`run-stop-instance-unproven`、`run-stop-lifecycle-unproven`、`run-stop-unverified`、`controller-stop-target-instance-unproven`、`controller-stop-terminal-unproven`。
- **单轨替换**：`inspectInitializationProtection` → `inspectGitActionAuthorization`（注释溯源）；无运行时新旧并存/回切开关（Q18，回切=回滚提交）。
- **兼容**：旧 journal 无 sidecar 正常读取；sidecar 不进入 `GitRefJournal`/`GitInitializationRecord` 与 replay/settlement 身份；I0-11 sidecar-only 目录/I0-12 stable-source+sidecar 为合法 write-ahead（不报 corrupt，文件安全校验保持，未知布局仍 fail-closed）。
- **审计载体**：sidecar `authorization.jsonl`（write-ahead、append-only、4 KiB/16/64 KiB）；run-stop/controller-stop 不写 sidecar（run transition journal）；动作前拒绝仅 `git.action.denied` 诊断（best-effort）。

---

## 七、Q16 取代关系

- 本变更 B1 **取代**第一变更 B1 v1（`fb881126…`）的 **`P1.3-B1-AC-26`** 与 **B1-EV3** 中「`native-factory-plan-unavailable` 仅 codex」表述（按标签引用，不按行号）；生效后以本 B1 为准；两端变更包/验收记录须注明。
- 可执行断言已按新契约改写并逐条记录：`test/测试/session-admission-approval-q9-integration.test.ts`（`1b2441f2…` → `3b3e3448…`；旧「init 仍被注册表级拒绝」→ 新「受保护+动作时授权；退役/旧码零命中；init E2E 成功；inventory taskId 不符⇒`git-actor-core-binding-unproven` 无副作用」；实施前红→实施后绿）；`test/测试/runtime-dispatch-gate-integration.test.ts`（`5433911a…` → `3abfff69…`；旧 strict observed 断言→新 gate 条件，红→绿 10/10）。
- 第一变更 B2 v2（`71b41879…`，pass 35/0/0/6）为其**当时候选**的历史判定；其 B1/证据不被本变更改写；Q16 取代仅在被取代条目生效后适用，B2 判定归独立验收。

---

## 八、披露（客户可见限制，不得隐藏）

1. **Q1（注册表级 Git 写门删除）**：审批放行的不透明 shell 脚本可能写 `.git`；其它 active 会话的 foreign MCP/未封闭/未知 app 工具可能在 `git-mutation` lease 外写 `.git`（F8；只进 `optionalEvidence`，**不宣称已阻断**，`P1.2-AC-28` 披露项）；控制=逐操作审批/审计/执行后审计 + 结构化 Git 冲突检测。
2. **Q3 / Claude/Pi 进程不可观测**：run-stop/controller-stop「已停止」= Core/tracked-process drain，不等于 native 进程树消失；`stopAndInspect` 活动循环 drain 即返回（5s 仅上限）；native/`processCoverage` 仅证据。
3. **Q6 / 审计缺口**：sidecar append 失败 ⇒ 动作不执行（`git-action-audit-unavailable`）；动作前拒绝只留 best-effort 诊断（无 journal/sidecar）。
4. **Q7 / 串行**：本变更与第一变更重叠 **5 文件**（`session.ts`、`model/runtime.ts`、`run-role.ts`、`git-command.ts`、`desktop/session.ts`）+ **实际第 6**（`public/trunk-store.ts`，sidecar 公共导出）+ R14 测试；全部串行、单写者；候选为合并后基线（HEAD `3f249e2`）上的 38 文件 delta。
5. **Q12**：结构化 Git 写=角色 ACL/任务绑定授权，不弹客户卡；未扩大代批。
6. **Q16**：见 §七；`P1.3-B1-AC-26`/B1-EV3 被取代，q9/N15 断言改写属契约变更（逐条记录）。
7. **B0 豁免/参照**：客户指令豁免沿用（不作正式 B0 重登记）；参照=第一变更 E3 T3+补证（4,982/4,753/196/1/32）；环境差异（机器性能、既有非确定性）逐条记录；若独立验收认为豁免不覆盖本变更，按 B1 BASE-2 补登记。
8. **RR 下一真实门（重要）**：真实 Claude 的 `git_candidate` 四个动作在 **MCP schema 层**被 `__ans_call_context` × 顶层 `oneOf`/`additionalProperties:false` 拒绝（既有 Claude 适配器/runtime schema 缺陷，**非本候选、非本变更修复**）；本变更的真实运行只证明会话创建+投递+只读 `git_query`/`write_file`，结构化 Git 动作真机未达应用层；确定性侧由 W3b（init/计划/文档/initial workflow E2E）与 W5（跨运行时 init/sidecar）覆盖。
9. **覆盖边界（如实）**：activation/commit/integrate/revert/delivery 的完整跨角色效果链（pinned run/freeze/验收闭包等）未在确定性/真实运行中完整构造；commit/delivery 调用点顺序与 digest 映射由源码守卫覆盖；deferred run-stop 的完整 finalize 提交链由 gate 级正/负例 + drain 谓词 + 源码守卫覆盖；`unknownTools` 在确定性桩件下不可产生（F8 以真实 foreign MCP 证明只进 optionalEvidence）；真实 Codex native observed 绑定由 W1 覆盖。
10. **非确定性/环境**：W4/D1/E3 的 ENOTEMPTY/时序/W29/W20/W47、Node runner 崩溃类均按测试名逐条分类为环境性/既有；E3 本轮均已复测或未复现；B2 如需当前机器绿色证据可按 B1 复判规则重跑。
11. **发布/tag 未授权**；提交/推送/合并按委托，不含发布。
12. **B2 v1 与 W7 补证**：B2 v1（`6af7f394…`）= **insufficient evidence**（33 pass / 0 fail / 6 insufficient / 1 N/A）；6 项均为本包已披露的覆盖边界，无 fail/安全返工。W7 以确定性完整效果链补证（AC-1 Claude/Pi commit、AC-4 delivery、AC-8/P1.2-AC-25 deferred run-stop finalize、P1.2-AC-31 activation），全部经真实 service/assemble/Git 能力路径并读取真实 ref/journal/sidecar 原件（不伪造）。**W7 残余边界（如实）**：① AC-1/AC-2 的「product 会话」以真实 roster 中唯一项目实现角色 `impl` 执行（真实角色三文档/模块写集/任务 ACL；commit ACL 与角色名无关；sidecar `actorRoleId=impl` 如实记录；若验收按 roleId 字面 `product` 属术语解释差异）；② AC-8 由等价服务链驱动（desktop `resumeDeferredRunChanges`/`executeOwnedRunStop` 为私有宿主函数；关键断言=finalize 提交与 run transition journal 原件，已满足）；③ 桩件 custom provider 无法 disposed 收口，成员终止用生产 `stopAndInspect` 的运行时中立 drain 快路径（B1 允许「rapporteur 已 disposed 或无 active select_run_change」）；④ W7 运行期曾发生一次后台残留进程并发写结果的事故，已终止全部残留进程、清理污染结果、改单实例哨兵+逐文件独立进程干净重跑（受影响文件隔离复跑 1/1 pass，最终计数以干净重跑为准）；⑤ 未运行真实模型/Electron/CDP（RR 结论不变；Claude MCP schema 基线缺陷未被 W7 路径触及）。

---

## 九、独立验收输入清单

1. B1 v1（`3306b9d4…`）+ 本变更包 + 团队计划（`911ff546…`）+ 派发/I0 记录 + 闸门 1/2 留痕（`63a62a34…`）；
2. 候选身份：38 文件逐文件 SHA-256 + 聚合 `9462391e…` + manifest 1,099/`bf190ee5…`（§一）；HEAD/tree/分支/暂存；
3. 各批证据：W1 `b6d4f688…`；W2 `fa166eed…`；W3a `6a07a922…`；W3b `1547235e…`；W4 `210d2066…`；W5 `8d678fff…`；D1（W7 后）`4e52a01f…`；RR `c40011de…`；E3-F `41a4a215…` + 索引 `44f93656…`；W7 `3fe62b90…` + 证据索引 `eb149ef8…`；
4. 参照：第一变更 E3 `5cba2d54…` + 补证 `54c0db31…`；B0 豁免 `d7a699d2…`；**B2 v1 `6af7f394…`**；
5. I0-1–I0-12（含 I0-11/I0-12 增补）与 Q16 取代关系记录；
6. 披露（§八）与删除清单/扫描（§五/§六）。

---

## 十、状态

- **E3-B v1.1 就绪（B2 v1 后补证）**：B2 v1 = insufficient evidence（33/0/6/1，`6af7f394…`）；W7 已完成 6 项缺口的确定性完整效果链补证（5 新测试 5/5 pass；新候选 44 文件聚合 `787bd910…`、manifest 1,105/`4b5ed42f…`；产品 38 文件零改动；D1-R1 增补 `4e52a01f…`）。
- **待 B2 复判（复用规则）**：由内置独立验收按 B1 v1 判定；本包不判验收。
- **未执行**：提交/推送/合并/发布/tag；B2 通过后放行记录由统筹另行写盘。
