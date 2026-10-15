# 发布测试的确认等待逻辑时钟

状态：实施中；已获当前发布修复授权，沿用项目管理已接受的相同逻辑时钟取舍。

全仓并发运行时，确认等待测试的真实 MCP 连接和文件 IO 可能用尽 50ms 的活动时限，使本应验证“等待客户时暂停计时”的测试提前超时。生产时限使用 `Date.now` 与全局 `setTimeout`；错误来源是夹具让宿主调度耗时混入业务逻辑时钟。

本次仅修改 `test/claude-adapter/session.test.ts`：保持 50ms 时限和 100ms 客户等待，使用 node:test 的 Date/setTimeout 时钟显式推进；真实 MCP 和文件系统仍实际运行，以未替换的 setImmediate/performance 观测。保留“确认前文件不存在，确认后写入成功”，补充等待期间没有终态和 49+1ms 活动时限会真正超时的负对照。宿主 10 秒 watchdog 防止测试死等。不改生产逻辑、不增加重试、不跳过或增大业务时限。

验证计划：该测试文件、全仓类型检查；生产文件哈希前后不变。完整发布组合由测试角色执行。

关联：[Claude 会话功能](../feature/claude-session.md)。

## 实施及验证

状态：本角色已验证，交测试角色复跑完整发布组合。

原测试的 50ms deadline、确认等待 100ms、确认前 `access` 拒绝、确认后真实文件 `yes` 全保留；额外检查 gate 实际 waiting、等待期间没有 settled、完成后只有一个 completed。使用未 mock 的 `setImmediate`/`performance.now` 观测真实 IO，外层 node:test 10 秒宿主 watchdog 不依赖逻辑时间。

新增未等待负对照在 49ms 无终态，50ms 得到原文 `Claude 本轮超时（50ms）` 与 TimeoutError，且唯一 timed_out、真实 query close 一次、SDK AbortSignal 为 aborted。生产超时路径使用 close 而非用户 stop 的 interrupt；负对照按现有实际契约验证。原 stop/权限/迟到回答/顺序测试未改。

macOS arm64、Node v24.14.0：`node --test test/claude-adapter/session.test.ts` 29/29，0 失败/跳过；`npm run typecheck` exit 0。该证据验证显式逻辑时间语义，不能宣称真实墙钟 50ms 调度保证。未验证外部 Claude 账号。

| 文件 | SHA-256 |
| --- | --- |
| test/claude-adapter/session.test.ts | 36c1f82bbdb80582c0b68a3d04d26d1b03a530b80223ae99baab88c1216ac95e |
| src/provider/claude/session.ts（无差异） | e51e73e3593cbce8f57afba22b4913c30959e9a488eeac80e27e25b9e5921b87 |
| src/common/claude-adapter/lifecycle.ts（无差异） | c90ea5ca65346691b23f458f51232fd2050232fd4e9e972a018ad2bc9e0318a5 |

日志：`/private/tmp/ans-release-claude-clock.log`、`/private/tmp/ans-release-claude-clock-typecheck.log`。全仓 CI 仍由发布验收补充；没有新增 CI 重试、调整产品时限或跳过检查。
