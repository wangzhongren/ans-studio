# W：B16 fixed A8 角色草稿写权（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B16——RR11 失败修复（A8 建卡被 legacy D3 门禁拒绝）。
- 依据：RR11 记录 `角色卡/测试/docs/change/2026-11-11_RR11_two-fixed-workflow-paths.md`（`8926389…`）；实现级方案 v1.3 §3.4 A8/§4.2 A8；协调方 B16 授权。
- 基线：HEAD `f8dafee`/`e620160`（RR11 记录与证据提交）；工作树仅有本批改动。

## 一、RR11 失败事实（本批修复对象）

- nominator A8 任务两次尝试写 `角色卡/<roster role>/{role-card.md,boundary.md,boundary.yaml}` 均被 `run-role` 写入门禁拒绝，原文「Role drafts require the actual completed plan and current D3 selection; no old appointment-write card can substitute」；0/2 `role.activated`、零文件落盘。
- nominator 尝试 `complete_team_plan` 以满足 legacy 门，回执 `stage-transition-invalid`「A9 基线非法：当前 A8(requested)；要求 A9 在办」⇒ **A8↔A9 顺序死锁**。
- 根因：fixed A8 nominator 会话仍走 legacy trunk `prepareRoleDraftScope`（要求 actual completed team plan + current D3 selection），而 fixed 路径授权来自 A6 方案卡决定 + roster；fixed 不弹 D3 appointment-write 卡，门永不满足。

## 二、实现（`src/pipeline/orchestration/run-role.ts`）

- `refreshRoleDraftScope` 新增 fixed 分支：会话绑定**真实 fixed A8 任务**（`task.created.to=nominator`、`workflowId` 存在、`stage=A8`、非 stage-request）时，从**最新 fixed roster**（`loadLatestRoster`）派生每个名单角色的三文件：
  `角色卡/<roleId>/role-card.md`、`boundary.md`、`boundary.yaml`。
  - roster 不可读/非法/含内置角色/角色 id 形状非法 ⇒ 不加入路径（空集 fail-closed），**不回退 legacy D3**；
  - legacy（无 workflowId/非 A8）会话仍走 trunk `prepareRoleDraftScope` 逐字不变；
  - 写入门禁只放开名单角色三文件；`activate_role_documents` v2 仍复核 A6 `proposalDecisionId` + roster/三文档 hash；A9 仍由运营在 A8 完成后执行（不需要 nominator 触发 `complete_team_plan`）。
- 新增模块内 helper `fixedRoleDraftTaskOf(projectRoot, taskId)`：只读 tasks 账本 +（缺 flowId 时）workflow 账本，返回 `{flowId, workflowId}`；形状不全返回 undefined。

## 三、测试（`test/编排/run-role-fixed-b31.test.ts`，M）

- 桩适配器捕获 `WriteGate`；`withSession` 支持 `taskId` 并回调 gate。
- 新增 B16 test：
  - fixed A8 nominator：`角色卡/implementer/role-card.md`、`implementer/boundary.md`、`qa/boundary.yaml` 允许；`角色卡/evil/role-card.md` 拒绝（Role drafts 门禁）；`docs/product/x.md` 拒绝（不扩大写区）。
  - legacy/无 fixed A8 任务：角色卡仍拒绝（走 trunk `prepareRoleDraftScope`，空集 fail-closed）。
- 既有 B15.3 A10 门禁/发起人/卡选项/legacy 测试全部保留并通过。

## 四、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b16-01-typecheck.txt`（`22d52cc9…`） |
| 受影响集（b31/b2/b121/task-context/B13.1/close-intent/nominator-fixed/chief v2/b51） | **85/85 pass** | `_evidence/b16-02-affected.tap`（`d07912fb…`） |
| 确定性全链 `fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b16-03-full-chain.tap`（`1809b6d4…`） |
| 桌面 fixed 定向 10 文件 | **81/81 pass** | `_evidence/b16-04-desktop-fixed.tap`（`cde7ff2a…`） |
| 全量 `test/编排/*.test.ts` | 1362 tests / **1336 pass / 24 fail / 2 skip**；24 条 known-red 与 B10.2 **逐名一致**（diff 空） | `_evidence/b16-05-orchestration-suite.tap`（`01cd93fa…`）、`b16-05-suite-exit.txt`、`b16-05-known-red-failnames.txt`、`b16-05-known-red-diff.txt` |

## 五、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/pipeline/orchestration/run-role.ts` | M | 304,461 / 4,701 | `19fa48da9933cf9a6342af8e0c8e1965bacae9570710b102a56668fe61bc3441` | +53/−0 |
| `test/编排/run-role-fixed-b31.test.ts` | M | 37,719 / 847 | `de54b0497d038f14d0b711e9e8bdd163136d5b991f3741d6996ad79a49e40f74` | +58/−3 |

- 基线/改动状态：`_evidence/b16-00-baseline-head.txt`（`f8dafee`）、`b16-00-change-status.txt`。

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR12。
- fixed A8 写权只覆盖名单角色三文件；角色卡之外的写入仍按原边界/任务写集判定。
- legacy `prepareRoleDraftScope` 与其 D3 语义未改；B16 分支仅在真实 fixed A8 任务会话生效。
