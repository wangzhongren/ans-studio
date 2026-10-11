# 项目管理 变更记录（治理动作）

## 2026-10-11 — Governance 授权 Section 1 两项新目录（G-1a 装配 `.ans/`、G-1b 项目管理 `docs/audit/`）

**性质**：跨角色治理动作。本记录由 **ANS Governance（内置治理角色 su）** 以治理身份授权写入；变更记录归档在项目管理（全项目变更记录归此），授权本体是两份角色边界 Section 1 的唯一写入白名单更新。

- **要点（授权 1 / G-1a）**：`角色卡/装配/boundary.yaml` 的 `entries` 新增一条
  `kind: conditional-directory`、`path: .ans/`、`condition: project-init`、`root: project`、
  `purpose: 项目初始化产物（.ans/project.json：角色表、治理边界与接受证据的 SHA-256 pin）`。
- **要点（授权 2 / G-1b）**：`角色卡/项目管理/boundary.yaml` 的 `entries` 新增一条
  `kind: conditional-directory`、`path: docs/audit/`、`condition: shell-gate`、`root: project`、
  `purpose: shell 闸的放行/拒绝审计留痕（shell-gate.jsonl）`。**未改动**同一文件内既有的 `docs/scheduling/`（普通 `directory`）。
- **为什么用条件目录而非普通 directory**：`.ans/` 只在「项目初始化」这一类任务里写，`docs/audit/` 只在 shell 闸运行时写——
  两者都不该成为角色的**长期常设权限**。用 `conditional-directory` + 固定 slug（`project-init` / `shell-gate`）把写入
  限定在「任务已在 `TaskScope.conditions` 声明该条件」的范围内；未声明条件的任务即使命中该路径也会被门禁在写入**之前**拒绝。
  这样既满足 V1 需要这两个目录，又避免退化成 blanket 授权。`condition` 用 `shell-gate`：审计留痕正是 shell 闸运行时产生，
  把写入绑定到声明该条件的任务，语义与实际写入者一致（未改用其它 slug）。
- **客户已批准**：这两项授权经客户**明确批准**（即治理流程所要求的「经客户确认」一步），非 Governance 自授权。
- **校验依据（只读确认）**：`src/common/门禁引擎/boundary-yaml.ts` 严格校验——只允许键 `kind`/`path`/`purpose`/`root`/`condition`；
  `kind` 三选一；`conditional-directory` 必带 slug 形状的 `condition`（`^[a-z][a-z0-9-]*$`）；`root` 取 `project`/`skill`，缺省 `project`。
  本次两条均为合法键组合，slug 合法。
- **自证（Governance 独立执行，临时脚本置于系统临时目录，未入库）**：
  - `parseBoundaryYaml` 解析改后两文件 → **均不抛错**（装配 20 条、项目管理 16 条）。
  - `resolveWrite` 正向：装配身份、conditions 含 `project-init`、目标 `.ans/project.json` → `allowed: true`
    （命中条目 `.ans` / `conditional-directory` / `condition: project-init`）；项目管理身份、conditions 含 `shell-gate`、
    目标 `docs/audit/shell-gate.jsonl` → `allowed: true`。
  - `resolveWrite` 负例（证明条件目录真实起作用、非白给权）：同样路径、conditions **不含**对应 slug →
    `allowed: false`，理由为「命中条件目录但缺少条件 \`project-init\`/\`shell-gate\`：任务未在 conditions 声明该条件（拒绝）」。
- **回归**：`node --test test/*/*.test.ts` 全量通过（见本次会话验证输出）。
