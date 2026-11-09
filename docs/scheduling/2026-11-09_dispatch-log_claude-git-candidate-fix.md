# 派发与状态记录：Claude 适配器 `git_candidate` MCP schema 窄修复（2026-11-09）

- **任务 ID**：`2026-11-09-claude-git-candidate-call-context-fix`
- **记录角色**：ANS 统筹调度（Scheduler）；**T1 窄修复**（修复窄通道 F1–F9）
- **日期**：2026-11-09
- **性质**：派发/状态记录；不是验收结论；不授权发布/tag。
- **依据**：
  - 路由/定性：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`（88 行 / `18648feeaadf7cc5eb8df3ccbf20a376d025ab700b9b2412a5dd15a8060c9356`）。
  - **B1 v1（冻结）**：`docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`（109 行 / `a1baa41e94bef0fc62985d7451d86d85170a2482d0fd1c82be27a3f5ed486412`；BASE-1–5、AC-1–8、EV1–6 全部待取证）。
  - **修复记录（F7，先于代码）**：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（124 行 / 17,881 bytes / `57451f902faaa829176b7e7262779875c1bfad48115ffe5bb14f66391695e510`；F1/F2 确认成立；证据目录含只读复现日志）。
  - 缺陷证据：RR `c40011de…`；确定性复现 `e6db4183…`；`attempt2/product-sdk-tool-facts.json` `f6cd76b2…`。
- **基线**：worktree `.claude/worktrees/trunk-amendment`；HEAD `acc5512`（tree `18ad5719…`）；分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` = 0；第二变更已合并（PR #74，merge `2e870248…`）。

## 一、定性与授权

- **工作类型**：修复（fix），窄通道 F1–F9，**T1**；所有者=**Claude适配器**（唯一）。
- **协调方 2026-11-09 放行实施**（B1 冻结后）；先确认修复记录已写（已确认 `57451f90…`）。
- **允许写集**：`src/provider/claude/session.ts`（主）、`test/claude-adapter/`（测试/夹具）、`角色卡/Claude适配器/docs/fix/`（修复记录保持不改；实施证据可新增于其证据目录）。
- **禁止**：`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/common/claude-adapter/`、共享件、其它角色/模型、`app/`、`docs/`（本调度记录除外）；改角色卡/边界/治理/验收标准；提交/推送/合并/发布；以放宽/丢弃约束求绿。
- **停止条件**：若实施必须越界（尤其公共 schema/tools/claude-adapter/共享/跨角色）⇒ 立即停止，路由/B1 作废，按普通流程补闸门。

## 二、修复方案（已定：方案 ①）

在 `src/provider/claude/session.ts` 内联助手（B1 §0.2：不改 `src/common/claude-adapter/`）：顶层 `properties` 增加可选 `__ans_call_context`；对顶层 `oneOf`（及对称 `anyOf`）每个 `additionalProperties:false` 对象分支补同字段；深拷贝、保留 `required`/`pattern`/`additionalProperties:false`；顶层/分支保留名冲突即抛错；不递归超出顶层分支。

## 三、验证与阶段（按 B1）

| 节点 | 内容 | 状态 |
| --- | --- | --- |
| B1 | 独立验收 B1 v1 冻结（`a1baa41e…`） | **完成** |
| 修复记录 | Claude适配器 F1/F2 确认 + 记录先于代码（`57451f90…`） | **完成** |
| 实施（T1） | `session.ts` 助手 + 注册接线；测试（真实 `git_candidate` 四分支/负例/伪造上下文/扁平工具/未知关键字/深拷贝/冲突） | **完成**：`session.ts` `a3e3d427…`（+35/−5）、`session.test.ts` `6379bc8e…`（+265/−2）；公共契约 diff 0；修复记录未改写（`57451f90…`） |
| 定向测试/静态门 | `test/claude-adapter/*` + typecheck + 受影响套件；候选/manifest | **完成**：基线 122/122 → 修复后 **128/128 pass、0 fail、0 skip、exit 0**（+6 用例，AC-1–6）；typecheck **0**（统筹独立复跑同值）；候选聚合（canonical 两空格）`5427e177…`、工作树 manifest `2d0ab31b…`（1,105 文件）、HEAD 树指纹 `b433282d…`；`runtime-core` 7 例为本 worktree `.git`-file 环境、纯净副本 45/45 |
| 真实 Git 写最小运行 | 受保护 + 真实 Claude + 真实 UI；1 消息/`dispatch_task`≤1/Git≤2/卡≤2/10–15 分钟；`git_candidate commit` 经 MCP 成功 + sidecar/journal/candidate ref，或如实下一门 | **完成（如实下一门）**：MCP 校验成功并到达应用处理器；应用回执 `git-worker-task-unproven`（worker 任务绑定契约：`task.created` 须 `from:"convener"` + `flowId+moduleId`；RR fixture 经 chief 派发无 moduleId）⇒ sidecar/journal/ref 未产出、不宣称；预算 1 消息/dispatch 1/Git 2/卡 0/≈23.1s；候选运行前后不变；证据 `real-run/`（`product-sdk-tool-facts.json` `185bc13b…`） |
| E1 变更包 | 统筹写 `docs/scheduling/`（候选/证据/披露） | **完成**：`docs/scheduling/2026-11-09_change-package_claude-git-candidate-fix.md`（84 行 / 13,469 bytes / `65bfd12d13c80a1ec334167ce7b22f7746b57d6c5bbc1f28f8b0f34200a240e8`）；候选 `5427e177…`；披露含下一门/工具清单既有事实/环境差异/格式说明 |
| B2 | 沟通启动同一独立验收按 B1 判定 | **完成：pass**（19 pass / 0 fail / 0 insufficient / 0 N/A；`docs/acceptance/2026-11-09_claude-git-candidate-fix-report-v1.md` 107 行 / `1bae184b…`；AC-8 按 MCP 成功+如实下一门判 pass；无返工/安全旁路） |
| E3-R | 统筹写放行记录 | **完成**：`docs/scheduling/2026-11-09_status-e3_claude-git-candidate-fix.md`（83 行 / 11,828 bytes / `70ef6cac…`）；放行提交/推送/PR/合并（发布/tag 除外）；提交分组 A=2 候选、B=修复记录+管理文档；最终真实验证计划已备（待放行） |
| RR2 | 测试（最终真实验证） | `角色卡/测试/docs/change/` + 仓库外临时根 | E3-R/合并后 | **完成（如实下一门）**：运营派发拓扑（convener+moduleId+pinned run）下，真实 Claude worker 的 `git_candidate commit` **经 MCP 成功到达应用处理器**（`git-worker-task-unproven` 未命中）；应用回执 `git-source-process-history-unproven`（H6：预置 work source 的父 chief Core 会话在预置进程、非应用进程真实 Core → **夹具构造限制、非产品缺陷断言**）；零 sidecar/journal/ref、零 refs 效果；预算 0 客户消息/1 worker 回合/1 Git 调用/0 卡/≈22s；证据 `角色卡/测试/docs/change/2026-11-09_RR2_remove-predictive-gates-commit-real-run.md` `f7be04ae…` + 证据索引 `5e527bfe…` |
| RR3 | 测试（live 拓扑最终真实验证） | `角色卡/测试/docs/change/` + 仓库外临时根 | RR2/合并后 | **完成：全链真实跑通**：真实 chief→convener→impl 两级派发（应用自动 `freezeExecutionRun` pin：`run-hub-975e08…`、pinDigest `1d8f0a07…`、codeBasis `refs/ans/trunk @ sha1 71754a83…`）→ impl 真实 Claude `write_file` + `git_candidate commit` → **应用回执 `status:"prepared"`（成功）**、H6 未出现；产出 sidecar `authorization.jsonl`（`4f748d59…`）+ `git.json`（`310c216f…`）+ candidate ref `refs/ans/candidates/4140b858…`→`02c79560…`；`refs/ans/trunk` 未动；预算 1 客户消息/派发 2/chief 3/convener 1/impl 1/Git 1/卡 0/≈69.7s（全部在预算内；模型首次 sideEffect 枚举错误与停止账本缺口如实披露）；repo `src app test` 前后 manifest `ed4cb742…` diff 0；证据 `角色卡/测试/docs/change/2026-11-09_RR3_remove-predictive-gates-live-commit-real-run.md` `ea19996a…` + 证据索引 `291dbccf…` |

## 四、状态更新记录

- 2026-11-09：路由 `18648fee…` 已核验；B1 v1 冻结（`a1baa41e…`）；Claude适配器修复记录完成（`57451f90…`）；协调方放行实施；实施已派发 Claude适配器（最小写集）。
- 2026-11-09：**实施/确定性/真实运行完成**：2 文件（`session.ts` `a3e3d427…`、`session.test.ts` `6379bc8e…`）；`test/claude-adapter` 128/128、typecheck 0（统筹独立复跑一致）；真实运行 `git_candidate commit` **经 MCP 校验成功并到达应用处理器**，下一门 `git-worker-task-unproven`（sidecar/journal/ref 未产出，如实）；候选聚合 `5427e177…`。**E1 变更包完成**（`65bfd12d…`）；待沟通启动 B2。
- 2026-11-09：**B2 v1 判 pass**（`1bae184b…`；19/0/0/0；无返工/安全旁路）；**E3-R 放行记录完成**（`70ef6cac…`）；放行提交/推送/PR/合并（发布/tag 除外）；最终真实验证计划（运营派发夹具 + 恢复投递 + 真实 Claude worker）已备，待协调方放行。
- 2026-11-09：**RR2 最终真实验证完成（如实下一门）**：PR #75 合并后（HEAD `65813c9`），预置真实链（governance required、init/trunk v1/v2、impl 激活、initial workflow、pin `run-w7-exec`/`39d493a3…`/codeBasis sha1 `71dc290f…`）+ 运营派发开放任务（`from:"convener"`、`moduleId:"impl-core"`、`moduleDirectory/modulePaths:"src/impl/"`、pinned）；`restoreTasks` 投递到 impl 真实 Claude 会话；worker 回合 1：`write_file` + `git_candidate commit`（base/paths/operationId 逐字）→ **MCP 成功到达应用处理器**，应用回执 `git-source-process-history-unproven`（H6；预置 work source 父会话非应用进程 Core → 夹具限制、非产品缺陷）；零 sidecar/journal/ref；预算 0 消息/1 worker/1 Git/0 卡/≈22s；候选/manifest 前后 diff 0。证据 `f7be04ae…` + 索引 `5e527bfe…`。下一门需应用内真实 chief→convener→worker 或应用生成的 work source（更大预算），待协调方决定。
- 2026-11-09：**RR3 live 拓扑最终真实验证完成：全链真实跑通**：静态预置（治理 required/init/trunk v1/v2/impl 激活/roster/团队计划/initial workflow；**零动态派发任务、零 freeze/pin**）→ 1 条客户消息 → 真实 chief→convener→impl 两级派发（应用自动 `freezeExecutionRun` pin `run-hub-975e08…`、codeBasis `refs/ans/trunk @ 71754a83…`）→ impl 真实 Claude `git_candidate commit` → **应用回执 `status:"prepared"`（成功）**、H6 未出现；**sidecar `authorization.jsonl` + `git.json` + candidate ref 真实产出**；预算 1 消息/派发 2/chief 3/convener 1/impl 1/Git 1/卡 0/≈69.7s（全部在预算内）；repo `src app test` manifest `ed4cb742…` 前后 diff 0。证据 `ea19996a…` + 索引 `291dbccf…`。窄修复真实闭环验证完成。
