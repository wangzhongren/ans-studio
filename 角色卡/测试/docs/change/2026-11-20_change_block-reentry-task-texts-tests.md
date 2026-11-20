# 变更记录：block resolved 后阶段重入场 + 流程定义 v3——测试批（S1/S2）

- 日期：2026-11-20
- 角色：ANS 内置「测试」（测试批；协调者已授权本批范围）
- 分支/工作树：`fix/block-reentry-task-texts`（worktree `.claude/worktrees/fix-block-reentry-task-texts`；
  HEAD 起点 `2a363da` = origin/main；同树另有编排/桌面两批**未提交**实现改动，本批与其同树生效）
- 权威依据：
  1. `角色卡/编排/docs/change/2026-11-20_change_block-reentry-task-texts-foundation.md`
     §一（状态机/API 语义）、§四（版本/hash 钉死清单）、§六（待测试点）；
  2. `角色卡/桌面窗口/docs/change/2026-11-20_change_block-reentry-task-texts-desktop.md`
     §二（桌面接线）、§四（待测试批断言点）、§五（剩余风险）。
- 范围（铁律）：**只改 `test/**` + 本记录**。未改 `src/**`、`app/**`、门禁文本/roles、workflow 资源、
  `release.yml`/release-policy；未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224；
  未启动 Electron 真机。`.tmp-block-reentry-desktop-selfcheck.ts` 只读参考、未提交/未依赖。

## 一、改动清单

### 1. 版本/hash 钉死（任务 A）

| 文件 | 改动 |
| --- | --- |
| `test/编排/app-dispatch-definitions.test.ts` | `WORKFLOW_DEFINITION_VERSION` 2→**3**、`WORKFLOW_DEFINITION_VERSIONS` [1,2]→**[1,2,3]**；`workflowDefinitionVersionsOf` 期望 [1,2,3]；`WORKFLOW_DEFINITIONS[id].version`=3；定义 hash 用例改为 v1/v2/v3 三版本（v2 走 `HASHES_BY_VERSION[id][2]`、v3 = `WORKFLOW_DEFINITION_HASHES`，三者互异）；冻结测试篡改值 3→**4**；`getWorkflowDefinition`：v3 合法（返回 v3/hash）、version 4 才 `workflow-definition-version-unsupported` |
| `test/编排/app-dispatch-service.test.ts` | selectWorkflow(A)/(B) 的 `definition.version` 2→**3**（sha 仍用 `WORKFLOW_DEFINITION_HASHES`）；started.definition.version 2→3；拒绝面 `definitionVersion: 3`→**4**（保留 `workflow-definition-version-unsupported`）；注释 add@2→add@3 |
| `test/编排/app-dispatch-task-idempotency.test.ts` | 手工 seed 在飞 v2 workflow 的 `definition.sha256` 改用 `WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[2]`（HASHES 现指 v3；这正是「在飞 v2 按 v2 hash 解释」用例） |
| `test/桌面应用/block-router.test.ts` | 手工 seedWorkflow（在飞夹具）默认定义改为 **v2 + `WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2]`**；review 用例「新 select 使用 v2 定义」断言 → **v3**（该用例经 `selectWorkflow` 起流程，无手工定义 seed；本文件无独立「双版本」用例，双版本覆盖在 `test/测试/block-resolver-protocols.test.ts`） |
| `test/桌面应用/app-dispatch-block-seams.test.ts` | 同类 latent 钉死一并修正：手工 seed 在飞 workflow 由「v2 定义 + 当前(v3) hash」改为 **v2 + `HASHES_BY_VERSION.add[2]`**（避免版本/hash 不一致的陷阱夹具；既有断言未动） |
| `test/测试/block-resolver-protocols.test.ts` | 「定义双版本」扩为**三版本**：v1 `blocked`、v2/v3 `route-block-resolver`；三版本阶段集合/顺序/driveOrder 一致；v2 hash = `HASHES_BY_VERSION[id][2]`、v3 = `HASHES[id]`；v3 仅 A2/A3 文本与 v2 不同（其它阶段 deepEqual；modify 无 A2/A3 ⇒ 阶段数据逐字一致）；v1/v2/v3 冻结 hash 字面量（记录 §二表格）；缺省解析 v3、version 4 拒绝；新 select 钉 v3 定义与 v3 hash（v1/v2 仍可解析、v2 旧文本保留） |

### 2. 新增 S1 服务级回归（任务 B）

`test/编排/app-dispatch-block-reentry.test.ts`（真实临时目录 + 真实 workflow/task/block 账本；无端口/网络）：

1. `S1 fixed 重入全链：A2 blocked（Q8 耗尽）→ resolved(fixed) ⇒ 一条 block rework(attempt3)+唯一 attempt3 任务 → done 收口 A2 → nextStages 含 A3`
2. `S1 幂等：重复调用 replay=true（同 eventId/taskId、零新增）；Promise.all 双触发仅一条 rework/一条新任务`
3. `S1 engine-auto-fix 来源：阶段已 completed ⇒ alreadyCompleted（零 rework）；阶段在飞 ⇒ alreadyInFlight（零 rework/任务）`（含 requested-only 子例）
4. `S1 decided：修订/返工/换执行者/限次重试 ⇒ 重入成功；terminate ⇒ block-reentry-inapplicable；resolution 不符 ⇒ mismatch`
5. `S1 校验面：未 resolved ⇒ block-not-resolved；绑定不一致 ⇒ block-resolution-mismatch；fixed-v2.1 ⇒ workflow-protocol-mismatch；坏 blocks 行 ⇒ block-ledger-corrupt`
6. `S1 reconcile：带 blockId rework 的 pending 补一次 drive（attempt 不变、不新开尝试）；普通 pending 不被驱动`
7. `S1 共存：已有 stage=A2 的 repair 任务时重入仍只产生一条新 attempt 任务`
8. `S1 v2 在飞：definition v2（v2 hash）的 workflow 仍能 fixed 重入成功（不静默迁移，任务文本按 v2）`
9. `S1 状态机负例：blockId 事件必须同阶段+blocked（否则 workflow-corrupt）；空 blockId 不计入；无 blockId 的 MF-IR-1 A3→A2 逐字不变`
10. `S1 blockId 空串事件：appendWorkflowEvent 拒写（invalid-event）；raw 账本读取侧 invalid/不入账`

### 3. 新增桌面级 S1/S2 等价回归（任务 C）

`test/桌面应用/block-reentry.test.ts`（真实 SessionManager + 假会话/假时钟 + 真实账本；假宿主 + 真实重入场端口）：

1. `B8 owner-repair 真机等价全链：A2 attempt1/2 blocked → 属主修复 done → fixed ⇒ attempt3 唯一/rework 一条 → A2 completed → A3 card-prompt；重入后零新增 drive.failed`
   - 含 SMOKE-2 S1 回归：重入前既有 1 条 `app-dispatch.drive.failed`（blocked 观察后的既有 advance，见本记录 §四.1）；
     **重入后计数不变（零新增）**，再连续 recover 3 次仍不变（17 连败形态不再出现）；`block.reentry.fixed` 诊断恰一条。
2. `engine-auto-fix fixed：alreadyCompleted ⇒ advance 下一阶段且不写 rework；阶段在飞 ⇒ 不重复 driving`
3. `B9 decided：revise-scope ⇒ 调重入端口（resolution decided）+ advance、不建该 block 属主修复任务；terminate ⇒ 不调重入端口`
4. `恢复崩溃窗口：resolved(fixed)+blocked+无 rework ⇒ recover 恰补一条 rework+新 attempt；已有 reentry 的旧 block 跳过`
5. `fixed-v2.1 零迁移：resolved(fixed)+blocked 不调重入端口；修复任务完成仍走既有 [Block·修复完成] 简报`（含空 pending 不驱动子例）
6. `重复/并发恢复：Promise.all 双 recover ⇒ 仅一条 rework/一条 attempt3 任务（replay），任务 id 确定性`

### 4. S2 定义文本回归（任务 D，并入 definitions 测试）

`test/编排/app-dispatch-definitions.test.ts` 新增：
`S2 定义文本 v3：A2 只写 docs/product 且 docs/intents 由幕僚创建/核对（B24）；A3 呈卡前核对入口；v1/v2 逐字保留、hash 冻结`
- v3 A2：`docs/product/<flowId>-intent-vN.md`、`docs/intents/<intentId>.md`、幕僚、B24、`不得写 docs/intents`、
  `path-outside-boundary`；不得再出现旧「同时写 docs/intents」；
- v3 A3：`docs/intents/<intentId>.md` + 幕僚 + B24 + 呈卡前；`request_choice`/`card-prompt-mismatch`/`finalizeIntent` 保留；
- v1/v2 A2/A3 taskText 与旧文本 **deepEqual 逐字一致**（证明未静默修改 v2）；v1 `blocked`、v2/v3 `route-block-resolver`；
- 六枚 hash 字面量（add/modify × v1/v2/v3）与记录 §二表格逐值钉死；`validateWorkflowDefinitions()` 零错误。

## 二、验证命令与计数（cwd = worktree）

- `npx tsc --noEmit` ⇒ **exit 0**（测试批改完后复跑）。
- 目标套件（8 文件，`node --test --test-concurrency=1`；含 seams hash 修正）：

| 文件 | tests | pass | fail |
| --- | --- | --- | --- |
| `test/编排/app-dispatch-definitions.test.ts` | 9 | 9 | 0 |
| `test/编排/app-dispatch-service.test.ts` | 20 | 20 | 0 |
| `test/编排/app-dispatch-task-idempotency.test.ts` | 6 | 6 | 0 |
| `test/桌面应用/block-router.test.ts` | 22 | 22 | 0 |
| `test/测试/block-resolver-protocols.test.ts` | 5 | 5 | 0 |
| `test/编排/app-dispatch-block-reentry.test.ts`（新增） | 10 | 10 | 0 |
| `test/桌面应用/block-reentry.test.ts`（新增） | 6 | 6 | 0 |
| `test/桌面应用/app-dispatch-block-seams.test.ts`（hash 修正） | 5 | 5 | 0 |
| **合计（8 文件）** | **83** | **83** | **0** |

（上述 7 文件先跑得 78/78；seams 修正后与 7 文件合并复跑得 83/83；seams 单跑 5/5。）

- 指定桌面/协议套件：
  `node --test --test-concurrency=1 test/桌面应用/app-dispatch-block-seams.test.ts test/桌面应用/block-router.test.ts test/桌面应用/app-dispatch-delivery.test.ts test/桌面应用/fixed-path-routing.test.ts test/测试/block-resolver-protocols.test.ts`
  ⇒ **50 tests / 50 pass / 0 fail / 0 skipped**（含 seams 5/5，hash 修正后复跑）。
- `test/编排/**` 全量（145 个 `*.test.ts`，`node --test --test-concurrency=1`）：
  **1463 tests / 1461 pass / 0 fail / 2 skipped / exit 0**（2 skipped 为既有 skip；本批未新增 skip）。
  编排记录 §三 的 8 个版本/hash 钉死失败全部转绿，未发现其它失败。
- 已知红基线（runtime-core-33 / gates-5 / orchestration-24）：**本批未本地跑**（协调者做 LF-clean 终验）；
  本批在 `test/编排/**` 全量中观察到的差异见上。

## 三、已知红对比（编排记录 §三 / 桌面记录 §三 的失败点）

- 编排记录列出的 8 个「版本/hash 钉死」失败点全部转绿：
  `WORKFLOW_DEFINITION_VERSION`/versions/`WFD.version`/冻结测试/getWorkflowDefinition（definitions 5 点）、
  selectWorkflow version（service 1 点）、在飞 v2 seed hash（idempotency 1 点）、以及全量中的同源点。
- 桌面记录列出的 `block-router`「新 select 使用 v2」失败（actual 3）已转绿（断言 v3）。
- `block-resolver-protocols` 的 3 个失败点（当前版本/双版本 hash/新 select）已转绿并扩展为三版本。
- 未发现逻辑回归；新增用例全部通过。

## 四、实现/环境观察（测试暴露的事实；未改产品代码）

1. **修复前既有 1 条 drive.failed**：`observeApplicationTaskReport`（桌面）在 blocked 报告观察成功后仍调用
   `advance`；阶段 blocked 且 attempt 超 Q8 预算 ⇒ `driveAppDispatchStage` 拒绝，记录 1 条
   `app-dispatch.drive.failed`（既有语义，非本批重入路径）。S1 回归断言因此写成：**重入后零新增**、
   修复完成后重复 recover（3 轮）计数不变、总量 ≤1；SMOKE-2 的连续 17 次失败未复现。
   若后续要求修复前也必须 0 条，属于「blocked 观察后 advance 策略」的另一处设计取舍，需协调者裁定。
2. **reconcile 新分支的可见条件**：`awaitingBlockReentryDrive`（pending + 带 blockId rework）只在账本**没有**该阶段
   `task.created` 任务提示时可见；若已有历史任务，`applyTaskHints` 会把 pending 视为 dispatched，走既有在飞补驱动分支。
   测试按两种形态分别覆盖（6a 用无任务提示的崩溃窗口、其它用例覆盖真实链）。
3. **workflow 账本坏形状行**：`readWorkflowLedger` 对空 `blockId` 行计入 `badLines` 且不返回该事件（不是
   `skipped.invalid`）；`skipped.invalid` 只在投影层收到 raw 事件时可见。用例 10 按读取侧实现断言，
   用例 9d 用内存事件断言投影 `skipped.invalid=1`。
4. **诊断白名单**：`block.reentry.*` 诊断行不含 `blockId`（`safeFields` 白名单未收录），测试改为断言 `attempt`；
   blockId 归属由账本事件断言。
5. 桌面 `block-router.test.ts` / `app-dispatch-block-seams.test.ts` 的在飞 seedWorkflow 夹具改为 v2 + `HASHES_BY_VERSION[2]`，与「在飞不改写」一致
   （seams 原为 v2 + 当前 hash 的 latent 不一致；此前用例路径未触发 `loadAppDispatchContext`，未显红）。

## 五、剩余风险

1. **decided 崩溃窗口未扩展**（桌面记录 §五.1）：`resolveBlock(decided)` 后、`executeChosenOption` 前崩溃，
   恢复只补 `fixed` 重入场（`reenterResolvedFixedBlocks` 只扫 `resolved(fixed)`）；本批测试未覆盖该窗口。
2. 本批测试依赖编排/桌面两批**未提交**实现同树生效；三者需一并提交/发布。
3. `test/编排/**` 全量在 Windows/CRLF 环境下的差异以本次本地结果为准，最终裁定按协调者 LF-clean 终验。
4. 验证用 `node_modules` junction（指向主仓依赖，gitignored）为本工作树临时可见，结束后移除。

## 六、结论

- 状态：**implemented-verified（本地）**——tsc 0；新增/更新用例与指定套件全绿；
  未发现需要修改产品代码的缺陷；未 commit/push/CI/tag。
- 未放宽/删除既有断言：所有版本/hash 期望均为收紧或等价更新；无 skip。
