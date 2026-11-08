# 删除全部预知式门控 + Git 写/仓库初始化改为「动作时授权」：实施前验收标准 B1 v1

- 日期：2026-11-08；固定身份：ANS 独立验收唯一主上下文（本文件只做实施前验收标准，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 风险档位：**T3**（P1.3 §4.3；删除/替换受保护项目 Git 写门进程级闭包、改变 Git 写/初始化与 run-stop/controller-stop 授权/终止语义、跨运行时核心/编排/trunk Service/Provider/桌面/Codex 适配器；不压档）。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对同一最终候选与本版本判定。
- 依据（写盘前实测）：
  - 方案 **P1.3**：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`，**803 行 / SHA-256 `94f71fcbb0d4287fe7ed38c2b7b396d77a9bcdb6f8ff5984146c7495f82a1566`**。
  - 复核记录：`docs/planning/2026-11-08_review_git-write-init-approval-based.md`，**178 行 / SHA-256 `a2468ed0951b28b39405ea71e94b415a8a2b5bf3ecb5f829c87e4d11f3119828`**（P1.0 完整复核 F1–F12、P1.1 窄复核 R1–R10、P1.1→P1.2 短核对 S1–S5；P1.3 §8 逐项处置；S1 已按 §3.7/§8.3 移出证据白名单、默认阻断，S2–S5 已同步）。
  - 客户指令：`docs/communication/2026-11-08_intent_remove-predictive-gates.md`（33 行 / 3604 bytes / `603e7ef9b5f99259a7aa1bc04a8be7115bc0145a4889d1369dbc9cecb22f10a3`；客户原话「这个预知门控全部删掉」；「理解」节 1–5 类）。
  - 闸门 1/2 留痕：`docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`（40 行 / `c40e06e50b547d85e1fa418879828e7126b6fabcad263423e5c2c3c6030fc900`）。
  - 团队计划：`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / 66827 bytes / `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808`）。
  - 在飞变更（只读、本 B1 不修改）：B1 v1 `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`）；方案 P1.3（会话准入）855 行 / `2553b97a…`；团队计划 449 行 / `ce30fad6…`。
  - 参照基线：在飞变更 E3 T3 记录（完成后首选）或订正版 `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`（326 行 / `d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`；4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skip；测于 HEAD `a1b2f66`）。
  - 代码/证据基线：HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；工作树含在飞变更未提交改动与 T1 三文件（只读、不属本变更写集/候选）。
  - **版本勘误说明（2026-11-08 12:10 实测）**：当前磁盘设计为 **P1.4**（822 行 / 124066 bytes / SHA-256 `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc`），系 P1.3 的 §8.4 E-a–E-e **纯文本勘误（语义等价，不改方向/写集唯一性/Q 清单/T3）**；闸门 1 留痕仍指向 P1.3 `94f71fcb…`。本 B1 以任务下发与闸门 1 留痕的 P1.3 为确认基线，实质条目与 P1.4 相同；若沟通以 P1.4 重发闸门留痕，本 B1 按语义等价继续有效并在 B2 注明版本。团队计划当前实测仍为 503 行 / 66827 bytes / `911ff546…`（与任务下发一致）。
- **Q16 取代关系（生效后注明，不修改在飞 B1 文件）**：本变更实施/验收后，本 B1 取代在飞变更 B1 v1 的 **`P1.3-B1-AC-26`** 与 **B1-EV3** 中「`native-factory-plan-unavailable` 仅 codex」的表述（按标签引用，不按行号）；本 B1 新增条目用 `P1.2-AC-25`…`P1.2-AC-31`（含负向 `P1.2-AC-28`）。两端变更包/验收记录必须注明该取代；在生效前两份 B1 并存、不互相修改；若冲突，按「本变更实施/验收后以本 B1 为准」处理。

## 0. 范围与关系

### 0.1 本 B1 覆盖

P1.3 §5.1–§5.3 的 **AC-1–AC-24**（含真实运行 AC-22–AC-24）与 **`P1.2-AC-25`–`P1.2-AC-31`**（F2/F3/F5/F8/S5 定向）；§3.8 错误码、§3.4.3 sidecar 审计、§3.7 drain 谓词、§4.5 测试同步、§6.2 真实运行；以及任务要求的：动作时授权、sidecar write-ahead/失败拒绝/预算、host-continuation taskId 匹配、运行时中立 drain（`native:pi-sdk-idle-not-observed` 保持阻断）、运行时中立 in-flight/可读性闭包、Codex 可选证据、只读/结构化 Git 边界、Q9 取代、PR #72 回归。

### 0.2 与其他标准/变更的关系（不替代、不修改）

1. **不修改 I6 B1**（H01–H11）、**旧 A/J**、**T1**、**在飞变更 B1 v1**；仅按 Q16 在本变更生效后注明取代关系。
2. 不改变 PR #72/P1.6 的派发父门、应用中介证据、`inspectToolSurface` strict 事实/reason 集合、`composeRuntimeApplicationMediation`、controller resume；写/发布门继续**零引用** `applicationMediation`。
3. 保留在飞变更的 shell 审批/审计/只读 Git/角色 ACL 语义；本变更只删除其**预知式前置**（codex native 创建阻断、Git 写门注册表级要求、run-stop native 要求等）。
4. 本 B1 只对本变更最终候选有效；发布/tag、提交/推送/合并未授权（预授权不覆盖发布/tag）。

## 1. 基线与候选要求（B0 豁免/参照口径）

> 客户已指示跳过正式 B0 重登记（`docs/communication/2026-11-08_waiver_baseline_session-admission.md`，18 行 / `d7a699d2819213cad60645fa0ffbce126fc1d5da290078f4dbcb6f6ab6b8e2fd`；客户原话「这种直接去变更把，基线搞他干啥呢」）。团队计划拟沿用同一豁免。若沟通认定豁免仅覆盖在飞变更，则本变更按本节 B0 要求补登记。变更包/B2 必须披露采用的路径。

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **豁免路径**：豁免记录存在且覆盖本变更；回归参照 = 在飞变更 E3 T3（完成后首选）或订正版 `d0d67ff4…`（4,872/4,641/198/1/32）；对比按（文件+测试名[+类别]）逐条；**新增确定性失败 0、新 skip 0**；环境性差异/既有失败变化逐条说明。 | 豁免记录 hash；参照 T3 记录/证据；逐条对照 diff；候选与稳定性 | 未取证 |
| BASE-2 | **若豁免不覆盖本变更**：按 B0 记录（路径/行数/字节/hash）+ 逐文件自然 EXIT/CLOSE + 失败/skip 清单 + 挂起登记 + 不得 force-exit 冒充；候选/HEAD/依赖/夹具/构建有效期；B0 失效重记。 | B0 记录 + 证据目录/索引；全量日志/逐文件 TSV；失败/skip 清单；hash | 未取证 |
| BASE-3 | 实施启动门：在飞变更 E3 完成（推荐提交/合入）+ I0 接口评审冻结 + 沟通放行；启动前重核 HEAD/tree、T1 三文件、依赖/夹具/构建配置；任何变化按豁免口径记录并披露；**本变更与在飞变更重叠 5 文件（+潜在第 6 `public/trunk-store.ts`、R14 测试）串行，不并行编辑**；sidecar 写前锚点的条件写集 `git-trunk-store.ts`/`git-capabilities.ts` 按 I0 冻结（编排既有私有目录内，H1 delta=0；`public/trunk-store.ts` 仅 I0 要求公共出口时纳入）。 | 启动门核对记录；I0 冻结记录；重叠/条件写集与串行证据；T1/依赖核对 | 未取证 |
| BASE-4 | 候选身份：绝对检出、HEAD、分支、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合与算法、树/manifest（`src app test`）；冻结前后同一身份；T1 三文件不属候选；证据运行前后候选不变。 | 变更包 §候选；逐文件 hash/聚合/树/manifest；稳定性快照 | 未取证 |

## 2. AC-1–AC-24 逐项（P1.3 §5.1–§5.3）

> 当前全部 `未取证`；每个“拒绝”必须同时检查**未执行副作用**（工作树/索引/ref/journal/进程）与审计证据。
> **统一门语义（P1.3 §3.3/F1）**：`inspectGitActionAuthorization(input)` 只做**身份/根/注册表闭包**（H1–H14），不接收 `GitPolicyFacts`/lease、不做 `checkGitPolicy`；角色 ACL、`checkGitPolicy().inputDigest`、host mutation lease、两阶段 `registryRevision`/`inventoryRevision`/`rootsDigest` 复检在**调用点**执行；authorization（actor/controls/`policyInputDigests`/`leaseId`）由调用点组合并在效果前 write-ahead 写 sidecar。所有 Git 写/初始化/交付/文档/计划/激活发布动作均按此链判定；run-change/finalize 无 policy/sidecar。

### 2.1 正向结构化 Git（AC-1–AC-7）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-1 | 受保护项目 + Claude + product 会话 + 本任务写集内 `git_candidate commit`：`inspectGitActionAuthorization` 动作时授权通过；sidecar `authorization.jsonl` 出现一行（actor/task/turn/`leaseId`/`policyInputDigests.candidate`；policyDigest 来自调用点 `checkGitPolicy().inputDigest`）；gate 输出只含 actor/controls/optionalEvidence；ref/工作树按既有语义提交；无 native 要求。 | 真实/集成原始回执；sidecar 行/字段；`checkGitPolicy` inputDigest 来源；gate 输出形状；ref/journal；无 native 拒绝证据 | 未取证 |
| AC-2 | 受保护 + Pi + 角色 ACL 内 `git_candidate commit`：同 AC-1（不同运行时同一门）。 | Pi 路径原始回执；sidecar/gate；无 native 拒绝 | 未取证 |
| AC-3 | 受保护 + Claude/Pi convener + `git_candidate init`：既有 `init.json` + sidecar（`policyInputDigests:{init,candidate}`）；无 `git-core-creation-proof-unavailable`/`git-native-surface-unproven`。 | init 原始回执；init.json/sidecar；两键 digest 来源；旧码零命中 | 未取证 |
| AC-4 | 受保护 + Claude convener + `git_publish delivery`（真实任务/回合）：既有 actor/expected-old/candidate 校验 + sidecar（`{publication}`）；发布成功。 | 发布回执/ref journal；sidecar publication digest；actor/turn 证据 | 未取证 |
| AC-5 | 受保护 + Codex：native facts observed 且有 adapter/绑定；以及 native 不可用（responses wire/MCP/WebSearch/custom transport）两种：observed → plan 记录 native 强证明；不可用 → plan **省略** native，不阻断创建/动作；**chat+shell 的 strict `toolSurface` unknown 与 native plan observed 不得混淆**。 | Codex 两路径原始证据；plan native/省略；ensureAdapter 回落；strict surface 与 native plan 对照 | 未取证 |
| AC-6 | 受保护 + `git_candidate commit` 时进程内存在多个 Claude/Pi/judge active 会话：不再因其它会话 strict unknown/processCoverage unknown 拒绝；只按 actor 判定。 | 多会话注册表快照；动作回执；无其它会话拒绝证据 | 未取证 |
| AC-7 | 可选证据缺失/unknown：动作结果与 native 是否存在无关；sidecar `optionalEvidence=unknown`。 | 三态输入（缺失/unknown/observed）对照；结果不变；sidecar 记录 | 未取证 |

### 2.2 run-stop / 只读回归 / 负向（AC-8–AC-21）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-8 | run-stop/controller-stop：Claude/Pi 运行成员；deferred run-stop 宿主继续 finalize：以 drain 谓词终止并可提交；deferred 路径在 rapporteur disposed/空闲后以 `host-continuation` 成功；taskId 由 inventory 记录与 `held.plan.requesterTaskId` 双绑定；native absent 不阻断、present-but-changed 拒绝；终止事实写 run transition journal，不写 sidecar。 | 停止/终止原始轨迹；drain facts；host-continuation taskId 匹配；native absent/drift 正负例；journal 记录 | 未取证 |
| AC-9 | 只读 `git_query`/只读 shell Git/非只读 shell 审批：与在飞变更 AC-5/6/7 一致，不因本方案回退。 | 在飞变更对应正/负例复跑；审计；无回退证据 | 未取证 |
| AC-10 | 伪造 actor：无真实 Core 会话/无 active Git tool/角色不符/项目不符 → 既有 `git-*-actor-unproven`/`git-actor-core-binding-unproven`；无 ref/journal/工作树副作用。 | 负例原始输出/错误码；副作用快照；审计 | 未取证 |
| AC-11 | 任务/回合过期或不属于该 actor；source parent 非真实 chief 回合 → `git-*-root-source-unproven`/`git-source-process-history-unproven`；无副作用。 | 负例原始输出；来源/turn 证据；无副作用 | 未取证 |
| AC-12 | 角色 ACL 越权：su/judge、非 convener init/integrate/revert/delivery、publish-documents 非四角色 → 工具层/`git-policy-role-action`；无副作用。 | 负例原始输出；ACL 源码锚点；无执行证据 | 未取证 |
| AC-13 | 策略越权：写区外、OID/ref 不符、stale authorization、diff 不完整 → `git-policy-*`；无副作用。 | 负例原始输出/错误码；策略源码锚点；无执行证据 | 未取证 |
| AC-14 | 根身份变化/其他 worktree 共享布局 → `git-root-discovery-unproven`/policy；不写。 | 负例原始输出；根/facts 快照；无写证据 | 未取证 |
| AC-15 | 并发 Git mutation lease 已持有/跨项目 mutation → `git-host-coordinator-busy`/`git-host-cross-project-coordinator-busy`；后到者不执行。 | 并发原始轨迹；lease 状态；后到者无执行 | 未取证 |
| AC-16 | sidecar authorization 写入失败（失败注入：阻断/替换 `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl` 的写入 store）→ `git-action-audit-unavailable`；不执行；无 ref/对象/工作树副作用。 | 失败注入原始记录；回执/错误码；副作用快照；sidecar 缺失证据 | 未取证 |
| AC-17 | 未审批的非只读 shell/裸 Git 写/`start_background_task` 借授权 → 在飞变更 AC-13/14/22 保持拒绝。 | 在飞变更负例复跑；无执行；审计 | 未取证 |
| AC-18 | PR #72 回归：`inspectToolSurface` strict 事实/reasons、`composeRuntimeApplicationMediation`、派发父门用例无行为变化；写门仍**不读** `applicationMediation`。 | PR #72 全套原始输出；源码/测试零引用断言；写门 gate 输出 | 未取证 |
| AC-19 | 可选证据被当授权：伪造 native/toolSurface 为 observed 不影响判定（不是授权输入）；身份/ACL/策略缺失仍拒绝。 | 伪造输入负例；动作结果不变；无执行 | 未取证 |
| AC-20 | run-stop 成员身份变化/native optional drift/host fence 不完整：`absent` 允许；`present-but-changed`（instance/plan 不符）→ `run-stop-instance-unproven`/`runtime-native-factory-plan-binding-unverified`；身份/fence 不符 → 既有 `run-stop-*`/`controller-stop-*`；不提交。 | 三种 native 状态原始轨迹；身份/fence 负例；无提交证据 | 未取证 |
| AC-21 | F4/H13/H14 运行时中立 in-flight/可读性闭包：`preparing`/`creating`/`disposing` ⇒ `git-core-in-flight-unproven`；`prepared`/`failed` 的 `factoryEntered`/`nativeBindEntered`/`pendingContinuations>0` ⇒ 同码，**豁免仅限 `never-started`+`preparedTokensRevoked`+`pendingContinuations===0`，或 `failed`+`instance-bound`+drain**；active 条目 `core-instance-inspection-failed`/lifecycle 或 toolSurface 缺失/不可读或 `toolSurface.sessionId/roleId/runtime` 与 entry 不一致 ⇒ `git-core-inspection-unavailable`（不跳过、不 fail-open）；不执行；无副作用。 | 各状态/豁免正负例原始输出；注册表/构造事实快照；无执行/副作用 | 未取证 |

### 2.3 真实运行（AC-22–AC-24，P1.3 §5.3/§6.2）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-22 | 受保护目标项目 + 真实 Claude + 单条客户消息派发：父门受理 + 任务创建 + 目标会话创建成功 + 任务投递。 | 真实运行诊断 `session.open.*`/`tasks.jsonl`/UI 截图；父门/任务/投递证据；候选/环境/预算 | 未取证 |
| AC-23 | 该会话在角色 ACL/写集内执行一次结构化 Git 动作（优先 `git_candidate commit`；若流程要求 init 则 `git_candidate init`）：成功或如实报告下一真实阻塞（不得伪造）；journal + sidecar authorization 证据存在。 | 真实回执/错误码；journal/sidecar 原件；无伪造证据；下一门如实记录 | 未取证 |
| AC-24 | 明确限制：只承诺证据所示；若 Git 动作需人工审批卡/多回合无法在预算内稳定复现，回退确定性集成测试并如实说明，不宣称已真实验证。 | 预算/中止记录；回退说明；原始证据保留 | 未取证 |

> **真实运行预算（AC-24，P1.3 §6.2/团队计划 §5.6）**：客户消息 1 条；chief 回合 1 个；product 回合 1–2 个；`dispatch_task` ≤1 次；Git 能力调用 ≤2 次；审批卡 ≤2 张；墙钟 10–15 分钟；不自动重试；首个决定性失败/成功即停；不追加预算、不伪造。只承诺本次候选/环境/输入下的观测事实（**会话创建 + 投递 + 至少一次 ACL 内结构化 Git 动作，或如实报告下一真实门**）；不承诺六角色完整闭环、发布成功、长期稳定性、Codex/Pi 真实运行。

## 3. `P1.2-AC-25`–`P1.2-AC-31` 定向条目（P1.3 §5.1–§5.2）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| P1.2-AC-25 | **F2 宿主继续（确定性）**：`prepareRunChange` 返回 `deferred`，真实回合结束后 `resumeDeferredRunChanges → executeOwnedRunStop → finalizeRunChange`（rapporteur 已 disposed 或无 active `select_run_change`）：`host-continuation` 分支通过；匹配 `requesterTurnId`/actor/**taskId（inventory 记录 + `held.plan.requesterTaskId`，R1）**/role/project；无 active tool 要求；提交成功。 | 真实/集成原始轨迹；host-continuation 字段/task 匹配；drain 事实；提交回执 | 未取证 |
| P1.2-AC-26 | **F3 sidecar 重试/恢复**：同一 operationId 崩溃后以新 lease/turn 重试；旧 journal（无 sidecar）；效果后结算失败：追加 sidecar 行且**不触发** `git-operation-replay-conflict`/`git-candidate-operation-conflict`/`git-init-operation-conflict`；旧 journal 正常读取；pending-recovery 语义不变。 | 重试/恢复原始记录；sidecar 行；旧 journal；冲突码零命中；pending-recovery 证据 | 未取证 |
| P1.2-AC-27 | **F5 Codex native 不可用创建/动作**（responses/MCP/WebSearch/custom transport）：创建成功；`plan.native` 缺席；`ensureAdapter` 回落工厂构造；动作时授权正常；`present-but-changed` 仍拒绝。 | Codex 不可用路径原始证据；plan/ensureAdapter；动作回执；drift 负例 | 未取证 |
| P1.2-AC-28 | **F8 可选证据（披露项）**：其它 active 会话配置 foreign MCP 或注册未命中 closedTools 的工具；动作仍按 actor 判定；foreign MCP/未知工具只出现在 optionalEvidence；**不宣称已阻断**其写 `.git` 的可能（披露项，不是安全通过）。 | 多会话+foreign/unknown 工具原始配置；动作回执；optionalEvidence；披露记录 | 未取证 |
| P1.2-AC-29 | **R1 负例**：host-continuation 的 `coreSessionId` 存在，但 inventory 记录的 `taskId` 与 `input.taskId`（`held.plan.requesterTaskId`）不符，或记录不唯一 → `git-actor-core-binding-unproven`；不提交、无副作用。 | 负例原始输出；taskId/记录唯一性证据；无提交/副作用 | 未取证 |
| P1.2-AC-30 | **R3/S5 sidecar 安全**：符号链接/nlink≠1/越界路径、超长行（>4 KiB）/文件（>64 KiB）/尝试数（>16 次）、坏 JSON、截断末行：非法路径/超预算/坏 JSON → `git-action-audit-unavailable`（不执行）；截断末行可容忍并留诊断；无 repo 效果。 | 各攻击/坏件 fixture 原始输出；预算组合自洽；无执行/无 repo 效果；诊断 | 未取证 |
| P1.2-AC-31 | **R2 文档/计划/激活/initial workflow 发布**：sidecar `policyInputDigests:{candidate,publication}` 两键均存在且等于对应 `checkGitPolicy().inputDigest`；发布回执/ref journal 成功；无 native 要求。 | 发布路径原始回执；sidecar 两键/digest 来源；ref journal；无 native 拒绝 | 未取证 |

## 4. 跨条目证据与检查要求

### 4.1 B1-EV1 候选、基线与稳定性

- 候选身份按 BASE-4；增补 changedPaths 的精确写集/owner（团队计划 §4.2–§4.7）、5（潜在 6）文件与在飞变更的重叠/串行证据；T1 三文件只读。
- 基线按 BASE-1/BASE-2 的豁免/参照路径；每批次受影响套件实施前后对照；最终 E3 全量与参照（文件+测试名[+类别]）逐条对照；新增确定性失败 0/新 skip 0；既有失败/转绿/新红逐条说明；不得 force-exit/timeout 冒充自然通过；不得删除/放宽断言或加 skip 求绿（删除/改写断言属契约变更，逐条记录并交验收判定）。
- 候选/证据运行前后同一 manifest/聚合/树；任何源码/测试/依赖/夹具/构建变化使证据失效并重取。
- **证据分层**：B0/参照基线、实施确定性（受影响套件/跨角色/typecheck）、真实运行、终验 T3 分层记录与判定；不同层证据不得互相替代；环境（OS/运行时/依赖/夹具/网络）差异逐条列明；不得把不同候选/环境/阶段的结果拼接。

### 4.2 B1-EV2 错误码、审计字段与 sidecar

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 错误码按 P1.3 §3.8：`git-core-creation-proof-unavailable`/`git-native-surface-unproven`/`git-unclosed-effect-registered`/`official-pure-preparation-unproven` 退役（新代码不再产生）；`git-action-audit-unavailable`、`git-core-in-flight-unproven`、`git-core-inspection-unavailable` 新增；`git-old-core-programs-unproven`/`git-role-capability-guard-unproven`/run-stop/controller-stop 码语义收窄；`native-factory-plan-unverified/unavailable/preparation-failed` 降为证据；`required-scope-unconfined-script-tools`/`runtime-protected-scope-unmediated-app-execution-planned` 确认无残留；既有身份/ACL/策略/租约/stale 码保留。 | 源码锚点/负例回执/grep；reason 表；退役码零命中；测试断言 | 未取证 |
| sidecar authorization 按 P1.3 §3.4.3：path `<canonical projectRoot>/.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`；append-only、write-ahead（publish safeWrite/update-ref 前；candidate journal/对象/ref 前；`commitPreparedDirect/TeamPlan/Activation/InitialWorkflow` store 写前；init 先于 `writeGitInitializationRecord(prepared)` 与 repo 创建）；append 失败 ⇒ `git-action-audit-unavailable`、不执行；行 ≤4 KiB/文件 ≤64 KiB/最多 16 次尝试（自洽组合，I0 冻结）；路径/符号链接/nlink/锁/坏行/截断容错；不进入 journal replay/settlement 身份；run-stop/controller-stop 不写 sidecar（写 run transition journal）。 | sidecar 原件/行字段/锚点顺序；失败注入；预算/安全测试；journal 重放/结算对照；run-stop journal | 未取证 |
| `policyInputDigests` 多 verdict 映射：commit/integrate/revert `{candidate}`；init `{init,candidate}`；delivery `{publication}`；文档/计划/激活/initial workflow `{candidate,publication}`；来源调用点 `checkGitPolicy().inputDigest`；run-change/finalize 无 policy/sidecar。 | 各调用点原始回执/sidecar；digest 来源；映射断言 | 未取证 |

### 4.3 B1-EV3 drain 谓词与运行时中立终止

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| `isRuntimeSessionDrained` 按 P1.3 §3.7：providerFinished + activeTools 空 + tracked processes 已退出（background 以管理器 stop/exited）+ 仅显式白名单 reason 不阻断；**`native:pi-sdk-idle-not-observed` 保持阻断**（非 idle Pi 不 drained；idle Pi 无该 reason 可 drained）；native handler-running/not-terminal/mcp-process-coverage、native read failure、`real-provider-settled-not-observed`、cleanup failures、custom disposal、未知 reason 全部阻断；不使用 `native:` 前缀通配。 | drain 真值表/单测原始输出；Pi idle/非 idle 正负例；reason 分类清单；未知 reason 阻断证据 | 未取证 |
| 使用点：`stopAndInspect` disposed 分支 + 活动排空循环（drain 即返回或披露每成员 5s/timeout facts 接受方式）；`run-role` 失败准入、`trunk-runtime` disposed/run-stop/controller-stop、`apply-journal` run-stop commit、桌面 `executeOwnedRunStop`；native/processCoverage 仅证据；Claude/Pi 进程树不可观测接受并披露。 | 各使用点原始轨迹/测试；5s 成本披露；native 可选证据；无 native 拒绝 | 未取证 |
| **H13/H14 运行时中立 in-flight/可读性闭包**：gate 对非 active 条目按 `construction`+`state` 判 in-flight（H13：preparing/creating/disposing；prepared/failed 除两类豁免外拒绝）；active 条目必须可读 lifecycle/toolSurface 且 `sessionId/roleId/runtime` 与 entry 一致（H14），不可读 ⇒ 拒绝；**不要求** native/processCoverage；不得因无关 active 条目（Claude/Pi/judge）拒绝 actor 动作（AC-6）。 | H13/H14 真值表/单测原始输出；两类豁免正例与其余负例；toolSurface 身份漂移负例；无关 active 不阻断正例 | 未取证 |

### 4.4 B1-EV4 只读/结构化 Git 边界、PR #72 与 Q9 取代

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 只读 Git shell 白名单、`git_query` readableOids/模板、`git_candidate`/`git_publish` 角色 ACL、裸 Git 写 writeGuard 硬拒、非只读 shell 审批——沿用当前变更 P1.3，本方案不改/不回退；`git_query` 只读不经本门；`git_publish documents` 不走本门；delivery 走本门。 | 当前变更对应套件复跑；写门调用点/ACL 源码；无回退证据 | 未取证 |
| **Q9 取代**：P1.6 Q5「仓库初始化保护的应用中介证据」由本方案替代为「删除注册表级预知要求 + 动作时授权」；写门继续零引用 `applicationMediation`；不把应用中介证据用于写/发布/stable-write/交付/run-stop。 | 写门 gate 输出/源码零引用断言；PR #72 回归；Q9 披露记录 | 未取证 |
| PR #72 回归：`inspectToolSurface` strict 事实/reasons、`composeRuntimeApplicationMediation`、派发父门、controller resume 无变化；含 shell 会话 `status:"unknown"`/`applicationMediation:"verified"`（满足时）语义不变。 | PR #72 全套原始输出；事实/源码锚点 | 未取证 |

### 4.5 B1-EV5 测试同步清单（P1.3 §4.5，逐条）

> 以下路径/行号按 P1.3 复核快照；实施以符号名/文本锚点为准，行号不作为契约；新增测试归属按团队计划/I0 冻结（E-c：`test/编排/`；不新建 `test/桌面应用/` 文件；条件写集见 BASE-3）。

- `test/runtime-core/git-capability-tools.test.ts` R14 两阶段改写（当前变更 `protected-scope-approval-chain-unproven` → 本变更 Codex native 可选、审批链成立即可绑定）；`:509`/`:775-782`/`:1002-1007,1025` 控制面/自定义/demo 保留与证据断言。
- `test/编排/trunk-dispatch-parent.test.ts:388-395`、`test/测试/runtime-dispatch-gate-integration.test.ts:409-416` 源码断言从 strict observed/native 改为新 gate 条件（仍不读 applicationMediation）。
- `test/桌面应用/chief-workflow.test.ts:2146` controller-stop 码保留 + Claude/Pi 正向；`:2187-2188` Codex 停止成功断言按新语义同步（native 可选/drain）。
- `test/编排/rapporteur-module-consumption.test.ts:389-451` direct-stop 治理语义保留；commit 路径新增 drain 用例。
- `test/编排/stable-write-runtime.test.ts:300,316` 码保留、语义收窄 + drain 行为。
- `test/runtime-core/session-lifecycle.test.ts` 新增 drain 真值表/Claude/Pi 形态/F7/F5；`test/测试/git-role-workflows-e2e.test.ts:382-386,1262-1265` 测试模型按 ACL/任务调用（非产品代码）。
- 新增：host-continuation（P1.2-AC-25/29）、sidecar 重试/安全/多 verdict（P1.2-AC-26/30/31）、F4 闭包（AC-21）、F5 Codex（P1.2-AC-27）、F8 optionalEvidence（P1.2-AC-28）、F6/F7 drain。
- **owner/条件参与（E-b/R9）**：`plan.native` 投影、`ensureAdapter` 回落、`bindRole` 条件核对、D6 `trustedPurePreparation` 赋值归运行时核心 `session.ts`；Codex 适配器默认零产品写入，仅 I0 确认时同步 D1/D2/D6 证据/事实，不改变证据语义。
- 删除/改写断言逐条在实施证据与验收记录列明；不得以「放宽断言」方式静默通过；既有红/绿与新增红区分（在飞 E3 T3 参照）。

## 5. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前候选上全部观察有完整、可复算原始证据；基线/参照有效；新增确定性失败 0、新 skip 0；动作时授权/ACL/策略/lease/两阶段复检/sidecar/Journal 证据齐备；失败均无副作用；Q16 取代关系已注明；披露充分。
- **fail**：预知式门控仍作为放行前提（native plan/toolSurface strict/processCoverage/closedTools）；Git mutation 未核真实 actor/ACL/策略/lease；sidecar 失败仍执行；write-ahead 缺失；审计不可写未拒绝；Codex native 缺失/unknown 仍阻断创建/动作（应可选）；run-stop/controller-stop 仍要求 native；`native:pi-sdk-idle-not-observed` 被误放行；删除/放宽断言、加 skip、force-exit 冒充；新增确定性失败/新 skip；伪造/过期身份被放行；PR #72/写门读取 applicationMediation；Q9 被误读为放宽写门；候选与证据不符。
- **insufficient evidence**：缺候选/基线与参照/原始日志/命令/环境/退出/计数；B0/参照失效未重记；关键链被 mock；真实运行预算/中止/失败未保留；sidecar/审计/`policyInputDigests`/drain reason 分类无法核对；Q16 未注明；disclosure 缺失。
- **not applicable**：仅限有明确依据者，例如：真实 Pi/Codex 模型运行（P1.3 §6.2 只要求真实 Claude；确定性覆盖仍必需）；`typecheck:renderer`/`build:renderer` 未触及渲染/UI 时（须给依据）；`O1`/`O3`/`O4`/`O6`/`O7`/`O9`/`O10` 等未采纳选装项（引用 P1.3/团队计划）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以工具退出 0/团队自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接不同候选/环境/阶段结果。

## 6. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；Q16 注记；团队计划/I0 输入齐备 | — |
| I0 接口评审 | sidecar 锚点/API/导出、drain reason 分类、`RunChangeHostPlan`/`ControllerStopHostPlan` native 可选、H13/H14 边界、Q16 标签均冻结 | 不进入实施；回策划/接口评审 |
| 实施（确定性） | AC-1–AC-21、P1.2-AC-25–31 适用项 + B1-EV1–EV5；受影响套件前后对照；T3 参照对照新增确定性失败 0/新 skip 0；typecheck 绿；测试同步清单落实 | 回原 owner；不得以旧基线/旧候选通过 |
| 真实运行 | AC-22–AC-24 完成并如实报告；失败回退确定性并披露 | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 全部适用项按本 B1 判定；Q16 取代关系两端注明；变更包/证据链齐备；披露（Q1/Q3/Q6/Q7/Q12/Q16、foreign MCP 跨会话、Claude/Pi 进程不可观测、审批放行脚本写 `.git`、B0 豁免/参照）充分 | 报告 pass/fail/insufficient evidence；不授权发布 |

**复判规则**：本 B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/参照/契约/写集/依赖/夹具/构建/命令/环境变化使受影响证据失效并重取；证据复用须证明候选关联且输入/依赖/契约/命令/环境未变；阶段证据独立；旧基线/在飞 B1 证据不得冒充本变更当前证据；发布/tag 未授权。

## 7. 范围限制与披露

1. 本 B1 只覆盖 P1.3 的「删除预知式门控 + 动作时授权」；不覆盖当前变更（会话准入）、I6 H01–H11、旧 A/J、T1；不改变 PR #72 契约。
2. **Q16**：本 B1 在实施/验收后取代在飞 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3「native-factory-plan-unavailable 仅 codex」；两端变更包/验收记录注明；生效前两份并存、不互相改写。
3. **残余风险披露（客户已接受）**：审批放行的不透明 shell 脚本可能写 `.git`；其它 active 会话的 foreign MCP/未封闭/未知 app 工具可能在 lease 外写 `.git`（F8；仅 optionalEvidence，不宣称阻断）；旧会话泄漏进程仅以 tracked process 退出为证据（native 不可观测）；run-stop「已停止」= Core/tracked drain，不等 native 进程树消失；Codex chat MCP/WebSearch 真实限制构造期仍报错；错误可能更晚出现。
4. **B0 豁免/参照**：按 BASE-1/BASE-2/团队计划；若豁免不覆盖本变更，补正式 B0；变更包/B2 必须披露实际路径与参照基线差异（首选在飞 E3 T3，后备 `d0d67ff4…`）。
5. **Q9 取代**：P1.6 Q5 的写门应用中介证据问题由本方案「删除注册表级预知要求 + 动作时授权」替代；写门仍不读 `applicationMediation`，不把应用中介证据用于写/发布/stable-write/交付/run-stop。
6. **串行**：与在飞变更重叠 5 文件（+潜在第 6 `public/trunk-store.ts`、R14 测试）全部串行；实施启动门 = 在飞 E3 完成 + I0 冻结 + 沟通放行。
7. 本 B1 只写 `docs/acceptance/`；未改方案/代码/测试/角色卡；未运行真实模型；不授权实施/提交/推送/合并/发布。

## 8. 当前状态

- **B1 完成、冻结（实施前）**；AC-1–AC-24、P1.2-AC-25–31、BASE-1–4、B1-EV1–EV5 当前全部 `未取证`，不得判 pass。
- 后续由同一独立验收身份在基线/实现/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并。
- 本 B1 与 I6/旧 A/J/T1/在飞变更 B1 分开（仅 Q16 取代关系在生效后注明）；发布/tag 不在授权内。
