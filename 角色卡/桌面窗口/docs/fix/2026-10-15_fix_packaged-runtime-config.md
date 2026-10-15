---
id: packaged-runtime-config
type: fix
title: 安装包运行时配置使用可持久写入的userData路径
created: "2026-10-15"
status: implemented
---

# 安装后保存设置不再依赖应用资源目录

用户要求基于v1.0.0配置打包、构建macOS/Windows、测试后发布。本次root转发必要窗口适配，固定Window只改自身main/pi-config/desktop helper和已列pi-config.test.ts，不修改tag、装配文件、README、环境文件或其它角色源码。sourceRef为`83445ebcf24454c6107838cb7f2221882c6638ea`，发布产物需使用此基线加精确overlay。

原resolveRepoEnvPath从源码模块上推仓库根；安装包白名单不带.env，应用资源又不应作为可写配置位置。新增纯resolveDesktopEnvPath：开发仍为原仓库.env；app.isPackaged时必须提供绝对userData路径，返回该目录的.env。main.whenReady之后解析一次desktopEnvPath，先确保安装包userData目录存在，再调用唯一共享loadEnvFileInto，之后建窗与构造DesktopInterface，envFilePath显式注入同一路径。三种引擎设置读取、保存和安全点apply均沿既有Interface注入，不复制.env解析/写入，不自动拷贝仓库凭据。所读适配器环境快照发生在后续factory/bind调用，未新增模块导入时读取配置值的逻辑。

生产精确三文件：app/main.ts、app/desktop/pi-config.ts、新app/desktop/packaged-smoke.ts。唯一测试文件为现边界已有test/桌面应用/pi-config.test.ts；不存在runtime-config/lifecycle新测试，不借不存在文件发布。装配已获helper精确路径并负责overlay白名单与重构包；本角色不创建依赖、提交、推送或tag。

## 真实安装包的受控烟测入口

装配与Window确认命令：`--ans-packaged-smoke <absolute-result.json> --user-data-dir=<absolute-temp-dir>`。只有显式smoke模式才由main创建隔离目录并早期app.setPath(userData)；普通启动仍用Electron默认userData，不保证单独Chromium user-data-dir参数等同应用配置位置，不新增普通用户测试flag。新ANS Studio普通GUI的实际配置路径由设置视图和app.getPath为准。

实际packaged窗口did-finish-load后，webContents执行脚本访问真实DOM/preload，调用已有getRecoveryState和三引擎getRuntimeConfig，检查未导入引擎禁用、缺配置、设置打开/关闭和同一env路径。只读IPC与设置开闭，不导入项目、不保存、不触模型。JSON含ok/isPackaged/platform/arch/version/envPath、全boolean checks和缺少的键名，不含配置值；只有isPackaged且全部检查成立才exit0，否则exit1，超时由外部release verifier处理。开发运行不被计成真实安装包通过。

此helper新增的是宿主CLI验证代码，不新增renderer IPC、文件权限、模型工具或真实写入操作。只有结果JSON和既有诊断输出写到验证者提供的临时目录；普通配置文件仍只经共享模块写入。

## 红绿与实际验证

首红路径用例复现安装模式仍取仓库.env而非临时userData，随后新resolver同断言转绿。pi-config.test.ts最终15/15：原配置读写/掩码/失败纪律保持，新增路径模式、临时配置保存后fresh环境载入与三runtime读同一路径、CLI绝对隔离参数，以及烟测脚本不调用保存/模型API且不输出fake secret。缺.env启动读取不创建文件；保存后新环境能读回fake值，视图与结果仍不回显秘密。所有磁盘夹具均临时文件，不读取或改写真实仓库.env。

`npm run typecheck`退出0，git diff --check通过。严格红绿、owner结果和精确sourceRef/overlay SHA见[manifest](2026-10-15-packaged-runtime-config-evidence/manifest.json)。本角色没有启动GUI；smoke脚本单元用例是受控DOM/IPC替身，不冒称真实Electron验证。装配必须重打包含最终三文件的产物后运行实际extracted exe烟测；root随后独立真实GUI保存非秘密配置/restart。macOS/Windows安装包及在线模型结论由相应实际验证者另记，不用开发模式或旧400MB包替代。
