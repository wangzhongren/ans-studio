---
id: v1-release-packaging-assembly
type: change
title: v1.0.0 三平台运行包与可审计发布装配
created: "2026-10-15"
status: verified
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

## 正式隔离源码的本机 arm64 包验证

root 已创建构建提交 `2bd0a606029286e884d5fd68840c13ebd1e023c2` 并运行 prepare，`.release/source` 为固定 tag `83445ebcf24454c6107838cb7f2221882c6638ea` 加精确 overlay，实际 tree `5765af926576986fb8d740025191f8ccf73d1e5f`。本角色未修改该工作树 tracked 源，只给 node_modules 建指向既有锁定安装的临时 symlink；本机命令 `npm run package -- --mac --arm64 --publish never --config.electronDist=node_modules/electron/dist` 使用现有同版 44.7.0 发行目录。CI 仍执行 `npm ci` 及正常 Electron 下载；不能将这个本机缓存差异隐藏成已跑 CI。

隔离工作树构建 ZIP 成功退出 0；`release-verify.mjs release-output arm64` 解压实际 ZIP 并执行，其中默认 sandbox 首次 GUI 子进程 SIGABRT、无 stdout/stderr，已原样保留首红。按完全相同代码/断言在允许原生进程启动的执行环境重新运行，退出 0，真实 `.app` 的 DOM/preload/IPC/导入前禁选/缺配置/设置开闭/userData 配置路径共 7 项全真；isPackaged=true、version=1.0.0、platform=darwin、arch=arm64。Pi/Claude SDK 与 Photon WASM 实际加载成功，Codex native CLI 0.162.1、Claude native CLI 2.1.299 运行版本检查通过。没有在线模型请求或读取开发机密钥。

产物 `ANS-Studio-1.0.0-mac-arm64.zip`：404966172 字节，SHA256 `a4888bb0c6192c83df23125fd3c8016df12ed994c422e4213ec668af42bfd6d0`。[正式本机 manifest](2026-10-15-release-packaging-evidence/tag-overlay-mac-arm64-manifest.json)记录真实来源与各项观察；构建/红绿日志在同目录。这是本机 arm64 的真实结果，另外两平台仍须独立 native CI，root GUI 与最终 Release 验收尚待完成，未据此提前发布。

## 首轮 Windows CI 输入修复

CI run `38717918774` 的 Windows 回归失败已由 root 保留原日志。装配自身修复只改变测试/构建输入：所有 native runner 在 checkout 前设置 `core.autocrlf=false` / `core.eol=lf`，避免 Git 隐式换行转换破坏被 pin 的 Markdown 字节与既有源码匹配；`multi-runtime.test.ts` 的 `--import` loader 及 `-e` 内绝对 TS import 使用 `pathToFileURL(...).href`，让 Windows 盘符被正确解释为 file URL。原断言均保留。macOS 本机针对该文件 13/13、类型检查退出 0、diff 检查通过；Windows 仍待下一次 native CI，不能提前写通过。此轮未修改生产 bundle，也未重新打包。

按 root 实际修复写集，overlay 精确新增两项其自有测试 `test/测试/t1-real-cli.test.ts`、`test/测试/p1p7-document-integration.test.ts`，没有 loader helper 变更；其他属主必要测试待其最终精确清单再纳入，不批量授权目录或生产代码。

## 第二候选装配冻结

按属主实际修复清单精确扩入 overlay 的测试为：`test/pi-adapter/tool-display-projection.test.ts`、`test/桌面应用/boundary-refresh.test.ts`、`interface.test.ts`、`project-document.test.ts`、`test/测试/t1-real-cli.test.ts`、`p1p7-document-integration.test.ts`；Codex session 测试仍在其已有专属测试目录覆盖内。未添加生产 Provider 路径，也没有移除未知生产改动的拒绝检查。

README 与工作流 Release notes 已明确：Windows 暂不支持内置受限来源文档阅读；完整摘要和执行记录仍保留，来源文件可由操作者使用系统编辑器查看。没有声称提供尚未实现的一键外部打开按钮。此限制来自已经接受的 r2 安全 Provider 取舍，本轮不放松 fail-closed。

第二候选装配窄验命令 `node --test test/装配/multi-runtime.test.ts test/装配/release-packaging.test.ts` 为 16/16，typecheck 和 diff 检查退出 0。此验证发生在 macOS，Windows 必须以后续相同 overlay SHA/tree 的三平台原生 CI 为准。生产功能六文件没有在本轮改变，未重打包。装配脚本、workflow 与说明现已冻结，交 root 合并属主测试后创建第二候选及再次派发全部门槛。


## 最终同源三平台 CI 验证与草稿上传

本节为当前结果，前文候选与首红均保留为历史。已只读核对 root 保存的 CI3 三份 manifest、回归原日志、集合校验日志和上传日志：run [38728387848](https://github.com/wangzhongren/ans-studio/actions/runs/38728387848)，source `83445ebcf24454c6107838cb7f2221882c6638ea`，最终 overlay `c3d106602b5a82fc5fa7e1bd9e1d7485239d8b4a`。三平台实际 tree 均为 `15427e074c23ad1d4b52d0b191f57fe3bdeb5167`，overlay patch SHA256 `a7297f345b371754ff07f4165b54d9159a1f0846e6758c27220803660432f45c`，并经 root 独立 Git 对象树重建一致。

每个平台共 1401 项：macOS arm64、macOS x64 各 1400 通过/0 失败/1 平台跳过；Windows x64 1399 通过/0 失败/2 平台跳过。每个 runner 都执行其同架构 ZIP 的真实解压程序启动，7 项 UI/preload/IPC/配置检查全部通过，同时实际加载 SDK/WASM 并运行 Codex CLI 0.162.1、Claude CLI 2.1.299，没有在线模型请求。首两轮的 Windows 盘符/CRLF/平台信号 oracle、已接受 Windows 文档读取限制和确定性时钟 fixture 修复有原红及属主记录；未放宽生产 Provider、改超时阈值、删断言或为获得成功重试旧候选。最终三包完全来自同一 CI3 构建提交，没有混用早期资产。

| 运行包 | 字节数 | SHA256 |
| --- | ---: | --- |
| `ANS-Studio-1.0.0-mac-arm64.zip` | 404892017 | `92118718ae34b1194c615d2c94c78b37d0324bce0b0ac9e31529431c0bc59270` |
| `ANS-Studio-1.0.0-mac-x64.zip` | 426086246 | `fe03c2e0e08eb6d5d19ec9045fc58d7f5967ed5f3aadc321d2d06d85cfe1eb17` |
| `ANS-Studio-1.0.0-win-x64.zip` | 455095457 | `03be992e7081ef63a4a719e15fda08a8e6a5518a9edccfbfa10b51d1378f2047` |

发布 job 的完整三平台来源集合校验通过；12 项资产（3 ZIP、3 manifest、4 校验清单、1 provenance、1 overlay patch）已实际上传到 draft。root 已通过 WebUI 实际公开发布，并在未登录页面确认可访问三个运行包；页面显示 Latest/released、没有 Draft，GitHub 保存的三个 ZIP SHA256 与 CI3 manifest 逐项一致。结果原件在[独立测试 CI3 清单](../../../测试/docs/change/2026-10-15-v1-release-evidence/ci3-results.json)，[发布页面](https://github.com/wangzhongren/ans-studio/releases/tag/v1.0.0)作为交付入口。


## 公开发布确认

[ANS Studio 1.0.0](https://github.com/wangzhongren/ans-studio/releases/tag/v1.0.0)已实际公开发布。root 独立测试保留未登录公开页面证据 `release-public-guest.png` / AX 与 GitHub 资产 digest 对照 `github-upload-digests.json`；3 个运行包加 manifest、校验值、来源、overlay 共 12 项分发资产均在公开页面，另有 GitHub 自动生成的两项源码下载。装配据此将本记录置为 verified，README 与功能说明改为已发布。

此次仅文档收口，未改构建提交 `c3d106602b5a82fc5fa7e1bd9e1d7485239d8b4a`、固定 source tag `83445ebcf24454c6107838cb7f2221882c6638ea`、实际构建 tree、产物或 tag；未将文档提交伪称为运行包来源。未签名/未公证、Windows 内置受限来源文档阅读不支持及这些启动验证没有调用在线模型的范围保持明确。
