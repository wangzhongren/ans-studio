# entry-role-minimal 批次 F 变更记录（桌面窗口）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 提交：F 代码/测试 `e008187`；F 文档提交见最终报告。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-F.md`；终态报告 `docs/acceptance/entry-role-minimal-final-report-v1.md`。

## 范围

- **`@ts-nocheck` 物理清理（F 硬性）**：`app/desktop/interface.ts` 13715 → **2389 行（−11326）**、`app/desktop/session.ts` 6936 → **6116 行（−820）**；删除 D 批遗留的 flow/治理记录/team-plan/gate/ledger/acceptance-triage/acceptance-rework/boundary-change/意图交接/澄清/恢复提议死代码与全部 `any` 兼容桩；移除 `// @ts-nocheck`，`npm run typecheck` 真实 exit 0。
- **F-05 无 liaison**：删除 `app/desktop/project.ts` 的 A 批 `builtInRoles.push("liaison")` shim、`session.ts` 的旧 liaison 只读打开分支（`governanceRoleOf("liaison")` 已不存在，该分支为死代码）。
- **F-02**：新增 `test/桌面应用/optional-acceptance.test.ts`（4 tests：幕僚调度验收、无自动验收源码钉、decision 开关关/开）；`test/测试/governance-e2e-auto/i-full-chain.test.ts` 收口为 2 tests。

## 文件 / 测试

- 文件：`app/desktop/interface.ts`、`app/desktop/session.ts`、`app/desktop/project.ts`、`test/桌面应用/optional-acceptance.test.ts`（新增）。
- 测试：`optional-acceptance` 4/4；`test/桌面应用/*.test.ts` 全目录 326/326；`i-full-chain` 2/2；规范全量 2908/2878/12/18（相对 E +5/+5/0/0）。

## 验证摘要

- 全量：**2908 tests / 2878 pass / 12 fail / 18 skip**（规范口径排除基线挂起 `write-sequencing`；日志 `18a44152…`）；12 fail = 9 Windows symlink EPERM + T1×3（基线既红）；无新增确定性失败/无新 skip。
- 静态：`typecheck`/`typecheck:renderer`/`build:renderer` exit 0（`aee16865…`/`914780f6…`/`ff7f1dd0…`）。
- Electron：`E2E_PASS=true`、`E2E_FAILURES=` 空、17/17 PNG（报告 `2b73e5f6…`）；phase3b 45 checks、phase5a 30/30。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0。

## 风险 / 备注

- 清理为纯删除/类型修复，无新功能、无 IPC/API/契约新增；行为由 desktop 326/326、全量与 E2E 复核。
- 不 push/合 main；package/lock 零改动；`optional-acceptance.test.ts` 已在 Delta-1 边界（人事 2026-10-28 补入），F 无边界变更。
