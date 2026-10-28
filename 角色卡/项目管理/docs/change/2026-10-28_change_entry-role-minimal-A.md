# 变更记录：entry-role-minimal 批次 A（项目管理；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → 第三轮窄修提交（SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动文件：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts`。
- 内容：新增 `ui.role.governance.chief/product.*`、`ui.governance.roleIntro.chief/product`、`ui.judge.roleName.chief/product`；删除 liaison 对应 key；flow/triage/gate/ledger 旧 key 留 D；i18n 总 key 1395→1399、ui 792→796，测试计数同步。
- 验证（最终候选）：`npm run typecheck`/`typecheck:renderer`/`build:renderer` exit 0；i18n/渲染定向测试通过；全量 tests 4499 / pass 4463 / fail 17 / skip 19（`/tmp/final3-tests.log`，`55efc765…`）；中英 parity/占位符/英文泄漏守卫通过。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；逆序 `git revert` 本批提交。
