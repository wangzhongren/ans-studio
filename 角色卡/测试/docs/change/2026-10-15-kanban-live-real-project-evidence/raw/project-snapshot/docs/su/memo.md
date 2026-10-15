# su 工作备忘录 — kanban-live

> 内置治理角色的工作文档（进行中事项 / 待确认项）。有进展或新挂起即更新，不等客户问。

## 项目状态

- 项目：kanban-live —— 离线中文任务看板（Node 内置模块、零依赖、127.0.0.1、本机 JSON）
- 治理状态：**创世（bootstrap）**。项目原为空目录（仅 `.ans/`、`.git/`、`docs/audit/`），
  无 `角色卡/`、无 pin 过的治理边界文档 → 创世种子边界生效（`角色卡/`、`docs/`、`.ans/`）。
- 2026-10-15：客户确认创建 2 个项目角色（实现者 / 测试者）及写权边界。

## 已建立角色

| 角色 id | 类型 | 边界文件 | 关键写权 |
|---|---|---|---|
| 实现者 | 项目角色（开发） | `角色卡/实现者/boundary.yaml` | `src/`、`README.md`、`package.json`、`.gitignore`、`data/`、`test/实现者/`、`temp/实现者/` + 文档面 |
| 测试者 | 项目角色（独立验证） | `角色卡/测试者/boundary.yaml` | `test/`、`temp/测试者/` + 文档面；**无 `src/` 写权** |

## 进行中

- [ ] 派发实现者：按冻结契约产出 `src/` + `README.md` + 文档（任务已发出，等待回交）。
- [ ] 实现者回交后派发测试者：按契约编写 `test/` 套件、跑 `node --test test/` 并回交结果。
- [ ] 汇总跑测结论 + 启动方式 + 用法，交客户独立验收。

## 待确认项

- 暂无。若实现者回交时发现契约需变更（接口/字段/错误码），须由 su 呈客户确认后方可改契约，
  不允许实现者单方面改 `api-spec.md` 的既有约定。

## 冻结契约要点（摘要，详见任务文本与 `角色卡/实现者/api-spec.md`）

- 任务模型：`{id, title, status: todo|doing|done, priority: low|medium|high, tags[], createdAt, updatedAt}`
- 接口：`GET /api/tasks`（含 status/tag/q/sort/order 查询）、`POST /api/tasks`、
  `PUT /api/tasks/:id`、`DELETE /api/tasks/:id`、`GET /api/stats`、`GET /api/export`、`GET /api/status`
- 错误统一 `{error:{code,message}}`；空白标题 → 400 `TITLE_REQUIRED`
- 数据文件默认 `data/tasks.json`（`KANBAN_DATA_FILE` 覆盖）；端口默认 4173（`PORT` 覆盖）；只绑 127.0.0.1
- 模块导出（测试依赖，不得改名）：`src/core.js`、`src/store.js`、`src/server.js`
