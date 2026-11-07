# product-code 工作备忘录

私有续接线索；不是角色定义、任务状态或全项目规则，也不扩大写权。

## 2026-11-07 — E1 greenfield：product 角色模块

**状态**：已交付（implemented，未提交；等待 E1 接口评审与独立验收）。工作树
`.claude/worktrees/trunk-amendment`（并行角色共用同一工作树，勿触碰他人未跟踪文件）。

**已核实事实**

- 契约 E0.3 已核对：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`
  685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`。
- 模块唯一入口 `src/common/roles/product/index.ts` 导出 `productRoleModule: BuiltInRoleModule`；
  内部实现全在 `internal/`（card/capabilities/tools/dispatch/preflight/context）。
- `tools()`：trio 仅 `submitVersionChange`；single 空表；未知模型空表 + `role-tools-model-unknown`。
  D1 装配表仍是门禁引擎私有 `role-tool-registry.ts`（模块不 import、不复制）。
- `dispatch()`：与 nominator 模块同口径的**双向**硬身份——目标=product 且来源 chief 才允许并返回
  `reportToRoleId:"chief"`；来源=product 一律 `unknown-source`；非 product 目标
  `dispatch-not-in-module-scope`。与旧 `evaluateDispatchAuthorization` 的差异：D-DISP-1（targetExists
  更严）、D-DISP-2（product+project 类别冲突拒绝）、D-DISP-3（非本模块目标）。
- `preflight`：只覆盖 `version-upgrade`；事实键 `initiatorRoleId/kind/operationId/baseTrunk/bootstrap/
  targets`（+ 必须缺席的 `amendmentId/amendmentDocPath/amendmentItems`）；未登记键也 deny（D-PRE-2）；
  空 targets/畸形 base 形状提前拒绝（D-PRE-1）。Service 的 hash/结构/权限/base 全等仍为最终校验。
- `context()`：4 个静态 section（product-duty/product-intent/product-version-upgrade/product-report），
  无 resources（product 无角色资源文件）。
- 测试：`node --test test/roles/product/product-module.test.ts test/roles/product/product-differential.test.ts`
  → 29/29 pass；差分差异全部按编号列明、无未列明差异。
- `npx tsc --noEmit` → 0 errors（当时整仓；product 相关 0）。
- 证据：`docs/change/2026-11-07_E1_product-module-evidence.md`。

**容易踩坑**

- 旧 `PRODUCT_CARD_TEXT` 复用 6 个私有常量（DIRECT_ACTION_EVIDENCE 等）；只能逐字复制进 card.ts，
  不能 import 门禁引擎。`intentEntryContractText("product")` 必须从 shared 取（单一来源）。
- `submit_version_change` 的 baseTrunk 事实形状是 `TrunkCommitRef {version,digest}`（不是
  `TrunkVersionRef.trunkVersion`）；bootstrap 用 `baseTrunk:null + bootstrap:true`。
- `RoleToolPolicy.capabilities` 必须返回模块 spec 的**同一引用**（D10），不能展开复制。
- 并行角色也会在 `src/common/roles/` 下建模块；模块图测试只扫描 `src/common/roles/product/` 自身。

**下一步**

1. E1 接口评审：登记 `role.product.*` messageKey（shared i18n 属主）；评估六模块共用卡面纪律段是否上收
   shared（shared-code 属主）。
2. E2 单元 X-R1（product→…）：门禁引擎门面装配 `BuiltInRoleModuleMap`、删除旧内联 product 规格、
   Service/编排/桌面切换读模块并双跑差分。
3. 本轮不提交/不推送、未跑真实模型；验收结论不由本角色给出。
