# Git能力运行时整合 R7

## R20 host文件阶段实现

沿P8/G15，仅原runtime Model、tools/schema、Service公开inspect及已授git-capability/write-gate-context测试。host-facts-v1明确opt-in：Provider私有发行同invocation/op/path/stage/双root/保护snapshot上下文，只在当前同步gate窗口供Service验真并复制普通facts；old allow不验发行身份即拒。canonical元数据与currentFile字节观察在Provider，G纯策略只消费事实；授权前content-read零次。Model/schema不接hostfacts，末保护/链接/nlink/BOM/parent/atomicRename均保留。O消费者未切前不称旧同步IO已迁完，非受管legacy不改；生命周期dispose/pump/registry零delta。

证据统一追加既有r9-normal-tests.txt，wrapper自身保START/PID/完整stdout/stderr/CLOSE exitCode/signal与候选hash/预算null。首npm.ps1执行策略拒、受限junction EPERM与测试scope误当目录的首红均留；scope改真实精确文件集后writegate11/11正常CLOSE0。第一两file组合在开发cwd受真实保护scopeunknown影响旧8fixture前置红，未改旧断言/生产策略；改用新owned独立unmanaged cwd、绝对原testpath，同候选44/44自然CLOSE0；真实默认Core/defaultChat＋O实际ownedrepo保护回执/双root写edit六阶段已通过，本地HTTP只替推理。完整type npm.cmd run typecheck CLOSE0。后增全部reserved hostkey完整性case原红保留；Q19明确解源窗口后仅补原tools/schema两list的7键，已核targetPath非原path/file_path/filePath别名，不误拒合法alias。最终同两file仍44/44自然CLOSE0/signalnull（27552→16100，UTC00:44:44.060→.931Z），type0/diffcheck0。最后Model566FC246…08EDA/tools9537371F…BB01/schema5062A835…4772/Service08660220…C140B，完整hash由同wrapper持久记录。fileSafety705D…0AEF1继续只读，无owned在途；默认off待O真实caller接，不宣旧IO全移除或生命周期修复。

固定运行时核心；G-T1正式派发，沿P2/G-C1与原T1/T1.1。检出HEAD77945d9加保留旧/当前差异，不清理或归全部差异为本人。先完成同fixture正常环境对照/真实shell原语探针；再只在原trunk/runtime Model、schema/tools/Service授权范围提供3Fn及严格工具，新测试仅git-capability-tools.test.ts，原指定测试按影响复用。无新生产文件、Git Provider I/O、OS sandbox或权限扩大，不开发仓库commit/远端/模型。

Git DTO采G-C1§1：GitOid完整objectFormat+hex、GitBasis、GitEvidenceRef、三结构化Request/Fn及七状态结果。工具git_query/git_candidate/git_publish只注入才注册、可信scope门控，不接argv/env/dir/host repo/task/run/actor/authRevision/ProtectionFacts。所有Git效果仅调O注入Pipeline能力；候选prepared不发布，pending-recovery不伪旧值未变。host核整个差异/当前授权/ref/隔离证明，工具参数不是授权。app专属ref与字面相对path做最窄形状检查，未知字段/短OID/修订表达式拒绝。

精确检查node --test test/runtime-core/git-capability-tools.test.ts、npm run typecheck；变更本层共享签名后O/G/W重测caller，局部绿不当全Git ACL或四闭环已完成。前置探针/evidence见同日git-role-permissions-evidence，修改能力在对应surface缺证时由O Service failclosed，不全局关shell冒充完成。

## 实际结果

Model/工具实际签名见[api R7](../../api-spec.md)。G-C1普通实施复用P6审结；新增实例inspectToolSurface普通事实已获统筹明确同scope细化，当前源码零新生产文件。

- Node24.22.1、Git2.55.0.windows.5、Windows PowerShell。`node --test test/runtime-core/git-capability-tools.test.ts`exit0，8/8；最终`node --test test/runtime-core/git-capability-tools.test.ts test/runtime-core/direct-role-capabilities.test.ts test/runtime-core/submit-capability-tools.test.ts`exit0，41/41，0fail/cancel/skip，317.0177ms。主`npm run typecheck`exit0；六文件diff-check0仅trunk CRLF提示。测试覆盖注入缺席/可信scope/host未知字段/嵌套拒绝/完整OID/pathspec/职责门控/真实published matching/pending与晚abort，以及真实Service registry无shellGate时sync/background不注册，registry没有升级native/FS安全。非完整业务ACL/四闭环证据。
- 最短探针脚本/原报告在[本轮evidence](2026-11-05_git-role-permissions-evidence/probe-git-metadata-result.json)。受限首轮在产品入口前git init128 .git/config Permission denied，见probe-restricted-first-error.txt，不能当产品隔离。正常首次同fixture unmediated对照+真实sync/background可写gitdir/common-dir marker，primaryexit0，原报告保probe-git-metadata-result-initial.json。最终源码正常重跑同脚本exit0，fixture为Temp/ans-r7-git-probe-1rfc2Y；全部argv、before/after原字节hash及实际子进程终态在当前JSON。仅临时真实repo/init/首empty commit/linked worktree，无开发Git/远端/模型。shellGate显式fixture allow，只证明获准脚本primitive能力，不冒完整六角色绕行实证；native未调用，FS confinement未知，R6终态不当沙箱。

| 当前六文件 | SHA256 |
| --- | --- |
| src/model/runtime.ts | 8C2A919FB4DB73629CCE959574FCEE288BF9F8B8A866D244D19762DAD9B36FCC |
| src/model/trunk.ts | 7534EE53C142643FEEE7CAF49AAFA8671A203874A0D8CD32F71F49AF6097D4B4 |
| src/provider/runtime/schema.ts | 9880D450E21E40BB144CC1B5969DB37B97D13109CB0663C52023EA9A23DD4B62 |
| src/provider/runtime/tools.ts | 93A4B3D9C850BF405AF14CDCDA126E12D22944B63B5121EEFB25F9D88A8F7FF0 |
| src/service/runtime/session.ts | E56F5A870C2DAA4B5BF0239DA215160470824AF623117DA2BB58EBC9AC452A65 |
| test/runtime-core/git-capability-tools.test.ts | 64A32AEAE0C2F2C29D87F2AD65F78E7CBD4557176771D51F0D811A4CD00D6476 |

聚合E13859089A254A4A0FF41F5BEC17D7E810B8A1DC87803A2CE859FA9008CE41CE，算法同原轮：相对path Sort-Object升序、path空格lowercase原hash、LF无末尾LF、UTF8无BOM后SHA256，仅六文件非全组合候选。旧差异保留不归全部为本轮。

## 两条后继能力边界

可继续核的最窄生产面：Service providerFor真实registry→Codex生产Chat分支（provider/codex/session.ts:425拒外来MCP/WebSearch并只传options.tools，chat-transport无app-server）。它还需要G/O/W实际装配配置、注册闭包、跨所有dispatch旧在途handle及file/edit对规范gitdir/common/他人worktree的硬保护证据；不能凭demo/script名或fixture-deny推出J03/四链已成立。Pi noTools:builtin仍有外来MCP分支；Claude有动态MCP/WebSearch分支；Codex Responses的只读sandbox参数亦须enforcement实证，未证路径修改保持blocked。查询/O基础可并行。

必须脚本的worker/质检面当前**尚无选定可行机制**。现Node spawn同user、buildShellEnv只去凭据，Job终态不等FS隔离；同user deny ACL能否被脚本改回未证。有限待原Planning研究的问题仅：本Windows部署如何让全部后代获得不可提升且不可改保护ACL的执行身份，同时保留O Provider合法Git写，以及Node/Electron具体创建方式/所需运行权限。拟最小新增Provider桥接src/provider/runtime/windows-protected-spawn.ts当前不存在且未获§1授权，R不写；旧接点tools/session；后台实际spawn源common/runtime-core/background-tasks.ts是R原owner，但本G-T1未授改该源，后继应接合法Provider能力，不在common新增OS I/O。三native/MCP spawn由各原owner给同机制或实际禁用物证。若需native helper/依赖另列真实路径delta，不虚构已有组件。本节点不自写研究方案、不全封shell称完成、不省真实worker/质检/验收链。未独立验收J01–J16，未提交开发仓库。

## R8实施前native工具面consumer窄合同

统筹正式续派，复用T1.1原Codex producer及R既有runtime/session必要观察，零新source/权限/Gate。只写Model/runtime、Service/session及本人两既有测试/短文档。统一可选native工具registry事实port给Codex原owner；Core绑定实际默认生产factory选择（providerFactories override不享默认生产provenance）、nativeLifecycle实例/role/runtime/实际options.tools与MCP registry；错绑定/未证branch/disposed保持unknown，FS始终另unknown，不造全项目safe票。仅负面consumer定向＋TS/hash即可交，Codex真实Chat factory/本地HTTP替推理正例由原owner另节点完成；本节点不冒native producer已实现、不把忙HTTP模型等同未受控执行程序。

## R8短交付

统一可选producer port与consumer规则见[api R8](../../api-spec.md)，Model签名已提前给统筹并交原Codex，未代写其源。Core把真实factory选择记录为default-production/custom-override/demo，非配置字符串或fixture source；初始Core registry快照与实际当前registry及native toolMap必须一致，instance/role/runtime/MCP/HTTP lifecycle/owned程序事实绑定；不能因空registry就safe，FS恒unknown。HTTP推理在途与未受控执行程序分开，不要求busy chief全idle。数据均拷贝，不返回工具/函数/全项目票。

最终`node --test test/runtime-core/git-capability-tools.test.ts`exit0，11 tests/11 pass/0fail/cancel/skip，246.3653ms。新增3个R8 consumer行为场景含override冒默认factory、12组registry/身份/生命周期漂移与builtin/MCP/shell、复制后不能改producer、disposed、在途HTTP不假作程序；这些都是负面consumer验证，不冒三SDK正例。`npm run typecheck`最终exit0；三文件diff-check0无输出。中间Model增加factoryProvenance后Service暂缺字段、恶意测试对readonly数组直接push曾各有一条类型诊断，已同scope补producer字段/显式测试cast保原断言；最终未放宽规则。无应用/真实模型/远端/dev Git写。

最终原字节SHA256：src/model/runtime.ts `37917B6A802D286739277A4EA0BDA93B4B7E546FC07F7A40C772E9E58563DAA0`；src/service/runtime/session.ts `C2EBBAAFDC49F3E5575D0202613ED105C3A0234114AD5614B09F4A97C8EE6622`；test/runtime-core/git-capability-tools.test.ts `FE9C800335AAAC07421CD9DD4BCEF04AB3E1E9523F21BF09411DDC0D5F074D36`。三聚合`EBC616681DE77E5B9A0EB4B79457F687AB94E2B232A2CE4A94DBB4148CEDF732`，同前path排序/空格小写原hash/LF无尾LF/UTF8无BOM后SHA256算法，非全组合候选。

Codex原owner另做真实默认factory+本地HTTP仅替推理的producer正负例；R本节点不等其正例。O/W须枚举跨整个团队/dispatch的实际handle，漏/旧在途不可放行；G/O file/edit规范gitdir/common/他人worktree与hardlink身份仍须真实物证。application-mediated工具闭包不等OS沙箱或四闭环已验，不省worker/质检/根独立验收。本节点即释放。

## R9 实施前最终文件IO保护合同

统筹正式续，root同G-T1原runtime/tools/session必要细化；不新源/OShelper/权限。host protectedGitRoots?:readonly string[]统一加GovernedToolsOptions/RuntimeProviderOptions并由Service同名透传，模型write/edit参数不接受/不覆盖。最终生产write_file/edit_file在目标读取/原子写前保守拒绝nlink>1、.git词法及严格canonical host保护根（gitdir/common/其它worktree），在建目录/重授权后紧邻原子写再核，不替换原fs安全原语。host roots完整性由O真实readGitProtectionFacts与当前basis另证，本参数不授Git权/不自动complete；仅给版本化mediated guard观察，FS仍unknown，路径式复核未消除全部TOCTOU。真实hardlink/junction对照、生产allow-gate下拒绝＋原字节不变和普通文件成功用既有git工具测试验证，外层EPERM保留后精确normal环境重核。不改O/G/native/开发Git/远端/模型。

## R9 短交付

实际仅三原生产源及既有Git test改变：host根克隆冻结、write/edit读取前/建目录前/二次gate后紧邻atomicWriteFile的nlink与canonical防护；strict realpath仅ENOENT找最近祖先，未知身份不放行。原fs-write/atomic-write安全原语未修改。Service绑定实际两工具及handler身份，实例观测fileWriteProtection机制canonical-roots-and-nlink-v1/根复制/rootDiscovery，rootCoverage和filesystemConfinement恒unknown；空根不推complete，无schema授权/无全队票。

最终正常精确`node --test test/runtime-core/git-capability-tools.test.ts test/runtime-core/submit-capability-tools.test.ts`exit0，36/36（Git14、submit22），0fail/cancel/skip，395.7455ms。真实fixture `C:/Users/51054/AppData/Local/Temp/ans-r9-files-ggn1ci`仅本轮owned repo：真实Git init/empty commit/linked worktree/separate gitdir；同身份unmediated硬链接和junction control写入成功并恢复，生产allow-gate write/edit仍拒，原字节/hash不变；singlelink canonical目标别名和host根自身junction均拒；普通授权文件write/edit成功；gate中追加硬链接在最终复核被拒；尚无.git新repo不被文件工具创建metadata；Service快照不被host数组改空/返回facts改动，dispose撤观测。完整argv/fixture/hash/结果见[r9-normal-tests](2026-11-05_git-role-permissions-evidence/r9-normal-tests.txt)。首restricted Git init128和首测试API/普通写失败原件见[r9-first-restricted-errors](2026-11-05_git-role-permissions-evidence/r9-first-restricted-errors.txt)；修正测试Promise API并仅加真实失败message，未弱化安全或断言。正常环境对照排除外层sandbox拒写当产品保护。

最终`npm run typecheck`exit1，仅O在飞`src/provider/trunk/public/trunk-store.ts:30` TS2724 createProjectTrunkStore暂未导出，已交原owner；早先O七条DirectActionSource字段缩窄红后消，R未跨写。原输出见[r9-final-typecheck](2026-11-05_git-role-permissions-evidence/r9-final-typecheck.txt)；本四文件diff-check0。四文件原字节SHA256：runtime.ts `86B4B15872D8BFAEE52B3247ECAB6FF67E04774F26330DF6ADDDD343FD15A48F`；tools.ts `90E74B006DC3B80461F5AAB98415A37F52BB83DB8F6E3E025AC85F4D211ADDFB`；session.ts `A6A9F6389FCED59F1FCEE5452C08E08C4917E299F844629615E087F9FE4171E8`；Git test `E549B8BD0285B437E51B17E0345B493D9CD120E45F1D67EBB4FD1E2EF5ACD51C`。旧差异保留，不把整个diff归本轮。

仍有路径式检查→共享原子写open/rename的TOCTOU窗口，不是OS沙箱。O root发现完整性/新repo真实init后的自定义gitdir发现与current basis由O后继实际核；本轮新repo仅证文件工具拒假init，未冒生产Git init成功。其它确切写入口：request_download只转注入能力，Pipeline最终经`src/provider/download/impl/file-sink.ts:142`在projectRoot/download以wx placeholder/part和handle.write/rename写盘，有单文件名/真实路径/symlink约束但不收本host roots；若gitdir/common真实位于该download根，不能凭本两工具守卫宣FS闭合（未实证绕行）。`app/desktop/session.ts:3494/3504`的installSkill/installMcp转applySkillChange/applyMcpChange，也不经writeGuarded，安全完整性未研究、交原owner。shell/background/native/MCP与跨团队在途须O/W/G另核，不省worker/质检/四闭环/根验收。不应用/真实模型/网络/开发Git提交。
## R10 实施前host工作来源窄合同

统筹正式续原runtime.ts及既有Git test，复用原G-T1/P6同范围审结；只补TaskCreatedEvent可选host workSourceRef和单一纯形状校验，不改工具schema/持久化/Task引擎。TaskWorkSourceRef严格四字段kind=chief-customer-turn、sourceId=O现init-source-64hex、path精确应用initialization-sources同id.json命名空间、sha256完整hex；不含TaskID/批准/权限。旧无字段记录保持原语义，引用不授派发权、不代parentTaskId，flow/已接受Turn/内容/operation去重由O/W真实读写重核，不从模型透传。先冻结字段给O/W，再仅纯正负例/类型/hash短交。

## R10 短交付

上述四字段/可选event字段/纯guard已实际导出，签名先发O和统筹；sourceId与sha256加精确长度，防JS末尾换行宽匹配；sourceId/path严格对齐O当前fs store实际回执，无新源/IO/Task引擎/工具schema。`node --test --test-name-pattern R10 test/runtime-core/git-capability-tools.test.ts`exit0，1test/1pass/0fail/cancel/skip，231.7659ms；单用例覆盖完整引用与合法大写hex、缺字段/伪kind/错id/错路径/ADS/越界/错hash/末尾换行/额外批准与权限字段、旧Task保持无字段。`npm run typecheck`exit0；两源test diff-check0。本节点无首次红。runtime原字节SHA256 `6BB0E26D5A3D4ED9D910C68D7AEFF09D247AF84115A90B572A948A68DA1C7C79`，Git test `793386C622149E6C94E23BC13D7907819D3ECC431CB08AF17ECB390D794FF744`，保所有先前差异、不冒全diff是本节点成果。

纯形状不证明引用bytes/registration/accepted turn/currentflow或授权。dispatch当前source/selection由O/W核，真实childtask创建后保来源、不因父chief自然settled/换焦点误撤；执行按childtask/live授权/注册根/取消收缩，孤旧Turn无childtask不可重放或跨flow新授。本节点未改O/W持久化/parser，未真Git init/四链验收/应用/远端/模型/开发仓库写。

## R11 实施前dispatch host字段预拒

统筹正式续原tools.ts/既有Git test，root明确同G-T1已定host边界必要细化。W5真实HTTP首红为模型workSourceRef被白名单丢弃后仍派一个真实child，未消费伪ref、不等授权绕过；本节点只在dispatch_task原始args入口显式拒有workSourceRef自有字段（含null/undefined），callback必须零调用。不改Model/Schema/业务权力或泛化legacy参数；正常dispatch结构及requestedEvidence普通文本含ans-work-source前缀照旧透传，不当authority。最窄纯工具正负例/类型/hash后交原W重核真实HTTP。

R11短交付：以上原始args预拒已实际落在handler入口。精确`node --test --test-name-pattern R11 test/runtime-core/git-capability-tools.test.ts`exit0，1/1、0fail/cancel/skip，230.8561ms；六种模型值undefined/null/false/string/空对象/合法ref形状全host-only拒/callback0，合法正常字段含普通证据前缀callback1且deepEqual原args。`npm run typecheck`exit0；两文件diff-check0。本节点无首红，W5真实HTTP4/5原红属原W证据未改、不冒其后继真实五分支已过。tools原字节SHA256 `8E7121E8D284E9E3BBB74B50FC296FC4AEFE7EA80D25504186504D143F23DC2F`，Git test `039A51B8231B9164FFC91043650DCDDA45F3FF02DDA4993BAC9F71B9592C622D`。签名/准确hash已交O及统筹续W；不动Model/其它owner/真实应用、模型、远端或开发Git。

## R12 实施前构造计划与Core库存合同

正式续原Model/runtime和Service/session。先冻官方native pure factory plan producer，不调用未知custom来探安全；Core保私有prepared handle/one-shot token，普通facts无secret/credential/env值，配置/身份漂移拒绝。新增全本进程Core生命周期registry（含judges/creating/dispose），不冒OS/历史/外部native完整库存；共享host lease沿O同一个Provider协调器，不另锁或上调Interface。仅本consumer负例/无效应计划/库存及类型短交，Codex真实resolved配置producer由原owner后继。旧R9/R10/R11与真实Source/childtask生命周期不变。

R12短交付：实际新增API/状态见[api](../../api-spec.md)，native签名先交统筹排原Codex；Core无自造官方正例，无Model Tool字段。已接O实际唯一Provider begin/end/check/interrupt及readGitHostProtectionRequirement物理state/revision；普通begin/end真实变化使旧proof失效，Core不造第二锁/不回调Interface。受管范围连平时legacy都自动要求官方preplan，custom/demo和未知scope构造前拒；非受管旧功能未知库存兼容。每次factory/nativebind前实际重核lease/scope；同opaque token配置、角色、factory、planId绑定且一用；实例后验核nativeInstanceId/planDigest/实际toolmap，错误清理并保failed未知。registry含直接shell/governance judge工具模式和解释actor，不限W map；disposed保事实、不冒空清单停稳。

最终精确R12定向7/7、type0/diff0，原命令/正常owned临时cwd见[r12-final-tests](2026-11-05_git-role-permissions-evidence/r12-final-tests.txt)。scope接入后三文件组合54/54、自然exit0、11.579s；之后仅再收紧managed demo拒和digest长度并最终7/7。本轮三个首类型红修注解/保持原断言；scope接入后在开发linked-worktree cwd正确unknown导致2pass/4fail，保[r12-intermediate-errors](2026-11-05_git-role-permissions-evidence/r12-intermediate-errors.txt)，无放宽为允许，改在本轮owned真实非Git cwd核兼容路径。测试脚本身份不当Git安全证明；default Responses pureplan spawntrap0/ownedroot无写、custom prepare0调用，protected真实source物证触发拒/删物证不退。

最终原字节SHA256：runtime `0616403C078A530A98AB45C4F6AED49140E43D32EAEFC978CE08EFCAEFE5CC64`；session `0B66261716B54BD161A748056DA845C5FA03B91B96E50AC95F86C687A6099973`；Git test `68ADC4D8FBC1BE805AE56F198CC496B1BC62390DAAA29A764FF22700E504EB40`。已交O/统筹。Codex actualresolvedChat producer尚后继，W需撤native第二lease由Core持门，O需临界区fresh读Core全部actual registry并核本进程外覆盖/workerbinding；当前这些未完成不宣生产Git可写或四链通过。只原两生产源/既有test与本人短文，无其它owner/newsource/权限/模型/远端/devGit写。

## R13 实施前终态保留与覆盖语义窄修

R14后继实施前合同（同G-T1）：只Service/session与既有Git test，按真实Provider required scope/revision和实际初始工具registry，在发opaque token及任何native构造/bind前拒已证未隔离run_shell/start_background_task；不靠runtime/env/safe bool，不删工具伪装、不全局禁非受管脚本。真实defaultChat/shellGate的required根负例须零native session构造/HTTP/Node marker效果，同真实defaultChat无脚本正例及非受管脚本控制保留。不动Model/O/W/native或新生产文件/权限。

R15实施前窄合同：Service公开零原effect参数的blocked四callback工厂，函数只返回okfalse/effect-scope-unproven，私有WeakMap标真实函数身份，不能调用旧handler。Model仅四callback类型与普通guardfacts；Core依据真正注册的callback身份/role/registry及Core/nativeplan导事实，required未证在构造前拒，漂移保持unknown，不接受caller/model safe字段。四工具仍注册且真调用明确blocked，非删工具伪profile；实际defaultCore/defaultChat localhost正例及fake/替换/漂移负例短交，O邻层组装、W不拿Service effectcap。无I/O/新源/权限/OS/helper/其它owner写。

R16实施前内容gate协议：已授tools/runtime/session及表内Git test继续。write首probe从实际UTF8 Buffer带最终sha/op；edit在任何读前发真实Provider私有WeakMap/path-bound只读probe，Model只phase='edit-read'/op edit型、Service public isRuntimeEditReadProbe(ctx,target)验证真身份供O gate；O仅真probe回原path/read边界，不消费stable写permit，随后实际BOM/EOL最终字节仍strictSHA授权/原最终安全重核。裸/opaque/复制/伪phase/模型host字段不能变allow。旧F6首undefined内部约定冲突透明记录，旧单参Gate类型/直接调用/安全语义保；write-gate-context与file-write-safety两旧test本轮尚未写、delta0，hash A5B85CDF377C19A0B7498F382722F105CEAA49E0346E1B20825FE50321AAC071 / 705D704831D308C8E606846F9E2FB82BC6456E49C10E64C5E4DE627B9240AEF1，因精确表授权未确认暂停写、仅读可运行，等根确认最小差额，不倒填。

R18（11-06）实际收尾：父ref纯Model及dispatch raw/schema host字段拒已冻给O/W，Service零delta；既有write-gate-context获root转明确客户‘确认，仅增补这一测试文件’/15D3B355972D11F30039D0129C0572089FB032EFA1CC83779985097AB656651C后首次维护，保finalSHA/BOM/legacy/拒写/私有readprobe鉴真，A5B85…AC071→5668E13FFA54BBEC160094996EEC2AB69F2BCE55266250A223771C142A8F086E，旧两协议红现5/5。fileSafety705D…0AEF1全程只读，旧EPERM单列不冒通过。parent合法/非法形状、生产raw所有值预callback拒、真defaultCore/defaultChat HTTP送出not schema与模型JSON伪parent零callback/正常1callback已实际通过。完整Git32+writegate5=37/37自然exit0，686.2351ms，type0/diff0；无新增skip/放宽断言。

原命令/source/test hashes/开始结束/完整stdout/child真实close保既有[raw wrapper manifest](2026-11-05_git-role-permissions-evidence/r9-normal-tests.txt)的R18段：wrapper8148/child5556，23:29:17.087Z→.811Z，exitCode0/signalnull/deadline null。最终Model3B053C4002DCCC246B313F2A8775C93401D727A19AFB44DECDCCE4A2B877D15E/tools0647F820F53B6A0542292BBDEF5A7AE678DE169543D82DB673A33F47260BFC6C/schema8E9E83914C66AAFB93885F3C1396FB293B01733F851CF428DE379BA9E863FF5E；Git test5A1323EC621C67154532B6CABB3037A94F2BD551B0A59E286C0222EB4E9FB151。下一实际parent CAS/worker正例由O/W后继，本轮不造task/批准/source，不动其它owner/newpath/权限/真实模型/账户/远端/devGit。

R17实际记录（2026-11-06）：按派发先冻结生产，session D795…54DD、Model8710…9241保持，表内life先真defaultCore/strict defaultChat localhost+persist busy→abort/dispose→await真实prompt，旧registry仍core-turn-not-drained冻结，bounded观察失败；纯context无constructor事实、custom实际owned marker写后throw无区别字段，共3test/0pass/3fail、1269.2718ms，正常exit1，未强退。Q12采集结束才解冻；真实首拒为Desktop git-host-admission-in-flight，两open-failed partial-construction无CoreID，不冒disposedunknown已是首cause。原Q proof SHA5FDBF8860C45664018DAC78BFC400AB509B1744BB12C10EC9DB55831F785B3F5保持不写。

新增普通construction/三Service端口详api；私有same-error/same-preparation/当前planId关联、撤原provider tokens，可信pureprep且两入口未触/pending0才never-started；custom真effect/timeout late marker持续possibly-started，actualbound需同Core真实terminal，所有行保留不按root/role/state删。busy关闭后保真实observer并按raw/underlying/pump/重放/报告投递保存callback/Core最后drain刷新，非等待同prompt结束才执行别的tool。最初两段四R17 4/4/type0；必要完整`node --test <absolute git-capability-tools.test.ts> <absolute session-lifecycle.test.ts>`在owned非Git cwd Temp/ans-r9-final-edYX1T自然45test=44pass/1fail，11718.0273ms：R12 stale token错误后新的auto-seal连带撤新plan，原git test331 runtime-prepared-configuration-changed。原失败保留，未删断言；仅current same planId才seal且actual stale preparation不能discard新plan后，精确`--test-name-pattern 'R17|R12 prepared identity'`同两绝对路径5/5、0fail/cancel/skip，336.3938ms；npm run typecheck exit0、diff-check0。其余life16在完整运行均通过，含真实owned Node树未知，末窄修后只复核影响区，不冒完整45当前全过。

最终Model SHA526BA844C2BD524E758520E3F58BF00EE92667495137BEF924ECC94BBEF9D7AD；Service/session EE9548C647767F1EDD858BA5747DF54BB6916FCEE0AA1F0DC993C108958A8848；life test8C79D0575279CE83ADDBE61DB1309A3B9D7828D10EF8220F9A2210D6EB30DEAB。源码重冻已通知统筹/O供W唯一hostHandle桥和Q新窗口；旧两个caller test仍原hash/零写，15D3确认未到不动。无其它owner/newsource/OS/权限/真实模型/远端/devGit写，不冒public首workflow/独验T3已过。

R16短交付：上述生产口已实施，O已接真probe验证后return原baseGate(p,context)，final hash/permit不放宽。表内Git新3test真证UTF8/BOM/EOL首末SHA、read授权拒实际readFile0、伪host参数零gate、copy/跨path/opaque/hashless不能放、错误最终hash/末permit撤销无写、legacy单参Gate与defaultCore真实afterwrite1；R9末gate新造hardlink断言按第二真实content probe维护，未弱化。精确新R16 3/3；最终完整绝对Git test在owned非Git cwd Temp/ans-r9-final-edYX1T正常exit0，29/29、0fail/cancel/skip，679.3012ms，diff0。主类型最近实际21红：O run-role.ts1047 abs两处、git-trunk-store.ts704 Buffer/string1处，G stable-initial-workflow-publication联合18处；无R红，O后已回报其3处修完、余G待补，不冒全TS0、不跨修。

两旧test只读原运行`node --test <absolute write-gate-context.test.ts> <absolute file-write-safety.test.ts>`exit1：16=9pass/3fail/4原POSIXskip。F6两首undefined原断言分别实际拿到{contentSha256:f075c7793e2a3429d0fc0136ecb9d5dc51b9202f24b568f7d3be447f7b2a239b,operation:write}及{phase:edit-read,operation:edit}；旧Windows file symlink在file-write-safety:105报EPERM，junction/普通写/末gate deny/throw/abort/parent drift等通过。两文件本轮零写、原hash未变，精确scope确认仍pending，不改/删旧安全断言或倒填授权、不宣全测通过。

四候选SHA：runtime `871049BBA11A8E2111184B6BBB9AF7B86DCDBBE7552F4F3EC39BF95DCAB69241`；tools `58F2102A256B17A5D86E57F48D10A42E5284155019E6572EE29F5896D40BD96E`；session `D79537A0B23A932BA611B5FF49765E22C2B36FA08BC6895DAAC92879438754DD`；Git test `9437F8A8B27A549CBCB8349076A6BF5F9C3C96CFD05A6D73CB7C625D53AEC409`。源码/纯协议/桥接与证据已交统筹/O，后继根确认两旧test差额及G联合/真实workflow消费另节点；未改O/G/W源、未造Model phase authority、未真实模型/远端/devGit写。

R15短交付：可消费factory/普通facts及严格绑定见[api](../../api-spec.md)，签名提前交O与统筹。实际仅Model/runtime、Service/session、既有Git test和本人现有文字，零新源/文件/权限；WeakMap只Service私有，returned四Fn无原callback参数且只显式blocked，四工具真实保留。required无可信四Fn身份在token/构造前拒，current scope/revision和真实初始registry在effect前复核；角色/整handler registry/callback引用漂移unknown。Model Tool schema不新增host guard参数，model伪guard不参与事实，原payload白名单仍只roleId/name；实际四工具调用仍blocked不授效果。

真实正常owned fixture：`C:/Users/51054/AppData/Local/Temp/ans-r15-required-ISj5mP`，strict defaultCore prepare/one-shot bind→defaultCodexChat localhost HTTP，仅推理本地替代，无factory override。四实际registered install_skill/uninstall_skill/install_mcp/uninstall_mcp经同prompt真调用，4 tool receipts均effect-scope-unproven，oldEffect spy0，实际native构造1/HTTP2，目录/全部文件和登记内容sha前后一致；guard/session/role/Coreplan/nativeplan/configDigest/registryDigest精确对应，拷贝改动不改真源。fake同名+可变guard属性+options forged facts、错槽、afterprepare替换/role漂移先构造0/HTTP0；实际unmanaged Core callback和registered handler替换后factsunknown（custom/global surface仍未证），没有把名字当闭包。新定向`node --test --test-name-pattern R15 <absolute Git test>`2/2 exit0；最终完整`node --test C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/test/runtime-core/git-capability-tools.test.ts`在owned非Git cwd `Temp/ans-r9-final-edYX1T`自然exit0，26test/26pass/0fail/cancel/skip，627.1875ms；当前npm run typecheck exit0，三文件diff-check0。本节点无首红/无断言放宽，所有原首红保留原位置。

最终SHA256：runtime `BF88C33E442143518EAFA2DDAD54B46D64C269F0DA1BF3F10DCB6FBDB5018246`；session `1E54F5290C7A843660526BBDFF18BE604777768AF3C598F9B4B35F1498DE9CF3`；Git test `D133A0969D9CCB8DAD6EAB0A6CD6CA60AAB52A816C404507C4E6E4992A161E38`。O后继真实内部装配/严格消费guard事实，不四名字白名单；W不deepimport Service/O Provider，原R14/rawscript/所有actor作用面/roots/unknowncustom/Source/lease保持。未启动真实模型、远端/开发Git提交，未冒active/全部worker/质检四闭环验收。

R14短交付/原结果（不新证据文件）：`node --test --test-name-pattern R14 <absolute git-capability-tools.test.ts>`首轮exit1：actual plan status `observed`≠expected `unknown`，test:68，1test/0pass/1fail，220.6777ms；此前未构造任何unsafe实例。实际session修复后同命令1/1，317.7698ms；之后补真实scopeRevision变化负例，最终完整`node --test C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/test/runtime-core/git-capability-tools.test.ts`，owned cwd `C:/Users/51054/AppData/Local/Temp/ans-r9-final-edYX1T`，正常离线环境exit0，24test/24pass/0fail/cancel/skip，600.9506ms。最终主`npm run typecheck`exit0，owned两文件diff-check0。中间主TS唯一O在飞`src/service/trunk/public/trunk-service.ts:42 TS2322`：prepareDirectCommit返回Preparation含PreparedTeamPlanCommit（team-plan-commit）不兼容PreparedDirectCommit（direct-document-commit），已交O，最终原O修后消；R未跨写。

最终真实fixture根 `Temp/ans-r14-required-r1lyIr`、unmanaged `Temp/ans-r14-unmanaged-7E7qA0`。严格默认Core+真实defaultCodexChat native plan含run_shell/start_background_task（另含list/read/stop background）；required发token前unknown、legacybind/compose拒，actual createCodexChatSession入口调用栈的randomUUID仅观测/原返回值不改，native session构造0/HTTP0/marker0。控制同required根不注shellGate的真Chat严格prepare/bind/HTTP成功；unmanaged真shellGate/registered ans_run_shell调用实际production Node写benign `owned-node-marker.txt`成功，surface仍unknown不冒隔离。控制总native构造2、HTTP3。另真实unmanaged计划token后追加Provider识别的初始化source物证，scopeRevision变，bind前拒且构造/HTTP仍0。没有custom factory/fixture safe票/native匿名角色/外层sandbox拒当保护；没有真实模型/远端/devGit写。

最终SHA256：Service/session `E0AE7AF71226EDFD5A88CB2E9E6D83E1EE9224EAF240B9B714FD65CBA74AC39E`；Git test `4600E7065C35F50C0D1429FEA1CD23587163E033C2538E18483A812135F6AAAD`。仅原两源/test及本人现有API/memo/change，零新file/Model/schema/权限，未知scope/custom与R12/R13/跨actor实际作用面边界保持；不声称未隔离脚本能安全完成worker/质检四闭环，交后继实际验。

正式续仅Service/session及本人既有test。W8真实证据显示已完整quiescent的同Core/native实例，dispose先置flag再inspect把真终态强制unknown并永久存入registry；修为关闭前后实际验证后的不可变终态留存，不以dispose事件/空清单代停稳。Q4新权威采集显示执行init的真实HTTP主prompt在途、native已完整processCoverage且processes空，但Core把未settled状态混入coverage；分离进程覆盖与停稳语义，保持stop/quiescent严格/raw未settled或工具/process未知仍未停稳，不要求同一prompt等自己。无需新Model shape，不跨改O谓词或native事实；实际defaultChat localhost仅替推理正例及未排空/错实例/未知负例后短交。

R13短交付：上述两缺陷均仅session.ts实际修正。真正defaultCore严格prepare/one-shot bind→defaultCodexChat→localhost HTTP在途coverage complete但非quiescent/providerFinished false；真实raw settled/Core drained后quiescent；同实例abort/dispose后handle/registry/合法stop读取同session/turn/nativeUUID/settledAt完整拷贝receipt，关闭后不能再prompt。负例保无raw、无native、错instance、实际活能力、声明活process、custom未证和真实owned Node树未知，不从dispose/空清单推停稳；owned-process漏nativechild覆盖unknown。完整life12/12自然exit0（11.618s），随后两保守收紧最终精确R13三test3/3、type0/diff0，实际命令/cwd/候选区分见[r13-lifecycle-results](2026-11-05_git-role-permissions-evidence/r13-lifecycle-results.txt)。首fixture输入/漏事件流收尾和owned单child中断原件见[r13-first-results](2026-11-05_git-role-permissions-evidence/r13-first-results.txt)，未forcepass/放宽断言/改安全。SHA session `AFF98A06B02CAA291F7579E8A8041F8A1110DD1721D7890D2BC25994180FD425`，life test `F6CD2CF06AC4CB5ED0CCAE831F379FB51DC9D05C60C464E7C56B6D7D03D88AC2`，Model零变更，原R12/全actor scope/provenance/lease/Source guard保持。Q真实physical init当前候选后继验，不冒本节点已init/四链通过，不改O/W/N源码/模型/远端/devGit。
