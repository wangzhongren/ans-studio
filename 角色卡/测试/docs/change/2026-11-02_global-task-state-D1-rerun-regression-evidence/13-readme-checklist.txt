=== README diff stat (rerun) ===
 README.en.md | 2 +-
 README.md    | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)

=== event kind mentions ===
--- README.md ---
133:`.ans/state/tasks.jsonl` 是新系统**唯一机器状态**：应用独占、append-only、每行一个事件；角色不可写。事件形状以 `TaskStateEvent` 为单一来源，包含任务事件（`task.created` / `task.delivered` / `task.reported` / `task.closed` / `task.redispatch` / `delegation.changed`）与申请/审批事件（`request.created` / `request.presented` / `request.resolved` / `request.notified` / `request.orphaned`、`approval.created` / `approval.resolved` / `approval.expired`），以及全局项目状态/版本决策事件（`project.focus` / `project.note` / `version.decision`，分别为工作流焦点、受控备注与版本决策执行审计）。
--- README.en.md ---
133:`.ans/state/tasks.jsonl` is the new system's **single machine state**: application-only, append-only, one event per line; roles cannot write it. Event shapes have a single source in `TaskStateEvent` and include task events (`task.created` / `task.delivered` / `task.reported` / `task.closed` / `task.redispatch` / `delegation.changed`) and request/approval events (`request.created` / `request.presented` / `request.resolved` / `request.notified` / `request.orphaned`, `approval.created` / `approval.resolved` / `approval.expired`), plus global project-state/version-decision events (`project.focus` / `project.note` / `version.decision` — workflow focus, controlled notes, and version-decision execution audit).

=== old-shape mentions (should be none) ===
(none)
