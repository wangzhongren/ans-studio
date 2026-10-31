# shell 判拒后客户确认通道方案复核记录

- 复核对象：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（v1.0，754 行；内容哈希 SHA-256 `620a41a564aac916ecbd6f2b44aa1ef3575a72f0900639768c00f63b4a1c59f1`）
- 窄复核对象：同一文件 v1.1（818 行；复核上下文报告 SHA-256 `74d49c78c143698d19aa4faca0e1b31091d70de949913806f70faf0f88c3ba7c`）；第二轮窄复核对象 v1.2（840 行；SHA-256 `f3fe95f5dcae1983dbe6f7aa7db8a335010f1775301a6304ea3cebf2cb91ccb2`）；确认性窄复核对象 v1.3（857 行；SHA-256 `b395c6587f33ded5c3857f51e4806c8c2bfc177ca2b270b514b3c863c8fec0ca`）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：跨门禁引擎/编排/Pipeline/运行时核心/桌面窗口/桌面UI/共享 i18n，新增共有契约与 IPC/卡片面，涉及审批/权限语义，风险 T3；不属轻量）
- 复核上下文：同一策划角色（Planning）的独立只读子代理上下文（不继承作者对话；只读方案、闸门 0、代码、测试与边界；不写任何文件）
- 闸门 0 记录：`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（49 行，SHA-256 `74e0596cc757dd773b197e6acf4f572988f4b0a87c31c4b2a60f480bfff06b1d`）
- 复核日期：2026-10-31
- 代码基线：worktree `flow-improvements-wave1` HEAD `9f670fb2c7d403baf995071055d697c50714c905`
- 记录说明：本记录由复核上下文产出发现、作者（策划）只读整理落盘；作者不改写复核发现。作者处置见方案 §14。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 三层改动（判拒升级/白名单/回执与暂停）逐项对应闸门 0 已确认意图；新增 `shell-escalation` 模块、申请工具、升级卡与暂停均为实现这些目标所必需，没有为「以后可能」新增治理角色或第二套审批。F4/F11 是成本与契约被低估，不是方向性过度设计。 |
| OD-2 必做与选装 | 通过 | §11 O1–O10 有稳定编号、收益/代价/默认状态，必做与选装分节；没有把选装冒充批准。但 routine-shell-policy 扩展（F2/F3/F13）应按「行为变更/客户确认」处理，不能视为无代价重构。 |
| OD-3 复用 | 发现 | 方案宣称复用既有确认卡核心、routine 委托、argv 规范化与审计 sink，但：routine 委托在桌面项目角色路径已生效（F2）；跨角色导入 `matchRoutineShellCommand` 不合法且写集缺 `shell-rules.ts`（F3）；`confirm-card.ts` 布尔核心的改动未入写集且影响恢复卡（F4）。 |
| OD-4 非目标 | 发现 | 非目标本身清楚；但暂停默认「本次运行/全局」超出闸门 0 的「本会话暂停」（F6），代码级白名单覆盖自定义规则集的 risky 分类未列为闸门 1 确认点（F13）。方案有 Q5/O8 提示，但默认设计仍应按未确认处理。 |
| OD-5 被否决的备选 | 通过 | §6.5(a)(b)(c)(d)(e) 对呈现面、触发方式、作用域/键、白名单口径、暂停粒度做了真实比较，给出代价与否决理由，未发现为凑「方案对比」编造备选。 |
| MK-1 目标 | 发现 | 目标可追溯到闸门 0，但现状断言有事实错误：§3.1 把 c=deny 写成所有路径终结，而项目角色默认 advisory（F1）；§3.3/§3.9 称 routine 委托在日常桌面路径不生效，实际已生效（F2）；暂停作用域三种说法并存（F6）。事实与推断未完全分开。 |
| MK-2 完整流程与失败分支 | 发现 | 有流程图和分支表，超时/通道不可用/窗口关闭/会话重建/并发/重复回包均有提及；但 advisory c=deny 非终结与 takeGrant 插入点不可落地（F1）、`start_background_task` 未覆盖（F5）、retry-capped 无客户可见结果行（F7）、旧判拒记录不清除（F12）。 |
| MK-3 输入输出 | 发现 | 工具入参、卡片字段、决定、回执、审计字段有表；但 `ShellEscalationFn` 缺 argv、`ShellReviewRequest` 缺 roleId（F10），`escalation-decision` 审计记录必填字段与 sink 共享未定义（F11）。 |
| MK-4 契约 | 发现 | 有固定契约章节、提供方/消费方与版本；但跨角色导入合法性（F3）、`manualAsDeny` 不在共享 `ShellJudgeAudit`（F9）、branch/by 区分口径与现有形状不符（F8）、共享审计 sink 未落地（F11）均属契约缺口。 |
| MK-5 完成标准 | 发现 | P1–P12/G1–G5 可核对且证据规则正确；但 P8 覆盖不到 retry-capped 的客户面（F7），P5 的 branch/by/凭据口径与现有审计不符（F8），§5.4 测试路径与负例清单有误（F14），新卡片并发覆盖缺验收（F4）。 |
| MK-6 风险与未决事项 | 发现 | 有风险 1–10 与 Q1–Q10；但缺「暂停影响治理 approval 组/窗口重建丢暂停」（F6）、「自定义规则集 risky 被覆盖未确认」（F13）、「旧判拒记录不清理」（F12）、「版本号不一致/测试路径」（F14）等。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | 重要 | §3.1 表 3-1、§4.1、§6.3、§8.2 | 方案把 c=deny 当作所有路径的终结，并据此把 takeGrant 放在「classify deny 之后、任何 (b)/(a) 之前」；但项目角色默认 `advisoryRuleset: true`，advisory 下 c=deny **不终结**，而是走 `runA` 交 judge/客户（分支 `c-deny→a-*`）。`script`/advisory/operatorOnly 分支都在非 advisory 的 c=deny 终结之前返回；按 §6.3 字面顺序找不到同时满足「在 c=deny 之后」和「在 script/advisory/operatorOnly 之前」的单一插入点。§8.2「不修订 c=deny 终结性」与默认路径现状不符。 | `src/common/编排/shell-gate.ts:572-636`、`:648-659`、`:663-677`、`:678-685`、`:707`；`src/pipeline/orchestration/shell-arming.ts:183-185` | 明确 advisory 下 c=deny 仍交 judge/客户；takeGrant 放在 classify 计算之后、script 分支之前，并对 `detail.decision === "deny"` 一律不消费/不放行；补四条路径单测。 |
| F2 | 漏重点 | 重要 | §3.3、§3.9、§5.3 | 现状断言错误：桌面在项目角色且配置已接受时已传入 `routineShellPolicy`；`npm test`/`npm run typecheck`/`node --test` 在 script 分支已被委托直接放行，**不需要 (b)**，项目角色默认路径已 0 卡/0 judge。方案「都会被判 review/risky 并调用判断 agent」「委托不生效」不成立；实际新增主要是内置角色、`npm ci`、`tsc --noEmit`、`npm run test|lint|check`。 | `app/desktop/session.ts:2446-2449`、`:2740`；`src/common/编排/shell-gate.ts:590-597`；`test/编排/shell-authorized-routine.test.ts:29-39` | 修正 §3.3/§3.9，区分项目角色与内置角色；列出真正新增形态；把委托扩展标注为行为变更/客户确认点。 |
| F3 | 漏重点 | 重要 | §5.3、§6.1、§12 | `matchRoutineShellCommand` 放在门禁引擎私有 common，而 `routine-shell-policy.ts` 属编排；按工程法案/门禁引擎公开出口，他角色只能经 `src/service/gate/shell-rules.ts` 消费。方案写集未含该文件，按现边界无法合法实现「同一谓词」。 | `src/service/gate/shell-rules.ts:1-13`；`角色卡/项目管理/docs/project-rules.md:26,29`；`src/pipeline/orchestration/shell-arming.ts:23-28` | 将 `src/service/gate/shell-rules.ts` 加入写集并再导出谓词；或放到共享目录；明确委托策略导入路径。 |
| F4 | 漏重点 | 重要 | §6.5(a)、§6.1、§7.2、§12、P4 | 推荐扩展既有 shell 确认卡，明确要求把 `confirm-card.ts` 核心从布尔改为动作投影，但写集没有 `confirm-card.ts`/`recovery-channel.ts`；该核心与恢复卡共享，改签名会波及恢复卡。渲染侧只有单个 `shellConfirm` 槽，新 id 直接替换当前卡（审批卡与升级卡互相覆盖）；「同窗口 1 张待答升级卡」不能阻止跨类型覆盖。 | `app/desktop/confirm-card.ts:7-9`、`:55-67`、`:149-167`；`app/renderer/src/stores/confirm-store.ts:46`、`:216-220`；`app/renderer/src/chat/confirm-logic.ts:49-59` | 写集加入 `confirm-card.ts`/`recovery-channel.ts`；设计布尔兼容 + 动作投影；定义跨卡片类型仲裁（升级排他/审批等待/申请拒绝）；补时序验收。 |
| F5 | 漏重点 | 一般 | §4.4、§6.3 | `start_background_task` 复用同一 `shellGate`，`ShellReviewRequest` 不含入口；授权键只按 `(roleId,cwd,argv)` 时，前台批准可能被后台启动消费，客户不知道会以后台长驻方式执行。 | `src/provider/runtime/tools.ts:1239-1303`、`:3022-3028`；`src/service/runtime/session.ts:167`；`src/model/runtime.ts:186-198` | 增加 toolName/entry 并纳入授权键；或明确两入口语义并在卡上披露；补测试。 |
| F6 | 漏重点 | 一般 | §1、§4.6、§8.3、Q5 | 暂停作用域自相矛盾（会话级/本次运行/全局）；`shellJudgeSwitch` 在窗口内创建，macOS 重新激活会新窗口新实例；`isEnabled()` 同时被治理 approval 组使用，暂停会连治理卡代批一起关，方案未披露。 | `app/main.ts:139`、`:329`、`:540`、`:1014`；`app/desktop/customer-input.ts:446-448`、`:1061`、`:1172`、`:1203` | 统一作用域；把 shell 暂停与治理 approval 组分开；补窗口重开/治理卡验收；客户确认。 |
| F7 | 漏重点 | 一般 | §4.6、P8 | `manual/retry-capped` 在 operator-channel 直接 deny、不发结果行；retry-capped 没有客户可见判拒结果行，「本次运行暂停」按钮无落点；P8 只覆盖角色回执。 | `app/desktop/operator-channel.ts:540-566`、`:626-665` | 为 retry-capped 提供客户可见入口（或升级卡页脚动作），或改 P8/流程；新增结果行需客户确认是否改动 2026-10-19 裁定。 |
| F8 | 漏重点 | 一般 | §7.1、P5 | 现有审计 `branch` 是升级链（`<b>→<a>`），`by` 也是链；方案「客户手批 branch 为 a-allow、by 为 operator:<id>」与实际形状不符。P5「审计字段不含凭据」与既有逐字 `command`/`argv` 审计冲突。 | `src/common/编排/shell-gate.ts:313-315`、`:869-873`、`:1106-1108`；`src/common/编排/shell-audit.ts:69-81` | 改为可机读条件（无 judge/customerGrant、branch 以 `→a-allow` 结尾等）；凭据要求限定为新增字段。 |
| F9 | 漏重点 | 一般 | §4.2、§6.3 | `manualAsDeny` 不在共享 `ShellJudgeAudit` 契约，只是桌面本地扩展；资格判断依赖它区分 judge 主动 deny 与 manual 转 deny 时缺少共享类型。 | `src/model/runtime.ts:1346-1367`；`app/desktop/operator-channel.ts:265-266`、`:555-565`、`:642-652` | 在共享 `ShellJudgeAudit` 增加可选 `manualAsDeny`/`modelVerdict`（加法），或资格判断只依赖 `reasonCode` 并写明。 |
| F10 | 漏重点 | 一般 | §4.3、§6.3 | `ShellEscalationFn` 入参只有 `{command, necessity?}`，但匹配需 argv；`splitCommand` 是 tools.ts 私有；`onReviewed`/`takeGrant` 收到的 `ShellReviewRequest` 没有 roleId，而键包含 roleId；未说明 argv/roleId 如何到达 registry。 | `src/provider/runtime/tools.ts:820`、`:1089-1092`；`src/model/runtime.ts:186-198` | 工具入参增加 argv（由 splitCommand 产生）或抽出共享拆分原语；roleId 由每会话 registry 闭包绑定。 |
| F11 | 漏重点 | 一般 | §7.1、§6.3、§6.4 | `ShellAuditRecord` 必填 `timestamp/toolCallId/command/argv/cwd/conclusion/branch/by/conditions/execution`；方案的 `escalation-decision` 未定义 `conclusion`/`toolCallId`/`execution`，无法复用记录类型；共享 sink 未落地（buildShellGate 内部建 sink，run-role 拿不到）。 | `src/common/编排/shell-audit.ts:69-81`、`:105-116`；`src/common/编排/shell-gate.ts:1031-1039` | 定义完整记录字段；在装配处创建/返回共享 sink 或增加 `onAuditReady`/`auditSink` 注入。 |
| F12 | 漏重点 | 一般 | §4.5、§4.2 | 状态机没有「同一 key 后续 review 为 allow 时清除旧 recorded」的转移；旧判拒记录永久保留，角色可在命令后来已被放行后仍申请升级卡。 | `src/common/编排/shell-gate.ts:648-659`；方案 §4.5 | 在 onReviewed 对同一 key 的 allow/其它结果清除记录，或资格只认最近一次 review；补测试。 |
| F13 | 漏重点 | 一般 | §5.4、§8.3 | 代码级白名单插在 classify 的硬拒/记号检查之后、risky 之前，会覆盖自定义规则集的 `riskyPrograms` 分类；方案说「有意」，但闸门 1 确认点没有这一项。 | `src/common/门禁引擎/classify-shell.ts:355-361`、`:443-461` | 把「覆盖自定义规则集 risky」列入客户确认点，或把 O8 默认改为可配置；P7 增加显式断言。 |
| F14 | 漏重点 | 建议 | 方案行 1/5/43/724/754；§5.4 | 文档版本自相矛盾（v1.0/v1.1）；§5.4 测试路径写成 `test/编排/shell-write-guard`，实际是 `test/门禁引擎/shell-write-guard.test.ts`；新谓词会使 `shell-authorized-routine.test.ts:63` 的 `npm ci` 负例失效，方案未列出现有断言变更。 | 方案行 1、5、43、724、754、280；`test/编排/shell-authorized-routine.test.ts:63`；`test/门禁引擎/shell-write-guard.test.ts` | 统一版本标注；修正测试路径；逐条列出现有断言变更。 |

## 复核结论

**建议修订后提交。**

理由：方案方向与闸门 0 三层意图总体一致，契约、验收标准与选装清单完整度较高，不属于「暂不建议提交」。但 F1–F4 是影响客户决策或验收基线的重要发现：F1 触及核心安全不变量与可行性（advisory 下 c=deny 非终结、takeGrant 位置不可落地）；F2 是已核实现状的事实错误（高估痛点、掩盖委托已生效）；F3 是角色边界/单一来源问题；F4 是核心呈现面的写集与并发缺口。建议作者按复核规则 §9 逐项处置（采纳/部分采纳/不采纳均记录理由），至少修正 F1–F4、F6–F8 后，由沟通对受影响部分做一次只读再复核，再提交闸门 1。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未运行任何测试、未启动应用、未做真实桌面/CLI/E2E；代码行为结论来自 HEAD `9f670fb` 的静态阅读。未验证推达失败、超时、窗口关闭、会话重建、并发回包的真实运行时表现。
- 未逐行读完 `app/desktop/session.ts`（7759 行）、`app/desktop/interface.ts`（2524 行）、`app/main.ts`（1046 行）、`src/pipeline/orchestration/run-role.ts`（2369 行）、`src/provider/runtime/tools.ts`（3207 行）、`src/model/runtime.ts`（2500 行）；只读了与 shell 审批/开关/卡片/工具注册相关的段落。
- 未完整阅读 `app/desktop/customer-input.ts`；只确认 approval 组使用 `shellJudgeSwitch.isEnabled()` 的位置。
- 未完整阅读渲染侧全部 UI；只读了 `ConfirmCard.tsx` 开头、`confirm-store.ts` 关键段、`confirm-logic.ts` 的 receive/respond 逻辑与 `preload.cjs` 的桥形状。
- 未阅读 `src/common/编排/shell-post-audit.ts`、`shell-deadline.ts`、`pm-reviewer.ts` 等非核心件；`src/common/执行/` 不存在，按任务说明忽略。
- 未逐条核对全部角色边界 YAML；只读了编排、门禁引擎、桌面窗口、桌面UI、运行时核心、项目管理（shared/i18n）的相关条目与 `release-policy.mjs` 的 `files`/`directories`/`selectOverlay`。
- 未阅读 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 先例；未核对 `docs/communication/` 中 2026-10-29/10-19 的完整历史记录，只依据闸门 0 记录与方案引用。
- 未检查 `test/测试/**` 的 E2E 细节；未检查新增 `test/桌面应用/shell-escalation.test.ts`（尚不存在）。
- 复核时 `docs/planning/2026-10-31_review_shell-deny-customer-escalation.md` 尚不存在（由作者/沟通落盘，属预期）。

**未解决意见：**

1. 对 §3.3/§3.9 关于 routine-shell-policy 的现状断言有明确异议（F2）。
2. 对 §6.3 的授权消费顺序与默认 advisory 路径的兼容性有明确异议（F1）；若作者不采纳，需在处置中说明授权重试如何避免再次进 judge。
3. 对「c=deny 终结性不修订」的表述有异议：默认 advisory 下 c=deny 本来就不终结；应改为「不新增 c=deny 终结、升级资格按 branch 前缀排除 c-deny」。
4. 暂停作用域（本会话/本次运行/全局）与窗口重开、治理 approval 组的影响需要客户在闸门 1 明示。
5. 写集缺 `app/desktop/confirm-card.ts`、`app/desktop/recovery-channel.ts`、`src/service/gate/shell-rules.ts`；若作者认为不需改，请给出替代实现并更新写集。

## 再复核记录（受影响部分）

### 第一轮窄复核（v1.1）

- **复核版本**：v1.1（818 行；复核上下文报告 SHA-256 `74d49c78…`）。作者在窄复核期间另做过少量措辞/图表修订（Mermaid 标签引号、§1 痛点限定、§8.3 暂停粒度措辞、键注释、授权顺序细化），不改变窄复核发现的适用性；作者随后出的 v1.2 快照 `f3fe95f5…` 被第二轮窄复核读取，N8/N9 处置后的最终版本为 v1.3（857 行，`b395c658…`）。
- **复核范围**：F1–F4、F6–F8 的处置闭合性；F5/F9–F14 的同步修订；修订引入的新矛盾。
- **受影响发现更新**：

| 发现 | 窄复核状态 | 说明 |
| --- | --- | --- |
| F1 | **部分闭合 → v1.2 补全（N1）** | 授权顺序已写清且覆盖 advisory；但「advisory 下 c=deny 不终结」未区分 script 路径（script 类 c=deny 在所有模式终结）。v1.2 按 N1 修正。 |
| F2 | **已闭合** | §3.3/§3.9/§3.5/§5.1/P7 已纠正委托现状与增量范围。 |
| F3 | **已闭合** | §5.3/§6.1/§12 经 `src/service/gate/shell-rules.ts` 公开出口，写集已含该文件。 |
| F4 | **部分闭合 → v1.2 补设计（N2/N6）** | 写集与布尔兼容扩展已补；卡片仲裁的等待机制/超时语义未定义，风险 5 仍写「其余拒绝」。v1.2 补仲裁 API 与超时语义并改风险 5。 |
| F5 | **未完全闭合 → v1.2 补全（N3）** | 键定义各处不一致（缺 `projectRoot`/`entry`），记录结构无 `entry`；v1.2 统一键并补 `entry` 字段与后台负例。 |
| F6 | **已闭合（设计层）** | 暂停改为 shell-only、应用运行期、main 模块级；不影响治理 approval 组；作用域仍以 Q5 披露。 |
| F7 | **已闭合** | 升级卡页脚暂停动作覆盖 retry-capped；不新增 manual 结果行。 |
| F8 | **已闭合** | §7.1/P5 改为可机读条件；凭据要求限定新增字段。 |
| F9 | **已闭合** | `ShellJudgeAudit.manualAsDeny?: true` 加法。 |
| F10 | **已闭合** | `ShellEscalationFn` 入参含 argv；roleId 由每会话闭包绑定。 |
| F11 | **已闭合（设计层）** | escalation-decision 必填字段与 `onAuditSinkCreated` 共享 sink；实施时需确认外部注入 sink 也触发回调。 |
| F12 | **已闭合** | 旧记录清理 + `seq`；v1.2 状态图补 `recorded → [*]`（N4）。 |
| F13 | **已闭合** | 自定义规则集覆盖已披露并列入客户确认点/Q11/P7。 |
| F14 | **已闭合** | 版本/测试路径/现有断言变更已修正。 |

- **新发现（N1–N7，均已在 v1.2 处置）**：

| 编号 | 严重度 | 问题 | 处置（v1.2） |
| --- | --- | --- | --- |
| N1 | 一般 | script 类 c=deny 在所有装配模式终结，原文只归因于非 advisory | 采纳：§3.1/§4.1/§6.3/§8.2/§9/P2 按路径区分 |
| N2 | 一般 | 升级卡/审批卡仲裁的等待机制与超时语义未定义 | 采纳：§7.2 仲裁 API + 等待不启动确认超时 + 等待上限 fail-closed + id/kind 路由；P4 四组测试 |
| N3 | 一般（会重新引入 F5） | 键定义缺 `projectRoot`/`entry`、记录无 `entry` | 采纳：统一键、补字段、非 run_shell 只忽略、后台负例 |
| N4 | 建议 | 状态图缺 `recorded → [*]` | 采纳：补转移 |
| N5 | 建议 | 暂停口径未完全统一（含「重启恢复」歧义） | 采纳：统一 shell-only/跨窗口保留/重启清零 |
| N6 | 建议 | 风险 5 与新版仲裁不一致 | 采纳：改为升级拒绝 + 审批等待 |
| N7 | 建议（安全边界） | readonly 档若误注入 takeGrant 可越过只读拒绝 | 采纳：§4.2/§6.3/§9/P2 增加 readonly 守卫与负例 |

- **窄复核结论**：**建议修订后提交**（F2/F3/F7–F14 已闭合；F1/F4/F6 主要问题已解决或已披露；N1/N2/N3 应在闸门 1 前修正）。作者已在 v1.2 处置 N1–N7；复核上下文随后对 v1.2（`f3fe95f5…`）做第二轮窄复核（见下节）。
- **未解决意见**：①暂停作用域仍宽于闸门 0 的「本会话」，以 Q5 披露、客户决定；②自定义规则集被代码级白名单覆盖（§8.3 第 11 点、Q11）；③后台升级入口（O11/Q12）与脚本上下文变化后的重新申请（O12/Q14）为后续项；④实施前需明确卡片仲裁的具体 API 与等待超时值（N2）。

### 第二轮窄复核（v1.2）

- **复核版本**：v1.2（840 行，SHA-256 `f3fe95f5…`；复核期间文件多次变化，复核上下文以该快照为准）。**范围**：F1–F14、N1–N7 的闭合性与 v1.2 是否引入新矛盾。
- **受影响发现更新**：F1–F14 全部**已闭合**（F1 按路径区分；F2 现状纠正；F3 公开出口；F4 仲裁 API/超时；F5 键含 `entry/projectRoot`；F6 暂停 shell-only；F7 retry-capped 页脚；F8 审计口径；F9 `manualAsDeny`；F10 argv/roleId；F11 审计字段/共享 sink；F12 记录清理；F13 自定义规则集披露；F14 版本/路径）。N1–N7 全部**已闭合**。
- **新发现**：

| 编号 | 严重度 | 问题 | 作者处置（v1.3） |
| --- | --- | --- | --- |
| N8 | 建议（提交前文字统一） | §6.1/§6.3 两处仍写 `detail.decision !== "deny"`，与权威顺序段「仅 review/risky（非 deny、非 allow）」不一致；实现者若按前者，c=allow 命令可能消费一次性授权 | **采纳**：§6.1 shell-gate 行、§6.3 `takeGrant` 精确位置改为 review/risky（非 deny、非 allow）；P3 增「c=allow 不消费一次性授权」验收与负例 |
| N9 | 建议（流程/可追溯） | 复核期间文件多次变化，v1.1/v1.2 版本与哈希记录不一致；§14.2 曾写「未再复核 v1.2」，与事实不符 | **采纳**：冻结 v1.2 快照 `f3fe95f5…`、v1.3 处置后版本 `b395c658…`；复核记录与 §14 记录实际版本/哈希；§14.2/§14.3 更新为「已复核 v1.2」 |

- **第二轮窄复核结论**：**建议提交客户确认**（F1–F14、N1–N7 实质闭合；N8/N9 为文字条件与可追溯性问题，不改变方案方向、范围或验收基线）。
- **未解决意见**：暂停作用域仍宽于闸门 0「本会话」（Q5 披露）；自定义规则集被代码级白名单覆盖（Q11）；后台升级入口（O11/Q12）；脚本上下文变化后重新申请（O12/Q14）。

### 确认性窄复核（v1.3）

- **复核对象**：v1.3（857 行，SHA-256 `b395c6587f33ded5c3857f51e4806c8c2bfc177ca2b270b514b3c863c8fec0ca`）；范围（沟通限定）：N1–N3 与 N8 的闭合性、F6/F7/F13 披露、与 2026-10-29 §五/Q2 冲突披露的一致性。
- **逐项结果**：

| 项 | 结果 | 理由（带文件:行） |
| --- | --- | --- |
| N1（script 路径 c=deny 在所有装配模式终结；非 script 的 advisory/operatorOnly 交 (a)；任何 c=deny 不消费/不放行） | **闭合** | §3.1 3-1（行 76）引用 `shell-gate.ts:582-587`；§4.1（行 164）、§6.3（行 449）同口径；§8.2（行 603）、§9 不变量 2（行 625）、P2（行 644）同步；P2 覆盖 script/advisory/operatorOnly/三层链/readonly 五路径。 |
| N2（卡片仲裁 API / 等待超时 / 按 id/kind 路由 / 升级排他 / 审批等待 / 有审批卡时升级拒绝） | **闭合** | §6.4（行 455）、§6.5(a)（行 469）、§7.2（行 537-539）定义仲裁 API、等待期间不启动操作者确认超时、等待上限/中止 fail-closed、按 `{id}`/`kind` 路由；P4（行 646）双向时序验收。 |
| N3（键统一为 `(roleId, projectRoot, cwd, entry, argv)`；记录含 projectRoot/entry；非 run_shell 只忽略；后台不消费前台授权） | **闭合** | §4.2 注（行 183）、§4.4（行 202）、§6.5(c)（行 483）、§9.7（行 630）同键；§6.3 `EscalationRecord`（行 415-430）含 `projectRoot`/`entry: "run_shell"`；P1/P2 覆盖 `entry=run_shell` 与后台判拒不可申请。 |
| N8（§6.1/§6.3 两处 `!== "deny"` 与权威顺序段不一致） | **闭合** | §6.1（行 311）、§6.3 `takeGrant`（行 444）已改为「`detail.decision` 为 `review`/`risky`（非 deny、非 allow）」并写明 c=allow 不消费；§4.1/§6.3 顺序段同口径；P3（行 645）增加「c=allow 不消费一次性授权」验收；正文无有效残留（§14.2 行 814 的旧文仅作为 N8 历史描述）。 |
| F6（暂停作用域仍宽于闸门 0「本会话」） | **闭合（附非阻断提示）** | §8.3 第 5/10 点（行 611/616）、Q5/Q13、§4.6/P8 同口径；「宽于本会话」仅在 §14.3 明说。建议闸门 1 材料引用 §14.3，或在 §8.3 第 5 点补一句明示。 |
| F7（retry-capped 无客户结果行，以升级卡页脚暂停动作覆盖） | **闭合** | §4.6（行 245）入口②、P8（行 650）明确覆盖 retry-capped；不新增 manual 结果行，符合 2026-10-19 裁定。 |
| F13（自定义规则集被代码级白名单覆盖） | **闭合** | §5.3（行 288）、§8.3 第 11 点（行 617）、Q11、P7（行 649）三处一致。 |
| §3.5/§5.1/§5.2/§8.3 第 3 点/P7 与 2026-10-29 §五/Q2 冲突披露 | **闭合（附非阻断提示）** | §3.5 明确「冲突已部分存在、本轮扩大到内置角色并增加形态、任意 npm run <script> 不纳入」；§5.1/§5.2/§8.3 第 3 点/P7 同口径，无夸大或缩小。建议闸门 1 材料引用 §3.5/§5.1 的现状说明。 |

- **阻断性新发现**：无。
- **确认性窄复核结论**：**可提交闸门 1**（N1–N3/N8 闭合；F6/F7/F13 与冲突披露一致；两项非阻断提示属闸门 1 材料的披露位置/摘要完整度，不改变方案方向、范围、契约主体或验收基线）。
- **作者处置**：按复核意见把结论回填本复核记录与方案 §14.3；未改方案正文逻辑。回填后又对 §14.3 的状态文字做了唯一一处更新（删除「待回填」并写入结论），方案最终快照为 857 行、SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`；确认性窄复核针对的实质内容与 `b395c658…` 相同（差异仅为 §14.3 状态回填）。
- **限制**：复核上下文未运行测试/应用，未验证真实 IPC 推达、等待槽位、超时起算、窗口重开/会话重建、并发卡片；未逐行核对 v1.3 全部 857 行的未受影响部分。未解决客户决定：暂停作用域（Q5）、自定义规则集覆盖（Q11）、后台升级入口（Q12）、脚本上下文变化后重新申请（Q14）。
