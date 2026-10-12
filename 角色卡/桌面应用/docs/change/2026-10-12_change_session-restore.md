---
id: session-restore
type: change
title: 重启恢复（D-1 桌面面）：项目内会话记录的界面回放 + 徽标「空闲（已恢复）」
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [markdown-history-status]
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 设计稿 D-1（存储＝项目内 `<projectRoot>/.ans/sessions/<roleId>/`）实施桌面侧——主进程只读解析 JSONL 并推规范化行；渲染侧回放 + 徽标态
  - date: "2026-10-12"
    kind: implemented
    summary: 新增 app/desktop/session-history.ts（pure+只读 fs：最近文件挑选/防御式解析/读角色历史）；main.ts 在 list-project 后逐角色推 session:history；preload 加 onSessionHistory；renderer 回放（分隔提示 + is-replay + Markdown）+ role-status 增 idle-restored；selectRole 的「已重启」提示与恢复态区分
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 99 计/98 过/1 红（唯一红为既有环境红）；全量 742 计/739 过/2 红/1 skipped（两红均既有环境红，非本改动）；e2e 已同步（7b RESTORE_* drill），本轮未跑
---

# 重启恢复（D-1 的桌面面）

**来源**：pm 设计稿 D-1（客户已定：存储＝**项目内**；契约钉死 `<projectRoot>/.ans/sessions/<roleId>/`，Pi 的
JSONL——首行 header、其余每行一 entry；「目录内有最近会话就恢复」由 **Pi适配器**负责、**编排**把目录传给
适配器）。**桌面侧**本轮：把该目录里的记录**只读回放**到界面，让「关掉再开」后历史可见。

> **状态：已实施、已验证（2026-10-12）。** 实施面：`app/desktop/session-history.ts`（新）、`app/main.ts`、
> `app/preload.cjs`、`app/renderer/{renderer.js,role-status.js,styles.css}`、`test/桌面应用/**`、本页。
> e2e 已同步 `RESTORE_*` drill，**本轮未跑**——真机端到端（关掉应用重开，记录与上下文都在）属「客户跑」。

## 用户会看到什么

导入/重载项目后，凡 `<project>/.ans/sessions/<角色>/` 里有会话记录的角色：

- 点开该角色 → 其聊天流里**先出现一条虚线分隔 + 提示**「**会话已恢复（模型上下文一并恢复）**」，随后**回放**
  历史行（你的消息 / 助手的回答 / 工具调用与结果；`is-replay` 标记使其与实时行视觉可区分，助手文本同走
  **Markdown 受控渲染**——esc 单一来源）；继续对话 → 会话由恢复链路续上，回放段之上提示
  「**已续接恢复的会话**」。
- 左树徽标：恢复出来、句柄未开的角色显示「**空闲（已恢复）**」（空心绿点）——**不假装**「工作中/未开启」。
- 记录坏了：如实显示「**会话记录读取失败，未回放：…**」——**不崩、不静默**；没记录的角色照常（无提示、无打扰）。

## 改在哪（文件 → 改动）

- **`app/desktop/session-history.ts`（新增；纯逻辑 + 只读 fs，不依赖 electron、不依赖 Pi SDK）**：
  `pickLatestSessionFile`（mtime 大者优先、并列取名字大者——确定性）；`parseSessionJsonl`（首行 header 校验；
  每行**防御式** JSON.parse——坏行/认不出的 entry/未知 role **跳过不抛**并计入 `skipped`；header 不合法 →
  整体失败）；`rowsFromEntry` 把 entry 规范化为 `{kind: user|assistant|tool|denied, text, at}`
  （assistant 的 `toolCall` 块→「调用工具 X」；`toolResult.isError`→`denied` 行）；
  `readRoleSessionHistory`（**目录不存在＝无历史、不是失败**；只读 `<sessions>/<roleId>/` **自己的**目录——
  跨角色不串；读失败/坏文件 → `ok:false + error`，不抛）。
- **`app/main.ts`**：`app:list-project` 处理器改为「枚举后逐角色读取历史 → 推 `session:history`」
  （`{roleId, projectRoot, rows, error}`；**无内容不推**；解析失败**不阻断导入**）。**渲染进程不碰 Pi
  SDK/JSONL——解析在主进程**。
- **`app/preload.cjs`**：新增 `onSessionHistory(cb)` 白名单订阅（无 Node 暴露）。
- **`app/renderer/renderer.js`**：订阅 + `replayHistory`（分隔提示行 + 逐行回放；**未就绪/切换项目的推送先寄存**，
  `applyListing(fresh)` 重置 pane 后 `flushPendingHistories()` 冲洗——不串项目）；回放行经
  `Md.renderMarkdown`（assistant/user）/`esc`（tool/denied）；`title` 挂「恢复自：<时间>」；
  **selectRole 的提示分流**：历史来自**本次恢复** ⇒「已续接恢复的会话」；否则沿用 B-2「模型上下文已重启」。
- **`app/renderer/role-status.js`**：新状态 `idle-restored`「空闲（已恢复）」（纯函数映射：错误 > 等待你确认 >
  工作中 > 保活⇒空闲 > 有过会话⇒已停止 > **有恢复记录⇒空闲（已恢复）** > 未开启）；`styles.css` 加空心绿点。
- **测试**：新增 `test/桌面应用/session-history.test.ts`（4 例：目录契约+解析规范化；防御式坏行/未知 entry/
  坏 header；最近文件挑选（含并列）；读角色历史——无目录/最近文件/**跨角色不串**/坏文件不抛）。
  `renderer.test.ts`：B-3 断言扩到七态（含 `idle-restored` 判据与优先级）+ 新增 D-1 组（通道两端、回放/分隔/
  is-replay/失败提示、`STYLES` 样式钩子）。`e2e/main.mjs`：新增 7b `RESTORE_*` drill（两角色夹具 → 各自 pane
  回放 + Markdown 渲染 + `st-restored` 徽标 + **跨角色不串**断言）。

## 已知互涉（如实登记）

- **B-2 的「模型上下文已重启」提示 vs D-1 持久化**：持久化落地后，**dispose/LRU 淘汰并不擦除会话文件**——
  重开会话时 Pi适配器按契约「目录内有最近会话就恢复」，B-2 的「已释放/不会记得」口吻在**有会话文件**时
  可能过强。桌面**无法单方判定**（取决于编排是否把目录传给适配器、以及适配器的恢复实现）——本轮**只**把
  「本次恢复出来的历史」这一条明确区分（改说「已续接恢复的会话」）；**其余路径维持 B-2 原文案，登记待
  编排/Pi适配器确认「重开是否恢复」语义后再由桌面跟进**（未擅自发明）。

## 本轮明确不做（登记）

- **「新会话」显式入口**：现在恢复后**无法在保留历史的同时开一段干净的新会话**（点角色 = 续上恢复的会话）。
  按派工不做、如实登记——**建议另派**（这是恢复体验最明显的坑）。
- **历史裁剪**：长会话**全量回放**（渲染/内存随轮数线性增长）。当前规模可接受；何时裁剪、按钮与否交客户定
  ——**建议另派**（与「新会话」同批做最顺）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **99 计 / 98 过 / 1 红**——唯一红为**既有环境红**
  （`pi-config.test.ts` 断言检出目录名以 `ans-cli` 结尾、本机为 `ans-runtime`；**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **742 计 / 739 过 / 2 红 / 1 skipped**；两红**均既有环境红、非本改动**
  （同上 + `test/项目管理/shared/path-primitives.test.ts` 的 macOS `/var`→`/private/var`）。
- **回放证据（单测）**：解析规范化（kind 序列 + 文本 + `at`）；坏行跳过计数=3；坏 header 整体失败；无目录=
  无历史；最近文件挑选；**跨角色不串**（A/B 夹具各读各的）；坏文件 `ok:false` 不抛。
- **e2e**：`RESTORE_DIVIDER_TEXT`/`RESTORE_ROWS_PRESENT`/`RESTORE_MD_RENDERED`/`RESTORE_BADGE_IS_RESTORED`/
  `RESTORE_RESUME_NOTE`/`RESTORE_SU_OWN_TEXT`/`RESTORE_NO_CROSSTALK`——已同步，**本轮未跑**。
