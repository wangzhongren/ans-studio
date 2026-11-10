# nominator-code B2 记录：两条固定工作流路径（nominator 模块批次）

- 日期：2026-11-10
- 角色：ANS 内置角色「人事」代码维护角色（`nominator-code`；独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：nominator 模块 fixed 数据/上下文；MF-IR-4 / v1.3 §3.4 nominator 行）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafaa40c3d1eb529533e8f9e5fa7d6f982c9d`
  （B0 `ee5b330`、B1 编排 `24af13d`、B1 桌面 `f72bafa`）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成；定向 typecheck exit 0；`test/roles/nominator/**` 35/35 全绿
  （27 既有逐字不动 + 8 新增）；legacy 指纹逐字节不变（仅模块键集新增 `fixedCards`）；
  写集外本角色零新增改动。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24、T-13、EV-05） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§八/§九） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.4 nominator 行、§4.2 A7/A8、§3.7） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 门禁引擎 B2 记录（fixed 接口值表/`cardKindsOf`） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 只读；值表 §三与 v1.3 §3.4 一致 |

三份任务给定依据实测 hash 与给定值一致。基线 `git status --porcelain -- src app test` 为门禁引擎
B2 批次的既有改动（见证据 `00-baseline-status-src-app-test.txt`），本角色无基线改动。

## 二、B2 实施内容（对照任务条目）

### 2.1 fixed 数据：`fixedCards: []`（`src/common/roles/nominator/index.ts`，M）

- 新增冻结空数组 `NOMINATOR_FIXED_CARDS` 并挂到模块 `fixedCards`（MF-IR-4 六模块均提供的可选字段）。
- **任命卡归幕僚**（A10 由 chief 呈交）；`appointment-write` 仅 legacy 兼容通道，fixed 抑制（G-3）。
- fixed 矩阵只读本字段（门禁引擎门面 `cardKindsOf`），**不从 legacy `cards` 过滤**；空集是独立引用，
  与 legacy `cards=["appointment","appointment-write"]` 不同对象。
- 不新增工具/卡：`RoleToolId` 仍 14 项；`cards`/`capabilities`/`card.text`/`entries`/
  `preauthorizedDirs`/`forbiddenWritePaths` 逐字未动。

### 2.2 fixed context：`context({matrix:"two-fixed-paths/v1"})`（同文件，M）

只在 fixed 矩阵返回 3 个新段（纯静态数据、无资源引用、不读盘）：

| section id | 内容口径 |
| --- | --- |
| `nominator-fixed-duty` | 人事任务由运营（convener）派发（幕僚 stage-request → 运营生产线派发，A7）；报告回 `task.created.from`；任命确认卡由幕僚在 A10 呈交，fixed 不发起 appointment / appointment-write 卡（fixedCards 空）；不派发任何任务、不自行增删角色、不招名单外角色、不改名单/方案、不批准提案/验收、不代客户决定 |
| `nominator-fixed-activation` | 接到 A7/A8 激活任务后按最新名单（path+sha256）与 A6 提案决定（proposalDecisionId）机械写三文档（role-card.md / boundary.md / boundary.yaml）并整单调用 `activate_role_documents` v2；应用重算三文档实际字节 SHA-256（不一致 ⇒ `activation-hash-drift`）后记录 `role.activated`；边界只取角色名下模块文件/目录并集、模块属主唯一；名单/决定缺失或非法不写卡、如实阻塞回运营；激活失败保留旧有效卡 |
| `nominator-fixed-report` | `submit_report` 回短报（完成/阻塞、真实证据、遗留），报告回 `task.created.from`（固定路径通常为运营）；阻塞先报原创建者，不伪造批准/激活/完成 |

### 2.3 legacy 逐字冻结（本次未改）

- `card.text` / `cards` / `capabilities` / `entries` / `preauthorizedDirs` / `forbiddenWritePaths`：
  逐字未动；`context({})`、`context({governanceModel})`、显式 `matrix:"legacy-v1"` 仍返回
  legacy `CONTEXT_SECTIONS` **同一引用**（3 个旧 section 逐字不变）。
- legacy dispatch（chief→nominator 允许并报 chief；convener→nominator 拒绝；self/unknown/out-of-scope
  fail-closed）与 legacy preflight（`appointment` 两阶段、`intentEntryConsistent` 可选诊断、
  缺键/未知键/类型不符 fail-closed）逐字未动；fixed 矩阵参数**不改变**本模块 legacy 判定。
- `tools()`（trio ⇒ `["activateRoleDocuments"]`；single ⇒ `[]`；未知模型 fail-closed）未动。
- 差分 oracle（`governanceRoleOf`/`evaluateDispatchAuthorization`/`validateAppointmentCardAgainstRoster`/
  `validateRoleDocumentsSnapshot`）测试文件未改，27 项既有测试全部保留并通过。

## 三、值表（v1.3 §3.4 / G-IR §5.7 冻结）

| 角色 | legacy `cards`（冻结） | fixed `fixedCards` | fixed context |
| --- | --- | --- | --- |
| nominator | `["appointment","appointment-write"]` | `[]`（本批落地） | `nominator-fixed-{duty,activation,report}`（仅在 `matrix:"two-fixed-paths/v1"`） |

> 其余五角色 fixed 数据由各自 code 角色 B2 并行批次落地；本记录只声称 nominator 模块。
> fixed 派发（convener→nominator 允许、chief→nominator 拒绝）的权威实现在编排
> `src/common/编排/workflow-dispatch.ts`（B1），角色模块**不复制**第二张派发表。

## 四、验证结果

### 4.1 类型检查

- 定向 typecheck（本模块 + 本目录 3 个测试文件 + 夹具，`--ignoreConfig` 同 tsconfig 选项）：
  **exit 0**（证据 `03-targeted-typecheck.txt`）。
- 全仓 `npm run typecheck`：**exit 0**（证据 `03-full-typecheck.txt`）。
  - 披露：本批中途一次全仓 typecheck 曾报 `test/roles/verifier/verifier-fixed.test.ts(96,26):
    TS2339 Property 'resources' does not exist...`——该文件属**并行 verifier-code B2 批次**（当时正在写入，
    不在本角色写集）；其修正后同一命令 exit 0。本角色文件全程无该错误（定向 typecheck 首跑即 0）。

### 4.2 `test/roles/nominator/**` 回归

- 命令：`node --test --test-concurrency=1 --test-reporter=tap "test/roles/nominator/**/*.test.ts"`
- before（本批修改前）：**27 tests / 27 pass / 0 fail / 0 skipped**（与 WJ2b 记录 27/27 一致）。
- after：**35 tests / 35 pass / 0 fail / 0 skipped / 0 todo**（证据 `04-after-nominator-tests.tap`）。
- 新增 8 tests = `nominator-fixed.test.ts`（ok 13–20）：
  1. `fixedCards` 恒为空集且冻结——任命卡归幕僚、appointment-write 仅 legacy（G-3）
  2. legacy context 冻结：缺省/未传 matrix/显式 legacy-v1 逐字返回旧段（同一引用，3 sections）
  3. fixed context：matrix=two-fixed-paths/v1 返回固定段（3 sections；无 legacy 段、无资源引用）
  4. fixed context 口径：按运营派发、按名单机械建卡/激活、不自行增删角色、不发起任命卡/不派发
  5. 不新增工具/卡：fixed 批次不改 tools/cards/capabilities/card.text（legacy 冻结）
  6. fixed 矩阵不改变本模块 legacy dispatch 判定（fixed 派发权威在编排 workflow-dispatch.ts）
  7. preflight 不因 fixed 批次改变：appointment 动作集与 stage 语义保持 legacy
  8. 纯策略：fixed context 读取不改写模块数据与调用输入
- 未删除/未弱化任何既有断言；未新增 skip/force-exit；无新依赖。

### 4.3 跨角色交叉核对（只读，不作为本角色验收）

- 门禁引擎 `test/门禁引擎/fixed-role-module-surface.test.ts`（MF-IR-4 值表/`cardKindsOf`）：
  **7/7 pass**（证据 `05-crosscheck-gate-fixed-surface.tap`）。本模块提供 `fixedCards` 后，
  该测试对 nominator 自动进入「已提供」分支：`cardKindsOf("nominator", fixed)` 返回
  `module.fixedCards` 同一引用、值 `[]`、闭集/去重/legacy 专属卡种排除断言全部通过。
- 门禁引擎 `test/门禁引擎/role-module-contract.test.ts`：**20/20 pass**（含 X-R3 nominator 零复制装配）。

### 4.4 legacy 冻结指纹（before/after 逐字节比对）

- 证据 `01-pre-legacy-fingerprint.txt` vs `06-post-legacy-fingerprint.txt`，diff 仅 1 行
  （`06b-legacy-fingerprint.diff`）：模块键集新增 `fixedCards`；其余全部一致：
  - `card.text` = `6f72e240…`（3,496 chars）、entries/preauthorizedDirs/forbiddenWritePaths、
    capabilities（`7e36ab73…`）、cards（`9332d8fc…` = `["appointment","appointment-write"]`）；
  - `tools.trio`（`4f214c29…`）/`tools.single`（`9ae14794…`）；
  - 7 个 dispatch 用例判定逐字节一致；3 个 preflight 用例逐字节一致；
  - `context` 三种 legacy 调用的 ids/JSON hash（`50d5dfa9…`）与同引用断言全部一致。
- fixed 侧（`07-fixed-fingerprint.txt`）：`fixedCards.value=[]`、frozen、与 legacy cards 不同引用；
  fixed context ids = `["nominator-fixed-duty","nominator-fixed-activation","nominator-fixed-report"]`、
  frozen、无资源引用、与 legacy 不同引用；legacy 显式 `matrix:"legacy-v1"` 与缺省同引用。

## 五、候选与写集

### 5.1 候选文件（本角色 B2 写集；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/roles/nominator/index.ts`（M） | `af89a85e93ac0c18421fcef746673048adc72b78e77efeee6fca1380d16fd288` | 41,523 | 910 |
| `test/roles/nominator/nominator-fixed.test.ts`（新） | `fb610051d5b213c9fa202cfca26240e315f86f41d73efa8583f5fb8f8f8ebabd` | 11,478 | 197 |

- 2 文件合计 **53,001 bytes**；`git diff --numstat`（M 文件）：`+64 / −1`。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256，见证据 `08b-candidate-aggregate.txt`）：
  `019bc20bc0aa6b56430da83282ee1c5cd09915bd3d8bda032d57d12f2d78dd0b`。
- 未改（legacy 冻结）：`nominator-module.test.ts` `3375a9e7…`、`nominator-differential.test.ts`
  `6a9a5985…`、`fixtures/nominator-fixtures.ts` `2d8d856e…`（与 WJ2b 记录逐字一致）。

### 5.2 写集外 diff=0（本角色口径）

- 本角色改动 = 上表 2 文件 + 本记录目录（`角色卡/nominator-code/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md`
  与 `_evidence/`）；**无其它写盘**。
- 守卫路径（相对 HEAD）`git status --porcelain` 实测：`src/common/gates`、`app`、`src/pipeline`、
  `src/provider`、`src/common/编排`、`package.json`、`package-lock.json` **CLEAN（diff=0）**；
  `src/common/roles/chief` 在采集时 CLEAN，收尾快照时出现 chief-code B2 并行批次改动（非本角色）。
  （证据 `02-zero-diff-guard.txt`，含采集时与收尾两次快照。）
- 披露：本工作树被六个 code 角色 B2 批次共享；`src/service/governance-matrix/**`、
  `src/model/role.ts`、`src/common/门禁引擎/**` 为门禁引擎 B2 基线改动；
  `src/common/roles/{product,rapporteur,verifier,convener}/**` 与各自测试/记录为**并行角色批次**并发写入，
  不属于本角色写集、本角色未触碰（证据 `02-zero-diff-guard.txt` 全量状态清单）。本记录不据此声称
  其它角色/全量矩阵完成。

## 六、限制与披露

1. 本角色只实现 nominator 模块 B2（`fixedCards=[]` + fixed context 段）。其余五角色 fixed 数据属各自
   B2 并行批次；`cardKindsOf`/fixed 矩阵视图的装配代码属门禁引擎 B2；编排 `run-role` fixed context
   注入与 `cardKindsOf` 门面接线属编排 B2——均不在本角色写集，本记录不声称其完成状态。
2. v1.3 §3.4 提到的 nominator fixed preflight `stage:"activation"`（提案决定 + roster）**未在本批实现**：
   任务精确范围只列 `fixedCards` 与 fixed context，且 legacy preflight 冻结；如后续需要，须按接口
   评审另批落地（不新增工具/卡、不改 legacy 事实包）。
3. 本批未新增 `requestReleaseMerge`/任何工具/卡种；`RoleToolId` 仍 14 项。
4. 本工作树存在并行角色批次的并发写入，故全量套件/全量 diff 结果不可归因于本角色；本记录只以
   定向证据（本角色测试、定向/全仓 typecheck、门禁引擎交叉核对、前后指纹）作自检。
5. 本批中途观察到并行 verifier 批次的临时 typecheck 红（TS2339），其修正后全仓 typecheck exit 0；
   该红不属于本角色写集，未由本角色修改。
6. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
7. 证据脚本 `legacy-fingerprint.mjs` / `fixed-fingerprint.mjs` 位于本记录 `_evidence/`（只读采集，可复现；
   Node v24.22.1）。

## 七、未提交声明

- 本记录与 `_evidence/`、模块与测试改动仅写入本角色写集与记录目录；**未 commit / 未 push / 未 merge /
  未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa` |
| `00-baseline-status-src-app-test.txt` | 基线 `git status --porcelain -- src app test`（仅门禁引擎 B2 既有改动） |
| `00b-baseline-test-count.txt` | 本批前 `test/roles/nominator/**` 计数（27/27） |
| `01-pre-legacy-fingerprint.txt` | legacy 指纹 before（规格/工具/dispatch/preflight/context） |
| `02-zero-diff-guard.txt` | 写集外零 diff 守卫 + 全量状态归属披露 |
| `03-targeted-typecheck.txt` | 定向 typecheck exit 0 |
| `03-full-typecheck.txt` | `npm run typecheck` exit 0 |
| `03-full-typecheck-final.txt` | 收尾复跑 `npm run typecheck` exit 0 |
| `04-after-nominator-tests.tap` | after TAP（35/35；新增 8 项） |
| `04-after-nominator-summary.txt` | after 计数摘要 |
| `04b-after-nominator-tests-final.tap` | 收尾复跑 TAP（35/35） |
| `05-crosscheck-gate-fixed-surface.tap` | 门禁引擎 MF-IR-4 交叉核对（7/7 pass） |
| `06-post-legacy-fingerprint.txt` | legacy 指纹 after |
| `06b-legacy-fingerprint.diff` | before/after diff（仅模块键集新增 `fixedCards`） |
| `07-fixed-fingerprint.txt` | fixed 数据/上下文指纹（值、冻结、引用、文本） |
| `08-candidate-hashes.txt` | 候选文件 hash/bytes/lines + 未改文件 + numstat |
| `08b-candidate-aggregate.txt` | 2 文件逐行 `path:sha256` 与聚合 SHA-256（`019bc20b…`）/总字节 |
| `legacy-fingerprint.mjs` | legacy 指纹采集脚本（只读） |
| `fixed-fingerprint.mjs` | fixed 指纹采集脚本（只读） |
