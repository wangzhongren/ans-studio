# 2026-10-19 变更：会话重建写权注记加系统标记（系统通知，不是角色发言）

## 问题

客户反馈：截图中的「会话已因边界更新重建；此前经确认发行的写权不会自动保留……」注入模型输入时没有任何来源标记，看起来像角色或用户发言——「这个应该加一个标记啊，不然谁知道啊。」

该文案是 F-5-opt1 的**系统注记**（`REBUILT_SESSION_WRITE_PERMITS_NOTICE`，2026-10-16 客户批准），由桌面窗口重建路径经 `RoleSessionHandle.queueModelNotice` 排入下一轮模型输入的前缀。原文没有显式来源标记，模型可能把它当作用户消息理解，也无法一眼看出这是系统注入。

## 改动

`src/pipeline/orchestration/run-role.ts`：`REBUILT_SESSION_WRITE_PERMITS_NOTICE` 正文前加系统标记，改为：

> `【系统通知·会话重建】此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。`

- 标记 `【系统通知·会话重建】` 明确来源：系统注入的 notice，不是角色/客户发言；
- 原语义保留：「重建」「写权不会自动保留」「如需写入请重新经 request_confirmation 确认」逐项仍在；
- 常量仍是**单一来源**（`test/桌面应用/boundary-refresh.test.ts` 按引用取用，不各写一份）；
- 常量文档注释同步说明标记来源与客户反馈（2026-10-19）。

`src/pipeline/orchestration/run-role.ts:1271-1272` 的注入路径**未改动**：notice 仍作为下一次 `send()` 的输入前缀（`${notice}\n\n${text}`），送达一次即消费；不单独开轮、不触任何判定，写权/门禁语义不变（标记只是文案前缀，不是授权）。

## 测试

`test/编排/session-handle.test.ts`（F-5-opt1 两例）：

- 新增断言：`assert.match(notice, /^【系统通知·会话重建】/, ...)`——notice 必须以系统标记开头；
- 既有 `/写权不会自动保留/`、`/request_confirmation/` 断言继续满足，未放宽；
- 注入语义断言不变：`sentTexts[0] === \`${notice}\n\n客户消息一\``（前缀送达）、消费一次、未开轮失败保留。

跨角色只读核对：`test/桌面应用/boundary-refresh.test.ts` 用常量引用 + `includes("重建")`/`includes("不会自动保留")`/`includes("request_confirmation")`，"会话重建" 仍含 "重建"，断言不受影响（该文件属桌面角色，不在本角色边界，未改）。

## 验证

- `node --test "test/编排/**/*.test.ts"` → **619 计 / 619 过 / 0 红 / 0 cancelled / 0 skipped / 0 todo**（duration 2039.382ms；与上一基线 619 相同，本批只加断言不改用例数）。
- `npm run typecheck` → **exit 0**（`tsc --noEmit` 无输出；仅 npm 镜像配置既有 warning）。

## 边界与残余

- 只写 `src/pipeline/orchestration/run-role.ts`、`test/编排/session-handle.test.ts` 与本角色文档；未碰 `app/**`、其他角色文件、门禁/写权逻辑与 git 历史。
- 标记只为模型可见输入消歧，不改变 notice 的注入机制、消费时机或任何授权语义；是否在桌面 UI 行同样加标记属桌面角色，本批不涉及。
- **已知呈现差异（如实登记）**：桌面渲染层（`app/renderer/tool-rows.js::classifySystemMessage`）的系统消息归类只认 `[系统·<子类>] ` 形态。本 notice 是**客户消息的前缀**（随下一轮输入送达），不是独立系统投递；若改用 `[系统·会话重建] ` 形态，会把同一条回显里的客户正文整条归成系统 chip。因此本批采用**正文内可见标记**（`【系统通知·会话重建】`）：人/模型都能看出是系统通知，但不改变 UI 归类。若客户要求该行在 UI 上呈现为系统样式，需桌面角色把该前缀纳入归类契约（跨角色事项，本批不越界）。
