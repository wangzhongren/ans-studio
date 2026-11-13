# B7 配套：i18n 守卫 allowlist 逐文件补登 `app/desktop/session/**`（31 条）

- 日期：2026-11-13
- 角色：ANS 测试（B7 配套守卫维护）
- 工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`，起点 `e37da80`）
- 方案依据：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §5 B7（barrel 切换）；B0 守卫设计
  `test/项目管理/shared/i18n-guard.test.ts` / `i18n-guard-scanner.ts` / `i18n-guard-allowlist.ts`
- 裁决：协调者 2026-11-13 裁决 **Option A**——按拆分前 `app/desktop/session.ts` 文件级覆盖口径恢复守卫状态，
  `tasks.ts:832-838` 预存应用自有升级卡中文显式披露并登记为后续 i18n 待办；key 化会改变外部文案，超出
  B7「行为零变化」范围。
- 边界：只改 `test/项目管理/shared/i18n-guard-allowlist.ts`（纯新增）+ 本记录；生产代码 / scanner / 测试断言 /
  boundary 均未触碰；未 commit/push、未触发 CI、未 tag、未触碰 `main`；未读 `.env`；未占用 9222/9223/9224。
- 状态：**完成**——守卫 6/6（`scanned=191 allowlisted=56 violations=0`）；`test/项目管理/**` 全目录
  224 tests / 219 pass / 0 fail / 5 skip；该守卫失败名转绿。

## 1. 根因

- B0 基线（`c234e79`）时 i18n 守卫通过：`app/desktop/session.ts`（13,491 行）在 allowlist 中，文件级放行。
- B1–B7 将 `session.ts` 逐字搬移/拆分为 `app/desktop/session/**` 模块，中文（import specifier 中的既有
  中文目录名 `编排`/`门禁引擎`，以及与 B0 `session.ts` 逐字同源的 agent-facing 工具回执/协议行/诊断文本）
  随代码分散到新文件；**allowlist 未同步逐文件补登**，守卫从 B1 起转红。
- 实测：`e37da80`（B6 树）`scanned=180 violations=25`；B7 树 `scanned=191 violations=31`——B1–B6 积累 25 个，
  B7 新增 6 个（`session/index.ts`、`session/lifecycle/{host,open-context,open,ops,send}.ts`）。
- 本项目守卫为**文件级**判定（`evaluateGuard`：allowlist 命中即整文件放行）。拆分后逐文件补登等价于恢复
  拆分前 `session.ts` 单条目的覆盖范围，不是新增/扩大豁免面。

## 2. 违例分类（31 条，逐条判定）

用 scanner 打印每个违例文件的**全部** Han 命中（不只首命中）：31 文件共 **1438 个命中**；
其中 **94 个命中位于 import/export specifier 行**（机器路径 `编排`/`门禁引擎`），其余 **1344 个命中位于
492 个非路径行**。非路径行溯源（与 B0 `c234e79` 全部 allowlist 文件逐行比对）：

- 485 行**逐字存在**于 B0 allowlist 文件（主体 `session.ts`；另含 `version-change.ts`/`workflow.ts` 等）——
  沿用既有 classification §4 口径：agent-facing 工具回执、`[系统·…]` 协议行、role_status/session_tail/
  诊断文本；
- 6 行是多行 import 的续行 `} from "../../../../src/common/编排/…";`（机器路径）；
- 1 行仅 receiver 改写（`this.` → `ctx.`）的 agent-facing 工具消息：`git-ports.ts:69`
  `原运行的工具来源已暂停`（c234e79 `app/desktop/session.ts:3871` 原文）。

| # | 文件（`app/desktop/session/` 下） | 批次 | 守卫首命中 | 中文构成判定 |
| --- | --- | --- | --- | --- |
| 1 | `card-gateway.ts` | B1–B6 | `:15:73 编排` | 仅 import 机器路径（:15–:17） |
| 2 | `cards/acceptance-facts.ts` | B1–B6 | `:23:91 编排` | 路径 `编排`/`门禁引擎` + 验收不可用原因/缺失项标签（agent-facing，B0 同源） |
| 3 | `cards/cards.ts` | B1–B6 | `:30:84 编排` | 路径 + 申请系统行/机械拒绝 action/建卡校验 agent 回执（B0 同源；用户可见文案已 key 化） |
| 4 | `cards/version-decisions.ts` | B1–B6 | `:20:84 编排` | 路径 + `[系统·版本决策/申请/审批]` 协议行与决策回执；卡标题走 `mainT("ui.versionDecision.title")` |
| 5 | `contracts/deps.ts` | B1–B6 | `:31:74 编排` | 仅 import 机器路径 |
| 6 | `contracts/ports.ts` | B1–B6 | `:10:63 编排` | 仅 import 机器路径 |
| 7 | `contracts/session-types.ts` | B1–B6 | `:9:74 编排` | 仅 import 机器路径 |
| 8 | `contracts/tasks.ts` | B1–B6 | `:7:59 编排` | 仅 import 机器路径 |
| 9 | `delivery/queue.ts` | B1–B6 | `:29:84 编排` | 路径 + `(投递机)` 机器标识/投递失败 agent 回执（B0 同源） |
| 10 | `delivery/store.ts` | B1–B6 | `:22:59 编排` | 仅 import 机器路径 |
| 11 | `diagnostics.ts` | B1–B6 | `:28:50 编排` | 路径 + role_status/session_tail/看护诊断工具输出（B0 `session.ts` 条目同类） |
| 12 | `dispatch.ts` | B1–B6 | `:26:85 编排` | 路径 + 派发/续接/重派 agent 工具回执与账本系统行（B0 同源） |
| 13 | `evidence.ts` | B1–B6 | `:17:169 编排` | 路径 + 只读速查/证据核对工具输出（B0 同源） |
| 14 | `fixed-workflow/cards.ts` | B1–B6 | `:19:72 编排` | 路径 + 回交/团队计划/任命卡校验 agent 回执（B0 同源） |
| 15 | `fixed-workflow/panel.ts` | B1–B6 | `:8:55 编排` | 路径 + 诊断记录提示（B0 同源） |
| 16 | `fixed-workflow/release-merge.ts` | B1–B6 | `:19:55 编排` | 路径 + 发布/合并卡 agent 回执（B0 同源） |
| 17 | `fixed-workflow/route.ts` | B1–B6 | `:23:88 编排` | 路径 + 生产派发/阶段路由 agent 回执（B0 同源） |
| 18 | `git-ports.ts` | B1–B6 | `:60:97 没有当前真实工具回合` | **非路径**：Git 工具不可用/run-stop 栅栏的 agent-facing 回执 message（:60/:66/:69） |
| 19 | `handback.ts` | B1–B6 | `:24:135 编排` | 路径 + 回交/收口 agent 回执（B0 同源） |
| 20 | `index.ts` | **B7 新增** | `:18:77 编排` | 仅 import 机器路径（facade barrel，:18–:36） |
| 21 | `lifecycle/host.ts` | **B7 新增** | `:9:80 编排` | 仅 import 机器路径（含多行续行 :32） |
| 22 | `lifecycle/open-context.ts` | **B7 新增** | `:50:153 编排` | 仅 import 机器路径 |
| 23 | `lifecycle/open.ts` | **B7 新增** | `:32:317 编排` | 路径 + 会话开启/投递 agent 回执（B0 `session.ts` 同源） |
| 24 | `lifecycle/ops.ts` | **B7 新增** | `:15:80 编排` | 路径 + 库存/会话处置 agent 回执（B0 同源） |
| 25 | `lifecycle/send.ts` | **B7 新增** | `:12:80 编排` | 路径 + 投递/回交 agent 回执（B0 同源） |
| 26 | `persistence.ts` | B1–B6 | `:19:71 编排` | 仅 import 机器路径 |
| 27 | `run-change.ts` | B1–B6 | `:193:56 缺少当前真实受派策划回合` | **非路径**：run-change 选择/停止计划的 agent-facing 工具回执 |
| 28 | `session-env.ts` | B1–B6 | `:24:60 编排` | 路径 + `[系统·安装]` 协议前缀与安装/卸载 agent 回执（B0 同源） |
| 29 | `shared/tasks-store.ts` | B1–B6 | `:12:55 编排` | 路径 + 任务事件摘要 `应用观察到失败`（账本/诊断，B0 同源） |
| 30 | `shared/text.ts` | B1–B6 | `:9:80 编排` | 仅 import 机器路径 |
| 31 | `tasks.ts` | B1–B6 | `:23:74 编排` | 路径 + 任务账本/重派/终止/升级 agent 回执（B0 同源）；**另有预存用户可见卡文案，见 §3** |

判定结论：31 条违例中 29 条首命中为 import specifier 机器路径；2 条首命中为 agent-facing 工具回执（非路径，
非客户 UI）；1438 个命中中除 `tasks.ts:832-838`（§3 显式披露的预存例外）外，**无新增用户可见文案**。

## 3. `tasks.ts:832-838` 预存应用自有升级卡中文：披露与后续待办

- 内容：`escalateStuckTask` 构造 `CustomerInputRequest`（`kind:"choice"`, `cardKind:"decision"`,
  `application:true`, `sourceRoleId:"application"`）：
  - `:832 title: \`应用·任务升级：任务连续卡死 ${taskId}\``
  - `:833 question: "任务已连续 2 次重派仍卡死。请选择处置（唯一推荐：终止）。"`
  - `:835–:838 options[].label`：`继续等待/观察`、`再重派一次（同角色 fresh 会话）`、`换人执行（替代角色）`、`终止任务`
- 呈现链（逐跳证据）：
  - `app/desktop/customer-input.ts:2544` 将原始 `req` 原样放入 `OperatorRequestPayload { request: req }`，
    经 IPC `session:operator-request` 推渲染侧（同文件 :6/:120–:131）。
  - `app/renderer/src/chat/decision-dialog.ts:207–:240` `decisionView` 直接取 `request.title/question/
    options[].label`；`app/renderer/src/chat/DecisionDialog.tsx:40/:371` 经 `optionLabel`（`${option.label} ★`）
    逐字渲染；`app/renderer/src/chat/ChatRow.tsx:672` `OperatorNotice` 直接显示 `request.title`。
- 归属：**B0 即存在，非 B1–B7 新增**——`c234e79:app/desktop/session.ts:7762–:7771` 逐字同源；B0 由
  `app/desktop/session.ts` 文件级 allowlist 条目整体掩盖。本次拆分后若不给 `tasks.ts` 补登，守卫会红；
  补登即恢复拆分前覆盖范围（裁决依据），并在条目注释与本记录显式登记。
- 后续待办（缺陷登记）：升级卡 `title/question/options.label` 应走共享 i18n key 化（应用生成用户文本，
  方案 §4.11）；属跨批 UI 文案改动，超出 B7「行为零变化」范围，**列入后续 i18n 批**。key 化后应从
  `tasks.ts` 条目披露中移除本例外（条目本身因机器路径/agent 回执仍需保留）。

## 4. 逐文件新增条目（31 条，字典序）

唯一改动文件：`test/项目管理/shared/i18n-guard-allowlist.ts`，**+87 insertions / 0 deletions**（纯新增；
既有条目、顺序、scanner、测试断言零改动）。行数 125 → 212；SHA-256
`bad457a354b656b970c928b1000ae7134a8596dd69f80c64c7b396e88230b5b6` →
`507b69bcdf146f8b009289e6b24e95e4c0fd92244d28d53aef74c01462e40857`。

头部历史新增一条（2026-11-13，B7 收尾；当前保留 **56** 条）。条目块插入 `app/desktop/session.ts` 与其后
`version-change.ts` 之间，顺序与 dict 排序一致：

`session/card-gateway.ts`、`session/cards/acceptance-facts.ts`、`session/cards/cards.ts`、
`session/cards/version-decisions.ts`、`session/contracts/{deps,ports,session-types,tasks}.ts`、
`session/delivery/{queue,store}.ts`、`session/diagnostics.ts`、`session/dispatch.ts`、`session/evidence.ts`、
`session/fixed-workflow/{cards,panel,release-merge,route}.ts`、`session/git-ports.ts`、`session/handback.ts`、
`session/index.ts`、`session/lifecycle/{host,open-context,open,ops,send}.ts`、`session/persistence.ts`、
`session/run-change.ts`、`session/session-env.ts`、`session/shared/{tasks-store,text}.ts`、
`session/tasks.ts`。（每条均带理由注释：机器路径锚点 + 非路径文本类别；B7 新增 6 条已标注。）

`tasks.ts` 条目注释显式写明：「同时覆盖 `:832-838` 预存应用自有「任务升级」客户 decision 卡中文
（…原 `app/desktop/session.ts` 文件级条目已整体掩盖，**非 B7 新增**），本次按拆分前覆盖口径继续覆盖，
待 i18n key 化——显式登记，非 classification §4 的常规豁免。」

## 5. 验证日志

| # | 命令 | 写前 | 写后 |
| --- | --- | --- | --- |
| 1 | `node --test --test-timeout=120000 "test/项目管理/shared/i18n-guard.test.ts"` | exit 1；tests 6 / pass 5 / fail 1；`[i18n-guard] scanned=191 allowlisted=25 violations=31` | **exit 0；tests 6 / pass 6 / fail 0**；`[i18n-guard] scanned=191 allowlisted=56 violations=0`；自然退出 |
| 2 | `node --test --test-concurrency=1 --test-timeout=120000 "test/项目管理/**/*.test.ts"` | （未跑；守卫为唯一已知红） | **exit 0；tests 224 / pass 219 / fail 0 / skipped 5**；skip 均为既有 D3 atomic-write 平台用例（`atomic-write.test.ts` 5 条 `# SKIP`，与本改动无关） |

- allowlist 纪律（守卫第 2 例）：无重复、字典序、无陈旧条目——通过（56 条全部仍在扫描范围且仍含 Han）。
- 防放宽显式样例（仓库外一次性脚本，不改仓库文件）：
  - `app/renderer/src/shell/NewPanel.tsx` + `"新按钮"` → `allowed=false`（1 hit）；
  - `app/desktop/session/new-module.ts` + `"新按钮"` → `allowed=false`；
  - `app/desktop/session/cards/new-card.ts` + `"新按钮"` → `allowed=false`（**证明未做任何目录级放宽**）；
  - `app/desktop/session.ts` + 同样内容 → `allowed=true`（既有文件级条目，按设计）。
- 守卫自测用例（第 4 例「合成负例」）写后仍通过：allowlist 之外的新文件含中文字符串/模板/JSX 文本被拒绝，
  注释中文放行——扫描器判据未改动。

## 6. 未放宽守卫论证

- `i18n-guard-scanner.ts`：零改动（扫描目标、去注释、Han 判据、`evaluateGuard` 未动）。
- `i18n-guard.test.ts`：零改动（6 个用例、断言、合成负例逐字未动）。
- `i18n-guard-allowlist.ts`：**纯新增 31 条 + 1 条头部历史**，0 删除；既有 25 条逐字未动；每条新增均带
  理由注释且精确到文件路径；无目录/通配条目。新文件、新子目录、新模块均仍被拒绝（§5 样例）。
- `I18N_GUARD_ALLOWLIST` 仅被 `test/项目管理/shared/i18n-guard.test.ts` 消费（`grep` 实测无其他引用），
  改动不影响任何其他测试。

## 7. 对全量测试 ADDED 的影响

- 本批全量基线（B7 第三段记录）中唯一归因于本次 session.ts 重构的 ADDED 失败名即
  「硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）」；该名现已转绿 ⇒ 全量 vs B0
  的 ADDED 归零（其余失败名不受影响：唯一改动文件只被该用例消费）。
- 复跑 `test/项目管理/**`：0 fail（219 pass / 5 既有平台 skip），与该目录基线一致。

## 8. 写集与披露

- 实际写入：`test/项目管理/shared/i18n-guard-allowlist.ts`（+87 行）、本记录。
- 未写：生产代码（`app/**`、`src/**`）、scanner、测试断言、其他测试、boundary、既有 allowlist 条目。
- 披露 1：文件级 allowlist 会一并放行 `tasks.ts` 内 `:832-838` 预存客户卡中文（非 B7 新增，B0 已由
  `session.ts` 条目掩盖）；已按裁决显式登记为后续 i18n key 化待办（§3）。
- 披露 2：B1–B6 期间守卫已红（25 条）未同步补登；本记录按 B7 收尾一次性补齐 25 + 6 = 31 条。
- 未 commit/push；无暂存改动；未触发 CI/tag。
