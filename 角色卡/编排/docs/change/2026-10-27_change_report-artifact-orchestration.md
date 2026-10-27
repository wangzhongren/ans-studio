---
id: report-artifact-orchestration
type: change
title: report_artifact_ready 接入编排注入面（仅质检/verifier）
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [report-artifact-ready-contract, request-gate-review-orchestration-core, request-requirement-change-orchestration]
events:
  - date: "2026-10-27"
    kind: implemented
    summary: 按客户 2026-10-27 新设计，把运行时核心交付的 reportArtifact 能力按「注入才注册」接入 AdapterCapabilities/openRoleSession，仅在 trio verifier 会话透传；新增编排测试 3 例（定向 3/3、test/编排 1022/1024、唯一红为既有 Windows symlink），typecheck exit 0
---

# 变更记录：`report_artifact_ready` 接入编排注入面（仅质检/verifier）

- 角色：编排
- 日期：2026-10-27
- 状态：**implemented-unverified**（编排面实现与测试已跑；桌面注入/应用侧校验收口、跨角色 e2e、独立验收
  未做，不代表通过）
- 来源：客户 2026-10-27 新设计（经主控任务转达）——**质检写完实施前验收标准后只向应用汇报
  （`report_artifact_ready`），由应用校验并决定是否收口；质检不得自批 flow 状态、不得盯文件自动勾卡**。
  运行时核心已交付冻结契约与工具（`角色卡/运行时核心/docs/change/2026-10-27_change_report-artifact-ready-contract.md`），
  门禁引擎同批只改 verifier 卡文本（未新增能力位）。本批只接线编排注入端。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/run-role.ts`
  - `test/编排/report-artifact.test.ts`（新增 3 例）
  - 本记录、`changelog.md`、`api-spec.md`、`feature-map.md`
- **未改** `src/model/**`、`src/service/**`、`src/provider/**`、`app/**`、`src/common/门禁引擎/**`、
  共享 i18n、门禁卡、其他角色资料；未新增 `FlowStepKind` / cardKind / 能力位；未 commit/push、
  未重启应用、未碰 `demos/` 或 `C:/Users/51054/Downloads/pixel-space-demo`。

## 一、背景与纪律

客户新设计把「验收标准就绪」从**质检自行改 flow 状态**改为**应用中介的汇报**：

```text
Proof / 质检（verifier）写完验收标准
  └─ report_artifact_ready({ flowId, stepId, path, summary?, sha256? })
       └─ 应用校验路径/步骤归属/产物一致性 → 决定是否收口并写 flow
            └─ 回执 ok / accepted / message 原样回到质检
```

两条纪律贯穿本批：

- **质检不得自批**：编排只把能力原样交给 verifier 会话，不替它推进/收口 flow，也不代替应用做校验或决定。
- **汇报成功 ≠ 自动完成**：`accepted:true` 只表示应用已接受该产物；是否收口/推进 flow 步骤由应用决定并写入。

## 二、字段接线（单一来源＝契约家 `model/runtime.ts`，本层只读导入）

| 层 | 字段/动作 | 说明 |
| --- | --- | --- |
| Model（运行时核心） | `ReportArtifactInput` / `ReportArtifactReceipt` / `ReportArtifactFn`；`GovernedToolsOptions.reportArtifact?` | 已由运行时核心落地；编排不复制第二份形状 |
| 编排 `AdapterCapabilities` | `reportArtifact?: ReportArtifactFn` | 「注入才注册」能力面 |
| 编排 `openRoleSession` 输入 | `reportArtifact?: ReportArtifactFn` | 桌面（前端）提供的实现，仅 verifier 转交 |
| 编排 capabilities 装配 | `...(reportArtifact !== undefined ? { reportArtifact } : {})` | 未注入 ⇒ 字段缺席 |
| 编排 `createRuntimeAdapterFactory` | `reportArtifact: capabilities?.reportArtifact` | 同名能力位显式透传（未注入为 `undefined`，覆盖 `deps.runtimeOptions` 残留，防非 verifier 会话旁路）；同一引用，不包装 |
| Service `RuntimeSessionOptions` | 经 `Omit<GovernedToolsOptions, …>` 继承；Service `...options` 透传 | 运行时核心无需另改字段（已在契约说明中确认） |
| Provider `buildGovernedTools` | `options.reportArtifact !== undefined` ⇒ 注册 `report_artifact_ready` | 未注入 ⇒ 工具不存在（最强 fail-closed） |

## 三、注入点与判据

`run-role.ts::openRoleSession` 内：

```ts
const reportArtifact: ReportArtifactFn | undefined =
  builtInGovernance && trioSpec?.id === "verifier" && input.reportArtifact !== undefined
    ? input.reportArtifact
    : undefined;
```

- **只给内置治理角色中的质检/Proof（trio verifier）**；判据在编排注入端（运行时核心只声明能力位名，
  不硬编码角色 id），沿 `request_gate_review`（convener-only）先例。
- 其他内置治理角色（liaison / rapporteur / nominator / convener）、single 模型的旧 `su`、项目角色：
  即便调用方误给也不注入 ⇒ 工具结构性不注册。
- 未提供 ⇒ 不注入（同 `request_acceptance` 先例）。
- **不改变** `requestAcceptance` / `requestGateReview` / `requestBoundaryChange` /
  `requestRequirementChange` / `viewImage` / `dispatchTask` 等既有能力矩阵。
- 一次性 `ans role run` 不涉及（其路径不传 capabilities，且结构性拒绝内置角色）。

## 四、测试与证据（2026-10-27，win32 / Node v24.22.1）

新增 `test/编排/report-artifact.test.ts` **3 例**：

1. **verifier 注入正向**：能力以**同一引用**并入 `AdapterCapabilities` → `createRuntimeAdapterFactory`
   → Service → Provider，`report_artifact_ready` 注册；工具调用前编排零预调用；载荷
   `{flowId, stepId, path, summary}` 原样路由；回执 `accepted=true` 与能力 message 原样转达，并含
   「不等于自动完成」「不要自行修改 flow 状态」；**打开/开轮/settle 全程不写 `docs/flows`、不写
   `.ans/governance/ledger.jsonl`（不伪造决定）、产物字节不变**。
2. **deps 旁路防护**：`deps.runtimeOptions` 夹带同名 `reportArtifact` 时，非 verifier（liaison）
   会话仍不注册工具——`createRuntimeAdapterFactory` 以 capabilities 的 verifier 判据为准（显式覆盖）。
3. **fail-closed 矩阵**：verifier 未提供、liaison / convener 误给、single 旧 `su` 误给、项目角色误给
   ⇒ 能力均不注入，`report_artifact_ready` 均不注册。

命令与结果：

| 检查 | 结果 |
| --- | --- |
| `node --test test/编排/report-artifact.test.ts` | **3/3 通过**，exit 0 |
| `node --test "test/编排/**/*.test.ts"` | **1024 计 / 1022 过 / 1 红 / 1 skip**；唯一红＝既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:103`，与运行时核心记录基线一致） |
| `npm run typecheck` | **exit 0**（运行中曾见桌面属主在途的 `SessionManagerDeps.reportArtifact` 1 错；其收尾后复跑已零错；本批编排文件始终零类型错误） |

## 五、明确不做 / 跨角色缺口

1. **桌面窗口**（属主）：应用侧 `reportArtifact` 实现（flowId/stepId 归属、步骤状态、path 是否约定
   产物、sha256 与文件当次字节一致性校验）与**是否收口**（是否调用
   `completeAcceptanceCriteriaStep` 或等价收口路径）、按角色仅向 verifier 注入、`SessionManagerDeps`
   类型补字段，均未由本批实现（并发桌面会话运行中已在途；最终复跑 typecheck exit 0）。
2. **运行时核心**：契约/工具已交付并验证；本批只读消费，未改其文件。
3. **门禁引擎**：verifier 卡文本已由该角色同批改为「用 `report_artifact_ready` 汇报、等待 accepted、
   不自批」；未新增能力位。
4. **未做**：真实 Electron/模型端到端、跨角色 e2e、独立验收、commit/push、重启。

## 六、残余风险

- 工具层不判角色（运行时核心已登记同风险面）：注入端是唯一角色门；本批已把编排注入端收紧到
  trio verifier，桌面注入端仍需按同一判据实现。
- `accepted` 语义冻结：`ok:true` 但 `accepted` 缺席按未接受 fail-closed；应用若想表达「已受理未决」
  应给 `accepted:false` 或在 `message` 说明。
- 编排测试依赖运行时核心未提交的契约/工具改动（同一工作区）；合并/提交顺序不当会让本测试短暂红。
