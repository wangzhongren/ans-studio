# W1（W1/W2/T4）实施记录：团队计划登记 run 绑定 / baseDigest 合法来源（运行时核心）

- 任务：`2026-11-09-team-plan-run-binding` / 批次 **W1/W2/T4**（团队计划 `docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md` §三/§四/§五；SHA-256 `48148836ed80291446e16e021446512b734f4b7546f767b497a093c50324934d`）。
- 角色：运行时核心（`roleId: 运行时核心`；Section 1 写集；独立实施上下文）。只写 W1/W2/T4 与本角色记录；不提交/推送/合并/发布。
- 判据：B1 v1 `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（SHA-256 `eb94d7cbf9d8c2aaf32b4ebeda60f5e53d76d6d1b9944fdd7c1cd6f30da6b5ce`）§2.1（W1/W2/T4）、§3.3（AC-9）、§4.1（P-11）、§4.3-4（旧断言记录）、§7（判定）；方案 P1.1 `docs/planning/2026-11-09_design_team-plan-run-binding.md`（SHA-256 `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b`）§2.1/§2.6/§3.1。以上三份必读文档 hash 已在本批开始前实测一致。
- 日期：2026-11-09。状态：**已实施、已跑定向测试与 typecheck；未 commit / 未 push / 未 stash / 未 merge / 未发布；typecheck 因后续批次未实施而暂红（如实记录，见 §5）**。

## 1. 基线（实施前实测）

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 | `feat/plan-escalation-card` |
| HEAD | `24799cb61239272e8603018adc094881bb6263dd`（judge 代批 T3 已提交；tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`） |
| 起始工作树 | `git status --porcelain -- src app test` 输出为空（0 行） |
| 边界 | 三目标均在 Section 1：`src/model/runtime.ts`（单文件）、`src/provider/runtime/schema.ts`（单文件）、`test/runtime-core/`（目录）；本记录目录 `角色卡/运行时核心/docs/change/`（目录） |
| 说明 | 工作树内其它 `??` 文件为此前会话遗留的未跟踪临时件，不属于本批候选；本批未触碰 |

## 2. 改动文件、逐文件 SHA-256 与候选身份

| 文件 | 前（HEAD blob raw SHA-256） | 后（工作树 raw SHA-256） | numstat | 后置行/字节 |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | `3c782d3dfb156e484d3779ac72db5985ff0da4294447c7b80a81dda2d8ad2158` | `307694ceac763033f42a5686a511b9e05cece31f0f49f27a206298ab4a98a61e` | +8 / −2 | 4147 行 / 210,268 bytes |
| `src/provider/runtime/schema.ts` | `fb813bb6dadc5f5ca28d00603a442be5c4f0424047444fd7d8d6258e0cdcba6a` | `b0b01f010b7e971cf6cbb55b2f1832a699c950474380a797f6d8b2738308a01d` | +2 / −2 | 1835 行 / 145,715 bytes |
| `test/runtime-core/submit-capability-tools.test.ts` | `1aaae579daed8b844f32156c73c3e478feb4a1885b72c16418913809e4162eeb` | `c6f7a24abfc8f3a8c83079752d769651086bdc936c288de9210d445ea53174c3` | +61 / −0 | 578 行 / 35,433 bytes |

- **可复算聚合**（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）：`0be305fb923da53a305657972b2d8a350ce7c43846da231ef2fa0cdbb5d48b92`。
- 候选 diff：7,877 bytes，SHA-256 `2ebd0605448fc7dd306efe6fe1bc1dc56b00f2479d2a402df4c12d050e325fb1`（原件 `2026-11-09_W1_team-plan-run-binding-evidence/candidate.diff`）。
- **区域核对**：`src/model/runtime.ts` 的 diff 仅落在 `CompleteTeamPlanInput` 区域（hunk `@@ -2465,12 +2465,18 @@`，即 SelectRunChange 段与 CompleteTeamPlanInput 之间），judge T3 已提交内容及其它类型/行为未混入；`schema.ts` diff 仅 `complete_team_plan` 条目两行。
- 未新增/删除/重命名文件（候选内）；无新依赖；未改构建/发布配置。

## 3. 变更详情

### W1 `src/model/runtime.ts`（`CompleteTeamPlanInput`，前 `:2468-2475` → 后 `:2474-2480`，注释 `:2468-2473`）

- `baseDigest: string` → `baseDigest?: string`；`plan.sha256: string` → `sha256?: string`；`runId?: string` 保持。
- 新增注释（逐字见 diff）：应用从 effective trunk manifest digest 派生 `baseDigest`、从计划实际字节派生 `plan.sha256`；模型声明值仅断言，不符即既有 `plan-base-conflict`/`plan-hash-drift`；`runId` 由桌面宿主从当前真实受派任务绑定，模型自报仅断言。
- 只改该区域；未改 judge/文档格式区域或其它类型/行为。

### W2 `src/provider/runtime/schema.ts`（`complete_team_plan`，`:50-52`）

- 顶层 `required`：`["operationId","flowId","baseDigest","plan"]` → `["operationId","flowId","plan"]`。
- `plan` 对象 `required`：默认全必填（`path`/`sha256`/`version`）→ `["path","version"]`；`sha256` 与 `baseDigest` 保留 64 hex 形状（`^[a-fA-F0-9]{64}$`，大小写均形状合法）。
- description 改写：写明 `baseDigest`（effective trunk manifest digest）与 `plan.sha256`（计划实际字节 SHA-256）由应用派生、可省略、给出必须匹配（断言）；未知/不可读/漂移一律拒绝；`runId` 由应用按当前实际受派任务绑定、勿猜；保留原「应用重核属主、写集与依赖，不代替D3任命」语义。
- 不新增顶层 `oneOf`/`anyOf`；未改 `directShapeError` 逻辑（`src/provider/runtime/tools.ts` 本批零改动）。

### T4 `test/runtime-core/submit-capability-tools.test.ts`（+61 行，3 个新用例）

1. `:385` schema 形状断言：`required` = `["operationId","flowId","plan"]`、`plan.required` = `["path","version"]`、`baseDigest`/`sha256` pattern 为 `^[a-fA-F0-9]{64}$`、无顶层 `oneOf`/`anyOf`、两级 `additionalProperties:false`、`runId` 形状保留。
2. `:401` 省略形状正例：`{operationId, flowId, plan:{path, version}}` 结构合法；工具层**原样**提交（不注入/不改写参数；派生与宿主绑定由应用内完成）；成功回执 JSON 透传派生 `planRef.sha256`。
3. `:417` 拒绝矩阵（14 个负例，能力 0 调用）：缺 `plan.path`、缺 `plan.version`、缺 `plan`、缺 `operationId`、缺 `flowId`、顶层未知键、`plan` 内未知键（含合法 `sha256` 同时出现）、`baseDigest` 非 hex/63 位/64 位非 hex、`plan.sha256` 63 位/64 位非 hex、路径越界（`../escape.md`）、`version:0`。

## 4. 旧断言改写逐条记录（B1 §4.3-4；不得静默放宽）

1. **旧形状保留（未改写）**：`test/runtime-core/submit-capability-tools.test.ts:327`（旧=新行号，插入点在其后）`complete_team_plan` 旧形状 `{ operationId, flowId, baseDigest, plan:{path, sha256, version} }` 及其用例（`R2 five narrow tools…`，`:334-352`）**原文保留**——AC-9 旧形状仍合法。旧/新一致，理由：契约加法可选非 breaking。
2. **无 `required` 数组旧断言**：该文件其它处**不存在**对 `complete_team_plan` `required` 数组逐一成员的断言。`:362-365`（插入后不变）仅取 `required[0]` 删除作缺必填负例——前后 `required[0]` 均为 `operationId`，未受影响；`:293-317` 只断言三提交工具（`submit_version_change`/`submit_refactor`/`request_stable_write`）的 required，与本工具无关。→ 无需改写；新 schema 用例（`:385`）首次显式断言新 required。
3. 未删除/弱化任何既有 fail-closed 断言（角色门控、未知键、嵌套恶意证据、回执不伪造、abort 语义等原样）；无新增 `skip`/`force-exit`；未修改既有用例标题。

## 5. 命令与原始结果

- 环境：Node **v24.22.1**；worktree 根执行；同一候选（§2 聚合）。

### 5.1 定向测试（`test/runtime-core/submit-capability-tools.test.ts`）

命令：`node --test --test-concurrency=1 --test-reporter=tap test/runtime-core/submit-capability-tools.test.ts`

| 时点 | tests | pass | fail | cancelled | skipped | exit | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 实施前（HEAD `24799cb`） | 22 | 20 | 2 | 0 | 0 | 1 | `2e41a2d3f5d5fd47fbe53cf5d31ab55863b7acc797d8a797144bedb6ab445975` |
| 实施后（本候选） | 25 | 23 | 2 | 0 | 0 | 1 | `da72f5b1623d8b7d3abdf2fd9856e78189d09161d9e1762fa49ec0b10d55acbc` |

- 新增 3 用例（TAP #16/#17/#18）全部 `ok`。
- **失败集合对照**：前后同为 2 个同名用例——`R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget`、`R2 chief timeout is finite and normal sessions still receive injected narrow capabilities`（实施前 #19/#21；插入用例后编号 #22/#24）。两例在**实施前基线**即失败，报错 `runtime-protection-scope-unknown`（`src/service/runtime/session.ts:1283`），属 D1 记录的 `test/runtime-core/**` 已知红范畴（环境性 `process.cwd()` 保护范围），非本文件契约断言，也非本批引入；**未修复**（`session.ts` 不在本批写集）。
- 判定口径：**新增确定性失败 = 0、新 skip = 0、已知红同名不恶化**。

### 5.2 typecheck（`npm run typecheck`，tsc --noEmit）

| 时点 | exit | 日志 SHA-256 |
| --- | --- | --- |
| 实施前（HEAD `24799cb`） | 0 | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| 实施后（本候选） | 1 | `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127` |

实施后 9 条报错，全部位于**后续批次 owner 文件**（W3/W4/T1，非本批写集），且正是 P1.1 §2.1（G2）预告的机械触点——W3/W4 尚未把消费侧改为 `baseDigest ?? null` 与「缺省合法」形状：

- `src/pipeline/orchestration/trunk-runtime.ts(476,121)`、`(499,5)`、`(823,6)`：TS2322 `string | undefined` 不能赋给 `string | null`（Git 身份/fail/abort 回显触点）。
- `src/service/trunk/impl/apply-journal.ts(1244,83)`、`(2858,73)`、`(2861,112)`：TS2345 `baseDigest ?? null` 触点；`(2863,94)`：形状检查仍按必填消费。
- `test/编排/fixtures/git-action-authorization-wiring.ts(163,76)`：TS2322（编排测试夹具按必填构造拒绝回执）。

**本批三文件自身零类型错误**（报错均指向写集外文件）。按派发要求：如实记录，**不修写集外文件**；最终 typecheck 由 D1 在 W3–W6 完成后判定。

## 6. 写集外核对与稳定性

- `git status --porcelain` 的 tracked 变更仅 3 项（`M src/model/runtime.ts`、`M src/provider/runtime/schema.ts`、`M test/runtime-core/submit-capability-tools.test.ts`）；其余 `??` 均为此前会话遗留未跟踪件或本记录/证据目录（未跟踪治理文档不计入候选）。
- **写集外 tracked diff = 0**：judge 写集文件（`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/common/门禁引擎/classify-shell.ts` 等）未被本批修改，仅出现在 typecheck 报错行号引用中；`run-manifest.ts`、`parseTeamPlan`、`app/renderer/**`、`app/desktop/**`、角色卡/边界/YAML 均零改动；`optional-acceptance.test.ts` 未触碰。
- HEAD/tree 前后不变：`24799cb61239272e8603018adc094881bb6263dd` / `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`；未 commit/push/stash/merge。
- **H1 delta = 0**：未改角色职责/角色卡/边界/roster/卡文本；团队计划归属不变。

## 7. 限制与披露（如实）

1. **typecheck 暂红为预期**：W3（apply-journal 派生/断言）、W4（trunk-runtime 回显）、W5（convener preflight）、W6（桌面宿主绑定）与 T1/T2/T3/T5/T6 均未实施；本批只完成 L1（schema/工具形状）。D1 前若 typecheck 仍红，应按上述批次归因，不得记为本批缺陷，也不得为求绿改本批契约。
2. **本批证据仅覆盖 L1**（P-11/AC-9 的工具形状面）：派生/严格相等断言/fail-closed/来源选择 (i)(ii)(iii)/重放四变体（P-1–P-8、P-15）归编排 W3/T1；Git 路径（P-9）归 T2；preflight（P-10）归 W5/T3；宿主 run 绑定（P-12）归 W6/T5；多 draft 集成（P-13）归 T6。不得以本批证据替代上述任一层。
3. **既有已知红未修复**：`submit-capability-tools.test.ts` 中 2 个 `runtime-protection-scope-unknown` 失败在实施前即存在（`src/service/runtime/session.ts:1283`，写集外），本批保持原状、未掩盖。
4. **模型自报值语义**：工具层对 64 hex 形状大小写均放行（与既有 `digest` 形状一致）；「严格相等无 case fold」的运行时断言属 W3 service 层（P-2/P-3），本批仅以契约注释/描述声明，未在工具层新增比较逻辑（`directShapeError` 未改）。
5. 未运行真实模型/Electron；未占用 9222/9223；未触碰贪吃蛇 target；未触碰 trunk/bootstrap。
6. 本记录与证据目录为**未跟踪新增**，不计入候选；候选身份以上表 3 文件 + 聚合 `0be305fb…` 为准。

## 8. 未提交声明

- 未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；全部改动仅存在于工作树。
- 未修改 `docs/` 的方案/B1/团队计划/调度/验收文件；未改角色卡、边界、YAML、根 `changelog.md`；仅新增本记录与 `2026-11-09_W1_team-plan-run-binding-evidence/`。
- judge T3 已提交内容（HEAD `24799cb`）与其它在飞变更保持只读。

## 9. 证据文件索引（`2026-11-09_W1_team-plan-run-binding-evidence/`）

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `before-submit-capability-tools.tap` | 实施前基线 TAP（22/20/2/0/0，exit 1；2 已知红同名） | `2e41a2d3f5d5fd47fbe53cf5d31ab55863b7acc797d8a797144bedb6ab445975` |
| `after-submit-capability-tools.tap` | 本候选 TAP（25/23/2/0/0，exit 1；新增 #16–#18 全过） | `da72f5b1623d8b7d3abdf2fd9856e78189d09161d9e1762fa49ec0b10d55acbc` |
| `before-typecheck.log` | 实施前 `npm run typecheck`（exit 0） | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `after-typecheck.log` | 本候选 `npm run typecheck`（exit 1；9 条均在写集外后续批次文件，见 §5.2） | `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127` |
| `candidate.diff` | 本候选完整 diff（3 文件，7,877 bytes） | `2ebd0605448fc7dd306efe6fe1bc1dc56b00f2479d2a402df4c12d050e325fb1` |
