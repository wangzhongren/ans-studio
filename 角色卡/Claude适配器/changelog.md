# Claude适配器变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组员。角色定义已按会话授权落盘；应用开发和测试尚未完成。

# 变更记录

2026-10-14：实现 ANS Claude Provider、完整 schema MCP 注册、连续轮次、停止/超时/恢复和精确 native 目录隔离。实际 SDK 临时环境 17/17、targeted 类型检查通过；正常项目依赖及整仓验证待装配。见[实施证据](docs/change/2026-10-14_change_claude-runtime.md)。

2026-10-14 A1V：实际原生回环验证发现并修复bare抑制SDKhooks、nativeprompt_id不能直接等于SDKuuid以及环境profile引用变化。正式20/20、真实native探针和整仓类型检查通过，见[修复证据](docs/fix/2026-10-14_fix_claude-native-hook-identity.md)。

2026-10-15：CLAUDE-A-1按批准A4/C2.tp1/consumer2实施。生产required-v1工具投影、同快照profile登记、原始hook关联与SDK内容保护；28/28、tsc及真实本地native回环通过，未做在线/桌面验收。见[实施证据](docs/change/2026-10-15_change_tool-display-projection.md)。

2026-10-16：G-3 路径联网搜索接入按客户批准的提案（期1）实施。`ANS_CLAUDE_WEB_SEARCH` 默认关（关时逐字旧行为）；开时 `tools/allowedTools` 声明内置工具、PreToolUse 放行分支（必需项：hook deny 先于 allowedTools；不注入 `updatedInput`）、消息泵 `native-start`/`native-result`（失败如实、不毁轮次）。32/32（+3）、`npm run typecheck` 退出 0、`git diff --check` 干净、全量 0 新红；真实 bundled CLI 回环 probe 6/6（三相位：开/侧查询 400/关对照；实证 PreToolUse 对内置 WebSearch 分发、侧查询无 web-search beta 头、400 后 beta 回退重试一次）。客户真网关 side-query 与桌面行呈现未验。见[实施记录](docs/fix/2026-10-16_impl_web-search.md)。

2026-10-16：G-4 注入节拼接（I4 三适配器接线·Claude 侧）＋ V2 MCP P0 探针（评估轮）。①注入节：`session.ts` 系统提示拼装末段条件拼接 `renderInstalledSkillsSection(options.projectRoot, role.id)`（编排单一来源、两参同步调用；非空整段**逐字**、空串零渲染、无尾随换行；composeContext 与引擎构造同源）。33/33（+1：登记命中逐字拼接/未登记逐字现状/坏件零渲染不毁轮次）；全量 1814 计 / 1813 过 / 0 红 / 1 skip（派发登记的他角色 4 处预期红本快照未复现，其属主已同步）；typecheck 0、`git diff --check` 0。②P0 探针（零产品改动，14 相位真 bundled CLI 2.1.299 回环）：`mcp_server.source`＝**`dynamic`**；hook-allow 短路 canUseTool（**`:239` deny-all 不需动**，负对照证 canUseTool 全程零咨询，未决调用走 auto 分类器）；MCP 子进程 env **未按 MCP SDK 默认收窄**（继承 CLI env，含 `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/messaging token——安全面反证）；`mcpServerStatus()` 失败条目形状定格（ENOENT/Request timed out，皆不毁会话）；`alwaysLoad` 与本组成无可观测差异、挂起 initialize 的释放界 ＝**~27.0-27.1s**（非文档的 5s）；`allowedTools` server 级/工具级均自动放行。见[探针记录](docs/fix/2026-10-16_probe_mcp-surface.md)。未验：HTTP/SSE server、工具级 timeout、tool search 组合、真网关分类器。
