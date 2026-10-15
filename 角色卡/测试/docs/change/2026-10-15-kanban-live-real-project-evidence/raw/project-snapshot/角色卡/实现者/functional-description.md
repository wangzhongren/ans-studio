# 功能与流程说明（functional-description）

项目：kanban-live（离线中文任务看板） ｜ 角色：实现者 ｜ 版本：v1.0.0（2026-10-15）

## 1. 这是什么

一个**完全离线**的中文任务看板：一台机器上一条 `node src/server.js` 就能用，浏览器打开本机地址即可
新增/编辑/删除任务、切换状态、筛选排序、看统计、导出 JSON。数据存本机 JSON 文件，断网可用，零第三方依赖。

## 2. 运行形态

```
浏览器（原生 HTML/CSS/JS）
        │ 同源 fetch（/api/*）
        ▼
src/server.js  ──> src/store.js ──> data/tasks.json（原子写：临时文件 + rename）
                     │
                     └──> src/core.js（纯逻辑：校验/规整/筛选/排序/统计）
```

- 服务进程只监听 `127.0.0.1`，不对外网卡开放。
- 无数据库、无外部服务、无 CDN；页面不请求任何站外资源，完全离线渲染。

## 3. 主流程

### 3.1 新增任务

1. 界面：填标题 → 点「添加任务」。
2. 界面层校验：`title.trim()` 为空 → 显示「任务标题不能为空，请填写后再添加。」，**不发请求**；超过 200 字同样拦下。
3. 请求：`POST /api/tasks`，body `{title, priority, tags}`（标签输入框的逗号分隔字符串由服务端规整）。
4. 接口层校验：`core.validateTitle` 失败 → `400 TITLE_REQUIRED`（或 `TITLE_TOO_LONG`）。
5. 规整与落盘：`core.createTask`（生成 `id`/`createdAt`/`updatedAt`，`priority` 回落 `medium`，`tags` 去重限量）
   → `store.persist()` 原子写文件。
6. 界面重新拉取列表与统计并刷新看板。

### 3.2 状态流转

- 状态集合 `todo(待办) / doing(进行中) / done(已完成)`，无限制流转（可任意来回切换）。
- 界面：任务卡上的下拉框选择目标状态 → `PUT /api/tasks/:id {status}` → 成功后重新拉取列表；
  失败则回退下拉框并提示中文原因。
- 服务端：非法状态返回 `400 INVALID_STATUS`，不落盘。

### 3.3 编辑任务

- 「编辑」打开弹窗（预填当前标题/优先级/标签），保存时同样做界面层空白校验 → `PUT /api/tasks/:id`。
- 只允许改 `title / priority / tags`（接口也支持 `status`）；`id`、`createdAt` 不可变，`updatedAt` 自动刷新。

### 3.4 删除任务

- 「删除」→ 浏览器二次确认弹窗（含任务标题）→ 确认后 `DELETE /api/tasks/:id` → 刷新。
- 取消则什么都不做（零副作用）。

### 3.5 筛选、排序、统计

- 筛选参数在客户端组装为查询串：`status`、`tag`、`q`、`sort`、`order`；关键字输入 200ms 防抖。
- 排序：`createdAt`（创建时间）或 `priority`（优先级），正序/倒序；服务端排序稳定（同键按创建时间、再按 id）。
- 统计区显示：全部任务数、各状态任务数、按标签任务数（标签来自 `/api/stats`，同时用于标签下拉选项）。

### 3.6 导出

- 右上角「导出 JSON」→ 浏览器下载 `/api/export`，服务端带 `Content-Disposition: attachment;
  filename="kanban-export-<YYYYMMDD>.json"`，内容为**全部**任务（不受当前筛选影响）。

## 4. 数据持久化与可靠性

| 关注点 | 做法 |
|---|---|
| 落盘位置 | 默认 `data/tasks.json`，`KANBAN_DATA_FILE` 可覆盖；首次启动自动建目录 |
| 原子写 | 同目录写临时文件 → `fsync` → `close` → `fs.rename` 覆盖；中途失败清理临时文件，正式文件保持旧内容 |
| 进程内一致 | 内存任务列表 + 每次写操作同步落盘（写失败抛错，内存改动不会「假装成功」地返回给客户端？→ 见下） |
| 刷新/重启不丢 | 每次启动从文件加载；`GET /api/tasks` 读的是内存镜像（由文件加载而来） |
| 并发 | 单进程 Node 事件循环内串行处理写请求；`fs.rename` 为原子替换，不会读到半截 JSON |

说明：`store.create/update/remove` 均为「先改内存 → 再 `persist()`」；若 `persist()` 抛错，异常会冒泡到
HTTP 层变为 `500 INTERNAL_ERROR`，客户端明确看到失败（而不是静默成功）。已知取舍：该情况下内存镜像与
文件可能短暂不一致，需重启服务以文件为准；单机离线看板的写入失败（磁盘满/权限）属罕见路径，v1 不做回滚。

## 5. 损坏数据的处理流程（重点）

```
启动 / 打开 store
   ├─ 文件不存在        → 空列表（正常）
   ├─ 文件内容为空串     → 空列表（正常）
   ├─ JSON 解析失败      → 备份 + 告警 + 空列表
   ├─ JSON 合法但结构非法（不是数组、也不含 tasks 数组）→ 备份 + 告警 + 空列表
   └─ JSON 合法且是数组  → 逐条修补：条目非法（标题不合法）则跳过该条，其余保留
```

- 备份命名：`<dataFile>.corrupt-<ISO 时间戳，冒号点号替换为 ->`，例如
  `data/tasks.json.corrupt-2026-10-15T13-24-17-954Z`；同名冲突时追加 `-1`、`-2`。
- **绝不静默清空**：原文件被 `rename` 保留（内容一字节不改），继续运行的是空列表。
- stderr 打印中文错误：文件名、原因、备份路径、后续处理提示。
- 告警暴露路径：`GET /api/status` 的 `warning`、`GET /api/tasks` 与 `POST /api/tasks` 的 `warning`、
  页面顶部红色横幅（`index.html#warning-banner`）。告警在本次进程内**保持**，不会因后续写入而消失。
- 恢复：见 `README.md` 第 6 节（查看备份 → 修正 JSON → 覆盖回 `tasks.json` → 重启）。

## 6. 文本安全

- 前端渲染用户数据（标题、标签）一律 `element.textContent = value`，从不拼接 HTML 字符串、
  不使用 HTML 注入类 API；`window.confirm` 的提示文本亦为普通字符串。
- 因此 `<script>alert(1)</script>`、`<b>x</b>`、`&amp;` 等会**原样显示**为文本，不会被执行或解析。
- 自查用例与 smoke 测试都覆盖了含 `<script>` 的标题（接口原样存储、页面文本渲染）。

## 7. 错误提示（中文）示例

| 场景 | 用户看到 |
|---|---|
| 新增空白标题（界面层） | 任务标题不能为空，请填写后再添加。 |
| 新增空白标题（绕过界面直连接口） | `{"error":{"code":"TITLE_REQUIRED","message":"任务标题必填，不能为空或全为空白字符"}}` |
| 打开不存在任务 | 任务不存在 |
| 请求体非法 JSON | 请求体不是合法的 JSON：… |
| 数据文件损坏 | 页面红色横幅：`【数据告警】数据文件已损坏或格式非法（…），已把原文件备份为 tasks.json.corrupt-…，当前以空任务列表继续运行，未丢失原始数据。` |
| 端口被占用 | 启动失败：端口 4173 已被占用，请换一个端口（PORT=<其它端口> node src/server.js） |

## 8. 目录与文件职责

| 路径 | 职责 |
|---|---|
| `src/core.js` | 纯领域逻辑，无 IO；被 `store`/`server`/测试复用 |
| `src/store.js` | 单文件 JSON 存储，加载/修补/备份/原子持久化 |
| `src/server.js` | HTTP 路由、静态页、错误映射、启动与优雅退出 |
| `src/public/index.html` | 中文看板页面骨架（无外链资源） |
| `src/public/app.js` | 交互与渲染（`textContent` only） |
| `src/public/style.css` | 原生样式（三列看板、告警横幅、弹窗） |
| `test/实现者/smoke.test.js` | 自查 smoke 用例（11 条，全部通过） |
| `data/tasks.json` | 运行时数据（非交付物，已被 `.gitignore` 忽略） |
