---
id: v1-release-packaging
type: change
title: v1.0.0可审计跨平台打包与Release协调
created: "2026-10-15"
status: authorized
revision: 1
---

客户已授权相关角色配置打包流程，基于v1.0.0编译macOS/Windows运行包，测试通过上传GitHub Release；不重复请求该授权。已知基线v1.0.0与main均83445eb、工作区干净，实际构建前须重核完整SHA。禁止移动/重打既有tag或谎称旧tag含新流水线。PM仅写自有协调文档、不起GUI、不替owner实现。

## 最小方案与责任

Governance fresh固定角色先核实际repo/职责，为装配接受最小构建配置、CI和必要packaged接线逐文件边界；不得批授整仓。装配fresh固定角色在已授权后读实际入口/依赖/资源/启动路径，提出并实施最小可审计方案。新workflow/builder/npm配置等精确文件在实际调查与治理清单后填入，不提前假定已有能力；不因打包重复设计业务UI。

优先产物macOS arm64、macOS x64、Windows x64，各独立原生CI runner构建/启动验证（mac两个架构需匹配实际执行架构，不能把交叉编译当启动测试）。资源/SDK运行依赖须随包实际可解析，不只生成空壳。默认建议mac zip+Windows zip便携运行包作为最小分发，若装配实际工具链需dmg/nsis等由其说明必要性，避免无授权新增自动更新/安装服务/权限。签名证书缺席则未签名产物与系统警示透明记录，不伪造签名或安全公证通过；不要求用户提供凭据来完成已可做工作。

现有tag保持原样。打包源码由sourceRef=v1.0.0解析完整source SHA；新增配置/必要packaged适配在独立新提交build overlay，记录overlay完整SHA、相对tag diff和应用后的实际tree。CI显式checkout sourceRef并按确定、最小、可审计overlay组合，不把main漂移直接当v1.0.0；拒冲突/未知文件/不干净结果。manifest列sourceRef/sourceSHA/overlaySHA/实际tree/锁文件hash、平台架构、Node/npm/构建工具版本、CI run URL、产物SHA256/大小及smoke命令结果。若需业务源码修复，交实际owner并在来源说明明确属于v1.0.0加修复overlay，不能宣称原tag即已可运行。

root固定测试独立核真实CI与包清单、资源/架构及安装包或解压产物启动/UI smoke，不写生产。装配负责自身CI/packaged专项，测试失败保首红交实际owner修复。新写集若超治理清单先报对应授权属主，不绕层。

## 发布硬门槛

1. 精确边界生效，source/overlay/tree记录一致，既有tag未变；确定依赖安装/编译/类型检查/相关全仓回归成功。
2. 三个平台架构分别有真实CI构建和实际对应架构包启动smoke：启动到主界面、preload/IPC可用、关键静态资源可读、离线导入/禁选/设置入口无崩溃；不触真密钥、不用在线模型成功替代启动测试。runner无图形能力须使用该平台可落实的可审计图形环境或实际机验证，不能仅process存在/产物存在冒充UI可运行。
3. root独立验证产物与CI日志/manifest一致，SHA256清单、未签名/未公证和适用OS要求在release notes明确。未知或失败平台不得以success/published冒签；不能把本机mac通过代Windows或另一架构。
4. 可先创建draft release并上传到原v1.0.0对应release（先检是否存在，不覆盖他人资产）；每项资产与校验清单上传后核下载hash/命名唯一性。全部上述门槛通过再publish；客户已授权测试通过后上传发布，不重复审批。若实测阻碍，保draft或不上传失败产物，清楚报告真实缺口，不把时间压力变豁免。

当前只有实施授权/协调方案，尚无治理清单、实现、CI结果或release操作完成；后续逐项记实际ACK/候选/门槛，不预写通过。

## 实施在途早审：Release集合绑定与公开来源

Governance已实际完成装配两个精准配置文件边界：.github/workflows/release.yml与electron-builder.yml，24项MD/YAML归一镜像及真实parser检查通过，tag完整SHA仍83445ebcf24454c6107838cb7f2221882c6638ea。PM只读当前workflow/prepare/policy/verify/builder，不改同伴源或运行GUI。

当前prepare已固定source_ref=v1.0.0和完整SHA，core.quotePath=false处理中文filelist，git worktree+apply --index+write-tree记录实际组合；policy装配目录包括新增helper，最终精确文件须进实现manifest和overlay。每平台verify校验实际process.arch、解压包、依赖与真实可执行smoke，最低macOS13已声明；Window smoke接线在途不预判其失败。

已向root报告需收口两项：release集合不能仅ZIP=3与checksum通过，应精确三目标darwin-arm64/darwin-x64/win32-x64、每平台manifest及对应artifact file/size/SHA、固定sourceRef/SHA、共同overlaySHA/tree、真实smoke平台/架构/ok/isPackaged一致，错误即不上传。其二，provenance.json/overlay.patch当前仅CI artifacts，Release仅release-*三包；应将经三平台一致性核对的唯一provenance与overlay.patch及校验值附draft，使发布源组合对最终用户实际可取得/可审，不只列提交路径。

同范围建议source_ref经env传入script而非在shell命令直接插值，校验不能晚于shell解释。保root既定publishfalse→draft→所有native/独验gate→root UI publish，不以publishtrue重跑触发重复资产或覆盖别的发布。不扩新增部署/更新服务。此处是早审缺口，不是CI/Release失败已发生；修后需实际证据，当前不封板。

## CI前只读早审收口

当前状态：ready-for-CI（不是Release verified）。PM已实际重读补后workflow/release-policy/prepare/assets/provenance及packaged smoke字段。原tag再次实际解析为83445ebcf24454c6107838cb7f2221882c6638ea，未移动。SOURCE_REF经env传入，脚本固定ref/SHA；中文path未quote，新增自有helper在overlay选择范围，空overlay不会误取全diff。

此前两项实质早审点已落实现：release-assets校验精确三manifest平台架构与文件名、实际包size/SHA/独立checksum、共同source/overlay/tree/lock/builder/patchhash、GITHUB_SHA与overlay一致，以及真实packaged smoke checks和native依赖探针；三份平面provenance artifacts与patch一致后，公开overlay.patch/provenance及其SHA256随draft上传。workflow路径与平面artifact布局相符，不再只以zip数量视为平台验证。未见新的阻止candidate commit/push并启动三CI的实质实现问题；不要求等CI通过才允许pushCI。

root报告最终Node1395总1394过0失败1平台skip、typecheck0，装配70/UI44/Window15/Codex25及实际Electron CLI离线验证各按producer归因；这些是源/本机阶段，不是三个发布包通过。当前本机含工作区源码ZIP未有冻结tagoverlay provenance，不能用它替最终产物；下一步candidate提交后实际prepare→组合源码打包→原生smoke→三CI→root独立包/UI验收依旧必需。默认publishfalse先draft，所有gate通过后root按既有授权发布，避免publishtrue重跑资产冲突。未签名/未公证及最低macOS13透明，不以本审查宣称Windows/x64实际运行通过。
