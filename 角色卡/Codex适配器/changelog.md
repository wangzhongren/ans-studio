# Codex适配器变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组员。角色定义已按会话授权落盘；应用开发和测试尚未完成。

- 2026-10-14 X1：实现 Codex app-server 动态 ANS 代理与内存 MCP、有效配置/目录隔离、原轮信号、中止/超时、恢复与共享凭据脱敏；自有 14 项测试和自有严格类型检查通过。真实 alpha 无模型配置/schema 探针通过；稳定 0.162.1 和全仓依赖联调待装配。详见 [实施记录](docs/change/2026-10-14_change_codex-governed-session.md)。

- 2026-10-14 X1S：修复可选 API 地址空白错误，显式空白选官方默认，显式非空继续覆盖环境；验证 model/base/key/脱敏使用同一捕获结果。当前 16/16 自有测试、全仓 tsc0；稳定探针此前由装配通过，本次没有重跑或改运输。详见[修复](docs/fix/2026-10-14_fix_blank-base-url-default.md)。


- 2026-10-15：Codex真实工具展示投影、required/profile与模型输入保持接线完成；22/22及固定CLI本地回环通过，全仓类型检查通过。[实施记录](docs/change/2026-10-15_change_tool-display-projection.md)。

- 2026-10-16 EBUSY 收尾修复：CI Windows 仅 1 红（实际原生进程用例收尾 `rmdir …\ans-codex-…\work` 报 EBUSY）定位到本角色 session.ts `cleanup()`（清理逻辑不在测试本地 helper）——`nativeEngine` 新增等 `'close'`（进程退出＋stdio 管道全关）后 `cleanup()` 才删目录，删除改经 `src/common/shared/atomic-write.ts::retryOnTransient` 有界重试（仅 EBUSY/EPERM/EACCES、≤200、setImmediate；非瞬时立即抛）。测试文件零改动零 skip、断言零放松；25/25、tsc0、原语自测16/16；darwin 无法复现 EBUSY，Windows 侧待 CI 复跑。见[修复](docs/fix/2026-10-16_fix_native-teardown-ebusy.md)。

- 2026-10-16 G-3 联网搜索实施（R1，客户批准「按推荐批准，开始实施」，实施规格＝本角色提案）：能力位默认关＋`ANS_CODEX_WEB_SEARCH`（on|off 白名单）＋options `webSearch` 显式优先；开启＝三钉同翻（线程配置/进程 `-c`/回读期望 `web_search:"live"`），落点键经 T3 回环矩阵实证（顶层键注入 `{"type":"web_search","external_web_access":true}`；`[tools].web_search` 不注入）；`item/completed` `webSearch` → `联网搜索：<query>` message 行＋detail v1（容错、cap 20、不进隔离、恒映射），settled 附 `searchCalls`。自有 33/33（新 8）、typecheck0、全量 0 fail/0 新红；pinned CLI 0.162.1 假 SSE 端到端绿（外部模型 0）。真实网关接受性未验（客户探针 P1–P3 清单在案），桌面UI 行样式跨边界待排发。见[实施记录](docs/change/2026-10-16_change_web-search.md)、[提案](docs/fix/2026-10-16_proposal_web-search.md)、[证据](docs/change/2026-10-16-web-search-evidence/manifest.json)。


- 2026-10-16 G-4 I4 注入节拼接（Codex 侧接线；接口契约＝编排 `角色卡/编排/docs/change/2026-10-16_change_g4-skill-injection-and-preauth.md` §五）：`src/provider/codex/session.ts:17` 新 import＋`:241-250` composeContext 末段拼接 `renderInstalledSkillsSection(projectRoot, role.id)`（两参默认调用；非空整段逐字拼入、空串零渲染；既有系统提示逐字不变）；`test/codex-adapter/session.test.ts:44` 新增 1 例（零技能/坏件⇒逐字不变且会话照开；命中⇒sha256 测试端独立复算＋整段逐字追加；假 engine 路径 `thread/start.developerInstructions` 与 compose 同源一致）。35/35、tsc0；未提交。

- 2026-10-16 MCP 面 P0 探针（G-4 V2 前置，客户批准的探针轮；对上评估文 §九.2）：pinned 0.162.1 真 app-server＋本地夹具＋loopback 假 SSE，14 单元格 18/18 自检过（exit 0），外部模型 0。逐项：①全字符串 `JSON.stringify` 编码的 root map 全字符逐字往返（含带空格/内嵌引号键名、空串 arg；**连续两条 -c 同根键＝后者整体覆盖不合并**）；②模型面＝`type:"namespace"` 桥（`mcp__<server>`，`function_call` 带 name+namespace 双字段回传），轮内 item＝`mcpToolCall`（item/started|completed，字段全集＋result 原样 content blocks；直呼不产 item）；③**默认姿态调用被核内拒**（"MCP tool call requires approval, but approval policy is never"）；`default_tools_approval_mode` 枚举 auto|prompt|writes|approve，**仅 approve 可执行**；非 ANS 姿态（on-request+prompt）审批经既有 `mcpServer/elicitation/request`（`_meta.codex_approval_kind:"mcp_tool_call"`；cancel⇒"user cancelled MCP tool call"）——无独立审批方法、ANS 姿态零 server request、零 fail-closed 命中；④坏 server：`mcpServer/startupStatus/updated` starting→failed＋catalog `runtimeStatus:"failed"`（**仍在 data**）＋线程/轮次照常；⑤MCP 子进程 env＝配置 env＋注入 PATH（＋darwin `__CF_…`），**无 CODEX_API_KEY/CODEX_HOME**；⑥per-call 超时＝`tool_timeout_sec`（0.25s 上限复跑实测 253–258ms 生效；启动键 `startup_timeout_sec` 同 struct）。P2 增补 7 条（单条合并编码、恰等按名字集、approve 键、namespace 网关接受性未验为前置等）。见[探针记录](docs/change/2026-10-16-probe_mcp-surface.md)＋[证据](docs/change/2026-10-16-mcp-surface-evidence/manifest.json)。
