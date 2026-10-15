---
id: v1-release-packaging
type: change
title: v1.0.0可审计跨平台打包与Release协调
created: "2026-10-15"
status: verified
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

## CI1 Windows首红与必要跨平台测试维护

root已保CI1 Windows29fail完整日志ci1-win-regression-red.txt；两mac全仓1394过属于各自实际平台，不替Windows通过。PM只读核accepted B2第63段和实际Provider：Windows明确UNSUPPORTED_ENVIRONMENT，不降级realpath读；这是客户已接受取舍，不能为了CI绿更改安全Provider。发布说明须显式Windows来源文档阅读暂不可用，其余主流程仍需真实包smoke。

最小owner分工：装配在checkout前禁autocrlf防CRLF改变固定资源SHA/源构造断言，own loader绝对路径用fileURL；Codex自有wirefixture以process.execPath显式起脚本，不把POSIX shebang可执行性当跨平台事实；Pi自有终止用例按Windows真实行为保abort/退出/无后续调用断言，不强套POSIX SIGTERM名称；Window自有boundary path oracle用实际平台路径规则；Window受限文档project/interface测试保POSIX全原安全断言，Windows执行明确unsupported/no mint refs/无任意读副作用分支，不删除安全守卫、不全局跳过。root只改自己T1 fileURL与文档平台负例；若UI自有同类oracle需维护由原UI owner写，不跨修。

这些均为用户已授权发布测试发现问题对应owner修复，必须各自原scope及必要证据，不新增接口/读取支持或架构。精确实际变更由owner manifest列出；首红保留，Windows完整全仓及最终实际包验证均重跑，不改CI为窄专项，不skip全部Windows测试。源码/测试oracle若不符上述分类需先实证而非为了通过按结果改断言。当前Windows gate未过，Release不得publish。

## CI2前夹具修复回审

PM只读当前diff与release-policy，确认此批不改运行时/安全Provider：LF配置在checkout前；装配--import及动态import均pathToFileURL；Codex只精确拦该fixture的spawn并以真实Node子进程启动、断实际pid/一次launch，原JSONRPC及取消断言保；Pi用真实native termination probe区分POSIX signal与Windows数值退出，仍验证失败、输出和真实终止，不无条件放过；Window路径oracle平台化，POSIX读取/竞态守卫全保，Windows执行UNSUPPORTED_ENVIRONMENT/no scope/refs/无读取等明确负例，不删除测试或全suite skip。

policy精确文件补收Window三测试、Pi一测试、root两测试，装配/Codex原目录选择已覆盖其自有修改；新helper/原中文路径处理保持。发布说明/README明确Windows来源文档阅读暂不可用，未暗示支持。各owner专项及root8负例通过按原producer记录，不冒称WindowsCI已通过；CI1两mac原生构建启动及本机实际tagoverlay配置保存重启/Esc/键盘/缺配归root证据。

结论仍ready-for-CI：可在最终full/typecheck收口后提交/push/派发CI2，不需等待尚未运行的CI才允许启动；三平台最终source/overlay/产物manifest一致与真实Windows包smoke门槛不变，默认draft不publish。PM本次未执行测试、GUI或修改peer。

## CI2 Intel确认暂停用例的确定性时间订正

root报告Windows全仓已绿进入打包、arm64全绿，Intel仅root自有T1 confirmation集成用例100ms deadline被真实IO/调度耗尽。PM已读该用例，当前await pause180依赖墙钟速度，实际目标是证明等待客户暂停deadline，不是测试CI磁盘性能。不能增deadline或靠重跑遮红。

同意root仅own t1-pipeline-integration.test.ts对三runtime confirmation case采用显式Date/setTimeout虚拟时钟：保原100/180阈值、真实Pipeline/FS/事件/hostgate与全部abort/stale/写许可/报告断言；启用在Core创建前，逐case隔离清理，不靠stop/error文本。观察循环用未mock setImmediate/performance及真实外层10s watchdog；必须同mock clock增加不进入客户等待tick100仍Core timed_out负对照，防时钟不生效或伪永不超时。原30ms真实timeout用例不变，不修改生产。仅订正逻辑时钟的可控输入，不放宽业务行为。装配policy逐文件增该自有测试，保首Intel红，最终三个平台全CI重跑；当前Intel与Windows包gate未签通过。PM仅只读审，不替root实现/执行测试。

CI3前PM已实读最终root own diff：原100/180/5逻辑数值及全部业务/历史断言保留，mock在创建Core前生效，真实performance/setImmediate观察+10s外层限时，三runtime逐例99未settled+1到100真timed_out/单failed handback/无src写入负对照成立；原30ms真实timeout未改。root自验8/8按其执行归因。新增负例首红为handback与settled异步到达顺序，等待两者到齐再严格各1并非删除断言，原红保留。结论ready-for-CI3，同一overlay完整三平台重跑；生产deadline未抬高/归零，未新改产品合同。PM本次未运行测试或改同伴代码。


## CI3最终发布前回签

PM实读root ci3-results.json、三个ci3平台manifest、expected-source-tree.json与原RELEASE_ASSET_SET_VERIFIED日志：CI run 38728387848三原生目标构建及解压实际包启动均成功；mac两架构各1401总1400过0失败1平台跳过，Windows1401总1399过0失败2既有POSIX前提跳过。七UI checks全true，实际isPackaged/平台架构、Pi+Claude SDK/Photon WASM、Codex0.162.1、Claude2.1.299可执行结果齐全；不外推在线模型或所有OS版本。

三平台manifest统一source83445ebcf24454c6107838cb7f2221882c6638ea，overlayc3d106602b5a82fc5fa7e1bd9e1d7485239d8b4a，actualTree15427e074c23ad1d4b52d0b191f57fe3bdeb5167，patchSHA256 a7297f345b371754ff07f4165b54d9159a1f0846e6758c27220803660432f45c，与root独立Git blob/mode/path树重建及算法自检相符，lock/builder一致。各ZIP file/size/hash在平台manifest与root汇总一致，集合校验真实日志过。原tag保留，未把overlay冒称旧tag原生内容。

结论ready-for-release，非已公开：所有既定平台CI/来源/包启动gate已具证据，root本机实际包设置保存/重启/导入/Claude缺配/键盘回焦既有验证不冒充Windows手动亲测。root可按客户已授权打开draft核12资产（3ZIP+3manifest+4SHA清单+provenance+patch）、未签名/未公证/macOS13/Windows来源文档暂不可用说明后publish，无需新许可；若缺资产则停在draft修复。PM只读审计，未GUI/改peer/触发布。实际发布URL与公开状态到后再将本记录verified。


## 实际公开发布与最终验收

root已通过GitHub Web UI实际发布[ANS Studio v1.0.0](https://github.com/wangzhongren/ans-studio/releases/tag/v1.0.0)，owner页面Latest/released且无Draft；另用显示Sign in的未登录浏览器确认公开页面可见，证据release-public-guest.png及AX由测试角色留存，不归PM亲自网页操作。公开14资产为12上传资产及GitHub自动2源码归档，不把自动源码包冒充已叠加构建源。

发布前root核对三个ZIP的GitHub服务器SHA256逐个等于CI3原生manifest，证据[github-upload-digests.json](../../../测试/docs/change/2026-10-15-v1-release-evidence/github-upload-digests.json)，最终CI3结果见[ci3-results.json](../../../测试/docs/change/2026-10-15-v1-release-evidence/ci3-results.json)及[运行记录](https://github.com/wangzhongren/ans-studio/actions/runs/38728387848)。发布说明明确3下载链接/解压、各平台真实测试数量、固定source83445加overlayc3d、自动source zip复现需应用公开patch、未签名未公证、Windows受限文档不可用与离线包smoke范围。

客户已授权配置、打包、测试通过后上传Release，本轮对应治理/实现/各平台回归与实际包启动/独立审计/公开发布均已完成，PM记录verified。未移动v1.0.0、未改发布资产；PM本次只更新自有文档，不额外测试/GUI/改代码。此前ready或未公开描述为阶段历史，以本节为当前状态。
