# shell 判拒后的客户确认通道 —— 真实 Electron E2E 与截图证据（D2）变更记录

- 日期：2026-10-31｜任务：`2026-10-31-shell-deny-customer-escalation`（T3）｜节点：**D2 真实应用证据**
- 角色：桌面窗口（独立固定上下文）｜状态：`implemented-unverified`（D2 交付完成；真实 Electron E2E 通过、截图/审计证据齐备；**未 commit / 未 push / 未发行**；验收结论归独立验收）
- **E2 返工补证 D2b（2026-10-31 晚）**：C2 脚本上下文渲染、B1/C1 pending 语义、C2 retryHint 措辞断言返工落盘后，本报告追加 **§九**（真实 E2E 复跑 `$EV/09-run`、截图 39/40/41、pending→allow-once 结果）；D2 首轮记录（§一–§八，`$EV/06-run`）保留为历史。
- 依据（只读）：
  - 客户确认方案 v1.3：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`），§4.6/§6.4/§6.5(e)/§7.1/§7.2/§9。
  - 团队计划：`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`），§4.3 D2/§5.1/§6/§10.2 第 5 项。
  - 实施前验收标准 V1：`docs/acceptance/shell-escalation-criteria-v1.md`（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`），§2.2/§2.3/§2.4、§三 AC-04/05/06/09/10/20/21/22/28（P1/P4/P5/P7/P8/G1）。
  - readonly 裁定 A 澄清：`docs/planning/2026-10-31_clarification_shell-escalation-readonly.md`（124 行 / `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4`）。
  - 已完成节点报告：C1（`角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-C1.md`，141 行 / `e970346c…`，IPC/preload 冻结）、C2（`角色卡/桌面UI/docs/change/2026-10-31_change_shell-escalation-C2.md`，130 行 / `d0a88a44…`）、B1（`角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md`，172 行 / `68334d5e…`）、D1（`角色卡/测试/docs/change/2026-10-31_change_shell-escalation-D1.md`，115 行 / `324cfd33…`）。
- 基线：worktree `flow-improvements-wave1` HEAD `9f670fb2c7d403baf995071055d697c50714c905`；系统 Node v24.22.1 / npm 11.19.1；Electron 44.7.0（Electron 内嵌 Node 24.21.0，见 `$EV/06-run/report.txt` 首行环境记录）；win32 x64（MINGW64_NT-10.0-26300）。
- 证据目录（仓库外）：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\D2\`（下称 `$EV`）；D2 首轮候选证据在 `$EV/06-run/`，E2 返工补证（D2b）在 `$EV/09-run/`（§九）。

## 一、写集与逐文件写前/写后哈希

哈希口径：`git hash-object`（blob）+ `sha256sum`（工作区原始字节）。本 worktree 既有文件为 CRLF（`core.autocrlf=true`），`e2e/main.mjs` 改动保持 CRLF（已核验 2695 行全部 CRLF，无整文件换行重写）。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 行数（后） |
| --- | --- | --- | --- |
| `test/桌面应用/e2e/main.mjs` | `8271c9c7ee73163f3af3227041943ecfa143529b` / `27cc5fda8a780a15a060cc259d680bc38517c4c4cb409a8cf5708b032dc10b02` | `af63ad65de1ea5df3c08d69dbe46af4c9aae5fc1` / `839312aee3555a2a23f876113b0c673349e9eedd5b5e1ad0df60f340caf5ffbd` | 2694 |

- 写集外改动：**无**（`git status` 中其余 `app/**`、`src/**`、`test/**`、角色卡等改动均为 A1/A2/A3/B1/C1/C2/H1/D1 在本节点之前已存在的改动，本节点只读消费；`app/renderer/dist/` 为忽略产物、非候选，本轮未重建，沿用 C2 构建的当前产物）。
- 未新建 `test/桌面应用/e2e/` 下任何脚本；未改产品源码、断言判据之外的既有行为；未新增 skip/todo。

## 二、改动内容（仅 `test/桌面应用/e2e/main.mjs`，真实 Electron 总自检扩展）

保持既有全部检查与流程不变（新增段插在既有窗口重开之后、D 批治理检查之前；看门狗 180s → 300s，仅扩大有界时限，不放松任何判据）。新增：

1. **与 `app/main.ts` 同形的真实呈现端接线（不复制判定）**
   - 导入产品真件：`app/desktop/shell-escalation.ts`（`createShellEscalationPresenter`/`isShellEscalationResponse`）、`confirm-card.ts`（`createConfirmCardSlot`）、`operator-channel.ts`（`createShellConfirmPresenter`/`createDesktopOperatorChannel`）、`interface.ts`（`createShellSessionPauseState`）；闸/白名单/只读/审计经 Service/Pipeline 公开出口：`src/service/gate/shell-rules.ts`、`src/pipeline/orchestration/shell-arming.ts`、`src/common/编排/shell-audit.ts`、`src/common/编排/shell-escalation.ts`。
   - `registerIpc()` 每窗口创建共享呈现槽 + 审批卡/升级卡真实呈现端；`shell:confirm-response` 按 `isShellEscalationResponse` 路由到真件（旧 `{id, allow}` 逐字兼容）；窗口关闭 `rejectAllPending`。未改任何产品代码。
   - 模块级 `shellSessionPaused = createShellSessionPauseState()`（与 `app/main.ts` 同一状态机实现）：新增 `shell:judge-pause`（sender 校验、strict 输入、成功后推送）；`shell:judge-get`/`shell:judge-set` 推送/读取均含 `paused`。
   - 临时 `userData`（`$OUTDIR/userData`）——真实运行证据的隔离基线与「暂停不写偏好」检查面。
2. **新增 D2 场景段（70 项 counted 检查，全部为 `repairCheck`，失败即计入 `E2E_FAILURES`）**：升级卡真实呈现/内容逐字断言、三选项与 Esc 回包线上断言、未知/重复/非法动作/真实超时、单槽与真实呈现端仲裁、暂停/恢复（真实 preload）、窗口重开保留、第二进程重启清零、白名单 0 judge、只读档裁定 A、审计 JSONL 四类+申请决定。
3. **证据新鲜度**：新截图先 `webContents.invalidate()` + 450ms 再 `capturePage()`（本轮实测窗口静止/遮挡时可能取到旧合成帧；仅影响截图新鲜度，不改变断言）。
4. 既有检查值对比：最终运行 `$EV/06-run` 与写前基线 `$EV/00-baseline` 的**同名校验值完全一致（0 处布尔变化）**；`E2E_PASS=true`。另记录到既有 harness 在机器负载下有若干**未计入通过门**的日志行会抖动（如 `HANDBACK_CARD_PRESENT`、`S1_NOT_YANKED`）；以**未改动的 HEAD 版本**在同一环境复跑两次（`$EV/00-rerun-a`、`$EV/00-rerun-b`）复现同一抖动，E2E_PASS 仍为 true（见 §四.3 失败分类）。

## 三、E2E 运行记录（最终候选）

- 命令（工作目录 = worktree 根）：
  `ANS_E2E_OUTDIR="C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\D2\06-run" node_modules/.bin/electron test/桌面应用/e2e/main.mjs`
- 退出码：**0**（`$EV/06-run.exit`）；耗时 1m15.5s；stdout/stderr 184 行（`$EV/06-run-stdout.log`，sha256 `22acc4397c43cf2cdceeefb0ebe3db637babf3006a47a9c3406caffd7560de7f`）。
- 报告：`$EV/06-run/report.txt`（485 行 / sha256 `31395ee0992fd60b8f20cb9bf01c4af43d03b9cead75e81b3a40a0de8f8390b1`）。
- **`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`**；无 `E2E_ERROR` / `WATCHDOG_TIMEOUT` / `WAIT_TIMEOUT` / `PROMISE_TIMEOUT` / `EVAL_ACTION_ERROR`；无 renderer console error。
- 计数：新增 **70/70** counted 检查通过（`SE_*`，全部 `=true`）；截图 26 张（既有 17 + 新增 9）；既有检查与基线同值。
- 窗口：`BrowserWindow 1360×860`（无边框自绘标题栏、`show:true`）；无 zoom；截图命令 = 主进程 `win.webContents.capturePage()`（新增截图先 `invalidate()` + 450ms；`shot()` 内仅有界重试补拍，不改内容）；**不存在 DEBUG 覆盖层**（renderer 源码检索无 debug overlay；本 harness 不开 DevTools）。
- 候选版本：HEAD `9f670fb2c7d403baf995071055d697c50714c905`；关键文件 `git hash-object` + sha256 见 `$EV/candidate-hashes-final.txt`（本文件 §七 摘录）。`e2e/main.mjs` after = `af63ad65…` / `839312ae…`。

### 3.1 新增检查清单（名称 / 结果；全部 `true`）

| 组 | 检查名 |
| --- | --- |
| 视图/行 | `SE_VIEW_ON_REPO_PROJECT`、`SE_JUDGE_ROW_PAUSE_AVAILABLE` |
| 升级卡呈现 | `SE_CARD_VISIBLE`、`SE_CARD_COMMAND_VERBATIM`、`SE_CARD_JUDGE_REASON`、`SE_CARD_JUDGE_CUSTOMER`、`SE_CARD_JUDGE_ALTERNATIVE`、`SE_CARD_NECESSITY_ISOLATED`、`SE_CARD_CUSTOMER_NOT_JUDGE`、`SE_CARD_THREE_ACTIONS`、`SE_CARD_DEFAULT_FOCUS_REJECT`、`SE_CARD_DETAILS_CWD`、`SE_CARD_DETAILS_ARGV` |
| 三选项回包 | `SE_ALLOW_ONCE_DECISION`、`SE_ALLOW_ONCE_WIRE`、`SE_CARD_CLOSES_ON_DECISION`、`SE_ALLOW_SESSION_DECISION`、`SE_ALLOW_SESSION_WIRE`、`SE_DENY_BUTTON_DECISION`、`SE_DENY_BUTTON_WIRE`、`SE_ESC_DENY_DECISION`、`SE_ESC_DENY_WIRE` |
| 失效/伪造 | `SE_DUPLICATE_ID_EXPIRED`、`SE_UNKNOWN_ID_EXPIRED`、`SE_NO_PENDING_AFTER_FORGERIES`、`SE_ILLEGAL_ACTION_EXPIRED`、`SE_EXPIRED_UI_HINT`、`SE_TIMEOUT_DEFAULT_DENY`、`SE_TIMEOUT_UI_EXPIRED` |
| 仲裁 | `SE_SLOT_ESCALATION_NOT_OVERRIDDEN`、`SE_SLOT_APPROVAL_AFTER_ESCALATION`、`SE_SLOT_APPROVAL_ESC_EXPIRED`、`SE_APPROVAL_PENDING_BLOCKS_ESCALATION`、`SE_APPROVAL_PENDING_NO_ESCALATION_PUSH`、`SE_APPROVAL_ANSWERED_ALLOW` |
| 暂停 | `SE_PAUSE_INITIAL_FALSE`、`SE_PAUSE_SET_OK`、`SE_PAUSE_GET_STATE`、`SE_PAUSE_DECISION_SWITCH_UNCHANGED`、`SE_PAUSE_NO_PREFERENCE_FILE`、`SE_PAUSE_SHELL_REQUEST_GOES_TO_CUSTOMER`、`SE_PAUSE_GOVERNANCE_ROW_VISIBLE`、`SE_PAUSE_JUDGE_ROW_BADGE`、`SE_PAUSE_FOOTER_BADGE_RESUME`、`SE_PAUSE_SOURCE_MODULE_LEVEL`、`SE_PAUSE_SOURCE_SHELL_CHANNEL_ONLY`、`SE_PAUSE_SOURCE_GOVERNANCE_GROUP_UNCHANGED`、`SE_PAUSE_SOURCE_NO_PREFERENCE_WRITE`、`SE_PAUSE_PRESERVED_ACROSS_WINDOW_REOPEN`、`SE_PAUSE_ROW_AFTER_REOPEN`、`SE_RESUME_VIA_UI`、`SE_RESUME_PERSISTENT_SWITCH_UNCHANGED`、`SE_RESUME_SHELL_REQUEST_RETURNS_TO_SWITCH`、`SE_RESTART_PAUSED_CLEARED`、`SE_RESTART_PREFERENCES_UNTOUCHED` |
| 白名单 0 judge | `SE_WHITELIST_ZERO_JUDGE_PROJECT_TIER`、`SE_WHITELIST_AUDIT_C_ALLOW`、`SE_WHITELIST_NON_MATCH_STILL_REVIEWED`、`SE_WHITELIST_ZERO_JUDGE_BUILTIN_TIER`、`SE_WHITELIST_NO_CARD_PUSHED`、`SE_WHITELIST_NO_SHELL_CARD_VISIBLE` |
| 只读档 A | `SE_READONLY_A_ROUTINE_DENY_MATRIX`、`SE_READONLY_NON_ROUTINE_C_ALLOW` |
| 审计 JSONL | `SE_AUDIT_FOUR_CATEGORIES`、`SE_AUDIT_JUDGE_ALLOW_SHAPE`、`SE_AUDIT_MANUAL_SHAPE`、`SE_AUDIT_CUSTOMER_GRANT_SHAPE`、`SE_AUDIT_ESCALATION_DECISION_SHAPE`、`SE_AUDIT_NO_CREDENTIAL_PATTERN`、`SE_AUDIT_APPEND_ONLY_LINES` |

## 四、证据（截图 / 审计 / 哈希）

### 4.1 真实应用截图（当前候选真实运行、关闭 DEBUG、PNG；窗口 1360×860）

| 文件（`$EV/06-run/`） | 内容 | sha256 |
| --- | --- | --- |
| `30-escalation-card.png` | 升级卡（折叠详情）：标题/说明/命令逐字原文/judge 判拒理由/替代方案/客户说明/必要性独立区块+「由角色提供，未经验证」/客户手批声明/三按钮/默认焦点「拒绝」 | `f93deab86091ee5b2842c61384ed6e234fb986ea6a895036810785747572c208` |
| `31-escalation-card-details.png` | 升级卡详情展开：cwd 逐字 + argv 规范化逐行（含 `--tag=two words`） | `926509805cd813b34837058a6c0b083074f09ff7c9311fd07b214b15f8624dca` |
| `32-judge-deny-pause-button.png` | judge 判拒结果行 + 「本次运行暂停自动审批」入口（入口①） | `d1d9c7bd37e30847628922f4b246446b4c6456eb480a0e7e9ac731272bee63ab` |
| `33-whitelist-no-card.png` | 白名单真实闸调用后界面：**无任何 shell 卡**（与本行暂停入口同态；配合审计 `c-allow`） | `d1d9c7bd37e30847628922f4b246446b4c6456eb480a0e7e9ac731272bee63ab` |
| `34-escalation-paused-footer.png` | 升级卡页脚暂停动作（入口②）：已暂停徽标 +「恢复自动审批」（非第四决定项，三按钮仍在） | `3f0db4fa4cd0af99117244213c88327a25fc2df542f81b19c9a6e2b7368a40cb` |
| `35-judge-row-paused.png` | 判拒结果行暂停后形态：徽标「本次运行已暂停自动审批（重启后清零、回到持久化开关值）」+ 恢复按钮；治理代批结果行同时可见 | `5cc0751538b9557438ba358a68421dff1ca575d1a84a8d15c7271df1aad7650c` |
| `36-paused-after-window-reopen.png` | **窗口重开后**判拒结果行仍为已暂停徽标+恢复（同一运行暂停保留） | `cd51e5ab7042e8d1eb212648a79e9b445d88c85556e2192bee6013af43b998ac` |
| `37-escalation-slot-arbitration.png` | 单槽仲裁：升级卡待答时到达的审批卡**未覆盖**升级卡（仍只见升级卡） | `4113a73d847da5e4c5aa6fefee431b0a73678585db23073cd513853de0a493f9` |
| `38-approval-card-contrast.png` | 对照：开关关闭语义下的**既有 shell 确认卡**（真实审批呈现端推送：命令/摘要/原因/详情/放行执行/拒绝） | `8fd07934ebdf2de73f2f8ad6fcbffc35de279d8f0d9e4c25db06c5510f555391` |

`32` 与 `33` 同帧：两处分别是暂停入口与「白名单 0 卡」状态，界面内容本就相同（白名单全程无卡、无新行），以此证「0 卡」而非截图重复错误。

### 4.2 审计 JSONL 样例（真实默认文件 sink + 受控决定）

- 路径：`$EV/06-run/gate-fixture-project/docs/audit/shell-gate.jsonl`（临时项目，仓库外）；6 行（append-only JSONL）/ sha256 `1a4f0555adba7f77d779557983583d1b6a03b5bfa680fd52a7b210912ad2a54f`。
- 产生方式与层级：`assembleOperatorShellGate`（真实 Pipeline 装配）+ 真实 `createShellEscalationSession`（升级 registry）+ **真实默认文件审计 sink**（经治理边界 + `shell-gate` 条件）+ 真实 `classifyShell`/`defaultShellRules`；判断通道与客户决定为**受控替身**（离线、无真实模型/网络、无真实客户点击）。审计落盘为产品代码真实行为。
- 类别覆盖（逐行可机读，全部实测）：
  1. `c-allow`（白名单 `npm test`，`by: ruleset:default（su 审批档）`）——与 `SE_WHITELIST_*` 配合；
  2. **judge 放行** `c-review→a-allow` + `judge.verdict="allow"`、`by … → operator:judge:pi`；
  3. **客户手批** `c-review→a-allow`、无 `judge`/无 `customerGrant`、`by … → operator:e2e-manual`；
  4. judge 判拒 `c-review→a-deny` + `judge.verdict="deny"`；
  5. **申请决定** `event:"escalation-decision"`、`branch:"escalation:granted-once"`、`conclusion:"allow"`、`execution:"未执行"`、`conditions:["shell-gate"]`、`escalation:{requestId,action:"allow-once",roleId:"X"}`；
  6. **客户升级授权放行** `branch:"customer-escalation:allow-once"`、`customerGrant:{requestId,scope:"once",operatorId:"cust-e2e"}`、无 `judge`、`by:"customer:cust-e2e（grant:<requestId>）"`。
- 缺口（如实）：以上 6 行为真实闸/真实 sink 的受控夹具路径，**非真实模型会话产生**；真实 app 会话在本 harness 中未启动模型（纪律要求），故不声称「全部来自真实 app」。D1 跨层集成（`test/测试/shell-escalation-integration.test.ts`）以真实 registry/工具/授权消费链覆盖判拒→申请→授权放行/消费与拒绝/超时审计；本样例与 D1 互为辅助。三决定（允许/拒绝/超时）中，拒绝/超时的 `escalation-decision` 行由 B1/D1 单测覆盖，本 JSONL 样例只呈现 allow-once 决定的完整记录（缺口记录于此，不伪称齐全）。

### 4.3 基线对照与失败分类

- 写前基线：`$EV/00-baseline`（未改动 harness，HEAD `9f670fb`）`E2E_PASS=true`、`E2E_FAILURES=` 空（report `0e1529d7…`）。
- 最终候选：`$EV/06-run` `E2E_PASS=true`、`E2E_FAILURES=` 空；与基线的同名校验值**0 处布尔变化**。
- 观察到的既有 harness 抖动（未计入通过门、非本节点引入）：机器负载下 `HANDBACK_CARD_PRESENT`、`MD_STRONG_RENDERED`、`S1_NOT_YANKED` 等 11 条 `log()` 行曾在中途运行变 false；用**未改动 HEAD harness** 复跑两次（`$EV/00-rerun-a`、`$EV/00-rerun-b`，均 `E2E_PASS=true`）复现同一抖动；最终运行恢复全部 true。分类：**既有未计数日志行的时序抖动，不是新增失败**；新增确定性失败 = 0、新增 skip/todo = 0。

## 五、关键行为证据摘要（P1/P4/P5/P7/P8/G1）

1. **升级卡真实呈现（P1/P10）**：真实 `createShellEscalationPresenter` 经真实 `shell:confirm-request` 推达真实渲染；`#se-command` 与判拒原文**逐字相等**；cwd/argv 展开核对；judge 理由/客户说明/替代方案可见；必要性独立区块原样展示且标注「由角色提供，未经验证」；「客户手批 ≠ judge 放行」声明可见；三按钮文案与默认焦点=拒绝（截图 30/31）。
2. **三选项与回包（P1/G3）**：`allow-once`/`allow-session`/`deny`（按钮与 Esc）均在真实 `shell:confirm-response` 线上收到 `{kind:"escalation", id, action}`（回包原文由 harness 在 handler 层记录），真实 presenter 结算动作与 operatorId（`e2e-operator`，应用注入）一致；未知/重复 id、非法动作（`allow-all`）→ `{ok:false,expired:true}` 且**不放行**、无第二次授权；真实清理超时（受控 400ms presenter）= `expired`，界面收起并如实提示（不呈现为已允许）。
3. **卡片仲裁（P4/G1）**：
   - 渲染单槽（真实 IPC）：升级卡待答时到达审批卡不覆盖（`#shell-escalation` 仍在、`#shell-confirm` 不出现、store 卡 id 不变）；升级卡决出后重推审批卡正常呈现；审批卡 Esc 仍=不放行（截图 37）。
   - 真实呈现端共享槽（同 `app/main.ts` 形态，真实产品模块）：审批卡通过真实 `createShellConfirmPresenter` 待答时，升级申请直接 `pending`（E2 返工 R2 契约；「…请稍后再申请」，不排队）且**无升级卡推达**；审批卡照常 `{ok:true}` 放行。**层级说明**：这是 harness 内用真实产品呈现端/共享槽构造的仲裁，未在 `app/main.ts` 整机进程里复现（harness 自建窗口是既有设计），C1 单测另覆盖四组时序。**注**：D2 首轮此处为 `unavailable`；E2 返工后由 §九 D2b 更新为 `pending`（registry 不消耗/可重试），并附 registry 层证据。
4. **暂停（P8/G4）**：经真实 preload `setShellJudgePaused(true)` → `shell:judge-pause` → 真实状态机；`shell:judge-get`/推送含 `paused:true`；结果行与升级卡页脚均显示暂停徽标+恢复；**窗口重开保留**（截图 36）；**第二独立 Electron 进程**（真实启动、模块重新初始化）初始 `paused=false`，偏好文件 `<userData>/ans/preferences.json` 始终不存在（不写偏好）；恢复经真实 UI → `paused:false` 且持久化开关值不变。治理 approval 组：`app/main.ts` 代码事实（模块级单例、shell-only `isEnabled`、`isGroupEnabled` 只读全局开关、暂停 handler 不写偏好）+ 暂停期间决策开关状态不变 + 治理代批结果行可见（截图 35）。**层级说明**：治理组开关逻辑本身由 C1/D1 单测钉住；本节点的「可见行为」是状态/UI 级，不是整机治理卡代批实测。
5. **白名单 0 judge（P7，harness 驱动真实闸）**：真实 `classifyShell`/`defaultShellRules` + 真实 `assembleProjectShellGate`（advisory）与 `assembleOperatorShellGate`；9 种精确形态全部 `c-allow`，判断通道调用=0、判断会话 adapter 创建=0（项目角色侧一旦创建即抛错），审计 9 条 `c-allow` 且无 `judge`/`customerGrant`；`npm install lodash` 仍进入既有判断（operator 调用 1 次）。**层级**：真实闸代码 + harness 驱动（离线替身），非真实模型会话。
6. **只读档裁定 A（P7 澄清）**：真实 `assembleReadonlyShellGate`：`npm test`/`npm run typecheck`/`node --test`/`tsc --noEmit`/`npm ci` 全部 `allow:false`、branch `readonly-deny`、reason 含对应档位（review/risky）；`ls -la` 仍 `c-allow`；只读档不接 operator/presenter/升级通道。**层级**：真实装配 + harness 驱动（离线）。
7. **审计（P5）**：见 §4.2。

## 六、未覆盖项 / 偏差（如实）

1. **无真实模型/网络会话**（纪律）：升级卡由真实桌面呈现端直接收到 `ShellEscalationCardRequest` 形状的卡，而非由真实角色模型触发 `request_shell_escalation` → 编排 registry → presenter 的整链。该整链（含资格/限流/授权消费/stale）由 B1/D1 以真实 registry/工具/闸 + 替身覆盖；D2 的客户可见面（卡、三选项、回包、暂停）为真实 Electron 呈现。
2. **多引擎覆盖边界**（团队计划 §10.2 第 5 项）：本轮真实 E2E 只走默认 `pi` 视图路径（卡/暂停通道与引擎无关）；Claude/Codex 真实引擎会话未运行——缺口记录，不用单测冒充。
3. **harness 不是 `app/main.ts` 整机进程**：本仓库既有 E2E 设计即自建窗口 + 同形 IPC/呈现端；暂停的模块级归属、shell-only 组合与治理组表达式以 `app/main.ts` 源码事实 + 真实 `createShellSessionPauseState`/`createDesktopOperatorChannel` 行为共同证明（`SE_PAUSE_SOURCE_*`、`SE_PAUSE_SHELL_REQUEST_GOES_TO_CUSTOMER`、`SE_RESUME_*`）。
4. **仲裁的整机等待路径**：审批卡在升级卡待答时的「主进程等待（不推达、从推达起计超时）」由 C1 单测四组时序覆盖；D2 验证了「审批卡待答 ⇒ 升级申请被拒绝」与渲染单槽不覆盖的真实侧可见部分。
5. **审计样例的三决定齐全性**：JSONL 样例覆盖 judge 放行/客户手批/客户升级授权/escalation-decision(allow-once)；拒绝/超时的 `escalation-decision` 由 B1/D1 单测覆盖，未在本 JSONL 中再生成（缺口，见 §4.2）。
6. **超时值**：真实清理超时用受控 `cleanupAfterMs=400`（同一产品核心，缩短等待），未等生产 120s 确认超时链；生产超时链语义由 C1 单测覆盖。
7. **既有 harness 未计数日志行抖动**：见 §4.3，已于未改动 HEAD 上复现，非本变更引入。

## 七、候选关键文件哈希（摘录；完整见 `$EV/candidate-hashes-final.txt`）

| 文件 | git hash-object | sha256 |
| --- | --- | --- |
| `test/桌面应用/e2e/main.mjs`（写后） | `af63ad65de1ea5df3c08d69dbe46af4c9aae5fc1` | `839312aee3555a2a23f876113b0c673349e9eedd5b5e1ad0df60f340caf5ffbd` |
| `app/desktop/shell-escalation.ts` | `da81ea1612744c7112a18b14e23775f4db67673f` | `49cccd0525b2ecd2fa2cf8e118faad1aaf285b61d91c0e74a5d75f4921308f46` |
| `app/desktop/confirm-card.ts` | `727eee4b691a73abb77245a059aa43190acf44c4` | `caff37db102e67f89986dd100cc38cd7698f93d2f247f16f7f572e61792ab7ab` |
| `app/desktop/operator-channel.ts` | `b6d461d12db8a5cb796fb18c782341a854580bd2` | `67cd7be6ba1f3bbb6db21223595ddbfa427f5714eca9471ed8adee3086b1b948` |
| `app/desktop/interface.ts` | `c5a454110d73156394723e56ec325b988d3301a8` | `285656a234eeb8209b06d93c12da1409d4db47f690750da4e244538c793bdc7f` |
| `app/main.ts` | `d4ae60aad9a28dde993215ba4337024a961ad009` | `475a228cef3772a099318bd4a0e5843f494983e2b0fc551da3aed80f27e57b27` |
| `app/preload.cjs` | `c40bb39e35c6e7e1539002976fb0306e136cf490` | `636c930aba095dc9345d70dcf0e719f36612e97818000951f935171e5da3d30d` |
| `app/renderer/src/shell/ConfirmCard.tsx` | `df7df1b20f9c39f2d877c55023dd4f53cde93e3c` | `4b59785b686a71518ce580c792dd66bb2733a56c9d3ef803b5e3cbd6c834c870` |
| `app/renderer/src/stores/confirm-store.ts` | `b1fc08c47f572bdd09bab5a6e934cae862f5bbd5` | `db864332fab2faa399212a03089e9e0dec863152b0e31a60c157b9fa3268f2a1` |
| `app/renderer/dist/index.html` | `d96b090de51251f9a68cc2f6bd33a238c3b0d67b` | `059b999154173e074c73c84f2288785d96e0239db8031c379a579761d5e2d2e2` |
| `src/service/gate/shell-rules.ts` | `40fb3949eab6056413622026f428e3a4397ffe26` | `c4ce294f81eaed5b28e32adfb8fb34fe6e3726a39c39b33fb2813363debb3533` |
| `src/common/门禁引擎/classify-shell.ts` | `b7ba987e1d56b9aff543cbbfcb88180f7bb2132e` | `b14ce0ca3b836eee45aa35292909de06f8a4ac4c02bf80716954cca0bca4ee0a` |
| `src/common/编排/shell-escalation.ts` | `fec2859f9df685f66fc480ed210fbcfac7b58075` | `2e459dba3eafb31c0263c0932b17057ab76cb32d9a921842d98f9319e990d8e6` |
| `src/common/编排/shell-gate.ts` | `1b184445ae2cb27bd364077a8bc057d5e81c7e58` | `0fad836ee5e21e4177a30a24cd717f0b8c83f104335ea14f9a4e7d7e86a38ce6` |
| `src/common/编排/shell-audit.ts` | `d814c07b1f51e74144325f3f3352ba381c4d07e9` | `a35f7312bfedf626d270d5c29787ee82fa2fd1404663e195154f53680f3b8125` |
| `src/pipeline/orchestration/shell-arming.ts` | `c38930436869afc71411671bb4721d526945cf6b` | `cfc5fbb49913fb40ef414306f6315f1e4afe944678f38eab3400af32328a8e9a` |

证据目录清单：`$EV/manifest-final-06.txt`（最终候选）、`$EV/manifest-sha256.txt`（过程清单）、`$EV/candidate-hashes-final.txt`、`$EV/06-run.exit`、`$EV/00-environment.txt`。

> 注：以上为 **D2 首轮候选**（06-run）。E2 返工后 `app/renderer/dist/` 已由 C2 重建（资产文件名变化），产品文件与 `e2e/main.mjs` 的当前候选哈希见 **§九（D2b）**；`$EV/candidate-hashes-d2b.txt` 为最新完整清单。

## 八、无越权改动与纪律声明

- 仅写：`test/桌面应用/e2e/main.mjs`（既有精确条目）与本报告。
- 未写 `app/**` 产品源码（含 `app/main.ts`、`app/preload.cjs`、`app/desktop/**`、`app/renderer/**`）、`src/**`、其他角色测试目录、`test/桌面应用/` 除 `e2e/main.mjs` 外的文件、`test/桌面UI/**`、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML；未新建 `test/桌面应用/e2e/` 下任何脚本；未改 `package.json`/锁文件/构建配方；`app/renderer/dist/` 未重建（非候选）。
- 未 commit / 未 push / 未合并 / 未发布；未使用 stash；未暂存文件。
- 未新增 skip/todo；未修改既有断言以保绿（既有断言逐字保留；新增检查全部为新增 `repairCheck`）；未启动真实模型/网络（除 harness 既有离线替身）；未要求或提供录屏（最多截图）。
- 若真实 E2E 必须改产品代码才能取证的情形：**未发生**（无需产品测试钩子）。
- 写集外改动：**无**。

## 九、E2 返工补证 D2b（2026-10-31 晚）

### 9.1 触发与修复落盘（只读引用，非本节点写入）

E2 返工后产品修复已落盘：C2 升级卡渲染**脚本上下文**（`approvalContext`：路径/sha256/有界内容/note/npmScript、写区外警示）、B1/C1 **pending 语义**（审批卡待答 ⇒ 升级 presenter 返回 `{action:"pending"}`；registry **不消耗**申请权/额度、保持 `recorded`、可稍后重试）、C2 `retryHint` 新措辞。`app/renderer/dist/` 由 C2 重建（资产 `index-1P177gky.js` / `index-CWivz_4o.css`）。D2b 仅扩展 `test/桌面应用/e2e/main.mjs` 并本报告，**未改产品代码**。

### 9.2 写集与哈希（D2b；仅 `e2e/main.mjs`）

| 文件 | 写前（D2 后）blob / sha256 | 写后 blob / sha256 | 行数（后） |
| --- | --- | --- | --- |
| `test/桌面应用/e2e/main.mjs` | `af63ad65de1ea5df3c08d69dbe46af4c9aae5fc1` / `839312aee3555a2a23f876113b0c673349e9eedd5b5e1ad0df60f340caf5ffbd` | `8cf1c00c30ee3dbf34d2e6354bdf6a418406b2b1` / `8c88c911dd4e523979c229e9a264cf78f52ecc4c1c058d4266be1d8508f29bd3` | 2859 |

### 9.3 改动内容（D2b）

1. **R1 脚本上下文**：新增 `seContextSample`（`scripts[0]`：`path=scripts/e2e-context.mjs`、`label=e2e-context.mjs`、内容 `console.log('e2e-context-sentinel');\n`、`bytes=37`、真实 sha256 `623e2d87…bb21`、`inWriteArea:false`；`note`；`npmScriptName=e2e-context-check`）并经 `seRequest(n, { approvalContext })` 呈现专用卡；断言 `#se-context` 区块（header/路径/sha256/内容逐字/说明/npm 脚本/「目标路径未匹配任何边界或不在可写范围内」警示）；无 `approvalContext` 的专用卡**不渲染** `#se-context`（旧卡兼容）。截图 39。
2. **AC-19 retryHint**：真实 IPC `shell:judge-result` 判拒行 → 展开详情（`.sj-details`）→ 断言 `.sj-exit` 显示新措辞「可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝）」且保留「关闭「替我审批」后重试（改为手动确认）」兜底。截图 40。角色可见回执（`judgeWayOut`）不在本 harness 生成，措辞由 D1 的 `b-deny-flow`/`c-manual-flow` 逐字断言覆盖（缺口见 §9.7）。
3. **R2 pending→allow-once（真实 registry + 真实 presenter/槽 + 真实 IPC/渲染）**：真实 `createShellEscalationSession`（`recordReview` 造判拒记录，含 `approvalContext`；`present` 转到每窗口真实 `shellEscalationPresenter`）+ 真实 `createShellConfirmPresenter` 待答审批卡。第一次 `registry.request(...)` → presenter 因槽占用返回 `pending` → 回执 `{ok:false,state:"pending"}`（「当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。」），**无卡推达、无 `escalation-decision` 审计、无授权**；解除审批卡后第二次申请 → presenter **再次调用**、真实升级卡呈现（并携带 `approvalContext`）、点击「允许一次」→ 回执 `{ok:true,state:"granted-once"}`（「仅此一次」），审计仅 1 条 `escalation-decision`（`branch:"escalation:granted-once"`、`action:"allow-once"`、`requestId` 与卡一致）。截图 41。
4. **既有断言同步（产品契约变更所致，不弱化）**：`SE_APPROVAL_PENDING_BLOCKS_ESCALATION` 由「`unavailable`」更新为「`pending`」；新增同场景 `SE_APPROVAL_PENDING_NOT_REJECTION`（断言 pending ≠ expired/unavailable/deny）。其余既有断言未改。
5. **截图新鲜度**：`shotFresh()` 截图前置顶测试窗口（`setAlwaysOnTop(true)`+`show`+`moveTop`+`invalidate()`）等待 500ms，拍后恢复置顶状态；不改尺寸/缩放、不改断言。用于 30–41 全部新截图。

### 9.4 E2E 复跑（最新候选 `$EV/09-run`）

- 命令：`ANS_E2E_OUTDIR="C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\D2\09-run" node_modules/.bin/electron test/桌面应用/e2e/main.mjs`
- 退出码：**0**（`$EV/09-run.exit`）；耗时 1m26.2s；Electron 44.7.0（内嵌 Node 24.21.0）；stdout 184 行 / sha256 `70d2efe47ca247f9b09a53f7526f96d22eb7693f9015a72910a9f17486a2ebff`。
- 报告：`$EV/09-run/report.txt`（512 行 / sha256 `770a9aabe99f841459e241e2dc0bb59d54da6784c78f71e2a6a480095b56eb44`）；**`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`**；无 `E2E_ERROR`/`WATCHDOG_TIMEOUT`/`WAIT_TIMEOUT`/`PROMISE_TIMEOUT`/renderer console error。
- 计数：**90/90** counted `SE_*` 检查 true（D2 既有 70 + D2b 新增 20）；截图 29 张（D2 26 + 39/40/41）；窗口 1360×860；无 DEBUG 覆盖层、无录屏。
- D2b 新增检查（全部 true）：`SE_CONTEXT_BLOCK_VISIBLE`、`SE_CONTEXT_BLOCK_HEADER`、`SE_CONTEXT_BLOCK_NOTE`、`SE_CONTEXT_BLOCK_NPM`、`SE_CONTEXT_BLOCK_PATH`、`SE_CONTEXT_BLOCK_SHA`、`SE_CONTEXT_BLOCK_CONTENT`、`SE_CONTEXT_BLOCK_WRITE_WARNING`、`SE_CONTEXT_ABSENT_FOR_OLD_CARD`、`SE_JUDGE_RETRY_HINT_NEW_WORDING`、`SE_APPROVAL_PENDING_NOT_REJECTION`、`SE_PENDING_RECEIPT`、`SE_PENDING_NOT_EXPIRED_OR_DENIED`、`SE_PENDING_NO_CARD_NO_AUDIT`、`SE_PENDING_PRESENTER_CALLED_ONCE`、`SE_PENDING_APPROVAL_RELEASED`、`SE_PENDING_RETRY_ALLOW_ONCE`、`SE_PENDING_PRESENTER_CALLED_TWICE`、`SE_PENDING_CARD_CARRIES_CONTEXT`、`SE_PENDING_AUDIT_ONLY_ON_ALLOW`。

原始断言输出摘录（`$EV/09-run/report.txt`）：

- `SE_CONTEXT_BLOCK={"visible":true,"header":"脚本上下文（judge 判拒时所依据）","note":"说明：有界内容（≤16KiB；D2b 夹具）","npm":"npm 脚本：e2e-context-check","path":"脚本：scripts/e2e-context.mjs","label":"e2e-context.mjs","sha":"sha256：623e2d87…bb21","warning":"目标路径未匹配任何边界或不在可写范围内","content":"console.log('e2e-context-sentinel');\n","bytes":"37"}`
- `SE_RETRY_HINT={"open":true,"hint":"可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝），或关闭「替我审批」后重试（改为手动确认）。"}`
- `SE_PENDING_RECEIPT={"ok":false,"message":"当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。","state":"pending"}`
- `SE_PENDING_SECOND_RECEIPT={"ok":true,"message":"已获客户允许：仅此一次（allow-once；requestId 416713fa-3429-429a-8024-0dfddea196f1）。请原样重试该精确命令——仅下一次完全匹配的 run_shell 调用会放行一次；未执行任何命令。","state":"granted-once"}`

### 9.5 截图（`$EV/09-run/`；窗口 1360×860；capturePage；无 DEBUG/录屏）

| 文件 | 内容 | sha256 |
| --- | --- | --- |
| `39-escalation-script-context.png` | 升级卡脚本上下文区块：header / 说明 / npm 脚本 / 路径 / label / sha256 / 写区外警示 / 有界内容逐字 | `32520e7c775e907caaa27f1c56f5a2f3bf9790d7b258d58e081faa4ea75f54c0` |
| `40-judge-retry-hint.png` | 判拒结果行详情展开：`retryHint` 新措辞 +「关闭「替我审批」后重试」兜底 | `cf0d2e29f8202e65d69667e927e3c63ef92601540a29495947ecc28fabde63f6` |
| `41-escalation-pending-then-allow.png` | pending 解除后的重试卡（真实 registry→presenter→渲染；携带脚本上下文），随后 allow-once 成功 | `a3ae7e1a7382a97bbcf4ae71b5a6ba2614acb3575fca215ed4c8336226eecea4` |

### 9.6 审计与候选哈希（D2b）

- 09-run 文件审计样例：`$EV/09-run/gate-fixture-project/docs/audit/shell-gate.jsonl`（6 行 / sha256 `84a2198c430bf5e5dc16ebdbbb1066b5320ce805cd40b80dac3580bcef582fa2`），仍覆盖 judge 放行 / 客户手批 / 客户升级授权 / `escalation-decision` 四类（同 D2 §4.2）。
- pending 场景的审计由 **真实 registry + 内存 sink** 断言：pending 时 `escalation-decision` 记录数 = 0（未写审计），allow-once 后恰 1 条且字段匹配（§9.3 第 3 点）。
- 当前候选关键文件（完整见 `$EV/candidate-hashes-d2b.txt`；dist 为 C2 重建产物）：
  - `test/桌面应用/e2e/main.mjs`：blob `8cf1c00c…` / sha256 `8c88c911…`；
  - `app/desktop/shell-escalation.ts`：blob `0ced2ad8…` / `d0d0fa12…`；
  - `src/common/编排/shell-escalation.ts`：blob `c86d91c1…` / `0ba2df5b…`；
  - `src/model/runtime.ts`：blob `5b39807b…` / `5602c36f…`；
  - `app/renderer/src/shell/ConfirmCard.tsx`：blob `d3301f5c…` / `e4d28400…`；
  - `app/renderer/src/chat/judge.ts`：blob `705b6b3b…` / `52d0556e…`；
  - `src/common/shared/i18n/messages/zh-CN.ts`：blob `b1c63a44…` / `4a944f0e…`；`en-US.ts`：blob `945d4779…` / `56f0706b…`；
  - `app/renderer/dist/index.html`：blob `31512574…` / `b8a8de3b…`；`assets/index-1P177gky.js`：blob `c53ecab4…` / `2e0cec06…`；`assets/index-CWivz_4o.css`：blob `0886861b…` / `2da0e4c5…`。

### 9.7 基线对照、未覆盖项与纪律（D2b）

- **基线对照**：D2b 运行与 `$EV/00-baseline`（写前基线）的 counted 检查（`repairCheck`/`hardCheck`）全部通过；既有 harness 中 10 条**未计入通过门**的日志行（如 `HANDBACK_CARD_PRESENT`、`S1_NOT_YANKED`）在 D2b 运行中为 false。以**未改动的 HEAD harness + 当前构建**做对照运行（`$EV/10-head-control`，`E2E_PASS=true`），同样出现这 10 条 false——分类为**既有未计数日志行的时序抖动**（与 D2 §4.3 同类），不是 D2b 引入；新增确定性失败 = 0、新增 skip/todo = 0。
- **未覆盖项**：① R2 pending 用真实 registry + 真实 presenter/槽 + 真实 IPC/渲染验证，但未由真实 `run_shell` 工具调用触发（真实模型/工具链由 D1 覆盖）；② 角色可见 `judgeWayOut` 回执未在本 harness 生成（由 D1 `b-deny-flow`/`c-manual-flow` 逐字断言）；③ 脚本上下文为 harness 夹具（真实 `approvalContext` 的读取/有界/惰性来源在编排 `shell-approval-context` 与 D1 覆盖），非真实脚本文件；④ 多引擎仍只走 pi 视图路径（与 D2 同缺口）；⑤ pending 期间「已有升级卡待答」的分支未单独在 E2E 构造（同一 `canPresent` 逻辑，由 C1/D1 单测覆盖）。
- **纪律**：D2b 未 commit/push/发行；未改产品代码（C2/B1/C1 修复为其他角色落盘，本节点只读消费）；未新建 `test/桌面应用/e2e/` 其它脚本；未新增 skip/todo；未改断言保绿（`SE_APPROVAL_PENDING_BLOCKS_ESCALATION` 的同步见 §9.3 第 4 点）；写集外改动：**无**。
