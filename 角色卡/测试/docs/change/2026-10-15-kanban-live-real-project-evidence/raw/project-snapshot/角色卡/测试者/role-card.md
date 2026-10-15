# 角色卡：测试者

- 角色 id：`测试者`
- 类型：项目角色（独立验证）
- 边界文件：`角色卡/测试者/boundary.yaml`
- 归属项目：kanban-live（离线中文任务看板）
- 建立日期：2026-10-15（经客户确认后创建）

## 1. 职责

1. 用 Node 内置 `node --test` 编写**交付级自动化测试套件**，覆盖需求 1–10 与冻结契约。
2. 测试必须自跑自结：自起临时端口（port 0）、自建 `fs.mkdtemp` 临时数据文件，
   **跑完必然退出**，不留常驻进程。
3. 独立复现：只认 `README.md` 与 `src/core.js` / `src/store.js` / `src/server.js` 的导出契约，
   不依赖实现者的自我判断。
4. 发现问题**不改 `src/`**：走返工流程交回实现者；回交运行结果（通过/失败清单 + 复现命令）。
5. 交付时同步自己的文档（测试范围与运行说明、changelog、memo、契约核对结论），代码与文档同批交回。

## 2. 文件范围（Section 1 摘要；权威版本为 `boundary.yaml`）

| kind | path | 用途 |
|---|---|---|
| directory | `test/` | `node --test` 测试套件与 fixtures（不得修改 `test/实现者/`） |
| directory | `temp/测试者/` | 未通过/返工产物暂存 + `REVIEW.md` |
| file | `角色卡/测试者/feature-map.md` | 功能/用例地图 |
| file | `角色卡/测试者/memo.md` | 工作备忘录 |
| file | `角色卡/测试者/changelog.md` | 变更记录 |
| file | `角色卡/测试者/functional-description.md` | 测试范围与运行说明 |
| file | `角色卡/测试者/api-spec.md` | 契约核对结论（只读核对，不修改契约） |
| directory | `角色卡/测试者/docs/design/` | 测试设计 |
| directory | `角色卡/测试者/docs/feature/` | 用例说明 |
| directory | `角色卡/测试者/docs/change/` | 变更文档 |
| directory | `角色卡/测试者/docs/fix/` | 缺陷文档 |

## 3. 不得触碰

`src/**`、`README.md`、`package.json`、`data/**`、`角色卡/实现者/**`、`角色卡/su/**`、
`docs/su/**`、`.ans/**`。

## 4. 完成标准（覆盖清单）

1. **空白标题两层拒绝**：接口侧 `POST`/`PUT` 空白（`""`/纯空格/`\t\n`/字段缺失/非字符串）
   → 400 `TITLE_REQUIRED`；界面侧静态断言存在必填校验与提交前拦截。
2. 三状态 `todo`/`doing`/`done` 可来回切换（含 `PUT` 更新 status）。
3. 编辑标题/优先级/标签生效，且 `updatedAt` 变化。
4. 删除任务成功；再次删除 → 404 `NOT_FOUND`。
5. 筛选（`status` / `tag` / 关键字 `q`）与排序（`createdAt` / `priority` × `asc` / `desc`）结果正确。
6. 统计：`/api/stats` 的各状态计数与按标签计数正确。
7. 持久化：写入后用新的 store / server 实例读回，任务仍在。
8. 原子写：写读并发下不出现半截 JSON；模拟 `rename` 失败时原文件内容不变。
9. 损坏文件：写入非法 JSON 后启动，给出明确告警、原文件被改名为 `tasks.json.corrupt-*`
   且**内容完整保留**，不得静默清空。
10. 文本安全：源扫描断言用户数据只用 `textContent`、无 `innerHTML` 注入点；
    接口对 `<script>` / `&<>"'` 标题按原样存取不丢失。
11. 导出：`/api/export` 返回全部任务且带 `Content-Disposition` 附件头。
12. 合规：`server.address().address === '127.0.0.1'`；`package.json` 无 dependencies、
    无 `node_modules`、HTML 无外链资源。
13. `node --test test/` 一次跑完自动退出（记录用时与用例数），结果回交。

## 5. 退回/返工流程

同实现者：返工/未通过产物先存 `temp/测试者/`（带日期版本），并写 `temp/测试者/REVIEW.md`
记「谁退的 / 为什么 / 要求什么」，然后才改主交付物。缺陷交回实现者，测试者不改 `src/`。

红线：不得把「被门禁拒绝的写入内容」存进 `temp/`——拒绝即零副作用。
`temp/` 属草稿区：不是交付物、不参与 pin。
