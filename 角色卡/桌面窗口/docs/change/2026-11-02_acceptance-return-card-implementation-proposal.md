---
id: acceptance-return-card-implementation-proposal
type: change
title: 验收回交卡桌面窗口侧短实现提案（A4）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: []
events:
  - date: "2026-11-02"
    kind: created
    summary: 写 A4 桌面窗口侧 proposal-only 短实现提案（C2/C3 payload、session/customer-input、B-1 SessionManager 测试）
---

# 验收回交卡桌面窗口侧短实现提案（A4）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **角色**：桌面窗口（Desktop Window），独立上下文
- **阶段**：P1 实现提案（团队计划 §5.1 P1 / §5.3；A4 入口 = P1 审核通过 + H1 完成）
- **日期**：2026-11-02
- **状态**：**`proposal-only, no code`**。本文只写 A4 的实现口径、应用私有展示载荷和测试计划；**未改任何产品源码/测试，未运行测试，未启动应用，未 commit/push，未接触客户，未判定审核通过或验收通过**。产出交项目管理（P1 审核）；审核结论非 `recommend approval` 前 A4 不开工。本文不改变 P1.2 的方案语义、Q1–Q5、AC、写集或 T2 档位；若审核发现方案/写集/档位实质变化，停止并回报统筹。

**一句话：** 质检报告文件已经在验收判断前被主进程读过；A4 只把这份读取结果做一次 16 KiB 安全投影，作为应用私有的可选展示字段，随既有客户卡 payload 送到渲染层；缺失、不可读、无 flowId、非法 flowId 和旧 payload 都不新增读取、不伪造路径，卡片继续呈现并走 `request.preview` 降级。验收判定、选项、推荐、可作答性、路由和持久化全部不变。

---

## 一、输入、基线与状态

### 1.1 代码与工作树基线（本提案只读实测，2026-11-02）

| 项 | 值 | 说明 |
| --- | --- | --- |
| 分支 / HEAD | `feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` | 与团队计划、V1、B0 一致 |
| 产品/测试工作树 | `git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空 | 写本提案前无产品/测试改动 |
| `app/desktop/session.ts` | **7819 行** / SHA-256 `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` | A4 目标文件写前基线；开工时复测 `git hash-object` + `sha256sum` |
| `app/desktop/customer-input.ts` | **2049 行** / SHA-256 `0cd2513d56361682a582744632deb87936529aed23efc7ca00e5255f487e58f5` | A4 目标文件写前基线；开工时复测 |
| 新测试文件 | `test/桌面应用/acceptance-return-card.test.ts` **不存在** | B-1 已落地授权该精确路径（`boundary.md:76`、`boundary.yaml:219`、`changelog.md:3`；B0 §3 记录） |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops | 证据以文件哈希与原始命令输出为准 |

### 1.2 治理输入（只读；行数/SHA-256 实测）

| 文档 | 行数 | SHA-256 |
| --- | --- | --- |
| 客户确认方案 P1.2：`docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 实施前验收标准 V1：`docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 团队计划：`docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| 独立复核：`docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| B0 基线：`角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |

**引用关系**：方案 P1.2 §2.3/§3.4/§4.3/§5 C2/C3/§9/§10、团队计划 §4.3 A4/§5.1/§5.3/§6、V1 AC-5–AC-7/AC-9/AC-11–AC-13、复核 F4/F9/F11/N1/N4 是本提案的硬约束。B0 已完成基线命令与四组受影响套件（94 tests / 94 pass / 0 fail / 0 skipped / 0 todo）；B0 未启动应用、未跑 E2E。

### 1.3 本阶段不产生的授权

本提案不授权提交/推送/合并/发布，不授权派发 worker，不授权改共享 Model/公共导出/报告契约/验收路由/写权，不授权创建 B-1 之外的新测试文件。A4 开工仍以 P1 审核通过与 H1 完成为前提；实施前按调度逐角色预留精确路径。本提案是桌面窗口角色 `docs/change/` 管理记录，**不纳入产品候选**；A4 产品候选只含 §7.1 的三个产品/测试文件。

---

## 二、C2/C3 payload 契约（冻结给 A3/A4 消费）

### 2.1 C2：应用私有展示载荷

`app/desktop/customer-input.ts` 新增 **应用私有**接口（不是共享 Model，不进入 `src/model/runtime.ts`）：

```ts
// app/desktop/customer-input.ts
import type { DisplayTextV1 } from "../../src/model/runtime.ts";

export interface AcceptanceReportDisplayV1 {
  version: 1;
  /** 固定约定路径：docs/quality/<flowId>-report-v1.md；仅展示/追溯，不是读取指令。 */
  path: string;
  /** 主进程已完成 protectText(reportText, 16384) 的安全投影；渲染层不得二次改写语义。 */
  text: DisplayTextV1;
}

export interface OperatorRequestPayload {
  // ...既有字段逐字不变
  /** 仅 acceptance 卡；应用私有、仅展示、不持久化。 */
  acceptanceReport?: AcceptanceReportDisplayV1;
}
```

- **提供方**：`app/desktop/session.ts::withRequestLifecycle`（复用 `enrichAcceptanceJudgeContext` 已有报告文件读取）。
- **消费方**：渲染层 `decisionView` / `DecisionDialog`（A3）；A3 只按 C2 读取，不在本提案写集内。
- **形状冻结**：`version:1`、`path:string`、`text:{ text:string; truncated:boolean; redacted:boolean }`；不新增其他字段。若 A3 需要额外字段，回到 P1 协调，不在 A4 静默扩展。
- **应用私有**：不进入 `CustomerInputRequest`、`CustomerInputMetadata`、`GovernanceJudgeContext`、`RuntimeReportSnapshotV1`/`RuntimeLiveReportViewV1`/`DisplayTextV1` 定义、任务账本或共享报告契约；`DisplayTextV1` 只读复用。
- **展示优先级（C2 契约，A3 落地）**：有合法 `acceptanceReport` ⇒ 报告原文为主，`request.preview` 仍作为「验收卡说明」始终可见（规范化后完全重复才去重）；无 ⇒ `request.preview` 按现状完整显示；报告缺失/非法 ⇒ 字段缺席，渲染层降级。
- **旧 payload**：无 `acceptanceReport` 字段的旧卡/回放继续可用；本提案不迁移数据、不补写字段。

### 2.2 C3：报告文件来源与读取

| 项 | 内容 |
| --- | --- |
| 路径 | `docs/quality/<flowId>-report-v1.md`（与验收判断、verifier 卡文本一致） |
| 读取 | **只复用** `enrichAcceptanceJudgeContext` 内已有的 `readText(reportRel)`；不新增 `fs` 读取、不扫描、不读第二路径（O4 不实施） |
| 路径校验 | 构造 `reportRel` **之前**用本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；非法/缺失不构造路径、不读取，fail-closed；不新增共享导出 |
| 投影 | `createToolDisplayContext({ credentialEnvNames }).protectText(reportText, 16384)`；UTF-8 前缀；`truncated`/`redacted` 如实 |
| 失败 | 无 flowId、非法 flowId、文件缺失、不可读、空/空白 ⇒ `display` 缺席；卡片照常呈现，走 `request.preview` 降级；不抛错、不自动通过 |
| 内容认证 | 报告文件由质检模型写入；应用只做安全投影/净化，**不认证其内容**；文案称「报告」而非「通过」；O5（SHA-256）不实施 |
| 持久化 | 展示文本只走内存 IPC；不写盘、不进 `task.created`、不进报告快照/任务账本/localStorage/indexedDB |

### 2.3 队列、镜像、过期与持久化

- `createCustomerInputChannel` 的 `entry.payload` 是同一个对象：入队、`onQueued`、`presenter`、`onExpired` 都使用它；新增可选字段随对象保留，**不改队列/镜像/过期逻辑**。
- `entry.ctx`（判断/超时用的会话事实）**不新增** `acceptanceReport`；判断 agent/triage gate 不读取报告正文。
- `mirrorRoleId`、`anchorKey`、`request`、`turnId`、`toolCallId` 等字段逐字不变；回包校验仍按 `entry.request` 快照，不因展示字段改变。
- 旧 payload/重启回放没有该字段，渲染层按 C2 降级；不新增迁移。

---

## 三、A4 `session.ts` 实现点

### 3.1 `enrichAcceptanceJudgeContext` 返回值与 flowId 守卫

当前实现（HEAD 5a35908）：`session.ts:3655-3819`；`flowId` 取自 `request.flowId ?? metadata?.flowId`（`:3660`），`reportRel` 在 `:3673` 无条件构造，`reportText`/`reportOk` 在 `:3698-3699`，`qualityReportPath` 在 `:3786`，`judgeContext`/`acceptanceReportPath` 在 `:3804-3817`。

**import 变化（只读复用）**：`session.ts` 现有的 `import type { DesktopCustomerInputFn } from "./customer-input.ts"`（`:178`）扩展为同时导入 `AcceptanceReportDisplayV1`；`GOVERNANCE_SLUG_PATTERN` 加入 `src/model/runtime.ts` 的现有 value import（`:1`）；新增 `import { createToolDisplayContext } from "../../src/common/runtime-core/tool-display.ts"`。不新增共享导出。

**拟改返回值**：

```ts
private async enrichAcceptanceJudgeContext(
  projectRoot: string,
  request: CustomerInputRequest,
  metadata: CustomerInputMetadata | undefined,
): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }>
```

**顺序（必须在构造 `reportRel` 之前）**：

```ts
const flowId = request.flowId ?? metadata?.flowId;
if (typeof flowId !== "string" || flowId.trim() === "") {
  return { metadata }; // 无 flowId：沿用现有早退；不构造/不读取/不显示
}
const flowIdValid = new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId);
if (!flowIdValid) {
  // 非法 flowId：不构造 docs/quality 路径、不读取任何文件；返回 fail-closed judgeContext。
  return {
    metadata: {
      ...(metadata ?? {}),
      judgeContext: {
        flowId,
        facts: {
          governanceModel: "trio",
          flowId,
          ledgerErrors: 0,
          unresolvedClarificationCount: 0,
          latestDecisionKinds: [],
        },
        unavailableReason: "验收最小链事实缺失：质检报告（flowId 不合法，未读取报告）",
        // facts 仅为类型要求的默认值；unavailableReason 已禁止 approve，不声称已读账本/名单。
        // 不设置 artifacts；qualityReportPath/acceptanceReportPath 均缺席。
      },
    },
  };
}
const reportRel = `docs/quality/${flowId}-report-v1.md`;
```

**语义边界（N1/N4）**：

- **合法 slug 卡零行为变化**：`flowIdValid === true` 时，`reportRel`、`reportOk`、`qualityReportPath`、`artifacts.acceptanceReportPath`、`unavailableReason` 的现有计算逐字保留；本提案只增加 `display`。
- **非法非空 flowId**：新增 fail-closed 保护；早退位置在 `findActiveRun`/`readIntentEntryFacts`/`loadLatestRoster`/`readTasks` 等读取之前，非法 flowId 不触发这些读取，也不构造 `docs/quality/` 路径；返回的 `judgeContext` 不含 `qualityReportPath`、不含 `acceptanceReportPath`、不含 `artifacts`；`unavailableReason` 指向质检报告缺失。这会改变异常输入下的 judgeContext；V1 AC-6/N4 已明确这是新增保护，不是合法卡行为变化。
- **缺失 flowId**：沿用现有早退（`return metadata`），不构造/不读取/不显示；不新增 judgeContext 重写。V1 AC-6 对「无 flowId」的要求是降级与可作答，不是必须重写 judgeContext。
- **不新增共享导出**：`GOVERNANCE_SLUG_PATTERN` 从 `src/model/runtime.ts:364` 只读导入；本地 `new RegExp(...)`，不抽到 `src/`，不新增 Service/Pipeline public 导出。

### 3.2 display 构造、投影与诊断

在合法 flowId 路径、现有 `reportText`/`reportOk` 计算之后：

```ts
const credentialEnvNames = [
  ...(this.deps.runtimeOptions?.extraCredentialEnvVars ?? []),
  ...(this.deps.runtimeOptions?.apiKeyEnvVar ? [this.deps.runtimeOptions.apiKeyEnvVar] : []),
];
let display: AcceptanceReportDisplayV1 | undefined;
if (reportOk && reportText !== undefined) {
  try {
    display = {
      version: 1,
      path: reportRel,
      text: createToolDisplayContext({ credentialEnvNames }).protectText(reportText, 16384),
    };
    createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: request.sourceRoleId })
      .record("acceptance.card.report.display", {
        ok: true,
        path: reportRel,
        bytes: Buffer.byteLength(reportText, "utf8"),
        // diagnostics.ts 的 FIELD_NAMES 不含 truncated/redacted；用白名单字段 state 编码两个 flag。
        state: display.text.truncated
          ? (display.text.redacted ? "truncated+redacted" : "truncated")
          : (display.text.redacted ? "redacted" : "plain"),
      });
  } catch {
    display = undefined;
    createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: request.sourceRoleId })
      .record("acceptance.card.report.display", {
        ok: false,
        path: reportRel,
        reasonCode: "projection-failed",
      });
  }
} else {
  createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: request.sourceRoleId })
    .record("acceptance.card.report.display", {
      ok: false,
      path: reportRel,
      reasonCode: "report-missing",
    });
}
```

**约束**：

- `DisplayTextV1` 由 `protectText` 返回；不做第二份净化/截断；不把 `reportText` 原文放进诊断。
- 诊断字段只使用 `diagnostics.ts` 白名单内的 `ok/path/bytes/state/reasonCode`；`state` 用 `"plain" | "truncated" | "redacted" | "truncated+redacted"` 编码两个 flag。**`truncated`/`redacted` 不是 `FIELD_NAMES` 字段名**，直接写会被 `safeFields` 丢弃；新增白名单字段属共享 diagnostics 变更，不在 A4 写集。`bytes` 为源报告 UTF-8 字节数；不记正文、凭据、命令、`flowId` 原文。
- 投影失败只省略 `display` 并记诊断；**不影响卡片呈现/判断**，不抛给调用方。
- 合法 flowId 但报告缺失/空/空白：`reportOk === false`，不调用 `protectText`，`display` 缺席；卡仍呈现。
- 非法/缺失 flowId 不进入本段，不读取报告，不记录正文。
- `credentialEnvNames` 组合与现有 `session.ts:7408` 的 `session_tail` 用法一致；不新增凭据来源。
- `request.sourceRoleId` 是现有可选字段；缺省时 logger 的 `roleId` 省略，不猜。

### 3.3 返回值与调用点

函数末尾（合法 flowId 路径）：

```ts
return {
  metadata: { ...(metadata ?? {}), judgeContext },
  ...(display !== undefined ? { display } : {}),
};
```

`withRequestLifecycle`（`:3825` 起）拟改：

```ts
let acceptanceReport: AcceptanceReportDisplayV1 | undefined;
if (request.cardKind === "acceptance") {
  const enriched = await this.enrichAcceptanceJudgeContext(projectRoot, request, metadata);
  metadata = enriched.metadata;
  acceptanceReport = enriched.display;
}
// ...既有 proposal / appointment-write 校验与 request.created 写入不变...
const context = buildContext(request, {
  onPresented: () => { void markPresented("customer"); },
  ...(acceptanceReport !== undefined ? { acceptanceReport } : {}),
});
```

`buildContext` 参数类型与 `buildCustomerInputContext`（`:2641-2663`）`extras` 同步扩展：

```ts
extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1 }
```

`buildCustomerInputContext` 返回的 ctx 只增加：

```ts
...(extras?.acceptanceReport !== undefined ? { acceptanceReport: extras.acceptanceReport } : {}),
```

**不变**：

- `withRequestLifecycle` 的验收分支条件仍是 `request.cardKind === "acceptance"`；不扩大 enrich 的触发条件，不改变判断代批条件。
- `request.created` 事件不写 `acceptanceReport`；`metadata` 不携带展示正文；`request.resolved`/`customer.decision` 不变。
- 第二个 `withRequestLifecycle` 调用（任务升级卡，`:4647-4661`，`cardKind:"decision"`）保持原样；其内联 `buildContext` 忽略 `acceptanceReport` 即可，不传该字段。
- `enrichAcceptanceJudgeContext` 的其它读取（意图/名单/D3/criteria）只在合法 flowId 路径继续；非法 flowId 早退，避免用非法字符串拼任何项目路径。

---

## 四、A4 `customer-input.ts` 实现点

### 4.1 类型与 payload

- 在 `OperatorRequestPayload` 上方新增 `AcceptanceReportDisplayV1`（§2.1）；`DisplayTextV1` 加到现有 `src/model/runtime.ts` 的 type import（`customer-input.ts:34-47`）。
- `OperatorRequestPayload` 增加可选 `acceptanceReport?: AcceptanceReportDisplayV1`；其余字段顺序/必填性不变。
- `DesktopCustomerInputFn` 的 `ctx`（`:539-568`）增加可选 `acceptanceReport?: AcceptanceReportDisplayV1`；其余字段不变。
- `customerInput`（`:1743` 起）构造 payload（`:1768-1775`）时，仅当 `ctx?.acceptanceReport !== undefined` 时复制：

```ts
if (ctx?.acceptanceReport !== undefined) payload.acceptanceReport = ctx.acceptanceReport;
```

**约束**：

- 不把 `acceptanceReport` 放进 `entry.ctx`（判断/队列事实），不传给 judge/triage；只在 payload 上。
- 不改变 `payload` 的既有字段、`anchorKey`、`request`、`mirrorRoleId` 逻辑；不新增默认值/空对象。
- 队列/镜像/过期代码不改；`entry.payload` 保留该字段，`onQueued`/`presenter` 自然拿到同一对象；`onExpired` 只取既有字段。
- 旧 payload 没有该字段时，payload 形状与现状逐字一致（属性不存在，而不是 `undefined` 显式键）。

---

## 五、B-1 新测试：`test/桌面应用/acceptance-return-card.test.ts`

### 5.1 授权与定位

- 文件路径已由 B-1 授权（H1 已落地）：`boundary.md:76` / `boundary.yaml:219` / `changelog.md:3`；B0 §3 已记录 md/yaml 一致。本提案只使用该精确路径，不新增其他 `test/桌面应用/` 文件。
- **必须走 SessionManager 级**：通过 `openRoleSession` 捕获 `input.customerInput`（即 `withRequestLifecycle` 包装后的函数），调用它触发 `enrichAcceptanceJudgeContext`；不能只测 `createCustomerInputChannel`。
- `acceptance-evidence.test.ts` 只作现有 SessionManager 夹具/回归参考，不改；`optional-acceptance.test.ts` 是 **channel 级**回归（直接 `createCustomerInputChannel`，绕过 `withRequestLifecycle`/`enrichAcceptanceJudgeContext`），**不能单独证明 AC-5–AC-7**。
- 夹具只写系统临时项目（`fs.mkdtemp(os.tmpdir())`），在临时项目内创建 `docs/quality/<flowId>-report-v1.md` 和必要的角色卡/边界；**不写目标项目/演示项目**；测试结束 `finally` 清理。
- 不删除/新增 `skip`/`todo`，不放松断言；失败如实记录，不为保绿改断言。

### 5.2 建议夹具形态

- `listing`：内置 `chief` + 内置 `verifier`（`builtIn:true, governanceFunction:"verification"`）+ 最小项目 worker；`governanceModel:"trio"`、`primaryRoleId:"chief"`。
- `SessionManager`：`openRoleSession` 捕获每个角色的入参；`buildProjectConfig`；`getListing`；`customerInput` 注入 `createCustomerInputChannel({ presenter, operatorId:"tester", nextId })`，并在外层包一层记录 `(ctx, metadata)` 的 spy。
- `acceptanceRequest(flowId?)`：`kind:"choice"`、`cardKind:"acceptance"`、`sourceRoleId:"verifier"`、`flowId`、`title`、`question`、`preview`（含唯一 marker）、`options:[{id:"accept",label:"验收通过",recommended:true},{id:"rework",label:"退回返工"}]`。
- 调用方式：`await opened.customerInput(request, metadata)`；presenter 收到 payload 后立即 `channel.respond({ id, decision:{ kind:"choice", selected:["accept"] } })`；`await` outcome。
- 诊断：需要时在单个用例内 `configureDiagnostics({ directory: temp })`，结束后 `flushDiagnostics()`/`disposeDiagnostics()`；断言日志含 `acceptance.card.report.display` 元数据、不含报告 marker/正文/凭据。

### 5.3 用例与断言

| # | 用例 | 关键断言 |
| --- | --- | --- |
| 1 | **正常文件**：临时项目写入 `docs/quality/flow-a-report-v1.md`，内容含唯一 marker | `ctx.acceptanceReport` 与 presenter payload 的 `acceptanceReport` 均为 `{version:1, path:"docs/quality/flow-a-report-v1.md", text:{text:文件原文, truncated:false, redacted:false}}`；`payload.request` 与输入请求深度相等（question/options/recommended/preview 不变）；作答 `accept` 后 outcome `answered` 且 `value.selected===["accept"]`；报告文件 sha256 前后一致；`readTaskState` 的 `request.created` 不含 `acceptanceReport`、不含报告 marker |
| 2 | **>16 KiB 截断**：临时项目写入 >16 KiB 报告 | `Buffer.byteLength(display.text.text,"utf8") <= 16384`；`truncated===true`；`path` 正确；payload 与 ctx 一致；原始文件 sha256 前后一致；报告卡快照上限不在本测试内改动（既有 `tool-display`/`report-provenance` 覆盖） |
| 3 | **净化 flag**：报告含测试注入的伪凭据值；SessionManager `runtimeOptions.extraCredentialEnvVars` 指向测试 env 名，测试结束恢复 env | `redacted===true`；payload 文本不含伪凭据明文；出现 `[REDACTED]`；原始文件未改写；测试不写真实凭据 |
| 4 | **空/缺失**：空文件或空白文件；另一子用例完全不建文件 | 两者均无 `acceptanceReport` 属性（`Object.prototype.hasOwnProperty === false`）；`payload.request.preview` 原样保留；卡片仍可作答（respond `accept` 得 answered）；不抛错 |
| 5 | **不可读**：在报告路径创建目录（`readFile` 触发 EISDIR） | 无 `acceptanceReport`；不抛错；preview 保留；卡片可作答；证据记录平台与夹具方式（不声称权限位行为） |
| 6 | **无 flowId / 旧 payload**：request 与 metadata 都不带 flowId；另一子用例直接以旧形状 ctx（无 `acceptanceReport`）调用 channel | 无 `acceptanceReport` 属性；不读取报告；preview 保留；卡片可作答；旧 payload 降级路径可用（该子用例为 channel 级，只证明旧形状，不替代 SessionManager 用例） |
| 7 | **非法 flowId**：flowId 含路径穿越/非 slug（如 `../../../outside`），在项目外放一份可读 sentinel 报告 | 无 `acceptanceReport`；不读取项目外文件（sentinel 内容不进入 payload/task state）；`judgeContext.facts.qualityReportPath` 缺失；`judgeContext.artifacts` 缺失（至少 `acceptanceReportPath` 不设置）；`unavailableReason` 匹配 `/验收最小链事实缺失.*质检报告/`；选项/预览/可作答性不变；`request.created` 无展示字段 |
| 8 | **诊断字段审计**（可与 #1/#2 合并） | 诊断事件 `acceptance.card.report.display` 的字段只有白名单内的 `ok/path/bytes/state/reasonCode`；`state` 与投影 flags 对应（`plain`/`truncated`/`redacted`/`truncated+redacted`）；不出现报告 marker、正文、凭据；成功时 `path` 为固定约定路径，失败时不伪造路径 |

**测试能证明与不能证明的边界**：

- 能证明：真实 `withRequestLifecycle`/`enrichAcceptanceJudgeContext` 路径下 `ctx.acceptanceReport` 与 presenter payload 的形状、16 KiB 投影、缺失/不可读/无/非法 flowId 降级、旧 payload 无字段、选项/作答路径不变、不写任务账本。
- 不能单独证明：渲染层 `DecisionDialog` 的徽标/原文/路径/preview 顺序、报告卡两处位置 DOM、i18n、真实 Electron E2E、回放 DOM。这些分别由 A3/A5/D1/E2 负责；本测试不替代 V1 §2.4 的 DOM 证据。

---

## 六、测试计划与命令（A4 退出）

### 6.1 命令

```bash
node --test --test-concurrency=1 test/桌面应用/acceptance-return-card.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/optional-acceptance.test.ts
npm run typecheck
```

- 记录：命令、cwd、时间、Node/npm/OS、退出码、tests/pass/fail/skip/todo、失败原文；候选逐文件 `git hash-object` + `sha256sum`。
- `acceptance-evidence.test.ts`/`optional-acceptance.test.ts` 只读回归，不改文件；`optional-acceptance` 的 channel 级结果不能替代 AC-5–AC-7 的 SessionManager 级证据。
- 不新增/删除 `skip`/`todo`；不放松既有断言；新测试失败按实际记录，不为保绿修改实现或断言。
- A4 不启动应用、不跑 Electron E2E；E2E 由 A5/D1 按团队计划执行；若 D1 E2E 不可运行，如实记录原因，不用单元测试冒充真实渲染证据。
- 如需复核投影行为，可只读复用 B0 已通过的 `test/runtime-core/tool-display.test.ts`/`report-provenance.test.ts`；A4 不修改这两个文件。
- 测试夹具只在系统临时目录创建；不写目标项目、演示项目或 `test/测试/phase-e-*` 夹具。

### 6.2 与 AC 的映射

| AC | 本提案覆盖 | 说明 |
| --- | --- | --- |
| AC-5 | SessionManager 级 `ctx.acceptanceReport`/presenter payload；选项/推荐/可作答性回归 | DOM/徽标/路径/preview 顺序由 A3/E2 提供，本测试不替代 |
| AC-6 | 缺失/不可读/无 flowId/非法 flowId/旧 payload 五组；非法 flowId 的 judgeContext fail-closed、不读项目外 | 对话框降级 DOM 由 A3/E2E 提供 |
| AC-7 | >16 KiB UTF-8 投影、`truncated`、原文件 sha256；净化 flag | 报告卡快照上限与 DOM 滚动由既有 `tool-display`/A3 证据覆盖 |
| AC-9 | 非法 flowId 不越界读取；报告原文净化 flag | Markdown 渲染/XSS 由 A3/source-guard 覆盖 |
| AC-12 | 不改判定/选项/路由/持久化；`optional-acceptance` 回归 | 语义路径零 diff 由 D1/变更包核对 |
| AC-13 | `acceptanceReport` 应用私有；`src/model/runtime.ts`/public 入口零 diff | 由 diff/typecheck 与 A3 防御读取共同证明 |

---

## 七、写集与非目标

### 7.1 本阶段与 A4 写集

| 阶段 | 路径 | 说明 |
| --- | --- | --- |
| P1（本提案） | `角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 本阶段唯一写盘文件 |
| A4（P1 审核通过 + H1 后） | `app/desktop/session.ts` | enrich 返回值/flowId 守卫/display/诊断/调用点 |
| A4 | `app/desktop/customer-input.ts` | 应用私有类型/ctx/payload 复制 |
| A4 | `test/桌面应用/acceptance-return-card.test.ts` | B-1 新测试（SessionManager 级） |
| A4 证据（按需） | `角色卡/桌面窗口/docs/change/` 下的 A4 证据/记录 | 只在自己的 change 目录；不写其他角色 |

### 7.2 明确不改

- 不改 `app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`（含 `src/model/runtime.ts`、`src/common/runtime-core/**`、`src/common/shared/**`）。
- 不改 `test/桌面应用/acceptance-evidence.test.ts`、`optional-acceptance.test.ts`、`e2e/main.mjs`（只读回归/执行）；不新增 `test/桌面应用/` 其他文件、不新增 e2e 脚本。
- 不改其他角色测试/文档、角色卡/边界/YAML/changelog、`docs/scheduling|acceptance|communication|planning`、`package.json`、构建/发布。
- 不改验收判定、`request.resolved`/`customer.decision`、判断代批、选项/推荐/可作答性/优先级/路由、报告持久化/声明语义、写权/边界、客户闸门、派发受理。
- 不实现 O1/O3–O10 选装；仅 O2 路径字段随 C2 提供（显示由 A3 落地）；不恢复已取消 `full-report-display` P1.3。

---

## 八、依赖与契约冻结

1. **契约先行**：C2 形状在本提案冻结，A3 按同一形状消费；A3/A4 可并行，但**不得写对方路径**（A3 不写 `app/desktop/**`/`test/桌面应用/**`；A4 不写 `app/renderer/**`/`test/桌面UI/**`）。
2. **A4 顺序**：P1 审核 `recommend approval` + H1 完成（B-1 已落地）后开工；A4 不依赖 A1 i18n/A2 纯函数的具体实现，但整体 A3 依赖 A1/A2 冻结。
3. **共享契约冻结**：`OperatorRequestPayload.acceptanceReport` 是应用私有可选字段；`DisplayTextV1`、`GOVERNANCE_SLUG_PATTERN`、`createToolDisplayContext` 只读复用。不新增共享 Model/公共导出/报告契约/工具/能力位/IPC 方法/`cardKind`。
4. **停止条件**：若实施发现需要改 `src/model/runtime.ts`、Service/Pipeline public 导出、报告快照/声明契约、验收判定/路由/`request.resolved`、或需要新增未列路径/新 e2e 脚本，**停止并回报统筹**，按方案 §8.1/团队计划 §5.4 升 T3/重开闸门；不默认越界。
5. **证据绑定**：A4 证据绑定本提案冻结的 C2 形状和 P1.2/V1/团队计划哈希；C2 形状、A3 消费契约或共享契约变化使 A4 证据失效，需重跑。

---

## 九、风险与开放点

| # | 风险/开放点 | 影响与处置 |
| --- | --- | --- |
| 1 | **非法 flowId fail-closed**：新增守卫对非法非空 flowId 返回合成 judgeContext，不含 `qualityReportPath`/`acceptanceReportPath`/`artifacts`，并带 `unavailableReason`；可能使判断 agent 从自动代批回落到手动。 | 这是 V1 AC-6/N4 已披露的新增保护；合法 slug 卡零行为变化；异常输入本来不应读取路径。测试断言 judgeContext fail-closed 与不越界读取；不把它说成「零语义变化」。 |
| 2 | **缺失 flowId 与非法 flowId 处理不同**：缺失沿用现有早退（metadata 不改写）；非法非空才建 fail-closed context。 | 与现有 `:3660-3661` 早退一致；V1 AC-6 对无 flowId 只要求降级/可作答。若 P1 审核要求缺失也合成 context，需明确修改并补测试，不静默扩大。 |
| 3 | **报告文件未认证**：`docs/quality/<flowId>-report-v1.md` 由质检模型写入，应用只投影/净化，不认证内容；可能显示与 `submit_report` 摘要不一致的文字。 | 文案称「报告」而非「通过」；验收决定权仍在客户/判断 agent；O5（SHA-256）不实施；风险与方案 §8.2/F11 一致。 |
| 4 | **不可读夹具**：Windows 权限位不可靠；用「报告路径为目录」制造 EISDIR 是跨平台可复现方式。 | 测试记录平台与夹具方式；不声称权限位/占用行为；如目标平台不支持 EISDIR 失败方式，改用注入读失败并记录限制。 |
| 5 | **`acceptanceTriage` 前闸**：`session.ts` 基线未发现 `opts.acceptanceTriage` 注入；若 Interface 真实接线，验收卡可能被应用自有分诊卡替换，原 payload 仍带 `acceptanceReport` 但可能不呈现到 `DecisionDialog`。 | A4 不改 triage；若实施发现 triage 覆盖导致 `acceptanceReport` 无法到达决定卡，AC-5 证据不足，停止回报统筹/沟通；不自行改 triage 或路由。 |
| 6 | **旧 payload/回放**：旧排队/重启卡没有 `acceptanceReport`；渲染层走 preview 降级。 | 不迁移数据、不补写字段；本测试覆盖无字段形状；真实旧卡 DOM/回放由 A3/E2 核对。 |
| 7 | **E2E 可运行性**：B0 只确认 Electron 二进制与 harness `node --check`，未跑真实 E2E。 | A4 不跑 E2E；D1 必须实际执行并记录 `E2E_PASS`/原始输出/截图（至多）或不可用原因；不得用单测替代。 |
| 8 | **测试 harness 稳定性**：SessionManager 级测试需捕获 `openRoleSession` 的 `input.customerInput` 并注入 presenter；全局 diagnostics/env 补丁可能影响其他测试。 | 使用 `--test-concurrency=1`；临时目录 `finally` 清理；env 在 `finally` 恢复；diagnostics 用 `configureDiagnostics`/`flushDiagnostics`/`disposeDiagnostics` 包裹；不并行写同一路径。 |
| 9 | **净化依赖进程 env**：`protectText` 按当前 env 的凭据值替换；测试若用真实凭据名会误伤/泄漏。 | 只用测试专用 env 名/伪值，结束后恢复；普通用例使用不含凭据样式的 marker；断言按实际 flag，不预设 `redacted:false`。 |
| 10 | **payload 体积**：16 KiB 文本 + JSON 结构走既有 IPC；不新增通道/压缩。 | 接受现有 IPC 能力；不提高 16 KiB；不做第二份截断；如实际 IPC 压力异常，记录并回报，不私自扩预算。 |
| 11 | **诊断字段白名单**：`diagnostics.ts` 的 `FIELD_NAMES` 不含 `truncated`/`redacted`；直接写这两个字段会被 `safeFields` 丢弃。 | 不改共享 diagnostics（不在 A4 写集）；用白名单字段 `state` 编码 flags（§3.2）；测试断言 `state`。若 P1 要求独立布尔字段，需由共享属主变更并评估档位，不在 A4 处理。 |

## 十、P1 审核对照

| 核对项 | 本提案落点 |
| --- | --- |
| C2 形状：`OperatorRequestPayload.acceptanceReport?: {version:1;path;text:DisplayTextV1}`，应用私有 | §2.1；不进入 `src/model/runtime.ts` |
| C3 来源：只复用 `enrichAcceptanceJudgeContext` 已读 `docs/quality/<flowId>-report-v1.md`；16 KiB 投影；失败降级 | §2.2、§3.2 |
| N1：构造 `reportRel` 前本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；不新增共享导出 | §3.1 |
| N4：合法 slug 卡 facts/artifacts/unavailableReason 不变；非法/缺失 fail-closed，测试断言 | §3.1、§5.3 #7、§9 #1/#2 |
| A4 写集：`session.ts`/`customer-input.ts` + B-1 测试；不改 interface/main/preload/renderer/src | §7 |
| 队列/镜像/过期/持久化：payload 对象保留；不写盘/不进 task.created/报告快照 | §2.3、§3.3、§4.1 |
| B-1 SessionManager 级：正常/>16 KiB/空缺失/不可读/无 flowId/非法 flowId/旧 payload；ctx/payload 断言；选项/路由不变 | §5.3、§6.2 |
| AC-5–AC-7 证据边界：SessionManager 级只证明桌面 payload；DOM/i18n/E2E 由 A3/A5/D1/E2 | §5.3 末、§6.2 |
| 不夸大：proposal-only；未实施/未测试/未验收；不 commit/push | 文首状态、§1.3、§6.1 |

---

**本文件状态：`proposal-only, no code`；等待项目管理 P1 审核。未实施、未测试、未验收、未提交。**
