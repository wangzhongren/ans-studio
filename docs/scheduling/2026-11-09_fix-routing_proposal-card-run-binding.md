# 修复派发路由（只读定位与定性）：提案确认卡「通道未受理」——draft run 未绑定提案物证（2026-11-09）

- **日期**：2026-11-09；**记录角色**：ANS 统筹调度（Scheduler，只读分析上下文）。本文件是修复路由/设计记录；**不是验收结论、不是实施授权**；本轮**未写任何产品/测试/角色卡/边界/方案代码或文档**（仅本记录）。
- **依据**：缺陷记录 `docs/communication/2026-11-09_defect_proposal-card-run-binding.md`（含客户「修复并继续」与最低修复要求 1+2+3+4）；客户裁定（同文件 §「客户修复指示」）；同日在飞的另外两个独立变更（`2026-11-09_intent_judge-delegated-decision-effectiveness.md`、`2026-11-09_intent_document-format-specifications.md`）**不并入本路由、不混写**。
- **真实运行证据（只读引用，未复制）**：运行根 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09`；`rr/evidence/drive.jsonl`、`rr/evidence/ui-card-*.jpeg`；`rr/userData/ans/diagnostics/ans-diagnostics-2026-11-09.jsonl`；目标项目 `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target` 的 `.ans/state/tasks.jsonl` 与 `.ans/runs/*/manifest.json`。该次运行的主进程即本 worktree 的 `app/main.ts`（launcher `rr/launcher.mjs` 默认 `RR_REPO_MAIN` 指向本 worktree），渲染面为 `app/renderer/dist/index.html`（Electron 44 原生 TS 擦除，无额外构建）。
- **基线（本记录写盘时实测）**：worktree `.claude/worktrees/trunk-amendment`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（分支 `feat/plan-escalation-card`）；`git status --porcelain -- src app test` = 0（干净）；下列行号均按该 HEAD 快照实测。

---

## 一、缺陷与证据（事实）

- **症状**：幕僚经策划（rapporteur）在**draft run** 上发出提案确认卡（`requestId=req-e6ff1693840f0ed0`，`cardKind=proposal`，`flowId=snake-game`，选项 `accept`/`revise`）。卡片正常呈现；客户每次「提交选择」均失败，界面显示「回传失败：通道未受理——请重试。」，可无限重试、永不成功；幕僚回合被卡住（工具调用不返回，会话「正在工作」）。
- **创建瞬间失败（主进程诊断原件）**：`02:55:31.207Z` 记录 `event:"chief-decision.failed"`、`errorMessage:"Draft request target is not bound to that run"`、`requestId:"req-e6ff1693840f0ed0"`；紧接着 `02:55:31.208Z` `interaction.presented`（卡仍被呈现）。
- **提交失败（诊断原件）**：`02:55:34.471Z` 起至 `02:58:59Z` 前后，`interaction.response.end` 持续 `ok:false`、`pendingCount:1`（请求保持挂起、可重试）；驱动侧 `drive.jsonl` 自 `02:55:46` 至 `02:59:03` 每 ~11s 一次 `dialog.seen`+`dialog.action:"submitted"`，卡面错误行恒为「回传失败：通道未受理——请重试。」（截图 `ui-card-03.jpeg` 等 20 张）。
- **第二次复核（同一结构性失败）**：幕僚返工后 `03:00:38.777Z` 再次 `chief-decision.failed`、同一 `errorMessage`（`requestId=req-2454680582827a06`）；另于 `03:05:51.023Z`（`req-d5cde26a4c8977c0`，materials 阶段另一原因 `Claude 判断会话只接受 shell 或治理 judge 的只读三件套…`）与 `03:08:37.601Z`（`req-c986eb67f284868e`，再次 draft 绑定失败）重复出现同类 materials 失败并照样呈现卡。**角色侧重新出卡不可能成功**（非模型操作问题）。
- **目标项目账本原件（本次复核新增实测）**：
  - 任务 `t-mw8o1kza-063bb112`（chief→rapporteur）的 `task.created` 绑定 `runId=run-hub-c0ceba36499de3624ecb6822aec9b10071a4082cb5b07c7b`、`runState:"draft"`。
  - 该 run 的 `.ans/runs/run-hub-c0ceba…/manifest.json`：`"documents": {}`、`"execution": {"teamPlan": null, "flow": null}`；同目录另 3 个 `run-hub-*` draft manifest 的 `documents` 亦全部为空对象（4/4 实测为空）。
  - `req-e6ff1693840f0ed0` 的生命周期行：`request.created`（02:55:31.205，含 `taskId`/`intentId`/`cardKind`）→ `request.created` 之后 `request.presented`（02:55:31.224，`to:"customer"`）→ `request.resolved`（02:59:46.216，`by:"customer"`, `choice:"unavailable"`，**无 operatorId、无 decisionId**）→ `request.orphaned`（02:59:46.250，`reason:"restart"`）。其中 `resolved` 行对应通道取消/中止路径（halt/「稍后处理」），**不是客户裁决**，却仍写 `by:"customer"`（见 §七 决策项 D4）。
- **驱动开关事实**：`drive.jsonl` `02:44:02` `nudge.toggles` 记录 `judge-decision-toggle` 为 `checked:true`（「替我决策」开启）；`chief-decision.failed` 事件本身也只在委托开启时才会发生（见 §二-3）。

## 二、根因定位（HEAD 实测 file:line）

### 根因 1（结构性）：draft run 的 `documents`/`execution` 恒空，且**没有任何写点**会在 draft 阶段绑定文档

1. `src/common/编排/run-manifest.ts:322-353` `ensureDraftRun`：新建 draft 时字面量 `documents: {}`、`execution: { teamPlan: null, flow: null }`（`:340-350`）；adopt pending draft 只改 `flowId`（`:333-337`），不写文档。
2. `writeRunManifest`（`run-manifest.ts:252-287`）的**全部**调用方：`:335`（adopt）、`:351`（新建 draft）、`:705`（`pinRun`）、`:830`（`repinPinnedRun`）、`:851`（`closeRun`）、`:948`/`:973`（`applyRunChange`）。**只有 pin/re-pin 会写 `documents`**：`prepareRunPin` 在 `:549-557` 组装七类文档 refs，`pinRunUnsafe` 在 `:697-705` 写入 manifest。draft 阶段没有任何「绑定文档」的写点——`writeRunManifest` 无绑定文档调用方，这是「4 个 draft manifest documents 全空」的直接原因。
3. 换言之：**draft run 在 pin 之前天然没有文档绑定**，这不是数据损坏或模板漏填，而是当前实现的结构性空缺。

### 根因 2：`prepareDecisionEvidence` 的 draft 分支要求「请求目标 ⊆ manifest refs」，draft 恒空 ⇒ 必然失败

1. `src/service/trunk/impl/apply-journal.ts:881-1003` `prepareDecisionEvidence`。draft/pinned 分支在 `:921-954`：`runId` 由 `judge.facts.runId` 或 `metadata.taskId` → `task.created.runId` 解析（`:905-915`）；读取 `.ans/runs/<runId>/manifest.json`，要求 `state` 为 `draft`/`pinned` 且 `flowId` 一致（`:923-927`）。
2. draft 分支（`:941-953`）：从 `run.documents`/`run.execution` 收集 refs（`:942-947`）；**`refs.length===0` 或请求路径不在 refs 内 ⇒ `unavailable("Draft request target is not bound to that run")`（`:948`）**。refs 为空时不可能有任何请求通过。
3. 本次提案卡：`judgeContext` 由 `run-role.ts:1595-1608` 构造，**不含 `artifacts`**（历史字段，运行时无生产者）；`metadata.criteriaRef` 亦无生产者 ⇒ `paths=[]`（`:916-918`）。因此即使不看 `paths`，`!refs.length` 已经失败。错误消息与实际条件完全吻合。
4. **结论**：在委托（替我决策）开启、trio 治理模型下，**任何 run-bound 客户决策卡（proposal/decision/appointment/acceptance）在 draft 阶段都必然在 `host.prepare` 阶段失败**；这不是 snake-game 特有，也不是模型误操作。证据：`03:08:37` 换卡后同一错误。

### 根因 3（fail-open 呈现）：materials 失败被当作「回退客户卡」处理，卡照样呈现且阻塞回合

1. 触发链（桌面）：`tryChiefDecision`（`app/desktop/customer-input.ts:1789-1881`）在 `entry.ctx.governanceModel==="trio"` 且 `delegationState().enabled` 且卡种 ∈ {appointment, acceptance, decision, proposal}（`isChiefBusinessCard`，`:1776-1780`）时进入 `judging`（`:1800-1805`），调用 `host.prepare`（`:1816`）。失败被 `catch`（`:1873-1878`）：**仅记 `diagnostic.error("chief-decision.failed")`，随后 `chiefWaiting(entry, contextUnavailable)`**。
2. `chiefWaiting`（`:1782-1788`）→ `presentNow(entry)`（`:1098-1117`）：置 `entry.state="active"`、`pending.set(id, entry)`、调用 presenter 推卡，并触发 `ctx.onPresented` → `withRequestLifecycle` 的 `markPresented("customer")`（`app/desktop/session.ts:5684-5689` → `recordRequestPresented` `:5203-5207`）⇒ **`request.presented` 在案**；同时卡 payload 带 `judgeNotice=main.customerInput.chief.contextUnavailable`（截图可见「幕僚决策所需的上下文或证据暂不可用。可关闭"替我决策"接管…」）。
3. **回合阻塞**：卡片背后是发起角色（rapporteur）的 `request_choice` 工具调用 promise，`presentNow` 后一直挂在 `pending`，直到被结算/中止 ⇒ 幕僚回合「正在工作」、输入禁用（缺陷记录 §已核实事实 4）。
4. 顺序（实测对齐）：`request.created` 先发起（`session.ts:5625`，异步写盘）→ raw 通道同步进入（`:5691` 构造 context）→ 通道判断/`host.prepare` 失败（02:55:31.207）→ presenter 推卡、`interaction.presented`（.208）→ `request.presented(customer)` 落账（.224，排在 `createdWrite` 之后）→ 客户提交 → `session:operator-response` → `respond` 返回 `ok:false`、请求保持 `pending`（02:55:34.471，`pendingCount:1`）。

### 根因 4（提交被拒）：委托开启时，chief 业务卡被 `respond` 的「单一代执行者」闸拒绝

1. `respondUnsafe`（`customer-input.ts:2497-2575`）：`pending.get(id)` 存在后，若 `isChiefBusinessCard(entry) && governanceModel==="trio" && delegationState().enabled` ⇒ **直接返回 `{ok:false, error: main.customerInput.chief.manualTakeoverRequired}`**（`:2506-2508`，「当前请求由幕僚处理。如需亲自回答，请先关闭"替我决策"。」）。
2. 现状语义：委托开启时该卡**不能**由客户回包结算（同一卡只能有一个执行者），而 `respond` 的「可重试」契约会保留请求、允许界面重试 ⇒ 永不成功的重试循环；只有先关闭「替我决策」再提交，或本轮中止/「稍后处理」，卡才会解挂（现有测试 `test/桌面应用/chief-workflow.test.ts:387-396` 亦断言「委托开启 respond=false；关闭后可 true」）。
3. 观察差异（如实记录，待 B1 钉住）：真实运行界面显示回退文案「通道未受理」（=renderer 在 IPC `result.error` 为空时的回退，`app/renderer/src/chat/chat-store.ts:1989`、`ui.chatStore.operatorChannelNotAccepted`），而 HEAD 该分支返回的 `manualTakeoverRequired` 文案非空。**该差异不改变结构性事实**（`ok:false` + `pending` 保留 + 回合阻塞），但 B 修复须钉住「失败原因非空、如实、可操作」，不得以回退文案掩盖真实原因。
4. **因此**：即使把「提交失败」单看，缺陷也分两层——(a) chief 绑定失败使卡事实上不可由 chief 代决；(b) 失败后卡仍以「可重试」形态呈现，而委托开启时客户回包必被拒。只修 (a) 或只修 (b) 都不满足客户最低要求 1+2。

### 根因 5：没有任何受支持的「把已写文档绑定到 draft run」路径

- 全仓无 draft 文档绑定工具/命令/写点（§二-1 的调用方清单）；`RunManifest.documents` 形状已有（`run-manifest.ts:56` `RunDocKind`、`:98`），但没有生产者。角色按缺陷记录指引「核对并把提案文档绑定到当前 draft run 后重新出卡」**在能力上不可行**，重试必然复现（4/4 draft manifest 为空即证）。

## 三、工作类型与 F1–F9 核实

| 条件 | 核实结论 |
| --- | --- |
| F1 预期行为已在既有确认基线内 | **拟通过（待各所有者与沟通确认）**：客户决策卡在证据真实存在时应被正确承载、可裁决（缺陷记录客户修复要求 2）；chief 宿主绑定失败时不得呈现为可重试/可提交（要求 1）。两者均为既有行为承诺的修复，非新增功能 |
| F2 实际结果偏离且有可观察复现 | **通过**：`drive.jsonl`+诊断原件+目标项目账本/run manifest+20 张截图；两次独立复核、四种 requestId 复现同类 materials 失败；零成功提交 |
| F3 单一现有所有者、全部文件/测试在其 Section 1 内 | **不满足（组合 A+B 跨两角色）**：A=编排（`src/service/trunk/impl/apply-journal.ts`、`src/common/编排/run-manifest.ts`、`test/编排/` 均在 `角色卡/编排/boundary.md §1`）；B=桌面窗口（`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` 均在 `角色卡/桌面窗口/boundary.md §1`）。**拆分后每个子修复各自满足单所有者**；整包是否可走修复快路径由协调方决定（见 §七 决策项 D1），本记录不自行扩权 |
| F4 不新增/改变公开契约、共享抽象、数据模型、跨角色接口、架构分层、模块边界 | **拟通过（有条件）**：A′ 不新增字段/种类，不改 `RunManifest`/`request.*`/IPC 形状，仅收窄 `prepareDecisionEvidence` draft 分支的接受条件（输出形状不变）；B 沿用既有 `declined + notPresented` 通道语义与既有 `cardNotPresented` 工具回执（`src/provider/runtime/tools.ts:1964-1976`）。**若实现需新增 `request.resolved.by` 值、新增 RunDocKind/manifest 字段或新 IPC ⇒ F4 失败，停止并升级变更** |
| F5 不新增 Section 1 外文件；不改角色/边界/治理规则/权限/验收标准 | **通过（按拆分）**：A 写集 ⊆ 编排 §1；B 写集 ⊆ 桌面窗口 §1（新测试文件如需新增，应优先复用已列测试文件；新增未列路径须先由 Governance 更新边界） |
| F6 风险档位 | **T1（每个子修复）/组合为一缺陷两子修复**：单角色内部行为修复，无契约变更；按受影响 unit/integration + 最窄真实路径验证；任一越界升 T2/T3 并停止 |
| F7 沟通记录缺陷与明确修复指令、修复记录先于代码 | **部分具备**：缺陷记录 + 客户「修复并继续」在案；**各所有者须先写** `角色卡/编排/docs/fix/2026-11-09_fix_proposal-card-run-binding.md` 与 `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-run-binding.md`（或经协调方同意的合并记录）**再改代码** |
| F8 既有指派或客户修复指令覆盖该所有者/范围/写集 | **拟通过**：两角色均为既有所有者、Section 1 覆盖写集；客户修复指令覆盖本缺陷；正式派发留痕待沟通/协调方补 |
| F9 独立验收可用，按既有已确认行为/契约+缺陷记录写 B1 | **通过（待沟通启动）**：B1 输入见 §六；B1 须覆盖 A、B 两个写集与真实运行标准；B2 按同一 B1 判 |

**定性结论：修复（fix），T1；但组合 A+B 的 F3 不满足（两角色）。建议按「一个缺陷、两个同源子修复」拆分派发（A 先行、B 紧随），共用一份缺陷记录与一份 B1；是否接受整包走修复快路径、或升级普通流程，交协调方决定。**

## 四、修复方案候选与推荐

### 方案 A′（推荐）：`prepareDecisionEvidence` draft 分支改为「按实际项目字节的应用侧等价绑定」（仅编排）

- **位置**：`src/service/trunk/impl/apply-journal.ts` `prepareDecisionEvidence` draft 分支 `:941-953`（+ 新用例在 `test/编排/`）。不改 `run-manifest.ts`、不写 manifest。
- **做法（语义）**：
  1. **保留 manifest 既有权威**：draft run 的 `documents/execution` refs 非空时，行为与现状一致——请求目标必须 ⊆ refs，refs 文件按 manifest 哈希重读比对，漂移 ⇒ `"Draft run evidence drifted"`（`:949-953`）。
  2. **refs 为空（当前唯一现实形态）时启用等价绑定**：目标物证集合 = 应用计算的 `judge.artifacts` 路径 + `metadata.criteriaRef`（`run-role.ts` 构造的 host 事实，非模型自报）；无 artifact 时用既有 `discoverDecisionFiles(projectRoot, flowId)`（`:854-862`，仅 `docs/product|proposals|contracts` 下 `<flowId>-*` 最新版本化文档）——与无 runId 的既有分支（`:963-978`）同一发现机制。
  3. 对每个目标：`store.readProjectFile` 读取**实际字节**并入 `markers()` 验证集（`:894-900`），哈希随 `complete-snapshot/v1`（`store.prepareSnapshot`，`:994-998`）落入 `decision-<digest>` 证据快照；`baseDigest/evidenceRefs` 绑定本次裁定。结算前 `isCurrent()`→`checkDecisionEvidence`（`:863-879`）重读实际字节比对哈希，漂移 ⇒ 基底过期、chief 拒绝结算（fail-closed）。
  4. **fail-closed 保持**：请求目标既不在 manifest refs、也不在应用计算的 artifact/发现集 ⇒ 仍返回 `"Draft request target is not bound to that run"`；文件不可读/缺失/非文本/超大/含 secret ⇒ 既有错误分类不变；pinned 分支（`:929-940`）与无 runId 分支（`:955-978`）**逐字不动**。
- **等价性论证（对客户要求 2 的「快照+哈希或等价可验证机制」）**：该方案在**出卡/宿主准备当刻（chief prepare 时机）**由应用读取实际项目字节、逐文件 SHA-256、生成不可变 `complete-snapshot/v1` 并把哈希绑定进裁定请求与 drift 复核；目标路径的合法性由应用事实（judge artifacts / 按 flowId 的版本化文档发现）决定，角色/模型无法注入任意路径；manifest bound refs 存在时其权威不被绕过。与「写 manifest」相比，等价之处是**同一时刻、同一字节、同一哈希**的绑定与结算前复核；差别仅是绑定不持久化进 manifest（下方备选 A 保留该形态）。
- **最小性**：单文件 + 测试；不触碰数据模型、pin/run-change/verify 语义；无并发写 manifest 风险。**这是满足要求 2 的最小单片修复**。
- **风险/验证点**：① artifacts/criteriaRef 属 host 计算事实（现状 `run-role.ts:1595-1608` 不产生 artifacts；若将来有生产者须确认非模型输入）——B1 需负例钉住非法目标被拒；② 发现集随新版本文件变化 ⇒ 与既有「新版本使基底过期」语义一致（`isCurrent` 已覆盖，现有测试 `direct-role-capabilities.test.ts:957-965` 同型）；③ 证据字节预算沿用 `DECISION_FILE_LIMIT/DECISION_TOTAL_LIMIT`（`:847-848`）。

### 方案 A（备选）：把文档持久化绑定进 draft run manifest（仅编排）

- 做法：在 `src/common/编排/run-manifest.ts` 增加同 runId 的 `bindDraftRunDocuments`（扫描 flow 最新版本化文档 → 合并 `documents[kind]` → `writeRunManifest`），由 `prepareDecisionEvidence`/`prepareChiefDecisionEvidence` 调用；幂等、并发用 read-modify-write 序列化。
- 优点：字面上「绑定到 run」，后续同 run 的其他卡直接可用；与 `prepareRunPin` 的文档映射同源。
- **不推荐为主方案**：① `RunDocKind` 仅 7 类（`run-manifest.ts:56`），**无法表示验收类物证**（`docs/acceptance/*-criteria|report-v1.md`、`docs/scheduling/*-change-v1.md`）——覆盖不了「及其它客户决策卡」；② 新增 draft manifest 写语义会进入 `run-change oldHashes`/pin 覆盖/并发写路径，需要额外并发与幂等设计；③ 客户要求明确允许「等价可验证机制」，A′ 已满足。若 B1/策划坚持持久化绑定，则 A 可作 A′ 的超集补充（仍不改数据模型；`RunDocKind` 不扩展）。

### 方案 B（必须）：materials 失败 fail-closed 呈现——不呈现可重试卡，真实原因交回发起角色/回合（仅桌面窗口）

- **位置**：`app/desktop/customer-input.ts` `tryChiefDecision` catch（`:1873-1878`）。
- **做法**：
  1. `stage === "materials"`（`host.prepare` 失败）时**不再** `chiefWaiting`/`presentNow`；保持 `diagnostic.error("chief-decision.failed", error, {requestId, stage})`。
  2. 若 `valid()`（仍在 `judging`、未中止、委托修订未变），用既有 `settleEntry(entry, {outcome:"declined", reason:<真实失败原因>（含 prepare 错误原文与可操作指引）>, notPresented:true}, "judging")` 结算：清 `judging`/占位、`resolve` 工具调用 promise、按序 drain 下一张卡。
  3. 角色侧工具回执沿用既有 `cardNotPresented`（`src/provider/runtime/tools.ts:1964-1976`）：「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」——**真实、可操作、不伪造**；无卡面、无 `request.presented`、无客户回包循环、回合不阻塞。
  4. `stage === "execution"`（chief 已运行但未提交有效决定）保持现有回退（`chiefWaiting(noValidDecision)`，卡呈现、可关闭委托后接管）——那是既有设计的降级路径，不属于「绑定失败」。
  5. 响应闸（`:2506-2508`）与客户手批路径（委托关闭）**不改**。
- **与要求 1 的对应**：宿主绑定失败 ⇒ 卡不呈现、不可重试/提交；真实原因交回发起角色/回合；诊断在案。
- **边界**：B 只改桌面窗口文件；不新增 IPC/字段；`request.created → request.resolved(declined, reason, notPresented)` 由既有 `withRequestLifecycle`（`session.ts:5566+`）写出，`request.presented` 不写（`presentedWrite` 保持 null）。账本归属问题见 §七 D4。

### 明确排除的方案

- 放宽 `respond` 闸/自动代选/自动关闭「替我决策」：违反「单一代执行者」与客户主权语义，弱化既有路径（违反要求 3）。
- 仅 A′ 不修 B：未知/不可读/漂移等残余 materials 失败仍会呈现不可提交卡（要求 1 不满足）。
- 仅 B 不修 A′：draft 提案卡仍不可由 chief 承载，「合法出卡可提交」不满足（要求 2 不满足），snake 场景仍停摆。
- 扩展 `RunDocKind`/`request.resolved.by` 枚举：数据模型/契约变更，须升级（缺陷记录 `:38` 快速路径判定明文：「无新增公共契约/数据模型/架构层（如需新增契约则升级为变更并回报）」）。

## 五、Owner / 写集 与派发建议

| 子修复 | Owner（单一） | 写集（Section 1 内） | 修复记录（先于代码，F7） |
| --- | --- | --- | --- |
| A′（等价绑定） | **编排** | `src/service/trunk/impl/apply-journal.ts`；`test/编排/direct-role-capabilities.test.ts`（同文件补用例；如需新测试文件，`test/编排/` 为目录级授权）；如需小助手亦限 `src/common/编排/` | `角色卡/编排/docs/fix/2026-11-09_fix_proposal-card-run-binding.md` |
| B（fail-closed 呈现） | **桌面窗口** | `app/desktop/customer-input.ts`；`test/桌面应用/chief-workflow.test.ts`（改写现有 missing-evidence 用例 + 补用例；`test/桌面应用/` 为逐文件授权，新增文件须先更新边界） | `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-run-binding.md` |

- **禁止**：`src/provider/runtime/tools.ts`（运行时核心）、`app/renderer/`（桌面UI）、`src/model/*`、角色卡/边界/YAML/治理/权限/验收标准、任何 Section 1 外路径；以「放宽校验/丢弃 fail-closed/伪造 presented/by」求绿。
- **协调建议（交协调方决定，不自行扩权）**：同一缺陷拆两个串行子任务——**A′ 先行**（恢复 chief 承载合法性），**B 紧随**（残余失败兜底）；共用一份缺陷记录、一份 B1；两子任务各自单所有者、各自 F3 成立。若协调方要求修复快路径必须单所有者整包，则按普通流程（跨角色变更）补闸门。

## 六、测试与验收

### 受影响既有测试（逐条）

- `test/桌面应用/chief-workflow.test.ts`（B）：`missingEvidence` 分支现断言「materials 失败仍呈现卡 + `judgeNotice=contextUnavailable` + 委托开启 respond=false / 关闭后 true」（约 `:387-396`）——B 后须改为「不呈现（presenter 未调用）、工具回执 `notPresented` 且含真实原因、回合不阻塞；执行阶段回退保持原样」。
- `test/编排/direct-role-capabilities.test.ts`（A′）：`:896-904`（initial 无 run 路径）、`:906-917`（缺失/secret/超大/旧 pinned 拒绝）、`:919-943`（pinned 不可变字节与 isCurrent）、`:945-956`（draft 需 bound document hashes——**保留**：refs 非空时行为不变）、`:957-965`（无 artifacts 发现机制——A′ 复用同机制）。A′ 不破坏上述；需补充新用例（见下）。
- `test/桌面应用/decision-service.test.ts`（回归）：chief host 正常代决/拒/改、respond 委托闸、`manualTakeoverRequired` 行为不变。
- `test/桌面应用/application-line.test.ts`（回归）：普通客户卡 `request.created/presented/resolved` 生命周期与系统通知不变。
- `test/桌面应用/run-change-trigger.test.ts`、`test/桌面应用/pending-card-restart.test.ts`（回归）：`notPresented` 拒发/重启 orphan 语义不被 B 波及。

### 新增测试矩阵（确定性）

| # | Owner | 用例 |
| --- | --- | --- |
| A1 | 编排 | draft run、manifest `documents:{}`、盘上存在 flow 版本化文档（proposal/modules/roster/architecture 等）⇒ `prepareDecisionEvidence` 成功；`context` 含实际字节；`evidenceRefs` 含逐文件 sha256；`isCurrent()===true` |
| A2 | 编排 | 同上，prepare 后磁盘文档变更/新版本出现 ⇒ `isCurrent()===false`、再次 prepare 用新字节（基底过期 fail-closed） |
| A3 | 编排 | draft run、请求目标路径不在应用 artifact/发现集（未知路径/越界路径）⇒ 仍 `"Draft request target is not bound to that run"`（未知仍拒） |
| A4 | 编排 | draft run、目标存在但不可读（权限/缺失/非文本/超大）⇒ 既有错误分类拒绝，不出快照 |
| A5 | 编排 | draft run、manifest 已有 bound refs 且文件漂移 ⇒ 仍 `"Draft run evidence drifted"`（不得被 A′ 绕过） |
| A6 | 编排 | pinned run 全链不变（immutable 字节、live 泄漏拒绝、closed run isCurrent=false）——既有用例原样通过 |
| A7 | 编排 | 无 runId 的 intent/initial 路径不变（发现集、新版本过期、secret/超大拒绝） |
| B1 | 桌面窗口 | materials 失败（委托开启）⇒ presenter 未被调用、无 `request.presented`、`request.resolved=declined+reason`、工具回执 `notPresented` 含真实原因；角色回合正常继续（不阻塞、无重试循环） |
| B2 | 桌面窗口 | 同一失败下 `delegation.set({enabled:false})`/中止/委托修订竞争 ⇒ 不双结算、不遗漏（沿 `valid()` 语义） |
| B3 | 桌面窗口 | 执行阶段「无有效决定」⇒ 既有 `chiefWaiting(noValidDecision)` 卡面回退不变（不误伤） |
| B4 | 桌面窗口 | 委托开启时 respond 闸文案非空且如实（`manualTakeoverRequired`）；委托关闭客户可正常结算（回归） |
| B5 | 桌面窗口 | 失败原因不得为空/不得以回退文案代替（钉住观测运行「通道未受理」现象不再出现为唯一信息） |

- **运行命令/判据**：`node --test test/编排/*.test.ts` 与 `node --test test/桌面应用/chief-workflow.test.ts test/桌面应用/decision-service.test.ts test/桌面应用/application-line.test.ts`（逐文件/等价）+ `npm run typecheck`；记录计数/退出/零新失败零新 skip。

### B1 输入（供独立验收撰写，非本记录授权）

1. **判据基线**：本路由 + 缺陷记录（含客户修复要求 1–4）+ F1/F2 确认；每子修复各自 AC 与负例（上表）。
2. **真实运行标准（B1 必含）**：
   - 场景 S1（核心）：**全新隔离目标项目**产生 draft run → 幕僚/策划发出提案确认卡 → 卡被正确承载（委托开启时 chief prepare 不再 `chief-decision.failed`；chief 代决或回退路径均可，但必须可结算）→ 客户接受（或 chief-delegated 接受）→ `request.resolved` 如实（`by` 与实际来源一致）→ 流程继续（提案后进入冻结/下一闸门）。
   - 场景 S2（fail-closed，可确定性覆盖）：构造真实不可用的材料目标 ⇒ 不发生「呈现可重试卡」；工具回执含真实原因；无 `request.presented`、无无限重试、回合不阻塞。
   - 场景 S3（回归）：pinned run 决策卡路径与意图确认路径不变；委托关闭时客户手批路径不变。
3. **环境隔离（硬约束）**：独立 userData（专用 rr/userData，不写全局 `%APPDATA%/Electron` 共享态）；CDP **端口 9223**；**不得占用正在运行的贪吃蛇实例的 9222 端口及其临时根/目标项目**（只读引用其证据即可）；应用从修复候选 worktree 启动（`app/main.ts` 直跑）。
4. **预算/停止**：客户消息 ≤1；提案卡 ≤1；墙钟 15–20 分钟内；首果即停（首个决定性成功/失败或下一真实门）；出现任何非本缺陷卡、越界写、非预期模型调用 ⇒ 立即停止并如实报告。
5. **证据**：诊断原件（无目标卡的 `chief-decision.failed`；若有 materials 失败须证明未呈现）、目标项目 `tasks.jsonl` 生命周期行、run manifest 与 decision 快照、截图、驱动日志；原件只读引用、不复制。

## 七、风险 / 停止条件 / 待协调方决策项

**停止条件（任一出现即停，回报协调方，不自行扩权）**

1. 实现需要新增/修改公共契约、数据模型（含 `RunManifest`/`RunDocKind`/`request.*`/`request.resolved.by`/新 IPC）或架构分层 ⇒ F4 不成立，升级普通流程。
2. 实现需要修改 `src/provider/runtime/tools.ts`（运行时核心回执文案）、`app/renderer/`（桌面UI）、`src/model/*`，或任何 Section 1 外文件 ⇒ 停止，按跨角色变更处理。
3. 协调方不接受「一缺陷两子修复」的拆分 ⇒ 本路由作废，按普通流程补闸门。
4. 真实运行需要占用 9222/贪吃蛇临时根，或需要改动贪吃蛇运行 ⇒ 停止，改用隔离实例；贪吃蛇运行**不得**被本修复/验证影响。
5. A′ 的等价性被 B1/策划否决（要求持久化绑定）⇒ 转方案 A（仍仅编排），若 A 仍无法覆盖验收类物证 ⇒ 升级变更（需要数据模型扩展）。

**待协调方/沟通决策项**

- **D1（F3）**：接受「两角色、两子修复、共用 B1」的拆分，还是升级普通流程。（本记录建议拆分；不自行派发。）
- **D2（A′ vs A）**：等价绑定（推荐，最小）vs manifest 持久化绑定（备选，覆盖不了验收物证）；由策划/B1 确认等价性论证。
- **D3（B 范围）**：materials 全部失败都 fail-closed（推荐，含证据不可用/漂移/绑定不符），还是仅「绑定」类；执行阶段回退保持既有。
- **D4（账本归属）**：`notPresented` 结算在既有 `withRequestLifecycle` 下会写 `request.resolved.by:"customer"`（本次真实运行 `02:59:46.216 by:"customer", choice:"unavailable"` 即此类，实际非客户裁决）。可选：(a) 接受既有「notPresented + reason、无 operatorId」约定，B1 钉住「不得声称客户拒绝/同意」；(b) 要求诚实的 `by` ⇒ 需要契约变更 ⇒ 升级。**本记录建议 (a)+B1 钉住**，不新增枚举。
- **D5（B1 真实运行目标）**：建议全新隔离目标项目（不改贪吃蛇 target）；如果要求直接在贪吃蛇运行上「修复并继续」，须另行批准对该运行的独占与重启方案（超出本记录范围）。

## 八、状态

- **本记录：只读定位与定性完成；未写代码、未运行测试/真实模型、未派发实施、未提交/推送/合并/发布。**
- 根因：draft run 无文档绑定写点（`ensureDraftRun` 空文档 + 仅 pin/re-pin 写 documents）+ `prepareDecisionEvidence` draft 分支恒拒（`:948`）+ materials 失败 fail-open 呈现（`tryChiefDecision catch` → `chiefWaiting/presentNow`）+ 委托开启时 respond 闸拒回包（`:2506-2508`）⇒ 卡创建即不可承载、呈现即不可提交、重试永不成功、回合阻塞。
- 推荐：**A′（编排，apply-journal draft 分支按实际字节快照+哈希等价绑定）+ B（桌面窗口，materials 失败不呈现、如实回交发起角色/回合）**；T1；F3 组合不满足（两角色），拆分后各自满足。
- 待办：① 协调方裁决 D1/D2/D3（并转告沟通）；② 各所有者先写修复记录（F7）再改代码；③ 沟通启动独立验收写 **B1**（含 §六 矩阵与真实运行标准）；④ B1 冻结后按拆分派发 A′ → B → 确定性验证 → 隔离真实运行 → B2。
