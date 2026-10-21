# 测试 变更记录

## 2026-10-21（修复后构建 34484f3 真机复核）— 需求卡/角色名/品牌图标/派发去重全过；genesis 加载自动恢复 verifier 待办

**触发**：PR 分支修复 `34484f3`（dedupe replayed dispatch rows、黑底绿 ANS 图标、watchdog 默认不再 15min 自动中止），用修复后构建做真机复核。

**构建**：HEAD `34484f3`；新 dist HTML `f779ac60…`（CDP 取载入原文哈希一致，581 B）、JS `index-CFjc0h-3.js`、CSS `index-BYYh-X8f.css`、图标 `ans-studio-ans-icon-DOpmqMAU.png`。开发版独立 userData `/tmp/ans-fixed-userdata`、端口 9340；Pi 菜单「已配置」（Codex/Claude 缺配）；模型 `ans-gateway / deepseek-v4-flash[1m] / medium`。

**需求卡**：空 intent-card demo 发送需求后 **22.62s** 卡片可见（`request_choice cardKind=intent-confirm flowId=todo-web-app`）。Lead pane、徽标「需求确认 · 客户」、`权力类型：需求确认`、confirm/revise 与提交/取消均可见未遮挡；卡片落尾（row 7/8，lifecycle「调用发起」）。计时：UI busy 0.46s、首模型活动 4.75s、写意图 17.58s、intent 调用 22.66s、卡片 22.62s、停止 27.30s、总计 29.32s。未回答，卡片 expired。**未出现写盘卡**（docs/intents 预授权，write_file 直接「已获准并落盘」5370 B）；README 哈希不变，仅 demo 内意图文件（`d819ea6f…` 与 ledger 一致）+ app 自动 `.ans/sessions`。

**角色名/图标**：角色树 `主理 / Lead、Draft / 提案、Crew / 组队、Steward / 统筹、验收 / Proof`，旧称不存在；标题栏 `img[alt=ANS]` 20×20、左栏 `img[alt=ANS]` 30×30（自然 1024，黑底绿 ANS），旧 `span.titlebar-mark` 为 null，无文字 mark；1360/960 截图通过。

**派发去重（genesis 只读回放）**：convener replay 355 行、去重前 8 个派发投影（4 user + 4 event）→ **UI 4 条**（行数 229），无重复；todo-app-dev 473 行、去重前 10（5+5）→ **UI 5 条**（行数 322），stepId 各一次：delivery-store、delivery-tests-docs、delivery-ui、integration-e2e、verification-evidence。任务预期 todo-app-dev 2 条为旧快照；点名两条各一次，另三条不同步骤也保留、无误删。零 console/CSP。

**风险发现**：加载 genesis 项目会自动恢复一条 verifier 待办并启动真实模型回合（14:55:02 提示、14:55:13 `request_confirmation` 调用发起），向 verifier replay/native **追加 12,324 B / 10,770 B**；未发消息、未点卡。已停止并按原哈希前缀截断恢复（383,859 B / 443,904 B），genesis **61 文件 SHA-256 与事前完全一致**，追加副本留在 `genesis-post/changed/`。建议产品/PM 确认「加载即恢复待办」是否符合只读/静默预期。watchdog 15min 默认关闭仅按提交 diff 静态核对，未做 15min 实跑。

**结论**：本复核范围内**可合并**（需求卡/角色名/图标/去重全过）；genesis 自动恢复为风险项待产品确认。**边界**：只写 `角色卡/测试/`；未改产品/构建/配置/断言；未读/打印 `.env`；未 commit/push。报告 [2026-10-21_change_fixed-build-real-machine.md](docs/change/2026-10-21_change_fixed-build-real-machine.md)，证据 [2026-10-21-fixed-build-real-machine-evidence/index.md](docs/change/2026-10-21-fixed-build-real-machine-evidence/index.md)。

## 2026-10-21（需求确认卡 intent-confirm 真机 e2e）— 卡片弹出、断言全过、未作答

**触发**：验证 Lead 在真实 Pi 模型流程中是否发出「需求确认卡」（intent-confirm），只验弹出、不点确认/修改。

**环境**：macOS 26.6.2 arm64、Electron 44.7.0、HEAD `a18e9ef`、dist HTML `c8ad0e82…`/JS `index-Oqlp-kNL.js`；新空 demo `ans-testbed/ui-platform-intent-card-e2e`（git init、README 提交 `49df32d`）；开发版独立 userData `/tmp/ans-intent-card-userdata-run2`、端口 9338；Pi 菜单「已配置」（Codex/Claude 缺配）；模型 `ans-gateway / deepseek-v4-flash[1m] / medium`。

**结果**：发送「我想做一个最简单的待办清单网页应用，请先确认需求。」后 **23.80s** 需求确认卡可见（`request_choice` `cardKind=intent-confirm` `flowId=todo-list-web`）。卡片在 Lead pane（`surfaceRoleId=liaison`、选中/会话均 liaison、状态「待选择」），徽标「需求确认 · 客户」、`权力类型：需求确认`、confirm/revise 两个选项与「提交/取消」均可见且 `unobstructed=true`；1360×860 与 960×620 截图完整（截图像素即两档尺寸；960 为视口级窄档、外层窗口保持 1360×860，卡片完整位于 composer 上方）。首个模型活动 5.46s、写意图 20.12s、卡片 23.80s、停止本轮 28.36s，驱动总耗时 30.43s。截图后仅点「停止本轮」，**未回答需求卡**；卡片转 `expired`（未获同意）。

**写盘/项目**：本轮**未出现写盘确认卡**——trio 下 Lead 的 `docs/intents/**` 为预授权目录，`write_file` 直接回执「已获准并落盘」。demo README SHA-256 前后一致；仅 demo 内新增 `docs/intents/todo-list-web.md`（sha256 与 `.ans/governance/ledger.jsonl` 的 artifactSha256 一致）与 app 自动写的 `.ans/sessions`/账本；无 ANS 仓库或 demo 外写入；`git status` 仅 `?? .ans/`、`?? docs/`；console/CSP **0**。

**观察**：① 模型先发过一张非治理 `request_choice`（质量档位三选一，无 cardKind），被编排结构性拒绝、未弹卡后自行定档并继续（符合 Liaison 只发 intent-confirm 的隔离）；② 需求卡实际工具是 `request_choice`（Lead 契约不用 `request_confirmation`），落尾锚定其自身尚未完成的调用（lifecycle「调用发起」）；③ 960 下「1 条待确认 · 定位」浮标与卡片动作区右下缘轻微视觉重叠，按钮中心未遮挡。run1 与 run2 均弹出，run1 因 960 未重滚仅作交叉印证（归档 `run1/`）。

**边界**：只写 `角色卡/测试/`；未改产品代码/构建/配置/测试断言；未读取/打印 `.env`；未 commit/push。报告 [2026-10-21_change_intent-confirm-card-e2e.md](docs/change/2026-10-21_change_intent-confirm-card-e2e.md)，证据 [2026-10-21-intent-confirm-card-e2e-evidence/index.md](docs/change/2026-10-21-intent-confirm-card-e2e-evidence/index.md)。

## 2026-10-21（角色显示名修复后真机重跑）— 新 dist / 新角色名 / MIRROR 8/8 / 真实 Pi 模型

**触发**：客户补充——角色显示名修复（proposal→Draft/提案、nomination→Crew/组队、schedule→Steward/统筹）已落盘并由桌面UI `build:renderer` 重建 dist；要求重启开发版再完成真机模型测试。

**dist**：HTML `c8ad0e82…`、JS `index-Oqlp-kNL.js` `050776ec…`、CSS `76fad7ce…`（22:11:42）；gzip9 289,080B、CSP 严格。旧 Electron 进程杀掉，新临时 userData `/tmp/ans-model-userdata-fix` 重启。

**角色名**：角色树实测 主理/Lead、Draft/提案、Crew/组队、Steward/统筹、验收/Proof；旧称“报告员/提名官/召集人”均不存在。MIRROR 真机 **8/8**，含 `W6-C five-role tree: ...Draft/Crew/Steward/Proof`、`status line shows 三权 · 五角色`、`mirror card rendered...` 全 true。

**真实模型**：Pi 菜单“已配置”（Codex/Claude 缺配）；`deepseek-v4-flash[1m]`（ans-gateway，context 262144）回复 563 字；working 467ms→idle 4,574ms，首模型活动 1.375s、最终正文 4.195s；工具仅 `list_dir`，无写盘/确认卡，无 console/CSP，960/1360 无横溢。

**只读**：README 哈希不变；无源码/治理写入；app 自动写 `.ans/sessions/liaison/pi` 3 文件 42,249 B（git `?? .ans/`）。打包 zip 仍是修复前构建（旧称），若包内需新称须重新打包/冻结。main.mjs 新 dist 重跑 `E2E_PASS=true`/397 名/17 截图。

**边界**：只写 `角色卡/测试/`；未改产品/测试/构建；未读/打印 `.env`；未 commit/push。详见[真机报告](docs/change/2026-10-21_change_real-machine-test.md)与[证据](docs/change/2026-10-21-real-machine-evidence/index.md)。

## 2026-10-21（macOS 真机）— 整机 e2e、打包应用空项目、开发版 Pi 真实模型

**环境**：macOS 26.6.2（25G83）arm64；Electron 44.7.0；Node 24.14.0；候选 HEAD `224cf83`，dist HTML `3c4da2a2…`/JS `f568e2aa…`/CSS `76fad7ce…`；包 `ANS-Studio-1.4.0-mac-arm64.zip` `8e760887…`/405,227,230 B（与既有验收 `edeeef…` 不同，待 PM 确认）。

**整机 e2e**：`main.mjs` 真机 exit 0，`E2E_PASS=true`、`E2E_FAILURES=` 空，入口 repo `dist/index.html`，397 名、17 截图；stdout 的 repair 探针异常为夹具故意触发。

**打包应用**：临时 userData 启动；入口包内 `dist/index.html`；preload 桥正常、console/CSP 0；空项目 5 内置角色（主理/报告员/提名官/召集人/验收）、`governanceModel=trio`、`governanceRecord=missing`、S0 标题/说明/CTA 正确且仅一次提及、无治理 CTA；设置如实缺 `ANTHROPIC_API_KEY`；工作概览/资料/队列空态；Esc/焦点正常；关闭重开保持；项目前后文件清单/git 完全一致（打包未写）；包内 `.icns` 与 Dock 均为黑底绿字 ANS。

**真实模型**：开发版 + Pi（菜单“已配置”，Codex/Claude 缺配）；空项目点击 Lead 发送一条不写文件消息，真实 `deepseek-v4-flash[1m]`（provider ans-gateway）回复 510 字；working 464ms→idle 5376ms，首模型活动 1.713s、最终正文 5.163s；工具仅 `list_dir`/`read_file`，无写盘工具/确认卡；Markdown 正常、无 console/CSP、无白屏。**app 自动写项目 `.ans/sessions/liaison/pi` 3 文件 46,117 B**；README 未变、无源码/治理写入。

**发现/待确认**：空项目状态行未显示「三权 · 五角色」（实际“尚无治理记录…”）；会话历史自动写 `.ans/sessions`；包哈希与既有验收不同。

**边界**：只写 `角色卡/测试/`；未改产品/测试/构建；未读/打印 `.env`；未 commit/push。详见[真机报告](docs/change/2026-10-21_change_real-machine-test.md)与[证据](docs/change/2026-10-21-real-machine-evidence/summary.json)。

## 2026-10-21（独立验收 AC3/AC8 补正）— OPEN_CARD 台账、计数、探针、套件版本限制与候选分离

**触发**：独立验收报告 `角色卡/独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md` 判 AC3/AC8 needs-work；产品门不重跑。

**补正**：
- `OPEN_CARD_AT_ARRIVAL` final3 旧 207→新 206：补列 G3（索引归一化，PM §19.3；`OPEN_CARD_STABLE_AT_ANCHOR=true`），G3 25→26；post-fix3 `final-allowed-diff-ledger.json` 由 G0-MATCH 207/207 改为 G3 207/206，MD 台账同步；final3 75 条值差异全部登记，MATCH-FAIL=0，无未批准行。
- 计数统一：679（5A 前）→**683**（+4 桌面窗口 5A 检查，raw `baseline.txt`）→**504**（5B 删 178 项旧四测试 + 1 hot-path ④ 段；683−178−1）。修正 `old-red-status.md` 与 5A 旧基线报告的 679 文字。
- 探针：`dist-static-scan-5b.cjs` 的 `RELATIVE_ASSET_REFS` 改为接受 5B `./assets/`（兼容 5A `../assets/`），重跑为 true；证据 `candidate/csp-gzip-recheck.txt`。原 false 是口径过期，不是 CSP 失败。
- 旧 uiux 套件版本限制：旧端 `d568bf82…`（18:04–18:05）vs 最终 `fa3f74d4…`（20:44）；旧端 main 已用最终套件复跑（391 名），旧端 uiux 未复跑且旧端已删不可补；旧通过名 424 个在新端全 true（0 旧通过→新失败）。不再声称「同套件源码」。
- 候选分离：新增 `2026-10-21-phase5b-new-entry-evidence/candidate/candidate-separation.md`，单列 `src/common|provider|model|service` 与 adapter 测试等同期无关改动，说明不进入 Phase 5 判定、未改构建/共享配置、不进 renderer dist；共享持久化风险作为边界交 PM/属主。

**边界**：只写 `角色卡/测试/`；未改产品/测试断言/构建配置；未读 `.env`；未 commit/push。详见[5B 最终报告](docs/change/2026-10-21_change_phase5b-final-verification.md)。

## 2026-10-21（Phase 5B 最终）— 新入口全量/打包 smoke/双端台账通过；5B 门 pass

**候选**：入口 `dist/index.html`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`，clean rebuild 哈希一致；gzip **289,095B**、CSP 严格。旧渲染器/vendor/旧测试已删，旧端不可复跑。

**全量**：uiux 23/23 段 exit 0（DEFAULT 110、MERGE 12、COMPLETE_FLOW 41、VISUAL 54、TOOLFOLD 19/C1 **Δ=20**，其余全绿）；main **E2E_PASS=true/E2E_FAILURES 空**（397 名）；ime **26 true**；design audit **31/31**；test/桌面UI **142/142**、test/桌面应用 **504/504**、test/测试 **715/714/1**（唯一 D3 AC4 环境缺真实 rg，如实）；懒挂载 **10/10**；bench 3 轮全过（stormA 20.5/B 18.2/handler 1.2/replay 10.5/scroll 3.4）；packaged smoke **14/14**（entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load，isPackaged=true/arm64）。

**双端**：5A 新入口 397 vs 5B 397，only 0/0，值差异仅 20 环境/诊断（OUTDIR/RENDERER_ENTRY/17 SHOT/PENDING_DIAG），行为 check 名与值逐名一致；uiux 23 段 0 差异。G1–G5/G4-RESOLVED/G5/NEW/OLD 无未批准、MATCH-FAIL=0；5A 快照 `shasum -c` 0。S0 `BOOTSTRAP_S0_*` 命名说明按 5A 记录待 PM 等价或补名。

**结论：5B 门 pass。** 详见[最终报告](docs/change/2026-10-21_change_phase5b-final-verification.md)与[5B 证据](docs/change/2026-10-21-phase5b-new-entry-evidence/index.md)。未 commit/push。

## 2026-10-21（Phase 5B 步骤 a/b 后）— 测试域旧渲染器引用清理：tsc 0；22 文件退役、6 文件等价重写

**背景**：旧 renderer/vendor/旧守卫测试删除后，`test/测试/**` 仍引用 `renderer.js`/`tool-rows.js`/`ui-labels.js`/`styles.css`，阻断根 tsc。

**修改**：`uiux-v2-replay-regression.test.ts` 重写为 `events.ts`/`replay.ts` 新纯逻辑（6/6）；`shell-judge` fixture→`judge.ts`（38/38）；`governance-pin-recovery` fixture→`governanceActionFor`（11/11）；`existing-project-compat a/b`→`governance-view.ts`（14/14、13/13）；`governance-judge-cards` fixture 删除旧 loadUiLabels（f-ui 退役）。

**退役**：22 文件 / 95 test 声明移至 `test/测试/retired-5b/*.retired`，逐文件哈希登记；替代覆盖指向新自渲染器纯逻辑与 5A e2e（RUNTIME/VISUAL/TOOLFOLD/JUDGE/GOV/MIRROR/IME 等），不静默丢弃。

**门禁**：根 `npx tsc --noEmit` **0 错**；`node --test "test/测试/**/*.test.ts"` **715/714/1/0**；唯一红 `lightweight-permission-repairs` D3 AC4 因本机无真实 `rg` 二进制（spawnSync status null），属环境红，未改断言/未跳过。5B 全量待步骤 c。详见[报告](docs/change/2026-10-21_change_5b-test-domain-cleanup.md)与[证据](docs/change/2026-10-21-phase5b-test-domain-cleanup-evidence/)。未 commit/push。

## 2026-10-21（Phase 5A 最终冻结 · 遮挡复验）— 12/12 遮挡断言、36/36 smoke、5A 门 pass

**候选**：JS `index-T1im4gOp.js`=`f568e2aa…`、CSS `index-DbPZU_Oj.css`=`b52cfca1…`、HTML=`f372e111…`；clean build gzip 289,120B（冻结摘要 288,552B）；CSP 严格。

**遮挡**：480/680 两档 report card/details、governance preview（`position=static`）、mirror actions、delivery facts、S0 CTA 共 **12/12** 目标 `bottom ≤ composer.top`；composer 95≤96；内容列 232≥200；`scroll-padding-bottom=104px`；截图齐。

**复跑**：5A smoke **36/36**、design audit **31/31** exit0、DEFAULT 110/110、MERGE 12/12、COMPLETE_FLOW 41/41、VISUAL 54/54、TOOLFOLD 19/19（C1 **Δ=20**）、其余 uiux 全绿；main 旧 391/新 397，新 E2E_PASS=true/0 失败，旧仅 C；单测 142、旧基线 683、IME 24、lazy 10；bench 3 轮全过（stormA 17.7/B 18.7/replay 10.4/scroll 1.8，max 23.7）；密度 12/11/8，正文 15/27；S0 独立 9/9。G1–G5/NEW/OLD 无未批准、MATCH-FAIL=0；唯一命名说明：main 缺 `BOOTSTRAP_S0_*` 六名，行为由 smoke/独立 S0 覆盖，待 PM 接受等价或 5B 前补名。

**结论：5A 门 pass。** 详见[最终报告](docs/change/2026-10-21_change_phase5a-final-verification.md)与[final3 证据](docs/change/2026-10-21-phase5a-new-entry-evidence/final3/index.md)。未 commit/push。

## 2026-10-21（Phase 5A 冻结最终）— 全量双端/密度/S0/重锚通过；5A 门 pass

**候选**：JS `index-sSLXHl7e.js`=`f568e2aa…`、CSS `index-CM2A97v3.css`=`57d9575c…`、HTML `c9d13918…`；clean rebuild，gzip 288,827B（冻结摘要 288,262B），CSP 严格。单测 142/142、旧基线 683/683、IME 24、懒挂载 10/10、5A smoke **24/24**、bench 3 轮全过、C1 **Δ=20**。

**main**：旧 391/新 397/common 390/only-old 1/only-new 7/值差异 75；旧端仅 C 类 `RECOVERY_SAME_PENDING_CARD_ONCE`，新端 **E2E_PASS=true、E2E_FAILURES 空**；SESSION_REPAIR×5/PENDING/RECOVERY/DIAGNOSTICS/RESTORE/P1/REPLAY/ANCHOR/OPEN_CARD/DENIED/INJECTED 等价检查均 true。G1–G5：G1 19/G2 12/G3 25/G4 21/G4-RESOLVED 1/G5 2，NEW 7/OLD 1，全部关闭/批准，MATCH-FAIL=0。唯一命名说明：main 无 `BOOTSTRAP_S0_*` 六名，行为由 5A smoke S0 3 项 + 独立 S0 9/9 覆盖。

**uiux**：全 23 段 pass（DEFAULT 110/110、MERGE 12/12、COMPLETE 41/41、VISUAL 54/54、TOOLFOLD 19/19、其余全绿）；design audit exit 0/31 项全 true（12 条重锚、S2 右缘、S1 超长目标、Motion 0.9s/reduced-motion）。密度：1360 无提示条 12≥9、有提示条 11≥8、960 8≥4，正文 15/27。200% operator 长失败 + mirror/delivery 3/3。

**结论**：**5A 门 pass**（S0 官方 main 名缺失作为命名说明/等价；建议 PM 接受或 5B 前补名）。详见[最终报告](docs/change/2026-10-21_change_phase5a-final-verification.md)与[final2 证据](docs/change/2026-10-21-phase5a-new-entry-evidence/final2/index.md)。未 commit/push。

## 2026-10-21（Phase 5A post-fix3 最终）— main E2E_PASS=true；uiux 仅 MERGE/DEFAULT 旧 DOM 重锚；G1–G5 最终分组

**候选**：修复落盘后 clean build；gzip **289,797B**、CSP 严格；单测 142/142、旧基线 683/683、IME 24、懒挂载 10/10、bench 3 轮全过（stormA 20.8/B 18.7/replay 10.0/scroll 3.4，max 26.7）、C1 Δ=16。

**main**：旧 373/新 379/common 372/only-old 1/only-new 7/值差异 **80**；**E2E_PASS=true、E2E_FAILURES 空**；10 项 repair 全 true。最终 G1 19/G2 12/G3 25/G4 21/G4-RESOLVED 1/G5 2/G0 292/NEW 7/OLD 1；G4 不得列差异，待 PM 修/重锚。

**uiux**：COMPLETE_FLOW 41/41（P7 + role reading）、SEND_FACTS 8/8、TERMINAL_MERGE/PROJECT_RESET/DUP/NOTICE/BLANK 转绿、VISUAL 54/54、RUNTIME 17/17、DELIVERY 9/9 等全过；仅 MERGE `window.__mergeCard` 同一 DOM 节点断言、DEFAULT toggleDrift `parentNode` 直挂断言失败（产品行为由 main ANCHOR/OPEN_CARD 与重锚副本覆盖，待 PM 批准）；design audit 旧 `.tool-records` 选择器 abort，需重锚/退役。

**结论**：5A 仍 needs-work，原因是 G4/旧 DOM 重锚未获 PM 批准，不是产品行为全红；未批准前 5A 门不通过。详见[最终分组报告](docs/change/2026-10-21_change_phase5a-ledger-regroup-final.md)与[post-fix3 证据](docs/change/2026-10-21-phase5a-new-entry-evidence/post-fix3/index.md)。未 commit/push。

## 2026-10-21（Phase 5A 独立验证）— 新端全量 + 逐名台账：needs-work，5A 门不通过

**候选**：HEAD `224cf83`，冻结后 clean build；gzip **287,465B**、CSP 严格；单测 **142/142**、旧基线 **683/683**（679+4）、IME 24、懒挂载 10/10、bench 3 轮全过（新 stormA 18.6/B 18.6/handler 0.6/replay 9.5/scroll 7.0；max 18.7）、C1 **Δ=16**；候选 build 前后 core diff 空、无代码变更、无新增依赖/DOM 例外。

**新端 uiux**：15 模式 pass；8 失败——TERMINAL_MERGE（同轮两条终端）、PROJECT_RESET（首 DOM 重置）、DUP（history-first+live 重复）、MERGE（full rebuild 卡/报告保留）、NOTICE（系统通知非 sys 行）、BLANK（后台 pane 无队列状态）、DEFAULT（toggleDrift `anchor paragraph materialized 960`，full replay 已过）、COMPLETE_FLOW（报告 37 全 true，P7/C/P3 全过，随后 `role reading fixture must really scroll`）。三项缺口：Sidebar 9/9 pass **关闭**、P7 两项 pass **关闭**、虚拟锚点仅部分（full replay 过、toggleDrift 红）。

**main**：365 名，10 项 repair 失败；9 项真实行为候选（5 SESSION_REPAIR、PENDING、RECOVERY_SAME/OLD/ENDED）＋1 诊断字段候选 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`；`PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 待 PM；`NAVIGATION_BLOCKED` 已消失。旧端 C 类 `RECOVERY_SAME_PENDING_CARD_ONCE` 已核实同因，但新端另有恢复失败不能按旧 C 豁免。

**台账**：main `allowed-diff-ledger.md` 366 行（254 MATCH、102 值差异、9 NEW-ONLY、1 OLD-ONLY/REMOVED）；uiux `uiux-allowed-diff-ledger.md` 旧 5 失败 OLD-ONLY/REMOVED、新 6 NEW-FAIL + 两截断 + design audit 12 条旧 DOM 失配（含建议）；均 PM proposed，未静默豁免。**结论 needs-work，5A 门不通过，停止 5B**。详见[报告](docs/change/2026-10-21_change_phase5a-independent-verification.md)与[新端证据](docs/change/2026-10-21-phase5a-new-entry-evidence/index.md)。未 commit/push。

## 2026-10-21（Phase 5A 旧端快照）— 旧端全量/逐名/哈希落盘；main 允许差异台账 367 名；RECOVERY 旧端 C 类

**执行**：按 Phase 5 计划跑旧入口 `app/renderer/index.html` 全量：uiux-v2 默认+22 模式、main.mjs、ime-enter、bench-storm 3 轮、uiux-design-audit、Node 单测/旧基线/懒挂载；逐命令/exit/报告/check 名/环境/hash 落 `2026-10-21-phase5a-old-baseline-evidence/`。

**结果**：uiux 17 模式 exit 0、5 模式 exit 1（DEFAULT/RUNTIME C2 旧端无载体、SELECTOR 旧 180px、MIRROR 四角色、TOOLFOLD 旧 C1）；main exit 0/`E2E_DONE=1`，357 名与桌面窗口旧报告逐名一致，唯一 `RECOVERY_SAME_PENDING_CARD_ONCE=false`（旧端相邻恢复检查全 true，单点同 id 回放去重，判 C 类同因）；ime 24 基线；bench 旧 3 轮；design audit 旧端 S1 夹具 `#chat .tool-records` null（old-only/C）；单测 96、旧基线 679；懒挂载旧端 N/A。旧入口/套件 manifest 前后 diff 空；`app/main.ts` 快照期被桌面窗口在途修改，已在 manifest-note 单列，旧端不读取。用桌面窗口 report-diff（357/366/356/1/10/103）建 367 行允许差异台账（253 MATCH、103 值差异、10 NEW-ONLY、1 OLD-ONLY），逐名含旧→新/依据/替代覆盖/PM proposed。新端全量与最终差异待候选冻结；旧端结果不代替新端。详见[报告](docs/change/2026-10-21_change_phase5a-old-baseline.md)与[证据索引](docs/change/2026-10-21-phase5a-old-baseline-evidence/index.md)。未 commit/push。

## 2026-10-21（Phase 5 计划）— 全量双端对照与 5A/5B 验证计划；套件 check 名清单

**交付**：[Phase 5 测试计划](docs/design/2026-10-21_design_ui-platform-phase5-test-plan.md) + [套件 check 名清单](docs/design/2026-10-21_phase5-suite-inventory.md)。只写计划，未跑实现。

**要点**：①uiux-v2 全量 23 段（默认 + 22 模式）、main.mjs、ime-enter、bench-storm、uiux-design-audit、Node 单测/旧基线/懒挂载的 5A 旧端快照与 5A 新端同套件目标切换；逐 check 名对照（MATCH/RENAME/NEW-ONLY/OLD-ONLY/REMOVED），允许差异模板含旧→新/依据/PM 批准/到期，禁止用计数或补证代替。②5A-0：main/design audit 加统一 `ANS_RENDERER_ENTRY`；Sidebar 身份徽标、P7 待选择、虚拟窗口阅读锚点三项 Phase 5 缺口先在 5A 关闭，官方段必须自然跑完。③5B：入口切换、旧端不可复跑声明、删除前 SHA256 快照双向核对、新端全量、packaged smoke（8 项命名）、最终回归。④证据目录/候选哈希/raw 输出/台账索引与 5A/5B 门清单；任何未批准差异或断言弱化即门失败。

未 commit/push。

## 2026-10-21（4B 200% 收口）— 轻量重验 pass：左树可见/可滚、逐容器与报告/预览内部节点无横溢

**范围**：桌面UI [4B 变更记录 UIUX 5/6 收口节](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)（CSS/断言/截图，行为未改）；候选 clean rebuild。

**结果**：typecheck/build/CSP 通过，gzip9 **286,348B**；单测 **96/96**、旧基线 **679/679**、IME 24、懒挂载 **10/10**；旧渲染器/main/preload/desktop 零 diff、无新增依赖/DOM 例外。桌面UI 4B 冒烟独立复跑 **70/70**；自写 200% 补充 **7/7**：左树 6 行零重叠且首末行可见/左栏可滚、10 容器（含 `.runtime-config-notice/.governance-status/#role-tree/.col-mid/.session-notice/.composer`）零横溢、头部 wrap、缺配提示全文 398/398 且按钮首屏内、报告展开 4 节点零横溢且卡可见、治理预览内部零横溢且取消回焦、零 console/CSP。uiux：RUNTIME **17/17**、VISUAL **54/54**、QUEUE 4/4、MIRROR 8/8、GOV 7/7、JUDGE 33/33、G2 5/5、TOOLFOLD 19/19；bench 3 轮全过（stormA 23.8/B 17.6/handler 0.6/replay 10.3/scroll 8.1，单轮最大 24.7）；C1 Δ=16。检查名单与返工重验一致，仅新增 200% 检查，无弱化。

**结论**：**pass**；4B 门保持关闭、Phase 4 维持完成；Phase 5 仍留。详见[报告](docs/change/2026-10-21_change_phase4b-200pct-reverification.md)与[证据](docs/change/2026-10-21-phase4b-200pct-verification-evidence/)。未 commit/push。

## 2026-10-21（4B 返工）— 聚焦重验 pass：C2/锚点两项真红修复、UIUX 四项通过；4B 门关闭，Phase 4 完成

**范围**：桌面UI [4B 变更记录 §一之二 返工](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md) 与更新证据；测试 4B 报告/台账 §8.7；候选 clean rebuild。

**结果**：typecheck/build/CSP 通过，gzip9 **286,105B**；单测 **96/96**、旧基线 **679/679**、IME **24**、懒挂载 **10/10**；自写 smoke **42/42**（新增 C2 异引擎失效→切回卡收起+原因可见+无 authorize+Esc 零回包；已答卡 prefix full rebuild 锚点 request+1/conclusion+1/DOM 复用/冻结；960 五角色行零重叠；200% 逐容器零横溢；facts 4px+冒号；治理取消回焦）。uiux：RUNTIME **17/17**（C2 pass）、QUEUE 4/4、MIRROR 8/8 五角色、GOV 7/7、JUDGE 33、G2 5、SELECTOR 27、CONFIG 21、ROLE 11 条、SEND 8、TERMINAL 22、TOOLFOLD 19 条、FRESH 4/4、VISUAL **54/54**；DELIVERY_NOTE 4B 5/5（官方止 Phase 5 builtin identity）；FLOW 官方 5/12（止 P7），补证副本 **12/12**；默认段补证 **100 布尔全过**（含原红）。bench 3 轮全过（stormA 17.5/B 20.0/handler 0.7/replay 10.2/scroll 10.6，单轮最大 21.2）；C1 Δ=16。共同检查名单逐字一致，新增 2+3 项，原两项红 false→true，无弱化。

**结论**：**4B pass；Phase 4 门关闭（Phase 4 完成）**。全量双端/main.mjs/入口切换/打包/真机仍 Phase 5。详见[报告](docs/change/2026-10-21_change_phase4b-fix-reverification.md)与[证据](docs/change/2026-10-21-phase4b-fix-verification-evidence/)。未 commit/push。

## 2026-10-21（Phase 4B）— 4B 独立验证：大部分通过，C2 重锚与默认段锚点两项真红；结论 needs-work，Phase 4 门不关闭

**范围**：桌面UI [Phase 4B 变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md) 与 4B 证据；PM §十五/§15.7/§15.10；台账 §八。候选 clean rebuild，按 Invariant #6 重验。

**通过**：构建/typecheck/CSP；gzip9 **285,702B**；单测 **96/96**、旧基线 **679/679**、IME **24/24**、懒挂载 **10/10**；自写 Electron smoke **38/38**（聚合/镜像/治理记录/报告持久化/交付回执/菜单/queueView/single/judge 重放/replayAnchorDebug）；uiux QUEUE_VIEW **4/4**、MIRROR **8/8 五角色**、GOV **7/7**（PM 记 5/5）、JUDGE **33/33**、G2 **5/5**、4A 六段 27/21/11 条/8/22/19 条全绿；DELIVERY_NOTE 4B 5/5、VISUAL 报告面 20/20；COMPLETE_FLOW 官方 5/12 后止于 P7，只读补证副本（仅跳过 P7 两个 Phase 5 检查）到达 12/12；bench 3 轮中位全过（stormA 17.7、B 19.3、handler 0.3、replay 6.1、scroll 7.3），单轮最大帧 20.7；C1 **Δ=16**；旧渲染器/main/preload/desktop 零 diff、无新增依赖/DOM 例外。

**真红/缺口**：①RUNTIME `expired old shell collapses with reason visible in its own runtime` 连续 2 次 false——卡收起但 `composer-hint` 为空，原因「原shell轮次已中止」不可见/不可追溯（缓存 expired 先清 shellConfirm，replay 时 expireShell 无卡可写 hint）；交付记录「C2 pass」不成立。②默认段 B1 `denied conclusion anchor and decided card retained` false——已答卡 full rebuild 后落尾；最小复现 operator index 3 / requestIndex 1 / conclusionIndex 2；根因指向 operator 行未保存 `anchorKey`，full rebuild 只能尾插；其余 B1/B2 19 项通过。③交付记录 §五 FLOW 声称的 `C outer ok`/不可读报告/P3 等 7 名在官方 P7 之后未到达，表述需更正；行为经补证副本 12/12 通过。

**结论**：4B **needs-work**；Phase 4 门不关闭。修复两项产品红、更正证据表述并按 Invariant #6 重跑 RUNTIME/默认段/FLOW/VISUAL 与热路径门后重判。详见[报告](docs/change/2026-10-21_change_phase4b-independent-verification.md)与[证据](docs/change/2026-10-21-phase4b-verification-evidence/)。未 commit/push。

## 2026-10-21（PM §15.7）— 4B 台账定稿：三类精确必过名单、C2 重锚提案、计数差异登记

**依据**：PM §十五（4B 放行）与 §15.7 定稿要求；协调者派发。只写 `角色卡/测试/`，未跑实现测试。

**定稿内容**（[台账](docs/change/2026-10-21_check-ledger-phase3a.md) §8.4–8.6）：①**DELIVERY_NOTE** 4B 必过 5 名（十调用历史/旧匿名事件/新实际 wire 交付/历史重建保序/同进度不提升），另 4 名按 4A/5 回归，其中 `builtin identity…` 当前红；②**COMPLETE_FLOW** 4B 必过 C/P3 12 名（来源声明/同卡保存/安全展示/过期撤重试/错角色不提升/fallback abort/禁用报告/外层 ok 内层失败/不可读记录/过期材料/文档浏览不改聊天），A/B/A4/P6/P7 留 Phase 5；③**VISUAL** 4B 必过报告面 20 名（source/preview/status/declaration/settled/late/task/local refresh/cold exact/received/target batch/overview/de-dup + SV13 4 + cold reports 3），非报告 29 名留 Phase 5；④确认 QUEUE_VIEW 4、MIRROR 8（五角色）、JUDGE 33、G2 5、4A 六段基线不重开；GOV 证据实际 7/7 与 PM 记 5/5 差异如实登记；⑤C2 重锚提案：`expired old shell…` 改「收起+原因可见/可追溯」或退役，桌面UI 落 uiux-v2、测试独立复验（PM 已批准责任分离）。

**关键风险**：COMPLETE_FLOW 套件顺序在 P7（Phase 5 红）中止，C/P3 段不可达，4B 子集当前无法直接取证；已写入 §8.5/§8.6，4B 验证须复核或由属主提供可达模式。未 commit/push。

## 2026-10-21（4B 授权）— 4B check 台账与验证口径更新；4A 基线保持不重开

**依据**：PM §十一.2（4A 通过后进入 4B）与协调者派发。只更新台账与验证口径，**未跑实现测试**。

**更新位置**：[check 台账](docs/change/2026-10-21_check-ledger-phase3a.md) 新增 §八（frontmatter 追加 revised 事件）。

**4B 必过 check 名**：
- **QUEUE_VIEW 四项**：`queued baseline shows two`、`runtime view restore does not revive old queued requests or aggregate`、`main-process repush rebuilds aggregate with new count only`、`clearing queue removes aggregate`（`#chat .op-queue-aggregate`/`queuedDebug`）。
- **默认段剩余 21 项**（按功能面）：待处理/决定卡生命周期 **14**（`denied conclusion anchor…`、`pending locator visible after role click`、`open pending supersedes true busy`、`pending entry fully reachable with card/pi 960`、`covered pending actions unavailable card/pi`、`keyboard locate closes card/pi…`、`answered pending returns to true busy`、`idle after answered removes work`、`pending arrival preserves drawer`、`expired request restores actual true busy`、`ordinary question creates no pending`）；预览/确认 **6**（`keyboard reaches original preview`、`keyboard expands original preview`、`expanded preview renders controlled markdown`、`expanded preview stays inside card width`、`keyboard enters original confirm action`、`keyboard reaches deny action`）；队列聚合 **1**（`queued baseline shows two`，与 QUEUE_VIEW 同项）。
- **VISUAL**：`V2 source report uses separate layered top and facts before primary source and full copy`。
- **JUDGE/G2 回归**：JUDGE 33 名、G2 5 名保持全绿，只增不改。
- **4B 新增建议名**：治理三权卡 4 名、`MIRROR_CARD_SAME_ID_ANSWERED_ONCE`、`OP_QUEUE_AGGREGATE_MIRROR_AND_POSITION`、`OPERATOR_MIRROR_AND_QUEUE_AGGREGATION`、`GOVERNANCE_RECORD_ESTABLISH_AND_REACCEPT`、`GOVERNANCE_MIGRATION_PREVIEW_AND_APPLY`、`REPORT_FULL_TEXT_PERSISTENCE_DELIVERY`、`REPLAY_ANCHOR_DEBUG_SAME_FIELDS`、`JUDGE_RESULT_ROWS_REPLAY_PER_RUNTIME`、`SINGLE_SWITCH_WARNING_REFRESH_ON_MODEL_CHANGE`、`QUEUE_SUBVIEW_CLEARED_BY_TAB_SWITCH`、`ENGINE_MENU_CONFIG_STATUS_TEXT`、`C2_EXPIRED_SHELL_REANCHORED_TO_COLLAPSED_WITH_REASON`（或退役）。

**归属/边界**：以上均 4B；全量双端逐 check 名、`main.mjs`、入口切换、打包/发布仍 **Phase 5**；4A 基线（A 45+门禁 7、4A 50 默认段 check、C1 Δ=16、C2 同因记录）**保持有效、不重开**。4B 通过后 **Phase 4 完成**，全量等价仍 Phase 5。

**4B 验证方式**：UIUX 复核 + 测试独立；构建/CSP/gzip、单测全绿、旧基线 679、无新依赖/DOM 例外；若触碰 `chat-store`/`ChatStream`/`confirm-store`/`ChatRow` → PM §10.3 bench 重基线（预热排除、≥3 有效轮、p95≤35、单轮≤50）+ 懒挂载 10/10 + C1 新 Δ≤32（目标≤20）+ IME 24/24；uiux-v2 QUEUE_VIEW 必过、JUDGE/G2 回归、默认 21 项逐名、VISUAL 报告卡；契约面 #12/#13/#17 等三态对表；不弱化断言。未 commit。

## 2026-10-21（Phase 4A M1–M6）— UIUX 修正聚焦重验：pass；4A 门保持通过

**范围**：桌面UI [4A 变更记录 §三·五](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)（队列子视图、撤回 system 行、Tabs 键盘、保存条两行、资料状态-only、960/200%）。

**门禁**：typecheck/build exit 0；gzip9 JS 247,478 + CSS 17,116 + HTML 389 = **264,983B ≤300KB**；CSP 零内联/严格 meta。单测 **67/67**、旧基线 **679/679**、IME **24/24**、懒挂载 **10/10**；旧渲染器核心/main/preload 零 diff；依赖未新增；DOM 例外仍 2 处。

**自写冒烟 32/32（exit 0）**：原 4A 26 项零回退；M1 预览 4 项（当前 1+排队 3）+「查看全部队列（6）」、子视图标题「A · 队列」、`#right-queue-body` 唯一、6 项、返回焦点回 `.queue-view-all`、Esc 回工作概览且抽屉不关；M2 成功撤回新增 system「已撤回排队消息：」、失败内联「撤回无效：」+ system 同文；M3 Tabs roving 0/-1、aria-controls/tabpanel/labelledby、ArrowRight→codex 聚焦、End→claude、Home→pi；M4 保存条 64px、状态 28/28 三档（1360/960/200%）不截断、200% 无横向溢出、应用时点保留；M5 角色头状态-only（无待办/计数）；失效卡 hidden+原因、左树 `.ti-count`「3」+title/aria 保持；零 console/CSP。

**bench（PM §10.3）**：预热 old 18.9/new 21.1 不计；3 有效轮 stormA 17.8→17.5、stormB 17.5→17.7、handler 9.5→0.5、batch 0.6→0.8、replay 19.5→6.2、scroll 15.6→12.8；p95 **18.2≤35**、单轮最大 18.2≤50——通过；C1 Δ=**16**。

**uiux 八段**：SELECTOR 27/27、CONFIG 21/21、ROLE_RETURN_FOCUS 9/9、SEND_FACTS 8/8、RUNTIME 14/15（C2 同因）、默认 44/45（Phase 5 历史项）、VISUAL 3/4（4B 报告卡）、TOOLFOLD 17/17——无新增失败名/无回退；失败均为台账 B/C 类。

**观察（非阻断）**：队列子视图打开时点击「角色资料」仍显示队列子视图（`queueView` 未清）；建议 UIUX/桌面UI 确认预期或 tab 切换时清空。

**结论**：**pass；needs-work 无；4A 门保持通过**。未验证：真实模型/.env/主进程文档读取、打包、Windows/DPI、main.mjs/全量（Phase 5）、4B。只写本角色文档与证据；未改产品代码/测试/构建配置；未 commit。详见[报告](docs/change/2026-10-21_change_phase4a-fix-reverification.md)与[证据](docs/change/2026-10-21-phase4a-fix-verification-evidence/)。

## 2026-10-21（Phase 4A）— 4A 独立验证：pass；4A 门通过可进 4B；唯一失败为 C2 同因既有红

**范围**：桌面UI [Phase 4A 变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) 与 4A 证据；PM §十二/§十三；台账 §七。独立执行。

**门禁**：typecheck/build exit 0；gzip9 JS 246,740 + CSS 17,054 + HTML 386 = **264,180B ≤300KB**；CSP 零内联/严格 meta。单测 **67/67**、旧基线 **679/679**、IME **24/24**、懒挂载 **10/10**；旧渲染器核心/main/preload 零 diff；依赖未新增（Slider copy-in 复用 @base-ui/react）；DOM 例外仅已批准的 2 处。

**自写离线 IPC 冒烟 26/26（exit 0）**：默认 Claude；pi/codex/pi 切引擎历史隔离与恢复；跨引擎草稿；异引擎迟到事件缓存不覆盖；设置三 tabs、secret 掩码不回显、Slider aria-valuemin/max/now + ArrowRight、非预设文本回退、保存 loading/已保存/失败、缺配条与设置入口、读取失败重试、晚到读取守卫；资料四节、文档只读/无 script/返回焦点/错误重试；工作概览待处理定位与角标、无角色文档重复；抽屉队列位次/仅 message 可撤/成功由真实快照刷新/失败就地回执；失效 operator 卡 `.op-actions` hidden + 原因可见；左树 `.ti-count` 唯一数字「3」+ title/aria、状态不含「待办」；零 console/CSP。

**bench（PM §10.3）**：预热 old 17.6/new 23.1 不计；3 有效轮 stormA old 中位 25.0 → new **17.6**、stormB 17.6→18.7、handler 11.5→0.6、batch 1.2→0.8、replay 20.5→6.5、scroll 18.4→14.6；p95 **20.6≤35**、单轮最大 20.6≤50——通过；C1 Δ=**16**。

**uiux-v2 八段**：SELECTOR 27/27、CONFIG 21/21、ROLE_RETURN_FOCUS 9/9、SEND_FACTS 8/8、RUNTIME 14/15（唯一失败 `expired old shell shown disabled in its own runtime` = **C2 同因既有红**，旧入口同段亦失败）、默认 44/45（`historical own-template failures direct` = Phase 5；4A 项全过）、VISUAL 3/4（report source = 4B）、TOOLFOLD 17/17；QUEUE_VIEW 属 4B 未跑。**失败均为台账 B/C 类，不是 4A 缺口；断言未弱化。**

**契约**：#7/#9/#10/#15/#16/#18/#19/#20 已满足且与实现一致；行 8 仍写「选择仅本地演示」，文档滞后，建议 4B 同步。C2 按 §13.3 记录待重锚；judge 跨引擎重放归 4B（§13.2）。

**结论**：**4A 门 pass，可进 4B**；needs-work 无、missing-evidence 无。未验证：真实模型/.env/主进程文档读取（替身）、打包、Windows/DPI/屏读、main.mjs/全量（Phase 5）、4B 面。只写本角色文档与证据；未改产品代码/测试/构建配置；未 commit。详见[报告](docs/change/2026-10-21_change_phase4a-independent-verification.md)与[证据](docs/change/2026-10-21-phase4a-verification-evidence/)。

## 2026-10-21（Phase 3 关闭 / Phase 4 授权）— 台账更新：C1 收敛 Δ=16；B 类映射 4A/4B；4A check 建议与验证口径

**依据**：PM 评审 revision 5 §十一（Phase 3 整体门完成、Phase 4 授权 4A→4B、§11.4 派发前置第 3 项）。只更新台账与测试映射，**未跑实现测试**。

**更新位置**：[Phase 3A check 台账](docs/change/2026-10-21_check-ledger-phase3a.md) §三（C1 行）与新增 §七。

**C1**：标注「已收敛 Δ=16（150→166），旧 32，目标 ≤20，Phase 5 判据新 Δ≤32」（3A 时 51 仅作历史）。

**B 类映射**：
- **4A**：B1 + B2/B5——`one independent work list without duplicated role documents`、`P7 old runtime rejected result cannot disable current runtime or overwrite draft`、抽屉队列 VISUAL 子集；另 50 个默认段 check 按功能面分组：工作概览/抽屉队列 **14**（含 `queue full/grid/action rect 1360/960`、`halt preserves queued 3/full`、撤回族）、资料抽屉 **9**（含 `role geometry 1360/960`、`growing composer avoids drawer *`）、设置/Pi/引擎 **18**（含 `runtime settings geometry *`、`Claude required key…`、`Pi own history…`）、输入区草稿/附件 **9**（含 `late pick…`、`keyboard returns to composer image toolbar`）。
- **4B**：B4（治理三权卡/镜像/排队聚合、治理记录建立/重新接受/迁移预览、报告全文/persistence/delivery、operator 镜像、`replayAnchorDebug`、single 切换刷新一次性警告）＋ **21** 个交互卡/待办/预览/决定 check（含 `queued baseline shows two`、`pending locator visible after role click`、`keyboard reaches original preview`、`answered pending returns to true busy`）；**QUEUE_VIEW 四项全部留 4B**（PM §12.1：`queued baseline shows two`、`runtime view restore does not revive old queued requests or aggregate`、`main-process repush rebuilds aggregate with new count only`、`clearing queue removes aggregate`，断言 `.op-queue-aggregate`/`queuedDebug`；4A 验收不含 QUEUE_VIEW）。
- **Phase 5**：**11** 个聊天核心/虚拟窗口/历史 check（含 `virtual visible nonempty`、`group materialized and open`、`detached-history role mounted windowed`、`historical own-template failures direct`）。
- 分母核对：50 + 21 + 11 = **82**；4B 名单块另含 QUEUE_VIEW 另外 3 名（共 24 行），不改变 82 分母。

**4A 新增 check 名建议**：引擎切换/每引擎历史与草稿 4 名、设置字段/掩码/保存/缺配 6 名、资料抽屉/文档阅读 4 名、工作概览 3 名、队列抽屉/撤回 3 名（详见台账 §7.3）。

**4A 独立验证口径**：UIUX 复核 + 测试独立；构建/CSP/gzip、单测、旧基线 679、IME 24；uiux-v2 `SELECTOR/CONFIG/SEND_FACTS/默认段` 逐段（QUEUE_VIEW 属 4B）；若动聊天热路径则按 PM §10.3 重基线（预热排除、≥3 有效轮、p95≤35、单轮≤50）+ 懒挂载 10/10 + C1 ≤32/≤20；契约行 #7/#9/#10/#15/#16/#18/#19/#20 三态对表；不新增依赖/DOM 例外、不弱化断言；4A 完成不等于全量双端等价。未 commit。

## 2026-10-21（Phase 3B 修正）— UIUX 五项 CSS/图标修正聚焦重验：pass；原 39 项零回退 + 6 项新样式 45/45

**范围**：UIUX Phase 3B 评审 5 项修正（SU 摘要 600/警告琥珀、shell 详情 Lucide chevron、拖入反馈、队列撤回 28px、附件 chip 8/rm 4/icon 12×1.5）；纯 CSS/图标/夹具，行为逻辑未改。

**重建/门禁**：typecheck/build exit 0；gzip9 **241,273B ≤300KB**；CSP 零内联/严格 meta。单测 **33/33**、旧基线 **679/679**、IME **24/24**、懒挂载 **10/10**；旧渲染器核心/main/preload/desktop 零 diff。

**自写冒烟 45/45（exit 0）**：原 39 项行为断言全部保持 true；新增 6 项实测——SU 摘要 `600`、`.sc-su-warning` `rgb(196,161,95)`、`#sc-hint` `rgb(148,155,164)` 且默认提示逐字；`#sc-details` Lucide chevron 存在、闭合恒等、展开 `matrix(0,1,-1,0,0,0)`、无 `::before` 字形；拖入 `is-dropping` 边框 `--text-3`/背景 `--hover` 且 leave 清除；撤回按钮高 28/字号 11/边框 `--input`/圆角 6；chip 8px、移除钮 4px、X 12×12/1.5。零 console/CSP/did-fail-load。

**bench（PM §10.3）**：预热 old 20.4/new 17.4 不计；3 有效轮 stormA 23.1→18.9、stormB 17.5→19.9、handler 10.3→0.3、batch 0.5→0.3、replay 14.0→5.2、scroll 17.1→10.4；p95 **33.3≤35**、单轮最大 33.3≤50——通过（stormB 单轮 33.3 接近上限，属抖动）。

**uiux-v2 受影响段**：JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17；C1 仍 Δ=**16px**；无新失败名、无回退。

**结论**：pass；needs-work 无。差异：gzip +1,140B（实例）；桌面UI「单测新增 16」仍为笔误（实为 15，累计 33）。未验证：真实模型/主进程卡通道、打包、Windows/DPI/屏读、main.mjs/全量（Phase 5）、Phase 4。只写本角色文档与证据；未改产品代码/测试/构建配置；未 commit。详见[报告](docs/change/2026-10-21_change_phase3b-fix-reverification.md)与[证据](docs/change/2026-10-21-phase3b-fix-verification-evidence/)。

## 2026-10-21（Phase 3B）— Phase 3B 独立验证：3B 通过、Phase 3 整体门可判完成；C1 收敛 Δ=16；uiux 失败均为台账 B 类

**范围**：桌面UI [Phase 3B 变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md) 与 3B 证据；门规 PM §10.3/§10.4/§10.6；台账 [Phase 3A check 台账](docs/change/2026-10-21_check-ledger-phase3a.md)。候选变化，按 Invariant #6 覆盖受影响旧结论。

**框架检查**：typecheck/build exit 0；gzip9 JS 226,166 + CSS 14,706 + HTML 384 = **241,256B ≤300KB**；CSP 静态扫描零内联/严格 meta。单测 **33/33**、旧基线 **679/679**、IME 新入口 **24/24**、懒挂载正向 **10/10**；旧渲染器核心与 main/preload/desktop 零 diff；三 e2e 仅目标切换（各 4 行，断言未改）；3B 零新增依赖、禁入零命中。

**bench（PM §10.3）**：预热 old 26.8/new 22.7 不计；3 有效轮交替——stormA old 中位 21.3 vs new **24.4（≤25）**、stormB 18.7→18.6、handler 13.1→0.7、batch 1.7→1.0、replay 20.8→5.7、scroll 24.6→8.0；p95 25.6≤35、单轮最大 25.6≤50——**通过**（新 stormA 余量 0.6ms；与自报 18.6 属同机波动，按规则 5 后续热路径变更须重跑）。

**自写 Electron 离线 IPC 冒烟 39/39（exit 0）**：shell 卡逐字+默认拒绝焦点+Esc=allow:false+显式 allow:true+settled/失效收起+通道 fail-closed；su 三档（标题/档位/命中原因/绕过写边界警告）；恢复卡逐字+取消焦点+显式执行+失效/通道异常定格可关；judge allow/deny/manual 无行/幂等/治理代批行；双开关初始关/一次性警告/重推不现/single 禁用/桥缺失禁用；发送 ack 载荷+queued 位次+未接受恢复草稿+已接受失败不假报；停止三态精确目标；附件选/粘/拖（data URL 缩略图）/移除；队列位次/仅消息可撤/就地回执；system 行；零 CSP/console/did-fail-load。

**uiux-v2 七段（新入口）**：默认 8/9（`one independent work list…`=B1 Phase 4）、JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17、SEND_FACTS 7/8（`P7 old runtime rejected…`=Phase 4 每引擎会话）、QUEUE_VIEW 0/1（`queued baseline shows two`=Phase 4 operator 排队聚合）——**失败均台账 B 类，非 3B 缺口**；与自述计数差异仅为条目/布尔口径。

**C1/C2**：C1 新入口 Δ=**16px**（150→166，非累积）≤旧同日 32px（150→182）、≤20 目标；断言未改；满足 Phase 5 判据。C2 旧入口既有红随 Phase 5 下线。**观察（非阻断）**：切 single 后旧「替我决策中」警告行可能残留到自动收起，建议 Phase 4 刷新。

**结论**：**3B 范围 pass；needs-work 无；missing-evidence 无；Phase 3 整体门可判完成**（全量双端与 main.mjs 仍 Phase 5）。未验证：真实模型/主进程卡通道、打包、Windows/DPI/屏读、Phase 4 功能面、3A2 视觉组逐项。只写本角色文档与证据；未改产品代码/测试/构建配置；未 commit。详见[报告](docs/change/2026-10-21_change_phase3b-independent-verification.md)与[证据](docs/change/2026-10-21-phase3b-verification-evidence/)。

## 2026-10-21（Phase 3A 裁定后 / 3B 前置）— 四类 check 名台账完成；延迟挂载正向检查 10/10；C 类既有红登记

**依据**：PM [Phase 3 门裁定](../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) §10.1/§10.3/§10.4/§10.5（接受狭义 Phase 3 门、双端全量对照后移 Phase 5；bench 预注册口径批准并补预热/p95≤35ms/单轮≤50ms 红线；懒挂载为唯一限定例外；3B 派发前置）。

**交付 1：四类 check 名台账**（[2026-10-21_check-ledger-phase3a.md](docs/change/2026-10-21_check-ledger-phase3a.md)），名单来自实际报告/已实跑脚本，不计数代替：
- **A（3A 范围内双端通过）**：45 个具名 check——ime 24 名、uiux-v2 默认段前 8 名、toolfold 前 12 个布尔名、operator `toolCallId` 锚点（`OPERATOR_TOOLCALLID_ANCHOR`）；另列 7 项门禁级检查（bench/单测/旧基线/typecheck/build/CSP/预算/3A2+UIUX）。
- **B（未实现按阶段延期）**：82 个 uiux-v2 具名 check（工作概览/队列 1 + 其余 81；Phase 4 逐步扩段、Phase 5 全量）+ `main.mjs` 套件（Phase 5，属主桌面窗口）+ 11 个功能面（3B 6：shell/恢复/审批卡、双开关、停止、完整附件、delivery/persistence/report 与镜像聚合；Phase 4 5：设置/Pi、治理记录、资料抽屉、引擎真实会话、工作概览）。
- **C（既有基线红）**：2——toolfold `tail fold movement bounded…`（旧 Δ=32px、新 Δ=51px、阈值 20；属主桌面UI；Phase 5 判据新 Δ≤32、目标≤20，当前 51 不得进切换）；旧入口 `expired old shell shown disabled in its own runtime`（旧渲染器，随 Phase 5 下线退役）。
- **D（新端独有/旧端不适用）**：30 项 Phase 3A 离线冒烟 + 10 项延迟挂载正向检查（operator 锚点跨列 A/D 不重复计，唯一新增 39）。

**交付 2：延迟挂载正向覆盖**（`test/测试/`，属本角色边界）：新增 `phase3a-lazy-toolgroup-check.mjs` + `phase3a-lazy-toolgroup-preload.cjs`。新入口实跑：

```
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs
→ LAZY_TOOLGROUP_SUMMARY {"total":10,"passed":10,"failed":0}，exit 0
```

覆盖：同一轮 45 调用/91 相位闭合组内部活动行 **0**、摘要「本轮 45 个调用…含 1 条未放行」、`.sys-denied` 直显 outside.md；展开 **45** 行（file-1/file-45/已拒绝相位）；再折叠回 0；160 行前置正文离屏后回窗仍闭合、摘要完整、再展开 45；≤40 三调用小组闭合仍挂载 3 行；零 console 错误。阈值：>40 闭合内部恰 0、展开恰 45、小组恰 3。旧入口不适用（不构建同结构，不作失败判据）。证据 `phase3a-verification-evidence/lazy-toolgroup/`。

**C 类登记**：两条既有红已写入台账与 memo，不计 3A 新红；toolfold 锚点差值（新 51 vs 旧 32）进入 3B/5 收敛清单。

**更新**：Phase 3A 报告追加「裁定后更新」与 §七.3 正向覆盖；feature-map/memo/changelog 同步。只写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/构建配置/他角色文件；未 commit。

## 2026-10-21（Phase 3A）— UI 平台化 Phase 3A 聊天流核心独立验证：框架项通过；阶段门双端对照未达成交 PM；toolfold 锚点为旧基线既有红

**范围**：桌面UI [Phase 3A 变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)（含 3A2、bench 优化）、[3A2 证据](../桌面UI/docs/change/2026-10-21-phase3a2-evidence/)、契约面清单、UIUX 3A 评审（needs-work→3A2 pass）；口径＝产品提案 §六 Phase 3 门与 PM Q5/Q10。候选已变化，按 Invariant #6 覆盖受影响旧结论。

**干净重建**：`typecheck:renderer`/`build:renderer` exit 0；gzip9 JS 235,863B + CSS 13,958B + HTML 388B = **250,209B ≤ 300KB**；CSP 静态扫描零内联脚本/`<style>`/`style=`/`unsafe-*`，严格 meta 在位；dist 仅 3 文件。

**测试/基线**：`test/桌面UI/*.test.ts` **18/18**、`test/桌面应用/*.test.ts` **679/679** 全绿 exit 0；旧渲染器核心 8 文件 + `app/main.ts`/`app/preload.cjs`/`app/desktop` 与 HEAD 逐字节相同；三个 e2e 仅加 `ANS_RENDERER_ENTRY` 目标切换（断言零改动）；`markdown.js`/vendor/markdown.test 的变化属已单独记录的 vendor 15.0.3 安全升级。

**ime 新入口**：**24/24 全 true、E2E_DONE=1、exit 0**（组合/229/isComposing/Shift/附件）。

**bench（先预注册阈值后执行，待 PM 批准）**：3 轮新旧交替，old stormA 20.2/17.8/21.9（中位 20.2）vs new **43.2/18.0/18.0（中位 18.0 ≤ max(20.2,25)）**；stormB 17.6→17.7；handlerA 9.9→0.1；batchB 1.1→1.1；replay 21.0→5.7；scroll 15.5→4.9——六项主阈值按中位全部 PASS。补充 3 轮 new stormA 25.1/18.6/22.8（6 轮中位 20.7）。**保留**：单轮 43.2ms 尖峰、2/6 轮 >25ms；预注册 mounted 相等护栏跨渲染器不适用（旧 1 vs 新 361，已声明口径偏差；新多挂 360 行仍更快）。

**自写 Electron 冒烟（离线 IPC 替身，30/30，exit 0）**：220 事件 count 220/挂载 61/上 spacer 12,084/贴底；operator `toolCallId` 锚点 index=count−2（前 activities、后 assistant）；状态优先级（等待确认>工作中>错误>空闲，B 失败 sys-config `rgb(201,122,109)`）；Markdown XSS 负例零 script/img/javascript: href、安全链接 `rel=noopener noreferrer`；虚拟卸载重挂 details/choice 保持；IME 组合不发送、提交后恰一次、附件载荷与清空；`rowModelDebug`/`paneDebug` 字段齐备；零 console/CSP/did-fail-load。

**uiux-v2 / toolfold 分类**：新入口默认段 9 布尔 8 过，第 9 项「one independent work list without duplicated role documents」为**工作概览/队列抽屉（3B/4）**；旧入口同段 91 布尔 90 过 + 1 条既有红（`expired old shell shown disabled in its own runtime`）。toolfold 新入口 13 布尔 12 过；失败项 `tail fold movement bounded…` 观测 Δ=**51px**（阈值 20），**旧入口同检查也失败 Δ=32px** → 旧基线既有红、非 3A 新引入，新 Δ 更大留 3B/5。**阶段门「同一套 e2e 双端逐 check 名对照」按提案文字未达成**（新入口第 9 项中止；旧入口 101 项）→ 交 PM 裁定 3A 是否以缩小口径过门。

**DOM 契约变更评估**：bench 优化引入「>40 行且闭合的大工具组延迟挂载」。现有 e2e 无任何断言查询闭合大组内部行（最大夹具 12 调用，bench 不查 DOM）→ 不破坏套件；但属有意行为差，建议契约面登记「查询闭合大组前先展开」并由 PM/测试确认该例外。

**依赖**：3A 零新增；相对 HEAD 新增 107 包中 +10 为已批准 markdown-it 15.0.3 + @types 工具链；`typescript` 收紧 `7.0.2`（Q1 收口）；禁入清单零命中。

**结论**：框架项 **pass**；阶段门判定 **needs-work**（双端对照未达成、toolfold 锚点与 bench 单轮尖峰、懒挂载例外均待 PM 裁定）；**missing-evidence 无**。未验证：真实模型/网络、打包、Windows/DPI/屏读、其余 90+ 项、长转录手感、3B/4 业务面、3A2 视觉组逐项（由 UIUX 复核，本次仅覆盖子集）。只写本角色文档与证据；未改产品代码/测试/构建配置；未 commit。详见[报告](docs/change/2026-10-21_change_phase3a-independent-verification.md)与[证据](docs/change/2026-10-21-phase3a-verification-evidence/)。

## 2026-10-21（Phase 2b）— UI 平台化 Phase 2b 修正独立复验：通过（冒烟 49/49、旧基线 679/679、依赖零漂移；无失败项）

**背景**：候选已变化（UIUX Phase 2 评审 needs-work 后桌面UI 完成 Phase 2b），原 Phase 2 结论对受影响部分失效，按证据溯源重新执行。

**变更面**：旧渲染器 9 文件 + `app/main.ts`/`app/preload.cjs`/`app/desktop/` 与 HEAD 逐字节相同；修正全部在 `app/renderer/src/`（`html class="dark"`、自绘 `EngineSelect`、焦点环/primary hover-active/checkbox warning/960 scope 后缀/禁用发送中性底）。依赖零新增：`package.json` 与 HEAD 的 diff 与 Phase 2 证据逐字相同、锁 0 删除/0 既有变更/97 新增、禁入清单零命中；`dist` 仅 3 个文件。

**干净重建**：`typecheck:renderer` exit 0、`build:renderer` exit 0；gzip9 合计 **189,355B ≤ 300KB**（JS 176,970 + CSS 11,998 + HTML 387）；静态扫描零内联脚本/`<style>`/`style=`/`unsafe-*`，严格 CSP meta 在位；JS raw 556.3kB（引擎选择器自绘后 tree-shake）。

**自写 Electron 冒烟 49/49（exit 0）**：`html.dark`/`color-scheme:dark`；`#sc-allow` border `rgb(107,117,126)`（--input）；focus-visible 2px solid `rgb(111,160,139)` + offset 3px（主冒烟 CDP 强制伪类 + 过渡等待；补充可见窗口真实 Tab 探针 4 类目标全过）；primary hover `rgb(127,178,155)` / active `rgb(94,143,122)`（真实鼠标事件）；Checkbox 选中 `rgb(196,161,95)`；引擎 combobox/listbox/option + ↑↓/Home/End/Enter/Esc/Tab + 焦点返回逐项通过；960 scope 664、无溢出、演示后缀隐藏且不截断；IME 组合期不发送/提交后拦截/229+isComposing+Shift 守护；确认卡 640/默认焦点 `sc-deny`/Esc=deny；侧栏 248→328/双击 248/Shift+→272/收起 0/展开 272；零 console/CSP/did-fail-load/preload-error/render-gone。

**测量坑（已存档，供 Phase 3 e2e）**：`show:false` 隐藏窗口 `document.hasFocus()=false`，**`:focus-visible` 不匹配**（Tab 与 `focus({focusVisible:true})` 均无效），需 CDP 强制或可见窗口；`transition-colors` 120ms 含 outline-color/background-color，瞬时读数会落在中间值，须等 ≥200ms。

**旧基线**：`node --test test/桌面应用/*.test.ts` → **679/679 pass / 0 fail / exit 0**。完整 e2e 双端对照按计划留 Phase 5。

**契约面**：引擎行 8 已更新为「已满足（Phase 2b）」，与实测 ARIA/键盘逐项一致；行 6（树键盘）仍按 Phase 3 延后；未发现虚报。

**结论**：**通过**；未验证项（完整 e2e 双端、打包、Windows/DPI/屏读/reduced-motion、确认卡退场/菜单入场 Motion、树键盘、真实会话引擎行为）与原因见报告。与桌面UI 自述无实质不一致（gzip +472B、focus-visible 测量方式、过渡读数时点三处口径差异）。只写本角色文档与证据目录；未 commit/push。详见[报告](docs/change/2026-10-21_change_phase2b-independent-reverification.md)与[证据](docs/change/2026-10-21-phase2b-verification-evidence/)。

## 2026-10-21 — UI 平台化 Phase 2 独立验证：通过（冒烟 48/48、旧基线 679/679、契约面零虚报；无失败项）

**范围**：产品提案 revision 2 §六 Phase 2 阶段门、PM 评审 M2/A5；受验对象为桌面UI 的 [React 渲染器骨架](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md)、[契约面清单](../桌面UI/docs/feature/ui-contract-surface.md) 与装配 [Phase 1 工具链](../装配/docs/change/2026-10-21_change_ui-platform-toolchain.md)。本角色从当前工作树重新执行，不复用对方脚本/结论。

**变更面**：旧渲染器 9 文件 + `app/main.ts`/`app/preload.cjs`/`app/desktop/` 与 HEAD 逐字节相同（sha256 存档）；`app/` 新增仅 `app/renderer/{components.json,src/,tsconfig.json}`；16 个依赖精确版本、全在 devDependencies、无额外包；锁文件 0 删除/0 既有变更/97 新增；`motion→framer-motion` 同版本属其自身结构；禁入清单零命中；`electron-builder.yml`/`release.yml` 未动；`typescript ^7.0.2` 为既有 PM「实施中确认」开放项。

**干净重建**：删除 `app/renderer/dist` 后 `npm run typecheck:renderer`（exit 0）、`npm run build:renderer`（exit 0，2748 modules）；产物 `dist/src/index.html` 570B + JS 638,808B + CSS 62,742B；入口引用资产 gzip9 合计 **216,784B ≤ 300KB**；静态扫描零内联脚本/`<style>`/`style=`/`unsafe-*`，严格 CSP meta 逐字在位；运行时零 `<style>`。

**真实 Electron `file://` 冒烟（自写脚本，48/48）**：标题栏 36、会话头 64、侧栏 248、内容列/胶囊 900、5 demo 角色；侧栏拖拽 248→328（同轮 aria/storage）、双击 248、Shift+→272、±8、收起 0（160ms 过渡结束后）/展开保留 272；抽屉 424/Esc/焦点返回；确认卡 640/默认焦点 `sc-deny`/Esc=deny/放行单独路径；IME 组合期 Enter 不发送、组合后 Enter 拦截并如实标注、keyCode 229 与 isComposing 守护；页面 CSP 违规 0、console 错误 0、did-fail-load/preload-error/render-gone 0。附加：无 preload 时窗口按钮禁用并标注「窗口控制不可用」；960×620 无横向溢出、内容列 664、会话头 60。

**旧基线**：`node --test test/桌面应用/*.test.ts`（shell glob，未改任何测试）→ **679 tests / 679 pass / 0 fail / 0 skip，exit 0**。完整 e2e 双端对照按阶段计划留 Phase 5（套件目标切换尚未实现，未覆盖项已列明）。

**契约面抽查**：计数类声明全部精确吻合（uiux-v2 `check(` 394/唯一名 384、11 方法出现次数逐项相同、82 id 全在源码；main 323 log/51 id；ime 9 调用点→24 名逐项相等；renderer.test 108；入口行号与 4 类 env 全命中；附录 199 选择器全可寻）；新驱动同名子集接真实 store、20 项 `unimplemented` 且无假实现。判定清单可执行、无遗漏或虚报。

**依赖/供应链**：`npm audit` 8 moderate 全为既有 `electron-builder@26.15.3` 传递链（节点均在 HEAD 锁中），`npm audit --omit=dev` 为 0；无 radix/react-aria/vitest/dnd-kit/tw-animate-css/第二套动画或图标库。

**结论**：**通过**；未发现失败项；未验证项（完整 e2e 双端、引擎菜单交互、窗口按钮真实效果、打包安装包、Windows/DPI/屏读/reduced-motion、Phase 2 范围外业务面）与原因见报告。与桌面UI 自述无实质不一致（gzip 精确值差 383B、收起宽度读数时点、裸夹具主进程 stderr 三处口径差异已登记）。只写本角色文档与证据目录，未碰产品代码/构建配置/测试/他角色文件；未 commit/push。详见[报告](docs/change/2026-10-21_change_phase2-independent-verification.md)与[证据](docs/change/2026-10-21-phase2-verification-evidence/)。

## 2026-10-18 — 四角色治理全自动链路独立端到端验收：新增 26/26；全量 2938/2919/16/3（新增红 0）；typecheck 0

**任务**：客户要求「不要让客户手测，把四角色全自动链路跑到绿」——用桩适配器/假模型跑真实桌面接口与真实项目目录，复现并验证 8 个真机失败场景。

**新增套件**：`test/测试/governance-e2e-auto/`（`fixture.ts` + 9 个测试文件 **26 例**），全部离线。夹具要点：真实 trio 项目（`.ans/project.json` pin-backed acceptance + 治理边界文档）；跨多轮脚本化适配器（逐能力位透传 `buildGovernedTools`）；假判断会话解析真实 driver 提示词、先真实 `judge_read_file` 再交回结论；桌面台走真实 `createDesktopInterface`（真实 `listProject`/`openRoleSession`/客户通道/判断 driver/listing 刷新）。

**逐场景**：① 首次新建提案 write 卡：双开关开 + 判断 allow ⇒ 0 卡、账本 `decisionEvidence.kind:"judge"`；空 preview ⇒ driver 回落手动。② 接受提案：先 Convener 写流程单，落盘后才派 Nominator；缺失则停住不循环。③ 任命后 executor 未写卡：先派 Nominator `appointment-write`，listing 刷新后才派 Convener；始终未写出则如实失败。④ `role_status`/`dispatch_task`：未任命/未写卡拒绝，写卡后受理；账本 app 与 convener 两类 `dispatch.accepted`。⑤ 双开关矩阵、accept-quick 不代批、single/su 不启用。⑥ 验收门槛四类 negative + positive。⑦ 判断超时默认 60s/env 覆盖/两组原卡回落。⑧ `list_dir` 可用、敏感项不列、越界拒绝、`read_file` 遇目录指路。另加**四角色全自动闭环**（Liaison→Rapporteur→Convener→Nominator→写卡→Convener→executor），0 手动卡、当前 pane 不切换、listing 刷新、账本可还原。

**旧断言同步（未放宽）**：`g4-skill-verify/h-scope-audit` 固定工具面清单加入 `list_dir`（8 项）；`governance-judge-cards-verify` d/e 与 `governance-liaison-verify/d` 的 accept 下一步同步为现行两段式 Convener + `followUp:"nomination-after-flow"`（3 条旧契约红转绿）。

**结果**：新增套件 **26/26**；judge-cards + liaison **77/77**；g4-skill **50/51**（1 条既有 Windows symlink EPERM）；全量 **2938 / 2919 pass / 16 fail / 3 skip**（基线 2896/2877/16/3：+42 tests、+42 pass、失败数不变；16 红全为既有环境/他角色在途）；`npm run typecheck` → **0 错**。**未发现实现缺陷**。详见[报告](docs/fix/2026-10-18_verify_governance-e2e-auto.md)。未 commit/push。

## 2026-10-18 — 双开关「替我审批/替我决策」+ 治理判断 agent 独立验证：本批 42/42；全量 2896/2877/16红/3skip（新增红 0）；typecheck 0

**验证对象**：PM 评审 `2026-10-18_design_judge-governance-cards-review.md` §三–§九/§十二（AC1–AC26）已落地实现。

**新增套件**：`test/测试/governance-judge-cards-verify/`（`fixture.ts` + 6 文件 **41 例**）——双开关矩阵（都关/仅 approval/仅 decision/都开/独立性）；六卡种与 accept-quick（proposal/appointment 推荐集/写盘三卡逐路径/acceptance 最高门槛）；required-read 与机械复核；回落矩阵（证据不足/读失败/超时/引擎不可用/解析失败/无 cardKind/single/su/按组隔离/结果行失败/判断中关开关/中止关窗/driver busy）；账本审计（`decisionEvidence.kind:"judge"` + group/cardKind/engine/model/reason/evidence/selected/paths；客户手答仍 `customer-input`）；一项目一卡/同一 id 只答一次/judging 占卡/`onNextStep` 恰一次/replay 不重判；UI（两复选框、一次性警告、结果行、notice、桥缺失/single 禁用、preload 四方法、主进程按组接线）。

**旧断言修正（未放宽）**：`shell-judge-verify` 4 文件 7 条——标签「替我审」→「替我审批」、警告三行→按组四行、结果行/deny 档/retryHint 增「代审批」、`.ans` 整体 app-private（含账本）且列表整体拒绝。

**结果**：本批 **41/41**；`shell-judge-verify` **36/36**；全量 **2893 / 2874 pass / 16 fail / 3 skip**（**新增红 0**；既有红 16＝Windows symlink EPERM 9、子进程中止时序 1、markdown vendor pin 1、桌面 renderer/runtime-ui 源码钉 5）；`npm run typecheck` → **0 错**。

**复审（同日）**：属主修复两项观察——① 编排 acceptance 补机械门槛（流程各步 done、每步有 `dispatch.accepted`、无阻塞/未结算决定/未闭环澄清，否则 manual）；② shell 出路统一「关闭『替我审批』后重试」。本角色新增 acceptance 机械门槛 5 例（pending/缺 dispatch/blocked/无步骤表/unclassified），并把 `b-deny-flow` 的 `EXIT_LINE`/reason 断言同步为新口径；复跑本批 **42/42**、`shell-judge-verify` **36/36**、全量 **2896 / 2877 pass / 16 fail / 3 skip**（新增红 0）、typecheck **0 错**。另同步治理判断默认超时 60s→120s：`governance-e2e-auto/g-judge-timeout` 场景 7a 默认值期望 120s（env 覆盖/非法回退/显式优先不变），该套件 **26/26**；最终全量 **2970 / 2951 pass / 16 fail / 3 skip**（新增红 0）。随后桌面更新手动回落 `judgeNotice` 文案（增「规则判定仅作参考；判断 agent 未完成时才由你手批」）：`c-manual-flow` 11 条期望同步；桌面UI 同步 `ui-labels` 后，`c-manual-flow` 的 retry-capped「同解」精确串也更新为新文案；全量 **2985 / 2966 pass / 16 fail / 3 skip**（新增红 0）、`shell-judge-verify` **36/36**、typecheck 0。残余另含 single/无 cardKind 按契约无 notice 与已登记风险。详见[报告](docs/fix/2026-10-18_verify_governance-judge-cards.md)。未 commit/push。

## 2026-10-18（复审 2）— 桌面契约更新（write 卡镜像等）后 reverified：本批 35/35；全量 2780/2761/16红/3skip（新增红 0）；typecheck 0

**契约更新**：桌面侧治理角色 settle 后刷新 listing；`routeDispatch`/`role_status` miss 时强制刷新一次；任命后等 Nominator 写完再派 Convener；**镜像白名单新增普通 `write` 卡**（报告员写入确认也镜像到联络官）。

**本角色同步**：`d-mirror-advance` 两条旧契约断言由「write 不镜像」改为「write 镜像到 liaison」；`isMirroredGovernanceCard` 范围由五类改为六类（含 write）；新增「write 卡镜像：同一 id 只答一次（第二次 expired）、下一步回调不重复」用例。

**复审结果**：本批 **35/35**；全量 `node --test "test/**/*.test.ts"` → **2780 / 2761 pass / 16 fail / 3 skip**（复审 1 为 2772/2753/16/3；+8 tests＝桌面属主契约测试 7＋本角色 write 用例 1；**新增红 0**；剩余 16 红全为既有）；`npm run typecheck` → **0 错**。报告追加 reverified 事件并更新第二/三/五/六/八节；未发现新的实现缺陷。未 commit/push。


## 2026-10-18（复审）— 四角色三处缺陷修复后 reverified：本批 34/34；全量 2772/2753/16红/3skip（新增红 0）；typecheck 0

**修复复审**：① 编排：`power` 统一 `"liaison"`；CLI `--function liaison`（参数解析）与 `--role liaison`（govern）显式拒绝；新增 `governanceWriteOwnerHint` 使 Liaison 越界写文案指回报告员/提名官/召集人/应用。② 桌面：交接成功补写 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId, flowId?, messageSummary, runtime}`（失败不写、账本失败只诊断）；`advanceGovernanceFlow` 支持卡片/上下文显式 `stepId`，缺席记 `advance.ledger.step-missing` 且**不伪造字段**。③ 门禁：Liaison 越界写文案按归属分流（应用/报告员/提名官/召集人）。

**本角色同步（期望对齐，非放宽）**：`b-intent-handoff` 的 `power` 由「`liaison` 或 `communication`」收紧为严格 `"liaison"`；AC5 用例改走真实桌面链验证 `intent.handed-off` + `dispatch.accepted(intent-handoff)` 各一份；`d-mirror-advance` 增加显式 `stepId` 入账/缺席不伪造断言；旧三权 `a-listing` 写权矩阵的 Convener 角色卡文案期望改为 `/提名官|Nominator/`（旧「应用治理记录/其他治理角色」文案已不存在）。

**复审结果**：本批 **34/34**；全量 `node --test "test/**/*.test.ts"` → **2772 / 2753 pass / 16 fail / 3 skip**（首轮 2769/2747/19/3；+3 tests＝属主修复批次自有新增；**新增红 0**；剩余 16 红全为既有：Windows symlink EPERM 8、runtime-core shell 竞态 1、桌面 markdown vendor pin 1、桌面 renderer 源码钉 4、桌面 runtime-ui 1、本角色 g4-skill symlink 1）；`npm run typecheck` → **0 错**。报告追加 reverified 事件并更新第三/四/五/六/八节；残余仅「卡片未携带 `stepId` 时账本无该字段（已诊断、不伪造）」的如实说明。未 commit/push。


## 2026-10-18 — 治理四角色（新增 Liaison 联络官）独立端到端验证：新增 34 例（31 通过/3 红按评审口径）；修正 7 条旧三权断言；全量 2769/2747/19红/3skip（新增红 3，既有红 16）；typecheck 0

**范围**：PM 评审 `2026-10-18_design_governance-liaison-review.md` §4–§7/§九/§十（客户 2026-10-18 拍板「三权不变、角色四名」）已落地的门禁引擎/运行时核心/编排/桌面窗口/桌面UI。

**方法**：自建 `test/测试/governance-liaison-verify/`（`fixture.ts` + 6 文件 **34 例**），全部离线。实施方 `createFakeRuntimeAdapter` 未转发 W6-A 的 `handOffIntent`/`requestClarification`，故夹具用运行时核心 `buildGovernedTools` **自建等价适配器**（逐能力位透传），使两个新工具真实注册并执行到编排包装器；桌面链＝真实 `SessionManager` + 真实 `openRoleSession`；UI＝真 `ui-labels.js` 纯函数 + renderer 源码钉。不读 `.env`、不跑真实模型/凭据/网络。

**逐项结论**：① 四角色枚举（liaison→rapporteur→nominator→convener）/`primary=liaison`/旧 trio 零迁移（文件树逐字节）/single 不变/保留 id 全通过；② Liaison 写权（仅 `docs/intents/**`）与能力（仅 `handOffIntent`；无 customerInput/dispatch/install/status/shell）通过；③ `hand_off_intent` 合法交接账本字段完整、八类守卫、去重/initial 一次性/修订引用、每轮一次、非 Liaison 无工具、账本坏 fail-closed、投递失败不重试、交接不是批准、`docs/intents` settle 观察均通过；桌面后台投递恰一条任务、不切 pane、失败零账本；④ `request_clarification` 两轮上限（flow/intent）、账本、主入口系统行、不弹决定卡均通过；⑤ 镜像：同一请求 id/一面登记两面物化/第一次结算第二次 expired/`onNextStep` 恰一次/排队聚合/proposal+appointment+appointment-write+schedule-write+acceptance+**普通 write** 镜像、无 cardKind/single 不镜像均通过；⑥ 自动推进 accept→Nominator、quick/任命→Convener，`dispatch.accepted{app, trigger=customer-decision}` 三次逐条、不写客户决定；⑦ 审计还原（意图→提案→任命→派程→验收）通过。

**缺陷/偏差（未改实现）**：① **AC5 红**——交接成功后缺 `dispatch.accepted{trigger:"intent-handoff", targetRoleId:"rapporteur"}`（评审 §5.3/§7.2；属主桌面窗口/编排）；② **AC21 红**——CLI `--function liaison`/`--role liaison` 仍被接受，评审 §4.6 要求明确拒绝（实现注释称后续任务书放开，需 PM 裁定）；③ **AC3 红**——Liaison 越界写 proposals/contracts/nominations/flows 的拒绝文案统一「应用治理记录/其他治理角色」，未指回报告员/提名官/召集人；④ 口径偏差——`intent.handed-off`/Liaison `artifact.observed` 写 `power:"communication"`，评审写 `"liaison"`（类型兼容、门禁不读）；⑤ 口径偏差——`dispatch.accepted(customer-decision)` 无 `stepId`（评审 AC19 要求，实现注明载荷不携带）。

**旧断言修正（7 条/5 文件，未放宽）**：`governance-trio-verify/a` 3→4 内置 + `primary=liaison`；`c-migration` 迁移后 4 内置 + `primary=liaison`；`d-single-compat` su 能力对象显式加两项 false；`e-ui` 副标题/空态/状态行「三权 · 四角色」/假 listing/硬编码扫描共 3 条；`t9-block1` 4 内置/`primary=liaison`。另同步过期措辞「三人」→「三权角色/四角色」（仅文字）。

**复跑**：本批 **34 例 / 31 通过 / 3 红（上述评审口径未满足项）**；全量 `node --test "test/**/*.test.ts"` → **2769 / 2747 pass / 19 fail / 3 skip**（基线 2735/2709/23/3；**新增 34 例、修正旧红 7、新增红 3**；既有 16 红均与本批无交集：Windows symlink EPERM 8、runtime-core shell 竞态 1、桌面 markdown vendor pin 1、桌面 renderer 源码钉 4、桌面 runtime-ui 1、本角色 g4-skill symlink 1）；`npm run typecheck` → **0 错**。详见[报告](docs/fix/2026-10-18_verify_governance-liaison.md)。未 commit/push。


## 2026-10-18 — 「替我审」一次性警告计时器豁免：更新 3 条渲染零计时器守卫（锁定唯一位置/数量/用途/时长）；全量 2680/2660/17红/3skip；本角色新增红 0

**背景**：桌面UI 按客户 2026-10-18 要求把「替我审批中」开启警告改为**一次性**——显示后约 9 秒自动收起（唯一 `setTimeout` 计时器），保留「知道了」手动关闭。

**本角色同步（3 文件，仅该守卫）**：`g2-verify/u1-renderer`、`existing-project-compat-verify/e-contract-wiring`（E4）、`g3-search-verify/scope-audit-and-fold` 的「renderer 全文零 setTimeout」改为**锁定唯一豁免**：恰一个 `setTimeout`、必须位于 `showShellJudgeWarning`、到期只调 `hideShellJudgeWarning`、时长取自 `UiLabels.SHELL_JUDGE_WARNING_AUTO_DISMISS_MS` 且常量钉死 **9000ms**；`setInterval` 仍为零；恢复卡切片零计时器；计时器回调不触碰任何治理动作（E4 反向断言）。其他断言未放宽。

**复跑**：受影响 3 文件 **22/22**；三权套件 **32/32**；全量 `node --test "test/**/*.test.ts"` → **2680 / 2660 pass / 17 fail / 3 skip**（本角色目录仍 1 红＝Windows symlink EPERM；其他角色 16 红，其中 `桌面应用/boundary-refresh` 的 `O-1 接线钉` 为并发属主 10-18 源码变更引入，非本角色文件、非本轮守卫修改）；`npm run typecheck` → **0 错**。报告追加 reverified 事件并更新第三/四/五/八节。未 commit/push。

## 2026-10-17（复审）— 三权验证两处缺陷修复后 reverified：三权套件 32/32；全量 2669/2650/16红/3skip（新增红 0）；typecheck 0

**修复复审**：① 装配 `src/index.ts::loadInjection` 按评审 §5.4 注入治理模型（外来目录：显式值优先、不可读 single、无 `.ans` 且无角色目录 trio、其余 single；ans-cli 自身仍用载入配置）——`real-entry`（1）与 `t1-real-cli` govern×3 转绿，装配 `govern-target` 2 + `multi-runtime` 5 同源红亦转绿；② 运行时核心安装/看护类 schema 文案统一为「内置治理角色」（不再写死 su）。

**本角色同步**：`g4-skill-verify/a-tools-surface`、`g4v2-mcp-verify/c-tools` 两条**文案期望**改为新文案（仅期望值，不放宽/不删断言）。

**复审结果**：三权套件 **32/32**；全量 `node --test "test/**/*.test.ts"` → **2669 / 2650 pass / 16 fail / 3 skip**（基线 2628/2568/57/3；共固定 41＝本角色断言修正 30＋实现修复 11；**新增红 0**；剩余 16 红全为既有：本角色 1＝Windows symlink EPERM，其他角色 15＝Windows symlink/存储权限 6、runtime-core 工具 2、编排 shell 竞态 1、桌面UI 在途 5、markdown vendor pin 1）；`npm run typecheck` → **0 错**。未发现其他缺陷。报告追加 reverified 事件并更新第五/六/八节。未 commit/push。

## 2026-10-17 — 治理三权分立独立端到端验证：新增 32 例全通过；修正 30 条旧断言；全量 2660/2630/27红/3skip（新增红 0）；typecheck 0；发现 1 项 CLI 注入缺陷 + 1 项文案偏差

**范围**：PM 评审 `2026-10-17_design_governance-trio-review.md` §5–§9/§十一/§十二（客户 2026-10-17 拍板 V1 + V1b）已落地的门禁引擎/运行时核心/编排/桌面窗口/桌面UI 实现。

**方法**：自建 `test/测试/governance-trio-verify/`（`fixture.ts` + 5 用例文件 **32 例**），全部离线。关键链路：真实 `listProject`/`resolveRole`/`resolveBoundarySection`/`resolveWrite`/`evaluateGovernanceGate`/账本/迁移；会话＝真实 `openGovernanceSession`/`openRoleSession` + 确定性桩适配器（脚本化工具调用、立即 settled）；假桌面＝真实 `SessionManager` + 真实 `openRoleSession`（仅假适配器/listing/emit）；假 IPC＝真实 `createDesktopInterface`（仅注入 listing/预览/迁移实现）；UI＝真 `ui-labels.js` 纯函数 + renderer 结构钉。不读 `.env`、不跑真实模型/凭据/网络。

**逐项结论**：① 新空项目恰 3 内置（顺序 rapporteur/nominator/convener）、`primaryRoleId=rapporteur`、trio；② 三人会话按 function 可开，su/非法组合明确拒；③ 能力矩阵逐项（dispatch/status/sessionTail/recovery 仅 Convener；install 仅 Nominator；三人不自我回交；Rapporteur/Nominator 无 shell、Convener 只读档 risky 拒）；④ 写权矩阵逐项（三人预授权范围放行；角色卡/.ans/治理边界/manifest 全拒；文案指路）；⑤ 三道门禁（无接受写 flow/提名拒、无任命写角色卡拒、派发五条 + 快捷路径、账本坏 fail-closed、append 失败不翻转）；⑥ 账本 `customer.decision`/`artifact.observed`/`dispatch.accepted`/`governance.migrated` 字段与顺序，完整 flow 可还原「谁提案/谁提名/谁排程/客户批了什么」；⑦ 一项目一待决定串行队列（第二张不呈现、取消/失效清队、绝不自动批准）；⑧ 迁移六分支（预览零写入、只增/改 governanceModel、未知字段/roles/pin 保留、manifest 留痕、账本 migrated、迁移后 su 隐藏不可开启历史保留、already-trio/no-record/preview-stale/write-failed）；⑨ 旧 single 逐字兼容（su 枚举/边界、shell 审批档、回交/看护主人=su、S1 旧形状与显式 trio 选择）；⑩ UI 三权左树/副标题/空态/状态行/旧模型提示/迁移按钮与预览确认。

**旧断言修正（30 条，均未放宽）**：t9-block1 旧 su 空项目改显式 single（首例改钉 trio 默认）；cli-genesis-boundary 显式 single；existing-project-compat E1/E2/E3 适配可选 `governanceModel`、C5 显式 single；g1/g4-skill/g4v2 预授权来源迁到注册表 `LEGACY_SU_PREAUTHORIZED_DIRS` 并反向钉无第二份；g2/g4 能力判据改为 `cap.*`/`legacyBuiltIn`/`canSchedule`/`canNominate`；看护快照 `suRoleId`→`governanceRoleId`（g2 w1/r1/w3、turn-watch fixture，typecheck 4 错归零）；安装拒绝文案改「或为内置治理角色」；U1 Esc 正则兼容 CRLF。

**缺陷（未改实现）**：① 阻塞性——`src/index.ts::loadInjection` 未按评审 §5.4 注入 `governanceModel`：`ans govern <空目录>`（推断 trio）选到 rapporteur 后，`resolveRole` 仍按 single 解析 ⇒「三权角色在 single 治理模型下不可用」，命令报「治理边界解析失败」；应打开 Rapporteur 再因缺 provider 配置失败。证据：`real-entry.test.ts`（1 红）＋`t1-real-cli.test.ts`（govern×3 红）保留。属主装配/编排。② 轻度——安装类工具 schema 仍写「或为治理角色 su」，与桌面 handler「或为内置治理角色」不一致（trio 下会误导模型，不影响判定）。属主运行时核心/桌面窗口。

**复跑**：本批 **32/32**；全量 `node --test "test/**/*.test.ts"` → **2660 / 2630 pass / 27 fail / 3 skip**（基线 2628/2568/57/3；**新增 32 例全过、新增红 0、固定 30 条**；27 红全为既有：本角色 5＝上述 CLI 缺陷 4＋Windows symlink EPERM 1，其他角色 22）；`npm run typecheck` → **0 错**（基线 4 错已随本批修正）。未 commit/push。详见[报告](docs/fix/2026-10-17_verify_governance-trio.md)。

## 2026-10-17（复审）— 预算误报修复后 reverified：本批 40/40；全量 2496/2473/20红/3skip；typecheck 0

**修复复审**：运行时核心 `budgetDenied` 不再计入 `deniedReads`（预算耗尽返回独立码 `budget`）；编排 `damageCode` 顺序改为 `budgetExceeded → budget`、`truncatedReads → read-truncated`、`deniedReads → read-denied`；驱动 manual 理由改为「判断预算耗尽（读取次数/总读取字节达上限）…」。

**复审结果**：首轮唯一失败用例（第 9 次真实读取应得 `manual/budget`）**转绿**；`shell-judge-verify` 36/36 ＋ `abort-cleanup-verify` 4/4 ＝ **40/40**。全量 `node --test "test/**/*.test.ts"` → **2496 / 2473 pass / 20 fail / 3 skip**（本批新增红 **0**；20 红全为既有：Windows symlink EPERM 8、runtime-core shell 子进程竞态 1、其他角色在途源码/文案钉 11）；`npm run typecheck` **0 错**。未发现其他缺陷。报告追加 reverified 事件并更新第五条。未 commit/push。

## 2026-10-17 — 「替我审」判断 agent + 卡死修复独立验证：39/40 通过；1 项实现缺陷（预算误报 read-denied）；全量 2495/2471/21/3

**范围**：PM 评审 `2026-10-17_design_shell-auto-approve-review.md` §6–§12（运行时核心只读工具/读取策略、编排 `createShellJudge`、三引擎判断模式、桌面开关/IPC/通道/UI、审计/诊断、deny 档放行、结果行失败分叉）及 2026-10-17 卡死修复（abort 清理失败后的隔离解除、Claude 已关闭查询）。

**方法**：自建 `test/测试/shell-judge-verify/`（`fixture.ts` + 7 文件 **36 例**）＋ `test/测试/abort-cleanup-verify.test.ts`（**4 例**）；全部离线。判断链＝真实 `createShellGate → createDesktopOperatorChannel → createShellJudge（经 govern-session 公共出口）→ buildShellJudgeTools`，假适配器扮演模型；假 IPC＝真实开关状态机 + sender 守卫；假渲染＝真 `ui-labels.js`；三引擎＝Claude 假 SDK 捕获 `Options`、Pi 真实适配器 + pi-ai faux provider、Codex 真实适配器 + 假引擎/内存 MCP 桩、Service 装配逐引擎捕获。不读 `.env`、不跑真实模型/凭据/网络。

**关键结论**：① 默认关→原卡、判断 0 次、审计人工无 `judge`；开启 allow→0 卡/1 行/审计 `operator:judge:<引擎>`+`judge`/诊断；项目与 su 审批两条 policy 均正确。② deny（有/无替代方案）→0 卡、§8.4 文本、合成 `customerMessage`+标准出路、结果行；deny 行投达失败仍 deny。③ manual（不可用/超时/解析失败/读取被拒/截断/防循环/引擎不支持/模型自报/上下文过大）→原卡+`judgeNotice`、审计人工；allow 行投达失败→`row-failed` 卡。④ deny 档 judge allow→放行 0 卡，审计/诊断/结果行三处标「deny 档 · judge 放行」；普通 risky/review 不带标记。⑤ 已挂起卡切换开关不受影响；判断中关闭以调用时点为准；关后恢复手动。⑥ 敏感/越界/junction/二进制/预算读取被拒且不泄内容；三引擎均恰三只 judge 工具、无写/shell/网络。⑦ abort 抛错但底层稍后 settle→隔离解除可再进入；底层永不 settle→仍拒绝；Claude `Query closed before response received` 视为已中止，其他 interrupt 错误仍上抛。

**发现缺陷（未改实现）**：真实 judge 工具第 9 次读取（调用预算耗尽）会同时置 `budgetExceeded` 和 `deniedReads`，驱动 `damageCode` 先判 `deniedReads` ⇒ 返回 `manual/read-denied`（卡片「所需项目文件无法读取」），设计要求 `manual/budget`（「读取预算已用尽」）。属主：运行时核心（`policy.ts::budgetDenied` / `shell-judge.ts::damageCode` 优先级）；编排属主测试直接置 stats 未覆盖真实工具路径。失败断言保留，未放宽/跳过。

**复跑**：本批 **40 例 / 39 通过 / 1 失败（即上述缺陷）**；全量 `node --test "test/**/*.test.ts"` → **2495 / 2471 pass / 21 fail / 3 skip**（**本批新增 1 红**；既有 20 红：Windows symlink EPERM 8、runtime-core shell 子进程竞态 1、其他角色在途源码/文案钉 11）；`npm run typecheck` → **0 错**（本批 0）。详见[报告](docs/fix/2026-10-17_verify_shell-judge-and-abort.md)。未 commit/push。

## 2026-10-17 — 治理记录 pin 不符「重新接受」独立端到端验证：AC1–AC12 通过，未发现缺陷；修正 3 条旧断言，新增 11 例

**范围**：PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.5/§六/§八/§九——门禁引擎 `inspectPinnedBoundaries`、编排 `previewGovernanceReacceptance`/`reacceptGovernancePins`、桌面 `listProject.governanceRecord`（`pin-mismatch` + `pinFiles`/`pinCount`）与两个 IPC/preload 方法、桌面UI `governanceActionFor`。实现不改，只做独立验证。

**方法**：自建 `test/测试/governance-pin-recovery-verify/`（`fixture.ts` + **11 例**）。临时项目＝`角色卡/governance-boundary.yaml` + 3 角色 `boundary.yaml`/`role-card.md` + `.ans/project.json`（**真实哈希 pin** 4 条 + 未知字段）+ `docs/bootstrap-manifest.md`；真实链 `listProject → buildEffectiveProjectConfig → preview → reaccept → listProject → resolveRole`；会话入口用确定性桩适配器（立即 settled，不触真实模型）。「零写入」＝完整目录树快照（路径/类型/大小/mtime/文件 sha256）前后 `deepEqual`。

**关键结论**：① 全一致 → evidence `ok`、`present`、无动作、预览 `not-needed`；② 改 1 文件 → `pin-mismatch` 恰 1 条 `modified`，预览 `ok:true`/`canConfirm:true`/changed 正确/`previewDigest` 64 hex，**预览前后零变化**；③ 确认写入 → `completed`，按内容哈希仅 `.ans` 与 manifest 变化，pin 路径/顺序/条数、`roles`、`acceptance.source`、未知字段全不变，被改项写回实际哈希、其余保持旧 pin，manifest 逐字节保留并追加含时间/变更数/路径/完整旧新哈希的一条；④ 写入后 → `present`、su `accepted:true`/`parseError` 空、桩会话可开启；⑤ 删 1 文件 → 预览 `canConfirm:false` + `missing` blocker，写入 `missing-file`/`precheck` 零写入；2 改 + 1 删 → changed 3 条（2 modified + 1 missing）同阻断；⑥ 预览后再改 → `preview-stale`/`precheck` 零写入；⑦ 取消 → 零写入、状态仍 `pin-mismatch`；⑧ `.ans` 缺失 → `missing` + 预览 `no-record` + 只出现 establish；不可解析 → `invalid` + `invalid-record`；⑨ 坏 YAML / `entries: []` → `unparseable-boundary`/`canConfirm:false`/零写入；⑩ Pipeline 公共出口直调同样只改两个文件。

**旧断言修正（语义变更）**：A2 改用新增 `writeRealPinnedAns`（真实哈希）→ `present`；A13 坏 pin 由 `present` 改判 `pin-mismatch`（保留 su 仍未接受/写入被拒覆盖）；E2 渲染侧状态集合由三态正则改为四态 `knownGovernanceStates`（含 `pin-mismatch`）。未放宽或删除覆盖。

**复跑**：本角色两目录 **53/53**；全量 `node --test "test/**/*.test.ts"` → **2314 / 2216 pass / 95 fail / 3 skip**（上一有效基线 2313/2215/95/3；本批 +1 用例通过、红数不变；**95 红全为既有且不在本批目录**：依赖缺件 74、Windows EPERM 7、其他无关漂移 14）；`npm run typecheck` → **85 错**（全为既有依赖缺件，本批改动文件 0 错）。**未发现实现缺陷**；AC11（写入阶段故障注入）与 AC17（manifest 不可读）未由本 E2E 覆盖，AC11 由编排套件覆盖、AC17 留白。详见[报告](docs/fix/2026-10-17_verify_governance-pin-recovery.md)。未 commit/push。

## 2026-10-17（复审）— 到点检查偏差修复后 reverified：三项修复全落地，全量 2246/2150/94红/2skip，桌面 5 条旧红消失

**修复复审**：① 运行时核心 `resolveRuntimeTimeouts` 改为**全运行时**读 `ANS_PI_PROMPT_TIMEOUT_MS`（env=60000 → pi/claude/codex 均 60000）；② 设置 help 补齐「仍在推进则不动作」「留空＝系统默认（5 分钟）」；③ 桌面 `turn-deadline` 解除**不再投「看护恢复」行**（仅诊断），5 条属主测试已用显式注入同步。

**本角色同步**：`g2-verify/w1-signals.test.ts` 身份更替用例由「投恢复行」改为「不投恢复行、新一轮独立告警」；`turn-watch-verify` A1 同步；C1 增加三 runtime env 断言、C2 增加 help 两项措辞断言。

**复审结果**：独立套件 **15/15**、w1 **14/14**、t1 **8/8**、scope-audit 通过；全量 **2246 / 2150 pass / 94 fail / 2 skip**（上轮 2245/2144/99/2；**桌面窗口 5 条旧红全部消失**；94＝既有 93＋Codex 缺 MCP SDK 1 条环境红；无其他新增/消失）；typecheck **85 错**（本批/同步文件 0）。报告 revision 2 + `reverified` 事件；证据补 `reverify-*`。未改产品代码，未 commit/push。

## 2026-10-17 — 到点检查 + 1 小时兜底独立验证：核心行为通过；1 项功能性偏差 + 2 项文案/建议偏差（列属主）

**范围**：客户 2026-10-17「整轮不应该有超时…到了时间 su 去看是否卡死…保留 1 小时兜底」；PM 评审 `2026-10-17_design_turn-watch-and-recover-review.md`。运行时核心/服务/Pi/Claude/Codex/桌面看护/编排文案/门禁 su 卡/PM 设置。

**方法**：自建 `test/测试/turn-watch-verify/`（**15 例** 4 文件＋夹具：看护 rig/挂起 provider/SessionManager/桩恢复）；同步本角色旧断言 3 处（t1 4 条红→8/8、w1 90%→100%→14/14、g2 scope-audit ratio 0.9→1.0）。不真等 1h、不跑真实模型/破坏性命令。

**结论**：① 到点不中止（检查 40ms/兜底 300ms 注入：100ms 零 settled）；文案「轮次到点检查」+不中止/不动作/卡死才 propose/1 小时兜底，旧措辞零命中；每轮恰一条、下一轮独立；挂起卡/su 忙排除。② 1h 兜底到点才中止；settled 摘要「最后兜底」、与检查可区分；确认卡挂起 2× 时限不中止（同一 withPausableTimeout 原语）。③ 非整轮时限 600000/120000/120000 不变。④ 设置 label/档位/默认标签/1h 不暴露；role_status「看护检查时限 5 分 0 秒 / 1 小时最后兜底」；su 卡命令纪律齐备。⑤ propose_recovery 未确认=未执行、确认=已执行；watchdog 不自动执行。⑥ 三适配器+服务整轮均接 turnLastResortMs。

**偏差（不修，列属主）**：1）**功能性**：非 Pi runtime 不读 `ANS_PI_PROMPT_TIMEOUT_MS`（实测 pi 60000 / claude 300000 / codex 300000），评审 §3.1/§3.3/§5.9 要求全运行时读取——属主运行时核心。2）设置 help 与评审 §3.3 非逐字（核心语义在位）——属主 PM。3）turn-deadline 解除仍投「看护恢复」行（评审建议不投/改文案）——属主桌面窗口，不阻塞。

**复跑**：本批 15/15；全量 **2245/2144 pass/99 fail/2 skip**（上轮 2215/2120/93/2；+30 测试 / +6 红：既有 93（依赖缺件 75、EPERM 8、CRLF 9、计时竞态 1）＋桌面窗口属主 5 条未同步新默认（session 4 按 120s、multi-runtime 1 条 choiceLabels）＋Codex 新用例 1 条缺 MCP SDK）；typecheck **85 错**（本批 0）。详见[报告](docs/change/2026-10-17_change_turn-watch-recover-verify.md)与[证据](docs/change/2026-10-17-turn-watch-recover-verify-evidence/)。未 commit/push。

## 2026-10-17 — su 的 run_shell 审批策略独立验证：整体通过（0 不通过 / 6 备注）

**范围**：客户 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；PM 评审 `2026-10-17_design_su-shell-approval-review.md`。编排（operatorOnly/approveDeny/分支/守卫、assembleOperatorShellGate、run-role su-only 与互斥、CLI 模式文案）、门禁引擎（内置卡命令纪律）、桌面窗口（su 注入 + tier/policy/plain reason）、桌面UI（SU 卡）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/su-shell-approval-verify/`（5 用例文件 **36 例** + 夹具 + 离线 Electron 卡片探针 9 项）。全部假件/临时目录；零执行哨兵只用 `process.execPath -e` 写临时文件（无 `sh -c`/rm）；不跑真机、不用凭据。

**关键结论**：① allow → 0 卡、`c-allow`、by「（su 审批档）」；risky/review/deny（approveDeny）各恰 1 卡，批准→`c-*→a-allow`、拒绝/超时/不可用→对应 `a-deny/a-timeout/a-unavailable`；deny 无 approveDeny → `c-deny` 0 卡；四组构造守卫全抛错。② 审计 command 原文/argv/cwd/branch/by/conditions 齐备、三态可辨。③ `assembleOperatorShellGate` 缺件 fail-closed；run-role su-only/互斥/装配失败均不 arm；type 面无 pmAsk/routineShellPolicy。④ 桌面 su 收 `shellOperatorOnly`、不收 `shellReadonly`；项目角色三层链不变；缺件不 arm。⑤ 卡片 tier/policy/三档 plain reason/SU 标题/警告/默认拒绝焦点；Esc 回传 allow:false；项目卡旧呈现不变。⑥ 真实 gate+run_shell：批准 deny/risky 真实执行；拒绝/超时/不可用哨兵不存在；review 批准 spawn 失败如实。

**复跑**：本批 **36/36**、卡片探针 **9/9**；全量 `node --test "test/**/*.test.ts"` → **2215 / 2120 pass / 93 fail / 2 skip**（上一轮 2153/2058/93/2；+62 测试＝本批 36＋并发属主 26；**红数 93 与组成不变**：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）；typecheck **85 错**（全为既有依赖缺件，本批/同步文件 0 错）。**并发值钉同步**：Pi 滑块批次新增 `ANS_PI_PROMPT_TIMEOUT_MS` → t29 面板键 5→6；桌面角色状态消歧 → g2 R1 接受「上一轮终局（不表示当前轮）」——同步后红数回到 93，非产品缺陷。未发现需返工缺陷。详见[报告](docs/change/2026-10-17_change_su-shell-approval-verify.md)与[证据](docs/change/2026-10-17-su-shell-approval-verify-evidence/)。未 commit/push。

## 2026-10-17 — 渲染轮复审（助手消息即时 Markdown）：全量 2153/2058/93红/2skip，e2e 原失败点通过、剩余红经 HEAD A/B 证明既有

**范围**：桌面UI 渲染改动（`appendAssistant` 恒 `mdReady:true`；旧行升级仅作安全网）＋ `uiux-v2.mjs` 两处 `.trim()` 修订。

**结果**：① 全量 `node --test "test/**/*.test.ts"` → **2153 / 2058 pass / 93 fail / 2 skip**（较上轮 +1 测试＝并发属主；红数 93 与组成不变：依赖缺件 75、EPERM 8、CRLF 源钉 9、计时竞态 1）。② e2e 当前 renderer → exit 1，**仅** `virtual visible nonempty`（`uiux-v2.mjs:1044`）；其前全部通过，**含原失败点 `routine collapsed; failure direct; assistant untouched`（:964）**。③ **独立 HEAD A/B**：在 `test/测试/.tmp-e2e-head-arm/` 建隔离副本（复制 app/src/e2e，renderer 用 `git show HEAD:`，sha256 前 8＝`7d18858b`），同点同观测失败 → 该红**先于本轮**，桌面UI 自报属实；运行后删除副本。④ 新语义独立 Electron 探针 `test/测试/render-md-ready-probe.mjs` → **6/6**：源码字面 `mdReady:true`；含 `##`/表格的助手消息未 settled 即 `<h2>/<table>`、内容保留、无 `is-streaming`；settled 不重复插行/不回退；旧行安全网（仅升级 `mdReady:false`，settled 仍调用）在位（新进程内运行期不可达，源码面验证）。

**结论**：未新增红、原失败点已修；剩余 `virtual visible nonempty` 非本轮引入，不判返工，建议后续独立定位。证据：`renderer-round-summary.md`、`renderer-round-e2e-current.txt`、`renderer-round-e2e-head-arm.txt`、`renderer-round-md-probe.txt`(+report json)。只改 `test/测试/` 与本角色文档；未 commit。

## 2026-10-17 — 客户裁定「系统默认就是 500k」：t29 默认值钉从 32768 同步为 500000

**来源**：客户 2026-10-17 裁定「我的意思说系统默认就是500k」；Pi适配器已把 `DEFAULT_PI_CONTEXT_WINDOW` 改为 **500000** 并更新 notice 文案。本角色同步自己属下的钉值：

- `test/测试/t29-pi-config-roundtrip.test.ts:161`：`assert.equal(DEFAULT_PI_CONTEXT_WINDOW, 32768, "保守默认值应钉死为 32768（勿被悄悄改动）")` → **500000**，文案「系统默认值应钉死为 500000（客户 2026-10-17 裁定）」；同段「保守默认值/保守默认」注释与用例名按新语义改为「系统默认值」（:137/:140/:143 与 :160 回落断言消息）。
- `test/测试/t9-block1-bootstrap.test.ts:78` 手工步骤说明「留空 = 用保守默认」→「留空 = 用系统默认 500000」（非断言，措辞同步）。
- 其余 `32768` 出现均为**显式夹具值**（`g4-skill-verify/g-splicing.test.ts` ×2、`g4v2-mcp-verify/j-pi.test.ts` ×1 的 `contextWindow: 32768`），按指示**未改**。

**复跑**：`node --test "test/测试/t29-pi-config-roundtrip.test.ts"` → **11/11 pass**；全量 `node --test "test/**/*.test.ts"` → **2152 tests / 2057 pass / 93 fail / 2 skip**（较上一轮 2150/2055/93/2：新增 2 例由并发属主落地、**红数 93 不变、归因不变**——依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）。只改 `test/测试/` 与本角色文档；未碰产品代码、未 commit。

## 2026-10-17（复审）— 编排按备注②/⑤修正两处文案后 reverified：独立套件 42/42，全量计数与 93 红归因不变

**修正对象（编排，语义/契约不变）**：① `GOVERNANCE_RECORD_ACCEPTANCE_SOURCE` → `desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`（一次性的是种子边界对象，不是该来源字符串）；② 写入阶段失败消息 → `写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。`（不再承诺「重新执行」；phase/不重试/不清理不变）。

**复审**：独立套件 `node --test "test/测试/existing-project-compat-verify/*.test.ts"` → **42/42 pass**（B5 按新文案加正向断言 + 「不得出现『重新执行』」反向断言；B12 改为复审语义；其余断言引用常量，自然通过）；全量 `node --test "test/**/*.test.ts"` → **2150 tests / 2055 pass / 93 fail / 2 skip**（与修正前逐位相同；93 红组成不变：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）；`npm run typecheck` → **85 错**（不变，本批/本轮实现 0 错）；`reverify-sha256-freeze.txt` **24/24** 逐字节一致。报告 status 保持 `verified`、`revision: 2`、事件追加 `reverified`；备注②/⑤改记为「已由编排修正」。未改产品代码，未 commit/push。

## 2026-10-17 — 已有角色但无治理记录的项目兼容（B+C V1）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：门禁引擎（A1 种子边界 Service 公共出口、I5 F6 恢复指引）、编排（I3 preview/establish、一次性种子边界、进程内互斥、B2 薄再导出）、桌面窗口（I1 `deriveGovernanceRecord`、I2/C1 IPC 与守卫）、桌面UI（I4 状态行/su 空态/预览面板/文案）。批准口径＝客户 2026-10-17「按 B+C 来」；验收口径＝PM 评审 §六（V1–V8/V6b、N1–N8）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/existing-project-compat-verify/`（5 用例文件 **42 例** + `fixture.ts`）。夹具与客户现场同形状（N 角色 `role-card.md` + **仅** `boundary.md`、无 `.ans`；另 S1b/N5/S2/S3/S4 变体）；真实链 `listProject → buildEffectiveProjectConfig → resolveBoundarySection → resolveWrite`，机制经 Pipeline 公共出口调用。证据：`sha256-freeze.txt`（24 文件指纹）、`git-status-short.txt`、`verify-suite-output.txt`（42/42）、`flaky-abort-recheck.txt`、`full-suite-summary.md`、`typecheck-summary.md`。

**关键结论**：① V2 三产物 + `.ans` 结构 + pin 逐条独立实算一致 + manifest 一致 + completed；② V3 确定性：su 写 `docs/su/memo.md` allowed、`src/**` 拒；V4 角色边界前后不变；③ V5/V6 零写入（树 + mtime）；V6b phase=write 且 message「可能已写入部分文件」、文案绝不称零副作用；V7 幂等；并发恰一 ok 一 busy；一次性边界无 genesis 标记、重建重算 pin（不信任预览）；④ F6 首句逐字且恰一次 + 指引（两份 `format-denial` 同构）；V8 确认卡不发行 writeSet、不产生 `.ans`；篡改/伪造 pin 仍未接受；⑤ N1/N2 invalid+reason；N4 采纳与坏文档；N5 缺件跳过；N7/N8 既有创世与 CLI 注入不变；⑥ 40 个改动/新增文件 40/40 在属主 boundary 内，零越界。

**复跑**：本批 **42/42**；全量 `node --test "test/**/*.test.ts"` → **2150 tests / 2055 pass / 93 fail / 2 skip**（基线 2108/2014/92/2；93 红全部归因既有环境：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9〔含任务书已列 renderer.test 4 + markdown 1〕、计时竞态 1——均与本轮实现无交集）；`npm run typecheck` → **85 错，全部既有依赖缺件**，本批与本轮实现文件 0 错。

**备注（不判缺陷）**：N6 `nothing-to-pin`/precheck `blocked` 经 preview/establish 入口结构性不可达（hasRoles 先判 + 内部种子恒覆盖写路径），底层经 `finalizeBootstrap` 直调验证；V6b message「重新执行」在 `.ans` 已落盘子场景会得 already-established（设计原文，含「或核对现场」）；跨进程无全局锁（设计已登记）；`present ≠ su 可写`（V1 文档化限制，A13 实证）；`acceptance.source` 落盘后含「不持久化」字样（指一次性边界而非该字符串）易误读，建议 V2 改述；真实 su 会话/Electron e2e 属客户与桌面UI 轮。详见[报告](docs/change/2026-10-17_change_existing-project-compat-verify.md)与[证据](docs/change/2026-10-17-existing-project-compat-verify-evidence/)。未 commit/push。

## 2026-10-16 — v1.3.0 CI Windows 红修复：验证套件平台适配（6 红全为测试侧；产品修复需求零）

**来源**：CI run `38924209553` Windows job（regression tests 8 红，其中 test/测试 面 6 红＝本角色验证套件；另 2 红属 Pi适配器/Codex适配器角色）。逐条判别：**双向核**（控制字符 `0x01` 夹具目录不可建盘＝Windows 文件系统真值；读取器名判据先于盘面、直调名覆盖保留）、**① 三触发**（通知点名＝平台原生分隔符真值——桌面窗口属主自有测试已用 `path.join` 冻结同口径且 Windows CI 通过）、**H2**（自扫描面 `path.relative` 反斜杠未归一——**非第四处直读**）、**G1a/G1d/J3**（Windows 对自定义环境块强制补齐的十键 OS/libuv 真值——同一 CI 三处互异 spawn 实现实得相同十键集；SIGTERM＝TerminateProcess 无信号面）。**产品修复需求零**；平台分支只替换平台真值值面、断言本体零放宽。改动 4 文件：`test/测试/g4-skill-verify/b-render-double-check.test.ts`、`test/测试/g4-skill-verify/f-fingerprint.test.ts`、`test/测试/g4v2-mcp-verify/j-pi.test.ts`、`test/测试/g5-reasoning-verify/h-scope-audit.test.ts`（另 `g-claude-launcher.test.ts` 由 Claude适配器角色并发修复，已复核）。复跑：`test/测试/**` **502/502**、全量 **2110/2109/0红/1skip**、typecheck 0；win32 分支经进程内仿真（b-render 7/7）与 `path.win32` 变换证明。详见[修复记录](docs/fix/2026-10-16_fix_windows-ci-platform-branches.md)。未 commit/push。

## 2026-10-16 — G-5（推理与推理强度）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：契约与归一（五值冻结/三态归一/三 env 键/非法⇒按未设＋诊断不毁会话）、事实通道与投影单点（脱敏/16384 B 预算/omitted 恒空/durationMs 防伪/summary 定格/幂等/坏件诊断/emit 与历史兩路同单点）、Claude 接线（映射未设零参数·off disabled·四档直通·max 不收编/捕获不预脱敏/降级 4xx＋词元恰一次同输入重推）、Codex 接线（五值校验装配前抛/单条 `-c`/off 如实文案/reasoning 事件双信号时长/降级闸恰一次＋负例四格）、Pi 接线（off 前置修复假关闭消除/未设零调用/R1 自证网关三窗修复/捕获/降级终态前消费不二次/429 排除/中断守卫）、设置链（三字段 choices 单源/保存值域拒 trim 规范形空串清除批量原子/pi-config 漂移对齐＋旧路径如实现状）、桌面渲染（四态文案真实执行/select 控件/默认折叠 esc 纯文本/回放载体真驱动）、范围审计（探针纯本地/键读取面单点/零网络面）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/g5-reasoning-verify/`（8 测试文件＋helpers 夹具）**65 例全绿**（真 Service 装配捕获工厂＋自建假 Claude SDK/假 Codex 引擎/loopback 假网关驱动真 Pi SDK＋真 tool-rows.js 执行＋真 getSessionHistory 回放驱动）。全量 **2112/2111/0红/1skip**（＝基线 2047/2046/0/1＋65；1 skip＝既有 Windows-only）、typecheck 0；G-5 改动面冻结 **33 条目**开工/收工逐字节一致（两次复算）。备注 6 条（零引用钉交互〔H1 按 g4v2 K3 先例动态枚举改写〕、R1 第三窗无需修复、429 SDK 层重试观测、Codex 增量帧计作已产出、summary 定格仅 kind=message、Claude 判据词元集）与未验边界（真网关/Electron e2e/真 CLI wire/aborted 竞态窗/细窗口/Windows）见报告。详见[报告](docs/change/2026-10-16_change_g5-reasoning-independent-verification.md)与[证据](docs/change/2026-10-16-g5-verification-evidence/)。未 commit/push。

## 2026-10-16 — G-5（推理与推理强度）落树后：Pi 面板键 4→5 同步＋推理键往返/choices/值域单源新钉；g3 审计④核对

**来源**：G-5 全链落树（契约层/三适配器接线与降级/设置保存/档位控件/推理折叠行/回放载体；批准件＝PM 记录 §G-5 与各属主回交）。本角色名下唯一红＝`test/测试/t29-pi-config-roundtrip.test.ts` 面板键 deepEqual（实际 5 键 vs 旧钉 4 键）；全量扫描 G-5 旧钉后共两处翻新＋两例新钉。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

1. `t29-pi-config-roundtrip.test.ts` :88-91 — `PI_PANEL_KEYS` deepEqual 4 键 → **5 键**（增 `ANS_PI_REASONING_EFFORT`；注释「3 必填 + 1 可选」→「3 必填 + 2 可选」）。依据：桌面窗口 G-5「纳入」处理——`app/desktop/pi-config.ts:60-66` 实况；与注册表 `RUNTIME_SETTINGS.pi` 逐键对齐（`app/desktop/pi-config.ts:43` 注）。
2. 同文件**新增**「T29 G-5：ANS_PI_REASONING_EFFORT 往返＋漂移守卫」——①面板键集 ≡ `RUNTIME_SETTINGS.pi` 字段键集（钉对齐）；②save→同 env 重载→另开 env 重载→`getPiConfig` 视图（非机密、值可见、isSet）全链往返。
3. 同文件**新增**「T29 G-5：choices 透传＋值域单源」——①`getRuntimeConfig("pi")` 视图 `choices` 逐字＝["off","low","medium","high","xhigh"]、required:false（元数据透传）；②注册表保存链拒非法值（ok:false、错误列出值域、不回显提交值、零落盘）；③合法值 trim 规范形写盘；④**旧面板路径不做值域校验**（`savePiConfig` 越值直写、原样落盘——单一来源纪律如实钉，防复制第二份判定）。
4. `ui-reacceptance-renderer-regression.mjs` :51 — `pi-config:get` 桩的旧 4 键快照 → 加 `ANS_PI_REASONING_EFFORT`（桩与现行面板键集同形；无断言依赖该计数）。

### 扫描范围与遗漏排查

- 全量扫 `test/测试/**`（`推理|reasoning|思考|档位|effort|EFFORT|ANS_*_REASONING|RUNTIME_SETTINGS|已思考|xhigh`）：G-5 旧钉仅命中上述两文件（已翻新）；其余 `.mjs` 桩为动态取 `RUNTIME_SETTINGS`（无旧快照）、空 `fields: []` 桩或无键面（核对未改）。
- `g3-search-verify/scope-audit-and-fold.test.ts` 审计④（Pi 属主已适配）单独复跑 13 例全绿——核对即可，未改。
- 残留扫描 0 意外命中（仅负向/变异用旧串与既有无关 length 计数）；`t29-write-discipline.test.ts` 与新键不冲突（`ANS_PI_PROVIDER` 反向守卫仍真），未改。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **437 pass / 0 fail / 0 skip**（改前 435 中 434/1，唯一红按预期消解；新增 2 例）。
- `node --test "test/**/*.test.ts"`（全量）→ **2047 tests：2046 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only；单独复跑 21 pass/1 skip 确认）。
- `npm run typecheck` → **0 错**。

## 2026-10-16 — G-4 V2（su 安装外来 MCP 全链）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：契约与读取器（`InstalledMcpServerV1`＋`mcp-declarations.ts`）、Service 接线（`providerFor` 按角色注入）、工具面（`install_mcp`/`uninstall_mcp`）、编排（第四棵树 `docs/mcp`＋能力位透传仅 su）、门禁卡文本（MCP 安装纪律段＋J-1 守卫全检）、桌面 handler（`applyMcpChange` 护栏/三态/系统行/诊断）、Claude P1（hook 五条件＋env 收窄启动器）、Codex P2（单条 root map＋三处名字集恰等＋`mcpToolCall` 映射）、Pi P3（前缀判据×2 同源＋tools-only＋自持 transport＋dispose 收口）、桌面UI 复用、范围审计（stdio 限定/名拒/零二次卡/诚实面/探针纯本地）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/g4v2-mcp-verify/`（11 测试文件＋3 夹具）**64 例全绿**（真实临时项目盘＋可控 SessionManager 假件＋自建假 Claude SDK/假 Codex 引擎/自建 Pi stdio 夹具 server＋真实 launcher 子进程＋真实 Pi SDK faux 模型＋自写 mini TOML 解析器做转义往返）。复跑证据：实施方 V2 六文件 72/72；翻转钉子 13 文件 223/223；V1 范围⑥钉 7/7；真 CLI 复跑两枚（Claude installed-loopback exit 0、Codex native-probe exit 0）——均零真实网关请求。全量 **1998/1997/0红/1skip**（基线 1934/1933/0/1＋64）、typecheck 0；V2 面冻结 **82 条目**开工/收工逐字节一致（两次复算）。备注 6 条（并发非 V2 面、`CAN_USE_TOOL_SHADOWED` 提示、schema 占位符互核、系统子类符号更名、Codex 碰撞判据大小写敏感、空 name 文案小瑕）与未验边界见报告。详见[报告](docs/change/2026-10-16_change_g4v2-mcp-install-independent-verification.md)与[证据](docs/change/2026-10-16-g4v2-verification-evidence/)。未 commit/push。

## 2026-10-16 — G-4 V2（MCP 安装）落树后：名下钉子翻新（三→四棵机械同步＋预授权/零实施两处行为翻转）

**来源**：G-4 V2（MCP 安装）全链实施已落树（合同/读取器/Service/工具/桌面 handler/三适配器 P1-P3/卡文本四棵；批准件＝PM 记录 V2 裁定「按推荐批准，开始实施」与各属主回交）。V2 落树使本角色名下 8 条旧钉转红（371 tests 中 363 pass/8 fail），本轮逐字对表新事实翻新：机械项强度不改（deepEqual/正则/变异锚点等值），行为项按批准事实翻转（非放宽）。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

**A. 机械 三→四棵**（依据：V2 第四棵，`run-role.ts:984` 实况 `SU_PREAUTHORIZED_WRITE_DIRS = [… "docs/mcp"]`）
1. `g1-copy-and-nails.test.ts` :26/:31 — deepEqual `["docs/su","docs/contracts","docs/skills"]` → 追加 `"docs/mcp"`（用例名「恰为三棵」→「恰为四棵」）。
2. 同文件 :49 — 非空洞变异锚点 `「不在预置三目录内」`→`「不在预置四目录内」`（防漂移与三变体逐一捕获未动）。
3. 同文件 :103 — 正向短语清单同串替换；:139 口径注释「恰三棵」→「恰四棵」。
4. 同文件 :111 与 `d-card-guard.test.ts` :66 — **新增**「旧计数防回退负向」：`写入这两棵/三棵目录树`、`预置的两棵/三棵目录树除外`、`不在预置两/三目录内` 六串逐字不得复现。
5. `d-card-guard.test.ts` — 用例名「三棵树话术」→「四棵树话术」；:55 核查四棵均点名（加 `docs/mcp/**`）；:56 `写入这四棵目录树**无需逐次确认**`；:58 `预置的四棵目录树除外`；:87 变异锚点四棵；:91 变异锚点四目录（含变异目标串）。依据＝V2 卡文本（`boundary-core.ts:160/161/167/174`）。

**B. 行为翻转**（依据：PM 记录 V2 裁定＋门禁引擎/运行时核心/桌面属主回交的落树实况）
6. `c-preauth.test.ts` — 「docs/mcp 未预授权」翻转为**预授权直写**：①直写矩阵加 mcp 相对/嵌套/绝对三路径（零确认）；④ `docs/mcp/any.md` allowed false→true（免确认）＋前缀负例 `docs/mcp2/any.md`⇒false（段比较）＋零新增确认（asked 仍恰 1）；⑥ 重建后 mcp 仍生效；⑤ 非 su 角色 `docs/mcp/t9.md`⇒false（预授权四棵均不扩散）。
7. `h-scope-audit.test.ts` 范围① — 「字面量恰为三棵（docs/mcp 未入）」→「恰为四棵（＋docs/mcp）」deepEqual 四元素。
8. 同文件 范围② — 「MCP V2 零产品实施」（全仓零命中/schema 拒绝/仅注释提及）**翻转为 V2 已实施**四事实：`install_mcp`/`uninstall_mcp` 工具名常量＋maker 在位且 schema 可描述（原 `assert.throws` 翻转）；`docs/mcp` 并入预授权且被声明读取器消费（`mcp-declarations.ts` `MCP_REL = "docs/mcp"`）；三适配器装配 `installedMcpServers`（claude/codex/pi-real-adapter）＋服务层 `listInstalledMcpServers` 注入；能力位仅 su（编排 `suppressHandback` 判据＋桌面 `role.builtIn === true` 两注入判据）。

### 扫描范围与遗漏排查

- 全量扫 `test/测试/**`（`两棵|两目录|三棵|三目录|零实施|零命中|未预授权|V2 另议|install_mcp|uninstall_mcp|docs/mcp`）：V2 旧钉仅命中上述两文件（已全翻新）；`g2/g3-verify/scope-audit` 的「零实施」属看护/G3 域（非 MCP），核对后未改；残留扫描 0 意外命中（仅新增的防回退负向清单两处）。
- 探针（`.probe.ts`）未碰——范围⑥ 既有零引用审计继续全绿。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **371 pass / 0 fail / 0 skip**（改前 363/8；8 红如上述清单逐条归因、全部本轮回绿，无他域新红）。
- `node --test "test/**/*.test.ts"`（全量）→ **1934 tests：1933 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only；单独复跑该文件 21 pass/1 skip 确认非本轮引入）。
- `npm run typecheck` → **0 错**（tsc --noEmit）。

## 2026-10-16 — G-4 V1（su 技能安装全链）＋ cleanPatterns 轻修：独立验证**整体通过**（0 不通过、5 备注）

**来源**：PM 派发「独立验证轮」（V1 全链＋cleanPatterns 轻修＋范围审计＋冻结绑定）。本角色**独立构造**自建用例套件 `test/测试/g4-skill-verify/`（9 测试文件＋2 夹具，**51 例全绿**；对抗性构造、不复用实施方断言）；报告 [2026-10-16_change_g4-skill-install-and-cleanpatterns-independent-verification.md](docs/change/2026-10-16_change_g4-skill-install-and-cleanpatterns-independent-verification.md)，证据 `docs/change/2026-10-16-g4-verification-evidence/`。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针脚本；未 git 提交；零真实网关请求。

- **逐域通过**：A 工具面（注入才注册矩阵/回执冻形/契约外 fail-closed/schema 冻结句逐字/零写盘切片＋盘快照）｜B 渲染单一来源（双向核/原始字节 digest/坏件防御/穿越大防御/∅）｜C 预授权（真装配 gate：树内免确认、树外仍逐条、前缀负例、docs/mcp 未预授、非 su 不变、重建仍有效）｜D 卡文本四要点＋J-1 全文小句级零违规｜E handler（护栏六格矩阵：无轮次/回交/系统/派发[私有面直注]拒、直聊/排队客户消息放行；拒绝全分支 reason 映射＋零副作用；三态如实；`[系统·安装]` 真投递且 withdraw 拒；诊断落盘）｜F 裁定⑤指纹（三触发/零技能负例/坏登记不误重建/缺件收敛/隔离）｜G 拼接 ×3＋假适配器（恰一段差分、独立重打节文本、坏件不拒会）｜H 范围审计（MCP V2 零实施、零二次卡、无删除原语、能力位仅 su、探针纯本地）｜I cleanPatterns（复现转正/零泄漏 battery/ASCII `;` 不回归/flags 不变/Codex redact 同口径）。
- **冻结绑定**：26 条目 sha256 开工/收工/终次三份**逐字节一致**（清单写入报告 §四）。
- **全量**：`node --test "test/**/*.test.ts"` → **1880 计/1879 过/0 红/1 skip**（＝基线 1829＋本批 51；skip＝既有「仅 Windows」）；`npm run typecheck` 0 错。翻转钉子（loopback L255）与 g1 三棵同步复跑 **12/12** 绿。
- **备注（非不通过）**：① rebuilt 支复用 rebuildSession 既有事件文案含「客户确认的恢复动作」——安装场景措辞不精确（单一来源复用，非本批改动面）；② Codex redact hash 口径原样保留（只紧不松，如实登记）；③「无分隔符紧贴 CJK」残余按裁定保留；④登记由好转坏触发一次重建后收敛（语义细节）；⑤派发轮护栏分支以私有面直注检验（真实装配下 su 不为派发目标）。
- **未验边界**：Electron 真机 E2E；Claude/Codex/Pi 的 SDK 级会话注入（实施方测试覆盖、本角色复跑绿）；卸载×在跑组合（同 code path）；`app/desktop/interface.ts` 真渲染链路；探针脚本行为（按约束不执行，仅静态审计）。

## 2026-10-16 — G-4 四项已批准变更落盘后：名下钉子逐字对表新事实同步（三棵 / 新卡文本 / cleanPatterns 翻转）

**来源**：四项已批准变更落盘（裁定①预授权三棵树＋编排 I5、门禁引擎 I6 卡文本增「安装纪律」段＋三棵话术、运行时核心 A-base cleanPatterns 收窄）。本角色名下 3 条 g1 钉子与 1 条 pi-loopback 钉子钉的是旧事实，本轮**逐字对表新事实同步**（不是放宽断言：等值/在场性/非空洞强度一字不降，旧值→新值）。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件、未碰他角色在飞（三适配器/桌面 UI）；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

1. `test/测试/g1-verify/g1-copy-and-nails.test.ts`「su 预授权写目录」钉子（:26/:31）：
   - 用例名：`恰为两棵（docs/su + docs/contracts）` → `恰为三棵（docs/su + docs/contracts + docs/skills）`；
   - `assert.deepEqual(dirs, ["docs/su","docs/contracts"])` → `assert.deepEqual(dirs, ["docs/su","docs/contracts","docs/skills"])`（deepEqual 全等强度不变；`some(workflow)` 反向断言不动）。
   - **依据**：裁定①预授权三棵树＋编排 I5——`src/pipeline/orchestration/run-role.ts:916` 实况 `SU_PREAUTHORIZED_WRITE_DIRS = ["docs/su","docs/contracts","docs/skills"]`。
2. 同文件「卡文本独立反向断言」非空洞变异锚点（:49）：`T.replace("`docs/workflow.md` 不在预置两目录内", v)` → `…不在预置三目录内…`。防漂移断言（`mutated !== T`）与三个违规变体的逐一捕获断言均未动；锚点是对新卡文本的实际子串。
   - **依据**：门禁引擎 I6——`boundary-core.ts:162` 新句「`docs/workflow.md` 不在预置三目录内」。
3. 同文件「正向在场性短语清单」（:103）：`"不在预置两目录内"` → `"不在预置三目录内"`（逐字在场性强度不变）。
   - **依据**：同上 I6。
4. 同文件 ④ 段口径注释「恰两棵预授权目录」→「恰三棵预授权目录」（注释同步，断言零变化）。
5. `test/测试/g3-search-verify/pi-loopback-verify.test.ts`「开启成功往返」第 2 条标题断言**翻转**（:255）：
   - 旧：`assert.equal(resultText.includes(TITLE_B), false, "（备注）第 2 条标题被既有 URL 贪吃口径吞掉——如实登记")`；
   - 新：`assert.equal(resultText.includes(TITLE_B), true, "第 2 条标题不再被 URL 口径吞并——完整可见（A-base 收窄后）")`（布尔等值强度不变；注释改为记录翻转来源与依据）。
   - **依据**：运行时核心 A-base——`src/common/runtime-core/tool-display.ts:43` URL 匹配排除集追加 CJK 标点块 `　-〿` 与全角形式块 `＀-￯`；组内「；」连接下归一替换止于标点，第 2 条起标题完整可见。

### 扫描范围与遗漏排查（先全量再改）

- 全量扫 `test/测试/**`（`两棵|两目录|预置两|恰为两|确认制要点|写盘许可已预置`）：旧值仅命中本文件 4 处，已全部同步；g2-verify/scope-audit.test.ts 两条引用卡文本的断言（工具名在场、看护职责段位置/关键词）与新文本不冲突，未改。
- 他角色已含新钉（不重复）：`test/门禁引擎/su-doc-surface-convention.test.ts:378`「预授权扩列（G-4）两棵→三棵」、`test/runtime-core/tools.test.ts:47` 旧计数防复现——均为其属主文件，本角色未碰。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **320 pass / 0 fail / 0 skip**（改前 316/4，4 红＝本轮 3 条同步＋1 条翻转，全部按预期消解）。
- `node --test "test/**/*.test.ts"`（全量）→ **1814 tests：1813 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only，非本轮引入）。
- `npm run typecheck` → **0 错**（tsc --noEmit）。

## 2026-10-14 — 补建角色功能导航 feature-map.md（修复 role-card 死链；客户要求）

**来源**：客户普查发现含本角色在内 5 个角色缺 `feature-map.md`，role-card 中「当前导航见[测试功能导航](feature-map.md)」为死链；客户要求统一补建。边界：只写本角色边界 Section 1 内文件（本页 + changelog/memo，Section 1 已列）。

- **内容**：按「名称 / 一句话用途 / 当前状态 / 文档」列本角色九类交付物（跨角色联调 CLI 真入口与治理链、完整流程 su 建角色→写落盘→pin/shell 闸、Pi 配置往返与写入纪律、桌面交互独立回归 R1–R5、回放解析与展示映射、虚拟行锚点交付回归、最小复现与诊断探针、回归证据存档、其余稳定性小件），状态均按实际现状标注（2026-10-12 / 2026-10-14 各轮记录）；受测入口**链接受测角色功能文档、不复制其流程图**（role-card 口径）；未新建 `docs/feature/`（本角色无用户可操作业务功能）。
- **链接自检**：34 条相对链接逐一解析存在，**0 死链**（含 4 个证据目录、`test/测试/` 下 18 个脚本与桌面会话功能文档；桌面角色拆分重组中按现路径引用并标注）。
- 依据材料：role-card.md、boundary.yaml、memo.md、changelog.md、docs/ 与 test/测试/ 实际目录。**未 commit。**

## 2026-10-14 — 「按设计对齐」候选独立回归：主套件 119 条与回放 11 项通过；发现并上报虚拟行锚点漂移真实回归；抽屉关闭动画竞态为测试侧观测订正

**来源**：PM 冻结新候选（桌面「按 UI/UX v2 设计对齐」，纯视觉/骨架；实施记录见桌面属主 `docs/fix/2026-10-13_fix_uiux-design-alignment.md`，该角色重组中按现路径引用）。依赖变化使本角色上轮证据（旧指纹 fc148d35/f9c4e41f）失效，按 Governing Invariant 重跑受影响项并按新指纹重绑。边界：只写 `test/测试/**` 与 `角色卡/测试/**`；**未改产品代码、未碰他角色文件、未 commit/push**。

### 1) 测试侧订正（断言零变化）

- 首跑 102 条止于 'R5 choice title preview options and all actions exposed 960 card'。诊断（`drawer-close-race-diagnose.json`）：**既有**的 120ms 抽屉关闭动画（`#right-drawer` clip-path/可见性过渡——本候选仅改其底色/边色，动画为未变上下文）在激活后 ~80ms 时刻仍有可见残条（clip≈85–94%）；设计把未决卡从 `min(680px,92%)` 改**通栏**（V13）后卡右缘采样点（x≈908@960）落入残条区间。卡片本体可命中，只是**观测时刻未到**：400ms 后复测整卡全过，只加观测与等待（断言零变化）的诊断副本满跑 119 条通过。
- 订正 `ui-reacceptance-renderer-regression.mjs`：新增 `drawerSettled()`——两处「定位后整卡曝光」断言前等待抽屉 `visibility:hidden`（超时照原断言按真实状态判定，fail-closed）；两条曝光断言观测补记 `inert/rightTab/drawerVisibility`。**断言本体与其余断言一字未改**（脚本 4071945e→124d05f4）。等待证据：choice 两档 waits=3（约 60ms 残量）、confirm 两档 waits=0。

### 2) 真实回归（已上报，待属主修复后复测）

- 长会话（218 行、虚拟化）收起/展开执行记录组（46 条活动）：**旧候选**（`git show HEAD:` 原样取出 /private/tmp 运行，A/B 同夹具同脚本）收起 **−0.65625px**、展开 **0（完全复位）**、4 轮无累积；**新候选** **+1.0625px / +0.9375px**、逐轮净 **+2px** 累积、第 3 轮收起后锚点跳位 **68.125px**（offset +15.25→−52.875）后停在新位置；阅读文本身份两臂均保持。
- 交付锚点套件 13 条断言 **12 过 1 红**（'expand preserves preceding visible paragraph offset'：Δ=2.0px ≮ 2px；fail-fast 其余 8 条未跑；诊断副本证其余 11 条全过）。**未动断言、未放宽容差**。归因初判（供属主）：本候选 renderer.js 仅改呈现（记录行补时间列等），锚点机制代码未动；布局行高/组高为小数（段落 53.1875、组 2487.3125）而虚拟窗口记账用 `offsetHeight` 取整（53/2487），开合链 `refreshActivityHeight→updateVirtualWindow→restoreChatReading` 中整数/小数偏差从「互相抵消」变为「每轮 +2px 系统性漂移」，越界后换锚一档。
- 最小复现 `test/测试/uiux-anchor-drift-probe.mjs`（含旧候选 A/B 运行方法注释）；诊断副本 `test/测试/uiux-anchor-probe.mjs`（APP 可指向旧候选；仅把两处开合断言改为记录，其余全强度）。

### 3) 结果与重基线判定

- `node --test test/测试/uiux-v2-replay-regression.test.ts` → **11/11，0 skip，exit 0**（重绑重跑）。
- `node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs`（hidden、隔离 userData、受控内存 IPC）→ **119 条**（99 断言＋12 实际 Tab 行＋8 抽屉等待行）**通过，exit 0**，consoleErrors 空，run 起止指纹一致；两次满跑一致。
- `node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` → **exit 1**（上述真实回归）。
- **零处重基线**：逐条核对三套脚本，**无断言编码设计值**（聊天头 66/composer 100/胶囊 52/760 居中/字号行高颜色/记录行时间列均不在断言内）；几何断言=设计无关不变量（相对 |Δ|<2px、无横向溢出、左缘对齐）＋R2 自身口径（动作 ≥28px，V31 已保留）；设计值只出现在观测字段，如 960 档会话列实测 630px（卡盒 296→926）与属主记录「960 档铺满 630」及原型 `.conversation` 一致。
- R1–R5 行为零改动核验：单份说明、全文/位次/点击区、默认异常目标/原因/exit、撤回就地回执、未决优先/定位/作答、IME、回交单一展示、停止保队列、图片/草稿——**全过**；唯一不符「语义零变化」即上述锚点漂移。
- 环境：Electron 44.7.0/内置 Node 24.21.0、终端 Node v24.14.0、macOS 26.6.2/arm64；HEAD 7457da4。**未跑**：全量/他角色套件、真实模型/网络/业务、GUI 截图；锚点套件 fail-fast 后 8 条仅诊断副本覆盖（不冒充通过）。
- 证据：`docs/change/2026-10-14_change_uiux-design-alignment-regression.md`（status blocked → 见下节复测后更新为 verified）＋ `docs/change/2026-10-14-uiux-design-alignment-evidence/`（renderer-report.json、renderer-presettle-race-fail.json、drawer-close-race-diagnose.json、anchors-report.json、anchor-drift-probe-new/old.json、anchor-coverage-new/old.json、replay-output.txt、candidate-hashes.txt）。

### 4) 修复候选复测（当日追加，结论改判：全部转绿）

修复候选 `renderer.js 402e49a7…`（styles/index/tool-rows/ui-labels/preload/session-history 与上轮冻结一致）独立复测：**主套件 119 条满跑通过（exit 0，报告内 startHashes==endHashes）**；**回放 11/11**；**锚点 14 条全跑全过（exit 0）**——上轮红项 'expand preserves preceding visible paragraph offset' **转绿**（收起/展开 before=after=11.1875、零漂移），fail-fast 之后的 8 条（单组折叠/追加/换身份/前插/已决卡双锚/跨角色未决/三条失败摘要）**实际跑到且逐项通过**。漂移探针升级 v2（**固定元素读数**，桌面UI建议；两读数并列）：修复候选 4 轮开合恒定 11.1875、scrollTop 恒定 12382；旧 HEAD 臂 −0.65625/0 与上轮一致。**「68.125px 跳位」订正（本角色实测，非仅算术推断）**：旧探针「首个可见行」读数在累计漂移约一格后**切换目标行**所致的观测伪影——保留修前行为的中间副本（`renderer.js fba0f1de…`，**非冻结指纹**、仅机制核对；本场景读数与冻结修前候选逐位一致）双读数实测：**固定元素**读数平滑 ~+1px/轮（11.25→16.3125，无跳变），**首可见行**第 5 次开合起读作 −52.875，恰为 16.3125 − 69.1875（69.1875 ＝ 行高 53.1875 ＋ pane 16px 行距，均实测）；真实症状 = ~1px/轮缓移、约 5 次开合后顶部多露一行。探针已改用固定元素读数（升级为交付断言时的口径）。本日 change 记录 status **blocked → verified**；证据 `docs/change/2026-10-14-driftfix-recheck-evidence/`（renderer-report.json、anchors-report.json、replay-output.txt、drift-probe-fix.json、drift-probe-oldhead.json、drift-probe-intermediate-mechanism.json、candidate-hashes.txt——运行结束后复核指纹与运行前一致）。**未改产品代码、未 commit。**

### 5) 第二版候选复测（行距缓存修复，当日再追加，全绿）

候选 `renderer.js 47703d0b…`（styles/index/tool-rows/ui-labels/preload/session-history 与上轮冻结一致）。属主摘要：U1 定性排查发现**行距缓存缺陷**——脱离文档的 pane 首次读行距得到空串被当 0 缓存，后台早到事件/恢复路径（行表在挂载前建成）会让该 pane 退回「不含行距」旧错口径；修法＝**仅挂载时读、命中才缓存**；`rowModelDebug` 只增收 `rowGap`。本角色独立复测：主套件 **119 条满跑（exit 0，报告内 startHashes==endHashes）**、回放 **11/11**、锚点 **14/14（全跑全过，收起/展开 before=after=11.1875）**、漂移探针双读数 **4 轮恒定 11.1875、scrollTop 恒定 12382**。**新增独立覆盖** `test/测试/uiux-rowgap-detached-probe.mjs`（本角色新写，r1–r3 三轮）：①B 角色**未挂载期**建行表 181 行（虚拟化）且 `rowGap:null`（未读**不落值**）；②树点点选挂载后 `rowGap===16` 且**等于挂载 pane `getComputedStyle` 实读值**、>0（独立真值源）；③挂载后 4 轮开合**零漂移**——组确在真切换（`open` 翻转、组高 2487↔36、docH 18625↔16126）；④**U1 抽跑**：两角色深内容、无未决，交替点角色树 20 次/轮 × 3 轮 = **60 次全部到底（0 miss）**，未出现属主所述既有偶发。排障备注（防误读）：新探针首两轮曾报 +428px 跳变，经查为**本角色夹具缺陷**（50 条后续正文误用消息对象未过 `parse` 成 ReplayRow → 组后为空 → 触发上轮已记录的「收起末尾大组 scroll 夹紧」既有口径），与产品无关；修正后三轮确定性通过。对照限制：本机无 402e49a7 副本可 A/B，独立判据＝「修复后行为正确 ＋ 缓存若为 0 时探针即红（rowGap≠paneGap）」。证据 `docs/change/2026-10-14-recheck2-evidence/`（renderer-report.json、anchors-report.json、replay-output.txt、drift-probe-final2.json、rowgap-detached-probe-r1/r2/r3.json、candidate-hashes.txt——运行结束后复核指纹与运行前一致）。**未改产品代码、未 commit。**

## 2026-10-12 — 按新语义更新 shell 闸 (b) 不可解析断言：不升 (a)，直接拒绝（b-unparseable-deny）

**来源**：客户裁定（M-2）——(b) 审读输出**不可解析 ⇒ 直接拒绝**（fail-closed），**不升 (a)、不重试、不打扰客户**；编排已落地（`src/common/编排/shell-gate.ts`：删 `BRANCH_B_BADJSON`，新增归因码 `BRANCH_B_UNPARSEABLE="b-unparseable-deny"` + 固定短句 `REASON_B_UNPARSEABLE`；其余分支不变）。边界：只写 `test/测试/**` 与 `角色卡/测试/**`。

### 1) 失效断言（改前）

`t9-block3-pin-shell.test.ts`（原 `:376-381`）：`pmAsk → "这不是 JSON"` + (a) 桩 `unavailable` → 断 `b-badjson→a-unavailable`（旧「升 (a)」语义）。

### 2) 改后断言（未放宽，反而加严）

(a) 桩改为**本会放行**（反向钉住「根本不该惊动客户」）：断言 `allow===false`、audit `conclusion==="deny"`、`branch===BRANCH_B_UNPARSEABLE`、**`calls.a===0`**、`reason===REASON_B_UNPARSEABLE`（固定短句，单一来源，绝不说成放行）。用例名同步改为「…；JSON 非法（不可解析）→ **直接拒绝、不升 (a)**」。**顺带核对**：同文件其余 shell 链断言（(c) 白名单/硬拒含反向守卫、risky 五条含最要害 `b-allow→a-deny`、b-unsure/无会话/超时仍升 (a)、(a) 超时/不可用/未接通道拒绝、规则集加载失败）与现实现逐条相符，**未动**。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**（改前 109/110）。
- `node --test "test/**/*.test.ts"`（引号带）→ **836 计 / 833 过 / 2 红 / 1 跳，exit 1**；两红＝既有环境红（桌面 `pi-config.test.ts:60` 目录名、pm `path-primitives.test.ts:254` macOS `/var`）。
- `npm run typecheck` → **0 错（exit 0）**。
- 环境：Node **v24.14.0**、macOS 26.6.2、HEAD **d933537**（改动均未提交）。

## 2026-10-12 — 按客户确认制新语义（A 组）改写本目录 4 条用例：finalize/operatorChannel/settled 旧面已删 → request_confirmation + F4 发行 + 自动收尾

**来源**：客户 2026-10-12 批准设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` A 组（删「收口」、客户确认制、客户同意后自动收尾）；编排/Pi适配器/桌面实施后，本目录 4 条按旧面断言的用例转红。边界：只写 `test/测试/**` 与 `角色卡/测试/**`；未碰他角色文件。

### 1) 失效断言（改前）

- `t9-block1-bootstrap.test.ts` 3 条（第 6/7 节）：用**已删**的句柄 `settled`/`finalize()` 与 `operatorChannel` 注入（finalize 提议-确认整面已删）。
- `cli-genesis-boundary.test.ts` 1 条（链路面）：用**已删** `operatorChannel`；且其「不确认直接写」脚本在新语义下被 F4 拒（**红即正确**）。
- 扫全目录「已删 API」：仅上述 4 条；`t9-block3-pin-shell.test.ts` 的 `operatorChannel` 是 **shell 闸 (a)** 的通道（仍在，非已删面），未动。

### 2) 改后断言（新语义；**逐条保留或等价替代，未放宽**）

- t9-block1 ①（未获同意）：客户**拒绝** / 通道**不可用** 两场景——su 应**恰好发起一次** `request_confirmation`；事件断言「未获客户同意」如实回报 + 后续写入被 **F4** 拒（未确认路径不发行）；角色三件套、`.ans`、治理边界文档、manifest **全零副作用**（较旧版**新增**「角色文件也不得出现」断言）。
- t9-block1 ②（确认通过）：确认桩恰 1 次、预览列出三条将写路径；写入**真落盘**（字节相等）；**自动收尾**写出治理边界文档（内容 = `renderGovernanceBoundaryDoc()`）+ `.ans` + manifest；`acceptance.source` **逐字等于创世来源**——旧断言「含 `operator:test-客户`」随 A-4 证据模型（确认在写入前逐笔进行、operatorId 在工具事件不在 `.ans`）被**替代**为更严的等于断言（注释已注明）；pin 独立重算一致、载入器验 pin-backed accepted、`resolveRole` 无 parseError——**全部保留**。
- t9-block1 ③（拿掉授权）：边界未接受 → su 写入被 **F6** 拒（事件断言）+ 角色目录不出现；直接调 `repinIfBootstrapped`（= 会话 settle 时调用的**同一函数**）→ `ok:false`、`status:"blocked"`、reason 含门禁拒绝、零副作用——保留旧 reason 断言语义。
- `cli-genesis-boundary.test.ts` 链路面：改注入 `customerInput` 确认桩（`(gate, caps) => createFakeRuntimeAdapter({…, customerInput: caps?.customerInput})` 镜像真实接线）；越界写不落盘 + 确认后角色文件落盘 + **自动收尾三件落盘** + `exit 0` + 确认恰一次。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**。
- `node --test "test/**/*.test.ts"`（引号带）→ **715 计 / 697 过 / 17 红 / 1 跳，exit 1**——**0 红在本目录**；17 红归属：13 `test/桌面应用/finalize-wiring.test.ts` + 1 `interface.test.ts` + 1 `renderer.test.ts`（桌面角色在途迁移，未修）、1 `pi-config.test.ts` 与 1 `test/项目管理/shared/path-primitives.test.ts`（既有环境红）。
- `npm run typecheck` → **28 错全在他角色在途文件**（`app/desktop/customer-input.ts` 2、`test/桌面应用/finalize-wiring.test.ts` 22、`test/桌面应用/interface.test.ts` 4）；**本目录 0 错**。
- 环境：Node **v24.14.0**、macOS 26.6.2、HEAD **d933537**（工作区改动均未提交）。
- **未验**：真实模型端到端（su 真经确认建角色）——属「客户跑」。

## 2026-10-12 — runCli 默认擦洗凭据/ANS_RUNTIME + 补 CLI `ans govern <目录>` 入口与创世用例（客户批准 M1+M2+M3+O1）

**来源**：本角色第三轮独立复核发现（提案与证据 `docs/fix/2026-10-12_fix_runcli-credential-leak-and-govern-cli-cases.md`）。客户 2026-10-12 批准 **M1+M2+M3+O1**、**未采纳 O2**（无消费者，将来真需要再加），并随 O1 裁定「有 `角色卡/` 无 `.ans`」判据差**维持现状**（桌面对齐另议）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/common/shared/runtime-shared.ts`、`src/index.ts`、`src/service/role/resolve-role.ts`、`src/service/gate/resolve-write.ts`、`src/interface/cli/govern.ts`、`src/provider/pi/session.ts`。

### 1) 问题（实测）

- `test/测试/helpers.ts` 的 `runCli` 调 `spawnSync` **未传 `env`** ⇒ 子进程继承跑测进程环境。机器上有 `ANS_PI_*`/凭据时：`real-entry` 的 govern 用例**真开会话、发真实模型请求**，且会话成功反使「断言非 0」转红；该会话 su 在自根（演示配置）下边界 = 门禁引擎 Section 1（17 条、accepted、scope 未收窄）——实测 `src/common/门禁引擎/evil.ts` 类写入**会被放行**（极端情况把文件写进仓库）。
- 同类第二开关：`ANS_RUNTIME=pi` 会把 role run 三条成功用例从演示切到真实适配器（无凭据全红、有凭据真发请求）。

### 2) 改后断言（`test/测试/`）

- `helpers.ts`：新增私有 `scrubbedEnv()`，`runCli` 子进程 env 默认擦洗三类键——`PI_CREDENTIAL_ENV_VARS`（单一来源 `runtime-shared.ts` **只读导入**）+ 全部 `ANS_PI_` 前缀键 + `ANS_RUNTIME`；其余环境原样。**不加** O2 开关（客户未采纳）。
- `real-entry.test.ts`：`FAIL_CASES` 加可选 `stderrMatch`，govern 条目填 `/缺少 base URL/`（**收紧**：原「非 0」保留，其余断言一字未动）；新增真入口用例「`ans govern <空目录>` → 非 0 + stderr 无「治理边界解析失败」+ 含「缺少 base URL」+ 目标目录零残留」；新增「runCli 默认擦洗」哨兵用例（**实施时增补**：注入哨兵 `ANS_RUNTIME=pi`+凭据变量后断言子进程看不到它们——否则无凭据机器上无法证明擦洗生效；哨兵 base URL 置空 ⇒ 即便擦洗失效也不外连）。
- 新增 `cli-genesis-boundary.test.ts`（跨角色联调）：① 判定面——空目录注入 su 边界**恰 3 条**（`角色卡/`、`docs/`、`.ans/`），`src/**`、词法逃逸（`角色卡/../src`）、真实路径逃逸、根外绝对路径全拒，三处治理产物放行；② 链路面——`governCommand` + 假适配器：越界写 `src/evil.ts` **不落盘**、`角色卡/X` 骨架**真落盘**、命令 exit 0；③ O1 角落——有 `角色卡/` 无 `.ans` 仍带 `genesisBootstrap`（`listProject.hasRoles=true` 呈现差异），可写面仍只落三处治理产物（客户裁定登记于用例注释与提案文档）。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**（基线 105；+5 = M2 1 + M3 2 + O1 1 + 擦洗哨兵 1）。
- `node --test "test/**/*.test.ts"`（引号带）→ **692 计 / 689 过 / 2 红 / 1 跳，exit 1**（基线 687/684/2/1）。两红为他角色**既有环境红**，未修、不计入本角色回归：`test/桌面应用/pi-config.test.ts:60`（检出目录名）、`test/项目管理/shared/path-primitives.test.ts:254`（macOS `/var`→`/private/var`）。
- `npm run typecheck` → **0 错（exit 0）**。
- **未验**：真实模型端到端（su 真建角色 → 提议 → 终端 y/n 确认）——属「客户跑」。

## 2026-10-11 — 按新语义改 Pi 面板断言：面板键 5→4（3 必填 + 1 可选）、`ANS_PI_PROVIDER` 移出面板（转反向守卫）、`ANS_PI_CONTEXT_WINDOW` 改可选

**来源**：客户就桌面 Pi 设置面板给新裁定（原话：「**这个 pi 为啥需要配置 5 个呢**」——真正必须的只有 **3 个**）。桌面应用据此改 `app/desktop/pi-config.ts`（**只读**）：面板键集合 `PI_PANEL_KEYS` 由 5 → **4**（3 必填 `ANTHROPIC_AUTH_TOKEN`/`ANS_PI_BASE_URL`/`ANS_PI_MODEL` + 1 可选 `ANS_PI_CONTEXT_WINDOW`）；`ANS_PI_PROVIDER` **移出面板**（代码里有默认值 `ans-gateway`、是内部标签，非用户该填）；`ANS_PI_CONTEXT_WINDOW` 从「必填」改「**可选 + 保守默认**」（Pi适配器 `src/common/pi-adapter/provider-config.ts` 定的默认值 `DEFAULT_PI_CONTEXT_WINDOW = 32768`；缺失**不硬失败**，只在日志/事件流提示）。桌面如实回报本角色两处按**旧语义**断言已红（**未动本角色文件**）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`app/desktop/pi-config.ts`、`src/common/pi-adapter/provider-config.ts`。

### 1) 两处失效断言（改前，已实测）

- `test/测试/t29-pi-config-roundtrip.test.ts:75`：`assert.deepEqual([...res.applied].sort(), [...PI_PANEL_KEYS].sort())`——把「**载入结果（文件里实际载入的全部键名）**」当「**面板键集合**」等起来。夹具 `.env` 含 `ANS_PI_PROVIDER`，故 `res.applied` 有 5 键、`PI_PANEL_KEYS` 只有 4 键 → 差异 `+ANS_PI_PROVIDER`。
- `test/测试/t29-write-discipline.test.ts:157`：在「特殊字符写后读回」用例里把 `["ANS_PI_PROVIDER", "  padded both ends  "]` 当作**可写的面板键**提交给 `savePiConfig`。provider 已不是面板键 → 被过滤 → 读回 `undefined`，报 `ANS_PI_PROVIDER 经 parse 读回须逐字一致` 失败。

### 2) 改法

- **roundtrip:75**：拆成三条——(a) `res.applied` 等**文件里实际载入的全部键名**（5 键，含 `ANS_PI_PROVIDER`——它仍是被读取的环境变量，只是不再占面板输入框）；(b) `PI_PANEL_KEYS` 等 **3+1 = 4** 键（以代码里的导出为准）；(c) **反向守卫** `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`。**未删行**——反向守卫比删掉更能防它长回来。
- **write-discipline:157**：把该用例的 provider 项**换成面板键**（`ANS_PI_CONTEXT_WINDOW`，仍验「首尾空白」的字节保真）；**另起一条**反向守卫用例 `ANS_PI_PROVIDER 不是面板键——提交被忽略`：结构化断言 `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")` + 行为断言（提交 `{ANS_PI_PROVIDER:"should-not-write", ANS_PI_MODEL:"ok"}` → `appliedKeys==["ANS_PI_MODEL"]`、值不落盘、**已在 `.env` 的 provider 行原样保留**）。导入 `PI_PANEL_KEYS`。
- **contextWindow 新语义**：本角色原**无**「必填」断言；**新增**一条守卫 `t29-pi-config-roundtrip.test.ts` 第 2b 节——放入**不含** `ANS_PI_CONTEXT_WINDOW` 的 `.env` → `resolvePiProviderConfig` **不抛错**、`contextWindow===DEFAULT_PI_CONTEXT_WINDOW(32768)`、`contextWindowSource==="default"`（钉死默认值，防被人悄悄改动）。
- **`test/测试/t9-block1-bootstrap.test.ts`**：同属本角色目录，两处**陈述**（非断言）按旧语义写着 `ANS_PI_CONTEXT_WINDOW（必填）` 且把 `ANS_PI_PROVIDER` 列入需配置项——按新语义订正（BASE_URL/MODEL 必填、CONTEXT_WINDOW **可选**、删 provider）。该 `CLIENT_MANUAL_STEPS` 常量未被别处引用。

### 3) 「旧断言是否揭示了新语义的问题」——**否**

两处旧断言都只是**偶然耦合**：`res.applied == PI_PANEL_KEYS` 成立，仅因旧 `.env` 夹具恰好只含面板键（现在多了 provider 行，两者才分岔）；provider 在旧面板里可写，仅因当时它算一个面板键。新语义本身**自洽且已被行为验证**：provider 移出面板后**仍**由 `resolvePiProviderConfig` 从 env 照读（`cfg.providerId==="ans-gateway"`，roundtrip 用例仍绿）、其 `.env` 行**原样保留**；contextWindow 缺失回落保守默认**不硬失败**、非法值**仍**明确失败（Pi适配器已验）。**未发现新语义的问题**。

### 4) 扫全仓：别处有无同类旧断言

扫全 `test/`（含本角色外）：`ANS_PI_PROVIDER` / `PI_PANEL_KEYS` / `PI_REQUIRED_KEYS` / `contextWindow` 命中的**桌面角色**（`test/桌面应用/pi-config.test.ts`、`renderer.test.ts`、`e2e/main.mjs`）与 **Pi适配器角色**（`test/pi-adapter/provider-config.test.ts`）**均已迁到新语义**（含反向守卫：`!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`、`PI_REQUIRED_KEYS` 不含 context window、缺失→默认 32768 不抛错）——**无遗留旧断言**。其余命中（`test/项目管理/shared/env-file.test.ts` 把 `ANS_PI_CONTEXT_WINDOW` 当**样例数据**、`test/pi-adapter/real-adapter.*` 显式传 `contextWindow: 131072`）**非**「必填/provider 面板键」断言，不受影响。**未改任何非本角色文件**。

### 5) 结果

`node --test test/测试/*.test.ts` → **105 pass / 0 fail**（原 103；+2 新增守卫）。`npm run typecheck` → **零错误**。全量 `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **677 pass / 0 fail**（基线 **673 通过 / 2 失败** = 675 总，那 2 处即本条，**已消除**；+2 新增 = 677）。**未遇**并行编排收归三类型引起的红。

## 2026-10-11 — 按新语义改 shell 闸 (c) 判定断言：rm 改判 risky（必过 (b) 且 b 放行后仍必过 (a)）；sh -c 仍硬拒

**来源**：客户就 **shell 闸 (c) 的判定**给新裁定，**部分推翻**「危险即硬拒终结」（原话：**pm 不是终审，客户才是**）。门禁引擎（T40 `src/common/门禁引擎/classify-shell.ts`）+ 编排（T41 `src/common/编排/shell-gate.ts`）已落地：`ShellClass` 四态 `"allow" | "deny" | "risky" | "review"`；`rm`/`dd`/`sed -i`/`git` 写子命令等从硬拒**改判 `risky`**；`sh -c`/`eval`/`node -e`/`awk` **仍硬拒**（命令藏在 string 里，客户看原文看不懂、兜不住，§14.4）。次序表（§14.2）：`risky`→(b)；**b 判放行仍须过 (a)**；b 判拒即终结、**不打扰 (a)**；(a) 拒绝/超时/不可用 → 拒绝；(b)/(a) 均未接 → 拒（fail-closed）。两角色如实回报**未越界改本角色文件**，点名 `test/测试/t9-block3-pin-shell.test.ts:248` 的 `rm -rf build` 硬拒断言已成为失败项（**正是 fail-closed 语义变更的预期，非 bug**）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/model/decision.ts`、`src/common/门禁引擎/classify-shell.ts`、`src/common/编排/shell-gate.ts`、`src/provider/pi/session.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block3-pin-shell.test.ts`（`test` 声明于 **248** 行）按**旧语义**断言 `rm -rf build` 硬拒：

```ts
const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
assert.equal(r.allow, false, "硬拒必须拒绝");
assert.equal(calls.b, 0, "(b) 本会放行也必须**不被调用**——硬地板绝对否决");
assert.equal(calls.a, 0, "(a) 本会放行也必须**不被调用**");
assert.match(r.allow === false ? r.reason : "", /硬拒|deny/);
assert.equal(audit.records[0].branch, BRANCH_C_DENY);
```

独立实测四态（`classifyShell`，`defaultShellRules()`）：`rm -rf build` → **`risky`**（不再 `deny`）；`sh -c …` → **`deny`**；`python x.py` → `review`；`ls -la` → `allow`。故该断言与新区次序表矛盾——`rm` 现走 `risky`，会接 (b)/(a)。**这正是 fail-closed 语义变更的预期**。

### 2) 改法

**① 保留并加固 `sh -c` 那条**（原「硬拒终结」的断言改用 `sh -c` 承载，原断言逐条保留）：
- 保留：`allow:false`、`calls.b===0`、`calls.a===0`（(b)/(a) 桩**本会放行**，证明硬地板不可翻案）、`reason` 匹配 `/硬拒|deny/`、`branch===BRANCH_C_DENY`。
- **新增反向守卫**（这处最容易被后人顺手放宽）：直接钉住 (c) 分类——`assert.equal(classifyShell(["sh","-c","rm -rf build"], rules), "deny")` + `assert.notEqual(…, "risky")` + `assert.notEqual(…, "allow")`。

**② 把 `rm` 那条改写为新次序表的四条**（覆盖任务要求的全部分支）：
- `risky + (b)/(a) 均未接入 → 拒绝`，branch `BRANCH_RISKY_NO_BA`（`risky-default-deny`）；
- **`risky + (b) 放行 + (a) 拒绝 → 拒绝`**（**最要害**：证明 pm 不是终审）——branch `b-allow→a-deny`，`calls.a===1`；
- `risky + (b) 拒绝 → 拒绝且 (a) 未被调用`——branch `BRANCH_B_DENY`，`calls.a===0`；
- `risky + (b) 放行 + (a) 放行 → 放行`——branch `b-allow→a-allow`，`calls.b===calls.a===1`（**正例**）。

### 3) 正例与替身（不只改负例）

四条 risky 用例中，`risky + (b) 放行 + (a) 放行 → 放行` 是**正例**。确认通道替身即既有 `gateWithSpies` 注入的 `pmAsk`（`PmAskFn`）与 `operatorChannel`（`OperatorChannelFn`）——**形状单一来源 `src/provider/pi/session.ts`**（与 `t9-block1-bootstrap.test.ts` finalize 正例**同一套替身**：`(prompt) => ({ outcome: "allow", operatorId: "op" })`）。spy 包装记录 (b)/(a) 调用次数，故「必过 (a)」可断言。

### 4) 扫本角色全目录：有无别处仍按旧语义断言 shell 判定

**无。** `test/测试/` 内 `classifyShell` / `ShellClass` / `risky` / `hardDeny` 命中除本文件（已改）外，仅 `t9-block3-pin-shell.test.ts:426` 的 fail-closed 用例（`classifyShell(["ls"], badRules) === "deny"`）——那是**规则集版本未知**的 fail-closed 断言（程序名单无关），**不受影响、仍绿**。其余文件（`helpers.ts`/`boundary-matrix`/`fail-closed`/`wiring`/`conditions-f5`/`real-entry`/`f7-symlink`/`t9-block2`/`t29-*`）**不含** shell 判定断言。**未改任何非本角色文件**（如实回报；本角色边界不含 `test/门禁引擎/`、`test/编排/`）。

**注**：`test/门禁引擎/classify-shell.test.ts`、`test/编排/shell-gate.test.ts`（**门禁引擎 / 编排**角色，非本角色）是否已随新语义更新**不在本角色边界**，**未核对、未改动**——如发现旧语义断言请由对应角色收口。

### 5) 验证（本角色独立执行）

- `node --test test/测试/t9-block3-pin-shell.test.ts` → **20 pass / 0 fail**（改前 16 例，本条 1 → 5，净 +4）。
- `node --test test/测试/*.test.ts` → **103 pass / 0 fail**（改前 99）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **657 pass / 0 fail**（基线 653 总 / 652 通过 / 1 失败；那 1 处即本条，已消除）。**改完全量全绿。**
- 观察（如实登记，非本改动引入）：首跑曾**偶发**一次 `test/pi-adapter/tools.test.ts:248`（`edit_file` 保留 UTF-8 BOM 用例）失败；单跑该文件 3/3 通过、其后两轮全量均 657/657 全绿 ⇒ 判为**偶发 flake**（异角色文件、异路径、与 shell 判定无关）。未改该文件。

## 2026-10-11 — 按新语义修 finalize 断言：收口需客户确认（fail-closed）

**来源**：客户裁定 **bootstrap 完成方式 =「su 主动提议 → 客户确认 → 完成」**（原话：「完成 bootstrap 应该是 su 主动觉得差不多了，来完成」+「当然需要客户确认了」）。编排（T37）据此改造 `src/common/编排/finalize.ts::finalize()`：**不再「被调用即完成」**，而是**构造提议、经客户确认通道挂起**；**通道缺省/不可用/超时/拒绝 → 不完成**（fail-closed）。确认通道**复用 shell 闸 (a) 的 `OperatorChannelFn`**（形状单一来源 `src/provider/pi/session.ts`），提议是**一种 `OperatorPrompt`**——**不造第二套确认机制**。编排未越界改本角色文件，如实把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/common/编排/finalize.ts`、`src/provider/pi/session.ts`、`src/pipeline/orchestration/govern-session.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts` 第 6 节 finalize 正例（`test` 声明于 **339** 行）按**旧语义**断言——调 `handle.finalize()` 即期望完成：

```ts
const res = await handle.finalize();
assert.equal(res.ok, true, `finalize 应成功：${res.reason ?? ""}`);
```

实测确切失败位置——
- `node --test test/测试/t9-block1-bootstrap.test.ts` → **9 pass / 1 fail**；`AssertionError [ERR_ASSERTION]: finalize 应成功：收口未获确认：未接入客户确认通道（无人值守？）——不完成（fail-closed）；su 可继续工作或稍后再提议`，`actual: false` / `expected: true`，抛在 **`t9-block1-bootstrap.test.ts:357:10`**。
- 该用例**未注入** `operatorChannel`，故新语义下 `confirm()` 判为 `unavailable` → `mkResult("unavailable", …)` → **不完成**——**正是 fail-closed 的预期**，非 bug。

### 2) 改法（按新语义改写为**两条**：负例 + 正例）

第 6 节由「一条按旧语义的正例」改写为：

- **① 未确认 → 不完成 + 零副作用**（原旧断言的位置）：su 经创世边界建出角色（**不写**治理边界文档，以便断言它未被写）→ **不注入** `operatorChannel`（模拟「未接入客户确认通道」）→ `handle.finalize()` 断言 `ok:false`、`status==="unavailable"`、`message` 匹配 `/未获确认|未接入客户确认通道|fail-closed/`；**零副作用**：`.ans/`、`.ans/project.json`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md` **逐一断言不存在**、`wrote` 为空。
- **② 确认通过 → 完成**（新增正例）：同样 su 建角色 → **注入 allow 确认通道替身** `(prompt) => ({ outcome: "allow", operatorId: "test-客户" })`（**形状 = shell 闸 (a) 的 `OperatorChannelFn`**，提议是 `OperatorPrompt`）→ `handle.finalize()` 断言 `ok:true`、`status==="completed"`；并断言提议**确经该通道**提出（`cwd===项目根`、带 `command`/`argv`/`toolCallId`）；写出 **治理边界文档（内容 === `renderGovernanceBoundaryDoc()`）+ `.ans/project.json` + `docs/bootstrap-manifest.md`**；pin 覆盖 `[角色卡/governance-boundary.yaml, 角色卡/新角色/boundary.yaml]` 且**由我自己用 `node:crypto` 独立重算 SHA-256 逐条比对一致**；`acceptance.source` 含 `operator:test-客户`；该 `.ans` 经装配载入器 `loadEffectiveConfig` 验为 **pin-backed accepted**、`resolveRole("新角色")` 无 `parseError`。

新增值导入 `renderGovernanceBoundaryDoc`（`src/common/编排/finalize.ts`）与类型 `OperatorChannelFn`/`OperatorPrompt`（`src/provider/pi/session.ts`）——**只读引用**，符合本角色边界。第 7 节「拿掉授权 → 被门禁拒」负例**不变**（仍绿：门禁前置预检在提议前即拒，未打扰客户）。

### 3) 扫全仓：有无别处仍在按旧语义断言 `finalize`

- `test/编排/finalize.test.ts`、`test/编排/genesis-finalize-reach.test.ts`（**编排**角色）：**已是**新语义——均注入 `operatorChannel`（allow/deny/unavailable 各色）后断言 `completed`/`declined`/`unavailable`，**无需改动**，且全绿。
- `test/桌面应用/finalize-wiring.test.ts`（**桌面应用**角色，非本角色）：**:156** 与 **:190** 两条用例在**未接任何确认通道**下仍断 `manager.finalizeBootstrap()` `ok:true` ——**同属旧语义**（`finalizeBootstrap` 经 `SessionManager` 未透传 `OperatorChannelFn` ⇒ 实得 `unavailable`）。**这正是全量剩余的那 2 处失败**，属桌面角色（已排给它）——**未动**（本角色边界不含 `test/桌面应用/`）。
- 其余命中均为设计文档 / `memo` / `changelog` 说明文字，非断言。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/t9-block1-bootstrap.test.ts` → **11 pass / 0 fail**（改前 9/1；本文件 10→11 例，净 +1）。
- `node --test test/测试/*.test.ts` → **99 pass / 0 fail**（改前 98/1）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **610 总 / 608 通过 / 2 失败**（改前 **609 总 / 606 通过 / 3 失败**）。剩余 **2 处**失败**均在** `test/桌面应用/finalize-wiring.test.ts:156`、`:190`（桌面角色，非本角色、未动）。

## 2026-10-11 — 修一处因「空项目不再报 warning」而失效的断言（空项目是正常状态）

**来源**：客户指出「**项目没有角色卡的时候也不用有错误提示啊，这个是正常的**」。门禁引擎据此改 `src/service/role/resolve-role.ts::listProject`：**无角色目录**时**不再推那条 warning**（返回值其余不变——仍返回 `[内置 su] + hasRoles:false + primaryRoleId:{内置 su id}`）；**所有真异常的 warning 全部保留**（缺 `role-card.md` / 缺 `boundary.yaml` / 读取失败 / 边界解析失败 / 角色重复 /「有目录却无有效角色」）。门禁引擎**未越界改本角色文件**，把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/service/role/resolve-role.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts` 的「空文件夹」用例（`test` 声明于 **122** 行）仍在断言空项目**应**给出 warning：

```ts
assert.ok(
  listing.warnings.some((w) => w.includes("bootstrap") || w.includes("无角色目录")),
  `应给出「尚未 bootstrap」类 warning，实得：${JSON.stringify(listing.warnings)}`,
);
```

实测确切失败位置 ——
- `node --test test/测试/t9-block1-bootstrap.test.ts` → **9 pass / 1 fail**；失败即本用例，`test at test\测试\t9-block1-bootstrap.test.ts:122:1`，`AssertionError [ERR_ASSERTION] … 应给出「尚未 bootstrap」类 warning，实得：[]`，抛在 **`t9-block1-bootstrap.test.ts:133:10`**（`actual: false` / `expected: true`）。
- 只读核对新行为（`listProject`，`src/service/role/resolve-role.ts:106-221`）：空项目 `foundRoots.length===0` ⇒ 第 215 行的「有目录却无有效角色」汇总**也不触发** ⇒ 返回 `{ warnings: [], hasRoles:false, primaryRoleId: BUILT_IN_GOVERNANCE_ROLE_ID, roles:[内置 su] }`。与本用例其余正面断言（`hasRoles:false` / `primaryRoleId:"su"` / `roles.length===1` / 内置 su 带 `cardText`）一致。

### 2) 改法：反向守卫（**不删行**）

把该 `assert.ok` 改为**断言没有 warning**——留着守卫比删掉更有价值（它不会再长回来）：

```ts
assert.deepEqual(listing.warnings, [], `空项目不应有任何 warning（空项目是正常状态），实得：${JSON.stringify(listing.warnings)}`);
assert.ok(
  !listing.warnings.some((w) => /无角色目录|尚未 bootstrap/.test(w)),
  `空项目不得再出现「无角色目录 / 尚未 bootstrap」类 warning，实得：${JSON.stringify(listing.warnings)}`,
);
```

并改写上方注释：说明客户 2026-10-11 裁定「**空项目是正常状态**（尚未 bootstrap 的初始态）、不该报警」，且**真异常 warning 全部保留**。写法与 `test/门禁引擎/list-project.test.ts`（门禁引擎角色）同款**反向守卫**。**未**改动其余断言语义。

### 3) 扫全仓：有无别处仍在断言那条 warning

**无。** 全仓 `无角色目录|尚未 bootstrap|warnings.some` 命中里，除本处（已改）外 ——
- `test/门禁引擎/list-project.test.ts`（**门禁引擎**角色，非本角色）：**已是**反向守卫 `!w.some(w => /无角色目录/.test(w))`，无需改动；
- `test/桌面应用/interface.test.ts:275 / :328`（**桌面应用**角色，非本角色）：`warnings: ["项目根下无角色目录"]` 仅是喂给 `listProjectFn` 的**桩输入**（构造 mock `ProjectListing` 测桌面**透传**），**并不断言**真实 `listProject` 产出该 warning ⇒ 不受影响；
- 其余命中均为设计文档 / `memo`/`changelog` 说明文字，非断言。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 97 / 1）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **598 pass / 0 fail**（连跑 4 次均全绿）。
- 观察（如实登记，非本改动引入）：全量首跑曾**偶发**一次 `test/pi-adapter/tools.test.ts:248`（`edit_file` 保留 UTF-8 BOM 用例）失败；单跑该文件 3/3 通过、其后全量 3/3 全绿 ⇒ 判为**偶发 flake**，与本次改动无关（异角色文件、异路径）。未改该文件。

## 2026-10-11 — 修一处因拆除「只读」徽标而失效的断言（su 不再标只读）

**来源**：客户裁定**拆掉 su 上的「只读」标记**（原话：「su 不该是只读…一直可以聊天」）——依据其早定的「**门禁静默执行、拒绝内联显示在聊天流里**」；「只读」徽标是后加的、偏离了那条，故拆除。桌面应用（他角色）随之**删除** `RoleView.readOnly`、`isReadOnlyRole` 及相关呈现与样式。桌面未改本角色文件（`test/测试/t9-block1-bootstrap.test.ts` 在本角色边界内），把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`app/desktop/interface.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts:138` 仍在读已删字段：

```ts
assert.equal(listing.roles[0].readOnly, false, "未 bootstrap 的 su 能写治理产物，不得标只读");
```

实测确切报错位置——
- `npm run typecheck` → `test/测试/t9-block1-bootstrap.test.ts(138,33): error TS2339: Property 'readOnly' does not exist on type 'RoleView'.`（**1 处**）
- `node --test test/测试/*.test.ts` → **97 pass / 1 fail**；失败即本用例，`AssertionError … 未 bootstrap 的 su 能写治理产物，不得标只读`，`actual: undefined` / `expected: false`（读到的字段已是 `undefined`）。
- `RoleView`（`app/desktop/interface.ts:49`）现无 `readOnly` 字段（确认：只剩 `roleId/cardPath/boundaryPath/cardText/boundary/builtIn/changelog/docs`）。

### 2) 改法：反向守卫（**不删行**）

把该行改为**断言该字段不存在**——留着守卫比删掉更有价值（它不会再长回来）：

```ts
assert.equal("readOnly" in listing.roles[0], false, "su 不应再带 readOnly 字段（只读徽标已移除）");
```

并改写上方注释：说明客户 2026-10-11 裁定移除「只读」徽标（它偏离了「门禁静默执行、拒绝内联显示在聊天流里」的原模型；su 本就一直能聊天/写治理产物）。写法与 `test/桌面应用/interface.test.ts`、`su-effective-boundary.test.ts` 的**反向守卫**同款（`assert.equal("readOnly" in r, false, …)`），**一致性**：全仓同一条纪律。**未**改动其余断言语义。

### 3) 扫全仓：有无别处仍在读被删的 `readOnly`

**无。** 全仓 `\.readOnly|readOnly\b` 命中里，除本处（已改）外——
- `test/桌面应用/`（`interface.test.ts` / `su-effective-boundary.test.ts`）已是**反向守卫**（断言字段不存在），无需改动；
- `src/common/门禁引擎/classify-shell.ts`、`src/model/decision.ts`、`test/门禁引擎/classify-shell.test.ts`、`test/测试/t9-block3-pin-shell.test.ts` 等的 `readOnly` 是 **`ShellRules.readOnly`**（shell 命令分类的**只读程序白名单**数组），**与被删的 `RoleView.readOnly` 无关**，不动。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 97 / 1）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **598 pass / 0 fail**（基线 599，−1 是桌面删了 1 条纯 `isReadOnlyRole` 用例；本改动未增减用例数，仅改 1 行断言）。
- `npm run typecheck` → **零错误**（原 1 处已消除）。

## 2026-10-11 — T35 用户入口验收：重写 t9-block1（su 不预建 · 从用户入口出发）

**任务**：T35（设计 §12.6/§12.7）。**两件**：① 重写旧验收 `test/测试/t9-block1-bootstrap.test.ts`（其前提「固定 7 角色骨架」已被客户「不预建，全由 su 对话决定」否定）；② 验收**从用户入口出发**。基线：全量 **572 总 / 570 通过 / 2 失败** + **1 处 typecheck 错**（三处全在本文件旧版）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/service/gate/resolve-write.ts`、`src/common/门禁引擎/governance-seed.ts`、`app/desktop/{project,session,interface}.ts`。

### 0) 旧版为何是红的（三处，全在本文件）

- **typecheck 错**（`:90`）：用 **T32 已退役的 `bootstrap` 选项**（`openGovernanceSession` 不再接收）——`TS2353`。
- **2 失败**：断言「固定 7 角色骨架落盘」（`角色卡/{项目管理,编排,…}/…`）——**客户已定「不预建」**，该前提被推翻，`openGovernanceSession` 现按 §12.4 不再预建骨架。

### 1) 改写形态（不是修修补补）

`t9-block1-bootstrap.test.ts` **整体重写**为 §12.6 的**新形态**：**su 不预建**——它**直接写出**角色；`openGovernanceSession` **不预先创建** `角色卡/`/`docs/`/`.ans/`；角色是 su（经创世边界）**写出来的**。共 **10 例**（旧版 6 例），系统临时目录、用完清理、**不写仓库**。

### 2) 从**用户入口**出发：沿哪条链验（本次方法要求）

T9 结论「未发现自证与实际不符」是实话，但**验错了对象**——验的是编排的 `openGovernanceSession`，**没验桌面那条链**。故本文件沿**桌面实际会走的那条链**：

**导入空文件夹（IPC `createDesktopInterface`）→ `listProject`（门禁引擎）→ 构造 `ProjectConfig`（`buildProjectConfig`）→ `openSession` → 真实 `openRoleSession` 构造 gate → 开门禁判定**。

gate 从**注入的适配器工厂缝**（`createDemoAdapterFn`）捕获——**不是**直接调 `resolveWrite` 了事；`ProjectConfig` 也从真实 `openRoleSession` 入参捕获（证明「未 bootstrap 带 `genesisBootstrap`、有角色不带」确由桌面链产出）。**不跳过中间层**。

### 3) 各确定性项的**实际**结果

- **空文件夹**：IPC `listProject` **不抛错**，返回内置 `su` + `hasRoles:false` + `primaryRoleId:"su"`（roles 仅 1 条、builtIn、不标只读）；根不存在/是文件**仍抛错**（真错误不伪装）。
- **创世边界**：su 的 gate **放行** `角色卡/<任意新角色>/{role-card.md,boundary.yaml,memo.md}`、`角色卡/governance-boundary.yaml`、`docs/…`、`.ans/project.json`；**拒绝** `src/**`、`README.md`、`package.json`、`app/…` 及**项目根外的绝对路径**。
- **切回**：项目一有角色（`hasRoles:true`）→ 桌面**不再设** `genesisBootstrap`（键不出现）→ su 回内置未接受边界 →**拒一切写**（含 `docs/`）。角色 R 是**经创世 gate 由 su 真实写出**的（`buildGovernedTools` 落盘），故「有角色」确系 su 所为。
- **自终止**：写出只含 `docs/` 的项目边界并 pin 后，`resolveBoundarySection` 的**项目覆盖**先命中（条目只剩 1 条）→ 原本可写的 `角色卡/Y/…` **写不了**，`docs/` 仍可写（对照）——**genesisBootstrap 刻意残留亦无效**（结构性自终止成立）。
- **旧形态退场**：空项目 + 空脚本 → `openGovernanceSession` 后 `角色卡/`、`docs/`、`.ans/` **均不存在**（引擎不预建）；且创世下 `handle.scope === undefined`（§12.2，不造 `writeSet`）。
- **新形态**：su 直接写出的角色**真实落盘、字节相等**；越界写 `src/evil.ts` **写前被拒且零副作用**（不建父目录）；`listProject` 枚举到新角色。

### 4) finalize —— **pin 由我独立重算比对** + 载入器验真

- **正例**：创世项目 → `openGovernanceSession` → su 写出角色三件套 + 项目治理边界 → `handle.finalize()` **真的写出** `.ans/project.json` 与 `docs/bootstrap-manifest.md`；pin 覆盖「项目治理边界 + 各角色 `boundary.yaml`」。
  - **独立重算**：**我自己**用 `node:crypto` 对原始字节求 SHA-256 逐条比对——**全部一致**（未采信实现方断言）。
  - **载入器验真**：该 `.ans` 经**装配的载入器** `loadEffectiveConfig` 载入 → `source.kind==="ans"`、`acceptance.accepted===true`、`pinPaths>=2`；`resolveRole("新角色")` 边界 **accepted、无 parseError**（pin 校验通过）。
  - 留痕列出 `角色卡/新角色/{role-card,boundary,memo}.md`、`角色卡/governance-boundary.yaml`、`.ans/project.json`。
- **负例（不绕门）**：**把授权拿掉**（项目治理边界文档在、但 `acceptance` 未接受）→ `finalize()` **被门禁拒**（`/门禁拒绝|未被接受|F6/`）且 **零副作用**（`.ans/` 未创建、`wrote` 为空）——证明 finalize 的写同样经 `resolveWrite`，**不是凭代码身份绕门**。

### 5) 有无发现实现方**自证与实际不符**

**没有发现谎报。** 被验主张（创世有界、切回、结构性自终止、finalize 过门且 pin 可验）均经独立构造复现通过。**但发现一处端到端缺口**（如实登记，非谎报）：**桌面路径未接 `finalize`**——`app/desktop/` 无任何 `finalize` 调用，故从**用户入口**走完「su 建角色」后，`.ans/project.json`（pin）与 `docs/bootstrap-manifest.md` **不会自动写出**（编排文档明说「多轮消费者（桌面 su 聊天）应自行调 `handle.finalize()`」，桌面未调）。**已如实报告**，接线与否交协调方/客户定（T33 的「取舍交客户」亦未定）。

### 6) 「客户须手工验」的步骤（真实模型建角色那条，本机不可自动验收）

「su **真的据对话**决定并建出角色」需**真实模型轮次**（凭据 + 已配置 provider + `ANS_PI_CONTEXT_WINDOW` 必填），按项目操作约束**须客户本人运行**——**不列入自动验收**。建议：（撰写于 `t9-block1-bootstrap.test.ts` 顶部 `CLIENT_MANUAL_STEPS` 常量）

> ① 桌面导入**空文件夹**（无 `角色卡/`、无 `.ans/`）→ 左树显示 su + 「尚未 bootstrap」提示；② `.env` 配 `ANS_PI_BASE_URL/MODEL/PROVIDER/CONTEXT_WINDOW` + `ANTHROPIC_AUTH_TOKEN`；③ 选 pi，点 su，**用自然语言**说明要建哪些角色；④ 断言 su 真的 `write_file` 写出 `角色卡/<角色>/{role-card.md,boundary.yaml,memo.md}`、且越界写（`src/**`）写前被拒；⑤ 断言写完后左树随 su 建角色**长出**对应角色。

### 7) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 94）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **576 pass / 0 fail**（改前 576 总/2 失败；本文件 6→10 例，净 +4）。
- `npm run typecheck` → **零错误**（本文件旧版 1 处 `bootstrap` 选项错已消除）。

### 8) 范围/限制（如实照录）

- 桌面 **shell 闸 V1 不 arm**、**pi 路径会真写入**（demo 只判不写）、**`ans init` 已废**——既有范围，非本次目标。
- 本文件**未**触发真实模型；`(b)` pm 审读真实模型行为不属本块。

## 2026-10-11 — T29 独立验收：Pi 配置往返与写入纪律

**任务**：T29（独立验收「桌面 Pi 配置界面 → 保存 `.env`」的**配置往返**与**写入纪律**）。**独立性**是要害——不重跑实现方的自证，由本角色**自写**用例验证**主张**。基线：全量 **533 通过 / 0 失败**、`npm run typecheck` **零错误**。边界：只写 `test/测试/` 与 `角色卡/测试/`。方案：设计 §11（`2026-10-11_design_v1-full-implementation.md`）。**只读**：`src/common/shared/env-file.ts`、`app/desktop/pi-config.ts`、`src/common/pi-adapter/provider-config.ts`。

**隔离红线**：全程只碰系统临时目录（`os.tmpdir()` 下 `mkdtemp`），**绝不读写仓库根真实 `.env`**；用完即清理，仓库不留文件。

### 1) 新增文件（2 个，共 21 例，自搭临时 `.env`、不复用他角色夹具）

- **`test/测试/t29-pi-config-roundtrip.test.ts`（8 例）** 配置往返 + 单一来源/签名纪律：
  - 自写一组 Pi 配置（含哨兵 token）到临时 `.env` → `loadPiEnv` 载入 → 进程 env 拿到**正确值（含 token）**；`LoadEnvResult` 只含键名、**不含值**（`JSON.stringify` 不含 token）。
  - **配置到达适配器**：载入后 `resolvePiProviderConfig({}, env)` 成功构造——baseUrl/modelId/**contextWindow（"131072"→number）**/providerId 正确、`apiKeyEnvVar==="ANTHROPIC_AUTH_TOKEN"`；构造结果不含 token 值。
  - **保存后重载**：改 modelId+contextWindow → `savePiConfig` → 同一 env **立即**生效 + **另开** env 从盘重载生效（确认真落盘）+ 适配器构造取到新值。
  - **单一来源**：**自己遍历** `src/`+`app/` 的 `.ts`，确认 `parseEnvFile`/`mergeEnvText`/`atomicWriteText`/`readEnvFile`/`saveEnvFile`/`loadEnvFileInto`**只在** `env-file.ts` 定义；桌面 `pi-config.ts`/`main.ts` 只从共享模块导入。
  - **签名未扩**：`resolvePiProviderConfig.length===2`、`createPiAdapterFactory.length===2`（方案 §11.3 裁定不扩签名）。
- **`test/测试/t29-write-discipline.test.ts`（13 例）** 写入纪律逐条独立：
  - ①**只改相关键**——**自己做字节级比对**（除目标行外挖掉后两份文件 `===`；行数不变；恰 1 行变化且为目标键行，其值等于**我独立算出**的期望）；注释/空行/未知键/无关键原样在。
  - ②**键不存在→追加**（前文逐字节不变、追加在末尾、沿用原行尾符；CRLF 原文追加 CRLF）、**已存在→就地替换**（键名/`=`/两侧空白/引号风格/内联注释均保留）。
  - ③**特殊字符**（`=`、空格、`"`、`'`、`#`、反斜杠、首尾空白、tab、URL 查询串）写后读回**逐字一致**（经 `parse` 与经 `loadEnvFileInto` 两路）。
  - ④**原子性**——写入后目录内**只有 `.env`**（无 temp 残留）、内容为完整合并结果（非半写）；`atomicWriteText` 直调覆盖原子。
  - ⑤**失败路径**——目标目录不存在 → `savePiConfig` `{ok:false,error}` 且**不建目录**、`saveEnvFile` 抛错、`readEnvFile` 抛错（对照 `loadEnvFileInto` 对 ENOENT 不抛=「无 `.env`」）；**目标是目录** → 抛错且**目录未被替换/损坏**（marker 原样）。
  - ⑥**不回显**——哨兵 token **只进 env**；成功/失败**回报**、**错误文本**、**面板视图**（机密键 value 恒 `""`、只给 `isSet`）一律不含其值；非面板键被忽略、**不越界落盘**。

### 2) 独立复核结论（我自做，非照抄实现方断言）

- **配置往返**：载入值（含 token）正确、**能成功构造 `PiProviderConfig`**、保存后重载新值生效——三者独立跑通。
- **写入纪律**：逐条通过；**字节级比对由本文件自做**（含"挖掉目标行后整体 `===`"与"独立算期望行"两法），实现方对"只改相关键/保留其余"的主张**与实际相符**。
- **有无发现实现方自证与实际不符**：**没有**。
- **额外对抗性探针**（一次性脚本，未入库）：未命中行含**行尾空白/制表符/缩进**时仍逐字节保留；值内 tab 经双引号 quote 后读回逐字一致——均符合主张。

### 3) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **94 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **554 pass / 0 fail**（基线 533 + 本次 21）。
- `npm run typecheck` → **零错误**。

### 4) 「验证不到的东西」（如实标注）

- **真实模型轮次本机不可自动验收**（凭据命令须客户本人运行）：故"保存配置后**真实 pi 会话能跑通**"**只验证到「配置能正确到达适配器构造」**（`resolvePiProviderConfig` 成功产出 `PiProviderConfig`），**未验证真实模型/网络调用**。
- 既有范围边界（非本次目标，如实照录）：桌面 **shell 闸 V1 不 arm**、**pi 路径会真写入**（demo 路径不写=S2 二期）、**`ans init` 已废**（作未知命令非 0）。
- 原子写的 **fsync / rename 原子性本身**无法在单进程内直接观测半写；以"无 temp 残留 + 内容完整"为可观测代理。

## 2026-10-11 — T9 独立跨角色总验收

**任务**：T9（独立跨角色总验收）。**独立性**是要害——不重跑实现方的自证，由本角色**自写**跨角色端到端验收，验证**主张**（越界写在发生之前被拒）而非仅验证实现。基线：全量 460 通过 / 0 失败、typecheck 零错误。边界：只写 `test/测试/` 与 `角色卡/测试/`。

### 1) 新增文件（3 个，共 32 例，自搭场景、不复用他角色夹具）

- **`test/测试/t9-block1-bootstrap.test.ts`（6 例）** 块1 bootstrap/创建权：
  - 空目录 → `listProject` **不抛错**，返回内置 `su` + `hasRoles:false` + `primaryRoleId:"su"`；项目根不存在/是文件 → **仍抛错**（真错误，不伪装成空项目）。
  - 有界创世：经**唯一治理会话引擎** `openGovernanceSession`（`bootstrap` 选项，替身 adapter 无真实模型）在全新项目写出治理产物——7 角色 `role-card.md`/`boundary.yaml`/`memo.md`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`、`.ans/project.json`；逐条校验 pin 与实际 SHA-256 一致、治理边界本身被 pin 覆盖；`listProject` 枚举到 7 项目角色 + su。
  - 与 su 对话建角色：用**共享载入器** `loadEffectiveConfig` 从 `.ans` 载入生效配置（非手拼），再经同一引擎新增 `角色卡/新角色/`（替身写 role-card/boundary/memo）；写集内文件**真实落盘且字节相等**，越界写 `src/evil.ts` **写前被拒且零副作用**；`listProject` 枚举到新角色。
  - 负例（边界）：创世授权下写 `src/`/`README.md`/`任意文件.txt`/`package.json`/`app/…` → **一律写前被拒**。
  - 负例（自终止）：先证**纯创世**下 `角色卡/Y/role-card.md` 可写；写出只含 `docs/` 的项目边界文档并 pin 后，**原本可写的 `角色卡/Y/…` 写不了了**（`genesisBootstrap` 刻意残留，证明自终止是**结构性**的）；对照 `docs/` 仍可写。
- **`test/测试/t9-block2-write-landing.test.ts`（10 例）** 块2 写入真正落盘：
  - 允许写 → 盘上**字节等于** content（含非 ASCII，UTF-8 原始字节）；目录条目覆盖子路径 → `mkdir -p` 出父目录；`edit_file` 命中 → 回写等于预期；未命中 → `ok:false` 且文件不变。
  - 拒绝写 → 文件不存在、父目录不建；对已存在但越界的文件 `edit_file` → **内容与 mtime 不变**（零副作用）。
  - 负例：gate 抛错 → **任何副作用之前** fail-closed，无文件/目录产生；junction **逃逸出写根** → 写层拒绝且**链接目标未被触碰**（gate 故意放行，证明写层纵深防御生效）。
  - 第二边界（§3.8）：gate 放行**写根之外（skill 根）**的写 → **写层仍拒**、无文件产生。
  - 同源：行为——gate 收到的 abs === 文件落盘路径；静态——`fs-write.ts` 与 `门禁引擎/paths.ts` 均引 `shared/path-primitives.ts`，且两处均不再自持 `normalizeLexical` 实现。
- **`test/测试/t9-block3-pin-shell.test.ts`（16 例）** 块3 pin/调度/V3：
  - pin：匹配→accepted 且 `src/a.ts` 可写；**篡改边界文件致 hash 失配 → 未接受 → 拒一切写**；`.ans` 存在但 `accepted:true` **无 pin** → 载入方置未接受（`downgradeReason`）→ 拒写；**无 `.ans`** → 回退内置（未接受）仍拒写（F6）。
  - 调度/审计（boundary 级）：pm 边界覆盖 `docs/scheduling/`；审计 `docs/audit/shell-gate.jsonl` 声明 `shell-gate` 才放行，**缺条件 → 写前拒**。
  - V3 三层链：`(c)` 白名单放行 **且 (b)/(a) 未被调用**；`(c)` 硬拒 → 拒绝、终结，**且 (b)/(a) 未被调用**（(b)/(a) 桩**本会放行**，证明硬地板不可翻案）；`(c)` review → `(b)` 放行/拒绝即终结；`(b)` 拿不准/无会话/超时/JSON 非法 → 升 `(a)`；`(a)` 超时/不可用 → 拒绝；(c)-only 未接 (b)/(a) → review 默认拒绝。
  - fail-closed 退路：规则集加载失败 → **整条拒绝**（含白名单命令 `ls`，证明绝不「没规则就放行」）；`classifyShell` 版本未知 → deny；**未 arm → `run_shell` 根本不注册**；`run_shell` 只在恰好 `allow:true` 时执行；`shellKillSwitch` 未 arm block。

### 2) 独立验收结论

- **未发现实现方自证与实际不符之处。** 三块关键主张（越界写写前被拒、创世有界且自终止、硬地板不可翻案、未 arm 不注册、fail-closed 只往更严退）均经独立构造复现通过。
- 一处**待记的既文档化行为**（非不符）：`listProject` 只枚举**同时具备 `role-card.md` 与 `boundary.yaml`** 的角色目录（缺一则记 warning 跳过）。故「与 su 对话建角色」须写全套骨架方可被左树枚举——建角色用例据此写 role-card/boundary/memo 三件。
- `test/测试/` 与全量套件均**全绿、零跳过**；`npm run typecheck` 零错误。

### 3) 如实记录的「验证不到的东西」

- **真实模型轮次本机不可自动验收**（凭据命令须客户本人运行）：`(b)` pm 审读的**真实效果**、真实模型驱动的 su 对话，**只验证了接线形状与失败时的 fail-closed，未验证真实模型行为**（本文件对 (b) 用桩）。
- **桌面 shell 闸 V1 不 arm**（客户已定）：桌面的操作者通道**建了但未被消费**——是**范围**，非缺陷。
- **桌面 pi 路径会真写入**（客户已定，受门禁约束）；demo 路径只判不写。
- **`ans init` 已废除**，建项目只有 su 对话一条路。
- **本机限制**：Windows 无开发者模式/管理员权限 → 无法创建**文件符号链接**（`symlinkSync` 直接 EPERM），故设计 §5.1「目标本身是符号链接 → 拒绝」子用例**本机不可自动验收**；其安全属性（绝不写链接之外）已由可用的 **junction 逃逸**用例覆盖。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **73 pass / 0 fail / 0 skip**（改前 41 + 本次 32）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **492 pass / 0 fail / 0 skip**（基线 460 + 本次 32）。
- `npm run typecheck` → **零错误**。
- 桌面 e2e：`ANS_E2E_OUTDIR=<系统临时目录> node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → 退出 0，`report.txt` 关键检查点：`PRIMARY_ROLE_ID=su`、`DEFAULT_SELECTED_ROLE=su`、`SU_IS_FIRST=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`BOOTSTRAP_NOTICE_SHOWN=true`（空项目、非错误样式）、`REFRESH_*=true`、`HANDBACK_CARD_PRESENT=true`/`HANDBACK_NOT_MIRROR=true`/`HANDBACK_STATUS_OK=true`、`MIRROR_CARD_PRESENT=true`/`MIRROR_HAS_FROM=true`/`MIRROR_STATUS_BLOCKED=true`、`OLD_GENERAL_CLAIM_PRESENT=false`、`E2E_DONE=1`。**未开任何真实 pi 会话**（e2e 全程 demo）；跑完 Electron 自行退出（无残留进程）、临时目录已清理，仓库无残留文件。

## 2026-10-11 — 修正 `test/测试/f7-symlink.test.ts` 的 2 处 typecheck 错误（字面量漏标注）

**来源**：仓库装入 `typescript`，`npm run typecheck`（`tsc --noEmit`）成为真门；全仓 11 处错误中 2 处落在本角色文件 `test/测试/f7-symlink.test.ts` 的 58 / 64 行。

### 1) 错误是什么

两条错误**同源**，均为 `TS2345`：传给 `resolveWrite(...)`（第 2 形参类型 `BoundarySection1`，见 `src/service/gate/resolve-write.ts`）的实参类型不匹配——

```
Argument of type '{ entries: { root: string; path: string; kind: string; purpose: string; }[]; ... }'
is not assignable to parameter of type 'BoundarySection1'.
  Types of property 'root' are incompatible. Type 'string' is not assignable to type 'Root'.
```

根因：测试里 `const boundary = { entries: [{ root: "project", path: "src", kind: "directory", purpose: "t" }], … }` **未标注类型**，对象字面量的属性被**拓宽**为 `string`；而 `Root = "skill" | "project"`、`kind: EntryKind`。`string` 不能赋给 `Root` / `EntryKind`。

### 2) 判定：是生产代码的类型问题吗

**不是。** `src/model/boundary.ts` 的 `Root` / `BoundaryEntry` / `BoundarySection1` 定义本身正确、自洽；`resolveWrite` 的形参收窄也是对的（它就该收窄到 `BoundarySection1`）。错误**只在测试一侧**：构造夹具时漏了类型标注，让字面量被拓宽。故按真实语义**在测试里补标注**，不越界改 `src/`。

### 3) 改法（只看本角色文件）

- 新增 `import type { BoundarySection1 } from "../../src/model/boundary.ts";`（只读引用类型，符合本角色边界）。
- `const boundary = {` → `const boundary: BoundarySection1 = {`。标注后 `root` / `kind` 按字面量上下文归一到 `Root` / `EntryKind`，两条错误一并消失。
- 与仓库既有约定一致（同款：`test/门禁引擎/built-in-section-equivalence.test.ts`、`test/编排/shell-gate.test.ts`、`test/桌面应用/interface.test.ts` 均以 `BoundarySection1` 标注边界字面量）。
- **未使用 `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` 等压制手段**；未改任何断言与用例语义。

### 4) 验证（本角色独立执行）

- `npm run typecheck`：过滤 `f7-symlink` **无输出**（本角色 2 处错误归零）；全仓其余 9 处错误均属他角色/生产文件，**未动**。
- `node --test test/测试/*.test.ts` → **41 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **445 pass / 0 fail / 0 skip**。


## 2026-10-11 — 移除因 `ans init` 命令废除而失效的断言

**来源**：客户废除 `ans init` 命令（改为「导入空文件夹 → 与内置治理角色 su 对话 → su 建角色」）。编排（T16）删除 `src/interface/cli/init.ts` 整个文件，装配把 `cli-parse` 的 init 分支移除——`init` 现归 **`unknown`** 命令（`src/common/装配/cli-parse.ts`，`parseInvocation` 无 init 分支 → 落到末尾 `{kind:"unknown", message:"未知命令：init"}`；`src/index.ts` 的 `case "unknown"` 返回 2）。编排为只读方，改的是它自己边界内的文件；本角色的 `test/测试/real-entry.test.ts` 在测试边界内，故由本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 有两条 init 用例：

- 「真实入口:ans init <临时目录> 以 0 结束并生成骨架」——断言 `status === 0` 且生成 `.ans/project.json` / `docs/bootstrap-manifest.md`。**这是全量套件中的那 1 个失败**（改前 445 pass / 1 fail）。
- 「真实入口:ans init 无目录参数以 2 结束(用法错误)」——断言 `===2`。**恰好仍通过**（未知命令也是 2），但**名称与理由已不成立**：不再是「缺目录参数」，而是「命令不存在」。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js init`（无参）→ **退出码 2**，stderr：`错误：未知命令：init` + 帮助文本（`USAGE`）。
- `node bin/ans.js init <临时目录>` → **退出码 2**，stderr 同上 `错误：未知命令：init`；临时目录**保持为空**（`.ans/`、`docs/` 均未生成）。

实测与编排结论**完全一致**（0 期望已失效、骨架不再生成；无参 2 亦确认）。编排提到的两点均复现。

### 3) 改后断言（`test/测试/real-entry.test.ts`）

- **删除**正例「ans init <临时目录> 以 0 结束并生成骨架」：`ans init` 已不存在，为一条不存在的命令保留断言只会让人以为它还在（采纳编排倾向）。
- 把「无目录参数以 2」**改名为**「真实入口:ans init 已废除(作为未知命令以非 0 结束,且不再生成骨架)」，并改为：
  - 无参：断言 `status !== 0` **且** stderr 含 `/未知命令/`（钉住**真实原因**：命令不存在 → 归 unknown）。
  - 带目录：断言 `status !== 0` 且**不生成骨架**（`.ans/project.json` 与 `docs/` 均不存在）——保留正例被删后仍值得回归的那一点（防骨架生成器被误复活）。
- **不把「2」当 init 的契约**：只断「非 0」+ 原因，不写死具体码。2 只是 `index.ts` 的 `case "unknown"` 这条既有分支的返回值，已由上方 `FAIL_CASES` 的「未知命令」用例覆盖。
- 两条用例**净合一**：全量用例总数由 446（445 pass + 1 fail）降为 445。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **41 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，覆盖三层路径）→ **445 pass / 0 fail**（改前 445 pass / 1 fail；那 1 处即本条，已消除）。
- 扫全 `test/`：**本角色文件外**仍有几处提及 `ans init`，但**均非断言其旧行为、无需改动**：`test/装配/cli-parse.test.ts`（断言 `parseInvocation(["init"]).kind === "unknown"`，即**新**正确行为）、`test/编排/bootstrap.test.ts`（断言 `init.ts` 不存在、命令面已删，即**新**正确行为）、`test/编排/govern.test.ts` 与 `test/门禁引擎/cold-start-genesis.test.ts`（仅注释）。**未改任何非本角色文件**（回报编排）。

## 2026-10-11 — 修正因 `ans govern` 契约变更而失效的退出码断言，并据契约判定放宽「非 0」

**来源**：编排角色把 `ans govern` 从占位改为**真治理会话**（`src/interface/cli/govern.ts` + `src/pipeline/orchestration/govern-session.ts`）——现在接收装配注入的 `ConfigInjection`、走真实 Pi 适配器（缺省 `createPiAdapterFactory`，无 demo 回退）。编排未改本角色文件（`test/测试/real-entry.test.ts` 在本角色边界内），把结论交回本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 的失败路径用例 `{name:"govern 无配置通道", argv:["govern"], code:2}` 断言 `===2`。这是占位时代「govern 无配置通道 → 用法错误 2」的断言；真治理会话后 govern **有**配置通道，失败原因已改为「真实 Pi 适配器缺 provider 配置」。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js govern`（无参）→ 退出码 **1**（非 2）。stderr：
  `ans govern 会话失败：缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。为避免把凭据发往未知端点，这里不会回落到任何默认 base URL。`
  （另有两行 stdout 的会话信息，无凭据值打印。）
- 实测与编排结论一致。**逐条复核了原用例中其余 7 条**：`未知角色 / 缺角色 id / 缺 --task / --task 缺值 / 多余参数 / 未知命令 / 未知 role 子命令` 无参实测**均为 2**（用法错误）。

### 3) 契约判定（这是本改动的核心判断）

退出码约定见 `src/common/编排/exit-codes.ts`：0=成功；2=用法/参数错误；1=运行时失败。判断「具体码是否属契约」的准绳 = **它是否只由 argv 决定（输入驱动、确定）**：

- **具体码 2 属稳定契约**：仅由 argv 决定，同一非法 argv 在任何环境都得 2（未知角色/未知参数/多余参数/缺少必需参数）。→ **保留逐条 `===2`**，不放宽。
- **具体码 1 不属稳定契约（至少此处）**：`ans govern` 无参的失败**依赖运行时/环境**——取决于真实 Pi 适配器所需 provider 配置（`ANS_PI_BASE_URL` 等）是否存在；同一 argv 在不同环境可能得到不同码。断言其具体码即**过度约束**（每次环境/上游行为一变就连带失败，这正是本次与上次 `init` 同类失效的根因）。→ **放宽为只断言「非 0」**。
- 两类都保留「**必须非 0**」：失败路径绝不静默成功。

据此**只放宽 govern 这一条**，其余 7 条用法错误仍断言具体码 2。这是**有原则的放宽**，不是为变绿而无原则放宽。

### 4) 改后断言（`test/测试/real-entry.test.ts`）

- 失败路径数组类型由 `code: number` 改为 `code?: number`；循环内**仅当给出 `code` 时才断言 `===code`**，恒断言 `!==0`。
- 用例改名：`govern 无配置通道` → **`govern 缺真实 Pi 适配器 provider 配置（ANS_PI_BASE_URL 等未设）`**（如实反映真实原因），并去掉其 `code`（只断非 0）。
- 顶部加注释块，写明上述契约判定依据。

### 5) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **42 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **357 pass / 0 fail**（改前 356 pass / 1 fail；本改动未增减用例数，仅改 1 条断言与名称）。
- 扫全 `test/`：无其他因 `govern`/`init` 行为变更而失效的断言。`test/编排/govern.test.ts` 对 `governCommand(argv, undefined)`→`EXIT_USAGE` 的断言是**注入缺失的确定性用法错误**（非环境依赖），仍成立；`test/装配/entry.test.ts` 的 pi 无凭据用例本就只断「非 0」，模式正确。

## 2026-10-11 — 修正因 `ans init` 契约变更而失效的退出码断言

**来源**：编排角色把 `ans init` 从占位命令改为**真实骨架生成器**（`src/interface/cli/init.ts` + `src/common/编排/bootstrap.ts`）。新行为：`ans init <目标目录> [--force]`；**无目录参数属用法错误**（`parseInitArgs` → `errors.length > 0` → `EXIT_USAGE`）。编排未改本角色文件（`test/测试/real-entry.test.ts` 在本角色边界内），把结论交回本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 原用例「真实入口:help/doctor/init 以 0 结束」断言 `runCli(["init"]).status === 0`——这是占位命令时代的断言，与新契约矛盾（全量套件中的那 1 个失败）。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js init`（无参）→ **退出码 2**，stderr：`错误：缺少目标目录` + 用法行。
- `node bin/ans.js init <临时空目录>` → **退出码 0**，stdout 打印 `# Bootstrap 创建清单（创世例外，设计 §2.4）`，并生成 `.ans/`、`docs/`、`角色卡/`（含 `.ans/project.json` 与 `docs/bootstrap-manifest.md`）；临时目录已清理，仓库无残留。

实测与编排结论一致，采纳其建议。

### 3) 改后断言（`test/测试/real-entry.test.ts`）

- 拆分原用例：「真实入口:help/doctor 以 0 结束」（仅 `--help`/`doctor`）。
- 新增「真实入口:ans init 无目录参数以 2 结束（用法错误）」：断言 `status !== 0` 且 `status === 2`。
- 新增正例「真实入口:ans init <临时目录> 以 0 结束并生成骨架」：`mkdtempSync(join(tmpdir(), "ans-init-"))` 建临时目录 → 断言 `status === 0`、stdout 含创建清单、`.ans/project.json` 与 `docs/bootstrap-manifest.md` 存在；`try/finally` + `rmSync(dir, {recursive:true, force:true})` 保证清理（沿用 `test/门禁引擎/*` 既有临时目录模式）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **42 pass / 0 fail**。
- `node --test test/*/*.test.ts`（全量）→ **328 pass / 0 fail**（改前 325 pass / 1 fail；本改动拆 1 用例为 3，净 +2）。
- 扫全 `test/`：无其他因 `init` 行为变更而失效的退出码断言。`test/装配/cli-parse.test.ts:47` 断言 `parseInvocation(["init"])` 的**解析形状**（`{ kind:"init", argv:[] }`），非退出码，不受影响，未改。


- 2026-10-15：V2 严格落地独立验证 verified：真实原生双宽、导入/键盘/缺配/选择/停止/来源阅读、p-limit 正式派发和回交通过；最终 Node 1384 pass / 0 fail / 1 Windows-only skip。5 个生产文件变化由各属主维护；测试仅补 own fake IPC，原断言不放松。详见 [独立验证](docs/change/2026-10-15_change_visual-v2-independent-verification.md) 与 [最终证据](docs/change/2026-10-15-visual-v2-implementation-evidence/final-verification.json)，首红与修复历史保留，未 commit/push。

- 2026-10-15：v1.0.0三原生运行包独立验收与公开发布verified。CI3每平台1401项，mac两各1400pass0fail1skip、Windows1399pass0fail2skip；实际ZIP启动/依赖、同source+overlay树、GitHub服务器digest和匿名下载核对通过。原tag、真实.env、acceptedV2不变。首红及跨平台/时钟夹具订正全部保留，详见[发布独立验证](docs/change/2026-10-15_change_v1-release-verification.md)。

- 2026-10-19：**写盘确认卡 preview 完整性闸——test/测试 夹具补正文**。编排新增呈现前闸（声明写入路径的 confirm 卡须为每条路径给出可核对正文，否则不发卡/不发行）；本角色 10 文件 15 例既有夹具按新契约只补 preview 正文（路径声明行逐字保留；断言零改动、产品代码零改动、未放宽）。复跑 `test/测试` **782/779/3/0**（前 782/764/18/0），15 例转绿；剩余 3 红（u1-renderer:96、g-desktop:65、t29:273）经 `git archive HEAD`（6d40eee）干净基线复跑**同样失败**，归因 `be3ab2c`/`6d40eee` 的测试侧预期落后，与本批无关，未改；typecheck 0。详见[修复记录](docs/fix/2026-10-19_fix_write-confirm-preview-fixtures.md)。未 commit/push。

- 2026-10-19：**五角色 shell 审批档——test/测试 旧断言翻转与全仓独立复核**。客户新规则「所有角色都有 shell 权限（含读写与任意命令），一律提交审批」落地后，翻转本角色 2 文件 3 处旧断言（Liaison「无 shell 面」、caps `deepEqual shell:"none"`、trio「误传 approval 不 arm」）为五角色统一 `operator-approve`、传审批档即 arm；同时补强 allow 0 卡直放 / risky 逐条审批 / 拒绝与通道不可用 fail-closed 断言，**既有断言零放宽**。复跑 `test/测试` **782/779/3/0**（修前 782/777/5/0，剩余 3 红为 HEAD 既有）；全仓 `test/**` **3050/3044/4/2**（2 skip 为 Windows 平台条件），4 红经 `git archive HEAD`（6d40eee）干净基线复跑**同样复现**，逐一归因 HEAD 既有提交（runtime-ui localStorage→`923206f`；u1-renderer→`be3ab2c`；g-desktop→`6d40eee`；t29→`b64d619`/`6d40eee`），本批新增红 0；typecheck 0。残余风险登记：shell 副作用不受文件写门禁约束、审批链是唯一控制（su 卡已披露「可能写到项目外」，五张内置卡未逐字含该升级披露）、allow 白名单免审批、审计 best-effort 不翻转判定。详见[独立复核记录](docs/fix/2026-10-19_verify_all-roles-shell-approval.md)。未 commit/push。

- 2026-10-19：**工程质量基线 + 架构要求等六批在途改动全仓独立复核**。全仓 `test/**` **3064/3058/4/2**（上一批 3050/3044/4/2；+14 tests/+14 pass，fail/skip 不变，本批新增红 0）；4 红（runtime-ui:65、u1-renderer:96、g-desktop:65、t29:273）经 `git archive HEAD`（6d40eee）干净基线复跑**失败签名逐字相同**，逐一归因 HEAD 既有提交（923206f / be3ab2c / ff6dcbf·6d40eee），均非本批行为变更，未改夹具/断言；本批定向套件 **189/189**；typecheck 0。跨角色只读核对：基线两副本逐字一致（各 11 行 `identical:true`）；五卡均含质量基线+架构职责+审批档行+质量职责段；编排 single/su 三分支与 trio 均含质量/架构要求；桌面验收任务①-⑤齐备；五角色审批档在能力矩阵/编排装配/桌面接线三处一致；README 基线 10/10 非架构条目逐字一致，架构条为独立概述**非逐字**（登记，未修改）。残余风险：四红待属主另批同步、架构门槛依赖 judge rubric 非机械匹配、真实启动演示不可机械核验、架构模块↔写区无机械检查、shell 副作用受审批链唯一控制、工作树多上下文并行。详见[独立复核记录](docs/fix/2026-10-19_verify_quality-architecture-batch.md)。未 commit/push。

- 2026-10-19：**判断证据包 / shell 读取预算新默认 / 审批卡标题签名三批产品改动的测试夹具同步**。跑前真实红：`governance-judge-cards-verify` **43/38/5**（appointment、写盘三卡、acceptance×2、required-read）、`shell-judge-verify` **36/33/3**（预算、截断、deny 合成文案）、`su-shell-approval-verify` **36/35/1**（D4 旧单参签名）；`governance-e2e-auto` 首跑 30/29/1 为一次性时序抖动（场景 3），随后连续 3 次 30/30。按新契约只改本角色夹具/断言（产品代码零改动、未放宽）：判断卡夹具补逐路径 `## 路径`+正文、提名推荐集与 request/账本事实对账、acceptance 补 `customer.decision(proposal-accept)`/`dispatch.accepted` 等真实账本；shell judge 用例显式注入小预算（`{maxCalls:8}` / `{maxFileBytes:64KiB}`）保留「预算/截断 ⇒ manual」语义；deny 合成文案钉点同步为「存在系统风险或无法确认安全」（编排在飞的系统风险定位）；审批卡标题断言同步新签名并加 roleId 取值守卫；e2e `cardFor` 旧式共用正文改为逐路径正文。复跑：judge-cards **43/43**、e2e-auto **30/30**、shell-judge **36/36**、su-shell-approval **36/36**；`test/测试` **782/779/3/0**（3 红＝HEAD 既有 u1-renderer:96、g-desktop:65、t29:273，本批新增红 0）；typecheck **0**。详见[修复记录](docs/fix/2026-10-19_fix_evidence-packet-budget-label-fixtures.md)。未 commit/push。

- 2026-10-19：**shell 风险审查 / 决策 judge 意图漂移 / 自动验收派发整批改动的最终独立复核**。修复前真实态：`governance-judge-cards-verify` **43/33/10**（10 红全为决策组 `intent-missing`：新契约要求意图文件 + 账本 `intent-confirm accepted`）；`governance-e2e-auto` **30/22/2红/6 cancelled**（2a/2b/3/3b/6e/全链路超时挂起——自动代批不再发生，`send` 等待整轮；6a/7c 实得「意图文件不可读」而非各自要测的机械门槛/超时）；首跑全仓在 4 个 e2e 文件无限挂起（>10 分钟、CPU 0），已在 1663 pass/3 fail 处停止。按新契约只改本角色夹具/前置数据、**断言零放宽**：cards-verify 新增 `INTENT_REL`/`intentDoc`，`seedProject` 种意图文件 + 账本 intent-confirm/handoff，`writeLedger`/`clearLedger` 保留意图基线，决策卡假判断 `reads` 补意图路径，坏行场景改为「合法意图行 + 真实坏行」仍测 `ledger-unavailable`；e2e 新增 `seedConfirmedIntent`（意图文件 + 两条账本），场景 2/3/6/7 补前置意图，五角色全链路提案 frontmatter 带 `intentId`（契约兼容定位来源，规避 handoff 账本「先投递后写账本」的时序竞态）。修复后：judge-cards **43/43**、e2e-auto **30/30**、shell-judge + su-shell-approval **72/72**；全仓 `test/**` **3168 / 3162 pass / 4 fail / 2 skip**（4 红＝HEAD 既有 runtime-ui:65、u1-renderer:96、g-desktop:65、t29:273，经 `git archive HEAD`（cd20701）复跑失败签名逐字相同；本批新增红 0）；`test/测试` **782/779/3/0**；typecheck **0**。跨角色遗留：`hand_off_intent` 的 `intent.handed-off` 在投递完成（等待 Rapporteur 整轮）之后才入账，提案无 `intentId` 且意图文件非 `<flowId>.md` 时首张提案卡会误回落手动（客户手答后可恢复，非死锁）——已登记建议编排/桌面评估账本写入时序或意图定位回落。详见[最终复核记录](docs/fix/2026-10-19_verify_judge-scopes-final.md)。未 commit/push。

- 2026-10-19：**shell 判断「manual 即拒绝」最终裁决后的测试断言重写**。客户裁定「审查只有同意和拒绝，不需要我来同意，拒绝要给理由」后，shell 通道对 judge `manual`（unavailable/timeout/parse-failed/read-denied/budget/read-truncated/retry-capped/unsupported-engine/context-too-large/model-manual）与 allow 结果行投达失败（row-failed）一律按 deny 处理、不调用 presenter、不弹卡、不发结果行，审计保留 `verdict:"deny"`+`modelVerdict`+原 `reasonCode`+`manualAsDeny`。本角色按新语义重写 `c-manual-flow`（11 条旧例全部保留，新增 allow/deny 正常路径与开关关闭两条对照；逐例钉死精确拒绝理由、0 卡、无新结果行、审计完整 manual 事实——断言未放宽）；同步更新 `u1-renderer` 的系统消息源码钉到新单一来源（`tool-rows.js::classifySystemNotice` / `.sys sys-notice` / `is-system`），新增系统通知分类真实执行用例（通知正文与用户正文分离、近似文本不误伤），保留「来源恒空 ⇒ 无来自 X」与「撤回判据只认 message」原意。复跑：c-manual-flow **13/13**、u1-renderer **6/6**、shell-judge-verify **38/38**、g2-verify **60/60**；`test/测试` **785/783/2/0**（改前 782/768/14；剩余 g-desktop:65、t29:273 为 HEAD 既有红，与本批无关，归桌面UI 属主）；全仓 `test/**` **3174/3169/3/2**（3 红＝runtime-ui:65 别的角色目录 + g-desktop:65 + t29:273；skip 为 Windows 平台条件）；typecheck **0**。产品侧观察（未改）：审计运行时写入的 `manualAsDeny` 未进 `ShellJudgeAudit`/`ShellJudgeAuditRecord` 类型，按类型读取审计的消费方看不到该标记。详见[修复记录](docs/fix/2026-10-19_fix_shell-judge-final-decision-fixtures.md)。未 commit/push。

- 2026-10-19：**runtime-ui「renderer 无任何持久化」断言过期判定（只读核对，未越界修改）**。干净 HEAD（144b803）复现 `test/桌面应用/runtime-ui.test.ts` 单红：**12 计 / 11 过 / 1 红 / exit 1**，失败点第 69 行整文件禁用 `localStorage`；工作树同签名。核实 HEAD 版 renderer 仅有侧栏宽度/收起两项 localStorage（`ans.sidebar.width`/`ans.sidebar.collapsed`，4 处 getItem/setItem），无 `sessionStorage`/`node:fs`/`require("fs")`/动态 `import(`，localStorage 邻域无 `apiKey|token|secret|password|credential`，Pi 配置与审批/判断状态只走 IPC——判定为**契约过期**而非产品回归。该文件属「桌面UI」白名单、按角色卡不得改他角色单元测试，故本角色未改，给出白名单式收紧补丁（对 HEAD/工作树均通过、7 个负向变异全部捕获）交属主落地。验证：桌面应用全量工作树 **633/622/11**（9 红为工作树在途改动、非 HEAD 既有），干净 HEAD **625/623/2**（runtime-ui + interface 收尾推进，均 HEAD 既有）；typecheck **0**。详见[核对记录](docs/fix/2026-10-19_verify_runtime-ui-persistence-contract.md)。未 commit/push。

- 2026-10-19：**收口 `test/测试/**` 5 条红（YAML 迁移夹具 3 条 + HEAD 既有 2 条），未改产品源码**。①`governance-e2e-auto/fixture.ts`：`FLOW_REL` 改 `docs/flows/flow-a.yaml`，`flowDoc()` 生成合法 Flow YAML（flowId/version/qualityTier/steps；每步 id/title/owner/kind/status；done 自动补同 kind evidence：dispatch→ref=stepId、acceptance→ref="acceptance"）；b 两段式文案改「流程状态 YAML」/`docs/flows/flow-a.yaml`，i 分支与提示词断言同步、流程产物改断 YAML `status: done`；c/d 随夹具通过。② `f-acceptance-gate` 实测 YAML-only 验收卡恒 manual（产品证据包 `governance-judge-evidence.ts` 仍用 Markdown `parseFlowSteps`，实测 reason「流程单缺少可解析的步骤表」）——按「不改产品源码」保留旧版 Markdown 人读视图（新增 `flowMarkdownDoc`/`FLOW_MD_REL`）继续验证验收门槛本身，未放宽任何判定，缺口已登记待属主修复后再迁 YAML。③ `g5-reasoning-verify/g-desktop` G3：旧逐字实现断言改为对当前「value=esc(raw choices)、文本=esc(choiceLabels ?? raw)」的稳定结构断言，语义保留。④ `t29-pi-config-roundtrip` G-5：错误文案已本地化（`runtime-config.ts` 用注册表 `choiceLabels`，校验仍按 raw choices），断言改为从 `RUNTIME_SETTINGS.pi` 同源拼期望文案，并加断言 choices 仍逐字英文值域；不回显提交值原文/不落盘断言保留。验证：`test/测试` **785/785**、全仓 **3239/3237/0 红/2 skip**、typecheck **0**。详见[修复记录](docs/fix/2026-10-19_fix_governance-e2e-yaml-fixtures-and-head-reds.md)。未 commit/push。

- 2026-10-19：**验收证据包 YAML 缺口修复后，f-acceptance-gate 迁回 YAML-only**。删除临时兜底 `flowMarkdownDoc()`/`FLOW_MD_REL`；7 个场景全部写 `docs/flows/flow-a.yaml`（6e 断言同目录无同名 `.md`），负向仍 manual、门槛未放宽；6e 新增守卫（`reasonCode=="sufficient"` 且 reason 不含旧「缺少可解析的步骤表」）；新增 6f：非法 YAML（done 缺 evidence）⇒ 手动且 judgeNotice 含具体 `flow-a.yaml` + `steps[0].evidence` +「必须提供 evidence」，不出现旧 Markdown 缺口文案。验证：`test/测试/governance-e2e-auto` **31/31**、`test/测试` **786/786**、全仓 **3243/3241/0 红/2 skip**、typecheck **0**。详见[修复记录](docs/fix/2026-10-19_fix_governance-e2e-yaml-fixtures-and-head-reds.md)。未 commit/push。

- 2026-10-19：**judge manual/deny 自动退回语义落地（17 红更新 16 条，1 条疑似产品 bug 如实上报）**。按客户总原则：开关开启且 judge 实际运行后，manual/deny 不呈现客户卡、不发 approve 结果行、不写 `customer.decision`，直接 `declined{operatorId:"judge:<engine>", reason}` 回投发起角色并给出「自动审批/决策未通过：原因。请修正后重新提交确认」；switch-off 例外保留原卡+judgeNotice，aborted 保持丢弃。更新：a 场景1b、e 5f、g 7b/7c、f 6a–6d/6f、c-fallback 4 条、d-audit 2 条、e-queue replay 1 条（declined 已结算不重放）。**未解 1 红**：c 场景3 实测 Convener 收到 2 条排程任务、账本 2 条 app→convener dispatch.accepted——疑似既有 appointment followUp 与新增「写卡后推进检查」互不感知的去重 bug，按要求保留「恰一次」断言不放宽并上报。验证：judge-cards **43/43**、e2e-auto **30/31**、`test/测试` **785/786**、typecheck **0**。详见[修复记录](docs/fix/2026-10-19_fix_judge-manual-auto-decline-semantics.md)。未 commit/push。

- 2026-10-19：**写卡后 Convener 去重修复复验——17/17 全绿**。桌面属主让既有 appointment 链路与「写卡后推进检查」共用同一 `project+flow+convener` 运行期去重键（先占位/失败释放），去重命中时仍返回 `followUpRoleId:"convener"`；强断言「Convener 恰一次」未放宽。复验：c 场景3 连续 5 次通过、e2e-auto 连续 3 次 **31/31**、`test/测试` **786/786**（产品稳定快照 interface.ts `6e08d228…`）、typecheck **0**。复验中曾见一次 `waitForRoleIdle` 竞态（属主修复中间态），最终稳定快照不复现。详见[修复记录](docs/fix/2026-10-19_fix_judge-manual-auto-decline-semantics.md)。未 commit/push。

- 2026-10-20：**E2E 链式轮询短时限修复测试文件挂起 + artifact 观察缺口只读复现**。桌面链式推进改为有界轮询目标事实（缺省 500ms/15min）后，b/c 两文件单场景通过但文件被真实定时器拖住约 485s；本角色在 `fixture.ts` 注入 `governanceChainOptions {pollIntervalMs:10, timeoutMs:3000, settledGraceMs:10}`（可按场景覆盖），两文件恢复 **0–1s、2/2 全绿**，强断言未放宽。验证：`test/测试` **786/786（17s）**、全仓 **3268/3266/0 红/2 skip（30s）**、typecheck **0**。只读探针复现产品缺口：verifier 写入 `docs/verification/probe-v1.md` 产生 `artifact.observed`，写入 `test/evidence/probe/verification-v1.md` **不产生**（扫描仅覆盖内置角色 `preauthorizedDirs`）；含 `verification-evidence(done, artifact, ref=test/...)` 的流程收尾门如实报 `账本缺少 artifact.observed`；`nomination(done, kind dispatch)` 报 `缺少 dispatch.accepted stepId=nomination`（建议流程作者用 `customer-decision`/`appointment` 证据）。缺口已上报，未改产品；探针已删除。详见[修复记录](docs/fix/2026-10-20_fix_e2e-chain-polling-and-artifact-observation-gap.md)。未 commit/push。

- 2026-10-20：**Liaison 工作流管理者能力矩阵更新**。客户拍板 Lead/主理 兼任工作流管理者后，`a-roles-writes-caps` 能力矩阵用例更新：Liaison `dispatchTask` 为函数（语义：协调 Steward/项目角色，**不是客户批准**）、`flowGet`/`flowStepUpdate`/`flowStepSupersede` 均注入；Rapporteur/Nominator/Convener/Verifier 在原有能力断言之上补同一 flow 三工具断言；注册表 `spec.capabilities.dispatchTask` 更新为 `true`；角色卡补「工作流管理者/派发·推进 ≠ 客户批准/不改变写边界」文本断言。其余矩阵与 su/single 断言未放宽、未改产品源码。验证：该文件 **8/8**、`test/测试` **786/786（18s）**、全仓 **3306/3304/0 红/2 skip（36s）**、typecheck **0**。详见[修复记录](docs/fix/2026-10-20_fix_liaison-workflow-manager-capabilities.md)。未 commit/push。

- 2026-10-20：**intent-confirm 纳入 decision 组的测试同步**。客户「勾了替我决策就不用我管」后，需求确认卡在 decision 开关开启时由判断代批 confirm。更新：e2e 夹具 `approveReport` 增 `intent-confirm` 分支（`selected:["confirm"]`）；i-full-chain 的 Lead 需求确认改为判断代批（0 客户卡、judge 结果行、账本 `intent-confirm accepted` + judge 证据），最终界面断言 0 手动卡；j-intent-confirm 重构为 4 条矩阵：decision 开 ⇒ 代批 0 卡；decision 关 ⇒ 客户手答 1 卡（confirm 放行 / revise 拒绝交接）；decision 开 + 缺 confirm 选项 ⇒ manual 自动退回 0 卡、hand_off 被拒。其余 intent-confirm 旧断言（种子/展示）不受影响。验证：`test/测试` **788/788（17s）**、全仓 **3310/3308/0 红/2 skip（33s）**、typecheck **0**。详见[修复记录](docs/fix/2026-10-20_fix_intent-confirm-decision-group.md)。未 commit/push。

- 2026-10-20：**Crew 写卡确定性门控 E2E（新增 7 条）**。新增 `governance-e2e-auto/l-crew-write-validation.test.ts`：正常写卡（role-card 有标题 + boundary 合法）⇒ 校验通过、Convener 恰一次、账本恰一条；5 种失败（缺 role-card / 缺 boundary / 空 role-card / boundary 混入 Markdown / role 与目录不一致）⇒ 不派 Convener、Crew 收到含具体路径/错误的修正任务、0 客户卡、重复 settle 不刷屏（问题哈希去重，修正任务与 Lead 系统行各恰 1 条）；Crew 修正后重新写卡 ⇒ 通过并继续派 Convener 恰一次。坏文件用直接写盘模拟（write_file 的写前格式校验会拒绝非法 boundary，门控须拦任何来源）。验证：该文件 **7/7**、`test/测试` **795/795（17s）**、全仓 **3319/3317/0 红/2 skip（32s）**、typecheck **0**（interface.ts 运行期哈希稳定）。详见[修复记录](docs/fix/2026-10-20_fix_crew-write-validation-e2e.md)。未 commit/push。

- 2026-10-20：**Lead 内部 choice 不得呈现客户的 E2E（新增 4 条）**。客户要求通用工程/协调 choice（不含 confirm）不许打扰客户。新增 `governance-e2e-auto/m-lead-internal-choice.test.ts`：①通用 choice（keep-v1/do-v2/lead-decide，无 confirm/cardKind）⇒ 0 客户卡、declined + 「自行决定/派 Steward·项目角色/flow_step_update」指导、无 customer.decision；Lead 随后 `flow_get` 成功、`dispatch_task`→Convener 门禁放行并入账（actor=liaison）；②显式 intent-confirm 缺 confirm ⇒ 判断前 declined（0 卡、无账本）；③含 confirm 的 intent-confirm 旧路径：decision 开代批（judge 证据）/关客户手答（customer-input 证据）。夹具补透传 flow 三工具（否则工具未注册假阴性）；j 的缺 confirm 负例同步为判断前拒绝。验证：m 文件 **4/4**、j **4/4**、`test/测试` **799/799（17s）**、全仓 **3325/3323/0 红/2 skip（31s）**、typecheck **0**。详见[修复记录](docs/fix/2026-10-20_fix_lead-internal-choice-e2e.md)。未 commit/push。

- 2026-10-20：**v1.4.0 三平台发布独立验收通过**。冻结源 tag `v1.4.0`=`83eec7e`（peel 复核，tag 未移动），overlay=`879eddd`（12 路径，excluded 18）。12 资产齐备；3 ZIP + overlay.patch + release-provenance.json 的 SHA256 在 `SHA256SUMS-*.txt`、GitHub asset digest、manifest `artifact.sha256` 三方逐项一致；本地按 release-policy 复算 12/18 选择与 provenance 逐字一致；本地重生成 overlay.patch 与发布件字节相同（sha256 `2f6d6f76…`）；以发布 patch 应用到 `83eec7e` 临时 worktree 复算 `actualTree=07d210e…`；三平台 manifest 与 provenance 的来源字段规范化后四者同哈希，`smoke.ok=true`、7 项 checks 全 true、`process.code=0`、`lockSha256` 与本地 `package-lock.json` 一致；未登录发布页与 `SHA256SUMS-overlay.txt`、mac-arm64.zip 直链均 200。边界：未在本机下载/启动 ZIP，三平台实际启动证据由 CI 原生 runner smoke 承担；残余风险为未签名/未公证（Gatekeeper/SmartScreen）与 Windows 无实机验证。详见[发布验收](docs/change/2026-10-20_change_v1.4-release-verification.md)。未 commit/push。
