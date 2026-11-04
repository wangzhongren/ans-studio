# 运行时核心 P1 实现提案：主干/冻结与版本变更申请模型（trunk-amendment，C1 Model/事件/acknowledgments 契约）

- **任务 / 角色 / 阶段**：`2026-11-04-trunk-amendment-model`（T3）；运行时核心（独立固定上下文）；**P1 实现提案**（团队计划增量 §10.8 运行时核心行；对应 §5.1 的 C1「Model/契约冻结」的准备）。
- **日期 / 状态**：2026-11-04；**`proposal-only, no code`（r2，按 PM 审核修订后待复审）**——只写本文件（及 `memo.md` 一行记录），**未改任何产品/测试代码，未运行产品测试，未 commit/push/merge/release**。状态以本行为准。
- **本阶段唯一产品写盘**：无。本文件即 §10.8 指定路径 `角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md`（本角色 `docs/change/` 授权内）。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：**1151 行**；实际字节/CRLF SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`；`tr -d '\r'` 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`（本 worktree 写盘前实测，与团队计划增量/沟通核对值一致）。
- **验收标准**：`docs/acceptance/trunk-amendment-model-criteria-v1.md` **v1.1**：**350 行 / SHA-256 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`**（本 worktree 实测）。**PM 审核裁决**：以当前 350 行 / `3c40acad…` 为当前生效版；团队计划增量早期记录的 `75bf7a49…` 为旧快照，由沟通/统筹在 G2a/E1 更正（审核记录 §1.3-1）。本提案按 AC-1–AC-36 逐条引用。
- **团队计划增量（§10.8 任务书来源）**：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md`：468 行 / SHA-256 `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5`（实测一致）。
- **PM 审核记录（r2 修订依据）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：**368 行 / SHA-256 `2cb04cae…`**；结论 **`needs revision`**；本角色必修项 **F1、F2（C1 侧）、F3、F4、F5（C1 侧）、F6（C1+写集）、F12**；裁决与引用刷新见该记录 §1.3/§4.1/§4.3/§4.5/§4.10/§5.1/§八。**本修订不自行评审放行**，复审结论以 PM 新记录为准。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`；**HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`**（`git rev-parse HEAD` 实测）；`git status --porcelain -- src app test` **为空**（无产品/测试源码改动；产品候选尚不存在）。
- **标注约定**：**[事实]** 只读实测；**[方案已定]** 取自 P1.6 / V1 v1.1 / 团队计划增量 / 客户 IA / PM 审核裁决；**[候选·待审核]** 本提案为 C1 冻结提出、尚未获裁决的形状/命名，请复审确认；未实施内容一律不写成已实现。

**版本记录**

| 版本 | 日期 | 变更 | 状态 |
| --- | --- | --- | --- |
| r1 | 2026-11-04 | 初版：C1 冻结候选（trunk/v1、trunk-amendment/v1、apply-journal、version-change/v1、doc-freeze/v1、stable-write/v1、refactor-request/v1；事件/acknowledgments；Q1–Q14） | 816 行 / `e3e74ad0f0faa6ad101c87171aff36b3c443103996a869edb3033aaced089f6c`；PM 审核 `needs revision` |
| r2 | 2026-11-04 | 按 PM 审核修订：F1 ack 形状固定；F2 `stable-write` app-owned 卡种 + `GOVERNANCE_CARD_KINDS` 白名单（不进 GROUP）；F3 `roleCards`；F4 journal `committed` + source `"upgrade"`；F5 许可 `approvedAt/expiresAt/status` + pre/post/失败作废；F6 `WriteGate` 可选内容哈希 + `tools.ts` 入写集；F12 bootstrap `baseTrunk:null`；吸收 gap/applied/written 归属裁决；错误码 `vca-conflict`、`trunk-drift` 并入；R9 append variant 记录；引用刷新 B0/V1/G2a | 本文件（待复审） |

## 0. r2 修订对照（回应 PM 审核 `needs revision`）

| 审核项 | 修订落点 | 修订结果 |
| --- | --- | --- |
| **F1** ack 形状 | §3.3-4/5、§3.4、§5.1、Q5 | 以 C1 **对象数组** `CustomerInputAcknowledgement[]`（`{id,label,required}`）为准；`CustomerInputOutcome.acknowledged: string[]`；D1 对象数组透传 + `respondUnsafe` 按 required 结算；U1 按对象数组渲染；`request.resolved` **不加** `acknowledged`。 |
| **F2** stable 卡种/白名单 | §3.3-1/2、§3.6、§5.1、Q5/Q11 | 新增 app-owned 卡种 `"stable-write"` 进入 `GovernanceCardKind`；**绝不进** `GOVERNANCE_CARD_GROUP`（`governanceCardGroup` 返回 `undefined` ⇒ 永不判断）；新增 `GOVERNANCE_CARD_KINDS` 白名单（GROUP 键集 + app-owned 非判断卡种），C2a `isGovernanceCardKind` 改读该白名单；VCA/detail/trunk 卡复用 `decision` + `flowId`；`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`（D1 独立最小结构校验）；`run-role.ts` 的 `CARD_KIND_ROUTE_HINTS` 一行编译解锁归编排 S3（不改本角色写集）。 |
| **F3** roleCards | §3.1 `TrunkManifest.artifacts.roleCards?`、`TrunkStateView.roleCards?`、`TrunkApplySnapshot.roleCards?`；§4.2-3 | stable 快照覆盖 workflow/role-card/boundary 三类；`TrunkStableArtifactRef` 增 `kind` 字段（`TrunkStableFileKind` 单一定义，version-change 别名）。 |
| **F4** phase/source | §3.1、§4.2-4 | `TrunkApplyJournalPhase` 增 `"committed"`（提交点后写、仅审计）；`TrunkSource` 使用 `"upgrade"`（不新造 `main-upgrade`）。 |
| **F5** stable 许可 | §3.2、§3.4、§4.2-2、Q4 | 许可增 `status:"approved"|"consumed"|"expired"|"failed"`、`approvedAt`（必填）、`expiresAt`（批准后必填）、`consumedAt?`；`baseSha256=""` 表示写入前不存在；`stableWriteDecision` 无副作用判定（pre-write 校 targetSha/base/过期/未消费/快照一致）；post-write 由 B-11 `completeWrite(actualSha)` 复核后消费；失败作废许可（不可复用）+ fail-closed + 恢复；TTL 默认 30 分钟。 |
| **F6** WriteGate 内容哈希 | §2-4、§3.3-8、§4.2-6、§5.1 | `WriteGate` 扩可选 `(targetPath, context?: {contentSha256?, operation?})`（向后兼容）；`src/provider/runtime/tools.ts` 第二次（写前复核）`govern` 传最终字节 sha；该文件补入本角色 C1 写集（Section 1 单文件条目，**计划枚举补登、非边界变更**），团队计划 §4.1「预计否」由统筹在 E1 披露更正。 |
| **F12** bootstrap amendment | §3.1、§3.2、Q13 | `TrunkAmendmentDoc.baseTrunk` 与 `TrunkAmendmentState.baseTrunk` 允许 `null`（仅 bootstrap；`bootstrap:true` 配对）；VCA `baseTrunk:null` 与 P1.6/AC-25 原文一致。 |
| **裁决吸收** | §3.4、§4.1、Q2/Q3 | `gap` = application、`decidedBy` 缺省、channel `low-level-run-change`；`version.change.applied/superseded`、`stable.write.written/failed`、`trunk.amendment` applied/apply-failed = application + `decisionId`；`approved/rejected/stable-repinned` = customer。 |
| **错误码/记录** | §3.1/§3.2、§4.2-1/4、Q11 | 补 `vca-conflict`；`trunk-drift` 并入 `trunk-verify-failed`（不恢复 drift 状态）；R9 采用 **append variant 记录**（`event:"frozen"` + `freeze:DocFreezeRecord`；`draft-updated`；`draft-marker`），不加 `VersionBaselineRecord.freeze?`；`DocFreezeRecord.applicationId` 对 proposal/intent-confirmed 用合成非空值。 |
| **引用刷新** | 头部、§1.1、§9、Q12 | B0 = **221 行 / `8c6272d5…`**（勿引 173 行/`27f9b94d…`）；V1 = **350 行 / `3c40acad…`**（勿引 `75bf7a49…`）；G2a = **25 行 / `bfac5781…`**（勿引 16 行）。 |

---

## 1. 输入与基线（只读实测）

### 1.1 输入哈希与版本链

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 方案 **P1.6**（唯一实施契约基线） | 1151 | `fccb1f54…` / 归一化 `1e260646…` | 本 worktree 实测一致；P1.3→P1.4→P1.5→P1.5.1→P1.6 版本链（E1 披露） |
| 验收标准 **V1 v1.1** | 350 | `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4` | PM 审核裁决的当前生效版（AC-1–AC-36）；`75bf7a49…` 为旧快照 |
| 团队计划增量 | 468 | `911974fa…` | §10.8 P1 任务书；§4.1 运行时核心写集；§10.3–§10.5 stable 增量 |
| 原团队计划（闸门 2） | 721 | `ed6d3484…` | C1 写集、§4.3 边界、证据口径 |
| B0 基线（最终版） | 221 | `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058` | 套件计数（runtime-core 325/318/3/4 等）；旧 173 行/`27f9b94d…` 为含占位中间版，**勿引用** |
| G2a 闸门 2 写集增补（含 P1.6/B-11 补注） | 25 | `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201` | 以 25 行补注版为准；V1 §1.1 的 16 行/`d41665d3…` 为旧引用（沟通更正） |
| PM 审核记录（r2 依据） | 368 | `2cb04cae…` | 结论 `needs revision`；F1–F12 与 Q 裁决 |
| 本角色边界（md/yaml） | 32 / 74 | 治理文件 | B-1 `src/model/trunk.ts`、B-5 `src/model/version-change.ts`、`src/provider/runtime/tools.ts` 均在 Section 1；`test/runtime-core/` 目录授权 |
| 修订版闸门 0 / IA（当前 37 行）/ 原闸门 2 | — | `cda7c52d…` / `0bed4240…` / `a12b39fc…` | 只作依据来源；原件在 `download-requests` worktree（V1 §七问题 6 已披露），本提案不改副本 |

### 1.2 代码现状（只读实测；行号为 89b1fb2 快照，实施以符号名为准）

- **[事实] 全仓无 trunk 实现。** `grep -r "trunk|Trunk" src/` 无命中；`src/model/trunk.ts`、`src/model/version-change.ts`、`test/runtime-core/trunk-contract.test.ts`、`test/runtime-core/version-change-contract.test.ts`、`src/provider/trunk/`、`src/service/trunk/`、`src/pipeline/orchestration/trunk-runtime.ts` 均不存在。**P1.3/P1.6 的 trunk/apply-journal/逐项确认/re-pin 是设计承诺，不是既有代码**；C1 是从零定义契约，S1–S4 才实现。AC-16「P1.3 内部机制回归」在无旧实现的前提下指的是**契约形状与 AC 语义回归**，不得在 E1/E2 中被表述为既有代码行为零回归。
- **[事实] 事件契约先例**：`src/model/runtime.ts:726-729` `TaskStateEventBase { v: 1; at: string }`；`:958-988` `VersionDecisionEvent`（`kind` + `schema` + 业务字段）；`:991-1008` `TaskStateEvent` 联合（目前 17 个 kind）。`TaskRecord`/`taskStatusOf` 不消费加法事件。
- **[事实] 客户卡形状**：`src/model/runtime.ts:513-540` `CustomerInputRequest = (confirm | choice) & GovernanceCardMetadata`；**无 `acknowledgments` 字段**。`CustomerInputOutcome`（answered `:547-568`、declined `:569-586`、`:587` `unavailable`）**无 `acknowledged` 字段**。
- **[事实] 卡种/分组**：`GovernanceChoiceCardKind`（`:415`）、`GovernanceConfirmCardKind`（`:421`）、`GovernanceCardKind`（`:430` = 两者 + `"download"`）；`GOVERNANCE_CARD_GROUP`（`:453-463`，类型 `Readonly<Partial<Record<GovernanceCardKind, GovernanceJudgeGroup>>>`）；`governanceCardGroup`（`:470-473`）对未知键返回 `undefined` ⇒ 永不判断。`src/common/编排/task-state.ts` 的 `isGovernanceCardKind` 当前**直接读 `GOVERNANCE_CARD_GROUP` 键集**（C2a 主属，本次由 C2a 改读新白名单）。
- **[事实] 写门禁签名**：`src/model/runtime.ts:172` `WriteGate = (targetPath: string) => WriteDecision`（**仅路径，无内容上下文**）；`src/provider/runtime/tools.ts` 中 `govern(gate,name,path,writeRoot)` 只传路径，`writeGuarded` 的第二次（写前复核）调用处已有最终字节 `data`（write_file 为 `Buffer.from(content)`；edit_file 为应用编辑后的字节），可计算 sha256。
- **[事实] R9 版本基线（冻结记录宿主）**：`src/common/门禁引擎/versioned-doc-guard.ts:131-147` `VersionBaselineRecord { v, flowId, doc, version, path, sha256, recordedAt, event:"baseline"|"version-added", recordedBy }`；`VERSION_BASELINE_REL = ".ans/state/versions.jsonl"`；`registerVersionedDocAfterWrite` 对同 path/version 不同 sha 返回 **false**（现状不支持 draft 原位改登记）。PM 审核裁决：改为 **append variant 记录**（`event:"frozen"` + `freeze:DocFreezeRecord`、`draft-updated`、`draft-marker`），latest-record-per-path，**不给既有记录加可选 `freeze` 字段**（审核记录 §4.2）。
- **[事实] run manifest**：`src/common/编排/run-manifest.ts:60-82` `RunManifest` 含 `documents/execution/rosterVersion/d3/roles/runChange`，**无 `repins`**；`RunRepinRecord` 不存在。**判定：不放进 Model**（Q8），由编排 S3 在 `run-manifest.ts` 内以加法字段定义并由 D1 只读消费。
- **[事实] 无 `acknowledg` 既有实现**：`grep -n "acknowledg" src/model/runtime.ts` 仅命中一条无关注释（`:131`），确认 `acknowledgments`/`acknowledged` 为纯加法。

### 1.3 输入口径（本提案遵守）

- P1.6 §4.4/§4.5/§4.5.1/§4.6/§4.7/§4.8/§5/§10.5 与 AC-1–AC-36 是设计来源；PM 审核 §4.1/§4.2/§4.3/§4.5/§4.10/§5.1 是 r2 的裁决来源；本提案**不新增** P1.6/审核裁决未定义的行为，只把本层契约落成可冻结的 Model 形状、常量和错误码。
- **stable 文件最终决定**（IA「按此修改」）：stable 文件「确认即写 + mini re-pin」，VCA 收窄（workflow/boundary/product-intent 不进 VCA），移除记录式 drift；本提案按此，**不保留 drift 作为新写入语义**（仅旧读兼容）。
- **不新增角色/写权/边界**：本提案只涉及 B-1 `src/model/trunk.ts`、B-5 `src/model/version-change.ts`、既有单文件 `src/model/runtime.ts` 的加法、既有单文件 `src/provider/runtime/tools.ts` 的最小改（F6 裁决，Section 1 内）、`test/runtime-core/` 目录内两个新测试（及一个既有写路径测试的最小更新）。**不提出 B-1..B-11 之外的路径**；若审核要求额外文件/模块根，停止回报。

---

## 2. 精确写集（C1 实施阶段；本阶段 0 行产品代码）

> 本提案阶段（P1）产品写集为空。以下是 **C1 契约冻结节点**的逐文件写集（P1/复审通过后执行），全部在本角色 Section 1 内；`src/model/project-state.ts` 为**条件项，本提案判定不改**（Q7）。

| # | 路径 | 性质 | 改动内容 |
| --- | --- | --- | --- |
| 1 | `src/model/trunk.ts` | **新增**（B-1） | `trunk/v1`、`trunk-amendment/v1`、`trunk-apply-journal/v1` 的 schema 常量、状态枚举、错误码、`TrunkManifest`/`TrunkAmendmentDoc`/`TrunkAmendmentState`/`TrunkApplyJournal`/`TrunkStateView` 等纯类型；无 I/O；**不 import `runtime.ts` 或任何运行层** |
| 2 | `src/model/version-change.ts` | **新增**（B-5） | `version-change/v1`、`doc-freeze/v1`、`stable-write/v1`、`refactor-request/v1` 的 schema 常量、状态枚举、错误码、`VersionChangeRecord`/`DocFreezeRecord`/`StableWriteRecord`/`StableWritePermit`/`RefactorRequestRecord` 等纯类型；无 I/O；只允许 `import type { TrunkStableFileKind, TrunkVersionRef } from "./trunk.ts"`（单向） |
| 3 | `src/model/runtime.ts` | **加法** | 六类事件加入 `TaskStateEvent` 联合；`CustomerInputRequest.acknowledgments?`；`CustomerInputOutcome.acknowledged?`；`GovernanceCardKind` 增 app-owned `"stable-write"` + `GOVERNANCE_CARD_KINDS` 白名单（**不进** `GOVERNANCE_CARD_GROUP`）；`WriteGate` 扩可选内容上下文（F6）；type-only import 两个新 Model 文件 |
| 4 | `src/provider/runtime/tools.ts` | **加法（F6 裁决）** | `govern(...)` 接受可选上下文；`writeGuarded` 第二次（写前复核）`govern` 传 `{ contentSha256, operation }`（write_file 用 `Buffer.from(content)`；edit_file 在编辑应用后、`atomicWriteFile` 前计算最终字节 sha）。**不改**参数形状/工具集合/回执语义；`schema.ts` 不改。**计划枚举补登**：团队计划 §4.1 对本文件原写「预计否」，现按审核裁决补入 C1 写集（Section 1 单文件条目，**非边界变更**），由统筹在 E1 披露更正 |
| 5 | `test/runtime-core/trunk-contract.test.ts` | **新增** | trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1 常量/枚举/错误码/legacy 映射/事件形状正反例（AC-1/AC-16/AC-25/AC-31/AC-32/AC-34 的 Model 侧） |
| 6 | `test/runtime-core/version-change-contract.test.ts` | **新增** | VCA/doc-freeze/stable-write/refactor-request 常量/枚举/错误码/归属映射/事件形状正反例（AC-2/3/5/6/7/10/15/18/19/26/27/28/30/33/35 的 Model 侧） |
| 7 | `test/runtime-core/file-write-safety.test.ts` | **最小更新（按需）** | 新增用例：第二次 `govern` 收到 `{operation:"write"|"edit", contentSha256:最终字节 sha}`；单参数旧 gate 实现/调用零变化；写前复核拒绝时仍不落盘。若实施证明既有用例已覆盖且无需改动，逐条理由写完成报告（**不改写断言以保绿**） |
| 8 | `src/model/project-state.ts` | **不改（0 行）** | trunk/VCA/freeze 状态经专用 `trunk:state` 快照与面板消费，不进 `project-state/v1`；若 D1 实施证明必须并入，回到本角色按既有单文件授权另案最小加法（不扩边界） |
| — | `角色卡/运行时核心/memo.md` | 实施记录（按需） | C1 冻结声明与验证计数（本阶段只加一行 P1 提案记录） |
| — | `角色卡/运行时核心/api-spec.md` | 实施记录（按需） | C1 冻结后更新公开契约章节 |

**明确不写**：`src/common/**`（含 `编排/task-state.ts`、`编排/run-manifest.ts`、`编排/run-role.ts`、`门禁引擎/versioned-doc-guard.ts`）、`src/provider/**`（除上表 `tools.ts`）、`src/service/**`、`src/pipeline/**`、`app/**`、`test/{编排,门禁引擎,桌面应用,桌面UI,测试,项目管理}/**`、`package.json`/lock/tsconfig/vite/入口、`docs/{planning,scheduling,acceptance,communication}/`、其他角色 docs/角色卡/边界。**Model 只描述形状，不实现守卫、冻结服务、VCA 状态机、存储或 IPC。**

---

## 3. 契约（冻结候选，请复审）

### 3.1 `src/model/trunk.ts`（新；primary owner：运行时核心）

```ts
// trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1 共享 Model 契约（2026-11-04 C1 冻结候选，r2）。
// 依赖方向：本文件不 import 任何项目模块；version-change.ts 可 type-import 本文件；runtime.ts
// 可 type-import 本文件与 version-change.ts；反向禁止。无 I/O、不执行判定、不读写账本。

export const TRUNK_MANIFEST_SCHEMA = "trunk/v1";
export const TRUNK_AMENDMENT_SCHEMA = "trunk-amendment/v1";
export const TRUNK_APPLY_JOURNAL_SCHEMA = "trunk-apply-journal/v1";
export const TRUNK_VERSION_MIN = 1;

/** stable 文件种类（单一定义；version-change.ts 的 StableFileKind 为其别名）。 */
export type TrunkStableFileKind = "workflow" | "role-card" | "boundary";
export const TRUNK_STABLE_FILE_KINDS: readonly TrunkStableFileKind[] = Object.freeze([...]);

/** 主干来源（P1.3 source + F6/F22 + P1.6 bootstrap）。只用 "upgrade"；消费方不得新造 "main-upgrade"。 */
export type TrunkSource = "adopted" | "post-run-change" | "amendment" | "upgrade" | "bootstrap" | "recovery";
export const TRUNK_SOURCES: readonly TrunkSource[] = Object.freeze([...]);

/** 主干引用的版本化文档类别（intent 不入主干：P1.6-F32 意图走闸门 0/1）。 */
export type TrunkDocKind = "proposal" | "modules" | "topology" | "architecture" | "assets" | "roster";
export const TRUNK_DOC_KINDS: readonly TrunkDocKind[] = Object.freeze([...]);

export interface TrunkArtifactRef { path: string; sha256: string; version?: number; }
export interface TrunkExecutionRef {
  teamPlan: TrunkArtifactRef | null;
  flow: (TrunkArtifactRef & { version: number }) | null;
}
/** stable 文件快照（mini re-pin 绑定 decisionId/confirmationId；不产生冻结记录）。 */
export interface TrunkStableArtifactRef {
  kind: TrunkStableFileKind;       // F3：三类 stable 文件均带 kind/path
  path: string;
  sha256: string;
  confirmationId?: string;         // workflow 轻量卡 / appointment-write
  decisionId?: string;
  updatedAt?: string;
}
/** VCA baseTrunk 比较基准（version-change.ts 复用）。 */
export interface TrunkVersionRef { trunkVersion: number; runId: string | null; digest: string; }

export interface TrunkManifest {
  schema: typeof TRUNK_MANIFEST_SCHEMA;
  trunkVersion: number;
  source: TrunkSource;
  previous: { trunkVersion: number; runId?: string | null } | null;
  flowId: string;
  /** bootstrap 首次建立 t1 时可为 null；首个 handoff pin 后回填（PM 裁决 Q13）。 */
  runId: string | null;
  artifacts: {
    documents: Partial<Record<TrunkDocKind, TrunkArtifactRef>>;
    execution: TrunkExecutionRef;
    workflow: TrunkStableArtifactRef;
    /** F3：role-card.md 快照（roleId → 快照）；AC-34 覆盖 workflow/role-card/boundary 三类。 */
    roleCards?: Record<string, TrunkStableArtifactRef>;
    boundaries: Record<string, TrunkStableArtifactRef>;   // roleId → boundary.yaml 快照
  };
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  /** 内容 digest（算法由 S2 计算并文档化；Model 只声明字段，PM 裁决 Q14）。 */
  digest: string;
  createdAt: string;
  updatedAt: string;
}

/** 只读视图（IPC/面板；不持久化、无 schema 自描述）。 */
export type TrunkAvailability = "frozen" | "derived" | "unavailable" | "apply-uncertain";
export interface TrunkStateView {
  availability: TrunkAvailability;
  trunkVersion?: number;
  source?: TrunkSource;
  runId?: string | null;
  flowId?: string;
  workflow?: TrunkStableArtifactRef;
  roleCards?: Record<string, TrunkStableArtifactRef>;
  boundaries?: Record<string, TrunkStableArtifactRef>;
  pendingAmendmentId?: string;
  applyState?: TrunkAmendmentApplyState;
  journalId?: string;
  issues?: string[];
}

/** 修正案生命周期（P1.6 §1.4.3/§4.7）；proposed/confirmed/cancelled 为旧读映射。 */
export type TrunkAmendmentStatus = "draft" | "submitted" | "approved" | "rejected" | "applied" | "superseded";
export const TRUNK_AMENDMENT_STATUSES: readonly TrunkAmendmentStatus[] = Object.freeze([...]);
export type TrunkAmendmentLegacyStatus = "proposed" | "confirmed" | "cancelled";
export const TRUNK_AMENDMENT_LEGACY_STATUS_MAP: Readonly<Record<TrunkAmendmentLegacyStatus, TrunkAmendmentStatus>> =
  Object.freeze({ proposed: "submitted", confirmed: "approved", cancelled: "rejected" });

/** 执行子态与生命周期分离（F6）。 */
export type TrunkAmendmentApplyState = "idle" | "applying" | "applied" | "apply-failed" | "applied-uncertain";

/** item kind：新 detail-amendment 只允许前三类；workflow/boundary 仅旧文档可读（P1.6 §4.7/§5.3）。 */
export type TrunkAmendmentItemKind = "contract" | "roster" | "execution" | "workflow" | "boundary";
export const TRUNK_AMENDMENT_VCA_ITEM_KINDS = Object.freeze(["contract", "roster", "execution"] as const);
export const TRUNK_AMENDMENT_LEGACY_ITEM_KINDS = Object.freeze(["workflow", "boundary"] as const);
export type TrunkAmendmentItemChange = "add" | "modify" | "none";
export type TrunkAmendmentItemResult = "pending" | "applied" | "kept" | "cancelled";
export interface TrunkAmendmentItem {
  itemId: string;
  kind: TrunkAmendmentItemKind;
  change: TrunkAmendmentItemChange;
  from?: string;
  /** change:add 可缺省或 null（F21）；由应用在 proposed 时计算定格（F20/F25）。 */
  fromSha256?: string | null;
  to: string;
  toSha256?: string;
  roleId?: string;           // 仅旧 boundary item
  reason?: string;
  result?: TrunkAmendmentItemResult;
}

/** 修正案文档 frontmatter（策划写 docs/proposals/<flowId>-amendment-vN.md）。 */
export interface TrunkAmendmentDoc {
  schema: typeof TRUNK_AMENDMENT_SCHEMA;
  amendmentId: string;
  flowId: string;
  docVersion: number;
  /** F12：bootstrap detail 允许 null（仅当 bootstrap:true；与 P1.6/AC-25 一致）。 */
  baseTrunk: TrunkVersionRef | null;
  bootstrap?: boolean;       // baseTrunk===null ⇒ true
  summary?: string;
  items: TrunkAmendmentItem[];
}

/** .ans/trunk/amendment.json（应用维护的进行中状态）。 */
export interface TrunkAmendmentState {
  v: 1;
  schema: typeof TRUNK_AMENDMENT_SCHEMA;
  amendmentId: string;
  flowId: string;
  docPath: string;
  docSha256: string;          // VCA 提交时定格（application-submitted freeze）
  docVersion: number;
  baseTrunk: TrunkVersionRef | null;   // F12：bootstrap 可 null
  bootstrap?: boolean;
  status: TrunkAmendmentStatus;
  applyState: TrunkAmendmentApplyState;
  /** VCA 关联（P1.6 §5.3 新增；旧记录可缺省）。 */
  applicationId?: string;
  items: TrunkAmendmentItem[];
  checks?: TrunkAmendmentCheck[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  decidedAt?: string;
  appliedAt?: string;
  resultTrunkVersion?: number;
  journalId?: string;
  message?: string;
}

/** 整组一致性真值表（F24；8 项；具体 check id 以审核裁决为准：P1.3 原文可得则核对，否则以本候选冻结）。 */
export type TrunkAmendmentCheckId =
  | "roles-in-roster" | "boundary-role-has-card" | "module-owner-in-roster"
  | "workflow-roles-exist" | "d3-target-subset" | "roster-version-monotonic"
  | "contract-reference-chain" | "execution-goal-consistency";
export interface TrunkAmendmentCheck { checkId: TrunkAmendmentCheckId; ok: boolean; detail?: string; }

/** 跨文件提交日志（trunk manifest 写成功即提交点；phase 仅审计，F18/F27）。
 *  F4：补 "committed"；S2 在提交点后写，仅审计/诊断，不作提交判据。 */
export type TrunkApplyJournalPhase = "prepared" | "run-manifest-written" | "committed";
export interface TrunkApplySnapshot {
  trunkVersion: number;
  runId: string | null;
  documents: Partial<Record<TrunkDocKind, { path: string; sha256: string }>>;
  execution: {
    teamPlan: { path: string; sha256: string } | null;
    flow: { path: string; sha256: string; version: number } | null;
  };
  workflow?: { path: string; sha256: string };
  /** F3：role-card 快照同步。 */
  roleCards?: Record<string, { path: string; sha256: string }>;
  boundaries?: Record<string, { path: string; sha256: string }>;
}
export interface TrunkApplyJournal {
  v: 1;
  schema: typeof TRUNK_APPLY_JOURNAL_SCHEMA;
  journalId: string;
  amendmentId?: string;       // detail-amendment / trunk 升级
  applicationId?: string;     // VCA（version-upgrade）
  flowId: string;
  phase: TrunkApplyJournalPhase;
  /** 内容匹配主判据（F18）：target 与实际 run/trunk manifest 内容精确比对。 */
  target: TrunkApplySnapshot;
  before: TrunkApplySnapshot;
  startedAt: string;
  updatedAt: string;
  result?: "committed" | "apply-failed" | "applied-uncertain";
  message?: string;
}

/** trunk.state op（新写入集合）；观测/旧读 op 单列，不得由新代码写入。 */
export type TrunkStateOp =
  | "switched" | "unfrozen" | "refrozen" | "refrozen-cancelled" | "recovered" | "gap" | "stable-repinned";
export const TRUNK_STATE_OPS: readonly TrunkStateOp[] = Object.freeze([...]);
/** 仅旧读/兼容集合：P1.6 移除 drift；O5 未选 ⇒ 无 unfrozen-expired 新写入（PM 裁决 Q2）。 */
export type TrunkStateLegacyOp = "drift" | "unfrozen-expired";
export const TRUNK_STATE_LEGACY_OPS: readonly TrunkStateLegacyOp[] = Object.freeze(["drift", "unfrozen-expired"]);
/** 归属划分（PM 裁决 §4.1）：决策类/客户确认后动作 = customer；gap = application。 */
export const TRUNK_STATE_CUSTOMER_OPS: readonly TrunkStateOp[] =
  Object.freeze(["switched", "unfrozen", "refrozen", "refrozen-cancelled", "recovered", "stable-repinned"]);
export const TRUNK_STATE_APPLICATION_OPS: readonly TrunkStateOp[] = Object.freeze(["gap"]);

/** trunk 层错误码（候选集合；C1 冻结后为单一来源，C2c/S2 不另造同义码）。
 *  注：不设 `trunk-drift`（PM 裁决并入 `trunk-verify-failed`，不恢复 drift 状态）。 */
export const TRUNK_ERROR_CODES = [
  "trunk-unavailable", "trunk-manifest-invalid", "trunk-manifest-corrupt", "trunk-manifest-write-failed",
  "trunk-verify-failed", "trunk-version-invalid", "trunk-version-regression",
  "trunk-amendment-invalid", "trunk-amendment-not-found", "trunk-amendment-conflict",
  "trunk-amendment-status-invalid", "trunk-item-invalid", "trunk-boundary-expansion-unacknowledged",
  "trunk-high-risk-unacknowledged", "trunk-journal-corrupt", "trunk-journal-write-failed",
  "trunk-apply-failed", "trunk-apply-uncertain", "trunk-recovery-invalid",
] as const;
export type TrunkErrorCode = (typeof TRUNK_ERROR_CODES)[number];
```

- **[方案已定/裁决]** schema、生命周期、legacy 映射、item kind 收窄、`baseTrunk` 可空、`roleCards`、`committed` phase、`"upgrade"` source、op 归属、`stable-repinned` 字段均取自 P1.6 与 PM 审核 §4.1/§4.10/§5.1。
- **[候选·待审核]** 8 项 check id 名称（Q9，有条件冻结）；`TrunkStateView` 字段集（Q7）；错误码集合（Q11）。

### 3.2 `src/model/version-change.ts`（新；primary owner：运行时核心）

```ts
// version-change/v1、doc-freeze/v1、stable-write/v1、refactor-request/v1 共享 Model 契约
// （2026-11-04 C1 冻结候选，r2）。依赖方向：只允许 type-import ./trunk.ts（单向）；
// 不 import runtime.ts 或任何运行层；无 I/O、不执行判定。

import type { TrunkStableFileKind, TrunkVersionRef } from "./trunk.ts";

export const VERSION_CHANGE_SCHEMA = "version-change/v1";
export const DOC_FREEZE_SCHEMA = "doc-freeze/v1";
export const STABLE_WRITE_SCHEMA = "stable-write/v1";
export const REFACTOR_REQUEST_SCHEMA = "refactor-request/v1";

export const VERSION_CHANGE_ID_PATTERN = "^vc-[0-9]+$";
export const REFACTOR_REQUEST_ID_PATTERN = "^rf-[0-9]+$";
export const STABLE_WRITE_REQUEST_ID_PATTERN = "^sw-[0-9]+$";
export const AMENDMENT_ID_PATTERN = "^am-[0-9]+$";
export const VERSION_CHANGE_SUMMARY_MAX = 500;
export const REFACTOR_REASON_MAX = 1000;
/** F5：stable 许可 TTL 默认 30 分钟（C2c 冻结确认；过期拒绝且不自动补发）。 */
export const STABLE_WRITE_PERMIT_TTL_MS = 30 * 60 * 1000;

// —————————————— version-change/v1 ——————————————

export type VersionChangeKind = "detail-amendment" | "version-upgrade";
export const VERSION_CHANGE_KINDS: readonly VersionChangeKind[] = Object.freeze([...]);
export type VersionChangeStatus = "draft" | "submitted" | "approved" | "rejected" | "applied" | "superseded";
export const VERSION_CHANGE_STATUSES: readonly VersionChangeStatus[] = Object.freeze([...]);
export type VersionChangeInitiatorRoleId = "rapporteur" | "product";
/** 发起角色唯一映射（AC-3）：detail-amendment = rapporteur；version-upgrade = product。 */
export const VERSION_CHANGE_INITIATOR_BY_KIND: Readonly<Record<VersionChangeKind, VersionChangeInitiatorRoleId>> =
  Object.freeze({ "detail-amendment": "rapporteur", "version-upgrade": "product" });

/** P1.6 收窄：workflow/boundary/product-intent 不在 VCA。 */
export type VersionChangeTargetKind = "contract" | "roster" | "execution";
export const VERSION_UPGRADE_TARGET_KINDS: readonly VersionChangeTargetKind[] = Object.freeze(["contract", "roster"]);
export const DETAIL_AMENDMENT_TARGET_KINDS: readonly VersionChangeTargetKind[] =
  Object.freeze(["contract", "roster", "execution"]);
export const VCA_FORBIDDEN_TARGET_KINDS = Object.freeze(["workflow", "boundary", "product-intent"] as const);
export type VersionChangeTargetAction = "add" | "modify";
export interface VersionChangeTarget {
  kind: VersionChangeTargetKind;
  path: string;
  action: VersionChangeTargetAction;
  from?: string;
  /** 应用在提交时计算并定格（F38/AC-26）；文档/发起者不自报哈希。 */
  toSha256: string;
  roleId?: string;            // 仅旧 boundary target 读兼容
}

export interface VersionChangeRecord {
  v: 1;
  schema: typeof VERSION_CHANGE_SCHEMA;
  applicationId: string;                     // vc-<n>
  kind: VersionChangeKind;
  initiatorRoleId: VersionChangeInitiatorRoleId;
  flowId: string;
  baseTrunk: TrunkVersionRef | null;         // null 仅 bootstrap（F12/AC-25）
  bootstrap: boolean;                        // baseTrunk:null ⇒ true（且只允许一次）
  targets: VersionChangeTarget[];
  amendmentId?: string;                      // detail-amendment 必填（am-<n>）
  amendmentDocPath?: string;                 // detail-amendment 必填
  summary: string;                           // ≤ VERSION_CHANGE_SUMMARY_MAX
  status: VersionChangeStatus;
  submittedAt?: string;
  submittedBy?: string;
  applicationSha256?: string;                // 提交时定格申请记录
  decidedBy?: "customer";                    // 仅客户批准/拒绝
  decisionId?: string;
  decidedAt?: string;
  resultTrunkVersion?: number;
  journalId?: string;
  message?: string;
  at: string;
  updatedAt?: string;
}

export const VERSION_CHANGE_ERROR_CODES = [
  "vca-invalid", "vca-role-not-allowed", "vca-target-invalid", "vca-boundary-forbidden",
  "vca-base-mismatch", "vca-pending", "vca-conflict", "vca-channel-unavailable", "vca-rejected",
  "vca-apply-failed", "vca-hash-drift",
] as const;
export type VersionChangeErrorCode = (typeof VERSION_CHANGE_ERROR_CODES)[number];

// —————————————— doc-freeze/v1 ——————————————

export type DocFreezeReason =
  | "vca-approved" | "version-upgrade-approved" | "detail-item-applied"
  | "amendment-submitted" | "handoff-pin-bootstrap" | "bootstrap-vca-approved"
  | "migrated-legacy" | "proposal-confirmed" | "intent-confirmed";
export const DOC_FREEZE_REASONS: readonly DocFreezeReason[] = Object.freeze([...]);
/** reason → 归属（AC-31/F35）：客户确认类 = customer；提交/迁移/bootstrap = application（不冒充客户）。 */
export const DOC_FREEZE_CUSTOMER_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "vca-approved", "version-upgrade-approved", "detail-item-applied", "proposal-confirmed", "intent-confirmed",
]);
export const DOC_FREEZE_APPLICATION_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "amendment-submitted", "handoff-pin-bootstrap", "bootstrap-vca-approved", "migrated-legacy",
]);
export type DocFreezeOrigin = "customer" | "application";
/** R9 baseline 追加 variant 记录的冻结子形状（PM 审核 §4.2）。
 *  外层记录 = VersionBaselineRecord 公共字段（flowId/doc/version/path/sha256/recordedAt/recordedBy）
 *  + `event:"frozen"` + `freeze: DocFreezeRecord`；门禁引擎 type-import 本类型，不复制。
 *  `draft-updated`（同 path/version 新 sha）/`draft-marker`（migrated-draft 证据）由门禁引擎追加。 */
export const DOC_FREEZE_BASELINE_EVENT_KINDS = Object.freeze(
  ["frozen", "draft-updated", "draft-marker"] as const,
);
export interface DocFreezeRecord {
  schema: typeof DOC_FREEZE_SCHEMA;
  /** VCA/amendment/bootstrap application；`proposal-confirmed`/`intent-confirmed` 无 VCA 时
   *  由应用合成非空 `proposal-<decisionId>` / `intent-<decisionId>`（PM 裁决 §4.10-7，不得空串）。 */
  applicationId: string;
  reason: DocFreezeReason;
  origin: DocFreezeOrigin;
  decidedBy?: "customer";
  decisionId?: string;
  frozenAt: string;
  actorRoleId?: string;         // amendment-submitted: rapporteur；其余按触发源
}

/** 迁移标记（F29）：`migrated-legacy` 写冻结记录；`migrated-draft` **不写 doc.freeze**，仅 baseline
 *  `draft-marker` + 视图/审计标记（PM 审核 §4.2-3）。 */
export type DocMigrationMark = "migrated-legacy" | "migrated-draft";
export const DOC_MIGRATION_MARKS: readonly DocMigrationMark[] = Object.freeze(["migrated-legacy", "migrated-draft"]);

/** 冻结查询三态（F33 fail-closed：unknown 视为拒绝覆盖；快照缺失/损坏一律 unknown）。 */
export type DocFreezeLookupState = "frozen" | "draft" | "unknown";
export interface DocFreezeLookup {
  path: string;
  version?: number;
  state: DocFreezeLookupState;
  record?: DocFreezeRecord;
  migrationMark?: DocMigrationMark;
}

// —————————————— stable-write/v1（P1.6 §4.5.1/§5.2.1；F5 细化） ——————————————

export type StableFileKind = TrunkStableFileKind;   // workflow | role-card | boundary（单一定义）
export type StableWriteStatus = "requested" | "approved" | "rejected" | "written" | "failed";
export interface StableWriteRecord {
  v: 1;
  schema: typeof STABLE_WRITE_SCHEMA;
  requestId: string;            // sw-<n>
  roleId: string;
  path: string;
  kind: StableFileKind;
  /** F5：空字符串 "" 表示写入前文件不存在（新文件）；否则须等于当前文件 sha256。 */
  baseSha256: string;
  targetSha256: string;
  diffPreview: string;          // 有界；卡片展示
  status: StableWriteStatus;
  decisionId?: string;
  confirmationId?: string;
  approvedAt?: string;          // approved 后必填
  expiresAt?: string;           // approved 后必填（TTL 由 C2c 常量）
  consumedAt?: string;
  writtenAt?: string;
  at: string;
}

/** 一次性写许可（稳定写入 vs `stableWriteDecision` 的共享形状；C2b/C2c 联合消费）。 */
export type StableWriteAuthority =
  | { decisionId: string; confirmationId?: string }
  | { decisionId?: string; confirmationId: string };
export type StableWritePermitStatus = "approved" | "consumed" | "expired" | "failed";
export interface StableWritePermit extends StableWriteAuthority {
  schema: typeof STABLE_WRITE_SCHEMA;
  permitId: string;
  requestId: string;
  roleId: string;
  path: string;
  kind: StableFileKind;
  baseSha256: string;           // "" = 写入前不存在
  targetSha256: string;
  status: StableWritePermitStatus;
  approvedAt: string;
  expiresAt: string;            // 批准后必填
  consumedAt?: string;
  issuedAt: string;
}

/** `stableWriteDecision` 的无副作用判定入参（PM 审核 §4.3-2）：
 *  - 只读判定，不写盘、不消费、不发事件；输出沿用门禁引擎的 `WriteDecision`；
 *  - 校验 status==="approved"、path/kind/roleId 与 stableWritePathOf 一致、sha256===targetSha256、
 *    baseSha256 与当前文件一致（"" 时要求不存在）、未过期、未消费、许可与同步许可快照逐字段一致；
 *  - 无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝（fail-closed）。
 *  消费点：pre-write 不消费；post-write 由 B-11 `completeWrite(actualSha)` 复核后消费（F5）。 */
export interface StableWriteDecisionInput {
  projectRoot: string;
  relPath: string;
  sha256: string;
  permit: StableWritePermit;
  now: string;
}

export const STABLE_WRITE_ERROR_CODES = [
  "stable-write-invalid", "stable-write-permit-missing", "stable-write-permit-invalid",
  "stable-write-permit-expired", "stable-write-permit-consumed", "stable-write-path-mismatch",
  "stable-write-hash-mismatch", "stable-write-confirmation-missing", "stable-write-write-failed",
] as const;
export type StableWriteErrorCode = (typeof STABLE_WRITE_ERROR_CODES)[number];

// —————————————— refactor-request/v1（P1.6 §4.8；五值含 superseded，PM 裁决 Q10） ——————————————

export type RefactorRequestStatus = "requested" | "accepted" | "closed" | "rejected" | "superseded";
export const REFACTOR_REQUEST_STATUSES: readonly RefactorRequestStatus[] = Object.freeze([...]);
export const REFACTOR_REQUESTED_BY = "convener" as const;
export const REFACTOR_MANAGED_BY = "application-scheduler" as const;   // F31：应用调度层，不是角色
export type RefactorForbiddenKind = "versioned-doc" | "boundary" | "stable" | "team-plan" | "flow";
export const REFACTOR_FORBIDDEN_KINDS: readonly RefactorForbiddenKind[] = Object.freeze([
  "versioned-doc", "boundary", "stable", "team-plan", "flow",
]);
export interface RefactorRequestScope { modules: string[]; paths: string[]; roles: string[]; }
export interface RefactorRequestRecord {
  v: 1;
  schema: typeof REFACTOR_REQUEST_SCHEMA;
  requestId: string;            // rf-<n>
  flowId: string;
  initiatedBy: typeof REFACTOR_REQUESTED_BY;
  title: string;
  reason: string;               // ≤ REFACTOR_REASON_MAX
  scope: RefactorRequestScope;
  status: RefactorRequestStatus;
  managedBy: typeof REFACTOR_MANAGED_BY;
  enforcement: { writeSet: string[]; forbiddenKinds: RefactorForbiddenKind[] };
  at: string;
  updatedAt?: string;
  closedAt?: string;
  message?: string;
}

export const REFACTOR_ERROR_CODES = [
  "refactor-invalid", "refactor-role-not-allowed", "refactor-flow-missing",
  "refactor-scope-forbidden", "refactor-boundary-exceeded", "refactor-write-set-forbidden",
] as const;
export type RefactorErrorCode = (typeof REFACTOR_ERROR_CODES)[number];

// —————————————— doc-freeze 错误码（候选） ——————————————
export const DOC_FREEZE_ERROR_CODES = [
  "doc-freeze-invalid", "doc-freeze-registry-unavailable", "doc-freeze-registry-corrupt",
  "doc-freeze-write-failed", "doc-freeze-application-id-missing",
] as const;
```

- **[方案已定/裁决]** 四种 schema、VCA 字段与目标收窄、doc-freeze reason/归属/variant 记录、stable-write 记录与许可（F5）、refactor 记录（五值）、错误码（含 `vca-conflict`；`trunk-drift` 并入 `trunk-verify-failed`）逐项取自 P1.6 与 PM 裁决。
- **[候选·待审核]** `DOC_FREEZE_ERROR_CODES`/`REFACTOR_ERROR_CODES` 为 P1.6 未列候选（Q11）；`StableWriteDecisionInput` 的最终签名以 C2b/C2c 联合冻结为准（本提案提供共享形状）。

### 3.3 `src/model/runtime.ts` 精确增量（加法，不动既有语义）

1. **卡种与白名单（F2 裁决）**：在既有 `GovernanceCardKind`（`:430`）上加法：
   ```ts
   /** 应用自有、**永不进入判断分组**的治理卡种（P1.6 stable workflow 卡；项目级、无 flowId）。 */
   export type AppOwnedGovernanceCardKind = "stable-write";
   export const GOVERNANCE_APP_OWNED_CARD_KINDS: readonly AppOwnedGovernanceCardKind[] =
     Object.freeze(["stable-write"]);
   export type GovernanceCardKind =
     | GovernanceChoiceCardKind | GovernanceConfirmCardKind | "download" | AppOwnedGovernanceCardKind;
   ```
   - **不改** `GOVERNANCE_CARD_GROUP`（stable-write 不在表中 ⇒ `governanceCardGroup("stable-write") === undefined` ⇒ 永不判断；`test/编排/decision-card.test.ts` 的精确键集断言不变）。
   - 新增独立白名单常量（C2a `isGovernanceCardKind` 改读它；不直接读 GROUP 键集）：
     ```ts
     /** 账本 cardKind 白名单单一来源：判断分组键集 + app-owned 非判断卡种。 */
     export const GOVERNANCE_CARD_KINDS: readonly GovernanceCardKind[] = Object.freeze([
       ...(Object.keys(GOVERNANCE_CARD_GROUP) as GovernanceCardKind[]),
       ...GOVERNANCE_APP_OWNED_CARD_KINDS,
     ]);
     ```
   - **不改** `validateDecisionCardRequest`（编排 `decision-card.ts`）：stable-write 不适用 decision 校验（`applicable:false`，由 D1 独立最小结构校验）；VCA/detail/trunk 卡复用 `cardKind:"decision"` + `application:true` + 真实 `flowId`。
   - 编译解锁：`src/pipeline/orchestration/run-role.ts:2140` 的穷尽 `CARD_KIND_ROUTE_HINTS` 缺键由**编排 S3** 在其写集补一行（app-owned 卡、不得由角色工具发起），不要求本角色越界。
2. 六类事件接口（全部 `extends TaskStateEventBase`）：
   ```ts
   export interface TrunkStateEvent extends TaskStateEventBase {
     kind: "trunk.state";
     op: TrunkStateOp;
     trunkVersion: number;                      // stable-repinned 必填且与事件前一致
     previousTrunkVersion?: number;
     runId?: string | null;
     flowId?: string;
     source?: TrunkSource;
     decidedBy?: "customer";                    // 决策类/stable-repinned 必填；gap 缺省
     origin: "customer" | "application";
     channel?: "governance-card" | "application-observer" | "low-level-run-change";
     decisionId?: string;
     confirmationId?: string;                   // stable-repinned
     amendmentId?: string;
     journalId?: string;
     path?: string;                             // stable-repinned
     oldSha?: string;                           // stable-repinned
     newSha?: string;                           // stable-repinned
     reason?: string;
     scope?: string[];
     highRisk?: { acknowledged: true; items?: string[] };
     message?: string;
   }

   export interface TrunkAmendmentEvent extends TaskStateEventBase {
     kind: "trunk.amendment";
     amendmentId: string;
     flowId: string;
     status: TrunkAmendmentStatus;
     applyState?: TrunkAmendmentApplyState;
     applicationId?: string;                    // VCA 关联
     decidedBy?: "customer";                    // 客户逐项/批准决策；提交/应用缺省
     origin: "customer" | "application";
     decisionId?: string;
     journalId?: string;
     itemId?: string;
     itemKind?: TrunkAmendmentItemKind;
     itemResult?: TrunkAmendmentItemResult;
     resultTrunkVersion?: number;
     message?: string;
   }

   export interface VersionChangeEvent extends TaskStateEventBase {
     kind: "version.change";
     schema: typeof VERSION_CHANGE_SCHEMA;
     applicationId: string;
     vcKind: VersionChangeKind;                 // 业务 kind；C2a 按此校验（不写 kind）
     initiatorRoleId: VersionChangeInitiatorRoleId;
     flowId: string;
     status: VersionChangeStatus;
     baseTrunkVersion?: number;
     bootstrap?: boolean;
     targets?: { kind: VersionChangeTargetKind; path: string; action: "add" | "modify"; toSha256?: string }[];
     decidedBy?: "customer";                    // 仅 approved/rejected
     origin: "customer" | "application";
     decisionId?: string;                       // applied/superseded 也携带（PM 裁决 Q3）
     journalId?: string;
     resultTrunkVersion?: number;
     message?: string;
   }

   export interface DocFreezeEvent extends TaskStateEventBase {
     kind: "doc.freeze";
     schema: typeof DOC_FREEZE_SCHEMA;
     path: string;
     version: number;
     sha256: string;
     applicationId: string;
     reason: DocFreezeReason;
     origin: "customer" | "application";
     decidedBy?: "customer";                    // 仅客户确认类 reason
     decisionId?: string;
     actorRoleId?: string;
   }

   export interface RefactorRequestEvent extends TaskStateEventBase {
     kind: "refactor.request";
     schema: typeof REFACTOR_REQUEST_SCHEMA;
     requestId: string;
     flowId: string;
     initiatedBy: "convener";
     title: string;
     reason: string;
     scope: { modules: string[]; paths: string[]; roles: string[] };
     status: "requested" | "accepted" | "closed" | "rejected" | "superseded";
     managedBy: "application-scheduler";
     enforcement: { writeSet: string[]; forbiddenKinds: RefactorForbiddenKind[] };
   }

   export type StableWriteEventKind =
     | "stable.write.requested" | "stable.write.approved" | "stable.write.rejected"
     | "stable.write.written" | "stable.write.failed";
   export interface StableWriteEvent extends TaskStateEventBase {
     kind: StableWriteEventKind;
     schema: typeof STABLE_WRITE_SCHEMA;
     requestId: string;
     roleId: string;
     path: string;
     stableKind: StableFileKind;                // 业务 kind；C2a 按此校验（不写 kind）
     baseSha256: string;
     targetSha256: string;
     status: StableWriteStatus;                 // 与 kind 后缀同义冗余；校验以 kind 为准
     decidedBy?: "customer";                    // 仅 approved/rejected
     origin: "customer" | "application";
     decisionId?: string;
     confirmationId?: string;
     reason?: string;
     message?: string;
   }
   ```
3. `TaskStateEvent` 联合追加上述六类（`:991-1008`）。
4. `CustomerInputRequest` 加法（`:513-540`）——**F1 裁决：对象数组为准**：
   ```ts
   export interface CustomerInputAcknowledgement { id: string; label: string; required: boolean; }
   // (confirm | choice) & GovernanceCardMetadata & {
   //   acknowledgments?: CustomerInputAcknowledgement[];
   // }
   ```
   - D1 透传对象数组并在 `respondUnsafe` 按 `required` 结算；U1 按对象数组渲染；`request.resolved` **不加** `acknowledged` 字段（PM 审核 §5.3-4）。
5. `CustomerInputOutcome` answered 分支加法：`acknowledged?: string[]`（已勾选 acknowledgment id；缺席＝旧卡/无勾选项）。仅 answered；declined/unavailable 不加。
6. **不改** `GovernanceCardKind` 以外的判断器/委托字段、`GovernanceJudgeFacts`、`RequestPresentedEvent.to`、`ApprovalResolvedEvent.by`。
7. `RunRepinRecord` **不进** `runtime.ts`（Q8 裁决：编排 `run-manifest.ts`）。
8. **`WriteGate` 内容上下文（F6 裁决）**：
   ```ts
   export type WriteGateOperation = "write" | "edit";
   export interface WriteGateContext {
     /** 写前最终字节 sha256：write_file = Buffer.from(content)；edit_file = 编辑应用后、atomicWriteFile 前的字节。 */
     contentSha256?: string;
     operation?: WriteGateOperation;
   }
   /** 向后兼容：既有单参数实现/调用不变；可选第二参数缺席 = 旧语义。 */
   export type WriteGate = (targetPath: string, context?: WriteGateContext) => WriteDecision;
   ```
   - `src/provider/runtime/tools.ts`：`govern(...)` 增可选 `context`；`writeGuarded` 的第二次（写前复核）调用传 `{ contentSha256: sha256Hex(data), operation }`；首次调用与单参数 gate 行为不变。S3 `run-role.gate` 对 stable 路径消费 `context.contentSha256` 调 `stableWriteDecision`；无上下文（shell/opaque）⇒ stable 一律拒绝并提示 stable-write 通道（编排实现，不在本层）。

### 3.4 账本事件形状约定（C1 定义形状；C2a 实现白名单/逐 kind 校验）

| 事件 kind | 写入方（阶段） | 关键字段 | `decidedBy` / `origin` 归属（AC-31/F35 + PM 裁决 §4.1） | 负例（C2a 必须拒绝） |
| --- | --- | --- | --- | --- |
| `doc.freeze` | 编排 C2c 冻结服务 | path/version/sha256/applicationId/reason/actorRoleId? | reason ∈ `DOC_FREEZE_CUSTOMER_REASONS` ⇒ `decidedBy:"customer"`、`origin:"customer"`（`decisionId` 按触发源）；reason ∈ `DOC_FREEZE_APPLICATION_REASONS` ⇒ 无 `decidedBy`、`origin:"application"` | `amendment-submitted`/`migrated-legacy`/`handoff-pin-bootstrap` 记 customer；customer reason 缺 decisionId；`applicationId` 空串 |
| `version.change` | 编排 B-8 | applicationId/vcKind/initiator/flowId/status/targets/baseTrunkVersion/bootstrap?/decisionId?/journalId?/resultTrunkVersion? | `submitted` ⇒ application、无 decidedBy；`approved`/`rejected` ⇒ customer + decisionId；**`applied`/`superseded` ⇒ application + decisionId（不记 customer）** | submitted 记 customer；approved 无 decisionId；applied 冒充 customer；非 product 发 version-upgrade |
| `refactor.request` | 编排 B-9 | requestId/flowId/initiatedBy:"convener"/managedBy:"application-scheduler"/scope/enforcement/status | `origin:"application"`、无 `decidedBy`（不是客户决定） | 出现 customer decision/批准卡字段；managedBy 指向不存在的角色 |
| `stable.write.*` | 编排 B-11 | requestId/roleId/path/stableKind/baseSha256/targetSha256/decisionId?/confirmationId?/status | `requested`/`written`/`failed` ⇒ application；`approved`/`rejected` ⇒ customer + `decisionId` 或 `confirmationId` | requested/written 记 customer；approved 缺 authority id；`stableKind` 与 path 不一致 |
| `trunk.state` | 编排 S2/S3/S4、桌面 D1 | op/trunkVersion/previousTrunkVersion?/runId?/source?/channel?/highRisk?/amendmentId?/journalId?/path?/oldSha?/newSha?/confirmationId? | `TRUNK_STATE_CUSTOMER_OPS`（switched/unfrozen/refrozen/refrozen-cancelled/recovered/stable-repinned）⇒ customer；**`gap` ⇒ application、`decidedBy` 缺省、channel `low-level-run-change`**；legacy `drift`/`unfrozen-expired` 仅旧读 | stable-repinned 升 trunkVersion / 缺 confirmationId；gap 记 customer；`highRisk.acknowledged` 非 true；无 trunk 时写 stable-repinned |
| `trunk.amendment` | 编排 S2/S4 | amendmentId/flowId/status/applyState?/applicationId?/itemId?/itemKind?/itemResult?/decisionId?/journalId? | 客户批准/拒绝、逐项 `applied/kept/cancelled` ⇒ customer + decisionId；`submitted`、applyState 应用动作、`apply-failed`/`applied-uncertain` ⇒ application、`decidedBy` 缺省 | 提交/应用记 customer；新 detail 写入 workflow/boundary item；targets↔items 不一致 |

**通用形状纪律**（Model 注释 + C2a 校验）：`v:1`/`at` 由 `TaskStateEventBase` 固定；事件均为**加法**，旧读者把未知 kind 当坏行跳过、不阻塞、不丢数据；**不写密钥/隐私**；轮转后当前状态从文件恢复（AC-11）。`trunk.state(stable-repinned)` 的精确形状（P1.6 §5.5 + PM 裁决）：`{ kind:"trunk.state", op:"stable-repinned", trunkVersion:<不变>, decidedBy:"customer", origin:"customer", path, oldSha, newSha, confirmationId, decisionId, at }`——**trunkVersion 必填且与事件前一致**；无 trunk manifest 时不写该事件，只记待续接（C2a/S2 共同保证 AC-34）。**事件校验必须消费 C1 常量**（`DOC_FREEZE_*_REASONS`/`TRUNK_STATE_*_OPS`），不得复制字面量。

### 3.5 依赖方向与单一来源

```text
src/model/trunk.ts            （零项目依赖）
      ↑ type-only
src/model/version-change.ts   （只依赖 ./trunk.ts）
      ↑ type-only               ↑
src/model/runtime.ts ───────────┘（既有：type-import ./project-state.ts 等；本次加两行）
```

- `src/model/trunk.ts` **不 import `runtime.ts`**（任务书硬要求），也不 import `project-state.ts`/运行层。
- `version-change.ts` 只 type-import `TrunkStableFileKind`/`TrunkVersionRef`，不复制 `baseTrunk`/stable kind 第二形状。
- `runtime.ts` 是**账本事件形状唯一来源**；消费方（编排 C2a、桌面 D1）从 `runtime.ts` 导入事件类型，从两个新 Model 文件导入记录/枚举常量；**不复制字面量、不另造同义枚举**。
- **R9 记录（PM 裁决 §4.2）**：`versions.jsonl` 采用 **append variant 记录**——`{ ...VersionBaselineRecord 公共字段, event:"frozen", freeze: DocFreezeRecord }`、`draft-updated`、`draft-marker`；`VersionBaselineRecord` 的既有 `baseline`/`version-added` 保留；**不给既有记录加可选 `freeze` 字段**。`DocFreezeRecord` 单一定义，门禁引擎 type-import；`doc-freezes.json` 仅可重建派生缓存；冻结记录只经门禁引擎 C2b `appendDocFreezeRecords` 追加（同 `versions.lock`/fencing），B-6/B-7 不直接写 `versions.jsonl`。
- `StableWritePermit`/`StableWriteDecisionInput` 单一定义；门禁引擎 `stableWriteDecision` 与编排 B-7/B-11 共同消费（C2b/C2c 联合契约）。
- `GOVERNANCE_CARD_KINDS` 为账本 cardKind 白名单单一来源；`GOVERNANCE_CARD_GROUP` 仍只表达判断分组（stable-write 不在其中）。
- 所有新增字段/类型为**加法**；不改既有字段语义、不删除、不重命名既有导出。

### 3.6 常量/错误码单一来源与消费方

| Model 常量/类型 | 消费方 | 用途 |
| --- | --- | --- |
| `TRUNK_AMENDMENT_LEGACY_STATUS_MAP` | 编排 S2、桌面 D1、测试 T1 | P1.3→P1.6 状态映射（AC-32），旧事件读取不改写旧账本 |
| `TRUNK_AMENDMENT_VCA_ITEM_KINDS` / `TRUNK_AMENDMENT_LEGACY_ITEM_KINDS` | 编排 B-7/B-8、测试 | detail item kind 收窄（AC-6/AC-28）；workflow/boundary 仅旧读 |
| `VERSION_CHANGE_INITIATOR_BY_KIND` | 编排 B-7/B-8、桌面 D1 | 发起角色唯一映射（AC-3） |
| `VERSION_UPGRADE_TARGET_KINDS` / `DETAIL_AMENDMENT_TARGET_KINDS` / `VCA_FORBIDDEN_TARGET_KINDS` | 编排 B-7/B-8、桌面、测试 | VCA 目标校验（AC-5/AC-19/AC-29/AC-30） |
| `DOC_FREEZE_REASONS` / `DOC_FREEZE_CUSTOMER_REASONS` / `DOC_FREEZE_APPLICATION_REASONS` / `DOC_FREEZE_BASELINE_EVENT_KINDS` | 编排 C2c、门禁引擎 C2b、C2a、测试 | reason 合法性 + 归属（AC-31）+ R9 variant 记录 |
| `DOC_MIGRATION_MARKS` | 编排 C2c、门禁引擎、桌面 | F29 迁移标注；`migrated-draft` 不写 doc.freeze |
| `REFACTOR_FORBIDDEN_KINDS` / `REFACTOR_MANAGED_BY` | 编排 B-9、任务写集/WriteGate 校验、测试 | 重构机械限制（AC-7/F40） |
| `TRUNK_STATE_OPS` / legacy ops / customer/application ops | 编排 S2/S3/S4、C2a、桌面、测试 | op 白名单 + 归属（AC-31/AC-34） |
| `GOVERNANCE_CARD_KINDS` / `GOVERNANCE_APP_OWNED_CARD_KINDS` | 编排 C2a、桌面 D1、桌面UI U1 | cardKind 白名单（含 `stable-write`）；GROUP 不变（AC-13/AC-18/AC-33） |
| `STABLE_WRITE_PERMIT_TTL_MS` / `StableWritePermit` / `StableWriteDecisionInput` | 编排 B-7/B-11、门禁引擎 C2b | 许可一次性/TTL/判定（AC-35） |
| 各 `*_ERROR_CODES` | 编排/门禁引擎/桌面 | 稳定错误码（不在各层另造同义码；含 `vca-conflict`） |

### 3.7 本提案的取舍（非 B-x 变更）

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| `RunRepinRecord` 放哪 | **编排 `run-manifest.ts` 内定义**，不进 `runtime.ts` | 仅 run manifest 读写；无跨 Model 消费（PM 裁决 Q8） |
| `project-state.ts` 是否加 trunk 投影 | **不加** | trunk/VCA/freeze 经专用 `trunk:state` 快照与面板；PM 裁决 Q7 |
| `GovernanceCardKind` 是否加新卡种 | **只加 app-owned `stable-write`**；VCA/detail/trunk 复用 `decision` | F2 裁决；stable workflow 卡无 flowId 不能走 decision；stable-write 不进 GROUP、永不判断 |
| 冻结缓存 `doc-freezes.json` 形状 | **不进 Model** | 可重建派生缓存，编排 C2c/B-6 私有实现；Model 只定义 `DocFreezeRecord` 子形状与查询三态 |
| R9 记录形状 | **append variant**（F4/F6 审核裁决） | 不给既有记录加可选字段；latest-record-per-path；旧 app fail-closed 披露 |
| `stable-write` 许可消费 | Model 定义形状与判定入参；消费点按 PM 裁决：pre-write 判定、post-write 复核消费、失败作废 | 一次性语义涉及同步守卫与写后校验的时序 |
| `WriteGate` 内容哈希 | 扩可选第二参数；`tools.ts` 第二次 `govern` 传最终字节 sha | F6 裁决；向后兼容；不改工具契约 |
| 事件内「业务 kind」字段命名 | `VersionChangeEvent.vcKind`、`StableWriteEvent.stableKind`（PM 裁决保留） | 避免与事件判别字段 `kind` 冲突 |

---

## 4. 与 P1.6 实施注意点的映射

### 4.1 §5.4 九条基础注意点

| # | P1.6 注意点 | 本层落点（Model） | 冻结前确认 / 测试 |
| --- | --- | --- | --- |
| 1 | **R9 权威**：`versions.jsonl` 为冻结事实；`doc-freezes.json` 派生缓存；不双写双判 | `DocFreezeRecord` 为 R9 `event:"frozen"` variant 的 `freeze` 子形状（单一定义，门禁引擎 type-import）；`DOC_FREEZE_BASELINE_EVENT_KINDS`；缓存形状不入 Model；`DocFreezeLookup.state` 三态 | 审核裁决 §4.2；`version-change-contract.test.ts` 断言 record 字段、事件集合与 reason 集合 |
| 2 | **守卫真实调用点**：唯一同步 `versionedDocOverwriteDecision`；覆盖写/删/改/移/pin/re-pin；`checkVersionedDocWrite` 不依赖 | Model 不定义守卫函数；`DocFreezeLookupState` 提供 `frozen|draft|unknown` 供 C2b fail-closed；`stableWriteDecision` 输入形状供 C2b | C2b 主属；Model 测试只钉三态与 reason |
| 3 | **迁移默认**：既有文档一律冻结；`migrated-draft` 标注+证据可改；missing=迁移、corrupt=fail-closed | `DOC_MIGRATION_MARKS`；`migrated-legacy` ∈ freeze reasons、`migrated-draft` **不是** freeze reason（改为 baseline `draft-marker`） | 审核裁决 §4.2-3；测试断言两个标记分区 |
| 4 | **Bootstrap**：`handoff-pin-bootstrap`；`baseTrunk:null`+`bootstrap:true`；`pinRun` 只 pin 冻结文档 | `DocFreezeReason` 四个 bootstrap/确认 reason；`VersionChangeRecord.baseTrunk` 可 null + `bootstrap`；`TrunkAmendmentDoc/State.baseTrunk` 可 null + `bootstrap?`（F12）；`TrunkSource:"bootstrap"`；`TrunkManifest.runId` 可 null | Q13；测试断言 bootstrap 组合常量与 reason 归属 |
| 5 | **VCA 通道/重验**：卡复用治理会话通道；批准前重算 `toSha256` | `VersionChangeTarget.toSha256`、`applicationSha256`；`vca-hash-drift`/`vca-conflict` 错误码；VCA 卡复用 `decision`（带 flowId） | AC-26；测试断言字段存在与错误码冻结 |
| 6 | **重构写集**：任务写集仅模块代码目录；WriteGate 拒绝版本化/边界/stable/teamPlan/flow | `RefactorForbiddenKind` + `REFACTOR_FORBIDDEN_KINDS`；`enforcement.forbiddenKinds` 字段 | AC-7；测试断言五类禁止项与 `managedBy` 字面量 |
| 7 | **detail 最小项**：只要求实际变更项；none 不是 target；workflow/boundary 不在 detail | `TrunkAmendmentItemChange` 含 `"none"` 但注释「none 不是 VCA target」；`TRUNK_AMENDMENT_VCA_ITEM_KINDS` 与 legacy 集合分离 | AC-28；测试断言 kind 集合与 none 不在 target kind |
| 8 | **stable 单一路径**：常规 stable 走确认即写；主干升级仅紧急/恢复 | `StableFileKind`/`StableWriteRecord`/`StableWritePermit`；`trunk.state(stable-repinned)`；新写 op 不含 drift；`TrunkStateLegacyOp` 仅读 | AC-30/AC-33–AC-36；测试断言 op 分区与 legacy 集合 |
| 9 | **基线披露**：`f4c24eae`→`89b1fb2`；重记 B0；旧证据不复用 | 本提案 §1/§9 如实披露；Model 为 greenfield，不存在旧实现证据复用 | E1 披露；本提案不声称任何既有行为回归 |

### 4.2 §10.5 P1.6 stable 增量七条 + PM 裁决补充

| # | P1.6/PM 注意点 | 本层落点 | 冻结前确认 / 测试 |
| --- | --- | --- | --- |
| 1 | workflow 写路径：轻量确认卡（diff preview）；不重建 drift | `StableWriteRecord.diffPreview`；`StableFileKind:"workflow"`；无 drift 新写 | AC-33；测试字段与状态机枚举 |
| 2 | stable 写入门禁：一次性许可、路径/哈希绑定、hash = targetSha | `StableWritePermit`（path/kind/base/target/authority/status/approvedAt/expiresAt/consumedAt）；`StableWriteDecisionInput`；`STABLE_WRITE_ERROR_CODES`；`STABLE_WRITE_PERMIT_TTL_MS` | F5 裁决；测试 permit 形状、空 base、过期/消费/失败作废 |
| 3 | mini re-pin：更新 stable 快照 + decisionId/confirmationId；trunkVersion 不变 | `TrunkManifest.artifacts.workflow/roleCards/boundaries`（F3）；`TrunkStableArtifactRef.confirmationId/decisionId/kind`；`TrunkStateEvent` 的 path/oldSha/newSha/confirmationId/decisionId；`TRUNK_STATE_CUSTOMER_OPS` 含 stable-repinned | AC-34；测试事件形状与三类快照 |
| 4 | VCA 收窄：workflow/boundary/product-intent 不得为 target | `VCA_FORBIDDEN_TARGET_KINDS`；upgrade/detail target kind 常量 | AC-5/AC-19/AC-29/AC-30；测试常量与负例类型 |
| 5 | 模块归属：guard/service/pipeline 不属本角色 | 本提案写集仅两个 Model 文件 + `runtime.ts` 加法 + `tools.ts` 最小改 + 测试 | 审核核对写集；不写 `src/common/**`/`src/service/**`/`src/pipeline/**` |
| 6 | 不升 trunkVersion | `trunk.state(stable-repinned)` 的 `trunkVersion`（不变值）；测试钉「无新版本字段」；`TrunkStableArtifactRef` 不含版本号 | AC-34；测试断言事件无 `resultTrunkVersion`/新版本 |
| 7 | 其余 §5.4 继续有效 | 见 §4.1 | — |
| 8 | **F2 卡种**：stable 卡 app-owned、不进 GROUP | `AppOwnedGovernanceCardKind`/`GOVERNANCE_CARD_KINDS`；`governanceCardGroup` 不变 | 测试：GROUP 不含 stable-write；白名单含；`governanceCardGroup("stable-write")===undefined` |
| 9 | **F4 提交日志/来源**：`committed` phase；`"upgrade"` | `TrunkApplyJournalPhase` 三值；`TRUNK_SOURCES` | 测试：phase 集合、source 集合 |
| 10 | **F6 写前内容哈希**：`WriteGate` 可选上下文；tools.ts 传最终字节 | `WriteGateContext`/`WriteGate`；tools.ts 第二次 govern | 测试：第二次 gate 收到 contentSha256；旧单参数零变化 |

---

## 5. 对验收证据计划的贡献（Model 侧）

### 5.1 测试文件与用例（C1 实施）

| 文件 | 用例（断言点） | 覆盖 AC |
| --- | --- | --- |
| `test/runtime-core/trunk-contract.test.ts`（新） | 1) schema 常量、`TRUNK_VERSION_MIN`；2) `TRUNK_SOURCES` 含 bootstrap/recovery/upgrade（无 main-upgrade）；3) 生命周期枚举 + legacy 映射 `proposed→submitted`/`confirmed→approved`/`cancelled→rejected` 全覆盖且无额外键；4) `TRUNK_AMENDMENT_VCA_ITEM_KINDS` = contract/roster/execution、legacy = workflow/boundary、两集不相交；5) `TRUNK_STATE_OPS` 含 stable-repinned 且不含 drift/unfrozen-expired（后者仅在 legacy 集合）；6) customer/application op 分区穷尽且互斥（gap=application）；7) `TrunkManifest`（含 `artifacts.roleCards`）、`TrunkAmendmentDoc/State`（含 `baseTrunk:null`+`bootstrap:true`）、`TrunkApplyJournal`（phase 含 `committed`）、`TrunkStateView` 最小正例 `satisfies`；8) `TrunkStateEvent`/`TrunkAmendmentEvent` 可赋给 `TaskStateEvent`；9) `trunk.state(stable-repinned)` 样例含 path/oldSha/newSha/confirmationId/decisionId 且无升版本字段；10) 错误码无重复；非法 op/status 的 `@ts-expect-error` 负例 | AC-1/AC-16/AC-25/AC-31/AC-32/AC-34（Model 侧） |
| `test/runtime-core/version-change-contract.test.ts`（新） | 1) 四 schema 常量 + ID 正则（含 `am-<n>`）；2) `VERSION_CHANGE_INITIATOR_BY_KIND`；3) upgrade/detail target kind 集合、`VCA_FORBIDDEN_TARGET_KINDS`；4) `VersionChangeRecord` 正例（`baseTrunk:null`+`bootstrap:true`；`applicationSha256`）；5) `DOC_FREEZE_REASONS` 与 customer/application 两分区并集恰等于全集、交集为空；`migrated-draft` 不在 reasons；`DOC_FREEZE_BASELINE_EVENT_KINDS` = frozen/draft-updated/draft-marker；6) `DocFreezeRecord`/`DocFreezeLookup` 三态；7) `StableWriteRecord`/`StableWritePermit`（status/approvedAt/expiresAt/consumedAt/baseSha256=""）+ `StableWriteDecisionInput`；8) `RefactorRequestRecord` 的 `initiatedBy`/`managedBy`/五值状态/五类 forbidden kinds；9) `VersionChangeEvent`/`DocFreezeEvent`/`RefactorRequestEvent`/`StableWriteEvent` 五 kind 可赋给 `TaskStateEvent`；10) `CustomerInputRequest.acknowledgments` 对象数组（id/label/required）与 `CustomerInputOutcome.acknowledged: string[]`；11) 错误码无重复（含 `vca-conflict`）+ 负例 | AC-2/AC-3/AC-5/AC-6/AC-7/AC-10/AC-15/AC-18/AC-19/AC-26/AC-27/AC-28/AC-30/AC-31/AC-33/AC-35（Model 侧） |
| `test/runtime-core/file-write-safety.test.ts`（最小更新） | 第二次 `govern` 收到 `{operation, contentSha256}`（write/edit 各一例，sha 与最终字节一致）；单参数旧 gate 实现/调用零变化；写前复核拒绝仍不落盘 | AC-33/AC-35 的写前判定支撑（Model/工具侧） |
| 既有 runtime-core 测试 | 预期**不改**（除上表 file-write-safety 的最小用例；新增 imports 为加法）。若出现必须更新的既有测试，逐条理由写完成报告；**不改写断言以保绿** | — |

### 5.2 命令与证据

- `node --test "test/runtime-core/**/*.test.ts"`（定向；记录 pass/fail/skip 计数与原始输出）；
- `npm run typecheck`（编译期契约，含 `test/`；记录 exit code/输出）；
- 候选哈希：`git rev-parse HEAD`、逐文件 `git hash-object` + `sha256sum`、`git status --porcelain -uall | sort` 快照；`git diff --stat`；
- **Model 不能证明的**：守卫行为（C2b）、冻结服务/迁移/bootstrap（C2c）、账本逐 kind 校验（C2a）、VCA 状态机（B-7/B-8）、stable 许可/mini re-pin（B-7/B-11/C2b）、桌面客户主权（D1）、跨层集成（T1）。本层证据只覆盖**形状/常量/枚举/错误码/可赋值性/写前 gate 上下文**，E2 不得以 Model 测试替代上述 AC 的运行时证据。
- **正反例纪律**：正例用 `satisfies`/显式类型标注；负例用 `@ts-expect-error`（沿 `download-contract.test.ts:106-108` 先例）；枚举/集合断言用排序后 `deepEqual`，避免顺序耦合。

### 5.3 AC 覆盖边界（如实）

| AC | Model 侧贡献 | 不由此层证明（留给） |
| --- | --- | --- |
| AC-1/AC-10/AC-27 | R9 variant 子形状/查询三态/迁移标记/reason 归属 | 守卫同步判定、R9 重建/对账（C2b/C2c） |
| AC-2/AC-4/AC-6/AC-28/AC-32 | 生命周期/legacy 映射/item kind 收窄 | 状态机与逐项卡行为（S2/B-8/D1） |
| AC-3/AC-5/AC-19/AC-29/AC-30 | 发起映射/target kind/禁止目标/字段 | 校验执行与卡通道（B-7/B-8/D1） |
| AC-7/AC-8 | refactor 记录形状/归属字面量/五类禁止 | 写集机械执行（WriteGate/任务派发） |
| AC-13/AC-14/AC-16/AC-17/AC-20/AC-21/AC-23/AC-24 | 契约形状与常量（含 `GOVERNANCE_CARD_KINDS`） | 安全/并发/兼容/UI/文档（各层） |
| AC-18/AC-33–AC-36 | acknowledgments 对象数组/stable 记录/permit/stable-repinned 事件形状 | 卡渲染、许可消费、mini re-pin、面板（D1/B-11/C2b/C2c） |
| AC-25/AC-26/AC-31 | bootstrap 类型/reason、哈希字段、归属分区 | 路径执行、漂移注入、账本校验（C2a/C2c） |

---

## 6. 契约冻结前需澄清的技术问题（PM 裁决后的状态）

> PM 审核已裁决 Q1–Q14（审核记录 §5.1）。下表保留历史问题并标注裁决状态；**未决项**不阻断 P1 实质，但 C1 冻结点须按标注执行。

| # | 问题 | PM 裁决（r2） | 本提案落点 |
| --- | --- | --- | --- |
| **Q1** | P1.3 原文不可得，是否以提案 §3.1/§3.2 为 C1 冻结候选 | **采纳（有条件）**：以本提案为 C1 候选；若沟通在 C1 前提供 P1.3 快照则逐字段核对；否则 C1 冻结声明注明「形状派生自 P1.6 + 本审核裁决」 | §3.1/§3.2；复审确认 |
| **Q2** | `trunk.state` op 归属（gap/drift/stable-repinned） | **裁决**：gap = application、`decidedBy` 缺省、channel `low-level-run-change`；drift/unfrozen-expired 仅 legacy 读；stable-repinned = customer | §3.1/§3.4 |
| **Q3** | applied 类事件归属 | **裁决**：`version.change.applied/superseded`、`stable.write.written/failed`、`trunk.amendment` applied/apply-failed = application + `decisionId`（不记 customer） | §3.3/§3.4 |
| **Q4** | 一次性许可消费点 | **裁决细化**：pre-write 纯函数判定（不消费）；post-write `completeWrite(actualSha)` 复核后消费；失败/异常 ⇒ 许可作废（failed/consumed，不可复用）+ fail-closed + 恢复；guard 不做写盘/不发事件 | §3.2 `StableWriteDecisionInput`/§3.4 |
| **Q5** | `acknowledgments` 用途收窄 | **采纳**：对象数组 `{id,label,required}`；D1 透传 + 按 required 结算；U1 对象数组渲染；`request.resolved` 不加 `acknowledged`；id 词表 D1/C3 定义，不写入 Model 枚举 | §3.3-4/5 |
| **Q6** | `migrated-draft` 不是 freeze reason | **采纳**：硬约束；只出现在 baseline `draft-marker`、`DocFreezeLookup.migrationMark` 与视图 | §3.2 |
| **Q7** | 是否给 `project-state.ts` 加 trunk 投影 | **采纳**：不加；D1/U1 用 `trunk:state`；若需另案（条件项） | §2-8/§3.7 |
| **Q8** | `RunRepinRecord` 位置 | **采纳**：编排 `run-manifest.ts`；`runtime.ts` 不加 | §3.3-7/§3.7 |
| **Q9** | 8 项整组一致性 check id | **澄清+采纳候选**：有 P1.3 原文则核对，否则以提案候选冻结并在 C1 声明注明；S2 内部 id | §3.1 |
| **Q10** | `RefactorRequestStatus` 是否含 `superseded` | **采纳**五值（含 superseded）；状态迁移文档化；C2a 校验 | §3.2 |
| **Q11** | 错误码/ID 正则/事件字段命名 | **裁决**：采纳候选码集并**补 `vca-conflict`**；`trunk-drift` 并入 `trunk-verify-failed`；ID 正则与 `am-<n>` 采纳；事件字段保留 `vcKind`/`stableKind` | §3.1/§3.2/§3.3 |
| **Q12** | V1 哈希差异 | **裁决**：以当前 350 行 / `3c40acad…` 为准；`75bf7a49…` 旧快照由沟通/统筹更正 | 头部/§1.1/§9 |
| **Q13** | bootstrap 期 `TrunkManifest.runId` 可 null | **采纳**：可 null；首个 handoff pin 回填；`vca-base-mismatch` 以 `trunkVersion`+`digest` 为主 | §3.1/§3.2 |
| **Q14** | `digest` 算法 | **采纳**：Model 只声明字符串；S2 在 C2c/S1 文档化规范化 JSON sha256 | §3.1 |
| **Q15（新增/跨角色）** | `stable-write` 卡种的编译解锁 | **裁决**：编排 S3 在 `run-role.ts` 的 `CARD_KIND_ROUTE_HINTS` 补一行（本角色不改）；`GOVERNANCE_CARD_GROUP` 键集断言不变 | §3.3-1；跨角色依赖，不阻断 C1 |
| **Q16（新增/写集）** | `tools.ts` 内容哈希落点补登 | **裁决**：F6；本角色把 `src/provider/runtime/tools.ts` 补入 C1 写集（Section 1 单文件，非边界变更）；团队计划 §4.1「预计否」由统筹 E1 披露更正 | §2-4/§3.3-8 |

**仍未决/需材料项**：Q1（P1.3 快照，若有）、Q9（8 项 check id 原文）；均不阻断本提案复审，C1 冻结声明须注明来源。

---

## 7. 风险与替代

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | **P1.3 契约不可得**导致字段形状与既定内部机制不一致（Q1） | 高：消费方返工 | 本提案为 C1 候选；P1.3 快照可得则核对；C1 声明注明派生来源 |
| R2 | 事件形状冻结后被消费方私改/复制字面量 | 高：账本不一致 | 单一来源 + C2a 校验消费 Model 常量；E1 核对无第二份枚举；C1 冻结声明 |
| R3 | 归属语义再变（Q2/Q3 已裁决） | 中高：AC-31 返工 | 归属表集中 §3.4；常量集中；裁决后不改消费者字面量 |
| R4 | 冻结记录与 R9 baseline 双形状 | 高：双账本（F34） | `DocFreezeRecord` 单一子形状；variant 记录由门禁引擎追加；**不得**给既有记录加 `freeze?`；快照单一实现归 C2b（PM F7） |
| R5 | `acknowledgments` 加法破坏旧消费者（judge/委托/结算） | 中：兼容 | 可选字段；旧读者忽略；D1 只在应用卡路径读取；Model 测试钉「无该字段仍合法」 |
| R6 | stable permit 一次性语义的 TOCTOU（F5） | 高：AC-35 | pre-write 判定 + 原子写 + post-write 复核消费 + 失败作废；残余窗口 E1 披露；T1 故障注入（base 变化/post-write 不符/复用/过期/快照不可用） |
| R7 | 本层越界写守卫/服务/Pipeline | 高：边界违规 | 写集仅 §2；`tools.ts` 为 F6 裁决的计划枚举补登；发现需要新文件即停止回报 |
| R8 | Model 循环依赖（runtime↔version-change/trunk） | 中：typecheck | §3.5 DAG；trunk.ts 零依赖；只允许单向 type-import |
| R9 | 把「无旧实现」误报为「回归通过」 | 中：证据失真 | §1.2/§4.1-9 如实披露；E1/E2 不得声称既有 trunk 行为零回归 |
| R10 | `stable-write` 卡种误入判断分组 ⇒ 被「替我决策/审批」代选 | 高：客户主权 | F2 裁决钉死：不进 `GOVERNANCE_CARD_GROUP`；`governanceCardGroup` 返回 undefined；C2a/D1/U1 测试 |
| R11 | `GOVERNANCE_CARD_KINDS` 白名单与 GROUP 键集漂移 | 中：卡种校验不一致 | 白名单由 GROUP 键集 + app-owned 常量**派生**（非手写复制）；C2a 改读白名单；GROUP 键集断言不变 |
| R12 | `tools.ts` 内容哈希改动影响既有 write/edit 行为 | 中：回归 | 仅第二次 govern 传可选上下文；单参数 gate 兼容；新增用例 + 既有 runtime-core 回归 |
| R13 | `WriteGate` 无内容上下文的 shell/opaque 路径无法写 stable | 中：UX/绕过尝试 | 按 PM 裁决：无上下文 ⇒ stable 一律拒绝并提示 stable-write 通道（S3/C2b 实现）；Model 不承诺旁路 |
| R14 | 引用版本再次漂移（B0/V1/G2a） | 低中：证据失真 | 本提案使用 PM 裁决版本；复审/实施/E1 以最新记录为准，旧哈希不复用 |

**替代方案**（供复审比较）：
- **A（本提案）**：两个新 Model 文件 + `runtime.ts` 事件/卡种/WriteGate 加法 + `tools.ts` 最小改。
- **B**：全部类型塞进 `runtime.ts`（少一个文件，但破坏「事件形状 vs 记录形状」分层；不推荐）。
- **C**：事件按域拆分多个新文件——超出 B-1/B-5 精确路径，属写集扩张；不采纳。
- **D（stable 卡复用 decision）**：被 PM F2 驳回（无 flowId，`validateDecisionCardRequest` 不可过）；不采纳。

---

## 8. 实施顺序与依赖（C1 内）

1. `src/model/trunk.ts`（零依赖）→ 2. `src/model/version-change.ts`（依赖 trunk）→ 3. `src/model/runtime.ts` 加法（事件 + 卡种/白名单 + WriteGate 上下文 + ack）→ 4. `src/provider/runtime/tools.ts` 写前复核传内容哈希 → 5. 两个契约测试 + `file-write-safety` 最小用例 → 6. `npm run typecheck` + `node --test "test/runtime-core/**/*.test.ts"` → 7. `api-spec.md`/`memo.md` 记录 + **C1 冻结声明**。
- **冻结前**：P1 复审通过 + Q1/Q9 材料状态确认（可得则核对，不可得则 C1 声明注明）；F2 的 `run-role.ts` 编译解锁由编排 S3 在其节点完成，不阻塞 C1 类型冻结（但 `npm run typecheck` 全仓会因穷尽表缺键失败——C1 冻结声明须披露或等 S3 一行先落；按团队计划 C1/S3 并行，建议 C1 冻结时以定向 typecheck 记录并在 E1 说明）。
- **冻结后**：C2a（账本白名单/逐 kind 校验）、C2b（守卫/许可）、C2c（冻结服务 API）、S1–S4、D1、U1、T1 只按冻结形状消费；任何形状变更回本角色并重跑受影响证据（团队计划 §5.1 C1 出口）。
- C1 与 C2a/C2b/C2c/C3 写集不相交，可并行；**C2a/C2b/C2c 不因等待本提案而写引用代码**（当前未派发）。

---

## 9. 基线披露与声明

- **基线**：HEAD `89b1fb2`（origin/main，含下载特性 PR #62）；本 worktree 无产品/测试改动；`src/app/test` 工作树干净；`docs/planning/memo.md` 等为其他角色的管理文档修改（非本角色写入）。
- **greenfield 披露**：全仓无 trunk 实现；本特性的「旧事件兼容」指**契约读侧兼容**（旧账本/未知 kind），不是既有 trunk 代码行为；P1.3/P1.6 内部机制为设计承诺，由 C1/S1–S4/D1 首次实现。
- **引用口径**：B0 最终版 221 行 / `8c6272d5…`；V1 v1.1 350 行 / `3c40acad…`；G2a 25 行 / `bfac5781…`（旧 173 行/`27f9b94d…`、`75bf7a49…`、16 行/`d41665d3…` 不再引用）。
- **未做**：未改代码/测试/角色卡/边界/方案/复核/验收/沟通/调度文档（本文件与 `memo.md` 一行除外）；未运行产品测试；未启动应用；未 commit/push/merge/release；未联系客户。
- **授权边界**：本文件不授权实施；复审通过 + Batch 0 出口后由统筹派发 C1；提交/推送/合并/发布仍须客户另行授权。
- **版本链**：P1.3 → P1.4 → P1.5 → P1.5.1 → P1.6（实施契约基线）；复核 F29–F45 已按 IA 吸收；stable 最终决定取代 IA 早期记录式口径；PM 审核 r2 裁决吸收如上。

## 10. 请复审/裁决事项汇总

1. **本提案状态**：r2 已按 PM 审核 F1–F6/F12、Q1–Q14 裁决与引用刷新修订；**请 PM 复审并给出新结论**。本角色不自行评审放行。
2. 复审重点：§0 修订对照、§2 写集（含 `tools.ts` 计划枚举补登）、§3.1/§3.2 形状（F1/F2/F3/F4/F5/F6/F12）、§3.4 归属表、§4 注意点映射、§5 证据计划、§6 Q 状态。
3. 需跨角色材料：Q1（P1.3 快照，若有）、Q9（8 项 check id 原文）——不阻断复审，C1 冻结声明注明来源；Q15（`run-role.ts` 编译解锁）与 Q16（计划补登披露）已按 PM 裁决执行。
4. 本角色在复审通过且 C1 派发前不写产品代码；**P1 通过前不写产品代码**（团队计划 §5.2）。
