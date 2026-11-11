# convener-code B21 记录：A11 一模块一任务派发口径（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「convener-code」（独立固定上下文；B21 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B21**（RR16 失败修复）
- 基线 HEAD：`364ca98`（RR16 记录提交）

## 实施

`src/common/roles/convener/index.ts` `convener-fixed-production-line` 段：

- 增加：「**一模块一任务**：moduleId 权威，modulePaths 只写该模块路径（应用从模块表派生/校验，跨模块派发 ⇒ `module-paths-mismatch` 拒绝）」。
- legacy 三段/fixed 其它段未改；测试 `test/roles/convener/convener-fixed.test.ts` 保留通过。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| convener fixed 测试 | 含在受影响集 **221/222**（唯一 b31 merge 批跑抖动，隔离 9/9） | `角色卡/编排/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths_evidence/b2122-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b2122-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 46,852 / 822 | `ae18d16e1b1a36943d6cbedd9e1fb08dc2bd8ed6dfc217e07abde90b3cb70a71` | +1/−1 |

## 限制

- 只改 fixed 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过。
