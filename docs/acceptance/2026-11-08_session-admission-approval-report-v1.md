# 会话创建准入按操作审批：独立验收 B2 报告（v1，轻量模式）

- 日期：2026-11-08；身份：ANS 独立验收唯一主上下文（同一身份；只按 B1 v1 判定，不判方案质量、不改方案/代码/测试/角色卡）。
- 模式：**轻量但诚实**（独立复算候选身份与稳定性；抽查 D1/RR/E3/扫描关键证据原件；定向复跑非破坏性测试；未运行真实模型/Electron/CDP）。
- 结论：**insufficient evidence**（2 项证据完整性不足；无 fail、无代码返工/安全旁路；其余 33 项 pass、6 项 not applicable）。详见 §5/§6。
- 唯一判据：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`）。
- 未授权：提交/推送/合并/发布/tag；本报告只写 `docs/acceptance/`。

## 1. 输入与候选身份

### 1.1 输入（实测 hash）

| 输入 | 实测 |
| --- | --- |
| 变更包 | `docs/scheduling/2026-11-08_change-package_session-admission-approval.md`；166 行 / `0e8967fd5f1d4d4ab0a67466a20e558efde55d24b2e57f50e621e6ce549af3dc` |
| 派发/接口评审记录 | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`；90 行 / `37e8740c432d55395a707e07c7a2de5e7af3f7555ddf655de2159734b55d4c02` |
| D1 记录 | `角色卡/测试/docs/change/2026-11-08_D1_cross-role-integration.md`；173 行 / `1c9f2e8c4212890c0b5c90356f75b09f8086c4ae6ece3db6b1f8cb09330a22f8` |
| RR 记录 | `角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md`；121 行 / `cc5968eecf13d88bee28e10f544e75df52b8a06e98e1ce3b014959c8d410e75a` |
| E3-F T3 记录 | `角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`；169 行 / `5cba2d548b31f83c7966d3276ebe979c42329aa3c3904d66572ff2ec923dab33` |
| E3 扫描记录 | `角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks_session-admission.md`；45 行 / `9b05470f342b9dda622462e1d7675443fd5a205c34b4c6e15032280783ce4a99` |
| B0 豁免 | `docs/communication/2026-11-08_waiver_baseline_session-admission.md`；18 行 / `d7a699d2819213cad60645fa0ffbce126fc1d5da290078f4dbcb6f6ab6b8e2fd` |
| 辅助 B0（不作基线） | `角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-baseline.md`；645 行 / `31e178b3a55ded68ad0c164465d1c69070c631df8afa6f482beace3d9fa88aef` |
| 回归参照（订正版） | `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`；326 行 / `d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`；4,872/4,641/198/1/32 |

### 1.2 独立复算候选（全部实测）

- HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` = **41 项 = 候选 38 + T1 3**。
- 逐文件独立重算：变更包 38 行逐文件 SHA-256 **38/38 一致**；候选集合与 `status - T1` **精确相等**（无缺、无多、无写集外文件）。
- 候选聚合：按 `<raw_sha256>  <path>`（两空格）+ LF、`LC_ALL=C` 整行排序后 SHA-256 = **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`**（独立复算一致；注意含末尾 LF）。
- T1 三文件独立复算：`afe70c62…` / `f0db260e…` / `358ac967…`；聚合 **`06cc75ca2a503cf87813628c080657fc546dd753447ea32219be82008c136323`**；不属候选。
- 稳定性 manifest：`src app test` 全量 **1,077 文件 / `5308e71a80c93cc3091b09afa95be4f1687736982593f968eef7db01c0cfcd6f`**（独立复算一致）；D1 `manifest-pre/post` 逐字节相同、diff 0；E3 运行前/中/后同值、`50-manifest-diff.txt`/`50c-scope-diff.txt` 0 行；证据运行期间候选未被并行变更改写。
- 证据索引完整性：D1 58/58、E3 590/590、扫描 4/4 全部 SHA-256 一致；RR 25 文件 SHA-256 全部一致（7 个无末尾换行文件的 `wc -l` 与索引行数差 1，属 `wc` 语义，非内容差异）。
- 结论：候选身份/稳定性与变更包、D1、RR、E3 的冻结声明一致；未发现候选漂移或 T1 混入。

### 1.3 独立定向复跑（不改候选）

| 复跑 | 结果 |
| --- | --- |
| 10 个新测试文件（binding/准入/只读 Git/审计接线/Q9） | **88/88 pass，exit 0** |
| PR #72 三套件（trunk-dispatch-parent / application-mediation / runtime-dispatch-gate-integration） | **37/37 pass，exit 0** |
| 关键回归六文件（shell-gate / shell-readonly / classify-shell / shell-write-guard / judge / operator-channel） | **177/178 pass，1 fail**：`operator-channel` 的 `I-1 补丁（真正接通核查）…` 与参考基线同名既有红；复现原因为测试替身仅提供 `composeContext`/`bindRole`、缺 `prepareRole`/`bindPreparedRole`，报 `runtime-creation-prepared-api-unavailable`，非本次准入语义失败 |
| `npm run typecheck` / `npm run typecheck:renderer` | 均 **exit 0** |

### 1.4 证据原件抽查

- **T3**：`31-t3-per-file-results.tsv` 520 行；独立汇总自然完成 514 文件 = **4,979 tests / 4,750 pass / 196 fail / 1 cancelled / 32 skipped / 0 todo**；6 个登记挂起（90s watchdog，不计通过）；无未登记 watchdog/无 summary 缺失。
- **对照**：参照可信失败 198、本次 195、逐条一致 193、新增 2、消失 5、新增/消失 skip 0（独立多重集复算一致）；2 条新增与 5 条消失逐条与记录一致。
- **非确定性**：`application-line` 隔离复跑 **3/3 pass**；`chief-workflow` 的 `unmanaged` 未在隔离复跑复现（失败集合变化，ENOTEMPTY 族）；两条在参考 E3 记录中已登记为既有非确定性（含 4 次运行 15/14/11/14、隔离复跑不复现）。
- **RR**：`tasks.jsonl` 实测 `task.created`（`t-mw7crlr8-f32405f4`）/`task.delivered`/`task.reported`×2；诊断 `session.open.ready roleId=product` 04:49:11.475Z、`request.attempt.start` product 04:49:11.527Z；`runtime-creation-admission-unproven` **0 次**、`session.open.ready` **17 次**；目标项目 `shell-gate.jsonl` 恰 2 条：`c-allow`（`by:"ruleset:allow:readonly:git:status（su 审批档）"`、`readonlyGit.canonicalArgv` 与实际执行体一致、`entry:"run_shell"`、`roleId:"product"`）与 `write-guard:deny`（零执行）；`onShellConfirm` 0 张卡；无 `docs/product/rr-nonreadonly.txt`。
- **扫描**：退役码仅退役注释、生产零产生；`SHELL_RULES_VERSION="4"`/`ans-default-v4` 全仓唯一，v3 外部 pin fail-closed；matcher/规范体单一来源；静态门日志无错误。

## 2. B1 逐项判定

> 判定只用 pass / fail / insufficient evidence / not applicable；N/A 均给出依据。全部条目针对本候选 `b62c7c7c…`。

### 2.1 B0-1–B0-5（客户豁免）

| ID | 判定 | 依据 |
| --- | --- | --- |
| B0-1 | not applicable | 客户指令跳过 B0 正式重登记（`d7a699d2…`；「这种直接去变更把，基线搞他干啥呢」）；B1 §B0-1–B0-5 按客户指令豁免。 |
| B0-2 | not applicable | 同上；辅助 B0 `31e178b3…`（4,885/4,652/200/1/32，6 挂起）仅参考，不作基线。 |
| B0-3 | not applicable | 同上；参考基线使用与既有红/绿对照见 §3.1（`shell-readonly`/`shell-gate` 两条既有红本变更转绿；`lightweight` POSIX-only 6 skip）。 |
| B0-4 | not applicable | 同上；实施/证据前身份重核见 §1.2；候选/manifest 未变。 |
| B0-5 | not applicable | 同上；稳定性由 §1.2 独立复算覆盖（1,077/`5308e71a…`，diff 0）。 |

### 2.2 AC-1–AC-30

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| AC-1 | pass | RR 真实 Claude + product + 桌面 arm：`session.open.ready roleId=product`、product 回合启动、`run_shell` 执行；受保护+shell 创建成功即要求 `approvalChain` 成立；D1-1 真实装配 Codex 侧显式断言 `plan.approvalChain` 与 appTools 含 run_shell/start_background_task。 |
| AC-2 | **insufficient evidence** | Pi + 项目角色 + 三层链的 `prepareRole` 正向已由 `session-admission-approval.test.ts` 真值表覆盖（observed/token/approvalChain），但 **Pi 的 `bindPreparedRole` 成功与 `session.open.ready` 未单独观测**；D1-1 为 Codex，RR 为 Claude；`operator-channel` 的 Pi 真实 openRoleSession 为参考基线既有红（替身缺 prepared API），不能作为正向证据。 |
| AC-3 | pass | D1-1/真值表：Codex 默认工厂 native plan 仍 observed；有审批链 observed；裸函数 gate 无审批链 ⇒ `protected-scope-approval-chain-unproven`；native 严格条件保留。 |
| AC-4 | **insufficient evidence** | Claude 无 shell 的 `prepareRole` 真值表为正（observed/token、无 approvalChain、无 native-factory-*），但 **无 shell 会话的 `session.open.ready` 与 appTools 不含 run_shell/start_background_task 的原始打开日志未提供**；写工具边界门回归仅有既有套件。 |
| AC-5 | pass | `classify-shell.test.ts` 53/53（ls/cat/grep allow）与 `shell-readonly.test.ts` 9/9（c-allow）；D1-5 allow 真实执行；审计 branch c-allow。 |
| AC-6 | pass | matcher 21/21（10 子命令/固定规范体）；transport 5/5（绝对可执行/固定 env/不接受任意 argv）；D1-6 注入能力零 spawn；RR 真实 `git status` 审计字段齐全。 |
| AC-7 | pass | D1-5 真实 gate：allow 恰 1 次 spawn、deny/timeout 零执行、entry/roleId 透传；operator-channel/judge 测试通过（卡面数据与入口标签）；**真机卡面未观测**，按 AC-24/AC-25 披露。 |
| AC-8 | pass | 既有 `shell-judge.test.ts` 34/34、`pi-adapter/shell-judge` 7/7、`shell-judge-verify/*` 全过；operator-channel 的 judge allow/deny/manual/row-failed 用例全过。 |
| AC-9 | pass | `shell-escalation.test.ts` 59/59、`shell-escalation-integration` 16/16、`shell-escalation-view` 13/13；精确 argv/once/session/后台不消费断言全过。 |
| AC-10 | pass | `git-capabilities.test.ts` 15/12/1/2 与参考同名同数（唯一失败为 team-plan publication 既有红，与 query/publish 场景无关）；`git-shell-acl.test.ts` 36/36；查询/发布 blocked/observed 与 journal 断言存在；ACL/策略路径未被本变更修改。 |
| AC-11 | pass | D1-2 + 真值表：无 binding ⇒ plan unknown/`protected-scope-approval-chain-unproven`；端到端 `runtime-creation-admission-unproven`；gate 零调用、无 session ready、无适配器/请求/命令。 |
| AC-12 | pass | D1-3 + `W2 审计三态`：memory/custom/无 probe/边界拒/refresh 失败 ⇒ `protected-scope-audit-unavailable`；不创建；deny-non-readonly 下审批 allow + 审计失败 ⇒ 拒绝执行。 |
| AC-13 | pass | D1-5 deny/timeout 零执行；operator-channel 的 unavailable/关窗/Esc/缺字段用例全过；审计 a-deny/a-timeout/a-unavailable 可辨。 |
| AC-14 | pass | D1-7 writeGuard 注入断言（项目链/审批档均带，只读档不带）；裸 Git 写不咨询审批；后台入口拒绝；escalation 早于判拒/重复/超限用例全过。 |
| AC-15 | pass | 既有 Git 角色/策略套件（`git-capabilities`/`git-shell-acl`/`git-role-workflows-e2e`）与参考同名同数；伪造 actor/turn/role 负例存在。 |
| AC-16 | pass | matcher 攻击矩阵（全局选项/写盘 flag/远程/路径 `../`/绝对/`.git`/glob/通配/控制字符）21/21；不 spawn、无文件变化。 |
| AC-17 | pass | D1-3 审计路径被拒 ⇒ 创建失败；Q4=deny-non-readonly（闸门 2 留痕）；无「审批 allow + 无审计」轨迹。 |
| AC-18 | pass | D1-4/真值表：custom factory/demo/unknown scope 保持既有拒绝码；demo 未放开。 |
| AC-19 | pass | D1-8 + 独立复跑 PR #72 三套件 **37/37**；strict surface 仍 unknown；`applicationMediation` 语义不变；写/发布门零引用。 |
| AC-20 | pass | E3 T3 + D1 受影响套件逐名对照；新增确定性失败 0、新 skip 0（详见 §3.2）；typecheck/typecheck:renderer 0。 |
| AC-21 | pass | D1-5 后台 allow 才 start、deny/timeout 不 start；`background-*` 套件（3/3、12/12、15/15 等）全过；dispose 清理由既有 background 套件覆盖。 |
| AC-22 | pass | D1-7 后台入口 `git status` 被 writeGuard deny；D1-6 后台不做只读 Git 路由；审计 branch write-guard deny。 |
| AC-23 | pass | RR：父门受理 → `task.created` → `session.open.ready roleId=product` → `task.delivered` → product 回合 `request.attempt.start`；`runtime-creation-admission-unproven` 0 次。 |
| AC-24 | pass（限定） | 只读 `git status` 真机 0 卡、固定传输、审计字段齐全；非只读 `touch` 未弹卡（被既有 write-guard 硬拒、零执行），**非只读真机卡未观测**；按 AC-25 回退 D1-5/D1-7，不宣称已真实验证卡面。 |
| AC-25 | pass | RR 如实记录：审批卡子项未观测、驱动停止条件缺陷、预算偏差、未追加预算/未重跑；回退确定性证据且不宣称真机卡。 |
| AC-26 | pass | D1-Q9：受保护 + 真实 Codex shell 会话 + `git_candidate init` ⇒ `git-native-surface-unproven`；无 `.git`/operations/trunk refs；错误如实回给角色。 |
| AC-27 | pass（注） | `matchesRuntimeApprovalChain` 模块级逐字段 fail-closed 已直接测试；端到端 gate 替换按既有 `isCurrent` 断言 `runtime-prepared-configuration-changed`。`protected-scope-approval-chain-changed` 的抛出点在代码中存在但未被单独触发（防御性分支，B1 允许端到端非必过）。 |
| AC-28 | not applicable | Q4=deny-non-readonly（闸门 2 留痕；run-role 两条受保护装配路径均传 `deny-non-readonly`）；按 B1 注记转 AC-12/AC-17 判定，AC-28 不适用。 |
| AC-29 | pass | matcher 允许任意完整 40/64 hex OID 的 `show`/`cat-file`/`log`；`git log --all` deny；`git_query` 的 verifier/task 绑定限制由既有 `git-capabilities` 负例覆盖且未改动。 |
| AC-30 | pass | D1-7 源码断言：两条接 (a) 路径带 writeGuard、只读档不带；advisory/operatorOnly 下 `git commit`/`git push` 被 writeGuard deny 且不咨询 (a)；`shell-write-guard-injection` 3/3。 |

### 2.3 B1-EV1–EV6

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| EV1 | pass | §1.2：38 文件逐文件/聚合/manifest/T1/稳定性独立复算；候选集合精确；证据运行前后未变。 |
| EV2 | pass（披露） | T3 514 自然 = 4,979/4,750/196/1/32/0；6 挂起单列；对照 198/195/193/2/5、新 skip 0；测试同步落实（R14/classify/write-guard/git-shell-acl/shell-risky/i18n/operator-channel）；typecheck 0。披露：2 条新增为参考已登记非确定性；`lightweight-permission-repairs.test.ts:182` 为 POSIX-only、Windows 6 skip（断言已在位但未执行）。 |
| EV3 | pass | 新码 `protected-scope-approval-chain-unproven`/`-audit-unavailable`/`-changed`、`readonly-git-runner-unavailable`、`audit-unavailable` 存在；退役码生产零产生；Codex-only native 分支；RR/D1 审计 `branch:c-allow`、`by` 前缀、`readonlyGit.canonicalArgv`、entry/roleId 均可核对。 |
| EV4 | pass | Codex 严格路径/真实限制保留；demo 仍拒；`applicationMediation` 仅派发父门/controller resume 消费（D1-8 + 37/37）；`inspectInitializationProtection`/stable-write/交付/run-stop 不消费新证据。 |
| EV5 | pass（披露） | RR 预算/偏差如实：客户消息 1、应用处理器 dispatch 1（模型侧 2 次尝试）、product 回合 2（含重复报告）、墙钟 10m04（+4s）、驱动未在 48s 决定性结果处停止、额外打开角色会话、CDP 停止挂起；无追加预算/重试/伪造。失败/中止证据保留，AC-25 成立。 |
| EV6 | pass | R8a：`registerShellApproval(gate,facts,sink)` 统一签名、唯一登记点 `createShellGate` 构造成功后（I0-1/代码/测试）；R8b：Symbol 挂 sink 非枚举、生产装配不设置、不经 shell-rules 再导出（I0-2/测试）；R8c：未登记 undefined、已登记缺 probe ⇒ `probe:"unavailable"`、memoize（I0-3/测试）。 |

### 2.4 判定统计

| 判定 | 数量 | 条目 |
| --- | --- | --- |
| pass | 33 | AC-1、AC-3、AC-5–AC-27（AC-28 除外）、AC-29、AC-30、EV1–EV6 |
| fail | 0 | — |
| insufficient evidence | 2 | AC-2、AC-4 |
| not applicable | 6 | B0-1–B0-5（客户豁免）、AC-28（Q4=deny-non-readonly） |
| 合计 | 41 | 5 B0 + 30 AC + 6 EV |

## 3. E3 基线口径判定

### 3.1 B0 豁免与参照基线使用：合规

- 客户豁免记录 `d7a699d2…` 明确跳过 B0-1–B0-5；B0 条目按 N/A 处理，未伪造 B0。
- 参照基线使用 `d0d67ff4…`（上一变更 E3 T3 订正版；4,872/4,641/198/1/32；其测得代码内容与当前 HEAD `a1b2f66` 同 tree `3aa82fb7…`）；豁免记录原引 `76872622…` 与订正版计数相同，变更包/E3 已解释文字订正，合规。
- 辅助 B0 `31e178b3…`（200 fail）仅作差异解释，未用于 pass/fail；E3 §6 逐条解释 198/200/196 的不同候选/方法/环境，未混用。
- 环境差异（Node/OS/Windows、300s vs 600s watchdog、既有非确定性）在 E3/变更包逐条披露；未宣称 T3 单次全绿。

### 3.2 2 条新增失败的非确定性结论：可接受

- `application-line`：全量 1 次失败（presented/created 顺序竞态），同候选隔离复跑 3/3 pass；参考 E3 已登记同文件同断言为顺序竞态（B 失败、C+2 次复跑 pass）。
- `chief-workflow` `unmanaged`：全量失败为 AggregateError/ENOTEMPTY 清理类；隔离复跑失败集合变化、`unmanaged` 未复现；参考 E3 已登记 chief-workflow 清理抖动（4 次运行 15/14/11/14，失败名集合不同）。
- 5 条消失中 2 条为设计 §4.5 点名既有红按本变更转绿（`shell-gate` readonly 裁定 A、`shell-readonly` 只读档 git status），3 条为参照侧非确定性（chief-workflow W29/commit-race、e-pi 原生崩溃）；与参考 E3 记录一致。
- 结论：新增**确定性**失败 0、新 skip 0 成立；2 条新增属已登记非确定性，可接受。E3 报告已如实披露「不宣称单次全绿」。

### 3.3 审批卡真实运行未观测按 AC-25 回退：成立（限定）

- RR 只读 `git status` 真机达成（0 卡/固定传输/审计字段）；非只读 `touch` 被既有 write-guard 硬拒，未进入审批，故卡未观测。
- AC-25 明确允许「审批卡需人工操作无法在预算内稳定复现」时回退确定性并如实说明；RR 记录未宣称真机卡，D1-5/D1-7 覆盖 allow/deny/timeout、entry、writeGuard 注入与后台边界。
- 限制：本次未用非写类型非只读命令（如 `npm test`/脚本）重试；若客户要求真机卡证据，需另授权一次最小预算并修复驱动停止条件。该限制已在变更包 §七 13 披露。

### 3.4 预算偏差披露：充分

- RR §4/§6 与变更包 §七 13 逐项记录：模型侧 `dispatch_task` 2 次（应用处理器 1）、chief 追加 3 个请求回合、product 第 2 回合与重复报告、墙钟 10m04（+4s）、驱动未在决定性结果处停止、额外角色会话、停止后 CDP 求值挂起、无额外模型请求、无追加预算/重试/伪造。足以支持「AC-23 已达成、AC-24 部分、AC-25 限制如实」的判定。

## 4. 披露审查

| 披露项 | 是否充分 | 说明 |
| --- | --- | --- |
| B0 豁免/辅助 B0 差异 | 充分 | 豁免 `d7a699d2…`；辅助 B0 `31e178b3…` 明确不作基线；198/200/196 差异逐条解释；参照基线订正版说明。 |
| 桌面边界漂移 | 充分 | `test/桌面应用/operator-wiring.test.ts`、`session.test.ts` 确为 `4c24149` 删除、`角色卡/桌面窗口/boundary.md` 仍列；本变更未恢复/未新建，交人事/治理。 |
| `protectedScope` 无生产者 | 充分 | 仅模型/请求/展示字段与条件转抄；生产无设置者；渲染不展示；O7 未选，未宣称已实现。 |
| T1 三文件单列 | 充分 | 三文件哈希/聚合单列；不属候选；最终提交计划单列。 |
| Q9 | 充分 | 受保护项目角色 Git 写/初始化仍被 `inspectInitializationProtection` 拒绝；D1-Q9 命中 `git-native-surface-unproven`，无副作用；不放宽。 |
| F1 | 充分 | shell 只读 Git 不套用 `git_query` readableOids/publication-proof；任意完整 OID 可读；`log` 无目标 HEAD、`--all` deny；verifier 限制仅约束 `git_query`。 |
| Q4 | 充分 | 采纳 `deny-non-readonly`；审批 allow + 审计失败 ⇒ 拒绝；只读 c-allow 不翻转；AC-28 按 N/A。 |
| Q10 | 充分 | 无运行时回切开关；回切=回滚提交；`ANS_SHELL_ESCALATION_DISABLED` 不变。 |
| 并行变更串行前置 | 充分 | 本候选 38 文件与 `remove-predictive-gates` 团队计划记录无混入；`src app test` 无该变更写入；其自述未派发、串行前置本文变更。 |
| RR 限制 | 充分 | AC-23 达成；AC-24 卡未观测；预算/驱动缺陷如实；不宣称六角色闭环/发布/长期稳定性。 |

**验收补充披露（变更包未覆盖、由本次 B2 记录）**：
1. AC-2 的 Pi `bindPreparedRole`/`session.open.ready` 与 AC-4 的无 shell `session.open.ready`/appTools 原始日志缺失（见 §5）。
2. `lightweight-permission-repairs.test.ts:182` 在 Windows 为 POSIX-only skip（6 skip），该同步断言未实际执行；只读 Git 行为由 matcher 单测/E3 覆盖。
3. `operator-channel` 的 Pi 真实 openRoleSession 用例为参考基线既有红（`runtime-creation-prepared-api-unavailable`，替身缺 prepared API），非本次准入语义失败；不作为 Pi 正向证据。

## 5. 非 pass 项与关闭条件

### 5.1 AC-2（Pi + 项目角色 + shellOperatorChannel）

- 已具备：真值表实测真实 Pi adapter `prepareRole` = observed/token/`approvalChain.mode:"three-layer"`；`run-role`/`session.ts` 的 bind/compose 为运行时共享代码；Codex/Claude 全链已由 D1-1/RR 覆盖。
- 缺失：B1 要求的「同 AC-1」中的 **Pi `bindPreparedRole` 成功 + `session.open.ready` + appTools 含 shell** 的原始日志；现有 Pi 真实 openRoleSession 用例为既有红，不能替代。
- 关闭条件（任一）：①补一条 Pi + 项目角色 + 三层链的集成用例（真/桩 prepared API），断言 prepare→bind→session ready、plan.approvalChain、appTools 含 run_shell/start_background_task、候选不变；②由标准/沟通书面确认「运行时中立共享 bind 路径 + Pi plan 真值表」足以满足 AC-2，并在 B2 记录引用。

### 5.2 AC-4（Claude/Pi + 无 shell 工具）

- 已具备：Claude 无 shell 真值表 `prepareRole` = observed/token、无 approvalChain、无 native-factory-*；`hasShellAdmissionTools` 仅在注册 shell 工具时要求审批链；既有写门/工具注册回归通过。
- 缺失：B1 要求的 **无 shell 会话 `session.open.ready` 原始日志 + appTools 不含 run_shell/start_background_task 的注册清单**；现有证据停留在 plan 层。
- 关闭条件（任一）：①补一条受保护 Claude（或 Pi）无 shell 集成用例，断言创建成功、工具面不含 shell、写工具仍受边界门；②同 AC-2 的标准解释路径。

### 5.3 无 fail / 无代码返工项

- 未发现审批/审计/守卫绕过、未授权非只读执行、只读 Git 白名单越界、写/发布门被应用中介替代、Codex 严格路径改变、demo 放开、审计失败仍放行、新确定性失败/新 skip、候选与证据不符等 fail 情形。
- 结论为 **insufficient evidence**（证据完整性），不是 rework；无需修改产品代码，需补证或标准解释。

## 6. 结论

- **总体：insufficient evidence**（33 pass / 0 fail / 2 insufficient / 6 N/A）。
- 本变更的直接目标 **AC-23 已真机达成**；候选身份/稳定性、T3 对照、RR 关键链、只读 Git 审计、PR #72 回归、Q9 负例、R8a–R8c 处置均有可复算证据。
- 未通过项仅为 AC-2/AC-4 的原始日志完整性；关闭后可按 B1 重判为 pass（其余判定不受影响）。
- 发布/tag、提交/推送/合并未授权；本报告不替代客户确认/实施授权。

## 7. 当前状态与限制

- 本报告只写 `docs/acceptance/`；未修改 I6/旧 A/J/T1/其他 B1、方案、代码、测试、角色卡/边界。
- 未运行真实模型/Electron/CDP；未 commit/push/merge/release。
- 证据引用均为当前候选 `b62c7c7c…` 的原始文件；若候选/基线/候选集变化，按 B1 复判规则重取。
