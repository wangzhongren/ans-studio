---
id: split-role-id-test-updates
type: change
title: 拆分落地：桌面测试与自检的样例角色改指「桌面窗口」
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 4 个真实枚举测试 + e2e/main.mjs 的样例角色「桌面应用」改为「桌面窗口」；连带第 5 个冻结转红文件（p0-halt-and-images）
  - date: "2026-10-14"
    kind: verified
    summary: 三个指定单测 42/42 全过；全部边界内单测 206/207（唯一红=pi-config 检出目录名基线）；e2e 与拆分前留档逐段对照，仅预期差异 + 一条被改名揭开的陈旧检查
  - date: "2026-10-14"
    kind: implemented
    summary: PM 跟进——抽屉/队列 6 处 log-only 断言同步至 UIUX v2 现行结构（3 处日志键随语义改名）；e2e 重跑对照无新增差异，仍停既有基线红
  - date: "2026-10-14"
    kind: verified
    summary: 锚点漂移修复候选（renderer 402e49a7…）e2e 重跑 5 次：与两轮对照无内容级新增差异，仍停基线红；唯一例外=首跑 U1_WINDOWED=false 偶发一次（1/5，4 次复跑全真），如实登记交 PM
  - date: "2026-10-14"
    kind: implemented
    summary: 归档收口同步（归档键约定 archived: true——静默跳过、零提示）：project.test.ts 归档断言与记录按新事实更新；三件套 42/42、e2e 复跑内容级零差异、仍停基线红
  - date: "2026-10-14"
    kind: verified
    summary: 两项维护事项（产品评审 + PM 派发）：A——S-1 夹具改生产形状（唯一 turnId）修复诊断基线红，DIAGNOSTICS=true、E2E_DONE=1、mac 尾部恢复；B——5 行 log-only 重锚（2 处改名）+11 头注+4 处注释面改现行角色；连跑 5 次轮间零差异、留档
---

# 拆分落地：桌面测试与自检的样例角色改指「桌面窗口」

## 以前怎样、现在怎样

「桌面应用」角色在 2026-10-14 被拆分为「桌面UI」与「桌面窗口」，旧目录原位冻结为只读归档。**冻结方式当日有一次演进**：上午先以「`boundary.yaml` 改名 `boundary.yaml.frozen` ⇒ 枚举跳过并提示『角色卡/桌面应用：缺少 boundary.yaml，已跳过』」过渡（下文对当时证据的记述保留该版本原貌）；同日按客户决定改为**归档键约定**（门禁引擎 2026-10-14 落地）——`boundary.yaml` 恢复原名、顶层 `archived: true`：枚举**静默跳过**（零提示）、该角色**不可开启**（`resolveRole` 拒绝「角色 X 已归档，不可开启」）、其边界一律**不予采用**（一切写被拒）。两种形态下枚举结果一致：不含「桌面应用」；新角色为「桌面窗口」（主进程/窗口/preload/会话装配，本角色）与「桌面UI」（渲染前端）。

后果：本角色测试与端到端自检里以「桌面应用」为**样例角色**的地方全部失去目标——点树点不到、开会话报「未找到角色」、真实枚举断言失败。这批引用在拆分生效当天就转红，本记录是随拆分同批落地的修复。

**触发场景对比**（跑测试的人）：

- 以前：`node --test test/桌面应用/*.test.ts` 里 5 个文件红（session/operator-channel/project/p0-halt-and-images + 本机既有基线红 pi-config）；e2e 自检点左树「桌面应用」点不到，后续会话步骤连锁失败。
- 现在：样例角色一律改指真实存在的「桌面窗口」；三个指定单测全绿，全部边界内单测除本机基线红外全绿；e2e 自检按「桌面窗口」跑通到既有基线红截至（见下）。

## 位置 → 改动（逐条）

1. `test/桌面应用/session.test.ts`
   - 首测 `firstProjectFilePath`：样例角色改「桌面窗口」；期望值**按新真实边界重新推导**——该角色 Section 1 首个项目根 file 条目是 `app/main.ts`（不再是旧的 `角色卡/桌面应用/feature-map.md`）。
   - 六个真实会话用例（点角色即开 / 重复点击续接 / 未导入项目 / 运行期同意 / T20 回交外推）的 `open(... roleId)` 全改「桌面窗口」；T20 回交夹具与两处断言同步（roleId + 证据路径改 `角色卡/桌面窗口/feature-map.md`，该文件真实存在）。
2. `test/桌面应用/operator-channel.test.ts`
   - L245 真实枚举断言改「本仓库应有「桌面窗口」角色」；L280 真实装配用例的 `open(... roleId)` 改「桌面窗口」。
3. `test/桌面应用/project.test.ts`
   - 角色表断言按新事实重写：应含「桌面窗口」（card/boundary 路径照旧）**与**「桌面UI」（拆分另一半）。归档断言随同日演进更新：初版钉「枚举 warnings 含『缺少 boundary.yaml』跳过提示」；归档键约定落地后改为钉**新事实**——`listing.warnings` 为**空数组**（归档目录静默跳过、零提示）**且**角色表不含「桌面应用」（旧目录不得再被当作活角色；其余断言未放宽，改动后复跑全绿，见「跟进 3」）。
   - su 用例里 `cfg.roles[...]`/`builtInRoles` 两处「桌面应用」改「桌面窗口」。
   - 未动：`posixDirname` 纯字符串样例与 `readRoleDocsIndex` 读归档目录两处（不涉枚举、拆分后仍为真、不转红；如 PM 判定需要一并换新角色夹具再派发）。
4. `test/桌面应用/p0-halt-and-images.test.ts`（**PM 清单外、同因冻结转红的第 5 个文件**）
   - 假夹具角色名改「桌面窗口」；真实枚举用例的 `open(... roleId)`/`abort(...)` 改「桌面窗口」。
5. `test/桌面应用/e2e/main.mjs`（夹具/驱动引用，85 处）
   - roleId 类：慢轮缝钩子 `role.id === "桌面窗口"`、树点击/状态探针的 `textContent.includes('桌面窗口')`、`selectRole('桌面窗口')`、`onRoleState`/`session:event(s)`/`session:history` 注入与 repair 探针的 roleId、假回交夹具的 roleId 与证据路径。
   - **保留 2 处** `test/桌面应用/...`：测试目录名沿用拆分前（逐文件授权），不是角色引用。

## 不改什么

- 不改 `app/**`、`src/**` 任何内容。`src/service/role/resolve-role.ts` 注释里的「供桌面应用」是**产品称谓**（拆分设计 §4.3 已核查），不是角色引用，保持原样。
- 不删断言、不放宽条件：project.test.ts 的改动是「按新事实替换 + 补钉冻结事实」，覆盖面只增不减。
- 其余 17 个主进程侧测试文件头注释里的「桌面应用（T13）…」历史标注未改——它们不参与枚举、不转红；是否统一改名由 PM 视需要再派。
- 不改测试覆盖面与既有检查点语义；e2e 中与界面改造相关的**陈旧断言**未在本批改写（见下「发现」）。

## 怎样确认

命令与结果（本机 macOS / Electron 44.7.0 / Node v24.14.0）：

1. `node --test test/桌面应用/session.test.ts test/桌面应用/operator-channel.test.ts test/桌面应用/project.test.ts` → **42 计 / 42 过 / 0 红**。
2. `node --test test/桌面应用/*.test.ts`（全部边界内单测）→ **207 计 / 206 过 / 1 红**；唯一红是既有基线 `pi-config.test.ts` 的检出目录名断言（`ans-cli` vs 本机 `ans-runtime`），与拆分无关，跑前跑后一致。
3. e2e：`ANS_E2E_OUTDIR=<临时目录> node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → 退出码 0，报告 348 行，停在**既有基线红** `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（E2E_ERROR 截至；拆分前归档报告同点位同红，见 `角色卡/桌面应用/docs/fix/2026-10-13-design-alignment-selfcheck/main-e2e-baseline.txt`）。该点之前的全部 repairCheck 为 true，含 `SESSION_REPAIR_*`、`RECOVERY_*`。
   改名相关检查全真：`ROLE_IDS` 含「桌面窗口、桌面UI」、`CLICKED_DESKTOP_ROLE=true`、`CHAT_HEADER_ROLE=桌面窗口`、`DRAWER_TITLE_CARD=桌面窗口 · 角色资料`、`RIGHT_BOUNDARY_ROWS=34`（新边界 34 条 vs 旧 11 条）、`SOURCE_REPORT_BLOCKED=true`、`STATUS_BADGE_*`/`ROLE_STATE_*` 全真。
4. 与拆分前留档报告逐行对照（把本次报告的 `桌面窗口` 规范化回 `桌面应用` 后 diff）：差异共三类——角色清单（+桌面UI、旧名不再），边界行数 11→34（新边界更细），以及下述一条被改名揭开的陈旧检查；其余 330+ 行（含全部 `=false` 的 log-only 行集合）逐字一致。`P1_ARRIVAL_DEBUG` 一行是几何探针数字（非断言），随内容长度微差。**本次 run 原始报告留档**：[2026-10-14_split-role-id-e2e-report.txt](2026-10-14_split-role-id-e2e-report.txt)。
5. `npm run typecheck` → **整仓 0 错**。

## 发现：一条被改名「揭开」的陈旧检查（**2026-10-14 跟进：已按 PM 派发同步至现行结构，见下节**）

`RIGHT_HAS_TODO_SECTION`/`RIGHT_HAS_OVERVIEW_SECTION` 由 true 变 false（log-only，不阻断运行）。机制：该检查在 `#right-body` 的 **textContent** 里找「待办 / 队列」「队列概览」子串——而抽屉「角色资料」会把**该角色的 changelog/角色卡以 Markdown 渲染进同一容器**。旧角色 changelog 恰好含这两个字样，检查**偶然**为真；UIUX v2 返工后抽屉的待办/队列实际是工作列表（节标题为「当前工作」「排队」，见 `app/renderer/renderer.js` 的 `workListHtml`），这两个字串在界面里**本就不存在**——任何文档不含该字样的角色都会显示 false。

结论：这是「界面改动需同步 e2e 断言」（拆分设计 §2.2：界面改动需同步其中断言时，经项目管理协调由本角色执行）的既有待办面，与本次改名无因果（改名只是换成了不恰好含这些字样的角色，使其显形）。本次未改写该断言语义——它的正确新形态应与「桌面UI/UIUX设计师」确认现行抽屉结构后一并同步，交 PM 协调派发。（**同日跟进更正（2026-10-14）**：该同步已随 PM 派发当场完成，见下节；上句保留为当时状态。）

## 跟进（2026-10-14，PM 派发）：抽屉/队列断言同步至现行结构

**新依据（只读核对，先设计后实现）**：

- 设计口径（UIUX v2）：`角色卡/UIUX设计师/docs/design/2026-10-13_design_ans-uiux-interaction-v1.md`（§资料）——「顺序是角色名 → 当前工作 → 排队 → 折叠角色卡/边界/变更/文档。空闲只有「无进行中或排队消息」一条，**空态不保留两份列表**……点击直达**同一个列表**」；实现验收 `2026-10-13_design_ans-uiux-implementation-acceptance.md` Q1/Q2 同口径。
- 实现事实（`app/renderer/renderer.js`，只读）：`#right-body` 内仅一个 `#right-queue-body.role-work`（`workListHtml`：空态「无进行中或排队消息」；非空渲染 `<h3 class="work-heading">当前工作</h3>`〔进行中行=`li.q-item.is-running`，**行内不印「进行中」字样**〕与「排队」组〔`span.q-pos` 位次〕），其后 `sec()` 四组：角色卡/边界条目/变更记录/文档。**不存在**「待办 / 队列」「队列概览」独立节与 `#right-queue-overview` 元素；原型 HTML 的 `drawer-eyebrow`「此角色的工作」**未在实现中出现**——断言一律钉**实现现状**，不钉原型文案。

**改了哪些检查（6 处；严重级保持 log-only，未升级为阻断门）**：

| 旧检查 | 旧逻辑为何失真 | 新断言（现行真实结构） | 新取值 |
| --- | --- | --- | --- |
| `RIGHT_HAS_TODO_SECTION` | 子串「待办 / 队列」在现行界面不存在；旧角色 changelog 正文（被抽屉以 Markdown 渲染）含该字样使检查**偶然**为真 | `#right-body #right-queue-body` 存在（工作列表区＝原待办/队列节） | true |
| `RIGHT_HAS_OVERVIEW_SECTION` → 改名 **`RIGHT_QUEUE_SINGLE_LIST`** | 「队列概览」独立节已按 v2 并入单份列表；旧名与旧子串均失真（同样曾被旧 changelog 字样偶然满足） | 工作列表区在 **且** `#right-queue-overview` 不在（"空态不保留两份列表"口径） | true |
| `RIGHT_QUEUE_RUNNING_FIRST` | 旧断言找行内「进行中」字样；v2 行内不印该字样 | 首行 `li.q-item` 带 `is-running` **且** 首个 `.work-heading` 为「当前工作」（进行中最前、归组） | true |
| `RIGHT_QUEUE_EMPTY_PLACEHOLDER` | 旧文案「（无待办）」已改 | 空态含「无进行中或排队消息」 | true |
| `QUEUE_OVERVIEW_ROWS` → 改名 **`QUEUE_POSITION_ROWS`** | 读 `#right-queue-overview .queue-list .q-item`（元素已不存在）⇒ 恒 0 | 同一单份列表的**位次行数**：`#right-queue-body .q-item .q-pos` | 2 |
| `QUEUE_OVERVIEW_IN_CARD` → 改名 **`QUEUE_POSITION_IN_CARD`** | 同上（元素已不存在） | 位次渲染在资料抽屉的**单一列表内**：`#right-body #right-queue-body .q-pos` 存在 | true |

未动的真检查（按 PM 指示保留）：`RIGHT_QUEUE_SECTION`/`RIGHT_QUEUE_ROWS=3`/`RIGHT_QUEUE_SOURCES`、`QUEUE_ROWS_THREE`/`QUEUE_WITHDRAW_ON_MESSAGES`/`QUEUE_EXPAND_FULL`/`Q_WITHDRAW_LINE`/`QUEUE_ROWS_AFTER_WITHDRAW`/`DISPATCH_ROW_NO_WITHDRAW`（撤回与位次的真实用例）等。

**重跑对照（无新增差异）**：`ANS_E2E_OUTDIR=<tmp> node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → 退出 0、348 行，仍停在既有基线红 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（同点位同红）。与上一轮 run 逐行 diff：差异**恰为**上述 6 处被修检查 + OUTDIR/SHOT 路径 + E2E 堆栈行号（加注释所致）。与拆分前留档基线（规范化角色名后）对照：差异仅为拆分预期项（角色清单、边界行数 11→34）、本表 6 处新断言（由 false / 计数 0 转真——其旧形态在基线本来就无法为真）、`P1_ARRIVAL_DEBUG` 调试数字与堆栈行号。原始报告留档：[2026-10-14_drawer-check-sync-e2e-report.txt](2026-10-14_drawer-check-sync-e2e-report.txt)。

**范围外发现（未动，交 PM 定）**：同一「界面断言 vs 现行界面」家族还剩 5 行 log-only 属**文案/格式面**：`SU_WRITE_NOTE_SAYS_PI`、`RUNTIME_NOTE_SAYS_PI_WRITES`、`RUNTIME_NOTE_ONE_LINE_GATED`、`WRITE_NOTE_REMAINS_IN_HEADER`（现行说明为 `WRITE_NOTE = "实际写入导入项目，角色边界外的写入会被拒绝。"`，`app/renderer/renderer.js`）与 `TOOLROW_HAS_PATH`（tool-rows v2 行格式）。它们不涉抽屉/队列结构、在拆分前留档中即为 false；是否再派一批同步由 PM 决定。软性建议（不越权）：本批 6 项无需升级为阻断门——抽屉结构属 UIUX 呈现面、已有 log-only 对照与 UIUX 侧视觉回归覆盖；如需更强口径，宜并入 UIUX 侧回归而非 e2e 阻断。（**同日跟进 4 更正：上述 5 行已随 PM 派发完成同步**，见该节 B。）

### 跟进 2（同日）：桌面UI 锚点漂移修复候选的 e2e 重跑核对

候选：`app/renderer/renderer.js` = SHA-256 `402e49a73ad65bb220b30ff8d57623ff38e7fa3d8aa982abb199b07f120cc938`（落档时本机复核一致；`styles.css`/`index.html`/`tool-rows.js`/`ui-labels.js` 的 mtime 证实未动，与今日两轮所见相同）。重跑命令同上；报告留档：[首跑](2026-10-14_anchor-drift-fix-e2e-report.txt)、[第二次](2026-10-14_anchor-drift-fix-e2e-report-trial2.txt)。

结论：**与今日两轮逐行对照，内容级无新增差异**——仍停在既有基线红 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（同点位同红）、6 处抽屉/队列断言全真、其余全部一致（仅输出路径与堆栈行号差异）。**唯一例外（如实登记）**：首跑的 `U1_WINDOWED_TO_BOTTOM=false`（`DIST=12922`，窗口化 pane 点角色未回底）；随后 4 次重跑均回 `true`（`DIST=0`）——**5 次中 1 次，属偶发**。该检查在修前留档基线与今日两轮共 4 次观测全为 `true`；0/4 对 1/5 的样本量**不足以判定偶发是否与本次修复相关**，交 PM 路由定性（建议加长等待或多次试次由桌面UI/测试角色核查）。本角色未改动 main.mjs 的等待与断言（保持本批范围）。（**同日跟进 4 更正：S-1 真窗口化修复后连跑 5 次，该域读数恒 pane 高=13689px、`U1_WINDOWED_TO_BOTTOM=true` 全真——偶发未复现，新基线已立并加了采样行**。）

### 跟进 3（同日）：归档收口（归档键约定）同步

旧目录改以**归档键约定**归档（`boundary.yaml` 恢复原名 + 顶层 `archived: true`；见本文首节「冻结方式当日有一次演进」）。本角色侧同步：① `project.test.ts` 归档断言由「跳过并提示」改为「`warnings == []` **且** 角色表不含『桌面应用』」（其余断言不动、不放宽），注释同步更新；② 复跑三件套（session/operator-channel/project）**42/42 全过**，全边界内单测 **206/207**（唯一红=pi-config 检出目录名基线）；③ e2e 按新仓态重跑一次：与上一干净对照（跟进 2 trial 2）**内容级差异 0 行**（仅输出路径/堆栈行号），仍停同点位基线红 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`——渲染侧 `#warnings`（有展示位）在两种归档形态下对全部检查点均不可见。报告留档：[2026-10-14_archive-key-e2e-report.txt](2026-10-14_archive-key-e2e-report.txt)。

### 跟进 4（同日）：两项维护事项落地——A 诊断基线红修复 + B 残留清扫

客户批准两项维护，先由产品评审（`角色卡/产品/docs/design/2026-10-14_design_maintenance-review-diagnostics-and-residues.md`），PM 派发本角色边界主体。

**候选环境**：6 轮 run 于 11:28–11:36 执行——`app/renderer/renderer.js` = `47703d0b35b276e5b84c3b603fcded4dd9ed1fce8e35bf1fcf9330e488800b0d`（**PM 提交 7347049 的最终渲染候选**；styles `69b2ea02…`/index `9b542de1…`/tool-rows `9ffda4bf…`/ui-labels `9f344ebf…` 与其锚点漂移修复记录一致、未动）。即证据组合 = 最终渲染候选 + 本批 main.mjs／注释面改动。另：同日归档收口跑（10:51）也已落在该 renderer 版上、与 402e49a7 版对照内容级零差异。

**A：`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 基线红修复（按真实场景修，非放宽）**

根因（评审实证，本角色复核一致）：S-1 段夹具工具事件不带 `detail.turnId`，现渲染把连续工具事件归入同一「查看执行记录」组行（renderer.js `appendActivity`：仅 `turnId` 变化才分新组）⇒ 200 条塌成 1 行 ⇒ 行数 < `VIRT_MIN_ROWS`(150) ⇒ `updateVirtualWindow` 提前返回 ⇒ `renderer.viewport` 从未发出。改动（均在 main.mjs）：

- **S-1 填充/流式/上翻/回底四批事件改生产形状**：`detail: { toolName, path, turnId, toolCallId }`（形状对照 `src/common/pi-adapter/real-adapter.ts` 的 tool_execution_start/end 外推），**每条唯一 `turnId`**（helper `s1Event`）逐条自成组行 ⇒ 真窗口化 ⇒ 五事件齐。
- **`S1_WINDOWED_ACTIVE` 重锚**：钉行模型事实——`rowModelDebug.count ≥ 150` 且挂载的直接子行 < 总行数、spacer 实际撑高（旧查「常驻 2 个 `.virt-spacer`」恒真、空转）。
- **`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 五事件期望集合一字未动**；`repairCheck` 语义、严重级均未动。
- 注释同步更新（组行 `turnId` 行数依赖「下轮防退化钉」；U-1 段前置说明）。
- **评审明列六种「换绿」一条未犯**：未删 `renderer.viewport`、未降级/删检查、未动 `VIRT_MIN_ROWS`（完全未触 `app/renderer/**`）、未让小 pane 发事件、未伪发诊断、**也未只加事件数**（所有填充都带唯一 turnId）。

**B：残留清扫（全部零行为改动）**

- **5 行 log-only 检查按现行口径重锚（更新不删、严重级不变）**：`SU_WRITE_NOTE_SAYS_PI`→**改名 `SU_WRITE_NOTE_WRITES_IMPORTED`**（锚「实际写入导入项目」）；`RUNTIME_NOTE_SAYS_PI_WRITES`→**改名 `RUNTIME_NOTE_WRITES_IMPORTED`**（同串）；`RUNTIME_NOTE_ONE_LINE_GATED`（锚「角色边界外的写入会被拒绝」）；`WRITE_NOTE_REMAINS_IN_HEADER`（同串）；`TOOLROW_HAS_PATH`——夹具改**生产形状事件**（`detail.path`）＋断言锚 `.activity-op/.activity-target` DOM，保留 `TOOLROW_NO_CONTENT`。依据：现行说明单一来源 `WRITE_NOTE`＝「实际写入导入项目，角色边界外的写入会被拒绝。」（renderer.js）。
- **11 个 `test/桌面应用/*.test.ts` 行 2 头注**「桌面应用（Tx）」→「桌面窗口」，直接改写、无历史注记（`ans-wiring`/`boundary-refresh`/`composer-images`/`dispatch-delivery`/`genesis-bootstrap`/`handback-delivery`/`interface`/`message-queue`/`operator-wiring`/`session-history`/`su-effective-boundary`）；`markdown.test.ts`（属桌面UI）未动。
- **`app/desktop/project.ts:224`** 注释样例路径 → `角色卡/编排/role-card.md`；**3 处「归属：」句**（`customer-input.ts`/`operator-channel.ts`/`request-anchor.ts`）→「桌面窗口」。判定逻辑/行为零改动（纯注释与归属句）。
- 边界外三项（`test/pi-adapter/dispatch-task.test.ts`、`markdown.test.ts`、`uiux-design-audit.mjs`）本侧未动——PM 另派 Pi适配器/桌面UI；未做全仓 grep-replace。

**证据（连跑 5 次 + 最终文件复跑 1 次；报告留档 [run1–6](2026-10-14_diagnostics-fix-runs/run1.txt)）**

| 项 | 5 次结果 |
| --- | --- |
| 退出码 / 耗时 / 看门狗 | 0 / 67–68s / 无 WATCHDOG |
| `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` | **true（恒红修复）** |
| `MAC_CLOSE_REOPEN_LOADS_WITHOUT_DUPLICATE_HANDLERS` / `MAC_CLOSE_REOPEN_NO_AUTO_SEND` / `E2E_DONE` | true / true / **E2E_DONE=1**（尾部 13 行场景真的恢复运行） |
| `S1_WINDOWED_ACTIVE`（重锚后）/ `S1_STICK_AT_BOTTOM` / `S1_NOT_YANKED` / `S1_STAYED_AWAY_FROM_BOTTOM` / `S1_STICK_AGAIN` | 全 true（`STAYED_AWAY` 由 false 转真，评审预期） |
| `U1_PANE_HEIGHT` / `U1_WINDOWED_TO_BOTTOM`（=DIST 3px） | **13689（5/5 恒定）** / true |
| B.1 五检查（含改名两项） | 全 true |
| **轮间内容级差异** | **0 行**（除输出路径/无堆栈行差异——不再有 E2E_ERROR） |

run6＝最终文件（加 450-批保留注释后）的复跑：68s、与 run1 **内容级零差异**、`DIAGNOSTICS=true`/`E2E_DONE=1`——留档与最终候选逐一对应。

**与修复前留档逐行对照＝全部为预期位移**（无「新增回归」）：`SU_WRITE_NOTE_SAYS_PI=false`→`SU_WRITE_NOTE_WRITES_IMPORTED=true`；`RUNTIME_NOTE_SAYS_PI_WRITES=false`→`RUNTIME_NOTE_WRITES_IMPORTED=true`；`RUNTIME_NOTE_ONE_LINE_GATED`/`WRITE_NOTE_REMAINS_IN_HEADER`/`TOOLROW_HAS_PATH` false→true；`S1_STAYED_AWAY_FROM_BOTTOM` false→true；`U1_WINDOWED_TO_BOTTOM_DIST` 0→3 且新增 `U1_PANE_HEIGHT=13689`；`DIAGNOSTICS…=false`+`E2E_ERROR`+堆栈（5 行）→ `=true`+`MAC_CLOSE_REOPEN_*`×2+`E2E_DONE=1`（恢复的尾部）。**其余 320+ 行逐字一致**。

**U-1 新观察定性（评审 §1.5 交办）**：修复后连跑 5 次，该处 pane 内容高恒 **13689px**、`U1_WINDOWED_TO_BOTTOM=true`（DIST=3）——评审观测的 13577/655 不稳定态**未复现**；真窗口化下该读数已稳定（新基线由新加的 `U1_PANE_HEIGHT` 行逐轮钉住即可对照）。未发现渲染侧根因（无需交回）；若后续轮次再现不稳，既有采样行可直接对照。

**验证面**：`node --test test/桌面应用/*.test.ts` → **206/207**（唯一红=pi-config 检出目录名基线）；`npm run typecheck` → 0 错。**范围外**：L1424 的 450 条「待确认定位长会话」填充仍未带 turnId（评审列为可选、PM 批次未含）——相关断言全真，未动。

## 交回 PM 的关联线索

- e2e 尾部基线红（DIAGNOSTICS）与 pi-config 基线红见 [memo](../../memo.md)。
- 边界外残余旧名引用：`test/桌面应用/e2e/uiux-design-audit.mjs` 用「桌面应用」作**假枚举**夹具（不查真实仓库、冻结不直接致红，归属 UIUX 侧）；各角色正文资料中的历史字样以项目管理呈报报告清单为准。
