# bootstrap 快照单槽位与冻结闭包矛盾：方案（P1.1）

- 版本：**P1.1 草案，2026-11-10**；ANS 策划（Planning）独立上下文。**P1.1 按独立复核 R1.0**（`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，**195 行 / 31,763 bytes / `4c01b07dfc2d6499b5c741a3138a215d585e6c3e4635c27e6acd87402029f7d4`**）**逐项处置 M1/M2/G1–G4/S1–S7**（落点见 §8.1）；P1.0（406 行 / 49,995 bytes / `1f6afc156c790e1b127885639b0483b8340fe6dcf05b7e2aae8e1aff944fe890`）保留于版本记录、不再作为闸门材料。
- 状态：**方案修订稿；未实施、未测试、未验收、未运行真实模型、未提交/推送/合并。** 本文件为本轮唯一写盘产物。
- 风险档位：**T3（协调方 2026-11-10 已确认）**。依据见 §8：门禁政策（`classify-shell.ts`）语义改动 + 服务侧装配，两者缺一不能通过真实运行；协调方同时确认 B1+B2 同 PR/同批次、冻结保护不弱化、未知/漂移/不可读 fail-closed、#81 先合并/rebase 或 stacked。
- 依据（本检出只读核对，写盘前实测）：
  - 缺陷记录：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`，**36 行 / 2,733 bytes / SHA-256 `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`**。
  - RR19 记录：`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`，**182 行 / 23,923 bytes / `a4a90ebed25102ba2bd9b3be3d3863a6980c5fc5064ce6cbc06d3665267f8820`**；证据目录 `2026-11-10_RR19_snake-full-chain-evidence/`，关键原件：快照清单 `extracts/vca-snapshot-files.json`（**38 行 / 1,315 bytes / `760e714a9f7f4906f2004db7590e4a753afb947f93e13f2f0911a31607b246bb`**）、`versions-final.jsonl`（**21 行 / 7,228 bytes / `3e87ad9f376b0f765b43a2b07ebdbe78c1981a19e3b4e5ae8393fd97394700a6`**，与目标 `.ans/state/versions.jsonl` 同 hash）。
  - RR14 记录（前序同族失败）：`角色卡/测试/docs/change/2026-11-10_RR14_snake-full-chain.md`，**155 行 / 21,384 bytes / `227589b04726d4fa206fd69d18a8a790139e7473d2c25048269aad7f4021339f`**；其 `git-policy-app-freeze-closure` 回执原文在案。
  - 独立复核 R1.0：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，**195 行 / 31,763 bytes / `4c01b07d…`**；结论「建议修订后提交」，M1/M2 修订前不建议进入 B1 实施派发；T3 成立。
  - 文档格式变更（在飞，只读）：方案 `docs/planning/2026-11-09_design_document-format-specifications.md`；派发记录 `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`；B2 报告 `docs/acceptance/2026-11-09_document-format-specifications-report-v1.md`（**53 pass / 0 fail**）。提交链：`3cd55dc`（团队计划 run 绑定，PR #80）→ `ecf9ead`（文档格式，**PR #81，未合并**）→ `0ab2584`（本分支基点）。复核实测：`origin/main` = `caabeea`（PR #80 合并）；本地 `main` 停在 `c1fb74a`（落后 origin），本 worktree 分支尖端即 #81 尖端 `0ab2584`。
  - 团队计划 run 绑定方案（T2 口径参考，只读）：`docs/planning/2026-11-09_design_team-plan-run-binding.md`。
- 代码基线：worktree `.claude/worktrees/trunk-amendment`；分支 **`feat/bootstrap-snapshot-freeze-closure`**；HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）。工作树另有历史未提交/未跟踪产物（含 `docs/communication/memo.md` M 与 `.commit-msg-*`/`.pr-body-*`/`.tmp-*`），**均不属于本方案写集**，仅只读。本文行号按当前检出标注；实施以**符号名与文本锚点**为准（doc-format PR #81 合并与本变更落地后行号会漂移）。
- 标记约定：**[事实]** 已只读核实的代码/文档/证据行为；**[推断]** 基于代码但未经真实运行证实；**[设计候选]** 本方案提议、未实施；**[待确认]** 见 §9 Q 清单。

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
|---|---|---|---|
| P1.0 | 2026-11-10 | 初稿：根因（单槽位装配 + 冻结闭包逐行谓词，含「历史草稿行不可满足」发现，file:line 证据）、a/b/c 比较、a′（装配+谓词收窄）推荐、写集/owner、测试矩阵、round8 复现、风险/披露、T3 判型、Q 清单（406 行 / 49,995 bytes / `1f6afc15…`） | 草案；R1.0 结论「建议修订后提交」（M1/M2/G1–G4/S1–S7） |
| P1.1 | 2026-11-10 | 按 R1.0 逐项修订：**M1** 收缩为「bootstrap 每 kind 至多一个当前版本 target；同 kind 多版本单请求明确拒绝；历史由账本自动装配」（§0.2/§1.4/§2.1/§3.1/§5.1/§6.3/§9）；**M2** 门禁补「frozen 闭包证明的 snapshot-content 路径加入 `allowed`」（§3.2/§5.1/§7.8）；G1 T15 限定 FS；G2 新增 RR20 attestation；G3 补 128 文件/树条目/base64 放大口径；G4 补多 flow 与 `-vN` 后缀负例；S1–S7 逐项处置（§8.1） | 修订稿；待 R1.1 窄复核 |

---

## 0. 摘要（先读这段）

### 0.1 问题

RR19 真实运行：product 以 `version-upgrade` + `baseTrunk:null`（bootstrap）提交 **7 个 targets**（proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1，`expectedFromSha256` 均为 `null`）。应用准备阶段生成完整快照 `s-9fbf9c81…`（63,937 B / `fa807db6…`），其 `files` **只有 6 个**（proposal v2、architecture v2、roster v2、modules v1、intent v1、`versions.jsonl`），三个 v1 文档不在其中；`vca-service.prepareDirect` 逐 target 要求文件在快照内，立即回执 `vca-target-invalid / "Target bytes absent from complete snapshot"`（19:42:35.313Z）。trunk 未发布，链路在门禁前停止。

RR14 是同一矛盾的另一面：product 只提交当前版本（4 targets），快照 6 文件；应用在 Git 发布策略处以 `git-policy-app-freeze-closure` 拒绝候选树——`versions.jsonl` 的冻结记录（proposal v1 / architecture v1 / roster v1 等）所指文件不在快照中。

本方案把两条路径合并为**一个根因**：direct bootstrap 的完整快照由 `TrunkApplySnapshot`（manifest 形状，**每种文档种类单槽位**）投影而来，历史版本在结构上无法进入快照；而冻结证据闭包要求历史冻结字节必须进入快照。角色无论「不提交历史」（RR14）还是「提交历史」（RR19），都必败。

**代码核对新增结论（本方案最关键的发现）[事实]：** 即使把全部历史冻结文件都放进快照，`classify-shell.ts` 的冻结闭包仍会对 `versions.jsonl` 的**每一行**（含 `baseline`/`version-added`/`draft-updated` 历史草稿行）要求对应 sha 出现在快照中；草稿行的旧 sha 是「原位改写」后的历史中间态（`draft-updated` 语义为 latest-record-per-path，`versioned-doc-guard.ts` 明示），磁盘上不存在、快照不可能携带。因此**只修快照装配（缺陷记录候选 a）不足以通过**；必须同时把门禁闭包谓词精确到 `event:"frozen"` 记录。RR19 因更早的 `vca-target-invalid` 先失败，尚未暴露这一层。

**复核新增（M1/M2）[事实]：** ① `executeDirectInternal` 要求 `expectedFrom` 条数 === 变更槽位数（`apply-journal.ts:713-714`），bootstrap 下每个 target 都 push（`:1321`），「同 kind 多版本单请求」（7 targets）修复后仍会被拒——受支持路径必须收缩为「每 kind 一个当前版本 target」，历史由账本自动装配；② 历史 frozen 文件写入候选树后，`classify-shell.ts:734-736` 的 `allowed`（仅当前槽位 `artifactPaths`）不放行，product 的 `gitRolePath` 只覆盖 `docs/product/`（`classify-shell.ts:207-221`），RR20 标准 4-target 会撞 `git-policy-raw-write-scope`——门禁必须把「经 frozen 闭包证明的 snapshot-content 路径」加入 `allowed`（仅此集合，不得放宽到任意路径）。

### 0.2 一句话方案（设计候选 a′ = a + 谓词收窄 + 允许集补齐）

- **服务侧（编排）**：bootstrap 的完整快照按「闭合证据集合」装配——`files` = `directRefs(target)`（**每 kind 至多一个当前版本 target，全部命中槽位**）× \(\cup\) `versions.jsonl` 中全部 `event:"frozen"` 记录解析出的文件（记录 sha 必须与磁盘字节一致，未知/缺失/漂移/不可读一律 fail-closed）× \(\cup\) 已确认意图 × \(\cup\) `versions.jsonl` 本身。**manifest 的单槽位语义不变**；历史版本由账本自动进入快照，**不作为 targets 声明**。同 kind 多版本单请求在 `prepareDirectSubmission` **明确拒绝**（不 last-wins、不静默取最高），与「装配可携带历史版本」明确区分。
- **门禁侧（门禁引擎）**：两处同函数改动——(i) `git-policy-app-freeze-closure` 精确到真实冻结证据，仅对 `event:"frozen"` 行要求 `primary.files` 含同 path 同 sha；其余 ledger 行保留既有形状/来源/归属校验。(ii) 将「经 frozen 闭包证明（`primary.files` 同 path 同 sha）的 `snapshot-content` 路径」加入 `allowed`，使 bootstrap 候选树写入范围接纳历史 frozen 文件；**不得**放宽到未被 frozen 记录证明的任意路径。
- 两者**必须在同一 PR、同一真实运行前落地**：只修其一，真实链路仍会在 `git-policy-app-freeze-closure` / `git-policy-raw-write-scope`（或 `vca-target-invalid`）失败。

### 0.3 客户可见结果（设计候选）

- 带历史冻结文档的项目可以通过受支持路径完成首次 trunk bootstrap：product 只需提交**当前版本**的规划文档 targets（`expectedFromSha256:null`），应用自动从 R9 冻结账本推导并携带历史冻结文件；不再要求角色枚举/补交历史文件。
- 冻结保护不弱化：每一条 `frozen` 记录仍必须在 bootstrap 快照中逐字节出现；缺失、漂移、不可读一律拒绝并如实回执。
- 失败回执沿用既有错误码集合（`vca-target-invalid` / `vca-apply-failed` / `git-policy-app-freeze-closure` / `git-policy-raw-write-scope`），消息给出具体路径/原因，便于下一轮 RR 定因。

### 0.4 本方案不做

- 不改 `version-change/v1` / `complete-snapshot/v1` / `trunk/v1` / `version-baseline/v1` 任何 schema 或数据模型（候选 c 被否决，见 §2.3）。
- 不放宽冻结/版本保护：`frozen` 记录闭包不减；未知/漂移/不可读的 fail-closed 不减；门禁允许集只补「frozen 证明」集合，不放宽到任意路径。
- 不支持「同 kind 多版本 targets 单请求」；这是与「快照可携带历史版本」相互独立的问题（§1.4/§3.1），如需支持须另立变更（会动 `expectedFrom`/槽位计数语义）。
- 不改角色、角色卡、边界、权限、writeSet、闸门语义；H1 delta = 0（§4.3）。
- 不改 `expectedFromSha256` / `baseTrunk` / `bootstrap` 语义；不改 `versions.jsonl` 格式或事件类型。
- 不重跑 RR、不伪造、不绕过；不提交/推送/合并/发布。

---

## 1. 问题陈述与根因（真实代码证据）

### 1.1 RR19 / RR14 事实（[事实]，原件在案）

1. RR19 提交：`kind:"version-upgrade"`、`flowId:"snake-game"`、`baseTrunk:null`、`operationId:"op-snake-game-trunk-bootstrap-20261110-01"`、7 targets（proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1；action 全 `add`；`expectedFromSha256` 全 `null`）。
2. 准备快照 `s-9fbf9c81fe75b7d09f77f46c477b10ce68f1330597be51c2f0e1baa22802934e`：`schema:"complete-snapshot/v1"`、digest `fa807db6…`、63,937 B、`files` **6 个**：proposal v2 `e6d9b033…`、architecture v2 `5c38b0dc…`、roster v2 `782d6bcd…`、modules v1 `824371eb…`、intent v1 `ae80808b…`、`.ans/state/versions.jsonl` `3e87ad9f…`（清单 `extracts/vca-snapshot-files.json` 可复算）。
3. 应用回执：`{"ok":false,"status":"rejected","errorCode":"vca-target-invalid","message":"Target bytes absent from complete snapshot"}`；trunk 未发布（无 `manifest.json`、无 `refs/ans/trunk`、无 `git-mode.json`），versions/version-changes 未变。
4. `versions-final.jsonl`（= 目标 `.ans/state/versions.jsonl`，7,228 B / `3e87ad9f…`）共 **21 行**：8 条 `frozen`（intent v1、proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1）+ 若干 `baseline`/`version-added`/`draft-updated` 历史行；其中如 intent v1 `fe926deb…`/`c77d8f46…`、architecture v1 `740cf63b…`、roster v2 `3acab868…`/`a12ce0aa…` 的 sha 都**不在磁盘任何文件上**（被原位改写）。
5. RR14（同目标、更早轮次）：VCA 只提交 4 个当前版本 targets，应用进入 Git 候选树策略检查后回执 `receipt.errorCode:"git-policy-app-freeze-closure"`（外层 `vca-apply-failed`），候选快照 `s-6a881f9d…` 同为 6 文件，缺 proposal v1 / architecture v1 / roster v1。RR14 与 RR19 的失败点不同，但快照内容集合相同（同一 6 文件 digest `fa807db6…` 与 RR8 历史快照一致）。

### 1.2 快照装配为什么是「单槽位」（代码证据）

- 数据结构：`TrunkApplySnapshot.documents: Partial<Record<TrunkDocKind, { path; sha256 }>>`（`src/model/trunk.ts:304-307`，`TrunkDocKind` 见 `:51`）——**每 kind 一个槽位**；`CompleteSnapshot.files` 本身是任意文件数组（`:596-600`，`isCompleteSnapshot` 只要求非空、路径唯一、hash/字节合法，`:645-657`；公共契约 `src/common/编排/doc-format-specs.ts:1650-1668` 同义）——快照格式**支持**多版本，限制来自装配。
- `prepareDirectSubmission`（`src/service/trunk/impl/apply-journal.ts:1288`）：
  - bootstrap 目标 `target` 初始化为空槽位（`:1300`）；
  - 逐 target 读盘并**按 kind 写槽**（`:1307-1318`）：`slot = "doc:" + doc; target.documents[doc] = { path, sha256 }`——同 kind 后写覆盖前写，v1 被 v2 覆盖；RR19 的 7 targets 因此只有 4 个槽位值；
  - 快照捕获 `files: [...directRefs(target), ...extra]`（`:1338-1339`）；`directRefs` 只取槽位值（`:564-568`）；`extra` 只有修正案文档（detail）、已确认意图、`.ans/state/versions.jsonl`（`:1323-1337`）。
- 此外，`expectedFrom` 在 bootstrap 下对**每个** target 都 push（`:1319-1321`），而 `executeDirectInternal` 要求 `expectedFrom` 条数 === 变更槽位数（`:710-714`）——因此即使装配层把历史版本放进快照，**同 kind 多版本单请求**仍会在 apply 阶段被 `vca-target-invalid`「Every changed target must have one expected original byte hash」拒绝（M1）。受支持路径必须只允许每 kind 一个当前版本 target；历史版本只由账本自动装配。
- `vca-service.prepareDirect`（`src/service/version-change/impl/vca-service.ts:299-321`）在提交准备阶段逐 target 执行 `input.snapshot.files.find(file => file.path === rel)`，缺失即 `fail("vca-target-invalid", "Target bytes absent from complete snapshot")`（`:317-318`）。这就是 RR19 的即时拒绝点。

### 1.3 冻结闭包为什么要求历史文件、又为什么不可满足（代码证据）

- Git 候选树策略 `appMetadataPaths`（`src/common/门禁引擎/classify-shell.ts:575` 起，direct-document-publication 分支 `:578-743`）：
  - 候选 `appGeneratedFiles` 的元数据表由 `materializeManifestFiles` 从 manifest 的 `snapshotRef` 展开——**快照里的每个文件都会被写进候选树**（`src/provider/trunk/impl/git-trunk-store.ts:669-695`；`planDocumentCommit` `:728-751`）。
  - 快照字节自洽：每个 snapshot file 必须与表内同 path 同 sha，且字节可复算（`classify-shell.ts:684-689`）；每个表内 snapshot-content 必须在 `primary.files` 内（`:734-736`）。
  - **冻结闭包**：对 `versions.jsonl` 的**每一条记录**解析文件路径（`-vN.md` 原样，否则 `${path}-v${version}.md`），要求 `primary.files` 含同 path 同 sha（`:724-729`，闭包行为 `:729`）；随后才按 `event === "frozen" ? isValidDocFreezeRecord(...) : [baseline/version-added/draft-updated/draft-marker] 且无 freeze` 校验来源（`:730-731`）。
  - **候选树写入范围（M2）**：`allowed` 初始为空（`:578`），扫描快照后加入 manifest/快照元数据；`artifactPaths` 仅由 `pub.documents`（当前槽位）与 `pub.execution` 填充（`:696-711`）；`snapshot-content` 行只有命中 `artifactPaths` 才 `allowed.add`（`:734-736`）。`rawObjectPolicyError` 对 diff 文件要求 `(exceptions.has(file) && mode 100644) || gitRolePath(f, file)`（`:883`、`:891`）。首建 trunk 的 `base` 为 null，历史 frozen 文件是「新增（A）」diff；`gitRolePath` 对 `actorRoleId:"product"` 只放行 `docs/product/`（`:207-221`，根表 `:211`）⇒ 历史 v1（`docs/proposals/`、`docs/contracts/`）被 `git-policy-raw-write-scope` 拒绝。
  - 失败经 `executeGitBusinessPublication` 映射为动作回执（`src/pipeline/orchestration/trunk-runtime.ts:491-542`，候选策略拒绝 `:529`）——RR14 的 `git-policy-app-freeze-closure` 即此路径。
- **关键语义矛盾**：`draft-updated` 的写入语义是「同 path/version 草稿原位改后的新 sha（latest-record-per-path）」（`src/common/门禁引擎/versioned-doc-guard.ts:1601-1624`，注释 `:1608`；事件枚举与公共契约 `src/model/version-change.ts:241-246`、`doc-format-specs.ts:2042-2073`）。旧草稿 sha 是被覆盖的中间态，磁盘上不存在；而 `:729` 对**所有行**要求闭包。**任何曾经通过应用写侧编辑过草稿的项目**（正常路径）都不可能满足逐行闭包——即使快照携带全部 `frozen` 文件。该行只在 bootstrap 生效（`.ans/state/versions.jsonl` 仅 bootstrap 进入快照，`:723`），因此缺陷只在「带应用写历史的首次 bootstrap」暴露。
- 由此得到补齐缺陷记录后的完整根因链：**快照装配不能携带历史版本（1.2）→ 冻结闭包要求历史字节（1.3 前半）→ 闭包谓词把不可恢复的草稿历史也当作要求（1.3 后半）→ 候选树写入范围不接纳历史 frozen 文件（1.3 的 M2）**。

### 1.4 RR14 与 RR19 是同一矛盾的两面（并补充第三面）

| 轮次 | 角色行为 | 快照内容 | 失败点 | 解释 |
|---|---|---|---|---|
| RR14 | 只提交当前版本（4 targets） | 6 文件（当前槽位 + 意图 + versions） | `git-policy-app-freeze-closure` | 闭包要求 3 个历史 frozen 文件，快照结构上无法携带 |
| RR19 | 追加历史 v1 为 targets（7 targets） | 仍 6 文件（v1 被槽位覆盖） | `vca-target-invalid`「Target bytes absent…」 | 角色「按要求补历史」，但装配层丢弃同 kind 历史 |
| （未到达） | 假设快照已含全部 8 个 frozen 文件 | 9 文件 | 仍会 `git-policy-app-freeze-closure` | 逐行闭包还要求 5 个历史草稿 sha（baseline/version-added/draft-updated 旧值），快照不可能携带 |
| （修复后 RR19 复现） | 7 targets 同 kind 多版本单请求 | — | `vca-target-invalid`（expectedFrom 7 ≠ 槽位 4） | **M1**：单请求 target 列表与「装配可携带历史版本」是两个独立问题；受支持路径只接受每 kind 一个当前版本 target |

结论：**RR14 的「缺 v1」与 RR19 的「快照单槽位」是同一装配缺口的两个投影；修好装配后还会遇到谓词过宽（第三面）与候选树写入范围（M2）；若角色继续按 7-target 提交，还会撞 expectedFrom/槽位计数（M1）。** 这四点都必须由本方案处理，否则「修复后真实运行」会再次失败。

### 1.5 根因结论

1. **装配缺口**：direct bootstrap 的 `CompleteSnapshot.files` 由 `TrunkApplySnapshot`（manifest 单槽位投影）生成，历史版本被结构性丢弃；`vca-service.prepareDirect` 又正确地要求 target 必须在快照内——两者冲突。
2. **谓词缺口**：`git-policy-app-freeze-closure` 未区分「真实冻结证据（frozen）」与「历史草稿账本行（baseline/version-added/draft-updated/draft-marker）」，把不可恢复的中间态也纳入闭包，使带写历史的项目无法 bootstrap。
3. **候选树范围缺口（M2）**：闭包即使通过，历史 frozen 文件写入候选树仍被 `git-policy-raw-write-scope` 拒绝（`allowed` 只覆盖当前槽位，`gitRolePath` 对 product 只覆盖 `docs/product/`）。
4. **单请求语义缺口（M1）**：`expectedFrom` 按 target 逐条计数、槽位按 kind 去重计数，同 kind 多版本单请求在 apply 阶段必被拒；受支持路径须收缩为每 kind 一个当前版本 target。
5. **保护语义本身正确**：冻结记录必须逐字节进入 bootstrap 快照这一目标是对的；问题在「快照装配不能表达」「谓词范围过宽」「候选树允许集不足」「单请求允许多版本」，不是冻结保护过严。

### 1.6 目标 / 非目标

- 目标：带历史冻结文档的项目可通过受支持路径（每 kind 一个当前版本 target）完成 bootstrap；`frozen` 记录闭包完整、fail-closed；候选树写入范围只接纳 frozen 证明的历史文件；旧调用与非 bootstrap 路径行为不变；审计可复现。
- 非目标：不支持同 kind 多版本单请求；不改 schema/数据模型/角色/边界/权限/闸门语义；不重跑 RR；不处理多 flow 账本、超大历史等本缺陷之外的限制（§7 披露）。

---

## 2. 候选方案比较（a / b / c）

评估维度：正确性、是否弱化冻结/版本保护、fail-closed（未知/漂移/不可读）、公共契约/数据模型/marker/门禁政策影响、写集/owner、测试成本、与现有 VCA/trunk/Git 媒体路径兼容、旧调用兼容、审计可复现。

### 2.1 候选 a：bootstrap 快照按 target 收集全部版本文件（含历史 v1）

- **做法**：`prepareDirectSubmission` 不再只写槽位，快照 `files` 取全部 VCA targets。
- **正确性**：解决 RR19 的直接拒绝（`vca-target-invalid`），但**不解决 RR14**——角色只提交当前版本时历史文件仍不在快照；即使角色提交历史，逐行闭包仍因草稿行失败（§1.3）。**[事实] 单独实施 a 后真实运行仍会失败。** 另外「全部 targets」承诺本身不可执行：7-target 同 kind 多版本会在 `expectedFrom`/槽位计数处被拒（M1，§1.2），候选树写入范围也未放行历史文件（M2，§1.3）。
- **冻结保护**：不弱化（反而要求更多）。
- **fail-closed**：读盘由 `captureSnapshot` 保证；无新增放宽。
- **契约/门禁影响**：`complete-snapshot/v1` schema 不变；无新 marker；无门禁政策改动（但因此不能闭合）。
- **写集/owner**：仅 `src/service/trunk/impl/apply-journal.ts`（编排）+ 测试。
- **测试成本**：中；但无法写出「真实链路通过」的验收用例（会停在 gate），**不可作为最终方案**。
- **兼容/审计**：旧调用兼容；快照 digest 变化可复现。

### 2.2 候选 b：冻结闭包对非当前版本按 effective snapshot/冻结记录豁免

- **做法**：`classify-shell.ts` 对非当前版本（不在 manifest 文档槽位）不要求出现在候选快照，或直接按冻结记录信任。
- **正确性**：可让 bootstrap 通过；实现最小。
- **冻结保护**：**弱化**。bootstrap 提交的完整快照将不再证明历史冻结字节与 trunk 首建一致；后续 `verify` 无法从快照闭合核对冻结记录。与缺陷约束「不弱化冻结/版本保护语义」直接冲突。
- **fail-closed**：豁免路径本身即放宽；未知/漂移不会被快照层发现。
- **契约/门禁影响**：改门禁政策，且是**语义放宽**——按项目口径必须 T3，且需客户/复核明确接受保护降级；本方案不建议。
- **写集/owner**：`src/common/门禁引擎/classify-shell.ts`（门禁引擎）+ 测试。
- **兼容/审计**：旧行为改变（原本应拒的候选可能被放行），审计可复现性下降。
- **结论**：**否决**（违反不弱化约束）。

### 2.3 候选 c：schema/action 明确携带历史冻结版本

- **做法**：扩展 VCA 目标/请求契约（如新增 `kind:"frozen-closure"` target、或 `closure:[{path,version,sha256}]` 字段），由调用方显式声明历史冻结版本；应用按声明纳入快照。
- **正确性**：可解决 RR19；但**不解决草稿行谓词问题**（仍会 `git-policy-app-freeze-closure`），也不解决 M2，必须叠加 b′（谓词收窄 + 允许集）；且若同时允许多版本 targets，仍会撞 M1。
- **冻结保护**：若强制执行「声明必须与冻结记录逐条相等」可不弱化；但把应用拥有的账本事实（`versions.jsonl`）转成模型必填，引入新的错报/漏报面（RR19 已证明模型容易列错历史）。
- **契约/数据模型**：**公共契约扩展**——`version-change/v1` schema、`VersionChangeTargetKind` 枚举、工具 schema（`src/provider/runtime/schema.ts`/`tools.ts`）、`doc-format-specs.ts` 注册表、product 角色 api-spec/preflight、桌面注入面全部要动；涉及运行时核心 + 编排 + 门禁引擎 + 桌面多个 owner，H1 delta > 0。
- **fail-closed**：可设计，但校验面扩大；旧调用（不带新字段）需默认兼容或版本化，兼容成本最高。
- **审计**：请求可读性提高，但与账本重复申报存在不一致处理成本。
- **结论**：**否决**——收益（可读性）低于契约/模型/多 owner 成本，且无法独立闭合缺陷。

### 2.4 候选 a′（推荐）：装配闭合 + 谓词精确化 + 允许集补齐

- **做法**：服务侧装配（每 kind 一个当前版本 target；历史 frozen 文件由账本自动收集；同 kind 多版本单请求明确拒绝）+ 门禁两处改动（闭包仅对 `event:"frozen"`；frozen 证明的 `snapshot-content` 路径加入 `allowed`）。
- **正确性**：同时闭合 RR14/RR19/(第三面)/M1/M2；真实链路具备通过条件（由 RR 验证）。
- **冻结保护**：**不弱化**——所有 `frozen` 记录仍强制逐字节进入 bootstrap 快照；被排除的只是「从未冻结、已被原位覆盖」的草稿历史行；`allowed` 补齐只接纳字节已被冻结记录钉死的路径。为什么不用「每 path 最后一条记录」口径：冻结是终态（`versioned-doc-guard.ts:1601-1606`，冻结后写一律拒绝），已冻结路径末条必为 frozen；但**从未冻结**路径的末条为 `draft-updated`，其当前字节未必在 targets/槽位中，仍可能不可满足。故 `event:"frozen"` 是既必要又充分的保护口径。
- **fail-closed**：装配对账本解析失败、未知 event、frozen 记录形状非法、异 flow 行、文件缺失/不可读、记录 sha 与磁盘漂移、同 path 冲突 sha、`-vN.md` 后缀版本不一致全部拒绝；门禁对未知 event/非法 freeze/未证明路径仍拒绝。
- **契约/门禁影响**：无 schema/数据模型/marker 变化；`complete-snapshot/v1` 语义不变；门禁改动限于同一函数的两处（闭包范围 + 允许集），无新错误码、无其他 policy 分支改动。
- **写集/owner**：两个 owner、两个源文件（+测试）：编排（`apply-journal.ts`）、门禁引擎（`classify-shell.ts`）、测试（跨角色集成）。
- **测试成本**：中（§5 矩阵）；可用确定性 fixture + 真实 Git 对象验证。
- **兼容/审计**：旧调用（非 bootstrap）逐字不变；bootstrap 快照变大为确定性集合；快照 ID 算法不变、digest 可复算。

### 2.5 比较结论

| 维度 | a | b | c | **a′（推荐）** |
|---|---|---|---|---|
| 解决 RR19 即时拒绝（4-target 路径） | 是 | 否 | 是 | 是 |
| 解决 RR14 闭包缺历史 | 否 | 是（但弱化） | 否（需叠加） | 是 |
| 解决草稿行不可满足 | 否 | 是（弱化） | 否（需叠加） | 是（精确化，不弱化） |
| 解决 M2 候选树写入范围 | 否 | 否 | 否 | 是（frozen 证明集） |
| 解决 M1 同 kind 多版本单请求 | 否（承诺不可执行） | 否 | 否 | 明确拒绝（范围外） |
| 冻结/版本保护 | 保持 | **弱化** | 保持 | **保持** |
| schema/数据模型 | 不变 | 不变 | **扩展** | 不变 |
| 门禁政策 | 不变 | 放宽 | 不变 | **两处精确化/补齐** |
| 写集/owner | 1 文件 | 1 文件 | 多 owner、契约面大 | 2 文件 + 测试 |
| 旧调用兼容 | 是 | 行为变化 | 需版本化 | 是 |
| 审计可复现 | 是 | 下降 | 中 | 是 |

---

## 3. 推荐方案（设计候选 a′）

### 3.1 服务侧装配（owner：编排）

**改动点**：`src/service/trunk/impl/apply-journal.ts`（`prepareDirectSubmission` 及其被 `executeDirectInternal` fallback 复用的 helper）。

1. **bootstrap 受支持 target 规则（M1，二选一后取「收缩承诺」）**：
   - 受支持路径：**每个 kind 至多一个当前版本 target**（version-upgrade：proposal/modules/topology/architecture/assets/roster 各 ≤1）。
   - 在 target 循环（`:1302-1322`）增加槽位重复检查：同一 `slot`（`doc:<kind>`/`execution:<kind>`）第二次出现时，**bootstrap（`!current`）明确拒绝**：`trunk-item-invalid`（经 `version-change-runtime.ts:703` 映射为 `vca-target-invalid`），消息含 slot/路径与「历史冻结版本由 R9 账本自动装配，不得作为 targets 声明」。
   - 不做 last-wins，也不做「最高版本静默选择」（RR19 的输入顺序恰好正确，不应依赖）；同 kind 同版本不同路径几乎不可达，仍由路径钉死（`:720-722`）兜底。
   - 非 bootstrap 路径的重复 target 仍由既有 `expectedFrom`/槽位计数（`:713-714`）拒绝，行为与消息不变（§3.6）。
   - **明确区分两个问题**：「快照可携带同 kind 的多个历史版本」由装配负责；「单请求 target 列表可否含多版本」在本变更中为**否**。
2. **bootstrap 闭合文件集合**（`!current` 分支，`:1328-1337` 区域）：
   - 读取 `.ans/state/versions.jsonl` 原始字节（现有 `baselineRef` 已读，`:1335-1336`），逐行 JSON 解析并校验最小形状：`v===1`、`flowId === input.flowId`、`path` 非空字符串、`version` 正整数、`sha256` 为 64 hex、`event ∈ {baseline,version-added,frozen,draft-updated,draft-marker}`；`event === "frozen"` 的行再用 `isValidDocFreezeRecord(record.freeze)` 校验（`src/model/version-change.ts` 已导出）。
   - **异 flow 行 fail-closed**（不静默过滤）：与门禁 `:726` 的每行 `flowId === pub.flowId` 同规则；消息含行/flowId。
   - 对 `event === "frozen"` 的行解析文件路径，**与门禁完全同一规则**：`/-v\d+\.md$/.test(path) ? path : `${path}-v${version}.md``；服务侧**防御性**要求 `docVersionOfPath(file) === record.version`（门禁保持 `:728` 原样使用路径；差异由 T18 钉住）。
   - 对每个解析出的文件读盘并校验：存在、可读、`fileSha256 === record.sha256`；否则拒绝（见 3.1.4）。同 path 多来源（target / frozen / intent / versions）必须 sha 一致；冲突即拒绝。
   - 闭合集合 = `directRefs(target)`（当前槽位；因每 kind ≤1，等价于全部 targets）× \(\cup\) 全部 frozen 记录文件 × \(\cup\) 已确认意图（现有 registry 逻辑）× \(\cup\) `.ans/state/versions.jsonl`；修正案文档（detail）维持现有行为。
   - 以确定性顺序（path 字典序）生成 `captureSnapshot.files`；`snapshotId` 保持 `s-${directHash([flowId, operationId])}` 不变。
3. **两处捕获共用同一 helper**：`prepareDirectSubmission` 的捕获（`:1338-1339`）与 `executeDirectInternal` 的 fallback 捕获（`:737-739`，无 preparedSnapshotRef 的旧/直连调用）都调用同一 `bootstrapClosureFiles(...)` 纯装配函数；非 bootstrap 路径不调用（行为逐字不变）。fallback 实际只对 FS 媒体旧直连调用可达（Git 发布路径始终携带 `preparedSnapshotRef`，见 G1/§3.6）。
4. **fail-closed 与错误码**：
   - 继续返回 `trunk-item-invalid`（经 `version-change-runtime.ts:703` 映射为 `vca-target-invalid`），**不新增外部错误码**；消息明确到具体原因与路径：
     - `Bootstrap accepts at most one target per document slot; historical versions are assembled from R9: <slot/path>`
     - `Frozen closure record is unreadable/invalid: <line/path>`
     - `Frozen closure record belongs to another flow: <flowId>`
     - `Frozen closure file is missing/unreadable: <path>`
     - `Frozen closure hash drift: <path>`
     - `Frozen closure path conflict: <path>`
   - 不吞行、不跳过、不从未知来源补 hash；`captureSnapshot` 自身的 `snapshot-hash-drift:<path>` 原样保留。
5. **实现边界**：不 import 门禁引擎私有模块（避免跨角色私有依赖）；路径解析规则在服务侧本地实现，并以 §5 的跨角色 pin 测试钉住与门禁一致。注意区分 VCA「作者写区」（`targetPathInAuthorArea`：product 可提交 proposal/contract/roster）与 Git 门禁 `gitRolePath`（角色根路径：product 仅 `docs/product/`）——M2 的成因之一，二者不可混用（S7）。

### 3.2 门禁两处改动（owner：门禁引擎）

**改动点**：`src/common/门禁引擎/classify-shell.ts`，`appMetadataPaths` 的 `frozen-application-evidence` 分支（`:713-733`）与允许集（`:578`、`:734-736`）。两处同函数、同一 PR，仍属 B2/T3。

1. **冻结闭包精确到 `frozen`（原 P1.0 方案）**：
   - `event === "frozen"` 的行：保留 `primary.files.some(file.path === resolved && file.sha256 === record.sha256)`（**强度不变**）。
   - `baseline` / `version-added` / `draft-updated` / `draft-marker` 行：保留既有形状/归属校验（`:726-727` 与 `:730-731` 的 `freeze` 存在性规则），不再要求快照携带其历史字节。
   - 未知 `event` 仍由 `:730-731` 拒绝（fail-closed），不新增豁免。
2. **允许集补齐（M2）**：
   - 在闭包循环中收集「`event:"frozen"` 且已在 `primary.files` 中同 path 同 sha 证明」的解析路径集合（`frozenClosurePaths`）。
   - 循环后：对每个路径，仅当其元数据表行 kind 为 `snapshot-content`（即非 `.ans/` 应用文件）时，`allowed.add(path)`。
   - 效果：`rawObjectPolicyError` 的 diff 写入范围检查（`:891`）接纳这些历史 frozen 文件；candidate 与 publication 两个 verdict 走同一函数，同时修复。
   - **边界**：不加入任何未被 `frozen` 记录证明的路径；`complete-snapshot`/`frozen-application-evidence`/其他行不受影响；teamPlan 的「unrelated bytes」检查（`:739-741`）保持逐字节不变要求。路径字节已由 `primary.files` 同 path 同 sha + 快照 digest + 账本本身在快照内三重钉死，写入候选不构成保护降级。
3. **不改**：`git-policy-app-freeze-record` / `git-policy-app-freeze-source` / `git-policy-app-document-closure` / `git-policy-app-content-closure` / 其他 policy code 与 `checkGitPolicy` 公共签名/返回形状。
4. 测试钉住：T1（4-target 全链 policy allowed）、T11（缺 frozen 文件仍拒）、T13（非 frozen 行不要求快照）、T19（未被 frozen 证明的额外 snapshot-content 仍 `git-policy-raw-write-scope`）。

### 3.3 为什么这不是弱化（等价论证）

- 冻结保护的断言是「**每一条冻结记录**的字节都进入 bootstrap 快照/trunk 首建」。a′ 对该断言**逐条保持**：任一 `frozen` 行缺失/漂移/不可读/异 flow 即拒绝（服务侧装配 + 门禁双重校验）。
- 被排除的只有**从未被冻结、且已被原位覆盖的草稿账本行**。这些行的旧字节在项目磁盘/任何快照中都不存在，要求它们进入快照既不可满足、也不构成任何保护（它们不是权威版本）。
- 「每 path 最后一条记录」口径不足：冻结是终态（`versioned-doc-guard.ts:1601-1606`），已冻结路径末条必为 frozen；但从未冻结路径的末条是 `draft-updated`，其当前字节可能不在 targets/槽位中，仍可能不可满足。`event:"frozen"` 是既必要又充分的保护口径。
- 候选树允许集补齐只接纳「字节已由 frozen 记录 + 快照 digest 钉死」的历史文件；任何未证明路径仍按 `git-policy-raw-write-scope` 拒绝。保护不降级。
- 版本链/追加式保护不变：`versioned-doc-guard` 的 latest-record-per-path、冻结终态、`versions.jsonl` 追加语义、`verify` 的冻结/草稿状态判定均未改。
- 非 bootstrap 路径不受影响：`versions.jsonl` 仅在 bootstrap 进入快照（`:723` 的分支前提），谓词收窄/允许集补齐对其他发布形态零影响；下游 initial-workflow 继承 bootstrap 快照文件时，与基树相同的文件仍按既有 `:405-409` 放行（复核已核实）。

### 3.4 快照大小 / 性能 / 完整性 / 去重 / 排序 / 哈希口径

- **大小与硬上限（G3 完整口径）**：
  - 文件数 = 当前槽位（≤6）+ frozen 版本文件（与槽位重叠，RR19 口径为 3 个历史 v1）+ 意图 + versions.jsonl；RR19 修复后为 9 文件、约 80 KB 原文。
  - Git 策略 raw plan：`input.files.length <= 128`（`classify-shell.ts:837`）、单文件 ≤ 1 MiB 且整单 ≤ 4 MiB（`:850`）、树条目 ≤ 2048（`:854`）。
  - 快照 JSON 以 base64 内嵌全部文件字节（约 1.33× 放大）并计入同一 `files` 总量 ⇒ 对「文档原始总字节」的实际上限约 **≤1.5 MB**（另加 manifest/history）；超过按既有 `git-policy-raw-byte-budget` fail-closed，本方案**不提升预算**。
- **性能**：每文件一次读盘 + SHA-256（现有 `captureSnapshot` 路径），线性；去重后无重复读。
- **完整性**：每个请求文件由 `captureSnapshot` 读盘复核 sha；同一 path 大小写冲突、重复 path 不同 sha 由 `captureSnapshot` 拒绝（`fs-trunk-store.ts:512-516`）；装配层再做跨来源 sha 一致性检查。
- **去重**：按 path（与 `captureSnapshot` 同口径的大小写不敏感检查）合并；同 path 必须同 sha（target 磁盘读 / frozen 记录 / 意图注册表 / versions.jsonl），冲突即拒绝。
- **排序**：装配完成后按 path 字典序排列，保证同一操作重放得到相同快照 JSON 与 digest（`prepareSnapshot` 以 digest 判幂等，`fs-trunk-store.ts:256-274`）。
- **哈希口径**：文件 sha256 = 原始字节；快照 digest = `completeSnapshotDigest`（按 path 排序后的 `[path, sha256.lower, bytesBase64]` JSON 的 sha256，`src/provider/version-change/impl/guard-freeze-registry.ts:56-59`）——**算法不变**。
- **快照 ID**：不变（`s-<hash(flowId, operationId)>`）；已存在的同 ID 不同 digest 快照会 `snapshot-immutable-conflict` ⇒ 修复后必须使用**新 operationId** 重跑（RR19 的 `s-9fbf9c81…` 已成为不可变证据，见 §6/§7）。

### 3.5 审计可复现

- 给定（a）VCA targets 清单与操作 id、（b）`versions.jsonl` 字节（其 hash 已被快照内嵌）、（c）意图冻结记录，可离线复算 bootstrap 期望文件集合与 digest：`frozen` 行 → 路径 → 记录 sha；与快照清单逐条对照。
- M2 的 `allowed` 补齐可离线核对：每条加入的路径必须能对应一条 `frozen` 行且与 `primary.files` 同 sha；不存在「仅因路径前缀被放行」的路径。
- 失败回执消息含具体路径；RR 证据可据此定因，不再出现「只给 code 不给缺失项」。

### 3.6 旧调用兼容

- 非 bootstrap VCA（tN→tN+1）、detail-amendment、team-plan、激活、initial-workflow 路径：代码路径与快照内容不变。
- 同 kind 多版本单请求：仅 bootstrap 新增明确拒绝（消息变化、仍 fail-closed）；非 bootstrap 仍由既有 `:713-714` 拒绝（行为与消息不变）。
- 直接调用 `executeDirect`（无 `preparedSnapshotRef`）的旧/测试调用：仅 bootstrap 分支获得闭合集合；**fallback 只对 FS 媒体可达**（Git 发布路径始终携带 `preparedSnapshotRef`，`trunk-runtime.executeGitBusinessPublication` 才调用 `checkGitPolicy`；裸 git store 的 `compareAndSwapManifest` 无 scope 时不跑 policy——G1），故 T15 只作 FS 回归，不宣称 Git policy。
- `prepareDirect` 的「target 必须在快照内」检查保留（它是对的）；旧调用若只传当前槽位 targets，行为不变。
- 既有快照/历史/operation 记录不迁移、不重写；旧快照仍可读（schema 未变）。
- 下游 initial-workflow/激活稳定链：会继承 bootstrap 快照的全部文件（`stable-snapshot.ts:152-159`），与基树相同即按 `classify-shell.ts:405-409` 放行，不会因更大快照再撞门（复核已核实）。

---

## 4. 写集 / owner 候选（按角色 Section 1）

### 4.1 批次与写集（单写者）

| 批次 | Owner | 写集（Section 1 内） | 前置 | 说明 |
|---|---|---|---|---|
| B1 服务装配 | 编排 | `src/service/trunk/impl/apply-journal.ts`（M）；`test/编排/direct-role-capabilities.test.ts`（M）或 `test/编排/bootstrap-frozen-closure.test.ts`（新）；`角色卡/编排/docs/change/2026-11-10_W_bootstrap-frozen-closure.md`（新） | 无（可与 B2 并行） | 每 kind ≤1 target 的 bootstrap 拒绝、闭合集合装配、fail-closed、两处捕获共用 helper |
| B2 门禁改动 | 门禁引擎 | `src/common/门禁引擎/classify-shell.ts`（M）；`test/门禁引擎/git-shell-acl.test.ts`（M）或 `test/门禁引擎/freeze-closure.test.ts`（新）；`角色卡/门禁引擎/docs/change/2026-11-10_W_freeze-closure-scope.md`（新） | 无（可与 B1 并行） | (i) `git-policy-app-freeze-closure` 仅对 `frozen` 行；(ii) frozen 证明的 `snapshot-content` 路径加入 `allowed`；其余校验不变 |
| B3 跨角色集成 | 测试 | **优先新增** `test/测试/bootstrap-freeze-closure-integration.test.ts`（新）；如需改 `test/测试/git-write-chain-fixture.ts`（683 行共享 fixture），只做加法导出并列出依赖套件回归面（S6）；`角色卡/测试/docs/change/2026-11-10_D_bootstrap-frozen-closure.md`（新） | B1+B2 | 真实 Git 对象 + 真实 `prepareDirectSubmission`：4-target、多版本账本、8 frozen + 5 草稿行、M2 允许集；pin 服务侧与门禁路径解析一致 |
| B4 真实运行 | 测试 | 仅 `角色卡/测试/docs/change/2026-11-10_RR20_bootstrap-freeze-closure.md` + 证据目录（仓库外运行根） | B3 + 独立验收放行 | §6（含 attestation） |
| B5 独立验收 | 独立验收 | `docs/acceptance/2026-11-10_bootstrap-freeze-closure-criteria-v1.md` / `-report-v1.md` | B1–B4 | 不在本方案写集，列出供协调方排期 |

- **单写者**：`apply-journal.ts` 只由编排写；`classify-shell.ts` 只由门禁引擎写；`test/测试/` 只由测试写；同一时刻一人一文件。
- **H1 delta = 0**：不改角色卡正文、边界、权限、writeSet、闸门语义定义；各 owner 的 `docs/change` 记录与（如角色规范要求）自身 `feature-map.md`/`functional-description.md` 更新属其 Section 1 既有授权的实现记录，不构成权限/角色变化。
- **不涉及**：运行时核心（`src/model/*`）、`doc-format-specs.ts`、`src/provider/runtime/*`、桌面、`app/*`、`docs/scheduling/*`。
- **记录归属（S5）**：本方案 `docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`、缺陷记录 `docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`、复核记录 `docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md` 当前均未跟踪；三者位于角色边界之外，应由策划/协调方随实施 PR（或一个 docs-only 提交）一并提交，路径与哈希写入 B2/D1 记录，**不得孤儿化**。

### 4.2 与在飞变更的重叠与串行建议

- **doc-format PR #81（`feat/document-format-specifications`，提交 `ecf9ead`；本分支基点 `0ab2584` 已含其提交）**：写集**零重叠**（#81 是 `doc-format-specs.ts`/runtime tools/schema/session 等；本变更在 `apply-journal.ts` + `classify-shell.ts`）。执行上：
  - 建议 **#81 先合并**（客户逐 PR 允许后）→ 本分支 rebase 到 `main` → 开本 PR。理由：避免把 #81 的 diff 混进本 PR、保持评审面干净；本分支已基于 #81 提交，rebase 预计无冲突（除 `docs/scheduling`/`docs/communication` 记录类可能有文本邻近）。
  - 若 #81 合并继续受阻：开 **stacked PR**，base 指向 `feat/document-format-specifications`，并在 PR 描述中注明「依赖 #81；#81 合并后 retarget 到 main」。**不得**把两变更压成一个 PR。
  - **基线时效（S4）**：复核实测 `origin/main` = `caabeea`（PR #80 合并）、本地 `main` = `c1fb74a`（落后）；实施前必须 `git fetch origin`，以「`origin/main` + #81 合并后的干净分支」为基线（当前 worktree 分支尖端即 #81 尖端 `0ab2584`，不是最新 main）。
- **团队计划 run 绑定（`3cd55dc`，已在基点历史中）**：无重叠；不改其 `completeTeamPlanInternal`/`baseDigest` 语义。
- **工作树现存未提交/未跟踪产物**（`docs/communication/memo.md` M、`.tmp-*`、`.commit-msg-*`、`.pr-body-*` 等）：实施必须从干净基线新建分支，**不得**把其带入本 PR。
- **串行顺序**：B1 ∥ B2 → B3 → B5(D1/验收) → B4(RR20)。B1/B2 必须同 PR 合并（只合并其一不能通过真实运行）。

### 4.3 若审批要求拆 PR

- 可拆为「B1 服务装配」与「B2 门禁改动」两个 PR，但必须**同一发布批次**（同一目标 tag/同一真实运行前全部合并）；拆分时在各自 PR 描述中交叉引用并注明「单独合并不改变真实运行结果」。若协调方要求只允许一个 PR，按 §4.1 单 PR 执行。

---

## 5. 测试 / 验收输入

### 5.1 单元 / 集成 / 确定性矩阵

| # | 场景 | 预期 | 层 |
|---|---|---|---|
| T1 | **受支持 bootstrap**：4 个当前版本 targets（proposal v2、architecture v2、roster v2、modules v1，`expectedFromSha256:null`）+ `versions.jsonl`（8 frozen + 5 草稿旧 sha + intent v1）+ 3 个历史 v1 文件在盘 | `prepareDirectSubmission` 快照 9 文件（8 frozen 文档含 intent v1 + versions.jsonl）；`prepareDirect` 通过；经 `executeGitBusinessPublication` 的 candidate+publication policy **allowed:true**（含 M2 允许集） | 编排 + 门禁 + 集成 |
| T2 | **7-target 同 kind 多版本单请求**（RR19 原样） | `prepareDirectSubmission` 明确拒绝（`vca-target-invalid`，消息含 slot/「历史由 R9 自动装配」）；无提交；**不再**以「Target bytes absent」/`expectedFrom` 计数错误呈现（M1） | 编排 |
| T3 | 历史 frozen 文件缺失（记录在、磁盘无） | fail-closed：`vca-target-invalid`，消息含路径；无 manifest/ref；无 freeze 追加 | 编排 |
| T4 | 历史 frozen 文件漂移（磁盘 sha ≠ 记录 sha） | fail-closed（`snapshot-hash-drift`/明确消息）；无提交 | 编排 |
| T5 | 历史 frozen 文件不可读（IO/权限） | fail-closed；无提交 | 编排 |
| T6 | versions.jsonl 含未知 event / 坏行 / 非法 freeze 形状 | fail-closed；不跳过 | 编排 + 门禁 |
| T7 | 同 path 两种 sha（target 与 frozen 记录冲突） | fail-closed，消息含 path | 编排 |
| T8 | 无历史（全新项目，仅 intent-confirmed + 单版本 targets） | 行为与原实现一致（快照内容不变），bootstrap 通过 | 编排（回归） |
| T9 | 非 bootstrap 升级（t1→t2） | 快照内容/流程逐字不变；不调用闭合收集 | 编排（回归） |
| T10 | 门禁：versions.jsonl 含 frozen + 草稿行，快照含全部 frozen 文件 | `checkGitPolicy` allowed | 门禁 |
| T11 | 门禁：缺一个 frozen 文件 / frozen sha 不符 | 仍 `git-policy-app-freeze-closure`（强度不变） | 门禁 |
| T12 | 门禁：未知 event 或冻结行 `freeze` 非法 | 仍 `git-policy-app-freeze-record`/`-source` 拒绝 | 门禁 |
| T13 | 门禁：非 frozen 行未进入快照 | allowed（本变更语义） | 门禁 |
| T14 | marker/政策不变：`git-policy-app-*` 其他分支、team-plan/activation/workflow policy 用例 | 全部既有断言不变 | 门禁（回归） |
| T15 | **FS 媒体**：直接 `executeDirect`（bootstrap，无 preparedSnapshotRef） | 闭合集合装配 + `verifyClosure`（子集）通过；**不宣称 Git policy**（G1：`executeDirect` 不经 `checkGitPolicy`；Git 发布路径恒有 preparedSnapshotRef） | 编排（FS 回归） |
| T16 | 确定性/重放：同一 operationId 重放装配 | 相同快照 digest；`prepareSnapshot` 幂等；不同文件集合的旧 operationId → `snapshot-immutable-conflict`（fail-closed，披露） | 编排 |
| T17 | **多 flow 账本负例**：versions.jsonl 含异 flow 行 | 服务侧逐行 fail-closed（消息含 flowId，不静默过滤）；门禁仍按 `:726` 拒绝 | 编排 + 门禁 |
| T18 | **`-vN.md` 后缀版本 ≠ record.version** | 服务侧防御性 fail-closed（Q7）；门禁保持 `:728` 原样使用路径（差异与理由写明） | 编排 + 门禁 |
| T19 | **M2 负例**：快照含额外 `snapshot-content` 文件但无对应 frozen 记录 | 门禁仍 `git-policy-raw-write-scope` 拒绝（允许集不得过宽） | 门禁 |

### 5.2 typecheck / 受影响套件

- `npm run typecheck`（exit 0）。
- 编排：`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-trunk-store.test.ts`、`test/编排/git-capabilities.test.ts`。
- 门禁：`test/门禁引擎/git-shell-acl.test.ts`（新增 M2/closed-scope 用例）、`test/门禁引擎/versioned-doc-guard.test.ts`（语义回归）、`test/门禁引擎/classify-shell.test.ts`（shell 判定不受影响）。
- 跨角色/集成：B3 新增 `test/测试/bootstrap-freeze-closure-integration.test.ts`；`test/测试/version-change-integration.test.ts`；`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（调用 `checkGitPolicy` 的回归）。若修改 `git-write-chain-fixture.ts`，列出所有依赖套件并全跑。
- 若 B3 新增独立测试文件：只跑该文件 + 上述受影响套件；全量回归按独立验收的 T3 口径决定（本方案建议 T3 全量或至少受影响 + Git 发布链全链）。
- 证据：D1 风格记录（before/after 失败集合、typecheck 输出、候选/manifest 哈希）；独立验收按 B1 判据执行。

### 5.3 验收输入给独立验收

- 变更文件逐文件 raw SHA-256 与聚合、`src app test` manifest、基线/候选对比。
- 新增/修改用例清单与 pass/fail 计数；T1–T19 的结果锚点。
- 明确「不弱化」证据：T11/T12 在修改后依然拒绝；T19 允许集不过宽；T10/T13 为新增语义。
- 真实运行 RR20 记录 + 证据目录（§6，含 attestation）。

---

## 6. 真实运行复现计划（RR20）

### 6.1 前置

1. B1+B2 合并到候选分支；B3 集成测试通过；`npm run typecheck` exit 0。
2. 独立验收对代码候选出具 B2 结论（含 T1–T19 抽取）。
3. **基线时效（S4）**：`git fetch origin`；以 `origin/main`（复核实测 `caabeea`）合并 #81 后的干净分支为运行候选；不得使用落后的本地 `main`（复核实测 `c1fb74a`）。
4. 明确本轮运行使用的工作区应为**包含修复的干净检出**（建议由协调方指定 worktree/分支）；若实现落在本 worktree，须先清理无关未跟踪文件并重取基线。

### 6.2 round8 干净副本（同根清理；如实披露）

- 源目标：`C:\Users\51054\Desktop\work\ans-snake-fullchain-run-2026-11-10\round8\target`（保留 RR8 init 产物、原 operation `83ca5888…`、8 份冻结文档与 11 个快照；**不新建 init、不换 repoId**）。
- 新运行根：`…\ans-snake-fullchain-run-2026-11-10\round20\`（`rr\` 驱动脚本、隔离 `userData\`、`evidence\`）。
- 清理步骤（与 RR19 同法，逐项留证）：
  1. 只读预态清单（逐文件 SHA-256；目标 <16 MiB）。
  2. `.ans/sessions` → `round20/evidence/pre/sessions-source/`（移动，不删除；前后逐文件 hash 一致；源目录消失）。
  3. `.ans/state/tasks.jsonl` 复制到 `round20/evidence/pre/source-ledger-tasks.jsonl` 后重置为空（0 B）；披露「账本重置为运行前 fixture 准备」。
  4. 保留并复核（逐字节）：`docs/` 全部（8/8 冻结文档）、`.ans/trunk/initialization-sources` 20、`operations/83ca5888…`、`snapshots`（10→11，含 RR19 的 `s-9fbf9c81…`）、`.ans/git-init-process.json`、`versions.jsonl`（21 行）、`doc-freezes.json`、`version-changes.json`、stable-write 状态、`.git/` 候选 ref。
  5. 清理后：文件数/总字节、账本 0 行、无 legacy moduleDirectory；原 target 只读快照 114/114 match。
  6. **RR19 遗留处置（G2）**：保留并披露 RR19 的 draft run `run-hub-7e1a641e…`、`init-source-be2b729c…` 与 `s-9fbf9c81…`；`onlyUnpinnedDrafts`（`stable-snapshot.ts:30-31`）接受全 draft 历史，不 pin/不删除；在 pre 清单中逐项记录，不静默清理。
- 环境：真实 Electron + 真实模型 + 真实 UI；隔离 `userData`；CDP **仅 9223**；9222 预检/后检 0 LISTENING；结束后 9223 释放、无 Electron 残留；模型名如实披露（上一轮为 `deepseek-v4-flash`，非 Anthropic）。

### 6.3 运行内容与任务文本（关键）

- 1 条客户消息（含 `run_shell` 禁令、变更/门工具 blocked/failed 即停、首果即停、不自动重试、不追加、严禁伪造）。
- product 的 bootstrap VCA 任务文本（明确修正 RR19 的教训与 M1）：
  - `kind:"version-upgrade"`、`flowId:"snake-game"`、`baseTrunk:null`、**新 operationId**（如 `op-snake-game-trunk-bootstrap-20261110-02`；不得复用 RR19 的 `…-01`，见 §3.4 快照不可变）；
  - targets = **当前版本**：proposal v2、architecture v2、roster v2、modules v1（**每 kind 恰一个**）；action 全 `add`；`expectedFromSha256` 全 `null`；
  - 说明「历史冻结文件由应用按 R9 账本自动纳入快照；不得手工列举历史版本为 targets，不得伪造历史 hash；同 kind 多版本单请求会被明确拒绝」；
  - 提交后按回执决定：成功 → 继续 stable-write（显式 approve）→ 初始 workflow → 团队计划（team-v2）→ run pin → 任命 D3 → 角色卡/激活 → 工作流 → 实现 → 出游戏或下一门；失败 → 立即停止并保留回执。
- 预期链（按序取证）：bootstrap VCA applied → effective trunk `t1`（manifest + `refs/ans/trunk`）→ 初始 workflow stable 发布 → 团队计划登记 → run pin → D3 任命 → 角色卡/激活 → 工作流 → 实现 → 游戏产物或下一门。
- 预期关键证据：VCA 回执 `ok:true status:"applied"`；t1 manifest/digest；快照 files = **8 个 frozen 文档（含 intent v1）+ `.ans/state/versions.jsonl` = 9 文件**；candidate/publication policy allowed（无 `git-policy-app-freeze-closure`、无 `git-policy-raw-write-scope`）；无 target absent。

### 6.4 预算 / 停止 / 披露

- 预算（沿用 RR19 授权口径）：客户消息 1（+1 仅合法客户决策）；客户面对卡 ≤4；应用层派发 ≤8；chief 回合 ≤8；convener ≤3；product/impl 各 ≤4；其它角色各 ≤3；**Git 能力调用 ≤8**；墙钟 ≤45 分钟；首果即停、不自动重试、不追加。
- 停止：变更/门工具（`submit_version_change`/`request_stable_write`/`complete_team_plan`/`git_candidate`/`git_publish`/`activate_role_documents`/`select_run_change`/`close_created_task`）blocked/failed 立即停止；`run_shell` 即停；只读 `git_query` blocked 记录不停止；9222/其它根零触碰。
- 披露：账本重置与会话剥离如实标注为 fixture 准备；模型名如实；任何偏差（预算、回环重投、退出码外观问题）逐项记录；**严禁伪造**；失败即停，不重试、不换 targets。

### 6.5 依据与绑定 / attestation（G2）

RR20 记录（体例同 RR14/RR19）必须包含绑定表并逐项可复算：

| 项 | 内容 |
|---|---|
| 前序 RR | RR19 记录 `a4a90ebe…`（182 行 / 23,923 B）；RR14 记录 `227589b0…`（按需） |
| 本方案 | P1.1 文件 hash（RR20 §1 实测，含行/字节/SHA-256）；P1.0 `1f6afc15…` 保留 |
| 复核 | R1.0 `4c01b07d…`；R1.1（窄复核）hash |
| 协调方授权 | 2026-11-10 书面授权（T3 确认 + RR20 范围/预算/禁令）原件或记录引用 |
| 运行前原件 | `prepare-report.json`、`target-clean-manifest.json`/`target-clean.sha256`、原 target 只读核对 114/114、pre 目标清单 |
| 证据 | `evidence/` 目录 manifest（逐文件 SHA-256）+ 本记录 |

- 同时披露：RR19 遗留 draft run/init-source/快照的保留处置（6.2-6）；无第 2 条客户消息；无伪造。

---

## 7. 风险 / 残余 / 披露

1. **不弱化冻结保护**：`frozen` 记录闭包强度不变（服务侧 + 门禁双重）；被排除的仅是不可恢复的草稿历史行；`allowed` 补齐只接纳 frozen 证明路径。独立验收须以 T11/T12/T19 钉住。
2. **未知/漂移/不可读 fail-closed**：坏行、未知 event、非法 freeze、异 flow 行、`-vN` 后缀版本不一致、文件缺失/不可读/哈希不符、同 path 冲突全部拒绝；错误消息含路径；不新增放行分支。
3. **快照大小/性能（G3 完整口径）**：随冻结版本数线性增长；受 Git 策略 128 文件上限（`classify-shell.ts:837`）、单文件 1 MiB / 整单 4 MiB（`:850`）、树条目 2048（`:854`）与 base64 放大（快照 JSON ≈1.33×）约束，对「文档原始总字节」的实际上限约 ≤1.5 MB；超限按既有 `git-policy-raw-byte-budget` fail-closed，本方案不提升预算；列为已知限制/后续独立议题。
4. **Git 媒体/trunk 发布**：候选树/发布仍走既有 `executeGitBusinessPublication` 与 CAS/策略；不新增 ref、不改 publication 流程；bootstrap 仍只成功一次（t1）。
5. **旧 operationId 的不可变冲突**：RR19 已落盘 `s-9fbf9c81…`（不同文件集合、同 ID 算法）。修复后必须用新 operationId；旧快照保留为证据，不删除、不覆盖（`snapshot-immutable-conflict` 属正确 fail-closed）。
6. **与 RR 链暂停的关系**：缺陷立案后 RR 链暂停。本方案是恢复输入：须完成 B1–B3 + 独立验收后才可 RR20；不在无修复情况下重跑、不伪造通过。
7. **多 flow 账本限制**：门禁 `git-policy-app-freeze-record` 要求每行 `flowId === pub.flowId`；服务侧同规则 fail-closed（T17），不静默过滤。含异 flow 行的项目仍不能 bootstrap（既有语义，本方案不扩围）。
8. **候选树写入范围（M2，修订）**：历史 frozen 文件写入候选树是 **RR20 的标准场景**（不再是「异常数据」）；由 B2 的 `allowed` 补齐放行。残余边界：未被 frozen 记录证明的额外 `snapshot-content` 仍被 `git-policy-raw-write-scope` 拒绝（T19）；若历史 frozen 文件确实不在 Git 基树（数据异常），它会被作为新增文件放行，但其字节必须等于冻结记录 sha（保护不降级），同时仍受 128 文件/4 MiB 预算约束。
9. **同 kind 多版本单请求（M1，范围外）**：bootstrap 明确拒绝（T2），不影响 RR20 的 4-target 受支持路径；若未来产品确需单请求声明历史多版本，须另立变更重新设计 `expectedFrom`/槽位计数语义（T3）。
10. **FS 媒体与旧调用**：非 Git 媒体行为正确但快照 digest 变化（内容更多），依赖硬编码 digest 的测试需更新（T8/T15）；fallback 仅对 FS 旧直连调用可达，不宣称 Git policy（G1）。
11. **T2/T3 与升档触发器**：见 §8；实施中若发现需要改 VCA/快照 schema、`versions.jsonl` 格式、角色/权限/边界、或需要**新增门禁允许集而非本方案限定的 frozen 证明集**，即停止并升档回报。
12. **不改角色/权限/闸门语义**：除本方案明确列出的 `classify-shell.ts` 两处（冻结闭包范围、frozen 证明路径允许集）与 `apply-journal.ts` 装配外，无其它门禁/角色变化。

---

## 8. T2 / T3 判型

- **默认口径**：T2（change）。
- **本方案判型：T3；协调方 2026-11-10 已确认。** 依据：
  1. 必须修改 `src/common/门禁引擎/classify-shell.ts` 的 Git 发布策略判定：`git-policy-app-freeze-closure` 的适用范围（M2 之后的允许集补齐也属同一治理语义）。项目现行规则把「发布、共享抽象、治理或权限变更」列为 T3（`角色卡/项目管理/docs/project-rules.md` 第 9 条）；复核 R1.0 §3.3 同判。
  2. 只做服务侧装配（T2 范围）**不能通过真实链路**：RR14/RR19 已证，§1.3 的草稿行问题与 M2 允许集问题会继续触发门禁；只做门禁（B2）会停在 `vca-target-invalid`（RR19）。B1+B2 必须同批次。
  3. `frozen` 保护语义本身不变（不是放宽），但「门禁要求什么才算冻结闭包」「候选树允许哪些历史文件」是治理语义的一部分，须 T3 评审留痕。
- **若协调方改判 T2**：需要书面写明「含门禁政策文件改动的 T2 例外」及理由（谓词收窄与允许集补齐不降低 frozen 保护）；否则按 T3 执行。
- **升档触发器（实施中停并回报）**：需要扩展 `version-change/v1`/`complete-snapshot/v1` schema；需要改 `versions.jsonl` 事件/格式；需要改角色/边界/权限/writeSet；需要**新增门禁允许集而非本方案限定的 frozen 证明集**；需要提升 Git raw-object 预算；需支持同 kind 多版本单请求；真实运行出现未预期门禁 code。

### 8.1 R1.0 复核处置表（M1/M2/G1–G4/S1–S7 落点）

| # | 处置 | 落点 |
|---|---|---|
| **M1** | **采纳 (a) 收缩承诺**：bootstrap 每 kind 至多一个当前版本 target；同 kind 多版本单请求明确拒绝（不 last-wins/不静默取最高）；历史冻结文件由账本自动装配；`expectedFrom`/槽位计数语义不改 | §0.2、§0.4、§1.2、§1.4 第 4 行、§2.1、§2.5、§3.1.1、§3.6、§5.1 T1/T2、§6.3、§7.9、§9 Q5/Q13 |
| **M2** | **采纳**：`classify-shell.ts` 同函数补「frozen 闭包证明的 `snapshot-content` 路径加入 `allowed`」；只加证明集，不放宽任意路径；以 T1/T11/T13/T19 钉住；B2 取证 | §0.1、§0.2、§1.3、§1.5、§2.4、§3.2、§3.3、§5.1 T1/T19、§7.8、§8 升档触发器 |
| **G1** | T15 改为 **FS 媒体**回归；删除「Git store 下 policy 通过」断言；说明 fallback 只对 FS 旧直连可达，Git 发布路径恒有 `preparedSnapshotRef`；Git policy 由 T1/T14 覆盖 | §3.1.3、§3.6、§5.1 T15、§7.10、§9 Q12 |
| **G2** | 新增 §6.5 attestation：绑定 RR19 `a4a90ebe…`、方案 P1.1、复核 R1.0/R1.1、协调方授权、`prepare-report`/`target-clean-manifest`、原 target 114/114、证据 manifest；披露 RR19 遗留 draft run/init-source/快照保留 | §6.2-6、§6.5、§5.3 |
| **G3** | 补全规模口径：128 文件（`:837`）、树条目 2048（`:854`）、单文件 1 MiB / 整单 4 MiB（`:850`）、base64 放大 ≈1.33× ⇒ 文档原始总字节约 ≤1.5 MB；不提升预算 | §3.4、§7.3、§9 Q10 |
| **G4** | 新增 T17（多 flow 账本负例）、T18（`-vN` 后缀版本 ≠ record.version）；服务侧同规则 fail-closed；门禁保持 `:728` 原样 | §3.1.2、§5.1 T17/T18、§7.2、§7.7、§9 Q3/Q7 |
| **S1** | 引用更正：防御性校验对应 **Q7**（非 Q9） | §3.1.2、§9 Q7 |
| **S2** | 预期证据计数更正为「8 个 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件」 | §6.3 |
| **S3** | 补强「为何不用每 path 最后一条记录」：冻结终态（`versioned-doc-guard.ts:1601-1606`）⇒ 已冻结路径末条必为 frozen；未冻结路径末条为 draft-updated，字节未必可入快照 | §2.4、§3.3、§9 Q2 |
| **S4** | 合并顺序补 `git fetch origin`：`origin/main`=`caabeea`、本地 `main`=`c1fb74a` 落后；实施从 `origin/main`+#81 干净分支起步 | §4.2、§6.1、§9 Q8 |
| **S5** | 明确规划/缺陷/复核三份未跟踪记录的提交归属：由策划/协调方随实施 PR（或 docs-only 提交）一并提交并写入 B2/D1 记录 | §4.1 记录归属 |
| **S6** | B3 优先新增独立测试文件；若改 683 行共享 fixture，只做加法导出并列出依赖套件回归面 | §4.1 B3、§5.2 |
| **S7** | 区分 VCA 作者写区（`targetPathInAuthorArea`）与 Git 门禁 `gitRolePath`（product 仅 `docs/product/`），M2 成因与措辞统一 | §3.1.5、§7.8 |

---

## 9. Q 清单（需协调方/复核确认）

| Q | 问题 | 建议 |
|---|---|---|
| Q1 | 判型：T3（含门禁两处改动）是否接受？ | **已确认 T3（协调方 2026-11-10）** |
| Q2 | 闭包谓词口径：仅 `event:"frozen"` vs 「每 path 取最后一条记录」？ | 仅 `frozen`（冻结终态 ⇒ 已冻结路径末条必为 frozen；未冻结路径末条为 draft-updated，字节未必在 targets/槽位中，仍可能不可满足）——S3 |
| Q3 | 服务侧是否只纳入 `flowId === 当前 flow` 的 frozen 行？ | 是；异 flow 行**逐行 fail-closed**（不静默过滤），与门禁 `:726` 同规则；T17 负例 |
| Q4 | RR20 任务文本是否采用「只提交当前版本 targets（每 kind 恰一个）、应用自动补历史」？ | 是；这是 M1 修订后的受支持路径，也验证装配自动闭合 |
| Q5 | bootstrap 同 kind 多版本单请求如何处置？ | **明确拒绝**（不 last-wins、不取最高版本）；「快照可携带历史版本」与「单请求 target 列表可含多版本」是两个独立问题，后者不支持；T2 负例 |
| Q6 | 是否保持外部错误码集合不变（只改消息）？ | 是；不新增公共 code，便于旧调用与 RR 判断（`vca-target-invalid` 等） |
| Q7 | 历史 frozen 路径为实际 `-vN.md` 时，是否额外校验后缀版本 === 记录 version？ | 服务侧防御性校验（fail-closed）；门禁保持 `:728` 原样使用路径；T18 钉住差异（S1 引用更正） |
| Q8 | 合并顺序：#81 先合并后 rebase，或 stacked PR？ | 优先 #81 先合并；受阻则 stacked PR base=`feat/document-format-specifications`，合并后 retarget；实施前 `git fetch origin` 并以 `origin/main`（`caabeea`）+#81 为基线（S4） |
| Q9 | RR20 是否使用新 operationId，并披露 RR19 残留快照 `s-9fbf9c81…` 为证据？ | 是；同 ID 会 `snapshot-immutable-conflict`；残留 draft run/init-source/快照按 §6.2-6 保留披露 |
| Q10 | 大型历史 bootstrap 的规模限制是否接受为已知限制？ | 接受；完整口径：128 文件 / 单文件 1 MiB / 整单 4 MiB / 树条目 2048 / base64 ≈1.33× ⇒ 文档原始总字节约 ≤1.5 MB；超限按既有 `git-policy-raw-byte-budget` fail-closed，不提升预算（G3） |
| Q11 | B1/B2 是否同 PR？拆分时的批次/合并约束？ | 同 PR；若拆，必须同批次合并后运行 RR20 |
| Q12 | `executeDirectInternal` fallback 捕获是否同步接线（旧直连调用）？ | 是（共用 helper）；但仅在 FS 媒体旧直连调用可达，T15 按 FS 回归、不宣称 Git policy（G1） |
| Q13 | 同 kind 多版本单请求的明确拒绝是否只限 bootstrap？ | 建议只限 bootstrap（非 bootstrap 仍由既有 `:713-714` 拒绝，行为/消息不变）；如需统一，另列并在 B1 记录说明 |
| Q14 | 规划/缺陷/复核三份未跟踪记录是否随实施 PR 提交？ | 是；由策划/协调方随实施 PR（或 docs-only 提交）一并提交，路径/哈希写入 B2/D1 记录（S5） |

---

## 10. 状态与下一步

- 本文件：**方案 P1.1，未实施**。等待 R1.1 窄复核与协调方对 §9 的确认。
- 下一步（未获授权前不执行）：R1.1 窄复核 → B1/B2 实施 → B3 集成 → 独立验收 → RR20 → 报告。
- 不实施、不运行测试/真实模型、不改代码/测试/角色卡/边界/其它文档；不提交/推送/合并/发布。

**（完）**
