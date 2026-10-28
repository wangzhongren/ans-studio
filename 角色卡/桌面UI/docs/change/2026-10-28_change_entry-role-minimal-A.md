# 变更记录：entry-role-minimal 批次 A（桌面UI；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → `ae702eb`（第三轮窄修）→ `b1addff`（C4 E2E 说明）→ C5（本文件最终版，SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动文件：`app/renderer/src/chat/role-view.ts`、`judge.ts`、`governance-view.ts`。
- 内容：治理职能映射改六角色（chief/product 新增，liaison 删除）；roleIntro 与 shell 确认标题映射同步；中英文角色 key 见项目管理记录。
- 验证（最终候选）：`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0；`test/桌面UI/{role-view,judge,i18n-b1-b2}.test.ts` 通过；`rg liaison app/renderer` 零命中；全量 tests 4500 / pass 4465 / fail 16 / skip 19（`/tmp/ab-clean-tests.log`，`4af9cadd…`）。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；逆序 `git revert` 本批提交。
