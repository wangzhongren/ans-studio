# 工作备忘录（memo）

角色：实现者 ｜ 项目：kanban-live ｜ 更新：2026-10-15

## 一、进行中 / 已完成

- [x] v1.0.0 首版完整实现（代码 + README + 角色文档同批交回）——2026-10-15
- [x] 自查留证：真实启动服务 + `curl` 打通关键链路（见下第 3 节）
- [x] 自查 smoke 用例 11/11 通过
- [ ] 待 su 派发交付测试后配合测试者（如契约口径需调整，走 su 呈客户确认，不单方面改）

## 二、待确认项（需 su / 客户拍板）

1. **`/api/status` 的 `ok` 语义**：契约只写 `{ok, dataFile, warning}`。本实现定为
   「服务可用 → 恒 `true`」，数据异常只经 `warning` 表达。若客户希望「数据异常时 `ok=false`」，
   一行改动即可（`ok: store.warning ? false : true`），请确认。
2. **超长标题与非法状态的处理码**：契约只定义了 `TITLE_REQUIRED`。本实现额外给出
   `TITLE_TOO_LONG`(400)、`INVALID_STATUS`(400)。若测试预期这两类也走别的码/别的状态，请提前告知。
3. **标签超长（>30 字）**：契约写「单个 ≤30 字符」。本实现选择**截断到 30**（不报错、不丢弃），
   因契约未给标签相关错误码。若客户希望「丢弃该标签」或「整单拒绝」，请确认。
4. **`tags` 传字符串**：前端传逗号分隔字符串，`core.normalizeTags` 兼容数组与字符串；
   接口契约写的是数组，本实现放宽为兼容两者（不会拒绝数组入参）。
5. **`store.get/update/remove` 不存在时的返回**：实现为 `get → null`、`update/remove → 抛
   `NOT_FOUND` 异常`；若测试者预期 `update/remove` 返回 `null/false` 而不抛错，需要统一口径。
6. **跑测命令差异（重要）**：Node v24 下 `node --test test/` 会报
   `Cannot find module .../test`（位置参数按文件/glob 解析，不再展开目录）。
   本实现 README 与 `package.json` 采用 `node --test`（自动发现，含 `test/` 下全部用例）。
   请测试者与 su 知悉，避免把「命令形式」误判为实现问题。

## 三、自查留证（2026-10-15，Node v24.14.0，macOS）

### 3.1 自动化自查用例（`node --test`）

```
$ node --test
✔ core.validateTitle：空白拒绝、正常通过
✔ core.normalizeTags：trim、去空、去重、限长限量
✔ core.normalizePriority：非法回落 medium
✔ core.createTask / updateTask
✔ core.filterTasks / sortTasks / computeStats
✔ store：增删改查 + 持久化 + 原子写
✔ store：数据文件损坏 -> 备份 + 告警，不静默清空
✔ store：结构损坏（JSON 合法但不是任务数组）同样备份
✔ HTTP：完整链路 新增 -> 改状态 -> 筛选/排序 -> 统计 -> 导出 -> 删除
✔ HTTP：损坏数据文件经 /api/status 与 /api/tasks 暴露告警
✔ 前端资源：无外链、无 HTML 字符串注入用户数据
ℹ tests 11  ℹ pass 11  ℹ fail 0
```

`npm test`（= `node --test`）同样 11/11 通过。

### 3.2 真实进程 + curl 链路（脚本：`temp/实现者/selfcheck.js`，数据文件 `temp/实现者/run-data/tasks.json`）

```
$ PORT=4188 KANBAN_DATA_FILE=temp/实现者/run-data/tasks.json node src/server.js
离线中文任务看板已启动
访问地址：http://127.0.0.1:4188
数据文件：/…/temp/实现者/run-data/tasks.json
按 Ctrl+C 退出。

$ lsof -nP -iTCP:4188 -sTCP:LISTEN
node 66120 … TCP 127.0.0.1:4188 (LISTEN)          # 只有 127.0.0.1，无 0.0.0.0

$ curl -s -o /dev/null -w '%{http_code} %{content_type}' http://127.0.0.1:4188/
200 text/html; charset=utf-8

$ curl -s -X POST http://127.0.0.1:4188/api/tasks -H 'Content-Type: application/json' -d '{"title":"   "}'
{"error":{"code":"TITLE_REQUIRED","message":"任务标题必填，不能为空或全为空白字符"}}
HTTP 400

$ curl -s -X POST http://127.0.0.1:4188/api/tasks -H 'Content-Type: application/json' \
    -d '{"title":"<script>alert(1)</script> 修复登录页","priority":"high","tags":["前端","紧急","前端"]}'
{"task":{"id":"02860e76-…","title":"<script>alert(1)</script> 修复登录页","status":"todo",
         "priority":"high","tags":["前端","紧急"],…},"warning":null}      # 重复标签已去重，脚本原样存储

$ curl -s -X POST http://127.0.0.1:4188/api/tasks -H 'Content-Type: application/json' -d '{"title":"写 README","tags":["文档"]}'
{"id":"089b2334-…","title":"写 README","status":"todo","priority":"medium","tags":["文档"],…}   # 默认 medium

$ curl -s -X PUT http://127.0.0.1:4188/api/tasks/02860e76-… -H 'Content-Type: application/json' -d '{"status":"doing"}'
{"task":{…,"status":"doing",…}}                    # updatedAt 已刷新

$ curl -s 'http://127.0.0.1:4188/api/tasks?status=doing&tag=%E5%89%8D%E7%AB%AF&q=script&sort=priority&order=desc'
{"tasks":[{…"status":"doing",…}],"warning":null}   # 筛选命中 1 条

$ curl -s 'http://127.0.0.1:4188/api/tasks?sort=createdAt&order=asc'
{"tasks":[{"title":"<script>alert(1)</script> 修复登录页",…},{"title":"写 README",…}]}   # 按时间正序

$ curl -s http://127.0.0.1:4188/api/stats
{"total":2,"byStatus":{"todo":1,"doing":1,"done":0},"byTag":{"前端":1,"紧急":1,"文档":1}}

$ curl -s -D - -o /dev/null http://127.0.0.1:4188/api/export
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="kanban-export-20261015.json"

$ curl -s http://127.0.0.1:4188/api/export
{"exportedAt":"2026-10-15T13:25:09.596Z","count":2,"tasks":[…全部 2 条…]}

$ curl -s http://127.0.0.1:4188/api/status
{"ok":true,"dataFile":"/…/temp/实现者/run-data/tasks.json","warning":null}

$ curl -s http://127.0.0.1:4188/api/unknown
{"error":{"code":"NOT_FOUND","message":"接口或页面不存在"}}   HTTP 404

$ curl -s -X POST http://127.0.0.1:4188/api/tasks -H 'Content-Type: application/json' -d '{坏 json'
{"error":{"code":"BAD_JSON","message":"请求体不是合法的 JSON：Expected property name…"}}   HTTP 400

$ curl -s -X DELETE http://127.0.0.1:4188/api/tasks/089b2334-…
{"ok":true}   HTTP 200

$ curl -s http://127.0.0.1:4188/api/tasks
{"tasks":[{…只剩 1 条…}],"warning":null}

$ cat temp/实现者/run-data/tasks.json
[ { "id": "02860e76-…", "title": "<script>alert(1)</script> 修复登录页", "status": "doing", … } ]

$ ls temp/实现者/run-data
tasks.json                       # 无 .tmp- 残留（原子写）

# 发送 SIGINT（等价 Ctrl+C）后：
{"code":0,"signal":null}         # 正常退出，无信号残留、无常驻进程
```

### 3.3 默认启动核查（脚本：`temp/实现者/default-start-check.js`，不设任何环境变量）

```
离线中文任务看板已启动
访问地址：http://127.0.0.1:4173
数据文件：/…/kanban-live/data/tasks.json
按 Ctrl+C 退出。
$ lsof -nP -iTCP:4173 -sTCP:LISTEN → node … TCP 127.0.0.1:4173 (LISTEN)
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/ → 200
```

### 3.4 损坏恢复演练（在自查用例中断言，另见 3.2 之外的独立用例）

```
写入 "{ 这不是 JSON " 到 tasks.json → 启动 store/server 后：
  • 生成 tasks.json.corrupt-2026-10-15T13-24-17-954Z，内容与原文逐字节相同
  • stderr: [kanban-live] 错误：数据文件无法解析：… / 已将原文件备份为：… / 已以空任务列表继续运行…
  • GET /api/status → warning.code = DATA_FILE_CORRUPT，backupPath 指向备份文件
  • GET /api/tasks  → tasks: []，warning 非空（未静默清空）
  • 继续写入新任务后，tasks.json 重新可用（新数据未覆盖备份）
```

### 3.5 零依赖核查

```
$ node --version                → v24.14.0
$ ls -a                         → 无 node_modules；存在 .gitignore / package.json / src / test / data / temp / 角色卡 / docs
$ grep -n "dependencies" package.json → 无匹配（package.json 不含 dependencies 字段）
$ node --test（前端资源用例）     → src/public/* 无 http(s):// 外链；app.js 无 HTML 字符串注入
```

## 四、下次注意

- 交付测试若放在 `test/`（非 `test/实现者/`），跑测请用 `node --test`（见待确认项 6）。
- `data/` 已被 `.gitignore` 忽略；自查产生的 `temp/实现者/run-data/` 属草稿，不入交付。
