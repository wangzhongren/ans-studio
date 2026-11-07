# Git角色工作流：真实HTTP测试与续接范围

本记录说明Q2已准备的测试接缝及后续覆盖，不是另一产品方案，也不是四流程已通过。测试依据根P2/G-T1/I4、合并B1 J01–J16及G-C1 P6；所有权限来自已确认派单，本文不新增权限。

## 实际接缝

`git-role-workflows-driver.ts` 仅启动127.0.0.1随机端口的有限Chat Completions服务器。应用使用真实默认Core、默认createCodexRuntimeAdapter、codex/chat运输及实际ans_工具registry。没有providerFactories、chatFetch、engineFactory或native事实注入。固定baseUrl不出loopback；CODEX_API_KEY仅在本测试进程临时设为fixture-only并恢复，不写/输出原凭据。

服务器按生产system里的固定role及实际工具清单识别身份；独立chief决定仅真实decide工具分支。内部治理进度单独使用有界反馈脚本，不能当正式任务报告/收口依据。未知身份、轮次、HTTP路径、脚本耗尽、重复指纹或预算超限返回HTTP500并记录；不回退真实模型。工具结果只读真实后续messages role:tool/tool_call_id，客户只回应真实presenter requestId并独立test-customer留痕。

默认请求上限30/每等待6秒；空项目主用例上限10个请求/测试15秒，脚本不自行增加预算。诊断等待图区分有解除者的外部等待、闭环、无人负责等待；它不写应用状态。

## 首新增顺序与隔离

主用例从mkdtemp真正空目录开始，不先init、不填accepted配置、future proposal/modules/roster、D3、卡、workflow、FSmanifest、ref或pin。依据root明确P2§5.1：真实chief判新→正式dispatch运营受控init/首候选→按实际缺口产品/策划→计划→D3/三件激活→worker→真实报告/创建者close/依赖/验收。是否真新/根归属/内容必须来自host事实，不通过模型title或bootstrap布尔自报。

查询另用可核的已初始化独立fixture，仅由生产initializeGitRepository建立查询环境；不把该setup应用于主用例，不算已有repo完整入口验证。所有Git写仅隔离fixture，不在开发检出Git版本操作、不远端、无用户目录清理。

另保留未注册的`preparedMaterialsFirstObservation`：真实产品写草稿→原创建者依据close→实际字节确认→策划写6文档/close→产品null-CAS→正式运营。它可帮助后继接续材料链，不能代替P2要求的首init顺序。第一次让product init被正确role-not-allowed拒绝是Q脚本角色错误，原失败日志保留，不改生产矩阵求绿。

## G1–G12与四闭环的后继覆盖

| 组 | 本阶段/后继内容 |
| --- | --- |
| G1 查询 | 当前真实chief默认HTTP→Git status、同实例surface、Git metadata原字节前后；其余身份/恶意配置后继 |
| G2 角色矩阵 | product init正确拒绝已观察；本人候选正例、完整diff/父关系/撤权竞态后继 |
| G3 新增 | 真空chief→运营在effective-manifest-missing阻断；已有repo完整入口未跑 |
| G4 双基线 | 旧run重开会话读取旧字节、三模式、缺物证/unknown停稳后继 |
| G5 重构 | 真实保持项、行为变化分流、最终OID核验后继 |
| G6 bug/revert | 原owner/原标准、实际revert和mainline/保留历史后继 |
| G7 冲突 | 完整base→最终merge差异、原owner语义修复及最终OID后继 |
| G8 CAS/整单 | 实际单ref竞争和撤权核权两顺序分开补证 |
| G9 故障/恢复 | FS旧journal/Git新journal按实际提交点、后继ref/未知进程后继 |
| G10 收口 | 未注册材料链曾真实creator source close；主首链尚未到达，worker两依赖必须accepted close后释放 |
| G11 环境/委托 | 真工具修隔离环境后重核；主chief忙时真实独立chief决定/拒绝/退修/revision及旧@预设后继 |
| G12 取消/预算/旁路 | 当前有限HTTP硬失败；实际file/shell/native/install/download覆盖、取消/进程unknown仍待各真实入口 |

新增/变更/重构/bug四正常闭环、六角色回退、D3/零文件三件写卡/完整激活、worker执行/质检/交付和真实六角色UI均未通过。本阶段停在第一个真实前置缺口，待owner补接口后按受影响源重新冻结复测；single/su兼容按客户取消为N/A。

## Q3接缝续接

原主用例现先public native pickProject→实际list后注册，再发送正常带clientMessageId的真实chief客户轮次。driver只读检查canonical root/祖先及嵌套.git/links，不将诊断注入host。TaskCreated.workSourceRef只从生产child读，逐字节核app source的sha/sourceId/flow/root/真实客户clientMessageId，无假parentTask或模型host字段。单次到真实convener init，修改保护闭包仍blocked；类型0、query1pass/init1fail，详见本任务change Q3节。后继从该真实入口复用，不恢复Q2 list-only旧夹具，也不预init求绿。

## Q7实际覆盖边界

同一生产链现真实到首doc null-CAS发布/原creator accepted close，再正式派运营写计划及complete_team_plan；当前计划返回plan-journal-failed/git-mutation-lease-unproven，停止于此。首doc读回以真实ref/commit/tree/manifest/snapshot/原operation为准，推理边界暂挂只为先采不可变发布物证，不改应用状态。有限pureack按type/source/op/application/digest核绑定；内部relay一次性名单、未知和重复硬失败，预算固定56。本阶段未到D3/新角色三件/worker；J03/J16后继须在worker前采真实required scope/factory/registry，实际注册raw script/run_shell/bg不能靠未调用认定闭包。详见change Q7及q7-milestone-and-plan-gap.json，不把首doc子链当四流程或UI通过。

## Q8矩阵口径

主链已取证真实t2计划发布/marker及原creatorclose→nominator真实D3→零文件三件生产写入，完整激活仍拒Git mutation lease。早期plan latch只暂挂推理边界以读不变物证，无状态注入；增加业务前声明80请求上界、实际64。源码补线造成旧拒新过属于实施缺口修复，不计同冻结候选六角色回退；六回退仍须同source真实拒绝/退回→有权角色补材料或环境→重核恢复或停止，四链/12组要求不减。worker实际factory/registry闭包J03/J16、workflow/pin/执行质检与UI仍待后继。

## Q9预算与Active边界

执行前声明104HTTP/整test60s/单观察20s/0重试（预计<=80）；不机械沿旧18s、运行中续命或重派加预算。真实Active rev1/8引用原bytes/授权/同opjournal已过，doc版本/source/artifacts/snapshot保持原t2，无workflow/pin。随后真实人事报告三文档无法取得chief typed收口basis，工作流脚本未执行。此生产缺口触发严格HTTP断言不算脚本耗尽；保全原件。后继同source六业务回退/worker J03J16/全链UI标准不减。

## Q10收口/工作流与终态边界

预算执行前120HTTP/120秒全test/45秒单观察/150秒wrapper/零retry，实际82。真实HR acceptedclose早保存；专门stable卡已客户批准但write gate拒内容SHA非法，file/Gitref均无。已观察唯一系统重建wrapper精确解析后继续原绑定通知，不能宽吞未知。业务失败原件与进程退出失败分开：case失败输出后150秒watchdog，根因未定/无自然退出证明，不能伪绿或推全部后代收敛；后继需保有界owned进程真实终态。六回退仍同source业务补材恢复，不能把此次改源码过链计入。

## Q11三层完成判定

保持原workflow批准bytes；客户批准、物理written/permit consumed、真实Gitworkflow绑定分三层读回。当前前两层真发生但Gitref缺席，主用例硬失败而不执行后继；真实postconsume应用pending文案保留。预算先声明144HTTP/180s整test/75s单观察/210s外层/0retry，实际81与37.98s自然退出。ownedcleanup只用实际publicstopall/readerdispose/自有HTTP关闭，记录资源类型/registry，不改或清未知进程；此次自然退出不解释Q10旧红。原同candidate六fallback/worker J03J16/四链/UI等矩阵全保。

## Q12诊断证据约束

一次新增真实观察条件，不修改生产或伪造callback返回；实际delivery-note首code即时独立落盘，绑定同回调Core/managed/Desktop/coordinator，保observedAt和revision，不声称全时序。真实首code为git-host-admission-in-flight，Desktop admission先行门槛两open-failed；后续Core历史事实不替此首谓词，旧Q11内部return未知仍未知。仅到workflow complete，不report/close/pin；全矩阵未减，执行前144/180s/75s/210s/0retry，实际80/38.108s自然失败。
