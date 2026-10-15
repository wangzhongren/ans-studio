# 接口契约（api-spec）

项目：kanban-live ｜ 版本：v1.0.0（2026-10-15 首版实现，契约照 su 派发的冻结约定实现，未单方面改动）

## 0. 通用约定

- 传输：HTTP/1.1，本机 `127.0.0.1`；JSON 请求/响应，字符集 UTF-8。
- 监听：仅 `127.0.0.1`；端口默认 `4173`（`PORT` 覆盖）；数据文件默认 `data/tasks.json`（`KANBAN_DATA_FILE` 覆盖）。
- 错误统一体：

```json
{ "error": { "code": "ERROR_CODE", "message": "中文可读说明" } }
```

- 未知路径 / 不存在的资源：`404`，`code = "NOT_FOUND"`，`message = "接口或页面不存在"`。

## 1. 数据模型

```json
{
  "id": "uuid 字符串（crypto.randomUUID()）",
  "title": "trim 后 1–200 字符",
  "status": "todo | doing | done",
  "priority": "low | medium | high",
  "tags": ["标签字符串", "…最多 10 个，单个 ≤30 字符"],
  "createdAt": "ISO8601 字符串",
  "updatedAt": "ISO8601 字符串"
}
```

规整规则（`src/core.js`）：

| 字段 | 规则 |
|---|---|
| `title` | `trim()` 后 1–200 字符；空 / 全空白 → 错误 `TITLE_REQUIRED`；>200 → 错误 `TITLE_TOO_LONG` |
| `priority` | 忽略大小写与首尾空白；非 `low/medium/high` 一律回落 `medium`（不报错） |
| `tags` | 接受数组或以中英文逗号分隔的字符串；逐项 `trim`、丢弃空项、去重、单个超 30 字符截断、最多保留 10 个 |
| `status` | 创建时默认 `todo`；更新时只接受 `todo/doing/done`（忽略大小写），否则 `INVALID_STATUS` |
| `id` | `crypto.randomUUID()`（读取历史文件时若缺失则补生成） |
| `createdAt` | 创建时刻 ISO8601；更新不会改 |
| `updatedAt` | 任何一次成功更新后刷新为当前 ISO8601 |

## 2. 接口清单

### GET `/`

- 响应 `200`，`Content-Type: text/html; charset=utf-8`，返回中文看板页面。
- 同源静态资源：`GET /app.js`、`GET /style.css`（`text/javascript` / `text/css`），`GET /favicon.ico` → `204`。

### GET `/api/tasks`

查询参数（全部可选）：

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `status` | `todo` / `doing` / `done` / `all` | 不筛选 | `all` 或空等同不筛选 |
| `tag` | 标签名 / `all` | 不筛选 | 精确匹配任务标签数组中的某一项 |
| `q` | 任意字符串 | 不筛选 | 大小写不敏感，命中标题或标签子串 |
| `sort` | `createdAt` / `priority` | `createdAt` | 其它值按 `createdAt` 处理 |
| `order` | `asc` / `desc` | `desc` | 其它值按 `desc` 处理 |

- 响应 `200`：`{ "tasks": [任务…], "warning": null | { "code": "DATA_FILE_CORRUPT", "message": "中文说明", "backupPath": "绝对路径" } }`
- 排序稳定性：同键时按 `createdAt`、再按 `id` 比较，结果确定。
- 排序不改变存储顺序（内存与文件顺序不受影响）。

### POST `/api/tasks`

- 请求体：`{ "title": "必填", "priority": "可选", "tags": "可选（数组或逗号分隔字符串）" }`
- `201`：`{ "task": {…}, "warning": null | {…} }`
- 失败：
  - `400 TITLE_REQUIRED` —— 标题缺失 / 非字符串 / 全空白
  - `400 TITLE_TOO_LONG` —— trim 后超过 200 字符
  - `400 BAD_JSON` —— 请求体不是合法 JSON，或不是 JSON 对象

### PUT `/api/tasks/:id`

- 请求体可含 `title` / `priority` / `tags` / `status` 中任意一个或多个；只处理这四个字段，
  `id`、`createdAt` 不可被覆盖。
- `200`：`{ "task": {…} }`
- 失败：`404 NOT_FOUND`（id 不存在）、`400 TITLE_REQUIRED`、`400 TITLE_TOO_LONG`、
  `400 INVALID_STATUS`、`400 BAD_JSON`
- 兼容：`PATCH /api/tasks/:id` 行为与 `PUT` 相同。

### DELETE `/api/tasks/:id`

- `200`：`{ "ok": true }`
- `404 NOT_FOUND`（id 不存在）

### GET `/api/stats`

- `200`：

```json
{ "total": 3, "byStatus": { "todo": 1, "doing": 1, "done": 1 }, "byTag": { "前端": 2, "文档": 1 } }
```

- `byStatus` 恒含 `todo/doing/done` 三个键（无任务时为 0）；`byTag` 只包含出现过的标签。

### GET `/api/export`

- `200`：`{ "exportedAt": "ISO8601", "count": 2, "tasks": [任务…] }`
- 响应头含 `Content-Disposition: attachment; filename="kanban-export-<YYYYMMDD>.json"`。
- 返回**全部**任务，不受筛选参数影响。

### GET `/api/status`

- `200`：`{ "ok": true, "dataFile": "数据文件绝对路径", "warning": null | { "code": "DATA_FILE_CORRUPT", "message": "中文说明", "backupPath": "备份文件绝对路径" } }`
- 语义约定（本实现口径，已写入 README）：`ok` 表示**服务可用**，正常运行时恒为 `true`；
  数据文件异常不体现在 `ok` 上，而是通过 `warning` 暴露。

## 3. 错误码总表

| code | HTTP | message 示例（中文） | 触发场景 |
|---|---|---|---|
| `TITLE_REQUIRED` | 400 | 任务标题必填，不能为空或全为空白字符 | 标题缺失/空白 |
| `TITLE_TOO_LONG` | 400 | 任务标题过长，最多 200 个字符 | 标题 >200 字符 |
| `INVALID_STATUS` | 400 | 任务状态只能是 待办/进行中/已完成（todo/doing/done） | 更新时传入非法 status |
| `INVALID_TASK` | 400 | 待更新的任务对象不合法 | 领域层收到非法任务对象 |
| `BAD_JSON` | 400 | 请求体不是合法的 JSON：… | 请求体解析失败或不是对象 |
| `BAD_REQUEST` | 400 | 读取请求体失败：… | 连接读取异常 |
| `METHOD_NOT_ALLOWED` | 405 | 该方法不被支持 | 方法不匹配 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体过大，最大允许 1MB | body > 1MiB |
| `NOT_FOUND` | 404 | 任务不存在 / 接口或页面不存在 | id 不存在或路径未知 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误：… | 未预期异常 |
| `DATA_FILE_CORRUPT`（1） | — | 数据文件已损坏或格式非法（原因），已把原文件备份为 …，当前以空任务列表继续运行，未丢失原始数据。 | 数据文件损坏（**只出现在 `warning` 字段，不作为 HTTP 错误返回**） |

（1）`DATA_FILE_CORRUPT` 属于数据告警，出现在 `GET /api/tasks`、`POST /api/tasks`、`GET /api/status`
的 `warning` 字段中，并在页面红色横幅展示。

## 4. 模块导出契约（测试依赖，不得改名）

### `src/core.js`

| 导出 | 签名 | 语义 |
|---|---|---|
| `validateTitle` | `(title) => boolean` | trim 后 1–200 字符为 `true`，否则 `false`（不抛异常） |
| `normalizeTags` | `(tags) => string[]` | 数组或逗号分隔字符串 → 规整后的标签数组 |
| `normalizePriority` | `(p) => 'low'\|'medium'\|'high'` | 非法值回落 `medium` |
| `createTask` | `(input, now?) => task` | `input` 可为 `{title,priority?,tags?,status?}` 或标题字符串；`now` 可注入时间；标题非法会抛错（`err.code`） |
| `updateTask` | `(task, patch, now?) => task` | **就地更新并返回同一对象**；只识别 title/priority/tags/status；刷新 `updatedAt`；标题非法/状态非法抛错 |
| `filterTasks` | `(tasks, options) => task[]` | `options = {status?,tag?,q?}`（也接受 `keyword`）；`all` 与空值不筛选；返回新数组 |
| `sortTasks` | `(tasks, options, order?) => task[]` | `options = {sort,order}` 或字符串 `'createdAt'\|'priority'`；返回新数组，不改入参 |
| `computeStats` | `(tasks) => {total,byStatus,byTag}` | 见 `/api/stats` |

附带导出（不属冻结项，供服务端/文档使用）：`STATUSES`、`PRIORITIES`、`STATUS_LABELS`、
`PRIORITY_LABELS`、`DEFAULT_STATUS`、`DEFAULT_PRIORITY`、`TITLE_MAX_LENGTH`、`TAG_MAX_LENGTH`、`TAGS_MAX_COUNT`。

### `src/store.js`

`createStore({ dataFile })` → 对象，含：

| 成员 | 签名 | 语义 |
|---|---|---|
| `list()` | `() => task[]` | 返回全部任务的**副本**（按存储顺序） |
| `get(id)` | `(id) => task \| null` | 不存在返回 `null` |
| `create(input)` | `(input) => task` | 校验通过后写入并返回新任务；标题非法抛 `TITLE_REQUIRED` / `TITLE_TOO_LONG` |
| `update(id, patch)` | `(id, patch) => task` | 不存在抛 `NOT_FOUND`；标题非法抛 `TITLE_REQUIRED` |
| `remove(id)` | `(id) => task` | 返回被删除任务；不存在抛 `NOT_FOUND` |
| `warning` | getter | `null` 或 `{code:'DATA_FILE_CORRUPT', message, backupPath}` |
| `dataFile` | string | 数据文件绝对路径 |

- 模块导出兼容两种写法：`const { createStore } = require('./store')` 与 `require('./store')({...})`。
- 损坏处理：读取时 JSON 非法或结构非法 → 备份为 `<dataFile>.corrupt-<时间戳>`（ISO 去冒号点号）、
  stderr 打印中文错误、`warning` 置位、以空列表继续；**不会静默清空**。
- 写入：同目录临时文件 → `write` → `fsync` → `close` → `fs.rename` 覆盖；失败时清理临时文件并抛错。

### `src/server.js`

- `createServer({ dataFile, port }) => Promise<{ server, port, url, close, store, dataFile }>`
  - 只监听 `127.0.0.1`；`port` 省略/为空 → `4173`；`port = 0` → 系统分配，返回真实端口。
  - `url` 形如 `http://127.0.0.1:4173`。
  - `close()` → `Promise<void>`：断开 keep-alive 连接并关闭服务。
  - 额外返回 `store`、`dataFile` 便于自查与启动日志（契约要求字段之外的新增字段，不影响原字段）。
- 模块导出兼容 `const { createServer } = require('./server')` 与 `require('./server')({...})`。
- `node src/server.js` 直接运行：打印访问地址与数据文件，监听 SIGINT/SIGTERM，收到后关闭并 `exit(0)`；
  启动失败（端口占用等）打印中文原因并以退出码 1 结束。

## 5. 与冻结约定的差异说明

**无接口层面的改动**。仅两点实现口径需向 su/客户报备（详见 `角色卡/实现者/memo.md`）：

1. 新增了契约未列出的错误码 `TITLE_TOO_LONG`（400）、`INVALID_STATUS`（400）、`METHOD_NOT_ALLOWED`（405）、
   `PAYLOAD_TOO_LARGE`（413）、`INVALID_TASK`（400）；均不改变既有码的语义与状态码。
2. `GET /api/status` 的 `ok` 定为「服务可用」恒 `true`，数据异常只经 `warning` 表达（契约未定义 `ok` 语义）。
