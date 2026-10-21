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

- UI 平台 Phase 5 独立验收（2026-10-21 完成判断，含 AC3/AC8 补正重判）：候选 HEAD `224cf83` + 冻结工作树、入口 `app/renderer/dist/index.html`、包 `edeeef19…`；独立复算 dist/ZIP、四份 manifest（191/246/185/13 项 OK）、397 名双端对照、final3 台账 380 行值比对 0 不匹配、UIUX 128 PNG。**总体 pass（AC1–AC8 全过）**：AC3 记录旧 uiux 套件版本限制（`d568bf82…` vs `fa3f74d4…`；424 个旧通过名 0 缺失/0 回归，不再声称同套件源码）；AC8 补正契约面/产品复核/无关改动分离/F1 台账/F6 计数/F7 probe 后，由本角色独立 378 文件候选清单 + 16 DELETED 补齐并提供方 core-sha 仅 10 文件的冻结清单问题关闭；包内 app 123 文件与工作树 0 差异。AC4 三官方 check 5A/5B 均 true；AC5 质量门 typecheck/build/CSP/gzip 288,530–289,095B/142 单测/504 旧基线/IME 26/懒挂载 10/bench/C1 20 全过；test/测试 714/715 唯一红为本机无真实 `rg`（ENOENT，环境红，未 skip，不属产品门）。剩余非阻塞：`.ti-badge` 死 CSS 待清理、装配 CSS 85B 归因说明、产品提案/复核的「补正中」时点措辞。六类真实模型/Windows/签名/发布/Linux/真实通道本轮未判。报告 [docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md](docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)；验收不授权提交/发布，发布决定属客户。
