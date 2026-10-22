# 独立验收工作导航

本角色无产品系统功能，不实现业务代码、测试或共享 API。维护范围是验收标准、证据核对与独立结论。

- [职责与交接](functional-description.md)
- [D3 轻量修复验收标准 C2](docs/design/2026-10-21_design_d3-acceptance-criteria.md)：按用户指令将 UI 实施/测试撤出，仅交接意见；最终分项结论见下。
- [工作线索](memo.md)
- [思考等级轻量兼容标准 R2](docs/design/2026-10-21_design_reasoning-light-criteria.md)：保留 D1 八条验证，追加已批准 E1 目录内模型兼容；真实 SDK/CLI localhost 必需，UI 仅意见；待实施证据。
- [UI 平台 Phase 5 验收标准 A1](docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md)：按 PM §16.5 在 5A/5B 交付前固定候选身份、AC1–AC8、双端逐 check 名对照、三态判断与 missing-evidence 边界。
- [UI 平台 Phase 5 独立验收报告](docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)：对 5B 冻结候选（HEAD `224cf83` + 工作树，入口 `dist/index.html`）按 A1 逐条判断；**总体 pass**——AC1–AC8 全部满足；AC3 记录旧 uiux 套件版本限制（424 个旧通过名 0 回归），AC8 由独立 378 文件候选清单补齐；六类真实模型/Windows/签名/发布/Linux/真实通道本轮未判。补正证据见同目录 `2026-10-21-phase5-acceptance-evidence/`。
- [后台任务 B1–B4 验收标准 A1](docs/design/2026-10-22_design_background-tasks-acceptance.md)：按客户确认的设计必需项 B1–B4 在实施前固定成功 S1–S6、失败与边界 F1–F10、su 三条核对点 CC1–CC3、证据 E1–E7 与三态判断；明确排除 O1–O5，只定标准，未验收任何候选。
- [后台任务 B1–B4 独立验收报告](docs/change/2026-10-22_change_background-tasks-acceptance.md)：对候选 HEAD `4d944e75` + 工作树按 A1 逐条判定；**总体 pass**——B1–B4、S1–S6、F1–F10、CC1–CC3、E1–E7 全部满足（Windows 11、运行时核心单测/契约与真实 Pipeline→Service→只读档 ShellGate 装配范围）；P3-1 已修正，P3-2 为非阻断已知边缘；真实入口+真实模型、非 Windows、真实不可杀进程、O5 退出残留未判。

- [共享治理 slug 收紧（禁止尾连字符）验收标准 A1](docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen-acceptance.md)：按客户确认的 S1–S5 固定新正则 `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`、单一来源、旧值显式拒绝、N1–N5 零回归与 E1–E8；O1–O4 均不选；只定标准，未验收任何候选。
- [共享治理 slug 收紧（禁止尾连字符）独立验收报告](docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen-acceptance.md)：对冻结候选 HEAD `4d944e75` + 工作树按 A1 逐条判定；**总体 pass（受限）**——S1–S5、S1–S12、F1–F12、E1–E8 满足；独立复跑 typecheck 0、七组定向全过；全量 3398 计/3371 过/9 既有 EPERM/18 skip，write-sequencing 按客户决定排除；根 changelog 未追加、E7 多段/穿越路径模式级证据为非阻断残差；真实项目审计/真机/真实模型/UI/非 Windows/重启/O1–O4 未判。
- [思考行显示修复 R1–R5 验收标准 A1](docs/design/2026-10-22_design_reasoning-display-fix-acceptance.md)：按设计 accepted/revision 1 固定 R1–R5（展开见投影正文、按 turnId 归组、时长/四态文案、省略如实、实时/回放同解）的成功/失败/边界、E1–E8 与三态判断；O1–O7 均不选；只定标准，未判定实现。

[D3 最终分项审验报告](docs/fix/2026-10-21_verify_d3-lightweight-repairs.md)：macOS 非 UI C2 范围通过，Windows 原生证据不足。`api-spec.md` 不适用：无导出软件能力或装配契约。
