# 边界 Delta 记录：B0 派发的 `test/桌面应用/session-structure.test.ts` 补入「桌面窗口」角色卡 Section 1

- 日期：2026-11-13
- 性质：**记录式边界 Delta 补齐**（People-Ops / nominator 职责）；不写代码、不改既有条目、不改其它角色卡。
- 分支：`refactor/session-ts-b1`；基线 HEAD：`cf63cc7d4fc40630e85c0eaf7824e8204e0438d4`（`cf63cc7`，PR #95 合并提交）。
- 状态：**未 commit / 未 push / 未合并 / 未打 tag**（由调度统一提交）；未运行 Electron、未占用 CDP 9224。

## 一、依据

1. **B0 派发 / 客户协调者要求**（2026-11-13）：把 B0（PR #95，合并提交 `cf63cc7`）新增的 `test/桌面应用/session-structure.test.ts`（创建于提交 `cb492ea`）补记到「桌面窗口」角色 boundary（记录式）。
2. **方案**：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §5 B0（新增 `session-structure.test.ts`：导出面快照、导入图无环检查、文件体量预算）与 §6.2（结构性测试第 1/2/4/5 项）。
3. **Owner 记录（事实来源）**：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b0-structure.md` §3 第 4 条——B0 时 `boundary.yaml` 按文件逐条列举测试写区、**尚未包含** `test/桌面应用/session-structure.test.ts`，建议 B0 合并前由治理更新 boundary 条目（该角色未自行改 boundary，避免越权改治理文件）。B0 已由 PR #95 合并进 main（`cf63cc7`），本 Delta 完成该建议的记录式补齐。

本 Delta 只把 B0 派发点名、owner 记录已载明的单一写集补进属主角色卡 Section 1 白名单，使白名单与实际一致；**无目录级授权、不扩其它路径、读取语义不变**（逐文件登记，不改变其它角色的任何授权）。

## 二、补齐的 1 个文件（md 表与 yaml entries 逐条一一对应）

| Delta 编号 | 属主角色卡 | 文件（kind: file） | 用途 |
| --- | --- | --- | --- |
| `Delta-B0-1` | 桌面窗口 | `test/桌面应用/session-structure.test.ts` | B0 会话结构保护骨架——导出面/导入图/体量预算/openRoleSession 工具面快照（session.ts 重构批次保护层） |

- `角色卡/桌面窗口/boundary.md` Section 1 表追加 1 行（另含 1 行 Delta 注记注释）、`boundary.yaml` `entries` 追加 1 条（另含 1 行 Delta 注记注释）（`Delta-B0-1`）。
- 桌面窗口为**逐文件授权，无目录级授权**；原有条目与顺序不变（纯追加，0 删除、0 改写既有行）。

## 三、为何未在初始白名单（B0 新增测试文件）

1. **桌面窗口**的 Section 1 对 `test/桌面应用/` 一律逐文件列白名单（无目录级授权），新测试文件不会自动纳入。
2. `test/桌面应用/session-structure.test.ts` 为 session.ts 重构 **B0 批次新建的结构保护骨架**（创建提交 `cb492ea`，716 行；8 个用例：导出面两层快照、导入图无环/分层白名单、文件体量预算、openRoleSession 工具面快照），随后随 PR #95 合并（`cf63cc7`）；B0 owner 记录 §3.4 已如实载明边界未登记并建议合并前补记。
3. 结论：该文件属 **B0 新增测试文件**，在既有白名单建立之后产生；本 Delta 是记录式补齐，不是重新授权或扩大写区。

## 四、写区核对与披露

- **新增集单一文件** A = {`test/桌面应用/session-structure.test.ts`}；与其它角色**不做授权变更**，A 不触碰任何其它角色卡的写区。
- **披露（目录级授权核对）**：`test/桌面应用/` 的目录级条目仅存在于**已拆分冻结**的「桌面应用」角色卡（该 `boundary.yaml` 顶层 `archived: true`，门禁引擎静默跳过、其边界一律不予采用），**不是任何现役角色的目录级授权**；「桌面UI」角色在同一目录下仅列逐文件条目（`markdown.test.ts`、`renderer.test.ts`、`tool-rows.test.ts`、`runtime-ui.test.ts`、`e2e/*.mjs` 等），与本文件不重叠；「测试」角色的目录级写区为 `test/测试/`，不含本文件。因此**不存在现役角色目录级授权覆盖本文件**——本次无需另立 Governance 单一属主裁决（既有归档条目仅作事实披露，其边界不改）。
- 同工作树另有角色并行写 `app/desktop/session/**`（B1 批次），与本 Delta 写区（`角色卡/桌面窗口/`、`角色卡/项目管理/docs/change/`）**不相交**。
- 角色内核对：两个角色卡的 md 表与 yaml `entries` 逐条对应（以产品解析器 `parseBoundarySection1` / `parseBoundaryYamlDoc` 核验：桌面窗口 md 88 条 = yaml 88 条；条目身份 root/kind/path 逐条相同，无重复条目；新增条目 root/kind/path/purpose 在 md/yaml 逐字一致）。既有旧条目的 purpose 文案差异（26 处）为历史遗留，未在本 Delta 处理。

## 五、未改代码声明

- 本任务**未改任何源码、测试、脚本、配置或 i18n**；未改「桌面窗口」「项目管理」以外的任何角色卡/边界；未改任何既有边界条目（纯追加：boundary.md +2 行、boundary.yaml +4 行，0 删除）。
- 未 commit / 未 push / 未合并 main / 未打 tag；未运行 Electron、未占用 CDP 9224；未运行产品测试（纯记录 Delta，行为不变）。

## 六、验证（2026-11-13，本工作树）

- 边界解析一致性：`node`（v24.22.1，内置 TypeScript type stripping）载入产品解析器（`src/common/门禁引擎/boundary-yaml.ts`、`boundary-parse.ts`）核验——桌面窗口 **yaml 88 / md 88**，条目身份（root/kind/path）逐条相同（88/88），重复条目 0，`archived` 未设置；新增 1 条 `root=project, kind=file, path=test/桌面应用/session-structure.test.ts` 的 purpose 在 md/yaml **逐字一致**（完整条目 JSON 相等）。
- 写区核对：`git status --short` 仅出现本任务 3 个路径（2 个边界文件为 ` M`，本记录为新文件）。
- `git diff --stat`（两个已跟踪边界文件）：`角色卡/桌面窗口/boundary.md` +2、`角色卡/桌面窗口/boundary.yaml` +4，**2 files changed, 6 insertions(+), 0 deletions**；本记录为新建文件（untracked，全部为新增行）。合计 3 个文件、纯追加、0 删除。
- 变更后文件 SHA-256（raw）：
  - `角色卡/桌面窗口/boundary.md`：`a560b55e638287b61582b4d8936f9f8b5932977a85f2c0583b187bc22cc6a9a1`
  - `角色卡/桌面窗口/boundary.yaml`：`2a6c8fbab0ee476aac252250fb6246a19b36a5c32dc3dc57ef6add461f3d1d7c`
  - 被登记文件 `test/桌面应用/session-structure.test.ts`（cf63cc7 已提交 blob，LF 归一）：`1c615a1f80bb986e94c207686750504e4dee0645f12b1f21d65910e9092f1760`；工作树副本在 B1 批次中有测试骨架映射改动，非本 Delta 范围
