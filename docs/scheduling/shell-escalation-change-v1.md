# 变更包 v1（E2b 通过后 E3 重冻）：shell 判拒后的客户确认通道 + 例行命令白名单扩容 + 回执/开关粒度（T3）

- 任务 ID / flowId：`2026-10-31-shell-deny-customer-escalation` / `shell-deny-customer-escalation`
- 记录角色：ANS 统筹调度（Scheduler，独立上下文）
- 日期：2026-10-31
- 风险档位：**T3（治理/权限/审批语义变更）**
- 状态：**E2b 独立验收通过（35/35 pass，报告 v2）；本变更包为 E3 提交前重冻版；E2b 通过仅对 v2 82 文件候选成立，本版只更新治理记录（E1 状态、v2 报告、memo、沟通记录），产品/测试 52 文件哈希未变；未 commit/push；不发行**
- **版本历史**：E1 首轮 182 行 / `c9ff12b0…`（E2 首判输入）；E1 v2 184 行 / `3803668387a25efbb7924b00ba09debcf259dbdb15430b93762e6ceb1b953061`（E2b 复判对象）；本版 v3 为 E3 重冻（新增 v2 报告/memo/沟通记录与状态行，产品/测试不变）。
- 依据：客户闸门 0/1/2 记录与实施/提交授权（`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`，当前 109 行 / SHA-256 `45ef6620a25a367378ed44bace02cb44991d81ccc249a11623f34bcfef33861f`）；方案 v1.3（857 行 / `6bd12a99…`）；readonly 澄清（124 行 / `6c568ee6…`）；团队计划（575 行 / `4d52bdf4…`）；V1 标准（1320 行 / `0b724fa2…`）；E2b 报告 v2（174 行 / `e3efa363…`，35/35 pass）。
- 记录性质：本文件是统筹的变更包，不是验收结论；E2b 结论见 `docs/acceptance/shell-escalation-report-v2.md`（通过，仅对 v2 候选），E2 首判见 `docs/acceptance/shell-escalation-report-v1.md`。

## 一、候选身份与冻结

| 项 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/flow-improvements-wave1` / `9f670fb2c7d403baf995071055d697c50714c905`（已含 main `32d8f0d` / v1.8.3；无新提交） |
| 工作树候选 | **83 个文件**：**产品/测试 52**（app 14 + src 17 + test 21）、**治理/记录 31**（docs/角色卡，含本变更包、v1/v2 验收报告、memo）。无改名/删除 |
| 暂存区 | `git diff --cached --name-only` 为空（未暂存） |
| 候选清单 | §四列出 **82 项**（除本变更包自身）；本变更包自身最终哈希由统筹在写盘后回报沟通；原始清单 `C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\E1\candidate-manifest-refreeze.tsv`（83 行 / `f265f8b8…`，含 E1 写盘前快照） |
| 冻结规则 | §四 的 blob/sha256 为 E3 提交冻结依据；产品/测试 52 文件与 E2b 复判对象逐字节相同（E2b 报告 §九已预判本重冻）；任何产品/测试文件变化即 E2b 结论失效 |
| 未改动的发布/构建面 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 均未改 |

### 1.1 输入与确认版本

| 输入 | 版本/哈希 |
| --- | --- |
| 闸门 0/1/2 + 实施/提交授权 + E2 启动/返工/E2b 结果 | `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（109 行 / `45ef6620…`；历史快照 49/57/65/84/93/102 行见方案/团队计划/V1/E1/E2 报告，不混用） |
| 客户确认方案 | `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md` v1.3（857 行 / `6bd12a99…`） |
| 独立复核 | `docs/planning/2026-10-31_review_shell-deny-customer-escalation.md`（148 行 / `617d9a7f…`） |
| readonly 裁定 A 澄清 | `docs/planning/2026-10-31_clarification_shell-escalation-readonly.md`（124 行 / `6c568ee6…`；不重开闸门 1） |
| 团队计划（闸门 2 对象） | `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行 / `4d52bdf4…`） |
| 实施前验收标准 V1 | `docs/acceptance/shell-escalation-criteria-v1.md`（1320 行 / `0b724fa2…`；AC-01–AC-35） |
| E2 首判报告（返工依据） | `docs/acceptance/shell-escalation-report-v1.md`（193 行 / `464bec6a…`；31 pass / 3 fail / 1 insufficient evidence） |
| E2b 复判报告（通过依据） | `docs/acceptance/shell-escalation-report-v2.md`（174 行 / `e3efa363…`；AC-01–AC-35 全部 pass，35/35） |
| 派发/返工记录 | `docs/scheduling/shell-escalation-baseline-and-dispatch-v1.md`（`a724b529…`） |

## 二、节点、交付与最终证据

| 节点 | 角色 | 最终结果 | 证据（路径 / 行数 / SHA-256） |
| --- | --- | --- | --- |
| G2 | 沟通 → 客户 | 闸门 2 + 实施授权 + 提交/推送/不发行口径 | 沟通记录（见 §1.1） |
| H1 | 人事 | 3 项边界条目（B-1/B-2/B-3），7 治理文件 / 17 行；md/yaml 一致 | 见 §四清单与角色 changelog |
| V1 | 内置独立验收 | 实施前标准（AC-01–AC-35）冻结 | `docs/acceptance/shell-escalation-criteria-v1.md` / 1320 / `0b724fa2…` |
| B0 | 测试 | 基线：typecheck/typecheck:renderer/build 0；全量 **3193/3166/9/18**（9 项既有 Windows symlink EPERM） | `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-B0.md` / 194 / `0032e375…` |
| A1 | 运行时核心 | 模型契约（含 **R2 pending 第三支**）+ 新工具/schema；runtime-core **282/275/3/4**（3 fail=B0 同项）；typecheck 0 | `角色卡/运行时核心/docs/change/2026-10-31_change_shell-escalation-A1.md` / 120 / `8d32377d…` |
| A2 | 门禁引擎 | 唯一谓词+分类器/写守卫同源+Service 出口+文案；门禁引擎 **288/287/0/1**；typecheck 0；报告补 `implemented-unverified`（R3） | `角色卡/门禁引擎/docs/change/2026-10-31_change_shell-escalation-A2.md` / 130 / `d56b8e06…` |
| A3 | 项目管理 | 30 新 key + 2 改写（含 **R1 context 5 key**）；计数 **907/559/62/3=1531**；shared **155/150/0/5**；typecheck 0 | `角色卡/项目管理/docs/change/2026-10-31_change_shell-escalation-A3.md` / 198 / `ef5d08e3…` |
| B1 | 编排 | registry/闸注入/审计/回执/arming/run-role + readonly A + **R2 pending 回滚/不消耗/可重试**；编排 **639/638/1/0**（唯一失败=B0 同项 EPERM）；typecheck 0；报告补状态行与计数口径 | `角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md` / 203 / `1ea61951…` |
| C1 | 桌面窗口 | 升级卡 presenter/仲裁/暂停 IPC/preload + **R2 presenter pending**；**79/79**、`test/桌面应用/*` **444/444**；typecheck 0 | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-C1.md` / 167 / `230d5540…` |
| C2 | 桌面UI | 升级卡 UI + 暂停 + **R1 脚本上下文区块** + **AC-19 新措辞断言**；`test/桌面UI/**` **352/352**；typecheck:renderer/typecheck/build 0；phase5a **48/48**、7 截图 | `角色卡/桌面UI/docs/change/2026-10-31_change_shell-escalation-C2.md` / 173 / `1b3b963c…` |
| D1 | 测试 | 跨层集成（含 **R2 pending→allow-once / 无审计 / 不消耗**、**AC-19 新措辞**）**16/16**；`shell-judge-verify` 38/38；**T3 全量 3345/3318/9/18**（9 fail 与 B0 逐名相同；新增确定性失败 0、新增 skip 0）；双 typecheck+build 0 | `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-D1.md` / 176 / `3235feda…` |
| D2 | 桌面窗口（真实 E2E） | 仅扩展 `e2e/main.mjs`；真实 Electron **`E2E_PASS=true`、`E2E_FAILURES=` 空、90/90 counted 检查**；29 张截图（新增 39/40/41）；**R1 上下文区块**、**AC-19 retryHint**、**R2 pending→稍后 allow-once** 全过；审计 6 行四类 + pending 无审计 | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-D2.md` / 218 / `2b31c239…` |
| E1 | 统筹 | 本变更包（E3 重冻） | 本文件 |
| E2 | 内置独立验收 | **E2b 通过（35/35）**；E2 首判返工见 §3 | `docs/acceptance/shell-escalation-report-v1.md`（193/`464bec6a…`）+ `docs/acceptance/shell-escalation-report-v2.md`（174/`e3efa363…`） |
| E3 | 统筹 → 沟通 | 按 E2b 结论放行/返工；通过后提交候选/拆分建议 | 本文件 + 沟通记录 |

## 三、E2 首判返工闭合与验证摘要

### 3.1 返工闭合（E2 §五/§六）

| ID | 差异 | 修复与证据 | 状态 |
| --- | --- | --- | --- |
| **R1**（AC-04） | 升级卡缺「脚本上下文摘要（路径+sha256+有界内容）」 | A3 新增 5 个 `ui.confirm.escalation.context*` key（计数 1531）；C2 `judge.ts`/`ConfirmCard.tsx` 新增 `#se-context` 区块（header/note/npm/路径/label/sha256/有界内容/写区外警示；无上下文不渲染）并加视图测试；D2b 真实 E2E `SE_CONTEXT_BLOCK_*` 8 项 + `39-escalation-script-context.png`（sha `32520e7c…`） | **已闭合（E2b pass）** |
| **R2**（AC-09） | 审批卡待答时升级申请被误判 expired 并消耗申请权/额度 | A1 `ShellEscalationDecision` 加 `pending` 支；B1 registry 对 pending 回滚消耗、保持 `recorded`、不写审计、回执「当前有 pending shell 确认卡，请稍后再申请」；C1 presenter 槽占用返回 pending；D1b 集成 K（pending→allow-once、无审计、额度/申请权不消耗）；D2b 真实 registry/presenter/槽/IPC pending→allow-once 成功（`41-escalation-pending-then-allow.png`，sha `a3ae7e1a…`）；B1 报告计数口径同步 | **已闭合（E2b pass）** |
| **R3**（AC-35） | A2/B1 报告缺 `implemented-unverified` | A2 报告 130 行 / `d56b8e06…`；B1 报告 203 行 / `1ea61951…`；均补状态行，未改实现 | **已闭合（E2b pass）** |
| **E1**（AC-19） | 判拒 retryHint 新措辞缺真实证据/新措辞断言 | C2 `test/桌面UI/judge.test.ts:68` 与 `judge-row-view.test.ts:141` 新增「可让角色申请客户确认」断言（旧子串保留）；D1b 集成 L 跨层断言；D2b 真实判拒行详情截图 `40-judge-retry-hint.png`（sha `cf0d2e29…`）与 `SE_JUDGE_RETRY_HINT_NEW_WORDING` | **已补证（E2b pass）** |

### 3.2 检查汇总（最终候选）

| 检查 | 结果 |
| --- | --- |
| T3 全量（排除历史 `write-sequencing.test.ts`，理由同前） | **3345 tests / 3318 pass / 9 fail / 18 skip / 0 todo**；9 fail 与 B0 **逐名相同**（全部既有 Windows symlink EPERM）；**新增确定性失败 0、新增 skip/todo 0** |
| 各角色层 | 门禁 288/287/0/1；编排 639/638/1/0；runtime-core 282/275/3/4；shared 155/150/0/5；桌面应用 444/444；桌面UI 352/352；operator-channel+escalation 79/79；跨层集成 16/16；shell-judge-verify 38/38；readonly 9/9 |
| `npm run typecheck` / `typecheck:renderer` / `build:renderer` | 均 exit 0 |
| 真实 Electron E2E（D2b `09-run`） | `E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；**90/90** counted `SE_*`；29 张截图；窗口 1360×860；无 DEBUG/录屏；审计 JSONL 6 行四类；pending 场景 0 审计、allow-once 后恰 1 条 |
| **E2b 独立复判** | `docs/acceptance/shell-escalation-report-v2.md`（174/`e3efa363…`）：**AC-01–AC-35 全部 pass（35/35）**；独立复跑门禁 288/287/0/1、编排 639/638/1、runtime-core 282/275/3/4、shared 155/150/0/5、桌面应用 444/444、桌面UI 352/352、集成 16/16、judge-verify 38/38、readonly 9/9；T3 全量 3345/3318/9/18；E2E 独立复跑 `E2E_PASS=true`、90/90；typecheck/typecheck:renderer/build 0；候选 82/82 哈希一致 |
| 证据复用/失效 | D1b 全量在全部代码修复后执行；D2b/E2b E2E 在最终候选上执行；B0 仅基线；E2 首判报告为返工依据；E2b 通过仅对 v2 82 文件候选成立，本版只增治理记录（v2 报告/memo/沟通），产品/测试 52 文件未变 |

### 3.3 已知限制（E2b 已按 V1 判定通过；以下记录在 E2b 报告 §六，不据此改判）

D2b §9.7：pending 由真实 registry/presenter/槽/IPC 验证但未由真实 `run_shell` 工具调用触发（D1 覆盖工具链）；角色可见 `judgeWayOut` 回执未在 E2E 生成（D1 逐字断言）；脚本上下文为夹具（真实读取/有界来源由编排 + D1 覆盖）；多引擎仍只走 pi 视图路径（V1 允许至少一个真实引擎）；「已有升级卡待答」分支未在 E2E 单独构造（C1/D1 单测覆盖）；harness 非 `app/main.ts` 整机；无真实模型/网络会话；超时为受控 400ms；审计拒绝/超时记录由单测覆盖。以上均如实记录，不构成 fail；缺少录屏不判 fail。

## 四、候选清单（82 项，不含本变更包自身；E3 冻结）

> 状态：`M`=已跟踪修改，`??`=未跟踪新增。每项给出 `git hash-object`（blob）与 `sha256sum`（工作区）。类别「产品/测试」进入实现提交；「治理/记录」进入治理提交。

| 状态 | 路径 | git blob | SHA-256 | 类别 |
| --- | --- | --- | --- | --- |
|  M | `app/desktop/confirm-card.ts` | `727eee4b691a73abb77245a059aa43190acf44c4` | `caff37db102e67f89986dd100cc38cd7698f93d2f247f16f7f572e61792ab7ab` | 产品/测试 |
|  M | `app/desktop/interface.ts` | `c5a454110d73156394723e56ec325b988d3301a8` | `285656a234eeb8209b06d93c12da1409d4db47f690750da4e244538c793bdc7f` | 产品/测试 |
|  M | `app/desktop/operator-channel.ts` | `b6d461d12db8a5cb796fb18c782341a854580bd2` | `67cd7be6ba1f3bbb6db21223595ddbfa427f5714eca9471ed8adee3086b1b948` | 产品/测试 |
|  M | `app/desktop/session.ts` | `b3bfdee7019ce9bf64ab148905f417d8f7d7a233` | `9dace0fb3c494ca9168113dd788bc5874a93918880e5cc01294f8467bd2bb2a0` | 产品/测试 |
|  M | `app/main.ts` | `d4ae60aad9a28dde993215ba4337024a961ad009` | `475a228cef3772a099318bd4a0e5843f494983e2b0fc551da3aed80f27e57b27` | 产品/测试 |
|  M | `app/preload.cjs` | `c40bb39e35c6e7e1539002976fb0306e136cf490` | `636c930aba095dc9345d70dcf0e719f36612e97818000951f935171e5da3d30d` | 产品/测试 |
|  M | `app/renderer/src/chat/ipc.ts` | `470ae6d584307e4396e3004b6da84f60bf4743f7` | `51fc14bf8f3ce697a9733806202fede127c4fe02807198e97def89654e6b410f` | 产品/测试 |
|  M | `app/renderer/src/chat/judge-row-view.ts` | `aeb0530b9ef5c2fbf0671f9541e56ffdf0316d9c` | `1986f9238b15b20d7323b531a4929e34f2eef01199faac7ce37e7a1846a7a80d` | 产品/测试 |
|  M | `app/renderer/src/chat/judge.ts` | `705b6b3b22e56b7fd7f08b17f72244e2c7637517` | `52d0556e3ce65f57d0eab47bb37ae1619e998ca043ef357645bee4790280d938` | 产品/测试 |
|  M | `app/renderer/src/lib/platform.ts` | `eff38c7cce84951b4b90cadfc6219f665663d6af` | `08f0d5c417f3a61ba4100c7cb4cc819cdd43b49d66bc72e73431b2a89b6dffd4` | 产品/测试 |
|  M | `app/renderer/src/shell/ConfirmCard.tsx` | `d3301f5c096c083b4b79a72f3e2d62ec29f2b2fd` | `e4d284000782ee9f6dbb704b13b7802d621dbb9dc72619fd87f9267a46465c44` | 产品/测试 |
|  M | `app/renderer/src/shell/shell.css` | `b2877760cf41bcb674a6b3bb0524395d794cb78a` | `60d2aa36688f2f9cd7bdc3bb2459104437766b20be93d350ec877a1d3da7d870` | 产品/测试 |
|  M | `app/renderer/src/stores/confirm-store.ts` | `b1fc08c47f572bdd09bab5a6e934cae862f5bbd5` | `db864332fab2faa399212a03089e9e0dec863152b0e31a60c157b9fa3268f2a1` | 产品/测试 |
|  M | `docs/acceptance/memo.md` | `cab07e8e6498e7bf2db49b4faf078c0b9cafb2bf` | `9c9de1f9d464317e78b923aa97de0690e4524da205e79762b50363b952b6f7da` | 治理/记录 |
|  M | `docs/scheduling/memo.md` | `ca29962319f588cd15633f9e75102ea56c767f4b` | `93d55e13ed69b968b1220dfcc3c9a25dff6b6fabae370a51d08101d486c54956` | 治理/记录 |
|  M | `src/common/shared/i18n/messages/en-US.ts` | `945d47797c9a8d2948bcad749d16013e0b25e229` | `56f0706b62125945f54df0cade178318a43c68d2b42692909997f635421e66f1` | 产品/测试 |
|  M | `src/common/shared/i18n/messages/zh-CN.ts` | `b1c63a444ef094fe38e8032dfd46d040e09da0bd` | `4a944f0e3484d1455a4f9e6caec56cd5824d0e67671a46597f4e7af9dfb48db4` | 产品/测试 |
|  M | `src/common/编排/routine-shell-policy.ts` | `8165a975d5e0c89e038a8a93bb43a09c74fd320d` | `483f5e5a10fe9443420a33bb4aeb2cb32dd6fc447d55a40858a674e9878d57a7` | 产品/测试 |
|  M | `src/common/编排/shell-audit.ts` | `d814c07b1f51e74144325f3f3352ba381c4d07e9` | `a35f7312bfedf626d270d5c29787ee82fa2fd1404663e195154f53680f3b8125` | 产品/测试 |
|  M | `src/common/编排/shell-gate.ts` | `1b184445ae2cb27bd364077a8bc057d5e81c7e58` | `0fad836ee5e21e4177a30a24cd717f0b8c83f104335ea14f9a4e7d7e86a38ce6` | 产品/测试 |
|  M | `src/common/编排/shell-judge-verdict.ts` | `eea4cb6cb13fed48403f99da07ae5333a6b8b84a` | `d33850987208f23469924b1390cfe53dcd8e9095806e6475a78ad448e03f32c1` | 产品/测试 |
|  M | `src/common/门禁引擎/classify-shell.ts` | `b7ba987e1d56b9aff543cbbfcb88180f7bb2132e` | `b14ce0ca3b836eee45aa35292909de06f8a4ac4c02bf80716954cca0bca4ee0a` | 产品/测试 |
|  M | `src/common/门禁引擎/governance-roles.ts` | `21ccc7bec05609cc3e5e0639ebde972b4ba1f988` | `8021761c0e7b767f3a809bb8ffe9a4f799dc6e1738457893cde3541c9439340d` | 产品/测试 |
|  M | `src/common/门禁引擎/shell-write-guard.ts` | `acb24beb82e2fdd6198911d5d6f02042a145054a` | `46749b3e7e3a596b3fc38f4f6dce6bdd2c6d8b376f79c3e259eb622c8cdcfaa4` | 产品/测试 |
|  M | `src/model/runtime.ts` | `5b39807b7e81809fe37e0ecf34f4173dbfc64261` | `5602c36ffc61a1477d6a3af17e07f38763370d1239bdf31098bcc19a230abecf` | 产品/测试 |
|  M | `src/pipeline/orchestration/govern-session.ts` | `48b06e61218806efebc3507eba99e89a77cec589` | `ee5f2d791a5f178cb1b4b4f9f8d446fc6321dd8a8ac786a9dd972f2237487eb4` | 产品/测试 |
|  M | `src/pipeline/orchestration/run-role.ts` | `8cb9d580c39a1ed38c787e2a8c7b02a30fe77358` | `66082ec4b2817f0b241fba1bc9b5d60a86c647fe909ed6dcb08f51f40cc90a83` | 产品/测试 |
|  M | `src/pipeline/orchestration/shell-arming.ts` | `c38930436869afc71411671bb4721d526945cf6b` | `cfc5fbb49913fb40ef414306f6315f1e4afe944678f38eab3400af32328a8e9a` | 产品/测试 |
|  M | `src/provider/runtime/schema.ts` | `5a63db425cf1e9279a46695c656e8141e8789205` | `c98de0af017636437234fee44ea0b7fee0c2dd4eadc74710a3bc6a61a4d8d566` | 产品/测试 |
|  M | `src/provider/runtime/tools.ts` | `8ee042e48d393b556df3f890967d083b259eafc1` | `a04cf4d974332cb0a09db37e68165b2909af0cb7843f23dfb06154a39193c4a1` | 产品/测试 |
|  M | `src/service/gate/shell-rules.ts` | `40fb3949eab6056413622026f428e3a4397ffe26` | `c4ce294f81eaed5b28e32adfb8fb34fe6e3726a39c39b33fb2813363debb3533` | 产品/测试 |
|  M | `test/桌面UI/judge-row-view.test.ts` | `73c65adb1a2176e23b43ba70e1322249240d3ff0` | `7b1c5b3fb7144501c20288a8198028167bb140979d4f741ee62debd2dbee4649` | 产品/测试 |
|  M | `test/桌面UI/judge.test.ts` | `9304b3ef5c634031f4dda57822d10ffd6c821ede` | `4c26fe284e08d935fb2b16ee863719c31f1e272ad88da7550880367955bdc29e` | 产品/测试 |
|  M | `test/桌面UI/phase5a-electron-smoke.mjs` | `c89712d74780f6b5785ca78707e11f1e0cbf2e12` | `c68b74836f02e0285a6304d0054cbe2ed8f42ecc93cc8cdc176506e76cf0c62d` | 产品/测试 |
|  M | `test/桌面应用/e2e/main.mjs` | `8cf1c00c30ee3dbf34d2e6354bdf6a418406b2b1` | `8c88c911dd4e523979c229e9a264cf78f52ecc4c1c058d4266be1d8508f29bd3` | 产品/测试 |
|  M | `test/桌面应用/operator-channel.test.ts` | `6f9f4aa4af44c591805d33a65dd41dd82ee40dc6` | `639cf8f4dbaab30e4cec12c2909d9632cc53350b00e5d74e43a860d303d0b7cd` | 产品/测试 |
|  M | `test/测试/shell-judge-verify/b-deny-flow.test.ts` | `7d85515a87082ed9cb6406ae5cca220f67ee8b20` | `3ce3a3c8239d7e3ea2495f2f9a8840debd3af88f567e2546f5b5f012f4802a02` | 产品/测试 |
|  M | `test/测试/shell-judge-verify/c-manual-flow.test.ts` | `2fbb995eb999d9c720363a6fd01d6ca6bdb35a15` | `973beaedc3d2a6db605c28d6eb9c6ceff7f93e9210b89cbaebd31519b839c469` | 产品/测试 |
|  M | `test/编排/shell-arming.test.ts` | `3b2f37902018f88330fd8c0a572fe6863757a0d5` | `e03c6302d74d076bb88b0e97bd97cbeff81a6509f3aa0d13f9bb4a470ed231d7` | 产品/测试 |
|  M | `test/编排/shell-authorized-routine.test.ts` | `74befe8cce9f39b20949555a0475c249a8a55760` | `73ff85be4bf03e190b0f2fa514cbab06c941714ef5375ffd84b31ce1aadfb44e` | 产品/测试 |
|  M | `test/编排/shell-gate.test.ts` | `5541426ac2b0391b16dbef520d8172f6adc8e312` | `943a5c4f83d1c78fff56149d3a5d575b1776b5c69954e9185992329b872b7546` | 产品/测试 |
|  M | `test/编排/shell-judge.test.ts` | `8b53c79bd02cb25d7b8b8749497186faeaed6ba2` | `f9ebddf89cb1654eda63872fa21447f713f658633a062a7cca169fc570414517` | 产品/测试 |
|  M | `test/门禁引擎/classify-shell.test.ts` | `90ccf2c19c871025b284161e1f19eee5d43732ca` | `cf167f518d46d4b7b85481c782cb2a140cb3b2117c9ba8344db8e118ec93c88a` | 产品/测试 |
|  M | `test/门禁引擎/shell-rules-public-reexport.test.ts` | `e529bd0180a7a24ef0d2bf9552f7a3eb09864165` | `dcd2857e36b8f3ac215ceed1378d4462159a9d7cefe4b8c4ba346ac06b2a20da` | 产品/测试 |
|  M | `test/门禁引擎/shell-write-guard.test.ts` | `05cdd6f8dfbf322abe97a2d824cf2e80b19f9740` | `03a333bbce0f419135b8cdb219f588520edc4d017952f1f83acd9053afd25850` | 产品/测试 |
|  M | `test/项目管理/shared/i18n.test.ts` | `000111762d24c5823facabea944925bdbe1c3d1a` | `89f23673a75812ae8ed534187d3ebe2da27aba522307bda443383134d5ffba41` | 产品/测试 |
|  M | `角色卡/桌面窗口/boundary.md` | `ea9dccf9dca94e5a9255d35a1ac66ab9d80b3fea` | `f85eb69c248d876827f1ab11f200b475a453c445772dbb40ea3d8a9b7ee54514` | 治理/记录 |
|  M | `角色卡/桌面窗口/boundary.yaml` | `c6f4f3cacd4300432e890899124f275cb23c419d` | `b3136151cac696b69ffc0f626f9b790cacb858d9a85a5c44ffbca750dfc654d9` | 治理/记录 |
|  M | `角色卡/桌面窗口/changelog.md` | `bcac1cff7a3e281e93fbf7d4ff6bb2a1901bb828` | `d7732a25c1f47184da522264d4c75d70d185344ffd3ce3e7723ad3b6326573bc` | 治理/记录 |
|  M | `角色卡/编排/boundary.md` | `96e56b51e617b72523965a43845a074ded7b94f7` | `1f45d783fd6258230ff397dca29a90da0908b71296ca8ff1f71248204f4e48ed` | 治理/记录 |
|  M | `角色卡/编排/changelog.md` | `2f6cfc53cb7cd6301d246a4d249c4d2347df3ab1` | `4685afc1bdf2a74c2438a8abe2c7199c21942c2e2035d3d18d8e6b59a95731a1` | 治理/记录 |
|  M | `角色卡/运行时核心/api-spec.md` | `45e67767e5e909a6cb159b8ace665a81ec8760ca` | `dd0df5e9b1ba892d6f6ab9510bdb4a2c51f96c2122224834433491366364aec6` | 治理/记录 |
|  M | `角色卡/运行时核心/feature-map.md` | `a61263c497cd93bef76b6e0f24a07fc4e60a2023` | `7ede6c8e91b2468d5ed7d2587fb0c60a89a36ef19699aae87101e5db1a22ac7e` | 治理/记录 |
|  M | `角色卡/运行时核心/memo.md` | `6c96d317b1b846d832363b9a8a4a456c81142ee2` | `61d8d3b5295c8ce4b15c076433805287c2c13dd9203e54dede6c2388d541a02d` | 治理/记录 |
|  M | `角色卡/门禁引擎/boundary.md` | `3d2dddc6bbe0baa07b1a2d448baebc9f69b75769` | `d070ce4c5d91285b1fc4d11f3920d33a6d598c73a6b97aa1696d32f170b8c2b6` | 治理/记录 |
|  M | `角色卡/门禁引擎/changelog.md` | `9dde83c6dc72d81d8f36879d7e36378d50e31789` | `2ee8cb5d8f69538fcd31e944a7f23b51b4e54d054687b1ffe363f6c8a8b00032` | 治理/记录 |
| ?? | `app/desktop/shell-escalation.ts` | `0ced2ad8d748c7d56e1ef659bcd52beb7792577b` | `d0d0fa12284ff8060da7faa8e141659b94fa0961eecb8b4c45acf0e704e5ed8c` | 产品/测试 |
| ?? | `docs/acceptance/shell-escalation-criteria-v1.md` | `eb38e65c68ff8e4b87d3f9b5343943ddfcb365c2` | `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b` | 治理/记录 |
| ?? | `docs/acceptance/shell-escalation-report-v1.md` | `97e65d39fd572155588354cab8854f3de7f8cfdb` | `464bec6a6cf2705495e812e5622e0521aa370b2e352e9404cb605370d5405a25` | 治理/记录 |
| ?? | `docs/acceptance/shell-escalation-report-v2.md` | `846cca258fda29c5a822fcdfef4441879e9ce465` | `e3efa36363895b2a81839ad86e94971d73bd654e7aa21f2df31363695ccc29e2` | 治理/记录 |
| ?? | `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md` | `a48a97ef3e70aa9da47cb5d2d132d84f0528d14a` | `45ef6620a25a367378ed44bace02cb44991d81ccc249a11623f34bcfef33861f` | 治理/记录 |
| ?? | `docs/planning/2026-10-31_clarification_shell-escalation-readonly.md` | `e262e3f3e90e8baf8dfce364382e87a371106503` | `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4` | 治理/记录 |
| ?? | `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md` | `e6d29d9df8e965fd5b59863369a36d5d07fe3573` | `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` | 治理/记录 |
| ?? | `docs/planning/2026-10-31_review_shell-deny-customer-escalation.md` | `2774a9ff443013ed644987dc9da872ce630a5de3` | `617d9a7f84599ade1837934a5fb86ee93e95cf13dfca2d37911bc11e0de9c586` | 治理/记录 |
| ?? | `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md` | `b14b42b856fffc93e9287149eb60ca601181ec95` | `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203` | 治理/记录 |
| ?? | `docs/scheduling/shell-escalation-baseline-and-dispatch-v1.md` | `775ff7e937799fb92c2d0b808a20b94db7472178` | `a724b529d3ba66d0c7df4515edc50a8df01e4c2669acc86574137a561819769b` | 治理/记录 |
| ?? | `src/common/编排/shell-escalation.ts` | `c86d91c1d483127ac28480a0d9155d88b0ab899b` | `0ba2df5bdec8633a2103a0b1689c8a43c38beef9f33b45ca5f559f81300542b0` | 产品/测试 |
| ?? | `test/runtime-core/shell-escalation-contract.test.ts` | `141d1196152db3ea356209dba994b3d7b397e8b4` | `f510b84eca9acc0350f2f0d7cc6c30cab6ef651144d4fcc7cd1361b7131580a7` | 产品/测试 |
| ?? | `test/桌面UI/shell-escalation-view.test.ts` | `6f22b163c04423a00659b547a8c9ccc626614530` | `01862cb7c1e4f9d1bed2742d2c2403fb206bc46c34b83b8eb6a3aaa4f9586402` | 产品/测试 |
| ?? | `test/桌面应用/shell-escalation.test.ts` | `3955f8029c80371840b12ec9413ffef514e85a62` | `c5006e7e9c82667da0ab99ab2a12663497138fbce0be265c8a2a4aec28f78609` | 产品/测试 |
| ?? | `test/测试/shell-escalation-integration.test.ts` | `2b22bf9e716e25f75588f09857db2a784a15dca1` | `b9f90aba5f6f05257b37c10edfd01c0834101e5d6f5e997e1f3ad0f5d83d8a15` | 产品/测试 |
| ?? | `test/编排/shell-escalation.test.ts` | `fbc7514552b72d9de68d8695198437f8c5b60af2` | `d01aac9e7d42913581e1f2c8da2452ad8427f716251982d48355c79ef0646a28` | 产品/测试 |
| ?? | `test/门禁引擎/shell-routine.test.ts` | `910557bcc4750c826bb47e628e4519093c9d86ba` | `e92b02c883e71849ebc7a2804bd757878681896a9f7a10732b76143fe0d4d283` | 产品/测试 |
| ?? | `角色卡/桌面UI/docs/change/2026-10-31_change_shell-escalation-C2.md` | `b8b7d16229ec02c3333a436d7fac3dcc786bd6d3` | `1b3b963c883eac39c0e4a17e69f2070700e3d558cbdf9ff3f3634416bb7cb08f` | 治理/记录 |
| ?? | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-C1.md` | `0a2f9d2cfa1e60100a7f924e922646557b769870` | `230d5540f8a28bfbe7a7f0cab75f5c46babef2c638fa1a469155a10a00d9dfb9` | 治理/记录 |
| ?? | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-D2.md` | `d2aea79188cb99d25740da44489513d0d1590fb7` | `2b31c2395885cc002eb50c6bd2394244e49638a621e365ac39ea41f91b3ba19c` | 治理/记录 |
| ?? | `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-B0.md` | `96a1ce7a6cee528dea301ca6d13900fa6e8bb8d9` | `0032e375ade1fcb48d3fc9e1b57f84008edf56bca26ffde820aceb3e9040bb2d` | 治理/记录 |
| ?? | `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-D1.md` | `1808257e6aeb08f8eadf1612ac7e5dfa4048410b` | `3235feda29b9834f642c9d02fec99a4aaf52c4d7aaba853c61fb9c68c75688d3` | 治理/记录 |
| ?? | `角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md` | `591b1397b021afcc5da3738ccbde33caa8b8d83c` | `1ea61951afbfbcc09934cdd6cb95e40f451d3b1516f8ec3f7d8878f0d1d0bc9d` | 治理/记录 |
| ?? | `角色卡/运行时核心/docs/change/2026-10-31_change_shell-escalation-A1.md` | `3cce5825874fb81e5144a42b798b823d8542e983` | `8d32377df40d6a02a60a8832eaae0c9224258a29d50b3c109744f04b36b7a0cb` | 治理/记录 |
| ?? | `角色卡/门禁引擎/docs/change/2026-10-31_change_shell-escalation-A2.md` | `8019ce915258aa9a71c881f4eadc37e0da28bf9f` | `d56b8e06b7c42bc24e497f4ff0ac09e4a464e657fd074f365774d5e369d6bb16` | 治理/记录 |
| ?? | `角色卡/项目管理/docs/change/2026-10-31_change_shell-escalation-A3.md` | `8e22383acf224672e975cf518189019b049f4e60` | `ef5d08e35c85ae8461535679e1ab566f5b048701c01b2835b2a2d0bc0a3b9588` | 治理/记录 |

## 五、建议提交拆分（E2b 通过后由沟通执行）

- **推荐：两个提交**
  1. **实施与测试**（52 个产品/测试文件）：`app/**`、`src/**`、`test/**`（含升级通道、白名单、i18n、桌面/UI、全部测试与 E2E harness）。提交信息建议：`feat(shell-escalation): 判拒客户确认通道 + 例行命令白名单 + 回执/暂停（T3）`。
  2. **治理与记录**（31 个治理/记录文件，含本变更包）：`docs/**`、`角色卡/**`（boundary/changelog/change 证据、E1、v1/v2 验收报告、memo）。提交信息建议：`docs(shell-escalation): 方案/闸门/团队计划/验收标准/返工记录与角色记录`。
- **备选：单提交**（83 文件）：适合要求「一次提交」的仓库惯例。
- **不发行**：不打 tag、不升 `package.json` 版本、不构建/上传发布包、不写发布说明；`release-policy.mjs`/发布工作流保持 `v1.8.3` 不动。方案 §13/团队计划 §八 的「新小版本发布」仍属另行授权。
- 提交前由沟通按仓库惯例确认是否走 PR/合并流程；实施角色与统筹不自行 commit/push。

## 六、状态与限制

- **E2b 已通过（35/35）**：`docs/acceptance/shell-escalation-report-v2.md`（174/`e3efa363…`）；通过仅对 v2 82 文件候选（产品/测试 52 + 治理/记录 30）成立。
- 本变更包为 **E3 提交前重冻（v3）**：新增 v2 报告、更新 memo/沟通记录与 E1 状态；产品/测试 52 文件与 E2b 复判对象逐字节相同，故 E2b 结论对产品/测试成立；治理记录重冻符合 E2b 报告 §九的 E3 要求。
- **提交前核对**：HEAD `9f670fb`；工作树 83 文件（56 M + 27 ??）；`git diff --cached` 空；无改名/删除；发布/构建面零 diff；`release-policy.mjs` 保持 `v1.8.3`；`app/renderer/dist/` 为忽略产物非候选。
- **提交/推送由沟通按客户授权执行；不发行**（不打 tag、不升版本、不构建/上传发布包、不写发布说明）。实施角色与统筹不自行 commit/push。
- 本变更包自身 SHA-256 由统筹在写盘后回报沟通（不写入正文以避免自引用）；原始 83 行候选清单在 `%TEMP%\ans-shell-escalation-evidence\E1\candidate-manifest-refreeze.tsv`（E1 写盘前快照），最终 83 行清单（含 E1 最终哈希）由统筹交付回报给出。
- 未 commit/push；未发行；未联系客户。
