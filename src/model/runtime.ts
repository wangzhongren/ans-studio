// SDK-free public runtime contracts. Primary owner: 运行时核心.
// Legacy Pi public shapes are preserved. SDK adapters confirm native context; ANS replay does not.
import type { ResolvedRole } from "./role.ts";
import type { WriteDecision } from "./decision.ts";
import type { PinEntry } from "./boundary.ts";
import type { RuntimeKind } from "../common/shared/runtime-shared.ts";
import type { createDiagnosticLogger } from "../common/shared/diagnostics.ts";
export type { RuntimeKind } from "../common/shared/runtime-shared.ts";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SessionEvent {
  runtime?: RuntimeKind;
  roleId?: string;
  turnId?: string;
  kind: "tool_call" | "denied" | "accepted" | "message" | "settled";
  summary: string;
  detail?: unknown;
}

/** Trusted input echo identity; consumers use the event's actual turnId, never its summary text. */
export interface PromptInputEventDetail {
  source: "prompt-input";
  text: string;
  inputTextProjection?:RuntimeInputTextProjectionV1;
  inputProvenance?:RuntimeInputProvenanceV1;
  inputPresentation?:RuntimeLiveHandbackPresentationV1;
  imageCount?: number;
}

export interface PromptImage {
  type: "image";

  data: string;

  mimeType: string;
}

export interface PromptTurnStartedMetadata {
  readonly turnId: string;
  readonly roleId: string;
  readonly runtime: RuntimeKind;
}

export interface PromptOptions {
  inputProvenance?:RuntimeInputProvenanceV1;
  inputPresentation?:RuntimeLiveHandbackPresentationV1;
  onDeliveryProgress?:(progress:RuntimeDeliveryProgressV1)=>void;
  /** Synchronous Core-only acknowledgement of an actual new turn, before persistence/native work. */
  onTurnStarted?: (metadata: PromptTurnStartedMetadata) => void;
  images?: PromptImage[];
}

export interface RoleSession {
  readonly persistence?:RuntimeSessionPersistence;
  runtime?: RuntimeKind;
  roleId?: string;

  contextSource?: RuntimeContextSource;
  nativeSessionId?: string;
  contextWarning?: string;

  prompt(text: string, opts?: PromptOptions): Promise<void>;
  events(): AsyncIterable<SessionEvent>;

  abort?(): Promise<void> | void;
  dispose(): Promise<void>;
}

export type WriteGate = (targetPath: string) => WriteDecision;

export interface ShellReviewRequest {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
}

export type ShellReviewResult = { allow: true; by: string } | { allow: false; reason: string; by: string };

export type ShellGate = (req: ShellReviewRequest) => Promise<ShellReviewResult>;

export interface OperatorPrompt {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;

  reason?: string;
}

export type OperatorOutcome =
  | { outcome: "allow"; operatorId?: string }
  | { outcome: "deny"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

export type OperatorChannelFn = (
  prompt: OperatorPrompt,
) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined;

export type FinalizeStatus =
  | "completed"
  | "declined"
  | "unavailable"
  | "not-genesis"
  | "nothing-to-pin"
  | "blocked";

export interface FinalizeResult {
  ok: boolean;
  status?: FinalizeStatus;
  message?: string;
  reason?: string;
  wrote: string[];
  pins: PinEntry[];
  roles: string[];
  projectJsonRel: string;
  manifestRel: string;
}

export interface CustomerInputOption {

  id: string;

  label: string;

  description?: string;
}

export type CustomerInputRequest =
  | {
      kind: "confirm";

      title: string;

      preview?: string;

      detail?: string;
    }
  | {
      kind: "choice";
      title: string;
      question?: string;
      options: CustomerInputOption[];

      multiple?: boolean;
      preview?: string;
    };

export type CustomerInputOutcome =
  | { outcome: "answered"; value: { confirmed?: boolean; selected?: string[] }; operatorId?: string }
  | { outcome: "declined"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

/** Captured at invocation. Issuers must reject late consent when this original signal is aborted. */
export interface CustomerInputMetadata {
  signal?: AbortSignal;
  turnId?: string;
  roleId?: string;
  runtime?: RuntimeKind;
  /** Original handler call identity for presentation only; missing legacy IDs stay missing. */
  toolCallId?: string;
}

export type CustomerInputFn = (
  req: CustomerInputRequest,
  metadata?: CustomerInputMetadata,
) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined;

export interface ReportHandbackPayload {

  status: "completed" | "blocked";

  summary: string;

  evidence?: string[];
}

export interface ReportHandbackReceipt {
  state?:"accepted-memory";
  ok: boolean;
  message?: string;
}

export interface ReportHandbackMetadata {
  turnId: string;
  roleId?: string;
  runtime?: RuntimeKind;
}

export type ReportHandbackFn = (
  report: ReportHandbackPayload,
  metadata?: ReportHandbackMetadata,
) =>
  | ReportHandbackReceipt
  | null
  | undefined
  | void
  | Promise<ReportHandbackReceipt | null | undefined | void>;

export interface DispatchTaskPayload {

  roleId: string;

  task: string;

  reason?: string;
}

export interface DispatchReceipt {
  ok: boolean;
  message?: string;
}

export type DispatchTaskFn = (
  dispatch: DispatchTaskPayload,
  metadata?: ReportHandbackMetadata,
) => DispatchReceipt | null | undefined | void | Promise<DispatchReceipt | null | undefined | void>;

export interface ShellVerdictPayload {

  verdict: "allow" | "deny" | "unsure";

  reason?: string;
}

export type ShellVerdictFn = (verdict: ShellVerdictPayload) => void | Promise<void>;

export interface RuntimeAdapter {
  composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }>;
  bindRole(role: ResolvedRole): Promise<RoleSession>;
}

export type RuntimeContextSource = "in-memory" | "fresh" | "resumed" | "recovered";
export type RuntimeTurnOutcome = "completed" | "failed" | "aborted" | "timed_out";
export type JsonSchema = Record<string, unknown>;
export type DiagnosticLog = ReturnType<typeof createDiagnosticLogger>;

export interface InteractionGate {
  begin(): void;
  end(): void;
  isWaiting(): boolean;
  onChange(listener: (waiting: boolean) => void): () => void;
}

export interface ToolExecutionCall extends ToolCall {
  toolCallId?: string;
  signal?: AbortSignal;
}
export interface ToolResult { ok: boolean; message: string; execution?: RuntimeToolExecutionFactsV1 }

export interface ToolDefinition {
  displayInputRule?: ToolDisplayInputRuleV1;
  name: string;
  description: string;
  inputSchema: JsonSchema;
  promptGuidelines?: string[];
  executionMode?: "sequential" | "parallel";
  handler(call: ToolExecutionCall): Promise<ToolResult>;
}

export interface GovernedToolsOptions {
  extraCredentialEnvVars?: readonly string[];
  currentTurnId?: () => string | undefined;
  roleId?: string;
  runtime?: RuntimeKind;
  diagnostics?: DiagnosticLog;
  readRoot?: string;
  writeRoot?: string;
  shellGate?: ShellGate;
  shellCwd?: string;
  shellReviewTimeoutMs?: number;
  /**
   * 命令级执行时限（F-1）：spawn 之后命令自身的最长运行时长（毫秒）。
   * 生效链：本选项 ?? 环境变量 `ANS_PI_SHELL_EXEC_TIMEOUT_MS` ?? 默认 600000（非法/0/负一律回退默认，
   * **不可禁用**）。到期命令被终止、工具如实返回「超时已终止（N ms）」，轮次继续。
   */
  shellExecTimeoutMs?: number;
  customerInput?: CustomerInputFn;
  customerInputTimeoutMs?: number;
  interactionGate?: InteractionGate;
  reportHandback?: ReportHandbackFn;
  dispatchTask?: DispatchTaskFn;
  shellVerdict?: ShellVerdictFn;
}

export interface RuntimeSessionRecord {
  version: 1;
  id: string;
  roleId: string;
  runtime: RuntimeKind;
  contextSource: RuntimeContextSource;
  nativeSessionId?: string;
  contextWarning?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeReplayEntry {
  entryId?:string;
  inputProvenance?:RuntimeInputProvenanceV1;
  inputTextProjection?:RuntimeInputTextProjectionV1;
  at: string;
  kind: "user" | "event";
  text?: string;
  event?: SessionEvent;
  turnId?: string;
}

export interface RuntimeSessionStorage {
  saveReport?(report:RuntimeReportSnapshotV1):Promise<"saved"|"already-saved">;
  readReports?():Promise<{reports:RuntimeReportSnapshotV1[];reportErrors:{reportId?:string;code:string}[]}>;
  checkpointReplay?():Promise<RuntimeReplayCheckpoint>;
  repairReplayTail?(checkpoint:RuntimeReplayCheckpoint,entries:readonly RuntimeReplayEntry[],record?:RuntimeSessionRecord):Promise<void>;
  readonly runtime: RuntimeKind;
  readonly roleId: string;
  readonly directory: string;
  readonly nativeDirectory: string;

  readonly legacyDirectory?: string;
  /** Validate before native read/resume; does not create directories. */
  validateNativeDirectory?(): Promise<void>;
  /** Invoke at actual native persistence, not at store construction/read. */
  prepareNativeDirectory?(): Promise<void>;
  readLatest(): Promise<RuntimeSessionRecord | undefined>;
  saveSession(record: RuntimeSessionRecord): Promise<void>;
  appendReplay(entries: readonly RuntimeReplayEntry[]): Promise<void>;
  readReplay(): Promise<RuntimeReplayEntry[]>;
}

export interface RuntimeProviderOptions {
  toolDisplayMode?: "required-v1" | "legacy-standalone";
  projectToolEvent?: RuntimeToolEventProjector;
  registerToolDisplayProfile?: RegisterRuntimeToolDisplayProfileV1;
  toolDisplayCredentialEnvNames?: readonly string[];
  runtime: RuntimeKind;
  projectRoot: string;
  skillRoot: string;
  tools: readonly ToolDefinition[];
  storage?: RuntimeSessionStorage;
  interactionGate: InteractionGate;
  currentTurnId: () => string | undefined;
  modelId?: string;
  baseUrl?: string;
  providerId?: string;
  apiKeyEnvVar?: string;
  promptTimeoutMs?: number;
  constructTimeoutMs?: number;
}
export type RuntimeProviderFactory = (options: RuntimeProviderOptions) => RuntimeAdapter | Promise<RuntimeAdapter>;

// A4 public display contracts. No SDK or desktop types.
export type DisplayTextV1 = {
  text: string;
  truncated: boolean; // 展示预算裁去字符，或源已明确截断
  redacted: boolean;  // 这段文本实际发生替换
};
export type ToolDisplayV1 = {
  version: 1;
  target?: { kind: 'path' | 'command'; value: DisplayTextV1 };
  resultText?: DisplayTextV1;
  error?: DisplayTextV1;
  process?: {
    exitCode?: number;
    /** 进程因**命令级执行时限**被终止（F-1；与「停止本轮」的 ABORTED 语义区分）。 */
    timedOut?: boolean;
    signal?: string;
    stdout?: DisplayTextV1;
    stderr?: DisplayTextV1;
  };
  durationMs?: number;
  omissions: ('budget' | 'unsupported-input' | 'unsupported-content')[];
};
export type ToolEventDetailV1 = {
  toolName: string; toolCallId?: string; turnId?: string;
  phase: 'start' | 'blocked' | 'result';
  ok?: boolean; status?: 'completed' | 'failed'; errorCode?: string;
  display?: ToolDisplayV1;
};

export type ToolDisplayInputRuleV1 = 'core-path-v1' | 'core-command-v1' | 'none';
export type RuntimeToolExecutionFactsV1 = {
  exitCode?:number; signal?:string;
  stdout?:string; stderr?:string; error?:string;
  stdoutTruncated?:boolean; stderrTruncated?:boolean;
  /** 命令因**命令级执行时限**被终止（F-1，可选向后兼容字段；与「停止本轮」的 ABORTED 语义区分）。 */
  timedOut?:boolean;
  /** 触发终止的**生效**时限（毫秒；仅 timedOut 时携带）。 */
  timeoutMs?:number;
};
export type RuntimeToolResultFactsV1 = {
  ok:boolean; message:string; execution?:RuntimeToolExecutionFactsV1;
};
export type RuntimeToolErrorFactsV1 = { message?:string; code?:string };
export type RuntimeNativeToolResultFactsV1 = {
  isError:boolean;
  content:readonly ({type:'text';text:string}|{type:'unsupported'})[];
};
export type RuntimeToolEventIdentityV1 = {
  toolName:string; toolCallId?:string; turnId?:string;
  runtime?:RuntimeKind; roleId?:string;
};
export type RuntimeToolInputFactsV1 = {
  rule?:ToolDisplayInputRuleV1;
  args:Readonly<Record<string,unknown>>;
};
export type RuntimeToolEventFactsV1 = RuntimeToolEventIdentityV1 & {
  input?:RuntimeToolInputFactsV1;
  durationMs?:number;
} & (
  | {phase:'start';origin:'native-start'|'handler-start'}
  | {phase:'blocked';origin:'governance-hook';
     result?:{ok:false;message:string};error?:RuntimeToolErrorFactsV1}
  | {phase:'result';origin:'handler-result'|'native-result';
     result?:RuntimeToolResultFactsV1;error?:RuntimeToolErrorFactsV1;
     native?:RuntimeNativeToolResultFactsV1}
);
export type RuntimeToolEventSource = RuntimeToolEventFactsV1
  | {origin:'projected-event';event:SessionEvent}
  | {origin:'legacy-event';event:SessionEvent}
  | {origin:'diagnostic';code:'CALL_CONTEXT_UNATTRIBUTED'};
export type RuntimeToolDisplayDiagnosticDetailV1 = {
  version:1;source:'tool-display-diagnostic';
  code:'IDENTITY_TOO_LARGE'|'PROJECTION_FAILED'|'RESULT_OUTCOME_UNAVAILABLE'
    |'DISPLAY_PROFILE_NOT_READY'|'CALL_CONTEXT_UNATTRIBUTED';
};
export type ProjectedRuntimeToolEventV1 = Omit<SessionEvent,'kind'|'detail'> & (
  | {kind:'tool_call'|'accepted'|'denied';detail:ToolEventDetailV1}
  | {kind:'message';detail:RuntimeToolDisplayDiagnosticDetailV1}
);
export type RuntimeToolEventProjector = (
  source:RuntimeToolEventSource,
  redactText?:(text:string)=>string
) => ProjectedRuntimeToolEventV1;
// ToolResult兼容增加 execution?:RuntimeToolExecutionFactsV1。
// ToolDefinition兼容增加 displayInputRule?:ToolDisplayInputRuleV1。

export type RuntimeToolDisplayProfileV1 = {
  apiKeyEnvVar?:string;
  credentials:readonly {name:string;value?:string}[];
};
export type RegisterRuntimeToolDisplayProfileV1 = (profile:RuntimeToolDisplayProfileV1)=>void;
// RuntimeProviderOptions新增：
// toolDisplayMode?: 'required-v1'|'legacy-standalone';
// projectToolEvent?:RuntimeToolEventProjector;
// registerToolDisplayProfile?:RegisterRuntimeToolDisplayProfileV1;
// toolDisplayCredentialEnvNames?:readonly string[];

export type LegacyAnchorTokenV1 = {
  token:string; position:'request'|'conclusion';
  nativeCallId?:string;
};
export type RuntimeLegacyToolFactsV1 = {
  toolName:string;
  phase:'start'|'result';
  toolCallId?:string;
  turnId?:string; // 只保当时实际details.turnId；不假装新Core ACK
  ok?:boolean;
  reportedStatus?:'completed'|'returned'|'failed'|'unknown';
  statusSource?:'native-result'|'tool-details'|'legacy-classifier';
  target?:{
    kind:'path'|'command';value:string;
    source:'argument'|'tool-detail'|'same-call';
  };
};
export type RuntimeLegacyHistoryEntryV1 = {
  at?:string;
  anchor?:LegacyAnchorTokenV1;
} & (
  | {kind:'user-text'|'assistant-text';text:string}
  | {kind:'tool-record';text:string;tool:RuntimeLegacyToolFactsV1}
);
export type RuntimeLegacyHistoryProjectionInputV1 = {
  scope:{roleId:string;runtime:'pi'};
  readOk:boolean;
  entries:readonly RuntimeLegacyHistoryEntryV1[];
  source?:string; // 原reader选中的文件名，仅显示值，不是读指令
  error?:string;
  skipped:number;
  credentialEnvNames?:readonly string[];
};
export type RuntimeProtectedLegacyToolFactsV1 = Omit<RuntimeLegacyToolFactsV1,'target'> & {
  target?:{
    kind:'path'|'command';value:DisplayTextV1;
    source:'argument'|'tool-detail'|'same-call';
  };
  display?:ToolDisplayV1;
};
export type RuntimeProtectedLegacyHistoryEntryV1 = {
  at?:string;anchor?:LegacyAnchorTokenV1;
  metadataOmissions:readonly ('timestamp'|'anchor-token'|'oversize-identity')[];
} & (
  | {kind:'user-text'|'assistant-text';text:DisplayTextV1}
  | {kind:'tool-record';text:DisplayTextV1;tool:RuntimeProtectedLegacyToolFactsV1}
  | {kind:'projection-diagnostic';text:DisplayTextV1;
     code:'IDENTITY_TOO_LARGE'|'INVALID_ENTRY'}
);
export type RuntimeLegacyHistoryProjectionV1 =
  | {
      ok:true;version:1;scope:{roleId:string;runtime:'pi'};
      origin:'legacy-native';
      entries:readonly RuntimeProtectedLegacyHistoryEntryV1[];
      reader:{ok:boolean;source?:DisplayTextV1;error?:DisplayTextV1;skipped:number};
      projection:{invalidEntries:number;omittedEntries:number;truncated:boolean};
      protection:'current-known-values-and-patterns';
    }
  | {
      ok:false;version:1;code:'INVALID_INPUT'|'PROJECTION_FAILED';
      message:DisplayTextV1;entries:readonly [];
    };

// C2 / text policy 1 public contracts.
export interface RuntimeSessionPersistence {
  readonly mode: 'enabled' | 'disabled';
  readonly scope: { readonly roleId:string; readonly runtime:RuntimeKind };
  recordFinalReport(draft: RuntimeReportDraftV1): Promise<ReportSaveResultV1>;
  retryReportPersistence(reportId:string): Promise<ReportSaveResultV1>;
  getReportPersistence(reportId:string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence(attemptId:string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt(attemptId:string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange(listener:(change:RuntimePersistenceChangeV1)=>void):()=>void;
}
// RoleSession.persistence?: RuntimeSessionPersistence

export type RuntimeReportDraftV1 = {
  source: { roleId:string; runtime:RuntimeKind; turnId:string };
  taskId:string|null;
  origin:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:string; evidence:readonly string[]; at:string;
};
export type RuntimeReportSnapshotV1 = Omit<RuntimeReportDraftV1,'summary'|'evidence'> & {
  version:1; reportId:string;
  summary:DisplayTextV1; evidence:readonly DisplayTextV1[]; evidenceOmitted:number;
};
export type RuntimeInputProvenanceV1 = {
  version:1; kind:'handback'; deliveryId:string; attemptId:string;
  target:{roleId:string;runtime:RuntimeKind};
  reports:readonly RuntimeReportSnapshotV1[];
};
export type RuntimeDeliveryReceiptV1 = {
  version:1; deliveryId:string; attemptId:string; turnId?:string;
  inputSaved:boolean;
  providerMayHaveStarted:boolean;
  history:'pending'|'saved'|'failed'|'disabled';
  outcome?:RuntimeTurnOutcome;
  retryHistoryAvailable:boolean;
  retryDeliveryAllowed:boolean;
  code?:RuntimePersistenceErrorCode;
};

export type ReportSaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';report:RuntimeReportSnapshotV1;retryAvailable:false}
  | {ok:false;state:'failed'|'disabled'|'expired'|'unsupported';
     code:'PERSIST_FAILED'|'CONFLICT'|'INVALID'|'PERSISTENCE_DISABLED'|'SNAPSHOT_EXPIRED'|'UNSUPPORTED';
     reportId?:string;report?:RuntimeReportSnapshotV1;retryAvailable:boolean;message:string};
// getReportPersistence: 同样state/reportId/retryAvailable与既有安全snapshot，绝不触发写或prompt。

export type RuntimePersistenceErrorCode = 'INVALID'|'CONFLICT'|'PERSIST_FAILED'|'PERSISTENCE_DISABLED'
  |'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'PROVENANCE_TOO_LARGE'
  |'REPLAY_DAMAGED'|'REPLAY_CHANGED'|'ATTEMPT_ALREADY_STARTED'|'RECEIPT_UNAVAILABLE'|'TEXT_PROJECTION_FAILED';
export type ReportSaveStateV1 = {
  state:'saved'|'failed'|'disabled'|'expired'|'unsupported';
  reportId?:string; report?:RuntimeReportSnapshotV1;
  code?:RuntimePersistenceErrorCode; retryAvailable:boolean;
};
export type DeliveryReceiptQueryV1 =
  | {state:'known';receipt:RuntimeDeliveryReceiptV1}
  | {state:'expired'|'unsupported';code:'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'REPLAY_DAMAGED';retryAvailable:false};
export type DeliverySaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';receipt:RuntimeDeliveryReceiptV1}
  | {ok:false;state:'failed'|'expired'|'unsupported'|'disabled';
     code:RuntimePersistenceErrorCode;receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;message:string};
export type RuntimePersistenceChangeV1 =
  | {kind:'report-save';scope:{roleId:string;runtime:RuntimeKind};reportId:string;state:ReportSaveStateV1}
  | {kind:'delivery-history-save';scope:{roleId:string;runtime:RuntimeKind};attemptId:string;
     state:'saved'|'failed'|'expired'|'disabled';receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;code?:RuntimePersistenceErrorCode};
export type RuntimeDeliveryProgressV1 = {
  stage:'turn-created'|'input-saved'|'provider-may-start'|'settled';
  receipt:RuntimeDeliveryReceiptV1;
};
// PromptOptions.onDeliveryProgress?: (progress:RuntimeDeliveryProgressV1)=>void
// RuntimeDeliveryError extends Error { readonly receipt:RuntimeDeliveryReceiptV1 }

export type RuntimeLiveReportViewV1 = {
  source:{roleId:string;runtime?:RuntimeKind;turnId?:string};
  taskId:string|null;origin?:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:DisplayTextV1;evidence:readonly DisplayTextV1[];evidenceOmitted:number;at:string;
};
export type RuntimeLiveReportDraftV1 = Omit<RuntimeLiveReportViewV1,'summary'|'evidence'|'evidenceOmitted'> & {
  summary:string;evidence:readonly string[];
};
export type RuntimeLiveHandbackPresentationV1 = {
  deliveryId?:string;attemptId?:string;target?:{roleId:string;runtime:RuntimeKind};
  version:1;kind:'handback-live';durability:'memory-only'|'unknown-live';
  reports:readonly RuntimeLiveReportViewV1[];
};

export type RuntimeInputTextProjectionV1 = {
  version:1;
  source:'trusted-handback-display';
  modelInputRecorded:false;
  redacted:boolean;
  truncated:boolean; // detail.text/user.text相对modelPromptText是否截断
  summaryTruncated:boolean;
};
// RuntimeReplayEntry.inputTextProjection?:RuntimeInputTextProjectionV1
// PromptInputEventDetail.inputTextProjection?:RuntimeInputTextProjectionV1

export interface RuntimeReplayCheckpoint {bytes:number;sha256:string}
export class RuntimeDeliveryError extends Error {
  readonly receipt:RuntimeDeliveryReceiptV1;
  constructor(message:string,receipt:RuntimeDeliveryReceiptV1){super(message);this.name="RuntimeDeliveryError";this.receipt=structuredClone(receipt);}
}
