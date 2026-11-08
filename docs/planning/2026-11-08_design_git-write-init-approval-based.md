# 删除全部预知式门控 + Git 写/仓库初始化改为「动作时授权」：方案（P1.4）

- 版本：**P1.4 草案，2026-11-08**；ANS 策划（Planning）独立上下文。**取代 P1.3**（803 行 / SHA-256 `94f71fcbb0d4287fe7ed38c2b7b396d77a9bcdb6f8ff5984146c7495f82a1566`）、**P1.2**（792 行 / `36b81769…`）、**P1.1**（748 行 / `6e117d36…`）与 **P1.0**（643 行 / `72259e4e…`）；历史版本保留、不再作为闸门 1 材料。P1.0 首版即按客户扩大的范围编写：**删除全部预知式门控**（客户原话「这个预知门控全部删掉」），并把受保护项目的 Git 写/仓库初始化保护门改为**动作时授权 + 审计**。**P1.4 为纯文本勘误（团队计划 E-a–E-e；语义等价，不改方向/写集唯一性）**，见 §8.4；方向、Q 清单与 T3 不变。
- 状态：**待闸门 1 客户确认（预授权覆盖）、待实施（按第二变更团队计划串行：在飞变更 E3 完成 + I0 + 沟通放行）；未实施、未测试、未验收、未 commit/push、未运行真实模型。** 本文件是设计候选；客户在闸门 1 确认的版本才是实施与验收基线。
- 风险档位：**T3（建议，详见 §4.3）**。理由：删除/替换写/发布/停稳门中的预知式证据要求，改变受保护项目 Git 写与仓库初始化的授权语义，触及运行时核心/Core 注册表/编排/trunk Service/Provider/桌面/Codex 适配器多个共享契约，属治理/权限/审批边界变更，不得按 T0–T2 处理。
- 依据（本检出只读核对）：
  - 意图记录 ①：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行 / SHA-256 `51918bc90b25691659aa515bfd475c953e5facb356bc343c2e05e594d779c108`）。客户原话：「这个明显不现实啊，运行非只读命令走审批流程就行了。你还出厂就知道，别人调用什么命令啊。」含补充规格「git 命令只读放行，每个角色的专属git 命令放行」。
  - 意图记录 ②：`docs/communication/2026-11-08_intent_remove-predictive-gates.md`（复核快照 `wc -l` 33 行、末尾无换行；SHA-256 `603e7ef9b5f99259a7aa1bc04a8be7115bc0145a4889d1369dbc9cecb22f10a3`）。客户原话：「这个预知门控全部删掉」。其「理解」节逐条列出：会话创建 native factory plan、`hasUnconfinedScriptTools` 创建期拒绝、`inspectInitializationProtection` 注册表级要求、所有 `native-plan-*`/`native-tool-*`/`process-coverage-*` 等基于预知面的拒绝原因、Codex strict native plan 作为门控的部分（可保留为可选证据）。
  - 当前变更（会话准入按操作审批）方案：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（复核快照 P1.3，855 行 / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`；在飞实现期间行号可能继续漂移）。本方案**复用**其审批/审计接线与 `approvalChain`/`shell-approval-binding` 接口，不重复造轮子；对 P1.3 中「codex 保留 native plan 阻断」与「Git 写门不放宽（Q9/`P1.3-B1-AC-26`）」两处**显式取代**，见 §4.2。
  - 上一变更方案：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md`（P1.6；PR #72 派发父门/应用中介证据契约）。本方案**不改**该契约（§4.2）。
  - E0 契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.3，685 行 / `067e3d2e…`）与冻结记录 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（91 行 / `5439d7c3…`）。模块 owner/写集沿用其约定。
- 复核记录：`docs/planning/2026-11-08_review_git-write-init-approval-based.md`（**当前 178 行 / `a2468ed0…`**；含 P1.0 完整复核 F1–F12、P1.0→P1.1 窄复核 R1–R10、P1.1→P1.2 短核对 S1–S5）。P1.0 当时的 91 行 / `d61d731d…`、P1.1 时的 138 行 / `b112f297…` 是历史版本，不作为当前复核结论。
- 第二变更团队计划：`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / `911ff546…`；其 §五 E-a–E-e 为本版勘误来源，实施按实际路径与 I0 冻结结果串行推进）。
- 代码基线：worktree `.claude/worktrees/trunk-amendment`，HEAD `a1b2f66`；工作树另有**当前变更在飞改动**（复核期间可见 `src/service/runtime/session.ts`、`src/model/runtime.ts`、`src/common/门禁引擎/classify-shell.ts`、`shell-write-guard.ts`、`src/service/gate/shell-rules.ts`、未跟踪 `src/common/shared/shell-approval-binding.ts` 等）与 Claude schema 窄修复（T1）的未提交改动——**均只读引用，不在本方案写集**。本文行号均为该快照只读核对结果；实施以符号名与文本锚点为准，不以行号为契约。
- 标记约定：**[事实]** 已只读核实的代码/文档行为；**[推断]** 基于代码但未经真实运行证实；**[设计候选]** 本方案提议、未实施；**[待确认]** 见 §7。

---

## 0. 摘要（先读这段）

### 0.1 问题

1. **真实闭环的下一个门**：真实 Claude 最小派发中，目标 product 会话创建被拒（`runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`）[事实]。当前「会话准入按操作审批」变更正在删除该创建期预知要求（P1.3 §2.2）。
2. **下一道门是 `inspectInitializationProtection()`**：受保护项目的 **Git 写/仓库初始化/交付/文档发布/运行变更/停稳** 都要先过此门；它对 Core 注册表中**每个 active 条目**要求 `lifecycle.processCoverage === "complete"`、`toolSurface.status === "observed"`、`nativeToolRegistry === "application-mediated"`、`native.factoryPlan` 存在（`src/pipeline/orchestration/trunk-runtime.ts:67-153`，关键条件 `:112-119`）[事实]。Claude/Pi 的 native 事实与 `processCoverage` 结构性不存在（`src/service/runtime/session.ts:837-863`；`src/provider/claude/session.ts:518-542`；`src/common/pi-adapter/real-adapter.ts:1448-1466`）；只要进程内存在任一 Claude/Pi（或 arm 了 shell 的 Codex）active/pending 条目，该门即不可满足 [事实+推断，与 P1-RR 证据链一致]。
3. **客户方向已扩大**：不只修 Git 写/初始化门，而是删除**全部预知式门控**——凡要求「动作发生前预知/证明未来能力面」的检查与拒绝原因，一律删除或降级为可选证据；替代原则是**动作时授权**（真实角色/任务/回合/项目身份 + 角色 ACL/写集 + 审批 + 审计），身份/权限无法证明时 fail-closed [意图记录 ②]。

### 0.2 本方案（设计候选）

1. **统一原则：证据 ≠ 授权**。`native factory plan`、`toolSurface.status`、`processCoverage`、Codex strict 路径等继续作为**诚实证据**如实产生（PR #72 契约不变），但**不再作为**会话创建、Git 写/初始化、run-stop/controller-stop 的放行前提。凡「缺失即拒绝」的预知式消费者，删除或改为动作时授权。
2. **Git 写/初始化门替换**：`inspectInitializationProtection()` 收窄为 `inspectGitActionAuthorization()`（名称候选）——只在**实际执行 Git 写/初始化/交付/文档发布/运行变更动作时**核验：真实 actor Core 会话/角色/项目/任务/回合/active tool、角色 ACL、`checkGitPolicy` 纯策略、根身份、host mutation lease（单写者），以及**两阶段 revision/rootsDigest 复检**。注册表级「所有 active Core 条目 strict observed/native factoryPlan/processCoverage complete」要求**删除**；disposed 条目的终止证据改为**运行时中立**谓词（tracked processes 已退出 + providerFinished + 无 active tool），`processCoverage === "complete"` 与 native 事实不再是前提。
3. **Codex strict 路径保留为可选强证明**：`prepareNative`/`native-plan-*` 事实仍可产生并绑定（observed 时作为可选证据）；不可用/unknown 时**不再阻断**会话创建或 Git 动作。Codex chat 传输对 MCP/服务端 WebSearch 的**真实不支持**（构造期抛错）保留，如实报错（这不是预知门）。
4. **run-stop/controller-stop 联动**：`run-stop-unverified`、`run-stop-member-lifecycle-unproven`、`controller-stop-target-instance-unproven`、`controller-stop-terminal-unproven`、桌面 `run-stop-lifecycle-unproven` 中的 native/`processCoverage`/quiescent 要求改为**运行时中立 drain 谓词**；**deferred run-stop 的宿主继续 finalize 走 `host-continuation` 分支**（不要求 active tool）；Claude/Pi 的 native 进程树不可观测按客户决定接受并披露。
5. **审批/审计接线不重造**：shell 面复用当前变更建立的 `shell-approval-binding`（`inspectShellApproval`/`probeShellApproval`）、`shell-gate`/审批卡/「替我审批」/`docs/audit/shell-gate.jsonl`；结构化 Git 写入复用既有 `git_candidate`/`git_publish` ACL + 任务/回合绑定 + `checkGitPolicy` + host lease + 操作 journal，并在操作目录新增**append-only sidecar authorization 记录**（谁/何时/以什么身份/多策略摘要/什么租约）作为动作时审计。越权/未审批/伪造身份/审计不可写一律拒绝（fail-closed）。
6. **只读/非只读边界不重复定义**：Git 只读 shell 白名单、`git_query`/`git_candidate`/`git_publish` 的角色 ACL 与参数级策略，沿用当前变更 P1.3 §2.4.3/§2.4.4 的既定口径（§3.6 仅引用）。

### 0.3 客户可见结果（设计候选）

- 受保护项目中，Claude/Pi/Codex 角色会话均可创建；**Git 写/仓库初始化不再因「进程内其它会话没有 Codex 原生证明」被拒**；角色在其 ACL/写集/任务绑定范围内可执行 `git_candidate commit/init/integrate/revert`、`git_publish documents/delivery`，并留操作 journal + authorization 审计。
- Codex 有 native 强证明时仍记录（可选证据）；没有时不影响放行，也不再要求「全部会话都是 Codex 原生闭包」。
- run-stop/controller-stop 对 Claude/Pi 运行成员可用（以 Core/tracked-process 终止事实为准；native 进程树不可观测如实披露）。
- 越权/伪造身份/过期任务/策略不符/并发写冲突仍拒绝；失败回执保留既有错误码并如实说明。

### 0.4 本方案不做

不实施、不跑真实模型、不改任何产品/测试/角色卡/边界文件；不开放无审批自由 shell/Git 写；不删除身份/授权/ACL/写集/客户主权/验收/审计语义；不把 Git 写改成客户审批卡（结构化能力授权更强）；不改 PR #72 派发父门/应用中介证据契约；不建 DSL/工作流引擎；不新增角色。

---

## 1. 问题陈述与现状（真实代码证据）

### 1.1 真实触发链（P1-RR）

- 真实 Claude 最小派发：`dispatch_task` 通过派发父门、任务创建成功；随后目标 product 会话创建被拒（证据 `角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md` §6.3/§6.4）[事实]：
  `runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`。
- 当前变更（P1.3）修复创建门后，**已知的下一道门**是 `inspectInitializationProtection()`；P1.3 §0.3/Q9 已显式披露「本变更不放宽该门」[事实]。客户随后把范围扩大为「删除全部预知式门控」[意图记录 ②]。

### 1.2 现行 Git 写/初始化门的逐行事实（`src/pipeline/orchestration/trunk-runtime.ts`）

| # | 位置 | [事实] 行为 | 类别 |
| --- | --- | --- | --- |
| G1 | `:70-73` | 无 host inventory / 有 pendingOpens / 有 creating·disposing·dispose-failed 会话 ⇒ `git-host-inventory-unavailable` / `git-host-admission-in-flight`。 | 真实 host 事实 |
| G2 | `:74-78` | 失败准入 recheck 必须与 registry 同进程/同 revision，否则 `git-host-admission-in-flight`。 | 真实 host 事实（但 recheck 依赖 `processCoverage`，见 A10/C7） |
| G3 | `:79-81` | `pipeline.unknownFactoryAttempts` 非空，或某 app controller 不在 Core 注册表 ⇒ `git-app-controller-history-unproven`。 | 身份/历史 |
| G4 | `:82-83` | 真实 source parent 不在本进程 Core 历史（chief/项目根）⇒ `git-source-process-history-unproven`。 | 身份 |
| G5 | `:84-88` | 真实 actor（task/role/coreSession）不唯一或 Core 条目非 active/非真正 settled ⇒ `git-actor-core-binding-unproven`。 | 身份 |
| G6 | `:89-93` | 每个真实 desktop controller 必须在 Core 注册表中有匹配 role/runtime 的条目 ⇒ `git-controller-history-unproven`。 | 身份 |
| G7 | `:94-96` | `readGitProtectionFacts` 的 protectedGitRoots 必须恰为 `[projectRoot/.git]` ⇒ `git-root-discovery-unproven`。 | 根身份 |
| G8 | `:97-111` | 逐个 registry entry：prepared/failed 需 never-started + revoked + 无 pending；failed instance-bound 需 quiescent + `processCoverage === "complete"`；disposed 需 quiescent + `processCoverage === "complete"` + processes exited/verified；active 需 planId、无 reasons、`processCoverage === "complete"`、processes exited/verified。拒绝码 `git-core-creation-proof-unavailable` / `git-old-core-programs-unproven`。 | **注册表级预知/终止** |
| G9 | `:112-119` | 每个 active entry 需 `toolSurface.status === "observed"`、`nativeToolRegistry === "application-mediated"`、`processCoverage === "complete"`、`native.factoryPlan`、无 foreign MCP、无 reasons ⇒ 否则 `git-native-surface-unproven`。 | **注册表级预知** |
| G10 | `:120-143` | 每个 active entry 的 `appTools` 必须是 `closedTools` 白名单或四个已绑定无副作用能力回调；未知工具 ⇒ `git-unclosed-effect-registered`；能力回调绑定需 `nativePlanId/nativeConfigDigest` ⇒ `git-role-capability-guard-unproven`。 | **注册表级预知**（能力面封闭性） |
| G11 | `:144-150` | 若 entry 有 `write_file`/`edit_file`，其 `fileWriteProtection` 必须覆盖当前 `.git` 根 ⇒ `git-file-final-guard-unproven`。 | 控制面证据 |
| G12 | `:212-216, :226-247, :268-272, :330-336, :356-361, :693-694, :748` | 动作前后各一次 gate；`registryRevision`/`inventoryRevision`/`rootsDigest` 变化 ⇒ `git-*-protection-stale`；mutation lease 由 `beginGitHostAction` 独占。 | 真实闭合/租约 |

**调用点（[事实]）**：`git_candidate` commit/integrate/revert（`:212,214`）、init（`:226,244`）、git_publish delivery（`:268,270`）、文档/计划/激活发布（`:330,334`）、initial workflow 发布（`:356,359`）、`prepareRunChange`（`:693`）、`finalizeRunChange`（`:748`）。只读 `git_query` **不经过**该门（`:162-172`）；`git_publish documents` 直接 `service.publish`（`:251`）。

### 1.3 为什么 Claude/Pi 结构上不可满足（[事实]）

1. `inspectToolSurface()` 的 strict 路径要求 `inspectNativeToolSurface()`、`nativeLifecycle`、native 执行覆盖、Codex chat factory 等（`src/service/runtime/session.ts:837-863`）；非 Codex 无 `inspectNativeToolSurface` 实现（全仓唯一实现 `src/common/codex-adapter/chat-transport.ts:259`），故 `status` 恒 `"unknown"`（`session.ts:842-844`）。
2. Claude `inspectNative()` 明说 SDK 不暴露 PID/进程树/关闭确认，`processCoverage: "unknown"`（`src/provider/claude/session.ts:518-542`，`:534`）；Pi 同样 `processCoverage: "unknown"`（`src/common/pi-adapter/real-adapter.ts:1448-1466`，`:1459`）。
3. Core 包装层把 native 覆盖并入 lifecycle：`coverageUnknown` ⇒ `processCoverage: "unknown"`（`session.ts:700-753`，`:711,753`）；native 非 quiescent ⇒ `native-provider-not-proven-quiescent` reason 并使 `status` 可能为 `"unknown"`（`:720-724, :748`）。Claude/Pi 在空闲时 native `status` 也返回 `"unknown"`（Claude `:529`；Pi `:1454`），因此其 Core lifecycle **可以长期不是 quiescent**。
4. 构造事实 `registry.construction()` 以 `trustedPurePreparation`（需要 Codex native plan observed）决定是否加 `official-pure-preparation-unproven`（`session.ts:357-366`，`:580-582`）；该 reason 使 never-started 的 prepared/failed 条目变成 `possibly-started`，从而无法走 `trunk-runtime.ts:100-101` 的豁免。
5. 失败准入 recheck 对 instance-bound failed 条目要求 `lifecycle.status === "quiescent"` 且 `processCoverage === "complete"`（`src/pipeline/orchestration/run-role.ts:694-704`，`:700-702`），Claude/Pi 的失败打开同样结构性不可满足。
6. 结论：现行门不是「Claude/Pi 缺一个可选证据」，而是**以 Codex 原生闭包为进程级放行前提**；这与客户「无法预知命令 → 按操作审批」及「预知门控全部删掉」的方向直接冲突。

### 1.4 根因归纳

1. 把「运行期才决定/才能观测的事实」当成「动作前必须证明的静态事实」：未来命令面（native factory plan）、未来工具面（closedTools）、其它会话的能力面（strict observed）、其它会话的进程覆盖（processCoverage）。
2. 用**进程级**注册表闭包替代**动作级**授权：任何无关会话（judge/pm/Claude/Pi）都会使 Git 写不可用；而真正决定安全性的「谁在什么任务/回合/角色/写集内执行、是否经 ACL/策略/租约/审计」在动作点已经存在（§3.3）。
3. Codex strict native plan 被当成通用放行前提，而不是可选强证明；导致非 Codex 结构性被拒。
4. 停稳/运行变更同样把 Codex native 终止证据当成通用前提，Claude/Pi 的六角色闭环无法完成 run 停止。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：删除全部预知式门控的**放行前提**语义：`hasUnconfinedScriptTools`、native factory plan 作为创建前提、`inspectInitializationProtection` 注册表级要求、`native-plan-*`/`native-tool-*`/`process-coverage-*` 类拒绝原因、Codex strict native plan 作为门控。证据仍可如实产生（可选）。
- **G2**：受保护项目的 Git 写/仓库初始化改为**动作时授权**：真实角色/任务/回合/项目 + 角色 ACL/写集 + `checkGitPolicy` + host mutation lease + 两阶段复检 + 审计；任何身份/权限/审计不可证明 ⇒ fail-closed。
- **G3**：Claude/Pi/Codex 均可在受保护项目中完成角色 ACL 内的 Git 写/初始化/发布并留审计；Codex 有 native 强证明时仍可选记录。
- **G4**：run-stop/controller-stop 采用运行时中立 drain 谓词，含 **deferred 宿主继续（host-continuation）**；Claude/Pi 运行成员可停止；native/processCoverage 作为可选证据。
- **G5**：复用当前变更的审批/审计接线（`shell-approval-binding`/`shell-gate`/`shell-audit`），不新建第二套审批链或 DSL。
- **G6**：不改写权/角色边界/客户主权/验收权；不改 PR #72 派发父门/应用中介证据契约；不开放无审批自由 shell/Git 写。

### 2.2 非目标

- 不删除身份/授权/ACL/写集/任务/回合/根身份/租约/审计语义；不把 `unknown` 当 `observed` 或放行。
- 不把 Git 写改成 shell 审批卡或自由命令；Git 写仍只走结构化能力。
- 不放松 `custom-override`/`demo` factory 的受保护拒绝（非预知门；客户未要求，见 Q14）。
- 不改变 stable-write 的一次性许可、写权边界、D3、版本决策、发布/tag。
- 不重写 Codex chat 传输对 MCP/WebSearch 的**真实能力限制**（构造期错误不是预知门）。
- 不在本变更里实现（只出方案、不写代码、不跑模型）。

---

## 3. 设计

### 3.1 总览：从「预知能力面」到「动作时授权 + 可选证据」

```
创建期（prepareRole / bindPreparedRole）                 动作期（每次 Git 写/初始化/停稳）
─────────────────────────────────────────                ─────────────────────────────────────────
真实角色/运行时/项目根（既有）                            真实 actor Core 会话/角色/项目/任务/回合/active tool
保护范围快照 + revision（既有）                              │
工具注册表精确快照/handler 身份（既有）                      ├─ 角色 ACL + 写集 + checkGitPolicy 纯策略
【当前变更】受保护+shell ⇒ 审批 binding + 审计探针（既有）    ├─ host git-mutation lease（单写者）
【本方案删除】native factory plan 作为创建前提               ├─ 根身份 + revision/rootsDigest 两阶段复检
【本方案删除】hasUnconfinedScriptTools 创建期拒绝            ├─ 结构化能力 journal + authorization 审计
【本方案保留】身份/权限证据 fail-closed                       └─ 可选证据：native/toolSurface（不参与放行）
【本方案保留】Codex native plan 作为可选强证明
```

关键点：**「其它会话有没有 Codex 原生证明」不再是 Git 写的前提；「这次动作是谁、凭什么、是否独占、是否留痕」才是前提。**

### 3.2 逐项清单：所有预知式检查 → 处置（file:line）

> 类别说明：**P**=预知式（动作前要求未来/可能能力面证明）；**I**=身份/来源；**A**=授权/ACL/策略；**T**=真实终止/排空；**C**=控制面装配证据；**E**=诚实证据（不作门）。处置：**删**=删除该放行前提；**替**=替换为动作时/运行时中立检查；**留**=保留（非预知）；**降**=降级为可选证据（不再拒绝）。

#### A. 会话创建准入（与当前变更分工）

| # | 位置 | 检查/拒绝码 | 类别 | 处置 | 说明 |
| --- | --- | --- | --- | --- | --- |
| A1 | `src/service/runtime/session.ts:242,546,559,1160,1214`（按符号名 `hasUnconfinedScriptTools`/`hasShellAdmissionTools` 复核） | `hasUnconfinedScriptTools` ⇒ `required-scope-unconfined-script-tools` | P | **删**（由当前变更删除/实施中；本方案实施前逐项复核无残留，记录 P1.3 实际合并 hash/状态） | 创建期以「含 shell」拒绝，正是客户要删的预知门。 |
| A2 | `session.ts:544-545` | `required && !nativePreparation && runtime !== "demo"` ⇒ `runtime-protected-scope-requires-verified-plan` | P | **替**（当前变更改为 `admittedPlan`；本方案再删 native 前提） | 非 Codex 结构性没有 native plan。 |
| A3 | `session.ts:1135-1137,1149-1151` | `composeContext`/`bindRole` 在 `required` 时先 `prepareRole`、无 token ⇒ 抛错 | 复合 | **留**（当前变更的准入语义） | 保留「准入事实齐备才绑定」；只是不再要求 native。 |
| A4 | `session.ts:1162` | `protected-scope-default-native-plan-required`（custom/demo 受保护拒绝） | A | **留** | 工厂来源约束，不是未来能力预测；客户未要求删除（Q14）。 |
| A5 | `session.ts:1163-1184`（按 `prepareNative`/`native-factory-plan-*` 符号复核；复核快照 `:1280-1301`） | `prepareNative` 事实不全 ⇒ `native-factory-plan-unverified/unavailable/preparation-failed` | P | **替**（本方案：Codex 仅在 facts `observed` 且 adapter/绑定存在时投影为**可选强证明**，否则从 plan 省略；`ensureAdapter` 在 `nativePreparation` 无 adapter 时回落工厂构造，复核快照 `:643`；`bindRole` 条件核对 `:712-719`） | 当前变更对非 Codex 不再阻断；本方案把 Codex 也降为可选。见 §3.2 D1 与 F5 处置。 |
| A6 | `session.ts:615-624`（`bindRole` native 绑定核对） | `creationPlan.native` 存在时绑定核对 ⇒ `runtime-native-factory-plan-binding-unverified` | C | **留（条件化）** | 仅对**主动采用**的可选 native 强证明核对：`present-but-changed` ⇒ 拒绝；`absent` ⇒ 不拒绝（F5/F12）。 |
| A7 | `src/pipeline/orchestration/run-role.ts:731-733`（按 `runtime-protected-scope-unmediated-app-execution-planned` 符号复核） | native appTools 含 shell ⇒ `runtime-protected-scope-unmediated-app-execution-planned` | P | **删**（由当前变更删除/实施中；本方案实施前逐项复核无残留，记录 P1.3 实际合并 hash/状态） | 复核快照中该行仍在、`run-role.ts` 未被当前变更修改（F11）；不得以「已执行」假定。 |
| A8 | `run-role.ts:734-740` | token/observed 缺失 ⇒ `runtime-creation-admission-unproven:<reasons>` | 复合 | **留**（当前变更的准入语义） | 保留 fail-closed 回执；reasons 集合变化。 |
| A9 | `session.ts:357-366`（`:580-582` 赋值） | `trustedPurePreparation` 决定 `official-pure-preparation-unproven`，进而影响 construction.status | P | **替** | `never-started` 只由真实边界（factoryEntered/nativeBindEntered/pending/revoked）决定；`trustedPurePreparation` 保留为可选证据字段，不再产生 reason。 |
| A10 | `run-role.ts:694-704`（`:700-702`） | 失败准入 instance-bound 需 `status: "quiescent"` + `processCoverage === "complete"` | P/T | **替** | 改用运行时中立 drain 谓词（§3.7）；失败打开不再因 Claude/Pi 阻塞后续 Git 动作。 |
| A11 | `session.ts:536,1161,1215` | `required-scope-role-capability-effects-unproven`（能力回调无副作用绑定 unknown） | C | **留** | 控制面证据，非预知；Claude/Pi 可满足（`createBlockedRoleCapabilityCallbacks` `session.ts:319-329`）。 |

#### B. Git 写/初始化门 `inspectInitializationProtection`（`src/pipeline/orchestration/trunk-runtime.ts:67-153`）

| # | 位置 | 检查/拒绝码 | 类别 | 处置 | 说明 |
| --- | --- | --- | --- | --- | --- |
| B1 | `:70-73` | inventory 缺失/in-flight | I/T | **留** | 真实 host 事实。 |
| B2 | `:74-78` + `run-role.ts:706-719` | 失败准入 recheck（含 `processCoverage complete`） | I/T | **留 + 替** | 保留「失败打开必须可对账」；终止条件改运行时中立（A10/C7）。 |
| B3 | `:79-81` | `unknownFactoryAttempts`/未登记 controller | I | **留** | 身份/历史闭包，不是能力预测；文案去掉「effect scope」措辞。 |
| B4 | `:82-83` | source parent 不在 Core 历史 | I | **留** | |
| B5 | `:84-88` | actor Core 绑定不唯一 | I | **留** | 动作时身份核心。 |
| B6 | `:89-93` | 每个 controller 必须在 Core 注册表 | I | **留** | 身份一致性；不要求 capability。 |
| B7 | `:94-96` | root discovery 恰为 `[projectRoot/.git]` | I | **留** | 根身份/写目标封闭。 |
| B8 | `:97-111` | 逐 entry 的 planId/reasons/processCoverage/native 终止要求 | P/T | **删（预知部分）+ 替（运行时中立 in-flight/终止）** | 删除 plan/reasons/processCoverage/native 作为逐条放行前提；**新增 F4 闭合检查**：`preparing`/`creating`/`disposing` 直接拒绝；prepared/failed 若 `factoryEntered`/`nativeBindEntered`/`pendingContinuations>0` ⇒ `git-core-in-flight-unproven`；failed instance-bound 用 drain；active 条目必须可读 lifecycle 与 toolSurface（`core-instance-inspection-failed`/缺失 ⇒ `git-core-inspection-unavailable`）；disposed 用 drain。 |
| B9 | `:112-119` | 每个 active entry strict observed/native registry/factoryPlan | **P（核心）** | **删** | 客户点名删除；改为 actor-scoped 授权 + §3.3 H13/H14 的运行时中立闭包。 |
| B10 | `:120-143` | `closedTools` 封闭面/未知工具 ⇒ `git-unclosed-effect-registered` | P | **删（作为门）** | 降级为 optionalEvidence（记录 actor 的 appTools 快照、`configuredForeignMcpServers`、未命中 closedTools 的名字），不参与判定（F8）；可选 O1 在创建期做工具目录检查。 |
| B11 | `:130-141` | 能力回调绑定需 `nativePlanId/nativeConfigDigest` ⇒ `git-role-capability-guard-unproven` | C | **留（重绑定）** | 仍核 `corePlanId`/session/role/runtime/registryDigest/guardedTools；native 绑定改为「有则核、无则略」。 |
| B12 | `:144-150` | `write_file`/`edit_file` 的 `fileWriteProtection` 覆盖 `.git` 根 ⇒ `git-file-final-guard-unproven` | C | **留** | 控制面守卫（非预知）；Claude/Pi 由包装层产生（`session.ts:886-894`），不受 native 影响。 |
| B13 | `:212-216, :226-247, :268-272, :330-336, :356-361, :693-694, :748` | 两阶段 gate + revision/digest 复检 + lease | A/T | **留** | 动作时闭合的核心。 |
| B14 | `:152` 返回值 | `{ registryRevision, inventoryRevision, rootsDigest }` | A | **替** | 新返回值增加 actor/authorization 摘要；revision 组成随 B8/B9 收窄重定义（仍覆盖 actor/root/host inventroy）。 |

#### C. 停稳/运行变更（run-stop / controller-stop）

| # | 位置 | 检查/拒绝码 | 类别 | 处置 | 说明 |
| --- | --- | --- | --- | --- | --- |
| C1 | `trunk-runtime.ts:703-705` | run 成员必须 `runtime === "codex"` + native instance ⇒ `run-stop-member-lifecycle-unproven` | P | **替** | 成员身份用 Core session + 可选 native instance；不再拒绝 Claude/Pi。 |
| C2 | `trunk-runtime.ts:743-744` | finalize 要求 `lifecycle.native?.instanceId === member.nativeInstanceId` | P | **替** | 可选证据；`RunChangeHostPlan.handles.nativeInstanceId` 改为可选（契约变更，Q8）。**新增宿主继续分支（F2）**：deferred run-stop 的 finalize 接受 active 或真正 settled（disposed）的 rapporteur，匹配 `actorCoreSessionId`/`taskId`/`roleId`/`projectRoot`/`turnId===held.plan.requesterTurnId`，不要求当前 active `select_run_change`（见 §3.3 H5）；路径复核快照 `app/desktop/session.ts:1414-1448, 1513, 1517-1529`。 |
| C3 | `trunk-runtime.ts:796-797` | controller stop target 必须 codex + native ⇒ `controller-stop-target-instance-unproven` | P | **替** | 保留 Core/role/task 身份；native 可选。 |
| C4 | `trunk-runtime.ts:839-845` | controller stop terminal 要求 native quiescent/processCoverage complete | P/T | **替** | 改用运行中立 drain 谓词；native 只作证据。 |
| C5 | `src/service/trunk/impl/apply-journal.ts:1603-1607` | run-stop commit 要求 `native` + `native.processCoverage complete` + Core `processCoverage complete` ⇒ `run-stop-unverified` | P/T | **替** | 保留 Core/tracked 终止与 host fence；native 可选。`apply-journal.ts:1487` 的 direct stop 拒绝是治理语义，**留**（C6）。 |
| C7 | `run-role.ts:694-704` | 失败打开终止要求（同 A10） | P/T | **替** | 与 A10 同一谓词。 |
| C8 | `app/desktop/session.ts:1477-1486` | 桌面 run-stop 要求 `stopped.status === "quiescent"` 等 ⇒ `run-stop-lifecycle-unproven` | P/T | **替** | 用 drain 谓词；`ownedRunStopMembers` 的 native instance 比对改可选（`:1462-1466`）。 |
| C9 | `session.ts:903`（复核快照约 `:1000`）；活动排空循环 `session.ts:1039-1044` | `stopAndInspect` 在 disposed 时只在 `disposalReceipt.status === "quiescent"` 返回 receipt；活动循环只在 `facts.status === "quiescent"` 返回 | P/T | **替** | disposed 分支与活动循环均改用 drain 谓词（保留 quiescent 快路径）。否则 Claude/Pi 每个成员会等满 5s（`stop-drain-budget-exhausted`）；本方案选择「drain 即返回」，不把逐成员 5s 作为默认成本（F7）。 |

#### D. Codex 原生计划/工具面（证据生产）

| # | 位置 | 检查/拒绝码 | 类别 | 处置 | 说明 |
| --- | --- | --- | --- | --- | --- |
| D1 | `src/provider/codex/session.ts:406-458` | `native-plan-invalid-tool-registry/responses-unproven/mcp-unproven/web-search-unproven/custom-transport-unproven/configuration-unverified/adapter-options-unverified` | P（作为门时） | **降** | 仍如实产生在 `RuntimeNativeFactoryPlanFacts.reasons`；不再导致创建/动作拒绝。**F5**：`plan.native` 仅在 facts `observed` 且 adapter/绑定存在时投影，否则省略；无 adapter 时 `ensureAdapter` 回落工厂构造。 |
| D2 | `provider/codex/session.ts:546-547` | chat 传输不支持 MCP/服务端 WebSearch ⇒ 构造期抛错 | 真实能力限制 | **留** | 不是预知门；如实报错（Q2 披露）。 |
| D3 | `provider/codex/session.ts:943-948` | native 进程覆盖/`native-mcp-process-coverage-unavailable` | E | **留** | 只作证据，不参与放行。 |
| D4 | `session.ts:837-863` | `inspectToolSurface` strict reasons（`native-tool-registry-binding-unverified`/`native-tool-execution-coverage-unverified`/`unmediated-execution-registered` 等） | E | **留** | PR #72 语义不变；本方案只删除其**门消费者**。 |
| D5 | `src/common/gates/index.ts:164-253` | 派发父门 strict/受限应用中介路径（`tool-surface-unknown`/`application-mediation-*`） | I/E | **留** | PR #72 契约；本变更不读/不改（Q15）。 |
| D6 | `session.ts:580-582` | `trustedPurePreparation` 赋值 | P | **替** | 同 A9：保留字段，不产生拒绝 reason。 |
| D7 | `src/common/codex-adapter/chat-transport.ts:259-296` | `inspectNativeToolSurface`/`inspectApplicationToolSurface` | E | **留** | 证据生产者；不改。 |
| D8 | `session.ts:708, 720-724` | `native-provider-process-coverage-unavailable` / `native-provider-not-proven-quiescent`（lifecycle reasons） | P/T（作为 quiescent/complete 前提时） | **降** | 不再作为 drain/终止门的拒绝前提；仍如实记录在 lifecycle reasons 中（`native:` 前缀 reason 属证据）。 |

#### E. 明确保留的非预知门（客户未要求删除；本方案不改）

| # | 位置 | 检查 | 理由 |
| --- | --- | --- | --- |
| E1 | `trunk-runtime.ts:164-171, 174-208, 250-261, 314-320` | `git-review-actor-unproven`/`git-worker-actor-unproven`/`git-revert-controller-unproven`/`git-integration-controller-unproven`/`git-delivery-controller-unproven`/`git-document-actor-unproven` | 真实 actor/任务/回合/active tool 身份；这是动作时授权的基础。 |
| E2 | `trunk-runtime.ts:206-208` 等 | `readGitInitializationTaskBasis` 失败 ⇒ `git-*-root-source-unproven` | 真实任务源/根来源。 |
| E3 | `classify-shell.ts:1025-1102` | `checkGitPolicy` 全部分支（ACL/写区/OID/ref/stale authorization/diff 完整） | 角色 ACL/纯策略；越权拒绝的实质。 |
| E4 | `provider/runtime/tools.ts:4339-4375` | Git 工具角色 ACL（`su`/`single`/`judge` 拒绝；init/integrate/revert/delivery 仅 convener 等） | 工具层角色授权。 |
| E5 | `trunk-runtime.ts:790-796` 等 | `controller-stop-target-instance-unproven` 的 Core 身份部分 | 保留身份，去掉 native 要求（C3）。 |
| E6 | `run-role.ts:1981-1982` | stable-write 要求 `factoryProvenance === "default-production"` + active `request_stable_write` | 工厂来源/真实回合；非预知。 |
| E7 | `apply-journal.ts:3656-3741` | 仓库初始化 host `native-directory-selection` 选择/chief turn 绑定 | 真实 host 选择身份（命名中的 native 是目录选择器，不是 native tool plan）。 |
| E8 | `app/desktop/session.ts:3650-3665` | `currentGitRuntime` 要求当前真实工具回合；失败 `git-delivery-source-changed` | 真实回合。 |
| E9 | `src/service/runtime/session.ts:857-860` | `owned-execution-program-not-proven-stopped`（strict surface 的 owned 进程/后台任务检查） | 真实进程证据；只作 surface reason，不单独作为 Git 动作门的放行前提（drain 谓词另核 tracked processes）。 |

### 3.3 替代门：`inspectGitActionAuthorization()`（[设计候选]）

#### 3.3.1 输入与输出（F1 处置：gate 只做 identity/root/closure；ACL/政策/租约留在调用点）

- **gate 定位**：`inspectGitActionAuthorization()` 只负责**身份/根/注册表闭包**与运行时中立终止/可读性检查；**不接收** `GitPolicyFacts`、不做 `checkGitPolicy`、不持有 mutation lease。ACL/`checkGitPolicy`/lease 仍由 `createGitRoleRuntime` 调用点按既有顺序执行（`trunk-runtime.ts:208-218` 等），`authorization` 由调用点在政策判定与 lease 之后组合。
- gate 输入（[设计候选]）：
  ```
  {
    projectRoot, taskId, parentCoreSessionId,
    expectedActor: { roleId?, coreSessionId? },            // 调用点由 inventory/task 解析后传入
    expectedTool: "git_query" | "git_candidate" | "git_publish",  // active-tool 模式必填；缺失即拒绝（S5）
    authorizationMode: "active-tool" | "host-continuation",
    hostContinuation?: { requesterTurnId, planId }          // 仅 finalizeRunChange deferred/resume（F2）
  }
  ```
- gate 输出（`ok`）：
  ```
  {
    ok: true,
    registryRevision, inventoryRevision, rootsDigest,
    actor: { entryId, coreSessionId, roleId, runtime, taskId?, runId?, turnId, projectRoot },
    controls: { drain: { disposed: boolean }, fileWriteProtection?: {...}, roleCapabilityGuards?: {...} },
    optionalEvidence: { toolSurfaceStatus?, nativeStatus?, nativeReasons?, processCoverage?,
                        configuredForeignMcpServers?, unknownTools? }   // F8：只记录不判定
  }
  ```
- **不在 gate 输出中**：`policyInputDigests`、`leaseId`、`authorization`。调用点顺序：
  ```
  lease = beginGitHostAction({kind:"git-mutation"})
  closure = inspectGitActionAuthorization({authorizationMode:"active-tool", expectedActor, expectedTool, ...})
  verdict = checkGitPolicy(policyInput)            // ACL 在工具层已先行；此处纯策略
  current = inspectGitActionAuthorization(...)     // 两阶段复检
  authorization = { source:"git-action-authorization", version:1, operationId, template,
                    actor: closure.actor, policyInputDigests: { candidate: verdict.inputDigest },
                    leaseId: lease.leaseId, optionalEvidence: closure.optionalEvidence }
  appendAuthorizationRecord(projectRoot, operationId, authorization)  // sidecar，效果前；失败 ⇒ 不执行
  execute(...)
  ```
  `checkGitPolicy` 返回 `inputDigest`（`classify-shell.ts:1027-1028`），mutation lease 返回 `leaseId`（`git-command.ts:584-592`）；两者在调用点可得，AC-1 的断言因此有来源。
- **多 verdict 映射（R2）**：`policyInputDigests` 为映射而非单值——
  - commit/integrate/revert：`{ candidate: verdict.inputDigest }`；
  - init：`{ init: initPolicy.inputDigest, candidate: candidatePolicy.inputDigest }`（`trunk-runtime.ts:236-241`）；
  - delivery：`{ publication: verdict.inputDigest }`（`:269`）；
  - 文档/计划/激活/initial workflow：`{ candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest }`（`:331`、`:357`）；
  - run-change/finalize（host-continuation）：无 `checkGitPolicy`，不写 sidecar；终止事实写入既有 run transition manifest journal（R6）。**`finalizeRunChange` 保持既有 gate（`:748`）在 host lease（`:750`）之前的顺序**；gate 只做闭包，不做 policy/lease 判定；host lease 继续由既有 `beginGitHostAction` 持有到提交。`run-stop/controller-stop` 不是 Git ref mutation，不适用 sidecar authorization（AC-8 用词区分）。
- 失败：`{ ok:false, code, message }`，码表见 §3.8。

#### 3.3.2 门控检查（gate 与调用点分工；全部为动作时事实）

| 检查 | 事实来源 | fail-closed 条件 |
| --- | --- | --- |
| H1 host 可对账 | `inspectGitHostCoordinator`（`git-command.ts:611-615`） | inventory 缺失/有 pendingOpens/creating·disposing·dispose-failed |
| H2 失败准入可对账 | `recheckRoleSessionOpenFailureInventory`（`run-role.ts:706-719`） | 无唯一 fresh 同 attempt 证据/进程实例或 revision 不符 |
| H3 无未登记 controller/factory | `inspectManagedRoleSessionInventory`（`run-role.ts:721-725`） | `unknownFactoryAttempts` 非空或 controller 不在 Core 注册表 |
| H4 actor 身份 | inventory + `inspectRuntimeCoreRegistry`（`session.ts:210-221`） | **`active-tool` 模式**：actor 唯一/Core 条目 `active`/role/project 不符 ⇒ 拒绝。**`host-continuation` 模式（F2/R1）**：接受 active 或真正 settled（`state==="disposed"` 且 drain）的 actor，必须匹配 `expectedActor.coreSessionId`/`roleId`/`projectRoot`、`hostContinuation.requesterTurnId` 与 **`input.taskId`**；且 inventory 中存在**唯一**记录 `coreSessionId===expectedActor.coreSessionId && taskId===input.taskId && roleId===expectedActor.roleId`（live 或 disposed 均可；不要求 live member）。 |
| H5 actor 回合与调用 | `entry.lifecycle.turnId` + `activeTools`（`trunk-runtime.ts:198-205` 等） | **`active-tool` 模式**：无当前 turn 或无 active Git tool 调用 ⇒ 拒绝。**`host-continuation` 模式（F2/R1）**：以 `input.taskId`（finalize 为 `held.plan.requesterTaskId`）与私有 `held.plan.requesterTurnId`、`expectedActor.coreSessionId` 为准（准备阶段已绑定 taskId/turnId），并与 inventory 记录的 `taskId/roleId` 比对；不要求 `activeTools`。 |
| H6 source parent | Core 注册表（现有 `:82-83`） | parent 不在本进程 Core 历史/role/project 不符 |
| H7 根身份 | `readGitProtectionFacts`（`git-command.ts:290-325`） | protectedGitRoots 不等于 `[projectRoot/.git]` / facts 不可读 |
| H8 ACL/策略（**调用点检查，非 gate 输入**） | 工具层 ACL（`provider/runtime/tools.ts:4339-4375`）+ `checkGitPolicy`（`classify-shell.ts:1025-1102`） | 角色不允许/写区/OID/ref/stale/diff 不完整；在 gate 之外、lease 之后执行，结果进入 authorization |
| H9 单写者租约（**调用点检查，非 gate 输入**） | `beginGitHostAction({kind:"git-mutation"})`（`git-command.ts:584-592`） | 已有 lease/跨项目 mutation lease；gate 不接收 lease，`leaseId` 由调用点写入 authorization |
| H10 两阶段复检 | `registryRevision`/`inventoryRevision`/`rootsDigest`/lease 复检（沿用 `:212-216` 等） | 任一变化 ⇒ `git-*-protection-stale`/`git-host-mutation-interrupted` |
| H11 disposed 条目终止（运行时中立） | `isRuntimeSessionDrained()`（§3.7） | `state === "disposed"` 的条目必须能读到 lifecycle 且 drained；lifecycle 不可读或存在 live-work 类 reason ⇒ `git-old-core-programs-unproven`；**不要求** `processCoverage complete`/native |
| H12 控制面装配（按条目工具面条件） | `fileWriteProtection`（条目有 `write_file`/`edit_file` 时）、`roleCapabilityGuards`（条目有 install/uninstall 能力时，绑 Core plan） | 缺失/漂移 ⇒ 拒绝（C 类）；native 绑定有则核、无则略；这是「守卫是否装配」而非「未来能力面预测」 |
| **H13 非 active 条目 in-flight（F4）** | `registry.entries` 的 `construction` + `state` | `preparing`/`creating`/`disposing` ⇒ `git-core-in-flight-unproven`；`prepared`/`failed`：`never-started` + `preparedTokensRevoked` + `pendingContinuations===0` ⇒ 豁免；`failed`+`instance-bound`+drain ⇒ 豁免；其余 ⇒ `git-core-in-flight-unproven`（handle 未产生前的 pending 准备不得被忽略） |
| **H14 active 条目可读性（F4/R10）** | `inspectRuntimeCoreRegistry` 的 lifecycle/toolSurface（复核快照 `session.ts:211-219`） | active 条目 `reasons` 含 `core-instance-inspection-failed`、或 lifecycle/toolSurface 缺失/不可读、或 `toolSurface.sessionId!==entry.sessionId`/`roleId!==entry.roleId`/`runtime!==entry.runtime` ⇒ `git-core-inspection-unavailable`（**不跳过**；不允许 fail-open） |

**非门证据（只记录、不拒绝）**：`toolSurface.status/reasons`、`applicationMediation`**不读**（PR #72 注释要求写/发布门不读该字段；Q15）、`native` 状态、`processCoverage`、`closedTools` 快照、`configuredForeignMcpServers`、能力位声明。它们可放入 `optionalEvidence` 摘要与 sidecar authorization 记录。

#### 3.3.3 两阶段闭合与伪代码

```
inspectGitActionAuthorization(input):                  # input 见 §3.3.1；不接收 policy/lease
  inventory = inspectGitHostCoordinator(projectRoot)
  if !inventory || pendingOpens || badPhases: reject "git-host-admission-in-flight"
  failed = recheckRoleSessionOpenFailureInventory(...)  # 运行时中立终止（A10）
  if !failed || revisionMismatch: reject "git-host-admission-in-flight"
  if unknownFactoryAttempts || unregistered controller: reject "git-app-controller-history-unproven"

  # —— actor：两种授权模式（F1/F2）——
  if input.authorizationMode == "active-tool":
    if !input.expectedTool: reject "git-actor-core-binding-unproven"   # S5：缺失即 fail-closed
    actors = unique(inventory live sessions: taskId, roleId=expectedActor.roleId, coreSessionId=expectedActor.coreSessionId)
    entry = registry.entries[expectedActor.coreSessionId]
    if actors.length != 1 || !entry || entry.state != "active" || entry.roleId != expectedActor.roleId
       || entry.projectRoot != projectRoot || !entry.lifecycle?.turnId || entry.lifecycle.stopRequested
       || !entry.lifecycle.activeTools.some(tool => GIT_TOOL_NAMES[input.expectedTool].includes(tool.name)):
        reject "git-actor-core-binding-unproven" / "git-worker-actor-unproven"
  else:  # host-continuation：finalizeRunChange deferred/resume（F2/R1）
    record = unique(inventory.sessions where coreSessionId==expectedActor.coreSessionId
                    && taskId==input.taskId && roleId==expectedActor.roleId
                    && phase in ["live", "disposed"])   # live/disposed 均可，但必须存在（S3）
    entry = registry.entries[expectedActor.coreSessionId]
    if record.length != 1
       || !entry || entry.roleId != expectedActor.roleId || entry.projectRoot != projectRoot
       || !(entry.state == "active" || (entry.state == "disposed" && entry.lifecycle && isRuntimeSessionDrained(entry.lifecycle)))
       || entry.lifecycle?.turnId != hostContinuation.requesterTurnId:
        reject "git-actor-core-binding-unproven"
    # 不要求 live member / activeTools；taskId 由 inventory 记录与 input.taskId 双绑定

  if parentCoreSessionId not in registry as chief/project: reject "git-source-process-history-unproven"
  roots = readGitProtectionFacts(projectRoot)
  if roots.protectedGitRoots != [projectRoot/.git]: reject "git-root-discovery-unproven"

  # —— 逐 entry：运行时中立闭包（F4）——
  for entry in registry.entries:
    if entry.state in ["preparing", "creating", "disposing"]: reject "git-core-in-flight-unproven"
    if entry.state in ["prepared", "failed"]:
      if entry.construction?.status == "never-started" && !factoryEntered && !nativeBindEntered
         && preparedTokensRevoked && pendingContinuations == 0: continue
      if entry.state == "failed" && entry.construction?.status == "instance-bound"
         && entry.lifecycle && isRuntimeSessionDrained(entry.lifecycle): continue
      reject "git-core-in-flight-unproven"            # handle 产生前的 pending 准备不得被忽略
    if entry.state == "active":
      if !entry.lifecycle || entry.reasons.includes("core-instance-inspection-failed")
         || !entry.toolSurface || entry.toolSurface.sessionId != entry.sessionId
         || entry.toolSurface.roleId != entry.roleId || entry.toolSurface.runtime != entry.runtime:
        reject "git-core-inspection-unavailable"   # 不允许 fail-open（R10）
      if entry.toolSurface.appTools has write_file/edit_file && !fileWriteProtectionCovers(entry, roots):
        reject "git-file-final-guard-unproven"
      if entry.toolSurface.appTools has install/uninstall capability && guard not bound to core plan:
        reject "git-role-capability-guard-unproven"
    if entry.state == "disposed":
      if !entry.lifecycle || !isRuntimeSessionDrained(entry.lifecycle): reject "git-old-core-programs-unproven"

  # 可选证据：不参与判定（F8）
  optionalEvidence = summarize(toolSurface, native, processCoverage, configuredForeignMcpServers, unknownTools)
  return ok { actor: entry 摘要, controls, optionalEvidence, registryRevision, inventoryRevision, rootsDigest }
```

调用点（`createGitRoleRuntime` 各动作）保持既有顺序并组合 authorization（F1）：
```
lease = beginGitHostAction({kind:"git-mutation"})              # H9（调用点）
closure = inspectGitActionAuthorization({authorizationMode:"active-tool", expectedActor, expectedTool, ...})
verdict = checkGitPolicy(policyInput)                          # H8（调用点 + 工具层 ACL）
current = inspectGitActionAuthorization(...)                   # 两阶段复检
authorization = { source, version:1, operationId, template, actor: closure.actor,
                  policyInputDigests: { candidate: verdict.inputDigest }, leaseId: lease.leaseId, optionalEvidence }
appendAuthorizationRecord(projectRoot, operationId, authorization)   # sidecar；失败 ⇒ 不执行
execute(...)
```
`createGitRoleRuntime` 的现有两阶段形态（closure → policy → current → execute）保留；第二次调用同一函数并比较 `registryRevision/inventoryRevision/rootsDigest`（`:214-216`、`:244-247`、`:270-272`、`:334-336`、`:359-361`）。`beginGitHostAction`/`endGitHostAction` 的 lease 位置不变（`:208-218`、`:223-249`、`:264-274`、`:326-339`、`:352-363`、`:750-757`）。

#### 3.3.4 名称与兼容

- [设计候选] 将函数改名为 `inspectGitActionAuthorization`（并在注释中保留「原 `inspectInitializationProtection`」溯源）；测试中的符号定位（`test/编排/trunk-dispatch-parent.test.ts:389-391`、`test/测试/runtime-dispatch-gate-integration.test.ts:410-412`）同步更新。可选 O2：保留旧名作为薄别名，减少 diff。
- [设计候选] 返回值增加 `actor`/`controls`/`optionalEvidence`（**不返回 `authorization`**，由调用点组合）；内部调用方（`trunk-runtime.ts` 各动作）只使用 `ok`/digests/actor/optionalEvidence；sidecar 写入使用调用点组合的 authorization。

### 3.4 与现有审批/审计链的接线（不重造）

#### 3.4.1 shell 面（复用当前变更）

- 复用 `src/common/shared/shell-approval-binding.ts`（当前变更 W1，未跟踪于本快照）的 `registerShellApproval`/`inspectShellApproval`/`probeShellApproval`（`:129-166`）：只用于**创建准入**（受保护 + 注册 shell ⇒ 审批链绑定 + 持久 file 审计探针）与**可选审计记录**，不用于 Git 结构化动作的放行判定。
- 复用 `createShellGate`（`shell-gate.ts:502`；选项 `:369-536`）、`assembleProjectShellGate`/`assembleOperatorShellGate`/`assembleReadonlyShellGate`（`src/pipeline/orchestration/shell-arming.ts:150/356/263`）、`shell-escalation`、`shell-write-guard`、`shell-audit`（`ShellAuditRecord` `shell-audit.ts:103-126`）。非只读 shell 的客户卡/「替我审批」/审计语义不变。
- 本方案**不新增**审批通道；不把 Git 写纳入 shell 审批卡（结构化 Git 的授权更强，见 §3.4.2）。

#### 3.4.2 Git 结构化能力（动作时授权链）

`git_candidate`/`git_publish`/`git_query` 的既有链路（[事实]）：
1. 工具层角色 ACL（`provider/runtime/tools.ts:4339-4375`）：`su`/`single`/`judge` 拒绝；init/integrate/revert/delivery 仅 convener；publish-documents 仅四角色。
2. Pipeline actor 证明（`trunk-runtime.ts`）：真实 desktop inventory 会话 + Core registry active + lifecycle active tool + task/run 绑定（`:198-205`、`:256-261`、`:314-320`、`:663-694`）。
3. `readGitInitializationTaskBasis` 真实源（`:206-207`、`:262-263`、`:321-322`）。
4. `checkGitPolicy` 角色动作/写区/OID/ref/stale/diff 完整性（`classify-shell.ts:1025-1102`）。
5. host `git-mutation` lease（`git-command.ts:584-599`）+ journal（`.ans/trunk/operations/<sha256(operationId)>/git.json`；init 为 `init.json`）。
6. 发布/交付另有 expected-old/candidate 单 ref 确认与 ref journal。

本方案只删除这些链路中的**预知式前置**（§3.2 B8-B10），不改上述 1–6 的任何授权语义。

#### 3.4.3 审计记录（[设计候选]，F3 处置：append-only sidecar，不改变 journal 重放/结算身份）

- **结构化 Git 动作**：新增 per-operation **append-only sidecar** `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`（每次尝试一行）。**不写入** `GitRefJournal`/`GitInitializationRecord`，因此不进入既有 replay/settlement 身份比较（`git-trunk-store.ts:1187-1189` `safeWrite`、`:1219-1224` `publish`、`:1298-1299` `writeCandidateJournal`；`git-command.ts:140-147` init 重放比较）。旧 journal 没有该 sidecar，天然兼容；同一 operationId 的**新 lease/turn 重试**追加新行，不触发 `git-operation-replay-conflict`/`git-candidate-operation-conflict`/`git-init-operation-conflict`。
- sidecar 行（白名单投影；无凭据/环境）：
  ```
  { source: "git-action-authorization", version: 1, operationId, template,
    actorRoleId, coreSessionId, taskId?, runId?, turnId, activeTool,
    projectRoot, rootsDigest, registryRevision, inventoryRevision,
    leaseId, policyInputDigests: { init?, candidate?, publication? },
    optionalEvidence: { toolSurfaceStatus?, nativeStatus?, nativeReasonsCount?, processCoverage?,
                        configuredForeignMcpServers?, unknownTools? } }
  ```
  `policyInputDigests` 按 R2 映射：init 两个、文档/计划/激活/initial workflow 两个、commit/integrate/revert 一个（candidate）、delivery 一个（publication）；每项来源为对应 `checkGitPolicy` 的 `inputDigest`（`trunk-runtime.ts:236-241,269,331,357`）。
- **持久化时序（效果前，write-ahead）**：在 prepared 阶段、真实效果之前 append——`publish` 的 `safeWrite`/`update-ref` 之前（`git-trunk-store.ts:1240,1248`）、candidate journal 写入/对象与 ref 创建之前（`src/service/trunk/impl/git-capabilities.ts:316-332`）、**业务发布 `commitPreparedDirect/TeamPlan/Activation/InitialWorkflow` 的 store 写入之前（`apply-journal.ts:1156/1191/1217/1246`）**、init **sidecar 先于 `writeGitInitializationRecord(prepared)` 与 repo 创建**（sidecar 失败 ⇒ 无 prepared 记录、无 repo 效果；`prepared` 记录的重放比较见 `git-command.ts:140-147`）。append 失败 ⇒ 该动作**不执行**（新码 `git-action-audit-unavailable`；fail-closed），不产生 ref/对象/工作树效果。效果后的结算失败保持既有 pending-recovery 语义（journal 仍权威；sidecar 只作授权审计）。
- **sidecar 安全写入（R3/S5/E-d）**：路径固定为 `<canonical projectRoot>/.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`；复用既有 `assertControlPaths`/`safeWrite`/版本锁/lease 语义（`git-trunk-store.ts:1158,1179`）；拒绝符号链接/nlink≠1/越界路径；**预算候选：单行 ≤4 KiB、最多 16 次尝试、文件 ≤64 KiB（4 KiB×16=64 KiB，自洽组合）；最终由 I0 冻结精确组合（行/文件/尝试数必须自洽，与团队计划 §I0-1 一致）**；超出 ⇒ `git-action-audit-unavailable`；append 在项目版本锁或 operation 锁内单次写入（`O_APPEND` + 单次 write，失败/短写 ⇒ unavailable）；读取容错：允许最后一行截断（忽略），拒绝坏 JSON/超长行/未知字段（fail-closed）。
- **run-stop/controller-stop 不适用 sidecar（R6）**：二者是运行生命周期动作，不是 Git ref/object mutation；sidecar authorization 只覆盖 §3.4.3 的结构化 Git mutation。终止/迁移事实继续写入既有 run transition manifest journal/ledger（`apply-journal.ts:1598-1644` 的 commit 路径），不写 `authorization.jsonl`。
- **shell 动作**：沿用 `docs/audit/shell-gate.jsonl`（`ShellAuditRecord`；客户卡/「替我审批」/升级/执行后审计均已有字段）；本方案不新增字段。
- **拒绝**：动作前拒绝不产生 journal/sidecar；新增诊断事件 `git.action.denied`（best-effort，含 code/actor/turn/operationId），桌面日志可见；验收以「错误码 + 无副作用」为准，并如实说明拒绝审计依赖宿主日志。
- **可选**：O3 改为「把 authorization 写入 journal 字段」的备选（需同时修改重放/结算比较并处理旧 journal 兼容，不推荐）；O10 在 sidecar 中记录 actor 的 `approvalChain` 摘要（只记录，不判定）。

### 3.5 运行时路径差异（[设计候选]）

| 运行时 | 创建准入（当前变更后） | 本方案额外变化 | Git 动作授权 | 可选证据 |
| --- | --- | --- | --- | --- |
| Claude（`claude-sdk-mcp`） | 不再要求 native plan / 不因 shell 拒绝；受保护+shell 需审批 binding+审计探针 | 无 native 新增要求 | 与所有运行时同一动作时门 | `toolSurface`/native 缺失不阻断；记录 unknown |
| Pi（`pi-custom-tools`） | 同上 | 同上 | 同上 | 同上 |
| Codex（`codex-chat`） | 不再要求 native plan observed；native 事实产生时为可选强证明 | `native-plan-*` 不再导致拒绝；chat MCP/WebSearch 真实限制保留 | 同上 | observed native plan 可绑定/记录；unknown 不阻断 |
| demo | 保持受保护拒绝（`protected-scope-default-native-plan-required`） | 不改 | 不适用（无 Git 能力） | 不适用 |

共同不变量：不存在按运行时放宽的审批/ACL 分支；`inspectToolSurface`/`applicationMediation`（PR #72）语义不变；Git 动作门对所有运行时同一套。

### 3.6 只读/非只读 Git 边界（引用当前变更，不重复定义）

- Git 只读 shell（`run_shell` 的 `matchReadonlyGit` 精确白名单、固定传输、参数级 fail-closed）、`git_query` 模板/`readableOids`、`git_candidate`/`git_publish` 角色 ACL、裸 Git 写硬拒（writeGuard 程序名 deny）——**全部沿用当前变更 P1.3 §2.4.2/§2.4.3/§2.4.4**，本方案不改、不重复定义。
- 只读 `git_query` 不经过本门（`trunk-runtime.ts:162-172`）；`git_publish documents` 不走 `inspectInitializationProtection`（`:251`），只走既有 publish 服务/ref journal；`delivery` 走本门。
- 非只读 shell 仍走审批卡/「替我审批」/审计；结构化 Git 写不走 shell 审批，走 §3.4.2。

### 3.7 运行时中立 drain 谓词（run-stop/controller-stop/终止检查）

[设计候选] 在 `src/model/runtime.ts` 增加纯函数（单一来源）：

```
/** 只作证据、不阻断 drain 的 reason（F6/R7：显式白名单；未列默认阻断）。 */
const DRAIN_EVIDENCE_ONLY_REASONS = new Set([
  "native-provider-not-proven-quiescent", "native-provider-process-coverage-unavailable",
]);
/** native 覆盖/传输关闭类证据（R7/S1：显式列名；不得用 `native:` 前缀通配）。 */
const DRAIN_NATIVE_EVIDENCE_REASONS = new Set([
  "native:pi-sdk-owned-process-tree-coverage-unavailable",
  "native:pi-sdk-http-transport-close-unobservable",
  "native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.",
  "native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown.",
]);
export function isRuntimeSessionDrained(facts: RuntimeSessionLifecycleFacts): boolean {
  return facts.providerFinished
    && facts.activeTools.length === 0
    && facts.processes.every(p => p.state === "exited"
         && (p.treeStatus === "verified" || p.kind === "background"))  // background 以管理器 stop/exited 为准
    // 其余 reason（含 native-tool-handler-running/native-tool-not-terminal/native-mcp-process-coverage-unavailable、
    // live-work 类、清理失败、inspection 失败、未知 reason）默认阻断（F6/R7：安全方向）
    && !facts.reasons.some(r => !(DRAIN_EVIDENCE_ONLY_REASONS.has(r) || DRAIN_NATIVE_EVIDENCE_REASONS.has(r)));
}
```

说明与边界（如实）：
- 不要求 `facts.status === "quiescent"`（Claude/Pi native 覆盖未知会使 status 恒 unknown，`session.ts:711,720-724,748`）。
- 不要求 `processCoverage === "complete"`（Claude/Pi 结构性 unknown，`session.ts:753`；Claude `:534`；Pi `:1459`）。
- 不要求 `facts.native` 存在；`native`/`native.processCoverage` 仅作可选证据记录。**R7/S1**：只有 `DRAIN_EVIDENCE_ONLY_REASONS` + `DRAIN_NATIVE_EVIDENCE_REASONS` 中的显式 reason 不阻断；`native:pi-sdk-idle-not-observed`（Pi SDK 非 idle：`isStreaming`/`isCompacting`/`pendingMessageCount` 任一非空闲时产生，`real-adapter.ts:1460-1461`）、`native-tool-handler-running`/`native-tool-not-terminal`/`native-mcp-process-coverage-unavailable`、`native:pi-raw-prompt-pending`、`native:pi-owned-mcp-close-pending`、`native:pi-native-stop-operation-failed` 等一律阻断（未列默认阻断）。**idle 的 Pi 不产生 `pi-sdk-idle-not-observed`，因此移除该项后仍可正常 drain**；Claude/Pi 的纯覆盖类 reason 才在显式白名单。接口评审逐条冻结并补测试。
- **F6 分类口径**：`DRAIN_EVIDENCE_ONLY_REASONS` 在接口评审中从 `collectLifecycle`/`disposalConstraints` 逐条分类并冻结。至少以下现有 reason 属**阻断**（不能被静默放过）：`native-provider-lifecycle-read-failed`（`session.ts:823` 复核快照）、`real-provider-settled-not-observed`（`:834`）、`stopCleanupErrors` 的 `provider-abort-cleanup-failed`/`native-stop-facts-invalid-or-failed`/`owned-process-stop-failed`/`background-stop-not-proven`（`:1004-1022`）、`custom-provider-disposal-coverage-unverified`（`:1199`），以及 §3.7 代码中已列的 live-work 类。**未知 reason 默认阻断**（与旧版「默认不阻断」相反）；新增 reason 必须显式分类并留诊断。
- **F7 `stopAndInspect` 活动循环**：除 disposed 分支外，活动会话的排空循环也改为「quiescent 快路径或 `isRuntimeSessionDrained(facts)` 即返回」（`session.ts:1039-1044` 复核快照）；否则 Claude/Pi 每个成员会等满 5s（`stop-drain-budget-exhausted`）。本方案不把逐成员 5s 作为默认成本；若实施选择保留轮询，必须在验收记录披露每成员最多 5s 的成本与该 timeout facts 的接受方式。
- `processes` 已包含 Core tool lifecycle、background 与 native 报告的进程（`session.ts:698-714`）；Claude/Pi 的 native 进程树不可观测，**接受并披露**（客户决定，Q3）。
- 使用点：`session.ts:903`（stopAndInspect disposed receipt；复核快照约 `:1000`）、`session.ts:1039-1044`（活动排空循环）、`session.ts:755-767`（disposalReceipt 仍如实报告 status，不强行改写）、`run-role.ts:700-702`、`trunk-runtime.ts:107-109`（disposed）、`:743-744`、`:840-845`、`apply-journal.ts:1603-1607`、`app/desktop/session.ts:1477-1486`。
- 可选 O5：在 `RuntimeSessionLifecycleFacts` 增加派生字段 `drained?: boolean`（避免消费者重复实现）；默认先做纯函数，减少契约变化。

### 3.8 失败语义与错误码

| 码 | 变化 | 说明 |
| --- | --- | --- |
| `git-host-inventory-unavailable` / `git-host-admission-in-flight` | 保留 | host 事实不可对账；不再因 processCoverage 触发（改由 drain 谓词）。 |
| `git-app-controller-history-unproven` / `git-source-process-history-unproven` / `git-actor-core-binding-unproven` / `git-controller-history-unproven` | 保留 | 身份/历史 fail-closed；文案去掉预知式措辞。 |
| `git-root-discovery-unproven` | 保留 | 根身份。 |
| `git-core-creation-proof-unavailable` | **退役（不再产生）** | 原 registry-level plan/reasons/processCoverage 要求删除。 |
| `git-native-surface-unproven` | **退役（不再产生）** | strict observed/native factoryPlan 要求删除。 |
| `git-unclosed-effect-registered` | **退役（不再产生）** | closedTools 门删除；保留证据快照。 |
| `git-old-core-programs-unproven` | **语义收窄** | 仅 disposed 条目的 tracked-process drain 失败；消息改为「tracked processes 未证明停止（native 覆盖可为 unknown）」。 |
| `git-role-capability-guard-unproven` | **收窄** | 不再要求 `nativePlanId/nativeConfigDigest`；其余绑定保留。 |
| `git-file-final-guard-unproven` | 保留 | 控制面守卫。 |
| `git-worker-actor-unproven` / `git-revert-controller-unproven` / `git-integration-controller-unproven` / `git-delivery-controller-unproven` / `git-review-actor-unproven` / `git-document-actor-unproven` | 保留 | 动作时身份/回合/任务绑定。 |
| `git-*-root-source-unproven` / `git-*-policy-denied` / `git-*-protection-stale` / `git-host-mutation-interrupted` | 保留 | 源/策略/复检/租约。 |
| `git-action-audit-unavailable` | **新增** | sidecar authorization 追加失败 ⇒ 不执行（fail-closed）。 |
| `git-core-in-flight-unproven` | **新增（F4）** | prepared/failed 条目存在未 revocation/pending/entered 边界，或无法证明 never-started/instance-bound+drain。 |
| `git-core-inspection-unavailable` | **新增（F4）** | active 条目无法读取 lifecycle/toolSurface 或 `core-instance-inspection-failed`；不允许 fail-open。 |
| `run-stop-member-lifecycle-unproven` | **语义收窄** | 不再要求 codex/native；改 Core 身份 + 可选 native。 |
| `run-stop-instance-unproven` / `run-stop-lifecycle-unproven` | **语义收窄** | 用 drain 谓词；native instance 可选。 |
| `run-stop-unverified` | **语义收窄** | 保留码；终止条件改 drain 谓词；`apply-journal.ts:1487` 的 direct-stop 治理拒绝不变。 |
| `controller-stop-target-instance-unproven` / `controller-stop-terminal-unproven` | **语义收窄** | Core 身份保留；native/processCoverage 改可选/drain。 |
| `native-factory-plan-unverified/unavailable/preparation-failed` | **降级为证据** | 不再作为会话创建/动作拒绝 reason；保留在 `RuntimeNativeFactoryPlanFacts.reasons` 供审计。 |
| `official-pure-preparation-unproven` | **退役（不再产生）** | construction.status 改由真实边界决定。 |
| `required-scope-unconfined-script-tools` / `runtime-protected-scope-unmediated-app-execution-planned` | 当前变更已退役 | 本方案验收确认无残留。 |
| `protected-scope-approval-chain-unproven` / `protected-scope-audit-unavailable` / `protected-scope-approval-chain-changed` | 保留（当前变更） | 本方案不改其语义。 |
| `runtime-native-factory-plan-binding-unverified` | 保留（条件化） | 仅当主动采用可选 native 强证明且绑定漂移。 |

### 3.9 删除/收窄注册表级门后的不变量（硬约束）

| # | 不变量 | 检查/证据 |
| --- | --- | --- |
| N1 | **没有 Git mutation 能在未持有 `git-mutation` lease 时执行**；lease 从授权到效果保持 | `beginGitHostAction`/`checkGitHostAction`（`git-command.ts:584-624`）；AC-10 |
| N2 | **每次 Git mutation 都核真实 actor**（Core session/role/project/task/turn/active tool） | §3.3 H4/H5；负例 AC-8 |
| N3 | **角色 ACL 与 `checkGitPolicy` 不削弱**；越权/写区/OID/ref/stale 仍拒绝 | §3.3 H8；AC-12/AC-13 |
| N4 | **根身份与两阶段复检保留**；动作前后 revision/digest 变化即拒绝 | §3.3 H7/H10；AC-14 |
| N5 | **所有结构化 Git mutation 留审计**（sidecar authorization + ref/init journal）；审计不可写 ⇒ 不执行。**审批放行的不透明 shell 脚本对 `.git` 的写入不在本审计内**，由 shell 审批/审计/执行后审计覆盖（§4.3 风险 1，F9） | §3.4.3；AC-16 |
| N6 | **可选证据永不成为授权**：native/toolSurface/processCoverage 缺失/unknown 不导致放行，也不导致拒绝（除非它是控制面守卫本身） | §3.3.2；AC-7/AC-19 |
| N7 | **结构化 Git 写**只走角色能力（ACL/任务绑定/策略）；**直接裸 Git 程序调用仍硬拒**；审批放行的不透明脚本可能写 `.git`，属已披露残余风险，不宣称为结构化 Git 写（F9） | 当前变更 P1.3；回归 AC-17 |
| N8 | **身份/权限 unknown fail-closed**；unknown ≠ observed | §3.3；负例 AC-10/AC-14 |
| N9 | **不改写权/角色边界/客户主权/验收/审计语义** | 回归 |
| N10 | **不改 PR #72 派发父门/应用中介证据**；新证据不被写/发布门消费 | §4.2；AC-18 |
| N11 | **不建 DSL/工作流引擎**；只复用现有 ACL/策略/审批/审计/lease | 无新执行语言 |
| N12 | **失败安全方向**：缺失/超时/不可用/不一致一律拒绝；不向更宽方向推断 | §3.8 |

---

## 4. 影响面

### 4.1 模块、owner 与写集候选（[设计候选]，最终由团队计划定）

| 模块/文件 | owner（按 E0/角色卡） | 改动要点 |
| --- | --- | --- |
| `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | 替换 `inspectInitializationProtection` → `inspectGitActionAuthorization`（gate 只做身份/根/闭包，返回 actor/controls/optionalEvidence；**authorization 由调用点组合**，F1）；删除 B8/B9/B10 的预知前提并加 H13/H14 运行时中立检查；保留 B1-B7/B11-B13；run-change/controller-stop 运行时中立（C1-C4 + 宿主继续分支）；sidecar 写入调用 |
| `src/pipeline/orchestration/run-role.ts` | 编排 | A9 残留、A10/C7 失败准入 drain、A7 残留；**实施前逐项复核当前变更实际合并状态（hash/符号），不以「已执行」假定**（F11）；`bindPreparedRuntimeRole` 不再要求 native（若当前变更未完全覆盖） |
| `src/service/runtime/session.ts` | 运行时核心 | A1/A2/A5 残留；A9 construction.status；**D6 `trustedPurePreparation` 赋值**；C9 `stopAndInspect` drain 谓词（disposed 分支 + 活动排空循环）；**F5/R9：`plan.native` 仅在 observed+adapter 时投影、`ensureAdapter` 无 adapter 时回落工厂构造、`bindRole` 条件核对**；不删 `inspectToolSurface` 证据生产 |
| `src/model/runtime.ts` | 运行时核心 | 新增 `isRuntimeSessionDrained` 纯函数（§3.7）；`RuntimeCreationPlanFacts.approvalChain?` 由当前变更定义，本方案不改 |
| `src/service/trunk/impl/apply-journal.ts` | 编排（`src/service/trunk/` 私有） | C5 run-stop commit drain 谓词；去掉 native/processCoverage 前提；保持 host fence/ledger 校验；**R3**：业务发布 `commitPreparedDirect/TeamPlan/Activation/InitialWorkflow`（`:1156/1191/1217/1246`）在 store 写入前调用 sidecar authorization 写入（失败 ⇒ 不提交） |
| `src/provider/trunk/impl/git-command.ts`（+ 条件锚点 `git-trunk-store.ts` / `src/service/trunk/impl/git-capabilities.ts`；`src/provider/trunk/public/trunk-store.ts` 仅 I0 要求公共出口时） | 编排（`src/provider/trunk/`、`src/service/trunk/` 私有） | 新增 per-operation **sidecar `authorization.jsonl`** 的 append/读取（不改变 `GitRefJournal`/`GitInitializationRecord` 与 replay/settlement 比较，F3）；**E-a**：sidecar 写前锚点 `git-trunk-store.ts`（publish `safeWrite`/`update-ref` 前）与 `git-capabilities.ts`（candidate journal/对象/ref 前）列入条件写集；`public/trunk-store.ts` 为潜在第 6 个与在飞重叠文件（I0 冻结是否需要公共导出）；不改变 `readGitHostProtectionRequirement`/`readGitProtectionFacts` |
| `src/provider/codex/session.ts` | Codex 适配器（**条件参与，默认零写入**） | **E-b**：仅 D1/D2/D6 的**证据/事实同步**；其中 D6（`trustedPurePreparation` 赋值）实际在运行时核心 `session.ts`，本行不改该逻辑；`plan.native` 投影/`ensureAdapter` 回落/`bindRole` 条件核对归运行时核心（R9）；仅当 I0 确认需适配器侧同步时参与，不改变证据语义 |
| `app/desktop/session.ts` | 桌面窗口 | C8 run-stop drain 谓词；`ownedRunStopMembers` native optional；Git 能力注入不变（`:4306-4308`）；不新增审批卡 |
| `src/common/门禁引擎/*`、`src/common/shared/shell-approval-binding.ts`、`src/service/gate/shell-rules.ts` | 门禁引擎/shared-code | **不改**（当前变更写集）；本方案只读消费 |
| `src/common/gates/index.ts`、`src/common/codex-adapter/chat-transport.ts` | gates-code/Codex 适配器 | **不改**（PR #72 契约/证据生产） |
| 测试（§4.5） | 测试 | 更新/新增 |
| B1 验收标准 | 内置独立验收 | 新增本变更 B1；标注当前变更 `P1.3-B1-AC-26` 被取代（§4.2） |
| 团队计划/沟通记录 | 统筹/沟通 | 按流程写盘 |

**E-a 条件写集说明**：`src/provider/trunk/impl/git-trunk-store.ts`、`src/service/trunk/impl/git-capabilities.ts` 为 sidecar 写前锚点的条件写集（I0 冻结锚点位置）；`src/provider/trunk/public/trunk-store.ts` 仅在 I0 要求公共出口时纳入（潜在第 6 个与在飞重叠文件）；三者均在本表 `git-command.ts` 行内、owner=编排，位于既有 Section 1 私有目录（H1 delta=0）。

**写集重叠告警（F10/E-a）**：当前变更 P1.3 写集已含 `src/service/runtime/session.ts`、`src/model/runtime.ts`（团队计划 §4.2 #1，`approvalChain` 等）、`src/pipeline/orchestration/run-role.ts`、`src/provider/trunk/impl/git-command.ts`、`app/desktop/session.ts`（其 §4.1）；本方案也需改动这 **5** 个文件（部分为确认残留/收窄），另有**潜在第 6 个** `src/provider/trunk/public/trunk-store.ts`（sidecar 公共出口，仅 I0 要求时）。**必须排期在当前变更 E3/合并之后**，或由统筹显式分配同一 owner 的顺序写集；不得并行编辑（Q7）。

### 4.2 与 PR #72、当前变更、B1 的关系

- **PR #72（派发父门 + 应用中介证据）**：本方案不改 `RuntimeSessionToolSurfaceFacts`、`composeRuntimeApplicationMediation`（`session.ts:281-314`）、`inspectToolSurface` 的 strict 事实/reason 集合、派发父门模块（`src/common/gates/index.ts`）与 controller resume。`inspectInitializationProtection` 原本对 `applicationMediation` 零引用（测试断言 `test/编排/trunk-dispatch-parent.test.ts:395`、`test/测试/runtime-dispatch-gate-integration.test.ts:416`）；本方案**继续保持零引用**（optionalEvidence 只读 `toolSurface.status/reasons` 与 native 摘要，不读 applicationMediation；Q15）。
- **当前变更 P1.3**：
  - 复用：审批 binding/审计探针、`approvalChain`、只读 Git 白名单/角色 ACL（P1.3 §2.3/§2.4）。
  - **取代**：P1.3 §2.2.3 codex native plan 分支、§2.3.4 `native-factory-plan-unavailable`「仅 codex 保持阻断」行、§0.3/Q9 的 Git 写披露、§4.6 残余风险 6、**`P1.3-B1-AC-26` 与 B1-EV3**（按版本前缀标签引用，不按行号）。取代不是删除历史：当前变更的验收记录须注明「`P1.3-B1-AC-26` 由后续变更取代」；本变更 B1 另立（新增 AC 用 `P1.2-AC-25`…`P1.2-AC-31`，其中 `P1.2-AC-28` 为负向披露项）。
  - 若当前变更实现保留了 Codex native 创建阻断（P1.3 口径），本方案实施时一并删除；若其 E3 已合入，本方案在其后叠加。
- **P1.6 Q5**：本方案即 P1.6 Q5 所指「仓库初始化保护的应用中介证据」的替代答案——不是把应用中介证据用于写门，而是**删除写门的注册表级预知要求，改为动作时授权**。

### 4.3 风险档位（T3）与残余风险

- **T3 依据**：治理/权限/审批/审计语义变更；删除受保护项目 Git 写门的进程级闭包；跨运行时核心（session/model）、编排（trunk-runtime/run-role/service-trunk/provider-trunk）、Codex 适配器、桌面与测试共享契约；停稳契约变化；不得压档。
- 残余风险（如实）：
  1. **审批放行的不透明脚本可能写 `.git`**：shell 非只读由客户/判断 agent 审批，审批放行的脚本不经 `resolveWrite`（P1.3 §4.6 风险 2 已披露）；旧门用「所有 active 会话 native 闭包」阻止此风险，本方案按客户决定删除该门后，**控制手段变为逐操作审批 + 审计 + 执行后审计 + 结构化 Git 的冲突检测**。这是客户明示取舍（Q1）。
     **更宽的跨会话风险（F8）**：删除 B9/B10 后，其它 active 会话的 **foreign MCP** 或**未封闭/未知 app 工具**同样可以在 `git-mutation` lease 之外写 `.git`；旧注册表级闭包是唯一的跨会话阻断。控制手段同前（逐操作审批/审计/后审计 + 结构化 Git 冲突检测）；foreign MCP/未知工具只记入 `optionalEvidence`（不重新变成门），并在 §6.3 明确不宣称已阻断。
  2. **旧会话泄漏进程可能并发写**：disposed 条目只以 tracked process 退出为终止证据；Claude/Pi native 进程树不可观测，无法证明无泄漏。缓解：`git-mutation` 单写者 lease、dispose 尽力停止、host 中断使 lease 失效（`recordGitHostInterruption` `git-command.ts:601-610`）。Q5。
  3. **审计缺口**：sidecar authorization 写失败 ⇒ 拒绝；拒绝动作只留诊断日志（无 sidecar/journal）。Q6。
  4. **run-stop 语义变化**：Claude/Pi 「已停止」= Core/tracked-process drain，不等于 native 进程树已消失；如实披露。Q3/Q8。`stopAndInspect` 活动循环改为 drain 即返回；若实施保留轮询，需披露每成员最多 5s 与 timeout facts 接受方式（F7）。
  5. **Codex 配置行为变化**：MCP/WebSearch 的 chat 传输真实限制在绑定/构造期仍会失败；不再有「native plan 提前给出更清晰 reason」的创建期拒绝路径，错误可能更晚出现。Q2。
  6. **测试面大**：source-text 断言与 reason/验收条目需要同步；若遗漏会红/误判。见 §4.5。
  7. **与当前变更的写集重叠（5 文件 + 潜在第 6 `public/trunk-store.ts`，含 `src/model/runtime.ts`）**：并行编辑冲突风险；必须串行（Q7）。
  8. **可选证据被误读为授权**：文档/测试必须断言 unknown/缺失不改变放行结果；代码审查重点。
  9. **drain reason 分类错误**：`DRAIN_EVIDENCE_ONLY_REASONS` 若把 live-work/清理失败 reason 误列为证据，会放过未排空会话；本版改为「未知 reason 默认阻断」，并在接口评审逐条冻结（F6）。

### 4.4 迁移与兼容

- 旧会话/旧注册表条目：新 gate 只按动作时事实判定；不要求历史条目补 native plan/processCoverage。
- 旧 journal：**不新增字段**（F3）；sidecar `authorization.jsonl` 是新文件，旧工具忽略；旧 journal 无 sidecar 不迁移、不补写。
- 同一 operationId 重试/恢复：新 lease/turn 追加 sidecar 行；journal replay/settlement 身份比较不变（`git-trunk-store.ts:1187-1189,1219-1224,1298-1299`；`git-command.ts:140-147`）；效果后结算失败保持既有 pending-recovery 语义。
- Codex native 可选（F5）：`RuntimeCreationPlanFacts.native?` 本就可选；只有 facts `observed` 且 adapter/绑定存在时才投影；`ensureAdapter` 在 `nativePreparation` 无 adapter 时回落工厂构造；`present-but-changed` 仍 `runtime-native-factory-plan-binding-unverified`，`absent` 不拒绝。
- 旧错误码：退役码可能出现在历史日志/证据中，保留只读对照；新代码不再产生。桌面错误映射可加人话（O6）。
- 回切开关：不新增（回切=回滚提交）；既有 `ANS_SHELL_ESCALATION_DISABLED` 等保持不变。
- 规则集版本：本方案不涉及（当前变更 `ans-default-v4` 保持）。
- 发布/tag：不在范围。

### 4.5 测试同步（断言旧预知行为的测试逐条列出）

| 测试（本检出快照） | 现状断言 | 新契约 | 处置 |
| --- | --- | --- | --- |
| `test/runtime-core/git-capability-tools.test.ts:577-601`（R14） | 受保护 + codex shell + raw shellGate ⇒ `required-scope-unconfined-script-tools`，拒绝 | 当前变更先改为 `protected-scope-approval-chain-unproven`；本方案再改为「codex native plan 可选、审批链成立即可绑定」 | 改写（按当前变更→本变更两阶段） |
| 同文件 `:509` | 伪造能力回调 ⇒ `protected-scope-requires-verified-plan` | 保留控制面证据拒绝（A11） | 保留（若 reason 变化同步） |
| 同文件 `:775-782` | custom/demo 受保护拒绝 | 保留（A4） | 保留 |
| 同文件 `:1002-1007, :1025` | strict surface reasons/native 绑定 | 证据生产不变；门消费者删除 | 保留证据断言；如测试断言「该 reason 阻断」则改 |
| `test/编排/trunk-dispatch-parent.test.ts:388-395` | 源码断言 `inspectInitializationProtection` 含 `surface.status !== "observed"`、`nativeToolRegistry !== "application-mediated"`、不读 applicationMediation | 新 gate 不再含这些条件；仍不读 applicationMediation | 改写源码断言（改名/新条件） |
| `test/测试/runtime-dispatch-gate-integration.test.ts:409-416` | 同上（N15 写门严格 observed） | 同上 | 改写 |
| `test/桌面应用/chief-workflow.test.ts:2146` | `controller-stop-target-instance-unproven` 断言 | 新语义仍保留该码（Core 身份），native 可选 | 保留并补 Claude/Pi 正向 |
| `test/编排/rapporteur-module-consumption.test.ts:389-451` | `run-stop-unverified` Service 语义（direct stop 拒绝） | `:1487` direct-stop 语义不变；`commitPreparedRunChange` 终止证据改 drain | 保留 direct 断言；新增 commit 路径用例 |
| `test/编排/stable-write-runtime.test.ts:300,316` | 桩返回 `git-old-core-programs-unproven` | 码保留、语义收窄 | 保留；补 drain 行为 |
| `test/runtime-core/session-lifecycle.test.ts` | lifecycle/processCoverage 断言 | 新增 drain 谓词用例；processCoverage 仍如实 unknown | 新增/更新 |
| `test/codex-adapter/application-surface.test.ts:141-153`、`test/runtime-core/application-mediation.test.ts` | `unmediated-execution-registered` 白名单/strict reasons | PR #72 不变 | 不改（除如 reason 集合变化） |
| `test/测试/git-role-workflows-e2e.test.ts:382-386, :1262-1265` | 测试模型按 strict/native surface 决定是否调用工具 | 若测试模型逻辑代表旧契约，改为按 ACL/任务调用；native 仅证据 | 评估更新（不属产品代码） |
| 新增：`test/编排/trunk-runtime`（或等价） | — | F2/R1 宿主继续：deferred run-stop + rapporteur disposed/空闲，`finalizeRunChange` 以 `host-continuation` 通过；**同 coreSessionId 不同 taskId/记录不唯一 ⇒ 拒绝**；身份/turn 不符拒绝 | 新增（正向/负向） |
| 新增：`test/编排/`（`git-command.test.ts`/`git-trunk-store.test.ts`/`git-capabilities.test.ts` 或新增文件；E-c） | — | F3/R2/R3 sidecar：同一 operationId 新 lease/turn 重试不触发 replay/settlement 冲突；旧 journal 无 sidecar 兼容；**init/文档/计划/激活/initial workflow 的 `policyInputDigests` 多键**；`commitPrepared*` 写前锚点；路径/JSONL 安全/预算/坏行；sidecar append 失败 ⇒ `git-action-audit-unavailable`；pending-recovery 语义 | 新增 |
| 新增：`test/编排/trunk-runtime` | — | F4/R10 `prepared`/`failed` `factoryEntered`/`pending`/`instance-bound` 分支；active `core-instance-inspection-failed`/无 toolSurface/**toolSurface 身份漂移** ⇒ `git-core-in-flight-unproven`/`git-core-inspection-unavailable` | 新增 |
| 新增：`test/runtime-core`/`test/codex-adapter` | — | F5 Codex native 不可用（responses/MCP/WebSearch/custom transport）仍可创建/动作；plan 省略 native；`ensureAdapter` 回落工厂；`present-but-changed` 拒绝 | 新增 |
| 新增：`test/runtime-core/session-lifecycle.test.ts` | — | F6 drain reason 分类（native read failure、real-provider-settled-not-observed、cleanup failures、custom disposal、未知 reason 默认阻断）；F7 `stopAndInspect` 活动循环 drain 即返回（不耗满 5s） | 新增 |
| 新增：`test/编排/trunk-runtime` | — | F8 foreign MCP/未知工具只进 optionalEvidence、不参与判定；§6.3 不宣称 | 新增 |
| `test/gates/*`、`test/门禁引擎/*` | PR #72/当前变更 | 本方案不改；当前变更的 Git 只读用例保持 | 不改/随当前变更 |

> 说明：删除/改写断言属于**契约变更**，逐条在实施证据与验收记录中列明；不得以「放宽断言」方式静默通过（意图记录 ② 第 3 条）。

---

## 5. 可检查验收标准（B1 输入）

> 本节是方案自带的可核对标准，不是验收结论；正式 B1 由独立验收基于客户确认版本编写。所有「拒绝」均须检查**未执行副作用**（工作树/索引/ref/journal/进程）与审计。
>
> **标签约定（E-e）**：`AC-1`–`AC-24` = 本方案基础序列；`P1.2-AC-25`…`P1.2-AC-31` = 本方案新增 AC（P1.2 引入的编号，P1.3/P1.4 沿用；其中 `P1.2-AC-28` 为负向披露项）；`P1.3-B1-AC-26` = 在飞变更 B1 v1 的 AC-26；`B1-EV3` = 在飞变更 B1 v1 的 EV3 行。跨文档一律按此标签引用，不按行号。

### 5.1 正向

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-1 | 受保护项目 + Claude + product 会话（当前变更创建成功）+ 在本任务写集内 `git_candidate commit` | 动作时授权通过；**sidecar `authorization.jsonl` 出现一行**（actor/task/turn/`leaseId`/`policyInputDigests.candidate`；policyDigest 来自调用点 `checkGitPolicy().inputDigest`）；gate 输出只含 actor/controls/optionalEvidence（F1）；ref/工作树按既有语义提交；无 native 要求 |
| AC-2 | 受保护项目 + Pi + 角色 ACL 内 `git_candidate commit` | 同 AC-1（不同运行时，同一门） |
| AC-3 | 受保护项目 + Claude/Pi convener + `git_candidate init` | init 按既有 `init.json` + sidecar authorization（`policyInputDigests:{init,candidate}`）；无 `git-core-creation-proof-unavailable`/`git-native-surface-unproven` |
| AC-4 | 受保护项目 + Claude convener + `git_publish delivery`（真实任务/回合） | 既有 actor/expected-old/candidate 校验 + sidecar authorization（`policyInputDigests:{publication}`）；发布成功 |
| AC-5 | 受保护项目 + Codex 默认工厂：native facts observed 且有 adapter/绑定；以及 native 不可用（responses wire/MCP/WebSearch/custom transport）两种 | observed ⇒ plan 记录 native 强证明；不可用 ⇒ plan **省略** native，不阻断创建/动作（F5）；**chat+shell 是 strict `toolSurface` unknown 但 native plan observed，不得混淆这两类证据** |
| AC-6 | 受保护项目 + `git_candidate commit` 时进程内存在多个 Claude/Pi/judge active 会话 | 不再因其它会话 strict unknown/processCoverage unknown 拒绝；只按 actor 判定 |
| AC-7 | 可选证据缺失/unknown | 动作结果与 native 是否存在无关；sidecar 记录 optionalEvidence=unknown |
| AC-8 | run-stop/controller-stop：Claude/Pi 运行成员；**deferred run-stop 的宿主继续 finalize** | 以 drain 谓词终止并可提交；deferred 路径在 rapporteur disposed/空闲后以 `host-continuation` 成功（F2），**taskId 由 inventory 记录与 `held.plan.requesterTaskId` 双绑定（R1）**；native absent 不阻断，present-but-changed 拒绝（F12）；**终止事实写入 run transition journal，不写 sidecar（R6）** |
| AC-9 | 只读 `git_query`/只读 shell Git/非只读 shell 审批 | 与当前变更 AC-5/6/7 一致（不因本方案回退） |
| P1.2-AC-25 | F2 宿主继续（确定性）：`prepareRunChange` 返回 `deferred`，真实回合结束后 `resumeDeferredRunChanges → executeOwnedRunStop → finalizeRunChange`（rapporteur 已 disposed 或无 active `select_run_change`） | `host-continuation` 分支通过；匹配 `requesterTurnId`/actor/**taskId（inventory 记录 + `held.plan.requesterTaskId`，R1）**/role/project；无 active tool 要求；提交成功 |
| P1.2-AC-26 | F3 sidecar 重试/恢复：同一 operationId 崩溃后以新 lease/turn 重试；旧 journal（无 sidecar）；效果后结算失败 | 追加 sidecar 行且**不触发** `git-operation-replay-conflict`/`git-candidate-operation-conflict`/`git-init-operation-conflict`；旧 journal 正常读取；pending-recovery 语义不变 |
| P1.2-AC-27 | F5 Codex native 不可用的创建/动作（responses/MCP/WebSearch/custom transport） | 创建成功；`plan.native` 缺席；`ensureAdapter` 回落工厂构造；动作时授权正常；`present-but-changed` 仍拒绝 |
| P1.2-AC-29 | R1 负例：host-continuation 的 `coreSessionId` 存在，但 inventory 记录的 `taskId` 与 `input.taskId`（`held.plan.requesterTaskId`）不符，或记录不唯一 | `git-actor-core-binding-unproven`；不提交、无副作用 |
| P1.2-AC-30 | R3/S5/E-d sidecar 安全：符号链接/nlink≠1/越界路径、超长行/文件/尝试数（按 I0 冻结预算；候选 4 KiB 行/64 KiB 文件/16 次）、坏 JSON、截断末行 | 非法路径/超预算/坏 JSON ⇒ `git-action-audit-unavailable`（不执行）；截断末行可容忍并留诊断；无 repo 效果 |
| P1.2-AC-31 | R2 文档/计划/激活/initial workflow 发布 | sidecar `policyInputDigests:{candidate,publication}` 两键均存在且等于对应 `checkGitPolicy().inputDigest`；发布回执/ref journal 成功；无 native 要求 |

### 5.2 负向

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-10 | 伪造 actor：无真实 Core 会话/无 active Git tool/角色不符/项目不符 | 既有 `git-*-actor-unproven`/`git-actor-core-binding-unproven` 拒绝；无 ref/journal/工作树副作用 |
| AC-11 | 任务/回合过期或不属于该 actor；source parent 非真实 chief 回合 | `git-*-root-source-unproven`/`git-source-process-history-unproven` 拒绝 |
| AC-12 | 角色 ACL 越权：su/judge、非 convener init/integrate/revert/delivery、publish-documents 非四角色 | 工具层/`git-policy-role-action` 拒绝；无副作用 |
| AC-13 | 策略越权：写区外、OID/ref 不符、stale authorization、diff 不完整 | `git-policy-*` 拒绝；无副作用 |
| AC-14 | 根身份变化/其他 worktree 共享布局 | `git-root-discovery-unproven`/policy 拒绝；不写 |
| AC-15 | 并发 Git mutation lease 已持有/跨项目 mutation | `git-host-coordinator-busy`/`git-host-cross-project-coordinator-busy`；后到者不执行 |
| AC-16 | sidecar authorization 写入失败（**失败注入：阻断/替换 `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl` 的写入 store**） | `git-action-audit-unavailable`；不执行；无 ref/对象/工作树副作用（F12） |
| AC-17 | 未审批的非只读 shell / 裸 Git 写 / `start_background_task` 借授权 | 当前变更负例（AC-13/14/22）保持拒绝 |
| AC-18 | PR #72 回归：`inspectToolSurface` strict 事实/reasons、`composeRuntimeApplicationMediation`、派发父门用例 | 无行为变化；写门仍**不读** `applicationMediation` |
| AC-19 | 可选证据被当授权：把 native/toolSurface 字段伪造成 observed | 不影响判定（不是授权输入）；身份/ACL/策略缺失仍拒绝 |
| AC-20 | run-stop：成员身份变化/**native optional drift**/host fence 不完整 | 定义：`absent` ⇒ 允许；`present-but-changed`（instance/plan 不符）⇒ `run-stop-instance-unproven`/`runtime-native-factory-plan-binding-unverified`；身份/fence 不符 ⇒ 既有 `run-stop-*`/`controller-stop-*` 码；不提交（F12） |
| AC-21 | F4 闭包负例：`preparing`/`creating`/`disposing` 条目；`prepared`/`failed` 条目 `factoryEntered`/`nativeBindEntered`/`pendingContinuations>0`；或 active 条目 `core-instance-inspection-failed`/无 lifecycle/toolSurface | `git-core-in-flight-unproven`/`git-core-inspection-unavailable` 拒绝；不执行；无副作用 |
| P1.2-AC-28 | F8 可选证据：其它 active 会话配置 foreign MCP 或注册未命中 closedTools 的工具 | 动作仍按 actor 判定；foreign MCP/未知工具只出现在 optionalEvidence；**不宣称已阻断**其写 `.git` 的可能（披露项，不是安全通过） |

> **F12/R5 编号说明**：`P1.3-B1-AC-26` 的「被本变更取代」关系属**变更包/沟通记录要求**，不是本变更的代码行为 AC（不参与 pass/fail）；跨文档引用用 `P1.3-B1-AC-26`（当前变更）与 `P1.2-AC-26`（本方案）。原 AC-21 由 F4 行为负例取代。

### 5.3 真实运行（最小，见 §6.2）

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-22 | 受保护目标项目 + 真实 Claude + 单条客户消息派发 | 父门受理 + 任务创建 + 目标会话创建成功 + 任务投递（当前变更目标） |
| AC-23 | 该会话在角色 ACL/写集内执行一次结构化 Git 动作（优先 `git_candidate commit`；若流程要求 init 则 `git_candidate init`） | 成功或如实报告下一真实阻塞（不得伪造）；journal + sidecar authorization 证据存在 |
| AC-24 | 明确限制 | 只承诺证据所示；若 Git 动作需人工审批卡/多回合无法在预算内稳定复现，回退确定性集成测试并如实说明 |

---

## 6. 测试策略与真实运行最小验证

### 6.1 确定性测试（实施阶段）

1. **纯函数/单元**
   - `inspectGitActionAuthorization`：H1–H14 真值表（inventory/actor/role/project/turn/activeTool/root/**host-continuation task 匹配（R1）**/lease 调用点/stale/**in-flight/可读性（含 toolSurface 身份 R10）**/disposed drain/control-plane）。
   - 可选证据断言：native/toolSurface/processCoverage 缺失/unknown/observed 三种输入不改变 `ok` 结果（只改变 optionalEvidence）。
   - `isRuntimeSessionDrained`：providerFinished/activeTools/tracked processes（running/exited/tree unknown/background）/reasons 真值表；Claude/Pi 形态（status unknown、processCoverage unknown、native absent）⇒ drained 正确；**F6/R7/S1：显式 allowlist 外的 reason（含 `native:pi-sdk-idle-not-observed` 非 idle 形态、`native-tool-handler-running`/`native-tool-not-terminal`/`native-mcp-process-coverage-unavailable`、native read failure、real-provider-settled-not-observed、cleanup failures、custom disposal、未知 reason）全部阻断；idle Pi（无该 reason）仍 drained**。
   - `checkGitPolicy`/ACL：既有用例全回归（不改语义）。
   - sidecar 投影/白名单/版本校验/路径安全/JSONL 容错/预算（F3/R3）。
2. **集成（真实运行时核心 + 桩件适配器）**
   - Claude/Pi/Codex 三路径：受保护 + shell 创建（当前变更）→ 结构化 Git 动作 → sidecar authorization；Codex native observed/unknown 两种。
   - `git_candidate commit/init`、`git_publish delivery`、文档/计划/激活发布、run-change/finalize 各调用点：closure→policy→current→sidecar→execute 顺序与 stale 码。
   - **F2 宿主继续**：deferred run-stop + rapporteur disposed/空闲 → `finalizeRunChange`（host-continuation）正向；身份/turn 不符负向。
   - **F3/R2/R3 sidecar 重试**：同一 operationId 新 lease/turn；旧 journal 无 sidecar；sidecar append 失败；pending-recovery；**init/文档/计划/激活/initial workflow 多 verdict 与 `commitPrepared*` 写前锚点**；路径安全/JSONL 坏行/预算。
   - **F4/R10 闭包**：prepared/failed `factoryEntered`/`pending`/`instance-bound`；active `core-instance-inspection-failed`/无 lifecycle/toolSurface/身份漂移。
   - run-stop/controller-stop：Claude/Pi 成员（drain）、Codex 成员（native 可选）、身份/fence 负例；**F7 活动循环 drain 即返回（不耗满 5s）**；**R6 `finalizeRunChange` gate（`:748`）先于 host lease（`:750`）的既有顺序、无 policy/sidecar**。
   - 失败准入 recheck：failed open（Claude/Pi 形态）不再阻塞后续 Git 动作。
3. **回归**
   - PR #72 全套（`test/gates/*`、`test/编排/trunk-dispatch-parent.test.ts`、`test/测试/runtime-dispatch-gate-integration.test.ts`、`test/runtime-core/application-mediation.test.ts`）——除明确改写的写门 source 断言外全绿。
   - 当前变更全套（shell 审批/审计/只读 Git/AC-1–AC-30）。
   - `test/编排/*`、`test/runtime-core/*`、`test/测试/*`、`test/桌面应用/*`、`test/codex-adapter/*`、`test/门禁引擎/*`。
   - `npm run typecheck`；必要时 renderer/build。
4. **基线与证据**
   - 先记录 B0 新基线（变更前失败/skip 名单）；区分「既有红」与「本变更新增红」；删除/改写断言逐条记录。

### 6.2 真实运行最小验证（真实 Claude；预算；只承诺证据）

- 目的：证明受保护项目中 Claude 角色会话不仅能创建/投递（当前变更），还能在 ACL/写集内完成一次**结构化 Git 动作**并留 authorization 审计；其中「其它会话 native 证据缺失」不再阻断。
- 环境与纪律（沿用 P1-RR §4 / 当前变更 §6.2）：
  - 仓库外临时根 + 临时 `userData`；目标项目为最小内容并在运行前制造 `required` 保护事实（父门 init-source 或预置合法 init-source，如实记录）；
  - 真实 UI 导入 + 单条客户消息；只用仓库根 `.env` 既有凭据（不打印/不复制）；
  - 审计预检：目标项目 `docs/audit/shell-gate.jsonl` 可写（若涉及 shell）、`.ans/trunk/operations/` 可写（含 `authorization.jsonl` sidecar）；不通过则记录环境事实并停止；
  - 不修改仓库、不提交、不写既有项目；不改 `app/main.ts`；观察并保留诊断 `session.open.*`、`tasks.jsonl`、`.ans/trunk/operations/*`、UI 截图/文本。
- 步骤：
  1. 导入目标项目、开 chief 会话，发送 1 条消息派发（按 `docs/intents/*.md` 写意图）；
  2. 验证父门受理、任务创建、目标 product 会话创建成功、任务投递；
  3. 让目标角色执行一次 ACL 内的 Git 动作（优先 `git_candidate commit`；若该 flow 的前置要求仓库初始化，则 `git_candidate init`）；观察回执、journal、authorization；
  4. 观察窗口结束即停（`#btn-halt` + `stopSession` + CDP close），如实记录终止方式。
- 预算：
  - 客户消息 1 条；chief 回合 1 个；目标角色回合 1–2 个；`dispatch_task` ≤1 次；Git 能力调用 ≤2 次；审批卡 ≤2 张；
  - 墙钟上限 10–15 分钟；不自动重试；出现首个决定性失败或成功证据即停止；
  - 若 Git 动作因流程/权限链无法在预算内到达，停止并把子项留给确定性集成测试，如实报告，不追加预算、不伪造。
- **只承诺**：本次候选/环境/输入下的观测事实（会话创建、派发投递、至少一次 Git 动作或如实下一门）。**不承诺**：六角色完整闭环、发布成功、长期稳定性、Codex 真实运行（Q13 可选）。

### 6.3 明确不宣称

- 不宣称受保护项目的所有命令面已被证明安全；本方案证明的是「动作级授权 + ACL/策略/租约/审计」，不是效果闭包。
- 不宣称 Claude/Pi 的 native 进程树可观测；不宣称审计失败时仍安全。
- 不宣称删除预知门后不存在审批疲劳/审批放行脚本写 `.git` 的风险（§4.3）。
- 不宣称已阻断其它 active 会话的 foreign MCP/未封闭/未知 app 工具对 `.git` 的写入（F8；这些只记录在 optionalEvidence，不再有注册表级跨会话阻断）。

---

## 7. 闸门 1 问题清单（Q1–Q18）与选装项（O1–O10）

### 7.1 待客户/复核确认（Q）

| # | 问题 | 推荐 | 备选/影响 |
| --- | --- | --- | --- |
| Q1 | **删除注册表级 Git 写门的取舍**：是否确认删除「进程内所有 active Core 条目 strict observed/native factoryPlan/processCoverage complete」要求，接受残余风险——(a) 客户/判断 agent 审批放行的不透明 shell 脚本可能写 `.git`；(b) 其它 active 会话的 foreign MCP/未封闭/未知 app 工具也可能在 `git-mutation` lease 之外写 `.git`（F8）。控制手段变为逐操作审批+审计+执行后审计+Git 冲突检测；foreign MCP/未知工具仅记录 optionalEvidence。 | **是**（客户原话「预知门控全部删掉」；动作时授权是客户指定原则） | 若否，只能保留某种进程级闭包（与客户方向冲突）；或只对 Git mutation 瞬间增加「全部会话停止」的同步停驻（成本高、破坏并发）。 |
| Q2 | **Codex strict native plan 降为可选证据**：创建/Git 动作不因 native plan 缺失/unknown 拒绝；native 事实仍可记录。Codex chat 对 MCP/服务端 WebSearch 的真实不支持仍在构造期报错——接受？ | **是**（意图记录 ② 第 5 条） | 若要求 Codex MCP 可用，另立 app-server 证据变更（范围更大）。 |
| Q3 | **run-stop/controller-stop 终止证据**：改用运行时中立 drain 谓词（providerFinished + 无 active tool + tracked process exited），不要求 `status:"quiescent"`/native/processCoverage complete；Claude/Pi native 进程树不可观测按接受处理？`stopAndInspect` 的活动排空循环也改为 drain 即返回（不默认耗满每成员 5s）？ | **是**（否则六角色闭环的停稳仍 Codex-only；F7 选择 drain 即返回） | 若要求 native 终止强证明，Claude/Pi 运行成员不可停止（现状）；或为 Claude/Pi 建立 OS 级进程观测（另立变更）；若保留 5s 轮询，需在验收记录披露逐成员成本与 timeout facts 接受方式。 |
| Q4 | **closedTools/未知工具门**：删除 Git 写门的「未知工具 ⇒ 拒绝」；是否接受？是否要 O1 在**创建期**做一次工具目录检查（可选）？ | 删除；O1 暂不做 | 保留会继续要求预知工具面（与客户方向冲突）。 |
| Q5 | **disposed 条目终止检查**：保留「tracked processes 已退出 + provider 完成 + 无 active tool」的运行时中立检查（不要求 processCoverage/native），作为防止旧会话泄漏进程并发写的最后手段？ | **是**（最小真实终止证据；非预知） | 若删除，旧泄漏进程完全不可见；若保留 native 要求，Claude/Pi 仍阻塞。 |
| Q6 | **Git 动作审计载体（F3）**：新增 per-operation **append-only sidecar** `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`（不改变 journal 重放/结算身份；新 lease/turn 重试追加行），还是把 authorization 写入 `git.json`/`init.json` 字段（需同时修改 replay/settlement 比较与旧 journal 兼容），或另立 `docs/audit/git-actions.jsonl`（O3）？ | **sidecar**（durable、项目内、与操作同源、不动 journal 身份） | journal 字段需改 `git-trunk-store.ts:1187-1189,1219-1224,1298-1299` 与 `git-command.ts:140-147` 的比较并处理旧 journal；另立文件需新写路径/门禁/清理策略。 |
| Q7 | **与当前变更的排期/写集**：本方案需再改 `session.ts`/`model/runtime.ts`/`run-role.ts`/`git-command.ts`/`desktop/session.ts`（与当前变更 P1.3 写集重叠 **5** 个文件；另有潜在第 6 个 `public/trunk-store.ts`（sidecar 公共出口，I0 冻结）；其中 F5/D6 的 `plan.native` 投影/`ensureAdapter` 回落/`trustedPurePreparation` 归**运行时核心 `session.ts`**，R9）。确认**串行**（当前变更 E3/合并后）实施，还是由统筹分配顺序写集？ | **串行**（避免并行冲突与语义叠加） | 并行需要同一 owner 的显式顺序承诺与更细写集；风险高。 |
| Q8 | **RunChangeHostPlan/ControllerStopHostPlan 契约**：`handles.nativeInstanceId` 改为可选（或新增 `identityKind: "native"|"core"`）？`run-stop-unverified`/`controller-stop-terminal-unproven` 语义收窄（码保留）？ | **是**（可选 native；码保留便于兼容） | 若保持必填，Claude/Pi 运行成员仍不可停止。 |
| Q9 | **失败准入与构造事实**：`official-pure-preparation-unproven` 退役；`construction.status` 只按真实边界（factoryEntered/nativeBindEntered/pending/revoked）判定；`trustedPurePreparation` 保留为可选证据字段？ | **是** | 保留旧语义会让 Claude/Pi 的 prepared/failed 条目永远「possibly-started」。 |
| Q10 | **身份/历史类检查保留**：所有 desktop controller 必须在 Core 注册表、source parent 在 Core 历史、`unknownFactoryAttempts` 全局检查——确认这些不是「预知门」、继续保留（文案去掉 effect-scope 措辞）？ | **保留**（身份/权限 fail-closed 是客户原则） | 若客户认为它们也属于「预知」，需另行定义失败方向；默认不删。 |
| Q11 | **可选证据的读取边界**：Git 门只记录 `toolSurface.status/reasons`/native 摘要，**不读** `applicationMediation`（PR #72 写门零引用约束）。是否同意？ | **同意**（保持 PR #72 契约/测试断言） | 若要在审计中记录 applicationMediation，需接口评审修改 PR #72 的「写/发布门不读」注释与测试。 |
| Q12 | **Git 写是否加客户审批卡**：本方案维持「结构化 Git 能力 = 角色 ACL/任务绑定授权」，不弹客户卡（客户补充规格「每个角色的专属git 命令放行」）。确认？ | **维持**（更强身份绑定；避免审批疲劳） | 若要 init/integrate/revert/delivery 加卡，需新 UX/卡面/超时语义（另立）。 |
| Q13 | **真实运行范围**：只做真实 Claude 最小 Git 动作验证（§6.2，10–15 分钟、≤2 次 Git 调用）；Codex/Pi 真实运行不做，由确定性集成测试覆盖。确认？ | **是** | 若要求 Codex/Pi 真实运行，预算与不确定性增加。 |
| Q14 | **custom/demo 受保护拒绝**：保留 `protected-scope-default-native-plan-required`（工厂来源约束，非预知）？ | **保留**（客户未点名；demo 非生产） | 若要求 demo 也放开，需另设 demo 治理语义。 |
| Q15 | **名称**：将 `inspectInitializationProtection` 改名为 `inspectGitActionAuthorization`（保留注释溯源），同步测试符号定位？ | **改名**（语义如实） | 若担心 diff/证据引用，可保留旧名（O2）。 |
| Q16 | **B1 取代关系（F12/R5/S2）**：本变更 B1 取代当前变更 B1 v1 的 **`P1.3-B1-AC-26`** 与 **B1-EV3** 中「`native-factory-plan-unavailable` 仅 codex」表述（按版本前缀标签引用，不按行号）；本方案新增 AC 统一用 `P1.2-AC-25`…`P1.2-AC-31`（含负向 `P1.2-AC-28`），避免与当前变更 AC 编号冲突。当前变更验收报告须注明「由后续变更取代」？ | **是** | 若不取代，两份 B1 对同一行为给出相反判据。 |
| Q17 | **诊断/审计保留期限**：`git.action.denied` 诊断与 sidecar authorization 的保留/清理是否沿用既有 `.ans/trunk/operations` 与桌面日志策略（不新增清理器）？ | **沿用** | 新增审计文件需要清理策略（O3）。 |
| Q18 | **回切开关**：不新增运行时回切（回切=回滚提交）；确认？ | **是** | 新增开关会引入第二套授权语义。 |

### 7.2 选装项（O；含理由/收益/成本）

| # | 选装 | 理由/收益 | 成本 |
| --- | --- | --- | --- |
| O1 | 创建期「封闭工具目录」检查（P1.3 O2 的延续） | 防未来新增未治理工具静默进入受保护会话 | 跨模块重构；本质仍是预知检查，客户倾向删除；建议不做 |
| O2 | 保留 `inspectInitializationProtection` 旧名作为薄别名 | 减少测试/证据引用 diff | 名称与语义不符；建议改名 |
| O3 | authorization 改写入 journal 字段（`git.json`/`init.json`）或每操作 `docs/audit/git-actions.jsonl` | 单一文件可查 | 需修改 replay/settlement 比较与旧 journal 兼容（F3）；或新写路径/门禁/清理；不推荐 |
| O4 | 高风险 Git 模板（init/integrate/revert/delivery）加客户确认卡 | 客户可见性 | UX/卡面/超时/审批疲劳；与「专属 Git 放行」冲突 |
| O5 | `RuntimeSessionLifecycleFacts.drained?: boolean` 派生字段 | 消费者不重复实现谓词 | Model 契约加法；跨适配器 |
| O6 | 退役/收窄错误码的桌面人话映射 | 回执可读 | i18n/映射维护 |
| O7 | `unknownFactoryAttempts` 按项目根作用域化 | 避免跨项目历史阻塞 | 可能放过跨项目未登记工厂；安全方向需论证 |
| O8 | authorization 中记录 actor 的 `approvalChain` 摘要（只记录） | 审计可关联审批链 | 依赖当前变更 binding 稳定；不判定 |
| O9 | Codex native plan observed 时在 UI/诊断显示「强证明已记录」 | 客户可见强证明 | UI 改动 |
| O10 | 为 `git.action.denied` 增加结构化诊断 schema | 拒绝可审计 | 诊断契约维护 |

---

## 8. 复核处置与团队计划勘误（P1.4，对应复核记录 `2026-11-08_review_git-write-init-approval-based.md`，当前 178 行 / `a2468ed0…`；团队计划 `2026-11-08_team-plan_remove-predictive-gates.md`，503 行 / `911ff546…`）

> 复核结论：P1.0 完整复核 F1–F12「建议修订后提交」；P1.1 窄复核 R1–R10「仍需修订」；P1.1→P1.2 短核对 S1–S5「单点 must-fix（S1）+ 建议」。P1.3 逐条处置如下；复核记录不被修改。

### 8.1 P1.0 完整复核 F1–F12（P1.1 处置，P1.2 保留）

| 编号 | 严重度 | 处置 | 落点 |
| --- | --- | --- | --- |
| F1 | must-fix | **采纳推荐方案 (b)**：gate 定位为 identity/root/closure，不接收 `GitPolicyFacts`、不做 `checkGitPolicy`、不持有 lease；H8/H9 明确标为调用点检查；`authorization` 由调用点在 `checkGitPolicy().inputDigest` 与 `leaseId` 之后组合并写 sidecar；输入新增 `expectedActor`/`expectedTool`/`authorizationMode`/`hostContinuation`；AC-1 断言 sidecar 字段与来源。 | §3.3.1/§3.3.2 H8/H9/§3.3.3/§3.4.3/§4.1/AC-1 |
| F2 | must-fix | **新增 `host-continuation` 授权分支**：`finalizeRunChange` deferred/resume 接受 active 或真正 settled（disposed+drain）的 rapporteur，匹配 actor/task/role/project 与 `held.plan.requesterTurnId`，不要求 live inventory/activeTools；**R1：补 inventory taskId 记录匹配**；C2 同步；补 AC-8/`P1.2-AC-25`/`P1.2-AC-29` 与确定性测试。 | §3.3.1/§3.3.2 H4/H5/§3.3.3/§3.2 C2/§4.5/AC-8/P1.2-AC-25/P1.2-AC-29/§6.1 |
| F3 | must-fix | **改为 append-only sidecar** `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`，不写入 `GitRefJournal`/`GitInitializationRecord`、不参与 replay/settlement 身份；效果前 append，失败 ⇒ `git-action-audit-unavailable`；新 lease/turn 重试追加行，旧 journal 兼容；**R2 多 verdict `policyInputDigests`；R3 安全写入/全部 commitPrepared* 锚点/init 顺序**；Q6/O3 改推荐 sidecar。 | §3.4.3/§4.4/Q6/O3/AC-16/P1.2-AC-26/P1.2-AC-30/§4.5 |
| F4 | must-fix | **新增 H13/H14 运行时中立闭包**：prepared/failed 的 `factoryEntered`/`nativeBindEntered`/`pendingContinuations>0` ⇒ `git-core-in-flight-unproven`（never-started revoked/无 pending 与 failed instance-bound drain 豁免）；active 必须可读 lifecycle/toolSurface，`core-instance-inspection-failed`/缺失 ⇒ `git-core-inspection-unavailable`；B8/伪代码/码表/AC-21/测试同步。 | §3.2 B8/§3.3.2 H13-H14/§3.3.3/§3.8/AC-21/§4.5/§6.1 |
| F5 | must-fix | **Codex 可选证据落地**：`plan.native` 仅在 facts observed 且 adapter/绑定存在时投影，否则省略；`ensureAdapter` 在 `nativePreparation` 无 adapter 时回落工厂构造；A6 仅对主动采用的强证据核对（present-but-changed 拒绝、absent 允许）；AC-5 更正 chat+shell（strict unknown 但 native observed）与真实 native 不可用（responses/MCP/WebSearch/custom transport）的区别；补 P1.2-AC-27 与测试。**R9：owner 为运行时核心 `session.ts`（`prepareRole`/`ensureAdapter`/`bindRole`），不是 Codex 适配器**。 | §3.2 A5/A6/D1/§4.1 session 行/§4.4/AC-5/P1.2-AC-27/§4.5/§6.1 |
| F6 | 建议 | **drain reason 分类收紧**：`DRAIN_EVIDENCE_ONLY_REASONS` + `DRAIN_NATIVE_EVIDENCE_REASONS` 显式白名单；其余现有/新增 reason（含 native handler-running/not-terminal/mcp-process-coverage）**默认阻断**；列出 native read failure、real-provider-settled-not-observed、cleanup failures、custom disposal 等阻断项；接口评审逐条冻结并测试（R7）。 | §3.7/§4.5/§6.1 |
| F7 | 建议 | **`stopAndInspect` 活动排空循环改为 quiescent 快路径或 drain 即返回**；若保留轮询，必须披露每成员最多 5s 与 timeout facts 接受方式；C9/Q3/测试同步。 | §3.2 C9/§3.7/Q3/§4.5/§6.1 |
| F8 | 建议 | **补 foreign MCP/未封闭工具的跨会话风险**：Q1、§4.3 风险 1、§6.3 披露；foreign MCP/未知工具只进 optionalEvidence（不重新变成门）；P1.2-AC-28 作为披露项。 | Q1/§4.3/§6.3/§3.4.3/P1.2-AC-28 |
| F9 | 建议 | **不变量措辞限定**：N5/N7 只覆盖**结构化 Git mutation**；审批放行的不透明脚本写 `.git` 由 shell 审批/审计/后审计覆盖，不宣称为结构化 Git 写。 | §3.9 N5/N7/§4.3 风险 1 |
| F10 | 建议 | **写集重叠改为 5 文件**（加 `src/model/runtime.ts`）；Q7/§4.3 风险 7 同步。 | §4.1/Q7/§4.3 |
| F11 | 建议 | **A1/A7 改为「由当前变更删除/实施中；本方案实施前逐项复核无残留」**，记录 P1.3 实际合并 hash/状态；行号不作契约（符号/文本锚点）。 | §3.2 A1/A7/§4.1 run-role 行/头部基线 |
| F12 | 建议 | **AC-21 元条目移出**（→ 变更包/沟通要求），改为 F4 行为负例；AC-16 写明失败注入方式；AC-20 定义 native optional drift（absent vs present-but-changed）；Q16 按 `P1.3-B1-AC-26`/B1-EV3 标签引用；本方案新增 AC 用 `P1.2-AC-*`（R5）。 | §5.2/§5.3 注/Q16 |

### 8.2 P1.1 窄复核 R1–R10（P1.2 处置）

| 编号 | 严重度 | 处置 | 落点 |
| --- | --- | --- | --- |
| R1 | must-fix | **host-continuation 补 taskId 匹配**：H4/H5/伪代码要求 inventory 中存在唯一记录 `coreSessionId===expectedActor.coreSessionId && taskId===input.taskId && roleId===expectedActor.roleId`（live/disposed 均可），与 `held.plan.requesterTaskId` 双绑定；补 `P1.2-AC-29` 负例；`P1.2-AC-25` 判定含 task。 | §3.3.2 H4/H5/§3.3.3/§3.2 C2/AC-8/P1.2-AC-25/P1.2-AC-29 |
| R2 | 一般 | **多 verdict**：`policyInputDigests:{init?,candidate?,publication?}` 映射（init 两个、文档/计划/激活/initial workflow 两个、commit/integrate/revert 一个、delivery 一个）；来源 `trunk-runtime.ts:236-241,269,331,357`；AC-1/AC-3/AC-4 与 `P1.2-AC-31` 同步。 | §3.3.1/§3.4.3/AC-1/AC-3/AC-4/P1.2-AC-31 |
| R3 | 一般 | **sidecar 安全写入与全部锚点**：复用 `assertControlPaths`/`safeWrite`/版本锁/lease（`git-trunk-store.ts:1158,1179`）；路径/符号链接/nlink/行长/文件预算/尝试数/JSONL 容错；业务发布 `commitPreparedDirect/TeamPlan/Activation/InitialWorkflow`（`apply-journal.ts:1156/1191/1217/1246`）store 写入前调用；init sidecar 先于 `writeGitInitializationRecord(prepared)`；补 `P1.2-AC-30`。 | §3.4.3/§4.1 apply-journal 行/P1.2-AC-30 |
| R4 | 建议 | 旧文字统一为 sidecar/调用点：§0.2 第 5 条、H9（gate 不接收 lease，`leaseId` 由调用点写入）、§4.3 风险 3（sidecar 写失败）。 | §0.2/§3.3.2 H9/§4.3 |
| R5 | 建议 | **AC 编号区分**：本方案新增 AC 统一 `P1.2-AC-25`…`P1.2-AC-31`（含负向 `P1.2-AC-28`）；当前变更用 `P1.3-B1-AC-26`；Q16/§4.2/§5 注同步。 | §5.1/§5.2 注/Q16/§4.2 |
| R6 | 建议 | **finalizeRunChange 适用性**：保持 gate（`:748`）在 host lease（`:750`）之前的既有顺序；gate 只做闭包、无 policy/lease 判定；run-stop 不是 Git ref mutation，不写 sidecar，终止事实写 run transition journal；AC-8 用词区分。 | §3.3.1/§3.4.3/AC-8 |
| R7 | 建议 | **native reason 显式白名单**：`DRAIN_NATIVE_EVIDENCE_REASONS` 列名（Pi/Claude coverage/transport-close），不再用 `native:` 前缀通配；handler-running/not-terminal/mcp-process-coverage 等默认阻断；测试同步。 | §3.7/§4.5/§6.1 |
| R8 | 建议 | **复核记录引用更新**：头部与 §8 引用当前 178 行 / `a2468ed0…`；P1.0 的 91 行 / `d61d731d…`、P1.1 的 138 行 / `b112f297…` 标为历史。 | 头部/§8 |
| R9 | 一般 | **owner 修正**：`plan.native` 投影/`ensureAdapter` 回落/`bindRole` 条件核对归运行时核心 `src/service/runtime/session.ts`；Codex 适配器行只保留 D1/D2/D6 事实/真实限制；Q7 注明。 | §4.1 session/codex 行/Q7/§8 F5 |
| R10 | 建议 | **H14 精度**：`toolSurface.sessionId/roleId/runtime` 必须与 entry 一致，否则 `git-core-inspection-unavailable`；伪代码同步。 | §3.3.2 H14/§3.3.3 |

### 8.3 P1.1→P1.2 短核对 S1–S5（P1.3 处置）

| 编号 | 严重度 | 处置 | 落点 |
| --- | --- | --- | --- |
| S1 | must-fix | **移除 `native:pi-sdk-idle-not-observed`**：该 reason 在 Pi SDK 非 idle（`isStreaming`/`isCompacting`/`pendingMessageCount` 任一非空闲，`real-adapter.ts:1460-1461`）时产生，属 live-work/未知活动信号；移出 `DRAIN_NATIVE_EVIDENCE_REASONS`，未列默认阻断。idle Pi 不产生该 reason，仍可 drain；测试补非 idle 阻断/idle 放行。 | §3.7/§6.1 |
| S2 | 建议 | **AC 范围准确化**：§4.2/Q16/§8 R5 统一写 `P1.2-AC-25`…`P1.2-AC-31`（含负向 `P1.2-AC-28`）。 | §4.2/Q16/§8 R5 |
| S3 | 建议 | **host-continuation 伪代码补 `phase in ["live","disposed"]`**，与 H4/C2 文字一致。 | §3.3.3 |
| S4 | 建议 | **复核引用更新**：头部/§8 引用当前 178 行 / `a2468ed0…`；P1.0 91 行 / `d61d731d…`、P1.1 138 行 / `b112f297…` 标历史。 | 头部/§8 |
| S5 | 建议 | **sidecar 预算自洽**：单行 ≤4 KiB × 最多 16 次 = 文件 ≤64 KiB；`expectedTool` 改为 active-tool 模式必填，伪代码缺失即 `git-actor-core-binding-unproven`；AC-30 同步。 | §3.3.1/§3.3.3/§3.4.3/P1.2-AC-30 |

- **未采纳项（S1–S5）**：无。S1 选择移除 `native:pi-sdk-idle-not-observed`（不采用「Core facts 已覆盖」的等价论证，理由：Pi SDK streaming/compacting/pending 与 Core `providerFinished` 可能短暂不一致，默认阻断更安全）；S2 采用完整 AC 范围；S3 补 phase 过滤；S4 更新复核引用；S5 采用 4 KiB×16=64 KiB 候选组合并交由 I0 冻结。

### 8.4 团队计划勘误 E-a–E-e（P1.4 纯文本修正，语义等价）

> P1.4 是 P1.3（803 行 / `94f71fcb…`）的纯文本勘误，不改方向、写集语义、Q 清单或 T3；团队计划以 P1.3 为语义基线，实施按本版文本（P1.4 hash 见交付）与 I0 冻结结果执行。

| 编号 | 团队计划勘误 | P1.4 修正 | 落点 |
| --- | --- | --- | --- |
| E-a | §4.1 写集表未逐行列出 `git-trunk-store.ts`/`git-capabilities.ts`，但 §3.4.3 以其为 sidecar 锚点；`public/trunk-store.ts` 可能需公共导出 | §4.1 `git-command.ts` 行扩为「+ 条件锚点 `git-trunk-store.ts`/`git-capabilities.ts`；`public/trunk-store.ts` 仅 I0 要求公共出口时」，并标为**潜在第 6 个**与在飞重叠文件；§4.3 风险 7/Q7 同步（5 + 潜在 6） | §4.1/§4.3/Q7 |
| E-b | §4.1 Codex 行引用 D1/D6；D6（`trustedPurePreparation` 赋值）实际在运行时核心 `session.ts` | Codex 行改为**条件参与（默认零写入）**，仅 D1/D2/D6 的**证据/事实同步**并注明 D6 赋值在运行时核心、本行不改；`plan.native` 投影/`ensureAdapter` 回落/`bindRole` 条件核对归运行时核心；`session.ts` 行补 D6；§8 F5/R9 同步 | §4.1 session/codex 行/§8 F5/Q7 |
| E-c | §4.5 新增测试路径写「`test/Provider/trunk`（或等价）」 | 改为 `test/编排/`（`git-command.test.ts`/`git-trunk-store.test.ts`/`git-capabilities.test.ts` 或目录内新增文件） | §4.5 |
| E-d | sidecar 预算「单行 ≤4 KiB × 最多 16 次 = 文件 ≤64 KiB」需与团队计划/I0 表述对齐 | §3.4.3 改为「预算候选：4 KiB×16=64 KiB；最终由 I0 冻结精确组合（与团队计划 §I0-1 一致）」；`P1.2-AC-30` 按 I0 冻结预算断言 | §3.4.3/`P1.2-AC-30` |
| E-e | Q16 取代关系按标签引用（`P1.3-B1-AC-26`/B1-EV3），不按行号 | §5 增加标签约定（`AC-1`–`AC-24`、`P1.2-AC-25`…`P1.2-AC-31`、`P1.3-B1-AC-26`、`B1-EV3`）；全文统一按标签引用 | §5 标签约定/Q16/§4.2/附录 B |

- **未采纳项**：无。E-a 的条件锚点全部在编排既有私有目录（`src/provider/trunk/`、`src/service/trunk/`）内，H1 delta=0；`public/trunk-store.ts` 是否纳入由 I0 冻结（若纳入则为潜在第 6 个重叠文件）。E-d 的精确预算组合由 I0 冻结，本版给候选并声明必须自洽。
- **历史记录**：保留（P1.0 643 行 / `72259e4e…`；P1.1 748 行 / `6e117d36…`；P1.2 792 行 / `36b81769…`；P1.3 803 行 / `94f71fcb…`）；P1.4 的 hash 在交付时重算，见沟通/交接记录。

---

## 附录 A：关键事实索引（本检出只读核对）

- Git 写/初始化门：`src/pipeline/orchestration/trunk-runtime.ts:67-153`（检查）、`:156-276`（`createGitRoleRuntime`）、`:298-340`（文档/计划/激活发布）、`:343-364`（initial workflow）、`:663-715`（prepareRunChange）、`:719-758`（finalizeRunChange）、`:779-856`（controller stop）。调用点：`:212,214,226,244,268,270,330,334,356,359,693,748`。
- 动作时身份/ACL/策略：`trunk-runtime.ts:164-171, 174-219, 221-249, 250-274, 314-320`；`src/provider/runtime/tools.ts:4327-4375`；`src/common/门禁引擎/classify-shell.ts:1025-1102`。
- 创建准入：`src/service/runtime/session.ts:230-242, 357-366, 538-562, 570-585, 602-624, 824-896, 1132-1219`；`src/pipeline/orchestration/run-role.ts:694-747, 749-755`。
- 终止/停稳：`src/service/runtime/session.ts:674-767, 903`；`run-role.ts:694-704`；`trunk-runtime.ts:703-705, 743-744, 796-797, 839-845`；`src/service/trunk/impl/apply-journal.ts:1487, 1598-1644`；`app/desktop/session.ts:1460-1486`。
- Codex native：`src/provider/codex/session.ts:406-458, 546-547, 943-948`；`src/common/codex-adapter/chat-transport.ts:259-296`；strict 消费 `src/service/runtime/session.ts:837-863`；派发门 `src/common/gates/index.ts:164-253`。
- 审批/审计（当前变更）：`src/common/shared/shell-approval-binding.ts:129-166`（未跟踪，W1）；`src/common/编排/shell-gate.ts:369-536, 502`；`src/pipeline/orchestration/shell-arming.ts:150, 263, 356`；`src/common/编排/shell-audit.ts:103-126`；`src/common/门禁引擎/shell-write-guard.ts:495-499, 560-579`；`classify-shell.ts:1109-1113, 1532-1545, 1838-1842, 2137`。
- host/根：`src/provider/trunk/impl/git-command.ts:290-325, 525-569, 584-624`。
- 测试同步：`test/runtime-core/git-capability-tools.test.ts:509, 577-601, 775-782, 1002-1007, 1025`；`test/编排/trunk-dispatch-parent.test.ts:388-395`；`test/测试/runtime-dispatch-gate-integration.test.ts:409-416`；`test/桌面应用/chief-workflow.test.ts:2146`；`test/编排/rapporteur-module-consumption.test.ts:389-451`；`test/编排/stable-write-runtime.test.ts:300,316`；`test/runtime-core/session-lifecycle.test.ts`；`test/测试/git-role-workflows-e2e.test.ts:382-386, 1262-1265`。

## 附录 B：与当前变更/PR #72 的冲突检查

- **不改 PR #72**：`RuntimeSessionToolSurfaceFacts`（`src/model/runtime.ts:225-270`）、`composeRuntimeApplicationMediation`（`session.ts:281-314`）、`inspectToolSurface` strict 判定（`:837-863`）、派发父门（`src/common/gates/index.ts`）、controller resume（`trunk-runtime.ts:920-954`）均不修改；写门继续零引用 `applicationMediation`。
- **与当前变更的接口复用**：`approvalChain`/`shell-approval-binding`/`inspectShellApproval`/`probeShellApproval` 由当前变更提供；本方案只读消费，不改其契约。若当前变更 E3 最终接口与本方案引用不一致，按接口评审更新方案，不擅自改动。
- **显式取代（需沟通/验收记录）**：P1.3 §2.2.3 codex native 分支、§2.3.4 `native-factory-plan-unavailable` 行、§0.3/Q9 Git 写披露、§4.6 风险 6、`P1.3-B1-AC-26` 与 B1-EV3（按标签引用，不按行号）。取代不删除历史；当前变更验收报告注明后续变更范围。
- **未发现其他冲突**：本方案不触碰 `stable-write` 许可、写权边界、D3、版本决策、角色卡/边界、发布/tag；不新增角色/DSL。
