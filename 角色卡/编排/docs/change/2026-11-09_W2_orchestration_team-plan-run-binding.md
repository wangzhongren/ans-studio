# 编排批次变更记录：团队计划登记 run 绑定 / baseDigest 合法来源（W3/W4/T1/T2/T6/T7）

- 批次：**W3/W4/T1/T2/T6/T7**（变更「团队计划登记 run 绑定 / baseDigest 合法来源（T2）」编排批次）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）；写集 `src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`test/编排/**`（T1/T2/T6/T7）与本角色 `docs/change/`
- 日期：2026-11-09；worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，基线 HEAD **`24799cb61239272e8603018adc094881bb6263dd`**（tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`）
- 依据：团队计划 `docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`；B1 v1.1 `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（§2.1 W3/W4/T1/T2/T6/T7、§3.1 AC-1–AC-5/AC-12、§3.4 AC-13、§4.1、§4.3、§7）；P1.1 `docs/planning/2026-11-09_design_team-plan-run-binding.md` §2.1–§2.3/§2.6–§2.9/§3.1/§4.1；R1.1 `docs/planning/2026-11-09_review_team-plan-run-binding.md` §7
- 状态：**W3/W4/T7 已实现并通过 typecheck；T1/T2/T6 新增/扩展用例已实现并通过（新增确定性失败=0、新 skip=0、已知红集合不变）**；未 commit / push / merge / 发布；未运行真实模型/Electron/RR6。

## 1. 实施内容（按写集）

### 1.1 W3 `src/service/trunk/impl/apply-journal.ts`（`completeTeamPlanInternal`）

- `:2863 → 2866` 形状检查可选化：`actor === "convener"`、`operationId`/`flowId` 非空不变；`input.baseDigest === undefined` 合法，给了仍须 `/^[a-f0-9]{64}$/i`（`plan-identity-invalid` 码/文案不变）。
- `requestDigest`（`:2868`）与先序重放（`:2877-2882`）保持「提交原样 input」、位置不变、先于任何 effective 读取/派生；`prior.message !== \`team-plan:${requestDigest}\`` 命中返回既有回执逐字保留（M1）。
- `readEffectiveSnapshot` 缺失 ⇒ `trunk-unavailable` 不变（`:2884`）；`derivedBase = current.digest`（`:2887`）；`current.flowId !== input.flowId || (input.baseDigest !== undefined && input.baseDigest !== derivedBase)` ⇒ `plan-base-conflict`（严格相等、无 case fold、文案不变，`:2889`）。
- 失败回执 `baseDigest` 分层（AC-1/Q10/S3）：effective 读取成功后回显 `derivedBase`，读取前回显 `input.baseDigest ?? null`（`effectiveBase` 闭包变量，`:2861-2863`）。
- `plan.sha256` 来源选择逐字保留现状（G1，`:2900-2909`）：(i) 声明 sha 命中冻结快照同 path+同 sha ⇒ 用冻结字节（不读 live）；(ii) 声明未命中冻结 ⇒ 读 live 并要求 `live.sha256 === 声明值`；(iii) 缺省 sha ⇒ live 可读用 live、live 不可读再用 frozen 同 path 兜底；两者都不可得 ⇒ `plan-hash-drift`（缺省文案 "Plan bytes are unreadable or absent from the effective snapshot"（N3）；声明值路径沿用旧文案 "Plan bytes differ from the submitted exact hash"）。`derivedSha = planBytes.sha256`；声明值 !== derivedSha ⇒ `plan-hash-drift`（严格相等）。
- `resolvedPlan = { path, sha256: derivedSha, version }` **只用于** marker、`target.execution.teamPlan`、NoOp 判定、`decorate`/`planRef` 回执与 commit 断言（`:2913-2916`、`:2922-2923`）；journal `message`/`source`/`targetDigest` 语义不变；`PreparedTeamPlanCommit.input` 保持 `structuredClone(input)`（`:2942` 不变）。
- `plan-` 相关其余机械触点 `baseDigest ?? null`：`:2858`（`plan-preparation-only` 包装）、`:2863`（`reject` 闭包）、`:1244`（`commitPreparedTeamPlan` invalid，G2）。
- `source.runId` 记录：`RoleDirectSource` 增 `...(input.runId !== undefined ? { runId: input.runId } : {})`（`:2932-2934`）；marker 不写 runId；`source.baseDigest` 仍为 `current.digest`。
- `parseTeamPlan`/路径正则/版本/roster/modules 校验逐字不变；失败无 journal/marker/trunk 副作用；不伪造/不回退猜测。

### 1.2 W4 `src/pipeline/orchestration/trunk-runtime.ts`

- `convenerTeamPlanFacts`（`:629-638`）：缺省 `baseDigest`/`plan.sha256` 不投影（不造键）；`runId` 未给不造键不变。
- 回显 `baseDigest ?? null`：`:476`（Git 身份拒绝）、`:499`（Git `fail`）、`:824`（abort）、`:836`（preflight 拒绝）。
- `:624-628` 注释同步：删除「工具 schema 已保证 baseDigest 形状」表述，改为「`baseDigest`/`plan.sha256` 是应用派生机器事实；缺省不投影；schema 保证 operationId/flowId/plan 基本形状」。
- 未改 `classify-shell.ts`/marker/`run-manifest.ts`。

### 1.3 T7 `test/编排/fixtures/git-action-authorization-wiring.ts`

- `holdableCompleteTeamPlan()` 回执 `baseDigest: input.baseDigest ?? null`（`:76`，机械适配，不改断言/行为）。

### 1.4 T1 `test/编排/direct-role-capabilities.test.ts`（+4 用例，既有用例原样保留）

- `:1617` P-1/P-6/P-8①③：缺省 payload 派生（`source.baseDigest`/`planRef.sha256`/trunk +1/marker plan）；`team-plan:<digest>` 字节锚点（`canonicalJson({input, actor})`）；marker 规范 JSON 且不写 runId；删除计划文件后同 payload 重放返回既有回执；payload 形态变化 ⇒ `plan-operation-conflict`；NoOp；旧式完整 payload 与新式派生路径回执/target/marker 字节等价。
- `:1669` P-2/P-3/P-15：声明 baseDigest 不等/大写 hex 值正确 ⇒ `plan-base-conflict`；声明 sha 不等/大写 hex 值正确 ⇒ `plan-hash-drift`；RR5 路径、roster 路径、路径/版本不一致 ⇒ `plan-path-invalid`；失败回执回显派生 baseDigest；全部无 journal/trunk/target 副作用。
- `:1705` P-4：来源选择 (i) 冻结命中优先；(ii) 冻结未命中读 live 并要求命中；(iii-a) 缺省 sha live 优先；(iii-b) live 不可读 frozen 兜底；(iii-c) 两者都不可得 ⇒ `plan-hash-drift`（新文案），无副作用。
- `:1767` P-5/P-7：无 `.ans/trunk/manifest.json` ⇒ `trunk-unavailable`（不 bootstrap、不生成摘要/marker，读取前失败回执 baseDigest=null）；`runId` 属于 flow ⇒ 成功且 `source.runId`/journal source.runId 记录、marker 不写 runId；不属于/不存在 ⇒ `plan-run-conflict` 且无 journal、trunk 不变。
- 既有 `:390` 大用例（含 `:411-431` 与 `:427-428` 删除计划文件后重放）**逐字保留**（P-8④ 以此为准）。

### 1.5 T2 `test/编排/git-capabilities.test.ts`（+1 用例）

- `:843` P-9：Git prepare（省略 baseDigest/sha256）→ `PreparedTeamPlanCommit.input` 保持原样（不补派生键）；manifest/journal/marker 承载派生值；`team-plan:<digest>` 锚点基于原样 input；commit applied 且 `source.runId` 记录、`planRef.sha256`=派生值；**P-8②** prepare→commit 后原样 payload 重放返回同一回执；prepare 后计划字节漂移 ⇒ commit 非 applied（ok=false）且已提交 trunk 逐字不变（journal/manifest 绑定 fail-closed）。
- 既有「Git team plan publication and active-only activation…」（`:515`）为**基线已知红**：未改写、未跳过（见 §8）。

### 1.6 T6 `test/编排/convener-module-consumption.test.ts`（扩展 + 新增）

- `:266` 既有 facts 用例**追加**断言：`convenerTeamPlanFacts` 缺省 `baseDigest`/`plan.sha256` 不投影（不造键）、preflight `allow`；既有键集合断言（含 baseDigest、runId 未给不造键）原样保留（B1 §4.3-3）。
- `:375` P-13：两个 draft run（多活动 run）下 `validateVersionDecisionContext` 为 `run-ambiguous`、`buildProjectStateView` 保留 run-ambiguous blocker；chief→convener 受派任务（run = draft-a）经 `inspectAssignedTask` 取得任务 run 后登记成功、`source.runId`=任务 run、`planRef.sha256`=派生值；登记后 run 集合/状态（draft、未 pin/未关闭）与 `project_state`/`version-decision` 只读对照逐字不变。

## 2. 本批文件清单、raw SHA-256 与 numstat

| 文件 | 行数 | raw SHA-256 | numstat (+/−) |
| --- | --- | --- | --- |
| `src/service/trunk/impl/apply-journal.ts` | 3948 | `b213a7dd2a6ecbb010be822c7f399a0c463a9c617580c0106e20ec6ae49d7898` | +29 / −13 |
| `src/pipeline/orchestration/trunk-runtime.ts` | 1524 | `5b718ffdd970ab24dcba6eae2fef7f813c6155dc89e8be977d8b3efecb5bc1af` | +9 / −8 |
| `test/编排/fixtures/git-action-authorization-wiring.ts` | 372 | `30d5a0a640bedca2f34cedf79134be771ceb6b820d10b0f55052504bdade6a17` | +1 / −1 |
| `test/编排/direct-role-capabilities.test.ts` | 1800 | `9e2cd3c08ac40feb9fad89ba2bacd237a01ee06314c2e2efad07876e8984e6a3` | +229 / −1 |
| `test/编排/git-capabilities.test.ts` | 918 | `a2de9417977507b9bd1620eac27bd810c3ae9f796bc1a8adcd9b6d84c8d4bba7` | +82 / −0 |
| `test/编排/convener-module-consumption.test.ts` | 425 | `4c7dfc6a317181935a4729f948fcc625b8db86e5788daa62bfbc211a8dc815c9` | +64 / −1 |

- 合计 `6 files changed, 414 insertions(+), 24 deletions(-)`；`−1` 均为 import 行替换，**既有断言/用例体零删除**。
- diff / numstat / hash / 最终 status 原件：证据目录 `write-set.diff`（605 行 / `535b23c1e2b8ae63183ba296c16ba22cb704a47b9b00d0ef05ac330701624492`）、`write-set.numstat.txt`（`d95b61fb7e199f849915b516c87969412fa9a1fb5a3e535100f8a1c9ca1841c0`）、`write-set.sha256.txt`（`b7860a0dca1b905d911fe45d412fb3a1006e7c73abbf8ecc6c6a24c50562df8a`）、`git-status-final.txt`（`57954bd3fbf201925169ef9181810946f4e9603d89fe569a2fda0231270cf5a5`）。

## 3. 旧断言改写记录（B1 §4.3）

**本批改写既有断言 = 0 条**：未删除/弱化任何 fail-closed 断言（`plan-base-conflict`/`plan-hash-drift`/`plan-path-invalid`/`plan-run-conflict`/`trunk-unavailable` 等负例全部保留并加强）；未新增 skip/force-exit；未改写 `git-capabilities.test.ts:515` 已知红。

| # | 文件:位置 | 旧文 | 新文 | 理由 | 对应 |
| --- | --- | --- | --- | --- | --- |
| 0 | — | — | — | 无既有断言被改写（仅新增用例；两处 `−1` 为 import 行替换） | — |

保真锚点：T1 `:390` 用例（含 `:411-431`、`:427-428`）逐字保留；T6 `:266` 既有 facts 键集合断言与未知键/路径映射断言原样保留（仅追加缺省不投影断言，B1 §4.3-3）；T2 `:515` 已知红原样保留。

新增断言（逐条对应 P/AC）：见 §1.4–§1.6；新增文案断言仅 N3 新文案 "Plan bytes are unreadable or absent from the effective snapshot"（旧文案无既有断言，B1 §4.3-6）。

## 4. 测试矩阵映射

| P | 用例位置 | 覆盖 |
| --- | --- | --- |
| P-1 | T1 `:1617` | 缺省 payload 派生、`source.baseDigest`、`planRef.sha256`、trunk+1、marker plan |
| P-2 | T1 `:1669` | 声明 baseDigest 不等 + 大写 hex 负例、`plan-base-conflict`、无副作用、回执分层 |
| P-3 | T1 `:1669` | 声明 sha 不等 + 大写 hex 负例、`plan-hash-drift`、无副作用 |
| P-4 | T1 `:1705` | 不可读 fail-closed；来源选择 (i)/(ii)/(iii) |
| P-5 | T1 `:1767` | 无 effective trunk ⇒ `trunk-unavailable`，不 bootstrap/不写盘 |
| P-6 | T1 `:1617` | 旧式完整 payload 与派生路径回执/target/marker 字节等价；`team-plan:<digest>` 锚点 |
| P-7 | T1 `:1767` | runId 属于 flow ⇒ `source.runId`；不属于/不存在 ⇒ `plan-run-conflict` |
| P-8① | T1 `:1617` | 缺省 payload 同 operationId 同原样 payload 重放（删文件后仍命中） |
| P-8② | T2 `:843` | Git prepare→commit 后原样 payload 重放同一回执 |
| P-8③ | T1 `:1617` | 同 operationId payload 形态变化 ⇒ `plan-operation-conflict` |
| P-8④ | T1 `:390`（既有） | 旧式显式 payload 删除计划文件后重放逐字不变（未改） |
| P-9 | T2 `:843` | Git prepare（省略值）→ commit；prepared input 原样；漂移拒绝；marker 不变 |
| P-13 | T6 `:375`（+`:266` 扩展） | 多 draft run/`run-ambiguous` 下经受派任务登记成功并绑定任务 run；facts 缺省不造键 |
| P-15 | T1 `:1669` | RR5 非规范路径/roster 路径/路径版本不一致仍 `plan-path-invalid` |

## 5. 验证结果（Node v24.22.1，worktree 根，`node --test --test-concurrency=1 --test-reporter=tap`）

### 5.1 before/after 计数（同一工作树、同一 in-flight 基线）

| 套件 | before tests/pass/fail/cancelled/skip | after tests/pass/fail/cancelled/skip | 失败标题集合 diff | skip 集合 diff |
| --- | --- | --- | --- | --- |
| `test/编排/direct-role-capabilities.test.ts` | 43/42/1/0/0 | **47/46/1/0/0** | 无（同为 `Retained intent confirmation…`） | 无（均 0） |
| `test/编排/git-capabilities.test.ts` | 15/12/1/0/2 | **16/13/1/0/2** | 无（同为 `Git team plan publication…`） | 无（同为 2 条 Delivered… # SKIP） |
| `test/编排/convener-module-consumption.test.ts` | 8/8/0/0/0 | **9/9/0/0/0** | 无（均空） | 无（均 0） |

- **新增确定性失败 = 0；新 skip = 0；已知红集合不恶化**（exit 1 仅因既有红）。
- 日志原件与 SHA-256：
  - `before-direct-role-capabilities.tap` `e87acb41de0de976ff51de1324ff810e7f19738e869832d3fbfeac68356cc2fc`；`after-direct-role-capabilities.tap` `bbaa5c59191f57166bae61ab1d6c32eda920d29a829b5193da083d9344ae18b6`
  - `before-git-capabilities.tap` `fcd2cc0ca697a36e1bdbb101bb932ed0a708929a7527aab1e71f9250b32841a4`；`after-git-capabilities.tap` `cb393fc3025f5ff4e500a878f7ba284aa1d8b0567877ea803664e3ec74735892`
  - `before-convener-module-consumption.tap` `aa8c3a34ec7b771e13be14c9bf786697dba54f71d9d8c839c76d1fb47f134261`；`after-convener-module-consumption.tap` `4b785d25d5cb2bb03220c045a192250da322cfe1b9550c2f753f02d288871033`

### 5.2 T7 fixture 引用套件（after，逐文件）

`git-action-authorization-wiring{,-audit-failure,-document,-document-audit-failure,-initial-workflow,-initial-workflow-audit-failure,-publication,-publication-audit-failure,-retry}.test.ts` 共 9 文件 **10 tests / 10 pass / 0 fail**（各自 TAP 原件在证据目录，逐文件 SHA-256：见目录）。`test/测试/git-action-activation-e2e.test.ts` 仅在注释中提及本 fixture（非引用套件），未运行（不属本批受影响套件；长 e2e）。

相邻 `test/编排/` 套件（触及 `baseDigest`/completeTeamPlan 邻近面，补充回归）：`chief-module-consumption` 8/8、`git-trunk-store` 13/13、`nominator-module-consumption` 5/5、`rapporteur-module-consumption` 8/8、`run-role-submit-capabilities` 14/14、`task-state` 20/20、`verifier-module-consumption` 6/6，全部 exit 0、0 fail、0 skip（`adjacent-*.tap` 原件与 hash 在证据目录）。

### 5.3 typecheck

- before：`npm run typecheck` exit 1，**9 条错误**（`trunk-runtime.ts:476/499/823`、`apply-journal.ts:1244/2858/2861/2863`、`test/编排/fixtures/git-action-authorization-wiring.ts(163,76)`——均为 W1 可选化后的机械触点，与 B1 v1.1 附录 A 一致）。
- after：`npm run typecheck` **exit 0**。
- 日志：`before-typecheck.log` **`9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127`**（33 行 / 5,165 bytes，与 W1 证据 `after-typecheck.log` 同 hash——同一基线态）；`after-typecheck.log` `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`。

## 6. 候选身份与写集外 diff

- 基线：HEAD `24799cb61239272e8603018adc094881bb6263dd`（tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`），分支 `feat/plan-escalation-card`。
- 实施开始时 `git status --porcelain -- src app test` 的 in-flight 集（**不属本批**，未修改/未回退）：`src/common/roles/convener/index.ts`（W5）、`src/model/runtime.ts`（W1）、`src/provider/runtime/schema.ts`（W2）、`test/roles/convener/convener-differential.test.ts`/`convener-module.test.ts`/`oracle-fixture.ts`（T3）、`test/runtime-core/submit-capability-tools.test.ts`（T4）。
- 最终 tracked 修改 = 上述 7 文件 + 本批 6 文件（共 13）；`角色卡/convener-code/api-spec.md`（W5）与 `docs/acceptance/…criteria-v1.md`（B1 v1.1）为实施前既存修改，非本批。
- 写集外 diff = 0（实测）：`git status --porcelain -- src/common/门禁引擎/classify-shell.ts src/common/编排/run-manifest.ts app/` 为空；未触碰 `parseTeamPlan`/路径校验/`classify-shell.ts`/`run-manifest.ts`/`app/desktop/**`/`optional-acceptance.test.ts`。无新依赖/新目录/构建发布配置改动。

## 7. 设计落点与取舍（审计披露）

- M1：`requestDigest`/先序重放保持「提交原样 input」；`resolvedPlan`/`derivedBase` 只进 marker/target/回执/commit 断言；`PreparedTeamPlanCommit.input = structuredClone(input)`；journal message/source/targetDigest 语义不变；Git prepare→commit 两侧摘要形态一致（T2 以真实 Git store 绑定验证）。
- G1：来源选择逐字保留现状，无新增 frozen/live 冲突拒绝；(i)/(ii)/(iii) 由 T1 P-4 分别取证。
- S1：严格相等（无 case fold）；大写 hex 值正确亦拒（base ⇒ `plan-base-conflict`；sha ⇒ `plan-hash-drift`）。
- S3/Q10：service 层 effective 读取成功后失败回执回显 `derivedBase`；读取前回显 `input.baseDigest ?? null`（T1 P-2/P-5 断言）。
- N3：`plan-hash-drift` 新文案仅用于「缺省 sha 且字节不可得」；声明值为不可得时仍用旧文案（行为/码不变）。
- Q4：marker 不写 runId；`classify-shell.ts` diff=0。

## 8. 已知红与隔离（N2）

- `test/编排/git-capabilities.test.ts:515`「Git team plan publication and active-only activation…」：**基线红因定位**（同基线复现）：`:540` `service.prepareDirectAuthority!` 返回 `{ok:false, code:"trunk-item-invalid", message:"The actual publication task has no original Chief input source"}`（既有夹具任务无 `workSourceRef`；既有红，非本变更引入）。本批未改写、未跳过该用例；新增 P-9 用例以**真实 chief initialization source + 受派任务**构造（`init-source-<64hex>`、`work-source` 绑定 chief parent），与该红因隔离，不以其为 pass 证据。
- `test/编排/direct-role-capabilities.test.ts`「Retained intent confirmation…」：基线红（in-flight judge 批次的 `frozen-conflict` 文案带路径后缀 vs 旧断言），本批未触碰该用例；before/after 同为该失败。

## 9. 限制与披露

1. 本批只做确定性实施与逐文件验证；**未运行真实模型/Electron/RR6**，未占用 9222/9223。
2. 未运行 `test/编排/**` 目录级全量回归与其它套件（按任务要求逐文件）；before/after 对照均为同一工作树、同一 Node v24.22.1、同一 in-flight 基线。
3. 基线工作树含 W1/W2/T4/W5/T3 未提交实现（不属本批）；本批未修改/未回退它们；T6 新式用例消费 W5 preflight 与 W1 可选类型属预期耦合。
4. P-8② 在 T2（Git store）覆盖；P-8④ 由既有 T1 `:390` 用例原样覆盖。
5. 行号为最终工作树实测；后续合并/rebase 后以符号名与文本锚点（`completeTeamPlanInternal`/`convenerTeamPlanFacts`/`holdableCompleteTeamPlan`）为准。
6. 未提交、未推送、未合并、未发布；未改角色卡/边界/卡文本（本文件为角色实施记录，属允许写集）。

## 10. 证据目录

`角色卡/编排/docs/change/2026-11-09_W2_orchestration_team-plan-run-binding_evidence/`：

- `before-typecheck.log`、`after-typecheck.log`
- `before-*.tap` / `after-*.tap`（三个套件）
- `fixture-git-action-authorization-wiring*.tap`（9 文件）
- `write-set.diff`、`write-set.numstat.txt`、`write-set.sha256.txt`、`git-status-final.txt`
