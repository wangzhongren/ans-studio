# 意图记录：会话创建准入改为「按操作审批」而非「预知全部命令」（2026-11-08）

- 日期：2026-11-08
- 记录角色：ANS 沟通（Communication）
- 客户原话：「这个明显不现实啊，运行非只读命令走审批流程就行了。你还出厂就知道，别人调用什么命令啊。」

## 触发事实

- 真实运行 P1-RR：目标角色（product）会话创建被拒 `runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`。
- 现行设计：受保护项目中开会话前要求「原生工厂计划」（预知并证明整个未来工具/命令面）；`prepareNative()` 对非 codex 运行时恒返回 undefined（`src/service/runtime/session.ts:574`）；`hasUnconfinedScriptTools` 拒绝含 `run_shell`/`start_background_task` 的会话（`session.ts:242`）。

## 客户指定的变更方向

1. **受保护项目中允许创建角色会话**，不再要求「预知未来会执行哪些命令」的工厂计划证明——运行期要执行什么命令是当时才决定的。
2. **非只读操作一律走现有审批流程**：`shell-gate`/`shell-escalation`（客户审批卡、「替我审批」代批）、`shell-command-guard` 守卫、`shell-audit` 审计。
3. **只读操作按策略放行**（策略需在方案中定义）。
4. **不可弱化**：真实回合/角色身份、项目范围、工具注册表事实、审批与审计不绕过、unknown 不冒充 observed（身份与权限证据仍 fail-closed）。

## 非目标

- 不开放无审批的自由 shell；不删除审批/审计/守卫；不放宽写权/角色边界/客户主权。
- 不改本次已合并的派发父门（应用中介证据路径）语义。

## 补充规格（客户原话，2026-11-08）

- 「git 命令只读放行，每个角色的专属git 命令放行。」
- 解读与要求（纳入方案与验收标准）：
  1. **Git 只读命令直接放行**（不走审批）：如 status/log/diff/show/rev-parse/ls-files/cat-file/blame 等；精确命令/子命令白名单与参数级风险（`-c` 注入、`--output`、`-C` 路径、外部 diff 程序等）由方案定义并 fail-closed。
  2. **每个角色的专属 Git 命令放行**：按角色既有 Git 能力/ACL 授权（如 `git_query`/`git_candidate`/`git_publish` 等角色工具）在其授权范围内放行，仍走既有 Git ACL/发布/审计检查，不因「会话创建准入」被拒。
  3. 其它非只读操作（非 Git 的 shell 写、后台任务、外部副作用等）→ 按操作审批流程。
  4. 越权/未授权的 Git 操作仍拒绝（fail-closed）。


## 流程

- 走普通变更流程：策划方案（现有 shell-gate/审批/审计接线与收窄点、只读/非只读分类、各运行时路径）→ 独立复核 → 闸门 1（预授权覆盖）→ 统筹团队计划 → 闸门 2（预授权覆盖）→ 实施与测试 → 独立验收（B1/B2）→ 提交/合并（发布/tag 除外）。

## 关联

- P1-RR 证据：`角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`（`c47198f7…`）。
- 当前门代码：`src/service/runtime/session.ts`（`readCoreProtectionScope:230`、`hasUnconfinedScriptTools:242`、`prepareNative:570-585`、`prepareRole:1156-1200`）。
- 现有审批机制：`src/common/编排/shell-gate.ts`、`shell-escalation.ts`、`shell-command-guard.ts`、`shell-audit.ts`、`src/common/runtime-core/shell-judge/tools.ts`、`governance-judge/tools.ts`、`operator-channel.ts`。
- 已合并变更：PR #72（merge `c069425`），派发父门应用中介证据路径不受本变更影响。
