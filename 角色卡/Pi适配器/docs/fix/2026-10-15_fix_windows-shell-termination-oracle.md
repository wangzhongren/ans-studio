# Windows shell 终止事实测试修复

日期：2026-10-15。固定角色：Pi 适配器。授权：客户要求配置 macOS / Windows 打包并测试，发现的问题由对应角色修复；本次只修既有测试的跨平台事实判据。

## 问题与实施范围

Windows Release 首轮 CI 的真实 Pi SDK shell 测试在 `test/pi-adapter/tool-display-projection.test.ts` 原 133 行失败：测试要求 POSIX `SIGTERM`，Windows 实际没有该 signal 字段。退出展示必须保留操作系统实际给出的退出码或信号，不能为统一测试而伪造。

唯一测试修改文件为上述文件；不改生产、构建或公共契约。保持退出 0、启动 ENOENT、审核拒绝及凭据不泄漏断言。自终止程序增加同步的终止前标记和延后执行的禁止标记，并以直接 Node 子进程作独立对照：POSIX 仍严格要求 SIGTERM、无数值退出码；Windows 严格要求无信号及实际非零数值退出码。Pi 展示必须逐字段等于对照进程，stdout 只有终止前标记，stderr 为空，确认进程已结束且后续代码没有执行。不删除用例，不跳过平台，不接受任意结果。

## 验证计划与状态

- 本机：`node --test test/pi-adapter/tool-display-projection.test.ts`、`npm run typecheck`。
- Windows：由装配角色在真实 Windows Release CI 验证；本机通过不能代替 Windows 结论。
- 本机实际结果：macOS arm64 / Node v24.14.0，7 项通过、0 失败、0 跳过；`npm run typecheck` exit 0；窄范围 `git diff --check` exit 0。日志分别为 `/private/tmp/ans-release-pi-oracle-test.log` 与 `/private/tmp/ans-release-pi-oracle-typecheck.log`。
- 候选测试文件 SHA-256：`44c76206ed61a20ea4d92865741d54e4b1cd99a41c17abafecb5cb512d5d1ac9`。
- 当前状态：本机验证通过，已交装配角色纳入下一轮 Windows CI；Windows 未测结论保留，不代签跨平台通过。

关联：[功能导航](../../feature-map.md)。
