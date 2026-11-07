# 门控模块功能导航（feature-map）

| 位置 | 内容 | 说明 |
| --- | --- | --- |
| `src/common/gates/index.ts` | 唯一 public entry：`DispatchParentHostFacts` / `DispatchParentCoreFacts` / `DispatchParentReason`（18 项闭集）/ `DispatchParentDecision` / `evaluateChiefDispatchParent` | 纯判定；只 import Model 类型；E2 前由旧引擎 `trunk-runtime.ts` 保持权威 |
| `test/gates/dispatch-parent.test.ts` | P1.6 §11.1 / B1 §3.2 判定层 P/N 矩阵、TOCTOU、reason 闭集可达性、结构守卫 | 19 用例 |
| `test/gates/differential-trunk-runtime.test.ts` | 与 P1 D-minimal 内联实现逐字段/逐 reason 差分（oracle 只读 import） | 2 用例；134 场景 / 268 比较 / 差异 0 |
| `test/gates/api-contract.test.ts` | 冻结导出面/18 reason/函数签名/import 面/纯函数约束 | 3 用例 |
| `test/gates/module-graph.test.ts` | TS Compiler API 模块图：单入口、依赖方向、无环、D9 type-only 单列、引擎经 index 消费 | 5 用例 |
| `test/gates/fixtures.ts` | host/core 事实构造器与差分场景集合（非用例） | 供 4 个测试文件复用 |
| `角色卡/gates-code/api-spec.md` | public API 实现报告、reason 表、证据消费边界、测试映射 | 冻结面入口 |
| `角色卡/gates-code/docs/change/2026-11-07_E1_gates-module-evidence.md` | E1 证据（文件哈希/差分/扫描/计数/候选聚合/遗留） | 原始日志见同名目录 |

## 消费者（E2 起）

- 编排 `src/pipeline/orchestration/trunk-runtime.ts`：`prepareRoleDispatch` 的 `validParent` 与
  `prepareControllerResume` 的 `currentChiefResumeSource`（`hub: true`）。
- 写/发布/stable-write/run-stop 门**不消费**本模块（INV-2）。

## 依赖方向

`Model (src/model/) ← shared (src/common/shared/) ← gates (src/common/gates/) ← engines (pipeline/service/provider/…)`。
本模块不得反向 import 角色/引擎/私有 common；`module-graph.test.ts` 扫描并钉住该方向。
