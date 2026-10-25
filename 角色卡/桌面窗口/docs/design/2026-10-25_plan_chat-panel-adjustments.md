# 聊天面板细节调整·桌面窗口实施计划（2026-10-25）

- 依据：UI/UX 评审 `角色卡/UIUX设计师/docs/design/2026-10-25_review_chat-panel-details/report.md`（§2 A3/A4、§3「桌面窗口（app/main、app/desktop、preload）」）与客户「先出实施计划、再按计划改」的要求。
- 角色：桌面窗口（主进程/preload/desktop/e2e）。渲染呈现（`app/renderer/src`）属桌面UI，本计划**不改**。
- 状态：计划。本文先说明现状、目标、接口与验证；代码按本文实施。UI 侧计划 `角色卡/桌面UI/docs/design/2026-10-25_plan_chat-panel-adjustments.md` 尚不存在；本计划的字段全部**可选**，UI 未消费时行为与现在一致。

## 1. 场景与目标

具体例子：项目 `bookmark-manager` 的 Proof（验收）一轮结束后，应用把一条 `[系统·治理反馈]` 任务投给 Lead：

```
[系统·治理反馈] 来自 验收 的验收状态（只含状态与报告指针；不转述报告正文）：
状态：本轮已完成（流程 bookmark-manager-v1）
报告路径：docs/acceptance/bookmark-manager-v1-report-v1.md
治理记录：docs/governance/verifier/bookmark-manager-v1.md
请只向客户说明验收复核已结束与报告位置；不要转述报告内容，不要编辑/代批/改判验收结论……
```

运行时把这条输入回显为 `prompt-input` 消息事件，聊天面板原样显示——包括「不要转述/不要编辑」这类**内部指令**。客户看到的是内部工作提示，而不是「验收已完成 + 报告在哪 + 需要我做什么」。

完成后的效果：同一事件仍然携带内部原文（审计可查），但另外带一份**结构化客户投影**（来源角色、状态、流程、报告路径、客户动作）。UI 只渲染投影；没有投影的旧事件按原逻辑渲染。

## 2. 逐项：是否需要主进程改

| 项 | 现状（桌面侧） | 目标 | 是否需要主进程改 |
| --- | --- | --- | --- |
| A3 治理反馈内部指令外露 | `app/desktop/session.ts::mirrorGovernanceFeedback` 只生成自然语言任务；运行时的 `prompt-input` 回显（`detail.source:"prompt-input"`, `detail.text`）被原样外推 | 对这类事件附带可选 `detail.clientProjection`（结构化客户投影）；`detail.text` 内部原文保留（审计），UI 可折叠/不渲染 | **是**（本计划核心） |
| A4 同一验收状态重复/会话结束行 | 每次状态事件都是独立事件；无跨事件稳定键 | 给 A3 投影带稳定 `fingerprint`（同来源/同状态/同流程/同指针/同正文 ⇒ 同值），UI 以 `×N` 合并；相同助手正文的合并不需要桌面字段（UI 可自行哈希正文）；每轮「会话结束」已有 `turnId`，UI 改分隔样式即可 | **部分**：只补投影内 `fingerprint`；不新增通用事件指纹（避免为改而改） |
| A1 上下文状态重复 | `contextText` 已由 renderer 侧状态持有（`App.tsx`/`chat-store.ts`），主进程无重复源 | 仅 UI 收敛为单一 chip/live region | **否** |
| A0/B1–B5/C1–C5 | 全部在 renderer/样式/i18n | — | **否**（桌面UI） |

## 3. 接口：`ClientProjectionV1`（事件层，可选）

在 `prompt-input` 消息事件的 `detail` 上新增可选字段 `clientProjection`（不新增 IPC、不改 preload、不新增事件 kind）：

```ts
export interface GovernanceClientProjectionV1 {
  version: 1;
  kind: "governance-feedback";
  /** 稳定指纹：sha256(canonical{kind, sourceRole.roleId, statusCode, flowIds, reportPath, governancePath, textHash})。 */
  fingerprint: string;
  sourceRole: { roleId: string; displayName: string };
  /** 机器可读状态：Proof 为 completed/failed/aborted/timed_out/unknown；非 Proof 内部反馈为 internal-feedback。 */
  statusCode: "completed" | "failed" | "aborted" | "timed_out" | "unknown" | "internal-feedback";
  /** 与任务正文一致的状态文本（应用生成；非伪造）。 */
  statusText: string;
  flowIds?: string[];
  /** 仅 Proof 指针任务提供。 */
  reportPath?: string;
  governancePath?: string;
  /** 客户侧动作：报告已就绪（可打开/等待验收卡）或等待 Lead 汇总。 */
  action: "report-ready" | "await-lead-summary";
}
```

约定：
- 只有符合条件的已发送治理反馈回显才带该字段；普通消息、派发、回交、系统行不变。
- `detail.text` 保持原文（内部审计）；投影**不含**内部正文。
- 字段缺失时 UI 行为不变（兼容旧事件、回放/恢复行——投影不持久化，恢复后回退到现有文本归类）。
- 不伪造状态：`statusCode/statusText` 只来自 `mirrorGovernanceFeedback` 已有的 `outcome`/`PROOF_STATUS_TEXT`；无 outcome 记 `unknown`（Proof）或 `internal-feedback`（非 Proof）。

## 4. 实现过程（主进程）

1. `app/desktop/session.ts`
   - 新增并导出类型 `GovernanceClientProjectionV1`（供测试与 `api-spec` 引用）。
   - `SessionManager` 增加有界注册表 `clientProjectionByInput: Map<string, GovernanceClientProjectionV1>`：
     键 = `queueKey(projectRoot, roleId, runtime)` + `sha256(text)`；上限 128 条（FIFO 淘汰）、30 分钟 TTL（查找时清理）。
   - `mirrorGovernanceFeedback` 在 `sendBackground` 成功（含 queued）后构建投影并登记：
     - Proof：`statusCode = outcome ?? "unknown"`、`statusText = PROOF_STATUS_TEXT[outcome] ?? "已结束"`、`flowIds/reportPath/governancePath`、`action:"report-ready"`。
     - 其他内置：`statusCode:"internal-feedback"`、`statusText` 用现有中文摘要「内部反馈」、`action:"await-lead-summary"`、`flowIds`（若有）。
   - 事件消费循环（`consume`）在 `ev.kind === "message"` 且 `detail.source === "prompt-input"` 且 `typeof detail.text === "string"` 时按同一键查找投影；命中则以浅拷贝把 `clientProjection` 并入 `envelope.event.detail` 后再 `emitEvent`。未命中不改事件。
   - 发送失败不登记；不新增日志正文。
2. `app/main.ts` / `app/preload.cjs`：**不改**。事件已走既有 `session:event` 通道，`detail` 为普通对象随结构化克隆透传。
3. `角色卡/桌面窗口/api-spec.md`：补充该可选事件字段与语义（后续同批更新）。

## 5. 判断分支与失败语义

- 投影登记后运行时未回显/回显文本被改写（如投递计划换了文本）⇒ 查找 miss ⇒ 事件不带投影，UI 按原文旧行为显示（不猜、不伪造）。
- 同一文本多次回显（重试/重连）⇒ 同投影重复附带；`fingerprint` 相同，UI 可合并。
- 队列投递延迟 ⇒ 投影在发送成功时登记，事件到达时仍能命中（TTL 30 分钟，覆盖后台排队）。
- 非 Proof 内部反馈没有结构化报告/状态 ⇒ 只投影来源角色与「等待 Lead 汇总」，不编造状态或报告路径。

## 6. 测试与验证（待实施后执行）

- `test/桌面应用/session.test.ts`（既有治理反馈用例扩展）：
  - Proof 指针任务回显 ⇒ 事件 detail 含 `clientProjection`：`kind/statusCode/statusText/flowIds/reportPath/governancePath/action:"report-ready"`；`detail.text` 原文仍在（审计）；指纹为 64 hex。
  - 同一状态重复回显 ⇒ 指纹相同；不同状态或不同流程 ⇒ 指纹不同。
  - 非 Proof 内部反馈 ⇒ `statusCode:"internal-feedback"`、`action:"await-lead-summary"`、无 `reportPath`；内部正文仍只出现在 `detail.text`。
  - 未登记文本的 `prompt-input` 事件 ⇒ 事件与现在逐字相同（无新字段）。
  - 发送失败 ⇒ 不登记、事件无投影。
- `node --test --test-concurrency=1 test/桌面应用/session.test.ts` + 桌面套件；`tsc -p tsconfig.json --noEmit`；如可运行，真实 Electron e2e（不重启客户 app、不碰 `.env`/目标/demo）。
- 成功标准：上列断言全过；无 UI 消费时现有聊天行为不变。

## 7. 依赖桌面UI（对齐项）

- UI 在 `describeEvent`（`source === "prompt-input"`）读取 `detail.clientProjection`：存在即渲染投影卡（来源角色/状态/流程/报告入口/动作），内部 `detail.text` 折叠或默认不渲染；按 `fingerprint` 合并连续同值行并显示 `×N`。
- `statusCode` 由 UI 本地化；`statusText` 可作兼容兜底。
- 投影是可选字段：UI 未实现/旧事件/恢复行继续走现有 `classifyInjected` 文本归类。

## 8. 非目标与风险

- 非目标：不改 renderer/样式/i18n；不新增 IPC/preload 通道；不改运行时/服务/Provider 的事件 schema；不做服务端持久化投影；不自动决定验收。
- 风险：回显文本与发送文本不一致时投影不生效（回退旧显示，安全）；恢复/回放行无投影（UI 可后续选择持久化）；注册表有界，极端长时间排队可能 miss（TTL 30 分钟）。

## 9. 实施状态（2026-10-25）

状态：**implemented-unverified**（实现 + 单测 + 真实 Electron 自检；渲染侧消费与真实 UI 验收待桌面UI/独立验收）。变更记录：[2026-10-25_change_chat-panel-adjustments.md](../change/2026-10-25_change_chat-panel-adjustments.md)。

- 已实施：本文 §3/§4 的 `GovernanceClientProjectionV1`、发送后登记（有界 128 + 30 分钟 TTL）、`prompt-input` 回显附带投影、稳定 `fingerprint`；`api-spec.md` 契约段。
- 未实施（按设计非目标）：通用事件指纹（仅投影内指纹）、投影持久化、A1/A0/B/C 项（renderer）与任何 IPC/preload/main 改动。
- 证据：`test/桌面应用/session.test.ts` 35/35（含新增投影用例）；全桌面 `test/桌面应用/*.test.ts` 594/594；`tsc --noEmit` exit 0；Electron e2e `E2E_PASS=true / E2E_FAILURES=`。
- 与桌面UI对齐：其计划 §2 已采用同一 `ClientProjectionV1` 字段并约定形状校验、`fingerprint` 仅合并连续同值注入行、投影不持久化；字段可缺省，未消费前行为不变。
