# 变更记录：T3 两条固定工作流路径 B2 角色模块批次（convener-code）

- 角色：ANS 固定角色「运营代码维护」（roleId `convener-code`；独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2 convener 角色模块**（团队计划 §三 B2「convener-code」行：fixed 生产线派发目标；legacy 常量冻结；
  AC-24/T-13 的 convener 模块部分 / MF-IR-4）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支/基线：分支 `feat/two-fixed-workflow-paths`，HEAD **`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`**
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa`）；工作树含门禁引擎 B2 与其它五角色 B2 的
  **并行在飞改动**（未提交；见 §五-2），本批只写本角色写集。
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）。未提交/未推送/未合并/未发布；未运行真实模型/
  Electron；未占用 9222/9223。

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24/T-13） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§八-2） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / 35,665 B / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.2/§3.4 convener 行） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划（B2 写集/顺序） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 行 / 17,013 B / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 门禁引擎 B2 记录（接口字段/`cardKindsOf`/值表；只读） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 218 行 / 17,582 B / `6cd8c598480d77fa6abd39227be9330c9d2e9cd4253aa49b167c32c523966d62` |

三份主依据实测 hash 与任务给定值一致（`b607f100…` / `08e01726…` / `ae737dcf…`）。

## 二、实施内容

### 2.1 `src/common/roles/convener/index.ts`（M，+97/−1）

按 MF-IR-4/§5.7 与 v1.3 §3.4 convener 行，在 legacy 数据**逐字冻结**前提下新增 fixed 矩阵数据：

| 新增导出/字段 | 值/签名 | 口径 |
| --- | --- | --- |
| `convenerRoleModule.fixedCards` | `readonly GovernanceCardKind[]`，恰 `["decision"]`（独立冻结数组，非 legacy `cards` 引用） | fixed 矩阵**只读本字段**（门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")`），不从 legacy 过滤 |
| `convenerRoleModule.fixedAllowedBuiltInRoleIds` | `readonly string[]`，恰 `["product","rapporteur","nominator"]` | fixed 生产线唯一派发者；verifier 不在表（幕僚创建） |
| `convenerRoleModule.isConvenerFixedBuiltInDispatchTarget` | `(roleId: string) => boolean` | 与上表**同源**（同一冻结数组 `includes`，不复制第二张表）；大小写敏感；空串/未知恒 false；纯函数无 I/O |
| `context({matrix:"two-fixed-paths/v1"})` fixed 段 | 3 段：`convener-fixed-production-line` / `convener-fixed-baseline` / `convener-fixed-report` | 生产线唯一派发者（product/rapporteur/nominator/项目生产角色/实现）、团队计划（`complete_team_plan` v4）、基线 3 件小事（A9）、集成汇总与报告期望、不派 verifier（`convener-to-verifier-forbidden`） |

- fixed 段只在显式 `matrix:"two-fixed-paths/v1"` 返回；`context({})`（无 matrix）/`"legacy-v1"`/畸形输入
  一律返回 legacy 三段**同一冻结引用**（逐字旧段，向后兼容）。
- fixed 段为纯静态文本：无 `resources`、不读盘、不拼接运行时事实、不携带权限/批准字段。
- 模块对象只新增上述 3 个字段；未新增工具、卡种闭集、辅助导出，未改 `dispatch()`/`tools()`/`preflight()`
  的任何 legacy 分支（v1.3 §3.4「fixed 数据新增，不改 legacy 数据」；fixed 派发判定属编排 B1
  `workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization`，本模块只提供同源纯数据/谓词）。

### 2.2 legacy 逐字冻结（证明）

| legacy 项 | 指纹（SHA-256，before = after） |
| --- | --- |
| `card.text` | `808c25ec0bc4d5c2c9e0a13fd4bd9836e416c17a2a6d5b1069af7acf5967eb46`（3,382 B，与差分金样一致） |
| `card.entries` / `preauthorizedDirs` / `forbiddenWritePaths` | `ebc21168…` / `90483cba…` / `14bd2df0…` |
| `capabilities` / `cards` | `89a99548…` / `cc603f65…`（cards 仍 `["decision"]`） |
| `CONVENER_WORKER_DISPATCH_TARGETS`（`allowedBuiltInRoleIds: ["verifier"]`） | `00245319…` |
| `tools()` trio / single / 未知模型 | `ac9c99ab…` / `651773dd…` / `13a5a7b7…`（五项 / 两项 / 空集+reason 不变） |
| `context()` legacy 四调用形态（trio/single/显式 legacy-v1/`{}`） | `793dc34c…` |
| `dispatch()` 58 例组合（9 目标 × 2 类别 × 3 存在性 + 来源/畸形补充） | `ecbc423e…` |

- before/after 指纹 JSON **逐字节一致**（证据 02 vs 08 同 SHA-256 `19631d6c…`）。
- 既有差分测试 `convener-differential.test.ts` + 冻结金样 `oracle-fixture.ts` **未改**且全绿
  （`payloadSha256` 仍 `67ef107d…`；legacy 差分逐字为 0）。
- `api-spec.md`/`memo.md`/角色卡其它文件未改（本批精确写集见 §五）。

### 2.3 `test/roles/convener/convener-fixed.test.ts`（新，8 tests）

覆盖：fixedCards/fixedAllowedBuiltInRoleIds 冻结值（独立于 legacy）；fixed 谓词正/负例（含 `verifier`/
`chief`/自身/`su`/空串/`"Product"`/尾随空格）与同源/纯函数；fixed context 段主题与冻结/无 resources；
legacy context 四形态同引用 + fixed/legacy 两矩阵隔离；legacy tools/dispatch/capabilities 不受 fixed 字段
影响（含「传 fixed matrix 不改变 `dispatch()` legacy 判定」）；模块纪律（唯一 entry/type-only import/
无 `requestReleaseMerge`/无新工具）；测试纪律（不新增 skip/force-exit，token 动态拼接避免自指误报）。
未删除/弱化任何既有断言；未新增 skip/force-exit。

## 三、fixed 值表（v1.3 §3.4 / G-IR §5.7 冻结口径）

| 项 | 冻结值 |
| --- | --- |
| `fixedCards` | `["decision"]` |
| `fixedAllowedBuiltInRoleIds` | `["product","rapporteur","nominator"]` |
| `isConvenerFixedBuiltInDispatchTarget` 正例 | `product` / `rapporteur` / `nominator` |
| 负例 | `verifier`、`chief`、`convener`、`su`、空串/空白、未知 id、大小写变体 |
| fixed context 主题 | 生产线唯一派发者 / 团队计划 v4 / 基线 3 件小事 / 集成汇总（含报告期望）/ 不派 verifier |
| 工具面 | 无新工具（`RoleToolId` 仍 14 项）；`requestReleaseMerge` **零出现**（G-IR §六拒绝） |

## 四、验证

### 4.1 类型检查

`npm run typecheck` → **exit 0**（证据 03；运行于并行 owner 批次在飞的工作树，全仓零诊断）。

### 4.2 本批目标测试（`test/roles/convener/**`）

| 运行 | 文件 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| before | `convener-module.test.ts` + `convener-differential.test.ts` | 32 | 32 | 0 | 0 |
| after | 上述 2 文件 + `convener-fixed.test.ts`（新 8） | 40 | 40 | 0 | 0 |

失败名集合 diff：before = ∅，after = ∅；新 skip = 0（证据 01/05/04）。

### 4.3 只读回归（`test/门禁引擎/**`，同一命令，证据 06）

- `node --test --test-concurrency=1 --test-force-exit --test-reporter=tap "test/门禁引擎/*.test.ts"`：
  **tests 499 / pass 493 / fail 5 / skipped 1**。
- 5 个失败名与门禁引擎 B2 记录基线**逐名一致**（无新增/无消失）：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- skip 仍 1（`unreadable（权限）… # SKIP`，既有环境条件 skip，与基线同一项）。
- 本批相关用例转绿点：`fixed-role-module-surface.test.ts` 的 convener 分支由「缺失 ⇒ fail-closed」
  自动强化为「提供 ⇒ 逐字断言冻结值」，7 项 MF-IR-4/视图/拒绝项测试全 ok（ok 178–184）。

### 4.4 消费点定向回归（只读，证据 07）

`test/编排/run-role-fixed.test.ts`（fixed 会话注入模块 `context({matrix})` 段、legacy 工具不注入）+
`test/编排/convener-module-consumption.test.ts`：**11/11 pass**（fixed 段含「报告期望」，B1 注入断言成立）。

### 4.5 跨角色未落地红（如实）

- 六角色模块 fixed 数据由六个 code 角色 B2 **并行**实现；本批只落地 convener。其余五模块与门禁引擎
  B2 均在同一工作树**未提交在飞**（§五-2 清单）。T-13/AC-24 的**全量六模块判定**须在六批合并后由
  B2 独立验收复测；本记录**不声称**六模块值已全部落地。
- `test/门禁引擎` 的 5 个 known-red 与 G-IR/门禁引擎 B2 基线同名同因，非本批写集、未恶化；不据此
  声称全绿。`test/编排` 其余 known-red（B1 记录口径）本批未复测全量，定向消费点 11/11 绿。
- 只读补充回归（`test/roles/*/*.test.ts`，证据 12）：**275/275 pass / 0 fail / 0 skip**（含本批 8 与
  其它角色 B2 并行新增用例的当前工作树状态；此快照不构成六模块验收结论）。
- 已观察但不属本批写集（不修改、不代修）：编排 B1 在 `workflow-dispatch.ts` 内维护 fixed 目标常量
  （`FIXED_CONVENER_BUILT_IN_TARGETS`）；本模块 fixed 字段是该值表的角色模块同源侧，二者一致性由
  B2 验收/后续接线核对（本批不改编排）。

## 五、候选与写集

### 5.1 候选文件（本批 = 2 文件；raw SHA-256 / bytes / lines）

| 文件 | 类别 | SHA-256 | bytes | lines | numstat |
| --- | --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | `8c9989c96bbddd3216831ac45b1cce61aeaab7a9a5814d3cfcc8cdbb5a45d190` | 42,772 | 788 | +97/−1 |
| `test/roles/convener/convener-fixed.test.ts` | 新 | `850016065da6654c7e921bd4fc9b58f068f969c2a6bf2ab1b6a4b9fdcca9218f` | 11,535 | 212 | +212 |

- 合计 **54,307 bytes**；CR 计数均为 0；无二进制/重命名。
- 可复算聚合（按路径排序，`path + "\0" + sha256` 直接串联后 SHA-256）：
  **`aa1492bc9d071f9e315afffc5a5306d5a10b7ea6ba21795174d6f8e4d655cdb0`**（证据 10/11）。
- 未改候选：`convener-module.test.ts` / `convener-differential.test.ts` / `oracle-fixture.ts`（HEAD 原样）。

### 5.2 写集外 diff = 0（实测）

- 本批只写上述 2 文件 + 本记录与 `_evidence/`。`git status --porcelain -- src/common/roles/convener test/roles/convener`
  恰为 `M src/common/roles/convener/index.ts`、`?? test/roles/convener/convener-fixed.test.ts`（证据 00）。
- `src/app/test` 其余 M/?? 均为**其它 owner 在飞批次**（本批只读、未写）：
  门禁引擎 B2（`src/model/role.ts`、`src/common/门禁引擎/governance-roles.ts`、`workflows/chief/chief-workflow-v2.md`、
  `src/service/governance-matrix/**`、`test/门禁引擎/` 3 新文件）；chief/product/rapporteur/nominator/verifier
  五角色 B2（各自 `src/common/roles/**` 与其 fixed 测试、`test/roles/rapporteur/spec.test.ts`）。
- 零写入守卫：`src/common/gates/`、`app/`、`src/provider/`、`src/pipeline/`、`src/common/编排/`、`docs/`（除本记录与
  证据）、其它角色卡目录均无本批改动；未新增依赖/目录/客户门；未改 `package.json/lock`。

## 六、限制与披露

1. **并行批次**：同一工作树含门禁引擎 B2 与其它五角色 B2 的未提交在飞改动；本批证据的运行环境即此
   代码态。typecheck/门禁引擎套件/定向消费点结果均在该状态下采集，失败名与基线逐名一致。
2. **接口口径**：本模块 fixed 数据按 G-IR §5.7 冻结接口只做「卡种白名单 + 内置目标表 + 同源谓词 +
   fixed context 段」；fixed 派发**判定**在编排 B1（不得由本模块复制第二张矩阵）。本批未改 legacy
   `dispatch()`（即便传入 fixed matrix 也保持 legacy 判定，见新测试）。
3. **fixed context 形态**：fixed 矩阵下只返回 fixed 三段（与其它角色模块 B2 并行实现同约定；
   run-role fixed 会话追加注入，legacy 段不重复）。legacy 返回值同一引用，未变。
4. **未做**：真实模型/Electron/真机全链；`requestReleaseMerge`（G-IR 拒绝项）零新增；工具闭集仍 14 项。
5. 本批不判验收；T-13/AC-24 结论以 B2 独立验收（六角色 + 门禁引擎合并候选）为准。

## 七、未提交声明

- 本记录与 `_evidence/` 只写入本角色记录目录（`角色卡/convener-code/docs/change/`）；产品/测试代码变更仅限
  §五-1 写集。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 八、证据索引（同目录 `2026-11-10_B2_two-fixed-workflow-paths_evidence/`）

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa` | `e7020f62d04888222d43aa8d38afe71fff3a700a547ed59de69d881b35de3b59` |
| `00-status-convener-scope.txt` | 本批写集状态（仅 2 文件） | `15dfc855d0d8503242712e7ef69258aaa16872cd51b2f403457361fc2295f53f` |
| `00-status-current-src-app-test.txt` | 工作树 `src app test` 状态快照（含并行 owner 改动） | `b2bd111ae6e1c984824fd82db2aa92b0808641a9d44649715a76889b42eaf018` |
| `01-before-convener.tap` | before：既有 2 文件（32/32/0/0） | `56f92cb759a8eaa8515c00a8556bf19adb9eee732394f92730d9a6d6e84cb589` |
| `02-before-legacy-fingerprint.json` | legacy 数据/行为指纹（before） | `19631d6c5ff9c7156c0cf73a1c4ed632246910d0ff1006c58fc375af37cb51a0` |
| `03-typecheck.log` | `npm run typecheck` exit 0 | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `04-summary.txt` | before/after/门禁/消费点/roles 计数汇总 | `6723b118ca473664684c4009ca9560650a4ce44c8c0e77db45e2df95703e14b1` |
| `05-after-convener.tap` | after：本批 3 文件（40/40/0/0） | `3bf16a4a209d9d527752466707e23a985c4efaa83819ce94dad0ccfc6ccf9a60` |
| `06-after-test-门禁引擎.tap` | 门禁引擎全量 TAP（499/493/5/1） | `f2073360c464795fe33e61453355899136be1a8e867166b0610207f1b6333769` |
| `06-failure-names.txt` | 门禁引擎 5 个 known-red 名称（与基线逐名一致） | `f7927fb9b8c85801505ddf14184f05414656459796df4ebdea3ac831164dd451` |
| `07-targeted-consumers.tap` | 编排消费点定向回归（11/11） | `d304b1d908a98a17b4b4edd9d688c89ddc9d3302298478894b31539035d0c515` |
| `08-after-legacy-fingerprint.json` | legacy 数据/行为指纹（after；与 before 同 hash） | `19631d6c5ff9c7156c0cf73a1c4ed632246910d0ff1006c58fc375af37cb51a0` |
| `09-numstat.txt` | 模块 numstat（+97/−1） | `1f6e7e030dec5a85528f55197e245a0c2c1540c31b4fa43b62c5c389814a2980` |
| `10-candidate-hashes.txt` | 候选逐文件 SHA-256/bytes/lines/CR | `3ce3c2756ece95f97d11a8d95be5fc9d0f381ec11471c3039d749a57760bfef4` |
| `11-candidate-aggregate.txt` | 候选聚合 SHA-256（`aa1492bc…`）/总字节 | `86af10245f7beba6785fd3c1e116eabc408d80671c621ed0ead6a6ee2bfd1f35` |
| `12-readonly-test-roles.tap` | 只读补充：`test/roles/**`（275/275/0/0） | `a99d24d39011e6677275be3ee402239e08421321a24f263b77fcc1ee9b154be7` |
| `probe-fingerprints.mjs` | legacy 指纹探针（before/after 复算脚本） | `8b24b709482ccab6fe59e78eb05f6c524a3e04227c174ae6e2bf737375269a2e` |
