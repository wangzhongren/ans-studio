# 缺陷记录（docs/fix）：KANBAN-DEF-001

- 标题：超大请求体（>1MB）未返回 413 `PAYLOAD_TOO_LARGE`，客户端收到 `ECONNRESET`
- 严重度：低 ｜状态：**已修复并复核通过（已关闭）** ｜发现：测试者 ｜日期：2026-10-15
- 修复版本：`src/server.js` sha256=`bff1e3c4920d329a3818146253f8b417a195d0de555aafb7897f4b80acd8ed39`（12459 字节，mtime 2026-10-15T13:39:14.432Z）
- 详细报告与复核脚本（草稿区）：`temp/测试者/2026-10-15_413缺陷.md`、`temp/测试者/probe-413.cjs`、
  `temp/测试者/2026-10-15_413复核.md`、`temp/测试者/probe-413-v2.cjs`
- 对应用例：`test/03-http-api.test.js`「[README §4] 超大请求体应返回 413 PAYLOAD_TOO_LARGE（KANBAN-DEF-001 修复复核）」（**已转绿**）

## 复核结论（2026-10-15）

- 修复方式：`readBody` 超限后**不再 `req.destroy()`**，改为置位并让调用方写回 413，同时继续 drain 剩余字节（`MAX_DRAIN_BYTES`=8 MiB 兜底），连接自然收尾。
- `fetch`（undici）与 `node:http` 原始客户端**均**观测到 `status=413` + `{"error":{"code":"PAYLOAD_TOO_LARGE","message":"请求体过大，最大允许 1MB"}}`。
- 零副作用：超限体不落库；数据目录无 `.tmp-` 残留、数据文件未被创建。
- 1MB 边界：恰 `1MiB` 受理（201），`1MiB+1` → 413。
- 全套 `node --test` = 57/57 通过。**缺陷关闭。**

## 摘要

README §4 与 `api-spec.md` §3 承诺“请求体超过 1MB 返回 413 PAYLOAD_TOO_LARGE”，
但 `fetch` 与 `node:http` 客户端均**收不到任何 HTTP 响应**（`ECONNRESET: socket hang up`）。

## 根因（只读分析）

`src/server.js::readBody` 超限时先 `reject(...)` 再 `req.destroy()`；随后 `handleRequest` 的 catch
才 `sendError(res, 'PAYLOAD_TOO_LARGE', ...)`，此时 socket 已关闭，413 无法写回。

## 复现

```bash
node temp/测试者/probe-413.cjs   # 期望 status=413，实测 ECONNRESET
```

## 影响

- 不影响数据安全（超限请求体不落库，已断言）与其它功能（全部通过）。
- 影响：契约文档失真、客户端错误不友好。

## 修复方向（供参考）

超限时先写出/刷新 413 响应再结束连接；或同步修正 README §4 与 api-spec 的 413 承诺。
修复后由测试者复跑 `node --test` 复核。
