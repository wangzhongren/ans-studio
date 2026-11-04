# 编排 S7 记录：E2 返工（AC-5 前置校验 + AC-13 stable boundary 扩大检测 API）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；E2 返工 **S7**。
- **日期 / 状态**：2026-11-05；**S7 完成（写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **依据**：E2 报告 `docs/acceptance/trunk-amendment-model-report-v1.md`（151 行 / `c6a05025…`）§三-1/2/3、AC-5/AC-13；证据链 `version-change-runtime.ts:364-397`（applyUpgrade 直接 applyApproved）、`apply-journal.ts:280-282`（仅内容/冻结校验）、`run-manifest.ts:698-786`（re-pin 仅形状/冻结/hash）。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、AC-5（阻断）：version-upgrade 批准前/apply 前校验

**实现**：
- `src/service/trunk/impl/upgrade-validate.ts` 新增 `validateUpgradeChain(projectRoot, input)`（经 `TrunkService.validateUpgradeChain` 暴露）：
  1. **内容**：有效文档（当前 trunk documents 被 VCA targets 覆盖）逐项存在 + 磁盘 sha256 一致（不信任自报）；
  2. **schema**：proposal=`project-proposal/v2`、modules=`project-modules/v2`、architecture=`project-architecture/v1`、assets=`project-assets/v1`（frontmatter；roster 由 `parseProjectRoster` 校验 v3）；
  3. **roster**：`parseProjectRoster`（既有解析器，不复制）+ flowId 一致；
  4. **D3**：`targetRoleIds ⊆ roster.roles`（有 D3 时；无 roster ⇒ fail-closed）；
  5. **版本链**（**本次变更 roster 时强校验**）：`roster.proposal === 有效 proposal`、proposal 引用 `roster.intent`、architecture 引用 `roster.proposal`、`roster.modules ≡ parseProjectModules(modules)`、`roster.version > 当前 trunk rosterVersion`；契约文档单独升级（roster 未变）不做磁盘「最新版」强链扫描（避免误拒 P1 §4.4 单目标升级）；
  6. **role-card/boundary 完整性**：roster 每个角色 `角色卡/<id>/role-card.md` 非空、`boundary.yaml` 存在且经 `parseBoundaryYaml` 可解析。
  - 失败返回 C1 `trunk-item-invalid`（不新造码）；只读、不写盘/不冻结/不改指针。
- `version-change-runtime.ts`：
  - `approve` 在 `services.vca.approve` **之前**对 `version-upgrade` 执行校验；失败 ⇒ `vca-target-invalid`（内容 hash 漂移保留 `vca-hash-drift`），**不 approved、不冻结、不 re-pin**；
  - `applyUpgrade` 在 `trunkRuntime.applyApproved/bootstrap` **之前**重验；失败 ⇒ `vca-apply-failed`（hash 漂移 ⇒ `vca-hash-drift`），不 re-pin、trunk 指针不变。
  - 复用 `workflow-preconditions.parseProjectRoster/parseProjectModules`（roster/modules 单一语义）与门禁引擎 `boundary-yaml`（单一边界解析）；未复制第二套解析器。

**负例测试**（`test/编排/trunk-upgrade-validation.test.ts`）：
- 无效 roster（roles 非数组）⇒ `vca-target-invalid`；VCA 保持 submitted、无冻结、run manifest 未 re-pin（无 repins）、trunk v1 不变。
- D3 `targetRoleIds` 含 roster 外角色（`ghost`）⇒ `vca-target-invalid`。
- 契约版本链不匹配（目标 roster v2 引用 proposal v1 + 目标 proposal v2）⇒ `vca-target-invalid`。
- role-card 缺失 ⇒ `vca-target-invalid`（fail-closed）。
- 正例：roster 未变的单契约升级仍通过并 applied（避免误伤既有流程）。

## 二、AC-13：stable boundary 预览文本扩大检测 API

**实现**：`TrunkService.detectStableBoundaryExpansion({projectRoot, roleId, fromPath, toYamlText})` →
`{expanded, expansions[]}`：
- `fromPath`（当前 `boundary.yaml`）经 `parseBoundaryYaml` 解析；`toYamlText`（客户确认卡 preview body）经 `parseBoundaryYamlDoc` 解析；复用条目级 `expansionOf`（root/kind 覆盖：file 精确、directory 子树、conditional 仅完全相同）。
- 只读、不写盘；**预览不可解析 ⇒ fail-closed**（`expanded:true` + `to-yaml-invalid:<原因>`）；无可比较基线 ⇒ 全部新条目视为扩大。
- D2 可在 stable boundary 确认卡/acknowledgments 直接以 preview 文本调用（不改 D1/app）。

**测试**（同文件）：预览扩大（新增 `test/` 条目）⇒ true；收窄 ⇒ false；无变化 ⇒ false；不可解析 ⇒ fail-closed true。

## 三、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/pipeline/orchestration/version-change-runtime.ts` | 修改（AC-5 批准前/apply 前校验 + 错误码映射） | 715 | `571746f82ff0e69943176d2a79eed8ea518f749fa5921940661778bd29468ca4` |
| 2 | `src/service/trunk/abstract/trunk-service.ts` | 修改（AC-5/AC-13 类型与接口） | 402 | `7533725713b0567f4a503babd87abab84451b3f3ea740a9368073f171ef03c6d` |
| 3 | `src/service/trunk/impl/upgrade-validate.ts` | 新增（AC-5 校验实现） | 187 | `833afffb0c47a752f5e797c60d426a57a9ae9ff50aa9454dc582f35993cdeba8` |
| 4 | `src/service/trunk/impl/amendment-expansion.ts` | 修改（AC-13 `detectStableBoundaryExpansion`） | 119 | `7854626bef57ce8adf818f4c1476adea55f372af1bdeb7e6eac01c9a75637b05` |
| 5 | `src/service/trunk/public/trunk-service.ts` | 修改（组合 + 类型导出） | 284 | `1c8ceae972e9e6f2f75237676c7f6a5e0910bd4537b7e8fc695f2c12c1e6bc85` |
| 6 | `test/编排/trunk-upgrade-validation.test.ts` | 新增（AC-5 负例/正例 + AC-13） | 265 | `0d3c203187e51a2819581c9401b8a0c33aad90163ff90396a492c7ca82616d59` |
| 7 | `角色卡/编排/docs/change/2026-11-05_trunk-amendment-model-S7-e2-fixes.md` | 新增（本记录） | — | — |

**明确未改**：`test/测试/**`（T1 属主）、`src/model/**`、`src/common/门禁引擎/**`、`src/provider/**`、`app/**`、桌面测试、其它角色文件/测试。

## 四、验证与失败分类

1. **S7 目标**：`node --test test/编排/trunk-upgrade-validation.test.ts test/编排/version-change-runtime.test.ts test/编排/trunk-service.test.ts` → **tests 21 / pass 21 / fail 0 / skipped 0**（AC-5 四负例 + 一正例、AC-13 四态、既有 VCA/trunk 用例含 hash-drift 语义）。
2. **E2/T1 集成回归**：`node --test test/测试/trunk-stable-write-integration.test.ts test/测试/t9-block1-bootstrap.test.ts` → **19 / 19 pass**（未改 `test/测试/**`）。
3. **`test/编排` 全量**：**903 / 902 pass / 1 fail / 0 skipped**；唯一失败为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts`）。S6 基线 897 + 6 S7 测试 = 903。
4. **`npm run typecheck`**：**exit 0**。未改断言、未新增 skip。

## 五、D2 交接点

- stable boundary 确认卡/acknowledgments：调用 `trunkService.detectStableBoundaryExpansion({projectRoot, roleId, fromPath: "角色卡/<roleId>/boundary.yaml", toYamlText: previewBody})`；`expanded:true` ⇒ 卡面要求客户勾选确认（`acknowledgments`），不可解析 ⇒ 拒绝（fail-closed）。D2 直接接 Service 公共 API，不需要改 D1/app。

## 六、披露与声明

- AC-5 版本链强校验仅限**本次变更 roster**（契约文档单独升级不因磁盘最新版扫描被误拒，保持 P1 §4.4 单目标升级）；roster 变更时要求 proposal/modules/architecture 同步一致且 roster 版本递增。
- hash 漂移在 AC-5 预检中保留既有 `vca-hash-drift` 语义（批准前/apply 前均不冻结、不 re-pin）。
- bootstrap（`baseTrunk:null`）无既有 trunk 时按目标文档做 schema/内容校验；无 roster 目标且未变更 roster ⇒ 跳过 roster/链检查（由后续 handoff pin/trunk bootstrap 流程保证）。
- 未运行应用；**未 commit / push / merge / release**。若需改冻结契约/Model/guard 或新增 B-x，按停止项回报。
