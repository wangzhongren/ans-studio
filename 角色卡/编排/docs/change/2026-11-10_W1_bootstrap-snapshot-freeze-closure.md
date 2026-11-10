# W1：bootstrap 快照/冻结闭包冲突修复（服务侧装配）实施记录

- 日期：2026-11-10；角色：ans-studio 固定 worker「编排」（roleId: 编排）；独立上下文。
- 变更：T3「bootstrap 快照单槽位与冻结闭包要求互相矛盾」**W1 服务侧批**（方案 P1.1 §3.1；B1 v1 的 AC-1/AC-3/AC-6/AC-8/AC-9 与 T1–T9/T14–T18 服务侧条目）。
- 依据（写盘前实测）：
  - 方案 **P1.1**：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`，477 行 / 68,367 bytes / SHA-256 `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`。
  - 独立复核 **R1.1**（含 R1.0）：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，263 行 / 43,407 bytes / `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`（R1.0 `4c01b07d…`；R1.1 结论：M1/M2/G1–G4/S1–S7 全部闭合、0 must-fix）。
  - 实施前验收标准 **B1 v1**：`docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`，256 行 / 49,013 bytes / `9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b`。
  - 缺陷记录：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`，36 行 / 2,733 bytes / `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`。
  - RR19：`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`，182 行 / 23,923 bytes / `a4a90ebed25102ba2bd9b3be3d3863a6980c5fc5064ce6cbc06d3665267f8820`（证据 `versions-final.jsonl` 实测为 canonical 账本路径 + 8 条 frozen + 5 条草稿历史行）。
- 基线（开始时实测）：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`；HEAD `0ab25843a9b2e3e187c47a1c14ef51da187414b9`（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）；`git status --porcelain -- src app test` = **0**（干净）；Node **v24.22.1**。
- 状态：**W1 已实施；定向新增测试 14/14 pass；全量 `test/编排/**` before 1164/1140/22/2 → after 1178/1154/22/2，失败集合逐条相同、skip 相同；`npm run typecheck` exit 0；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。**

## 0. 与其它批次的关系（并发如实记录）

- 本批期间 **W2（门禁引擎）在同一 worktree 并行在飞**：证据时点 `git status` 实测 `src/common/门禁引擎/classify-shell.ts`（M）与 `test/门禁引擎/freeze-closure.test.ts`（新）出现在工作树（文件 mtime 2026-11-10 04:25），内容为本方案 §3.2 的冻结闭包范围 + frozen 证明允许集改动。与本批写集**零重叠**；本批**未写**该两文件（门禁引擎 owner 为 W2），也未读取其作为本批证据。
- 本批**未改** `test/测试/git-write-chain-fixture.ts`（W5 测试 owner）、`src/common/门禁引擎/**`、`src/model/**`、schema/数据模型、角色卡/边界、其它文档。
- 证据边界：`test/编排/**` 的 before 跑在干净基线（W2 改动出现前）完成；after 跑在 W2 并发改动已在盘的状态下进行。因 `test/编排/` 无任何断言 `git-policy-app-freeze-closure`/`git-policy-raw-write-scope` 的用例（`grep` 实测），且 after 失败集合与 before 逐条相同，W2 并发改动未污染本批判定；W2 自身的分类/证据不属于本记录。

## 1. 写集与候选（严格按角色 Section 1）

| 文件 | 状态 | 行 / 字节 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/service/trunk/impl/apply-journal.ts` | 修改（M） | 4,030 / 399,307 | `d0a3fdf27bcdada86258406d73e7ff630543f3f9c5b0585f14b9ef4629430cd4` | +95 / −13 |
| `test/编排/bootstrap-frozen-closure.test.ts` | 新增（??） | 431 / 31,218 | `3228020b35b6bb4eeb031e95f5fa5a09a9152bc525ce3a5ff8da15ebb622ca1f` | +431 |
| `角色卡/编排/docs/change/2026-11-10_W1_bootstrap-snapshot-freeze-closure.md` | 新增（本记录） | 写盘后实测（随回报） | 写盘后实测（随回报） | 新增 |

- **实现候选聚合**（按路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256；两文件 `apply-journal.ts` + `bootstrap-frozen-closure.test.ts`）：`b60b66d830810645dbd0410f97aaf29fa386a6389187203338011fe1010f5024`。
- 写集外 `src app test`：本批新增/修改仅上表 2 个代码/测试文件；W2 并发文件（§0）非本批写入。未删除/重命名、未新增依赖、未改构建/发布配置。

## 2. 实现要点（P1.1 §3.1；B1 AC-1/3/6/8/9）

### 2.1 快照装配（AC-1；§3.1.2/§3.1.3）

- `apply-journal.ts` 新增模块私有纯装配 helper `bootstrapClosureFiles(readProjectFile, { flowId, direct, extras, baseline })`（位于 `directRefs`/`targetSlots` 之后，不 import 门禁引擎私有模块）：
  - 输入：当前槽位 `directRefs(target)`、修正案 + 已确认意图 extras、`readProjectFile` 读到的 `.ans/state/versions.jsonl` 原始字节与 sha256。
  - 闭合集合 = `directRefs(target)` × 全部 `event:"frozen"` 记录解析文件 × 已确认意图 × `.ans/state/versions.jsonl`；按 path 字典序排序，同 path（大小写不敏感，与 `captureSnapshot` 同口径）去重且必须同 sha。
  - 冻结行路径解析与门禁同一规则：`/-v\d+\.md$/.test(path) ? path : `${path}-v${version}.md``；服务侧防御性要求 `docVersionOfPath(file) === record.version`（Q7/T18）。
  - 每个冻结文件经 `readProjectFile` 复核：存在、可读、`sha256 === record.sha256`（大小写不敏感比较），**记录 sha 必须等于磁盘实际字节**。
  - 账本最小形状：`v===1`、`flowId` 为字符串且 === 当前 flow、`path` 非空字符串、`version` 正整数、`sha256` 64 hex、`event ∈ {baseline,version-added,frozen,draft-updated,draft-marker}`；`event==="frozen"` 追加 `isValidDocFreezeRecord(record.freeze)`。
  - 快照 ID `s-${directHash([flowId, operationId])}` 与 digest `completeSnapshotDigest` 算法不变；未改 `expectedFrom`/槽位计数语义。
- **两处捕获共用同一 helper**：
  - `prepareDirectSubmission`：bootstrap（`current === undefined`）以 `bootstrapFiles` 捕获；非 bootstrap 仍为 `[...directRefs(target), ...extra]`（逐字不变）。
  - `executeDirectInternal` fallback（无 `preparedSnapshotRef` 的旧/直连调用）：仅 bootstrap 调用 helper；带 `preparedSnapshotRef` 的 Git 发布路径不重新装配。
- 非 bootstrap、team-plan 快照（仍仅 `directRefs(target)`）、意图确认快照、激活/initial-workflow 路径未改。

### 2.2 M1：bootstrap 每 kind 至多一个当前版本 target（AC-3；§3.1.1）

- `prepareDirectSubmission` 的 target 循环内按 slot（`doc:<kind>` / `execution:<kind>`）跟踪；bootstrap（`!current`）同 slot 第二次出现即明确拒绝：
  `Bootstrap accepts at most one target per document slot; historical versions are assembled from R9 and must not be declared as targets: <slot> (<path>)`
- 返回 `trunk-item-invalid`（全链 `version-change-runtime.ts` 既有映射为 `vca-target-invalid`）；**不 last-wins、不静默取最高**；历史 v1 不作为 targets，仅由账本自动装配。
- 非 bootstrap 重复 target 仍由既有 `executeDirectInternal` 的 `expectedFrom`/槽位计数拒绝（行为/消息不变，Q13）；当前版本由角色声明，服务侧不推断版本高低（N3）。

### 2.3 fail-closed 语义与消息（AC-6/AC-9；§3.1.4）

| 场景 | 消息（含路径/行号；code 仍为既有集合） |
| --- | --- |
| 同 kind 多版本单请求 | `Bootstrap accepts at most one target per document slot; historical versions are assembled from R9 and must not be declared as targets: <slot> (<path>)` |
| 账本坏行/未知 event/非法 freeze 形状 | `Frozen closure record is unreadable/invalid: line <n>` |
| 异 flow 行 | `Frozen closure record belongs to another flow: <flowId> (line <n>)` |
| 冻结文件缺失/不可读 | `Frozen closure file is missing/unreadable: <path>` |
| 记录 sha ≠ 磁盘字节 | `Frozen closure hash drift: <path>` |
| 同 path 多来源 sha 冲突（含大小写路径冲突） | `Frozen closure path conflict: <path>` |
| `-vN` 后缀版本 ≠ record.version | `Frozen closure record version differs from its path: <path>` |

- 不吞行、不跳过、不静默过滤多 flow、不从猜测来源补 hash；`captureSnapshot` 的 `snapshot-hash-drift:<path>`/`snapshot-ref-conflict`/`snapshot-immutable-conflict` 原样保留。
- 失败均发生在 journal/manifest/冻结追加之前（T3/T6/T7/T17/T18 与 T15 负例断言无 manifest/snapshot/journal/freeze 副作用）；prepare 阶段成功仅捕获快照（既有行为），不写 manifest。

### 2.4 不变项（AC-7）

- 非 bootstrap VCA（tN→tN+1）、detail-amendment、team-plan、激活、initial-workflow 行为/字节不变；`prepareDirect` 的「target 必须在快照内」检查保留。
- 外部错误码集合不变（`trunk-item-invalid` → `vca-target-invalid` 等既有 code；`executeDirect` 中途失败沿用 `vca-target-invalid`/`vca-hash-drift` 等既有 code，无新增公共 code）。
- 未改 schema/数据模型/marker/ref/发布流程/`versions.jsonl` 格式/预算；旧快照仍可读（digest 对 path 排序不敏感，旧快照 `isStoredCompleteSnapshot` 仍成立）。
- `test/测试/git-write-chain-fixture.ts`、`classify-shell.ts` 本批未写。

## 3. 测试与证据

### 3.1 全量 `test/编排/**` before/after（同命令、同 Node、同一机器）

命令：`node --test --test-concurrency=1 --test-reporter=tap "test/编排/**/*.test.ts"`；Node v24.22.1。

| 跑次 | 时点/候选 | tests | pass | fail | skip | duration | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before | 干净基线（W2 改动出现前；`src app test` = 0） | 1164 | 1140 | 22 | 2 | 220,278 ms | `7a89701674705e7c8ccb9a9bf7f8caa1f13dbcad2ea5350ce791925464a1de6e` |
| after | 本批候选 + W2 并发改动（§0） | 1178 | 1154 | 22 | 2 | 221,016 ms | `19fe7ce9b7c60f05c590e4aa8788854419a34b89297f66368b69dcd756b97bb3` |

- **新增确定性失败 = 0**：after 的 22 条失败与 before **逐条同名**（`diff` 空；失败集合含既有 22 条：A5/D-1/BUG-3/AC-5×5/卡片文本×3/其它既有红）。
- **新 skip = 0**：skip 仍为同两条 `Delivered Hub/legacy code provenance … # SKIP`（环境变量门控的既有 skip）。
- 测试数 1164 → 1178（= +14 本批新增文件用例），pass 1140 → 1154（+14），fail/skip 不变。

### 3.2 新增服务侧测试（`test/编排/bootstrap-frozen-closure.test.ts`，14 项）

独立跑：`node --test --test-concurrency=1 --test-reporter=tap "test/编排/bootstrap-frozen-closure.test.ts"` → **14 tests / 14 pass / 0 fail / 0 skip**（833,545 ms/日志 `98bc0730…`）；最终候选隔离复跑一次仍 **14/14 pass**（871,183 ms/日志 `13fff84f…`）。定稿前的迭代版本曾单独跑过 13/13 pass（日志 `42ccba1b…`）；更早中间版本的失败均为本批**新文件自身 fixture 迭代**（账本路径/计数/T18 记录形状），定稿前已修正，不属于候选证据。

| 本文件用例 | B1/方案锚点 | 断言要点 |
| --- | --- | --- |
| T1 bootstrap closure: 4 current-version targets + 8 frozen | T1、AC-1 | 快照恰 9 文件（8 frozen 含 intent v1 + versions.jsonl）、按 path 排序、每文件 sha = 磁盘字节、targets 全在；`vca.prepareDirect` 接受（RR19 拒绝点消失） |
| T2 same-kind multi-version rejected | T2、AC-3、M1 | service 直呼 `trunk-item-invalid`（全链映射 `vca-target-invalid`），消息含 slot/路径/「assembled from R9」；无快照/manifest 副作用 |
| T3 missing / drift / unreadable | T3/T4/T5、AC-6 | 三种 fail-closed；消息含具体路径；无 manifest/snapshot |
| T6 ledger negatives | T6、AC-6 | 坏行/未知 event/非法 freeze 形状经服务侧解析拒绝（消息含行号）；真实注册表下坏账本同样整体 fail-closed |
| T7 same-path conflict | T7、AC-6 | 意图证据 sha 与 frozen 记录 sha 冲突 ⇒ `Frozen closure path conflict: docs/product/demo-intent-v1.md`；无副作用 |
| T8 no-history regression | T8 | 无历史时快照 = versions + intent + 单 target（与原实现内容一致） |
| T9 non-bootstrap prepare | T9、AC-7 | t1→t2 准备快照仅含新 target（不调用闭合收集） |
| T13 scale | AC-5（规模） | 40 frozen assets + intent + target + versions = 43 文件、path 排序、两次同集合 digest 相同 |
| T14 legacy non-bootstrap executeDirect | T14/T15 邻近、AC-7 | 无 `preparedSnapshotRef` 的 t2 旧调用快照保持旧捕获集合（仅新 target） |
| T15 FS fallback positive | T15、AC-1/AC-7 | bootstrap `executeDirect`（fallback 捕获）装配全部 frozen 文件并 applied；真实 `role-direct-applied` 冻结追加；不宣称 Git policy |
| T15 negative | AC-9 | fallback 闭合漂移 ⇒ `rejected` + 明确消息；无 manifest/journal/新增冻结 |
| T16 replay | T16、AC-8 | 同 operationId 重放同 snapshotId/digest/files；不同文件集合同 ID ⇒ `snapshot-immutable-conflict` fail-closed |
| T17 foreign flow | T17、AC-6 | 异 flow 行逐行拒绝（消息含 flowId），不静默过滤 |
| T18 suffix mismatch | T18、AC-6 | `record.path` 已是 `-v2.md` 而 version=1 ⇒ 服务侧防御性拒绝（消息含路径） |

### 3.3 受影响跨角色套件（只读运行，非本批写集）

- `test/测试/version-change-integration.test.ts` + `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`：13 tests / 4 pass / **9 fail** / 0 skip（日志 `a89b14b8…`）。
  - 9 条失败全部为**既有 B0 红**：`version-change-integration.test.ts` 的 VCA/product、detail-amendment、客户拒绝、发起角色、toSha256 重验、AC-5×2、bootstrap VCA、冻结 missing 共 9 条，错误均为既有 P3.1 产品决策「former customer approval channel is closed」（`version-change-runtime.ts:767`，早于本批改动路径），与本批无因果；失败名单与既往验证记录（`2026-11-07_E2-XR1/XR2` 的 B0 9 红）逐条一致。
  - `2026-11-09_judge-delegated-effectiveness.test.ts`：1/1 pass。
- 门禁套件（`test/门禁引擎/**`）属 W2/B2 批次证据，本批不运行、不主张。

### 3.4 typecheck

- `npm run typecheck`（`tsc --noEmit`）**exit 0**；日志 `typecheck-final.txt`，43 bytes / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`。

### 3.5 旧/新断言

- **未改写/删除任何既有断言**；既有测试文件零修改。新增断言全部位于新文件 `test/编排/bootstrap-frozen-closure.test.ts`（上表 14 项）。
- 证据日志（仓库外临时目录 `C:\Users\51054\AppData\Local\Temp\ans-w1-evidence\`，只读引用）：`before-bianpai.tap`（`7a897016…`）、`after-bianpai-final.tap`（`19fe7ce9…`）、`new-tests-4.tap`（`98bc0730…`）、`affected-ceshi.tap`（`a89b14b8…`）、`typecheck-final.txt`（`22d52cc9…`）、失败集合 `before-fails.txt`/`after-fails.txt`（diff 为空）。

## 4. 候选身份与稳定性

- 证据运行前后：HEAD 仍 `0ab2584…`（tree `d6c2158d…`）、分支不变、无新提交/暂存；本批两文件 raw SHA-256 见 §1，聚合 `b60b66d8…`。
- `git status --porcelain -- src app test`（证据时点）：本批 2 文件（上表）+ W2 并发 2 文件（§0，非本批写入；零重叠）。
- 未跟踪/修改的 `docs/communication/memo.md`、`.tmp-*`、`.commit-msg-*`、`.pr-body-*`、未跟踪 docs 均为工作树既有历史产物，不属本批写集，未触碰。

## 5. 限制 / 披露（如实）

1. **批次边界**：本批只落 W1 服务侧（P1.1 §3.1）。B2 门禁两处（冻结闭包仅 `event:"frozen"` + frozen 证明允许集）与 B3 跨角色集成（真实 Git 对象 + `executeGitBusinessPublication` candidate/publication `allowed:true`）**不在本批**；本记录不宣称 T1 的 Git policy 通过，也不宣称真实链路可通。T1 在本批只验证到 `prepareDirectSubmission` 九文件装配 + `vca.prepareDirect` 接受（RR19 的 `vca-target-invalid / Target bytes absent` 拒绝点）。
2. **测试注入面**：T6/T7/T18 的服务层解析负例使用注入注册表（`refreshSnapshot`/`listFreezes` 打桩）以绕过 C2b 更早的整体 `baseline-corrupt` 拒绝，从而钉住服务侧具体消息与防御校验；同一坏账本在真实注册表下的端到端 fail-closed 另有断言（T6 末段）。这不改变生产路径：真实路径两层任一拒绝即 fail-closed。
3. **N5 残余**：服务侧最小形状未要求非 frozen 行 `freeze === undefined`；该类行在 C2b 解析（baseline-corrupt）与门禁 `git-policy-app-freeze-source` 仍被拒绝，整体 fail-closed（P1.1 §3.1.2 口径保留）。
4. **规模**：闭合集合随 frozen 版本数线性增长；本批未提升 Git raw-object 预算（既有 128 文件 / 单文件 1 MiB / 整单 4 MiB / 树条目 2048；快照 JSON base64 ≈1.33× ⇒ 文档原始总字节约 ≤1.5 MB，超限按既有 `git-policy-raw-byte-budget` fail-closed）。T13 以 43 文件样例钉住排序/去重/确定性，不代表预算放宽。
5. **重放/不可变**：同 operationId 不同文件集合 ⇒ `snapshot-immutable-conflict`（正确 fail-closed）；RR20 必须使用新 operationId（RR19 的 `s-9fbf9c81…` 保留为证据）。
6. **并发**：W2 的 `classify-shell.ts`/`test/门禁引擎/freeze-closure.test.ts` 在本批证据时点同时存在于工作树（§0）；本批失败集合 diff 为空，未发现污染；W2 证据由其自身记录。
7. **未运行**：真实模型/Electron/9222/9223；未跑 RR20；未提交/推送/合并/发布；本记录与代码候选均未验收。
8. **记录自身**：本文件行数/字节/SHA-256 无法内嵌，写盘后实测并随回报提交。

**（完）**
