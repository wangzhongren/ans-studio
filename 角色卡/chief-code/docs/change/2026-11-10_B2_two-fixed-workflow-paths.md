# chief-code B2 记录：两条固定工作流路径（chief 角色模块 fixed 数据/上下文）

- 日期：2026-11-10
- 角色：ANS 固定角色「chief-code」（幕僚代码维护角色；独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：chief 模块 `fixedCards`/`fixedTargetRoleIds`、fixed context 段、本角色测试与记录；
  legacy 数据/返回值逐字冻结）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa`）+ 门禁引擎 B2 工作树（`src/model/role.ts`
  `fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`
  可选字段 + `governance-roles.ts::cardKindsOf`）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成；`test/roles/chief` 50/50 pass；`npm run typecheck` exit 0；
  legacy 指纹逐字不变（before/after 仅 9 行 fixed 新增）；门禁引擎只读回归失败名集合逐名一致
  （5 项既有 known-red，无新增/无消失）；本角色写集外无本角色改动。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24/T-13/EV-05） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§六 requestReleaseMerge 拒绝） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.2/§3.4 chief 行） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 门禁引擎 B2 记录（只读；接口/字段来源） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 218 行 / `6cd8c598480d77fa6abd39227be9330c9d2e9cd4253aa49b167c32c523966d62` |

- 三份任务给定 hash（`b607f100…`/`08e01726…`/`ae737dcf…`）与写盘实测一致。
- 基线工作树含门禁引擎 B2 未提交变更（属门禁引擎 owner，本角色只读消费其字段/门面）。

## 二、B2 实施内容（固定值，未扩展）

### 2.1 fixed 数据（`src/common/roles/chief/internal/spec.ts` M、`internal/module.ts` M）

| 字段 | 值（冻结顺序） | 消费/约束 |
| --- | --- | --- |
| `fixedCards` | `["intent-confirm","proposal","appointment"]` | fixed 矩阵卡种白名单＝固定路径 3 张客户确认卡；不发 acceptance 卡；不从 legacy `cards` 过滤/推导；门禁引擎 `cardKindsOf(id,"two-fixed-paths/v1")` 只读本字段，缺失由消费方 fail-closed |
| `fixedTargetRoleIds` | `["convener","verifier"]` | fixed 下 chief 可派内置目标（convener 仅 `purpose:"stage-request"`；verifier 为 review/preparation）；`governance-matrix` fixed 视图读取；缺失 ⇒ 消费方 fail-closed（不回退 legacy 五内置） |

- 两字段均为冻结只读数组、纯数据、无 I/O，只在 `matrix:"two-fixed-paths/v1"` 下消费。
- `tools()` **未新增**任何发布/合并工具（G-IR §六拒绝 `requestReleaseMerge`；本批模块源该 token 零出现，
  门禁引擎测试逐文件扫描通过）。trio 声明仍为冻结的 6 项。

### 2.2 fixed context 段（`src/common/roles/chief/internal/context.ts` M）

`chiefContext(input?)` 增加矩阵分支：

- 缺省 / `"legacy-v1"` / 无 matrix（`context({})`）⇒ **同一 legacy 冻结引用 `SECTIONS`**（三段：
  `chief-workflow`/`chief-decision-context`/`chief-intent-confirm`；资源 `chief-workflow/v1`），逐字不变；
- `matrix:"two-fixed-paths/v1"` ⇒ fixed 四段（新冻结表，顺序固定）：

| id | 覆盖内容（任务六要素） |
| --- | --- |
| `chief-fixed-path-dispatch` | 产线调度：两条固定路径 A1–A13 / B1–B4；只经 `taskKind:"stage-request"` 向 convener 发请求（read-only、无 module/写集）；**不派生产线角色**（`chief-production-dispatch-forbidden`）；open 请求不变量与 stop 顺序 |
| `chief-fixed-cards` | **3 张卡**（intent-confirm/proposal/appointment，不合并）；不发 acceptance 卡；merge-main 应用自有非判断卡、仅客户本人（judge 不可代批）；真实回执纪律 |
| `chief-fixed-review` | **独立验收**：A12a criteria（实施前）→ A12b report（实施后）、默认 verifier / reviewRoleId 项目验收角色、强度由幕僚调节、`docs/acceptance` 应用归档 |
| `chief-fixed-decision` | **依据专业建议决定**；**不自行做专业判断**；不代客户批准；缺证/失败 fail-closed 如实回报 |

- fixed 段不声明资源引用（`chief-workflow-v2.md` 注入属编排 B2 接线）；不携带权限/账本/运行时秘密。
- 模块 `dispatch()`/`preflight()` 本批**不改**（legacy 逐字冻结）。fixed 派发硬授权按 v1.3 §3.2 由编排
  B1 `src/common/编排/workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization` 实现（owner=编排），
  本模块按团队计划 B2 chief 行只提供 fixedCards/targets/context（未扩展 `dispatch` 行为，避免第二份判定源）。

### 2.3 测试（`test/roles/chief/fixed.test.ts` 新，8 tests）

| 覆盖 | 断言 |
| --- | --- |
| `fixedCards` 值 | 恰 3 卡/顺序/冻结/闭集/无重复；不含 acceptance/appointment-write/merge-main/stable-write/download/decision；与 legacy `cards`（`["intent-confirm"]`）引用不同、非过滤派生 |
| `fixedTargetRoleIds` 值 | 恰 `["convener","verifier"]`/冻结/内置成员；不含 product/rapporteur/nominator；legacy `CHIEF_HUB_DISPATCH` 五内置与 routing/source/report/purpose/schema 逐字不变 |
| fixed context | 显式 matrix 返回 4 段新冻结表（与 legacy 引用不同）；重复调用同引用；六要素文本逐项断言；不含 `chief-workflow.md`/`chief-workflow/v1` 资源串 |
| legacy context 不变 | 缺省/显式 legacy-v1/空输入/single+facts 均返回同一 legacy 冻结引用；三 id、资源引用、关键文本断言 |
| 无发布合并工具 | trio 6 项冻结；模块对象无 release/merge 键；模块源逐文件零出现拼接构造的 forbidden token |
| 纯数据 | 重复读取不改写模块/legacy JSON；fixed 段稳定冻结引用 |

- 未删除/未弱化任何既有断言；未新增 skip/force-exit（测试内无 `skip`/`process.exit`）。
- `differential.test.ts`/`module.test.ts`/`imports.test.ts`/`oracle-fixture.ts` **未改**（legacy 差分逐字保留）。

### 2.4 角色记录（本文件 + `api-spec.md` 更新 + `_evidence/`）

- `角色卡/chief-code/api-spec.md`：新增 §10「T3 B2 fixed 批次」（字段/context 分支/验证摘要），并更新
  `chiefRoleModule` 形状块；不改历史 E1/E2 段落。
- 证据见 §八；`_evidence/fingerprint.mjs` 为 before/after 指纹采集脚本（只读导入模块）。

## 三、值表（v1.3 §3.4 / G-IR §5.7 冻结；本角色列）

| 项 | legacy（冻结，不变） | fixed（本批新增） |
| --- | --- | --- |
| `cards` / `fixedCards` | `["intent-confirm"]` | `["intent-confirm","proposal","appointment"]` |
| 派发目标 | `CHIEF_HUB_DISPATCH.targetRoleIds`＝五内置 | `fixedTargetRoleIds=["convener","verifier"]` |
| 工具 | 6 项（含 `closeCreatedTask`；`decidePendingRequest` 仅独立决策上下文） | 同左；**不新增发布/合并工具** |
| context | 三段（legacy 资源 v1） | 四段 fixed（不声明资源；v2 资源注入属编排） |
| card.text / capabilities | 逐字冻结（sha256 `bdca98f9…`；七字段不变） | 不改（fixed 不就地改 legacy 数据） |

## 四、验证结果

### 4.1 类型检查

- `npm run typecheck`：**after exit 0**（证据 03/03-final）。
- before 快照（我的改动前）曾 **exit 1**：唯一错误为并行 verifier 批次在途测试文件
  `test/roles/verifier/verifier-fixed.test.ts(96,26) TS2339`（该批次后续修复）；本角色未改他人模块。
  该瞬态已如实记录（证据 03-before），随后复跑 0。

### 4.2 本角色测试（`node --test --test-concurrency=1 --test-force-exit --test-reporter=tap "test/roles/chief/*.test.ts"`）

| | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| before（既有 42 项） | 42 | 42 | 0 | 0 |
| after（+ `fixed.test.ts` 8 项） | 50 | 50 | 0 | 0 |

- 失败名集合 diff 为空；新增确定性失败=0；新 skip=0。

### 4.3 门禁引擎只读回归（`test/门禁引擎/*.test.ts`）

| | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| before | 499 | 493 | 5 | 1 |
| after | 499 | 493 | 5 | 1 |

- 失败名集合 **逐名一致**（5 项既有 known-red，与门禁引擎 B2 记录/baseline 同名同因，未恶化/未消失）：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- 本批后门禁引擎 MF-IR-4 测试自动强化并通过：`cardKindsOf(fixed)` 读模块 `fixedCards`（ok 179）、
  chief `fixedTargetRoleIds` 冻结值（ok 180）、`requestReleaseMerge` 零出现（ok 183）。

### 4.4 legacy 冻结证据（before/after 指纹）

- `_evidence/02-before-fingerprint.txt` vs `06-after-fingerprint.txt` diff **仅 9 行固定新增项**：
  `module.fixedCards`（null→3 卡）、`module.fixedTargetRoleIds`（null→2 目标）、`context.fixed.*`（legacy→fixed）
  与 `context.fixed.sameAsLegacyRef`（true→false）；**无任何 legacy 行变化**。
- 逐字不变（前后同值）：`module.cards`、`capabilities`、`card.text` sha256/length/lineCount
  （`bdca98f9…`/1680/22）、entries/preauthorized/forbidden、`CHIEF_HUB_DISPATCH`（`fef9a265…`）、
  `CHIEF_INTENT_CONFIRM_CARD`、`CHIEF_WORKFLOW_RESOURCE`、tools trio/single、dispatch 10 例、preflight 6 例、
  legacy context JSON/sha256（`65d2b9b6…`）/资源引用。
- legacy context sha256 前后同为 `65d2b9b6bd136d4c7f998b6b8ccc2e0d5c0be97e8c67193fd90b6bf752f1b42b`；
  fixed context sha256（after）`30802baedc97114bef8aaa82a7be24f9cb33f207a5b99a84e3e46b8da08fb522`。

## 五、候选与写集

### 5.1 候选文件（本角色 B2 代码/测试写集；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/roles/chief/internal/context.ts`（M） | `343d234945e0ae6e38f48a076b1a0117250320e9fe40ef9754c6a682a2dcaa8d` | 8,956 | 122 |
| `src/common/roles/chief/internal/module.ts`（M） | `c3204927a5da12d6c0120b1fb92759730beef8f05ac74a1c1cffe5f8118ab269` | 1,538 | 38 |
| `src/common/roles/chief/internal/spec.ts`（M） | `d2ec7b2728784909a68e74125a8e613731eae5128515181d9ea7bf4f84f9c964` | 4,772 | 106 |
| `test/roles/chief/fixed.test.ts`（新） | `55971528694f3a793e160b4321bae394e65c77d7071bc1bea0bcb4f5f943f65c` | 14,989 | 258 |

- 4 文件合计 **30,255 bytes**；git numstat（M 文件）：context `+73/−3`、module `+6/−0`、spec `+35/−1`
  （新测试文件 +258 行，属未跟踪新文件，不在 numstat）。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接、SHA-256；证据 08d）：
  `e09d7c07f43860dab8e8cce8c97286e50a9c1759f237690f3fbe222bf63bf9d5`。
- 记录文件（本文件、`api-spec.md`、`_evidence/`）不进入候选代码聚合（角色记录，落盘后由回报/验收复算）。

### 5.2 写集与写集外 diff

- 本角色写集（`git status --porcelain -- src/common/roles/chief test/roles/chief`）恰 4 文件
  （3 M + 1 新），无其他；`git diff --stat` 仅上述 3 M 文件（+114/−4）。
- 零 diff 守卫路径实测为空：`src/common/gates`、`app`、`src/pipeline`、`src/provider`、
  `src/common/编排`、`src/service/trunk`、`package.json`、`package-lock.json`、`src/model/runtime.ts`
  ——本角色未触碰。
- **披露（并行批次）**：同一工作树有其余五个 code 角色 B2 批次在途（`src/common/roles/{product,rapporteur,
  nominator,convener,verifier}/**`、`test/roles/…-fixed*.test.ts`）与门禁引擎 B2 变更（`src/model/role.ts`、
  `governance-roles.ts`、`src/service/governance-matrix/**`、`test/门禁引擎/*`）。这些路径**不属于本角色改动**，
  由各 owner 记录；全工作树 status 快照见证据 07，本记录不声称全局 diff=0。

## 六、限制与披露

1. 本批只实现 chief 模块 fixed 数据/上下文与测试；fixed 派发硬授权、stage-request 原语、fixed 矩阵视图、
   `chief-workflow-v2.md` 注入分别属编排/门禁引擎/桌面 owner（v1.3 §10 写集）；本角色不改其文件。
2. `requestReleaseMerge` 未新增（G-IR §六拒绝）；`RoleToolId` 仍 14 项（门禁引擎测试 ok 183 佐证）。
3. 并行 batch 影响：before 快照时 `npm run typecheck` 因 verifier 批次在途测试瞬时红（唯一错误，
   已披露于 §4.1）；门禁引擎 before/after 均在并行写入过程中采集，但失败名集合逐名一致、计数一致。
   若并行批次后续继续改动，最终 B2 验收须在同一候选 HEAD 复测（AC-28 同一候选口径）。
4. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
5. 测试运行命令使用 `--test-force-exit`（沿用门禁引擎 B2 记录 §4.3 的环境适配；仅为 CLI 参数，
   测试代码内**无** `test.skip`/`process.exit`/force-exit 改动；before/after 同一命令）。
6. 指纹脚本动态 import 模块（Node 类型剥离），不读盘旧引擎；测试均为纯只读断言。
7. 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余 hash 均为写盘实测。

## 七、未提交声明

- 本记录、`api-spec.md`、`_evidence/` 仅写入本角色记录目录；代码/测试仅写入本角色写集
  （`src/common/roles/chief/**`、`test/roles/chief/**`）。**未 commit / 未 push / 未 merge / 未 tag / 未发布**；
  未运行真实模型/Electron；未占用 9222/9223。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa` |
| `00-baseline-status.txt` | 基线 `git status --porcelain -- src app test`（含门禁引擎 B2 在途） |
| `00-after-status-snapshot.txt` | 实施后全工作树 status 快照（含并行五角色批次，披露用） |
| `01-before-test-roles-chief.tap` | before chief 测试 TAP（42/42/0/0） |
| `01-before-test-门禁引擎.tap` | before 门禁引擎全量 TAP（499/493/5/1） |
| `02-before-fingerprint.txt` | before 模块/legacy/fixed 指纹（fixed 尚未实现） |
| `03-before-typecheck.txt` | before typecheck（exit 1：并行 verifier 在途测试单点错误，见 §4.1） |
| `03-after-typecheck.txt` / `03-after-typecheck-final.txt` | after `npm run typecheck` exit 0（含收尾复跑） |
| `04-after-test-roles-chief.tap` | after chief 测试 TAP（50/50/0/0） |
| `05-after-test-门禁引擎.tap` | after 门禁引擎全量 TAP（499/493/5/1） |
| `06-after-fingerprint.txt` | after 模块/legacy/fixed 指纹 |
| `06b-fingerprint-before-after.diff` | before/after 指纹 diff（仅 9 行 fixed 新增项） |
| `07-write-set-and-diff.txt` | 本角色写集 status/diff + 零 diff 守卫路径 + 全工作树 status（并行披露） |
| `08-candidate-hashes.txt` / `08b-numstat.txt` / `08c-candidate-lines.txt` / `08d-candidate-aggregate.txt` | 候选 raw SHA-256/bytes/lines、numstat、聚合（`e09d7c07…`）/总字节 |
| `09-before-failure-names.txt` / `09-after-failure-names.txt` / `09-failure-names-diff.txt` | 门禁引擎失败名集合及 diff（空 = 逐名一致） |
| `fingerprint.mjs` | before/after 指纹采集脚本（只读） |
