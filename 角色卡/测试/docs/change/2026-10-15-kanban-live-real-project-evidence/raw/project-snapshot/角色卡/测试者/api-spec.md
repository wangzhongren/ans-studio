# 契约核对结论（api-spec · 测试者）

- 角色：测试者（独立验证）｜**只读核对，不修改契约**
- 日期：2026-10-15
- 核对对象：`README.md`（权威）、`角色卡/实现者/api-spec.md`（同批契约文档）、
  `src/core.js` / `src/store.js` / `src/server.js` 的导出契约
- 方法：黑盒（HTTP/模块 API）为主 + 源扫描为辅，不依赖实现者自我判断

---

## 1. 冻结契约：一致项（全部通过）

| 冻结项 | 核对结果 |
|---|---|
| 数据文件默认 `data/tasks.json`，`KANBAN_DATA_FILE` 覆盖 | 一致（显式路径可覆盖，`dataFile` 为绝对路径） |
| 端口默认 `4173`，`PORT` 覆盖，**只绑 `127.0.0.1`** | 一致（`server.address().address === '127.0.0.1'`；`port:0` 返回真实端口） |
| 模型 `{id,title,status,priority,tags[],createdAt,updatedAt}` | 一致（含默认 `todo`/`medium`、UUID、ISO8601） |
| `GET /api/tasks?status=&tag=&q=&sort=&order=` → `{tasks,warning}` | 一致（默认 `sort=createdAt`、`order=desc`；`all`/空值不筛选；`q` 大小写不敏感、命中标题或标签） |
| `POST /api/tasks` → 201；空白标题 → 400 `TITLE_REQUIRED` | 一致 |
| `PUT /api/tasks/:id`（title/priority/tags/status 任一）→ 200；不存在 → 404 `NOT_FOUND` | 一致；且同一请求含非法 title 时整体拒绝、不部分生效（原子拒绝） |
| `DELETE /api/tasks/:id` → `{ok:true}`；不存在 → 404 | 一致 |
| `GET /api/stats` → `{total,byStatus:{todo,doing,done},byTag}` | 一致（无任务时三键仍为 0；`byTag` 仅含有出现过的标签） |
| `GET /api/export` → `{exportedAt,count,tasks}` + `Content-Disposition: attachment; filename="kanban-export-<YYYYMMDD>.json"` | 一致（且不受筛选参数影响） |
| `GET /api/status` → `{ok,dataFile,warning}` | 一致 |
| 导出名冻结（core/store/server 8+1+1 项、`createStore`/`createServer`） | 一致（名称与签名齐备；`require('...')({...})` 兼容写法也可用） |
| 损坏恢复：改名 `<dataFile>.corrupt-*`、内容逐字节保留、stderr 中文错误、不静默清空 | 一致（含“JSON 合法但结构非法”与“多次损坏追加序号”） |
| 文本安全：用户数据只用 `textContent`、无注入点；接口原样存取特殊字符 | 一致 |
| 零依赖：`package.json` 无 `dependencies`、无 `node_modules`、`src/public` 无外链 | 一致 |

---

## 2. 差异项

### 2.1 【已复核通过】`PAYLOAD_TOO_LARGE` 413 送达客户端（KANBAN-DEF-001 已修复）

- 契约出处：README §4「请求体超过 1MB 返回 `413 PAYLOAD_TOO_LARGE`」；`api-spec.md` §3 同。
- 首轮实测（缺陷）：`fetch` 与 `node:http` 原始客户端**都收不到任何 HTTP 响应**，得到 `ECONNRESET`（socket hang up）。
- 根因（已定位）：`src/server.js::readBody` 超限时先 `req.destroy()` 再在 catch 中写 413，socket 已关闭。
- **修复后复跑（2026-10-15，`src/server.js` sha256=`bff1e3c4…d8ed39`，mtime=13:39:14Z）**：
  - `fetch`（undici）：`status=413`，body=`{"error":{"code":"PAYLOAD_TOO_LARGE","message":"请求体过大，最大允许 1MB"}}` ✅
  - `node:http` 原始客户端：`status=413`，同一 body ✅
  - 零副作用：超限请求体不落库（`tasks=0`）；数据目录无 `.tmp-` 残留、数据文件未被创建 ✅
  - 修复方式：超限后**不再 `req.destroy()`**，改为先置位并让调用方写回 413，同时继续 drain 剩余字节（上限 8 MiB 兜底），连接自然收尾。
- 结论：**实现与文档一致，已复核通过**；对应用例 `test/03-http-api.test.js`「[README §4] 超大请求体应返回 413…」**已转绿**。
- 证据：`temp/测试者/probe-413-v2.cjs`（两种客户端一次性复核）、`temp/测试者/2026-10-15_413复核.md`、
  `角色卡/测试者/docs/fix/KANBAN-DEF-001.md`。

### 2.1b 【已复核通过】1MB 上限语义边界

- 恰好 `1024*1024` 字节的合法 JSON 请求体 → `201`（正常受理）。✅
- `1024*1024 + 1` 字节 → `413 PAYLOAD_TOO_LARGE`。✅
- 结论：`> 1MB` 判定边界与 README §4 一致（`over > 1MiB`，恰 1MiB 不拒）。

### 2.2 【差异 · 非冻结项，不判缺陷】界面 `required` 属性

- 派发口径提到「`index.html` 有 `required`」。
- 实测：`#create-title` / `#edit-title` **没有** HTML `required` 属性（仅 `maxlength="200"`）。
- 但冻结契约（README §3）只要求“标题为空或全为空白时界面立即提示且**不会发出请求**”，
  该行为由 `src/public/app.js::submitCreate/submitEdit` 的提交前校验完整实现（已断言：空白校验早于 `fetch`，且 `preventDefault`）。
- 结论：**不判为缺陷**，列为“派发口径 vs 实现细节”的待裁定项（可选增强）。

---

## 3. 待客户裁定的口径：实测结果 vs 冻结契约

| 待裁定口径（实现者声明） | 实测结果 | 与冻结契约的关系 |
|---|---|---|
| `/api/status` 的 `ok` 恒 `true`，异常只走 `warning` | **一致**：正常与损坏场景 `ok` 均为 `true`，异常经 `warning` 暴露 | 冻结契约未定义 `ok` 语义；README §4 补充说明已采纳此口径 → 文档与实现一致 |
| 额外错误码 `TITLE_TOO_LONG`(400) / `INVALID_STATUS`(400) / `INVALID_TASK`(400) / `METHOD_NOT_ALLOWED`(405) | **一致**：均按声明返回（已测 400/405 分支） | 不改变既有码语义，向后兼容；超 200 字确为 `TITLE_TOO_LONG` |
| `PAYLOAD_TOO_LARGE`(413) | **一致（已复核通过）**：修复后 `fetch` 与 `node:http` 均观测到 `status=413` + `code=PAYLOAD_TOO_LARGE`（见 2.1） | 与 README §4 一致 ✅ |
| 标签 >30 字符**截断** | **一致**：`'字'.repeat(31)` → 30 字符（=`30` 保留） | 冻结契约只说“单个 ≤30 字符”，未规定截断/拒绝 → 截断为实现口径，可接受 |
| `tags` 兼容逗号分隔字符串 | **一致**：兼容英文与中文逗号、trim、去重 | 冻结契约模型写 `tags[]`；字符串兼容为超集，不冲突 |
| `store.get` 返回 `null`；`update`/`remove` 抛 `NOT_FOUND` | **一致**：`get('不存在')===null`；`update/remove` 抛 `err.code==='NOT_FOUND'` | 与 `api-spec.md` §4 一致 |
| `POST /api/tasks` 201 返回 `{task, warning}` | **一致**：含 `warning` 字段 | 冻结契约写 `{task}`；多出 `warning` 为向后兼容的附加字段，不破坏 `{task}` |

---

## 4. 核对结论（2026-10-15 修复后复核）

- **冻结契约**：全部实测一致，**无差异**（原 2.1 的 413 缺陷已修复并复核通过；1MB 边界语义亦一致）。
- **是否满足契约**：**满足**。
- 唯一保留的“差异”为非冻结项的待裁定口径（2.2 界面 `required`；§3 表内附加字段/额外错误码/标签截断/逗号字符串/`ok` 恒 true 等），
  均与冻结契约不冲突，**不构成缺陷**。
- 复跑数据：`node --test` = tests 57 / pass 57 / fail 0 / duration_ms ≈ 699（两次一致），进程自然退出。
- 本轮**无新增缺陷**、无返工项。
