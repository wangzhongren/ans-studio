---
id: test-uiux-design-alignment-regression-results
type: change
title: 「按设计对齐」候选独立回归与两版修复复测：三套件全绿
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [desktop-uiux-design-alignment, test-ui-reacceptance-regression-result, test-uiux-v2-offline-regression-results]
events:
  - date: "2026-10-14"
    kind: created
    summary: 对新冻结候选重跑三套受影响回归并做行为零改动核验
  - date: "2026-10-14"
    kind: blocked
    summary: 锚点漂移回归（收起/展开执行记录组：旧0.656px/0、新1.06px/2.0px且逐轮累积、读数跳位）按真实回归上报，套件断言未动保持红，待属主修复后复测
  - date: "2026-10-14"
    kind: verified
    summary: 漂移修复候选（renderer.js 402e49a7）独立复测：主套件119条、回放11/11、锚点14条全跑全过；探针改固定元素读数后 4 轮零漂移；「68.125px 跳位」经实测确认为首可见行读数切换伪影（真实症状 ~1px/轮缓移）
  - date: "2026-10-14"
    kind: verified
    summary: 第二版候选（renderer.js 47703d0b，行距缓存修复）独立复测：三套件全绿；detached-history 独立覆盖（未挂载建行表→挂载后 rowGap=16==实读、双读数零漂移）；U1 抽跑 60/60 到底
---

# 换了皮之后：主流程没变样，长会话里有一个真实的滚动位置瑕疵

「按设计对齐」候选（纯视觉/骨架）在独立离线回归里，**主流程行为逐项不变**——单份说明、队列全文与点击区、异常默认目标、撤回就地回执、未决优先与定位作答、IME 不误发送、回交单一展示、停止保队列、图片/草稿全过。但长会话虚拟滚动的**锚点稳定性出现一处真实回归**：反复收起/展开「查看执行记录」组时，组前正文的阅读位置在旧候选上基本不动（0.656px 内且完全复位），新候选每次开合净漂 ~2px、逐轮累积，第 3 次收起时直接跳位约 68px。该回归**不是设计覆盖值**，套件断言未动、未放宽，保持红并上报，待属主修复后复测。另有一处**测试侧观测竞态**（抽屉关闭是 120ms 动画，与加宽后的未决卡右缘采样点相撞）已按「等动画结束再观测」订正——只加同步与观测，断言零变化。

## 受测候选与环境

HEAD 7457da4（已推送基线）；受测源码为其上 PM 冻结工作树。运行前后指纹一致（见文末证据 `candidate-hashes.txt` 与各报告内 `startHashes==endHashes`）：

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/renderer.js | 187d6c0073cd910b74d62f52e44c44ed79ba8247e2c0b306bf06971924795908 |
| app/renderer/styles.css | 69b2ea0272361b18cdea29cc9e9fad695afb41ddfc8f3670bbec9ca2824d17f9 |
| app/renderer/index.html | 9b542de1eeb80259310b564193982e873b1127518aef897a99aa1a598e00aac4 |
| app/renderer/tool-rows.js | 9ffda4bfb13c3786b1af5b50ba57a7ccdf1a371d73029433a68491d36c811648（未变） |
| app/renderer/ui-labels.js | 9f344ebffdbc66e6f80fbfce56f6aa93f629f6a3deb8216d37bda2de67e01ca1（未变） |
| app/preload.cjs / app/desktop/session-history.ts | 53fbb3a4… / 94417f7b…（与上轮一致，未变） |

环境：Electron 44.7.0（内置 Node 24.21.0）、终端 Node v24.14.0、macOS 26.6.2/arm64；窗口 hidden、userData 隔离、IPC 全受控内存假数据；只写 `test/测试/**` 与 `角色卡/测试/**`。

## 结果分列

| 套件 | 结果 | 备注 |
| --- | --- | --- |
| 主套件 `ui-reacceptance-renderer-regression.mjs` | **通过**：119 条记录 = 99 断言 + 12 条实际 Tab 行 + 8 条抽屉动画等待行；exit 0；consoleErrors 空；两次满跑一致 | 脚本本身上轮 4071945e→本轮 124d05f4（测试侧订正，见下节；断言值零变化） |
| 回放 `uiux-v2-replay-regression.test.ts` | **通过**：11/11，0 skip，exit 0 | 脚本未变（4f589443）；tool-rows/ui-labels 未变，本轮按新指纹重绑并重跑 |
| 锚点 `uiux-v2-renderer-regression.mjs` | **失败**：13 条断言 12 过 1 红（'expand preserves preceding visible paragraph offset'：Δ=2.0px ≮ 2px）；fail-fast 使其余 8 条未跑 | 脚本未变（cbb32179）；探测脚本另证其余全过（见「真实回归」）；**真实回归** |

实际命令（均本角色独立执行）：
- `node --check test/测试/ui-reacceptance-renderer-regression.mjs` → exit 0。
- `node --test test/测试/uiux-v2-replay-regression.test.ts` → exit 0（11/11），输出存 `replay-output.txt`。
- `ANS_TEST_UI_REACCEPTANCE_OUTDIR=<out> node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs` → exit 0（119 条；首跑为 `INDEPENDENT_REACCEPTANCE_FAIL 102`，即下述竞态，存 `renderer-presettle-race-fail.json`）。
- `ANS_TEST_UIUX_OUTDIR=<out> node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` → exit 1（6 条后止步于上述红）。
- 漂移最小复现 `uiux-anchor-drift-probe.mjs` 与全域探测 `uiux-anchor-probe.mjs`（新，见文末）→ 各自 exit 0，报告存证据目录。

## 重基线判定：本轮零处重基线

按「只允许在设计明确覆盖处重基线」逐条核对三套脚本：**没有任何断言编码过设计值**（聊天头 66、composer 100、胶囊 52、760 居中、字号/行高/颜色、记录行时间列都不在内）。现有几何断言要么是**设计无关不变量**——相对漂移容差（|Δ|<2px）、无横向溢出（scrollWidth==clientWidth）、全文/摘要左缘对齐——要么是 **R2 自己的口径**（动作点击区 ≥28px，V31 已明确保留）与语义计数；设计覆盖值只出现在**观测字段**里，因此无需重基线，也无一处被改动。观测确认（设计→实测）：960 档会话列实测 630px（卡盒 296→926），与属主记录的「960 档铺满 630」及原型 `.conversation{max-width:760px}` 一致；记录行/未决卡/异常卡等结构断言在 119 条内全过，行为语义（R1–R5）无一变化。

## 测试侧订正：抽屉关闭动画与曝光断言竞态（断言零变化）

首跑在第 102 条 'R5 choice title preview options and all actions exposed 960 card' 失败。诊断（`drawer-close-race-diagnose.json`）显示：定位激活后 80ms 观测时，抽屉 `visibility` 仍可见、`clip-path` 收至约 85–94%——**既有的** 120ms 关闭动画（`#right-drawer` 的 clip-path/可见性过渡，本候选仅改了底色/边色，动画为上下文未变行）。设计对齐把未决卡从 `max-width:min(680px,92%)` 改为**通栏**（V13/差异清单），卡右缘采样点（x≈908@960、x≈907 为预览行）落进动画中的抽屉可见残条区间（clip≥85.6% 时残条起点 908.2）——**卡片本身没问题，是观测时刻撞上了收拢残条**：延后 400ms 复测整卡全部可命中；且一份只加观测与等待（断言、容差零变化）的诊断副本在同一候选上满跑 119 条通过。订正（只写 `test/测试/`）：新增 `drawerSettled()`，在**两处**「定位后整卡曝光」断言前等待抽屉 `visibility:hidden`（超时也照原断言按真实状态判定，fail-closed）；两处断言本体与其它断言一字未改；顺带在两条曝光断言的观测里补记 `inert/rightTab/drawerVisibility`，便于以后自诊断。等待证据在两次满跑报告里：choice 两档均 waits=3（约 60ms 残量），confirm 两档 waits=0——证明竞态真实存在且已被确定性消除。

## 真实回归：执行记录组开/合的阅读锚点漂移（交 PM 安排属主修复）

现象（两档同、确定性、非偶发）：长会话（218 行、虚拟化）里把「查看执行记录」大组（46 条活动）反复收起/展开——

| 观测 | 旧候选（HEAD 7457da4，A/B 同夹具） | 新候选（按设计对齐） |
| --- | --- | --- |
| 收起一次漂移 | −0.65625px | +1.0625px |
| 展开一次漂移 | 0（完全复位） | +0.9375px |
| 4 轮开合后 | 逐轮完全重复，无累积 | 每轮净 +2px 累积；第 3 轮收起后锚点跳位 68.125px（首可见行 offset +15.25→−52.875），随后停在新位置 |
| 阅读文本身份 | 保持 | 保持（未串行） |

> 订正（2026-10-14 复测实测，见文末「修复候选复测」）：表中 **68.125px 跳位读数**为探针「首个可见行」在累计漂移约一格后**切换目标行**所致的观测伪影；固定元素读数下无跳变、真实症状为 ~1px/轮缓慢下移。数字与结论以复测节为准。

A/B 采用同一夹具、同一脚本、只换渲染层（旧候选由 `git show HEAD:` 原样取出到 `/private/tmp` 运行；不改动工作区）：最小复现 `test/测试/uiux-anchor-drift-probe.mjs`，命中报告 `anchor-drift-probe-new/old.json`；全域探测 `test/测试/uiux-anchor-probe.mjs`（交付锚点脚本的可选 APP 诊断副本，仅把两处开合断言改为记录）证明**其余 11 条锚点断言（单组折叠、追加、换身份、前插、已决卡双锚、跨角色未决等）全部通过**——回归被限定在开合漂移这一处。

归因（初判，供属主参考）：本候选 renderer.js 只改呈现（记录行补时间列、去图标、项目名），**锚点机制代码未动**；变化在布局——正文 14px/1.9（26.6px 行高）、记录行更高，行高与组高都是小数（段落 53.1875、组 2487.3125），而虚拟窗口记账用 `offsetHeight` 取整（53、2487）。开合触发 `refreshActivityHeight→updateVirtualWindow→restoreChatReading` 一链；在窗口边界换行与二次归位之间，整数记账与小数布局的偏差在新几何下不再互相抵消，变为每轮 +2px 的系统性漂移，并越过阈值后换锚一档（跳位）。属主可沿「钉住窗口边界行、对比 `rec.h` 与真实 rect、或在 final updateVirtualWindow 后再做一次真实矩形复校」方向查。影响：用户可以看见的「看长记录后反复开合组，文字位置缓慢下移、约三下后跳一段」；不丢数据、不串行。**本角色未改产品代码、未动断言、未放宽容差**；套件保持红，复测待属主修复后由项目管理安排。

## 行为零改动核验（R1–R5 全链）

主套件 99 条断言内全部覆盖且通过：R1 单份说明（两档恰一份、普通问句不造卡）；R2 队列全文/位次/来源/时间/左缘对齐、动作 ≥28px 可命中、Tab/Shift+Tab 实际到达、无横向溢出与截字；R3 五类异常默认目标/原因/exit（含分号命令 exit 2 完整、未记录不冒充、孤立 S1 首行回退）；R4 撤回失败/无返回/throw/迟到跨角色/成功快照五路——在途禁重复 IPC、就地回执、切项目旧 Promise 作废、停止保余队列、阅读锚点相对稳定；R5 未决优先/定位（先收抽屉、整卡曝光、find 全程键盘）、部分遮挡 inert 不可作答、choice 全件可见与仅提交所选、失效恢复真实 busy；另含 IME 组合/229 不发送且草稿附件气泡保持、正常 Enter 单次发送清输入、回交未投递不镜像且投递后一份折叠+一份答复。**唯一不符「语义零变化」的是上面的虚拟行锚点漂移**——其余诸项全过。

## 未跑与限制

- 锚点交付套件 fail-fast，其余 8 条断言在**交付脚本**里未跑（诊断副本全过；诊断性证据，不冒充通过）。
- 全量 `test/**` 与他角色套件（含属主 uiux-v2.mjs 76 项、IME 可见窗、main.mjs 尾段）本角色未重跑；属主自查数据见其记录，验收截图由 PM 统一采集。
- 真实模型/网络/真实队列服务/用户 ANS 操作未跑；无 GUI 截图。受控 throw 产生的 `session:withdraw` 主进程错误日志是夹具必要输入（渲染端如实显示、未吞）。
- 「读位置保持」类断言依赖 2px 容差这一本角色既定口径；本次未放宽，旧候选能过、新候选卡在 2.0——数值本身已逐位复核（11.25→13.25）。

## 证据（`角色卡/测试/docs/change/2026-10-14-uiux-design-alignment-evidence/`）

`renderer-report.json`（主套件满跑 119 条、双指纹一致）、`renderer-presettle-race-fail.json`（首跑 102 条止于竞态）、`drawer-close-race-diagnose.json`（竞态时刻 clip/可见性实测 + 400ms 后复测）、`anchors-report.json`（锚点红）、`anchor-drift-probe-new/old.json`（漂移累积 A/B）、`anchor-coverage-new/old.json`（其余 11 条断言通过 + 开合 Δ 记录 A/B）、`replay-output.txt`、`candidate-hashes.txt`。新增夹具脚本：`test/测试/uiux-anchor-drift-probe.mjs`（最小复现，含旧候选 A/B 运行方法注释）、`test/测试/uiux-anchor-probe.mjs`（诊断副本）。差异清单与实施记录见[桌面实施记录](../../../桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md)（属主角色重组中，按现路径引用）；设计依据 [v2 设计说明](../../../UIUX设计师/docs/design/2026-10-13_design_ans-uiux-interaction-v1.md) / [v2 原型](../../../UIUX设计师/docs/design/2026-10-13_design_ans-uiux-prototype-v1.html)。受测入口为[桌面会话](../../../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)。

## 修复候选复测（当日追加）

漂移修复候选：`app/renderer/renderer.js` **402e49a73ad65bb220b30ff8d57623ff38e7fa3d8aa982abb199b07f120cc938**；`styles.css 69b2ea02…`、`index.html 9b542de1…`、`tool-rows 9ffda4bf…`、`ui-labels 9f344ebf…`、`preload 53fbb3a4…`、`session-history 94417f7b…` 与上轮冻结一致（未变）。修复摘要（属主提供，供核对，结论以本复测为准）：根因＝行模型 `rec.h` 用 `offsetHeight`（取整、不含 pane 的 16px flex 行距）与真实布局占位（rect 高＋行距、含小数）口径错位；修法＝新增 `rowFootprint`（rect 高＋实读行距、保留小数）统一六处实测/估算入表；CSS/HTML 一字未动。

| 项 | 命令（本角色独立执行） | 结果 |
| --- | --- | --- |
| 主套件 | `ANS_TEST_UI_REACCEPTANCE_OUTDIR=… node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs` | **119 条满跑通过，exit 0**；consoleErrors 空；报告内 startHashes==endHashes（renderer.js=402e49a7…）；与上轮 119 全过一致 |
| 回放 | `node --test test/测试/uiux-v2-replay-regression.test.ts` | **11/11，0 skip，exit 0** |
| 锚点 | `ANS_TEST_UIUX_OUTDIR=… node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` | **14 条全跑全过，exit 0**——上轮红的 'expand preserves preceding visible paragraph offset' **转绿**（收起/展开 before=after=11.1875，零漂移）；fail-fast 之后的 8 条**实际跑到**且逐项通过（单组折叠/追加/换身份/前插/已决卡双锚/跨角色未决/三条失败摘要，见 `anchors-report.json`） |
| 漂移探针 | `ANS_TEST_UIUX_OUTDIR=… node_modules/.bin/electron test/测试/uiux-anchor-drift-probe.mjs` | 固定元素读数 4 轮开合**恒定 11.1875**、scrollTop 恒定 12382（旧候选 HEAD 臂同脚本：−0.65625/0，与上轮一致） |

与上轮的差异：①**开合漂移消除**（+1.0625/+0.9375px 与逐轮累积 → 0/0/0）；②其余观察**逐项不变**：主套件 119 条内 R1–R5、IME、回交、停止、图片/草稿全过，锚点其余项全过（个别绝对读数因行记账修正有 <0.5px 级落点差，如追加组子行 −8.25→−8.3125、前插段 −44.9375→−45.34375，均 before/after 一致且在原容差内）；③「68.125px 跳位」订正**经实测**：探针升级双读数后，在保留修前行为的中间副本上（`renderer.js fba0f1de…`，**非冻结指纹**，仅机制核对——本场景读数与冻结修前候选逐位一致：11.25/12.3125/…/15.25、scrollTop 9938→9932）——**固定元素**读数平滑 ~+1px/轮（11.25→16.3125，无跳变），**首个可见行**读数第 5 次开合起读作 −52.875，恰为 16.3125 − 69.1875（69.1875 = 行高 53.1875 ＋ pane 16px 行距，均实测）；即旧探针的 68.125 = 69.1875 − 1.0625——**读数切换目标行，非真实重排位**；真实症状为 ~1px/轮缓移、约 5 次开合后顶部多露一行（与桌面UI复核一致，本条以本角色复测为准）。探针已按建议改为**固定元素读数**（v2，两读数并列记录）。

未跑/限制：与上轮同（全量/他角色套件、真实模型/网络/业务未跑；本轮无 GUI 截图）。证据：`角色卡/测试/docs/change/2026-10-14-driftfix-recheck-evidence/`（`renderer-report.json`、`anchors-report.json`、`replay-output.txt`、`drift-probe-fix.json`、`drift-probe-oldhead.json`、`drift-probe-intermediate-mechanism.json`、`candidate-hashes.txt`——全部运行结束后复核指纹与运行前一致）。本区段只写 `test/测试/**` 与 `角色卡/测试/**`；未改产品代码、未 commit。

## 第二版候选复测（当日再追加：行距缓存修复）

候选：`app/renderer/renderer.js` **47703d0b35b276e5b84c3b603fcded4dd9ed1fce8e35bf1fcf9330e488800b0d**（取代 402e49a7）；`styles 69b2ea02…`、`index 9b542de1…`、`tool-rows 9ffda4bf…`、`ui-labels 9f344ebf…`、`preload/session-history` 与上轮冻结一致。属主摘要（供核对，结论以本复测为准）：U1 定性排查发现**行距缓存缺陷**——脱离文档的 pane 首次读行距得到空串被当 0 缓存，后台早到事件/恢复路径（行表在挂载前建成）会让该 pane 退回「不含行距」的旧错口径；修法＝**仅挂载时读、命中才缓存**；`rowModelDebug` 只增收 `rowGap` 调试字段。

| 项 | 命令（本角色独立执行） | 结果 |
| --- | --- | --- |
| 主套件 | `… node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs` | **119 条满跑通过，exit 0**；consoleErrors 空；startHashes==endHashes（renderer.js=47703d0b…） |
| 回放 | `node --test test/测试/uiux-v2-replay-regression.test.ts` | **11/11，0 skip，exit 0** |
| 锚点 | `… node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` | **14 条全跑全过，exit 0**（收起/展开 before=after=11.1875，与 402e49a7 版同值；其余项同值） |
| 漂移探针（双读数） | `… electron test/测试/uiux-anchor-drift-probe.mjs` | 4 轮恒定 11.1875、scrollTop 恒定 12382 |
| **行距缓存独立覆盖（新写）** | `… electron test/测试/uiux-rowgap-detached-probe.mjs`（三轮 r1–r3） | ①未挂载建行表（181 行、虚拟化）且行距**不落值**（`rowGap:null`，未读不缓存）；②树点点选挂载后 `rowGap===16` **且等于挂载 pane 实读 row-gap（独立真值源 `getComputedStyle`）**、>0；③挂载后 4 轮开合双读数零漂移——组实测确在真切换（`open` 翻转、组高 2487↔36、docH 18625↔16126），锚点/滚动读数恒定不动；④U1 抽跑：两角色深内容、无未决，交替点角色树 **20 次/轮 × 3 轮 = 60 次全部到底（0 miss）**——未出现属主所述既有偶发 |

与上一版（402e49a7）差异：三套件结果逐项一致（含锚点同值）；新增覆盖的 detached-history 路径行为正确。**排障备注（防误读）**：新探针首两轮曾报 +428px 跳变——经查为**本角色夹具缺陷**（50 条后续正文误用消息对象、未过 `parse` 成 ReplayRow，组后为空 → 收起触发既有 scroll 夹紧口径；即上轮「收起末尾大组夹紧」的 documented 约束），与产品无关；修正后三轮确定性通过。旧探针的「68.125px 跳位」订正维持上节结论。

未跑/限制：同前两节（全量/他角色套件、真实模型/网络/业务、GUI 截图未跑）。行距修复的对照限制：本机无 402e49a7 副本可 A/B；独立判据为「修复后行为正确 + 探针能在缓存为 0 时失败」（若 `rowGap` 落 0 缓存，挂载后 `rowGap≠paneGap` 即红）。证据：`角色卡/测试/docs/change/2026-10-14-recheck2-evidence/`（`renderer-report.json`、`anchors-report.json`、`replay-output.txt`、`drift-probe-final2.json`、`rowgap-detached-probe-r1/r2/r3.json`、`candidate-hashes.txt`——运行结束后复核指纹与运行前一致）。本区段只写 `test/测试/**` 与 `角色卡/测试/**`；未改产品代码、未 commit。
