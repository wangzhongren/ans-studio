---
id: acceptance-return-card-implementation-proposal-desktop-ui
type: change
title: 验收回交卡 P1 桌面UI短实现提案
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: []
events:
  - date: "2026-11-02"
    kind: created
    summary: 写桌面UI侧 P1 短实现提案（proposal-only；未实施、未测试、未改产品代码）
---

# 桌面UI P1 短实现提案：验收结果返回卡（acceptance return card）

- **提案角色 / 上下文**：桌面UI（渲染层 `app/renderer/`），本上下文只承担该角色。
- **节点 / 性质**：团队计划 §五 **P1（实现提案）** 的桌面UI侧部分；**proposal-only**。本文件只写提案，**未改产品代码/测试/样式/其他角色文件**，**未启动应用、未运行测试、未 commit/push、未接触客户、未作任何验收判断**。提案经项目管理（A1 属主）审核通过、且 A1/A2 冻结后才进入 A3。
- **目标（只改展示，不改判定）**：内置质检报告在**回交行**与**交付批**两处显示「独立验收报告」身份、完整 `summary.text` 与全部 `evidence`、无折叠；`cardKind="acceptance"` 的客户决定卡显示「独立验收决定」徽标、16 KiB 安全投影报告原文、报告路径（O2）、始终可见的 `request.preview`（完全重复时去重）与降级说明；普通报告卡与验收语义零变化。
- **依据顺序**：客户闸门 1 确认的 P1.2 > V1（AC）> 团队计划（范围/写集/阶段）；复核记录只作约束提示，不替代上述基线。本提案不新增方案外行为。

## 一、输入、基线与状态

### 1.1 冻结输入（2026-11-02 写本提案时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 团队计划（闸门 2 确认） | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| V1 验收标准 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 方案 P1.2（唯一实施基线） | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 独立复核 | `docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`。
- 产品/测试基线：`git status --porcelain -- src app test` 为空；本提案未改产品与测试。
- B0 结论（引用，不重跑）：三条门禁命令退出码 0；四组受影响套件 94/94 通过、0 skip/0 todo；Electron 44.7.0 二进制与三个 E2E harness 存在且 `node --check` 通过，**真实 E2E 未执行**（留 D1）。

### 1.2 桌面UI 改动前文件指纹（只读快照，供 A2/A3 前后对照）

| 文件 | 行数 | SHA-256（改动前） |
| --- | --- | --- |
| `app/renderer/src/chat/role-view.ts` | 151 | `830a760f0809ddef133337729b1fd25fce9733b895264a87ff5f95f4f1408896` |
| `app/renderer/src/chat/decision-dialog.ts` | 181 | `00e1f088dd738750e8181877403fc578a14a00f5fb5aa65aa0302f6c3e65c23e` |
| `app/renderer/src/shell/ReportCard.tsx` | 388 | `c29a2ef7d4e59066a85ccb3b625af94c7ba15448dd2f4f7e697c83e875ec24ed` |
| `app/renderer/src/chat/DecisionDialog.tsx` | 332 | `b41e9ced4cb71f623baa2a3baf413442ae9cc254e779e618845eee03f62f860a` |
| `app/renderer/src/shell/shell.css` | 3316 | `60d2aa36688f2f9cd7bdc3bb2459104437766b20be93d350ec877a1d3da7d870` |
| `app/renderer/src/shell/phase4a.css` | 1734 | `ebbf326cc0e98b2de3da06f94c2cd80aecc682ec9a2b8d997159ff6e23d376fc` |
| `app/renderer/src/shell/phase4b.css` | 1070 | `13bbddc8c9267436ddae62b4cb15deae019ff1714c5ab61d0d4016d8503cdf18` |

> 行号读于 HEAD `5a35908`。实施时以符号名与文本锚点为准；行号仅作定位参考。

### 1.3 只读核对的现状锚点

| 事实 | 位置 |
| --- | --- |
| 报告卡统一预览 + 折叠 | `ReportCard.tsx`：`markdownHtml`（41-43）、`ReportBodyProps`（62-73）、`ReportBody`（75-239）；预览 160-166、`report-facts` 167-201、免责声明 202、`report-complete` 折叠加来源按钮 203-235 |
| 两处报告位置 | `ChatRow.tsx::HandbackRow`（637-656）→ `ReportCard`（249-274）；`ReportCard.tsx::DeliveryCard` 的报告段（369-380）；两处都走同一 `ReportBody` |
| 角色列表已带内置身份 | `RoleView`（`chat/types.ts:24-38`）已有可选 `builtIn`/`governanceFunction`；`ReportBody` 已订阅 `useChatStore(s => s.roles)` |
| 决定卡现状 | `DecisionDialog.tsx`：对话框类 172-176、`dd-kind` 原始 `cardKind` 190-194、`dd-preview` 227-229、detail/question 230-231、选项/动作 233-319 |
| 决定卡纯视图 | `decision-dialog.ts::DecisionView` 19-38、`decisionView` 89-130、`cardKind` 在 119、`asRecord` 42-46 |
| 样式锚点 | `shell.css` `.msg-handback`/`.is-blocked`/`.report-top`/证据约 2257-2365；`phase4b.css` `.delivery-report` 641-645、200% 约 869-910、480px 查询起点 911；`phase4a.css` `.decision-dialog` 约 1583、`.is-high-risk`/`.is-destructive` 1592-1593、`.dd-preview` 1605、480px 查询 1729 |
| 令牌 | `index.css` 已有 `--info`/`--info-bg`/`--info-border`（61-63）、`--danger*`（67-70）、`--selected`、`--text-2/3`、`--radius-micro`、`--font-mono`；新增样式不引入新令牌 |
| i18n 类型 | `MessageKey = keyof typeof zhCN`（`src/common/shared/i18n/keys.ts`），A1 未新增 key 前 A3 不能通过 `typecheck:renderer` |
| E2E 夹具 | `phase4b-electron-smoke.mjs` 的 listing 已含内置 `verifier`（`governanceFunction: "verification"`, `builtIn: true`）；已有普通报告（角色 P）与交付批、operator 请求夹具 |

## 二、C1 验收报告卡身份（展示契约 v1）

### 2.1 精确判据（唯一判据）

在 `app/renderer/src/chat/role-view.ts` 新增：

```ts
export function isVerificationRole(role: RoleView | null | undefined): boolean {
  return role?.builtIn === true && role.governanceFunction === "verification";
}
```

- **只认内置身份**：`builtIn === true`（严格布尔）且 `governanceFunction === "verification"`；不用角色 id 字符串、不用报告文本/状态、不读任务账本、不按 `summary`/`evidence` 猜测。
- **项目角色不标记**：项目角色即使 id 恰好为 `verifier`，只要 `builtIn !== true` 或缺少 `governanceFunction`，一律按普通报告卡。
- **缺字段/角色不可解析**：`null`/`undefined`/字段缺失 → `false` → 普通卡；不抛错、不阻塞渲染。
- **角色列表未加载**：初始 `roles` 为空时按普通卡渲染，列表到达后重渲染为验收卡（方案 §8.2 已接受的短暂闪烁）；不做数据迁移。
- **不支持版本**：既有 `!supported` 分支（`unsupportedVersion`）优先，仍按现状，不进入验收展示。

### 2.2 两处位置由同一判定传入，不分叉

- 在 `ReportCard.tsx` 增加一个**模块内私有** helper（不导出、不新增文件）：

```ts
function reportAcceptance(report: unknown, roles: RoleView[]): boolean {
  const sourceRoleId = asReportText(reportSourceRecord(report).roleId);
  return isVerificationRole(findRole(roles, sourceRoleId));
}
```

- `ReportCard`（回交行外层 `.msg-handback`）与 `DeliveryCard`（交付批每个 `.delivery-report` 报告段）各自对同一份报告**只调用一次** `reportAcceptance`，把结果作为 `acceptance?: boolean` prop 传给同一个共享组件 `ReportBody`。
- `ReportBody` **不再自行二次判定**，只消费 prop；两处位置共用同一判据、同一组件、同一份 `roles` 事实。这样避免“外层类名一处判定、正文一处判定”的分叉。
- 报告来源角色只取 `report.source.roleId`；**不用** pane 的 `roleId` 兜底做验收判定（缺失即普通），避免把幕僚 pane 的普通报告误标。
- `ReportBody` 已是唯一报告正文渲染组件（当前仅 `ReportCard.tsx` 两处调用，已只读核对）；新增可选 prop 向后兼容。

## 三、C2 渲染侧防御视图（应用私有，不新增共享类型）

### 3.1 本地类型（`app/renderer/src/chat/decision-dialog.ts`）

```ts
export interface AcceptanceReportView {
  version: 1;
  path: string;
  text: string;
  redacted: boolean;
  truncated: boolean;
}

export interface DecisionView {
  // ...既有字段全部不变
  acceptance: boolean;
  acceptanceReport: AcceptanceReportView | null;
}
```

- 不是共享 Model、不进入报告快照/任务账本/持久化；消费的 payload 形状是 A4 的 `OperatorRequestPayload.acceptanceReport?: { version: 1; path: string; text: DisplayTextV1 }`（`DisplayTextV1 = { text: string; truncated: boolean; redacted: boolean }`）。
- 渲染层**不做二次截断**；只校验并原样展示 ≤16384 UTF-8 字节的投影。

### 3.2 防御读取规则（非法 → `null`，不抛、不猜）

```ts
function readAcceptanceReport(payload: unknown): AcceptanceReportView | null {
  const raw = asRecord(asRecord(payload).acceptanceReport);
  if (Object.keys(raw).length === 0) return null;
  if (raw.version !== 1) return null;
  const body = asRecord(raw.text);
  if (typeof body.text !== "string") return null;
  if (typeof body.redacted !== "boolean") return null;
  if (typeof body.truncated !== "boolean") return null;
  if (typeof raw.path !== "string") return null;
  if (new TextEncoder().encode(body.text).byteLength > 16384) return null;
  return {
    version: 1,
    path: raw.path,
    text: body.text,
    redacted: body.redacted,
    truncated: body.truncated,
  };
}
```

- `version` 必须严格 `1`；`text.text` 字符串；`text.redacted` / `text.truncated` 布尔；`path` 字符串（允许空串，空串时 UI 不显示路径行）；任一缺失/类型不符 → `null`。
- **UTF-8 字节上限**：用浏览器/Electron 全局 `TextEncoder` 计算 `encode(text).byteLength`，`> 16384` 即非法（`null`）；**不 import `node:buffer`**，不做第二套截断语义。`tsconfig` 的 `lib` 已含 DOM，Electron 44 渲染进程与 Node 24 测试环境均提供 `TextEncoder`。
- 仅在 `cardKind === "acceptance"` 时读取：非验收卡即使携带该字段也返回 `null`，不改变普通卡任何行为。
- `decisionView` 其余计算（`kind/options/multiple/recommendedId/priority/highRisk/destructive/answerable/judgeNotice`）逐字不动；只把 `cardKind` 提为局部常量复用（值不变）。

### 3.3 preview 去重的纯函数

新增可测纯函数（仍在 `decision-dialog.ts`，不新增文件）：

```ts
export function sameDisplayText(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n").trim();
  return normalize(left) === normalize(right);
}
```

- 只有“有合法 `acceptanceReport` 且 `normalize(preview) === normalize(report.text)`”才去重；
- 不做更激进的空白压缩，避免把“看起来相似但内容不同”的卡面结论误删；
- 报告缺失/非法（`acceptanceReport === null`）时 preview **按现状完整显示**，不折叠、不隐藏；
- preview 始终是纯文本 `<pre>`，不按 Markdown 渲染。

## 四、A2 / A3 精确改动

### 4.1 A2-1：`app/renderer/src/chat/role-view.ts`

- 在 `findRole`（75-78）之后新增 `isVerificationRole`（见 §2.1），复用已有 `import type { RoleView }`。
- 不改 `governanceView`/`roleDisplayName`/`roleSubtitle`/`groupRoles` 任何行为；不新增其他导出。

### 4.2 A2-2：`app/renderer/src/chat/decision-dialog.ts`

- 新增 `AcceptanceReportView`、`sameDisplayText`、私有 `readAcceptanceReport`。
- `DecisionView` 增加 `acceptance`、`acceptanceReport` 两个字段。
- `decisionView`：`const cardKind = decisionCardKind(payload); const acceptance = cardKind === "acceptance";` 返回对象加 `acceptance` 与 `acceptanceReport: acceptance ? readAcceptanceReport(payload) : null`；其余字段表达式逐字不变。
- 不改 `decisionPriority`/`isDestructiveDecision`/`orderedDecisionIds`/`nextDecisionId`/`pendingMoreCount`/`shouldOpenDecision`；不新增共享导出。

### 4.3 A3-1：`app/renderer/src/shell/ReportCard.tsx`

**导入与 helper**

- `import type { RoleView } from "@/chat/types";`（按现有模块风格），并从 `@/chat/role-view` 追加 `isVerificationRole`。
- 新增模块内 `reportAcceptance(report, roles)`（§2.2），不导出。

**`ReportBodyProps` / `ReportBody`**

- 新增可选 `acceptance?: boolean`；`ReportBody` 只消费，不自行判定。
- `report-top`：验收时加 `is-acceptance`；标题用 `ui.reportCard.acceptanceTitle`，否则 `ui.reportCard.title`；验收时在标题旁（`h2` 之后）渲染 `<span className="report-acceptance-badge">ui.reportCard.acceptanceBadge</span>`。
- `report-body`：验收时加 `is-acceptance`。
- `excerpt-label`：验收时 `ui.reportCard.acceptanceReportLabel`，否则现状 `ui.reportCard.excerptLabel`。
- 正文：验收时用完整 `full`（`report.summary.text`）走 `markdownHtml(full)`；普通仍用 `preview`（`reportPreview(full)`）。
- `projection-flags`：验收时只显示既有 `flags`（摘要/证据净化截断、`evidenceOmitted` 省略提示），**不追加** `folded` 文案；普通分支的 `flags + folded` 逐字不变。
- 证据：验收时在 flags 后新增 `<div className="acceptance-evidence">`：
  - 标题 `ui.reportCard.evidenceCount`（`{count}` = `evidence.length`）；
  - `<ul className="hb-evidence">` 逐条列出全部 `evidence`：`asReportText(item.text)` + `textFlags(item, locale)`；
  - 空列表显示既有 `ui.reportCard.noEvidence`，区块不隐藏；
  - 不伪造 `evidenceOmitted` 未收到的条目（省略提示沿用 `flags`）。
- `report-facts`：验收时第一行改为 `ui.reportCard.acceptanceDecision` / `ui.reportCard.acceptanceDecisionPending`（条件措辞“报告本身不构成通过”）；普通仍为 `independentAcceptance` / `notConfirmed`；`includeSave` 的持久化事实行原样保留。
- 免责声明：验收时 `ui.reportCard.acceptanceDisclaimer`；普通仍 `ui.reportCard.disclaimer`。
- `report-actions`：验收时只保留来源角色文档按钮，**不渲染** `<details className="report-complete">`（无「查看全文」、无 `.report-complete`）；普通分支的按钮 + 折叠 DOM/文案/开合回调逐字不变。
- 不支持版本分支（`!supported`）原样优先返回，不进入验收展示。

**`ReportCard`（回交行）**

- 新增 `const roles = useChatStore((s) => s.roles); const acceptance = reportAcceptance(report, roles);`。
- 外层类名：在既有 `msg-handback` / `is-blocked` 基础上，验收时追加 ` is-acceptance`；普通报告类名逐字不变。
- 把 `acceptance` 传入 `ReportBody`。

**`DeliveryCard`（交付批）**

- 新增 `const roles = useChatStore((s) => s.roles);`。
- `reports.map` 内对每份报告计算 `acceptance`；报告段 `<section>` 类名：普通保持 `delivery-report` 逐字不变；验收时追加 `is-acceptance`，且仅当 `acceptance && status !== "completed"` 时追加 `is-blocked`（见 §9.4 的窄化说明）。
- 把 `acceptance` 传入该段 `ReportBody`。
- 不改交付批标题/事实/安全副本/持久化区/重试逻辑。

### 4.4 A3-2：`app/renderer/src/chat/DecisionDialog.tsx`

- 新增局部 `markdownHtml(text)`（与 `ReportCard.tsx:41-43` 同形，`renderMarkdown` 单一管线）；不从 `markdown.ts` 引第二个 helper。
- 对话框类名：`decision-dialog` + 既有 `is-high-risk`/`is-destructive` + 验收时 `is-acceptance`。
- 徽标（190-194）：验收时文本用 `ui.decisionDialog.acceptanceKind`（「独立验收决定」），类名追加 `is-acceptance`；其他卡种仍显示原始 `cardKind`（O1 不实施）。
- preview（227-229）：
  - 普通卡：保持现状 `<pre className="dd-preview">{view.preview}</pre>`；
  - 验收卡且 `showPreview`：`<div className="dd-acceptance-preview"><div className="excerpt-label">ui.decisionDialog.acceptancePreviewLabel</div><pre className="dd-preview">{view.preview}</pre></div>`；
  - `showPreview = view.preview !== "" && !(view.acceptanceReport !== null && sameDisplayText(view.preview, view.acceptanceReport.text))`；
  - 报告缺失/非法时 preview 原样显示；不去重、不折叠。
- 报告原文区（插在 preview 之后、`detail`/`question` 之前）：
  - `<section className="dd-acceptance-report" aria-label={ui.decisionDialog.acceptanceReportTitle}>`；
  - 可见标题 `ui.decisionDialog.acceptanceReportTitle`；
  - `acceptanceReport !== null` 且 `path !== ""` 时显示 O2：`ui.decisionDialog.reportPath`（`{path}`），类 `dd-report-path`；
  - 有报告：`<div className="dd-acceptance-body card-md" dangerouslySetInnerHTML={markdownHtml(acceptanceReport.text)} />`；`truncated` 显示 `ui.decisionDialog.acceptanceReportTruncated`，`redacted` 显示既有 `shared.common.redacted`（`projection-flags` 样式）；
  - 无报告：有 preview 用 `ui.decisionDialog.acceptanceReportFallback`，无 preview 用 `ui.decisionDialog.acceptanceReportMissing`；不显示路径、不伪造原文。
- 不改问题、选项、推荐、可作答性、提交/拒绝/稍后处理、焦点陷阱、Esc、二次确认、`aria-labelledby`/`aria-describedby`、`data-*`。

### 4.5 A3-3：CSS（只用既有令牌，危险色优先）

**`app/renderer/src/shell/shell.css`（回交行）**

```css
.msg-handback.is-acceptance {
  border-color: var(--info-border);
  border-left: 3px solid var(--info);
}
.msg-handback.is-acceptance.is-blocked {
  border-color: var(--danger-border);
  border-left: 3px solid var(--danger);
}
.report-top.is-acceptance { background: var(--info-bg); }
.msg-handback.is-acceptance.is-blocked .report-top { background: var(--danger-bg); }
.report-acceptance-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid var(--info-border);
  border-radius: var(--radius-micro);
  background: var(--info-bg);
  color: var(--info);
  font-size: 10px;
  font-weight: 600;
  vertical-align: middle;
}
.report-body.is-acceptance .hb-summary { max-height: 60vh; overflow: auto; }
.report-body.is-acceptance .hb-evidence { max-height: 40vh; overflow: auto; }
.acceptance-evidence { min-width: 0; }
```

**`app/renderer/src/shell/phase4b.css`（交付批单独覆盖 + 窄屏）**

```css
/* 交付批没有 .msg-handback 外层，必须单独覆盖。 */
.delivery-report.is-acceptance {
  border-left: 3px solid var(--info);
  border-radius: var(--radius-control);
  padding-left: 10px;
}
.delivery-report.is-acceptance.is-blocked { border-left-color: var(--danger); }
.delivery-report.is-acceptance.is-blocked .report-top { background: var(--danger-bg); }
```

- 200%/窄屏：把 `.acceptance-evidence`、`.report-body.is-acceptance .hb-summary`、`.report-body.is-acceptance .hb-evidence` 纳入既有 `min-width: 0; max-width: 100%; overflow-wrap: anywhere` 守卫（与 869-910 现有规则同组），保证不横向溢出。

**`app/renderer/src/shell/phase4a.css`（决定卡）**

```css
.decision-dialog.is-acceptance { border-color: var(--info-border); }
/* 必须写在 .is-acceptance 之后：高风险/破坏性危险色优先。 */
.decision-dialog.is-acceptance.is-high-risk { border-color: var(--danger-border); }
.decision-dialog.is-acceptance.is-destructive { border-color: var(--warning-border); }
.dd-kind.is-acceptance { border-color: var(--info-border); color: var(--info); background: var(--info-bg); }
.dd-acceptance-preview { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dd-acceptance-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--info-border);
  border-left: 3px solid var(--info);
  border-radius: var(--radius-micro);
  background: var(--selected);
}
.dd-acceptance-title { margin: 0; color: var(--text-3); font-size: 11px; font-weight: 600; }
.dd-acceptance-body {
  max-height: 46vh;
  overflow: auto;
  overflow-wrap: anywhere;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.8;
}
.dd-report-path {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.dd-acceptance-missing { margin: 0; color: var(--text-3); font-size: 11.5px; }
```

- 在既有 `@media (max-width: 480px)` 查询内补充 `.dd-acceptance-report` / `.dd-acceptance-body` 的 `min-width: 0; max-width: 100%; overflow-wrap: anywhere`。
- 不写裸色值；`theme-tokens.test.ts` 的 `var(--x)` 审计应零缺失（上述令牌全部已定义）。

### 4.6 通用约束

- Markdown 只经 `renderMarkdown` 或局部 `markdownHtml`；`request.preview` 始终纯文本 `<pre>`；不新增 `innerHTML`/`fetch`/`fs`/IPC。
- 徽标是**文字**（「独立验收」/「独立验收决定」），颜色不是唯一信息；对话框既有 ARIA/焦点/二次确认不变。
- 不硬编码中文；全部文案走 A1 的 14 个 `ui.*` key；不新增强制 key。
- 普通分支 DOM/类名/文案/折叠逐字不变（AC-4）；验收分支只在判定为验收时插入。

## 五、A5 E2E 夹具（最小追加，不新建脚本）

### 5.1 选择与边界

- **选用** `test/桌面UI/phase4b-electron-smoke.mjs`（桌面UI 目录授权）：其 listing 已含内置 `verifier`（`builtIn: true`, `governanceFunction: "verification"`）与项目角色 `P`，并已有普通报告、交付批、operator 请求夹具。
- **不新建** e2e 脚本；**不修改** `test/桌面应用/e2e/main.mjs`；`test/桌面应用/e2e/uiux-v2.mjs` 本提案默认不改（若 D1 阶段确认 phase4b 无法承载某条断言，再按团队计划在该单文件内最小追加，仍不新建脚本）。
- 追加方式：在现有 200% 段落之后、最终 console/CSP 检查之前追加一个**自包含**块（`load("trio")` 重新建立 listing，避免影响既有 `document.querySelector('.msg-handback')` 相关断言）；不修改任何既有断言/夹具/顺序。

### 5.2 夹具与断言（建议最小集）

1. **回交行（内置质检）**：`select("verifier")`，推送 `kind:"handback"`，报告 `source.roleId:"verifier"`、`summary.text` >180 字且末尾唯一 marker、2 条 evidence（一条 `redacted:true`、一条 `truncated:true`）、`evidenceOmitted:2`。断言：
   - `.msg-handback.is-acceptance`；`.report-title` 含「独立验收报告」；`.report-acceptance-badge` 含「独立验收」；`.report-top.is-acceptance`、`.report-body.is-acceptance`；
   - `.hb-summary` 文本含末尾 marker（默认视图可见）；`.msg-handback .report-complete` 不存在；
   - `.acceptance-evidence .hb-evidence li` 数量 = 2，逐条文本与 flags 可见；`projection-flags` 含「另有 2 条证据因预算省略」；
   - `.report-facts` 含「验收决定（如适用）」与「报告本身不构成通过」；`.report-disclaimer` 含「如本次为验收任务」，且不出现断言式「验收通过/已通过」；
   - `.report-actions` 只有来源按钮（无折叠 summary）。
2. **交付批（内置质检）**：向 `P` 推送交付消息，`inputProvenance.reports` 含同一份 verifier 报告。断言 `.msg-delivery .delivery-report.is-acceptance`、标题/徽标/全文 marker/证据/无 `.report-complete`；对照普通交付报告段仍为 `delivery-report`（无 `is-acceptance`）。用 `status:"blocked"` 变体断言 `.delivery-report.is-acceptance.is-blocked` 与 `.report-top` 危险背景/左边条类（DOM/类名证据；能稳定读计算样式时再补 `getComputedStyle`，不硬编码主题值）。
3. **危险色优先（回交行）**：`status:"blocked"` 的验收 handback → `.msg-handback.is-acceptance.is-blocked`，徽标/标题仍在；断言危险类与验收类同时存在（CSS 用 specificity/顺序保证危险色胜出）。
4. **决定卡（有效载荷）**：先 `document.activeElement?.blur()` 避免输入抑制，推送 `session:operator-request`：`request.cardKind:"acceptance"`、`preview` 含唯一 marker、2 个选项（含 recommended）、`acceptanceReport:{version:1,path:"docs/quality/flow-a-report-v1.md",text:{text:"# 验收报告\n\nREPORT-TEXT-MARKER …",redacted:false,truncated:true}}`。断言：
   - `#decision-dialog.is-acceptance`；`.dd-kind` 文本为「独立验收决定」且非机器值 `acceptance`；
   - `.dd-acceptance-report`、`.dd-acceptance-body` 可见且含 `REPORT-TEXT-MARKER`；`.dd-report-path` 含固定约定路径；
   - `dd-preview` 唯一 marker 在**默认视图**可见（不在 `<details>` 内），标签「验收卡说明」；
   - `truncated` 文案可见；选项数量/推荐项与夹具一致；`.dd-submit` 可作答；用 `.dd-later` 关闭。
5. **决定卡（非法载荷/降级）**：推送 `acceptanceReport.version: 2`（或 `text.text` 为非字符串）与 preview marker → 显示 `acceptanceReportFallback`、无 `.dd-acceptance-body`、preview 仍可见；用 `.dd-later` 关闭。
6. **决定卡（去重/危险色）**：preview 与报告文本规范化后完全相等 → 无 `dd-preview`、报告原文只出现一次；`risk:"high"` 的验收卡 → `.decision-dialog.is-acceptance.is-high-risk`，危险色优先（类名 + 可稳定读取时补计算样式）。
7. **窄屏/200%**：在本块内临时 `wc.setZoomFactor(2)`，对验收 handback 与决定卡断言 `.acceptance-evidence`/`.dd-acceptance-body` 的 `scrollWidth <= clientWidth + 1` 且无横向溢出，随后恢复 `setZoomFactor(1)`；不替代既有 200% 段。

> E2E 断言必须来自当前候选真实渲染；不把源码阅读当渲染证据。D1 运行前先 `npm run build:renderer`（phase4b 默认加载 `app/renderer/dist/index.html`）。

## 六、测试计划

### 6.1 单元/组件/守卫

| 文件 | 追加/更新 | 覆盖 |
| --- | --- | --- |
| `test/桌面UI/role-view.test.ts` | 新增 `isVerificationRole` 用例 | 内置质检 true；项目 `verifier`（`builtIn:false`）false；`builtIn:true` + 其他/缺失 `governanceFunction` false；`null`/`undefined`/缺字段 false；不按 id 猜测 |
| `test/桌面UI/decision-dialog.test.ts` | 新增 acceptance/防御读取/去重用例 | `acceptance` 标志；合法 `acceptanceReport` 各字段；缺失/version≠1/text 非字符串/redacted/truncated 非布尔/path 非字符串 → `null`；UTF-8 16384 边界（多字节字符：`"汉".repeat(5461)`=16383 字节接受，再多 1 字符拒绝）；非验收卡携带字段 → 不消费；选项/推荐/可作答性/优先级不变；`sameDisplayText` CRLF/首尾空白/差异用例 |
| `test/桌面UI/dialog-a11y.test.ts` | 按需追加源码/样式守卫 | 验收徽标文字、`dd-acceptance-report`/`aria-label`、preview 仍 `<pre>` 且非折叠、既有 ARIA/焦点/二次确认断言不删不改 |
| `test/桌面UI/source-guard.test.ts` | 按需追加断言 | 报告原文只经 `markdownHtml`/`renderMarkdown`；`preview` 纯文本；无新 `innerHTML`/网络/文件访问（既有通用守卫保持） |
| `test/桌面UI/theme-tokens.test.ts` | 按需（预期不改） | 新样式只引用已定义令牌；无裸色值 |
| `test/桌面UI/report-view.test.ts` | **不改**（回归） | `reportPreview` 180 字/4 行、flags、普通卡语义不变（AC-4） |

### 6.2 E2E

- `test/桌面UI/phase4b-electron-smoke.mjs` 的最小追加（§五）；若 phase4b 不可跑，按团队计划改用 `uiux-v2.mjs` 同类断言并记录原因，不新建脚本、不改 `main.mjs`。
- 运行命令（与 V1 §6.3 一致）：`node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs`（记录环境/候选哈希/`E2E_PASS`；截图至多，不要求录屏）。

### 6.3 门禁与纪律

- `node --test --test-concurrency=1 test/桌面UI/role-view.test.ts test/桌面UI/decision-dialog.test.ts test/桌面UI/dialog-a11y.test.ts test/桌面UI/source-guard.test.ts test/桌面UI/theme-tokens.test.ts test/桌面UI/report-view.test.ts`；
- `npm run typecheck:renderer`、`npm run build:renderer`（A3 出口）；D1 另跑 `npm run typecheck` 与跨层套件（不属本角色）。
- **不删除/不新增 skip/todo/不放松既有断言**；普通卡回归必须由既有 `report-view.test.ts` 与 phase4b 普通报告断言原样通过证明。测试计划中的新增断言只覆盖新行为，不改写旧期望。

## 七、写集与非目标

### 7.1 本提案授权内的写集（A2/A3/A5 实际实施时）

- 产品：`app/renderer/src/chat/role-view.ts`、`app/renderer/src/chat/decision-dialog.ts`、`app/renderer/src/shell/ReportCard.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/shell/shell.css`、`app/renderer/src/shell/phase4a.css`、`app/renderer/src/shell/phase4b.css`。
- 测试：`test/桌面UI/role-view.test.ts`、`decision-dialog.test.ts`、`dialog-a11y.test.ts`、`source-guard.test.ts`、`theme-tokens.test.ts`（按需）、`test/桌面UI/phase4b-electron-smoke.mjs`；条件性 `test/桌面应用/e2e/uiux-v2.mjs`（本提案默认不改）。
- 文档：本提案；可更新 `角色卡/桌面UI/memo.md`。

### 7.2 非目标（明确不写）

- 不写 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 i18n messages、共享 Model、报告契约、门禁/编排/路由）。
- 不写 `test/桌面应用/**`（除条件性 `uiux-v2.mjs`）、其他角色测试、`test/测试/**`。
- 不改角色卡/边界/`boundary.yaml`/changelog、`docs/scheduling|acceptance|communication|planning`。
- 不改 `src/model/runtime.ts`、`DisplayTextV1`/`ReportSnapshot` 形状、`cardKind` 集合、工具 schema、验收判定/选项/推荐/可作答性/优先级/路由/`request.resolved`/`customer.decision`/报告持久化/写权。
- 不实现 O1/O3–O10（仅 O2 纳入）；不恢复 `full-report-display` P1.3；不新增 e2e 脚本；不 commit/push/启动应用/接触客户。

## 八、依赖与契约冻结

### 8.1 依赖 A1：14 个 i18n key（项目管理 A1 唯一写入）

A3 消费的 key（全部来自方案 §4.4；占位符必须一致）：

| Key | 占位符 | 消费点 |
| --- | --- | --- |
| `ui.reportCard.acceptanceTitle` | — | `ReportBody` 验收标题 |
| `ui.reportCard.acceptanceBadge` | — | 验收徽标 |
| `ui.reportCard.acceptanceReportLabel` | — | 报告正文标签 |
| `ui.reportCard.evidenceCount` | `{count}` | 证据区块标题 |
| `ui.reportCard.acceptanceDecision` | — | 验收事实行 dt |
| `ui.reportCard.acceptanceDecisionPending` | — | 验收事实行 dd（条件措辞） |
| `ui.reportCard.acceptanceDisclaimer` | — | 验收免责声明 |
| `ui.decisionDialog.acceptanceKind` | — | 决定卡本地化徽标 |
| `ui.decisionDialog.acceptanceReportTitle` | — | 原文区标题 / `aria-label` |
| `ui.decisionDialog.acceptanceReportFallback` | — | 有 preview 的降级说明 |
| `ui.decisionDialog.acceptanceReportMissing` | — | 无 preview 的缺失说明 |
| `ui.decisionDialog.acceptanceReportTruncated` | — | 截断提示 |
| `ui.decisionDialog.acceptancePreviewLabel` | — | 「验收卡说明」标签 |
| `ui.decisionDialog.reportPath` | `{path}` | O2 报告路径 |

- `MessageKey = keyof typeof zhCN`；A1 未落 key 前，A3 的 `typecheck:renderer` 会因 key 不存在失败。因此 **A3 必须在 A1 之后**。
- A2（纯逻辑）不消费新 key，可在 A1 前并行；A2 的测试不依赖 i18n 新 key。

### 8.2 依赖 A4：`OperatorRequestPayload.acceptanceReport` 形状（C2 冻结）

- A4 提供：`acceptanceReport?: { version: 1; path: string; text: DisplayTextV1 }`，`DisplayTextV1 = { text: string; truncated: boolean; redacted: boolean }`；仅 `cardKind === "acceptance"` 时出现；缺失/非法/旧 payload 时字段缺席。
- 渲染层按 §3.2 防御读取；若 A4 需要改变字段名/嵌套/版本语义（例如把 `path` 改为可选对象、`text` 改为字符串），**停止并回 P1/统筹**，不在渲染层自行兼容第二形状。
- A4 的 16 KiB `protectText` 投影是唯一截断点；渲染层只校验，不二次截断。

### 8.3 顺序与冻结

- 顺序：P1 审核通过 → A1/A2（可并行）→ A3（依赖 A1+A2）→ A4（可与 A3 并行，依赖 P1+H1）→ A5（依赖 A3+A4）→ D1。
- 本提案不冻结任何共享契约；C1/C2 是展示/应用私有契约。若需要新增共享 Model/公共导出/共享 helper、改验收判定/路由/持久化、或新增未列路径：**停止并回 P1/统筹**，按方案 §8.1 评估升 T3，不自行扩权。

## 九、风险与开放点

1. **F3 已接受限制**：内置质检的**非验收质量核对报告**也会显示「独立验收报告」身份；本提案不实现任务级判别（O10）。文案必须保持条件措辞（「如本次为验收任务…」「报告本身不构成通过」），不得声称「验收通过/已通过」；测试覆盖该边界文案，而不是把它当缺陷。
2. **F5 两处 CSS**：交付批没有 `.msg-handback` 外层，必须单独给 `.delivery-report.is-acceptance`（及 `is-blocked`）覆盖；回交行用 `.msg-handback.is-acceptance`；决定卡 compound 规则写在 `.is-acceptance` 之后。漏一处会导致 AC-1/AC-10 失败。
3. **preview 去重**：只在有合法报告且规范化后完全相同时去重；报告缺失/非法时 preview 必须原样可见。避免用“包含/相似”判重导致卡面结论被吞。
4. **非法 payload**：version/类型/UTF-8 上限任一不符 → `null`；不抛错、不二次截断、不猜测字段；全链路（A4→payload→renderer）任何一环缺失都走 preview 降级。`TextEncoder` 在 Electron 44/Node 24 可用，但实现阶段仍需在 `typecheck:renderer`/E2E 实测。
5. **旧报告回放**：报告卡按当前角色列表重新判定；能解析内置质检 → 验收样式，否则普通；不迁移数据、不改快照/回放格式。旧 acceptance payload 无字段 → 决定卡显示 preview + 说明，仍可作答。
6. **角色列表未加载闪烁**：初始普通卡、加载后验收卡；已接受，不阻塞渲染；E2E 必须等待 listing 完成后再断言，避免把时序当缺陷。
7. **E2E 可运行性**：B0 只确认二进制/harness 存在，真实 E2E 未跑；D1 必须先 `build:renderer` 再运行 phase4b。若 Windows 时序/窗口不可跑，如实记录原因（命令/错误/环境），不以单测替代真实 DOM 证据。
8. **普通 DOM 逐字不变 vs 交付批状态类**：方案 §4.1 字面建议给交付批按 `status !== "completed"` 加 `is-blocked`；为满足 AC-4「普通报告类名/文案不变」，本提案**只在验收报告段**加 `is-acceptance`/`is-blocked`，普通交付段的 class 保持 `delivery-report`。若 P1 审核要求字面统一，需要同时接受普通交付段类名变化的回归范围，请审核明确。
9. **i18n 计数**：A1 预期 `ui: 921 / 总计 1545`（14 个 key）；若最终 key 集/数量不同，由 A1 在测试与报告中说明，渲染层不自行补 key。
10. **决定卡布局**：报告原文区插在 preview 之后、detail/question 之前，正文限高 46vh 内滚动；窄屏/200% 需实测无横向溢出。若审核认为原文区应放在问题之后，可在 A3 前调整，不改变契约。
11. **`acceptanceTriage` 前闸（V1 §9.8 开放点）**：复核未发现 `opts.acceptanceTriage` 注入点；若真实接线存在并替换验收卡，`acceptanceReport` 可能不到达 `DecisionDialog`。本提案不改路由；D1/E2 需实际观察并在证据中记录。
12. **未实施声明**：本文件所有行为描述均为设计候选；未跑测试、未启动应用、未真实渲染。文中的行号/哈希是 HEAD `5a35908` 只读快照，实施后以实际候选重新取证。

## 十、P1 出口自检（供审核）

- [ ] C1 判据精确且唯一；项目角色/缺字段/未加载列表均走普通卡；两处位置由同一 `ReportBody` 消费同一判定。
- [ ] C2 本地类型与防御读取覆盖 version/text/redacted/truncated/path/UTF-8 16384；非法 → `null`；不新增共享类型。
- [ ] A2/A3 文件与改动点逐项可执行；普通分支逐字不变；验收分支完整正文 + 全部 evidence + 无折叠；决定卡徽标/原文/路径 O2/preview 始终可见/去重/降级。
- [ ] A5 只选既有 harness 最小追加；不新建 e2e、不改 `main.mjs`。
- [ ] 测试计划覆盖 AC-1–AC-7/AC-9–AC-11 的桌面UI侧证据；不删断言/不加 skip；E2E 可跑性留 D1 实测。
- [ ] 写集只含 §7.1；依赖 A1 14 key 与 A4 C2 形状；未触共享 Model/判定/路由/持久化。
