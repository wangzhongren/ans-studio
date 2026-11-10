# rapporteur-code B2 记录：两条固定工作流路径（fixed 卡种/提示段）

- 日期：2026-11-10
- 角色：rapporteur-code（策划代码维护角色；独立固定上下文；任务书称「策划」）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B2**（本角色批次：rapporteur 模块 `fixedCards` + fixed context 段；legacy 数据/行为逐字冻结）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f72bafa` + 门禁引擎 B2 工作树
  （`src/model/role.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/service/governance-matrix/**` 已含
  MF-IR-4 接口字段；见 §五 hash 对照）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B2 写集完成；`npm run typecheck` exit 0；`test/roles/rapporteur/**` 75/75 全绿
  （基线 67/67，新增 8 tests）；legacy 指纹 before/after 逐字节一致（diff=0）；本角色写集外零写入。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-24/T-13、EV-05） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（§5.7/MF-IR-4、§八/§九） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / 35,665 B / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.4 rapporteur 行） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划（B2 rapporteur-code 行） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 行 / 17,013 B / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 门禁引擎 B2 记录（接口/值表/`cardKindsOf`） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 读取；其 §三值表与 §5.1 hash 用于对照 |

三者 hash 与任务书给定前缀（`b607f100…`/`08e01726…`/`ae737dcf…`）一致（证据 `01-basis-verification.txt`）。

## 二、B2 实施内容（对照任务固定值）

### 2.1 `fixedCards: ["decision"]`（`internal/spec.ts` + `index.ts`，M）

- 新增冻结常量 `RAPPORTEUR_FIXED_CARDS = Object.freeze(["decision"])`，并在唯一 public entry
  `index.ts` 装配为模块字段 `fixedCards`（T3 v1.3 §3.4 / G-IR §5.7 **MF-IR-4** 冻结值：
  rapporteur fixed＝`["decision"]`，决不从 legacy `cards` 过滤推导）。
- 约束落实：纯数据、冻结、去重；只列 `decision`（不含 `proposal`/`intent-confirm`/`appointment`/
  `appointment-write`/`acceptance`/`merge-main`/`stable-write`/`download`）；`fixedCards` 是
  门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")` 的唯一读取源（零复制同引用，由门禁引擎测试自动断言）。
- **未新增工具/卡**：`RoleToolId` 仍 14 项；`GovernanceCardKind` 闭集未扩；`fixedCards` 仅收窄
  legacy `["proposal","decision"]` → `["decision"]`（fixed 方案卡归幕僚）。

### 2.2 fixed context 段（`internal/context.ts`，M）

- 仅当显式 `matrix:"two-fixed-paths/v1"` 时返回 3 个新冻结 section（新 id，均已冻结）：
  1. `rapporteur-fixed-role`：运营（convener）为生产线唯一派发者；按运营派发撰写
     **方案 + 人员名单 + 项目模块 + 项目架构 + 契约（含验收标准）**并写入 `docs/proposals/`、
     `docs/contracts/`（治理工作记录 `docs/governance/rapporteur/`）；**方案确认卡由幕僚呈**、
     策划不发起 proposal 卡；**不派发、不实现、不写 `docs/planning/`、不自行增删角色**；
     真实变化出新 `-vN`（不原地改、旧版只读）；需求变更走实际注入的 `request_requirement_change`
     （申请≠批准、不得自批）；与旧卡文本冲突时以本段为准，**run 择时/结构化 Git 段在固定路径不适用**
     （`submit_version_change`/`select_run_change`/结构化 Git 工具 fixed 不注入，工具以实际注入为准）。
  2. `rapporteur-fixed-decision-card`：fixed 唯一可发起卡种 `decision`（材料性选择/需求变更审批）；
     意图/方案/任命三卡均由幕僚呈报；固定路径不发 acceptance 卡；结构约束（`request_choice`、
     ≥2 不重复选项、恰一 `recommended: true`、发起方不得自批）与 legacy 相同。
  3. `rapporteur-fixed-report-expectation`：`submit_report` 回真实创建者（fixed 生产线任务通常为运营
     convener）；报告不是任务关闭；不得自报身份/伪造批准；保留依据版本/hash 与错误证据。
- 判定顺序（fail-closed）：非 trio/未知 → 单一不可用声明；未登记 facts → 单一拒绝性 section
  （不读取内容）；trio + 显式 fixed → fixed 段；trio + 缺省/`legacy-v1`/未知矩阵值 → legacy 4 段。
  fixed 只由显式冻结值选择（与门禁引擎 `cardKindsOf` 口径一致；不猜测、不静默升级）。
- run-role（编排 B1，已存在）在 fixed 会话调用 `context({governanceModel,matrix:"two-fixed-paths/v1"})`
  `.map(text)` 追加注入——本模块 fixed 段即经此消费；无新增资源文件、无 `resources` 引用。

### 2.3 legacy 逐字冻结

- `card.text`（SHA-256 `4214c632…` / 4,676 字符 / 34 行）、`cards`（`["proposal","decision"]`）、
  capabilities（七字段）、`tools()`（trio 3 项）、`dispatch()`（来源=rapporteur 恒 deny）、
  `preflight.checkAction()` 全部**零改动**（代码未触碰这些文件/分支；差分 fixture
  `test/roles/rapporteur/oracle-fixture.ts` 与 `differential.test.ts` 未改）。
- `context({})`/`context({governanceModel:"trio"})`/显式 `legacy-v1` 返回**同一冻结数组引用**
  （legacy 4 段逐字旧文本；见 §四指纹）。

### 2.4 边界与未做项（如实披露）

- **未新增 fixed dispatch 分支**：fixed 派发权威是编排 `src/common/编排/workflow-dispatch.ts`
  （B1 单一实现；`FIXED_CONVENER_BUILT_IN_TARGETS` 已含 rapporteur）。团队计划 B2 rapporteur-code
  行为「fixed 提示/能力；legacy 冻结」；AC-24/T-13 的模块新增项为 `fixedCards`/targets/context。
  本模块 `dispatch()` 是按现有 E1 语义的**来源=rapporteur** 纯策略（rapporteur 不派发），
  传入 `matrix` 时仍返回与 legacy 相同判定（不复制第二张表、不越权实现编排矩阵）。
- **未新增 `requestReleaseMerge`**（G-IR §六拒绝；`RoleToolId` 14 项不变）；未改 `preflight`/`tools`；
  未新增 skip/force-exit；未改角色卡/边界/`api-spec.md`（写集外）。
- `test/roles/rapporteur/spec.test.ts` 的「模块只暴露约定字段」断言同步为含 `fixedCards` 的新键集
  （接口字段新增的必要同步；非断言弱化；并新增断言模块**不**暴露 chief/convener 专属 fixed 字段）。
- `spec.ts` 仅新增 `RAPPORTEUR_FIXED_CARDS` 与注释，`RAPPORTEUR_CARDS` 值/顺序逐字不变。

## 三、值表对照（v1.3 §3.4 / G-IR §5.7）

| 角色 | legacy `cards`（冻结） | fixed `fixedCards`（本批） | fixed 目标 |
| --- | --- | --- | --- |
| rapporteur | `["proposal","decision"]`（未改） | **`["decision"]`** | —（convener 侧 `fixedAllowedBuiltInRoleIds` 含 rapporteur，由 convener-code 批次实现） |

## 四、验证结果

### 4.1 类型检查

- `npm run typecheck`：**exit 0**（证据 `03-after-typecheck.txt`）。

### 4.2 本角色测试（`test/roles/rapporteur/**`）

| | tests | pass | fail | skipped | todo |
| --- | --- | --- | --- | --- | --- |
| before（B2 开始前基线） | 67 | 67 | 0 | 0 | 0 |
| after（本批后） | **75** | **75** | **0** | **0** | **0** |

- 新增 `test/roles/rapporteur/fixed-module.test.ts`（8 tests）：fixedCards 值/冻结/无新卡种；
  legacy cards/card.text/capabilities 逐字冻结（vs oracle fixture）；fixed context 覆盖任务要求
  （运营派发写方案+名单+模块+架构+契约、幕僚呈方案卡、不派发/不实现/不写 `docs/planning/`、不自行增删角色、
  `-vN`、run 择时/Git 段不适用）；缺省/legacy/未知矩阵返回 legacy 4 段（同引用）；非 trio/facts 仍
  fail-closed；纯函数/冻结/无资源；本批不新增 fixed dispatch 分支（模块返回值与 legacy 相同）；
  无 `requestReleaseMerge`、无 skip/force-exit。
- 既有 67 tests 零改动全绿（`context.test.ts`/`differential.test.ts`/`oracle-fixture.ts` 未改）。

### 4.3 legacy 指纹 before/after（证据 `02`/`06`/`07`）

`legacy-fingerprint.mjs` 对同一输入计算：规格 8 字段、卡文本 sha/长度/行数、entries/预授权/禁写、
capabilities、cards、tools(trio/single)、dispatch（6 用例）、preflight（24 用例）、
context（缺省/`legacy-v1`/空 facts/single/facts-rejected/null）。

- **before/after diff = 0 行（`07-legacy-fingerprint-diff.txt` 为空）**：legacy 面逐字节冻结。
- 代表值：context 缺省/显式 `legacy-v1`/空 facts 三者同 hash `928bd02a…`（同引用）；
  card.text sha `4214c632…`；dispatch `5e4975f9…`；preflight `ab44589b…`。

### 4.4 跨角色回归（如实）

| 套件 | 结果 |
| --- | --- |
| `test/门禁引擎/fixed-role-module-surface.test.ts` | **7/7 pass**（本模块 `fixedCards` 被逐字断言为 `["decision"]`、零复制同引用） |
| `test/门禁引擎/governance-matrix-fixed-view.test.ts` | **6/6 pass**（fixed 卡种路由含 rapporteur→decision；固定文案/派发分裂视图） |
| `test/门禁引擎/role-module-contract.test.ts` | **21/21 pass**（legacy 门面零复制装配/契约不变） |
| `test/编排/rapporteur-module-consumption.test.ts` | **7/7 pass**（run-role 注入/卡种/preflight 消费点不变） |
| 上述 4 文件合计 | **41 tests / 41 pass / 0 fail / 0 skip**（证据 `10-cross-role-regression.tap`） |
| `test/门禁引擎/**` 全量（`--test-force-exit`，与门禁引擎 B2 同口径） | **499 tests / 493 pass / 5 fail / 1 skip**（证据 `11-cross-role-gate-suite.tap`） |

- 全量套件 5 项失败**逐名**与门禁引擎 B2 记录 §4.3 的既有 known-red 完全一致（无新增、无消失）：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- 工作树为多角色并行共享：`src/app/test` 中本角色写集之外的改动（chief/convener/product/nominator/
  verifier 模块、门禁引擎/编排工作树、各自新测试）均为**并行批次写集**，本角色未写入（§五）。
- **跨角色红：仅上述 5 项既有 known-red（同名同因，本批未修复、未恶化）；本批引入的跨角色失败 = 0、
  新增 skip = 0（skip 仍 1，与门禁引擎 B2 基线同一 skip）。**

## 五、候选与写集

### 5.1 候选文件（本角色 B2 写集；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/roles/rapporteur/index.ts`（M） | `2c2c915fca8a1966851acb714b845a8965001959622219e20769e962958d22dc` | 3,414 | 67 |
| `src/common/roles/rapporteur/internal/spec.ts`（M） | `e44045c17daa96f8edc53af1958413a52bbb8994904d7fa62f2e10b9f2b99428` | 12,806 | 123 |
| `src/common/roles/rapporteur/internal/context.ts`（M） | `d2faee7e680cd37b5173ef09350472d3a985c4fe1c9815894fe9808dd816d922` | 11,277 | 144 |
| `test/roles/rapporteur/spec.test.ts`（M） | `2e578a36771cd6c10abf3f678a7d1354620df041426af3f90313cfed12353557` | 5,589 | 107 |
| `test/roles/rapporteur/fixed-module.test.ts`（新） | `1a0d31f5f5d3b80995bef11350c7843898a9a2a93429f5b19ffdc7f55d5171bd` | 10,602 | 202 |

- git numstat（M 文件）：`+101 / −8`（index +6/−2、context +63/−4、spec +15/−0、spec.test +17/−2）。
- 5 文件合计 **43,688 bytes**；聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256）：
  **`a239ed434e01a424b2f786e8a00f23df1b6b70e07e8575d31afb97891cd2b1c0`**
  （复算见证据 `08b-candidate-aggregate.txt`）。

### 5.2 写集外 diff=0（本角色口径）

- 本角色写入恰为：`src/common/roles/rapporteur/{index.ts,internal/spec.ts,internal/context.ts}`、
  `test/roles/rapporteur/{spec.test.ts,fixed-module.test.ts}`、本记录与本目录 `_evidence/`。
  未写 `src/common/roles/**` 其它角色、`src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、
  `src/pipeline/**`、`app/**`、角色卡/边界/`api-spec.md`、`docs/**`。
- 门禁引擎 B2 文件当前实测 hash 与其记录 §5.1 **逐项一致**（证据 `09-gate-engine-hashes.txt`）：
  `role.ts 960edbe…`、`governance-roles d58a1b8…`、`builder ea0e04a…`、`routing c74ef6d…`、
  `public 2411bcf…`——证明本角色未改门禁引擎写集。
- `git status --porcelain -- src app test` 中的其余改动均为并行批次写集（chief/convener/product/
  nominator/verifier + 门禁引擎/编排/桌面工作树），非本角色写入（证据 `09-write-set-guard.txt`）。

## 六、限制与披露

1. 共享工作树并行批次：本记录只对**本角色写集**负责；`git status` 中其它角色/门禁引擎/编排文件
   由并行会话写入，其状态与完成度不在本记录判定范围。
2. `fixedCards` 的消费方（门禁引擎门面 `cardKindsOf`）与 fixed context 的注入点（编排 run-role
   fixed 会话）均为他角色已落地工作树；本批已按其接口实现并被跨角色测试消费（§4.4）。
3. 本批未实现模块级 fixed dispatch 分支（§2.4）：fixed 派发矩阵由编排 `workflow-dispatch.ts`
   （B1）单一实现；若 B2 验收另有「模块级 convener→rapporteur 纯策略」要求，须经 Scheduler 明确
   扩展本角色任务后补做（不在本批自选扩权）。
4. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 独立验收或客户批准。
5. `test/门禁引擎` 全量套件已按门禁引擎 B2 同口径（`--test-force-exit`，并发 1）复测：499/493/5/1，
   5 项失败名与其 known-red 基线逐名一致（§4.4）；该套件不属本批写集，未修复。
6. 记录内聚合哈希为按证据 `08b` 逐文件表复算的派生值；文件 hash 为写盘实测。

## 七、未提交声明

- 本记录与 `_evidence/` 仅写入本角色记录目录（任务精确写集）；**未 commit / 未 push / 未 merge /
  未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 八、证据索引（同目录 `_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `f72bafa…` |
| `00-baseline-status-src-app-test.txt` | B2 开始前 `git status --porcelain -- src app test` |
| `00-after-status-all.txt` | 本批完成后全量 `git status --porcelain`（含并行批次） |
| `00-before-rapporteur-tests.tap` | before 本角色测试 TAP（67/67/0/0） |
| `01-basis-verification.txt` | 四份依据实测行数/字节/SHA-256 |
| `02-before-legacy-fingerprint.txt` | legacy 指纹 before（16 面） |
| `03-after-typecheck.txt` | `npm run typecheck` exit 0 |
| `03-after-typecheck-final.txt` | 收尾复跑 `npm run typecheck` exit 0 |
| `05-after-rapporteur-tests.tap` | after 本角色测试 TAP（75/75/0/0） |
| `05-after-rapporteur-tests-final.tap` | 收尾复跑本角色测试 TAP（75/75/0/0） |
| `06-after-legacy-fingerprint.txt` | legacy 指纹 after |
| `07-legacy-fingerprint-diff.txt` | before/after diff（空 = 0 差异） |
| `08-candidate-hashes.txt` | 候选文件 hash/bytes/lines + git numstat |
| `08b-candidate-lines.txt` | 5 文件逐行 `path:sha256`（路径排序） |
| `08b-candidate-aggregate.txt` | 聚合 SHA-256（`a239ed43…`）/总字节 |
| `09-write-set-guard.txt` | 本角色写集与写集外当前改动清单 |
| `09-gate-engine-hashes.txt` | 门禁引擎 B2 文件 hash 对照（与其记录 §5.1 一致） |
| `10-cross-role-regression.tap` | 跨角色消费面 4 文件 TAP（41/41/0/0） |
| `11-cross-role-gate-suite.tap` | `test/门禁引擎/**` 全量 TAP（499/493/5/1；5 项既有 known-red 逐名） |
| `legacy-fingerprint.mjs` | legacy 指纹脚本（只读导入模块/fixture） |
