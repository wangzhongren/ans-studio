---
type: fix
title: Windows 回环夹具稳定化（Claude EBUSY 清理重试）与 Codex 元数据产品缺口上报
created: "2026-10-22"
updated: "2026-10-22"
status: verified-tested-scope
---

# 只修测试夹具；产品缺口如实上报

v1.5.0 发布 CI（run [39702128045](https://github.com/wangzhongren/ans-studio/actions/runs/39702128045)，Windows job 119573692904，源码 `c166914`）在 `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts` 出现两红：Claude 用例 teardown `EBUSY: resource busy or locked, rmdir ...\ans-independent-claude-*`；Codex 用例 `Error: Codex installed model metadata version/format is not supported for effort compatibility`。本角色按边界只改 `test/测试/` 与本角色文档：修复了 Claude 用例的测试侧清理竞态；Codex 用例经字节级取证属**产品侧 Windows 兼容缺口**，不改产品、不换模型、不放宽断言，如实上报所属角色处理。

## 1) Claude EBUSY：测试临时目录清理的有界重试

- **根因**：`root` 是测试自己 `mkdtemp` 的临时目录，同时作为 Claude SDK 子进程的 `HOME`/`TMPDIR`。`session.dispose()` 与事件流结束返回后，Windows 上子进程收尾、实时防护或索引器仍可能瞬时持有目录句柄，`rm(root)` 的 `rmdir` 返回 `EBUSY`。这是操作系统层面的瞬时占用，不是产品断言失败。
- **改动**：`test/测试/g5-reasoning-verify/helpers.ts` 新增 `removeTempDirEventually(dir, attempts = 20, delayMs = 100)`：
  - 异步 `rm` + 异步退避（不阻塞事件循环），给待收尾句柄留释放时间；
  - 只重试瞬时码 `EBUSY`/`ENOTEMPTY`/`EPERM`/`EACCES`/`EMFILE`/`ENFILE`（同 Node `fs.rm` 的瞬时集合），其它错误立即上抛；
  - **上界耗尽仍失败则带 `cause` 上抛**，不把清理失败伪装成成功；
  - `compatibility-loopback.test.ts` 三个用例（Claude/Codex/Pi）的 teardown 统一改用该辅助。断言、用例数、超时、模型与端点均未改。
- **夹具自证**：正常目录可删除；对不可写父目录下的子目录注入持续 `EACCES`，辅助按界重试后抛出包装错误且 `cause.code === "EACCES"`（未吞错）。

## 2) Codex 元数据：产品侧缺口，非夹具选择问题

证据（本机实测，发布件即 CI 经 `npm ci` 安装的同一 tarball）：

- `npm pack @openai/codex@0.162.1-win32-x64` 解包后 `vendor/x86_64-pc-windows-msvc/bin/codex.exe` 大小 **333,479,728** 字节；`{\n  "models": [`（LF）**不存在**，`{\r\n  "models": [`（CRLF）位于偏移 **264,312,440**。
- `src/common/codex-adapter/reasoning-catalog.ts:10` 的 `MARKER` 为 LF-only；扫描不到即走到 `readInstalledReasoningCatalog` 末尾 `fail()`（第 108 行），与 CI 报错逐字一致。
- 按 CRLF 标记解码 win32 内嵌目录（473,672 字节）：11 个 slug 与 macOS 一致，含 `gpt-5.5`；其 `default_reasoning_level: "medium"`、`default_reasoning_summary: "none"`、`supports_reasoning_summary_parameter/summaries: true`、`supported_reasoning_levels`、`model_messages`、`context_window: 272000`、`display_name` 均满足读取器的校验形状。
- 本机 macOS 二进制（246,642,624 字节）同一目录使用 LF，标记位于偏移 189,520,381——这解释了 macOS 绿、Windows 红。
- 反证 `cliPath` 夹具不可行：以本机真实原生 CLI 作为 `cliPath` 运行同一 localhost 场景，去覆盖后 CLI 按内嵌目录补发 `reasoning: { effort: "medium" }`，第二轮被拒、回合失败。即产品的目录覆盖（`prepareReasoningCatalog`）是该场景的必要路径，任何测试侧“换 CLI/换模型”的绕行都会削弱被测行为。

结论：Windows 发布件的元数据嵌入格式（CRLF）不被当前读取器接受，属 `src/common/codex-adapter/reasoning-catalog.ts` 的产品兼容缺口。按角色边界本角色不改产品代码；已把文件/行号与发布件字节证据上报统筹，交所属角色修复（例如同时接受 CRLF 标记或先规范化行尾）。修复后本回环用例在 Windows 可**原样**通过：win32 与 macOS 目录内容等价（同 slug、同字段），无需改测试或断言。

## 验证（本机 macOS/Darwin arm64，Node v24.14.0）

| 检查 | 命令 | 实际结果 |
| --- | --- | --- |
| 目标回环窄测 | `node --test "test/测试/g5-reasoning-verify/compatibility-loopback.test.ts"` | **3/3 通过**（Claude/Codex/Pi；wire 仍为 high→无 effort→无 effort，两轮 completed） |
| 角色目录回归 | `node --test "test/测试/g5-reasoning-verify/*.test.ts"` | **61/61 通过** |
| 类型检查 | `npm run typecheck` | **退出 0** |

Windows 预期：Claude 用例因清理改为有界重试，断言路径不变，应通过；Pi 用例原本在 Windows 已绿，未改行为；Codex 用例在所属角色修复上述产品读取器前**不声称通过**，也不以跳过/换模型/自定义 CLI 伪装。

## 改动文件

- `test/测试/g5-reasoning-verify/helpers.ts`：新增 `removeTempDirEventually` 有界重试清理辅助。
- `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`：三处 teardown 改用该辅助；断言零改动。
- 本报告与 `角色卡/测试/changelog.md` 记录。

未改产品源码、其他角色测试、依赖、保存设置或构建配置；未跳过用例、未放宽断言。
