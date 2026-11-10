# 门禁引擎 B2 记录：两条固定工作流路径（角色模块/工具面 + 矩阵 fixed 视图）

- 日期：2026-11-10
- 角色：ANS 固定角色「门禁引擎」（roleId: 门禁引擎；独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：MF-IR-4 角色模块 fixed 接口面/值表、`cardKindsOf` helper、governance-matrix
  fixed 视图、`chief-workflow-v2.md`、本角色测试与记录）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa`）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成，typecheck exit 0，目标测试全绿（1 项既有 known-red 同名保留），
  legacy 指纹逐字不变，写集外 diff=0。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24/AC-25/AC-26、T-13/T-20、EV-05） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§5.8、§八/§九） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.4/§3.6/§7.4/§9.2） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |

三份依据实测 hash 与任务给定值一致；评审对象 HEAD `f72bafa` 与 `git status --porcelain -- src app test` 为空已复核。

## 二、B2 实施内容（对照任务条目）

### 2.1 MF-IR-4 模块接口（`src/model/role.ts`，M）

在 `BuiltInRoleModule`（公开契约；`extends GovernanceRoleSpec`）新增四个**可选**字段（纯策略/纯数据、无 I/O、
只在 `matrix:"two-fixed-paths/v1"` 下消费；legacy 数据与 legacy 消费点逐字冻结）：

| 字段 | 签名 | 冻结口径 |
| --- | --- | --- |
| `fixedCards` | `readonly GovernanceCardKind[]`（可选） | 六模块均提供；fixed 矩阵**只读本字段**，不从 legacy `cards` 过滤；**缺失/非法 ⇒ fail-closed 空集**（不回退 legacy）。冻结值见 §三。 |
| `fixedTargetRoleIds` | `readonly string[]`（可选） | chief 恰 `["convener","verifier"]`；缺失 ⇒ fixed 消费方 fail-closed（不回退 legacy 五内置）。 |
| `fixedAllowedBuiltInRoleIds` | `readonly string[]`（可选） | convener 恰 `["product","rapporteur","nominator"]`；缺失 ⇒ fixed 消费方 fail-closed（不回退 `["verifier"]`）。 |
| `isConvenerFixedBuiltInDispatchTarget` | `(roleId: string) => boolean`（可选方法） | convener 纯函数，与 `fixedAllowedBuiltInRoleIds` **同源**；不替换 legacy `isConvenerBuiltInDispatchTarget`；缺失 ⇒ fixed 派发消费方 fail-closed。 |

注释同时冻结：legacy `card.text`/`cards`/`capabilities`、`CHIEF_HUB_DISPATCH.targetRoleIds`（五内置）、
`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds`（`["verifier"]`）逐字不变，legacy 消费点
（apply-journal / trunk-runtime）不得改读新字段。

### 2.2 门禁引擎门面 helper（`src/common/门禁引擎/governance-roles.ts`，M）

- 新增 `cardKindsOf(roleId, matrix = "legacy-v1")`：唯一真源 = 角色模块——
  legacy 读 `cards`（逐字）；fixed **只读 `fixedCards`**；缺失/未装配/未知 id ⇒ 冻结空集
  （`NO_CARD_KINDS_FIXED`，不静默回退）。供编排 `run-role`（B2 编排接线）调用；不复制第二张硬编码表。
- 新增 `builtInRoleMatrixSummaryOf(roleId, matrix = "legacy-v1")`：legacy 返回 `BUILT_IN_ROLE_MATRIX`
  **同一引用**（legacy 文案逐字不变）；fixed 返回新增 `BUILT_IN_ROLE_MATRIX_FIXED` 摘要；
  非 trio 内置 id ⇒ `undefined`（调用方 fail-closed）。
- 新增 fixed 只读展示摘要表 `BUILT_IN_ROLE_MATRIX_FIXED`（六角色；**不参与任何判定**）：
  两条固定路径、派发分裂（幕僚只派 verifier/stage-request；运营派生产线）、三张客户卡、
  固定路径不发 acceptance 卡、merge-main 应用自有/仅客户本人、基线 3 件小事、Git 普通用法、
  A10→A11、A12a→A12b。legacy `BUILT_IN_ROLE_MATRIX` 逐字未动。

### 2.3 governance-matrix fixed 视图（`src/service/governance-matrix/**`，M）

- `buildGovernanceMatrix(input, matrix = "legacy-v1")`（`public.ts` 导出符号不变；仅加**可选参数**）
  与 impl seam `buildGovernanceMatrixWith(input, builtins, matrix = "legacy-v1")`。
- `builder.ts`：builtin 行按矩阵取摘要——legacy 继续用传入注册表 spec 自身 `matrix`（seam 语义不变）；
  fixed 用 `builtInRoleMatrixSummaryOf(id,"two-fixed-paths/v1")`（缺失 ⇒ unknown，不回退 legacy）。
- `routing.ts`：legacy 分支逐字保留（卡种快照 → Model 常量 → 发起快照 → 能力位 → app-rule 小表）；
  fixed 分支 = ①fixed 卡种路由（只读 `cardKindsOf(id,fixed)`，缺失 ⇒ 空）②派发分裂视图
  （convener 生产线行、chief stage-request/独立验收行；目标集只读模块 `fixedAllowedBuiltInRoleIds`/
  `fixedTargetRoleIds`，缺失 ⇒ 不出行）③fixed app-rule 小表（产品意图/方案名单架构/客户决定三卡/下载）。
  fixed 视图不含 legacy 模型常量（VCA/refactor）、legacy 发起快照（需求变更/版本决定/stable 写入）、
  legacy 五内置派发与 legacy 卡种（acceptance/appointment-write 等）。
- 不新增导出、不新增客户门/权限；矩阵仍为只读展示（`schema` 仍 `governance-matrix/v1`）。

### 2.4 chief-workflow-v2.md（新 fixed 资源；legacy 资源不改）

- 新增 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（`资源版本：chief-workflow/v2`；
  73 行 / 10,206 B，见 §5.1）。内容覆盖：两条固定路径 A1–A13 / B1–B4、派发分裂（stage-request 原语）、
  3 张客户卡（fixed 不发 acceptance 卡）、基线 3 件小事（团队计划 v4/git init -b main/.gitignore 托管块+
  baseline commit/任务分支/dirty）、Git 普通用法（仅 add/commit -m；push/tag/merge 等硬拒）、
  merge-main 应用自有且**仅客户本人**（judge 不可代批）、A10→A11 顺序、A12a/A12b 与
  `docs/acceptance` 应用归档、路径 B 要点、stop/请示与委托纪律；明确固定路径不注入 legacy
  git/trunk/VCA/stable 工具；不含 `requestReleaseMerge`（G-IR 拒绝项）。
- legacy `chief-workflow.md` **未改**（版本仍 `chief-workflow/v1`；指纹见 §五）。

### 2.5 测试（`test/门禁引擎/**`，新 3 文件 / 16 tests）

| 文件 | 覆盖 |
| --- | --- |
| `test/门禁引擎/fixed-role-module-surface.test.ts`（新，7 tests） | 编译期可选字段签名；legacy `cardKindsOf` 六角色逐字同引用；fixed `fixedCards` 冻结值/缺失 fail-closed 不回退；chief/convener fixed targets 冻结值与 legacy 常量逐字；convener fixed 谓词同源/纯函数；`builtInRoleMatrixSummaryOf` legacy 同引用/fixed 独立非空/未知 fail-closed；`requestReleaseMerge` 零出现 + RoleToolId 14 项；fixed 读取不改写注册表/模块 |
| `test/门禁引擎/governance-matrix-fixed-view.test.ts`（新，6 tests） | 缺省 ≡ 显式 legacy（逐字）；fixed 文案来自 fixed 摘要（不混入 legacy）；fixed 卡种路由只读 `fixedCards`（缺失空集，不读 Pipeline 快照）；fixed 派发分裂视图（不含 legacy 派发/模型/发起路由）；fixed app-rule 三卡/客户决定/无新客户门；构建只读/确定性 |
| `test/门禁引擎/chief-workflow-v2-resource.test.ts`（新，3 tests） | v2 资源存在/版本行恰 v2/主题全覆盖；legacy 资源 v1 逐字与模块引用不变；编码/规模/不与 legacy 字节相同 |

未删除/未弱化任何既有断言；未新增 skip/force-exit（测试内）；新增加载零依赖。

## 三、值表（v1.3 §3.4 / G-IR §5.7 冻结）

| 角色 | legacy `cards`（冻结） | fixed `fixedCards` | fixed 目标 |
| --- | --- | --- | --- |
| chief | `["intent-confirm"]` | `["intent-confirm","proposal","appointment"]` | `fixedTargetRoleIds=["convener","verifier"]` |
| product | `[]` | `[]` | — |
| rapporteur | `["proposal","decision"]` | `["decision"]` | — |
| nominator | `["appointment","appointment-write"]` | `[]` | — |
| convener | `["decision"]` | `["decision"]` | `fixedAllowedBuiltInRoleIds=["product","rapporteur","nominator"]` + fixed 谓词（同源） |
| verifier | `["acceptance"]` | `[]` | — |

> 六角色模块的 fixed 数据实现属六个 code 角色 B2 并行批次；本批接口保持**可选**。当前工作树六模块尚未提供
> fixed 字段：`cardKindsOf(id,fixed)` 与 fixed 派发/卡种视图行按契约 **fail-closed 空集/空视图**
> （实测见 §五/证据 07）；本角色测试以「提供则逐字断言冻结值、缺失则断言 fail-closed」编码契约，
> 六模块落地后自动强化，不产生 skip。

## 四、验证结果

### 4.1 类型检查

- `npm run typecheck`：**exit 0**（证据 03）。

### 4.2 目标测试

- 定向 8 文件（3 新 + governance-matrix/governance-matrix-service/role-module-contract/dispatch-matrix-mode/
  direct-role-capabilities）：**82 tests / pass 81 / fail 1 / skip 0**；唯一失败 = 既有 known-red
  「渲染过滤：section=roles/routing 与注册表展示字段出现在文本中」（baseline 同名同因；证据 04）。
- 新增 16 tests 全绿（证据 04：ok 31–37、38–43、1–3）。

### 4.3 套件 before/after（`node --test --test-concurrency=1 --test-force-exit --test-reporter=tap`）

| | 文件 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| before（44 个既有文件；排除本批 3 个新文件） | 44 | 483 | 477 | 5 | 1 |
| after（47 个文件，含新增） | 47 | 499 | 493 | 5 | 1 |

- before/after **失败名集合完全一致（5 个既有 known-red，无新增/无消失）**：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- 新增确定性失败 = 0；新增 skip = 0（skip 仍 1，且为 before 同一 skip）。
- 说明：before 首次运行未加 `--test-force-exit` 时 `git-shell-acl.test.ts` 全部 19 tests 完成后进程因
  残留句柄不退出（该次与另一次误含新文件的试跑均未纳入证据；同一输出路径被覆盖）；改用同一命令 +
  `--test-force-exit` 复跑 before/after（并发仍 1），计数与 G-IR 记录的 483/477/5/1 完全一致。

### 4.4 legacy 冻结证据（before/after 指纹）

- legacy 矩阵（确定性输入）**JSON 与渲染文本 SHA-256 前后完全一致**（证据 02/06）：
  `0a161fbd…` / `b062416f…`；路由行 20、渲染 10,822 字符。
- legacy 注册表/模块 cards/工具目录/chief hub/convener legacy 目标/`chief-workflow.md` 指纹前后完全一致
  （证据 02/06：`ae44334a…`/`74e6d6b3…`/`cc8cd47a…`/`fef9a265…`/`00245319…`/`9bef5626…`）。
- which role fixed 数据缺失时 fixed 视图为 fail-closed 空集/空视图（证据 07）：fixed 路由 4 行（app-rule）
  /卡种 0 行/派发 0 行；fixed chief duty 为 fixed 文案、legacy 摘要同引用保持。

## 五、候选与写集

### 5.1 候选文件（本角色 B2 写集；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/model/role.ts`（M） | `960edbebb8b5768e3d9682efbbf1db59d83e2004cf3dad7010e0eac6dd93d3d5` | 28,036 | 486 |
| `src/common/门禁引擎/governance-roles.ts`（M） | `d58a1b80eec00272690931b1b4aa8876446ffd843c7df69bed874a52b106cc5b` | 35,393 | 584 |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（新） | `f806658818dd36369666b7f189b6e57c164258c23348bd4a132737e0589eb1eb` | 10,206 | 73 |
| `src/service/governance-matrix/impl/builder.ts`（M） | `ea0e04a0c13fb7e820f5d8f5cc7cac22eac6ffdc3633a5daba7e190e274fd6ec` | 20,400 | 582 |
| `src/service/governance-matrix/impl/routing.ts`（M） | `c74ef6d2e5b7bc7fb42689f93e4b7d5801db9fb2c64445b929ab1b45c8af1d60` | 12,731 | 353 |
| `src/service/governance-matrix/public.ts`（M） | `2411bcf36f158f42f883bcd55f5f18096eb33850e74389d37113e1ba686e9e6b` | 1,257 | 21 |
| `test/门禁引擎/fixed-role-module-surface.test.ts`（新） | `79ac83ea293e6bebc7931d479bd58bf0db23e725446a24c8300026079c06cd7e` | 16,095 | 301 |
| `test/门禁引擎/governance-matrix-fixed-view.test.ts`（新） | `f6945b52dec29ba5bdbea8d6f174ba9dcc4c111f1175c41a55d6414122d76d7d` | 15,410 | 270 |
| `test/门禁引擎/chief-workflow-v2-resource.test.ts`（新） | `0c6e06552b3c03de41cbac1db6f6dac4f7945b864c32e6d84aa46f8755d225e5` | 4,495 | 85 |

- 9 文件合计 **144,023 bytes**；git numstat（M 文件）：`+360 / −26`
  （governance-roles +127、role.ts +39、builder +35/−11、routing +157/−15、public +2）。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256，实测复算见证据 `08b-candidate-aggregate.txt`）：
  `f738ad66a6027568e4190eadfcd95834395a77577c1cee4b109e7177127a5efd`。

### 5.2 写集外 diff=0（实测）

- `git status --porcelain -- src app test` 仅上述 9 文件（`core.quotepath=false` 全路径核对）。
- 零 diff 守卫路径（`git diff --stat` 0 行）：`src/common/gates`、`app`、`src/common/roles`、`src/pipeline`、
  `src/provider`、`src/common/编排`。未改 `run-role.ts`、运行时核心 schema/tools、桌面/merge-main 通道、
  `package.json/lock`（无新依赖）。
- 文档/其它：仅本记录与 `_evidence/`。

## 六、限制与披露

1. 六角色模块 fixed 数据（`fixedCards`/targets/谓词）由六个 code 角色 B2 并行实现；当前工作树尚未提供，
   接口保持 optional，消费按 fail-closed 空集/空视图（§三注）。本记录**不声称**六模块值已落地；
   T-13/AC-24 全量判定须在六模块 B2 合并后由 B2 验收复测（本角色测试届时自动强化）。
2. 编排 B2 接线未做（写集外）：`run-role.ts::cardKindsOf` 应改调门面 `cardKindsOf`；fixed 会话应
   `buildGovernanceMatrix(matrixInput,"two-fixed-paths/v1")` 与注入 `chief-workflow-v2.md`（编排 B2 属主）。
3. `requestReleaseMerge` 未新增（G-IR §六拒绝）；`RoleToolId` 仍 14 项。
4. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
5. `test/门禁引擎` 5 项 known-red 与 G-IR/baseline 同名同因，未修复（非本批写集；不恶化）。
6. 全量套件复跑使用 `--test-force-exit`（环境适配，见 §4.3 说明）；前后同一命令。
7. 记录内聚合哈希为按证据 08 逐文件表复算的派生值；如需复核以文件实测为准。

## 七、未提交声明

- 本记录与 `_evidence/` 仅写入本角色记录目录（任务精确写集）；**未 commit / 未 push / 未 merge /
  未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa` |
| `00-baseline-status.txt` | 基线 `git status --porcelain -- src app test`（空） |
| `01-before-test-门禁引擎.tap` | before 全量 TAP（44 既有文件；483/477/5/1） |
| `01-before-failure-names.txt` | before 失败名集合（5 个 known-red + skip 行） |
| `02-before-legacy-matrix-fingerprint.txt` | legacy 矩阵/渲染 before 指纹 |
| `02-before-legacy-registry-fingerprint.txt` | legacy 注册表/模块/常量/资源 before 指纹 |
| `03-after-typecheck.txt` | `npm run typecheck` exit 0 |
| `03-after-typecheck-final.txt` | 收尾复跑 `npm run typecheck` exit 0 |
| `04-targeted-tests.tap` | 定向 8 文件 TAP（82/81/1/0；新增 16 全绿） |
| `05-after-test-门禁引擎.tap` | after 全量 TAP（47 文件；499/493/5/1） |
| `06-after-legacy-matrix-fingerprint.txt` | legacy 矩阵/渲染 after 指纹（与 before 一致） |
| `06-after-legacy-registry-fingerprint.txt` | legacy 注册表/模块/常量/资源 after 指纹（与 before 一致） |
| `07-fixed-view-fingerprint.txt` | fixed 视图实测（fail-closed 空集/固定文案/legacy 同引用） |
| `08-candidate-hashes.txt` | 候选文件 hash/bytes/numstat + 零 diff 守卫路径 |
| `08b-candidate-aggregate.txt` | 9 文件逐行 `path:sha256` 与聚合 SHA-256（`f738ad66…`）/总字节 |
| `09-after-failure-names.txt` | after 失败名原始行（5 个） |
| `09-after-failure-names-diff.txt` | before/after 失败名集合 diff（`FAILURE-NAME-SET-IDENTICAL`） |
