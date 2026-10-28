# 变更记录：entry-role-minimal 批次 A（门禁引擎）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（角色集与注册表，身份层）｜档位：T3
- 基线：main `8fc673e`；候选：`feat/entry-role-minimal`，首提交 `f4aa073a` + rework 提交（见 change-package）。
- 改动文件：`src/model/role.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/service/role/resolve-role.ts`；`src/service/boundary/resolve-boundary.ts` 仅类型 re-export（amendment-2 待落盘授权）。
- 内容：六角色注册表（chief/product/rapporteur/nominator/convener/verifier；显示名幕僚/产品/策划/人事/运营/质检）；`primaryRoleId=chief`；旧 `liaison` 仅保留只读别名（不进入列表/UI/i18n）；按 amendment-1/A-04a **写区/能力保持旧值**，product 为 A 批身份占位（Section 1/预授权为空，`docs/product/` 在 D 生效）。
- 验证：`npm run typecheck` exit 0；全量 `node --test` tests 4499 / pass 4465 / fail 15 / skip 19（15 红 = S1 基线 9 symlink + 6 断言既红；无新增确定性失败/新增 skip）；Electron 临时夹具 `E2E_PASS=true`（`BOOTSTRAP_PRIMARY=chief`）。
- 证据：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；独立验收 `docs/acceptance/entry-role-minimal-a-acceptance-report-v1.md`（rework → 本返工处置 F1–F7）。
- 回滚：`git revert` A 批提交（f4aa073 + rework），无数据/schema 迁移；旧账本/flow 未写入。
