# Claude适配器变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组员。角色定义已按会话授权落盘；应用开发和测试尚未完成。

# 变更记录

2026-10-14：实现 ANS Claude Provider、完整 schema MCP 注册、连续轮次、停止/超时/恢复和精确 native 目录隔离。实际 SDK 临时环境 17/17、targeted 类型检查通过；正常项目依赖及整仓验证待装配。见[实施证据](docs/change/2026-10-14_change_claude-runtime.md)。

2026-10-14 A1V：实际原生回环验证发现并修复bare抑制SDKhooks、nativeprompt_id不能直接等于SDKuuid以及环境profile引用变化。正式20/20、真实native探针和整仓类型检查通过，见[修复证据](docs/fix/2026-10-14_fix_claude-native-hook-identity.md)。

2026-10-15：CLAUDE-A-1按批准A4/C2.tp1/consumer2实施。生产required-v1工具投影、同快照profile登记、原始hook关联与SDK内容保护；28/28、tsc及真实本地native回环通过，未做在线/桌面验收。见[实施证据](docs/change/2026-10-15_change_tool-display-projection.md)。
