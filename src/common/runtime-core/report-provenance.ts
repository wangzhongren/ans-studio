// Pure C2 value construction; no Service/Provider/desktop imports or filesystem access.
import { createHash } from 'node:crypto';
import { RUNTIME_KINDS } from '../shared/runtime-shared.ts';
import { jsonBytes, utf8Prefix } from './tool-display.ts';
import type { DisplayTextV1, RuntimeReportDraftV1, RuntimeReportSnapshotV1, RuntimeLiveReportDraftV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, RuntimeInputTextProjectionV1 } from '../../model/runtime.ts';
export const REPORT_LIMITS=Object.freeze({summary:16384,evidence:2048,evidenceCount:32,snapshot:98304,input:1048576,members:256,retention:16777216,receipts:128});
export function canonicalJson(value:unknown):string{return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
export type TextProtector=(text:string,max:number,prior?:Partial<DisplayTextV1>)=>DisplayTextV1;
export function reportIdFor(source:{roleId:string;runtime:string;turnId:string}):string{return createHash('sha256').update(JSON.stringify([source.runtime,source.roleId,source.turnId,'terminal-handback-v1'])).digest('hex');}
export function validId(value:unknown):value is string{return typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=4096&&!value.includes('\0');}
export function validAttemptId(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);}
const statuses=['completed','blocked','unreported','failed','aborted'];
export function projectLiveReport(draft:RuntimeLiveReportDraftV1,protect:TextProtector):RuntimeLiveReportViewV1{
  if(!draft||!validId(draft.source?.roleId)||(draft.source.runtime!==undefined&&!(RUNTIME_KINDS as readonly unknown[]).includes(draft.source.runtime))||(draft.source.turnId!==undefined&&!validId(draft.source.turnId))||(draft.taskId!==null&&!validId(draft.taskId))||!statuses.includes(draft.status)||typeof draft.summary!=='string'||!Array.isArray(draft.evidence)||!draft.evidence.every(x=>typeof x==='string')||typeof draft.at!=='string'||Buffer.byteLength(draft.at)>128||(draft.origin!==undefined&&!['submitted-report','terminal-fallback'].includes(draft.origin)))throw new Error('INVALID');
  const report:RuntimeLiveReportViewV1={source:{roleId:draft.source.roleId,...(draft.source.runtime!==undefined?{runtime:draft.source.runtime}:{}),...(draft.source.turnId!==undefined?{turnId:draft.source.turnId}:{})},taskId:draft.taskId, ...(draft.origin?{origin:draft.origin}:{}),status:draft.status,summary:protect(draft.summary,REPORT_LIMITS.summary),evidence:draft.evidence.slice(0,REPORT_LIMITS.evidenceCount).map(text=>protect(text,REPORT_LIMITS.evidence)),evidenceOmitted:Math.max(0,draft.evidence.length-REPORT_LIMITS.evidenceCount),at:protect(draft.at,128).text};
  while(jsonBytes(report)>REPORT_LIMITS.snapshot&&report.evidence.length){report.evidence=report.evidence.slice(0,-1);report.evidenceOmitted++;}
  if(jsonBytes(report)>REPORT_LIMITS.snapshot)throw new Error('PROVENANCE_TOO_LARGE');
  return report;
}
export function makeReportSnapshot(draft:RuntimeReportDraftV1,protect:TextProtector):RuntimeReportSnapshotV1{
  if(!draft?.source||!validId(draft.source.turnId)||!(RUNTIME_KINDS as readonly unknown[]).includes(draft.source.runtime)||!['submitted-report','terminal-fallback'].includes(draft.origin))throw new Error('INVALID');
  const live=projectLiveReport(draft,protect);
  const snapshot:RuntimeReportSnapshotV1={...live,source:{roleId:draft.source.roleId,runtime:draft.source.runtime,turnId:draft.source.turnId},origin:draft.origin,version:1,reportId:reportIdFor(draft.source)};
  while(jsonBytes(snapshot)>REPORT_LIMITS.snapshot&&snapshot.evidence.length){snapshot.evidence=snapshot.evidence.slice(0,-1);snapshot.evidenceOmitted++;}
  if(jsonBytes(snapshot)>REPORT_LIMITS.snapshot)throw new Error('PROVENANCE_TOO_LARGE');
  return snapshot;
}
const displayText=(value:unknown,max:number):value is DisplayTextV1=>!!value&&typeof value==='object'&&typeof (value as DisplayTextV1).text==='string'&&typeof (value as DisplayTextV1).truncated==='boolean'&&typeof (value as DisplayTextV1).redacted==='boolean'&&Buffer.byteLength((value as DisplayTextV1).text)<=max;
export function validateReportSnapshot(value:unknown):RuntimeReportSnapshotV1{
  const report=value as RuntimeReportSnapshotV1;
  if(!report||report.version!==1||!validId(report.source?.roleId)||!validId(report.source?.turnId)||!(RUNTIME_KINDS as readonly unknown[]).includes(report.source?.runtime)||report.reportId!==reportIdFor(report.source)||!['submitted-report','terminal-fallback'].includes(report.origin)||!statuses.includes(report.status)||(report.taskId!==null&&!validId(report.taskId))||typeof report.at!=='string'||Buffer.byteLength(report.at)>128||!displayText(report.summary,REPORT_LIMITS.summary)||!Array.isArray(report.evidence)||report.evidence.length>32||!report.evidence.every(x=>displayText(x,REPORT_LIMITS.evidence))||!Number.isSafeInteger(report.evidenceOmitted)||report.evidenceOmitted<0||jsonBytes(report)>REPORT_LIMITS.snapshot)throw new Error('INVALID');
  return {version:1,reportId:report.reportId,source:{roleId:report.source.roleId,runtime:report.source.runtime,turnId:report.source.turnId},taskId:report.taskId,origin:report.origin,status:report.status,summary:{text:report.summary.text,truncated:report.summary.truncated,redacted:report.summary.redacted},evidence:report.evidence.map(item=>({text:item.text,truncated:item.truncated,redacted:item.redacted})),evidenceOmitted:report.evidenceOmitted,at:report.at};
}
export function validateProvenance(value:RuntimeInputProvenanceV1,target:{roleId:string;runtime:string}):RuntimeInputProvenanceV1{
  if(!value||value.version!==1||value.kind!=='handback'||!validAttemptId(value.attemptId)||!validAttemptId(value.deliveryId)||value.target?.roleId!==target.roleId||value.target?.runtime!==target.runtime||!Array.isArray(value.reports)||!value.reports.length)throw new Error('INVALID');
  if(value.reports.length>REPORT_LIMITS.members||jsonBytes(value)>REPORT_LIMITS.input)throw new Error('PROVENANCE_TOO_LARGE');
  const reports=value.reports.map(validateReportSnapshot);
  if(new Set(reports.map(x=>x.reportId)).size!==reports.length)throw new Error('INVALID');
  return {version:1,kind:'handback',deliveryId:value.deliveryId,attemptId:value.attemptId,target:{roleId:value.target.roleId,runtime:value.target.runtime},reports};
}
export function validateLivePresentation(value:RuntimeLiveHandbackPresentationV1,protect:TextProtector):RuntimeLiveHandbackPresentationV1{
  if(!value||value.version!==1||value.kind!=='handback-live'||!['memory-only','unknown-live'].includes(value.durability)||!Array.isArray(value.reports)||!value.reports.length)throw new Error('INVALID');
  if(value.reports.length>REPORT_LIMITS.members||jsonBytes(value)>REPORT_LIMITS.input)throw new Error('PROVENANCE_TOO_LARGE');
  const reports=value.reports.map(view=>{
    if(!displayText(view.summary,REPORT_LIMITS.summary)||!Array.isArray(view.evidence)||view.evidence.length>32||!view.evidence.every((x:DisplayTextV1)=>displayText(x,REPORT_LIMITS.evidence))||!Number.isSafeInteger(view.evidenceOmitted)||view.evidenceOmitted<0)throw new Error('INVALID');
    const safe=projectLiveReport({...view,summary:view.summary.text,evidence:view.evidence.map((x:DisplayTextV1)=>x.text)},protect);
    safe.summary=protect(view.summary.text,REPORT_LIMITS.summary,view.summary);
    safe.evidence=safe.evidence.map((x,i)=>protect(x.text,REPORT_LIMITS.evidence,view.evidence[i]));
    safe.evidenceOmitted+=view.evidenceOmitted;return safe;
  });
  const hasIdentity=value.deliveryId!==undefined||value.attemptId!==undefined||value.target!==undefined;
  if(hasIdentity&&(!validAttemptId(value.deliveryId)||!validAttemptId(value.attemptId)||!validId(value.target?.roleId)||!(RUNTIME_KINDS as readonly unknown[]).includes(value.target?.runtime)))throw Error('INVALID');
  const result:RuntimeLiveHandbackPresentationV1={version:1,kind:'handback-live',durability:value.durability,reports,...(hasIdentity?{deliveryId:value.deliveryId,attemptId:value.attemptId,target:{roleId:value.target!.roleId,runtime:value.target!.runtime}}:{})};
  if(jsonBytes(result)>REPORT_LIMITS.input)throw new Error('PROVENANCE_TOO_LARGE');return result;
}
export function projectHandbackInput(text:string,protect:TextProtector):{text:string;summary:string;projection:RuntimeInputTextProjectionV1}{
  const display=protect(text,16384);const summaryText=`用户指令：${display.text}`;const summary=utf8Prefix(summaryText,1024);
  return {text:display.text,summary,projection:{version:1,source:'trusted-handback-display',modelInputRecorded:false,redacted:display.redacted,truncated:display.truncated,summaryTruncated:summary!==summaryText}};
}
