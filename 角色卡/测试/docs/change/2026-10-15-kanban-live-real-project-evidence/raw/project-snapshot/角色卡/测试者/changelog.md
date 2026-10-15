# 变更记录（测试者）

## v1.1.0 — 2026-10-15（KANBAN-DEF-001 修复后复核 · 判定通过）

### 被测代码版本绑定（复跑时的 sha256；实现者此后若改动，本结论失效）

| 文件 | 字节 | mtime (UTC) | sha256 |
|---|---|---|---|
| `src/core.js` | 9184 | 2026-10-15T13:23:01.536Z | `4f366329eafbec441386169efb155fc012a4472bcb809325b9c46ed964e136d7` |
| `src/store.js` | 6986 | 2026-10-15T13:23:07.798Z | `44816a6237e814c1cce4de59c738723215092069517beb646ff40fa9e95b70d3` |
| `src/server.js` | 12459 | 2026-10-15T13:39:14.432Z | `bff1e3c4920d329a3818146253f8b417a195d0de555aafb7897f4b80acd8ed39` |
| `src/public/index.html` | 4788 | 2026-10-15T13:23:31.706Z | `4ce0adbbe1c348661da50c98139a38b3278dea23001bdb54435734196dd087c1` |
| `src/public/app.js` | 16575 | 2026-10-15T13:24:37.786Z | `09711789c585e73fbf1eb50cf30f06ed3a7b7e32072656e269b36087b59c8990` |
| `src/public/style.css` | 5901 | 2026-10-15T13:23:31.713Z | `718aabb8592102f31ed76a7c19dc7a51371ded50e83b985b3236367e43aec5cc` |
| `README.md` | 10791 | 2026-10-15T13:25:55.088Z | `966258c2d0d88753b32ce8a5a5e3c137b880d8c361bb215bb6763bd8ef2d49fc` |
| `package.json` | 382 | 2026-10-15T13:24:39.866Z | `859ffaca4f7863e092d922c22132b764aa9e0655bfd52c1e7c21f55f63a6eda4` |

（生成脚本：`temp/测试者/pin-hashes.cjs`）

### 复跑结果

- `node --test`：**tests 57 / suites 0 / pass 57 / fail 0 / duration_ms ≈ 699**（两次运行一致），进程自然退出。
  - 57 = 测试者 45 例 + 实现者 smoke 12 例（实现者新增 1 例 413 回归，其套件 11→12）。
- `node --test test/03-http-api.test.js`：**tests 13 / pass 13 / fail 0**（原红用例已转绿）。
- `node temp/测试者/probe-413-v2.cjs`：`fetch`/undici 与 `node:http` **均 `status=413` + `code=PAYLOAD_TOO_LARGE`**；超限不落库；无 `.tmp-` 残留。
- `node temp/测试者/probe-regression-v2.cjs`：回归 **9/9**（含 1MiB 精确边界）。

### 变更

- 唯一失败项（KANBAN-DEF-001）**已修复并复核通过** → 状态由「待返工」改为「已关闭」。
- `test/03-http-api.test.js` 用例「[README §4] 超大请求体应返回 413…」：**仅改标题文字**（去掉“实测为缺陷”，加“（KANBAN-DEF-001 修复复核）”），
  **断言体一字未动**——该用例转绿是修复的真实结果，非为变绿而改。
- 更新 `api-spec.md`（2.1 改「已复核通过」、新增 2.1b 1MB 边界、§3 表 413 行、§4 结论）、`memo.md`、`docs/fix/KANBAN-DEF-001.md`。
- 新增复核脚本（草稿区）：`temp/测试者/pin-hashes.cjs`、`probe-413-v2.cjs`、`probe-regression-v2.cjs`、`2026-10-15_413复核.md`。

### 结论

- **判定：通过**。冻结契约全部实测一致；无新增缺陷；无返工项。

---

## v1.0.0 — 2026-10-15（首版独立验证）

### 新增交付物：`node --test` 交付级测试套件（6 个文件，45 例）

| 文件 | 覆盖 | 用例数 |
|---|---|---|
| `test/01-core.test.js` | 领域逻辑（validateTitle/normalizeTags/normalizePriority/createTask/updateTask/filterTasks/sortTasks/computeStats） | 11 |
| `test/02-store.test.js` | 存储（CRUD/副本/NOT_FOUND/持久化/包装格式/条目级跳过/导出形态） | 7 |
| `test/03-http-api.test.js` | HTTP 接口（空白标题两层之一/状态切换/编辑/删除/筛选排序/统计/导出/绑定/静态资源/错误处理/413） | 13 |
| `test/04-corrupt-recovery.test.js` | 损坏文件告警/备份/不静默清空（store 层 + HTTP 层） | 4 |
| `test/05-atomic-write.test.js` | 原子写（rename 失败、并发读写、无 `.tmp-` 残留） | 4 |
| `test/06-static-compliance.test.js` | 文本安全/零依赖/界面静态断言 | 6 |

（用例数以 `node --test` 报告为准：测试者套件 45 例。）

### 新增文档

- `角色卡/测试者/feature-map.md`：13 项覆盖清单 → 用例映射、契约核对映射。
- `角色卡/测试者/api-spec.md`：契约核对结论（一致项 / 差异项 / 待裁定口径实测）。
- `角色卡/测试者/functional-description.md`：测试范围与运行说明。
- `角色卡/测试者/memo.md`：进行中事项与环境事实。
- `角色卡/测试者/changelog.md`：本文件。
- `角色卡/测试者/docs/design/测试设计.md`：测试设计。
- `角色卡/测试者/docs/feature/用例说明.md`：逐用例说明。

### temp 草稿区（不参与 pin）

- `temp/测试者/probe-413.cjs`：413 缺陷复核脚本。
- `temp/测试者/2026-10-15_413缺陷.md`：缺陷报告。
- `temp/测试者/REVIEW.md`：返工/缺陷留证。

### 结论

- `node --test`：**tests 56 / pass 55 / fail 1 / duration_ms 698.59075**，进程自然退出。
- 唯一失败为真实缺陷 **KANBAN-DEF-001**（超大请求体未返回 413），已交回实现者。
- 冻结契约其余项全部实测一致，**无其它差异**。

### 修复期间修正的测试自身问题（非实现缺陷）

- 覆盖 5 用例初版误把默认排序当作创建顺序（默认 `createdAt + desc`），已改为按集合比较；
  该修正只影响测试断言写法，不改变对实现的判定。
