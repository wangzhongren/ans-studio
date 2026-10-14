---
id: desktop-ui-virtual-row-anchor-drift-fix
type: fix
title: 虚拟行记账与真实布局同口径：开合「执行记录组」的阅读锚点漂移修复
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-uiux-design-alignment, test-uiux-design-alignment-regression-results, desktop-uiux-reacceptance]
events:
  - date: "2026-10-14"
    kind: created
    summary: 按测试角色独立回归上报的锚点漂移（确定性、两档一致、逐轮累积）复现并定位根因
  - date: "2026-10-14"
    kind: implemented
    summary: 行模型 `rec.h` 口径改为「真实行高（rect，小数）+ pane 行距」（rowFootprint 六处统一）；定向 62/0、uiux-v2 78（含新增开合漂移断言、A/B 自证）、双档设计测量、IME、bench 对照全过；独立复测待测试角色
  - date: "2026-10-14"
    kind: implemented
    summary: 追加（PM 转来 U1_WINDOWED 偶发定性）：main.mjs 两侧各 17 轮 U1 全 true、直接 A/B 0/16 vs 0/16——判非本次回归（登记不改该行为）；同轮修前行距缓存的「脱离文档读不到样式表却落 0」缺陷（isConnected 才缓存），新增 e2e 口径不变量断言（缺陷副本必红）+ 源码守卫；新指纹见 §6
---

# 换了皮之后：开合执行记录组，组前正文会一格一格往下滑

测试角色对「按设计对齐」候选（UI/UX v2 换皮）的独立离线回归发现一处**真实回归**：长会话（虚拟窗口）里反复收起/展开「查看执行记录」大组，组前正文的阅读锚点逐轮漂移、约 5 轮后顶部换行。本记录：复现 → 根因 → 修法 → 不回退复核与证据。

## 1. 现象与证据引用（A/B）

测试角色报告（`角色卡/测试/docs/change/2026-10-14_change_uiux-design-alignment-regression.md`，只读引用）与最小复现 `test/测试/uiux-anchor-drift-probe.mjs`（只读，未改）：同一夹具只换渲染层——

| 观测 | 旧候选（HEAD 7457da4） | 对齐候选（修前） |
| --- | --- | --- |
| 收起一次 / 展开一次漂移 | −0.65625px / 0 | **+1.0625px / +0.9375px** |
| 4 轮开合 | 逐轮完全重复、无累积 | 每轮净 **+2px** 累积 |
| 阅读文本身份 | 保持 | 保持（不串行、不丢数据） |

本角色复核：以报告的同夹具在 1360×860 复现一致（逐轮 1.0625/0.9375、确定性），960×620 在我方 e2e 夹具上同样复现（见 §4 的 A/B 自证）。

**两处校准（不影响结论）**：

1. 报告中的「第 3 轮收起跳位 68.125px」是**探测脚本的观测伪影**：脚本取「首个可见行」（bottom>顶边），锚点行缓慢下移约 5px 后行 177 的底边越过聊天顶边，读数从行 178（offset +15.25）切换到行 177（其 rect.top 在聊天顶上方 52.875，即行 178 的 offset 实为 +16.31）。同一行实际位移仍是 ~+1px/次；用户可见症状是「正文缓慢下移、约五下后顶部多露出一行」，不是一次 68px 跳变。
2. 漂移**在虚拟窗口边界与二次归位之间产生**，与面板宽度档无关（1360/960 逐位一致）——两档同几何比值。

## 2. 根因（具体代码位置与机制）

### 口径错位

`#chat` 与 `.chat-pane` 均为 `display:flex; flex-direction:column; gap:16px`（styles.css）。pane 内每**相邻两个行元素之间**有 16px 行距（flex gap 不计入 `offsetHeight`）。因此一行的**完整布局占位 = 真实行高（rect，含小数，如 53.1875）+ 16**。

修前行模型 `rec.h` 统一取 `el.offsetHeight`——既**取整**（53.1875→53）又**不含行距**。而上下 spacer 的记账（`rebuildPrefix` 的 `sums`、`updateVirtualWindow` 的 `rl.top/bottom.style.height`）正是按 `rec.h` 求和。**spacer 记账与真实布局不是同一口径**。

### 位移的量级与去向

窗口为 [first..last] 时，锚点行 i 的内容坐标

```
C(i, f) = sums[f] + 16 + Σ_{f≤j<i} (real_j + 16)     （f = first，实测逐位吻合）
```

把一行 f 折进上 spacer（f→f+1）时，其下方所有内容位移 `h_f − real_f − 16` ≈ **−16.19px（行距量级，不是亚像素）**。开合一次会触发 4–6 次窗口更新（`refreshActivityHeight → updateVirtualWindow`；`restoreChatReading` 内 `preferIndex` 与收尾各一次；滚动事件经 rAF 再 1–3 次），每次挂/脱都按上式移动锚点；Chromium 的**滚动锚定**会按它自己选定的锚节点补偿 `scrollTop`（补偿落点被取整），而 `restoreChatReading` 的小数校正（`chat.scrollTop += rectOffset − saved.offset`）之后的收尾窗口更新又会改变构成——多股力量互相覆盖后剩一个**恒向的亚像素残差**，在 14px/1.9 的新几何（行高 53.1875、组高 2487.3125——小数相位变了）下每轮净 +2px；旧几何（13.5px/1.65）下残差方向恰好相互抵消（旧候选逐轮重复、无累积）。

`restoreChatReading` 的校正本身没错——错在**它校准之后锚点的内容坐标还会被后续窗口更新移动**；根因是记账口径，修口径后锚点坐标与窗口构成无关，链条中每一股力量都不再产生位移（下文验证）。

### 指认位置（`app/renderer/renderer.js`，修前）

| # | 位置 | 修前 |
| --- | --- | --- |
| 1 | `detachRow`（先量后摘） | `rec.h = rec.el.offsetHeight` |
| 2 | `updateVirtualWindow` 首次全量实测 | `ra.h = ra.el.offsetHeight` |
| 3 | `updateVirtualWindow` 新挂载行实测 | `newly[k].h = newly[k].el.offsetHeight` |
| 4 | `refreshActivityHeight`（记录组开合） | `rec.h = rec.el.offsetHeight` |
| 5 | `scrollToOperatorCard`（卡定位先实体化） | `rec.h = rec.el.offsetHeight` |
| 6 | `upgradeStreamingMarkdown`（流式升级重测） | `touched[j].h = touched[j].el.offsetHeight` |
| 7 | `registerRow`（估算高入表） | `h: estH`（不含行距，与实测异口径） |

## 3. 修法（行占位口径 = 真实布局占位）

- 新增两个内部助手（renderer.js，Q-2 行模型段）：
  - `paneRowGap(rl)`：读 pane 计算样式 `rowGap`（per 行表缓存；**不硬编码 16**，媒体查询/样式演进自动跟随）；
  - `rowFootprint(rl, el)`：`el.getBoundingClientRect().height + paneRowGap(rl)`——真实行高**保留小数**，不取整。
- 上表 1–6 六处实测统一改为 `rowFootprint`；`registerRow` 的 `estH` 入表时补 `paneRowGap(rl)`（估算与实测同口径）。
- 不变量（修后实测逐位成立）：`C(i) = sums[i] + 16`，**与窗口构成 (first,last) 无关**；pane 总高 `Σreal + 16(N+1)` 亦与构成无关 ⇒ 窗口更新不再移动任何行，滚动锚定无事可做，`restoreChatReading` 的校正成为最终落点。
- 不触碰：spacer 两行公式、`preferIndex/preferTail/VIRT_BUFFER` 语义、`restoreChatReading` 结构、任何 CSS/HTML。

## 4. 设计对齐不回退（复核）

样式与骨架文件**一字未动**（指纹见 §6）；渲染侧测量夹具两档实测复核（`uiux-design-audit.mjs`，数字与[归档对齐记录](../../桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md)一致）：

| 设计值 | 实测（1360 / 960） | 值 | 实测（1360 / 960） |
| --- | --- | --- | --- |
| 聊天头高 | 66.0 / 66.0（padding 16/26/11、960 档 14/24/13） | 助手正文 | 14px / line-height 26.6px（1.9） |
| composer 区高 | 100 / 100（padding 20/28/22、960 档 20/24/22） | 用户气泡 | 底 #F0F2ED、圆角 14 14 3、45.09px 高 |
| 输入胶囊高 | 52 / 52（圆角 30、底 #FAFBF9） | 记录组 | 左 2px 细线 + 13px 缩进、12px、「›」箭头 |
| 会话列 | 760 居中（x=431）/ 960 档铺满 630 | 标题栏/左栏/抽屉 | 36 / 272 / 360（top 36、避让 composer） |

行为语义（R1–R5、IME、撤回、未决、停止保队列、图片草稿）由 `uiux-v2.mjs` 78 项与 `ime-enter.mjs` 全过覆盖（§5），判据未放宽、断言未改。

## 5. 自测命令与结果（2026-10-14，渲染侧本角色执行）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测 | `node --test test/桌面应用/{session-history,tool-rows,renderer,hot-path,markdown}.test.ts` | **62 pass / 0 fail**（renderer 内含新增口径守卫 5 条断言：rowFootprint/不硬编码 gap/无 `.el.offsetHeight` 直取/六处统一/估算补行距） |
| 类型检查 | `npm run typecheck` | **0 错**（exit 0） |
| 空白检查 | `git diff --check` | 干净 |
| 界面回归（含新增断言） | `ANS_UIUX_OUTDIR=<out> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` | **UIUX_V2_PASS 82**（§9 追加后口径），两次满跑一致；新增三类断言全过：「activity group toggle reader anchor 960/1360/detached-history」9 次读数全等、**spread 0**（断言 spread<2px，与既有读者锚点口径一致、不编码设计值）；「detached-history pane reads same row gap as attached pane」（§9.2） |
| A/B 自证（新断言确能抓住该回归） | 同一 e2e 与同一夹具、只对「修前行为副本」运行（/private/tmp，非仓库） | 修前 **spread=5.0625 断言失败**（+1.0625/次累积，读数 80.4375→85.5）；修复候选 spread 0 通过 |
| 测试角色最小复现（只读运行；该探针已由其升级为双读数：首可见行 + 固定元素锚） | `ANS_TEST_UIUX_OUTDIR=<out> node_modules/.bin/electron test/测试/uiux-anchor-drift-probe.mjs` | 修复候选：4 轮开合两种读数**同为 11.1875 恒定**、阅读文本身份不变、scrollTop 恒 12382、**零漂移零累积**（修前同夹具 +1.0625/+0.9375 累积） |
| 设计对齐两档测量 | `ANS_UIUX_OUTDIR=<out> node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs` | AUDIT_DONE；§4 关键值与对齐记录一致；无横向溢出 |
| IME 回归 | `ANS_IME_VISIBLE=1 node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs` | E2E_DONE=1（组合/229/鼠标选词/发送钮全过） |
| 热路径基准 | `BENCH_OUT=<out> node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs`（修前/修后各一次，`BENCH_RENDERER_DIR` 指向修前副本对照） | 无回归：stormA maxGap 101.7/101.8ms、stormA_handler 15.4/15.5ms、replay 30.6/24.3ms（测量噪声内） |

诊断过程使用自建仪器副本夹具（/private/tmp，非仓库；trace 了 `updateVirtualWindow/restoreChatReading/refreshActivityHeight` 全链），验证了：内容坐标 `C(i)=sums[i]+16` 逐位成立、窗口构成变化不再移动任何行、修复后每轮 `scrollTop` 完全不动。`test/测试/**` 与 `角色卡/测试/**` 未写、未改；探测器输出目录均在 /private/tmp。

## 6. 新指纹（2026-10-14 修复候选，含 §9 追加修整）

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/renderer.js | 47703d0b35b276e5b84c3b603fcded4dd9ed1fce8e35bf1fcf9330e488800b0d |
| test/桌面应用/e2e/uiux-v2.mjs | 156b73ca3ca82f298d0b03cdbb5e27faea00820afd5659dabaf4f84d0dfe37ce |
| test/桌面应用/renderer.test.ts | df1c195c30a2685a37de5f1228b20d044eac7566485470d209d8476b12b28998 |

未变（与上一冻结一致）：`app/renderer/styles.css` `69b2ea02…`、`index.html` `9b542de1…`、`tool-rows.js` `9ffda4bf…`、`ui-labels.js` `9f344ebf…`、`e2e/uiux-design-audit.mjs` `9a804242…`、`e2e/uiux-prototype-measure.mjs` `36e0b856…`。第一版修复候选（renderer.js `402e49a7…`、uiux-v2 `83b519e6…`、renderer.test.ts `c01163cc…`）已被本轮 §9 追加修整改代（该版全部证据仍按当时候选记录有效；U1 定性数据即以 `402e49a7` 采集）。

## 7. 与归档设计对齐记录的关系

- 归档[按设计对齐记录](../../桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md)（只读）中 `app/renderer/renderer.js` 指纹 `187d6c00…` 因本修复**失效**；其余其内列出的文件指纹均不变（见 §6）。归档内容不改。
- 该记录的**设计取值与实测结论保持有效**：本修复未动视觉与骨架（CSS/HTML 零改动），§4 已在新候选上复测一致。
- 行为语义（R1–R5、IME、撤回、未决、停止、图片）不回退，§5 覆盖。

## 8. 遗留与需要澄清的权衡

1. **scrollTop 整数落点**：`restoreChatReading` 的校正经 `chat.scrollTop` 赋值，落点被取整（修前观测 ±0.375 级残差）。修口径后每轮已无累积；上游（组件高度）若出现新的小数相位，仍可能有 ≤0.5px 的**单次**不完全复位——属滚动条落点量化，非累积漂移。修复候选两档 4 轮开合实测为 0，无需补偿。
2. **S2（原型纵向 margin 交回 PM 事项）口径更新**：行模型现按「行高 + pane 行距」完整占位；流内行的**垂直 margin 仍然禁**（margin 无法入账、会破坏总高）。当前统一 16px gap 表达与设计对齐记录的登记一致，不新增差异。
3. 测试角色最小复现的「首个可见行」读数在锚点越行边界后会切换目标行（§1 校准 1）——其探针现已升级为**双读数**（首可见行 + 固定元素锚），本候选上两者一致恒定；本角色 e2e 亦按固定元素为锚实现（uiux-v2.mjs）。
4. 修复仅限渲染侧；本机既有基线红（`pi-config.test.ts` 检出目录名、macOS `/var` 符号链接）与本次无关，未动。

## 9. 追加修整（当日续）：U1_WINDOWED 定性 + 行距缓存加固

### 9.1 U1_WINDOWED_TO_BOTTOM 偶发定性（PM 转来桌面窗口观察：最终候选 402e49a7 上 5 试 1 次 false；修前留档 0/4）

方法（A/B，与锚点回归同款）：

| 侧 | 夹具 | 试次 | false |
| --- | --- | --- | --- |
| 候选 402e49a7 | `main.mjs` 真自检台（只读运行；`ANS_E2E_OUTDIR` + `--user-data-dir` 全隔离，不修改 main.mjs） | **17**（16 批量 + 1 预跑） | **0**（U1_WINDOWED_DIST 全 0） |
| 修前行为副本 | 独立仓库副本（/private/tmp/ans-oldrepo，仅 `app/renderer/renderer.js` 替换为修前行为，其余同构），同一 main.mjs | **17**（16 批量 + 1 冒烟） | **0** |
| 追加修整后最终候选（47703d0b） | 同一 main.mjs（复跑确认缓存加固不影响该路径） | **8** | **0** |
| 候选 402e49a7 | 焦点复现（/private/tmp：窗口化 pane ⇄ 小 pane 往返、切回 900ms 量距底、`session:open` 延迟 30–500ms 抖动；另含同角色重复点击） | 24（+24） | 0（+0） |

直接 A/B 为 **0/16 vs 0/16**；合并全部观测：新侧合计 25 轮（+PM 1/5）**1/30**，旧侧 **0/21**。**结论：无法复现；无证据表明为本次修复引入，判为既有偶发/夹具时序（登记，不改该行为代码）**。排查侧记：该路径贴底为 `scrollBottomForced` 的**无条件** `scrollTop = scrollHeight`（先 `updateVirtualWindow(preferTail)` 再赋值），本次改动不触及该链；「完全不滚」形态的唯一渲染侧来源是换 pane 时 `chat.innerHTML=""` 的清空时点，两侧复跑均未出现。

### 9.2 行距缓存加固（排查中发现并修的真实缺陷）

`paneRowGap` 第一版把「读不到」也落缓存：**脱离文档的 pane `getComputedStyle` 读不到样式表（返回空串）**——后台角色事件与 D-1 恢复数据（`session:history` 可先于挂载推达、行表在 pane 未挂载时建成）会在这一步把该行表的行距缓存成 0；该角色挂载后整个 pane 退回「不含行距」的错口径（等价于本修复要消灭的旧口径，只是仅影响该 pane）。

- 微探针实测（Electron，只读）：未连接 `.chat-pane` 的 `getComputedStyle().rowGap` 为 `""`，已连接为 `16px`。
- 修法：`rl.rowGap === null && rl.pane.isConnected` 才读，**命中才缓存**；未读到时返回暂缺省 0（挂载后的实测会以正确行距修正，不再把坏值回写缓存）。`rowModelDebug` 增列 `rowGap`（调试探针，供 e2e 断言口径缓存不变量；字段只增不改，main.mjs 既有消费不受影响）。
- A/B：e2e 新增「detached-history pane reads same row gap as attached pane」（角色 C 的行表建于未挂载期，挂载后其行距缓存须与始终已挂载的 A 相同且 >0）——**缓存缺陷副本上实测失败（C.rowGap=0 vs A.rowGap=16，断言按设计抓住）**；修复候选通过。另设「detached-history」四轮开合漂移断言作路径覆盖（如实登记：该几何下缺陷副本恰好收敛、该条不具区分力）。
- `renderer.test.ts` 增两条源码守卫（`isConnected` 才缓存；暂缺省不污染缓存），定向 62/0 全过。
