# 桌面应用 变更记录

## 2026-10-11 — Pi 面板瘦身：5 项 → 3 项必填 + 1 项「高级」（客户：「这个 pi 为啥需要配置 5 个呢」——其实不是 5 个）

**来源**：**客户提问**「这个 pi 为啥需要配置 5 个呢」——结论：**其实不是 5 个，真正必须你填的是 3 个**。据此把面板从 5 项改为 **3 项必填 + 1 项可选（收进「高级」）**。**属本角色边界内**（`app/`、`test/桌面应用/`、`角色卡/桌面应用/`）。

### 1) 面板项（`app/renderer/index.html` + `renderer.js` + `styles.css`）

| 项 | 处理 |
|---|---|
| `ANS_PI_BASE_URL`（端点） | **保留，必填**——被红线逼出：拒绝回落任何默认端点，故必须显式给。 |
| `ANS_PI_MODEL`（模型） | **保留，必填**。 |
| `ANTHROPIC_AUTH_TOKEN`（token） | **保留，必填，掩码**（`type=password`、值不回显、只示「已设置/未设置」）。 |
| `ANS_PI_PROVIDER` | **从面板去掉**——代码里**有默认值**（`ans-gateway`）、是**内部标签**、**不是用户该做的决定**；底层仍支持该环境变量，只是不再占输入框。 |
| `ANS_PI_CONTEXT_WINDOW` | **收进「高级」（可折叠）且可留空**——Pi适配器并行改（见下），从「必填」改「可选 + 保守默认」，缺失不再硬失败。 |

- **「高级」那一行说明**（`index.html`，一句话）：**「留空 = 用默认值（偏保守：压缩会提前触发，不会炸会话）；知道确切值就填。」** 落点 `<details class="pi-advanced">`（默认**收起**；`styles.css` 加 `.pi-advanced` 系列——沿用既有令牌、浅色近单色、只有一枚旋转 chevron）。
- **视觉方向不变**（浅色、近单色、极简；圆角只给交互元素）。

### 2) 键集合跟着收（`app/desktop/pi-config.ts`）

- `PI_PANEL_KEYS`：**5 → 4**（`ANTHROPIC_AUTH_TOKEN` / `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANS_PI_CONTEXT_WINDOW`）——`getPiConfig` / `savePiConfig` 的**可写键集合随之收**，`ANS_PI_PROVIDER` **不再被写**。
- **新增 `PI_REQUIRED_KEYS`**（3 项必填）；`missingPiKeys` 改为**只数必填**——上下文窗口可选，缺失**不算**「配置不全」。`renderer.js` 同步引入 `PI_REQUIRED_KEYS`，`renderPiConfigWarning` **只按必填告警**（避免把可选缺失误报成「会被拒」）。
- **`.env` 里已有的 `ANS_PI_PROVIDER` 那一行未被动**——保存只改面板键、逐行替换命中键，其余**逐字节保留**（写纪律一字未动）；掩码/不预填/原子写/只改相关键**全保持不变**。

### 3) 与 Pi适配器新语义对齐（`src/common/pi-adapter/provider-config.ts`——**只读，未动**）

Pi适配器**并行**已把 `contextWindow` 从「必填、缺失硬失败」改为**可选 + 保守默认**（`DEFAULT_PI_CONTEXT_WINDOW = 32768`，缺失回落默认、只有**非法值**才抛错）。本面板的「留空 = 不下发该键」正是**喂给它**的路径：留空 → `.env` 无该键 → 适配器回落保守默认（阈值 32768−16384=16384，压缩会提前触发，**不会炸会话**）。**两侧语义逐点一致**，本角色**未**越界改适配器、也**未**把 `contextWindow` 改回必填。

### 4) 守卫（证明「`provider` 不在面板里」）

- **单测** `test/桌面应用/pi-config.test.ts`：面板键断言改 **3+1**；**反向断言** `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`；`getPiConfig` 视图**不含** `ANS_PI_PROVIDER` 字段（即便 `.env` 有它）；新增「保存时提交 `ANS_PI_PROVIDER` 也被过滤、**已存在的那行原样保留**」用例。
- **渲染侧不变式** `test/桌面应用/renderer.test.ts`：`index.html` **无** `#pi-inp-ANS_PI_PROVIDER`、无 `>ANS_PI_PROVIDER<` 标签；`renderer.js` 键集合**不含** `"ANS_PI_PROVIDER"`、**含** `ANS_PI_CONTEXT_WINDOW` 与 `PI_REQUIRED_KEYS`；`styles.css` 含 `.pi-advanced`；`index.html` 的上下文窗口字段**在 `.pi-advanced` 容器内**且含那一行说明。
- **e2e** `test/桌面应用/e2e/main.mjs`：新增 DOM 守卫 `PI_KEYS_ARE_FOUR` / `PI_NO_PROVIDER_FIELD` / `PI_ADVANCED_PRESENT` / `PI_ADVANCED_COLLAPSED_BY_DEFAULT` / `PI_CONTEXT_WINDOW_IN_ADVANCED` / `PI_ADVANCED_HINT_LEAVE_BLANK` / `PI_TEMP_ENV_NO_PROVIDER` / `PI_TEMP_ENV_OMITS_EMPTY_CONTEXT_WINDOW`。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **95 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **673 pass / 2 fail**（跑测期间 Pi适配器**并发**更新了其 `provider-config.test.ts`，其先前的 2 条「缺失即抛错」旧语义红已随之转绿；总数波动属多角色并发）——**2 红全在本角色边界外，均未越界改、如实回报**：
  - `test/测试/t29-pi-config-roundtrip.test.ts:75`（**测试角色**：把「`loadPiEnv` 结果 == `PI_PANEL_KEYS`」当断言——provider 已不在面板键，需去掉该耦合）。
  - `test/测试/t29-write-discipline.test.ts:157`（**测试角色**：写入纪律用例把 `ANS_PI_PROVIDER` 当**可写面板键**——它已不在面板键集合，需去掉该用例项）。
  - **两条皆本改动的跨角色后果**（provider 不再可写），需测试角色更新其 T29；**本角色未越界改**。
- **旁注（本角色边界外、未改、如实回报）**：`README.md`（第 79–83 行）与 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`（第 715 行）仍把 `ANS_PI_PROVIDER` 列为**面板键**、并把 `ANS_PI_CONTEXT_WINDOW` 描述为「**必填，无默认值**」——二者**现在都过时**（provider 已移出面板；上下文窗口已改为可选 + 保守默认）。属他角色/根文档，需协调方同步。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR`=Windows 临时目录）退出码 0、`E2E_DONE=1`，**新增守卫全真**、**既有检查点全过**、截图确认面板 3 框 + 收起「高级」（`09-pi-panel.png`）、保存后 token 仍掩码且不回显（`10-pi-saved.png`）、**无残留 Electron**；真实 `.env` 指纹（size=488 / mtime=1791706923 / SHA-256 `75aee37f…39655`）**逐字节不变**。

## 2026-10-11 — T38：接上 bootstrap 收口的确认面（客户裁定：su 提议 → 客户确认 → 完成）

**来源**：设计 §13/§13.4（**完成方式重定**——客户 2026-10-11：「完成 bootstrap 应该是 **su 主动觉得差不多了来完成**；后面 su 可以动态增加和修改」+「当然需要客户确认了」）+ 派发清单 **T38**。**依赖已验证**：编排 **T37** 已把 `finalize()` 从「**调用即完成**」改为「**提议收口 → 挂起等客户确认 → 恰好 `allow` 才落盘**」（经注入的 `operatorChannel`；通道缺省/不可用/超时〔默认 120s〕/拒绝 → **不完成**）。**属本角色边界内**（`app/`、`test/桌面应用/`、`角色卡/桌面应用/`）。

### 缺口与根因（**那 2 条红**）

本层此前**已有** `app/desktop/operator-channel.ts`（同一 `OperatorChannelFn` 契约），但**没有把它注入 finalize 路径**——编排 `openRoleSession` 新增的 `operatorChannel` 入参**从未被桌面传入** ⇒ finalize 收口时走到 `confirm(undefined)` ⇒ **`unavailable`（未接入客户确认通道）→ 不完成**。这正是 `test/桌面应用/finalize-wiring.test.ts` 两条成功用例红的**唯一根因**（它们按**旧语义「调用即完成」**断言，而 T37 后 `finalize()` 不再「调用即完成」）。

### 1) 接线：客户确认通道注入 finalize（**复用既有 (a)，不造第二套**）

- **复用**：`app/desktop/operator-channel.ts::createDesktopOperatorChannel`——**同一 `OperatorChannelFn` 契约**（`OperatorPrompt → OperatorOutcome`），类型**唯一来源**是 §4 冻结契约家 `src/provider/pi/session.ts`（只读导入、原样转出）。**未新增任何第二套确认机制**。
- **透传链路**：`app/main.ts` 构造通道 → `DesktopDeps.operatorChannel`（`app/desktop/interface.ts`）→ `SessionManagerDeps.operatorChannel`（`app/desktop/session.ts`）→ **仅创世 finalize 会话**（`!hasRoles` 的内置治理角色）经 `openRoleSession({ ..., operatorChannel })` 传给编排。**有角色的普通聊天逐字不传**（不消费该通道）。
- **主进程 presenter（`app/main.ts`）**：把提议渲染为**应用内确认卡**（**不弹系统对话框**）——presenter 把 `OperatorPrompt`（`command` = 提议原文、`reason` = 将写出什么、`toolCallId`）经 `session:finalize-proposal` 推达渲染侧，挂起等 `session:finalize-confirm` 回传；新 IPC `session:finalize-confirm` 解挂该 Promise（→ 通道返回 `allow`/`deny`）。**窗口已关 → 直接非放行**（fail-closed）。
- **fail-closed 四条**（§13.1）：**未接通道 / 通道不可用 / 超时（默认 120s，`createDesktopOperatorChannel` 的硬超时）/ 客户拒绝** → **不完成**，**不写** `.ans`/manifest/治理边界文档（**零副作用**）。

### 2) 确认面（**改造旧「完成 bootstrap」按钮，不删**）

- **提议在聊天流里可见**：`app/renderer/renderer.js::appendFinalizeProposal` 在聊天流 append 一张**确认卡**——
  - 标题：**「su 提议：可以收口了（完成 bootstrap）」**（提议原文，来自 `prompt.command`）；
  - 正文：**将写出什么**（`prompt.reason`，如「将写出：角色卡/governance-boundary.yaml、.ans/project.json、docs/bootstrap-manifest.md（pin N 个边界文件…）」）；
  - **确认面**：`[确认完成]` / `[暂不]` 两个按钮。**只在 su 已提议时才出现**（提议推达才有卡）——**不是**一直挂着的按钮。
- **触发入口（改造的那个按钮）**：`#bootstrap-action`（**仅创世 su 会话**显示）文案由「完成 bootstrap」改「**让 su 提议收口**」——点它请 su 发起收口提议（T37 的 `finalize()` 语义 = **提议、非立即完成**）；提议随即以确认卡呈现。
- **回传与定格**：点 `[确认完成]` → `finalizeConfirm({toolCallId, allow:true})` → 卡片定格「已确认——正在收口…」；点 `[暂不]` → `allow:false` → 定格「已暂不——su 可继续工作；稍后仍可再提议收口」。
- **确认后如实呈现**（`appendFinalizeResult`）：成功措辞由「bootstrap 已完成」改**「项目已转正：bootstrap 已完成——写出 N 项、pin M 个边界文件、角色 K 个」**，正文加一句「项目已从『创世态』进入『正式态』。**su 仍可继续新增/修改角色**（边界由项目的治理边界文档治理；此后每轮 su 会话 settle 后 pin 自动刷新）」——**界面读作「项目转正了」，不是「结束了」**；未完成示完整 `reason`（**不假装成功**）。
- **视觉**：`app/renderer/styles.css::.msg-finalize-proposal`——浅色、近单色（沿用既有令牌 `--border-strong`/`--bg-soft`/`--mono`），只用一点克制的深色边框标示「待你确认」；无 emoji/渐变。

### 3) 修那 2 条红（按新语义重写）

`test/桌面应用/finalize-wiring.test.ts`：
- **成功用例**改为**注入 allow 确认通道**（`makeManager(listing, { operatorChannel: allowChannel })`）；并更新「写出什么」的断言——T37 首次确认 finalize **额外写出项目治理边界文档** `角色卡/governance-boundary.yaml`，故 `wrote` = `["角色卡/governance-boundary.yaml", ".ans/project.json", "docs/bootstrap-manifest.md"]`。
- **新增 3 例**（均断言 **零副作用**——无 `.ans`/manifest/治理边界文档）：**未接确认通道 → `unavailable`**；**客户拒绝 → `declined`**；**确认超时 → `unavailable`**（注入永不 resolve 的通道 + `confirmTimeoutMs: 30`）。
- **入口通道断言**：创世 su 会话 `openRoleSession` 入参**含** `operatorChannel`；普通聊天**键都不出现**。
- **确认通道全用注入替身**（allow/deny/unavailable/never），**不弹系统对话框**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **94 pass / 0 fail**（基线 91，+3 净：新增 3 例；原 2 条红按新语义转绿）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **621 pass / 0 fail**（**本轮跑测未见任何红**——含任务书预告的「1 处别角色的红」，本轮未出现；多角色并发，总数会波动）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增检查点全真**（`session:finalize-proposal` 推提议 + 注入 `session:finalize-confirm` 收集器，**不弹系统对话框**）：
  - `FIN_NO_CARD_BEFORE_PROPOSAL=true`（提议前**无**确认卡——「只在 su 已提议时出现」的守卫）；
  - `FIN_CARD_PRESENT=true`、`FIN_CARD_TITLE=su 提议：可以收口了（完成 bootstrap）`、`FIN_CARD_REASON_SHOWS=true`；
  - `FIN_CARD_HAS_CONFIRM=true` + `FIN_CARD_HAS_CONFIRM_TEXT=确认完成` + `FIN_CARD_HAS_DISMISS_TEXT=暂不`；
  - 点 `[确认完成]` → `FIN_CONFIRM_CALL_ALLOW=true`（回传 `{toolCallId:"tc-1", allow:true}`）+ `FIN_CARD_DECIDED=true`；
  - 点 `[暂不]` → `FIN_DISMISS_CALL_DENY=true`（回传 `allow:false`）+ `FIN_CARD_DISMISSED=true`；
  - `FIN_NO_SYSTEM_DIALOG=true`（该路径**不依赖原生对话框**）。
- **既有检查点全过**：`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`BOOTSTRAP_*`/`REFRESH_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_ACTION_VISIBLE`/`FIN_ACTION_IS_PENDING`/`FIN_HINT_MENTIONS_UNSETTLED`/`FIN_BTN_PRESENT`/`FIN_DENIED_BLOCK_PRESENT`/`FIN_NO_ANS_WRITTEN`/`FIN_NO_MANIFEST_WRITTEN`/`FIN_ACTION_STILL_VISIBLE` 全过（`#bootstrap-action` 的 `is-pending`/`.ba-hint`/`#btn-finalize` 语义保留）。
- **截图自看**（`13-finalize-card.png`）：聊天流里一张浅色确认卡——「su 提议：可以收口了（完成 bootstrap）」+ 将写出路径 + `[确认完成]`/`[暂不]`；底部 `#bootstrap-action` 为「完成 bootstrap / 让 su 提议收口」。
- 跑完**无残留 Electron 进程**（`tasklist` 计数 0）；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env` 内容、未发真实网络请求、未打印凭据值**）。

### 硬约束 / 边界登记

- **渲染侧无第二份判定**：确认卡只读主进程事件（`session:finalize-proposal` 的 `proposal`/`reason`）与 `bootstrapState`；**不**读角色数据、**不**判 `hasRoles`。`primaryRoleId`/`hasRoles` 读取未动。
- **未动**：`test/测试/` 那 1 条红（**测试角色**）；`primaryRoleId`/`hasRoles` 判定读取；视觉方向（浅色、近单色、极简）不变。
- **编排 T37 的接口为只读消费**：`openRoleSession` 的 `operatorChannel`/`confirmTimeoutMs` 入参、`RoleSessionHandle.finalize()` 的 `FinalizeResult`（从**公开句柄类型派生**，`app/desktop/session.ts::FinalizeResult = Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>`）——**不导入编排私有 `src/common/编排/`**（§6）。
- **T36（`finalize_bootstrap` 工具）尚未落盘**：本轮**未**实现 su 经工具主动触发；故产线当前的触发入口仍是 `#bootstrap-action` 的按钮（请 su 收口）。**确认面与通道已就绪**——T36 落盘后，su 的工具调用 → `finalize()` → **同一 presenter → 同一确认卡**，无需再改编排/桌面。**如实登记**。


## 2026-10-11 — 收敛「项目尚未 bootstrap」提示：三处重复 → 只说一遍，且只在中栏正中（客户裁定）

**来源**：客户看过截图后，协调方指出一处冗余——**「项目尚未 bootstrap」在同一屏上说了三遍**，客户同意收掉。**属本角色边界内**（`app/`、`test/桌面应用/`）。**只做呈现收敛，不动那个「完成 bootstrap」按钮与相关 IPC**（其「su 主动提议 → 客户确认」的改造是后续任务）。

### 原来三处（同一句话）

1. **中栏横栏第二行**：`#composer-hint` 状态提示——`项目尚未 bootstrap：与 su 对话，让它创建角色。`（`loadProject` 的 `setHint`）。
2. **中栏正中空状态**：标题 `项目尚未 bootstrap` + 说明 `与 su 对话，让它把角色建出来；左树会随之长出。` + 按钮 `开始与 su 对话`（`clearChat`）。
3. **左栏**：一块白底提示框 `#bootstrap-notice`（`renderBootstrapNotice`）——同句。

### 改成（只说一遍，说在「你会看的地方」）

- **保留** 中栏正中的空状态（第 2 处）——信息最完整（标题 + 说明 + **可点的按钮**）、位置最正。**这是唯一该说这件事的地方**（`clearChat` 一字未改）。
- **删掉** 左栏那块提示框（第 3 处）——与中栏重复，且是「挂在那儿等你读」的形态。
- **中栏横栏第二行（第 1 处）只保留「写入语义」那一句**，把「项目尚未 bootstrap…」那句删掉。

**结果**：空项目导入后，这件事**只在中栏正中出现一次**（带按钮）；横栏只剩写入语义。

### 改了什么（均在本角色边界内）

- **`app/renderer/renderer.js`**：
  - **删** `renderBootstrapNotice()` 函数（及其 doc 注释）与 `applyListing` 里的调用——**左栏提示的死代码**。
  - `loadProject` 的 `setHint`：未 bootstrap（`hasRoles === false`）时**留空**（不再写那句子），有角色时仍写「已导入项目，共 N 个角色。点击角色即可开始聊天。」。横栏第二行因此**只剩 `#runtime-note` 写入语义**。
  - `clearChat` 的中栏正中空状态**一字未改**（标题/说明/按钮照旧）——它成为该状态的**唯一**呈现点。
- **`app/renderer/index.html`**：**删** 左栏 `<div id="bootstrap-notice" class="bootstrap-notice"></div>`。
- **`app/renderer/styles.css`**：**删** `.bootstrap-notice` / `.bootstrap-notice:empty` / `.bn-ico` / `.bn-text` 四条规则（已无消费者）。

### 硬约束（未动）

- **`hasRoles` 的读取未动**：仍原样转自门禁引擎 `listProject` 的 `hasRoles`（`state.hasRoles`），**渲染侧仍无第二份判定**——本轮只收敛呈现（何处显示、显示几次），未改读取来源、未派生第二次。
- **`primaryRoleId` 读取未动**（空状态说明/按钮取它，不硬编码 "su"）。
- **有角色（正常项目）路径未受影响**：导入有角色的项目时 `clearChat` 走 else 分支（「选择左侧角色开始聊天」），整页**不出现**「项目尚未 bootstrap」——e2e `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION=true` 确认。

### 守卫（断言「只出现一次」+「它不在」）

- **e2e `main.mjs`（新增检查点，全真）**：
  - `BOOTSTRAP_MENTION_COUNT=1`——整页「项目尚未 bootstrap」**只出现一次**（统计**最内层**匹配元素：父链上的祖先都含它，故只数最内层，应恰为 1）；`BOOTSTRAP_MENTION_IN_CENTER_EMPTY=true`（那一次就是中栏空状态标题 `.empty-title`）；`BOOTSTRAP_CENTER_CTA_PRESENT=true`（带「开始与 su 对话」按钮）。
  - `BOOTSTRAP_LEFT_NOTICE_ABSENT=true` + `BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT=true`——**左栏那块提示不存在**（断言「它不在」：`#bootstrap-notice` 元素为 null、全页无 `.bootstrap-notice` 类）。
  - `BOOTSTRAP_HINT_EMPTY=true` + `WRITE_NOTE_REMAINS_IN_HEADER=true`——横栏第二行未重复该句（状态提示留空），**只留写入语义**。
  - `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION=true`（有角色项目整页无该句，正常路径未受影响）。
  - `REFRESH_LEFT_NOTICE_STAYS_ABSENT=true` + `REFRESH_BOOTSTRAP_MENTION_AT_MOST_ONE=true`（刷新前后左栏提示都不存在、且该句未因刷新长出第二份）。
- **`test/桌面应用/renderer.test.ts`（T17 用例改写为守卫）**：断言 `RENDERER.split("项目尚未 bootstrap").length - 1 === 1`（渲染源码里**只出现一次**）、未 bootstrap 时 `setHint` 留空、且 `renderBootstrapNotice` / `#bootstrap-notice` / `bootstrap-notice` 在 `renderer.js` 与 `index.html` **均不存在**、`.bootstrap-notice` 在 `styles.css` **不存在**（**断言「它不在」，非删断言**）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **91 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **600 pass / 0 fail**。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`；上述新守卫全真，**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`/`RUNTIME_NOTE_*`）。
- **截图自看**（`05-bootstrap.png`，空项目那屏）：中栏正中一处「项目尚未 bootstrap」+ 说明 + **按钮**；左栏**无**白底提示框；横栏第二行**只剩**写入语义。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

### 边界登记（不在本轮范围）

- 「完成 bootstrap」按钮与 `session:bootstrap-state`/`session:finalize` IPC **未动**——其「su 主动提议 → 客户确认」的改造归后续任务（编排/项目管理）。
- `renderBootstrapAction` / `#bootstrap-action`（创世 finalize 动作条）与本轮无关，保留。

## 2026-10-11 — 去掉原生标题栏与默认菜单栏，自绘标题栏（客户裁定）

**来源**：客户要求——原话「**顶部需要去除 electron 原本的，自己搞一个**」。顶部原有**两样原生 chrome**：最上面那条 **OS 标题栏**（应用图标 + `ANS` + 最小化/最大化/关闭），以及它下面那条**默认菜单栏**（`文件 / 编辑 / View / …`）。**两样都去掉**，改为一条自绘的窄栏。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 去原生 chrome（主进程）

- **无边框**：`app/main.ts` 的 `BrowserWindow` 加 **`frame: false`**——去掉 OS 标题栏。
  - **缩放没弄丢**：**不动 `resizable`（默认 `true`）**，Windows 上无边框窗口默认仍带缩放边框（`thickFrame` 默认 `true`）；最小化/最大化/关闭改由自绘按钮经 IPC 驱动。
- **去默认菜单栏**：`app.whenReady()` 里 **`Menu.setApplicationMenu(null)`**——整条移除那条「文件/编辑/View…」（Windows 上各窗口随之无菜单栏）。
- **快捷键评估**：文本编辑类快捷键（Ctrl+C/V/X/A、撤销）由 **Chromium 原生**处理、**不经**菜单加速键，故不受影响；被移除的只是默认菜单提供的加速键（Ctrl+R 重载、Ctrl+Shift+I 开发者工具、Ctrl+Q 退出等）。本应用是极简聊天工具，这些**并非必要**，故 **不补回任何加速键**，更**不把菜单栏加回来**。

### 自绘标题栏（渲染侧）

- **构成**：`index.html` 顶部新增 `#titlebar`——**左＝应用标识**（`ANS` + `治理会话工作台`），**右＝三个窗口按钮**（最小化 `#win-min` / 最大化-还原 `#win-max` / 关闭 `#win-close`）。原左栏头里重复的品牌标识**已上移**，左栏头改为分区标签「项目」（与右栏「角色资料」并列），**不重复堆砌**。
- **拖动区 / no-drag**：整条 `.titlebar` 设 `-webkit-app-region: drag`；按钮及其容器设 `-webkit-app-region: no-drag`（否则点不动）。
- **双击最大化＝系统原生**：拖动区在 Windows 上按 **HTCAPTION** 对待，**双击即按惯例最大化/还原**——由系统完成，故渲染侧**刻意不挂 `dblclick`**（叠加会与原生切换抵消成「双击没反应」）。
- **按钮 → IPC**：渲染侧 `initTitlebar` 把三个按钮接到 preload 方法 `d.minimizeWindow()` / `d.toggleMaximize()` / `d.closeWindow()`；主进程经 `window:minimize` / `window:toggle-maximize` / `window:close` 调 `win.minimize()` / `win.maximize()|unmaximize()` / `win.close()`。
- **最大化态反映到图标**：`window:is-maximized`（初始化查询）+ `window:maximized-changed`（`maximize`/`unmaximize` 事件外推）→ 渲染侧 `setMaximizedUI` 在「最大化」与「还原」两图标间切换（`.win-btn.is-maximized`）。
- **风格融入**：浅色、近单色、无装饰；小圆角只给可交互元素（沿用既有令牌）；**无 emoji**；关闭按钮**不是** macOS 式刺眼红块——hover 只给一点克制的语义提示（浅红底 `--danger-bg` + 深红字 `--danger`）。按钮为原生 `<button>`，**键盘可聚焦**且 `:focus-visible` 有可见 inset 环。

### e2e 同步（`test/桌面应用/e2e/main.mjs`）

- e2e **自己建 `BrowserWindow`**，故**同步改无边框**（`frame: false`）+ **`Menu.setApplicationMenu(null)`**，与真实应用一致——否则截图里看不到自绘栏。
- **⚠ 不真点关闭/最小化/最大化**（关闭会杀掉测试窗口、最大化会改变截图尺寸）。**注入替身**验证接线：临时把 `window:minimize`/`window:toggle-maximize`/`window:close` 三个通道换成「只记录、不动窗口」的替身，点三个按钮后断言各自被调用一次，再还原真实处理器。（注：`contextBridge` 暴露的 `window.desktop` **不可写/不可重定义**，故替身只能落在**主进程 IPC 边界**，不能改渲染侧对象。）

### 守卫（「它存在」/「它不在」）

- **e2e 新检查点（全真）**：`NO_DEFAULT_MENU_BAR`（默认菜单栏**不存在**）、`CUSTOM_TITLEBAR_PRESENT`、`TITLEBAR_IS_DRAG_REGION`、`TITLEBAR_HAS_THREE_BUTTONS`（三个按钮）、`WINDOW_BUTTON_NO_DRAG`、`WIN_BRIDGE_FUNCTIONS`、`WIN_IS_MAXIMIZED_IPC`、`WIN_BUTTON_MIN/MAX/CLOSE_WIRED`（各被点一次）、`WINDOW_ALIVE_AFTER_GUARDS`（未真动窗）。
- **`test/桌面应用/renderer.test.ts` 新增 2 例源码不变式守卫**：① 无边框（`frame: false`）、**不得** `resizable: false`、`Menu.setApplicationMenu(null)`；② 三按钮经 IPC 接主进程（通道两端 + 渲染侧接线 + 拖动区/no-drag 样式 + **不得挂 `dblclick`** + 左栏**不得**再出现 `brand-mark`/`brand-sub`）。

### 证据（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **91 pass / 0 fail**（基线 89，+2）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **600 pass / 0 fail**（基线 598，+2）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`；上述新守卫全真，**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`HAS_DENIED_INLINE=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`REFRESH_*`/`FIN_*`）。
- **截图自看**（`00-titlebar.png`）：顶部就是**自绘的那条栏**（左 `ANS 治理会话工作台`、右 三个按钮），**没有**原生标题栏与菜单栏；左栏头是「项目」（不再重复品牌）。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

## 2026-10-11 — 去掉运行时选择器、桌面一律跑 pi；底部输入区只剩输入框（客户看截图裁定）

**来源**：客户看了截图后裁定——原话「**底部这块搞复杂了，应该就是一个输入框**」。截图里底部挤了三行：① `运行时 [demo·演示▾]` + `Pi 设置` + 状态提示「已导入项目，共 N 个角色…」；② demo 写入语义的说明（两行）；③ 输入框 + 发送。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 客户已定（逐条落地）

1. **去掉运行时选择器、桌面一律跑 pi**——界面上不再有 demo/pi 选择器；桌面会话一律以 `runtime: "pi"` 发起。`RuntimeKind` 类型**保留**（CLI 侧仍用），只是**界面不再暴露它**。
2. **`Pi 设置`入口保留**，从输入区**移到中栏横栏（`.chat-head`）右侧**（那里本就有标题与状态）。
3. **底部输入区只剩：输入框 + 发送**。
4. **原来的两行提示（状态提示 + 写入语义）也上移到横栏**、**各压缩成一行**；**写入语义那句必须保留**（去掉 demo 后它只剩单一一层意思）。

### 改了什么（均在本角色边界内）

- **`app/renderer/index.html`**：
  - `.chat-head` 改**两行**：第一行 `.chat-head-top`（`#chat-role`/`#chat-role-sub` + `#session-state` 药丸 + `#btn-pi-settings`「Pi 设置」+ `#btn-stop`「结束会话」）；第二行 `.chat-head-notes`（`#composer-hint` 状态提示 + `#runtime-note` 写入语义）——**客户要的「上移到横栏」**。
  - **删** `.composer-tools`（含 `<label class="rt-select">` + `<select id="inp-runtime">` 两个 `<option>`）与旧位置的 `<div id="runtime-note">`。
  - `.composer` **只剩** `.composer-row`（textarea + 发送）；`#bootstrap-action` 与 `#pi-panel` **移出** `.composer`、成输入区上方独立块（使 composer 字面只剩输入行）。
- **`app/renderer/renderer.js`**：
  - **删** `writeModeInfo(runtime)`（demo/pi 两套文案）、`appendWriteModeNote(runtime)`、`renderRuntimeNote()`（随选择器 `change` 重渲染）及 `ICONS.noWrite`——**选择器相关的死代码**。
  - **新增** `WRITE_NOTE`（单一句）+ `renderWriteNote()`：写入语义**唯一来源**、**常驻横栏** `#runtime-note`，初始化时渲染一次、**无 change 监听**（不再随运行时切换）。
  - `selectRole`：`var runtime = $("inp-runtime").value` → **`runtime: "pi"`**（桌面一律 pi）；请求失败提示改为「可重试，或在『Pi 设置』中检查配置」（不再提「更换运行时」）；**删**会话开启时的内联 `appendWriteModeNote` 调用（横栏已常驻）。
  - `setChatHeader` 副标题改中性：`会话由治理引擎全程把关，写入受该角色边界约束`（不再指「见输入区」）。
  - **删**两处 `$("inp-runtime").addEventListener("change", …)`（写入语义重渲染 + 选 pi 自动展开面板）——面板现仅由横栏「Pi 设置」开关。
  - **判定读取一个未动**（`primaryRoleId`/`hasRoles`/`st.*`/`res.config.*`/`res.wrote|pins|roles|reason`），渲染侧仍**无第二份判定**。
- **`app/renderer/styles.css`**：
  - `.chat-head` 改**列布局、两行**；新增 `.chat-head-top`/`.chat-head-notes`（含 `#composer-hint`/`#runtime-note` 的横栏排布）。
  - **删** `.composer-tools`/`.rt-select`/`.rt-label`/`.composer select`/`.composer select:focus-visible`（选择器样式）与 **`.sys-nowrite`/`.sys-write`**（demo/pi 两套内联写入样式，已无消费者）；`.runtime-note` 改为横栏内联紧凑版；`.btn-pi` 去掉 `margin-left:auto`。
  - `#pi-panel`/`#bootstrap-action` 移出 composer 后补左右边距（`margin: 0 28px 10px`；窄窗媒体查询内 18px）以对齐输入区。**视觉方向不变**（浅色、近单色、几乎无强调色、小圆角只给交互元素、内容区不做圆角卡片/无投影）。
- **写入语义（压缩成一行，客户要求保留）**：`写入会真正落到你导入的项目，但受该角色边界约束，越界写会在写之前被拒。`

### ⚠ 技术后果：测试改为在**注入缝**换适配器（不为测试留后门）

**问题**：此前测试靠「demo 选项」离线跑（demo 不进真实网络）。选择器一去掉，界面只会走 **pi** → e2e/单测**在没有凭据时会失败**。

**做法（客户指定：在注入缝换掉适配器，界面无任何后门开关）**：
- `test/桌面应用/e2e/main.mjs` 构造 interface 时注入 **`createPiAdapterFactoryFn`**——用 `createChatDemoAdapter` **按 `role.boundary`** 构造（`bindRole` 收到的 `ResolvedRole` 带 `boundary`），**顶掉真实 pi 工厂**。界面/会话的运行时标签仍是 `pi`（换掉的只是注入缝上的适配器）。
- 安全性：demo 适配器的 `buildGovernedTools(gate)` **未传 `writeRoot`** ⇒ 写层 fail-closed「已判定但未落盘」（`src/provider/pi/tools.ts:235`）⇒ e2e **只判不写、绝不改仓库**（与旧 demo 路径同一保证）。
- **界面无后门开关**：选择器/DOM/事件全删干净，未留任何测试专用开关。

### 守卫（断言「它不存在」，非删断言）

- **e2e `main.mjs`**：把旧的「切选择器看文案」步骤（依赖 `#inp-runtime`）**改为守卫**——`NO_RUNTIME_SELECTOR`（无 `#inp-runtime`）、`NO_RT_SELECT_CLASS`（无 `.rt-select`）、`NO_SELECT_ELEMENTS`（页面**零** `<select>`）；并断言写入语义已上移横栏（`RUNTIME_NOTE_IN_HEADER`/`SAYS_PI_WRITES`/`ONE_LINE_GATED`）、`Pi 设置`在横栏（`PI_SETTINGS_IN_HEADER`）、底部只剩输入框（`COMPOSER_CHILD_ROWS=1`/`COMPOSER_HAS_TEXTAREA_SEND=true`/`COMPOSER_CLEAN=true`）。
- **`test/桌面应用/renderer.test.ts`**：源码不变式改为——① 写入语义（桌面一律 pi）明示真实写入/受边界约束/越界被拒；② **界面不再有选择器**（`!INDEX.includes('id="inp-runtime"')`、`!INDEX.includes('rt-select')`、`!RENDERER.includes('inp-runtime')`、`!STYLES.includes('.rt-select'||'.rt-label')`、`!STYLES.includes('.sys-nowrite'||'.sys-write')`）、写入语义常驻横栏 `#runtime-note`、`runtime: "pi"` 发起；T28 用例把「选 pi 自动展开」断言改为「`Pi 设置`入口在横栏（在 `chat-head` 之后）」。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **89 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **598 pass / 0 fail**。（另一角色并行改 `test/测试/` 一处，本角色任务书预告「会有 1 处红」；但**本轮跑测时未见红**——可能对方已修或其改动在制品中，如实报告：本角色只保证**属我的全绿**，未动 `test/测试/`。）
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增守卫全真**（选择器不存在、底部干净、提示上移横栏）；**既有检查点全过**（`E2E_DONE`/`ROLE_*`/`DEFAULT_SELECTED_ROLE=su`/`SU_*`/`HAS_DENIED_INLINE=2`/`HAS_DENIED_GROUPED=true`/`ACCEPTED_ROWS=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`REFRESH_*`/`FIN_*`）。
- **截图自看**（`12-composer.png`/`02-chat.png`）：底部**只剩一行**（输入框 + 发送）；横栏第一行右侧是 `聊天中` 药丸 + `Pi 设置` + `结束会话`，第二行是状态提示 + 一行写入语义（`✎ 写入会真正落到你导入的项目，但受该角色边界约束，越界写会在写之前被拒。`）。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

### 边界登记

- **`RuntimeKind` 类型保留、只读导入**（`src/common/shared/runtime-shared.ts`，pm 属主）——现在仅 `SessionOpenRequest.runtime` 与 `selectAdapterFactory` 消费；CLI 侧仍用，不受影响。
- **demo 适配器 `app/desktop/chat-adapter.ts` 保留**，但**不再是产品路径**——只在**测试注入缝**上使用（e2e 注入以顶掉真实 pi 工厂），如实标注。

## 2026-10-11 — 移除 su 的「只读」徽标与只读内联提示（客户裁定：回到「用户对边界无感」的原模型）

**来源**：客户看截图后裁定——原话「这个 su 有角色也不不是只读的，**一直可以聊天**，你看图，**还是只读的**」。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 判定依据（回到客户早已定过的模型，非新增偏好）

客户此前明确定过：**「导入项目 = 授权；门禁静默执行，拒绝内联显示在聊天流里」**——即**不需要提前打预防针**，真被拒时在对话里显示即可。**「只读」这个徽标是后加的，偏离了这条**（客户还说过「文件边界压根用户无感」——边界是项目管理的事，不该在角色列表上摊给用户）。**故拆掉它。**

### 改动

- **`app/desktop/interface.ts`**：**删** `RoleView.readOnly` 字段、`isReadOnlyRole` 函数及其全部注释；**删** `DesktopDeps` 的 `resolveRoleFn`/`loadEffectiveConfigFn` 注入点；**删** `listProject` 里「经 `buildEffectiveProjectConfig` 取生效配置 + 引擎 `resolveRole` 解析主入口内置角色真实生效边界」那段——它此前**唯一用途就是派生 `readOnly`**，随之失去消费者。连带删除只服务它的 import（`resolveRole`、`loadEffectiveConfig`、`buildEffectiveProjectConfig` 及类型 `LoadConfigOptions`/`LoadedConfig`）。
- **不是死代码的真修复**：`readOnly` 本就只在界面派生、只被渲染进程读；而 `.ans` 项目治理边界路径那条**真修复**（`app/desktop/project.ts::buildEffectiveProjectConfig` 采纳 `loaded.project.governanceBoundary.path`）**另有消费者**——`app/desktop/session.ts` 开会话路径仍用它（且是修复点本体），故**保留**，并由 `su-effective-boundary.test.ts` ②③ 守卫。
- **`app/renderer/renderer.js`**：**删** `appendReadonlyNote` 函数与 `selectRole` 里的调用、**删** 角色树条目上的 `只读` 徽标渲染（`r.readOnly ? ...`）。**保留** `ICONS.readonly`（该锁形图标仍被 Pi 配置来源说明 `sys-config` 复用）。
- **`app/renderer/styles.css`**：**删** `.ti-badge.readonly` 与 `.sys-readonly`（均已无消费者）；更新徽标注释为「主入口 / 内置」。
- **保留**：`主入口`、`内置` 两枚徽标——它们**不是边界机制**（主入口 = 默认入口；内置 = 无角色目录），是有用的信息。
- **真正的信号不变**：被拒时**在聊天流里内联显示**（浅红 `details.sys-denied`，可展开看按根分组允许路径）——**那才是客户要的「静默执行 + 拒绝内联」**。e2e `HAS_DENIED_INLINE=2`、`HAS_DENIED_GROUPED=true`、`DENIED_OPEN_COUNT=2` 确认它仍正常。

### 运行时写入语义提示（demo「只判不写」/ pi「会写」）：**保留**（判断与理由）

**保留。** 理由：它**不是「边界机制」**，是**运行时语义**——回答「我这条消息会不会真的写进项目」。① 它随 `#inp-runtime` 选择器切换（demo/pi 两套文案），描述的是**路径**而非角色的写权；② 它不暴露 writeSet / 边界文件清单 / acceptance——三样客户说「用户无感」的东西它都没碰；③ 客户先前**亲自**要求把「只判不写」**限定到 demo 路径**（设计 §3.9 更正），这条提示正是那次裁定的产物；若一并删掉，会退回「一概而论的错误印象」。故它**不属于**「提前暴露边界机制」这一类，**保留**。

### 测试与验证

- **`test/桌面应用/interface.test.ts`**：删 `isReadOnlyRole` 及旧 `readOnly` 断言用例；改为**反向守卫**「任何角色（内置 su / 创世态 / 可写项目角色）都不再带 `readOnly` 字段」。
- **`test/桌面应用/su-readonly-bootstrapped.test.ts` → 重命名为 `su-effective-boundary.test.ts`**（文件名不再挂已废止的「只读」）：保留「`.ans` 治理边界路径被采纳」的三条真守卫（引擎解析 su 生效边界**已接受**、gate **放行治理边界内写 / 拒边界外写**、无 `.ans` 回退内置未接受）；①④ 的 `readOnly` 断言改为「**无该字段**」守卫。
- **`test/桌面应用/e2e/main.mjs`**：把只读相关检查点**改成「不存在」守卫**（**非删断言**）：`SU_NO_READONLY_BADGE`、`SU_NO_READONLY_NOTE`/`SU_NO_READONLY_ROWS`、`DESKTOP_ROLE_NO_READONLY_BADGE`/`..._ROWS`、`BOOTSTRAP_SU_NO_READONLY_BADGE`、`REFRESH_SU_NO_READONLY_BADGE`；新增 `SU_BADGE_LABELS`（断言 su 那行只剩 `主入口|内置`）。
- **单测** `node --test test/桌面应用/*.test.ts` → **89 pass / 0 fail**（基线 90，−1：删掉纯 `isReadOnlyRole` 用例；原 3 条只读断言用例改写成 3 条反向守卫）。
- **`npm run typecheck`** → **1 处错误**，在 **`test/测试/t9-block1-bootstrap.test.ts:138`**（`listing.roles[0].readOnly`）——**属「测试」角色边界（`test/测试/`）、不在本角色白名单内，故未越界改，如实回报**（需测试角色把该断言改为「无 `readOnly` 字段」或删除）。
- **全量** `node --test "test/**/*.test.ts"` → **597 pass / 1 fail**（唯一失败即上述 `test/测试/` 断言，**边界外、如实登记**；基线 599，−1 同 source）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`：只读守卫全真（`SU_NO_READONLY_BADGE=true`、`SU_NO_READONLY_NOTE=true`/`SU_NO_READONLY_ROWS=true`、`BOOTSTRAP_SU_NO_READONLY_BADGE=true`、`REFRESH_SU_NO_READONLY_BADGE=true`、`DESKTOP_ROLE_NO_READONLY_BADGE=true`）、`SU_BADGE_LABELS=主入口|内置`；**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HAS_DENIED_INLINE=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`/`RUNTIME_NOTE_*`）。**截图确认** su 那行只剩「主入口」「内置」。跑完无残留 Electron；真实 `.env` 指纹（size=488 / mtime=1791706923 / SHA-256 `75aee37f…`）**逐字节不变**。
- **未读 `.env`、未发真实网络请求、未打印凭据值**。

## 2026-10-11 — 修复：已 bootstrap 项目里内置 su 恒被误标「只读」——桌面丢弃了 `.ans` 的项目治理边界路径

**来源**：客户界面反馈「su 不该是只读」+ 协调方定位。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 症状与根因

**症状**：在有角色的（已 bootstrap 的）项目里，内置治理角色 su **恒显示「只读」**——即便项目已 bootstrap。

**根因链**：
- `app/desktop/session.ts`：从 `.ans` 载入后**只采纳 `source.acceptance`**，`source` 其余字段被丢弃；
- `app/desktop/project.ts::buildProjectConfig`：`governanceBoundary` **硬写 `{ path: "", acceptance }`**；
- ⇒ 门禁 `resolveBoundarySection` 的「**治理边界覆盖**」分支（`src/common/门禁引擎/boundary-core.ts:219`，要求 `gov.path` 非空）被跳过 ⇒ su 掉回**内置未接受**（skill 根边界）⇒ **拒一切写**；
- ⇒ 界面据枚举给的（**恒为未接受**的）边界 acceptance，经 `isReadOnlyRole` **误标只读**。

**即**：bootstrap 建出的治理结构在桌面上是空的——**su 建完角色之后反而什么都不能做**。

### 字段名更正（协调方的假设不成立）

治理边界路径**不在 `source` 上**——`config-loader.ts::ConfigSource` 只含 `{ kind, path, acceptance, pinPaths, downgradeReason }`；路径在 **`loaded.project.governanceBoundary.path`**（`buildFromAns` 里 `project.governanceBoundary = { path: govRaw.path, acceptance }`）。

### 修法（均在本角色边界内）

- **`app/desktop/project.ts`**：
  - `buildProjectConfig` 增**第 4 参** `governanceBoundaryPath: string = ""`，设 `governanceBoundary.path = 该值`（**不再硬写空串**；缺省空串 ⇒ 无 `.ans` 时走原回退，行为不变）；
  - 新增 `DESKTOP_RUNTIME_CONSENT`（运行期同意常量）与 **`buildEffectiveProjectConfig(listing, deps)`**——桌面**授权链的唯一实现**（`fallback=运行期同意 → 共享载入器 → **采纳 loaded.project.governanceBoundary.path**`），**会话语义与界面只读判定共用同一份**，杜绝两处漂移。
- **`app/desktop/session.ts`**：开会话改经 `buildEffectiveProjectConfig`（不再自行 `buildProjectConfig(listing, source.acceptance)` 丢路径）；deps 的 `buildProjectConfig` 类型放宽到含 env + path。
- **`app/desktop/interface.ts`**：`listProject` 也经 `buildEffectiveProjectConfig` 取生效配置，再用**门禁引擎** `resolveRole(primaryRoleId, project)` 解析**主入口内置角色的真实生效边界**，据此定 `readOnly`——**单一来源、不重写判定**（pin 不匹配 / 边界文档损坏等仍如实反映为未接受）；解析失败退回枚举所提供的边界（fail-safe）。新增可注入 deps `resolveRoleFn`/`loadEffectiveConfigFn`。

### 被丢弃字段——逐个核查「采纳 / 不采纳」及理由

| 字段 | 处置 | 理由 |
| --- | --- | --- |
| `source.kind` | 采纳 | → `OpenResult.config.kind`，界面如实呈现来源种类 |
| `source.path` | 不采纳 | `.ans` 文件路径，仅供展示/诊断；会话无须 |
| `source.acceptance` | **采纳** | 生效（已 fail-closed 规范化）的 acceptance |
| `source.pinPaths` | 采纳 | → `config.pinCount`（如实示 pin 条数） |
| `source.downgradeReason` | 采纳 | → `config.reason`（fail-closed 降级原因） |
| `project.projectRoot` | 不采纳 | 与枚举 `listing.projectRoot` 同值；桌面对齐枚举 |
| `project.skillRoot` | 不采纳 | 桌面经 `resolveSkillRoot(env)` 自算，等价 |
| `project.roles` | **有意不采纳** | 桌面以**枚举角色**为准（与左树同源）；载入器 roles 在 `ans-invalid` 分支为空、且不含 `builtInRoles`，直接采用会破坏内置角色/入口 |
| `project.governanceBoundary.path` | **采纳（本次修复）** | **此前唯一被丢且必须采纳的字段**——它决定「治理边界覆盖」是否命中 |
| `project.governanceBoundary.acceptance` | 采纳 | 与 `source.acceptance` 同一引用（`buildFromAns`） |

### 三条路径（修复后均正确）

| 情形 | su 的边界 | 界面只读 |
| --- | --- | --- |
| **无 `.ans`** | 回退运行期同意；su 仍回退内置未接受 | **标只读**（如实：其写入被 F6 拒） |
| **未 bootstrap（`!hasRoles`）** | 创世种子边界（`genesisBootstrap`）⇒ su **能写**治理产物 | **不标只读**（T30 已如此） |
| **已 bootstrap（`.ans` 有效 + 治理边界路径 + pin 正确）** | **项目治理边界**（已接受）⇒ su 按项目治理边界工作 | **不标只读**（**本次修复**） |

### 测试与验证

- **新增 `test/桌面应用/su-readonly-bootstrapped.test.ts`（4 例）**——用**真实**共享载入器 + 真实门禁引擎 + 真实编排，`mkdtemp` 造**已 bootstrap 且 `.ans` pin 正确**的项目（一项目角色 + `角色卡/governance-boundary.yaml` + `.ans` 指向它）：
  - ① 界面 **不**标内置 su 只读（项目角色亦不受影响）；
  - ② 引擎为 su 解析出的**生效边界为已接受**、`governanceBoundary.path` 已从 `.ans` 采纳；
  - ③ su 的 gate **放行治理边界内**的写（`角色卡/…`、`docs/…`）、**拒绝边界外**（`src/…`）；
  - ④ 反例：**无 `.ans`** 的已 bootstrap 项目里 su **仍标只读**（该路径不变）。
- **单测** `node --test test/桌面应用/*.test.ts` → **90 pass / 0 fail**（基线 86，+4）。
- **`npm run typecheck`** → **全仓零错误**。**全量** `node --test "test/**/*.test.ts"`（带引号）→ **599 pass / 0 fail**（基线 595，+4）。
- **e2e** 退出码 0、`E2E_DONE=1`，既有检查点全过（`DEFAULT_SELECTED_ROLE=su`、`SU_READONLY_BADGE=true`〔仓库根**无 `.ans`**，su 标只读**正确**〕、`BOOTSTRAP_SU_READONLY_BADGE=false`、`REFRESH_SU_READONLY_BADGE=true`、`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`）。
- **未读 `.env`、未发真实网络请求、未打印凭据值**（测试/e2e 全程只碰系统临时目录）。

## 2026-10-11 — 视觉方向定稿：浅色、中性、极简（参照 Claude 桌面应用）；**取代「图纸（drafting）」方向**

**来源**：客户发参照截图，原话「整体风格和这种就行了」——参照即 **Claude 桌面应用本身的界面**（浅色、干净、极简）。该条**覆盖**此前「图纸」方向（**方格底纹、斜线阴影带、尺寸标注、实线/虚线行那套作废**）。**属本角色边界内**（`app/renderer/`）。**只动视觉层、零行为改动**：`renderer.js` 的判定读取（`primaryRoleId`/`hasRoles`/`readOnly`/`st.*`/`res.config.*`/`res.wrote|pins|roles|reason`）**一个未动**，渲染侧仍**无第二份判定**；所有既有 e2e 检查点**全过**。

### 定稿色 / 字（零外部依赖）

| 名 | 值 | 用途 |
| --- | --- | --- |
| 主区 | `#FFFFFF` | 主内容区（近白） |
| 侧栏 | `#F4F4F2` | 左栏（略灰，**靠色差区分**，不靠边框） |
| 浅底 | `#FAFAFA` / `#F0F0EE` / `#ECECEA` | 右栏面板 / hover / 选中项 |
| 线 | `#E8E8E6`（`#DCDCDA`） | **极淡**分隔线（很多时候不用线，靠留白分组） |
| 文字 | `#1F1F1F` / `#6B6B6B` / `#9A9A9A` | 近黑 / 次级灰 / 更淡灰 |
| 拒绝 | `#B42318`（底 `#FEF3F2`） | **语义色·拒绝**（克制红，浅红底内联块，面积小） |
| 成功 | `#067647` | **语义色·成功**（克制绿，面积小） |

- **字体**：**一套无衬线为主**（`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`）；**等宽只留给技术事实**（`ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace`——路径 / SHA-256 / 工具名 / 行号）；**去衬线正文**。
- **强调色**：**基本没有**——按钮 / 选中态 / 药丸一律**中性灰**（选中 = 浅灰底 + 深字；主按钮 = **中性深色实心**）；唯一颜色是**语义色**（拒绝红 / 成功绿），**面积小、只在必要时**。
- **圆角只给交互元素**（按钮 / 输入 / select / textarea / 药丸 / 列表选中项 / 计数，6–8px）；**内容区域不做圆角卡片、不加投影**（全表无 `box-shadow`，除 focus ring）。
- **一处用力**不变——现在「用力」处是**拒绝的语义红**（浅红底内联块），其余保持中性灰的克制。

### 作废与保留

- **作废**：方格底纹、`repeating-linear-gradient` 斜线阴影带、`|— root —|` 尺寸标注、边界表的实线/虚线行、以及「等宽 + 衬线 + 无衬线」三套字的用法。
- **保留**（与新方向一致）：**技术事实等宽**；**拒绝要有明确但不喧哗的呈现**；**一处用力**的原则。

### 验证

- **单测** `node --test test/桌面应用/*.test.ts` → **90 pass / 0 fail**（源码不变式守卫的样式钩子 `.runtime-note`/`.sys-nowrite`/`.sys-write`/`.sys-config`/`.bootstrap-notice`/`.btn-start`/`.msg-handback`/`.is-mirror`/`.pi-*`/`.bootstrap-action`/`.sys-finalize` **全保留**）。
- **`npm run typecheck`** → **全仓零错误**。**全量** → **599 pass / 0 fail**。
- **e2e** 退出码 0、`E2E_DONE=1`，既有检查点**全过**；逐屏截图**已自看**（浅色、中性、几乎无强调色——**无深色底、无蓝色主色、无装饰性花纹/渐变**）。跑完**无残留 Electron**。

## 2026-10-11 — 视觉重做：上一版「深色三栏 + 蓝色主色」被「图纸（drafting）」方向取代

> **⚠ 本篇方向（方格 / 斜线阴影带 / 尺寸标注）已被同日上一条「浅色、中性、极简」取代**——客户给了参照（Claude 桌面应用），「图纸」方向作废。下文仅作历史留痕，**现行视觉以上一条为准**。

**来源**：客户要求把界面**美化重做**；视觉方向经讨论选定为**图纸（drafting）**——本产品的独特性**不是聊天**，是「边界」与「越界被拦下」，故视觉语言取自制图/图纸。**属本角色边界内**（`app/renderer/`）。**只动视觉层、零行为改动**：`renderer.js` 的判定读取（`res.primaryRoleId`/`hasRoles`/`readOnly`/`st.available`/`st.settled`/`res.config.*`/`res.wrote|pins|roles|reason`）**一个未动**，渲染侧仍**无第二份判定**；所有 e2e 检查点（`DEFAULT_SELECTED_ROLE`、`BOOTSTRAP_*`、`REFRESH_*`、`NO_MODAL_*`、`HANDBACK_*`、`MIRROR_*`、`PI_*`、`FIN_*`）**全过**。

### 被取代的上一版

上一版是「**柔和深色三栏 + 一个蓝色主色**」（`--bg:#101318` 一族 + `--accent:#5b8def`；圆角 6/8/12、柔和面板、uniform 卡片）。客户直言「页面也改漂亮一点」「专业一点」，但那正是**AI 生成的典型痕迹**之一（近黑底 + 单一亮色 / SaaS 卡片套装）。本方向**整体取代**它：改冷调**浅色纸面**、由**线**定义区域（无圆角、无阴影）、制图蓝作结构、红铅笔**仅**用于拒绝。

### 色（四个值起）

| 名 | 值 | 用途 |
| --- | --- | --- |
| 纸 | `#ECEFF1` | 冷调纸面（不是奶油） |
| 格 | `#D9E0E4`（主格 `#CDD7DC`） | 方格底纹（`repeating-linear-gradient`） |
| 墨 | `#1E2529` / `#5C6870` | 主/次文字（石墨，非纯黑） |
| 线 | `#2E6B8A` | 制图蓝：结构 / 边界 / **允许** |
| 拒 | `#A33A22` | 红铅笔：**拒绝**（只此一处用力） |

### 字（**只用系统字体栈，零外部依赖**）

- 等宽 `ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace`：路径 / SHA-256 / 工具名 / 行号。
- 衬线 `"Iowan Old Style", Palatino, "Songti SC", "SimSun", Georgia, serif`：角色卡正文 / 留痕 / 长文。
- 系统无衬线：**只**给界面 affordance（按钮、树标签）——它不是「文档内容」。

### 唯一用力处：拒绝的斜线阴影带

```css
details.sys-denied {
  border-left: 3px solid var(--reject);   /* 红铅笔边 */
  background-color: var(--reject-soft);
  background-image: repeating-linear-gradient(
    45deg, rgba(163,58,34,0.14) 0 1px, transparent 1px 9px);  /* 斜向排线——是「线」，不是装饰性渐变洗色 */
}
```
全页**只有这一处**用力；其余一切（含 `sys-config`/`warnings`/`只读`/`hb-blocked`）一律**细线 / 细字**，安静克制。

### 其余区域的画法

- **整页当一张图纸**：`body` 方格底纹贯穿三栏；三栏由**线**划分（结构线制图蓝），**不用圆角卡片、不用阴影**（全表 `border-radius:0`、无 `box-shadow`）。
- **左树**：角色条目=标注过的字段；su 置顶，用**带边框的区域**（`.tree-item.primary`）标为「主入口」，其余归「其他角色」组（分组标签后拖一条引线）。
- **中栏**：对话是一份**连续记录**（用户=右侧蓝调块 / 助手=衬线 + 左缘细线）；系统事件做成**图纸注记**（`tool_call`/`accepted` 走蓝线 + 对勾，等宽文字）；**拒绝**放进斜线阴影带。
- **右栏**：边界条目**真的画出来**——每条画成一个块：`root` 用**尺寸标注** `|— project —|`、`kind` 用**线型样片**（实线目录 / 虚线条件 / 细线文件）、允许条目**实线行**、条件目录**虚线行**。
- **输入区**：有横线的**填写栏**（textarea 只留上/下横线、聚焦时下缘转制图蓝变粗）；Pi 字段 likewise 是下划线字段。

### 对照「要避开的默认」逐条自查后**改掉**了什么

- **② 近黑底 + 单一亮色**：上一版正是此默认——**整页改为冷调浅色纸面**。
- **④ SaaS 卡片套装**：上一版统一圆角 6/8/12 + 柔和面板——**已全部去掉**：`border-radius:0`、无阴影，区域改由**线**定义。
- **③ 报刊式细线分栏密排**：三栏虽由细线划分，但用**方格纸**、制图蓝结构线与灰内部分隔线**分角色**、间距宽松，并**把右栏 4 列密排表改成每条一「块」**（原来 `#right-body` 4 列挤在 384px 内、purpose 大幅折行）——密度下降、可读性提升。
- **① 暖奶油 + 高对比衬线 + 赤陶**：用**冷**纸 `#ECEFF1`；衬线**只**用于文档内容（非全页）；`#A33A22` 是**暗砖红**且**只**表拒绝，非装饰主色。
- **ALL-CAPS 小标签**：删掉 `.tree-label/.tree-group/.sec-label/.rt-label/table.boundary th` 上的 `text-transform:uppercase` + 大 `letter-spacing`，改为正常字距的系统无衬线字段标签。
- **「A · B · C」点分隔元信息串**：删掉三处中缀点号——`roleSubtitle`（「内置治理角色 · 由 SKILL.md 定义」→「内置治理角色（定义见 SKILL.md）」）、回交元行（「角色：X · 任务 Y」→「角色 X，任务 Y」）、会话头副标题（「…把关 · 写入语义…」→ 中文逗号）；列表项前的「·」项目符号改为**线样片**（`.hb-ev::before`/`.fin-wrote li::before` 的小横线）。
- **字面 `**`**：`index.html` 的 Pi 提示里 `**仓库根 .env**` 在屏上是字面星号——改为 `<strong>`。

### 其余硬约束

- **纯 CSS、零外部依赖、不引外部字体、无 emoji**；`repeating-linear-gradient` **只**用于方格底纹与拒绝斜线带（画线），**无装饰性渐变洗色**。
- **响应式**：`@media(max-width:1180px/940px)` 收窄侧栏、保住中栏；`prefers-reduced-motion` 下关掉过渡/动画；键盘 `focus-visible` 一律 2px 制图蓝 outline（可见）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **86 pass / 0 fail**（未增删用例；源码不变式守卫——`.runtime-note`/`.sys-nowrite`/`.sys-write`/`.sys-config`/`.bootstrap-notice`/`.btn-start`/`.msg-handback`/`.is-mirror`/`.pi-*`/`.bootstrap-action`/`.sys-finalize` 等样式钩子**全保留**）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **595 pass / 0 fail**（与基线一致）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录 `C:\Users\MLoong\AppData\Local\Temp\ans-e2e-visual`）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**全部既有检查点仍过**：`DEFAULT_SELECTED_ROLE=su`、`SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`、`NO_MODAL_*`、`HANDBACK_*`、`MIRROR_*`、`PI_*`、`FIN_*`（`RIGHT_BOUNDARY_ROWS=11` 未变）。逐屏截图**已自看**（`01-import`/`01b-su`/`02-chat`/`03-denied`/`04-profile`/`05-bootstrap`/`06-refresh`/`07-handback`/`08-mirror`/`09-pi-panel`/`10-pi-saved`/`11-finalize`）。跑完**无残留 Electron**。
- **未读 `.env`、未发真实网络请求、未打印凭据值**（Pi 面板经 e2e 注入的临时 `.env`）。

## 2026-10-11 — T36：桌面接通 `finalize`——兑现客户确认的「保留 finalize + pin」（创世 bootstrap 的最后一步）

**来源**：编排 T36（`openRoleSession` 增可选 `genesisFinalize`，句柄据它附 `settled` + `finalize()`；**时机裁定＝显式触发**）+ 客户「保留 finalize + pin」+ 设计 §12.5（su 不会算 hash，pin 只能由代码在 su 写完后算）。**属本角色边界内**（`app/`、`test/桌面应用/`）。**测试角色用「用户入口」验收时抓到**：桌面此前**没有任何 finalize 调用** ⇒ 从用户入口走完 su 建角色后**无 `.ans`、无 manifest、无 pin** → 只能跑「运行期同意」例外，**与客户确认相反**。

### 缺口（为何此前这条路不通）

`app/desktop/` 全无 `finalize` 调用：编排的 finalize 能力此前只挂在治理会话句柄（CLI `ans govern` 路径），桌面走的**另一入口** `openRoleSession` 够不着 ⇒ 「导入空文件夹 → 与 su 对话 → su 建出角色」走完后**无 pin**。编排本任务（T36）把能力接到 `openRoleSession`（可选 `genesisFinalize`），本角色负责**接线 + 界面入口**。

### 触发时机（**显式**，不自动跑）——与编排裁定一致

su 建角色**可多轮**、每轮都 settle；「settle 就 finalize」会在**第 1 轮后 pin 出一个只有部分角色的 `.ans`**。**唯一可靠信号是用户说「我讲完了」** ⇒ finalize 是**显式的**：由「知道 bootstrap 已完成」的消费者（界面上的用户）在合适时机点。故本层**只在 settle 时刷新入口的「就绪」提示**，**绝不自动调用** `finalize()`。裁定同时明确：**多轮建角色必须全在创世态内完成，finalize 是 bootstrap 的最后一步**；写出 `.ans` 后自终止只关「之后再开的新会话」，不影响本次已完成的 bootstrap。

### 改了什么（均在本角色边界内）

- **`app/desktop/session.ts`（接线落点）**：
  - `SessionManager.open` 对**仅创世 su 会话**经 `openRoleSession` 开 **`genesisFinalize: true`**——判据 **`listing.hasRoles === false && role.builtIn === true`**（数据驱动、**不硬编码 "su"**；`role.builtIn` 来自门禁引擎枚举）。**有角色的普通聊天逐字不传**该字段（行为不变）。
  - `SessionManagerDeps.openRoleSession` 入参类型加**可选** `genesisFinalize?: boolean`（与编排入参对齐）。
  - 新增 `bootstrapState(): {available, settled, finalized}`（纯读、无副作用）与 `finalizeBootstrap(): Promise<FinalizeResult>`（转调句柄 `finalize()`；**失败如实返回 `{ok:false, reason}`，不静默、不假装成功**；成功后记 `finalized`）。`usesFinalize` 由**句柄是否真有 `finalize`** 判定（如实反映能力，不靠调用方自报）。
  - 导出 `BootstrapState` 与 **`FinalizeResult`**——后者**从编排公开句柄类型派生**（`Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>`），**不导入编排私有 `src/common/编排/finalize.ts`**（§6 禁跨角色导入他人私有 `common/`）；形状由编排**公开面**唯一决定，本层不自造第二份。
- **`app/desktop/interface.ts`**：`DesktopInterface` 增 `getBootstrapState()` / `finalizeBootstrap()`（**只透传**管理器，逻辑唯一在 SessionManager）；`DesktopDeps.openRoleSessionFn` 入参同步加可选 `genesisFinalize?`。
- **`app/main.ts`**：注册 IPC `session:bootstrap-state`（读，无副作用）/ `session:finalize`（显式触发；写入经门禁 `resolveWrite`，被拒即零副作用、结果如实回渲染侧）。
- **`app/preload.cjs`**：暴露 `getBootstrapState` / `finalizeBootstrap`（白名单通道）。
- **`app/renderer/{index.html,renderer.js,styles.css}`**：
  - `index.html` 加 `#bootstrap-action`（默认隐藏）——「完成 bootstrap」动作条。
  - `renderer.js` 增 `refreshBootstrapAction`（开会话后 + 每个 `settled` 事件后查询状态并渲染）、`renderBootstrapAction`、`onFinalize`（显式触发）、`appendFinalizeResult`（如实呈现结果）；`selectRole` 成功后 / `settled` 事件 / `stop` / 失败路径相应刷新或隐藏入口。
  - `styles.css` 加 `.bootstrap-action`（就绪用主色 `.is-ready`、未就绪用警示色 `.is-pending`）与 `details.sys-finalize`（成功 `.is-ok` / 被拒 `.is-denied`）——纯 CSS、无外部依赖、无 emoji、无渐变。

### 可见性条件与呈现（界面**不作判定**，只读主进程状态）

- **入口何时显示**：`bootstrapState().available` 为真时——即「当前是**创世 su 会话**（未 bootstrap 项目上开启的内置治理角色会话，`genesisFinalize` 已开）**且尚未 finalize 过**」。**有角色的普通聊天 / 其它角色**的会话 `available` 恒假（其句柄没有 `finalize`）⇒ 不显示。
- **「该不该现在点」**：据 `settled`（su 是否说过话）——
  - **未就绪**（`settled:false`）→ `.is-pending` 警示态 + 提示「su 还没有完成任何一轮。现在点会被拒（无可 pin 之物）——先与 su 对话」；
  - **就绪**（`settled:true`）→ `.is-ready` 主色态 + 提示「su 已完成至少一轮——现在可以完成 bootstrap」。
- **成功后**（示写出了什么）：展开一张 `details.sys-finalize.is-ok`，示 **写出路径（`wrote`）+ Pin 的边界文件与 SHA-256（`pins`）+ Pin 的角色（`roles`）**；入口随之隐藏（`available` 变假）。
- **被拒后**（示原因）：展开一张 `details.sys-finalize.is-denied`，示**完整 `reason`**（如「会话尚未 settle（su 尚未完成任何一轮）——拒绝 finalize，避免 pin 到半成品」「无可 pin 的边界文件…（fail-closed）」）；入口**保留**（用户可补救后再点）。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/finalize-wiring.test.ts`（12 例）**——用**系统临时目录**造假项目，跑完清理、**不在仓库留文件**（真实 `openRoleSession` + 真实 `finalize`）：
  - **开关**：创世 su 会话 `openRoleSession` 收到 `genesisFinalize:true`；有角色的普通聊天 / 有角色项目里的 su **都不传**（连键都不出现）。
  - **`bootstrapState`**：创世 su → `available:true`、未说话 `settled:false`、说话后 `settled:true`；普通聊天 / 未开会话 → `available:false`。
  - **成功路径**（真实 finalize，落盘**临时目录**）：写出 `.ans/project.json` + `docs/bootstrap-manifest.md`、pin 覆盖新角色 `boundary.yaml`、SHA-256 为 64 位十六进制；`.ans` accepted:true 带 pin 数组；manifest 为留痕文件；成功后 `finalized:true`/`available:false`。
  - **被拒路径**：**未 settle** → `ok:false` 且 reason 点明 settle、**零副作用**（不建 `.ans`/manifest）；**无可 pin 之物** → `ok:false` 且 reason 点明 fail-closed、零副作用；**普通聊天不具备能力** → `ok:false` 且如实说明仅创世 su 会话可完成。
  - **可注入句柄**：`finalize` 结果**原样转达**（不改写、不伪成功），成功后记 `finalized`。
- **`test/桌面应用/interface.test.ts` +1**：`getBootstrapState`/`finalizeBootstrap` 经 Interface 透传（读状态**不触发** finalize；`finalizeBootstrap` 显式触发并原样回转结果；关会话后入口不可用）。
- **`test/桌面应用/renderer.test.ts` +1**：源码不变式——入口据 `available` 显示、据 `settled` 提示就绪；显式调 `d.finalizeBootstrap`；成功示 `res.wrote/pins/roles`、被拒示 `res.reason`；容器/样式钩子与两 IPC 通道两端齐备。
- **单测** `node --test test/桌面应用/*.test.ts` → **86 pass / 0 fail**（基线 72，**+14**）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **595 pass / 0 fail**（基线 581 + 14）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增检查点全真**：
  - `BOOTSTRAP_ACTION_HIDDEN_WHEN_HAS_ROLES=true`（仓库根有角色的 su 会话是普通聊天 → **不显示**入口）；
  - 临时创世项目开 su → `FIN_ACTION_VISIBLE=true`、`FIN_ACTION_IS_PENDING=true`、`FIN_HINT_MENTIONS_UNSETTLED=true`、`FIN_BTN_PRESENT=true`；
  - 点「完成 bootstrap」（demo 未 settle）→ `FIN_DENIED_BLOCK_PRESENT=true`，`FIN_DENIED_REASON=会话尚未 settle（su 尚未完成任何一轮）——拒绝 finalize，避免 pin 到半成品`（**真实原因、如实呈现**）、`FIN_ACTION_STILL_VISIBLE=true`（被拒后入口保留）、`FIN_NO_ANS_WRITTEN=true`、`FIN_NO_MANIFEST_WRITTEN=true`（**被拒即零副作用**）。
  - 既有 `DEFAULT_SELECTED_ROLE=su`/`BOOTSTRAP_*`/`REFRESH_*`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*` **全过**；跑完**无残留 Electron 进程**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹**逐字节相同**（size=488、mtime 不变、SHA-256 `75aee37f…39655` 一致）。**未读 `.env`、未发真实网络请求、未打印凭据值。**

### 安全/边界（本任务核心关切）

- **不绕门**：finalize 的两笔写（`.ans/project.json`、`docs/bootstrap-manifest.md`）**同样经门禁 `resolveWrite`**（与 su 同一授权边界；被拒即整批中止、零副作用）——本层只**转调**编排的 `finalize()`，**未自写任何落盘/边界判定**，**无第二份实现**。e2e 的临时创世项目演示了「被拒即零副作用」。
- **落点纪律**：测试与 e2e 的 finalize **只落系统临时目录**（`mkdtemp`），**绝不写仓库**（e2e 断言 `FIN_NO_*_WRITTEN` 且仓库根无 `.ans`/`docs/bootstrap-manifest.md`）。
- **渲染侧无第二份判定**：入口可见性/就绪态**全部读主进程 `getBootstrapState()`**，渲染进程**不自行判定**（不读角色数据、不判 hasRoles）。

### 边界登记（不在本角色边界内）

- 编排的 `finalize` 能力（`RoleSessionHandle.finalize` / `genesisFinalize` 入参）与「显式触发」裁定归**编排 T36**，本角色**只读其公开面**（并从中派生 `FinalizeResult` 类型，不导入其私有 `common/编排/`）。
- 本层**不**在 finalize 成功后重取左树（`project:changed`）：finalize 写的是 `.ans`/manifest（治理证据），**不新增角色**——枚举的角色清单不变，故无需刷新（区别于 su 建角色触发的刷新）。

## 2026-10-11 — 更正：su 的「只读」标记曾为反——纳入 `hasRoles`，创世态不标只读

**更正条目**：su 的「只读」徽标与内联「本版只读」**此前判据是反的**。原判据 `builtIn===true && boundary.acceptance.accepted===false` 在**未 bootstrap 的项目**里已不准确——该场景下 su 经**创世边界**（`genesisBootstrap`，T30 接线）**确能写**治理产物（`角色卡/`、`docs/`、`.ans/`），界面却仍标「只读」，属**「文案说不能做、代码能做」**的误导（T30 已**如实回报**、当时未改；本条即该回报的落地）。

**来源**：本角色 T30 回报的「反向文案不一致」发现；依据设计 §12.2/T30（创世态 su 可写）与硬约束「渲染进程无第二份判定」。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 新判据（数据全来自门禁引擎）

`app/desktop/interface.ts::isReadOnlyRole(role, hasRoles)`：

```
builtIn === true && role.boundary?.acceptance?.accepted === false && hasRoles === true
```

- `builtIn` / `boundary.acceptance` / `hasRoles` **三项皆来自门禁引擎**（`listProject` 的枚举结果与角色数据）；本层只做**布尔派生**，**不重写任何边界/路径判定**。
- **为何必须结合 `hasRoles`**：未 bootstrap（`hasRoles === false`）时 `buildProjectConfig` 设 `genesisBootstrap`，内置治理角色经**创世边界**（普通目录种子）**能写**治理产物 ⇒ 此时标只读是**反的**；项目**一有角色**（`hasRoles === true`）即不再设该字段、su 回到**普通边界**、内置 acceptance 未接受 ⇒ 其写入被 `resolveWrite` 的 F6 拒 ⇒ **才标只读**。判据因此**如实反映**角色在当前项目里到底能不能写。
- `builtIn` 仍必须结合（`listProject` 对**所有**角色所列 acceptance 都是未接受/仅展示，单看 `accepted===false` 会把可写的项目角色误标）。

### 改动面（最小）

- **`app/desktop/interface.ts`**：`isReadOnlyRole` 增第二参 `hasRoles: boolean`；唯一调用点 `listProject` 传 `listing.hasRoles`。`RoleView.readOnly` 的**形状/类型/字段名不变**（仍是 `boolean`）；`RoleView` 未加字段。
- **渲染进程未改**：`app/renderer/renderer.js` 仍只读 `role.readOnly` 布尔（左树 `只读` 徽标 + 会话内联 `appendReadonlyNote`），**无第二份判定**——硬约束满足。
- **下游**：`RoleView` 无其他消费方（全仓 grep 仅 renderer 读 `readOnly`）；`isReadOnlyRole` 仅本文件调用 + 单测。

### 两种情况下标记的实际表现

| 情况 | `hasRoles` | `readOnly` | 界面 |
| --- | --- | --- | --- |
| **未 bootstrap（创世态）** | `false` | **`false`** | su **无**「只读」徽标、会话内**无**「本版只读」内联（此时它经创世边界能写治理产物） |
| **有角色（回到普通边界，内置未接受）** | `true` | **`true`** | su **有**「只读」徽标 + 会话内联「本版只读」 |
| 项目角色（非内置） | 任意 | `false` | 无只读（不受影响） |

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **72 pass / 0 fail**（基线 71，**净 +1**）：
  - `interface.test.ts::isReadOnlyRole` 增 `hasRoles` 维：内置+未接受+**有角色**→只读；内置+未接受+**未 bootstrap**→**不**只读；内置+已接受→不标；非内置→不标。
  - 改写既有「acceptance 未接受的内置角色带只读标记」用例为**有角色**态（`hasRoles:true`）；新增「**未 bootstrap（hasRoles:false）时内置 su 不带只读标记**」用例。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。语义随判据更新：
  - **有角色场景（仓库根）**：`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true SU_READONLY_ROWS=1`、`DESKTOP_ROLE_READONLY_BADGE=false`（**未改坏**）。
  - **空项目（创世态）新增**：`BOOTSTRAP_SU_READONLY_BADGE=false`（su **无**只读标记，T30 回报的误导已消除）。
  - **造出角色后新增**：`REFRESH_SU_READONLY_BADGE=true`（回到普通边界 → 转只读，与创世态相反；`REFRESH_NOTICE_CLEARED=true`）。
  - 既有 `DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`RUNTIME_NOTE_*`/`WRITE_MODE_*` **全过**；跑完**无残留 Electron**。
- **`npm run typecheck`**：本改动文件（`app/`、`test/桌面应用/`）**零错误**；**仅** `test/测试/t9-block1-bootstrap.test.ts` 报 `TS2353`（`GovernSessionInput.bootstrap` 未定义）——**边界外**（见下）。
- **全量** `node --test "test/**/*.test.ts"` → **556 pass / 2 fail**。2 处失败均在 **`test/测试/t9-block1-bootstrap.test.ts`**（"载入器应给出治理边界路径" 等）：该文件**只 import `src/`**、**不涉及** `app/` 或 `isReadOnlyRole`/`readOnly`，属**测试/编排角色并发**的 T9 在制品（其 `GovernSessionInput` 加了未定义字段）——**与本改动无关、在本角色边界之外，如实登记、未越界改**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 `75aee37f…39655` 一致）——e2e/测试**全程只碰系统临时目录**。**未读 `.env`、未发真实网络请求、未打印凭据值。**

## 2026-10-11 — T30：桌面接线创世——未 bootstrap 项目上 su 能写出角色

**来源**：设计 §12.2（核心裁决：把创世门口放在「边界选择」层）/ §12.7 T30、派发清单 T30。**依赖已就位**：门禁引擎 **T31** 已把治理种子边界（`角色卡/`、`docs/`、`.ans/`）**由条件目录改为普通 `directory`** 并**迁入门禁引擎**（`src/common/门禁引擎/governance-seed.ts`）——于是 `scope: undefined` 下它们**命中即放行**、`src/**` 仍拒。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 缺口（为何此前这条路跑不通）

核实（§12.1）：桌面开会话传 `scope: undefined`（`app/desktop/session.ts::openRoleSession`），而**创世可写条目全是条件目录**——条件目录须由 `scope.conditions` 显式声明 slug 才激活（`resolve-write.ts::isActive`），`scope` 缺失 ⇒ 条件目录**恒不激活** ⇒ **su 一个字也写不了**。界面那句「项目尚未 bootstrap：与 su 对话，让它创建角色」因此是**空头支票**。且 `app/desktop/project.ts::buildProjectConfig` **从未设 `genesisBootstrap`**（全仓无一处设置）。

### 改了什么（均在本角色边界内）

- **`app/desktop/project.ts`（接线落点）**：`buildProjectConfig` 在 `listing.hasRoles === false` 时**显式设** `ProjectConfig.genesisBootstrap = { source }`：
  - `source` **如实记录授权来源**、**用枚举给出的 `primaryRoleId`（不硬编码 "su"）**：
    `desktop-app:操作者导入空文件夹并开启 <primaryRoleId> 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`。
  - **切换条件（§12.2，双保险之一）**：项目**一有角色（`hasRoles === true`）就不再设**本字段——su 随即改由**项目边界**治理（`resolveBoundarySection` 的**项目覆盖**分支）。**另一重保险**是门禁引擎的**结构性自终止**：项目自己的治理边界文档一经写出并被接受（`governanceBoundary.path` 非空），**项目覆盖分支先于创世分支求值**，创世授权随之失效——**即便本字段残留也不再生效**（不依赖调用方清除它）。
  - **非 blanket**：条目仅 `角色卡/`、`docs/`、`.ans/` 三处治理产物（**不含 `src/`、不含项目内任意文件**），且**仅在 `!hasRoles` 时设**——「有界性」的实质在门禁引擎 `governance-seed.ts`，本层只负责**何时**设。
- **`app/desktop/session.ts`（注释）**：记录**会话路径裁决**与创世链路；**无代码行为改动**（`genesisBootstrap` 经 `buildProjectConfig` 流入，会话仍经 `openRoleSession` 以 `scope: undefined` 开启）。

### 会话路径裁决（**选一并说清理由**）：沿用 `openRoleSession`，**不**改走 `openGovernanceSession`

**裁决：沿用 `openRoleSession` + `scope: undefined`，仅加 `genesisBootstrap`。** 理由（§12.2）：

1. **`openGovernanceSession` 现无法表达 `scope: undefined`**：它仍在**内部**用 `buildGovernScope(boundary, roleIds)` 造 scope（且开会话前先经 `writeGovernanceSkeleton` 落骨架，属 **T32** 待退役面）。对空项目 `roleIds` 为空 ⇒ `writeSet: []` ⇒ `resolveWrite` 的 **F4 是精确集合匹配 ⇒ 拒一切写**——与 §12.2 明确要求的「`scope: undefined`」相悖。要让它表达 `scope: undefined`，须改它本身，而它属**编排**边界（`src/pipeline/orchestration/govern-session.ts`），**非本角色可动**。
2. **这不是「第二套会话机制」**：`openRoleSession` 恰是 `openGovernanceSession` **内部同样经其开启会话**的**同一底层会话入口**（`govern-session.ts:121` 调 `openRoleSession`）。本层沿用它与「两前端共享同一引擎」的规矩并不冲突——**同一入口**，本步只是把「未 bootstrap」这一授权事实经 `genesisBootstrap` 交给门禁引擎。
3. **创世门口放「边界选择」层最干净**（§12.2）：`resolveBoundarySection` 对**内置治理角色**在 `genesisBootstrap` 下返回种子边界；`scope` 保持 undefined ⇒ **无需 scope、无需 slug**。不用「创世 scope」——F4 的 `writeSet` 是精确集合，表达不了「`角色卡/<对话中才定的未来角色>/…`」，且空 `writeSet` 的既有语义正是「拒一切」。

### 界面文案核对（第 4 项）

`app/renderer/renderer.js` 的「**项目尚未 bootstrap：与 <主入口> 对话，让它创建角色。**」（`renderBootstrapNotice` / `loadProject` 提示）**现在为真**（T30 接线 + T31 种子边界后 su 在未 bootstrap 项目上确能写出治理产物）。

**另发现一处反向不一致（**回报**，未改）**：su 的「**只读**」左树徽标 + 会话内联「本版只读」（判据 `isReadOnlyRole = builtIn===true && boundary.acceptance.accepted===false`，`listProject` 所给 su 边界恒未接受）在**未 bootstrap 项目**下**已不准确**——该场景 su 经创世边界**确能写**治理产物，界面却仍标「只读」。这是**「文案说不能做、代码能做」**（与「空头承诺」方向相反），属 T30 影响面之外：改它要动 `RoleView.readOnly` 的派生面（须把 `hasRoles` 纳入判据）并牵动 e2e 既有 `SU_READONLY_*` 语义，故**如实回报、交协调方定，未擅自改**。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/genesis-bootstrap.test.ts`（6 例）**——用**系统临时目录**造假空项目，跑完清理、不在仓库留文件：
  - 未 bootstrap（`hasRoles:false`）→ `ProjectConfig` **带** `genesisBootstrap`，`source` 含 `desktop-app` 与 `primaryRoleId`；
  - 已 bootstrap（真实仓库根）→ **不带** `genesisBootstrap`（连键都不出现）；
  - **gate 直接判**（经**假适配器**从 `createAdapter(gate)` 捕获 su 会话的 **真实 gate**，不落盘、不调模型）：`角色卡/<新角色>/role-card.md`、`boundary.yaml`、`docs/design/x.md`、`.ans/project.json` → **allowed**；`src/evil.ts` 与项目根外绝对路径 → **denied**；
  - **反例**：已 bootstrap（有角色）时 su 的 gate **拒绝** `角色卡/<新角色>/role-card.md`（不再有创世授权，切换生效）。
- **单测** `node --test test/桌面应用/*.test.ts` → **71 pass / 0 fail**（基线 65 + 6）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **560 pass / 0 fail**（基线 554 + 6）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。既有检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`HANDBACK_*`、`MIRROR_*`、`PI_*`（`PI_TOKEN_MASKED`/`PI_PANEL_PATH_IS_TEMP`/`PI_ENV_NOT_REPO_ROOT`/…）；未 bootstrap 状态 `BOOTSTRAP_HAS_ROLES=false`、`BOOTSTRAP_NOTICE_TEXT=项目尚未 bootstrap：与 su 对话，让它创建角色。`、`BOOTSTRAP_NOTICE_IS_ERROR_STYLE=false`；造角色 + `project:changed` → `REFRESH_TREE_HAS_EXAMPLE=true`/`REFRESH_NOTICE_CLEARED=true`。**无 WATCHDOG_TIMEOUT / E2E_ERROR**，跑完**无残留 Electron 进程**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 一致）——e2e/测试**全程只碰系统临时目录**（Pi 面板经注入的临时 `.env`）。**未读 `.env`、未发真实网络请求、未打印凭据值。**

### 边界登记（不在本角色边界内的相邻事项）

- **`openGovernanceSession` 的 shape 收敛（T32）**：本步**未动**编排的治理会话入口。若后续客户/协调方希望桌面 su **统一**经 `openGovernanceSession`（T30 文本的理想形态），需 **T32** 先把它改为**不预建骨架**且**接受 `scope: undefined`**（或按边界条件目录给最小 scope），届时本层可改走它——**当前它做不到，故本层沿用 `openRoleSession`**。

## 2026-10-11 — T28：Pi 配置面板 + 启动载入/保存 `.env`（补 Electron 缺失的 `--env-file`）

**来源**：pm 设计 §11（客户 2026-10-11「为啥不能通过页面设置呢」→ 选定「页面设置 → 保存到 `.env`」）、派发清单 T28。**依赖已就位**：pm（T26）建共享 `.env` 读写模块 `src/common/shared/env-file.ts`（属主 pm，消费方**只读导入、不得复制第二份**）。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 前提（为什么这块是「让桌面 pi 路径可用」的前提，不只是「好用」）

桌面 pi 路径此前**根本不可达**：① `package.json` 的 `"app": "electron app/main.ts"` **无 `--env-file`** ⇒ Electron 进程 `process.env` 里**没有** `ANS_PI_*`/token；② 桌面**没有通道**把 Pi 配置交给适配器（且设计已裁定**不扩** `createPiAdapterFactory` 签名，见 §11.3）。本任务用**载入 `.env` 到 `process.env`** 补上缺失的 `--env-file`，此后 `resolvePiProviderConfig(opts, process.env)` **原样复用**——**单一来源，无第二份读取逻辑**。

### 改了什么

- **新增 `app/desktop/pi-config.ts`**（纯逻辑，不依赖 electron）：面板 5 键常量 `PI_PANEL_KEYS`（`ANTHROPIC_AUTH_TOKEN` 机密 + `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_PROVIDER`/`ANS_PI_CONTEXT_WINDOW`）、默认路径 `resolveRepoEnvPath()`（= 仓库根 `.env`，与 CLI `--env-file=.env` 同一文件）、`getPiConfig`（**掩码**：机密键恒返空 `value`、只给 `isSet`）、`savePiConfig`（**只改面板键**、原子写、**保存后重载**）、`loadPiEnv`（包装 `loadEnvFileInto`）、`missingPiKeys`。**只读导入**共享模块——**未重写 `.env` 解析/合并/原子写**。
- **`app/main.ts`**：启动 `app.whenReady()` 时先 `await loadEnvFileInto(process.env, resolveRepoEnvPath())`（**补 `--env-file`**，只回报键名、绝不打印值）；新增 IPC `pi-config:get` / `pi-config:save`（透传 Interface）。
- **`app/desktop/interface.ts`**：`DesktopInterface` 增 `getPiConfig`/`savePiConfig`；`DesktopDeps` 增**可注入** `envFilePath`（缺省仓库根）与 `piConfigEnv`。**测试/e2e 必须注入临时路径**。
- **`app/preload.cjs`**：暴露 `getPiConfig`/`savePiConfig`（白名单通道，不暴露任何 Node 能力）。
- **`app/renderer/{index.html,renderer.js,styles.css}`**：输入区运行时选择器旁新增「**Pi 设置**」按钮 + 可收起面板 `#pi-panel`（与 demo/pi 选择器并列；**选 pi 时自动展开** = 补救入口）。5 字段 + token（`type=password` 掩码、可显式「显示」）+ 保存按钮 + 状态行；缺项时明确告警「选 pi 开会话会被拒（fail-closed）」。渲染侧**不作任何判定**——读写/掩码全经主进程单一来源。
- **测试**：新增 `test/桌面应用/pi-config.test.ts`（10 例）+ `renderer.test.ts` 增 1 例源码不变式守卫；`test/桌面应用/e2e/main.mjs` 增面板检查点（经**注入的临时 `.env`**，**不碰仓库根真实 `.env`**）。

### 写入纪律与凭据纪律（设计 §11.4 客户红线，逐条落地）

- **只改相关键**：保存经 `saveEnvFile`/`mergeEnvText` **逐行**、只替换命中键，注释/空行/未知键/顺序**逐字节保留**；非面板键被过滤（**绝不越界写任意键**）；未设置又留空的非机密键**跳过**（不凭空造空键）；**留空的 token 不提交**（保留已设置值）。
- **token 不回显**：`getPiConfig` 对机密键**恒返空 value**、只给 `isSet`；界面**默认掩码**、**绝不预填**；保存/读取回报**只含键名**；错误文本经共享模块 redact，本模块再对入参值**兜底 redact**——**哨兵 token 断言**证明其不出现在任何视图/回报/错误里。
- **原子写 + 失败显式**：由共享模块保证（同目录 temp+`rename`；失败抛错）；**保存后重载** `process.env`，**下一会话即用新值**。

### 证据

- `node --test test/桌面应用/*.test.ts` → **65 pass / 0 fail**（+11：`pi-config.test.ts` 10 + `renderer.test.ts` 1）。
- `npm run typecheck` → **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **533 pass / 0 fail**（基线 522 + 11）。
- e2e（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`；既有检查点 `DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*` **全过**；新增 `PI_PANEL_OPEN=true`/`PI_FIELD_COUNT=5`/`PI_TOKEN_MASKED=true`/`PI_PANEL_PATH_IS_TEMP=true`/`PI_TEMP_ENV_*`/`PI_TOKEN_STILL_MASKED=true`/`PI_TOKEN_VALUE_CLEARED=true`/`PI_TOKEN_PLACEHOLDER_SET=true` 全真；跑完**无残留 Electron**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 一致）——e2e/测试**全程只碰系统临时目录**下的假 `.env`。

## 2026-10-11 — T23（桌面侧）：`normalizeArgv` 收归共享单一来源（`app/desktop/operator-channel.ts`）

**来源**：pm 设计 §3.11 行 7（全仓**最后一处**跨角色镜像）、派发清单 T23。**依赖已就位**：pm（T23）把 argv 规范化原语**整体搬迁**（搬迁，非 fork）到共享单一来源 **`src/common/shared/argv-primitives.ts`**（属主 pm，消费方**只读导入、不得复制第二份**）。**属本角色边界内**（`app/`）。

### 改了什么（**行为逐字不变**）

- **`app/desktop/operator-channel.ts`**：
  - **删**本地函数 `normalizeArgv`（及其 doc 注释）——原体为
    ```ts
    function normalizeArgv(argv: unknown): string[] {
      if (!Array.isArray(argv)) return [];
      return argv.filter((x): x is string => typeof x === "string");
    }
    ```
  - **改**从 **`src/common/shared/argv-primitives.ts`**（pm 属主，**只读导入**）取 `normalizeArgv`：`import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";`。
  - **调用点零改**：`describeShellCommand` 内 `const argv = normalizeArgv(prompt.argv);` **原样不动**——**只改来源，未改编调用形状**。

### 为何值得做（同源即审计与所见不可漂移）

`normalizeArgv` 在**编排侧**用于把规范化后的 argv **写进审计记录**（`docs/audit/shell-gate.jsonl` 的 `argv` 字段），在**桌面侧**用于**展示给操作者**（`describeShellCommand` 的逐项 argv 行）。二者此前各自维护、必须逐字同源——否则「**落进审计的 argv**」与「**操作者所见到的 argv**」可能漂移，而审计的意义正是「**审的什么原文**」可查。收敛为单一来源后，两边**同一函数**，漂移在结构上不可能。

### 行为逐字不变怎么确认

- **函数体逐字相同**：共享版与本地副本**字节级完全相同**（pm 已比对），差异**仅**多一个 `export` 关键字；语义（非数组→`[]`；只留 `typeof === "string"` 项；不去重/不裁剪空白/不转义；保序；恒返回值、绝不抛错）**逐字一致**。
- **调用点零改**：`describeShellCommand` 的调用是**唯一**消费点，未动。
- **无第二份判定**：本次为**纯词法原语**的搬家，**不含**任何命令分类/白名单/规则逻辑——硬约束（不得有第二份判定实现）不受影响。

### 顺带自查：本模块是否还有别的共享模块逐字副本

**已无。** `app/desktop/operator-channel.ts` 现持全部「跨角色共享物」（operator 三型 ← `src/provider/pi/session.ts`；`normalizeArgv` ← `src/common/shared/argv-primitives.ts`）皆**只读导入**，无逐字副本；本模块其余函数（`argvLine`/`renderConfirmText`/`withConfirmTimeout`/`readConfirmTimeoutMs`/`reasonOf` 等）均为本模块独有，共享层无对应物。

### 与前次登记的衔接

上轮 **T22（补）** 曾如实登记：`operator-channel.ts` 的 `normalizeArgv` 虽与编排私有 `src/common/编排/shell-gate.ts` 的同名函数**同形**，但那是**别角色私有 `common/`**（工程法案 §6 禁跨角色导入）、**非 `src/common/shared/` 共享模块**，故当时**不属收敛面、未动**。本轮 pm 已把它**整体搬迁**到 `common/shared/`——收敛面成立，本角色随之**删本地副本、改只读导入**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **460 pass / 0 fail**（与基线 460 一致）。
- 未读 `.env`、未发真实网络请求、未打印凭据值。

## 2026-10-11 — T22（补）：收掉最后一处路径镜像 `toPosix`（`app/desktop/project.ts`）

**来源**：pm 设计 §3.11 行 5 / 派发清单 T22——其文本**明列** `app/desktop/project.ts` 的 `toPosix` 应在收敛之列，但上一轮 T22 的三项清单（operator 三型 / `resolveSkillRoot` / `RuntimeKind`）**漏列**了它，当时如实回报、未动；本轮补齐。依赖 pm T23（单一来源 `src/common/shared/path-primitives.ts` 已就位）。**属本角色边界内**（`app/`）。

### 改了什么（**行为逐字不变**）

- **`app/desktop/project.ts`**：**删**本地逐字 `toPosix`——原体为
  ```ts
  export function toPosix(p: string): string {
    return p.replace(/\\/g, "/");
  }
  ```
  **改**从 **`src/common/shared/path-primitives.ts`**（pm 属主，**只读导入**）取 `toPosix`，并 `export { toPosix }` **原样转出**——**单一来源，不是第二份**。公开面 `toPosix` 不变；本模块内 `posixDirname` 的调用点不变（仍调 `toPosix`）。

### 为何是「转出」而非纯内部导入

`toPosix` 原为 `project.ts` 的 `export`。为**逐字保住公开面**（不缩小本模块 API），照 T22 对 `resolveSkillRoot` 的同一处置：**只读导入 + 原样转出**（`export { toPosix }`），指向共享实现——**同一函数，非副本**。全仓 grep 复核：无外部消费方从 `project.ts` 取 `toPosix`；`api-spec.md` 的「对外导出」亦未列它——转出为**保守**保留、零风险。

### 顺带自查：`app/desktop/` 下是否还有别的共享模块逐字副本

**已清干净——`app/desktop/` 其余四处无 `src/common/shared/` 的逐字副本**：
- `session.ts`：`RuntimeKind` 上轮（T22）已改从 `runtime-shared.ts` 只读导入 + 转出；`.ans` 载入链（`loadEffectiveConfig` 及 `LoadConfigOptions`/`LoadedConfig`/`ConfigSourceKind`）只读导入，**无终态规则/加载器的第二份**。
- `project.ts`：`resolveSkillRoot` 上轮已转出；本轮 `toPosix` 转出后，**无遗留**。
- `operator-channel.ts`：契约三型（`OperatorPrompt`/`OperatorOutcome`/`OperatorChannelFn`）已只读导入 + 转出。
- `chat-adapter.ts`：无共享模块对应物。

**如实列出、未动（不属于「共享模块副本」）**：`operator-channel.ts` 的 `normalizeArgv` 与编排私有 `src/common/编排/shell-gate.ts` 的同名函数**同形**，但那是**别角色的私有 `common/`**（工程法案 §6 禁跨角色导入），**非 `src/common/shared/` 共享模块**——本角色已按「本角色自持、不跨角色导入他人私有 `common/`」登记其取舍，不在本次（`common/shared/` 收敛）范围内。`posixDirname` 为本模块独有，共享层无对应物，非副本。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail**（与基线一致）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`；关键检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`SU_*`、`WRITE_MODE_*`、`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`、`HANDBACK_*`、`MIRROR_*`、`NO_MODAL_*`。跑完无残留 Electron 进程。

## 2026-10-11 — T22：三处「逐字镜像」改为只读导入（operator 三型 / `resolveSkillRoot` / `RuntimeKind`）

**来源**：设计 §3.11（全仓盘点 §6 逼出的跨角色镜像并裁决收敛）、派发清单 T22。**依赖已就位**：Pi适配器 T20 把 operator 三型置入 §4 冻结契约家 `src/provider/pi/session.ts`；pm T23 建 `src/common/shared/runtime-shared.ts`（含 `resolveSkillRoot`/`RuntimeKind`）。**§6 的跨角色私有不导入**约束因此解除——镜像可删、改只读导入（**同一契约只许一个形状**）。

### 改了什么（均在本角色边界内；**行为逐字不变**）

- **`app/desktop/operator-channel.ts`**：
  - **删**本地逐字镜像 `export interface OperatorPrompt`、`export type OperatorOutcome`；**改**从 `src/provider/pi/session.ts` **只读导入**、**原样转出**（`import type { OperatorPrompt, OperatorOutcome, OperatorChannelFn } from ...; export type { ... };`）。`import type` 纯类型、被擦除 ⇒ 本模块仍**不静态依赖 electron / Pi 包**。公开面保留原名——既有消费方（`app/main.ts`）与测试从本模块取这两型仍可用。
  - **删**本地同名第二形状 `export type OperatorChannel = (prompt) => Promise<OperatorOutcome>`；`createDesktopOperatorChannel` 的**返回类型改为推断**（= `(prompt: OperatorPrompt) => Promise<OperatorOutcome>`，确定型）。`OperatorChannel` 无任何外部消费方（全仓 grep 复核）。
- **`app/desktop/project.ts`**：**删**本地逐字 `resolveSkillRoot(env = process.env)`（连同**只服务它**的 `import os from "node:os"`）；**改**从 `src/common/shared/runtime-shared.ts` **只读导入**并 `export { resolveSkillRoot }`（公开面不变）。`buildProjectConfig` 内 `resolveSkillRoot(env)` 调用点不变。
- **`app/desktop/session.ts`**：**删**本地 `export type RuntimeKind = "demo" | "pi"`；**改**从 `src/common/shared/runtime-shared.ts` **只读导入**并 `export type { RuntimeKind }`（公开面不变）。`SessionOpenRequest.runtime` 等用法不变。

### ⚠ 形状对不上（**回报**，未自调和）

- **第三型（通道）不是逐字镜像**：冻结家 `OperatorChannelFn = (prompt) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined`——**允许返回空**；而本模块**产出**的通道**恒返回确定的 `OperatorOutcome`**（所有分支皆 return，绝不返回 `null`/`undefined`）。二者是**子类型**关系（本产出窄于、且可赋入 `OperatorChannelFn`），**非逐字同形**。
- **处置**：**不把本模块的产出形状改宽为 `OperatorChannelFn`**——那会削弱本角色 API（消费方被迫处理不可能出现的空），且**非「行为逐字不变」**。故 `createDesktopOperatorChannel` 返回**推断的确定型**，契约的**唯一命名形状**仍是冻结家的 `OperatorChannelFn`（本模块只读导入、原样转出，**不自造第二形状**）。**如实回报**，未越界改（`src/provider/pi/session.ts` 属 Pi适配器）。
- **另注（回报，待裁定）**：`app/desktop/project.ts` **仍持一份逐字镜像 `toPosix`**（= `src/common/shared/path-primitives.ts` 的 `toPosix`）——pm 设计 §3.11 行 5 与派发清单 T22 文本**列有它**，但**本次 T22 三项清单未含**，**故未动、如实回报**（若纳入，处置同 `resolveSkillRoot`：删本地、改只读导入并原样转出，`posixDirname` 调用点不变）。

### 行为逐字不变怎么确认

- **形状**：`OperatorPrompt`/`OperatorOutcome` 与 `src/provider/pi/session.ts` 的定义**逐字同形**（字段、可选性、判别联合成员逐一相同）；`RuntimeKind`/`resolveSkillRoot` 与 `runtime-shared.ts` **逐字同源**（pm 测试「与桌面旧副本同值」仍钉死，且现为**同一函数**）。
- **调用点零改**：`describeShellCommand` / `OperatorPresenter.present` / `createDesktopOperatorChannel` / `buildProjectConfig` / `SessionOpenRequest` 的签名与调用**未动**；只改「类型/函数的来源」。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**（`test/桌面应用/operator-channel.test.ts` 的 `OperatorPrompt` 导入源一并改为 `src/provider/pi/session.ts`；断言不变）。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**（含 `app/`、`test/桌面应用/`；本轮**连编排 `test/编排/shell-review-chain.test.ts` 的旧报错也已被编排修掉**）。
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail（全绿）**。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`；关键检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`HANDBACK_CARD_PRESENT=true`/`HANDBACK_TITLE=回交 su`、`MIRROR_CARD_PRESENT=true`/`MIRROR_HAS_FROM=true`/`MIRROR_STATUS_BLOCKED=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`，既有 `SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*`/`BOOTSTRAP_*`/`REFRESH_*` 亦全过。跑完无残留 Electron 进程（**未真开 pi 会话**）。

## 2026-10-11 — T20：`emitEvent` 类型放宽到编排事件 + 接上「回交 su」呈现/镜像（§10.8）

**来源**：设计 §10.8（角色完成后把结果交回 su——回交卡片 + 镜像进 su）；派发清单 T17/T20。**补齐 T17 标注「依赖 T16 的 `handback` 事件、本轮未做」的那一件**：编排 T16 已给会话事件流加 `handback` 事件、并把 `RoleSessionHandle.events()` 改为 `AsyncIterable<OrchestrationEvent>`——本步把桌面链路的类型对齐并接上呈现。

### 类型从哪导入、放宽了哪些处

- **类型来源**：`OrchestrationEvent` 从**编排的模块只读导入**——`src/common/编排/handback.ts`（也是 `src/pipeline/orchestration/run-role.ts` 导入它的位置）。**未复制形状、未另立第二份**。
- **放宽处（入参类型 `SessionEvent` → `OrchestrationEvent`）**：
  - `app/desktop/session.ts`：`SessionManagerDeps.emitEvent`。
  - `app/desktop/interface.ts`：`DesktopDeps.emitEvent` + 内部 `emitSessionEvent(ev)` 形参（`settled` 触发 `project:changed` 的判据不变，`handback` 不触发刷新）。
  - `app/main.ts`：IPC 外推 `emitEvent`（原 `unknown` → `OrchestrationEvent`，原样透传、不加工）。
- **改动的必要性**：`openRoleSession` 的 `events()` 现产 `OrchestrationEvent`（`SessionEvent` ⊇ 收窄、加新 `handback`），而 `deps.emitEvent` 原收 `SessionEvent`——**两端类型不再匹配**（`node --test` 靠类型擦除不报，`tsc` 会抓）。放宽后两端一致。`app/preload.cjs` 无类型，未改。

### 「回交 su」呈现怎么做的；镜像进 su 的条件

- **呈现**（`app/renderer/renderer.js`）：`appendEvent` 增 `kind === "handback"` 分支 → `appendHandback(ev.handback)`；新增 `handbackTarget` + `ICONS.handback`（内联 SVG 回箭头）。卡片结构：图标 + 标题 + 结论徽标（`hb-ok` 已完成 / `hb-blocked` 被拦下）+ 「角色/任务」元行 + 摘要 + 证据列表（`hb-ev`，只搬产物证据；无证据时「（无被接受的写入证据）」）。**只呈现事件携带的数据，不作任何判定**（是否完成/被拦由编排给）。
- **归属判据 `handbackTarget`**（纯呈现层）：当前打开会话是**产出该回交的角色** → 自己的聊天里显示「**回交 su**」卡片；当前打开会话是**主入口角色**（`state.primaryRoleId`，**不硬编码 "su"**）→ **镜像进 su 的聊天流**，标题「**来自 <role> 的报告**」、卡片带 `is-mirror`（虚线边框区分）。二者皆非 → 该回交不属当前流，跳过。
- **样式**（`app/renderer/styles.css`）：新增 `.msg-handback` 系列（左缘主色、卡片式；`.is-mirror` 虚线边框）——纯 CSS、无外部依赖、无 emoji、无渐变，与既有设计语言一致。

### 其余类型不匹配处（回报）

- **本角色边界内（已随之修正）**：`test/桌面应用/session.test.ts`、`test/桌面应用/ans-wiring.test.ts` 的 `emitEvent` 收集器原把编排事件推进 `SessionEvent[]`——`emitEvent` 放宽后入参为 `OrchestrationEvent`，推进 `SessionEvent[]` 会 `tsc` 报错。已把这两处的收集器/参数类型改为 `OrchestrationEvent[]`（断言不放松）。
- **边界外（未越界改，如实登记）**：`tsc --noEmit` 下 `test/编排/shell-review-chain.test.ts` 有 **4 处**报错（418/421/424 行 `TS18049 'empty'/'weird'/'eof' is possibly null or undefined`；487 行 `TS2769` 重载不匹配）——**属编排角色**，与本改动无关（本改动不触及该文件），**回报、不越界改**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**（+3：`session.test.ts` +1「handback 事件被外推」、`interface.test.ts` +1「Interface 的 emitEvent 外推 handback」、`renderer.test.ts` +1「回交卡片/镜像源不变式」）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。新增检查点全真：
  - 自己的聊天：「回交 su」——`HANDBACK_CARD_PRESENT=true`、`HANDBACK_TITLE=回交 su`、`HANDBACK_NOT_MIRROR=true`、`HANDBACK_STATUS_OK=true`、`HANDBACK_EVIDENCE_ROWS=1`；
  - su 会话开着（切到 `primaryRoleId`）→ 镜像——`MIRROR_CARD_PRESENT=true`、`MIRROR_CARD_TITLE=来自 桌面应用 的报告`、`MIRROR_HAS_FROM=true`、`MIRROR_STATUS_BLOCKED=true`、`MIRROR_EVIDENCE_EMPTY=true`。
  - 既有检查点**全过**：`DEFAULT_SELECTED_ROLE=su`、`SESSION_NOT_AUTO_OPENED=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`SU_*`、`WRITE_MODE_*`、`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`。跑完无残留 Electron 进程。（**未真开 pi 会话**；回交经直接推 `session:event` 驱动渲染侧。）
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail**（**已无 T17 所述的 1 处 `test/测试/real-entry.test.ts` init 失败**——`ans init` 断言已被作废/移除；本文件属别角色，本角色未动）。
- **类型门禁** `tsc --noEmit`（装配已装 TypeScript 7.0.2）：`app/` 与 `test/桌面应用/` **零错误**；仅 `test/编排/shell-review-chain.test.ts` 的 4 处报错（边界外，见上）。

## 2026-10-11 — T17：su 置顶为主入口/默认选中 + 未-bootstrap 状态 + 左树刷新（含 T19 复核）

**来源**：设计 §10.3（未-bootstrap 状态与左树刷新）/§10.7（su 为主入口、其他角色次级；`primaryRoleId`）/§10.8（回交，本轮不涉）；派发清单 T17。门禁引擎 **T14** 已给 `listProject` 加 `hasRoles` 与 `primaryRoleId`。

### 改了什么（均在本角色边界内）

- **`app/desktop/interface.ts`**：
  - `ListProjectResult` 增 **`hasRoles` 与 `primaryRoleId`**——**原样转自门禁引擎 `listProject`**（`app:list-project` 的返回随之带出；**本层不重判**，单一来源仍是门禁引擎）。
  - `DesktopDeps` 增可选 **`emitProjectChanged?`**；`createDesktopInterface` 以 `emitSessionEvent` 包装会话事件外推：**当事件是 `settled`（会话一轮结束的终止信号；真实 Pi 适配器 `agent_settled` 即发此）且当前打开的是主入口角色时**触发该信号。判据用 `manager.openForRoleId()` 对照枚举缓存的 `primaryRoleId`，**不硬编码 "su"**。
- **`app/main.ts`**：把 `emitProjectChanged` 接到 `win.webContents.send("project:changed")`（**IPC 形状：主进程 → 渲染进程，单参无载荷的 `project:changed` 事件**）。
- **`app/preload.cjs`**：暴露 `onProjectChanged(cb)`（订阅 `project:changed`，返回退订函数）。
- **`app/renderer/renderer.js`**：
  - `state` 增 `primaryRoleId` / `hasRoles`（皆取门禁引擎字段）。
  - `loadProject` 重构为 `loadProject` + **`applyListing(res, fresh)`**：**导入后默认选中并高亮主入口角色**（`state.selectedRoleId = state.primaryRoleId`）——但**不自动开会话**；`fresh=false`（刷新）保留当前选择/会话，仅在所选角色已不存在时回退主入口。
  - `renderRoleTree` 改为分组：**主入口角色置顶为「主入口」分组**，其余归「**其他角色（查看/调试）**」——次级角色**保留、可点、可聊**。
  - 新增 **`renderBootstrapNotice`**：`hasRoles===false` 时显示「**项目尚未 bootstrap：与 <主入口> 对话，让它创建角色。**」（**非报错**）。
  - `clearChat`：空聊天区给**「开始与 <主入口> 对话」主 CTA**（点它才开会话）。
  - 新增 **`refreshProject`**，并 `d.onProjectChanged(refreshProject)` 订阅——**su 一轮结束 → 重取枚举 → 左树随之长出**。
  - `updateControls`：发送/结束仅在**会话已开启**时可用（默认选中 ≠ 已开会话）。
- **`app/renderer/index.html`**：加 `#bootstrap-notice` 元素。
- **`app/renderer/styles.css`**：加 `.bootstrap-notice` / `.tree-group` / `.ti-badge.primary` / `.btn-start`。

### 硬约束

**渲染侧无第二份判定**：主入口一律读 `primaryRoleId`、未-bootstrap 一律读 `hasRoles`（**渲染进程不硬编码 "su"、不自行派生**）；刷新只是「重取枚举」的转达，**不判定**写入是否发生（判定唯一来自门禁引擎）。

### 类型字段补齐（防类型检查器报错）

门禁引擎 T14 给 `ProjectListing` 加了 `hasRoles`/`primaryRoleId`，本角色**所有构造该类型的字面量**已补齐：`test/桌面应用/interface.test.ts`（`FAKE_LISTING` + 3 处内联；`listingB` 经 spread 继承）、`test/桌面应用/operator-channel.test.ts`（`FAKE_LISTING`）、`test/桌面应用/session.test.ts`（切换角色用例的内联）。全仓 grep 复核无其它构造点（`buildProjectConfig`/`resolve-role` 等只读消费、不构造）。

### 回交（§10.8）——**本轮未做，如实登记**

§10.8 的「角色完成 → 回交卡片 + 镜像进 su」依赖**编排 T16 的 `handback` 事件**（类型与「settle → handback」归编排）。该事件**尚未落盘**，且本轮 T17 范围（§10.7 主位/未-bootstrap/刷新）不含回交呈现——故**未实现**，待 T16 产出 `handback` 后并入。**不越界造事件、不假装已在用。**

### 已知边界（登记）

- **刷新回路在真实 pi 运行时才自触发**：触发点是 `settled` 事件；demo 聊天适配器（`app/desktop/chat-adapter.ts`）每轮以 `message` 收尾、**不发 `settled`**，故 demo 路径不自动刷新（e2e 直接推 `project:changed` 驱动）。真实 pi 适配器 `agent_settled` 即发 `settled`（`src/common/pi-adapter/real-adapter.ts`），**主路径自触发**。
- **su 建角色此前受 T15/T16 阻塞**：V1 下 su 走内置边界、`acceptance.accepted===false`（本版只读），其写入被门禁 F6 拒；**冷启动创世边界（T15）与 su 治理写路径（T16）落盘后**，su 才能在空项目真正建出角色。本轮交付的是**机制**（settle → `project:changed` → 重取 → 左树长出）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **51 pass / 0 fail**（+5：`interface.test.ts` +2（`hasRoles`/`primaryRoleId` 透传；主入口 `settled` 触发 `emitProjectChanged`、非主入口不触发）；`renderer.test.ts` +3（primaryRoleId 驱动默认选中且不硬编码 "su"；未-bootstrap 据 `hasRoles`；刷新通道两端齐备））。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。新增检查点全真：`PRIMARY_ROLE_ID=su`、`DEFAULT_SELECTED_ROLE=su`、`SU_DEFAULT_ACTIVE=true SU_PRIMARY_BADGE=true SU_IN_MAIN_GROUP=true`、`HAS_OTHER_GROUP=true`、`CHAT_CTA_PRESENT=true CHAT_CTA_TEXT=开始与 su 对话`、`SESSION_NOT_AUTO_OPENED=true`；临时空项目 `BOOTSTRAP_HAS_ROLES=false` + `BOOTSTRAP_NOTICE_SHOWN=true`（文案「项目尚未 bootstrap：与 su 对话，让它创建角色。」、`IS_ERROR_STYLE=false`）；造角色后推 `project:changed` → `REFRESH_HAS_ROLES=true REFRESH_ROLE_COUNT=2 REFRESH_TREE_HAS_EXAMPLE=true REFRESH_OTHER_GROUP_SHOWN=true REFRESH_NOTICE_CLEARED=true`。既有 `SU_*`/`NO_MODAL_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*` **全过**。跑完无残留 Electron。
- **全量** `node --test "test/**/*.test.ts"` → **445 pass / 1 fail**（+ 本角色 51 全绿）。**唯一 1 处失败在 `test/测试/real-entry.test.ts`**（`真实入口:ans init <临时目录> 以 0 结束并生成骨架`），**根因在编排角色**：`src/interface/cli/init.ts` 已被**删除**（§10.4 废 `ans init`，归 T16），而该 init 断言属**测试角色**、待 **T18** 作废（§10.4）——**属别角色并发工作、在本角色边界之外，如实登记、未越界修**。（本轮全量总数**波动中**：429→446，因多角色并发增删测试；本文件记录的是本角色跑测时的读数。）

### T19 复核（客户已确认：V1 不 arm）

**复核 `角色卡/桌面应用/changelog.md`**：**无遗留的「待客户拍板」**——措辞已是「**客户已确认：V1 不 arm**」，并注明操作者确认对话框通道**已建但未被消费**（是 V1 范围、非欠账）。`memo.md` / `api-spec.md` / `functional-description.md` / `role-card.md` 亦无该措辞。**核对无遗漏，无需改动。**

## 2026-10-11 — T8b 契约对齐：操作者通道 (a) 对齐编排定形的形状（含 T19：V1 不 arm 客户已确认）

**来源**：编排 T8b 把 (a) 注入点形状**定死**于 `src/common/编排/shell-gate.ts` 与 `src/common/编排/operator-channel.ts`（**只读**）；本角色据此**对齐**。附 **T19**（changelog 措辞：客户已确认 V1 不 arm）。设计 §7.3/§7.4/§7.5/§7.6。

### 背景：T8b 先前的形状是**假设**，现按编排定形对齐

T8b 时 **编排尚未定出 (a) 的接口**，本角色按 §7.4 描述**自拟了一个可对接的形状**并在回报与 changelog 中**如实标注为「假设」**：收 `ShellReviewRequest`、返回整条 `ShellReviewResult`（类型取自 §4 冻结 `src/provider/pi/session.ts`）。**现编排已定形**，本步把 `app/desktop/operator-channel.ts` 对齐到**编排定义的契约**。

### 契约（进出形状）

- **入参 `OperatorPrompt`** = `{ command; argv; cwd; toolCallId; reason? }`——比先前假设**多一个可选 `reason?`**（= (b) pm 拿不准/不可用的原话，**为何升级到人**）。
- **返回 `OperatorOutcome`** = `{outcome:"allow";operatorId?} | {outcome:"deny";operatorId?;reason?} | {outcome:"unavailable";reason?}`——**不再返回整条 `ShellReviewResult`**。
- **仅 `outcome:"allow"` 放行**；`deny`/`unavailable`/非布尔/超时/抛错**一律非放行**（由编排落判）。
- 呈现逻辑**复用**：`describeShellCommand` 仍把**逐字命令原文**（不截断）+ **逐项 argv（JSON 转义）** + **cwd** 如实摆给人看；新增 `reason` 段。

### §6 取舍（**回报**，未越界）

编排把 `OperatorChannelFn`/`OperatorPrompt`/`OperatorOutcome` 放在**其私有 `common/编排/`**；工程法案 **§6 明令「不得导入其他角色的私有 `common/`」**。故本角色**不导入编排文件**，而是把两型**逐字镜像**于本模块（**同一形状、不造第三形状**）。**代价**：有**漂移风险**（编排改形状须同步）。**建议**：编排/pm 把这三型挪到 **§4 冻结契约 home `src/provider/pi/session.ts`**（编排自身已把 `ShellGate`/`ShellReviewRequest`/`ShellReviewResult` 放那里、并按同一形状引用），届时本模块改为**只读导入**、彻底消除漂移。**本角色不越界改他人文件。**

### 拆除冗余的「第二份映射」（审计归编排）

删除先前导出的 `operatorAudit()`、`BRANCH_A_*` 常量与 `OPERATOR_BY_PREFIX`。**审计 `by`/`branch` 归编排**：编排的 `createShellGate` 由 `OperatorOutcome.operatorId` 得 `by = operator:<id>`（缺标识 → `operator:未知操作者`），并由其**自身的** `BRANCH_A_*` 分支常量与升级链得 `branch`，写入 `docs/audit/shell-gate.jsonl`。编排已明定「**通道无需自造 `by`/`branch`**」——保留桌面这份即为**与编排重复的第二份映射**（违背硬约束），故**移除**。

### fail-closed 三条怎么钉死（§7.5）

| 情形 | 本通道返回 | 编排侧落点 |
| --- | --- | --- |
| 人点**拒绝** / 关对话框 / 返回非 `allow:true` | `{outcome:"deny", operatorId, reason}` | **拒绝** |
| 确认**超时**（>timeout，默认 120000ms，`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` 可覆盖） | `{outcome:"unavailable", reason:"…超时…"}` | **拒绝** |
| 通道**不可用**（未配置 presenter / presenter 抛错） | `{outcome:"unavailable", reason:"…"}` | **拒绝** |

**绝不默认放行**：仅当操作者**明确放行**才返回 `{outcome:"allow"}`。

### 改了什么（均在本角色边界内）

- **`app/desktop/operator-channel.ts`**：入参改 `OperatorPrompt`、返回值改 `OperatorOutcome`；`describeShellCommand(prompt)` 增 `reason` 段；`OperatorPresenter.present(prompt, display)`；移除 `operatorAudit`/`BRANCH_A_*`/`OPERATOR_BY_PREFIX`；`ShellReviewRequest`/`ShellReviewResult` 导入移除。
- **`app/main.ts`**：Electron `dialog` 表现层签名随 `prompt` 命名调整 + 注释点明「形状以编排 `OperatorChannelFn` 为准」。**仍刻意不构造、不注入**（`if (DESKTOP_SHELL_GATE_ARMED)` 恒不执行）。
- **`test/桌面应用/operator-channel.test.ts`**：改到新形状；删 `operatorAudit` 用例；新增「仅 `allow` 放行」与「`reason` 有值时被展示」用例；**fail-closed 三条（拒绝/超时/不可用）仍分别钉死**；arm 决策与 arm 接缝用例保留。

### 测试与验证（本角色独立执行）

- `node --test test/桌面应用/*.test.ts` → **46 pass / 0 fail**。
- **全量**：`node --test "test/**/*.test.ts"` → **394 pass / 0 fail（全绿）**（基线 393 + 1）。
- **全用注入替身，不真弹窗**（避免 Windows 无真实点击挂死）；不读 `.env`、不发真实网络请求。

### T19：V1 不 arm —— **客户已确认**（本步一并落）

客户 **2026-10-11 拍定：V1 桌面不 arm**（本 changelog 的 T8b 小节措辞已由「待客户拍板」改为「客户已确认：V1 不 arm」）。**含义**：V1 桌面**不提供 shell 能力**（角色在被导入的项目里不能跑命令）；操作者确认对话框通道**已建但未被消费**（如实标注，别让它看起来像在用）；**是客户确认的 V1 范围、非欠账，无需实现改动**（本份实现本即按「不 arm」落）。

## 2026-10-11 — T8b：操作者确认通道 (a)（桌面端；V1 **不 arm**，如实标注未接线）

**来源**：设计 §7.3（组合 (c)+(b)+(a)，(a) 为第三闸、兜底）/ §7.4（落点 `app/` 对话框）/ §7.5（fail-closed 三条）/ §7.6（审计 by/branch）、派发清单 T8（桌面侧）。

### 背景与对接形状（**假设，已注明**）

客户裁定的 shell 审核是三层组合：**(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**。**(c)/(b) 由编排实现**；**(a) 是「人看一眼命令原文、点放行/拒绝」**——CLI 侧由编排实现，**桌面端由本角色实现**。

**先读了编排的两个接口文件**（`src/common/编排/shell-gate.ts`、`src/provider/pi/session.ts`，**只读、未改**）：
- `session.ts` 已冻结 `ShellReviewRequest {command; argv; cwd; toolCallId}` 与 `ShellReviewResult = {allow:true;by} | {allow:false;reason;by}`，`ShellGate = (req) => Promise<ShellReviewResult>`；
- `shell-gate.ts` **目前只装配了 (c)**（`review` 分支默认拒绝，注释明写「未接入 (b)/(a)」）——即 **(a) 的注入点尚未落盘**（T8 编排侧正在接）。

**故本角色按 §7.4 的描述设计一个最小、可对接的通道，并如实写明假设的形状**（不发明编排接口、不改编排文件）：
- **通道形状 = 与 `ShellGate` 同形**：`OperatorChannel = (req: ShellReviewRequest) => Promise<ShellReviewResult>`，类型**直接取自** `src/provider/pi/session.ts`（**不另立第二份定义**）。编排的 (b)+(a) 装配在 review 分支里 `await operatorChannel(req)` 取放行即可；「恰好 allow:true 才 spawn」的唯一保证仍在 Pi 适配器的 `execute`（不在本角色）。

### 改了什么（均在本角色边界内）

- **`app/desktop/operator-channel.ts`（新增，纯逻辑、不依赖 electron，可 node 单测）**：
  - `describeShellCommand(req)` → **命令原文逐字**（**不加工、不截断**）+ **规范化 argv 逐项**（JSON 转义显示，引号仅界定符）+ **cwd 原样**，并组装成给人看的提示正文（强调「逐字核对」「放行=真的执行」）。
  - `createDesktopOperatorChannel({ presenter, operatorId, timeoutMs, env })` → 通道本体。**不做任何命令判定**（不分类、无白名单）；只：呈现 → 取人选择 → 归结论。
  - `operatorAudit(result)` → 由本通道结论产出审计所需 `{ by, branch }` 的**单一映射**（`by=operator:<id>[:timeout|:unavailable]`，`branch∈{a-allow,a-deny,a-timeout,a-unavailable}`）供编排落 `docs/audit/shell-gate.jsonl` 时直接采用（本模块**不写审计**——审计归编排/pm）。超时用**本角色自持**的小计时（不跨角色导入他人私有 `common/`）。
  - **`DESKTOP_SHELL_GATE_ARMED = false`** + 详尽注释：**V1 桌面不 arm**（见下）。
- **`app/desktop/session.ts` / `app/desktop/interface.ts`**：加 **arm 接缝**——可选 `shellGate?: ShellGate`，经 `createPiAdapterFactory(project, shellGate?)`（**编排已冻结的签名**，未发明新形状）透传给 Pi 适配器。**缺省 undefined ⇒ 不 arm ⇒ `run_shell` 不注册**（能力缺席 = 最强 fail-closed）。**当前无调用方提供它**（demo 路径经 `createDemoAdapter`，无 shell 入口，与本接缝无关）。
- **`app/main.ts`**：接好操作者通道 (a) 的**表现层**（Electron `dialog.showMessageBox`：按钮「放行执行/拒绝」，`defaultId=cancelId=1` 即**默认/关窗=拒绝**，`detail` 为逐字原文提示），并留下 arm 接线点。**刻意不构造、不注入**（`if (DESKTOP_SHELL_GATE_ARMED)` 恒不执行）——**不假装在用**。

### **arm / 不 arm 的判断与取舍（本角色的产品面判断；**客户已确认：V1 不 arm**，2026-10-11）**

**裁决：V1 桌面不 arm。** 理由：
1. **(a) 只是三层链的一层；arm 的开关在「谁装配 ShellGate」——编排（T8，正在接）。** 桌面**单方无法 arm**：它没有 (c) 的规则集/分类函数（门禁引擎）、(b) 的 pm 会话、pm 边界与审计门（编排/pm）。故本角色只能**就绪通道 + 留接缝**，不能自行合闸。
2. **桌面当前最强 fail-closed 是「能力缺席」**：不注入 `ShellGate` ⇒ `run_shell` 根本不注册（§7.5.1）。这是 V1 应有的姿态。
3. **arm 是产品决定**：它会**让角色能在你导入的项目里发起 shell**（逐条过 c→b→a，只有 (b) 拿不准才弹「看原文点放行」），与桌面既定「**无弹窗**」（导入即授权）取向**存在张力**，且引入一条真实的子进程执行能力——**客户已拍板（2026-10-11）：V1 不 arm**。

**两边取舍（客户已决策 2026-10-11：V1 不 arm）**：
- **若 arm**：角色可在导入项目里跑命令（如测试/构建）；(c) 硬拦危险、(b) 自动解常规、(a) 仅在 (b) 拿不准时弹「逐字命令原文」对话框；**代价**——操作者确认对话框成为**可能发生**的交互（打破「无弹窗」），且**必须在用户项目里真起子进程**（有爆炸半径，靠 cwd 钉 projectRoot + env 剥离凭据 + 三层闸收窄）；且需编排 (b)/(a) 装配落盘后，把 gate 经 `shellGate` 接缝注入。
- **若维持不 arm**：桌面**无 shell 能力**（run_shell 不注册），通道**就绪但未被使用**（本变更**如实标注**）。**启用路径已铺好**：编排装配好 (c)(b)(a) 的 gate → 经 `shellGate` 接缝注入 → 把 `DESKTOP_SHELL_GATE_ARMED` 改 `true`。

### fail-closed 三条怎么保证（§7.5）

| 情形 | 行为 |
| --- | --- |
| 人点**拒绝** / 关对话框 / 返回非 `allow:true` | **拒绝**（`by=operator:<id>`） |
| 确认**超时**（>timeout，默认 120000ms，`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` 可覆盖） | **拒绝**（`by=operator:<id>:timeout`） |
| 通道**不可用**（未配置 presenter / presenter 抛错） | **拒绝**（`by=operator:<id>:unavailable`） |

**绝不默认放行**——一切不确定情形只往更严处退（落到「不执行」）；UI 侧同向（默认高亮/取消项是「拒绝」）。

### 审计的 by / branch 怎么带（§7.6）

- **`by`**：本通道在返回的 `ShellReviewResult.by` 里带 **`operator:<操作者标识>`**（拒绝/超时/不可用各带 `:…` 后缀）——**编排的审计**（`docs/audit/shell-gate.jsonl`，归 pm、声明 `shell-gate`）据此留「谁审的」。
- **`branch`**：本模块导出 `BRANCH_A_*` 并给 `operatorAudit()` **单一映射**，编排路由到 (a) 时取用即得 `a-allow/a-deny/a-timeout/a-unavailable`。
- **本模块不写审计**（审计落盘归编排/pm），只负责让这两项**有值、可追**。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/operator-channel.test.ts`（14 例）**：命令原文逐字呈现、argv 逐项、放行/拒绝、拒绝附言、**fail-closed 三条**（不可用/未配置/超时）、超时 env 覆盖、`operatorAudit` 四种映射、**arm 决策标注**（`false`）、**arm 接缝**（不提供→`undefined` 未合闸 / 提供→原样透传 / demo 路径不走 pi 工厂）。**全部可注入替身、不真弹窗**（避免 Windows 无真实点击挂死）。
- **`test/桌面应用/`**：`node --test test/桌面应用/*.test.ts` → **45 pass / 0 fail**（原 31 + 新增 14）。
- **全量**：`node --test "test/**/*.test.ts"` → **374 pass / 0 fail（全绿）**（基线 360 + 14）。

### 已知边界（登记）

- **(a) 的注入点尚在编排侧（T8）**：`src/common/编排/shell-gate.ts` 现只装配 (c)，`review` 分支默认拒绝；(b)/(a) 的装配与「桌面通道经 deps 注入编排」尚未落盘。本角色的通道**已就绪并自洽**，**待编排接线**才被消费——**如实标注，未假装已在用**。
- **arm 只对 pi 运行时有效**（demo 路径无 shell 入口）。

## 2026-10-11 — T13：桌面接入「有 `.ans` 就优先加载」（T10 阻塞解除）


**来源**：设计 §3.3（终态规则与例外）/ §3.10（`.ans` 载入器共享化）、派发清单 T13。

### 背景：T10 的阻塞已由 pm（T11）解除

T10 如实登记过一处**被跨角色依赖阻塞**：裁定要求桌面「**项目带 `.ans/project.json` 就优先用它（pin 生效），仅无 `.ans` 才回退运行期同意**」，但载入器当时在**装配私有** `src/common/装配/config-loader.ts`；工程法案 §6 禁止跨角色导入他人私有 `common/`，`src/common/shared/` 尚无可复用入口，渲染侧自写又是明令禁止的「第二份实现」——三条规则叠加，正当通路为零。**现已解除**：pm 把载入器**整体搬迁**到共享位置 **`src/common/shared/config-loader.ts`**（搬迁非 fork，单一实现；属主 pm，消费方**只读导入**）。

### 改了什么（均在本角色边界内）

- **`app/desktop/session.ts`**（接线落点）：
  - **只读导入**共享模块：`loadEffectiveConfig` 与类型 `LoadConfigOptions` / `LoadedConfig` / `ConfigSourceKind`（`src/common/shared/config-loader.ts`）。**未复制任何逻辑、未自写第二份终态规则**。
  - `SessionManagerDeps` 增可选注入 `loadEffectiveConfig`（缺省即共享载入器，便于单测）。
  - `open()` 授权块重写：以「运行期同意」构造的 `buildProjectConfig(listing, runtimeConsent)` 作 `fallback` 传入载入器 → 取回 **`source.acceptance`**（已 fail-closed 规范化的**生效** acceptance）→ `buildProjectConfig(listing, source.acceptance)` 开会话。
  - `OpenResult` 增 `config:{kind,accepted,acceptanceSource,pinCount,reason}`（供界面**如实呈现**；续接时一并带回）。
- **`app/renderer/renderer.js`**：新增 `appendConfigNote(cfg)`，并在 `selectRole` 开启成功后，当 `res.config.kind==="ans-invalid" || !res.config.accepted` 时**内联一条 `sys-config`**：明示「门禁引擎会拒绝该角色的一切写入——这不是已授权状态（不会回退到『导入即授权』）」。渲染进程**无第二份判定**（只读 `res.config` 展示）。
- **`app/renderer/styles.css`**：新增 `.sys-config`（警示色，与 `.sys-readonly` 同族但**独立类名**，便于区分/计数，不干扰 e2e 的 `SU_READONLY_ROWS`）。

### 三条路径的行为（设计 §3.3）

| 情形 | 行为 |
| --- | --- |
| **有可用的 `.ans`（带 pin）** | 用其 **pin-backed acceptance**；pin 生效、受 pin 约束——引擎 `verifyPins` 逐文件 SHA-256 比对，**不符合即未接受 → 拒一切写**。界面无告警行（已授权）。 |
| **无 `.ans`** | 载入器原样回退入参 fallback = **运行期同意**（导入即授权，登记的非-pin 例外）；行为**不变**。 |
| **`.ans` 存在但不可用**（不可读/不可解析/顶层非对象） | 载入器 **fail-closed 未接受**（`kind="ans-invalid"`）、**绝不**回退运行期同意；会话可开但**一切写入被门禁拒**，界面**内联 `sys-config` 如实明示**「不是已授权状态」。 |

> **「可用」的界定**：`.ans` 存在但**不可解析** → 载入器返回**未接受**（fail-closed、**不回退**演示/运行期同意）——一个损坏的 `.ans` 不该换来一份「已接受」。桌面**如实呈现**（见上表末行），**不会**让用户误以为已授权。

### 形状取舍（**回报**，未 fork）—— 载入器 `project.roles` 未被采用

载入器返回 `{project, source}`。其 `project.roles` 在 **`ans-invalid` 分支为空**（fail-closed 产物）；若直接用该 project 开会话，会以「未知角色（未登记在 project.roles）」失败——与桌面左树的枚举角色不一致，且丢失 `builtInRoles`（会话式入口允许清单，须由桌面据 `listProject` 枚举填充）。故桌面**只采纳 `source.acceptance`**，角色表仍取**门禁引擎枚举**（与左树同源，`buildProjectConfig` 既有职责）。此为对本角色对共享组件形状的一处观察：**共享载入器的 `ProjectConfig` 不承载 `builtInRoles`，且 `ans-invalid` 分支 roles 为空**；若未来希望桌面「整体用载入器的 project」，需 pm 在共享层补这两点。**本角色未 fork、未在共享层外另造一份，如实回报。**

### 测试与验证（本角色独立执行）

- **单测**：`node --test test/桌面应用/*.test.ts` → **31 pass / 0 fail**（原 26 + 新增 5）。
  - 新增 `test/桌面应用/ans-wiring.test.ts`（4 例，真实共享载入器 + 真实门禁引擎 + 真实编排 + 真实多轮演示适配器；用**系统临时目录**造 `.ans`，跑完清理，**不在仓库留文件**）：
    ① 有带 pin 的 `.ans` → `config.kind==="ans"`、`accepted`、`pinCount=1`，边界内写入被接受（**pin 生效**）；
    ② pin 与文件 hash **不符** → 会话被拒、错误点明 `SHA-256/pin`（fail-closed）；
    ③ `.ans` **不可解析** → `kind==="ans-invalid"`、`accepted=false`、`acceptanceSource===""`、`reason` 含 fail-closed，**且一切写入被拒**（**不回退**运行期同意）；
    ④ **无 `.ans`** → `kind==="builtin-fallback"`、`accepted=true`、`pinCount=0`、来源含 `desktop-app`，边界内写入仍被接受（**行为不变**）。
  - `renderer.test.ts` +1 例源码不变式守卫：`appendConfigNote` / `sys-config` / 「这不是已授权状态」「不会回退到『导入即授权』」齐全，防回退。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：**退出码 0**、`E2E_DONE=1`，既有检查点**全过**：
  `SU_IS_FIRST=true`、`SU_TREE_BADGE=true`、`SU_CLICKED=true`、`SU_NO_MODAL=true`、`SU_SESSION_STATE=聊天中`、`SU_HAS_WELCOME=true`、`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true SU_READONLY_ROWS=1`、`SU_WRITE_MODE_DEMO_*`；
  `NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME` 全 true；`WRITE_MODE_DEMO_NOTE=true WRITE_MODE_ROWS=1 OLD_GENERAL_CLAIM_PRESENT=false`；`RUNTIME_NOTE_*` 全对。
  **仓库无 `.ans` → 走回退**：`SYS_ROWS` 中**无** `sys-config` 行（符合预期，未破既有界面）。跑完无残留 Electron 进程。
- **全量**：`node --test "test/**/*.test.ts"` → **357 pass / 0 fail（全绿）**。
  （旁注：本轮中途 `test/测试/real-entry.test.ts` 的 govern 用例一度期望退出码 2、实测 1——因 **T5 已把 `govern` 从占位改为真治理会话**、缺 `ANS_PI_BASE_URL` 时 fail-closed 退出 1；该文件随后由**测试角色**更新为「只断言非 0」，全量转全绿。该文件属**测试角色**、根因在**编排/装配**，**均在本角色边界之外、与本改动无关**。）

### 已知边界（不在本角色边界内，登记）

- `test/测试/real-entry.test.ts` 的 govern 用例期望曾滞后于 T5（一度期望占位码 2）；本轮中途由测试角色更新为「只断言非 0」，全量转全绿。与 T13 无关。
- pin **hash 是否相符**由**门禁引擎** `verifyPins` 判（本层只判「有没有 pin」）：故「`.ans` 带 pin 但 hash 不符」在会上**被拒**（会话开启失败、错误点明 pin），界面无 `sys-config` 行——这是引擎的 fail-closed，界面的拒绝内联/错误提示即其如实呈现。

## 2026-10-11 — T10 修正：界面写入语义改为「按运行时如实」（删「V1 桌面：只判不写」）

**来源**：设计 §3.9 **更正**（客户新裁决：**「只判不写」只是 demo 路径的属性，不是整个桌面的属性**）、派发清单 T10。

### 背景：文档与代码不一致，必须消除

上一轮按当时裁定加了「V1 桌面：只判不写」的界面提示，把它当作**整个桌面**的属性。新裁决厘清：

- **demo 路径**（`app/desktop/chat-adapter.ts`，`buildGovernedTools(gate)` **未传 `writeRoot`**）→ 写层 **fail-closed** → **只判定、不落盘**；
- **pi 路径**（界面 runtime 切 `pi`，经编排 `createPiAdapterFactory` → **真实适配器**，`writeRoot = projectRoot`）→ **会真的把文件写进被导入的项目**，但**受门禁约束**（角色边界 Section 1 + acceptance，与 CLI 同一套 `resolveWrite`）。

即：**界面说「不落盘」而 pi 路径会落盘——文档与代码不一致**。本次消除：文案**按运行时如实**，**不再**一概而论。

### 改了什么（均在本角色边界内）

- `app/renderer/renderer.js`：
  - **删除** `appendNoWriteNote()`（其文案「V1 桌面：只判不写——…本版不把任何写入落盘」一概而论）与 `setChatHeader` 副标题里的「· V1 桌面：只判不写（获准也不落盘）」；
  - 新增 `writeModeInfo(runtime)`：按运行时返回文案与样式（**书面唯一来源**，内联与常驻两处共用，杜绝漂移）：
    - **demo**（`sys-nowrite` / 划线图标）：`演示运行时（demo）：写入只经门禁引擎判定并在对话中显示结果，不会落盘——获准的写入也不会写进你导入的项目。`
    - **pi**（`sys-write` / 笔形图标）：`真实运行时（pi）：写入会真正落到你导入的项目，但仍受该角色边界约束——越界写会在写之前被门禁拒绝，不会改动你的项目。`
  - `appendWriteModeNote(runtime)`：会话开启时内联一条，按**该会话实际使用**的运行时（`selectRole` 里先取 `runtime` 再 `openSession`，同一值复用）；
  - `renderRuntimeNote()`：**输入区常驻**写入语义元素 `#runtime-note`，随 `#inp-runtime` 的 `change` 事件**重渲染**（demo↔pi 文案跟着变），初始化时调用一次；
  - `setChatHeader` 副标题改为**运行式中性**：`会话由治理引擎全程把关 · 写入语义随运行时（见输入区）`（不再声称任何写入结果）。
- `app/renderer/index.html`：`.composer-tools` 与 `.composer-row` 之间新增 `<div id="runtime-note" class="runtime-note"></div>`（常驻，始终可见）。
- `app/renderer/styles.css`：新增 `.runtime-note`（信息性细条，纯 CSS；`.is-pi` 态文字用 `--fg` 提一点存在感）、`.sys-write`（pi 内联说明，中性色——**就事陈述，非警示**）；`.sys-nowrite` 注释改为「demo 路径」。
- **措辞准确性**：pi 文案**不写**「pi 会写任何东西」——写仍**受门禁约束**；也**不写**成免责声明。demo 文案明示「**不会落盘**（只判定并显示结果）」。与既有设计语言一致（纯 CSS、无外部依赖、无 emoji、无渐变）。
- **硬约束满足**：文案只述**运行时语义**，界面层**不作任何判定**；判定仍**唯一**来自门禁引擎。渲染进程仍**不读角色数据**做写入语义说明。

### 测试与验证（本角色独立执行）

- **单测**：`node --test test/桌面应用/*.test.ts` → **26 pass / 0 fail**（原 23 + 新增 3）。
  新增 `test/桌面应用/renderer.test.ts`——源码文本不变式守卫（renderer.js 是纯浏览器 IIFE，无法在 node 下 import，DOM 行为由 e2e 覆盖）：钉住 ① demo/pi 两种文案的关键措辞齐全；② 选择器 `change` 挂 `renderRuntimeNote`、`#runtime-note` 元素与样式存在；③ **不得再出现**「V1 桌面：只判不写」。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：**退出码 0**、`E2E_DONE=1`，新增检查点**全真**：
  - 按运行时（会话内联）：`SU_WRITE_MODE_DEMO_ROWS=1`、`SU_WRITE_MODE_DEMO_NOTE=true`；`WRITE_MODE_DEMO_NOTE=true WRITE_MODE_ROWS=1`；
  - 旧文案已消：`OLD_GENERAL_CLAIM_PRESENT=false`；
  - **运行时切换**（只切选择器、**不开启任何会话**——pi 无 provider 配置会 fail-closed，绝不真开 pi 会话）：`RUNTIME_NOTE_DEMO_CLASS=runtime-note` / `IS_PI=false` / `NOWRITE=true` / `SAYS_DEMO=true`；`RUNTIME_NOTE_PI_CLASS=runtime-note is-pi` / `IS_PI=true` / `WRITES_PROJECT=true` / `GATED=true` / `NOT_NOWRITE=true`。
  - 既有 `SU_*`、`NO_MODAL_*`、拒绝内联、续接、右栏资料**全过**（未破）。跑完无残留 Electron 进程。
- 截图 `02-chat.png` 复核：底部运行时选择器旁常驻一行演示说明（`.runtime-note`），文案与图标正确。

### 已知边界（不在本角色边界内，登记）

- pi 路径需 **provider 凭据 + `ANS_PI_CONTEXT_WINDOW`**；客户 `.env` 未设时选 pi 会在建会话时 fail-closed 抛错（`resolvePiProviderConfig`）——故 e2e **只断言「选 pi 时界面显示了正确文案」，不真开 pi 会话**。运行时切换的**写入语义说明**不依赖凭据，照常如实。

## 2026-10-11 — T10：登记运行期同意为例外 + UI 明示「V1 桌面：只判不写」（`.ans` 优先加载被跨角色依赖阻塞）

> **⚠ 本条的「V1 桌面：只判不写」已被同日上一条「T10 修正」取代**——该说法**仅 demo 路径成立**，pi 路径受门禁约束真实写入。下文仅作历史留痕，**现行行为以上一条为准**。

**来源**：设计 §3.3（终态规则与例外）、§3.9（桌面写入能力：V1 裁决只判不写）、派发清单 T10。

### 1) 运行期同意 = §3.3 登记的非-pin 例外（理由写死在代码与文档）

刚裁定的终态规则：**`accepted:true` 必须二选一——(a) pin-backed 或 (b) 登记在案的非-pin 例外，没有第三档**。当前登记的例外**仅两个**：① 桌面应用的**运行期同意**（本角色）；② CLI 演示内嵌配置 `DEMO_ACCEPTANCE`（归装配，见 `src/index.ts`）。

桌面的 acceptance 是 `{accepted:true, source:"desktop-app:导入项目即授权…（原型，无客户 pin，已知偏离）"}`——**没有 pin**。它在规则下**合法**，但必须把「它是登记例外、以及为什么」写死。理由已写入：
- `app/desktop/session.ts`（acceptance 构造处，逐条展开）；
- `app/desktop/project.ts`（`buildProjectConfig` 的 acceptance 注释）。

**理由（要点）**：pin 的语义是对**预先钉住的产物**做**篡改检测**（先固定一个 hash，日后比对是否被改动）。桌面的信任模型是**运行期实时人授权**——客户已定「导入项目 = 授权、无弹窗」，授权由**人在导入这一刻当场作出**，不存在「先于授权而存在的固定产物」可供比对。给一个当场作出的授权硬加 hash 是**假证据**：它既不表达「谁在何时授权了什么」，也检测不到任何篡改。故它是**结构上不同于 pin 的授权来源**，**不是「忘了加 pin」**；伪造一个 pin 反而更坏（把假证据当真证据）。

### 2) 「项目带 `.ans` 时优先加载它」——**未实现：被跨角色依赖阻塞**（如实登记）

裁定要求：项目有 `.ans/project.json` 时**优先用它（pin 生效）**，**仅无 `.ans`** 才回退运行期同意；现状桌面无条件用运行期同意 = 对带 `.ans` 的项目**等价于绕过其 pin**，是已知偏离。

**为何本角色无法自行实现**（未硬写第二份、未复制一份）：
- `.ans` 的载入 + 终态规则（`loadEffectiveConfig()` / `enforcePinBackedAcceptance()`）归**装配的私有 `common/装配/config-loader.ts`**；
- 工程法案 `project-rules.md` **§6 明令不得导入其他角色的私有 `common/`**；跨角色共享须经**项目管理**的 `common/shared/`（唯一写入者 pm），而该处**尚无可复用入口**（`src/common/shared/` 目前不存在）；
- 在渲染/Interface 侧**另写一份加载器或终态规则**正是本项目**明令禁止的「第二份实现」**（硬约束：不得出现第二份实现）。故本角色**不写第二份**——如实登记被阻塞。

**建议形状（请项目管理协调）**——把该能力经**法定跨角色通道**提出，保持**单一实现**：
1. **pm** 在 `src/common/shared/` 新建共享模块（如 `src/common/shared/ans-config.ts`），承载 `.ans` 载入 + 终态规则（**逻辑整体搬迁，不 fork**）；
2. **装配**改为从共享模块导入（其 `config-loader.ts` 变成薄转发或直接删除），于是仍只有**一份**实现；
3. **桌面应用**从该共享模块导入，在 `app/desktop/session.ts` 打开会话时：**`.ans/project.json` 存在且可用 → 用其 pin-backed acceptance**；**否则**回退运行期同意。
- 替代方案（若倾向由属主直接暴露）：装配把 `loadEffectiveConfig` 从**公共入口**导出——但装配非私有路径只有 `src/index.ts`（CLI 根入口），跨角色导入他人根入口并不可取，且会拖入 CLI 接线；故 `common/shared/` 路线更合规、更清。
- **需要他人动作**：pm（共享模块属主）与装配（去重）。二者均在**本角色边界之外**，本角色**不动手、不复制**。

### 3) UI 明示「V1 桌面：只判不写」

设计 §3.9 裁决：V1 桌面**能聊天、能在聊天流内联显示拒绝，但任何获准写入都不落盘**（`app/desktop/chat-adapter.ts` 不传 `writeRoot`，Pi 适配器 T3 把「未配置 writeRoot」定为 fail-closed「只判定、不落盘」）。这是**有意的**，不是坏掉的——故界面**必须明示**，否则用户会以为改成功了其实没写。

提示放在与 su「本版只读」一致的位置（会话头副标题 + 聊天流内联系统行）：
- `app/renderer/renderer.js` `setChatHeader`：会话头副标题改为 `会话由治理引擎全程把关 · V1 桌面：只判不写（获准也不落盘）`（持久可见）；
- `app/renderer/renderer.js` 新增 `appendNoWriteNote()`：**点开任一角色会话**时于聊天流内联一条 `sys-nowrite` 系统说明，文案：
  `V1 桌面：只判不写——写入会经门禁引擎判定并在对话中显示结果，但本版不把任何写入落盘（获准的写入也不会写进你的项目）。`
- `app/renderer/styles.css` 新增 `.sys-nowrite`（主色，信息性；与只读的警示色 `--warn` 区分）。
- **硬约束满足**：该说明对**全桌面**成立（非按角色），渲染进程**不读任何角色数据**即可显示，**无第二份边界判定**。既有 su「本版只读」内联说明保留（只读角色额外追加，两者并存）。

### 4) 验证（本角色独立执行）

- `node --test test/桌面应用/*.test.ts` → **23 pass / 0 fail**（原 22 + 新增 1：`session.test.ts`「运行期同意：登记的非-pin 例外——accepted:true 且不带 pin，来源如实标注（行为不变）」）。
- e2e（真实 Electron 44.7.0）：新增检查点 `SU_NOWRITE_ROWS=1`、`NOWRITE_NOTE=true NOWRITE_ROWS=1 CHAT_SUB_HAS_NOWRITE=true`（均为真）；
  既有 `SU_*`（`SU_IS_FIRST`/`SU_TREE_BADGE`/`SU_CLICKED`/`SU_NO_MODAL`/`SU_HAS_WELCOME`/`SU_READONLY_BADGE`/`SU_READONLY_NOTE` 全 true，`SU_SESSION_STATE=聊天中`）、
  `NO_MODAL_*` 全过；可写的项目角色 `DESKTOP_ROLE_READONLY_BADGE=false`、`DESKTOP_ROLE_READONLY_ROWS=0`（未被误标只读，未破）。

### 5) 附带观察（不在 T10 范围，如实登记）

- 桌面 `pi` 运行时路径：`createPiAdapterFactory(project)`（编排）→ 真实 Pi 适配器，其**恒以 `writeRoot = projectRoot` 调 `buildGovernedTools`**（`src/common/pi-adapter/real-adapter.ts`）——即选 **pi** 运行时**会真正落盘**，与「V1 桌面只判不写」相左。当前桌面未注入 provider 配置（无 `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_CONTEXT_WINDOW`），选 pi 会在建会话时 fail-closed 抛错（`resolvePiProviderConfig`），故**实践上不可达**；但该收窄点在 `src/**`（编排 / Pi适配器），属**本角色边界之外**，**不越界改**，在此登记以提请协调。


## 2026-10-11 — su（内置治理角色）本版只读的界面明示

**背景**：su 的聊天通道已修复可用（`openRoleSession` 现接受 `project.builtInRoles` 声明的内置角色）。但 su 走内置边界，`acceptance.accepted === false`，门禁引擎 `resolveWrite` 的 F6 会拒其一切写入——界面此前无任何提示，用户点开 su 会以为能让它创建角色/改东西，却每次写入被拒，像坏了。本改动在界面明示「本版只读」。

**改了什么**
- `app/desktop/interface.ts`：`RoleView` 增 `readOnly: boolean`；新增纯函数 `isReadOnlyRole(role)`，`listProject` 据此派生。
  判据 = `role.builtIn === true && role.boundary.acceptance.accepted === false`（**读门禁引擎给出的角色数据，不另写边界/路径判定；不硬编码 `"su"` 或任何角色名**）。
- `app/renderer/renderer.js`：左树对 `role.readOnly` 角色渲染 `只读` 徽标（`.ti-badge.readonly`，紧邻既有「内置」徽标）；
  新增 `appendReadonlyNote`，点开只读角色会话成功后在聊天流内联一条 `sys-readonly` 系统说明。渲染进程只读 `role.readOnly` 布尔，**无第二份判定**。
- `app/renderer/styles.css`：新增 `--warn-line` 令牌、`.ti-badge.readonly`（警示色，与主色「内置」徽标区分）、`.sys-readonly`（警示色居中细条）。
- `test/桌面应用/interface.test.ts`：+3 用例（`isReadOnlyRole` 数据驱动、未接受的内置角色带标记/已接受的不带、可写的项目角色不得误标）。
- `test/桌面应用/e2e/main.mjs`：+2 个检查点组（`SU_READONLY_*`、`DESKTOP_ROLE_READONLY_*`）。

**判据为何必须结合 `builtIn`（关键决定）**
- `listProject` 对**所有**角色所列的 acceptance 都是未接受（其注释明示「仅用于展示」——枚举无接受证据入参）。
  若单看 `acceptance.accepted === false`，会把**可写的项目角色**一并误标为只读。
- 角色实际跑在哪个 acceptance 由 `resolveBoundarySection` 决定：项目角色在「导入即授权」下解析出 `accepted:true`（可写）；
  内置角色无项目边界覆盖，恒落到 `builtInBoundarySection()`（`accepted:false`）→ 故只读 ⟺ 内置且未接受。

**措辞（准确性）**
- 内联说明：「本版只读：该角色按当前 acceptance 工作，门禁引擎会拒绝它的一切写入——可以对话，但不能由它写盘。」
  如实把「拒写」归**门禁引擎**（F6 接受门），不写成「本会话不能发起写入」——界面不承担判定职责。

**验证（本角色独立执行）**
- `node --test test/桌面应用/*.test.ts` → **22 pass / 0 fail**（原 19 + 新增 3）。
- e2e（真实 Electron 44.7.0）：`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true`（`SU_READONLY_ROWS=1`）；
  可写的桌面应用角色 `DESKTOP_ROLE_READONLY_BADGE=false`、`DESKTOP_ROLE_READONLY_ROWS=0`；
  既有 `SU_*`（`SU_IS_FIRST`/`SU_TREE_BADGE`/`SU_CLICKED`/`SU_NO_MODAL` 全 true，`SU_SESSION_STATE=聊天中`、`SU_HAS_WELCOME=true`）与
  `NO_MODAL_*`（导入/点角色/发消息/续接）**全过**；聊天本体、拒绝内联、续接、右栏资料均正常。

## 2026-10-11 — su（内置治理角色）补入左树 —— 复核未通过：点 su 无法开启聊天

**来源**：本改动由**顶层会话越界**直接写入本角色边界内 7 个文件（未走本角色）；客户判定流程不对，决定「代码保留、由本角色复核并补记录」。以下为本角色独立复核与独立验证。

**改了什么（复核所见）**
- `app/desktop/project.ts`：`buildProjectConfig` 对 `r.builtIn` 角色 `continue`，不登记进 `roles`（su 无角色目录；登记会使 `resolveRole` 去读空 `cardPath` → 报错）。
- `app/desktop/interface.ts`：`RoleView` 增 `builtIn: boolean`；`listProject` 在 `readRoleDocsIndex` 前加守卫 `if (!r.builtIn && r.cardPath !== "")`（否则内置角色会把**项目根**当角色目录递归 walk，`docs` 会污染成整个仓库）。
- `app/renderer/renderer.js` / `styles.css`：新增 `ICONS.shield`、树条目 `builtin` class 与 `.ti-badge`「内置」徽标、`roleSubtitle` 对内置角色返回「内置治理角色 · 由 SKILL.md 定义」。
- 测试：`project.test.ts` +2 用例、`interface.test.ts` +1 用例、`e2e/main.mjs` +步骤 1b。

**复核结论：不通过（反对「点 su 能开聊天」这一表述）。**
- 通过——界面呈现正确：su 排在左树第一，shield 图标 +「内置」徽标 + 副标题无误。
- 通过——**硬约束满足**：渲染进程**没有**出现第二份边界判定；`renderer.js` 仅读 `role.builtIn` 决定图标/徽标/文案，一切判定仍调门禁引擎。
- **不通过——核心缺陷：点击 su 无法开启聊天。** 链路：`SessionManager.open` 用 `listing.roles.find` 找到 su → `buildProjectConfig` 不登记 su → `openRoleSession` → `setupRole`（`src/pipeline/orchestration/run-role.ts`）对**未登记在 `project.roles`** 的角色一律以 `EXIT_USAGE` 拒绝 → 界面报「会话开启失败：未知角色：su（未登记在 project.roles）」，会话状态「连接失败」。
- 修复点位于 `src/**`（**本角色边界外**）：须让 `openRoleSession`（聊天路径）接受内置治理角色（`built-in-governance`），或另设「不登记却可寻址」的路径。**本角色不越界改，已回报。**

**验证（本角色独立执行）**
- `node --test test/桌面应用/*.test.ts` → **19 pass / 0 fail**。
- e2e（真实 Electron 44.7.0）：`SU_IS_FIRST=true`、`SU_TREE_BADGE=true`、`SU_CLICKED=true`、`SU_NO_MODAL=true`、**`SU_HAS_WELCOME=false`**、**`SU_SESSION_STATE=连接失败`**；既有 `NO_MODAL_*`（导入 / 点角色 / 发消息 / 续接）**全过**；桌面应用角色聊天本身正常（2 条用户气泡、2 处拒绝内联、续接提示、右栏四组资料）。

**遗留问题与界面方案（su 即使能聊也写不了 → 误导风险）**
- su 走内置边界，`acceptance.accepted === false`，`resolveWrite` 的 F6 接受门 **拒绝一切写入**。界面可读到 su 会「创建项目角色」的角色卡，副标题却是「内置治理角色」，**无任何提示**说明其本版只读——用户可能误以为能让 su 干活，却每条写入都被拒。
- 方案（本角色边界内，待 su 聊天恢复后实施）：把 `roleSubtitle`（或树徽标 / 会话欢迎语）对 su 增补一句「本版只读：受治理会话暂不允许写盘」，并在点 su 开启会话时于聊天流内联一条系统说明，明示「可对话，写入一律被门禁拒绝」。现因聊天本身打不开，暂不实施，仅记录方案。

## 2026-10-11 — 导入即授权：点角色直接聊天（无确认框）；界面专业化重做

客户最终定稿（覆盖上一轮「每会话一次确认」）：**导入项目 = 授权；左树点一个角色 → 中栏立即进入聊天，全程无确认框**。
用户对 writeSet/边界清单/acceptance 来源**无感**（边界是项目管理管的事）；门禁照常在后台拦每一次写入。

- **删除两段式确认**：`SessionRequest`/`DispatchSummary`/`StartResult`/nonce/`request`/`start` 全部移除；
  `SessionManager` 新语义为 `open`（一次调用直接建会话）——同角色重复点击 = **续接**（返回 `note`，不重建）；
  切换角色 = 先 `dispose()` 旧会话再开。
- **IPC**：`session:request`/`session:start` 合并为 **`session:open`**（`{projectRoot, roleId, runtime}` → `OpenResult`）；
  `session:send` 不变（可反复调用）；`session:stop`、`session:event` 不变。preload/main/interface 同步。
- **acceptance**：`{ accepted: true, source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）" }`，
  如实标注偏离；`scope` 仍传 `undefined`（上界 = 角色边界，判定唯一来自门禁引擎）。
- **denied 内联**：拒绝事件渲染为聊天流中的内联系统消息（柔红色调、可展开看按根分组的允许路径），
  不再是任何弹窗/手续。
- **界面专业化重做**（纯 CSS，无外部依赖/构建）：柔和深色三栏（Linear/VS Code 质感）、CSS 变量令牌
  （一个主色 + 语义色，4/8px 栅格）、左树内联 SVG 图标 + hover/选中态 + 角色副标题、
  中栏真聊天气泡（用户右/助手左、系统事件居中细条、denied 可展开、输入框固定底部带聚焦态与自动增高）、
  右栏手风琴分组（角色卡/边界条目斑马纹表/变更记录/文档）、系统字体栈 13–14px、行高 1.6、过渡 120ms。
- **测试**：单测重写为 16 个用例（点角色即开/多轮累积/续接/切换 dispose/未枚举失败等），全绿；
  e2e 驱动真实 Electron：导入 → 点角色直接进聊天（4 处 `NO_MODAL` 检查点全过）→ 两条消息都生效 →
  越界被拒且内联展开 → 续接提示 → 右栏四组资料，4 张截图。
- **文档**：设计稿 §5.2/§5.3/§5.4/§6/§8/§9 按定稿更新（§5.3 演进记录留痕）。

## 2026-10-11 — 中栏改为真聊天（多轮），确认框去掉范围

客户反馈：聊天不该先要求声明 writeSet。据此改动：

- **确认模型**：「开一个角色聊天 = 一次确认」，确认框**去掉 writeSet 行**；保留并显示
  角色、边界来源、acceptance（含 source）、运行时，并**明示**「该角色按**完整边界**工作」+ 列出边界条目。
  确认一次性、对该会话有效；**之后每条消息不再弹框**。
- **多轮聊天**：会话改经编排新冻结接口 `openRoleSession` 建立（**只建一次**），`session:send` 可反复调用，
  事件跨轮持续刷出；切换角色/关窗 `dispose`。`scope` 传 `undefined`（聊天无任务收窄）。
- **新增文件** `app/desktop/chat-adapter.ts`（多轮演示运行时；`createFakeRuntimeAdapter` 单轮即关队列，不适用）。
- **IPC**：`session:request` 摘要去掉 writeSet；新增 `session:send`；`session:stop` 改为关闭会话。
- **渲染**：中栏输入改为消息框（多轮），运行时可选、"确认时接受边界"勾选项保留。

### 仍成立

- 判定仍由门禁引擎负责：越界写入照样在**写入之前**被拦（含按根分组的允许路径）。
- acceptance 来源在无客户 pin 下如实标注（确认框可见）；不勾选则 fail-closed。

## 2026-10-11 — 三栏桌面应用首版落地

- **新增** `app/main.ts`（Electron 主进程入口）、`app/preload.cjs`（受限 IPC 桥）、
  `app/desktop/{interface,session,project}.ts`（桌面 Interface）、
  `app/renderer/{index.html,styles.css,renderer.js}`（三栏视图）。
- **新增** `test/桌面应用/{project,session,interface}.test.ts`（13 个用例）与
  `test/桌面应用/e2e/main.mjs`（端到端自检）。
- **左栏**：系统文件夹选择器导入项目 → 经门禁引擎 `listProject` 枚举角色并成树。
- **右栏**：角色卡正文、Section 1 边界条目表（根/kind/path/purpose/condition）、
  变更记录索引、`docs/` 目录索引。
- **中栏**：对角色发起受治理会话；`tool_call` / `denied` / `accepted` / `settled` 事件实时刷出。
- **会话授权**：先请求摘要（含项目/角色/任务 id/writeSet/边界来源含 acceptance.source/运行时）→
  界面展示 → 用户确认 → 才启动；nonce 一次性、只对该次派发生效。

### 决定与偏离

- **Electron/TS**：实测 Electron 44.7.0 自带 Node 24.21.0，GUI 主进程可直接 import `.ts`（原生类型擦除），
  **不引入构建步骤**；preload 以 CJS（`app/preload.cjs`）承载。
- **acceptance 来源**：原型无客户 pin，确认框如实标注派发期确认来源；不勾选则 fail-closed。
- **会话单回合**：遵循冻结 `runRole` 单次 prompt 语义，中栏「发送」= 一次派发，非多轮对话。
- **`package.json`**（electron 依赖、`main`、`app` 脚本）属装配角色，本角色未改动。

### 修复

- **事件时序**：结束摘要原由渲染侧在 `start()` 返回后追加，会因 IPC send 与 invoke 回复乱序而抢先渲染；
  改为经 `session:event` 同一通道最后发出，保证在事件流之后有序到达。
