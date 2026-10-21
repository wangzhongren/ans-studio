# 需求确认卡（intent-confirm）真实 Pi 流程 e2e — 测试角色报告

- 日期：2026-10-21
- 角色：测试（独立上下文；本角色只验证，不改产品代码、不修测试断言）
- 结论：**需求确认卡已弹出，断言全部通过**。Lead（主理/liaison）在真实 Pi 网关流程中先写意图文件，再发 `request_choice`（`cardKind=intent-confirm`）需求确认卡；卡片在 Lead 聊天 pane 内，含徽标「需求确认 · 客户」与 `权力类型：需求确认`，`confirm`/`revise` 两个选项均可见；截图后停止本轮，**未点击确认/修改**，卡片以 `expired`（未获同意）收尾。无 console/CSP 错误。

## 一、环境与候选

| 项 | 值 |
| --- | --- |
| 机器 | macOS 26.6.2（25G83）arm64，Darwin 25.6.0 |
| Node / Electron | v24.14.0 / 44.7.0（开发版） |
| ANS 仓库 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime`，分支 `feat/ui-platform-nova`，HEAD `a18e9ef` |
| 渲染器 | `app/renderer/dist`，HTML sha256 `c8ad0e82…`，JS `index-Oqlp-kNL.js`（未重建，直接使用现有 dist） |
| 演示项目 | `/Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-intent-card-e2e`（新建、`git init`、仅 README 的提交 `49df32d`） |
| 启动 | `./node_modules/.bin/electron app/main.ts --user-data-dir=/tmp/ans-intent-card-userdata-run2 --remote-debugging-port=9338` |
| 引擎 | 菜单实测 **Pi / 已配置**；Codex、Claude 均「缺配置」 |
| 模型 | provider `ans-gateway`，modelId `deepseek-v4-flash[1m]`，thinkingLevel `medium`（以 Pi 会话 JSONL 为准；未读取/打印 `.env`） |
| 双开关 | 「替我审批」「替我决策」开局均为**关**（未改） |

## 二、方法

1. 独立 userData 启动开发版；CDP 连接渲染器（`window.__ansRenderer` 真实 IPC 等价通道）。
2. 加载空 demo 项目；确认 `governanceModel=trio`、5 个内置角色、`governanceRecord=missing`。
3. 引擎切 Pi，并打开引擎菜单留证（Pi 已配置）。
4. 选 Lead，确认会话打开、输入框可用；发送唯一一条消息：  
   「我想做一个最简单的待办清单网页应用，请先确认需求。」
5. 轮询聊天流：
   - 若出现**写盘确认卡**（`kind=confirm`、带「确认/拒绝」）：解析卡内路径，仅当全部路径都在 demo 项目内才点「确认」，任何绝对路径越界、`..` 逃逸或无法核对路径即点「拒绝」并记录；
   - 出现**需求确认卡**（徽标「需求确认」或 `权力类型：需求确认`）即停止轮询，**不回答**；
   - shell 确认卡一律不点（本轮实际未出现）。
6. 在 1360×860、960×620 两个尺寸下截图并抓 DOM（`window.resizeTo` + CDP `Emulation.setDeviceMetricsOverride` 固定视口；两档截图像素分别为 1360×860、960×620；960 档外层窗口保持 1360×860，属**视口级**窄档截图，非 OS 窗口缩放）；随后点「停止本轮」结束该轮（不点确认/修改）。
7. 前后对比 demo 项目文件清单与 SHA-256、git status；解析 Pi 会话 JSONL 取模型侧工具序列与计时。

驱动脚本：[probes/intent-card-e2e.mjs](2026-10-21-intent-confirm-card-e2e-evidence/probes/intent-card-e2e.mjs)。  
主证据（clean project，run2）：[model-run.json](2026-10-21-intent-confirm-card-e2e-evidence/model-run.json)。首跑 run1 归档于 [run1/](2026-10-21-intent-confirm-card-e2e-evidence/run1/)，用于交叉印证（结论相同；960 截图下半部被 composer 遮挡，故重跑 run2 并改为每次 resize 后重新滚动到卡）。

## 三、结果：卡片断言

| 断言 | 结果 | 实测 |
| --- | --- | --- |
| 卡片弹出 | **通过** | `op-1`，`data-state=open`，发送后 **23.80s** 可见 |
| 在 Lead 的聊天 pane 内 | **通过** | `surfaceRoleId=liaison`；`selectedRoleId=liaison`；`sessionOpenRoleId=liaison`；角色状态「待选择」 |
| 含徽标「需求确认 · 客户」 | **通过** | `.op-gov-badge` 文本＝`需求确认 · 客户` |
| 含「权力类型：需求确认」 | **通过** | `.op-meta`：`流程：todo-list-web`、`权力类型：需求确认` |
| confirm 与 revise 两个动作可见 | **通过** | 单选 `value=confirm`「确认，就是这样」、`value=revise`「要修改」；两者 `visible=true`、`unobstructed=true`（960 下亦然） |
| 「提交 / 取消」动作可见 | **通过** | `.op-submit`「提交」（未选时 disabled）、`.op-cancel`「取消」；均可见且中心未被遮挡 |
| 卡片与工具调用锚定 | **通过（记录实际位置）** | 卡片位于聊天流**最后一行**（row 8 / 共 9 行），紧邻其自身 `request_choice` 调用（卡片内 lifecycle=`调用发起`）；前一行是 `write_file docs/intents/todo-list-web.md`（调用发起 → 执行完成）。因该工具正等待客户回答、尚未完成，故没有单独的 `request_choice` 完成行——卡片就是该调用锚点。详见「六、观察与说明」第 2 条 |
| 1360×860 / 960×620 截图 | **通过** | `intent-card-1360x860.png`、`intent-card-960x620.png`（截图像素即两档尺寸；1360 档 inner/outer 均 1360×860，960 档为视口 960×620、外层窗口仍 1360×860）；960 下卡片完整位于 composer 上方（`fullyAboveComposer=true`） |
| 未点击确认/修改 | **通过** | 截图后仅点「停止本轮」；卡片随后 `expired`，文案「请求已失效，未获同意。原因：本轮已停止或会话已重建，旧确认失效。」 |
| console / CSP | **通过** | CDP errors 0；页面 errors/rejections/csp 均 0 |

**卡片 DOM（1360 实测）**：容器 `.op-request[data-request-id=op-1][data-state=open][data-surface-role-id=liaison]`，class 含 `op-request`；标题 `.op-title`＝「需求确认：最简单待办清单网页应用」；徽标 `.op-gov-badge`＝「需求确认 · 客户」；`meta` 含流程与权力类型；预览 `.op-preview`（`<details>`，摘要「预览内容」，正文为目标/范围/验收标准，752 字符）；选项 `.op-options` 两个 radio；动作 `.op-actions` 内 `.op-submit`「提交」、`.op-cancel`「取消」。卡片 rect：1360 下 900×291，960 下 664×291。

## 四、计时（run2，模型侧取 Pi 会话时间戳）

| 事件 | 相对发送 |
| --- | --- |
| UI busy（同刻出现「思考等级 medium」系统行） | 0.40s |
| 首个模型活动（`list_dir`） | 5.46s |
| 非治理 `request_choice`（质量档位三选一，被结构性拒绝、未弹卡） | 11.77s |
| `write_file docs/intents/todo-list-web.md`（预授权，直接落盘） | 20.12s |
| 首段正文（39 字说明） | 20.12s |
| `request_choice cardKind=intent-confirm`（模型调用） | 23.54s |
| **需求卡在 UI 可见** | **23.80s** |
| 停止本轮（工具结果「被中止，未获客户回应」） | 28.36s |
| 驱动总耗时（含双尺寸截图与停止） | 30.43s |

run1 对照：首个模型活动 1.42s、写意图 19.97s、`intent-confirm` 调用 24.19s、卡片可见 24.25s；与 run2 同一数量级。

## 五、写盘确认卡与项目前后

- **本轮未出现写盘确认卡**（`writeCards=[]`）。原因：trio 下 Lead 的 `docs/intents/**` 是**预授权目录**，`write_file` 直接获准并落盘；工具回执原文：`write_file 已获准并落盘：docs/intents/todo-list-web.md（3814 字节写入 /Users/.../ui-platform-intent-card-e2e/docs/intents/todo-list-web.md）`。因此没有需要批准/拒绝的写卡。
- 前后对比（[pre-state](2026-10-21-intent-confirm-card-e2e-evidence/pre-state/)、[post-state](2026-10-21-intent-confirm-card-e2e-evidence/post-state/)）：
  - `README.md` SHA-256 前后一致（`4303d7c5…`），git HEAD 未变；
  - 新增仅 demo 内：`docs/intents/todo-list-web.md`（sha256 `e057fe58…`，与 `.ans/governance/ledger.jsonl` 的 `artifactSha256` 一致）与 app 自动写的 `.ans/sessions/liaison/pi/{ans, native}`、`.ans/governance/ledger.jsonl`；
  - `git status`：`?? .ans/`、`?? docs/`；无 ANS 仓库或 demo 之外的写入。
- ANS 仓库产品/构建/配置零改动（`git status` 仅本角色文档与既有测试改动）。

## 六、观察与说明

1. **卡片工具是 `request_choice`，不是 `request_confirmation`**：Lead 的治理契约只允许 `request_choice(cardKind=intent-confirm)`（角色卡明文「Lead 不使用 request_confirmation 做治理写盘」）。需求确认卡因此是 choice 卡：两个选项 `confirm`/`revise`，动作按钮是「提交/取消」（提交在未选项时 disabled）。任务描述中的「confirm/revise 两个动作按钮」在实现中对应这两个可见选项；如按「按钮」字面理解，建议后续 UI 术语统一。
2. **卡片落尾而非落中**：卡片位于聊天流最后一行，锚定其自身尚未完成的 `request_choice` 调用（lifecycle「调用发起」）；工具完成行不会在等待期间出现。任务允许「非落尾也可接受」，此处如实记录为落尾。
3. **模型先发过一张非治理卡**：run2 中模型先试图用 `request_choice`（无 `cardKind`）问客户质量档位（原型/生产/要改），编排按 Liaison 卡种白名单**结构性拒绝**、未向客户弹卡（回执：「这是内部协调/工程决策，不应要求客户选择…客户只处理 intent-confirm 需求确认」），模型随后自行定档、写意图并发出正确的 intent-confirm。该行为符合隔离设计，不是失败。
4. **960 浮标轻微重叠**：960×620 下「1 条待确认 · 定位」浮标与卡片动作区右下缘有轻微视觉重叠；按钮中心命中测试未被遮挡，按钮仍可点击。建议 UIUX 关注（不阻塞本次验证）。
5. run1 与 run2 均弹出需求确认卡；run1 的 960 截图因未在 resize 后重滚而只露出卡片上半部，故以 run2 为主证据、run1 仅作交叉印证。

## 七、失败原因

无。卡片弹出、位置、徽标、权力类型、confirm/revise 可见性、双尺寸截图、未作答与停止本轮、console/CSP、项目写入范围均符合预期。

## 八、边界

只写 `角色卡/测试/`（报告、证据、memo/changelog）；未改产品代码、构建或配置；未修任何测试断言；未读取/打印 `.env`（模型名取自 Pi 会话记录）；未 commit/push。演示项目为外部目录，仅在 demo 内产生意图文件与 app 自动会话/账本文件。
