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

## 2026-11-10 — T3 B2：两条固定工作流路径（product 批次）

**状态**：已交付（implemented，未提交；等待 D1/B2 独立验收）。分支 `feat/two-fixed-workflow-paths`，
基线 HEAD `f72bafa`（+ 门禁引擎 B2 工作树；六角色 code B2 并行写同一工作树）。

**已核实事实**

- 冻结依据 hash 实测：B1 `b607f100…`（criteria v1）、G-IR `08e01726…`（接口评审）、v1.3 `ae737dcf…`。
- 模块新增 `fixedCards: []`（MF-IR-4；只在 `matrix:"two-fixed-paths/v1"` 消费）。
- `context(input)`：缺省/`legacy-v1` 返回旧 4 段**同一引用**（逐字冻结）；fixed 返回 3 段
  （`product-fixed-duty/boundary/report`）：按运营派发写意图、不派发/不实现/不自行改方案、意图确认卡由幕僚呈、
  报告回 convener。
- `dispatch(input)`：legacy 分支逐字保留；fixed 分支 convener→product（内置、存在）allow（report=convener），
  chief→product deny fixed-only 码 `chief-production-dispatch-forbidden`
  （messageKey `role.product.dispatch.chiefProductionForbidden`）；exists=false ⇒ target-card-missing；
  内置 id 声明 project ⇒ dispatch-input-invalid。
- tools/preflight/cards/capabilities 均未改（不新增工具/卡；fixed 不注入 VCA 由编排/运行时过滤，不在模块内改）。
- 测试：`test/roles/product/` 29 旧 + 10 新 = 39/39 pass（0 skip）。

**容易踩坑**

- 六角色 B2 并行写同一工作树：只碰 `src/common/roles/product/**`、`test/roles/product/**`、本角色记录；
  其他角色的脏文件不属于本批证据。
- fixed 分支必须先过与 legacy 相同的输入形状校验，再按 `matrix` 分支；不要重排 legacy 分支顺序/码。
- `fixedCards` 必须与 `cards` 分开（fixed 不从 legacy 过滤）；gate 引擎 `cardKindsOf(fixed)` 只读该字段。

**下一步**

1. 门禁引擎/编排消费方：`run-role` 应改调门面 `cardKindsOf(id, matrix)`；fixed 会话注入
   `context({matrix:"two-fixed-paths/v1"})`（编排 B2）。
2. B2 独立验收按 AC-24/T-13 复核；本角色不判验收、不派发、不提交/推送。

