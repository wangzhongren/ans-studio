# 修复记录：Claude schema 适配器支持条件约束（if/then/else/not/contains）（2026-11-07）

- 角色：Claude适配器（缺陷所有者）；派发：`docs/scheduling/2026-11-07_fix-routing_claude-schema-if.md`；客户授权：`docs/communication/2026-11-07_authorization_claude-schema-fix.md`（sha256 `f76fd1637caf77816940b5c6e800037b290368cbdbd5b19c319593f221e32209`，客户原话「A」=「修，并重跑真实测试」）。
- 风险档位：T1（单一角色内部实现；不改公共工具 schema、共享契约、模型或公共入口）。
- 本记录先于代码与测试改动（F7）。

## 1. 症状与触发条件

真实 Claude 会话在首回合失败：`MODEL_REQUEST_FAILED`，原因 `Claude SDK 运行失败：tool input.target.allOf: unsupported JSON Schema keyword if`。

触发条件：`src/provider/runtime/schema.ts` 导出的公共工具参数 schema 在任意深度使用 `if/then/else/not`（以及条件片段内使用的 `contains`）。实际使用点：

- `git_query` / `git_candidate` / `git_publish` 的 OID（`target`、`other`、`basis.oid`、`candidates[]`、`commit`、`candidate`、`criteria[]`、`evidence[]`）按 `objectFormat` 区分 sha1 40 位 / sha256 64 位；
- `decide_pending_request` 的 `disposition` 条件（`select` ⇒ 必填 `selected`；reject/revise ⇒ 不得携带 `selected`）；
- `dispatch_task` 的 `reviewTarget.candidate` OID 条件与 `resumeController` 条件（存在 ⇒ `roleId=convener` 且不得同时给 `reviewTarget`/`sourceTaskId`）；
- `submit_version_change` 的直接提交条件（`operationId`/`baseTrunk`/`expectedFromSha256` 的存在性 ⇒ 相应必填），其 `if` 内使用 `contains`。

证据：

- 真实运行：`C:\Users\51054\Desktop\work\ans-dogfood-run-2026-11-07\probe-1\dogfood-probe.jsonl`（`5c0f0f25…`）、`probe-2\drive-log.jsonl`（`c8345bd2…`）、诊断 `8ed236bb…`。
- 离线复现：修复前 `toClaudeSchema(describeTool("git_query").parameters, z)` 抛 `tool input.target.allOf: unsupported JSON Schema keyword if`（`test/claude-adapter/schema.test.ts` 覆盖）。

## 2. 预期行为与来源（F1）

既有公共工具 schema 已用 JSON Schema 条件约束表达业务规则（见 §1 使用点）。Claude 适配器的职责是把这些**既有**约束如实转换为 Claude/MCP 可用的 Zod 校验：条件命中时 `then` 生效、未命中时 `else`/原行为一致；不得放宽、丢弃或仅做表面白名单。该预期来自既有公共工具 schema（运行时核心所有）与适配器「拒绝未知约束、绝不静默丢弃」的既有设计，不是新增行为。

**F1 结论：成立**（预期行为在既有确认基线内）。

## 3. 实际结果与复现（F2）

真实运行首回合失败（§1 证据）；离线 `toClaudeSchema` 对含 `if` 的 schema 直接抛错，会话无法建立。可观察、可复现，非猜测。

**F2 结论：成立**（实际结果偏离预期，且有两份运行日志与离线复现）。

## 4. 根因

`src/common/claude-adapter/schema.ts` 的 `supported` 白名单不含 `if/then/else/not`，`check()` 遇到即抛错；条件片段内使用的 `contains` 也不在白名单。设计意图是拒绝未知约束、避免转换器静默丢弃，但把公共工具 schema 合法使用的条件关键字误判为未知约束，导致整个会话注册失败。会话侧既有的两处 `dispatch_task` 精确形状改写（`src/provider/claude/session.ts::claudeMcpInputSchema`）只覆盖 dispatch，无法覆盖 git / decide_pending_request / submit_version_change 等其余条件。

## 5. 修复后行为

在 `src/common/claude-adapter/schema.ts`（及同目录必要代码）内实现受控的语义等价转换：

1. `check()` 接受 `if/then/else/not`（任意深度）与 `contains`（仅条件片段内）；子 schema 递归校验，条件片段内的 `required` 允许引用父级 `properties`（JSON Schema 语义），未知关键字仍拒绝。
2. 转换：剥离条件关键字得到基础 schema 交 `z.fromJSONSchema`（无条件的旧 schema 路径逐字不变）；若存在条件，则用条件求值器在 `superRefine` 中按 JSON Schema 语义执行——`if` 命中执行 `then`、未命中执行 `else`，`not` 取反，含条件的 `anyOf`/`oneOf` 分支整体求值；求值器覆盖适配器支持的关键字全集（type/enum/const/pattern/长度/数值/properties/required/additionalProperties/items/contains/allOf/anyOf/oneOf/not/if-then-else）。
3. 条件语义在嵌套路径（`properties.target`、`properties.reviewTarget.candidate`、`resumeController`）、数组 `items`、`additionalProperties` 与真实工具 schema 上由测试证明；不放宽、不丢弃。

## 6. 范围与非目标

- 允许改动：`src/common/claude-adapter/`、`test/claude-adapter/`、`角色卡/Claude适配器/docs/fix/` 与 `docs/change/`、本人 memo 等 §1 既有文件。
- 不改 `src/provider/runtime/schema.ts` 公共工具 schema、共享契约/模型/公共入口/其他角色文件/角色卡/边界/治理规则/权限/验收标准；不新增 §1 外文件；不提交/推送/合并/发布；不运行真实 Claude（由调度在修复后安排重跑）。
- 非目标：为适配器引入通用 JSON Schema 全量校验器或改写公共工具 schema；改变 MCP 对外展示的 JSON Schema 形状（条件约束由 Zod `safeParse` 执行校验，`z.toJSONSchema` 仅用于展示）。
- 既有测试调整：`test/claude-adapter/session.test.ts` 中两例以旧行为（拒绝 `if`/一般 `not`）为断言的用例，将按新语义改写为「条件约束必须被强制执行、不得静默丢弃」的断言；不删测试、不加 skip、不放宽原有拒绝未知关键字/保留字段的断言。旧失败证据保留。

## 7. 回归场景与证据

- 定向：`node --test test/claude-adapter/schema.test.ts` → exit 0，10/10 通过（0 fail/0 skip）。
- 受影响套件：`node --test test/claude-adapter/*.test.ts` → exit 0，116/116 通过（0 fail/0 skip）。
- `npm run typecheck` → exit 0（本修复未触及 renderer，未跑 `typecheck:renderer`）。
- `git diff --check` → exit 0。
- 额外离线检查：`describeTool` 全部 45 个工具 schema 均可转换（0 失败），真实 git/dispatch/decide/submit_version_change 条件正反例通过（见 `test/claude-adapter/schema.test.ts`）。
- 证据目录：`角色卡/Claude适配器/docs/fix/2026-11-07_claude-schema-fix-evidence/`（`fix.diff`、`targeted-schema-test.txt`、`claude-adapter-suite.txt`、`typecheck.txt`、`environment.txt`、`sha256.txt`、`evidence-sha256.txt`）。
- 覆盖：直接 `if/then/else` 命中/未命中正反例；`not` 正反例；真实 `describeTool` 的 git OID（sha1/sha256）、`dispatch_task`（reviewOid、resumeController）、`decide_pending_request` disposition、`submit_version_change` 直接提交条件；未知关键字仍拒绝；无 `if` 的旧 schema 行为不变；嵌套 `items`/`additionalProperties`。

## 8. F3–F9 复核（本角色可确认项）

- F3/F5/F8：改动均在本角色 Section 1 内（`src/common/claude-adapter/`、`test/claude-adapter/`、`角色卡/Claude适配器/docs/fix/`、memo），无新增 §1 外文件。
- F4：不改公共工具 schema/共享契约/公共入口；`toClaudeSchema` 签名与用途不变，仅补齐既有条件约束的转换语义。
- F6：T1 不变；未触及共享 schema 或治理语义。
- 实施中未发现需要修改 `src/provider/runtime/schema.ts`、共享契约或其他角色文件的情形；无停止/扩权事项。
