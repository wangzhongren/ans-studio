# W2：bootstrap 快照/冻结闭包冲突修复 —— 门禁引擎批次实施记录

- 日期：2026-11-10；角色：ans-studio 固定 worker「门禁引擎」（roleId: 门禁引擎）。
- 变更：T3「bootstrap 快照单槽位与冻结闭包矛盾」W2 门禁批（B2）：(i) `git-policy-app-freeze-closure` 仅对 `versions.jsonl` 中 `event:"frozen"` 行要求快照同 path 同 sha；(ii) 把「经 frozen 闭包证明（`primary.files` 同 path 同 sha）且元数据行 kind=`snapshot-content`」的路径加入 `allowed`（M2）。
- 方案依据（P1.1）：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`，477 行 / 68,367 bytes / SHA-256 `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`；重点 §2.4/§3.2/§3.3、§5.1 T1/T11/T13/T14/T19。
- 复核依据：R1.1（`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，263 行 / 43,407 bytes / `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`）§6（M2 闭合/N2）；R1.0（`4c01b07d…`）只读。
- B1 v1：`docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`；本批对应 AC-2/AC-4/AC-5/AC-8/AC-9/AC-12 的门禁侧证据与 T1（门禁半段）/T10–T14/T17/T18/T19。
- 缺陷记录：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`（36 行 / 2,733 bytes / `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`）；RR19：`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`（`a4a90ebe…`）。
- 工作目录：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`；基线 HEAD `0ab25843a9b2e3e187c47a1c14ef51da187414b9`（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）；开工时 `git status --porcelain -- src app test` = 空。Node **v24.22.1**。
- 状态：**W2 已实施；定向 46/46 通过、全量门禁套件 479/473/5/1（前后失败集合 IDENTICAL、新增确定性失败 0、新 skip 0）、`npm run typecheck` exit 0；未提交/推送/合并/发布；未验收；未运行真实模型/Electron；未占用 9222/9223。**

## 1. 范围（W2：门禁引擎批次）

| 文件 | 改动 | 方案/B1 条目 |
| --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts`（M，+16/−3） | ① 冻结闭包谓词精确到 `event:"frozen"`（`appMetadataPaths`，`:724-740`）；② 收集 frozen 证明路径（`:696`、`:736`）并在表循环后仅对 `snapshot-content` 行加入 `allowed`（`:747-751`，M2） | P1.1 §3.2.1/§3.2.2、AC-2/AC-4、T10–T13/T19 |
| `test/门禁引擎/freeze-closure.test.ts`（新，212 行 / 19,973 bytes） | 6 个用例 / 7 tests：8 frozen + 5 草稿行 9 文件快照正例（sha1/sha256）；缺 frozen/漂移/无证明拒；未知·非法 event/freeze、坏记录、多 flow、同 path 冲突拒；M2 负例/正例/executable 负例；`:728` 后缀行为；普通候选回归 | T1（门禁半段）/T10–T14/T17/T18/T19 |
| 本记录 + `…_evidence/`（本目录） | 实施记录与证据 | BASE-4 |

**未改**（按任务写集与角色边界 `角色卡/门禁引擎/boundary.md` §1）：`src/model/**`、`src/service/**`（含 `src/service/trunk/impl/apply-journal.ts`——W1 编排 owner）、`src/provider/**`、`app/**`、其它测试/角色/文档；`test/门禁引擎/git-shell-acl.test.ts` **零编辑**（前后 SHA-256 均为 `7652d171c3c5e1fc32d85fbf3d9c5bc0c6a8cbd224d7c581a62d17fdbc19a6e4`）；`test/测试/git-write-chain-fixture.ts`（W5）未触碰。错误码集合、raw-object 预算（128 文件 / 单文件 1 MiB / 整单 4 MiB / 树条目 2048）、schema/数据模型/versions 格式均未改。

## 2. 实现要点（`classify-shell.ts`，`appMetadataPaths`）

### 2.1 冻结闭包谓词（`:724-740`）

旧（HEAD）：对 `versions.jsonl` 的**每一行**解析文件路径并要求 `primary.files` 同 path 同 sha；随后才校验 event 来源——`draft-updated` 等草稿历史行的旧 sha 是原位改写的中间态，磁盘/快照均不存在，带写历史的项目首次 bootstrap 必然不可满足。

新（候选）：

```ts
const frozen = record.event === "frozen";
const file = /-v\d+\.md$/.test(record.path) ? record.path : `${record.path}-v${record.version}.md`;
if (frozen) {
  policyRequire(primary.files.some(item => item.path === file && item.sha256 === record.sha256), "git-policy-app-freeze-closure");
  frozenClosurePaths.add(file);
}
policyRequire(frozen ? isValidDocFreezeRecord(record.freeze)
  : ["baseline", "version-added", "draft-updated", "draft-marker"].includes(String(record.event)) && record.freeze === undefined, "git-policy-app-freeze-source");
```

- **frozen 强度不变**：`event:"frozen"` 行仍要求 `primary.files` 同 path 同 sha；缺失/漂移/同 path 两条记录 sha 冲突均以 `git-policy-app-freeze-closure` 拒绝（`-source` 校验顺序对 frozen 行保持原先后关系）。
- **非 frozen（`baseline`/`version-added`/`draft-updated`/`draft-marker`）**：保留 `:726-727` 形状/归属校验与 `:730-731` 的 `freeze` 存在性规则，不再要求快照携带历史旧 sha（T13）。
- **未知/非法 event** 仍由 `git-policy-app-freeze-source` 拒绝；缺 `freeze`/非法 `freeze`/非 frozen 行携带 `freeze` 同样拒绝；坏行/坏 JSON fail-closed（不跳过）。
- **异 flow 行**：`:726` 的逐行 `record.flowId === pub.flowId` 原样保留，逐行拒绝、不静默过滤（T17）。
- **`-vN` 后缀版本一致性**：门禁保持 `:728` 原样使用路径（不做后缀版本 === record.version 校验）；该防御性校验在服务侧装配（W1，Q7/T18），差异由用例钉住。
- 未新增/删除任何 error code；`isValidDocFreezeRecord` 仍是 Model 单实例 type-import。

### 2.2 M2 允许集补齐（`:696`、`:747-751`）

```ts
const artifactPaths = new Set<string>(), frozenClosurePaths = new Set<string>();
…
for (const file of frozenClosurePaths) if (table.get(file)?.kind === "snapshot-content") allowed.add(file);
```

- 只收集「`event:"frozen"` 且已通过 `primary.files` 同 path 同 sha 证明」的解析路径；仅当元数据表行 kind=`snapshot-content`（非 `.ans/` 应用文件）时加入 `allowed`。
- 效果：`rawObjectPolicyError` 的 diff 写入范围检查（`:891`：`(exceptions.has(file) && after.get(file)?.mode === "100644") || gitRolePath(f, file)`）接纳历史 frozen 文档（`docs/proposals/`、`docs/contracts/`；product 的 `gitRolePath` 只覆盖 `docs/product/`）；candidate 与 publication 两个 verdict 走同一函数、同一 PR 同时修复。
- **不放宽任意路径**：未被 frozen 记录证明的额外 `snapshot-content` 仍按 `gitRolePath / git-policy-raw-write-scope` 拒绝（T19 负例；N2 选 `docs/proposals/…`）；allow 仅在候选 mode 100644 时生效（executable 负例）；`gitRolePath`、`complete-snapshot`/`frozen-application-evidence`/teamPlan/activation/initial-workflow 分支逐字未改。

### 2.3 未改项（逐字）

- 非 bootstrap/团队计划快照（仅 `directRefs(target)`，不含 `versions.jsonl`）/激活/initial-workflow 路径不进入本改动语义：`appMetadataPaths` 前两个 early-return 分支与其余 policy code 未改。
- 失败无副作用、审计不伪造：本批是纯判定函数改动，无 I/O、无状态写入；fixture 不冒充生产批准/任务/运行记录，不发布 ref。

## 3. 测试与运行记录

命令在 worktree 根执行；Node v24.22.1；TAP 日志均在证据目录并逐文件 SHA-256 在 §6。

### 3.1 新增用例（`test/门禁引擎/freeze-closure.test.ts`，6 个用例 / 7 tests；第 1 条按 sha1/sha256 各一）

| # | 用例 | 覆盖 | 结果 |
| --- | --- | --- | --- |
| 1 | sha1/sha256 各一：快照 = 8 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件；5 条草稿旧 sha 不在快照内；candidate + publication 均 allowed | T10/T13、T1 门禁半段 | pass ×2 |
| 2 | 缺 frozen 文件 → `git-policy-app-freeze-closure`；frozen sha 漂移 → 同 code；只有草稿行（无 frozen 证明）→ 历史文件重新落回 `git-policy-raw-write-scope` | T11/T19 | pass |
| 3 | 未知 event / 缺 freeze / 非法 freeze / 非 frozen 行带 freeze → `-source`；version 0 → `-record`；异 flow 行 → `-record`；同 path 两 frozen sha 冲突 → `-closure`；坏 JSON 行 allowed=false | T12/T17 | pass |
| 4 | 额外未证明 `docs/proposals/unit-proposal-v9.md` → `git-policy-raw-write-scope`；追加对应 frozen 记录后 candidate+publication 均 allowed；frozen 证明路径以 100755 写入仍 `raw-write-scope` | T19/N2 | pass |
| 5 | `record.path` 已是 `-vN.md` 且后缀 ≠ record.version：门禁按 `:728` 原样使用路径、allowed（服务侧防御，Q7/T18）；canonical 路径解析到不存在的 `-v3` 仍 `-closure` | T18 | pass |
| 6 | 同一 fixture 去掉 businessPublication（普通候选）→ `git-policy-raw-write-scope`（frozen 证明集不越出 direct-document-publication 分支） | 回归/不变项 | pass |

**敏感性（旧/新断言）**：同一新测试文件对 HEAD 源码运行 = 1 pass / **6 fail**（恰为 6 条钉住新语义的用例；第 6 条普通候选回归在旧/新代码下均 pass）——证明用例真实区分新旧行为，而非恒真。日志：`freeze-closure-against-head.tap.txt`。

### 3.2 全量门禁引擎套件（`test/门禁引擎/*.test.ts`）

| | tests | pass | fail | cancelled | skipped | todo | exit | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 前（HEAD 源码，干净基线） | 472 | 466 | 5 | 0 | 1 | 0 | 1 | `8d081a13…` |
| 后（W2 候选） | 479 | 473 | 5 | 0 | 1 | 0 | 1 | `8dda06fb…` |

- 增量恰为新增 7 个用例，全部通过；**新增确定性失败 = 0，新 skip = 0**。
- 5 条失败为**预存红项**，前后标题集合 **diff IDENTICAL**（`failure-set-diff.txt` 为空，SHA-256 `e3b0c442…`）：`卡文本：运营负责落盘工作流…`、`渲染过滤：section=roles/routing…`、`listProject：枚举真实项目…`、`listProject：实际已接受的四份运行时组卡…`、`D-10：质检卡保留可选质量核对…`；唯一 skip（`unreadable（权限）…`）前后相同。均为角色卡/注册表/桌面类既有断言，与本批写集无关。
- **其它 policy / initial-workflow / 非 bootstrap 回归**：同套件内 `git-shell-acl.test.ts` 既有 39 个用例（G6/G8/G9/G10/G11/G16/G17/G18/G23/revert 等，含 initial-workflow 与团队计划、激活、raw-object 预算、`gitRolePath`、其它 `git-policy-app-*` 分支）**零编辑、全部通过**；`versioned-doc-guard.test.ts`/`classify-shell.test.ts` 等亦全部原样通过（见前后 TAP）。

### 3.3 定向运行

| 运行 | 结果 | 日志 |
| --- | --- | --- |
| 修改前 `test/门禁引擎/git-shell-acl.test.ts` | 39/39 pass，exit 0 | `target-git-shell-acl-pre.tap.txt`（`9ca694a2…`） |
| 新测试 vs HEAD 源码 | 1 pass / 6 fail，exit 1 | `freeze-closure-against-head.tap.txt`（`104a0911…`） |
| 候选：`git-shell-acl.test.ts` + `freeze-closure.test.ts` | **46/46 pass**，0 fail/skip，exit 0 | `targeted-post.tap.txt`（`182d493d…`） |
| 直接调用 `checkGitPolicy` 的跨角色套件 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（真实 prepared raw-object plans，无 businessPublication） | **1/1 pass**，exit 0（本变更对其无影响） | `judge-delegated-post.tap.txt`（`b543c7cf…`） |
| `npm run typecheck`（`tsc --noEmit`） | **exit 0** | `typecheck-post.txt`（`4d92735e…`） |

## 4. 候选标识

| 文件 | 前（HEAD） | 后（候选） |
| --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts` | SHA-256 `a98f09e42b10d88a8d18ad26a1f37284a1435880be11df3e3f18babafdc9e7c1`；2,229 行 / 167,045 bytes | SHA-256 `b4b98a5a4e001f2294c65b04e119b34e7b7a369c69cede856e7458627d54ad1b`；2,242 行 / 170,528 bytes；numstat **+16/−3** |
| `test/门禁引擎/freeze-closure.test.ts` | 不存在（新） | SHA-256 `9109711ab1b3734935c3f7184d1028a62c5ae2b224e1c3aefadd96a25f5da039`；212 行 / 19,973 bytes（新增） |
| `test/门禁引擎/git-shell-acl.test.ts` | `7652d171…` | `7652d171…`（未改） |

- **可复算聚合**（按路径排序后 `path + "\0" + sha256hex` 串联的 SHA-256；候选两文件）：**`d791c8d7a00bda13b6f25079067d4db1ba75f830bc3570f8bd1f80e0dcaf4925`**（`candidate-aggregate.txt`）。
- 完整 diff：`candidate-diff.patch`（`classify-shell.ts` +16/−3 与新增测试文件全文）。
- **写集外 `src app test`**：本批只改上述 2 个文件（见 `scope-status.txt`）；同 worktree 存在**其它角色并发在飞**的 `src/service/trunk/impl/apply-journal.ts`（M，证据采集时 SHA-256 `d0a3fdf2…`）与 `test/编排/bootstrap-frozen-closure.test.ts`（新，`3228020b…`）——**非本批改动，本批零编辑**。`docs/communication/memo.md` 的 M 为开工前已存在的历史产物，亦非本批。

## 5. 限制与披露（如实）

1. **层级边界**：本批只覆盖门禁层（L2）。T1 全链（快照装配 + 真实 Git 发布）由 W1/B3 覆盖；T3–T7 的「文件缺失/不可读/漂移、同 path 冲突」服务侧装配 fail-closed 属 W1；T15 FS 媒体回归属 W1（G1）。门禁层无 I/O——「不可读」在门禁表现为已物化字节缺失/不符（`git-policy-app-file-hash`/`-closure`）仍 fail-closed。
2. **并发写者（重要）**：本批运行期间，同 worktree 有编排 W1 批次的在飞改动（`apply-journal.ts` 于本批会话中两次变化：`0123fa5c…` → `d0a3fdf2…`；新增 `test/编排/bootstrap-frozen-closure.test.ts`）。本批 before/after 基线均包含这些在飞文件的实际状态（前后 TAP 中相关用例全部通过、失败集合 IDENTICAL）；B2/复取基线应按 BASE-1 在全部在飞批次冻结后重取，不得把本批 before/after 当作唯一基线。
3. **干净基线的取得方式（可追溯）**：为取得 HEAD 源码下的干净 before 基线，本批将候选 `classify-shell.ts` 暂存到工作区外临时文件（`.tmp-w2/`，未跟踪），`git checkout --` 恢复 HEAD 内容运行基线后立即回填，并以 SHA-256 `b4b98a5a…` 复验候选；期间未提交/未暂存任何内容。候选新测试对 HEAD 的敏感性运行采用同一方式。
4. **允许集的残余边界**：按 P1.1 §3.2.2/AC-4，加入 `allowed` 的判据是「frozen 证明 + 元数据行 kind=`snapshot-content`」而非 `docs/` 前缀；即若账本 frozen 记录指向非 `docs/` 的非 `.ans/` 路径且该字节进入快照，也会被放行。该字节由 `primary.files` 同 path 同 sha + 快照 digest + 账本本身在快照内三重钉死（§7.8 已披露该口径）；如需更紧的前缀谓词，属新增门禁允许集语义，须另立变更/升档，不在本批范围。
5. **`-vN` 后缀版本一致性**：门禁保持 `:728` 原样使用路径（T18），版本后缀防御在服务侧（W1）；本批用用例钉住差异，不改变门禁行为。
6. **多 flow 账本**：含异 flow 行的项目仍不能 bootstrap（既有语义，T17 逐行 fail-closed）；本批未扩围。
7. **规模/预算**：raw-object 128 文件 / 1 MiB / 4 MiB / 2048 树条目不变；未提升预算。
8. **未提交/推送/合并/发布**；未运行真实模型/Electron；未占用 9222/9223；未修改方案/B1/复核/缺陷记录、角色卡正文/边界/其它角色资料。本记录与证据目录内的临时证据为唯一新增记录。

## 6. 证据

目录：`角色卡/门禁引擎/docs/change/2026-11-10_W2_bootstrap-snapshot-freeze-closure-evidence/`

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `gate-tests-pre.tap.txt` | 干净基线全量门禁 TAP（472/466/5/0/1/0，exit 1） | `8d081a130179138cf5a9d99008e9416e4cd4254386fd1e40322b611f1b98b7d5` |
| `gate-tests-post.tap.txt` | 候选全量门禁 TAP（479/473/5/0/1/0，exit 1） | `8dda06fbe8a0352e509a32b7107831685f88793215bf4a8abd4dca655b6d05d3` |
| `target-git-shell-acl-pre.tap.txt` | 修改前 `git-shell-acl.test.ts` 定向 TAP（39/39/0，exit 0） | `9ca694a24a5eb2684b84a8cec75bf3ebaf66b17e262099d09379208a1f9b0ca0` |
| `freeze-closure-against-head.tap.txt` | 新测试 vs HEAD 源码（1 pass/6 fail，exit 1；敏感性） | `104a09116540afc70f26f541705945d7a276d62f271838beb0d4ee15da80156c` |
| `targeted-post.tap.txt` | 候选定向 `git-shell-acl` + `freeze-closure`（46/46/0，exit 0） | `182d493deb245d71c629ae8dc7d68885a33209e16c979e7108124508119133ea` |
| `judge-delegated-post.tap.txt` | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（1/1，exit 0；直接调用 `checkGitPolicy` 的跨角色套件） | `b543c7cfbc8ed9cdd8e9e87153d2ecaef8abb533b84f25786875a91ab1401e41` |
| `typecheck-post.txt` | `npm run typecheck` 输出（exit 0） | `4d92735e06c77ecc4cc37b0e14dcb7d1a05fc3fb48ac5a4d9813c98f0e5a82c0` |
| `failure-titles-pre.txt` / `failure-titles-post.txt` | 前后失败标题（各 5 条，内容/哈希相同） | `8325f9d8f24a7aeda3899be9187297744bf517c1975ddaf9c9dc0fcd860139f2` |
| `failure-set-diff.txt` | 前后失败标题集合 diff（IDENTICAL，空文件） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `candidate-hashes-post.txt` | 候选 2 文件 SHA-256 | `4a6ad239dd32f0e97237c50dad4edb8210f9a93c9cc42f981d96adda5e207278` |
| `candidate-aggregate.txt` | 候选逐文件哈希 + 聚合 `d791c8d7…` | `d64c89421b3dcdadfb42326dc8809f1e4a2389f1850f3fcf034b0e97cb7802b1` |
| `candidate-numstat.txt` | `git diff --numstat`（classify-shell +16/−3） | `4aad0dbe5879ceec434dae7bf33565543f697dd8a0d7904683f09a8741bb209c` |
| `candidate-diff.patch` | 本批 2 文件完整 diff（含新文件全文） | `ec6fcce686da58fd352f03aebd54c09671a25dcc1a1a53c7fa313ef64e4d23ff` |
| `scope-status.txt` | `git status -- src app test` + W1 并发文件/未改文件哈希 | `b0e1d5b4ff90b3162ef9eb77ab01adddba627d5c2e30b97ee614b1d5c85b4841` |
| `baseline-head.txt` | HEAD `0ab2584…` / tree `d6c2158d…` / 分支 | `49ca3f09446e50aba00eaf1a3ccdf1c285db0163c38e87ed5de778608b83de71` |
| `node-version.txt` | Node v24.22.1 / npm 11.19.1 | `1ba514e3bc8c0f51873c8f633be0504a1a9db12ff0aa7dca0d374308baddc1aa` |

**（完）**
