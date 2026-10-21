---
id: ui-platform-phase3b-cards-composer
type: change
title: Phase 3B——真实确认卡族、judge 双开关与输入区完整接线（Nova × 深色石墨）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-verified（3B 范围内，含 UIUX 3B 评审 5 项修正）
related: [ui-platform-round, ui-platform-round-review, ui-platform-nova, ui-platform-phase3a-chat, ui-contract-surface, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 按 PM §10.6 放行实施 Phase 3B：真实 shell/su/恢复确认卡、judge 结果行与双开关、发送/停止/队列撤回/附件完整 UX；C1 尾部折叠收敛至 Δ=16；门禁与证据见同目录 2026-10-21-phase3b-evidence/
  - date: "2026-10-21"
    kind: revised
    summary: 按 UIUX Phase 3B 评审 needs-work 修正 5 项 Phase 4 前必须（SU 档位加粗与琥珀警告、shell 详情 Lucide chevron、拖入反馈、队列撤回 28px、缩略图 8px/移除钮 4px/12px X），冒烟扩至 45 项 + 18 张截图，复验通过
---

# Phase 3B：真实卡族、judge 双开关与输入区完整接线

**范围**：产品提案 §六 Phase 3 剩余项与 PM §10.5 的 3B 清单（确认/恢复/审批卡族、真实 shell 卡、停止本轮、完整附件 UX、judge 结果行与双开关、system 行、队列位次/撤回），加 UIUX 3A2 非阻塞项（chevron/表格字号/status glyph/C1）。**不做**：引擎真实切换与每引擎会话/设置（Phase 4）、工作概览/队列抽屉（Phase 4）、治理三权卡/镜像/治理记录动作（Phase 4）。

**结论**：3B 范围内完成并有真实 Electron 离线 IPC 替身证据；旧渲染器核心零 diff；**不宣称 Phase 3 整体或全量双端等价**（后者仍是 Phase 5 逐 check 名证据）。C1 尾部折叠经同机同日套件实测 **Δ=16px**（旧 32px），达到 Phase 5 判据（≤32）与收敛目标（≤20），未放宽断言。

## 一、实施内容

### A. 真实 IPC 卡族（fail-closed，渲染侧只呈现数据面）

| 卡 | 接线 | 行为 |
| --- | --- | --- |
| shell 命令确认 | `onShellConfirm`（`shell:confirm-request`）/ `shellConfirmRespond`（`shell:confirm-response`） | `id/command/summary/reasonPlain/judgeNotice/argvLines/cwd/reasonRaw` 原样呈现；命令 `<pre>` 逐字；**默认焦点拒绝**；Esc/×/拒绝 = `allow:false`；仅「放行执行」= `allow:true`；等待不设限、零忙碌动效；本轮 `settled`（同角色/同 runtime/project）或 `session:operator-expired` 命中 id 时**收起旧卡**，不保留全禁用「已失效」卡；失效/通道异常如实提示（不假装放行） |
| su 命令审批 | 同卡、`policy:"su-approval"` | 标题「SU 命令审批」/内置治理角色「命令审批 · Proof / 验收」等；档位（risky/review/deny）+ 可见「命中原因：<reasonRaw>」+ 绕过写边界警告；拒绝仍默认焦点 |
| 恢复确认 | `onRecoveryConfirm`（`recovery:confirm-request`）/ `recoveryConfirmRespond`（`recovery:confirm-response`） | 动作（人话 + 原始 token）、目标角色、证据**逐字**、原因、可选提议方/时间/条目；**取消默认焦点**；仅「执行」= `allow:true`；Esc/×/取消 = 不执行；失效/通道异常**原地定格**（动作禁用、`is-expired`、如实提示「按 fail-closed 不执行」），绝不呈现为已执行 |
| judge 结果行 | `onShellJudgeResult`（`shell:judge-result`）/ `onOperatorJudgeResult`（`session:operator-judge`） | allow/deny/manual：manual 不产生结果行（原卡 + `judgeNotice`）；deny 档放行徽标与理由、引擎/operator/档位；治理代批行「judge 代批 · 代审批/代决策」+ 结论/理由/路径/证据；按 `roleId` 落 pane、`toolCallId` 锚定（定位不到追加流尾），同一 id 幂等 |
| 系统行 | `session:event(s)` prompt-input 分类 | `用户指令：` 回显前缀剥离后识别 `[系统·<子类>]`（子类 ≤12、闭合、其后空白/文末）、`[派发]`、`[回交]`；`[系统·看护/收束]` 呈独立 `.msg-injected.is-system` 行（chip「系统消息 · 看护/收束」），回放同解 |
| operator 卡手动回落 | `session:operator-request` | 原卡可作答；`payload.judgeNotice` 原样逐字呈 `.op-judge-notice`（琥珀），不自动批准 |

### B. 输入区完整接线

- **发送**：`sendSession(text, images, target, {clientMessageId})`；目标 `{projectRoot, roleId, runtime}`；成功本地回显并按 `clientMessageId` 去重回显；`queued:true` 显示「已入队…第 N 位」系统行 + 提示；`ok:false` 分流：未接受（`inputAccepted!==true`）恢复原文与附件 + 如实「发送失败/异常」行；已接受（aborted/completed/failed/timed_out/未知）按返回快照与真实终态收口，不打印「发送失败」假象；迟到入队回包在真实 ACK 后不复活提示。
- **停止本轮**：`#btn-halt` 仅角色忙时可见；`abortSession({projectRoot,roleId,runtime})`；三态如实系统行（已请求停止 / 当前运行时不支持停止 / 停止失败），不做乐观「已停止」。
- **队列位次与撤回（就地回执）**：聊天流队列行显示「进行中 / 第 N 位」+ 来源；仅客户消息且未投递者可「撤回」；`withdrawQueued(target,id)` 结果就地回执「已撤回排队消息：…」/「撤回无效：…」（失败另落系统行），位次前移由真实 role-state 快照刷新。
- **角色草稿保持**：按角色保存 textarea 原文与附件；切换角色恢复各自草稿；迟到的选图结果落发起角色（不污染当前角色）。
- **附件完整 UX**：选图（`pickImage`，主进程读写）、粘贴/拖入（File API 读字节 → `attachImage` 主进程校验）、缩略图（**data URL**，遵守 `img-src 'self' data:`，不使用 blob:）、移除、悬停标题（名称 + KB）、发送随消息载荷并在成功后清空；渲染侧不接触 Node/fs。
- **双开关（替我审批 / 替我决策）**：`getShellJudgeState/setShellJudgeEnabled/onShellJudgeState` 与 `getDecisionJudgeState/setDecisionJudgeEnabled/onDecisionJudgeState`；默认关、互不影响、重载复位、主进程权威（失败保持原状态并显示错误）；桥四方法缺失 ⇒ 禁用 +「当前版本不支持自动判断，保持手动」；single 项目禁用「替我决策」并显示「旧治理模型（single）不支持代决策」；开启后紧凑琥珀标记 + **按组一次性警告**（同一块、按开启组列行、「知道了」或约 9 秒收起、重复推送/重绘/切角色不重现、关闭再开重新提示）。

### C. UIUX 3A2 收尾项

- 披露 chevron：`tool-records` / `tool-call-record` / `sys-denied` / judge 详情全部改 **Lucide `ChevronRight`**，删除 CSS `content:"\203A"` 文本字形与 transform transition（瞬时旋转）；聊天热路径零 CSS 动画。
- Markdown 表格字号 12.5→**13px**。
- `status.ts` 删除未渲染的 `icon` 字形字段（角色树图标仍由 Lucide 按 class 映射）。
- **C1 尾部折叠锚点**：`toolfold` 段同机同日实测旧入口 Δ=32px、新入口由 51px 收敛到 **16px**（锚点 150→166，非累积，阅读行仍在视口），中段折叠 Δ=0/0；未改断言。机制：`.chat-pane` 增加 36px 底部呼吸位（滚动内容内的真实留白），折叠文档尾时保留滚动余量，避免浏览器按上限夹走阅读锚点。证据与归因见 `2026-10-21-phase3b-evidence/c1/`。

### D. UIUX Phase 3B 评审 5 项修正（2026-10-21，needs-work → 修正后复验）

评审：`角色卡/UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase3b-review.md` §六。只改 CSS/图标/夹具，不动行为逻辑、不改断言、不扩范围。

| # | 项 | 修正 | 实测 |
| --- | --- | --- | --- |
| 1 | SU 审批视觉语义 | `.sc-overlay.is-su-approval .sc-summary { font-weight:600 }`；`SU_APPROVAL_WARNING` 拆为 `.sc-su-warning`（`--warning` 琥珀），默认「拒绝/关闭 = 不放行」提示仍 `--text-3`；`#sc-hint` 文案与旧断言逐字不变 | 冒烟 `SU_WARNING_AMBER_SUMMARY_BOLD`：summary 600、警告色 = `var(--warning)`、hint 默认色 = `var(--text-3)`、文案含默认提示；截图 `1360/960-su-approval-card.png` |
| 2 | shell 详情展开指示 | `#sc-details > summary` 加 Lucide `ChevronRight`（`.disclosure-chevron`，瞬时旋转） | 冒烟 `SHELL_DETAILS_LUCIDE_CHEVRON_VISIBLE_AND_ROTATED`：图标存在、展开 transform 已旋转、无 `::before` marker；截图 `1360/960-shell-details-open.png` |
| 3 | 拖入反馈 | `.capsule.is-dropping { border-color: var(--text-3); background: var(--hover) }`（旧基线同义，令牌化） | 冒烟 `DROP_FEEDBACK_VISIBLE_TOKENS`/`DROP_FEEDBACK_CLEARED_ON_LEAVE`：类与计算色 = 令牌；截图 `1360/960-drop-state.png` |
| 4 | 队列撤回命中区 | `.queue-withdraw` 高 20→**28px**、字号 10.5→**11px**、圆角 `--radius-control`；边框仍 `--input` | 冒烟 `QUEUE_WITHDRAW_HIT_TARGET_AND_INPUT_BORDER`：高 ≥24（28）、11px、边框 = `--input`；截图 `1360/960-queue-withdraw.png` |
| 5 | 附件缩略图圆角/图标 | `.attach-chip` 10→`var(--radius)`（8）；`.attach-rm` 999→`var(--radius-micro)`（4，登记为微型覆盖钮，非圆形例外）；X 图标 11/1.8→**12/1.5** | 冒烟 `ATTACH_CHIP_RADIUS_AND_REMOVE_ICON`：chip 8px、rm 4px、图标 12×12；截图 `1360/960-attachments.png` |

附带：冒烟粘贴/拖入夹具由 4 字节 PNG 签名改为完整 1×1 PNG 字节（评审 §一 的 broken-image 是夹具数据问题），截图缩略图正常；`onError` 通用占位仍留 Phase 4（评审 §七）。

## 二、文件清单（全部在桌面UI 边界内）

**新增（`app/renderer/src/`）**
- `chat/judge.ts`：双开关/结果行/标题/档位/恢复动作的纯映射（对齐旧 `ui-labels.js` 文案）。
- `chat/confirm-logic.ts`：卡状态机（重推幂等/busy/失效收起）、回包结果、settled 失效判定、队列位次/撤回、附件快速筛与标题 —— 纯逻辑，供 node 单测。
- `stores/confirm-store.ts`：确认卡与双开关 zustand 状态；回包/失效/一次性警告（唯一 setTimeout 为警告自动收起，沿旧纪律）。
- `test/桌面UI/{confirm-logic,judge}.test.ts`：3B 纯逻辑单测（新增 15 项，累计 33）。
- `test/桌面UI/phase3b-electron-smoke.mjs` + `phase3b-smoke-preload.cjs`：真实 Electron 离线 IPC 替身冒烟（45 项 + 18 张截图）。

**修改（`app/renderer/src/`）**
- `shell/ConfirmCard.tsx`：演示 AlertDialog 改为常驻 DOM 的真实 shell/su/恢复卡（`#shell-confirm/#recovery-confirm/#sc-*` 与 `#rc-*` 保留；`hidden` 切换；role=dialog/aria-modal、默认焦点、Esc/×、焦点循环、失效定格）。
- `shell/Composer.tsx`：发送/停止/附件/双开关/一次性警告/角色草稿；`#composer-hint` 只由真实提示驱动（空即空）。
- `chat/ChatStream.tsx`：队列行位次/来源/撤回就地回执（`QueueRows`；稳定缺省引用避免无限渲染）。
- `chat/ChatRow.tsx`：判断结果行、operator `judgeNotice`、Lucide chevron；deny/工具行渲染保持 3A 口径。
- `chat/VirtualPane.tsx`：判断结果行包裹带 `.sys.shell-judge-row` 与 `data-tool-call-id`（e2e 直接取 pane 子元素）。
- `chat/chat-store.ts`：`runningByRole`、`appendSystemRow/setRoleError`、判断结果行（幂等/锚定）、提示来源（queue/send）与真实终态收口、空历史不覆盖实时行、`append(from 0)` 按全量重建、aborted 清除角色错误。
- `chat/events.ts`：`用户指令：` 前缀剥离、`[系统·]` 严格闭合、`[派发]/[回交]`；非工具 denied（如「本轮已中止」）只作系统事实，不猜工具名。
- `chat/ipc.ts`：shell/恢复卡与 judge 状态/结果订阅；settled 收起旧 shell 卡；operator-expired 同时定格卡与卡内请求。
- `chat/types.ts`：新增 `judge-result/governance-judge-result` 行类型。
- `chat/status.ts`：移除未渲染 glyph 字段。
- `lib/platform.ts`：按 preload 实际名称补充 3B 通道声明（只读消费）。
- `test-driver.ts`：`state.shellConfirm/recoveryConfirm` 真实、`onShellConfirm/onRecoveryConfirm*`、`shellJudge/decisionJudge`、`onShellJudgeResult/onOperatorJudgeResult`；`unimplemented` 仅余 Phase 4/5 项。
- `shell/shell.css`：确认卡/恢复卡/警告/结果行/chevron/队列/附件缩略图/表格 13px/`.chat-pane` 36px 底部呼吸位；遮罩/缩略图按钮底色改用 `--backdrop-strong` 令牌（零裸色值）。
- 删除 `stores/confirm-demo-store.ts`（Phase 2 演示卡状态，已被真实卡 store 取代；无引用）。
- `App.tsx`：`#composer-hint` 仅显示真实提示（空即空，旧契约）。
- `shell/TitleBar.tsx`：移除 Phase 2 的「演示骨架」角标（3B 起本入口承担真实会话；工作概览/设置等未接项仍在其各自入口就地标注「演示占位」）。

**未改**：`app/renderer/renderer.js`、`styles.css`、`index.html` 与其余旧渲染器经典脚本；三个 e2e 套件本阶段未再改（3A 已接的 `ANS_RENDERER_ENTRY` 目标切换继续使用，断言未动）；`package.json`/锁文件、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、根配置、其他角色目录零改动。

## 三、与旧实现的对应

| 新实现 | 旧实现（只读对照） |
| --- | --- |
| `stores/confirm-store.ts` + `ConfirmCard.tsx` | `renderer.js::onShellConfirm/renderShellConfirm/respondShellConfirm/closeStaleShellConfirm`、`onRecoveryConfirm/renderRecoveryConfirm/respondRecoveryConfirm/markRecoveryConfirmExpired`、`onOperatorExpired` |
| `chat/judge.ts` | `ui-labels.js::shellConfirmTitle/suApprovalTierLabel/judgeToggleView/judgeWarningStep/judgeWarningLines/shellJudgeToggleResult/shellJudgeResultView/governanceJudgeResultView/recoveryActionView` |
| Composer 双开关 | `renderer.js::initJudgeSwitches/initApprovalJudgeBridge/initDecisionJudgeBridge/renderJudgeToggles/syncShellJudgeWarning` |
| 结果行 | `renderer.js::onShellJudgeResult/onOperatorJudgeResult/buildShellJudgeResultRow/buildGovernanceJudgeResultRow`（按 toolCallId 锚定、id 幂等） |
| 发送/停止/附件 | `renderer.js::onSend/onHaltClick/pickImageViaMain/attachBrowserFile/removeAttachment/draftFor/saveComposerDraft/restoreComposerDraft` |
| 队列撤回 | `renderer.js::withdrawQueuedMessage`（就地回执）+ `ui-labels.js::queueItemViews` |
| 系统行 | `tool-rows.js::classifyInjectedMessage`（`用户指令：`/`[系统·]`/`[派发]/[回交]`） |

## 四、门禁命令与真实输出

证据目录：`角色卡/桌面UI/docs/change/2026-10-21-phase3b-evidence/`。

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 渲染类型 | `npm run typecheck:renderer` | 0 错（`build/typecheck.txt`） |
| 构建 | `npm run build:renderer` | 通过；`dist/src/index.html` + 1 JS + 1 CSS（`build/build.txt`） |
| CSP 扫描 | 产物静态扫描 | `index.html` 仅外链 `<script type="module" src=…>`；`unsafe-inline/unsafe-eval` 计数 0（`build/csp-budget.txt`） |
| 首屏预算 | 入口引用 JS+CSS gzip(level 9)+HTML | **240,133B ≤ 307,200B**（JS 225,029 + CSS 14,715 + HTML 389）（`build/csp-budget.txt`） |
| 新纯逻辑单测 | `node --test test/桌面UI/*.test.ts` | **33/33 pass**（3B 新增 15；覆盖卡状态机/失效收起、judge 结果映射、双开关映射、队列/撤回、附件类型）（`unit/desktopui.txt`） |
| 旧基线 | `node --test test/桌面应用/*.test.ts` | **679/679 pass**（`unit/desktop-app.txt`） |
| 旧渲染器核心 | `git diff` | `renderer.js`/`styles.css`/`index.html` 零 diff（`markdown.js`/`vendor` 为 3A 既有未提交改动，本轮未触碰） |
| IME 新入口 | `ANS_RENDERER_ENTRY=app/renderer/dist/src/index.html … ime-enter.mjs` | **24/24 true，E2E_DONE=1**（`ime/report.txt`） |
| 延迟挂载正向检查 | `electron test/测试/phase3a-lazy-toolgroup-check.mjs app/renderer/dist/src/index.html` | **10/10，LAZY_TOOLGROUP_DONE=1**（`lazy-toolgroup/`） |
| 真实 Electron 离线 IPC 冒烟 | `electron test/桌面UI/phase3b-electron-smoke.mjs` | **45/45 true，SMOKE_DONE=1**；零 CSP 违规、零 console 错误；18 张 1360/960 截图（`electron-smoke/`） |
| bench 重基线（PM §10.3） | 旧/新交替各 4 轮，首轮预热排除，有效 ≥3 轮 | 全部通过：stormA maxGap 新中位 **17.6ms** ≤ max(旧 19.8,25)；stormB **19.2ms** ≤ max(旧 17.4,25)；handler/replay/scroll 新中位均 ≤ max(旧×1.2,旧+5ms)；有效轮 maxGap p95 **19.5ms ≤35**、单轮最大 **19.5ms ≤50**（`bench/`，评估见 `bench/bench-rebaseline.md`） |
| uiux-v2 相关段（新入口） | `ANS_RENDERER_ENTRY=…dist/src/index.html` + 各 `*_UI_ONLY` | JUDGE **33/33**；G2 恢复 **5/5**；TERMINAL **22/22**；TOOLFOLD **17/17 布尔检查**（含 C1，另 2 条锚点信息）；默认段 **9/10**（第 10 项为 Phase 4 工作概览）；SEND_FACTS **8/9**（余 1 项依赖 Phase 4 每引擎会话）；QUEUE_VIEW **1/2**（抽屉队列属 Phase 4）。详见 `uiux-v2/reached-checks.md` |
| C1 尾部折叠 | toolfold 套件（同机同日） | 旧 Δ=**32px**（既有基线红）；新 Δ=**16px**（150→166，非累积，阅读行在视口）；中段折叠 150→150→150；未放宽断言。归因见 `c1/attribution.md` |

### 冒烟覆盖（`electron-smoke/report.json`，45 项）

卡族：`SHELL_CARD_VERBATIM_AND_DENY_FOCUS`、`SHELL_DETAILS_LUCIDE_CHEVRON_VISIBLE_AND_ROTATED`、`SHELL_ESC_DENIES_AND_CLOSES`（回包 `allow:false`）、`SHELL_EXPLICIT_ALLOW_ONLY`（恰 allow:true）、`SHELL_SETTLED_CLOSES_STALE_CARD`、`SHELL_EXPIRY_CLOSES_AND_REPORTS_REASON`、`SU_DENY/RISKY/REVIEW_TIER_*`、`SU_WARNING_AMBER_SUMMARY_BOLD`、`JUDGE_MANUAL_NOTICE_VERBATIM_ON_CARD`、`RECOVERY_CARD_VERBATIM_CANCEL_FOCUS`、`RECOVERY_EXPLICIT_EXECUTE_ONLY`、`RECOVERY_EXPIRED_STAYS_DISABLED_HONEST`、`RECOVERY_CHANNEL_ERROR_FAIL_CLOSED`、`RECOVERY_EXPIRED_DISMISSES_WITHOUT_EXECUTION_ILLUSION`。
judge：双开关启动关闭态、开启琥珀标记 + 一次性警告、知道了后重复推送不重现、决策组警告文案、single 禁用 + 说明、shell allow 结果行锚定、manual 无行、治理代批行。
输入区：`SEND_ACK_CLIENT_MESSAGE_ID_TARGET`、`SEND_FAILURE_RESTORES_DRAFT_AND_SAYS_SO`、`HALT_VISIBLE_WHEN_BUSY/HIDDEN_WHEN_IDLE`、`HALT_ABORTS_EXACT_TARGET_AND_SAYS_REQUESTED`、`DROP_FEEDBACK_VISIBLE_TOKENS`、`DROP_FEEDBACK_CLEARED_ON_LEAVE`、`ATTACH_PICK/PASTE/DROP/REMOVE`、`ATTACH_CHIP_RADIUS_AND_REMOVE_ICON`、`QUEUE_POSITIONS_AND_WITHDRAW_ONLY_FOR_MESSAGES`、`QUEUE_WITHDRAW_HIT_TARGET_AND_INPUT_BORDER`、`QUEUE_WITHDRAW_INLINE_RECEIPT`、`SYSTEM_ALERT_INJECTED_STYLE`、`NO_CSP_VIOLATIONS`、`NO_CONSOLE_ERRORS`。
说明：`RECOVERY_CHANNEL_ERROR_FAIL_CLOSED` 触发主进程 stdout 的「Error occurred in handler」是**故意**的通道异常注入（渲染侧已按 fail-closed 定格），不进入渲染 console。

## 五、uiux-v2 到达点与失败名（新入口；未宣称全量等价）

| 段 | 到达 | 失败 |
| --- | --- | --- |
| 默认段 | 10 项 | 第 10 `one independent work list without duplicated role documents`（工作概览/队列抽屉，Phase 4；台账 B1） |
| JUDGE | 33 项 | 无 |
| G2_RECOVERY | 5 项 | 无 |
| TERMINAL | 22 项 | 无 |
| TOOLFOLD | 17 布尔 + 2 锚点 | 无；C1 转绿 |
| SEND_FACTS | 9 项 | `P7 old runtime rejected result cannot disable current runtime or overwrite draft`（依赖每引擎会话状态，Phase 4） |
| QUEUE_VIEW | 2 项 | `queued baseline shows two`（抽屉队列内容，Phase 4） |

这些失败名均为台账已登记的 Phase 4/5 范围，不是 3B 缺陷；3B 未为此拉入 Phase 4 项，也未弱化断言。

## 六、未验证项与偏差

- **真实模型/网络**：未调用；全部证据来自离线 IPC 替身/套件夹具。
- **真实主进程确认卡通道**：冒烟用受控替身（含故意异常）；未在真实角色会话中触发 shell/su/恢复卡。
- **Phase 4 未实现**：引擎真实切换/每引擎会话与设置、工作概览/队列抽屉、治理三权卡/镜像/排队聚合、治理记录动作、角色资料/文档真实内容、delivery/persistence/报告全文卡片、`replayAnchorDebug`。
- **偏差**：双开关使用原生 `<input type="checkbox">` + 令牌样式（保留 `#auto-approve-toggle/#judge-decision-toggle` 的 checked/click/label 契约）；UIUX 白名单的 Checkbox 组件为 Base UI 隐藏 input，无法同时满足旧 e2e 的直接 id/checked 访问。已在契约面与本文登记，不做第二套显隐。
- **C1 机制**：36px 底部呼吸位是真实留白（滚动内容的一部分），不是测试专用分支；同机同日旧端仍为基线红 32px（C2 类基线红不变）。
- **台账 D1 编号差异**：冒烟检查名以本目录 `report.json` 为准；未复用测试角色 D1 的 30 项命名。
- **未复跑**：`main.mjs`（桌面窗口属主，Phase 5）；`uiux-design-audit.mjs`；打包/安装包（Phase 5）。

## 七、未实现清单（Phase 4 / 5）

- **Phase 4（桌面UI）**：引擎真实切换与每引擎会话/设置、工作概览/队列抽屉、治理三权卡/镜像/排队聚合、治理记录预览/建立/重新接受动作、角色资料/文档只读抽屉、delivery/persistence/报告全文卡片、operator 镜像、`replayAnchorDebug` 与回放锚点表。
- **Phase 5**：`main.mjs` 整机自检与全量双端逐 check 名对照、`uiux-design-audit`、打包冒烟、旧渲染器下线；发布流水线接入留待新冻结源/客户决定（M1）。
- 已知基线红：旧入口 `expired old shell shown disabled in its own runtime`（C2）；旧 toolfold 尾部锚点 32px（C1，新端已 16px）。

## 八、边界声明

- 只写 `app/renderer/**`、`test/桌面UI/**`、`角色卡/桌面UI/**`；未改 `package.json`/`package-lock.json`、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器其他文件、根配置或其他角色目录；未新增依赖。
- 渲染进程无 `node:`/`require(`/fs 访问；无第二份边界判定；卡回包只提交客户明确选择（恰 `allow:true`）。
- 未 git 提交；工作树以 `git status`/`git diff` 为准。
