# 变更记录：D1 跨角色集成验证（2026-11-08）

- 任务节点：**D1 确定性验证**（团队计划 §5.1/§5.5；派发记录 `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §三/§五）
- 角色：测试（独立上下文；只取证，不判验收）
- 日期：2026-11-08（12:17–12:35 本地）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 纪律：只写 `test/测试/`（新增 D1 集成测试）与 `角色卡/测试/docs/change/`（本记录与证据目录）；未修改产品源码/其他测试/角色卡/边界/方案/验收/沟通/调度；未 commit/push/暂存/合并/发布；未运行真实模型；未删除/放宽断言、未新增 skip、未使用 `--test-force-exit`。
- 本记录是**证据事实**，不是验收判定；D1 出口由统筹/独立验收按 B1 v1 判定。

## 0. 结论摘要（先读）

1. **D1 新增跨角色集成测试 2 文件 9 例全部通过**（`test/测试/session-admission-approval-integration.test.ts` 8 例 + `test/测试/session-admission-approval-q9-integration.test.ts` 1 例）；覆盖派发要求 1–7 项，含 AC-26 实测既有拒绝码 **`git-native-surface-unproven`**（零 ref/journal/工作树副作用）。
2. **D1 未能成立「新增确定性失败 = 0」**：受影响套件对照发现 **1 个本变更新增确定性失败**——
   `test/项目管理/shared/i18n-guard.test.ts`「硬编码守卫：allowlist 之外不得出现中文」被
   `app/renderer/src/chat/judge.ts:106:32` 的硬编码「前台命令」触发（W5-U 渲染层改动；W5-U 受影响套件不含本守卫）。
   独立复跑与 shared 套件复跑均稳定复现（1 violation；`scanned=146 allowlisted=23`）。
3. 其余所有受影响套件与各 W 批 evidence 的实施后基线**逐项一致**（计数与失败名集合；见 §4/§5）；**新增 skip = 0**；静态门 `typecheck`/`typecheck:renderer`/`build:renderer` 均 exit 0。
4. **按指令在发现产品缺陷处停止**：本角色**未修改任何产品/测试文件**、未自行修复；缺陷交回 owner（W5-U／桌面UI；若选择 i18n key 方案可能涉及 shared-code 目录，由统筹/接口评审决定）。**RR 未执行**（候选将因修复变更，RR 证据会失效；见 §8）。

## 1. 输入（开工实测）

| 输入 | 实测（SHA-256 / 行数） |
| --- | --- |
| 派发与 I0 记录 | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`：`19103fa206d554fa73f8c3a02356a0554fc409096658140716db39f6becdebb4`；86 行 |
| 设计（P1.3） | `docs/planning/2026-11-08_design_session-admission-approval-based.md`：`2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`；855 行 |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`：`fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`；185 行 |
| 官方回归参照（上一变更 E3 T3，订正版） | `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`：`d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`；326 行；计数 4,872/4,641/198/1/32 |
| W 批证据（对照基线） | W1 `460bef86…`、W3-G `c593ea51…`、W2+W4 `86db4eed…`、W1b/W2b/W3b `0628ad93…`（含 Amendment-1）、W5-D `ddc81a33…`、W5-U `f5e35c50…`（均在对应角色 `docs/change/`） |

## 2. 候选身份与稳定性

- HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`（tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`），分支 `feat/plan-escalation-card`；暂存 0；开工 `git status --porcelain` 257 行（12:17:16）。
- **D1 被测候选 = W1–W5 落树后的工作树**：对 W evidence 公布的 17 个候选文件逐一复算 SHA-256，**17/17 MATCH**（`16-candidate-identity-vs-W-evidence.log`）：`shell-approval-binding.ts`、`classify-shell.ts`、`shell-write-guard.ts`、`shell-rules.ts`、`model/runtime.ts`、`service/runtime/session.ts`、`tools.ts`、`schema.ts`、`shell-audit.ts`、`shell-gate.ts`（Amendment-1）、`shell-arming.ts`、`run-role.ts`、`git-command.ts`、`trunk-store.ts`、`operator-channel.ts`、`judge.ts`、`ConfirmCard.tsx`。
- T1 只读三文件哈希与 B0 一致（`afe70c62…`/`f0db260e…`/`358ac967…`），未修改、不计入本变更候选。
- D1 新增测试文件：
  | 文件 | 行数 / 字节 | SHA-256 |
  | --- | --- | --- |
  | `test/测试/session-admission-approval-integration.test.ts` | 733 / 41,861 | `34582aae4adbbe53c11265dd4474f42371e6378837305ae56b9bea3f2602af89` |
  | `test/测试/session-admission-approval-q9-integration.test.ts` | 154 / 9,033 | `1b2441f2148450863f948dda394574793f4f68131f368dc3731c056dc11e10a5` |
- 稳定性：D1 全部套件运行前后 `git status --porcelain -- src app test` **逐行一致**（SCOPE-IDENTICAL；`21b-scope-status-closing.txt` 对照 `01b-scope-status-opening.txt`）；运行后复算的 W 候选哈希仍 17/17 MATCH → 套件运行未改动产品/测试源码。

## 3. D1 新增测试与覆盖映射（派发要求 1–7）

| # | 派发要求 | D1 用例 |
| --- | --- | --- |
| 1 | 受保护 + shell + 真实 `assemble*`/`createShellGate` + file sink：prepareRole observed+token、bindPreparedRole 成功、`session.open.ready`、plan.approvalChain、appTools 含 shell | `D1-1`：真实 `openRoleSession`（项目角色 worker、Codex 默认工厂、真实 `assembleProjectShellGate`、真实 file sink）→ diagnostics 实测 `session.open.start`/`session.open.ready`；另在同一真实装配上 `prepareRole` observed+token、`approvalChain{mode:"rules-advisory", audit:{file,durable,probe ok}, projectRoot}`、`bindPreparedRole` 成功且 appTools 含 `run_shell`/`start_background_task`；`probe` 为纯判定（不建目录） |
| 2 | 负例：无 binding ⇒ unproven（不构造适配器/不发请求/不执行）；审计不可用 ⇒ audit-unavailable；custom/demo/unknown 仍拒 | `D1-2`（裸函数 gate：plan unknown+`protected-scope-approval-chain-unproven`；gate 零调用；`bindRole`/`composeContext` 拒绝 `runtime-protected-scope-requires-verified-plan`；`openRoleSession` 端到端抛 `runtime-creation-admission-unproven:protected-scope-approval-chain-unproven`，bind 未尝试、无 `session.open.ready`）；`D1-3`（memory/custom/无 probe/真实 file sink 被边界拒 ⇒ 均 `protected-scope-audit-unavailable`，无 token、无 approvalChain）；`D1-4`（demo ⇒ `protected-scope-default-native-plan-required`；custom factory ⇒ `custom-override`+两份既有 reason；unknown scope ⇒ `runtime-protection-scope-unknown` 且 bind 拒绝） |
| 3 | run_shell/start_background_task 端到端（桩执行）：allow/deny/timeout、entry 区分、拒绝/超时零执行；只读 Git 经注入能力 match+execute（stub）不 spawn；能力缺席/未命中 ⇒ `readonly-git-runner-unavailable`；非 git 正常 spawn | `D1-5`（真实 createShellGate 审批档：allow ⇒ 恰 1 次 spawn；deny/timeout ⇒ 0 spawn；entry=run_shell/start_background_task 原样进入审核；后台 allow 才 start、deny 不 start）；`D1-6`（真实 gate + 注入 `{match: matchReadonlyGit, execute: stub}`：`git status` ⇒ execute 恰一次、0 spawn、budgets 透传；能力缺席/未命中（含 `git commit`）⇒ `readonly-git-runner-unavailable`、0 spawn、0 execute；真实 gate 对裸 Git 写 c=deny；非 git `node --version` 正常 spawn 1 次） |
| 4 | writeGuard 注入：接 (a) 装配路径携带 writeGuard；advisory/operatorOnly 下 git commit 被 writeGuard deny；只读档不接 (a)、c=deny 终结 | `D1-7`（真实 `assembleOperatorShellGate`/`assembleProjectShellGate` + 真实 `evaluateShellWriteTargets` 守卫：`git commit`/`git push` 均 deny 且 (a) 零调用、审计 branch=`write-guard:deny`；只读档 `git status` 放行、`git commit` c=deny 终结；run-role 源码断言两条接 (a) 路径均注入 writeGuard、只读档不注入、`auditFailurePolicy` 两处按受保护状态传 `deny-non-readonly`） |
| 5 | Q9 AC-26：受保护 + shell + `git_candidate commit/init` ⇒ 既有拒绝、无副作用 | `D1-Q9`（真实 chief+convener Codex Core/managed 会话 + 真实 host inventory + 真实 trunk 账本/初始化源，驱动真实 `createGitRoleRuntime().gitCandidate(init)`）⇒ `status:"blocked"`、**code=`git-native-surface-unproven`**（AC-26 指定码之一）；无 `.git`、无 `.ans/trunk/operations/<op>`、无 trunk refs |
| 6 | PR #72 回归 | `D1-8`（含 shell 会话 strict `inspectToolSurface().status === "unknown"`；`composeRuntimeApplicationMediation` 语义不变：严格 unknown + 应用面 observed ⇒ verified/`application-mediated-unknown-native`；`trunk-runtime.ts`/`run-role.ts` 零 `applicationMediation` 引用、`trunk-runtime.ts` 零 `approvalChain` 引用；approvalChain 仅在 `prepareRole` 准入段消费）；另有专项复跑 `test/编排/trunk-dispatch-parent.test.ts` + `test/runtime-core/application-mediation.test.ts` + `test/测试/runtime-dispatch-gate-integration.test.ts` ⇒ **37/37 pass** |
| 7 | 升级/后台边界（AC-9/AC-21/AC-22）与既有 shell 回归 | `D1-7` 覆盖 AC-22（后台入口 `git status` 被 writeGuard deny）；`D1-5` 覆盖 AC-21 后台 allow/deny/timeout 与零执行；**AC-9（升级链）复用既有 `test/编排/shell-escalation.test.ts`（59/59 pass）** 与 `shell-judge.test.ts`（34/34 pass），D1 不重复实现 |

## 4. 受影响套件结果（命令 / 计数 / 与基线对照）

命令均为 `node --test <glob|显式文件>`（Node v24.22.1，Windows 11 Pro 10.0.26300，cwd=仓库根）；原始日志在证据 `logs/`。

| 套件 | 结果（tests/pass/fail/cancelled/skipped/todo） | exit | 基线参照 | 判定 |
| --- | --- | --- | --- | --- |
| `test/项目管理/shared/**` | **218 / 212 / 1 / 0 / 5 / 0** | 1 | W1 实施后 218/213/0/0/5 | **新增确定性失败 1**（§6） |
| `test/门禁引擎/**` | 449 / 443 / 5 / 0 / 1 / 0 | 1 | W3-G 实施后 449/443/5/1 | 同名同数（5 个既有红逐名一致） |
| `test/runtime-core/**` | 523 / 486 / 33 / 0 / 4 / 0 | 1 | W2+W4 实施后 523/486/33/0/4 | 同名同数（33 个既有失败逐名一致） |
| `test/编排/**` | 1,093 / 1,069 / 22 / 0 / 2 / 0 | 1 | W1b+W2b+W3b 修订后 1093/1069/22/2 | 同名同数（= B0 24 条减去 shell-readonly/shell-gate 两个已转绿既有红） |
| 桌面受影响四文件（operator-channel/shell-escalation/diagnostics/multi-runtime） | 128 / 119 / 9 / 0 / 0 / 0 | 1 | W5-D 实施后 128/119/9/0/0 | 同名同数（9 个既有红；仅 W5-D 记录的 markdown 加粗符差异） |
| `test/桌面UI/**` | 443 / 443 / 0 / 0 / 0 / 0 | 0 | W5-U 实施后 443/443/0/0/0 | 一致 |
| `test/测试/**`（100 文件，**排除登记挂起 `customer-authorization-plane-integration.test.ts`**） | **670 / 612 / 39 / 1 / 18 / 0** | 1 | E3 参照分解：既有 98 文件 = 661/603/39/1/18（E3 的 653/594/40/1/18 + e-pi 崩溃补全 +8/+9/−1）+ D1 新增 9/9 | 无新增失败/新增 skip（`turn-watch/b-last-resort` cancelled 1 与 B0/E3 同） |
| D1 新增集成（2 文件） | 9 / 9 / 0 / 0 / 0 / 0 | 0 | — | 全过 |

- **新增 skip = 0**：各套件 skipped 与基线一致（shared 5 / gate 1 / runtime-core 4 / 编排 2 / test/测试 18；桌面与桌面UI 0）。
- 静态门：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0（仅既有 Vite chunk/动态导入提示）。
- 失败名逐条清单：证据 `11-failing-names-by-suite.txt`；名集合对照：证据 `17-name-set-comparisons.log`（gate 与 W3-G 逐名一致、runtime-core 与 W2 逐名一致、编排/test-role/desktop 见上表）。

## 5. 失败/skip 逐条对照（相对基线）

1. **shared（唯一 delta，阻断）**：新增失败 1 = `test/项目管理/shared/i18n-guard.test.ts`「硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）」；违规 `app/renderer/src/chat/judge.ts:106:32 前台命令`。独立复跑（`logs/isolated-i18n-guard-rerun.log`）：6 tests / 5 pass / 1 fail，`[i18n-guard] scanned=146 allowlisted=23 violations=1`；shared 套件复跑（`logs/suite-shared-rerun.log`）：218/212/1/5 —— **确定性复现**。
2. 其余套件失败集合与基线同名同数：门禁 5（W3-G 列出的 5 个既有红逐名一致）；runtime-core 33（W2 证据 §5.3 的 33 个名称逐名一致）；编排 22（相对 B0 的 24：`shell-readonly`「只读档集成…」与 `shell-gate`「readonly 裁定 A…」两条**既有红已按设计转绿**，余 22 条同名同数）；桌面 9（W5-D 名单一致）；test/测试 39 fail + 1 cancelled（与 B0/E3 同名；唯一文本差异为 turn-watch 在 spec 输出以 `✖` 显示但 summary 计 cancelled —— 与 B0/E3 口径相同）。
3. skip：31 条打印名 + 1 条源内条件跳过（pi-adapter session-persistence），与基线一致；无新增/消失。

## 6. 新增确定性失败（阻断项；交回 owner）

- **文件/测试**：`test/项目管理/shared/i18n-guard.test.ts`「硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）」。
- **根因**：`app/renderer/src/chat/judge.ts:106`（W5-U 新增 `shellConfirmEntryLabel`）返回硬编码中文 `"前台命令"`（`locale === "zh-CN" ? "前台命令" : "Foreground command"`）；i18n 守卫扫描 `app/renderer/src/**`（去注释后中文必须为 0，除非在 `i18n-guard-allowlist.ts`），该串不在 allowlist。
- **归属**：W5-U（桌面UI，`judge.ts` 写者）；W5-U 自证证据 §验证 只跑了 `test/桌面UI/**`，未跑 shared i18n 守卫，故未发现。处置方向由统筹/接口评审定：①改 i18n key（`src/common/shared/i18n/` 由 shared-code 维护，桌面UI 消费）或 ②由其 owner 更新 allowlist（`test/项目管理/shared/i18n-guard-allowlist.ts`）——**均不在测试角色写集，本角色未改动任何文件**。
- **影响**：D1 出口「新增确定性失败 = 0」不成立；候选将变更 → 受影响证据需重取。
- **披露**：本失败为**本变更引入**（W5-U 落树前 shared 套件 0 fail，W1 证据 §5）；不是 B0/checkpoint 既有事实。

## 7. PR #72 回归

- 专项复跑：`test/编排/trunk-dispatch-parent.test.ts`（19）+ `test/runtime-core/application-mediation.test.ts`（8）+ `test/测试/runtime-dispatch-gate-integration.test.ts`（10）= **37/37 pass、exit 0**（`logs/targeted-pr72-regression.log`）。
- `D1-1`/`D1-8`/`D1-Q9` 断言含 shell 会话 strict `inspectToolSurface().status === "unknown"`；`composeRuntimeApplicationMediation` 受限路径 verified；`run-role.ts`/`trunk-runtime.ts` 零 `applicationMediation` 引用（写/发布门不消费应用中介证据）；`trunk-runtime.ts` 零 `approvalChain` 引用（新证据只进创建准入）。

## 8. RR 真实运行（未执行；按指令停止）

- **状态：未执行**。原因：D1 已发现**本变更引入的确定性产品缺陷**（§6），按派发指令「若发现产品缺陷，停止并回报（交回 owner）」停止；候选将因修复变化，RR 证据按 B1-EV1/复判规则会失效，故不在缺陷候选上消耗真实运行预算。
- 建议顺序：owner 修复 → 重取受影响证据（至少 shared 套件 + 受影响套件对照 + typecheck/渲染门）→ 统筹冻结新候选 → 再执行 RR（预算与纪律按 P1.3 §6.2 / B1-EV5）。
- 本角色未做任何 RR 环境操作（未读/打印 `.env`、未启动 Electron/CDP、未调用真实模型）。

## 9. 限制与披露

1. 本记录只证明所运行命令在这些套件/夹具上的观察；未运行真实模型（RR 未执行）、未启动 Electron/CDP、未做全量 T3（E3 阶段）。
2. `test/测试/**` 套件按登记**排除**挂起文件 `test/测试/customer-authorization-plane-integration.test.ts`（B0/E3 既有挂起，未运行、不计通过）；其余 5 个登记挂起不在本套件。
3. D1 集成测试的执行面全部为桩件（gate 判定 + 桩命令/桩后台管理器/stub readonlyGit execute）；真实件为装配（assemble*/createShellGate/binding/file sink probe）、Service 准入、工具层路由、门禁引擎 matcher/写守卫。未真跑被审批的 shell 命令。
4. AC-26 在本夹具实测命中的是 `git-native-surface-unproven` 分支（含 shell 的 Codex 条目使 strict surface unknown）；`git-core-creation-proof-unavailable` 分支需更深/不同形状的真实场景，留给 E3/Q9 场景补证（本记录不宣称已覆盖该分支）。
5. 候选哈希 17/17 MATCH 仅覆盖 W evidence 公布的文件；未公布哈希的其余工作树文件未逐一对照（以 `git status`/scope 稳定性与 T1 哈希控制）。
6. 本角色未修改 `i18n-guard` 的判据/allowlist，未修改 W5-U 文件，未以任何方式「修绿」；该失败保持红。

## 10. 纪律声明

- 只写 `test/测试/`（新增两文件）与本记录/证据目录；未修改 `src/`、`app/`、其他测试目录、角色卡/边界/YAML、构建配置、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`。
- 未 commit/push/暂存/合并/发布；未执行 `npm install`；未删除/放宽断言、未加 skip、未用 `--test-force-exit`。
- 运行前后 `src app test` scope status 逐行一致（SCOPE-IDENTICAL）；W 候选哈希运行后仍 17/17 MATCH。

## 11. 证据索引（`2026-11-08_D1_cross-role-integration-evidence/`）

| 文件 | 说明 |
| --- | --- |
| `00-opening-state.log` / `01-git-status-opening.txt` / `01b-scope-status-opening.txt` | 开工环境/状态 |
| `05-test-suite-files-excluding-hang.txt` | `test/测试` 显式文件集（100 文件，排除登记挂起） |
| `10-suite-results.tsv` | 套件结果与基线对照表 |
| `11-failing-names-by-suite.txt` | 各套件失败名逐条（去重） |
| `12-new-failures-vs-baseline.txt` | 新增失败（shared/i18n-guard）与证据 |
| `13-skips-by-suite.tsv` | 各套件 skip 计数（无新增） |
| `14-static-gates.txt` | typecheck / typecheck:renderer / build:renderer |
| `15-root-cause-i18n-guard.txt` | 违规行原文、守卫输出、文件哈希、W5-U 证据引用 |
| `16-candidate-identity-vs-W-evidence.log` | 17 个候选文件 SHA-256 与 W evidence 对照（17/17 MATCH） |
| `17-name-set-comparisons.log` | gate/runtime-core/编排/desktop/test-role 名集合对照 |
| `20-closing-state.log` / `21-git-status-closing.txt` / `21b-scope-status-closing.txt` | 收工状态；scope 与开工逐行一致 |
| `22-d1-test-files.log` / `23-t1-hashes.log` | D1 新增测试文件与 T1 哈希 |
| `logs/` | 原始日志：d1-integration、各套件、复跑、静态门、PR#72 专项 |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

- 证据索引 `evidence-index.md`：SHA-256 `9ecbae5c7d43024b0fb0a3343171a3d5771e0169b23ac639b783a446283c3e9f`（64 行 / 7118 bytes；58 个文件；含修复复验 post-fix-logs）。

---

## D1 修复复验（2026-11-08，修复后候选）

> 本节按统筹修复通知重取 D1 证据；**取代 §0 第 2–4 项与 §6 的阻断结论**（阻断项已关闭）。原始日志在 `post-fix-logs/`。

### R1. 修复内容（由 owner 执行，本角色只复验）

| 文件 | 变更 | 归属 |
| --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | `shellConfirmEntryLabel` 改用 `translate(locale, "ui.judge.entryForeground")`（不再硬编码中文） | 桌面UI（W5-U） |
| `src/common/shared/i18n/messages/zh-CN.ts` / `en-US.ts` | 新增成对 key `ui.judge.entryForeground`（「前台命令」/「Foreground command」） | shared-code |
| `test/项目管理/shared/i18n.test.ts` | i18n 计数同步（1212/1917 口径） | shared-code |

本角色未修改上述任何文件。

### R2. 复验计数（修复后候选；命令同 §4）

| 套件 | tests/pass/fail/cancelled/skipped/todo | exit | 判定 |
| --- | --- | --- | --- |
| D1 新增集成（2 文件） | 9 / 9 / 0 / 0 / 0 / 0 | 0 | 全过 |
| `test/项目管理/shared/**` | **218 / 213 / 0 / 0 / 5 / 0** | **0** | **修复生效：新增失败 0**（与 W1 基线一致） |
| `test/门禁引擎/**` | 449 / 443 / 5 / 0 / 1 / 0 | 1 | 同名同数（5 个既有红逐名一致） |
| `test/runtime-core/**` | 523 / 486 / 33 / 0 / 4 / 0 | 1 | 同名同数（33 个既有失败逐名一致） |
| `test/编排/**` | 首跑 1081 / 1055 / 24 / 0 / 2 / 0；**复跑 1,093 / 1,069 / 22 / 0 / 2 / 0** | 1 | 首跑 delta 为**两个已知非确定性现象**：`test/编排/git-trunk-store.test.ts` 文件级 Node 原生 `CleanupQueue::Add` 断言崩溃（25.2s，E3-T3 §3.5 同签名）与 `test/编排/download-provider.test.ts` 时序抖动（W1b 证据已登记；隔离复跑 14/14 pass）；**全量复跑精确回到基线 1093/1069/22/2**（失败名集合与修复前逐名一致）。另：isolated `git-trunk-store` 复跑 13 条断言全 ✔、随后进程不退出（180s watchdog 终止）——E3 已登记的 Node 运行时/测试后泄漏类，非产品断言失败 |
| 桌面受影响四文件 | 128 / 119 / 9 / 0 / 0 / 0 | 1 | 同名同数（9 个既有红逐名一致） |
| `test/桌面UI/**` | **443 / 443 / 0 / 0 / 0 / 0** | **0** | 一致 |
| `test/测试/**`（100 文件，排除登记挂起） | 670 / 612 / 39 / 1 / 18 / 0 | 1 | 失败名集合与修复前**逐名一致**（39 fail + 1 cancelled，E3/B0 同口径） |

- **新增确定性失败 = 0、新增 skip = 0**（在「编排全量复跑」口径下；首跑的两个 delta 已按 E3/W1b 既有处置分类为非确定性并逐条记录，未改断言、未加 skip）。
- 静态门（修复后）：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0（`post-fix-logs/static-*.log`）。

### R3. 新候选身份（冻结）

- 范围：`git status --porcelain -- src app test` = **41 项 = T1 只读 3 + 候选 38**；T1 三文件哈希不变（`post-fix-logs/t1-hashes.txt`）。
- 候选 38 文件 = 原 W 批/测试批 35（含 D1 新增 2 集成测试）+ 修复 3（`judge.ts` 二次修改、`zh-CN.ts`、`en-US.ts`、`i18n.test.ts` 计入原类别）+ 逐文件 SHA-256/`git hash-object`：`post-fix-logs/candidate-hashes.tsv`（38 行）。
- **聚合身份（算法：每行 `<raw_sha256>` + 两空格 + `<path>` + LF，整行 `LC_ALL=C sort` 后取 SHA-256）**：
  **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`**（`candidate-aggregate-lines.txt` / `candidate-aggregate.txt`）。
- 稳定性：复验运行前后 `src app test` manifest 均为 **1,077 文件 / `5308e71a80c93cc3091b09afa95be4f1687736982593f968eef7db01c0cfcd6f`**，逐行 diff **0 行**（`manifest-pre.txt` / `manifest-post.txt` / `manifest-diff.txt`）；HEAD `a1b2f66`（tree `3aa82fb7…`）/分支未变；暂存 0。
