# Claude适配器变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组员。角色定义已按会话授权落盘；应用开发和测试尚未完成。

# 变更记录

2026-10-14：实现 ANS Claude Provider、完整 schema MCP 注册、连续轮次、停止/超时/恢复和精确 native 目录隔离。实际 SDK 临时环境 17/17、targeted 类型检查通过；正常项目依赖及整仓验证待装配。见[实施证据](docs/change/2026-10-14_change_claude-runtime.md)。

2026-10-14 A1V：实际原生回环验证发现并修复bare抑制SDKhooks、nativeprompt_id不能直接等于SDKuuid以及环境profile引用变化。正式20/20、真实native探针和整仓类型检查通过，见[修复证据](docs/fix/2026-10-14_fix_claude-native-hook-identity.md)。

2026-10-15：CLAUDE-A-1按批准A4/C2.tp1/consumer2实施。生产required-v1工具投影、同快照profile登记、原始hook关联与SDK内容保护；28/28、tsc及真实本地native回环通过，未做在线/桌面验收。见[实施证据](docs/change/2026-10-15_change_tool-display-projection.md)。

2026-10-16：G-3 路径联网搜索接入按客户批准的提案（期1）实施。`ANS_CLAUDE_WEB_SEARCH` 默认关（关时逐字旧行为）；开时 `tools/allowedTools` 声明内置工具、PreToolUse 放行分支（必需项：hook deny 先于 allowedTools；不注入 `updatedInput`）、消息泵 `native-start`/`native-result`（失败如实、不毁轮次）。32/32（+3）、`npm run typecheck` 退出 0、`git diff --check` 干净、全量 0 新红；真实 bundled CLI 回环 probe 6/6（三相位：开/侧查询 400/关对照；实证 PreToolUse 对内置 WebSearch 分发、侧查询无 web-search beta 头、400 后 beta 回退重试一次）。客户真网关 side-query 与桌面行呈现未验。见[实施记录](docs/fix/2026-10-16_impl_web-search.md)。

2026-10-16：G-4 注入节拼接（I4 三适配器接线·Claude 侧）＋ V2 MCP P0 探针（评估轮）。①注入节：`session.ts` 系统提示拼装末段条件拼接 `renderInstalledSkillsSection(options.projectRoot, role.id)`（编排单一来源、两参同步调用；非空整段**逐字**、空串零渲染、无尾随换行；composeContext 与引擎构造同源）。33/33（+1：登记命中逐字拼接/未登记逐字现状/坏件零渲染不毁轮次）；全量 1814 计 / 1813 过 / 0 红 / 1 skip（派发登记的他角色 4 处预期红本快照未复现，其属主已同步）；typecheck 0、`git diff --check` 0。②P0 探针（零产品改动，14 相位真 bundled CLI 2.1.299 回环）：`mcp_server.source`＝**`dynamic`**；hook-allow 短路 canUseTool（**`:239` deny-all 不需动**，负对照证 canUseTool 全程零咨询，未决调用走 auto 分类器）；MCP 子进程 env **未按 MCP SDK 默认收窄**（继承 CLI env，含 `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/messaging token——安全面反证）；`mcpServerStatus()` 失败条目形状定格（ENOENT/Request timed out，皆不毁会话）；`alwaysLoad` 与本组成无可观测差异、挂起 initialize 的释放界 ＝**~27.0-27.1s**（非文档的 5s）；`allowedTools` server 级/工具级均自动放行。见[探针记录](docs/fix/2026-10-16_probe_mcp-surface.md)。未验：HTTP/SSE server、工具级 timeout、tool search 组合、真网关分类器。

2026-10-16：G-4 V2 P1（Claude）外来 MCP 接入实施（按 P0 探针结论＋PM 派发；契约由运行时核心 wave A 已落盘，本批纯消费）。①装配：`installedMcpServers` 非空 ⇒ 逐项入 `mcpServers`（与 `ans` 并列；`alwaysLoad:true`＋`INSTALLED_MCP_TOOL_TIMEOUT_MS=60000` 定值；`strictMcpConfig` 不变），`allowedTools` 加 server 级 `mcp__<name>`。②**env 收窄**（P0 实锤子进程全量继承）：新增 `src/common/claude-adapter/mcp-launcher.mjs` 命令包装器——CLI 只见 launcher，真命令以「基线定位键＋恰为声明键的白名单」重 spawn；`asar:false` 明文分发、Electron 态 `ELECTRON_RUN_AS_NODE=1`；回环实测子进程 env 恰 8 键、`ANTHROPIC_API_KEY` 等全部缺席。③放行分支：名命中已安装集＋`source==="dynamic"`（P0 实值）＋前缀一致＋轮次活性 ⇒ allow、不发 `updatedInput`；`:239` `canUseTool` 未动（P0：hook-allow 不经它）。④审计：hook `native-start` 行＋消息泵 `nativeCalls` 配对（`toolName` 泛化，WebSearch 路径逐字等价）；`mcpServerStatus` failed/needs-auth 每引擎一次如实一行（仅类别、不落正文）。测试 40/40（+4：装配/放行对抗九例/配对/状态面；+3：launcher 边界新文件：env 收窄/名单损坏宁窄/退出码与 127）；新增常备回环探针 `mcp-installed-loopback.probe.ts` 3 相位全绿（execute 端到端＋broken 行＋hang ~27s 释放）；typecheck 0、diff-check 0、全量 1931 计/1922 过/8 红（全部 test/测试/ 旧钉待翻新——V2 并行批次所致、本批文件零命中，见记录 §四）。见[实施记录](docs/fix/2026-10-16_impl_mcp-install.md)＋[证据目录](docs/fix/2026-10-16-mcp-installed-evidence/)。未验：真网关/真 server、Electron 打包实跑、Windows `.cmd`、名清洗碰撞、挂起 server 状态行时点。
