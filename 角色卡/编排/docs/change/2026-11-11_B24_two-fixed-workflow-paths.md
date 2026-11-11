# W：B24 fixed A3 意图入口门与 finalize 幂等恢复（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B24——RR20 失败修复（A3 意图最终化 pending-recovery 无重试，链在首张确认卡后死锁）。
- 依据：RR20 记录 `角色卡/测试/docs/change/2026-11-11_RR20_two-fixed-workflow-paths.md`（`c90c5be478a8a9022a604106ceb8d1af0af621d879fd39d2a7a2a85e842f763b`）；协调方 B24 授权与 RR21 预算批准。
- 基线：HEAD `0990e50`（RR20 记录提交）。

## 一、RR20 失败事实（根因）

- A1 dispatched、A2 completed（B19 唤醒）；A3 意图卡 `req-6ac2c05bb4d06126` 客户 confirm 后，应用 fixed finalize 于 05:29:17.805 报 `intent-entry-missing`（`docs/intents/snake-game-mvp.md` 尚未落盘）并进入 `pending-recovery`；chief 05:29:55 补写入口、回合 05:30:10 正常结束，但应用从不重试最终化，`stage.completed A3` 未写入；驱动 12 分钟无账本进度 stall 停止。
- 机制缺口：
  1. `prepareIntent` 在写 `stage.requested A3`/呈卡前**不校验意图入口**；入口校验只在客户确认后的 `finalizeIntent`。RR19 只是恰好先写了入口（早 4 秒），RR20 写成于卡确认之后 ⇒ 竞态。
  2. `fixedIntentCardDuplicateReason` 对“同意图已 confirm 裁决但 A3 未完成”返回 `intent-confirm-already-resolved` 时**只拒绝、不重跑 finalize**；错误文案承诺的「chief 写后重试；幂等」没有实现 ⇒ 死锁。

## 二、实施

### 2.1 `src/common/编排/workflow-service.ts`（M）——B24.1 入口门

- `prepareIntent` 在 A2 completed 的呈卡分支写 `stage.requested A3` 之前，调用既有 `readIntentEntryFacts({ projectRoot, flowId, productIntentPath })`：
  - 入口存在且 `intentEntryIntentId === intentId`（产品意图 frontmatter 的 intentId）⇒ 继续补记 A3 并返回证据；
  - `intentId` 缺失、入口缺失或 intentId 不一致 ⇒ `intent-entry-missing` fail-closed（不写 `stage.requested A3`、不呈卡），消息与 finalize 同口径：「意图入口缺失或 intentId 不一致：docs/intents/<intentId>.md（chief 写后重试；幂等）」。chief 补写入口后重试 prepareIntent 即幂等通过。
- A3 在办（卡已 request、待结算/恢复）的既有证据路径不变（B12.1 幂等判定依赖）。

### 2.2 `src/pipeline/orchestration/run-role.ts`（M）——B24.2 幂等恢复

- `fixedIntentCardDuplicateReason` 的 `intent-confirm-already-resolved` 返回值新增 `resolvedEvent`（已持久化的 `request.resolved` confirm 事件）。
- 卡请求调用点：命中 `intent-confirm-already-resolved` 且带 `resolvedEvent` 时，幂等重跑 `workflowFinalizeIntent({ projectRoot, event })`：
  - 成功 ⇒ 补记 `stage.completed A3`（finalize 内按 requestId 幂等，重复调用 replay 不重复事件），返回 declined/notPresented 回执，文案明确「A3 已完成恢复（stage.completed A3）；可继续 A4」；
  - 仍失败 ⇒ 记录 `intent.confirmation.fixed-finalize-pending`，维持 fail-closed（不伪造完成、不重复发卡）。
- 新增诊断 `intent.confirmation.fixed-finalize-recovered`（requestId/replay/phase=recovered）。

## 三、测试

| 文件 | 用例 | 断言 |
| --- | --- | --- |
| `test/编排/workflow-fixed-b131.test.ts` | 新增 B24.1 服务级用例；②/④/⑤ 夹具补意图入口 | 入口缺失/intentId 不一致 ⇒ `intent-entry-missing` 且无 `stage.requested A3`；补写后幂等恰一次 A3；原有 A2 未完成/blocked/workflow-not-found 门顺序不变 |
| `test/编排/workflow-close-intent.test.ts` | prepare/finalize 用例更新为 B24 口径 | 缺入口 ⇒ prepare 即 `intent-entry-missing`；补写入口 ⇒ prepare ok + documentRefs/marker 原断言保持；finalize/幂等 replay/hash-drift/不写 trunk 不变 |
| `test/编排/run-role-fixed-b121.test.ts` | 改造入口缺失用例为 B24.1 run-role 门；新增 B24.2 恢复用例 | 缺入口 ⇒ declined/notPresented、不调 raw、不写 request.created；决议时入口缺失 ⇒ pending-recovery，补入口后重试 ⇒ `stage.completed A3` 恰一次（幂等无重复事件），再次请求 already-completed |
| `test/编排/run-role-fixed-b31.test.ts` | 入口缺失用例改为 B24.1 呈卡前 fail-closed | rawCalls=0、declined notPresented、无 stage.requested/completed A3 |

## 四、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b24-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（b131/close-intent/b121/b31/b2/direct-role-capabilities/b31-release-auto/b3-cards-panel/b51/fixed-path-routing/b21-basis-gate/全链；12 文件） | **143/144 pass**；唯一失败 `Retained intent confirmation…` = B17 冻结 known-red 之一 | `_evidence/b24-02-affected.tap`（`83cb7067…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b24-03-full-chain.tap`（`8d018952…`） |
| 全量 `test/编排/*.test.ts` | **1342 pass / 24 fail / 2 skip**；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b24-04-orchestration-suite.tap`（`b933bb1f…`）、`b24-05-known-red-failnames.txt`（`f9513fb0…`）、`b24-06-known-red-diff.txt`（`e3b0c442…`，空） |

## 五、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts` | M | 207,749 / 4,441 | `09ecbb19440ad03ef9ef91c4796b3c7b78b2e9ede805d90a5843b8d09079ddf9` | +11/−0 |
| `src/pipeline/orchestration/run-role.ts` | M | 306,839 / 4,727 | `7e35e627521eb79e46f4e77294648620f4045d5a5efda4837b3df1eb1db39236` | +23/−2 |
| `test/编排/workflow-fixed-b131.test.ts` | M | — | `a6f160ff59bfb327dbe5a21f27b508f2946ef98d00e7f4edfbcfe7266bd399d5` | +40/−1 |
| `test/编排/workflow-close-intent.test.ts` | M | — | `45171558597c9b386a43ba2a47295f1cc397d41256e7b56b16b0c3d3db43d132` | +6/−7 |
| `test/编排/run-role-fixed-b121.test.ts` | M | — | `d979c74d6f73acc4cdb75789cec9987af7b4bedf6df7b455ef956dc3fc8f7d38` | +60/−9 |
| `test/编排/run-role-fixed-b31.test.ts` | M | — | `9a5a47dd51a83fe6e544639c5e38bf5c33e217bbe9ab2fe32ace1ffe86dac48f` | +14/−29 |

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR21 行使。
- B24.1 只约束 A3 呈卡前的服务门；A3 在办（已有卡）时 `prepareIntent` 仍返回证据供 B12.1 幂等判定（行为不变）。B24.2 只对“已 confirm 裁决 + 同意图 hash”恢复，不同意图版本/未决/多待决路径不变。
- 既有测试因 B24.1 收紧而更新：入口缺失场景从“呈卡后 finalize pending”改为“呈卡前 fail-closed”；finalize 缺失入口的防御仍由 B24.2 用例（决议前入口缺失）覆盖。
