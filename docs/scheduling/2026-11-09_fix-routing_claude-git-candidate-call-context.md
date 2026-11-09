# 修复派发路由（只读定位与定性）：Claude 适配器 `git_candidate` 的 MCP schema 拒绝（2026-11-09）

- **日期**：2026-11-09；**记录角色**：ANS 统筹调度（Scheduler）。本文件是修复窄快速通道的核实与派发路由记录；**不是验收结论、不是实施授权**；本轮**未写任何产品/测试代码**。
- **依据**：协调方 2026-11-09 指令（只读定位与定性，回报后再由沟通启动 B1）；第二变更交付完成（PR #74 MERGED，merge `2e870248…`，2026-11-09T00:23:10Z）；真实运行证据 `角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（`c40011de…`）与 `2026-11-08_RR_evidence/`（确定性复现 `attempt1/repro-call-context.json` `e6db4183…`、`attempt2/product-sdk-tool-facts.json` `f6cd76b2…`）；沟通备忘 `docs/communication/memo.md` 2026-11-09 条。
- **基线（本记录写盘时实测）**：worktree `.claude/worktrees/trunk-amendment`，HEAD `acc5512a3c9004312973538c3073ae2ec5b1ed6d`（第二变更本地提交 29c0e15/8aed394/acc5512；远端 merge `2e870248…` 内容相同）；`git status --porcelain -- src app test` = 0（干净）；分支 `feat/plan-escalation-card`。

---

## 一、缺陷与证据（事实）

- **症状**：真实 Claude 下 `git_candidate`（四个动作，含 commit/init）在 **MCP 入参校验层**被拒：`MCP error -32602 Input validation error: invalid_union`，commit 分支 `unrecognized_keys ["__ans_call_context"]`；未到达应用处理器；零效果（`.ans/trunk/operations/` 空、refs 仅 `refs/heads/master`、无 journal/sidecar、工作树仅预期 untracked 文件）。
- **复现**：真实 RR 两次尝试中 attempt 2 观测；确定性复现 `repro-call-context.json`（真实 `describeTool` + `toClaudeSchema`；`git_query`/`write_file` 通过、`git_candidate` 失败）。
- **候选相关性**：涉及文件（`src/provider/claude/session.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`）在第二变更候选（44 文件）`git diff HEAD` 均为空——**基线既有缺陷、零候选 delta**；不属第二变更返工项，已作为 RR「下一真实门」披露并被 B2 v2 pass 接受。

## 二、只读定位（符号锚点；行号为 HEAD `acc5512` 快照）

1. **公共工具 schema（合法设计）**：`src/provider/runtime/schema.ts:95-101` 构造 `git_candidate` 参数为
   `{ type:"object", oneOf:[commit/integrate/revert/init 四个对象分支] }`，每个分支由 `object(...)` 生成、`additionalProperties:false`、`required` 为分支自有字段；`properties` 仅在分支内。**全仓唯一顶层 `oneOf` 公共工具 schema**（`git_query`/`git_publish` 为扁平对象）。
2. **运行时直接校验依赖该形状**：`src/provider/runtime/tools.ts:4412` 以 `(schema.oneOf as ...).find(branch => properties.action.enum.includes(call.args.action))` 选择分支做 `directShapeError`。**改公共 schema（改 `anyOf`/扁平化/在 schema 中预置保留字段）会改变公共工具契约并跨角色（运行时核心）**。
3. **Claude 适配器的保留上下文字段**：`src/provider/claude/session.ts:84` `CALL_CONTEXT_ARG="__ans_call_context"`；
   - 注册期（约 `:648-653`）：取 `protectedSchema.properties`（`git_candidate` 顶层无 `properties` ⇒ `{}`），校验保留名后构造 `inputSchema = claudeMcpInputSchema({ ...protectedSchema, properties:{ ...properties, __ans_call_context:{type:"string",...} } }, tool.name)`——**只加在顶层**；
   - 执行期（约 `:665-671`）：handler 读取 token、从 `inputArgs` 剥离 `__ans_call_context` 后交给产品 handler；
   - PreToolUse（约 `:765-772`）：网关放行后 `updatedInput:{ ...hook.tool_input, __ans_call_context: token }`——模型输入被注入该字段。
4. **转换链路**：`src/common/claude-adapter/schema.ts:233` `toClaudeSchema` → `check()`（未知关键字拒绝）→ `z.fromJSONSchema(stripConditionals(schema))`（`oneOf`→Zod union；`additionalProperties:false`→strict 对象）。注入的 `__ans_call_context` 在顶层被允许，但 **union 的每个 strict 分支都不声明该字段** ⇒ 所有分支校验失败 ⇒ `invalid_union; unrecognized_keys`。

**根因结论**：**Claude 适配器侧的「请求上下文字段注入」未适配复合（`oneOf`）工具 schema**——顶层 `properties` 增补不会传播进 `oneOf` 分支；公共工具 schema 本身是合法 JSON Schema 且被运行时直接校验依赖，**不是 schema 设计缺陷**。缺陷**只在 Claude 适配器路径**（Pi/Codex 不注入该字段）。

## 三、工作类型与 F1–F9 核实

| 条件 | 核实结论 |
| --- | --- |
| F1 预期行为已在既有确认基线内 | **拟通过（待 Claude适配器在修复记录中确认）**：既有公共工具 schema（含 `git_candidate` 的 `oneOf` 形状）是已确认契约；Claude 适配器须如实桥接全部已注册工具，其私有上下文注入不得使合法工具调用在校验层失败（T1 先例：适配器侧转换既有 schema，不改公共 schema） |
| F2 实际结果偏离且有可观察复现 | **通过**：真实 RR `-32602 invalid_union`（`c40011de…`）+ 确定性复现 `e6db4183…`；零效果 |
| F3 单一现有所有者、全部文件/测试在其 Section 1 内 | **通过（调度核）**：所有者=**Claude适配器**；候选写集 `src/provider/claude/session.ts`（单文件）、`src/common/claude-adapter/`（私有目录）、`test/claude-adapter/`（测试目录）、`角色卡/Claude适配器/docs/fix|change/`——均在 `角色卡/Claude适配器/boundary.md §1` |
| F4 不新增/改变公开契约、共享抽象、数据模型、跨角色接口、架构分层、模块边界 | **拟通过（仅适配器内部注入变换）**：公共工具 schema（`src/provider/runtime/schema.ts`）与运行时直接校验（`tools.ts`）**不改**；`toClaudeSchema` 用途不变；模型可见语义等价（仅多一个「应省略」的内部可选字符串字段，且 PreToolUse 覆盖模型值、handler 前剥离）。**若实现必须改公共 schema/共享契约 → F4 失败，停止转普通流程** |
| F5 不新增 Section 1 外文件；不改角色/边界/治理规则/程序权限/验收标准 | **通过（调度核）**：修复与测试均在 Claude适配器 Section 1；治理/边界/验收标准不动 |
| F6 风险档位 T0/T1 | **T1**：单一角色内部实现、无跨角色契约变更；按受影响 unit/layer + 最窄路径验证。若触及共享 schema/治理语义 → 升 T2/T3 并停止 |
| F7 沟通记录缺陷与明确修复指令、修复记录先于代码 | **部分具备**：缺陷与复现已记录（RR/`c40011de…`、memo 2026-11-09）；协调方指令已给。**原所有者须先写 `角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md` 再改代码** |
| F8 既有指派或客户修复指令覆盖该所有者/范围/写集 | **拟通过**：Claude适配器为既有角色、Section 1 覆盖上述文件；协调方修复指令确认在该范围修复（正式留痕由沟通补） |
| F9 独立验收可用，按既有已确认行为/契约+缺陷记录写 B1 | **通过（待沟通启动）**：B1 在实施前由内置独立验收按本路由+F1/F2 确认+缺陷记录写（窄修复）；B2 按同一 B1 判 |

**定性结论：修复（fix），满足修复窄通道 F1–F9（F1/F4/F7/F8/F9 待原所有者确认与沟通 B1 正式化），T1；所有者=Claude适配器；不转普通流程，前提是实施不触碰公共 schema/共享契约/跨角色。**

## 四、修复方案候选与推荐

### 方案 ①（推荐）：适配器侧把保留字段传播进复合分支（最小、语义等价）

- 位置：`src/provider/claude/session.ts`（保留名与注入点所在文件；不新建模块）。
- 做法：把现有「顶层加 `__ans_call_context`」扩为一个小助手（如 `claudeToolInputWithCallContext(schema)`）：
  1. 顶层 `properties` 增加 `__ans_call_context`（现状保留；先在顶层与所有分支 `properties` 检查保留名冲突，冲突即抛错——不静默覆盖）；
  2. 对顶层 `oneOf`（及对称的 `anyOf`，如出现）数组的每个对象分支：若 `branch.additionalProperties === false`（`git_candidate` 四分支均是），在 `branch.properties` 中补入同一可选 `{type:"string"}` 字段；**保留 `required`/`pattern`/`additionalProperties:false` 原样**；返回深拷贝、不修改入参；
  3. 扁平工具行为不变（仍只在顶层加字段）。
- 语义等价性：只是把适配器自己注入的一个「应省略」的可选字符串字段在所有合法分支中声明为允许；模型侧不可借它绕过（PreToolUse 以 host token 覆盖模型值；handler 剥离；既有 `session.test.ts` 已覆盖伪造 token/冲突字段拒绝）。`oneOf` 仍恰一分支命中（分支其余约束不变）。
- **可行性预验证（只读模拟，2026-11-09）**：用本仓库安装的 `zod 4.6.7` 直接 `z.fromJSONSchema`，按 `git_candidate` 形状构造 `{type:"object", oneOf:[两个 additionalProperties:false 分支], properties:{__ans_call_context}}` 并解析携带 `__ans_call_context` 的样例——**复现 `invalid_union`**；把 `__ans_call_context` 补入每个分支 `properties` 后，同一样例**通过**且字段保留。证明方案 ① 的机制可行（只读模拟；未运行 SDK/真实模型；实施仍以真实 adapter 注册/测试为准）。
- 最小写集：`src/provider/claude/session.ts`；`test/claude-adapter/session.test.ts`（新增用例；必要时 `test/claude-adapter/schema.test.ts`）；`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md` + 证据目录。
- 风险：低；不触碰公共 schema/运行时/其它角色。

### 方案 ②（不推荐，且不满足窄修复）：改运行时公共 schema

在 `src/provider/runtime/schema.ts` 把 `git_candidate` 改为 `anyOf`/扁平对象/预置保留字段（或改 `tools.ts` 直接校验）。问题：改变公共工具契约与运行时直接校验依赖（`tools.ts:4412`），影响 Pi/Codex 与跨角色；**F3/F4 不满足**，须走普通变更流程。明确排除。

### 方案 ③（不推荐）：改用其它上下文传递通道

例如为 `oneOf` 工具改用 `extra`/映射表而非入参注入。问题：改变适配器既有 token 机制与所有工具的注入/剥离语义，风险大于收益；不作为窄修复。

## 五、验证计划（实施后由 B1/B2 约束）

1. **确定性（定向）**：
   - `test/claude-adapter/session.test.ts` 新增：用**真实** `git_candidate` 公共 schema（只读 import `src/provider/runtime/schema.ts` 的 `describeTool`，不改它）走真实 adapter 注册路径（`toClaudeSchema`/`registerTool`），MCP 客户端携带 `__ans_call_context` 调用：
     - commit/integrate/revert/init 四分支**合法入参均通过**（校验层不再 `invalid_union`）；
     - 非法入参（未知额外字段、错误 action/分支字段组合、缺 required）仍被拒；
     - 模型伪造 `__ans_call_context` 被 PreToolUse 覆盖、handler 前剥离（沿用既有用例风格）；
     - 扁平工具（`git_query`/`git_publish`/其它）行为不变；未知 JSON Schema 关键字仍拒绝（不静默丢弃）。
   - 命令：`node --test test/claude-adapter/*.test.ts`（逐文件或等价）+ `npm run typecheck`；记录计数/退出/日志 hash。产品未改，`test/runtime-core/` 非必需（除非 B1 要求）。
2. **真实 Git 写最小运行（B1/B2 用）**：受保护项目 + 真实 Claude + 真实桌面 UI；1 条客户消息；`dispatch_task` ≤1；**Git 能力调用 ≤2 次**；审批卡 ≤2；墙钟 10–15 分钟；目标：`git_candidate commit` **经 MCP 校验成功**并到达应用处理器，产出 sidecar `authorization.jsonl` + `git.json` + candidate ref；首个决定性失败/成功即停；若出现下一真实门，如实报告。复用第二变更 RR 环境/launcher/CDP 驱动（`角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md` + `2026-11-08_RR_evidence/`），只读。
3. **验收流程**：沟通启动内置独立验收先写 **B1（窄修复 F9；实施前）**，实施后 B2；候选=最小写集（适配器源码+测试+修复记录），发布/tag 未授权。

## 六、派发范围与停止条件（建议；待 B1/沟通确认后放行实施）

- **所有者**：Claude适配器（唯一）。
- **允许修改**：`src/provider/claude/session.ts`；`src/common/claude-adapter/`（如需助手文件；推荐不必）；`test/claude-adapter/`；`角色卡/Claude适配器/docs/fix|change/`、本人 memo/api-spec 等 §1 既有文件。
- **禁止**：`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、其它角色/共享契约/模型/公共入口；新增 Section 1 外文件；改角色卡/边界/YAML/治理/权限/验收标准；提交/推送/合并/发布；以「放宽/丢弃 schema 约束」求绿。
- **回退**：F1–F9 任一在实施中不再成立（尤其 F3/F4/F6：需改公共 schema/跨角色/新文件/T2/T3）→ 立即停止，本路由作废，按普通流程补闸门。

## 七、状态

- 本记录：**只读定位与定性完成；未写代码、未派发实施、未运行测试/真实模型**。
- 待办：① Claude适配器确认 F1/F2 并写修复记录（F7）；② 沟通启动独立验收写 **B1（窄修复 F9）**；③ B1 冻结后按本路由放行实施；④ 实施→确定性验证→真实 Git 写最小运行→B2。
