# 修复 source-guard 跨平台路径（Windows CI，2026-10-22）

## 问题

v1.5.0 发布 CI 在 Windows 上 `test/桌面UI/source-guard.test.ts` 3 条失败（macOS 通过）：

1. 「渲染器边界…」：`app\renderer\src\lib\platform.ts bypasses platform bridge`——测试用 `file.endsWith("lib/platform.ts")` 判断平台桥文件，Windows 路径为 `...\lib\platform.ts`，未命中，导致 `platform.ts` 被误判为绕过桥。
2. 「Markdown 单一管线…」：`assert.deepEqual(escDefs.map(rel), ["app/renderer/src/chat/markdown.ts"])` 等路径比较失败——`path.relative` 在 Windows 返回反斜杠路径，与 POSIX 字面量不等。
3. 「治理/报告事实不持久化…」：`app\renderer\src\stores\ui-store.ts persists beyond sidebar preferences`——`rel(file)` 与 `"app/renderer/src/stores/ui-store.ts"` 比较失败。

## 修改（只改测试，不改产品）

`test/桌面UI/source-guard.test.ts`：

- `rel(file)` 统一归一化：`relative(ROOT, file).replaceAll("\\", "/")`。
- 平台桥判断改为 `if (!rel(file).endsWith("lib/platform.ts"))`。
- 所有路径比较/错误信息均使用归一化后的 `rel`；断言强度、文件集合、正则/内容守卫不变。

## 验证

- macOS：`node --test test/桌面UI/source-guard.test.ts` → **9/9 pass**。
- Windows 应通过的原因：`path.relative` 的反斜杠被 `replaceAll("\\","/")` 归一为 `/` 后：
  - `rel(file).endsWith("lib/platform.ts")` 命中唯一平台桥文件；
  - `escDefs.map(rel)` / `mdImports.map(rel)` 得到 `app/renderer/src/chat/markdown.ts`，与期望字面量一致；
  - `ui-store.ts` 的 rel 等于 `app/renderer/src/stores/ui-store.ts`，不再误报。
- 不涉及 DOM/Electron/产品代码；其他平台行为不变。

## 边界

- 只改 `test/桌面UI/source-guard.test.ts` 与本记录；未改产品代码/配置。
