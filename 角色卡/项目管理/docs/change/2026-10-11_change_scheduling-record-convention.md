# 项目管理 变更记录

## 2026-10-11 — 调度记录使用约定（T6）：约定成文 + 一条真实 task_ops 记录样例

**来源**：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.4 / §3.6 / §3.7 与派发清单 T6 行（依赖：无；运行期记录场景依赖 T4）。

**性质**：T6 是**使用约定**，**不是产品代码**任务——`docs/scheduling/` 已在 pm 的 Section 1 内（`purpose: 任务调度记录（内容由 task_ops 写入）`）；写入器是技能**现成脚本** `scripts/task_ops.py`（+ `coordination_store.py`）；**调度「执行」路径不在 V1**（§3.7）。故**无产品代码可写**，产出 = 约定成文 + 一条实测记录样例。

**做了什么**
- 新增约定文档 `docs/design/2026-10-11_design_scheduling-record-convention.md`：写清①V1 边界（不实现调度执行，执行路径见二期 S1）；②归属（`docs/scheduling/` 归 pm、**内容唯一写入者 `task_ops`**、**编排不得直接写**）；③pm 的使用步骤（产计划 → 经 `task_ops init/dispatch/...` 落记录、凭据私存、不手改记录）；④记录格式与 hash 链（人读段 + `ANS-TASK-EVENTS-V1` 机器段、`hash=sha256(encoded(event))`、`previousHash` 链式）；⑤**一条实测记录样例**（人读段与机器段**逐字**贴入，含真实 hash）。
- 核对并**修正一致性**：`docs/project-rules.md` §四「调度记录归属」原写「归属与分工待定」（陈旧、与已定归属不一致），改为**已裁定**：目录归 pm、内容唯一写入者 `task_ops`、编排不得直接写，指针指向约定文档；§四标题改为「待解决冲突与已裁定项」。`docs/architecture.md`「角色与职责」补一条同义说明（含「调度执行路径不在 V1」）。核对结论：`角色卡/项目管理/boundary.yaml` 与 `boundary.md` 已一致（均为「内容由 task_ops 写入」）；不一致仅在 `project-rules.md` §四，已修正。两文件现均与该归属一致。

**样例如何实测（非示意）**
- 环境：Windows 11、Python 3.14.0；`task_ops` = `C:/Users/MLoong/.claude/skills/ans-governed-construction/scripts/task_ops.py`。
- 位置：**临时项目** `%TEMP%/ans-t6-sample2`（**不在 ans-cli 仓库内**——仓库根**不留**真实调度记录，避免凭空多出一条不存在的任务记录）。
- 过程：项目含 `schemaVersion:1` 配置（`roles.{项目管理,测试}`，含 `writeFiles`/`operations`/`checks`/`autoDispatch`）、`# Section 1` 反引号表格的边界、需求/设计文档、两节点计划（`impl`→`qa`）。命令：`init`（钉住经审配置 SHA-256 `6e4d3c4a…4fcb`）→ `dispatch impl` → `status`；均 `exit 0`。
- 产物：`docs/scheduling/T6-sample.md`，`stateRevision=2`，事件 2 条。
- **独立校验**（读回，非自证）：链长 2、`link_ok=True`、首事件 `previousHash=null`；事后手改一个字节 → 报 `Invalid task event`（**被检出**）；写回原文后校验恢复通过。

**如实记录的实测发现（不改变约定结论）**
1. **`ans init` 的产物不能直接喂 `task_ops`**：`task_ops` 配置 schema（`schemaVersion:1` + 每角色 `writeFiles`/`operations`/`checks` + `designFiles`）与 `ans init` 写的 `.ans/project.json`（`{roles:{id:{card,boundary}}, governanceBoundary, acceptance}`）**不是同一 schema**；实测把该文件指给 `task_ops init` → `{"status":"rejected","message":"Invalid configuration"}`。
2. **`ans init` 的 `角色卡/*/boundary.yaml` 也不被 `task_ops` 识别**：`task_ops` 只从 `# Section 1` 表格的**反引号**单元格取路径，而 `ans init` 写的是纯 YAML（无反引号）。
   → 故样例在一个**与 `task_ops` 兼容的临时项目**里跑出（**运行真实、hash 真实、格式与真实产物一致**）；约定本身不受影响（它描述「pm 产计划 → `task_ops` 落记录」）。落地须注意：`ans init` 骨架若要承接调度记录，需另备 `task_ops` 形态的配置/边界（属产品演进，非本约定范围）。
3. **Windows 需 Python UTF-8 模式**：`task_ops` 部分读文件未显式指定编码，UTF-8 中文内容下会命中系统默认 GBK 报 `'gbk' codec can't decode`；以 `PYTHONUTF8=1` 运行即可。

**边界与合规**：仅写 pm Section 1 内路径（`角色卡/项目管理/docs/design/`、`docs/change/`、`docs/project-rules.md`、`docs/architecture.md`、`memo.md`）。**未在 ans-cli 仓库根写任何真实调度记录**（样例只在临时项目内）。未读 `.env`、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/project-rules.md` §四与变更记录 + `docs/architecture.md` 补记。
