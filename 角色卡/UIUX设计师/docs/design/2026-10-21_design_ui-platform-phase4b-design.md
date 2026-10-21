---
id: ui-platform-phase4b-design
type: design
title: Phase 4B 设计附录——治理三权/镜像/治理记录/报告全文与回执
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-phase4a-design, ui-platform-phase4a-review, ui-contract-surface, ui-components, ui-platform-phase3b-cards-composer]
events:
  - date: "2026-10-21"
    kind: designed
    summary: 按 PM §十四 4B 授权完成治理三权卡/镜像、治理记录预览、报告全文/persistence/delivery、operator 排队聚合、菜单配置状态与 single 警告刷新、queueView tab 切换的设计附录；只读旧实现/证据，不写 app/ 代码
---

# Phase 4B 设计附录：治理三权、镜像、治理记录、报告与回执

**范围**：Phase 4B 的界面部分——治理三权卡/镜像、治理记录建立/重新接受/迁移预览、报告全文/persistence/delivery 回执、operator 排队聚合、菜单配置状态、single 模型切换的一次性警告、`queueView` 顶层 tab 切换清理。**不包含** Phase 5 的入口切换、全量双端逐 check、`main.mjs`、打包/发布、真实模型/网络验收。

**性质**：仅设计。本文件只读旧实现、旧证据、4A 现有实现与契约面；**未实施、未测试、未部署**；未改 `app/`、`src/`、`test/`、其他角色或历史设计文档；未提交。4B 实现由桌面UI 按 PM 派发执行。

**设计依据**：Nova × 深色石墨规范、4A 设计附录（revision 3）、旧渲染器 `app/renderer/renderer.js`（治理/报告/镜像段）、`app/renderer/ui-labels.js`（全部业务文案单一来源）、`app/renderer/styles.css`、[契约面](../../../桌面UI/docs/feature/ui-contract-surface.md)、[组件台账](../../../桌面UI/docs/feature/ui-components.md)、PM §十四 与测试证据（见 §九）。

## 一、总体原则

1. **同一事实只有一份状态**：同一治理请求 id 的源面/镜像面共用一个 state；任一侧作答后两侧同时冻结；不建第二张审批、不产生第二次提交。
2. **不新造业务能力**：治理记录预览零写入；确认才写；报告/回执只呈现主进程事实；排队聚合不合并、不代答、不重排。
3. **不猜**：`governanceModel`/`governanceRecord`/`mirrorRoleId`/`queued`/`canConfirm`/`persistence` 缺失时按未知处理，不推断 single/trio、不把未知说成成功/缺配。
4. **不假完整**：报告全文缺省/截断/净化、persistence 未知、delivery 未回执都如实显示；不显示「完整」「已持久化」「全部收齐」等未证实状态。
5. **失败如实**：写入阶段失败不得说「未写入任何文件」；非写入阶段失败才可声明零副作用；报告保存失败保留重试入口，不假装已保存。
6. **沿用 Nova**：900 内容列、15/27 正文、13 基础、8/6/4 圆角、2px/3px 焦点环、Lucide 图标、Motion 只用于抽屉/浮层；聊天热路径零动画。不引第二套 UI/图标/动画/状态库。

## 二、治理三权卡与镜像

### 2.1 治理模型状态行与 single 迁移

入口位置：会话头下、`runtime-config-notice` 同层的治理状态区；`#governance-status` 为一行（可换行）的只读状态 + 动作；`#governance-preview` 紧随其下（非模态）。

| 模型事实 | 状态行 | 迁移提示/动作 | 其他 |
| --- | --- | --- | --- |
| `governanceModelKnown=false` | 不显示模型行（不猜） | 不显示迁移条 | 不显示 queue aggregate；mirror 仍按 payload 的 `mirrorRoleId` 呈现（载荷权威） |
| `single` | 「治理模型：旧模型（su）」 | amber 条「本项目使用旧治理模型（su）。可升级为三权模型。」+「查看差异 / 升级」（桥齐备）/「升级入口待本版后续」（禁用） | 决策开关 disabled；无 queue aggregate；mirror 通常不出现（若 payload 有则照呈，不推断） |
| `trio` | 「治理模型：三权 · 五角色」；有 `flowId`/四态时追加「当前流程：… · 等待客户决定/进行中/阻塞/已升级客户」 | 无迁移条 | queue aggregate 可用；mirror 可用；决策开关可用 |
| 未知状态/非法值 | 不显示对应片段（不猜） | 不显示 | 不把未知映射成 single |

- 状态行文案逐字使用旧 `UiLabels.governanceStatusText/modelText/flowStatusText`；模型名只用「旧模型（su）」「三权 · 五角色」，不用「单模型」等新词。
- 状态行颜色：模型文字 `--text-2`，迁移条/排队提示 `--warning`；错误/记录无效 `--danger`；不使用红色单独传意。
- 状态行动作 28px ghost；键盘可达；`aria-expanded`/`aria-controls` 指向预览面板；不自动抢焦点。
- **single 警告刷新**：`governanceModel` 发生 single↔trio 变化时，清除本会话内「替我审批/替我决策」一次性警告的已确认键；single 立即禁用 decision 开关并收起警告；trio 重新武装 warning（首次开启时才展示一次，不持久化）。不因切角色/切引擎/开抽屉重放警告；不写 localStorage。

### 2.2 源面与镜像卡

**源面**（`roleId`）：沿用 operator 卡，新增治理元信息：

```
[盾牌] [标题] [治理决定 · 客户最终批准 / 需求确认 · 客户]
流程：flowId    步骤：stepId
权力类型：提案/提名/编排/验收/需求确认
将写路径：path（逐条）
摘要：…
哈希：…
[预览内容（点击展开）]
[选项（choice）]
[确认/不同意 或 提交/取消] [原因/回执]
```

**镜像面**（`mirrorRoleId`，主入口 Liaison）：

- 卡片同一 `data-request-id`，加 `.is-mirror` + `data-surface-role-id="<mirrorRole>"`；标题/选项/按钮内容与源面一致。
- 头部徽标 **「镜像 · 主入口」**（`--ring`/`--primary` 边框与文字，10.5/600，4px 圆角）；下方来源行 **「来自 <源角色显示名> 的治理决定 · 客户最终批准」**（11.5 `--text-2`）。角色名使用 `roleDisplayName`（当前为「报告员 / Rapporteur」等），不硬编码 id。
- 左边线 2px `--ring`/`--primary`，背景 `--card`；源面保持 warning 左边线/`--warning-bg`。两者不以颜色单独区分：源面有治理徽标，镜像面有镜像徽标+来源行。
- 镜像卡**到达不自动滚动、不抢焦点、不移动 pane**；只更新对应角色徽标/状态行/聚合。源面到达按既有 operator 卡滚动策略（仅在底部附近时滚）。
- 镜像卡不是第二张审批：不增加按钮、不改变选项语义、不产生第二个 request id；源面/镜像面的确认按钮都调用同一 `operatorRespond({id, decision})`。

### 2.3 只答一次与冻结

- 状态唯一：`open → submitting → decided|expired`；`entry.submitting` + 终态双闸挡住重复点击/第二侧提交。
- 任一侧提交期间：该请求**所有呈现面**按钮禁用；提交面显示「已提交，等待主进程受理…」；另一面同步显示进行态（不重复提交）。
- 成功：两侧 `.op-actions` 与 confirm/deny/submit/cancel 全部 `hidden`（PM §十三 既有例外），保留 `disabled`、`finalNote`、`aria-label`、卡片容器和选项只读态；`finalNote` 为「已确认。」/「已回『不同意』（未获同意）。」/「已取消（未获同意）。」。
- 失效：两侧同款定格，`finalNote`「请求已失效，未获同意。原因：…」/兜底；不保留可点死按钮；重挂/切回按终态呈现，不复活。
- 失败可重试（校验驳回/通道瞬时失败）：两侧解冻，显示「回传失败：…——请重试。」；不把失败写成成功。
- 焦点：提交面动作被隐藏后，焦点移到该卡的 `finalNote`（`tabindex=-1`）或卡容器；非提交面不改焦点。`finalNote` 使用 `role=status`/`aria-live=polite`（避免双面重复播报：只让提交面 live，另一面静态）。
- 虚拟窗口离屏：卡状态保存在行数据，重挂保持；不因重物化产生第二张卡。

### 2.4 排队请求与聚合

- `session:operator-queued`（`queued=true`/`waitingFor`）**不物化可操作卡**；只在主入口（primary role）聊天流尾显示一行聚合：
  `还有 N 个决定等待前一个决定`
- 聚合行结构：`div.sys.sys-queue.op-queue-aggregate` + Clock 12/1.5 图标 + 文本 11.5/1.6 `--warning`；`role=status`、`aria-live=polite`；**不可聚焦、无按钮、无请求内容**。
- 计数：`N` = 当前 project×runtime 下、`queued` 且未物化/未失效的请求数；按 request id 去重；只显示在 trio 的主入口；single/未知不显示。旧项目/旧 runtime 的排队事实不接收。
- 更新：同项目一行原位更新；新 queued 到达 +1，请求转为 active（`operator-request`）时移除该 id 并物化卡；`operator-expired` 清除；队列清空移除整行；不保留空行/0 角标。
- **不跨视图复活**：`queuedRequests` 不进入 runtime view 缓存；切引擎/切回只由主进程重新推送重建；旧视图恢复不得残留聚合行（旧 `uiux-v2` 的 stale-q 场景）。
- `queuedDebug()` 契约：返回当前 queued request id 数组（插入序，只读）；不返回内容、不做业务判定；用于 e2e 断言聚合去重/清空/不复活。
- 若某卡 payload 仍带 `queued=true`（防御），卡上显示「等待前一个决定」且不提交；但正常链路 queued 不物化卡。聚合行与卡不重复计同一 id。

## 三、治理记录建立/重新接受/迁移预览

### 3.1 宿主与非模态规则

- 复用同一 `#governance-preview` 宿主（建立/重新接受/迁移共用），位于 `#governance-status` 下方；**非模态**：无 backdrop、无焦点陷阱、不遮聊天、不锁滚动；聊天仍可读/可操作。
- 宽度 = 内容列 `min(900px, 100%)`；960 档在 24px gutter 内，宽度 100%；面板 `--card` 背景、`--border-strong` 边、8px 圆角、12/14 padding；标题 13/600，正文 12/1.7 `--text-2`，路径/哈希 mono 11，警告 `--warning`，阻断 `--danger`。
- 触发器：`aria-expanded` + `aria-controls="governance-preview"`；打开后焦点移到面板标题（`tabindex=-1`，`aria-live=polite` 宣告），Tab 进入控件；**不设焦点陷阱**；Esc 关闭预览并回触发按钮；结果/错误 `role=status`。
- 预览加载/确认中：布尔 `loading/busy`；按钮禁用；不伪造字段；面板保持可读；不显示假进度条。
- 预览面板高度超过视口时面板内部滚动（`max-height: min(60vh, ...)`，具体按窗口），不把聊天整页跳走；不自动滚动聊天。

### 3.2 建立治理记录

**结构**：标题「建立治理记录（预览）」→ 模型选择 → 字段 → 声明 → 动作。

- 模型选择（native radio，Nova 样式，accent `--primary`）：
  - 选项「单模型（single）」「三权（trio）」；默认 single；若已明确 trio（例如既有 trio 重建）保留 trio，不降级。
  - 显示「将写入的治理模型：单模型（single）/三权（trio）」；模型未知时控件与建立按钮禁用，显示「当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。」。
  - 若预览返回的模型与所选不同，amber 行「预览返回的治理模型：…（与所选不同）」；不假装选择已生效。
  - 若检测到 `docs/proposals`/`docs/nominations`/`docs/flows` 或 `suggestedGovernanceModel=trio`，amber 提示「检测到三权产物…建议选择 trio；请由你点选。」；不自动改选。
- 预览字段（全部来自预览回包，缺失如实）：
  - 「将写入：」逐路径；
  - 「将 pin 的对象（N 项）及角色（M 个）：」逐路径；
  - 「将采纳既有治理边界文档（不覆盖其内容）。」或「将写入治理边界文档：<path>。」；
  - 「授权来源（逐字）：…」；
  - 旧版边界角色：「以下角色的边界仍是旧版 Markdown，将被原样 pin：…（迁移属后续版本）」；
  - 声明（逐字）：「不扩大任何角色写边界、不修改任何角色边界文件内容。」
- 动作：`建立治理记录` primary 32/28；`取消` ghost；确认禁用条件：`busy`、模型未知、预览未加载；建立中文本「正在建立治理记录…」；取消在 busy 时禁用。
- 成功：成功行（使用 `governanceFailureView` 同源的 success 文案口径；不宣称已迁移角色卡/边界/pin）；只留「关闭」；不自动打开报告/不自动切角色。
- 失败：按 `phase`：
  - `phase!=="write"`：逐字 message + 「未写入任何文件。」（message 已含则不重复）；`already-established`「治理记录已存在；本次未写入任何文件。」；`busy` 同上；`invalid-record`「治理记录不可用；本版不自动覆盖，修复路径待后续版本。」；非 write 可重试「建立治理记录」+取消。
  - `phase==="write"`：只逐字 message + 错误码（若有），**绝不**出现「未写入任何文件」；不再提供建立重试，只可关闭/取消（核对现场）。

### 3.3 重新接受治理边界（pin-mismatch）

**结构**：标题「重新接受治理边界（预览）」→ 逐文件变化 → 写入/ pin 说明 → 警告 → blockers → 动作。

- 逐文件行（只认 `modified|missing|unreadable`，未知状态不编语义）：
  - modified：「<path> — 内容已变更（pin <old8>… → 现 <new8>…）」；
  - missing：「<path> — 文件缺失（无法重新 pin）」；
  - unreadable：「<path> — 文件不可读（无法重新 pin）」。
  - 路径/哈希 mono 11，`gp-file` 可换行；状态用文字，不只颜色。
- 说明：
  - 「将写入：.ans/project.json、docs/bootstrap-manifest.md」；
  - 「将重算这 N 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。」；
  - 警告「如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。」（amber，不是装饰）。
- 阻断：`canConfirm !== true` 时列出 `blockers[].message`（danger），确认按钮 disabled；不把阻断藏在 tooltip；「重新检查」ghost（若有 stale/失败）与「取消」。
- 动作：确认「确认接受」primary；busy 文本「正在重新接受…」；取消 busy 禁用；成功后成功文案「已重新接受：更新 C 条 pin（共 N 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。」；只留关闭。
- 失败按 `phase`：
  - 非 write：message + 「本次未写入任何文件。」（已含不重复）+ status 对应提示（no-record/invalid-record/not-needed/preview-stale/missing-file/unreadable-file/unparseable-boundary/busy）；
  - write：只逐字 message；**不说**「未写入任何文件/已恢复/已成功」；不提供重试确认。
- 不改边界文件内容；不扩大声明；不把 pin 重算说成内容修复。

### 3.4 迁移预览（single → trio）

**结构**：标题「升级为三权治理模型（预览）」→ 模型/写入 → 字段/manifest → pin → 保留文件 → 摘要 → 声明 → 动作。

- 字段：
  - 「模型：旧模型（su） → 三权」；
  - 「将写入：…」逐路径（空则「（未报告）」）；
  - 「将写入 .ans 字段：<single|trio|（字段缺失，将新增 governanceModel: "trio"）|（未报告）>」；
  - 「将追加 manifest 记录：…」；
  - 「pin 变更：无（不重算 pin）」或逐条变更（path + old8→new8）；
  - 「保留文件：…」；
  - 「预览摘要（前 8 位）：…」；
  - 声明「预览零写入。确认后只改 .ans 的 governanceModel 并追加 manifest 记录；不重写角色卡/边界/pin/历史会话。」
- 确认：仅当 `snapshotDigest` 非空（`canConfirm`）且非 busy；按钮「确认升级」primary；否则 disabled 并说明；「重新检查」/「取消」。
- 成功：「已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。」；只留关闭；不自动宣称全部迁移完成。
- 失败按 `phase`：
  - 非 write：message + 对应「本次未写入任何文件」/already-trio/no-record/blocked/preview-stale/busy/invalid-request；可重新检查（除 already-trio/no-record）；
  - write：只逐字 message +「写入阶段失败，可能已写入部分文件，请核对现场。」；**绝不**出现「已升级」「未写入任何文件」；不提供确认重试。
- 迁移只改 `.ans` 字段与 manifest；不重写角色卡/边界/pin/历史；不做隐藏修复。

### 3.5 状态与禁用矩阵

| 状态 | 面板 | 确认按钮 | 焦点/播报 |
| --- | --- | --- | --- |
| closed | 隐藏 | — | 触发按钮 `aria-expanded=false` |
| loading | 标题 +「正在读取预览…」 | disabled | 面板标题聚焦，`role=status` |
| preview-ready | 字段完整 | 依 `canConfirm`/模型已知/busy | Tab 顺序；阻断行可见 |
| confirm-disabled | 字段 + blockers/模型未知 | disabled | 阻断原因 aria-describedby |
| confirming | 保留字段，显示 busy 文案 | disabled | 取消禁用；不自动关闭 |
| success | 成功行 | 关闭 | 焦点移成功行/关闭；`role=status` |
| failure-nonwrite | 错误行 + 零写入声明 | 重试（若允许）/关闭 | 错误 `role=alert`；焦点移错误 |
| failure-write | message + 核对现场 | 关闭 | 不出现零写入/成功 |
| stale/blocked | 阻断/重新检查 | disabled/重新检查 | 不自动确认 |

## 四、报告全文、persistence 与 delivery 回执

### 4.1 报告卡分层

沿用当前 900 列 handback 卡（`.msg-handback`），增加事实层，不新造第二套报告卡：

```
来源 <role> · 正式回交/终态记录/来源未确认
任务报告
报告声明：已完成 / 报告状态：…
Pi · 任务 <taskId> · 轮次 <turnId>（缺失：任务关联未知 / 轮次未提供）
────────────────────────
报告原文摘录
<preview markdown 4 行/180 字>
摘要已折叠/已净化/证据截断/预算省略 flags
报告存储：<persistence 状态>        独立验收：尚未确认
以上为报告或终态记录，不等于独立验收通过。
[查看来源角色文档]                 [查看完整报告摘要与证据]
  └ 完整摘要（受控 Markdown）+ 证据逐条 + flags
```

- 头部：来源 eyebrow 10.5 `--text-3`；标题 21/30/650；声明 13/600；runtime/task/turn 10.5；blocked 卡保留 `--danger` 左 3px 竖条与边色，标题仍「任务报告」，不改成「失败报告」。
- **来源/turn/task/provenance**：来源 eyebrow 只取 `report.source.roleId` + `report.origin`（正式回交/终态记录/来源未确认）；`taskId`/`source.turnId` 有则显示、缺失按「任务关联未知」/「轮次未提供」，不从正文/助手文本猜；provenance 就是 origin+source 事实，不另造「已验证来源」。
- 摘要：预览最多 180 字/4 行；`summary.redacted`/`truncated`/`preview<full`/`evidenceOmitted` 文字 flags；完整摘要只在 details 内展开，不预加载额外请求。
- 事实：桌面报告卡显示「报告存储」+「独立验收：尚未确认」；delivery 批内报告不重复每份「报告存储」，由批次事实统一呈现。`独立验收` 永远是「尚未确认」，不把报告声明/完成状态当验收。
- 完整报告 details：`查看完整报告摘要与证据`，32px summary，展开后完整摘要 + 证据列表；证据为空显示「（未提供证据）」；截断/净化 flags 逐条保留；开合状态按行保存（虚拟卸载重挂保持）；长内容在卡内滚动，不横向溢出。
- 来源文档：「查看来源角色文档」32px outline/ghost；仅在 `report.source.roleId` 存在且报告版本受支持时显示；打开既有文档列表/阅读子视图，返回焦点回该按钮；不按路径猜文件、不扩大读取权限。
- 报告不自动镜像两份：当前回交卡在来源角色；跨角色投递由 delivery 卡呈现，不复制报告正文。

| 层 | 字段/来源 | 展示规则 |
| --- | --- | --- |
| 来源 | `report.source.roleId/runtime/turnId`、`report.origin` | 来源角色显示名 + 正式回交/终态记录/来源未确认；turn 仅报有则显示 |
| 任务 | `report.taskId` | 有则「任务 <id>」，缺失「任务关联未知」 |
| provenance | `origin` + `source` | 只做事实转写，不推断已验证/未验证 |
| 保存状态 | `reportPersistence`/`getReportSaveState` | 按 §4.2 矩阵；未 saved 不显示「已持久化」 |
| 投递回执 | `delivery-history-save`/`receipt` | 按 §4.3 批次事实；未回执「未确认」 |

### 4.2 persistence 状态矩阵

persistence 只读主进程回包；外层 `ok` 不等于内层保存成功；版本/scope 不符按未知/失败；迟到回包不覆盖已 saved 事实。

| 状态 | 报告卡（report-save） | 投递批次（delivery-history-save） | 颜色/动作 |
| --- | --- | --- | --- |
| pending | 「正在保存报告…」 | 「正在保存历史…」 | `--text-3`；不显示假百分比 |
| saved / already-saved | 「报告已保存」 | 「接收历史已保存」 | `--primary`；无重试 |
| failed | 「报告尚未保存，暂未继续回交。可补存原报告，无需重新运行任务。」 | 「本次接收历史未保存；执行状态以上方实际结果为准。」 | `--danger`；支持时「重试保存报告/历史」 |
| unknown | 「报告保存状态未确认。」 | 「尚未取得最终历史回执，处理可能已开始。」 | `--text-2`；不显示成功 |
| unknown-live / unsupported | 「当前会话无法确认或不支持此保存恢复能力。」 | 同左 | `--text-3` |
| disabled | 「仅本次会话可见，未启用历史保存。」 | 同左 | `--text-3` |
| expired | 「可补存的会话材料已失效，无法在此补存。」 | 同左 | `--warning`；不提供假补存 |
| conflict / invalid / replay damaged/changed | 旧 `persistenceLabel` 逐字（保存内容冲突/材料无效/历史损坏/已变化） | 同左 | `--danger`/`--warning`；不自动覆盖 |
| provenance too large | 「回交记录超过展示与来源预算，尚未继续投递。」 | 同左 | `--warning` |
| text projection failed | 「交接显示内容生成失败，尚未交给Provider。」 | 同左 | `--danger` |

- 重试按钮：仅 `failed` + 能力支持；28px ghost；点击进入 pending；失败保留原错误；重试不重新执行任务/不重复投递；「补存已有记录，不再次执行或投递。」
- 焦点：重试面板有焦点时，更新后焦点回按钮或状态文本；`role=status`/`aria-live=polite`；错误 `--danger`，不只用颜色。
- 不显示「完整/已持久化/已验收」当 persistence 未 saved；不把保存成功当独立验收。

### 4.3 delivery 回执

**批次卡**（目标角色 pane，`msg-delivery`/injected）：

```
回交投递 · 本批 N 份（不表示全部收齐）
接收历史：已保存 / 未保存 / 未启用历史保存 / 未确认
目标输入记录：已保存 / 尚未保存 / 未启用历史保存 / 未确认
目标轮次结果：已完成 / 失败 / 已中止 / 运行超时 / 可能已开始，结果未确认 / 尚未交给Provider
────────────────────────
[报告 A 卡] [报告 B 卡] ...（reportBody，includeSave=false）
[交接内容（安全显示副本）details]
```

- 标题逐字「回交投递 · 本批 N 份（不表示全部收齐）」；不写「全部收齐」「已全部投递」。
- 事实三列 11/13；960/200% 改为单列；值只能用上表；缺 receipt 时全部「未确认」，不猜。
- `inputSaved`/`history`/`outcome`/`providerMayHaveStarted` 原样映射；`history=failed` 时附「补存已有记录，不再次执行或投递。」；失败可重试保存历史，不重跑。
- 安全显示副本：只显示主进程给的 `trusted-handback-display` 文本；未提供显示「交接内容安全显示副本未提供，不能显示完整模型输入。」；不把完整模型输入当可见内容。
- 目标角色/来源角色：批次卡在目标 pane；报告卡来源 eyebrow 标源角色；不把目标角色写成来源。
- `delivery-receipt` 到达只更新对应 attemptId 的批次；迟到/旧项目/旧 runtime 丢弃；不新建第二张批次卡。目标角色 = 承载批次的 pane 角色，来源角色在报告 eyebrow；回执的 `attemptId` 必须与批次匹配，不把目标角色写成来源。
- 不显示假的批次数/全部收齐；N=0 不显示批次卡；报告卡仍各自可读。

## 五、operator 镜像与排队聚合（契约细化）

### 5.1 DOM 与语义

- `#chat .op-queue-aggregate`：主入口 pane 内唯一；`div.sys.sys-queue` + Clock 图标 + `.sys-text`；文本「还有 N 个决定等待前一个决定」；`role=status`/`aria-live=polite`；无按钮、无 `tabindex`。
- `queuedDebug()`：返回 `string[]` 当前 queued id（插入序）；只读；不返回请求正文/不判定；用于 e2e。
- 同一请求 id 在源面/镜像面共用 `data-request-id`；镜像面 `data-surface-role-id` 区分；不建第二个 request id/第二张审批。
- `queuedOperator`（或等价 store）只保存 queued payload 引用 + id 列表；不进入 runtime view 缓存；切引擎/恢复不复活；只有 `session:operator-queued` 重推才重建。请求转 active 时从 queued 移除并物化卡；expired/清队列移除。

### 5.2 计数/去重/清理

- 计数范围：当前 project × runtime；跨项目/旧 runtime 的 queued 丢弃；同一 id 重推不重复计数。
- 排列：聚合行固定主入口 pane 尾部（与队列行同处），原位更新；不因镜像卡/源卡到达改变位置。
- 清理：`operator-request`（同一 id）→ 移除并物化；`operator-expired` → 移除；队列快照清空 → 移除整行；项目切换 → 清空；runtime 切换 → 清空缓存事实（不重放旧 queued）。
- 空态：无 queued 时不显示 0 行；不显示禁用的空按钮。
- 只读：聚合行不合并/批准/撤回/重排；不点击展开详情；请求内容只在 active 卡可见。

## 六、菜单配置状态、single 警告与 queueView

### 6.1 引擎菜单配置状态

- 触发器/菜单沿用 `EngineSelect` combobox/listbox；菜单宽度从 180 增至 **208px**（状态文字需要；960 下按视口 `max-width` 收缩），菜单项两行：名称 13 + 状态 10.5；右侧 Check 12。菜单项最小高 40px；不因状态更新改变高度。
- 状态文案：`已配置`（text-3）、`缺配置`（warning）、`配置未知`（text-3）、`检查中…`（text-3，12px 文本，不用无限动画）。
- 读取：不在导入/恢复预取；打开菜单时对未缓存 engine 并行读取一次；切换引擎/打开设置/保存成功后读取当前；缓存按 `projectRoot×runtime`；保存/切换/项目变化失效。读取失败显示「配置未知」，不显示「缺配置」。
- 菜单项仍可选择缺配引擎；选择后当前缺配条/设置入口出现；不把绿色/红色作为唯一状态，文字为主。
- 状态更新不改变当前选中项/不重排选项；当前项勾选+前景色，不只底色。

### 6.2 single 模型切换的一次性警告

- 4B 沿用 3B 双开关一次性警告；模型变化（single↔trio）时清除本会话已确认键：
  - 变 single：decision 开关禁用，隐藏已显示的 warning；不弹新警告；
  - 变 trio：decision 开关可用；下一次开启时重新显示一次性警告；已开启状态按主进程；不持久化、不跨项目。
- 切换角色/引擎/抽屉不刷新警告；只有模型变化刷新。警告显示/隐藏不改变开关状态；不出现两个警告。
- 单模型下 decision 开关 title/说明仍明确「仅三权模型可用」；不用灰色文字代替禁用语义。

### 6.3 queueView 顶层 tab 切换（PM §14.2）

- `queueView` 是 UI-only 子视图状态；任何顶层 tab 命令（工作概览/角色资料/设置/文档，含点击当前 tab）先清空 `queueView`，再显示目标 tab 的基础视图；队列标题/返回/Esc 只属于 queueView 内部，不是顶栏 tab。
- 从工作概览队列子视图点「角色资料」→ 角色资料基础视图（不是队列）；从角色资料队列点「工作概览」→ 工作概览基础视图（不是队列）。
- 抽屉保持打开；标题更新为目标 tab；焦点落入目标视图（关闭钮/首个内容），不落回旧队列；Esc/返回只在 queueView 内先回来源，再按 Drawer 规则关闭。
- 队列子视图的唯一性 `#right-queue-body` 不变；切 tab 不新增第二抽屉/第四图标；测试覆盖双向 tab 切换。

## 七、组件、令牌、状态、焦点、动效与 960/200%

### 7.1 组件白名单

**不新增 shadcn/base-nova UI 原语**；4B 复用现有 Button、Input、Textarea、Badge、Alert、Card、Separator、ScrollArea、Collapsible、Switch、Checkbox、Tooltip。治理模型选择用 native radio（沿用 operator choice 的 radio 样式，`accent-color: var(--primary)`），不引入 RadioGroup 新依赖。

**新增项目组合组件（登记台账，不是新原语）**：

| 组件 | 职责 | 组成 | 登记 |
| --- | --- | --- | --- |
| `GovernancePreviewPanel` | 建立/重新接受/迁移的非模态预览宿主 | Card/Alert/Badge/Button/native radio | 来源、用途、状态矩阵、升级责任人 |
| `ReportReceiptBlock` | 报告 persistence 与 delivery 批次事实 | dl/Badge/Button/status | 同上 |
| `GovernanceQueueAggregate` | 主入口排队聚合行 | sys row + Clock | 同上；只读 |

治理决定卡是既有 operator 卡的变体，不新增卡组件；镜像/治理徽标/元信息为卡内元素。4B 不改 `components/ui/**` 现有多文件；如实现需新原语，先回 PM 白名单。

### 7.2 关键尺寸/令牌

- 内容列 900；报告/治理卡/预览同列；960 内容列 664；200% 按 reflow 不横向滚动。
- 治理卡：padding 10/12，8px 圆角，标题 13/600，meta 11.5/1.6，徽标 10.5/600/4px，镜像来源 11.5；按钮 28/32；不使用阴影（卡片仅边框/背景）。
- 治理状态行：min-height 32，11.5/1.6；预览面板 12/14，标题 13/600；路径 mono 11；动作 28；960 面板 100% + 24 gutter。
- 报告卡：宽度 900；report-top 12/14，标题 21/30/650；body 12/14 gap 8；摘要 15/27；facts 11/13；details summary 32；960 标题 20；facts 单列；delivery facts 3→1 列。
- 菜单 208px，项 40，名称 13，状态 10.5；960 菜单 width `min(208px, calc(100vw - 16px))`，右对齐。
- 焦点 2px `--ring` + 3px offset；禁用 .45；错误 `--danger`；警告 `--warning`；成功 `--primary`；不写裸色值。

### 7.3 状态矩阵

| 组件 | default | hover/focus | active/selected | disabled/loading | error/empty |
| --- | --- | --- | --- | --- | --- |
| 治理卡源面 | warning 左边线 + 治理徽标 | 按钮 hover；focus ring | 选项选中 `--selected` | submitting 按钮禁用；queued 无动作 | `finalNote` danger/中性；失效定格 |
| 治理卡镜像 | ring 左边线 + 镜像徽标/来源行 | 同上 | 同上 | 同上 | 同上；不自动滚动/聚焦 |
| 聚合行 | warning 文本 + Clock | — | — | 无 queued 隐藏 | 不显示 0；清理即移除 |
| 治理预览 | closed | trigger hover/focus | open `aria-expanded` | loading/busy 禁用确认 | blockers/phase 错误如实 |
| 报告卡 | 预览/事实 | details/按钮 hover+ring | details open 保持 | persistence pending；retry 禁用 | failed/unknown/expired 矩阵 |
| delivery 批次 | 批头 + 三列事实 | 重试/来源按钮 ring | 收据更新原位 | 保存历史 pending | 未回执「未确认」；不假全收齐 |
| 菜单项 | 名称+状态 | hover/active descendant | selected Check+前景 | disabled 不打开 | 缺配 warning；未知 text-3 |

### 7.4 键盘与焦点

- 治理卡：原生 radio/checkbox + 按钮；开卡不改焦点；提交后焦点移提交面 finalNote；镜像面不抢焦点；Esc 不关闭卡（卡不是模态）。
- 治理预览：打开焦点到面板标题；Tab 顺序进入模型/字段/动作；无陷阱；Esc 关闭回触发；确认/失败焦点到结果；`aria-live` 只播报一次。
- 聚合行：不可聚焦；`role=status`；不打断阅读。
- 报告：details summary/来源文档/重试按钮 Tab；展开保持焦点；重试 pending 保留焦点；报告卡不是模态。
- 菜单：↑↓/Home/End/Enter/Space/Esc/Tab 既有；状态文本不可聚焦；`aria-activedescendant` 不含状态。
- 不因镜像/聚合/报告更新自动切角色、开抽屉、滚聊天；源面按既有滚动策略。

### 7.5 动效与 960/200%

- 治理预览 120ms opacity（可选），不做高度/位移动画；无 backdrop；`prefers-reduced-motion` 直接呈现。
- 治理卡/报告卡/聚合行/镜像到达：**零入场动画、零 pulse**；热路径零动画；报告 details 展开瞬时。
- 960：治理预览/报告卡宽度 100%，facts 2→1、delivery 3→1；菜单 208 或视口内；卡片无横溢；队列子视图唯一。
- 200%：文本 reflow、按钮换行、facts 单列、路径/哈希 `overflow-wrap:anywhere`；治理预览面板内部滚动；报告 details 卡内滚动；不裁切状态/不横向滚动；不可测时记录并由 PM 接受。

## 八、与旧界面的一致性边界

### 8.1 逐字文案

| 场景 | 文案 |
| --- | --- |
| 模型状态 | 「治理模型：旧模型（su）」「治理模型：三权 · 五角色」「当前流程：…」「等待客户决定/进行中/阻塞/已升级客户」 |
| 迁移 | 「本项目使用旧治理模型（su）。可升级为三权模型。」「查看差异 / 升级」「升级入口待本版后续」 |
| 治理卡 | 「治理决定 · 客户最终批准」「需求确认 · 客户」「镜像 · 主入口」「来自 <角色> 的治理决定 · 客户最终批准」「等待前一个决定」「还有 N 个决定等待前一个决定」 |
| 建立 | 「建立治理记录（预览）」「治理模型（建立时写入 .ans）：」「单模型（single）」「三权（trio）」「将写入的治理模型：…」「不扩大任何角色写边界、不修改任何角色边界文件内容。」 |
| 重新接受 | 「重新接受治理边界（预览）」「将写入：.ans/project.json、docs/bootstrap-manifest.md」「将重算这 N 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。」「确认接受」 |
| 迁移预览 | 「升级为三权治理模型（预览）」「将写入 .ans 字段：…」「pin 变更：无（不重算 pin）」「预览摘要（前 8 位）：…」「确认升级」 |
| 报告 | 「任务报告」「报告声明：已完成」「报告状态：…」「报告原文摘录」「查看完整报告摘要与证据」「报告存储」「独立验收」「尚未确认」「以上为报告或终态记录，不等于独立验收通过。」「查看来源角色文档」 |
| 投递 | 「回交投递 · 本批 N 份（不表示全部收齐）」「接收历史」「目标输入记录」「目标轮次结果」「已保存」「尚未保存」「未启用历史保存」「未确认」「已完成/失败/已中止/运行超时/可能已开始，结果未确认/尚未交给Provider」 |
| 重试 | 「重试保存报告」「重试保存历史」「补存已有记录，不再次执行或投递。」 |

### 8.2 不新造能力

- 预览零写入；确认才写；不自动接受/迁移/建立；不在预览时改文件。
- 镜像不是第二张审批；同一 request id 只答一次；不新增审批入口/批量批准。
- 聚合只显示数量；不合并/重排/撤回/代答/展开请求内容。
- 报告只呈现事实；不根据助手正文/工具 stdout 造报告；不把报告声明当独立验收；不把 persistence saved 说成验收/投递全部收齐。
- delivery 不伪造全部收齐；无 receipt 一律「未确认」；不重复执行/投递。
- 不自动读文档/不扩大 source 文档范围；不新增 API/文件权限/状态库/持久化；不写 localStorage。
- 不缺配/未授权却说成功；不把「已保存」说成「已连接/已验证」；不把「已入队」说成「已执行」。

## 九、可检查证据与原型

**本轮不新增静态原型**：4B 主要复用既有 operator 卡、报告卡和旧的非模态治理预览结构，旧实现/测试/截图足以检查层级与文案；新增的 Nova 视觉规则以本附录的尺寸/令牌/状态矩阵为准。若 PM 要求，可在 4B 实施后按本附录补一张治理卡/报告卡静态原型，不改变本设计。

旧证据（只读）：

- 治理/镜像/聚合实现：[`app/renderer/renderer.js`](../../../../app/renderer/renderer.js) 治理段（`opRequests`/`surfaces`/`mirrorRoleId`/`queue aggregate`）、报告段（`reportBody`/`persistence`/`delivery`）。
- 文案单一来源：[`app/renderer/ui-labels.js`](../../../../app/renderer/ui-labels.js)（治理模型/预览/失败/报告/镜像/聚合逐字）。
- 旧报告/投递层级截图（浅色旧版，仅看层级/文案）：[delivery-note-1360.png](../../../桌面UI/docs/fix/2026-10-15-delivery-note-ui-evidence/delivery-note-1360.png)、[visual-v2-received-1360.png](../../../桌面UI/docs/fix/2026-10-15-delivery-batch-facts-evidence/visual-v2-received-1360.png)、[native-final-target-report-1360.png](../../../测试/docs/change/2026-10-15-visual-v2-implementation-evidence/native-final-target-report-1360.png)。
- 4A 深色报告卡/队列子视图（Nova 基线）：[1360-sidebar-badge.png](../../../桌面UI/docs/change/2026-10-21-phase4a-evidence/phase4a-smoke/1360-sidebar-badge.png)、[1360-queue.png](../../../桌面UI/docs/change/2026-10-21-phase4a-evidence/phase4a-smoke/1360-queue.png)。
- 行为测试：[`uiux-v2.mjs`](../../../../test/桌面应用/e2e/uiux-v2.mjs) `mirrorChecks/queueViewChecks`（源面/镜像同 id、只答一次、聚合计数/清理/不复活）；[治理三权独立验证](../../../测试/docs/fix/2026-10-17_verify_governance-trio.md) UI/迁移用例；[治理判断卡验证](../../../测试/docs/fix/2026-10-18_verify_governance-judge-cards.md) 一次性警告/结果行。
- 治理预览无旧截图：其结构/文案以旧 `renderer.js` 与 `ui-labels.js` 为准；本附录补 Nova 尺寸/焦点/禁用/失败规则。

## 十、4B 必须项与可随 Phase 5

### 10.1 4B 必须

1. **治理模型/状态/迁移**：model known/single/trio/unknown；状态行与流程四态；single 迁移条/入口；模型未知不猜；single 警告刷新；不写持久化。
2. **治理卡/镜像/聚合**：源面/镜像面同 request id；镜像徽标/来源行；任一侧只答一次并双面冻结；queued 不物化卡；`#chat .op-queue-aggregate` 文案/计数/去重/清理；`queuedDebug`；跨视图不复活；single 无聚合。
3. **治理记录预览**：建立（模型选择/写入/pin/采纳/旧格式/声明/未知模型禁用）、重新接受（逐文件/pin/blockers/失败阶段）、迁移（模型/字段/manifest/pin/保留/摘要/零写入）；非模态、无陷阱、Esc/焦点/aria；确认禁用条件；失败不假成功。
4. **报告/持久化/投递**：报告分层/完整摘要/证据/flags；persistence 全状态/重试/焦点；delivery 批次事实/回执/未收齐语义；source 文档按钮；不假完整/已持久化。
5. **菜单配置状态**：按需读取/缓存、不导入预取；菜单 208 两行；状态文字/未知/检查中；缺配仍可选；不 layout shift。
6. **queueView tab 切换**：任何顶层 tab 清空 queueView，显示基础视图；抽屉保持打开、标题/焦点正确；`#right-queue-body` 唯一。
7. **组件/状态/焦点/动效/960/200**：无新 shadcn 原语；3 个项目组合组件登记台账；2px/3px ring；热路径零动画；960/200 无横溢、无裁切；不引第二套库。
8. **一致性/证据**：§八逐字；不新造能力；1360/960/200 截图与 mirror/queue/preview/report 测试；4B 不宣称 Phase 5 完成。

### 10.2 可随 Phase 5

- 全量双端逐 check、`main.mjs` 整机自检、生产入口切换、打包/安装包/Windows/DPI/屏读、真实模型/网络/`.env` 写入、最终验收。
- C2 检查重锚/退役、judge 跨引擎历史重放的完整测试（4B 行为必须，证据可按 4B/5 边界）、`replayAnchorDebug` 的完整驱动证据。
- 极端窗口/更细的 200% 排版微调；真实屏读/键盘全链路；长报告/大证据的性能细化。
- 4B 不改变 Phase 5 的发布/安装/全量等价声明。

### 10.3 开放问题

1. 治理预览打开后焦点放面板标题还是触发按钮（本附录选标题+Tab 进入，非模态无陷阱）。
2. 菜单宽度 208px 是否接受（旧 180；状态两行需要空间；960 可收缩）。
3. 报告完整摘要 details 的最大高度（建议 `min(50vh, 420px)`，按实际长文调）。
4. 镜像来源行角色名使用 `roleDisplayName`（含「报告员 / Rapporteur」）是否与产品文案一致。
5. 4B 是否把「治理记录/报告」做成独立静态原型；本附录先引用旧证据，若 PM 要求再补。
6. 200% 证据是否只做治理预览/报告卡/菜单三面（建议 settings/profile 外再补这三面）。
