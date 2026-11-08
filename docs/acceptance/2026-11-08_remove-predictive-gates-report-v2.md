# 删除全部预知式门控 + Git 写/初始化改为「动作时授权」：独立验收 B2 报告 v2（W7 补证后复判）

- 日期：2026-11-08；身份：ANS 独立验收唯一主上下文（同一身份；只按 B1 v1 判定，不判方案质量、不改方案/代码/测试/角色卡）。
- 模式：轻量但诚实（独立复算 44 文件候选与 38 子集；抽查 W7 五条链 sidecar/journal/ref/receipt/write-ahead 与负例；定向复跑；未运行真实模型/Electron/CDP）。
- 结论：**pass**（39 pass / 0 fail / 0 insufficient evidence / 1 not applicable；共 40 项）。v1 的 6 项 insufficient（AC-1/AC-2/AC-4/AC-8/P1.2-AC-25/P1.2-AC-31）已由 W7 完整效果链补证关闭；无 fail、无安全旁路/代码返工。
- 唯一判据：`docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / 34,071 bytes / `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c`，未变）。
- 历史：v1 报告 `docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md`（183 行 / `6af7f394…`，insufficient 33/0/6/1）保留；v2 只取代其 6 项 insufficient 判定。
- 未授权：提交/推送/合并/发布/tag；本报告只写 `docs/acceptance/`。

## 1. 输入与候选身份

### 1.1 输入（补证后实测）

| 输入 | 实测 |
| --- | --- |
| 变更包 v1.1 | `docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md`；191 行 / 32,468 bytes / `58a394cc198a0ac7c4b883c85e383e64944721ea77902954e6ed3d835b28b889` |
| 派发/状态/I0 记录 | `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`；102 行 / 25,872 bytes / `9befc89ef3c73084e3132628450ac1ec213edcf826167f3b4a3c7e9613e7992e` |
| W7 记录 | `角色卡/测试/docs/change/2026-11-08_W7_b2-gap-e2e.md`；234 行 / 31,734 bytes / `3fe62b905c7f7a746c5ed9235f74c07252d2e7dac0f8cc84d0c3fa121a7e67d3` |
| W7 证据索引 | `角色卡/测试/docs/change/2026-11-08_W7_b2-gap-e2e-evidence/99-evidence-hashes.txt`；290 文件 / `eb149ef8d2e14e3f…`（逐文件 290/290 复核一致） |
| D1（含 D1-R1） | `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`；244 行 / 29,735 bytes / `4e52a01fef04a91894cf62119c6c2b71979bdc398cf4d2d6f828aff23e2a4971` |
| B1 v1 | `3306b9d4…`（未变） |
| B2 v1 | `docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md`；183 行 / `6af7f394…`（历史保留） |
| 设计/团队计划/参照 | P1.4 `2febba80…`；团队计划 `911ff546…`；参照组合 4,982/4,753/196/1/32（`5cba2d54…`+`54c0db31…`） |

### 1.2 候选 44 文件与 38 子集（独立复算）

- HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`；tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` = **44 项 = 17 修改 + 27 新增 + 0 删除**；候选集合与变更包 44 行**精确相等**。
- 44 文件逐文件 SHA-256 **44/44 一致**；聚合按 `<raw_sha256>  <path>` + LF、`LC_ALL=C` 整行排序后 SHA-256 = **`787bd9109c6ce13f27eed4dbd396b0dc9a6fce26834b96c7f6c3e37391ff2475`**（独立复算一致）。
- 原 38 文件逐文件 hash 与 D1 `04b-…` 逐字一致（38/38 不变）；其子集聚合仍 **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（产品/既有测试零改动）。
- 稳定性 manifest：**1,105 文件 / `4b5ed42fff69013b66c09bff3820ca820512220ec8f5ca18756965d1ebe7a128`**（独立复算；行排序口径）；与 D1 1,099/`bf190ee5…` 对照仅新增 6 行（5 个 W7 测试 + 1 个夹具），0 修改/删除；W7 前后 diff 0。
- T1 三文件 `afe70c62…`/`f0db260e…`/`358ac967…` 在 HEAD 基线、不属 delta；HEAD/tree/分支/暂存未变。
- 独立复跑：W7 五条 E2E 逐文件 **5/5 pass**（commit-claude、commit-pi、delivery、activation、run-stop；各 1/1）；`test/测试` 112 文件 **687/629/39/1/18**（W5/D1 基线 682/624/39/1/18 +5/+5，0 新失败/0 新 skip）；`test/编排` 107 文件 **1,122/1,098/22/0/2**（不变）；`npm run typecheck` exit 0；复跑前后候选/manifest 不变。

## 2. W7 五条链原件抽查

### 2.1 AC-1 / AC-2：Claude/Pi commit 完整链

- 文件：`test/测试/git-action-commit-claude-e2e.test.ts`（157 行 / `d370b951…`）、`git-action-commit-pi-e2e.test.ts`（158 行 / `79fe9ab0…`）+ 共享夹具 `git-write-chain-fixture.ts`（635 行 / `b1b43b1e…`）；均独立 1/1 pass。
- 测试使用真实 `createGitRoleRuntime.gitCandidate`/`createGitCapabilityService`/真实 candidate store/ref store/对象/工作树 + 真实 role/task/run/pin 链；`providerFactories` 只替代模型回合，不伪造 ref/journal/sidecar。
- AC-1 原件（`ac1-sidecar-authorization.jsonl` / `ac1-git-journal.json` / `ac1-refs.txt` / `ac1-result.json`）：
  - sidecar 1 行：`template:"commit"`、`actorRoleId:"impl"`、`coreSessionId`、`taskId:"w7-claude-worker-task"`、`runId`、`turnId`（真实回合）、`activeTool:"git_candidate"`、`projectRoot`、`rootsDigest`、`registryRevision`、`inventoryRevision`、`leaseId`、`policyInputDigests:{candidate:<64hex>}`、`optionalEvidence` 无 `applicationMediation`。
  - `git.json` phase `published`、candidate ref `refs/ans/candidates/<sha256(op)>`、`newOid=result.candidate`、parents=`[pin.codeBasis.oid]`、`candidateSource.kind="assigned-run-task"`；对象 blob 字节=工作树内容；trunk ref 不变；旧/退役码零命中。
  - sidecar digest 由独立 `prepareWorkerCommit` + `checkGitPolicy().inputDigest` 重算相等；sidecar mtime ≤ `git.json` mtime（write-ahead）。
- AC-2（`ac2-…`）与 AC-1 同构：Pi actor、`template:"commit"`、`policyInputDigests:{candidate}`、真实 journal/ref/对象/工作树；`lifecycle.native === undefined` 仍通过。
- **角色术语裁定（AC-1）**：B1 AC-1 文字为「Claude + product 会话」；W7 使用真实 roster 中唯一的项目 product/implementation 角色 `impl`（真实角色三文档、模块 `impl-core`、写集 `src/impl/`、真实任务/ACL 绑定），commit ACL/授权门与 roleId 名称无关，sidecar `actorRoleId="impl"` 如实记录。**本 B2 接受该术语解释**：AC-1 的安全属性（真实 actor/task/turn/active tool/ACL/lease/sidecar/ref/journal）已证；若标准所有者坚持字面内置 `product`，属术语解释差异，不改变已证事实，也不构成安全 fail。

### 2.2 AC-4：Claude convener delivery 完整链

- 文件：`test/测试/git-action-delivery-claude-e2e.test.ts`（216 行 / `5ae311d2…`）；独立 1/1 pass。
- 链：真实 worker commit → worker 报告/convener accepted → 真实 convener 回合（active `git_candidate`）→ 真实 integration（child report/close + active 授权交集）→ 同一真实会话第二工具回合（active `git_publish`）→ 真实 verifier 质检任务/mechanical 文本核对/原 creator accepted → `prepareVerifiedDelivery` → `gitPublish delivery`。
- 原件：`ac4-receipt.json` status `published`、`published.ref="refs/ans/delivery/demo"`、`published.oid=<integration candidate>`；`ac4-sidecar-authorization.jsonl` `template:"publish-delivery"`、`actorRoleId:"convener"`、`activeTool:"git_publish"`、`policyInputDigests:{publication:<64hex>}`；`ac4-delivery-journal.json` phase `published`、ref/oldOid null/newOid/candidateSource/qualityTaskId；`ac4-refs.txt` delivery ref=candidate；sidecar digest 独立 `prepareDelivery` + `checkGitPolicy().inputDigest` 重算相等；sidecar mtime ≤ journal mtime；无 native/旧码零命中。

### 2.3 AC-8 / P1.2-AC-25：deferred run-stop 宿主继续 finalize

- 文件：`test/测试/git-run-stop-host-continuation-e2e.test.ts`（192 行 / `908fb651…`）；独立 1/1 pass。
- 测试真实调用 `prepareRunChange`（返回 `deferred:true`、requesterTurnId、handles、requestDigest）→ 真实回合结束 + 生产 `stopAndInspect` 运行时中立 drain（stopRequested/providerFinished/无 active tool/进程；Claude requester + Pi member）→ 真实 host stop fence/队列事实 → `finalizeRunChange` host-continuation（匹配 requesterTurnId/taskId/role/project）→ `commitPreparedRunChange`。
- 原件：`ac8-run-transition-manifest.json` `state:"cancelled"`、`directRunChanges[0].receipt.status:"applied"`、`receipt.operationId:"w7-run-change"`、`requestDigest` 匹配、`lifecycle.instances` 2 条 drained（rapporteur claude / product pi）、`lifecycle.hostStops[0].state:"fenced"`/`targetSeq=11`/hostHandleIds；`ac8-finalize-receipt.json` ok/applied；`ac8-sidecar-absence.txt` = absent（ENOENT），run-stop 零 sidecar；`refs/ans/trunk` 不变。
- 负例 `ac8-negatives.json`：taskId 不符/记录不唯一 ⇒ `git-actor-core-binding-unproven`；错 requestDigest ⇒ `run-preparation-invalid`；无副作用。
- **等价链裁定**：W7 驱动核心 `prepareRunChange→finalizeRunChange`，desktop `resumeDeferredRunChanges`/`executeOwnedRunStop` 为私有宿主函数；关键 finalize 提交/run transition journal 为真实原件，W4 桌面 `executeOwnedRunStop` drain 边界另有独立证据；本 B2 接受该等价服务链（B1 允许「rapporteur 已 disposed 或无 active select_run_change」；W7 用生产 stopAndInspect drain 快路径，非伪造 facts）。

### 2.4 P1.2-AC-31：activation 发布

- 文件：`test/测试/git-action-activation-e2e.test.ts`（76 行 / `be863b4c…`）；独立 1/1 pass。
- 链：真实首发布 v1 → 真实计划 v2（plan-completion marker + chief accepted）→ D3 appointment + 三文档 + 真实 nominator 回合（active `activate_role_documents`）→ `executeGitActiveRolePublication`。
- 原件：`ac31-receipt.json` status `applied`、source role-direct/activate-role-documents/actorRoleId nominator、activationDigest 64-hex；`ac31-sidecar-authorization.jsonl` `template:"publish-documents"`、`policyInputDigests:{candidate,publication}` 两键 64-hex 互异、activeTool；`ac31-activation-journal.json` phase published/ref `refs/ans/trunk`/businessJournal actionSource；`ac31-active-manifest.json` activeRevision=1、activeRoles.impl；sidecar mtime ≤ journal mtime；无 native/旧码零命中。
- 文档/计划/initial workflow 三类由 W3b 既有 E2E 覆盖；四类齐备。

### 2.5 W7 运行计数/稳定性/事故

- 5 个 W7 文件逐文件独立进程 5/5 pass（51.1/51.1/85.0/44.7/44.8s）；`test/测试` 112 文件 687/629/39/1/18（W5/D1 基线 +5/+5/0/0/0；107 个既有文件逐文件 0 差异、失败/skip 名单 0 差异）；`test/编排` 107 文件 1122/1098/22/0/2（0 差异）；typecheck 0。
- 事故披露：W7 运行期一次后台残留进程并发写结果；已终止全部残留、清理污染结果、改单实例哨兵+逐文件独立进程重跑；受影响文件隔离复跑 1/1，最终计数以干净重跑为准；本 B2 独立复跑 5/5，接受最终干净证据（事故本身不构成候选/产品证据）。

## 3. 其余 33 pass 证据复用（B1 §5.3）

- **候选关联**：原 38 文件逐文件 hash 38/38 不变；38 子集聚合仍 `9462391e…`；产品/既有测试零改动。当前 44 文件 = 原 38 + 6 个 W7 测试/夹具文件；manifest 1,105 与 D1 1,099 对照仅新增 6 行、0 修改/删除；HEAD/tree/分支/暂存/T1 不变。
- **输入/依赖/契约/命令/环境未变**：产品源码、既有测试、依赖锁、夹具、构建配置、测试命令与环境均无变化；W7 只新增 `test/测试/` 文件与共享夹具。
- **影响可界定**：W7 5 个 E2E 文件/夹具为独立测试进程；旧 540 文件 E3 T3 证据对原 38 产品/既有测试继续有效；W7 `test/测试` 套件 687/629/39/1/18 = 旧 682/624/39/1/18 + 5/5（0 新失败/0 新 skip）；`test/编排` 不变；typecheck 0。T3 组合推断 = **5,037 / 4,812 / 192 / 1 / 32 / 0**（旧 5,032/4,807/192/1/32 + W7 5/5；545 文件 = 540 + 5，删除 0）。
- **披露**：未重跑 545 文件全量 T3；按 B1 §5.3 以「旧 540 文件 E3 证据 + W7 5/5 + 两套件 delta」组合复用；影响已界定、无新失败/新 skip；若标准要求 545 全量重跑，这是唯一未执行的证据形式，不影响当前判定。
- 结论：**其余 33 pass 证据复用合规**；v1 的 B0/参照/Q16/AC-22–24/环境差异判定继续有效。

## 4. B1 逐项判定

> 判定只用 pass / fail / insufficient evidence / not applicable；N/A 均给依据。当前候选 `787bd910…`。

### 4.1 BASE-1–BASE-4

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| BASE-1 | pass（披露） | B0 豁免沿用：豁免记录 `d7a699d2…` + 派发记录 §二协调方确认「沿用覆盖本变更」；参照组合 4,982/4,753/196/1/32；环境差异逐条（D1/E3）。若沟通要求独立书面豁免，需补；当前按记录接受。 |
| BASE-2 | not applicable | 豁免覆盖，不按正式 B0 重登记。 |
| BASE-3 | pass | 第一变更 E3 完成/PR #73 MERGED；I0-1–I0-12 冻结；沟通放行；HEAD `3f249e2`；5+第 6 文件串行；T1 已提交基线。 |
| BASE-4 | pass | 44 文件逐文件/聚合/树/manifest/T1 独立复算；38 子集不变；D1/E3/RR/W7 前后 diff 0。 |

### 4.2 AC-1–AC-24

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| AC-1 | **pass（术语解释）** | W7 `git-action-commit-claude-e2e`：真实 Claude 桩件 Core 回合 → 真实 `gitCandidate(commit)`；sidecar `{candidate}`（独立 `checkGitPolicy().inputDigest` 相等）、actor/task/turn/activeTool/lease/revisions；真实 `git.json`/candidate ref/对象/parent/工作树；write-ahead；无 native；旧码零命中。B1 的「product 会话」按真实项目 product/implementation 角色 `impl` 解释（commit ACL/门与角色名无关；sidecar actorRoleId=impl 如实记录）；若字面内置 product，属术语差异，不影响安全属性。 |
| AC-2 | **pass** | W7 `git-action-commit-pi-e2e`：Pi 同构完整链（sidecar `{candidate}`、journal/ref/对象/工作树、无 native）；AC-2 只要求角色 ACL，`impl` 满足。 |
| AC-3 | pass | W5 cross-runtime init Claude/Pi convener：真实 init 成功/`init.json`/`.git`/sidecar `{init,candidate}`；旧码零命中。 |
| AC-4 | **pass** | W7 `git-action-delivery-claude-e2e`：真实 worker commit→integration→verifier accepted→prepareVerifiedDelivery→gitPublish delivery；回执 published、sidecar `{publication}`、journal/ref、write-ahead、无 native。 |
| AC-5 | pass | W1 `codex-native-optional` 4/4：responses/MCP/WebSearch/custom transport 不可用仍准入、plan 省略 native、ensureAdapter 回落；native observed 强证明；present-but-changed 拒绝。 |
| AC-6 | pass | W5 Claude actor init 多 active Pi/Claude + foreign MCP 下成功；optionalEvidence 记录、不因其它会话拒绝。 |
| AC-7 | pass | W5 Claude/Pi/Codex init：optional 证据缺失/unknown 不改变判定；sidecar optionalEvidence；无 native 拒绝。 |
| AC-8 | **pass（等价链）** | W7 `git-run-stop-host-continuation-e2e`：真实 `prepareRunChange(deferred)`→生产 `stopAndInspect` drain→host fence/队列→`finalizeRunChange` host-continuation→真实 run transition journal（state cancelled/receipt applied/2 instance drain/hostStops fenced）；run-stop 零 sidecar；taskId/记录/requestDigest 负例拒绝。desktop 私有宿主函数为等价调用层，W4 桌面 drain 边界独立；B1 允许 disposed/无 active select_run_change，W7 用生产 drain 快路径（非伪造）。 |
| AC-9 | pass | D1/E3 只读 Git/`git_query`/只读 shell/非只读 shell 与在飞变更一致；无回退；PR #72 复跑通过。 |
| AC-10 | pass | W2 gate active-tool 正向/expectedTool 缺失/actor 不符；既有 Git ACL/身份套件回归；无副作用。 |
| AC-11 | pass | W7/W5 host-continuation taskId 不符/记录不唯一/requesterTurnId 漂移 ⇒ `git-actor-core-binding-unproven`；W2 H6/source；无提交。 |
| AC-12 | pass | 既有 `git-shell-acl`/`git-capabilities` 角色 ACL/策略负例回归；W5 q9 convener actor。 |
| AC-13 | pass | 既有 Git policy/stale/写区外负例；W3b 调用点 policy 顺序/映射源码守卫。 |
| AC-14 | pass | W2 H7 根身份 + W3a 根/sidecar 安全；根不符/越界 fail-closed；无写。 |
| AC-15 | pass | W3a lease 校验（无 live/结束/伪造 leaseId/heldLockToken）；并发/跨项目既有套件回归。 |
| AC-16 | pass | W3b init/计划/文档/initial workflow 失败注入 + W5 跨运行时：`git-action-audit-unavailable`，无 .git/init.json/ref/journal 副作用。 |
| AC-17 | pass | D1/E3 在飞变更 shell 负例：未审批非只读 shell/裸 Git 写/后台借授权保持拒绝。 |
| AC-18 | pass | W5 PR #72 回归 56/56；写门零 `applicationMediation`；`inspectToolSurface`/compose 语义未改。 |
| AC-19 | pass | W2 gate F8：foreign MCP/unknown 只进 optionalEvidence；伪造 optional 不改变 actor 判定；身份/ACL/策略缺失仍拒绝。 |
| AC-20 | pass | W4 桌面 run-stop：native absent 允许/present-but-changed 拒绝/drain 不成立阻断；W2 source 同构；无提交。 |
| AC-21 | pass | W2 gate H13/H14：preparing/creating/disposing、prepared/failed 豁免边界、active lifecycle/toolSurface 三元；不跳过/fail-open。 |
| AC-22 | pass（披露） | RR 真实 UI/Claude：父门 accepted、task.created、product ready、delivery.claim/首条消息、product 回合；`task.delivered` 账本行因 0.6s 停止缺失，投递事实由 SDK/首条消息证明；两次尝试复现。 |
| AC-23 | pass（下一门） | RR `git_candidate commit` 在 Claude MCP schema 层 `-32602 invalid_union`（`__ans_call_context`×顶层 `oneOf`/`additionalProperties:false`）；零效果（operations=[]、refs 仅 master、无 journal/sidecar）；基线既有缺陷、零候选 delta；B1 允许「成功或如实报告下一真实阻塞」；零效果故无 journal/sidecar，不伪造。 |
| AC-24 | pass | RR attempt2：1 消息/chief 1/product 1/dispatch 1/应用层 Git 1/0 卡/39.8s/无自动重试；attempt1 fixture、停止时机、导入自动化偏差如实披露；不宣称闭环。 |

### 4.3 P1.2-AC-25–31

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| P1.2-AC-25 | **pass（等价链）** | W7 `git-run-stop-host-continuation-e2e`：真实 `prepareRunChange(deferred)`→drain→`finalizeRunChange` host-continuation→真实 run transition journal 提交；Claude requester + Pi member；taskId/记录/requestDigest 负例；run-stop 零 sidecar；等价服务链裁定同 AC-8。 |
| P1.2-AC-26 | pass | W3b retry：同 operationId 新 lease/turn 追加 sidecar 行、旧行前缀不变；不触发 replay/candidate/init conflict；pending-recovery 既有回归。 |
| P1.2-AC-27 | pass | W1 codex-native-optional + W5 codex-init：native 不可用创建成功、plan.native 省略、ensureAdapter 回落、init 成功；present-but-changed 拒绝。 |
| P1.2-AC-28 | pass（披露） | W5 Claude actor 多 active + foreign MCP：只进 optionalEvidence；动作按 actor；不宣称阻断其写 `.git`；变更包 §八.1 披露。 |
| P1.2-AC-29 | pass | W7/W5/W2 taskId 不符/记录不唯一/requesterTurnId 漂移 ⇒ `git-actor-core-binding-unproven`；无提交/副作用。 |
| P1.2-AC-30 | pass | W3a sidecar 6 用例：符号链接/nlink/越界/4KiB/16/64KiB/坏 JSON/截断/未知字段/lease/锁；失败 ⇒ `git-action-audit-unavailable`；W3b 注入。 |
| P1.2-AC-31 | **pass** | W7 activation E2E：真实 plan v2→D3→三文档→nominator `activate_role_documents`→`executeGitActiveRolePublication`；sidecar `{candidate,publication}` 两键、activation journal、activeRevision=1、activeRoles.impl、回执 applied、write-ahead；文档/计划/initial workflow 由 W3b 覆盖。 |

### 4.4 B1-EV1–EV5

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| EV1 | pass | 44 文件/聚合 `787bd910…`/38 子集 `9462391e…`/manifest 1,105/`4b5ed42f…`/T1；候选集合精确；D1/E3/RR/W7 前后 diff 0。 |
| EV2 | pass（组合复用） | 旧 E3 5,032/4,807/192/1/32 + W7 5/5 = 5,037/4,812/192/1/32；W7 `test/测试` 687/629/39/1/18（+5/+5，0 新失败/0 新 skip）、`test/编排` 1122/1098/22/0/2；typecheck 0；未重跑 545 全量 T3（B1 §5.3 组合复用，披露）。 |
| EV3 | pass | drain 白名单 2+4 显式、无 `native:` 通配、`native:pi-sdk-idle-not-observed` 阻断；使用点/ H13/H14 测试/source 守卫；W7 run-stop drain 真实 facts。 |
| EV4 | pass | 只读 Git/`git_query`/角色 ACL/writeGuard 沿用；delivery 走门、documents 不走；Q9 取代；写门零 `applicationMediation`；PR #72 56/56。 |
| EV5 | pass（覆盖闭合） | q9/N15/R14/trunk-dispatch-parent/chief-workflow/rapporteur/stable-write/session-lifecycle/git-role-e2e 同步；W7 新增 commit/delivery/activation/run-stop E2E；v1 六项覆盖边界全部关闭。 |

### 4.5 判定统计

| 判定 | 数量 | 条目 |
| --- | --- | --- |
| pass | **39** | BASE-1、BASE-3、BASE-4；AC-1–AC-24；P1.2-AC-25–31；EV1–EV5 |
| fail | **0** | — |
| insufficient evidence | **0** | — |
| not applicable | **1** | BASE-2（豁免覆盖） |
| 合计 | **40** | 4 BASE + 24 AC + 7 P1.2 + 5 EV |

## 5. 残余边界裁定与披露审查

| 项 | 裁定/结论 |
| --- | --- |
| AC-1/AC-2 角色术语（`impl` vs 字面 `product`） | **接受术语解释**：`impl` 是真实 roster 的项目 product/implementation 角色（真实角色三文档、模块/写集/任务/ACL）；commit ACL/授权门与 roleId 名称无关；sidecar `actorRoleId=impl` 如实记录。若标准所有者坚持字面内置 `product`，属术语差异，不改变已证的 actor/task/turn/activeTool/ACL/lease/sidecar/ref/journal 安全属性；不判 fail。 |
| AC-8 等价服务链（desktop 私有宿主函数） | 接受：W7 驱动核心 `prepareRunChange→finalizeRunChange`；关键 finalize 提交/run transition journal 为真实原件；W4 桌面 `executeOwnedRunStop` drain 边界独立覆盖；B1 允许 disposed/无 active select_run_change。 |
| custom provider 无法 disposed；stopAndInspect drain 快路径 | 接受：W7 成员终止使用生产 `stopAndInspect` 运行时中立 drain（stopRequested/providerFinished/无 active tool/进程），B1 允许；非伪造 facts。 |
| W7 后台残留进程并发写事故 | 已披露：终止残留、清理污染、单实例哨兵+逐文件干净重跑；受影响文件隔离 1/1，最终计数以干净重跑为准；本 B2 独立复跑 5/5，接受最终干净证据。 |
| Q1 残余风险 | 审批放行不透明 shell 可写 `.git`；其它 active 会话 foreign MCP/未封闭工具可在 lease 外写 `.git`；只进 optionalEvidence，不宣称阻断；控制=逐操作审批/审计/后审计+结构化冲突检测；披露充分。 |
| Q3 Claude/Pi 进程不可观测 | run-stop/controller-stop「已停止」= Core/tracked drain；5s 上限；披露充分。 |
| Q6 审计缺口 | sidecar append 失败 ⇒ 不执行；动作前拒绝仅 best-effort 诊断；披露。 |
| Q7 串行 | 第一变更重叠 5 + 实际第 6 `public/trunk-store.ts` + R14；候选在合并基线 `3f249e2`；串行单写者；披露。 |
| Q12 | 结构化 Git 写=角色 ACL/任务绑定授权，不弹客户卡；未扩大代批。 |
| Q16 | 本 B1 取代第一变更 B1 `P1.3-B1-AC-26`/B1-EV3；q9/N15 改写逐条记录；第一变更 B2 v2 `71b41879…` 为历史；未改其 B1/证据。 |
| B0 豁免 | 沿用覆盖见派发记录 §二；参照 4,982/4,753/196/1/32；环境差异逐条；披露。 |
| 环境性非确定性 | E3 新 W20 ENOTEMPTY（隔离复跑变体进出）、4 消失（3 波动+1 预期红→绿）；D1 2 处环境差异；W7 套件 0 新失败/0 新 skip；披露。 |
| RR 下一门 | Claude MCP schema `__ans_call_context`×`oneOf` 基线缺陷；不在候选 delta；W7 直接驱动核心服务路径，不改变真实模型 MCP 路径仍受该缺陷影响的披露。 |
| W7 未跑真实模型 | RR 结论不变；W7 为确定性/桩件回合；不宣称真实模型行为；披露。 |

## 6. 结论与状态

- **总体：pass**（39 pass / 0 fail / 0 insufficient / 1 N/A）。
- v1 的 6 项 insufficient 全部关闭：AC-1/AC-2 commit（Claude/Pi 完整链）、AC-4 delivery、AC-8/P1.2-AC-25 deferred run-stop finalize、P1.2-AC-31 activation；均有真实 sidecar/journal/ref/回执/write-ahead 原件与负例，W7 5/5 独立复跑通过。
- 其余 33 pass 证据复用合规：原 38 文件 38/38 hash 不变、38 子集聚合 `9462391e…`、产品零改动；W7 只增 6 个测试/夹具；W7 套件 687/629/39/1/18（+5/+5，0 新失败/新 skip）、`test/编排` 不变、typecheck 0。
- 无 fail、无安全旁路/代码返工；残余边界（impl 术语、等价服务链、custom drain、W7 事故、未跑 545 全量 T3）均披露且经裁定。
- 发布/tag、提交/推送/合并未授权；本报告不替代客户确认/实施授权。

## 7. 当前状态与限制

- 本报告只写 `docs/acceptance/`；未修改 B1/方案/代码/测试/角色卡/其他 B1。
- 未运行真实模型/Electron/CDP；未 commit/push/merge/release。
- 证据引用均为当前候选 `787bd910…` 的原始文件；若候选/基线/参照变化，按 B1 复判规则重取。
