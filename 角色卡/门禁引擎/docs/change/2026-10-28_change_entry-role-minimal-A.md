# 变更记录：entry-role-minimal 批次 A（门禁引擎；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → 第三轮窄修提交（SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动文件：`src/model/role.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/service/role/resolve-role.ts`；`src/service/boundary/resolve-boundary.ts` 仅类型 re-export（amendment-2 §2.1 书面授权，已落盘 110 行 / `8d5ddeb5…`）。
- 内容：六角色注册表（chief/product/rapporteur/nominator/convener/verifier；显示名幕僚/产品/策划/人事/运营/质检）；`primaryRoleId=chief`；旧 `liaison` 为编译期 + 运行期只读别名（不进入列表/UI/i18n/能力矩阵；D 删除）。按 amendment-1/A-04a + amendment-2 §2.3：product 的 Section 1/预授权承接旧 liaison 现行值 `docs/intents/`（`docs/product/` 目标写区 D 生效）；chief `forbiddenWritePaths` 恢复基线 liaison 逐字清单；R1 修正：`CHIEF_CARD_TEXT` 移除 `docs/verification/**`、`PRODUCT_CARD_TEXT` 移除 `docs/intents/**`，新增卡文本/代码一致性断言。
- 验证（最终候选）：全量 `node --test --test-concurrency=1`（排除 write-sequencing）tests **4499** / pass **4463** / fail **17** / skip **19**（日志 `/tmp/final3-tests.log`，`55efc765…`）；17 = 9 symlink + 6 稳定基线断言红 + 2 条 `test/桌面应用/acceptance-dispatch.test.ts` 环境/时序敏感项（R4：该文件 3 次单独运行 142/143、143/143、142/143，失败项分别为 R2b 与 7756）。`npm run typecheck`/`typecheck:renderer`/`build:renderer` exit 0。
- Electron（临时夹具，非仓库/目标）：`%TEMP%\ans-e2e-a2-fixture-P2wK` → 报告 `%TEMP%\ans-e2e-a2-out-Xoxa\report.txt`（`973c7d70…`），`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`BOOTSTRAP_PRIMARY=chief`；17 截图 1360x860（逐图 sha256 见 change-package §六）。
- 证据：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；独立验收 v1/v2 报告（`7cd3dfbf…`/`4225d89d…`）。
- 回滚：按逆序 `git revert` 本批提交至 `8fc673e`，无数据/schema 迁移；旧账本/flow 未写入。
