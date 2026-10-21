# 独立验收工作导航

本角色无产品系统功能，不实现业务代码、测试或共享 API。维护范围是验收标准、证据核对与独立结论。

- [职责与交接](functional-description.md)
- [D3 轻量修复验收标准 C2](docs/design/2026-10-21_design_d3-acceptance-criteria.md)：按用户指令将 UI 实施/测试撤出，仅交接意见；最终分项结论见下。
- [工作线索](memo.md)
- [思考等级轻量兼容标准 R2](docs/design/2026-10-21_design_reasoning-light-criteria.md)：保留 D1 八条验证，追加已批准 E1 目录内模型兼容；真实 SDK/CLI localhost 必需，UI 仅意见；待实施证据。
- [UI 平台 Phase 5 验收标准 A1](docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md)：按 PM §16.5 在 5A/5B 交付前固定候选身份、AC1–AC8、双端逐 check 名对照、三态判断与 missing-evidence 边界。
- [UI 平台 Phase 5 独立验收报告](docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)：对 5B 冻结候选（HEAD `224cf83` + 工作树，入口 `dist/index.html`）按 A1 逐条判断；**总体 pass**——AC1–AC8 全部满足；AC3 记录旧 uiux 套件版本限制（424 个旧通过名 0 回归），AC8 由独立 378 文件候选清单补齐；六类真实模型/Windows/签名/发布/Linux/真实通道本轮未判。补正证据见同目录 `2026-10-21-phase5-acceptance-evidence/`。

[D3 最终分项审验报告](docs/fix/2026-10-21_verify_d3-lightweight-repairs.md)：macOS 非 UI C2 范围通过，Windows 原生证据不足。`api-spec.md` 不适用：无导出软件能力或装配契约。
