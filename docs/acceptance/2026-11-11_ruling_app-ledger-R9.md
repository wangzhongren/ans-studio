# 协调方裁定：R9（`.ans/state/versions.jsonl` 等）属应用哈希账本（2026-11-11）

- 日期：2026-11-11
- 来源：B2 最终独立验收报告（`docs/acceptance/2026-11-11_two-fixed-workflow-paths-acceptance-report-v1.md`）限制项 L-1 提请裁定。
- 适用范围：T3 两条固定工作流路径的验收解释；不修改冻结 B1 任何条目。

## 问题

fixed 运行期应用写 `.ans/state/versions.jsonl`（7 条）、`versions.initialized`、`doc-freezes.json`。B2 指出这与设计 §旧账本处置（v1.3 行 915/1086：「旧账本（versions/VCA/stable/doc-freezes/trunk/runs）compat-only，不写，只读历史」）及 AC-23 字面「fixed 运行不写 … versions/stable 账本」存在字面冲突。

## 裁定

R9（`.ans/state/versions.jsonl`、`versions.initialized`、`doc-freezes.json`，内容为应用计算的治理文档 SHA-256）**属设计要求的应用哈希账本**，依据：

1. 设计 v2 §核心原则 2：治理状态走应用账本（`.ans/state/*.jsonl`），以应用记录文档哈希实现"依据钉死"，不进 Git；
2. 设计 v2 §一.2 基线准备：「哈希入账：应用把当前治理文档（意图/方案/名单/模块/架构/契约/团队计划）的 SHA-256 记入应用账本（作为本轮依据快照）」；
3. 实现级方案 v1.3 行 267：`versions.jsonl`/`versions.initialized` 对应 R9 登记。

AC-23 所述「旧账本只读忽略、不写」指 **trunk 时代的旧治理机制账本**（`.ans/trunk`、`.ans/runs`、VCA/stable 许可、run pin、stable-write），这些在 fixed 默认路径未被触达（RR28 账本核验为 0 命中）。`versions.jsonl` 以应用哈希账本身份复用同一文件形态，不属该禁止清单。

## 结论

- AC-23 判据不变；fixed 路径写 R9 应用哈希账本**不构成 AC-23 违反**。
- B2 补判与后续审计按本裁定解释；如未来要彻底分离文件名，需另立变更，不在本裁定范围。
