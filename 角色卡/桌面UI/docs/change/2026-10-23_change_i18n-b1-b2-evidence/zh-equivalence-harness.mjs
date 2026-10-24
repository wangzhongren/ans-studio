const OLD = "C:/Users/51054/AppData/Local/Temp/ans-i18n-old/app/renderer/src/chat/";
const NEW = "C:/Users/51054/Desktop/work/ans-studio/app/renderer/src/chat/";
const mods = ["status","role-view","work-view","confirm-logic","governance-view","runtime-config","report-view","document-view","tool-summary","reasoning","operator-view","judge","events"];
const oldM = {}, newM = {};
for (const n of mods) { oldM[n] = await import("file:///" + OLD + n + ".ts"); newM[n] = await import("file:///" + NEW + n + ".ts"); }
let checks = 0, fails = 0;
function cmp(label, oldFn, newFn, args) {
  checks++;
  let a, b;
  try { a = oldFn(...args); } catch (e) { a = "THREW:" + e.message; }
  try { b = newFn(...args); } catch (e) { b = "THREW:" + e.message; }
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { fails++; console.log("DIFF " + label + "\n  old=" + ja + "\n  new=" + jb); }
}
const role = (x) => ({ cardText: "", boundary: { entries: [] }, ...x });
const report = (x={}) => ({ version:1, reportId:"r1", source:{roleId:"A",runtime:"pi",turnId:"t1"}, origin:"submitted-report", status:"completed", summary:{text:"摘要",redacted:false,truncated:false}, evidence:[], ...x });

for (const s of ["not-opened","idle","working","awaiting-confirm","stopped","error","idle-restored","weird"])
  for (const c of [0,1,2]) cmp("statusBadge "+s+"/"+c, oldM.status.statusBadge, newM.status.statusBadge, [s,c]);

cmp("roleDisplayName null", oldM["role-view"].roleDisplayName, newM["role-view"].roleDisplayName, [null]);
for (const fn of ["liaison","proposal","nomination","schedule","verification","unknown",undefined]) {
  cmp("govView "+fn, oldM["role-view"].governanceView, newM["role-view"].governanceView, [fn]);
  cmp("roleName "+fn, oldM["role-view"].roleDisplayName, newM["role-view"].roleDisplayName, [role({roleId:"x",governanceFunction:fn})]);
  cmp("roleSub "+fn, oldM["role-view"].roleSubtitle, newM["role-view"].roleSubtitle, [role({roleId:"x",governanceFunction:fn})]);
}
cmp("roleSub builtin", oldM["role-view"].roleSubtitle, newM["role-view"].roleSubtitle, [role({roleId:"x",builtIn:true})]);
cmp("roleSub card", oldM["role-view"].roleSubtitle, newM["role-view"].roleSubtitle, [role({roleId:"x",cardText:"# A\nB"})]);
cmp("roleSub boundary", oldM["role-view"].roleSubtitle, newM["role-view"].roleSubtitle, [role({roleId:"x",boundary:{entries:[{},{}]}})]);
const roles = [role({roleId:"p"}), role({roleId:"g",governanceFunction:"liaison"}), role({roleId:"w",group:"G"}), role({roleId:"d"})];
cmp("groupRoles p", oldM["role-view"].groupRoles, newM["role-view"].groupRoles, [roles,"p"]);
cmp("groupRoles null", oldM["role-view"].groupRoles, newM["role-view"].groupRoles, [roles,null]);

cmp("workTitle", oldM["work-view"].workTitle, newM["work-view"].workTitle, ["A"]);
cmp("workTitle empty", oldM["work-view"].workTitle, newM["work-view"].workTitle, [""]);
cmp("profileTitle", oldM["work-view"].profileTitle, newM["work-view"].profileTitle, ["A"]);
cmp("queueTitle", oldM["work-view"].queueTitle, newM["work-view"].queueTitle, ["A"]);
cmp("workBadgeAria", oldM["work-view"].workBadgeAria, newM["work-view"].workBadgeAria, [2]);
cmp("roleBadgeAria", oldM["work-view"].roleBadgeAria, newM["work-view"].roleBadgeAria, [4]);
const pend = { a: { roleId:"r", request:{kind:"choice",title:"T"} }, b:{roleId:"r",request:{kind:"confirm"}} };
cmp("pendingViews", oldM["work-view"].pendingViews, newM["work-view"].pendingViews, [pend,"r"]);
cmp("reportDeclaration1", oldM["work-view"].reportDeclaration, newM["work-view"].reportDeclaration, [report()]);
cmp("reportDeclaration2", oldM["work-view"].reportDeclaration, newM["work-view"].reportDeclaration, [report({origin:"terminal-fallback",status:"aborted"})]);
cmp("reportDeclaration3", oldM["work-view"].reportDeclaration, newM["work-view"].reportDeclaration, [report({origin:undefined,status:"weird"})]);
const rows = [{kind:"handback",data:{report:report()}},{kind:"delivery",data:{provenance:{reports:[report({summary:{text:"X",redacted:true,truncated:true}})]}}}];
cmp("recentHandbacks", oldM["work-view"].recentHandbacks, newM["work-view"].recentHandbacks, [rows]);

cmp("shellOutcome ok", oldM["confirm-logic"].shellResponseOutcome, newM["confirm-logic"].shellResponseOutcome, [{ok:true}]);
cmp("shellOutcome expired", oldM["confirm-logic"].shellResponseOutcome, newM["confirm-logic"].shellResponseOutcome, [{expired:true}]);
cmp("shellOutcome fail", oldM["confirm-logic"].shellResponseOutcome, newM["confirm-logic"].shellResponseOutcome, [{}]);
cmp("recoveryOutcome expired", oldM["confirm-logic"].recoveryResponseOutcome, newM["confirm-logic"].recoveryResponseOutcome, [{expired:true}]);
cmp("queueViews", oldM["confirm-logic"].queueItemViews, newM["confirm-logic"].queueItemViews, [[{id:"1",kind:"dispatch",sourceRoleId:"B",summary:"s"},{id:"2",kind:"message",summary:"m"},{id:"3",kind:"system",summary:"y"}], {id:"run",kind:"handback",sourceRoleId:"C",summary:"r"}]);
cmp("withdraw ok", oldM["confirm-logic"].withdrawOutcome, newM["confirm-logic"].withdrawOutcome, [{ok:true,summary:"sum"}]);
cmp("withdraw invalid", oldM["confirm-logic"].withdrawOutcome, newM["confirm-logic"].withdrawOutcome, [{ok:false,error:"err"}]);
cmp("withdraw invalid default", oldM["confirm-logic"].withdrawOutcome, newM["confirm-logic"].withdrawOutcome, [{ok:false}]);
cmp("withdraw exception", oldM["confirm-logic"].withdrawExceptionOutcome, newM["confirm-logic"].withdrawExceptionOutcome, ["boom"]);
cmp("image bad", oldM["confirm-logic"].clientImageProblem, newM["confirm-logic"].clientImageProblem, [{type:"image/svg+xml",size:1}]);
cmp("image big", oldM["confirm-logic"].clientImageProblem, newM["confirm-logic"].clientImageProblem, [{type:"image/png",size:6*1024*1024}]);
cmp("image ok", oldM["confirm-logic"].clientImageProblem, newM["confirm-logic"].clientImageProblem, [{type:"image/png",size:1}]);
cmp("attachmentTitle", oldM["confirm-logic"].attachmentTitle, newM["confirm-logic"].attachmentTitle, ["a.png",2048]);

for (const m of [null,"unknown","single","trio"]) cmp("govModelStatus "+m, oldM["governance-view"].governanceModelStatusText, newM["governance-view"].governanceModelStatusText, [m]);
for (const st of ["awaiting-customer","in-progress","blocked","escalated-to-customer","weird"]) cmp("govFlow "+st, oldM["governance-view"].governanceFlowStatusText, newM["governance-view"].governanceFlowStatusText, [st]);
cmp("govStatus", oldM["governance-view"].governanceStatusText, newM["governance-view"].governanceStatusText, ["trio","f","awaiting-customer"]);
cmp("govMissing", oldM["governance-view"].governanceMissingText, newM["governance-view"].governanceMissingText, [3]);
cmp("govInvalid", oldM["governance-view"].governanceInvalidText, newM["governance-view"].governanceInvalidText, [""]);
cmp("govEmpty", oldM["governance-view"].governanceEmptyState, newM["governance-view"].governanceEmptyState, [2,null]);
for (const fn of ["liaison","proposal","nomination","schedule","verification","x"]) cmp("govHint "+fn, oldM["governance-view"].governanceRoleEmptyHint, newM["governance-view"].governanceRoleEmptyHint, [fn]);
const changed = [{status:"modified",path:"x",pinned:"aaaaaaaa1",actual:"bbbbbbbb2"},{status:"missing",path:"y"},{status:"unreadable",path:"z"},{status:"mystery",path:"w"}];
cmp("govPinMismatch", oldM["governance-view"].governancePinMismatchText, newM["governance-view"].governancePinMismatchText, [9,changed]);
cmp("govPinMismatchEmpty", oldM["governance-view"].governancePinMismatchEmptyState, newM["governance-view"].governancePinMismatchEmptyState, [9,changed]);
const reaccept = {pinCount:9,changed,blockers:[{message:"b"}],canConfirm:false,previewDigest:"d"};
cmp("govReacceptPreview", oldM["governance-view"].governanceReacceptPreviewView, newM["governance-view"].governanceReacceptPreviewView, [reaccept]);
cmp("govReacceptSuccess", oldM["governance-view"].governanceReacceptSuccessText, newM["governance-view"].governanceReacceptSuccessText, [9,1]);
for (const [ph,st,msg] of [["guard","preview-stale","预览已过期"],["guard","no-record",""],["guard","busy","未写入任何文件"],["write","write-failed","磁盘写入失败"]])
  cmp("govReacceptFail "+ph+st, oldM["governance-view"].governanceReacceptFailureView, newM["governance-view"].governanceReacceptFailureView, [ph,st,msg]);
const establish = {writePaths:[".ans/x"],pinPaths:["a"],pinCount:1,roleCount:2,adoptExistingBoundary:false,boundaryPath:"b",governanceModel:"single",suggestedGovernanceModel:"trio",canConfirm:true,legacyBoundaryRoles:["old"]};
cmp("govEstablishPreview", oldM["governance-view"].governanceEstablishPreviewView, newM["governance-view"].governanceEstablishPreviewView, [establish]);
cmp("govEstablishPreview empty", oldM["governance-view"].governanceEstablishPreviewView, newM["governance-view"].governanceEstablishPreviewView, [{}]);
for (const [ph,code,msg] of [["precheck","already-established","已存在"],["precheck","busy",""],["precheck","invalid-record",""],["precheck","EACCES","x"],["write","EACCES","写入中断"]])
  cmp("govFailure "+ph+code, oldM["governance-view"].governanceFailureView, newM["governance-view"].governanceFailureView, [ph,code,msg]);
for (const m of ["single","trio","x"]) cmp("govModelOption "+m, oldM["governance-view"].governanceModelOptionText, newM["governance-view"].governanceModelOptionText, [m]);
cmp("govMigrationBtn false", oldM["governance-view"].governanceMigrationButtonView, newM["governance-view"].governanceMigrationButtonView, [false]);
cmp("govMigrationBtn true", oldM["governance-view"].governanceMigrationButtonView, newM["governance-view"].governanceMigrationButtonView, [true]);
const mig = {model:"single",targetModel:"trio",writePaths:[".ans/x"],modelField:null,pinChanges:[],retainedFiles:["a"],snapshotDigest:"c".repeat(64),manifestLine:"m"};
cmp("govMigrationPreview", oldM["governance-view"].governanceMigrationPreviewView, newM["governance-view"].governanceMigrationPreviewView, [mig]);
cmp("govMigrationPreview empty", oldM["governance-view"].governanceMigrationPreviewView, newM["governance-view"].governanceMigrationPreviewView, [{}]);
cmp("govMigrationSuccess", oldM["governance-view"].governanceMigrationSuccessText, newM["governance-view"].governanceMigrationSuccessText, []);
for (const [ph,st,msg] of [["guard","already-trio",""],["guard","no-record",""],["guard","blocked",""],["guard","preview-stale",""],["guard","busy",""],["guard","invalid-request",""],["guard","x",""],["write","write-failed",""],["write","x",""]])
  cmp("govMigrationFail "+ph+st, oldM["governance-view"].governanceMigrationFailureView, newM["governance-view"].governanceMigrationFailureView, [ph,st,msg]);
for (const req of [{cardKind:"proposal",flowId:"f",stepId:"s",paths:["a","b"],summary:"sum",artifactSha256:"h"},{cardKind:"intent-confirm"},{cardKind:"unknown"},{}])
  cmp("govCardMeta", oldM["governance-view"].governanceCardMetaView, newM["governance-view"].governanceCardMetaView, [req]);
cmp("govMirrorSource", oldM["governance-view"].governanceMirrorSourceLabel, newM["governance-view"].governanceMirrorSourceLabel, ["N"]);
cmp("govMirrorSource empty", oldM["governance-view"].governanceMirrorSourceLabel, newM["governance-view"].governanceMirrorSourceLabel, [""]);
cmp("govQueueAgg", oldM["governance-view"].governanceQueueAggregateText, newM["governance-view"].governanceQueueAggregateText, [2]);
cmp("govQueueAgg 0", oldM["governance-view"].governanceQueueAggregateText, newM["governance-view"].governanceQueueAggregateText, [0]);

cmp("runtimeLabel", oldM["runtime-config"].runtimeLabel, newM["runtime-config"].runtimeLabel, ["codex"]);
cmp("runtimeLabel unknown", oldM["runtime-config"].runtimeLabel, newM["runtime-config"].runtimeLabel, ["x"]);
for (const app of ["current","next-session","after-active-turn","x"]) {
  cmp("applicationLabel "+app, oldM["runtime-config"].applicationLabel, newM["runtime-config"].applicationLabel, [app]);
  cmp("applicationShort "+app, oldM["runtime-config"].applicationShortLabel, newM["runtime-config"].applicationShortLabel, [app]);
  cmp("configComplete "+app, oldM["runtime-config"].configCompleteText, newM["runtime-config"].configCompleteText, ["Pi",app]);
}
const field = {key:"K",label:"L",required:true,secret:false,choices:["a"],choiceLabels:["A"],source:"fallback",fallbackKey:"F",help:"H",value:"a",isSet:true};
cmp("sourceLabel", oldM["runtime-config"].sourceLabel, newM["runtime-config"].sourceLabel, [field]);
for (const src of ["file","environment","fallback","default","unset","x"]) cmp("sourceLabel "+src, oldM["runtime-config"].sourceLabel, newM["runtime-config"].sourceLabel, [{key:"K",source:src}]);
cmp("fieldHelp", oldM["runtime-config"].fieldHelp, newM["runtime-config"].fieldHelp, [field]);
cmp("fieldLabel", oldM["runtime-config"].fieldLabelText, newM["runtime-config"].fieldLabelText, [field]);
cmp("fieldLabel opt", oldM["runtime-config"].fieldLabelText, newM["runtime-config"].fieldLabelText, [{key:"K"}]);
cmp("configWarning", oldM["runtime-config"].configWarningText, newM["runtime-config"].configWarningText, ["Pi",["A","B"]]);
cmp("readFailure", oldM["runtime-config"].readFailureStatusText, newM["runtime-config"].readFailureStatusText, [new Error("boom")]);
cmp("saveFailure", oldM["runtime-config"].saveFailureStatusText, newM["runtime-config"].saveFailureStatusText, ["e"]);
cmp("saveFailure empty", oldM["runtime-config"].saveFailureStatusText, newM["runtime-config"].saveFailureStatusText, [""]);
cmp("saveException", oldM["runtime-config"].saveExceptionStatusText, newM["runtime-config"].saveExceptionStatusText, [new Error("e")]);
cmp("saving", oldM["runtime-config"].savingStatusText, newM["runtime-config"].savingStatusText, []);
cmp("savedText", oldM["runtime-config"].savedStatusText, newM["runtime-config"].savedStatusText, [["A","B"],["C"],"next-session"]);
cmp("savedText empty", oldM["runtime-config"].savedStatusText, newM["runtime-config"].savedStatusText, [[],[], "current"]);
cmp("savedTitle", oldM["runtime-config"].savedStatusTitle, newM["runtime-config"].savedStatusTitle, [["A","B"],["C"],"next-session"]);
cmp("savedTitle empty", oldM["runtime-config"].savedStatusTitle, newM["runtime-config"].savedStatusTitle, [[],[], "current"]);
cmp("missingNotice", oldM["runtime-config"].missingNoticeText, newM["runtime-config"].missingNoticeText, ["Pi",["A"]]);
cmp("readNotice", oldM["runtime-config"].readFailureNoticeText, newM["runtime-config"].readFailureNoticeText, ["Pi"]);
cmp("readingNotice", oldM["runtime-config"].readingNoticeText, newM["runtime-config"].readingNoticeText, ["Pi"]);
cmp("engineTitle", oldM["runtime-config"].engineSettingsTitle, newM["runtime-config"].engineSettingsTitle, ["Pi"]);
cmp("engineTab", oldM["runtime-config"].engineSettingsTabTitle, newM["runtime-config"].engineSettingsTabTitle, ["Pi"]);
cmp("openEngine", oldM["runtime-config"].openEngineSettingsLabel, newM["runtime-config"].openEngineSettingsLabel, ["Pi"]);
const good = {runtime:"pi",fields:[],missingKeys:[]};
cmp("validate", oldM["runtime-config"].validateRuntimeConfigView, newM["runtime-config"].validateRuntimeConfigView, [good,"pi"]);
cmp("validate bad", oldM["runtime-config"].validateRuntimeConfigView, newM["runtime-config"].validateRuntimeConfigView, [{...good,fields:null},"pi"]);

for (const x of [{redacted:true,truncated:true},null]) cmp("textFlags", oldM["report-view"].textFlags, newM["report-view"].textFlags, [x]);
cmp("metadataLabel", oldM["report-view"].metadataLabel, newM["report-view"].metadataLabel, [["timestamp","anchor-token","oversize-identity"]]);
cmp("reportDeclaration", oldM["report-view"].reportDeclaration, newM["report-view"].reportDeclaration, [report()]);
cmp("reportOrigin", oldM["report-view"].reportOriginLabel, newM["report-view"].reportOriginLabel, ["terminal-fallback"]);
cmp("reportFlags", oldM["report-view"].reportFlags, newM["report-view"].reportFlags, [{summary:{redacted:true,truncated:true},evidence:[{redacted:true},{truncated:true}],evidenceOmitted:2}]);
for (const [v,t] of [[{state:"saved"},false],[{state:"already-saved"},true],[{state:"pending"},false],[{state:"failed",retryAvailable:true},false],[{state:"disabled"},false],[{state:"unknown-live"},false],[{state:"expired"},false],[{state:"failed",code:"CONFLICT"},false],[null,false]])
  cmp("persistence "+JSON.stringify(v)+t, oldM["report-view"].persistenceView, newM["report-view"].persistenceView, [v,t]);
cmp("retryLabel", oldM["report-view"].retryLabel, newM["report-view"].retryLabel, [true]);
cmp("deliveryFacts", oldM["report-view"].deliveryBatchFacts, newM["report-view"].deliveryBatchFacts, [{version:1,inputSaved:true,history:"saved",outcome:"completed"},null]);
cmp("deliveryFacts none", oldM["report-view"].deliveryBatchFacts, newM["report-view"].deliveryBatchFacts, [null,null]);
cmp("deliveryTitle", oldM["report-view"].deliveryBatchTitle, newM["report-view"].deliveryBatchTitle, [2]);
cmp("safeCopyFlags", oldM["report-view"].safeCopyFlags, newM["report-view"].safeCopyFlags, [{redacted:true,truncated:true,summaryTruncated:true}]);
cmp("safeCopyText missing", oldM["report-view"].safeCopyText, newM["report-view"].safeCopyText, [{version:1,source:"other"},"t"]);
cmp("historyProjection", oldM["report-view"].historyProjectionText, newM["report-view"].historyProjectionText, [{reportErrors:[{}],projection:{omittedEntries:12,invalidEntries:2,truncated:true},skipped:3}]);
cmp("historyProjection empty", oldM["report-view"].historyProjectionText, newM["report-view"].historyProjectionText, [{}]);

for (const code of ["INVALID_REQUEST","PROJECT_NOT_GRANTED","NOT_FOUND","UNKNOWN","IO_ERROR"]) cmp("docErr "+code, oldM["document-view"].documentErrorText, newM["document-view"].documentErrorText, [code]);
cmp("docStatus", oldM["document-view"].documentStatusText, newM["document-view"].documentStatusText, [{byteLength:5}]);
cmp("docSourceTitle", oldM["document-view"].documentSourceTitle, newM["document-view"].documentSourceTitle, ["R"]);
cmp("docSourceTitle empty", oldM["document-view"].documentSourceTitle, newM["document-view"].documentSourceTitle, [""]);

const items = [{turnId:"t",callId:"c1",toolName:"read_file",status:"denied",summary:"s"},{turnId:"t",callId:"c1",toolName:"read_file",status:"failed",summary:"s"},{turnId:"t",callId:"c2",toolName:"run_shell",status:"completed",summary:"s"},{turnId:"t",callId:"c3",status:"unknown",summary:"s"}];
cmp("mergePhases", oldM["tool-summary"].mergePhases, newM["tool-summary"].mergePhases, [items]);
cmp("phaseRowView", oldM["tool-summary"].phaseRowView, newM["tool-summary"].phaseRowView, [oldM["tool-summary"].mergePhases(items)[0]]);
for (const st of ["running","denied","failed","timed-out","completed","returned","unknown","recorded","other"]) cmp("phaseLabel "+st, oldM["tool-summary"].activityPhaseLabel, newM["tool-summary"].activityPhaseLabel, [{status:st,statusText:""}]);
cmp("callSummary", oldM["tool-summary"].callSummary, newM["tool-summary"].callSummary, [items]);
cmp("foldSummary", oldM["tool-summary"].foldSummaryText, newM["tool-summary"].foldSummaryText, [oldM["tool-summary"].callSummary(items)]);

for (const input of [{status:"complete"},{status:"complete",durationMs:2000},{status:"omitted",durationMs:2000},{status:"complete",durationMs:2000,partialOmitted:true}])
  cmp("reasoningLabel "+JSON.stringify(input), oldM.reasoning.reasoningLabel, newM.reasoning.reasoningLabel, [input]);
cmp("reasoningRowData", oldM.reasoning.reasoningRowDataFromPiece, newM.reasoning.reasoningRowDataFromPiece, [{status:"complete",text:"x",durationMs:1000}]);
cmp("mergeReasoning", oldM.reasoning.mergeReasoningRowData, newM.reasoning.mergeReasoningRowData, [{pieces:[]},{status:"complete",text:"x",durationMs:1000}]);

cmp("operatorFinal confirm", oldM["operator-view"].operatorFinalNote, newM["operator-view"].operatorFinalNote, [{kind:"confirm",confirmed:true}]);
cmp("operatorFinal deny", oldM["operator-view"].operatorFinalNote, newM["operator-view"].operatorFinalNote, [{kind:"confirm",confirmed:false}]);
cmp("operatorFinal cancel", oldM["operator-view"].operatorFinalNote, newM["operator-view"].operatorFinalNote, [{kind:"choice",cancelled:true}]);
cmp("operatorFinal submit", oldM["operator-view"].operatorFinalNote, newM["operator-view"].operatorFinalNote, [{kind:"choice"}]);
cmp("operatorExpired", oldM["operator-view"].operatorExpiredNote, newM["operator-view"].operatorExpiredNote, ["r"]);
cmp("operatorExpired empty", oldM["operator-view"].operatorExpiredNote, newM["operator-view"].operatorExpiredNote, [""]);
cmp("operatorRetry", oldM["operator-view"].operatorRetryNote, newM["operator-view"].operatorRetryNote, ["e"]);
cmp("operatorRetry empty", oldM["operator-view"].operatorRetryNote, newM["operator-view"].operatorRetryNote, [""]);
const pending = {a:{roleId:"r",request:{kind:"choice"}},b:{roleId:"r",request:{kind:"confirm"}}};
cmp("pendingKindFor", oldM["operator-view"].pendingKindFor, newM["operator-view"].pendingKindFor, [pending,"r"]);
cmp("pendingKindFor empty", oldM["operator-view"].pendingKindFor, newM["operator-view"].pendingKindFor, [{}, "r"]);
cmp("operatorCardMeta", oldM["operator-view"].operatorCardMeta, newM["operator-view"].operatorCardMeta, [{request:{cardKind:"proposal",flowId:"f"}}]);

cmp("judgeGroupLabel", oldM.judge.judgeGroupLabel, newM.judge.judgeGroupLabel, ["decision"]);
for (const [p,r] of [["su-approval","A"],["project","A"],["su-approval","verifier"]]) cmp("shellConfirmTitle "+p+r, oldM.judge.shellConfirmTitle, newM.judge.shellConfirmTitle, [p,r]);
for (const t of ["risky","review","deny","x"]) cmp("tier "+t, oldM.judge.suApprovalTierLabel, newM.judge.suApprovalTierLabel, [t]);
for (const e of ["claude","pi","codex","x",""]) cmp("judgeEngine "+e, oldM.judge.shellJudgeEngineLabel, newM.judge.shellJudgeEngineLabel, [e]);
for (const [g,a,en,b,o] of [["approval",false,false,false,null],["approval",true,true,false,null],["decision",true,true,false,{singleDisabled:true}],["decision",true,true,true,null]])
  cmp("judgeToggle "+g+a+en+b, oldM.judge.judgeToggleView, newM.judge.judgeToggleView, [g,a,en,b,o]);
cmp("judgeWarningLines", oldM.judge.judgeWarningLines, newM.judge.judgeWarningLines, [["approval","decision"]]);
cmp("toggleResult fail", oldM.judge.shellJudgeToggleResult, newM.judge.shellJudgeToggleResult, [false,{}]);
const sj = {verdict:"deny",engine:"pi",reason:"r",alternative:{value:"v",rationale:"q"},tier:"risky",customerMessage:"c",summary:"s",at:"t",toolCallId:"id",command:"cmd",cwd:"cwd",evidence:["e"],label:"l",operator:"op"};
cmp("shellJudgeResult", oldM.judge.shellJudgeResultView, newM.judge.shellJudgeResultView, [sj]);
cmp("shellJudgeResult manual", oldM.judge.shellJudgeResultView, newM.judge.shellJudgeResultView, [{verdict:"manual"}]);
const gj = {group:"decision",cardKind:"proposal",flowId:"f",engine:"claude",reason:"r",selected:["accept"],paths:["p"],evidence:["e"],durationMs:1200,readCalls:2,readBytes:4096,toolCallId:"id",requestId:"rid"};
cmp("govJudgeResult", oldM.judge.governanceJudgeResultView, newM.judge.governanceJudgeResultView, [gj]);
const gj2 = {group:"approval",cardKind:"write",paths:["a","b","c","d"],pathDecisions:[{path:"a",ok:true},{path:"b",ok:false,reason:"r"}]};
cmp("govJudgeResult write4", oldM.judge.governanceJudgeResultView, newM.judge.governanceJudgeResultView, [gj2]);
for (const a of ["abort-turn","rebuild-session","redeliver","x"]) cmp("recoveryAction "+a, oldM.judge.recoveryActionView, newM.judge.recoveryActionView, [a]);

for (const a of [{denied:true},{timedOut:true},{exitCode:2},{failed:true},{phase:"call"},{phase:"blocked"},{phase:"result",completed:true},{phase:"result",returned:true},{phase:"result"},{}])
  cmp("toolStatus "+JSON.stringify(a), oldM.events.toolStatus, newM.events.toolStatus, [a]);
for (const a of [{timedOut:true},{status:"exited-nonzero",exitCode:3},{failed:true},{denied:true},{status:"running"},{status:"completed"},{status:"returned"},{}])
  cmp("activityPhaseLabel "+JSON.stringify(a), oldM.events.activityPhaseLabel, newM.events.activityPhaseLabel, [a]);
for (const t of ["用户指令：[派发] 来自 A 的 任务","[系统·安装] x","【系统通知】hello","【系统通知·子类】hello","[派发] 来自 A 的 x","[回交] x","plain"])
  cmp("classifyInjected "+t, oldM.events.classifyInjected, newM.events.classifyInjected, [t]);
for (const r of [{kind:"user",text:"[派发] x"},{kind:"assistant",text:"a"},{kind:"tool",text:"read_file: a.md",activity:{toolName:"read_file"}},{kind:"denied",text:"read_file 失败：a（x）"},{kind:"mystery",text:""}])
  cmp("historyRowToDescriptor "+JSON.stringify(r), oldM.events.historyRowToDescriptor, newM.events.historyRowToDescriptor, [r]);
console.log(`checks=${checks} fails=${fails}`);
if (fails) process.exit(1);
