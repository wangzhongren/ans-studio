# 团队计划登记 `run-ambiguous` / `baseDigest` 合法来源：方案（P1.0）

- 版本：**P1.1 草案，2026-11-09**；ANS 策划（Planning）独立上下文。**P1.1 按独立复核 R1.0**（`docs/planning/2026-11-09_review_team-plan-run-binding.md`）**逐项处置 M1/G1/G2/S1–S6**（落点见 §8）；P1.0（401 行 / 49,301 bytes / `1d9bbaee…`）保留于版本记录、不再作为闸门材料。
- 状态：**方案修订稿；未实施、未测试、未验收、未运行真实模型、未提交/推送/合并。** 本文件为本轮唯一写盘产物。
- 风险档位：**T2（change；协调方已批准按 change 处理）**。本方案不改 run 生命周期状态/冻结语义/权限/闸门/验收，只改「团队计划登记的输入契约与宿主绑定」；按 §5.1 评估不触发 T3（无 run 生命周期语义实质变化）。若实施中需要 bootstrap trunk、自动关闭旧 run、改 `RunManifest` 字段或改门禁 `classify-shell.ts`，即视为实质变化——停止并升 T3 回报。
- 依据（本检出只读核对，写盘前实测）：
  - 缺陷记录（最终版，含客户修正裁定）：`docs/communication/2026-11-09_defect_team-plan-run-ambiguity.md`，**40 行 / 4,669 bytes / SHA-256 `ae403883f8d5edb46b5a3b6c15aeb366c1fc663d92eb14ba0188e534fd9a13b3`**。裁定要点：团队计划仍归运营（convener）撰写/登记（不做职责/角色卡变更）；规范路径/格式并入「文档格式说明」变更；**run-ambiguity / baseDigest 合法来源由应用侧解决**。
  - RR5 证据：`角色卡/测试/docs/change/2026-11-09_RR5_snake-restore-proposal-flow.md`，**201 行 / 27,140 bytes / `af8f200865742cc63f94e203b8e22442bc9d60ea32482094d44497a7e85f3a1a`**；证据目录 `角色卡/测试/docs/change/2026-11-09_RR5_evidence/`，关键原件：`complete-team-plan-receipts.jsonl`（37,260 bytes / `db9a1c1d70ca25c3c6299ae9914f3310152a7de4284ba78e67ede13230ab24e6`）、`convener-reports/6f61eb74b5862cc3b98c131d12708e07a20d14edb04dfb4c6503d4b3ffde854f.json`（4,689 bytes / `7a544a19ca77e2869c3e1fd4b00897d3a67199a055cbd5829768695627e2f2f2`）、`pre/target-manifest-pre.json`（15,512 bytes / `8a662af9342a57aa8d6328c13675ab67b72303cf546f922c6fc298f0caeedcc8`）。
  - 并行变更（只读）：judge 代批 P1.2 `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（**686 行 / 88,988 bytes / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`**；实现 W-J1–J5 已在本工作树未提交）；文档格式 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md`（**979 行 / 146,555 bytes / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`**）；提案卡修复已提交 `fb1aa39e787934f334b9c164e4221074f97f6147`。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（方案/复核/团队计划/实施免逐次闸门；**任何实质变化——范围、角色结构、治理语义、风险档位——必须停下回报**；提交/推送/合并/发布未授权）。
- 代码基线：worktree `.claude/worktrees/trunk-amendment`，HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`）。工作树当前携带 **judge P1.2 未提交实现**（`src app test` 脏，含 `apply-journal.ts` / `trunk-runtime.ts` / `model/runtime.ts` / `classify-shell.ts` 等）；该未提交集**不属于本方案写集**，仅只读引用。本文行号按当前检出标注；judge 合并后 `apply-journal.ts` 等行号会漂移，实施以**符号名与文本锚点**为准。
- 标记约定：**[事实]** 已只读核实的代码/文档行为；**[推断]** 基于代码但未经真实运行证实；**[设计候选]** 本方案提议、未实施；**[待确认]** 见 §5.2 Q 清单。

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
|---|---|---|---|
| P1.0 | 2026-11-09 | 初稿：根因（file:line）、应用派生 baseDigest/plan.sha256 + 宿主绑定规范 run 设计、写集/owner、测试/验收（含 RR6 预算）、Q/风险/披露（401 行 / 49,301 bytes / `1d9bbaee61d036b4076342a46f9bfefbf4426c8ba2d39307dcab90db7576b668`） | 草案；独立复核 R1.0 结论「建议修订后提交」（M1/G1/G2/S1–S6） |
| P1.1 | 2026-11-09 | 按 R1.0 逐项修订：M1 重放语义（`requestDigest` 保持提交原样 input，resolved 仅 marker/target/回执；P-8 增缺省重放与 Git prepare→commit 变体）；G1 取消有意加严、来源选择逐字保留现状并等价披露；G2 补 `:2863` 与 7 处 `?? null` 机械触点；S1 严格相等；S2 宿主码分层；S3 回执分层回显；S4 I2 措辞；S5 RR6 预期分支/预批留痕/已知红；S6 行号与基线口径 | 修订稿；待复核确认 |

---

## 0. 摘要（先读这段）

### 0.1 问题

RR5 真实运行中，提案链已修复并跑通（全新提案卡 `req-4d9cad12f7f51043` 被客户真实接受、A′ 决策快照 `decision-8231a86c…` 在案），但**团队计划登记**被应用拒绝两次：`complete_team_plan` 回执 `errorCode:"plan-path-invalid"`（`baseDigest` 为**空串摘要** `e3b0c442…`、`targetDigest:null`）。convener 合成为阻塞事实 `run-ambiguous`（多未 pin draft run、`run=none`、全部版本 `pinned=none`）并报告「应用未暴露把文档登记/绑定到 run 或生成合法 `sha256/baseDigest` 的能力」。效果：未发任命卡、未创建角色、未派实现、无游戏产物。

本方案处理其中属于**应用侧**的两件事（客户最终裁定口径）：

1. **规范 run 的选择/收敛**：多 draft run 时不让角色猜——团队计划登记与后续 pin 使用**当前受派任务的实际 run**，由应用在宿主层绑定并记录。
2. **`baseDigest` / `plan.sha256` 的合法来源**：这两个值本就是**应用拥有的机器事实**（effective trunk manifest 摘要 / 计划文件实际字节摘要），角色没有任何合法来源；改由**应用侧派生/校验**，模型值可省略或仅作断言，未知/不可读/漂移一律 fail-closed。

规范路径/格式（`docs/scheduling/<flowId>-team-v<N>.md`）不属本变更：RR5 的 `plan-path-invalid` 是**正确校验**（convener 写错路径/格式），该部分归「文档格式说明」变更；本方案只读引用，不改校验规则。

### 0.2 本方案（设计候选，一句话版）

- `complete_team_plan` 的 `baseDigest`/`plan.sha256` 改为**可选断言**：应用在 `completeTeamPlanInternal` 内按 `readEffectiveSnapshot` 的实际 digest 与计划文件实际字节 SHA-256 **派生**；模型若提供，必须与派生值逐字相等，否则维持既有拒绝码（`plan-base-conflict` / `plan-hash-drift`）；公开 schema、`CompleteTeamPlanInput`、convener preflight、事实投影同步改为「可缺省、给了就核」。
- `runId` 由**桌面宿主**从当前真实受派回合的任务（`inspectAssignedTask`）绑定并注入；模型自报 `runId` 只作断言（不等即 `plan-run-conflict`）；绑定值记入既有 `DirectActionSource.runId` 与回执，**不改** run manifest/marker/`classify-shell` 政策。
- `project_state` / `version-decision` 的 `run-ambiguous` **原样保留**（那是版本决策与多 pinned 的安全语义）；团队计划登记不再消费 run 歧义。不自动关闭旧 draft run，不新增 run 生命周期动作。
- 旧调用（提供全部值且正确）行为逐字不变（requestDigest/journal/marker/回执等价），保证兼容与可重放。

### 0.3 客户可见结果（设计候选）

- 运营（convener）只需写出规范团队计划并调用 `complete_team_plan(flowId, plan.path, plan.version)`；**不再需要（也无法靠伪造通过）哈希/摘要**。
- 成功回执携带应用派生的实际 `planRef.sha256` 与本任务实际 runId；失败回执如实给出既有稳定 code（`trunk-unavailable` / `plan-base-conflict` / `plan-hash-drift` / `plan-structure-invalid` 等），不假装成功。
- 多 draft run（如 RR5 的多个未 pin run）不再要求角色「先 pin 唯一 run」才能登记计划；版本决策仍会在真正歧义时如实要求指定 runId。

### 0.4 本方案不做

- 不改团队计划归属/角色职责/角色卡/边界（客户最终裁定）；**不实施**任何「团队计划改由策划撰写」的变更（H1 delta = 0）。
- 不放宽路径/版本/roster/modules/结构校验；不把 RR5 的路径错误当代码修复（归文档格式变更）。
- 不伪造 `baseDigest`/`sha256`、不把未核实的模型值写进证据、不在无 effective trunk 时凭空 bootstrap。
- 不改 run 生命周期（不 pin、不关闭、不重启、不清理旧 draft）；不改 `project_state`/`version-decision` 的 `run-ambiguous` 语义。
- 不新增角色/工具/卡种；不触发提交/推送/合并/发布。

---

## 1. 问题陈述与根因（真实代码证据）

### 1.1 RR5 真实运行事实（[事实]，原件在案）

1. 提案链成功：`request.resolved`（`by:"customer"`、`operatorId:"51054"`、`choice:"accept"`、`decisionId:"decision-req-4d9cad12f7f51043"`），A′ 决策快照 `decision-8231a86c…`（50,008 bytes / 6 files）。
2. convener 任务 `t-mw8tsyms-8eb2422f`（run `run-hub-ce6048…`，draft）两次 `complete_team_plan` 被拒，回执原文：
   ```json
   {"ok":false,"status":"rejected","operationId":"ctp-snake-game-attempt-1","baseDigest":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","targetDigest":null,"errorCode":"plan-path-invalid","message":"Plan path and declared version must identify the real flow team plan"}
   ```
   （`plan.path=docs/scheduling/snake-game-team-plan-v1.md`、version=1；第二次换 roster 路径，同 code。）
3. `project_state`：`run=none status=none`、`unclosed=8`、`activeUnclosed=8`、`tasks=8`（**任务计数**；缺陷记录所写「8 个未 pin draft run」与 RR5 证据 `runs/` 的 6 个 run manifest 不一致，按证据口径为「多个未 pin draft run」）；`contract_check`：`run：run-hub-c9791d…｜state=draft`；`evidence_check` ×3 均 `criteria-ref-mismatch`（无已 pin criteria）。
4. **目标项目当时没有 effective trunk**：RR5 预态清单 `pre/target-manifest-pre.json` 中 `.ans/trunk/` 只有 `initialization-sources/` 与 4 个既有快照，**没有 `manifest.json`**；运行后 `.ans/trunk/` 仍无 manifest（[事实]，本检出只读核对当前 target 一致）。
5. convener 阻塞报告原件（`convener-reports/6f61eb74….json`）明确：`blocker kind=run-ambiguous(source=app)`、全部版本 `pinned=none`、「应用未暴露文档登记/绑定 run 的能力」、无 Git trunk（`git_query` 全 `blocked`，`ENOENT '.git'`）、禁 `run_shell`、`write_file` 回执无 sha256。

### 1.2 契约事实：模型必须提供什么、应用校验什么（[事实]）

- 公开工具 schema（`src/provider/runtime/schema.ts:50-52`，`describeTool("complete_team_plan")`）：
  - `required: ["operationId","flowId","baseDigest","plan"]`；`plan` 对象默认全必填 → `plan = {path, sha256, version}`；`runId` 可选。
  - `baseDigest`/`sha256` 均为 64 hex 形状；工具层 `directShapeError` 按该 schema 机械校验（`src/provider/runtime/tools.ts:4279-4309`、`:4326`、`:4331-4334`）。
- Model 类型（`src/model/runtime.ts:2468-2475`）：`CompleteTeamPlanInput = { operationId; flowId; runId?; baseDigest: string; plan: { path; sha256; version } }`——`baseDigest`/`plan.sha256` 必填。
- convener 角色侧前置（`src/common/roles/convener/index.ts:405-440` `checkTeamPlan`；接线 `src/pipeline/orchestration/trunk-runtime.ts:629-638` `convenerTeamPlanFacts`、`:830-839`）：事实键 `TEAM_PLAN_FACT_KEYS`（`:259-266`）要求 `baseDigest` 为 hex64、`plan` 恰为 `{path,sha256,version}` 且各字段合法；路径必须**恰为** `docs/scheduling/<flowId>-team-v<version>.md`（`:432-438`）——RR5 两次调用都在这一层被拒，回执经 `convenerTeamPlanRejection`（`trunk-runtime.ts:641-648`）映射为 `plan-path-invalid`。**该路径校验正确**：RR5 写的 `snake-game-team-plan-v1.md` 不是规范名。
- 应用服务校验（`src/service/trunk/impl/apply-journal.ts:2860-2948` `completeTeamPlanInternal`，按顺序）：
  1. `:2863` 身份/`baseDigest` 形状（actor 必须是 convener）。
  2. `:2881` `readEffectiveSnapshot`——读 `.ans/trunk/manifest.json` 与其 complete-snapshot；**缺失即 `trunk-unavailable`**。
  3. `:2883` `current.flowId !== input.flowId || current.digest !== input.baseDigest` → `plan-base-conflict`；即 `baseDigest` 必须**精确等于 effective trunk manifest digest**。
  4. `:2884` `input.runId` 若提供，必须属于同一 flow（否则 `plan-run-conflict`）；**未提供则不使用**（当前实现只校验、不绑定）。
  5. `:2885-2886` 路径正则 `^docs/scheduling/<flowId>-team-v<version>\.md$` → `plan-path-invalid`。
  6. `:2887-2893` effective snapshot 必须有 roster/modules 引用且字节一致 → `plan-basis-incomplete`/`plan-owner-invalid`。
  7. `:2894-2896` 计划字节哈希必须等于 `input.plan.sha256`（优先取冻结快照同 path 同 hash 的字节，否则读盘）→ `plan-hash-drift`。
  8. `:2897-2899` `parseTeamPlan` 结构校验 → `plan-structure-invalid`。
- 结论：`baseDigest`/`plan.sha256` 都是**应用拥有的机器事实**在入参里的重复申报；模型侧无任何生产来源（见 1.3）。

### 1.3 角色可见事实面：为何模型不可能给出合法值（[事实]）

- `contract_check`（`app/desktop/session.ts:10271-10371` `contractCheckText`）：给当前 run manifest 的 state/文档 path+**截断 12 位**的 sha、`teamPlan` 只给 path；**没有 effective trunk manifest digest，也没有计划文件自身的 sha256**；且 hash 被截断（`slice(0,12)…`），不能作为入参。
- `project_state`（`src/common/编排/project-state.ts` 及 `src/provider/runtime/schema.ts:1408-1435`）：状态摘要（focus/计数/blocker/下一步），**没有摘要值**。
- `evidence_check`（`schema.ts:761-791`）：要求显式 `criteriaRef{path,sha256,version}` 且与当前 run 一致；RR5 因 `pinned=none` 三次 `criteria-ref-mismatch`，**不能充当摘要预言机**。
- shell：convener 档为 `operator-approve`（`src/common/roles/convener/index.ts:93`），RR5 任务硬约束禁 `run_shell`；即便可用也需审批且非摘要来源。
- Git：target 非 git 仓库，`git_query` 全 `blocked git-query-evidence-unavailable ENOENT '.git'`。
- `write_file` 回执只有字节数，无 sha256（RR5 convener 报告原文）。
- 因此 RR5 中模型给出的 `baseDigest=e3b0c442…`（空串的 SHA-256）只能是**猜的**；即便路径正确，也会在 `plan-base-conflict`（或更早的 `trunk-unavailable`）被拒。**真实链路必败**。

### 1.4 `run-ambiguous` 的真实语义（[事实]）

- 生产者：`project_state`（`src/common/编排/project-state.ts:710-724`）在 focus flow 有多个活动 run 且未指定 runId、或多 pinned 冲突时给出 `run-ambiguous` blocker；`version-decision`（`src/common/编排/version-decision.ts:129-153`）对版本决策要求 runId（`run-change-required` / `run-ambiguous`）。二者都是**版本决策面**的安全语义，语义正确。
- 团队计划登记**并不消费 run 歧义**：`runId` 在 schema/Model 一直是可选（schema required 不含 runId；`CompleteTeamPlanInput.runId?`），服务只做归属校验。RR5 的 convener 把「版本决策需指定 runId」误读为登记计划的先决条件（并要求先 pin 唯一 run）——这一误读部分源于应用**没有给出「本任务的规范 run」**这一事实，让角色只能从 `run-ambiguous` 推断。
- 另注意：多 **draft** run 不阻塞 `pinRun`——`findActiveRun` 只在**多个 pinned** 时报冲突（`src/common/编排/run-manifest.ts:307-319`），`pinRunUnsafe` 只在存在**不同 pinned** run 时拒绝（`:658-662`）；`freezeExecutionRun` 的 pin 目标来自任务链的 run（宿主决定），不是角色选择。

### 1.5 根因结论

1. **契约错位**：`complete_team_plan` 把两个应用拥有的机器事实（effective trunk digest、计划文件字节 hash）声明为**模型必填**，而角色侧没有任何合法来源——真实链路结构性必败（RR5 已证）。
2. **规范 run 缺位**：团队计划登记与「本任务的 run」没有显式绑定；`run-ambiguous` 作为版本决策语义被角色误读为登记前置，且应用没有受支持动作把「本任务 run」告知/记录下来。
3. **校验本身正确**：`plan-path-invalid`（RR5 实际错误）是路径/格式问题，归文档格式变更；`plan-base-conflict`/`plan-hash-drift`/`trunk-unavailable` 是正确 fail-closed，但前两者不该由模型的值触发。
4. **真实链路还有下一道前置（如实披露，非本变更修复）**：RR5 目标没有 effective trunk publication（`.ans/trunk/manifest.json` 缺失），团队计划登记要求 effective snapshot 中的 roster/modules 引用——即使路径与摘要问题都解决，仍会（正确地）停在 `trunk-unavailable`/`plan-basis-incomplete`，直到文档发布（bootstrap VCA，`baseTrunk:null`+`bootstrap:true`，见 `docs/planning/2026-11-04_design_trunk-amendment-model.md` F30/§4.4）真实发生。本方案**不放宽**这一点（见 §2.9）。

### 1.6 目标 / 非目标

- 目标：让团队计划登记在「角色无法也不应知道应用摘要」的现实下可完成；让规范 run 由应用绑定、可审计；不弱化任何既有 fail-closed；旧调用兼容。
- 非目标：见 §6。

---

## 2. 设计：应用侧派生 + 宿主绑定（设计候选）

### 2.0 安全不变量（硬约束）

- **I1 模型值不信任**：模型提供的 `baseDigest`/`plan.sha256`/`runId` 只作**断言**；必须与实际派生值/宿主绑定值逐字相等，否则拒绝（既有稳定 code）。
- **I2 fail-closed**：effective trunk 缺失/不可读、计划字节不可得（既无匹配的冻结字节、live 也不可读）、结构不合法、roster/modules 不一致——一律按既有 code 拒绝，不伪造、不回退到猜测。
- **I3 run 由宿主绑定**：runId 只从**当前真实受派回合的真实任务**读取（`inspectAssignedTask`）；无真实回合/任务/flow 不符时不执行；模型自报不同 run 即 `plan-run-conflict`。
- **I4 run 生命周期不变**：不写 run manifest、不 pin/close/restart run；`project_state`/`version-decision` 的 `run-ambiguous` 语义原样保留。
- **I5 文档校验不变**：路径正则、版本、roster/modules、`parseTeamPlan`、owner/writeset/依赖校验逐字保留；路径规则由文档格式变更向角色解释（本方案不改）。
- **I6 旧调用兼容**：当模型提供正确值时，`team-plan:<digest>` 的 `requestDigest`/journal/marker/回执与现状**逐字一致**（来源选择逐字保留现状，见 §2.2；可重放、幂等/NoOp 语义不变）；缺省值 payload 的重放语义见 §2.3（同 operationId、同原样 payload ⇒ 返回既有回执）。
- **I7 审计不伪造**：任何未与真实字节核对相等的模型值都不会写入证据；证据里只有派生值/实际值。

### 2.1 `baseDigest` 派生与断言（owner：编排；`src/service/trunk/impl/apply-journal.ts` `completeTeamPlanInternal`）

伪代码（[设计候选]，锚点 `:2863` + `:2881-2884`）：

```ts
// :2863 形状检查改为「缺省合法」：
if (actor !== "convener" || !input.operationId || !input.flowId
    || (input.baseDigest !== undefined && !/^[a-f0-9]{64}$/i.test(input.baseDigest)))
  return reject("plan-identity-invalid", "Only the real convener can complete a plan against an actual document basis");
...
const effective = await readEffectiveSnapshot(deps);            // 缺失 ⇒ trunk-unavailable（不变）
const { manifest: current, snapshot: old } = effective.value;
const derivedBase = current.digest;                             // 应用事实
if (current.flowId !== input.flowId
    || (input.baseDigest !== undefined && input.baseDigest !== derivedBase))   // 严格相等（S1）
  return reject("plan-base-conflict", "Plan basis differs from the actual effective flow document snapshot");
```

- 模型**不再需要**提供 `baseDigest`；提供时必须**严格等于** `current.digest`（不做 case fold；大写 hex 形状可通过但值比较失败，与现状 `:2883` 一致，见 P-2 负例），否则维持 `plan-base-conflict`（文案不变）。
- 失败回执的 `baseDigest`（分层，S3）：**service 层** effective 读取成功后回显 `derivedBase`；读取前失败（含 `plan-identity-invalid`）回显 `input.baseDigest ?? null`；**preflight/Git 身份层**（早于 effective 读取）只能回显 `request.baseDigest ?? null`——同一逻辑请求在不同层失败的回执 `baseDigest` 允许不同（null/自报 vs 实际 digest），不视为不一致。
- 缺省化机械触点（G2，实施注意）：除 `:2863` 形状检查外，以下 7 处回执回显必须改 `?? null`（否则 typecheck 失败）：`apply-journal.ts:2858`（`plan-preparation-only` 包装）、`:2861`（`reject` 闭包）、`:1244`（`commitPreparedTeamPlan` invalid）、`trunk-runtime.ts:476-477`（Git 身份拒绝）、`:498-499`（Git `fail`）、`:824-825`（abort）、`:836-837`（preflight 拒绝）；`trunk-runtime.ts:626-627` 的「工具 schema 已保证 baseDigest 形状」注释同步修正。
- `source.baseDigest`/journal 本来就用 `current.digest`（`:2918`），无需改语义；仅"入参可能没有该值"。

### 2.2 `plan.sha256` 派生与断言（同文件，锚点 `:2894-2896`）

```ts
// 来源选择与现状完全等价（G1）：声明值优先命中冻结快照；否则以 live 为准；缺省值 => live 优先、frozen 兜底。
const frozenMatch = input.plan.sha256 !== undefined
  ? old.files.find(f => f.path === input.plan.path && f.sha256 === input.plan.sha256)   // 现状 :2894 语义
  : undefined;
const live = frozenMatch === undefined ? await store.readProjectFile?.(input.plan.path) : undefined;
const actual = frozenMatch ?? (live?.ok ? live.value : undefined)
  ?? (input.plan.sha256 === undefined ? old.files.find(f => f.path === input.plan.path) : undefined);
if (!actual) return reject("plan-hash-drift", "Plan bytes are unreadable or absent from the effective snapshot");
const derivedSha = actual.sha256;                                       // 应用事实
if (input.plan.sha256 !== undefined && input.plan.sha256 !== derivedSha) // 严格相等（S1）
  return reject("plan-hash-drift", "Plan bytes differ from the submitted exact hash");
```

- 模型**不再需要**提供 `plan.sha256`；提供时必须**严格等于**所取字节的 SHA-256。
- **行为等价（G1；P1.0 的「有意加严」已取消）**：来源选择逐字保留现状——(i) 声明 sha 命中冻结快照同 path 字节 ⇒ 用冻结字节（即使 live 不同；现状 `:2894-2896` 语义保留）；(ii) 声明 sha 未命中冻结 ⇒ 读 live 并要求 live 命中（即使 frozen 同路径留有旧字节）；(iii) 缺省 sha ⇒ live 可读用 live，live 不可读再用 frozen 同 path 兜底，两者都不可得才拒绝（S4）。**不新增** frozen/live 不一致即拒绝的规则；同路径重登记语义与现状一致。B1 兼容证据须覆盖 (i)/(ii)/(iii) 三个来源选择，不再按「有意加严」单列。
- 后续 `parseTeamPlan`、marker、`target.execution.teamPlan` 全部使用 `derivedSha`（frozenMatch 命中时 `derivedSha` 即声明值，与现状一致）。

### 2.3 重放/摘要语义（M1 裁决：保持提交原样 input；resolved 只进 marker/目标/回执）

- **`requestDigest` 与先序重放匹配保持以「提交原样 input」计算**（位置不变，`:2865`，先于任何 effective 读取/派生）：`const requestDigest = directHash({ input, actor })`；`:2874-2879` 的 `prior.message !== \`team-plan:${requestDigest}\`` 判定与命中返回既有回执**逐字保留**。`canonicalJson`（`src/common/runtime-core/report-provenance.ts:7`）按键排序且 JSON 序列化丢弃 `undefined` 属性 ⇒ 「缺省字段」与「值为 undefined」哈希一致。
- **派生/归一化只发生在重放未命中之后**（`:2881-2896`）：`resolved = { ...原样 input 字段, baseDigest: derivedBase, plan: { path, sha256: derivedSha, version } }` **只用于** marker（`:2907-2909`）、`target.execution.teamPlan`（`:2900-2901`）、`decorate`/`planRef` 回执（`:2867-2871`）与 commit 断言；journal `message`、`source`/`targetDigest` 的既有语义不变（`source.baseDigest` 本来就是 `current.digest`，`:2918`）。
- `prepareOnly` 返回的 `PreparedTeamPlanCommit.input` **保持提交原样**（`:2926` `structuredClone(input)` 不变）：Git `prepareTeamPlanCommit`（`:1232-1241`）→ `commitPreparedTeamPlan`（`:1243-1258`，`:1256` 以 `value.input` 重放）两侧的 `requestDigest` 形态一致，store 的 `journalDigest` 绑定（`git-trunk-store.ts:712/:934-937/:1031-1039`）不被破坏；派生值经 prepare 的 `manifest`/`journal`/`targetSnapshot` 承载。
- **漂移防护**：由既有 CAS（`:2934-2935`）与 Git store 的 manifest/journal/expectedSnapshot/expectedFiles 绑定 fail-closed（复核 R1.0 §3-M1 已核实两道均拒）；journal message 不额外绑定派生值，属本裁决的显式取舍（记录于审计）。
- **重放语义（钉死，P-8 变体）**：
  1. 缺省值 payload 首次成功 apply 后（trunk digest 已变），以**同 operationId、同原样 payload** 重放 ⇒ 命中先序重放分支（不读 effective、不重新派生）⇒ 返回同一回执；
  2. Git prepare→commit 完成后，以原样 payload 重放同 operationId ⇒ 同回执；
  3. 同 operationId 但 payload 形态变化（如补上声明值或改字段）⇒ `plan-operation-conflict`（既有语义，不回退）；
  4. 旧式显式 payload 在 trunk 前进后重放（既有 `test/编排/direct-role-capabilities.test.ts:411-431`，含 `:427-428` 删计划文件后重放）⇒ 逐字不变。
- **兼容锚点（I6）**：旧式显式 payload 的 `team-plan:<digest>` journal message 字节不变（同一 input ⇒ 同一 canonicalJson ⇒ 同一 hash）；任何改变该形态的实现视为回归。
- **审计不伪造（I7）**：声明值与实际不符时在归一化前即拒绝（`plan-base-conflict`/`plan-hash-drift`），不产生 journal/marker；证据只记录派生值/实际值（marker/target/回执），journal message 只绑定原样请求身份。

### 2.4 规范 run：宿主绑定（owner：桌面窗口；`app/desktop/session.ts`）

**设计（[设计候选]）**：新增 `SessionManager.completeTeamPlanForHandle(...)`，模式对齐既有 `selectRunChangeForHandle`（`:1414-1428`）：

1. 校验**当前真实回合并未变化**：`entry` 存在、`entry.handle === handle`、`entry.origins.running === origin`、`entry.busy`、`!origin.settled`、两个 abort signal 未触发（同 `selectRunChangeForHandle` 的 `current()` 语义）。
2. 取 `origin.taskId`（必须有），调用 `inspectAssignedTask({ projectRoot, actorRoleId:"convener", taskId })`（`src/pipeline/orchestration/trunk-runtime.ts:1101-1103`；实现 `apply-journal.ts:2471-2528`，返回 `{flowId, runId, kind, …}`；任务已关闭/不存在/非本角色 ⇒ `trunk-item-invalid`）。
3. `assigned.flowId !== request.flowId` ⇒ `plan-flow-conflict`；`request.runId !== undefined && request.runId !== assigned.runId` ⇒ `plan-run-conflict`（模型自报只作断言）。
4. 调用 `direct.completeTeamPlan({ ...request, runId: assigned.runId }, signal)`；核验期间回合变化 ⇒ `plan-task-changed`，不执行。
5. 接线（`:4319` 当前为 `{ completeTeamPlan: direct.completeTeamPlan }`）：改为包装函数，handle 取自与 `gitBinding`/`dispatchBinding` 同处的会话 handle（`:4371-4373` 建立 handle 的同一位置，可新增 `planBinding.handle = handle` 或复用 `gitBinding.handle`）。
6. **回执码口径（S2）**：`plan-run-conflict` 复用 service 既有码（`apply-journal.ts:2884`）；`inspectAssignedTask` 失败**直通其原码**（`trunk-item-invalid`，`apply-journal.ts:2472/:2476`，不重写）；仅宿主本地前置使用 host-local 码 `plan-task-unavailable`（无 `origin.taskId`/无当前回合）、`plan-task-changed`（核验期间回合变化）、`plan-flow-conflict`（flow 不符）——沿用 `selectRunChangeForHandle` 的 host-local 先例（`run-change-source-unavailable`/`run-change-source-changed`，`session.ts:1416-1428`），**不登记为共享稳定码**；若协调方要求登记，另评（不阻断本方案）。

**语义结论**：

- 团队计划登记的**规范 run = 当前受派任务的实际 run**（`task.created.runId`）。RR5 即 `run-hub-ce6048…`；后续 pin 本来就以任务链 run 为目标（`freezeExecutionRun` 由宿主按父任务 run 发起），两边一致。
- **多无关 draft run（RR5 的多个未 pin run；证据 `runs/` 6 个 manifest）**：不阻塞登记、不阻塞任务 run 的 pin（多 draft 不是 `findActiveRun` 的冲突条件）；本变更**不自动关闭、不清理**它们（见 §6）。
- **受支持的收敛动作（不改代码即可用）**：a) 每个任务自带 run（本方案绑定）；b) chief 可经 `project_note(set-focus, runId)` 指定焦点 run（既有工具，`schema.ts:1471-1517`，run 必须属于该 flow）；c) 真实生命周期变更走既有 run-change（rapporteur `select_run_change` 三模式，`schema.ts:47-49`；本方案不触碰）。
- 回执与 journal：成功回执的 `source.runId`（`DirectActionSource.role-direct` 已支持可选 `runId`，`src/model/trunk.ts:560-562,666-678`）携带绑定 run；`planRef` 携带派生 `sha256`。**marker 不变**（见 §2.6）。

### 2.5 `project_state` / `version-decision` 的 `run-ambiguous` 保留边界

- **保留（不改代码）**：`project-state.ts:710-724` 与 `version-decision.ts:129-153` 原样。理由：
  - 版本决策（version-modify/new-version-development）必须在多活动 run 间有明确对象——歧义是真实风险，不能自动选。
  - 多个 **pinned** run 冲突继续是硬错误（`run-manifest.ts:307-319`、`:658-662`）。
  - 旧的多 draft run 是历史事实，自动关闭属 run 生命周期变更（T3），不在本方案。
- **语义澄清**：`run-ambiguous` 不是团队计划登记的前置；完成登记后，角色不需要为登记去 pin/关闭任何 run。角色若读到该 blocker，应如实报告为「版本决策面事实」，而不是自行要求 pin——这一点由工具描述/回执引导（§2.6），不新增角色提示词（客户裁定不改角色卡）。

### 2.6 工具契约变更（owner：运行时核心 + convener-code + 编排）

| 层 | 变更（[设计候选]） |
|---|---|
| `src/model/runtime.ts` `CompleteTeamPlanInput` | `baseDigest?: string`；`plan: { path: string; sha256?: string; version: number }`；`runId?` 不变。注释写明：应用按 effective trunk digest 与计划实际字节派生；声明值仅断言；runId 由宿主绑定。 |
| `src/provider/runtime/schema.ts:50-52` | `required` 改为 `["operationId","flowId","plan"]`；`plan` 对象 required 改为 `["path","version"]`，`sha256` 可选（仍 64 hex 形状）；描述改写：应用派生 effective trunk digest 与实际字节 SHA-256，可省略或给匹配断言；未知/不可读/漂移拒绝；runId 由应用按实际受派任务绑定，勿猜。 |
| `src/provider/runtime/tools.ts` | 无逻辑变更（`directShapeError` 按 schema 机械校验；`describeTool` 数据源即 schema.ts）。回归/形状测试更新。 |
| `src/pipeline/orchestration/trunk-runtime.ts:629-638` `convenerTeamPlanFacts` | 缺省字段不投影（或投影为 undefined 由 preflight 视为缺省）；`runId` 宿主绑定后总在。 |
| `src/common/roles/convener/index.ts` `checkTeamPlan`（`:405-440`） | `baseDigest` 可缺省（给了必须 hex64）；`plan` 键集允许 `{path,version}` 或 `{path,sha256,version}`，`sha256` 给了必须 hex64；**路径/版本规则逐字保留**（`:432-438`）。`TEAM_PLAN_FACT_KEYS` 不变（键仍合法）。 |

- **兼容矩阵**（旧→新）：

| 调用方 | 行为 |
|---|---|
| 旧 payload（`baseDigest`+`plan.sha256` 正确） | 与现状完全一致（requestDigest/journal/marker/回执）；既有测试原样通过 |
| 旧 payload（正确）+ frozen 同路径旧字节未命中声明值 | 与现状一致：读 live，live 命中声明即接受（**不**新增拒绝，G1） |
| 旧 payload（正确）+ 声明命中 frozen 同路径字节 | 与现状一致：用 frozen 字节（即使 live 不同） |
| 旧 payload（值错误） | 与现状一致拒绝（`plan-base-conflict` / `plan-hash-drift`） |
| 新 payload（缺省值） | 应用派生；成功回执含实际值；来源选择 (iii) 见 §2.2 |
| 新 payload（声明 + 正确） | 断言通过，等价旧 payload |
| 新 payload（声明 + 错误） | 断言拒绝（fail-closed） |
| 任何 payload + 模型 `runId` ≠ 任务 run（桌面路径） | `plan-run-conflict` |

### 2.7 Git 路径与 fs 路径一致性（不改门禁政策）

- fs 路径：`service.completeTeamPlan`（`apply-journal.ts:2856`）→ `completeTeamPlanInternal`（派生逻辑唯一实现）。
- Git 路径：`executeGitTeamPlanPublication`（`trunk-runtime.ts:475-479`）→ `executeGitBusinessPublication`（`:491-503`）→ `prepareTeamPlanCommit`（`apply-journal.ts:1232-1242`，内部 `completeTeamPlanInternal(..., prepareOnly=true)`）→ `commitPreparedTeamPlan`（`:1243-1258`）。派生发生在 prepare（经 manifest/journal/targetSnapshot 承载）；commit 以**原样 input** 重放（M1 裁决）并重验字节/基线（I2）。
- **marker 不变**：`marker = { schema:"team-plan-completion/v1", operationId, actorRoleId, flowId, plan, modules, roster }`（`apply-journal.ts:2907-2909`）——`plan` 用规范化值（与旧式正确调用相同）。因此**不需要**改 `src/common/门禁引擎/classify-shell.ts` 的 marker 期望字节（gate 检查在 `:656-659`、policy 检查 `:664`；门禁引擎 owner 零参与；避免扩写集）。规范 run 只记入 `source.runId`/回执，不入 marker。
- 可选（不推荐，Q4）：若协调方要求 runId 进入不可变 marker，则必须同步改 `classify-shell.ts` 的 `git-policy-plan-marker` 期望（门禁引擎 owner），写集扩一层并重评档位——本方案默认不做。

### 2.8 未选方案对比：把摘要作为「只读事实」暴露给角色（方案 B，不推荐）

| 维度 | 方案 A（本方案：应用派生/校验） | 方案 B：扩展只读事实（`contract_check` 输出 effective trunk digest/plan sha，或新增只读工具） |
|---|---|---|
| 契约 | 工具入参加法可选（non-breaking） | 新增工具面或改 `contract_check` 输出/语义（公共工具面扩大） |
| 写集 | 运行时核心（schema/model）+ 编排（service/runtime）+ convener-code + 桌面窗口 | 上述 + 事实构建器（`workflow-preconditions.ts`/桌面 `contractCheckText`）+ 角色提示/描述 + 测试；面更大 |
| 正确性 | 值由应用在提交点现取，天然无 TOCTOU | 角色读到值→调用之间仍可能漂移；应用**仍须**再核（否则可伪造），即两处事实、双保险变双写 |
| 失败面 | 未知/不可读/漂移都在一个地方 fail-closed | 事实过期/截断（现状 hash 已截断 12 位）/工具不可用时，角色仍无法推进；需再设计降级 |
| 审计 | 只记录应用事实 | 需防「角色把事实工具输出改写后再提交」的伪造面 |
| 结论 | **推荐** | 不采纳（可作为未来只读诊断增强，不承担放行职责） |

### 2.9 明确不解决：effective trunk 缺失（下一门，如实披露）

- `completeTeamPlanInternal` 要求 effective snapshot 含 roster/modules（`:2881-2893`）——这是团队计划的合法依据，不能放宽。RR5 目标没有 `.ans/trunk/manifest.json`（§1.1-4），因此修复路径/摘要后仍会（正确地）停在 `trunk-unavailable`（或 `plan-basis-incomplete`）。
- 本方案**不**自动 bootstrap trunk、不从 live 文档凭空构造 digest（那会破坏「effective manifest 是唯一依据」与冻结语义，属实质变化）。
- RR6 的处置见 §4.2：若停在该门，如实记录为「下一门」；是否把 bootstrap publication（VCA `baseTrunk:null`+`bootstrap:true`）纳入真实流程，由协调方另行决策（Q6）。

---

## 3. 范围、owner 与写集

### 3.1 逐文件唯一 owner（Section 1 内；[设计候选]）

| # | 文件 | Owner（单一） | 变更 |
|---|---|---|---|
| W1 | `src/model/runtime.ts` | 运行时核心 | `CompleteTeamPlanInput` 可选化 + 注释（公共契约加法；与 judge/文档格式同文件不同区域） |
| W2 | `src/provider/runtime/schema.ts` | 运行时核心 | `complete_team_plan` 参数 schema/描述（可选断言、宿主绑定 run） |
| W3 | `src/service/trunk/impl/apply-journal.ts` | 编排 | `completeTeamPlanInternal` 派生/断言（严格相等）；`resolved` 仅 marker/target/回执（M1 裁决）；机械触点 `:2863` 可选形状 + `:2858/:2861/:1244` 的 `baseDigest ?? null`（G2）；`source.runId` 记录 |
| W4 | `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | `convenerTeamPlanFacts` 缺省字段投影（preflight 事实）；`:476-477/:498-499/:824-825/:836-837` 回显 `baseDigest ?? null`；`:626-627` 注释同步（G2） |
| W5 | `src/common/roles/convener/index.ts` | convener-code | `checkTeamPlan` 可选字段放宽（路径/版本/未知键规则不变；**卡文本不改**） |
| W6 | `app/desktop/session.ts` | 桌面窗口 | `completeTeamPlanForHandle` 宿主 run 绑定 + 接线（`:4319`、handle 建立处） |
| T1 | `test/编排/direct-role-capabilities.test.ts` | 编排 | 派生/断言/兼容/NoOp/run 绑定用例（fs 路径） |
| T2 | `test/编排/git-capabilities.test.ts` | 编排 | Git prepare→commit 派生路径用例（新增/扩展；该文件既有「Git team plan publication…」为基线已知红项，按增量口径，不得作为 pass 证据） |
| T3 | `test/roles/convener/convener-module.test.ts` | convener-code | preflight 可选字段/路径规则保持 |
| T4 | `test/runtime-core/submit-capability-tools.test.ts` | 运行时核心 | schema 形状：省略 base/sha 合法、缺 path/version 非法、旧形状合法 |
| T5 | `test/桌面应用/chief-workflow.test.ts` | 桌面窗口 | 宿主绑定：真实 busy convener 回合、task run 注入、冲突/无任务拒绝（**避免使用 `test/桌面应用/session.test.ts`**——该文件当前不存在，文档格式变更计划恢复，避免同文件冲突） |
| T6 | `test/编排/convener-module-consumption.test.ts` | 编排 | 多 draft run 下登记成功、pinned 冲突不受影响（集成层） |

- 既有测试若断言「`baseDigest`/`plan.sha256` 为 schema 必填」需改写：按 B1 口径逐条记录旧断言/新断言/理由（§4.3），不得静默放宽 fail-closed 断言。
- 测试基线已知红项按 B1 v1.1 口径（`test/编排/**` 22 fail/2 skip；`test/桌面应用/chief-workflow.test.ts` 参考 A.2 改后基线 63/47–48/15，**实施时重测**再定）：**新增确定性失败 = 0、新 skip = 0、已知红项不恶化**；不得为求绿改基线红项或在写集外修测试。

### 3.2 H1 delta 与职责边界

- **H1 delta = 0**：不改任何 `角色卡/**`、`boundary.md`、`boundary.yaml`、卡文本（`CONVENER_CARD_TEXT` 逐字不动）；**团队计划仍归运营**；不新增/删除角色；不改派发矩阵/卡种/权限。`src/common/roles/convener/index.ts` 只改 preflight **纯策略**代码（可选字段），不改身份/职责/工具集。
- 路径/格式（`docs/scheduling/<flowId>-team-v<N>.md`）只读引用文档格式变更，不在本方案实现、不改校验正则、不改 `parseTeamPlan`。
- 卡文本第 62 行现写「提交版本化团队计划及 path/hash/version、flowId、当前依据摘要」——与新契约（应用派生）存在**文案偏差**；按客户「不改角色卡」裁定**本变更不修改**，以工具描述为执行口径；如需同步，走后续角色卡维护流程（Q5）。

### 3.3 与并行变更的冲突与串行安排

| 并行变更 | 同文件 | 冲突级别/安排 |
|---|---|---|
| judge 代批 P1.2（实现 W-J1–J5 已在本工作树未提交） | `src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/model/runtime.ts`、`src/common/门禁引擎/classify-shell.ts` | **中**：`apply-journal.ts` 与 `trunk-runtime.ts` 是 judge 主战场（本方案只在其区域外：`completeTeamPlanInternal` / `convenerTeamPlanFacts`），`model/runtime.ts` 不同区域；**必须串行**：judge 候选冻结/合并后，本变更从该基线重切再实施；本变更**不碰** `classify-shell.ts` |
| 文档格式 P1.2（`886fef84…`；B1 `bec45edf…`） | `src/model/runtime.ts`、`app/desktop/session.ts`（其设计 §10.1/§10.3）、计划恢复 `test/桌面应用/session.test.ts` | **中**：与 W1/W6 同文件；串行写（judge → 本变更 → 文档格式，或按协调方裁决次序）；本变更避开 `session.test.ts`（用 `chief-workflow.test.ts`），降低测试文件冲突 |
| 提案卡修复（已提交 `fb1aa39`） | 无（已入库） | 无冲突；只读引用其 A′ 证据机制（decision snapshot 与本变更无交集） |
| 本工作树其它脏文件（judge 未提交集） | — | **不属于**本候选；B1/实施按「候选 = 写集内文件」认定，不得把 judge 改动混入本候选证据 |

- 纪律：同一文件同一时刻单一写者；合并前互相 diff 检查；后合并方 rebase 并重跑双方测试矩阵；本方案**不修改** judge/文档格式的记录、方案、验收、调度文件。

---

## 4. 测试与验收（B1 输入）

### 4.1 确定性测试矩阵（[设计候选]）

| # | 层/Owner | 用例 | 必须观察 |
|---|---|---|---|
| P-1 | 编排/T1 | effective trunk 存在；模型只给 `{path,version}` → `completeTeamPlan` | `status:"applied"`；`source.baseDigest === manifest.digest`；`planRef.sha256 === sha256(实际字节)`；trunk 版本+1；marker `plan.sha256`=实际值 |
| P-2 | 编排/T1 | 声明 `baseDigest` ≠ effective → 拒绝；另加大写 hex 且取值正确的负例（S1） | `plan-base-conflict`；无 journal/marker/trunk 变更；大写值与现状一致被拒（严格相等） |
| P-3 | 编排/T1 | 声明 `plan.sha256` ≠ 实际字节 → 拒绝；另加大写 hex 负例（S1） | `plan-hash-drift`；无副作用 |
| P-4 | 编排/T1 | 计划字节不可得（live 不可读且无同 path frozen）；frozen 与 live 同时存在时的来源选择 | 前者 `plan-hash-drift` fail-closed；后者按 §2.2 (i)/(ii) 来源选择（不做「frozen/live 不一致即拒绝」，G1）：声明命中 frozen 用 frozen、否则 live 命中即接受 |
| P-5 | 编排/T1 | 无 `.ans/trunk/manifest.json`（RR5 形态） | `trunk-unavailable`；不生成任何摘要、不写盘（如实 fail-closed） |
| P-6 | 编排/T1 | 旧式完整 payload（值正确） | 与基线逐字一致：同 operationId 重放/幂等返回同回执；marker/journal 字节可复算一致 |
| P-7 | 编排/T1 | `runId` 属于 flow / 不属于 | 属于 ⇒ 成功且 `source.runId` 记录；不属于 ⇒ `plan-run-conflict` |
| P-8 | 编排/T1 | 重放语义四变体（M1）：①缺省 payload 首成功后同 operationId 同原样 payload 重放；②Git prepare→commit 后原样 payload 重放；③同 operationId 但 payload 形态变化；④删除计划文件后旧式显式 payload 重放（既有 `:427-428`） | ①② ⇒ 命中先序重放、同一回执（不读 effective/不重派生）；③ ⇒ `plan-operation-conflict`；④ ⇒ 逐字不变；旧式 `team-plan:<digest>` message 字节锚点保持 |
| P-9 | 编排/T2 | Git 路径：prepare（省略值）→ commit；prepare 后计划字节漂移 | 省略值仍可 prepare/commit（**prepared input 保持原样**，M1 裁决）；漂移 ⇒ 断言/CAS 拒绝；`classify-shell` 政策原样通过；该文件既有「Git team plan publication…」（`:514`）为基线已知红项，B1 须记录其红因与新增用例的隔离/关系（S5-3） |
| P-10 | convener-code/T3 | preflight：缺 `baseDigest`/`plan.sha256` 允许；给错形状拒绝；路径/版本错误仍 `team-plan-path-invalid`；未知键仍 `facts-unknown` | 逻辑同 §2.6；路径规则逐字不变 |
| P-11 | 运行时核心/T4 | 工具形状：省略 `baseDigest`/`plan.sha256` 结构合法；缺 `plan.path`/`plan.version` 拒绝；未知键拒绝；旧形状合法 | `directShapeError` 判定符合 schema；成功回执 JSON 含派生 `planRef.sha256` |
| P-12 | 桌面窗口/T5 | 真实 busy convener 回合 + 受派任务：模型省略 runId / 自报不同 runId / 无当前任务 / 回合变化 | 省略 ⇒ 注入任务 run；不同 ⇒ `plan-run-conflict`（service 既有码）；本地前置无任务/回合变化 ⇒ host-local `plan-task-unavailable`/`plan-task-changed`；`inspectAssignedTask` 失败直通 `trunk-item-invalid`（S2 分层） |
| P-13 | 编排/T6 | 集成：多 draft run + `run-ambiguous` 状态下，convener 经受派任务登记计划 | 登记成功且绑定任务 run；`project_state`/`version-decision` 行为不变（只读对照） |
| P-14 | 回归 | pinned/无 run 分支、run-manifest、`evidence_check`/`contract_check` 输出 | 零行为变化；相关既有测试原样通过 |
| P-15 | 编排/T1 | 非规范路径（RR5 形态：`docs/scheduling/<flowId>-team-plan-v1.md` 等） | 仍 `plan-path-invalid`（服务层正则，与前置层一致）；**不因本变更放宽**；该失败归文档格式责任 |

- 运行命令（供 B1 定稿）：`node --test` 逐文件或按目录（`test/编排/**`、`test/runtime-core/**`、`test/roles/convener/**`、`test/桌面应用/chief-workflow.test.ts`）；`npm run typecheck` exit 0；记录 tests/pass/fail/cancelled/skip/exit 与日志 hash。

### 4.2 真实运行 RR6（预批预算；[设计候选] 验收输入）

- 环境：真实 Electron（本 worktree `app/main.ts`）+ 真实模型 + 真实 UI；隔离 `--userData`（仓库外专用路径）；CDP **仅 9223**；**9222 全程零监听/零占用**；目标 = **现有贪吃蛇 target**（`C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target`，含多个未 pin draft run/`pinned=none`/`run-ambiguous` 形态即可复用）；运行根仓库外。
- 预算（协调方已预批）：客户消息 **1**（仅合法客户决策时 +1）；卡片 ≤**4**；应用层派发 ≤**8**；chief 回合 ≤**8**；convener 回合 ≤**3**；product/impl ≤**4**；其它角色各 ≤**2**；Git 能力调用 ≤**4**；墙钟 ≤**45 分钟**；**首个决定性结果即停**；**不自动重试**；**不触碰其它实例**（9222）。
- 目标链条：提案 → 团队计划 → 任命 → 实现 → 出游戏**或下一门**。
- **预期分支（S5-1，派发记录须预先写明）**：现 target 无 `.ans/trunk/manifest.json`（RR5 同态，只读实测），故 **RR6 的第一个决定性结果几乎必然是 RR6-B（`trunk-unavailable`/`plan-basis-incomplete`）**；happy path（登记成功 + 派生值 + 绑定 run）由 P-1/P-9/P-13 确定性测试覆盖。**不得**为触发 RR6-A 临时 bootstrap trunk（属 §5.1 升 T3 触发器）。
- **预算留痕（S5-2）**：本预算来自协调方书面消息预批；仓库内无独立记录，RR6-D 证据须绑定/引用该书面记录原文。
- 本变更的 RR6 判据：
  - **RR6-A（happy path；确定性覆盖为主）**：convener 调用 `complete_team_plan` 时**不需要也不伪造** `baseDigest`/`plan.sha256`；若前置齐备（规范路径 + effective trunk），登记成功且回执含应用派生的 `planRef.sha256` 与 `source.runId`（= 本任务 run），随后流程继续（任命卡或下一门）。
  - **RR6-B（主预期/如实下一门）**：若停在明确的下一门，必须原件记录并归类：`plan-path-invalid`（路径/格式 → 文档格式变更责任；chief 任务文本应写明规范路径）、`trunk-unavailable`/`plan-basis-incomplete`（无 effective trunk publication → §2.9 前置）、任命卡被拒（`appointment` 仅人事（nominator）可发——RR5 chief 任务文本要求 convener 发任命卡，与 `run-role.ts:1294-1310` 不符，属流程文本问题）。**不得**把下一门判为本变更失败，也不得宣称已过。
  - **RR6-C（fail-closed 观察，若可触发）**：模型若仍自报错误 `baseDigest`/`sha256`/`runId`，回执必须是既有稳定 code（断言拒绝），不得被接受。
  - **RR6-D（预算/隔离/证据）**：按 §4.2 预算执行；9222 零改动、9223 释放、证据原件（诊断/账本/run manifest/回执/截图）绑定候选身份；模型名如实记录（RR5 实测 `deepseek-v4-flash`，非 Anthropic Claude，见 §5.4）。

### 4.3 证据要求（B1 输入）

- 候选身份：HEAD/tree/changedPaths/逐文件 SHA-256/聚合、候选只含 §3.1 写集；写明公共契约（schema/model）变更为**加法可选**（non-breaking）与旧调用兼容证据。
- 每条 AC/P 用例的证据绑定命令、环境、计数、日志 hash；旧断言改写逐条记录（旧文/新文/理由/对应 P 项）。
- B1 逐条记录 payload 形态（旧式显式/缺省值/Git prepare→commit）与对应重放变体结果（M1）；来源选择 (i)/(ii)/(iii) 的兼容证据单列（G1）。
- 真实运行与确定性测试分层独立：确定性证据不得用真实运行替代，反之亦然。

---

## 5. Q 清单 / P 属性 / 风险 / 披露

### 5.1 P 属性（方案元数据）

| 属性 | 值 |
|---|---|
| 文档编号 | **P1.1**（本方案修订稿） |
| 变更类别 | **change**（非 fix/refactor；协调方已批准按 change） |
| 风险档位 | **T2（建议，维持协调方批准）**：改公共工具契约（加法可选）+ service/宿主绑定；**无 run 生命周期语义变化**（不 pin/close/restart/清理；`run-ambiguous` 语义不变）；无权限/闸门/验收变化 |
| 升 T3 条件（任一） | 需要 bootstrap trunk/从 live 文档构造 effective；需要自动关闭/收敛旧 draft run；需要改 `RunManifest`/marker/`classify-shell` 政策；需要改角色卡/边界/职责（客户已否）；实施发现公共契约 breaking |
| 闸门 | 按预授权免逐次闸门；实质变化停并回报；提交/推送/合并/发布未授权 |
| 写盘属性 | 本轮仅写本文件（`docs/planning/`） |

### 5.2 Q 清单（待协调方/复核确认）

| Q | 问题 | 本方案处置/建议 |
|---|---|---|
| Q1 | T2/T3 判定 | **T2**（无 run 生命周期语义实质变化；公共契约是加法可选）。若统筹口径为「凡改 Model 公共工具契约即 T3」，请按口径升档并在派发前知会。 |
| Q2 | `run-ambiguous` 是否需要在 `project_state` 中对团队计划场景降噪 | **建议不改**：保留为版本决策面事实；登记不再消费它（§2.5）。若要求在 blocker 文案中注明「不阻塞团队计划登记」，属 `project-state.ts` 改写，需另评（本方案不含）。 |
| Q3 | 旧 draft run（RR5 的多个未 pin run）清理/收敛 | **本变更不做**；不自动关闭（生命周期语义）。既有收敛动作：focus runId（chief `project_note`）、run-change（rapporteur `select_run_change`）。批量清理建议另立变更。 |
| Q4 | 规范 run 是否写入不可变 marker | **建议只写入 `source.runId` 与回执**（marker 不变 ⇒ 门禁 `classify-shell.ts` 零改动）。若要求进 marker，须门禁引擎 owner 同步改 `git-policy-plan-marker` 期望，写集扩层并重评档位。 |
| Q5 | convener 卡文本第 62 行与新契约的文案偏差 | 按客户「不改角色卡」裁定**本变更不改**；以工具描述为执行口径。如需同步，走后续角色卡维护流程。 |
| Q6 | RR5 观测到的「无 effective trunk publication」前置 | 本变更不放宽（§2.9）。是否把 bootstrap publication（`baseTrunk:null`+`bootstrap:true`）纳入真实流程/自动步骤，请协调方另行决策（可能另立变更）。 |
| Q7 | RR5 chief 要求 convener 发 `cardKind=appointment` 与实现（仅 nominator 可发）冲突 | 属真实运行流程文本问题（非应用缺陷）；RR6 若在此停，如实记录为下一门；建议由统筹/沟通在任务文本中改由 nominator 发起。 |
| Q8 | 桌面宿主绑定要求「当前真实受派回合 + 打开任务」 | 生产路径（桌面派发）均满足；CLI/一次性运行不注入 `completeTeamPlan`（[事实]：仅 `app/desktop/session.ts:4319` 注入），故无回归面。如未来 CLI 需要，须另行设计（不得绕过绑定）。 |
| Q9 | `plan.version` 是否也应应用派生 | **不**：版本是角色声明（决定 v1/v2 与路径一致性），沿用既有路径/版本校验。 |
| Q10 | 缺省 `baseDigest` 的失败回执 `baseDigest` 字段（分层，S3） | service 层 effective 读取成功后回显实际 digest；读取前失败（含 `plan-identity-invalid`）回显 `input.baseDigest ?? null`；preflight/Git 身份层（早于 effective 读取）只能回显 `request.baseDigest ?? null`。同一逻辑请求跨层失败的回执 `baseDigest` 允许不同（null/自报 vs 实际），不视为不一致；`DirectActionReceipt.baseDigest` 允许 null。 |

### 5.3 风险与缓解

| 风险 | 缓解 |
|---|---|
| R1 派生掩盖模型错误 | 声明值≠实际 ⇒ 既有 code 拒绝；派生只在"未声明"时生效；证据只记录实际值（I1/I7） |
| R2 宿主绑定错 run | 三层校验（handle/turn 当前性 + `inspectAssignedTask` 仅本人未关闭任务 + flow/run 断言）；期间变化即 `plan-task-changed`（I3） |
| R3 prepare/commit 漂移 | prepare 保留原样 input（派生值经 manifest/journal/targetSnapshot 承载）；commit 重验 effective/字节 + 既有 CAS/expectedFiles（§2.7、M1） |
| R4 与 judge/文档格式同文件冲突 | 严格串行 + 重切基线 + 双测矩阵（§3.3） |
| R5 RR6 停在 trunk/任命门 | 如实记录下一门（§4.2 RR6-B），不判本变更失败、不伪造成功 |
| R6 多 draft 造成误判 pin 冲突 | 多 draft 非冲突（仅多 pinned）；文档/回执写明 |
| R7 旧 payload 行为回归 | P-6/P-8 钉住 requestDigest/marker/NoOp 等价；既有测试只读回归 |

### 5.4 如实披露

1. **模型**：RR5 会话原生记录 `message.model` 实测为 **`deepseek-v4-flash`**（.env 配置；非 Anthropic Claude）。本方案按 RR5 实测记录；RR6 证据须如实记录实际模型，不得宣称 Claude。
2. **既有 judge 工具面问题**：RR5 提案卡执行期 `chief-decision.failed`（`phase=execution`）为既有问题（RR4/S1 已记录），**不属本门**；judge 变更另案在飞。
3. **路径/格式**：RR5 的 `plan-path-invalid` 是正确校验，本方案不修；规范路径/格式归「文档格式说明」变更（`886fef84…`）。
4. **下一道前置**：RR5 目标无 effective trunk；本方案不放宽、不 bootstrap（§2.9）。
5. **本方案未运行任何真实模型/测试**；所有代码行为为只读核对结论（[事实]/[推断] 已标记）。
6. **RR5 应用/首席回环**：RR5 记录 §5.3/§6.5/§10-3 的重复提案卡（`req-5a9f23a5034b45eb`，同 taskId）与同任务重投、convener 二次 blocked，均为应用/回环行为（驱动 0 重试）；RR6 预算/判读须计入该既有现象（首果即停、不自动重试口径不变）。

---

## 6. 非目标（明确不做）

1. 不改团队计划归属/角色职责/角色卡/边界/提示词（客户最终裁定；H1 delta = 0）；不新增/删除角色；不动派发矩阵/卡种。
2. 不改路径/版本/roster/modules/结构/owner/writeset 校验；不把路径错误当代码修复。
3. 不伪造 `baseDigest`/`plan.sha256`/`runId`；不把未核实的模型值写入证据。
4. 不做 run 生命周期动作（pin/close/restart/批量清理）；不改 `project_state`/`version-decision` 的 `run-ambiguous` 语义与文案。
5. 不自动 bootstrap trunk、不从 live 文档构造 effective digest。
6. 不改 `marker`/`classify-shell` 政策；不新增工具/卡种/IPC/账本事件；不改门禁/权限/验收语义。
7. 不实施/不测试/不提交/不推送/不合并/不发布；不运行真实模型（RR6 为后续验收阶段，预算已由协调方预批）。

---

## 7. 残余待确认（提交复核/协调方）

1. Q1（T2 确认/口径）、Q4（marker 边界）、Q6（bootstrap publication 是否另立变更）、Q7（任命卡流程文本）、S2（host-local 码是否登记为共享稳定码）需协调方裁决。
2. judge 实现候选（当前未提交）冻结/合并的时间点决定本变更的实施基线；文档格式变更的排序由协调方定。
3. RR6 的 chief 任务文本必须包含规范团队计划路径（`docs/scheduling/<flowId>-team-v<N>.md`），否则路径门会掩盖本变更效果（文档格式责任）；RR6-D 预算证据须绑定协调方书面预批记录（S5-2）。
4. 待独立复核确认：P1.1 对 M1/G1/G2/S1–S6 的处置（§8）；行号受 judge 未提交集影响，实施以符号锚点为准；确认后再进入 B1 与实施派发。

---

## 8. 复核 R1.0 处置（P1.1）

> 输入：`docs/planning/2026-11-09_review_team-plan-run-binding.md`（R1.0，结论「建议修订后提交」；M1/G1/G2/S1–S6）。本轮只改本文件；未实施、未测试、未提交/推送/合并。

| # | 复核问题 | 处置 | 落点 |
|---|---|---|---|
| M1 | `requestDigest` 用 resolved 与先序重放/派生顺序不自洽；缺省 payload 重放、Git prepare→commit 摘要绑定 | **采纳方案 a（最小语义变化）**：`requestDigest`/重放匹配保持「提交原样 input」（位置 `:2865` 不变）；`resolved` 仅用于 marker/target/回执/commit 断言；`PreparedTeamPlanCommit.input` 保持原样；漂移由既有 CAS + Git store 绑定 fail-closed；P-8 增四变体（缺省重放/Git prepare→commit 后重放/payload 形态变化/既有删除后重放）；旧式 `team-plan:<digest>` 字节锚点写入 I6 | §2.0 I6、§2.3、§4.1 P-8、§4.3 |
| G1 | I6 与「有意加严」冲突 | **取消加严**：来源选择逐字保留现状（声明命中 frozen 用 frozen；未命中读 live；缺省 live 优先、frozen 兜底），不新增 frozen/live 不一致拒绝；§2.6 兼容矩阵增等价行；B1 按 (i)/(ii)/(iii) 三来源选择取证 | §2.2、§2.6 矩阵 |
| G2 | `:2863` 形状检查与 7 处 `baseDigest` 回显机械触点未列 | §2.1 伪代码含可选形状检查；列出 `apply-journal.ts:2858/:2861/:1244` 与 `trunk-runtime.ts:476-477/:498-499/:824-825/:836-837` 的 `?? null`；W3/W4 行内登记；`:626-627` 注释同步；`npm run typecheck` exit 0 列为 B1 必过 | §2.1、§3.1 W3/W4、§4.1 命令行 |
| S1 | `.toLowerCase()` 属旧调用行为变化 | **保留严格相等**（与现状 `:2883`/`:2896` 一致）；P-2/P-3 增大写 hex 负例 | §2.1、§2.2、§4.1 P-2/P-3 |
| S2 | host-local 回执码未登记、与 `trunk-item-invalid` 口径不一致 | §2.4 第 6 条：`plan-run-conflict` 复用既有码；inspect 失败直通 `trunk-item-invalid`；仅本地前置用 host-local 码（沿用 `run-change-source-*` 先例），不登记共享码（如需登记见 §7-1） | §2.4、§4.1 P-12 |
| S3 | Q10 回执分层回显 | Q10 与 §2.1 写明 service/preflight/Git 三层口径；RR6 观察按层核对 | §2.1、§5.2 Q10 |
| S4 | frozen 存在、live 不可读与 I2 措辞冲突 | I2 改为「计划字节不可得（既无匹配冻结字节、live 也不可读）」；§2.2 (iii) 明确 live 不可读用 frozen 兜底 | §2.0 I2、§2.2 |
| S5 | RR6 主判据前置不成立/预算留痕/已知红 | §4.2 增「预期分支」与「预算留痕」；P-9 增已知红关系说明；明确不得临时 bootstrap | §4.2、§4.1 P-9、§7 |
| S6 | 行号/基线小项 | §1.2 维持 `:2860-2948`（当前检出实测）；§2.7 marker 期望改 `:656-659`/policy `:664`；T5 基线改「实施时重测 + 参考 A.2 改后 63/47–48/15」 | §1.2、§2.7、§3.1 基线注 |
