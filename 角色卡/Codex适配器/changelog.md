# Codex适配器变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组员。角色定义已按会话授权落盘；应用开发和测试尚未完成。

- 2026-10-14 X1：实现 Codex app-server 动态 ANS 代理与内存 MCP、有效配置/目录隔离、原轮信号、中止/超时、恢复与共享凭据脱敏；自有 14 项测试和自有严格类型检查通过。真实 alpha 无模型配置/schema 探针通过；稳定 0.162.1 和全仓依赖联调待装配。详见 [实施记录](docs/change/2026-10-14_change_codex-governed-session.md)。

- 2026-10-14 X1S：修复可选 API 地址空白错误，显式空白选官方默认，显式非空继续覆盖环境；验证 model/base/key/脱敏使用同一捕获结果。当前 16/16 自有测试、全仓 tsc0；稳定探针此前由装配通过，本次没有重跑或改运输。详见[修复](docs/fix/2026-10-14_fix_blank-base-url-default.md)。


- 2026-10-15：Codex真实工具展示投影、required/profile与模型输入保持接线完成；22/22及固定CLI本地回环通过，全仓类型检查通过。[实施记录](docs/change/2026-10-15_change_tool-display-projection.md)。

- 2026-10-16 EBUSY 收尾修复：CI Windows 仅 1 红（实际原生进程用例收尾 `rmdir …\ans-codex-…\work` 报 EBUSY）定位到本角色 session.ts `cleanup()`（清理逻辑不在测试本地 helper）——`nativeEngine` 新增等 `'close'`（进程退出＋stdio 管道全关）后 `cleanup()` 才删目录，删除改经 `src/common/shared/atomic-write.ts::retryOnTransient` 有界重试（仅 EBUSY/EPERM/EACCES、≤200、setImmediate；非瞬时立即抛）。测试文件零改动零 skip、断言零放松；25/25、tsc0、原语自测16/16；darwin 无法复现 EBUSY，Windows 侧待 CI 复跑。见[修复](docs/fix/2026-10-16_fix_native-teardown-ebusy.md)。
