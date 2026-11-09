# D1 组合确定性验证记录：每个文档格式的权威说明与全员可读（T2）

- 日期：2026-11-09；角色：ans-studio 固定 worker「测试」（roleId: 测试），独立验证上下文。
- 任务：对「每个文档格式的权威说明与全员可读（T2）」的 **11 文件组合候选（B1–B5 五批）** 执行 **D1 组合确定性验证**：候选冻结（BASE-4/5）、受影响套件 before/after（BASE-3；T2 §4.2）、失败/skip 集合 diff、隔离复跑、TM-1–TM-14 映射、静态门（typecheck）。
- 本记录**只取证、不判验收**；未修改任何产品/测试/角色卡/边界/其它文档（只写 `角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications-evidence/` 与本记录）；未运行真实模型/Electron/CDP；未占用 9222/9223；未提交/推送/合并/发布。
- 工作目录 worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/document-format-specifications`；基线 HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad26d768297cb076af4f8e24316c7d71b7`）；Node **v24.22.1**，npm 11.19.1，git 2.55.0.windows.5。
- 判据：B1 v1 `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（`bec45edf…`）；团队计划 `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`（`4d99586f…`）；派发记录 `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`；方案 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md`（`886fef84…`）；复核 R1.1 `docs/planning/2026-11-09_review_document-format-specifications.md`（实测 `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05`）。

## 0. 结论摘要（供 B2 使用，不代替验收判定）

| 项 | 结果 |
| --- | --- |
| 组合候选 | `git status --porcelain -- src app test` 恰 **11 项**：5 M + 6 新（??）；无删除/重命名；**v1.1 终态**逐文件 raw SHA-256 **11/11 全等**（9 文件对原批记录 after；2 文件对 W1 v1.1 §9.5 修复值；v1.0 原值见 §1.2 注） |
| 聚合 | **v1.1 终态 `bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（v1.0 为 `d0800946…`；定义：按路径排序后 `path + "\0" + sha256` 串联的 SHA-256；B1 两文件聚合 `f6d4475c…` 与 W1 v1.1 §9.5 一致，其余分批聚合对原记录 4/4 命中） |
| manifest | **v1.1 终态**：`src app test`（tracked 1,107 + 非忽略 untracked 6 = **1,113** 文件 / 25,907,278 bytes）聚合 **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**；on-disk 1,117 文件聚合 `b2bb60d621d3130fbb4f23065fb134389e17abf7431bb1855a24591c8f47e82e`（v1.0 为 `4535a943…`/`5142fe1d…`）；运行前/后复取一致 |
| 写集外 | tracked diff=0（24 组顶层角色卡 `role-card.md`/`boundary.md`/`boundary.yaml` + 21 个顶层 `api-spec.md` 全部 `git hash-object` == HEAD blob；classify-shell/run-manifest/workflow-preconditions/evidence-check/boundary-*.ts/amendment-validate/upgrade-validate/renderer/optional-acceptance/chief-workflow 全部 SAME；`test/桌面应用/chief-workflow.test.ts` raw SHA-256 `87983bde…` 与 T5 记录一致）；`app/renderer/**` diff=0；package/build 配置 diff=0；无新依赖 |
| before/after | 单文件：7 个既有套件计数/失败/skip 集合完全一致；`optional-acceptance` 6/2/1/3/0 同；新文件 5 个全绿（66 用例）；`chief-workflow` 权威 rerun 66/59/7→66/50/16（after-only 9 项均为 ENOTEMPTY 清理竞争族，隔离复跑归因）。目录：`编排` 1139/1115/22/2→1163/1139/22/2（diff 空）；`runtime-core` 543/506/33/4→554/517/33/4（diff 空）；`门禁引擎` 453/447/5/1→472/466/5/1（diff 空）；`桌面应用 rest` 605/530/75/0/0→605/529/76/0/0（after-only 1＝application-line 事件顺序，隔离 3/3 pass）；`test/测试` 689/629/41/1/18→695/635/41/1/18（+5 新用例；总数 +6 因 after 侧 1 个文件级失败包装按 2 计；after-only 3 项中 1 项确定性新增，见下）；**v1.1 增量复验**：请求 6 套件 + 3 目录重跑与基线同名同数、该确定性项消除（见文末） |
| 新增确定性失败 | **0（v1.1 终态）**。v1.0 曾发现 1 项：`governance-matrix-integration` T1-20/21 导入扫描（`doc-format-specs.ts` 导入 `model/governance-matrix.ts`）；编排 2026-11-10 修复后 v1.1 复验 **18/18 pass**，该失败消除（见文末「D1 v1.1 增量复验」）。其余 after-only 项均经隔离复跑归因环境/抖动 |
| 新 skip | 0（skip 计数前后一致：编排 2/2、runtime-core 4/4、门禁 1/1、桌面 rest 0/0、test/测试 18/18；新文件 0） |
| typecheck | `npm run typecheck` **exit 0**（before 副本 2s / after 候选 2s；v1.1 增量复跑亦 exit 0） |
| TM-1–TM-14 | 全部有确定性证据锚点（§3）；A14 严格层/B 组 text-shape 残余风险如实披露（§5） |
| 已知挂起文件 | `directive-decision`、`session-rebuild-race`、`stuck-redispatch`（桌面）与 `customer-authorization-plane-integration`（test/测试）为基线登记挂起族（B0 §6.2 90s 口径）；本 D1 以同一 120s/300s 看门狗对称运行，四文件两侧残段逐字同数（1/0/1、17/14/3、7/4/3、1/0/1）；bounded 前后 3/3 全等（8/2/2/4/0、18/14/3/1/0、10/6/3/1/0），见 §2.6 |

## 1. 候选冻结（BASE-4/5）

### 1.1 候选清单（11 文件，`01-candidate-status.txt`）

`git -c core.quotepath=false status --porcelain -- src app test` 恰 11 行：

| 批次 | 状态 | 文件 |
| --- | --- | --- |
| B1 编排注册表（2 新） | `??` | `src/common/编排/doc-format-specs.ts`、`test/编排/doc-format-specs.test.ts` |
| B2 运行时核心（3 M + 1 新） | ` M` / `??` | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/doc-format-specs-pin.test.ts` |
| B3 门禁 pin（1 新） | `??` | `test/门禁引擎/doc-format-specs-pin.test.ts` |
| B4a 编排 run-role（1 M） | ` M` | `src/pipeline/orchestration/run-role.ts` |
| B4b 桌面（1 M + 1 新） | ` M` / `??` | `app/desktop/session.ts`、`test/桌面应用/session.test.ts` |
| B5 跨角色（1 新） | `??` | `test/测试/doc-format-all-roles.test.ts` |

- 无删除（`D`）/重命名（`R`）/复制（`C`）；`git diff --summary -- src app test` 为空；全部路径在 B1 v1 §2.1 写集与 BASE-8 授权目录内（`src/common/编排/`、`test/编排/`、`test/runtime-core/`、`test/门禁引擎/`、`test/测试/`、`test/桌面应用/session.test.ts` 单文件）。

### 1.2 逐文件 raw SHA-256 与批次记录比对（`02-candidate-hashes.txt`）

**v1.1 终态** 11/11 与预期值**逐字节相等**（9 文件对原批记录 after；2 文件对 W1 v1.1 §9.5 修复值，下表以 v1.1 为准；raw = 工作树磁盘字节；本 worktree `core.autocrlf=true`，候选行尾为混合 CRLF/LF）：

| 文件 | 批次 | bytes | raw SHA-256 |
| --- | --- | --- | --- |
| `src/common/编排/doc-format-specs.ts` | B1/W1（v1.1 修复） | 100,605 | `3c0c9c63ba99ad09adb379858595618b833ff20406429d46bc8160514e49bf86`（v1.0 原值 `f141e4ba…` / 100,105 B） |
| `test/编排/doc-format-specs.test.ts` | B1/W1（v1.1 修复） | 101,313 | `54e5b01ab47c59f091ec2c9617b5209b6e3b254fe2aa757ec211455166aa2e94`（v1.0 原值 `f9abe8f3…` / 99,507 B） |
| `src/model/runtime.ts` | B2/W2 | 212,397 | `89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959` |
| `src/provider/runtime/tools.ts` | B2/W2 | 335,868 | `b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79` |
| `src/provider/runtime/schema.ts` | B2/W2 | 147,921 | `fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6` |
| `test/runtime-core/doc-format-specs-pin.test.ts` | B2/W2 | 19,754 | `f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003` |
| `test/门禁引擎/doc-format-specs-pin.test.ts` | B3/W3 | 33,709 | `45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369` |
| `src/pipeline/orchestration/run-role.ts` | B4a/W4a | 239,233 | `d754d767298de61b956b29e6fe8873640d53359765c9dfce45abc548f6003258` |
| `app/desktop/session.ts` | B4b/W4b | 728,423 | `df5bf7b0315410791e4c58a6c3e3caaac6f1d4312ff4751957d454e7a569fe14` |
| `test/桌面应用/session.test.ts` | B4b/W4b | 26,853 | `23bc19a723ef6c3c0c19259fee58179e779578ed6fbd726e6b094f1d8ef9085e` |
| `test/测试/doc-format-all-roles.test.ts` | B5/W5 | 35,241 | `d992b164fcd0e36d8eea0646d0736a3b5da08e16922d6e248d828a0de543b2e5` |

### 1.3 numstat / 行数（`03-numstat.txt`）

- tracked M：`app/desktop/session.ts` +32/−1、`src/model/runtime.ts` +36/−0、`src/pipeline/orchestration/run-role.ts` +20/−0、`src/provider/runtime/schema.ts` +26/−0、`src/provider/runtime/tools.ts` +95/−0 —— 与 W2/W4a/W4b 记录一致（git 的 CRLF 警告仅提示未来行尾归一，非内容差异）。
- 新文件行数（v1.1）：registry 2,294；编排测试 1,693（v1.0 为 2,291/1,672；与 W1 v1.1 §9.5 记录一致）；runtime pin 281；门禁 pin 678；桌面 session 588；测试跨角色 724。

### 1.4 聚合与 manifest（`02-candidate-hashes.txt`、`12-manifest-before.txt`）

- 组合候选聚合：v1.0 **`d08009461a8fffeeab662a6917b434972319c7f3d4a89560148562724d91b53c`**；**v1.1 终态 `bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（见文末增量节）。
- 分批聚合复算：B1 `d1ad1562…`、B2 `16a5fadf…`、B3 `2e9fb006…`、B4b `266f526d…`、B5 `6b1e4891…` 与记录值 **5/5 MATCH**。
- manifest（定义同聚合，覆盖 `git ls-files -co --exclude-standard -- src app test` = tracked 1,107 + 候选 untracked 6 = 1,113）：v1.0 `4535a943…` / 25,904,972 bytes；**v1.1 终态 `fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f` / 25,907,278 bytes**（列表 `81-v11-manifest-listing.txt`）。
- on-disk 辅助快照（含 ignored `app/renderer/dist/` 4 文件，共 1,117）：`5142fe1d09005e6f65bc6b770b8fe005862d37af39f13e7a6e788b9d2865d683`（`12b-manifest-disk-all-before-listing.txt`）。
- manifest 口径说明：本 D1 以 tracked+候选 1,113 文件为主口径（BASE-4 写集含 6 个新文件）；ignored `app/renderer/dist` 不属候选/写集，单列为辅助稳定性对照。

### 1.5 写集外 diff = 0（`04-write-set-external.txt`、`04b-write-set-external-object-check.txt`、`05b-package-config-status.txt`）

- `git status --porcelain`/`git diff --numstat` 对排除清单（`classify-shell.ts`、`run-manifest.ts`、`workflow-preconditions.ts`、`evidence-check.ts`、`boundary-*.ts`、`amendment-validate.ts`、`upgrade-validate.ts`、`app/renderer`、`optional-acceptance.test.ts`、`chief-workflow.test.ts`、角色卡顶层 role-card/boundary/api-spec）**全为空**。
- 权威内容对照 `git hash-object <path>` == `git rev-parse HEAD:<path>`：上述文件与 24 组角色卡三文件 + 21 个 api-spec **全部 SAME**。`app/renderer/**` tracked diff=0；`package.json`/`package-lock.json`/`electron-builder.yml`/`vite.config.ts`/`tsconfig.json` 状态为空（无新依赖/构建变更）。
- **CRLF 假象说明（如实）**：本 worktree `core.autocrlf=true`，磁盘上文本文件多为 CRLF，而 `git cat-file blob HEAD:` 输出为 LF；直接比较 raw SHA-256 会对未修改文件产生差异假象。本记录以 `git status/diff` + `git hash-object`（应用过滤器）为权威 no-change 判据；raw SHA-256 仅用于候选与批次记录（同为磁盘字节）比对。
- `test/桌面应用/chief-workflow.test.ts` 未修改（raw `87983bde4a21387d6b2e1b7a26c430efba73a3ccc92fe01d30cb3182c03ac494` = 团队计划 run T5 记录）。
- 全仓 tracked 修改仅：11 候选 + `docs/communication/memo.md`（并发外部写入，D1 开始前已存在，非本候选；不在 `src app test`）。`src app test` 无写集外 untracked（含 ignored dist 为既有构建产物）。

### 1.6 BASE-7/BASE-8（`05-base7-base8.txt`）

- `git cat-file -e HEAD:test/桌面应用/session.test.ts` 失败 ⇒ 基线**不存在**；删除提交 `4c24149`（`test(batch-D3): register D removals and evidence`，该文件 2,688 删除）；边界 `角色卡/桌面窗口/boundary.yaml:99`、`boundary.md:39` 始终列为单文件。本候选按「新建（恢复已删除路径）」处置，H1 delta=0，边界漂移见 W4b 记录 §5。
- 新文件目录均有既有边界条目：`角色卡/编排/boundary.yaml:80`（`src/common/编排/`）、`:83`（`test/编排/`）；`角色卡/运行时核心/boundary.yaml:47`；`角色卡/门禁引擎/boundary.yaml:37`；`角色卡/测试/boundary.yaml:7`；`test/桌面应用/session.test.ts` 单文件（桌面窗口 §1）。无新目录、无角色卡/边界修改。

### 1.7 共享文件区域核对（AC-16；`34-shared-file-diffs.txt`、`35-desktop-session-diff.txt`）

- `src/model/runtime.ts`：**恰 2 个 hunk**（`DocFormat*` 类型在 `ContractCheckFn` 之后；`GovernedToolsOptions.docFormat?`），+36/−0，纯加法；judge/团队计划 run 区域（DocFreeze*/D3/plan 相关）零触碰。
- `src/pipeline/orchestration/run-role.ts`：**恰 5 个 hunk**（类型 import、`AdapterCapabilities.docFormat?`、`openRoleSession` 输入、capabilities 透传、适配器工厂透传），+20/−0；`RoleSessionDeps` 未加字段。
- `app/desktop/session.ts`：6 个 hunk（类型 import 行扩写 −1/+1、数据源 import、`SessionManagerDeps` 镜像字段、注入闭包、输入对象属性、`docFormatText` 方法），+32/−1；judge 构造函数/有界 Chief 输入对象未改。
- 既有测试文件零修改（6 个测试文件全为新建）⇒ §4.3「旧断言改写」= 0 条，无删除/弱化既有断言；新文件无 `skip(`/`todo(`/`force-exit`/`process.exit`（`31-candidate-structure-grep.txt`）。

## 2. 受影响套件 before/after（BASE-3）

### 2.1 环境、命令与基线副本口径（如实）

- Node **v24.22.1**；worktree 根执行；`node --test --test-concurrency=1 …`；各套件**串行**运行，不并发。
- **before 基线副本**：`git -c core.autocrlf=false archive 3cd55dc` 到仓库外临时目录 `%TEMP%\d1-baseline-3cd55dc-v2`，并按 worktree 逐文件行尾复刻（沿用前序 D1 `2026-11-09_D1_team-plan-run-binding` §2.1 口径）：src/app/test 下 1,107 个 tracked 文件中 1,102 个直接复制 worktree 字节；5 个候选 M 文件由 HEAD blob 物化并按 worktree 行尾类转换（runtime.ts/tools.ts/schema.ts = CRLF；session.ts/run-role.ts = LF）；`node_modules` junction 只读复用；复制 `.env`；写入 worktree 形态的 `.git` 文件（内容指向不存在 gitdir，复现「`.git` 为文件」行为）。
  - 内容校验：5 个候选 M 文件「CRLF→LF 归一后 SHA-256 == HEAD blob」全部 MATCH；非候选抽查字节 SAME（`53-baseline-content-verification.txt`）；新文件在副本中不存在。
  - **作废口径**：首次尝试使用未做行尾复刻的 LF 副本，其 chief-workflow 运行在 63 条结果后不退出（与机器环境/行尾口径相关的挂起类）；该批单文件 before 结果整体移入 `superseded-lf-before/`（仅审计，不作证据）；权威 before 均为 v2 EOL 对齐副本重取。
- **after**：当前 worktree 候选本体（同一 HEAD/聚合/manifest）。
- 已知红参照（只作参照、不替代本 D1 重取）：提案卡修复 B1 v1.1 A.1–A.3（编排 22 fail/2 skip 集合、optional-acceptance 6/2/1/3/0、chief-workflow 59/47/12）、judge D1（runtime-core 540/503/33/4、门禁 453/447/5/1、编排 1133/1109/22/2）、团队计划 run D1（chief-workflow 63/50/13→66/51/15，编排 1139/1115/22/2、runtime-core 543/506/33/4、门禁 453/447/5/1）。
- 目录级 `test/桌面应用/**` 与 `test/测试/**` 采用**逐文件**运行 + 看门狗（120s / 300s），原因：两目录含已登记挂起文件（见 §2.6），整目录单进程会被挂起文件阻塞；逐文件口径使其余文件自然完成并取得完整计数（before/after 同一脚本同一口径）。`chief-workflow`、`optional-acceptance`、`session.test.ts` 单独运行（前两者有登记/BASE-3 命令，后者为本次新文件）。

### 2.2 受影响单文件 before/after（tests/pass/fail/cancelled/skipped；原件与 hash 见 §6）

| 套件 | before | after |
| --- | --- | --- |
| `test/编排/workflow-preconditions.test.ts` | 29/29/0/0/0，exit 0 | 29/29/0/0/0，exit 0 |
| `test/编排/run-manifest.test.ts` | 12/12/0/0/0，exit 0 | 12/12/0/0/0，exit 0 |
| `test/编排/evidence-check.test.ts` | 10/10/0/0/0，exit 0 | 10/10/0/0/0，exit 0 |
| `test/门禁引擎/boundary-yaml.test.ts` | 13/13/0/0/0，exit 0 | 13/13/0/0/0，exit 0 |
| `test/runtime-core/mcp-declarations.test.ts` | 6/6/0/0/0，exit 0 | 6/6/0/0/0，exit 0 |
| `test/桌面应用/run-pin.test.ts` | 20/9/11/0/0，exit 1（11 条基线红） | 20/9/11/0/0，exit 1（同名 11 条） |
| `test/桌面应用/rejection-copy.test.ts` | 17/17/0/0/0，exit 0 | 17/17/0/0/0，exit 0 |
| `test/编排/doc-format-specs.test.ts`（新） | 不存在（新建） | 24/24/0/0/0，exit 0 |
| `test/runtime-core/doc-format-specs-pin.test.ts`（新） | 不存在（新建） | 11/11/0/0/0，exit 0 |
| `test/门禁引擎/doc-format-specs-pin.test.ts`（新） | 不存在（新建） | 19/19/0/0/0，exit 0 |
| `test/桌面应用/session.test.ts`（新，恢复路径） | 不存在（`4c24149` 删除；边界仍列） | 7/7/0/0/0，exit 0 |
| `test/测试/doc-format-all-roles.test.ts`（新） | 不存在（新建） | 5/5/0/0/0，exit 0 |
| `test/桌面应用/optional-acceptance.test.ts` | 6/2/1/3/0，exit 1（not ok 1/4/5/6；`--test-timeout=6000 --test-reporter=tap`） | 6/2/1/3/0，exit 1（同名 4 条，diff 空） |
| `test/桌面应用/chief-workflow.test.ts` | 66/59/7/0/0，exit 1（66s 自然退出） | 66/50/16/0/0，exit 1（**权威 rerun** 70s 自然退出；首次 after 运行测试体完成 66/52/14 但进程停在 63 条结果后不退出，172s 后按看门狗口径终止、不作权威；after-only 9 项均经隔离复跑归因 ENOTEMPTY 族，见 §2.5/§2.6） |

### 2.3 目录级 before/after

| 套件 | before | after |
| --- | --- | --- |
| `test/编排/**`（107 文件；单个 node --test） | 1139/1115/22/0/2，exit 1（198s） | 1163/1139/22/0/2，exit 1（208s；+24 新用例全过） |
| `test/runtime-core/**`（59 文件） | 543/506/33/0/4，exit 1（49s） | 554/517/33/0/4，exit 1（48s；+11 新用例全过） |
| `test/门禁引擎/**`（41 文件） | 453/447/5/0/1，exit 1（98s） | 472/466/5/0/1，exit 1（106s；+19 新用例全过） |
| `test/桌面应用/**` 残余 57 文件（逐文件，120s 看门狗） | 605/530/75/0/0；watchdog 残段 3（`directive-decision` 1/0/1、`session-rebuild-race` 17/14/3、`stuck-redispatch` 7/4/3） | 605/529/76/0/0；watchdog 残段同 3 且逐字同数；集合 diff：after-only 1（`application-line` 事件顺序，隔离 3/3 pass）、before-only 0 |
| `test/测试/**`（before 113 / after 114 文件，逐文件 300s 看门狗；`customer-authorization-plane-integration` 单独 90s 看门狗） | 113 files **689/629/41/1/18**（19 个非零退出文件；`customer-auth-plane-integration` 90s 残段 1/0/1） | 114 files **695/635/41/1/18**（20 个非零退出文件；含新文件 `doc-format-all-roles` 5/5；`customer-auth-plane-integration` 90s 残段 1/0/1，与 before 同；after-only 3 项中 1 项确定性、2 项抖动；before-only 3 项为副本环境/原生崩溃，见 §2.4/§2.5） |

### 2.4 失败/skip 集合 diff

- 方法：同一解析脚本（`70-diff-suite.mjs`）从 before/after 原件提取失败与 skip 标题集合（去除时长与重复行），单文件套件整文件比较、逐文件套件按文件比较；输出见 `diff-*.txt`。
- 单文件：7 个既有套件 before/after 计数一致、**失败/skip 集合 diff 空**（run-pin 11 条同名；其余 0 失败）；`optional-acceptance` diff 空（4 条同名）；5 个新文件全绿（24+11+19+7+5 = 66 个新用例，0 skip，0 fail）；`chief-workflow` 权威 rerun：common=7、before-only=0、after-only=9（全部 ENOTEMPTY 清理竞争族，隔离复跑见 §2.5；`diff-chief-workflow.txt`）。
- 目录级：`编排` common=22 / before-only=0 / after-only=0、skip 2/2（`diff-dir-编排.txt`）；`runtime-core` common=33 / 0 / 0、skip 4/4（`diff-dir-runtime-core.txt`）；`门禁引擎` common=5 / 0 / 0、skip 1/1（`diff-dir-门禁引擎.txt`）。
- 桌面 rest（57 文件）：失败标题集合 common 一致；**after-only = 1**（`application-line`「申请直达：来源角色=rapporteur…」事件顺序 deepEqual：actual `presented,created,resolved` vs expected `created,presented,resolved`；隔离复跑 3/3 pass ⇒ 既有异步顺序抖动，提案卡 B1 v1.1 A.2 已登记该文件 2 pass/1 fail 基线）；**before-only = 0**；skip 0/0（`diff-dir-桌面应用-rest.txt`）。
- test/测试（114 文件）：common 失败标题（19 个既有红文件）前后一致；**after-only = 3**：① `governance-matrix-integration`「T1-20/21 …矩阵模块不被…导入」——**确定性**（全量与隔离复跑均复现；offender=`src/common/编排/doc-format-specs.ts` 导入 `model/governance-matrix.ts`，未在测试 `allowedConsumers`；**v1.1 已修复消除，见文末**）；② `2026-11-09_judge-delegated-effectiveness` 文件级（测试体本身 ✔ 66.8s，文件级 teardown 失败）——隔离 1/1 pass；③ `git-action-delivery-claude-e2e` 文件级——Node 原生 `CleanupQueue::Add` 断言崩溃（同一原生崩溃族；before 侧发生在 `git-action-commit-pi-e2e`），隔离 1/1 pass。**before-only = 3**：`git-action-commit-pi-e2e`（同一原生崩溃；after 通过）、Q30/Q74（before 副本缺未跟踪证据目录 ENOENT；after 通过）。新文件 `doc-format-all-roles` 5/5。skip 18/18（`diff-dir-测试.txt`）

### 2.5 隔离复跑（同一候选/同一环境）

- 方法：对 after-only 失败/新 skip 项，在同一候选 worktree 以 `--test-name-pattern "<标题>"` 隔离复跑（与全量运行同 Node/环境）；对登记挂起族另做 bounded（`--test-timeout=6000`）复跑。
- chief-workflow（after-only 9 项；权威 rerun 66/50/16）：`W10`（含 `unmanaged`）隔离 **5/5 pass**；`W20` **2/2 pass**；`W30`（连续写入后）**1/1 pass**；`W47 …忙Chief独立revise` **1/1 pass**；`W5 专字段`（含 `selected`/`commit-race`）**5/7**，2 失败原文均为 `ENOTEMPTY: directory not empty, rmdir …\ans`；`W28 …stop 拒绝` 隔离 **0/1**，失败原文同为 `ENOTEMPTY`（清理竞争，非断言失败）。⇒ 9 项均归因 Windows 临时目录清理竞争族（与提案卡 B1 v1.1 A.2、团队计划 run D1 §2.4 同族登记），不构成新增确定性失败。
- 桌面 rest after-only：`application-line` 隔离复跑 **3/3 pass**（1s）⇒ 非确定性抖动，非候选引入。
- test/测试 after-only 3 项（同候选隔离复跑）：`governance-matrix-integration --test-name-pattern "T1-20/21"` **0/1 fail（确定性复现，offender=doc-format-specs.ts；v1.1 已消除）**；`judge-delegated-effectiveness` **1/1 pass**（67s）；`git-action-delivery-claude-e2e` **1/1 pass**（94s）⇒ 2 项归因抖动/原生崩溃，1 项为确定性新增失败（见 §0/§2.4）

### 2.6 已知挂起文件与残段（如实）

- 登记来源：B0 基线（`2026-11-08_session-admission-approval-B0-baseline.md` §6.2）登记 6 个挂起文件，其中 4 个在本 D1 范围：`test/桌面应用/directive-decision.test.ts`、`test/桌面应用/session-rebuild-race.test.ts`、`test/桌面应用/stuck-redispatch.test.ts`、`test/测试/customer-authorization-plane-integration.test.ts`；本 D1 未使用 force-exit，以看门狗终止（exit 124）并记录 SIGTERM 前 reporter 残段。
- before（120s 看门狗）：`directive-decision` 残段 1/0/1（与 B0 90s 残段同构）、`session-rebuild-race` 17/14/3、`stuck-redispatch` 7/4/3（后两者与 B0 90s 残段逐字同数）。
- after：directive-decision EXIT 124 / 121s，残段 **1/0/1**；session-rebuild-race EXIT 124 / 120s，残段 **17/14/3**；stuck-redispatch EXIT 124 / 120s，残段 **7/4/3**（三者与 before/B0 逐字同数）；customer-authorization-plane-integration（test/测试，90s 看门狗）after 残段 **1/0/1**，与 before 同
- bounded 对照（`--test-timeout=6000 --test-reporter=tap`，同一文件、同一候选/副本）：before `directive-decision` 8/2/2/4/0、`session-rebuild-race` 18/14/3/1/0、`stuck-redispatch` 10/6/3/1/0（均 exit 1）；after `directive-decision` 8/2/2/4/0、`session-rebuild-race` 18/14/3/1/0、`stuck-redispatch` 10/6/3/1/0（与 before **逐项全等**）
- **chief-workflow 一次性挂起（如实）**：after 首次运行测试体完成并打印完整 summary（66/52/14），但进程停在 63 条结果后持续自旋不退出（CPU 121s/墙钟 172s）；按看门狗口径终止（未 force-exit），该次不作权威。同候选 rerun **70s 自然退出**（66/50/16），作为权威 after；before 运行 66s 自然退出（66/59/7）。与前序 D1（`2026-11-09_D1_team-plan-run-binding` §5-2）登记的同类一次性挂起同构，归因环境/清理竞争，非候选确定性行为。
- 判定口径：挂起文件不在本变更写集（`git hash-object` == HEAD blob），两侧同口径残段/超时对称或 bounded 集合一致 ⇒ 不构成新增确定性失败；不以残段冒充通过。

## 3. TM-1–TM-14 映射（证据锚点取自候选 after TAP 与源码/D1 实测）

| TM | 证据（文件：用例标题；after 计数见 §2） | 关键观察 |
| --- | --- | --- |
| TM-1 | `test/编排/doc-format-specs.test.ts`：①「冻结 id 清单：54 个（A25+B29）deepEqual、唯一、一行一 id、三处数量一致」②「每个 spec 具备 title/audience/stage/pathPattern/validator/specRevision…」③「B 组 29 行与 A14 均有 testSeam」④「预算：索引 ≤8192 B；每 spec 每 part ≤8192 B；首行/末行提示固定」⑤「模块纯数据：源码不 import node:fs / app/ / service/，不写盘」⑥「未知 id：纯文本、回显 ≤40 字符、可用 id 列表、非字符串不抛」；D1 独立实测 `32-registry-budget-independent.txt` | 54 id（A25+B29）；索引 5,223 B；最大详情 4,089 B（`project-roster/v3`）；30 个 spec 有 testSeam；纯数据 |
| TM-2 | 同文件：「A 组样例正例：A1–A13、A17–A21 经真实 parser/validator 通过」「A14 严格层按 seam 钉住…不宣称纯校验器正例」「B 组 exported-pure 逐行直接调用导出校验器」「B 组 public-path-fixture：B2/B3/B17/B25/B27/B28 临时项目根」「B 组 text-shape：源码文本钉住…残余风险披露」 | 样例即测试输入；A14 不冒充纯校验器；B 组按 seam 分类执行 |
| TM-3 | 同文件：「字段变异矩阵（数据驱动）：validator 字段 删除/null/类型/枚举 按 presence 断言」「分层断言：A1 gate/pin、A2 substring 层、A3/A4 多路径层、A14 strict/display」「条件/专项负例：A2 intent 删除、A3 path+paths 缺失、A6 正文、A10 modify 缺 from、A19 条件目录缺 condition」 | 18 个 A 组可执行 spec、113 个 validator 字段、9 个枚举字段（W1 §5）；按层差异显式 |
| TM-4 | 同文件：「overclaim guard：每个 convention 字段的违反值仍被真实校验器接受（或显式豁免理由）」 | 34 个 convention 字段反证或显式豁免（W1 §5.2） |
| TM-5 | 同文件：「schema 字面量全仓扫描：src/**/*.ts 的 xxx/vN ∈ schemaLiteral ∪ 规范 id ∪ 显式白名单（含理由）」；实现含 `SCHEMA_WHITELIST` 理由必填、A14/B29 不得靠白名单（源码 `:1290-1311`） | 全仓扫描；白名单含理由 |
| TM-6 | 同文件：「modules/roster/topology 详情复用 contractSchemaText 原文并带来源说明；render 型 part 整段返回」「intent-entry 详情复用模板/命名/ID 规则；A13 正例为填充样例（非占位符模板）」；`test/编排/workflow-preconditions.test.ts` 原样 29/29 | 单一事实来源；既有 contract topic 断言不改 |
| TM-7 | `test/门禁引擎/doc-format-specs-pin.test.ts`（19 用例，import `ROLE_CARD_REQUIRED_SECTIONS`/`boundary-yaml`/`boundary-core`/`CONDITION_SLUG_PATTERN`/MCP 读取器；私有常量以源码字面量断言）+ `test/runtime-core/doc-format-specs-pin.test.ts` 用例「MCP 声明：七键/保留名/环境名/状态与 mcp-declarations.ts 私有常量交叉钉住」 | 私有常量不新增导出；owner pin 交叉断言 |
| TM-8 | `test/编排/doc-format-specs.test.ts`：「稳定 code 扫描（按 code 族，含非后缀成员）∈ spec commonErrors/loadChecks ∪ 白名单（含理由）」；实现 `CODE_WHITELIST` 理由必填（源码 `:1315-1367`） | 166 个命中 code 全登记（W1 §5.2）；`modules-doc-*` 10 个全收录 |
| TM-9 | 同文件：三组加载级负例（roster-*/modules-doc-*/run-pin-*；plan-*/criteria-*/evidence-*/trunk-amendment-*；role-card-section-missing/boundary-md-yaml-mismatch 与 review-quality-* 残余披露）+ MCP 声明负例 + 覆盖核对（每个 loadCheck code 复现或显式豁免） | 稳定 code 逐族复现；残余豁免含理由 |
| TM-10 | `test/门禁引擎/doc-format-specs-pin.test.ts` 全 19 用例：A17 10 章节逐项/逐章节缺失 ⇒ `role-card-section-missing:<label>`；三文件路径正负例；A18/A19 私有常量冻结、严格 YAML 负例、boundary.md↔yaml 恒等四负例、archived/role 标签/范围负例；A21 七键/正负例；既有片段只读 | 正例通过、负例断稳定 code；展示解析差异如实披露 |
| TM-11 | `test/runtime-core/doc-format-specs-pin.test.ts` 全 11 用例：扁平 schema/无顶层 union、注入才注册、正常/未知/非字符串/数据源 null·空·抛错、扁平输入+metadata、`tools/list` 形状、`toPiTool` 同源非空、MCP 声明、预算与截断 | 工具契约逐项钉住；未注入 ⇒ 无工具 |
| TM-12 | `test/桌面应用/session.test.ts` 7 用例：注入矩阵（6 内置 + 项目角色）、注入才注册、静态早退（spy 零 getListing/refresh/文件 IO）、工具层真实会话内（未知 ok:false/非字符串/part/legacy contract_check）、legacy 无 topic 事实路径、judge/有界不变、预算 pin；D1 源码审读 `session.ts:3886-3896/4385-4389/10441-10444` | 6+1 会话注册；`docFormatText` 第一条语句静态早退；judge/有界工具集逐字不变 |
| TM-13 | `test/测试/doc-format-all-roles.test.ts` 5 用例：8/8 注册矩阵（6 内置 + 旧 su + 动态项目角色）、注入才注册（动态项目角色）、judge/有界隔离（即便提供 docFormat 也不注册）、全角色同一静态索引且零 IO/无事实、8 角色 × 5 次真实轮次可调用（40 次）；D1 侧 `32-registry-budget-independent.txt` | 注册 ≠ 真实读取；动态项目角色不依赖技能登记；无额外落盘/事件 |
| TM-14 | 本 D1：§2 before/after（单文件 + 目录级 + 逐文件）；失败/skip 集合 diff；隔离复跑；§4 `npm run typecheck` | 新增确定性失败/新 skip 判定见 §0/§2.4 |

- 另：`git diff` 审读确认 `app/desktop/session.ts` 的 `docFormat` 注入位于 `openRoleSession` 输入对象（`:4385-4389`），judge 会话工厂与有界 Chief 构造点（`chiefDecisionContext` 独立输入对象）无 `docFormat` 键（`34-shared-file-diffs.txt`、`35-desktop-session-diff.txt`），与 TM-12 用例 6 互证。

## 4. 静态门

- `npm run typecheck`（`tsc --noEmit`；tsconfig include `src`/`test`/`app`，既有 exclude `app/renderer`）：**exit 0**（before 副本与 after 候选均 exit 0；各 43 bytes）；日志 `after-typecheck.txt`（候选）与 `before-typecheck.txt`（基线副本）。
- `typecheck:renderer` / `build:renderer`：**N/A**。依据：本变更 `app/renderer/**` diff=0（§1.5）、未改构建配置；`app/desktop/session.ts` 已被 `npm run typecheck` 覆盖（W4b/B4a 记录同口径）。
- 候选 diff 无 `skip(`/`todo(`/`--test-force-exit`/`process.exit` 新增（`31-candidate-structure-grep.txt`）；既有测试文件零修改（§1.7）⇒ 旧断言改写 = 0。

## 5. 限制与披露（如实）

1. **基线副本口径**：before 为 `git archive` 纯净副本 + 逐文件行尾复刻 + node_modules junction + fake `.git`；首次 LF 副本尝试作废（`superseded-lf-before/`），权威 before 为重取。
2. **已知挂起文件**：`directive-decision`、`session-rebuild-race`、`stuck-redispatch`（桌面）、`customer-authorization-plane-integration`（test/测试）为既有登记挂起（B0 2026-11-08 §6.2，90s 口径）；本 D1 两侧同口径运行、残段/超时对称，文件 diff=0；另以 `--test-timeout=6000` 两侧复跑对照（四文件两侧残段逐字同数；bounded 前后 3/3 全等）。不宣称这些文件本候选全绿。另有 `chief-workflow` 一次性挂起（测试体完成、进程不自退）已按前序 D1 口径终止并同候选复跑取权威（§2.6）。
3. **副本环境差异（如实、不影响候选判定）**：① `test/测试/git-role-workflows-e2e.test.ts` Q30/Q74 在 before 副本因写入**仓库相对未跟踪证据目录**（`角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`，不在 git archive）而 ENOENT 失败；worktree（after）存在该目录 ⇒ 通过。② `test/测试/git-action-commit-pi-e2e.test.ts` before 出现一次性 Node 原生 `CleanupQueue::Add` 断言崩溃（与 E3 2026-11-08 已登记的 Node v24.22.1 原生崩溃族同构），after 通过。③ `test/桌面应用/application-line.test.ts` after 一次事件顺序抖动（隔离 3/3 pass；提案卡 B1 v1.1 A.2 已登记该文件基线 2 pass/1 fail）。以上均计为环境/抖动，不计新增确定性失败，详见 §2.4–2.6。
4. **A14 严格层 / B 组 text-shape 残余**：无导出纯校验器的行为按源码文本/形状钉住（B1 R-8、方案 §9.2），残余「测试通过但校验器另有分支」风险；本 D1 不宣称纯校验器正例。
5. **render 型 part 不细分**、**约定类仅约定**、**索引/详情预算** 5,223 B/4,089 B 由 D1 独立实测复现（`32-registry-budget-independent.txt`），非仅引用批次记录。
6. **并发外部写入**：`docs/communication/memo.md` 的 M 为调度方并发更新（D1 开始前已存在），不在 `src app test`，不影响候选/manifest/任何套件结果。
7. **证据层级**：本 D1 只覆盖确定性层（L1–L5）；不覆盖 RR 真实运行（AC-12/AC-13/AC-14 另阶段），不以注册/确定性证据冒充真实模型读取。
8. **模型/端口**：未运行真实模型/Electron/CDP；未占用 9222/9223；未触碰贪吃蛇目标。
9. **测试运行的既有副作用（如实）**：`test/测试/git-role-workflows-e2e.test.ts` 按既有设计向仓库相对未跟踪目录 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/` 写入 Q30/Q74/Q36 等探针 JSON（本角色目录、untracked、不在 `src app test`，不影响候选/manifest）；`docs/communication/memo.md` 的 M 为调度方并发写入（D1 前已存在）。`src app test` 无写集外新文件（`16-final-workspace-audit.txt`）。
10. **本记录只取证、不判验收**；未提交/推送/合并/发布；未修改任何产品/测试/角色卡/其它文档（只写本角色 docs/change 证据）。

## 6. 证据目录（`2026-11-09_D1_document-format-specifications-evidence/`）

全量逐文件 SHA-256 索引：`07-evidence-sha256.txt`（自 hash 053681a08351f79bb81b04352d00fa0563ad64701b85b7ddb1ad86a75f09485e）。关键原件：

| 类别 | 文件 |
| --- | --- |
| 环境/候选 | `00-context.txt`、`01-candidate-status.txt`、`01b-full-status-and-diffstat.txt`、`02-candidate-hashes.txt`、`03-numstat.txt`、`06-candidate.diff`、`13-status-midrun.txt` |
| 写集外/边界 | `04-write-set-external.txt`、`04b-write-set-external-object-check.txt`、`05-base7-base8.txt`、`05b-package-config-status.txt` |
| manifest/稳定性 | `12-manifest-before.txt`、`12-manifest-before-listing.txt`、`12b-manifest-disk-all-before-listing.txt`、`14-manifest-after.txt`、`14-manifest-after-listing.txt`、`14b-manifest-disk-all-after-listing.txt`、`15-final-snapshot.txt` |
| 基线副本 | `50-build-baseline.mjs`、`51-baseline-overlay.txt`、`53-baseline-content-verification.txt` |
| before | `before-*.tap.txt`、`20-before-singles-summary.txt`、`21-before-desktop-special-summary.txt`、`before-dir-*.tap.txt`、`62-before-desktop-rest-analysis.jsonl`、`63-before-key-analyses.txt`；作废批 `superseded-lf-before/` |
| after | `after-*.tap.txt`、`after-dir-*.tap.txt`、`66-after-desktop-rest-analysis.jsonl`、`67-after-desktop-rest-summary.txt`、`68-after-test-dir-analysis.jsonl`、`69-after-testdir-summary.txt`、`23-after-hang-specials-summary.txt`、`15-final-snapshot.txt` |
| 集合/diff | `70-diff-suite.mjs`、`diff-*.txt`、`61-before-编排-analysis.json`、`61-before-runtime-core-analysis.json` |
| 隔离复跑 | `iso-chief-*.tap.txt`、`iso-application-line.tap.txt`、`iso-testdir-*.tap.txt`、`71-isolation-chief-summary.txt`、`73-isolation-testdir-summary.txt` |
| 静态门 | `before-typecheck.txt`、`after-typecheck.txt` |
| 注册表实测 | `32-registry-budget-independent.txt`、`32b-registry-ids.txt`、`31-candidate-structure-grep.txt`、`30-new-test-titles.txt` |
| 批次证据抽查 | `60-batch-evidence-spotcheck.txt`、`64-batch-evidence-spotcheck-2.txt` |
| v1.1 增量（2026-11-10） | `10b-verify-candidate-v11.mjs`、`80-v11-candidate-hashes.txt`、`81-v11-manifest-listing.txt`、`82-v11-manifest-and-budget.txt`、`84-v11-writeset-external.txt`、`85-v11-import-graph.txt`、`86-v11-quick-diffs.txt`、`89-v11-registry-reference-graph.txt`、`v11-*.tap.txt`、`v11-dir-*.tap.txt`、`v11-diff-dir-*.txt`、`15b-v11-final-snapshot.txt`、`87-update-record-v11.py`、`88-append-v11-section.py`、`91-finalize-v11.py` |
| 作废/审计 | `superseded-lf-before/`（首次 LF 副本 before 尝试，非权威） |

## D1 v1.1 增量复验（2026-11-10，修复后终态）

- **触发**：v1.0 唯一新增确定性失败（`test/测试/governance-matrix-integration.test.ts` T1-20/21，`doc-format-specs.ts` 导入 `model/governance-matrix.ts`，见 §2.4/§2.5）由编排修复；修复记录 `角色卡/编排/docs/change/2026-11-09_W1_document-format-specifications.md`（170 行 / 21,097 B / `c6f9e90f7a4bca9c1724703c8ed749d849717e43f997b1ee56b40cfd6970ddea`）§9。
- **修复内容（D1 实测复核）**：删除 `GOVERNANCE_MATRIX_SCHEMA` import（模块内无该 import/常量引用）；B18 `schemaLiteral:"governance-matrix/v1"` 唯一字面量 + `schemaLiteralNote` + 注释（`:1852-1861`）；`test/编排/doc-format-specs.test.ts:849` 新增「TM-1/AC-3 pinned-literal 例外」用例（无 import/常量、字面量与 model 公共常量源码值相等、其它 21 个公共常量仍 import）。**文档瑕疵（如实）**：W1 记录 §2 的「公开常量直接 import」列表仍含 `GOVERNANCE_MATRIX_SCHEMA`，与 §9 修复说明不一致（仅文档陈述；以 §9 与候选 hash 为准；D1 不修改他角色文档）。
- **候选 v1.1 冻结**：11 项同集合；**11/11 raw SHA-256 全等**（9 文件对原批记录 + 2 文件对 W1 v1.1 §9.5：`doc-format-specs.ts` 2,294 行 / 100,605 B / `3c0c9c63…`；测试 1,693 行 / 101,313 B / `54e5b01a…`）；组合聚合 **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**；B1 两文件聚合 `f6d4475c…` 与修复记录 MATCH；manifest **1,113 文件 / 25,907,278 bytes / `fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**（on-disk 1,117 / `b2bb60d6…`）；status 11、staged 0、HEAD/tree/分支不变；写集外 diff=0（排除清单空、hash-object spot SAME、无新依赖）。
- **重跑（同候选、串行）**：`doc-format-specs` **25/25**；`governance-matrix-integration` **18/18**（v1.0 17/18 → 失败消除）；`runtime pin` 11/11；`gate pin` 19/19；`desktop session` 7/7；`all-roles` 5/5；`rejection-copy` 17/17；`run-pin` 20/9/11（11 同名基线红，diff 对 before 空）；`optional-acceptance` 6/2/1/3/0（4 同名，diff 空）；`npm run typecheck` **exit 0**。目录重跑（同一 node --test 命令）：`编排` **1164/1140/22/0/2**（exit 1，200s；+1 新 pinned-literal 用例，22 fail/2 skip 与 before 同名同数，diff 空）；`runtime-core` **554/517/33/0/4**（exit 1，49s；diff 空）；`门禁引擎` **472/466/5/0/1**（exit 1，107s；diff 空）。日志见 `v11-*.tap.txt` 与 `v11-dir-*.tap.txt`。
- **其余套件复用依据（逐文件 diff 依据）**：① 11 文件中仅 2 文件变更（其余 9 hash 与 v1 相同，`80-v11-candidate-hashes.txt`）；② 生产侧仅 `src/provider/runtime/tools.ts`（`docFormatKnownIds`）与 `app/desktop/session.ts`（`docFormatIndexText`/`docFormatSpecText`）消费注册表，二者 hash 未变（`89-v11-registry-reference-graph.txt`）；③ 索引文本逐字节不变：`docFormatIndexText()` 仅渲染 id/title/audience，B18 这些字段未变、54 id 不变（re-measure 5,223 B）；④ 仅 B18 详情文本新增一行 `schema 说明：…`（`schemaLiteral` 值与旧 import 常量相同，均为 `governance-matrix/v1`）；⑤ `test/测试/**` 与 `test/桌面应用/**` 中引用注册表文本/id 的文件仅 `doc-format-all-roles` 与 `session.test.ts`（均已重跑），`governance-matrix-integration` 为导入扫描（已重跑）；其余文件仅经未变的 tools.ts/session.ts 桥接且不断言注册表文本 ⇒ v1 的 desktop rest 605/529/76 与 test/测试 695/635/41/1/18 结果对本终态继续成立；B18 详情文本的消费断言均由注册表自身输出对照（自洽）。
- **判定（v1.1）**：新增确定性失败 **0**（v1.0 的 1 项已消除；本轮重跑无新增）；新 skip **0**（重跑套件 skip 与 v1 一致）；已知红不恶化（run-pin 11、optional 4、三目录集合 diff 空）。
- **结论**：D1 层面可进入 RR（不构成验收判定；B2 仍按 B1 v1 判定）。

**（完）**
