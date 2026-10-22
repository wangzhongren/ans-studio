# Windows 内嵌模型目录 CRLF 读取修复（v1.5.0 发布 CI 红）

2026-10-22，Codex适配器固定角色。派发自 v1.5.0 发布 CI Windows job：`test/codex-adapter/reasoning-catalog.test.ts` 报「Codex installed model metadata version/format is not supported for effort compatibility」，`test/codex-adapter/reasoning.test.ts`「at most two distinct compatibility candidates…」报 `Codex fixture wait timed out`；macOS 全绿。定性：**真实产品缺陷**（Windows 兼容缺口），非夹具平台假设；客户已授权随 1.5.0 发布修复。

## 根因（证据链）

- v1.5.0 锁定 `@openai/codex@0.162.1`；平台包 `@openai/codex-win32-x64@0.162.1-win32-x64`。从 npm 下载的 win32 包 sha512 与 `package-lock.json` integrity 逐字节一致（`dfl4MhHu…GlaQ==`）。
- win32 包二进制 `vendor/x86_64-pc-windows-msvc/bin/codex.exe`（318 MiB，低于 512 MiB 上限）内嵌模型目录位于偏移 **264,312,440**，字节前缀为 `{\r\n  "models": [`（CRLF）；目录 JSON 共 **473,672 B**。darwin 二进制为 `{\n  "models": [`（LF）。
- 生产 `src/common/codex-adapter/reasoning-catalog.ts` 原 `MARKER = '{\n  "models": ['` 只认 LF：解码器对 win32 原始字节抛出的错误与 CI 逐字一致；CRLF 归一后同一解码器成功解出 **11 个模型**，`gpt-5.5` 完整条目与 macOS 安装包元数据 `deep-equal`。即同版本、同语义、仅行尾不同。
- 第二个失败为同一根因的下游：FIELD 拒绝 → `session.ts` `reconnectNative(…, effortRejected=true)` → `prepareReasoningCatalog()` → `readInstalledReasoningCatalog()` 抛错 → 重建引擎永不出现 → `until` 超时。等待条件本身不可能满足，非时限问题。

## 修法

`src/common/codex-adapter/reasoning-catalog.ts`：

- 标记集合扩为两种**已验证**格式：LF `{\n  "models": [` 与 CRLF `{\r\n  "models": [`；`decodeEmbeddedReasoningCatalog` 前缀校验接受两者，其余任何格式照旧 `fail()`。
- 新增纯函数 `findReasoningCatalogMarker()`（分块扫描同时找两种标记，取最早位置）与导出常量 `REASONING_CATALOG_MARKER_OVERLAP`（最长标记长 − 1 = 15，窗口间携带尾巴），读取循环改用之。
- 版本/精确单模型/4 MiB 目录上限/512 MiB 原生文件上限/失败关闭全部不变；不引入任何调用方可指定来源。

测试/夹具：

- `test/codex-adapter/reasoning-catalog.test.ts`：新增 LF/CRLF 同解码结果断言、标记搜索近失配负例（`{\r\n "models": [` 一个空格也不猜）、以及标记在任意分块切点（含跨窗口）都能被 15 字节重叠捕获的断言；原「未知格式拒绝」断言保留。
- 权限断言按平台真值分支：win32 `0o666`（Node 以文件属性合成 mode）/ POSIX `0o600`；断言形式与强度不变、不 skip。
- `test/codex-adapter/fixtures.ts` `until` 等待上限 2s → 10s：仅延长等待，预防 Windows CI 扫描 318 MiB 二进制；条件与断言语义不变。

## 复跑

- `node --test test/codex-adapter/reasoning-catalog.test.ts test/codex-adapter/reasoning.test.ts`：**20/20** 通过、0 fail、0 skip（[log](2026-10-22-crlf-catalog-evidence/reasoning-tests.txt)）。
- `node --test "test/codex-adapter/*.test.ts"`：**81/81** 通过、0 fail、0 skip（[log](2026-10-22-crlf-catalog-evidence/codex-adapter-tests.txt)）。
- `npm run typecheck`：exit 0（[log](2026-10-22-crlf-catalog-evidence/typecheck.txt)）。
- Windows 预期实证（本机不可能以 win32 平台运行，改以真实 win32 二进制驱动生产同款扫描循环）：标记命中偏移 264,312,440、解出 11 模型、`gpt-5.5` 兼容目录生成且仅改四个批准字段（[模拟输出](2026-10-22-crlf-catalog-evidence/win32-reader-simulation.txt)）。

## 未验边界

- darwin 无法本机复现 win32 `process.platform` 分支；Windows 侧以修复后的 CI 复跑为准（沿既有 EBUSY/taskkill 先例）。
- 接受 CRLF 属对固定 0.162.1 **新增验证过的格式**，不是通用稳定性承诺；CLI 升级仍须重新验证格式与字段。

变更文件：`src/common/codex-adapter/reasoning-catalog.ts`、`test/codex-adapter/reasoning-catalog.test.ts`、`test/codex-adapter/fixtures.ts`。发布 overlay 需精确纳入产品文件与相关测试。
