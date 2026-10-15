# 变更记录（changelog）

## v1.0.0 — 2026-10-15（首版完整交付）

首版即完整（客户要求「第一版即完整」），一次性交付 10 条功能 + 文档。

### 新增文件

| 路径 | 说明 |
|---|---|
| `src/core.js` | 领域逻辑：`validateTitle` / `normalizeTags` / `normalizePriority` / `createTask` / `updateTask` / `filterTasks` / `sortTasks` / `computeStats` |
| `src/store.js` | `createStore({dataFile})`：`list/get/create/update/remove/warning/dataFile`；原子写、损坏备份与告警 |
| `src/server.js` | `createServer({dataFile,port})` → `Promise<{server,port,url,close}>`；`node src/server.js` 直接启动 |
| `src/public/index.html` | 中文看板页面（无外链资源、无框架） |
| `src/public/app.js` | 原生 JS 交互；用户数据一律 `textContent` 渲染 |
| `src/public/style.css` | 原生 CSS（三列看板、告警横幅、编辑弹窗） |
| `package.json` | `scripts: {start, test}`，**无 dependencies** |
| `.gitignore` | 忽略 `data/`、`temp/`、`node_modules/` |
| `README.md` | 启动命令、端口/环境变量、页面用法、API 契约表、数据文件位置、损坏恢复步骤、跑测命令 |
| `test/实现者/smoke.test.js` | 自查 smoke 用例 11 条（core / store / HTTP / 前端资源） |
| `角色卡/实现者/*.md` | feature-map / functional-description / api-spec / memo / changelog（本批交付） |
| `temp/实现者/selfcheck.js`、`temp/实现者/default-start-check.js` | 自查脚本（草稿区，非交付物） |

### 关键实现要点

1. **原子写**：`store.persist()` = 同目录临时文件 → `write` → `fsync` → `close` → `fs.rename`；失败清理临时文件。
2. **损坏不静默清空**：JSON 非法或结构非法 → `rename` 备份为 `tasks.json.corrupt-<时间戳>` → stderr 中文错误
   → `warning` 置位（`/api/status`、`/api/tasks`、页面红色横幅三处暴露）→ 以空列表继续。
3. **两层空白标题拒绝**：界面层不发请求、接口层 `400 TITLE_REQUIRED`。
4. **文本安全**：前端 0 处 HTML 字符串注入，标题/标签全部 `textContent`。
5. **只绑 127.0.0.1**：`HOST` 为代码常量，不可通过环境变量放开。
6. **优雅退出**：SIGINT/SIGTERM → `close()` → `exit(0)`，不留常驻进程。

### 与契约的差异（已报 su，未单方面改动既有约定）

- 新增（契约未列）错误码：`TITLE_TOO_LONG`(400)、`INVALID_STATUS`(400)、`INVALID_TASK`(400)、
  `METHOD_NOT_ALLOWED`(405)、`PAYLOAD_TOO_LARGE`(413)。既有码语义、状态码未动。
- `GET /api/status` 的 `ok` 定义：`ok` = 服务可用（恒 `true`）；数据异常只经 `warning` 表达
  （契约未定义 `ok` 语义，已在 README 与 api-spec 写明）。
- `store.js` / `server.js` 采用「函数即导出 + 同名属性」双形态导出，兼容
  `const { createStore } = require(...)` 与 `require(...)({...})` 两种写法，导出名未改。
- 跑测命令：Node v24 下 `node --test test/`（传目录）会报 `MODULE_NOT_FOUND`，README 给出
  `node --test`（自动发现）/ `node --test "test/**/*.test.js"` / `node --test test/实现者/smoke.test.js`。
  `package.json` 的 `test` 脚本相应写为 `node --test`。
