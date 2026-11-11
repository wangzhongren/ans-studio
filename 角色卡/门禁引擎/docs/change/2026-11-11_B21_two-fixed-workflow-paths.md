# 门禁引擎 B21 记录：A11 一模块一任务（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「门禁引擎」（独立固定上下文；B21 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B21**（RR16 失败修复）
- 基线 HEAD：`364ca98`（RR16 记录提交）

## 实施

`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` A11 条目：

- 增加：「**一模块一任务**：`moduleId` 权威，`modulePaths` 只写该模块路径；应用从模块表派生写集，跨模块/未知 moduleId ⇒ `module-paths-mismatch` 拒绝」。
- 其余 stage-request/验收/哈希口径未改；legacy `chief-workflow.md` 未改。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| chief v2 资源/禁 shell hash 测试 | 含在受影响集 **221/222**（唯一 b31 merge 批跑抖动，隔离 9/9） | `角色卡/编排/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths_evidence/b2122-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b2122-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 23,987 / 129 | `98bbfa584757939a04ae5b800804ccf6e91ceb1cbdcddce585c6e9f8ee187214` | +1/−1 |

## 限制

- 只改 fixed v2 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过。
