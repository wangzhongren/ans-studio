# chief-workflow W 家族 trace 归因（R9）

方法：对 `✖ failing tests:` 段的为首断言消息之后的 `JSON.stringify(trace)` 逐行标注（`role/lastRole/lastToolId/user` 前缀）。
标注脚本按 `[工作结果]` / `[应用·文档更新]` / `[派发]` / `[系统...]` 前缀与“状态：failed / 本轮执行超时 / W21 publication completed”子串分类。

## 1. x64（五名共享同一形态）

适用：W29 document-change（21,019.0ms）、W29 wrong-flow（21,212.9ms）、W29 source-loss（21,309.9ms）、W30 连续写入后（21,276.2ms）、W30 真实重启迁移后（20,235.6ms）。trace_len=30。

```text
[25] DISPATCH role=product                    <- W21 publish actual material then report 派发
[26] WORKRESULT FAILED TIMED_OUT role=chief   <- 状态：failed / 摘要：本轮执行超时 / 本轮未提交正式任务报告
[27] NOTICE role=chief                        <- [应用·文档更新] version-upgrade ... applied
[28] NOTICE role=convener
[29] NOTICE role=product
```

- `closeBasis` 只在 `chief-workflow.test.ts:1786-1789` 收到 `[工作结果] ... W21 publication completed` 时写入；本形态中该回交被 `turnLastResortMs=4500` 中止为 `timed_out`，因此 `:1945` 的 `closeBasis !== undefined` 永远为假。
- 通知行在失败回交之后到达，说明发布应用本身已成功（`applied`），失败点是 product 发布回合的第二工具（`ans_submit_report`）未能在 4.5s 内完成。

## 2. Windows（四名共享同一形态）

适用：W29 document-change（16,574.3ms）、W29 wrong-flow（16,814.3ms）、W29 source-loss（14,830.4ms）、W30 真实重启迁移后（16,683.3ms）。trace_len=31。

```text
[25] DISPATCH role=product
[26] NOTICE role=chief
[27] NOTICE role=convener
[28] NOTICE role=product
[29] SYSTEM role=chief
[30] WORKRESULT FAILED TIMED_OUT role=chief   <- 状态：failed / 本轮执行超时
```

与 x64 同根：通知已到，但发布任务回交为 `timed_out`，`closeBasis` 缺失。

## 3. W34

- Windows（9,535.4ms，断言 `:1915`）：trace 尾部 `[26] DISPATCH role=product` → `[27] NOTICE role=chief`；**无** `w34-close-publication`。未观察到 `W21 publication completed` 完成回交（trace 无失败回交行；与 W29 同根推断为 4.5s 兜底/超时，待 B 批复核）。
- x64（18,001.1ms，测试级超时）：teardown 打出的 primary failure 为 `:1915` 断言，trace 停在 `[26] DISPATCH role=product`，**无任何通知行**；teamPlanning 用例预算 18s < 通知等待 20s（`:1703` vs `:1934`），测试先超时。

## 4. W35（x64 级联）

无 trace 断言体；首要错误为 `waitForCoreRegistryQuiescent` 在 `pre-open` 抛出的
`Core registry not quiescent ... [{"sessionId":"ca24da13-...","roleId":"product","state":"disposing","projectRoot":".../ans-w21-notice-go164m"}]`。
该 product 会话来自 W34（team-planning）超时后的 teardown（同轮 `B1b Core registry not quiescent for W21 variant team-planning teardown` 指向同一 sessionId/projectRoot）。因此 W35 x64 是 W34 的级联，不是独立产品缺陷。

## 5. 通过变体对照（证明不是全链路产品回归）

- W29 document-change-missing-confirmation：arm64 3,015.3ms / x64 8,044.9ms / Windows 4,036.5ms，全部通过（该变体的发布尝试被真实拒绝，不经历慢发布回合）。
- W30 连续写入后：arm64 8,405.9ms / Windows 10,495.8ms 通过，x64 21,276.2ms 失败。
- W33：arm64 3,164.9ms / x64 5,736.7ms / Windows 3,550.7ms，全部通过。
- W35：arm64 2,937.0ms / Windows 4,083.7ms 通过，x64 30,001.6ms 超时（级联）。
- 这些通过样本说明：只要发布回合在 4.5s 内完成，同一产品链在三平台都能通过；失败样本的差异只在慢 runner 上真实发布回合 >4.5s。
