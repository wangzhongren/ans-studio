# E1 greenfield：product 角色模块（变更证据）

- 日期：2026-11-07
- 角色：product-code（开发侧 worker；E1）
- 工作树/分支：`.claude/worktrees/trunk-amendment` / `feat/plan-escalation-card`（HEAD `e71501c`）
- 任务：E1 greenfield 开发 product 角色模块（团队计划 §4.4②/§7.4；B1 §3.3 E1.1–E1.7）
- 冻结契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`
  （写盘前核对：685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）
- 状态：**implemented，未提交/未推送、未跑真实模型、未判验收**。旧引擎在 E2 切换前仍是权威 oracle。

## 1. 改了什么（位置 → 变更）

| 位置 | 变更 |
| --- | --- |
| `src/common/roles/product/index.ts` | 新增唯一 public entry：导出 `productRoleModule: BuiltInRoleModule`（冻结） |
| `src/common/roles/product/internal/card.ts` | 新增 product 卡文本/Section 1 条目/预授权/禁写（旧规格逐字迁移；intent 契约从 shared 取） |
| `src/common/roles/product/internal/capabilities.ts` | 新增 `capabilities`（D10 唯一真源）与 `cards=[]`（D8） |
| `src/common/roles/product/internal/tools.ts` | 新增 `tools()`：trio 仅 `submitVersionChange`；single 空表；未知模型 fail-closed |
| `src/common/roles/product/internal/dispatch.ts` | 新增 `dispatch()`：R-2 硬身份/存在性 + 报告期望（目标=product、来源=chief） |
| `src/common/roles/product/internal/preflight.ts` | 新增 `preflight`：仅 `version-upgrade`；事实键/错误码/fail-closed |
| `src/common/roles/product/internal/context.ts` | 新增 `context()`：4 个静态提示块（产品上下文/报告期望） |
| `test/roles/product/product-module.test.ts` | 新增 21 个单测（规格/tools/dispatch/preflight/context/模块图/纯度） |
| `test/roles/product/product-differential.test.ts` | 新增 8 个差分测试（旧 oracle 逐字段/正面与已列明差异） |
| `test/roles/product/fixtures/product-differential-fixtures.ts` | 新增差分夹具（派发 13、preflight 16、非覆盖动作 9） |

范围：只新增上述文件与 `角色卡/product-code/**` 文档；**未修改**旧引擎（`governance-roles.ts`/
`run-role.ts`/`apply-journal.ts`/`version-change`/`trunk`）、`src/model/`、`src/common/shared/`、门控或
其他角色模块。旧代码冻结（B1 E1.3），新逻辑只进新模块。

## 2. API 摘要（详见 `api-spec.md`）

- 数据：`id="product"` / `displayName="产品"` / `function="product"`；`card`（text/entries/
  preauthorizedDirs/forbiddenWritePaths）；`capabilities`（7 字段，`shell="operator-approve"`）；
  `cards=[]`。
- `tools()`：trio → `["submitVersionChange"]`；single → `[]`；未知模型 → `[]` +
  `role-tools-model-unknown`。`capabilities` 返回与 spec 同一引用（D10）。
- `dispatch()`：目标=product 且来源=chief、内置、存在 → allow + `reportToRoleId="chief"`；来源=product
  → `unknown-source`；非 product 目标 → `dispatch-not-in-module-scope`；其余按硬身份/存在性 deny。
- `preflight`：仅 `version-upgrade`；事实键 `initiatorRoleId/kind/operationId/baseTrunk/bootstrap/
  targets`（+ 必须缺席的 `amendmentId/amendmentDocPath/amendmentItems`）；缺键/未知键/类型不符/
  bootstrap 配对/形状/修正案引用 → 对应稳定码 deny。
- `context()`：`product-duty` / `product-intent` / `product-version-upgrade` / `product-report`。

## 3. 差分结果（旧 oracle vs 模块）

测试专用只读 oracle（已在该测试文件头注明）：`governance-roles.ts`（旧 product 规格）、
`role-tool-registry.ts`（D1 装配表）、`workflow-preconditions.ts`（旧硬授权谓词/报告目标）、
`run-role.ts` 私有 `TRIO_CARD_KINDS` 的源码文本（D8 卡种）。生产模块零引擎 import。

| 差分面 | 结果 |
| --- | --- |
| 规格数据（id/displayName/function/card.text/card.entries/preauthorizedDirs/forbiddenWritePaths/capabilities） | **差异=0**（逐字段 deep-equal 旧 `governanceRoleOf("product")`） |
| `cards`（D8） | **差异=0**（从 `run-role.ts` 源码提取 `TRIO_CARD_KINDS.product` = `[]`，与模块 `[]` 一致） |
| `tools()`（trio） | **差异=0**（旧注入门控 product→`submitVersionChange`；D1 装配表整单放行、映射 `submit_version_change`） |
| `tools()`（D1 越权矩阵） | product 对 13 个未授权 catalog id 全部整单拒绝（`role-tool-not-allowed`，不注入） |
| `dispatch()`（13 夹具） | 8 个零差异；5 个已列明差异：**D-DISP-1**（chief→product 的 `targetExists` 更严，2 例）、**D-DISP-2**（product+project 类别冲突，1 例）、**D-DISP-3**（非 product 目标由其他模块/引擎回答，2 例） |
| `preflight`（16 夹具） | 13 个零差异（与旧 VCA/trunk 角色侧条件镜像）；3 个已列明差异：**D-PRE-1**（空 targets/畸形 base 形状提前拒绝，2 例）、**D-PRE-2**（未登记事实键 deny，1 例） |

差异编号与理由同时登记在夹具注释、`api-spec.md` §3/§4.3 与差分测试断言中；**无未列明差异**。
旧 oracle 的 hash/结构/权限/base 全等/版本链校验未复制进 preflight（仍由 Service 最终执行）。

## 4. 测试与静态检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 模块单测 | `node --test test/roles/product/product-module.test.ts` | 21/21 pass |
| 差分测试 | `node --test test/roles/product/product-differential.test.ts` | 8/8 pass |
| 合并 | `node --test test/roles/product/product-module.test.ts test/roles/product/product-differential.test.ts` | **29/29 pass**（fail 0 / skip 0 / todo 0） |
| 契约回归 | `node --test test/门禁引擎/role-module-contract.test.ts` | 14/14 pass |
| 类型检查 | `npx tsc --noEmit` | **0 errors**（当时整仓；product 相关 0） |
| 模块图/import | 单测内静态扫描 + 独立 grep | 根目录仅 `index.ts` + `internal/`；import 仅 `Model`（`boundary.ts`/`role.ts`）、shared（`intent-entry-contract.ts`）与内部 `./` 边；零引擎/门控/Pipeline/Service/Provider/app/跨角色 import；无 `node:` |
| 纯度 | 单测内静态扫描 | 模块源码无 `readFile/writeFile/readdir/stat/Date.now/new Date/Math.random/process./require/import()/fetch` |

import 证据（独立 grep，生产模块）：
`../../../../model/boundary.ts` ×1、`../../../../model/role.ts` ×6、`../../../model/role.ts` ×1、
`../../../shared/intent-entry-contract.ts` ×1、内部 `./*.ts` ×7。其它命中的“门禁引擎/pipeline”等仅出现在
注释（迁移/oracle 说明），不是 import 边。

## 5. 写集扫描与候选哈希

本角色写入仅限 Section 1：`src/common/roles/product/`、`test/roles/product/`、`角色卡/product-code/**`。
本角色未触碰旧引擎/Model/shared/门控/其他角色文件；未提交/推送；未跑真实模型。工作树同时有并行角色
的未跟踪模块与 B0 既有脏基线（契约 §7.1），不属于本次证据。

候选清单（10 文件 / 1856 行 / 81,451 bytes；`find … | sort` 后逐文件 `sha256sum`，再对
“hash + 两空格 + path”清单求 SHA-256）：

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/product/index.ts` | 40 | `9871fba9180de450aef0f98ede488eca4a0a94db57f8d0f3dcb2021e4df84ac2` |
| `src/common/roles/product/internal/capabilities.ts` | 28 | `9691b9e5a495bc79e8dd02fa2870ffdb1853ae1a3e7a33c295e32b85bb410e80` |
| `src/common/roles/product/internal/card.ts` | 100 | `9b5b625b57d60f00a3627afa4630333b0e8481a2acf134a360cdf7e3c7a193d2` |
| `src/common/roles/product/internal/context.ts` | 33 | `50d6adbd0dab853f88b23e4819981ceb9b16d72ab7897670e554874694c020b6` |
| `src/common/roles/product/internal/dispatch.ts` | 153 | `686da78521b83e8f8947f12549483bd19e3f64083f123ab3718f3208896246a5` |
| `src/common/roles/product/internal/preflight.ts` | 289 | `df4b6047e4545fd9d01efc0c0d6195d2f3fd4ab3110ce494e78cc3bbb2ce4e6d` |
| `src/common/roles/product/internal/tools.ts` | 69 | `e065297135b52eaf580ce770535684432946db7f6340f69a77c96c56f3acb413` |
| `test/roles/product/fixtures/product-differential-fixtures.ts` | 359 | `f6a652435e3a90fd3f0cccc986252fc82ad62a67514677f82e20a05ae8077e16` |
| `test/roles/product/product-differential.test.ts` | 281 | `e8d1ae195feb7698c69ab97b0fa45152b59238cd40c4564ad2cb247d4b2ab8d7` |
| `test/roles/product/product-module.test.ts` | 504 | `f8260b608e742ae911be7ce798f30f3ffbfe6837f3e59c03860c1c0dc3b0a1ae` |

**候选聚合哈希（清单 SHA-256）**：`9a6fcef3928d0df9f5b6a723e72722e5e8255f9e070fd8aa994607a5ceb241ac`。

## 6. 与 E1/B1 的对应

| B1 条目 | 本证据 |
| --- | --- |
| E1.1 只写 Section 1 写集 | §5 写集扫描；仅 10 个代码/测试文件 + 本角色文档 |
| E1.2 greenfield 新目录/新文件 | `src/common/roles/product/`、`test/roles/product/` 均为新目录 |
| E1.3 旧代码冻结 | §1 范围；旧引擎/Model/shared 零改动 |
| E1.4 唯一 public entry / 根无散放文件 | §4 模块图扫描：根仅 `index.ts` + `internal/` |
| E1.5 零跨角色/引擎 import、无环 | §4 import 扫描；单测断言 |
| E1.6 不重复/单 owner | 模块只含数据/纯策略；D1 映射仍唯一位于 `role-tool-registry.ts`；VCA/trunk 校验未复制 |
| E1.7 交付物 | 模块 + 单测 + 差分 fixture + `api-spec.md` + 本证据 + 候选哈希 |

## 7. 遗留与下一步（不阻塞 E1 交付，需接口评审/E2）

1. **i18n 键未登记**：`role.product.dispatch.*`/`role.product.preflight.*`/`role.product.tools.*` 只是
   稳定内部键；对外呈现前由 shared-code/i18n 属主登记文案（E1 接口评审）。
2. **共用卡面纪律段**：`DIRECT_*`/`ROLE_RECOVERY`/`CHIEF_HUB` 等段按契约 §3.2 随卡数据迁入各角色
   模块；六模块并行后若出现跨模块重复，应在 E1 接口评审决定是否上收 shared（shared-code 属主），
   本角色不擅自扩写集。
3. **E2 接线未做**：旧引擎仍是权威；门禁引擎门面装配 `BuiltInRoleModuleMap`、删除旧内联 product 规格、
   Service/编排/桌面切换读模块与双跑差分属 E2 单元 X-R1。
4. **真实模型未跑**：本交付为纯数据/纯函数与离线测试；未声称真机/真实模型验证。
5. 本角色不判验收，不自行派发；等待统筹/独立验收按 B1 判定。
