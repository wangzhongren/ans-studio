# 工作备忘录（测试者）

- 角色：测试者（独立验证）｜项目：kanban-live ｜更新：2026-10-15

## 进行中 / 待确认

| # | 事项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 缺陷 `KANBAN-DEF-001`：超大请求体不返回 413（客户端 `ECONNRESET`） | **已复核通过（关闭）** | 实现者已修（超限先写回 413 再 drain）；复跑 `node --test` 57/57 + `temp/测试者/probe-413-v2.cjs` 两种客户端均观测 413 |
| 2 | 派发口径「`index.html` 有 `required`」 vs 实现（无 required，靠 app.js 提交前拦截） | **待客户裁定** | 非冻结项；不阻塞；已记录于 `api-spec.md` 2.2 |
| 3 | `POST` 201 返回 `{task, warning}`（契约写 `{task}`） | **待客户裁定** | 向后兼容的附加字段；不阻塞 |
| 4 | `PAYLOAD_TOO_LARGE`/`INVALID_*` 等额外错误码口径 | **待客户裁定** | 除 413 外均实测与声明一致；413 现已一致 |

## 环境事实（已实测，避免重复踩坑）

- Node 版本：**v24.14.0**。
- `node --test test/` 在 v24 报 `MODULE_NOT_FOUND`；用 `node --test` 自动发现或显式文件路径。
- 默认排序为 `createdAt + desc`（`GET /api/tasks` 无参数时最新在前）——写断言时注意。
- `store.update`/`create` 是**先改内存再落盘**：`persist()` 抛错时内存与磁盘会短暂不一致
  （`temp/测试者/2026-10-15_413缺陷.md` 之外的一个观察，未判缺陷：契约只要求“原文件不变 + 无残留临时文件”，已满足）。
- 服务端损坏日志走 stderr，会在测试输出中夹杂中文错误行，属**预期噪声**，不影响判定。

## 第二轮：修复后复核（2026-10-15，已完成）

1. `node --test` 复跑全套 → **57/57 通过**（≈699ms，两次一致，进程自然退出）。
   - 说明：由 56 变 57，因实现者在 `test/实现者/smoke.test.js` 新增 1 例 413 回归用例（其套件 11→12）。
2. `node temp/测试者/probe-413-v2.cjs` → `fetch` 与 `node:http` **两种客户端均** `status=413` + `code=PAYLOAD_TOO_LARGE`，零副作用、无 `.tmp-` 残留。
3. `node temp/测试者/probe-regression-v2.cjs` → 回归 9/9（含 1MiB 边界：恰 1MiB 受理 / 1MiB+1 拒绝）。
4. 待裁定口径从 1 项缺陷降为 0 项；其余仍为非冻结项待裁定（见 `api-spec.md` §2.2、§3）。

## 下一步（若有第三轮）

- 若实现者再次改动：重算 `src/*.js`、`src/public/*` 的 sha256（`node temp/测试者/pin-hashes.cjs`），
  与 `changelog.md` v1.1.0 记录比对；不一致则本轮结论失效，需重跑全套并更新报告。
- 待客户裁定项（`required` 属性、附加 `warning` 字段、额外错误码、标签截断/逗号字符串）按需落地。
