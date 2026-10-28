# 变更记录：entry-role-minimal 批次 A（测试；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → 第三轮窄修提交（SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动：A 写集测试重写（`test/门禁引擎/{governance-trio,list-project,liaison-role}.test.ts`、`test/桌面UI/{role-view,judge,i18n-b1-b2}.test.ts`、`test/项目管理/shared/i18n.test.ts`、`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`、`test/测试/t9-block1-bootstrap.test.ts`、`test/桌面应用/genesis-bootstrap.test.ts`）；按 amendment-1 对断言旧角色集的既有测试做最小断言同步（门禁引擎 7 文件、liaison-verify 组、governance-e2e-auto 7 文件、c-migration）。断言数：`liaison-role.test.ts` **93→96**（test() 9→13），`governance-trio.test.ts` 472→489（含 R1 卡文本一致性断言），其余见 change-package §3.3。
- 验证（最终候选）：全量 `node --test --test-concurrency=1`（排除 write-sequencing）tests **4499** / pass **4463** / fail **17** / skip **19**（`/tmp/final3-tests.log`，`55efc765…`）；17 = 9 symlink + 6 稳定基线断言红 + 2 条 `acceptance-dispatch` 环境/时序敏感项；**新增确定性失败 = 0、新增 skip = 0、无断言弱化**。
- R4（证据稳定性）：`test/桌面应用/acceptance-dispatch.test.ts` 在最终候选上单独运行 3 次，登记：
  - run1：`142/143` fail `gate 报告不可读（R2b）`（日志 `/tmp/a3-ad-run1.log`，`2762fe52…`）
  - run2：`143/143` pass（`/tmp/a3-ad-run2.log`，`364edd52…`）
  - run3：`142/143` fail `gate 路由记录写失败`（S1 既红 7756；`/tmp/a3-ad-run3.log`，`cc99f6e8…`）
  - 分类：环境/时序敏感 flake（失败项逐轮不同；该文件不在本批改动），不作为稳定全绿证据；发布前 gate 需 clean 运行。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；逆序 `git revert` 本批提交。
