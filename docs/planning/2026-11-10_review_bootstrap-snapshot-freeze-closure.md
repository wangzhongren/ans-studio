# 独立复核记录：bootstrap 快照单槽位与冻结闭包矛盾（P1.0）

- 版本：**R1.0，2026-11-10**；ANS 独立复核（Reviewer）独立只读上下文。
- 状态：**复核记录；不是验收结论、不阻断、不实施。** 本次复核未改方案/代码/测试/角色卡/边界/其它文档；未运行测试/typecheck/真实模型/Electron；未提交/推送/合并/发布；唯一写盘为本记录。
- 复核规则：只作建议；逐项给出可核对依据（file:line/原文）；**不把方案推荐当客户确认**；严重度仅为建议分级（must-fix / general / suggestion），不代表验收判定。
- 结论（摘要）：**建议修订后提交。** 根因链成立且证据可复算（单槽位装配、逐行冻结闭包、「草稿旧 sha 不可恢复」第三面均经真实账本与代码逐项核实）；候选 a′ 方向（装配闭合 + 谓词精确到 `event:"frozen"`）正确、冻结保护不弱化。但存在 **2 项 must-fix**：M1——`executeDirectInternal` 的 `expectedFrom`/槽位计数校验（`apply-journal.ts:713-714`）会让「同 kind 多版本单请求」（T1/T2 与 §0.2/§3.1 的承诺）在装配修复后仍以 `vca-target-invalid` 拒绝；M2——门禁候选树写入范围（`classify-shell.ts:734-736`/`:891` + `gitRolePath:207-221`）不接纳历史 frozen 文件，RR20 的标准 4-target bootstrap 会把 proposal/architecture/roster v1 带入候选树并被 `git-policy-raw-write-scope` 拒绝（方案 §3.2「不改其他任何 policy code」与 §7.8「异常数据」判断不成立）。另有 4 项 general、7 项 suggestion。**T3 判型成立**；B1+B2 必须同 PR/同批次，拆分后单批不能独立通过真实运行；#81 先合并后 rebase（或 stacked）均安全。M1/M2 修订前不建议进入 B1 实施派发。

---

## 0. 复核对象、依据与基线（快照）

| 项 | 值（本复核实测核对） |
|---|---|
| 方案 | `docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`；**406 行 / 49,995 bytes / SHA-256 `1f6afc156c790e1b127885639b0483b8340fe6dcf05b7e2aae8e1aff944fe890`**（`wc -lc` 与 `sha256sum` 实测，与任务给定一致） |
| 缺陷记录 | `docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`；**36 行 / 2,733 bytes / `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`**（实测一致） |
| RR19 记录 | `角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`；**182 行 / 23,923 bytes / `a4a90ebed25102ba2bd9b3be3d3863a6980c5fc5064ce6cbc06d3665267f8820`**（实测一致） |
| RR19 证据 | `…_evidence/extracts/vca-snapshot-files.json` **38 行 / 1,315 B / `760e714a9f7f4906f2004db7590e4a753afb947f93e13f2f0911a31607b246bb`**；`…_evidence/versions-final.jsonl` **21 行 / 7,228 B / `3e87ad9f376b0f765b43a2b07ebdbe78c1981a19e3b4e5ae8393fd97394700a6`**；8 份冻结文档 `target-docs/` 逐份复算（见 §3.1）——均与方案引用一致 |
| RR14 记录 | `角色卡/测试/docs/change/2026-11-10_RR14_snake-full-chain.md`；**155 行 / 21,384 bytes / `227589b04726d4fa206fd69d18a8a790139e7473d2c25048269aad7f4021339f`**（实测一致） |
| 代码基线 | worktree `.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`；HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）——与方案声明一致 |
| 在飞 PR #81 | `ecf9ead`（文档格式）**不在 main**（`git merge-base --is-ancestor` 实测 false；`origin/main` = `caabeea`，为 PR #80 合并）；本地 `main` 停在 `c1fb74a`（落后 origin）；本 worktree 分支尖端即 #81 尖端 `0ab2584` |
| 工作树状态 | 方案/缺陷/本记录均为未跟踪产物；另有大量 `.tmp-*`/`.commit-msg-*`/`.pr-body-*` 与未跟踪 docs（与方案 §1 披露一致，均不属本变更写集） |

方法：逐条阅读方案并按其 `file:line` 声明以只读方式核对代码；重算方案引用的全部文档/证据哈希；逐行解析 RR19 `versions-final.jsonl` 并用证据 `target-docs/` 的 8 份文档哈希复算「frozen 可达 / 旧草稿 sha 不可达」；核对门禁策略的 `allowed`/`raw-write-scope`/`gitRolePath` 全链；核对 RR14/RR19 记录与缺陷记录原文；逐文件核对写集与各角色 boundary Section 1；核对 #81/#80 提交面与重叠。未运行测试/typecheck/真实模型/Electron。行号为当前检出（HEAD `0ab2584`）实测；#81 合并与实施落地后行号会漂移，以符号名/文本锚点为准。

---

## 1. 问题清单

严重度：must-fix（建议修订后方可提交/派发）> general（应修订/澄清）> suggestion（建议改进，不阻断）。

| # | 严重度 | 位置（方案行） | 问题摘要 |
|---|---|---|---|
| M1 | **must-fix** | §0.2 `:37`；§3.1.1 `:180-183`；§5.1 T1 `:279`、T2 `:280`；§5.3 `:309`；对照 `apply-journal.ts:710-714`、`:1301`、`:1321` | `executeDirectInternal` 要求 `expectedFrom` 条数 === 变更槽位数；bootstrap 下每个 target 都会 push（7 targets ⇒ 7 条），而槽位仅 4 个 ⇒ a′ 修好装配/谓词后，7-target 单请求仍在 `:714` 被拒（内层 receipt `vca-target-invalid`，外层 `vca-apply-failed`，消息「Every changed target must have one expected original byte hash」）；T1/T2（7 targets）不可执行，§0.2/§3.1「全部 VCA targets（含历史版本）」的受支持承诺不成立。RR20 计划的 4-target 提交不受影响 |
| M2 | **must-fix** | §3.2 `:200-209`（尤其 `:209`「不改…其他任何 policy code」）；§7.8 `:362`；§6.3 `:339-343`；对照 `classify-shell.ts:696-706`/`:734-736`/`:883`/`:891`、`gitRolePath:207-221`、`git-trunk-store.ts:677` | a′ 把历史 frozen 文件放进 bootstrap 快照后，`materializeManifestFiles` 会把它们写入候选树；但 `snapshot-content` 行只有命中 `artifactPaths`（仅 `pub.documents` 当前槽位）才加入 `allowed`，而 product actor 的 `gitRolePath` 仅放行 `docs/product/` ⇒ `git-policy-raw-write-scope` 拒绝（candidate 与 publication 两个 verdict 走同一函数）。RR20 的标准 4-target 场景即触发（3 个历史 v1 文件）。B2 必须在 `classify-shell.ts` 内补「frozen 闭包证明的 snapshot-content 路径加入 allowed」类改动，并用 T1/T11/T13 钉住 |
| G1 | general | §5.1 T15 `:293`；§3.6 `:236`；对照 `trunk-runtime.ts:491-542`、`git-trunk-store.ts:943-947`、`apply-journal.ts:737-739` | T15「Git store 下 policy 通过」不可执行/口径错误：`executeDirect` 在 Git store 上不经过 `checkGitPolicy`（policy 仅在 `trunk-runtime.executeGitBusinessPublication` 内调用）；裸 git store 的 `compareAndSwapManifest` 无 scope 时不跑 policy/lease 检查。fallback 捕获实际只对 FS 媒体旧调用可达（Git 发布路径始终携带 `preparedSnapshotRef`）。T15 应限定 FS 回归（Git 断言删除或改写） |
| G2 | general | §6.2 `:322-332`；§6.4 `:345-349` | RR20 缺「依据与绑定 / attestation」：RR14/RR19 记录均有绑定表（前序 RR 记录 hash、授权记录、原件 hash、prepare-report）；本方案 §6 未要求绑定 RR19 记录（`a4a90ebe…`）、本方案/复核记录 hash、协调方授权与清理清单/证据 manifest。建议补（与 RR 体例一致，保证可复算与可追溯） |
| G3 | general | §3.4 `:220`；Q10 `:394`；§7.3 `:357` | 规模限制口径不完整：只列单文件 ≤1 MiB、整单 ≤4 MiB（`classify-shell.ts:850`），遗漏 raw plan 的 `files.length <= 128`（`:837`）与树条目 2048（`:854`）；且 4 MiB 总预算把 base64 快照 JSON（约 1.33× 文档字节，并含 manifest）一并计入，按 9 文件口径的实际「文档原始总字节」上限约 ≤1.5 MB。Q10/§7.3 应按完整口径披露 |
| G4 | general | §5.1 `:279-294`；§7.7 `:361`；§3.1.2 `:186` | 测试矩阵缺口：(a) 多 flow 账本仅披露未测——门禁 `:726` 对每行要求 `flowId === pub.flowId`，服务侧 §3.1.2 应同规则 fail-closed，需负例；(b) Q7 的「`-vN.md` 后缀版本 ≠ record.version」无对应用例；(c) T1/T2 与 M1 冲突（见 M1） |
| S1 | suggestion | §3.1.2 `:186` | 「（防御；[待确认] Q9）」引用错位：该问题对应 §9 的 Q7（`:391`），Q9（`:393`）是 operationId/残留快照 |
| S2 | suggestion | §6.3 `:343` | 「快照 files 含 8 个 frozen 文档 + intent v1 + versions.jsonl」重复计数（8 frozen 已含 intent v1）；应为「8 个 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件」 |
| S3 | suggestion | §2.4 `:151`；§3.3 `:213-216`；Q2 `:386` | 建议补强「为何不用每 path 最后一条记录」：冻结为终态（`versioned-doc-guard.ts:1601-1606` 冻结后写一律拒绝）⇒ 已冻结路径末条必为 frozen；但从未冻结路径末条为 `draft-updated`，其当前字节未必在 targets/槽位中，故「每 path 末条」口径仍可能不可满足 |
| S4 | suggestion | §4.2 `:260-262`；Q8 `:392` | 合并顺序判断成立，但本地 `main`（`c1fb74a`）落后 `origin/main`（`caabeea`）；实施前应 `git fetch origin` 并以 origin/main + #81 合并后的干净分支为基线（当前 worktree 分支尖端即 #81 尖端） |
| S5 | suggestion | §4.1 `:244-256`；§4.2 `:264` | 未写明规划/缺陷/复核记录是否随实施 PR 提交（三者当前均未跟踪；历史体例通常随 PR 记录）；建议明确归属与提交路径，避免记录孤儿化 |
| S6 | suggestion | §4.1 B3 `:250` | 若修改 683 行共享 fixture `test/测试/git-write-chain-fixture.ts`，建议优先新增独立测试文件或仅加法导出，避免影响其它依赖套件；若修改需列明回归面 |
| S7 | suggestion | §3.1.5 `:198`；§7.8 `:362` | 建议区分 VCA「作者写区」（`targetPathInAuthorArea`，product 可提交 proposal/contract/roster）与 Git 门禁 `gitRolePath`（角色根路径：product 仅 `docs/product/`）——M2 的成因之一，措辞统一可避免再次误判 |

---

## 2. 逐项依据与建议

### M1（must-fix）`expectedFrom` 与槽位计数不自洽：7-target 单请求在 a′ 后仍被拒

**位置**：方案 §0.2 `:37`（「files = 全部 VCA targets（同 kind 多版本全部保留）」）、§3.1.1 `:180-183`（单槽位取最高版本）、T1 `:279`（7 targets ⇒ 快照 9 文件、`prepareDirect` 通过、Git policy allowed:true）、T2 `:280`（顺序颠倒同断言）、§5.3 `:309`。

**依据（现状代码）**：

- `prepareDirectSubmission` 的 target 循环（`apply-journal.ts:1302-1322`）：`oldSlots = targetSlots(target)` 在循环前一次计算（`:1301`），bootstrap 下为空 ⇒ 对**每个** target 都满足 `!old` ⇒ 全部 push 进 `expectedFrom`（`:1321`）。RR19 的 7 targets ⇒ `expectedFrom.length = 7`（路径互异，Map 大小亦 7）。
- `executeDirectInternal`（`:710-714`）：`changed = Object.entries(nextSlots).filter(...)` 只按**槽位**计数（proposal/architecture/roster/modules = 4）；`const expected = new Map(input.expectedFrom.map(...)); if (expected.size !== input.expectedFrom.length || expected.size !== changed.length) return reject("vca-target-invalid", "Every changed target must have one expected original byte hash")`。7 ≠ 4 ⇒ 拒绝。
- 该函数同时是 Git 发布准备的门（`prepareDirectCommit` `:1259-1271` → `executeDirectInternal(deps, input, true)` `:1034`），`prepareOnly` 不绕过 `:714`；RR19 的拒绝当前发生在更早的 `vca-service.prepareDirect`（`vca-service.ts:317-318`），修好装配后就会推进到 `:714`（内层 receipt `vca-target-invalid`，外层经 `version-change-runtime.ts:716-717` 映射为 `vca-apply-failed`，消息「Every changed target must have one expected original byte hash」）。
- 真实链路：`version-change-runtime.submitDirect` `:702`（prepareDirectSubmission）→ `:705`（vca.prepareDirect）→ `:713-714`（Git 身份存在时 `executeGitDocumentPublication`，否则 `direct.executeDirect`）。两条路都会到 `:714`。

**影响**：T1/T2 按字面**不可执行**（T1 还断言 Git 候选/发布 policy allowed，必经 `prepareDirectCommit` 的同一校验）；方案 §0.2/§3.1 把「同 kind 多版本 targets 单请求」当作受支持输入，但代码不支持。RR20 计划的 4 个当前版本 targets 不受影响（`expectedFrom` 4 === `changed` 4）。

**建议（须写入方案并选定其一）**：

- (a) **收缩承诺（推荐，最小）**：明确受支持路径只接受每个 kind 一个当前版本 target；`prepareDirectSubmission` 对「同 kind 多版本单请求」给出明确拒绝（如 `trunk-item-invalid` ⇒ `vca-target-invalid`，消息含 kind/版本），T1 改为「4 当前版本 targets + 账本自动补历史 ⇒ 快照 9 文件」；T2 删除或改为「多版本单请求 ⇒ 明确拒绝」负例。§0.2 同步改成「全部 targets ∪ frozen 记录文件」中 targets 为当前版本。
- (b) **支持多版本单请求**：把 `expectedFrom.push` 限定为每个槽位的代表 target（最高版本），并说明 VCA 记录 `targets`（全部 7）与 journal `expectedFrom`（4）的差异及各自的校验职责；补「7 targets 全链通过」与「同槽位多 target 的 expectedFromSha256 校验」用例。

无论哪种，均须在 §1.4/§3.1 写明「装配可携带历史版本」与「单请求 target 列表是否可含多版本」是两个独立问题。

### M2（must-fix）门禁候选树写入范围不接纳历史 frozen 文件：RR20 将撞 `git-policy-raw-write-scope`

**位置**：方案 §3.2 `:200-209`（只改 `:729`，`:209` 明示「不改 `git-policy-app-freeze-record`/`-source`/其他任何 policy code」）；§7.8 `:362`（把该情形归为「异常数据」）；§6.3 `:339-343`（RR20 预期链）。

**依据（现状代码）**：

- `materializeManifestFiles`（`git-trunk-store.ts:669-695`）把 `next.snapshotRef` 的**全部** `files` 写入候选树（`:677`）；`planDocumentCommit` 的元数据表按路径前缀分类（`:739-744`）：`docs/...` ⇒ `snapshot-content`。
- `appMetadataPaths`（`classify-shell.ts:734-736`）：`snapshot-content` 行只做内容闭包校验（`primary.files` 必须含同 path 同 sha），**只有** `artifactPaths.has(row.path)` 时才 `allowed.add`；`artifactPaths` 仅由 `pub.documents`（当前槽位）与 `pub.execution` 填充（`:696-711`）。
- `rawObjectPolicyError`（`:883`）以 `exceptions = appMetadataPaths(...)` 放行 diff 文件（`:891`）：`(exceptions.has(file) && mode 100644) || gitRolePath(f, file)`；否则 `git-policy-raw-write-scope`。`gitRolePath`（`:207-221`）对 `actorRoleId === "product"` 只放行 `docs/product/`（`:211`、`:220`），历史 frozen 文件位于 `docs/proposals/`、`docs/contracts/` ⇒ 不放行。
- 首建 trunk 的 `base` 为 null（`visibleOid()` 只读 `refs/ans/trunk`，`git-trunk-store.ts:459-468`；`planDocumentCommit` `:734`），候选树即全部计划文件，历史 v1 文件是新增（A）diff 条目 ⇒ 必然进入 `:891` 的写入范围检查。
- 该函数对 **candidate 与 publication 两个 verdict** 都会执行（`checkGitPolicy` `:1058` → `rawObjectPolicyError`；candidate 在 `trunk-runtime.ts:528-529` 先行拒绝）。因此 RR20 的标准场景（4 当前版本 targets + 3 个历史 frozen 文件）会在 `:529` 以 `git-policy-raw-write-scope` 失败（外层 `vca-apply-failed`），与 RR14 的停因同类但 code 不同。

**影响**：方案「真实链路具备通过条件」（§2.4 `:150`）与 §6.3 的预期链不成立；§7.8 对「异常数据」的定性错误——这不是异常数据，而是本缺陷要修复的标准场景。

**建议**：在 B2 的文件/owner 内补一处门禁改动（仍属 T3，不新增 owner/批次）：在 `appMetadataPaths` 计算「`event:"frozen"` 记录的解析路径集合」时，把命中该集合的 `snapshot-content` 行同时加入 `allowed`（该路径的字节已由 `primary.files` 同 path 同 sha + 快照 digest + 账本本身在快照内三重钉死，写入候选不构成保护降级）。同步修订 §3.2 的「不改其他 policy code」与 §7.8 的定性，并以 T1 的「Git 候选/发布 policy allowed:true」、T11（缺 frozen 文件仍拒）、T13（非 frozen 行不要求快照）钉住新旧语义。

### G1（general）T15 的 Git-store 断言不可执行

- `trunk-runtime.executeGitBusinessPublication`（`:491-542`）只在准备/提交链中调用 `checkGitPolicy`（`:528-530`）；`direct.executeDirect`（`apply-journal.ts:841`）不调用任何 policy。
- 裸 git store 的 `compareAndSwapManifest`（`git-trunk-store.ts:943-978`）在 `scope` 缺失时只做 CAS/树校验，不检查 policy/lease。
- Git 发布路径的 `applyInput` 始终带 `preparedSnapshotRef`（`prepareDirectSubmission` `:1338-1339`、`:1352`），因此 `executeDirectInternal` 的 fallback 捕获（`:737-739`）实际只对 FS 媒体/旧直连调用可达。
- 建议：T15 改为「FS 媒体：直接 `executeDirect`（bootstrap，无 preparedSnapshotRef）⇒ 闭合集合 + `verifyClosure`（子集，`fs-trunk-store.ts:275-291`）通过」；删除「Git store 下 policy 通过」，或另设经 `executeGitDocumentPublication` 的既有路径回归（该路径恒有 preparedSnapshotRef，不覆盖 fallback）。

### G2（general）RR20 缺依据与绑定（attestation）

- RR14（§1 绑定表）与 RR19（§1「依据与绑定」）均以 hash 绑定前序 RR 记录、授权与原件；本方案 §6.2-§6.4 只描述清理/运行/预算/停止。
- 建议 RR20 增加：绑定 RR19 记录（`a4a90ebe…`）、本方案（`1f6afc15…`）与本复核记录 hash、协调方授权记录、`prepare-report`/`target-clean-manifest`/原 target 只读核对（114/114）、证据目录 manifest；并写明 RR19 遗留 draft run（`run-hub-7e1a…`）与 `init-source-be2b729c…` 的保留/清理处置（`onlyUnpinnedDrafts` 接受 draft，`stable-snapshot.ts:30-31`，可保留但应披露）。

### G3（general）规模限制口径

- `classify-shell.ts:837`：raw plan `input.files.length <= 128`；`:850`：单文件 ≤1 MiB 且总计 ≤4 MiB（`git-policy-raw-byte-budget`）；`:854`：树条目 ≤2048。
- 快照 JSON 以 base64 内嵌全部文档字节并计入同一 `files` 总量 ⇒ 4 MiB 对「文档原始总字节」的实际上限约 ≤1.5 MB（另加 manifest/history）。
- 建议 Q10/§3.4/§7.3 按完整口径披露（含 128 文件上限与复制放大），并保留「超限按既有 code fail-closed、不提升预算」的立场。

### G4（general）测试矩阵缺口

- 多 flow：门禁 `:726` 对**每一行**要求 `record.flowId === pub.flowId` ⇒ 含异 flow 行的账本必拒；服务侧 §3.1.2 的逐行校验应同规则，需要负例（现仅 §7.7 披露、无用例）。
- 版本后缀：Q7 的「`record.path` 已是 `-vN.md` 且 N ≠ `record.version`」应 fail-closed（服务侧防御），门禁保持既有行为（`:728` 原样使用路径）；需用例钉住服务/门禁的差异与理由。
- T1/T2 与 M1：按 M1 结论调整。

其余建议见 S1–S7（表）。

---

## 3. 已核实项（按复核重点）

### 3.1 根因是否成立（重点 1）——**成立；且确需同时修 `classify-shell.ts:729`**

1. **单槽位装配属实**：`TrunkApplySnapshot.documents: Partial<Record<TrunkDocKind, { path; sha256 }>>`（`src/model/trunk.ts:304-307`；`TrunkDocKind` `:51`）；`CompleteSnapshot.files` 本身是任意文件数组（`:596-600`、`isCompleteSnapshot` `:645-657`）。`prepareDirectSubmission`：bootstrap 空槽位（`apply-journal.ts:1300`）、按 kind 直接赋值覆盖（`:1307-1318`，`target.documents[doc] = { path, sha256 }`）、快照捕获 `[...directRefs(target), ...extra]`（`:1338-1339`）、`directRefs` 只取槽位值（`:564-568`）。`vca-service.prepareDirect` 的「target 必须在快照内」在 `:317-318`（RR19 即时拒绝点）。RR19 证据（`vca-snapshot-files.json`）6 文件、缺 proposal/architecture/roster v1，与方案一致。
2. **冻结闭包逐行谓词属实**：`classify-shell.ts:723`（`.ans/state/versions.jsonl` 行仅 bootstrap 进入快照）、`:724-729`（每行解析路径 `/-v\d+\.md$/ ? path : `${path}-v${version}.md`` 并要求 `primary.files` 同 path 同 sha）、`:730-731`（`frozen` 用 `isValidDocFreezeRecord`，其余 event 且无 freeze）。快照文件写入候选树：`git-trunk-store.ts:677`、元数据分类 `:739-744`；RR14 的 `git-policy-app-freeze-closure` 经 `trunk-runtime.ts:528-529` 映射。
3. **「第三面」（草稿旧 sha 不可满足）属实且确需修 `:729`**：逐行解析 RR19 `versions-final.jsonl`（21 行）：
   - 8 条 `frozen`：intent v1（行 4 `ae80808b`）、architecture v1（行 10 `20157fa9`）、modules v1（行 11 `824371eb`）、proposal v1（行 12 `3a976464`）、roster v1（行 13 `e745283f`）、architecture v2（行 16 `5c38b0dc`）、proposal v2（行 17 `e6d9b033`）、roster v2（行 21 `782d6bcd`）——8 份证据文档哈希逐一复算全部一致。
   - 不可满足的非 frozen 旧 sha 共 **5 个**：`fe926deb`（行 1 baseline）、`c77d8f46`（行 2 draft-updated）、`740cf63b`（行 7 version-added）、`3acab868`（行 18 version-added）、`a12ce0aa`（行 19 draft-updated）——均不等于任何现存文档哈希；`draft-updated` 为原位改写（`versioned-doc-guard.ts:1601-1624`，注释 `:1608`；事件枚举 `model/version-change.ts:243-247`、`doc-format-specs.ts:2062-2063`）。
   - 因此即使快照携带全部 8 个 frozen 文件，`:729` 仍会在行 7/18/19 等失败——**谓词收窄到 `event:"frozen"` 是必要条件**；方案的关键发现成立。
4. **RR14/RR19 两面性描述准确**：RR14 记录（§0.2-3、§5.3）为 4 targets、6 文件快照、`git-policy-app-freeze-closure`；RR19 为 7 targets、同 6 文件、`vca-target-invalid`；两者快照 digest `fa807db6…` 相同（RR19 §5.3 原文）。方案 §1.4 表与两记录逐项对上。
5. **保护语义本身正确**：`frozen` 记录必须逐字节进入首建快照的目标正确；问题在装配无法表达 + 谓词过宽（方案 §1.5 结论成立）。

### 3.2 推荐 a′ 是否正确/最小（重点 2）——**方向正确；按现文本不完整，须并入 M1/M2 才是闭合集**

- **不弱化**：收窄后 `frozen` 行仍保留 `primary.files` 同 path 同 sha（`:729` 强度不变）；未知 event/非法 freeze 仍由 `:730-731` 拒绝；服务侧对账本坏行/未知 event/非法 freeze/文件缺失/不可读/漂移/同 path 冲突 fail-closed（方案 §3.1.2/§3.3 与 `captureSnapshot` `fs-trunk-store.ts:502-530` 一致，`snapshot-hash-drift`/`snapshot-ref-conflict` 原样保留）。
- **快照 ID/哈希算法不变**：`s-${directHash([flowId, operationId])}`（`apply-journal.ts:1338`）；digest = `completeSnapshotDigest`（`guard-freeze-registry.ts:56-59`，排序 path/sha/base64 的 sha256）。
- **两处捕获**：`prepareDirectSubmission` `:1338-1339` 与 `executeDirectInternal` fallback `:737-739` 均可调用同一 helper；fallback 的 bootstrap 证据（intent/baseline）仅在 `!current` 分支可得（`:690-702`），helper 输入充分。
- **非 bootstrap 不变**：`versions.jsonl` 仅 bootstrap 纳入（`:1328-1336`；`baselineRef` 仅 `:692-702`）；非 bootstrap 路径不调用闭合收集的声明成立。
- **下游兼容已核实**：initial-workflow 快照会继承 bootstrap 全部文件（`stable-snapshot.ts:152-159`），且 `initialWorkflowMetadataPaths` 要求「继承原始快照 digest + 4 个新增」（`classify-shell.ts:391-394`），继承文件只要与基树相同即放行（`:405-409`）——RR20 后续稳定链不会因更大快照再撞门。
- **不完整**：M1（7-target 单请求）与 M2（候选树写入范围）使 a′ 按现文本无法真实通过；补齐后审计算法与文件集合口径不变。

### 3.3 T2/T3 判型（重点 3）——**T3 成立；不可拆成两个各自可通过的批次**

- `src/common/门禁引擎/classify-shell.ts` 位于共享抽象层，且改动的是治理/权限判定语义（冻结闭包范围、候选树允许集）；`角色卡/项目管理/docs/project-rules.md` 第 9 条（`:48`）把「发布、共享抽象、治理或权限变更」列为 T3，并要求全量回归只在 T3 或证据不足时执行。方案判 T3 的口径成立；若协调方裁定 T2，须书面写明「含门禁政策文件改动的 T2 例外」并保留独立验收（不建议）。
- 拆分验证：只落 B1 ⇒ 4-target 受支持路径停在 `git-policy-app-freeze-closure`（RR14 面），7-target 路径先停在 `:714`（M1）；只落 B2 ⇒ 停在 `vca-target-invalid`（RR19 的快照缺 target）。因此 B1+B2（含 M2 的允许集改动，仍属 B2/门禁引擎文件）必须同一 PR、同一真实运行前全部落地；拆 PR 时只能作为同一发布批次，且各自 PR 注明「单独合并不改变真实运行结果」。
- 升档触发器（§8）清单合理；建议在触发器中补「需要新增门禁允许集而非收窄」一项（M2 即此类，仍在本方案 B2 范围内，不构成升档，但值得明示）。

### 3.4 写集/owner/串行（重点 4）——**成立；细节见 S4/S6**

- **boundary Section 1 核对**：编排 `src/service/trunk/`、`test/编排/`、`角色卡/编排/docs/change/`；门禁引擎 `src/common/门禁引擎/`、`test/门禁引擎/`、`角色卡/门禁引擎/docs/change/`；测试 `test/测试/`、`角色卡/测试/docs/change/`——B1/B2/B3 写集逐项命中。
- **H1 delta = 0**：不改角色卡正文/边界/权限/writeSet/闸门定义；`docs/change` 记录属各角色 Section 1 既有授权。未发现越界写点。
- **#81 零重叠属实**：`git show --stat ecf9ead` 为 `app/desktop/session.ts`、`src/common/编排/doc-format-specs.ts`（新）、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/schema.ts`/`tools.ts`、对应测试与记录；不触 `apply-journal.ts`/`classify-shell.ts`/`test/测试/git-write-chain-fixture.ts`。`3cd55dc`（团队计划 run 绑定）已在基点内且改过 `apply-journal.ts`（当前行号已含其改动）。
- **工作树未跟踪产物**：与本变更写集无关（方案 §4.2 披露准确）；实施必须从干净基线新建分支，不得带入 `.tmp-*`/`.commit-msg-*`/`.pr-body-*`/未跟踪 docs。
- **合并顺序**：#81 先合并（客户允许后）→ rebase 到 main → 开本 PR；或 stacked PR（base=`feat/document-format-specifications`，合并后 retarget）。两方案均安全；注意本地 `main` 落后 origin（S4）。

### 3.5 测试 T1–T16 与真实运行 RR20（重点 5）

- **覆盖评估**：bootstrap 全 frozen 装配（T1）、历史 v1 存在/缺失/漂移/不可读（T3–T5）、草稿旧 sha（T1/T10/T13）、非 bootstrap 回归（T9）、快照 ID/哈希/幂等（T1/T16）、同 path 冲突（T7）、marker/其它政策回归（T14）、冻结强度（T11/T12）覆盖到位；`fs-trunk-store.ts:256-274` 的 `snapshot-immutable-conflict` 与 T16 一致。
- **缺口**：M1 使 T1/T2 就现文本不可执行；T15 的 Git 断言见 G1；多 flow 与版本后缀见 G4；Git raw-object 预算无用例（可作已知限制，见 G3）。
- **RR20 可执行性**：round8 同根清理（`sessions` 移动、`tasks.jsonl` 复制后重置、保留 docs/trunk/snapshots/versions/doc-freezes/init）与 RR19 实测后态兼容（RR19 后 snapshots 11、sessions 15、ledger 1 行）；新 operationId `…-02` 正确（op-01 的 `s-9fbf9c81…` 已落盘，复用会 `snapshot-immutable-conflict`；op-01 无 VCA/operation 绑定，RR19 `version-changes.json` 未变）。预算/停止/9223/严禁伪造条款可执行；**attestation 缺口见 G2**。
- **预期证据**：4 targets + 3 历史 frozen + intent + versions = 9 文件，与 T1 一致（S2 为文案修正）。

### 3.6 Q1–Q12 处置（重点 6）

| Q | 处置 | 依据/说明 |
|---|---|---|
| Q1 | **确认（T3）** | 见 §3.3；`classify-shell.ts` 属共享抽象 + 治理判定；project-rules 第 9 条 |
| Q2 | **确认（仅 `event:"frozen"`）** | 逐行核对证实必要；补强理由见 S3（冻结终态 ⇒ 末条必为 frozen；未冻结路径末条为 draft-updated，字节未必可入快照） |
| Q3 | **确认（仅当前 flow）** | 与门禁 `:726` 每行 `flowId === pub.flowId` 一致；服务侧应逐行拒绝异 flow（非静默过滤），并补负例（G4） |
| Q4 | **确认（当前版本 targets），但须先解 M1** | 4-target 路径正是避开 M1 的受支持路径；T1/T2 文本须按 M1 修订 |
| Q5 | **确认（最高版本 + 拒绝歧义）** | 确定性改进；注意它不解决多版本单请求的 `expectedFrom` 问题（M1）；同 kind 同版本不同路径在 `apply-journal.ts:720-722` 的路径钉死下几乎不可达（防御条款） |
| Q6 | **确认（错误码集合不变）** | `version-change-runtime.ts:703` 把 `trunk-item-invalid` 映射为 `vca-target-invalid` 并透传消息；无新增公共 code |
| Q7 | **确认（防御性校验），补用例与引用更正** | 服务侧 `docVersionOfPath(file) === record.version`；门禁保持 `:728` 原样；引用错位见 S1；用例见 G4 |
| Q8 | **确认（#81 先合并或 stacked）** | 零重叠已核实；补 `origin/main` fetch 提示（S4） |
| Q9 | **确认（新 operationId + 披露残留快照）** | `s-9fbf9c81…` 为 op-01 的不可变证据；复用同 ID 不同文件集合 ⇒ `snapshot-immutable-conflict`（`fs-trunk-store.ts:256-274`），fail-closed 正确 |
| Q10 | **确认（已知限制），按 G3 修订口径** | 补 128 文件上限与快照 JSON 复制放大；`git-policy-raw-byte-budget` 既有 code |
| Q11 | **确认（同 PR；若拆必须同批次）** | 见 §3.3；M2 的允许集改动仍属 B2 |
| Q12 | **确认（fallback 同步接线），T15 按 G1 修订** | helper 可从 `!current` 分支复用 intent/baseline 字节；fallback 实际只对 FS 媒体可达 |

---

## 4. 未检查事项与限制（如实）

1. 未运行任何测试/typecheck/真实模型/Electron；确定性结论均来自只读代码与证据核对，不代表可运行性已验证。
2. 未实施、未写任何代码/测试/角色卡；本记录不构成验收判定，Q1 的 T3 仅为复核建议，最终以协调方裁定为准。
3. 行号为当前检出（HEAD `0ab2584`，tree `d6c2158d`）实测；#81 合并与 B1/B2 落地后会漂移，以符号名/文本锚点为准。
4. 未全量审计 RR19 的 145 文件证据：抽查 `vca-snapshot-files.json`、`versions-final.jsonl`、`target-docs/` 8 份文档哈希、RR14/RR19 记录原文；未复算证据目录全部 `sha256sums`。
5. 未核对 RR20 预算预批与授权记录（仓库内未见独立留痕）；§6.4 预算数值按 RR19 记录引用。
6. 未验证 `test/编排/*`、`test/门禁引擎/*` 当前已知红/既有失败对 T1–T16 的影响（本复核未跑测试）。
7. 未复核 PR #81 的完整 diff（只看 `--stat`/文件面与重叠），其评审状态以 PR 记录为准。

---

## 5. 写盘与快照（本记录）

- 本次复核唯一写盘：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`。
- 未修改方案、代码、测试、角色卡、边界或其它文档；未提交/推送/合并/发布；未运行真实模型。
- 本记录自身的行数/字节/SHA-256 在写盘后由 `wc -lc` 与 `sha256sum` 实测，随交付回报（文件无法内嵌自身哈希）。

**（完）**

---

## 6. 窄复核（R1.1）：P1.1 对 M1/M2/G1–G4/S1–S7 的逐项闭合核对

- 版本：**R1.1，2026-11-10**；ANS 独立复核（Reviewer）独立只读上下文；**本节为追加，前文（R1.0）原样保留、不改一字。**
- 复核对象：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md` **P1.1（477 行 / 68,367 bytes / SHA-256 `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`）**，实测与任务给定一致；P1.0（`1f6afc15…`）仅保留于版本记录；R1.0（`4c01b07d…`）只读引用。
- 范围：只核对 P1.1 是否闭合 R1.0 的 M1/M2/G1–G4/S1–S7、修订引入的新事实/引用是否成立、有无新 must-fix；未重做 R1.0 已核实的全量核对。未运行测试/typecheck/真实模型；行号为当前检出（HEAD `0ab2584`）实测。
- **结论：M1/M2/G1–G4/S1–S7 全部闭合；无新增 must-fix；建议提交、可进入 B1/B2 实施派发**（按 P1.1 §4.1 写集/批次与 §4.2 的 #81 依赖）。仅余 6 项 suggestion（N1–N6，均不阻断）。**T3 仍成立**：`classify-shell.ts` 同函数两处改动（闭包范围 + frozen 证明允许集）仍属共享抽象 + 治理判定语义；协调方 T3 确认与 B1+B2 同 PR/同批次约束在案。M1 的收缩与 M2 的允许集补齐均未改变「frozen 逐字节闭包、未知/漂移/不可读 fail-closed」的保护语义。

### 6.1 逐项闭合判定

| # | R1.0 问题 | P1.1 处置落点 | 判定 |
|---|---|---|---|
| M1 | `expectedFrom`/槽位计数使 7-target 单请求不可执行 | §0.2 `:41`；§0.4 `:55`；§1.2 `:79`；§1.4 第 4 行 `:100`；§1.5 `:109`；§2.1 `:126`；§2.5 `:174`；§3.1.1 `:190-195`；§3.6 `:262`；T1/T2 `:309-310`；§6.3 `:374-375`；§7.9 `:413`；§8.1 `:434`；Q5/Q13 `:458/:466` | **闭合**（采纳收缩承诺；见 §6.2） |
| M2 | 门禁候选树写入范围不接纳历史 frozen 文件 | §0.1 `:37`；§0.2 `:42`；§1.3 `:88`；§1.5 `:108`；§2.4 `:157-159`；§3.2.2 `:223-227`；§3.3 `:236`；T1/T19 `:309/:327`；§7.8 `:412`；§8.1 `:435`；§8 升档触发器 `:428` | **闭合**（同函数允许集补齐；见 §6.3） |
| G1 | T15 的 Git-store 断言不可执行 | §3.1.3 `:203`；§3.6 `:263`；T15 `:323`；§7.10 `:414`；Q12 `:465`；§8.1 `:436` | **闭合**（FS-only 回归，删除 Git policy 断言并说明可达性） |
| G2 | RR20 缺依据/绑定 attestation | §6.2-6 `:366`；§6.5 `:386-399`；§5.3 `:343`；§8.1 `:437` | **闭合**（绑定表 + 遗留处置披露） |
| G3 | 规模口径漏 128 文件/base64 放大 | §3.4 `:242-245`；§7.3 `:407`；Q10 `:463`；§8.1 `:438` | **闭合**（完整口径：128 / 2048 / 1 MiB / 4 MiB / 1.33× / 文档原始 ≈≤1.5 MB） |
| G4 | 测试缺多 flow 与版本后缀负例 | §3.1.2 `:198-199`；T17/T18 `:325-326`；§7.2 `:406`；§7.7 `:411`；Q3/Q7 `:456/:460`；§8.1 `:439` | **闭合**（T17/T18 明确服务侧 fail-closed 与门禁分工） |
| S1 | 「Q9」引用错位 | §3.1.2 `:199`（改为 Q7/T18）；§8.1 `:440` | **闭合** |
| S2 | §6.3 预期证据重复计数 | §6.3 `:378`（8 frozen 含 intent v1 + versions = 9 文件） | **闭合** |
| S3 | Q2 补冻结终态理由 | §2.4 `:159`；§3.3 `:235`；Q2 `:455`；§8.1 `:442` | **闭合** |
| S4 | 本地 main 落后 origin | §4.2 `:292`；§6.1 `:353`；Q8 `:461`；§8.1 `:443` | **闭合** |
| S5 | 记录归属未写 | §4.1 记录归属 `:285`；Q14 `:467`；§8.1 `:444` | **闭合** |
| S6 | 共享 fixture 改动面 | §4.1 B3 `:278`；§5.2 `:334`；§8.1 `:445` | **闭合** |
| S7 | 两种「作者写区」措辞区分 | §3.1.5 `:213`；§7.8 `:412`；§8.1 `:446` | **闭合** |

### 6.2 M1 关键点复核（可实施性）

- **承诺收缩口径一致**：§0.2/§0.4/§1.6/§3.1.1/§3.6/Q5/Q13 统一为「bootstrap 每 kind 至多一个当前版本 target；同 kind 多版本单请求明确拒绝；历史由 R9 账本自动装配；`expectedFrom`/槽位计数语义不改」。§1.2 `:79` 与 §1.4 第 4 行把失败点写在 `apply-journal.ts:1319-1321`（push）与 `:710-714`（计数），与 R1.0 依据一致。
- **拒绝点可行**：在 `prepareDirectSubmission` 的 target 循环（`:1302-1322`）按 `slot`（`doc:<kind>`/`execution:<kind>`）跟踪重复，bootstrap（`!current`）第二次出现即 `fail("trunk-item-invalid", ...)`；经 `version-change-runtime.ts:703` 映射为 `vca-target-invalid`，消息模板 `Bootstrap accepts at most one target per document slot; historical versions are assembled from R9: <slot/path>`（§3.1.4 `:206`）。不依赖 last-wins/最高版本选择；非 bootstrap 仍走既有 `:713-714`（行为/消息不变，Q13）。
- **与装配的关系**：单 target/kind ⇒ `directRefs(target)` 等价全部 targets，§3.1.2 的闭合集公式（`:201`）与 vca-service 的「target 必须在快照内」（`:317-318`）自洽；RR20 的 4-target 受支持路径与 T1 一致。
- **测试口径**：T2 改为「7-target 明确拒绝、无提交、不再以 Target bytes absent/expectedFrom 计数错误呈现」，正确。残留仅层口径（N1，suggestion）。

### 6.3 M2 关键点复核（可行性/边界）

- **同函数允许集补齐可行**：`appMetadataPaths` 已有 `table`（`classify-shell.ts:585-591`）与 `allowed`（`:578`、返回 `:743`）；在 `frozen-application-evidence` 分支（`:718-733`）解析账本时收集「`event:"frozen"` 且 `primary.files` 同 path 同 sha 已证明」的解析路径，循环后仅对 `table.get(path).kind === "snapshot-content"` 者 `allowed.add(path)`；`rawObjectPolicyError` 的 `exceptions`（`:883`）与 diff 写入范围（`:891`）随即接纳，candidate/publication 两个 verdict 同一函数同时修复。
- **不放宽任意路径**：仅 frozen 证明集；`complete-snapshot`/`frozen-application-evidence` 行不受影响；未被证明的额外 `snapshot-content` 仍 `git-policy-raw-write-scope`（T19）。字节已由 `primary.files` 同 path 同 sha + 快照 digest + 账本在快照内三重钉死，写入候选不构成保护降级；§7.8 已把该情形从「异常数据」改为「RR20 标准场景」，并披露「数据异常时仍只按冻结 sha 放行」的残余边界。
- **触发面核实**：`appMetadataPaths` 只服务 direct-document-publication；团队计划快照仅 `directRefs(target)`（`apply-journal.ts:2918-2919`）不含 `versions.jsonl`；激活/initial-workflow 走 `activationMetadataPaths`/`initialWorkflowMetadataPaths`（`classify-shell.ts:303/:414`），后者对继承文件按「与基树相同」放行（`:405-409`）。故允许集补齐实际只对 bootstrap version-upgrade 生效，与 §3.3「非 bootstrap 路径不受影响」一致。
- **测试钉住**：T1（allowed:true）、T11（缺 frozen 仍拒）、T13（非 frozen 不要求快照）、T19（未证明路径仍拒）覆盖正负两面；B2 取证要求已入 §4.1。

### 6.4 G1–G4 / S1–S7 复核要点

- **G1**：T15 改为 FS 媒体直接 `executeDirect`（无 preparedSnapshotRef）回归，明确删除「Git store 下 policy 通过」；§3.6 `:263` 与 §7.10 `:414` 说明 fallback 只对 FS 旧直连可达、Git 发布路径恒有 `preparedSnapshotRef`、Git policy 由 T1/T14 覆盖——与 R1.0 依据（`trunk-runtime.ts:491-542`、`git-trunk-store.ts:943-947`）一致。
- **G2**：§6.5 绑定表含前序 RR（RR19 `a4a90ebe…`）、P1.1 hash、R1.0/R1.1、协调方授权、`prepare-report`/`target-clean-manifest`/原 target 114/114、证据 manifest；§6.2-6 披露 RR19 遗留 draft run/init-source/快照保留（`onlyUnpinnedDrafts` 兼容），满足 RR 体例。
- **G3**：`classify-shell.ts:837`（128 文件）/`:850`（1 MiB、4 MiB）/`:854`（2048 树条目）与 base64 ≈1.33× ⇒ 文档原始 ≈≤1.5 MB，均写入 §3.4/§7.3/Q10；不提升预算的立场保留。
- **G4**：T17（多 flow 负例，服务侧逐行 fail-closed 不静默过滤，门禁 `:726` 同规则）、T18（服务侧防御性校验 `-vN` 后缀 === record.version；门禁保持 `:728` 原样）与 §3.1.2 `:198-199`、Q3/Q7 一致。
- **S1–S7**：逐条落点见 §6.1 表，均已落地且未发现新矛盾；S2 的 §6.3 计数已正确（8 frozen 含 intent v1 + versions = 9 文件）。

### 6.5 新问题（均为 suggestion，不阻断）

- **N1（层口径）**：T2 `:310` 写「`prepareDirectSubmission` 明确拒绝（`vca-target-invalid`…）」；service 直呼实际返回 `trunk-item-invalid`，`vca-target-invalid` 是 `version-change-runtime.ts:703` 的外层映射（§3.1.4 `:205` 已正确区分）。建议 T2 写明测试层（直呼 service ⇒ `trunk-item-invalid`；全链 `submitDirect` ⇒ `vca-target-invalid`）。
- **N2（T19 路径选择）**：T19 的「额外 `snapshot-content` 文件」必须选 `gitRolePath` 不放行的路径（如 `docs/proposals/<flow>-proposal-v9.md`），并注明 product/version-upgrade facts；若选 `docs/product/...`，`gitRolePath`（`:207-221`，roots `:211`）会直接放行，期望的 `git-policy-raw-write-scope` 不会出现。
- **N3（当前版本声明）**：M1 收缩后服务侧不再做「最高版本」选择/校验；若角色把旧 frozen v1 声明为槽位（每 kind 一个），bootstrap 会以 v1 建 manifest。属角色声明责任 + §6.3 任务文本已引导；建议在 §3.1.1 或 Q5 加一句「当前版本由角色声明，服务侧不推断版本高低」，如需防御性校验（槽位 target 为该族最高冻结版本）另立变更。
- **N4（措辞精确化）**：§3.3 `:238`「`versions.jsonl` 仅在 bootstrap 进入快照」对 initial-workflow 继承快照不完全成立（`stable-snapshot.ts:152-159` 会带入全部 bootstrap 文件），但该链路走 `initialWorkflowMetadataPaths` 且继承文件按 `classify-shell.ts:405-409` 放行，`appMetadataPaths` 两处改动仍只对 bootstrap 生效；建议一句精确化。
- **N5（服务侧形状对齐）**：§3.1.2 最小形状未要求非 frozen 行 `freeze === undefined`（门禁 `:731` 要求）；整体仍 fail-closed（在门禁拒绝），如需更早/更具体拒绝可把该校验并入服务侧最小形状。
- **N6（文案小项）**：T1 `:309` 括号「8 frozen + 5 草稿旧 sha + intent v1」中 intent v1 已含于 8 frozen；建议按 §6.3 口径写成「8 frozen（含 intent v1）+ 5 草稿旧 sha」。

### 6.6 无新 must-fix 的核对说明

spot-check 覆盖：根因链与 a′ 装配（§1.2-§1.5、§3.1 未改实质事实）；frozen 谓词与 allowed 证明集（§3.2 两处均不新增放行分支，仅补冻结证明路径）；错误码/fail-closed（§3.1.4、§7.2）；写集/owner/H1（§4.1 与 R1.0 核对结果一致，B3 改为优先新增独立测试文件）；测试 T1–T19（相对 R1.0 增量合理）；RR20 attestation/预算（§6.5/§6.4 与 RR14/RR19 体例一致）；T3/B1+B2 同 PR/合并顺序（§8/§4.1/§4.2 未变且与 R1.0 结论一致）。未发现需要改写根因、弱化保护、漏改入口、写集越界、测试不可执行或 T3 漏判的新 must-fix。

### 6.7 R1.1 限制

- 仅核对 P1.1 对 R1.0 问题的处置及其新引入的事实/引用；R1.0 已核实项（根因、证据哈希、写集边界、测试套件存在性等）未重做全量核对，P1.1 未改动这些章节实质内容（抽查一致）。
- 未运行测试/typecheck/真实模型；N2/N3/N5 为测试设计/实施期事项，本节日径不构成验收判定。
- 本节写盘仅为追加本记录；未改方案/代码/测试/角色卡/边界/其它文档；未提交/推送/合并/发布。
