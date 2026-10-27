# 桌面窗口：质检工件汇报（report_artifact_ready）与流程推进/停滞看护

- 日期：2026-10-27
- 角色：桌面窗口
- 触发：客户新设计——质检（verifier）写完验收标准后**调用 `report_artifact_ready` 汇报给应用；应用校验后
  决定是否收口**。不允许应用盯文件自动勾卡，也不允许质检自己改状态。之前那版自动收口已撤销（无代码改动）。
- 状态：桌面侧实现完成（1+2+3），测试与 typecheck 通过。**跨角色契约已在本工作树落地**（并发角色工作）：
  运行时核心 `src/model/runtime.ts` 的 `ReportArtifactFn`/`ReportArtifactInput`/`ReportArtifactReceipt`、
  Provider `report_artifact_ready` 工具（注入才注册）、编排 `run-role.ts` 仅对 trio verifier 透传；桌面
  直接消费上述官方类型（不复制契约），端到端接线已就位。未跑真实 Electron e2e、未独立验收、未 commit/push、
  未重启运行中的应用。

## 一、应用侧汇报处理（`report_artifact_ready`）

### 契约形状（单一来源＝运行时核心，桌面只读消费）

- 注入能力与载荷/回执：`src/model/runtime.ts`
  `ReportArtifactFn = (input: ReportArtifactInput) => Promise<ReportArtifactReceipt>`；

```ts
interface ReportArtifactInput {
  flowId: string;    // 必填（工具层校验非空；应用再校验归属/存在性）
  stepId: string;    // 当前只接受 "acceptance-criteria"
  path: string;      // 必须等于该项目该流程最新验收标准路径
  summary?: string;  // 可选有界说明（不参与判定、不写账本）
  sha256?: string;   // 可选内容摘要（应用侧校验格式与文件真实字节一致）
}

interface ReportArtifactReceipt {   // 工具层原样转达；accepted 缺席按「未接受」fail-closed
  ok: boolean;
  accepted?: boolean;
  message?: string;
}
```

- 工具注册与参数形状：`src/provider/runtime/tools.ts::report_artifact_ready`（未注入 ⇒ 不注册；工具不读写
  flow/不判治理）；编排 `run-role.ts` 只对 **trio verifier** 透传，桌面 SessionManager 也只在
  `role.builtIn && governanceFunction === "verification"` 时注入（双闸门，不冲突）。
- 桌面扩展：`app/desktop/artifact-report.ts` 只承载**诊断扩展回执**
  `DesktopReportArtifactReceipt extends ReportArtifactReceipt`（`code` / `flowId` / `stepId` / `path` /
  `detailCode` / `alreadyDone`；核心三字段 `ok`/`accepted`/`message` 恒显式给出）与路径规范化；不复制
  契约类型。工具层只读核心三字段，扩展字段仅供桌面测试/诊断对齐。


### 校验（全部通过才调收口；`app/desktop/interface.ts::reportArtifactForProject`）

1. 项目根非空（会话闭包绑定）；
2. `flowId` 必填（工具层已校验非空）；应用再做 slug+归属归一：显式值非法 slug 拒绝；防御性省略时仅当
   `docs/flows` 恰有一个 YAML 才采用，多流程/无流程拒绝并提示指定（与 `request_acceptance` 共用同一
   `resolveGovernanceFlowIdForProject`，不复制第二份）；
3. 当前项目/flow 的 `docs/flows/<flowId>.yaml` 必须存在且可被 `parseFlowStateYaml` 解析；
4. flow 必须含精确 id `acceptance-criteria` 的步骤且 `kind === "artifact"`；允许的状态为
   `pending` / `dispatched` / `done`（已 done 走幂等），其它状态（如 `delivered`）明确拒绝、不覆盖；
5. 最新验收标准必须存在/可读/非空：版本扫描 `docs/acceptance/<flowId>-criteria-vN.md`（不回退旧版本）；
6. 汇报 `path` 规范化（`\`→`/`、去 `./`）后必须**逐字等于**最新标准路径；旧版本/绝对路径/未知路径
   一律 `path-not-latest` 并给出最新路径；
7. 可选 `sha256`（契约字段）：必须为 64 位十六进制且与最新标准文件**真实字节哈希**一致；格式非法
   `invalid-input`、不一致 `content-mismatch`（工具层只校验非空，内容一致性由应用负责）；
8. 校验通过才调用编排应用专用 `completeAcceptanceCriteriaStep({ projectRoot, flowId })`（幂等、原子写、
   标准缺失/不可观察/终态 fail-closed；只改目标步骤、不写 `customer.decision`、不注册为角色工具）。

**Fail-closed / 不伪造**：收口助手抛错或 `ok:false` 一律返回 `ok:false, accepted:false` + 底层原因
（`detailCode` 原样携带）；不把拒收/失败说成 accepted；拒收不改 flow、不写账本。重复汇报同一标准按
`alreadyDone`（`code:"already-accepted"`）幂等接受，不重复写盘/观测。

**收口 accepted 后立即触发一次检查**：调既有 `scheduleAcceptanceCheck(projectRoot, "ledger")`
（40ms 有界合并；同一事件入口，不新增第二套检查器）。

### 注入角色（`app/desktop/session.ts`）

- **仅 verifier**：判据 `role.builtIn === true && governanceFunction === "verification"`（数据驱动，不硬编码
  角色 id）；其它内置治理角色（liaison/rapporteur/nominator/convener）与项目角色一律不注入
  ⇒ 工具不注册（结构性 fail-closed）。
- 本层只把 `projectRoot` 绑定到能力闭包；校验/收口/回执全部在 Interface。

## 二、自动派发文案 / 唤醒（客户新设计第 2 项）

1. **写标准任务文案**（`app/desktop/governance-advance.ts::buildAcceptanceCriteriaTaskMessage`）追加硬要求：
   写完后调用 `report_artifact_ready({ flowId, stepId: "acceptance-criteria", path })` 汇报；应用校验通过才
   收口；不得自行 `flow_step_update` 标 done、不得改 flow 其它状态；被拒按回执修正后再报。
2. **标准已存在但步骤仍 pending/dispatched** ⇒ 给 verifier 发**一次**「请汇报」系统唤醒
   （`buildAcceptanceCriteriaReportReminderMessage`；`interface.ts::remindVerifierToReportArtifact`）：
   - 去重键：`projectRoot\0flowId` → `最新标准路径 + 步骤状态`（同路径同状态只发一次；新版本/状态变化才再提醒）；
   - verifier 忙/有排队 ⇒ 跳过等下一次真实事件/看护 tick（不并发注入、不轮询）；
   - 投递成功才记账去重；失败只诊断、留待下次事件重试（不循环）；
   - **只看文件不勾卡**：提醒本身不改 flow/账本，收口只经第 1 项的能力。
3. 该判定同时挂在 `dispatchAcceptanceForFlow` 的新契约标准分支（标准存在但步骤未收口 ⇒ blocked
   `flow-incomplete`，附明确原因；不继续派验收判定）与流程 tick（见下）。

## 三、流程推进 / 停滞看护（客户新设计第 3 项）

**触发面（复用既有入口，不新增第二套状态机）**：
- 既有验收检查 `runAcceptanceCheck`（角色 settle / 治理账本变化 / 导入补齐）末尾调用只读
  `runFlowAdvanceTick(projectRoot)`；
- 看护 tick：`watchdog.ts` 新增可选 `onTickProject(projectRoot, at)`（看护只提供 tick 时机，不读 flow、
  不做治理判定；回调异常只记 `watchdog.tick-hook.failed`），Interface 注入
  `(root) => scheduleFlowAdvanceTick(root)`。同项目串行 + 突发合并（不堆积、不丢信号）。

**读取与判定（只读）**：逐 `docs/flows/*.yaml` → `parseFlowStateYaml` + revision（sha256）+
`readGovernanceLedger` + 同源看护快照（`manager.watchdogSnapshot`）：
- `current` = flow 中存在 `dispatched`/`delivered` 步骤；
- 「全部相关角色空闲/无 pending 卡」= 快照 roles 全部非 busy、队列全空、`activeDeliveries===0`、
  `chainsActive===false`、`pendingConfirmationsTotal===0`（不造第二数据源）；
- 账本坏行/不可读 ⇒ 不做 ready 唤醒与停滞判定（只做「请汇报」提醒；fail-closed）。

**动作**：
1. **无 current + 有 ready pending**（`listReadyFlowSteps` 按账本 `dispatch.accepted.stepId` 去重；排除
   `role-cards`/`role-readiness` 等应用门控步骤）⇒ 复用既有 `wakeStewardForReadySteps` 给运营（convener）
   发 `[自动推进]` 后台系统唤醒（内部按 revision+ready 集合去重、有预算、convener 忙则跳过）。
2. **无 current + pending>0 + 上述空闲持续 ≈10 分钟**（`DesktopDeps.governanceTickOptions.stallMs`，缺省
   600000ms；测试可注入短值）⇒ 向 convener 发**一次** `[自动推进·停滞]` 系统提示
   （`buildFlowStallTaskMessage`：列出 pending 步骤、ready 列表、人工闸门 stopReason，并要求 `flow_get`
   核对后按职责协调）。去重：签名 = revision + 排序后的 pending id；同一签名只告警一次；短暂忙碌
   （如应用刚发的推进唤醒本体）只暂停计时，不重置「已告警」记忆——避免唤醒自身导致下一次刷屏；签名变化
   （任何 flow 写盘/步骤变动）才开启新回合。
3. **不**直接派 worker、不标 done、不写 flow/账本、不伪造状态；「标准收口 accepted 后立即触发一次检查」
   由第 1 项能力的 `scheduleAcceptanceCheck` 承担。

## 四、测试

新增/扩展 `test/桌面应用/acceptance-dispatch.test.ts`（fake flow/ledger + 脚本会话，不跑真实模型）：

| 用例 | 覆盖 |
| --- | --- |
| verifier 汇报最新标准 ⇒ 校验通过、收口 acceptance-criteria、立即触发验收检查 | accepted / 步骤 done + artifact 证据 / 账本 app/app artifact.observed / verification 派发恰一次 |
| 拒绝路径 fail-closed | `unsupported-step` / `path-not-latest`（v2 存在时拒 v1）/ `criteria-missing` / `criteria-empty` / `step-terminal`（delivered）/ `step-missing` / `flow-not-found` / sha256 格式非法 / `content-mismatch`；flow 原文与账本零写入 |
| 重复汇报幂等 | 第二次 `accepted:true` + `alreadyDone` + `already-accepted`；artifact.observed 仍一条 |
| 注入矩阵 | 仅 verifier 注入 `reportArtifact`；liaison/rapporteur/nominator/convener/executor 均无；requestAcceptance/viewImage 零回归 |
| 标准已存在但步骤 pending | verifier 收一次「请汇报」（含 `report_artifact_ready` 与最新路径）；重复事件不再发；应用不自动勾卡、不派验收复核 |
| ready tick 去重 | 无 current + ready pending ⇒ convener 收一次 `[自动推进]`（含 delivery-api）；看护 tick 重复触发不重复；应用不改 flow、不直接派 worker |
| 停滞兜底去重 | 无 current + pending>0 + 全空闲超过阈值 ⇒ convener 收一次 `[自动推进·停滞]`；多 tick/convener settle 不刷屏；不写 dispatch.accepted、不改 flow |

回归结果：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 目标套件 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | **106/106 通过** |
| 全部桌面测试 | `node --test "test/桌面应用/*.test.ts"` | **708/708 通过** |
| 跨角色契约套件（只读复核，未修改） | `node --test "test/runtime-core/report-artifact-tool.test.ts" "test/编排/report-artifact.test.ts" "test/门禁引擎/verifier-artifact-report.test.ts"` | **17/17 通过** |

说明：全文件高负载下，既有 gate pass 用例（`waitFor` 只等 gate 记录落盘、不等后续审计账本/系统行）在
第一次整文件运行时出现过一次既有竞态偶发；单独复跑 3/3 通过、整文件复跑 106/106 通过。本变更未改动该
用例或其被测路径。

## 五、跨角色契约对齐与剩余项

1. **已落地（并发角色工作，非本角色改动；本角色只读消费）**：
   - `src/model/runtime.ts`：`ReportArtifactFn`/`ReportArtifactInput`/`ReportArtifactReceipt`；
     `flowId`/`stepId`/`path` 必填，`summary?`/`sha256?` 可选；回执 `{ok, accepted?, message?}`
     （`accepted` 缺席由工具层按「未接受」fail-closed 转达）。
   - `src/provider/runtime/tools.ts`：`report_artifact_ready` 参数严格校验、回执如实转达、未注入不注册。
   - `src/pipeline/orchestration/run-role.ts`：`reportArtifact` 仅对 **trio verifier** 透传到适配器能力；
     桌面 SessionManager 的注入判据与之同向（双闸门，不冲突）。
   - 门禁引擎 verifier 角色卡/工作流文案已要求「写完后 `report_artifact_ready` 汇报、等 accepted、不自行改
     flow 状态」。
2. 桌面已直接 import 官方类型（`ReportArtifactFn`/`Input`/`Receipt`），`artifact-report.ts` 只保留桌面诊断
   扩展回执与路径规范化——**无第二份契约**。
3. **仍需真实环境验证**（本次未授权重启/未跑 e2e）：真实 Electron 下 verifier 会话调用
   `report_artifact_ready` → 应用校验/收口 → 验收检查的端到端链路；「请汇报」唤醒与 `[自动推进]` /
   `[自动推进·停滞]` 系统消息在 Pi/Claude 两引擎下的可见性。
4. 未独立验收；未 commit/push、未重启应用。
