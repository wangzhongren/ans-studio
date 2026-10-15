# 离线中文任务看板（kanban-live）

零第三方依赖的离线中文任务看板：服务端与前端**只使用 Node.js 内置模块**与原生 HTML/CSS/JS。
不 `npm install`、不引 CDN、不引任何外链资源，断网可用；数据只落本机 JSON 文件（不使用数据库）。
服务只监听 `127.0.0.1`，前台运行，Ctrl+C 即退，不留常驻进程。

---

## 1. 启动命令

```bash
# 方式一：直接启动（默认端口 4173，默认数据文件 data/tasks.json）
node src/server.js

# 方式二：npm 脚本别名（零依赖，无需 npm install）
npm start

# 方式三：自定义端口与数据文件
PORT=5000 KANBAN_DATA_FILE=/tmp/k.json node src/server.js
```

启动后终端打印：

```
离线中文任务看板已启动
访问地址：http://127.0.0.1:4173
数据文件：/绝对路径/data/tasks.json
按 Ctrl+C 退出。
```

浏览器打开打印出的地址即可使用。`Ctrl+C`（SIGINT/SIGTERM）会关闭服务并退出进程。

## 2. 端口与环境变量

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4173` | 监听端口；只监听 `127.0.0.1`，不可配置为其它网卡（不支持 `0.0.0.0`） |
| `KANBAN_DATA_FILE` | `<项目根>/data/tasks.json` | 数据文件路径，可指向任意本机路径 |
| `NODE_ENV` 等 | — | 不使用，无影响 |

## 3. 页面用法示例

1. **新增任务**：在「新增任务」区填标题（必填，最多 200 字），可选优先级（低/中/高，默认中）与标签
   （多个用逗号分隔，例如 `前端,紧急`），点「添加任务」。标题为空或全为空白时，界面立即提示
   「任务标题不能为空，请填写后再添加。」且**不会发出请求**；即使绕过界面直接调接口，服务端同样拒绝。
2. **切换状态**：每张任务卡上有状态下拉框，选择 待办 / 进行中 / 已完成 即保存，可任意来回切换。
3. **编辑任务**：点卡片上的「编辑」，在弹窗中修改标题、优先级、标签，点「保存」。
4. **删除任务**：点卡片上的「删除」，浏览器弹出二次确认「确定要删除任务「…」吗？删除后不可恢复。」，
   确认后才删除。
5. **筛选与排序**：在「筛选与排序」区按 状态 / 标签 / 关键字（匹配标题与标签）筛选，
   按 创建时间 或 优先级 排序，可选正序/倒序；「重置筛选」一键还原。
6. **统计**：顶部「统计」区显示全部任务数、各状态任务数（待办/进行中/已完成），以及按标签的任务数。
7. **持久化**：任何增删改都会立刻原子写入 JSON 文件；刷新页面或重启服务后任务仍在。
8. **导出**：点右上角「导出 JSON」，浏览器下载 `kanban-export-YYYYMMDD.json`（含全部任务，不受当前筛选影响）。
9. **数据告警横幅**：数据文件损坏时，页面顶部出现红色横幅，说明原因与备份文件名；服务不会静默清空数据。
10. **文本安全**：标题或标签里写 `<script>alert(1)</script>`、`<b>x</b>`、`&amp;` 等内容，
    页面一律原样显示为文本，不会执行、不会渲染成 HTML。

## 4. 完整 API 契约

统一约定：

- 请求/响应体均为 JSON（`Content-Type: application/json; charset=utf-8`）。
- 所有错误响应统一为 `{"error":{"code":"...","message":"中文说明"}}`。
- 未知路径统一返回 `404 {"error":{"code":"NOT_FOUND","message":"接口或页面不存在"}}`（`GET /api/unknown` 亦是）。

任务模型：

```json
{
  "id": "02860e76-c04e-4d82-9d14-d217ebec10fe",
  "title": "修复登录页",
  "status": "todo",
  "priority": "medium",
  "tags": ["前端", "紧急"],
  "createdAt": "2026-10-15T13:25:09.538Z",
  "updatedAt": "2026-10-15T13:25:09.538Z"
}
```

- `status`：`"todo" | "doing" | "done"`（界面显示 待办 / 进行中 / 已完成），默认 `"todo"`
- `priority`：`"low" | "medium" | "high"`（界面显示 低 / 中 / 高），默认 `"medium"`
- `title`：trim 后 1–200 字符，空白即拒绝
- `tags`：数组；trim、去空、去重，单个 ≤30 字符（超出截断），最多 10 个
- `id`：`crypto.randomUUID()`；`createdAt` / `updatedAt`：ISO8601 字符串

| 方法 | 路径 | 请求 | 成功响应 | 失败响应 |
|---|---|---|---|---|
| GET | `/` | — | `200` 中文看板页面（`text/html`） | — |
| GET | `/api/tasks` | 查询串 `status` `tag` `q` `sort=createdAt\|priority` `order=asc\|desc`（均可省略） | `200 {tasks:[...], warning:null\|{code,message,backupPath}}` | — |
| POST | `/api/tasks` | `{title, priority?, tags?}` | `201 {task, warning}` | 标题空白 `400 TITLE_REQUIRED`；标题超 200 字 `400 TITLE_TOO_LONG`；body 非法 JSON `400 BAD_JSON` |
| PUT | `/api/tasks/:id` | 可含 `title`/`priority`/`tags`/`status` 任一 | `200 {task}` | 不存在 `404 NOT_FOUND`；标题空白 `400 TITLE_REQUIRED`；状态非法 `400 INVALID_STATUS`；body 非法 JSON `400 BAD_JSON` |
| DELETE | `/api/tasks/:id` | — | `200 {ok:true}` | 不存在 `404 NOT_FOUND` |
| GET | `/api/stats` | — | `200 {total, byStatus:{todo,doing,done}, byTag:{"标签":数量}}` | — |
| GET | `/api/export` | — | `200 {exportedAt, count, tasks:[...]}`，并带 `Content-Disposition: attachment; filename="kanban-export-<YYYYMMDD>.json"` | — |
| GET | `/api/status` | — | `200 {ok, dataFile, warning}` | — |

补充说明：

- `GET /api/tasks` 的筛选参数：`status`（`todo/doing/done/all`）、`tag`（精确匹配某个标签，`all` 等同不筛选）、
  `q`（大小写不敏感，匹配标题或标签子串）；`sort` 默认 `createdAt`，`order` 默认 `desc`。
- `/api/status` 的 `ok` 表示**服务可用**（正常运行恒为 `true`）；数据文件异常通过 `warning` 暴露，
  正常为 `null`，异常为 `{code:"DATA_FILE_CORRUPT", message:"中文说明", backupPath:"备份文件绝对路径"}`。
- 方法不匹配（如 `DELETE /api/tasks`）返回 `405 METHOD_NOT_ALLOWED`；请求体超过 1MB 返回 `413 PAYLOAD_TOO_LARGE`。
- `/api/export` 返回全部任务，不受查询参数影响。

常用调用示例：

```bash
# 新增
curl -s -X POST http://127.0.0.1:4173/api/tasks -H 'Content-Type: application/json' \
  -d '{"title":"修复登录页","priority":"high","tags":["前端","紧急"]}'

# 改状态
curl -s -X PUT http://127.0.0.1:4173/api/tasks/<id> -H 'Content-Type: application/json' -d '{"status":"doing"}'

# 筛选 + 排序
curl -s 'http://127.0.0.1:4173/api/tasks?status=doing&tag=%E5%89%8D%E7%AB%AF&q=login&sort=priority&order=desc'

# 统计 / 导出 / 状态
curl -s http://127.0.0.1:4173/api/stats
curl -s -OJ http://127.0.0.1:4173/api/export
curl -s http://127.0.0.1:4173/api/status

# 删除
curl -s -X DELETE http://127.0.0.1:4173/api/tasks/<id>
```

## 5. 数据文件位置与格式

- 默认：`<项目根>/data/tasks.json`（`data/` 目录首次启动自动创建，已加入 `.gitignore`）。
- 可用 `KANBAN_DATA_FILE` 覆盖，例如 `KANBAN_DATA_FILE=/tmp/k.json`。
- 格式：任务对象数组（可读的多行 JSON）。读取时也兼容 `{"tasks":[...]}` 包装形式。
- 写入是**原子**的：先写同目录临时文件 `.tasks.json.tmp-<pid>-<时间>-<随机>`，`fsync` 后 `fs.rename`
  覆盖正式文件；因此不会出现半截数据，目录里也不会残留临时文件。

## 6. 数据文件损坏时的恢复步骤

损坏（文件不是合法 JSON，或 JSON 合法但不是任务数组）时服务的行为：

1. **不静默清空**：原文件先被改名备份为 `<dataFile>.corrupt-<时间戳>`，例如
   `data/tasks.json.corrupt-2026-10-15T13-24-17-954Z`；原始内容一个字节都不改。
2. stderr 打印中文错误（文件名、原因、备份路径、后续处理提示）。
3. 服务以空任务列表继续运行（仍可用），告警经 `GET /api/status` 与页面红色横幅暴露，`GET /api/tasks`
   的响应里也带 `warning`。
4. 告警在本次进程生命周期内保持（不会因为后续写入成功而消失），便于用户注意到问题。

恢复步骤：

```bash
# 1) 停掉服务（Ctrl+C）
# 2) 查看备份文件内容，确认里面还有多少可救的数据
ls -l data/tasks.json.corrupt-*
cat data/tasks.json.corrupt-2026-10-15T13-24-17-954Z

# 3) 修正 JSON（例如补上缺失的引号/逗号）后另存为正式数据文件
cp data/tasks.json.corrupt-2026-10-15T13-24-17-954Z data/tasks.json
#    若手工整理过，可直接把整理结果写入 data/tasks.json

# 4) 重新启动服务
node src/server.js
```

说明：条目级不合法（例如缺 `title`）不会触发整文件备份，而是被跳过（该条不入内存列表），
原文件在下一次写入时才被覆盖——因此排查时请先备份原文件。

## 7. 跑测命令

```bash
# 推荐：Node 内置测试运行器自动发现测试文件（含 test/ 下的交付测试套件与 test/实现者/ 自查用例）
node --test
npm test            # 等价于 node --test

# 只跑自查 smoke 用例
node --test test/实现者/smoke.test.js

# 或用 glob（等价于自动发现）
node --test "test/**/*.test.js"
```

> 注意（Node.js v24 实测）：`node --test test/` 这种**直接传目录**的写法在 v24 会报
> `Cannot find module .../test`（位置参数按文件/glob 解析，不再展开目录）。
> 请使用 `node --test`（自动发现）或显式文件 / glob 形式。

## 8. 模块与目录结构

```
kanban-live/
├── src/
│   ├── core.js          # 领域逻辑：validateTitle/normalizeTags/normalizePriority/createTask/
│   │                    #            updateTask/filterTasks/sortTasks/computeStats
│   ├── store.js         # createStore({dataFile}) -> {list,get,create,update,remove,warning,dataFile}
│   ├── server.js        # createServer({dataFile,port}) -> Promise<{server,port,url,close}>；可直接启动
│   └── public/
│       ├── index.html   # 中文看板页面（无外链资源）
│       ├── app.js       # 原生 JS 交互（用户数据一律 textContent 渲染）
│       └── style.css    # 原生 CSS
├── test/实现者/smoke.test.js   # 实现者自查 smoke 用例
├── data/                # 运行时数据目录（非交付物）
├── package.json         # 仅 scripts，无 dependencies
└── README.md
```

## 9. 零依赖核查方式

```bash
grep -c dependencies package.json      # 期望 0（package.json 里没有 dependencies 字段）
ls node_modules                        # 期望：不存在
grep -rn "http" src/public             # 期望：无 http(s):// 外链资源
grep -rn "innerHTML" src/public        # 期望：无（用户数据一律 textContent 渲染）
```
