# 修复后构建（34484f3）真机复核 — 测试角色报告

- 日期：2026-10-21
- 角色：测试（独立上下文；不改产品代码、不修测试断言）
- 复核对象：PR 分支修复提交 `34484f3`（dedupe replayed dispatch rows / ANS brand icon / watchdog no default turn abort）
- 结论：**新 dist 加载正确；需求确认卡弹出；角色名与品牌图标断言通过；genesis 派发去重通过（无重复、不同步骤保留）；零 console/CSP。** 一个风险发现：加载 genesis 项目会自动恢复 verifier 待办并启动真实模型回合、写入 verifier 会话文件；本次已停止并按原哈希截断恢复，项目 61 个文件与事前完全一致。**本复核范围内可合并**（风险项建议产品/PM 确认）。

## 一、环境与构建验证

| 项 | 值 |
| --- | --- |
| 机器 | macOS 26.6.2（25G83）arm64，Darwin 25.6.0 |
| Node / Electron | v24.14.0 / 44.7.0（开发版） |
| ANS 仓库 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime`，分支 `feat/ui-platform-nova`，HEAD `34484f3` |
| 启动 | `./node_modules/.bin/electron app/main.ts --user-data-dir=/tmp/ans-fixed-userdata --remote-debugging-port=9340` |
| 新 dist（磁盘） | HTML `f779ac60c39d341db7f10d76bde343cc1424c99935bf1859679602427ca1c88b`、JS `index-CFjc0h-3.js`、CSS `index-BYYh-X8f.css`、图标 `ans-studio-ans-icon-DOpmqMAU.png` |
| 新 dist（CDP 载入原文） | HTML sha256 **`f779ac60…` 一致**（581 B）；DOM `script src=./assets/index-CFjc0h-3.js`、`link href=./assets/index-BYYh-X8f.css` |
| 引擎 | 菜单实测 **Pi / 已配置**（Codex、Claude 缺配置） |
| 模型 | provider `ans-gateway`，modelId `deepseek-v4-flash[1m]`，thinkingLevel `medium`（取自 Pi 会话 JSONL；未读取/打印 `.env`） |
| 双开关 | 「替我审批」「替我决策」开局均关 |

## 二、真实模型需求确认卡（A）

空 demo `/Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-intent-card-e2e`（`git init`、仅 README，HEAD `49df32d`）；发送唯一消息「我想做一个最简单的待办清单网页应用，请先确认需求。」

| 断言 | 结果 | 实测 |
| --- | --- | --- |
| 需求卡弹出 | **通过** | `op-1`，`open`，发送后 **22.62s** 可见 |
| 在 Lead pane 内 | **通过** | `surfaceRoleId=liaison`、`selectedRoleId=liaison`、`sessionOpenRoleId=liaison`；状态「待选择」 |
| 徽标「需求确认 · 客户」 | **通过** | `.op-gov-badge` |
| 「权力类型：需求确认」 | **通过** | `.op-meta`：`流程：todo-web-app`、`权力类型：需求确认` |
| confirm / revise 可见 | **通过** | `confirm`「确认：按此目标、范围与验收标准推进」、`revise`「需要修改：我来说明要改的地方」；均 `visible=true`、`unobstructed=true`（960 下亦然） |
| 提交 / 取消可见 | **通过** | `.op-submit`「提交」（未选时 disabled）、`.op-cancel`「取消」；均可见、中心未遮挡 |
| 锚定 | **通过（记录实际位置）** | 卡片落聊天流**最后一行**（row 7 / 共 8 行），卡片内 lifecycle=`调用发起`，前一行 `write_file docs/intents/todo-web-app.md`（执行完成）；工具为 `request_choice`（`cardKind=intent-confirm`），等待客户期间无独立完成行 |
| 未回答 | **通过** | 截图后仅点「停止本轮」；卡片 `expired`（「未获同意…本轮已停止」），未点 confirm/revise/提交 |
| console/CSP | **通过** | CDP errors 0；页面 errors/rejections/csp 均 0 |

**计时（模型侧取 Pi 会话时间戳，相对用户消息）**：UI busy 0.46s；首个模型活动（`list_dir`）4.75s；`read_file README` 5.84s；写意图 `docs/intents/todo-web-app.md` 17.58s（回执「已获准并落盘」，5370 B）；`request_choice cardKind=intent-confirm` 22.66s；**卡片 UI 可见 22.62s（自发送点击）**；停止本轮 27.30s；驱动总耗时 29.32s。模型先 `list_dir .`（成功）与 `list_dir docs`（此时 docs 不存在 → 「路径不存在或不可访问」），随后继续，不影响结论。

**写盘与项目前后**：未出现写盘确认卡（trio 下 Lead 的 `docs/intents/**` 预授权，`write_file` 直接落盘）；README SHA-256 前后一致（`4303d7c5…`）；仅 demo 内新增 `docs/intents/todo-web-app.md`（`d819ea6f…`，与 `.ans/governance/ledger.jsonl` 的 artifactSha256 一致）及 app 自动写的 `.ans/sessions/liaison/pi/**`；`git status` 仅 `?? .ans/`、`?? docs/`；无 ANS 仓库或 demo 外写入。

## 三、角色名与品牌图标（A）

- 角色树（1360 与 960 实测）：`主理 / Lead`、**`Draft / 提案`**、**`Crew / 组队`**、**`Steward / 统筹`**、`验收 / Proof`；旧称「报告员 / 提名官 / 召集人」**不存在**。
- 标题栏：`img.titlebar-mark`，`alt=ANS`，`width=20 height=20`，渲染 **20×20**，自然尺寸 1024×1024，`border-radius:4px`，`object-fit:contain`；旧 `span.titlebar-mark` **为 null**；`.titlebar-brand` 直接文本为空（保留「治理会话工作台」副标）。
- 左栏：`img.workspace-brand-mark`，`alt=ANS`，`width=30 height=30`，渲染 **30×30**，自然 1024×1024，`border-radius:6px`；`.workspace-brand` 直接文本为空（保留「AGENT WORKSPACE」文本）；无文字 ANS mark。
- 截图：[brand-roles-1360x860.png](2026-10-21-fixed-build-real-machine-evidence/brand-roles-1360x860.png)、[brand-roles-960x620.png](2026-10-21-fixed-build-real-machine-evidence/brand-roles-960x620.png)（可见黑底绿 ANS 图标；960 下标题栏副标按既有响应式隐藏，图标仍在）。

## 四、Genesis 历史回放派发去重（B，只读）

项目 `/Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-genesis-demo`（未发送任何消息）。派发行以 DOM `.msg-injected.is-dispatch` 扫描（滚动遍历虚拟列表，按 `data-row-id` 去重）；「去重前」取 replay.jsonl 中同一投递的两种投影（`user` 行 + `prompt-input` message 事件）。

| pane | replay 行 | 去重前派发投影 | 去重后派发行 | 总行数（UI） | 重复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| convener | 355（17 user + 338 event） | 8（4 user + 4 event） | **4** | 229 | **0** | 通过 |
| todo-app-dev | 473（5 user + 468 event） | 10（5 user + 5 event） | **5** | 322 | **0** | 通过 |

- **convener 4 条**（各一次，首行）：
  1. 来自 Lead / 主理：提案阶段已冻结契约，但流程状态文件缺失…需 Steward 建立 flow 与步骤；
  2. 来自 Lead / 主理：人读视图与账本状态不一致，需修正以免误导（内部文档准确性）；
  3. 来自 Lead / 主理：回答 Steward 提出的偏差确认请求；
  4. 来自 Lead / 主理：重发协调任务（上一版引用不存在的契约路径被拒）。
- **todo-app-dev 5 条**（各一次，stepId 计数均 = 1）：`delivery-store`、`delivery-tests-docs`、`delivery-ui`、`integration-e2e`、`verification-evidence`。
- **与预期对照**：convener 4 条与预期一致；todo-app-dev 当前项目回放含 **5** 个不同派发，而任务给的预期是 2 条（delivery-store、delivery-tests-docs）。两条点名的派发**均只出现一次**，另三条不同步骤也各只出现一次——**没有重复、没有误删**；预期 2 条应为项目更早快照，当前 genesis 已推进到 verification-evidence。建议以「每条唯一 + 不同步骤保留」为验收口径。
- **行数口径**：replay 355/473 行包含工具事件等其它投影，不能直接当作「去重前行数」；本报告以**派发投影** 8→4、10→5 作为去重前后口径，并另记去重后 UI 总行数 229/322。
- 截图：[convener-1360](2026-10-21-fixed-build-real-machine-evidence/convener-dispatch-1360x860.png) / [convener-960](2026-10-21-fixed-build-real-machine-evidence/convener-dispatch-960x620.png)、[todo-app-dev-1360](2026-10-21-fixed-build-real-machine-evidence/todo-app-dev-dispatch-1360x860.png) / [todo-app-dev-960](2026-10-21-fixed-build-real-machine-evidence/todo-app-dev-dispatch-960x620.png)，均含派发行与侧栏品牌图标。角色树实测含 6 角色（五内置新称 + `todo-app-dev`）。零 console/CSP。

### 只读与自动恢复发现（重要）

- 加载 genesis 项目**并非无副作用**：app 在加载后自动恢复了一条 verifier 待办（用户提示「流程 todo-spa-genesis 步骤已全部完成…请汇总证据并出验收卡…」），于 **14:55:02Z**（本地 22:55）启动真实模型回合（14:55:13Z 出现 `request_confirmation` 调用发起），并向项目写入：
  - `.ans/sessions/verifier/pi/ans/replay.jsonl` **+12,324 B**；
  - `.ans/sessions/verifier/pi/native/2026-10-21T14-44-34-941Z_…jsonl` **+10,770 B**。
- 我们**未发送任何消息**、未点任何卡；发现后立即停止应用。两文件均与原哈希在行边界前缀匹配（append-only），已按原长度截断恢复：`replay.jsonl` 383,859 B、native 443,904 B；恢复后 genesis 全部 **61 个文件 SHA-256 与 pre-state 完全一致**，git status 不变。恢复前的追加副本保留在 `genesis-post/changed/`。
- 该行为可能是「重启续跑/待办恢复」的既有设计，但与「加载即只读」的测试预期冲突；重复加载会再次触发模型回合并消耗额度。**建议产品/PM 明确该自动恢复的预期与开关**，并对需要只读取证的项目先做副本或暂停恢复。

## 五、Watchdog「默认不再 15min 自动中止」

- 按提交 diff 静态核对：`DEFAULT_TURN_ABORT_MS = 0`，`turnAbortMs` 仅在显式覆盖或 `ANS_PI_PROMPT_TIMEOUT_MS` 正整数时返回正时限，自动中止分支增加 `abortLimit > 0` 守卫；未配置时只到点提示、不自动中止（1h 运行时硬上限保留）。
- **本次未做 15 分钟实跑**（需求卡回合仅 29s）；该项为源码/提交层面核对，不做运行时通过声明。

## 六、失败项与风险

| 项 | 状态 |
| --- | --- |
| 新 dist / 需求卡 / 角色名 / 品牌图标 | **通过** |
| genesis 派发去重（无重复、不同步骤保留） | **通过**（convener 4、todo-app-dev 5；预期 2 条为旧快照） |
| console / CSP | **通过**（A/B 均 0） |
| 960 浮标轻微重叠 | 观察（「1 条待确认 · 定位」与卡片动作区右下缘轻微视觉重叠，按钮中心未遮挡；建议 UIUX 关注，不阻塞） |
| genesis 加载自动恢复 verifier 待办 | **风险**（已恢复项目字节；需产品确认只读/静默预期） |
| watchdog 15min 默认关闭 | **仅静态核对**，未做 15min 实跑 |

## 七、是否可合并

**本复核范围内可合并**：修复后构建加载正确，需求卡、角色显示名、黑底绿 ANS 图标、派发投影去重均通过，零 console/CSP。合并前建议 PM 就「加载 genesis 自动恢复 verifier 待办并启动模型回合/写会话」这一点确认是否符合预期；若要求加载严格只读，需要另行处理。genesis 项目已恢复为事前字节状态。

## 八、证据与边界

- 报告：本文件；证据索引：[2026-10-21-fixed-build-real-machine-evidence/index.md](2026-10-21-fixed-build-real-machine-evidence/index.md)；机器可读：[summary.json](2026-10-21-fixed-build-real-machine-evidence/summary.json)、[timings.txt](2026-10-21-fixed-build-real-machine-evidence/timings.txt)。
- 只写 `角色卡/测试/`；未改产品代码/构建/配置/测试断言；未读取/打印 `.env`（模型名取自 Pi 会话记录）；未 commit/push。genesis 项目未留净变更（自动恢复追加已按原哈希恢复）。截图由 `.gitignore` 排除，本地保留。
