# RR34 真机验证记录：修正基线后重跑 Path B——应用自行修复《江湖夜雨》并合入 main，RR-03 九项可玩性全过（2026-11-12）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务：修正 clean baseline（保留 `.ans/project.json` trio 治理 + 角色绑定，仅清工作流状态）后重跑 Path B：让应用自己的修改流程把游戏修到可玩；合并后做真实浏览器九项可玩性验证
- 应用候选：B34 代码（`d3baf37905c57b0225a8c73999621f5e7f686e36`）；运行时工作树 HEAD `8ae1837`（= d3baf37 + RR32/RR33 记录提交；产品代码与 d3baf37 相同）；src/app/test 干净
- 新运行根：`C:\Users\51054\Desktop\work\ans-wuxia-roguelike-rr34-2026-11-12\`（新建 `target/`、`rr/`、`evidence/`、`userData/`、`play-evidence*/`；旧运行根与 RR30 目录零触碰）
- 目标：由 RR30 target 复制（含 `.git`、index.html、game/、docs/、角色卡/、README、.gitignore），随后清理 `.ans`：
  - **保留** `.ans/project.json`（3,229 bytes，sha256 `750f4911d91a2a866f5863bc669be79036497a953734bb9d35d34c008eb6eae6`，`governanceModel:"trio"` + 9 角色绑定）、`.ans/git-home/`、`.ans/state/doc-freezes.json`（1,568 B）、`versions.initialized`（51 B）、`versions.jsonl`（3,512 B）；
  - **删除** `.ans/sessions/`（59 MB）、`.ans/state/logs/`（872 KB）、`.ans/state/workflows.jsonl`（44 KB）、`tasks.jsonl`（260 KB）、`basis.jsonl`（8 KB）、`releases.jsonl`（4 KB）；
  - 复制后记录：`git log --oneline -1` = `8724c07 ANS release merge …`；`git status` 空；当前分支 `ans/task/wf-739312023202ee992b7c8955`；HEAD=main=`8724c07`；确认无活动 workflow 文件；导入后角色列表 **15 个（含 chief）**，trio 治理生效。
- 客户消息（唯一，经真实 UI 发送）：「打开游戏点「踏入江湖」开始后马上崩溃：浏览器控制台每帧报 Uncaught TypeError: Cannot read properties of undefined (reading 'pressed')，游戏完全无法进行；请修复到可玩（移动/自动攻击/波次/经验升级/拾取/死亡重开都要正常）。」
- 环境：真实 Electron 44.7.0（隔离 `userData`）+ 真实模型（native 记录 `deepseek-v4-1-flash-261017`）+ 真实生产 UI；CDP 9224 仅本轮（9222/9223 运行期 0 监听）；浏览器：真实 Microsoft Edge Edg/157.0.4341.46，窗口化非 headless，CDP 9333；不读/未打印 `.env`
- 预算（已批准）：客户消息 1；客户卡 ≤2（merge-main；decision ≤2）；真实任务 ≤30；Git ≤6；≤60 分钟；失败即停、不重试不追加；固定路径出现 shell 审批卡即 gate 早停并记录

**结论：RR34 通过（流程成功 + RR-03 九项可玩性全过）——应用在修正后的干净基线上正确走完修改路径（Path B：B1 影响面分析 → **幕僚直接发 B3 advance** → 应用记录 `change.scope-decided` → loop-engine 实现修复并提交 → B4 发布 → merge-main 客户卡作答 → 交付说明等待回合 settle），修复提交 `66fae06`，target main 合并提交 `87db6a7c…`（mergeOid **`87db6a7c489f60cf4e77f5bd538e31f83693f25b`**）；合并后用真实浏览器验证九项全部通过、控制台 0 error，被游玩产物 27/27 文件与 main 提交 blob 逐一匹配（`game/app/app.js` = `d1203dff…`，含 `wasPressed` 方法调用修复）。未伪造通过。**

---

## 一、安全/编辑纪律

- 未修改产品代码/测试/角色卡/边界/其它文档；本记录与 `_evidence/` 为唯一仓库写入。实现修复仅经应用流程由 loop-engine 写入 `game/app/app.js` 并提交。
- 未合 ans-studio `main`、未打 tag、未发布产物；target `main` 仅经应用 `merge-main` 通道本地合并（未 push/tag/发布）。
- 端口：Electron 仅 9224（运行期 9222/9223 0 监听）；浏览器 CDP 9333（仅可玩性验证）；未读/打印 `.env`。
- 旧运行根零触碰：驱动内建检查 **34/34**（含 RR30 根目录/target 与 RR30 各子目录（rr31/rr32/rr33/evidence/userData 等），以及 rr1–rr29/snake 目标），见 `zero-touch.json`；复制 target 为只读操作。
- 固定路径 shell：本轮 shell-gate 记录 10 条唯一命令，全部为实现/运营的普通 Git 操作（`git status/log/add/commit/rev-parse/show`，含带引号单消息 `git commit -m "fix(loop-app): …"`），shell 门放行；**未出现 shell 审批卡**。

---

## 二、RR34 时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 16:19:2x–16:19:31.874 | Electron CDP 就绪；导入 RR34 target；**角色列表 15（含 chief，trio 生效）**；打开 chief 会话；**唯一客户消息**发送（compose mark 16:19:30.354） | `drive.jsonl`、`ui-01-imported-body.txt` |
| 16:21:00.098 | **`workflow.started wf-08a64bc64db25ab9650a5372`（flowId=wuxia-roguelike，path B）** + `stage.requested B1`（`t-mwcbsu2q-32509e8e`） | `ledgers/workflows.jsonl`、`drive.jsonl` |
| 16:23:22.909 | 运营 B1 报告 done（落盘 `docs/scheduling/wuxia-roguelike-b1-impact-v2.md`，未覆盖 v1）；16:23:51.391 幕僚收口 B1 任务 accepted——但**无属主生产任务回执**（首次运营向 loop-engine 误用了 `taskKind:"stage-request"`，被应用拒绝 `stage-request-invalid`），B1 未完成；幕僚直发 B3 被拒 `stage-transition-invalid`（当前 B1(requested)） | `ledgers/tasks.jsonl`、`sessions/*.jsonl` |
| 16:25:30.430–16:25:39.347 | **B1 补齐 attempt 2**（`t-mwcbymny-4ac78b50`）；运营以普通 `dispatch_task` 派 loop-engine（`t-mwcbytjn-92613679`，stage=B1、moduleId=loop-app、read-only）；`basis.recorded bas-ce1c2c83bf75a4508d744b48`（reason `path-b`）+ `basis.verified` | `ledgers/*`、`drive.jsonl` |
| 16:26:11.262–16:27:45.834 | 运营报告 attempt 2 done（v2+v3 报告）→ 幕僚收口；loop-engine 只读复核报告 done（16:26:47.562，根因与 v2 一致）→ 幕僚 B1 收尾 attempt 3（16:27:22.174）→ 运营 `close_created_task` 收口属主任务（16:27:45.834，`stageCompleted=true`）；**`stage.completed B1` 16:27:25.909** | `ledgers/tasks.jsonl`、`ledgers/workflows.jsonl` |
| **16:28:28.251–.256** | **`change.scope-decided`**（scope.files `["game/app/app.js"]`；effectiveWritesets loop-engine `["game/app/app.js"]`；impactReport 指针 `game/app/integrations.js`——见披露）→ **`stage.requested B3`**（`t-mwcc2fvk-d8ef7983`）。**本轮没有发 B2 stage-request**（B34 的 `b2-stage-request-forbidden` 门未被行使；幕僚按更新后资源直接发 B3） | `ledgers/workflows.jsonl`、`drive.jsonl` |
| 16:28:44.826–16:29:28.025 | 运营派 B3 实现任务 `t-mwcc2snu-9d0ba155`（loop-engine，moduleId loop-app，stage B3，sideEffect=code）→ loop-engine 完成**最小修复并提交**（仅 `game/app/app.js`，`var input = engine.input;` + 5 处 `input.wasPressed(...)`） | `ledgers/tasks.jsonl`、`sessions/loop-engine.jsonl` |
| 16:30:55.122 | 运营收口实现任务 accepted → **`stage.completed B3`**（artifact `game/app/app.js` sha256 `d1203dff0120b5899f869a41b832853a39fe75894384554c7543c41cbc917d2d`） | `ledgers/workflows.jsonl` |
| 16:30:55.305–16:30:56.318 | B4 请求 + **merge-main 卡** `rel-f0c24880f055b129770a8184`（tip `66fae06a…`，base `8724c07…`）；驱动经真实 UI 选中 `approve-merge-main` 提交（`by:"customer"`）→ `release.confirmed` → **`release.merged`（16:30:56.316，mergeOid `87db6a7c489f60cf4e77f5bd538e31f83693f25b`，files: game/app/app.js）** → `stage.completed B4` + **`workflow.closed outcome:"delivered"`** | `ledgers/*`、`drive.jsonl`、`ui-card-01-pre/after.jpeg` |
| 16:31:57.867–.899 | **B4/交付说明回合**：幕僚给出修复说明、提交 OID、流程与验证强度，并如实披露「**运行期未验证**（本环境没有浏览器/DevTools 通道）、请客户实测」；交付回合 settle（`61e356a4-…`，waitMs 61,208） | `sessions/chief.jsonl`、`drive.jsonl` |
| 16:32:03.547 | 驱动 finalize（`success:release-merged-and-delivered (delivery turn settled)`），Electron 关闭；驱动 exit 13（已知机械） | `final-report.json`、`driver-console.log` |

**关键事实**：标准 Path B 全链无阻塞；无 B2 stage-request（B34 新门未行使）；无 shell 审批卡；merge-main 卡由驱动作为客户经真实 UI 作答；交付说明如实披露运行期未验证。

---

## 三、预算实际 vs 批准（RR34）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤2（merge-main；decision ≤2） | **1**（merge-main；`by:"customer"`，驱动经真实 UI 作答）；decision 0 |
| 真实任务 | ≤30 | **6**（chief→convener 4 + convener→loop-engine 2；接收：convener 4、loop-engine 2）；实现写任务 1 |
| Git add/commit | ≤6 | **3**（target 2：修复 `66fae06` + merge `87db6a7`；我的 RR34 记录/证据提交 1） |
| 墙钟 | ≤60 分钟 | 驱动约 **12.6 分钟**（16:19:2x–16:32:03.547）+ 浏览器验证约 4 分钟（v2 16:40:40–16:43:15，另 v1 与 level-up 补充截图）；≤60 |
| 模型轮次 | 单独如实报告 | settled：chief **10** · convener **6** · loop-engine **2**；模型 `deepseek-v4-1-flash-261017`；无 `cost_usd`，费用不估算 |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 四、路径 B 事实（B34 新门未行使；B3 直进）

- **路径判定**：`workflow.started path:"B"`（新 workflow `wf-08a64bc64db25ab9650a5372`；无遗留活动 workflow）。
- **B1**：运营派 loop-engine（模块属主 loop-app，`game/app/`）只读影响面分析；根因与 RR30 完全一致（`pollFrameInput` 解引用 `engine.input.wasPressed`，严格模式 `this=undefined`，每帧 TypeError；最小修复仅 `game/app/app.js`）。两次补齐后 B1 完成，影响面报告 v2（结论）+ v3（更正派发记录）。
- **B2/B3**：**没有 B2 stage-request**——幕僚在 B1 完成后直接发 **B3 advance stage-request**，应用在受理 B3 前自动记录 **`change.scope-decided`**（impactReport 由应用从 B1 生产任务 done 报告 evidence 中取；scope.files 由 B3 请求 `requestedEvidence` 候选 `["game/app/app.js"]` 派生；effectiveWritesets loop-engine `["game/app/app.js"]`）。**B34 的 `b2-stage-request-forbidden` 门本轮未被行使**（无 B2 请求），与实际预期一致。
- **B3 实现**：loop-engine 按写集修改并提交（`git add game/app/app.js` + `git commit -m "fix(loop-app): pollFrameInput 以方法形式调用 wasPressed"`，单引号/带引号单消息形态符合 B32 门）；提交 `66fae06`（+6/−4，仅 1 文件）；运营收口 accepted → B3 完成。
- **B4/发布**：B3 accepted 后应用自动请求发布并呈 **merge-main 卡**；驱动以客户身份经真实 UI 作答 approve → `release.confirmed` → `release.merged`（mergeOid `87db6a7c489f60cf4e77f5bd538e31f83693f25b`）→ B4 完成、workflow.closed delivered。
- **交付说明**：幕僚回合（16:31:57）汇总修复内容/提交/流程，并**如实披露运行期未验证**、请客户用真实浏览器实测；驱动等待该回合 settle 后才 finalize（同 RR30 规则）。

---

## 五、合并后真实浏览器可玩性验证（RR-03）

**环境**：真实 Microsoft Edge **Edg/157.0.4341.46**（CDP `Browser.getVersion`），窗口化非 headless；CDP **9333**；`file:///C:/Users/51054/Desktop/work/ans-wuxia-roguelike-rr34-2026-11-12/target/index.html`；页面状态经 `WX.App.getSnapshot()` / `getInstance().getPlayerState()/getEnemies()/arsenal.getInventory()` 读取，输入经 CDP 真实键盘/鼠标事件；反节流配置：`--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling` + `Page.bringToFront` + `Emulation.setFocusEmulationEnabled` + `Page.setWebLifecycleState(active)`（**raf 实测 132 帧/秒**）。

**被游玩产物哈希**：main/HEAD = `87db6a7c489f60cf4e77f5bd538e31f83693f25b`；工作树与 main 提交**逐文件匹配 27/27（0 MISMATCH）**；`index.html` `396c5330…`、`game/app/app.js` `d1203dff…`（含修复）、`game/engine/input.js` `b38d0012…`（未改）；`git status` 空。完整清单见 `play/artifact-hashes.txt`。

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| ① 菜单渲染 | **pass**：菜单正常渲染（「踏入江湖」），无启动错误；快照 MENU | `play/01-menu.png`、`play/playability-summary.json` |
| ② 角色移动（WASD/方向键） | **pass**：D 右移 143px、W 上移 140px、← 左移 111px（真实按键） | `play/03-move.png`、`drive-playability.jsonl` |
| ③ 自动攻击敌人 | **pass**：无攻击输入下击杀自动发生（击杀 1 → 最终 86），攻击特效/伤害正常 | `play/05-combat-kills.png`、`play/06-exp.png` |
| ④ 波次与刷怪 | **pass**：波 1 刷出 2 敌；波次推进至 2/3/4（HUD 与日志），结算 stats `wavesCleared:3` | `play/04-wave1-enemies.png`、`play/08-upgraded.png`（波 3/6）、`play/12-gameover.png`（波 4）、`drive-playability.jsonl` |
| ⑤ 击杀与经验 | **pass**：击杀 86，经验拾取与修为增长（exp 12.15、level 12），HUD 修为条/数值同步 | `play/05-combat-kills.png`、`play/06-exp.png`、`play/08-upgraded.png` |
| ⑥ 升级强化选择 | **pass**：多次进入「顿悟」三选一面板并选择（会心一击/凌波微步/破甲诀/铁布衫/朝阳诀/剑气纵横/疾风剑式/金钟罩），等级 1→12 | `play/07-levelup.png`（面板截图，补充会话）、`play/07-levelup-cards.json`、`play/08-upgraded.png`、`drive-playability.jsonl` |
| ⑦ 武器/道具拾取 | **pass**：拾取武器「柳叶飞刀」（ownedWeaponIds iron-sword→iron-sword,liu-ye-dao，active 切换）、道具护心镜/护心经/轻功鞋（层数增加） | `play/10-pickup.png`、`play/11-after-pickup.png`、`drive-playability.jsonl` |
| ⑧ 死亡与重开 | **pass**：自然死亡 → GAME_OVER（`result:"defeat"`，hp 0，stats kills 86/level 12/wavesCleared 3）；点击「再战江湖」→ PLAYING（hp 100、elapsed 0、kills 0） | `play/12-gameover.png`、`play/13-restart.png` |
| ⑨ 控制台 0 error | **pass**：`Runtime.exceptionThrown`/`Log`/console 全量捕获 **0 error / 0 warning**（无逐帧 TypeError） | `play/console-summary.txt`、`play/drive-playability.jsonl` |

**判定：RR-03 通过（九项全过；控制台 0 error；产物哈希与提交一致）**。

**首次尝试（v1）披露**：`play-v1/` 记录了一次真实浏览器尝试——页面渲染、开始游戏、波 1 刷怪正常且控制台 0 error（证明崩溃修复生效），但浏览器窗口被遮挡/未激活导致 `requestAnimationFrame` 被 Chromium 重度节流（7 分钟仅推进约 0.4 秒游戏时间），移动/击杀/升级/拾取/死亡无法在合理时间内验证；这是**测试环境节流**而非游戏缺陷，已按此判定并保留证据。v2 用反节流参数 + 前台/焦点仿真重跑，raf 132 帧/秒，全部九项通过；**v2 为权威结果**。

---

## 六、披露（诚实性）

1. **D1 v1 节流（tester-side）**：首次浏览器尝试因窗口遮挡/未激活导致 rAF 节流（见上）；改为反节流启动 + bringToFront/焦点仿真后 v2 全过；v1/v2 使用同一产物与同一修复，v1 的控制台 0 error 与可见渲染也支持修复生效。
2. **D2 impactReport 指针异常（应用观察，非阻塞）**：`change.scope-decided.impactReport` 记录为 `game/app/integrations.js`（sha256 `c57c5b71…`），而非 B1 影响面报告文档；scope.files 与 effectiveWritesets 正确（`game/app/app.js` ← B3 请求 `requestedEvidence`）。这是应用从 B1 生产任务 done 报告 evidence 倒序取「第一个可读项目内文件」的实现造成的指针偏移；不影响写集/修复/发布，但建议应用侧修正（应指向 B1 影响面报告或明确声明来源）。
3. **D3 运营首次 B1 派发误用 `taskKind:"stage-request"`**（`stage-request-invalid` 被拒，无属主任务 → B1 未完成）；幕僚通过 B1 补齐 attempt 2/3 与普通生产任务恢复，未伪造回执。已如实记录在 `ledgers/tasks.jsonl` 与 v3 报告。
4. **D4 交付说明披露运行期未验证**：幕僚的 B4 交付说明如实写明「本环境没有浏览器/DevTools 通道，运行期未验证」，未宣称实机通过；随后的真实浏览器 RR-03 验证由测试角色独立完成并通过。
5. **D5 merge-main 卡作答方**：卡由驱动作为「客户」经真实 UI 选项 `approve-merge-main` 提交（`request.resolved by:"customer"`），无人工介入；与 RR28/RR30 同口径。
6. **D6 驱动 exit 13（机械）**：`Browser.close` 后 Node 顶层 await 未 settle，驱动 exit 13（`driver-console.log`）；证据在关闭前已写盘。
7. **D7 无 shell 审批卡**：10 条唯一 shell 命令均为普通 Git 操作并被放行；未出现审批卡/额外客户门；无人工作答。
8. **D8 旧根零触碰**：34/34（含 RR30 根/target 与 RR30 子目录 rr31/rr32/rr33）全部未变；复制 target 为只读。
9. **D9 浏览器/端口**：Electron 仅 9224；浏览器 CDP 9333（v1/v2/补充截图）；9222/9223 运行期 0 监听；未读 `.env`。

---

## 七、判定、遗留与建议

**判定：RR34 通过**。

- 应用路径：**Path B 全链成功**（新 workflow → B1 影响面分析 → **B3 直进** → `change.scope-decided` → B3 修复提交 → B4 → merge-main 客户卡 → 交付说明等待 settle）。
- 修复提交：`66fae06a1535e6ef4ec96c130166e5a6c4c9dff1`（`fix(loop-app): pollFrameInput 以方法形式调用 wasPressed`，仅 `game/app/app.js`，+6/−4）。
- 合并：release `rel-f0c24880f055b129770a8184`，base `8724c07…`，tip `66fae06…`，**mergeOid `87db6a7c489f60cf4e77f5bd538e31f83693f25b`**（target main，本地合并，未 push）。
- RR-03：**九项全过**；控制台 0 error；被游玩产物 27/27 与 main 提交一致。
- B34 `b2-stage-request-forbidden`：本轮**未行使**（无 B2 请求；直接 B3 符合更新后资源）；该新门的真机验证仍可另轮覆盖（非本轮阻塞）。

**遗留/建议（供协调方/应用 owner，不在本角色范围实施）**：

1. **impactReport 指针修正**（D2）：`recordFixedPathBScopeDecisionForDispatch` 取 B1 生产任务 done 报告 evidence 的第一个可读文件时会命中源码（integrations.js）；建议优先取影响面报告文档或记录明确的 impactReport 来源。
2. **B34 新门真机覆盖**：可在下一轮让幕僚显式尝试一次 B2（预期 `b2-stage-request-forbidden` 且状态不推进），以完成该门的真机证据。
3. **交付说明**：本轮交付说明的「运行期未验证」是诚实且正确的；应用可考虑在 B4 交付说明中提示客户「可用真实浏览器自测」的要点（现有人工提示已足够）。
4. **环境**：后续浏览器验证建议固定使用反节流参数 + 前台/焦点仿真（本记录已给出可复现配置），避免 Windows 遮挡节流造成假阴性。

---

## 八、关键哈希（SHA-256）

- 本记录：见 `record-file.json`（写盘后计算）
- `final-report.json`：`69469ad37ec4c61c407bf0d56e4de91f1c143868959dba2c3817ed2b44bc268f`
- `drive.jsonl`：`7e7b06824813d2b3e77f7e0bcc050360c2fc818aefa1378a0388bb835ccc536a`
- `budget.json`：`c5df26e435c441e5e07a9d9951b4334ee1a8dd9bb31aea8defb87bfbe7cfdeda`
- `pre/pre-state.json`：`70adaa785b0821d92982fc498781fe8fddcfa7fe4c0228edfbebce68b2145f84`
- `ledgers/workflows.jsonl`：`f71c262da0475ca1151a004e2fa480dfec1d76048d25ddebc2caa26b1e1982da`
- `ledgers/tasks.jsonl`：`c446a13461e41c45e048ec3911547fd14a17b4154cf972128dd82d741ad698cd`
- `ledgers/basis.jsonl`：`d676c68f982217873aff5b3c83c6f09c82f56e911739e7120c54ca3c862fb2f2`
- `ledgers/releases.jsonl`：`7a88fe6d7376d02afe757122d822580f7597b960ccc4c6c699b16289ddd099df`
- `ledgers/shell-gate.jsonl`：`7cf30de201597d87c626c57757e8f265ffa95b6b3460dccc877cbe7519f7d24d`
- `shell-commands-rr34.txt`：`684d9d2d703e59fd77a3cda31a8aa68c23182f9030f6a3f6de79594eb8d309fd`
- `diagnostics-rr34.jsonl`：`1f0f125b01b3155a8490f95cdf7ec7b9d9c74839f9b04519be13e3548593a0eb`
- `zero-touch.json`：`207299851fce2ac1af0ee0fc6510830d168e2661b474f324626cc32e6447d3d4`
- `sessions/chief.jsonl`：`7baaa6629fe17a7875150e00b3c7627950609791a5debfb2c3d7b750b3675513`
- `sessions/convener.jsonl`：`c66cde4a743d70392be81a7f1962ecec09775323b8845699441788cb3e649a3c`
- `sessions/loop-engine.jsonl`：`cbe484ae81e8c598301649a8a76f643aca77b8c6a49d6eeb842a65d77b6ca5f9`
- `play/verdict.json`：`b60ce2b32c454746f5a28cd6f02144c59a1b50dc975089ef9dd23532c8a04e60`
- `play/playability-summary.json`：`2695259ac549ac0b4ffb8a3f188066b44094e8fc7c25028181c6ab4e18afce18`
- `play/artifact-hashes.txt`：`51650cf0adf80ff8195ab5eacedd2f827ba20f4b0063096e887b78842b64597e`
- `play/07-levelup.png`：`896091228d7651e6c8ba9d46d744f70220be2e022f1744c45b9024c3368097f5`
- `play/12-gameover.png`：`5effd71d98249dc1d6584cfce7854e1252cfdb294d90583f182651dadb8ba782`
- `play/05-combat-kills.png`：`4ff13d500db65d25526262613e3d29ba13e82ec74d7da6fc0f90a424838ffd02`
- `play/10-pickup.png`：`cab04cf8e03ba27e9e83f5abb69837aecc220896a2895b9ac9d17a405a41a7f4`
- 完整清单：`_evidence/sha256sums.txt`
