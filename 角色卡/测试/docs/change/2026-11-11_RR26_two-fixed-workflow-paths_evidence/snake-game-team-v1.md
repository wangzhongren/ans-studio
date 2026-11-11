---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: a04edcc66995b20a6de6197c2baef38d8cce54f1c8ebe897a963340c0d8bf569
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: 4c42ecbee3b2087026155c95f6b3971fefcf1f33656578786123629069dc3611
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [styles.css, index.html]
    dependsOn: []
  - roleId: game-owner
    modules: [game]
    writesets: [src/game.js]
    dependsOn: [env-bootstrap]
---
# 团队计划（snake-game v1）

## 1. 计划说明
本计划依据已确认产品意图 `docs/product/snake-game-intent-v1.md`（v1，intentId=snake-game-intent）、已接受方案与名单（`docs/proposals/snake-game-roster-v1.md` v1）、模块清单（`docs/proposals/snake-game-modules-v1.md` v1）与架构契约（`docs/contracts/snake-game-architecture-v1.md` v1）制定，仅覆盖名单内两个项目角色与三个模块，不增招、不扩张边界。

## 2. 角色、模块与写集
| 角色 | 模块 | 写集（模块根内） | 依赖 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | `styles.css`、`index.html` | 无 |
| game-owner | game | `src/game.js` | env-bootstrap（需其提供的 DOM id 与脚本/样式加载入口） |

- 每模块恰一属主：env-resources 与 entry-index 归 env-bootstrap；game 归 game-owner。
- 写集互不重叠，均限定在属主模块根内；不涉及治理目录。
- 依赖方向：entry-index（`index.html`）加载 env-resources（`styles.css`）与 game（`src/game.js`）；game 只依赖架构契约 4.1 的 DOM id 与 4.2 的脚本契约，不反向依赖页面结构。

## 3. 实现与交接安排
1. env-bootstrap 先落 `index.html`（含 DOM id 契约）与 `styles.css`，并向运营提交报告。
2. game-owner 在 `src/game.js` 实现全部规则、渲染、输入与主循环；依赖 env-bootstrap 的产物就绪后执行，写集仅 `src/game.js`。
3. 两者均不得写其他文件、不得改契约；如 DOM id 需变更须停手并由运营协调出新契约版本。
4. 同工作区写任务串行执行：同一时刻只允许一个角色写盘，避免互相覆盖。

## 4. 验收与依据
- 验收标准：产品意图 frontmatter acceptance 的 A1–A10，由验收角色在桌面 Chrome/Edge 最新版以 `file://` 打开页面逐条人工试玩判定。
- 交付物：`index.html`、`styles.css`、`src/game.js` 三文件，零依赖、零构建。
- 本计划不改变意图、方案、名单与契约；任何范围变化另出版本。

## 5. 基线
- 普通 Git 仓库：`git init -b main`（应用执行）。
- `.gitignore`：ans 托管块 + baseline commit（仅 `.gitignore`，保留用户内容）。
- 任务分支：`ans/task/wf-afe8ddbeba445bed145ccd1c`。
- 基线失败按 `baseline-*` fail-closed，不弹客户卡、不伪造成功。
