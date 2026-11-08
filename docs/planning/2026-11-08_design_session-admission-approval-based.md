# 会话创建准入改为「按操作审批」+ Git 只读/专属命令放行：方案（P1.3）

- 版本：**P1.3 草案，2026-11-08**；ANS 策划（Planning）独立上下文。**取代 P1.2**（844 行，SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`）、**P1.1**（828 行，`720cfbc6…`）与 **P1.0**（752 行，`20fe82ef…`）；历史版本保留、不再作为闸门 1 材料。P1.2 已处置完整复核 F1–F15 与窄复核 R1–R7（复核记录当前 150 行 / `e76e8ce1…`）；**P1.3 为纯文本勘误（4 处路径/owner 修正，语义等价，不改设计/写集唯一性）**，见 §8.5。
- 状态：**待最终只读窄核对（§2.3.2/§4.1、§4.4、AC-6/AC-30、§8.3）、待闸门 1 客户确认；未实施、未测试、未验收、未 commit/push、未运行真实模型。** 本文件是设计候选；客户在闸门 1 确认的版本才是实施与验收基线；实施按团队计划推进（R8a–R8c 已列入 I0 接口评审议程）。
- 风险档位：**T3（建议，详见 §4.6）**。理由：改动受保护项目下**会话创建准入**这一治理/权限语义，触及共享运行时证据契约（`src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/pipeline/orchestration/run-role.ts`）、shell 审批链装配（`shell-gate`/`shell-arming`/`shell-audit`）与门禁引擎硬地板（裸 Git 只读放行），并跨运行时核心/Pipeline/门禁引擎/运行时 Provider/桌面五个角色；即使代码面可控，也属审批与权限边界变更，不得按 T0–T2 处理。
- 依据（本检出只读核对）：
  - 意图记录 `docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行，SHA-256 `51918bc90b25691659aa515bfd475c953e5facb356bc343c2e05e594d779c108`），含 **2026-11-08 客户补充规格**（「git 命令只读放行，每个角色的专属git 命令放行。」及其解读要求）。
  - P1-RR 真实运行证据 `角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`（213 行，SHA-256 `c47198f79572b2ab834d28fa44d5b756c6c9fa21a040d4bb5341fa16a204c06e`）。
  - 已合并变更：PR #72（merge `c069425`，派发父门应用中介证据路径）。本方案**不改**其契约（§2.8）。
  - 上一变更方案 `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md`（P1.6）。**关系如实**：本变更是 P1-RR 证据 §6.4 所指「目标会话创建门」的客户方向修正；P1.6 §4.7/Q5 的「仓库初始化保护的应用中介证据」写门**仍是另案、本方案不放宽**（Q9/F9）。
- 代码基线：worktree `.claude/worktrees/trunk-amendment`，HEAD `a1b2f66`；工作树另有 Claude schema 窄修复（T1）的未提交改动（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`），**不在本方案写集、本方案只读引用**。本文行号均为该快照只读核对结果；实施以符号名与文本锚点为准。
- 标记约定：**[事实]** 已只读核实的代码/文档行为；**[推断]** 基于代码但未经真实运行证实；**[设计候选]** 本方案提议、未实施；**[待确认]** 见 §7。

---

## 0. 摘要（先读这段）

### 0.1 问题

受保护项目（`.ans` 初始化来源/git 保护事实存在 → `readGitHostProtectionRequirement` 返回 `required`）中，目标角色会话创建被拒：
`runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`。
根因不是权限不足，而是现行**创建准入**要求「出厂即预知整个未来命令面」：受保护范围内必须持有**原生工厂计划**（`prepareNative` 仅对 codex 默认工厂实现，`session.ts:570-585`，非 codex 恒 `undefined`），且只要应用工具含 `run_shell`/`start_background_task` 就在创建期直接拒绝（`session.ts:242,546,559,1160,1214`；`run-role.ts:731-733`）。Claude/Pi 结构性不可能满足该证明，故真实 P1-RR 中 product 会话在打开阶段即失败，任务记 `failed`、未入队、无产物（证据 §6.3/§6.4）。

客户方向（意图记录原文）：「这个明显不现实啊，运行非只读命令走审批流程就行了。你还出厂就知道，别人调用什么命令啊。」→ **受保护项目允许创建角色会话；不再要求预知命令；非只读操作走现有审批流程；只读按策略放行；身份/权限/审批/审计证据不弱化。**

### 0.2 本方案（设计候选）

1. **准入与执行分离**：创建准入只核**当时可核的事实**——真实角色/运行时/项目根、保护范围快照与 revision、应用工具注册表精确快照与漂移、工厂来源、角色能力回调无副作用绑定，以及**「若注册了会产生外部副作用的 shell 工具，则审批链与审计必须在装配期已真实存在且可写」**。取消「原生工厂计划」作为非 codex 的通用前提；取消「含 shell 工具即拒绝」。
2. **审批/审计可用性证据（新增，身份绑定）**：`createShellGate` 在构造成功时把该 gate 函数登记进进程内 `WeakMap`（新共享件 `shell-approval-binding`），记录模式（只读档/审批档/规则 advisory/标准三层）、(a) 通道存在性、(c) 规则注入、(b) 可用性、审计 sink 类型/持久性与**审计写门禁探针**（含一次 refresh 重试）结果。会话创建准入对含 shell 工具的受保护会话要求：绑定存在、项目根一致、sink 为持久 file sink 且探针 ok；否则 fail-closed（新 reason `protected-scope-approval-chain-unproven` / `protected-scope-audit-unavailable`）。该证据只证明「应用自己的审批链/审计被真实装配」，不冒充 native/效果闭包。
3. **只读/非只读按操作分类**：只读命令由既有 (c) 规则白名单直接放行（`c-allow`，0 卡）；其余（写/执行/后台/脚本）走既有 (a) 审批卡/「替我审批」+ 审计；确定性封堵与写目标守卫仍为硬拒。**Git**：只读子命令按精确 argv 白名单直接放行（新增，经固定本地 Git 传输执行，不走通用 spawn）；每个角色的专属 Git 命令走既有结构化 `git_query`/`git_candidate`/`git_publish` 的角色 ACL + 纯策略 + 审计，不受创建准入阻塞；越权 Git 一律拒绝。裸 Git 写/发布仍拒绝。
4. **审批链不新建、只接线**：复用 `shell-gate`（(c)/(b)/(a)）、`shell-escalation`（判拒后客户升级）、`shell-command-guard`（长内联/无界搜索封堵）、`shell-write-guard`（写目标守卫）、`shell-audit`（`docs/audit/shell-gate.jsonl`）、桌面审批卡与「替我审批」判断 agent、执行后审计。**审批与审计不可绕过**：未 arm 则 `run_shell` 不注册；arm 后同一审核函数同时控制 `run_shell` 与 `start_background_task`；拒绝/超时/通道不可用一律不执行。
5. **会话可无审批存在，但非只读操作被拦截**：不支持审批的宿主（如 CLI）不 arm shell ⇒ `run_shell`/`start_background_task` 结构性不存在，会话可正常创建；桌面 arm 后非只读操作逐条审批；受保护项目中「有 shell 但无审批链证据」的会话**不允许创建**（fail-closed）。

### 0.3 客户可见结果（设计候选）

- 受保护项目里，内置六角色（chief/product/rapporteur/nominator/convener/verifier）与项目自定义角色的会话可以正常创建，任务可以投递；不再因「没预知命令」被拒。
- 只读命令（含 git 只读）不弹卡、直接执行；写/执行/后台任务弹审批卡（「替我审批」开启时由判断 agent 代批，拒绝给理由，拿不准/不可用一律拒绝）。
- Git 读写分离：只读走白名单/`git_query`；写/发布只走角色专属结构化能力，按既有 ACL/策略/审计；越权仍拒绝。
- **只读 shell Git 的读取范围（客户可见权衡，F1）**：shell 只读 Git **不套用** `git_query` 的 `readableOids`/publication-proof 绑定——`git log` 无目标时默认 **HEAD**（不默认 `--all`），但 `git show <oid>:<path>`、`git cat-file -p <oid>`、`git log <oid>`、`git merge-base` 等可读任意完整 OID/历史；verifier 等角色的结构化读取限制（review 绑定 OID、拒绝 HEAD/live/default log）只约束 `git_query`，**不约束 shell 只读路径**。这是本变更的明确客户权衡（Q1/Q2），不是「读取权限未变」。
- **受保护项目 Git 写/初始化仍很可能被拒（F3/Q9）**：既有 `inspectInitializationProtection` 是**注册表级**门（对进程内所有 active Core 条目要求 strict `status:"observed"`+native factory plan）；本方案放开的 Claude/Pi 会话（以及 judge/pm 审读会话）本身就会使该门不可满足。本方案**不放宽**该门；受保护项目中的 `git_candidate` 写/初始化可能仍返回 `git-core-creation-proof-unavailable`/`git-native-surface-unproven`。
- **审批链证据的审计口径（F4/F8/F10）**：受保护+shell 要求**持久 file sink**（`docs/audit/shell-gate.jsonl`）+ 写门禁探针（与运行期 append 同一 F-6-1 refresh 语义，最多一次重试）；内存/自定义 sink 不满足受保护准入。只读 Git 审计：`branch:"c-allow"`、`by` 以 `ruleset:allow:readonly:git:<id>` 为前缀（其后可带既有档位后缀）、`readonlyGit:{id,canonicalArgv}`（实际执行体）。
- 所有放行/拒绝/审批决定进入 `docs/audit/shell-gate.jsonl`（含命令原文、argv、cwd、分支、谁审的、入口）；受保护项目额外要求审计可写，否则不创建带 shell 的会话。

### 0.4 本方案不做

不实施、不跑真实模型、不改任何产品/测试/角色卡/边界文件；不开放无审批自由 shell；不删除/弱化审批、审计、守卫；不放宽写权/角色边界/客户主权；不建 DSL/工作流引擎；不改 PR #72 已合并的派发父门与应用中介证据契约；不把写/发布门（仓库初始化保护、stable-write、交付）放宽为应用中介证据。

---

## 1. 问题陈述与现状（真实代码证据）

### 1.1 触发事实（P1-RR）

- 真实 Claude 最小派发：`dispatch_task` 通过派发父门（任务创建成功，`taskId=t-mw659tgv-974915bb`），随后目标 product 会话创建被拒（证据 §6.3）：
  `orchestration.session session.open.failed roleId=product`，
  `errorMessage = runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`；任务记 `failed`（`delivery-target-open-failed: …`），未入队、无产品产物（证据 §6.3/§6.4）。
- 失败码因果链（证据 §6.4 原文 + 本次只读复核）：父门受理写入 `.ans/trunk/initialization-sources/init-source-*.json` → `readGitHostProtectionRequirement` 判目标项目为 `required` → 受保护范围内 `prepareRole` 需要 native factory plan；Claude 无 → `native-factory-plan-unavailable`；应用工具含 `run_shell` → `required-scope-unconfined-script-tools`；plan 非 observed → 无 token → Pipeline 抛 `runtime-creation-admission-unproven`。

### 1.2 现行创建准入代码事实

| # | 位置 | [事实] 行为 | 与问题关系 |
| --- | --- | --- | --- |
| F1 | `src/service/runtime/session.ts:230-240` | `readCoreProtectionScope(projectRoot)` 动态读取 `readGitHostProtectionRequirement`；缺失/异常/非法形状 → `unknown`（fail-closed）。 | 受保护范围的唯一来源；`unknown` 一律拒绝。 |
| F2 | `src/provider/trunk/impl/git-command.ts:525-569` | `readGitHostProtectionRequirement` 由 `.ans/trunk/git-mode.json`、`initialization-sources/init-source-*.json`、git 初始化记录、`refs/ans/trunk`、packed refs 等证据推出 `required`；任一不安全/坏件 → `unknown`；`everRequired` 不可被缺失证据清除。 | P1-RR 的项目因父门写入 init-source 变为 `required`。 |
| F3 | `src/service/runtime/session.ts:242` | `hasUnconfinedScriptTools = names.some(run_shell \|\| start_background_task)`。 | 「含 shell 即创建期拒绝」的判据。 |
| F4 | `src/service/runtime/session.ts:538-555` | `ensureAdapter`：`scope unknown` 或 `required && !nativePreparation && runtime !== "demo"` → `runtime-protected-scope-requires-verified-plan`；`required && hasUnconfinedScriptTools` → `required-scope-unconfined-script-tools`。 | 首道执行期硬拦（即使拿到 token，Claude/Pi 仍会被第一条件拦）。 |
| F5 | `src/service/runtime/session.ts:556-562` | `verifyScope` 每次 compose/bind 重读范围并要求 state/revision 未变；`required && hasUnconfinedScriptTools` 再次抛错。 | 第二道硬拦。 |
| F6 | `src/service/runtime/session.ts:570-585` | `prepareNative` 仅当 `factoryProvenance === "default-production" && runtime === "codex"` 且未构造过 adapter 时才准备 native；其它运行时返回 `undefined`（`:574`）。 | 非 codex 结构性没有 native factory plan。 |
| F7 | `src/service/runtime/session.ts:1156-1200` | `prepareRole`：`unknown` → reason；`required && hasUnconfinedScriptTools` → `required-scope-unconfined-script-tools`；`required && roleCapabilityGuards unknown` → reason；`required && provenance !== default-production` → `protected-scope-default-native-plan-required`；`custom-override` → `custom-provider-factory-unverified`；非 demo 则调 `prepareNative`，事实不全 → `native-factory-plan-unverified`/`native-factory-plan-unavailable`/`native-factory-plan-preparation-failed`（`:1167-1184`）；reasons 空才发 token（`:1187-1200`）。 | 证据中的两个 reason 直接来自此处。 |
| F8 | `src/service/runtime/session.ts:1132-1155` | `core.composeContext`/`core.bindRole`：`required` 时先 `prepareRole`，无 token → `runtime-protected-scope-requires-verified-plan`；有 token → `bindPreparedRole`。 | 受保护范围只接受「全 observed 计划」。 |
| F9 | `src/service/runtime/session.ts:1202-1219` | `bindPreparedRole`：消费 token；重核 scope state/revision；再次 `required && hasUnconfinedScriptTools` 抛错；`required && roleCapabilityGuards unknown` 抛错；再 `bindRole(role, plan)`。 | 第三道硬拦。 |
| F10 | `src/service/runtime/session.ts:602-630` | `bindRole(role, creationPlan, assertHeld)`：构造/绑定后若 `creationPlan.native` 存在，核 native plan/instance/registry 一致性（`:615-624`）。 | codex 严格路径的 native 绑定核对保留。 |
| F11 | `src/pipeline/orchestration/run-role.ts:726-747` | `bindPreparedRuntimeRole`：`required && prepared.plan.native?.appTools` 含 shell → `runtime-protected-scope-unmediated-app-execution-planned`；token 且 observed → bind；否则 `requirement.state !== "unmanaged"` → `runtime-creation-admission-unproven:<reasons>`；`unknown` 同样拒绝。 | 证据中最终抛错点。 |
| F12 | `src/pipeline/orchestration/run-role.ts:2109-2116` | `openRoleSession` 经 `bindPreparedRuntimeRole` 建会话；失败记诊断 `session.open.failed`。 | 桌面派发/聊天共用。 |
| F13 | `src/service/runtime/session.ts:824-896` | `inspectToolSurface()`：应用工具注册表/处理器漂移检查；native 事实；`appTools` 含 shell → reason `unmediated-execution-registered`（`:855-856`），strict `status` 保持 `unknown`；应用中介证据由 `composeRuntimeApplicationMediation` 构造（PR #72，`:870-880`）。 | **PR #72 契约；本方案不改**。 |
| F14 | `src/service/runtime/session.ts:281-314` | `composeRuntimeApplicationMediation`：default-production、非 disposed、strict reasons 全部在对应运行时白名单内、应用事实 observed 且身份/注册表一致等，才返回 `verified`。 | 派发父门的证据路径；本方案不改。 |
| F15 | `src/service/runtime/session.ts:388-390` | 后台任务管理器仅在普通受治理会话且注入了 `shellGate` 时创建（判断会话不创建）。 | `start_background_task` 与 `run_shell` 同源。 |
| F16 | `src/provider/runtime/tools.ts:5068-5098` | `buildGovernedTools`：未注入 `shellGate` ⇒ `run_shell` **不注册**；`request_shell_escalation` 仅在 shell + escalation 能力同时注入时注册；`start_background_task`/`list_/read_/stop_background_task` 仅在 shell + 后台管理器同时注入时注册。 | 「能力缺席即最强 fail-closed」的结构保证。 |
| F17 | `src/provider/runtime/tools.ts:1514-1600, 1676-1760` | `run_shell`/`start_background_task`：先 `await shellGate({command,argv,cwd,toolCallId,entry})`；**仅 `allow:true` 才 spawn/启动**；`entry` 分别记 `run_shell`/`start_background_task`。 | 审批与执行同址；无 token 可伪造。 |
| F18 | `src/service/runtime/session.ts:497-513` | `initialAppTools`/`initialToolHandlers` 精确快照；`isCurrent()` 比较 options 键值、工厂、role JSON、工具名与 handler 身份。 | 工具注册表「当时事实」的基础。 |

### 1.3 现有审批链路在本代码树的真实接线（[事实]，不虚构）

| # | 环节 | 位置 | 真实语义 |
| --- | --- | --- | --- |
| A1 | 装配项目角色三层链 | `src/pipeline/orchestration/shell-arming.ts:150-218`（`assembleProjectShellGate`） | (c) `classifyShell`+`rules` 由调用方注入；未注入 ⇒ 规则加载抛错 ⇒ 整条拒绝；`advisoryRuleset` **缺省 true**（`:216`）⇒ 生产上 risky/review/deny **跳过 (b)**、直接交 (a)；审计 sink 内建（`docs/audit/shell-gate.jsonl`，`shell-gate` 条件）。 |
| A2 | 装配内置角色审批档 | `shell-arming.ts:356-407`（`assembleOperatorShellGate`） | `operatorOnly:true` + `approveDeny:true`；只接 (c)+(a)；不接 (b)；必须有 (a) 通道（构造期守卫 `shell-gate.ts:503-519`）。 |
| A3 | 装配旧只读档 | `shell-arming.ts:263-305` | 只映射 (c) 白名单；risky/review/deny 一律拒；不接 (a)/(b)。 |
| A4 | 会话臂位（谁 arm） | `run-role.ts:1801-1852` | 内置治理角色（能力位 `shell:"operator-approve"`）→ 审批档；`shellReadonly` 兼容档；项目角色 + `shellOperatorChannel` → 三层链；装配失败 ⇒ 不 arm（`run_shell` 不存在）。 |
| A5 | 能力注入 | `run-role.ts:2093-2099`；`run-role.ts:3534-3539` | `shellGate`/`shellPostAudit`/`shellEscalation` 注入适配器（`undefined` ⇒ 不注册）。 |
| A6 | 桌面接线 | `app/desktop/session.ts:3941-3992`；`app/main.ts:790-807, 876` | 每会话闭包绑定 roleId/projectRoot/runtime/turn signal；内置角色经 `shellOperatorOnly`、项目角色经 `shellOperatorChannel`；「替我审批」开关 = `shellJudgeSwitch.isEnabled() && !shellSessionPaused.isPaused()`（`main.ts:800`）。 |
| A7 | (c)/(b)/(a) 判定 | `src/common/编排/shell-gate.ts:595-933` | 顺序：classifier 缺失/规则失败 → 拒；preblock（长内联/无界搜索）→ 硬拒；写目标守卫 deny → 硬拒 / script → 审批；client deny directive → 拒；script 分支（c=deny 硬拒；上下文加载失败 fail-closed）；c=allow → 放行；client allow directive；advisory/operatorOnly → (a)（生产项目链 advisory 缺省 true、内置角色 operatorOnly）；非上述模式且 c=deny → 硬拒；readonly → 拒；其余 → (b)+(a)（`runBA`）。 |
| A8 | (b) pm 审读 | `shell-gate.ts:990-1034`；`src/pipeline/orchestration/pm-reviewer.ts` | 独立只读判断会话；拿不准/无会话/超时/不可用 → 升 (a)，绝不视为放行。生产项目链默认 `advisoryRuleset:true` 时**不执行**。 |
| A9 | (a) 操作者确认 | `shell-gate.ts:1035-1114`；`app/desktop/operator-channel.ts:429-496`；`operator-channel.ts:968-1044` | 桌面应用内审批卡：命令原文逐字、argv、cwd、升级原因；恰 `allow:true` 才放行；拒绝/取消/Esc/超时/通道不可用/抛错 → 不放行；升级卡与审批卡共享呈现槽（`operator-channel.ts:453-470`）。 |
| A10 | 「替我审批」代批 | `app/desktop/operator-channel.ts:499-701`；`src/common/编排/shell-judge.ts` | 开关开启时先调判断 agent（只读三工具 `judge_read_file`/`judge_list_dir`/`report_shell_judgement`，`src/common/runtime-core/shell-judge/tools.ts:110-162`）；allow ⇒ 放行并推结果行（结果行投达失败 ⇒ 按拒绝）；deny ⇒ 拒绝并给理由；manual/row-failed ⇒ **按拒绝**、不弹客户卡（客户 2026-10-19 裁定）。 |
| A11 | 判拒后客户升级 | `src/common/编排/shell-escalation.ts` | 只对 `entry="run_shell"` 的 judge 判拒/retry-capped 可申请（`:202-235, 308-344`）；后台入口不写/不清除/不消费前台记录（`:311, 353-356`）；卡内容取自判拒记录（逐字原文），客户三选一（一次/本会话/拒绝）；超时/不可用 = 拒绝；每命令每会话一次、会话上限默认 5；回滚开关 `ANS_SHELL_ESCALATION_DISABLED`。 |
| A12 | 审计 | `src/common/编排/shell-audit.ts:103-125, 149-222` | 每次审核（allow/deny/timeout/error）落一行 JSONL（命令原文、argv、cwd、conclusion、branch、by、conditions、execution、entry、judge/customerGrant/directive）；写前经 pm 边界 + `shell-gate` 条件的 `resolveWrite`；审计失败**不翻转判定**（现状，`shell-gate.ts:1134-1217`），只 stderr 如实。升级决定写同文件（`event:"escalation-decision"`，`shell-escalation.ts:528-588`）。执行后审计（越界写入清单）另记同文件（`src/common/编排/shell-post-audit.ts:1-20, 331-334`）。 |
| A13 | 后台任务 | `src/provider/runtime/tools.ts:1676-1760`；`src/common/runtime-core/background-tasks.ts` | `start_background_task` 复用同一条 shell 审核链（`entry:"start_background_task"`），仅 allow 才 `manager.start`；任务随会话 dispose 清理。 |

### 1.4 根因归纳

1. 创建准入把「运行期才决定的命令面」当成「创建期必须证明的静态事实」；而 `prepareNative` 只对 codex 默认工厂实现，Claude/Pi 永远无法提供该证明（F6/F7），这与运行时能力事实矛盾。
2. 应用工具含 `run_shell` 本身并不等于「无中介执行」：桌面在 arm 成功时已经装配了真实的审批链与审计（A1–A12）。创建期却把「含 shell」直接当拒绝理由，等于**否定了应用已有的控制面**。
3. 客户方向正确：把证明对象从「未来命令清单」改成「**审批与审计控制面当时真实存在且不可绕过**」，并把具体操作交给运行期审批。
4. 同时，客户补充要求 Git 只读与角色专属 Git 命令不被准入误伤；当前门禁引擎对**所有**裸 Git 一律硬拒（`classify-shell.ts:1489-1492`、`shell-write-guard.ts:560-562`），与「只读放行」方向冲突，需在门禁引擎内做精确收窄（§2.4.3）。

### 1.5 目标

- G1：受保护项目中，Claude/Pi/Codex 各自按本方案路径**可以创建角色会话**（不再要求预知命令的原生工厂计划；不再因含 shell 工具而在创建期拒绝）；demo 保持现状（受保护范围仍拒绝，§2.6）。
- G2：创建准入保留并在新语义下证明：真实角色身份/运行时/项目根、保护范围快照与 revision、应用工具注册表精确快照与漂移、角色能力回调无副作用绑定、真实任务/run/回合来源（适用处）、**审批链与审计可用性**（仅在注册了 shell 工具的受保护会话）。
- G3：非只读操作（shell 写、后台任务、脚本执行等）一律经既有审批链；审批/审计/守卫不可绕过；unknown 不冒充 observed。
- G4：只读操作按策略直接放行（既有 shell 只读白名单；Git 只读精确白名单）；Git 只读与角色专属 Git 命令不被创建准入阻塞，越权 Git 仍拒绝。
- G5：会话在无审批的宿主（CLI 等）可以存在，但相应的非只读能力**结构性不存在**；错误语义如实。
- G6：不改 PR #72 派发父门/应用中介证据语义；不改写权、角色边界、客户主权；不建 DSL/工作流引擎。

### 1.6 非目标

- 不开放无审批自由 shell；不删除/降低审批、审计、判拒升级、写目标守卫、确定性封堵。
- 不放宽写/发布门（仓库初始化保护、stable-write、交付、run-stop）；不把应用中介证据用于这些门。
- 不改动角色卡文本、角色边界、治理流程与验收权；不新增角色。
- 不为 Git 写命令新开 shell 审批通道；Git 写/发布仍只走结构化能力。
- 不在本变更里解决 P1.6 Q5「仓库初始化保护的应用中介证据」——见 §7 Q9 的显式披露。

---

## 2. 设计

### 2.1 总览：把「预知命令」换成「控制面可用 + 运行期审批」

```
创建期（prepareRole / bindPreparedRole）                运行期（每次工具调用）
─────────────────────────────────────────────          ─────────────────────────────
角色/运行时/项目根（既有）                               run_shell / start_background_task
保护范围快照 + revision（既有）                            │
工具注册表精确快照 + handler 身份（既有）                   ├─ preblock / write-guard → 硬拒
工厂来源（既有）                                           ├─ (c) 只读白名单 → 直接执行（0 卡）
角色能力回调无副作用绑定（既有）                             ├─ 其余 → (a) 审批卡 / 替我审批 → allow 才执行
【新】shell 工具存在 ⇒ 审批链绑定 + 审计探针 ok              └─ 每次判定/决定 → docs/audit/shell-gate.jsonl
【取消】「必须 native factory plan」（非 codex）
【取消】「含 shell 工具 ⇒ 创建期拒绝」
```

关键点：**准入不再回答「会执行哪些命令」，而是回答「如果执行命令，是否一定经过不可绕过的审批/审计」。**

### 2.2 会话创建准入：保留与取消的可核事实

#### 2.2.1 保留的可核事实（全部来自真实对象，不接受调用方/模型投影）

| # | 事实 | 来源（现状） | 新语义下的用途 |
| --- | --- | --- | --- |
| K1 | 真实角色身份/种类/运行时/项目根 | `run-role.ts` `setupRole`；`session.ts:354-356` registry fact；`providerFor` 按 `ResolvedRole` 闭包 | 绑定计划/证据；拒绝身份伪造 |
| K2 | 保护范围 state + revision | `readCoreProtectionScope`（`session.ts:230-240`）；`readGitHostProtectionRequirement`（`git-command.ts:525-569`） | `unknown` 拒绝；prepare→bind 之间 revision 变化 ⇒ `runtime-protection-scope-changed`（既有 `session.ts:1211-1213`；打开租约 `withCoreOpenLease` `session.ts:222-228`） |
| K3 | 应用工具注册表精确快照 + handler 身份 | `initialAppTools`/`initialToolHandlers`（`session.ts:497-498`）；`isCurrent`（`:508-513`） | 漂移 ⇒ `runtime-prepared-configuration-changed`（既有） |
| K4 | 适配器自报 tool-surface 事实（claude/pi/codex） | `inspectToolSurface`（`session.ts:824-896`）；PR #72 `applicationMediation` | **`applicationMediation` 仅派发父门/controller resume 消费；strict `toolSurface` 另被 `inspectInitializationProtection`（Git 写/初始化门）消费**；本方案不改其语义、不新增消费 |
| K5 | 工厂来源 | `factoryProvenance`（`session.ts:494-496`） | 受保护范围仅接受 `default-production`（保留：custom/demo 继续拒绝，见 F7） |
| K6 | 角色能力回调无副作用绑定 | `roleCapabilityGuards`（`session.ts:514-533, 1190-1192`） | 受保护范围 `unknown` 继续拒绝（`required-scope-role-capability-effects-unproven`） |
| K7 | Codex 原生工厂计划（存在时） | `prepareNative`（codex 默认工厂）；`prepareRole` 的 native 投影（`:1163-1185`）；`bindRole` 的 native 绑定核对（`:615-624`） | **保留为 Codex 严格路径**；不再作为其它运行时的前提 |
| K8 | **【新】审批链装配证据** | `createShellGate` 登记的身份绑定事实（§2.3） | 受保护范围 + 注册了 `run_shell`/`start_background_task` ⇒ 必须存在且项目根一致 |
| K9 | **【新】审计可用性** | 持久 file sink + 写门禁探针（含一次 F-6-1 refresh 重试；`createFileAuditSink` 的 gate 判定；§2.3） | 受保护范围 + shell 工具 ⇒ 必须 `file+durable+probe ok`，否则 `protected-scope-audit-unavailable` |
| K10 | 真实任务/run/回合来源（适用处，保留不动） | 派发投递前 `inspectAssignedTask` 校验（`app/desktop/session.ts:9421-9424, 9443-9448`）；目标会话带 `taskId` 打开（`:9429-9430`）；`run-role` 按 assigned task 读取写集（`refreshAssignedTaskScope`）；Git 工具要求当前真实回合与 assignment 复核（`app/desktop/session.ts:3648-3664`）；`trunk-runtime.ts` 要求真实 actor Core 会话/active tool 证明 | 本方案**不弱化**任何真实回合/任务绑定；只解除「预知命令」证明 |

#### 2.2.2 取消的要求

- **取消**：`required` 范围必须以 `native factory plan` 作为通用前提（`prepareRole` 的 native 分支对非 codex 不再产生 `native-factory-plan-unavailable` 阻断）。
- **取消**：`required && hasUnconfinedScriptTools` 的创建期/绑定期拒绝（`session.ts:242, 546, 559, 1160, 1214`）。
- **取消**：`run-role.ts:731-733` 的 `runtime-protected-scope-unmediated-app-execution-planned`（改为「shell 工具存在时必须有审批链证据」）。
- **保留**：`required && unknown scope` 拒绝；`required && custom/demo` 拒绝；`required && roleCapabilityGuards unknown` 拒绝；scope revision 变化拒绝；工具/handler 漂移拒绝。
- **保留**：Codex 默认工厂的 native plan（foreign MCP 非空、native builtin 非空、plannedProcesses 非空、status unknown 等仍拒绝；P1.6 严格路径原条件逐字保留）。

#### 2.2.3 `prepareRole` 新算法（[设计候选]，伪代码）

```
prepareRole(role):
  provider = providerFor(role); reasons = []
  scope = readCoreProtectionScope(projectRoot)
  if scope.state == "unknown": reasons += "runtime-protection-scope-unknown"

  if scope.state == "required":
    if provider.factoryProvenance != "default-production":
        reasons += "protected-scope-default-native-plan-required"        # demo/custom 不变
    if provider.roleCapabilityGuards()?.status == "unknown":
        reasons += "required-scope-role-capability-effects-unproven"
    shellTools = provider.initialAppTools ∩ {run_shell, start_background_task}
    if shellTools ≠ ∅:
        b = await probeShellApproval(options.shellGate)                 # binding 内部执行 sink.probe()，无值入参（R1）
        if !b || canonicalRoot(b.projectRoot) != canonicalRoot(projectRoot):
            reasons += "protected-scope-approval-chain-unproven"
        else if b.audit.sink != "file" || b.audit.durable != true || b.audit.probe != "ok":
            reasons += "protected-scope-audit-unavailable"
        else:
            planApprovalChain = stableProjection(b)                     # 无时间戳，可摘要

  native = undefined
  if provider.factoryProvenance == "custom-override":
      reasons += "custom-provider-factory-unverified"
  else if options.runtime == "codex":                                  # 仅 codex 需要 native plan
      try: prepared = provider.prepareNative()
           ... 既有严格校验（P1.6 §4.4/INV-6）...
           native = projection(prepared.facts)                          # 含 shell 不再单独致命
      catch/事实不全: reasons += native-factory-plan-*（既有三类）

  if !provider.isCurrent(): reasons += "runtime-prepared-configuration-changed"
  plan = { source:"core-factory-plan", planId: newId, roleId, runtime, projectRoot, factoryProvenance,
           status: reasons.empty ? "observed" : "unknown",
           scopeProtection: scope, native?, approvalChain: planApprovalChain?,
           roleCapabilityGuards?, reasons }
  plan.configDigest = sha256({ runtime, roleId, factoryProvenance, appTools, native, roleCapabilityGuards, approvalChain })
  ...
```

说明：
- `status:"observed"` 在此**只表示准入事实集合已核实**，不表示 native 效果闭包；native 字段对 claude/pi 仍为 `undefined`，工具面事实仍由 `inspectToolSurface` 独立诚实报告（strict `unknown` + 应用中介路径，PR #72 语义不变）。本方案明确：**任何写/发布/停稳门不得把 plan.status 当作 native/效果闭包证据**（现状也没有消费者这么做）。
- `unmanaged` 范围**不要求** `approvalChain`（现状行为不变）；只有 `required` + 注册了 shell 工具才要求。`unknown` 范围仍拒绝。
- `approvalChain` 只做**白名单投影**（模式/通道/审计事实），绝不序列化适配器 options/env/凭据。

#### 2.2.4 绑定/执行期复核（[设计候选]）

- `bindPreparedRole`（`session.ts:1202-1219`）：删除 `required && hasUnconfinedScriptTools` 抛错；改为：
  - 重读 scope 并与 plan 的 state/revision 比对（既有）；
  - 若注册了 shell 工具：重新读取 live binding，要求存在、项目根一致、`audit.sink==="file" && durable && probe==="ok"`、稳定投影与 `plan.approvalChain` 一致；否则 `protected-scope-approval-chain-changed`；
  - 保留 `required-scope-role-capability-effects-unproven`。
- `ensureAdapter`（`:538-555`）：把「`required && !nativePreparation && runtime !== "demo"`」改为「`required && !admittedPlan`」；`admittedPlan` 由 `bindPreparedRole`/`composeContext` 在调用适配器前设置（provider 新增 `setAdmittedPlan(plan)`），且必须与当前 `planId`/`isCurrent()` 一致。
- `verifyScope`（`:556-562`）：删除 unconfined 检查；改为「`required` 时 approval-chain 仍一致」。
- `core.composeContext`（`:1132-1145`）：同样在 prepared.token 成立后设置 admittedPlan 并复核 approval-chain。
- Pipeline `bindPreparedRuntimeRole`（`run-role.ts:727-747`）：删除 `:731-733`；保留 token/observed 与 `runtime-creation-admission-unproven:<reasons>`；增加防御性断言（若 plan 声称注册了 shell 但无 approvalChain ⇒ 按 unproven 处理，理论上不可达）。

### 2.3 审批/审计可用性证据（新增共享件，身份绑定）

#### 2.3.1 为什么需要新证据

「`options.shellGate` 是函数」不足以证明它是应用自己的审批链：任意调用方可以传一个恒 `allow` 的函数（测试 R14 就是这样构造 `async () => ({allow:true})` 的）。创建准入需要证据**不是调用方自述**。复用工程里既有的「函数身份 WeakMap」模式（先例：`session.ts:319-329` 的 `blockedRoleCapabilities`）：

- 新共享件（建议）`src/common/shared/shell-approval-binding.ts`（单一来源、无策略逻辑）：
  - `registerShellApproval(gate, facts)`：仅由 `createShellGate`（唯一闸构造器）在构造成功后调用；
  - `inspectShellApproval(gate)`：返回冻结的事实副本或 `undefined`（未登记 ⇒ fail-closed）。
- 事实形状（[设计候选]，全部为白名单投影，无凭据/环境）：
  ```
  {
    source: "orchestration-shell-gate", version: 1,
    projectRoot?: string,                     // 由 buildShellGate 传入；新设计中是准入要件（不再是「仅诊断」）
    mode: "readonly" | "operator-approve" | "rules-advisory" | "three-layer",
    classifier: boolean, rules: boolean,      // (c) 注入情况
    pmAsk: boolean, operatorChannel: boolean, // (b)/(a) 注入情况
    takeGrant: boolean, takeDirective: boolean, routinePolicy: boolean,
    audit: { sink: "file" | "memory" | "custom"; durable: boolean; probe: "ok" | "unavailable" | "unknown"; relPath?: "docs/audit/shell-gate.jsonl" },
    escalation: boolean
  }
  ```
- **可接受的 mode（受保护准入）**：`operator-approve`、`rules-advisory`、`three-layer`（有 (a) 审批路径）；`readonly` 作为**更严档**也可接受（只放行只读，非只读结构性不能执行），但必须在文档/测试中写明；缺失/未知 mode ⇒ `protected-scope-approval-chain-unproven`。
- **审计探针（F4/F8 修订）**：`ShellAuditSink` 增加可选 `probe?(): Promise<"ok" | "unavailable" | "unknown">` 与可选 `describe?(): { kind: "file" | "memory" | "custom"; durable: boolean; relPath?: string }`。
  - `createFileAuditSink`：探针与运行期 append 的 F-6-1 语义一致——先用当前 `activeGate(absAuditPath)` 做纯判定；被拒且注入了 `refreshGate` 时 **await refresh 后以新 gate 重试一次**（仍是纯判定、不写盘、不建目录）；两次都拒/刷新失败 ⇒ unavailable；放行 ⇒ ok。这样创世过渡/边界刚重 pin 的场景不在创建期被误杀（AC-23 可达）。
  - `createMemoryAuditSink`：`describe = {kind:"memory", durable:false}`，`probe = "ok"`（仅测试）。
  - 无 `describe`/`probe` 的自定义 sink ⇒ unknown。
  - **受保护准入的 sink 口径（F8/R3 定稿）**：要求 `sink === "file" && durable === true && probe === "ok"`（生产即 `docs/audit/shell-gate.jsonl`，经 pm 边界 + `shell-gate` 条件）；memory/custom sink **不满足**受保护准入。非持久 sink 的测试通道**不提供普通布尔选项**：由测试 helper 模块导出私有 Symbol（如 `SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE`，不出现在 `CreateShellGateOptions` 类型面与任何生产公共出口）；`createShellGate` 仅当该 Symbol 以非枚举属性存在时接受非持久 sink；生产装配测试断言 `assemble*`/`buildShellGate` 从不设置该 Symbol。理由：审批替代预知命令后，审计是控制面的一部分；非持久 sink 无法证明「审计不可绕过」。
- 说明（证据边界，如实）：该证据证明「当前进程内，这个 gate 对象由应用自己的 `createShellGate` 构造，且构造参数包含 (c) 注入与审计 sink，审计写门禁当时放行」。它**不**证明 native 效果闭包、不覆盖其它进程或绕过（与 PR #72 的 `coverage:"current-process-only"` 同一诚实口径）；也不防御恶意宿主代码（宿主已拥有本机执行权），只防遗漏/误配/伪造证据。审计探针只证明**装配时**写门禁放行（含一次 refresh 重试）；运行期审计写失败由 §2.5.5 策略处理（若启用）。

#### 2.3.2 装配点与登记点（F4/F8/R1/R2 定稿）

- `createShellGate`（`src/common/编排/shell-gate.ts:502-1219`）：构造成功后调用 `registerShellApproval(gate, baseFacts, sink)`——**binding 模块私有保存 sink 引用**（作为 WeakMap 值的内部字段，不导出、不接受调用方提供的 probe 值）；`baseFacts` 含 mode/通道/规则注入/sink `describe()` 结果，`probe` 初始为 `"unknown"`。`mode` 由 `readonlyOnly/operatorOnly/advisoryRuleset` 选项决定（构造期守卫 `:503-536` 已保证互斥/通道要求）。
- `inspectShellApproval(gate)`：同步返回冻结的**基础事实**（不含 sink 引用）。
- `probeShellApproval(gate): Promise<FrozenFacts>`：**签名不接受任何入参值**；binding 内部对登记的 sink 调用 `await sink.probe()`（缺失/抛错 ⇒ `"unavailable"`），同一 gate 的并发调用共享同一 promise，结果冻结并记忆（memoize）。**探针只能由 binding 执行**，调用方/测试无法回填 `"ok"`（R1 的可执行约束）；不存在 `finalizeShellApprovalProbe(value)` 这类接受结果值的 API。
- `prepareRole` 对「受保护 + 注册了 shell 工具」的会话先 `await probeShellApproval(options.shellGate)`，再计算 reasons；`bindPreparedRole`/`verifyScope` 复用同一冻结结果（同一 gate 内不会漂移）。
- **接线（R2）**：不需要 `buildShellGate` 返回 `{gate,audit}`，也不需要 `onAuditSinkCreated` 捕获——`createShellGate` 本来就接收 `opts.audit`，登记时把 sink 引用交给 binding；`buildShellGate`/`assemble*` 只负责创建/传入 sink 与 `projectRoot`，不参与 probe 结果传递。
- **失败语义**：无 sink / 无 `probe()` / probe 抛错 ⇒ `"unavailable"`；受保护+shell ⇒ `protected-scope-audit-unavailable`，不创建会话；非受保护不影响（binding 仍记录事实）。
- `buildShellGate`（`:1297-1342`）：把 `projectRoot` 传入 `createShellGate` 并写入 binding；**`CreateShellGateOptions.projectRoot` 的契约注释需从「仅诊断上下文」改为「准入绑定字段」**（R2 附）。
- `run-role` 把 `shellGate` 原样注入 `createRuntimeAdapter`（`run-role.ts:3534-3539`）；`providerFor` 在 `prepareRole` 读取 `options.shellGate` 并调用 `inspectShellApproval`/`probeShellApproval`。

#### 2.3.3 计划字段与摘要

`RuntimeCreationPlanFacts`（`src/model/runtime.ts:336-350`）增加**可选**字段：
```
approvalChain?: {
  source: "orchestration-shell-gate"; mode: ...;
  classifier: boolean; rules: boolean; pmAsk: boolean; operatorChannel: boolean;
  takeGrant: boolean; takeDirective: boolean; routinePolicy: boolean; escalation: boolean;
  audit: { sink: "file"; durable: true; probe: "ok"; relPath: "docs/audit/shell-gate.jsonl" };
  projectRoot: string;
}
```
- 只登记 **`sink:"file" + durable:true + probe:"ok"`** 的事实（否则 plan 不 observed，字段不出现或为 unknown）。
- 计入 `plan.configDigest`（`:1193-1194` 的哈希输入增加 approvalChain），token 因此绑定该证据。
- 不进入 `native` 字段；不改 `RuntimeSessionToolSurfaceFacts`（PR #72）。

#### 2.3.4 新增 reason（fail-closed）

| reason | 条件 | 结果 |
| --- | --- | --- |
| `protected-scope-approval-chain-unproven` | 受保护 + 注册了 shell 工具 + 无绑定/项目根不符 | plan unknown，无 token；Pipeline 抛 `runtime-creation-admission-unproven:protected-scope-approval-chain-unproven` |
| `protected-scope-audit-unavailable` | 绑定存在但 sink 非 file/durable 或审计探针非 ok | 同上 |
| `protected-scope-approval-chain-changed` | prepare→bind 之间绑定消失/变化 | `bindPreparedRole`/`verifyScope` 抛错 |
| `required-scope-unconfined-script-tools`（退役） | — | 不再产生（保留为历史字符串只读对照，不删除测试里的历史证据引用） |
| `native-factory-plan-unavailable`（收窄） | **仅 codex** 默认工厂取不到 plan | 保持阻断（codex 严格路径不变） |

### 2.4 只读/非只读分类

#### 2.4.1 工具级分类（[事实]+[设计候选]）

| 类别 | 工具（名义集合；实际以「注入才注册」为准） | 治理方式 | 审批卡？ |
| --- | --- | --- | --- |
| 只读 | `read_file`、`list_dir`、`view_image`（读项目图片→下一轮附件）、`project_state`、`contract_check`、`evidence_check`、`session_tail`、`role_status`、`governance_matrix`、`git_query`（只读模板）、`list_background_tasks`、`read_background_task`、`judge_read_file`、`judge_list_dir` | 只读实现/预算/路径策略；`git_query` 走角色 ACL + 纯策略 | 否 |
| 受治理写入（非审批卡，硬门） | `write_file`、`edit_file` | `resolveWrite` 边界/写集/条件/F4/F6/F7 + host-facts 协议（受保护时由 `run-role` 注入 `fileGateProtocol`）+ 版本化/stable 规则 | 否（客户主权/边界门，本方案不改） |
| 审批卡（本变更核心） | `run_shell`、`start_background_task`、`request_shell_escalation`（仅申请） | shell-gate 审核链；请求升级只产生卡、不执行 | 是（含「替我审批」代批） |
| 交互/提交通道（非外部副作用本身） | `request_confirmation`、`request_choice`、`submit_report`、`request_requirement_change`、`request_download`、`submit_version_change`、`submit_refactor`、`request_stable_write`、`select_run_change`、`complete_team_plan`、`activate_role_documents`、`close_created_task`、`dispatch_task`、`terminate_role_run`、`redispatch_task`、`role_activity_log`、`project_note`、`request_version_decision`、`decide_pending_request` | 各自提交/派发/治理门（父门、D1/D3、确认卡、许可、审计）；本方案不改 | 视各自流程；不并入 shell 审批 |
| Git 写/发布 | `git_candidate`、`git_publish` | 角色 ACL + `checkGitPolicy` + 实际 actor/注册表证明 + 初始化保护/交付门 + journal/审计 | 否（Git 专属授权路径，见 §2.4.4） |
| 能力安装 | `install_skill`/`uninstall_skill`/`install_mcp`/`uninstall_mcp` | 注入方可调用；受保护范围由 `roleCapabilityGuards` 绑定为无副作用回调；`unknown` 拒绝 | 否（受保护范围结构阻断） |
| 后台只读/终止 | `list_background_tasks`、`read_background_task`、`stop_background_task` | 只读/终止；终止不产生新外部副作用（安全方向） | 否 |

结论：**「非只读→审批」在 shell 面成立**；其它外部副作用入口各自已有独立且不依赖创建准入的守卫（写门/Git ACL/治理门/能力阻断）。创建准入只需为 shell 面证明审批链可用；不改变其它入口的授权语义。

#### 2.4.2 shell 命令级分类（[事实]）

现行分类链（`src/common/编排/shell-gate.ts:595-933`）即策略，不新造第二份：

1. 规则集/分类器不可用 ⇒ 整条拒绝（`ruleset-load-failed`/`no-classifier`/`classify-error`）。
2. `shell-command-guard` 前置封堵（`shell-command-guard.ts:1-40`）：长内联（>2048B / >10 行 / 单行 >1024B）→ `preblock:inline-too-large`；无界递归搜索 → `preblock:unbounded-search`；硬拒、不弹卡。
3. `shell-write-guard`：显式写目标越界/治理路径 → `write-guard:deny` 硬拒；不透明执行（脚本/无法静态界定写目标）→ `script:review` 交 (a)（`manualOnly`，开关不代批）；脚本上下文不可读 → fail-closed。
4. (c) 四态：`allow`（只读白名单）→ 直接执行；`deny`（硬拒）→ 在**非脚本、非 advisory、非 operatorOnly** 路径终结；`review`/`risky` → 审批。
5. 客户指令（deny 先、allow 后）与升级授权（精确 argv）按既有位置消费。
6. 只读白名单（`defaultShellRules().readOnly`，`classify-shell.ts:1618-1660`）：ls/cat/head/tail/wc/grep/rg/findstr/diff/echo/date/whoami/hostname/uname/which/where/printenv/stat/readlink/basename/dirname、`node --version`、`npm ls/list/view/outdated/root/prefix` 等；**Git 见 §2.4.3**。

**硬地板归因（F2/R5 更正，重要）**：classifier 的 `deny` **不是无条件终结**——在 **advisory**（项目链生产缺省）与 **operatorOnly+approveDeny**（内置角色生产档）下，shell-gate 会把 `review`/`risky`/`deny` 一并交 (a)（`shell-gate.ts:873-902`），客户/判断 agent 可批准。因此**裸 Git 写的真正硬地板是 writeGuard 的程序名 deny**（先于分类执行：`shell-gate.ts:655-676`；`shell-write-guard.ts:559-561`）。本变更后的不变量是：**所有接 (a) 的生产装配路径（项目三层链、审批档）必须注入 writeGuard**（现有 `run-role.ts:1814, 1844` 已注入；验收须断言）；**只读档不接 (a)**，classifier 的 `c=deny` 在 `:903-910` 即终结，硬地板不依赖 writeGuard（`assembleReadonlyShellGate` 的 writeGuard 仍为可选，现状不变）。writeGuard 只对「`matchReadonlyGit` 命中且 `entry==="run_shell"`」返回 pass，其余 `git` 一律 deny；若某接 (a) 的装配路径未注入 writeGuard，裸 Git 写会落到 (a) 审批——不得声称「硬拒」。`start_background_task` 入口不享受 pass（`entry` 条件）。

非只读（必须审批）示例：`rm/mv/cp/touch/mkdir/tee/patch`、`npm test/install/run`、`tsc`、构建工具、解释器脚本、`git` 写子命令（走结构化能力，不走审批）、任何未命中白名单的 `review`/`risky` 命令。

**未分类/未知的默认方向（fail-closed）**：未命中只读白名单的命令一律按**非只读**处理——进入审批链（生产上 (a)）；审批通道不可用/超时/未批准 ⇒ **拒绝**，绝不存在「未知 ⇒ 放行」。未注册/未知**工具**不存在（注入才注册）；未来新增工具必须有治理面（O2 的封闭目录可把这条变成显式检查）。`git` 的未知子命令/未知 flag 不进入审批，直接硬拒（写路径只允许结构化能力）。

#### 2.4.3 Git 只读（shell）白名单与参数级 fail-closed（[设计候选]，客户补充规格①）

**客户方向**：「git 命令只读放行」；本方案定义为：**仅当 `run_shell` 的 argv 命中下述精确只读形态时才直接放行（0 卡）**；其余一切 `git` argv 维持现行硬拒（`deny:raw-git-controlled-tools-required`），并提示使用 `git_query`/`git_candidate`/`git_publish`。**该放行不适用于 `start_background_task`**（后台入口的 `git` 一律拒绝）。

**白名单（精确子命令 + 精确参数；未列即拒）**

| 子命令 | 允许的 argv 形态（`git` 之后） | 规范执行体（固定传输构造，模型不可见） |
| --- | --- | --- |
| `status` | `[--porcelain[=v1]] [--short\|-s] [-- <literal path>…]` | `status --porcelain=v1 -z --untracked-files=normal --ignore-submodules=all -- <paths>` |
| `log` | `[-<N>] [--oneline] [<full-oid>\|HEAD] [-- <literal path>…]`（N=1..100；默认 20；**无目标默认 HEAD，不默认 `--all`**） | `log -<N> [--oneline] --format=%H%x00%P%x00%s <target\|HEAD> -- <paths>` |
| `diff` | `[--stat\|--name-only\|--name-status] [--no-ext-diff] [--no-textconv] [<full-oid> [<full-oid>]] [-- <literal path>…]` | `diff --no-ext-diff --no-textconv --ignore-submodules=all [<oids>] -- <paths>`（显示类 flag 仅影响输出，原样保留） |
| `show` | `<full-oid>:<literal path>`（恰好一个） | `cat-file blob <oid>:<path>` |
| `rev-parse` | `--verify <full-oid\|HEAD>` | `rev-parse --verify <token>^{commit}` |
| `ls-files` | `[--stage] [-z] [-- <literal path>…]` | `ls-files --stage -z -- <paths>` |
| `ls-tree` | `[-r] [--full-tree] [<full-oid\|HEAD>] [-- <literal path>…]` | `ls-tree -r -z --full-tree <target\|HEAD> -- <paths>` |
| `merge-base` | `<full-oid\|HEAD> <full-oid\|HEAD>` | `merge-base <a> <b>` |
| `blame` | `[-L <start>,<end>] -- <literal path>`（行号 1..2000、跨度 ≤2000） | `blame [-L <range>] -- <path>` |
| `cat-file` | `(-t\|-s\|-e\|-p) <full-oid>` 或 `(blob\|commit\|tree\|tag) <full-oid>` | `cat-file <flag\|type> <oid>` |

说明：
- 客户列举的 `cat-file`/`blame` 已包含；`git_query` 结构化模板当前为 `status/diff/log/show/rev-parse/ls-files/ls-tree/merge-base/branch-list/worktree-list`（`src/model/trunk.ts:476-478`），其中 `show` 内部即 `cat-file blob`（`git-command.ts:501`）。`blame` 不在结构化模板中；本方案把它纳入**只读 shell 白名单**（受本表参数约束），不新增结构化模板（O3 可选）。
- **`git log` 默认 HEAD**（F1）：无目标时规范体为 `<target|HEAD>`，**不默认 `--all`**；`--all` 未列入允许 flag ⇒ 拒绝（见攻击表）。任意完整 OID 的历史读取仍允许（见下条披露）。
- **读取范围披露（F1，客户可见权衡）**：shell 只读 Git **不套用** `git_query` 的 `readableOids`/publication-proof 绑定。`git_query` 的读取策略（`classify-shell.ts:1056-1064`；`service/trunk/impl/git-capabilities.ts:378-410`：路径限 `readPaths`、OID 限受控 ref/运行 basis/已发布候选/review 绑定；verifier 拒绝 `HEAD/live/default log`，历史读需 publication proof）只约束 `git_query`；shell 只读路径按本表白名单允许任意完整 OID/历史（`show <oid>:<path>`、`cat-file -p <oid>`、`log <oid>`、`merge-base`）。这是「git 命令只读放行」的直接代价，需客户在 Q1/Q2 明示确认；不把此路径宣称为「读取权限未变」。
- **不允许**任何 `git` 全局选项出现在子命令之前（`argv[1]` 必须是子命令）：因此 `-c`、`-C`、`--git-dir`、`--work-tree`、`--exec-path`、`--config-env`、`--namespace`、`--bare`、`--no-pager`、`--literal-pathspecs` 等一律拒绝；日常 `git --version`/`git --help` 也属于全局选项形态 ⇒ 拒绝（F14；Q2 可决定是否开一个精确例外）。
- 只读子命令的**未知/未列 flag 一律拒绝**（deny-by-default），不是「交审批」——因为裸 Git 写路径在角色模型里不存在；写/发布必须走专属能力。
- 路径必须是**字面项目相对路径**：非空、非绝对、不含 `..`、不含 `.git` 段、不含通配/pathspec magic（`:(…)`）、不含 NUL/控制字符；`GIT_LITERAL_PATHSPECS=1` 另行兜底。
- OID 必须是完整 40/64 hex；不接受短 SHA、revision 表达式、分支名（`HEAD` 除外，仅用于 `rev-parse`/`log`/`ls-tree`/`merge-base` 的允许位置）。

**参数级攻击 → fail-closed（实现必须覆盖）**

| 攻击样例 | 拒绝理由（归因） |
| --- | --- |
| `git -c core.fsmonitor=helper status` / `git --config-env=… status` | 子命令前全局选项出现 → `deny:raw-git-controlled-tools-required`（说明只读形态不允许全局选项） |
| `git -C <other> status` / `--git-dir` / `--work-tree` | 同上（改变目录/仓库） |
| `git status --output=x`、`git log --output x`、`-o x` | 子命令 flag 不在允许集 → 拒绝（`--output`/`-o` 会写文件） |
| `git diff --ext-diff`、`git log --ext-diff` | 未列 flag → 拒绝（外部 diff 程序） |
| `git show --textconv`、`git blame --textconv`、`git cat-file --filters` | 未列 flag → 拒绝（外部 textconv/过滤器） |
| `git show --open-files-in-pager=…`、`-O …`、`--paginate` | 未列 flag → 拒绝（分页器/外部程序） |
| `git diff --no-index <a> <b>`、`--submodule=…`、`--remote=…` | 未列 flag → 拒绝（任意路径/远程/子模块外部程序） |
| `git log --all`（F1） | `--all` 未列入允许 flag → 拒绝；无目标默认 HEAD |
| `git fetch --upload-pack=…` / `git push --receive-pack=…` / `git ls-remote` | 子命令不在白名单 → 拒绝（网络/远程执行） |
| `git status; rm -rf .`（argv 里带 `;`/`\|`/`>`/`$(` 等） | argv-noshell 执行模型；`status` 参数不在允许集 → 拒绝；且一旦执行层改回 shell-string，`denyTokens` 恢复拦截（`classify-shell.ts:1538-1552`，默认记号表 `:1784-1786`） |
| `git blame -L 1,999999999 -- x` | 行号跨度超上限 → 拒绝 |
| `git show <oid>:../../etc/passwd`、`:(glob)…`、`.git/config` | 非字面路径 → 拒绝 |
| 在项目根放置恶意 `git.exe` 后执行 `git status` | **执行层不按 PATH/cwd 解析**：只读 Git 经固定本地传输（绝对可执行文件，`git-command.ts:13`）执行，模型提供的程序名只用于匹配 |
| `start_background_task` + `git …` | 入口不是 `run_shell` → 拒绝 |

**执行路径（关键，F5/F7/F10/F13 修订）**：只读 Git **不得**用通用 `runShell`（PATH/cwd 可被项目内同名程序劫持）。

- **matcher 放置（F13 定稿）**：沿用既有 `matchRoutineShellCommand` 的单引用先例——纯函数放在门禁引擎（`classify-shell.ts` 私有/导出），经 `src/service/gate/shell-rules.ts` 公共出口逐字再导出；**不新增 `src/common/shared/git-readonly.ts`**。`matchReadonlyGit(argv)` → `{ id, template, target?, other?, paths?, limit? } | undefined`；`buildReadonlyGitBody(match)` → 规范 argv 体（单一纯函数源）。
- 门禁引擎 `classifyShellDetailed` 使用该函数：命中 → `allow`（`ruleId:"allow:readonly:git:<id>"`）；未命中且程序为 `git` → 现行硬拒。`shell-write-guard.ts` 使用同一函数：命中且 `entry !== "start_background_task"` → `pass`；否则维持 Git 硬拒（分类器与写守卫**共用同一引用**，防「只改分类器、写守卫仍拒」的经典陷阱）。
- **固定传输公共入口（F5）**：`gitCommandArgv`/`executeGit` 当前**未**从 `src/provider/trunk/public/trunk-store.ts` 导出（该文件 `:45` 只导出 `createGitQueryPort` 等）；`createGitQueryPort` 也无法表达 `blame`、`--oneline`、`cat-file -t/-s/-e` 等变体。因此新增一个**只读 Git 固定传输公共入口**（如 `executeReadonlyGit(projectRoot, match, budgets)`），由 trunk Provider 实现并导出：内部复用绝对可执行、固定 12 项 `-c` 前缀与重建 env；**不接受任意 argv**，只接受 matcher 的受限描述并自行构造规范体。`run_shell` 命中 matcher 时调用该能力；能力缺席 ⇒ 工具层 fail-closed（`readonly-git-runner-unavailable`，不落回通用 spawn）。
- **单一来源与差分测试（F5）**：`buildReadonlyGitBody` 与 `gitQueryBody`（`classify-shell.ts:188-203`）对重叠模板（status/log/diff/show/rev-parse/ls-files/ls-tree/merge-base）必须由差分测试断言「同一描述 → 同一规范 argv」；允许的分叉逐条记录（`blame`、`cat-file` 变体、`--oneline`、`log` 默认 HEAD、`status/log` 的输出格式差异），不得形成第三份无测试的模板实现。
- 固定执行环境（与结构化 Git 完全同源，`git-command.ts:16-18, 370-375, 420`）：`--no-pager --no-optional-locks --literal-pathspecs` + 12 项固定 `-c`（`core.fsmonitor=false`、`core.hooksPath=NUL`、`core.untrackedCache=false`、`core.excludesFile=NUL`、`core.pager=cat`、`pager.status=false`、`pager.diff=false`、`maintenance.auto=false`、`gc.auto=0`、`protocol.allow=never`、`diff.external=`、`core.attributesFile=NUL`）；env 重建（仅 SystemRoot/WINDIR/TEMP/TMP；`PATH=<git dir>`、`HOME/XDG_CONFIG_HOME=<root>/.ans/git-home`、`GIT_CONFIG_NOSYSTEM=1`、`GIT_CONFIG_GLOBAL=NUL`、`GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、`GIT_NO_REPLACE_OBJECTS=1`、`GIT_CEILING_DIRECTORIES=<root>`、`GIT_ATTR_NOSYSTEM=1`、`GIT_LFS_SKIP_SMUDGE=1`、`LC_ALL/LANG/TZ` 固定）。
- **alias 行为（F7）**：设计期本地观察（**未留独立证据哈希，不作为验收证据**）：临时仓库设置 `alias.status/log/rev-parse` 为外部命令后，`git status`/`git log`/`git rev-parse` 输出仍为内建行为（空输出/内建 fatal），未执行 alias。实施必须加入确定性测试断言「内建只读子命令优先于 repo-local alias」，并断言 system/global config 被固定 env 禁用、`.git` 不可被角色写入（`resolve-write.ts:300-301`）。
- **审计字段（F10 定稿）**：现行 gate 的 `branch` 恒为 `c-allow`（`shell-gate.ts:201`），ruleId 只出现在 `by`（`:691`）。因此**不改 `branch` 语义**：只读 Git 放行的审计记录为 `branch:"c-allow"`、`by` 以 `ruleset:allow:readonly:git:<id>` 为前缀（其后可带既有档位后缀）；并**必做**（不再是 O4 选装）在 `ShellAuditRecord` 增加 `readonlyGit: { id, canonicalArgv }`，记录实际执行的规范 argv。AC-6 按此断言（不要求 `branch` 新值）。

**与现有硬地板的冲突（必须显式处理）**：现状 `classifyShellDetailed` 在**所有**分支之前硬拒裸 Git（`classify-shell.ts:1489-1492`），`shell-write-guard` 也在程序名处硬拒（`shell-write-guard.ts:560-562`）；默认规则里的 `readonly:git`（`:1642-1652`）因此目前是**死规则**。本方案把「只读 Git 精确白名单」提升为唯一例外，并删除死规则/同步写守卫；这属于**门禁引擎硬地板收窄**，列入 §7 Q1，需要独立复核与明确的回归测试更新（§4.5）。删除规则数据意味着 `SHELL_RULES_VERSION` 需从 `"3"` 升级（见 §4.4），或保留不可达条目并标注（不推荐）。

#### 2.4.4 角色专属 Git 命令（结构化能力，客户补充规格②）

**结论**：每个角色的「专属 Git 命令」＝既有结构化能力，不新造：

| 能力 | 角色 ACL（工具层，`provider/runtime/tools.ts:4349-4356`） | 深层证明/策略 | 审计 |
| --- | --- | --- | --- |
| `git_query` | 任意非空角色，除 `su`/`single`/`judge`；verifier 需真实被派发的 review 回合（`trunk-runtime.ts:164-171`） | 模板白名单（`GIT_QUERY_TEMPLATES`）；精确 argv 模板（`checkGitPolicy` query 分支，`classify-shell.ts:1057-1064`）；路径限 `readPaths`、OID 限 `readableOids`、limit ≤100 | 查询结果/失败码；操作 journal 不写（只读） |
| `git_candidate` | `commit`：任意非 `su`/`single`/`judge` 角色（工具层 `:4350`）；`init`/`integrate`/`revert`：仅 `convener`（工具层 `:4351`） | 实际 actor Core 会话/注册表/active tool 证明（`trunk-runtime.ts:174-219`）；初始化保护闭包；`checkGitPolicy` 全树 diff/写区/角色动作（`:1066-1099`）；mutation lease | `.ans/trunk/operations/<sha256(operationId)>/git.json` + ref journal |
| `git_publish` | `documents`：`product`/`rapporteur`/`nominator`/`convener`；`delivery`：仅 `convener`（工具层 `:4352-4353`） | 实际 convener/actor 证明（`trunk-runtime.ts:250-261`）；expected-old/candidate 单 ref 确认；`checkGitPolicy` publish 分支 | ref journal/交付证据 |

**按角色的「专属 Git 命令」映射（以工具层 ACL + `checkGitPolicy` 为准；角色卡如更严从其约定）**

| 角色 | 只读 `git_query` | 写 `git_candidate` | 发布 `git_publish` |
| --- | --- | --- | --- |
| chief | 任意模板 | `commit`：`docs/intents/`（`gitRolePath`，`classify-shell.ts:207-208`） | 无（工具 ACL 不含 chief） |
| product | 任意模板 | `commit`：`docs/product/` | `documents` |
| rapporteur | 任意模板 | `commit`：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | `documents` |
| nominator | 任意模板 | `commit`：`角色卡/<目标>/role-card.md\|boundary.md\|boundary.yaml`（仅 D3 选定目标；`classify-shell.ts:212-214`） | `documents` |
| convener | 任意模板 | `commit`/`integrate`/`revert`/`init`（全部写区/集成授权） | `documents`/`delivery` |
| verifier | 仅 review 绑定的精确 OID/模板（`trunk-runtime.ts:164-171, 387-390`） | `commit`：`docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（受任务绑定/写区策略） | 无 |
| 项目角色（非内置） | 任意模板 | `commit`：非治理路径（非 `角色卡/`、非内置五角色文档区；`classify-shell.ts:215`；且 `actorRoleId !== liaison`，`:218`） | 无 |

- 说明：该表是「权限上限」；实际放行还需真实任务/run 绑定、写区/diff 策略与 actor 证明。**注册与拒绝的事实（F12）**：桌面为普通角色会话注入三能力（`app/desktop/session.ts:4306-4308`）；`su`/`single` 会话工具**可能已注册**但 handler 返回 `role-not-allowed`（工具层 `:4350`）；`judge` 会话走判断工具集，**确实不注册** Git 工具。项目角色回退路径还排除 `liaison`（`classify-shell.ts:218`）。CLI 一次性 `runRole` 未注入 ⇒ 对应工具不存在（fail-closed，非拒绝）。

- 这些能力**不经过 shell 审批**，因此不受「审批链可用性」证据约束（其授权更强：任务/run 绑定、真实 actor 证明、全树内容策略、单 ref 确认、journal/审计）。
- 会话创建准入修复后，这些能力在受保护项目中**可以被调用**；「是否放行」仍由上述 ACL/策略/证明决定。**注意（必须披露，F3/Q9）**：`git_candidate` 的写动作还会经过 `inspectInitializationProtection`（`trunk-runtime.ts:97-151`），该门是**注册表级**的——对进程内**所有 active Core 条目**逐一要求 strict `toolSurface.status === "observed"` 与 `native.factoryPlan`（`:112-119`），不只作用者自身。只要会话 arm 了 shell（桌面默认），`inspectToolSurface` 即因 `unmediated-execution-registered`（`session.ts:855-856`）使 strict `status` 为 `unknown`——Codex 也如此；Claude/Pi 更连 native 事实都没有。**本方案放开的 Claude/Pi 会话（含无 shell 的 judge/pm 审读会话）本身就会使该门在注册表层面不可满足。** 因此**在受保护项目中，桌面角色会话的 Git 写/初始化很可能仍被该既有门拒绝**（`git-core-creation-proof-unavailable`/`git-native-surface-unproven`）。这是 PR #72 INV-2 的既有边界（P1.6 Q5 另案），本方案**不放宽**；见 §7 Q9。只读 `git_query` 不受该门影响（模板查询不做初始化保护检查）。
- 越权拒绝样例：`su`/`judge` 调用 → `role-not-allowed`；非 convener 的 `init/integrate/revert/delivery` → 工具层或 `git-policy-role-action`；`publish-documents` 非四角色 → `git-policy-role-action`；路径越出写区 → `git-policy-write-scope`；OID/ref 不符 → `git-policy-ref`/`git-policy-read-oid`；无真实任务/run → `git-task-binding-unproven`/`git-worker-actor-unproven`；stale authorization → `git-policy-stale-authorization`。
- **裸 Git 写命令不得被 (a) 放行**：其硬地板由 **writeGuard** 保证（程序名 deny，先于分类）；本变更把 writeGuard 收窄为「`matchReadonlyGit` 命中且 `entry==="run_shell"` ⇒ pass；其余 `git` 仍 deny」。**不得**把「classifier raw-git deny 先于审批分支」当作硬地板（advisory/operatorOnly 会把 classifier deny 交 (a)）。`git commit`/`push`/`checkout`/`reset`/`clean` 等均不在只读白名单 ⇒ writeGuard deny；**接 (a) 的装配路径（项目链/审批档）必须注入 writeGuard**（`run-role.ts:1814, 1844`；回归断言）；只读档不接 (a)，`c=deny` 即终结，不依赖 writeGuard（R5）。

### 2.5 按操作审批链路（与现有 shell-gate/审批卡/「替我审批」/审计的具体接线）

#### 2.5.1 谁在何时发起

1. **会话创建时**：`openRoleSession` 按角色种类装配 shell 闸（A1–A4）；成功 ⇒ `shellGate` 注入适配器 ⇒ `run_shell`/`start_background_task` 注册；失败/缺件 ⇒ 不注入 ⇒ 工具不存在（最强 fail-closed）。
2. **命令调用时**：`run_shell`/`start_background_task` 先调 `shellGate(req)`（`tools.ts:1563, 1725`）；`req` 含 `command/argv/cwd/toolCallId/entry`，新增可选 `roleId`（来自适配器 options，非模型输入）。
3. **闸内**：按 §2.4.2 顺序判定；需要审批时进入 (a)。桌面 (a) 通道 = `createDesktopOperatorChannel`：开关关闭/无 judge ⇒ 弹应用内审批卡；开启 ⇒ 先问「替我审批」判断 agent；judge allow ⇒ 放行并推结果行；deny/manual/row-failed ⇒ 拒绝（manual 不弹卡）。
4. **判拒后**：若为 judge 主动 deny/retry-capped 且 `entry=run_shell`，角色可调用 `request_shell_escalation` 请求客户卡（一次/本会话/拒绝）；授权只由客户卡回包创建，工具入参不含授权字段；超时/不可用 = 拒绝。
5. **执行后**：`shellPostAudit` 对比前后快照，越界写入记 `docs/audit/shell-gate.jsonl` 并如实回给模型（不静默）。

#### 2.5.2 卡面内容（[设计候选]，加法字段）

- `OperatorPrompt` 增加可选 `entry: "run_shell" | "start_background_task"`（桌面卡显示「前台命令 / 后台任务」）与可选 `roleId`（审计/展示；roleId 仍以会话闭包为准，不信任渲染侧）。
- 审批卡现有内容保持：命令原文逐字、白话摘要、argv 逐项、cwd、升级原因人话+原文、tier/policy、脚本审查上下文（有界）。
- 受保护项目标识：可选 `protectedScope: true`（仅展示「受保护项目：非只读操作需审批并审计」；不参与判定）。

#### 2.5.3 代批边界（不扩大）

- 「替我审批」维持现状：judge 只做系统风险审查；allow/deny 记录 `judge`；manual/row-failed 一律按拒绝且不弹客户卡；deny 档放行仅打 `hardDenyOverride` 标记（客户 D1）；开关是宿主状态，模型不可读写。
- 升级卡维持现状：只有 run_shell 的 judge 判拒/retry-capped 可申请；后台入口不可申请也不消费前台授权；硬地板（c=deny/preblock/write-guard/readonly/script-context）不可申请。
- 本方案**不**把「git 写」纳入审批卡；也**不**允许 judge 审批裸 Git 写（其根本到不了审批层）。

#### 2.5.4 审批不可绕过（含 run_shell/start_background_task/其它外部副作用入口）

| 绕过尝试 | 阻断点 |
| --- | --- |
| 不 arm 直接执行 | `buildGovernedTools` 未注入 `shellGate` ⇒ `run_shell` 不存在（`tools.ts:5068-5077`） |
| 伪造 token/参数放行 | `run_shell` schema 只有 `command`；无 token 参数（`schema.ts:122-133`）；审核与 spawn 同址；仅 `allow:true` 才 spawn（`tools.ts:1563-1600`） |
| 用后台任务绕过 | `start_background_task` 同一 `shellGate`、`entry` 独立（`tools.ts:1725`）；升级授权不适用于后台（`shell-escalation.ts:311, 353-356`） |
| 用升级工具伪造授权 | `request_shell_escalation` 只申请；授权只由客户卡回包创建（`shell-escalation.ts:389-525`）；无记录/硬拒/非 run_shell 不可申请 |
| 用客户指令（B1）绕过 | 指令只在 review/risky 区间消费（`shell-gate.ts:846-869`）；只读档禁注入（构造期守卫 `:529-536`）；once 原子消费 |
| 用脚本文件藏命令 | 脚本/不透明执行进入 `script:review`（(a)，`manualOnly` 开关不代批）；长内联 preblock 硬拒；上下文不可读 fail-closed |
| 用写工具落盘脚本再执行 | `write_file`/`edit_file` 受边界/写集/条件门；执行仍需审批；执行后审计捕捉越界写入 |
| 用 git 写绕过 | 裸 Git 写硬拒；Git 写只走结构化能力（角色 ACL/策略/actor 证明） |
| 用安装技能/MCP 绕过 | 受保护范围 `roleCapabilityGuards` 为无副作用回调，`unknown` 拒绝；PR #72 应用中介精确枚举外来 MCP |
| 用别的角色/回合伪造 | 角色/运行时/项目根/会话来自 Core；Git/升级/审批的卡与授权绑定真实会话闭包；Git actor 需真实 Core 会话与 active tool 证明 |
| 审计缺失仍执行 | 受保护 + shell ⇒ 创建期审计探针必须 ok；运行期新增可选 `auditFailurePolicy:"deny-non-readonly"`（§2.5.5），审批放行但审计写失败 ⇒ 改为拒绝 |
| 改审计文件/伪造记录 | `docs/audit/` 不在角色写区；`shell-audit` 写前经 pm 边界 + `shell-gate` 条件 `resolveWrite`；角色写工具与 shell 写守卫都不能写治理路径 |

#### 2.5.5 可选：受保护范围的审计失败收紧（[设计候选]，Q4）

现状「审计失败不翻转判定」（`shell-gate.ts:1134-1217`）在「审批替代预知命令」后成为薄弱点：审批放行却无审计记录 = 控制面缺口。建议新增 `CreateShellGateOptions.auditFailurePolicy`：

- `"observe"`（缺省，现状）：审计失败只 stderr。
- `"deny-non-readonly"`：若最终结论为 allow，且该 allow **来自审批路径**（非 `c-allow`/只读白名单），而审计 append 失败 ⇒ 返回 `{allow:false, reason:"审计写入失败，已拒绝执行（fail-closed）", by:"audit:unavailable"}`；诊断记 `shell.audit.deny`。只读 `c-allow` 不翻转（客户要求只读放行；其审计失败仍 stderr）。
- 装配：`assembleProjectShellGate`/`assembleOperatorShellGate` 在受保护范围（`readGitHostProtectionRequirement(state !== "unmanaged")` 由 `run-role` 传入或按 `project` 现场读取）启用该策略；非受保护保持缺省。
- 说明：审计失败时该次记录无法落盘（本身写失败），只留 stderr/诊断；这是 fail-closed 的代价，如实披露。

### 2.6 各运行时路径（差异与共同不变量）

| 运行时 | 应用工具面 | native 事实 | 创建准入（新） | shell 审批 |
| --- | --- | --- | --- | --- |
| Claude（`claude-sdk-mcp`） | SDK MCP 工具；内置工具 `tools:[]`（`provider/claude/session.ts:724`），可选 WebSearch（native builtin） | 无 `inspectNativeToolSurface`；strict `status` 恒 `unknown`（`session.ts:842-844`）；应用中介路径（PR #72） | 不再要求 native plan；无 shell 或有审批链证据即 observed；`unknown scope`/custom/demo 仍拒 | 同一 `ShellGate`；只读放行、其余审批 |
| Pi（`pi-custom-tools`） | `noTools:"builtin"` + `customTools`（`pi-adapter/real-adapter.ts:1824, 1695`） | 无 native tool-surface；strict `unknown`；应用中介路径 | 同 Claude | 同 Claude |
| Codex（`codex-chat`） | app tools（含受控 shell） | **原生工厂计划存在**；严格路径原条件保留（HTTP/chat、无外来 MCP、无 native builtin、无 plannedProcesses、status observed） | 保留 native plan 严格校验；`appTools` 含 shell 不再单独拒绝，改为要求审批链证据；无证据 ⇒ unproven | 同 Claude（应用中介路径供派发父门使用，本方案不改） |
| demo | `createDemoRuntimeAdapter`；无 shell 闸（`run-role`/desktop demo 不注入） | 无 | **保持现状**：受保护范围仍按 `protected-scope-default-native-plan-required` 拒绝（`session.ts:1162`），本方案不改变 demo 行为 | 不适用 |

共同不变量：
- 所有运行时共享同一运行时核心工具层与同一 `ShellGate` 语义；不存在按运行时放宽的审批分支。
- `inspectToolSurface`/`applicationMediation`（PR #72）语义不变；创建准入**不消费**应用中介证据。
- 受保护范围内 custom factory / demo 仍拒绝；`unknown` 范围仍拒绝。
- Codex 严格路径原条件逐字保留；仅「含 shell」这一项从创建准入的拒绝理由改为「需审批链证据」。

### 2.7 会话存在性与拒绝语义

- **允许存在**：无审批链的宿主（CLI `ans role run`、judge 会话、pm 审读会话）在受保护项目中可创建；其 `run_shell`/`start_background_task` 不存在（未注入 `shellGate`），只读工具与受治理写工具照常（写仍走边界门）。
- **允许存在**：桌面 arm 且审批链证据成立 ⇒ 会话创建；非只读操作逐条审批。
- **不允许存在**：受保护 + 注册了 shell 工具 + 无审批链证据/审计不可用 ⇒ 创建拒绝（fail-closed）；错误 `runtime-creation-admission-unproven:protected-scope-approval-chain-unproven|protected-scope-audit-unavailable`；不构造适配器、不产生会话、不投递任务（任务侧仍走既有 `delivery-target-open-failed` 回执，`app/desktop/session.ts:9429-9441`）。
- **被拒绝操作的语义**：`run_shell`/`start_background_task` 返回 `{ok:false, message:"<tool> 未执行：审核拒绝（<reason>）…"}`（现有文案）；会话与回合保持存活，模型可改用只读命令/结构化 Git 或（符合资格时）申请升级；不自动重试、不自动替代执行。
- **中止/超时**：本轮中止 ⇒ 挂起审批卡/升级卡失效（`operator-channel.ts:450-470`；`shell-escalation.ts:447-479`），一律不执行。
- **审计缺失**（若启用 Q4 策略）：审批类放行改为拒绝；只读放行保持（策略见 §2.5.5）。

### 2.8 与 PR #72 的边界（不改已合并契约）

- 不改 `RuntimeSessionToolSurfaceFacts` 形状、`composeRuntimeApplicationMediation` 条件、`inspectToolSurface` 的 strict `status`/`nativeToolRegistry`/reason 集合；
- 不改派发父门（`validParent`/`currentChiefResumeSource`/门模块）与 controller resume；
- 不改 `inspectInitializationProtection`（Git 写/初始化/交付门）；
- 新证据（`approvalChain`）只进入 `RuntimeCreationPlanFacts` 与创建准入，**不**被上述门消费。
- 冲突检查结论：未发现需要修改 PR #72 契约的冲突；唯一相邻点是 `run-role.ts:731-733`（创建期对 native appTools 含 shell 的拒绝），它不在 PR #72 门模块中，属于本变更的收窄范围。

---

## 3. 安全不变量（硬约束）

| # | 不变量 | 检查/证据 |
| --- | --- | --- |
| N1 | **不开放无审批自由 shell**：未 arm ⇒ shell 工具不存在；arm 后每次调用必须过审核；仅 `allow:true` 执行 | `tools.ts:5068-5100`；`tools.ts:1563, 1725`；负例 AC-13/AC-14 |
| N2 | **审批/审计/守卫不可绕过**：preblock、write-guard、script fail-closed、升级资格/硬地板、客户指令/授权位置不变 | 既有分支顺序不变（§2.4.2）；回归 AC-13/AC-14/AC-20 |
| N3 | **身份与权限证据 fail-closed**：角色/运行时/项目根/会话来自真实对象；unknown 不冒充 observed；`approvalChain` 只由 `createShellGate` 登记（进程内身份绑定） | K1/K8；负例 AC-11/AC-15/AC-17 |
| N4 | **受保护范围的创建准入只放宽「预知命令」**：unknown scope、custom/demo、scope revision 变化、工具/handler 漂移、角色能力 unknown 仍拒绝 | AC-11/AC-12/AC-18 |
| N5 | **审计是审批替代的组成部分**：受保护 + shell ⇒ 创建期审计探针 ok；可选运行期审批类放行审计失败 ⇒ 拒绝 | §2.3/§2.5.5；AC-12/AC-17 |
| N6 | **Git 读写分离**：只读精确白名单（仅 run_shell）+ 固定传输；裸 Git 写/发布的硬地板由 **writeGuard 程序名 deny** 保证（**接 (a) 的项目链/审批档必须注入 writeGuard**；只读档不接 (a)、`c=deny` 即终结，不依赖 writeGuard；classifier deny 在 advisory/operatorOnly 下可交 (a)，不得当硬地板）；Git 写只走结构化能力 ACL/策略/审计 | §2.4.3/§2.4.4；AC-6/AC-10/AC-16/AC-30 |
| N7 | **越权 Git 拒绝**：角色 ACL、actor 证明、policy 角色动作/写区/OID/ref/stale 全部保留 | §2.4.4；AC-15/AC-16 |
| N8 | **不改写权/角色边界/客户主权**：`write_file`/`edit_file`、stable、D3、验收、版本决策语义不变 | 回归 AC-20；不改相关模块 |
| N9 | **不建 DSL/工作流引擎**：仅复用现有审批/审计/结构化能力 | 本方案无可执行 DSL |
| N10 | **不改 PR #72 派发父门语义**：应用中介证据路径原样；写/发布门不消费新证据 | §2.8；AC-19 |
| N11 | **审批与执行同址、无跨层票据**：不新增可伪造的 token；新增证据是构造期身份绑定，不是放行票据 | §2.3.1 |
| N12 | **只读 Git 不得被 PATH/alias/外部程序劫持**：绝对可执行文件 + 固定 config/env + 内建子命令 + 禁全局选项 | §2.4.3；AC-10 |
| N13 | **失败安全方向**：任何缺失/超时/不可用/解析失败都不放行；只往更严的层退 | 既有 fail-closed 语义 + 新增 reason 表 |
| N14 | **诚实披露**：plan.status 的 observed 仅指准入事实；native 仍 unknown；审计失败不静默；实现/验收不得宣称超出证据 | §2.2.3 注、§6.3 |

---

## 4. 影响面

### 4.1 涉及模块与调用链（[设计候选] 写集候选，最终由团队计划定）

| 模块 | 角色 | 改动要点 |
| --- | --- | --- |
| `src/model/runtime.ts` | 契约（Model） | 加法：`RuntimeCreationPlanFacts.approvalChain?`；`ShellReviewRequest.roleId?`；`OperatorPrompt.entry?/protectedScope?`；`GovernedToolsOptions.readonlyGit`（**必做**的固定传输执行能力）；不改既有必填形状。**注：`ShellAuditRecord` 不在本文件**，其类型定义在 `src/common/编排/shell-audit.ts:103-125` |
| `src/common/shared/shell-approval-binding.ts`（新） | shared-code（PR #72 B-9 已移交） | `registerShellApproval(gate, facts, sink)`（私有保存 sink）/`inspectShellApproval`/`probeShellApproval`（无值入参，内部执行 `sink.probe()` 并 memoize）；无策略逻辑；单一实现；测试私有 Symbol 仅测试 helper 导出 |
| `src/common/编排/shell-gate.ts` | 编排 | 构造成功后登记 binding（基础事实）；`audit` sink 描述/探针接线；可选 `auditFailurePolicy`；把 `roleId`/`entry` 透传到请求/审计；`projectRoot` 语义从「仅诊断」改为准入绑定字段（contract 注释同步） |
| `src/common/编排/shell-audit.ts` | 编排 | **`ShellAuditRecord` 类型定义在本文件**（`:103-125`）；`ShellAuditSink.probe?()`/`describe?()`（file sink 含一次 refresh 重试）；`readonlyGit` 必做字段（`id`/`canonicalArgv`）；可选 `roleId` |
| `src/common/门禁引擎/shell-write-guard.ts` | 门禁引擎 | 只读 Git 命中 ⇒ pass（仅 run_shell）；`entry` 输入；其余 Git 硬拒不变（硬地板依赖本守卫；接 (a) 装配必须注入） |
| `src/common/门禁引擎/classify-shell.ts` | 门禁引擎 | 删除「所有裸 Git 硬拒」；改为「只读精确白名单 allow / 其余硬拒」；matcher/规范体纯函数放本模块（私有/导出），删除死 `readonly:git` 条目并升版本 |
| `src/service/gate/shell-rules.ts` | 门禁引擎公共出口 | 逐字再导出 matcher/规范体（同一引用；沿用 `matchRoutineShellCommand` 先例） |
| `src/provider/trunk/impl/git-command.ts` + `public/trunk-store.ts` | 编排（`src/provider/trunk/` 为编排私有目录） | **新增固定传输只读入口**（如 `executeReadonlyGit`；`gitCommandArgv`/`executeGit` 当前未导出）；规范体 + 固定 config/env + 绝对可执行 + 预算；公共出口导出 |
| `src/provider/runtime/tools.ts` + `schema.ts` | 运行时核心 | `run_shell` 请求带 `roleId`/`entry`；只读 Git 路由到注入能力（不得回退通用 spawn）；工具说明补充只读 Git 与 git_query 指引 |
| `src/service/runtime/session.ts` | 运行时核心/Service | `prepareRole` 新算法；`approvalChain` 投影与摘要；`admittedPlan`；`ensureAdapter`/`verifyScope`/`bindPreparedRole` 替换 unconfined 检查；退役 reason |
| `src/pipeline/orchestration/run-role.ts` | 编排 | `bindPreparedRuntimeRole` 删除 `:731-733`、加防御断言；受保护时向装配传 `auditFailurePolicy`；注入 `readonlyGit`；必要时把 `roleId` 传入装配（binding 事实展示用，非安全依赖） |
| `src/pipeline/orchestration/shell-arming.ts` | 编排 | 选项增加 `auditFailurePolicy`；登记点如不放在 `createShellGate` 则在此登记（推荐前者） |
| `app/desktop/operator-channel.ts` / `app/desktop/session.ts` | 桌面 | 卡面显示 `entry`/受保护标识；只读 Git 执行能力注入；不改判定 |
| `app/main.ts` | 桌面 | 无判定改动（如卡面字段走 IPC，仅透传） |
| 测试（见 §4.5） | 各 owner | 新增/更新 |

### 4.2 数据/事件（审计与诊断）

- **审计 JSONL**（`docs/audit/shell-gate.jsonl`）：沿用 `ShellAuditRecord`；新增必做 `readonlyGit: { id, canonicalArgv }`（只读 Git 放行）、可选 `roleId`、既有 `entry`；**`branch` 保持 `c-allow` 不变**，ruleId 记录在 `by` 以 `ruleset:allow:readonly:git:<id>` 为前缀（其后可带既有档位后缀）（F10）；升级决定/执行后审计不变。append-only，无 schema 版本破坏。
- **诊断事件**：`session.open.start/ready/failed`（reason 列表变化）；`shell.review.start/end`、`shell.preblock`、`shell.write-guard.denied`、`shell.directive.*`、`shell.routine.delegated`、`shell.operator.requested`、`shell-confirm.*`、`shell-judge.*`；新增建议 `shell.git-readonly.allow`（只读 Git 命中）、`shell.audit.deny`（Q4 策略触发）、`session.admission.approval-chain`（准入事实摘要）。
- **任务账本**：不变；失败路径仅在创建被拒时复用 `delivery-target-open-failed`（既有）。
- **Core 注册表**：`prepared` 条目的 reasons 变化（新 reason）；`inspectToolSurface` 事实不变。

### 4.3 错误码/原因码

| 码 | 变化 | 说明 |
| --- | --- | --- |
| `runtime-creation-admission-unproven:<reasons>` | 保留 | reasons 组合变化 |
| `protected-scope-approval-chain-unproven` | 新增 | 无 binding/项目根不符 |
| `protected-scope-audit-unavailable` | 新增 | 审计探针失败 |
| `protected-scope-approval-chain-changed` | 新增 | prepare→bind 绑定变化 |
| `required-scope-unconfined-script-tools` | 退役 | 不再产生 |
| `native-factory-plan-unavailable` | 收窄 | 仅 codex |
| `runtime-protected-scope-unmediated-app-execution-planned` | 退役 | `run-role.ts:731-733` 删除 |
| `runtime-protected-scope-requires-verified-plan` | 保留 | 直接 bind/compose 无 token 的防御错误 |
| `runtime-protection-scope-unknown`/`-changed` | 保留 | 不变 |
| `required-scope-role-capability-effects-unproven` | 保留 | 不变 |
| `deny:raw-git-controlled-tools-required` | 保留/收窄 | 只读白名单以外仍用此码 |
| `allow:readonly:git:<id>` | 新增 | 只读 Git 的 **ruleId**（审计 `by` 以 `ruleset:allow:readonly:git:<id>` 为**前缀**，其后可带既有档位后缀；`branch` 仍为 `c-allow`） |
| `readonly-git-runner-unavailable` | 新增（工具层） | 命中但无执行能力 ⇒ fail-closed |
| `audit-unavailable` | 新增（Q4 分支） | 审批放行但审计失败 ⇒ 拒绝 |

### 4.4 兼容与迁移

- **旧会话/旧计划**：`RuntimeCreationPlanFacts` 加可选字段；旧消费者忽略；token 逻辑不变。
- **旧调用方**：直接向 `createRuntimeAdapter` 传裸 `shellGate` 函数（不经 `createShellGate`）的调用方，在受保护范围 + shell 工具下将被拒绝（新 reason）。这是有意的 fail-closed；合法路径是经 `assemble*`/`buildShellGate` 构造。
- **测试桩（F8/R1–R3）**：受保护正向用例可经 `buildShellGate`/`assemble*`（`createShellGate` 已登记 sink，`probeShellApproval` 惰性执行，无需额外 finalize）；直接 `createShellGate` 需传 `projectRoot` 且 sink 带 `probe()`。`createMemoryAuditSink` 的 `durable:false`，受保护用例仅在测试 helper 导出的私有 Symbol 下才被接受（无普通布尔选项）；自定义 sink 需 `describe()`/`probe()`，否则 unknown。
- **回滚开关**：既有 `ANS_SHELL_ESCALATION_DISABLED` 继续只关升级通道；本方案不新增全局开关（如需回切，按 Q10 讨论）。
- **UI 文案**：新 reason 会出现在派发失败回执中（原始串）；建议（O8）在桌面错误映射中加人话，不影响判定。
- **角色卡**：不改。现有「Git 只走结构化能力、不得用裸 Git」文本保持不变；只读 shell Git 是**权限**而非指令，不改变角色卡约束。
- **规则集版本**：若删除 `defaultReadOnly()` 的 `git` 条目（推荐单一来源，避免死数据/双口径），`SHELL_RULES_VERSION`（`classify-shell.ts:1109`）由 `"3"` 升至 `"4"`，并同步 `rulesId`/pin/规则集版本断言测试；若维持 version 3，则保留该条目为不可达兼容数据并在代码注释说明（不推荐，易被误读为仍生效）。**迁移注意**：若存在项目级 pin/磁盘规则集仍为 version 3，升级常量会因「规则集版本未知」整条拒绝（fail-closed）；必须同时迁移/刷新 pin，或保留对 v3 的兼容读取（二选一，不得静默放宽）。
- **发布/tag**：不在本变更范围。

### 4.5 测试影响（既有用例必须同步）

| 测试 | 现状断言 | 变更后 |
| --- | --- | --- |
| `test/runtime-core/git-capability-tools.test.ts:577-601`（R14） | 受保护 + 原始 `shellGate` 函数 + codex shell ⇒ `required-scope-unconfined-script-tools`，`protected-scope-requires-verified-plan` | 断言改为新 reason `protected-scope-approval-chain-unproven`（原始函数无绑定，仍拒绝）；保持「不构造 native、不发请求、不写 marker」 |
| 同文件 `:509, 775-782` | custom/demo 受保护拒绝 | 保留（K5 不变） |
| `test/门禁引擎/classify-shell.test.ts:39-41, 96-102` | `git status`/`git log`/`git diff` ⇒ deny | 改为 allow（只读白名单）；非白名单 flag/子命令仍 deny |
| 同文件 `:452-460` | `git checkout/commit/push/reset` deny；`git log --output…` deny；`git status` deny | 前两类保持；`git status` 改 allow |
| 同文件 `:649` | `git my-alias` deny | 保持 deny |
| 同文件 `:662-663` | ruleId `deny:raw-git-controlled-tools-required` | `git log --output=x`/`git commit` 仍 deny，ruleId 可保持或改为新精确码（需二选一并固定） |
| `test/门禁引擎/shell-write-guard.test.ts:111-113, 235-259` | `git status` ⇒ deny | 改 pass（仅 run_shell 只读命中）；`git clean/checkout/restore` 保持 deny |
| `test/门禁引擎/git-shell-acl.test.ts:843-852` | 所有裸 Git（含 `git status`）deny | 收紧为「只读精确形态 allow；其余 deny」；路径限定 git 程序保持 deny |
| `test/编排/shell-readonly.test.ts:350-365` | **现状红**：断言只读档 `git status` 放行（raw-git 硬拒导致失败） | 本变更后**转绿**；在基线中标注「既有红转绿」，不属于本变更新增红 |
| `test/编排/shell-gate.test.ts:884-914` | **现状红**：readonly 裁定 A 断言 `git status` 放行失败 | 同上，转绿 |
| `test/编排/shell-risky-order.test.ts:39` | 硬编码 `version:"3"` / `ans-default-v3` | 随 `SHELL_RULES_VERSION`→`"4"` 与规则集 id 同步（F6） |
| `test/测试/lightweight-permission-repairs.test.ts:182`（POSIX skip） | 断言 allow | 按新白名单同步（F6） |
| `test/桌面应用/operator-channel.test.ts` 等 | 卡面/通道 | 加法字段不破坏既有断言；补 `entry` 展示用例 |

新增测试见 §5/§6。

### 4.6 风险档位与残余风险

- **档位 T3**：治理/权限/审批语义 + 门禁引擎硬地板收窄 + 跨五角色共享契约改动。即使实现面可控，也必须独立复核 + 闸门 1 + 独立验收。
- 残余风险（如实）：
  1. **审批疲劳**：逐条审批可能诱导客户/判断 agent 橡皮图章。缓解：只读 0 卡、例行白名单、judge 系统风险审查（现有）；不在本变更扩大代批。
  2. **放行命令绕过文件写边界**：既有已披露风险（`app/desktop/operator-channel.ts:156-158`）——审批放行的 shell 写入不经 `resolveWrite`；执行后审计只能事后发现。本变更不改变，受保护项目靠审批+审计+后审计兜底。
  3. **只读 Git 新面**：虽经固定传输/精确 argv/固定 env，仍是新增 shell 可执行面；以 AC-6/AC-16 参数级攻击矩阵与真实运行覆盖；回切选项见 Q10。
  4. **审计不可用导致会话不可创建**：受保护 + shell 时若探针（含一次 refresh 重试）后审计仍不可写/边界仍未接受，会话被拒；这是有意的 fail-closed，需在错误回执中可读（O8）。
  5. **plan.status 语义重定义**：只用于准入；若有未知消费者误读为效果闭包会有风险。已核对现有消费者（`run-role` 只读 token/status；写/发布门读 toolSurface/native）——建议后续契约改名（O1）。
  6. **Git 写仍受初始化保护门限制（F3/Q9，注册表级）**：受保护项目中只要存在 arm 了 shell 的会话（含 Codex）或 Claude/Pi/judge/pm 任一 active Core 条目，`inspectInitializationProtection` 的 strict 要求即不可满足；客户若要求「专属 Git 写也必须在受保护项目放行」，需另案（Q9）。

---

## 5. 可检查验收标准（B1 用）

> 本节是方案自带的可核对标准，不是验收结论；独立验收在实施前基于客户确认版本写正式标准。所有「拒绝/放行」均需检查**未执行副作用**（进程/文件/后台任务）与**审计记录**。

### 5.1 正向

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-1 | 受保护项目（存在 `init-source-*`）+ Claude + product + 桌面 arm（审批档/三层链） | `prepareRole` 返回 `status:"observed"` + token；`bindPreparedRole` 成功；`session.open.ready`；`appTools` 含 `run_shell`/`start_background_task`；plan 含 `approvalChain` |
| AC-2 | 受保护 + Pi + 项目角色（非内置）+ `shellOperatorChannel` | 同 AC-1（三层链，`advisoryRuleset` 默认 true） |
| AC-3 | 受保护 + Codex 默认工厂 + shell 工具 | native plan 仍 observed；`appTools` 含 shell 不拒绝；有审批链 ⇒ 绑定成功；无审批链 ⇒ `protected-scope-approval-chain-unproven` |
| AC-4 | 受保护 + Claude/Pi + **无 shell 工具**（CLI 路径 / judge 会话 / pm 审读会话） | 创建成功；`run_shell`/`start_background_task` 不存在；写工具仍受边界门 |
| AC-5 | 只读 shell：`ls`、`cat <file>`、`grep pattern src` | 0 卡直接执行；审计 `branch:"c-allow"` |
| AC-6 | 只读 Git shell（run_shell）：`git status`、`git log -5`、`git diff`、`git show <oid>:<path>`、`git rev-parse --verify HEAD`、`git ls-files`、`git ls-tree HEAD`、`git merge-base <a> <b>`、`git blame -- <path>`、`git cat-file -p <oid>` | 0 卡直接执行；经固定 Git 传输（绝对可执行/固定 env）；审计 `branch:"c-allow"`、`by` 以 `ruleset:allow:readonly:git:<id>` 为前缀（其后可带既有档位后缀）、`readonlyGit.canonicalArgv` 与实际执行体一致；输出有界 |
| AC-7 | 非只读 shell：`touch x`、`npm test`、`node script.js`（judge 关闭） | 弹审批卡（命令原文/argv/cwd/entry）；客户 allow ⇒ 执行 + 审计 `a-allow`/升级链；deny ⇒ 不执行 + `a-deny` |
| AC-8 | 「替我审批」开启：judge 明确 allow | 执行 + 结果行 + 审计 `judge`（operator `judge:<engine>`）；judge deny ⇒ 拒绝 + 理由；manual/row-failed ⇒ 拒绝且不弹卡 |
| AC-9 | 判拒升级：judge deny 某 `run_shell` 精确命令后 `request_shell_escalation` | 卡面取自判拒原文；allow-once ⇒ 仅同 argv 一次；allow-session ⇒ 本会话同 argv；deny/超时 ⇒ 拒绝；后台入口不消费 |
| AC-10 | 角色专属 Git：product `git_query status`（无任务绑定）、product 在授权写集内 `git_candidate commit`（若初始化保护通过）、convener `git_publish documents` | 不受创建准入影响；按 ACL/策略返回 observed/prepared/published 或既有 blocked 码；journal/审计存在 |

### 5.2 负向

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-11 | 受保护 + 注册 shell + **无 binding**（直接传 `async()=>({allow:true})`，或门从别的项目装配） | plan unknown（`protected-scope-approval-chain-unproven`）；Pipeline 抛 `runtime-creation-admission-unproven:…`；**不构造适配器、不发模型请求、不执行命令** |
| AC-12 | 受保护 + binding 但审计探针失败（边界未接受且 refresh 后仍拒/非持久 sink/自定义 sink 无 probe） | `protected-scope-audit-unavailable`；不创建；若启用 Q4，运行期审批放行但审计写失败 ⇒ 不执行；若客户选择 Q4=observe，则按 AC-28 作为披露项验收，不视为安全通过 |
| AC-13 | 未审批写/后台/副作用：客户 deny、超时、通道不可用、关窗、Esc | 不执行；`run_shell`/`start_background_task` 返回拒绝回执；无进程/文件/后台任务残留；审计 `a-deny`/`a-timeout`/`a-unavailable` |
| AC-14 | 审批绕过尝试：伪造 token/参数、`start_background_task` 借前台授权、`request_shell_escalation` 早于判拒/重复申请/超限、`git commit` 借审批；**advisory/operatorOnly 模式下 `git commit`**（writeGuard 注入时） | 全部拒绝；无执行；审计/诊断可辨；**writeGuard 注入断言**：**接 (a) 的**装配路径必须携带 writeGuard（缺失即测试失败），不得把 classifier deny 当硬地板 |
| AC-15 | 伪造身份/回合：过期 Git 回合、非 convener `init`/`integrate`/`revert`/`delivery`、verifier 无 review 绑定、su/judge 调 Git | 对应既有码拒绝（`git-delivery-source-changed`/`git-*actor*`/`git-policy-role-action`/`role-not-allowed`） |
| AC-16 | Git 参数级攻击（§2.4.3 表全部样例）与路径攻击（`../`、绝对路径、`.git/config`、`:(glob)`、通配） | `deny`；不 spawn；无文件变化；审计可辨 |
| AC-17 | 审计缺失：受保护 + shell + 审计路径被门禁拒绝 | 创建期失败（AC-12）；不会出现「审批放行但无审计」的路径（Q4 开启时） |
| AC-18 | 受保护 + custom factory / demo / unknown scope | 保持拒绝（既有 reason） |
| AC-19 | PR #72 回归：含 shell 的真实/桩件会话 `inspectToolSurface().status` 仍为 `unknown`、`applicationMediation` 仍 `verified`（满足条件时）；派发父门用例原样通过 | 无行为变化 |
| AC-20 | 既有 shell 审计/升级/判断/白名单回归（除有意更新的 Git 用例） | 全绿；无新增确定性失败 |
| AC-21 | 后台任务：`start_background_task` 审批 allow 才启动；列表/读取只读；停止仅终止；会话 dispose 清理 | 与现状一致 |
| AC-22 | 只读 Git 在 `start_background_task` 入口 | 拒绝（不因只读白名单放行） |

### 5.3 真实运行（最小，见 §6.2）

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-23 | 受保护目标项目 + 真实 Claude + 单条客户消息派发 product | 父门受理 + 任务创建 + **目标 product 会话创建成功**（本次变更的直接目标）；任务投递成功（product 回合启动） |
| AC-24 | product 回合执行一条只读命令（如 `git status` 或 `ls`）与一条非只读命令（如 `touch` 或脚本） | 只读 0 卡执行；非只读出现审批卡；批准后执行、拒绝后不执行；`docs/audit/shell-gate.jsonl` 有对应记录 |
| AC-25 | 明确限制 | 只承诺证据所示；若审批卡需人工操作无法在预算内稳定复现，回退到确定性集成测试并如实说明，不宣称已真实验证 |

### 5.4 P1.1 新增（复核 F1/F3/F4/F10/F15）

| # | 场景 | 判定 |
| --- | --- | --- |
| AC-26 | **Q9 边界负向**：受保护 + shell（或任一 Claude/Pi/judge active Core 条目）+ `git_candidate commit`/`init` | 既有 `inspectInitializationProtection` 拒绝（`git-core-creation-proof-unavailable`/`git-native-surface-unproven`）；无 ref/journal/工作树副作用；错误如实回给角色 |
| AC-27 | **approval-chain 变化的模块级防御判据（R6）**：binding 模块级单元测试直接驱动（gate 替换在端到端会先被 `isCurrent` 拦为 `runtime-prepared-configuration-changed`，本判据几乎不可达） | `protected-scope-approval-chain-changed` 由模块级测试覆盖；端到端非必过；端到端按既有 `runtime-prepared-configuration-changed` 断言 |
| AC-28 | **Q4 未采纳（observe）**：审计写失败 + 审批 allow | 执行可能发生但**无审计记录**——验收判为**披露项/未通过安全目标**（须在闸门 1 记录客户选择），不得当作通过；Q4 采纳时按 AC-12 拒绝执行 |
| AC-29 | **F1 读取范围的可执行判据**：shell 只读 `git show <任意完整历史 oid>:<path>`/`git log <oid>` 可读；`git log --all` deny；`git_query` 对 verifier 的 review 绑定限制不变 | shell 路径按白名单允许并可读；`--all` deny；`git_query` 限制仍生效。**客户确认记录在 Q1/Q2，不在本 AC 判据内**；若 Q1 改选收紧，本 AC 随之改为 `git_query` 读取策略 |
| AC-30 | **writeGuard 注入断言（R5）**：**接 (a) 的**装配路径（项目链/审批档）都携带 writeGuard；advisory/operatorOnly 模式下 `git commit`/`git push` 被 writeGuard deny；只读档不接 (a)、`c=deny` 即终结（不要求 writeGuard 注入） | 接 (a) 路径注入缺失即测试失败；`git commit` 不因 (a) 被批准；classifier deny 不被当作硬地板 |

---

## 6. 测试策略与真实运行最小验证

### 6.1 确定性测试（实施阶段）

1. **纯函数/单元**
   - `shell-approval-binding`：登记/读取/身份隔离/冻结副本/未登记 undefined；**probe 只由 binding 内部执行（`probeShellApproval` 无值入参）、并发共享 promise、结果 memoize、不可由调用方回填**；sink `describe`/`probe` 的 file/memory/custom 三态；非持久测试 Symbol 仅测试 helper 可达。
   - `matchReadonlyGit`/`buildReadonlyGitBody`（门禁引擎）matcher：白名单全形态 + §2.4.3 攻击矩阵 + 边界（OID 长度、路径字面、行号上限、未知 flag、全局选项、`entry`、`log` 默认 HEAD、`--all` 拒绝）；**差分测试**：与 `gitQueryBody` 重叠模板逐条比对规范 argv（F5）。
   - `prepareRole`：真值表（scope × runtime × shell × binding × sink kind/durable/probe × provenance × roleCapabilityGuards）；mode 可接受集合（readonly/operator-approve/rules-advisory/three-layer）。
   - `ensureAdapter`/`verifyScope`/`bindPreparedRole`：admittedPlan 缺失/变化/scope revision 变化/approval-chain 变化。
   - 审计策略：probe ok/unavailable（含 refresh 一次重试）；`auditFailurePolicy` observe/deny-non-readonly 的 allow/deny/只读分支。
   - **writeGuard 注入断言（R5）**：**接 (a) 的**装配路径（项目链/审批档）必须带 writeGuard；只读档不接 (a)、`c=deny` 即终结；advisory/operatorOnly 下裸 Git 写 deny（F2）。
   - **alias 确定性测试**：内建只读子命令优先于 repo-local alias；固定 env 禁用 system/global config（F7）。
2. **集成（真实运行时核心 + 桩件适配器）**
   - Claude/Pi/Codex 三路径：prepare→bind→session ready；shell 工具注册/未注册；R14 原始函数拒绝。
   - 真实 `createShellGate` + memory sink：仅在测试 helper 私有 Symbol 下用于受保护正向；生产 file sink 正向/审计失败负向。
   - `run_shell`/`start_background_task` 端到端（桩 command）：审批 allow/deny/timeout；entry 区分；无 spawn 断言（计数/标记文件）。
   - 升级 registry：判拒记录→申请→卡→授权→精确 argv 消费；后台不消费。
   - 只读 Git 固定传输：命中 matcher 时走注入能力（不得回退 `runShell`/PATH）；能力缺席 ⇒ `readonly-git-runner-unavailable`；审计 `readonlyGit.canonicalArgv` 与实际执行一致。
3. **回归**
   - PR #72 全套（`test/编排/trunk-dispatch-parent.test.ts`、`application-mediation`、`trunk-runtime`）；
   - `test/编排/` shell-gate/escalation/audit/judge；`test/运行时核心/`；`test/门禁引擎/`（按 §4.5 更新 Git 用例）；`test/桌面应用/operator-channel`；
   - **基线红/绿**：先记录变更前基线；`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914` 为既有红、本变更转绿；区分「既有红」与「本变更新增红」；
   - `npm run typecheck`、renderer/build（若涉及 UI 字段）。
4. **并发/漂移**
   - prepare→bind 之间写入 `init-source`（scope revision 变化）⇒ `runtime-protection-scope-changed`；
   - 工具/handler 替换 ⇒ `runtime-prepared-configuration-changed`；
   - gate 绑定被替换/移除 ⇒ 端到端由 `isCurrent` 拦为 `runtime-prepared-configuration-changed`；`protected-scope-approval-chain-changed` 由 binding 模块级测试直接驱动（R6）。

### 6.2 真实运行最小验证（真实 Claude；预算；只承诺证据）

- 目的：证明**本次变更的直接目标**——受保护项目中目标角色会话可以创建并接收派发；并至少真实触发一次审批路径。
- 环境与纪律（沿用 P1-RR §4 / 变更包 §10.4/§11）：
  - 仓库外临时根 + 临时 `userData`（启动器在 import `app/main.ts` 前 `app.setPath("userData", …)`）；目标项目为最小内容并在运行前制造 `required` 保护事实（可由父门派发写入 init-source，或预置合法 init-source——验收时必须如实记录是哪种）；
  - 真实 UI 导入 + 单条客户消息；只用仓库根 `.env` 既有凭据（不打印/不复制）；
  - **审计门禁预检（F4）**：在开目标会话前，用与创建准入相同的 file sink probe（含一次 F-6-1 refresh）验证目标项目 `docs/audit/shell-gate.jsonl` 可写、治理边界已接受；不通过则记录为环境事实并停止（或先完成验收/re-pin），不把环境失败当作方案失败，也不跳过预检硬跑。
  - 不修改仓库、不提交、不写既有项目；不改 `app/main.ts`；
  - 观察并保留：诊断 `session.open.*`、`tasks.jsonl`、目标项目 `docs/audit/shell-gate.jsonl`、UI 截图/文本。
- 步骤：
  1. 导入目标项目、开 chief 会话，发送 1 条消息派发 product（按 `docs/intents/*.md` 写产品意图）；
  2. 验证：父门受理、任务创建、**product 会话创建成功**（无 `runtime-creation-admission-unproven`）、任务投递、product 回合开始；
  3. 在 product 回合内触发一次只读 `git status`（或 `ls`）与一次非只读命令（如 `touch`/短脚本）；UI 审批卡出现 → 批准一次（脚本类卡另计）；确认执行/审计；
  4. 观察窗口结束即停（`#btn-halt` + `stopSession` + CDP close），如实记录终止方式。
- 预算：
  - 客户消息 1 条；chief 回合 1 个；product 回合 1–2 个；`dispatch_task` ≤1 次应用处理器调用；审批卡 ≤2 张（只读 0 张）；
  - 墙钟上限 10 分钟；不自动重试；出现首个决定性失败或成功证据即停止；
  - 若审批卡无法在 UI 自动化下稳定出现（例如产品回合未按预期调用命令），停止并把该子项留给确定性测试，如实报告，不追加预算、不伪造。
- **只承诺**：在本次候选/环境/输入下的观测事实（会话创建成功、派发投递、只读/审批至少一条证据）。**不承诺**：六角色完整闭环、Git 写/发布成功、判断 agent 结论正确性、长期稳定性。

### 6.3 明确不宣称

- 不宣称「受保护项目的所有命令面已被证明安全」——本方案证明的是控制面可用 + 逐操作审批/审计，不是效果闭包。
- 不宣称 `plan.status:"observed"` 等于 native observed；不宣称审计/审批失败时仍安全。
- 不宣称 Claude/Pi（以及受保护项目中任何 arm 了 shell 的会话，或任一 Claude/Pi/judge/pm active Core 条目）的 Git 写/初始化可成功（§2.4.4/F3 披露）。

---

## 7. 闸门 1 问题清单（Q1–Q16）与选装项（O1–O12）

### 7.1 待客户/复核确认（Q）

| # | 问题 | 推荐 | 备选/影响 |
| --- | --- | --- | --- |
| Q1 | **Git 只读放行的解释与读取范围（F1）**：是否确认「只读 git 子命令可在 shell 中直接放行」，并接受为此收窄门禁引擎硬地板（删除「所有裸 Git 硬拒」，改为精确只读白名单；同步改分类器与写守卫 + 相关测试）？同时确认**读取范围权衡**：shell 只读 Git **不套用** `git_query` 的 `readableOids`/publication-proof 绑定，可读任意完整 OID/历史（`log` 无目标默认 HEAD，`--all` 拒绝）；verifier 等结构化读取限制只约束 `git_query`。另确认**白名单适用范围**：这是全局门禁引擎收窄（所有项目可用），不是仅受保护项目。 | **是**（客户补充规格原文；取舍见 §0.3/§2.4.3；白名单见 §2.4.3） | 若否，则仅保留结构化 `git_query` 只读模板（其本身已「不走审批」），shell 裸 Git 继续全拒；客户「git 命令只读放行」需按「结构化能力」解释；若只希望受保护项目放行，需另设作用域开关（成本更高） |
| Q2 | **只读 Git 子命令/参数白名单（F1/F14）**：§2.4.3 的 10 个子命令与每子命令允许参数（含 `blame`/`cat-file` 的有界形态）是否批准？`git log` 无目标默认 HEAD（不默认 `--all`）、`--all` 拒绝是否接受？日常 `git --version`/`git --help` 被拒是否接受（或只开 `git --version` 精确例外）？是否要求把 `describe`/`name-rev`/`shortlog`/`whatchanged`/`show-ref`/`for-each-ref`/`rev-list`/`grep`/`var`/`count-objects` 也纳入？ | 批准 10 个核心；`log` 默认 HEAD、`--all` 拒绝；`git --version` 暂不开（Q16）；其余暂不纳入（O6） | 扩大白名单会扩大审查面；每加一个都要补攻击矩阵；读取范围权衡见 Q1 |
| Q3 | **只读 Git 的执行路由**：是否确认经固定本地 Git 传输（绝对可执行 + 固定 config/env + 规范 argv 体）执行，而不是通用 `runShell`/PATH 查找？ | **是**（防 PATH/项目内同名程序劫持） | 若要求「显示命令=执行命令」逐字一致，则需改为要求模型键入完整安全前缀（UX 差、易错），或接受审计记录规范 argv 的映射 |
| Q4 | **审计失败策略**：受保护项目是否启用「审批类放行但审计写失败 ⇒ 拒绝执行」？ | **是**（`deny-non-readonly`；只读 `c-allow` 不翻转） | 保持现状（审计失败只 stderr）会留下「批准但无审计」窗口；客户可改选 |
| Q5 | **受保护范围 + shell 工具的准入证据（F4/F8）**：是否确认「无审批链绑定，或审计不是持久 file sink / 探针（同 refresh 语义）失败，即拒绝创建会话」？ | **是**（fail-closed；防伪造/误配 gate；审计是审批替代的控制面） | 更宽做法（只要 shellGate 是函数 / 内存 sink 也算）不可接受（测试即可伪造 allow；审计不可证明） |
| Q6 | **`start_background_task`**：受保护项目是否保留（经同一审批）？ | **是**（客户方向：非只读走审批） | 若要求更严，可整体禁用后台任务（另加 reason），但会削弱开发场景 |
| Q7 | **「替我审批」在受保护项目的代批权**：是否维持现状（judge 可代批 allow/deny；manual/row-failed 按拒绝）？ | **是**（客户意图明确提到「替我审批」代批） | 更严选项：受保护项目强制客户手批（judge 仅建议），需另改开关语义 |
| Q8 | **WebSearch / native builtin**：受保护项目是否在创建期对「native builtin 工具非空」（如 `ANS_CLAUDE_WEB_SEARCH=1`）fail-closed？ | 暂不新增创建期检查（PR #72 派发父门已对应用中介路径 fail-closed；WebSearch 默认关闭） | 若要求创建期即拒，需新增 reason 并覆盖 Claude 配置（O5） |
| Q9 | **Git 写/发布在受保护项目的既有门（F3 注册表级）**：`inspectInitializationProtection` 要求 strict `toolSurface.status:"observed"`+native plan，且对进程内**所有 active Core 条目**逐一要求；arm 了 shell 的会话（含 Codex，桌面默认）在该 strict 路径为 `unknown`，Claude/Pi 结构性无 native；**本方案放开的 Claude/Pi/judge/pm 会话本身就会使该门不可满足**。是否接受「本变更只解除会话创建准入；Git 写/发布仍按既有门（P1.6 Q5 另案），受保护项目中的 Git 写很可能仍被拒」？ | **接受**（PR #72 INV-2：写/发布门不消费应用中介证据；客户补充也说「仍走既有 Git ACL/发布/审计检查」） | 若客户要求受保护项目可执行 Git 写/发布，需要另立「仓库初始化保护的应用中介证据」变更（与 **P1.6 Q5** 独立；本方案 Q5 是审批证据问题，不指同一件事） |
| Q10 | **回切开关**：是否需要为本变更提供运行时回切（如 `ANS_SESSION_ADMISSION_APPROVAL_BASED=0` 恢复旧准入）？ | 不新增（旧准入对 Claude/Pi 结构性不可用；回切=回滚提交）；保留既有 `ANS_SHELL_ESCALATION_DISABLED` | 新增开关可以更快止血，但会引入第二套准入语义与测试矩阵 |
| Q11 | **错误码兼容**：确认退役 `required-scope-unconfined-script-tools` / `runtime-protected-scope-unmediated-app-execution-planned`，新码如 §4.3；日志/UI 只做字符串展示、无外部程序依赖精确码？ | **是**（仅测试/日志/证据引用；本次只读检索未发现其它消费者） | 若有外部依赖，保留旧码作为兼容 reason（会误导，不推荐） |
| Q12 | **审计记录加法（F10 定稿）**：是否批准 `ShellAuditRecord` 增加**必做** `readonlyGit:{id,canonicalArgv}`（只读 Git 审计）与可选 `roleId`，`OperatorPrompt` 增加 `entry`/`protectedScope`？`branch` 保持 `c-allow`，ruleId 记在 `by`。 | **是**（审计可核对、卡面可理解；除 readonlyGit 外均可选、向后兼容） | 不加 readonlyGit 则无法验证「模型命令→执行体」映射；不加 roleId 则审计只能靠 toolCallId 关联 |
| Q13 | **角色卡文本**：是否保持「Git 只走结构化能力、不得用裸 Git」不变（只读 shell Git 仅作为权限，不作为指令）？ | **是**（不改角色卡/边界，避免客户主权变化） | 若要求在角色卡里写明只读 Git 可用，需另走角色卡维护变更 |
| Q14 | **真实运行预算**：是否批准 §6.2 的最小真实 Claude 运行（1 条消息、1 个 chief 回合、1–2 个 product 回合、≤2 张卡、≤10 分钟、失败即停）？ | **是** | 若预算更紧，可只验证「会话创建 + 投递」而不触发审批卡（审批路径留给确定性测试） |
| Q15 | **只读 Git 白名单的适用范围（F14a）**：全局门禁引擎收窄（所有项目可用）是否接受？还是只对受保护项目放开（需要把保护状态注入分类器，复杂度和漂移风险更高）？ | **全局**（与现有规则集一致、单一语义；只读命令对非受保护项目也无危害） | 仅受保护项目需要额外作用域判定与测试矩阵 |
| Q16 | **`git --version` 等日常只读形态（F14b）**：当前全局选项一律拒绝（含 `git --version`/`--help`）。是否接受？或只开精确 `["git","--version"]` 例外？ | 暂不接受（避免打开全局选项面；`git --version` 非任务必需） | 精确例外成本低但需单独白名单与测试 |

### 7.2 选装项（O；含理由/收益/成本）

| # | 选装 | 理由/收益 | 成本 |
| --- | --- | --- | --- |
| O1 | 准入事实显式化：`RuntimeCreationPlanFacts` 增加 `admission:{source:"creation-admission-v2",...}`，或将 `status` 改名/扩展语义 | 避免「observed」被误读为效果闭包；利于审计 | 契约加法/改名影响消费者与测试；建议后续版本 |
| O2 | 创建期「封闭工具目录」检查：`initialAppTools ⊆ 平台已知工具目录`（目录单一来源移到 `model/runtime.ts`，`trunk-runtime.ts` 的 closedTools 复用同一常量） | 防未来新增未治理副作用工具静默进入受保护会话 | 跨模块重构；触碰 Git 初始化保护门的常量（须行为等价证明） |
| O3 | 结构化 `git_query` 增加 `blame`/`cat-file` 模板 | 让只读 Git 走与 `git_query` 完全相同的策略/预算/审计，而非新增 shell 面 | 改 Service/model/trunk + policy + 测试；白名单双路径需说明 |
| O4 | **已并入必做（不再选装）**：只读 Git 审计 `readonlyGit:{id,canonicalArgv}` | 使「模型命令→实际执行体」映射可审计（F10） | 契约加法 + 测试；见 §2.4.3/Q12 |
| O5 | 创建期 native builtin/WebSearch fail-closed | 受保护项目更严 | 需跨适配器事实；可能阻塞启用 WebSearch 的客户 |
| O6 | 只读 Git 子命令扩展（describe/name-rev/shortlog/…） | 覆盖更多只读场景 | 每个子命令都要参数白名单+攻击矩阵 |
| O7 | 审批卡显示「受保护项目」标识与审计提示 | 提升客户知情 | 渲染/i18n 改动 |
| O8 | 新 reason 的桌面人话映射 | 派发失败回执更可读 | i18n/映射维护 |
| O9 | 会话级「审批链降级」事实（`inspectToolSurface` 加法字段） | 诊断/验收可直接观察 | 触碰 PR #72 相邻形状（须保持 strict 语义不变），不推荐本变更做 |
| O10 | 审批预算/频率上限（每会话卡数、同命令重复卡抑制） | 降低审批疲劳 | 产品语义新增，需客户确认 |
| O11 | 只读 Git 输出/时长预算显式化（如 64 KiB / 10s） | 防大输出/慢命令 | 与既有 `git_query` 预算对齐即可；小成本 |
| O12 | 角色卡/功能说明补充「准入按操作审批」口径 | 文档一致性 | 超出策划写集；另走角色卡维护变更 |

---

## 8. 复核处置（P1.3，对应复核记录 `2026-11-08_review_session-admission-approval-based.md`）

> 完整复核 105 行 / `13f33ee11bc77a4fc8af01ddec709de727aaf269fdc836ac9179b1072776e3d5`（F1–F15），窄复核记录现 150 行 / `e76e8ce11321de6a2f0521d8413142c4b287b1666689dc95763067e7403d5bae`（F1–F7/F9/F11–F15 关闭，F8/F10 主体定稿，剩余 R1–R7）。**P1.2 只窄修 R1–R7，不改 F1–F15 已关闭的结论与设计方向**；F 表保留 P1.1 处置记录。

### 8.1 F1–F15

| 编号 | 处置 | 落点 |
| --- | --- | --- |
| F1（must-fix） | **按客户原话保留只读 Git 放行 + 如实披露**：`git log` 无目标默认 **HEAD**（不默认 `--all`；`--all` 拒绝）；§0.3/§2.4.3/Q1/Q2 明确「shell 只读 Git 不套用 `git_query` 的 `readableOids`/publication-proof；verifier 等结构化读取限制仅约束 `git_query`；可读任意完整 OID/历史」；补 `--all` 负例与 AC-29。 | §0.3、§2.4.3、Q1/Q2、AC-29 |
| F2（must-fix） | 更正硬地板归因：classifier raw-git deny 在 advisory/operatorOnly+approveDeny 下会交 (a)，**真正硬地板是 writeGuard 程序名 deny**（先于分类）；本变更写清「**接 (a) 的**生产装配路径必须注入 writeGuard」（只读档不接 (a)、`c=deny` 即终结，R5），补 advisory 模式 `git commit` 负例与注入断言（AC-14/AC-30）。 | §2.4.2、§2.4.4、N6、AC-14/AC-30 |
| F3 | §0.3 增加客户可见限制：受保护项目 Git 写/初始化很可能仍被既有门拒绝；Q9 补充**注册表级**效应（对进程内所有 active Core 条目逐一要求 strict observed+native；本方案放开的 Claude/Pi/judge/pm 会话本身使该门不可满足）；补 AC-26。 | §0.3、Q9、§2.4.4、AC-26 |
| F4 | 审计探针与 F-6-1 refresh 打通：`probe` 与 append 同语义（初始 gate；被拒且注入 refresh ⇒ await refresh 重试一次；仍是纯判定）；装配层 async 回填同一 gate；§6.2 增加「审计门禁预检」前置并记录环境事实；AC-23 可达性说明。 | §2.3.1/§2.3.2、§6.2、AC-12 |
| F5 | 规范 argv 单一来源：matcher/规范体纯函数放门禁引擎并经 `service/gate/shell-rules.ts` 再导出；与 `gitQueryBody` 重叠模板做**差分测试**，分叉逐条记录；明确新增**固定传输只读公共入口**（`gitCommandArgv`/`executeGit` 未导出；`createGitQueryPort` 不能表达 blame/`--oneline`/cat-file 变体）。 | §2.4.3、§4.1、§6.1 |
| F6 | 补全测试同步：`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914`（既有红、本变更转绿）；`test/编排/shell-risky-order.test.ts:39` 版本/id 同步；`test/测试/lightweight-permission-repairs.test.ts:182`；区分「既有红」与「本变更新增红」。 | §4.5、§6.1 |
| F7 | alias 实验降级为「设计期本地观察，无独立证据哈希，不作为验收证据」；改为**必须的确定性测试**（内建子命令优先于 repo-local alias + 固定 env 禁用 system/global config）。 | §2.4.3、§6.1 |
| F8 | binding 事实增加 sink `describe`（kind/durable/relPath）与内部 `probeShellApproval`（**无值入参**，binding 私有执行 sink.probe 并 memoize，R1）；`createShellGate` 持有 sink 引用（R2）；受保护准入要求 **file+durable+probe ok**，非持久 sink 仅测试私有 Symbol（R3）；定义可接受 mode；`projectRoot` 契约注释改为准入绑定字段。 | §2.3.1–§2.3.3、§4.1、§4.4、AC-12 |
| F9 | 头部关系陈述改为「本变更是 P1-RR §6.4 下游创建门的客户方向修正；P1.6 Q5 写门另案仍未解决」；与 §2.8/Q9/附录 B 一致。 | 头部、§2.8、附录 B |
| F10 | 不改 `branch` 语义：只读 Git 审计 `branch:"c-allow"`、`by` **前缀** `ruleset:allow:readonly:git:<id>`（允许既有档位后缀，R4）；**必做**新增 `ShellAuditRecord.readonlyGit:{id,canonicalArgv}`（O4 并入必做）；AC-6 按此断言。 | §2.4.3、§4.2、§4.3、AC-6、O4 |
| F11 | K4 更正：`applicationMediation` 仅派发父门/controller resume 消费；strict `toolSurface` 另被 `inspectInitializationProtection` 消费；本方案不改其语义。 | §2.2.1 K4 |
| F12 | 更正注册事实：`su`/`single` 工具可能注册但 handler 拒绝；`judge` 不注册；项目角色回退路径补 `liaison` 排除。 | §2.4.4 |
| F13 | matcher 放置定稿：门禁引擎私有/导出纯函数 + `src/service/gate/shell-rules.ts` 公共再导出（沿用 `matchRoutineShellCommand` 先例）；删除新 shared 件的提议。 | §2.4.3、§4.1 |
| F14 | Q 覆盖：Q1 补读取范围与白名单适用范围；Q2 补 `log` 默认/`--all`/`git --version`；新增 Q15（全局 vs 仅受保护）、Q16（`git --version` 例外）。 | §7.1 |
| F15 | B1 新增：AC-26（Q9 边界负向）、AC-27（approval-chain-changed；R6 定为**模块级防御判据**，端到端非必过）、AC-28（Q4=observe 的披露口径）；AC-12 条件化；AC-29/AC-30（F1/F2）。 | §5.2/§5.4 |

### 8.2 A1–A13（复核记录「关键事实」逐条复核）

| 条目 | 处置 |
| --- | --- |
| A1–A6（装配、注入、桌面接线） | 复核记录逐条确认属实；本版**无事实修改**（行号/语义保持）。 |
| A7（判定链） | 属实；本版按 F2 修正「硬地板」归因文字（§2.4.2/§2.4.4），不改判定链描述。 |
| A8（(b) pm 审读） | 属实；无改动（生产 advisory 缺省 true 时仍不执行）。 |
| A9（(a) 操作者确认） | 属实；无改动。 |
| A10（「替我审批」代批） | 属实；无改动。 |
| A11（判拒升级） | 属实；无改动。 |
| A12（审计） | 属实；本版按 F10 明确 `branch`/`by` 语义并新增 `readonlyGit` 必做字段；`entry` 已存在不变。 |
| A13（后台任务） | 属实；无改动。 |

### 8.3 未采纳/保留意见

- 本版未拒绝任何 F1–F15；F1 按客户补充规格保留「放行 + 披露」，但**读取范围（任意 OID/历史）仍是 Q1/Q2 的待确认项**，本版不声称已获客户授权；若客户不确认，备选是收紧到与 `git_query` 读取策略一致。
- F2 的备选「在 classifier 层引入 advisory 也不消费的 deny 类别」本版未采用；采用「**接 (a) 的**装配路径必注入 writeGuard + 断言」的更小改动路径（R5 限定）；如复核/实施认为需更强结构保证，可在实施契约评审再议（不改变本版默认）。
- F4 的「维持探针排除 refresh」未采用；本版让探针与运行期 append 同语义（含一次 refresh 重试）。

### 8.4 R1–R7（窄复核剩余项）处置

| 编号 | 处置 | 落点 |
| --- | --- | --- |
| R1（一般） | **`probeShellApproval(gate)` 不接受任何入参值**；binding 在 `registerShellApproval(gate, facts, sink)` 时私有保存 sink 引用，探针由 binding 内部 `await sink.probe()` 执行、并发共享、结果冻结 memoize；**不存在接受 probe 值的 finalize API**。 | §2.3.1/§2.3.2、§4.1、§6.1 |
| R2（一般） | 定稿接线：`createShellGate` 本来就接收 `opts.audit`，登记时把 sink 引用交给 binding；**不需要** `buildShellGate` 返回 `{gate,audit}`、也**不需要** `onAuditSinkCreated` 捕获。`buildShellGate` 只传 `projectRoot`；`assemble*` 不参与 probe 值传递。§4.4 改为「受保护正向用例可经 `buildShellGate`（惰性 probe）/`assemble*`；直接 `createShellGate` 需 projectRoot+sink.probe」。 | §2.3.2、§4.4、§6.1 |
| R3（一般） | 非持久 sink 的测试通道改为**测试 helper 私有 Symbol**（不出现在生产类型面/公共出口）；`createShellGate` 仅在该 Symbol 非枚举存在时接受；生产装配测试断言 Symbol 从不设置。**不**暴露普通布尔选项。 | §2.3.1、§4.1、§4.4、§6.1 |
| R4（一般） | `by` 断言改为**前缀** `ruleset:allow:readonly:git:<id>`（允许 `byTagged` 追加既有档位后缀：「（su 审批档）」「（advisory 规则）」「（su 只读档）」）；ruleId 语义不变；§0.3/§2.4.3/§4.2/§4.3/AC-6 同步。 | §0.3、§2.4.3、§4.2、§4.3、AC-6 |
| R5（建议） | writeGuard 不变量限定为「**接 (a) 的**装配路径（项目链/审批档）必须注入」；只读档不接 (a)、`c=deny` 在 `:903-910` 终结，不依赖 writeGuard；AC-30/AC-14/§6.1 同步。 | §2.4.2、§2.4.4、N6、AC-14/AC-30 |
| R6（建议） | AC-27 改为**模块级防御判据**（binding 单元测试直接驱动），端到端非必过；端到端 gate 替换按既有 `isCurrent` → `runtime-prepared-configuration-changed` 断言。 | AC-27、§6.1 |
| R7（建议） | (a) §8.3 明确 F1 读取范围仍待 Q1/Q2 确认；(b) §4.1 `readonlyGit` 改为必做；(c) §4.6 R4 改为「refresh 后仍拒」；(d) Q9 的 Q5 指代改为「P1.6 Q5（本方案 Q5 是审批证据问题）」；(e) §6.1 命名改为 `matchReadonlyGit`/`buildReadonlyGitBody`；(f) AC-29 只保留可执行判据，客户确认移出到 Q1/Q2 注记。 | §8.3、§4.1、§4.6、Q9、§6.1、AC-29 |

### 8.5 P1.3 文本勘误（4 处，语义等价）

| # | 勘误 | 修正 |
| --- | --- | --- |
| E1 | `shell-write-guard.ts` 实际位于 `src/common/门禁引擎/`，P1.2 §4.1 与附录 A 误写为 `src/common/编排/` | 全部改为 `src/common/门禁引擎/shell-write-guard.ts`；§4.1 owner 改为「门禁引擎」 |
| E2 | `src/provider/trunk/` 实际 owner = **编排**（编排私有目录），P1.2 写「运行时 Provider（trunk）」 | §4.1 owner 改为「编排（`src/provider/trunk/` 为编排私有目录）」 |
| E3 | `shell-approval-binding.ts` 所在共享目录实际 owner = **shared-code**（PR #72 B-9 已移交），P1.2 写「共享（pm/shared）」 | §4.1 owner 改为「shared-code（PR #72 B-9 已移交）」 |
| E4 | `ShellAuditRecord` 定义在 `src/common/编排/shell-audit.ts`（`:103-125`），不在 `src/model/runtime.ts` | §4.1 model 行移除 `ShellAuditRecord` 字段、加注「不在本文件」；shell-audit 行明确「类型定义在本文件」 |

- **R8a–R8c**（签名统一、Symbol 挂 sink、未登记返回语义）已列入团队计划 I0 接口评审议程；本方案不在正文再改，除非 I0 结论与本方案接口描述冲突（届时按接口评审更新方案并重开受影响部分核对）。

---

## 附录 A：关键事实索引（本检出只读核对）

- 创建准入：`src/service/runtime/session.ts:230-240, 242, 538-562, 570-585, 602-630, 824-896, 1132-1219`；`src/pipeline/orchestration/run-role.ts:726-747, 2109-2116`。
- 保护范围：`src/provider/trunk/impl/git-command.ts:525-569`。
- shell 审批链：`src/common/编排/shell-gate.ts:503-536, 595-933, 943-1114, 1116-1218, 1297-1342`；`src/common/编排/shell-escalation.ts:202-235, 308-381, 389-525, 528-588`；`src/common/编排/shell-command-guard.ts:1-40`；`src/common/门禁引擎/shell-write-guard.ts:503-517, 549-562`；`src/common/编排/shell-audit.ts:103-125, 149-222`；`src/common/编排/shell-post-audit.ts:1-20, 331-334`。
- 装配/注入：`src/pipeline/orchestration/shell-arming.ts:150-218, 263-305, 356-407`；`run-role.ts:1801-1852, 2093-2099, 3534-3539`；`app/desktop/session.ts:3941-3992, 4029-4037`；`app/main.ts:790-807, 876`。
- 审批卡/代批：`app/desktop/operator-channel.ts:429-702, 870-926, 968-1044`；`src/common/编排/shell-judge.ts:376-700`；`src/common/runtime-core/shell-judge/tools.ts:110-162`；`src/common/runtime-core/governance-judge/tools.ts:67-112`；`src/common/编排/operator-channel.ts:67-119`。
- shell 工具注册/执行：`src/provider/runtime/tools.ts:1318-1326, 1355-1361, 1514-1600, 1676-1760, 5068-5098`；`src/provider/runtime/schema.ts:122-165`。
- Git 门禁引擎：`src/common/门禁引擎/classify-shell.ts:178-203, 1025-1100, 1335-1345, 1489-1492, 1618-1660, 1712-1772`；`src/common/门禁引擎/shell-write-guard.ts:549-562`。
- Git 结构化能力：`src/provider/runtime/tools.ts:4327-4390`；`src/provider/runtime/schema.ts:80-108`；`src/pipeline/orchestration/trunk-runtime.ts:59-152, 156-280`；`src/provider/trunk/impl/git-command.ts:13-19, 368-375, 420, 491-514`；`src/provider/trunk/public/trunk-store.ts:45`；`src/model/trunk.ts:476-478`。
- 契约：`src/model/runtime.ts:310-350, 568-586, 620-634, 3334-3346`。
- 角色能力位：`src/common/门禁引擎/governance-roles.ts:286-306`。
- 既有测试断言（需同步）：`test/runtime-core/git-capability-tools.test.ts:577-601`；`test/门禁引擎/classify-shell.test.ts:39-41, 96-102, 452-460, 649, 662-663`；`test/门禁引擎/shell-write-guard.test.ts:111-113, 235-259`；`test/门禁引擎/git-shell-acl.test.ts:843-852`；`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914`（既有红、本变更转绿）；`test/编排/shell-risky-order.test.ts:39`、`test/测试/lightweight-permission-repairs.test.ts:182`（版本/白名单同步）。

---

## 附录 B：与上一变更（PR #72 / P1.6）的关系与冲突检查

- 本方案**不修改** PR #72 已合并的派发父门判定、`RuntimeSessionToolSurfaceFacts`、`composeRuntimeApplicationMediation`、`inspectToolSurface` 的 strict 事实与 reason 集合、controller resume 路径（P1.6 INV-1/INV-5/INV-6 原样）。
- 本方案只修改「目标角色会话创建准入」——P1-RR 证据 §6.4 明确指出的下游门；该门不属于 P1 修复范围（证据原文：「该门不是本次 P1 修复的父门…由统筹/策划决定」）。如实补充：`bindPreparedRuntimeRole`（`run-role.ts:727-747`）随同一批次代码合入（commit `e71501c`，随 PR #72 进 main），但它是**派发父门之后的目标会话创建门**，不是派发父门本身；本方案对该函数的修改只影响创建准入，不改变 `validParent`/controller resume/应用中介证据的契约与判定。
- 相邻但独立的既有门（本方案不放宽）：
  1. `inspectInitializationProtection`（Git 初始化/写/交付）——P1.6 INV-2、Q5；本方案 §2.4.4/Q9 显式披露。
  2. stable-write/版本化文档/交付门——不变。
- 未发现需要修改 PR #72 契约的冲突；若独立复核发现冲突，按意图记录要求列为闸门 1 问题（本方案 Q9 已预留）。
