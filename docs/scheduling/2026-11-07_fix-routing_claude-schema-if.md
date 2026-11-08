# 修复派发路由：Claude schema `if/then` 兼容缺陷（2026-11-07）

- 日期：2026-11-07；固定 ANS 统筹调度。本文件是修复窄快速通道的核实与派发记录，不是验收结论。
- 客户授权：`docs/communication/2026-11-07_authorization_claude-schema-fix.md`，sha256 `f76fd1637caf77816940b5c6e800037b290368cbdbd5b19c319593f221e32209`（客户原话「A」=「修，并重跑真实测试」）。不含提交/推送/合并/发布。
- 缺陷（真实运行发现）：真实 Claude 下 chief 会话首回合失败 `MODEL_REQUEST_FAILED`：`Claude SDK 运行失败：tool input.target.allOf: unsupported JSON Schema keyword if`。证据 `C:\Users\51054\Desktop\work\ans-dogfood-run-2026-11-07\probe-1\dogfood-probe.jsonl` `5c0f0f25…`、`probe-2\drive-log.jsonl` `c8345bd2…`、诊断 `8ed236bb…`。
- 只读定位：`src/common/claude-adapter/schema.ts` 的 supported 集合不含 `if`（也不含 `then/else/not`），`check()` 对未知关键字直接抛错；`src/provider/runtime/schema.ts` 多个工具 schema 使用 `allOf:[{if…},{then…}]`（git oid/target 约 L70/L84、dispatch_task reviewOid L612、dispatch_task resumeController L692、另一处 L1656）。适配器设计意图是拒绝未知约束、不静默丢弃。

## 工作类型与 F1–F9 核实

**工作类型：修复（fix），拟走修复窄快速通道；路线 = 适配器侧转换（Claude适配器私有目录），不改 `src/provider/runtime/schema.ts` 公共工具 schema。**

| 条件 | 核实结论 |
| --- | --- |
| F1 预期行为已在既有确认基线内 | 待原所有者（Claude适配器）在修复记录中确认：既有公共工具 schema 的条件约束（`if/then/else`）必须被 Claude 适配器如实转换并在真实 Claude 下生效；这是既有契约，不是新增行为。 |
| F2 实际结果偏离且有可观察复现 | 已具备：真实运行 `MODEL_REQUEST_FAILED`、诊断与两份运行日志；非猜测。待原所有者复核。 |
| F3 单一现有所有者、全部文件/测试在其 Section 1 内 | **通过（调度核）**：`src/common/claude-adapter/`（私有目录）、`test/claude-adapter/`（测试目录）、`src/provider/claude/session.ts`（精确单文件，如需）；均属 `角色卡/Claude适配器/boundary.md §1`。 |
| F4 不新增/改变公开契约、共享抽象、数据模型、跨角色接口、架构分层、模块边界 | **拟通过（仅适配器内部转换）**：公共工具 schema 与 `toClaudeSchema` 的用途不变；若实现必须改公共 schema/共享契约，本条件失败，停止并转普通流程。 |
| F5 不新增 Section 1 外文件；不改角色/边界/治理规则/程序权限/验收标准 | **通过（调度核）**：修复与测试文件均在 Claude适配器 Section 1；治理/边界/验收标准不动。 |
| F6 风险档位 T0/T1 | **判为 T1**：单一角色内部实现、无跨角色契约变更；按受影响 unit/layer 测试 + 最窄路径检查。若修复触及共享 schema 或治理语义变化，升 T2/T3 并停止走普通流程。 |
| F7 沟通记录缺陷与明确修复指令、修复记录先于代码 | 沟通记录已具备（`f76fd163…`）；原所有者须先写 `角色卡/Claude适配器/docs/fix/2026-11-07_fix_claude-schema-if-then.md`（或同目录等价记录）再改代码。 |
| F8 既有指派或客户修复指令覆盖该所有者/范围/写集 | **通过**：Claude适配器为既有角色；其 Section 1 覆盖上述文件；客户修复指令确认由该既有所有者在该范围修复。 |
| F9 独立验收可用，能按既有已确认行为/契约+缺陷记录写 B1 | **通过（待沟通启动验收）**：独立验收路径既有；B1 在实施前按既有契约+缺陷记录写，B2 按同一 B1 判。 |

## 派发范围与边界

- 所有者：**Claude适配器**（唯一）。
- 允许修改：`src/common/claude-adapter/`（含 `schema.ts`；如需可含同目录适配代码）、`test/claude-adapter/`（新增/修改测试）、`角色卡/Claude适配器/docs/fix|change/`（修复记录与证据）、本人 memo/api-spec 等 §1 既有文件。
- **禁止**：修改 `src/provider/runtime/schema.ts` 或其他角色/共享契约/模型/公共入口；新增 Section 1 外文件；改角色卡/边界/YAML/治理规则/程序权限/验收标准；提交/推送/合并/发布；用「把 `if` 加入白名单让转换器静默丢弃约束」求绿。
- 若实现中发现必须改 `src/provider/runtime/schema.ts`、共享契约、其他角色文件，或无法在保留条件语义的前提下完成 → **停止、记录、回报**，按普通流程补闸门，不自行扩权。

## 修复与验证要求

1. 先写修复记录（症状/预期行为来源/实际结果/根因/修复后行为/范围与非目标/回归场景/证据链接/F1/F2 确认）。
2. 适配器侧转换：把 `allOf:[{if…},{then…},{else…}]`（及 `not` 等实际使用到的条件/约束）转换为 Claude/Zod 可接受且**语义等价**的形式；条件命中时 `then` 生效，未命中时 `else`/原行为一致；不得放宽或丢弃约束。覆盖实际使用点：`dispatch_task`（resumeController 条件、reviewOid）、`git_query`/`git_candidate` 的 oid `objectFormat` 条件、`decide_pending_request` disposition 条件等。
3. 测试：新增/修改 `test/claude-adapter/` 测试，至少覆盖条件命中/未命中、`not`（如适用）、实际工具 schema 的转换、未知关键字仍拒绝（不静默丢约束）、原无 `if` schema 行为不变。不得删测试/放宽断言/加 skip。
4. 验证命令：`node --test test/claude-adapter/schema.test.ts`（定向）、`node --test test/claude-adapter/*.test.ts`（受影响套件，真实逐文件或等价）；`npm run typecheck`。记录命令、环境、退出码、计数、日志 hash。`typecheck:renderer` 仅在触及 renderer 时执行（本修复预期不触及）。
5. 证据：`角色卡/Claude适配器/docs/fix/2026-11-07_claude-schema-fix-evidence/`（或 §1 内等价有界目录），含修复 diff、测试原始输出、typecheck、文件 hash。
6. 修复完成后由调度核实写集与候选身份，停止当前手动试用实例，再用真实 Claude 重跑真实闭环（目标 `C:\Users\51054\Desktop\work\ans-dogfood-2026-11-07`），结果交独立验收（沟通启动）。

## 回退条件

F1–F9 任一在实施中不再成立（尤其 F3/F4/F6：需要共享 schema/跨角色/新文件/公开契约/治理语义变化或 T2/T3）→ 立即停止，本路由记录标记作废，按修复→变更/重构转换走普通流程与对应闸门；旧授权不沿用。
