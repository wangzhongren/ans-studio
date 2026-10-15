# Windows 真实 JSON-RPC 进程夹具

2026-10-15，Codex适配器固定角色。客户已授权跨平台运行包和必要测试修复。

Windows CI 首轮在 `session.test.ts` 的 actual native process JSON-RPC parser 用例报 `spawn EFTYPE`。原用例将带 POSIX shebang 的 `native-cli.mjs` 直接当可执行文件；Windows 不支持这种启动方式，尚未走到任何协议断言。这是夹具的启动问题，不证明正式原生 Codex 二进制失败。

必要方案与精确范围：只修改本角色 `test/codex-adapter/session.test.ts` 中该用例及本记录。测试临时接管 `node:child_process.spawn`，仅当命令精确等于夹具 `.mjs` 路径时，委托原生 spawn 启动 `process.execPath [fixture, ...原参数]`；其他调用含 Windows taskkill 完整透传。它仍是真实 OS 子进程、真实 stdin/stdout JSON-RPC、真实适配器解析器、真实 MCP。无 fakeEngine，无跳过，无生产或接口修改。

全部原有成功回调、上游取消、signal、双 dispose 同一 promise 与 settled 次数断言保留，新增实际启动次数和有效 PID 断言。用例结束恢复 built-in ESM spawn 绑定。计划本地自有回归和类型检查；Windows 结果由下一次真实 CI 记录，不以本地通过冒充。

关联：[受治理会话](../feature/codex-governed-session.md)。状态：夹具修复已实施，本地25/25和类型检查通过，Windows CI待后继真实运行。

本地 macOS arm64 / Node24.14.0：`node --test test/codex-adapter/*.test.ts` 25/25，exit0；`npm run typecheck` exit0；`git diff --check` exit0。[测试日志](2026-10-15-windows-native-fixture-evidence/tests.log)、[类型日志](2026-10-15-windows-native-fixture-evidence/typecheck.log)。

精确候选 `test/codex-adapter/session.test.ts` SHA256 `1347467a9395da49ae9635b7b9e8005bea2dc1b29f9b49be9dd0fec48e177078`。生产 session.ts SHA256仍为 `0b603897b281a693f3c7cbabba74c313ca1db1f4f6cdb9f249a2cb09c4891521`。没有改变或新增跳过条件；既有POSIX进程组专属测试的Windows skip原样保留。
