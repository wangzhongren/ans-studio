# 会话创建准入改为「按操作审批」+ Git 只读/专属命令放行：实施前验收标准 B1 v1

- 日期：2026-11-08；固定身份：ANS 独立验收唯一主上下文（本文件只做实施前验收标准，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 风险档位：**T3**（设计 P1.2 §4.6；治理/权限/审批语义 + 门禁引擎硬地板收窄 + 跨五角色共享契约；不压档）。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对同一最终候选与本版本判定。
- 依据（本文件写盘前实测）：
  - 方案 **P1.2**：`docs/planning/2026-11-08_design_session-admission-approval-based.md`，**844 行 / 128528 bytes / SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`**。
  - 复核记录：`docs/planning/2026-11-08_review_session-admission-approval-based.md`，**193 行 / 53879 bytes / SHA-256 `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`**（完整复核 F1–F15、窄复核 R1–R7、最终核对 R8a–R8c；结论「建议提交客户确认」，R8a–R8c 建议级）。
  - 意图/客户规格：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行 / 3654 bytes / `51918bc90b25691659aa515bfd475c953e5facb356bc343c2e05e594d779c108`；含「git 命令只读放行，每个角色的专属git 命令放行」）。
  - 闸门 1 留痕：`docs/communication/2026-11-08_gate-confirmation_session-admission.md`（27 行 / 2129 bytes / `7ffa4706c48a1450f70c6efa74083e636a8a6ac4a6fff4dfaf74c4128ed7b32f`；P1.2 为确认对象，预授权覆盖）。
  - 格式参考（不修改、不替代）：上一变更 B1 v1 `a999dc19…` / v1.1 `e5027742…`（冻结脏基线/挂起处理口径与证据/判定纪律可作格式参考；本变更的基线数据以新 B0 为准）。
- 代码/证据基线：本变更基线 HEAD **`a1b2f662bf951ad039365bbbfe64caad9283fcd1`**；设计引用 P1-RR 证据 `c47198f7…`、PR #72 merge `c069425`、P1.6 `24150207…`、E0.3 `067e3d2e…`、冻结记录 `5439d7c3…`；T1 未提交改动只读、不属本变更写集。

## 0. 范围、关系与非目标

### 0.1 本 B1 覆盖

设计 P1.2 的 **AC-1–AC-30**（§5.1–§5.4）与测试策略 §6、错误码/审计字段 §4.2/§4.3、测试同步清单 §4.5、真实运行 §6.2；本文件把这些整理为可检查条目，不增加/不放宽设计口径。

### 0.2 与其他标准/变更的关系（不替代、不修改）

1. **不修改 I6 B1**（`2026-11-06_chief-hub-routing-criteria-v1.md`，H01–H11）及其 H02/H03；本 B1 只判本变更的会话创建准入/审批/Git 只读语义。
2. **不修改旧 A/J**（`11f73b94…`/`9330b1b3…`）与上一变更 B1 v1/v1.1；不影响 T1 验收；不改变 PR #72/ P1.6 的派发父门、应用中介证据、写/发布/stable-write/交付/run-stop 门语义。
3. **本 B1 只对本变更最终候选有效**；发布/tag、提交/推送/合并均未授权（预授权不覆盖发布/tag）。
4. 不新增角色/边界/客户卡；不改写权/客户主权；不建 DSL/工作流引擎；不把写/发布门放宽为应用中介证据（P1.2 §0.4/§2.8）。

### 0.3 已知建议级缺口（R8a–R8c，不阻断，但必须记录处置）

- **R8a**：`registerShellApproval` 签名在 P1.2 §2.3.1（无 sink）与 §2.3.2/§4.1（有 sink）不一致；§4.1 shell-arming 行仍保留旧条件式。要求：实施接口评审统一签名/登记点，并在变更包记录；不得按旧签名实现。
- **R8b**：测试私有 Symbol 的载体对象未写明（options vs sink）；要求：实施接口评审明确挂在 **sink 对象**（非枚举）或明确 memory-sink 正向用例只走直接 `createShellGate`；生产装配测试断言 Symbol 从不设置。
- **R8c**：`probeShellApproval` 对未登记 gate 的返回语义未写明；要求：实现/测试明确「未登记 ⇒ 返回 `undefined`（走 `protected-scope-approval-chain-unproven`）；已登记但 sink/probe 缺失/抛错 ⇒ 冻结 facts 且 `probe:"unavailable"`（走 `protected-scope-audit-unavailable`）」，并补单测。
- 上述三项为**建议级**，不阻断 B1/B2；但 B2 报告必须记录每项的处置（已关闭/转后续接口评审/未处理），不得静默忽略或借此放宽安全要求。

## 1. B0 基线要求（新登记，HEAD `a1b2f66`）

> 新 B0 由统筹在本变更基线 HEAD `a1b2f66` 上重新登记；下列为 B1 对 B0 记录的最低要求。上一变更 B1 v1.1 的冻结脏基线纪律（B0 身份、逐文件自然终态、挂起登记、不得 force-exit 冒充、逐条变化说明）作格式参考，但**数据不得沿用旧 B0**。

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| B0-1 | B0 记录（路径/行数/字节/SHA-256）+ 证据目录齐备；候选为 HEAD `a1b2f66` + 工作树（T1 只读文件单列）；记录 Node/npm/OS/环境变量、暂存区、`src app test` scope、HEAD/tree。 | B0 记录 + 证据目录 hash/索引；环境与 status 原始日志 | 未取证 |
| B0-2 | 全量测试文件枚举、逐文件自然 EXIT/CLOSE（或等价逐文件记录）、逐文件 tests/pass/fail/cancelled/skip/todo、退出码/signal/watchdog/剩余进程；已知挂起文件按登记隔离（90s 或既有口径），**不计通过**；未用 `--test-force-exit` 冒充自然通过（如为已知 post-test 泄漏使用，须逐文件列明理由）。 | 全量日志/逐文件结果 TSV、挂起隔离日志、失败/skip 逐条清单、日志 hash | 未取证 |
| B0-3 | 失败/skip 清单按（文件+测试名[+类别]）可逐条对照；基线红/绿记录包含设计 §4.5/§6.1 点名的既有红（`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914`）与既有绿（`test/门禁引擎/classify-shell.test.ts` 等）；区分「既有红」「既有绿」「本变更新增红/转绿」。 | B0 记录分类表 + 原始日志；既有红/绿复跑 | 未取证 |
| B0-4 | B0 有效期：实施前/证据前重核 HEAD、分支、T1 三文件（或设计列出的 T1 两文件）、依赖锁/夹具/构建配置；任何变化须重记 B0；B0 记录自身 SHA-256 入变更包。 | B0 复记/核对日志；候选/依赖/配置 hash | 未取证 |
| B0-5 | B0 与候选稳定性：证据运行前后同一 `src app test` manifest（逐文件 sha256 + 聚合算法）；候选变化即失效，不得沿用旧 B0/旧候选。 | manifest/聚合/稳定性快照；算法明文 | 未取证 |

## 2. 验收条目 AC-1–AC-30（设计 §5.1–§5.4）

> 每行“必须观察的结果”为设计 AC 原文口径的可检查化；“必要原始证据”为 B1 补充；当前全部 `未取证`。判定只用 `pass/fail/insufficient evidence/not applicable`。

### 2.1 准入与运行时（AC-1–AC-4、AC-11–AC-12、AC-18）

| ID | 必须观察的结果（AC 原文口径） | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-1 | 受保护项目（存在 `init-source-*`）+ Claude + product + 桌面 arm（审批档/三层链）：`prepareRole` `status:"observed"` + token；`bindPreparedRole` 成功；`session.open.ready`；`appTools` 含 `run_shell`/`start_background_task`；plan 含 `approvalChain`。 | 真实/桩件 prepare→bind 日志；plan/approvalChain 投影；session.open 诊断；appTools 注册表；候选 hash | 未取证 |
| AC-2 | 受保护 + Pi + 项目角色（非内置）+ `shellOperatorChannel`：同 AC-1（三层链，`advisoryRuleset` 默认 true）。 | Pi 路径集成日志；plan/approvalChain；appTools；候选 hash | 未取证 |
| AC-3 | 受保护 + Codex 默认工厂 + shell 工具：native plan 仍 observed；`appTools` 含 shell 不拒绝；有审批链 ⇒ 绑定成功；无审批链 ⇒ `protected-scope-approval-chain-unproven`。 | Codex 严格路径回归；native plan/审批链正负例；P1.6 原条件断言 | 未取证 |
| AC-4 | 受保护 + Claude/Pi + **无 shell 工具**（CLI 路径 / judge 会话 / pm 审读会话）：创建成功；`run_shell`/`start_background_task` 不存在；写工具仍受边界门。 | 无 shell 会话打开日志；工具注册清单；写门回归；候选 hash | 未取证 |
| AC-11 | 受保护 + 注册 shell + **无 binding**（直接传 `async()=>({allow:true})` 或别的项目装配的 gate）：plan unknown（`protected-scope-approval-chain-unproven`）；Pipeline 抛 `runtime-creation-admission-unproven:…`；**不构造适配器、不发模型请求、不执行命令**。 | 负例原始输出；适配器构造/模型请求/命令执行计数 0；plan reasons；候选 hash | 未取证 |
| AC-12 | 受保护 + binding 但审计探针失败（边界未接受且 refresh 后仍拒/非持久 sink/自定义 sink 无 probe）：`protected-scope-audit-unavailable`；不创建；若 Q4 启用，运行期审批放行但审计写失败 ⇒ 不执行；若 Q4=observe，按 AC-28 披露项，不视为安全通过。 | 审计探针/refresh 原件；sink kind/durable/probe；负例执行计数 0；Q4 选择记录 | 未取证 |
| AC-18 | 受保护 + custom factory / demo / unknown scope：保持拒绝（既有 reason）。 | 三负例原始输出；既有 reason 断言；候选 hash | 未取证 |

### 2.2 只读/非只读、审批链与不可绕过（AC-5–AC-9、AC-13–AC-17、AC-21–AC-22）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-5 | 只读 shell：`ls`、`cat <file>`、`grep pattern src` → 0 卡直接执行；审计 `branch:"c-allow"`。 | 审计 JSONL 原件；工具回执；无审批卡/无 judge 调用计数 | 未取证 |
| AC-6 | 只读 Git shell（run_shell）：`git status`、`git log -5`、`git diff`、`git show <oid>:<path>`、`git rev-parse --verify HEAD`、`git ls-files`、`git ls-tree HEAD`、`git merge-base <a> <b>`、`git blame -- <path>`、`git cat-file -p <oid>` → 0 卡；经固定 Git 传输（绝对可执行/固定 env）；审计 `branch:"c-allow"`、`by` 以 `ruleset:allow:readonly:git:<id>` 为前缀（可带既有档位后缀）、`readonlyGit.canonicalArgv` 与实际执行体一致；输出有界。 | 10 子命令原始 argv/规范体/实际执行日志；固定传输/环境证据；审计 JSONL；`by` 前缀断言；`readonlyGit` 字段；输出预算 | 未取证 |
| AC-7 | 非只读 shell：`touch x`、`npm test`、`node script.js`（judge 关闭）→ 弹审批卡（命令原文/argv/cwd/entry）；客户 allow ⇒ 执行 + 审计 `a-allow`/升级链；deny ⇒ 不执行 + `a-deny`。 | 卡面原件/截图；工具回执；审计 JSONL；执行/未执行计数；候选 hash | 未取证 |
| AC-8 | 「替我审批」开启：judge 明确 allow ⇒ 执行 + 结果行 + 审计 `judge`（operator `judge:<engine>`）；judge deny ⇒ 拒绝 + 理由；manual/row-failed ⇒ 拒绝且不弹卡。 | judge 工具/结果行原件；审计；拒绝回执；无客户卡计数 | 未取证 |
| AC-9 | 判拒升级：judge deny 某 `run_shell` 精确命令后 `request_shell_escalation` → 卡面取自判拒原文；allow-once ⇒ 仅同 argv 一次；allow-session ⇒ 本会话同 argv；deny/超时 ⇒ 拒绝；后台入口不消费。 | 升级申请/卡/授权/消费原件；精确 argv 比对；后台入口负例；审计 | 未取证 |
| AC-13 | 未审批写/后台/副作用：客户 deny、超时、通道不可用、关窗、Esc → 不执行；`run_shell`/`start_background_task` 返回拒绝回执；无进程/文件/后台任务残留；审计 `a-deny`/`a-timeout`/`a-unavailable`。 | 各失败模式原始日志；进程/文件/后台残留学；审计；工具回执 | 未取证 |
| AC-14 | 审批绕过尝试：伪造 token/参数、`start_background_task` 借前台授权、`request_shell_escalation` 早于判拒/重复/超限、`git commit` 借审批；**advisory/operatorOnly 模式下 `git commit`（writeGuard 注入时）** → 全部拒绝；无执行；审计/诊断可辨；**writeGuard 注入断言**：接 (a) 的装配路径必须携带 writeGuard（缺失即测试失败），不得把 classifier deny 当硬地板。 | 各绕过负例原始输出；writeGuard 注入检查/源码断言；无执行计数；审计可辨 | 未取证 |
| AC-15 | 伪造身份/回合：过期 Git 回合、非 convener `init`/`integrate`/`revert`/`delivery`、verifier 无 review 绑定、su/judge 调 Git → 对应既有码拒绝（`git-delivery-source-changed`/`git-*actor*`/`git-policy-role-action`/`role-not-allowed`）。 | 负例原始输出/错误码；工具 ACL/策略源码锚点；无副作用证据 | 未取证 |
| AC-16 | Git 参数级攻击（P1.2 §2.4.3 表全部样例）与路径攻击（`../`、绝对路径、`.git/config`、`:(glob)`、通配）→ `deny`；不 spawn；无文件变化；审计可辨。 | 攻击矩阵逐条原始 argv/回执/无 spawn/无文件变化证据；审计；matcher 单测 | 未取证 |
| AC-17 | 审计缺失：受保护 + shell + 审计路径被门禁拒绝 → 创建期失败（AC-12）；不会出现「审批放行但无审计」的路径（Q4 开启时）。 | 审计门禁负例；创建失败回执；Q4=deny 行为证据；无「审批 allow + 无审计」轨迹 | 未取证 |
| AC-21 | 后台任务：`start_background_task` 审批 allow 才启动；列表/读取只读；停止仅终止；会话 dispose 清理。 | 后台任务原件/生命周期；审批/审计；dispose 清理证据；候选 hash | 未取证 |
| AC-22 | 只读 Git 在 `start_background_task` 入口 → 拒绝（不因只读白名单放行）。 | 后台入口负例原始输出；无任务启动证据；审计 | 未取证 |

### 2.3 角色专属 Git、PR #72 回归、既有回归（AC-10、AC-19、AC-20）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-10 | 角色专属 Git：product `git_query status`（无任务绑定）、product 在授权写集内 `git_candidate commit`（若初始化保护通过）、convener `git_publish documents` → 不受创建准入影响；按 ACL/策略返回 observed/prepared/published 或既有 blocked 码；journal/审计存在。 | 三场景原始工具回执/操作 journal/审计；ACL/策略源码锚点；初始化保护适用性记录 | 未取证 |
| AC-19 | PR #72 回归：含 shell 的真实/桩件会话 `inspectToolSurface().status` 仍 `unknown`、`applicationMediation` 仍 `verified`（满足条件时）；派发父门用例原样通过。 | PR #72 全套回归原始输出；`inspectToolSurface`/`applicationMediation` 事实；派发父门测试 | 未取证 |
| AC-20 | 既有 shell 审计/升级/判断/白名单回归（除有意更新的 Git 用例）→ 全绿；无新增确定性失败。 | 受影响套件原始输出；与 B0 逐条对照；新失败/新 skip 0 或逐条说明 | 未取证 |

### 2.4 真实运行（AC-23–AC-25）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-23 | 受保护目标项目 + 真实 Claude + 单条客户消息派发 product → 父门受理 + 任务创建 + **目标 product 会话创建成功**（本次直接目标）；任务投递成功（product 回合启动）。 | 真实运行原始日志/诊断/`tasks.jsonl`/UI 截图；`session.open.ready`；父门/任务/投递证据；候选/环境/预算 | 未取证 |
| AC-24 | product 回合执行一条只读命令（如 `git status` 或 `ls`）与一条非只读命令（如 `touch` 或脚本）→ 只读 0 卡执行；非只读出现审批卡；批准后执行、拒绝后不执行；`docs/audit/shell-gate.jsonl` 有对应记录。 | 真实 UI 卡/截图；审计 JSONL；工具回执；执行/未执行证据 | 未取证 |
| AC-25 | 明确限制：只承诺证据所示；若审批卡需人工操作无法在预算内稳定复现，回退确定性集成测试并如实说明，不宣称已真实验证。 | 预算/中止记录；回退说明；原始证据保留 | 未取证 |

### 2.5 Q9 边界、approval-chain 变化、Q4、F1 读范围、writeGuard（AC-26–AC-30）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-26 | **Q9 边界负向**：受保护 + shell（或任一 Claude/Pi/judge active Core 条目）+ `git_candidate commit`/`init` → 既有 `inspectInitializationProtection` 拒绝（`git-core-creation-proof-unavailable`/`git-native-surface-unproven`）；无 ref/journal/工作树副作用；错误如实回给角色。 | 负例原始回执；ref/journal/工作树前后快照；注册表级事实；无副作用证据 | 未取证 |
| AC-27 | **approval-chain 变化模块级防御判据**：binding 模块级单元测试直接驱动；`protected-scope-approval-chain-changed` 由模块级测试覆盖；端到端非必过，端到端按既有 `isCurrent` → `runtime-prepared-configuration-changed` 断言。 | binding 单测原始输出；端到端既有 reason 断言；实现说明（R6） | 未取证 |
| AC-28 | **Q4 未采纳（observe）**：审计写失败 + 审批 allow → 执行可能发生但**无审计记录**；验收判为披露项/未通过安全目标（须在闸门 1 记录客户选择），不得当作通过；Q4 采纳时按 AC-12 拒绝执行。 | Q4 选择记录（P1.2/闸门确认）；审计失败/allow 轨迹；披露记录 | 未取证（若 Q4=deny 则依 AC-12/AC-17 判，AC-28 按 N/A 并引 P1.2 Q4 确认） |
| AC-29 | **F1 读取范围可执行判据**：shell 只读 `git show <任意完整历史 oid>:<path>`/`git log <oid>` 可读；`git log --all` deny；`git_query` 对 verifier 的 review 绑定限制不变。 | 正/负例原始 argv/输出；固定传输证据；`git_query` verifier 负例；审计 | 未取证 |
| AC-30 | **writeGuard 注入断言**：接 (a) 的装配路径（项目链/审批档）都携带 writeGuard；advisory/operatorOnly 模式下 `git commit`/`git push` 被 writeGuard deny；只读档不接 (a)、`c=deny` 即终结（不要求 writeGuard）。 | 装配路径/选项源码断言；负例原始输出；只读档 c=deny 证据；不得把 classifier deny 当硬地板 | 未取证 |

## 3. 跨条目证据与检查要求

### 3.1 B1-EV1 候选身份与稳定性

- 实施检出绝对路径、HEAD `a1b2f66`（或经重记 B0 后的当前基线）、分支、工作树 status（tracked/untracked）、本变更 changedPaths（含新增/修改/删除）。
- 逐文件原字节 SHA-256 + 可复算聚合身份与算法 + 树/manifest（`src app test`）；候选冻结前后同一身份；T1 只读文件（设计点名 `src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`；以实际 B0/统筹记录为准）不得修改；不属本变更。
- 证据运行前后候选/manifest 不变；任何源码/测试/依赖/夹具/构建变化使证据失效并重取（沿用 B1 v1.1 的候选/证据失效纪律作格式参考）。

### 3.2 B1-EV2 T3 全量回归与测试同步

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 新 B0（HEAD `a1b2f66`）之上执行 T3 全量回归：逐文件自然 EXIT/CLOSE（或等价逐文件记录）；与 B0 失败/skip 集合逐条对照；**新增确定性失败 = 0、新 skip = 0**；既有失败变化逐条说明；已知挂起按登记；不得以 force-exit/timeout 冒充自然通过；不得删除/放宽断言或加 skip 求绿。 | T3 原始日志/逐文件结果/对照 diff；B0 记录；失败/skip 逐条说明；命令/环境/退出/计数 | 未取证 |
| 设计 §4.5 测试同步清单全部落实：R14（`git-capability-tools.test.ts:577-601`）改新 reason `protected-scope-approval-chain-unproven`；`classify-shell.test.ts` Git 只读用例 allow、非白名单仍 deny；`shell-write-guard.test.ts` 只读 Git pass/其余 deny；`git-shell-acl.test.ts` 只读精确形态 allow/其余 deny；`shell-readonly.test.ts:350-365`、`shell-gate.test.ts:884-914` **既有红转绿**（不计本变更新增红）；`shell-risky-order.test.ts:39` 版本/id 随 `SHELL_RULES_VERSION` 3→4 同步；`lightweight-permission-repairs.test.ts:182` 同步；`operator-channel` 加法字段不破坏既有断言。 | 每条测试的修改 diff/原始输出；B0 既有红/绿证据；版本/id 断言；区分既有红与新增红 | 未取证 |
| `npm run typecheck`（主）必须绿；`typecheck:renderer`/`build:renderer` 按是否触及渲染/UI 字段判定，未触及可 N/A 并给依据；门禁负例/既有 shell 审计/升级/判断/白名单回归（AC-20）。 | 命令/退出/日志/依据；受影响套件原始输出 | 未取证 |

### 3.3 B1-EV3 错误码、审计字段与 `by` 前缀

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 新 reason/错误码按 P1.2 §4.3：`protected-scope-approval-chain-unproven`、`protected-scope-audit-unavailable`、`protected-scope-approval-chain-changed` 新增；`required-scope-unconfined-script-tools`、`runtime-protected-scope-unmediated-app-execution-planned` 退役（新路径不产生）；`native-factory-plan-unavailable` 仅 codex；`readonly-git-runner-unavailable`、`audit-unavailable` 新增；既有 `runtime-creation-admission-unproven:<reasons>` 保留。 | 源码锚点/负例回执/日志；退役码 grep；reason 表；测试断言 | 未取证 |
| 审计 `ShellAuditRecord`：`branch` 保持 `"c-allow"`（不新增 branch 值）；只读 Git `by` 以 `ruleset:allow:readonly:git:<id>` 为**前缀**（允许既有档位后缀「（su 审批档）/（advisory 规则）/（su 只读档）」）；`readonlyGit:{id,canonicalArgv}` 必做且 canonicalArgv 与实际执行体一致；`entry` 及可选 `roleId` 记录；升级决定/执行后审计不变。 | 审计 JSONL 原件；`by` 前缀断言；readonlyGit 字段/规范体对照；实际执行日志 | 未取证 |

### 3.4 B1-EV4 Codex 严格路径、demo 行为、PR #72 / P1.6 边界

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| Codex 严格路径原条件逐字保留（native plan 严格校验；非空 foreign MCP/native builtin/plannedProcesses/status unknown 等仍拒绝）；仅「含 shell」从创建期拒绝改为要求审批链证据；`applicationMediation` 仅派发父门/controller resume 消费；`inspectInitializationProtection`/stable-write/交付/run-stop 不消费新证据。 | Codex 严格回归原始输出；P1.6 INV 断言/源码锚点；`inspectToolSurface`/applicationMediation 事实；写/发布门回归 | 未取证 |
| demo 保持现状：受保护范围仍按 `protected-scope-default-native-plan-required` 拒绝；不因本变更放开 demo。 | demo 负例原始输出；既有 reason 断言 | 未取证 |

### 3.5 B1-EV5 真实运行最小验证（AC-23–AC-25 的预算/纪律）

- 预算（P1.2 §6.2）：客户消息 1 条；chief 回合 1 个；product 回合 1–2 个；`dispatch_task` ≤1 次应用处理器调用；审批卡 ≤2 张（只读 0 张）；墙钟上限 10 分钟；不自动重试；首个决定性失败/成功即停。
- 环境：仓库外临时根/临时 userData；目标项目构造 `required` 保护事实（父门派发写入或预置合法 init-source，须如实记录哪一种）；只用仓库根 `.env` 既有凭据（不打印/复制）；审计门禁预检（与创建准入同一 file sink probe，含一次 refresh 重试）；不改仓库/不写既有项目/不改 `app/main.ts`。
- 证据：诊断 `session.open.*`、`tasks.jsonl`、目标项目 `docs/audit/shell-gate.jsonl`、UI 截图/文本、暂停/退出；失败/超时/预算超限原地保留；不宣称六角色完整闭环、Git 写/发布成功或长期稳定性。
- 若审批卡无法在 UI 自动化下稳定出现：停止并保留该子项给确定性测试，如实报告，不追加预算/不伪造（AC-25）。
- 真实 Pi/Codex 运行：设计 §6.2 只要求真实 Claude；Pi/Codex 以确定性集成/桩件 + 既有证据覆盖，若未跑真实 Pi/Codex，按 N/A 并引用 P1.2 §6.2。

### 3.6 B1-EV6 R8a–R8c 处置记录

- 按 §0.3；B2 报告逐项记录处置（关闭/转接口评审/未处理），不得影响安全目标；若实现采用与 R8 建议不同的方案，须在团队计划/接口评审记录说明，并由 B2 判断是否满足 AC-6/AC-12/AC-27。

## 4. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前候选上全部观察有完整、可复算原始证据；新 B0 有效、候选/环境/命令一致；新增确定性失败 0、新 skip 0；审计/日志/回执/副作用证据齐备；R8a–R8c 有处置记录。
- **fail**：原始证据表明违反设计：审批/审计/守卫可绕过；未授权非只读执行；只读 Git 白名单放宽到未列 argv/全局选项/任意路径；写/发布门被应用中介或审批替代；Codex 严格路径改变；demo 被放开；审计失败仍放行（Q4=deny 目标下）；删除/放宽断言、加 skip、force-exit 冒充；新 B0 对照出现新增确定性失败/新 skip；候选与证据不符。
- **insufficient evidence**：缺候选/哈希/B0/原始日志/命令/环境/退出/计数；B0 失效未重记；关键链被 mock；真实运行预算/中止/失败未保留；测试同步清单未落实；审计字段/`by` 前缀/`readonlyGit` 无法核对；R8 处置未记录等。
- **not applicable**：仅限有明确依据者，例如：真实 Pi/Codex 模型运行（P1.2 §6.2 只要求真实 Claude；确定性覆盖仍必需）；`typecheck:renderer`/`build:renderer` 未触及渲染/UI 字段（须给依据）；AC-28 在 Q4=deny 确认时（按 AC-12/AC-17 判，引用 Q4 确认记录）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以工具退出 0/团队自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接不同候选/环境/阶段结果。

## 5. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B0 | B0-1–B0-5 齐备；B0 记录/证据/hash；基线红/绿与设计 §4.5/§6.1 一致 | 不进入实施/证据判定；重记 B0 |
| 实施（确定性） | AC-1–AC-22、AC-26–AC-30 适用项 + B1-EV1/EV2/EV3/EV4 满足；T3 新增确定性失败 0/新 skip 0；测试同步落实；typecheck 绿 | 回原 owner 返工；不得以旧 B0/旧候选证据通过 |
| 真实运行 | AC-23–AC-25（P1.2 §6.2 预算/纪律）完成并如实报告；失败/回退保留 | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 全部适用项按本 B1 判定；R8a–R8c 处置记录；变更包/证据链齐备 | 报告 pass/fail/insufficient evidence；不授权发布 |

**复判规则**：
1. 本 B1 写盘后冻结；实施开始后不改标准适配候选；确需变更递增版本并记录理由/影响，受影响证据重判。
2. 候选/B0/设计契约/写集/依赖/夹具/构建/命令/环境变化使受影响证据失效；必须重取并重判；不得只改哈希冒充当前结果。
3. 证据复用仅当候选关联、输入、依赖、契约、命令、环境未变且可关联当前候选；列出复用依据；无法界定影响则不复用。
4. 阶段证据独立保存；B0/确定性/真实运行/B2 不混证；旧 B0/旧变更 B1（含上一变更 v1/v1.1）证据不得冒充本变更当前证据。
5. 发现新旁路/安全问题时按 fail/返工处理，不自行放宽标准；发布/tag、提交/推送/合并未授权。

## 6. 范围限制与披露

1. 本 B1 只覆盖 P1.2 的会话创建准入/审批/Git 只读/角色 Git/审计/测试/真实运行；**不覆盖** P1.6 Q5 的仓库初始化保护应用中介证据（另案）、I6 H01–H11、旧 A/J、T1、上一变更延续项。
2. **Q9 披露**：受保护项目角色 Git 写/初始化很可能仍被注册表级 `inspectInitializationProtection` 拒绝；本变更不放宽，AC-26 负向验证。
3. **F1 读取范围**：shell 只读 Git 不套用 `git_query` 的 readableOids/publication-proof，可读任意完整 OID/历史；`git log` 无目标默认 HEAD、`--all` 拒绝；verifier 结构化限制仅约束 `git_query`；已由 P1.2 §0.3/Q1/Q2 与闸门留痕确认；AC-29 判可执行范围。
4. **审计失败**：Q4=deny-non-readonly 为验收目标（审批类放行但审计失败 ⇒ 拒绝）；若客户明确选择 observe，AC-28 作为披露项，不判 pass。
5. **R8a–R8c** 为已知建议级缺口，不阻断；B2 记录处置。
6. 本 B1 只写 `docs/acceptance/`；不修改方案/代码/测试/角色卡/边界；不运行真实模型；不替代客户确认/实施授权。

## 7. 当前状态

- **B1 完成、冻结（实施前）**；AC-1–AC-30、B0-1–B0-5、B1-EV1–EV6 当前全部 `未取证`，不得判 pass。
- 后续由同一独立验收身份在 B0/实现/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并。
- 本 B1 与 I6/旧 A/J/T1/上一变更 B1 分开；发布/tag 不在授权内。
