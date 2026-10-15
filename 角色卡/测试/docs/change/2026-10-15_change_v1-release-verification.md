---
type: change
created: "2026-10-15"
status: verified
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

## CI2 Intel 原红与测试时钟订正方案

CI2 Intel 的唯一全仓失败是 root 自有 T1 pi confirmation 集成，100ms prompt deadline 包含真实文件IO/调度负载，实际case约532ms，触发真实TimeoutError100。不能提高100ms阈值、减少180ms等待或重跑遮红。PM已只读同意限定测试修改：仅该3runtime确认用例在Core创建前启用 node:test Date/setTimeout可控时钟，等待时显式tick180；观察使用未mock的setImmediate/performance，外层10s真实watchdog；原abort/stale consent/精准写入/报告/终态/历史/磁盘断言全保。每runtime增加同一时钟下未进入确认等待、tick99未终态/tick1到100ms确实timed_out的负对照，且原30ms真实时间超时用例不变。此为逻辑时间契约测试，不再声称180ms实际墙钟等待；生产timer和budget不变。依据[Node Test MockTimers](https://nodejs.org/download/release/v22.14.0/docs/api/test.html)。装配只精确加入本测试文件overlay；之后仍重跑三平台完整CI与包启动。

第三轮前验证：T1时钟专项8/8（3确认、3严格100ms负对照、2原真实失败/30ms超时）通过；新增负对照首红为handback先于settled异步到达，改为等待两事件到齐再断唯一性，未更改1条终态/1条回交断言。整仓首次还发现Claude旧50ms时序fixture同类误超时，交Claude属主，仅将该case改50/100ms受控时钟并新增49+1负对照，原真实超时等case不变，own29/29、tsc0。保留整仓红，不调高阈值、不跳过或retry求绿。

CI2 Windows完整1397总/1395通过/0失败/2既有平台跳过；实际ZIP455095439字节、native依赖和7UI checks全真，已上传CI artifact但因Intel红整轮未Release。arm64亦通过全套及实际包。Windows现有平台拒读assert执行而非skip，两个skip来自原有POSIX专属进程组清理测试。详情见ci2-results.json与原始各平台日志。

第三候选提交前本机完整1401 total /1400 pass /0 fail /1平台skip，typecheck0。此结果包含所有时钟负对照；CI仍要求同提交三平台完整验证，暂不发布。

## 最终验收与公开发布：verified

最终 [CI3 38728387848](https://github.com/wangzhongren/ans-studio/actions/runs/38728387848) 全部成功；[ANS Studio 1.0.0 已正式公开](https://github.com/wangzhongren/ans-studio/releases/tag/v1.0.0)，发布后以未登录浏览器（Sign in 可见）复核 Latest/released、三下载入口及14项资产（12上传+GitHub自动源码2件），公开截图见 [release-public-guest.png](2026-10-15-v1-release-evidence/release-public-guest.png)。没有剩余发布待办。

| 实际原生平台 | 全仓总数 | 通过 / 失败 / 平台跳过 | 实际解压包启动 |
| --- | --- | --- | --- |
| macOS arm64 | 1401 | 1400 / 0 / 1 | 7项UI/preload/IPC检查通过 |
| macOS x64 | 1401 | 1400 / 0 / 1 | 同上 |
| Windows x64 | 1401 | 1399 / 0 / 2 | 同上 |

每个平台真实执行 Pi/Claude SDK 和 Photon WASM 加载、Codex CLI0.162.1及Claude CLI2.1.299。Windows文档unsupported的负向验证实际执行，不属于2项skip；平台skip为既有专属用例。运行包验证为离线检查，没有把API可配置或CLI版本输出称为在线模型验证。

root独立读取Git对象的mode/blob/path重建源树，先用原标签tree作自校验，再组合精确overlay：source83445ebcf24454c6107838cb7f2221882c6638ea、overlayc3d106602b5a82fc5fa7e1bd9e1d7485239d8b4a、actualTree15427e074c23ad1d4b52d0b191f57fe3bdeb5167、patchSHAa7297f345b371754ff07f4165b54d9159a1f0846e6758c27220803660432f45c，与三个实际CI manifest逐项一致；lock与builder亦一致。集合校验原日志RELEASE_ASSET_SET_VERIFIED已保存。不是把浮动main或原tag直接冒称安装包源码。

发布前检查草稿12上传资产，GitHub服务器显示的三个ZIP SHA-256逐个与实际原生构建测试的manifest相等。公开后，从匿名HTTPS对三份ZIP HEAD请求核实200及精确字节长度，并实际下载九件公开metadata/校验和/补丁；公开manifest、校验文件和patch与CI及独立源树审计一致。没有为了重复验证而再次传输1.3GB ZIP；服务器digest已绑定原生实际被测包。详见 [ci3-results.json](2026-10-15-v1-release-evidence/ci3-results.json)、[GitHub摘要核验](2026-10-15-v1-release-evidence/github-upload-digests.json)、[匿名下载核验](2026-10-15-v1-release-evidence/public-download-verification.json)。

公开资产：mac-arm64 404892017字节、mac-x64 426086246字节、win-x64 455095457字节；三份运行包均由对应原生runner实际解压启动，不以交叉编译或开发Electron冒充。详细SHA见上述manifest及Release公开SHA256SUMS。

PM最后只读回签ready-for-release后，root通过GitHub真实发布按钮完成公开，并实际读到Latest/released/正式v1.0.0 URL。装配与PM已将自身记录改verified；root检查原v1.0.0 tag没有移动、真实.env及accepted V2两件未变、最终CI后没有任何runtime/build/test输入更改，最后仅补文档与证据。

交付范围：macOS13+ Apple Silicon和Intel，Windows10/11 x64可解压运行ZIP；不包含签名/公证、自动更新或安装器。Windows既有受限来源文档阅读不可用，按接受方案安全拒读，完整摘要和执行记录保留；Release明确这项限制。GitHub自动Source code ZIP只含原tag，复现运行包需应用公开overlay.patch。
