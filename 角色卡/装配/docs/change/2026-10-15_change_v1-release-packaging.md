---
id: v1-release-packaging-assembly
type: change
title: v1.0.0 三平台运行包与可审计发布装配
created: "2026-10-15"
status: authorized
---

客户已经要求相关角色实施打包、测试后上传 Release。装配上下文固定绑定装配角色，使用现有 Section 1；新建构建配置和 workflow 等待 Governance 精确列权后写入。

实施文件清单：`package.json`、`package-lock.json`、`.gitignore`、`README.md`；精确新增 `electron-builder.yml`、`.github/workflows/release.yml`；已有私有目录内新增 `src/common/装配/release-prepare.mjs`、`release-verify.mjs`，以及本角色必要启动检查 `test/装配/release-packaging.test.ts`。本记录、feature-map/memo 和构建功能说明属于现有文档权限。生产业务改动由对应属主实现，装配不修改 `app/` 或其他角色代码。

三份运行包：macOS arm64、macOS x64、Windows x64，使用匹配架构的原生 GitHub runner。最小格式 ZIP，macOS 包含 `.app`，Windows 包含可执行程序及资源，不新增自动更新或后台安装服务。Electron 固定 44.7.0，electron-builder 使用精确版本并锁文件，`npm ci` 安装。保持原生 TypeScript 入口，`asar:false` 确保 SDK 原生子进程、WASM 和执行文件可以通过实际文件路径读取，避免把外部 spawn 指向虚拟归档。应用文件只允许 app/src/bin/package/LICENSE 与生产依赖，显式排除 `.env`、`.ans`、凭据和开发数据。

来源保持原 v1.0.0 tag 不动：source SHA `83445ebcf24454c6107838cb7f2221882c6638ea`。从该 source 创建隔离工作树，仅应用确定的构建文件及属主确认的 packaged 必要修复 overlay；记录 source/overlay SHA、应用后实际 tree、diff、锁文件 hash、平台版本和 artifact hash。未知 overlay 文件失败，不直接将浮动 main 作为旧 tag。release 先 draft，三平台实际包启动与 IPC 检查、独立测试及 hash 核验后才发布。

实际发现依赖：桌面配置默认指向应用根 `.env`，需桌面窗口属主修复 packaged userData 写入；Codex 默认以 Electron 的 process.execPath 执行 JS CLI，需对应适配器属主确认 Node 模式；Claude SDK 当前版本默认 native CLI，继续核查，不能推测同样修补。内置治理角色正文来自 boundary-core 常量，无需将开发机外部技能目录整体打入包。

验证：装配测试和 typecheck；构建输出扫描确保 allowlist 与平台资源存在；同架构 clean env 实际启动已打包 executable（不能使用开发 electron 替代），检查 renderer/preload/IPC 与窗口无未捕获错误。root 固定测试进行独立联调并决定 release gate。当前尚未完成构建/测试/发布，不预写通过。

依据：[electron-builder 应用内容](https://www.electron.build/docs/contents/)、[Electron 分发说明](https://github.com/electron/electron/blob/main/docs/tutorial/application-distribution.md)。

## 已实施候选与本角色验证

已按精确治理边界完成两构建配置、锁定 electron-builder 26.15.3、三个运行脚本与来源/集合校验辅助脚本。实际脚本清单见[候选 manifest](2026-10-15-release-packaging-evidence/manifest.json)。overlay 最终精确生产补丁：窗口 main/pi-config/packaged-smoke 三文件；Codex session 一文件；UI renderer.js/index.html 两处已存在路径文案。其余 app/src 变更拒绝进入构建，不授权补丁扩大。

修正了实际审查发现的问题：中文 Git 路径使用 core.quotePath=false 保留；空 overlay 不让空 pathspec 意外带入全部改动；workflow 输入经环境变量传给 Node、不做 shell 拼接；provenance 先复制到单一平面目录，避免 artifact 最长公共路径带来 source/ 嵌套；发布前严格核三份 manifest、7 项实际 UI 检查、SDK/原生版本、平台架构、锁文件与 source/overlay/tree 一致，逐 ZIP 核 hash/大小，三份原始 patch/provenance 一致后与运行包公开上传。原 tag 不移动。

70/70 装配测试、类型检查退出 0、JS/YAML 解析与 diff 检查通过。集合校验测试是合约夹具，覆盖成功及 actualTree 漂移、非 packaged、重复架构、ZIP 篡改、overlay 篡改，不能当真实平台结果。macOS arm64 本地 ZIP 已实际构建（使用已安装同版 Electron 避免受限网络重复下载），并在实际 packaged executable 的 Node 模式下成功导入 Pi/Claude SDK 和 Photon WASM；首次探针误用 CJS resolve 对 Pi import-only exports 报错已修正为固定版本 ESM 入口。macOS Info.plist 实测最低 13.0，已同步配置和说明；运行包沿用现有产品 PNG 图标。

此时仍等待 root 候选 commit 后生成真实 source+overlay provenance、各 native CI 和 root 独立实际包测试；不将当前未提交工作树 ZIP 冒充最终 Release 产物。所有原始门槛由 root/PM 核对，尚未上传或发布。
