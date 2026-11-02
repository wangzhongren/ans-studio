---
id: acceptance-return-card-p1-review
type: change
title: P1 实现提案审核：验收回交卡（桌面UI / 桌面窗口 / 项目管理 i18n）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: 按 references/proposal-review.md 审核桌面UI/桌面窗口 P1 提案并自检项目管理 A1 i18n 提案；结论 recommend approval
---

# P1 实现提案审核：验收回交卡（桌面UI / 桌面窗口 / 项目管理 i18n）

- **审核角色 / 上下文**：项目管理（technical-architecture，固定角色，本上下文只承担该角色）。
- **审核性质**：实现提案审核（`references/proposal-review.md`）；不是客户闸门、不是实施授权、不是测试结果、不是独立验收结论。
- **审核对象版本**（本记录只对下列版本有效；任一提案改动后须重新核对受影响项）：

| 对象 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 桌面UI P1 提案 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| 桌面窗口 P1 提案 | `角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 426 | `8ee94a302e04eab740dcd7353bc7b8e4874363cb93db363ed6cd7c98e172360e` |
| 项目管理 A1 i18n 提案（审核者自身提案，见 §六） | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-i18n-implementation-proposal.md` | 251 | `902a36b31306ddda5d2f6ee5d5db548a549fb9deab6dbbd31b3733c09f6c81de` |

- **结论**：**`recommend approval`**。两份实施提案在 C1/C2/C3、F3/F5/Q5-A/O2、普通卡不回归、Markdown/安全、a11y/窄屏、i18n 与测试映射上均落在方案 P1.2、V1、团队计划 §4.3/§5.3 的写集与口径内；未发现需要重开方案/写集/档位的实质变化。P1-ARC-01/02/04 是 **A3/A4 实施时必须落实的精确条件**（不要求改提案或重开 P1），P1-ARC-03/05~08 为建议项。
- **可进入的下一步**：P1 通过后，**A1（i18n）与 A2（渲染纯逻辑）可并行开工**；A3 须待 A1/A2 冻结，A4 须待 H1 完成（B-1 已落地，见 §七）；不代替 V1、客户实施授权或独立验收，也不授权 commit/push/发布。
- **未做**：未运行测试、未启动应用、未跑 E2E、未实施任何产品/测试代码、未 commit/push/merge/release、未接触客户。所有代码结论来自 HEAD `5a35908` 的只读阅读与 B0 基线转引。

## 一、冻结输入与只读基线

### 1.1 输入（2026-11-02 审核时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 客户确认方案 P1.2 | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 实施前验收标准 V1 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 团队计划（闸门 2 确认） | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| 独立复核 | `docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |
| 桌面UI P1 提案 | 见文首对象表 | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| 桌面窗口 P1 提案 | 见文首对象表 | 426 | `8ee94a302e04eab740dcd7353bc7b8e4874363cb93db363ed6cd7c98e172360e` |
| A1 i18n 提案（自审，见 §六） | 见文首对象表 | 251 | `902a36b31306ddda5d2f6ee5d5db548a549fb9deab6dbbd31b3733c09f6c81de` |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；`git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空。
- B0 事实转引（不重跑）：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 退出码 0；四组受影响套件 94/94 pass、0 fail、0 skip、0 todo；Electron 44.7.0 与三个 harness 存在且 `node --check` 通过；真实 E2E 未执行，留 D1。
- B-1 已由人事落地：`角色卡/桌面窗口/boundary.md:76`、`boundary.yaml:219`、`changelog.md:3` 含 `test/桌面应用/acceptance-return-card.test.ts` 精确条目；B-1 是治理变更，不计入产品候选。
- 只读代码核对（HEAD）：`app/renderer/src/chat/types.ts:24-38`（`RoleView.builtIn`/`governanceFunction`）、`app/desktop/interface.ts:2098-2113`（透传）、`app/renderer/src/chat/role-view.ts:75-78`（`findRole`；当前无 `isVerificationRole`）、`app/renderer/src/shell/ReportCard.tsx:75-239/249-274/369-380`、`app/renderer/src/chat/DecisionDialog.tsx:190-194/227-229`、`app/renderer/src/chat/decision-dialog.ts:19-38/64-67/89-130`、`app/desktop/session.ts:3655-3819/3835-3837/2641-2663`、`app/desktop/customer-input.ts:96-122/539-568/1743-1795`、`src/common/runtime-core/tool-display.ts:69-84`、`src/common/shared/diagnostics.ts:11-32`、`src/common/runtime-core/report-provenance.ts:6`、`src/model/runtime.ts:364/1714-1752`。

### 1.2 审核方法与限制

- 按 `references/proposal-review.md` 检查需求符合、五层架构与依赖方向、共享契约/公共导出、角色归属、复用、测试迁移与证据；只读核对方案、V1、团队计划、复核、B0、两份提案与相关代码段落。
- 只核对与本提案直接相关的代码/测试段落，未逐行读完全部大文件；未运行测试/应用/E2E，未验证真实渲染、焦点/滚动、200%/窄屏、主题对比度或 IPC 运行时行为。
- 未另发受影响角色评估；桌面UI/桌面窗口均以各自 P1 提案表达实现意图，项目管理以本记录作审核结论。A1 属审核者自身提案，按 §六 披露自检，不虚构独立审核。
- 本记录只写审核结论与实施条件，不修改两份提案、不修改产品源码/测试、不写调度/验收/沟通/策划文档。

## 二、逐项核对结论

| # | 核对项 | 结论 | 依据/说明 |
| --- | --- | --- | --- |
| 1 | C1 验收报告身份 | **通过** | 桌面UI §2.1/§4.1：`isVerificationRole(role) = role?.builtIn === true && role.governanceFunction === "verification"`，严格布尔；项目角色 `verifier`（`builtIn=false`）不触发；缺字段/`null` → 普通卡；`ReportCard`/`DeliveryCard` 各自对同一报告计算一次 `acceptance` 并传入同一 `ReportBody`，不二次判定；两处位置（回交行 `.msg-handback`、交付批 `.delivery-report`）同一判据。 |
| 2 | C2 应用私有载荷 | **通过** | 桌面窗口 §2.1/§4.1：`OperatorRequestPayload.acceptanceReport?: { version: 1; path: string; text: DisplayTextV1 }` 定义在 `app/desktop/customer-input.ts`，不进入 `src/model/runtime.ts`/报告快照/任务账本；A3 `decision-dialog.ts` 本地 `AcceptanceReportView` 按 version/text/redacted/truncated/path/UTF-8 16384 防御读取，非法 → `null`；preview 始终显示在原文上方，仅规范化完全重复时去重，缺失/非法走 fallback/missing。 |
| 3 | C3 报告文件来源与路径安全 | **通过（附 A4 实施条件 P1-ARC-04）** | 桌面窗口 §2.2/§3.1：只复用 `enrichAcceptanceJudgeContext` 已有 `readText(reportRel)`，不新增 `fs` 读取/第二路径；构造 `reportRel` 前本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；非法非空 flowId 早退合成 fail-closed judgeContext（不含 `qualityReportPath`/`acceptanceReportPath`/`artifacts`，含 `unavailableReason`）；缺失 flowId 沿用既有早退；合法 slug 的 facts/artifacts/unavailableReason 计算逐字保留，只增加 `display`。 |
| 4 | F3 文案与已接受限制 | **通过** | 桌面UI §4.3/§8.1 使用方案 §4.4 的 `acceptanceDecision`/`acceptanceDecisionPending`/`acceptanceDisclaimer` 条件措辞；不声称「已通过」；项目角色不标记；非验收质量核对报告仍按验收身份显示（已接受限制），不做任务级判别（O10 不实施）。 |
| 5 | F5 两处报告卡 CSS/危险色优先 | **通过（附解释 P1-ARC-02）** | 桌面UI §4.5 同时覆盖 `.msg-handback.is-acceptance`（回交行）与 `.delivery-report.is-acceptance`（交付批，无 `.msg-handback` 外层）；两处 `.is-blocked` 使用 `--danger*` 且写在验收冷色之后/更高 specificity；决定卡 `.is-acceptance.is-high-risk`/`.is-destructive` 使用 `--danger-border`/`--warning-border`，写在 `.is-acceptance` 之后。 |
| 6 | Q5-A 预算 | **通过** | 报告卡沿用既有快照上限（摘要 16 KiB、单证据 2 KiB、最多 32 条、快照 96 KiB，`report-provenance.ts:6`），A3 不新增显示预算；决定卡用 `protectText(reportText, 16384)` 的 UTF-8 投影；超限/净化 flags 如实；不实施 O4 第二路径/Q5-B/C/D。 |
| 7 | O2 报告路径 | **通过** | A4 在合法报告存在时传 `path = docs/quality/<flowId>-report-v1.md`；A3 用 `ui.decisionDialog.reportPath` 显示 `<code>`/`dd-report-path`；缺失/非法不伪造路径，显示 fallback/missing。 |
| 8 | 普通报告卡逐字不回归 | **通过（附实施条件 P1-ARC-01/02）** | 桌面UI §4.3 普通分支 DOM/类名/文案/折叠逐字不变；`reportPreview`/`report-view.test.ts` 不改；交付批普通段保持 `delivery-report`，不因非验收报告新增 `is-blocked`；`uiux-v2.mjs`/`phase4b` 既有普通报告断言保留。 |
| 9 | Markdown 单一管线/source-guard | **通过** | A3 报告原文只经 `renderMarkdown`/局部 `markdownHtml`；`request.preview` 仍为 `<pre>` 纯文本；不新增 `innerHTML`/网络/文件访问；`source-guard.test.ts` 既有 `dangerouslySetInnerHTML` 注入行守卫允许 `markdownHtml(`/`renderMarkdown(`。 |
| 10 | a11y/窄屏/200% | **通过** | 徽标为文字（「独立验收」/「独立验收决定」）；`dialog-a11y.test.ts` 既有 ARIA/焦点/二次确认断言不删不改；两处位置/危险态 DOM 断言；决定卡 high-risk/destructive 危险色优先；新样式只用既有令牌（`--info*`/`--danger*`/`--warning-border`/`--selected`/`--text-*`/`--radius-*`/`--font-mono`，`index.css` 已定义）；窄屏/200% 加 `min-width:0`/`overflow-wrap:anywhere`/卡内滚动。 |
| 11 | i18n 14 key/计数/guard | **通过（A1 自审，见 §六）** | A1 提案与桌面UI §8.1 的 14 个 key 完全一致；当前计数 `ui 907 / main 559 / shared 62 / preferences 3 = 1531` → 预期 `921/1545`；`{count}`/`{path}` 唯一占位符；`ReportCard.tsx`/`DecisionDialog.tsx` 不在 allowlist；A1 不改 `i18n-guard.test.ts`/allowlist。 |
| 12 | 测试映射 AC-5–AC-7 | **通过（附 P1-ARC-05）** | 桌面窗口新增 `test/桌面应用/acceptance-return-card.test.ts` 为 SessionManager 级：正常文件、>16 KiB 截断、空/缺失、不可读、无 flowId、非法 flowId、旧 payload；`optional-acceptance.test.ts` 仅 channel 级，不能单独证明 AC-5–AC-7；B-1 已落地。见 §四。 |
| 13 | 写集/边界/非目标 | **通过** | 桌面UI/桌面窗口/项目管理写集均落在团队计划 §4.1/§4.3；桌面窗口新测试是唯一新文件；A5 E2E 只改桌面UI 既有 `phase4b-electron-smoke.mjs`/条件 `uiux-v2.mjs`；不新建 e2e 脚本、不改 `main.mjs`、不改共享 Model/公共导出/其他角色测试。见 §五。 |
| 14 | 证据与放行 | **通过** | 两份提案均要求候选哈希/命令/退出码/计数/失败分类；A1 只改共享 i18n 与自身测试；D1 同一候选取证；验收仍由 V1/独立验收判定；P1 不授权 commit/push。 |
| 15 | 方案/写集/档位实质变化 | **未发现** | 未发现改 `src/model/runtime.ts`、公共服务/入口、验收判定/路由/`request.resolved`/`customer.decision`、新增 `cardKind`/工具/能力位/IPC 或持久化展示文本；T2 档位与团队计划一致。 |

## 三、发现

### 3.1 阻断项

**无。** 未发现需要将结论改为 `needs revision`/`not ready` 的方案/写集/档位/授权实质问题。

### 3.2 实施条件与建议（不要求改提案，不重开 P1）

| 编号 | 严重度 | 位置 | 条件 | 依据 |
| --- | --- | --- | --- | --- |
| P1-ARC-01 | 一般（A3 实施要求） | 桌面UI §2.1/§2.2/§4.3；`ReportCard.tsx` | `ReportCard`/`DeliveryCard` 计算外层 `is-acceptance`/`is-blocked` 时，必须同时要求 `reportVersionSupported(report)`；否则不支持的 verifier 报告会在 `ReportBody` 走 `unsupportedVersion` 早退后仍带外层验收冷色，违反方案 §4.1「不支持版本不进入验收展示」。补一条组件/E2E 用例：不支持的 verifier 报告无验收标题/徽标/外层 `is-acceptance`。 | 方案 §4.1 第 3 条边界情形；AC-1「未解析/缺字段/不支持版本」；桌面UI 提案 §4.3 自身也写「原样优先返回，不进入验收展示」。 |
| P1-ARC-02 | 一般（A3 实施裁决） | 桌面UI §4.3 DeliveryCard、§9 #8 | 接受提案的窄化：`is-blocked` 只加在**验收报告段**（`acceptance && status !== "completed"`），普通交付段保持 `delivery-report` 逐字不变。这样 AC-4「普通类名/文案不变」与 AC-1/AC-10「验收危险色优先」同时成立；A3 在实现/证据中记录该裁决，不按设计 §4.1 字面给普通交付段加状态类。 | 方案 §4.1 第 5 条与 §5 C4；AC-4；桌面UI 提案 §9 #8 已披露该取舍。 |
| P1-ARC-03 | 建议（A5 断言措辞） | 桌面UI §5.2 第 1 项；A5 E2E | 「不出现断言式验收通过/已通过」不得实现为 `!text.includes("验收通过")`——已确认的免责声明本身含「是否验收通过以验收决定卡为准」。应断言不含断言式短语（「已验收通过」「验收已通过」「通过验收」等完整结论句），或只对报告标题/声明行断言无条件措辞；避免把批准文案误判为失败。 | 方案 §4.4 `acceptanceDisclaimer`；F3/N3；AC-1。 |
| P1-ARC-04 | 一般（A4 实施要求） | 桌面窗口 §3.1/§5.3 #6、§9 #2 | 缺失 flowId 沿用既有早退可接受，但 A4 测试必须断言：`ctx.acceptanceReport` 缺席、未构造/未读取 `docs/quality/` 路径、`judgeContext` 不含 `qualityReportPath`/`acceptanceReportPath`（若 metadata 带有编排 facts，也不得新增报告路径），preview 保留、卡可作答。若 V1 所有者把 AC-6「facts 按缺失处理」解释为缺失 flowId 也必须合成 fail-closed context，则停止并澄清，不在 A4 静默扩大。 | V1 AC-6/N4；V1 §3.6 方法 3；桌面窗口提案 §9 #2 已披露该差异。 |
| P1-ARC-05 | 建议（证据分层） | 桌面窗口 §5.3 #6；V1 AC-6/AC-11 | 旧 payload 子用例是 channel 级（旧排队/重启卡不经过新 `withRequestLifecycle`），不能单独作为 SessionManager 级 AC-6 证据；接受其在 A4 新测试中作 channel 子用例，但必须在 E1 变更包/验收表明确：旧 payload 降级同时由 A2 `decisionView`（无 `acceptanceReport` → `null`）与 A3/E2E DOM（preview 可见）补充；不得把该子用例写成 SessionManager 级。 | V1 §2.2/§2.4 第 5 条；V1 §3.6 方法 3；桌面窗口提案 §5.3 #6 已如实标注。 |
| P1-ARC-06 | 建议（诊断归属） | 桌面窗口 §3.2 | 诊断 logger 的 `roleId` 优先使用 `withRequestLifecycle` 的 `sourceRoleId` 参数（会话绑定身份），而非可选的 `request.sourceRoleId`；若保留现状，需在测试中覆盖缺省并确认不伪造角色。 | 代码 `session.ts:2694-2700`/`3825-3831`；`GovernanceCardMetadata.sourceRoleId` 可选。 |
| P1-ARC-07 | 建议（报告事实行） | 桌面UI §4.3 `ReportBody` | 验收事实行替换必须精确替换 `report-facts` 中的 `independentAcceptance`/`notConfirmed` 行，保留 `includeSave` 的存储事实行；避免把「storage」行或证据 flags 一并改写。测试用 `dt/dd` 文本断言。 | 现行 `ReportCard.tsx:167-201`；方案 §4.1 第 3 条。 |
| P1-ARC-08 | 建议（fixture 隔离） | 桌面UI §5.1；A5 | `phase4b-electron-smoke.mjs` 的追加块放在 200% 段落之后、最终 console/CSP 检查之前，`load("trio")` 重新建立 listing；不得影响既有 `.msg-handback` 普通报告断言。建议在追加块末尾 `wc.setZoomFactor(1)` 已恢复后再执行（现有 200% 段已恢复），并断言追加块自身零 console error/CSP violation。 | 现行 `phase4b-electron-smoke.mjs:900-967`；团队计划 §4.3 A5/§7.3。 |

## 四、AC-5–AC-7 测试映射（重点核对）

| AC | 必须的桌面窗口 SessionManager 级证据（新 `test/桌面应用/acceptance-return-card.test.ts`） | 渲染/其他层证据 | 结论 |
| --- | --- | --- | --- |
| AC-5 验收决定卡身份与原文 | #1 正常文件：走 `openRoleSession` 捕获的 `input.customerInput`（`withRequestLifecycle` 包装后），临时项目写 `docs/quality/flow-a-report-v1.md`；断言 `ctx.acceptanceReport` 与 presenter payload 的 `{version:1,path,text:{text,truncated:false,redacted:false}}`、`payload.request` 选项/预览不变、作答路径不变；#3 净化 flag；#8 诊断 | A2 `decision-dialog.test.ts`：`acceptance`/防御读取/`sameDisplayText`/选项结果不变；A3 `DecisionDialog.tsx` DOM：徽标「独立验收决定」/`is-acceptance`/原文/路径/preview marker 在默认视图可见；A5 E2E | 通过；`optional-acceptance.test.ts` 仅 channel 级，不作为本条单独证据 |
| AC-6 决定卡降级 | #4 空/缺失文件；#5 不可读（报告路径为目录，EISDIR）；#6 无 flowId；#7 非法 flowId（含路径穿越，项目外 sentinel 不被读取；断言 judgeContext/facts/artifacts fail-closed、`unavailableReason`）；#6 旧 payload 子用例为 channel 级（见 P1-ARC-05） | A2 `decisionView`：无字段/非法 → `acceptanceReport:null`、preview 保留、answerable/选项不变；A3 DOM fallback/missing + preview；A3 E2E | 通过（附 P1-ARC-04/05） |
| AC-7 有界投影 | #2 >16 KiB：断言 `Buffer.byteLength(display.text.text,"utf8") <= 16384`、`truncated===true`、path 正确、原文件 sha256 前后一致；#3 净化 | 既有 `tool-display`/`report-provenance` 回归（B0 36/36）；A3 DOM 截断提示/滚动容器 | 通过 |

- **B-1 状态**：新测试路径已由人事落地（`boundary.md:76`、`boundary.yaml:219`、`changelog.md:3`），B0 确认文件尚不存在；A4 须在 H1 后创建（H1 现已满足），符合团队计划 §5.2。
- **不得**：用 `optional-acceptance.test.ts` 替代本表；用纯函数/DOM 替代 SessionManager 级 payload 捕获；用 SessionManager 级测试替代真实渲染/E2E。
- **旧 payload**：按 P1-ARC-05 记录为 channel 级 + A2/A3 补充，不虚报 SessionManager 级。

## 五、写集、边界与非目标核对

| 角色 | 提案写集 | 团队计划 §4.1/§4.3 | 结论 |
| --- | --- | --- | --- |
| 桌面UI | `app/renderer/src/chat/role-view.ts`、`decision-dialog.ts`、`app/renderer/src/shell/ReportCard.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/shell/{shell,phase4a,phase4b}.css`；`test/桌面UI/{role-view,decision-dialog,dialog-a11y,source-guard,theme-tokens}.test.ts`；条件 `phase4b-electron-smoke.mjs` / `uiux-v2.mjs` | 均为桌面UI 既有目录/单文件授权 | 通过 |
| 桌面窗口 | `app/desktop/session.ts`、`app/desktop/customer-input.ts`；新增 `test/桌面应用/acceptance-return-card.test.ts`（B-1） | `app/desktop/` 目录 + B-1 精确测试 | 通过；新增测试是唯一新文件 |
| 项目管理 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | 既有目录授权 | 通过（自审见 §六） |
| E2E | 只改既有 `test/桌面UI/phase4b-electron-smoke.mjs`/`test/桌面应用/e2e/uiux-v2.mjs`；不新建脚本、不改 `main.mjs` | 团队计划 A5 | 通过 |
| 未列路径 | 两份提案均未写 `src/model/runtime.ts`、Service/Pipeline public 入口、共享 Model/报告契约、`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、其他 `test/桌面应用/` 文件、角色卡/边界、`docs/scheduling|acceptance|communication|planning` | 团队计划 §3.4/§4.5 | 通过；若实施发现需要未列路径，须停止并回报，不自行扩权 |

- 共享文件单写者：`ReportCard.tsx`/`DecisionDialog.tsx`/CSS 只由桌面UI；`session.ts`/`customer-input.ts`/新测试只由桌面窗口；i18n 两文件与 `i18n.test.ts` 只由项目管理；A3/A4 可并行但不得写对方路径。
- 不 commit/push；不把管理记录（本审核、方案、团队计划、V1）混入产品候选。

## 六、A1 i18n 提案自检与作者披露（不虚构独立审核）

- **Authorship disclosure**：A1 i18n 提案（`角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-i18n-implementation-proposal.md`，251 行 / `902a36b3…`）由**本审核者（项目管理）同一上下文撰写**。本节是作者自检，不是独立审核，也不是第二项目管理角色的意见；A1 的实施/验证仍须由测试/D1/独立验收覆盖。
- **Key 自检**：14 个 key 与方案 §4.4 表逐项一致；`grep` 当前 zh-CN/en-US 均 0 命中（无碰撞）；全部为 `ui.reportCard.*`（7 个）/`ui.decisionDialog.*`（7 个），不触发 `ui.acceptance.` 旧 key 零命中规则。
- **计数自检**：当前 `ui 907 / main 559 / shared 62 / preferences 3 = 1531`（实测与 B0 一致）；14 个新 `ui.*` → `921/1545`；A1 提案要求更新 `i18n.test.ts` 的测试名、`prefixes` 对象与 `keys.length` 三处。
- **占位符自检**：仅 `ui.reportCard.evidenceCount` 含 `{count}`、`ui.decisionDialog.reportPath` 含 `{path}`；其余 12 key 无 `{}`；zh/en 占位符集合一致；`shared.common.redacted` 复用，不新增 `shared.*` key。
- **文案自检**：zh/en 值逐字取自方案 §4.4；英文值无 Han 字符；`acceptanceDecisionPending`/`acceptanceDisclaimer` 保留条件措辞，不含断言式「已验收通过/验收已通过/通过验收」。
- **不独立审核声明**：本 P1 记录对 A1 的结论是「自检通过、可随 P1 进入 A1 实施」，不等于对 A1 的独立验收；A1 实施后仍须运行 `i18n.test.ts`/`i18n-guard.test.ts`、`npm run typecheck`，并由 D1/E2 验证。

## 七、H1/B-1 与阶段状态

- **B-1**：`角色卡/桌面窗口/boundary.md:76`、`boundary.yaml:219`、`changelog.md:3` 已含 `test/桌面应用/acceptance-return-card.test.ts` 精确条目（Delta-ARC-1）；B-1 是闸门 2 确认的人事治理变更，不计入产品候选，H1 出口已满足（B0 §3 记录 md/yaml 一致）。
- **阶段**：P1 审核通过后按团队计划 §5.1/§5.2：A1/A2 可并行（A1 由项目管理、A2 由桌面UI）；A3 依赖 A1+A2；A4 依赖 P1+H1（H1 已完成）；A5 依赖 A3+A4；D1 依赖 A5。P1 审核不改变 V1 与客户实施授权状态。
- **V1/实施授权**：本记录不替代 V1；客户实施授权与闸门 2 是分开的事实（V1 §1.1）；A1/A2 开工前仍以沟通记录中的实施授权为准。
- **验收**：本记录不是验收结论；AC-1–AC-14 由独立验收按 V1 判定；D1/E2 需重新取证，不引用本记录的代码阅读作为动态证据。

## 八、未解决项、限制与复审要求

### 8.1 未解决项

1. **P1-ARC-01 的 supported 门控**：A3 实施时必须写入；若审核/验收认为外层类名也属于「不支持版本保持现状」的一部分，A3 需在实现记录中补证据。此项不改变契约/写集，不重开 P1。
2. **P1-ARC-04 的缺失 flowId 口径**：V1 AC-6/N4 的「facts 按缺失处理」与设计 §4.3「无 flowId 沿用现有早退」存在解释空间；本审核按 V1 §3.6 方法 3 接受「不读取/不新增报告路径」的 fail-closed 落地，A4 测试补断言；若 V1 所有者要求合成 context，停止澄清。
3. **P1-ARC-05 的旧 payload 证据层**：A4 新测试的旧 payload 子用例是 channel 级；E1/验收表须与 A2/A3 的渲染证据合并说明，不能虚报 SessionManager 级。
4. **A1 实际计数**：实施时以 `i18n.test.ts` 实际 key 集为准；若与 14/921/1545 不一致，A1 实施记录逐项说明并停止偏离。
5. **E2E 可运行性**：B0 只确认二进制/harness 存在；D1 需实际运行 `phase4b-electron-smoke.mjs` 或 `uiux-v2.mjs`，记录 `E2E_PASS`/原始输出/截图（至多、不录屏）或可复核不可用原因。
6. **未验证**：未运行任何测试/应用/E2E；未验证 `TextEncoder` 在目标 Electron 渲染进程、`protectText` 16 KiB 边界、Windows EISDIR 夹具、200%/窄屏、诊断字段白名单在真实运行中的行为。这些由 A1–A5/D1/E2 验证。

### 8.2 复审要求

- 本记录只对文首对象表中的三个版本有效；桌面UI/桌面窗口提案或 A1 提案任何实质改动（C1/C2/C3 形状、F3 文案、F5 CSS、Q5-A/O2、写集、测试映射）后，须提交新行数/SHA-256 并重新核对受影响项。
- 复审至少覆盖：P1-ARC-01/02/03/04/05 的落点；AC-5–AC-7 的 SessionManager 级测试仍由桌面窗口新文件证明；写集仍无扩张；i18n 14 key/计数/占位符仍一致。
- 若修订触及方案语义、写集、档位或客户确认范围，立即停止并回报统筹/沟通，按方案 §8.1/团队计划 §5.4 处理，不自行扩权。

## 九、总体结论

**`recommend approval`。**

- 两份实施提案在 C1/C2/C3、F3/F5/Q5-A/O2、普通卡不回归、Markdown/安全、a11y/窄屏、i18n 与测试映射、写集/边界/非目标上都符合已确认的 P1.2、V1 与团队计划；无共享 Model/公共导出/验收判定/路由/持久化变更，T2 档位成立。
- P1-ARC-01/02/04 是 A3/A4 实施时必须落实的精确条件/裁决；P1-ARC-03/05~08 为证据分层/测试措辞/夹具建议。它们不要求修改提案或重开 P1，但未落实前不得声称 AC-1/AC-6 完整或把相应证据当已通过。
- **可进入 A1（i18n）与 A2（渲染纯逻辑）并行**；A3 须待 A1/A2 冻结，A4 须待 P1+H1（H1 已落地）；A5/D1/E1/E2 按团队计划顺序。P1 审核通过**不代替** V1、客户实施授权、D1 测试或独立验收，也不授权 commit/push/merge/release。
- **不是 `needs revision`**：未发现需要阻断 P1 的提案缺陷；上述条件均为实施细节，不改变契约/写集/档位。
- **不是 `not ready`**：所需输入（方案 P1.2、V1、团队计划、B0、B-1）齐全且哈希一致。

---

**本文件状态：P1 审核记录；结论 `recommend approval`；未运行测试、未实施、未验收、未 commit/push。**
