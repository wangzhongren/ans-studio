---
type: change
created: "2026-10-15"
status: in-progress
---

# v1.0.0 跨平台运行包独立验证

用户已授权配置打包、基于不可移动的 v1.0.0 构建 macOS / Windows 运行包、测试通过后发布 GitHub Release。root 固定测试角色；装配维护构建/CI，窗口和适配器维护自身必要 packaged 修复，Governance 精确新增配置边界，PM审查发布门槛。

验证基线见 [baseline](2026-10-15-v1-release-evidence/baseline.json)。最终证据必须记录源 tag / 源提交、构建 overlay 提交和实际差异、依赖 lock、平台架构、CI run、产物 SHA-256。原生开发启动与跨架构交叉构建不能充当实际包启动通过。

计划检查：白名单资源且没有真实 .env / 会话 / 凭据；bundled 引擎依赖完整；没有本机 Node / 开发源码依赖；可写配置位于用户数据目录并可重启读取；真实 window/preload/IPC、导入前引擎禁选、缺配置入口、设置可用；macOS arm64本机包实际桌面检查，其他平台由对应 native CI 实际启动验证。未签名/未公证明确声明，不关闭系统安全保护。所有平台 gate 通过后才正式发布。

当前未构建，不以之前 1384 项开发测试替代运行包测试。

## CI 前开发候选检查

最终全仓 Node 1395 total / 1394 pass / 0 fail / 1 既有 Windows-only skip，exit0；typecheck0。首次沙箱运行唯一失败为监听 127.0.0.1 EPERM，保留首红；同断言在允许本机回环环境重跑通过，未改测试以掩盖失败。真实 .env 与 accepted V2 两件哈希未变。此处仍仅为代码候选，不作为最终各平台安装包通过。

## 第一轮原生 CI 与独立真实包检查

CI1 [38717918774](https://github.com/wangzhongren/ans-studio/actions/runs/38717918774)，overlay 2bd0a606，固定source83445。两mac全仓1394通过，并实际ZIP解压/UI/IPC与native依赖smoke通过；Windows1364通过29失败，失败不发布。完整原始日志由已登录GitHub页面下载后保存，不隐藏首红。

Windows失败分属：checkout CRLF破坏vendored pin与源码匹配、Node --import 的Windows绝对盘符需file URL、POSIX shebang进程夹具、信号终态oracle、boundary路径分隔符、受限文档测试未在原生授权阶段识别Windows既有unsupported。对应owner修各自测试/CI；安全Provider没有放宽。PM核对accepted B2明确Windows不支持受限来源文档阅读，这一限制将在Release明示，完整摘要与执行记录仍可用。

root own T1 loader改pathToFileURL，保全部原有门禁/脱敏断言；own文档集成把原来过晚的Windows分支提前到scope断言之前，严格检查unsupported/no scope/no refs/无text/文件hash与mtime未变；额外所有host用真实Provider({platform:'win32'})配Service，断言read计数0、伪造请求拒绝。新增负例首轮仅断空record时未考虑实际null-prototype，修正为精确entries=[]，仍要求零refs而非放松业务断言；首红保留。own8/8通过，实际Windows仍待CI2，不冒称本机POSIX跑过Windows。

正式本机包由source83445+overlay2bd0真实worktree构建，actualTree5765af926，ZIP404966172字节/sha a4888bb0c6192c83df23125fd3c8016df12ed994c422e4213ec668af42bfd6d0。解压后实际可执行程序在clean HOME下SDK/PhotonWASM、Codex0.162.1/Claude2.1.299和7项UI/preload/IPC全true；首次sandboxSIGABRT保留，同断言允许原生运行exit0。此包本地SHA与CI包的时间/打包字节不同，分开记录不混称同一asset。

root在解压的真实.app原生GUI独立验证：导入前引擎disabled；设置显示用户目录ans-cli/.env；仅写非秘密模型名，真实退出重启仍能读取，随后从界面清空测试模型；原仓库.env哈希不变。用户目录原先不存在，父目录0700。原生picker导入独立p-limit项目，End/Return选择Claude，明确缺ANTHROPIC_API_KEY；缺配按钮打开对应设置，Esc回实际入口且非空草稿保持，最后清除草稿。没有在线模型调用或真实密钥写入。截图和AX见同目录native-package-*。

## 第二候选提交前

所有owner完成平台输入订正，PM只读回审ready-for-CI。完整本机Node1397 total /1396 pass /0 fail /1 Windows-only skip，typecheck0、diff0。未改6个已实际手工验证的运行时文件；Windows不支持的文档功能没有放宽，明确执行负例而非跳过整套。下一步仍须CI2三个真实平台完整回归及包解压启动，不能用本机结果替代。
