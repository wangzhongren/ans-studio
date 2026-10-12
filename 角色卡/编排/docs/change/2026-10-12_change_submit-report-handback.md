---
id: submit-report-handback
type: change
title: 交报告工具接入回交事件（C-1）+ 回交证据只取写类事件（噪音修正）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, governed-interaction-a3a4]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §C-1（客户裁定「新增交报告工具」）：报告即回交内容、证据只取写类
  - date: "2026-10-12"
    kind: implemented
    summary: 编排侧实施——handback.ts 增 TaskReport/normalize/buildReportHandback + isWriteAccepted 过滤；run-role 只给项目角色注入 reportHandback（经既有能力面）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 141/141；全量 718 计/715 过，仅剩 2 条既有环境红；typecheck 零错
---

# 交报告接入回交（C-1）与回交证据的噪音修正

## 改在哪里（位置 → 改动）

1. **`src/common/编排/handback.ts`**
   - **新增 `TaskReport`**（`{ status: "completed"|"blocked"; summary: string; evidence?: string[] }`，与 Pi适配器契约家 `ReportHandbackPayload` 同名同型）与 `normalizeTaskReport`（形状校验：非法 status / 空 summary → `undefined`；`evidence` 类型错按缺失处理——**回退，不硬失败**）。
   - **新增 `buildReportHandback`**：由**模型交的报告**构造回交——`status`/`summary`/`evidence` 取报告值（`evidence` 缺省 `[]`，报告是权威值）；`roleId`/`taskId`/`at` 由编排补。
   - **`withHandback` 增 `opts.report`**：settle 时**报告优先**；未见报告（未交/非法）→ **回退既有推导** `buildTaskHandback`（逐字保留）。
   - **证据过滤修正（独立噪音缺陷）**：`buildTaskHandback` 的证据由「所有 `accepted` 摘要」改为**只取写类**（`isWriteAccepted`：写/编辑，含目标文件路径）——兼容仓内三处实际事件形状：假适配器 `detail.call.name`、真实适配器 `「<toolName> 执行完成」` 摘要、装配演示 runtime `「写入被允许…」` 摘要；**`read_file 执行完成` 之类的读事件不再混入证据**（反向断言钉住）。
2. **`src/pipeline/orchestration/run-role.ts`**
   - `AdapterCapabilities` 增 `reportHandback?: (report: TaskReport) => void | Promise<void>`。
   - `openRoleSession`：**只给项目角色会话**注入 `reportHandback`（闭包暂存报告，settle 取用）；**治理角色 su 不注入**（不自我回交，既有语义）——经既有能力面 `deps.createAdapter(gate, capabilities)` 转交；`withHandback(..., { report: () => taskReport })`。
   - `createPiAdapterFactory` 原样转发 `reportHandback`（Pi适配器据此注册 `submit_report`——「注入才注册」；未注入即不存在）。
   - 一次性路径 `runRole`（`ans role run`）不涉及（它本就不产回交事件）。

## 前后差别（一个触发场景）

- **以前**：普通角色完成一轮后，回交给 su 的摘要取自 `settled` 事件（会话结束语），证据里混着 `read_file 执行完成` 这类**读事件**——「产物证据」里一半是噪音；模型自己想说什么（做了什么、为什么 blocked）表达不出来。
- **现在**：模型可在轮内调用 `submit_report` 交一份**自己写的**报告——回交事件的 `status`/`summary`/`evidence` **即报告值**（如 status=blocked + 「等外部依赖」+ 证据路径清单）；**没交报告时**行为与以前一致（`settled` 摘要 + 推导结论），且证据**只含写类落地**，读事件不再出现。

## 不改什么

- 回交**只搬证据、不搬身份与写权**（SKILL.md 交接语义）不变；`HandbackEvent`/`OrchestrationEvent` 形状不变（消费方零改动）。
- 回交触发时机不变（settle 时先发 handback 再透传 settled）；su 不自我回交不变。
- 工具定义/注册（`submit_report`）与桌面回交卡在各自角色（Pi适配器 / 桌面应用），本层未碰。

## 如何确认（实际结果）

- `test/编排/handback.test.ts` **10 例全绿**（新增 5：证据三形状正反断言；`normalizeTaskReport`/`buildReportHandback` 单元；`withHandback` 报告优先/回退；`openRoleSession` 端到端报告=事件值 / 未交回退 / 非法回退；su 不注入 `reportHandback` 且无回交）。
- `test/编排/` **141/141**；`npm run typecheck` **零错**；全量 `node --test "test/**/*.test.ts"`（引号带）**718 计 / 715 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），与本改动无关。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。未发真实模型请求；真实模型「自己写报告」的行为属**客户跑**。

## 跨角色

- **Pi适配器**：`submit_report` 工具与 `ReportHandbackFn` 契约已落其侧（`session.ts:203-244`，与本层 `TaskReport` 同名同型——结构对齐，编排不导入其实现）。
- **桌面应用**：回交卡按 `角色/任务/结论/摘要/证据` 呈现（设计 §C-1，归其侧）。
