# B3a 根因证据：source 门的下一层是 e71501c/v2.0.0 语义漂移（非夹具缺口）

日期：2026-11-16（worktree `fix-test-debt-b3a`，起点 `8d6a35e`）
角色：测试

本文件记录「按协调者裁定补真实前置事实后仍无法满足原断言」的产品语义证据与原型观察。
结论不是产品缺陷：是 e71501c（Chief workflow / two-fixed-paths / trunk 执行模型）**有意替换**了
run-pin / run-change / i-full-chain 三份测试所断言的旧 legacy 星形派发/提前 pin 行为。

## 1. handoff 提前 pin：e71501c 明确删除

`git show e71501c -- app/desktop/session.ts`（节选）：

```diff
-        const pinned = await pinRun(projectRoot, runManifest.runId, {
-          ...(chainFacts.d3DecisionId !== undefined && chainFacts.d3Selected.length > 0
-            ? { d3: { decisionId: chainFacts.d3DecisionId, targetRoleIds: [...chainFacts.d3Selected] } }
-            : {}),
-        });
-        if (!pinned.ok) { runFacts.pinFailed = true; } else { ... }
-      }
-    }
+    // Planning coordination must not require future D3, active role documents or workflow.
+    // Worker execution obtains a complete immutable pin through the separate execution preflight.
```

佐证（桌面窗口变更记录 `2026-11-05_change_direct-role-capabilities.md:47`）：
「chief→convener已接O正式planning preflight，并删除handoff提前pin；规划协调不前置未来D3/卡/workflow。」

`git log -S "pinRun(" -- app/desktop/session.ts`：`e71501c` 为删除点；此后 `app/desktop` 内
`pinRun` 无生产调用点（仅 `session/index.ts` 的兼容 import）。

## 2. 原型观察（临时脚本在 worktree 外运行；输出见 `05-prototype-outputs.txt`）

| 原型 | 夹具（全部为真实产品 API / 真实 managed 会话） | 观察 |
| --- | --- | --- |
| P2 | 真实 `openRoleSession` + `createRuntimeAdapterFactory`（demo script 内调 `dispatch_task`）+ 注册 lifecycle；M1/M2/M3→convener handoff | 四次派发均受理；但各自产生 trunk planning run `run-hub-*`，**handoff 不再 pin**；worker 派发 `worker-freeze stage=prepare code=trunk-verify-failed ... effective-manifest-missing` |
| P3 | 直接 `pinRun` 建立 pinned run + 真实 convener 受派任务（`task.created`=pinned runId）+ `sendBackground` 真实回合 | worker 门通过后 freeze 硬拒：`Old run lacks its historical evidence; never refill it from live files` |
| P5 | 直接 `pinRun` 后 `requestRunChangeDecision`（continue-frozen） | 卡呈现、三模式落账与测试期望一致 ⇒ run-change 7 名可纯夹具修正（本批已修） |
| P6 | F2：真实 managed chief 会话 + 基线违规 + `dispatch_task`（product） | `ok=true` + 「状态提示（未阻断）：版本化文档基线有漂移…」⇒ F2 可夹具修正（本批已修） |
| P7 | 仅 fake 句柄 + 注册 lifecycle（无 managed 会话证据） | hub 派发仍 `document-planning-source-unavailable`：`prepareDocumentScope` 需要真实 `handle.sessionId` + managed 证据 |

P2/P3 表明：即便按裁定提供「注册生命周期 + 当前 accepted 客户轮次 + managed 会话证据 + 当前运营
真实受派任务」，旧断言（handoff 即 pin、worker 带 advisory 受理、M1/M2/M3 共享 draft runId）也无法
成立——当前执行 run 必须由 trunk `prepareExecutionRun` 的完整 workflow/teamPlan/active 证据冻结。
`src/service/trunk/impl/apply-journal.ts:3597` 的拒绝是 fail-closed 的当前契约。

## 3. 逐文件根因

### test/桌面应用/run-pin.test.ts（11 名）

| 组 | 名 | 第一层（CI 首错） | 下一层（真实事实后） |
| --- | --- | --- | --- |
| A | M1/M2/M3 共享 draft runId + handoff pin；D3 卡种；缺 D3 pin 失败受理 | document-planning-source-unavailable | handoff 不再 pin（e71501c）；hub 派发走 planning run（run-hub-*），`readRunManifest` 旧 manifest 不成立 |
| B | P1.1：M1 缺 flowId 生成 pending draft；R2 handoff 无 flowId 受理 | chief-hub-flow-unavailable | 当前门明确要求 hubPreparation 必须带 flowId（W36 等同款门在 chief-workflow 测试中被钉为预期），断言与门禁直接冲突 |
| C | R2 run 账本不可用 handoff 无锚点 | document-planning-source-unavailable | 真实事实后走 prepareDocumentScope，任务会锚定 planning run（flowId/runId 出现），与「无锚点」断言相反 |
| D | AC-2.8 哈希漂移 / roster 失败 / AC-2.6 legacy flow / P1-R-08-R1 | worker-dispatch-source-unavailable | 补真实受派任务后 freeze 硬拒（P3）：legacy pinned/draft run 无 trunk 历史证据；旧「受理+advisory+不锚定」语义被 execution preflight 取代 |

### test/桌面应用/run-change-trigger.test.ts（9 名）

- 7 名（三模式显式入口、无会话兜底、宁可不弹、提案卡、AC-17）只依赖「存在 pinned run」这一前置；
  e71501c 后 handoff 不再 pin ⇒ 旧 helper 假设过时。本批改为产品真实 `pinRun` 直接建立 pinned 事实，
  **已 3× 全绿**（断言未改）。
- 2 名（派发不再自动弹 run-change；stop-and-restart 后重新 pin 并恢复派发新角色）在 pinned run 上做
  convener→项目角色派发；worker source 门补真实受派任务后同样落入 freeze 硬拒（同 run-pin D 组），
  无法在「断言逐字不变」下转绿。

### test/测试/governance-e2e-auto/i-full-chain.test.ts（2 名）

- 空 trio 项目聊天在 B6.1/B7.1 起默认为 **fixed**；该文件按 v4.1 legacy 星形链编写且未显式固定
  legacy 模式 ⇒ `stage-request-required`。
- 改为 fixed 合法 stage-request 会改变场景与全部断言（目标/回执/advisory 均不同）；改为显式 legacy
  + 补 flowId/事实后，仍会在「convener 派 worker（handoff-missing advisory 受理）」上落入同一
  freeze 硬拒（P2/P3）。两名均需按当前语义重写期望（B4 类），不是夹具级修复。

### test/claude-adapter/schema.test.ts（0 名，族归属伪影）

- 本机 3× 10/10 全绿。R3 族把裸名 `selected` 挂到该文件是启发式 `repoFiles` 归属伪影；
  `10-block-codes.json` 与 `06-merged-universe.json` 的 `logFiles` 均指向
  `test/桌面应用/chief-workflow.test.ts`（e71501c 漂移族）。见 `03-schema-attribution.txt`。

## 4. 与协调者裁定的关系

- 裁定「source 门维持 fail-closed，不是产品缺陷」**成立**：本批没有发现门禁缺陷，也没有改产品。
- 裁定「补真实前置事实、断言逐字不变」对 8 名成立并已落地（run-change 7 + run-pin F2）。
- 其余 15 名的下一层冲突是 **断言所描述的产品行为已被 e71501c/v2.0.0 有意替换**；在禁止改断言、
  禁止改产品的前提下无法转绿。建议把它们从 B3a 移出，按 B4「按当前契约更新期望」或由 owner
  单列裁决（见记录 §5）。
