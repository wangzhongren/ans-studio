# 角色资料抽屉打开后中列被挤压、会话头顶部异常 — 修复实施记录

- 日期：2026-11-03
- 角色：桌面UI（渲染前端属主，`app/renderer/`）
- 分支 / 基线：`fix/role-profile-layout`，基线 HEAD `40d94eb`
- 状态：**implemented-unverified**（已实现并完成本角色自测；未独立复核、未提交）

## 1. 客户直修指令与依据

客户原话：「点击角色资料会挤压页面，导致不正常」；补充：「挤压中间区域，中间区域顶部显示不正常」。

缺陷记录：`docs/communication/2026-11-03_bug-role-profile-layout.md`。

依据客户要求：**直接修复，跳过调研/方案/独立复核**。本记录只做最小根因取证（真实 Electron 实测）、最小修复与同口径验证，不改设计、不动无关 UI/文案/主题。

## 2. 根因结论（实测确认，非预设）

触发链：

1. `app/renderer/src/shell/shell.css` 在 `@media (min-width: 1200px)` 下用
   `.app.drawer-open .col-mid { padding-right: var(--drawer-w) }`（424px）推挤中列——这是既有的宽屏设计；
2. 会话头的紧凑/换行规则在 `app/renderer/src/shell/phase4b.css` 的 `@media (max-width: 680px)` 中，只跟随**视口宽度**；
   抽屉打开不改变视口宽度 → 断点不触发；
3. `.session-actions { flex-shrink: 0 }`（固定动作区约 520.28px 宽），`.head-inner` 仍为 `flex-wrap: nowrap`；
   推挤后中列内容盒只剩 688px（1360 窗口）/ 528px（1200 窗口），身份区自然宽约 132px，无法与动作区并排。

实测数值（真实 Electron，独立 userData，离线 fixture：角色 A）：

| 打开角色资料（修复前） | 1360×860 | 1200×800 |
| --- | --- | --- |
| 中列内容盒宽（1112/952 − padding-right 424） | 688 | 528 |
| `.head-inner` clientWidth / scrollWidth | 624 / 624（刚好压线） | 464 / **532（溢出 68px）** |
| `.session-identity` 尺寸 | **91.72 × 57.19**（自然 132 × 40.39，被压窄、上下文换行） | **0 × 208.36（宽度被压到 0，标题/上下文竖排）** |
| `.session-actions` 右缘 vs 抽屉左缘 | 904 vs 936（未越过） | **812.28 vs 776（68px 伸入抽屉下方）** |
| `elementFromPoint(#tab-card 中心)` | `drawer-backdrop` | **`drawer`（角色资料按钮被抽屉盖住）** |
| `.session-head` scrollWidth / clientWidth | 688 / 688 | 564 / 528（头部溢出） |

实际受影响元素：`.chat-head` / `.head-inner` / `.session-identity`（角色名 + 上下文状态）/ `.session-actions`（引擎选择、工作概览、契约变更·重开 run、决策、任务、角色资料按钮）。

结论：**中列被抽屉推挤后，头部仍按宽视口的单行布局塞进窄列**；1200 窗口下身份区被压成 0 宽、动作区溢出到抽屉下方，1360 窗口下身份区被压窄且上下文换行。与初判假设一致，属渲染层 CSS 布局问题，不涉及主进程/公共接口/跨层契约。基线 `40d94eb` 可复现，非本次合并引入。

## 3. 修复方案与最小性说明

纯 CSS，两处：

1. `app/renderer/src/shell/shell.css`：`.col-mid` 增加
   `container-type: inline-size; container-name: col-mid;`
   使会话头可查询「中列实际内容宽度」（已扣除抽屉推挤的 `padding-right`）。
2. `app/renderer/src/shell/phase4b.css`：新增
   `@media (min-width: 1200px) { @container col-mid (max-width: 728px) { … } }`，
   复用现有 ≤680px 视口档的同一套紧凑规则（`head-inner` 换行、身份区/动作区各占整行、动作区右对齐可换行、引擎触发器 `max-width: 100%`）。
   阈值 728px ≈ 动作区 520.28 + 间隙 12 + 身份区自然宽 132 + 两侧 gutter 64。

生效条件：

- 仅在 `.app.drawer-open` 下生效 → **抽屉关闭状态零变化**；
- 仅在 `min-width: 1200px`（抽屉真正推挤中列）时参与 → 960/200% 等窄视口行为不变；
- 不按具体 tab 区分 → 工作概览/设置/文档/决策/任务与角色资料使用同一头部规则，互不产生无关差异。

未触发停止条件：无需改公共接口/跨层契约；根因在渲染层 CSS。

## 4. 改动文件与行数

| 文件 | 行数 |
| --- | --- |
| `app/renderer/src/shell/shell.css` | +4 / -0 |
| `app/renderer/src/shell/phase4b.css` | +25 / -0 |
| `test/桌面UI/**` | 无变化（基线快照 `diff -ruN` 为空） |

合计 **+29 / -0**（`diff.patch`，覆盖 `app/renderer/src` 与 `test/桌面UI`）。无 TSX/接口/IPC/路由/测试文件改动；未新增或跳过任何测试。

## 5. 修复后同口径测量（1360×860 / 1200×800）

| 状态 | 指标 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 1360 closed | headInner client/scroll；identity | 900/900；132 × 40.39 | 900/900；132 × 40.39（一致） |
| 1360 open | headInner client/scroll；identity；headInner 高 | 624/624；91.72 × 57.19；57.19 | 624/624；624 × 40.39（整行）；78.39（两行：身份 + 动作） |
| 1360 open | actions 右缘 vs 抽屉左缘；遮挡 | 904 vs 936；无 | 904 vs 936；无 |
| 1200 closed | headInner client/scroll；identity | 888/888；132 × 40.39 | 888/888；132 × 40.39（一致） |
| 1200 open | headInner client/scroll；identity；headInner 高 | 464/**532**；**0 × 208.36**；208.36 | 464/**464**；464 × 40.39（整行）；112.39（身份 + 动作两行按钮） |
| 1200 open | actions 右缘 vs 抽屉左缘；遮挡 | **812.28 > 776；动作伸入抽屉下，`#tab-card` 被抽屉盖住** | **744 < 776；无遮挡，动作区在抽屉左侧换行** |
| 两档 open | 文档横向滚动 | 无（1360/1200） | 无（`documentElement.scrollWidth == clientWidth`） |
| 两档 open | 其他 tab（工作概览）头部几何 | 与角色资料相同 | 与角色资料相同（无 tab 相关差异） |

- 修复后 1360 open：头部变为两行（身份行 + 动作行），1200 open：身份行 + 动作区两行按钮；无横向滚动、无遮挡。
- 关闭态像素：1200×800 关闭截图修复前/后 **sha256 完全一致**；1360×860 关闭截图仅底部署名/提示行存在 0.2% 像素差异（bbox x489–1239 / y791–816），同代码重复运行产生同样差异（2223 vs 2361 px，同一 bbox），属渲染噪声，头部/中列几何完全一致（原始对比见 `test-logs/closed-state-pixel-diff.log`）。
- 探针运行 0 console / 0 error；独立 userData；未录屏、无 DEBUG 覆盖层。

## 6. 截图与证据路径

证据目录：`角色卡/桌面UI/docs/change/2026-11-03_role-profile-layout-fix-evidence/`

- 探针脚本：`…/probe-layout.mjs`（复用既有 `test/桌面UI/phase4a-smoke-preload.cjs`，未修改既有 smoke）
- 修复前：`…/before/1360x860-closed.png`、`…/before/1360x860-open-card.png`、`…/before/1200x800-closed.png`、`…/before/1200x800-open-card.png`（另含 open-work / reclosed）
- 修复后：`…/after/1360x860-closed.png`、`…/after/1360x860-open-card.png`、`…/after/1200x800-closed.png`、`…/after/1200x800-open-card.png`（另含 open-work / reclosed）
- 修复后头部局部实拍：`…/after/1360x860-open-card-header.png`、`…/after/1200x800-open-card-header.png`
- 原始测量：`…/before/probe-report.json`、`…/after/probe-report.json`、`…/measurements-summary.json`
- 差异补丁：`…/diff.patch`（基线快照 `C:\Users\51054\AppData\Local\Temp\ans-rpl-baseline-40d94eb` + `diff -ruN`）
- 原始测试日志：`…/test-logs/`（见下）

## 7. 测试原始结果

| 命令 | 退出码 | 原始计数/说明 | 日志 |
| --- | --- | --- | --- |
| `npm run typecheck:renderer` | 0 | 无错误输出 | `test-logs/typecheck-renderer.log` |
| `npm run build:renderer` | 0 | `✓ built`（最终重建） | `test-logs/build-renderer-final.log` |
| `node --test "test/桌面UI/**/*.test.ts"` | 0 | tests 402 / pass 402 / fail 0 / cancelled 0 / skipped 0 / todo 0（724.4566ms） | `test-logs/renderer-ui-tests.log` |
| `node --test test/桌面应用/renderer.test.ts` | 1 | `Could not find 'test/桌面应用/renderer.test.ts'`（该基线不存在此文件，命令无测试可跑） | `test-logs/desktop-app-renderer-test.log` |
| `electron test/桌面UI/phase4b-electron-smoke.mjs "" …` | 0 | 69 checks / 0 failures；zero console errors；zero CSP violations；14 张截图 | `test-logs/phase4b-smoke.log`、`phase4b-smoke-out/report.json` |
| `electron test/桌面UI/phase4a-electron-smoke.mjs "" …`（可选回归参考） | 1 | 18 checks / 1 failure：`SMOKE_ABORTED`，renderer console `Uncaught TypeError: Cannot read properties of null (reading 'hidden')`（operator 卡片检查处）。重跑稳定复现；**用基线 CSS 重建后 A/B 同样 18 checks / 1 failure** → 既有失败，与本次改动无关 | `test-logs/phase4a-smoke.log`、`test-logs/phase4a-smoke-baseline-ab/` |

探针运行：`electron …/probe-layout.mjs <outDir>`，修复前/后均 `PROBE_OK`，退出码 0。

## 8. 候选哈希（sha256）

| 文件 | sha256 |
| --- | --- |
| `app/renderer/src/shell/shell.css`（修复后候选） | `6954e3c02f6b0288b0ce561e6314a255dc4b327e0880f1bbcec5ffa878d00c32` |
| `app/renderer/src/shell/phase4b.css`（修复后候选） | `97508bc3e46e7f022e1e425b558f679d41f66e1b6b9f4c96eac0460563ee8a98` |
| 基线 `shell.css` | `a188012d0e0feaedc767de9f348afd03c8f8d26543119750d0236d3c0c3760d8` |
| 基线 `phase4b.css` | `0c05f4d4dc0ab743ba2916a75209fb3fa07dd60fb034ba418d2ab36fcc00fc60` |
| `probe-layout.mjs` | `024d50491e3f0f98873e67ea1b3c48bc5ea46db4b7cc1610e5fc7f662484b2af` |
| `diff.patch` | `012edf6e2301b00efab90f43bc08b35019ce09c73667a0f6b2653b350eccf076` |
| `measurements-summary.json` | `7c5d641af88050f35796a7382d424c24d805a5a5618f808f63b99fde4c1f96fe` |

## 9. 未提交声明

未 commit、未 push、未 merge、未发布。所有改动仅存在于目标工作树
`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\role-profile-layout-fix`（分支 `fix/role-profile-layout`）。
本会话的隔离守卫禁止在该工作树执行 git 操作，故未做任何提交动作。

## 10. 残留风险

1. 阈值 `728px` 由当前动作区实测宽度（520.28px）+ 身份区自然宽（132px）+ 间隙/gutter 推导；若头部动作按钮文案显著变长（新增按钮/i18n 改文案），可能需要重新校准阈值。当前不引入内容自适应脚本，保持纯 CSS。
2. 抽屉打开且中列不足时，头部会切换为紧凑多行布局（1360 两行；1200 动作区两行），这是有意行为，与 200% 窄档一致；若客户期望单行压缩而非换行，需要另行设计（不在本次最小修复范围）。
3. `.col-mid` 新增 `container-type: inline-size` 带来 inline-size containment；已通过关闭态几何对比与截图验证无可见变化（1200 关闭态字节级一致；1360 关闭态仅底部提示行渲染噪声，同码重复运行同样出现）。
4. `phase4a` smoke 的既有失败（operator 卡片 DOM 未出现）不属于本次范围；若后续要把它纳入门禁，需单独修复该 smoke/夹具时序。
5. `test/桌面应用/renderer.test.ts` 在该基线不存在；本次未创建替代测试，也未改动 `test/桌面应用/**`。
