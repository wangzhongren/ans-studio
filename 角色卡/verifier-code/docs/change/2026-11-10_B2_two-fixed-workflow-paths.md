# verifier-code B2 记录：两条固定工作流路径（verifier 角色模块 fixed 卡种 / fixed context）

- 日期：2026-11-10
- 角色：ANS 固定角色「verifier-code」（独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：verifier 模块 `fixedCards`、fixed context 段；legacy 数据/context 逐字冻结；
  本角色测试与记录）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa` + 门禁引擎 B2 工作树）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成；`npm run typecheck` exit 0；verifier 角色测试 29→36 全绿；
  legacy 指纹（context JSON / card.text / cards / capabilities / dispatch）逐字不变；本角色写集外零写入
  （共享工作树中其余改动为并行 B2 同批其他 owner 落盘，见 §5.3 如实披露）。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-09/AC-24/T-13） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§六 requestReleaseMerge 拒绝、§5.10） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / 35,665 B / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.4 verifier 行、§3.3 A12/A12a/A12b、§8.5/§12.2 Q7） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划（B2 verifier-code 写集；D1 证据口径） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 17,013 B / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 门禁引擎 B2 记录（MF-IR-4 门面 `cardKindsOf`/fixed 视图；known-red 基线） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 17,582 B / `6cd8c598480d77fa6abd39227be9330c9d2e9cd4253aa49b167c32c523966d62` |

三份冻结依据实测 hash 与任务给定值一致（证据 `b2-13-basis-hashes.txt`）；B1 锚点：
AC-09（A12a 实施前 criteria / A12b 后 report / 应用 `docs/acceptance` 归档 / 强度由幕僚任务文本调节）、
AC-24（六模块 legacy 数据冻结 + fixed 模块字段/context + requestReleaseMerge 按 Q2）、T-13（角色模块/工具面差分）。

## 二、B2 实施内容（对照任务条目）

### 2.1 fixedCards（`src/common/roles/verifier/index.ts`，M）

- 新增 `VERIFIER_FIXED_CARDS: readonly GovernanceCardKind[] = Object.freeze([])`（v1.3 §3.4 verifier 行 /
  §8.5 / G-IR §5.7 冻结值：verifier `fixedCards=[]`——固定路径**不发 acceptance 卡**；
  `docs/acceptance` 归档由应用生成）。
- 模块导出新增 `fixedCards: VERIFIER_FIXED_CARDS`（冻结数组，零复制同引用）。门禁引擎门面
  `cardKindsOf("verifier","two-fixed-paths/v1")` 只读本字段（`governance-roles.ts:416`），
  `test/门禁引擎/fixed-role-module-surface.test.ts` 的「提供则逐字断言冻结值」分支自本批起自动强化为
  `[]` 全量断言（实测通过）。
- **不从 legacy `cards` 过滤/推导**（G-2）：`fixedCards` 与 `cards` 不同引用；空集是冻结值，
  不是「缺失回退 legacy」的缺省。legacy `cards=["acceptance"]` 逐字保留（仅 legacy 消费）。

### 2.2 fixed context 段（同文件）

`context(input)` 按 `input.matrix` 分支（仅显式 `"two-fixed-paths/v1"` 返回 fixed 段；缺省/`"legacy-v1"`/
`context({})` 返回 legacy 同一引用）。fixed 两段（均为冻结纯数据、无 resources、无 I/O）：

| section id | 内容（v1.3 §3.4 verifier 行 / AC-09 / MF-7） |
| --- | --- |
| `verifier-fixed-review-role` | 幕僚直派的独立验收角色（运营不派、你不派发）；A12a 实施前 criteria → `docs/quality/<flowId>-criteria-vN.md`；A12b 实施后 report → `docs/quality/<flowId>-report-vN.md`、证据 `docs/verification/`；验收强度按任务文本调节（轻量/完整；调节深度不调节如实性；缺证写 insufficient evidence）；结论/证据 `submit_report` 如实回幕僚；不通过新 attempt 回 A11，缺证/失败 blocked/failed 回幕僚；与旧卡文本冲突时以本段为准（仅 fixed 会话） |
| `verifier-fixed-report-expectation` | 固定路径不发 acceptance 卡（fixed 卡种为空；不自批/不代选）；`docs/acceptance/<flowId>-acceptance-vN.md` 由应用在 A12b 完成时生成、角色只读不伪造；边界自律：只写 `docs/quality/`、`docs/verification/`、`docs/governance/verifier/`；**不派发、不实现、不改他人报告**；不代运营发布；fixed 不注入结构化 Git/trunk/VCA/stable 等 legacy 工具；只认指定最终完整 OID 与冻结 criteria，漂移不判通过 |

- 不新增工具/卡：`tools()` 仍为空声明；`RoleToolId` 仍 14 项；不新增 acceptance 客户卡（fixed 抑制）、
  不新增 `GovernanceCardKind`；无 `requestReleaseMerge`（G-IR §六拒绝项；源码零出现，测试断言）。
- fixed 段不混入/复制 legacy 段（`verifier-acceptance-card` 卡数据仅 legacy；fixed 段不含
  `cardKind="acceptance"`/accept/reject 发卡指引），id 全局唯一。

### 2.3 legacy 逐字冻结（同文件，未改）

- `card.text`：SHA-256 `ac9511ac64603ea5b14a1436854c78160f7c903d779e74400bc7b263cc165199`（B2 前后一致；
  既有差分金样 `test/roles/verifier/oracle-fixture.ts` 未改、断言未弱化）。
- `cards=["acceptance"]`、`capabilities`（customerInput true / dispatchTask false / shell operator-approve）、
  边界/预授权/禁写清单：逐字不变。
- legacy `dispatch()`（chief/convener→verifier 允许、reportToRoleId=真实来源；target 缺失 fail-closed）、
  `preflight(review)`（reviewTarget/CID/criteria + 未登记键 deny）、`tools()`：未改一行。
- `context()` legacy 两段：`context({})` / 缺省 / 显式 `"legacy-v1"` 返回**同一冻结引用**；JSON SHA-256
  B2 前后均为 `574a8d85ecaf42b479c4e84f7a09679802403186fbfa34100a2256336af35baf`（测试以字面量冻结）。
- 本模块未新增 fixed 派发分支：fixed 派发矩阵（chief→verifier 允许、convener→verifier 拒绝）由编排
  `src/common/编排/workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization` 属主实现
  （v1.3 §3.4 fixed dispatch 行）；legacy 消费点（`workflow-preconditions.ts`、
  apply-journal/trunk-runtime）不改读取源。

### 2.4 测试（`test/roles/verifier/verifier-fixed.test.ts`，新，7 tests）

| test | 覆盖 |
| --- | --- |
| fixedCards | `[]` 冻结值；与 legacy `cards` 不同引用（不回退/过滤）；卡种闭集；同引用 |
| fixed context 内容 | 两段 id/顺序/冻结；A12a/A12b 路径、强度调节、submit_report/如实、`docs/acceptance/<flowId>-acceptance-vN.md` 应用归档、不派发/不实现/不改他人报告；不含 legacy acceptance 卡数据 |
| fixed context 纯性 | 治理模型/facts 不影响输出、同引用、输入不被修改、与 legacy 段 id 不混 |
| legacy context 冻结 | `context({})`/缺省/`legacy-v1` 同一引用；JSON 哈希 `574a8d85…`；legacy acceptance 段保留 |
| legacy 规格冻结 | `card.text` 哈希 `ac9511ac…`、cards、capabilities、entries、legacy convener→verifier 允许 |
| 拒绝项 | 模块源码无 release 合并请求 token（拼接构造扫描）；tools 空 |
| 测试纪律 | `test/roles/verifier/**` 无跳过/强制退出 token（`b2` 目录自扫描；不新增 skip/force-exit） |

既有 `verifier-module.test.ts`（17 tests）与 `verifier-differential.test.ts`（12 tests，含冻结契约 hash
`067e3d2e…`/金样 payload hash）**未改一行**、未删除/弱化任何断言。

## 三、值表（v1.3 §3.4 / G-IR §5.7 冻结）

| 字段 | legacy（冻结） | fixed（本批） |
| --- | --- | --- |
| `cards` / `fixedCards` | `["acceptance"]` | `fixedCards=[]`（acceptance 固定路径抑制） |
| context | 两段：acceptance 卡数据 + 报告期望（JSON `574a8d85…`） | 两段：A12 验收角色 + 报告/归档期望（JSON `382b5cc9…`） |
| dispatch | chief/convener→verifier 允许（逐字） | 不在本模块：编排 fixed 谓词（chief 允许含 MF-10 reviewRoleId；convener→verifier 拒绝） |
| tools / preflight | 空声明 / review 专用（逐字） | 同左（无专属工具；preflight review 保留） |

## 四、验证结果

### 4.1 类型检查

- 基线（本批改动前，含门禁引擎 B2 工作树）：`npm run typecheck` **exit 0**（证据 `b2-03`）。
- 本批落地后 + 并行 B2 其他 owner 当前工作树：`npm run typecheck` **exit 0**（证据 `b2-04`、
  收尾复跑 `b2-20`）。

### 4.2 verifier 角色套件 before/after（`node --test --test-concurrency=1 --test-reporter=tap "test/roles/verifier/**/*.test.ts"`）

| | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| before（B2 改动前） | 29 | 29 | 0 | 0 |
| after（本批） | 36 | 36 | 0 | 0 |

- 新增 7 tests 全绿；既有 29 tests 全部保留且通过（legacy 差分不变）；失败名集合 before=after=∅；
  新 skip=0。

### 4.3 消费方/跨层套件（如实）

| 套件（命令同 `node --test --test-concurrency=1 --test-force-exit --test-reporter=tap <glob>`） | 结果 | 失败名集合对照 |
| --- | --- | --- |
| `test/roles/**`（六角色 B2 并行落盘后） | **275 / 275 pass / 0 fail / 0 skip**（证据 `b2-11`） | 无失败 |
| `test/门禁引擎/**`（fixed 模块面/矩阵消费方；本批后自动强化 `fixedCards=[]` 断言） | **499 tests / 493 pass / 5 fail / 1 skip**（证据 `b2-10`） | 与门禁引擎 B2 记录 after 失败名集合**逐名一致 5/5**（`GATES-FAILURE-NAME-SET-IDENTICAL`，证据 `b2-19`）；无新增确定性失败、无新 skip |
| `test/编排/**`（fixed context 注入消费方 + 编排 known-red 基线） | **1250 tests / 1224 pass / 24 fail / 2 skip**（证据 `b2-16`） | 与 B1 编排记录 24 known-red 失败名清单**逐名一致 24/24**（`FAILURE-NAME-SET-IDENTICAL`，证据 `b2-17/18`）；无新增确定性失败、无新 skip |
| `test/编排/run-role-fixed.test.ts`（B1 AC-12/AC-23 fixed context 注入） | **2 / 2 pass**（证据 `b2-12`） | 无失败 |

- 跨角色红如实：门禁引擎 5 个 known-red（`卡文本：运营负责落盘工作流…`、`渲染过滤：section=roles/routing…`、
  `listProject：枚举真实项目…`、`listProject：实际已接受的四份运行时组卡…`、`D-10：质检卡…`）与编排
  24 个 known-red 均为 B1/G-IR/门禁引擎 B2 记录既有基线，同名同因，**非本批引入**；本批未修复、未恶化。
- 其余跨角色套件（如 `test/桌面应用/**`、`test/runtime-core/**`、version-change/optional-acceptance 等
  known-red 组合）不在本批模块字段的直接消费面且存在既有 known-red，本批次未逐套复跑；不声称其状态。

### 4.4 legacy 冻结证据（before/after 指纹）

- 模块文件：before `bbc5c258f6d58571859dd4f9ed357fb013fc4e79c4702e6b2c4e8523a21407f0` →
  after `93a65837b4edccefcabcad11b0beceeed977272585f11ceaf1e5337637b4fc51`（差异仅 fixed 新增）。
- legacy context JSON `574a8d85…` **前后完全一致**；`card.text` `ac9511ac…` 前后一致；
  `cards`/capabilities/entries 前后一致（证据 `b2-01`/`b2-07`）。
- fixed 数据实测：`fixedCards=[]`（frozen）；fixed context ids
  `["verifier-fixed-review-role","verifier-fixed-report-expectation"]`，JSON `382b5cc9…`；
  跨输入同引用（纯静态模板）。
- 门禁引擎 fixed 卡种/矩阵视图在六模块 fixed 字段落地后仍全绿（`test/门禁引擎` 499/493/5/1，
  失败名同上；fixed 视图未引入新红）。

## 五、候选与写集

### 5.1 候选文件（本角色 B2 写集；raw SHA-256 / bytes / lines（`wc -l`））

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/roles/verifier/index.ts`（M） | `93a65837b4edccefcabcad11b0beceeed977272585f11ceaf1e5337637b4fc51` | 29,198 | 475 |
| `test/roles/verifier/verifier-fixed.test.ts`（新） | `675547e22b6720b8fe0e8b9ee6db47850dadcc18097942c6274f8795227fe11c` | 11,620 | 224 |

- 2 文件合计 **40,818 bytes**；git numstat（M 文件）：`+68 / −2`。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接（`\n`）的 SHA-256，实测复算见证据
  `b2-14-candidate-hashes.txt`）：`c575d44fd3d731d42694538b61e8ce3088653ba20fb48b6c8db204b3a83e2538`。

### 5.2 写集外（本角色）零写入

- 本角色只写了上述 2 个文件 + 本记录与 `_evidence/`；未改 `test/roles/verifier/oracle-fixture.ts`、
  未改既有 verifier 测试、未改 `src/model/role.ts`/门禁引擎/编排/桌面/运行时核心、`package.json/lock`。
- `git diff --stat -- src/common/roles/verifier` 仅 `index.ts`（+68/−2）；`test/roles/verifier` 仅新增
  `verifier-fixed.test.ts`（证据 `b2-08`）。

### 5.3 共享工作树披露（不冒充写集外 diff=0）

- 工作树为**六角色 B2 并行共享工作树**。本角色基线快照（`b2-00`，UTC 07:13:52Z）时
  `git status -- src app test` 仅门禁引擎 B2 的 5 M + 4 新文件；随后并行同批其他 owner（chief-code、
  convener-code、nominator-code、product-code、rapporteur-code）陆续落盘（当前快照 `b2-08`，
  UTC 07:25:43Z）。
- 当前工作树中本角色写集之外的改动**均非本角色所为**，属并行 B2 同批其他 owner：
  `src/common/roles/{chief,convener,nominator,product,rapporteur}/**`、`src/common/门禁引擎/**`、
  `src/model/role.ts`、`src/service/governance-matrix/**`、`test/roles/{chief,convener,nominator,product,rapporteur}/**`、
  `test/roles/rapporteur/spec.test.ts`、`test/门禁引擎/**`（详见 `b2-08` 全清单）。
- 因此本记录**不声称全工作树「写集外 diff=0」**；本角色层面的写集外写入为 0，全工作树 diff 由
  Scheduler/D1 汇总各 owner 后判定。

## 六、限制与披露

1. 本批只实现 verifier 模块的 fixed 卡种/context（任务固定值）；fixed 派发谓词、A12 归档生成、
   `docs/acceptance` 幂等写入属编排/桌面/运行时核心 owner（写集外），本批不实现、不声称完成。
2. 验收强度"由幕僚任务文本调节并记录"（AC-09）中，本模块只提供固定提示口径；实际强度调节记录在
   幕僚任务文本与验收报告（编排/独立验收属主）。
3. `test/roles/**` 275 全绿与 `test/门禁引擎` 5 known-red、`test/编排` 24 known-red 均为**本批测量窗口**
   内的共享工作树状态；并行 owner 后续落盘可能改变计数，判定以 D1 同一候选复测为准。
4. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
5. 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 七、未提交声明

- 本记录与 `_evidence/` 仅写入本角色记录目录（任务精确写集）；**未 commit / 未 push / 未 merge /
  未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `b2-00-baseline-head.txt` / `b2-00-baseline-status.txt` | 基线 HEAD `f72bafa` / 基线 `git status -- src app test`（仅门禁引擎 B2 文件） |
| `b2-01-before-legacy-fingerprint.txt` | 改动前模块文件 hash、legacy context JSON/card text hash、fixedCards 缺失 |
| `b2-02-before-verifier-tests.tap` | before verifier 套件 TAP（29/29/0/0） |
| `b2-03-before-typecheck.txt` | 基线 `npm run typecheck` exit 0 |
| `b2-04-after-typecheck.txt` / `b2-20-final-typecheck.txt` | 改动后 / 收尾复跑 typecheck exit 0 |
| `b2-05-after-verifier-tests.tap` | after verifier 套件 TAP（36/36/0/0；新增 7 全绿） |
| `b2-06-after-gates-fixed-surface.tap` | 门禁引擎 fixed 模块面/dispatch-matrix/role-module-contract 定向 31/31 |
| `b2-07-after-fingerprint.txt` | after 模块/legacy/fixed 指纹（legacy 同前；fixedCards=[]；fixed context hash/ids） |
| `b2-08-write-set-status.txt` | 写集快照：本角色 2 文件 + 并行 owner 清单（如实披露） |
| `b2-10-after-gates-full.tap` / `b2-19-gates-failure-diff.txt` | `test/门禁引擎` 全量 TAP（499/493/5/1）+ 失败名 5/5 一致 |
| `b2-11-after-roles-all.tap` | `test/roles/**` 全量 TAP（275/275/0/0） |
| `b2-12-after-runrole-fixed.tap` | `test/编排/run-role-fixed.test.ts`（2/2） |
| `b2-13-basis-hashes.txt` | 三份冻结依据 + 团队计划/门禁引擎 B2 记录 hash |
| `b2-14-candidate-hashes.txt` | 候选 2 文件 hash/bytes/lines、numstat、聚合 SHA-256 |
| `b2-15-reference-records-hashes.txt` | 参考记录 hash（团队计划/门禁引擎 B2 记录） |
| `b2-16-after-orchestration.tap` / `b2-17-after-orchestration-failure-names.txt` / `b2-18-orchestration-failure-diff.txt` | `test/编排` 全量 TAP（1250/1224/24/2）+ 24 known-red 名称 24/24 一致 |
