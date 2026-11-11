# snake-game · A2 意图撰写派发记录

- flowId：snake-game
- workflowId：wf-bcc993de8e5de70f7c2b8c39
- 阶段：A2（意图撰写）
- 来源：幕僚 stage-request #t-mwb69neo-109db8db（路径 A）

## 派发

- 有效派发：A2 意图撰写任务 `#t-mwb6ab25-4b0eedc5` → 目标角色 `product`，stage=A2、sideEffect=docs、无 module。
- 作废派发：`#t-mwb6a05e-6c608618`（同一 A2 内容，应用按任务文本将 sideEffect 升类为 code，与 stage-request 要求的 docs 不符）；已在新任务文本中声明以 `#t-mwb6ab25-4b0eedc5` 为唯一有效派发，要求产品不要重复产出。该旧任务待产品回交后按真实状态处理，不冒充完成。
- 任务写集：仅 `docs/product/` 下意图文档；不写 docs/intents/**、提案/模块/名单/契约、源码或配置。

## 产出要求

- 文档：`docs/product/snake-game-intent-v1.md`（文件名 -vN 的 N 与 frontmatter version 一致）。
- frontmatter：schema=project-intent/v1、intentId（小写唯一 slug，≠ flowId）、flowId=snake-game、version、goal、scope、acceptance、nonGoals；可选 constraints。
- 正文：客户原话逐字；A1 记录的待澄清缺口逐项处置（平台/技术栈、界面形态与尺寸、边界碰撞行为、计分与速度规则、重开方式、可选能力、验收证据形态）；未确认项以合理默认 + 假设/待确认标注。
- 证据只报告路径与 frontmatter 实际值、缺口/假设清单、结论；不给哈希、不以命令行/脚本计算哈希。

## 缺口与假设（来自 A1 记录，供 A2 处置）

1. 目标平台/技术栈与运行方式 —— 待产品给出默认假设并标注。
2. 界面形态、尺寸与视觉风格 —— 待默认假设。
3. 边界碰撞行为（撞墙失败/穿墙/停止）—— 待默认假设。
4. 计分规则（每次得分、速度递增、最高分）—— 待默认假设。
5. 重开方式与是否清零/保留最高分 —— 待默认假设。
6. 可选能力（暂停/难度/音效/移动端/本地存储）—— 默认列入 nonGoals 或待确认。
7. 验收方式与证据形态 —— 待在 acceptance 中给出可核验口径。

## 产出核验（controller 实读）

- 文档存在：`docs/product/snake-game-intent-v1.md`。
- frontmatter 实际值：schema=`project-intent/v1`；intentId=`snake-classic-game`（小写 slug，≠ flowId `snake-game`）；flowId=`snake-game`；version=`1`（与文件名 -v1 一致）；goal/scope/acceptance/nonGoals 均为非空文本，另有 constraints 记录假设。
- 正文核验：逐字包含客户原话「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）」；逐项处置 A1 的 10 条缺口；未确认项以「假设/待确认」标注，未冒充已确认需求；含 AC-1～AC-7 可核验验收条款。

## 收口条件

A2 完成 = 产品任务 closed accepted + 意图文档存在且 frontmatter 一致（哈希由应用按真实字节计算）。

## 收口尝试记录（2026-11-11，重发调度请求 #t-mwb6aw7h-fd5bb97c）

- 对 `t-mwb6ab25-4b0eedc5`（有效 A2 派发）调用 `close_created_task(outcome=accepted)` → 拒绝：`close-report-missing`（accepted 收口要求已有 `task.reported(status=done)`）。
- 对 `t-mwb6a05e-6c608618`（首次同内容派发）同样调用 → 拒绝：`close-report-missing`。
- 机器事实：两个 A2 产品任务当前 status=delivered，但均无 `task.reported(status=done)` 记录；产品侧报告未落到这两个任务上，故 accepted 收口无法完成。
- 处置：不伪造报告、不改写文档；如实上报「产品任务缺 task.reported(status=done)，accepted 收口被 close-report-missing 拒绝」，待产品侧补交对应任务报告后方可收口。
- 说明：本运营的 `submit_report` 工具实际字段仅 `status`(completed|blocked) / `summary` / `evidence`，无 `taskId`/`sourceTaskId` 关联字段；状态枚举亦无 `done`。只能把调度请求任务号写入报告正文/证据，不能伪造关联字段。

## 应用侧关联缺陷（幕僚 blocker 记录，2026-11-11）

- 项目状态 blocker 记载：「应用侧报告-任务关联缺陷：product/convener 的 submit_report 均以「任务关联未知」到达，task 无 task.reported(status=done)，导致 close_created_task accepted 一律 close-report-missing（A1/A2 调度请求、…）」。
- 复测：对 `t-mwb6ab25-4b0eedc5` 再次调用 accepted 收口（operationId=op-snake-a2-close-accept-20261111-4），仍返回 `close-report-missing`。
- 结论：这是应用侧报告-任务关联缺陷导致的系统性阻塞，非本任务内容缺失；在缺陷修复或应用补记 `task.reported(status=done)` 前，A2 无法按 accepted 收口。意图文档与版本事实（应用记录 flow=snake-game kind=intent latest=1 path=docs/product/snake-game-intent-v1.md）已存在，不重写、不伪造。
