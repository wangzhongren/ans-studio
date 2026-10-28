# entry-role-minimal 批次 E 变更记录（桌面窗口）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：E（UI 对话框）｜风险档位：**T3**
- 提交：E 初版代码/测试 `e7ac5b2`；**E rework 代码/测试 `d30f648`**；E2E hardChecks 修正 `5043ceb`；最终文档提交见最终报告。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-E.md`（126 行 / sha256 `e3cef3bbb7fb926058fca53f3c8049255c4b5ba921c3c30cd112d37fdf5098fd`）；E v1 验收报告 `8d8bea68…`（rework 请求）。

## 范围

对话框/待办/历史/任务/日志 IPC 白名单；删除 3 个旧治理入口方法；E2E 改写模态语义并纳入 hardChecks。

## 文件 / 测试

- 文件：`app/main.ts`、`app/preload.cjs`、`app/desktop/interface.ts`（−624 行）、`app/renderer/src/lib/platform.ts`、`app/renderer/src/test-driver.ts`。
- 测试：`test/桌面应用/ans-wiring.test.ts`（7/7）、`test/桌面应用/e2e/main.mjs`（E2E_PASS，OP_CANCEL/OPX_EXPIRED=true）。

## 验证摘要

- 全量：**2903 tests / 2873 pass / 12 fail / 18 skip**（335/334）；D 基线 2880/2850/12/18 ⇒ +23 tests/pass、新增确定性失败 0、无新 skip；12 fail 均为基线既红。
- E 专项：决策对话框/队列/无障碍/待办历史/任务日志/i18n/接线全过；phase5a 30/30；E2E E-03/04/05/06 关键项全 true。
- 静态：`typecheck`/`typecheck:renderer`/`build:renderer` exit 0。
- Electron：`E2E_PASS=true`、`E2E_FAILURES=` 空；17 PNG + 00-titlebar 环境性失败；phase3b 45 checks、phase5a 30 checks 全过。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0。

## 风险 / 备注

- shell/恢复确认保持独立高风险模态；决策对话框在其活跃时隐藏。
- `app/desktop/interface.ts`/`session.ts` 仍有 `@ts-nocheck` 过渡死代码；E 已删除 interface 3 个旧入口（−624 行），F 前必须清完并移除标记。
- 不 push/合 main；package/lock 零改动；F 批 optional-acceptance 未提前。
