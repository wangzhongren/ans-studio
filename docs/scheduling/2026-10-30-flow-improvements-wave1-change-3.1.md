# 2026-10-30 — 第一波 3.1 run 期间冻结契约（实施记录）

- 批次：第一波 **3.1 run 冻结**（方案 v3 §3.1；团队计划 §4.1；闸门 1/2 已确认）。
- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`（分支 `feat/flow-improvements-wave1`）
- 基线：`1a80478`（在 `1a227be` 之上含 Delta-W1-2 边界预备提交）。
- 性质：实施与验证记录；本地提交，不 push、不合并 main。本批只做 3.1，不触 3.2/3.4。

## 1. 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/common/编排/run-manifest.ts`（新增） | `ans-run/v1` 类型/校验；`.ans/runs/<runId>/manifest.json` 原子读写；`newRunId`/`ensureDraftRun`/`findActiveRun`/`pinRun`/`closeRun`/`verifyPinnedRun`；七类文档（intent/proposal/modules/roster/topology/architecture/assets 可选）路径+sha256+schema；`execution.teamPlan|flow`（可 null，flow 存在才钉 path/version/sha）；`rosterVersion`/`d3`/`stage`/`roles`；`loadPinnedRoster`（只读 pinned 快照）；`mapRunChangeChoice`/`mapRunChangeAnswer`/`applyRunChange`/`buildRunChangeCard`；run-change 记录含 decisionId/oldRunId/newRunId/oldHashes/newHashes。 |
| `src/common/编排/workflow-preconditions.ts` | `DispatchPreflightInput.run`（draft/pinned/legacy + runId + roles）；交付运营要求 draft/pinned run；实现/验收要求 pinned + 项目目标在 manifest.roles；错误码 `run-missing`/`run-pin-required`/`run-role-missing`。 |
| `src/common/编排/task-state.ts` | `TaskCreatedEvent.runId/runState/runStage`（可选，legacy 兼容）；读取校验 runId 形状；任务卡透出并渲染 `run：<id>（state，stage …）`。 |
| `src/model/runtime.ts` | 共享 `TaskCreatedEvent.runId/runState/runStage`；`GovernanceJudgeFacts.runId/runState/pinnedDocs`。 |
| `app/desktop/session.ts` | 星形派发：M1 前 `ensureDraftRun`；M1/M2/M3 复用同一 draft runId；handoff 前对同一 runId `pinRun`（失败在 task.created 前拒绝，不静默）；实现/验收使用 pinned manifest 的 roster/D3 与 hash 校验；mid-run 新版本不激活；任务落 run 字段；重派复制 run 字段；验收 facts 使用 pinned intent/roster/D3 + `runId/pinnedDocs`；`requestRunChangeDecision`（app 自有 decision 卡三模式、approve/reject/cancel 回退、记录决定/新 run 草案）。 |
| `src/common/门禁引擎/versioned-doc-guard.ts` | assets 作为第七类 vN 文档纳入路径识别/旧版只读/baseline（Delta-W1-1=A）。 |
| `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` | `ui.run.state.*`、`ui.run.change.*`（title/question/options）；run-change 卡使用共享 i18n。 |
| `test/桌面应用/run-pin.test.ts`（新增） | 7 例：M1/M2/M3 draft、handoff 同 runId pin、缺 D3 拒绝、assets 可选、并发 pin、P1.5 flow/teamPlan、schema/hash 漂移、legacy、M1 无 flow 的 pending draft 领养。 |
| `test/桌面应用/run-change.test.ts`（新增） | 3 例：decision 卡形状/issuer/回退映射；三模式；session 通道 customer 选择 stop-and-restart 落库。 |
| `test/编排/task-state.test.ts` | run 字段/任务卡/非法 runId/legacy。 |
| `test/编排/workflow-preconditions.test.ts` | run 条件必填负例/放行。 |
| `test/门禁引擎/versioned-doc-guard.test.ts` | assets 第七类只读。 |
| `test/编排/run-manifest.test.ts`（新增） | manifest 形状/pending 领养/非法 manifest fail-closed/七类文档齐备。 |
| `test/测试/run-pin-e2e.test.ts`（新增） | draft→pinned 同 runId + 任务卡读回 pinned。 |
| `test/门禁引擎/versioned-doc-guard-assets.test.ts`（新增） | assets 路径/只读/canonical baseline。 |

## 2. 行为要点（P1）

- **P1.1**：M1/M2/M3 之前由应用生成 draft runId；任务 `runId` 三任务相同；handoff 前 pin 同一 runId；pin 成功前 handoff 在 `task.created` 之前拒绝；pin 后实现/验收只读 manifest。
- **P1.2**：pin 后写 roster/modules v2 不改变 active 任务/验收依据（pinned roster 读取；测试断言 moduleDirectory 仍为 `src/`）；run-change 三模式与 approve/reject/cancel 回退映射；continue-frozen 不改 run，stop-and-restart 收口旧 run 并生成新 draft（`newRunId`），stop 取消。
- **P1.3**：pinned hash 漂移/文档缺失/schema 不符/实现或验收 run 非 pinned/目标不在 manifest.roles 拒绝；legacy 旧任务无 runId 可读且不伪造 pinned；全局无 flow 任务保持旧行为。
- **P1.4**：测试覆盖 draft→pin 同 runId、M1–M3 pin 前、mid-run 新版本、run-change 三路径/回退映射、并发 pin、legacy、schema/hash 负例。run-change 卡不新增 cardKind；`issuedBy:"app"`、`application:true`；客户/judge 唯一选择。
- **P1.5**：无 flow/teamPlan 源时 `execution.flow|teamPlan:null`；flow 文件存在则钉 path/version/sha，team plan 存在则钉 schema/hash；verify 对「文件存在但 manifest null」报不一致。

## 3. 验证（串行）

- 定向：桌面应用 **359/359**（含 run-pin 8、run-change 3）；run-pin 连跑 3 次均 **8/8**；另跑 `task-state` 11/11、`workflow-preconditions` 18/18、`versioned-doc-guard` 12/12、`run-manifest` 4/4、`run-pin-e2e` 1/1、`versioned-doc-guard-assets` 1/1。
- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` → **3034 tests / 3004 pass / 12 fail / 18 skip**；12 红＝9 Windows symlink EPERM + T1×3 既有环境问题（与基线 3012/2982/12/18 同红项，无新增确定性失败/新 skip）。日志 `%TEMP%\ans-wave1-rework2-full-final.log`，sha256 `daf74fa791b3fd98a69fe22b53e31cf5f30c4247415bdd19e70c62d61f5ee2fe`。
- `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0。
- phase5a 真实 Electron：**40/40 checks、failures=0、console/CSP 0**；report `%TEMP%\ans-phase5a-wave1f\report.json`，sha256 `a24764a4091e3be251bb75685a68c2794a633ec7848dbf17aaa22fe65ea6072a`。
- 桌面 E2E：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；report `%TEMP%\ans-e2e-wave1f\report.txt`，sha256 `03a2acc933e0355daab7bd755045764052a4f3435e31bbd59a585bab8b394d8f`。

## 4. 决策点与边界

- **Delta-W1-1=A**：assets 为可选第七类；存在 `docs/contracts/<flowId>-assets-vN.md` 才 pin，缺省 `documents.assets:null`，不因缺 assets 拒绝 pin；versioned-doc-guard 已识别 assets。
- **Delta-W1-4**：`src/provider/runtime/` 未新增文件；本批未改 provider 工具面。
- **run-change 触发**：应用提供 `SessionManager.requestRunChangeDecision`（app 发行）；本批未做“文档新版本自动弹卡”的轮询触发器（3.2/3.6 可接）；mid-run 新版本本身不会改变 active run。
- **stop-and-restart**：旧 run 收口并自动创建新 draft；新 run 仍需下一次 contract-ready/handoff 前 pin，且 roster/D3 变化须重走 D3/写卡，未在卡内自动伪造 pin。
- **legacy**：无 manifest 的旧项目任务按缺省读取；不补造 manifest、不伪装 pinned；新建 run 仅在新派发时创建 draft。
- **未改 renderer**：3.1 按计划由任务卡文本承载 runId/state/stage；run-change 卡由主进程通道呈现。
- 本批未 push、未合并 main；回滚=撤销本批提交并重跑 3.1 验证（`.ans/runs` 为运行状态，可删除/忽略；旧代码不读，不伪造历史）。

## 5. 验收 rework 处置（追加）

1. **P1.4 并发 pin flake**：`writeRunManifest` 增加按文件串行写链、唯一 tmp 名、rename 指数退避重试（6 次）；`pinRun` 增加项目级 pin 锁，active-run 检查与写入在同一锁内；`run-pin` 连跑 3 次通过（见 §6）。
2. **P1.3 legacy**：`replayTaskEvents` 对无 runId 的既有 flow 任务在内存中标记 `runState:"legacy"`；任务卡显示 `run：legacy（未冻结）`；不补造 runId/manifest。新项目任务仍由会话 preflight 要求 runId/pinned。
3. **P1.1 M1 无 flowId**：新增 `RUN_PENDING_FLOW_ID="pending"`；M1（幕僚→产品）无 flowId 也建 pending draft；后续真实 flow 到达时 `ensureDraftRun` 领养同一 runId（不新建）。补 run-pin 测试。
4. **P1.5**：flow 文件存在但为空/缺合法 `version` ⇒ `prepareRunPin` 直接拒绝；team plan 非 null 必须有 `schema: teamPlanSchema:3`（缺失即拒）；handoff pin 后 session 再跑 `verifyPinnedRun`。**team plan 的 modules/directories 与 modules+roster 的逐项一致性校验本批不做，作为 3.5 Steward 范围 A 的实施前置豁免**（manifest 只钉执行计划 path/schema/hash；模块事实仍以 modules+roster 为准，3.5 实施时接入 V11/team-plan-flow 一致性）。
5. **F5**：`findActiveRun` 使用 `listRunManifestsResult`；任一 `.ans/runs/*` manifest 非法 ⇒ 整体 fail-closed（不静默跳过）；`verifyPinnedRun` 要求七类文档键齐备（assets 键可为 null，但键必须存在）。
6. **F6**：新增计划内测试 `test/编排/run-manifest.test.ts`、`test/测试/run-pin-e2e.test.ts`、`test/门禁引擎/versioned-doc-guard-assets.test.ts`。`governance-judge-facts.ts` **无需修改**：`buildGovernanceJudgeFacts` 已用 `...input.facts` 透传 `GovernanceJudgeFacts` 的可选 `runId/runState/pinnedDocs`，生产方为 session 验收 enrich；本批用 runtime/session 填充替代修改 builder。
7. **F7 change-package**：文件已按团队计划 §4.4 统一为 `docs/scheduling/2026-10-30-flow-improvements-wave1-change-3.1.md`。

## 6. run-pin 连跑证据（P1.4）

- `node --test --test-concurrency=1 test/桌面应用/run-pin.test.ts` 连续 3 次均 **8 pass / 0 fail**：
  - `%TEMP%\ans-run-pin-final-r2-1.log` sha256 `20f2d21f027133c25a31fe00c7a121f3d4c2b300520172e9d43bcd93da7be283`
  - `%TEMP%\ans-run-pin-final-r2-2.log` sha256 `7d67a3f1051dfa43bf3ec1015eb30fdd62220651c5662bee207e489c1cc0ee4f`
  - `%TEMP%\ans-run-pin-final-r2-3.log` sha256 `9c90ac947d2fa99fb87a5ba345ae4f03cfd104da4bf351dec4413f5c1ace4eb4`

## 7. 验收 rework v2（R1–R5）

- **R1（P1.3）**：`appendTaskEvent` 增加 `allowLegacyRun` 选项；新建 `task.created`（flowId 有值）缺 `runId`/`runState` ⇒ **实时写入拒绝**，返回 `code:"run-required"`；只有历史重放/测试显式 `allowLegacyRun:true` 才能写 legacy 形状。补负例。
- **R2（P1.3，选“只读”定死）**：legacy run 在实现/验收 preflight 直接 `run-legacy-readonly`（不再含糊 run-missing/run-pin-required），验收 facts 同时标 `runState:"legacy"`；补 preflight 负例与 session 验收 facts 测试。**标准文本未改**；独立验收可同步 `run-legacy-readonly` 文案。
- **R3（P1.5）**：flow 文件为空/缺合法 version ⇒ `prepareRunPin` 直接 fail-closed；team plan 非 null 必须有 frontmatter `schema: teamPlanSchema:3`（缺失即拒，不静默升级）；补负例。
- **R4（决策点）**：team plan modules/directories 与 modules+roster 的逐项一致性仍作为 **3.5 Steward 范围 A 前置豁免**；3.1 只强制非 null team plan 的 schema/path/hash，模块事实仍以 modules+roster 为准。豁免条件：3.5 实施 V11/team-plan-flow 一致性检查后再启用该项强制。
- **R5（低）**：移除 `listRunManifests()` 便利出口，只保留 result 型 `listRunManifestsResult()`；`findActiveRun` 遇任一非法 manifest 整体 fail-closed。**跨进程锁限制**：`pinRun`/`writeRunManifest` 的锁为进程内串行（Map 链），不覆盖多个应用进程同时操作同一项目；3.1 假设单一桌面应用进程，跨进程并发写入需后续项目级文件锁。
