# 提案确认卡「通道未受理」——draft run 未绑定提案物证 修复：实施前验收标准 B1 v1

- 日期：2026-11-09；固定身份：ANS 独立验收唯一主上下文（本文件只做实施前验收标准，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 风险档位：**T1（每个子修复）**；本缺陷为「一缺陷、两同源子修复」：**A′（编排，等价绑定）** + **B（桌面窗口，fail-closed 呈现）**。F3 组合跨两角色，拆分后各子修复单所有者；是否接受拆分（D1）由协调方裁决。D1 未定前本 B1 是**条件性标准**：可作为实施前标准冻结，但实施需协调方放行。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对同一最终修复候选与本版本判定。
- 依据（写盘前实测）：
  - 缺陷记录（客户修复指示/最低要求 1–4）：`docs/communication/2026-11-09_defect_proposal-card-run-binding.md`，**48 行 / 5,529 bytes / SHA-256 `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`**。
  - 修复路由/设计记录：`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，**183 行 / 32,508 bytes / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`**（根因、A′/B、F1–F9、D1–D5、A1–A7/B1–B5、真实运行 9223 计划）。
  - 基线已知红项记录：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md` §F2（**287 行 / 38,867 bytes / `6e98749bd227c6f723e70ace5200d6eaea3c5cebb777ac2ee28f06fe6a3a9b19`**）与 `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` §6.5（**674 行 / 84,483 bytes / `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`**）。
  - 代码事实（只读，HEAD `c1439ce`）：
    - `src/service/trunk/impl/apply-journal.ts` `prepareDecisionEvidence`（`:881-1003`）：draft 分支 `:941-953` 收集 `run.documents/execution` refs；`refs` 空或请求路径不在 refs ⇒ `:948` `"Draft request target is not bound to that run"`；refs 漂移 ⇒ `:949-951` `"Draft run evidence drifted"`；pinned 分支 `:929-940`、无 runId 分支 `:955-978`；`discoverDecisionFiles` `:854-862`；`checkDecisionEvidence` `:863-879`；快照 `store.prepareSnapshot` `:994-998`（`complete-snapshot/v1`、`decision-<digest>`）；`secretEvidence`/预算 `:847-853`、`:985-991`。
    - `src/common/编排/run-manifest.ts` `ensureDraftRun` `:322-353`：新建 draft 字面量 `documents: {}`、`execution: { teamPlan: null, flow: null }`（`:340-350`）；adopt 仅改 `flowId`（`:333-337`）。按路由 §二-1，`writeRunManifest` 的全部调用方只在 pin/re-pin 路径写 `documents`，draft 阶段无文档绑定写点。
    - `app/desktop/customer-input.ts`：`isChiefBusinessCard` `:1776-1780`；`chiefWaiting` `:1782-1788`；`tryChiefDecision` `:1789-1881`；materials/execution 失败 `catch` `:1873-1878`（仅诊断 `chief-decision.failed` 后 `chiefWaiting`）；`settleEntry` `:1064-1090`；`presentNow` `:1098-1117`；`presentEntryNow` `:2044-2050`；`respondUnsafe` 委托闸 `:2506-2508`。
    - `app/desktop/session.ts`：`withRequestLifecycle` `:5566+`；`recordRequestPresented` `:5203-5207`（写 `request.presented`）；`markPresented` `:5684-5689`；`presentedWrite` 为空时不写 presented（`:5792`）；`request.resolved` `:5810-5829`，`by` 归属 `:5822`。
    - `src/pipeline/orchestration/run-role.ts`：`judgeContext` 构造 `:1595-1607`（现状无 `artifacts` 生产者）；`prepareChiefDecisionEvidence` `:3450-3466`。
    - `src/provider/runtime/tools.ts`：`cardNotPresented` 回执 `:1964-1971`；既有使用点 `:2265-2273`、`:2654-2662`。`src/model/runtime.ts` `CustomerInputOutcome` decline 分支 `:1101-1119`（`notPresented?: true` `:1118`）。
  - 基线：worktree `.claude/worktrees/trunk-amendment`，HEAD **`c1439ce57430ef783b80a01bb6e6437fcb20cabd`**（分支 `feat/plan-escalation-card`）；`git status --porcelain -- src app test` = **0**（干净）。工作区存在其它未跟踪文档（其它 B1/验收报告），**不属于**本候选写集；候选身份按 changedPaths/manifest 认定，不得把未跟踪文档计入候选或证据。
- 关系：本 B1 只覆盖本缺陷修复；**不修改**其它 B1、其它在飞变更（`2026-11-09_intent_judge-delegated-decision-effectiveness.md`、`2026-11-09_intent_document-format-specifications.md`）与已验收候选；不改变公共契约；发布/tag 不在授权内。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

本缺陷的两个同源子修复（A′ 编排等价绑定、B 桌面窗口 fail-closed 呈现）、合并场景（draft 提案卡可承载并可结算）、既有路径回归、确定性测试矩阵与隔离真实运行；判据以缺陷记录客户最低要求 1–4 与修复路由为准。

### 0.2 必须保留的契约/边界

1. **不得**修改公共 schema、数据模型、共享抽象、跨角色接口、架构分层：`src/model/*`（含 `src/model/runtime.ts` 的 `CustomerInputOutcome`）、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`、`src/provider/**`（本修复无授权写点）、`src/pipeline/orchestration/run-role.ts`、`app/desktop/session.ts`、`src/common/编排/run-manifest.ts` 均要求 diff 0；不改 `RunDocKind`、`request.resolved.by` 枚举、`request.*`/IPC 形状。
2. **A′ 写集（编排）**：`src/service/trunk/impl/apply-journal.ts`；`test/编排/`（目录级授权；优先在既有 `direct-role-capabilities.test.ts` 补用例）；如需小助手，仅限 `src/common/编排/`。**不写** run manifest（`documents` 保持空对象、manifest 字节/哈希不变），不改 `run-manifest.ts`。
3. **B 写集（桌面窗口）**：`app/desktop/customer-input.ts`；`test/桌面应用/chief-workflow.test.ts`（改写既有 `missingEvidence` 用例 + 补用例）。`test/桌面应用/` 为逐文件授权；**新增测试文件须先由 Governance 更新边界**，否则只能复用/改写已列文件。回归文件（`decision-service`/`application-line`/`run-change-trigger`/`pending-card-restart` 等）只读执行，不改断言。
4. **禁止**以放宽校验、丢弃 fail-closed、伪造 `request.presented`/`by`/`operatorId`、自动关闭「替我决策」、放宽 `respond` 闸、删除/弱化既有断言求绿；**禁止**改动 `test/桌面应用/optional-acceptance.test.ts`（基线已知红项，不在写集）。
5. **F3 条件**：A′ 与 B 各自单所有者；组合是一缺陷两子修复。若实施发现需要新增/修改公共契约、数据模型、跨更多角色或 Section 1 外文件 ⇒ **停止并升级普通流程**（F4/F6 失败），本 B1 不适用；若协调方不接受拆分（D1）⇒ 本 B1 作废/按普通流程补闸门。

## 1. 基线、修复记录与候选（BASE-1–BASE-7）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **修复记录先于代码（F7）**：A′ 记录 `角色卡/编排/docs/fix/2026-11-09_fix_proposal-card-run-binding.md` 与 B 记录 `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-run-binding.md` 写盘（或经协调方明确同意的合并记录，须覆盖两 owner）；记录 F1/F2/F4/F8、缺陷/复现、A′/B 范围与验证计划；记录路径/行数/字节/SHA-256；记录 mtime/顺序早于对应代码与测试改动；记录未被后续改写覆盖。 | 两记录原件/hash/mtime；代码与测试改动 mtime/diff 顺序；合并记录的同意留痕 | 未取证 |
| BASE-2 | **修复基线**：HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`、分支 `feat/plan-escalation-card`、`git status --porcelain -- src app test` = 0；记录 `git rev-parse HEAD^{tree}`、公共契约文件与已知红项测试文件基线 SHA-256；工作区未跟踪文档（其它 B1/验收报告）明确排除在候选外。 | status/HEAD/tree；公共文件 hash 清单；未跟踪清单与排除说明 | 未取证 |
| BASE-3 | **基线已知红项（增量口径）**：HEAD `c1439ce` 上 `node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts` 实测 **6 项中 2 通过、4 未通过**（`# pass 2 / # fail 1 / # cancelled 3`）：not ok 1 `:128` 断言失败 `chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务`；not ok 4 `:239`（judge 代选）`testTimeoutFailure`（复核 §F2 定向运行记录 8,007ms 超时；本 B1 写盘只读复跑同一命令为 6,005ms 超时，`--test-timeout=6000`）；not ok 5 `:252`、not ok 6 `:287` 超时。成因：`app/desktop/customer-input.ts:1776-1780` `isChiefBusinessCard` 与 `:2044-2050` `presentEntryNow` 在测试未注入 delegation 时不落入 `planJudge`；自 `e71501c` 起存在，与本修复无关，**不在本写集修复**。B2 采用「基线已知红项 + 增量不回归」口径：同名用例不得恶化；**新增确定性失败 = 0**；**新 skip = 0**；该文件 diff = 0。 | 基线命令/环境/Node 版本/TAP 输出/hash；设计 §6.5 与复核 §F2；候选逐条对照 | 未取证 |
| BASE-4 | **候选身份**：绝对检出、HEAD/分支、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）与 manifest（`src app test` 及写集）；候选只含允许文件；不含其它在飞变更/B1 证据；`test/桌面应用/optional-acceptance.test.ts` 与只读回归文件在候选中的 diff = 0（仅授权的 `chief-workflow.test.ts` 等改写文件除外）。 | 候选清单/聚合/manifest；逐文件 hash；diff/numstat；稳定性快照 | 未取证 |
| BASE-5 | **范围/公共契约零变化**：`src/model/*`（含 `runtime.ts` CustomerInputOutcome）、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`、`app/desktop/session.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/run-manifest.ts`、角色卡/边界/治理/权限/验收标准 = 0 diff；无新依赖；无 Section 1 外文件、删除、重命名越界；不改 `RunDocKind`/`request.resolved.by`/IPC 形状。 | 逐文件 diff/numstat；公共文件 hash 对照；scope 清单 | 未取证 |
| BASE-6 | **稳定性**：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建变化使证据失效并重取；不得拼接旧候选/旧证据/不同环境。 | manifest/聚合/树前后快照；diff 0 | 未取证 |
| BASE-7 | **候选/证据层级独立**：L1 A′ 单元/层证据、L2 B 桌面证据、L3 合并场景集成证据、L4 真实运行证据，各自绑定候选 digest；A 证据不得替代 B，B 不得替代 A；确定性证据不得以真实运行替代，真实运行不得替代确定性；其它在飞变更/其它 B1 证据不得冒充本候选。 | 证据索引（层级/候选/命令/环境）；交叉引用审计 | 未取证 |

## 2. 范围、Owner 与 F3 条件

| 子修复 | Owner（单一） | 允许写集（Section 1 内） | 禁止 |
| --- | --- | --- | --- |
| A′（等价绑定） | **编排** | `src/service/trunk/impl/apply-journal.ts`；`test/编排/`；必要时 `src/common/编排/` 小助手 | 改 `run-manifest.ts`/写 manifest；改公共 schema/数据模型；改 pinned/无 runId 分支行为；接受模型自报路径 |
| B（fail-closed 呈现） | **桌面窗口** | `app/desktop/customer-input.ts`；`test/桌面应用/chief-workflow.test.ts`（改写 + 补用例） | 改 `session.ts`/`tools.ts`/`renderer`/其它角色；新增未列测试文件（须先更新边界）；放宽 `respond` 闸 |

- **F3 组合**：整包跨 A′（编排）与 B（桌面窗口）两角色，按「两子修复各自单所有者」验收；每个子修复的写集/测试/证据必须可单独追溯（BASE-7）。整包是否可走修复快路径由协调方裁决（D1）。
- **升级条件**：若 A′ 需要扩展 `RunDocKind`/manifest 字段/新 IPC/新 `request.resolved.by` 值，或 B 需要新契约/跨角色文件 ⇒ 立即停止，按普通流程（F4/F6 失败）处理；本 B1 不适用。

## 3. 验收标准（AC-1–AC-15）

### 3.1 A′（编排）AC-1–AC-8

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-1 | **draft run refs 空 + 真实目标文档 ⇒ 证据准备成功**：draft manifest `documents:{}`、`execution.teamPlan/flow` 为 null；盘上存在 flow 版本化文档（`docs/product`、`docs/proposals`、`docs/contracts` 下 `<flowId>-*` 最新版本；或 host `judge.artifacts`/`metadata.criteriaRef` 目标）⇒ `prepareDecisionEvidence` 成功；`context` 含实际文件字节与 request 元数据；`evidenceRefs` 逐文件带 `snapshotId` + `sha256`；快照 schema `complete-snapshot/v1`、`snapshotId=decision-<digest>`、`digest=completeSnapshotDigest(files)`；`isCurrent()===true`；prepare **不写 run manifest**（manifest bytes/sha256 前后一致、`documents` 仍空）；目标来自应用计算事实，非模型自报。 | 未取证 |
| AC-2 | **漂移 fail-closed**：prepare 后目标文档变更或新版本出现 ⇒ 旧 `isCurrent()===false`、`checkDecisionEvidence` 拒绝（基底过期）；再次 prepare 以新字节生成新快照/新 `baseDigest`；旧基础不得用于结算；不得用旧字节/旧哈希冒充当前证据。 | 未取证 |
| AC-3 | **未知目标仍拒**：draft run、请求目标路径不在 host artifacts/criteriaRef/发现集（未知/越界/角色自报路径）⇒ 仍 `Draft request target is not bound to that run`；不生成快照、不进入桌面呈现（配合 B：无卡）；不得因 A′ 放宽为任意路径可读。 | 未取证 |
| AC-4 | **不可读/哈希不符 fail-closed**：draft run、目标存在但不可读/缺失/非文本/超大/含 secret，或 `criteriaRef.sha256`（若有）与盘上实际字节不符 ⇒ 既有错误分类拒绝（unreadable/oversized/non-text/secret/哈希不符），不生成快照、无卡；不得静默改用目录发现或伪造哈希。 | 未取证 |
| AC-5 | **manifest refs 非空路径既有行为不变**：draft run、`documents/execution` refs 非空 ⇒ 请求目标必须 ⊆ refs；refs 文件重读哈希不符 ⇒ `Draft run evidence drifted`；A′ 不绕过 manifest 权威；既有 `test/编排/direct-role-capabilities.test.ts:945-956` 原样通过。 | 未取证 |
| AC-6 | **pinned run 分支逐字不变**：源码区段与基线 diff 为 0（或提供行为逐字一致的等价证据）；既有 immutable bytes/live 泄漏拒绝/closed run `isCurrent=false` 用例（`:919-943`）原样通过；不得把 A′ 逻辑带入 pinned。 | 未取证 |
| AC-7 | **无 runId 分支逐字不变**：源码区段 diff 0；发现集、新版本过期、secret/超大拒绝（`:896-917`、`:957-965`）原样通过；不得因 A′ 改变无 runId 行为。 | 未取证 |
| AC-8 | **快照/证据引用实际可复核、无伪造**：`store.readSnapshot(snapshotRef)` 可读；schema `complete-snapshot/v1`；`digest` 可复算；`files[].sha256` 与真实字节一致；`evidenceRefs` 全部指向同一 `snapshotId`；`baseDigest` 可由记录 `basis/requestHash/snapshotDigest` 复算；文件预算（≤32 文件、单文件 ≤64 KiB、总 ≤256 KiB）与 secret 检查生效；无伪造/无截断。 | 未取证 |

### 3.2 B（桌面窗口）AC-9–AC-13

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-9 | **materials/绑定失败 ⇒ 不呈现可重试卡**：`host.prepare` 抛错（stage=materials；含证据不可用/漂移/绑定不符）且委托开启 ⇒ presenter 未被调用、**不写 `request.presented`**、无卡面/无 `judgeNotice` 卡；以既有 `settleEntry(..., {outcome:"declined", reason:<真实原因+可操作指引>, notPresented:true}, "judging")` 结算；工具回执为 `cardNotPresented` 语义（`src/provider/runtime/tools.ts:1964-1971`：治理确认卡未发出/未向客户呈现/未获任何同意/不要写盘/不要声称客户拒绝或同意）；发起角色回合正常继续（工具 promise 结算、无 pending/judging 残留、无无限重试）。 | 未取证 |
| AC-10 | **竞争/撤销不双结算**：失败结算前后 `delegation.set({enabled:false})`/中止/委托 revision 变化 ⇒ 恰一次结算，不双结算/不遗漏/不误发卡；`valid()` 语义保持；迟到答案只进诊断；无 orphan/挂起。 | 未取证 |
| AC-11 | **execution 阶段既有回退不变**：`host.execute` 后无有效决定（stage=execution）⇒ 既有 `chiefWaiting(noValidDecision)` 回退不变（卡呈现、可关闭委托后接管）；不得把 execution 失败误改为 notPresented，也不得把 materials 失败改回呈现。 | 未取证 |
| AC-12 | **respond 闸不变**：委托开启时 chief 业务卡 respond 仍返回非空 `manualTakeoverRequired`（`customer-input.ts:2506-2508`），文案如实；委托关闭后客户可正常结算（既有 `chief-workflow` 回归）；不得自动关闭委托/放宽闸。 | 未取证 |
| AC-13 | **失败原因如实、归属按既有约定**：`reason` 非空且含真实 prepare 错误/可操作指引，不得以空串或 renderer 回退文案「通道未受理」作为唯一信息；诊断 `chief-decision.failed` 保留（含 requestId、stage、原始 error）；`request.resolved` 经既有 lifecycle 写入 `choice:"declined"` + `reason`；`notPresented` 结算**无 `operatorId`**（D4(a)），不得用 `judge:`/`directive:`/`system:` 前缀；回执与账本不得声称客户拒绝或同意。 | 未取证 |

### 3.3 合并场景与回归（AC-14–AC-15）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-14 | **draft 提案卡 → 接受 → 流程继续（合并场景）**：全新 draft run（`documents:{}`）产生 proposal 卡（`cardKind:"proposal"`）→ A′ 证据准备成功 → 委托开启时 chief 代决或 execution 回退后客户接受（委托关闭，既有 respond 语义）→ `request.resolved` 的 `by` 与实际来源一致（`chief-delegated`/`customer`），`request.presented.to` 与实际呈现对象一致（`chief`/`customer`），工具回执成功；run 账本（tasks.jsonl）、run manifest、decision 快照/`evidenceRefs` 一致且可复核；流程推进到下一真实门（如冻结/下一闸门）；materials 失败变体不呈现卡（AC-9）。 | 未取证 |
| AC-15 | **回归**：pinned-run/intent-confirmed/客户决策既有路径不变；`test/桌面应用/{decision-service,application-line,run-change-trigger,pending-card-restart,chief-workflow}.test.ts` 与 `test/编排/direct-role-capabilities.test.ts:896-965` 按基线对照通过（无新增确定性失败/新 skip；已知红项不恶化）；`npm run typecheck` exit 0；公共契约 diff 0。 | 未取证 |

## 4. 测试矩阵（A1–A7、B1–B5）与断言改写记录

### 4.1 新增矩阵（逐条）

| # | Owner | 用例 | 必须观察 | 判定 |
| --- | --- | --- | --- | --- |
| A1 | 编排 | draft run、manifest `documents:{}`、盘上存在 flow 版本化文档（proposal/modules/roster/architecture 等）⇒ `prepareDecisionEvidence` 成功 | 实际字节进入 `context`；`evidenceRefs` 逐文件 sha256；`isCurrent()===true`；快照 `complete-snapshot/v1`；manifest 未被写 | 未取证 |
| A2 | 编排 | 同上，prepare 后磁盘文档变更/新版本出现 | `isCurrent()===false`；再次 prepare 用新字节；旧基底不得结算 | 未取证 |
| A3 | 编排 | draft run、请求目标路径不在应用 artifact/发现集（未知/越界路径） | 仍 `"Draft request target is not bound to that run"`；无快照 | 未取证 |
| A4 | 编排 | draft run、目标存在但不可读（权限/缺失/非文本/超大）/含 secret/`criteriaRef` 哈希不符 | 既有错误分类拒绝；无快照；无夸大或静默降级 | 未取证 |
| A5 | 编排 | draft run、manifest 已有 bound refs 且文件漂移 | 仍 `"Draft run evidence drifted"`；子集要求保持；A′ 不绕过 | 未取证 |
| A6 | 编排 | pinned run 全链（immutable 字节、live 泄漏拒绝、closed run `isCurrent=false`） | 既有用例原样通过；源码区段 diff 0 | 未取证 |
| A7 | 编排 | 无 runId 的 intent/initial 路径（发现集、新版本过期、secret/超大拒绝） | 既有用例原样通过；源码区段 diff 0 | 未取证 |
| B1 | 桌面窗口 | materials 失败（委托开启） | presenter 未调用、`request.presented` 不写、`request.resolved=declined+reason`、工具回执 `notPresented` 含真实原因；角色回合继续；无重试循环 | 未取证 |
| B2 | 桌面窗口 | 同一失败下 `delegation.set({enabled:false})`/中止/委托修订竞争 | 不双结算、不遗漏（沿 `valid()` 语义） | 未取证 |
| B3 | 桌面窗口 | 执行阶段「无有效决定」 | 既有 `chiefWaiting(noValidDecision)` 卡面回退不变（不误伤） | 未取证 |
| B4 | 桌面窗口 | 委托开启时 respond 闸；委托关闭客户结算 | `manualTakeoverRequired` 文案非空且如实；关闭后可正常结算（回归） | 未取证 |
| B5 | 桌面窗口 | 失败原因真实性 | 原因不得为空/不得以回退文案「通道未受理」代替；诊断保留；不得声称客户拒绝/同意 | 未取证 |

### 4.2 运行命令与计数

- A 层：`node --test test/编排/*.test.ts` 或等价逐文件运行（至少含 `test/编排/direct-role-capabilities.test.ts`）；记录 tests/pass/fail/cancelled/skip/exit。
- B 层与回归：`node --test --test-timeout=6000 test/桌面应用/chief-workflow.test.ts test/桌面应用/decision-service.test.ts test/桌面应用/application-line.test.ts test/桌面应用/run-change-trigger.test.ts test/桌面应用/pending-card-restart.test.ts`；记录逐文件计数/退出/日志 hash。
- 基线已知红项：按 BASE-3 命令在同候选上只读复跑 `test/桌面应用/optional-acceptance.test.ts`，逐条对照同名用例，不得恶化、不得新增失败/skip；**不得修改该文件**。
- 静态门：`npm run typecheck` exit 0（含 renderer 的既有 typecheck 目标若存在，按其实际命令执行并记录；本修复不改 `app/renderer/**`）。
- 每条证据绑定候选 digest/命令/环境；命令、退出、计数、日志 hash 缺一不可。

### 4.3 旧断言改写逐条记录（不得静默放宽）

1. `test/桌面应用/chief-workflow.test.ts` 的 `missingEvidence` 分支（`:385-395`）：现行断言为「materials 失败仍产生可见卡（`shown[0].judgeNotice=contextUnavailable`）+ 委托开启 respond=false + 关闭后 respond=true」。B 修复后必须改为「presenter 未调用/`shown.length===0`、无 `request.presented`、工具回执 `notPresented` 含真实原因、worker 回合继续、执行阶段回退另有 B3 用例保持」。须记录旧断言原文/hash、新断言、理由（对应客户要求 1）与证据行。
2. 任何其它被改写的既有断言：逐条给出 `文件:行`、旧断言原文、新断言、理由、对应客户要求/AC；**不得删除/弱化 fail-closed 断言**。若旧断言与客户裁定冲突，须标注「旧断言与客户裁定冲突」并由 B2 复核；未记录即视为静默放宽，判 fail。
3. `test/桌面应用/optional-acceptance.test.ts`、`decision-service`/`application-line`/`run-change-trigger`/`pending-card-restart` 等回归文件在候选中的 diff 必须为 0（仅作为基线对照/只读执行）；新增测试文件必须先有边界更新留痕，否则不得计入。

### 4.4 候选/证据层级独立

- A1–A7 证据只证明 A′；B1–B5 证据只证明 B；AC-14 合并场景须由真实 Service/真实 SessionManager 级集成测试提供（不得以手写桩替代 `prepareDecisionEvidence` 的真实字节/哈希路径）；真实运行证据（§5）单独层级，不得反向替代确定性测试。
- 所有证据索引标注候选 HEAD/聚合/manifest；不同层级/不同候选/不同环境的证据不得拼接。

## 5. 真实运行标准（RR-1–RR-7）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-1 | **真实环境与隔离**：真实 Electron（从本修复候选 worktree 直接启动 `app/main.ts`）+ 真实 Claude（非 demo）+ 真实渲染 UI；独立 `--userData`（专用路径，不写全局 `%APPDATA%/Electron` 共享态）；CDP **仅 9223**；全新隔离目标项目在仓库外（不复用/不改贪吃蛇 target）；记录候选 HEAD/聚合、入口、provider 配置、userData 路径、目标项目路径、端口。 | 未取证 |
| RR-2 | **S1（核心）**：全新目标项目产生 draft run → 幕僚/策划发出提案确认卡（proposal）→ 委托开启时卡被正确承载（`host.prepare` 不再因 draft 未绑定而 `chief-decision.failed`；chief 代决或 execution 回退路径均可，但必须可结算）→ 客户接受或 chief-delegated 接受 → `request.resolved` 的 `by` 与实际来源一致（`chief-delegated`/`customer`，含 `request.presented.to` 一致）→ 流程继续（提案后进入冻结/下一真实门）；首个决定性结果即停。 | 未取证 |
| RR-3 | **S2（fail-closed）**：构造真实不可用材料目标 ⇒ 不发生「呈现可重试卡」；无 `request.presented`；工具回执含真实原因（`notPresented` 语义）；无无限重试、回合不阻塞。若预算内无法真实触发，至少以 B1/B5 确定性证据覆盖并如实标注「真实运行未触发」，不得宣称真实运行已证明该项。 | 未取证 |
| RR-4 | **S3（回归）**：pinned run 决策卡路径与意图确认路径不变；委托关闭时客户手批路径不变；证据只读对照既有测试/真实路径。 | 未取证 |
| RR-5 | **预算/纪律**：合计客户消息 ≤1；真实提案卡 ≤1；墙钟 15–20 分钟；首个决定性成功/失败或下一真实门即停；不自动重试/不追加预算；出现任何非本缺陷卡、越界写、非预期模型调用 ⇒ 立即停止并如实报告。 | 未取证 |
| RR-6 | **隔离证明**：贪吃蛇 9222 实例零改动（运行前后进程/端口/临时根/目标项目关键文件 hash 对照；只读引用其证据）；9223 在运行结束后释放（端口关闭/进程退出）；运行不写贪吃蛇根/目标项目；本运行 userData/目标项目/证据路径全部记录。 | 未取证 |
| RR-7 | **证据与如实性**：诊断原件（目标卡无 `chief-decision.failed`；若有 materials 失败须证明未呈现）、目标项目 `tasks.jsonl` 生命周期行（无 `request.presented` 的失败路径/真实 `request.resolved`）、run manifest、decision 快照（`complete-snapshot/v1` 与哈希）、截图、驱动日志（CDP 9223）；失败/回退/下一门如实报告，不伪造不宣称未发生的结果。 | 未取证 |

## 6. 证据与检查要求（EV1–EV6）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/修复记录/候选：BASE-1–BASE-7；修复记录先于代码；候选只含允许文件；公共契约零变化；候选/manifest/聚合/树稳定；已知红项逐条对照。 | 未取证 |
| EV2 | A′ 证据：AC-1–AC-8、A1–A7；真实项目字节/快照/哈希/`isCurrent` 全链可复核；pinned/无 runId 分支 diff 0。 | 未取证 |
| EV3 | B 证据：AC-9–AC-13、B1–B5；presenter/`request.presented`/settlement/receipt/诊断/回合继续全链；无伪造。 | 未取证 |
| EV4 | 合并场景：AC-14；真实 Service/SessionManager 集成；`by`/`presented.to`/账本/快照一致。 | 未取证 |
| EV5 | 回归/静态门：AC-15；逐文件测试计数/退出/日志 hash；typecheck 0；无新增确定性失败/新 skip；旧断言改写逐条记录。 | 未取证 |
| EV6 | 真实运行：RR-1–RR-7；预算/纪律/隔离/证据/如实性；9222 零改动与 9223 释放证明。 | 未取证 |

## 7. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前修复候选上全部适用项有完整、可复算原始证据；A′ 的 draft 空 refs 等价绑定成功且快照/哈希可复核，未知/不可读/漂移仍 fail-closed，pinned/无 runId 逐字不变；B 的 materials 失败不呈现卡、不写 `request.presented`、以 `declined+notPresented+reason` 如实回交且回合不阻塞，execution 回退与 respond 闸不变；合并场景 draft 提案卡可承载并可结算、流程继续；回归/typecheck 通过且无新增确定性失败/新 skip、已知红项不恶化；修复记录先于代码；真实运行 S1 决定性结果与 S2 fail-closed（真实触发或如实标注确定性覆盖）齐备；范围仅允许文件且公共契约 diff 0。
- **fail**：改公共 schema/数据模型/共享/跨角色/写集外文件；新增 `RunDocKind`/`request.resolved.by`/IPC/契约；接受模型自报路径或伪造快照/哈希/`presented`/`by`/`operatorId`；A′ 绕过 manifest refs 权威或放宽未知/漂移拒绝；B 仍呈现可重试卡、写 `request.presented`、阻塞回合、无限重试、空原因或误称客户拒绝/同意；execution 回退/respond 闸被改动；自动关闭委托；删除/弱化既有断言、加 skip/force-exit；新增确定性失败或已知红项恶化；修复记录晚于代码/缺失；真实运行占用 9222 或改动贪吃蛇运行；无证据宣称成功。
- **insufficient evidence**：缺基线/候选/hash/公共文件对照；缺 A′ 快照/哈希/`isCurrent`/负例证据；缺 B presenter/`request.presented`/回执/诊断/回合证据；缺合并场景集成证据；缺测试日志/命令/环境/退出/计数；缺旧断言改写记录；缺修复记录或顺序无法核对；真实运行环境不可用/证据不全；S2 既无真实触发也无确定性覆盖；缺 9222 零改动或 9223 释放证明。
- **not applicable**：仅限有明确依据者（如 Pi/Codex 真实运行：本修复只要求真实 Claude，Pi/Codex 以只读回归/确定性覆盖；renderer 视觉目标：本修复不改 `app/renderer/**`）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接旧候选/旧证据/不同环境。

## 8. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；D1 条件标注；修复记录路径/写集/验证计划明确 | — |
| 修复记录（F7） | A′/B 两份记录（或协调方同意的合并记录）先于代码；确认 F1/F2/F4/F8、窄写集/验证计划 | 不进入实施；补记录/回路由 |
| 实施 A′（T1） | 仅编排写集；AC-1–AC-8、A1–A7、EV2 满足；公共契约 diff 0；pinned/无 runId 逐字不变 | 回 owner；越界即停止转普通流程 |
| 实施 B（T1） | 仅桌面窗口写集；AC-9–AC-13、B1–B5、EV3 满足；不写 `request.presented`；execution/respond 闸不变 | 回 owner；越界即停止转普通流程 |
| 合并验证 | AC-14、EV4；A′+B 同候选集成；账本/快照一致 | 回相应 owner；不得单方判过 |
| 真实运行 | RR-1–RR-7 预算/纪律/隔离/证据完成并如实报告 | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 同一独立验收身份按本 B1 全部适用项判定；修复记录/证据链齐备；披露充分 | 报告 pass/fail/insufficient；不授权发布 |

**复判规则**：本 B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/公共契约/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取；证据复用须证明候选关联且输入/依赖/契约/命令/环境未变；其它 B1/在飞变更证据不得冒充本候选当前证据；发布/tag 未授权。

## 9. 待协调方决策项（D1–D5）与本 B1 的处置

| 决策项 | 本 B1 的处置/引用 |
| --- | --- |
| D1（F3 拆分） | 采用路由建议：一缺陷两子修复（A′ 编排 + B 桌面窗口），共用本 B1；各子修复单所有者验收。**D1 未定前本 B1 为条件性标准**，实施需协调方放行；若协调方不接受拆分，本 B1 作废并按普通流程补闸门。 |
| D2（A′ vs A） | 本 B1 采用 A′（应用侧按实际项目字节 + SHA-256 + `complete-snapshot/v1` + drift 复核的等价绑定）作为验收基础；等价性以 AC-1–AC-8 钉住。若协调方/策划否决 A′ 等价性并要求 manifest 持久化绑定（A），须递增 B1 版本；若 A 仍无法覆盖验收类物证或需扩展 `RunDocKind`，升级变更/停止。 |
| D3（B 范围） | 本 B1 采用建议范围：**materials 全部失败 fail-closed**（证据不可用/漂移/绑定不符），不呈现可重试卡；execution 阶段既有回退保持。若协调方缩小为「仅绑定类」，B1 的 AC-9/AC-13 须相应修订版本；若扩大到改 execution 回退，则超出本 B1。 |
| D4（账本归属） | 本 B1 采用 D4(a)：接受既有 `notPresented + reason`、**无 operatorId** 的 `declined` 结算；`request.resolved.by` 沿用既有 lifecycle 约定（本轮不要求改枚举）；B1 钉住回执/账本**不得声称客户拒绝或同意**。若要求诚实的 `by` 归属 ⇒ 契约变更，升级普通流程，本 B1 不适用该项。 |
| D5（真实运行目标） | 本 B1 采用路线建议：**全新隔离目标项目**（仓库外），不复用/不改贪吃蛇 target；贪吃蛇 9222 实例只读引用。若客户要求直接在贪吃蛇运行上「修复并继续」，须另行批准对该运行的独占/重启方案，并修订本 B1 §5 后方可执行。 |

## 10. 范围限制与披露

1. 本 B1 只覆盖本缺陷修复（A′ 等价绑定 + B fail-closed 呈现 + 合并场景 + 回归 + 真实运行）；不覆盖公共 schema 重构、其它适配器/角色、贪吃蛇运行变更、其它在飞变更。
2. 本 B1 只写 `docs/acceptance/`；未改代码/方案/测试/角色卡/边界/其它文档；未运行真实模型；不授权实施/提交/推送/合并/发布。
3. **条件性**：D1 未定；D2–D5 采用建议处置。若实施中发现必须新增/修改公共契约、数据模型、跨更多角色或 Section 1 外文件，立即停止并升级普通流程，本 B1 作废。
4. **基线已知红项**：`test/桌面应用/optional-acceptance.test.ts` 的 4 项预存失败/超时与本修复无关、不在写集修复；B1 只按「增量不回归」判定，不得为求绿修改该文件或写集外路径。
5. **真实运行限制**：只承诺本次候选/环境/输入下的证据；真实 Electron/真实 Claude/真实 UI 与 9223 隔离是硬约束；若出现下一真实门，如实报告，不宣称完整闭环/长期稳定性/发布。
6. **证据复用**：A′/B/合并/真实运行证据分层独立；旧候选、其它 B1、在飞变更证据不得冒充；任何候选/环境/命令变化使证据失效并重取。

## 11. 当前状态

- **B1 完成、冻结（实施前）**；BASE-1–BASE-7、AC-1–AC-15、A1–A7/B1–B5、EV1–EV6、RR-1–RR-7 当前全部 `未取证`，不得判 pass。
- 本 B1 写盘时两份修复记录尚未存在；B2 前须先满足 BASE-1（先于代码、路径/hash/mtime 可核对）与 D1 放行。
- 后续由同一独立验收身份在修复记录/实现/确定性测试/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并。
- 本 B1 不修改其它 B1/在飞变更；发布/tag 不在授权内。

---

## 附录 A（v1.1，2026-11-09）：基线已知红项补充与 RR4 引用

- **版本与范围**：v1.1 = v1 正文原样保留 + 本附录。本附录只扩展「基线已知红项」口径、补充实施证据引用、增加真实运行 RR4 引用条目；**不改** AC-1–AC-15、A1–A7/B1–B5、RR-1–RR-7、§7 判定规则、§8 阶段出口。与正文冲突时，以本附录的增量口径为准；其余仍按 v1。
- **依据（v1.1 写盘时实测/实施证据）**：
  - A′ 修复记录（实际路径）：`角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding.md`，**81 行 / 11,151 bytes / SHA-256 `d414799743a0bf0f432bc4a8dac2824359651bd4aceaa8721f86dc324ad0aa12`**，mtime 2026-11-09 11:59:43；证据目录 `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding-evidence/`（`before-failing-tests.txt` / `after-failing-tests.txt` 均 **22 行 / 2,325 bytes / SHA-256 `d989195bec1b51602bbfeb53df10f504ae3ab0b3709146d9a7535ca9fbe8c5b9`**，前后相同；`counts-and-notes.txt` **59 行 / 5,767 bytes / `0409961efae02f7d96f6a397e19648abd07e8b911da7b549c263283e84f7bd51`**）。
  - B 修复记录（实际路径）：`角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md`，**96 行 / 16,245 bytes / SHA-256 `4005b0f44a75eec6cce09154c0583ac9cf7c82037f35edbae758ef39934e69ec`**；证据索引 `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation-evidence/EVIDENCE-INDEX.md`，**94 行 / 12,995 bytes / SHA-256 `2b2347059007daa0fc16d8009981c06b6c62ad6872b19bf94e77dcae0466f0a0`**。
  - **F7 顺序（实施证据）**：A′ 记录 mtime 11:59:43 早于 `apply-journal.ts` 代码 mtime 12:20:03（`counts-and-notes.txt`）；B 记录先于 B 代码/测试改动（`EVIDENCE-INDEX.md` §1 与 `final-candidate-and-order.txt`）。
  - **命名偏差（待协调方/沟通确认）**：v1 BASE-1 预期两份 `..._fix_proposal-card-run-binding.md`；实际 A′/B 记录使用上述文件名。B2 以实际路径与内容覆盖判定；是否统一命名由协调方确认，不作为本附录自动 pass/fail 依据。
  - **证据独立性**：A′ 证据候选只含 `src/service/trunk/impl/apply-journal.ts` + `test/编排/direct-role-capabilities.test.ts`；B 证据候选只含 `app/desktop/customer-input.ts` + `test/桌面应用/chief-workflow.test.ts`；两者各自在 HEAD `c1439ce` 上独立采集。合并候选的 before/after 集合仍须在 B2 重新对照（BASE-7），不得把两个单侧证据直接拼接为合并候选证据。
- **判定状态**：以下 A.1–A.4 是实施证据原文引用，**不构成 pass**；B2 判定仍为 `未取证`，须在最终合并候选上复核。

### A.1 `test/编排/` 基线已知红项（A′ 证据）

- 命令：`node --test --test-concurrency=1 "test/编排/**/*.test.ts"`；Node v24.22.1；worktree HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`）。
- 计数（A′ 证据 `counts-and-notes.txt`）：

| 样本 | tests | pass | fail | cancelled | skip | exit |
| --- | --- | --- | --- | --- | --- | --- |
| before（HEAD 干净基线） | 1122 | 1098 | 22 | 0 | 2 | 1 |
| after（A′ 候选，+A1–A5） | 1127 | 1103 | 22 | 0 | 2 | 1 |
| 增量 | +5 | +5 | 0 | 0 | 0 | — |

- 失败标题集合 `before-failing-tests.txt` 与 `after-failing-tests.txt` 逐字节相同（SHA-256 见上），**diff 为空**；新增确定性失败 = 0；新 skip = 0。
- **22 个既有失败（文件 + 测试名；按证据文件顺序）**：

| # | 文件 | 测试名 |
| --- | --- | --- |
| 1 | `test/编排/governance-matrix-injection.test.ts` | A5 runRole 一次性 CLI：createAdapter 不收到 capabilities（矩阵不注入） |
| 2 | `test/编排/trunk-upgrade-validation.test.ts` | AC-5：D3 targetRoleIds 不在 roster ⇒ 批准前拒绝（vca-target-invalid） |
| 3 | `test/编排/trunk-upgrade-validation.test.ts` | AC-5：role-card 缺失 ⇒ 批准前拒绝（fail-closed） |
| 4 | `test/编排/trunk-upgrade-validation.test.ts` | AC-5：合法单契约升级仍可通过（roster 未变更 ⇒ 不做磁盘最新版强链校验） |
| 5 | `test/编排/trunk-upgrade-validation.test.ts` | AC-5：契约版本链不匹配（roster 引用 proposal v1 + target proposal v2）⇒ 拒绝 |
| 6 | `test/编排/trunk-upgrade-validation.test.ts` | AC-5：无效 roster ⇒ 批准前拒绝（vca-target-invalid，不冻结/不 re-pin） |
| 7 | `test/编排/appointment-roster.test.ts` | BUG-3：appointment-write judge 事实含角色可写根（角色卡/<target>/ ∪ 名单目录）与 allowed 探针 |
| 8 | `test/编排/appointment-roster.test.ts` | BUG-3：角色卡 role-card.md 与 boundary.yaml 均经同一 resolveWrite 探测为 allowed |
| 9 | `test/编排/session-dir.test.ts` | D-1：projectRoot 为空 → 不传 sessionDir（旧行为） |
| 10 | `test/编排/session-dir.test.ts` | D-1：一次性路径 runRole **不传**能力面（一局即止，无持久化/恢复语义） |
| 11 | `test/编排/git-capabilities.test.ts` | Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority |
| 12 | `test/编排/shell-operator-only.test.ts` | P6 集成（Q1/Q2 口径修正）：可静态证明越界 ⇒ deny；不可解析 ⇒ 交判断并附脚本内容；plain 仍按边界 |
| 13 | `test/编排/direct-role-capabilities.test.ts` | Retained intent confirmation: real migration keeps history and only the exact persisted customer decision adds confirmation |
| 14 | `test/编排/trunk-service.test.ts` | applyStableSnapshot：mini re-pin 不升 trunkVersion、旧哈希不符/无 manifest 待续接 |
| 15 | `test/编排/shell-authorized-routine.test.ts` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 16 | `test/编排/handback.test.ts` | openRoleSession：普通角色 settle → 发出 handback（形状正确） |
| 17 | `test/编排/chat-handback-scope.test.ts` | real ACK binds task → Q1/Q2 chat → next task even with delayed consumption; chat report drops old taskId |
| 18 | `test/编排/trio-worker-report.test.ts` | v4.1 工作流卡文本：幕僚主链顺序一步一派；产品/策划/人事/运营/质检含各自产物与回报目标；convener 获得 dispatch 能力 |
| 19 | `test/编排/section1-write-preauthorization.test.ts` | 人事（Nominator）：无任务收窄时 Section 1 条目直接放行；他人写区/应用目录仍拒 |
| 20 | `test/编排/trio-worker-report.test.ts` | 卡片文本：幕僚卡要求派发后结束本轮、禁止 sleep/轮询空转；五张 worker 卡要求完成任务必须 submit_report |
| 21 | `test/编排/trio-worker-report.test.ts` | 卡片文本：验收卡发起权归质检——运营只可 dispatch 质检，幕僚不得要求运营提交验收卡 |
| 22 | `test/编排/section1-write-preauthorization.test.ts` | 有任务 writeSet 时 trio 不并入 Section 1：Nominator 角色卡条目仍被 F4 收窄拒 |

- **2 个既有 skip**（`test/编排/git-capabilities.test.ts:33` 的参数化两例）：

| # | 文件 | 测试名 |
| --- | --- | --- |
| 1 | `test/编排/git-capabilities.test.ts:33` | Delivered Hub code provenance: an explicit real read-only trace keeps its original quality creator and frozen sources |
| 2 | `test/编排/git-capabilities.test.ts:33` | Delivered legacy code provenance: an explicit real read-only trace keeps its original quality creator and frozen sources |

- 口径：上述 22 fail/2 skip 在 HEAD 干净基线与 A′ 后相同，不在 A′ 写集，**不修复/不弱化**；B2 以同名集合 diff 判定（新增确定性失败=0/新 skip=0）。`test/编排/direct-role-capabilities.test.ts:896-965` 中 v1 指定用例全部通过；该文件另有基线红项「Retained intent confirmation: real migration keeps history and only the exact persisted customer decision adds confirmation」（上表第 13 项），与本修复无关。

### A.2 `test/桌面应用/chief-workflow.test.ts` 基线已知红项（B 证据）

- 命令：`node --test --test-concurrency=1 "test/桌面应用/chief-workflow.test.ts"`；同一 worktree/HEAD。
- 计数（B 证据 `EVIDENCE-INDEX.md` §4.1）：baseline 59 tests / 47 pass / 12 fail / 0 cancelled / 0 skip / exit 1；final run1 63 / 47 / 15 / 1 cancelled / 0 skip；final run2 63 / 48 / 15 / 0 cancelled / 0 skip。新增 4 个测试（B1/B2/B3-B4/B5）每次运行全部 pass；skip 始终 0。
- **基线失败集合（`baseline-chief-workflow.log` 去重后 12 项）**：W5、W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W33、W34、W47 select、commit-race、selected（commit-race 子测试）。原因含 Windows 临时目录 `ENOTEMPTY` 清理竞争与既有 fixture 断言，与本修复无关、不在 B 写集。
- **改后失败集合变化（逐条记录，见 `EVIDENCE-INDEX.md` §4.1 与隔离日志）**：
  1. 与基线同名同因：W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W33、W34、commit-race、selected（含 `ENOTEMPTY`）。
  2. run1 运行级抖动：W29×4（document-change / wrong-flow / source-loss / missing-confirmation）、W30×2（连续写入后 / 真实重启迁移后）、W35、W36；同候选隔离复跑 `final-w29-w35-w36-isolation.log` **6/6 pass**。
  3. run2 运行级抖动：W10、unmanaged；同候选隔离复跑 `final-w10-isolation.log` **5/5 pass**。
  4. W47 select/revise 两方向翻转（`final-w47-isolation.log`）；W5/W20 `ENOTEMPTY`。
  5. 结论：新增 4 测试全部 pass；无新增确定性失败、无新 skip；上述抖动均在同候选隔离复跑通过，不构成 B 回归。
- **回归文件基线红（只读对照，来自 `EVIDENCE-INDEX.md` §4.2）**：`decision-service` 20/20 → 20/20；`application-line` 3（2 pass / 1 fail）→ 3/3；`run-change-trigger` 9（0 pass / 9 fail）→ 9/0/9（同名同数，既有红项不恶化）；`pending-card-restart` 1/1 → 1/1；`optional-acceptance` 6 tests / pass 2 / fail 1 / cancelled 3 / skip 0 → 完全相同，diff = 0（不在写集，禁止修改）。
- 口径：B2 对 `chief-workflow` 采用「基线 12 项同名对照 + 新增失败隔离复跑 + 失败集合逐条记录」；对回归文件采用「同名同数/不恶化 + 新失败=0」，不以绝对全绿为前提。

### A.3 v1.1 的「基线已知红项」统一口径

自 v1.1 起，BASE-3、AC-15、§4.2、§7 中「基线已知红项 + 增量不回归」统一为：

1. `test/桌面应用/optional-acceptance.test.ts`：6 tests / pass 2 / fail 1 / cancelled 3 / skip 0；diff 0。
2. `test/编排/**`：22 fail / 2 skip（集合见 A.1）；A′ 前后失败标题集合 diff 空。
3. `test/桌面应用/chief-workflow.test.ts`：基线 59/47/12；改后 63/47–48/15（环境抖动，隔离复跑通过；集合变化见 A.2）。
4. 回归文件既有红项（如 `run-change-trigger` 9/0/9）按同名同数/不恶化对照。

- 判定：**新增确定性失败 = 0；新 skip = 0**；一律以 before/after 失败标题集合 diff + 同候选隔离复跑为准；不得以绝对全绿为前提，也不得用「环境抖动」豁免新增确定性失败或未隔离复跑的新失败。

### A.4 真实运行 RR4 引用（新增独立条目；RR-1–RR-7 保持）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-8（引用实施侧真实运行 RR4） | 引用实施侧「真实运行 RR4」记录：draft 提案卡（proposal）→ 接受 → 流程继续。须为真实 Electron + 真实 Claude + 真实 UI；隔离 `--userData`、CDP 9223、仓库外独立目标项目；证据含诊断、`tasks.jsonl`、run manifest、decision 快照、截图、9222 零改动、9223 释放；`request.resolved.by`/`request.presented.to` 与实际来源一致；如实报告失败/回退。v1.1 写盘时本 worktree 内尚未找到该记录/证据文件；B2 时必须引用实际路径/行数/字节/SHA-256，并按 RR-1–RR-7 同口径审查。 | 未取证 |

### A.5 附录状态

- 本附录写盘后 B1 版本为 **v1.1**；v1 正文（含 §11「两份修复记录尚未存在」的首次写盘时点陈述）原样保留。
- v1.1 新增/引用条目（A.1–A.4）当前均 `未取证`；原有条目状态不变；A.1–A.3 的实施证据引用须在最终合并候选上由 B2 复核。
- 本附录不实施、不改其它文件、不提交/推送/合并/发布。
