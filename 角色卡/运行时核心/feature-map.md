# 运行时核心功能导航

本角色属于运行时接入组，维护三种引擎共用的会话和治理工具契约。

| 功能 | 用途 | 当前状态 | 文档 |
| --- | --- | --- | --- |
| 同一套治理工具与隔离会话 | 选择引擎后继续使用同一个写前门禁，并按角色/引擎保留 ANS 回放 | C1 已实现及无网络验证；最终适配器/入口接线待原属主验证 | [当前流程](docs/feature/runtime-core.md) |
| 看护三工具（G-2/R1+R2） | su 只读核对（role_status 状态快照 / session_tail 会话尾线）＋恢复提议 propose_recovery（**提议 ≠ 执行**，客户一键确认后由应用执行） | 工具层与能力位已实施待验证；编排 O1 透传已落，端到端可用性待桌面窗口 W1/W4/W5 注入收口（未注入 ⇒ 不注册） | [fix 记录](docs/fix/2026-10-16_fix_g2-status-tools-recovery.md) |
| 技能安装/卸载工具（G-4 V1·I1/I2） | su 对目标角色 install_skill / uninstall_skill：**校验＋激活＋回执、工具不写盘**（先落盘再激活；仅客户明示；不改变任何角色写边界）＋ `request_confirmation` 预授权目录陈述三棵同步 | 工具层与能力位已实施待验证；桌面 I3 handler 未落 ⇒ 当前不注册（fail-safe）；端到端待 I3/I4 与独立验证 | [fix 记录](docs/fix/2026-10-16_fix_g4-install-skill-tools.md) |
| 外来 MCP 安装契约层（G-4 V2·wave A） | 按角色装配的外来 MCP 声明面：`InstalledMcpServerV1`（stdio 限定）＋声明读取单一来源 `docs/mcp/<name>.md`（`readMcpDeclaration`/`listInstalledMcpServers`，坏件绝不影响开会话）＋ Service 注入 `RuntimeProviderOptions.installedMcpServers` ＋ su 工具 `install_mcp`/`uninstall_mcp`（校验＋激活＋回执、不写盘；门禁之外执行＝能力级授予如实口径）；`request_confirmation` 预授权目录陈述四棵同步 | 契约/读取器/注入/工具面已实施待验证；桌面 handler 与三平台装配（P1–P3）未接线 ⇒ 工具当前不注册（fail-safe toward 现状） | [fix 记录](docs/fix/2026-10-16_fix_g4-mcp-contract-layer.md) |
| 推理与推理强度契约层（G-5·wave 1） | 请求面：中立档位 `ReasoningEffortV1`（off/low/medium/high/xhigh）＋ `RuntimeProviderOptions.reasoningEffort`（Service 按运行时读 `ANS_{CLAUDE,CODEX,PI}_REASONING_EFFORT` 归一注入；未设＝字段缺席＝逐字现状；坏值＝按未设＋诊断，绝不毁会话）。呈现面：推理事实通道三段式——适配器产 `RuntimeReasoningFactsV1` → 核心投影单点 `projectReasoningDetail`（脱敏＋预算＋summary 定格＋幂等＋坏件诊断）→ 冻结点 `RuntimeReasoningDisplayDetailV1`（供桌面/回放渲染「已思考 N 秒 ▸」类折叠行） | 契约/归一/Service 注入/投影单点已实施待验证；三适配器原生接线（wave 2）与桌面渲染未接线 ⇒ `reasoningEffort` 暂无人消费、reasoning 事实暂无人产出（通道休眠＝零行为变化） | [fix 记录](docs/fix/2026-10-16_fix_g5-reasoning-contract-layer.md) |
| 整轮两层时限：到点检查＋1 小时最后兜底（2026-10-17 客户裁定） | `promptTimeoutMs`（`ANS_PI_PROMPT_TIMEOUT_MS`，历史字段名，**所有运行时同读**，系统默认 **300000＝5 分钟**）改为**到点检查时限**——只供看护到点检查，**不中止整轮**；新增固定 `DEFAULT_TURN_LAST_RESORT_MS=3600000`＋可选 `turnLastResortMs`（测试/宿主注入，不暴露 env）作为唯一自动整轮上限；`resolveRuntimeTimeouts` 返回 `{promptTimeoutMs,turnLastResortMs,constructTimeoutMs}`；Service 整轮 `withPausableTimeout` 用最后兜底、label「本轮最后兜底」、settled 摘要「本轮超过最后兜底，已中止」；`InteractionGate` 暂停语义不变；shell 600000/确认 120000/构造 120000 不变 | 本角色（常量/resolver/Model 字段/Service 整轮包装/测试）已实施待验证；适配器/看护/设置/门禁文案由各自属主并行接线；跨角色集成与端到端验收未完成 | [PM 评审](../项目管理/docs/design/2026-10-17_design_turn-watch-and-recover-review.md) |

