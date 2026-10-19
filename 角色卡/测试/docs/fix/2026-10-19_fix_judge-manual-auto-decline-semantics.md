---
id: judge-manual-auto-decline-semantics
type: fix
title: judge manual/deny 自动退回语义落地（测试角色）+ 写卡后 Convener 去重疑似产品 bug 上报
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [judge-auto-decline, judge-switch-matrix, acceptance-gate, post-write-advance]
events:
  - date: "2026-10-19"
    kind: fixed
    summary: 按客户总原则更新 17 条红：manual/deny 不再呈现客户卡，declined + 可操作原因回投发起角色；switch-off 例外保留原卡；row-failed 自动退回；declined 不写 customer.decision；replay 不重放已结算卡。写卡后 Convener 重复派发经桌面属主修复（共享 project+flow+convener 去重键）后，c 场景3/i-full-chain 均绿；test/测试 786/786，typecheck 0。
---

# judge manual/deny 自动退回语义落地 + 写卡后 Convener 去重修复复验

## 结论

- 17 条红**全部收口**：16 条按 2026-10-19 客户总原则更新断言；剩余 2 条（c 场景3、i-full-chain）确认为**产品重复派 Convener**，桌面属主修复后复验通过。
- `node --test "test/测试/**/*.test.ts"`：**786 计 / 786 过 / 0 红 / exit 0**（产品文件稳定 2 分钟后复跑）。
- `node --test "test/测试/governance-judge-cards-verify/*.test.ts"`：**43/43**。
- `node --test "test/测试/governance-e2e-auto/*.test.ts"`：**31/31**（连续 3 次）。
- `npm run typecheck`：**exit 0**。

## 1. 新语义（试验收口径）

开关开启且 judge 实际运行后：

| 裁决 | 行为 |
| --- | --- |
| `approve` | 既有：结果行 + answered（judge 审计） |
| `deny`（approval 组） | **不呈现客户卡、不发结果行、不写客户决定**；`declined{operatorId:"judge:<engine>", reason}` 回投发起角色，同轮修正重发 |
| `manual`（全部回落原因，含超时/证据不足/读取失败/解析失败/引擎不可用/row-failed/ledger-unavailable） | 同上：自动退回 `declined` + 可操作原因 |
| `switch-off`（判断期间客户关闭开关） | **例外**：原卡 + `judgeNotice`（客户已选择手动） |
| `aborted` | 既有取消/丢弃语义 |
| judge declined 账本 | **不写 `customer.decision`**（编排 `run-role.ts` 按 `operatorId.startsWith("judge:")` 跳过） |

可操作原因模板（实测）：`自动审批/决策未通过：<人话原因>（<具体原因>）。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。`

## 2. 逐文件更新

### `governance-e2e-auto/a-proposal-write-auto.test.ts` 场景1b
- 由「等待原卡 + judgeNotice + 客户拒绝」改为：`presented=0`、`judgeRows=0`、`request_confirmation` 回执 `ok=false` 且含「自动审批未通过/重新提交」、不得出现「客户已选择」；账本无 `customer.decision`。

### `governance-e2e-auto/e-switch-matrix.test.ts` 场景5f
- accept-quick 不代批：不再呈现原卡/客户手答；直接 `declined{operatorId:"judge:claude"}` + 「自动决策未通过 + 重新提交」；`presented=0`、`rows=0`。

### `governance-e2e-auto/g-judge-timeout.test.ts` 场景7b/7c
- `TimeoutHarness.ask` 去掉「等原卡→手动作答」，直接等待 declined 结算。
- 7b（write/审批组）：`presented=0`、超时原因 + 「自动审批未通过」+「重新提交」；保留 40ms 超时时限断言。
- 7c（proposal/决策组）：同上，「自动决策未通过」+「判断超时」；不再是客户 answered。

### `governance-e2e-auto/f-acceptance-gate.test.ts` 6a/6b/6c/6d/6f
- 新增 `expectAcceptanceDeclined()` 统一收口：`presented=0`（无验收客户卡）、`judgeRows=0`、`request_choice` 回执 `ok=false` + 「自动决策未通过/拒绝」+ 具体原因 + 「重新提交」；账本无 `decisionKind:"acceptance"` 的客户决定。
- 具体原因断言：6a `/证据不足|未完成|待派发|阻塞/`、6b `/dispatch\.accepted/`、6c `/阻塞|blocked/`、6d `/未结算/`、6f `/flow-a\.yaml/` + `steps[0].evidence` + 「必须提供 evidence」且无旧「缺少可解析的步骤表」。
- 6e（正向代批）保持 0 卡 + 1 结果行 + `reasonCode:"sufficient"` + YAML-only 守卫。

### `governance-judge-cards-verify/c-fallback.test.ts`
- 失败矩阵（证据不足/读取失败/超时/引擎不可用/解析失败）：`presented=0`、`rows=0`、`declined{judge:claude}` + 「自动决策未通过/重新提交」。
- 按组回落：decision manual → declined（无卡），approval approve 不受影响；反向同理。
- 通道层超时：declined + 「判断超时/重新提交」。
- row-failed：declined + 「结果无法在聊天中显示/重新提交」，不呈现原卡。
- switch-off 例外与 aborted 用例保持原语义（已通过）。

### `governance-judge-cards-verify/d-audit-ledger.test.ts`
- 「回落 → 客户手答」改为「回落 → 自动退回」：无客户卡、`request_choice` 回执 declined、账本**不写** `customer.decision`（`proposal-accept` 不存在）、不触发应用下一步（`nextSteps=0`）。
- group 交叉校验：错组 → declined + 「分组不一致/重新提交」，账本不写客户决定。

### `governance-judge-cards-verify/e-queue-once.test.ts`
- manual 回落卡 replay：declined 卡已结算 ⇒ `replayPending()=0`、不重呈现、不重新判断、无重复投递；`judgeCalls` 仍恰 1。

## 3. 产品 bug：写卡后 Convener 重复派发（已由桌面属主修复）

实测证据（修复前，临时日志已删除）：

```
DEBUG convener prompts: [ <排程任务>, <排程任务> ]   // 长度 2
DEBUG convenerSnapshots: [{filesExist:true,listed:true},{filesExist:true,listed:true}]
DEBUG ledger: [..., ["dispatch.accepted","app","customer-decision","convener"],
                    ["dispatch.accepted","app","customer-decision","convener"]]
```

- 两条 Convener 任务的触发面：
  1. 既有 `advanceGovernanceFlow` 的 appointment `followUp`（写卡完成后派 Convener）；
  2. 新增「写卡后推进检查」（`runPostWriteAdvanceCheck`，appointment-write answered / 治理角色 settle 触发）。
- 两者各自运行期去重但互不感知；账本 append 异步，不能作为进程内唯一判据 ⇒ 各派一次、各写一条账本。
- **桌面属主修复**：两条链路共用同一 `project+flow+convener` 运行期去重键（`postWriteAdvanceDispatched` + `applicationConvenerDispatchKey`）；先占位、成功保留、失败释放；去重命中时既有链路仍返回
  `{ok:true, dispatched:true, targetRoleId:"nominator", followUpRoleId:"convener"}`，保持两段式结果契约。
- **复验**：c 场景3 连续 5 次通过；e2e-auto 连续 3 次 31/31；`test/测试` 786/786。强断言「Convener 恰一次」全程未放宽。
- 复验期间曾观察到一次 `waitForRoleIdle` 竞态（`Crew / 组队 本轮未在时限内结束`），属桌面属主修复过程中的中间态；最终稳定快照下不再复现（产品文件稳定 2 分钟后复跑）。

## 4. 验证与纪律

- `test/测试/governance-judge-cards-verify/*.test.ts`：43/43。
- `test/测试/governance-e2e-auto/*.test.ts`：31/31（连续 3 次）。
- `test/测试/**`：786/786（产品文件稳定快照：`interface.ts` sha256 `6e08d228…`、`customer-input.ts` sha256 `30fde95d…`）。
- `npm run typecheck`：exit 0。
- 未 git 提交；未读 `.env`；未打印凭据；未改产品源码；临时调试文件已删除。
