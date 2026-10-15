# 功能地图（feature-map）

项目：kanban-live（离线中文任务看板） ｜ 角色：实现者 ｜ 版本：v1.0.0（2026-10-15 首版交付）

## 一、功能清单（对客户验收的 10 条要求逐条映射）

| # | 需求（客户口径） | 实现位置 | 覆盖证据 |
|---|---|---|---|
| 1 | 新增任务；标题必填，空白标题**界面与接口两层拒绝**；可选优先级（低/中/高，默认中）与多个标签 | `src/public/app.js::submitCreate`（界面层）、`src/server.js` POST 分支 → `src/store.js::create` → `src/core.js::createTask/validateTitle`（接口层） | `test/实现者/smoke.test.js`「HTTP：完整链路…」空白标题 400 TITLE_REQUIRED；自查脚本第 4/5/6 步 |
| 2 | 三种状态 待办/进行中/已完成，可随时来回切换 | 数据模型 `status`（`src/core.js`）；卡片状态下拉框 `app.js::renderCard/changeStatus`；`PUT /api/tasks/:id` | 自查第 7 步（todo→doing）；smoke「core.createTask / updateTask」 |
| 3 | 编辑任务：可改标题、优先级、标签 | 编辑弹窗 `app.js::openEditModal/submitEdit`；`core.updateTask`；`store.update` | smoke「core.createTask / updateTask」；`PUT /api/tasks/:id` 用例 |
| 4 | 删除任务：界面带二次确认 | `app.js::removeTask`（`window.confirm`）+ `DELETE /api/tasks/:id` | 自查第 15 步；smoke 删除用例与 404 用例 |
| 5 | 筛选与排序：按状态、标签、关键字筛选；按创建时间或优先级排序 | `core.filterTasks` / `core.sortTasks`；`GET /api/tasks` 查询参数；前端筛选区 | smoke「core.filterTasks / sortTasks / computeStats」、筛选/排序接口用例；自查第 8/9 步 |
| 6 | 统计：各状态任务数 + 按标签任务数 | `core.computeStats`；`GET /api/stats`；前端统计区 `app.js::renderStats` | 自查第 10 步；smoke 统计断言 |
| 7 | 持久化：刷新/重启后数据仍在；写入**原子**（同目录临时文件 + `rename`） | `store.js::persist`（open→write→fsync→close→rename）、`store.js::load` | smoke「持久化 + 原子写」（重开 store 数据仍在、无 `.tmp-` 残留）；自查第 17/18 步 |
| 8 | 数据文件损坏：明确中文错误、**不静默清空**、先改名备份 `tasks.json.corrupt-<时间戳>`、stderr 打印、`/api/status` 与页面横幅暴露 | `store.js::reportCorrupt/backupCorruptFile`；`server.js` `/api/status`、`/api/tasks` 的 `warning`；`index.html#warning-banner` + `app.js::showWarning` | smoke「数据文件损坏」「结构损坏」「HTTP：损坏数据文件…」；README 第 6 节 |
| 9 | 文本安全：HTML 特殊字符 / `<script>` 原样按文本显示，绝不执行 | `app.js` 全程 `textContent`（标题、标签、提示文案），无 HTML 字符串注入 | smoke「前端资源：无外链、无 HTML 字符串注入用户数据」；自查第 5 步数据里就含 `<script>` |
| 10 | 导出：接口返回全部任务；页面放「导出 JSON」按钮 | `GET /api/export`（带 `Content-Disposition`）；`app.js::exportJson`（`index.html` 按钮「导出 JSON」） | 自查第 11 步；smoke 导出用例（文件名正则校验） |

## 二、非功能要求映射

| 要求 | 实现 | 证据 |
|---|---|---|
| 零第三方依赖 | `package.json` 无 `dependencies`；无 `node_modules`；仅 `node:http/fs/path/crypto` | 自查 `ls -a` 无 `node_modules`；smoke 前端资源无外链用例 |
| 只监听 127.0.0.1 | `server.js` 硬编码 `HOST = '127.0.0.1'`（不可配置） | 自查第 2 步 lsof 仅 `127.0.0.1:4188`；默认启动核查 4173 同样只绑 127.0.0.1 |
| 数据只落本机 JSON，不用数据库 | `store.js` 单文件 JSON + 原子 `rename` | 自查第 17 步文件内容 |
| 不写常驻进程，Ctrl+C 即退 | `server.js` 直接运行分支监听 SIGINT/SIGTERM 并 `close()` 后 `process.exit(0)` | 自查第 19 步 `{"code":0,"signal":null}` |
| 前端原生中文界面，无框架 | `src/public/index.html` + `app.js` + `style.css`，中文文案 | `GET /` 200 `text/html`；页面标题「离线中文任务看板」 |
| 冻结契约（导出名、接口、模型） | `core.js` / `store.js` / `server.js` 导出名与任务模型按契约实现 | `角色卡/实现者/api-spec.md` |

## 三、模块地图

```
src/core.js        纯领域逻辑（无 IO）：校验、规整、创建、更新、筛选、排序、统计
src/store.js       单文件 JSON 存储：加载/修复/备份/原子持久化 + 内存任务列表
src/server.js      HTTP 服务：静态页 + REST 接口 + 错误映射 + 启动/退出
src/public/*       原生前端：中文看板页（三列）、统计、筛选排序、编辑弹窗、导出、告警横幅
test/实现者/*      实现者自查 smoke 用例（不替代交付测试套件）
```

## 四、尚未实现 / 明确不做（v1 边界）

- 多用户、鉴权、协同（离线单机看板，无账户体系）。
- 任务拖拽排序、子任务、附件、富文本（首版以「够用且离线」为准）。
- 删除撤销（仅二次确认）。
- 数据导入（仅导出）；损坏恢复走「备份文件 + 人工确认」流程。
