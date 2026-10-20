---
id: blank-pane-loading-placeholder-deskui
type: change
title: 后台在跑角色切过去聊天区空白——transcript 判据 + loading + 中性占位
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
related: [runtime-ui, select-role, transcript, e2e-uiux-v2]
---

# 空白聊天区修复：transcript 判据、载入 historical loading 与中性占位（桌面UI）

## 0. 现象与边界

- 真机：切到一个**正在后台跑**的角色时，聊天区大片空白，只剩底部队列/「正在工作」；几秒后历史
  才出现（实测该 pane 已有 45 行 / 48k 文本）。
- 根因：`selectRole` 用 `var hasHistory = !pane.querySelector(".chat-empty")` 判断「已有历史」。
  后台派发的 `session:role-state` 快照会先在该角色 pane 里建**队列行/「正在工作」行**（两者都会
  `ensureContent()` 移除 `.chat-empty`），于是 `hasHistory=true`、不创建 loading 行；而
  `getSessionHistory`/`replayHistory` 尚未返回 ⇒ pane 没有 transcript 内容，呈现为空白。
- 本侧改动仅 `app/renderer/renderer.js`、`app/renderer/styles.css`、
  `test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`（新增离线模式）、本记录与
  `changelog.md`、证据目录。未改 `src/**`、`app/desktop/**`、`test/测试/**`；未 git 提交。

## 1. 修法

### 1.1 transcript 判据（单一分类点）

新增 `TRANSCRIPT_ROW_KINDS = ["user", "assistant", "activities", "injected", "replay", "handback",
"operator", "tool-lifecycle"]`；`hasTranscript(roleId)` 的行表分支改用它（另保留 replayState 的
`user/assistant/tool/denied` 分支）。**队列/状态/系统行（kind `system`）不计入 transcript**。
`appendUser` 登记 `{ kind: "user" }`，实时用户气泡也计为 transcript 行（此前无 kind）。

### 1.2 loading

`selectRole` 的判据改为 `hasTranscript(roleId)`（**不再看 `.chat-empty`**）：

- 无 transcript 且 pane 已有队列/状态行 ⇒ `sys-loading`「正在载入会话历史…」；
- 无 transcript 且全新 pane ⇒ 原文案「正在开启与角色 X 的会话…」；
- loading 在历史回放完成（full 重建随 pane 一起替换）或 `openSession` 返回时移除；选择版本变化/
  项目切换的早退路径也显式移除本次 loading，不在旧 pane 残留。

### 1.3 中性占位（不留空白）

新增 `renderEmptyNote(roleId)`：仅在**当前选中**且**会话已开启**的 pane 上工作。

- 条件：无 transcript、无回放错误（`replayState.error` / `.sys-replay-divider`）、无报告
  （报告会生成 handback transcript 行，由 `hasTranscript` 覆盖）。
- 文案区分真实忙闲：`state.roleBusy === true` ⇒「会话已开启；后台正在工作，暂无可见消息」；
  空闲 ⇒「会话已开启，可直接输入消息」。类名 `sys sys-note empty-note`（中性，非错误样式）。
- 占位是 **pane 直属 DOM**（`document.createElement`，**不 `registerRow`**）——不进入行表、
  不参与回放去重/虚拟窗口/未决卡锚定；真实 transcript 行登记时（`registerRow` 检测
  `pane.dataset.emptyNote`）立即移除，防占位过期。
- 刷新点：`replayHistory` 的空历史早退、`replayHistory` 收尾（含报告/错误分支之后的最终判定）、
  `selectRole` 的 `openSession` 成功尾部。空历史早退在开会话前会先清占位（session 未开），
  开会话成功后按真实忙闲重建——不会把未开启的会话显示成已开启。

### 1.4 明确未动

历史回放去重（replayPlan/replayCounts/tokenRows）、增量/全量选择、滚动贴底与阅读位置恢复、
未决卡锚定/物化、队列行与「正在工作」行语义、`sys-loading` 在 `preserveUncoveredRows` 中的
既有排除规则均未改。

## 2. 测试与证据

### 2.1 单测

- `test/桌面应用/renderer.test.ts` 新增「空白兜底（2026-10-20）」源码守卫（+1，108/108）：
  旧 `.chat-empty` 判据退役、`hasTranscript` 判据、两种 loading 文案、占位两处刷新点、
  占位不进行表、忙/闲文案、错误态不占位、system 行不计入 transcript、transcript 行到达即清占位。
- `test/桌面应用/tool-rows.test.ts` 53/53；`test/桌面应用/runtime-ui.test.ts` 12/12。
- `node --test "test/桌面应用/**/*.test.ts"` → **662 计 / 662 过 / 0 红 / exit 0**。
- `npm run typecheck` → **exit 0**。

### 2.2 真实 Electron 离线夹具（行为面）

`test/桌面应用/e2e/uiux-v2.mjs` 新增 `ANS_BLANK_PANE_UI_ONLY=1`：

```bash
ANS_BLANK_PANE_UI_ONLY=1 ANS_UIUX_OUTDIR=/tmp/ans-blank-pane-final2 \
  ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
```

结果 **BLANK_PANE_UI_PASS 6**，覆盖：

1. 夹具前提：B pane 有队列/「正在工作」行、无 transcript、无 `.chat-empty`（后台游离 pane 经
   新增只读探针 `paneDebug(roleId)` 读取）；
2. 选择 B 时出现「正在载入会话历史…」loading（不是空白）；
3. 空历史返回后 loading 移除、出现忙碌中性占位（且队列行仍在）；
4. 历史（有 transcript）到达后占位与 loading 都移除、真实答复出现；
5. 已有 transcript 的角色再选择不再出现 loading/占位；
6. 无历史无错误且空闲 ⇒「会话已开启，可直接输入消息」中性占位，不是空白/错误。

**负向对照**：临时把判据还原为旧 `!pane.querySelector(".chat-empty")` 后，同一夹具在
「selecting background role shows history loading instead of blank」失败（exit 1）；
恢复后重新全绿——用例能真实捕获该回归。

**既有夹具回归**（同一文件既有模式，表达回放去重/滚动/未决卡锚定）：

| 模式 | 结果 |
| --- | --- |
| `ANS_TERMINAL_MERGE_UI_ONLY=1` | TERMINAL_MERGE_PASS 12 / exit 0 |
| `ANS_MERGE_UI_ONLY=1` | MERGE_UI_PASS 12 / exit 0 |
| `ANS_TERMINAL_UI_ONLY=1` | TERMINAL_PASS 22 / exit 0 |
| `ANS_DUP_UI_ONLY=1` | DUP_UI_PASS 32 / exit 0 |

证据：`docs/change/2026-10-20-blank-pane-evidence/report.json`（6 项检查全 true；运行目录
`/tmp/ans-blank-pane-final2`，隔离 user-data）。

## 3. 纪律

- 未 git 提交；未读 `.env`；未打印凭据；未修改 `src/**`、`app/desktop/**`、`test/测试/**`。
- 临时负向对照已还原（`grep TEMP-OLD-PREDICATE` 为空）。
