---
flowId: wuxia-roguelike
version: 3
kind: quality-report
taskId: t-mwc8krwc-2bcd6678
workflowId: wf-e6a70e9eace7a4f6d16e7ad9
stage: A12b
criteria: docs/quality/wuxia-roguelike-criteria-v1.md
criteriaVersion: 1
targetRef: ans/task/wf-e6a70e9eace7a4f6d16e7ad9
targetOid: 9ee4afe2f87c9504992c616f23340f1438843edb
status: blocked
---

# wuxia-roguelike · A12b 独立验收报告（v3）

## 0. 结论

**总体结论：blocked（阻塞，不通过也不判定失败）。**

- 验收依据为已冻结的 `docs/quality/wuxia-roguelike-criteria-v1.md`（version 1，status final），其中 AC-1~AC-8 共 8 条 P0 验收标准，T-1~T-7 共 7 条技术约束。
- 当前任务指定的被验目标为分支 `ans/task/wf-e6a70e9eace7a4f6d16e7ad9` 的提交 OID `9ee4afe2f87c9504992c616f23340f1438843edb`（任务文本所述提交信息为「fix(app): integrate arsenal weapons/drops and single exp orb」）。
- 本轮未获得浏览器/DevTools/Console/Network/运行期计时/截屏通道，且任务明确禁止运行任何 shell 命令（含 node、npm、git、测试脚本）。因此 AC-1~AC-8 的**真实运行行为不能判定为通过**；T-1、T-6 也不能完成运行期核对。
- 本轮以只读方式逐项读取了入口、全部游戏脚本、样式、README 与冻结 criteria。静态层面 11 项实现/入口/资源面均可见，未见导致 AC 必然失败的明确静态缺陷；上一轮报告指出的三个重点缺陷在代码链路上**均呈现为已修复**：
  1. 第 3 波武器掉落 → `arsenal.grantWeapon` → `App.syncCombatWeapons` → `combat.addWeapon/setWeapon` → `combat.update` 独立开火；`currentWeaponId` 读取 active weapon，静态链路闭合。
  2. `progression` 以 `autoSubscribeEnemyKilled:false` 创建；App 只通过 `enemy:killed` 一次转交 `progression.handleEnemyKilled`；正常路径不再调用 `progression.spawnExpDrop`；静态链路只生成一枚经验球。
  3. 敌人击杀交由 `arsenal.onEnemyKilled` 生成地面掉落，由 `arsenal.update` 拾取并调用 `arsenal.grantItem`；App 的 `grantItem` / `maybeDropItem` 仅在 arsenal 缺位时兜底；静态链路不再是 App 即时发放。
- 但上述均为**读码判定**，不是运行期证据；不能替代 criteria 要求的真实打开、Console/Network、波次推进、升级选择、掉落拾取与计时验证。故 AC 通过数为 **0/8**，AC 未验证数为 8/8；T 项仅 T-4、T-5 完成静态核对，T-2/T-3/T-7 只有静态观察，T-1/T-6 未验证。
- 本报告不是客户验收结论，不批准合并，不代表运营发布；固定路径的 `docs/acceptance/` 归档由应用生成，本角色未写、未伪造。

## 1. 验收依据、目标与环境

### 1.1 冻结依据

- 文件：`docs/quality/wuxia-roguelike-criteria-v1.md`
- 版本：v1；状态：final；唯一 `ans-criteria/v1` 块已在前序 A12a 阶段冻结。
- 覆盖：AC-1~AC-8（全部 P0）与 T-1~T-7。
- 本轮未修改 criteria，未修改实现代码、配置、入口或任何 `game/**` 文件。

### 1.2 目标 OID 与一致性限制

- 任务指定 targetRef：`ans/task/wf-e6a70e9eace7a4f6d16e7ad9`
- 任务指定 targetOid：`9ee4afe2f87c9504992c616f23340f1438843edb`
- 限制：本会话未注入结构化 Git 工具（无 `git_query` / `git_candidate` / `git_publish`），且任务禁止任何 shell 命令，包括只读 git 命令。故本报告**不能独立重算或证明当前工作树字节内容与指定 OID 一致**；本报告把当前任务现场内容视为指定 OID 的验收快照，但不把 OID 一致性当作已核实事实。
- 若后续责任链发现当前内容与 `9ee4afe2f87c9504992c616f23340f1438843edb` 不一致，本报告的运行期结论应作废并按新指定 OID 重验；静态结论也只能作为该快照的观察。

### 1.3 证据通道与环境限制

- 可用：`list_dir`、`read_file`、`write_file`（仅写入 `docs/quality/`、`docs/verification/`、`docs/governance/verifier/` 范围内）。
- 不可用/未执行：浏览器打开、DevTools、Console、Network、截屏、真实计时、自动化测试、任何 shell/Node/npm/git 命令。
- 因此本报告的证据类型只有“静态源码阅读记录”，没有运行期截图、Console 日志、Network 记录或测试输出；P0 运行期证据为 **insufficient evidence**。
- 未计算、未转抄任何文件 sha256、bytes 或 lines；报告仅记录路径、实际源码内容与结论。

## 2. 现场实现面（静态清点）

根目录列举可见 `index.html`、`README.md`、`assets/`、`game/`、`docs/`、`角色卡/`、`.gitignore`。`game/` 下可见 `data/`、`engine/`、`player/`、`combat/`、`enemies/`、`progression/`、`items/`、`ui/`、`app/`。

| 序号 | 实现/入口/资源面 | 现场文件（代表） | 静态状态 |
|---|---|---|---|
| 1 | config-data | `game/data/config.js` | 存在；6 波、3 敌人、8 升级、2 武器、4 道具、210 秒配置可见 |
| 2 | engine-core | `game/engine/engine.js`、`renderer.js`、`camera.js`、`input.js`、`math.js`、`collision.js`、`pool.js` | 存在；固定步长/渲染/输入/碰撞/对象池 API 可见 |
| 3 | entry-index | `index.html` | 存在；经典脚本顺序加载；内联启动 `WX.App.start()` |
| 4 | loop-app | `game/app/app.js`、`integrations.js`、`wave-scheduler.js`、`bus.js` | 存在；主循环、ctx 注入、领域适配、波次调度、事件总线可见 |
| 5 | player | `game/player/player.js` | 存在；移动、受伤、死亡、回血、进度与修饰符接口可见 |
| 6 | combat | `game/combat/combat.js` | 存在；自动索敌、近战扇形、远程投射物、多武器独立冷却可见 |
| 7 | enemies | `game/enemies/enemies.js` | 存在；波次刷怪、追踪、接触伤害、击杀事件可见 |
| 8 | progression | `game/progression/progression.js` | 存在；经验球、拾取、升级、三选一、重置可见 |
| 9 | arsenal | `game/items/arsenal.js` | 存在；武器拥有/激活、掉落、拾取、道具堆叠/消耗可见 |
| 10 | ui-hud | `game/ui/ui.js`、`game/ui/styles.css` | 存在；菜单/HUD/升级/暂停/结算 DOM 与本地样式可见 |
| 11 | env-resources | `assets/README.md`、`README.md` | 存在；`assets/` 仅说明文件，无二进制素材；根 README 提供运行说明 |

补充观察：

- `README.md` 列有 `qa/` 目录/自测脚本说明，但当前 `list_dir qa` 未发现该目录。该差异属于交付说明与现场覆盖的偏差，**不是本轮任何 AC 的运行期通过证据，也不单独构成 AC 失败**；建议由原责任属主核实（修复线索：`qa-acceptance` / `env-bootstrap`）。
- `game/app/README.md` 说明 UI 直接订阅 `player:hp-changed`，但实际 `game/ui/ui.js` 通过 App 快照渲染 HUD，不直接订阅该事件。该差异是文档描述与实现的细节不一致，不影响 HUD 快照链路；本轮仅记录，不据此判失败。

## 3. 上一轮重点缺陷的静态复核（不替代运行期）

### 3.1 ① 第 3 波武器是否真正装备并出手

**静态结论：链路闭合，未见“只展示不装备/不出手”的静态断点；运行期未验证。**

核对到的实际代码路径：

1. `game/items/arsenal.js`
   - `grantWeapon(id)` 将 `ownedWeapons[id]` 置为 true，设置 `activeWeaponId = id`，发出 inventory 变化，并调用 `notifyWeaponChanged`。
   - `notifyWeaponChanged` 调用 `ctx.onWeaponChanged(weaponSnapshot, source)`。
   - `onWaveStarted(waveIndex)` → `maybeSpawnWeaponDrop`：在 `weaponDropWaveIndex: 3` 且 `weaponDropId: 'liu-ye-dao'` 未拥有时，生成一个 weapon pickup，位置在玩家 140~180 px 附近；`weaponDropDone` 防止一轮重复。
   - `update(dt, playerState)` 对 pickup 做距离判定（`pickupRadius + pickup.radius`）；进入范围后 `collectPickup`，weapon 类型调用 `grantWeapon(pickup.id)`。

2. `game/app/app.js`
   - `buildContext` 中的 `onWeaponChanged` 回调执行 `syncCombatWeapons(); invalidateModifiers();`。
   - `syncCombatWeapons()`：取 `ownedWeaponIds()` 与 `currentWeaponId()`；若 `combat.addWeapon` 存在，则对每个已拥有武器调用 `combat.addWeapon(id)`，并对 active 调用 `combat.setWeapon(active)`。
   - `currentWeaponId()` 优先通过 `Integration.arsenalWeaponId(arsenal)` 读取；`game/app/integrations.js` 的优先级为 `getActiveWeapon().id` → `getState().activeWeaponId` → 其他兼容 getter。
   - `handleWaveStarted(wave)` 在 `enemies.spawnWave` 后调用 `arsenal.onWaveStarted(wave.index)`；只有 arsenal 缺位时才走 App 的 `grantWeapon` 兜底。
   - `resetRun()` 在 `arsenal.reset` 后再次调用 `syncCombatWeapons()`。

3. `game/combat/combat.js`
   - `addWeapon` 按 id 去重加入武器槽；`setWeapon` 设置 active 显示/状态。
   - `update` 遍历所有武器槽，各自判断冷却、在 `finalRange(slot.def)` 内查找最近敌人，满足条件即 `fireWeapon`；近战走 `Collision.sectorTargets`，远程走投射物。
   - 伤害通过 `ctx.applyDamage(enemy, amount)`，不绕过 App 的伤害入口。
   - 因此“第 3 波拾取柳叶刀 → grantWeapon → 同步到 combat → combat.update 自动开火”的静态路径没有断点。

**仍需运行期确认：** 第 3 波掉落是否实际出现、玩家拾取后 HUD/画面是否能观察到柳叶刀投射物、伤害是否实际生效、是否与初始铁剑同时开火。缺浏览器通道，故 AC-6 仍为未验证。

### 3.2 ② 每次击杀是否只生成一枚经验球

**静态结论：正常路径只生成一枚；未见 App 与 progression 双重生成；运行期未验证。**

核对到的实际代码路径：

1. `game/app/app.js`
   - 创建 progression 时使用：
     `var progressionCtx = copyContext(ctx, { autoSubscribeEnemyKilled: false });`
     即显式关闭 progression 对 `enemy:killed` 的自动订阅。
   - `bindBus` 只注册一次 `enemy:killed` → `handleEnemyKilled`。
   - `handleEnemyKilled(payload)` 先增加 kills；若 payload 存在，调用 `arsenal.onEnemyKilled(payload)`（若 arsenal 存在，否则 `maybeDropItem`）；随后只调用一次 `progression.handleEnemyKilled(payload)`。
   - 正常路径不调用 `progression.spawnExpDrop`；只有 progression 不存在 `handleEnemyKilled` 时才走 `spawnExpDrop` 兜底。
2. `game/progression/progression.js`
   - `createProgression` 只有在 `opts.autoSubscribeEnemyKilled` 未显式设为 false 时才自动订阅；App 已显式设为 false。
   - `handleEnemyKilled(payload)` 以 payload 对象身份做 `lastPayloads` 去重，然后调用 `spawnExpDrop(payload.x, payload.y, payload.exp)`；`spawnExpDrop` 从对象池取得**一个** orb。
   - `update` 处理 orb 生命周期、磁吸、拾取；`collectOrb` 只对单个 orb 应用经验并发出 `exp:pickup`。
3. `game/enemies/enemies.js`
   - `killEnemy` 设置 `dead=true`、`hp=0`，只发出一次 `enemy:killed`，payload 含 `enemyId/type/x/y/exp`。
   - `damageEnemy` 在 hp<=0 时调用 `killEnemy`，不存在同一帧重复发事件的分支。

**静态判断：** `enemy:killed` 单次发出 → App 单次转交 → progression 单次 `spawnExpDrop`，静态上不构成双倍经验球。**仍需运行期确认：** 实际击杀后地面经验球数量、拾取后经验增量、升级阈值是否只触发一次；缺运行期通道，故 AC-5 仍为未验证。

### 3.3 ③ 道具掉落是否走 arsenal 地面拾取链路

**静态结论：走 arsenal 掉落/更新/拾取链路；App 不再即时 `grantItem`；运行期未验证。**

核对到的实际代码路径：

1. `game/app/app.js`
   - `handleEnemyKilled` 中，arsenal 存在时调用 `arsenal.onEnemyKilled(payload)`；仅当 arsenal 缺位时才调用 `maybeDropItem()`。
   - `grantItem` 只是对外兼容入口：arsenal 存在时委托 `arsenal.grantItem`，不用于击杀即时发放。
2. `game/items/arsenal.js`
   - `onEnemyKilled(payload)` 按 `itemDropChance`（配置 0.05）和 `itemPool` 抽取道具，调用 `spawnDrop` 生成地面 item pickup；不在击杀回调里直接 `grantItem`。
   - `spawnDrop` 将 pickup 放入 `state.drops`，并发出 inventory 变化通知。
   - `update(dt, playerState)` 遍历 drops，按 `pickupRadius + pickup.radius` 判定拾取；`collectPickup` 对 item 类型调用 `arsenal.grantItem(pickup.id, { player: ..., source: 'pickup' })`。
   - `grantItem` 对 passive 道具增加层数并触发 modifiers 变化；对 consumable 道具调用玩家 `heal` 并记录实际回血量。
   - `render` 绘制 pickup 和拾取反馈；拾取后从 `drops` 移除。
3. `game/app/app.js`
   - 主循环 `stepWorld` 在 `enemies.update`、`combat.update`、`progression.update` 后调用 `arsenal.update`，保证掉落物每步可更新/拾取。
   - `getModifiers` 会把 `arsenal.getModifiers()` 纳入玩家/战斗修饰符；道具被动在拾取后通过 `onModifiersChanged` 使缓存失效。

**静态判断：** 道具不再由 App 击杀时直接发放，而是“生成地面 pickup → 玩家靠近 → arsenal.update 拾取 → grantItem/治疗”的链路。**仍需运行期确认：** 5% 掉率下道具是否实际出现、拾取是否触发、被动/消耗效果是否可观察；缺运行期通道，故 AC-6 仍为未验证。

## 4. AC-1~AC-8 逐项结果

> 统一说明：本轮无浏览器/运行期证据，以下“未验证”不等于实现一定错误；只是不能按冻结 criteria 判为通过。通过数为 0/8。

| 项目 | 优先级 | 结果 | 静态观察 | 未验证原因/缺口 |
|---|---|---|---|---|
| AC-1 `file://` 直接打开、免安装/构建/服务器、无阻断错误 | P0 | 未验证 | `index.html` 使用相对路径经典脚本；未见构建入口；根 README 说明双击打开 | 未实际双击打开；无 Console/Network/阻断错误证据；无运行期首屏证据 |
| AC-2 玩家移动、受伤、死亡；敌人持续生成并形成威胁 | P0 | 未验证 | `player.update` 读取 `input.moveVector`；`takeDamage`/死亡分支存在；`enemies.spawnWave`/追踪/接触伤害存在；App 主循环串联 | 未真实按键移动、未观察受伤/死亡、未观察敌人持续生成与威胁 |
| AC-3 自动攻击无需手动瞄准，命中最近/范围内敌人 | P0 | 未验证 | `combat.update` 遍历武器、`findNearest` + `finalRange`、冷却后 `fireWeapon`；伤害走 `ctx.applyDamage` | 未观察实际自动锁定、命中、伤害数字/敌人掉血 |
| AC-4 波次推进、胜利/失败结算、重开再玩 | P0 | 未验证 | `wave-scheduler` 按 `startSec` 推进 6 波/210 秒；`finishRun('victory'/'defeat')`；UI 结果面板与 `restartRun` 回调存在 | 未真实推进波次、未触发胜负结算、未点击重开验证状态复位 |
| AC-5 击杀给经验、阈值升级、2~3 个升级选项、选择后效果可感知 | P0 | 未验证 | 经验球/拾取/升级/三选一/修饰符重算链路可见；`choiceCount:3`，8 个升级配置；UI 升级面板存在 | 未观察经验增量、升级触发、选项数量与选择后实际效果；单球双球仅静态判断 |
| AC-6 至少一种非初始武器/道具可通过玩法获得并生效 | P0 | 未验证 | 配置有 `liu-ye-dao` 第 3 波掉落、4 种道具 5% 掉落；arsenal 掉落/拾取/装备/治疗链路可见；静态链路已闭合 | 未实际拾取第 3 波武器、未观察投射物/伤害；未观察道具实际掉落与生效 |
| AC-7 HUD 可读，含 HP、等级/经验、波次/时间 | P0 | 未验证 | `ui.js` 构建 HUD 的 HP、经验、等级、波次、剩余时间、击杀等节点；`styles.css` 本地样式 | 未实际查看 HUD 排版、遮挡、可读性与数值更新 |
| AC-8 3~5 分钟离线完整闭环，可重开 | P0 | 未验证 | 配置 `durationSec:210`（3.5 分钟）；6 波；无外部依赖；重开路径存在 | 未真实连续运行 3~5 分钟；无计时、无完整闭环、无离线运行证据 |

**AC 小结：** 0 通过、8 未验证、0 静态明确失败。上一轮 v1/v2 的“模块缺失/入口缺失”问题在当前现场已不再成立；阻碍结论的是运行期证据通道与 OID 独立确认。

## 5. T-1~T-7 逐项结果

| 项目 | 结果 | 依据/限制 |
|---|---|---|
| T-1 `file://` 直接打开可运行 | 未验证 | 无浏览器；未实际打开 `index.html`，无首屏/Console 证据 |
| T-2 无构建链/无需安装依赖 | 未验证（静态部分符合） | 根目录未见 `package.json`/打包器配置；`index.html` 仅加载相对经典脚本。未执行安装/构建，也未实际打开验证“无需构建即可运行”。静态记录：`docs/verification/wuxia-roguelike-t2-static-v1.txt` |
| T-3 无外部 CDN/字体/图片/音频 | 未验证（静态部分符合） | `index.html`、`styles.css` 与已读脚本未见外部 URL、`@font-face`、`url(...)` 远程资源；使用系统字体与 Canvas 绘制。未开 DevTools Network，无法确认运行期零外部请求。静态记录：`docs/verification/wuxia-roguelike-t3-static-v1.txt` |
| T-4 无 ES Module，经典脚本加载 | **通过（静态）** | `index.html` 无 `type="module"`；已读 `game/**/*.js` 均为 IIFE，未发现实际 `import`/`export`/动态 `import()`。T-4 为静态核对项。记录：`docs/verification/wuxia-roguelike-t4-static-v1.txt` |
| T-5 无本地 fetch/XHR，配置由 JS 常量提供 | **通过（静态）** | `game/data/config.js` 为经典 IIFE 常量并在入口先加载；已读脚本未见实际 `fetch`/`XMLHttpRequest`。T-5 为静态核对项。记录：`docs/verification/wuxia-roguelike-t5-static-v1.txt` |
| T-6 无阻断性 Console 错误 | 未验证 | 无浏览器/Console；不能确认首屏、波次、升级、结算、重开过程零阻断错误 |
| T-7 单一 `window.WX` 命名空间，脚本顺序正确 | 未验证（静态部分符合） | 入口顺序为 config → engine → player/combat/enemies/progression/items → ui → app → 启动；各模块挂载 `WX.*`。未在运行期检查 `window.WX` 对象与启动时序。记录：`docs/verification/wuxia-roguelike-t7-static-v1.txt` |

**T 小结：** T-4、T-5 静态核对通过；T-2、T-3、T-7 有静态观察但运行期部分未验证；T-1、T-6 未验证。整体仍不满足 AC 通过条件。

## 6. 偏差、缺陷线索与返工建议

### 6.1 明确静态缺陷

本轮未发现足以直接判 AC 失败的明确静态缺陷；三个上一轮重点缺陷在代码链路上均呈现为已修复。由于缺少运行期证据，不能把“静态无断点”写成“验收通过”。

### 6.2 需要核实的交付/文档差异

1. **`qa/` 目录缺失**：`README.md` 描述存在 `qa/` 自测/验收辅助目录，但当前 `list_dir qa` 未发现。影响交付说明与验收辅助材料的完整性，不影响已读运行时代码的静态链路。建议原属主核实；修复线索：`qa-acceptance` / `env-bootstrap`。
2. **App README 与 UI 实现细节不一致**：`game/app/README.md` 称 UI 直接订阅 `player:hp-changed`，实际 `game/ui/ui.js` 通过 App 快照更新 HUD。属于文档描述偏差，不影响 HUD 快照；建议文档属主修正说明。
3. **OID 独立确认缺口**：任务指定 OID 已记录，但本会话无结构化 Git 工具且不能运行 git/shell，无法独立证明工作树内容与 OID 字节一致。建议由具备结构化 Git 的责任链在 A12b 归档前核实；若不一致，应按新 OID 重验。
4. **运行期通道缺口**：没有浏览器、DevTools、Console、Network、截屏和计时能力，AC-1~AC-8 与 T-1/T-6 无法完成 criteria 要求的真实核对。建议幕僚安排具备浏览器/运行期证据的验收环境，或在下一轮提供真实运行截图、Console/Network 记录与指定 OID。

### 6.3 返工建议

- 当前状态为 **blocked**，不是代码失败；不建议仅因“缺少运行期通道”把任务当作实现不通过回 A11 返工。
- 若后续运行期核对发现具体行为失败（例如第 3 波武器未实际开火、击杀生成双经验球、道具未走拾取链路），再按失败项回对应模块属主修复，并以新指定 OID 重验。
- 修复/补证后必须产生新的指定最终 OID，重新执行 AC-1~AC-8；不得沿用本轮静态结论替代。

## 7. 证据与声明

### 7.1 本轮产物

- 本报告：`docs/quality/wuxia-roguelike-report-v3.md`
- 静态核对附件：
  - `docs/verification/wuxia-roguelike-t2-static-v1.txt`
  - `docs/verification/wuxia-roguelike-t3-static-v1.txt`
  - `docs/verification/wuxia-roguelike-t4-static-v1.txt`
  - `docs/verification/wuxia-roguelike-t5-static-v1.txt`
  - `docs/verification/wuxia-roguelike-t7-static-v1.txt`

以上附件均为**只读静态记录**，不是运行期证据，未配 P0 sidecar；不得据此宣称 AC 通过。

### 7.2 未取得/未伪造的证据

- 未取得：浏览器首屏截图、Console 错误/警告、Network 请求列表、真实波次推进、升级选择、掉落拾取、胜利/失败结算、重开、3~5 分钟计时、离线运行记录。
- 未执行：任何 shell、Node、npm、git、测试脚本、构建或服务器命令。
- 未计算：任何文件 sha256/bytes/lines；不伪造 sidecar、不伪造测试输出、不伪造客户批准。
- 未修改：`docs/quality/wuxia-roguelike-criteria-v1.md`、`report-v1`、`report-v2`、任何 `game/**` 实现、入口、配置或其他角色资料。
- 未发起：客户验收卡、接受/拒绝选择、合并批准或发布动作。固定路径 `docs/acceptance/` 归档由应用在 A12b 完成时生成，本角色只读。

## 8. 给幕僚的回报要点

- 报告路径：`docs/quality/wuxia-roguelike-report-v3.md`
- 指定 OID：`9ee4afe2f87c9504992c616f23340f1438843edb`（任务文本；未独立做 Git 字节一致性核验）
- 冻结 criteria：`docs/quality/wuxia-roguelike-criteria-v1.md`（v1/final）
- 结论：**blocked**；AC 0/8 通过、8/8 未验证；T-4/T-5 静态通过，T-1/T-6 未验证，T-2/T-3/T-7 静态部分符合但运行期未验证。
- 重点缺陷：①②③均静态呈现为已修复，但均需运行期确认，不能据此判 AC 通过。
- 建议：安排具备浏览器/Console/Network/截屏与 OID 结构化核验的下一轮验收；本报告不代客户验收、不批准合并。
