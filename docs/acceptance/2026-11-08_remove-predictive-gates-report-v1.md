# 删除全部预知式门控 + Git 写/初始化改为「动作时授权」：独立验收 B2 报告（v1，轻量模式）

- 日期：2026-11-08；身份：ANS 独立验收唯一主上下文（同一身份；只按 B1 v1 判定，不判方案质量、不改方案/代码/测试/角色卡）。
- 模式：轻量但诚实（独立复算候选身份；抽查 W/D1/RR/E3 关键原件；定向复跑非破坏性测试；未运行真实模型/Electron/CDP）。
- 结论：**insufficient evidence**（33 pass / 0 fail / 6 insufficient evidence / 1 not applicable；共 40 项）。无 fail、无安全旁路/代码返工发现；6 项为 B1 要求的完整效果链/证据未构造（变更包 §八.9 已如实披露覆盖边界）。
- 唯一判据：`docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / 34,071 bytes / `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c`）。
- 未授权：提交/推送/合并/发布/tag；本报告只写 `docs/acceptance/`。

## 1. 输入与候选身份

### 1.1 输入（实测）

| 输入 | 实测 |
| --- | --- |
| 变更包 | `docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md`；180 行 / 26,902 bytes / `6e598f839e476f3954fda95b728cd462b04a67485bd4eca31c58c0fddfc14025` |
| 派发/状态/I0 记录 | `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`；99 行 / 24,023 bytes / `719aad4094748344275f8995f83ddadc4f8a907085c461ec3dceeebb24f88e4c`（变更包引用写盘前 104 行 / `5de8a556…`，当前已更新；以当前为准） |
| 设计 P1.4 | `docs/planning/2026-11-08_design_git-write-init-approval-based.md`；822 行 / 124,066 bytes / `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc` |
| 团队计划 | `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`；503 行 / 66,827 bytes / `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808` |
| W1 | `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md`；166 行 / `b6d4f688…` |
| W2 | `角色卡/编排/docs/change/2026-11-08_W2_remove-predictive-gates.md`；178 行 / `fa166eed…` |
| W3a | `角色卡/编排/docs/change/2026-11-08_W3a_git-action-authorization-sidecar.md`；138 行 / `6a07a922…` |
| W3b | `角色卡/编排/docs/change/2026-11-08_W3b_remove-predictive-gates.md`；153 行 / `1547235e…` |
| W4 | `角色卡/桌面窗口/docs/change/2026-11-08_W4_remove-predictive-gates.md`；165 行 / `210d2066…` |
| W5 | `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md`；155 行 / `8d678fff…` |
| D1 | `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`；205 行 / `10418f38…` |
| RR | `角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`；141 行 / `c40011de…` |
| E3-F | `角色卡/测试/docs/change/2026-11-08_E3-F_remove-predictive-gates.md`；247 行 / `41a4a215…` + 证据索引 633 行 / `44f93656…` |
| 参照基线 | 第一变更 E3 `5cba2d54…`（4,979/4,750/196/1/32）+ B2 补证 `54c0db31…`（+3/3）⇒ **4,982 / 4,753 / 196 / 1 / 32** |
| B0 豁免 | `docs/communication/2026-11-08_waiver_baseline_session-admission.md`；18 行 / `d7a699d2…`（沿用覆盖见派发记录 §二） |
| 第一变更 B2 v2（历史） | `docs/acceptance/2026-11-08_session-admission-approval-report-v2.md`；`71b41879…`（pass 35/0/0/6；其当时候选判定，不被本变更改写） |

### 1.2 候选身份与稳定性（独立复算）

- HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`；tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` = **38 项 = 17 修改 + 21 新增 + 0 删除**；候选集合与变更包 38 行**精确相等**（无缺/无多/无写集外）。
- 38 文件逐文件 SHA-256 **38/38 一致**；聚合按 `<raw_sha256>  <path>` + LF、`LC_ALL=C` 整行排序后 SHA-256 = **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（独立复算一致；D1/E3 运行前后同值）。
- 稳定性 manifest：**1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**（独立复算；行排序口径；D1/E3 前/中/后同值、diff 0 行）。
- T1 三文件 `afe70c62…`/`f0db260e…`/`358ac967…` 已在 HEAD 基线内，不属本 delta；HEAD/tree/分支/暂存未变。
- 独立复跑：W1/W2/W3a/W3b/W4/W5 新测试与 q9/N15 等 **67/67 pass**；Q16/N15 定向 **39/39 pass**；W4 桌面 run-stop 定向 **1/1 pass**；`npm run typecheck` **exit 0**；候选/manifest 复跑后不变。
- 证据索引：E3-F 625 条逐文件 SHA-256/行/bytes **全部一致**；RR 85 文件哈希全部一致（3 个 SDK 会话文件为 Windows 长路径，经 shell 复核哈希一致）。

## 2. 关键证据原件抽查

### 2.1 Q16：q9/N15 契约改写（逐条）

- `test/测试/session-admission-approval-q9-integration.test.ts`：HEAD `1b2441f2…` → 工作树 **`3b3e3448…`**；旧断言「受保护 + 真实 shell 会话时 `git_candidate init` 被注册表级拒绝、`git-native-surface-unproven`」已按 Q16 改写为「动作时授权 init 成功；旧注册表级码零命中；inventory taskId 不符 ⇒ `git-actor-core-binding-unproven` 无副作用」；当前独立运行 **1/1 pass**。
- `test/测试/runtime-dispatch-gate-integration.test.ts`：HEAD `5433911a…` → 工作树 **`3abfff69…`**；N15 源码断言从旧 `inspectInitializationProtection`/strict observed 改为新 `inspectGitActionAuthorization` 条件（H13/H14/drain/optionalEvidence/authorizationMode），写门零 `applicationMediation`；当前 **10/10 pass**。
- 两处改写均属 Q16 取代的契约变更，W5 证据给出 before/after/理由与红→绿；不是静默删除/放宽。旧码/退休码在正向回执中零命中。

### 2.2 RR：AC-22 / AC-23 下一门 / AC-24

- **AC-22**：受保护 target2（init-source 11:22:28.090Z ⇒ required）+ 真实 Claude UI：单条消息 → 父门 accepted → `task.created`（`t-mw7qtd4m-ef385125`）→ `session.open.ready roleId=product`（11:22:28.227Z）→ delivery.claim/首条用户消息即派发内容 → product `request.attempt.start`；两次尝试均复现。
- **AC-23（如实下一门）**：`write_file docs/product/rr-git-note.md` 成功；`git_query branch-list` status=observed；`git_candidate commit` 在 **Claude MCP schema 层**被 `-32602 invalid_union`（commit 分支 `unrecognized_keys ["__ans_call_context"]`）拒绝，未到应用处理器；零效果：`operations-inventory.json=[]`、refs 仅 `refs/heads/master`、无 journal/sidecar、工作树仅新增 untracked 文件。涉及 `src/provider/claude/session.ts:84` 与 `src/provider/runtime/schema.ts:97-101`，两文件 `git diff HEAD` 为空——**基线既有缺陷、零候选 delta**；确定性复现 `repro-call-context.json`（git_query/write_file 通过、git_candidate 失败）。
- **AC-24**：attempt 2 = 1 条消息 / chief 1 回合 / product 1 回合 / dispatch 应用处理器 1 / 应用层 Git 1（git_query；git_candidate 未达应用层）/ 0 卡 / 墙钟 ≈39.8 s / 无自动重试；attempt 1 fixture `.git/config [user]` 缺陷与停止时机/投递账本缺失均如实披露、不作 AC 事实。
- 判定：AC-22 pass（投递账本 `task.delivered` 因 0.6s 停止缺失，投递事实由 SDK 首条消息/claim 证明，披露）；AC-23 pass（B1 允许「如实下一真实阻塞」；零效果故无 journal/sidecar，非伪造）；AC-24 pass。

### 2.3 D1 / E3-F：T3 与删除清单

- D1：276 文件 **2,429/2,291/111/2/25**；2 处环境性差异（`git-role-workflows-e2e` 300s watchdog→隔离 19/7/0/0/12；chief-workflow W29 12s 超时→环境性能）逐条隔离复跑/分类；候选/manifest 前后 diff 0；typecheck 0。
- E3-F：540 文件（534 自然 + 6 登记挂起）；**5,032 / 4,807 / 192 / 1 / 32 / 0**；对参照 4,982/4,753/196/1/32 ⇒ **+50 tests / +54 pass / −4 fail / skip 不变**；**新增确定性失败 0、新 skip 0**。
  - 新增失败 1：chief-workflow W20「真实 R9 竞争」ENOTEMPTY 清理竞态；隔离复跑 W20 R9 变体 pass、W20 普通变体 fail，失败集合再变 ⇒ 非确定性清理族。
  - 消失 4：chief-workflow W47 select/revise、selected（波动族，隔离复跑再现）+ `t1-real-cli` govern/codex（参照失败 `runtime-prepared-configuration-changed`；W1 F5/R9 后回落工厂不再抛该码 ⇒ 预期红→绿；本候选 5/5 通过）。
  - 19 新文件 44 用例 + 既有文件内 6 用例全部 pass；q9 1/1、N15 10/10。
- 删除清单/扫描：退役 6 码 `src/` 仅 4 行注释、`app/` 0、测试内均为负向断言/注释；新码 3 个存在并使用；写门零 `applicationMediation`；drain 显式白名单 2+4、无 `native:` 通配、`native:pi-sdk-idle-not-observed` 不在白名单；sidecar 常量 4 KiB/16/64 KiB 且强制；无新增运行时回切开关（Q18）。
- 判定：EV2（T3/测试同步）pass（1 条新增为已登记非确定性，4 条消失含 1 条预期红→绿；新 skip 0）；EV3（drain/H13/H14）pass；EV4（只读/PR72/Q9）pass。

### 2.4 覆盖边界（变更包 §八.9 自述）

- **commit / delivery / integrate / revert / activation** 完整跨角色效果链未在确定性/真实运行中完整构造；commit/delivery 调用点顺序与 digest 映射仅源码守卫；RR `git_candidate` 被基线 Claude MCP schema 阻断。
- **deferred run-stop 完整 finalize 提交链**（`prepareRunChange→resumeDeferredRunChanges→executeOwnedRunStop→finalizeRunChange`）未端到端构造；W5 仅 gate/授权分支 + drain + 源码守卫；W4 明确停在 finalize 边界并以 `run-preparation-invalid` 拒绝。
- **activation** 发布未 E2E；W3b 计划/文档/initial workflow 成功，activation 仅共享函数 + 源码守卫。
- 这些边界在变更包 §八.9/W3b §7/W5 §6/W4 §6 如实披露；不是隐瞒，但未满足 B1 对应 AC 的完整观察。

## 3. B1 逐项判定

> 判定只用 pass / fail / insufficient evidence / not applicable；N/A 均给依据。当前候选 `9462391e…`。

### 3.1 BASE-1–BASE-4

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| BASE-1 | pass（披露） | B0 豁免沿用：豁免记录 `d7a699d2…` 为第一变更文本；派发记录 §二记录协调方确认「沿用覆盖本变更」；参照组合 4,982/4,753/196/1/32；环境差异逐条（D1/E3）。若沟通要求独立书面豁免，需补；当前按记录接受。 |
| BASE-2 | not applicable | 豁免覆盖（BASE-1），不按正式 B0 重登记；无 B0 记录要求。 |
| BASE-3 | pass | 实施启动门：第一变更 E3 完成且 PR #73 MERGED；I0-1–I0-12 冻结；沟通放行；HEAD `3f249e2` 基线；5+第 6 文件串行、单写者；T1 已提交基线。 |
| BASE-4 | pass | 38 文件逐文件/聚合/树/manifest/T1 独立复算；候选集合精确；D1/E3/RR 运行前后 diff 0。 |

### 3.2 AC-1–AC-24

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| AC-1 | **insufficient evidence** | B1 要求受保护 + Claude + product 在本任务写集内 `git_candidate commit` 成功、sidecar `{candidate}`、ref/journal/工作树提交。实际：W3b 只以源码守卫覆盖 commit 调用点；W5 只测 init；RR commit 在 MCP schema 层被基线缺陷阻断，未达应用层。无 commit 成功/ref/journal 原件。 |
| AC-2 | **insufficient evidence** | B1 要求 Pi + 角色 ACL 内 `git_candidate commit` 同 AC-1。实际：W5 Pi 仅 init（`git-action-cross-runtime-pi-init`）；无 Pi commit 成功/副作用原件；RR commit 被同一 MCP schema 阻断。 |
| AC-3 | pass | W5 `git-action-cross-runtime-init`（Claude actor convener）与 `pi-init`（Pi actor convener）：真实 init 成功、init.json `candidate-created`、.git、sidecar `{init,candidate}` 两键；旧码零命中。 |
| AC-4 | **insufficient evidence** | B1 要求 Claude convener `git_publish delivery` 成功、sidecar `{publication}`、ref/journal。实际：W3b 对 delivery 仅源码守卫/映射；无 delivery E2E；RR 未执行 delivery。 |
| AC-5 | pass | W1 `codex-native-optional` 4/4：responses/MCP/WebSearch/custom transport 不可用仍准入、plan 省略 native、ensureAdapter 回落；native observed 记录强证明；strict toolSurface 与 native plan 区分；present-but-changed 拒绝。 |
| AC-6 | pass | W5 Claude actor init 在多 active Pi/Claude 会话 + foreign MCP 下成功；sidecar optionalEvidence 记录、不因其它会话拒绝。 |
| AC-7 | pass | W5 Claude/Pi/Codex init：native/optional 证据缺失或 unknown 不改变动作判定；sidecar optionalEvidence 记录；无 native 拒绝。 |
| AC-8 | **insufficient evidence** | B1 要求 run-stop/controller-stop Claude/Pi 成员、deferred run-stop 宿主继续 finalize 提交成功、终止事实写 run transition journal。实际：W5 仅 gate/host-continuation 授权分支 + drain + 源码守卫；无真实 prepared run 的完整 finalize 提交；W4 明确停在 finalize 边界（`run-preparation-invalid`）；无 run transition journal 提交原件。 |
| AC-9 | pass | D1/E3 只读 Git/`git_query`/只读 shell/非只读 shell 回归与在飞变更一致；无回退；PR #72 复跑通过。 |
| AC-10 | pass | W2 gate 测试（active-tool 正向/expectedTool 缺失/actor 不符）；既有 Git ACL/身份套件回归；无副作用。 |
| AC-11 | pass | W5 host-continuation 负例：taskId 不符/记录不唯一/requesterTurnId 漂移 ⇒ `git-actor-core-binding-unproven`；W2 H6/source 守卫；无提交/副作用。 |
| AC-12 | pass | 既有 `git-shell-acl`/`git-capabilities` 角色 ACL/策略负例回归；W5 q9 convener actor；无执行副作用。 |
| AC-13 | pass | 既有 Git policy/stale/写区外负例回归；W3b 调用点 policy 顺序/映射源码守卫。 |
| AC-14 | pass | W2 H7 根身份 + W3a 根/sidecar 安全测试；根不符/越界 fail-closed；无写。 |
| AC-15 | pass | W3a sidecar lease 校验（无 live lease/结束 lease/伪造 leaseId/heldLockToken）；并发/跨项目既有套件回归。 |
| AC-16 | pass | W3b init/计划/文档/initial workflow 失败注入 + W5 跨运行时注入：`git-action-audit-unavailable`，无 .git/init.json/ref/journal 副作用。 |
| AC-17 | pass | D1/E3 在飞变更 shell 负例回归：未审批非只读 shell/裸 Git 写/后台借授权保持拒绝。 |
| AC-18 | pass | W5 PR #72 回归 56/56；写门零 `applicationMediation`；`inspectToolSurface`/compose 语义未改。 |
| AC-19 | pass | W2 gate F8：foreign MCP/unknown 只进 optionalEvidence；伪造 native/optional 不改变 actor 判定；身份/ACL/策略缺失仍拒绝。 |
| AC-20 | pass | W4 桌面 run-stop：native absent 允许、present-but-changed 拒绝、drain 不成立阻断；W2 gate/source 同构；无提交。 |
| AC-21 | pass | W2 gate H13/H14：preparing/creating/disposing、prepared/failed 豁免边界、active lifecycle/toolSurface 身份三元；不跳过/fail-open；无副作用。 |
| AC-22 | pass（披露） | RR 真实 UI/Claude：父门 accepted、task.created、product ready、delivery.claim/首条消息、product 回合；`task.delivered` 账本行因 0.6s 停止缺失，投递事实由 SDK/首条消息证明；两次尝试复现。 |
| AC-23 | pass（下一门） | RR `git_candidate commit` 在 Claude MCP schema 层 `-32602 invalid_union`（`__ans_call_context` × 顶层 `oneOf`/`additionalProperties:false`）；零效果（operations=[]、refs 仅 master、无 journal/sidecar）；基线既有缺陷、零候选 delta；B1 允许「成功或如实报告下一真实阻塞」；零效果故无 journal/sidecar，不伪造。 |
| AC-24 | pass | RR attempt2：1 消息/chief 1/product 1/dispatch 1/应用层 Git 1/0 卡/39.8s/无自动重试；attempt1 fixture、停止时机、导入自动化偏差如实披露；不宣称闭环。 |

### 3.3 P1.2-AC-25–31

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| P1.2-AC-25 | **insufficient evidence** | B1 要求 `prepareRunChange→resumeDeferredRunChanges→executeOwnedRunStop→finalizeRunChange` 完整链、host-continuation 匹配、drain、提交成功。实际：W5 仅 gate/授权分支正负例 + drain + 源码守卫；无真实 prepared run/plan 的 finalize 提交；W4 停在边界；无 run transition journal 提交原件。 |
| P1.2-AC-26 | pass | W3b `git-action-authorization-wiring-retry`：同 operationId 新 lease/turn 追加 sidecar 行，旧行前缀不变；不触发 replay/candidate/init conflict；pending-recovery 语义由既有测试回归。 |
| P1.2-AC-27 | pass | W1 codex-native-optional + W5 `git-action-cross-runtime-codex-init`：native 不可用创建成功、plan.native 省略、ensureAdapter 回落、动作 init 成功；present-but-changed 拒绝。 |
| P1.2-AC-28 | pass（披露） | W5 Claude actor 多 active 会话 + foreign MCP：只进 optionalEvidence；动作仍按 actor；不宣称阻断其写 `.git`；变更包 §八.1 披露。 |
| P1.2-AC-29 | pass | W2 gate host-continuation 负例 + W5 集成：inventory taskId 与 `held.plan.requesterTaskId` 不符/记录不唯一 ⇒ `git-actor-core-binding-unproven`；无提交/副作用。 |
| P1.2-AC-30 | pass | W3a sidecar 6 用例：符号链接/nlink/越界/4KiB 行/16 次/64KiB/坏 JSON/截断/未知字段/lease/锁；失败 ⇒ `git-action-audit-unavailable`；无 repo 效果；W3b 注入验证。 |
| P1.2-AC-31 | **insufficient evidence** | B1 要求文档/计划/激活/initial workflow 四类发布均成功、sidecar `{candidate,publication}`、ref/journal。实际：W3b 计划/文档/initial workflow E2E 成功；**activation 仅共享 `executeGitBusinessPublication` + 源码守卫，无 activation E2E 回执/ref journal**；变更包 §八.9 自述 activation 未完整构造。 |

### 3.4 B1-EV1–EV5

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| EV1 | pass | 38 文件/聚合 `9462391e…`/manifest 1,099/`bf190ee5…`/T1 基线；候选集合精确；D1/E3/RR 运行前后 diff 0；独立复跑后不变。 |
| EV2 | pass（披露） | T3 5,032/4,807/192/1/32；对参照 +50/+54/−4/skip 0；新增确定性失败 0、新 skip 0；1 条新增 W20 ENOTEMPTY 为已登记非确定性、隔离复跑变体进出；4 条消失含 3 波动 + 1 预期红→绿；测试同步 q9/N15/R14/chief-workflow/rapporteur/stable-write/session-lifecycle 均有记录；typecheck 0。 |
| EV3 | pass | drain 白名单 2+4 显式、无 `native:` 通配、`native:pi-sdk-idle-not-observed` 阻断；使用点 `stopAndInspect`/run-role/trunk-runtime/apply-journal/桌面均有测试/source 守卫；H13/H14 真值表/负例；native/processCoverage 仅证据。 |
| EV4 | pass | 只读 Git/`git_query`/角色 ACL/writeGuard 沿用；`git_publish documents` 不走本门、delivery 走门（call point source guard）；Q9 取代；写门零 `applicationMediation`；PR #72 56/56。 |
| EV5 | pass（覆盖边界） | q9/N15/R14/trunk-dispatch-parent/chief-workflow/rapporteur/stable-write/session-lifecycle/git-role-e2e 同步逐条；新增 host-continuation/sidecar/F4/F5/F8/drain 测试；但 commit/delivery/activation/deferred run-stop 完整效果链未构造（§2.4），对应 AC 判 insufficient。 |

### 3.5 判定统计

| 判定 | 数量 | 条目 |
| --- | --- | --- |
| pass | **33** | BASE-1、BASE-3、BASE-4；AC-3、AC-5–AC-7、AC-9–AC-24；P1.2-AC-26–30；EV1–EV5 |
| fail | **0** | — |
| insufficient evidence | **6** | AC-1、AC-2、AC-4、AC-8、P1.2-AC-25、P1.2-AC-31 |
| not applicable | **1** | BASE-2（豁免覆盖） |
| 合计 | **40** | 4 BASE + 24 AC + 7 P1.2 + 5 EV |

## 4. 非 pass 项与关闭条件

1. **AC-1（Claude product commit）**：补受保护 + Claude/桩件 actor + 本任务写集内 `git_candidate commit` 的完整 E2E（真实/桩件 provider 驱动，不经 Claude MCP schema 缺陷），断言 sidecar `{candidate}`、lease/actor/task/turn、ref/journal、工作树提交、无 native 前提；或由标准/沟通书面确认「W3b commit 调用点源码守卫 + 共享函数」足以满足 AC-1。
2. **AC-2（Pi commit）**：同 AC-1，runtime Pi + 角色 ACL；现只有 Pi init。
3. **AC-4（delivery）**：补 Claude convener `git_publish delivery` E2E（真实任务/回合），sidecar `{publication}`、expected old/candidate、ref/journal；或标准解释。
4. **AC-8 / P1.2-AC-25（run-stop 宿主继续）**：补完整 `prepareRunChange→resumeDeferredRunChanges→executeOwnedRunStop→finalizeRunChange` 链（真实 prepared run/plan、host stop fence、run transition journal、sidecar 不写），Claude/Pi 成员；或标准解释。
5. **P1.2-AC-31（activation 发布）**：补 activation 发布 E2E（真实 plan/activation 链），sidecar `{candidate,publication}`、ref/journal；或明确接受共享 `executeGitBusinessPublication` + source guard 对 activation 的等价性。
6. 以上均为**证据完整性/覆盖边界**，不是已发现的代码/安全 fail；无审批/审计/守卫绕过、无新确定性失败/新 skip、无候选漂移。无需产品返工，但需补证/夹具或 B1 解释后方可判 pass。

## 5. Q16 与披露审查

| 项 | 结论 |
| --- | --- |
| Q16 取代 | 本变更 B1 取代第一变更 B1 v1 `P1.3-B1-AC-26` 与 B1-EV3「`native-factory-plan-unavailable` 仅 codex」；q9/N15 已按新契约改写（old hash → new hash，红→绿逐条记录）；第一变更 B2 v2 `71b41879…` 为历史判定，不改写其 B1/证据；两端变更包已注明。 |
| Q1 残余风险 | 审批放行不透明 shell 可写 `.git`；其它 active 会话 foreign MCP/未封闭工具可在 lease 外写 `.git`；只进 optionalEvidence，不宣称阻断；控制=逐操作审批/审计/后审计 + 结构化冲突检测；已披露（§八.1）。 |
| Q3 Claude/Pi 进程不可观测 | run-stop/controller-stop「已停止」= Core/tracked drain，不等于 native 进程树消失；5s 仅上限；已披露。 |
| Q6 审计缺口 | sidecar append 失败 ⇒ 动作不执行；动作前拒绝仅 best-effort 诊断；已披露。 |
| Q7 串行 | 与第一变更重叠 5 文件 + 实际第 6 `public/trunk-store.ts` + R14；本候选在合并基线 `3f249e2` 上的 38 文件 delta；串行单写者；已披露。 |
| Q12 | 结构化 Git 写=角色 ACL/任务绑定授权，不弹客户卡；未扩大代批；已披露。 |
| 覆盖边界 | commit/delivery/integrate/revert/activation、deferred run-stop 完整 finalize 未完整构造；变更包 §八.9/W3b §7/W5 §6/W4 §6 如实披露；B2 据此判 6 项 insufficient。 |
| 环境性非确定性 | E3 新增 W20 ENOTEMPTY（隔离复跑变体进出）、4 条消失（3 波动 + 1 预期红→绿）；D1 2 处环境差异（e2e 300s、W29 12s）隔离复跑/分类；新 skip 0；已披露。 |
| B0 豁免 | 沿用记录见派发记录 §二；参照组合 4,982/4,753/196/1/32；环境差异逐条；已披露。 |
| RR 下一门 | 基线 Claude MCP schema `__ans_call_context` × `oneOf` 缺陷；不在候选 delta；本变更不修复；真机 commit 未达应用层；已披露（§八.8）。 |
| 输入版本 | 变更包引用派发记录写盘前 104 行/`5de8a556…`；当前实测 99 行/`719aad40…`；以当前为准，非候选影响。 |

## 6. 结论与状态

- **总体：insufficient evidence**（33 pass / 0 fail / 6 insufficient / 1 N/A）。
- 已确认：候选身份/稳定性、Q16 改写、W1/W2/W3a/W3b/W4/W5 新测试（67/67）、q9/N15（1/1、10/10）、D1/E3 T3 计数与新增确定性失败 0/新 skip 0、删除清单/扫描、RR AC-22/AC-23 下一门/AC-24、PR #72 与写门零 `applicationMediation`、drain 白名单与 sidecar 预算。
- 未确认：AC-1/AC-2/AC-4/AC-8/P1.2-AC-25/P1.2-AC-31 的完整效果链（commit/delivery/activation/deferred run-stop finalize）或专属 E2E；变更包已如实披露，B2 不判 pass。
- 无 fail、无安全旁路/代码返工发现；补证/夹具或 B1 解释后可复判。发布/tag、提交/推送/合并未授权；本报告不替代客户确认/实施授权。

## 7. 当前状态与限制

- 本报告只写 `docs/acceptance/`；未修改 B1/方案/代码/测试/角色卡/其他 B1。
- 未运行真实模型/Electron/CDP；未 commit/push/merge/release。
- 证据引用均为当前候选 `9462391e…` 的原始文件；若候选/基线/参照变化，按 B1 复判规则重取。
