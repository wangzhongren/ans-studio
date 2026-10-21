# 独立验收工作线索

- 当前新任务 ANS-REASONING-LIGHT D1：批准 SHA-256 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09` 已核对；[R2 标准](docs/design/2026-10-21_design_reasoning-light-criteria.md)保留 V1–V8 并按用户“允许加入 E1，补齐兼容”追加 Codex 目录内模型兼容证据。UI 只意见，真实 SDK/CLI localhost 必需，不新增全 OS 或线上模型门槛。

- 固定角色：独立验收；2026-10-21 读取并采用自身 boundary.md Section 1。
- D3 批准 SHA-256：`a81908e2486f88cacb4efe284dc030cd888e11c99619099def30217771b71e77`，已本机核对。
- [实施前标准 C2](docs/design/2026-10-21_design_d3-acceptance-criteria.md)已就绪；按后续用户明确指令撤出 UI 应用/测试和 Electron 验证，AC8 为 README 修正与 UI 意见交接，其余 AC 不变。等待可信启动端交付同一候选的共享、门禁、核心、README/UI 意见及非 UI 独立测试证据后审验。
- Windows 原生证据不足不能用 macOS 或 skipped 代替；保留 D3 对 PATH、隐藏配置、恶意并发替换的轻量取舍。
- 产品/UI 平台化文档属于同期其他工作，不纳入 D3 候选。
- 未建立 task_ops 执行记录，本角色不虚构凭据或机器放行。
- [D3 分项审验](docs/fix/2026-10-21_verify_d3-lightweight-repairs.md)：五生产文件摘要匹配 owner 报告，未发现生产返工；UI 意见文档已按 C2 修正。t9 同源断言由一次更新为两次同目标，最终 QA manifest 与回归已核对。

- 最终已核对当前配置全量 3398 项（3396 过、0 失败、2 Windows 跳过）与 typecheck 退出 0；独立复算 558 个候选文件摘要零差异、日志摘要吻合。macOS 非 UI C2 分项通过，Windows 原生 missing-evidence，报告未授权发布。
