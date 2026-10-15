# 安装包中的 Codex 子进程启动

日期：2026-10-15。责任角色：Codex适配器。客户已授权相关角色完成 v1.0.0 打包与必要修复，本项属于该目标的必要兼容修复。

桌面安装包选择 Codex 时，默认入口使用 `process.execPath bin/codex.js`。Electron 的可执行文件是应用本身；原来严格挑选的子进程环境没有 Node 模式标记，会把 CLI 脚本当作应用入口。官方 [Electron 环境变量说明](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node)明确 `ELECTRON_RUN_AS_NODE=1` 令 Electron 以 Node 启动；禁用 runAsNode fuse 的发行配置不兼容此方案，装配必须验证。

必要修复：仅当默认 JavaScript CLI 入口且当前运行时具有 `process.versions.electron` 时，在原有严格环境副本中增加该标记。普通 Node 和显式 `cliPath` 原生二进制保持原参数、原环境。保留全部 sandbox、MCP、凭据选择和隔离校验；不继承宿主全环境，不修改公共契约。

精确生产写集：`src/provider/codex/session.ts`。测试写集：`test/codex-adapter/electron-launch.test.ts` 和本角色无模型 Electron 探针。文档只在本角色目录。固定依赖的 CLI 启动器本地源码为 `@openai/codex/bin/codex.js`，不猜测平台二进制资源布局。

验证计划：捕获真实入口 spawn，分别断言普通 Node、Electron 默认入口、Electron 显式二进制的命令/参数/严格环境；执行自有会话回归及类型检查；本地 Electron 在 Node 模式下通过真实 CLI 初始化受限会话后立即释放，不发送模型请求。最终安装包与 Windows 真实运行由装配/测试阶段验收。

关联功能：[受治理会话](../feature/codex-governed-session.md)。当前状态：已实施，自有验证通过，最终安装包验收交装配与测试。

## 实际验证

生产仅修改 `session.ts` 的 spawn 环境构造。2026-10-15 macOS arm64 / Node 24.14.0 / Electron 44.7.0 / Codex CLI 0.162.1：

- `node --test test/codex-adapter/*.test.ts`：25/25，通过全部既有22项和新增3项启动回归。捕获实际默认入口 spawn，断言 argv、严格环境和三种启动分支；宿主无关秘密与宿主 ELECTRON_RUN_AS_NODE 均不会继承。
- `npm run typecheck`：exit 0。`git diff --check`：exit 0。
- `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --experimental-strip-types test/codex-adapter/electron-node-probe.mjs`：exit 0。实际 Electron 经适配器启动 pinned CLI，完成 initialize/config/read、隔离校验、thread/start 与清理，模型请求0。探针控制台含 macOS codesign task_name_for_pid 诊断，但进程正常退出且功能断言通过；没有据此声称安装包已签名。

日志：[单元回归](2026-10-15-packaged-electron-evidence/tests.log)、[类型检查](2026-10-15-packaged-electron-evidence/typecheck.log)、[真实 Electron 探针](2026-10-15-packaged-electron-evidence/electron-probe.log)。这不是最终安装包启动或 Windows 运行证据；那两项由后继验收记录覆盖。

当前生产 SHA-256：`0b603897b281a693f3c7cbabba74c313ca1db1f4f6cdb9f249a2cb09c4891521`。新增启动测试 `3237c1e6306b6b587a323fb9161bfdf2432c3be4bb54e46e2e3ad7323fcb6a5a`；真实 Electron 探针 `907881f9e23d66ef3683961acc2ed6435cc518a93e1153dc2c2df1ba63340990`。
