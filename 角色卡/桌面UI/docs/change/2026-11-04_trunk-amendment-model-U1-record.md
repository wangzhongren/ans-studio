# 主干/冻结与版本变更申请模型 U1（渲染 UI）实施记录

- **任务 / flowId / 档位**：`2026-11-04-trunk-amendment-model` / `trunk-amendment-model` / **T3**。
- **角色 / 节点**：桌面UI（渲染层 `app/renderer/src/**`、`test/桌面UI/**`）；团队计划增量 **Batch 4 / U1**。前置：D1 桌面接线冻结（`app/desktop/version-change.ts`、`app/desktop/trunk.ts`、`preload.cjs`）+ C3 i18n 99 key 冻结。
- **状态**：**implemented, tested（渲染单测/typecheck/构建）**；未启动 Electron、未做真机截图；**未 commit/push/暂存**；未接触客户；不在本角色内评审放行。
- **一句话结论**：客户侧移除 `#run-change`（本就不存在「重构」按钮），新增「版本变更」入口/面板与收窄的「主干升级」入口；「主干与版本变更」抽屉面板展示当前主干、**F15 三类 stable 快照**、stable 确认/续接记录、冻结清单、重构只读审计与紧急/恢复区（**无 drift**）；产品/策划/运营只有**只读提交指引**（无表单、无渲→主提交 IPC）；VCA/逐项/stable 卡只按 D1 冻结通道消费，`acknowledgments` 按 C1 对象数组渲染并回传 `acknowledged: string[]`。

## 一、输入与基线（实施前实测）

| 输入 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/trunk-amendment-model` / `89b1fb2751d74c607b3a17d1b522b88061943a14` |
| P1.6 实施契约基线 | `docs/planning/2026-11-04_design_trunk-amendment-model.md` 1151 行 / SHA-256 `fccb1f54…` |
| U1 P1 提案（Rev 1） | `角色卡/桌面UI/docs/change/2026-11-04_trunk-amendment-model-P1.md` 585 行 / `6ac40ceb…` |
| PM 复审（含 F15/F17） | `角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md` 451 行 / `1a73ebc6…` |
| D1 冻结 IPC | `app/desktop/version-change.ts`（`VERSION_CHANGE_IPC_CHANNELS` + `VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS`）、`app/desktop/trunk.ts`（`TrunkStatePayloadV1`）、`app/preload.cjs` |
| C3 冻结 i18n | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`：`ui.versionChange.*` 34 / `ui.stableWrite.*` 12 / `ui.refactor.*` 14 / `ui.freeze.*` 17 / `ui.trunk.*` 22 = 99 key |
| 基线单测 | `node --test "test/桌面UI/**/*.test.ts"`：**408 tests / 407 pass / 1 fail / 0 skip**；唯一失败为 C3 已迁移的 `ui.runChange.entry` 旧标签断言（`run-change-view.test.ts`，属 U1 必删的旧按钮级用例） |
| 基线 typecheck | `npm run typecheck:renderer` exit 0 |

## 二、改动文件（候选哈希；`git hash-object` / SHA-256）

| 类别 | 文件 | blob | SHA-256 |
| --- | --- | --- | --- |
| 修改 | `app/renderer/src/shell/ChatHeader.tsx` | `cebc68a1` | `1af32cb1…` |
| 修改 | `app/renderer/src/shell/Drawer.tsx` | `c6d58307` | `ae4925f2…` |
| 修改 | `app/renderer/src/shell/phase4a.css` | `1e7c1b26` | `001b377c…` |
| 修改 | `app/renderer/src/chat/DecisionDialog.tsx` | `41ca253e` | `db96b23e…` |
| 修改 | `app/renderer/src/chat/decision-dialog.ts` | `22baf009` | `d4d9bac8…` |
| 修改 | `app/renderer/src/chat/ipc.ts` | `fa837706` | `51e8b810…` |
| 修改 | `app/renderer/src/chat/run-change-view.ts` | `3d265a5e` | `c4ec06a9…` |
| 新增 | `app/renderer/src/chat/VersionChangePanel.tsx` | `44e6c145` | `1fc75f30…` |
| 新增 | `app/renderer/src/chat/RefactorPanel.tsx` | `bd76f128` | `10a1b2af…` |
| 新增 | `app/renderer/src/chat/TrunkPanels.tsx` | `1a541d58` | `128b38c7…` |
| 新增 | `app/renderer/src/chat/version-change-view.ts` | `e54fb4ac` | `38827e09…` |
| 新增 | `app/renderer/src/chat/trunk-view.ts` | `eb394d36` | `c39fffd3…` |
| 修改 | `app/renderer/src/lib/platform.ts` | `cd6f5a44` | `360b2053…` |
| 新增 | `app/renderer/src/stores/version-change-store.ts` | `05b6bc58` | `680487da…` |
| 修改 | `app/renderer/src/stores/drawer-store.ts` | `062f8367` | `c78126c2…` |
| 修改 | `app/renderer/src/test-driver.ts`（快照 `rightTab` 联合加 `"trunk-version"`） | `2c86e92c` | `da4e88e8…` |
| 新增测试 | `test/桌面UI/version-change-view.test.ts` | `b26f3c55` | `29e56375…` |
| 新增测试 | `test/桌面UI/trunk-view.test.ts` | `25607df2` | `192540b5…` |
| 修改测试 | `test/桌面UI/run-change-view.test.ts` | `7db52394` | `c036b3f8…` |
| 修改测试 | `test/桌面UI/decision-dialog.test.ts` | `c220d050` | `0a671804…` |
| 修改测试 | `test/桌面UI/phase5a-electron-smoke.mjs` | `132c1b04` | `bf5166dc…` |
| 本记录 | `角色卡/桌面UI/docs/change/2026-11-04_trunk-amendment-model-U1-record.md` | — | — |

**写集核对**：全部改动/新增均在 `app/renderer/**` 与 `test/桌面UI/**` 内；未改 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`test/项目管理/**`、`package.json`/构建配置、角色卡/边界；`git status --porcelain -- app/renderer test/桌面UI` 仅上述文件。

## 三、实现要点（按必须实现项）

### 3.1 客户侧入口（AC-9/AC-17）

- `ChatHeader.tsx` 删除 `#run-change` 按钮、`runChangeBusy/runChangeNotice` 状态、`#run-change-notice` 结果条与 `requestRunChange` 调用；**客户侧不存在「重构」按钮**。
- 新增 `#version-change`（`ui.versionChange.entry`，待批 VCA 角标只读 D1 `trunk:state.pendingVersionChanges.count`）与 `#trunk-upgrade`（`ui.trunk.entry`）：
  - 可用性/禁用原因只读 D1 `trunk:state.disables.{versionChange,trunkUpgrade}`（null = 可用）；桥缺省 ⇒ `disabledUnavailable`；快照解析失败 ⇒ `disabledUnknown({detail})`；未收到快照时版本变更入口可打开（面板加载态），主干升级入口禁用并说明。
  - `aria-label`/`aria-disabled`/`title` 同步；点击打开抽屉 `trunk-version` 对应分段；已在该抽屉只切分段（不误关）；`#trunk-upgrade` 额外把焦点送到紧急/恢复区（`pendingFocus`，面板消费后清除）。

### 3.2 「主干与版本变更」面板（§4.10）

- `DrawerTab` 增加 `"trunk-version"`；`Drawer.tsx` 标题 `ui.trunk.panelTitle`、内容 `<TrunkPanels />`；该面板不参与按角色的滚动阅读态恢复。
- `TrunkPanels.tsx`：`role="tablist"` 三分段（版本变更/主干/重构，方向键/Home/End 切换）。
  - **版本变更分段**（`VersionChangePanel.tsx`）：待批（submitted/approved）与历史（含 draft）VCA 行；kind/status 六状态、发起者显示名、flow、targets（>3 折叠 `targetMore`）、摘要、kind 语义句、decisionId/时间、resultTrunkVersion；`openCard` 跳转决策面板；`submitted` 行可「重新发卡」（`version-change:present`，回执只显示 D1 事实：pending ⇒ `noChannel`、presented ⇒ 待确认、answered ⇒ 状态映射、失败 ⇒ 原文）；冻结清单（与主干分段共用 `FrozenDocList`）；产品/策划只读提交指引。
  - **主干分段**：当前主干版本/来源/availability/issues/pendingReattach；**stable 快照三类**（workflow / roleCards / boundaries，F15）；stable 确认/续接记录（只取 `written`，path/decisionId·confirmationId/old→new hash/时间；固定「不升主干版本」「不再显示漂移」两句）；冻结清单；升级历史（D1 未暴露历史 ⇒ 如实 `ui.trunk.history.empty`）；紧急/恢复区。
  - **重构分段**（`RefactorPanel.tsx`）：客户只读审计（五状态含 superseded、scope、reason、时间），固定 `auditOnly`/`boundaryHint`；仅运营（`governanceFunction === "schedule"`）显示只读 `submitGuidance`；**无批准/关闭按钮、无申请表单、无身份自报、无 `refactor:request` 动作（F17）**。
- **无 drift**：不渲染 drift 区块/字段/状态；源码扫描（去注释，排除 `noDrift` key 引用与既有 `version-drift` project-state blocker kind）无 drift/「漂移」字面量。

### 3.3 收窄的主干升级（仅紧急/恢复；AC-30）

- 固定文案 `ui.trunk.emergencyOnly` + `ui.trunk.upgrade.highRisk`；reason 采用 D1 冻结枚举 `emergency` / `recovery`（协议 token 原样显示）+ 必填文字原因（作为 D1 `scope` 传入，D1 预览展示）。
- `trunk:upgrade-request` 成功 ⇒ 展示 D1 `preview`（trunkVersion、changes 的 kind/path/old→new hash、expiresAt）与「已提交…请在确认中二次确认」；客户必须**显式勾选高风险**（原生 checkbox，键盘可达；不预勾选）后「再次确认执行」，才调用 `trunk:upgrade-confirm({previewId, acknowledged:true})`（同一 previewId，一次性/过期由 D1 拒绝）；取消只清空本地预览（不调用不存在的 abandon API）。
- 回执只显示「待二次确认」或主干版本事实（`ui.trunk.version`），**绝不显示「已升级/升级成功」**。
- 恢复只显示 D1 状态/说明（issues/pendingReattach/availability），不提供本地重建/解冻按钮。

### 3.4 决策卡：`acknowledgments` 与 `stable-write` token（C1/F1/F2）

- `decision-dialog.ts`：`DECISION_KINDS` 加入 app-owned `stable-write`（仅复用对话框优先级/破坏性样式，priority 2，不进判断分组/永不代选）；`DecisionView.acknowledgments` 防御读取 C1 对象数组（丢弃非对象/空 id/重复；`required` 严格 `true`）。
- `DecisionDialog.tsx`：在选项区上方渲染勾选项（原生 checkbox，`aria-required`）；**不预勾选/不默认全选**；必选项未勾选时正向提交按钮禁用；choice 回传 `acknowledged: string[]`（恰为 required id 集合，满足 D1 `respondUnsafe` 的“恰覆盖”校验）；拒绝/取消路径不受勾选限制。既有卡无 `acknowledgments` ⇒ 行为零变化。

### 3.5 数据装载（单一状态源；不轮询）

- `lib/platform.ts` 按 D1 冻结表声明可选方法：`listVersionChanges`、`presentVersionChange`、`listStableWrites`、`listRefactorRequests`、`listDocFreezes`、`listTrunks`、`requestTrunkUpgrade`、`confirmTrunkUpgrade`、`requestTrunkRefreeze`、`abandonTrunkUpgrade`、`requestTrunkRecover`、`onTrunkState`；**无** `version-change:submit` / `refactor:request` / `stable-write:request`。
- `chat/ipc.ts` 只订阅 `onTrunkState` → `version-change-store.receiveTrunkState`；项目切换 reset（不串项目）。
- `version-change-store.ts`：面板打开时经 `*-list` 拉取；`trunk:state` 到达且面板挂载时 350ms debounce 刷新列表；**不设 `setInterval`/不轮询**；动作回执原样呈现；不本地统计/判定。
- D1 冻结通道消费清单：`version-change:list/present`、`stable-write:list`、`refactor:list`、`doc-freeze:list`、`trunk:list`、`trunk:upgrade-request`、`trunk:upgrade-confirm`、`trunk:state`（主→渲单一推送）。未调用 `requestTrunkRefreeze`/`abandonTrunkUpgrade`/`requestTrunkRecover`（D1 结构化不可用或 U1 未提供入口）。

### 3.6 旧文案/测试迁移

- `ui.runChange.entry`/`ui.projectState.pinnedHint`/`main.versionDecision.error.runChangeRequired` 已由 C3 迁移；U1 删除旧按钮、旧状态、旧结果条与按钮级用例；`run-change-view.ts` 保留为低层内部/回执用途（`pinnedRunsOf`、`runChangeReplyMessage`），不再有第二按钮状态源。
- `phase5a-electron-smoke.mjs` 更新为：无 `#run-change`/`#run-change-notice`；`#version-change`/`#trunk-upgrade` 存在；桥缺省时禁用且有原因（smoke 未在本次运行，见 §六 T2）。

## 四、验证结果（U1 出口）

| 命令 | 结果 |
| --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | **432 tests / 432 pass / 0 fail / 0 skip**（基线 408；新增 24：`version-change-view.test.ts` + `trunk-view.test.ts` + `decision-dialog.test.ts` 追加；无新增 skip、无断言弱化） |
| `npm run typecheck:renderer` | **exit 0** |
| `npm run build:renderer` | **exit 0**（`app/renderer/dist/` 为忽略产物，非候选；仅既有 chunk-size/无效动态导入警告） |
| 根 `tsc --noEmit`（过滤 U1 文件） | 无 U1 文件类型错误 |
| `git status --porcelain -- app/renderer test/桌面UI` | 仅本记录 §二 列出的文件；不暂存、不 commit/push |

**证据映射（AC）**

- **AC-9/AC-17**：`ChatHeader.tsx` 无 `#run-change`/`requestRunChange`/重构入口；有 `#version-change`/`#trunk-upgrade`（源码守卫 + 单测 + smoke 更新）。
- **AC-18/AC-20/AC-23/AC-30/AC-36**：VCA/冻结/重构视图与只读指引单测；面板分段/无 drift/版本不变提示单测。
- **AC-33/AC-34/AC-36（渲染侧）**：stable 卡由 D1 用 C3 key 组装、U1 原样展示（`DecisionDialog` 通用 `<pre>`）；主干面板展示 `written` 续接记录 old→new/decisionId/时间。
- **F15**：`stableSnapshotRowsView` 输出 workflow/role-card/boundary 三类（`roleCards` 映射），单测断言顺序与 roleId。
- **F17**：`platform.ts`/store/面板无 `refactor:request` 通道或条件分支；源码守卫断言字符串不存在（去注释）；重构提交只显示只读 `submitGuidance`。
- **F10**：`VersionChangePanel`/`RefactorPanel` 无 `<form>/<input>/<textarea>/<select>`；产品/策划/运营指引仅文案；kind/target 只读事实行。
- **C1/F1**：`acknowledgments` 对象数组防御读取 + `acknowledged: string[]` 回传 + 未勾选不可提交（`DecisionDialog` 源码守卫 + 视图单测）。
- **C1/F2**：`stable-write` 入 `DECISION_KINDS`（priority 2，仅样式/优先级）；不改判断分组/委托/`@决策` 语义。

## 五、遗留（不由 U1 关闭）

| 项 | 归属/说明 |
| --- | --- |
| **T1** | 编排/门禁/桌面窗口/运行时的契约与守卫测试；U1 未运行、不声称通过。 |
| **T2** | 真实 Electron 截图（S1–S10：入口/面板/卡/无通道/迁移/fail-closed）与 `phase5a` smoke 运行；本次**未启动应用**，ACH-9/AC-20/AC-36 的“截图”证据仍缺，按 V1 如实记缺口，不以单测替代。 |
| D1 低层 `requestRunChange` preload 方法 | D1 冻结点决定保留；U1 不再展示入口（低层 API 保留，G11）。 |
| `test/桌面应用/**` 的 run-change e2e | 属 D1 写集；U1 未改，提醒 D1 同步。 |

## 六、声明

- 未改 D1 IPC/桌面/服务/Model，未新增 B-x；未发现需要停止回报的契约缺口（F17 已按 D1 冻结“无 `refactor:request`”收口）。
- 未 commit/push/暂存；未启动 Electron；未运行其它角色测试；未改角色卡/边界/communication/acceptance/scheduling。
- 本记录为 U1 实施证据，不是验收结论；T1/T2、E1/E2 与客户确认另行进行。
