# 门控代码维护角色：实际职责、交接与代码位置

## 实际职责

维护运行时派发/准入判定模块 `src/common/gates/`：把「派发父门 + controller resume」共用的 predicate 做成
纯 TypeScript 判定函数，并冻结其输入/输出/reason 码。模块只判定，不采集证据、不读注册表、不调用
Service/Provider/Pipeline、不做 I/O；证据由运行时核心/适配器生产，门只消费冻结形状。

当前 E1 交付：`evaluateChiefDispatchParent`（四运行时分支：claude/pi 受限应用中介；codex 严格优先 +
受限兜底 + 双路径歧义；demo 严格；其它拒绝），与 P1 D-minimal 内联实现行为等价（差分 0）。

## 交接输入

- E0.3 契约 §5（`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`，`067e3d2e…`）。
- P1 D-minimal 实现（只读 oracle）：`src/pipeline/orchestration/trunk-runtime.ts::evaluateChiefDispatchParent`（`9453a43f…`）。
- P1-C 证据（含 Amendment-1）：`角色卡/编排/docs/change/2026-11-07_P1-C_dispatch-parent-d-minimal-evidence.md`。
- B0 冻结脏基线、P1.6 §4.4/§11.1、B1 §3.2/§3.3、团队计划 §4.4⑧/§6.5/§7.4–§7.5。

## 交接输出

- `src/common/gates/index.ts`（唯一 public entry；5 个导出；18 reason 闭集；API 冻结声明）。
- `test/gates/`：判定层 P/N 矩阵、与旧引擎差分、API 冻结、模块图扫描。
- `api-spec.md`（API 实现报告）、`docs/change/2026-11-07_E1_gates-module-evidence.md`（证据与原始日志目录）。

## 代码位置与消费者

| 位置 | 作用 |
| --- | --- |
| `src/common/gates/index.ts` | 判定实现与冻结类型 |
| `src/pipeline/orchestration/trunk-runtime.ts` | E2 前生产权威/差分 oracle；E2 由编排改调本模块并删除内联实现 |
| `test/gates/` | 模块测试与静态扫描（非生产依赖） |

消费者：编排「派发父门」与「controller resume」。禁止消费者：写/发布/stable-write/run-stop（不读
`applicationMediation`，INV-2）。

## 边界与纪律

- 写集仅 `src/common/gates/`、`test/gates/`、`角色卡/gates-code/**`；不写旧引擎、Model、shared、角色模块、
  其他角色资料、`docs/scheduling|acceptance|communication|planning`。
- 不新增依赖/不改构建；module-graph 用仓内 `typescript`（TS 7 `unstable/sync` API）。
- 冻结后变更走接口评审（E0.3 §4.4）；不自行扩写 reason 或输入输出。
- E1 为 implemented-unverified；不判验收；真实运行证据归 P1-RR/测试角色。
