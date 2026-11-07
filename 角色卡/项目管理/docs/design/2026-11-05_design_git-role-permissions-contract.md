# Git权限整合实施合同 G-C1

- 2026-11-05，固定项目管理；实施层合同，非第二策划方案、非已实现/验收结论。
- 根P2：`docs/planning/2026-11-05_design_git-role-permissions-workflows.md` SHA256 `5CA20C5F333C9390FADBFF855126F01A5219735FFFC034BBF64DBED0757A45B8`；G-T1：`docs/scheduling/2026-11-05_team-plan_git-role-permissions-integration.md` SHA256 `4A62E7FD7A2A9444C6B42E0CA5936F7154F4484A2085C8071BF159D043805324`；两者确认采用根I4末节及统筹派单，文件头待确认是历史状态。
- 检出`C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment`，feat/plan-escalation-card，HEAD77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3＋保留全部旧/当前差异；不在本检出操作Git版本内容/迁移/提交，不远端、不真实模型。
- 延续P3.1/C0及T1/T1.1；已有真8refs冻结、原创建者真报告/draftbasis收口、四Fn幂等通知复用，不另造DAG、阶段或权限账本。

## 1. DTO及注入入口（R唯一Model owner，拟实施后冻结）

下列为可直接表达的TypeScript最小接口锚点，实际导出落原`runtime.ts`/`trunk.ts`；不新增Model文件。host由应用闭包捕获，不出现在模型schema；完整DTO普通字段可由R同对象细化，不能扩任意命令。

```ts
type GitOid = { objectFormat: "sha1" | "sha256"; hex: string };
type GitBasis = { ref: string; oid: GitOid | null };
type GitEvidenceRef = { oid: GitOid; path: string; sha256: string };
type GitQueryRequest = { operationId: string; template:
  "status" | "diff" | "log" | "show" | "rev-parse" | "ls-files" |
  "ls-tree" | "merge-base" | "branch-list" | "worktree-list";
  target?: GitOid; other?: GitOid; paths?: string[]; limit?: number };
type GitCandidateRequest = { operationId: string; base: GitBasis } & (
  | { action: "commit"; paths: string[]; message: string }
  | { action: "integrate"; candidates: GitOid[]; message: string }
  | { action: "revert"; commit: GitOid; mainline?: number; message: string }
  | { action: "init"; message: string });
type GitPublishRequest = { operationId: string; target: "documents" | "delivery";
  expected: GitBasis; candidate: GitOid; criteria: GitEvidenceRef[];
  evidence: GitEvidenceRef[]; creatorCloseOperationId?: string };
type GitCapabilityResult = { operationId: string; repoId: string; status:
  "observed" | "prepared" | "published" | "rejected" | "conflict" |
  "blocked" | "pending-recovery"; code?: string; message?: string;
  candidate?: GitOid; tree?: GitOid; parents?: GitOid[]; published?: GitBasis;
  journalId?: string; output?: string; truncated?: boolean };
type GitQueryFn = (input: GitQueryRequest, signal?: AbortSignal) => Promise<GitCapabilityResult>;
type GitCandidateFn = (input: GitCandidateRequest, signal?: AbortSignal) => Promise<GitCapabilityResult>;
type GitPublishFn = (input: GitPublishRequest, signal?: AbortSignal) => Promise<GitCapabilityResult>;
```

- Host事实`{repoId,actorRoleId,taskId,runId?,authorizationRevision,ownedIndexId,ownedWorktreeId}`只由真实任务/会话/当前授权取得；候选author、branch、模型字段或文件里的revision不能填它。工具名可冻结为`git_query/git_candidate/git_publish`，注入才注册、严格拒未知参数/嵌套字段，不收argv/env/config/任意ref或可执行路径。
- oid必须按仓库实际objectFormat校验完整40/64 hex并解析commit/tree类型；不收短SHA/任意revision表达式。GitBasis.ref仅作请求对象，Service映射并核应用分配ref，模型不能指向用户main/remote/别人的candidate。init目录在host已批准绝对目标，不在模型输入接任意dir。
- 候选action中的commit只暂存显式paths并检查完整index；删除/重命名从真实diff发现并核旧新两路径。integrate/revert仅运营及合法指定OID，revert合并提交必须核明确mainline；冲突回原owner，不由模型临时切raw命令。候选结果prepared不意味着激活/交付。
- 发布结果published只能来自实际ref确认；准备/未知/账本失败不得伪作成功。pending-recovery必须带journalId及实际old/new或其可解引用journal；查询截断明确标记，不可将截断diff用于全差异核权。

## 2. 唯一职责与真实入口

| owner/层 | 入口与责任 |
| --- | --- |
| R Model/工具/Service session | 原五源文件扩上述Fn/DTO与严格schema，host能力按可信角色注入；旧shell/文件/native接缝传保护事实，不装Git进程或权限状态机。 |
| G纯策略公开入口 | 原`service/gate/shell-rules.ts`可公开`checkGitPolicy(facts):GitPolicyResult`；facts为已解析repo/ref/完整argv模板、全部diff项、当前职责/授权数据；普通结果含allowed/code、逐路径/ref拒绝和输入digest。纯路径/ref/argv/角色矩阵，无I/O、无Service peer、无Provider能力泄漏。 |
| O Pipeline | 原trunk-runtime/run-role组合G公开纯策略与O Service；调度/冻结/收口/通知沿原入口。W只把真实Interface事实交Pipeline，不自行调用Git/fs/Service。 |
| O Service | 新`service/trunk/impl/git-capabilities.ts`经原abstract/public暴露host-bound三Fn，核完整差异/父关系/标准证据/原创建者收口与当前授权，持临界区到Provider终态/ref对账；G verdict只是绑定输入的普通数据，不是可长期复用的权限票。 |
| O Provider | 新`git-command.ts`负责唯一受控spawn与owned进程事实；`git-candidate-store.ts`管理本任务index/worktree/ref；`git-trunk-store.ts`适配现TrunkStore。仅经既有trunk public导出所需操作，不新建Git根/共享服务。 |

G策略输出须绑定repo身份、operation、actor/current revision及完整base→candidate diff摘要；进入修改临界区后O重新核真实授权和immutable diff，任何输入变动重算，不靠提交前旧verdict放行。为避免Service互调，G纯策略由Pipeline调用，O Service核其输入摘要与当前可信事实并实施本责任不变量；不得让O Provider向上调用G或W回调代核。

## 3. Provider受控Git与旁路前置

- 固定真实Git二进制＋完整argv数组，shell:false只是底线；模板自行生成`--`字面path参数。禁模型-c/config-env/git-dir/work-tree/env/alias、magic pathspec、输出文件、网络/remote helpers、未知revision/refs/符号ref；受控只读status加no-optional-locks，diff/show禁ext-diff/textconv，pager/fsmonitor/hooks/filters/维护配置禁隐式执行。配置与环境全由Provider固定/清洗，不能继承不可信GIT_*或仓库执行配置。
- repoId绑定规范realpath/worktree/gitdir/common-dir/objectFormat；同host下每次核真实归属与链接形态，不把worktree当沙箱。alternates/submodule/嵌套repo/外部gitdir/common-dir、Windows junction/符号ref等未验证形态拒绝；受限历史blob仍逐版本路径核读权，不能任意倾倒对象。
- command结果必须有`processId/startedAt/endedAt?/exitCode?/signal?/timedOut/outputTruncated/termination:exited|killed|unknown`等普通事实；输出/时间/进程树预算有界。超时杀进程仍未知则保留未决约束，不能用Promise超时或pid消失推整个树退出。
- **现缺口**：原tools同用户spawn，classify-shell/shell-write-guard/postaudit及nativeLifecycle停稳hook不证明获批build/脚本/SDK内置工具不能直接写.git/common-dir/他人worktree。原R工具file/write/edit、同步/后台shell及三native adapter所有可能写路径须有不可绕过同一保护的真实事实；post-audit只能取证，不能撤销已被绕过的ref发布。
- 修改能力开放前需owner给`GitProtectionFacts`（host产生repo/protected roots、实际执行identity/mechanism、覆盖direct-files/sync-shell/background/native-tools及子进程、可验证测试证据摘要、unknown原因）；它是物证不是模型授权。任一可修改路径未证明隔离则该repo相关修改blocked，保留具体失败/缺机制，不以全局关shell或少量查询通过宣称四链/G12完成。
- 原owner只先查G-T1已授文件接缝：R tools/session、G classify/shell-write-guard/boundary-core、O shell-arming/gate/postaudit、W native宿主路由。若真实实现需OS受限token/ACL/沙箱、新SDK/provider路径/文件/依赖/额外权限，交精确owner/path/机制/负例delta；此合同未授权新能力，亦未证明当前存在可用隔离。

## 4. 当前授权临界区与撤权顺序

- 复用现真实D3/active/计划/任务/权限revision与operation journal，不另造权限账本。O Service的repo修改串行区必须覆盖**当前核权→Provider修改→进程终态＋实际ref确认**，所有相关撤权/收缩入口经同一受信协调路径；同用户外部写也须前节隔离，不以应用锁冒充OS权限。
- 模型不能持lease；候选准备不长期锁住授权，最终commit/index修改与publish分别重核当前revision。撤权先完成→旧revision动作拒绝；发布先完成→保留真实提交，撤权阻止以后动作，不假回滚。run使用冻结权限与当前收缩的交集，新授权不渗旧pin。
- 超时/崩溃/进程结果未知在既有operation里保未决fence；撤权可先记请求待处理，但不能宣已完成后放旧进程继续写。恢复先证明owned进程终态和ref，再落可核先后；不能仅lease到时释放锁。无法约束任一撤权入口则修改blocked，待owner给实际串行实现证据。

## 5. 单ref、旧存储兼容与恢复

- 保既有`compareAndSwapManifest(expectedDoc,next,snapshot,expectedActive?,expectedSnapshot?)`和`readManifestAt(ref,expectedSnapshot?)`原语义：doc/active独立CAS身份、同digest初始workflow附件snapshot fencing、原operation/history能读原物证。Git adapter不是把旧五参截短；文档版本/digest/snapshot身份在完整commit树中可验证映射到OID。
- 新内容commit先形成完整树，含所有所需doc/active/manifest元数据与原字节闭包；对象存在不算生效。应用文档`refs/ans/trunk`与代码`refs/ans/delivery/<flow>`各自只有一个单ref expected-old提交点，默认不改用户分支。候选ref只指未生效内容，受应用分配且提交后重读tree/parents/OID。
- 迁移顺序：①识别当前真实旧fs提交点及未决journal，保原旧snapshot/run证据；②按该完整真实字节造Git目标并重读核树/OID；③以同operation在受信串行区记录旧fs身份/新Git old/new与存储mode，目标ref expected-old一次CAS；④对账后新读者以Git ref为唯一有效提交点，旧json仅投影/兼容读，不再并行推进；⑤通知/元数据失败保pending-recovery。mode记录不能单独推翻ref物证，也不能让迁移期间两个介质分别可写；切换不明确则blocked。
- 旧journal按其原fs提交点恢复，新的Gitjournal按实际ref恢复；不能为了迁移把旧pin从live补齐或替换冻结依据。旧合法history/readManifestAt仍可验证，Git-only旧读失败不能静默回latest。
- 新journal至少`operationId,repoId,ref,oldOid|null,newOid,tree,parents,actor/task/run,authorizationRevision,basis/evidence摘要,media,phase`；phase仅线索，actual ref/immutable对象及已证明进程终态决定结果。CAS前失败旧ref有效；CAS后账本/通知失败已发布待恢复；同operation不同内容拒绝。
- 未知结果：ref=old且旧owned进程已确定终态时，可按当前权限/expected-old恢复同操作；ref=new补审计通知不再升版/激活/换pin；ref既非old/new须证明后继journal链，否则blocked、不CAS倒回旧值。代码与文档refs不跨ref假装原子，run绑定具体doc/code/criteria/授权OID，读同一冻结闭包。
- 运营集成完整base→最终merge/revert差异逐项归合法owner及父关系；冲突修复产生新OID必须重验最终OID。报告/criteria/实际creator accepted close与候选OID绑定后才发布delivery；复用现任务收口/依赖链，不以Git成功替收口或客户验收。

## 6. 同对象审核结论与交接

- **recommend approval（实施方向/同范围入口）**：R五源DTO/工具注入、G原公开纯策略、O四新文件与原Provider/Service/Pipeline、W可信Interface触点与P2/G-T1一致；后继同对象普通细化复用此审结，R/O/G回实际签名/hash后消费，不为小节点重述审核。尚无owner实际Git实现评估/隔离与撤权串行实证，不给修改分支“已可运行”结论。
- R6统一nativeLifecycle事实复用owned终态/unknown语义，不能替GitProtectionFacts。O既有freezeExecutionRun/creator-close/direct notifications复用，旧差异保留；不重做六角色DAG/权限账本。
- R先冻Model签名；O/G并行实现受控读/Provider fixture/纯ACL并交旁路/临界区缺口；W仅消费真实host/OID/状态。未知修改blocked不妨碍已证安全只读或不相交原T1工作。超4新src/7newtest或权限的必要增量带精确路径/原因回统筹。
- Q后继六身份driver只替推理，走生产工具/门禁/任务/run/真实本地Git/12组场景及四闭环；不手造ref/D3/accepted/activation。真实Git测试限隔离fixture授权，有限场景不称全流程无死锁。独立验收由root唯一主上下文负责。
- 本P6只读与文档，无形式测试、应用/模型/Git子进程，无源码/i18n/根文档/他owner修改，无commit/迁移/远端。交付后释放，不常驻等待未知机制。

## 7. I5幕僚枢纽同步（2026-11-06；P1.1 supersedes旧quality parent）
- 上位根`2026-11-06_design_chief-hub-routing.md` P1.1 SHA256 `A151C2DB2C772F7DDD9890DB682E9078E4D35090F5F9EA441D55011DADE79F39`；根B1 `2026-11-06_chief-hub-routing-criteria-v1.md` SHA256 `847596F4D8C293DEF5E28398C7FD166EA96E1B4B1049014FC1635E09901E2F89`，H01–H10是后继核验标准，未判通过。
- P1.1对新hub任务取代本合同及旧GitP2中的Convener→Verifier quality parent假设：Chief真实创建/派发/收报/收口五builtin（含Verifier），Convener只管impl worker；旧无hub标记任务保真实creator/parent/close与历史证据，不重写旧事件。
- 普通Chief→builtin只核真实Chief当前客户/正式报告来源、项目身份及适用只读context，不以M0/plan/D3/前close当通用派发票；具体动作仍核M0/plan/D3/三件/8refs/currentAuth、最终CID/criteria/R9及真实stop，不以普通任务上下文授effect权。
- R实际Model：`hubRouting="chief-hub-v1"`；`reviewControllerRef={kind:"convener-controller",taskId,flowId,runId,reviewBasisRef}`为独立业务关联，不是parent；`resumeController={taskId,flowId,runId,reviewTaskId,reviewCloseOperationId}`严格五字段仅期望对象。schema禁host字段，sourceTaskId保原重派/迁移语义。
- O实际Pipeline `prepareControllerResume({projectRoot,resumeController,hostInitialization})`核真实当前Chief信封，返回普通ControllerResumePreparation含原五字段、actorRoleId:"convener"、resumeKey/basisDigest；不新建/关闭任务，不生成权限票。
- 延迟消费`inspectQueuedControllerResume({projectRoot,resumeController,resumeKey,basisDigest})`仅认本进程真实prepare受理登记，再核live controller/pin/CID/criteria、Chief质量accepted、当前字节与授权；出队不要求Chief turn常驻，lease不跨drain。重启无登记拒绝，fresh Chief重新prepare不证明旧进程停稳，unknown仍blocked。
- Chief接受review后须明确续仍live运营原任务（existing task/no new task），真实ACK/去重；review close不自动派下个builtin。运营真实delivery后才正式完成报告并由Chief整体close；不得先关controller再发布。最终review/整体close仍需真实质量/delivery物证。
- 普通报告only close不向无关builtin通用模型广播；真实version/plan/activation/runChange effect通知保留。activation新journal.publicationTask绑定实际task/run/ledgerSHA并在R9核实，旧operation不回填；通知不充正式报告、accepted或执行许可。
- 本段仅同步当前R/O公开字段与P1.1/H01–H10；原版本证据及Q失败保留。Q54执行窗内只改本人文档，production/test执行源冻结；不据这次同步宣称实现、四正向闭环或B2验收通过。

## 8. revert既定能力最小后继合同（未实施；不阻当前CHANGE）
1. P2既定revert与G21只读结论一致；当前G no-index raw策略未支持，O candidate非init修改仍stub，以下只冻结普通事实接缝，不宣已可执行/验收通过。
2. R原`src/model/trunk.ts`拟增`revertBasis`普通字段：`target:{commit,commitBytesBase64:string,tree,entries}`、`selectedParent:null|{index,commit,commitBytesBase64:string,tree,entries}`、`codeBasis:{commit,commitBytesBase64:string,tree,entries}`、`inverseChanges`、`conflicts`、`complete`；三套原commit字节均与真实完整OID/tree重算绑定，不另造可执行票。
3. request仍仅既定commit/mainline等期望参数；真实repo/task/run/currentAuth/operation由host绑定。O原Provider读取三套真实不可变对象原bytes/fulltree，Service核对象OID/类型/字节/父关系，再交G纯事实，complete不接受模型自报。
4. target真实parents由commit bytes解析；root明确selectedParent=null且父侧为对象格式对应空tree，不造父commit。单父选其真实唯一parent；merge必须显式mainline正整数且在真实parents 1-based范围，选定bytes/OID/tree完全匹配；root/单父不借伪mainline改变意义。
5. inverseChanges严格由选parent→target真实完整差异反向生成，涵盖A/M/D/R/C/T、旧新路径及完整path/mode/fullOID，观察tree必须保symlink 120000/gitlink 160000等特殊entry以识别并明确拒绝不支持/未授权结果，不得删entry冒full tree；candidate input仍原bytes/executable/null与常规mode权限，不扩特殊写。target不是当前base，不能把parent整tree覆盖当前工作内容。
6. 在当前codeBasis完整tree上应用逆变化，未涉及entry逐字保留，包括目标提交之后的无关合法新增/修改。被逆变位置当前内容与target不匹配、重命名/删除碰撞或mode不兼容均显式conflict，不默选ours/theirs、不吞文件。
7. conflict普通项至少绑定path及parent/target/current的entry或明确missing；未解决不产可发布候选。原owner语义修复形成新候选及新证据，重核其当前base→最终tree全部差异/权限，不以冲突标记或旧父测试充核验。
8. 最终candidate parents含真实当前codeBasis为其基线，不偷偷以reverted target替当前父；G验证全部候选tree、保留项、逆差异/冲突关系及完整commands，O修改临界区重核scope/currentAuth及base expected-old。
9. 路径核权覆盖删除原路径、重命名旧新两侧及实际结果全diff；历史可读/author/signoff/Model receipt均非写许可。运营只集成原owner合法范围，不能借revert清除其他owner未授权变更。
10. O原`git-candidate-store.ts`/`git-command.ts`真实I/O、Service原`git-capabilities.ts`组合与授权、G原`classify-shell.ts`经`shell-rules.ts`公开纯验证，R原Model纯shape；不新增源文件、角色、权限、通用patch引擎或shared FS/Git服务。
11. 仅应用owned隔离index/raw对象/ref接缝；禁共享index、force/reset/clean/stash和用户脏区恢复。新命令模板须与完整raw事实严格匹配，不伪commit/integrate模板绕过当前revert拒绝；未知隔离/owned进程终态仍blocked。
12. revert是新候选CID，保留原历史；按I5由Chief创建最终review、实际accepted、显式续live Convener controller，再经原delivery单ref CAS发布。CID/base或冲突修复变化使相关quality证据失效；回退不移动旧ref抹历史、不绕标准/creatorclose。
13. 后继R/G/O各改原已授文件/测试；确需表外路径/权限时仅列精确delta。此节点仅本人G-C1/API/memo，源测零写、无Git/测试/应用/模型，旧失败/当前CHANGE与Q窗口不等待文档收尾。
14. `complete/inverseChanges/conflicts`仅普通派生数据，G必须按三套真实commit原bytes重建验证完整tree/选parent/current codeBasis后重算，不能凭complete:true/conflicts:[]放行。采纳G22本人API/memo对B069…584EF的needs-revision：当前GitRawObjectPlan/RawTree分处G:66与O Provider abstract自有shape、Model尚无；R须在原已准`src/model/trunk.ts`立唯一共享纯shape，G/O原接口各消费，不再第三镜像/公共factory/patch引擎。模型工具schema仍只接既定request.commit/mainline，不接proof/revertBasis；本修订仅合同，未宣Model已落实。
