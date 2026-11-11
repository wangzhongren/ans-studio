# 变更记录：B5 测试/真机前确定性验证（两条固定工作流路径，T3，2026-11-10）

- 任务节点：**B5**（团队计划 §五 B5/D1 行；B1 验收 AC-28/AC-29、T-01…T-20、EV-02/EV-03/EV-04）
- 角色：测试（独立固定上下文；**只取证/写本角色写集，不判验收**）
- 日期：2026-11-10
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 分支/HEAD：`feat/two-fixed-workflow-paths` / `e645e4e`（B0–B4.2 实现提交；本批不改提交）
- 写集：`test/测试/fixed-path-full-chain.test.ts`（新）、`test/测试/mode-switch.test.ts`（新）、
  `test/测试/b-change-scope.test.ts`（新）；本记录 + `_evidence/`
- 纪律：**不提交/推送/合并/发布**；不改 `src/**`/`app/**`/`角色卡/**`/文档；不新增依赖；不改既有断言；
  不新增 skip/force-exit；不启动真实 Electron/模型/RR；不占用 9222/9223。

## 0. 结论摘要（先读）

1. **两条固定路径的确定性链路可在宿主驱动下走通**（T-16 机械层）：
   - 路径 A（空项目→3 卡→激活→基线→A11 真实 Git 提交→A12 归档→merge-main 客户本人→`workflow.closed delivered`）
     与路径 B（既有仓库→B1→B2 scope→B3 写集/真实提交→B4 发布（不要求 A12b）→delivered）均由
     `test/测试/fixed-path-full-chain.test.ts` 全链覆盖（假会话 + 真实应用服务/账本 + 真实临时 Git）。
2. **发现 3 个阻塞生产接线的缺口 + 1 个 D1 候选回归（B5 只报告，不改产品代码；RR/B2 前须由 owner 修复）**：
   - **G-B5-1（AC-08/AC-09 阻塞）**：`workflowService.recordStageDispatch` **无生产调用点**——
     桌面 `routeFixedPathDispatch` 对 A1/A4/A7/A8/A12a/A12b 的直接派发只写 `task.created`，不写
     `stage.dispatched`。后果：A12a 恒为 `pending` ⇒ 幕僚发 A11 stage-request 被 AC-09 门
     `stage-transition-invalid` 拒绝；A12b 永无在办状态 ⇒ A12/A13 不可达；A1/A4/A7 也只在收口时
     才完成（偏离 AC-08「完成于目标任务创建」）。Owner：桌面窗口（路由接线）/编排（服务接线）。
   - **G-B5-2（路径 B 阻塞）**：`workflowService.recordChangeScopeDecision` **无生产调用点**——
     B2 `change.scope-decided` 无写入者 ⇒ 路径 B 的 B2 永不完成、B3 派发被
     `b-change-scope-invalid` 拒绝。Owner：编排/桌面窗口（B2 记录入口未接线）。
   - **G-B5-3（路径 A 卡点）**：fixed proposal 卡（A6）**无 `stage.requested A6` 在办写入者**
     （run-role 只写 A3/A10）⇒ 方案卡 accept 不产生 `stage.completed A6`（桌面 handler 要求
     `view.stage==="A6"`）⇒ A7 stage-request 被 `stage-transition-invalid` 拒绝。Owner：桌面窗口/编排。
   - **G-B5-4（D1 候选回归，非 B5 引入）**：i18n 硬编码守卫失败——`app/desktop/workflow.ts:20` 与
     `app/desktop/workflow-git.ts:32` 的 import 路径含中文目录 `编排`，两文件未加入
     `test/项目管理/shared/i18n-guard-allowlist.ts`（既有 app/desktop 引用方均在 allowlist）。
     B1 基线（10f90c7）守卫为绿；该失败由 B1/B3 桌面新增文件引入，B1 §二 known-red 未列。
     Owner：桌面窗口（补 allowlist 或改中性 import）。B5 不改产品代码。
   证据与复现：`_evidence/gap-*.txt`（§4）。
3. **本测试以「宿主 glue」显式替代上述三处缺失接线**（调用同一导出应用服务/同一事件形状），
   以保证全链机械验证可执行且可复现；**不把缺口当作已修复**，RR-02/RR-03 仍阻塞。见 §3/§8。
4. **D1**：`npm run typecheck` exit 0；受影响域 `test/测试` before 116 文件 **703/646/38/1/18**
   → after 119 文件 **711/654/38/1/18**（新增 8 tests 全绿；失败名集合 diff **空**；新 skip=0）；
   known-red 域复跑：编排 24/24、门禁 5/5、runtime-core 33/33 **逐名一致**，桌面 8 条差集全部属
   已登记非确定/挂起套件 ⇒ **新增确定性失败 = 0、已知红不恶化**；另发现 **G-B5-4**（项目管理
   i18n 守卫 1 红，B1 基线为绿、非本批引入；见 §4）。逐名证据见 §5/§6b 与 `_evidence/`。
5. 写集外 diff=0（`git status --porcelain -- src app test` 仅 3 个新测试文件）；未提交声明见 §9。

## 1. 依据绑定（实测）

| 依据 | 路径 | 实测 SHA-256 |
| --- | --- | --- |
| B1 验收标准（冻结） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |

## 2. 候选（本批新增文件）

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `test/测试/fixed-path-full-chain.test.ts` | 1,125 | 71,800 | `0c1530b79b6ba8cff4bd08d3dc7e4a0ed0e69c13f1c458627d472328d56ff80a` |
| `test/测试/mode-switch.test.ts` | 284 | 16,631 | `b38596b8b886c86111f2102d5be17cc0c53ae58ca4eb83e97c7f25df1addeca2` |
| `test/测试/b-change-scope.test.ts` | 420 | 24,601 | `a7f97744e23a05d0b26383ca3f7247aa512dec28355f03a15eff067c000e4d31` |

- 候选聚合（上述 3 文件 `<raw_sha256>  <path>` 行 `LC_ALL=C sort` 后 SHA-256）：
  **`d80d180084b84885e23d2a92dc53f450509e7b87a92ae722222ae8e265e2669a`**。
- 基线 `git status --porcelain -- src app test` 在本批开始前为空；本批结束仅 3 个新测试文件（写集外 diff=0，§9）。
  工作树中其它 `M`/未跟踪项（如 `角色卡/chief-code/**`、`.pr-body-*`）为**本批开始前既存**的其它角色/会话
  产物，不在 B5 候选内（B5 候选 = 上述 3 文件 + 本记录/证据）。

## 3. 全链覆盖（T-16）与宿主 glue 披露

`test/测试/fixed-path-full-chain.test.ts`：

- **路径 A**（假会话 + 真实服务/账本/Git）：空项目 → 幕僚首 stage-request（首次 fixed 启动写
  `.ans/project.json workflowSchema`，保留既有键）→ 运营派产品（Q6 绑定真实受派 open stage-request）→
  意图（A2 收口 + 文档证据）→ 意图卡（客户 confirm；`documentRefs[intent]`+version+marker）→
  运营派策划 → 方案/模块/名单/架构（A5 收口 + 四文档证据）→ 方案卡（客户 accept；五件 documentRefs）→
  派人事 → 建卡/激活（`role.activated`；A8 完成）→ 团队计划 + 基线 3 件小事（`complete_team_plan` v4 +
  真实 `BaselineGitPort`：`git init -b main`/`.gitignore` 托管块/baseline commit/任务分支/basis 文档 hash）→
  任命卡（客户确认；`source:"stage-a10"`/`workflowId`；无 legacy roster 戳）→ A12a criteria（A11 前）→
  A11 stage-request → 运营派实现 → **taskGitScope（团队计划 writesets）** + shell v5 允许/拒绝断言 →
  真实 `git add` + 临界区 `git diff --cached` + `git commit` → A11 收口（分支 tip）→ A12b report +
  应用 `archiveAcceptance`（`docs/acceptance/snake-acceptance-v1.md`，report/criteria hash+幂等）→
  A12b accepted（归档证据）+ A12 聚合 → `runFixedReleaseMerge`：`merge-main` 应用自有非判断卡
  （`governanceCardGroup===undefined`、preview 字段齐全）→ 客户本人 approve →
  `release.requested→confirmed(by customer)→merged`、`stage.completed A13`、`workflow.closed delivered`、
  工作区停在 main（无 push/tag/remote）；**judge 确认尝试 ⇒ `release-unauthorized`、不写 confirmed/merged**
  （judge 不可代批）；重复发布 ⇒ `release-already-merged` 且不重复卡。
- **路径 B**：既有 Git 仓库 → B1（应用最小准备：`basis.recorded(reason:"path-b")` 只读快照、从当前
  HEAD 建任务分支、不写团队计划、不弹卡）→ B2 scope（宿主 glue，见下）→ B3（写集 = scope ∩ roster
  属主；越界 staged 提交被 `git-staged-outside-writeset` 拒绝；合法 add/commit 真实执行）→
  B4 发布（**不要求 A12b/归档**，运营报告在案）→ merge-main 客户确认 → delivered。
- **路径 B 无仓库**：`b-repository-required`（不自动 `git init`；零任务/零 basis/零卡）。
- 账本不变量：三本新账本事件/幂等；`.ans/trunk`/`.ans/runs` 未被新路径写入；治理文档/角色卡/.ans
  不入 Git；3 张确认卡各一次 + 1 张 merge-main，无 acceptance 卡/无额外客户门。

**宿主 glue（生产接线缺失；G-B5-1/2/3）**：测试在真实 `task.created` 后调用
`recordStageDispatch`（A1/A4/A7/A8/A12a/A12b）、在 A6 前按 run-role A10 同构写
`stage.requested A6`、在 B1 后调用 `recordChangeScopeDecision`。三处均为**已导出的应用服务/合法事件**，
不是产品代码修改；全链测试因此验证「机制可通」，但**不能**替代对生产接线的验收（RR 阻塞）。

## 4. 缺口（阻塞；交 owner）

见 §0-2。证据（`_evidence/`）：

| 证据 | 说明 |
| --- | --- |
| `gap-a12a-projection.txt` / `probe-a12a-gap.mjs` | 桌面直派 A12a 后投影仍 `pending`；A11 stage-request 被 AC-09 门拒绝（`stage-transition-invalid`） |
| `gap-a6-marker.txt` | 代码检索：`stage.requested A6` 无生产写入者（`grep` 结果）；run-role 仅 A3/A10 |
| `gap-b2-writer.txt` | 代码检索：`recordChangeScopeDecision` 无生产调用点（`grep` 结果） |
| `gap-chain-host-glue-a.txt` / `gap-chain-host-glue-b.txt` | 宿主 glue 下 A/B 全链探针输出（用于证明机制可通，与缺口区分） |
| `d1-domains/tap-failing/test_项目管理_shared_i18n-guard.test.ts.tap` | G-B5-4：i18n 守卫两条违规（`app/desktop/workflow.ts:20:49`、`app/desktop/workflow-git.ts:32:26` 含 `编排`） |

**修复清单（交 owner；B5 不改产品代码）**：

1. 桌面窗口（`routeFixedPathDispatch`）：非 stage-request 的 fixed `task.created` 写入后，按真实
   taskId/stage 调用 `workflowService.recordStageDispatch`（至少 A1/A4/A7/A8/A12a/A12b；A11 已由
   `requestStage` 记录，勿重复）；须与任务创建幂等（同 taskId 重复调用 replay）。
2. 桌面窗口/编排（fixed 卡通道）：呈 proposal 卡（A6）前按 A10 同构写 `stage.requested A6`
   （requestTaskId/幂等键确定性），使 accept 后 `stage.completed A6` 合法。
3. 编排/桌面窗口（B2）：为「幕僚范围决定」提供应用入口（例如 B3 stage-request 受理时由应用解析
   impactReport+scope 并调用 `recordChangeScopeDecision`）；模型不得自报 scope/hash，应用重算。
4. 桌面窗口（G-B5-4）：把 `app/desktop/workflow.ts`、`app/desktop/workflow-git.ts` 加入
   `test/项目管理/shared/i18n-guard-allowlist.ts`（有序、带理由），或改中性 import；恢复 B1 基线绿。
5. owner 修复后：B5 复跑 `test/测试/fixed-path-full-chain.test.ts`（移除 §3 宿主 glue）、
   `test/项目管理/shared/i18n-guard.test.ts` 与真机 RR-02/RR-03。

## 4b. 实现口径观察（非阻塞；供 owner 设计对齐）

- **A1/A4/A7「完成于任务创建」依赖 recordStageDispatch**：`closeTask` 按 `task.created.stage` 记
  `stage.completed`，单一生产任务无法同时完成 A1（创建时）与 A2（收口时）；B5 全链因此采用
  「受理任务（stage A1/A4/A7）+ 工作/激活任务（stage A2/A5/A8）」的两次派发序列（宿主 glue 记
  A1/A4/A7 派发）。若 owner 按 G-B5-1 接线 `recordStageDispatch`，建议同时明确 A1/A2 的任务/阶段归属，
  避免真实运营把这理解为「每阶段派两次」。
- **A8 在办来源**：本链在同一 open A7 stage-request 下派发 stage A8 激活任务（`applyTaskHints` 将 A8 置
  `dispatched`）；`activate_role_documents` 只要求 A8 在办，未要求 A8 自身 stage-request。该路径可用，
  但 v1.3 §4.2 表格未明示；建议 owner 在 fixed 流程资源中钉住（或补 A8 stage-request）。
- **B3 在办状态**：B3 生产任务 `task.created` 不改变投影（`stage.requested B3` 保持 requested），
  B3 完成由收口 + 分支 tip 判定——与设计一致，无需 `stage.dispatched B3`。

## 5. D1（typecheck + 受影响/全量确定性套件）

**方法**（与仓库既有 D1/T3 全量口径一致）：逐文件独立进程
`node --test --test-concurrency=1 --test-reporter=tap <file>`；登记挂起文件 90s watchdog
（`write-sequencing`/`customer-authorization-plane-integration`/`directive-decision`/`optional-acceptance`/
`session-rebuild-race`/`stuck-redispatch`），其余 300s 单文件超时；**未使用 `--test-force-exit`/新增
`--test-timeout`**；runner/输出见 `_evidence/run-tests.mjs` 与 `d1-*`。

- `npm run typecheck`：after **exit 0**（含 3 个新文件；`_evidence/typecheck-after.txt`）；before 同候选
  B4.2 `03-after-typecheck.txt` exit 0（代码未改，before 等价）。
- 受影响域 `test/测试`：before 116 文件 **703 / 646 pass / 38 fail / 1 cancelled / 18 skip**（1 登记挂起：
  `customer-authorization-plane-integration` 90s watchdog，不计通过）；after = before 116 文件结果
  （逐文件隔离 ⇒ 未变文件等价，`d1-after-test-domain/` 为 before+new 合并数据集）+ 3 个新文件
  **8 / 8 pass / 0 fail / 0 skip**（`d1-new-tests/`，TAP 逐文件）⇒ **711 / 654 / 38 / 1 / 18**；
  失败名集合 diff：**added 0 / removed 0**（39 entries 逐名一致；`d1-diff/`）。
- known-red 域复跑（逐文件，`_evidence/d1-domains/`）：**编排 1,301/1,275/24/2**、**门禁 528/522/5/1**、
  **runtime-core 586/549/33/4**、**桌面 717/633/84/0/0（4 登记挂起 watchdog）**、roles 275/275、
  项目管理 224/218/1/5、gates 29/29。失败名集合对照：编排 24/24、门禁 5/5、runtime-core 33/33
  **逐名一致（added 0/removed 0）**；桌面 88 vs 并集 80——8 条差集全部落在**已登记非确定/挂起套件**
  （chief-workflow 1、optional-acceptance 1、stuck-redispatch 3、session-rebuild-race 4），无新增确定性失败。
- **一次性原生崩溃披露**：编排 `direct-role-capabilities.test.ts` 在域运行中 V8 原生 abort（完成 20/47，
  失败名 `Retained intent confirmation…` 属 known-red）；同候选**单文件隔离复跑 47/46/1**（失败名相同），
  补足后编排计数 = **1,328/1,302/24/2**，与 B4.2 冻结参照完全一致 ⇒ 非本批回归、非确定性环境崩溃。
- **G-B5-4（D1 发现，候选回归）**：项目管理 `i18n-guard` 1 红 = `app/desktop/workflow.ts` /
  `workflow-git.ts` 的中文 import 路径未入 allowlist（B1 基线为绿；B1 §二未列）。见 §4。

**判据**（B1 §二/§三）：新增确定性失败 = 0；新 skip = 0；同名 known-red 不恶化；既有失败消失须解释。

**D1 范围披露**：本批候选仅新增 `test/测试/**` 3 文件（产品代码零改动），故受影响域 `test/测试` 做
真实 before/after；known-red 点名域（编排/桌面/门禁/runtime-core + roles/项目管理/gates）只读复跑并与
同一候选冻结名集逐名对照。其余目录（适配器/装配/桌面UI 等）不在 B1 known-red 名集内、未被本批触达，
本轮未重跑（如需全仓每文件 TAP 可另排时间；本轮方法/runner 已留可复现脚本）。

## 6. known red 对照（B1 §二 / B4.1/B4.2 冻结名集）

- 参照名集（同一候选 HEAD `e645e4e` 的 B4.1/B4.2 D1 证据，逐名复制到 `_evidence/ref-knownred-*.txt`）：
  `test/编排` 24、`test/门禁引擎` 5、`test/runtime-core` 33、`test/桌面应用` #29/#30/#31/#49（4）。
- `test/测试` 域：before 基线失败 **39 条 / 17 文件**（含 B1 §二点名的 `version-change-integration` 9 条；
  `governance-e2e-auto/i-full-chain` 2 条与桌面 B1 记录的 HEAD 纯净解包既有环境红同源）；after 失败集合
  **逐名一致（added 0 / removed 0）**，新增 3 文件 0 失败/0 skip。逐名见 `_evidence/d1-diff/`。
- known-red 域（编排/桌面/门禁/runtime-core）：
  - `test/编排`：实际 24 条失败名 vs 冻结 24——**added 0 / removed 0**（逐名一致；`d1-knownred/orch.txt`）。
  - `test/门禁引擎`：5 vs 5——**added 0 / removed 0**（`gates.txt`）。
  - `test/runtime-core`：33 vs 33——**added 0 / removed 0**（`runtime-core.txt`）。
  - `test/桌面应用`：实际 88 vs 参照并集 80——差集 8 条全部归属**已登记非确定/挂起套件**：
    chief-workflow（W47 忙 Chief 独立 revise，B1 §3.2 已披露非确定）、optional-acceptance
    （B1 §二 known-red 1 fail 部分：`幕僚调度验收…`，watchdog 前完成项）、stuck-redispatch
    （B1 记录 not ok 1/5/6 三条）、session-rebuild-race（动态 `重建 … 等待窗口` 4 条，watchdog 前完成项）；
    `ref names missing now: 0`。⇒ **无新增确定性失败**（`desktop-union.txt`）。
  - 逐套件计数与 B1 桌面记录一致：chain-enforcement 6、session 1、handback-delivery 6、run-pin 11、
    multi-runtime 8、boundary-refresh 1、log-actions 1、run-change-trigger 9、star-routing 7、
    version-change 4（trunk 0；合计 52/48/4 同 B4.2 #29/#30/#31/#49）、interface/dispatch-fresh-enum/
    message-queue/ans-wiring 0。

## 6b. 失败计数明细（待填）

| 范围 | 计数（tests/pass/fail/cancelled/skip） | 失败名 diff |
| --- | --- | --- |
| `test/测试`（116→119 文件） | before 703 / 646 / 38 / 1 / 18 → after 711 / 654 / 38 / 1 / 18 | added 0 / removed 0（39 条逐名一致） |
| `test/编排`（131 文件） | 1,301 / 1,275 / 24 / 2（+一次性原生崩溃 27 tests；隔离复跑后 1,328 / 1,302 / 24 / 2） | 对照 24 名集：added 0 / removed 0 |
| `test/桌面应用`（68 文件） | 717 / 633 / 84 / 0 / 0（4 登记挂起 watchdog） | 对照 80 并集：added 8（全部为已知非确定/挂起套件）/ removed 0 |
| `test/门禁引擎`（50 文件） | 528 / 522 / 5 / 1 | 对照 5 名集：added 0 / removed 0 |
| `test/runtime-core`（63 文件） | 586 / 549 / 33 / 4 | 对照 33 名集：added 0 / removed 0 |
| `test/roles`（24）/`test/项目管理`（13）/`test/gates`（4） | roles 275/275/0；项目管理 224/218/**1**/5；gates 29/29/0 | 项目管理 1 红 = **G-B5-4**（i18n 守卫，候选回归，非本批引入）；gates/roles added 0 |

- 同候选参照计数（B4.1/B4.2 记录）：`test/编排` **1,291/1,265/24/2**（tests/pass/fail/skip）、
  `test/门禁引擎` **499/493/5/1**、`test/runtime-core` **586/549/33/4**、`test/roles` **275/275/0**；
  `test/桌面应用` 环境敏感/既有红见 B1 §3.2 与 B3 §环境段（linked-worktree `.git` 文件、chief-workflow
  非确定、4 登记挂起、version-change/trunk 4 known-red）。

## 7. T-01…T-20 覆盖映射（B5 视角）

> 本批只补跨层/全链与迁移矩阵；各 owner 单测已随 B0–B4.2 提交（下列引用不重复造窄断言）。

| T | 覆盖（文件） | B5 结论 |
| --- | --- | --- |
| T-01 | `test/编排/workflow-dispatch-fixed.test.ts`（fixed 全组合+Q6）、`test/桌面应用/fixed-path-routing.test.ts`（桌面矩阵/证据负例/MF-10）、`test/编排/workflow-preconditions.test.ts`（legacy 旧断言） | owner 覆盖；B5 复跑通过 |
| T-02 | `test/编排/workflow-stage-request.test.ts`（服务/幂等/open/stop）、`test/桌面应用/fixed-path-routing.test.ts`（首请求跨层）、B5 `fixed-path-full-chain.test.ts`（链内 stage-request + replay） | B5 跨层覆盖；无独立新文件（引用既有 + 全链） |
| T-03 | `test/编排/workflow-state.test.ts`、`workflow-stage-request.test.ts`（A10→A11）、B5 全链（A1–A13/B1–B4 实际推进） | 机制通过；**G-B5-1/G-B5-3 生产接线阻塞**（见 §4） |
| T-04 | `test/编排/workflow-close-intent.test.ts`、B5 全链（prepareIntent/finalizeIntent/closeTask 跨层） | 通过 |
| T-05 | `test/编排/workflow-mode.test.ts`、`test/桌面应用/fixed-path-routing.test.ts`、B5 `mode-switch.test.ts`（混合项目/会话注入/坏配置） | 通过 |
| T-06 | `test/编排/task-state-fixed.test.ts`、B5 全链（fixed 任务无 runId/幂等） | 通过 |
| T-07 | `test/编排/baseline-service.test.ts`、`test/桌面应用/b3-fixed-baseline-pathb.test.ts`、B5 全链（A9 真实 git init/.gitignore/branch/basis；B 路径最小准备） | 通过 |
| T-08 | `test/编排/workflow-ledger.test.ts`、`basis-guard.test.ts`、B5 全链（basis verify/role.activated/path-b 只读） | 通过 |
| T-09 | `test/门禁引擎/classify-shell-v5.test.ts`、`test/编排/shell-task-git-gate.test.ts`、`shell-task-git-execution.test.ts`、`test/桌面应用/b42-task-git-port-desktop.test.ts`、B5 全链（taskGitScope + 真实 add/commit + 拒绝码） | 通过 |
| T-10 | `test/编排/release-merge.test.ts`、`test/桌面应用/b3-release-merge-desktop.test.ts`、B5 全链（A13 需 A12b+归档；B4 仅 B3+报告；客户本人；不 push/tag） | 通过 |
| T-11 | `test/桌面应用/b3-fixed-cards-panel.test.ts`、`b31-fixed-release-auto-desktop.test.ts`、`test/编排/acceptance-archive.test.ts`、B5 全链（3 卡各一次/归档 hash/merge-main 非判断） | 通过（B5 链内 4 张卡计数） |
| T-12 | `test/编排/path-b-baseline.test.ts`、`test/桌面应用/b3-fixed-baseline-pathb.test.ts`、B5 `b-change-scope.test.ts` + 全链（B1→B4、无仓库 fail-closed） | 跨层组合通过；B2 生产写入者缺失（G-B5-2） |
| T-13 | `test/roles/*-fixed*.test.ts`、`test/门禁引擎/fixed-role-module-surface.test.ts`、`governance-matrix-fixed-view.test.ts`、`role-module-contract.test.ts`（15 项） | owner 覆盖；B5 复跑 |
| T-14 | `test/桌面应用/fixed-path-routing.test.ts`、B5 `mode-switch.test.ts`、`test/测试/governance-e2e-auto/i-full-chain.test.ts`（legacy 逐字）、既有 trunk-* 只读 | 旧断言未改；i-full-chain 2 条为 HEAD 既有环境红（§8 披露），非本批回归 |
| T-15 | `test/编排/shell-task-git-gate.test.ts`（审计行）、`release-merge.test.ts`、B5 全链（merge-main `by:"customer"`、无 judge 代批） | 通过 |
| T-16 | B5 `fixed-path-full-chain.test.ts`（路径 A/B；宿主 glue 披露 §3） | **机制 pass（宿主 glue）**；生产接线缺口未修 ⇒ RR 阻塞 |
| T-17 | `npm run typecheck` | 见 §5 |
| T-18 | known red 复测 | 见 §6 |
| T-19 | 写集外 diff=0；`src/common/gates/` 未改；新文件在 `test/测试/` 既有授权 | 通过（§9） |
| T-20 | `test/编排/doc-format-specs.test.ts`、`roster-v4.test.ts`、契约/文案 owner 测试 | owner 覆盖；B5 复跑 |

## 8. 限制与披露

- 本批为**确定性/假会话**验证：不启动真实 Electron/模型；RR-01…RR-06 另授权。
- **生产接线缺口 G-B5-1/2/3 使真机全链（RR-02/RR-03）当前不可自然完成**；本批全链测试以宿主 glue
  验证机制，不构成缺口修复或验收通过。修复属桌面窗口/编排写集；修复后 B5 应复跑全链并移除 glue。
- **legacy 全链既有红**：`test/测试/governance-e2e-auto/i-full-chain.test.ts` 在本候选（及 HEAD 纯净解包）
  2 失败（`chief-hub-flow-unavailable`；桌面 B1 记录已登记为 linked-worktree 环境性已知红），本批未新增/
  未修复；legacy 路由/旧断言未被本批改动（`mode-switch.test.ts` + 既有 star-routing 只读复跑）。
- 已知红按 B1 §二口径不恶化；既有失败消失将逐条解释（若发生）。
- 未使用 `--test-force-exit`/新增 `--test-timeout`；登记挂起文件按 90s watchdog、其余按 300s 单文件超时
  隔离运行并披露。

## 9. 未提交声明

本记录与 `_evidence/`、3 个新测试文件仅写入本轮工作树；**未 commit/push/merge/tag/发布**；未改
`src/**`/`app/**`/既有测试断言/角色卡/边界/文档；`git status --porcelain -- src app test` 仅列出
3 个新测试文件（写集外 diff=0）。
- 候选聚合：`d80d180084b84885e23d2a92dc53f450509e7b87a92ae722222ae8e265e2669a`（`<raw_sha256>  <path>`
  `LC_ALL=C sort` 后 SHA-256；见 §2）。
- 工作树内其它 `M`/未跟踪项为本批开始前既存（其它角色/会话产物），不属本批候选、未由本批修改。
