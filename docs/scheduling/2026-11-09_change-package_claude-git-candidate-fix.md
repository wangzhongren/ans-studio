# E1 变更包：Claude 适配器 `git_candidate` MCP schema 窄修复（T1，2026-11-09）

- **任务 ID**：`2026-11-09-claude-git-candidate-call-context-fix`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-09
- **性质**：E1 变更包（窄修复），交内置独立验收按 B1 v1 判定 B2；**不是验收结论**；不授权提交/推送/合并/发布（发布/tag 除外未授权）。
- **风险档位**：**T1**（窄修复 F1–F9；单一角色适配器内部注入变换；不改公共 schema/运行时/共享/跨角色）。
- **依据（实测）**：
  - 路由/定性：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`（88 行 / `18648feeaadf7cc5eb8df3ccbf20a376d025ab700b9b2412a5dd15a8060c9356`）。
  - **B1 v1（冻结、唯一判据）**：`docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`（109 行 / `a1baa41e94bef0fc62985d7451d86d85170a2482d0fd1c82be27a3f5ed486412`）。
  - **修复记录（F7，先于代码，未改写）**：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（124 行 / 17,881 bytes / `57451f902faaa829176b7e7262779875c1bfad48115ffe5bb14f66391695e510`；mtime `2026-11-09 08:30:29.90 +0800`，早于 `session.ts` `08:34:44.12`、`session.test.ts` `08:37:47.72`；证据 `order-and-inputs.txt`）。
  - 缺陷证据：RR `c40011de…`；确定性复现 `e6db4183…`；`attempt2/product-sdk-tool-facts.json` `f6cd76b2…`。
  - 基线：HEAD `acc5512a3c9004312973538c3073ae2ec5b1ed6d`（tree `18ad571984705d8ab6297781b5782719bed92a89`）；分支 `feat/plan-escalation-card`；暂存 0；第二变更已合并（PR #74，merge `2e870248…`）。

---

## 一、候选身份

- **候选 2 文件（均为修改；无新增/删除/重命名）**：
  - `src/provider/claude/session.ts`：工作树 raw SHA-256 `a3e3d4276f9fa9713d47d4b6b4a0ac06008fd0ffc87bbeec25d2ae2ddca8c26b`（HEAD blob `58e75148…`；+35/−5）。
  - `test/claude-adapter/session.test.ts`：工作树 raw SHA-256 `6379bc8ef7a26a700b1dcd937bba7429dec3704fa11027f44c119fd5b8469e67`（HEAD blob `441e0b4d…`；+265/−2，仅两行 import 扩写，无删除/放宽断言、无 skip/force-exit）。
- **候选聚合（canonical，本轮统筹独立复算）**：`5427e1774105bc83a74383c1e49cb2e8c1f9d15cecd7406bb6659954e21a258a`
  - 算法：逐文件工作树 raw `sha256sum`；行格式 `<raw_sha256>  <path>`（**两空格**）；`LC_ALL=C` 整行排序；逐行 `\n` 连接（含末行换行）后 SHA-256。与第二变更 D1/E3/B2 口径一致。
  - **格式说明**：Claude适配器证据 `candidate-manifest.txt` 使用了 `sha256sum` 的 `<hash> *<path>`（星号）格式，其聚合为 `09e1a93a1064d0c9efc8aaf42e267ec79a4c2b8eedacaa1ccf014c0278384c7e`；两套聚合由**同一逐文件哈希**仅分隔格式不同导出（无内容差异）。本 E1/B2 以两空格 canonical 口径为准（请在 B2 复算时采用本算法）。
- **工作树 manifest（canonical，本轮独立复算）**：`src app test` 1,105 文件，逐文件 raw `sha256`、两空格、`LC_ALL=C` 排序、`\n` 连接后 SHA-256 = **`2d0ab31b66481a22869e6d18d1fbbf96099335f9e601c6e37aecf83552268e99`**。
- **HEAD 树指纹（基线未变）**：`git ls-tree -r HEAD -- src app test`（1,105 行）SHA-256 = `b433282d3a0287009bc19ac10e621a85826fbb3254c0cea7580afea227efb511`。
- **稳定性**：真实运行前后 `00-pre-state.txt`/`01-post-state.txt` 的 HEAD/tree/分支/暂存/status/两文件哈希/manifest 同值；本轮独立复跑后 `git status --porcelain -- src app test` 仍为上述 2 项、逐文件哈希不变。
- **不混入**：T1（第一变更窄修复三文件）已在基线内；第二变更候选/证据不属本修复；无 `app/` change（渲染 N/A）。

## 二、改动内容（最小、无公共契约变化）

- `src/provider/claude/session.ts`：
  - 新增内联助手 `claudeToolInputWithCallContext(schema)`（`:121`；命名导出仅供本角色单测）：`structuredClone` 深拷贝；顶层 `properties` 增加可选 `__ans_call_context:{type:"string",description:"Internal ANS context assigned by the host; omit this field."}`（不入 `required`）；对顶层 `oneOf`（对称 `anyOf`）中 `additionalProperties===false` 的对象分支补同一可选字段；`required`/`pattern`/`additionalProperties:false` 逐字保留；不递归超出顶层分支；非对象/非严格分支不误加；顶层/分支保留名冲突 ⇒ 抛既有「保留的请求上下文字段」文案；畸形根 `properties` 原样交 `toClaudeSchema` 拒绝。
  - 接线（`:682`）：`claudeMcpInputSchema(claudeToolInputWithCallContext(protectedSchema), tool.name)`；`claudeAbsentPropertiesSchema`/`claudeMcpInputSchema`（dispatch_task）既有行为与顺序保持；PreToolUse 注入（`:801`）与 handler 剥离（`:701`）逐字未动。
- **公共契约零变化（BASE-4）**：`git diff --quiet HEAD -- src/provider/runtime/schema.ts src/provider/runtime/tools.ts src/common/claude-adapter/` **exit 0**；worktree git object id 与 HEAD 相同（`schema.ts` `71597ff6…`、`tools.ts` `797e129b…`、`common/claude-adapter/schema.ts` `748846e2…`）。`app/`、`docs/`、共享件、其它角色/模型、B1/路由/角色卡/边界 diff 0。
- **F7**：修复记录未被改写（`57451f90…` 不变）；记录 mtime 早于代码。

## 三、确定性验证（AC-1–AC-7）

- **`test/claude-adapter/*.test.ts`（逐文件/等价，`--test-concurrency=1`）**：基线（编辑前）**122 tests / 122 pass / 0 fail / 0 skip / exit 0**（`impl/baseline-test.log` `1e959f89…`）；修复后 **128 / 128 / 0 / 0 / exit 0**（`impl/postfix-test.log`、`impl/final-test.log`；`session.test.ts` 65→71；其余 7 文件计数不变；新增确定性失败 0、新 skip 0）。**统筹独立复跑 128/128 pass、0 fail、0 skip**。
- **新增 6 用例**（`test/claude-adapter/session.test.ts`）：
  - AC-1：真实 `describeTool("git_candidate")`（只读 import）+ 真实 adapter 注册/真实 MCP Client（`toClaudeSchema`/`registerTool`）：commit/integrate/revert/init 四分支合法入参 + host token 4/4 通过；`invalid_union` 消失；handler 收到剥离后参数；分支 `required`/`pattern`/`additionalProperties:false` 对照原文逐字保留；四分支 action enum 互斥 + 条件 superRefine 保证恰一分支。
  - AC-2：未知额外字段、错误分支字段组合（commit+candidates、revert+paths）、缺 required、类型/pattern/条件错误、未知 action → 全部仍拒且 handler 不启动。
  - AC-3：伪造字符串/空串/非字符串上下文 → PreToolUse 以 host token 覆盖并正常通过；handler 前剥离；会话事件/审计不含模型值或字段名；绕过 hook 的未知 token → handler 守卫拒绝；非字符串由 schema 拒绝。
  - AC-4：真实 `git_query`/`git_publish` 仅顶层获得可选字段、其余逐字不变；合法+上下文通过、非法仍拒；Pi/Codex 源码零 `__ans_call_context` 引用（源码断言）。
  - AC-5：助手单测（深拷贝/入参不可变/冲突抛错/oneOf+anyOf 对称/仅 strict 分支/required+pattern 保留/非对象分支不误加/不递归嵌套）。
  - AC-6：目标分支内未知关键字（`patternProperties`）注册期仍拒；真实 oid 条件（sha1⇒40/sha256⇒64）语义不变。
- **只读探针（真实注册链）**：`impl/probe-emitted-git-candidate-schema.log`——注册 schema hash `e282e2eb…`、公共 schema hash `10159eb9…`、`inputsUnchanged:true`；四分支正例 4/4、负例仍 `-32602 invalid_union`/条件失败。
- **typecheck**：`npm run typecheck` **exit 0**（`impl/final-typecheck.log`；统筹独立复跑 exit 0）。
- **可选回归（如实）**：`test/runtime-core/git-capability-tools.test.ts` 本 worktree 38/45（7 例 `runtime-protection-scope-unknown`，均以 `process.cwd()` 为 projectRoot、linked worktree 的 `.git` 是文件）；`git archive HEAD` 纯净非 git 目录复跑 **45/45 全绿** → worktree 布局环境事实，与本修复无因果；不计本修复回归。

## 四、真实 Git 写最小运行（AC-8，如实）

- **环境**：仓库外根 `C:/Users/51054/Desktop/work/ans-dogfood-call-context-fix-2026-11-09/rr/`；受保护目标（init-source 00:42:34.541Z 早于 product `session.open.ready` 00:42:34.693Z）；治理建立 ok、审计门禁预检 `verdict:"OK"`；真实 Electron（本 worktree `app/main.ts`，隔离 userData，CDP 9222）+ 真实 Claude + 真实桌面 UI；复用第二变更 RR launcher/CDP 驱动（只读）。
- **预算/实测**：客户消息 1；`dispatch_task` 模型 1 / 应用处理器 1（`task.created` 1 行）；**Git 能力调用 2**（`git_query` observed；`git_candidate` 到达应用处理器）；审批卡 0；发送→停止 **≈23.1 s**（远低于 10–15 min）；无自动重试；首个决定性结果即停。
- **结果**：`git_candidate {action:"commit", base.ref:"refs/ans/trunk", base.oid:28b0829…}` **通过 MCP 校验、到达应用处理器**；结构化回执 `{"status":"blocked","code":"git-worker-task-unproven","message":"The actual open assigned module task is unavailable"}`。
- **下一真实门（如实）**：`src/service/trunk/impl/git-capabilities.ts:263-268` 的 worker Git 写任务绑定契约要求恰一条 `task.created {from:"convener", flowId+moduleId}`；本次 RR fixture 经 chief hub 派发（`from:"chief"`、无 `moduleId`）⇒ 在候选/journal/sidecar 生成前被拒。**sidecar `authorization.jsonl`、`git.json`、candidate ref 均未产出**（operations 清单 `[]`、refs 仅 `refs/heads/master`），不伪造、不宣称完整 Git 写成功。`write_file` 成功（79 字节）、`git_query` observed（真实 transport）。
- **停止时机缺口（如实）**：git_candidate 回执后立即 halt，`tasks.jsonl` 仅 `task.created`，`task.delivered`/`task.reported` 未落账（`delivery.claim.start/start/claim.end` 00:42:34.719–721 已记录）。应用/驱动/浏览器已关闭、9222 仅 TIME_WAIT、无 electron 残留。
- **候选稳定性**：运行前后 HEAD/tree/分支/暂存/status/两文件哈希/manifest 同值（`real-run/00-pre-state.txt` vs `01-post-state.txt`）。

## 五、范围合规与披露

1. **写集合规**：仅 `src/provider/claude/session.ts` + `test/claude-adapter/session.test.ts`（+ `角色卡/Claude适配器/docs/fix/` 证据）；公共 schema/tools/claude-adapter/共享/其它角色/`app/`/`docs/` diff 0；无提交/推送/暂存/合并/发布。
2. **助手导出**：`claudeToolInputWithCallContext` 为命名导出，仅供本角色单测（B1 AC-5 要求单测原始证据）；无其它消费者。
3. **既有事实（非本修复引入）**：union 型注册的 `tools/list` 输出 `{type:"object",properties:{}}`，校验在服务端 Zod；修复前后一致。
4. **环境性**：`runtime-core` 7 例为 linked worktree `.git`-file 布局导致（纯净副本 45/45），与本修复无因果；`test/claude-adapter/` 基线/修复后失败与 skip 集合一致（0/0）。
5. **下一门归属**：`git-worker-task-unproven` 属 worker Git 写任务绑定契约（生产任务须由 convener 带 `flowId+moduleId` 派发），**不属本 T1 适配器修复范围**；本修复目标「`git_candidate` 经 MCP 校验成功并到达应用处理器」已达成；完整 commit 的 sidecar/journal/ref 未产出并如实披露。
6. **真实运行限制**：只要求真实 Claude（本修复）；Pi/Codex 未运行真实模型（源码/确定性回归覆盖）；不宣称完整 Git 写/闭环/发布/长期稳定性。
7. **发布/tag 未授权**。

## 六、证据与 B2 输入清单

- 修复记录（F7）：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（`57451f90…`）。
- 实施/运行证据目录：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context-evidence/`
  - `impl/implementation-summary.md`（`4091d275…`）；`impl/baseline-test.log`（`1e959f89…`）、`postfix-test.log`、`final-test.log`（128/128）、`final-typecheck.log`；`impl/probe-emitted-git-candidate-schema.{mjs,log}`（`c3bedf29…`）；`impl/runtime-core-git-capability{,-pristine-HEAD}.log`。
  - `real-run/`：`drive.jsonl`、`summary.json`（stopCause=`decisive-git-candidate-outcome`）、`product-sdk-tool-facts.json`（`185bc13b…`，含 git_candidate blocked 全文）、`product.jsonl`/`chief.jsonl`/`tasks.jsonl`、`sessions/*`、`diagnostics/`、`ui-0*.jpeg` 与 body、`operations-inventory.json`、`target-git-*.txt`、`init-source-*.json`、`00-pre-state.txt`/`01-post-state.txt`。
  - `candidate.patch`（`36fc971c…`）、`candidate-manifest.txt`（`b9b0675e…`；星号格式聚合 `09e1a93a…`，见 §一说明）、`order-and-inputs.txt`、`sha256-index.txt`（`8cd4085d…`）。
- 独立复算（本轮统筹）：候选聚合 `5427e177…`；工作树 manifest `2d0ab31b…`；`test/claude-adapter` 128/128 + typecheck 0。
- 判据：B1 v1（`a1baa41e…`）；B2 由同一独立验收按 B1 判定（不判方案质量、不改代码/测试）。

## 七、状态

- **E1 就绪**：候选已冻结（2 文件 / `5427e177…`）；确定性/真实运行证据齐备；范围合规与披露如上。
- **待沟通启动 B2**（同一独立验收，判据 B1 `a1baa41e…`）；本包不判验收；发布/tag 未授权。
