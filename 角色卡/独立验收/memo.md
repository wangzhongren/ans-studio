# 独立验收工作线索

- 2026-10-22 桌面UI「思考行显示修复 R1–R5」独立验收完成：对判定候选 HEAD `4d944e75` + 工作树（期间快照提交为 `6e51589`，内容一致）判定 **pass（受限）**；独立复跑 reasoning-view 15/15、桌面UI 162/162、桌面应用 506/506、双 typecheck 0、Electron e2e 14/14（截图与角色证据 SHA-256 一致）、Phase3B/4B 通过；真实 Pi 样本 3 个 complete 正文 335/1403/1153。Phase4A/5A 焦点/时序冒烟在离屏环境失败（非本变更路径，不计通过）；真机重建/重启 UI、持久化、其他引擎、O1–O7 未判。报告：[docs/change/2026-10-22_change_reasoning-display-fix-acceptance.md](docs/change/2026-10-22_change_reasoning-display-fix-acceptance.md)。

- 2026-10-22 桌面UI「思考行显示修复 R1–R5」：[验收标准 A1](docs/design/2026-10-22_design_reasoning-display-fix-acceptance.md) 已就绪；设计现为 accepted/revision 1、文末状态已收尾（当前 SHA-256 `e02c9594…`），实施刚并行启动、候选未冻结。关键判据：正文取自 `detail.reasoning.text.text` 非 summary、按 turnId 一回合一行且在终态之前、实时/回放同解、omitted 明确「平台省略了思考正文」、坏件 fail-closed、默认折叠；E7 需真实 Pi wire 样本区分「有正文」/「平台省略」。待实现变更记录、单测、Electron e2e、typecheck/build 证据后按 A1 判定。

- 2026-10-22 共享治理 slug 收紧（禁止尾连字符，S1–S5）独立验收完成：对冻结候选 HEAD `4d944e75` + 工作树判定 **pass（受限）**；独立复跑 typecheck 0、runtime-core 34/34、编排 78/78+87/87+32/32、门禁 49/49、e2e 60/60、装配 11/11；全量 3398 计/3371 过/9 既有 EPERM/18 skip，write-sequencing 按客户决定排除。报告：[docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen-acceptance.md](docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen-acceptance.md)。非阻断残差：根 changelog 未追加、E7 多段/穿越路径模式级证据、candidate.txt 缺产品哈希（报告补算）、设计 §4.1 `f` errata。真实项目审计/真机/真实模型/UI/非 Windows/重启/O1–O4 未判。

- 2026-10-22 共享治理 slug 收紧（禁止尾连字符，S1–S5）：[验收标准 A1](docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen-acceptance.md) 已就绪；写作时 S1 已落盘 Model 常量、S2–S5 待派发、候选未冻结。待各角色变更记录与测试证据后按 A1 判定；旧守卫 F2/§7.3 的尾连字符开放口径由本变更关闭，历史报告不回改、由新报告引用。设计 §4.1 把单字符 `f` 列为合法 slug 属文字误差，标准正例未采用。

- 2026-10-22 后台任务 B1–B4：按 A1 对 HEAD `4d944e75` + 工作树判定 **pass**（Windows 11、运行时核心单测/契约与真实 Pipeline→Service→只读档 ShellGate 装配范围）；B1–B4/S1–S6/F1–F10/CC1–CC3/E1–E7 全部满足。P3-1 文档已修正；P3-2（bindRole 失败后同 adapter 重试复用已关闭管理器）fail-closed、非阻断已知边缘。真实 CLI/桌面+真实模型、非 Windows、真实不可杀进程、O5 退出残留未判。报告：[docs/change/2026-10-22_change_background-tasks-acceptance.md](docs/change/2026-10-22_change_background-tasks-acceptance.md)。

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
