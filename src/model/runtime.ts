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
  /** Synchronous Core-only acknowledgement of an actual new turn, before persistence/native work. */
  onTurnStarted?: (metadata: PromptTurnStartedMetadata) => void;
  images?: PromptImage[];
}

export interface RoleSession {
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
export interface ToolResult { ok: boolean; message: string }

export interface ToolDefinition {
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
  at: string;
  kind: "user" | "event";
  text?: string;
  event?: SessionEvent;
  turnId?: string;
}

export interface RuntimeSessionStorage {
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
