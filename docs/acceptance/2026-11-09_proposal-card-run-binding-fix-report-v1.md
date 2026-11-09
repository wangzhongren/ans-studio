# 独立验收 B2 报告：提案确认卡「通道未受理」——draft run 未绑定提案物证缺陷修复（v1）

- 日期：2026-11-09；固定身份：ANS 独立验收（B2 判定；独立上下文）。本报告只对**同一最终修复候选**与 **B1 v1.1** 判定；只判本缺陷修复是否满足已冻结标准，**不判方案质量**；不授权提交/推送/合并/发布。
- **唯一判据**：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，**294 行 / 48,124 bytes / SHA-256 `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`（v1.1）**。B2 复核：当前文件前 196 行（v1 正文 + 末尾换行）逐字节 SHA-256 = `42a1ec9b86b8ae2fe7805de9fcedbac3ab71ae266999e09266c794abc65c963b`（35,639 bytes），与两份修复记录写盘时引用的 B1 v1 完全一致 ⇒ **v1.1 为 v1 正文原样保留 + 附录增量，未在实施后被改写适配候选**。
- 判定口径（B1 §7）：每条只用 `pass / fail / insufficient evidence / not applicable`。本报告判定 `BASE-1–7`（7 项）、`AC-1–15`（15 项）、`EV1–6`（6 项）、`RR-1–8`（8 项，含 v1.1 附录 A.4 的 RR-8）= **36 项**；另逐项复核测试矩阵 `A1–A7 / B1–B5`（12 项，作为 EV2/EV3 的证据层）并计入统计：**48 项 = pass 48 / fail 0 / insufficient evidence 0 / not applicable 0**。
- **结论：pass（附限制/披露，见 §6；非 pass 项：无）**。
- 纪律：本报告只写 `docs/acceptance/`；未改代码/测试/方案/角色卡/边界/B1/其它文档；未提交/推送/合并/发布；B2 期间未运行真实模型或 Electron（独立复跑仅确定性测试与静态门，不改仓库写集）。

## 0. 结论摘要（先读）

1. **候选独立复算成立**：HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`，分支 `feat/plan-escalation-card`）+ 工作区**恰 4 个**修改文件；`git status --porcelain -- src app test` 恰 4 行、暂存 0；逐文件 raw SHA-256、A′ 两文件聚合 `bb24291e…`、4 文件组合聚合 `bf127456…`、`src app test` manifest **1,109 文件 / `4958207f…`** 均由 B2 独立复算，与 D1/RR4/A′/B 证据逐一相同；B2 检查前后候选与 manifest 不变。
2. **A′（编排）等价绑定成立**：draft 空 refs 时按应用计算目标集（host artifacts/`criteriaRef`；无则既有版本化文档发现）读取**实际字节**入 `complete-snapshot/v1`；真实运行 S1 决策快照 `decision-3755…`（6 files）经 B2 独立复算：文件 SHA-256、快照 digest、逐文件字节哈希、target 盘上实际字节全部一致；prepare 未写 run manifest（`documents:{}`、`updatedAt=createdAt`）。未知/自报/越界/不可读/哈希不符/漂移仍 fail-closed（A2–A5 负例）；pinned 与无 runId 分支 diff 0、既有用例原样通过。
3. **B（桌面窗口）fail-closed 呈现成立**：materials/绑定失败不再呈现卡、不写 `request.presented`，以既有 `declined + notPresented + reason` 结算并以 `cardNotPresented` 回执交回发起回合；真实运行 S2 两次闭环均无卡面、无 presented、回执含真实原因、回合继续（`task.reported` ~10s 内）。execution 回退、respond 闸、委托开关均未被改动。
4. **合并场景成立**：真实 Electron（本候选 worktree `app/main.ts`）+ 真实 Claude + 真实 UI，隔离 userData、CDP 9223、仓库外目标项目；S1 中 draft 提案卡真实呈现给客户 → 客户接受（关闭委托后经既有 respond 语义）→ `request.resolved`：`by:"customer"`、`operatorId:"51054"`、`choice:"accept"`、`selectedOptionIds:["accept"]`、`decisionId:"decision-req-303944cb359e95cd"`；工具回执 `ok:true`；无「通道未受理」；流程继续（`task.reported done`、下一投递开始）。
5. **限制（如实披露，不改变 pass）**：S1 的 `chief-decision.failed` 为 **execution 阶段既有 judge 工具面问题**（非 materials、非本修复写集；由既有 execution 回退交客户）；提案接受后的**下一真实门（冻结/pin）未在 10 秒证据窗内到达**（按预算 halt）；attempt-2 真实运行存在**预算偏差**（提案卡 2 > 1、首果未即停——由驱动自身 `ReferenceError` 导致，已如实保留）；9222/9223 的 run 结束时端口探针**未以文件归档在证据目录**（记录称在 transcript；B2 以当前实测 9222 PID 26264 不变/无 9223 监听补强）；修复记录命名与 v1 预期不同（v1.1 已明确按实际路径判定）；A′ 证据 `counts-and-notes.txt` 记 `direct-role-capabilities.test.ts` 为 +124/−2，实际 numstat 为 **+122/−2**（计数笔误，不影响身份/哈希/测试结论）。

## 1. 判定输入与身份复核（B2 实测）

| 输入 | 路径 | 行/字节 | SHA-256 |
| --- | --- | --- | --- |
| 判据 B1 v1.1 | `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md` | 294 行 / 48,124 | `682539ba…918c7`（全文）；前 196 行 = v1 正文 `42a1ec9b…c963b` / 35,639 bytes |
| 缺陷记录 | `docs/communication/2026-11-09_defect_proposal-card-run-binding.md` | 48 / 5,529 | `21dfb43c…a300c` |
| 修复路由 | `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md` | 183 / 32,508 | `4e8fb354…7ea85` |
| A′ 修复记录 | `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding.md` | 81 / 11,151 | `d4147997…0aa12`；mtime 11:59:43 |
| B 修复记录 | `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md` | 96 / 16,245 | `4005b0f4…69ec`；mtime 12:02:19 |
| A′ 证据（前后失败集合） | `…-evidence/before-failing-tests.txt` / `after-failing-tests.txt` | 各 22 / 2,325 | 同为 `d989195b…c5b9`（diff 空） |
| A′ 证据（计数说明） | `…-evidence/counts-and-notes.txt` | 59 / 5,767 | `0409961e…7bd51` |
| B 证据索引 | `…-evidence/EVIDENCE-INDEX.md` | 94 / 12,995 | `2b234705…6f0a0` |
| D1 组合验证记录 | `角色卡/测试/docs/change/2026-11-09_D1_proposal-card-run-binding-fix.md` | 192 / 18,029 | `d6270956…ca6a1` |
| RR4 真实运行记录 | `角色卡/测试/docs/change/2026-11-09_RR4_proposal-card-run-binding-real-run.md` | 231 / 31,494 | `e561c38e…5db1c` |

- `2026-11-09_RR4_evidence/record-identity.txt` 所载 RR4/D1/B1 三组行数/字节/SHA-256 与 B2 实测**逐一相同**。
- 证据完整性独立校验：B 证据 `sha256sums.txt` **37/37 OK**；D1 证据 `sha256sums.txt` **134/134 OK**；RR4 证据 `sha256sums.txt` **112/112 OK**（`sha256sum -c`，零失配）。
- 缺陷记录客户最低要求 1–4、路由 A′/B 语义、D1–D5 处置口径与 B1 v1.1 一致；本 B2 只按 B1 v1.1 判定。

## 2. 候选独立复算与稳定性

### 2.1 检出、改动面与逐文件身份（B2 实测）

- HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；tree `262e7ba42ee646d055f65f92e640834a89addde1`；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` **恰 4 行**（全部 `M`，无新增/删除/重命名）。

| 文件 | 归属 | numstat | raw SHA-256（磁盘实际字节） | owner 证据对照 |
| --- | --- | --- | --- | --- |
| `src/service/trunk/impl/apply-journal.ts` | A′ | +31/−5 | `09130d02fd5a053883148fc4321110b0eeca89b9036cb0e2767b588346e77e41` | = A′ after |
| `test/编排/direct-role-capabilities.test.ts` | A′ | +122/−2 | `4f98332f3a4c8258320e4f1f5316c34ca5a6cca8cf6596d53ee74ca07b67f4a1` | = A′ after |
| `app/desktop/customer-input.ts` | B | +35/−5 | `71e0cc0bb7be44257312c3421f210a88376f3ca07efcf448be54de1b8f217fa0` | = B after |
| `test/桌面应用/chief-workflow.test.ts` | B | +167/−20 | `f5dd81d64cefa707a0348f16be9b2fa2e8827976ded2ae87780364e61ba450fc` | = B after |

- 聚合（BASE-4 口径：按路径 `LC_ALL=C` 字节序排序后 `path + "\0" + sha256` 串联的 SHA-256）：A′ 两文件 = `bb24291eb6ba3adcaa7ceff5483fbfe73f8fb70cc9a8275b79ecfd9d04b6b8f0`；**组合 4 文件 = `bf12745676901055ccfcb98e3578205465c88a3ef8293faa91827dc5beb80986`** —— 均与 A′ 证据/D1/RR4 记录一致。
- `src app test` manifest（1,109 文件，`<sha256>  <path>`、LC_ALL=C 字节序、LF、末行换行）：**`4958207f196109ef5c7d25e642f8846880236a94e6fe4fca6bb6af03e1cab064`** —— 与 D1 证据 `manifest-src-app-test-before/after.txt`（各 1,109 行、文件哈希同为 `4958207f…`、逐行 diff 0）完全一致。
- diff 身份：当前 `git diff` 的 A′ 两文件部分与 `…-evidence/code-diff.patch` **逐字节一致**；B 两文件部分与 `after-customer-input.diff` / `after-chief-workflow-test.diff` **逐字节一致**。

### 2.2 公共契约与排除文件（BASE-5/§0.2）

- `src/model/*`（含 `src/model/runtime.ts`、`src/model/trunk.ts`）、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`、`app/desktop/session.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/run-manifest.ts`：**diff 0**；B2 实测 SHA-256 与 A′ 证据 `candidate-identity.txt` 基线清单逐一相同（如 run-manifest `a5bbb067…`、runtime `b4164765…`、run-role `53459ba4…`、tools `c37793ca…`、session `0132cd4e…`）。
- `test/桌面应用/optional-acceptance.test.ts`：**diff 0**，实测哈希 `3e5760f1…` = 基线；只读回归文件（`decision-service`/`application-line`/`run-change-trigger`/`pending-card-restart`）diff 0。
- `package.json`/锁文件：无改动（无新依赖）；角色卡/边界/治理/权限/验收标准：无 tracked 改动。
- 不改 `RunDocKind`（`src/model/trunk.ts` diff 0）、`request.resolved.by` 枚举、`request.*`/IPC 形状（相关文件 diff 0）。

### 2.3 修复记录先于代码（F7）与稳定性

- mtime 顺序（B2 实测）：A′ 记录 11:59:43 < A′ test/code 12:20:03；B 记录 12:02:19 < B test 12:10:21 < B code 12:13:21。两份记录均含 F1/F2/F4/F8、缺陷/复现、写集/非目标、验证计划与依据 hash；A′ 记录在写盘时即以 `git checkout --` 方式证明干净基线（`counts-and-notes.txt`）。
- 稳定性：D1 证据 manifest before/after 逐行 diff 0、候选 hashes 与 HEAD/tree/分支不变；B2 在全部核查（含独立复跑确定性测试与 typecheck）前后再次复算：HEAD/tree/分支、4 文件哈希、聚合 `bf127456…`、manifest `4958207f…`、暂存 0 全部不变；B1 文件哈希不变（`682539ba…`）。

## 3. 原件抽查（B2 实地复核）

### 3.1 A′ 决策快照（`decision-3755…`，真实运行 S1）

- 证据副本 `2026-11-09_RR4_evidence/attempt-s1/snapshots/decision-3755042aea965a2b4b9bdbf565c80b0ec49f96911e43441cd7979512260bd3d4.json`：**49,788 bytes / 文件 SHA-256 `5176128c1c99c863037a0d59b436e1121ad2bd25a88688a9898fde941eb37179`**；与 S1 target 盘上同名快照文件逐字节一致（哈希相同）。
- 快照内部：schema `complete-snapshot/v1`；`snapshotId=decision-<digest>`；`digest` 按 `completeSnapshotDigest(files)` 独立复算 = `3755042a…b4d4`（一致）；6 files（5 个真实文档 + 1 个嵌入 `.ans/decision-input/22b59a43….json`）；逐文件 `bytesBase64` 解码后的 SHA-256 与记录哈希**全部一致**；5 个真实文档与 target 盘上实际字节哈希**逐一致**（contracts `20157fa9…`、product `ae80808b…`、modules `824371eb…`、proposal `3a976464…`、roster `e745283f…`）；嵌入文件的 sha256 与其内容摘要同名（`22b59a43…`，未落盘）。
- **prepare 未写 run manifest**：`run-hub-4b3e91d59ae3c59f5b3c8943c7b84bbd5341f3b6eb22f0eb/manifest.json` 为 `state:"draft"`、`documents:{}`、`execution:{teamPlan:null,flow:null}`，`updatedAt` 与 `createdAt` 同为 05:05:03.907Z（此后未改写）。
- 快照 `decision-a360…` 的 `createdAt` 为 03:05:50.901Z（缺陷运行期既有快照，随 target 副本带入），**不是**本次 S1 产物；S2 target 的 snapshots 目录仍为该 4 个既有文件、无新 decision 快照。

### 3.2 S1 生命周期与回执（`req-303944cb359e95cd`）

- `request.created`（05:05:16.146Z，cardKind proposal、taskId `t-mw8srveh-e875be9e`、sourceRoleId rapporteur）→ `request.presented`（05:05:16.215Z，`to:"customer"`，恰 1 次）→ `request.resolved`（05:06:27.390Z）：`by:"customer"`、`operatorId:"51054"`、`choice:"accept"`、`selectedOptionIds:["accept"]`、`decisionId:"decision-req-303944cb359e95cd"`。
- 工具入参（rapporteur 原件）：taskId 精确无 `#`；工具回执 `ok:true`：`request_choice：客户已选择（操作者：51054）：accept（接受）… decisionId：decision-req-303944cb359e95cd`。
- 诊断原件：`interaction.presented`（05:05:16.215Z，pendingCount:1）；`interaction.response.end`（05:06:27.389Z，`ok:true`、pendingCount:0）；目标卡 `chief-decision.failed` 仅 **execution** 阶段 1 条（05:05:16.213Z，judge 工具面错误），**无 materials/binding 失败**。
- 全 RR4 证据目录检索「通道未受理」：**0 命中**。截图 `ui-s1-pre.jpeg` / `ui-s1-resolved.jpeg` 经 B2 目视复核：真实 UI 提案卡（proposal 徽标、接受/退修）→ 接受后系统行「已裁决 … accept」，无错误行。
- 流程继续：`task.reported{status:"done"}`（05:06:32.206Z）、chief `report.received`、`delivery.start`（rapporteur 05:06:32.259Z / chief handback 05:06:36.270Z）；提案接受后的冻结/pin 门未在 10s 证据窗内到达（按授权预算 halt）。

### 3.3 S2 fail-closed（真实触发，attempt-2）

- 新请求 `req-9e3f62209fa96bfc`、`req-e2f2d77530f7817c`：账本仅 `request.created → request.notified → request.resolved`，**无任何 `request.presented`**（全账本 6 条 presented 均属历史旧请求）。
- `request.resolved`：`choice:"declined"`、`by:"customer"`（既有 lifecycle 约定/D4(a)）、`reason` 含真实 prepare 错误原文（`Task/request/run binding differs from the actual task creator`）；**无 operatorId / actionSource / decisionId**。
- 诊断：`chief-decision.failed`（`phase:"materials"`）逐请求在案；工具回执原文为 `cardNotPresented` 语义（「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」），含真实原因、不声称客户拒绝/同意。
- 回合不阻塞：工具回执 ~33ms 返回，rapporteur `task.reported(blocked)`（~10s 内）；无 `#decision-dialog`（`dialogs:[]`）、无新快照（`newSnapshots:[]`）、5 个 run manifest 均 `documents:{}`。
- 偏差（如实保留）：第二张卡由应用/幕僚回环再次投递同一任务触发（驱动 0 重试）；驱动自身 `ReferenceError: row is not defined` 未按设计在首果即停，应用继续 ~21s；均已记录在案。

### 3.4 隔离与零改动

- 9222：运行前 `PID 26264`、`127.0.0.1:9222 LISTENING`、命令行含 `ans-game2d-snake-run-2026-11-09/rr/launcher.mjs --remote-debugging-port=9222`（`9222-owner-pre.txt`/`port-9222-pre.txt`）；**B2 当前实测仍为同一 PID 26264、同一端口与命令行**（自 pre 采集后进程未重启）。贪吃蛇 target **75 文件逐文件 SHA-256 前后 diff 空**（attempt-2 与 S1 各一组 pre/post，均为 75 行、diff 0）。
- 9223：运行日志显示 `DevTools listening on ws://127.0.0.1:9223`；运行结束按 halt → stopSession → `Browser.close` 关闭；B2 当前实测 **无 9223 监听、无 RR4 相关 electron/node 残留进程**。
- 运行根：userData/target/脚本均在仓库外（`ans-rr4-proposal-draft-2026-11-09\`、`ans-rr4-s1-2026-11-09\`）；候选 worktree 仅 4 个在制文件。
- 限制：run 结束时刻的 9222/9223 端口探针未以文件形式归档在证据目录（RR4 记录称在 transcript）；贪吃蛇 `rr/` 运行根本身未做哈希对照（其 target 关键文件哈希已对照）。

### 3.5 基线已知红项（增量口径）

- `optional-acceptance.test.ts`：BASE-3 命令下 **6 tests / pass 2 / fail 1 / cancelled 3 / skipped 0**，`not ok 1/4/5/6` 四名在三份样本（B 基线、D1、B 最终）完全相同；文件 diff 0。
- `test/编排/**`（107 文件逐文件 TAP 汇总，B2 独立解析）：**1127 / 1103 / 22 / 0 / 2**；失败名集合与 A′ `after-failing-tests.txt` 同名同数（22/22），skip 2 项同名；`direct-role-capabilities.tap` 中决策证据既有 5 项 + A1–A5 全 pass，唯一失败为基线已知红项「Retained intent confirmation…」。
- `chief-workflow.test.ts`：run1 63/51/12、run2 63/49/14（基线 59/47/12）；新增/改写的 B 用例（W1b 改写 + B1/B2/B3-B4/B5）两轮全部 pass；超基线项均属已记录环境抖动族群且同候选隔离复跑通过；新增确定性失败 = 0、新 skip = 0。
- 只读回归：`decision-service` 20/20；`application-line` 3/3（基线 2/1 为本机抖动，未恶化）；`run-change-trigger` 9/0/9（与基线 9 个失败名逐条相同）；`pending-card-restart` 1/1。
- B2 独立复跑（只读，不改仓库）：`direct-role-capabilities.test.ts` **40/39/1/0/0**（唯一失败 = 上述基线已知红项）；`chief-workflow` 过滤复跑 B1/B2/B3-B4/B5 **4/4 pass**、W1b 真实缺材料改写用例 **1/1 pass**；`npm run typecheck` 与 `npm run typecheck:renderer` **exit 0**（D1/B 记录同结论）。

## 4. B1 逐项判定

### 4.1 基线/记录/候选（BASE-1–7）

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| BASE-1 | pass | 两份修复记录（实际路径见 §1）均写盘于对应代码/测试前（mtime 顺序见 §2.3）；记录含 F1/F2/F4/F8、缺陷/复现、A′/B 范围与验证计划、依据 hash；未被后续改写覆盖（mtime/hash 与 v1.1 附录引用一致）。命名与 v1 预期不同，v1.1 附录明确按实际路径/内容判定，统一命名交协调方确认（§6）。 |
| BASE-2 | pass | HEAD `c1439ce…`、tree `262e7ba4…`、分支 `feat/plan-escalation-card`、基线 status=0（记录在案）；公共/已知红项文件基线 hash 清单见 A′ `candidate-identity.txt`（diff 0 即基线等同）与 B `final-candidate-and-order.txt`；未跟踪文档明确排除在候选外（候选按 changedPaths/manifest 认定，`src app test` 仅 4 文件）。 |
| BASE-3 | pass | optional-acceptance 6/2/1/3（not ok 1/4/5/6）三样本一致、diff 0；v1.1 A.1 增补的 `test/编排/**` 22 fail/2 skip 在干净基线与候选上同名同数（diff 空）；`chief-workflow` 基线 59/47/12 对照成立；无新增确定性失败/新 skip。 |
| BASE-4 | pass | 恰 4 文件、逐文件 raw SHA-256、A′ 聚合与 4 文件组合聚合、manifest 1,109/`4958207f…` 均由 B2 独立复算一致；只含允许文件；optional-acceptance/只读回归文件 diff 0；运行前后稳定性快照一致（§2）。 |
| BASE-5 | pass | §0.2 全部公共契约/跨角色文件与角色卡/边界/治理/权限/验收标准 diff 0；无新依赖；无 Section 1 外文件、删除、重命名；`RunDocKind`/`request.resolved.by`/IPC 形状未动（§2.2）。 |
| BASE-6 | pass | D1/RR4 证据运行前后同一候选/manifest/聚合/树；B2 全部核查前后复算亦不变（§2.3）；无拼接旧候选/旧证据/不同环境（各层证据均绑定 `bf127456…`）。 |
| BASE-7 | pass | L1 A′（2 文件，`bb24291e…`）、L2 B（2 文件）、L3 D1 组合（4 文件，`bf127456…`）、L4 RR4 真实运行（同 4 文件聚合）分层独立、各自绑定候选；A′ 证据与 B 并发工作区改动的隔离方法已如实记录（`test/编排/` 不导入 app/desktop，前后计数只隔离 A′ 两文件）；无跨层冒充。 |

### 4.2 验收标准（AC-1–15）

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| AC-1 | pass | A1 用例（ok 27）钉住：空 refs + 盘上 flow 文档 ⇒ 成功、context 含实际字节、逐文件 sha256、`complete-snapshot/v1`、digest 可复算、`isCurrent()===true`、manifest 字节前后一致；RR4 S1 真实快照复核（§3.1）；目标来自应用事实（judge artifacts/`criteriaRef`/发现集），非模型自报。 |
| AC-2 | pass | A2 用例（ok 28）：文档变更/新版本 ⇒ 旧 `isCurrent()===false`、再次 prepare 用新字节/新 `baseDigest`、旧基底不得结算；`checkDecisionEvidence` 重读实际字节 + discovery 摘要复核（源码既有机制）。 |
| AC-3 | pass | A3 用例（ok 29）：空目标 ⇒ 仍 `Draft request target is not bound to that run`、无快照；角色自报路径（`metadata.paths`/`judge.paths`）只做 ⊆ 校验、盘上存在也不读取；越界 artifact 由既有 `invalid-project-path` 拒绝。 |
| AC-4 | pass | A4 用例（ok 30）：缺失（`Target evidence is unreadable`）、secret、超大（65,537B）、非文本、`criteriaRef.sha256` 不符均按既有分类拒绝且无快照；匹配哈希正例成功；无静默降级/伪造。 |
| AC-5 | pass | 新增 A5 用例（ok 31）证明 manifest refs 非空时权威不被绕过；既有 draft-bound 用例（ok 26）原样通过（含 `Draft run evidence drifted`）。 |
| AC-6 | pass | `apply-journal.ts` 唯一 hunk 只覆盖 draft 空 refs 段；pinned 分支源码 diff 0；pinned 既有用例（ok 25）原样通过。 |
| AC-7 | pass | 无 runId 分支源码 diff 0；既有 initial/缺失/secret/超大/发现集用例（ok 23/24/32）原样通过。 |
| AC-8 | pass | 快照经 `readSnapshot` 可读、schema `complete-snapshot/v1`、digest 独立复算一致、`files[].sha256` 与真实字节一致、`evidenceRefs` 同一 `snapshotId`、`baseDigest` 按记录公式复算；预算（≤32 文件、单文件 ≤64 KiB、总 ≤256 KiB）与 secret 检查在既有代码路径生效（A4 负例）；无伪造/截断。 |
| AC-9 | pass | B 代码 + B1 通道级/W1b 真实 SessionManager 用例（独立复跑 pass）+ RR4 S2：prepare/basis 失败且委托开启 ⇒ presenter 未调用、不写 `request.presented`、无卡面；`declined+notPresented+reason` 结算；`cardNotPresented` 回执含真实原因；回合正常继续、pending 清零、旧 id 不可重试。 |
| AC-10 | pass | B2 用例：prepare 在途关闭委托 ⇒ 既有 `chiefWaiting(modeChanged)` 恰呈现一次、迟到失败不双结算、客户可接管；`valid()` 语义未改（同时覆盖中止/revision 变化的判定条件）；无 orphan/挂起。中止分支由未改动的 `valid()`/既有结算路径保证（未单独构造真实中止样本，见 §6）。 |
| AC-11 | pass | B3/B4 用例：execution 无有效决定 ⇒ 既有 `chiefWaiting(noValidDecision)` 回退卡面不变；源码 outer catch 逻辑未改（仅增 `phase` 诊断字段）；RR4 S1 真实复现 execution 回退并成功交客户。 |
| AC-12 | pass | `respondUnsafe` 闸区段 diff 0；B3/B4 用例钉住委托开启 `manualTakeoverRequired` 非空、委托关闭后可正常结算；`decision-service` 20/20 回归。 |
| AC-13 | pass | reason 非空且含真实 prepare 错误原文（B1/B5 用例 + S2 账本/回执）；诊断 `chief-decision.failed` 保留（requestId、`phase`、原始 error）；`request.resolved` 为 `choice:"declined"` + reason、**无 operatorId/actionSource**、不以 `judge:`/`directive:`/`system:` 前缀；回执/账本不声称客户拒绝或同意；不以「通道未受理」代替原因。披露：`stage` 键不在诊断落盘白名单，实际以既有白名单键 `phase` 落盘（B 记录与 EVIDENCE-INDEX 已披露，语义可区分 materials/execution）。 |
| AC-14 | pass | RR4 S1（§3.2）：全新 draft run → proposal 卡真实呈现（presented.to=customer）→ 客户接受（委托关闭，既有 respond 语义）→ `by:"customer"`/operatorId 51054/decisionId、工具回执成功、账本/快照/manifest 一致 → 流程继续（task.reported done、下一投递开始）。限制：冻结/pin 下一门未在证据窗内到达（按预算 halt，§6）；materials 失败变体见 AC-9。 |
| AC-15 | pass | §3.5：pinned/intent/客户决策回归套件按基线对照通过、无新增确定性失败/新 skip；`npm run typecheck` exit 0（B2 独立复跑）；公共契约 diff 0；旧断言改写逐条记录（B 证据 §5，6 条）。 |

### 4.3 测试矩阵（A1–A7 / B1–B5）

| # | Owner | 判定 | 依据/证据 |
| --- | --- | --- | --- |
| A1 | 编排 | pass | 用例 ok 27（新增）；内容见 AC-1/§3.1。 |
| A2 | 编排 | pass | 用例 ok 28（新增）；内容见 AC-2。 |
| A3 | 编排 | pass | 用例 ok 29（新增）；内容见 AC-3。 |
| A4 | 编排 | pass | 用例 ok 30（新增）；内容见 AC-4。 |
| A5 | 编排 | pass | 新增用例 ok 31 + 既有用例 ok 26；内容见 AC-5。 |
| A6 | 编排 | pass | pinned 既有用例 ok 25 原样通过；分支源码 diff 0。 |
| A7 | 编排 | pass | 无 runId 既有用例 ok 23/24/32 原样通过；分支源码 diff 0。 |
| B1 | 桌面窗口 | pass | 真实 SessionManager 改写用例（独立复跑 1/1）+ 通道级 B1 用例（ok）+ RR4 S2；内容见 AC-9。 |
| B2 | 桌面窗口 | pass | 通道级 B2 用例（ok，独立复跑含在 4/4 中）；内容见 AC-10。 |
| B3 | 桌面窗口 | pass | B3/B4 用例（ok）：execution 回退不变。 |
| B4 | 桌面窗口 | pass | B3/B4 用例（ok）：respond 闸与非空文案；关闭后可结算。 |
| B5 | 桌面窗口 | pass | B5 用例（ok）：原因非空/如实、空错误回落既有指引、不以回退文案代替。 |

### 4.4 证据与检查（EV1–6）

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| EV1 | pass | BASE-1–7 全部证据齐备（§1–§2）；修复记录先于代码；候选只含允许文件；公共契约 diff 0；候选/manifest/聚合/树稳定；已知红项逐条对照（§3.5）。 |
| EV2 | pass | AC-1–8、A1–A7 证据：真实项目字节/快照/哈希/`isCurrent` 全链可复核（A1–A5 用例 + RR4 快照独立复算）；pinned/无 runId 分支 diff 0。 |
| EV3 | pass | AC-9–13、B1–B5 证据：presenter/`request.presented`/settlement/回执/诊断/回合继续全链（真实 SessionManager + 通道级 + 真实运行）；无伪造。 |
| EV4 | pass | AC-14：真实 Electron/Service/SessionManager 集成（S1）；`by`/`presented.to`/账本/快照/manifest 一致。 |
| EV5 | pass | AC-15：逐文件测试计数/退出/日志 hash（D1 证据 134/134 校验通过）；typecheck 0；无新增确定性失败/新 skip；旧断言改写逐条记录。 |
| EV6 | pass | RR-1–RR-8（§4.5）：预算/纪律/隔离/证据/如实性；9222 零改动与 9223 释放（含 B2 当前实测）；失败/回退如实报告（§3、§6）。 |

### 4.5 真实运行（RR-1–RR-8）

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| RR-1 | pass | 真实 Electron（外部 launcher 仅 `app.setPath("userData")` 后 import 本候选 worktree `app/main.ts`）、真实 Claude（两会话 `runtime:"claude"`，native session 原件在案）、真实渲染 UI；隔离 userData、CDP 仅 9223、仓库外全新目标项目；候选 HEAD/聚合、入口、userData/目标路径、端口均记录（§3）。 |
| RR-2 | pass | S1（§3.1–3.2）：draft 提案卡成功承载并结算；`by`/`presented.to` 与实际来源一致；流程继续；首个决定性结果后按授权窗口停止。执行期 judge 工具面失败走既有 execution 回退（如实披露）。 |
| RR-3 | pass | S2 真实触发（§3.3）：无 presented、`declined`+真实 reason、`cardNotPresented` 回执、无卡面、回合不阻塞；同时有 B1/B5 确定性覆盖。 |
| RR-4 | pass | pinned/intent/客户手批路径回归由 D1 只读套件覆盖（decision-service 20/20 等），与本修复写集无关路径 diff 0；RR-4 允许只读对照。S1 中客户手批（委托关闭）路径亦真实走过。 |
| RR-5 | pass（附披露） | S1 授权运行：客户消息 1、提案卡 1、墙钟 ≈1m54s、首果即停、0 自动重试、0 非本缺陷卡。attempt-2 偏差：提案卡 2（应用/首席回环二次投递，非驱动重试）、驱动 `ReferenceError` 致首果未即停（继续 ~21s）——均已如实保留；详见 §6。 |
| RR-6 | pass（附限制） | 9222 前态 PID 26264/端口/命令行在案，B2 当前实测同 PID/命令行；target 75 文件 pre/post diff 空（两次运行）；9223 无监听/无残留；运行根/userData/目标/证据路径记录。限制：run 结束时端口探针未归档为文件（记录称 transcript）、贪吃蛇 `rr/` 根未做哈希对照（§3.4、§6）。 |
| RR-7 | pass（附披露） | 诊断原件、`tasks.jsonl` 生命周期、run manifest、decision 快照、截图、CDP 9223 驱动日志齐备；S2 materials 失败证明未呈现；S1 目标卡无 materials/binding 失败、execution 阶段失败如实披露（RR-2 允许回退路径）；无伪造、无宣称未发生结果。 |
| RR-8 | pass | RR4 记录身份 231 行 / 31,494 bytes / `e561c38e…`（B2 实测一致）；真实环境/隔离/证据/by 与 presented.to 一致/9222 零改动/9223 释放/如实报告失败与回退均满足（具体见 RR-1–RR-7）。 |

## 5. 统计

| 组 | 项数 | pass | fail | insufficient evidence | not applicable |
| --- | --- | --- | --- | --- | --- |
| BASE-1–7 | 7 | 7 | 0 | 0 | 0 |
| AC-1–15 | 15 | 15 | 0 | 0 | 0 |
| A1–A7 / B1–B5 | 12 | 12 | 0 | 0 | 0 |
| EV1–6 | 6 | 6 | 0 | 0 | 0 |
| RR-1–8 | 8 | 8 | 0 | 0 | 0 |
| **合计** | **48** | **48** | **0** | **0** | **0** |

- 非 pass 项：**无**。
- 已知红项：`optional-acceptance`（4 项未通过）、`test/编排/**`（22 fail/2 skip）、`run-change-trigger`（9 fail）均为基线既有、diff 0、未恶化；未用于求绿，未修改。

## 6. 限制、披露与关闭条件（不改变 pass；供协调方知悉/确认）

1. **S1 执行期 judge 工具面错误（既有 execution 回退）**：05:05:16.213Z `chief-decision.failed`（phase=execution，`Claude 判断会话只接受 shell 或治理 judge 的只读三件套…`）——非 materials、非本修复写集；由既有 execution 回退交客户，属 AC-11/RR-2 允许路径。该问题是否另行修复不在本 B1 范围。
2. **下一真实门未到达**：提案接受后 10 秒证据窗内未到达冻结/pin 门（按授权预算 halt）。已观察 `task.reported done`、chief `report.received`、`delivery.start`（流程继续）；完整闭环/下一门需另行授权运行。
3. **attempt-2 预算偏差**：提案卡 2（>1；应用/首席回环在 blocked 报告后再次投递同一任务；驱动 0 重试）、驱动 `ReferenceError: row is not defined` 致首果未即停（应用继续 ~21s）。已如实保留；协调方放行的 S1 修正运行执行了严格预算（1 消息/1 卡/≈1m54s/首果即停）并作为验收样本；未发现隐藏重试或未报告调用。
4. **9222/9223 归档限制**：运行结束时刻的端口/进程探针未以文件归档在证据目录（记录称在 transcript）；B2 当前实测 9222 仍为 PID 26264、同一命令行，无 9223 监听、无 RR4 残留进程；贪吃蛇 target 75 文件哈希前后一致；`rr/` 运行根未做哈希对照。若协调方要求归档级 post 证明，可补一次只读端口/进程快照（不影响本判定）。
5. **修复记录命名偏差**：v1 预期 `…_fix_proposal-card-run-binding.md`；实际为 A′ `…_fix_proposal-draft-run-evidence-binding.md`、B `…_fix_proposal-card-fail-closed-presentation.md`。按 v1.1 附录 A「以实际路径与内容覆盖判定；是否统一命名由协调方确认」，本 B2 判 pass；**关闭条件：协调方确认接受实际命名**（不建议事后重命名——会改变已引用的 hash/mtime 证据链）。
6. **诊断 `stage` 键**：`src/common/shared/diagnostics.ts` 白名单不含 `stage`（该文件在 `src/`，不在 B 写集）；实现以既有白名单键 `phase` 落盘（materials/execution 可区分），事件名/requestId/原始 error 均保留。**关闭条件：协调方确认该适配满足 AC-13 的可区分性意图**（若要逐字 `stage` 落盘须另开写集迭代）。
7. **A′ 证据计数笔误**：`counts-and-notes.txt` 记 `direct-role-capabilities.test.ts` 为 +124/−2，实际 `git diff --numstat` 为 **+122/−2**（D1 记录同为 +122/−2）；不影响文件 hash、聚合、测试计数与失败集合结论。
8. **A′ 证据并发环境**：A′ before/after 采集期间 B 的并发在制改动在同一 worktree；`counts-and-notes.txt` 已如实披露，且 `test/编排/` 不导入 `app/desktop/**`（已核实），A′ 前后差异以临时还原/恢复两文件隔离——不影响 L1 证据归属（BASE-7）。
9. **真实运行覆盖边界**：只承诺本候选/本机/本次输入下的证据；不宣称完整闭环、长期稳定性或发布就绪；pinned/intent 真实路径未单独复跑（回归由只读套件覆盖）。
10. **B2 自身复跑**：B2 仅执行确定性测试子集与 typecheck（只读）；未重跑完整 `test/编排/**`、未重跑全量 `chief-workflow`、未运行真实模型/Electron；D1/RR4 原始证据以文件哈希完整性校验 + 原件抽查为准。
11. **授权边界**：本 B2 不授权提交/推送/合并/发布；不判方案质量，不改变任何角色卡/边界/B1/测试/代码。

## 7. 状态

- **B2 判定：pass（48/48；附 §6 限制与披露）。** 判定仅对候选 HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd` + 4 文件（聚合 `bf12745676901055ccfcb98e3578205465c88a3ef8293faa91827dc5beb80986`）有效；候选/环境/命令/输入变化使本判定失效。
- 本报告只写 `docs/acceptance/`；未改代码/测试/方案/角色卡/边界/B1；未提交/推送/合并/发布；报告自身行数/字节/SHA-256 由外部身份记录（见回报）。
