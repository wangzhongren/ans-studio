# 复审（reverify）摘要 — 编排按备注②/⑤修正两处文案后（2026-10-17，测试角色）

## 修正内容（编排，语义/契约不变）

1. `GOVERNANCE_RECORD_ACCEPTANCE_SOURCE`
   - 旧：`desktop-app:操作者为已有角色的项目显式建立治理记录（仅本次，不持久化）`
   - 新：`desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`
   - 理由：该字符串经 `finalizeBootstrap` 写入 `.ans` 的 `acceptance.source`；一次性的是**种子边界对象**。
2. 写入阶段失败消息
   - 新：`写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。`
   - 不再承诺「重新执行（会安全采纳既有治理边界文档）」（`.ans` 已落盘时重跑会得 `already-established`）；
     `phase:"write"`、`ok:false`、不自动重试、不清理已写产物均不变。

## 复审结果

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 独立套件 `node --test "test/测试/existing-project-compat-verify/*.test.ts"` | **42 / 42 pass / 0 fail**（exit 0） | `reverify-verify-suite-output.txt` |
| 全量 `node --test "test/**/*.test.ts"` | **2150 tests / 2055 pass / 93 fail / 2 skip**（exit 1）——与修正前逐位相同 | 见下 |
| 93 红组成 | **无新增**：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1（`reverify-flaky-abort-recheck.txt` 单跑通过） | 与修正前分类一致 |
| `npm run typecheck` | **85 错 / exit 1**——与修正前相同；本批与本轮实现文件 0 错 | — |
| 冻结复算 | `reverify-sha256-freeze.txt` **24/24 逐字节一致** | 含 `src/common/编排/finalize.ts` 新哈希 `4344840c7bfafca8…`、`test/编排/governance-record.test.ts` 新哈希 `f87058b63d21fb95…`、本批 `b-establish.test.ts` 新哈希 `6a6e66a8c8ef14ef…` |

## 本角色断言更新说明

- `B5`：新增对**新文案**的正向断言（含「治理边界文档/.ans/manifest 不保证齐全」「请核对现场」
  「不会自动覆盖已存在的 .ans」），并新增反向断言「不得出现『重新执行』」；原「不得宣称未写入任何文件」保留。
- `B12`：改为复审语义——新 message 不再承诺重新执行；`.ans` 已落盘时重试确为 `already-established`
  （与「不自动覆盖」文案一致）。
- 其余断言均引用常量（`GOVERNANCE_RECORD_ACCEPTANCE_SOURCE`）或结构性事实，无需改动，自然全绿。
- **未修改任何产品代码**；未 git 提交。
