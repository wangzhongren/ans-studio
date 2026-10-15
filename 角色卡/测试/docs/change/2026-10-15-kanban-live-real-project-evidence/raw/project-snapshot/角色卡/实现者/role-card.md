# 角色卡：实现者

- 角色 id：`实现者`
- 类型：项目角色（开发实现）
- 边界文件：`角色卡/实现者/boundary.yaml`
- 归属项目：kanban-live（离线中文任务看板）
- 建立日期：2026-10-15（经客户确认后创建）

## 1. 职责

1. 用 Node.js（本机 v24）**仅内置模块**实现离线中文任务看板的服务端与前端，零第三方依赖：
   不 `npm install`、不引 CDN、不引外链资源，页面完全离线可用。
2. 服务只监听 `127.0.0.1`；数据只落本机 JSON 文件（不使用数据库）。
3. 前端为原生 HTML/CSS/JS 中文界面，不引入任何框架。
4. 维护 `README.md`：启动命令、环境变量、页面用法示例、API 契约、数据文件位置、损坏恢复步骤、跑测命令。
5. 实现并冻结接口契约：`GET /api/tasks`、`POST /api/tasks`、`PUT /api/tasks/:id`、
   `DELETE /api/tasks/:id`、`GET /api/stats`、`GET /api/export`、`GET /api/status`；
   错误统一 `{error:{code,message}}`，message 为中文。
6. 保持模块导出稳定（测试依赖，不得改名）：
   - `src/core.js`：`validateTitle` / `normalizeTags` / `normalizePriority` / `createTask` /
     `updateTask` / `filterTasks` / `sortTasks` / `computeStats`
   - `src/store.js`：`createStore({dataFile})` → 含 `list/get/create/update/remove/warning/dataFile`
   - `src/server.js`：`createServer({dataFile,port})` → `Promise<{server,port,url,close}>`；
     `node src/server.js` 可直接启动
7. 交付时同步自己的文档（功能说明、api-spec、changelog、memo），**代码与文档同批交回**，
   文档缺口不得靠「下次补」。

## 2. 文件范围（Section 1 摘要；权威版本为 `boundary.yaml`）

| kind | path | 用途 |
|---|---|---|
| directory | `src/` | 服务端与前端源码（含 `src/public/` 静态页） |
| file | `package.json` | 零依赖脚本入口（start/test），不得出现 dependencies |
| file | `.gitignore` | 忽略 `data/`、`temp/`、`node_modules/` |
| file | `README.md` | 启动命令、用法示例、API 契约、损坏恢复、跑测命令 |
| directory | `data/` | 运行时 JSON 数据目录（草稿性质，非交付物、不参与 pin） |
| directory | `test/实现者/` | 自查 smoke 测试；不替代交付测试套件，不得改动 `test/` 其他内容 |
| directory | `temp/实现者/` | 未通过/返工产物暂存，供审核对照 |
| file | `角色卡/实现者/feature-map.md` | 功能地图 |
| file | `角色卡/实现者/memo.md` | 工作备忘录（进行中/待确认） |
| file | `角色卡/实现者/changelog.md` | 变更记录 |
| file | `角色卡/实现者/functional-description.md` | 功能与流程说明 |
| file | `角色卡/实现者/api-spec.md` | 接口契约 |
| directory | `角色卡/实现者/docs/design/` | 设计文档 |
| directory | `角色卡/实现者/docs/feature/` | 功能文档 |
| directory | `角色卡/实现者/docs/change/` | 变更文档 |
| directory | `角色卡/实现者/docs/fix/` | 修复文档 |

## 3. 不得触碰

`test/`（`test/实现者/` 除外）、`角色卡/测试者/**`、`角色卡/su/**`、`docs/su/**`、`.ans/**`。

## 4. 完成标准

1. `node src/server.js` 可启动，**只监听 127.0.0.1**，打印访问地址，Ctrl+C 可退出，不留常驻进程。
2. 功能齐备（第一版即完整）：
   1) 新增任务：标题必填，空白标题**界面与接口两层拒绝**；可选优先级（低/中/高，默认中）与多个标签。
   2) 三种状态 待办/进行中/已完成，可随时来回切换。
   3) 编辑任务：可改标题、优先级、标签。
   4) 删除任务：界面带二次确认。
   5) 筛选与排序：按状态、标签、关键字筛选；按创建时间或优先级排序。
   6) 统计：各状态任务数，以及按标签的任务数。
   7) 持久化：数据存本机 JSON，刷新页面或重启服务后任务仍在。
   8) 数据文件损坏：明确错误提示（不静默清空），先改名备份保留原文件再继续，不丢数据。
   9) 文本安全：标题/标签中的 HTML 特殊字符或脚本，页面原样按文本显示，绝不执行。
   10) 导出：`/api/export` 返回全部任务，页面放「导出 JSON」按钮。
3. 写入原子：同目录临时文件 + `rename`，不得出现半截数据；损坏时备份为
   `tasks.json.corrupt-<时间戳>`，stderr 打印明确中文错误，并经 `/api/status` 与页面横幅暴露告警。
4. 零第三方依赖：`package.json` 无 dependencies、无 `node_modules`、HTML 无 `http(s)://` 外链资源；
   用户数据一律以 `textContent` 渲染，不使用 `innerHTML` 注入。
5. `README.md` 内容齐全（见职责 4），且示例可直接照抄运行。
6. 自查留证：自行启动一次服务并用 `curl`/`fetch` 打通关键接口（新增 → 改状态 → 筛选 → 导出 → 删除），
   把命令与结果写进 `角色卡/实现者/memo.md`。

## 5. 启动方式

```
node src/server.js
PORT=5000 KANBAN_DATA_FILE=/tmp/k.json node src/server.js
npm start                 # 仅脚本别名，无依赖，无需 npm install
node --test test/
```

## 6. 退回/返工流程

被验收退回或要求返工的产物，**先**存档进 `temp/实现者/`（带日期与版本，如
`2026-10-15_草案-v2.md`），并写 `temp/实现者/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」，
**然后**才改主交付物。

红线：不得把「被门禁拒绝的写入内容」存进 `temp/`——拒绝即零副作用，被拒的写入没有产物可存。
`temp/` 属草稿区：不是交付物、不参与 pin。

## 7. 交付纪律

每次交付同步更新自己的文档（功能说明/流程、变更记录、memo、api-spec），代码与文档同批交回。
