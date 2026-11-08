# 派发与状态记录：删除全部预知式门控（实施放行 / I0 冻结 / W 批次）

- **任务 ID**：`2026-11-08-remove-predictive-gates`；flowId `remove-predictive-gates`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-08
- **性质**：统筹派发/状态/接口评审记录，不是 `task_ops` 机器状态，不是验收结论；不授权提交/推送/合并/发布（提交/推送/合并按委托，发布/tag 除外）。
- **当前状态**：**实施已由沟通放行**（2026-11-08，第一变更 PR #73 MERGED、merge commit `bac1f94c…` 后）。I0 已冻结（§三）；W1/W3a 已派发；D1/RR/E3/E3-B 待各批完成后推进。

## 一、依据与冻结对象（写盘前实测）

| 对象 | 实测 |
| --- | --- |
| 设计 **P1.4**（语义等价于 P1.3，纯文本勘误） | `docs/planning/2026-11-08_design_git-write-init-approval-based.md`：822 行 / 124,066 bytes / SHA-256 `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc`（取代 P1.3 803 行 / `94f71fcb…`） |
| 复核记录 | `docs/planning/2026-11-08_review_git-write-init-approval-based.md`：178 行 / `a2468ed0…`（F1–F12/R1–R10/S1–S5 已处置） |
| **B1 v1（冻结）** | `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`：182 行 / SHA-256 `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c`；全部条目 `未取证`；B2 唯一判据 |
| 团队计划（冻结，引用不变） | `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`：503 行 / 66,827 bytes / `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808` |
| 闸门 1/2 留痕 | `docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`：47 行 / SHA-256 `63a62a3442c3e8a8cfc5a310a7f86f92b920678245e30e43cb0e3e2d39c06987`（含 P1.4 等价映射与闸门 2） |
| 客户指令 / 预授权 / B0 豁免 | `…2026-11-08_intent_remove-predictive-gates.md`（33 行 / `603e7ef9…`）；`…2026-11-07_preauthorization_proceed-without-gates.md`（38 行 / `e2bdd96b…`）；`…2026-11-08_waiver_baseline_session-admission.md`（18 行 / `d7a699d2…`） |
| 参照基线（第一变更 E3 T3 **组合**） | E3 记录 `角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`（169 行 / `5cba2d548b31f83c7966d3276ebe979c42329aa3c3904d66572ff2ec923dab33`）**4,979 tests / 4,750 pass / 196 fail / 1 cancelled / 32 skip** + 补证 `2026-11-08_B2-gap-integration.md`（89 行 / `54c0db31146f24278eae9d15b20cee6513c7a8f57d168f2fea1fe38384a7c0ee`）**+3/3 pass** ⇒ **组合 4,982 / 4,753 / 196 / 1 / 32**；对比按（文件 + 测试名 [+ 类别]）逐条，新增确定性失败 0、新 skip 0 |
| 第一变更收尾（只读） | PR #73 MERGED（merge commit `bac1f94c…`，2026-11-08T08:48:27Z，协调方通知；本地未 fetch，基线以工作树 HEAD 核对）；B2 v2 `docs/acceptance/2026-11-08_session-admission-approval-report-v2.md`（`71b41879…`，pass 35/0/0/6） |

## 二、基线（实施启动门核对）

- **实施基线**：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，**HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`）**；第一变更产品/测试提交 `2ca434a`、T1 独立候选 `9bca68a`、治理文档 `3f249e2` 均已在基线内（T1 三文件已提交，不再以未提交态单列；不属本变更候选 delta）。
- **工作树**：`src app test` 干净（无修改/未跟踪）；tracked 修改仅 `docs/communication/memo.md`（非本变更写集）；管理文档（`docs/`、角色卡证据）与临时文件为未跟踪，不入本变更候选。写本记录时实测。
- **B0 豁免（沿用）**：按协调方 2026-11-08 指示，客户 B0 豁免（「基线搞他干啥」）**沿用覆盖本变更**——不作正式 B0 重登记；回归参照=第一变更 E3 T3 组合（§一）；变更包/B2 必须披露豁免沿用、参照来源与环境差异。
- **串行前置已满足**：第一变更 E3 完成且已合并（PR #73）；I0 已冻结（§三）；沟通已放行实施。与已合并代码的 5 文件（`src/service/runtime/session.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/trunk/impl/git-command.ts`、`app/desktop/session.ts`）+ 潜在第 6（`src/provider/trunk/public/trunk-store.ts`，I0 冻结为需要）+ R14 测试重叠，全部按串行单写者执行（§三 I0-2/§四）。

## 三、I0 接口评审结论（实施接口基准，已冻结）

> 由统筹汇总受影响方约束（P1.4 §3.3/§3.4.3/§3.7/§3.8、B1、团队计划 §5.3）；各批次在证据中确认「按 I0 执行/偏差=0」。实施中发现必须偏离 → 停止并回报统筹（不得自行变更）。

| # | 事项 | 定稿结论 |
| --- | --- | --- |
| I0-1 | sidecar 写入契约 | 路径固定 `<canonical projectRoot>/.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`；append 单次写入（`O_APPEND` + 单次 write，短写/失败 ⇒ `git-action-audit-unavailable`）；项目版本锁/operation 锁内写入；拒绝符号链接/nlink≠1/越界路径；**预算冻结：单行 ≤4 KiB、同一 operationId 最多 16 次尝试、文件 ≤64 KiB（4×16=64，自洽）**；读取容错：末行截断可忽略并留诊断，坏 JSON/超长行/未知字段 fail-closed；v1 白名单字段（无凭据/环境）；append 失败 ⇒ 动作不执行、无 ref/对象/工作树副作用；不改 `GitRefJournal`/`GitInitializationRecord` 与 replay/settlement 身份 |
| I0-2 | sidecar 写前锚点（E-a 冻结） | **默认：调用点 append**——在 `trunk-runtime.ts` 各动作「closure → policy → current → **append** → execute」处写入（commit/integrate/revert、init、delivery、文档/计划/激活发布、initial workflow），append 在调用 `service.execute*`/`service.commitPrepared*` 之前（trivially 先于 publish safeWrite/update-ref、candidate journal/对象/ref、`writeGitInitializationRecord(prepared)`、store 写入）。**`apply-journal.ts` 仅做 C5 run-stop drain（不写 sidecar）；`git-trunk-store.ts`/`git-capabilities.ts` 默认不改**（条件写集解除）。`src/provider/trunk/public/trunk-store.ts` **需要**新增 sidecar append/read 公共导出（trunk-runtime 经公共入口消费；潜在第 6 重叠文件，串行）。若实施发现必须进入 service/store 内部锚点 ⇒ 停止回报，修订 I0 |
| I0-3 | drain 原因分类（逐条冻结） | `DRAIN_EVIDENCE_ONLY_REASONS = {"native-provider-not-proven-quiescent","native-provider-process-coverage-unavailable"}`；`DRAIN_NATIVE_EVIDENCE_REASONS = {"native:pi-sdk-owned-process-tree-coverage-unavailable","native:pi-sdk-http-transport-close-unobservable","native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.","native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown."}`（代码实测 `session.ts:805/820/823`、`real-adapter.ts:1460-1465`、`claude/session.ts:536-537`，`native:` 前缀由包装层加）；**未列/未知 reason 一律阻断**，含 `native:pi-sdk-idle-not-observed`（非 idle）、`native:pi-raw-prompt-pending`、`native:pi-owned-mcp-close-pending`、`native:pi-native-stop-operation-failed`、`native:native-tool-handler-running`/`native:native-tool-not-terminal`/`native:native-mcp-process-coverage-unavailable`、`native-provider-lifecycle-read-failed`、`real-provider-settled-not-observed`、`provider-abort-cleanup-failed`/`native-stop-facts-invalid-or-failed`/`owned-process-stop-failed`/`background-stop-not-proven`、`custom-provider-disposal-coverage-unverified`；谓词 = providerFinished ∧ activeTools=0 ∧ tracked processes exited（tree verified 或 background 以 stop/exited 为准）∧ 白名单外无 reason；**F7**：`stopAndInspect` 活动排空循环 quiescent 快路径或 drain 即返回（不默认耗满 5s） |
| I0-4 | gate 输入/输出形状 | `inspectGitActionAuthorization(input)`：`{projectRoot, taskId, parentCoreSessionId, expectedActor:{roleId?,coreSessionId?}, expectedTool（active-tool 模式必填，缺失⇒`git-actor-core-binding-unproven`）, authorizationMode:"active-tool"|"host-continuation", hostContinuation?:{requesterTurnId,planId}}`；输出 `{ok, registryRevision, inventoryRevision, rootsDigest, actor:{entryId,coreSessionId,roleId,runtime,taskId?,runId?,turnId,projectRoot}, controls:{drain:{disposed},fileWriteProtection?,roleCapabilityGuards?}, optionalEvidence:{toolSurfaceStatus?,nativeStatus?,nativeReasons?,processCoverage?,configuredForeignMcpServers?,unknownTools?}}`；**不返回** authorization/policyInputDigests/leaseId（调用点组合）；optionalEvidence **不读** `applicationMediation`（PR #72 零引用保持） |
| I0-5 | finalize 顺序与宿主继续 | `finalizeRunChange` 保持 gate（原 `:748`）先于 host lease（原 `:750`）的既有顺序；gate 只做闭包、无 policy/lease 判定、**不写 sidecar**（终止事实写 run transition journal）；`host-continuation`：接受 active 或真正 settled（disposed+drain）的 rapporteur，匹配 `requesterTurnId`/`input.taskId`（inventory 唯一 live/disposed 记录 + `held.plan.requesterTaskId`）/`roleId`/`projectRoot`，不要求 live member/activeTools；`RunChangeHostPlan`/`ControllerStopHostPlan.handles.nativeInstanceId` 可选（Q8）；native `absent` ⇒ 允许，`present-but-changed` ⇒ `run-stop-instance-unproven`/`runtime-native-factory-plan-binding-unverified` |
| I0-6 | H13/H14 闭包 | `preparing/creating/disposing` ⇒ `git-core-in-flight-unproven`；`prepared/failed` 仅当 `never-started`+`preparedTokensRevoked`+`pendingContinuations===0`（且未 factoryEntered/nativeBindEntered）或 `failed`+`instance-bound`+drain 豁免，其余 ⇒ `git-core-in-flight-unproven`；active 条目必须可读 lifecycle/toolSurface，`core-instance-inspection-failed`/缺失/`toolSurface.sessionId/roleId/runtime` 与 entry 不一致 ⇒ `git-core-inspection-unavailable`（不 fail-open）；disposed ⇒ drain |
| I0-7 | Codex 参与与 R9 | Codex 适配器**默认零产品写入**（D1/D2/D6 仅为证据/事实同步口径；chat MCP/WebSearch 真实限制保留）；`plan.native` 只在 facts observed 且 adapter/绑定存在时投影、否则省略；`ensureAdapter` 无 adapter 时回落工厂构造；`bindRole` 仅在主动采用 native 强证明时核对（present-but-changed 拒绝、absent 允许）；F5 测试默认落 `test/runtime-core/` |
| I0-8 | 改名与标签 | `inspectInitializationProtection` → `inspectGitActionAuthorization`（注释保留溯源）；同步 `test/编排/trunk-dispatch-parent.test.ts`、`test/测试/runtime-dispatch-gate-integration.test.ts` 符号定位；O2 旧名别名默认不做；Q16 标签（`P1.3-B1-AC-26`/B1-EV3/`P1.2-AC-25`…`P1.2-AC-31`）按 B1 §0 引用 |
| I0-9 | 勘误确认 | P1.4 E-a–E-e 已落地；E-d 预算按 I0-1 冻结；条件写集按 I0-2 判定；测试路径 `test/编排/`；实现与证据按实际路径 |
| I0-10 | 不再重开 | 以上结论 + P1.4 + B1 为实施基准；新增偏差须停止回报；不改写权/客户主权/审批/审计语义 |
| I0-11 | **增补（2026-11-08，W3b 阻塞处置）write-ahead sidecar-only 目录** | sidecar 先于 journal 的 write-ahead 语义会产生仅含 `authorization.jsonl`（无 `git.json`/`init.json`/`stable-source.json`）的操作目录；`listGitOperationJournals` 必须将其识别为**合法 write-ahead 状态**（校验 sidecar 文件安全：普通文件/非符号链接/nlink===1/≤64 KiB；目录内仅 `authorization.jsonl`），不得报 `effective-manifest-corrupt`。含损坏 journal/未知文件布局的目录仍 fail-closed；journal 仍为权威（sidecar 不参与 replay/settlement）。行为方向不变，仅修复扫描器互斥。授权 编排 在 `src/provider/trunk/impl/git-command.ts` 实施该修复与测试（W3a/W3b 同一 owner，单写者；W3b 继续完成端到端证据） |
| I0-12 | **增补（2026-11-08，initial workflow write-ahead）stable-source + sidecar 共存** | initial workflow 发布的 stable-write source 与发布操作同 operationId，append 时目录内已有 `stable-source.json`；`listGitOperationJournals` 的 stable-source 分支必须容忍「`stable-source.json` + 仅 `authorization.jsonl`」布局（sidecar 安全校验同 I0-11；`stable-source.json` 既有内容/安全检查不变），不得报 `stable-work-source-directory-unknown`；其它未知文件/损坏 source 仍 fail-closed；journal 仍权威。授权编排在 `git-command.ts` 实施并完成 initial workflow 端到端/失败注入证据 |

**I0 出口**：本表冻结、无 open must-fix；各 W 批次据此施工。

## 四、派发表与状态

| 批次 | 角色（上下文） | 写集（精确） | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| W1 | 运行时核心 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/`、自身 `docs/change/` | I0 | **完成**（drain 谓词、session 收尾、F5/R9、C9、D6、R14/drain/F5 测试；runtime-core 受影响套件 523/486/33→535/498/33，失败集合一致、新增测试 12、新 skip 0；typecheck 0；证据 `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md` `b6d4f688…`） |
| W3a | 编排 | `src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts`（sidecar 导出）、`test/编排/`、自身 `docs/change/` | I0 | **完成**（sidecar append/read/安全/预算/JSONL；纯加法；`appendGitActionAuthorization`/`readGitActionAuthorizations` + 常量 4096/16/65536；测试 26→32 pass（新增 6）；typecheck 0；证据 `角色卡/编排/docs/change/2026-11-08_W3a_git-action-authorization-sidecar.md` `6a07a922…`） |
| W2 | 编排 | `src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/trunk/impl/apply-journal.ts`（仅 C5）、`test/编排/` | W1 | **完成**（gate 替换/H1–H14、B8–B10 删除、C1–C4+host-continuation、Q8、run-role/apply-journal drain；test/编排 1099/1075/22→1106/1082/22，失败/skip 集合一致、新增 7 用例；typecheck 0；证据 `角色卡/编排/docs/change/2026-11-08_W2_remove-predictive-gates.md` `fa166eed…`） |
| W3b | 编排 | `src/pipeline/orchestration/trunk-runtime.ts`（authorization 组合 + append 调用点）、`test/编排/`、`src/provider/trunk/impl/git-command.ts`（I0-11/I0-12 扫描器修复） | W2 + W3a | **完成**：5 调用点 + 16 用例（init/计划/文档/initial workflow E2E + AC-16 注入 + I0-11/I0-12 容忍）；test/编排 1106→1122（失败/skip 集合不变）；typecheck 0；`git-command.ts` `47819a19…`；证据 `角色卡/编排/docs/change/2026-11-08_W3b_remove-predictive-gates.md` `1547235e…`；覆盖边界（activation/commit/integrate/revert/delivery 完整链）交 W5/RR |
| W4 | 桌面窗口 | `app/desktop/session.ts`、`test/桌面应用/` 既有文件、自身 `docs/change/` | W1 + W2 | **完成**（native optional 判据与 W2 同构；`executeOwnedRunStop` 用 `isRuntimeSessionDrained`；新增 1 用例；chief-workflow 前 58/47/11 → 后 59/43–45/14–16，新增确定性失败=0（ENOTEMPTY/时序环境性，逐条记录）、新 skip 0；typecheck 0；证据 `角色卡/桌面窗口/docs/change/2026-11-08_W4_remove-predictive-gates.md` `210d2066…`） |
| W5 | 测试 | `test/测试/`（Q9 取代改写、gate 源码断言、e2e 评估、跨角色集成）、`角色卡/测试/docs/change/` | W1–W4（+W3b 代码完成） | **完成**：Q16 q9 改写（红→绿）+ N15 改写（10/10）+ e2e 评估；新增 5 文件 8 用例全 pass；test/测试 675/614/42/1/18→682/624/39/1/18（新增确定性失败 0、新 skip 0；3 条消失=2 预期红→绿+1 环境崩溃）；PR #72 56/56；typecheck 0；证据 `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md` `8d678fff…` |
| W6 | Codex 适配器（条件） | — | I0 | **N/A**（默认零写入；W1/W3b/W5 未触发适配器侧同步） |
| D1 | 测试 | `角色卡/测试/docs/change/`（只读 `src app test`） | W1–W6 | **完成**：候选 38 文件聚合 `9462391e…`、manifest 1,099/`bf190ee5…`（前后 diff 0）；受影响 276 文件 2,429/2,291/111/2/25；runtime-core/编排/test/测试 与批基线失败/skip 集合一致、**新增确定性失败 0、新 skip 0**；环境性差异 2 处（e2e 300s watchdog 隔离复跑 19/7/0/0/12 通过；chief-workflow W29 12s 超时=机器性能阈值，均逐条记录）；typecheck 0；证据 `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md` `10418f38…` |
| RR | 测试（统筹组织） | `角色卡/测试/docs/change/` + 仓库外临时根 | D1 | **完成**：AC-22 完整正向链（受保护 + 真实 Claude：父门受理→task.created→product `session.open.ready`→投递→真实回合，两次尝试复现）；AC-23 **如实下一真实门**——`write_file`/`git_query` 成功，`git_candidate` 在 Claude MCP schema 层被拒（-32602 invalid_union：适配器注入 `__ans_call_context` 与顶层 `oneOf`+`additionalProperties:false` 冲突；涉及 `src/provider/claude/session.ts:84`/`runtime/schema.ts:97-101`，**均为基线既有、零候选 delta**，已确定性复现）；AC-24 预算 39.8s/1 消息/1 chief 回合/1 product 回合/应用层 Git 调用 1 次，偏差如实（attempt1 fixture、停止时机、导入自动化）；候选聚合/manifest 前后 diff 0；证据 `角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md` `c40011de…` |
| E3-F | 测试 | `角色卡/测试/docs/change/`（只读 `src app test`） | RR | **完成**：540 文件（534 自然 + 6 挂起）；**5,032/4,807/192/1/32**；对参照 4,982/4,753/196/1/32 ⇒ +50/+54/−4/skip 不变；**新增确定性失败 0、新 skip 0**（新增失败 1=W20 ENOTEMPTY 波动；消失 4=W47 波动×2 + t1-real-cli 预期红→绿）；19 新文件 44 用例 + 既有 6 用例全绿；扫描/typecheck 通过；证据 `角色卡/测试/docs/change/2026-11-08_E3-F_remove-predictive-gates.md` `41a4a215…` + 索引 `44f93656…` |
| E3-B | 统筹 | `docs/scheduling/` | E3-F | **完成**：`docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md`（180 行 / 26,902 bytes / `6e598f839e476f3954fda95b728cd462b04a67485bd4eca31c58c0fddfc14025`）；候选 `9462391e…`、manifest 1,099/`bf190ee5…`；披露/删除清单/Q16/覆盖边界齐备 |
| E3-V | 内置独立验收（沟通启动） | `docs/acceptance/` | E3-B | **B2 v1：insufficient evidence**（33 pass / 0 fail / **6 insufficient** / 1 N/A；`docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md` 183 行 / `6af7f394…`；无 fail/安全返工项；6 项=AC-1/AC-2/AC-4/AC-8/P1.2-AC-25/P1.2-AC-31 完整效果链未构造）；**B2 v2：pass**（39 pass / 0 fail / 0 insufficient / 1 N/A；`docs/acceptance/2026-11-08_remove-predictive-gates-report-v2.md` 186 行 / `7b310d1a…`；6 项全部关闭、复用合规、impl 术语裁定接受、无返工/安全旁路） |
| E3-R | 统筹 | `docs/scheduling/` | E3-V | **完成**：放行记录 `docs/scheduling/2026-11-08_status-e3_remove-predictive-gates.md`（93 行 / 12,620 bytes / `5359ae02…`）；放行提交/推送/PR/合并（发布/tag 除外）；提交分组 A=44 候选、B=10 角色记录、C=12 管理文档（排除证据目录/历史/临时文件） |
| W7 | 测试（B2 补证） | `test/测试/`（新增 E2E/夹具）、`角色卡/测试/docs/change/`（D1 增补 + W7 证据） | B2 v1 | **完成**：5 项关闭全部补证（AC-1 Claude/Pi commit、AC-4 delivery、AC-8/P1.2-AC-25 deferred run-stop finalize、P1.2-AC-31 activation）；5 新测试 5/5 pass（真实 service/assemble 路径、真实 ref/journal/sidecar）；新候选 44 文件聚合 `787bd910…`、manifest 1,105/`4b5ed42f…`（38 子集 `9462391e…` 不变）；test/测试 687/629/39/1/18（+5/+5/0/0/0）、test/编排 1122/1098/22/0/2（不变）、typecheck 0；D1-R1 `4e52a01f…`；证据 `2026-11-08_W7_b2-gap-e2e.md` `3fe62b90…` + 索引 `eb149ef8…` |

## 五、批次纪律与停止条件

- 每个 W 批次：写者/写集/证据/候选哈希记录；**受影响套件实施前后对照**；不得写写集外文件；不得提交/推送/暂存/合并/发布。
- 不得删除测试/放宽断言/加 skip/force-exit 求绿；跨角色只读消费经公共出口（`src/service/gate/shell-rules.ts`、`src/provider/trunk/public/trunk-store.ts`、`src/common/shared/`、`src/model/`）。
- **条件 H1 停止条件**：在 `test/桌面应用/` 新建文件、或需写任何 Section 1 未覆盖路径、或 I0-2 需进入 service/store 内部锚点/新共享件 → 立即停止并回报统筹（人事 H1 / ANS Governance 处理）。
- 真实运行（RR）如环境/凭据/UI 自动化不可达，按 B1 AC-24 如实记录并回退确定性证据，不伪造、不追加预算。
- 本变更不得改 PR #72/派发父门/applicationMediation 契约；写/发布门零引用 `applicationMediation`。

## 六、状态更新记录

- 2026-11-08：团队计划写盘并冻结（`911ff546…`）；P1.4 等价映射记录（见 §七）。
- 2026-11-08：第一变更完成并合并（PR #73，merge `bac1f94c…`）；沟通放行本变更实施；B0 豁免沿用（参照 4,982/4,753/196/1/32，`5cba2d54…`+`54c0db31…`）；B1 v1 冻结（`3306b9d4…`）；I0 冻结（§三）；派发 W1、W3a。
- 2026-11-08：**W1、W3a 完成**（证据/计数见 §四）；统筹独立复跑新增定向测试 15/15 pass、`npm run typecheck` exit 0；派发 W2（编排·授权门与停稳）。
- 2026-11-08：**W2 完成**（gate/H13-H14/停稳/host-continuation/Q8；test/编排 失败/skip 集合不变、新增 7 用例；typecheck 0；证据 `fa166eed…`）；派发 W3b（sidecar 调用点接线）。
- 2026-11-08：**W3b 部分完成并报告阻塞**：sidecar 先于 journal 的 write-ahead 目录被 `listGitOperationJournals` 误判为损坏（`effective-manifest-corrupt`；已复现）。统筹核对 `git-command.ts:409-` 确认。**I0-11 增补**：sidecar-only 目录为合法 write-ahead 状态，扫描器须容忍（保持 fail-closed 边界）；授权编排在 `git-command.ts` 修复并继续 W3b 端到端证据。
- 2026-11-08：**W3b（I0-11 后）主体完成**：扫描器修复 + 5 调用点 + 12 用例（1118/1094/22/0/2）；init/计划/文档发布 E2E + AC-16 注入通过；initial workflow 需 I0-12（stable-source+sidecar 共存），已增补并返工。**W4 完成**（证据 `210d2066…`；新增确定性失败=0、新 skip 0；typecheck 0）。
- 2026-11-08：协调方确认本地 HEAD `3f249e2` 即 PR #73 合并前分支尖端（远程 merge `bac1f94c…` 内容相同，无需 fetch）；B0 豁免沿用、参照 4,982/4,753 确认；要求 W5 按 Q16 改写 Q9 断言、W4 波动在 D1/E3 按测试名逐条确认。**W3b I0-12 代码实测已落**（`git-command.ts` `47819a19…`；容忍测试 4/4）；**W5 已派发**；W3b 证据收尾并行。
- 2026-11-08：**W3b 完成**（I0-11/I0-12；16 用例；初始 workflow E2E+AC-16；test/编排 1122/1098/22/0/2；证据 `1547235e…`）；**W5 完成**（Q16 改写+跨角色集成；test/测试 682/624/39/1/18；证据 `8d678fff…`）；W6 N/A；**派发 D1**。
- 2026-11-08：**D1 完成**（候选 `9462391e…`；新增确定性失败 0/新 skip 0；环境性差异 2 处逐条记录；证据 `10418f38…`）；**派发 RR**（真实 Claude 最小运行）。
- 2026-11-08：**RR 完成**（AC-22 正向链达成；AC-23 如实下一门：真实 Claude `git_candidate` 被既有 Claude 适配器 MCP schema `__ans_call_context`×`oneOf` 缺陷阻断（基线既有、非本候选；`src/provider/claude/session.ts:84`、`runtime/schema.ts:97-101`）；预算 39.8s、候选稳定；证据 `c40011de…`）；**派发 E3-F**（全量 T3）。
- 2026-11-08：**E3-F 完成**（5,032/4,807/192/1/32；参照差值 +50/+54/−4/0；新增确定性失败 0/新 skip 0；证据 `41a4a215…`）；**E3-B 完成**（`docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md` `6e598f83…`）；**待沟通启动 B2**（本上下文不判验收）。
- 2026-11-08：**B2 v1 = insufficient evidence**（33/0/6/1；6 项为变更包 §八.9 已披露覆盖边界：AC-1 Claude commit、AC-2 Pi commit、AC-4 delivery、AC-8+P1.2-AC-25 deferred run-stop finalize、P1.2-AC-31 activation）；无 fail/安全返工。协调方指示补确定性完整效果链 E2E；**派发 W7（测试角色，`test/测试/` 内）**；完成后重算候选/聚合/manifest 并按复用规则复判。
- 2026-11-08：**W7 完成**：5 项 B2 缺口的确定性完整效果链补证全部通过（5 新测试 5/5；真实 ref/journal/sidecar 原件）；新候选 44 文件聚合 `787bd910…`、manifest 1,105/`4b5ed42f…`（38 子集 `9462391e…` 不变、产品零改动）；test/测试 687/629/39/1/18、test/编排不变、typecheck 0；D1-R1 `4e52a01f…`；W7 证据 `3fe62b90…`。**变更包已更新为 v1.1（`58a394cc…`）；待沟通启动 B2 v2 复判**。
- 2026-11-08：**B2 v2 判 pass**（`7b310d1a…`；39/0/0/1；6 项 insufficient 全部关闭；复用合规；`impl` 术语裁定接受；无返工/安全旁路）；**E3-R 放行记录写盘**（`docs/scheduling/2026-11-08_status-e3_remove-predictive-gates.md`）；放行提交/推送/PR/合并（发布/tag 除外）；提交分组 A=44 候选 / B=10 角色记录 / C=12 管理文档；非阻塞后续：Claude MCP schema 缺陷另案（合并后）。

## 七、设计版本映射（P1.4 ↔ P1.3）

> P1.4 是 P1.3 的**纯文本勘误**（团队计划 §4.8 E-a–E-e；P1.4 §8.4）：语义等价，不改方向、写集唯一性、Q 清单与 T3。团队计划引用不变（仍以 P1.3 为语义基线，哈希 `911ff546…`）；**实施选型以 P1.4 文本为准**。

| 勘误 | P1.4 落地 | 实施取向（I0 冻结） |
| --- | --- | --- |
| E-a | 写集表 `git-command.ts` 行扩为「+ 条件锚点 `git-trunk-store.ts`/`git-capabilities.ts`；`public/trunk-store.ts` 仅 I0 要求公共出口时」 | **I0-2：调用点 append；条件锚点文件默认不改；`public/trunk-store.ts` 需要导出（潜在第 6 重叠）** |
| E-b | Codex 条件参与（默认零写入），仅 D1/D2/D6；D6 归运行时核心 | I0-7；W6 N/A |
| E-c | 测试路径 `test/编排/` | W2/W3a/W3b 测试落点 |
| E-d | 预算候选 4 KiB×16=64 KiB，I0 冻结 | I0-1 冻结 |
| E-e | 标签约定（`AC-1`–`AC-24`、`P1.2-AC-25`…`-31`、`P1.3-B1-AC-26`、B1-EV3） | B1/变更包按标签引用 |
