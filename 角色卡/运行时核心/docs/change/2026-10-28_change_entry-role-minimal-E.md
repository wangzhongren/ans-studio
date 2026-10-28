# entry-role-minimal 批次 E 变更记录（运行时核心）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：E（UI 对话框）｜风险档位：**T3**
- 实施提交：`e7ac5b2`；最终文档提交见最终报告。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-E.md`（73 行；最终字节哈希见最终报告）。

## 范围

本批无运行时契约变更；任务/日志数据面沿用 B 批类型。

## 文件 / 测试

- 文件：无生产文件改动。
- 测试：全量回归覆盖 runtime-core；无新增失败。

## 验证摘要

- 全量：**2902 tests / 2872 pass / 12 fail / 18 skip**；D 基线 2880/2850/12/18 ⇒ +22 tests/pass，新增确定性失败 0、无新 skip；12 fail 均为基线既红。
- E 专项：决策对话框/队列/无障碍/待办历史/任务日志/i18n/接线测试全过（28 tests 主专项 + 既有 UI guards）。
- 静态：`typecheck` / `typecheck:renderer` / `build:renderer` exit 0。
- Electron：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空；17 PNG + 00-titlebar 环境性 UnknownVizError；phase3b/phase5a smoke 全过（phase5a 17/17）。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0。

## 风险 / 备注

- shell/恢复确认保持独立高风险模态；决策对话框在其活跃时隐藏，避免双模态。
- `app/desktop/interface.ts` / `app/desktop/session.ts` 仍有 `@ts-nocheck` 过渡死代码；E 已删除 interface 的 3 个旧入口方法，F 前必须清完并移除标记。
- 不 push/合 main；package/lock 零改动；F 批 optional-acceptance 未提前。
