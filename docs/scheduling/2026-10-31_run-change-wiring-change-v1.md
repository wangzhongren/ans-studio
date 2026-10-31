# 2026-10-31 — run-change 触发与显式入口（实施记录）

- 缺陷：`docs/communication/2026-10-31_intent_run-change-unwired.md`——run-change 决策卡已实现（`SessionManager.requestRunChangeDecision`），但全仓无调用方、无 UI/IPC 入口；冻结 run 后出现已批准的新版本契约时，应用只能机械拒绝，冻结的唯一设计出口不可达。
- 授权：客户指令（2026-10-31）「现在修 run-change 触发与入口，并发布补丁版」（拟 1.8.3）。
- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\run-change-wiring`（分支 `fix/run-change-wiring`，基线 main `a445a67`）。
- 性质：实施与验证记录；冻结语义、manifest schema、§5A 专属段、Pi/Codex、release 配置均未改。

## 0. 候选与取舍

- **A 只做显式入口**（会话头按钮 + IPC）：成本最低，但现场「判官/派发连续拒绝」仍不会被主动引导，客户仍可能看不到出口——不满足「应用主动呈现」。
- **B（采用）显式入口 + 保守自动触发 + `run-change-required` 三段式**：在可机械核对的冻结冲突（派发目标角色/模块只在新版本 roster；提案卡引用更高版本 proposal）先尝试呈现 run-change 卡，识别不出则不弹并回结构化拒绝。符合「宁可不弹，不误弹」。
- **C 自动替客户选模式 / 自动 pin 新 run**：直接违反 §3.1「app 不代选」与 pin 时机（D3/handoff）——拒绝。

## 1. 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/common/编排/run-manifest.ts` | 新增只读 `findNewerContractDocs(projectRoot, manifest)` / `NewerContractDoc`：扫描 `docs/product|proposals|contracts`，返回**版本号严格更大**的同类 vN 契约文档（intent/proposal/modules/roster/architecture/assets）；只提供事实，不激活新版本、不改 manifest。 |
| `src/common/编排/mechanical-rejection.ts` | 码表新增 `run-change-required`（owner=app、retryable=true、action=应用呈现 run-change 三模式卡/会话头显式入口，决定后继续）；旧 code/旧文案不变。 |
| `app/desktop/session.ts` | ① `requestRunChangeDecision` 返回 `runId`；会话选择顺序扩展为 convener → rapporteur → chief（rank 选择，不再提前 break）。② 新增 `activeRunViews`（draft/pinned 只读摘要，供 UI 启用/禁用）。③ 派发冻结冲突自动触发 `runChangeRejectionForDispatch`（识别 run-role-missing / module-missing / module-not-owned + 更新版本 roster 且目标角色/模块只在新版本）。④ 提案卡冻结冲突 `proposalCardFrozenRejection`（cardKind=proposal + 磁盘提案版本 > pin）。⑤ `offerRunChangeOnFrozenContract`：同一 run 自动仅一次（无会话不占用名额）、先尝试呈现卡、再组装 `run-change-required` 三段式。⑥ 统筹/提案/幕僚会话可承载应用自有 run-change 卡（`request_requirement_change` 工具仍只注入 proposal/schedule，未扩大模型能力）。 |
| `app/desktop/interface.ts` | `ListProjectResult.activeRuns/activeRunsError`（listProject 附带 active run 摘要）；`DesktopInterface.requestRunChange` + `RunChangeRequestReply`：无 flowId 时仅在恰好一个 pinned run 时定位；等待 presented/answered（1.5s 界）后如实回执；不代选模式。 |
| `app/main.ts` | 新 IPC `run:change-request` → `desktop.requestRunChange`。 |
| `app/preload.cjs` | 白名单桥 `requestRunChange(input)`。 |
| `app/renderer/src/lib/platform.ts` | `DesktopBridge.requestRunChange?`（旧主进程缺省 ⇒ 按钮禁用）。 |
| `app/renderer/src/chat/types.ts` / `chat-store.ts` | `ActiveRunSummary`、`Listing.activeRuns/activeRunsError`、store `activeRuns/activeRunsError`（listProject 解析，旧 main 缺省按 []）。 |
| `app/renderer/src/chat/run-change-view.ts`（新增） | 纯视图逻辑 `runChangeButtonView`（无 pinned/多 pinned/桥缺省/读取失败 ⇒ 禁用并给原因）、`pinnedRunsOf`、`runChangeReplyMessage`（presented/answered 三模式/declined/失败 → 人话）。 |
| `app/renderer/src/shell/ChatHeader.tsx` | 会话头新增「契约变更 · 重开 run」按钮（`#run-change`）+ `#run-change-notice` 结果行；点击经 preload 桥发起，完成后重读 listProject 刷新真实 run 状态。 |
| `src/common/shared/i18n/messages/zh-CN.ts` / `en-US.ts` | 新增 `ui.runChange.*`（入口/禁用原因/结果行）与 `main.runChange.*`（无 pinned/多 pinned/呈现失败）。 |
| `test/桌面应用/run-change-trigger.test.ts`（新增） | 7 例真实触发路径（见 §6）。 |
| `test/桌面应用/run-change-entry.test.ts`（新增） | 4 例：listProject activeRuns；显式入口无/多 pinned 与无会话失败；convener 真实链路作答落账；跨层源码钉。 |
| `test/桌面UI/run-change-view.test.ts`（新增） | 5 例：按钮启用/禁用/中英文案、pinnedRunsOf、回执人话。 |
| `test/桌面应用/e2e/main.mjs` | 会话头已批准按钮白名单加入 `run-change`；新增 `RUN_CHANGE_ENTRY_PRESENT` 硬检查（无 pinned run ⇒ 存在但禁用且 title 有原因）。 |
| `test/桌面UI/phase5a-electron-smoke.mjs` / `phase4b-smoke-preload.cjs` | 真实 renderer 交互检查：有 pinned run 时按钮可用、点击走 `run:change-request`、结果行如实回显；smoke 桩通道。 |
| `test/项目管理/shared/i18n.test.ts` | 按「加 key 必须显式更新」纪律更新 key 分区计数：ui 886 / main 550 / shared 62 / preferences 3，总计 1501（新增 14 个 `ui.runChange.*` + 3 个 `main.runChange.*`）。 |

既有 `test/桌面应用/run-change.test.ts`（直接调用三模式）原样保留；未删测、未放宽、未新增 skip。

## 2. 显式入口（兜底，必有）

- 数据：`listProject` 附带 `activeRuns`（manifest 只读摘要：runId/flowId/state/pinnedAt/rosterVersion/roles/documents）；读取失败 ⇒ `activeRuns: []` + `activeRunsError`（不伪装「无 run」）。
- UI：会话头 `#run-change`「契约变更 · 重开 run」。**无 pinned run ⇒ 禁用并给原因**；多个 pinned run ⇒ 禁用并列出 flow；preload 未接线/读取失败 ⇒ 禁用并如实说明。
- IPC：renderer → `window.desktop.requestRunChange` → main `run:change-request` → `DesktopInterface.requestRunChange` → `SessionManager.requestRunChangeDecision`。`flowId` 缺省时仅在恰好一个 pinned run 时定位；0/多 ⇒ 如实失败。
- 卡由客户（或判断代批）作答；`first` 界 1.5s 内 presented/answered/declined 如实回执，超时回 `pending`（不假装已呈现）。**应用不替客户选模式**。

## 3. 自动触发（最佳努力、保守）

只有**可机械核对**的两类冻结冲突才弹卡（宁可不弹，不误弹）：

1. **派发被冻结基线拒绝**：preflight code ∈ `run-role-missing` / `module-missing` / `module-not-owned`，且磁盘最新 roster 版本 > pinned `rosterVersion`，且目标角色/模块/属主**只存在于最新 roster**（pinned roster 不含）。
2. **提案卡引用更新版本**：`cardKind=proposal`、flow 有 pinned run，且磁盘最新 proposal 版本 > manifest pin 的 proposal 版本。

满足时：先 `requestRunChangeDecision`（proposed = `findNewerContractDocs` 给出的新版本路径；会话选择 convener → rapporteur → chief，任一可呈现即可），再回 `run-change-required` 结构化拒绝。同一 pinned run **只自动弹一次**（`runChangeAutoPrompted`；无可呈现会话时不占用名额）。识别不出/最新 roster 不含目标（如幽灵角色）⇒ 保留旧 `run-role-missing`/`module-*` 拒绝，不呈现任何卡。

## 4. 三段式拒绝 `run-change-required`

- `MechanicalRejection` 形态不变：`code/missing/action/owner/docs/retryable`；owner=app、retryable=true。
- 模型回执：`formatMechanicalRejection`（拒绝：缺少…下一步…谁来做：app…[技术 code：run-change-required]）；系统行：`humanRejection` + 短 code。
- 文案按是否已呈现区分：已呈现 ⇒ 说明三模式卡已给客户；未呈现 ⇒ 指引会话头「契约变更 · 重开 run」/先打开统筹/提案/幕僚会话。
- 旧码/旧文案：未识别为冻结冲突时 `run-role-missing`/`module-missing`/`module-not-owned` 原样保留。

## 5. 模式语义不变

- `continue-frozen`：不改 run（仍 pinned），新版本不激活；拒绝仍生效。
- `stop-and-restart`：旧 run 收口（closed，不宣称完成），`applyRunChange` 生成新 draft run；新 run **必须重新 pin**（测试验证可 pin v2 文档并恢复派发新角色）。
- `stop`：旧 run cancelled，不生成新 run。
- `run-change-invalid`（选择无法映射 ⇒ fail-closed）保留；不新增 cardKind（复用 decision，`application:true`）；manifest schema/冻结规则未改。

## 6. 测试差异（真实路径，不自证 helper）

新增 `run-change-trigger.test.ts`（7 例）：

- 真实 pin（chief→convener 的 `project-handoff` 派发触发 pin，6 角色），pin 后写出 proposal v2 + architecture v2 + roster v2（新增 audio-dev/audio-core）+ modules v2；真实派发 `audio-dev` 被冻结拒绝 ⇒ 捕获 customerInput 的 run-change 卡（三选项），分别演练 `continue-frozen` / `stop-and-restart` / `stop` 的落账与后续行为。
- `stop-and-restart` 后：新 draft run 以 v2 文档 + 新 D3 重新 pin，随后同一派发成功（任务锚定新 runId/pinned）。
- 无会话兜底：会话未接客户卡通道 ⇒ 不弹卡，回执含 `run-change-required` 三段式 + 显式入口指引。
- 宁可不弹：目标角色不在最新 roster（非新版本冲突）⇒ 保留 `run-role-missing`，零卡片。
- 提案卡冻结冲突：rapporteur 真实客户通道上，提案卡被 `notPresented` + `run-change-required` 拒发，同时真实呈现一张 run-change 卡（提案卡本身不呈现）。

新增 `run-change-entry.test.ts`（4 例）：listProject activeRuns（pinned/draft）；无 pinned/多 pinned/无会话如实失败；convener 真实链路（IPC 方法）作答 `continue-frozen` 落账；main/preload/platform/ChatHeader/Interface/SessionManager/码表的跨层源码钉。

新增 `run-change-view.test.ts`（5 例）：按钮启用/禁用/中英、pinnedRunsOf、回执人话。

## 7. 验证（串行）

- 定向：新增 `run-change-trigger` **7/7**、`run-change-entry` **4/4**、`run-change-view` **5/5**；既有一组（`run-change`、`run-pin`、`rejection-copy`、`application-line`、`i18n-guard`）**34/34**；run-change 相关合集 **29/29**。均无 skip。
- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（最终代码）→ **3193 tests / 3166 pass / 9 fail / 18 skip**；9 红全部为既有 Windows symlink EPERM（环境：native/store/Pi/G4/D3 链接目录用例），**新确定性失败 0、新 skip 0**；新增 16 条测试全过。日志 `C:\Users\51054\AppData\Local\Temp\ans-run-change-wiring-evidence\final\full-tests-final2.log`，sha256 `f672d31f0baae52ea5d9c3a313d4b3d287462962890a06a59516cbe85252af8f`。
- `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` exit 0；日志同目录 `typecheck.log`（sha256 `3f6a259d7e9a3e82710a910c586e517e0aa9ee2ad7814bc4e1adc1853d51e910`）、`typecheck-renderer.log`（`52099beb2b7ca7db0f80d2421eea342877ea746286d044d95b619f7f8379a12f`）、`build-renderer.log`（`a3478f11d86b8f39c0feae6a0b1858eaa44592766a5b9093f1d1866a325904e2`）。
- 真实 Electron E2E（最终代码）：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → `E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；`CHAT_HEAD_ONLY_APPROVED_BUTTONS=true`、`RUN_CHANGE_ENTRY_PRESENT=true`；报告 `C:\Users\51054\AppData\Local\Temp\ans-run-change-wiring-evidence\final\e2e-report.txt`，sha256 `b3e9f1e933a8171caa0e58ee884fbc341cc1caa9b8bbf20e619efe7f440d1756`；完整 stdout `e2e-final.log`（sha256 `ec6aa50223f38c5255cc639d7cd328a5a692e14a734253b490598e9fd4bf5b28`）。
- phase5a（最终 build，绝对 outDir）：`node_modules/.bin/electron test/桌面UI/phase5a-electron-smoke.mjs <abs>/app/renderer/dist/index.html <abs outDir>` → **43/43 checks、failures=0**、console/CSP 0、exit 0；报告 `C:\Users\51054\AppData\Local\Temp\ans-run-change-wiring-evidence\final\phase5a-report.json`，sha256 `13737b9b7ae5b2014009cbd7ff484f8834c46a760d5c46fc99c6119695a60d2b`；完整 stdout `phase5a-final.log`（sha256 `65441ea22fffcf88dc1422297f1c37dcde527310e531ae87e524583044ae40a4`）。
- 证据目录 `C:\Users\51054\AppData\Local\Temp\ans-run-change-wiring-evidence\`（e2e/、phase5a/、final/），**不提交**。

## 8. 偏差与风险

- **自动触发只覆盖两类可机械核对场景**（派发冻结冲突、更版本提案卡）；其余拿不准场景不弹卡，走显式入口 + `run-change-required`（按客户口径「宁可不弹」）。新版本文档**写入**（规划下一 run）不触发——只有操作试图使用/因冻结被拒才触发。
- **每 run 自动仅一次**：避免重复卡刷屏；客户已选择 `continue-frozen` 后再次撞冻结只回结构化拒绝（显式入口仍可用）。
- 幕僚（chief）会话新增应用自有 run-change 卡呈现能力；`request_requirement_change` 工具仍仅注入统筹/提案（未扩大模型工具面）。
- `run-change-required` 按任务口径 `retryable: true`（决定后可按新模式继续）；若客户选 `continue-frozen`，同一操作重试仍会被冻结拒绝——这是冻结语义的正确结果，不是缺陷。
- `stop-and-restart` 只生成新 draft run（既有 `closeRun`/`ensureDraftRun` 语义），不自动 pin：pin 仍走 handoff/D3 流程（测试验证可 pin）。
- 提案卡触发以「磁盘最新 proposal 版本 > pin」为判据；若角色仅更新 roster 而未更新 proposal，提案卡不受影响（避免误弹）。判官证据文案本身未改（本批不扩大到 judge 证据链）。

## 9. 回滚

撤销本批提交（单提交）并重跑 §7；`run-change-required` 码表、UI 入口、IPC 与自动触发一起回滚；既有 run-change 三模式与 `run-change-invalid` 不受影响。
