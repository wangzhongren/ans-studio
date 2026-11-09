# 独立复核记录：团队计划登记 run-ambiguous / baseDigest 合法来源（P1.0）

- 版本：**R1.0，2026-11-09**；ANS 独立复核（Reviewer）独立只读上下文。
- 状态：**复核记录；不是验收结论、不阻断、不实施。** 本次复核未改方案/代码/测试/角色卡/边界；未提交/推送/合并/发布；未运行真实模型/Electron/测试；仅写本记录。
- 复核规则：只作建议；逐项给出可核对依据（file:line）；**不把方案推荐当客户确认**；严重度仅为建议分级（must-fix / general / suggestion），不代表验收判定。
- 结论（摘要）：**建议修订后提交。** 方案方向（应用侧派生 `baseDigest`/`plan.sha256` + 宿主绑定任务 run + 原样保留 `run-ambiguous` 语义）、根因引用、勘误、写集/边界与 judge/文档格式串行安排核实为真；存在 **1 项 must-fix**（§2.3「归一化后 requestDigest 全部用 resolved」与既有先序重放检查（`apply-journal.ts:2865/:2874-2879`）及「缺省值 payload」的同 operationId 重放/幂等不自洽，按字面实施会破坏重放语义或既有 :427-428 测试），另有 2 项 general（I6「旧调用逐字不变」与 §2.2 有意加严的口径冲突；`baseDigest` 可选化在 :2863 与 7 处回执回显的机械触点未列举）与 6 项 suggestion。M1 修订前不建议进入 B1/实施派发。

---

## 0. 复核对象、依据与基线（快照）

| 项 | 值（实测核对） |
|---|---|
| 方案 | `docs/planning/2026-11-09_design_team-plan-run-binding.md`；**401 行 / 49,301 bytes / SHA-256 `1d9bbaee61d036b4076342a46f9bfefbf4426c8ba2d39307dcab90db7576b668`**（`wc -lwc` 与 `sha256sum` 实测，与任务给定一致） |
| 缺陷记录（最终版，含客户修正裁定） | `docs/communication/2026-11-09_defect_team-plan-run-ambiguity.md`；**40 行 / 4,669 bytes / `ae403883f8d5edb46b5a3b6c15aeb366c1fc663d92eb14ba0188e534fd9a13b3`**（实测一致） |
| RR5 记录 | `角色卡/测试/docs/change/2026-11-09_RR5_snake-restore-proposal-flow.md`；**201 行 / 27,140 bytes / `af8f200865742cc63f94e203b8e22442bc9d60ea32482094d44497a7e85f3a1a`**（实测一致） |
| RR5 关键原件 | `complete-team-plan-receipts.jsonl` `db9a1c1d70ca25c3c6299ae9914f3310152a7de4284ba78e67ede13230ab24e6`；convener 报告 `6f61eb74….json` `7a544a19ca77e2869c3e1fd4b00897d3a67199a055cbd5829768695627e2f2f2`；`pre/target-manifest-pre.json` `8a662af9342a57aa8d6328c13675ab67b72303cf546f922c6fc298f0caeedcc8`（均实测一致） |
| 并行 judge 方案 P1.2 | `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`；**686 行 / 88,988 bytes / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`**（实测一致）；其实现 W-J1–J5 在本工作树未提交（`git status` 24 文件 `+1299/−73`） |
| 并行文档格式 P1.2 / B1 | 方案 **979 行 / 146,555 bytes / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`**；B1 = `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md` **`bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe`**（均实测一致） |
| 提案卡修复（已提交） | HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`，分支 `feat/plan-escalation-card`）——与方案基线声明一致 |
| 预授权 | `docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（**38 行 / 3,418 bytes / `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`**，实测一致） |
| 角色边界快照（写集核对用） | `角色卡/运行时核心/boundary.yaml`（`src/model/runtime.ts` :6、`src/provider/runtime/schema.ts` :38、`test/runtime-core/` 目录）、`角色卡/编排/boundary.yaml`（`src/pipeline/orchestration/trunk-runtime.ts` :50、`src/service/trunk/` 目录、`test/编排/` :83）、`角色卡/convener-code/boundary.yaml`（`src/common/roles/convener/`、`test/roles/convener/` 目录）、`角色卡/桌面窗口/boundary.yaml`（`app/desktop/` 目录、`test/桌面应用/chief-workflow.test.ts` :127） |

方法：逐条阅读方案并按其 `file:line` 声明以只读方式核对代码；重算全部引用哈希（方案/缺陷/RR5/并行方案/预授权/HEAD/tree）；对工作树未提交 judge 集做 `git diff` hunk 范围核对；逐文件核对写集与各角色 boundary §1；对 RR5 证据抽查原件（回执、convener 报告、pre target manifest、runs-pre、tasks-final）。未运行测试/typecheck/真实模型/Electron。行号均为当前检出（HEAD `fb1aa39e` + judge 未提交集）实测，judge 合并后漂移，以符号名/文本锚点为准。

---

## 1. 结论摘要

方案把根因收敛为两件应用侧事实并分别处置：`baseDigest`/`plan.sha256` 改为应用在 `completeTeamPlanInternal` 提交点派生、模型值只作断言；团队计划登记的规范 run 由桌面宿主按当前真实受派任务的 run 绑定并记入 `source.runId`/回执；`project_state`/`version-decision` 的 `run-ambiguous` 原样保留。方向与客户最终裁定（团队计划仍归运营；规范路径归文档格式变更；run-ambiguity/baseDigest 由应用侧解决）、与代码事实（模型必填 vs 角色无来源的结构性必败；`plan-path-invalid` 来自 convener preflight）均一致；根因第 4 条「无 effective trunk 是下一道前置、不 bootstrap」如实披露，RR5 证据口径正确（「8」为任务计数，`runs/` 实为 6 个 manifest）。

以下必须先修订或澄清：

1. **M1（must-fix）归一化与重放语义不自洽**：§2.3 要求 `requestDigest`/journal message 用 `resolved`，但 `requestDigest` 在 `apply-journal.ts:2865` 先于：先序 operation 重放分支（`:2874-2879`）与：effective 读取/派生（`:2881-2896`）。派生值依赖当前 effective trunk；一次成功 apply 后 trunk digest 已变（`:2913-2916`），同 operationId 的**缺省值 payload 重放**将派生不同值 → `plan-operation-conflict`，而 I6/P-8 的逐字兼容只钉了旧式显式 payload；若把归一化前移到重放分支之前以"迁就" resolved 摘要，则既有回归 `test/编排/direct-role-capabilities.test.ts:427-428`（删计划文件、trunk 已 +1 后重放同 operationId）会在 `:2883` 先被 `plan-base-conflict` 拒绝。Git prepare→commit 侧同一问题以 store 的 `journalDigest` 绑定（`git-trunk-store.ts:712`、`:934-937`）形式出现。需在方案内择一并写清重放匹配规则。
2. **G1（general）I6 与 §2.2 的加严冲突**：§2.2 新增「frozen 与 live 同时存在且不一致 ⇒ 拒绝」并自述「比现状更严」；现状 `frozen` 仅在「同路径且 sha 等于声明值」时优先（`:2894-2896`），否则回退 live。存在旧式正确调用（声明 sha 等于 live，但 effective 快照同路径留有旧版本字节）由"接受"变"拒绝"的角落，与 I6「旧调用行为逐字不变」直接矛盾，B1 兼容证据口径需单列。
3. **G2（general）缺省化机械触点未列举**：`:2863` 的身份/baseDigest 形状检查对 `undefined` 会直接 `plan-identity-invalid`（按 §2.1 伪代码字面实施即踩）；`:2858`、`:2861`、`:1244`、`trunk-runtime.ts:476-477`、`:498-499`、`:824-825`、`:836-837` 七处回执回显把 `baseDigest` 传入 `string | null` 字段，可选化后必须 `?? null`，否则 typecheck 不过；W3/W4 只列了派生与 `convenerTeamPlanFacts`。

其余 suggestion（S1–S6）：`.toLowerCase()` 归一化属旧调用行为变化；宿主新增回执码 `plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict` 未登记且与 `trunk-item-invalid` 口径需对齐；Q10 回执分层回显未覆盖 preflight/Git 层；§2.2「frozen 在、live 不可读」与 I2 措辞需对齐；RR6 需先写清预期分支（现 target 无 effective trunk，主判据前置不成立）与预算预批留痕、P-9 与已知红的关系；若干行号/基线小项。

**复核结论（建议）：修订后提交；M1 修订前不建议进入 B1 与实施派发。** 本记录不构成验收结论。

---

## 2. 问题清单（M1、G1–G2、S1–S6）

严重度：must-fix（建议修订后方可提交/派发）> general（应修订/澄清）> suggestion（建议改进，不阻断）。

| # | 严重度 | 位置（方案行） | 问题摘要 |
|---|---|---|---|
| M1 | **must-fix** | §2.3 `:167-176`（尤其 `:174-175`）；§2.0 I6 `:129`；P-8 `:304`；对照 `apply-journal.ts:2865/:2874-2879/:2881-2896/:2900-2916/:2926`、`git-trunk-store.ts:712/:934-937` | 「requestDigest 用 resolved」与先序重放分支/派生顺序不自洽：缺省值 payload 成功后同 operationId 重放会被 `plan-operation-conflict` 拒绝；前移归一会破坏既有 `:427-428` 重放测试；Git prepare→commit 的 journalDigest 绑定放大该问题 |
| G1 | general | §2.0 I6 `:129`；§2.2 `:164`（「比现状更严」）；P-6 `:302` / P-4 `:300`；对照 `apply-journal.ts:2894-2896` | I6 声称旧调用逐字不变，但 §2.2 有意把「frozen 同路径旧字节 + live 命中声明」的旧调用由接受改为 `plan-hash-drift` 拒绝；兼容证据口径需单列「有意加严」 |
| G2 | general | §2.1 伪代码 `:134-143`；§2.6 表 `:203-211`；W3 `:258`、W4 `:259`；对照 `apply-journal.ts:2863/:2858/:2861/:1244`、`trunk-runtime.ts:476-477/:498-499/:824-825/:836-837` | 缺省化在 `:2863` 形状检查与 7 处 `baseDigest` 回显触点（`?? null`）未列举；按伪代码字面实施会 `plan-identity-invalid`/typecheck 失败 |
| S1 | suggestion | §2.1 `:141`；§2.2 `:159`；对照 `apply-journal.ts:2883/:2896` | 伪代码引入 `.toLowerCase()` 比较；现状为严格相等（大写 hex 旧式声明现被拒、实施后变接受），属 I6 之外的旧调用行为变化，需保留严格或显式声明 |
| S2 | suggestion | §2.4 `:182-186`；P-12 `:308`；Q8 `:358`；对照 `apply-journal.ts:2472/:2476/:2884` | 新宿主回执码 `plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict` 全仓未定义；`inspectAssignedTask` 失败原码为 `trunk-item-invalid`，P-12 两种口径需对齐并说明是否登记稳定码 |
| S3 | suggestion | Q10 `:360`；§2.1 `:146`；对照 `trunk-runtime.ts:836-837/:476-477`、`apply-journal.ts:561` | Q10 只规定 service 层回显 derivedBase；preflight/Git 身份拒绝发生在 effective 读取前，只能回显 `input.baseDigest ?? null`——分层回显口径需写明 |
| S4 | suggestion | §2.0 I2 `:125`；§2.2 `:154-157`；对照 `git-trunk-store.ts:738`（`...legacy`） | 伪代码在「frozen 存在、live 缺失/不可读」时接受 frozen 且不拒绝，与 I2「计划不可读一律拒绝」措辞冲突；需一句话对齐语义 |
| S5 | suggestion | §4.2 `:315-324`；§2.9 `:242-246`；Q6 `:356`；P-9 `:305`；对照 `角色卡/测试/docs/change/2026-11-09_RR5_evidence/pre/target-manifest-pre.json`、B1 v1.1 A.1 第 11 项 | RR6-A 前置（effective trunk）在现 target 不成立（实测仍无 `manifest.json`）；「预算已预批」仓库内无独立留痕；P-9 落在已知红文件 `git-capabilities.test.ts`，需说明与预期分支/红因的关系 |
| S6 | suggestion | §1.2 `:79`；§2.7 `:228`；§3.1 `:270` | 轻量事实更新：`completeTeamPlanInternal` 实际 `:2860-2948`（非 `:2858-2935`）；marker 期望实际 `classify-shell.ts:656-664`（非 `:654-665`）；T5 基线「59/47/12」为修复前基线，应按 B1 v1.1 A.2 改后基线或实施时重测 |

---

## 3. 逐项依据与建议

### M1（must-fix）§2.3 归一化 / `requestDigest` / 先序重放不自洽

**位置**：方案 §2.3 `:167-176`（伪代码 `:170-172`，断言 `:174-175`）；I6 `:129`；P-8 `:304`；与 §2.1 `:134`、§2.2 `:149` 联读。

**依据（现状代码）**：

- `apply-journal.ts:2865`：`const requestDigest = directHash({ input, actor });` —— 在任何 effective 读取/派生**之前**计算；`directHash = sha256(canonicalJson(...))`（`:558`），键序无关，但对**取值**敏感。
- `:2874-2879`：先序 operation 重放分支用 `prior.value.message !== \`team-plan:${requestDigest}\`` 判定同一请求，命中则 `decorate(await finishDirect(...))` 返回既有回执——**不读 effective、不派生**。
- `:2881-2896`：派生所需的 effective snapshot 与计划字节都在重放分支**之后**才读取。派生值 `derivedBase = current.digest`、`derivedSha = actual.sha256` 依赖**当前** trunk 状态。
- `:2900-2916`：非 NoOp 成功 apply 会 `trunkVersion + 1` 并重算 `next.digest`——一次成功后 effective digest 已变化。
- `:2926`：`PreparedTeamPlanCommit.input = structuredClone(input)`；Git 路径 `prepareTeamPlanCommit`（`:1232-1241`）→ `commitPreparedTeamPlan`（`:1243-1258`，`:1256` 以 `value.input` 重放）；store 以 prepare 时 journal 的 `gitBusinessRequestDigest` 绑定（`git-trunk-store.ts:712` 提交路径、`:934-937` `writeOperation`、`:1031-1039` mutation store 构造）。
- 既有回归：`test/编排/direct-role-capabilities.test.ts:411-431`——`:427-428` 在 `fs.unlink(planPath)` **之后**、trunk 已 +1 的基线上用**旧式显式 payload** 重放同 operationId 并 `deepEqual` 既有回执。方案 `:175` 称该测试"可直接回归"。

**问题（两个互斥的实施路径都坏）**：

1. 严格按 §2.3 字面（`requestDigest` 改用 `resolved`）：`resolved.baseDigest` 依赖当前 effective digest。首次成功 apply 后 trunk digest 已变，模型以**相同缺省值 payload** 重试同一 operationId（例如回执通道失败后的重试）时，派生值不同 → `requestDigest` 不同 → 在 `:2876-2877` 被 `plan-operation-conflict`（"Operation id is already bound to another request"）拒绝，**拿不回既有回执**。P-8 的"同计划重复登记/重放 ⇒ no-op 且回执一致（既有断言原样保留）"只对旧式显式 payload 成立，I6 同样只承诺旧调用——缺省值 payload 的重放语义在方案中是空白且按字面实现是坏的。
2. 为让 `requestDigest` 真的"用 resolved"而把归一化前移到重放分支之前：重放在 `:2883` 就会先撞 `plan-base-conflict`（derived=published digest ≠ `input.baseDigest`=initial digest），既有 `:427-428` 测试**直接失败**；且所有旧式重放在 trunk 前进后都退化为拒绝，破坏 I6 的"可重放、幂等/NoOp 语义不变"。
3. Git 路径：若 prepare 与 commit 使用不同形态（original raw vs resolved）计算 `requestDigest`，`writeOperation` 的 `journalDigest` 绑定（`:934-937`）会 `denied`；若统一用 resolved，则第 1 条的跨调用重放问题同样存在。

**建议**（择一写入方案后再实施）：

- **方案 a（推荐，最小语义变化）**：`requestDigest` 与先序重放匹配**保持以"提交原样 input"计算**（维持在 `:2865`、先于任何派生）；`resolved` 只用于 marker（`:2907-2909`）、`target.execution.teamPlan`（`:2900-2901`）、回执装饰（`:2867-2871`）与 commit 断言。漂移防护由既有 CAS（`:2934-2935`）与 Git store 的 manifest/journal 绑定（`git-trunk-store.ts:712/:934-937/:1031-1039`）承担——本复核已核实这两道都会 fail-closed；`PreparedTeamPlanCommit.input` 保留提交原样（或在 journal 额外存 resolved 快照并说明用途）。
- **方案 b**：保持 resolved 基底，但把重放匹配从"message 摘要逐字相等"改为"先序 operation 存在且本次提交的**声明字段**（flowId、plan.path、plan.version、runId、任何显式提供的摘要）与 journal 中对应的 resolved 值一致 ⇒ 返回既有回执"。
- 两种都需：P-8 增加"缺省值 payload 成功后同 operationId 重放"与"Git prepare→commit 后重放"两个变体；在 I6 明确旧式 `team-plan:<digest>` message 字节不变的回归锚点；B1 逐条记录"payload 形态"。

### G1（general）I6「逐字不变」与 §2.2 有意加严冲突

**位置**：§2.0 I6 `:129`；§2.2 `:164`（"新增 frozen 与 live 同时存在且不一致 ⇒ 拒绝（比现状更严，符合 drift fail-closed）"）；P-6 `:302`、P-4 `:300`。

**依据**：现实现 `frozenPlan = old.files.find(file => file.path === input.plan.path && file.sha256 === input.plan.sha256)`（`apply-journal.ts:2894`）——冻结字节**仅在 sha 等于声明值**时被采用；否则读 live 并要求 `live.sha256 === input.plan.sha256`（`:2895-2896`）。方案 §2.2 改为"同路径即取 frozen"，并新增 frozen/live 不一致拒绝。

**影响**：旧式调用中，"声明 sha 正确等于 live 字节、但 effective 快照同路径留有另一版本字节"的角落：现状**接受**（走 live），方案实施后**拒绝**（`plan-hash-drift`）。这与 I6 的"旧调用（提供全部值且正确）行为逐字不变"直接矛盾；若 B1 按 I6 字面做兼容证据，该角落会被误判回归。

**建议**：把 I6 改为"无 frozen/live 漂移时逐字不变"；在 §2.6 兼容矩阵与 B1 §4.3 单列"有意加严"行（旧式 + 漂移角落：接受 → `plan-hash-drift`），并在 P-6 旁加对应说明/负例，避免兼容证据按"逐字不变"误判。

### G2（general）缺省化机械触点未列举：`:2863` 形状检查与 7 处回执回显

**位置**：§2.1 伪代码 `:134-143`（只覆盖 `:2881-2884`）；§2.6 表 `:203-211`；W3 `:258`、W4 `:259`。

**依据**：

- `apply-journal.ts:2863`：`if (actor !== "convener" || ... || !/^[a-f0-9]{64}$/i.test(input.baseDigest)) return reject("plan-identity-invalid", ...)`。`test(undefined)` 为 `false` ⇒ **按 §2.1 伪代码字面实施（只在 `:2881-2884` 做派生/断言）会让所有缺省 `baseDigest` 的调用先在 `:2863` 被 `plan-identity-invalid` 拒绝**。方案 §1.2 `:79` 把 `:2863` 列为现状检查，但 §2.1/§2.3 未把"改为可选形状校验"列为改动点。
- 回执回显：`apply-journal.ts:2858`（`completeTeamPlan` 包装的 `plan-preparation-only`）、`:2861`（`reject` 闭包）、`:1244`（`commitPreparedTeamPlan` invalid）、`trunk-runtime.ts:476-477`（Git 身份拒绝）、`:498-499`（Git `fail`）、`:824-825`（abort）、`:836-837`（preflight 拒绝）——均为 `baseDigest: <string>` 传入 `string | null` 字段；`CompleteTeamPlanInput.baseDigest` 可选化后必须 `?? null`，否则 `npm run typecheck` 失败。
- `trunk-runtime.ts:626-627` 注释"工具 schema 已保证 operationId/flowId/baseDigest/plan 形状"需同步。

**建议**：§2.1 伪代码补 `:2863`（`input.baseDigest === undefined || /^[a-f0-9]{64}$/i.test(input.baseDigest)`）；W3/W4 行内列出上述回显触点（同文件机械改点）；把 `npm run typecheck` exit 0 作为 B1 必过项（方案 §4.1 已含，此处补改动面）。

### S1（suggestion）`.toLowerCase()` 归一化是旧调用行为变化

**位置**：§2.1 `:141`（`input.baseDigest.toLowerCase() !== derivedBase`）、§2.2 `:159`（`input.plan.sha256.toLowerCase()`）；对照 `apply-journal.ts:2883/:2896`（严格相等，无 case fold；而 `:2863` 形状检查接受大写）。

**问题**：现状下"大写 hex 且取值正确"的旧式声明会在 `:2883`/`:2896` 被拒（形状通过、值比较失败）；伪代码加 `.toLowerCase()` 后变为接受。这是 I6 之外的旧调用行为变化（向好的方向，但未声明）。

**建议**：保留严格相等（低风险，且与现行为逐字一致），或在方案中显式声明该归一化并把大写正/负例写入 P-2/P-3。

### S2（suggestion）宿主新增回执码与既有码口径

**位置**：§2.4 `:182-186`（`plan-flow-conflict`/`plan-run-conflict`/`plan-task-changed`）；P-12 `:308`（`plan-task-unavailable`/`plan-task-changed`）；Q8 `:358`。

**依据**：本复核全仓 grep：`plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict` **无任何定义**；`plan-run-conflict` 已存在（`apply-journal.ts:2884`）可复用。`inspectAssignedTask` 失败原码为 `trunk-item-invalid`（`apply-journal.ts:2472`、`:2476`），而 §2.4 步骤 2 又写"任务已关闭/不存在/非本角色 ⇒ trunk-item-invalid"，与 P-12 的 `plan-task-unavailable` 是两种口径（前者是 inspect 失败直通，后者是宿主无 `origin.taskId` 的本地前置）。

**建议**：在 §2.4 明确两种情形的码（本地前置 vs inspect 直通），并说明新码是否作为稳定回执码登记（若是，建议同步 `contract_check` 拒绝映射/docs，或按"宿主层临时码"声明）。

### S3（suggestion）Q10 回执 `baseDigest` 的分层回显口径

**位置**：Q10 `:360`；§2.1 `:146`。

**依据**：方案规定"effective 读取后失败一律回显 derivedBase；读取前失败回显 `input.baseDigest ?? null`"——这是 **service 层**口径。但 preflight 拒绝（`trunk-runtime.ts:836-837`）与 Git 发布身份拒绝（`:476-477`）发生在读 effective 之前，只能回显 `request.baseDigest ?? null`；同一逻辑请求在不同层失败时回执 `baseDigest` 可能不同（null/模型自报 vs 实际 digest）。`directFailure` 与 `DirectActionReceipt.baseDigest` 已允许 null（`apply-journal.ts:561`；`src/model/trunk.ts:571-585`）✓。

**建议**：Q10 补一句分层口径（preflight/Git 层回显 `input.baseDigest ?? null`，仅 service 层在 effective 读取成功后回显派生值）；RR6-B/C 观察回执时按层核对，不做"回执不一致"误判。

### S4（suggestion）§2.2「frozen 存在、live 不可读」与 I2 措辞对齐

**位置**：I2 `:125`（"计划不可读…一律拒绝"）；§2.2 伪代码 `:154-157`。

**依据**：伪代码 `actual = frozen ?? (live?.ok ? live.value : undefined)`，drift 仅在 `live?.ok` 时检查——frozen 存在而 live 缺失/不可读时**采用 frozen 且不拒绝**。这对"已登记的同一计划在 effective 快照中已冻结"的 NoOp/重登记语义是合理的（快照字节即生效依据），但与 I2 的"不可读一律 fail-closed"字面冲突。另注意 Git 端点 `store.readProjectFile` 来自 fs store 的 `...legacy` spread（`git-trunk-store.ts:727`），读的是工作区 live 文件——与"live 漂移检测"设计一致。

**建议**：在 §2.2/I2 写明"effective 快照内已有该 path 的冻结字节时以其为准；live 读取失败不构成拒绝；live 存在且与 frozen 不一致则拒绝"。

### S5（suggestion）RR6 可判性前置

**位置**：§4.2 `:315-324`；§2.9 `:242-246`；Q6 `:356`；P-9 `:305`。

1. **主判据前置不成立**：RR6-A 以"若前置齐备（规范路径 + effective trunk）"为条件；本复核实测现 target `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target\.ans\trunk\` 仍只有 `initialization-sources/` 与 `snapshots/`，**无 `manifest.json`**（与 RR5 pre 态一致）。因此 RR6 的第一个决定性结果几乎必然是 RR6-B（`trunk-unavailable`/`plan-basis-incomplete`）。建议在派发记录中预先写明该预期，明确 happy path 由 P-1/P-9/P-13 确定性覆盖；**不要**为触发 RR6-A 临时 bootstrap（那属 §5.1 升 T3 触发器）。
2. **预算预批留痕**：方案称"协调方已预批"（`:318`），仓库内未见独立记录（memo 与通信记录无 RR6 预算条目）。建议以协调方书面记录为准，RR6-D 证据绑定该记录。
3. **P-9 与已知红**：`test/编排/git-capabilities.test.ts` 的「Git team plan publication…」（:514）是 B1 v1.1 A.1 第 11 项基线已知红、同文件 2 个 skip（:33）。P-9 要求 prepare→commit 新用例通过；建议在 B1 说明该红因与本变更路径无关的证据或防护（本复核未运行测试，无法确认红因是否波及新路径）。

### S6（suggestion）轻量事实/口径更新

- §1.2 `:79`：`completeTeamPlanInternal` 标注 `:2858-2935`；当前检出实际 `:2860-2948`（关键锚点 `:2881/:2883/:2884/:2894/:2907/:2918/:2926` 均逐一对上）。方案已声明以符号名/文本锚点为准，建议顺手更新范围。
- §2.7 `:228`：`classify-shell.ts:654-665` 的 marker 期望实际在 `:656-659`（policy 检查 `:664`）。
- §3.1 `:270`：T5 基线「chief-workflow 59/47/12」是 B1 v1.1 附录 A.2 的**修复前**基线；`fb1aa39` 合入后当前基线应由实施时重测（A.2 记录改后 63/47–48/15），建议改口径为"实施时重测 + 增量不回归"。

---

## 4. 已核实项（按复核重点）

### 4.1 根因完整性/准确性（重点 1）

- **契约错位属实**：`src/model/runtime.ts:2468-2474` `CompleteTeamPlanInput = { operationId; flowId; runId?; baseDigest: string; plan: { path; sha256; version } }`（`baseDigest`/`plan.sha256` 必填）；`src/provider/runtime/schema.ts:50-52` `required: ["operationId","flowId","baseDigest","plan"]`、`plan` 默认全必填；`src/provider/runtime/tools.ts:4279-4309` 的 `directShapeError` 按 schema 机械校验（required `:4301`、未知键 `:4303`、pattern `:4286`），`:4326` 调用、`:4333-4334` 校验入口——与方案 §1.2 一致。
- **`plan-path-invalid` 来源属实**：convener 模块 `checkTeamPlan`（`src/common/roles/convener/index.ts:405-440`）先按 `TEAM_PLAN_FACT_KEYS`（`:259-266`）检未知键与 hex64/键集（`:410-431`），再按 `docs/scheduling/${flowId}-team-v${version}.md` 精确匹配（`:432-438`）→ deny `team-plan-path-invalid`；`src/pipeline/orchestration/trunk-runtime.ts:641-648` 将其映射为 `plan-path-invalid` 并回显 `request.baseDigest`（`:836-837`）。RR5 回执 `baseDigest=e3b0c442…`（空串 SHA-256）是模型自报值，与 RR5 记录 §6.2/convener 报告原件一致。**该校验确为正确**：RR5 的 `snake-game-team-plan-v1.md`/roster 路径不符规范名。
- **服务层顺序属实**：`:2881` `readEffectiveSnapshot`（`:574-582`，manifest/快照缺失即 `trunk-unavailable`）→ `:2883` flow/digest 精确比较 → `:2884` runId 归属（未提供不消费）→ `:2886` 路径正则 → `:2887-2893` roster/modules → `:2894-2896` 字节哈希 → `:2897-2899` `parseTeamPlan`。因此"即便路径正确，也会在 `plan-base-conflict`（或更早的 `trunk-unavailable`）被拒"成立；RR5 target 的 `pre/target-manifest-pre.json` 中 `.ans/trunk/` 无 `manifest.json`（本复核原件核对；现 target 仍无）。
- **run-ambiguous 语义属实**：`src/common/编排/project-state.ts:710-724`（focus flow 多活动 run 且未指定 runId、或多 pinned 冲突 → blocker，`source:"app"`）；`src/common/编排/version-decision.ts:129-153`（pinned → `run-change-required`；多活动 run 未给/给错 runId → `run-ambiguous`）。团队计划登记**不消费** run 歧义：schema `runId` 非 required、Model `runId?`、服务仅 `:2884` 归属校验；`app/desktop/session.ts:4319` 当前为 `{ completeTeamPlan: direct.completeTeamPlan }` 直通（无宿主绑定）——"应用未绑定任务 run"属实。
- **多 draft 不阻塞 pin 属实**：`src/common/编排/run-manifest.ts:307-319` `findActiveRun` 仅多 pinned 报 `run-pin-active-conflict`（多 draft 取最新，不冲突）；`:658-662` `pinRunUnsafe` 仅在存在不同 pinned 时拒绝。
- **「8 draft vs 6 run/8 tasks」勘误如实**：证据 `runs/` 共 6 个 manifest（`pre/runs-pre.json` 4 个既有 draft + RR5 新建 2 个）；`tasks-final.jsonl` 8 条 `task.created`；`project_state` 的 `unclosed=8/tasks=8` 为**任务计数**。缺陷记录原文"8 个未闭合 draft run"不准确，方案更正为"多个未 pin draft run"正确。
- **无 effective trunk / 不 bootstrap**：与 `readEffectiveSnapshot` 的 fail-closed 一致；bootstrap 通道（VCA `baseTrunk:null`+`bootstrap:true`，`docs/planning/2026-11-04_design_trunk-amendment-model.md:459-460/:490/:513` F30/§4.4）属实且本方案明确不自动触发。
- **角色事实面属实**：`contract_check`（`app/desktop/session.ts:10271-10371`）给 run state/文档 path+截断 12 位 sha（`:10302`）、`teamPlan` 仅 path（`:10304`），无 effective trunk digest/计划 sha256；`evidence_check`（`schema.ts:761-791`）要求显式 `criteriaRef{path,sha256,version}`；convener shell 为 `operator-approve`（`convener/index.ts:93`）；`write_file` 回执无 sha256（RR5 convener 报告 evidence 第 5 条原文）。

### 4.2 方案 A：应用派生/校验（重点 2）

- **派生锚点与失败码**：`:2881`（trunk-unavailable）、`:2883`（plan-base-conflict）、`:2894-2896`（plan-hash-drift）、`:2887-2893`（plan-basis-incomplete/plan-owner-invalid）、`:2897-2899`（plan-structure-invalid）均在案且 fail-closed；I1/I2 与实现路径一致。
- **marker/source/receipt 不变性**：marker（`:2907-2909`）字段集 `{schema, operationId, actorRoleId, flowId, plan, modules, roster}` 与 `classify-shell.ts:656-664` 期望一致；`isDirectActionSource` 允许可选 `runId`（`src/model/trunk.ts:672-678`），plan 分支按字段比对 + `policyEqual(journal.actionSource, source)`（`classify-shell.ts:601-610`）——**W3 在 source 记 `runId` 不破门禁政策，Q4 结论（marker 不变、classify-shell 零参与）成立**。
- **归一化面可行**：`decorate`（`:2867-2871`）、`target.execution.teamPlan`（`:2900-2901`）、source（`:2917-2919`）、`PreparedTeamPlanCommit.input`（`abstract/trunk-service.ts:345-352`；现状 `structuredClone(input)` `:2926`）均可承载 resolved——但摘要与重放的形态问题见 M1。
- **Git 路径**：`executeGitTeamPlanPublication`（`trunk-runtime.ts:475-479`）→ `executeGitBusinessPublication`（`:491-503`）→ `prepareTeamPlanCommit`（`:1232-1241`）→ `commitPreparedTeamPlan`（`:1243-1258`）；store 绑定 fail-closed（`git-trunk-store.ts:712/:934-937/:1031-1039`）⇒ R3（prepare 后漂移）成立的**前提是按 M1 建议裁决形态**。
- **TOCTOU/伪造面**：值在提交点现取（effective + 实际字节），模型值仅断言；路径受正则 + `parseTeamPlan` + roster/modules 一致性三重约束；派生发生在 journal/CAS 事务内，判定充分。
- **方案 B 对比**：§2.8 的契约/写集/正确性/失败面/审计五维对比与 `contract_check` 截断事实一致，结论合理。
- **非 breaking**：schema required 缩减 + Model 字段可选为加法；旧式行为在**无漂移**角落不变（例外见 G1）；内部类型触点见 G2。

### 4.3 规范 run/宿主绑定（重点 3）

- **对照 `selectRunChangeForHandle`**：`session.ts:1414-1428` 的 `current()` 语义（entry/handle 同一、`origins.running` 同一、busy、`!settled`、lifetime/turn 双 abort、`signal?.aborted`）与 §2.4 步骤 1 一致；`:4373` `gitBinding.handle = handle` 且 `:4317-4318` 已在闭包内使用同款 handle；`direct` 于 `:3767` 由 `createDirectRoleRuntime`（trio）创建；`inspectAssignedTask` 已由 `session.ts:75` 从 trunk-runtime 导入——接线可行。
- **`inspectAssignedTask`**（`trunk-runtime.ts:1101-1103` → `apply-journal.ts:2471-2528`）：要求 `task.created` 唯一、`to === actorRoleId`、未 closed、run 存在且 flow 一致、run 状态 draft/pinned；team-planning workSource 分支对 `from/to/planningRunId/runState/documentPreparationSource` 有额外校验（`:2517-2520`）；无 workSourceRef 时落 `:2526` 返回 `kind:"planning"`——RR5 型 convener 任务两类形态均可绑定；失败码 `trunk-item-invalid`。
- **run 记录**：`source.runId` 模型与校验器就绪（`trunk.ts:560-562`、`:666-687`）；成功回执经 `finishDirect` 的 `base`/`source` 携带（`apply-journal.ts:583-599`）。
- **多 draft 不阻塞登记、不自动关闭旧 run、`project_state`/`version-decision` 零改动**：均成立（见 4.1）。
- **CLI 回归面**：`completeTeamPlan` 能力仅 `session.ts:4319` 注入（`direct` 仅 trio `:3767`）；`run-role.ts:1963-1972` 只透传 `input.completeTeamPlan`；govern-session/CLI 不注入 ⇒ Q8 结论成立。

### 4.4 写集/owner/边界与并行（重点 4）

- **逐文件 owner 与 boundary §1 一致**（表见 §0 末行）：W1/W2/T4 → 运行时核心；W3/W4/T1/T2/T6 → 编排；W5/T3 → convener-code；W6/T5 → 桌面窗口。全部命中各自 boundary 的 file/directory 条目（`src/service/trunk/`、`src/common/roles/convener/`、`app/desktop/`、`test/编排/`、`test/roles/convener/`、`test/runtime-core/` 目录与 `test/桌面应用/chief-workflow.test.ts` 单文件）。
- **H1 delta = 0**：无 `角色卡/**`、boundary、roster、卡文本改动；团队计划仍归运营（memo 2026-11-09 客户裁定条目与缺陷记录 §客户裁定一致，本复核核对原文）；W5 仅 convener-code preflight 纯策略。卡文本第 62 行现状（`convener/index.ts:62`："提交版本化团队计划及 path/hash/version、flowId、当前依据摘要"）与新契约偏差属实，Q5"不改卡、以工具描述为执行口径"与客户裁定一致。
- **judge 并行**：本工作树未提交集 24 文件 `+1299/−73`，含 `apply-journal.ts`/`trunk-runtime.ts`/`model/runtime.ts`/`classify-shell.ts`；hunk 范围逐一核实**不触及**本方案区域（apply-journal `:2860-2948/:2471-2528/:1232-1258`；trunk-runtime 仅 import 与 `nominatorRoleDocumentsFacts` `:727-735`；model/runtime 仅 import 与 `:1528/:1798` 区域；classify-shell 仅 `:519-539`）。"judge 冻结/合并后重切基线 + 串行"要求成立。
- **文档格式 P1.2 冲突**：同 `src/model/runtime.ts`、`app/desktop/session.ts`；其方案（`886fef84…`）§10.1/§10.3 与 §6.1 第 8/9 行核实；其自荐排序"提案卡修复 → judge → 本变更（文档格式最后）"与本方案"judge → 本变更 → 文档格式"一致；`test/桌面应用/session.test.ts` 当前不存在（本复核 ls 核实），由其恢复，本方案改用 `chief-workflow.test.ts` 避冲突 ✓。
- **提案卡修复 fb1aa39** 已入库；HEAD/tree 与方案声明一致；T5 文件未被 judge/文档格式占用（工作树内 `chief-workflow.test.ts` 无改动）。

### 4.5 测试/验收（重点 5）

- **矩阵覆盖**：P-1..P-15（14+1）覆盖派生/断言/不可读/漂移/无 trunk/旧调用/NoOp/run 断言/Git prepare-commit/preflight/schema/宿主绑定/多 draft/回归/非规范路径——与题目清单一致；B1 输入（§4.3）含候选身份、旧断言改写逐条记录、确定性/真实运行分层。
- **已知红口径**：B1 v1.1 附录 A.1（`test/编排/**` 22 fail/2 skip，含 `git-capabilities.test.ts:514` 与同文件 `:33` 2 skip）与 A.2（chief-workflow 基线 59/47/12、改后 63/47–48/15）核实；方案引用「22 fail/2 skip」「59/47/12 等」与 A.1 一致（T5 时序见 S6）。
- **运行命令**：`node --test` 逐文件/按目录 + `npm run typecheck` 可执行；本复核未运行。
- **RR6 计划**：目标目录存在（本复核只读确认）；9223/9222 隔离沿用 RR5 可复现；预算数值合理；RR6-A 前置缺失见 S5-1；RR6-B 分类（`plan-path-invalid`→文档格式责任、`trunk-unavailable`/`plan-basis-incomplete`→§2.9 前置、appointment 仅人事）与代码/流程一致（`run-role.ts:1294-1310` 核实"appointment 只能由 nominator 发起"）；RR6-C/D 可判。

### 4.6 T2/T3/Q 清单/披露（重点 6）

- **T2 判定**：方向合理——不改 run 生命周期/冻结/权限/闸门/验收，公共契约为加法可选；先例（`2026-11-03_design_contract-schema-query` 的 T2；文档格式方案同判）支持；升 T3 触发器清单（bootstrap/自动关闭旧 draft/`RunManifest`/marker/`classify-shell`/角色卡/公共契约 breaking）覆盖到位。建议按 Q1 由协调方在派发记录中显式确认档位（本复核不判档）。
- **Q2**（不改 `project_state` 文案）：成立；**Q3**（不清理旧 draft）：成立且与生命周期语义一致；**Q4**（marker 不进 runId）：成立（本复核核实 classify-shell 耦合与 `isDirectActionSource` 容忍）；**Q6**（bootstrap 另立）：成立（`2026-11-04_design_trunk-amendment-model.md` F30 通道在案）；**Q7**（appointment 仅 nominator）：核实成立（`run-role.ts:1294-1310`）；**Q9**（`plan.version` 不派生）：成立（版本是角色声明，且与规范路径强校验 `:2886`/`convener/index.ts:432-438`）；**Q10**（回执 baseDigest）：方向成立，分层口径见 S3。
- **披露**：`deepseek-v4-flash`（RR5 记录 §2 与缺陷记录 §4 原文）✓；judge 工具面既有问题（RR4/S1 在案）✓；无 trunk ✓；"本方案未运行任何真实模型/测试" ✓。建议补一句引用 RR5 的重复提案卡/任务回投环（RR5 §5.3/§10-3，应用回环既有现象），与 RR6 预算与判读口径相关。

---

## 5. 未检查事项与限制（如实）

1. 未运行任何测试/typecheck/真实模型/Electron；确定性结论均来自只读代码核对，不代表可运行性已验证。
2. 行号为当前检出（HEAD `fb1aa39e` + judge 未提交集）实测；judge 合并后漂移，以符号名/文本锚点为准。
3. 未审计 RR5 全部证据文件；抽查了 `complete-team-plan-receipts.jsonl`、convener 报告原件、`pre/target-manifest-pre.json`、`pre/runs-pre.json`、`tasks-final.jsonl`、`summary-final.json` 相关部分，未全量复算 `sha256sums.txt`。
4. 未核对 target 之外的运行根与 memo 之外的沟通记录；RR6 预算预批以协调方记录为准（S5-2）。
5. 未复核 judge/文档格式方案全文，只核对其与本方案写集/冲突段与引用哈希。
6. 未验证 Git prepare→commit 新路径在 `test/编排/git-capabilities.test.ts` 已知红环境下的可过性（S5-3）。
7. 本记录不判验收、不判 B1/RR6 条目；问题严重度仅为建议分级。

---

## 6. 写盘与快照（本记录）

- 本次复核唯一写盘：`docs/planning/2026-11-09_review_team-plan-run-binding.md`。
- 未修改方案、代码、测试、角色卡、边界或其它文档；未提交/推送/合并/发布；未运行真实模型。
- 本记录自身的行数/字节/SHA-256 在写盘后由 `wc -lc` 与 `sha256sum` 实测，随交付回报（文件无法内嵌自身哈希）。

---

## 7. 窄复核（R1.1）：P1.1 对 M1/G1/G2/S1–S6 的逐项闭合核对

- 版本：**R1.1，2026-11-09**；ANS 独立复核（Reviewer）独立只读上下文；**本节为追加，前文（R1.0）原样保留、不改一字。**
- 复核对象：`docs/planning/2026-11-09_design_team-plan-run-binding.md` **P1.1（438 行 / 60,802 bytes / SHA-256 `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b`）**，实测与任务给定一致；P1.0（`1d9bbaee…`）已由 P1.1 取代（其版本记录与 §8 处置表在案）。
- 范围：只核对 P1.1 是否闭合 R1.0 的 M1/G1/G2/S1–S6、修订引入的新事实/引用是否成立、有无新 must-fix；未重做 R1.0 已核实的全量核对。未运行测试/typecheck/真实模型；行号为当前检出实测。
- **结论：M1/G1/G2/S1–S6 全部闭合；无新增 must-fix；建议提交（可进入 B1/实施派发）。** 仅余 4 项 suggestion（N1–N4：引用更正、B1 实施期提醒、文案拆分记录、标题文案），均不阻断。

### 7.1 逐项闭合判定

| # | R1.0 问题 | P1.1 处置落点 | 判定 |
|---|---|---|---|
| M1 | 摘要/归一化/先序重放不自洽 | §2.3（`:176-188`）；I6（`:130`）；P-8（`:319`）；W3（`:273`）；§4.3（`:347`） | **闭合**（核对细节见 §7.2） |
| G1 | I6 与「有意加严」冲突 | §2.2（`:156-174`）；§2.6 兼容矩阵（`:231-232`）；P-4 改写（`:315`）；I2/I6（`:126/:130`） | **闭合**：来源选择恢复为现状等价（见 §7.3） |
| G2 | `:2863` 与 7 处 `?? null` 未列举 | §2.1 伪代码（`:138-141`）与机械触点清单（`:153`）；W3/W4（`:273-274`） | **闭合**：触点与 R1.0 清单逐一相同（`:2858/:2861/:1244` + `trunk-runtime.ts:476-477/:498-499/:824-825/:836-837`） |
| S1 | `.toLowerCase()` 行为变化 | §2.1（`:147/:151`）、§2.2（`:168`）严格相等；P-2/P-3 增大写负例（`:313-314`） | **闭合**：与现状 `:2883`/`:2896` 严格比较一致 |
| S2 | 宿主码未登记、口径不一 | §2.4 步骤 6（`:199`）；P-12（`:323`）；§7-1（`:417`） | **闭合**：`plan-run-conflict` 复用 service 码；inspect 失败直通 `trunk-item-invalid`；仅本地前置用 host-local 码（先例 `run-change-source-unavailable/changed` 实测在 `session.ts:1422/:1428`），登记与否交协调方（§7-1） |
| S3 | Q10 分层回显 | §2.1（`:152`）；Q10（`:378`） | **闭合**：service 前/后与 preflight/Git 身份层三层口径写明，允许跨层差异 |
| S4 | frozen 存在、live 不可读与 I2 冲突 | I2（`:126`）改为「计划字节不可得（既无匹配冻结字节、live 也不可读）」；§2.2 (iii)（`:173`） | **闭合**：frozen 兜底被明示为合法来源 |
| S5 | RR6 主判据前置/预算留痕/已知红 | §4.2「预期分支」「预算留痕」（`:335-336`）；P-9（`:320`）；§7-3（`:419`） | **闭合（B1 义务在案）**：预期 RR6-B、不得临时 bootstrap、预算证据绑定书面预批、P-9 红因关系记入 B1 |
| S6 | 行号/基线小项 | §1.2 `:2860-2948`（`:80`）；§2.7 `:656-659`/`:664`（`:243`）；T5 基线（`:285`） | **闭合** |

### 7.2 M1 关键点复核（可实施性）

- **摘要形态**：`requestDigest` 保持 `:2865`、先于任何 effective 读取/派生；先序重放分支 `:2874-2879` 逐字保留——P1.1 `:178` 与代码一致。`canonicalJson` 语义成立：`directHash`（`apply-journal.ts:558`）实际使用 `trunk-common.ts:12-18` 的同名函数（键排序 + **显式过滤 undefined**），「缺省字段 vs 值为 undefined」哈希一致属实（引用更正见 N1）。
- **resolved 使用面**：仅 marker（`:2907-2909`）、`target.execution.teamPlan`（`:2900-2901`）、`decorate`/`planRef`（`:2867-2871`）；journal `message`/`source`/`targetDigest` 语义不变（`source.baseDigest` 本就是 `current.digest`，`:2918`）——与 P1.1 `:179` 一致。
- **Git prepare→commit**：`PreparedTeamPlanCommit.input` 保持 `structuredClone(input)`（`:2926` 不变）；prepare 与 commit 两侧摘要形态一致；派生值经 prepared `manifest`/`journal`/`targetSnapshot` 承载。commit 重派生须复现 prepared journal 才能过 store 的 `journalDigest`/`manifestSha256` 绑定（`git-trunk-store.ts:712/:934-937/:1031-1039`），任何 effective/字节漂移 ⇒ 绑定拒绝（fail-closed）——与 R3 兼容，裁决成立。另核实：prepare 期 `GitCandidateStore.plan` 为纯计划（`git-command.ts:797`，不写 operation journal），commit 重放不会在先序检查处被自身 prepare 产物误伤。
- **重放四变体**：①缺省 payload 成功后同 operationId 同原样 payload ⇒ 命中 `:2874-2879`（不读 effective/不重派生）返回既有回执；②Git 完成后重放：commit 后 business journal 经 `createProjectTrunkStore` 选中 git store 的 `readOperation`（`git-trunk-store.ts:591-596`）可见，摘要同为原样 input ⇒ 同回执；③payload 形态变化 ⇒ 摘要不同 ⇒ `plan-operation-conflict`（既有语义）；④既有 `test/编排/direct-role-capabilities.test.ts:411-431`（含 `:427-428` 删除后重放）逐字不变。P-8（`:319`）四变体与上述一一对应，旧式 `team-plan:<digest>` 字节锚点写入 I6（`:130/:187`）。
- 结论：R1.0 M1 两条互斥坏路径均已排除，重放/幂等语义在文本与既有实现下自洽。

### 7.3 G1 等价性复核

- **显式 sha 分支与现状逐字等价**：`frozenMatch` 沿用 `:2894` 的「同 path 且 sha 等于声明值」语义（命中即用、**不读 live**）；未命中读 live 并要求 `live.sha256 === 声明值`；两者都不可得 ⇒ `plan-hash-drift`。与现状 `:2894-2896` 的接受/拒绝集合完全相同，R1.0 G1 指出的"旧调用由接受变拒绝"角落**已不存在**。
- **缺省 sha 分支为新式专用**：live 优先、frozen 同 path 兜底、两者皆无才拒绝（P1.1 `:160-166`），与修订后的 I2（`:126`）一致（S4 一并闭合）。
- 兼容矩阵（`:231-232`）新增 (i)/(ii) 等价行；P-4 改写；B1 按 (i)/(ii)/(iii) 三来源选择取证（`:347`）——I6 与 §2.2/§2.6 现已自洽。

### 7.4 新增问题（均为 suggestion，不阻断）

- **N1（suggestion，引用更正）**：P1.1 §2.3 第 1 条（`:178`）把 `canonicalJson` 指到 `src/common/runtime-core/report-provenance.ts:7`；`apply-journal.ts` 的 `directHash`（`:558`）实际使用的是 `src/service/trunk/impl/trunk-common.ts:12-18` 的同名函数（同样按键排序并显式丢弃 `undefined`）。语义结论成立，建议改引 `trunk-common.ts:12-18`（`report-provenance.ts:7` 是另一份相似实现，易误导读者到错误文件）。
- **N2（suggestion，实施期）**：P-9（`:320`）已按 S5-3 把 `git-capabilities.test.ts:514` 既有红项的关系写入 B1 义务；建议 B1 先在同基线复现/定位该红因，再决定 P-9 用例范围（避免在已知红环境上返工）。
- **N3（suggestion，B1 记录项）**：§2.2 伪代码把「不可读」与「哈希不符」拆成两条 `plan-hash-drift` 文案（`:166/:169`）；本复核 grep 核实该旧文案仅存在于 `src/service/trunk/impl/apply-journal.ts:2896` 一处、无测试断言，行为与码不变；若 B1 新增文案断言，按新文案逐条记录。
- **N4（suggestion，文案一致性）**：P1.1 文件标题第 1 行仍为「方案（P1.0）」，与页眉 `:3`/§5.1 `:358`/版本记录 `:19` 的 P1.1 不一致；建议改为 P1.1（一行文案，不阻断）。

### 7.5 本节的限制

- 仅核对 P1.1 对 R1.0 问题的处置及其新引入的事实/引用；R1.0 已核实项（根因、写集/边界、并行串行、Q 清单等）未重做全量核对，P1.1 未改动这些章节的实质内容（抽查 §1/§3/§5 与 R1.0 一致）。
- 未运行测试/typecheck/真实模型；N2/N3 为实施/B1 期事项，本节日径不构成验收判定。

