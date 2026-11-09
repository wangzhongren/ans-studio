# D1 组合确定性验证记录：bootstrap 快照/冻结闭包冲突修复（T3）

- 日期：2026-11-10；角色：ans-studio 固定 worker「测试」（roleId: 测试），独立验证上下文。
- 任务：对 T3「bootstrap 快照单槽位与冻结闭包矛盾」的**五文件组合候选**（W1 编排 2、W2 门禁 2、W5 测试 1）执行 **D1 组合确定性验证**：候选冻结（BASE-4/5）、受影响套件 before/after（BASE-3）、失败/skip 标题集合 diff、隔离复跑、B1 AC-1–AC-14 / T1–T19 证据锚点映射、静态门（typecheck）。
- 本记录**只取证、不判验收**；未修改任何产品/测试/角色卡/边界/其它文档（只写 `角色卡/测试/docs/change/2026-11-10_D1_bootstrap-snapshot-freeze-closure-evidence/`）；未运行真实模型/Electron/CDP；未占用 9222/9223；未提交/推送/合并/发布。
- 工作目录 worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`；基线 HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`；含 doc-format #81 尖端，stacked）；Node **v24.22.1**，npm 11.19.1。
- 依据（只读）：方案 P1.1 `643cb33f…`（477 行 / 68,367 B）、复核 R1.1 含 R1.0 `17453813…`（263 行 / 43,407 B）、B1 v1 `9b7fa81c…`（256 行 / 49,013 B）、缺陷记录 `63f6e239…`（36 行 / 2,733 B）、RR19 `a4a90ebe…`（182 行 / 23,923 B）；W1 记录 `0ffe52c8…`、W2 记录 `37249c42…`、W5 记录 `66d83124…`（写盘前实测与任务给定前缀一致）。
- 状态：**D1 取证完成。候选 5 文件逐文件 raw SHA-256 与 W1/W2/W5 记录 5/5 全等；聚合 `e99f7cb4…`；`src app test` manifest 运行前/中/后逐字节相同；写集外 tracked diff=0；受影响套件新增确定性失败＝0、新 skip＝0、已知红不恶化（失败/skip 标题集合 diff 全部为空）；`npm run typecheck` exit 0。未验收。**

## 0. 结论摘要（供 B2 使用，不代替验收判定）

| 项 | 结果 |
| --- | --- |
| 组合候选 | `git -c core.quotepath=false status --porcelain -- src app test` 恰 **5 项**（2 M + 3 新），无其它；逐文件 raw SHA-256 与 W1/W2/W5 记录 **5/5 全等** |
| 聚合 | **`e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490`**（定义：路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256；方法已用 W1 `b60b66d8…`/W2 `d791c8d7…`/W5 `8916adab…` 记录聚合值逐一复算验证） |
| manifest | `src app test` **1,120 文件 / 27,678,614 B**；聚合 **`2ea300869cf5298246705a88fbe7792c4ce8d1fda4bbeb4f0d7b0c6c6d0272ef`**；运行前/中/后**逐字节相同**（`cmp` 相同） |
| 写集外 | tracked diff=0（`app/**` 0；`角色卡/**`、`src/model/**`、schema/versions/parser/边界未改；#81/团队计划/judge/提案卡修复写集 diff=0）；无删除/重命名/新依赖；`.tmp-*`/未跟踪 docs/`memo.md` 不进入候选 |
| 候选 diff 区域 | `classify-shell.ts` 仅 `appMetadataPaths`（+16/−3）；`apply-journal.ts` 仅 `bootstrapClosureFiles` 新增 + `executeDirectInternal` fallback + `prepareDirectSubmission`（+95/−13；末 hunk `+1421`，未触 team-plan 区域） |
| 目录级 before/after | 编排 **1164/1140/22/2 → 1178/1154/22/2**；门禁引擎 **472/466/5/1 → 479/473/5/1**；runtime-core **554/517/33/4 → 554/517/33/4** |
| 文件级 before/after | 桌面四文件 **61/35/26/0 → 61/35/26/0**；optional-acceptance（`--test-timeout=6000`）**6/2/1/3/0 → 6/2/1/3/0**；version-change-integration **12/3/9 → 12/3/9**（9 红为既有 B0，**不作 pass 证据**）；judge-delegated-effectiveness **1/1 → 1/1**；git-shell-acl **39/39 → 39/39** |
| 新增用例 | W1 `test/编排/bootstrap-frozen-closure.test.ts` **14/14**；W2 `test/门禁引擎/freeze-closure.test.ts` **7/7**；W5 `test/测试/bootstrap-frozen-closure-integration.test.ts` **9/9**；全部 0 fail / 0 skip |
| 失败/skip 集合 diff | 编排、门禁、runtime-core、桌面四文件、optional-acceptance、version-change-integration、judge：**失败与 skip 标题集合 diff 全部为空**（`compare/setdiff-*.txt`） |
| 新增确定性失败 / 新 skip | **0 / 0**；已知红同名同数不恶化；环境抖动 3 项已按同候选/同基线隔离复跑归因（§2.5） |
| typecheck | `npm run typecheck`（`tsc --noEmit`）**exit 0**；日志 `typecheck/typecheck.txt` |
| AC/T 覆盖 | AC-1–AC-10、AC-12–AC-14（D1 可取证部分）与 T1–T19 均有确定性证据锚点（§3/§4）；AC-11（RR20）与 AC-14 的 RR20 绑定部分不在 D1 范围 |

## 1. 候选冻结（BASE-4/5）

### 1.1 候选清单（5 文件；`candidate/candidate-files.txt`、`candidate/scope-status-initial.txt`）

`git -c core.quotepath=false status --porcelain --untracked-files=all -- src app test` 恰 5 行（2 M + 3 `??`），无其它：

| 批次 | 文件 | 状态 | 行 / 字节 | raw SHA-256（实测） | 批次记录值 | match |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | `src/service/trunk/impl/apply-journal.ts` | M | 4,030 / 399,307 | `d0a3fdf27bcdada86258406d73e7ff630543f3f9c5b0585f14b9ef4629430cd4` | `d0a3fdf2…`（W1） | YES |
| W1 | `test/编排/bootstrap-frozen-closure.test.ts` | ?? | 431 / 31,218 | `3228020b35b6bb4eeb031e95f5fa5a09a9152bc525ce3a5ff8da15ebb622ca1f` | `3228020b…`（W1） | YES |
| W2 | `src/common/门禁引擎/classify-shell.ts` | M | 2,242 / 170,528 | `b4b98a5a4e001f2294c65b04e119b34e7b7a369c69cede856e7458627d54ad1b` | `b4b98a5a…`（W2） | YES |
| W2 | `test/门禁引擎/freeze-closure.test.ts` | ?? | 212 / 19,973 | `9109711ab1b3734935c3f7184d1028a62c5ae2b224e1c3aefadd96a25f5da039` | `9109711a…`（W2） | YES |
| W5 | `test/测试/bootstrap-frozen-closure-integration.test.ts` | ?? | 702 / 54,143 | `f949bfa4cb4723344c7c87fd475d2d6d804c4019032f8e2d7b7f05c216373338` | `f949bfa4…`（W5） | YES |

- **5/5 全等**。`git diff --numstat -- src app test`：`classify-shell.ts` **+16/−3**、`apply-journal.ts` **+95/−13**（与 W2/W1 记录一致）；无删除/重命名。
- 工作树另有 `docs/communication/memo.md`（M）与 `.tmp-*`/`.commit-msg-*`/`.pr-body-*`/未跟踪 docs 等既有历史产物（`candidate/scope-status-initial.txt` 已剔除列示），**不属本变更写集**，未进入候选。

### 1.2 可复算聚合（`candidate/candidate-aggregate.txt`、`candidate/aggregate-W1|W2|W5.txt`）

- 方法：路径按 UTF-8 字节序升序；对每项串联 `bytes(path) + 0x00 + bytes(sha256hex)`；对串联结果取 SHA-256（`tools/hash-tree.mjs`，证据目录内可复算）。
- 五文件组合聚合：**`e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490`**。
- 方法学复算（与批次记录独立比对，全部相等）：W1 两文件 `b60b66d830810645dbd0410f97aaf29fa386a6389187203338011fe1010f5024`；W2 两文件 `d791c8d7a00bda13b6f25079067d4db1ba75f830bc3570f8bd1f80e0dcaf4925`；W5 单文件 `8916adab2a43c34d8b0b70e16ffa851f5b6fa1107597b65c14eb3fe7eb2ec6b7`。

### 1.3 manifest（`candidate/src-app-test-manifest-initial|final.txt`、`baseline/src-app-test-manifest-aligned.txt`）

- `src app test`：**1,120 文件 / 27,678,614 B / 聚合 `2ea300869cf5298246705a88fbe7792c4ce8d1fda4bbeb4f0d7b0c6c6d0272ef`**（初始与最终 manifest `cmp` **逐字节相同**）。
- 基线副本（`0ab2584` 干净检出 + 逐文件 EOL 复刻，见 §2.1）：1,117 文件 / 27,569,575 B / 聚合 `bed8fbff…`；与工作树 manifest 的差异**恰为 5 条候选行**（2 个产品文件哈希变化 + 3 个新增测试文件；`compare/manifest-baseline-vs-worktree.diff`），无其它偏差。

### 1.4 写集外 tracked diff=0

- `git diff --stat -- src app test` 仅上述 2 个 M 文件；`git diff --stat -- app` 为空；`git status -- app` 为空（`candidate/test-app-scope.txt`）。
- 既有测试文件零修改（`git diff --stat -- test` 为空；仅 3 个 `??` 新文件）；抽查 `git-shell-acl.test.ts` raw `7652d171…`（=W2 记录）、`version-change-integration.test.ts`、`judge-delegated-effectiveness.test.ts`、`direct-role-capabilities.test.ts` 的 `git hash-object` 均 = HEAD blob。
- 排除清单逐路径 diff=0（`candidate/writeset-outside-status.txt` 覆盖 `doc-format-specs.ts`、runtime `schema.ts`/`tools.ts`、`model/runtime.ts`、`run-role.ts`、`app/desktop/session.ts`、`model/trunk.ts`、`model/version-change.ts`、`run-manifest.ts`、`evidence-check.ts`、`workflow-preconditions.ts`、`amendment-validate.ts`、`upgrade-validate.ts`）；`角色卡/**`、`src/model/**` 无 tracked diff；无新目录/依赖/构建配置。
- raw-object 预算不变：`classify-shell.ts` 中 128 文件/单文件 1 MiB/整单 4 MiB/树条目 2048 相关文本与基线**逐字相同**（`compare/scale-limits-diff.txt` 0 行）。
- 错误码字面量集合：`classify-shell.ts` 增删均 0；`apply-journal.ts` 仅新增 `baseline` 之外的事件名 `version-added`/`draft-updated`/`draft-marker`（R9 事件白名单，非错误码），**无新增/删除错误码**（`compare/error-code-literals-diff.txt`）。

### 1.5 候选 diff 区域（`candidate/diff-hunks.txt`、`candidate/candidate-diff.patch`；AC-12）

- `classify-shell.ts` 全部 hunk 位于 `appMetadataPaths`（`@@ -696`、`-723..-729`→`+724..+747` 区域）：冻结闭包仅 `event:"frozen"` + `frozenClosurePaths` 收集 + 表循环后 `snapshot-content` 加 `allowed`；teamPlan「unrelated bytes」检查与其它 policy 分支未改。
- `apply-journal.ts` hunk 位于：`targetSlots` 之后新增 `bootstrapClosureFiles`（`@@ -573,+574..627`）、`executeDirectInternal` fallback 捕获（`@@ -691..-739` 区域）、`prepareDirectSubmission`（`@@ -1294..-1339` 区域，末 hunk `+1421`）。`completeTeamPlanInternal`/团队计划（基线 `:2855+` 区域）零 hunk。

### 1.6 稳定性（BASE-5；`candidate/snapshot-initial|mid-run|final.txt`）

| 时点 | status（src app test） | 5 文件聚合 | manifest 聚合 | HEAD/tree/分支/暂存 |
| --- | --- | --- | --- | --- |
| 运行前（21:06:55Z） | 恰 5 项（2 M + 3 新） | `e99f7cb4…` | `2ea30086…`（1,120 文件） | `0ab2584` / `d6c2158d…` / 分支 / staged 0 |
| 运行中（21:32:06Z） | 恰 5 项（同集合） | 同 | 同 | 同 |
| 全部证据运行后（21:38:38Z） | 恰 5 项（同集合） | `e99f7cb4…`（复算相同） | `2ea30086…`（`cmp` 逐字节相同） | 同，staged 0 |

⇒ 运行前/中/后同一候选；测试运行未在 `src app test` 产生副作用文件。

## 2. 受影响套件 before/after（BASE-3）

### 2.1 环境、命令与基线副本口径

- 命令（两侧一致）：`node --test --test-concurrency=1 --test-reporter=tap <file/glob>`；optional-acceptance 另加 `--test-timeout=6000`（BASE-3 命令口径）；Node v24.22.1；各套件串行运行。
- **before 基线副本**：`git worktree add --detach C:/Users/51054/AppData/Local/Temp/ans-d1-baseline-0ab2584 0ab2584`（同一 `core.autocrlf=true` 检出规则）+ `node_modules` NTFS junction（只读复用）+ 复制 `.env`。**逐文件行尾复刻**（沿用既往 D1 方法）：`src app test` 中除 5 个候选文件外的全部文件以工作树字节覆盖副本；2 个产品文件保持 pristine HEAD 检出（`classify-shell.ts` raw `a98f09e4…` = W2 记录 pre 值；`apply-journal.ts` raw `4060decd…`）；3 个新测试文件确认不存在。副本与工作树 manifest 差异恰为 5 条候选行（§1.3）。方法原件：`baseline/baseline-copy-method.txt`。
- **after**：当前 worktree 候选本体（同一 HEAD/聚合/manifest，§1.6）。

### 2.2 计数（tests/pass/fail/cancelled/skip/exit；`compare/suite-count-table.txt`）

| 套件 | before | after | 失败集合 diff | skip diff |
| --- | --- | --- | --- | --- |
| `test/编排/**`（含 W1 新文件） | **1164/1140/22/0/2/1** | **1178/1154/22/0/2/1** | **空** | **空**（2/2 同名） |
| `test/门禁引擎/*.test.ts`（含 W2 新文件） | **472/466/5/0/1/1** | **479/473/5/0/1/1** | **空** | **空**（1/1 同名） |
| `test/门禁引擎/git-shell-acl.test.ts`（隔离） | **39/39/0/0/0/0** | **39/39/0/0/0/0** | 空 | 空 |
| `test/runtime-core/**` | **554/517/33/0/4/1** | **554/517/33/0/4/1** | **空** | **空**（4/4 同名） |
| `test/桌面应用/` 四文件 | **61/35/26/0/0/1** | **61/35/26/0/0/1** | **空** | 空 |
| `test/桌面应用/optional-acceptance.test.ts`（`--test-timeout=6000`） | **6/2/1/3/0/1** | **6/2/1/3/0/1** | **空** | 空 |
| `test/测试/version-change-integration.test.ts` | **12/3/9/0/0/1** | **12/3/9/0/0/1** | **空** | 空 |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | **1/1/0/0/0/0** | **1/1/0/0/0/0** | 空 | 空 |
| `test/编排/bootstrap-frozen-closure.test.ts`（新） | 不存在 | **14/14/0/0/0/0** | — | — |
| `test/门禁引擎/freeze-closure.test.ts`（新） | 不存在 | **7/7/0/0/0/0** | — | — |
| `test/测试/bootstrap-frozen-closure-integration.test.ts`（新） | 不存在 | **9/9/0/0/0/0** | — | — |

- 目录级 before 与 W1/W2/W5/doc-format D1 v1.1 参照逐一相同（编排 1164/1140/22/2、门禁 472/466/5/1、runtime-core 554/517/33/4、桌面四文件 61/35/26/0、optional 6/2/1/3/0）；after 增量恰为 +14（W1）/ +7（W2）/ +9（W5）全部通过。
- **新增确定性失败 = 0、新 skip = 0、已知红不恶化**。失败/skip 标题集合逐条 diff 均为空：`compare/setdiff-bianpai.txt`、`setdiff-gate.txt`、`setdiff-runtime-core.txt`、`setdiff-desktop-four.txt`、`setdiff-optional-acceptance.txt`、`setdiff-version-change-integration.txt`、`setdiff-judge-delegated-effectiveness.txt`。

### 2.3 既有 B0 红（只登记，不作 pass 证据）

- `test/测试/version-change-integration.test.ts` 两侧均 **12/3/9**：9 条失败为既有 P3.1 产品决策「former customer approval channel is closed」（`vca-channel-unavailable`，早于本变更路径），标题集合与 W1/W5 记录逐条同名；**不得作为本变更 pass 证据**。
- 其它既有红（编排 22、门禁 5+1 skip、runtime-core 33+4 skip、桌面四文件 26、optional 1 fail+3 cancelled）两侧同名同数，未修复/未弱化；`optional-acceptance` 的 4 条 `not ok`（1/4/5/6）对应 summary fail=1 + cancelled=3，按 B1 计数口径 6/2/1/3/0 记录。

### 2.4 隔离复跑与归因（如实）

1. **Pristine-checkout EOL 伪差异（基线副本方法学）**：首次以 pristine 检出全量跑 `test/编排/**` 得 1164/1139/**23**/2，唯一多出失败为 `wiring guards: append sits after current gate …`——该用例以字面 `\n` 锚点切片 `src/pipeline/orchestration/trunk-runtime.ts`（`git-action-authorization-wiring.test.ts:69` 起），pristine 检出为 CRLF 导致锚点失配。按既往 D1 的逐文件行尾复刻（§2.1）后重跑 **1164/1140/22/2**（=W1 记录），**对齐副本为权威 before**；原件 `before/bianpai-pristine-checkout.tap.txt`、`compare/setdiff-bianpai-pristine-vs-aligned.txt`。
2. **Node 原生 teardown 崩溃（基线门禁首跑，环境抖动）**：首跑 `test/门禁引擎/*.test.ts` 得 439/432/**6**/1，`git-shell-acl.test.ts` 文件级 `not ok`（`failureType:testCodeFailure`、`exitCode 134`、native `node::CleanupQueue::Add … Assertion failed: (insertion_info.second) == (true)`）。隔离复跑该文件 **39/39 exit 0**（`before/git-shell-acl-isolated.tap.txt`）；全量重跑 **472/466/5/1**（=W2 记录，`before/gate-rerun.tap.txt`）。首跑原件保留 `before/gate.tap.txt`，不作权威。
3. **测试完成后的进程不退出（基线 judge 首跑，环境抖动）**：首跑 `judge-delegated-effectiveness`（与 vci 同批命令）TAP 已输出 `ok 1`（64.8s）但无 summary/不退出；隔离复跑 **1/1 exit 0**（`before/judge-delegated-effectiveness-isolated.tap.txt`），作权威。W5 记录过的同类 `git-shell-acl` teardown 挂起本轮未复现。
4. after 侧各套件一次通过，无需要隔离复跑的抖动；候选 5 文件与 manifest 在全部运行前后逐字节相同（§1.6）。

## 3. B1 AC-1–AC-14 证据锚点（只映射，不判定）

| ID | 证据锚点（D1 可取证部分） |
| --- | --- |
| AC-1 | W1 `T1 bootstrap closure…`（14/14 TAP `ok`）：快照恰 9 文件、path 排序、每文件 sha=磁盘、4 targets 全在、`vca.prepareDirect` 接受；W1 `T13 scale…`（43 文件排序/确定 digest）；W5 `W5-T1`（真实链 9 文件、8 frozen 记录 sha=磁盘、真实 t1 提交；证据 `角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure-evidence/t1-snapshot-9-files.json` `5f1c13ce…`、`t1-policy-verdicts.json` `953f8181…`）；代码 `bootstrapClosureFiles` 与两处捕获（`candidate/candidate-diff.patch`）。 |
| AC-2 | W2 用例 1（sha1/sha256 各一，T10/T13：9 文件、5 条草稿旧 sha 不在快照、candidate+publication allowed）；W2 用例 3（T12/T17：未知/非法 event/freeze、坏行、异 flow、同 path 冲突仍拒）；W2 敏感性 `freeze-closure-against-head.tap.txt`（旧代码 1 pass/6 fail，`104a0911…`）；W1 T6 服务侧；diff 仅 `event:"frozen"` 分支。 |
| AC-3 | W1 `T2 …rejected explicitly (M1)…`（service `trunk-item-invalid`，消息含 slot/路径/assembled from R9，无副作用）；W5 `W5-T2`（service `trunk-item-invalid` → 全链 `vca-target-invalid`，无 manifest/ref/snapshot）；代码 slot 重复检查（diff `prepareDirectSubmission`）。 |
| AC-4 | W2 用例 4（T19/N2：未证明 `docs/proposals/unit-proposal-v9.md` 仍 `git-policy-raw-write-scope`；追加 frozen 证明后 candidate+publication allowed；100755 仍拒）；W5 `W5-T1`（历史 v1 为真实 `snapshot-content`，candidate `aca836ae…`/publication `52256ac8…` allowed）与 `W5-T19`（未证明→raw-write-scope；证明后 allowed）。 |
| AC-5 | `compare/scale-limits-diff.txt`（128 文件 / 1 MiB / 4 MiB / 2048 树条目文本与基线 0 行差异）；W1 `T13 scale` 43 文件样例；W5 9 文件约 6.7 KB 原文；预算未提升（diff 无预算行）；base64≈1.33× ⇒ 原始约 ≤1.5 MB 为已知限制（W1/W2/W5 记录披露）。 |
| AC-6 | W1 T3（缺失/漂移/不可读）、T6（坏行/未知/非法 freeze）、T7（同 path 冲突）、T17（异 flow 逐行）、T18（`-vN` 后缀防御）；W5 `W5-T3`/`W5-T6`/`W5-T7`/`W5-T17`/`W5-T18`（真实链消息含路径/flowId）；W2 用例 3（门禁同规则）。 |
| AC-7 | W1 `T8`（无历史快照内容不变）、`T9`（非 bootstrap 不收集账本）、`T14`（旧直连 executeDirect 捕获集合旧行为）、`T15`（**仅 FS 媒体**，不宣称 Git policy）；W5 回归用例（t1 后非 bootstrap 快照仅新 target；team-plan 快照仅 `directRefs` + 自身 marker，不含 versions/历史）；diff 非 bootstrap 表达式逐字等价；错误码字面量集合不变（§1.4）。 |
| AC-8 | W1 `T16 replay…`（同 operationId 同 snapshotId/digest/files；不同文件集合 ⇒ `snapshot-immutable-conflict` fail-closed）；W1 T1/T13 同集合 digest 稳定；W5 T1 真实快照 ID/digest 落盘；RR19 `s-9fbf9c81…` 不可变与 RR20 新 operationId 为既有披露（`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`）。 |
| AC-9 | W1 T2/T3/T6/T7/`T15 negative` 断言无 manifest/snapshot/journal/freeze 副作用、消息含路径；W5 负例统一 `assertNoBootstrapEffects`（无 manifest/refs/ans/trunk/operation snapshot）；`captureSnapshot` 的 hash-drift/immutable 语义原样（diff 未改）。 |
| AC-10 | W2 用例 2（缺 frozen/漂移仍 `git-policy-app-freeze-closure`；无 frozen 证明历史文件回 `git-policy-raw-write-scope`）、用例 4（允许集仅证明路径 + executable 负例）；diff 未改 teamPlan unrelated-bytes 检查；快照 digest/账本/`primary.files` 三重钉死由 W2/W5 断言。 |
| AC-11 | **不在 D1 范围**（RR20 真实运行未执行；本记录不宣称）。 |
| AC-12 | 候选仅 5 文件；写集外 tracked diff=0（§1.4）；#81/团队计划/judge/提案卡修复写集 diff=0；diff 区域限定（§1.5）；B1+B2 同候选同分支（两文件同时在盘、同一 manifest 聚合）；基线为 #81 尖端 `0ab2584`（stacked）。未提交/推送（本 D1）。 |
| AC-13 | §2 全部套件 before/after 与集合 diff；新增用例 14/7/9 全绿；typecheck exit 0；既有测试文件零修改（无断言改写/删除/弱化；`candidate/test-app-scope.txt`）；未新增 skip/force-exit（diff 与 TAP 计数）。 |
| AC-14 | 本记录 §6 证据索引 + manifest（107 文件 / `d72a0163…`）；候选/manifest/聚合/hash；绑定 P1.1/R1.1/B1/W1/W2/W5/RR19 哈希；RR20 attestation 部分不在 D1（如实标注）。 |

## 4. T1–T19 证据锚点（只映射，不判定）

| # | 锚点 |
| --- | --- |
| T1 | W1 T1（L1 9 文件 + vca 接受）；W2 用例 1（L2 candidate+publication allowed，sha1/sha256）；W5-T1（L3 真实 Git 对象 + 真实 `prepareDirectSubmission`/`checkGitPolicy`/commit，t1 applied）。 |
| T2 | W1 T2（service 层 `trunk-item-invalid`，消息含 slot/路径/「assembled from R9」）；W5-T2（service→全链 `vca-target-invalid`，N1 层口径，无副作用）。 |
| T3/T4/T5 | W1 T3（missing/drift/unreadable 三负例）；W5-T3（真实链 same）；消息分别 `missing/unreadable`、`hash drift`。 |
| T6 | W1 T6（坏行/未知 event/非法 freeze 经服务侧解析拒绝；真实注册表整体 fail-closed）；W2 用例 3（门禁 `-source`/`-record`）；W5-T6（真实注册表 `baseline-corrupt`）。 |
| T7 | W1 T7（`Frozen closure path conflict: docs/product/demo-intent-v1.md`）；W5-T7（真实链同）。 |
| T8 | W1 T8（无历史快照 = versions + intent + 单 target，与原实现一致）。 |
| T9 | W1 T9（t1→t2 快照仅 proposal v2，不调用闭合收集）；W5 回归用例（非 bootstrap 快照仅 directRefs 槽位）。 |
| T10 | W2 用例 1（含草稿行账本 + 9 文件快照 ⇒ allowed）。 |
| T11 | W2 用例 2（缺 frozen 文件 / frozen sha 漂移 ⇒ 仍 `git-policy-app-freeze-closure`）。 |
| T12 | W2 用例 3（未知 event/缺 freeze/非法 freeze ⇒ `-source`；version 0/异 flow/同 path 冲突 ⇒ `-record`/`-closure`）。 |
| T13 | W2 用例 1（5 条非 frozen 草稿旧 sha 不在快照，仍 allowed——B1 T13 语义）。说明：W1 文件内命名为「T13 scale」的用例实际钉 AC-5 规模/确定性，非 B1 T13；此处按 B1 语义以 W2 用例 1 为准。 |
| T14 | `test/门禁引擎/git-shell-acl.test.ts` 39/39 既有断言原样通过（含其它 `git-policy-app-*`、team-plan/activation/initial-workflow、raw-object 预算、`gitRolePath`）；W2 用例 6（普通候选不获历史文件写权）。说明：W1 文件内「T14 legacy call」钉旧直连 executeDirect（AC-7 面），非 B1 T14。 |
| T15 | W1 `T15 FS media`（bootstrap executeDirect fallback 装配 frozen 闭合并 applied；真实 `role-direct-applied` 冻结追加；**不宣称 Git policy**）+ `T15 negative`（漂移 ⇒ `vca-target-invalid`，无副作用）。 |
| T16 | W1 T16（同 operationId 重放稳定；不同文件集合 ⇒ `snapshot-immutable-conflict`）。 |
| T17 | W1 T17（服务侧逐行拒绝，消息含 flowId）；W2 用例 3（门禁 `:726` 同规则）；W5-T17（真实注册表异 flow 追加 ⇒ 拒绝）。 |
| T18 | W1 T18（服务侧防御性拒绝 `-vN` 后缀 ≠ version）；W2 用例 5（门禁保持原样使用路径；canonical 解析缺失仍 closure 拒）；W5-T18（真实注册表 `baseline-corrupt`；注入注册表服务侧拒绝）。 |
| T19 | W2 用例 2/4（未证明额外 snapshot-content ⇒ `git-policy-raw-write-scope`；证明后 allowed；executable 仍拒）；W5-T19（真实 Git 对象 + 真实 digest 算法；candidate/publication 同判）。 |

## 5. 静态门

- `npm run typecheck`（`tsc --noEmit`）**exit 0**（`typecheck/typecheck.txt`；`typecheck/typecheck.start.txt` 记录起止 21:38:31–21:38:33Z、exit=0）。
- renderer/build：**N/A**（本候选不改 `app/**`；`git diff -- app` 为空；未运行 dev/build 服务器；未占用 9222/9223）。

## 6. 证据（`…-evidence/`，107 文件；manifest `evidence-manifest.txt`）

- 证据目录：`角色卡/测试/docs/change/2026-11-10_D1_bootstrap-snapshot-freeze-closure-evidence/`。
- **证据 manifest**：`evidence-manifest.txt`（**107 行**，覆盖生成时的 107 个证据文件；不含 manifest 与 summary 自身——两者为后置产物）；manifest 自身 SHA-256 **`d72a0163f614cb82292216b38b86db9b5aae359eaac3c6148e17a91a82ad3e4d`**；目录全量聚合 `abf595a375e4cae5127b3197fc08eec62dda1e04320d63e7d2faec838e9369e6`（`evidence-manifest-summary.json`）。
- 关键原件：
  - `candidate/candidate-files.txt`、`candidate-aggregate.txt`、`src-app-test-manifest-initial|final.txt`、`candidate-diff.patch`、`diff-hunks.txt`、`scope-status-initial.txt`、`snapshot-initial|mid-run|final.txt`、`test-app-scope.txt`、`writeset-outside-status.txt`、`environment.txt`；
  - `baseline/src-app-test-manifest-aligned.txt`、`baseline/baseline-copy-method.txt`；
  - `before/*.tap.txt`（bianpai-aligned、bianpai-pristine-checkout、gate、gate-rerun、git-shell-acl-isolated、runtime-core、desktop-four、optional-acceptance、version-change-integration、judge-delegated-effectiveness[-isolated]）与 `after/*.tap.txt`（bianpai、gate、git-shell-acl-isolated、runtime-core、desktop-four、optional-acceptance、version-change-integration、judge-delegated-effectiveness、w1-targeted、w2-targeted、w5-integration）；
  - `compare/setdiff-*.txt`（7 套件 + pristine 对照）、`compare/suite-count-table.txt`、`compare/new-suite-case-titles.txt`、`compare/scale-limits-diff.txt`、`compare/error-code-literals-diff.txt`、`compare/manifest-baseline-vs-worktree.diff`、`compare/stability-initial-vs-final.txt`；
  - `typecheck/typecheck.txt`；`tools/hash-tree.mjs`、`tools/parse-tap.mjs`（可复算方法）。
- 只读交叉引用（未复制、未改动）：W5 证据 `t1-snapshot-9-files.json`（`5f1c13ce…`）、`t1-policy-verdicts.json`（`953f8181…`）、`t19-verdicts.json`（`dcea22c1…`）；W2 证据 `freeze-closure-against-head.tap.txt`（`104a0911…`）、`gate-tests-pre/post.tap.txt`（`8d081a13…`/`8dda06fb…`）、`target-git-shell-acl-pre.tap.txt`（`9ca694a2…`）。

## 7. 限制 / 披露（如实）

1. **只取证、不判验收**：本记录不构成 B1/B2 判定；AC-11（RR20）与 AC-14 的真实运行绑定部分不在 D1 范围，未执行、未宣称。
2. **候选未提交**：5 文件仍为工作树未提交状态（2 M + 3 `??`），未暂存；无 PR；分支基于 #81 尖端 `0ab2584`（stacked，B1+B2 同候选）。
3. **基线副本口径**：before 侧为仓库外临时 `git worktree`（0ab2584）+ `node_modules` junction + 逐文件行尾复刻；pristine-checkout 的 1 条 EOL 伪失败与门禁首跑 Node 原生 teardown 崩溃、judge 首跑进程不退出均已隔离复跑并保留原件（§2.4）。after 侧无抖动。
4. **TAP 集合口径**：失败/skip 标题按 `not ok`/`# SKIP` 行去重排序比较；`optional-acceptance` 的 4 条 `not ok`（1/4/5/6）= summary fail 1 + cancelled 3，按 B1 的 6/2/1/3/0 记录；`version-change-integration` 9 红为既有 B0，不作 pass 证据。
5. **命名差异**：W1 测试文件内的「T13 scale」「T14 legacy call」标签与 B1 T13/T14 语义不同（前者钉 AC-5 规模、后者钉 AC-7 旧直连），已在 §4 如实标注，T13/T14 的 B1 语义分别由 W2 用例 1 与 `git-shell-acl` 39/39 + W2 用例 6 锚定。
6. **规模/预算**：128 文件/2048 树条目/1 MiB 单文件/4 MiB 整单/base64≈1.33× ⇒ 文档原始约 ≤1.5 MB 为已知限制；超限按既有 `git-policy-raw-byte-budget` fail-closed；本变更不提升预算（未改预算行）。
7. **环境**：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；`core.autocrlf=true`；raw SHA-256 依赖工作树行尾状态（本候选 raw 值与 W1/W2/W5 记录同口径）。
8. **未运行**：真实模型/Electron/CDP 9222/9223；未跑 RR20；未提交/推送/合并/发布；未创建 tag。
9. **记录自身**：本文件行数/字节/SHA-256 无法内嵌，写盘后实测并随回报提交；证据 manifest 覆盖生成时的 107 个证据文件（manifest 与 summary 为后置产物，不计入自身行集）。

**（完）**
