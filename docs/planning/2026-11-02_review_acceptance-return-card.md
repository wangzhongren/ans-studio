# 验收结果返回幕僚的卡片特殊显示 + 原文直出方案复核记录

- 复核对象：`docs/planning/2026-11-02_design_acceptance-return-card.md`（版本 **P1.0**，2026-11-02；778 行；SHA-256 `fd9571b4e08d5c1fab46696b622d1a65261d27da83ca04683d59c0d1d8a83bec`；复核按该快照只读，未改方案正文）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：跨渲染层、桌面 Interface 与共享 i18n；新增应用私有展示载荷；涉及报告/验收展示多处数据来源；不满足轻量条件）
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、现有代码/测试与本地快照；只写本复核记录）
- 闸门 0 记录：`docs/communication/2026-11-02_intent_acceptance-return-card.md`（68 行；SHA-256 `54f44bbbc66926a106140460413130360334385d51882d3101384b7d9b668aa4`；客户确认 Q1 两者都要、Q2 徽标 + 全文 + 证据）
- 复核日期：2026-11-02
- 代码基线：worktree `flow-improvements-wave1` HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；复核只读核对 `93a8b93..5a35908` 的 diff 仅涉及 4 个 `docs/communication/**` 文件（10 insertions / 1 deletion），与方案 §0 的基线说明一致
- 说明：本记录只作建议，不是批准、客户闸门、实施授权或验收基线；方案正文只由作者处置。

## 独立核对过的关键事实（只读）

- 复核对象与闸门 0 的行数、SHA-256 与任务输入一致；方案 §13 的多数代码行号在 HEAD 上复核成立。
- 报告卡当前统一走 `ReportBody`：正文取 `reportPreview(full)`（`app/renderer/src/chat/report-view.ts:130-138`），预览在 `app/renderer/src/shell/ReportCard.tsx:160-166`，完整摘要/证据在 `:205-234` 的 `<details class="report-complete">`；`ReportCard` 外层固定 `msg-handback`（`:258-261`）；`DeliveryCard` 对每个报告渲染 `ReportBody`（`:369-380`）。两个报告卡位置（质检自己的回交行 `ChatRow.tsx:642-656`、幕僚交付批 `DeliveryCard`）确为同一 `ReportBody`。
- 角色列表确实把内置身份透传到渲染层：`app/desktop/interface.ts:2104-2112` 透传 `builtIn` 与 `governanceFunction`；`RoleView` 在 `app/renderer/src/chat/types.ts:24-38` 有对应可选字段。trio 注册表中 `verifier` 为 `function: "verification"`（`src/common/门禁引擎/governance-roles.ts:418-448`），`TRIO_CARD_KINDS.verifier = ["acceptance"]`（`src/pipeline/orchestration/run-role.ts:2053`）。
- `enrichAcceptanceJudgeContext` 确在 `request.cardKind === "acceptance"` 时、卡片呈现/判断前运行（`app/desktop/session.ts:3835-3837`）；固定路径 `docs/quality/<flowId>-report-v1.md` 在 `:3673` 构造；`readText` 在 `:3674-3680`；`reportOk = reportText !== undefined && reportText.trim() !== ""` 在 `:3698-3699`；`facts.qualityReportPath` 在 `:3786`，`artifacts.acceptanceReportPath` 在 `:3811-3816`。方案对「已有读取、不新增 IO」的判断成立。
- verifier 卡文本要求先写 `docs/quality/<flowId>-report-v1.md` 再发 `request_choice(cardKind="acceptance")`（`governance-roles.ts:238-239`）；报告在 settle 时由 `recordFinalHandback` 持久化（`run-role.ts:1448-1507`），方案「卡时不能用报告存储」的理由成立。
- `request.preview` 是 `request_choice` 的模型自写字段（`src/provider/runtime/schema.ts:346`）；`phase-e` 演示的验收夹具确实没有 `preview`，但实际位置是 `test/测试/phase-e-governance-demo.mjs:325-334`，不是方案 §2.3 所引的 `:499-508`（见 F7）。
- `protectText(raw, limit)` 在 `src/common/runtime-core/tool-display.ts:76-84` 内按 UTF-8 字节截断并做凭据/模式净化，返回 `DisplayTextV1`；`createToolDisplayContext` 已被 Service `projectRuntimeLiveHandback` 使用（`src/service/runtime/session.ts:127`）。桌面 `session.ts` 已有 `src/common/runtime-core/*` 只读导入先例（`:2-3`）与 `src/common/编排/*` 先例（`:77-101`）。方案对「复用同一净化实现、不新增公共导出」的表述基本成立。
- `OperatorRequestPayload` 在 `app/desktop/customer-input.ts:96-122`，当前除方案列出的字段外还含必填 `anchorKey` 与可选 `mirrorRoleId`；payload 在 `:1768-1775` 构造，渲染侧整体保存（`chat-store.ts:1885-1955`），未发现 localStorage/IndexedDB 持久化报告载荷的路径（见 F7 的字段清单遗漏）。
- 报告快照上限为 summary 16 KiB、单条 evidence 2 KiB、最多 32 条、快照 96 KiB（`src/common/runtime-core/report-provenance.ts:6`）；该限制与方案 §1.5/§4.6 的口径一致。
- 渲染 Markdown 的唯一管线是 `app/renderer/src/chat/markdown.ts` 的 `renderMarkdown`（`html:false`、图片转义、链接白名单）；`markdownHtml` 是 `ReportCard.tsx:41-43` 的局部 helper，不是 `markdown.ts` 的导出（见 F7）；`test/桌面UI/source-guard.test.ts:64-101` 的注入守卫允许 `markdownHtml(`/`renderMarkdown(`。
- `DecisionDialog` 当前用原始 `view.cardKind` 作 `Badge`（`app/renderer/src/chat/DecisionDialog.tsx:190-194`），`view.preview` 用 `<pre class="dd-preview">`（`:227-229`），`.dd-preview` 限高 260px（`phase4a.css:1605`）；方案 §4.2 的现状引用成立。
- i18n 精确计数测试当前为 `ui: 907 / main: 559 / shared: 62 / preferences: 3，总计 1531`（`test/项目管理/shared/i18n.test.ts:101-110`）；方案列出的 14 个 `ui.*` key 与 `921 / 1545` 的推算自洽。`ReportCard.tsx`、`DecisionDialog.tsx` 不在 `test/项目管理/shared/i18n-guard-allowlist.ts` 中。
- CSS 令牌 `--info`/`--info-bg`/`--info-border`/`--danger*`/`--selected`/`--text-2`/`--text-3`/`--radius-micro`/`--font-mono` 均在 `app/renderer/src/index.css` 定义（`:14-107`）；`theme-tokens.test.ts:33-43` 的扫描口径与方案要求一致。
- 交付批报告段是 `<section class="delivery-report">` 直接包 `ReportBody`（`ReportCard.tsx:369-379`），没有 `msg-handback` 外层；`is-blocked` 只在 `ReportCard` 外层按 `status !== "completed"` 添加（`:258-261`），`DeliveryCard` 不添加。方案 §4.5 的 `.msg-handback.is-acceptance` / `.is-blocked` 选择器不覆盖交付批位置（见 F5）。
- 已取消的 `full-report-display` 方案（P1.3，485 行，SHA-256 `258efa208a4d7d15d506673a2262a7fc5955e735f32775c2828647a3820c2cb5`）存在于本地快照 `e9e53a84…`（标签 `cancel-2026-11-02_full-report+run-change-uncommitted`）的未跟踪文件树 `93c3329d…` 中；其 §2.2 主张「交付卡默认展开报告全文与全部证据」、§4.2 的 Q-A 正是「验收卡呈现前把 `docs/quality/<flowId>-report-v1.md` 全文放进卡片展示数据」，其选装 O1（验收卡全文）在 2026-11-01 闸门 1 **未被明示纳入**，随后客户于 2026-11-02 取消两轮未提交修复并要求恢复 `HEAD c80f494`（`docs/communication/memo.md:156`、`docs/scheduling/memo.md:65`）。本次闸门 0（2026-11-02）重新提出客户侧验收决定卡（Q1 两者都要），与已取消方案的 O1 有实质重叠（见 F2）。
- 本次任务上下文明确「产品/测试无本任务改动」；复核未发现本任务产品代码改动，工作树只有 `docs/planning/memo.md` 修改与本方案/沟通记录。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 报告卡复用既有报告快照；决定卡复用 `enrichAcceptanceJudgeContext` 已有文件读取与 `protectText`，不新增第二读取路径/第二净化实现；应用私有可选字段是现有 IPC 载荷的最小增量。§2.3 已比较「报告存储」「只看 preview」「另读路径」三条备选并给出否决理由；Q5-A–D 也做了预算比较。未发现为「以后可能」新增模块或抽象。 |
| OD-2 必做与选装 | 发现 | 选装 O2/O4–O10 的编号、好处、代价、默认状态总体清楚，且明确「默认勾选不是批准」；但 **O1 被列为选装，实际是必做识别的唯一判据**：§2.1 主判据、§5 C1、§4.1 `isVerificationRole` 都使用 `builtIn === true && governanceFunction === "verification"`，而 §7 又说「本方案默认不实施任何选装」。若客户不选 O1，必做行为没有替代定义（F1）。 |
| OD-3 复用 | 发现 | 复用既有报告快照、既有报告文件读取、`protectText`、Markdown 单一管线、既有 i18n/主题令牌的方向正确；但未提及 2026-11-01 已取消的 `full-report-display` P1.3 及其 O1（验收卡全文）与本方案决定卡/报告卡展示的重叠，也未说明是否复用其已核实结论、为何不使用其 64 KiB 示例、为何不恢复其「全部交付卡默认展开」范围（F2）。 |
| OD-4 非目标 | 发现 | 非目标总体清楚（不改判定/路由/持久化/写权；不改 `[工作结果]` 模型输入；不改 WorkOverview 120 字列表；不读 `docs/quality/` 之外路径）；但 Q4「适用视图」的确认状态与 §11.3 第 7 项自相矛盾（F6），且任务面板 `TaskCenterPanel` 的 `task-report` 摘要未列入非目标/排除项（F8）。未发现超出闸门 0 的隐藏扩张；两处报告位置是否都做已作为客户确认项列出（§11.3 第 7 项）。 |
| OD-5 被否决的备选 | 通过 | §2.3 的三种来源备选与 §11.2 的 Q5-A–D 是真实比较，理由/代价可核对；未发现为凑「方案对比」编造备选。已取消方案的关系披露归入 F2，不另造备选。 |
| MK-1 目标 | 发现 | 目标可追溯到闸门 0 的「Q1 两者都要、Q2 徽标 + 全文 + 证据」；事实与设计候选有 `[现状]`/`[设计候选]` 标记。但「内置质检的职责本身就是验收」是推断而非已核实事实：`VERIFIER_CARD_TEXT` 明确写「可选质量核对与验收执行者」，同一角色的非验收质量核对报告也会被标成「独立验收报告」（F3）；§11.1 把 Q4 说成「由 Q2 回答」也与闸门 0 未逐字确认质检自身回交视图不一致（F6）；另有引用/字段清单不准确（F7）。 |
| MK-2 完整流程与失败分支 | 发现 | 成功路径（两处报告卡、决定卡）、失败路径（报告缺失/不可读/无 flowId/旧卡/超长/判断代批）与降级均有说明，两个实际报告卡位置均覆盖；但交付批的验收冷色/危险色选择器不适用（F5），`request.preview` 在报告存在时默认折叠可能隐藏 verifier 的卡面结论（F12），任务面板的摘要行未说明（F8）。未发现流程级断路。 |
| MK-3 输入输出 | 发现 | 报告卡输入（快照 summary/evidence）、决定卡输入（请求快照 + 报告文件）、输出（徽标/标题/原文/证据/路径/flags）及字段含义基本可核对；`AcceptanceReportDisplayV1` 形状明确。但 preview 与报告文本的优先级/折叠只在 §4.2 描述，未进入 C2 契约的「保证/非保证」表（F10），且默认折叠策略有信息可见性风险（F12）。 |
| MK-4 契约 | 发现 | C1–C5 覆盖身份、载荷、文件来源、普通卡不回归、验收语义不变，提供方/消费方/失败/版本基本清楚；但 C2 未写明「报告文本优先、preview 折叠/降级」的展示优先顺序，§3.4 只给了桌面侧 `AcceptanceReportDisplayV1`，渲染侧 `AcceptanceReportView` 的结构/防御边界未定义（F10）。未发现与现有报告/验收契约冲突的共享 Model 变更。 |
| MK-5 完成标准 | 发现 | AC-1–AC-14 可逐条核对，覆盖两个卡、普通卡不回归、i18n、旧 payload、超长/缺失/不可读、回放与语义零变化；但 AC-5/AC-6/AC-7 的桌面层证据没有明确映射到走 `withRequestLifecycle`/`enrichAcceptanceJudgeContext` 的 SessionManager 测试（现有 `optional-acceptance.test.ts` 直接测 `createCustomerInputChannel`，绕过 enrich），也缺显式的路径穿越/非法 flowId 负例（F4、F9）。 |
| MK-6 风险与未决事项 | 发现 | 风险表覆盖误标、文件缺失/滞后、敏感信息、超长、危险色冲突、i18n、角色列表闪烁与语义误读；但未披露与已取消 `full-report-display` 的关系（F2）、路径安全依赖上游 flowId slug 校验（F9）、报告文件未经认证/可伪造的风险（F11）。未发现隐藏假设被写成客户承诺。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 过度设计 | **重要** | §2.1、§5 C1、§4.1 `isVerificationRole`、§7 O1、§11.3 第 6/8 项 | O1 被写成「默认推荐的选装」，但它的判据就是必做识别的唯一判据；§7 又声明「本方案默认不实施任何选装」。若客户不勾选 O1，必做的验收报告卡与决定卡身份没有可执行的替代定义，方案自相矛盾。 | 方案 §2.1「主判据」；§5 C1；§4.1 第 1 条；§7 O1；§7 开头规则；§11.3 第 6、8 项 | 把「只对内置质检生效」移入 §2.1/§5 作为必做设计条款（不再是选装），从 §7 删除 O1 或改为「已并入必做的识别说明」；§11.3 第 6 项改为知悉/确认项而非选装勾选；若保留选装编号，需重排 O2–O10 并同步 AC/清单。 |
| F2 | 漏重点 | **重要** | §1.4、§8、§14；与本方案决定卡/报告卡展示相关 | 方案未提及 2026-11-01 已取消的 `full-report-display` P1.3：其 §2.2 是「全部交付卡默认展开全文 + 全部证据」，其 §4.2 Q-A 正是把 `docs/quality/<flowId>-report-v1.md` 全文放进验收卡展示数据，选装 O1（验收卡全文）在 2026-11-01 闸门 1 未被明示纳入，随后客户取消并恢复 `HEAD c80f494`。本次闸门 0 重新要求客户侧验收决定卡（Q1 两者都要），与已取消 O1 实质重叠；方案既没有说明「本次是新授权、不是复用旧确认」，也没有说明为何只做验收报告而不恢复已取消的「全部交付卡默认展开」。 | `docs/communication/memo.md:156`；`docs/scheduling/memo.md:65`；本地快照 `e9e53a84…` 的未跟踪文件树 `93c3329d…` 中 `docs/planning/2026-11-01_design_full-report-display.md`（485 行 / SHA-256 `258efa20…`）§2.2、§4.2、§10 第 6 项 | 在 §1.4 非目标/§8 风险/§14 参考中明确：本方案不恢复已取消的 `full-report-display` 全部交付卡默认展开，也不复用其闸门 1/2 确认；本次客户侧验收决定卡是 2026-11-02 闸门 0 的新授权，按新闸门 1 确认；说明与已取消 O1 的差异（16 KiB vs 64 KiB 示例、只限验收、普通卡不变）。如作者认为不应引用快照中的文件，至少在方案中记录「已知存在已取消的同类方案，本方案按新意图重新确认」。 |
| F3 | 漏重点 | **重要** | §2.1「为什么本版不加显式 marker」、§1.5「验收报告卡」、§4.1 第 3 条、AC-1 | 识别判据把「所有内置质检的报告」等同于「验收报告」。`VERIFIER_CARD_TEXT` 的职能是「可选质量核对与验收执行者」，同一 verifier 也可能提交非验收的质量核对报告；这些报告会被标成「独立验收报告」，并显示「验收决定 / 由客户在验收决定卡作出；报告本身不构成通过」——对没有验收决定卡的质量核对报告是误导。方案用「内置质检的职责本身就是验收」来支撑，但这是推断，不是已核实事实。 | `src/common/门禁引擎/governance-roles.ts:234-246`（`VERIFIER_CARD_TEXT`）；方案 §2.1 末段；§4.1 第 3 条 `acceptanceDecision` 文案；AC-1 | 二选一：（a）把这一限制写成显式假设/已接受限制，并在 AC-1 增加「非验收的 verifier 质量核对报告如何显示」的边界用例与客户可见说明；（b）增加一个便宜的判别（例如报告 `taskId` 关联的任务是否验收任务、或在可信任务事实上生成应用私有 `reportKind`），但后者会扩大契约/升档，需按 §8.1 处理。至少不要把「角色身份 = 验收任务」写成已核实事实。 |
| F4 | 漏重点 | 一般 | §10.1、§10.2、AC-5/AC-6/AC-7 | 决定卡报告载荷的测试面没有明确映射到 `enrichAcceptanceJudgeContext` 的真实调用链。`test/桌面应用/optional-acceptance.test.ts` 直接构造 `createCustomerInputChannel`（`:200-237`），不会执行 `withRequestLifecycle`/`enrichAcceptanceJudgeContext`；方案只说「桌面测试的 presenter payload」和「必要的新测试文件需先确认写集」，没有点名一个 SessionManager 级测试来证明「文件内容 → 16 KiB 投影 → `payload.acceptanceReport`」。超长（>16 KiB）、不可读、无 flowId 的文件夹具也没有明确落在哪个测试。 | `test/桌面应用/optional-acceptance.test.ts:200-237`；`test/桌面应用/acceptance-evidence.test.ts:215-240`（现有 SessionManager 夹具）；方案 §10.1「桌面通道/载荷」「桌面投影」、§10.2 临时项目夹具、AC-5–AC-7 | 明确新增或扩展一个 SessionManager 级桌面测试（例如扩展 `acceptance-evidence.test.ts` 或新增 `test/桌面应用/acceptance-return-card.test.ts`，写集经闸门 2 确认），直接捕获 `ctx.acceptanceReport` / presenter payload；覆盖：正常文件、>16 KiB 截断 flag、空/缺失、不可读、无 flowId、旧 payload 无字段；把 AC-5–AC-7 的证据链接指向该测试，而不是只指向 channel 级测试。 |
| F5 | 漏重点 | 一般 | §4.1 第 5 条、§4.5 CSS、§1.2.1「冷色边框」「危险色优先」 | 交付批的报告段是 `<section class="delivery-report">` 直接包 `ReportBody`，没有 `.msg-handback` 外层；`is-blocked` 只在 `ReportCard` 外层添加，`DeliveryCard` 不添加。方案计划的选择器 `.msg-handback.is-acceptance` / `.msg-handback.is-acceptance.is-blocked` 不会作用于交付批位置，交付批可能只有 `report-top` 的冷色头部/徽标，没有承诺的冷色边框；blocked/failed 的危险色也不会在交付批生效。另外 `DecisionDialog` 的高风险/破坏性边框（`phase4a.css:1592-1593`）可能被后置的 `.decision-dialog.is-acceptance` 覆盖，方案没有写危险色优先。 | `app/renderer/src/shell/ReportCard.tsx:258-261`、`:369-379`；`phase4b.css:639-645`；`phase4a.css:1592-1593`；方案 §4.1 第 5 条、§4.5 | 明确为交付批报告段加 `delivery-report.is-acceptance`/状态类并补对应 CSS（或让 `ReportBody` 自身带状态类），保证两个报告位置的冷色边框/危险色优先一致；为决定卡补 `.decision-dialog.is-acceptance.is-high-risk`/`.is-destructive` 的危险色优先规则；在 AC-1/AC-10 中分别断言两处位置。 |
| F6 | 漏重点 | 一般 | §11.1 Q4 行、§11.3 第 7 项、§7 O7 | §11.1 写 Q4「由 Q2 回答」，把「报告出现的所有视图」当成已确认；但闸门 0 Q1 的原文是「verifier 验收报告返回幕僚的报告卡 + 客户侧验收决定卡」，Q4「只幕僚视图还是所有视图」没有被逐字确认，§11.3 第 7 项也仍在请客户在「所有出现位置」与 O7「只幕僚视图」之间选择。把质检自身回交视图写成已由 Q2 回答，会高估确认范围。 | 闸门 0 记录 Q1/Q2/Q4 与「Q3/Q4 已由上述选择回答」；方案 §11.1、§11.3 第 7 项、§7 O7 | 把 §11.1 Q4 改成「闸门 0 未逐字确认；本方案推荐所有报告出现位置（两个位置），并作为 §11.3 第 7 项请客户确认；O7 是替代」。这样既保留两处一致的推荐，也不把未确认内容写成已确认。 |
| F7 | 漏重点 | 建议 | §2.3 末段、§4.3 第 1 段、§4.2 第 3 条 | 引用/表述不准确：（1）`phase-e` 演示无 `preview` 的实际位置是 `test/测试/phase-e-governance-demo.mjs:325-334`，不是方案所引的 `:499-508`；（2）§4.3 说 `OperatorRequestPayload`「只带 request/roleId/projectRoot/runtime/turnId/toolCallId/judgeNotice」，实际还有必填 `anchorKey` 与可选 `mirrorRoleId`（`customer-input.ts:96-122`）；（3）§4.2 说 `markdown.ts` 有 `renderMarkdown`/`markdownHtml`，实际 `markdownHtml` 是 `ReportCard.tsx:41-43` 的局部 helper，`markdown.ts` 只导出 `renderMarkdown`。这些不影响设计结论，但会误导实施者。 | `test/测试/phase-e-governance-demo.mjs:325-334`；`app/desktop/customer-input.ts:96-122`；`app/renderer/src/chat/markdown.ts:98-100`；`app/renderer/src/shell/ReportCard.tsx:41-43` | 更正三处引用/字段清单；实现时按实际导出使用 `renderMarkdown` 或两处各自的局部 `markdownHtml`。 |
| F8 | 漏重点 | 建议 | §1.4 Out of scope | 非目标列了 WorkOverview 的「最近交付」120 字摘要，但没有列任务面板 `TaskCenterPanel` 的 `task-report` 行（`TaskCenterPanel.tsx:248-250` 显示 `task.lastReport.status/summary`）。该行是任务回执短摘要，不是 `ReportBody` 报告卡；按本方案范围应不显示验收样式，但需要明确写出，否则「报告出现的其他位置」检查会留下未解释项。 | `app/renderer/src/chat/TaskCenterPanel.tsx:248-250`；`src/common/编排/task-state.ts:569-599`；方案 §1.4 | 在 §1.4 非目标中补一句「任务面板的 task.lastReport 短摘要不是报告卡，保持现状」；若客户希望该列表也标验收，另列选装。 |
| F9 | 漏重点 | 建议 | §2.3、§4.3、§4.6、§10 | 方案强调「不读任意路径」，但没有写出路径安全所依赖的上游事实：`docs/quality/<flowId>-report-v1.md` 的 `flowId` 来自 `request.flowId ?? metadata?.flowId`（`session.ts:3660`），而治理角色发卡前的 `flowId` 必须匹配 `GOVERNANCE_SLUG_PATTERN`（`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`），非法/缺失在 `run-role.ts:977-1018` 被拒。该依赖目前成立，但方案没有把它写成假设/风险，也没有负向测试。 | `src/model/runtime.ts:364`；`src/pipeline/orchestration/run-role.ts:977-1018`、`:1916`、`:1971`；`app/desktop/session.ts:3660-3676` | 在 §2.3/§4.6 写明「路径安全依赖上游 flowId slug 校验；本方案不新增 flowId 校验」；在桌面测试补一个非法 flowId/异常路径的负例（要么在上游被拒、要么 enrich 不拼出 `docs/quality/` 之外的路径），并确保不实际读项目外文件。 |
| F10 | 漏重点 | 建议 | §4.2、§5 C2、§3.4 | C2 的「非保证」提到 preview 与报告可能不一致，但没有把「报告文本优先、preview 折叠/降级」的展示优先顺序写成契约保证；§3.4 只定义了桌面侧 `AcceptanceReportDisplayV1`，渲染侧 `AcceptanceReportView` 的结构与防御读取范围没有给出（实施者需要自行猜一个本地类型）。 | 方案 §4.2 第 2 条、§5 C2、§3.4 | 在 C2 增加一行展示优先级：「有合法 `acceptanceReport` ⇒ 报告文本为主、preview 按 §4.2 折叠/去重；无 ⇒ preview 按现状显示」；在 §4.2 给出 `AcceptanceReportView` 的渲染层结构定义（或明确它只是 `acceptanceReport` 的防御读取结果，不新增共享类型）。 |
| F11 | 漏重点 | 建议 | §1.2.2、§4.6、§8.2、O6 | 决定卡显示的 `docs/quality/<flowId>-report-v1.md` 是 verifier 模型写入的文件，应用没有认证其内容；报告文本可能包含与 `submit_report` 摘要不一致的结论或误导性文字。方案已把它标为「报告」并保留「不是通过」的免责声明，但风险表没有单独披露「报告文件内容未经认证/可伪造」，O6（哈希）也未选。 | 方案 §1.2.2、§4.6、§8.2、§7 O6；`governance-roles.ts:238-246`；`session.ts:3673-3699` | 在 §8.2 增加一行「报告文件由质检写入、应用只做安全投影，不认证内容；是否接受以决定卡与客户判断为准」，并说明 O6（SHA-256）是可选审计缓释；如客户担心伪造，再考虑把报告文件与 `submit_report` 摘要的差异显式提示。 |
| F12 | 漏重点 | 一般 | §1.2.2、§4.2 第 2 条、§11.3 第 3 项 | 报告存在且与 `request.preview` 不同时，preview 默认收进「验收卡说明」`<details>`（关闭）。preview 是 verifier 自己写的卡面说明，可能包含报告文件里没有的结论/建议；默认折叠可能把关键结论藏到第二层，而客户本次要求是「原文直出」，不是「隐藏卡面说明」。 | 方案 §1.2.2、§4.2 第 2 条、§11.3 第 3 项；`DecisionDialog.tsx:227-229` | 建议保留 preview 的首行/结论在可见区（或将 `request.preview` 作为「验收卡说明」始终显示在报告原文上方），只在 preview 与报告文本规范化后完全重复时才折叠；在 AC-5 增加一个 preview 含唯一结论 marker 的用例，确认 marker 在默认视图中可见。 |

## 复核结论

**建议修订后提交。**

方案的核心方向成立：报告卡复用既有报告快照、决定卡复用 `enrichAcceptanceJudgeContext` 已有文件读取与既有 `protectText`/Markdown 安全管线，没有改变验收判定、路由、持久化或写权；闸门 0 的 Q1/Q2 与方案主体一致；代码引用绝大多数在 HEAD 上复核成立；未发现「暂不建议提交」级别的关键信息缺失或与闸门 0 意图明显不一致。

但有三项 **重要** 发现会影响客户决策、确认范围或用户可见语义，建议在闸门 1 前先修订：

1. **F1**：O1 是必做识别的唯一判据，却被写成选装；必须把「只对内置质检生效」并入必做设计，或给出不选 O1 时的可执行替代。
2. **F2**：未披露与 2026-11-01 已取消 `full-report-display` P1.3（及其未选 O1）的重叠；本次客户侧验收决定卡是 2026-11-02 闸门 0 的新授权，必须在方案中说明不复用旧确认、不恢复旧范围。
3. **F3**：把「所有内置质检报告」等同于「验收报告」与 `VERIFIER_CARD_TEXT`（可选质量核对与验收执行者）不完全一致；应写成显式假设/已接受限制，或增加判别与边界用例。

F4–F6、F12 为 **一般** 级，影响验收证据映射、交付批/决定卡的危险色优先与 preview 可见性；F7–F11 为 **建议** 级，主要是引用准确性、非目标补充、路径安全假设与报告文件未认证风险的披露。作者可按复核规则 §9 逐项处置（采纳/部分采纳/不采纳并记录理由）；未解决意见由沟通在闸门 1 材料中如实披露，由客户决定。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未运行任何测试、未启动应用、未做 Electron 冒烟/e2e、未截图；本记录所有结论来自 HEAD `5a35908` 的静态阅读与 `git show` 只读检查。未验证真实渲染、焦点/滚动、200%/窄屏、主题对比度或 `TextEncoder` 在目标 Electron 渲染进程中的实际行为。
- 未逐行读完 `app/desktop/session.ts`、`app/desktop/customer-input.ts`、`src/pipeline/orchestration/run-role.ts`、`app/renderer/src/chat/chat-store.ts` 等大文件；只读了与报告卡、验收卡、`enrichAcceptanceJudgeContext`、payload、i18n、CSS、测试相关的段落。
- 未执行 i18n 计数测试；只按 `i18n.test.ts:101-110` 的当前计数与方案列出的 14 个 key 做静态推算。未验证新增 key 的占位符在运行时实际替换；未执行 `i18n-guard.test.ts`。
- 未验证 Windows 下「不可读报告文件」夹具的具体制造方式（权限/占用/路径类型），也未验证空文件、只含空白、超大文件（>1 MiB）的实际读取行为；Q5-D 的 1 MiB 上限未实施。
- 未验证 `acceptanceTriage` 前闸的运行时接线：全仓 grep 只在 `app/desktop/customer-input.ts` 与 `app/desktop/interface.ts` 注释中找到 `acceptanceTriage`，未发现 `opts.acceptanceTriage` 的注入点；若未来/外部接线存在，验收卡可能先被应用自有三方卡替换，本方案的 `acceptanceReport` 是否/如何显示在该三方卡上未检查。
- 未验证旧版本 `OperatorRequestPayload`、旧 `cardKind` 只在 metadata 的卡、single/su 模型或历史项目中的 acceptance 卡行为；只按方案的分支表静态判断。
- 未验证已取消 `full-report-display` 的实际工作树实现：本地快照 `e9e53a84…` 的 diff 未显示 `ReportCard.tsx`/`DecisionDialog.tsx` 改动（只有 i18n、`run-manifest.ts`、i18n 测试与角色卡记录），本记录只按其方案文档判断重叠；未运行、未恢复、未使用快照代码。
- 未核对角色卡/边界 Section 1 对 `app/desktop/session.ts`、`app/desktop/customer-input.ts`、`app/renderer/**`、i18n 与测试文件的精确写权归属；T2 档位与写集由闸门 2/团队计划决定，本记录不判断。
- 未检查 `app/renderer/dist/**` 等构建产物是否与源码同步；未检查发布/打包影响。
- 复核记录按沟通指定与方案 §11.4 写入 `docs/planning/2026-11-02_review_acceptance-return-card.md`；复核规则 §2 对本仓库的覆盖路径写作 `角色卡/策划/docs/design/`，两者不一致。若治理要求以覆盖路径为准，请沟通在归档/闸门 1 材料中移动或引用本记录，本记录不另建第二份并存记录。

**未解决意见：**

1. 客户侧验收决定卡是否显示报告路径（O3）、是否采用 16 KiB 预算（Q5-A）、冷色蓝是否符合期望（§11.3 第 1/2/5 项）属客户决策；复核不替客户选择。
2. 质检自身回交视图是否也要特殊显示（Q4/O7）尚未被闸门 0 逐字确认；本复核建议按 §11.3 第 7 项如实请客户确认，不把两处一致写成已确认。
3. verifier 的非验收质量核对报告是否应显示「独立验收报告」身份，属产品语义决策（F3）；若作者选择接受该限制，需要在方案中写明并由客户知悉。
4. 报告文件未经认证的风险是否需要在本次披露/缓释（F11/O6）由作者与客户决定；复核不要求新增哈希功能。
5. 若实施中需要改共享 Model、报告快照、`request.resolved`/`customer.decision`、验收路由或新增公共导出，本方案声明的 T2 与「不改共享契约」不再成立，应按 §8.1 升 T3 并重新确认；本复核不预先批准任何升档。
6. 本复核不改变五个内置管理角色、闸门 0→1→2 顺序、实现提案审核或独立验收流程；作者不得以本记录替代客户确认或实施授权。

## 再复核记录（如发生）

P1.0 的复核内容保持不变；以下为 P1.1 受影响部分的窄复核。

### P1.1（2026-11-02）

- 复核版本：`docs/planning/2026-11-02_design_acceptance-return-card.md` **P1.1**，855 行，SHA-256 `59cd7ea0f899ddffdc7e1dc118bc19cddb2ef2bf962059269edb8307efbe4fce`（按该快照只读；未改方案正文）
- 复核范围：F1–F12 的处置与受影响章节（§0、§1.2–§1.6、§2.1、§2.3、§3.3、§3.4、§4.1–§4.6、§5 C1–C3、§7、§8.1–§8.2、§9 AC-1/AC-5/AC-6/AC-7/AC-9/AC-10、§10.1–§10.3、§11.1、§11.3、§12、§13、§14）；未重读 P1.0 未受影响章节的全文。
- 复核方法：先读 §12 的逐项处置，再核对对应正文位置；用只读检索检查 O1–O10 重排是否有悬空引用、`isGovernanceFlowId`/`GOVERNANCE_SLUG_PATTERN` 的实际导出、`acceptanceReportPath` 的可选性、沟通/scheduling memo 的实际行号；未运行测试/应用，未修改方案。

**F1–F12 处置更新**

| 发现 | 状态 | 窄复核说明 |
| --- | --- | --- |
| F1 | 关闭 | §2.1/§4.1/§5 C1 已把「只对内置质检生效」写成必做条款；§7 原 O1 删除，O1–O10 重排；§11.3 第 6/8 项改为知悉/确认。逐项核对重排：O1=全部卡种本地化、O2=报告路径、O3=证据展开、O4=旧 `docs/acceptance/` 路径、O5=SHA-256、O6=只幕僚视图、O7=字号、O8=绿色、O9=交付批外层、O10=任务级判别；§2.3 的 O4、§4.2/§4.4 的 O1、§4.6/§8.2 的 O5、§11.3 的 O2/O6 均指向正确。未发现旧 O1 的悬空选装引用（§1.6「P1.3 的 O1」、§12「原 O1」为历史说明）。 |
| F2 | 关闭（附 N2） | §1.6 新增，明确 2026-11-02 闸门 0 是新授权、不复用 P1.3 闸门 1/2 确认、不恢复全部交付卡默认展开、16 KiB vs 64 KiB、不使用快照代码；§1.4 非目标、§8.2 风险表、§14 参考同步。未发现隐含复用旧确认的表述。N2：§1.6/§14 引 `docs/communication/memo.md:157`，实际「同日早前」条当前在 :159；建议更新行号（沟通记录可能再增行，最好引用小节名）。 |
| F3 | 关闭（附 N3 建议） | §2.1 已写显式已接受限制；§1.2.1 边界行、§1.5 定义、§8.2 风险表、AC-1、§11.3 第 6 项、O10 一致；§4.1 的验收决定行改为「验收决定（如适用）/若本次为验收任务……」。N3（建议）：`ui.reportCard.acceptanceDisclaimer` 仍无条件写「是否验收通过以验收决定卡为准」，对没有验收决定卡的非验收质量核对报告可加「如本次为验收任务」/「如适用」，与报告事实行的条件措辞一致；不阻断。 |
| F4 | 关闭 | §10.1 新增「桌面 SessionManager 级（必做）」并明确 channel 级测试不能单独证明 AC-5–AC-7；§10.2 新增 SessionManager 夹具（正常/超长/空缺失/不可读/无 flowId/非法 flowId/旧 payload）；§10.3 增加 `acceptance-evidence.test.ts` 命令；AC-5/6/7 均指向 SessionManager 级证据。 |
| F5 | 关闭 | §4.1 第 5 条给 `delivery-report` 加 `is-acceptance`/`is-blocked`；§4.5 增加 `.delivery-report.is-acceptance`、`.is-blocked` 及 `.report-top` 危险背景，并增加 `.decision-dialog.is-acceptance.is-high-risk`/`.is-destructive` 危险色优先；AC-1/AC-10 增加两处位置/危险态断言。交付批视觉是左边条+头部背景（不是回交行的完整边框），与「两处一致」的文字略有差异，但不影响身份/危险色表达；建议实施时统一视觉描述。 |
| F6 | 关闭 | §11.1 Q4 改为「闸门 0 未逐字确认」，推荐所有报告出现位置并指向 §11.3 第 7 项；§11.3 第 7 项以 O6（只幕僚视图）为替代；O6 编号与正文一致。 |
| F7 | 关闭 | §2.3 的 phase-e 夹具改为 :325-334；§4.3 现状段补 `anchorKey`/`mirrorRoleId`；§4.2 第 3 条改为 `markdown.ts` 只导出 `renderMarkdown`、`markdownHtml` 是 ReportCard 局部 helper；§13 同步。 |
| F8 | 关闭 | §1.4 非目标新增 TaskCenterPanel `task.lastReport` 短摘要行；§13 新增对应只读核实行。 |
| F9 | 闭合（附 N1/N4） | 设计意图已落入：§2.3/§4.3/§4.6/§10.2/AC-6/AC-9/§13 均写「构造路径前校验 flowId slug，非法/缺失不构造/不读取/fail-closed」，并补非法 flowId/越界读取负例。N1：`isGovernanceFlowId` 实际是 `run-role.ts:1918` 的私有函数，`src/model/runtime.ts:364` 只有 `GOVERNANCE_SLUG_PATTERN`；§2.3/§4.3 的「用 isGovernanceFlowId/GOVERNANCE_SLUG_PATTERN（runtime.ts:364）」表述不准确，应改用 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)` 或项目内同口径 helper；若抽共享导出则新增公共导出、按 §8.1 升 T3。N4：§4.3 第 1 条「不得改变 facts.qualityReportPath/unavailableReason/artifacts 的现有语义」与「非法/缺失 → 按缺失处理」存在未限定的冲突；对非法 flowId，新守卫会把原本可能设置的 qualityReportPath/acceptanceReportPath 改为缺失，并可能改变 unavailableReason。建议限定为「合法 slug 卡不改变；非法/缺失卡按 fail-closed 缺失处理是新增保护」，并明确 `acceptanceReportPath` 是可选字段（`src/model/runtime.ts:1640`）、可省略，不需要改共享 Model；加测试断言非法 flowId 的 judgeContext。 |
| F10 | 关闭 | §3.4 定义渲染层本地 `AcceptanceReportView`（不新增共享类型）；§5 C2 新增展示优先级行（报告原文为主、preview 始终可见/重复去重、缺失走 preview）；§4.2 按此实现。 |
| F11 | 关闭 | §4.6 新增内容认证行；§8.2 新增报告文件未认证/可伪造风险；O5（SHA-256）为可选缓释；§12 F11 同步。 |
| F12 | 关闭 | §1.2.2/§3.3/§4.2 改为 preview 始终显示在报告原文上方（纯文本、完全重复才去重、不默认折叠）；C2 展示优先级、AC-5 preview marker、§11.3 第 3 项一致。 |

**新发现（P1.1 窄复核）**

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | 漏重点 | 一般 | §2.3 路径安全段、§4.3 第 1 条 | `isGovernanceFlowId` 不能从 `src/model/runtime.ts` 导入；方案把 `isGovernanceFlowId` 与 `GOVERNANCE_SLUG_PATTERN` 并列并只引 `runtime.ts:364`，实施者若照做会找不到导出。 | `src/pipeline/orchestration/run-role.ts:1916-1918`（私有函数）；`src/model/runtime.ts:364`（只导出 `GOVERNANCE_SLUG_PATTERN`）；`app/desktop/requirement-change.ts:21`、`:99-100` 用 pattern 构造 RegExp 的既有先例 | 改为 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)` 或项目内同口径本地 helper；不要新增共享导出；若确需共享 helper，按 §8.1 升 T3。 |
| N2 | 漏重点 | 建议 | §1.6、§14 | 引用 `docs/communication/memo.md:157`，实际「同日早前」条当前在 :159；沟通记录刚有增行，行号易漂移。 | `grep -n '同日早前' docs/communication/memo.md` = 159；§1.6/§14 均写 157 | 更新为 :159 或引用小节名/日期+摘要；§12 F2 的「§14 参考」无需改语义。 |
| N3 | 漏重点 | 建议 | §4.4 `acceptanceDisclaimer`、§1.2.1 边界行、AC-1 | F3 已接受限制下，非验收质量核对报告可能没有验收决定卡；免责声明仍无条件写「是否验收通过以验收决定卡为准」。报告事实行已用「如适用/若本次为验收任务」，两处措辞不完全一致。 | 方案 §4.4 行 419；§4.1 行 346；F3 限制段 | 免责声明加「如本次为验收任务」/「如适用」，或明确该句只是总政策；不阻断。 |
| N4 | 漏重点 | 一般 | §4.3 第 1 条 vs §2.3/§4.3 第 2 条、§8.1 | 「不得改变 facts.qualityReportPath/unavailableReason/artifacts 的现有语义」与「非法/缺失 flowId → 按缺失处理」未限定范围；对非法 flowId，新守卫会把原本可能设置的 qualityReportPath/acceptanceReportPath 改为缺失，并可能改变 unavailableReason。`acceptanceReportPath` 是可选字段，可省略，不需要改共享 Model（T2 仍成立），但方案应写明这是对异常输入的新保护而不是「零语义变化」。 | `app/desktop/session.ts:3760-3817`（facts/artifacts 构造）；`src/model/runtime.ts:1630-1643`（artifacts 可选）；方案 §4.3 行 395、§2.3 行 182、§8.1 行 641 | 把「不得改变」限定为合法 slug 卡；明确非法/缺失卡的 facts/artifacts 省略/缺失处理及 `unavailableReason` 影响；补 SessionManager 测试断言非法 flowId 的 judgeContext；如作者认为该影响需要客户知悉，在 §8.2/§11.3 披露。 |

**再复核结论**

**建议提交客户确认。** F1–F3 已关闭；F4–F6、F12 已关闭；F7–F8、F10–F11 已关闭；F9 的防护设计已落入，但存在 N1/N4 的非阻断落地澄清。未发现新的重要发现或与闸门 0 意图不一致；N1/N4 为一般、N2/N3 为建议，均可在闸门 1 前由作者顺手修正，不改变客户可见行为/验收语义，不构成重新完整复核的理由。若沟通希望闸门 1 材料零悬空引用，可先让作者更新 N1/N2/N3/N4 再提交；本复核记录不阻止提交。

**修订后引用更新（必做）**：本记录在本节追加后行数/哈希会变化（P1.0 部分仍保留 103 行 / `5e4231…` 的历史引用）；P1.1 的 §8/§11.4/§12/§14 对「复核记录 103 行 / `5e4231…`」的引用应在闸门 1 前由作者更新为本记录的新行数/哈希，或明确区分「P1.0 复核记录快照」与「P1.1 再复核记录」。沟通核对版本时不要用旧哈希当新版本复核。

**限制**：本轮只读静态；未运行测试/应用/Electron；未重读 P1.0 未受影响章节全文；未验证 `isGovernanceFlowId` 抽取/`GOVERNANCE_SLUG_PATTERN` 的实际实现选择；未验证非法 flowId 的 judge 路径实际表现；未验证 F3 免责声明在真实卡片上的可读性；未重新验证已取消 P1.3 的实际实现（仅文档/快照）；memo 行号可能随沟通记录继续变化。原 P1.0 的未检查事项/限制仍适用。
