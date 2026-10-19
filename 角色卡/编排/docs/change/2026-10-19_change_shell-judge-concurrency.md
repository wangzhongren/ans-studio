# 2026-10-19 变更：shell 判断从单飞改为会话内有界并发池

## 问题

真机中，前端角色在同一轮并行发出 4 条 shell（`/`、`app.js`、`styles.css`、`wc`）。编排的 shell 判断器是**单飞**的：

```ts
let busy = false;
if (busy) return manualOutcome("unavailable", "判断 agent 正忙（已有一次判断在进行），本次已转手动确认。");
```

第 1 条占用判断后，后 3 条里 2 条立即回落手动确认；真机诊断日志为 `shell-confirm.presented requestId=sc-8 pendingCount=3`。结果是客户同一轮里看到多张本该由「替我审批」自动处理的确认卡，而判断本身只需几秒。

## 客户意见原文

> 每条等待5s 我觉得不够吧，或者开启几个线程变形处理呢。一个角色一个呢。

客户倾向并发/多线程处理；同时明确「一个角色一个」（并发池归属角色会话，不是全局）。

## 设计取舍

1. **池在 `createShellJudge` 闭包内**（`src/common/编排/shell-judge.ts:364-372`）：每次 `createShellJudge` 返回一个 judge fn，桌面对每个会话各建一份（`app/desktop/session.ts:578`），因此池天然按角色/会话隔离，不同角色互不挤占。
2. **并发上限默认 3**（`DEFAULT_SHELL_JUDGE_CONCURRENCY`，`shell-judge.ts:88`）：环境变量 `ANS_SHELL_JUDGE_CONCURRENCY` 可覆盖，最终夹在 1..8（`SHELL_JUDGE_CONCURRENCY_MIN/MAX`，`shell-judge.ts:90-91`）。非法/缺失回 3。真机场景 4 条并发、上限 3 时，只有第 4 条排队。
3. **达到上限进入有界 FIFO 等待队列**（`shell-judge.ts:410-449`）：未达上限立即启动；队满（默认 32，常量 `DEFAULT_SHELL_JUDGE_MAX_QUEUE`，可用 `maxQueue` 选项调小）立即 `manual/queue-full`，不无界堆积。槽位释放时直接把槽**移交**给队首（`releaseSlot`，`shell-judge.ts:390-408`），`active` 不回落再自增，避免交接窗口。
4. **排队总时限独立**：`ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS`（默认 60s，`shell-judge.ts:111-130`），不把排队时间算进判断硬超时——每个请求的判断计时仍从真正开始判断时起算，独立 120s。排队超时返回 `manual/queue-timeout`，reason 含「排队超时（已等待 >60s，仍有 N 条判断在跑）」；排队中外部中止返回 `manual/aborted`；队满返回 `manual/queue-full`。均不放大、不假装成功。
5. **不改变判断语义**：规则层、三引擎矩阵、上下文校验、防循环 `denyCounts`、读取损伤降级、`unavailable` 总策略全部原样；只把「busy 立即回落」替换为「排队等待槽位」。
6. **诊断**：新增 `shell-judge.queued`（入队，`queueDepth`/在跑条数）、`shell-judge.queue.timeout`（排队超时，`timeoutMs`/`queueDepth`/在跑条数）、`shell-judge.queue.full`、`shell-judge.queue.granted`（排队时长），字段均在诊断落盘白名单内。

## 改动文件

- `src/common/编排/shell-judge.ts`
  - 新增常量与解析器 `DEFAULT_SHELL_JUDGE_CONCURRENCY` / `SHELL_JUDGE_CONCURRENCY_ENV` / `MIN` / `MAX` / `resolveShellJudgeConcurrency`（83-109）、`DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS` / `SHELL_JUDGE_QUEUE_TIMEOUT_ENV` / `resolveShellJudgeQueueTimeoutMs`（111-130）、`DEFAULT_SHELL_JUDGE_MAX_QUEUE`（132-133）。
  - `CreateShellJudgeOptions` 增 `concurrency` / `queueTimeoutMs` / `maxQueue`（170-174）。
  - 并发池类型 `SlotWaitResult` / `QueueWaiter`（184-201）。
  - 闭包内池实现 `removeWaiter` / `settleWaiter` / `releaseSlot` / `acquireSlot`（375-450）。
  - 返回的 judge fn 用 `await acquireSlot(...)` 替代 `busy` 布尔（718-741）；`queue-timeout` / `queue-full` / `aborted` 均走既有 `manualOutcome`。
- `test/编排/shell-judge.test.ts`：删除已不成立的「busy 第二次直接 manual/unavailable」用例；头部说明改为指向新测试文件。
- `test/编排/shell-judge-concurrency.test.ts`（新增，11 例）：配置解析矩阵、env 生效、默认上限 3 的 4 并发全部 allow、上限 1 的 FIFO 排队、排队超时、排队中止、队满、单条失败隔离、每请求独立计时、闭包隔离、并发下 `denyCounts`。

## 测试与验证

- `node --test "test/编排/shell-judge-concurrency.test.ts" "test/编排/shell-judge.test.ts"` → **45/45 pass**（并发 11 + 原 shell-judge 34）。
- `node --test "test/编排/**/*.test.ts"` → **566 tests / 566 pass / 0 fail / 0 skipped**（本机 HEAD 6d40eee + 工作树他人未提交改动；全绿快照）。
- `npm run typecheck` → **0 错误**。

## 跨角色请求（未越界）

1. **桌面窗口：通道防御超时需覆盖排队时间**。`app/desktop/operator-channel.ts` 的 shell judge 通道超时 = driver 判断超时 120s + 15s 余量 = 135s（`ANS_SHELL_JUDGE_TIMEOUT_MS` 派生）。本改动引入排队后，最坏单请求墙钟 = 排队 60s + 判断 120s = 180s，可能先撞桌面 135s 通道超时（表现为桌面侧「判断超时（>135s）」并中止 driver，即使队列马上要轮到）。建议桌面把通道超时改为 `judgeTimeout + queueTimeout + 余量`（读取同名 `ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS`），或在通道侧区分「排队等待」与「判断超时」。
2. **桌面窗口：提示文案映射**。`judgeManualHumanReason`（`app/desktop/operator-channel.ts:566`）目前把 `unavailable` 统一显示「判断服务不可用」。本次新增的 `queue-timeout` / `queue-full` 走 `default` 分支，会原样展示我们给的具体 reason（不会被吞）；若希望卡片文案更短、更稳定，可在桌面加两条显式映射（如「判断排队超时」/「判断排队已满」）。真正的引擎不可用（`unavailable`）仍显示通用文案，是否保留由桌面决定。
3. **桌面窗口：并发判断的资源预期**。上限 3 意味着同一角色最多 3 个判断会话同时在跑（3 份模型请求/读取预算）。如客户机器或模型配额吃紧，可用 `ANS_SHELL_JUDGE_CONCURRENCY=2/1` 降档，无需改代码。

## 残余风险

- **并发提高模型调用与读取开销**：上限 3 是默认值，极端情况下同一角色同时 3 个判断会话；已提供 env 与选项降档。
- **并发下防循环的检查窗口**：同一命令的两条请求可能都在任一条 deny 落账前通过 `retry-capped` 预检，随后各自 deny 并各计一次。计数不会丢（Map 同步累加），但「上限命中前可能多跑一次」；安全方向是拒绝，不会放行，语义上不构成绕过。
- **队满/排队超时仍回落手动**：这是容量不足时的诚实表现，不是自动放行；若客户经常见到，应调大 `ANS_SHELL_JUDGE_CONCURRENCY` 或排查判断会话为何长期占用槽位。
- **排队总时限与判断硬超时的合计可能较长**（60s + 120s）；与桌面通道超时的对齐见跨角色请求 1。
- **「多线程」实为异步并发**：判断会话各自独立适配器/会话，不共享状态；不是 OS 线程，模型服务端仍可能串行限流。
- 本改动未改规则层、未改「判断失败转手动」总策略、未改桌面/渲染侧任何文件。

## 边界声明

只写 `src/common/编排/shell-judge.ts`、`test/编排/shell-judge.test.ts`、`test/编排/shell-judge-concurrency.test.ts` 与本角色文档；未碰 `app/**`、其他角色文件、依赖与 git 历史；未读 `.env`、未发真实模型请求。
