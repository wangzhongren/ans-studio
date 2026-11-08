# 变更记录：B2 缺项补证（AC-2 / AC-4 集成用例，2026-11-08）

- 任务节点：**B2 insufficient evidence 补证**（B2 报告 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`，198 行 / `d49fa516…`；缺项仅两处形式证据）
- 角色：测试（独立上下文；只补集成用例与证据，**不判验收**）
- 日期：2026-11-08（本地 14:05–14:15）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 纪律：只写 `test/测试/`（新增 1 个集成测试文件）与 `角色卡/测试/docs/change/`（本记录与证据目录）；未改产品代码/其他测试/角色卡/边界/方案/验收；未运行真实模型；未 commit / push / 暂存 / 合并 / 发布；未删测试/放宽断言/加 skip/使用 `--test-force-exit`。

## 0. 结论摘要

1. **AC-2 用例（Pi + 项目角色 + shellOperatorChannel）**：经**真实 `openRoleSession`/`bindPreparedRuntimeRole`** 路径（项目角色三层链、`advisoryRuleset` 缺省 true、受保护项目 `required`、真实 `assembleProjectShellGate`/`createShellGate` + file sink 审批链）——
   - diagnostics 实测 **`session.open.ready`（roleId=worker）**；
   - appTools 含 **`run_shell`/`start_background_task`**；Pi strict surface 仍 `unknown`（不冒充 native observed）；
   - 同一真实装配上 `prepareRole` = **observed + token + `approvalChain`**（`source:"orchestration-shell-gate"`、`mode:"rules-advisory"`、`audit:{file,durable:true,probe:"ok"}`、`projectRoot` 一致），`factoryProvenance:"default-production"`，无 `native-factory-*` 阻断；
   - **真实 `bindPreparedRole` 成功**，会话工具面含两 shell 工具。
   - **实现说明（如实）**：Pi 适配器使用**官方 provider 工厂**（`createRuntimeAdapter`，显式假配置 `baseUrl=http://127.0.0.1:9/v1`、`modelId=b2-pi-fixture`、`apiKeyEnvVar=ANS_B2_PI_KEY`（fixture 值））；**未注入 fake provider**（保持 default-production），bind 仅构造会话、**不发起任何模型请求**（全程未调用 prompt；单用例 ≤0.7s）。既有 `createFakeRuntimeAdapter` 无私制 API（无 `prepareRole`/`bindPreparedRole`），本补证无需替身即走通真实路径，故未使用替身、未伪造 ready/绑定。
2. **AC-4 用例（Claude 与 Pi 无 shell 工具，参数化两例）**：受保护项目、不注入 shell 通道 ⇒ 不 arm shell：
   - diagnostics 实测 **`session.open.ready`（roleId=worker）**；
   - appTools **不含** `run_shell`/`start_background_task`；写工具仍注册（写门回归由既有套件覆盖）；
   - 显式 Service 准入：`prepareRole` observed+token，**无 `approvalChain`**、**无 `native-factory-*` 阻断**；真实 `bindPreparedRole` 成功且工具面无 shell。
3. **计数**：新文件 3/3 pass；`test/测试/**`（101 文件，排除登记挂起）673/615/39/1/18（= 上一 E3 的 670/612/39/1/18 + 新文件 3/3，失败/cancelled/skip 集合不变）；`npm run typecheck` exit 0。
4. **新候选**：**39 文件**（原 38 + 本新增测试文件；消息预估 40，以实测为准）；聚合 **`e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070`**；`src app test` manifest **1,078 文件 / `57087b8bd0d2a83af6fc59ab60ddb4be3004eb700187a813bd3401c834b862f5`**（运行前后 diff 0 行）；HEAD `a1b2f66`（tree `3aa82fb7…`）/分支/暂存 0/T1 三文件不变；scope status 前后逐行一致。

## 1. 输入

| 输入 | 实测 |
| --- | --- |
| B2 报告 | `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`：`d49fa51629fcfc7ced9076c9210e578426638169cff1ded200b9112bf2593c2e`；198 行 |
| 设计 P1.3 | `docs/planning/2026-11-08_design_session-admission-approval-based.md`：`2553b97a…` |
| B1 v1 | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`：`fb881126…` |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`：`60eed852…` |

## 2. 新增用例（`test/测试/session-admission-approval-b2-gap-integration.test.ts`）

| 用例 | 覆盖 | 真实件/断言要点 |
| --- | --- | --- |
| `B2-AC2 Pi + 项目角色 + shellOperatorChannel…` | B1 AC-2 | 真实 `openRoleSession`（项目角色 worker、runtime pi、`shellOperatorChannel` 注入、`shellArming.pmRoleId=worker`）→ `session.open.ready`（roleId=worker，projectRoot 一致）；appTools=两 shell 工具；显式同装配 `prepareRole` observed+token+approvalChain（advisory/file+durable+probe ok）；真实 `bindPreparedRole` 成功；`factoryProvenance=default-production` |
| `B2-AC4 claude 无 shell 工具…` | B1 AC-4（Claude） | 不注入 shell ⇒ `session.open.ready`；appTools 不含两 shell 工具、写工具在；`prepareRole` observed+token、无 approvalChain、无 `native-factory-*`；真实 bind 成功 |
| `B2-AC4 pi 无 shell 工具…` | B1 AC-4（Pi） | 同上（runtime pi） |

- 文件行数/字节/SHA-256：`test/测试/session-admission-approval-b2-gap-integration.test.ts` = **272 行 / 14266 bytes / `4aa783ad8e967da66df82b890c3ff1d70e7230fc04b3fb50aa68e5eb7ccaaed2`**（证据 `10-new-test-file.log` 实测）。
- 证据边界：只证明「当前进程内真实装配的 gate 由 `createShellGate` 登记且审计探针 ok + Service 准入 observed + 真实 bind 成功 + 会话创建」；不证明 native 效果闭包/模型回合行为（未运行模型）。

## 3. 运行结果

| 运行 | 命令 | exit | tests / pass / fail / cancelled / skipped / todo |
| --- | --- | --- | --- |
| 新文件 | `node --test --test-concurrency=1 test/测试/session-admission-approval-b2-gap-integration.test.ts` | **0** | **3 / 3 / 0 / 0 / 0 / 0** |
| `test/测试/**`（101 文件，排除登记挂起 `customer-authorization-plane-integration.test.ts`） | `node --test --test-concurrency=1 <显式文件集>` | 1（既有红） | **673 / 615 / 39 / 1 / 18 / 0** |

- 对上一 E3 的 test/测试 参照（670/612/39/1/18）：**+3 tests / +3 pass**（恰为本新增 3 例），失败/cancelled/skip 集合不变；无新增 skip。
- `npm run typecheck` exit **0**；未运行真实模型（bind-only，无 prompt）。

## 4. 候选与稳定性

- 候选 **39 文件**（`src app test` scope 42 项 − T1 3）：`02-candidate-files.txt`；逐文件 raw SHA-256 + `git hash-object`：`03-candidate-hashes.tsv`。
- **聚合**（`<sha256>  <path>` 两空格、整行 `LC_ALL=C sort` 后 SHA-256）：**`e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070`**（`04-candidate-aggregate-lines.txt` / `04-candidate-aggregate.txt`）。
- `src app test` manifest：运行前/后均 **1,078 文件 / `57087b8bd0d2a83af6fc59ab60ddb4be3004eb700187a813bd3401c834b862f5`**，逐行 diff **0 行**（`06-manifest-pre.txt` / `08-manifest-post.txt` / `08-manifest-diff.txt`）。
- HEAD `a1b2f66`（tree `3aa82fb7…`）/分支 `feat/plan-escalation-card` 不变；暂存 0；T1 三文件哈希不变（`05-t1-hashes.txt` / `09-t1-hashes-post.txt`）；`git status --porcelain -- src app test` 前后逐行一致（`01-scope-status.txt` / `09-scope-status-post.txt`）。

## 5. 限制与披露

1. Pi/Claude 官方 provider 以**显式假配置**构造（baseUrl 指向 127.0.0.1:9，模型/凭据为 fixture 值）；bind 只构造会话、不发起网络/模型请求；未调用 `prompt`，未运行真实模型。真实模型/UI 证据属 RR（另有记录）。
2. 既有 `createFakeRuntimeAdapter` 无私制（prepared）API；本次未使用替身（官方适配器 bind 成功，走完整真实路径）。若后续需要完全离线的 Pi 替身，最小构造方案：fake adapter 需实现 `prepareRole`（返回 `{plan:{status:"observed",approvalChain,…}, token}`，其中 approvalChain 必须来自真实 `inspectShellApproval`/`probeShellApproval` 投影，不得自填）与 `bindPreparedRole`（返回实现 `inspectToolSurface` 的 `RoleSession`），并经真实 `openRoleSession` 的 `deps` 注入——但该路线会改变 provider 来源为 custom（受保护范围默认拒绝），故不采用。
3. AC-4 的「写工具仍受既有边界门」仅断言工具注册存在；写门回归由既有套件（`test/门禁引擎/**`、`test/runtime-core/**`）覆盖，本补证不重复。
4. 本记录不判验收；B2 复判由独立验收按 B1 v1 作出。

## 6. 纪律声明

- 只写 `test/测试/session-admission-approval-b2-gap-integration.test.ts`、本记录与同名证据目录；未修改 `src/`、`app/`、其他测试目录、角色卡/边界/YAML/方案/验收/沟通/调度；未 commit/push/暂存/合并/发布；未删除/放宽断言、未加 skip、未使用 `--test-force-exit`。

## 7. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_B2-gap-integration-evidence/`

| 文件 | 说明 |
| --- | --- |
| `00-opening-state.log` / `01-scope-status.txt` | 开工身份与 status |
| `02-candidate-files.txt` / `03-candidate-hashes.tsv` / `04-candidate-aggregate*` | 新候选身份（39 文件/聚合） |
| `05-t1-hashes.txt` / `09-t1-hashes-post.txt` | T1 只读哈希 |
| `06-manifest-*` / `08-manifest-*` / `09-scope-status-post.txt` | manifest 前后与稳定性 |
| `07-test-suite-files-excluding-hang.txt` | test/测试 显式文件集（101 文件） |
| `logs/b2-gap-file.log` / `logs/test-suite.log` / `logs/static-typecheck.log` | 新文件/套件/静态门原始日志 |
| `10-new-test-file.log` | 新测试文件行数/字节/SHA-256 实测 |
| `evidence-index.md` | 逐文件 SHA-256/行数/bytes 索引 |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

- 证据索引 `evidence-index.md`：SHA-256 `7121eaa11b4e51ead3f10e1b7b79b5e91ab5db8554af841d0e2fc76202afd206`（26 行 / 2382 bytes；20 个文件）。
