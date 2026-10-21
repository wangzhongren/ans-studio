---
id: phase3a-check-ledger
type: change
title: Phase 3A / Phase 3 门 check 名台账（A/B/C/D）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase3a-independent-verification, ui-platform-round-review, ui-platform-phase3a-chat]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM 评审 §10.1/§10.5 与协调者派发，从实际报告整理 A/B/C/D 四类 check 名（不计数代替），并附延迟挂载正向检查结果
  - date: "2026-10-21"
    kind: revised
    summary: 按 PM §十一.3/§11.4 更新：C1 标为已收敛 Δ=16；B 类失败映射 4A/4B；其余默认段 check 按功能面归组；列 4A 新增 check 建议与独立验证口径
  - date: "2026-10-21"
    kind: revised
    summary: 按 PM §12.1 裁定更正：QUEUE_VIEW 四项（.op-queue-aggregate/queuedDebug）全部归 4B；4A 只保留抽屉队列 VISUAL 子集；§7.3 删除 QUEUE_VIEW 项；§7.4 4A 验收段移除 QUEUE_VIEW
  - date: "2026-10-21"
    kind: revised
    summary: 4B 授权后追加 §八：4B 必过 check 名（QUEUE_VIEW 4、默认 21、VISUAL 报告卡、JUDGE/G2、C2 重锚、judge 跨引擎重放、queueView tab 切换、菜单配置状态）、4B/Phase 5 归属与验证口径；保留 4A 基线不重开  - date: "2026-10-21"
    kind: revised
    summary: 按 PM §15.7 定稿 §8.4：列 DELIVERY_NOTE 5 / COMPLETE_FLOW C·P3 12 / VISUAL 报告面 20 的精确 4B 必过名与留 Phase 5 名单；确认 QUEUE_VIEW 4、MIRROR 8、GOV 实际 7（PM 记 5）、JUDGE 33/G2 5、4A 六段基线；追加 C2 重锚口径提案（收起+原因/退役，桌面UI 落地、测试复验）
  - date: "2026-10-21"
    kind: revised
    summary: 4B 独立验证结果入账 §8.7：大部分通过；C2 重锚（原因不可见）与默认段 B1 锚点（full rebuild 落尾）两项真红；FLOW 官方仅到达 5/12、补证副本 12/12；结论 4B needs-work、Phase 4 门不关闭
  - date: "2026-10-21"
    kind: revised
    summary: 4B 返工聚焦重验入账 §8.8：C2 与已答卡锚点两项真红修复，RUNTIME 17/17、VISUAL 54/54、FLOW 补证 12/12、默认段补证 100 布尔全过；4B pass、Phase 4 门关闭

---

# Phase 3A / Phase 3 门 check 名台账

依据：PM [Phase 3 门裁定](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) §10.1（四类台账）与 §10.5（3B 前置）。名单从**实际报告文件**提取，不以计数代替：

- ime：`2026-10-21-phase3a-verification-evidence/ime/report.txt`（新入口 24/24）
- uiux-v2 默认段：`.../uiux-v2/new-default-report.json`（新入口）与 `old-default-report.json`（旧入口对照）
- toolfold：`.../uiux-v2/new-toolfold-report.json` 与 `old-toolfold-report.json`
- 测试冒烟：`.../electron-smoke/report.json`（30 项）
- 延迟挂载正向检查：`.../lazy-toolgroup/report.json`（10 项，见 §五）

> 说明：uiux-v2 报告中的非布尔条目（几何读数、锚点偏移观察）不是 check，单列于附录，不计入四类判定。

## 一、A 类：3A 范围内双端通过（必须名单）

### A1 `ime-enter` 新入口 24 名（与旧端同名，PM §10.1 必过）

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

（`ATTACHMENT_READY` 在套件中随场景出现多次，名字唯一；`E2E_DONE=1` 为收尾标记，不是 check。）

### A2 `uiux-v2` 默认段前 8 项（新入口 = true；旧入口同名 = true）

1. `routine collapsed; failure direct; assistant untouched`
2. `single brief real write fact`
3. `default failure shows known path`
4. `known shell exit survives literal semicolon`
5. `full target plus unknown target honest`
6. `live failed reason visible in summary`
7. `before-execution rejection keeps visible reason`
8. `unknown is honest count`

### A3 `uiux-v2` toolfold 段前 12 项布尔检查（新入口 = true；旧入口同名 = true）

1. `fold running stays expanded with live rows`
2. `fold running summary carries calls breakdown and not-released mark`
3. `denied phase merges into its own call row and group is not cut`
4. `settled folds the turn group with summary intact and denied row still direct`
5. `manual expand after fold restores every row identity zero loss`
6. `second turn opens its own group while running`
7. `manual collapse during running survives later appends`
8. `manual collapse survives settle auto fold`
9. `failed phase marks the fold summary with failure count`
10. `failed turn folds with failure mark retained`
11. `windowed tail group open while its turn runs`
12. `reader anchor row is real and visible before fold`

### A4 operator `toolCallId` 锚点冒烟（PM §10.1 必过；新端独有，旧端不适用）

- `OPERATOR_TOOLCALLID_ANCHOR`（测试角色 Phase 3A 冒烟；op index = row count−2，前一行 kind=activities（run_shell）、后一行 kind=assistant（after-tool））

### A5 门禁级检查（非套件 check 名，按 PM §10.1 必过）

| 门禁项 | 证据 | 结果 |
| --- | --- | --- |
| `ime-enter` 新入口 24/24 且同名 | `ime/report.txt` | 24/24 |
| operator 锚点冒烟 | `electron-smoke/report.json` | true |
| `bench-storm` 阈值（含预热/离群规则） | `bench/00-threshold-preregistration.md`、`bench/01-analysis.txt`、`bench/bench-*.json` | 通过（PM §10.3 已裁定） |
| 新纯逻辑单测 18/18 | `new-unit-tests.log` | 18/18 |
| 旧基线 679/679 | `desktop-tests.log` | 679/679 |
| typecheck/build/CSP/预算 | `typecheck-renderer.*`、`build-renderer.*`、`dist-static-scan.txt` | 通过（gzip9 250,209B） |
| 3A2 冒烟 12 组 + UIUX 3A2 pass | UIUX 评审「3A2 复核」 | pass（UIUX） |

**A 类计数：45 个具名 check（24+8+12+1）＋ 7 项门禁级检查。**

## 二、B 类：未实现功能按阶段延期（名单 + 阶段/属主）

### B1 工作概览/队列抽屉（Phase 4；属主：桌面UI）

- `one independent work list without duplicated role documents`（uiux-v2 默认段第 9 项；依赖 `#tab-work` → `#right-body #right-queue-body` / `.q-item` / `drawer-title=工作概览`）
- 关联未实现：`#right-queue-body`、`.q-item`、`.q-full`、`.q-toggle`、`.q-withdraw`、`drawer-title=工作概览`、`#tab-work` 启用（PM §10.5 明确不得为此拉进 3B）

### B2 uiux-v2 默认段其余 81 项（Phase 4 逐步扩段对照、全量对照 Phase 5；属主：桌面UI）

> 旧入口均已有同名 check（本次旧入口 90/91 布尔通过，唯一红见 C2）；新入口待对应功能实现后逐步纳入对照。

```
snapshot keeps independent role document open
snapshot keeps full after independent role document and back
keyboard tabs to full
keyboard collapses full
keyboard expands full
keyboard tabs to withdraw
role geometry 1360
queue full/grid/action rect 1360
pi geometry 1360
Pi only one title/close 1360
growing composer avoids drawer 1360
closed no horizontal overflow 1360
role geometry 960
queue full/grid/action rect 960
pi geometry 960
Pi only one title/close 960
growing composer avoids drawer 960
closed no horizontal overflow 960
B independent no A image
A draft image resources full restored
late pick does not touch B
late pick stored in A
late send leaves B untouched
success clears original A sent items
halt preserves queued 3/full
withdraw pending retains item
failed withdraw full retained
withdraw failure inline next to action
withdraw failure keeps draft image resources
thrown withdrawal error inline and retryable
keyboard withdrawal response retains same action
snapshot preserves failure inline
late withdraw not B feedback
late withdraw belongs A item
success uses real returned snapshot
historical own-template failures direct
historical failure reasons visible without expand
virtual visible nonempty
group materialized and open
user-open group survives unrelated incremental
stable group restored after full prefix insertion
detached-pane role rowlist built before mount
detached-history role mounted windowed
detached-history pane reads same row gap as attached pane
denied conclusion anchor and decided card retained
pending locator visible after role click
open pending supersedes true busy
pending entry fully reachable with card 960
covered pending actions unavailable card
keyboard locate closes card and exposes all actions
pending entry fully reachable with pi 960
covered pending actions unavailable pi
keyboard locate closes pi and exposes all actions
keyboard reaches original preview
keyboard expands original preview
expanded preview renders controlled markdown
expanded preview stays inside card width
keyboard enters original confirm action
keyboard reaches deny action
answered pending returns to true busy
idle after answered removes work
keyboard reaches retained image removal
keyboard returns to input above toolbar
keyboard returns to composer image toolbar
pending arrival preserves drawer
expired request restores actual true busy
ordinary question creates no pending
runtime groups lead first and unknown metadata escaped
new engine no Pi history queue confirmation or draft
old engine envelopes cache only and stale project ignored
actual Codex call/result target correlation and completion
Codex secret fallback and optional official Responses settings
failed save keeps draft and honest error
saved secret cleared and busy apply timing truthful
runtime settings geometry 1360
runtime settings geometry 960
Claude required key and optional SDK model endpoint
failed outcome remains error
failed native restore honest rebuilding notice
foreign runtime shell caches without showing in current engine
Pi own history background queue draft and expired card restored
```

### B3 `main.mjs` 整机自检（Phase 5；属主：桌面窗口，测试复核）

- 套件：`test/桌面应用/e2e/main.mjs`（323 条 `NAME=` report 行）；Phase 5 双端逐名对照时按 `NAME=` 行名建清单，本轮不预列未运行的名字。

### B4 3B 卡族/输入区（Phase 3B；属主：桌面UI，UIUX 复核）

| 功能/check 面 | 关键 DOM/契约 | 阶段 |
| --- | --- | --- |
| 真实 shell 确认卡 IPC | `#shell-confirm`、`#sc-command/-summary/-reason/-details/-allow/-deny/-hint`、`shell:confirm-request` / `shell:confirm-response`、su 档位 | 3B |
| 恢复确认卡 | `#recovery-confirm`、`#rc-*`、`recovery:confirm-request` / `recovery:confirm-response` | 3B |
| 双开关（替我审批/替我决策）与判断结果行 | `#shell-judge-warning*`、`#judge-decision-toggle/-label/-status`、`#auto-approve-toggle/-label/-status` | 3B |
| 停止本轮 | `#btn-halt`、`session:stop`、队列保留语义 | 3B |
| 完整附件 UX | `#attach-row .attach-chip`、粘贴/拖入/缩略图（最小选图已具备） | 3B |
| delivery/persistence/报告全文卡片、operator 镜像/队列聚合 | `.delivery-*`、`.persistence-*`、`.report-*`、`.op-mirror-*`、`.op-queue-aggregate`（契约行 12/13 标 3B/4） | 3B/4 |

### B5 Phase 4 其它功能面（属主：桌面UI）

| 功能/check 面 | 关键 DOM/契约 | 阶段 |
| --- | --- | --- |
| 设置 / Pi 面板 | `#pi-panel`、`#pi-inp-*`、`#pi-save`、`#pi-status`（CONFIG_ONLY 段） | 4 |
| 治理记录 | `#governance-status`、`#governance-preview`、`[data-governance-reaccept]`、`[data-governance-cancel]` | 4 |
| 角色资料/文档抽屉真实内容 | `#right-body`、`details[data-section]`、`[data-doc-id]`、`#document-read-*` | 4 |
| 引擎选择真实会话/设置 | `SELECTOR_ONLY`、`RUNTIME_UI_ONLY` 段、`#runtime-option-*` 真实动作 | 4 |
| 工作概览/队列抽屉 | 同 B1 | 4 |

**B 类计数：82 个 uiux-v2 具名 check（B1 1 + B2 81）＋ 1 个套件（main.mjs）＋ 11 个功能面（3B 6、Phase 4 5）。**

## 三、C 类：既有基线红（单独登记，不计 3A 新红）

| # | check 名 | 实测 | 阈值 | 属主 | Phase 5 判据 |
| --- | --- | --- | --- | --- | --- |
| C1 | `tail fold movement bounded and non accumulating with the reading row still in view`（toolfold 段） | **已收敛（3B）**：新入口 `150→166` **Δ=16px**（非累积）；旧入口 `150→182` **Δ=32px**。（3A 时新端曾 `150→201` Δ=51，仅作历史） | 收敛目标 **≤20px** | 桌面UI（已达成；Phase 5 复验） | Phase 5 判据：**新 Δ≤32px**；目标 ≤20px；当前 16 同时满足；测试复验、不放宽断言 |
| C2 | `expired old shell shown disabled in its own runtime`（uiux-v2 旧入口默认段第 91 项） | 旧入口 = false（旧渲染器零 diff，属既有基线红） | — | 桌面UI（旧渲染器） | 旧渲染器随 Phase 5 下线即退役该 check；若保留旧入口则须复验。不得以新端未跑到该名为由掩盖 |

**C 类计数：2。**

## 四、D 类：新渲染器独有 / 旧端不适用

> PM §10.1 必过的 operator 锚点已计入 A4；D 列表保留其名以便索引，但**不重复计数**。

### D1 测试角色 Phase 3A 离线 IPC 冒烟（30 项，新端独有）

```
MOUNT_AND_BRIDGE
ANSMARKDOWN_PRESENT
SUBSCRIPTIONS_INSTALLED
LOAD_PROJECT
SELECT_ROLE_OPENS_SESSION
VIRTUAL_220_ROWS
VIRTUAL_WINDOWED_MOUNT
VIRTUAL_TAIL_AT_BOTTOM
OPERATOR_TOOLCALLID_ANCHOR   （同时列 A4）
OPERATOR_CHOICE_RENDER
STATUS_AWAITING_OVER_BUSY
STATUS_WORKING_AFTER_EXPIRE
STATUS_IDLE
STATUS_ERROR_AND_SYS_CONFIG_DANGER
STATUS_WORKING_OVER_PREV_ERROR
MARKDOWN_XSS_NEGATIVES
MARKDOWN_SAFE_LINK_AND_FORMAT
VIRTUAL_UNMOUNT_REMOUNT_STATE
IME_COMPOSITION_NO_SEND
IME_SEND_ONCE_WITH_PAYLOAD
ATTACHMENT_CHIP_AND_PAYLOAD
IME_GUARD_229_ISCOMPOSING_SHIFT
ROW_MODEL_DEBUG
PANE_DEBUG
PAGE_CSP_VIOLATIONS_ZERO
NO_CONSOLE_ERRORS
NO_DID_FAIL_LOAD
NO_PRELOAD_ERRORS
NO_RENDER_GONE
SCREENSHOT
```

### D2 大工具组延迟挂载正向检查（10 项，新端独有；PM §10.4）

```
LAZY_GROUP_CLOSED_GT40
LAZY_CLOSED_INTERNAL_ZERO
LAZY_SUMMARY_CALLS_AND_EXCEPTION
LAZY_DENIED_DIRECT_VISIBLE
LAZY_EXPAND_MOUNTS_ALL
LAZY_EXPAND_CONTENT_CORRECT
LAZY_RECOLLAPSE_INTERNAL_ZERO
LAZY_VIRTUAL_STABILITY
SMALL_GROUP_CLOSED_STILL_MOUNTED
NO_CONSOLE_ERRORS
```

脚本：`test/测试/phase3a-lazy-toolgroup-check.mjs`（离线 preload：`test/测试/phase3a-lazy-toolgroup-preload.cjs`）。实跑（见 §五）：新入口 **10/10、exit 0**；旧入口不适用（旧渲染器对这些事件形态不构建 `.tool-records`，不能作为失败判据）。

**D 类计数：30 + 10 = 40 个新端 check；扣除与 A4 重复的 1 名，唯一新增 39 个。**

## 五、延迟挂载正向覆盖：阈值与实跑

**检查设计（PM §10.4 要求）**：同一轮 45 个调用（90 个相位 + 1 条未放行；>40）默认折叠 → 内部活动行 **0**；摘要显示「本轮 45 个调用…含 1 条未放行」；未放行 `.sys-denied` 直显（outside.md）；展开 → 45 个合并活动行立即挂载且 file-1/file-45/已拒绝相位可见；再折叠 → 0；滚动离屏（160 行前置正文保证卸载）→ 回窗仍闭合、摘要完整、再展开 45；≤40 的小组（3 调用）闭合仍挂载 3 行。控制台错误 0。

**命令与结果（新入口）**：

```
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs
→ LAZY_TOOLGROUP_SUMMARY {"total":10,"passed":10,"failed":0}
→ LAZY_TOOLGROUP_DONE=1，exit 0
```

证据：`2026-10-21-phase3a-verification-evidence/lazy-toolgroup/{report.json,run.log,old-entry-run.log}`。阈值：闭合 >40 组内部活动行恰 0；展开恰 45；小组闭合恰 3；摘要/直显文案如上。

## 六、PM 复核所需结论

1. **A**：45 个具名 check + 7 项门禁级检查通过；ime 24 名与旧端同名；uiux-v2 8 + toolfold 12 的新旧同名检查均 true；operator 锚点 true。
2. **B**：82 个 uiux-v2 具名 check（工作概览 1 + 其余 81）与 `main.mjs` 套件按 Phase 4/5 延期；3B 6 个功能面、Phase 4 5 个功能面均已列名与属主。
3. **C**：2 条既有基线红已登记；toolfold 锚点**已收敛**（新 Δ=16，150→166；旧 Δ=32），Phase 5 判据「新 Δ≤32、目标 ≤20」当前已满足；旧渲染器 check 随下线退役。
4. **D**：39 个新端独有 check（30 冒烟 + 10 延迟挂载，operator 锚点跨列 A/D 不重复计数）；延迟挂载正向检查 10/10 实跑通过，例外边界（>40 且闭合；摘要/直显保留；展开立即挂载；≤40 保持旧契约）有可执行断言。
5. 台账中的 check 名均来自实际报告或已实跑脚本；未运行的名字（B3/main.mjs、B4/B5 未实现面）只作阶段登记，不作为通过证据。

## 七、Phase 4（4A/4B）映射与 4A 验证口径（2026-10-21，PM §十一.3/§11.4）

> 本节只更新台账与测试映射，**未运行任何实现测试**。依据：PM 评审 revision 5 §十一（Phase 3 关闭、Phase 4 授权 4A→4B）与 §11.4 派发前置第 3 项。C1 已在 §三更新为「已收敛 Δ=16（150→166），旧 32，目标 ≤20，Phase 5 判据新 Δ≤32」。

### 7.1 B 类失败项 → 子阶段

| 原台账项 | 失败/待验 check 名（关键） | 子阶段 | 说明 |
| --- | --- | --- | --- |
| B1 工作概览/队列抽屉 | `one independent work list without duplicated role documents` | **4A** | `#tab-work` → `#right-body #right-queue-body` / `.q-item` / `drawer-title=工作概览` |
| B2 / B5 每引擎会话 | `P7 old runtime rejected result cannot disable current runtime or overwrite draft` | **4A** | 真实引擎切换与每引擎会话/历史/草稿（当前 `selectRuntime` 仍本地投影） |
| B5 队列抽屉（VISUAL 子集） | 抽屉队列位次/来源/全文/撤回（4A 新 check 建议见 §7.3） | **4A** | 只做抽屉内的可见子集，不碰 `chat-store`/`ChatStream` 热路径 |
| QUEUE_VIEW（operator 排队聚合） | `queued baseline shows two`、`runtime view restore does not revive old queued requests or aggregate`、`main-process repush rebuilds aggregate with new count only`、`clearing queue removes aggregate`（共 **4 项**） | **4B** | 断言 `#chat .op-queue-aggregate` 与 `queuedDebug`，属 §11.2 的 4B 面；**4A 验收不含 QUEUE_VIEW**；若 4A 实施发现必须改 operator 聚合，停手回 PM（PM §12.1） |
| B4 治理与回执 | 治理三权卡/镜像/排队聚合；治理记录建立/重新接受与迁移预览；报告全文/persistence/delivery；operator 镜像；`replayAnchorDebug`；single 切换刷新一次性警告 | **4B** | 3B 观察项「切 single 后旧『替我决策中』警告行残留」并入 4B |
| B5 拆分 | 设置/Pi 面板、资料抽屉、引擎真实选择 | **4A** | 与 B1 同属 4A 授权面 |
| B5 治理记录动作 | `#governance-status/#governance-preview/[data-governance-*]` 建立/重新接受/迁移预览 | **4B** | 不提前塞进 4A |

### 7.2 其余默认段 check 的功能面归属（关键名保留；全量名单见下表）

- **4A（引擎/设置/资料/抽屉队列/工作概览 + 其解锁后继续执行的输入区草稿/附件检查）**：50 项。
- **4B（交互卡/待办/预览/决定/回执 + operator 排队聚合）**：21 项（另加 QUEUE_VIEW 段另外 3 名，共 24 个 4B check 名）。
- **Phase 5（聊天核心/虚拟窗口/历史回放等全量等价）**：11 项。

#### 4A：工作概览 / 抽屉队列（含几何与撤回；VISUAL 子集，不含 QUEUE_VIEW）

```
keyboard tabs to withdraw
queue full/grid/action rect 1360
queue full/grid/action rect 960
halt preserves queued 3/full
withdraw pending retains item
failed withdraw full retained
withdraw failure inline next to action
withdraw failure keeps draft image resources
thrown withdrawal error inline and retryable
keyboard withdrawal response retains same action
snapshot preserves failure inline
late withdraw not B feedback
late withdraw belongs A item
success uses real returned snapshot
```

#### 4A：角色资料抽屉 / 文档阅读（含几何）

```
snapshot keeps independent role document open
snapshot keeps full after independent role document and back
keyboard tabs to full
keyboard collapses full
keyboard expands full
role geometry 1360
role geometry 960
growing composer avoids drawer 1360
growing composer avoids drawer 960
```

#### 4A：设置 / Pi / 引擎（含每引擎会话与历史）

```
pi geometry 1360
Pi only one title/close 1360
pi geometry 960
Pi only one title/close 960
runtime groups lead first and unknown metadata escaped
new engine no Pi history queue confirmation or draft
old engine envelopes cache only and stale project ignored
actual Codex call/result target correlation and completion
Codex secret fallback and optional official Responses settings
failed save keeps draft and honest error
saved secret cleared and busy apply timing truthful
runtime settings geometry 1360
runtime settings geometry 960
Claude required key and optional SDK model endpoint
failed outcome remains error
failed native restore honest rebuilding notice
foreign runtime shell caches without showing in current engine
Pi own history background queue draft and expired card restored
```

#### 4A：输入区草稿/附件（3B 已实现；4A 默认段解锁后继续执行）

```
B independent no A image
A draft image resources full restored
late pick does not touch B
late pick stored in A
late send leaves B untouched
success clears original A sent items
keyboard reaches retained image removal
keyboard returns to input above toolbar
keyboard returns to composer image toolbar
```

#### 4B：交互卡 / 待办 / 预览 / 决定 + operator 排队聚合

```
queued baseline shows two
runtime view restore does not revive old queued requests or aggregate
main-process repush rebuilds aggregate with new count only
clearing queue removes aggregate
denied conclusion anchor and decided card retained
pending locator visible after role click
open pending supersedes true busy
pending entry fully reachable with card 960
covered pending actions unavailable card
keyboard locate closes card and exposes all actions
pending entry fully reachable with pi 960
covered pending actions unavailable pi
keyboard locate closes pi and exposes all actions
keyboard reaches original preview
keyboard expands original preview
expanded preview renders controlled markdown
expanded preview stays inside card width
keyboard enters original confirm action
keyboard reaches deny action
answered pending returns to true busy
idle after answered removes work
pending arrival preserves drawer
expired request restores actual true busy
ordinary question creates no pending
```

> 计数口径：82 个默认段名单 = **4A 50 + 4B 21 + Phase 5 11**；`queued baseline shows two` 已从 4A 移入 4B。下方 4B 代码块共 **24** 行 = 上述 21 名 + QUEUE_VIEW 段另外 3 名（`runtime view restore…`/`main-process repush…`/`clearing queue removes aggregate`），合计 85 行仅表示名单行数，不改变 82 的分母。

#### Phase 5：聊天核心 / 虚拟窗口 / 历史（全量双端等价时对照）

```
closed no horizontal overflow 1360
closed no horizontal overflow 960
historical own-template failures direct
historical failure reasons visible without expand
virtual visible nonempty
group materialized and open
user-open group survives unrelated incremental
stable group restored after full prefix insertion
detached-pane role rowlist built before mount
detached-history role mounted windowed
detached-history pane reads same row gap as attached pane
```

### 7.3 4A 将新增的 check 名建议（供桌面UI/PM 对齐，不是已实现）

- **引擎切换/每引擎历史与草稿**：`ENGINE_SWITCH_REAL_SESSION_PER_RUNTIME`、`ENGINE_HISTORY_PER_RUNTIME_RESTORED`、`ENGINE_DRAFT_PER_RUNTIME_OR_ROLE`、`ENGINE_SWITCH_DOES_NOT_OVERWRITE_OTHER_RUNTIME_DRAFT`（对应旧 `P7 old runtime rejected result…`）。
- **设置字段/掩码/保存/缺配**：`SETTINGS_FIELDS_PER_ENGINE`、`SETTINGS_SECRET_MASKED_NO_ECHO`、`SETTINGS_SAVE_ROUNDTRIP`、`SETTINGS_MISSING_CONFIG_HONEST`、`SETTINGS_ADVANCED_TIER`、`SETTINGS_SAVE_FAILURE_KEEPS_DRAFT`。
- **资料抽屉/文档阅读**：`PROFILE_DRAWER_REAL_ROLE_DOCS`、`DOCUMENT_READONLY_RENDER`、`DOCUMENT_LINK_SAFE`、`DOCUMENT_DRAWER_FOCUS_RETURN`。
- **工作概览**：`WORK_OVERVIEW_QUEUE_BODY`、`WORK_OVERVIEW_QUEUE_ITEMS_AND_POSITIONS`、`WORK_OVERVIEW_NO_DUPLICATED_ROLE_DOCUMENTS`（对齐旧名 `one independent work list without duplicated role documents`）。
- **抽屉队列/撤回（VISUAL 子集，非 QUEUE_VIEW）**：`QUEUE_DRAWER_ITEMS_AND_POSITIONS`、`QUEUE_DRAWER_WITHDRAW_INLINE`、`QUEUE_DRAWER_EMPTY_STATE`。QUEUE_VIEW 四项（`#chat .op-queue-aggregate`/`queuedDebug`）属 4B，不列入 4A 新增清单。

> 命名仅为建议；落地时以桌面UI 交付记录与契约面三态表为准，旧套件已有同名 check 的优先沿用旧名（双端对照）。

### 7.4 4A 独立验证方式（测试口径）

1. **UIUX 复核 + 测试独立**：4A 受影响界面先由 UIUX 按 Nova 规范/状态矩阵复核；测试在独立上下文执行验证，不采信交付自报。
2. **静态/构建门**：`typecheck:renderer`、`build:renderer`、CSP 扫描（零内联/严格 meta）、gzip9 ≤300KB、依赖禁入清单与 `npm ls`。
3. **测试门**：`test/桌面UI/*.test.ts` 全绿（数量随 4A 新增）、旧基线 `test/桌面应用/*.test.ts` 679/679、IME 新入口 24/24。
4. **uiux-v2 受影响段**：`SELECTOR`、`CONFIG`、`SEND_FACTS`、默认段（4A 解锁后应越过第 9 项，按台账 B 类归属分类）；到达/通过/失败名逐段记录。**QUEUE_VIEW 属 4B，不在 4A 验收段**（PM §12.1）。
5. **热路径与基准**：若 4A 触及聊天行/工具组热路径，按 PM §10.3 同机同日重基线（预热排除、≥3 有效轮、中位 + p95≤35ms + 单轮≤50ms），并重跑延迟挂载检查 **10/10**；C1 保持新 Δ≤32（目标≤20）。
6. **契约面**：行 #7/#9/#10/#15/#16/#18/#19/#20 的「部分/未满足」逐项对表转「已满足」；驱动方法同名、无新 DOM 例外（`DEFER_TOOL_ROWS_WHEN_CLOSED=40` 仍唯一）。
7. **约束**：不弱化/删除既有断言；不拉 Phase 5 项；不新增依赖（除 PM 四问）；不新增 DOM 例外。4A 完成不等于全量双端等价。

## 八、Phase 4B check 台账与验证口径（2026-10-21，4B 授权）

> **授权依据**：PM §十一.2（Phase 4 分 4A→4B，4A 通过后进入 4B）与协调者派发。本节只更新台账与验证口径，**未运行任何实现测试**。4A 基线（A 类 45 具名 + 7 门禁级；4A 50 个默认段 check；C1 Δ=16；C2 同因既有红）**保持有效、不重开**。

### 8.1 4B 必过 check 名

#### A. QUEUE_VIEW 四项（4B；断言 `#chat .op-queue-aggregate` 与 `queuedDebug`）

```
queued baseline shows two
runtime view restore does not revive old queued requests or aggregate
main-process repush rebuilds aggregate with new count only
clearing queue removes aggregate
```

#### B. 默认段剩余 21 项（4B；按功能面分组）

**B1 待处理/决定卡生命周期（14）**

```
denied conclusion anchor and decided card retained
pending locator visible after role click
open pending supersedes true busy
pending entry fully reachable with card 960
covered pending actions unavailable card
keyboard locate closes card and exposes all actions
pending entry fully reachable with pi 960
covered pending actions unavailable pi
keyboard locate closes pi and exposes all actions
answered pending returns to true busy
idle after answered removes work
pending arrival preserves drawer
expired request restores actual true busy
ordinary question creates no pending
```

**B2 预览/确认动作（6）**

```
keyboard reaches original preview
keyboard expands original preview
expanded preview renders controlled markdown
expanded preview stays inside card width
keyboard enters original confirm action
keyboard reaches deny action
```

**B3 队列聚合（默认段，1）**

```
queued baseline shows two
```

（B3 与 A 同项；此处按默认段视角保留，不重复计数。）

#### C. VISUAL 报告 source 卡（4B）

```
V2 source report uses separate layered top and facts before primary source and full copy
```

#### D. JUDGE / G2 回归（4B；须保持已通过的 33 + 5 名全绿，不重开断言）

- `ANS_JUDGE_UI_ONLY`：33 名（3B 已验证全绿）；4B 新增治理代批/镜像相关断言时**只增不改**。
- `ANS_G2_RECOVERY_UI_ONLY`：5 名（3B 已验证全绿）。

#### E. 4B 新增 check 名建议（功能面必过，命名以交付记录/契约为准）

- **治理三权卡**：`GOVERNANCE_PROPOSAL_CARD`、`GOVERNANCE_APPOINTMENT_CARD`、`GOVERNANCE_SCHEDULE_CARD`、`GOVERNANCE_ACCEPTANCE_CARD`（含推荐集/快捷路径/证据包）。
- **镜像与排队聚合**：`MIRROR_CARD_SAME_ID_ANSWERED_ONCE`、`OP_QUEUE_AGGREGATE_MIRROR_AND_POSITION`、`OPERATOR_MIRROR_AND_QUEUE_AGGREGATION`。
- **治理记录动作**：`GOVERNANCE_RECORD_ESTABLISH_AND_REACCEPT`、`GOVERNANCE_MIGRATION_PREVIEW_AND_APPLY`。
- **报告/回执**：`REPORT_FULL_TEXT_PERSISTENCE_DELIVERY`（报告全文/source/persistence/delivery 回执）。
- **回放锚点**：`REPLAY_ANCHOR_DEBUG_SAME_FIELDS`（`replayAnchorDebug` 同义字段）。
- **judge 结果行跨引擎重放**：`JUDGE_RESULT_ROWS_REPLAY_PER_RUNTIME`（PM §13.2：4A 不重放，4B 经扩展点补齐）。
- **single 切换刷新一次性警告**：`SINGLE_SWITCH_WARNING_REFRESH_ON_MODEL_CHANGE`（3B 观察项）。
- **queueView 顶层 tab 切换清空**：`QUEUE_SUBVIEW_CLEARED_BY_TAB_SWITCH`（工作/角色资料/设置/文档；4A M1 只规定返回/Esc，4B 补齐 tab 语义）。
- **菜单配置状态文字**：`ENGINE_MENU_CONFIG_STATUS_TEXT`（已配置/缺配/配置未知/检查中；3A/4A 记录中留 4B）。
- **C2 重锚**：`C2_EXPIRED_SHELL_REANCHORED_TO_COLLAPSED_WITH_REASON`（收起 + 原因可见/可追溯）或退役旧期望；不得长期保留与批准语义冲突的红色期望（PM §13.3）。属主：桌面UI；测试复验。

### 8.2 归属与 4A 基线边界

| 项 | 归属 | 说明 |
| --- | --- | --- |
| QUEUE_VIEW 四项 | **4B** | PM §12.1 已裁定；4A 验收不含 |
| 默认段 21 项（B1/B2/B3） | **4B** | 4A 已解锁默认段；这些属于交互卡/决定卡/预览/队列聚合面 |
| VISUAL 报告 source 卡 | **4B** | 报告全文/来源卡 |
| JUDGE/G2 既有 33+5 名 | **4B 回归基线** | 只增不改；若 4B 触碰行/卡，需复跑 |
| 治理三权/镜像/记录/报告/回执/回放锚点/judge 重放/single 警告 | **4B** | 台账 B4 |
| queueView tab 切换、菜单配置状态 | **4B** | 3A/4A 已记录留待项 |
| C2 重锚/退役 | **4B**（Phase 5 前关闭） | 属主桌面UI；测试复验 |
| 全量双端逐 check 名、`main.mjs`、入口切换、打包/发布 | **Phase 5** | 不在 4B 范围 |
| 聊天核心/虚拟窗口/历史 11 项（台账 §7.2 Phase 5 组） | **Phase 5** | 4B 不重开 |
| 4A A 类 45 + 门禁 7、4A 50 默认段 check、C1 Δ=16 | **4A 基线（保持）** | 不重开、不因 4B 改动而降低标准 |

### 8.3 4B 独立验证方式

1. **UIUX 复核 + 测试独立**：4B 受影响界面（治理三权/镜像/报告全文/菜单状态/队列聚合）先由 UIUX 按 Nova 状态矩阵复核；测试在独立上下文执行，不采信交付自报。
2. **准入门**：`typecheck:renderer`、`build:renderer`、CSP（零内联/严格 meta）、gzip9 ≤300KB；`node --test test/桌面UI/*.test.ts` 全绿、旧基线 679/679；依赖无新增/禁入零命中；无新 DOM 例外（延迟挂载 40 与失效卡 hidden 之外须 PM 批准）。
3. **热路径联动门（若触碰 `chat-store`/`ChatStream`/`confirm-store`/`ChatRow`）**：
   - PM §10.3 bench 同机同日重基线（预热排除、≥3 有效轮、中位 + p95≤35ms + 单轮≤50ms）；
   - 延迟挂载正向检查 **10/10**；
   - C1 **新 Δ≤32px（目标 ≤20）**；
   - IME 新入口 **24/24**。
4. **uiux-v2**：QUEUE_VIEW 四项必过；JUDGE 33、G2 5 回归全绿；默认段 4B 组（21 项）逐名通过；VISUAL 报告卡与其余 4B 段按功能面扩段；失败只允许 Phase 5/已登记 C 类。
5. **契约面**：行 #12/#13/#17 及相关 4B 行由「未满足/部分」转「已满足」；`replayAnchorDebug` 等驱动同名接真实动作；三态表随交付更新。
6. **不弱化断言**；不拉 Phase 5 项；不把 4B 项提前塞进 4A 或反之；不新增依赖（除 PM 四问）。
7. **门结论**：4B 通过后 **Phase 4 完成**；全量双端逐 check 名、`main.mjs`、入口切换与打包仍属 **Phase 5**，不得据此宣称全量等价或最终验收。

### 8.4 4B 台账定稿（PM §15.7，2026-10-21）

> 名单来自 `2026-10-21-phase4b-evidence/uiux-v2/*/report.json` 与实际套件源码；计数不能代替名单。4A 六段基线（SELECTOR 27/27、CONFIG 21/21、ROLE_RETURN_FOCUS 11 条/9 布尔全绿、SEND_FACTS 8/8、TERMINAL 22/22、TOOLFOLD 19 条/17 布尔全绿）**保持不重开**。

#### A. DELIVERY_NOTE（`ANS_DELIVERY_NOTE_UI_ONLY`）

**4B 必过（5）**：

```
real ten-call history plus old delivery note never creates an eleventh anonymous tool
old anonymous delivery event stays fully reachable as explicit unknown system record
new actual wire delivery note is full system fact never assistant or tool
history rebuild preserves system notes without promoting them into activities
unidentified identical progress events are not text-deduplicated or promoted to tools
```

**4A/5 回归（不新增 4B 门；4 名，其中 1 绿 1 红如实记录）**：

```
all real tool names phases and genuine failed result remain
known legacy live metadata remains an actual named tool
builtin identity stays data and accessible without duplicate third visible line   ← 当前红（Phase 5/树标识面）
long project path is single line ellipsis with full actual title
```

#### B. COMPLETE_FLOW（`ANS_COMPLETE_FLOW_UI_ONLY`）

**4B 必过（C/P3 报告/持久化/交付/来源，12）**：

```
C source declared result not independent acceptance and failed save button
C source same card once save success with promise event race
C target safe display copy flags not complete model input
C target only save updates same original card no re-prompt
C expired original report removes unsafe retry
C source report mismatched role is not promoted
C fallback abort is system outcome not submitted success
C disabled live report remains visible without fake persisted ID
C outer ok inner failed never announced saved
C unreadable report record is explicit without new outcome card
C expired material cannot keep old receipt retry enabled
P3 source B documents browsing never changes chatting A or engine
```

**留 Phase 5（A/B/A4/P6/P7 聊天/设置/文档既有项，7 布尔名）**：

```
fresh empty context never mistakes loader for history
empty fresh session has no above-history warning
A same call one accessible lifecycle with true target and nonzero exit completion
A safe detail streams exit error and flags readable
A different same-text actual call remains separate
A unknown display never falls to raw args
P6 config save retains existing conversation draft
P6 missing setting closes back to actual notice invoker
P7 choice pending separated from empty queue   ← 当前红，且因套件顺序在 C 段之前中止，导致 4B 的 C/P3 子集本轮不可达（见 §8.5）
```

> 说明：`B source…`/`B structured…`/`B actual too-large…`/`B close invalidates…`（文档阅读）按 PM §15.7「A/B/A4/P6/P7 聊天/设置/文档既有项」归 Phase 5；`P3 source B documents browsing…` 属 4B（PM 示例）。

#### C. VISUAL（`ANS_VISUAL_V2_UI_ONLY`）

**4B 必过（报告/回执/来源/折叠/去重/冷报告，20）**：

```
V2 source report uses separate layered top and facts before primary source and full copy
V2 preview is deterministic real summary while complete safe copy is independently reachable
V2 report status unknown association redaction truncation omission and save facts remain visible
V2 report declaration alone cannot fold an active assistant message
V2 true settled folds only the exact report turn assistant original in place
V2 late exact turn reply follows settled rule and other turns remain ordinary
V2 task request folds only by exact structured report actual turn without reordering ordinary chat
V2 local state refresh preserves full report and original task expansion
V2 cold exact report turn folds neutral original only and preserves explicit expansion
V2 received report shares layered safe report ordering with one separate batch receipt
V2 target batch facts use actual compact component typography spacing and boundaries
V2 independent work overview includes own and actual received structured reports
V2 work de-duplicates only real report identity while separate delivery attempts stay visible
SV13 distinct receiver turn streaming stays expanded
SV13 true settled receiver folds only exact assistant original
SV13 later receiver text folds preserving explicit expansion
SV13 cold receiver keeps neutral label flags expansion and unrelated legacy text
cold reports reverse hash wire becomes actual time old to new while tool row order remains
cold sorted report identities still deduplicate on repeated history snapshot
cold unknown report time preserves wire ordering without guessing
```

**留 Phase 5（非报告项：窗口/主题/几何/侧栏/树/焦点，29 布尔名）**：

```
V2 ordinary chat stays ordinary before any structured report
V2 accepted structural positions and real window controls
V2 ordinary chat work overview has no invented report
V2 modal declares dialog and makes whole background inert
V2 document drawer matches 18px heading source block and outlined right reading action
V2 native window controls retain visible icons and real IPC while business background is inert
V2 Shift Tab wraps from first to last actual drawer control
V2 Tab wraps last to first without escaping modal
V2 background focus cannot escape into composer
V2 Escape restores actual visible report invoker draft and same chat reading
V2 real geometry 1360
V2 dark theme: no visible light surfaces 1360
V2 modal width is 424 at 1360
V2 dark theme: no visible light surfaces in drawer 1360
V2 real geometry 960
V2 dark theme: no visible light surfaces 960
V2 modal width is 424 at 960
V2 dark theme: no visible light surfaces in drawer 960
V2 sidebar default width 248 and resizer aria
V2 sidebar double click resets 248
V2 sidebar keyboard shift right +24
V2 sidebar collapse preserves custom width
V2 sidebar collapsed geometry 1362
V2 sidebar expanded restored 1362
V2 sidebar collapsed geometry 1280
V2 sidebar expanded restored 1280
V2 sidebar collapsed geometry 960
V2 sidebar expanded restored 960
V2 import selects primary su and keeps it inside tree viewport   ← 当前红（Phase 5/树视口）
```

#### D. QUEUE_VIEW 4 名（4B 必过，4/4）

```
queued baseline shows two
runtime view restore does not revive old queued requests or aggregate
main-process repush rebuilds aggregate with new count only
clearing queue removes aggregate
```

#### E. MIRROR 8 名（4B 必过，五角色口径，8/8）

```
W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier
W6-C status line shows 三权 · 五角色
W6-C Liaison empty state explains customer entrance without self CTA
W6-C mirror card rendered in Liaison with badge/source label and same request id
W6-C answering mirror freezes the mirror face
W6-C source face kept and also frozen; no mirror label there
W6-C queued aggregate on primary; no operable queued card on either side
W6-C presented queue removes one aggregate and mirrors on both faces
```

#### F. GOVERNANCE_REACCEPT（`ANS_GOVERNANCE_REACCEPT_UI_ONLY`）

PM §15.7 记 **5/5**；4B 证据实际报告 **7 布尔项全绿**（名单如下）。按实际名单登记，计数差异无红：

```
GOV pin-mismatch status row
GOV pin-mismatch empty state reuses su empty host
GOV preview reuses non-modal #governance-preview
GOV preview file/write/pin/warning lines
GOV preview adds no modal or fourth entry
GOV cancel keeps mismatch state and hides preview
GOV success text after completed
```

#### G. JUDGE 33 名 / G2 5 名（4B 回归，只增不改；名单见 4B 证据 report）

JUDGE（`ANS_JUDGE_UI_ONLY`，33/33）：`P5 judge starts authoritative off` … `P5 decision off after checks`（33 名完整清单存档于 `2026-10-21-phase4b-evidence/uiux-v2/JUDGE/report.json`，逐名保持）。
G2（`ANS_G2_RECOVERY_UI_ONLY`，5/5）：

```
G2 system alert renders as own injected style with system source chip
G2 closure notice replay classified by the same single source
G2 recovery card shows action role and verbatim evidence with cancel default focus
G2 recovery Esc is deny and channel-absent terminal never claims execution
G2 expired recovery card dismisses without execution illusion
```

### 8.5 C2 重锚口径提案（PM §15.6 责任分离）

- **对象**：`expired old shell shown disabled in its own runtime`（RUNTIME 段）。新/旧入口均失败；旧期望「失效 shell 卡保持可见但禁用」与 3B 已批准「失效 shell 卡收起 + 原因提示」冲突。
- **提案（二选一）**：
  1. **重锚（推荐）**：改为 `C2_EXPIRED_SHELL_COLLAPSED_WITH_REASON`——断言卡片**收起**（hidden/不存在）、`#composer-hint` 或系统行包含失效原因/可追溯文案、且**不呈现为已放行**；旧名→新名与理由在台账/套件注释登记。
  2. **退役**：若该检查只服务旧渲染器语义且新实现已有等价覆盖，则随旧套件退役，登记退役理由与替代覆盖名。
- **责任分离（PM 已批准）**：由**桌面UI**在 `uiux-v2` 文件落地重锚/退役（只改该检查，不弱化其他断言）；**测试独立复验**新入口到达值，并在台账记录旧名→新名/退役依据。
- **门影响**：重锚/退役完成且测试复验前，RUNTIME 段保留 1 条 C2 同因红；不阻塞 4B 其余项，但 4B 门关闭前须关闭此条。

### 8.6 4B 门必过清单（汇总）

1. QUEUE_VIEW **4/4**；MIRROR **8/8**（五角色）；GOVERNANCE_REACCEPT 实际 **7/7**（PM 记 5/5）；JUDGE **33/33**、G2 **5/5** 回归。
2. DELIVERY_NOTE 4B **5 名**；COMPLETE_FLOW C/P3 **12 名**；VISUAL 报告/回执 **20 名**。
3. 4A 六段基线（SELECTOR/CONFIG/ROLE_RETURN_FOCUS 11 条/SEND_FACTS/TERMINAL/TOOLFOLD 19 条）保持全绿。
4. C2 重锚/退役完成并独立复验；五角色夹具无四角色双期望；断言未弱化。
5. 热路径联动门（若触碰 chat-store/ChatStream/confirm-store/ChatRow/ipc）：bench §10.3 + 懒挂载 10/10 + C1 Δ≤32（目标≤20）+ IME 24/24。
6. 契约面 #8/#12/#13/#14/#15/#17/#19/#20 三态与实现一致；无新增依赖/DOM 例外。

### 8.7 4B 独立验证结果（2026-10-21，测试角色）

**候选**：4B 交付记录 `2026-10-21_change_ui-platform-phase4b-governance-receipts.md`；构建 `app/renderer/dist`（clean rebuild）。证据：`2026-10-21-phase4b-verification-evidence/`。

**通过项**：
- 构建/typecheck/CSP/gzip9 **285,702B ≤ 307,200B**；单测 **96/96**；旧基线 **679/679**；IME **24/24**（26 true）；懒挂载 **10/10**；零 console/CSP。
- 自写 Electron 离线 smoke **38/38**：聚合（唯一行/queuedDebug/不可聚焦/切引擎清空/重推重建/呈现/失效）、镜像（同 id 双面/只答一次/双面冻结/排队防御/双击单发）、治理（状态行/非模态预览/Esc 回焦/取消零写/建立 trio 一次/写阶段如实/guard 零写/重新接受 digest 一次/迁移 not-available/next-step 仅状态）、报告（全文/声明不等于验收/失败重试/迟到失败不覆盖 saved）、交付（本批 N 份不表示收齐/安全副本 flags/重试稳定/expired 无假重试）、菜单（已配置/缺配置/配置未知/208px/读取缓存仅 unknown 重读）、queueView tab 清空、single 警告（single 禁用并收起；回 trio 不重放；再次开启重新提示）、judge 跨引擎重放、`replayAnchorDebug` 字段与同序重建。
- uiux-v2：QUEUE_VIEW **4/4**、MIRROR **8/8（五角色）**、GOV **7/7**（PM §15.7 记 5/5，实际名单 7 项全绿）、JUDGE **33/33**、G2 **5/5**；4A 六段全绿（27/21/11 条/8/22/19 条）。
- DELIVERY_NOTE 4B **5/5**；VISUAL 4B 报告面 **20/20**；COMPLETE_FLOW 官方段到达 5/12 后止于 Phase 5 P7，**临时只读副本仅跳过 P7 两个 Phase 5 阻断检查**后到达全部 C/P3 **12/12**（未改任何 4B 断言）。
- bench §10.3：新/旧交替 3 轮，stormA maxGap 中位 17.7（旧 24.0，阈 25）、stormB 19.3（旧 17.6，阈 25）、handler 0.3（旧 11.2）、batch 0.8（旧 1.0）、replay 6.1（旧 11.4）、scroll 7.3（旧 12.3）；单轮最大帧 20.7 ≤35/50；C1 **150→166，Δ=16 ≤32（目标≤20）**。
- 旧渲染器/main/preload/desktop 对 HEAD **零 diff**；`package.json/package-lock.json` mtime 10:45、`App.tsx/Sidebar/shell.css/phase4a.css` mtime 12:07–14:33，均早于 4B 改动（15:36+）；DOM 例外仍为延迟挂载 40 + 失效/排队卡动作 hidden。

**失败/缺口（4B 门未通过）**：
1. **C2 重锚红（产品）**：RUNTIME 段 `expired old shell collapses with reason visible in its own runtime` 连续 2 次 false。观测：shell 卡确实收起（`#shell-confirm.hidden`），但 `#composer-hint` 为空，原因「原shell轮次已中止」不可见/不可追溯；`recordOperatorExpired` 先清缓存 shellConfirm，replay 时 `expireShell` 因无当前卡而不写 hint。交付记录 §五「C2 pass」不成立。
2. **默认段 B1 锚点红（产品）**：`denied conclusion anchor and decided card retained` false。最小复现（历史 request/conclusion + operator 卡 + 前缀 full rebuild）显示卡被保留但落尾：operator index 3，requestIndex 1、conclusionIndex 2（期望卡在 2、结论 3）。根因指向 `appendOperatorRequest` 建行未保存 `anchorKey`，full rebuild 只能尾插；交付记录「按锚点回插」不成立。其余默认段 B1/B2 20 项中 19 项通过（`queued baseline shows two` 由 QUEUE_VIEW 覆盖）。
3. **证据表述缺口**：交付记录 §五 FLOW 称 18 项通过含 `C outer ok inner failed`/不可读报告/P3 来源文档，但官方 FLOW 报告在 P7（其源序在此之前）即中止，这些 C 检查实际未到达；名单与到达事实不符，需更正（行为经只读副本补证为过，但官方证据不能支撑该表述）。

**结论**：4B 功能面大部分通过，但 C2 重锚与默认段锚点两项 4B 必过 check 为真红，且 FLOW 证据表述需更正 → **4B needs-work；Phase 4 门不关闭**。修复后须按 Invariant #6 重跑受影响段（RUNTIME、默认段、FLOW/VISUAL）与热路径门。

### 8.8 4B 返工聚焦重验结果（2026-10-21，测试角色）

**候选**：4B 变更记录 §一之二返工；clean rebuild。证据：`2026-10-21-phase4b-fix-verification-evidence/`。

- **两项真红已修复**：RUNTIME `expired old shell collapses with reason visible in its own runtime` **true**，新增无 authorize 跟随断言 pass；默认段 `denied conclusion anchor and decided card retained` **true**（补证段）。自写 smoke 42/42 独立复现 C2（卡收起 + hint 原因 + 无 sc-allow/sc-close + Esc 零回包）与锚点（prefix full rebuild 后 opIndex=request+1、conclusion=op+1、DOM 同节点、decided/frozen）。
- **UIUX 四项**：960 五角色行零重叠/树无横溢；200% `#chat/.head/.head-inner/#right-body` 零横溢且头部 wrap；报告 facts flex + 4px + `dt::after`「：」；治理预览取消回焦触发元素。
- **门禁**：gzip **286,105B**；单测 96/96、旧基线 679、IME 24、懒挂载 10、零 console/CSP；旧渲染器/main/preload/desktop 零 diff、无新增依赖/DOM 例外。
- **uiux**：RUNTIME **17/17**、QUEUE 4/4、MIRROR 8/8（五角色）、GOV 7/7、JUDGE 33/33、G2 5/5、SELECTOR 27、CONFIG 21、ROLE 11 条、SEND 8、TERMINAL 22、TOOLFOLD 19 条、FRESH 4/4、VISUAL **54/54**；GHOST 4B 5/5（官方止于 Phase 5 builtin identity）；FLOW 官方 5/12（止于 P7），补证副本 **12/12**；默认段补证 **107 条/100 布尔全过**。无断言弱化（共同名单逐字一致，新增检查 2+3，两项红 false→true）。
- **bench/C1**：3 轮全过（stormA 17.5/B 20.0/handler 0.7/batch 0.9/replay 10.2/scroll 10.6；单轮最大 21.2）；C1 **Δ=16**。
- **结论**：**4B pass；Phase 4 门关闭（Phase 4 完成）**。全量双端/main.mjs/入口/打包/真机仍 Phase 5。

### 8.9 4B 200% 收口轻量重验（2026-10-21，测试角色）

- 候选：`phase4b.css` + 4B 冒烟断言/截图（行为未改）。gzip **286,348B**；单测 96/96、旧基线 679、IME 24、懒挂载 10；旧核心/main/preload/desktop 零 diff、无新增依赖/DOM 例外。
- 200%：左树 6 行零重叠、首末行可见且左栏可滚；10 容器（含缺配条/治理状态/树/col-mid/session/composer）与 documentElement 零横溢、头部 wrap；缺配提示全文与按钮首屏内；报告展开节点与治理预览内部节点零横溢、取消回焦。
- 桌面UI 4B 冒烟独立复跑 **70/70**；自写补充 **7/7**；RUNTIME 17/17、VISUAL 54/54、QUEUE 4/4、MIRROR 8/8、GOV 7/7、JUDGE 33/33、G2 5/5、TOOLFOLD 19/19；bench 3 轮全过（单轮最大 24.7）；C1 Δ=16；无断言弱化。
- **结论**：pass；4B 门保持关闭、Phase 4 维持完成；Phase 5 仍留。
