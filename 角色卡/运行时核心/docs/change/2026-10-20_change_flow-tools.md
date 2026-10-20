---
id: flow-tools-runtime-core
type: change
title: Flow 文件方法化工具层（flow_get / flow_step_update / flow_step_supersede）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [flow-tools]
---

# Flow 文件方法化：运行时核心工具层（最小闭环）

## 背景（客户拍板）

客户 2026-10-20「按这个方案做吧」：flow 文件方法化——应用是 `docs/flows/<flowId>.yaml` 的唯一写者，角色不再直接写流程文件，改用 `flow_get` / `flow_step_update` / `flow_step_supersede` 三工具。本角色负责**运行时核心工具层**（共享类型、工具 handler、schema、Service 透传）；权限/状态迁移/证据完整性/revision 冲突/Steward-only 等**全部裁决在编排 flow-service**。

## 改动（均在运行时核心边界内）

1. `src/model/runtime.ts`（中立契约，单一来源）
   - 新增 `FlowToolStatus`（8 值）＋运行时枚举 `FLOW_TOOL_STATUSES`、`FlowToolStepKind`（4 值）＋ `FLOW_TOOL_STEP_KINDS`（schema 与工具层参数校验共用，避免两处漂移）。
   - 新增 `FlowToolEvidence` / `FlowToolStepView` / `FlowToolView` / `FlowToolResult`（`ok`、`revision`、`flow`、`idempotent`、`error`、`code`、`issues:string[]`）。
   - 新增注入能力类型 `FlowGetFn` / `FlowStepUpdateFn` / `FlowStepSupersedeFn`（载荷字段与协调者给定形状逐字一致；可选键缺席不造键）。
   - `GovernedToolsOptions` 增可选 `flowGet?` / `flowStepUpdate?` / `flowStepSupersede?`；**每项未注入 ⇒ 对应工具不注册**（结构性 fail-closed，沿 dispatch_task 先例）。
2. `src/provider/runtime/tools.ts`
   - 新增工具名常量 `FLOW_GET_TOOL_NAME` / `FLOW_STEP_UPDATE_TOOL_NAME` / `FLOW_STEP_SUPERSEDE_TOOL_NAME` 与三个 handler 工厂。
   - handler **只做参数形状校验＋调用注入能力＋如实转达回执**：非法必填/status/evidence/kind 在触达能力前拒绝；合法载荷原样传入（可选键不造键）；回执原样转达 `ok/code/revision/idempotent/error/issues` 与 flow 视图；能力抛错/契约外回执 ⇒ fail-closed「未完成/未获明确结果」，绝不说成成功。
   - 诚实面：成功文案明确「步骤推进 ≠ 客户批准」；需要客户决定的步骤仍须走客户交互工具。中止文案：读取不推断状态、变更不假设已生效。
   - `buildGovernedTools`：三能力各自独立「注入才注册」；无注入时工具面逐字不变。
3. `src/provider/runtime/schema.ts`
   - `flow_get`：`flowId` 可选；只读、结构化视图；推进前先取最新 revision。
   - `flow_step_update`：必填 `flowId/stepId/status/expectedRevision`；可选 `evidence{kind,ref}` / `idempotencyKey` / `note`；说明 `revision-conflict` / `insufficient-evidence` / `invalid-transition` 等错误、`idempotencyKey` 幂等重试、**步骤推进 ≠ 客户批准**、本工具不写 flow 文件。
   - `flow_step_supersede`：必填 `flowId/oldStepId/newStepId/title/owner/kind/expectedRevision`；可选 `reason/idempotencyKey`；**仅 Steward**（服务端再校验）、替代不是删除（旧步骤保留 superseded）、revision 冲突口径同上。
   - 三工具均 `additionalProperties:false`；status/kind 枚举引用 `model/runtime.ts` 的运行时单一来源。
4. `src/service/runtime/session.ts`：**无需代码改动**——`RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>` 且 `buildGovernedTools(options.gate, { ...options, … })` 已展开透传三能力；新增 Service 级测试证明注入后三工具出现在 provider 工具面、未注入不出现。
5. 测试 `test/runtime-core/flow-tools.test.ts`（新增 11 例）：未注入/部分注入不注册；注入后 schema 必填/枚举/附加属性与文案口径；flow_get 缺省 `{}`/显式 flowId 原样透传并转达 flow 视图；update 完整载荷（含 evidence/idempotencyKey/note）与缺省键不造；supersede 载荷原样（Steward-only 由服务端拒绝并如实转达）；revision 冲突含 code/error/issues、idempotent 重放标注；能力抛错/契约外回执 fail-closed；非法参数不触达能力；中止文案；judge 工具集仍恰三只；Service 透传。`governance-judge.test.ts` 的 forbidden 列表补三只 flow 工具。

## 验证（真实输出）

- `node --test test/runtime-core/flow-tools.test.ts`：**11/11 过**。
- `node --test "test/runtime-core/**/*.test.ts"`：**240 计 / 239 过 / 0 红 / 1 跳过**（跳过＝boundary-write-guard Windows 条件用例）。
- `npm run typecheck`：**exit 0（0 错）**（编排并发新增的 `test/编排/flow-service.test.ts` 一度有类型错误，其属主已修正）。
- 跨角色只读复跑：`node --test test/编排/flow-service.test.ts` **11/11 过**（串行/版本校验/证据对账/原子写/幂等/权限/supersede/并发）。
- 未跑真实模型 / 凭据 / 网络；未 git 提交。

## 跨角色状态与待办

1. **编排（本工作树内在飞，未提交）**：`src/common/编排/flow-service.ts` 已按本契约导入 `FlowGetFn`/`FlowStepUpdateFn`/`FlowStepSupersedeFn`/`FlowToolResult`/`FlowToolStatus`/`FlowToolStepKind`/`FlowToolView` 并实现串行/版本校验/证据对账/原子写/幂等/权限；其 `test/编排/flow-service.test.ts` 只读复跑 **11/11 过**，全仓 typecheck **exit 0**。类型契约已对齐，无需运行时核心再改。
2. **Pi适配器（已落地，commit ea793cc，属主＝Pi适配器）**：`src/provider/pi/session.ts` 已增 `flowGet/flowStepUpdate/flowStepSupersede`（假适配器 opts 与调用、`PiRuntimeAdapterOptions`），只读复跑 `test/pi-adapter/flow-tools.test.ts` **4/4 过**。生产 Service 路径本就不需改（`tools` 预装配 + `...options` 透传）。
3. **编排注入端**：`createFlowService({ projectRoot, actorRoleId, actorPower, defaultFlowId? })` 的三个方法可直接作为 `flowGet/flowStepUpdate/flowStepSupersede` 注入 `RuntimeSessionOptions`（签名已由 typecheck 对齐）；按角色/流程注入判据属编排。

## 2026-10-20 追加：`flow_step_supersede` 权限文案同步 Steward/Lead

装配核对发现编排 `flow-service.ts` 的工作流管理者已含 `schedule`（Steward/Convener）**与 `liaison`（Lead）**（`isFlowManager`；supersede 拒绝文案为「只有 Steward/Lead（工作流管理者）可以 supersede 步骤。」），但 schema 仍写「仅 Steward（流程管理员）可用」。已同步（纯文案，handler/服务端权限未动）：

- `src/provider/runtime/schema.ts`：`flow_step_supersede` description 改为「**仅 Steward（流程管理员）或 Lead（Liaison，工作流管理者）可用**——服务端按调用角色校验，其他角色调用返回错误」；promptGuidelines 改为「**仅 Steward 或 Lead（工作流管理者）使用**」；`oldStepId` 字段说明补「supersede requires Steward (Convener) or Lead (Liaison) — validated by the server」；块注释同步。
- `test/runtime-core/flow-tools.test.ts`：schema 断言改为新口径，并反向钉住不得残留「仅 Steward（流程管理员）可用 / 仅 Steward 使用 / 非 Steward 调用」；服务端拒绝夹具由 `not-steward` 改为 `forbidden`（文案对齐 flow-service 现状），仍验证工具层不按角色预拦、原样转达回执。
- 验证：`node --test test/runtime-core/flow-tools.test.ts` **11/11 过**；`node --test "test/runtime-core/**/*.test.ts"` **240 计 / 239 过 / 0 红 / 1 跳过**；`npm run typecheck` **exit 0**。未改 handler/服务端权限/编排文件。

## 残余风险

- 工具层不校验状态迁移/证据/权限（按设计全在 flow-service）；若注入端误把能力授给不该有的角色，工具层不会兜底——注入端与 flow-service 的 actorPower/actorRoleId 是唯一防线。
- `issues` 在本契约中为 `string[]`（flow-service 已把结构化 issue 映射为 `path: message` 字符串）；若后续需要结构化 issues，须三方（model/tools/flow-service）同步升级。
