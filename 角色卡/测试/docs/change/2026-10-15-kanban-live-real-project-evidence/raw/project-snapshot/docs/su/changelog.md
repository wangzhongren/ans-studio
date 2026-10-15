# su 变更记录 — kanban-live

## 2026-10-15 · 创世：建立项目角色与写权边界（经客户确认）

**背景**：客户要求在空目录中实现「离线中文任务看板」（Node 内置模块、零第三方依赖、
仅监听 127.0.0.1、数据只落本机 JSON、原生 HTML/CSS/JS、`node --test` 自动化测试）。
项目为创世场景，无既有治理边界。

**客户确认**：已确认（`confirmed:true`，操作者 wangzhongren）——创建 2 个项目角色及其边界。

**新建写权（本次写出路径）**：

- `角色卡/实现者/role-card.md`
- `角色卡/实现者/boundary.yaml`
- `角色卡/测试者/role-card.md`
- `角色卡/测试者/boundary.yaml`
- `docs/su/memo.md`
- `docs/su/changelog.md`

**边界摘要**：

| 角色 | 新增写权 |
|---|---|
| 实现者 | `src/`、`package.json`、`.gitignore`、`README.md`、`data/`、`test/实现者/`、`temp/实现者/`、文档面（feature-map/memo/changelog/functional-description/api-spec + docs/{design,feature,change,fix}/） |
| 测试者 | `test/`、`temp/测试者/`、文档面（同上结构）；**无 `src/` 写权**（刻意的职责分离） |

**理由**：写代码与验证代码的写权分离，避免「自写自证」；两角色均含 `temp/<角色 id>/`
草稿区（草稿不参与 pin）与固定文档面。

**后续**：实现者任务已派发；测试者待实现者回交后派发。
