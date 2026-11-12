# 调度准备结论：wuxia-roguelike（A1 时点）

- flowId: `wuxia-roguelike`
- workflowId: `wf-e6a70e9eace7a4f6d16e7ad9`
- 阶段：A1（受理/准备，路径 A 起点）
- 依据：Chief 派发任务 `#t-mwc6f1dl-e9d8e129`；应用内置 Chief workflow v2（两条固定路径）；`docs/workflow.md`。
- 时点事实（应用只读）：项目为空目录、无 Git 仓库、无 run/versions/evidence；unclosed=1（即本 A1 任务）。

## 一、拟派角色与分工

| 阶段 | 角色 | 说明 |
| --- | --- | --- |
| A1 受理与准备 | product | 本次派发：受理、范围初勘、准备；不写意图正文 |
| A2 意图撰写 | product | 依据 A1 结论产出 `docs/product/<flowId>-intent-v<N>.md` |
| A3 意图确认 | 客户（经 chief 发 intent-confirm 卡） | 唯一凭据为客户决定 |
| A4 提案起草 | rapporteur | 方案、技术路线、模块划分 |
| A5/A6 方案确认 | 客户（proposal 卡） | 唯一凭据为客户决定 |
| A7 名单/模块 | nominator | roster/modules（哈希取应用记录） |
| A8 团队计划 | convener | `complete_team_plan` v4 |
| A9 基线 | convener（应用执行） | `git init -b main` + `.gitignore` 托管块 + baseline commit + 任务分支 |
| A10 任命 | 客户（appointment 卡）→ Crew | 应用核 D3 |
| A11 实现 | convener → 模块属主 worker | 一模块一任务，写集/验收写清 |
| A12 独立验收 | chief → verifier | 候选 OID/criteria 由应用核验 |
| A13 合并发布 | 客户（merge-main 卡） | 运营不代批、不自行合并 main |

## 二、阶段顺序与前置依赖

A1 → A2 → A3 → A4 → A5/A6 → A7/A8 → A9 → A10 → A11 → A12 → A13。
关键前置：意图确认先于提案；名单/模块先于团队计划；团队计划先于基线；D3/激活回执先于实现派发；独立验收先于合并发布。

## 三、风险点与处置口径

1. **纯前端静态页、无后端**：无服务端/数据库依赖；验收侧重可玩性与静态资源完整性；交付物应为可直接打开的 HTML/CSS/JS。
2. **空目录、无 Git 基线**：A9 由应用执行 `git init -b main` 与 baseline commit；失败按 `baseline-*` fail-closed，不弹客户卡。
3. **无 run（fixed legacy 起点）**：runId/哈希一律取应用绑定与机器记录，不猜、不手写。
4. **环境探测禁止**：不运行 `node -v`/`python --version`/`which`/`where` 等 shell 探测；不跑 shell 算 hash（certutil/Get-FileHash 等）；环境事实取 `project_state`/项目配置，hash 取应用 `[versions]`/`.ans/state/versions.jsonl`。
5. **worker 禁止 shell**：写文件用 write_file/edit_file（自动建目录）；提交只写 `git add <paths>` 与 `git commit -m "<带引号单消息>"`；不得要求自测脚本；执行/验证归 A12。
6. **模块划分建议**（以 A2/A6 最终为准）：游戏主循环与波次、玩家与自动战斗、敌人与生成、经验/升级与强化选择、武器/道具、渲染与 UI、（可选）配置/存档。

## 四、派发日志

| 阶段 | 任务编号 | 目标角色 | sideEffect | module | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | #t-mwc6htkb-2d2f5cb1 | product | docs | 无 | 已收口 accepted（event-e5ca122b85d2557922965561）；A1 受理结论，无文件产物 |
| A2 | #t-mwc6ivu7-ba6b4df2 | product | docs | 无 | 已收口 accepted（stageCompleted=true，event-3adb02da572a664214f78a1e）；产物 `docs/product/wuxia-roguelike-intent-v1.md` latest=1 |
| A3 | 客户（chief 呈 intent-confirm 卡） | — | — | 客户确认（confirm）已完成；意图入口 `docs/intents/wuxia-roguelike.md` | 已确认，进入 A4 |
| A4 | #t-mwc6m0l6-480d981d | rapporteur | docs | 无 | 已收口 accepted（event-3c8d9f4bd317d374eae4bcb4）；产物 `docs/governance/rapporteur/wuxia-roguelike-a4-preparation.md`（技术初勘/12 模块候选/8 角色候选/风险/A5 清单） |
| A5 | #t-mwc6ozzn-bb1ba5de | rapporteur | docs | 无 | 已收口 accepted（stageCompleted=true，event-7acda897e0e1c740db3c132f）；四类 v1 文档落盘并通过应用校验；首次尝试的失败记录 #t-mwc6opbs 已按 superseded 收口 rejected |
| A6 | 客户（chief 呈 proposal 卡） | — | — | 客户接受方案：decisionId=decision-req-f0025e7886412fe8（应用签发） | 已确认，进入 A7 |
| A7 | #t-mwc6spjj-9370af49 | nominator | docs | 无 | 已收口 accepted（event-e51a6dbcf040fe4005e3df03）；产物 `docs/governance/nominator/wuxia-roguelike-a7-roster-review.md`（一致性核对通过、9 角色待激活清单、写区/冲突检查、A8 参数口径） |
| A8 | #t-mwc6vjpe-6818391c | nominator | code（应用按文本升类） | 无 | 已收口 accepted（event-a986a210748a68d119718914）；9 角色 27 份文档建卡并激活（ok:true, replay:false）；治理矩阵已列 9 项目角色及写区 |
| A9 | 运营执行（本文件 + complete_team_plan） | convener | — | 无 | 已完成：团队计划 v1 sha256=91a17e4e6828270d65655183c3f85c0068a8492d97bf1d97d99b910a252686c0；basisId=bas-8e0db55a47124c65e95d99c5；Git 初始化 branch=ans/task/wf-e6a70e9eace7a4f6d16e7ad9，headOid=277e4a02f87fb0fdd2e767c1914b12362725859a，.gitignore 托管块已提交 |
| A11 | 按模块串行派发（每模块一任务） | convener → 属主项目角色 | code | 按模块 | 已完成（accepted 11/11）：第 1 模块 config-data 已收口 accepted（`game/data/config.js` 13745B、commit `cd7b6c49d7a504d46028d8b93109faf3c0294845`、父 `277e4a02…`；event-1b5507e0f9c68653b68b1623）；第 2 模块 engine-core 已收口 accepted（8 文件/2218 行均在 `game/engine/`，commit `4a3f07ca3c5a8f8b9a68ecf3afda0515b790f584`、父 `cd7b6c49…`；event-9b89550c91d710f7e3d11189）；第 3 模块 player 已收口 accepted（`game/player/player.js`+README，commit `22b9920`、2 文件 668 行；event-da341eb4cb93dc817295a540）；第 7 模块 entry-index 已收口 accepted（`index.html` 205 行：经典脚本装配 config→engine(7 文件含 pool.js)→domain→ui→app→start，含 #game-canvas/#wx-ui-root/启动与缺模块提示；event-dc3a22616cc75baf080b3299；domain/ui/app 为占位引用，待实际落盘后由 env-bootstrap 核对文件名）；因报告 `evidence[]` 非纯项目相对路径被 `close-report-missing` 拒收，已按 rework 收口（event-18cbcddc97209b070b38ef27，保留旧事件）；报告格式返工最初因无绑定 open stage-request 被拒（`stage-request-required`）；幕僚已续接 A11（stage-request #t-mwc78qgg-8fa939e8，绑定本回合），config-data「仅证据格式」返工已重新派发 #t-mwc78vlv-6fe80af4（不改实现、不再提交、不跑 shell），回交后已收口 accepted（event-1b5507e0f9c68653b68b1623；evidence 纯路径 game/data/config.js）；第 2 模块 engine-core 已派发 #t-mwc79b0y-a97672ba（loop-engine，game/engine/）；后续顺序 player → combat → enemies → progression → arsenal → loop-app → ui-hud → entry-index → env-resources |

A5 应用版本记录（机器计算）：
- `docs/proposals/wuxia-roguelike-proposal-v1.md` sha256=661dc03b6605c3765eaf4ee3b4657284bdd66c4c6b7c7f8428e9ad648669cac9
- `docs/proposals/wuxia-roguelike-modules-v1.md` sha256=86b43d9a09cdf9a5202303db87cf7e4b2177802f1febcb450cdbf8457d094239
- `docs/proposals/wuxia-roguelike-roster-v1.md` sha256=50b08cba0eeb1bea6101122a0c304a0506eb687fb043bed2aea1189094e9216c
- `docs/contracts/wuxia-roguelike-architecture-v1.md` sha256=3e9984174fee83424d57328025e85dfa765863ed36bfe550f32559a213e6b945

应用版本记录（A2 收口时）：`docs/product/wuxia-roguelike-intent-v1.md` sha256=68b46c92b9fa2a7eec9f3391c90373e4bce3a3e5e274e5ba7533c9226fea957f（机器计算，非模型计算）。

## 五、当前进度与下一步

- A1–A6 已完成：意图 v1 客户确认、提案/模块/名单/架构 v1 落盘并通过应用校验、A6 客户接受方案（decisionId=decision-req-f0025e7886412fe8）。
- A7 进行中：nominator 受理/准备（名单一致性、待建卡角色与写区、命名/边界冲突、A8 激活清单）。
- 下一步：A7 回报 → A8 逐个激活名单角色（`activate_role_documents` v2，proposalDecisionId=decision-req-f0025e7886412fe8；hash 由应用计算）→ A9 团队计划 + Git 基线 → A10 任命卡（由幕僚呈）。

注：以上 §五 为 A7 时点记录（历史），当前实际进度见 §四 A11 行与 §六。

## 六、A11 现场记录（2026-11-11，第 1 模块回交后）

### 6.1 已完成核对（实现无返工项）

- 任务：`#t-mwc72z7g-4b224107`，角色 config-data，moduleId `config-data`，modulePaths `["game/data/"]`，stage A11，workflowId `wf-e6a70e9eace7a4f6d16e7ad9`。
- 产物：`game/data/config.js`（13745B / 480 行），经典 script + IIFE 挂载 `window.WX.Config`，以 `typeof window !== 'undefined' ? window : this` 取全局；仅纯数据常量。
- 结构（读码核对）：meta / waves（6 段，0–210s，spawnInterval 1.8→0.85，maxAlive 10→30，hpMult 1.0→1.8，eliteChance 0→0.1）/ enemies（bandit、bladesman、brute）/ upgrades（8 条，choiceCount=3）/ weapons（iron-sword 起始横扫、liu-ye-dao 投射）/ items（4）/ balance（run 210s、loop 1/60、world 1280x720、player 100HP/215speed/0.9s 无敌、leveling maxLevel 15、阈值 [8…463]、drops/elite/combat）/ text（武侠文案）。
- 静态约束（读码）：无 ES Module/import、无 fetch/XHR、无外部 CDN/字体/图片/音频、无 DOM 操作——符合架构 v1 硬约束。
- 提交：`cd7b6c49d7a504d46028d8b93109faf3c0294845`，父 `277e4a02f87fb0fdd2e767c1914b12362725859a`（与 A9 基线一致），仅 1 file changed。

### 6.2 阻塞与处置（待幕僚续接）

1. `close_created_task accepted` 返回 `close-report-missing`：worker 报告的 `evidence[]` 不是纯项目相对路径，应用无法按路径逐项核验字节。按 A11 纪律以新尝试返工，**只纠正报告证据格式**（不再改文件、不再提交）。
2. 已将该任务以 `rework` 收口（event-18cbcddc97209b070b38ef27），保留原事件与提交记录。
3. 返工派发（config-data，报告证据 `["game/data/config.js"]`）被拒：`stage-request-required` —— 生产派发必须绑定当前真实受派的 open stage-request；`project_state` 显示 A11 stage-request `#t-mwc726o7-47e2915e` 已 `status=reported`，本回合无绑定。
4. 处置：不重试同一派发（无新信息）；向幕僚报告并请求续接 A11 stage-request（或 resumeController 续接原 A11 任务）。续接后执行顺序：config-data 证据格式返工（唯一未收口项）→ engine-core → player → combat → enemies → progression → arsenal → loop-app → ui-hud → entry-index → env-resources，全部严格串行（同工作区写任务串行）。
5. 事实约束：全程未运行 shell、未计算 hash；环境与版本事实取 `project_state` 应用记录。

### 6.3 续接记录（本回合）

- 幕僚续接 A11：stage-request `#t-mwc78qgg-8fa939e8`（绑定本回合，生产派发恢复受理）。
- config-data 证据格式返工已派发：`#t-mwc78vlv-6fe80af4`（moduleId config-data，modulePaths `["game/data/"]`；只重交 `evidence=["game/data/config.js"]`，不改文件、不再提交、不跑 shell、不算 hash）。
- engine-core 已派发：`#t-mwc79b0y-a97672ba`（loop-engine，moduleId engine-core，modulePaths `["game/engine/"]`；实现 Canvas 2D 渲染/键盘输入/数学/碰撞/对象池/DPR，`window.WX.Engine`；只写 game/engine/，禁 ES Module/fetch/CDN/构建链）。
- 串行纪律：同一时间仅一个写任务在途（config-data 返工不写盘，engine-core 为唯一写任务）；engine-core 回交并收口后再派 player。

### 6.4 第 2 模块回交与派发绑定现场（本回合）

- `#t-mwc79b0y-a97672ba`（engine-core）回交核对通过：8 文件均在 `game/engine/`（engine.js/renderer.js/camera.js/input.js/math.js/collision.js/pool.js/README.md），IIFE 挂 `window.WX.Engine`；渲染（DPR/fit/相机变换/形状/文本/条）、键盘+指针输入、数学与 mulberry32 可复现随机、圆-圆/圆-矩形/AABB/最近目标/扇形索敌、对象池；无 ES Module/import/fetch/XHR/外部 CDN；不启动 rAF（主循环归 loop-app）。commit `4a3f07ca3c5a8f8b9a68ecf3afda0515b790f584`，父 `cd7b6c49…`（线性链正确），8 files changed 均在模块内。已收口 accepted（event-9b89550c91d710f7e3d11189，stageCompleted=true）。
- 随后派发 player（player-combat，`game/player/`）被拒：`stage-request-required`（assignedTask 缺失/不一致）——A11 续接 stage-request `#t-mwc78qgg-8fa939e8` 已 `status=reported`，其派发绑定随 engine-core 收口（stageCompleted=true）结束，本回合无新的 open stage-request。
- 处置：不重试同一派发（无新信息）；如实报告幕僚，请求再次续接 A11。按机制每张续接 stage-request 只覆盖其到达回合内派发的任务，且写任务串行 ⇒ 剩余 9 个模块需逐次续接后派发；若幕僚侧可提供更宽的绑定（一次续接覆盖多模块串行派发），请明示。
- 待续接后的下一模块：player（player-combat，moduleId `player`，modulePaths `["game/player/"]`）。

### 6.5 A12b 验收结论与 A11 返工派发（本回合）

- 幕僚通报：A12b 独立验收结论 **blocked**——仅 config-data（`cd7b6c49…`）与 engine-core（`4a3f07ca…`）落地；`index.html`、`game/app/`、`game/player/`、`game/combat/`、`game/enemies/`、`game/progression/`、`game/items/`、`game/ui/` 缺失；AC-1~AC-8 通过 0 条。A11 需返工补齐剩余 9 模块。
- 本回合绑定新 stage-request `#t-mwc7ovsg-57058991`（A11 返工；每受派回合只绑一个 open stage-request，剩余模块需逐次续接）。
- 已派发 player：`#t-mwc7p52l-6f5e873f`（player-combat，moduleId `player`，modulePaths `["game/player/"]`，stage A11）。约束：只写 `game/player/`；经典 script+IIFE 挂 `window.WX.Player`；消费 `WX.Config.balance.player` 与 `WX.Engine` 的输入/数学/碰撞；无 ES Module/import/fetch/XHR/CDN/构建链；报告纯路径 evidence + commit OID + 静态自检；提交仅字面 `git add game/player/…` + 带引号单消息 `git commit -m "…"`；不跑 shell、不算 hash。
- 后续（逐次续接后派发，保持写任务串行）：combat → enemies → progression → arsenal → loop-app → ui-hud → entry-index → env-resources。

### 6.6 第 3 模块回交与收口（本回合）

- `#t-mwc7p52l-6f5e873f`（player，player-combat）回交核对通过并收口 accepted（event-da341eb4cb93dc817295a540，stageCompleted=true）：`game/player/player.js` + `game/player/README.md`，commit `22b9920`（报告为短 OID），2 files changed / 668 insertions，均在 `game/player/`。
- 接口：`WX.Player.create(ctx)` → `update(dt, input?)`、`takeDamage(amount, source?)`、`heal`、`getState`、`isAlive`、`isInvulnerable`、`render(renderer)`、`reset(options)`、`applyModifiers/setModifiers`、`setProgress`、`getModifiers`；仅发契约事件 `player:hp-changed`（`{hp,maxHp,invulnerable}`），不发 `run:ended`。
- 集成核对：配置读取字段（`balance.player.maxHp/moveSpeed/radius/invulnerableSec/pickupRadius`、`balance.world`、`balance.loop.maxDeltaSec`）与 `game/data/config.js` 实际字段完全一致，不会落入兜底值；移动消费 `WX.Engine.Input.moveVector`、边界用 `WX.Engine.Collision.clampToWorld`；无 ES Module/fetch/XHR/CDN。
- 绑定：engine-core/player 收口均返回 stageCompleted=true，派发绑定结束；下一模块 combat（player-combat，moduleId `combat`，modulePaths `["game/combat/"]`）需幕僚再次续接后派发。

### 6.7 剩余 8 模块一次性派发（本回合，A11 返工续接）

- 幕僚要求「尽量一次性为剩余 8 个模块创建实现任务、串行排队；若应用拒绝并发写任务，只派第一个并回报错误码」。
- 结果：**8 个派发全部受理，应用未返回并发写任务拒绝**（无并发限制错误码）；任务号如下：

| 顺序 | moduleId | 属主 | modulePaths | 任务号 | 应用 sideEffect |
| --- | --- | --- | --- | --- | --- |
| 1 | combat | player-combat | `game/combat/` | #t-mwc7x0my-7837fa40 | code |
| 2 | enemies | enemy-systems | `game/enemies/` | #t-mwc7x8vf-9b2fd1c0 | code |
| 3 | progression | progression | `game/progression/` | #t-mwc7xgl0-66592ed8 | destructive（应用按文本升类） |
| 4 | arsenal | arsenal | `game/items/` | #t-mwc7xmb4-3e8055a7 | destructive（应用按文本升类） |
| 5 | loop-app | loop-engine | `game/app/` | #t-mwc7xsuk-26f82356 | code |
| 6 | ui-hud | ui-hud | `game/ui/` | #t-mwc7y199-18741b23 | code |
| 7 | entry-index | env-bootstrap | `index.html` | #t-mwc7y722-cd8a7f5d | code |
| 8 | env-resources | env-bootstrap | `README.md`, `assets/` | #t-mwc7ybqr-a4424b0d | code |

- 每任务均写明：只写本模块路径（禁跨模块写集）；经典 script+IIFE 挂对应 `window.WX.*`；禁 ES Module/import/fetch/XHR/CDN/构建链；报告纯路径 evidence + commit OID + 变更要点 + 静态自检（读码、不运行 shell）；提交仅字面 `git add <本模块路径>` + 带引号单消息 `git commit -m "…"`；禁危险 git 选项；不算 hash、不做环境探测。
- 特别约束：entry-index 动手前先 `list_dir` 各 game 子目录按**实际文件名**装配脚本顺序（config→engine→domain→ui→app→start），并行未落盘模块按契约占位并在报告中注明；env-resources 只写 README.md 与 assets/ 说明文件，不写 index.html。
- 风险与处置：8 个任务并行在途，同分支 `ans/task/wf-e6a70e9eace7a4f6d16e7ad9` 的提交可能因并发写/索引或依赖未落盘而冲突或提交被拒——回交后逐个核对提交链与文件归属（只写本模块）、接口与契约一致性；失败/冲突交原 owner 责任链返工，不代提交、不代为改写。
- 待回交顺序：按上表逐批核对并收口；全部 8 模块 accepted 后 A11 达 11/11，再交 A12b 独立验收（由幕僚派 verifier，运营不派质检）。

### 6.8 第 7 模块 entry-index 回交与收口

- `#t-mwc7y722-cd8a7f5d`（env-bootstrap）已收口 accepted（event-dc3a22616cc75baf080b3299）：`index.html` 205 行、唯一文件；经典 `<script>`（无 module/import）、无 fetch/XHR/CDN/外部字体图片；含 `#game-canvas`（1280x720）、`#wx-ui-root` 覆盖层容器、`#wx-boot-error` 缺模块提示、`document.title` 取 `Config.text.title`、启动调用 `WX.App.start()`。
- 已核对的脚本引用：`game/data/config.js` 与 `game/engine/` 7 个实际文件（engine/renderer/camera/input/math/collision/pool）与 `game/player/player.js` 均与落盘一致。
- 遗留（需返工）：`game/combat/combat.js`、`game/enemies/enemies.js`、`game/progression/progression.js`、`game/items/arsenal.js`、`game/ui/ui.js`、`game/app/app.js` 为契约预期占位文件名；待这些模块实际落盘后，须派 env-bootstrap 仅按真实文件名核对/修正 `index.html`（其写区，单独返工任务，不重写页面结构）。

### 6.9 第 8 模块 env-resources 回交与收口

- `#t-mwc7ybqr-a4424b0d`（env-bootstrap）已收口 accepted（event-864d4e042e4a194bd964abcd）：`README.md`（项目说明）与 `assets/README.md`（资源约定），共 2 文件 121 行；未改 index.html / game/** / 治理文档。
- README 要点：玩法一句话、**file:// 双击运行**（无服务器/无构建/断网可玩）、WASD/方向键移动 + 自动攻击 + Esc/P 暂停 + 升级三选一 + 结算重开、目录结构、`WX.*` 命名空间速览、离线与无外部资源约束、常见问题。
- assets/README 要点：当前无二进制资源，美术为 Canvas 程序化绘制；禁止 CDN/外链字体图片音频、禁止 fetch/XHR、禁止 ES Module；后续本地资源只放 assets/、相对路径、经典标签/Image 引入、命名规范与登记要求。
- 当前 A11 已 accepted 5/11（config-data、engine-core、player、entry-index、env-resources）；在途未回交：combat、enemies、progression、arsenal、loop-app、ui-hud（6 个）。

### 6.10 第 1 模块（返工批次）combat 回交与收口

- `#t-mwc7x0my-7837fa40`（player-combat）已收口 accepted（event-0082ea842aae35394af30270）：`game/combat/combat.js` + `game/combat/README.md`，2 files / 1000 insertions，均在 `game/combat/`；commit `9380d42`（短 OID）。
- 接口：`WX.Combat.create(ctx)` → `update(dt, entities)`、`getWeaponState()`、`setWeapons()`、`addWeapon()`、`setWeapon()`、`reset()`、`render(renderer)`。
- 行为：nearest-in-range 索敌（`WX.Engine.Collision.nearest` + 目标过滤）；按武器 `cooldownSec`（attackCooldown 修饰器缩放）自动出手；sweep 扇形（arcDeg/maxTargets）与 projectile 飞刃（speed/radius/pierce/lifetimeSec）；伤害=基础+damage 加算，暴击按 critChance/critMultiplier。
- **集成约定（重点核对项）**：伤害只经 `ctx.applyDamage(enemy, amount)`（架构 §5.5 冻结）；击退经 `ctx.applyKnockback` 或 enemy 自带 `applyKnockback/applyImpulse`；本模块不发事件，`enemy:killed` 归 enemies。⇒ loop-app 必须注入 `applyDamage`/`applyKnockback`/玩家状态/`getPlayerModifiers`；enemies 必须提供 `takeDamage` 与死亡事件——两者回交时逐项核对。
- 当前 A11 已 accepted 6/11；在途：enemies、progression、arsenal、loop-app、ui-hud（5 个）。

### 6.11 第 2 模块（返工批次）enemies 回交与收口

- `#t-mwc7x8vf-9b2fd1c0`（enemy-systems）已收口 accepted（event-1cff645a93647061f9fb3271）：`game/enemies/enemies.js` + `game/enemies/README.md`，均在 `game/enemies/`。
- 接口：`WX.Enemies.create(ctx)` → `spawnWave(waveIndex)`、`update(dt, waveCtx?)`、`list()`、`render()`、`reset()`、`stopSpawning()`、`getWave()`、`getState()`；每个敌人实例带 `takeDamage(amount, source)`。
- 行为：按 `Config.waves` 的 spawnIntervalSec/maxAlive/spawnTable 权重刷怪；生成时叠加波次 hp/speed/damage 倍率与 eliteChance/balance.elite 倍率；chase 追击 + 敌人间分离 + 与玩家分离（只推敌人）+ 入场后边界夹取；接触伤害调用 `player.takeDamage` 且受 `balance.player.hitDamageCooldownSec` 限制；hp≤0 只发一次 `enemy:killed`（`{enemyId,type,x,y,exp}`）；对象池复用，reset 清场。
- 与 combat 的对接：combat 的 `ctx.applyDamage(enemy, amount)` 应实现为调用 `enemy.takeDamage(amount)`（双方契约一致）。loop-app 必须注入 bus/emit、getPlayer、playerState 等。
- 当前 A11 已 accepted 7/11；在途：progression、arsenal、loop-app、ui-hud（4 个）。

### 6.12 第 4 模块（返工批次）arsenal 回交与收口

- `#t-mwc7xmb4-3e8055a7`（arsenal）已收口 accepted（event-f8318ba3fad936307025b97a）：`game/items/arsenal.js` + `game/items/README.md`，均在 `game/items/`；IIFE 挂 `window.WX.Arsenal`，导出 `VERSION` 与 `create(ctx)`。
- 最小契约齐备：`grantItem(id)` / `getInventory()` / `applyModifiers(stats)`；扩展 `grantWeapon` / `getActiveWeapon` / `getWeaponList` / `equipWeapon` / `onEnemyKilled` / `onWaveStarted` / `update(dt,player?)` / `render(renderer)` / `reset` / `getModifiers` / `getPlayerModifiers` / `getModifierTotals` / `spawnDrop` / `getPickups` / `getState`。
- 行为：起始武器读 `balance.player.startWeaponId`（iron-sword）；第 3 波起按 `balance.drops.weaponDropWaveIndex`/`weaponDropId` 在玩家附近（140–180px）发放 liu-ye-dao 每局一次；击杀按 `itemDropChance` 从 `itemPool` 掉落未满叠道具；消耗品 jin-chuang-yao 调 `player.heal(30)`（无回血通道时保留掉落物）；被动按 maxStack 叠加并聚合同构修饰器数组；拾取半径读玩家 `pickupRadius`；`reset` 复位并重设掉落随机序列。
- 边界核对：只读 `WX.Config` 与 `WX.Engine.Math/Renderer`；不引用 combat/player/enemies/progression/app（仅经 ctx 回调与 `player.heal`）；不发送任何事件（§5.4 未登记 arsenal 事件）；无 ES Module/import/fetch/XHR/CDN/构建链，数值全取自配置。
- 集成点（loop-app 装配）：ctx 需 `getPlayer`/`getWaveIndex`/`onWeaponChanged`/`onModifiersChanged`；`bus.on('enemy:killed')` 转发 `onEnemyKilled`、波次开始转发 `onWaveStarted`、世界层渲染调 `render`；道具修饰器只走一条通道（已合入玩家聚合则不再对 combat 重复应用）。
- 当前 A11 已 accepted 8/11；在途：progression、loop-app、ui-hud（3 个）；全部回交并核对后 A11 达 11/11，再交幕僚创建 A12b 独立验收（运营不派质检、不代验收）。

### 6.13 第 3 模块（返工批次）progression 回交与收口

- `#t-mwc7xgl0-66592ed8`（progression）已收口 accepted（event-296367b4d731de611de346a9）：`game/progression/progression.js` + `game/progression/README.md`，均在 `game/progression/`；IIFE 挂 `window.WX.Progression`，导出 `VERSION` 与 `create(ctx)`。
- 最小契约齐备：`addExp(n)` / `rollChoices(count)` / `applyUpgrade(id)` / `getState()`；扩展 `update` / `render` / `handleEnemyKilled` / `spawnExpDrop` / `chooseUpgrade` / `handleUpgradeChosen` / `applyModifiers` / `getModifiers` / `getModifierList` / `getChoiceDetails` / `getOrbs` / `reset` / `destroy`。
- 行为：消费 `enemy:killed {enemyId,type,x,y,exp}` 生成经验球（`drops.expOrbRadius/expOrbLifetimeSec`、吸附速度 `player.expMagnetSpeed`、拾取半径 `player.pickupRadius × pickupRadius 修饰器`，同一 payload 去重）；拾取发 `exp:pickup {amount}`（含 expGain 修饰）；阈值读 `balance.leveling.expThresholds/maxLevel/choiceCount`，连续升级队列逐级发 `level:up {level, choices}`（每级恰一次，满级/池耗尽跳过不阻塞）；三选一按 weight 加权无放回并排除 maxStack；`applyUpgrade` 叠层 + 聚合修饰器（damage/maxHp/critChance 加算，其余乘算）+ `ctx.onModifiersChanged` 通知；`upgrade:chosen` 仅入站（`chooseUpgrade` 可选广播），未新增事件。
- 配置核对：字段与 `game/data/config.js` 完全一致（`balance.drops.expOrbRadius=5/expOrbLifetimeSec=25`、`player.expMagnetSpeed=340/pickupRadius=80`、`leveling.maxLevel=15/choiceCount=3/expThresholds[15]`、`upgrades[8]` weight/maxStack/modifiers 齐备）。
- 引擎对接核对：`WX.Engine.Pool.create({create,reset,initial,max})` 用法与 `game/engine/pool.js` 实际 API（acquire/release/releaseAll/forEachActive/activeCount）一致，Pool 缺失时用等价兜底池；`Collision.clampToWorld` 用于经验球边界。
- 边界：不 import player/combat/enemies/items/app，跨模块只经 ctx 与事件总线；不操作 DOM；无 ES Module/fetch/XHR/CDN/构建链。
- 集成点（loop-app 装配）：注入 `bus`、`getPlayer`（返回 player.getState()）、`onModifiersChanged`（把 `getModifierList()` 推给 player/combat、把 expGain/pickupRadius 留本模块消费）；收到 `level:up` 进 LEVEL_UP、`WX.UI.showUpgrade(choices, onPick)`，选择后 `applyUpgrade(id)` 或广播 `upgrade:chosen`（二者择一，避免重复应用）；每步 `update(dt, playerState)`、世界层 `render(renderer)`；重开 `reset()`。
- 当前 A11 已 accepted 9/11；在途：loop-app（`#t-mwc7xsuk-26f82356`）、ui-hud（`#t-mwc7y199-18741b23`）。

### 6.14 第 5 模块（返工批次）loop-app 回交核对（rework）

- `#t-mwc7xsuk-26f82356`（loop-engine）已按 **rework** 收口（event-d9bbfd315160f9ebb95aa9cb，stageCompleted=false）：`game/app/app.js`、`bus.js`、`integrations.js`、`wave-scheduler.js`、`README.md`（5 文件均在 `game/app/`）。
- 已核对通过的主体：rAF + 固定步长 1/60、单帧 delta ≤ 0.1s、最多追 6 步并丢弃余量；状态机 BOOT/MENU/PLAYING/LEVEL_UP/PAUSED/GAME_OVER/VICTORY（含失焦暂停、连续升级队列、无 UI 时自动选择与键盘兜底）；`WX.App.WaveScheduler` 按 waves 时间轴发 wave:started/cleared、终波胜利；9 个冻结事件的总线（on/off/once/emit/clear，未登记事件告警不新增）；§5.6 视图快照新对象；模块缺失降级；`Engine.endFrame()` 每帧清 input 边沿（Esc/P 不会重复触发）。仅写 `game/app/`，无 ES Module/import/fetch/XHR/CDN/构建链。
- 返工缺陷（均可在 `game/app/` 内修复，不改其他模块）：
  1. **武器获取断链**：`grantWeapon()` 调 `arsenal.grantItem(id)`，而 arsenal.grantItem 只识别 `Config.items`（`liu-ye-dao` 属 weapons → `unknown-item`），且 App 从不调用 `combat.addWeapon/setWeapons`，combat 也不读 `ctx.getWeaponId/getWeapon` ⇒ 第 3 波后飞刀永远不会实际出手；`currentWeaponId` 只读 `arsenal.getState().weaponId`，arsenal 实际字段为 `activeWeaponId`（应读 getActiveWeapon().id / activeWeaponId）。
  2. **经验重复**：`WX.Progression.create(ctx)` 默认 `autoSubscribeEnemyKilled=true`，已自行订阅 `enemy:killed` 并生成经验球；`App.handleEnemyKilled` 又调用 `progression.spawnExpDrop` ⇒ 每次击杀两枚经验球、经验约翻倍。
  3. **道具掉落绕过 arsenal 拾取链路**：`App.maybeDropItem()` 直接 `grantItem` 即时生效；arsenal 的 `onEnemyKilled`/`onWaveStarted`/`update`/`render` 与拾取半径全部未使用（与架构 §3「掉落—拾取」及 arsenal 模块契约不一致，AC-6 的获取过程不可观察）。
  4. 可选补齐：ctx 增加 `getWaveIndex()/waveIndex`、`applyKnockback` 转交（combat 击退、arsenal 波次兜底当前为空操作）。
- 处置：不代改、不代提交；待幕僚续接 A11 后向 loop-app 派发**仅集成修正**返工任务（保留已验证的主循环/状态机/总线/快照，不重写）。
- 当前 A11 已 accepted 9/11（config-data、engine-core、player、entry-index、env-resources、combat、enemies、arsenal、progression）；待处理：loop-app 集成修正返工、ui-hud 回交；两者完成后另需 env-bootstrap 按真实文件名核对 `index.html` 脚本清单（app 目录现有 4 个 js：bus/integrations/wave-scheduler/app，必须按序加载）。

### 6.15 第 6 模块（返工批次）ui-hud 回交与收口

- `#t-mwc7y199-18741b23`（ui-hud）已收口 accepted（event-455398398eac38447268957b，stageCompleted=true）：`game/ui/ui.js` + `game/ui/styles.css`，均在 `game/ui/`；经典 IIFE 挂 `window.WX.UI`。
- 接口：`init(viewSource)`、`render(snapshot)`、`showUpgrade(choices,onPick)`、`hideUpgrade`、`showResult(result,onRestart)`、`hideResult`、`showBanner`、`toast`、`setHandlers`、`setEventSink`、`getSnapshot`、`isMounted`、`getRoot`、`destroy`。
- 与 App 对接核对：`init(App.api)` 后按 `getSnapshot()` 读 §5.6 快照并识别 state 七态；MENU 开始按钮 → `WX.App.startGame()`，PAUSED 继续 → `WX.App.resume()`，结算重开 → 回调 `restartRun`；App 传入 choices+onPick 并有回调时只回调、不再发 `upgrade:chosen`（避免重复应用）；showResult 接受 `{result,stats}`（kills/level/elapsed）。
- HUD：气血数值+血条、修为数值+经验条、境界、波次 x/目标、余时、斩敌、已战与波次名，满足 AC-7 四类信息；升级三选一卡片（名称/描述/权重层级/可叠层数，1-2-3 与方向键+Enter），暂停层，胜负结算+统计+重开。
- 样式：`styles.css` 由 ui.js 以本地 `<link>` 注入（同目录解析），失败回退内联样式；无 CDN/@font-face/外链字体图片音频、无 ES Module/import/fetch/XHR；只读消费快照，不写领域状态。
- 备注（非返工）：`index.html` 的 `#wx-ui-root` 未被使用（UI 自建 `#wx-ui` 覆盖层，功能等价）；待 env-bootstrap 核对脚本清单时一并确认不冲突。
- 当前 A11 已 accepted 10/11（唯一未收口：loop-app 集成修正返工）；ui-hud 收口返回 stageCompleted=true，派发绑定结束，后续派发需幕僚再次续接 A11。

### 6.16 A11 返工续接（loop-app 集成修正 + entry-index 核对）派发记录

- 幕僚续接 A11：stage-request `#t-mwc8d5ta-95d696ff`（A11 返工续接，绑定本回合）。
- 已派发 loop-app 集成修正返工：`#t-mwc8evdx-348ac65a`（loop-engine，moduleId `loop-app`，modulePaths `["game/app/"]`）。任务文本复述 §6.14 三项缺陷并给修正口径：①武器断链 → 武器获得走 `arsenal.grantWeapon(id)`，随后 `combat.addWeapon(id)`/`combat.setWeapons(...)` 真正装备，当前武器 id 读 `getActiveWeapon().id`/`getState().activeWeaponId`（不再读不存在的 `weaponId`）；②经验球双发 → 创建 progression 传 `autoSubscribeEnemyKilled:false` 由 App 统一转发，或保留自动订阅而 App 不再 `spawnExpDrop`，二选一并写明；③道具掉落绕过 arsenal → `enemy:killed`/波次开始转交 `arsenal.onEnemyKilled`/`onWaveStarted`，保留 `update`/`render`，停用即时 `grantItem`/`maybeDropItem` 与 `grantWeapon` 即时发放（arsenal 缺失才兜底）；可选补 ctx `getWaveIndex`/`applyKnockback`。只写 `game/app/`、不重写已验证主循环/状态机/总线/快照；证据纯路径、提交仅字面 `git add game/app/…` + 带引号单消息 `git commit -m "…"`、不算 hash、不探环境、不跑自测脚本。
- 已派发 entry-index 脚本清单核对：`#t-mwc8gkoe-e37bca10`（env-bootstrap，moduleId `entry-index`，modulePaths `["index.html"]`）。要求先 `list_dir` 核实际文件名，按 config → engine（7 文件含 pool.js）→ domain（player/combat/enemies/progression/arsenal）→ ui（ui.js）→ app（bus → integrations → wave-scheduler → app）→ 内联 `WX.App.start()` 装配；只改 index.html，保留 `#game-canvas`/`#wx-ui-root`/`#wx-boot-error` 页面结构，不引入 `type="module"`；证据纯路径、提交仅字面 `git add index.html` + 带引号单消息、不算 hash、不探环境。
- 两项均**已受理**（受理 ≠ 完成）；两者文件集不相交（game/app/ vs index.html），按串行排队等待回交。回交后逐个读码核对文件归属与提交链，证据齐备才按 accepted 收口；失败/冲突交原 owner 责任链返工，不代改、不代提交。
- 待办：loop-app 返工与 index.html 核对均收口 accepted 后 A11 达 11/11（11 模块全 accepted + 分支有提交 + 依据未漂移），再向幕僚报告并请求 A12b 独立验收（verifier 由幕僚创建，运营不派质检、不代验收）。

### 6.17 entry-index 脚本清单核对回交与收口

- `#t-mwc8gkoe-e37bca10`（env-bootstrap）已收口 accepted（event-fb7ce2cad421dbb0b91fd6cf，stageCompleted=false）：仅修改 `index.html` 的 `<script>` 清单与注释（10 insertions / 6 deletions），页面结构、内联样式与启动写法不变。
- 读码核对：脚本顺序 = `game/data/config.js` → `game/engine/{engine,renderer,camera,input,math,collision,pool}.js` → `game/player/player.js` → `game/combat/combat.js` → `game/enemies/enemies.js` → `game/progression/progression.js` → `game/items/arsenal.js` → `game/ui/ui.js` → `game/app/{bus,integrations,wave-scheduler,app}.js` → 内联 `WX.App.start()`（含 DOMContentLoaded 与缺 App 的启动错误提示）。
- 文件名逐一对照 `list_dir`：game/data、game/engine（7 js + README）、game/player、game/combat、game/enemies、game/progression、game/items、game/ui（ui.js + styles.css）、game/app（4 js + README）全部一致；不再有占位引用；`styles.css` 由 ui.js 自行注入，入口未重复加载。
- 技术约束（读码）：经典 `<script>`、无 `type="module"`、无 import/fetch/XHR/CDN/外链字体图片；提交 `ddaf2a4f0ed77f4d211020991db3901fcef16a2e`「fix(entry): align script list with delivered modules」，`git status` 显示工作区仅 `game/app/`（README/app.js/integrations.js）有未提交改动，属在途 loop-app 返工，index.html 已干净提交。
- 当前 A11 accepted 10/11（唯一未收口：loop-app 集成修正返工 `#t-mwc8evdx-348ac65a`，正在写 game/app/）。

### 6.18 loop-app 集成修正回交与收口（A11 达 11/11）

- `#t-mwc8evdx-348ac65a`（loop-engine）已收口 accepted（event-39d158156643ccebed543b75，stageCompleted=false）：改动仅 `game/app/app.js`、`game/app/integrations.js`、`game/app/README.md`，提交 `9ee4afe2f87c9504992c616f23340f1438843edb`「fix(app): integrate arsenal weapons/drops and single exp orb」，父 `ddaf2a4`；收口前 `git status` 已干净。
- 缺陷 1（武器入战）修复核对：`grantWeapon` 改走 `arsenal.grantWeapon(id)`，成功后 `syncCombatWeapons()` → `ownedWeaponIds()` 取 `arsenal.getInventory().ownedWeaponIds`，逐把 `combat.addWeapon(id)` + `combat.setWeapon(active)`；arsenal 地面拾取武器时经 `ctx.onWeaponChanged` 再次同步；`currentWeaponId` 经 `Integration.arsenalWeaponId` 优先 `getActiveWeapon().id`、次选 `getState().activeWeaponId`。对照 combat 源码：`addWeapon` 幂等、`setWeapon` 只切换 active（已装备武器均自动出手）——飞刀实际出手链路已打通。
- 缺陷 2（经验双发）修复核对：progression 以 `autoSubscribeEnemyKilled:false` 创建（progression 源码 `if (ctx.autoSubscribeEnemyKilled !== false)` 生效），App.handleEnemyKilled 统一调用 `progression.handleEnemyKilled(payload)` 一次，不再调用 `spawnExpDrop`；每次击杀恰一枚经验球。
- 缺陷 3（掉落/拾取）修复核对：`handleEnemyKilled` → `arsenal.onEnemyKilled(payload)`；`handleWaveStarted` → `arsenal.onWaveStarted(wave.index)`（scheduler 的 wave.index 1 基，与 `weaponDropWaveIndex` 同口径）；`arsenal.update/render` 由 App 每步/每帧驱动，地面掉落经 `pickupRadius` 拾取并触发库存/修饰器回调；arsenal 缺失时才用本地 `maybeDropItem`/`grantWeapon` 兜底。
- 可选补齐：ctx 增加 `getWaveIndex`（= currentWaveNumber）与 `applyKnockback`（转交 enemy.applyKnockback/applyImpulse），combat 击退与 arsenal 波次兜底不再空操作。
- 边界核对：仍为经典 IIFE、无 ES Module/import/fetch/XHR/CDN/构建链；主循环（rAF + 1/60 固定步、delta≤0.1s、最多 6 步）、状态机、总线、视图快照主体未重写；未改 game/app/ 之外文件。
- **A11 结论**：11/11 模块实现任务全部 accepted；任务分支 `ans/task/wf-e6a70e9eace7a4f6d16e7ad9` 提交链完整（9ee4afe←ddaf2a4←6c9b068←a993794←d201ad3←b27766c←163c8fc … ←A9 基线 277e4a0）；依据（意图 v1 sha256=68b46c92…、模块/名单/架构 v1 sha256=86b43d9a…/50b08cba…/3e998417…）未漂移。
- 下一步：向幕僚报告 A11 完成并请求 A12b 独立验收（verifier 由幕僚创建，运营不派质检、不代验收）；A13 merge-main 由应用呈卡、仅客户确认。

### 6.19 B1 影响面分析（运行期 TypeError）派发与结论

- 幕僚阶段请求：`#t-mwc9o8n9-2e908938`（B1，read-only stage-request）；本批实际 workflowId 为 `wf-739312023202ee992b7c8955`（与 A 批 `wf-e6a70e9eace7a4f6d16e7ad9` 不同）。
- 首次派发按旧 workflowId 被拒：`stage-request-invalid`（显式 workflowId 与当前受派任务不一致）；已按应用回执改用新 workflowId 重新派发（未伪造成功、未重试同一错误参数）。
- 分析任务已派发：`#t-mwc9otb7-a48fa319`（loop-engine，只读）：核查 `game/app/app.js` 输入调用、`game/engine/input.js` 的 `this` 依赖、同类解引用（`ctx.on: bus.on`、`engine.endFrame()`→`input.endFrame()` 等），只交 submit_report、不写文件、不提交、不跑 shell、不算 hash。
- 运营读码确认根因：`pollFrameInput()` 中 `var pressed = engine.input.wasPressed;` 后独立调用 `pressed('escape')`；`input.js` 严格模式下 `wasPressed` 访问 `this.pressed`，独立调用 `this=undefined` ⇒ 每帧 TypeError；`frame()` 在 `pollFrameInput()` 之前已排下一帧、之后才走 stepWorld/renderFrame/updateUi/endFrame，故错误每帧重复且世界更新/渲染/帧末清理全部被跳过。`engine.endFrame()` 内 `input.endFrame()` 为方法调用（安全）；`player.update(dt, engine.input)` 与 `src.moveVector()` 亦安全；`ctx.on/off: bus.on/off` 为潜在同类风险（当前未见经 ctx 调用）。
- 影响面报告已落盘：`docs/scheduling/wuxia-roguelike-b1-impact-v1.md`（根因/触发路径/受影响文件/最小修复建议/回归验证要点/B2 范围建议：仅改 `game/app/app.js`，责任属主 loop-engine）。
- 待办：loop-engine 只读分析已回交并收口 accepted（event-a9aea0ff85c27cfcfcffd491；未改文件、`git status` 干净），结论与报告的根因/范围一致；B2 范围决定后由幕僚/运营另派 B3 修复（本阶段不改实现）。

### 6.20 B2 范围决定（应用未登记 scope-decided，B3 受阻）

- 幕僚 B2 任务：`#t-mwc9ran2-3ef95043`（stage=B2，read-only stage-request），正文声明 change.scope-decided：scope.files=["game/app/app.js"]、属主 loop-engine、影响面报告 `docs/scheduling/wuxia-roguelike-b1-impact-v1.md`。
- 按该范围向 loop-engine 派发 B3 修复任务（stage=B3，moduleId=loop-app，modulePaths=["game/app/"]）被应用拒绝：
  `b-change-scope-invalid：B3 写集来源缺失：B2 change.scope-decided 不存在（不派发）`。
- 判定：B2 决定目前只在任务正文中，应用账本没有对应的 `change.scope-decided` 记录，B3 写集无法取得合法来源。运营不能自造/自报该记录，也不重试同一派发。
- 所需动作（交幕僚）：按应用真实通道登记 B2 `change.scope-decided`（scope.files、影响面报告路径/引用、属主）后再派 B3；若该登记须由特定角色/工具完成，请明示工具与参数。登记完成后运营按 `game/app/app.js` 单文件范围派 B3（loop-engine），并核验提交与回归证据。
- 当前未改任何实现代码、未提交。

### 6.21 B2 范围决定再次派发与受理（待 B3 stage-request）

- 幕僚重发 B2：`#t-mwc9w8tw-db1175f3`（stage=B2，read-only stage-request；workflowId=`wf-739312023202ee992b7c8955`）。范围与上一版一致：impactReport=`docs/scheduling/wuxia-roguelike-b1-impact-v1.md`（B1 accepted event-a9aea0ff85c27cfcfcffd491）；scope.files=["game/app/app.js"]；属主 loop-engine（loop-app）；最小修复=pollFrameInput 改方法调用 + 同批包装 ctx.on/off；不改引擎与其他模块。
- 运营受理结论：**确认 scope 仅 `game/app/app.js`、属主 loop-engine**；影响面报告已存在且与 B1 结论一致；本阶段无需派生产任务（幕僚明示 B3 另行 stage-request）。
- 登记状态：应用此前对 B3 派发返回 `b-change-scope-invalid`（B2 change.scope-decided 不存在）。本轮按 B2 任务要求只受理与回报，不派 B3、不自造 change 记录；待 B3 stage-request 到达后派发 B3，若应用仍报 `b-change-scope-invalid` 将如实回报拒绝码与所需动作。
- 未改任何实现代码、未提交；未跑 shell、未算 hash。
