# 变更记录：`request_gate_review` 共享 i18n 与 gate 规则同步（项目管理）

- **任务**：客户已授权的 `request_gate_review` 实现——项目管理负责的共享 i18n、变更记录与规则同步
- **记录角色**：项目管理（技术架构）worker，独立角色上下文
- **日期**：2026-10-26
- **状态**：**`implemented-unverified`**（共享 i18n key、契约测试与文档完成；本角色 i18n 测试与 `npm run typecheck` 已跑并如实分类；**未接线、未验收、未做真实 Electron/全量回归**；最终状态等独立验收后另记）
- **授权依据**：客户 2026-10-26 授权实现 `request_gate_review`（由主控任务转达）；设计 `docs/design/2026-10-26_design_proof-gate-reviews.md` §5–§8、§12（本批同步把该文档状态由 `rules-only` 更新为 `approved-implementing`，revision 3）；客户追加要求：**gate 复核独立于最终验收**、**防吹毛求疵**（gate fail 必须有 blocker/major；只有 minor/nit 的 fail 退回 Proof、不返工；pass 可带 minor/nit）
- **基线身份**：worktree `lead-governance-coordination`，HEAD `5bd9fe4`（`feat/scaffold-first-governance`）；本批未 commit / 未 push / 未暂存
- **环境**：Windows 11 / Git Bash（MINGW64）；Node `v24.22.1`；npm `11.19.1`；仓库根 = worktree

> **授权记录说明**：本工作树内未见与本次追加授权对应的 `docs/communication/**` 客户沟通原文。本记录以主控任务转达的客户授权与设计文档的 `authorized` 事件为依据，**不伪造沟通文件**；独立验收时如要求，请核对原始授权记录。

---

## 一、客户授权与实施边界

客户在 `rules-only` 规则落卡后**追加授权实现** `request_gate_review` 与设计的 gate 机制，并明确：

1. **gate 复核独立于最终验收**：gate 复核 ≠ 验收通过 ≠ 客户批准；gate 结论不写 `customer.decision`、不进入验收分诊；最终验收仍走既有 `request_acceptance`/验收卡链路。
2. **防吹毛求疵**：gate `fail` 必须有 `blocker`/`major` 依据；只有 `minor`/`nit` 的 `fail` 按结构不符**退回 Proof、不触发返工**；gate `pass` 可带 `minor`/`nit` 备注，不因非阻断建议反复开 gate。
3. **范围不变**：不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind；`request_gate_review` 只注入统筹会话，`request_acceptance` 保留为最终验收唯一主动通道；无 gate 的旧 flow 行为不变。

**本批（项目管理）只做**：共享 i18n key、共享 i18n 契约测试、本变更记录、设计文档状态、工程法案规则同步。

**本批不做**：`src/common/编排/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、`app/**`、`src/common/门禁引擎/governance-roles.ts` 的任何实现或接线；不新增角色/`FlowStepKind`/cardKind；不改 `request_acceptance`；不 commit/push；不重启应用；不碰 `demos/`。

---

## 二、共享 i18n key 契约（13 个，zh-CN/en-US 同 key、同语义）

`zh-CN.ts` 是 key 全集来源；`en-US.ts` 的 `satisfies Record<MessageKey, MessageTemplate>` 在编译期强制 key 齐全。所有值均沿用现有 i18n 风格（`{flowId}` / `{gateId}` / `{detail}` / `{reportPath}` / `{severity}` 插值），未改任何既有 key 文案。

| # | key | zh-CN | en-US | 占位符 | 语义/用途 |
| --- | --- | --- | --- | --- | --- |
| 1 | `main.gateReview.dispatched` | 流程 {flowId}：已提交 gate {gateId} 复核给验收（工作中）；gate 复核 ≠ 验收通过 ≠ 客户批准。 | Flow {flowId}: gate {gateId} review submitted to Proof (working); this is not an acceptance pass and not customer approval. | `{flowId}` `{gateId}` | `dispatched` 回执/系统行：只表示已派 Proof，不得说成通过或客户批准。 |
| 2 | `main.gateReview.alreadyDispatched` | 流程 {flowId}：gate {gateId} 复核已提交过（在途或已通过），未重复派发；请用 flow_get 核对 gate 步骤状态。 | Flow {flowId}: gate {gateId} review was already submitted (in flight or passed); not dispatched again. Check the gate step status with flow_get. | `{flowId}` `{gateId}` | `already-dispatched` 回执：不重复提交；以 `flow_get` 核对在途/已通过。 |
| 3 | `main.gateReview.gateNotFound` | 流程 {flowId}：未找到 gate {gateId}（步骤不存在或不是 gate）；请核对 flow YAML 后重新提交。 | Flow {flowId}: gate {gateId} not found (the step does not exist or is not a gate); check the flow YAML and submit again. | `{flowId}` `{gateId}` | `gate-not-found` 回执：不猜 flow、不自动建 gate。 |
| 4 | `main.gateReview.criteriaMissing` | 流程 {flowId}：验收标准缺少 gate {gateId} 的复核标准节；请验收补齐最新标准后再提交（统筹不写 docs/acceptance/）。 | Flow {flowId}: the acceptance criteria have no gate review section for {gateId}; have Proof add it to the latest criteria and submit again (Steward does not write docs/acceptance/). | `{flowId}` `{gateId}` | `criteria-missing` 回执：gate 标准节缺失；统筹不写 `docs/acceptance/**`。 |
| 5 | `main.gateReview.flowIncomplete` | 流程 {flowId}：gate {gateId} 的前置步骤或证据不齐（{detail}）；补齐后再提交，不得提前提交或用提交代替缺步骤。 | Flow {flowId}: gate {gateId} prerequisites or evidence are incomplete ({detail}); complete them and submit again — do not submit early or use submission to stand in for missing steps. | `{flowId}` `{gateId}` `{detail}` | `flow-incomplete` 回执：依赖未 done / 证据不可对账 / 在途工作；给出缺项。 |
| 6 | `main.gateReview.unavailable` | 流程 {flowId}：gate {gateId} 复核通道不可用（{detail}）；可能已派发，请用 flow_get 核对；应用未声称已派发，不自行判定通过。 | Flow {flowId}: the gate {gateId} review channel is unavailable ({detail}); it may already have been dispatched — check with flow_get. The app does not claim dispatch and never decides a pass on its own. | `{flowId}` `{gateId}` `{detail}` | `unavailable` 回执：fail-closed；不谎报已派发、不把超时当通过。 |
| 7 | `main.gateReview.rejected` | 流程 {flowId}：gate {gateId} 复核请求被拒（{detail}）；请按原因修正后重交，不原样重试。 | Flow {flowId}: the gate {gateId} review request was rejected ({detail}); fix the cause and resubmit instead of retrying unchanged. | `{flowId}` `{gateId}` `{detail}` | `rejected` 回执：gate 已 done/superseded/返工未完成等；按原因修正，不原样死循环。 |
| 8 | `main.gateReview.passNote` | 流程 {flowId}：gate {gateId} 已通过（报告 {reportPath}）；可继续下游，仍须最终客户验收。 | Flow {flowId}: gate {gateId} passed (report {reportPath}); downstream work may continue, and final customer acceptance is still required. | `{flowId}` `{gateId}` `{reportPath}` | gate 通过系统行：放行下游，但**不等于最终验收/客户批准**。 |
| 9 | `main.gateReview.failNote` | 流程 {flowId}：gate {gateId} 未通过（{severity}；报告 {reportPath}）；gate 保持 pending，返工后需重新请求复核。 | Flow {flowId}: gate {gateId} did not pass ({severity}; report {reportPath}); the gate stays pending, and review must be requested again after rework. | `{flowId}` `{gateId}` `{reportPath}` `{severity}` | gate 失败系统行：gate 保持 pending；返工后由统筹重新请求复核。 |
| 10 | `main.gateReview.returnedToProof` | 流程 {flowId}：gate {gateId} 报告缺失或结构不合规（{detail}）；已退回验收补充，未判通过、未路由返工。 | Flow {flowId}: the gate {gateId} report is missing or structurally invalid ({detail}); returned to Proof to complete — not passed and no rework routed. | `{flowId}` `{gateId}` `{detail}` | `returned-to-proof`：报告缺/坏/矛盾；不判通过、不路由返工、不标 done。 |
| 11 | `main.gateReview.nitOnly` | 流程 {flowId}：gate {gateId} 的 fail 只含 minor/nit；gate 失败必须以 blocker/major 为依据，已按结构不符退回验收，不触发返工。 | Flow {flowId}: the gate {gateId} fail contains only minor/nit items; a gate failure must rest on a blocker/major, so it was returned to Proof as structurally invalid and no rework was triggered. | `{flowId}` `{gateId}` | **防吹毛求疵**：只有 minor/nit 的 fail 退回 Proof、不返工。 |
| 12 | `main.gateReview.reportMissing` | 流程 {flowId}：gate {gateId} 报告不存在或不可读（{reportPath}）；gate 保持 pending，等待验收补交报告，不按超时判通过。 | Flow {flowId}: the gate {gateId} report is missing or unreadable ({reportPath}); the gate stays pending while waiting for Proof to submit it — a timeout never counts as a pass. | `{flowId}` `{gateId}` `{reportPath}` | 报告缺失系统行：gate 保持 pending；**永不按超时判 pass**。 |
| 13 | `main.gateReview.reworkTask` | Gate 返工任务｜{gateId}：按 gate 报告 {reportPath} 的 {severity} 项修复；minor/nit 为非阻断、可选后续。 | Gate rework task \| {gateId}: fix the {severity} items in gate report {reportPath}; minor/nit items are non-blocking and optional follow-ups. | `{gateId}` `{reportPath}` `{severity}` | gate 返工任务前缀/说明：写明 gateId/报告/严重度；minor/nit 标非阻断。 |

**契约要点**：

- `gate 复核 ≠ 验收通过 ≠ 客户批准` 由 `dispatched` 文案逐字承载；`passNote` 保留「仍须最终客户验收」/`final customer acceptance is still required`。
- `nitOnly` 与 `reworkTask` 共同承载防吹毛求疵规则：失败依据必须是 `blocker`/`major`；只有 `minor`/`nit` 的 fail 退回 Proof、不返工；`minor`/`nit` 为非阻断。
- `unavailable`/`reportMissing` 明确 fail-closed：不声称已派发、不按超时判通过。
- 未新增 `ui.*` key；gate 不发客户卡、不进入验收分诊，故不需要 cardKind/分诊文案。

---

## 三、规则同步（工程法案 §二.12）

在 `角色卡/项目管理/docs/project-rules.md` §二「已确认要求」末尾新增**第 12 条「gate 复核-01：关键节点 gate 复核独立于最终验收」**（客户 2026-10-26 授权实施）：

- **独立性**：gate 复核由 Proof/验收独立判定；统筹只做证据完整性检查、请求 gate 复核与返工协调，不得自查代替 Proof、不得代标 gate 通过、不得写 gate 报告。gate 结论不写 `customer.decision`、不进入验收分诊；最终验收仍按第 9、11 条与既有验收卡链路执行。
- **防吹毛求疵**：gate `fail` 必须有 `blocker`/`major` 依据；只有 `minor`/`nit` 的 `fail` 按结构不符退回 Proof、不触发返工；gate `pass` 可带 `minor`/`nit` 备注。
- **范围**：不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind；`request_gate_review` 只注入统筹会话，`request_acceptance` 保留为最终验收唯一主动通道；无 gate 的旧 flow 行为不变。
- **不扩张任何角色的文件写权。**

第 1–11 条原文保留、未重排未删改。设计文档 `2026-10-26_design_proof-gate-reviews.md` 同步更新：`status: approved-implementing`、`revision: 3`、新增 `authorized` 事件；顶部状态块、§12 项目管理行与 §十三 状态/下一步同步；**未写「已验证/已验收」**。

---

## 四、影响面

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 共享 i18n（zh） | `src/common/shared/i18n/messages/zh-CN.ts` | 新增 13 个 `main.gateReview.*` key 与语义注释；既有 key 零改动。 |
| 共享 i18n（en） | `src/common/shared/i18n/messages/en-US.ts` | 同一 13 个 key 的英文文案；占位符与 zh 一致。 |
| 共享契约测试 | `test/项目管理/shared/i18n.test.ts` | key 分区计数 `main` 495→508、总数 1343→1356、`main` 扣除 B0 490→503；新增 3 个 gateReview 用例（13 key 存在/占位符、独立性与防吹毛求疵语义 + en 无中文、zh/en 取值与插值）。 |
| i18n 守卫 allowlist | `test/项目管理/shared/i18n-guard-allowlist.ts` | 新增 `app/desktop/boundary-change.ts` 条目并写明 classification §4 理由（机器路径/agent-facing 回执/任务正文/judge prompt），更新清单历史注释；未改扫描器、未放宽断言。 |
| 设计文档 | `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` | 状态 `rules-only`→`approved-implementing`（revision 3），新增授权事件与状态说明；§12 key 行更新；§十三 记录实现中。 |
| 工程法案 | `角色卡/项目管理/docs/project-rules.md` | §二新增第 12 条 gate 复核规则；变更记录追加 2026-10-26 条目。 |
| 本记录 | `角色卡/项目管理/docs/change/2026-10-26_change_request-gate-review.md` | 本文件。 |

**消费方契约（供实现批次使用）**：桌面窗口/编排在生成 gate 回执或系统行时，按 §二 的 key 与占位符调用 `translate`；`{reportPath}` 用项目相对路径，`{detail}` 用有界诊断/缺项说明，`{severity}` 用失败严重度摘要（如 `1 blocker / 2 major`）。缺参会保留占位符并产生 `i18n.missing-param` 诊断。

**未受影响**：`request_acceptance` 的既有 key（`main.governance.acceptance*`）零改动；验收分诊 key 零改动；flow/桌面/model/provider/门禁卡零改动；无新依赖、无新枚举、无新角色/cardKind。

---

## 五、验证计划与实跑结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约（必跑） | `node --test "test/项目管理/shared/i18n.test.ts"` | **53 tests / 53 pass / 0 fail / 0 skipped**，exit 0（含新增 3 个 gateReview 用例） |
| 共享测试套件（本组） | `node --test "test/项目管理/shared/**/*.test.ts"` | **200 tests / 195 pass / 0 fail / 5 skipped**；硬编码守卫输出 `[i18n-guard] scanned=124 allowlisted=20 violations=0`（本批按分类规则登记 `app/desktop/boundary-change.ts`，见 §六.1） |
| 类型检查（必跑） | `npm run typecheck` | **exit 0**，无诊断（en-US `Record<MessageKey, MessageTemplate>` 强制 13 个新 key 齐全） |
| 自检：zh/en key 齐全 | 同一 i18n 套件 | 目录 parity 断言通过；13 key 两侧均存在 |
| 自检：无重复 key | 同一 i18n 套件（分区计数 + key 规范） | 计数与 key 规范通过；未出现重复 key |
| 自检：无未使用 key 误删 | 本批只新增，未删除任何既有 key | `git diff` 仅新增 13 key 区块与测试/文档改动 |

**测试契约说明**：新增用例逐字断言 `dispatched` 的「gate 复核 ≠ 验收通过 ≠ 客户批准」、`passNote` 的「最终客户验收」、`nitOnly` 的 blocker/major 依据与「不触发返工」、`reworkTask` 的 minor/nit 非阻断，以及 en-US 不含中文；后续改词必须显式更新测试，属有意契约变更。

**未跑**：全量回归（全仓测试）、真实 Electron、消费者接线后的系统行 e2e、独立验收。本记录不构成验收结论。

---

## 六、未做与风险

1. **既有守卫红灯已按规则收口（本批）**：`i18n-guard.test.ts` 原先在 `app/desktop/boundary-change.ts:48` 报「角色卡」硬编码。只读分类后确认该文件剩余中文**全部为机器/agent-facing 文本**：治理关键路径常量（`角色卡`、`docs/**`）、`assessBoundaryChangeRequest` 的校验失败回执（tool output，交治理 agent）、发给 Crew 的边界变更任务正文，以及 AI 门禁判定请求卡（title/question/options/preview 仅进 `governance-judge-prompt.ts` 的 judge prompt，不是客户卡）；**无用户可见 UI 文案**。故按 allowlist 规则新增 `app/desktop/boundary-change.ts` 条目并写明理由，**未改扫描器、未放宽断言**。共享套件现 **0 fail**（`scanned=124 allowlisted=20 violations=0`）。
2. **消费者未接线**：13 个 key 目前没有被 `app/**`/`src/**` 产品代码引用（预期）；实现批次必须按 §二 的 key/占位符消费，否则运行时会保留占位符并产生 `i18n.missing-param`。本批未改消费者，无法验证真实系统行渲染。
3. **gate 机制本身未由本批实现**：`request_gate_review`、`gateKind` 解析、`completeGateStep`、`gate.review` 账本、返工路由、重启恢复等由编排/运行时/桌面/门禁引擎角色在各自边界实现；本批只冻结文案契约与规则。设计文档已标 `approved-implementing`，**不是已验证/已验收**。
4. **授权沟通原文不在工作树**：见文首说明；若独立验收要求原始客户沟通文件，需由主控/治理补齐，本记录不以任务转达冒充客户沟通原文。
5. **措辞冻结成本**：13 个值已被测试逐字断言；实现中若发现语义需要调整（如 `{severity}` 格式），须同步改 key 文案与测试，并按契约变更记录，不能静默漂移。
6. **未 commit/push/重启**：工作区改动保留未提交；应用未重启；`demos/` 未触碰。

---

## 七、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `test/项目管理/shared/i18n-guard-allowlist.ts`
- `角色卡/项目管理/docs/change/2026-10-26_change_request-gate-review.md`（本文件）
- `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md`
- `角色卡/项目管理/docs/project-rules.md`

未触碰：`app/**`、`src/common/编排/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、边界/角色卡、其他角色资料、`package.json`/`tsconfig*`、`demos/`。
