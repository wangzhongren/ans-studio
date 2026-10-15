# 测试范围与运行说明（测试者）

- 角色：测试者（独立验证）｜项目：kanban-live ｜版本：v1.1.0（2026-10-15，KANBAN-DEF-001 修复后复核通过）
- 交付物：`test/01-core.test.js`、`test/02-store.test.js`、`test/03-http-api.test.js`、
  `test/04-corrupt-recovery.test.js`、`test/05-atomic-write.test.js`、`test/06-static-compliance.test.js`
- 依赖：**零第三方依赖**。仅 `node:test` / `node:assert/strict` / `node:http` / `node:fs` / `node:os` / `node:path` / 全局 `fetch`。

## 1. 运行方式

```bash
# 推荐：Node 内置测试运行器自动发现（含本套件与 test/实现者/ 自查用例）
node --test
npm test            # 等价于 node --test

# 只跑测试者的交付套件
node --test test/01-core.test.js test/02-store.test.js test/03-http-api.test.js \
             test/04-corrupt-recovery.test.js test/05-atomic-write.test.js test/06-static-compliance.test.js
```

> **Node v24 环境事实（已实测）**：`node --test test/`（直接传目录）会报
> `Error: Cannot find module '.../test'`（`MODULE_NOT_FOUND`），位置参数按文件/glob 解析、不再展开目录。
> 请使用 `node --test` 自动发现，或显式文件 / glob 形式。README §7 已同口径说明。

## 2. 隔离与自跑自结（无残留）

- **端口**：每例用 `createServer({ dataFile, port: 0 })` 临时端口，由系统分配，不占用固定端口。
- **数据文件**：每例 `fs.mkdtemp(os.tmpdir(), 'kanban-*')` 独立临时目录，不触碰项目 `data/`。
- **清理**：每例 `t.after` 中 `await close()` 关闭服务并 `fs.rmSync(dir, { recursive: true, force: true })`。
- **退出**：整套 `node --test` 于 ~0.65–0.70s 内跑完并**自然退出**，无未关闭 handle、无常驻进程。
  （退出码：全绿为 0；当前 57/57 全绿。）

## 3. 覆盖范围

- **需求 1–10**：见 `feature-map.md`（13 项覆盖清单逐项映射）。
- **冻结契约**：见 `api-spec.md`（一致项 / 差异项）。
- **独立复现原则**：只认 `README.md` 与三个源码模块的导出契约；不读实现者的自查结论作依据。

不在范围内：
- 浏览器端真实渲染/交互（零依赖约束下不引入 jsdom）；界面侧改用**静态源扫描**断言
  （`textContent`、无 `innerHTML` 等注入点、必填与提交前拦截、无外链）。
- 多用户/鉴权/协同（首版明确不做）。
- 非冻结扩展接口（`PATCH /api/tasks/:id`、`GET /api/tasks/:id`）不作为验收项。

## 4. 当前结果（2026-10-15 修复后复核）

```
node --test
ℹ tests 57   ℹ pass 57   ℹ fail 0   ℹ duration_ms ≈ 699   （两次运行一致）
```

- 57 = 测试者套件 45 例 + `test/实现者/smoke.test.js` 12 例（实现者新增 1 例 413 回归）。
- 413 用例已转绿；`node --test test/03-http-api.test.js` = `tests 13 / pass 13 / fail 0`。
- 两种客户端专项：`node temp/测试者/probe-413-v2.cjs` 均观测 `status=413`（`fetch`/undici 与 `node:http`）。
- 回归：`node temp/测试者/probe-regression-v2.cjs` 9/9（含 1MiB 精确边界）。
- 首版（修复前）历史：`tests 56 / pass 55 / fail 1`，唯一失败为 `KANBAN-DEF-001`（已关闭）。

## 5. 已知非缺陷差异（待客户裁定）

- 界面 `#create-title` 无 HTML `required` 属性（拦截由 `app.js` 提交前校验完成）——见 `api-spec.md` 2.2。
