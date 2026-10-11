---
id: ans-cli-scheduling-record-convention
type: design
title: 调度记录使用约定（T6）——pm 承载、task_ops 唯一写入、真实样例与 V1 边界
created: "2026-10-11"
updated: "2026-10-11"
timezone: Asia/Shanghai
status: designed
related: [ans-cli-v1-full-implementation, ans-cli-v1-prototype-contract]
events:
  - date: "2026-10-11"
    kind: designed
    summary: 建立 T6「使用约定」——归属、唯一写入者、操作步骤、记录格式与 hash 链说明；附一条 task_ops 实测记录样例；如实标注 V1 不实现调度执行（§3.7）与 ans init 产物与 task_ops 配置不可直接互换这一实测发现
---

# 调度记录使用约定（T6）

> **性质**：这是一份**使用约定**，**不是产品代码**。`docs/scheduling/` 已在项目管理（pm）的 Section 1 内（`purpose: 任务调度记录（内容由 task_ops 写入）`）；写入器是技能**现成脚本** `scripts/task_ops.py`（配套 `coordination_store.py`）；**调度「执行」路径不在 V1**（设计 `2026-10-11_design_v1-full-implementation.md` §3.7）。故本项**无产品代码可写**，产出 = **约定成文 + 一条真实记录样例**。
> **依据**：设计 `2026-10-11_design_v1-full-implementation.md` §3.4 / §3.6 / §3.7 与派发清单 T6 行；技能 `references/scheduler.md`、`references/task-operations.md`；`docs/project-rules.md`、`docs/architecture.md`。

## 1. V1 的边界（如实标注，先说清楚）

**V1 不实现调度执行。** 设计 §3.7 已确认（客户授权，取选项 B）：V1 里**没有**「pm 产 `DispatchPlan` → 编排解析 → 逐条 `openRoleSession`」这条链。

- **V1 只做到**：pm 的**调度权归属落纸面** + 本**使用约定**（pm 依角色指引产出调度决定，经 `task_ops` 落 `docs/scheduling/<task-id>.md`）。
- **执行路径见二期 S1**（`DispatchPlan` / `DispatchStage` 的确切数据形状、谁解析、谁执行、验收与依赖，见设计 §3.7）。V1 **不做派发引擎、不演示多任务派发**。
- 故本约定描述的是**记录怎么落**，**不是**「V1 已能按计划派发」——后者**不会**在 V1 出现。

## 2. 归属与唯一写入者（沿用既有模式）

| 项 | 结论 | 依据 |
| --- | --- | --- |
| 目录 `docs/scheduling/` **归属** | **项目管理（pm）**（Section 1 条目，`kind: directory`） | `角色卡/项目管理/boundary.yaml`、设计 §3.4 |
| 记录**内容**的唯一写入者 | **`task_ops`**（技能 `scripts/task_ops.py`；存储层 `coordination_store.py`）——pm **不另写一份** | 契约 F3、`project-rules.md` §四、设计 §3.6 |
| **编排** | **不得直接写** `docs/scheduling/`（F3：编排只提供 `runRole`/`openRoleSession` 机制） | 设计 §3.6 职责边界表、§7 |
| 模式 | 「**目录归 pm、内容由唯一写入者写**」——与 `docs/audit/`（归 pm、内容由 shell 闸写入器写）**同一模式** | 设计 §7.6 |

**为何 pm 承载却不亲自写**：pm 是调度的**权力方/发起方**（决定派给谁、顺序、scope，产出计划），`task_ops` 是**机制/唯一写入者**（校验授权、写 hash 链式记录、加锁）。**pm 决定派发，`task_ops` 落记录**；不新增第二份写入者（设计 §3.6）。

## 3. 使用约定（pm 怎么用）

1. **产出发送决定**：pm 在其角色会话里，依 `references/scheduler.md` 与 `references/project-role.md`，把任务拆成**阶段图**（节点 = 角色 + 阶段 + 可观察产物），并写出一份 `task_ops` 计划（`schemaVersion`/`taskId`/需求与设计引用/节点数组）。
2. **钉住经审配置**：`task_ops` 要求配置有**客户/操作者审过的 SHA-256**（`approvedConfigSha256`）。它钉的是**内容版本**，**不等于**客户同意——pm 不得把自己算出的哈希说成客户批准（`references/task-operations.md`）。
3. **经 `task_ops` 落记录**（`<skill>/scripts/task_ops.py`；`--request -` 从 stdin 读 JSON）：

   ```sh
   python <skill>/scripts/task_ops.py --root <项目根> --task <task-id> init    --request <init.json>
   python <skill>/scripts/task_ops.py --root <项目根> --task <task-id> status
   # 之后按需：dispatch / ack / run-check / report / stop / revise / verify
   ```

   - **记录落点**：`docs/scheduling/<task-id>.md`（每个任务一个文件）。
   - **运行时状态/锁/检查输出**：`.ans/runtime/<task-id>/`（该目录带 `.gitignore`，临时文件不入库）。
4. **凭据私存**：`init` 返回 `coordinatorToken`，`dispatch` 返回一次性 `token`。**只把 worker token 交给被派发的 worker**，**coordinatorToken 私存**，**都不写进公开文档/日志**（状态只存 token 哈希）。
5. **不要手改记录**：手工编辑会**作废机器段并阻断后续操作**（程序在任何操作前校验事件顺序、hash 与人读段）。

## 4. 记录格式与 hash 链（职责）

`docs/scheduling/<task-id>.md` 是**一个 Git 可读的 Markdown 文件**，分两段：

- **人读段**：任务标题、需求/设计引用、**步骤表**（步骤 / 负责角色 / 当前状态 / 前置步骤 / 最近反馈）、**变化记录表**（序号 / 时间 / 变化 / 说明）。
- **机器段**：一个固定区块 `<!-- ANS-TASK-EVENTS-V1` … `ANS-TASK-EVENTS-END -->`，**每行一个 JSON 事件**。每个事件：

  ```
  hash = sha256( encoded(event 去掉 hash 字段) )，encoded = JSON(ensure_ascii=false, sort_keys=true, 无空格分隔)
  previousHash = 上一事件的 hash（首事件为 null）
  ```

  **链式**：`event[n].previousHash == event[n-1].hash`；每事件还带 `seq`（从 1 起连续）、`eventId`（`<task>-<seq>`）、`kind`、`summary`、`receivedAt`、`after`（提交后的计划+状态**全量快照**）。

- **原子提交**：每次操作**整文件原子替换**；替换失败则上一份完整记录仍为当前（`recover` 可读出最后完整状态，不会凭空造出一条未提交事件）。
- **校验**：`hash` 链能检出**不一致的编辑**；它**不是**对「恶意重写全部 hash 的操作者」的防护（`references/task-operations.md` 明说）。

## 5. 真实样例（实测产出，非示意）

下面这条记录是**真跑 `task_ops` 产出**的，**不是手写示意**。

- **环境**：Windows 11；Python 3.14.0；技能脚本 `scripts/task_ops.py`（`--root` 指向临时项目）。
- **临时项目**：`%TEMP%/ans-t6-sample2`（**不在 ans-cli 仓库内**；仓库根**不留**真实调度记录，避免凭空多出一条不存在的任务记录）。
- **任务**：`T6-sample`；阶段图 = `impl`（项目管理，写 `src/common/shared/…`）→ `qa`（测试，写 `test/测试/…`，`dependsOn: impl`）。
- **命令**：`init`（钉住经审配置 SHA-256 `6e4d3c4a…4fcb`）→ `dispatch`（`impl`，`autoDispatch:true`，无需另行同意）→ `status`。
- **结果**：`docs/scheduling/T6-sample.md`，`stateRevision=2`，事件 2 条，`init`/`dispatch` 均 `exit 0`。

### 5.1 记录的人读段（逐字）

```markdown
# 任务：T6-sample

任务记录由 `task_ops` 生成。修改需求、设计或权限后，使用对应命令更新；不要手工改状态。

需求：`docs/requirements.md`（R1）
设计：`docs/design.md`（D1）
状态版本：2 · 最新事件：2

## 步骤

| 步骤 | 负责角色 | 当前状态 | 前置步骤 | 最近反馈 |
| --- | --- | --- | --- | --- |
| impl | 项目管理 | running | 无 |  |
| qa | 测试 | pending | impl |  |

## 变化记录

| 序号 | 时间 | 变化 | 说明 |
| --- | --- | --- | --- |
| 1 | 2026-10-11T10:24:42.182170+00:00 | initialized | Reviewed plan and configuration pinned |
| 2 | 2026-10-11T10:24:42.283849+00:00 | assigned | Authorized worker assignment |

机器记录保存在下面的固定区块，供程序核对事件顺序和版本。
```

### 5.2 记录的机器段（逐字，即真实 hash 链）

下面是同一文件的**机器段原文**（两个 JSON 事件，各一行）。**这些是 `task_ops` 的真实输出字节**，未改写：

```text
<!-- ANS-TASK-EVENTS-V1
{"after":{"plan":{"configHash":"6e4d3c4a5d044e97216c2eb9bb79f1cdc472b82c4223a6edbb75f5d2da034fcb","configPath":".ans/project.json","design":{"path":"docs/design.md","sha256":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","version":"D1"},"nodes":[{"checks":["unit"],"dependsOn":[],"documentHashes":{"design":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","requirement":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c"},"nodeId":"impl","operation":"implement","readSet":["docs/design.md"],"requiredOutputs":["src/common/shared/sample-helper.ts","test/项目管理/shared/sample-helper.test.ts"],"revisions":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","design":"D1","requirement":"R1"},"roleHashes":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","card":"20421a368a70e95f8b694746601243324c1a224efae1243008454c25041db00e"},"roleId":"项目管理","stage":"implementation","writeSet":["src/common/shared/sample-helper.ts","test/项目管理/shared/sample-helper.test.ts"]},{"checks":["regression"],"dependsOn":["impl"],"documentHashes":{"design":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","requirement":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c"},"nodeId":"qa","operation":"verify","readSet":["src/common/shared/sample-helper.ts"],"requiredOutputs":["test/测试/regression.sample.ts"],"revisions":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","design":"D1","requirement":"R1"},"roleHashes":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","card":"26b3c3121e030a716ec002d57e298a69661e11778530dd7fb6b070d1bea2e675"},"roleId":"测试","stage":"verification","writeSet":["test/测试/regression.sample.ts"]}],"planRevision":1,"requirement":{"path":"docs/requirements.md","sha256":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c","version":"R1"},"schemaVersion":1,"taskId":"T6-sample"},"state":{"coordinatorTokenHash":"1ae56a93003217fae6efc6315f01777a8bdbf5a537381710c65a6213eac073b6","lastEventSeq":1,"nodes":[{"acknowledgedRevisions":null,"active":false,"assignedRevisions":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","design":"D1","requirement":"R1"},"attemptId":null,"attemptNumber":0,"checkEvidence":{},"nodeId":"impl","roleId":"项目管理","status":"pending"},{"acknowledgedRevisions":null,"active":false,"assignedRevisions":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","design":"D1","requirement":"R1"},"attemptId":null,"attemptNumber":0,"checkEvidence":{},"nodeId":"qa","roleId":"测试","status":"pending"}],"planRevision":1,"reportReceipts":{},"schemaVersion":1,"stateRevision":1,"taskId":"T6-sample","updatedAt":"2026-10-11T10:24:42.182157+00:00"}},"eventId":"T6-sample-1","hash":"046e4a5b23235ce7d471864af1c291f87727db7448d107da55cf90f881b94e33","kind":"initialized","previousHash":null,"receivedAt":"2026-10-11T10:24:42.182170+00:00","seq":1,"summary":"Reviewed plan and configuration pinned","taskId":"T6-sample"}
{"after":{"plan":{"configHash":"6e4d3c4a5d044e97216c2eb9bb79f1cdc472b82c4223a6edbb75f5d2da034fcb","configPath":".ans/project.json","design":{"path":"docs/design.md","sha256":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","version":"D1"},"nodes":[{"checks":["unit"],"dependsOn":[],"documentHashes":{"design":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","requirement":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c"},"nodeId":"impl","operation":"implement","readSet":["docs/design.md"],"requiredOutputs":["src/common/shared/sample-helper.ts","test/项目管理/shared/sample-helper.test.ts"],"revisions":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","design":"D1","requirement":"R1"},"roleHashes":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","card":"20421a368a70e95f8b694746601243324c1a224efae1243008454c25041db00e"},"roleId":"项目管理","stage":"implementation","writeSet":["src/common/shared/sample-helper.ts","test/项目管理/shared/sample-helper.test.ts"]},{"checks":["regression"],"dependsOn":["impl"],"documentHashes":{"design":"c445b3bac1f65da1082ea8d28721731ee4b89f4293f6e09355545b3dff30d8e1","requirement":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c"},"nodeId":"qa","operation":"verify","readSet":["src/common/shared/sample-helper.ts"],"requiredOutputs":["test/测试/regression.sample.ts"],"revisions":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","design":"D1","requirement":"R1"},"roleHashes":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","card":"26b3c3121e030a716ec002d57e298a69661e11778530dd7fb6b070d1bea2e675"},"roleId":"测试","stage":"verification","writeSet":["test/测试/regression.sample.ts"]}],"planRevision":1,"requirement":{"path":"docs/requirements.md","sha256":"e42aef5cf799df03b0485d0627e1b20a9940c37df274020df0afc096839b678c","version":"R1"},"schemaVersion":1,"taskId":"T6-sample"},"state":{"coordinatorTokenHash":"1ae56a93003217fae6efc6315f01777a8bdbf5a537381710c65a6213eac073b6","lastEventSeq":2,"nodes":[{"acknowledgedRevisions":null,"active":true,"assignedRevisions":{"boundary":"d7eb8bb5d5209d24befe919d793cb7a5aae46c31d4011ddc0d56d0d8136f5c57","design":"D1","requirement":"R1"},"attemptId":"impl-1","attemptNumber":1,"authorization":{"kind":"configuration","sha256":"6e4d3c4a5d044e97216c2eb9bb79f1cdc472b82c4223a6edbb75f5d2da034fcb"},"checkEvidence":{},"nodeId":"impl","pauseRequested":false,"reason":"Awaiting worker revision acknowledgment","roleId":"项目管理","status":"running","tokenHash":"e6a91c9336c37e9556eab6bb0150e2b7ee013524c80a5edfeb2982a1fa4efaf3","workerId":"pm-worker-1"},{"acknowledgedRevisions":null,"active":false,"assignedRevisions":{"boundary":"ac82a866f925ae67e96f232db7547e80b056d96920ede11649bf2b9e2c34bf03","design":"D1","requirement":"R1"},"attemptId":null,"attemptNumber":0,"checkEvidence":{},"nodeId":"qa","roleId":"测试","status":"pending"}],"planRevision":1,"reportReceipts":{},"schemaVersion":1,"stateRevision":2,"taskId":"T6-sample","updatedAt":"2026-10-11T10:24:42.283837+00:00"}},"eventId":"T6-sample-2","hash":"ee3a064261eb7db1c87e6451d5de431d06ec4f48b809347c9f67f66048ba65ea","kind":"assigned","nodeId":"impl","previousHash":"046e4a5b23235ce7d471864af1c291f87727db7448d107da55cf90f881b94e33","receivedAt":"2026-10-11T10:24:42.283849+00:00","seq":2,"summary":"Authorized worker assignment","taskId":"T6-sample"}
ANS-TASK-EVENTS-END -->
```

**链的关键字段（逐字取自上面真实事件）**：

| seq | eventId | kind | previousHash | hash |
| --- | --- | --- | --- | --- |
| 1 | T6-sample-1 | initialized | `null`（链首） | `046e4a5b23235ce7d471864af1c291f87727db7448d107da55cf90f881b94e33` |
| 2 | T6-sample-2 | assigned | `046e4a5b23235ce7d471864af1c291f87727db7448d107da55cf90f881b94e33` | `ee3a064261eb7db1c87e6451d5de431d06ec4f48b809347c9f67f66048ba65ea` |

即：`event[2].previousHash` 恰等于 `event[1].hash`，构成链。

### 5.3 独立校验（读回调，非自证）

用 `coordination_store.read_task_page` **独立**读该文件：链长 2，`link_ok=True`；首事件 `previousHash=null`；末事件带整份 `after` 快照。**事后把某事件 `kind` 手改一个字节 → 校验立即报 `Invalid task event`（被检出）**，把原文写回后校验恢复通过。这印证 §4 的两点：hash 链能检出**非写入者**的改动；程序在操作前校验。

## 6. 实测发现（如实报告，不影响约定成立）

跑样例过程中发现三点，**如实记录**（都不改变本约定的结论——`task_ops` 是真能落记录的唯一写入者）：

1. **`ans init` 的产物不能直接喂给 `task_ops`。** `task_ops` 的配置 schema 与 `ans init` 生成的 `.ans/project.json` **不是同一 schema**：`task_ops` 要 `schemaVersion:1` + 每角色 `writeFiles`/`operations`/`checks` + `designFiles`；而 `ans init` 写的是 `{roles:{id:{card,boundary}}, governanceBoundary, acceptance}`（pin 配置）。实测：把该 `.ans/project.json` 指给 `task_ops init` → `{"status":"rejected","message":"Invalid configuration"}`。
2. **`ans init` 生成的 `角色卡/*/boundary.yaml` 也不被 `task_ops` 识别。** `task_ops` 只从 `# Section 1` 表格的**反引号**单元格里取可写路径；而 `ans init` 写的是纯 YAML（`entries:` 列表，**无反引号**）→ `task_ops` 取不到任何路径。

   **故样例在**一个**与 `task_ops` 兼容的临时项目**里跑出（配置为 `schemaVersion:1` 形态、边界为 `# Section 1` 反引号表格）：**运行是真的、hash 是真的、格式与真实产物一致**。**约定本身不受影响**——它描述的是「pm 产计划 → `task_ops` 落 `docs/scheduling/`」。**落地时须注意**：`ans init` 骨架若要承接调度记录，需另备一份 **`task_ops` 形态的配置/边界**（这属产品演进，非本约定范围；本项只落恒等不变量：目录归 pm、唯一写入者 `task_ops`）。

3. **Windows 环境注意**：`task_ops` 部分读文件未显式指定编码，在中文/UTF-8 内容下会命中系统默认 GBK 而报 `'gbk' codec can't decode`。需以 **Python UTF-8 模式**运行（`PYTHONUTF8=1`）方可。

## 7. 变更记录

- 2026-10-11：首次建立。定性为「使用约定、非产品代码」；写清归属（`docs/scheduling/` 归 pm、内容唯一写入者 `task_ops`、编排不得直接写）、使用步骤、记录格式与 hash 链；附一条**实测**记录样例（`%TEMP%/ans-t6-sample2`，链长 2，独立读回校验通过、篡改被检出）；**如实标注 V1 不实现调度执行（§3.7，执行路径见二期 S1）**；如实记录实测发现——`ans init` 的 `.ans/project.json` 与 `boundary.yaml` 与 `task_ops` 配置/边界**格式不匹配**、Windows 需 `PYTHONUTF8=1`。来源：本项目任务 T6。
