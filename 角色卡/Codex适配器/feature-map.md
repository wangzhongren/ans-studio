# Codex适配器功能导航

- [使用 Codex 执行受治理角色会话](docs/feature/codex-governed-session.md)：使用 Codex ANS 代理和真实 MCP，保留工具门禁、原轮中止与隔离恢复。当前自有22/22、固定CLI本地假服务回环通过；required/profile与真实工具投影已接入。全仓类型检查通过，在线与桌面最终联调由后继角色接续。

本角色属于运行时接入组，本次开发沿用客户既有授权；[接口和原证据](api-spec.md)说明实际依赖、配置与验证范围。


- [外来 MCP 白名单化（G-4 V2/P2）](docs/change/2026-10-16_change_g4-v2-mcp-whitelist.md)：`installedMcpServers` 纯消费——白名单定义＋禁用集单条 `-c mcp_servers={…}`（approve＋per-call 超时）、三处恰等（进程/线程/目录名字集）、`mcpToolCall` 行映射与坏 server 降级行；真 CLI 0.162.1 编码器校验绿。真实网关 namespace 桥接受性与真机 E2E 属验收轮。

- [推理强度与推理事件（G-5 wave 2）](docs/change/2026-10-16_change_g5-reasoning-effort.md)：请求面四档 `-c model_reasoning_effort`（off/未设零注入＋如实行）；推理完成态 item 恰一行事实（增量零行、不隔离、durationMs 真实信号）；网关拒绝 ⇒ 保守识别＋恰一次去参数重发（重建进程）。探针记录见 [probe_reasoning-surface](docs/change/2026-10-16-probe_reasoning-surface.md)。真实网关接受面属验收轮。

- 整轮最后兜底（2026-10-17）：Codex 不再无整轮上限——`promptTimeoutMs` 仅作看护到点检查（不中止），整轮上限＝`turnLastResortMs`（缺省 1 小时，运行时核心常量；确认卡等待期间暂停）。到点中止的 failure/settled 文案写「最后兜底」，与到点检查区分；outcome 仍 `timed_out`。见 [changelog](changelog.md)。

- [治理 judge 会话（「替我审批」/「替我决策」，P3c）](docs/change/2026-10-18_change_codex-governance-judge.md)：`judgeMode` 复用——allowlist 改为运行时核心并集 `ALL_JUDGE_TOOL_NAMES`，只接受 shell 或治理任一冻结三工具集；治理会话恰注册 `judge_read_file`/`judge_list_dir`/`report_governance_judgement`，系统提示点名治理 report；web search/MCP/持久化/写与交互面结构性关闭，原生泄漏隔离；shell 工具面与普通会话逐字不变。离线测试覆盖并集 allowlist/拒绝矩阵、report 原样回调、隔离与普通模式不回归。

- [思考等级安全兼容 D1 候选](docs/fix/2026-10-21_fix_reasoning-compatibility.md)：精确拒绝识别、同线程目录默认、必要重建清ID、成功才确认策略与失败后恢复、工具 started 阻止重放。替代此前宽泛词匹配和提前成功提示；目录内模型原生自动补 effort 的字段拒绝仍有真实红例，整体验收尚未完成。

- 2026-10-21 E1 已由用户批准：在同一个无effort候选内，按固定SDK当前模型元数据生成临时0600副本，解决目录内模型自动补默认；普通路径零覆盖，失败/取消下一轮先恢复原目录。原D1红日志保留，E1结果见同一修复记录。

- D1+E1 所有者最终结果：80/80自有回归、20/20真实CLI localhost矩阵、全仓typecheck0；原gpt-5.5红例与最终绿例分开保留。固定版本内嵌目录来源及既有限制见[同一修复记录](docs/fix/2026-10-21_fix_reasoning-compatibility.md)，独立验收由对应角色继续。
