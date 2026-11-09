# 修复记录：Claude 适配器 `git_candidate` 的 MCP 入参校验拒绝（`__ans_call_context` × 顶层 `oneOf`）（2026-11-09）

- 角色：Claude适配器（缺陷所有者）；派发（只读路由）：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`（88 行 / `18648feeaadf7cc5eb8df3ccbf20a376d025ab700b9b2412a5dd15a8060c9356`）；缺陷证据：`角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（`c40011de…`）与 `2026-11-08_RR_evidence/`（`attempt1/repro-call-context.json` `e6db4183…`、`attempt2/product-sdk-tool-facts.json` `f6cd76b2…`）。
- 风险档位：T1（单一角色内部实现；不改公共工具 schema、共享契约、模型或公共入口）。
- **本记录先于代码与测试改动（F7）**；**本步未改任何 `src/`、`test/` 文件**，未提交/推送/暂存/合并/发布。方案 B1 尚未冻结，实施待沟通/独立验收放行。
- 基线：worktree `.claude/worktrees/trunk-amendment`，HEAD `acc5512a3c9004312973538c3073ae2ec5b1ed6d`（分支 `feat/plan-escalation-card`）；`git status --porcelain -- src app test` = 0（干净）。行号均为该快照。

## 1. 症状与触发条件

真实 Claude 会话（RR attempt 2）中，product 角色调用 `git_candidate {action:"commit", …}` 在 **MCP 入参校验层**被拒：

- `MCP error -32602: Input validation error: Invalid arguments for tool git_candidate`；
- 顶层 issue `invalid_union`；与本次 commit 入参匹配的分支唯一报错 `unrecognized_keys ["__ans_call_context"]`；其余三个分支同时报 `paths`/`__ans_call_context` 未识别；
- 调用**未到达应用处理器**：未进入写/初始化授权门，无 prepared 候选、无 `journal`/`sidecar`；零效果（见 §3）。

触发条件：任何**经 Claude 适配器注册**的工具，其公共参数 schema 在顶层使用 `oneOf`/`anyOf` 复合，且分支为 `additionalProperties:false` 的严格对象；适配器在 PreToolUse 向模型下一次工具调用注入私有字段 `__ans_call_context`，而注册期只在**顶层** `properties` 声明了该字段 ⇒ 每个严格分支都把它视为未声明字段而拒绝，`oneOf` 恰一分支的要求无法满足。

当前公共工具中唯一满足该形态的是 `git_candidate`（`src/provider/runtime/schema.ts:95-101`：`{ type:"object", oneOf:[commit/integrate/revert/init 四个对象分支] }`，四分支均 `additionalProperties:false`，`properties` 仅在分支内，顶层无 `properties`）。其余工具（`git_query`/`git_publish`/`write_file` 等）为扁平对象，不受影响。

## 2. 预期行为与来源（F1）

**既有确认基线内的契约链（均为既有设计/实现/测试，非新增行为）**：

1. **公共 schema 源头（运行时核心所有，合法 JSON Schema）**：`src/provider/runtime/schema.ts:79-109` `gitCapabilityDescription`；`:95-101` 构造 `git_candidate` 的顶层 `oneOf` 四分支（每分支由 `object(...)` 生成，`additionalProperties:false`，`required` 为分支自有字段）；`:101` `parameters = { type:"object", oneOf }`。全仓唯一顶层 `oneOf` 公共工具 schema（`grep oneOf src/provider/runtime/schema.ts src/provider/runtime/tools.ts` 仅 `:97/:101/:4412`）。
2. **运行时直接校验依赖该形状**：`src/provider/runtime/tools.ts:4411-4418` 以 `(schema.oneOf as …).find(branch => properties.action.enum.includes(call.args.action))` 选分支做 `directShapeError`。改公共 schema 会改变运行时直接校验依赖与跨角色契约。
3. **工具定义契约**：`src/model/runtime.ts:3405-3413` `ToolDefinition.inputSchema: JsonSchema`——适配器消费注入的 `options.tools` 并按名通用注册，不按工具名分支（`角色卡/Claude适配器/docs/change/2026-11-05_governance-authority-matrix-claude-adapter.md:81`）。
4. **适配器注册/注入/剥离机制**：`src/provider/claude/session.ts`：
   - `:84` `CALL_CONTEXT_ARG = "__ans_call_context"`；
   - 注册期 `:646-652`：取 `protectedSchema.properties ?? {}`（`git_candidate` 顶层无 `properties` ⇒ `{}`），做保留名冲突检查后构造 `inputSchema = claudeMcpInputSchema({ ...protectedSchema, properties:{ ...properties, [CALL_CONTEXT_ARG]: {type:"string",…} } }, tool.name)`——**只加顶层**；`:653-660` `registerTool` + `toClaudeSchema`；
   - 执行期 `:664-671`：handler 读取 token，`const { [CALL_CONTEXT_ARG]: _privateContext, ...publicArgs } = inputArgs` 剥离后交给产品 handler；
   - PreToolUse `:761-772`：网关放行后 `updatedInput: { ...hook.tool_input, [CALL_CONTEXT_ARG]: token }`——模型下一次工具调用的入参因此携带该字段。
5. **转换链路**：`src/common/claude-adapter/schema.ts:232-241` `toClaudeSchema` → `check()`（`:21-49`，未知关键字拒绝、绝不静默丢弃）→ `z.fromJSONSchema(stripConditionals(schema))`（`oneOf`→Zod union，`additionalProperties:false`→strict 对象）。设计文档明确支持 union 类约束且不得静默删减：`角色卡/Claude适配器/docs/design/2026-10-14_design_claude-governed-session.md:40`。
6. **既有测试（适配器对保留字段的既有承诺）**：`test/claude-adapter/session.test.ts`：
   - `:644-665` `strict_input`：`additionalProperties:false` 的扁平工具携带 `__ans_call_context` 通过校验、handler 只收到剥离后的参数、模型伪造值被替换；schema 顶层已声明保留名则拒绝注册（`/保留/`）；
   - `:615-642` 迟到/未知/缺失 nonce 均在效果前失败；
   - `:438-439` 顶层保留名声明被拒；`:332`、`:1371-1377` PreToolUse `updatedInput` 注入宿主 token；`:1157` 事件行不含该字段。
7. **T1 先例（同一契约的已确认口径）**：`docs/scheduling/2026-11-07_fix-routing_claude-schema-if.md` + 修复记录 `角色卡/Claude适配器/docs/fix/2026-11-07_fix_claude-schema-if-then.md` §2——既有公共工具 schema 的约束必须被 Claude 适配器**如实转换/桥接**，不得放宽、丢弃或改公共 schema。

**F1 结论：成立。** 「公共工具 schema（含 `git_candidate` 的 `oneOf` 形状）必须被 Claude 适配器如实桥接、其私有 `__ans_call_context` 注入不得使合法工具调用在校验层失败」在既有确认基线内有明确依据（§2.1–§2.7）；这是既有契约，不是新增行为。

## 3. 实际结果与复现（F2）

### 3.1 真实 RR 证据（只读复核，哈希一致）

- `attempt2/product-sdk-tool-facts.json`（`f6cd76b25a576977a43601f887e6a2524fbf5685e984097e4f86a3207ff863a2`）：`git_candidate` 工具调用入参（commit，含 `operationId`/`base`/`paths`/`message`）与结果原文 `MCP error -32602 … invalid_union`；commit 匹配分支唯一报错 `unrecognized_keys ["__ans_call_context"]`。
- `attempt1/repro-call-context.json`（`e6db41837f76d69052d47f8169a4ab338862cfe7fd951e3f4c16bcb37a65c20d`）：真实 `describeTool` + 适配器同一顶层注入经真实 `toClaudeSchema` 校验；`git_candidate` = `invalid_union`（结构逐键同上），`git_query`/`write_file` = 通过。
- 零效果事实（attempt2 原件）：`operations-inventory.json` = `[]`；`target-git-refs-post.txt` 仅 `refs/heads/master`（`7b8acd9a…`）；`target-git-status-post.txt` 仅预期 untracked fixture（`.ans/`、`docs/bootstrap-manifest.md`、`docs/product/rr-git-note.md`、`角色卡/governance-boundary.yaml`）——被拒调用未产生候选/journal/sidecar，未改动仓库状态。

### 3.2 本角色确定性复跑（HEAD `acc5512`，只读；未运行 SDK/真实模型）

证据：`2026-11-09_fix_claude-git-candidate-call-context-evidence/read-only-repro.mjs`（183 行 / `e56a1e88…`）→ `repro-log.json`（1,382 行 / `44e52fd8…`）。使用仓库真实 `describeTool("git_candidate")` 与真实 `toClaudeSchema` + 仓库安装 `zod 4.6.7`：

| 场景 | 结果 |
| --- | --- |
| `git_candidate` 四分支（commit 与 RR 逐字段一致；integrate/revert/init 最小合法形状）**不带** `__ans_call_context` | **4/4 通过**（公共 schema + 转换器本身合法） |
| 同上四分支**带** `__ans_call_context`（当前顶层注入） | **4/4 失败**：顶层 `invalid_union`；commit 匹配分支 issue 与 RR 逐键一致：`unrecognized_keys ["__ans_call_context"]` |
| `git_query` / `write_file` 带 `__ans_call_context` | 通过（扁平工具不受影响，与 RR 一致） |
| 未知关键字（`bogusKeyword`） | `toClaudeSchema` 仍抛 `unsupported JSON Schema keyword`（拒绝语义不变） |
| 方案 ① 机制模拟（深拷贝 + 顶层与四分支 `properties` 补同字段，`required`/`pattern`/`additionalProperties:false` 原样） | 四分支带上下文 **4/4 通过且字段保留**；不带上下文仍通过；负例仍拒：commit 混入 `candidates`、未知额外字段、缺 `paths` 的 commit |

### 3.3 涉及文件零候选 delta（基线既有缺陷）

- RR 时点候选（`post2-candidate-files.txt`，38 文件）**不含** `src/provider/claude/session.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`（grep 0 匹配）。
- 第二变更已提交的 `src app test` delta（`git diff --name-only 3f249e2..HEAD -- src app test`）= **44 文件**，上述三文件**不在其中**（diff 为空）；当前工作树对三文件 `git status --porcelain` 为空。
- 注入机制为基线代码：`git log -S "__ans_call_context" -- src/provider/claude/session.ts` 最早见于 `32e796e`；该文件最后一次改动 `5d7d2d3`（2026-11-08 01:53，RR 基线 `3f249e2` 的祖先，早于第二变更提交 `29c0e15/8aed394/acc5512`）。

**F2 结论：成立。** 实际结果偏离预期，有真实运行证据（`c40011de…`/`f6cd76b2…`）与确定性复现（`e6db4183…`，本角色在 HEAD `acc5512` 复跑结果一致），零效果、零候选 delta；非猜测。

## 4. 根因

**Claude 适配器侧的请求上下文字段注入未适配复合（`oneOf`/`anyOf`）工具 schema**：注册期只把 `__ans_call_context` 补进顶层 `properties`；而 `git_candidate` 的参数约束在顶层 `oneOf` 的四个分支内、每分支 `additionalProperties:false`。JSON Schema 语义下 `additionalProperties:false` 只豁免**同一 schema 对象内**声明的 `properties`，因此宿主注入的合法内部字段在每个分支都成为「未声明额外字段」→ all 分支失败 → Zod union `invalid_union`。执行期剥离/覆盖机制（PreToolUse → handler）本身正常，但调用**根本到不了** handler。

**公共工具 schema 非缺陷**：它是合法 JSON Schema，且被运行时直接校验（`tools.ts:4412`）依赖；Pi/Codex 路径不注入该字段，不受影响。缺陷只在 Claude 适配器路径。

## 5. 修复后行为（方案 ①：适配器内传播保留字段）

只改 `src/provider/claude/session.ts`，把现有「顶层加 `__ans_call_context`」扩为一个小助手（如 `claudeToolInputWithCallContext(schema)`），在 `registerTool` 前使用：

1. **冲突即抛错**：在顶层 `properties` 与所有 `oneOf`/`anyOf` 分支 `properties` 先检查保留名；已存在则抛错（沿用现 `/保留/` 语义），**不静默覆盖**。
2. 顶层 `properties` 增加同一可选 `{ type:"string", description:… }` 字段（现状保留）。
3. 对顶层 `oneOf`（及对称的 `anyOf`，如出现）数组的每个**对象分支**：若 `branch.additionalProperties === false`，在 `branch.properties` 补入同一可选字段；**返回深拷贝、不修改入参**；`required`/`pattern`/`additionalProperties:false`/分支字段**原样保留**（该字段不加入 `required`）。
4. 扁平工具行为不变（仍只在顶层加字段）。

语义等价性：该字段是适配器内部的可选字符串（描述「应省略」）；模型侧不可借它绕过——PreToolUse 以宿主 token 覆盖模型值（`session.ts:769-771`），handler 在进入产品前剥离（`:671`），既有测试已覆盖伪造/缺失/迟到 token 与顶层冲突拒绝；`oneOf` 仍恰一分支命中（分支其余约束不变；复跑负例见 §3.2）。不改公共 schema、不改 `toClaudeSchema` 的用途与拒绝未知关键字的语义。

## 6. 范围与非目标

- **允许改动**：`src/provider/claude/session.ts`（唯一产品文件；助手内联，不新建模块）；`test/claude-adapter/session.test.ts`（新增用例；必要时 `test/claude-adapter/schema.test.ts`）；`角色卡/Claude适配器/docs/fix/`（本记录与证据目录）。本修复不需要改 `src/common/claude-adapter/`；若独立验收 B1 v1（`docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`）§0.2 的冻结口径更窄，以 B1 为准。
- **禁止**：`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/common/claude-adapter/`（按 B1 v1；助手内联于 `session.ts`）、其它角色/共享契约/模型/公共入口；新增 Section 1 外文件；改角色卡/边界/YAML/治理规则/权限/验收标准；提交/推送/合并/发布；以「放宽/丢弃 schema 约束」求绿（不得把 `additionalProperties` 放宽、不得去掉 `oneOf`、不得在转换器中跳过未知关键字）。
- **非目标**：通用 JSON Schema 全量兼容层；改公共工具 schema 或运行时校验；改变 token 机制本身；方案 ②（改公共 schema）与方案 ③（改用 `extra`/映射通道）均不做。

## 7. 回归场景（实施后测试须覆盖）

1. **四个合法分支**：`git_candidate` commit/integrate/revert/init 合法入参经**真实 MCP 注册/客户端**（真实 `describeTool` 公共 schema，只读 import）携带 `__ans_call_context` 均通过校验，handler 收到**剥离后**参数且与输入一致。
2. **非法仍拒**：四分支的未知额外字段、错误 action/分支字段组合（如 commit+candidates）、缺 required、坏 OID/路径格式仍被拒绝。
3. **伪造/缺失 token**：模型自带 `__ans_call_context` 时被 PreToolUse 覆盖；缺失/未知/迟到 token 的调用仍失败且零效果（沿用 `:615-642`/`:644-665` 风格）。
4. **扁平工具不变**：`git_query`/`git_publish`/`write_file` 等行为不变（顶层 `additionalProperties:false` 仍生效、未知额外字段仍拒）。
5. **保留名冲突**：顶层已声明保留名仍拒绝注册（既有）；分支内已声明保留名同样抛错（新增）。
6. **未知 JSON Schema 关键字仍拒绝**（`check()` 语义不变）；注册后 schema 除注入字段外与公共 schema 语义等价（required/pattern/严格性不变）。

## 8. 验证计划

1. **确定性（定向）**：`node --test test/claude-adapter/session.test.ts` → 再跑 `node --test test/claude-adapter/*.test.ts`（逐文件或等价）+ `npm run typecheck`；记录命令、退出码、计数、日志 hash。
2. **真实 Git 写最小运行（B1/B2 用，按路由 §五.2）**：受保护项目 + 真实 Claude + 真实桌面 UI；1 条客户消息；`dispatch_task` ≤1；Git 能力调用 ≤2 次；审批卡 ≤2；墙钟 10–15 分钟；目标：`git_candidate commit` **经 MCP 校验成功**并到达应用处理器，产出 sidecar `authorization.jsonl` + `git.json` + candidate ref；首个决定性失败/成功即停，下一真实门如实报告；复用第二变更 RR 环境/launcher/CDP 驱动（只读）。
3. **验收流程**：沟通启动独立验收在实施前写 B1（窄修复 F9），实施后 B2；发布/tag 未授权。

## 9. 证据链接

- 派发路由：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`（`18648fee…`）。
- 真实 RR：`角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（`c40011de85229528f2ec10fa198d06e30f1acbbb0c3cc2a3cd5d30e80da5ecbf`）。
- `角色卡/测试/docs/change/2026-11-08_RR_evidence/attempt1/repro-call-context.json`（`e6db41837f76d69052d47f8169a4ab338862cfe7fd951e3f4c16bcb37a65c20d`）。
- `角色卡/测试/docs/change/2026-11-08_RR_evidence/attempt2/product-sdk-tool-facts.json`（`f6cd76b25a576977a43601f887e6a2524fbf5685e984097e4f86a3207ff863a2`）。
- 本次只读复现/模拟：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context-evidence/`——`read-only-repro.mjs`（`e56a1e88…`）、`repro-log.json`（`44e52fd8…`）、`repro-stderr.log`（空，`e3b0c442…`）、`environment.txt`（`2258242e…`，含 Node `v24.22.1`/zod `4.6.7`/HEAD/输入文件 hash）、`sha256.txt`。输入文件 hash（HEAD `acc5512`）：`session.ts` `0edf3a8f…`、`runtime/schema.ts` `e472196f…`、`runtime/tools.ts` `c37793ca…`、`claude-adapter/schema.ts` `afe70c62…`、`session.test.ts` `f0db260e…`。

## 10. F1 / F2 确认结论

- **F1：成立**——「公共工具 schema（含 `git_candidate` 的 `oneOf`）必须被 Claude 适配器如实桥接；私有 `__ans_call_context` 注入不得使合法调用在校验层失败」属既有确认基线（公共 schema 源头 + 运行时直接校验依赖 + 适配器注册/注入/剥离 + 既有 strict_input/伪造 token 测试 + T1 先例，见 §2）。
- **F2：成立**——真实 RR `-32602 invalid_union`（`c40011de…`/`f6cd76b2…`）+ 确定性复现（`e6db4183…`，本角色 HEAD `acc5512` 复跑一致）；零效果、涉及文件零候选 delta（见 §3）。

## 11. 纪律声明

- **本记录先于代码（F7）：本步未改任何 `src/`、`test/` 产品或测试代码**；只写 `角色卡/Claude适配器/docs/fix/`（本记录 + 同名证据目录）。
- 未修改 `src/`、`test/`、`docs/`、其它角色文件、角色卡/边界/YAML/治理/权限/验收标准；未 commit/push/stash/merge/发布。
- 未开始实施：B1 尚未冻结，实施待沟通放行；未发现与路由不符的事实（根因确在适配器侧），无偏差/阻塞。
