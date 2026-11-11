# product-code B2 记录：两条固定工作流路径（product 角色模块 fixed 面）

- 日期：2026-11-10
- 角色：ANS 固定角色「product-code」（独立固定上下文；写集 Section 1）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：MF-IR-4 product `fixedCards`、fixed context 段、fixed dispatch 分支；legacy 逐字冻结；
  本角色测试与记录）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa`）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成；`npm run typecheck` exit 0；`test/roles/product/**` 39/39 pass（0 fail/0 skip）；
  legacy 差分测试文件逐字未改并全绿；写集内候选 hash/聚合已列；写集外本角色改动=0。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24/T-13） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§八/§九） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / 35,665 B / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.2/§3.4 product 行；§3.3 角色模块 dispatch 分支） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划（§三 B2 product-code 行） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 门禁引擎 B2 记录（MF-IR-4 接口落地；只读） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | `6cd8c598480d77fa6abd39227be9330c9d2e9cd4253aa49b167c32c523966d62` |

三份任务给定依据 hash（`b607f100…` / `08e01726…` / `ae737dcf…`）与写盘实测一致。

## 二、B2 实施内容（对照任务条目）

### 2.1 `fixedCards: []`（MF-IR-4；`internal/capabilities.ts`、`index.ts`）

- 新增 `PRODUCT_FIXED_CARDS: readonly GovernanceCardKind[]`（`Object.freeze([])`；
  `internal/capabilities.ts:38`），模块导出 `fixedCards: PRODUCT_FIXED_CARDS`（`index.ts:40`）。
- fixed 矩阵**只读本字段**（门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")`），不从 legacy `cards`
  过滤/推导；product fixed=[]（意图确认卡由幕僚呈；固定路径**不新增卡种**）。
- legacy `PRODUCT_CARDS`（`[]`）逐字不变；两者为独立冻结数组。

### 2.2 fixed context 段（`internal/context.ts`）

- `productContext(input: RoleContextInput)` 按 `input.matrix` 分支（`context.ts:66`）：
  - 缺省 / `"legacy-v1"` → 返回 legacy `PRODUCT_CONTEXT_SECTIONS` **同一冻结引用**（4 段逐字不变）；
  - `"two-fixed-paths/v1"` → 返回新增 `PRODUCT_FIXED_CONTEXT_SECTIONS`（3 段；`context.ts:45`）：
    | id | 固定口径 |
    | --- | --- |
    | `product-fixed-duty` | 按运营（convener）派发撰写/修订 `docs/product/<flowId>-intent-vN.md`（版本化、不原地改）；必含字段；不写实现方案；与旧卡文本冲突时以本段为准 |
    | `product-fixed-boundary` | 只写 `docs/product/`；**不派发任务、不实现、不招人；不自行改方案/名单/架构/角色卡**；**意图确认卡由幕僚呈**（product 不发卡/不代客户确认）；不注入 VCA/版本决策/结构化 Git 工具 |
    | `product-fixed-report` | 报告期望：`submit_report` 回真实任务创建者运营（convener）；缺信息先报阻塞 |
- fixed 段由编排在 fixed 会话追加注入（`run-role.ts:2132-2139` 已按 `matrix` 调用）；legacy 会话不读本分支。

### 2.3 fixed dispatch 分支（`internal/dispatch.ts`）

- 同一纯函数内按 `input.matrix` 分支（`dispatch.ts:129`）；**legacy-v1（缺省）分支逐字保留**（同顺序/码/报告期望）。
- fixed 分支（v1.3 §3.2/§3.4）：
  - convener→product（内置、`targetExists===true`）→ **allow**，`reportToRoleId="convener"`（fixed 生产线任务创建者）；
  - chief→product（内置）→ deny **fixed-only 稳定码 `chief-production-dispatch-forbidden`**
    （`PRODUCT_DISPATCH_CODES.chiefProductionForbidden`；messageKey
    `role.product.dispatch.chiefProductionForbidden`；legacy 从不返回）；
  - convener→product（内置、`targetExists!==true`）→ deny `target-card-missing`（fail-closed）；
  - 内置 id 声明为 project（身份自相矛盾）→ deny `dispatch-input-invalid`；
  - self/来源非 chief,convener/目标非 product/形状畸形 → 与 legacy 同码 deny。
- **不新增工具**：`tools()` 未改（trio 仍只声明 `submitVersionChange`）；fixed 模式不注入 VCA 由
  运行时/编排按会话模式过滤（B1 AC-23），不在模块内扩工具面；`RoleToolId` 未改、无 `requestReleaseMerge`。

### 2.4 legacy 逐字冻结（MF-2）

| legacy 面 | 状态 |
| --- | --- |
| `card.text`/`card.entries`/`preauthorizedDirs`/`forbiddenWritePaths`（`internal/card.ts`） | 未改（hash 见 §五） |
| `cards`（`PRODUCT_CARDS=[]`）/`capabilities`（7 字段） | 未改 |
| legacy dispatch（缺省/`"legacy-v1"`） | 分支逐字保留；差分夹具 29 项旧测试全绿 |
| `preflight`（version-upgrade） | 未改（`internal/preflight.ts` hash 不变） |
| `tools()` | 未改（`internal/tools.ts` hash 不变） |
| `context({})` legacy 4 段 | 返回同一冻结引用；新测试逐字钉住文本（任务条目 2/3） |

fixed 数据/行为**只在 `matrix:"two-fixed-paths/v1"`** 生效；未传 matrix 的旧调用点行为不变
（`dispatch-matrix-mode` 契约测试全绿）。

## 三、验证结果

### 3.1 类型检查

- `npm run typecheck`：**exit 0**（证据 `03-after-typecheck-final.txt`）。
- 基线时点曾出现 **1 个并行角色瞬时错误**（`test/roles/verifier/verifier-fixed.test.ts(96,26)` resources 类型；
  证据 `01-before-typecheck.txt`，exit 1）；该文件属 verifier-code 并行批次，本角色未触碰；其落地后
  typecheck 恢复 exit 0（如实披露，非本批引入）。

### 3.2 目标测试（`test/roles/product/**`）

| | 文件 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| before（基线，legacy 2 文件） | 2 | 29 | 29 | 0 | 0 |
| after（+ 新 fixed 文件） | 3 | **39** | **39** | 0 | 0 |

- 新增 `test/roles/product/product-fixed.test.ts`（10 tests）：fixedCards 空/冻结；legacy context 文本逐字冻结；
  fixed context 3 段内容/不混入 legacy/VCA 语义；fixed dispatch 正负例（convener allow/chief固定码/
  exists 负例/身份冲突/self/unknown/范围/形状）；纯函数/输入只读；无 `requestReleaseMerge`/新工具；preflight 不变。
- **legacy 差分文件逐字未改**：`product-module.test.ts`（504 行 / `f8260b60…`）与
  `product-differential.test.ts`（281 行 / `e8d1ae19…`）仍为 E1 交付版本；未新增 skip/force-exit
  （TAP `skipped 0`）。
- 证据：`01-before-product-tests.tap`（29/29）、`04-after-product-tests-final.tap`（39/39）。

### 3.3 跨角色定向（只读复跑；非本角色写集）

- `test/门禁引擎/fixed-role-module-surface.test.ts` + `role-module-contract.test.ts` +
  `governance-matrix-fixed-view.test.ts` + `dispatch-matrix-mode.test.ts`：**37/37 pass**（证据
  `05-gate-engine-targeted-final.tap`）。`fixedCards` 落地后门禁引擎 MF-IR-4 断言自动强化并通过
  （`cardKindsOf(product, fixed)` 返回模块字段同一引用、值为 `[]`）。
- 门禁引擎全量套件（`--test-concurrency=1 --test-force-exit`）：**499 tests / 493 pass / 5 fail / 1 skip**，
  5 个失败名与门禁引擎 B2 记录/基线**逐名一致**（known-red，非本批引入；证据 `09-gate-engine-suite.tap`）：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- 新增确定性失败=0；新增 skip=0（skip 仍 1，与基线同一项）。

## 四、与依据的对应

| 依据条目 | 本批落地 |
| --- | --- |
| AC-24（角色模块/工具面：legacy 数据冻结；fixedCards/context；接口评审） | legacy card/cards/capabilities/dispatch/preflight/tools 与 `context({})` 逐字冻结；product `fixedCards=[]` + fixed context + fixed dispatch；无 `requestReleaseMerge` |
| T-13（legacy 差分逐字不变；fixed fixedCards/targets/context；tool/卡种） | legacy 差分文件未改并全绿；fixed 差分（新文件）覆盖 fixedCards/context/dispatch；tool 注册/卡种不变 |
| G-IR §5.7 / MF-IR-4 | `fixedCards` 可选接口落地（product 提供）；fixed 只读字段；legacy 消费点未改读 |
| v1.3 §3.2/§3.4 product 行 | `fixedCards=[]`；fixed context（意图撰写/修订；报告回运营）；fixed dispatch：convener→product 允许（report=convener）、chief→product 拒绝 `chief-production-dispatch-forbidden`；`submitVersionChange` fixed 不注入由运行时/编排过滤 |
| 任务条目（fixed context：按运营派发写意图；不派发/不实现/不自行改方案；意图确认卡由幕僚呈；不新增工具/卡） | `product-fixed-duty/boundary/report` 三段逐条覆盖；`tools()`/`cards`/`fixedCards` 均无新增 |

## 五、legacy 冻结证据与候选哈希

### 5.1 legacy 未改文件（写盘实测；与 E1 记录 hash 一致）

| 文件 | 行 | bytes | SHA-256 |
| --- | --- | --- | --- |
| `src/common/roles/product/internal/card.ts` | 100 | 8,152 | `9b5b625b57d60f00a3627afa4630333b0e8481a2acf134a360cdf7e3c7a193d2` |
| `src/common/roles/product/internal/preflight.ts` | 289 | 10,959 | `df4b6047e4545fd9d01efc0c0d6195d2f3fd4ab3110ce494e78cc3bbb2ce4e6d` |
| `src/common/roles/product/internal/tools.ts` | 69 | 2,882 | `e065297135b52eaf580ce770535684432946db7f6340f69a77c96c56f3acb413` |
| `test/roles/product/product-module.test.ts` | 504 | 19,958 | `f8260b608e742ae911be7ce798f30f3ffbfe6837f3e59c03860c1c0dc3b0a1ae` |
| `test/roles/product/product-differential.test.ts` | 281 | 13,183 | `e8d1ae195feb7698c69ab97b0fa45152b59238cd40c4564ad2cb247d4b2ab8d7` |
| `test/roles/product/fixtures/product-differential-fixtures.ts` | 359 | 13,464 | `f6a652435e3a90fd3f0cccc986252fc82ad62a67514677f82e20a05ae8077e16` |

（证据 `06-legacy-frozen-files.txt`；`git diff --name-only HEAD` 不含这些文件。）

### 5.2 候选文件（本批修改/新增；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/roles/product/index.ts`（M） | `bcfa91156fb4a869ae9240a67bc9c687330c1567903bb8857871da7766578661` | 2,611 | 45 |
| `src/common/roles/product/internal/capabilities.ts`（M） | `8a805f7d7ac5fcf9a083026ef20e8e1a0b30dcce4abb9c686c9cde6cca5c6e33` | 1,899 | 40 |
| `src/common/roles/product/internal/context.ts`（M） | `54e1c6e61875648d06c31b3f2a6079c2d022b0069c9ecdfdb9ba915d4982a8cb` | 5,478 | 70 |
| `src/common/roles/product/internal/dispatch.ts`（M） | `a9f3bb1492e7d62ed9cc7e6bf7986efb24580c5bc712785bd0ff0efaf9cbdef1` | 10,920 | 218 |
| `test/roles/product/product-fixed.test.ts`（新） | `123f98a0c2b697f9854e1c5c4037e7eb664e100827736177bc56e292338e23d9` | 15,680 | 313 |

- git numstat（M 文件）：`+128 / −9`（index +9/−4、capabilities +12/−0、context +41/−4、dispatch +66/−1）。
- **聚合哈希**（路径排序后逐行 `path:sha256` 以 LF 连接再 SHA-256，实测）：
  `3cfe4692b448fc21b34d92f107cd1932b3983fc3c073e5291596fb44a3c9ccf8`（证据 `07-candidate-hashes.txt`）。
- 角色记录（本记录、`api-spec.md`、`memo.md`、`feature-map.md`、`_evidence/`）同属本角色写集。

### 5.3 写集外 diff

- 本角色写集 = `src/common/roles/product/**`、`test/roles/product/**`、`角色卡/product-code/**`；
  实际改动**逐路径均在上表与本角色记录内**（`08-write-set-status.txt`）。
- 共享工作树存在**其他 owner**的并行 B2 改动（chief/convener/nominator/rapporteur/verifier code 与门禁引擎 B2
  基线文件）。这些文件**不是本角色写入**，本记录不以其为证据；本角色的写集外改动=0。
- `src/common/gates/`、`app/`、`src/model/`、`src/common/门禁引擎/`、`src/service/`、`src/pipeline/`、
  `src/provider/`、`package.json/lock`：本角色零改动、无新依赖。

## 六、限制与披露

1. 六角色 code B2 在本工作树并行写盘；本记录仅以 product 写集内容与独立复跑结果为证据，不据并行文件推断
   别角色完成度；亦不声称 T-13/AC-24 已通过独立验收。
2. fixed 会话的 `submitVersionChange` 不注入属运行时/编排过滤（B1 AC-23；`run-role.ts:2141-2142`），
   本模块 `tools()` 未做矩阵分支（`TrustedToolPolicyInput` 无 matrix 字段）；本记录不声称已实现该过滤。
3. 编排 `run-role.ts::cardKindsOf` 改调门禁引擎门面 `cardKindsOf` 属编排 B2；本模块已提供 `fixedCards`，
   编排当前本地实现同样只读该字段（`run-role.ts:3261-3269`）。
4. `role.product.dispatch.chiefProductionForbidden` 等 messageKey 仍未登记共享 i18n（属主 shared-code/i18n；
   同 E1 遗留）；fixed-only 稳定码已按 v1.3 §3.2 第 8 条登记于 `api-spec.md` §3.1 与测试。
5. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
6. 门禁引擎 5 项 known-red 与基线同名同因，未修复（非本批写集；不恶化）。
7. 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 七、未提交声明

- 本记录与 `_evidence/` 仅写入本角色记录目录（任务精确写集）；产品代码/测试仅写 Section 1 列明路径；
  **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本角色不判验收、不自行派发；回报路径与本记录一致（路径/哈希/测试计数/写集外说明）。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa…` |
| `00-baseline-status.txt` | 基线 `git status --porcelain -- src app test`（product 路径为空；含并行角色在飞文件） |
| `01-before-typecheck.txt` | 基线 `npm run typecheck`（exit 1：并行 verifier 测试瞬时类型错误，已披露） |
| `01-before-product-tests.tap` | before product TAP（29/29） |
| `03-after-typecheck.txt` / `03-after-typecheck-final.txt` | `npm run typecheck` exit 0 |
| `04-after-product-tests.tap` / `04-after-product-tests-final.tap` | after product TAP（39/39） |
| `05-gate-engine-targeted.tap` / `05-gate-engine-targeted-final.tap` | 门禁引擎定向 4 文件 TAP（37/37） |
| `06-legacy-frozen-files.txt` | legacy 未改文件 hash/行/字节 + product 路径 diff/status |
| `07-candidate-hashes.txt` | 候选文件 hash/bytes/lines + numstat + 聚合 SHA-256 |
| `08-write-set-status.txt` | 最终写集状态（含写集外并行文件分类） |
| `09-gate-engine-suite.tap` | 门禁引擎全量 TAP（499/493/5/1；5 known-red 同名） |
