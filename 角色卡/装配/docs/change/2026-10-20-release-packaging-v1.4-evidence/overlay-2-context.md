# v1.4.0 首跑 CI 失败与 overlay-2 上下文

- 首跑 CI：run `39389502551`，三平台均在 **Regression tests** 阶段失败。
- 处置：属主修复（未提交），装配按**精确路径**将 5 条纳入 overlay-2（单文件、不开目录）：
  1. `src/common/编排/shell-command-guard.ts` —— 唯一产品修复：Windows 盘符/UNC 路径反斜杠被当 POSIX 转义消费，`grep -r foo D:\...\source` 漏判 allow；修复为 Windows 绝对路径按分隔符保留、双引号内仅 POSIX 特殊字符转义、`isWidePath` 用 `path.win32` 归一比较。
  2. `test/编排/shell-command-guard.test.ts` —— 平台无关 Windows 路径回归。
  3. `test/编排/flow-service.test.ts` —— 原子写失败用例 Windows 平台真值分支（POSIX 目录 `0o500`；win32 目标文件 `0o444` 只读 + rename 失败），断言不放宽。
  4. `test/桌面应用/interface.test.ts` —— 三平台共同失败「收尾推进」测试竞态修复（先等 verifier 会话/任务、再取当前数组；负面断言用有界稳定窗口；pending/blocked 同类假绿修正），产品零改。
  5. `test/桌面应用/runtime-resolution.test.ts` —— mac arm64 teardown `ENOTEMPTY`，临时目录清理有界重试，产品零改。
- 属主记录：`角色卡/编排/docs/change/2026-10-20_change_v1.4.0-ci-windows-guard-atomic-write.md`、`角色卡/桌面应用/docs/change/2026-10-20_change_ci-test-races.md`（文档面，overlay excluded）。
- **未声称 CI 已复跑通过**：本目录只含本地 typecheck、装配测试、overlay 复算与临时 clone 预演；三平台复跑与发布由 root 触发。
