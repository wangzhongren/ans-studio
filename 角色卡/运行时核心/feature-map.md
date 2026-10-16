# 运行时核心功能导航

本角色属于运行时接入组，维护三种引擎共用的会话和治理工具契约。

| 功能 | 用途 | 当前状态 | 文档 |
| --- | --- | --- | --- |
| 同一套治理工具与隔离会话 | 选择引擎后继续使用同一个写前门禁，并按角色/引擎保留 ANS 回放 | C1 已实现及无网络验证；最终适配器/入口接线待原属主验证 | [当前流程](docs/feature/runtime-core.md) |
| 看护三工具（G-2/R1+R2） | su 只读核对（role_status 状态快照 / session_tail 会话尾线）＋恢复提议 propose_recovery（**提议 ≠ 执行**，客户一键确认后由应用执行） | 工具层与能力位已实施待验证；编排 O1 透传已落，端到端可用性待桌面窗口 W1/W4/W5 注入收口（未注入 ⇒ 不注册） | [fix 记录](docs/fix/2026-10-16_fix_g2-status-tools-recovery.md) |
| 技能安装/卸载工具（G-4 V1·I1/I2） | su 对目标角色 install_skill / uninstall_skill：**校验＋激活＋回执、工具不写盘**（先落盘再激活；仅客户明示；不改变任何角色写边界）＋ `request_confirmation` 预授权目录陈述三棵同步 | 工具层与能力位已实施待验证；桌面 I3 handler 未落 ⇒ 当前不注册（fail-safe）；端到端待 I3/I4 与独立验证 | [fix 记录](docs/fix/2026-10-16_fix_g4-install-skill-tools.md) |

