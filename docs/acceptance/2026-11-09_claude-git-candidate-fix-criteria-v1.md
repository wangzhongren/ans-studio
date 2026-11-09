# Claude 适配器 `__ans_call_context` 与复合（oneOf）schema 兼容窄修复：实施前验收标准 B1 v1

- 日期：2026-11-09；固定身份：ANS 独立验收唯一主上下文（本文件只做实施前验收标准，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 风险档位：**T1**（窄修复：单一角色内部适配器注入变换；不改公共 schema/运行时/共享/跨角色；按受影响单元/层最窄路径验证）。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对同一最终修复候选与本版本判定。
- 依据（写盘前实测）：
  - 路由/定性记录：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`，**88 行 / SHA-256 `18648feeaadf7cc5eb8df3ccbf20a376d025ab700b9b2412a5dd15a8060c9356`**。
  - 真实运行缺陷：`角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（141 行 / `c40011de85229528f2ec10fa198d06e30f1acbbb0c3cc2a3cd5d30e80da5ecbf`）；真实 Claude `git_candidate` `MCP error -32602 invalid_union`、commit 分支 `unrecognized_keys ["__ans_call_context"]`、零效果。
  - 确定性复现：`角色卡/测试/docs/change/2026-11-08_RR_evidence/attempt1/repro-call-context.json`（2,874 bytes / `e6db41837f76d69052d47f8169a4ab338862cfe7fd951e3f4c16bcb37a65c20d`；真实 `describeTool`+`toClaudeSchema`：`git_query`/`write_file` 通过、`git_candidate` 失败）。
  - 既有公共契约（**不可改**）：`src/provider/runtime/schema.ts:95-101`（`git_candidate` 顶层 `oneOf` 四分支，每分支 `additionalProperties:false`）；`src/provider/runtime/tools.ts:4412`（按 `action` 选分支做 `directShapeError`）。
  - Claude 注入机制（只读定位）：`src/provider/claude/session.ts:84`（`CALL_CONTEXT_ARG="__ans_call_context"`）、`:648-653`（注册期只在顶层 `properties` 注入）、`:665-671`（handler 剥离）、`:765-772`（PreToolUse 注入 host token）；转换 `src/common/claude-adapter/schema.ts:233`（`toClaudeSchema` → `check()` → `z.fromJSONSchema(stripConditionals(...))`，`oneOf`→union、`additionalProperties:false`→strict）。
  - 代码基线：worktree `.claude/worktrees/trunk-amendment`，HEAD **`acc5512a3c9004312973538c3073ae2ec5b1ed6d`**（tree `18ad571984705d8ab6297781b5782719bed92a89`）；分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` = 0（干净）；第二变更已合并（PR #74，merge `2e870248…`）。
  - 修复记录（F7，必须先于代码）：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（实施前写盘；本 B1 写盘时尚未存在）。
- 关系：本 B1 只覆盖该窄修复；**不修改 I6 B1、旧 A/J、T1、第二变更 B1/报告或其他 B1**；不改变第二变更已验收候选与公共契约；发布/tag 不授权。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

Claude 适配器对复合（顶层 `oneOf`，对称 `anyOf`）工具 schema 的 `__ans_call_context` 注入兼容；真实 `git_candidate` 四分支（commit/integrate/revert/init）合法入参通过、非法仍拒、`oneOf` 恰一分支；伪造上下文覆盖/剥离；扁平工具不变；未知关键字仍拒绝；窄写集/无公共契约变化；定向测试与真实 Git 写最小运行证据。

### 0.2 必须保留的契约/边界

1. `src/provider/runtime/schema.ts` 的 `git_candidate` `oneOf` 四分支、每分支 `additionalProperties:false`、`required`/`pattern` 等**逐字保留**；`src/provider/runtime/tools.ts` 的 `directShapeError` 分支选择**逐字保留**。
2. `src/common/claude-adapter/schema.ts` 的 `toClaudeSchema` 用途/公开语义不变；不改公共 schema、共享抽象、数据模型、跨角色接口、角色卡/边界/治理/权限/验收标准。
3. 只允许：`src/provider/claude/session.ts`（单文件）+ `test/claude-adapter/`（测试/夹具）+ `角色卡/Claude适配器/docs/fix/`（修复记录/证据）。**不改** `src/common/claude-adapter/`、`src/provider/runtime/schema.ts`、`tools.ts`、共享件、其它角色/模型。
4. 若实施发现必须改公共 schema/共享/跨角色/新增 Section 1 外文件 ⇒ **停止并转普通流程**（F3/F4/F6 失败），本 B1 不适用。

## 1. 基线、修复记录与候选（BASE-1–BASE-5）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **修复记录先于代码（F7）**：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md` 写盘（路径/行数/字节/SHA-256），确认 F1/F2/F4/F8、缺陷/复现、窄写集、验证计划；记录 mtime/顺序早于 `session.ts`/测试代码改动；记录未被后续改写覆盖。 | 修复记录原件/hash；mtime/顺序；记录内容锚点 | 未取证 |
| BASE-2 | 修复基线：HEAD `acc5512`（tree `18ad5719`）、分支、暂存 0、`src app test` 干净；第二变更已合并；公共 schema/tools/claude-adapter 基线 hash 记录。 | 基线 status/HEAD/tree；公共文件 hash；PR #74 记录 | 未取证 |
| BASE-3 | 候选身份：绝对检出、HEAD/分支、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合与算法、树/manifest（`src app test`）；候选只含允许文件；T1 三文件/其它 B1 证据不混入。 | 变更包/候选清单；逐文件 hash/聚合/树/manifest；稳定性快照 | 未取证 |
| BASE-4 | 范围/公共契约：`git diff` 对 `src/provider/runtime/schema.ts`、`tools.ts`、`src/common/claude-adapter/`、共享件、其它角色/模型、角色卡/边界/方案/验收 = 0；`tools.ts` 仍以原 `oneOf` 分支校验；无新文件/删除/重命名越界；无 `app/` 改动（渲染 N/A 依据）。 | 逐文件 diff/numstat；公共文件 hash 对照；scope 清单 | 未取证 |
| BASE-5 | 稳定性：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建变化使证据失效并重取。 | manifest/聚合/树前后快照；diff 0 | 未取证 |

## 2. 兼容性 AC（AC-1–AC-8）

### 2.1 真实 schema/四分支与负例（AC-1–AC-3）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-1 | **真实 `git_candidate` 四分支合法入参通过**：只读 `import { describeTool }` 取得真实公共 schema（不得复制/改写），走真实 adapter 注册/MCP 客户端（真实 `toClaudeSchema`/`registerTool`），对 commit / integrate / revert / init 各一组合法入参并携带 `__ans_call_context`（host token）调用：全部通过；原 `invalid_union; unrecognized_keys ["__ans_call_context"]` 消失；**`oneOf` 恰一分支命中**；分支 `required`/`pattern`/`additionalProperties:false` 不被放宽。 | 四分支原始输入/回执/日志；真实 describeTool/toClaudeSchema/registerTool 证据；oneOf 命中计数；schema 原文对照 | 未取证 |
| AC-2 | **非法入参仍拒**：未知额外字段（非上下文）、错误 action/分支字段组合、缺 required、错误 pattern/类型、`additionalProperties:false` 违规 → 仍被 MCP/工具层拒绝；不得因新增字段使任一非法输入通过；`oneOf` 仍恰一分支（不得出现多分支同时命中）。 | 各负例原始输入/错误码/日志；oneOf 多命中负例；schema 约束对照 | 未取证 |
| AC-3 | **伪造上下文不可用**：模型在参数中伪造 `__ans_call_context`（任意值/空/非字符串/保留名冲突）→ PreToolUse 用 host token 覆盖模型值；handler 前只剩 public args（无上下文）；模型值不进入上下文映射/handler/审计/日志；未知 token/旧 token 不执行；不得把模型值当授权。 | 伪造/覆盖/剥离原始轨迹；hook updatedInput；handler args；审计/日志零泄漏；未知/旧 token 负例 | 未取证 |

### 2.2 扁平工具、未知关键字与助手不变量（AC-4–AC-6）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-4 | **扁平（非 oneOf）工具行为不变**：`git_query`/`git_publish`/其它无顶层 `oneOf` 的工具仍只在顶层获得可选上下文；合法入参携带上下文通过、非法仍拒；不新增分支/不改变原有 required/pattern/additionalProperties；Pi/Codex 路径不注入该字段、行为不变。 | 扁平工具正/负例原始回执；schema 前后对照；Pi/Codex 只读回归 | 未取证 |
| AC-5 | **助手不变量**：`claudeToolInputWithCallContext(schema)`（名称可等价）返回**深拷贝**、不修改入参/公共 schema；顶层 `properties` 增加可选 `__ans_call_context:{type:"string",...}`；对顶层 `oneOf`（对称 `anyOf`）每个 `additionalProperties:false` 对象分支的 `properties` 补同字段；保留 `required`/`pattern`/`additionalProperties:false` 原样；不递归超出顶层分支；顶层或任一目标分支已有保留名 ⇒ **抛错**（不静默覆盖）；无分支/非对象分支不误加。 | 助手单测原始输出；深拷贝/入参不可变断言；顶层/分支前后 schema deep-equal（仅允许新增字段）；冲突负例；anyOf 对称用例 | 未取证 |
| AC-6 | **未知关键字仍拒绝、条件语义不变**：真实 `toClaudeSchema` 对未知/不支持关键字仍抛错（不静默丢弃）；`stripConditionals`/`superRefine` 条件约束行为不变；`oneOf` 转换/校验仍生效；新增字段不改变条件约束/未知关键字拒绝路径。 | 未知关键字负例原始错误；条件约束正/负例；schema.test 回归 | 未取证 |

### 2.3 测试/真实运行（AC-7–AC-8）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| AC-7 | **定向测试/静态门**：`test/claude-adapter/*.test.ts`（含新增四分支矩阵、负例、伪造上下文、扁平工具、未知关键字、深拷贝/冲突）逐文件或等价运行记录 tests/pass/fail/cancelled/skip/exit；`npm run typecheck` exit 0；受影响套件无新增确定性失败/新 skip；候选/manifest 前后不变。 | 命令/环境/退出/计数/日志 hash；逐文件结果；typecheck 日志；失败/skip 对照 | 未取证 |
| AC-8 | **真实 Git 写最小运行**：受保护目标项目 + 真实 Claude + 真实桌面 UI；**1 条客户消息**；`dispatch_task` ≤1 次应用处理器调用；**Git 能力调用 ≤2 次**；审批卡 ≤2 张；墙钟 **10–15 分钟**；首个决定性失败/成功即停；不自动重试/不追加预算。目标：`git_candidate commit` **经 MCP 校验成功并到达应用处理器**；若成功，产出 sidecar `authorization.jsonl` + `git.json` + candidate ref；若出现下一真实门，如实报告（不得伪造/不宣称已产出）。可复用第二变更 RR 环境/launcher/CDP 驱动，但证据必须属于本修复候选。 | 真实运行诊断/日志/任务账本/工具回执/审计/sidecar/journal/ref/截图；预算/中止记录；下一门原文；候选/环境 | 未取证 |

## 3. 证据与检查要求（EV1–EV6）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/候选：BASE-1–BASE-5；修复记录先于代码；候选只含允许文件；公共契约零变化；候选/manifest/聚合/树稳定；T1/其它 B1 不混入。 | 未取证 |
| EV2 | 真实 schema 矩阵：真实 `describeTool` 四分支 + `__ans_call_context` 正例全部通过、非法负例仍拒、oneOf 恰一；分支约束（required/pattern/additionalProperties:false）逐字保留；不得用复制 schema/手写近似替代。 | 未取证 |
| EV3 | 注入/剥离/伪造：PreToolUse 覆盖模型值、handler 剥离、上下文映射/审计/日志零泄漏；未知/旧 token 拒绝；既有 `session.test.ts` 伪造/冲突用例回归。 | 未取证 |
| EV4 | 助手不变量：深拷贝/入参不可变/冲突抛错/oneOf+anyOf 对称/仅 additionalProperties:false 分支/required/pattern 保留；扁平工具不变；未知关键字拒绝。 | 未取证 |
| EV5 | 范围/静态门：公共 schema/tools/claude-adapter/共享/其它角色 diff 0；只允许 `session.ts`+`test/claude-adapter/`+fix 记录；`test/claude-adapter/*` 计数/退出/日志 hash；typecheck 0；无新失败/新 skip。 | 未取证 |
| EV6 | 真实运行：AC-8 预算/纪律/目标/下一门/停止；证据原件（sidecar/journal/ref/回执/截图）与候选一致；不伪造不追加预算。 | 未取证 |

## 4. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前修复候选上全部观察有完整、可复算原始证据；真实 `git_candidate` 四分支合法入参通过、非法仍拒、oneOf 恰一；伪造上下文覆盖/剥离；扁平工具/未知关键字不变；助手深拷贝/冲突/分支保留；范围仅允许文件且公共契约 diff 0；定向测试/typecheck/受影响套件齐备；真实运行预算/纪律/目标或下一门如实；修复记录先于代码。
- **fail**：改公共 `schema.ts`/`tools.ts`/`claude-adapter`/共享/跨角色；把 `__ans_call_context` 预置进公共 schema 或放宽 `additionalProperties`/`required`/`pattern`；未知关键字静默丢弃；伪造上下文未被覆盖/剥离或模型值进入授权；`oneOf` 多分支命中；扁平工具行为改变；Pi/Codex 受影响；真实运行仍 `invalid_union`/未到应用层却宣称成功；sidecar/journal/ref 伪造；新增确定性失败/新 skip；删除/放宽断言/加 skip/force-exit；修复记录晚于代码；越界写集/提交/发布。
- **insufficient evidence**：缺基线/候选/hash/公共文件对照；缺真实 describeTool/toClaudeSchema/registerTool 证据；用复制/近似 schema 代替真实 schema；四分支/负例/oneOf 多命中矩阵不全；伪造上下文/剥离/未知关键字证据缺失；助手深拷贝/冲突/anyOf 证据缺失；真实运行预算/中止/失败/下一门未保留；测试日志/命令/环境/退出/计数缺失；修复记录缺失/顺序无法核对。
- **not applicable**：仅限有明确依据者，例如 `typecheck:renderer`/`build:renderer`（本修复不触及 `app/renderer/**`/`app/main.ts`，须给依据）；真实 Pi/Codex 模型运行（本修复只要求真实 Claude；Pi/Codex 以只读回归/确定性覆盖，确定性仍必需）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接旧候选/旧证据/不同环境。

## 5. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；修复记录路径/写集/验证计划明确 | — |
| 修复记录（F7） | `角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md` 先于代码；确认 F1/F2/F4/F8、窄写集/验证计划 | 不进入实施；补记录/回路由 |
| 实施（T1） | 仅 `session.ts`+`test/claude-adapter/`+fix 记录；公共契约 diff 0；助手/测试/伪造/扁平/未知关键字满足 AC-1–AC-7、EV1–EV5 | 回 owner；越界即停止转普通流程 |
| 真实运行 | AC-8 预算/纪律/目标或下一门完成并如实报告 | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 全部适用项按本 B1 判定；修复记录/证据链齐备；披露充分 | 报告 pass/fail/insufficient；不授权发布 |

**复判规则**：本 B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/公共契约/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取；证据复用须证明候选关联且输入/依赖/契约/命令/环境未变；旧 B1/第二变更证据不得冒充本修复候选当前证据；发布/tag 未授权。

## 6. 范围限制与披露

1. 本 B1 只覆盖 Claude 适配器 `__ans_call_context` 与顶层 `oneOf`/`anyOf` strict 分支兼容的窄修复；不覆盖公共 schema 重构、其他适配器、Git 写门/初始化语义、第二变更范围。
2. **公共契约不可改**：`src/provider/runtime/schema.ts:95-101` 与 `tools.ts:4412` 的 `oneOf` 分支选择/直接校验是既有契约；若修复必须改它们，停止并按普通流程（F4/F6 失败），本 B1 作废。
3. **模型可见语义**：新增字段是宿主注入、应省略的内部可选字符串；PreToolUse 覆盖模型值、handler 剥离；不得把该字段变成模型可控授权输入。
4. **真实运行限制**：只要求真实 Claude（P1.4/P1.2 §6.2）；Pi/Codex 不要求真实模型；真实运行只承诺本次候选/环境/输入下证据；若出现下一真实门，如实报告，不宣称完整 Git 写/闭环/发布/长期稳定性。
5. **B1 只写 `docs/acceptance/`**；未改代码/方案/角色卡；未运行真实模型；不授权实施/提交/推送/合并/发布。不修改 I6/旧 A/J/T1/其他 B1；本 B1 只对本修复候选有效。
6. **修复通道**：T1 窄修复依赖 F1–F9；若实施中 F3/F4/F6 不再成立（需改公共/共享/跨角色/新文件/升 T2/T3），立即停止、路由作废，按普通流程补闸门。

## 7. 当前状态

- **B1 完成、冻结（实施前）**；BASE-1–5、AC-1–8、EV1–EV6 当前全部 `未取证`，不得判 pass。
- 后续由同一独立验收身份在修复记录/实现/定向测试/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并。
- 本 B1 与 I6/旧 A/J/T1/第二变更 B1/其他 B1 分开；发布/tag 不在授权内。
