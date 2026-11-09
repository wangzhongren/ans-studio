# W3b 变更证据：删除全部预知式门控（编排·sidecar authorization 调用点接线 + I0-11/I0-12 扫描器修复）

- 批次：**W3b**（变更「删除全部预知式门控」派发批次；派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §三 I0（含 **I0-11/I0-12 增补**）/§四）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）；写集 `src/pipeline/orchestration/trunk-runtime.ts`、`src/provider/trunk/impl/git-command.ts`（I0-11/I0-12 增补授权，与 W3a 同 owner 单写者）、`test/编排/`、本角色 `docs/change/`
- 日期：2026-11-08；基线 worktree `.claude/worktrees/trunk-amendment`，HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`
- 依据：设计 P1.4 §3.3.1（调用点顺序 / R2）/§3.4.3（sidecar、write-ahead、R3）/§3.8（`git-action-audit-unavailable`）/§4.4/§4.5/§6.1；B1 v1 AC-1–AC-4/AC-16、P1.2-AC-26/AC-30/AC-31；I0-1/I0-2/I0-11/I0-12；W3a 证据（API）；W2 证据（gate 形状）
- 状态：**调用点接线 + I0-11/I0-12 扫描器修复已实现；init / 计划发布 / 文档发布 / initial workflow 成功路径与 AC-16 失败注入、同一 operationId 重试、扫描器容忍/fail-closed 边界均通过真实端到端确定性验证；activation/commit/integrate/revert/delivery 记录为覆盖边界（§7，如实非伪造）；未 commit / push / stash / merge / 发布。**

## 1. 偏差与 I0 对照

| I0 项 | 结论 | 证据 |
| --- | --- | --- |
| I0-1 sidecar 契约 | **偏差=0**：调用点只经 W3a 公共出口 `appendGitActionAuthorization(projectRoot, record)` 写入；记录 v1 白名单字段（无凭据/环境/`applicationMediation`）；append 在 `git-mutation` lease 持有期内、真实效果之前；失败统一映射 `git-action-audit-unavailable` 且不执行。 | §3、§4、§5 |
| I0-2 调用点 append | **偏差=0**：`trunk-runtime.ts` 5 个结构化 mutation 调用点各自组合 authorization 并 append；`apply-journal.ts`/`git-trunk-store.ts`/`git-capabilities.ts` 零改动。run-change/finalize/controller-stop 不写 sidecar。 | §3、§4；wiring guards 测试 |
| I0-4 gate 形状 | **偏差=0**：gate 不返回 authorization/policyInputDigests/leaseId；authorization 由调用点组合（`closure.actor` + `closure.optionalEvidence` + 各动作 verdict digest + leaseId）。 | §4；wiring guards 测试 |
| I0-5 finalize 顺序/宿主继续 | **偏差=0**：`finalizeRunChange` 保持 gate 先于 host lease；不写 sidecar。 | wiring guards；W2 gate 测试 |
| **I0-11 增补** | **已实施、偏差=0**：`listGitOperationJournals` 将「无 `git.json`/`init.json`/`stable-source.json`、目录内仅安全 `authorization.jsonl`」的 64-hex 目录识别为合法 write-ahead 状态（校验普通文件/非符号链接/nlink===1/≤64 KiB/realpath 一致后 `continue`）；未知额外文件、init/stable-source/git journal 既有分支与安全检查不变；journal 仍为唯一权威。 | §2.1、§5.1-9、`git-command.i011.diff` |
| **I0-12 增补** | **已实施、偏差=0**：`listGitOperationJournals` 的 stable-source 分支容忍「`stable-source.json` + 仅安全 `authorization.jsonl`（无 `git.json`）」；sidecar 安全校验同 I0-11；`stable-source.json` 既有内容/安全检查逐字不变；其它未知文件/损坏 source/不安全 sidecar 仍 fail-closed。 | §2.1、§5.1-10/11、`git-command.i012.diff` |
| I0-8 改名 | 本批不涉及；未改 gate 语义。 | — |

## 2. 文件清单与 sha256（前后）

### 2.1 `src/provider/trunk/impl/git-command.ts`（I0-11 + I0-12）

| 阶段 | sha256 | 行数 |
| --- | --- | --- |
| W3a 后状态（W3b 前） | `2b76eaaf5b809eae6bc6055e3f03651bb4b9eea37c955af91e4434ec77c31467` | 977 |
| I0-11 后状态 | `b5e51802932c5eb8eabb14074328ee7418508a7d55d400890c8b4b12705aac91` | 992 |
| **最终（I0-12 后）** | `47819a1955c64f29662068e2ad4d5aa0a2482d0cb80351753f1832930100d0f0` | 1006 |

- I0-11 diff：`…/git-command.i011.diff`（+15/−0；前状态重建 `…/git-command.pre-i011.reconstructed.ts`，sha256 核对 = `2b76eaaf…`）。
- I0-12 diff：`…/git-command.i012.diff`（stable-source 分支容忍；前状态重建 `…/git-command.pre-i012.reconstructed.ts` 用于内容对照——工作树行尾归一化使历史字节 hash 不可逐字节复现，历史 hash 以上表实测记录为准）。
- 未改 `public/trunk-store.ts`、`git-trunk-store.ts`、`git-capabilities.ts`、`apply-journal.ts`。

### 2.2 `src/pipeline/orchestration/trunk-runtime.ts`（调用点接线）

| 前 sha256（W2 后状态） | 后 sha256（工作树） | 行数 | W3b delta |
| --- | --- | --- | --- |
| `804746efcb159b1cb52a8a718d4094419c2cef313a0b10605004491cee12fef0` | `ce80e1626ba32a3a0e1e4ff10f5ca396d26c49940a837ff6459d1471d5b1d1a9` | 1520 | +76 / −2（import 行替换、expectedTool 提取为局部常量、组合函数 + 5 个调用块） |

- W3b-only diff：`…/trunk-runtime.w3b.diff`；前状态精确重建 `…/trunk-runtime.pre-w3b.reconstructed.ts`（sha256 核对 = `804746ef…`）。

### 2.3 测试（`test/编排/`，新增）

| 文件 | sha256 | 行数 | 用例 |
| --- | --- | --- | --- |
| `git-action-authorization-wiring.test.ts` | `499891bf52a0bb76e42a1abb46404b6a12377b3b2a66b538a1c20b4277197b85` | 125 | init 成功路径；调用点顺序/映射/无 sidecar 源码守卫 |
| `git-action-authorization-wiring-audit-failure.test.ts` | `a28d6176f21226a3665d3cc0ab0e28de47f2530e38216fab104765e69c9d3792` | 36 | init AC-16 失败注入 |
| `git-action-authorization-wiring-retry.test.ts` | `268e27cdc1cea15fd8efb2cd1d8ec0ae8361683aac643723e6a06358c76be596` | 57 | P1.2-AC-26 同 operationId 重试 |
| `git-action-authorization-wiring-publication.test.ts` | `4d6e78f9994db1c7d40dcb3761fca358d9454606931b18f66e653b209ec22af8` | 52 | 计划发布成功路径 |
| `git-action-authorization-wiring-publication-audit-failure.test.ts` | `95fdaf3d5bb77a7306ebfb5d53e4c7cfc2989c20e59eebb6ebc7de6bee20d933` | 46 | 计划发布 AC-16 失败注入 |
| `git-action-authorization-wiring-document.test.ts` | `16f5e9fc1a1baaa2625f9fc251b7020f7c367515edb0f2baf6ac02b5933285f8` | 50 | 文档发布成功路径 |
| `git-action-authorization-wiring-document-audit-failure.test.ts` | `d5ecfaba2465e521184b39259c77be838572ed17bec9e814d53254a83c6febb9` | 40 | 文档发布 AC-16 失败注入 |
| `git-action-authorization-wiring-initial-workflow.test.ts` | `3e335b5f1fe217ec79494a833ede7dbc935edf6a18ded5be0a13994cf9bb4d46` | 54 | initial workflow 发布成功路径 |
| `git-action-authorization-wiring-initial-workflow-audit-failure.test.ts` | `b3972b95e7d429edceb33794bba985325164e6bc04352f73d08fc8cc5756f0f0` | 44 | initial workflow AC-16 失败注入 |
| `git-operation-sidecar-tolerance.test.ts` | `8416f7a65a7ebb965fc7b906d507a7c0a0d4bb960e31739cedd943b2557f8476` | 162 | I0-11/I0-12 容忍与 fail-closed（6 用例） |
| `fixtures/git-action-authorization-wiring.ts` | `0f47a9ef2664a818b72a661d07bc689783768faf04e7f03137f7fcc14e7fd49c` | 372 | 真实 Core/inventory/init/发布/stable-write 夹具 |

- 未修改 W1/W2 文件、`app/`、`test/测试/`、`docs/`、其它角色目录。
- 证据目录只新增本文件与 `2026-11-08_W3b_evidence/`。

## 3. 调用点 / 模板 / digest 映射表（R2）

组合函数（`trunk-runtime.ts`，私有）：`appendGitActionAuthorizationBeforeEffects({ projectRoot, operationId, template, expectedTool, closure, leaseId, policyInputDigests })`：
`actorRoleId`/`coreSessionId`/`taskId?`/`runId?`/`turnId` 取第一次 gate 的 `closure.actor`（第二次 `current` 已复检一致）；`activeTool` 取该 Core 条目的真实活动工具名（找不到时回退该工具族规范名）；`rootsDigest`/`registryRevision`/`inventoryRevision` 取 `closure`；`policyInputDigests` 由调用点按动作映射；`optionalEvidence` 取 `closure.optionalEvidence`（`nativeReasons` → `nativeReasonsCount`）。

| # | 调用点 | 动作 | expectedTool | template 真实来源 | operationId 真实来源 | `policyInputDigests` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `createGitRoleRuntime.gitCandidate` commit/integrate/revert 分支 | 结构化候选提交 | `git_candidate` | `value.policyInput.template`（"commit"/"integrate"/"revert"） | `request.operationId` | `{ candidate: verdict.inputDigest }` |
| 2 | `createGitRoleRuntime.gitCandidate` init 分支 | 仓库初始化 | `git_candidate` | `"init"`（init 策略输入的真实模板） | `request.operationId` | `{ init: initPolicy.inputDigest, candidate: candidatePolicy.inputDigest }` |
| 3 | `createGitRoleRuntime.gitPublish` delivery 分支 | 交付发布 | `git_publish` | `value.policyInput.template`（"publish-delivery"） | `request.operationId` | `{ publication: verdict.inputDigest }` |
| 4 | `executeGitBusinessPublication`（文档/计划/激活共用） | 业务发布 | `complete_team_plan` / `activate_role_documents` / `submit_version_change` | `authority.value.publicationPolicyInput.template`（"publish-documents"） | `request.operationId`（direct=`applyInput.operationId`；plan=`CompleteTeamPlanInput.operationId`；active=`activation.input.operationId`） | `{ candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest }` |
| 5 | `executeGitInitialWorkflowPublication` | initial workflow 发布 | `versioned-doc-write` | `authority.value.publicationPolicyInput.template`（"publish-documents"） | `value.input.operationId`（准备阶段由真实 stable-write source 解析） | `{ candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest }` |

**不写 sidecar（源码守卫）**：`gitQuery`（只读、本不经 gate）；`prepareRunChange`（`select_run_change`，非 Git mutation）；`finalizeRunChange`（host-continuation，终止事实写 run transition journal）；`prepareControllerStop`/`finalizeControllerStop`（run-stop/controller-stop）。

## 4. append 时序与失败语义

每个调用点保持既有 `closure → policy → current → execute` 顺序与 lease 位置不变；append 位于：
1. 第一次 gate `closure`（actor/roots/optionalEvidence）；
2. `checkGitPolicy`（单/多 verdict）；
3. 第二次 gate `current` + revision/roots/lease 复检（`git-*-protection-stale` 等）；
4. **append**（仍在 `beginGitHostAction({kind:"git-mutation"})` 的 lease 持有期内，绝不在 `endGitHostAction` 之后）；
5. 真实效果（`executeWorkerCommit` / `executeInitialization` / `executeDelivery` / `commitPreparedDirect|TeamPlan|Activation|InitialWorkflow`）。

失败语义：`appendGitActionAuthorization` 的任何失败（记录校验/根/lease/锁/路径/预算/坏行/短写）被调用点统一映射为 `fail("git-action-audit-unavailable", detail)` 并在效果前 `return`：不产生 ref/对象/工作树，不写 journal prepared 记录，不执行 store 写入（AC-16）。既有 fail 回执风格保持（`GitCapabilityResult.status:"blocked"`、`DirectActionReceipt.status:"blocked"`、`TrunkStableSnapshotResult.applied:false`）。

## 5. 测试（`test/编排/`）

### 5.1 新增用例（16 个，全部 pass）

1. **init 成功路径**（真实 demo Core 会话 + 真实 host inventory + 真实 init 服务效果）：sidecar 位于冻结路径；字段 `source/version/operationId/template("init")/actorRoleId/coreSessionId/taskId/runId/turnId（=gate 验证回合）/activeTool("git_candidate")/projectRoot(canonical)/rootsDigest/policyInputDigests{init,candidate}（64-hex 且不同）/leaseId`；`optionalEvidence` 无 `applicationMediation`；真实 `init.json`（`stage:"candidate-created"`）与 `.git` 存在（写前审计 + 真实效果）。
2. **调用点顺序/映射/无 sidecar 源码守卫**：5 个调用点 append 均在 current/stale 复检之后、效果调用之前；R2 映射逐条；`if (!audit.ok) return fail(...)`；`gitQuery`/`prepareRunChange`/`finalizeRunChange`/`prepareControllerStop`/`finalizeControllerStop` 零 append；gate 不在自身内 append/组合 leaseId。
3. **init AC-16 失败注入**：真实 lease 下 `authorization.jsonl` 位置以目录占位（写入 store 阻断）⇒ `blocked / git-action-audit-unavailable`；无 `.git`/对象/ref、无 `init.json`、阻断位置未被覆盖。
4. **P1.2-AC-26 重试**：同一 operationId 的先前尝试（真实 lease A + 生产 append API 写入旧行）之后，新 lease/turn 的调用点尝试成功并追加第二行；两行 lease/turn 不同；不触发 `git-operation-replay-conflict`/`git-candidate-operation-conflict`/`git-init-operation-conflict`；旧行字节前缀不变（append-only）。
5. **计划发布成功路径**（真实 init→迁移 trunk v1→真实 convener complete_team_plan 回合）：`executeGitTeamPlanPublication` 成功提交；sidecar `template:"publish-documents"`、`policyInputDigests{candidate,publication}`、actor/task/activeTool 正确；trunk 推进到 v2。
6. **计划发布 AC-16**：既有 sidecar 行损坏（安全普通文件，I0-11 下扫描器不解析内容）⇒ `git-action-audit-unavailable`；manifest/history/journal 不变；损坏文件未被改写；`readGitActionAuthorizations` fail-closed。
7. **文档发布成功路径**（真实 init + intent 冻结 + 真实 product submit_version_change 回合）：`executeGitDocumentPublication` 成功；sidecar 两键/模板/actor 正确；真实首发布 trunk v1 生成。
8. **文档发布 AC-16**：同上失败注入；无 trunk ref/journal，sidecar 内容校验 fail-closed。
9. **I0-11 扫描器（4 用例）**：安全 sidecar-only 目录被 `listGitOperationJournals`/`readManifest` 容忍；sidecar+未知额外文件 fail-closed；不安全 sidecar（hardlink nlink≠1、>64 KiB、junction 非普通文件）fail-closed；正常 journal+sidecar 共存且 journal 记录不变。
10. **initial workflow 成功路径**（I0-12；真实计划发布 → 真实 stable-write 流 request/approve/bind/write_file/completeWrite → 真实 convener 回合 active write_file）：`executeGitInitialWorkflowPublication` 成功；sidecar `template:"publish-documents"`、`{candidate,publication}`、actor/task/activeTool("write_file") 正确；真实 workflow 工件发布且 trunkVersion 不变。
11. **initial workflow AC-16**：既有 sidecar 行损坏 ⇒ `git-action-audit-unavailable`；workflow 工件/journal/manifest 无效果；损坏文件未被改写；sidecar 内容校验 fail-closed。
12. **I0-12 扫描器（2 用例）**：stable-source+仅安全 authorization.jsonl 被容忍（journal 扫描/有效快照读取正常）；未知额外文件/un安全 sidecar fail-closed；**损坏 stable-source 即使带 sidecar 仍 fail-closed**（既有 stable-source 安全检查回归）。

### 5.2 实施前 / 实施后全量对照（`test/编排/**/*.test.ts`，`--test-concurrency=1`）

| 阶段 | tests | pass | fail | cancelled | skip | NODE_EXIT | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 实施前（W3b 编辑前） | 1106 | 1082 | 22 | 0 | 2 | 1（既有 22 失败） | `before-pianpai-concurrency1.log` / `before-failures.txt` / `before-skips.txt` |
| 最终候选（I0-12 后） | 1122 | 1098 | 22 | 0 | 2 | 1（同一既有 22 失败） | `after-pianpai-i012-final.log` / `after-failures.txt` / `after-skips.txt` |

- 新增 16 用例全部 pass（1122 = 1106 + 16；1098 = 1082 + 16）。
- 失败集合（文件+测试名排序）与 skip 集合逐条 `diff`：**完全一致**；**新增确定性失败 0、新 skip 0**。
- 未删除/放宽任何既有断言、未加 skip、未使用 `--test-force-exit`。

### 5.3 typecheck

- `npm run typecheck`：**EXIT 0**（`typecheck-i012-final.log`）。

## 6. 断言新增/改写清单

- 本批**只新增**测试文件（16 个新用例），未改写既有测试、未删除/放宽既有断言。
- 新增断言针对 `trunk-runtime.ts` 调用点接线与 `git-command.ts` I0-11/I0-12 容忍边界；不改 W2 gate 契约、W3a sidecar 内容契约。

## 7. 覆盖边界（如实）

- **activation / commit / integrate / revert / delivery**：运行时入口要求完整跨角色链（已发布计划的 chief 验收关闭 + `GitPlanCompletionBasis` + D3/三文档激活证据 + workflow 发布 + `freezeExecutionRun` 真实 active role 证据；delivery 另需 accepted quality close；integrate/revert 需已接受的 worker 子任务/交付基线）。在 W3b（调用点接线）范围内构造并维护该完整链属跨角色集成夹具（W5 `test/测试/` 与 B1 真实运行）；本批只以源码结构守卫覆盖其调用点位置/模板/digest 映射，不宣称相关 AC 已满足。init/计划/文档/initial workflow 四类真实发布已证明组合函数、write-ahead 与 fail-closed 语义。
- 不宣称 AC-1（commit）、AC-4（delivery）等已由 W3b 证据满足；其调用点接线由结构守卫与共享组合函数的真实发布证据间接覆盖，最终判定待 W5/真实运行。

## 8. 未提交与写集声明

- 未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；所有改动仅存在于工作树。
- W3b 实际改动（写集内）：`src/pipeline/orchestration/trunk-runtime.ts`、`src/provider/trunk/impl/git-command.ts`（I0-11/I0-12）、`test/编排/`（10 测试文件 + 1 夹具）、本证据与 `2026-11-08_W3b_evidence/`。
- 未触及：W1/W2 文件语义、`src/provider/trunk/public/trunk-store.ts`、`src/service/trunk/impl/apply-journal.ts`、`app/`、`test/测试/`、`docs/`、其它角色目录、角色卡/边界/YAML。
- 已知失败集合与实施前一致（22 条既有环境性红），非本批引入。

## 9. 证据文件索引（`2026-11-08_W3b_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `before-pianpai-concurrency1.log` | 实施前全量（1106/1082/22/0/2；NODE_EXIT:1 由既有 22 失败导致） |
| `before-failures.txt` / `before-skips.txt` | 实施前失败名单（22 条）/ skip 名单（2 条，排序） |
| `after-pianpai-i012-final.log` | 实施后最终候选全量（1122/1098/22/0/2） |
| `after-failures.txt` / `after-skips.txt` | 实施后失败/skip 名单（与 before 列表逐条一致：FAILURES_DIFF_EMPTY / SKIPS_DIFF_EMPTY） |
| `wiring-tests.log` | W3b/I0-11/I0-12 新增 16 用例（16/16 pass；NODE_EXIT:0） |
| `typecheck-i012-final.log` | `npm run typecheck`（EXIT 0） |
| `blocker-publication-sidecar-dir-vs-journal-scan.log` | I0-11 修复前阻塞复现（历史依据） |
| `blocker-initial-workflow-stable-source-sidecar.log` | I0-12 修复前同源冲突探针（历史依据） |
| `trunk-runtime.w3b.diff` / `trunk-runtime.pre-w3b.reconstructed.ts` | 调用点接线 W3b-only diff 与前状态重建（sha256 核对 = 804746ef…） |
| `git-command.i011.diff` / `git-command.pre-i011.reconstructed.ts` | I0-11 diff 与前状态重建（sha256 核对 = 2b76eaaf…） |
| `git-command.i012.diff` / `git-command.pre-i012.reconstructed.ts` | I0-12 diff 与前状态内容重建（历史字节 hash 见 §2.1） |
| `after-pianpai-concurrency1.log` / `after-pianpai-final.log` | 中间阶段全量日志（历史，保留） |
| `typecheck-final.log` / `typecheck-i011-final.log` | 中间阶段 typecheck（历史，保留） |
