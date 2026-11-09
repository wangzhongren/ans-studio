# 变更记录：团队计划登记 run 绑定 / baseDigest 合法来源——convener-code 批次 W5/T3（2026-11-09）

- **角色**：运营代码维护（convener-code，独立固定上下文）
- **任务**：`docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`（§三/§四/§五）中 convener-code 批次 **W5/T3**（本记录文件名沿用派发指定的 `W3` 批次号）。
- **判据**：B1 **v1.2** `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（297 行 / 74,210 bytes / SHA-256 `0f528a0b9f80cb9c451985c2a3d37c25a51b7f1959910600ec54a93246303d1b`；v1 + v1.1 + v1.2 窄修订）§2.1 W5/T3/**T8/T9**、§3.3 AC-8/AC-10/AC-11（本批相关）、§4.1 P-10、§4.3（旧断言改写；含 T8/T9 与 api-spec 否决记录）、附录 B、§7。本记录初版按 B1 v1（`eb94d7cb…`）实施；B1 v1.2 裁决 T8/T9 纳入写集、`角色卡/convener-code/api-spec.md` 否决并回退（见 §一-4）。
- **方案**：P1.1 `docs/planning/2026-11-09_design_team-plan-run-binding.md`（`2bb663fe…`）§2.6/§3.1/§3.2。
- **基线**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `24799cb61239272e8603018adc094881bb6263dd`。工作树在飞 `src/model/runtime.ts`（W1）、`src/provider/runtime/schema.ts`（W2）、`test/runtime-core/submit-capability-tools.test.ts`（T4）为**其它 owner 已授权批次**，本批未触碰。
- **状态**：**已实施、已自测；未提交/未推送/未合并/未发布**。不判验收。

---

## 一、变更内容

### 1. W5（写集内，`src/common/roles/convener/index.ts`）— `checkTeamPlan` 可选字段放宽

按 B1 AC-10 / P-10 与方案 §2.6：

- `baseDigest`：**可缺省**；给出时必须 `isHex64`（`/^[a-f0-9]{64}$/i`，与既有 hex 口径一致），否则 `team-plan-facts-invalid`（不变）。
- `plan` 键集：允许恰为 `{path, version}` 或 `{path, sha256, version}`；`sha256` **可缺省**，给出时必须 hex64，否则 `team-plan-facts-invalid`（不变）。
- **逐字保留**：`TEAM_PLAN_FACT_KEYS`（含 `baseDigest`/`plan` 键，未变）；未知键仍 `facts-unknown`；路径仍精确等于 `docs/scheduling/<flowId>-team-v<version>.md`（原 `:432-438` 逻辑未改）；版本仍 `isPositiveSafeInteger`（≥1）；`actorRoleId`/`operationId`/`flowId`/`runId` 规则不变。
- **未改**：`CONVENER_CARD_TEXT`、身份/职责/工具集、deny 映射既有 code/messageKey、卡文本/边界/roster。模块仍为纯策略、无 I/O。

diff：+7/-3（新增 4 行契约注释 + 3 处条件改写）。

### 2. T3（写集内，`test/roles/convener/convener-module.test.ts`）— preflight 正负例

- `:394-399` 旧断言改写：见 §二-1。
- 新增正例：缺省 `baseDigest` ⇒ `allow`；`plan:{path,version}`（无 sha256）⇒ `allow`；`baseDigest` 与 `plan.sha256` 均缺省（新 payload 形态）⇒ `allow`。
- `:403`（改写后实际行 `:420`）63 位 `baseDigest` 拒绝断言**不变**。
- 新增负例：无 sha256 的 plan 带未知键、缺 `version`、缺 `path` 仍拒绝；RR5 形态非规范路径 `docs/scheduling/snake-game-team-plan-v1.md`（flowId `snake-game`、version 1）仍 `team-plan-path-invalid`。
- 错误 sha256 形状、旧有未知键、路径/版本错误断言全部保留。

diff：+28/-2。

### 3. T8/T9（B1 v1.2 写集，`test/roles/convener/`）：差分金样同步

> 必要性：差分测试 `convener-differential.test.ts` 直接断言 `team-plan` 组 `allowed=3 / compared=10 / team-plan-fact-schema=2`，且金样把「缺 sha256 ⇒ deny」冻结为已登记差异；W5 放宽后若不更新，`test/roles/convener/**` 将出现**新的确定性失败**（violates B1 §4.2 / AC-13 增量口径）。金样文件头明确「重新捕获须同步更新 `payloadSha256` 并在角色证据登记」——本记录即该登记。

- `test/roles/convener/oracle-fixture.ts`（+9/-7）：：
  - 用例「team-plan plan 缺 sha256（已知差异）」→「team-plan plan 缺 sha256（新契约允许）」：`expectedAllow false→true`、`expectedCode "team-plan-facts-invalid"→null`、`knownDelta "team-plan-fact-schema"→null`（`oldAllow` 保持 `true`，与新契约一致）。
  - `KNOWN_DELTAS` 的 `team-plan-fact-schema` 文案：由「缺 sha256 或 sha256 非 64hex（2 例）」改为「plan sha256 非 64hex（1 例）」，并注明 2026-11-09 起缺省 sha256 已按新契约允许。
  - `ORACLE_GOLDEN_META.counts.preflightKnownDeltas` `3→2`。
  - `ORACLE_GOLDEN_META.payloadSha256` 重新计算：`b82c364e…` → `67ef107d65c0d753d9041563d187183d58bc1b40a707ca17aca1f6779ac6f31e`（复算脚本：证据目录 `recompute-payload.mjs`；方法 = `sha256(JSON.stringify(ORACLE_GOLDEN_PAYLOAD))`）。
  - `ORACLE_GOLDEN_META.module`（sha256 `e125478a…` / 688 行）**保留捕获期身份未改**：测试只断言格式、不与该文件当前字节比较；本批新模块身份见 §四。
- `test/roles/convener/convener-differential.test.ts`（+5/-4）：
  - 顶部差异清单注释 `team-plan-fact-schema（2）→（1）` 并注明原因。
  - `差分/team-plan` 断言：`allowed 3→4`、`compared 10→11`、`knownCounts.get("team-plan-fact-schema") 2→1`。

### 4. 文档（api-spec）：B1 v1.2 否决、已回退（不计入候选）

初版曾按角色卡「每条交付提供 `api-spec.md` 更新」同步 `角色卡/convener-code/api-spec.md`（§5.1 事实表/§7 差分说明）。**B1 v1.2（`0f528a0b…`）附录 B / §4.3-11 明确否决纳入写集**（依据 P1.1 §3.2「不改任何 `角色卡/**`」、B1 §0.2-1 H1 delta=0）并指令回退。已执行 `git checkout -- "角色卡/convener-code/api-spec.md"`（仅该文件；未 commit/stash），回退核验：

- `git hash-object` = `b3b651b7c7b13deaf25024fa86d59085ee483a5a` = `git rev-parse HEAD:角色卡/convener-code/api-spec.md`（内容逐字节回到基线 blob）；
- `git show HEAD:角色卡/convener-code/api-spec.md | sha256sum` = `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4`（基线 blob 口径）；
- `git diff -- 角色卡/convener-code/api-spec.md` = 空（diff = 0）；工作树 `sha256sum` 为 `9d8aed098fe38781f95c624b541216ade2a545613effe58123b8efdbd63d5f7d`（checkout 按本仓库配置物化为 CRLF，blob 内容同上，非内容差异）。

文档偏差按 Q5 同口径处置：以工具描述（`src/provider/runtime/schema.ts` 的 `complete_team_plan` 描述，W2）为执行口径；如需同步 api-spec，须协调方/方案修订批准后另版纳入。

---

## 二、旧/新断言逐条记录（B1 §4.3；不得静默放宽）

1. **`test/roles/convener/convener-module.test.ts:394-397`（旧行号）**
   - 旧断言原文：`for (const key of ["actorRoleId", "operationId", "flowId", "baseDigest", "plan"]) { ... delete invalid[key]; assert.equal(denyCode(...), "team-plan-facts-invalid", key); }` —— 删除 `baseDigest` ⇒ `team-plan-facts-invalid`。
   - 新断言：循环键集改为 `["actorRoleId", "operationId", "flowId", "plan"]`；另增「删除 `baseDigest` ⇒ `{allow:true}`」正例（现 `:400-404`）。
   - 理由：新契约下 `baseDigest` 由应用从 effective trunk manifest digest 派生，角色侧事实包可缺省；旧断言把「应用拥有的机器事实」当作角色必填，正是本变更要修正的契约错位。
   - 对应：P-10 / AC-10 / B1 §4.3-1。
2. **同文件（原 `:392` 正例）**：`validTeamPlanFacts()`（含 baseDigest + plan.sha256）仍 `allow`——**保留不变**（旧式完整 payload 兼容）。
3. **同文件（原 `:403`，现 `:420`）**：`{ baseDigest: "a".repeat(63) }` ⇒ `team-plan-facts-invalid`——**不变**（给了必须 hex64）。
4. **同文件（原 `:405-407`）**：version 0 / sha256 非 hex / plan 带未知键 ⇒ `team-plan-facts-invalid`——**不变**；新增 `{path,version,extra}`、缺 version、缺 path 三条同码负例。
5. **同文件（原 `:412-418`）**：flowId 不符、路径/版本不一致 ⇒ `team-plan-path-invalid`——**不变**；新增 RR5 形态路径负例（同码）。
6. **`test/roles/convener/oracle-fixture.ts:889-907`（旧行号，用例 `team-plan plan 缺 sha256（已知差异）`）**
   - 旧期望：`oldAllow true / expectedAllow false / expectedCode "team-plan-facts-invalid" / knownDelta "team-plan-fact-schema"`（把契约放宽前的拒绝冻结为「模块更严格差异」）。
   - 新期望：`oldAllow true / expectedAllow true / expectedCode null / knownDelta null`（与旧角色侧谓词重新一致；不再属差异）。
   - 理由：同 §二-1；金样必须反映新契约，否则差分测试产生新确定性失败。
7. **`test/roles/convener/oracle-fixture.ts:1441`（旧行号，`KNOWN_DELTAS` 文案）与 `meta.counts.preflightKnownDeltas`（3→2）、`payloadSha256`**：随 §二-6 机械更新，均在案（新旧值见 §一-3）。
8. **`test/roles/convener/convener-differential.test.ts:213-215`（旧行号）**：`allowed 3→4`、`compared 10→11`、`team-plan-fact-schema 2→1`——随 §二-6 机械更新；断言仍要求差分 = 0、已知差异逐类登记，未弱化。
9. **未修改**：`test/roles/convener/convener-module.test.ts` 中 dispatch/stable-write/requirement-change/git-action/context 断言；`convener-differential.test.ts` 的规格/卡文本/cards/tools/dispatch/stable-write/requirement-change/git-action/已知差异清单/provenance/模块纪律断言；未新增 skip/force-exit；未删除任何 fail-closed 负例。

---

## 三、验证（before/after）

- 环境：Node **v24.22.1**（Windows 11，Git Bash）；worktree 根执行；命令 / 计数 / 日志 SHA-256 原件见证据目录 `2026-11-09_W3_evidence/`。

| 运行 | 命令 | tests | pass | fail | cancelled | skipped | todo | exit | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | `node --test --test-concurrency=1 test/roles/convener/convener-module.test.ts` | 19 | 19 | 0 | 0 | 0 | 0 | 0 | `891c5c7fcd4976b095bb5e91e937470a6981b54971ac8b313a18a39bc38abf48` |
| after | 同上 | 19 | 19 | 0 | 0 | 0 | 0 | 0 | `06d734d9d0755b6711f8fe47e868c24ae89c9de223f7cb27edaf74fbd514dcc6` |
| before | `node --test --test-concurrency=1 test/roles/convener/convener-differential.test.ts` | 13 | 13 | 0 | 0 | 0 | 0 | 0 | `8eba2a4a38e583a134c429ad4c41a6a58f4083186982aa646fc1cb5e92694538` |
| after | 同上 | 13 | 13 | 0 | 0 | 0 | 0 | 0 | `c57f7563dea1eb9e9abd995da759409a3ea8b13674903241846b5157f2b518f7` |
| after（目录级） | `node --test --test-concurrency=1 test/roles/convener/*.test.ts` | 32 | 32 | 0 | 0 | 0 | 0 | 0 | `0c83dc2087d171eeb5500a019a7a91ac7ba7926a72dd9c99d8b069690bf579c0` |
| after（api-spec 回退后复核） | `node --test --test-concurrency=1 test/roles/convener/convener-module.test.ts test/roles/convener/convener-differential.test.ts` | 32 | 32 | 0 | 0 | 0 | 0 | 0 | `f5f09c52c56ca690dba0141b6b498b5ba560401249fde1f5ba2652d8eb4962fb` |

- **失败标题集合 diff**：before = ∅，after = ∅（新增确定性失败 = 0）。
- **skip 标题集合 diff**：before = ∅，after = ∅（新 skip = 0）。
- **已知红不恶化**：`test/roles/convener/` 基线全绿，改后仍全绿（32/32）。
- **`npm run typecheck`（`tsc --noEmit`）**：本批完成时 exit **1**，但为**基线既有红**（不计入本批）：8 条错误全部位于其它 owner 在飞/待改文件——`src/pipeline/orchestration/trunk-runtime.ts(476,499,823)`、`src/service/trunk/impl/apply-journal.ts(1244,2858,2861,2863)`、`test/编排/fixtures/git-action-authorization-wiring.ts(163)`，均为 W1 可选化后的 G2 机械触点（`baseDigest ?? null` / 形状检查可选化），归 W3/W4/T7 批次（B1 §2.1、P1.1 §2.1）；**本批 4 个代码/测试文件 0 条类型错误**（错误清单见 `typecheck.log`，哈希 `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127`）。本批不得也不应修写集外文件。**api-spec 回退后的复核时点**（其它 owner 的 W3/W4/T7 触点已落地）：同一工作树 `npm run typecheck` **exit 0、0 条错误**（`typecheck-r2.log`，SHA-256 `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`）。
- 说明：`node --test test/roles/convener/`（目录形式）在本环境被 Node 当作模块路径导致 1 个「MODULE_NOT_FOUND」伪失败（非测试用例失败），故目录级证据采用显式 glob `*.test.ts`；该伪运行未留作证据。

---

## 四、候选身份与写集

**本批候选 = 4 文件**（B1 v1.2 §2.1：W5、T3、T8、T9）：`src/common/roles/convener/index.ts`、`test/roles/convener/convener-module.test.ts`、`test/roles/convener/oracle-fixture.ts`、`test/roles/convener/convener-differential.test.ts`。`角色卡/convener-code/api-spec.md` **不属候选**（已回退，diff = 0，见 §一-4）。

### 4.1 逐文件 raw SHA-256 与 numstat（对 HEAD `24799cb6`）

| 文件 | 类别 | HEAD SHA-256 | 改后 SHA-256 | numstat | 行数/字节（改后） |
| --- | --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | W5 | `e125478a7809ae60a380c40236bfbc5bb6eaebd43819b40520a9a48bca6e7985` | `5b1e927d653295757687e29fa72f28168eea8f8abb4618f0cf31d7b9991b4224` | +7/-3 | 692 / 35,850 |
| `test/roles/convener/convener-module.test.ts` | T3 | `e67f1aca23369b9e1ffee591615c0fd1aedac06d007f842d375d4b2a0256937a` | `ead7981240f3c955a8e633d5635b36e75e2eaf97340a4cf4c02b821cb58a9640` | +28/-2 | 647 / 26,553 |
| `test/roles/convener/oracle-fixture.ts` | T8（v1.2 写集） | `998f372f39ba47488f6232c7e8598b4c497b9716fe7ff57b0501a7c83230bc28` | `b7c7f2e8e543c9054e8864be22ede705d4c2d8e4b33e08594a94bcfeeb589528` | +9/-7 | 1,636 / 63,775 |
| `test/roles/convener/convener-differential.test.ts` | T9（v1.2 写集） | `53a9b94a7fd3a63ab6c576c05ef04a67030c336b7f5f6686b73953f0e08e5549` | `f46f7bd308620a8a934b04263c231ca6c53788326b7c2f649a13defbc4f24172` | +5/-4 | 436 / 22,588 |

- **可复算聚合**（4 个 `src`/`test` 文件，按路径排序，`path + "\0" + sha256` 直接串联后 SHA-256）：`2f56e4cc9383e2aa46d2877dae74f4a04cb7b69f7b356ba8a515cc316ce6ea38`。
- **完整 diff**：证据目录 `changes.diff`（SHA-256 `4f58e50d610dc0487caeb8ddc07bf3e1d2ed2195f80700446416f8eb62fb6c2c`）。
- LF 一致（5 文件 CR 计数均为 0）；无二进制/重命名。

### 4.2 写集外 tracked diff = 0（本批口径）

本批只写上述 4 文件。`git status --porcelain -- src app test` 的其余 M 项均为**其它 owner 在飞批次**，本批只读、未写：

- 运行时核心 W1/W2/T4：`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/submit-capability-tools.test.ts`；
- 编排 W3/W4/T1/T2/T6/T7：`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-capabilities.test.ts`、`test/编排/convener-module-consumption.test.ts`、`test/编排/fixtures/git-action-authorization-wiring.ts`。

`角色卡/convener-code/api-spec.md` **diff = 0**（已回退，§一-4）。`app/desktop/**`、`src/common/门禁引擎/classify-shell.ts`、`src/common/编排/run-manifest.ts`、其它角色模块/卡/边界均 **diff = 0**；未新增依赖/目录/构建发布配置。

---

## 五、限制与披露（如实）

1. **写集与 api-spec 回退**：本批初按 B1 v1 实施；实现中发现不改差分金样会在 `test/roles/convener/**` 产生新确定性失败，故同步更新 `oracle-fixture.ts` 与 `convener-differential.test.ts`（金样重取登记机制，见 §一-3）——B1 v1.2 已将二者正式纳入写集为 **T8/T9**。初版另按角色卡更新了 `api-spec.md`；**B1 v1.2 否决其纳入并已回退到基线 blob**（§一-4；文档偏差按 Q5 以工具描述为执行口径）。全部旧/新断言已逐条记录（§二）。
2. **typecheck**：本批完成时（W3/W4/T7 触点尚未落地）全局 `tsc --noEmit` exit 1，8 条错误全部位于其它 owner 文件、本批文件 0 条（见 §三）；api-spec 回退后的复核时点，其它 owner 的 W3/W4/T7 触点已落地，同一工作树 `npm run typecheck` **exit 0、0 条错误**（`typecheck-r2.log`）。本批未修任何写集外类型错误。
3. **未运行**真实模型、Electron、9222/9223；未占用端口；未改 `app/desktop/**`。
4. **未改**角色卡/边界/YAML/`CONVENER_CARD_TEXT`/roster/派发矩阵/卡种/权限；团队计划归属仍为运营（H1 delta = 0）。
5. **未改** W1/W2/T4 在飞文件；未回退他人改动。
6. **未提交/未推送/未合并/未发布**；本记录与证据目录为工作树产物（未跟踪/未提交）。
7. 本批不判验收；B2 由独立验收按 B1 `eb94d7cb…` 对同一最终候选判定。

## 六、证据目录

`角色卡/convener-code/docs/change/2026-11-09_W3_evidence/`：

| 文件 | SHA-256 |
| --- | --- |
| `before-module.tap` | `891c5c7fcd4976b095bb5e91e937470a6981b54971ac8b313a18a39bc38abf48` |
| `after-module.tap` | `06d734d9d0755b6711f8fe47e868c24ae89c9de223f7cb27edaf74fbd514dcc6` |
| `before-differential.tap` | `8eba2a4a38e583a134c429ad4c41a6a58f4083186982aa646fc1cb5e92694538` |
| `after-differential.tap` | `c57f7563dea1eb9e9abd995da759409a3ea8b13674903241846b5157f2b518f7` |
| `after-directory-glob.tap` | `0c83dc2087d171eeb5500a019a7a91ac7ba7926a72dd9c99d8b069690bf579c0` |
| `typecheck.log` | `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127` |
| `after-r2.tap`（api-spec 回退后复核） | `f5f09c52c56ca690dba0141b6b498b5ba560401249fde1f5ba2652d8eb4962fb` |
| `typecheck-r2.log`（复核时点 exit 0） | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `changes.diff` | `4f58e50d610dc0487caeb8ddc07bf3e1d2ed2195f80700446416f8eb62fb6c2c` |
| `recompute-payload.mjs` | `88be1a5b6c51e93d87fb943c8190d9aac390e11ef4d76caf11fd8ddd32a03bbf` |
