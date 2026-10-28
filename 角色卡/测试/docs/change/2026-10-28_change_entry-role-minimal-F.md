# entry-role-minimal 批次 F 变更记录（测试）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 提交：F 代码/测试 `e008187`。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-F.md`。

## 范围

- `test/测试/governance-e2e-auto/i-full-chain.test.ts`（既有文件名，Delta-6 不新增目录/文件）：保留 D 最小系统全链（六角色枚举/幕僚派发落 tasks.jsonl/无 flow-gate-ledger/convener 无 dispatch），新增 F 终态段——幕僚调度 review 任务→质检回交只回幕僚 `[工作结果]`→回交/settle 后无自动验收任务/无 flow/账本文件。
- 测试文件 335 → 336（执行 335；`write-sequencing` 按基线挂起排除）；tests +5（i-full-chain 1→2、optional-acceptance 4）。

## 验证

- 规范全量：**2908 / 2878 / 12 / 18**（日志 `18a44152…`）；相对 E 2903/2873/12/18 = +5/+5/fail 0 增/skip 0 增；12 fail = 9 Windows symlink EPERM + T1×3；无新增确定性失败、无新 skip、无删除测试保绿。
- 测试差异合并视图（D/E/F）：`change-F` §4（119 附录 A 闭环、E 11 文件、F 2 文件、E-02 解释、36/40 E2E 口径、任务/日志 smoke、i18n 1456）。
