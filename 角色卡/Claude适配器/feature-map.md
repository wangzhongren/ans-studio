# Claude适配器功能导航

| 功能 | 用途 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| Claude 会话 | 选择 Claude 后沿用 ANS 工具、确认、停止和会话隔离 | 正式包20/20、原生回环探针及整仓类型检查通过；项目集成待验收 | [当前流程](docs/feature/claude-session.md) |
| 联网搜索（Claude 路径，G-3） | 能力位默认关；开启后角色可经内置 WebSearch 联网搜索 | 已实施待验证：32/32、类型检查与本地回环 probe 通过；客户真网关/桌面呈现待验 | [实施记录](docs/fix/2026-10-16_impl_web-search.md) |
| 整轮到点检查 + 最后兜底 | 检查时限只供看护（不中止）；整轮有效运行到 1 小时才中止 | 已实施：session 测试更新（缺 SDK 环境红如实登记），mcp-launcher 3/3；待装配环境复跑 | 错误 `TURN_LAST_RESORT`；见 [评审](../../项目管理/docs/design/2026-10-17_design_turn-watch-and-recover-review.md) |
| 判断模式（shell「替我审」/ 治理卡「替我审批·替我决策」，P3a） | `judgeMode` 下只注册只读三件套；两套三件套（shell/治理）由 `ALL_JUDGE_TOOL_NAMES` 统一 allowlist，强制关闭 WebSearch/外来 MCP | 已实施：`test/claude-adapter` 54/55（唯一红＝既有 Windows symlink EPERM）；全量三层 glob 结果见 [变更记录](docs/change/2026-10-18_change_governance-judge-p3a.md) | 见 [api-spec 判断模式](api-spec.md)；评审 [双开关](../../项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md) |
| 工具结果附图（`view_image` 同轮可见，2026-10-27） | `ToolResult.images` → MCP image 内容块（png/jpeg/gif/webp，原引用）；失败/非法载荷零附图、诚实注记 | 已实施：单测 8/8 + MCP 回环 1 例 + 真实 Pi 网关/模型探针通过；policy 仍 `next-turn`，翻表属运行时核心 | [变更记录](docs/change/2026-10-27_change_tool-result-images-claude.md) |
