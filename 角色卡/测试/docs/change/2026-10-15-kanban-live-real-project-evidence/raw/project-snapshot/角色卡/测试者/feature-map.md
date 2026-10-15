# 功能 / 用例地图（测试者）

- 角色：测试者（独立验证）
- 项目：kanban-live（离线中文任务看板）
- 版本：v1.1.0（2026-10-15 首版测试套件 → KANBAN-DEF-001 修复后复核通过）
- 交付物：`test/01-core.test.js` … `test/06-static-compliance.test.js`（`node --test` 自动发现）

## 一、13 项覆盖清单 → 用例映射

| # | 覆盖清单（派发/角色卡） | 用例所在文件 | 关键用例 | 结果 |
|---|---|---|---|---|
| 1 | 空白标题**两层拒绝**（接口 `POST`/`PUT`：`""`/纯空格/`\t\n`/缺失/非字符串 → 400 `TITLE_REQUIRED`；界面侧静态断言） | `01-core`、`03-http-api`、`06-static-compliance` | validateTitle；createTask 抛 TITLE_REQUIRED；POST/PUT 空白标题；app.js 提交前拦截 + index.html 约束 | 通过（界面 `required` 见差异 d） |
| 2 | 三状态 `todo/doing/done` 来回切换 | `01-core`、`03-http-api` | updateTask 状态；HTTP todo→doing→done→todo→done | 通过 |
| 3 | 编辑标题/优先级/标签生效且 `updatedAt` 变化 | `01-core`、`03-http-api` | updateTask（id/createdAt 不可变）；PUT 后 updatedAt 变化、落盘一致 | 通过 |
| 4 | 删除成功；再次删除 → 404 `NOT_FOUND` | `02-store`、`03-http-api` | store.remove/get；DELETE {ok:true}、二次 DELETE 404、PUT 不存在 404 | 通过 |
| 5 | 筛选（status/tag/q）与排序（createdAt/priority × asc/desc） | `01-core`、`03-http-api` | filterTasks/sortTasks；GET /api/tasks 全组合 | 通过 |
| 6 | `/api/stats` 各状态计数与按标签计数 | `01-core`、`03-http-api` | computeStats；GET /api/stats | 通过 |
| 7 | 持久化：新 store / 新 server 实例读回 | `02-store`、`03-http-api`、`05-atomic-write` | 新 store 读回；`{"tasks":[]}` 包装兼容 | 通过 |
| 8 | 原子写：并发读写无半截 JSON；`fs.rename` 失败原文件不变；无 `.tmp-` 残留 | `05-atomic-write` | mock renameSync 失败；并发 POST + 持续读取；无临时文件 | 通过 |
| 9 | 损坏文件：告警 + 改名 `tasks.json.corrupt-*` + 内容完整保留 + 不静默清空（含结构非法） | `02-store`、`04-corrupt-recovery` | 非法 JSON；结构非法；多次损坏；HTTP warning 保持 | 通过 |
| 10 | 文本安全：源扫描 textContent/无注入点；接口 `<script>`/`&<>"'` 原样存取 | `06-static-compliance` | app.js 无 innerHTML 等；特殊字符标题存取与落盘 | 通过 |
| 11 | 导出：全部任务 + `Content-Disposition` 附件头 | `03-http-api` | GET /api/export（不受筛选影响） | 通过 |
| 12 | 合规：仅绑 `127.0.0.1`；`package.json` 无 dependencies；无 `node_modules`；HTML 无外链 | `03-http-api`、`06-static-compliance` | address === 127.0.0.1；package/node_modules；src/public 无 http(s) | 通过 |
| 13 | `node --test` 一次跑完自动退出（记录用例数/耗时） | 全部 | `node --test` 57 例 / ≈699ms | 通过（57/57 全绿） |

## 二、冻结契约 → 核对映射

| 契约点 | 用例 | 结果 |
|---|---|---|
| `createStore({dataFile})` / `createServer({dataFile,port})→Promise` 及导出名 | `02-store`「store 导出形态」、`03-http-api` 全部 | 通过 |
| 数据文件默认 `data/tasks.json`、`KANBAN_DATA_FILE` 覆盖 | `03-http-api`（显式 dataFile）、`02-store` | 通过（测试用显式路径隔离） |
| 端口默认 4173、`PORT` 覆盖、**只绑 127.0.0.1** | `03-http-api`「只监听 127.0.0.1」 | 通过 |
| 任务模型字段与默认值 | `01-core`、`02-store`、`03-http-api` | 通过 |
| `GET /api/tasks` 查询/响应 `{tasks,warning}` | `03-http-api`「筛选与排序」 | 通过 |
| `POST` 201、空白 → 400 `TITLE_REQUIRED` | `03-http-api`「POST 空白标题」 | 通过 |
| `PUT` 200、不存在 → 404 `NOT_FOUND` | `03-http-api`「编辑」「DELETE/404」 | 通过 |
| `DELETE` → `{ok:true}`；不存在 404 | `03-http-api`「DELETE」 | 通过 |
| `GET /api/stats` `{total,byStatus,byTag}` | `03-http-api`「GET /api/stats」 | 通过 |
| `GET /api/export` + 附件头 | `03-http-api`「GET /api/export」 | 通过 |
| `GET /api/status` `{ok,dataFile,warning}` | `03-http-api`「只监听 127.0.0.1；/api/status」 | 通过 |
| 请求体 >1MB → 413 `PAYLOAD_TOO_LARGE` | `03-http-api`「[README §4] 超大请求体…」 | **通过（KANBAN-DEF-001 已修复复核）** |

## 三、缺口说明

- 无功能缺口：13 项清单全部有用例覆盖，且**全部通过**（原唯一失败项 KANBAN-DEF-001 已修复复核）。
- 未纳入验收的**非冻结扩展**（源码提供、冻结契约未列，故不作为验收项）：`PATCH /api/tasks/:id`、
  `GET /api/tasks/:id`、`GET /favicon.ico`（后者已在静态资源用例中顺带断言 204）。
