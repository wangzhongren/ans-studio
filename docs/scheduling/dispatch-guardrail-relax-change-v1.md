# 变更包 E1：派发护栏只保留「谁能给谁派发」（dispatch-guardrail-relax）

- **任务 ID / flowId**：`2026-11-02-dispatch-guardrail-relax` / `dispatch-guardrail-relax`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-02
- **风险档位**：**T3**（治理/权限/派发受理语义变更；方案 §9、闸门 1/2 与团队计划确认，不压档）
- **候选身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；**产品/测试候选树 `79962115b301f9e2b7c6c0d19af8844335b1fef5`**（HEAD + 13 个产品/测试路径，复算方法见 §1.2）。
- **候选状态**：A1/B1/D1-fix 全部 `implemented-unverified`；D1 最终 T3 与 D2 E2E 已对当前候选取证；**本变更包不判通过/返工，不代替独立验收（E2）**。
- **提交/推送/发布**：**未授权、未执行**；本变更包不授权 commit/push/merge/release。
- **验收标准**：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（814 行 / SHA-256 `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3`，V1，实施前冻结）。E2 由沟通另起唯一验收主上下文判定。

---

## 一、候选身份与逐文件哈希

### 1.1 产品/测试候选（13 路径）

> 行数为当前工作区实测；sha256 为工作区字节哈希。`M`=修改，`A`=新增；全部落在团队计划 §4.3 写集。B1 的 `test/桌面应用/dispatch-fresh-enum.test.ts` 未修改（现有覆盖已满足），不在候选。

| # | 路径 | 节点/角色 | 状态 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/编排/workflow-preconditions.ts` | A1/编排 | M | 1337 | `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f` |
| 2 | `src/common/编排/dispatch-advisories.ts` | A1/编排 | A | 283 | `0781cd3db1201a724feb9ece4837aef4d23c043fa12e202cd01f0dd8d1e30d6f` |
| 3 | `src/common/编排/mechanical-rejection.ts` | A1/编排 | M | 190 | `1e1e65736d99d371dbf13bbc18d9d88a048d17ac7fd6475ee508cca623750a62` |
| 4 | `test/编排/workflow-preconditions.test.ts` | A1/编排 | M | 972 | `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b` |
| 5 | `test/编排/dispatch-advisories.test.ts` | A1/编排 | A | 304 | `72a3ad0cf9ee87d3cd0cecc7c96847463de7c1288103f016e7d433df0620c7e5` |
| 6 | `app/desktop/session.ts` | B1/桌面窗口 | M | 7819 | `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` |
| 7 | `test/桌面应用/chain-enforcement.test.ts` | B1/桌面窗口 | M | 1036 | `9e20c8b6360180b71fc0b0407f284803b48b4f7c4657d80779fcbebda9eb633b` |
| 8 | `test/桌面应用/star-routing.test.ts` | B1/桌面窗口 | M | 391 | `e0bfdfd6634b6ce811a0006eee5bde4ea6e2b78790d2ada2f0b1f849ccb4ba40` |
| 9 | `test/桌面应用/rejection-copy.test.ts` | B1/桌面窗口 | M | 268 | `8c7e7dcee84214addd9ff96071b83059470d117209a431a43851ca997686076f` |
| 10 | `test/桌面应用/run-pin.test.ts` | B1/桌面窗口 | M | 830 | `dad68b3b71c640341ed15a5e0b75020f3599f4cd75d3089c0346b592807773ed` |
| 11 | `test/桌面应用/run-change-trigger.test.ts` | B1/桌面窗口 | M | 479 | `1f9f93406d763e10ba36bd26342fba10f6ccb5981bc7e35b4fc2d1f1aa691976` |
| 12 | `test/桌面应用/run-change-entry.test.ts` | B1/桌面窗口 | M | 218 | `fc1a71f172495f198c32f735cdd43043f4818b6e794f318eb2ff6b61cf3ab16e` |
| 13 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | D1-fix/测试 | M | 229 | `b5d5c6c8411d71797479a452d611bb91a3b62146df6e05f54e0929f7e8545e6b` |

- `git status --porcelain -- src app test` 实测 **13 路径**，与上表一致；无写集外产品/测试改动。
- A1 五文件在整个 B1/D1/D2 期间哈希未变（B1 报告与沟通复核均逐项核对）；B1 未修改 A1 五文件。
- `test/测试/governance-e2e-auto/i-full-chain.test.ts` 为 D1-fix 的唯一测试迁移（见 §6.1）。

### 1.2 候选树复算方法

以临时索引从 `HEAD c80f494` 出发，仅加入上表 13 路径，再 `git write-tree`：

```bash
tmp=$(mktemp -d)
GIT_INDEX_FILE="$tmp/index" git read-tree HEAD
GIT_INDEX_FILE="$tmp/index" git add -- <上表 13 路径>
GIT_INDEX_FILE="$tmp/index" git write-tree   # → 79962115b301f9e2b7c6c0d19af8844335b1fef5
rm -rf "$tmp"
```

D2 E2E 前后复算候选树一致（`79962115…`）；管理/治理文档不进入产品候选树。

---

## 二、改动路径与节点

| 节点 | 角色 | 写集（相对候选） | 可观察交付 |
| --- | --- | --- | --- |
| A1 | 编排 | 上表 #1–#5 | 硬授权 + advisory 拆分；`evaluateDispatchAuthorization` 6 事实窄步骤 + `evaluateDispatchPreflight` 唯一复合入口；`DispatchPreflightInput` 增 `targetExists?`/`chiefRoleId: string \| null`/可选 `runFacts?`/`versionedDocBaselineViolations?`/`run.modules?`；`DispatchAdvisory` 23 code；契约冻结。 |
| B1 | 桌面窗口 | 上表 #6–#12（#12 为 `dispatch-fresh-enum` 未改，不计；实际 B1 为 session + 6 测试） | `routeStarDispatch` 按 R1 调用图接线；删除派发自动 run-change；R2 锚点；R3 evidenceScopeRoots；模块字段；legacy/run.roles/modules 口径；回执/系统行/诊断。 |
| D1 | 测试 | 只写 `角色卡/测试/docs/change/` 证据 | 受影响套件 + `test/桌面应用/**`/`test/编排/**` + T3 全量 + typecheck + F4 只读核对。 |
| D1-fix | 测试 | #13 | 把旧「运营未接交付 ⇒ 派实现被拒」迁移为「受理 + `handoff-missing` advisory + 任务行 +1」，保留其余断言。 |
| D2 | 测试 | 只写 `角色卡/测试/docs/change/` + E2E 产物（evidence 目录） | 真实 Electron E2E：`E2E_PASS=true`、exit 0、79s、30 PNG。 |

- 写集边界：A1 只写 `src/common/编排/{workflow-preconditions,dispatch-advisories,mechanical-rejection}.ts` + `test/编排/` 两文件；B1 只写 `app/desktop/session.ts` + 6 个 `test/桌面应用/` 修改；D1/D1-fix 只写 `test/测试/` 既有文件与测试证据；未写 `app/main.ts`/`preload`/renderer/`src/**` 其他层/共享/schema/角色卡/边界。
- H1（人事）已落地：`角色卡/桌面窗口/boundary.md`/`boundary.yaml` 补登 `test/桌面应用/run-change-trigger.test.ts`、`run-change-entry.test.ts`；H1 属治理变更，不进入产品候选树。

---

## 三、证据链接与哈希

| 证据 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 闸门 0/1/2 + 实施授权 | `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md` | 124 | `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f` |
| 客户确认方案 P1.1（语义基线） | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 方案当前版（R4 编辑性更正，仅 §13） | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 884 | `fa5902edce310f7960c88ac396f3ae940ca595eba079197ed5179b07410ab446` |
| 独立复核（F1–F12 + R1–R4） | `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| 团队计划 v1（确认版） | `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| 实施前验收标准 V1 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` |
| H1 boundary.md | `角色卡/桌面窗口/boundary.md` | 92 | `cbc6145503e7c67a2217ac683a82e5887e4a36dfb7d00956cca8792590f1cd3e` |
| H1 boundary.yaml | `角色卡/桌面窗口/boundary.yaml` | 247 | `866698979d7153251fc3aec8455a8bab1d2326497d530663ad65e7e629cd3e62` |
| H1 changelog | `角色卡/桌面窗口/changelog.md` | 197 | `5c9c42e50b177c8aaec43717d7e2a9b7525f33ef5bfa133f9dfe85d9c6d0ac58` |
| P1 A1 提案（Revision 2） | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md` | 707 | `75a184b27d0b0941367eeb2107c16e1aab13535a1876b7895c48e8ccc9f212e7` |
| P1 B1 提案（Revision 2） | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md` | 535 | `4dcb1ecab5bdfe3ddc19db243f1b83a8f4acbb2eba758716d5388e4a76f3c168` |
| P1 审核（Revision 2 复审） | `角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md` | 375 | `9006e2bdee86e2df5608e8b65d7f4c33a565ce73688877f4a5dd1f1475a10fac`（结论 `recommend approval`） |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |
| A1 实施记录 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation.md` | 105 | `958f22f4248f63ac4336b542c5ccd0ed8a052df77f4bc6685aa9bd00f6137794` |
| B1 实施记录 | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation.md` | 113 | `048aa4270b3a1fc064b2ea9bc34368b1862960a0a61b40b7c38dcf22bf70b87b` |
| D1 回归（含 D1-fix） | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D1-regression.md` | 287 | `12b581bac3f0627c170fc7c5ea8cbc0938bcb718c4674f1205f3f341ad90316c` |
| D2 E2E 记录 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D2-e2e.md` | 135 | `64051666014ca126713f45d5ec3e184e2ae46f0f277c558c70b55bbdf2920ec2` |
| D2 E2E report.txt | `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/report.txt` | 512 | `db0c82dc063802abfc286a4cc2579a13a4d9814d0dbde3a34ffe7f3d3a4d8227` |
| D2 stdout/stderr | `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/02-e2e-run.txt` | 190 | `99cd43c1a2cbea1187e434a277c8d1221d436ae4da9adb9c80a055012281dd5c` |
| E2 独立验收报告（R4 关闭后） | `docs/acceptance/dispatch-guardrail-relax-report-v1.md` | 323 | `e4dfbbb4b23f2ffda0a5e01e6a86651692320d809a6458a882879f3f536a1454` |

- 环境：Windows 11 Pro 10.0.26300 / Git Bash 3.6.10；Node v24.22.1 / npm 11.19.1；Electron 44.7.0；无 `.ans/project.json`（未启用 task_ops）。
- 角色证据目录：A1 `角色卡/编排/docs/change/2026-11-02-dispatch-guardrail-relax-A1-evidence/`；B1 `角色卡/桌面窗口/docs/change/2026-11-02-dispatch-guardrail-relax-B1-evidence/`；B0/D1/D2 `角色卡/测试/docs/change/...-evidence/`。

---

## 四、T3 回归与真实 E2E

### 4.1 T3 全量回归（最终候选）

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`
- 结果：**tests 3385 / pass 3358 / fail 9 / skipped 18 / todo 0**。
- 失败分类：**9 项全部为既有 Windows symlink EPERM**（与 B0 基线同类：`errno -4048`/`syscall symlink`；B0 已用独立 `%TEMP%` 探针证实环境限制）；**新增确定性失败 = 0**；**新增 skip = 0**。
- 排除：`test/pi-adapter/write-sequencing.test.ts` 为仓库既有已知挂起，按 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 允许在 T3 全量中排除但必须记录；命令中显式排除。
- `npm run typecheck`：**退出码 0**，无错误。渲染层未改，未跑 `typecheck:renderer`/`build:renderer`。
- 失败分类不是通过：9 项既有失败与候选无关，仍如实列为既有失败；不得把既有失败算作通过。

### 4.2 真实 Electron E2E（D2）

- 命令：`ANS_E2E_OUTDIR=<D2 evidence dir> node_modules/.bin/electron test/桌面应用/e2e/main.mjs`
- 结果：退出码 **0**，耗时 **79s**；`E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`；Electron 44.7.0 / 内置 Node 24.21.0；窗口 **1360×860**。
- 截图：**30 张 PNG**（当前候选真实运行、无 DEBUG 覆盖层、未使用/不要求录屏）；产物、sha256、窗口尺寸与命令见 D2 记录与 evidence 目录。
- 候选树 E2E 前后一致 `79962115…`；`test/桌面应用/e2e/main.mjs` 未修改。
- stderr 中 57 条 `background-tasks:list` 未注册 handler 的非致命报错与 1 条脚本自身的 `session:send` 失败注入探针已如实记录；脚本通过判据为 `hardChecks`/`repairChecks` 全 true，未把它们算作产品通过或产品失败。

---

## 五、证据复用与失效说明

- **B0 基线**：仅用于分类既有失败与环境（同一 HEAD c80f494、同一 Windows 环境）；B0 不证明候选实现，不能作为候选通过证据。
- **A1/B1 层证据**：A1 五文件哈希在 B1/D1/D2 期间未变；B1 的 7 个桌面测试与 A1 冻结契约在同一候选上通过（7 文件 61/61、A1 两文件 34/34、全量桌面 462/462）。这些证据对当前候选仍有效（输入/依赖未变）。
- **D1 初始全量**（12 路径、10 失败）：因 D1-fix 迁移 `i-full-chain` 而**失效**，由 D1 最终全量（13 路径、9 失败）取代；A1/B1 层证据不受该测试-only 变更影响。
- **D1 最终全量**：当前候选（13 路径、树 `79962115…`）的 T3 证据；D2 与 D1 使用同一候选树，E2E 前后一致。
- **D2**：同一候选树；E2E 证据有效。管理文档（团队计划/memo/证据记录）不进入候选树，不作为产品证据。
- **不可复用**：其它变更（shell-escalation、i18n、acceptance-evidence-path 等）的测试/验收证据不得替本变更背书；B0 的旧候选（HEAD）测试结果不得当作候选通过。

---

## 六、披露事项（验收需知悉）

### 6.1 §7.3 迁移表漏列 `i-full-chain`

- 方案 §7.3 与团队计划 §7.3 的测试迁移表未列 `test/测试/governance-e2e-auto/i-full-chain.test.ts`；D1 发现该既有测试仍断言旧语义「运营未接交付 ⇒ 派实现被拒」，在新语义下应为**受理 + `handoff-missing` advisory + 任务行 +1**（方案 §7.3 P4 / AC-2.4；同语义的 `test/桌面应用/star-routing.test.ts` 已迁移通过）。
- 统筹裁定：该迁移在测试角色既有写集内（团队计划 §4.3 `test/测试/` 目录授权；`角色卡/测试/boundary.md` Section 1「目录（测试）`test/测试/`」；既有文件、非新增），**不需要改团队计划/边界或重开闸门**。D1-fix 仅迁移该测试，不改产品/方案语义；测试文件从 226 行 / `41c6013b…` 变为 229 行 / `b5d5c6c8…`。
- 迁移后隔离复跑 2/2 pass；T3 最终新增确定性失败 0、新 skip 0。E2 应把此项作为**已披露的迁移表遗漏与 D1-fix 处置**核对，不当作产品缺陷。

### 6.2 R4 状态（已关闭，编辑性更正）

- **R4 已完成**：方案 §13 已由策划作者编辑性更正——复核记录引用改为当前 150 行 / `aa702f6b…`，并如实写 F4 部分采纳未关闭（O7 后续）+ R1–R3 一致性；只改 §13，不改 Q1–Q5/AC/写集/范围/风险档位/任何已确认语义。
- **版本映射**：语义基线（闸门 1 确认）**877 行 / `54da5d31…`** ↔ 当前版（R4 编辑性更正）**884 行 / `fa5902edce310f7960c88ac396f3ae940ca595eba079197ed5179b07410ab446`**；两者语义等价，实施/验收以语义基线 + 本映射为准。
- E2 报告已据此更新为 **323 行 / `e4dfbbb4b23f2ffda0a5e01e6a86651692320d809a6458a882879f3f536a1454`**，R4 已关闭，总体结论仍为**通过**（AC-1–AC-8 全 pass），候选仍为 `79962115…`。

### 6.3 未实施/范围外

- **O1/O5/O7 未实施**（后续独立事项）；**O2–O4/O6 未做**。
- **F4 未关闭**：`redispatch_task`/`redispatchTask`/`chooseRedispatchTarget` 未改（D1/B1 diff 核对 hunk 不落入 redispatch 区域）；留 O7，须重开闸门 0/1。
- **`planDispatchDelivery` 拒投保留**：契约引用缺失继续拒投且运行文案逐字不变（G-1 测试不变）。
- 未恢复已取消的 run-change-auto-approve；无新增自动批准/代批；本任务与已取消的 run-change-auto-approve / full-report-display 无关（相关未提交改动在本地快照 `e9e53a84…`，未引用）。
- 未改角色卡文本/`dispatch_task.moduleId` 工具描述（O5）；未改写权/边界/shell 守卫/验收判定/客户闸门/人事 D3/`appointment-write`/报告路由/任务重派看护。
- 未改 `src/model/runtime.ts`、`task-state.ts` schema、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`。
- 未新增 i18n key（默认复用现有文案 + 中文 advisory 文本）；`src/common/shared/**` 未改。
- `EvidenceCheckInput` 无 taskId、不得改 schema 的限制已在 B1/A1 记录披露；R3 用既有 `created.to/from/moduleId/modulePaths` 兼容匹配。`run.roles`/`run.modules` 未声明按无事实口径不产 code、不锚定。
- `docs/project-rules.md` 未建立（B0 附注，既有事实，不阻塞）。
- 未 commit/push/merge/release；未接触客户；未启动 E2。

---

## 七、验收交接（E2）

- **验收标准**：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（V1，814 行 / `63c441aa…`），实施前冻结；本变更包只提供候选/路径/节点/证据/T3，不代替标准。
- **判定者**：内置独立验收（沟通另起唯一验收主上下文）；结论只能是**通过 / 返工 / 证据不足**；统筹不改验收结论。
- **建议核对重点**：方案 §8.2 AC-1–AC-8；V1 §4 的 R1 调用协议（硬拒绝不产生任务/会话/draft run）、R2 三类 handoff 锚点、R3 evidenceScopeRoots 正/负例、F4 只读核对、R4 状态；T3 3385/3358/9/18 与 9 项既有 EPERM 分类；`npm run typecheck` 0；D2 `E2E_PASS=true`/30 PNG/候选树一致；D1-fix 迁移表漏列披露；O1/O5/O7 未实施与 `planDispatchDelivery` 保留。
- **不授权**：验收通过只表示当前候选满足 V1；不授权提交/推送/合并/发布；这些需客户另行授权。

---

## 八、变更包状态

- **已写**：本变更包（R4 关闭后的提交版）。
- **已完成**：G2、IA、H1、V1、B0、P1（含两轮修订与复审 `recommend approval`）、A1、B1、D1、D1-fix、D2、E1、E2（报告 323 行 / `e4dfbbb4…`，R4 关闭后结论仍为通过）、E3（放行记录）。
- **提交/推送/发布**：客户已授权**提交**（不推送/合并/发布）；统筹按分组提交执行（产品/测试候选一笔、治理/记录一笔；不 `git add -A`；排除 `.claude/`、`demos/`、其他任务与无关 untracked）。推送/合并/发布仍未授权、未执行。
- **未做**：push/merge/release；未接触客户；未判验收（E2 已由独立验收判通过，统筹不改结论）。
