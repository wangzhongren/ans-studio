# Claude 适配器 `__ans_call_context` 与复合（oneOf）schema 兼容窄修复：独立验收 B2 报告（v1）

- 日期：2026-11-09；身份：ANS 独立验收唯一主上下文（同一身份；只按 B1 v1 判定，不改方案/代码/测试/角色卡）。
- 模式：轻量但诚实（独立复算 2 文件候选与公共契约零变化；抽查修复记录、6 个新用例、真实运行原件；定向复跑；未运行真实模型/Electron/CDP）。
- 结论：**pass**（19 pass / 0 fail / 0 insufficient evidence / 0 not applicable；BASE-1–5 + AC-1–8 + EV1–6 共 19 项）。无 fail、无安全旁路/代码返工；AC-8 按 B1「MCP 成功到达应用处理器、首个决定性结果即停、如实下一门」判 pass（下一门为夹具派发路径，不属本修复范围，已披露）。
- 唯一判据：`docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`（109 行 / 17,638 bytes / `a1baa41e94bef0fc62985d7451d86d85170a2482d0fd1c82be27a3f5ed486412`）。
- 未授权：提交/推送/合并/发布/tag；本报告只写 `docs/acceptance/`。

## 1. 输入与候选身份

### 1.1 输入（实测）

| 输入 | 实测 |
| --- | --- |
| 路由/定性 | `docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`；88 行 / `18648feeaadf7cc5eb8df3ccbf20a376d025ab700b9b2412a5dd15a8060c9356` |
| B1 v1 | `docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`；109 行 / `a1baa41e…` |
| 修复记录（F7） | `角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`；124 行 / 17,881 bytes / `57451f902faaa829176b7e7262779875c1bfad48115ffe5bb14f66391695e510`；mtime `2026-11-09 08:30:29.90 +0800`，早于 `session.ts` `08:34:44.12`、`session.test.ts` `08:37:47.72`；实施后未改写 |
| E1 变更包 | `docs/scheduling/2026-11-09_change-package_claude-git-candidate-fix.md`；84 行 / 13,469 bytes / `65bfd12d13c80a1ec334167ce7b22f7746b57d6c5bbc1f28f8b0f34200a240e8` |
| 派发记录 | `docs/scheduling/2026-11-09_dispatch-log_claude-git-candidate-fix.md`；`227c2b00…` |
| 缺陷证据 | RR `c40011de…`；确定性复现 `attempt1/repro-call-context.json`（2,874 bytes / `e6db4183…`）；`attempt2/product-sdk-tool-facts.json` `f6cd76b2…` |
| 修复证据目录 | `角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context-evidence/`（impl/real-run/candidate）；`sha256-index.txt` 逐文件索引 |

### 1.2 候选与公共契约（独立复算）

- HEAD `acc5512a3c9004312973538c3073ae2ec5b1ed6d`（tree `18ad571984705d8ab6297781b5782719bed92a89`）；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` = **2 项（均为修改）**。
- 候选 2 文件：
  - `src/provider/claude/session.ts`：`a3e3d4276f9fa9713d47d4b6b4a0ac06008fd0ffc87bbeec25d2ae2ddca8c26b`（HEAD blob `58e7514…`；+35/−5）。
  - `test/claude-adapter/session.test.ts`：`6379bc8ef7a26a700b1dcd937bba7429dec3704fa11027f44c119fd5b8469e67`（HEAD blob `441e0b4…`；+265/−2，仅 import/新增用例，无删除/放宽断言、无 skip/force-exit）。
- **候选聚合（canonical 两空格）**：**`5427e1774105bc83a74383c1e49cb2e8c1f9d15cecd7406bb6659954e21a258a`**（逐文件 raw sha256、`<hash>  <path>`、`LC_ALL=C` 整行排序、含末行换行；独立复算一致）。星号格式 `09e1a93a…` 由同一逐文件哈希仅分隔符不同导出，非内容差异。
- **工作树 manifest**：**1,105 文件 / `2d0ab31b66481a22869e6d18d1fbbf96099335f9e601c6e37aecf83552268e99`**（逐文件 raw sha256、两空格、行排序、含末行换行；独立复算一致）。HEAD `git ls-tree -r HEAD -- src app test` 树指纹 `b433282d…`（1,105 行）与基线一致。
- **公共契约零变化（BASE-4）**：`git diff --quiet HEAD -- src/provider/runtime/schema.ts src/provider/runtime/tools.ts src/common/claude-adapter/` **exit 0**；worktree git object id 与 HEAD 相同（`schema.ts` `71597ff62fb438793b962a808f36a576ae0a488b`、`tools.ts` `797e129b5fcf6e569cfaad5d683735f0a5cdc3ff`、`common/claude-adapter/schema.ts` `748846e2243ce95fbe34fee1ff4774831e4734ab`）。
- **写集合规**：仅 `src/provider/claude/session.ts` + `test/claude-adapter/session.test.ts`（+ 允许的 role docs/fix 证据）；无 `app/`、公共 schema/tools/claude-adapter/共享/其它角色/模型改动；无越界/新增/删除。
- 独立复跑：`test/claude-adapter/*.test.ts` **128/128 pass、0 fail、0 skip、exit 0**；`npm run typecheck` **exit 0**；复跑前后候选/manifest/HEAD/tree/分支/暂存不变。
- **BASE-5 披露**：real-run `00-pre-state.txt`/`01-post-state.txt` 记录的是 HEAD tree 指纹 `b433282d…`（1,105 行）而非 canonical worktree manifest `2d0ab31b…`；B2 独立复算当前 worktree manifest `2d0ab31b…`，两文件 hash/status/HEAD/tree 前后一致；未发现候选/文件变化。此为本证据标签/口径限制，非候选改动。

## 2. 确定性证据（AC-1–AC-7）

- **AC-1 真实 `git_candidate` 四分支**：`test/claude-adapter/session.test.ts` 新用例使用真实 `describeTool("git_candidate")` 公共 schema + 真实 adapter 注册/真实 MCP Client（真实 `toClaudeSchema`/`registerTool`）；commit/integrate/revert/init 四分支合法入参携带 `__ans_call_context` **4/4 通过**；原 `invalid_union; unrecognized_keys ["__ans_call_context"]` 消失；handler 收到剥离后参数；公共 schema 四分支 `required`/`pattern`/`additionalProperties:false` 与原文逐字一致；`oneOf` 四分支 action enum 互斥，恰一分支命中。
- **AC-2 非法仍拒**：未知额外字段、commit+candidates、revert+paths、缺 `paths` 的 commit、`message` 类型错误、sha1/64hex 条件错误、未知 action → 全部仍被 MCP/工具层拒绝，handler 不启动；`oneOf` 仍恰一分支（未因新增字段多分支命中）。
- **AC-3 伪造上下文**：模型伪造字符串/空串/非字符串 → PreToolUse 以 host token 覆盖、handler 前剥离、模型值不进入事件/审计/日志；绕过 hook 的直接未知 token → handler 守卫拒绝；非字符串由 schema 拒绝；既有伪造/冲突/迟到 token 用例回归。
- **AC-4 扁平工具/Pi/Codex**：`git_query`/`git_publish` 仅顶层增加可选字段，required/严格性/其它属性逐字不变；合法+上下文通过、非法仍拒；Pi/Codex 源码零 `__ans_call_context` 引用；扁平工具无 `oneOf`/`anyOf`。
- **AC-5 助手不变量**：`claudeToolInputWithCallContext` 深拷贝、入参/公共 schema 不修改；顶层与顶层 `oneOf`+`anyOf` 的 `additionalProperties:false` 对象分支补同一可选 `{type:"string"}`；`required`/`pattern`/`additionalProperties:false` 原样；不递归嵌套；非对象/非严格分支不误加；顶层/目标分支保留名冲突抛错；无 `properties` 的严格对象分支也获得字段；扁平严格对象仅顶层加字段。
- **AC-6 未知关键字/条件语义**：分支内 `patternProperties` 仍在注册期被 `toClaudeSchema` 拒绝（`unsupported JSON Schema keyword`），不静默丢弃；真实 `git_candidate` 的 sha1⇒40/sha256⇒64 条件仍生效；条件正/负例通过。
- **AC-7 测试/静态门**：`test/claude-adapter/*.test.ts` 基线 122/122 → 修复后 **128/128 pass**（+6 用例，session.test 65→71；其余文件计数不变；0 新失败/0 新 skip）；`npm run typecheck` exit 0；候选/manifest 前后不变。
- **只读探针**：`impl/probe-emitted-git-candidate-schema.log` 记录注册 schema hash `e282e2eb…`、公共 schema hash `10159eb9…`、`inputsUnchanged:true`；四分支正例 4/4、负例仍 `-32602 invalid_union`/条件失败；`runtime-core` 7 例 linked worktree `.git`-file 环境事实、纯净副本 45/45，与本修复无因果（披露）。

## 3. 真实运行（AC-8）

- **环境**：仓库外临时根 `ans-dogfood-call-context-fix-2026-11-09/rr/`；受保护目标（init-source `00:42:34.541Z` 早于 product `session.open.ready` `00:42:34.693Z`）；治理记录/审计预检 OK；真实 Electron（本 worktree `app/main.ts`、隔离 userData、CDP 9222）+ 真实 Claude + 真实桌面 UI；复用第二变更 RR launcher/CDP 驱动（只读）。
- **预算/实测**：客户消息 1；`dispatch_task` 模型 1 / 应用处理器 1（`task.created` 1 行）；Git 能力调用 2（`git_query` observed；`git_candidate` 到达应用处理器）；审批卡 0；发送→停止 ≈23.1 s（远低于 10–15 分钟）；无自动重试；首个决定性结果即停。
- **MCP 通过**：`real-run/product-sdk-tool-facts.json`（3,865 bytes / `185bc13b…`）显示 `git_candidate {action:"commit", base.ref:"refs/ans/trunk", base.oid:28b0829…}` 的工具结果为应用回执 JSON `{"status":"blocked","code":"git-worker-task-unproven","message":"The actual open assigned module task is unavailable"}`——**不是** MCP `-32602 invalid_union`，即 MCP 校验通过并到达应用处理器；`write_file` 成功（79 字节）、`git_query` observed。
- **下一真实门**：`src/service/trunk/impl/git-capabilities.ts:263-268` 要求 worker Git 写任务恰一条 `task.created` 且 `from:"convener"` + `flowId` + `moduleId`；本次 RR 的 `tasks.jsonl` 为 chief hub 派发（`from:"chief"`、无 `moduleId`）⇒ 在 candidate/journal/sidecar 生成前被拒。**sidecar `authorization.jsonl`、`git.json`、candidate ref 均未产出**（`operations-inventory.json=[]`、refs 仅 `refs/heads/master`、无 candidate ref）；不伪造、不宣称完整 Git 写成功。
- **停止/披露**：git_candidate 回执后立即 halt；`tasks.jsonl` 仅 `task.created`，`task.delivered`/`task.reported` 未落账（delivery.claim 00:42:34.719–721 已记录）；应用/驱动/浏览器关闭、9222 无残留。运行前后 HEAD/tree/分支/暂存/status/两文件 hash/树指纹同值（canonical worktree manifest `2d0ab31b…` 由 B2 独立复算；见 §1.2 BASE-5 披露）。
- **AC-8 判定：pass（下一门分支）**：B1 AC-8 明确允许「经 MCP 成功并到达应用处理器」后如实报告下一门；目标 MCP 修复已达成，sidecar/journal/ref 未产出属下一门（非本修复范围），未伪造/未宣称；预算/纪律/首个决定性结果即停成立。下一门为夹具派发路径（chief 无 moduleId），接受为披露。

## 4. B1 逐项判定

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| BASE-1 | pass | 修复记录 `57451f90…` 先于代码（mtime 08:30:29 < session.ts 08:34:44 / test 08:37:47），F1/F2/F4/F8 与窄写集/验证计划齐备；实施后未改写。 |
| BASE-2 | pass | 基线 HEAD `acc5512`/tree `18ad5719`/分支/暂存 0/`src app test` 干净；第二变更已合并 PR #74；公共文件 hash 记录。 |
| BASE-3 | pass | 候选仅 2 文件（修改）；逐文件 hash/聚合 `5427e177…`/manifest 1,105/`2d0ab31b…`/树 `b433282d…`；T1/其它 B1 不混入。 |
| BASE-4 | pass | 公共 `schema.ts`/`tools.ts`/`common/claude-adapter/` diff 0，object id 同 HEAD；无共享/跨角色/`app/` 改动；无越界。 |
| BASE-5 | pass（披露） | 两文件 hash/status/HEAD/tree/树指纹前后同值；canonical worktree manifest `2d0ab31b…` 独立复算当前值；pre/post 状态文件记录的是 HEAD tree 指纹 `b433282d…`（标签/口径限制），无候选变化。 |
| AC-1 | pass | 真实 `describeTool`/真实 adapter 注册/MCP Client；四分支合法+context 4/4；invalid_union 消失；分支约束逐字、oneOf 恰一。 |
| AC-2 | pass | 未知字段/错分支字段/缺 required/类型/pattern/未知 action 全部仍拒；handler 不启动；无多分支命中。 |
| AC-3 | pass | 伪造字符串/空/非字符串均被 host token 覆盖、handler 剥离、事件/审计零泄漏；未知 token 拒绝；既有回归。 |
| AC-4 | pass | 扁平 `git_query`/`git_publish` 仅顶层加字段、行为/严格性不变；Pi/Codex 源码零引用。 |
| AC-5 | pass | 助手深拷贝/入参不可变/oneOf+anyOf strict 分支/required+pattern+additionalProperties:false 保留/不递归/冲突抛错/无 properties 严格分支。 |
| AC-6 | pass | 分支内未知关键字注册期仍拒；条件 sha1/sha256 语义不变；不静默丢弃。 |
| AC-7 | pass | `test/claude-adapter/*` 128/128（+6，0 新失败/新 skip）；typecheck 0；候选/manifest 前后不变。 |
| AC-8 | pass（下一门） | 真实 UI/Claude：MCP 成功到达应用处理器（无 -32602）；应用回执 `git-worker-task-unproven`；sidecar/journal/ref 未产出（下一门，夹具派发缺 moduleId）；预算 1 消息/dispatch 1/Git 2/卡 0/≈23.1s；首个决定性结果即停；如实披露停止账本缺口。 |
| EV1 | pass | 基线/候选/修复记录/公共契约/写集/稳定性；BASE-1–5 证据齐备。 |
| EV2 | pass | 真实 schema 矩阵四分支/负例/oneOf/约束保留；非复制/近似。 |
| EV3 | pass | PreToolUse 覆盖、handler 剥离、未知/旧 token、事件/审计零泄漏；既有伪造/冲突回归。 |
| EV4 | pass | 助手深拷贝/冲突/anyOf/仅 strict 分支/required/pattern 保留；扁平工具/未知关键字不变。 |
| EV5 | pass | 公共 diff 0；仅允许写集；128/128 + typecheck 0；0 新失败/新 skip；候选/manifest 稳定。 |
| EV6 | pass | 真实运行预算/纪律/目标/下一门/停止原件；sidecar/journal/ref 零产出如实；候选一致；不伪造不追加。 |

**统计**：**19 pass / 0 fail / 0 insufficient evidence / 0 not applicable**（BASE 5 + AC 8 + EV 6）。

## 5. 披露审查

| 项 | 结论 |
| --- | --- |
| 下一门 `git-worker-task-unproven` | 接受为披露：属 worker Git 写任务绑定契约（生产须 convener + flowId + moduleId），本次 RR 为 chief hub 派发无 moduleId；不属 T1 适配器修复范围；MCP 通过/到达应用处理器已证，sidecar/journal/ref 未产出并如实披露。 |
| 停止账本缺口 | `tasks.jsonl` 仅 `task.created`，`task.delivered`/`task.reported` 未落账（stop 在 git_candidate 回执后立即触发）；delivery.claim 时间戳在；如实披露，不影响 MCP/应用处理器到达事实。 |
| BASE-5 manifest 口径 | pre/post 状态记录 HEAD tree 指纹 `b433282d…`，非 canonical worktree manifest；B2 独立复算 manifest `2d0ab31b…`，两文件 hash/status/tree 前后同值；标签/口径限制，无候选变化。 |
| 公共契约/范围 | `schema.ts`/`tools.ts`/`common/claude-adapter/` diff 0、object id 同 HEAD；仅 2 文件 + role docs/fix 证据；无越界/提交/发布。 |
| `runtime-core` 7 例 | linked worktree `.git`-file 环境事实，纯净副本 45/45；与本修复无因果；如实披露。 |
| Pi/Codex/真实模型 | 只要求真实 Claude；Pi/Codex 以源码/确定性回归覆盖，未跑真实模型；不宣称其真实行为。 |
| 既有 tool-list 事实 | union 型注册的 `tools/list` 输出 `{type:"object",properties:{}}`、校验在服务端 Zod，修复前后一致；如实披露。 |
| 发布/tag | 未授权；未提交/推送/合并/发布。 |

## 6. 结论与状态

- **总体：pass**（19 pass / 0 fail / 0 insufficient / 0 N/A）。
- 修复目标（`git_candidate` 四分支经 MCP 校验成功并到达应用处理器）达成；原 `invalid_union; unrecognized_keys ["__ans_call_context"]` 消失；非法仍拒、oneOf 恰一、伪造上下文覆盖/剥离、扁平工具/未知关键字不变、公共契约零变化、写集合规。
- AC-8 的下一门 `git-worker-task-unproven` 为夹具派发路径（chief 无 moduleId），不属本 T1 修复范围；sidecar/journal/ref 未产出，已如实披露，不宣称完整 Git 写成功。
- 无 fail、无安全旁路/代码返工；披露（下一门、停止账本、manifest 口径、runtime-core 环境、Pi/Codex 未真跑）充分。
- 本报告只写 `docs/acceptance/`；未修改代码/测试/方案/角色卡/B1；未 commit/push/merge/release。

## 7. 当前状态与限制

- 本 B1 v1 修复候选已按 B1 判 pass；发布/tag、提交/推送/合并未授权。
- 证据引用均为当前候选（2 文件/`5427e177…`）；若候选/基线/公共契约变化，按 B1 复判规则重取。
- 未运行真实模型/Electron/CDP（B2 只读复核既有真实运行证据）。
