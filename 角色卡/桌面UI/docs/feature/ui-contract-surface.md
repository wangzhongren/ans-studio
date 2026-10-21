---
id: ui-contract-surface
type: feature
title: 渲染层测试契约面清单（最终，Phase 5B 收尾）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented（Phase 5B 收尾：生产入口唯一 `app/renderer/dist/index.html`，经 renderer-entry 解析；旧渲染器/vendor 已删除；四个 e2e 与四个冒烟默认已翻转；packaged smoke 已完成）
related: [ui-platform-round, ui-platform-round-review, ui-platform-nova, ui-platform-phase3b-cards-composer, ui-platform-phase5a-scope]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM 评审 M2 读取四个 e2e 套件与旧守卫测试（已退役），产出 id/class/data/aria、测试驱动方法、写死路径与三态表；Phase 2 新渲染器按此对照
  - date: "2026-10-21"
    kind: updated
    summary: Phase 3B 更新三态表（输入区/附件/卡族/judge 结果行/双开关/队列撤回/驱动与 state）；登记 3B 冒烟与各 uiux 段到达点
  - date: "2026-10-21"
    kind: updated
    summary: Phase 4A 更新三态表 #7/#9/#10/#15/#16/#18/#19/#20（引擎真实切换/每引擎草稿/工作概览/设置/抽屉/文档/驱动 rightTab）；登记 4A 驱动语义、uiux 段到达点、冒烟与组件台账
  - date: "2026-10-21"
    kind: verified
    summary: Phase 4B 更新三态表 #8/#12/#13/#14/#15/#17/#19/#20（治理记录/镜像聚合/报告交付/驱动/state）、4B 驱动语义、uiux 各段到达点、冒烟 70/70、bench/C1 与已知 Phase 5 边界；C2 重锚记录
  - date: "2026-10-21"
    kind: verified
    summary: 4B 独立验证 needs-work 返工：C2 原因可见（含 RUNTIME 17/17 与配套断言）、已答卡 full rebuild 锚点、960 树行不收缩、200% 逐容器无横溢（含 notice/status/tree/col-mid/composer）、200% 左树可见+提示全文、报告/预览截图与 details 内部断言、facts 冒号分离、取消回焦；冒烟 70/70、VISUAL 54/54；补证副本记录（COMPLETE_FLOW C/P3 12/12、默认段 100 checks）
  - date: "2026-10-21"
    kind: verified
    summary: Phase 5A 更新 #6/#12 与套件目标表：Sidebar 身份 data/aria（无 ti-badge）、P7 待选择、full replay 阅读锚点；四套件 ANS_RENDERER_ENTRY fail-fast；5A 冒烟 36/36（含 Markdown 外链不导航、200% composer 可达/错误态无横溢、200% 镜像卡/交付批次目标入镜）、迁移台账 178/178、官方三项检查通过（当时旧渲染器/vendor/旧测试未删除；已在 5B 删除）
  - date: "2026-10-21"
    kind: verified
    summary: Phase 5B 收尾：生产入口唯一 `app/renderer/dist/index.html`（renderer-entry 解析，packaged smoke 完成）；旧 `index.html`/renderer.js/styles.css/7 经典脚本/vendor 与四个旧守卫测试已删除；四个 e2e 与四个冒烟默认翻转 dist/index.html；5A 36/36、4B 70/70、3B 45/45、4A 99/99、IME 26/0、design audit 31 项 0 bad、单测 142/142
---

# 渲染层测试契约面清单（最终，Phase 5B 收尾）

产品提案（revision 2）§五 A5、§六 Phase 2 与 PM 评审 §1.1 M2 要求：在切换渲染器之前，把现有 e2e/单测**实际依赖**的契约面写成清单，新渲染器提供同名 `window.__ansRenderer` 驱动，各套件可切换目标，Phase 3/5 用同一套件**逐 check 名对照**。本文是 Phase 2 的产出，也是 Phase 3/4/5 的实现与验收输入。

**状态**：本文已按 Phase 5B 收尾最终化（唯一生产入口 `dist/index.html`、旧渲染器/vendor/旧守卫测试已删除、四个 e2e 与四个冒烟默认翻转、packaged smoke 完成）。下文 §3.1–3.4 为最终驱动面；§3.5 为旧守卫退役说明；§4 的三态表保留历史阶段列并补 #34–#39 最终状态。Phase 2 骨架验收记录见 §4.1。

## 一、读取方法与基线

- 只读读取（最终）：`test/桌面应用/e2e/{uiux-v2,ime-enter,main,bench-storm}.mjs`、`test/桌面UI/*`、`app/preload.cjs`、`app/renderer/dist/index.html`（唯一生产入口）、`app/renderer/src/**`（新渲染器）。旧生产入口、旧渲染器脚本/样式/vendor 已删除，不再作为契约来源；历史来源见 §3.5 退役说明。
- 计数为**静态 grep/解析**，不是运行结果；权威 check 名单以各套件运行时输出为准（`uiux-v2` 的 `report.json`、`main` 的 `report.txt`、`bench` 的 JSON）。
- 方法名与 DOM 选择器按**字面**记录；动态拼接（模板字符串）已尽量还原，并在对应套件注明。
- 行号以 2026-10-21 工作树为准，后续改动需重跑本清单。

## 二、套件总表

| 套件 | 属主 | 入口（写死） | 主要 env | 驱动面 | check 形态 | 是否通过/失败套件 |
| --- | --- | --- | --- | --- | --- | --- |
| `uiux-v2.mjs` | 桌面UI | `app/renderer/dist/index.html`（唯一生产入口；`ANS_RENDERER_ENTRY` 可覆盖，显式目标缺失即退出 2） | `ANS_UIUX_OUTDIR`、`ANS_UIUX_INTERACTIVE`、`ANS_UIUX_WIDTH` + 20+ 个 `*_UI_ONLY` 模式开关 | 21 个方法/状态字段（见 §3.1） | `check(name, jsExpr)` → `reports[]`；394 个 `check(` 出现点（含函数定义） | 是（默认段 + 模式段） |
| `ime-enter.mjs` | 桌面UI | `app/renderer/dist/index.html`（`ANS_RENDERER_ENTRY` 可覆盖；显式目标缺失即退出 2） | `ANS_IME_OUTDIR`、`ANS_IME_VISIBLE` | `loadProject`、`selectRole` | `check(name, bool)`；9 个调用点 → **26 个运行时检查** | 是 |
| `main.mjs` | 桌面窗口 | `app/renderer/dist/index.html`（唯一生产入口，经 renderer-entry 解析） | `ANS_E2E_PROJECT`、`ANS_E2E_OUTDIR` | 21 个方法/状态字段（见 §3.3） | `log("NAME=" + value)`；整机 report 行 | 是（整机自检） |
| `bench-storm.mjs` | 桌面UI | `${BENCH_RENDERER_DIR|app/renderer}/dist/index.html`（`ANS_RENDERER_ENTRY` 可覆盖；显式目标缺失即退出 2） | `BENCH_RENDERER_DIR`、`BENCH_OUT` | `loadProject`、`selectRole`、`state.roleMeta` | 无 check；输出 JSON 指标 + `BENCH_DONE=1` | 否（基准台） |
| `test/桌面UI/*.test.ts` | 桌面UI | `node --test`；源码守卫 + 纯逻辑（不再读旧渲染器源码/旧 vendor） | 无 | 无（源码/纯函数断言） | 142 个测试；旧 178 项逐名迁移 | 是 |

## 三、逐套件清单

### 3.1 `test/桌面应用/e2e/uiux-v2.mjs`

**入口与环境**

- 入口：`await win.loadFile(path.join(APP, 'renderer/dist/index.html'))`；`APP = path.resolve(HERE, '../../../app')`。生产入口唯一，`ANS_RENDERER_ENTRY` 可覆盖。
- 夹具项目根写死：`const ROOT = '/offline-uiux-fixture'`（L16）。
- 输出：`ANS_UIUX_OUTDIR`（缺省系统临时目录）；`report.json` 内含 `reports[{name,value}]`、`sends` 等。
- 窗口：`win.setContentSize(Number(process.env.ANS_UIUX_WIDTH) || 1360, ...)`（L1536）；`ANS_UIUX_INTERACTIVE=1` 时显示窗口。
- 模式开关（互斥/组合，逐段运行）：`ANS_CONFIG_UI_ONLY`、`ANS_FRESH_CONTEXT_UI_ONLY`、`ANS_ROLE_RETURN_FOCUS_UI_ONLY`、`ANS_TERMINAL_UI_ONLY`、`ANS_SEND_FACTS_UI_ONLY`、`ANS_TERMINAL_MERGE_UI_ONLY`、`ANS_VISUAL_V2_UI_ONLY`、`ANS_DELIVERY_NOTE_UI_ONLY`、`ANS_COMPLETE_FLOW_UI_ONLY`、`ANS_PROJECT_RESET_UI_ONLY`、`ANS_DUP_UI_ONLY`、`ANS_SELECTOR_UI_ONLY`、`ANS_G2_RECOVERY_UI_ONLY`、`ANS_TOOLFOLD_UI_ONLY`、`ANS_NOTICE_UI_ONLY`、`ANS_BLANK_PANE_UI_ONLY`、`ANS_QUEUE_VIEW_UI_ONLY`、`ANS_GOVERNANCE_REACCEPT_UI_ONLY`、`ANS_JUDGE_UI_ONLY`、`ANS_MIRROR_UI_ONLY`、`ANS_MERGE_UI_ONLY`、`ANS_RUNTIME_UI_ONLY`。
- IPC 替身：套件顶部注册 `app:recovery-state`、`app:renderer-diagnostic`、`window:is-maximized`、`app:list-project`、`session:history-get`、`session:open/send/stop/abort/withdraw/live/live-views`、`runtime-config:get/save`、`project:governance-*`、`pi-config:get/save`、`shell:confirm-response`、`shell:judge-get/set`、`decision:judge-get/set`、`session:operator-response`、`recovery:confirm-response` 等（受控替身，无真实模型/网络）。

**`window.__ansRenderer` 驱动方法（名称、用途、调用处）**

| 方法/字段 | 用途 | 调用处（行号，节选） |
| --- | --- | --- |
| `loadProject(projectRoot)` | 注入 listing 夹具，建立项目/角色视图 | 39 处：L131、142、148、167、172、244 … |
| `selectRole(roleId)` | 选中角色、打开/切换会话（夹具） | 59 处：L131、142、148、159、161、167 … |
| `selectRuntime(runtime)` | 切换 Pi/Codex/Claude 视图 | 43 处：L131、148、163、165、172 … |
| `rowModelDebug(roleId)` | 读行模型（count/lastIndex/operators/rowGap）与确认卡锚点 | 17 处：L58、695、715、718、728、730 … |
| `paneDebug(roleId)` | 读某角色 pane 的可见构成（空态/队列/loading/助手行/文本） | 6 处：L1273、1277、1281、1286、1290、1298 |
| `queuedDebug()` | 读排队聚合残留 id（视图恢复不复活旧队列） | 4 处：L1313、1317、1319、1321 |
| `replayAnchorDebug(roleId)` | 读回放锚点表 | 3 处：L1047、1051、1491 |
| `refreshProject()` | 重新取项目枚举（project:changed 路径） | 3 处：L531、660、680 |
| `loadPiConfig()` | 打开/重载设置面板字段 | 6 处：L869、872、875、879、888 |
| `openPiPanel(tab)` | 打开设置抽屉 | 1 处：L881 |
| `onRecoveryConfirm(payload)` | 直接注入恢复确认数据面 | 1 处：L1075 |
| `state.projectRoot` | 当前项目根 | L563、878 |
| `state.selectedRoleId` | 当前选中角色 | L58、235、433 … |
| `state.sessionOpenRoleId` | 当前已开会话角色 | L343、346、350 … |
| `state.runtime` | 当前引擎 | L358、433、591 … |
| `state.roleMeta` | 角色元数据（错误/状态） | L343、350、352 … |
| `state.roleBusy` | 角色忙碌快照 | L679、681、914、1499 |
| `state.queueByRole` | 每角色队列 | L679、681 |
| `state.rightTab` | 当前右抽屉 tab | L148、167、602 … |
| `state.shellConfirm` | 当前 shell 确认卡 | L323、325、327 … |
| `state.recoveryConfirm` | 当前恢复确认卡 | L1082 |

**Phase 4A 驱动语义（2026-10-21）**：

- `selectRuntime(runtime)`：保留方法名，语义为**真实切换**并返回 Promise（可 `await`）；无项目/非法/同引擎/切换中重复提交为 no-op 返回 `false`。切换保存旧引擎视图事实、安装目标视图、按三元身份 `openSession/getSessionHistory`、恢复目标草稿（不调 `session:stop`）。
- `openPiPanel(tab?)`：打开设置抽屉；缺省=当前会话引擎；返回 Promise（内部加载该引擎配置）。
- `loadPiConfig()`：加载当前会话引擎配置，成功 `{view,missing}`，失败 `undefined`（失败已就地显示）。
- `savePiConfigFromForm()`：保存当前面板表单（读取 DOM，兼容旧外部写值）；返回 Promise<boolean>。
- `piKeys`：Pi 面板键集（主进程元数据顺序；`getter`，未加载时为空数组）。
- `state.rightTab`：由 `"card"|null` 扩为 `"card"|"work"|"pi"|"document"|null`（抽屉关闭为 null）。

- 左树（PM §十三）：`.ti-status` 只表达状态（不含「N 待办」）；`.ti-count` 是唯一可见数字徽标（当前工作+排队），`title/aria-label` 含「当前工作 X 项，排队 Y 项」；队列深度另见工作概览。
- 队列子视图（UIUX M1）：同一 424 抽屉；标题 `<角色> · 队列`；`.queue-subview` 内 `.queue-back`（返回来源视图）与唯一 `#right-queue-body`；工作概览/角色资料仅预览当前 + 前 3 条排队，总数 >3 显示 `.queue-view-all`（「查看全部队列（N）」）；Esc 先返回来源视图；`state.rightTab` 仍为 `work|card`（不新增值）。
- 撤回回执（UIUX M2）：成功在聊天流追加 `.sys-call`「已撤回排队消息：〈摘要〉」；失败/异常保留 `.q-feedback` 就地回执并追加 system 行「撤回无效/撤回失败：…」。
- 设置 Tabs（UIUX M3）：`#pi-engine-tab-<engine>` + roving tabindex + `aria-controls="pi-engine-panel"`；`#pi-engine-panel` 为 tabpanel/aria-labelledby；←/→ 循环、Home/End。
- 保存条（UIUX M4）：`.pi-status` 在 64px 内两行完整状态（压缩键数/缺项数，应用时点不省略），完整逐键文案在 `title`（`savedStatusTitle`）与 `aria-live`。
- 失效/已答 operator 卡（PM §十三 冻结例外）：`.op-actions` 与 `op-confirm/op-deny/op-submit/op-cancel` 带 `hidden`，保留 `disabled`、`finalNote`、`aria` 与卡片容器。

**Phase 4B 驱动语义（2026-10-21）**：

- `replayAnchorDebug(roleId)`：返回 `[{anchorKey,requestIndex,conclusionIndex,rowsAtReplay}]`（无表 `[]`）；只读 chat-store 锚点表；卡（重）物化按 `toolCallId → anchorKey → 行尾` 落位，卡插入后锚点索引右移。
- `governance.state()`：`{open,mode,modelChoice,loading,busy,canConfirm,previewDigest,result,error,nextStep}`；`open(mode?)`/`selectModel(model)`/`confirm()`/`cancel()` 只调真实 governance-store（预览零写入、确认才写）。
- `queuedDebug()`：当前 `queuedOperator` id 插入序（切引擎/清空/呈现/失效后为空）；聚合行只在 trio 主入口、不可聚焦/无按钮/无请求内容。
- `state.governancePreview`：只读快照（打开/模式/loading/busy/digest/canConfirm/nextStep），不改变既有字段语义。
- 判断结果行：`onShellJudgeResult/onOperatorJudgeResult` 经 ipc sink 先进每引擎视图缓存；当前视图落地，切回旧引擎按到达序重放（chat-store 同 id 幂等），不跨引擎泄漏。
- 菜单配置状态：`settings-store.menu[engine] = {status,missing,projectRoot}`；菜单打开只读未缓存/未知项（并行一次），切换/保存后读当前引擎；每次切换/提交恰一次读取，当前项 Enter 不重读。
- queueView：任何顶层 tab 命令先清空 `queueView`（`drawer-store.openTab/openSettingsDrawer/openDocumentList/backToRole`），抽屉保持打开。

**DOM 契约**

- **id（82 个，静态提取）**：

```
auto-approve-label auto-approve-status auto-approve-toggle btn-attach-image btn-halt
btn-import btn-send chat chat-role-sub composer-capsule composer-hint context-state
document-read-status document-read-text drawer-backdrop drawer-close drawer-title
governance-preview governance-status history-projection-note inp-message
judge-decision-label judge-decision-status judge-decision-toggle op-chip pi-close
pi-inp-ANS_CLAUDE_MODEL pi-inp-ANS_CODEX_BASE_URL pi-inp-ANS_CODEX_MODEL
pi-inp-ANTHROPIC_API_KEY pi-inp-ANTHROPIC_AUTH_TOKEN pi-inp-CODEX_API_KEY pi-panel
pi-panel-path pi-save pi-status project-path rc-action rc-allow rc-close rc-deny
rc-details rc-evidence rc-hint rc-reason rc-role recovery-confirm right-body
right-drawer right-queue-overview role-tree runtime-config-message
runtime-config-notice runtime-config-settings runtime-note runtime-option-claude
runtime-option-codex runtime-option-pi runtime-options runtime-select sc-allow
sc-close sc-deny sc-hint sc-judge-notice sc-reason sc-summary sc-title
shell-confirm shell-judge-warning shell-judge-warning-close shell-judge-warning-text
sidebar-collapse sidebar-expand sidebar-resizer tab-${mode} tab-card tab-pi tab-work
win-close win-max win-min
```

  其中 `tab-${mode}` 是模板拼接（`tab-card`/`tab-work`/`tab-pi`）；其余为字面 id。

- **class/属性/结构选择器（199 个唯一项，按域归类）**：

  - 骨架/布局：`.app`、`.col-left`、`.col-mid`、`.chat-head`、`.chat-pane`、`.composer`、`.compose-note`、`.sidebar-toggle`、`.capsule > textarea`、`.session-actions #runtime-select`、`.sidebar-foot #btn-import`、`.sidebar-foot #tab-pi`。
  - 左树：`#role-tree .tree-item`、`.tree-item[data-role-id]`、`.tree-item.primary[data-primary="true"]`、`.tree-item.builtin[data-builtin="true"]`、`.tree-group`、`.tree-group-fold`、`.ti-name`、`.ti-sub`、`.ti-power`、`.ti-builtin`、`.ti-status`、`.st-working`、`.st-error`、`.st-restored`。**5A 起 `.ti-badge` 不再渲染**（身份只在 class/data/aria/title），`.ti-count` 是唯一数字徽标。
  - 聊天流：`#chat .chat-pane`、`#chat .chat-pane > .virt-spacer`、`#chat .msg`、`.msg-user`、`.msg-user.is-replay`、`.msg-assistant`、`.msg-assistant.is-streaming`、`.msg-handback`、`.msg-injected`、`.msg-injected.is-system`、`.mi-chip`、`.mi-body`、`.msg-delivery`、`.turn-terminal`、`.sys-denied`、`.sys-settled`、`.sys-call`、`.sys-config`、`.sys-queue`、`.sys-delivery-note`、`.sys-notice-badge`、`.sys-notice.is-replay`、`.sys-replay-divider`、`.sys-unknown-tool-event`、`.queue-row`、`.delivery-*`、`.persistence-*`、`.report-*`、`.recent-report*`、`.reply-original`、`.safe-input-copy`、`.projection-flags`、`.op-chip`、`.task-request`、`.is-replay`。
  - 工具行：`.tool-records`、`.tool-activity`、`.tool-call-record`、`.tool-call-status`、`.tool-call-target`、`.tool-call-details`、`.tool-current`、`.tool-row`。
  - 交互卡/治理卡：`.op-request`、`.op-title`、`.op-actions`、`.op-confirm`、`.op-deny`、`.op-options input`、`.op-preview`、`.op-preview-body`、`.op-note`、`.op-judge-notice`、`.op-mirror-badge`、`.op-mirror-source`、`.op-queue-aggregate`、`.op-tool-lifecycle`、`.governance-judge-row`、`.shell-judge-row`。
  - 右抽屉：`#right-drawer`、`#right-body`、`#right-body .q-item`、`.q-actions`、`.q-feedback`、`.q-full`、`.q-toggle`、`.q-withdraw`、`#right-body details[data-section]`、`#right-body #right-queue-body`、`.document-list`、`.document-list-meta`、`.document-source-note`、`.role-document-entry`、`[data-doc-id]`、`[data-doc-action=...]`、`#document-read-text`、`#document-read-status`。
  - 治理预览：`#governance-preview`、`#governance-status`、`[data-governance-reaccept]`、`[data-governance-cancel]`。
  - 运行时菜单：`#runtime-select`、`.engine-value`、`#runtime-options`、`#runtime-option-pi/codex/claude`、`.engine-option-name`、`[role=option]`、`aria-selected`。
  - 设置面板：`#pi-panel`、`.pi-panel-title`、`#pi-panel-path`、`#pi-inp-*`、`#pi-save`、`#pi-status`、`.pi-field`、`.pi-input`、`.pi-actions`、`.pi-advanced`、`.pi-advanced-hint`。
  - 确认卡：`#shell-confirm`、`#sc-title`、`#sc-close`、`#sc-command`、`#sc-summary`、`#sc-reason`、`#sc-details`、`#sc-allow`、`#sc-deny`、`#sc-hint`、`#sc-judge-notice`；恢复卡 `#recovery-confirm`、`#rc-action/role/evidence/reason/details/allow/deny/close/hint`。
  - 表单/输入：`#attach-row .attach-chip`、`#composer-capsule`、`#inp-message`、`#btn-send`、`#btn-halt`、`#btn-attach-image`、`#composer-scope`、`#composer-hint`、`#auto-approve-toggle/-label/-status`、`#judge-decision-toggle/-label/-status`、`#shell-judge-warning*`、`#runtime-note`。

- **`data-*`**：`data-doc-action`、`data-doc-id`、`data-governance-cancel`、`data-governance-reaccept`、`data-request-id`、`data-role-id`、`data-section`。
- **ARIA**：`aria-activedescendant`、`aria-description`、`aria-disabled`、`aria-expanded`、`aria-label`、`aria-modal`、`aria-orientation`、`aria-selected`、`aria-valuenow`；角色 `combobox`/`option`/`listbox`/`dialog`/`separator`/`radio`/`checkbox`。
- **全局对象**：`window.__ansRenderer`；`localStorage` 键 `ans.sidebar.width`、`ans.sidebar.collapsed`。

**检查名**

- 静态 `check(` 出现点 394 个（含函数定义）；可静态提取的字面名 384 个。完整名字集以运行时 `reports[].name` 为准（`report.json`）。覆盖：SELECTOR（默认 Claude/键盘/长标签）、CONFIG（三引擎设置）、COMPLETE_FLOW（41）、SEND_FACTS（8）、ROLE_FOCUS（11）、TERMINAL（22）、JUDGE（33）、G2（5）、TOOLFOLD（19）、NOTICE、BLANK、QUEUE_VIEW、MIRROR、VISUAL_V2（46）等。
- 切换对照时**不得重命名**；如批准改变语义，记录旧名→新名与批准依据（沿 2026-10-16 v3 断代先例）。

### 3.2 `test/桌面应用/e2e/ime-enter.mjs`

**入口与环境**

- 入口：`win.loadFile(path.join(APP_DIR, 'renderer', 'dist', 'index.html'))`；`APP_DIR = path.resolve(HERE, '..', '..', '..', 'app')`。
- 环境：`ANS_IME_OUTDIR`（缺省临时目录）、`ANS_IME_VISIBLE=1`（显示窗口）。
- IPC 替身：`app:recovery-state`、`app:renderer-diagnostic`、`window:is-maximized`、`app:list-project`（单角色 A）、`session:history-get/open/stop/live/live-views/send`、`app:pick-image`（返回 1×1 PNG）。
- 夹具项目根：`/ime-project`；角色 `A`。

**驱动方法**

| 方法 | 用途 | 调用处 |
| --- | --- | --- |
| `loadProject('/ime-project')` | 注入 listing | L84 |
| `selectRole('A')` | 打开角色 A 会话 | L85 |

**DOM 契约**

- id：`inp-message`、`btn-attach-image`、`btn-send`。
- 选择器：`#attach-row .attach-chip`、`#chat .msg-user`。
- 事件语义：`#inp-message` 的 `compositionstart`/`compositionend`/`keydown`；`Shift+Enter` 原生换行；`btn-send` 点击发送；发送 IPC `session:send` 的 `{text, images}` 载荷。
- `#attach-row .attach-chip` 数量用于附件就绪判断；发送后附件清空。

**运行时 check 名（24 个，2026-10-21 重锚）**

`check(` 调用点 9 个，但 `assertIgnored`/`assertSent` 生成动态名字。实际名字集：

```
ATTACHMENT_READY
CHINESE_COMPOSITION_STATE_NOT_CANCELLED
CHINESE_COMPOSITION_STATE_NO_SEND
CHINESE_COMPOSITION_STATE_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
CHINESE_END_NORMAL_ENTER_SENT_ONCE
CHINESE_END_NORMAL_ENTER_PAYLOAD_AND_CLEAR
ENGLISH_COMPOSITION_NOT_CANCELLED
ENGLISH_COMPOSITION_NO_SEND
ENGLISH_COMPOSITION_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
COMPOSITION_END_BEFORE_229_NOT_CANCELLED
COMPOSITION_END_BEFORE_229_NO_SEND
COMPOSITION_END_BEFORE_229_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
AFTER_229_NORMAL_ENTER_SENT_ONCE
AFTER_229_NORMAL_ENTER_PAYLOAD_AND_CLEAR
IS_COMPOSING_WITHOUT_START_NOT_CANCELLED
IS_COMPOSING_WITHOUT_START_NO_SEND
IS_COMPOSING_WITHOUT_START_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
AFTER_IS_COMPOSING_NORMAL_ENTER_SENT_ONCE
AFTER_IS_COMPOSING_NORMAL_ENTER_PAYLOAD_AND_CLEAR
MOUSE_COMMIT_NEXT_ENTER_SENT_ONCE
MOUSE_COMMIT_NEXT_ENTER_PAYLOAD_AND_CLEAR
SHIFT_ENTER_NOT_CANCELLED
SHIFT_ENTER_NATIVE_NEWLINE_NO_SEND
SEND_BUTTON_BEHAVIOR_UNCHANGED
```

（另有 `E2E_DONE=1` 收尾标记。）产品提案中的「26 项」与实际套件不一致，以本表为准；Phase 3 若套件更新，重新锚定。

### 3.3 `test/桌面应用/e2e/main.mjs`（桌面窗口属主）

**入口与环境**

- 入口：`win.loadFile(path.join(APP_DIR, 'renderer', 'dist', 'index.html'))`（唯一生产入口，经 renderer-entry 解析；重载路径同步）。
- 环境：`ANS_E2E_PROJECT`（缺省仓库根）、`ANS_E2E_OUTDIR`（缺省临时目录；必须先建目录）。
- 真实装配：`app/desktop/interface.ts`、`app/preload.cjs`、真实 `customer-input`/`watchdog`/`recovery` 等；IPC 替身仅限系统对话框/浏览器外开/图片选择。
- 夹具 `.env`：`OUTDIR/e2e-pi.env`（不触碰仓库根 `.env`）。

**驱动方法**

| 方法/字段 | 用途 | 调用处（行号，节选） |
| --- | --- | --- |
| `loadProject(root)` | 导入夹具项目 | 7 处：L309、664、735、798、883、1133、1191 |
| `selectRole(roleId)` | 点角色/开会话 | 33 处：L742、750、762、772、800 … |
| `appendOperatorRequest(payload)` | 直接注入交互卡 | 3 处：L1067、1076、1095 |
| `onRoleState(payload)` | 直接注入角色状态快照 | 11 处：L448、451、457 … |
| `onShellConfirm(payload)` | 直接注入 shell 确认卡 | 1 处：L1018 |
| `openPiPanel(tab)` | 打开设置抽屉 | 1 处：L1322 |
| `piKeys` | 设置字段键表 | 1 处：L1325 |
| `refreshProject()` | 重新枚举 | 1 处：L1490 |
| `replayAnchorDebug(roleId)` | 回放锚点 | 1 处：L1139 |
| `rowModelDebug(roleId)` | 行模型/卡锚点 | 11 处：L1144、1155、1173 … |
| `savePiConfigFromForm()` | 保存设置表单 | 1 处：L1390 |
| `state` / `state.hasRoles` / `state.primaryRoleId` / `state.projectRoot` / `state.roleBusy` / `state.roleMeta` / `state.roles` / `state.selectedRoleId` / `state.sessionOpenRoleId` / `state.shellConfirm` | 只读状态快照 | L318-319、331、518、666-700、753、1000、1030、1422、1526、1533-1615 |

**Phase 4A（新渲染器）**：`openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys` 已按本节契约实现（同名同义；`piKeys` 为 getter）；三引擎字段/掩码/保存语义见 §4.2。`main.mjs` 整机自检属 Phase 5，本阶段未运行。

**DOM 契约**

- id（51 个，静态提取）：

```
bootstrap-action bootstrap-notice btn-halt btn-import btn-send chat chat-role
chat-role-sub composer-capsule composer-hint drawer-title inp-message inp-runtime
modal op-chip pi-inp- pi-inp-ANS_PI_BASE_URL pi-inp-ANS_PI_CONTEXT_WINDOW
pi-inp-ANS_PI_MODEL pi-inp-ANS_PI_PROMPT_TIMEOUT_MS pi-inp-ANS_PI_PROVIDER
pi-inp-ANTHROPIC_AUTH_TOKEN pi-panel pi-panel-path pi-save pi-status project-path
reload-interface right-drawer runtime-note sc-command sc-deny sc-details sc-hint
sc-reason sc-summary session-state shell-confirm switch-confirm
switch-confirm-cancel switch-confirm-go switch-confirm-text tab-card tab-pi tab-queue
tab-todo tab-work titlebar win-close win-max win-min
```

- 关键选择器：`#titlebar .win-btn`、`.chat-head #btn-stop`、`.chat-head #session-state`、`.chat-head #btn-pi-settings`、`#role-tree .tree-item`、`#role-tree .tree-group`、`.ti-name`、`.ti-status`、`.ti-status .ts-ico svg.spin-arc`、`#chat .chat-pane`、`#chat .msg-user`、`#chat .msg-assistant`、`#chat .msg-injected`、`#chat .msg-handback`、`#chat .op-request`、`#chat .op-request[data-request-id=...]`、`#chat .sys`、`#chat .sys-denied[open]`、`#chat .queue-row`、`#chat details.sys-denied`、`#chat a.md-link`、`#right-body`、`#right-body details.sec > summary`、`#right-body table.boundary tbody tr`、`#right-queue-body .q-item`、`#right-queue-body .q-pos`、`#tab-work .tab-badge`、`#pi-panel .pi-field`、`#pi-panel .pi-input`、`#pi-panel .pi-actions`、`#pi-panel .pi-advanced`、`#pi-panel .pi-advanced-body .runtime-field-help`、`.pi-field-label`、`.pi-input`、`.op-actions button`、`.op-confirm/.op-deny/.op-submit/.op-cancel`、`.q-full/.q-toggle/.q-withdraw`、`.rt-select`、`.work-heading`、`.delivery-report .hb-head`。
- `data-*`：`data-request-id`、`data-state`。
- ARIA：`aria-description`；`role`（dialog/separator/option/listbox/checkbox/radio）由选择器与原生控件承担。
- 全局对象：`window.__ansRenderer`；窗口桥 `window.desktop` 的 `minimizeWindow/toggleMaximize/closeWindow/isMaximized/onMaximizedChanged`。

**check 形态**

- 无 `check()` helper；`log("NAME=" + value)` 写 `report.txt`，共 323 条 `log("...`（含 `ELECTRON/NODE/PROJECT/OUTDIR`、`SHOT_*` 截图标记与值型行）。双端对照按 `NAME=` 行名逐项比较。
- 关键整机项：`NO_DEFAULT_MENU_BAR`、`CUSTOM_TITLEBAR_PRESENT`、`TITLEBAR_IS_DRAG_REGION`、`TITLEBAR_HAS_THREE_BUTTONS`、`WINDOW_BUTTON_NO_DRAG`、`WIN_BRIDGE_FUNCTIONS`、`WIN_IS_MAXIMIZED_IPC`、`WIN_BUTTON_MIN/MAX/CLOSE_WIRED`、`PROJECT_BTN_INITIAL_IMPORT`、`PROJECT_BTN_SWITCHED`、`SU_DEFAULT_ACTIVE`、`CHAT_CTA_PRESENT`、`SESSION_NOT_AUTO_OPENED`、`U1_*` 等。

### 3.4 `test/桌面应用/e2e/bench-storm.mjs`

**入口与环境**

- 入口：`RENDERER_DIR = process.env.BENCH_RENDERER_DIR || <repo>/app/renderer`；`win.loadFile(path.join(RENDERER_DIR, 'dist', 'index.html'))`（`ANS_RENDERER_ENTRY` 可覆盖）。
- 输出：`BENCH_OUT`（缺省 `/tmp/ans-bench-result.json`）；每阶段写盘，`BENCH_DONE=1` 收尾。
- 装配：临时 preload（`/tmp/ans-bench-preload.cjs`）+ `contextIsolation:false` 的 `window.desktop` 桩；无真实模型/网络。
- 全局：`window.ANSMarkdown`（真实 markdown 管线）；`window.__ansRenderer`；`window.__bench*` 计时变量。

**驱动方法**

| 方法 | 用途 | 调用处 |
| --- | --- | --- |
| `loadProject(root)` | 注入单角色 su 夹具 | L81、146、160、165 |
| `selectRole(roleId)` | 选中 su | L84、149 |
| `state.roleMeta` | 读角色元数据 | L168、172 |

**DOM 契约**

- `#chat .chat-pane`、`#chat .chat-pane > *:not(.virt-spacer)`、`#chat .chat-pane > .virt-spacer`、`#chat`（滚动容器）。
- `window.ANSMarkdown`（渲染行内容）；`rowModelDebug` **未**直接使用，但长转录靠 `.virt-spacer` 结构。
- 指标：`stormA/stormB`（最大帧间隔、处理耗时）、`stormA_handler/stormB_handler`、`replay`（`replayMs`、`mounted`、`rows`）、`scrollToBottom`（`ms`、`mounted`）、`mounted` 计数。

### 3.5 旧守卫测试（已退役）

- 5B 步骤 a 已删除 `test/桌面应用/{renderer,markdown,tool-rows,runtime-ui}.test.ts`；178 项逐名迁移到 `test/桌面UI/`（台账 `docs/change/2026-10-21_phase5a-test-migration-ledger.md`）。
- 最终源码/行为守卫在 `test/桌面UI/*.test.ts`：`source-guard`（无旧 vendor/旧脚本 import、无 Node/fs、无第二套 UI/图标/动画库、CSP/静态入口）、`markdown`（XSS/外链拦截/npm pin）、`tool-summary`、`role-view`、`reading-anchor`、`operator-view`、`ui-store` 等，共 **142/142**。
- 旧守卫读取的旧渲染器源码/样式/入口/vendor 已全部删除，不再有运行引用；`test/桌面UI/source-guard.test.ts` 的静态入口改为 `app/renderer/index.html`（新源入口）。

## 四、新渲染器三态表

图例：**已满足** = Phase 2 骨架已实现且有证据；**部分** = 结构/占位存在但语义未接；**未满足** = 本阶段没有，计划在所示阶段补。所有「未满足」项都没有假实现。

| # | 契约项 | Phase 2 状态 | 说明 / 证据 | 计划阶段 |
| --- | --- | --- | --- | --- |
| 1 | 新入口与构建 | **已满足（5B 收尾）** | 源入口 `app/renderer/index.html`（Vite input，481B）；生产产物唯一 `app/renderer/dist/index.html`，由 renderer-entry 解析；旧生产入口（326 行）已删除；packaged smoke 已完成 | — |
| 2 | 自绘标题栏 `#titlebar` 36px、drag/no-drag、无 dblclick | 已满足 | 类 `.titlebar` + `-webkit-app-region`；Electron 冒烟 36px；无 dblclick | — |
| 3 | `#win-min/#win-max/#win-close` 接真实通道、缺失禁用 | 已满足 | Electron 冒烟 `WINDOW_MIN_ENABLED`、桥存在；浏览器预览禁用并显示「窗口控制不可用」 | — |
| 4 | 左栏宽度 248 / 208–360 / 拖拽 / 双击复位 / 方向键 ±8、Shift ±24 / `aria-valuenow` / localStorage | 已满足 | Electron 冒烟 248→328→248→272；`aria`/`localStorage` 同步；`.col-left` 实测 248 | — |
| 5 | 收起/展开 `.app.is-sidebar-collapsed`、`#sidebar-collapse/#sidebar-expand`、宽度保留 | 已满足 | 冒烟：宽 0、expand 可见、展开回 272 | — |
| 6 | 左树 `#role-tree`、`.tree-item[data-role-id]`、`.ti-*`、状态文字 | **已满足（5A；显示名 2026-10-21 修复）** | 真实 listing：主入口/治理职能（内置）/工作角色分组、状态徽标（等待确认>工作中>错误>…）、roving tabindex/↑↓/Home/End、点击即开聊；无项目/无角色空态如实。治理显示名：Draft / 提案、Crew / 组队、Steward / 统筹、主理 / Lead、验收 / Proof。5A：身份只在 `.primary`/`.builtin` + `data-primary="true"`/`data-builtin="true"` + `aria-description` + `title`，**不渲染 `.ti-badge` 第三行**；等待态按 `pendingKindFor` 显示「待选择」（任一 choice）或「等待你确认」，不附数量；`.ti-count` 唯一数字 | — |
| 7 | 会话头 `#chat-role/#chat-role-sub/#context-state`、`#right-tabs/#tab-work/#tab-card` | **已满足（4A/5A）** | 真实角色名/副标题/上下文状态（恢复/新会话/错误）；`#tab-work` 启用并打开工作概览（角标=待确认/待选择数，P7 分离「待选择」与空队列）；`#tab-card` 角标=当前工作+排队；左树 `.ti-status` 只表达状态、`.ti-count` 唯一数字（PM §十三）；缺配条 `#runtime-config-notice` | — |
| 8 | 引擎触发器 `#runtime-select/#runtime-options/#runtime-option-*` | **已满足（4A 真实切换；4B 菜单状态）** | 自绘 `EngineSelect`：`role=combobox` / `aria-haspopup=listbox` / `aria-controls=runtime-options` / `aria-expanded` / `aria-activedescendant`；弹层 `role=listbox`；选项 `role=option` + `aria-selected` + `id=runtime-option-*` + `data-runtime`；↑↓/Home/End/Enter/Space/Esc/Tab；选择即真实切换（`switchRuntime`，见 #19）；4B 菜单 208px 两行：名称 + `已配置/缺配置/配置未知/检查中…`（`.engine-option-status`，按需读取/cache） | — |
| 9 | 输入区 `#composer-capsule/#inp-message/#btn-send/#btn-halt/#btn-attach-image/#composer-scope/#composer-keyboard` | **已满足（4A 增补）** | 发送（clientMessageId/ack/失败如实/拒发恢复草稿）、停止本轮三态；**草稿与附件按 runtime×role 保持**（成功发送/显式移除/切项目清除；迟到旧引擎拒发只回旧视图）；双开关真实 IPC；IME **26/0**（默认新入口） | — |
| 10 | `#attach-row .attach-chip` 附件缩略图 | **已满足（4A 增补）** | 3B 全部保持；附件按 runtime×role 随草稿保存/恢复；切项目清空；迟到选图只进发起视图 | — |
| 11 | `#chat`、`.chat-empty`、`.chat-pane`、`data-state` | 已满足（3A） | 历史回放/实时事件/每角色 pane/loading/empty/queue/tool-current；`data-state` 由 role-state 派生；虚拟窗口与 `rowModelDebug` 就位 | 3B（完整卡族/队列抽屉） |
| 12 | `.msg-user/.msg-assistant/.msg-injected/.sys-*/.tool-*/.virt-spacer`、回放/锚点 | **已满足（4B/5A）** | 3B 保持；4B 新增 `delivery` 行（`.msg-delivery` + 批次事实 + 安全显示副本）、报告全文/证据/来源按钮/`persistence-state`、`task-request`/`reply-original` 折叠（精确 turnId + settled/回放）、历史报告按时间排序与身份去重、`replayAnchorDebug`；5A：full replay 前记录首个可见阅读行（文本前缀+offset+stick），布局后按 delta 还原；贴底仍走 tail、找不到同一行不动、无动画/计时器；`.virt-spacer`/`rowModelDebug` 行模型不变 | — |
| 13 | 交互卡 `.op-*`、治理卡镜像/排队、恢复卡 `#recovery-confirm` | **已满足（4B）** | 3B operator/恢复/judge 保持；4B：治理 meta/badge（`.op-gov-badge/.op-meta`）、镜像面（`.is-mirror/.op-mirror-badge/.op-mirror-source`、同 `data-request-id`、只答一次、双面冻结）、`.op-queue-aggregate`（trio 主入口唯一行）、`.op-queued`、`.op-preview`、待确认 chip `#op-chip`、抽屉覆盖时卡 `inert`；队列事实不进 runtime 快照 | — |
| 14 | shell 确认卡 `#shell-confirm/#sc-*`、命令逐字、拒绝默认焦点、Esc/关闭不放行 | 已满足（3B） | 真实 IPC（`onShellConfirm`/`shellConfirmRespond`）；shell/su 同卡不同披露（档位/命中原因/绕过写边界警告）；`#sc-command` 逐字；默认焦点 `sc-deny`；Esc/×/拒绝 = `allow:false`；仅「放行执行」= `allow:true`；等待不设限；同角色 settled/失效回执收起旧卡；冒烟 `electron-smoke` 45/45；C2 失效卡语义 4B 重锚为「收起 + 原因可见」 | — |
| 15 | 右抽屉 `#right-drawer/#right-body/#drawer-title/#drawer-close/#drawer-backdrop`、424、Esc、焦点返回 | **已满足（4A；4B queueView tab 修复）** | 424/aria-modal/Esc/焦点返回/背景 inert；card/work/pi/document 四面板；4B：任何顶层 tab 切换（工作/角色资料/设置/文档）先清空 `queueView` 再显示基础视图；抽屉保持打开、标题/焦点正确；`#right-queue-body` 唯一 | — |
| 16 | `#btn-import/#tab-pi/#project-name/#project-path/#sidebar-role-count` | **已满足（4A）** | `#tab-pi` 启用（按项目；经 drawer-store 打开设置，title/aria=「<引擎> 设置」）；角色行「当前+排队」计数 `.ti-count`；导入/切换项目真实；树分组扁平化+组长在前 | — |
| 17 | 治理记录 `#governance-status/#governance-preview/[data-governance-*]` | **已满足（4B）** | ChatHeader 承载 `#governance-status`（模型/流程/pin-mismatch/missing/invalid/next-step）与唯一非模态 `#governance-preview`（class 精确 `governance-preview`，无 backdrop/无焦点陷阱，Esc 回触发）；建立（模型选择 single/trio、写入/pin/采纳/声明、canConfirm）/重新接受（逐文件/pin/blockers/digest、取消零写、确认一次）/迁移（not-available 如实）；ChatStream 空态复用 `.chat-empty`（mismatch/无记录/不可用/治理角色说明） | — |
| 18 | Pi/引擎设置 `#pi-panel/#pi-inp-*` | **已满足（4A）** | 三引擎 Tabs；metadata 驱动字段；Pi 3 必填+推理 select+高级两 range（Slider copy-in）；Codex/Claude 字段；secret password+显示/隐藏（值恒空）；保存 loading/saved/missing/error/晚到；固定 64px 保存条；`.env` 全走主进程；不切换会话 | — |
| 19 | `window.__ansRenderer` 全量方法 | **已满足（4A + 4B 方法）** | 3B/4A 全部保持；4B：`replayAnchorDebug(roleId)` 与 `governance`（state/open/selectModel/confirm/cancel）经 `driver-extensions/*` 合并；`state.governancePreview` 只读快照；`queuedDebug()` 保持；判断结果行经每引擎缓存重放（同 id 幂等） | — |
| 20 | `state` 快照字段 | **已满足（4A + 4B 扩展）** | 3B/4A 保持；4B 新增 `governancePreview:{open,mode,loading,busy,previewDigest,canConfirm,nextStep}`；`governanceModel/governanceRecord` 保持 listing 原样 | — |
| 21 | bench `.virt-spacer`、`window.ANSMarkdown` | 已满足（3A/3A2） | bench 新入口 `BENCH_DONE=1`；`.virt-spacer`/`ANSMarkdown` 就位；3A2 优化后 3 轮 stormA 17.7/21.3/17.6ms、stormB 19.8/18.9/17.2ms | 3B/5（阈值定义） |
| 22 | 严格 CSP / 零内联 / file:// ES 模块 | 已满足（5B） | `app/renderer/dist/index.html` 无内联脚本/unsafe，CSP `default-src 'none'`；Electron 冒烟零 console 错误、零 did-fail-load；Base UI `CSPProvider` 关内联样式元素 | — |
| 23 | 令牌/圆角/图标/无裸色值 | 已满足 | `index.css` 单一来源；组件台账；扫描零裸色值/零手绘 SVG/零 Node import | — |
| 24 | 首屏预算 ≤300KB gzip | 已满足（5B 复核） | 当前 `dist/index.html` 入口引用资产 gzip level 9：JS 268,636B + CSS 19,480B + HTML 398B = **288,514B**（≤300KiB；角色显示名修复后候选） | — |
| 25 | 源码/边界守卫 | **已满足（5B）** | 旧 `renderer.test.ts` 已退役；`test/桌面UI/*.test.ts` **142/142**（source-guard：无旧 vendor/旧脚本 import、无 Node/fs/网络、无第二套 UI/图标/动画、CSP/静态入口；纯逻辑：行模型/回放/状态/事件/工具/阅读锚点）；旧 178 项逐名台账关闭 | — |
| 26 | 套件目标切换 | **已满足（5B 翻转）** | `uiux-v2`/`ime-enter`/`bench-storm`/`uiux-design-audit` 默认 `app/renderer/dist/index.html`；`ANS_RENDERER_ENTRY` 覆盖/fail-fast/断言保留；四个桌面UI 冒烟默认同步 `dist/index.html` | — |
| 27 | IME 默认新入口 | **已满足（5B）** | `ime-enter.mjs` 默认 `dist/index.html`；**26 true / 0 false / E2E_DONE=1**（组合/229/Shift+Enter/附件载荷） | — |
| 28 | uiux-v2 全量等价 | **已满足（5A/5B 收尾）** | 默认 `dist/index.html`；DELIVERY_NOTE **9/9**、COMPLETE_FLOW **41/41**（P7 官方 pass）、默认段 **110/110**（阅读锚点/重锚后）；JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 19/19、SEND_FACTS 8/8、QUEUE_VIEW 4/4、MIRROR 8/8、RUNTIME 17/17、FRESH 4/4、VISUAL 54/54；MERGE 12/12 | — |
| 31 | judge 结果行与 system 注入行 | 已满足（3B） | `shell:judge-result` allow/deny/manual（manual 无行、原卡 + `judgeNotice`）；`session:operator-judge` 治理代批行；按 `roleId`/`toolCallId` 锚定；`[系统·看护/收束]` 独立注入行与回放同解；证据 `electron-smoke`、`uiux-v2/judge` | — |
| 32 | 双开关与一次性警告 | 已满足（3B） | `shell:judge-state/set`、`decision:judge-state/set`；默认关、互不影响、重载复位、主进程权威；桥缺失禁用 +「当前版本不支持自动判断，保持手动」；single 禁用「替我决策」；开启琥珀标记 + 按组一次性警告（知道了/约 9 秒、不重复） | — |
| 33 | 队列位次与撤回（聊天流就地回执） | 已满足（3B） | 进行中/第 N 位/来源；仅客户消息可撤；`withdrawQueued(target,id)` 成功/无效就地回执，位次由真实快照刷新；抽屉队列视图仍 Phase 4 | 4 |
| 29 | UIUX 3A 评审 7 项必须 | **已满足（3A2 实现；5B 最终 A–L 复核）** | Markdown 15/15/14+列表/引用/表格；replay .88 + blocked 3px danger；工具时间/timed-out 色/异常摘要/chevron/失败直显；choice 40px 可点区/accent/`--input` 中性边；行状态存 store + 虚拟卸载重挂保持；CTA shadcn Button；`sys-config` danger；Phase 3A2 冒烟 12 组 + 4 张截图；5B design audit 31 项 0 bad | — |
| 30 | bench-storm 不劣化 | 已满足（3A2 优化后） | 同机交替 3 轮：新 stormA 17.7/21.3/17.6ms（旧 26/23.3/17.5，中位 23.3→17.7），新 stormB 19.8/18.9/17.2ms（旧 17.6/17.7/17.6）；handler ≤0.3ms；tracing 最长任务 5.58ms、createElement 4、无 longtask；证据 `bench-opt/profiling-summary.json`；登记后复核 stormA 18.9ms、stormB 18.4ms（`bench-opt/after-register.json`） | 已由 5B 4 次默认入口复跑复核（中位 A19.1/B18.6/replay11.05/scroll15.15，均低于阈值） |
| 34 | **5B 生产入口切换** | **已满足** | 唯一生产入口 `app/renderer/dist/index.html`；`app/desktop/renderer-entry` 解析（显式 `ANS_RENDERER_ENTRY` 覆盖/fail-fast）；packaged smoke 已完成；旧生产入口（326 行）已删除 | — |
| 35 | **5B 旧渲染器删除** | **已满足** | 删除旧 `renderer.js`、`styles.css`、`engine-selector.js`、`markdown.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js`；逐文件哈希见 [5B 变更记录](../change/2026-10-21_change_ui-platform-phase5b-cutover.md) | — |
| 36 | **5B vendor 删除** | **已满足** | `app/renderer/vendor/`（README/LICENSE/markdown-it.umd.min.js）已删除；新管线只用 npm markdown-it 15.0.3；source-guard/markdown pin 测试禁止回读旧 vendor | — |
| 37 | **5B e2e/冒烟默认翻转** | **已满足** | `uiux-v2`/`ime-enter`/`bench-storm`/`uiux-design-audit` 与桌面UI 3B/4A/4B/5A 冒烟默认均为 `dist/index.html`；显式覆盖/fail-fast/断言不变；默认复跑 5A 36/36、4B 70/70、3B 45/45、4A 99/99、IME 26/0、design audit 31/0 | — |
| 38 | **5B DOM 例外保持** | **保持** | 仍仅有两条：大工具组闭合延迟挂载 `DEFER_TOOL_ROWS_WHEN_CLOSED=40`（PM §10.4）；失效 operator 卡动作隐藏（PM §十三）。未新增 DOM 例外 | — |
| 39 | **驱动面最终** | **已满足** | `window.__ansRenderer` 21 个方法/状态字段；`test-driver` 快照 `state/queueByRole/paneDebug/rowModelDebug/replayAnchorDebug/queuedDebug/governance`；`window.desktop` 白名单桥；旧驱动导出段已随旧渲染器删除 | — |

### 4.0 Phase 4A 已验证证据（摘要，2026-10-21）

- **引擎真实切换/每引擎视图**：`selectRuntime` 三元身份 `openSession/getSessionHistory`；切回恢复 history/后台事件/队列/忙态/草稿；后台事件只缓存、旧项目丢弃；迟到旧引擎拒发不改当前会话/草稿（`SEND_FACTS` 8/8，关闭 P7 尾项）。冒烟 `SWITCH_* / FOREIGN_RUNTIME_* / CROSS_ENGINE_DRAFT_*` 全 true。
- **三引擎设置**：`SELECTOR 26/26`、`CONFIG 20/20`；冒烟覆盖 metadata 字段、secret 掩码/显示、Slider（aria 三值+键盘+hidden 规范值）、非预设回退、保存成功/失败/晚到、缺配入口与焦点返回。
- **资料/文档**：`ROLE_RETURN_FOCUS 9/9`；冒烟覆盖四节、独立内外层滚动、文档列表/阅读/脚本与图片安全/外部与内部链接/TOO_LARGE/IO_ERROR 重试/返回焦点/迟到失效/切角色失效。
- **工作概览/队列**：默认段 4A 项全过（`one independent work list without duplicated role documents`、队列位次/全文/撤回就地回执/焦点/960 几何）；冒烟覆盖待处理定位、角标拆分、最近回交去重、唯一 `#right-queue-body`。
- **门禁（UIUX M1–M6 修正后重跑）**：typecheck 0 错；build 成功；CSP 严格；gzip **263,904B ≤300KiB**；旧基线 679/679；新纯逻辑 67/67；IME 24/24；懒挂载 10/10；4A 冒烟 **99/99 + 28 截图**；bench（旧/新交替 4 轮、3 有效轮中位）全阈值通过；C1 Δ=16；3B 冒烟 45/45。
- **UIUX 修正**：队列子视图/撤回 system 行/Tabs 键盘/保存条两行/角色头状态-only/960 焦点-Esc-inert/200% 已按 UIUX 评审 M1–M6 实现并实测（待 UIUX 复核）。
- **已知边界**：RUNTIME 13/14 通过（`Pi own history background queue draft and expired card restored` 已按 PM §十三 的 ChatRow 最小例外通关）；唯一失败 C2 `expired old shell shown disabled in its own runtime` 按同因既有基线红待 4B/5 重锚（不阻塞 4A）；judge 结果行跨引擎重放归 4B（不宣称完整恢复）；默认段止于 Phase 5 项、VISUAL 止于 4B 报告卡项。详见 [4A 变更记录](../change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) 与 [证据](../change/2026-10-21-phase4a-evidence/)。

### 4.2 Phase 4B 已验证证据（摘要，2026-10-21）

- **门禁**：`typecheck` / `typecheck:renderer` 0 错；`build:renderer` 成功；CSP 严格（`default-src 'none'`、`script-src 'self'`、零内联/unsafe）；入口引用资产 gzip9 **284,814B ≤300KiB**；旧基线 **679/679**；`test/桌面UI` **96/96**（4A 67 + 4B 新增 29）；IME 新入口 26 true / 0 false / E2E_DONE（24 项检查基线保持）；懒挂载 **10/10**；旧渲染器/main/preload/desktop 零 diff。
- **4B 冒烟**：`test/桌面UI/phase4b-electron-smoke.mjs` **70/70**，覆盖聚合/queuedDebug/切引擎不复活/重推/expired、镜像同 id/只答一次/双面冻结/排队卡、reaccept 预览非模态/取消零写+回焦/确认一次/digest、establish 模型选择/取消零写、迁移 not-available、报告全文/persistence 重试同卡、交付批次/安全副本/历史重试/过期、菜单状态与读取次数、queueView tab 切换、single 警告刷新、judge 跨引擎重放、`replayAnchorDebug` 索引与 full rebuild 已答卡锚点最小复现、C2 收起+原因、五角色 960/200% 树行不重叠且可见/可滚动、200% 逐容器（含缺配条/治理状态/树/col-mid/composer）无横溢+头部换行+缺配全文首屏、报告卡可见+完整摘要展开内部无横溢、facts 冒号分离、取消回焦；1360/960/200% 截图；零 console/CSP。
- **uiux-v2 新入口**：QUEUE_VIEW **4/4**、MIRROR **8/8（五角色重锚）**、GOVERNANCE_REACCEPT **5/5（7 项报表含几何）**、JUDGE **33/33**、G2 **5/5**、SELECTOR **27/27**、CONFIG **21/21**、ROLE_RETURN_FOCUS **11/11**、SEND_FACTS **8/8**、TERMINAL **22/22**、TOOLFOLD **19/19**、RUNTIME **17/17（C2 重锚 pass）**、FRESH_CONTEXT **4/4**、VISUAL **54/54 PASS**（报告全文/证据/来源/折叠/交付/去重/冷报告顺序与窗口/主题/几何全部通过）；DELIVERY_NOTE 通过 7 项 4B 项后止于 Phase 5 项 `builtin identity stays data and accessible without duplicate third visible line`（左树身份徽标，Sidebar 不在 4B 写集）；COMPLETE_FLOW 官方在 P7 中止（4B C/P3 子集官方到达 5/12；只读补证副本跳过 P7 两个 Phase 5 检查后 12/12，行为通过但未在官方段到达）；默认段官方止于 Phase 5 项 `full replay preserves content identity`（虚拟窗口阅读锚点），只读补证副本仅跳过该 Phase 5 阅读/开合断言后 **100 checks PASS**（含 `denied conclusion anchor and decided card retained` 与 B1/B2/B3）。
- **热路径**：同机同日旧/新交替 3 轮：stormA maxGap 新中位 **17.8ms**（旧 25.5，阈值 25.5）；stormB **17.6ms**（旧 17.7，阈值 25）；handler A **0.5ms** / B **0.5ms**；replay **11.0ms**；scroll **2.3ms**；p95 ≤19.5、单轮 ≤19.5（≤35/≤50 护栏）。C1 **Δ=16px**（150→166，≤32 目标 ≤20）。延迟挂载 10/10。
- **C2 重锚**：`expired old shell shown disabled in its own runtime` 已按 PM §15.6 重锚为 `expired old shell collapses with reason visible in its own runtime`（卡收起 + 原因在 `composer-hint` 可见/可追溯；收起后不暴露 sc-allow/sc-close、Esc 无回包）；RUNTIME 17/17。
- **5A 冒烟**：`test/桌面UI/phase5a-electron-smoke.mjs` **36/36**，覆盖 Sidebar 身份（data/aria、无 `.ti-badge`、`.ti-count` 唯一数字）、P7 待选择（角色树/工作概览/作答回真实状态）、full replay 阅读锚点（1360/960 同一行 offset 差 <2px、贴底仍贴底）、200% 身份/P7 可见无横溢、Markdown 外链点击（`webContents.getURL()` 不变、`will-navigate` 0、`app:open-external` 记录 URL、rel=noopener noreferrer）、S0 标题/CTA 点击与键盘、200% 镜像卡徽标/来源/动作与交付批次标题+三项事实入镜、680/480 CSS 的 report/details/preview/mirror/delivery/S0 **12 项目标 bottom ≤ composer.top** 遮挡断言；21 张 1360/960/680/480 截图；200% 长历史 composer h=95 bottom=430=innerHeight、空项目 `.col-mid` 无横溢；零 console/CSP。证据 `docs/change/2026-10-21-phase5a-evidence/`。
- **5A 官方检查（新入口）**：DELIVERY_NOTE `builtin identity stays data and accessible without duplicate third visible line` **官方 pass（段 9/9）**；COMPLETE_FLOW `P7 choice pending separated from empty queue` **官方 pass**，整段 **41/41**（role reading 真滚动）；默认段 `full replay preserves content identity` **官方 pass**（before/after 同一行、offset 差 0），PM §十九批准的 toggleDrift 重锚已落地，整段 **110/110**。
- **5A 迁移台账**：[178 项逐名台账](../change/2026-10-21_phase5a-test-migration-ledger.md)，`renderer 108 + markdown 5 + tool-rows 53 + runtime-ui 12`；新 `test/桌面UI` 142/142；旧基线 683/683（原 679 + 桌面窗口 Phase 5A 新增 4 项：入口接线、dev 回退 hook、导航兜底策略、主进程导航守卫接线；桌面UI 未改这些文件）。
- **5A 门禁**：typecheck 0；build 成功；CSP 严格；gzip9 **288,552B ≤300KiB**；IME 26 true/0 false；懒挂载 10/10；TOOLFOLD 19/19（C1 150→170 Δ=20）；各段 QUEUE 4/4、MIRROR 8/8、GOV 7/7、JUDGE 33/33、G2 5/5、SELECTOR 27/27、CONFIG 21/21、ROLE 11/11、SEND 8/8、TERMINAL 22/22、RUNTIME 17/17、FRESH 4/4、VISUAL 54/54；bench 旧/新交替 4 轮（首轮预热，3 有效轮中位；A 18.3、B 17.7、replay 6.2、scroll 11.9）见证据。
- **已知边界（非 5A 红，交 5B/测试/UIUX）**：默认段 toggleDrift 与 MERGE 语义身份重锚已按 PM §十九落地并通过；COMPLETE_FLOW role reading 已官方通过；`uiux-design-audit` 已按 §十九重锚并 exit 0（12 条 v3 全过、密度 9/6）；剩余待 UIUX 书面依据：带提示条密度等价、200% 其余 A–L 场景 P2 叠加/命名观察；旧渲染器/vendor/旧测试已在 5B 删除。详见 [5A 变更记录](../change/2026-10-21_change_ui-platform-phase5a-gaps.md) 与 [证据](../change/2026-10-21-phase5a-evidence/)。
- **5B 步骤 a/b（2026-10-21）**：删除旧 `index.html`/`renderer.js`/`styles.css`/7 经典脚本/vendor 与四个旧守卫测试；`src/index.html` 逐字移到 `app/renderer/index.html`（CSP/`/src/main.tsx` 保留）；桌面UI 四个冒烟与四个 e2e 默认目标切 `app/renderer/dist/index.html`（`ANS_RENDERER_ENTRY` 覆盖/fail-fast/断言不变；3B 夹具补 `sessionCurrent:true`）。默认新入口复跑：5A **36/36**、4B **70/70**、3B **45/45**、4A **99/99**、IME **26/0**、design audit **31 项 0 bad**、单测 **142/142**；产物 `dist/index.html` SHA256 `3c4da2a2…`，gzip9 **288,530B**。详见 [5B 变更记录](../change/2026-10-21_change_ui-platform-phase5b-cutover.md) 与 [5B 证据](../change/2026-10-21-phase5b-evidence/)。角色显示名修复后新候选：`dist/index.html` `c8ad0e82…`、JS `050776ec…`、CSS `76fad7ce…`，gzip9 **288,514B**；见 [role-display-names 记录](../change/2026-10-21_change_ui-platform-role-display-names.md)。

### 4.1 Phase 2 已验证证据（摘要）

- `npm run typecheck:renderer`：通过（0 错）。
- `npm run build:renderer`：通过；`dist/index.html` + 1 JS + 1 CSS（Phase 2 当时产物路径；5B 起为唯一生产入口）；入口引用资产 gzip（level 9）JS 176,510B + CSS 11,984B + HTML 389B = 188,883B。
- 1360×860 / 960×620 截图：`docs/change/2026-10-21-phase2-evidence/`。
- 真实 Electron `file://`（`contextIsolation:true`、`nodeIntegration:false`、`show:false`、真实 preload）：
  - `#root` 已挂载、`script[type=module]` 执行、样式表加载、深色面 `rgb(20,23,26)`；
  - 标题栏 36、侧栏 248、内容列 900、胶囊 900、发送禁用；
  - 抽屉 424 / Esc / 焦点返回；确认卡 640 / 默认焦点 `sc-deny` / 命令逐字 / Esc=拒绝；
  - Phase 2b：`html.dark` 生效；`#sc-allow` 边界 `rgb(107,117,126)`（--input）；焦点环 2px solid `rgb(111,160,139)` + 3px offset；primary hover `rgb(127,178,155)` / active `rgb(94,143,122)`；Checkbox 选中 `rgb(196,161,95)`；引擎选择器 combobox/listbox/option ARIA 与键盘选择；49 项断言全 true、零 console/CSP/did-fail-load；
  - 侧栏拖宽 328、双击 248、Shift+→ 272、收起/展开保留；
  - `NO_DID_FAIL_LOAD=true`、`NO_CSP_OR_MODULE_CONSOLE_ERRORS=true`、`CONSOLE_MESSAGES=0`。
- 详细报告：`docs/change/2026-10-21-phase2-evidence/electron-smoke/report.{json,txt}`。
- **Phase 3A（2026-10-21）**：真实 listing/会话/历史/事件/虚拟窗口/工具行/状态/IME 最小发送；旧基线 679/679；证据 `docs/change/2026-10-21-phase3a-evidence/`。**Phase 3A2（2026-10-21）**：按 UIUX 评审 7 项必须补齐 Markdown 排版、回放/受阻、工具时间/超时色/摘要/chevron、choice 可点性与状态提升、虚拟卸载重挂保持、CTA 与 `sys-config` 危险色；ime 24/24；bench `BENCH_DONE=1`；新纯逻辑测试 18/18；gzip 250,017B；Phase 3A2 冒烟 12 组 + 4 张截图；bench 热路径优化后 3 轮 stormA 中位 17.7ms、stormB ≤19.8ms（tracing 最长任务 5.58ms），证据 `docs/change/2026-10-21-phase3a2-evidence/`。uiux-v2 目标切换已接但全量等价未达（当前失败见三态表 #28）。
- **Phase 3B（2026-10-21）**：真实 shell/su/恢复确认卡、judge 结果行与双开关、发送/停止/队列撤回/附件完整 UX、`[系统·]` 注入行；`#composer-hint` 空即空；C1 尾部折叠 Δ=16px。证据 `docs/change/2026-10-21-phase3b-evidence/`：typecheck/build/CSP/gzip 240,133B；新纯逻辑 33/33；旧基线 679/679；IME 24/24；延迟挂载 10/10；Electron 离线 IPC 冒烟 **45/45** + 18 张 1360/960 截图；bench 旧/新交替各 4 轮（首轮预热）全阈值通过；uiux-v2 JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17、默认段 9/10、SEND_FACTS 8/9、QUEUE_VIEW 1/2（余项均为 Phase 4 功能面）。

## 五、Phase 3/5 双端逐 check 名对照的执行方式

### 5.1 目标切换

- 最终四套件均以 `app/renderer/dist/index.html` 为默认目标；`ANS_RENDERER_ENTRY` 保留为显式覆盖（绝对 HTML 路径，缺失 fail-fast exit 2）：
  - `uiux-v2.mjs`、`ime-enter.mjs`：默认 `path.join(APP, 'renderer/dist/index.html')`；`win.loadFile` 用它。
  - `main.mjs`：经 `app/desktop/renderer-entry` 解析唯一入口；重载路径 `app:reload-interface` 同步。
  - `bench-storm.mjs`：`BENCH_RENDERER_DIR` 默认 `<repo>/app/renderer`，入口 `dist/index.html`；`ANS_RENDERER_ENTRY` 可覆盖。
- 新目标**只换入口**，不换断言；旧入口已删除，不再有双端运行。

### 5.2 逐 check 名对照

1. 旧端（基线）：已随 5B 删除，不再运行；历史基线名单留在 5A 迁移台账与 5A/4B 证据中。
2. 新端：默认 `app/renderer/dist/index.html` 运行全部套件（显式 `ANS_RENDERER_ENTRY` 仅用于临时对照/故障复现）。
3. 归一化：套件名 → `{checkName: value}`；`main` 解析 `report.txt` 的 `NAME=value`；`bench` 只比较指标名（`stormA.*`、`stormB.*`、`replay.*`、`scrollToBottom.*`、`mounted`），阈值由测试在 Phase 3 前书面定义。
4. 对照规则：
   - **集合相等**：新端必须包含旧端全部 check 名；缺名 = 失败（不得静默跳过）。
   - **布尔相等**：同一 check 名新旧值一致；UI 迁移不得通过放松断言换取绿色。
   - **允许差异**：仅限已批准的口径变更；记录「旧名 → 新名 / 旧值 → 新值 / 批准依据（评审或客户日期）」。
   - **新增 check**：新渲染器可以有额外 check（如 `#root`、`CONFIRM_CARD_640`），不要求旧端存在。
5. 证据：5B 收尾以最终新入口报告为准（`docs/change/2026-10-21-phase5b-evidence/`）；历史 old/new 对照与允许差异记录在 5A 迁移台账/证据中。

### 5.3 阶段门

- **Phase 3**：`uiux-v2` 的聊天流/工具行/确认卡/恢复卡/治理卡段、`ime-enter` 24 名、`bench-storm` 同指标不劣化；逐 check 名对照通过。
- **Phase 4**：设置/抽屉/资料/引擎选择段（`CONFIG_ONLY`、`SELECTOR_ONLY`、`PROFILE` 等）逐 check 名对照。
- **Phase 5（已完成）**：`main.mjs` 整机自检 `E2E_PASS=true`；全部套件默认新入口复跑（5A 36/36、4B 70/70、3B 45/45、4A 99/99、IME 26/0、design audit 31/0）；旧渲染器/vendor/旧守卫测试已删除；生产入口唯一 `dist/index.html`；packaged smoke 完成。

## 六、风险与待办

1. **最终入口（已关闭，5B）**：唯一生产入口 `app/renderer/dist/index.html`，源入口 `app/renderer/index.html`（Vite input）；`app/desktop/renderer-entry` 解析并支持显式 `ANS_RENDERER_ENTRY` 覆盖；packaged smoke 已完成；旧入口/旧构建路径已不存在。
2. **引擎选择器契约（已关闭，Phase 2b）**：评审决定不改旧契约；已用自绘 `EngineSelect` 恢复 `role=combobox`/`aria-haspopup=listbox`/`role=option` 与键盘行为，Electron 冒烟实测通过。`DropdownMenu` 组件保留供未来行溢出菜单。
3. **Base UI 控件的隐藏 input**：`Checkbox` 的 `id` 落在隐藏 input 上（可见 `role=checkbox` span 由 Base UI 生成 id）。Phase 3/4 接双开关时需按真实 DOM 调整 e2e 选择器或在组件层补 `id` 透传；旧 e2e 直接读 `#auto-approve-toggle.checked` 的断言会受影响。
4. **`tw-animate-css` 惰性类**：菜单/弹层的 `animate-in` 类无 CSS；如 UIUX 要求菜单入场动画，Phase 3 用 Motion 或经 PM 批准加依赖，不得静默安装。
5. **Bench 指标口径**：Phase 2 未跑 bench；Phase 3 前由测试固化旧基线并定义「不劣化」阈值（PM Q5/Q10）。
6. **`main.mjs` 属桌面窗口**：本清单只读提取；目标切换与环境变量由该角色落地，桌面UI 配合新入口。
7. **Phase 2 未实现的驱动方法**：见 `window.__ansRenderer.unimplemented`；调用前先检查，不得把「方法存在」误当「能力已接」。
8. **EngineSelect 的 React 状态**：Phase 2b 自绘触发器已恢复旧 ARIA/键盘契约，但旧 e2e 的「长标签」用例通过直接改 `.engine-value`/`.engine-option-name` 的 DOM 文本再触发菜单来验证 title/aria-label；React 组件以 state 为准，不会读取这类外部 DOM 变异。Phase 3 应改为通过 props/驱动或更新该用例，不要把它当作新渲染器的失败。

## 七、已批准 DOM 契约例外：大工具组延迟挂载（PM §10.4）

**批准**：项目管理评审 [2026-10-21_review_ui-platform-round.md §10.4](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) 批准为**本轮唯一、限定范围**的 DOM 契约例外；其他 DOM 差异不得静默扩展，须另行报 PM。

**登记常量与精确行为**：
- 常量：`DEFER_TOOL_ROWS_WHEN_CLOSED = 40`（`app/renderer/src/chat/ChatRow.tsx`）。
- 条件：**同一个连续工具组**（正常按 turnId 连续分组；无轮次身份时同一连续段同组）在 `details.open === false` 且组内**调用数 >40**（`mergePhases` 行数，不是相位条目数）时，内部 `.tool-activity-list` 延迟挂载。
- 保持：组摘要始终可见，包含调用数、工具分解、失败/未放行计数与状态未记录；失败/未放行 `.sys-denied` 直显行在组外始终挂载，不因该例外隐藏。
- 展开：点击组摘要后立即挂载全部内部活动行（内容、顺序、`data-activity-index/phases` 与旧口径一致）。
- 小/运行中组：**≤40 调用的小工具组保持旧契约**（即使闭合也挂载）；新开/运行中的组按既有展开语义挂载，不因该常量跳过。
- 折叠/滚动：再次闭合后大组内部行可卸下；虚拟卸载/重挂不影响摘要、异常直显与手动开合状态。

**理由**：bench-storm 归因显示，默认折叠的大工具组仍每批全量重建 300 个 React/DOM 行（`createElement` 1,805 次，最长 React `FunctionCall` 10.36ms），是 storm maxGap 回归主因；摘要和直显不受影响，展开仍即时。

**测试规则**：查询**闭合大组**内部活动行前必须先展开该组；不得把「闭合时内部行 0」当作数据丢失。现有 e2e 最大夹具 12 调用，不触发该例外。测试角色将按 PM §10.4 新增闭合大组正向检查（0→展开后挂载→内容正确→折叠稳定）。

**实现确认（2026-10-21）**：Electron 验证 `defer-tool-rows-verify.json`：60 调用闭合时 `.tool-records` 1 个、内部 `.tool-activity` **0**、摘要「本轮 60 个调用：read_file ×60」；点击摘要后 60 行全部挂载（首/末为 `docs/f0.md`/`docs/f59.md`）；再次折叠回到 0；10 调用小组闭合时仍挂载 10 行。

## 七之二、已批准 DOM 契约例外：失效 operator 卡动作隐藏（PM §十三，2026-10-21）

**批准**：PM §十三 批准 `app/renderer/src/chat/ChatRow.tsx` **唯一一处**最小例外（4A 冻结写集例外；旧 `freezeOperatorCard` 同义）。

- 条件：operator 卡 `state !== "open"`（失效/已作答/过期）。
- 行为：`.op-actions` 及 `op-confirm/op-deny/op-submit/op-cancel` 置 `hidden`；`disabled`、`finalNote`（`.op-note`）、`aria-label`、卡片容器与选项只读态保留；不隐藏卡片本身、不留可点死按钮。
- 测试：RUNTIME `Pi own history background queue draft and expired card restored`（`.op-confirm.hidden`）；4A 冒烟 `EXPIRED_OPERATOR_CARD_HIDES_ALL_ACTIONS_KEEPS_REASON`；截图 `1360/960-operator-expired`。
- 边界：不扩展到其它行类型；其它 ChatRow 改动仍须回 PM。大工具组延迟挂载例外（`DEFER_TOOL_ROWS_WHEN_CLOSED=40`）继续唯一于工具组。

## 附：完整唯一选择器集（uiux-v2，静态提取）

以下为 `uiux-v2.mjs` 中 `querySelector/querySelectorAll` 的唯一选择器（199 项），按字面保留；动态模板已标注 `=` 截断处。

```
#attach-row .attach-chip
#btn-start-primary
#chat .chat-empty
#chat .chat-pane
#chat .chat-pane > .virt-spacer
#chat .chat-pane[data-role-id=
#chat .governance-judge-row
#chat .msg
#chat .msg-assistant
#chat .msg-handback
#chat .msg-injected
#chat .msg-injected.is-system
#chat .msg-injected.is-system .mi-chip
#chat .msg-user
#chat .op-actions
#chat .op-confirm
#chat .op-deny
#chat .op-request
#chat .op-request .op-preview
#chat .op-request .op-preview-body
#chat .shell-judge-row
#chat .sys-denied
#chat .sys-denied > summary
#chat .sys-settled
#chat .tool-activity
#chat .tool-call-record
#chat .tool-current
#chat .tool-records
#chat .tool-records summary
#document-read-text a
#document-read-text script,#document-read-text img,#document-read-text iframe
#governance-preview
#governance-preview [data-governance-cancel]
#governance-preview [data-governance-reaccept]
#governance-status [data-governance-reaccept]
#right-body #right-queue-body
#right-body .q-actions
#right-body .q-feedback
#right-body .q-full
#right-body .q-item
#right-body .q-toggle
#right-body .q-withdraw
#right-body button
#right-body details
#right-body details[data-section]
#role-tree .st-error
#role-tree .st-working
#role-tree .ti-status
#role-tree .tree-item
#role-tree .tree-item .ti-sub
#runtime-option-claude .engine-option-name
.app
.capsule > textarea
.chat-empty
.chat-head
.chat-head #tab-card
.chat-head #tab-work
.chat-pane
.chat-pane[data-role-id=
.col-left
.col-mid
.compose-note
.composer
.composer-bottom #btn-send
.composer-bottom #composer-scope
.delivery-batch-facts
.delivery-execution
.delivery-report
.delivery-report button
.document-list li
.document-list-meta
.document-source-note
.engine-value
.hb-complete-summary
.hb-head
.hb-meta
.hb-summary
.mi-body
.mi-chip
.msg
.msg,.tool-records,.sys-denied
.msg-assistant
.msg-assistant.is-streaming
.msg-delivery
.msg-delivery .delivery-batch-facts .persistence-message
.msg-delivery > .persistence-state
.msg-delivery button
.msg-handback
.msg-handback .persistence-message
.msg-handback .persistence-state button
.msg-handback .report-source-button
.msg-handback button
.msg-user
.msg-user.is-replay
.op-actions button
.op-confirm
.op-deny
.op-judge-notice
.op-mirror-badge
.op-mirror-source
.op-note
.op-options input
.op-queue-aggregate
.op-title
.op-tool-lifecycle
.pending-locate
.persistence-message
.persistence-state
.persistence-state button
.pi-panel-title
.projection-flags
.q-actions
.q-full
.q-item:not(.is-running)
.q-text
.q-toggle,.q-withdraw
.recent-report
.recent-reports
.reply-original
.reply-original .msg-assistant
.reply-original .sys,.reply-original .tool-records,.reply-original .op-request
.reply-original > summary
.report-actions
.report-body
.report-complete
.report-complete > summary
.report-disclaimer
.report-eyebrow
.report-facts
.report-source-button
.report-title
.report-top
.report-top .report-eyebrow
.role-document-entry
.safe-input-copy
.safe-input-copy summary
.session-actions #runtime-select
.sidebar-foot #btn-import
.sidebar-foot #tab-pi
.sidebar-toggle
.st-restored
.sys-call
.sys-config
.sys-delivery-note
.sys-notice-badge
.sys-notice.is-replay
.sys-notice:not(.is-replay)
.sys-queue
.sys-replay-divider
.sys-text
.sys-unknown-tool-event
.task-request
.ti-builtin
.ti-name
.ti-power
.tool-activity
.tool-call-details
.tool-call-record
.tool-call-status
.tool-call-target
.tool-records
.tool-row,.activity-row,details
.tree-group
.tree-group-fold
.tree-group:nth-child(3)
.tree-item.builtin:not(.primary)[data-role-id]
.tree-item.primary
.tree-item.primary[data-role-id=
.tree-item[data-role-id]
.turn-terminal
:scope > .delivery-batch-facts
:scope > .persistence-state
[data-doc-action=
[data-doc-id=
[data-doc-id]
[data-governance-reaccept]
[data-governance-reaccept]:not([disabled])
[data-request-id=
[data-role-id=
[role=
body *
button
dd
details
details.tool-call-record
details[data-section=
dt
h2
input
li
script
script,img
strong
summary
summary .projection-flags
summary strong
svg
table
```
