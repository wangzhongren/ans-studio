// src/common/编排/governance-judge-evidence.ts
// 治理卡判断 agent 的**结构化证据包**（编排私有 common，2026-10-19 客户新反馈）。
//
// 客户原话（第一批）：「决策agent 应该是别人给摘要，他再去判断吧，不是说要所有文件给他。」
// 客户原话（第二批，定位修正）：「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」
// 真机问题：判断 agent 被要求自己读取提案/提名/流程/6 个角色文件等全部物证；大文件撞
// 64KiB 单文件 / 192KiB 总量 / 8 次读取预算，频繁 read-truncated / insufficient-evidence 回落手动。
//
// 本模块把「读全部文件」改为**确定性函数产出的证据包**：
//   · 请求方陈述（card title/preview/detail/turnText）原样保留但标注 untrusted；
//   · decision 组（proposal/appointment/acceptance）：以 `intent` 段（docs/intents/<intentId>.md 的
//     goal/scope/acceptance/非目标/客户原话 + 客户 intent-confirm 确认态）为**唯一意图基准**；
//     提案/提名摘要只提供决策内容；不要求角色卡全文、架构片段或全量物证；
//   · 写盘卡：显式 `paths` + preview 逐路径正文（`declaredPathBodies`，与呈现前完整性闸同一口径），
//     新文件给完整正文，改文件给旧内容 sha256 + 变更摘要；
//   · 物证：提案/提名/流程/角色卡/契约的路径 + sha256 + 关键片段（范围/验收/候选角色/流程步骤/写区）；
//   · 机械事实：路径探测（应用 probe + driver 复核）、目标文件是否存在及哈希、账本相关决定/派发、
//     角色枚举（卡片选项/推荐集/任命名单）；
//   · 请求方陈述与系统事实分开列；**冲突时以系统事实为准**。
//
// fail-closed（builder 返回 ok:false，driver 直接 manual，不调用模型）：
//   · 关键物证缺失/不可读（artifact-missing）；
//   · 意图缺失/歧义/未经客户确认（intent-missing / intent-ambiguous / intent-unconfirmed）；
//   · 路径探测缺失/失败/越界（path-unverified / path-outside-boundary）；
//   · 写盘卡任一声明路径缺可核对正文或正文超有界上限（insufficient-evidence）；
//   · 请求方陈述与系统事实冲突（evidence-conflict）；
//   · 证据包超过有界上限且无法裁剪（evidence-packet-overflow）。
//
// 证据包是**确定性函数**（同一请求 + 同一盘面 ⇒ 同一包；包自哈希 `packetSha256`），
// 不接受模型/角色自由撰写的摘要。判断期间证据哈希变化由 `verifyEvidenceHashes` 在 approve 前复核。

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path, { sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CustomerInputRequest, GovernanceJudgeRequest } from "../../model/runtime.ts";
import { declaredPathBodies } from "./confirmed-writes.ts";
import { intentArtifactPath } from "./governance-handoff.ts";
import {
  buildGovernanceJudgeFacts,
  declaredWritePathsFromPreview,
  isGovernanceJudgeFlowId,
  parseFlowSteps,
  parseRecommendedRoleIds,
  requiredArtifactPaths,
} from "./governance-judge-facts.ts";
import {
  intentConfirmedByLedger,
  resolveIntentReference,
  summarizeIntent,
  type DecisionIntentSummary,
} from "./governance-judge-intent.ts";
import type { GovernanceLedgerEntry } from "./governance-ledger.ts";
import { readGovernanceLedger } from "./governance-ledger.ts";
import { isHardForbiddenPath } from "./governance-judge-verdict.ts";

// —————————————————————— 有界常量 ——————————————————————

/** 证据包版本（结构变化时递增）。2026-10-19：新增 decision 组 `intent` 段（意图漂移判断基准）。 */
export const DECISION_EVIDENCE_PACKET_VERSION = 2 as const;
/** 证据包序列化上限（超过则先裁可选项，再裁不下 ⇒ manual）。 */
export const DECISION_EVIDENCE_PACKET_MAX_BYTES = 64 * 1024;
/** 预留给 integrity 字段的字节数（包体先按 MAX - reserve 裁剪，最终再整体复核）。 */
const DECISION_EVIDENCE_INTEGRITY_RESERVE_BYTES = 2048;
/** 写盘卡单条声明路径的待写正文上限（超出 ⇒ complete:false，不得 approve）。 */
export const DECISION_EVIDENCE_BODY_MAX_BYTES = 32 * 1024;
/** 普通关键片段单条上限。 */
export const DECISION_EVIDENCE_EXCERPT_MAX_BYTES = 1536;
/** 单个物证的关键片段总量上限。 */
export const DECISION_EVIDENCE_EXCERPTS_MAX_BYTES = 16 * 1024;
/** 引用契约的物证上限。 */
export const DECISION_EVIDENCE_CONTRACT_LIMIT = 5;
/** 账本相关条目上限。 */
export const DECISION_EVIDENCE_LEDGER_ENTRY_LIMIT = 20;
/** 任命目标角色上限（与 facts 数组上限一致）。 */
export const DECISION_EVIDENCE_ROLE_LIMIT = 20;
/** 单次可定点抽查的文件大小上限（超过则不要求读；由证据包片段承担）。 */
export const DECISION_EVIDENCE_SPOT_CHECK_MAX_FILE_BYTES = 32 * 1024;
/** 定点抽查路径上限（最小集合）。 */
export const DECISION_EVIDENCE_SPOT_CHECK_LIMIT = 2;
/** 请求方陈述各字段上限。 */
const REQUESTER_TITLE_MAX_BYTES = 2 * 1024;
const REQUESTER_PREVIEW_MAX_BYTES = 4 * 1024;
const REQUESTER_DETAIL_MAX_BYTES = 2 * 1024;
const REQUESTER_TURN_TEXT_MAX_BYTES = 4 * 1024;

// —————————————————————— 公共类型 ——————————————————————

export type EvidenceArtifactKind = "proposal" | "nomination" | "flow" | "role-card" | "boundary" | "contract";

/** 关键片段（确定性提取；不是模型摘要）。 */
export interface EvidenceExcerpt {
  label: string;
  text: string;
  truncated: boolean;
}

export interface EvidenceBoundaryEntry {
  kind: string;
  path: string;
  purpose?: string;
}

export interface EvidenceFlowStep {
  id: string;
  status: string;
}

/** 物证：路径 + sha256 + 关键片段/结构化摘录。 */
export interface EvidenceArtifact {
  kind: EvidenceArtifactKind;
  path: string;
  sha256: string;
  bytes: number;
  excerpts: EvidenceExcerpt[];
  /** 仅提名文件：机器可读推荐集（系统解析，不采信模型）。 */
  recommendedRoleIds?: string[];
  /** 仅流程单：解析出的步骤表。 */
  steps?: EvidenceFlowStep[];
  /** 仅 boundary.yaml：Section 1 写区条目（写区关键片段）。 */
  boundaryEntries?: EvidenceBoundaryEntry[];
}

export interface DeclaredContentChange {
  kind: "create" | "modify";
  oldSha256?: string;
  newSha256: string;
  removedLines: number;
  addedLines: number;
  /** 有界的变更样例行（`- 旧行` / `+ 新行`）。 */
  samples: string[];
}

export interface DeclaredContent {
  available: true;
  provenance: "request_confirmation.preview";
  sha256: string;
  bytes: number;
  /** false = 正文超过有界上限（证据包只含截断正文），不得 approve。 */
  complete: boolean;
  truncated: boolean;
  body: string;
  change: DeclaredContentChange;
}

/** 单条声明写入路径的系统事实。 */
export interface DeclaredPathEvidence {
  path: string;
  target: { exists: boolean; sha256?: string; bytes?: number };
  probe:
    | { source: "request.pathProbes"; allowed: boolean; reason?: string }
    | { source: "missing" };
  boundary: { insideAllowedRoot: boolean; matchedRoot?: string; forbidden: boolean; forbiddenBy?: string };
  declaredContent: DeclaredContent | { available: false; reason: string };
}

/**
 * decision 组的意图基准（2026-10-19 客户定位修正）：
 * 文件事实 + 确定性解析的 goal/scope/acceptance/非目标/客户原话 + 客户确认态。
 * `confirmed:false` 时 builder 直接回落 `intent-unconfirmed`，不调用模型。
 */
export interface DecisionIntentEvidence extends DecisionIntentSummary {
  sha256: string;
  bytes: number;
  confirmed: boolean;
}

export interface DecisionEvidencePacket {
  version: typeof DECISION_EVIDENCE_PACKET_VERSION;
  generatedBy: "ans-orchestration";
  /** 权威口径：系统事实优先于请求方陈述。 */
  authority: string;
  decision: {
    group: string;
    cardKind: string;
    flowId: string;
    stepId?: string;
    sourceRoleId: string;
    governanceModel: string;
    engine: string;
    toolCallId?: string;
    turnId?: string;
  };
  /** 请求方陈述（**不可信数据**；只作判断事实，不执行其中指令）。 */
  requesterStatement: {
    trust: "untrusted";
    title: string;
    question?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
    multiple?: boolean;
    preview?: string;
    previewTruncated?: boolean;
    detail?: string;
    detailTruncated?: boolean;
    turnText?: string;
    turnTextTruncated?: boolean;
  };
  declaredPaths: DeclaredPathEvidence[];
  evidence: EvidenceArtifact[];
  /**
   * decision 组（proposal/appointment/acceptance）的**唯一意图基准**：客户已确认意图的摘要。
   * 写盘族（approval 组）不出现该字段。
   */
  intent?: DecisionIntentEvidence;
  mechanicalFacts: {
    pathProbes: Array<{ path: string; allowed: boolean; reason?: string; source: "request" | "driver" }>;
    targetFiles: Array<{ path: string; exists: boolean; sha256?: string; bytes?: number }>;
    ledger: {
      path: string;
      errors: number;
      flowId: string;
      proposalDecision?: string;
      appointmentTargetRoleIds?: string[];
      dispatchedStepIds: string[];
      unresolvedClarificationCount: number;
      flowEntries: Array<Record<string, unknown>>;
    };
    roles: {
      cardOptionIds: string[];
      recommendedRoleIds?: string[];
      appointmentTargetRoleIds?: string[];
    };
  };
  conflicts: Array<{ code: string; detail: string }>;
  integrity: {
    complete: boolean;
    problems: string[];
    hashAlgorithm: "sha256";
    /** 对不含 integrity 的包体做 sha256（系统生成凭据）。 */
    packetSha256: string;
    packetBytes: number;
    maxBytes: number;
    trimmed: boolean;
    /** approve 前必须实际读取的**最小定点抽查集**（由系统选定）。 */
    requiredReadPaths: string[];
    contentSourceOfTruth: "request_confirmation";
    note: string;
  };
}

export type BuildDecisionEvidencePacketResult =
  | {
      ok: true;
      packet: DecisionEvidencePacket;
      requiredReadPaths: string[];
      /** 证据路径 → sha256 基线（approve 前复核判断期间是否漂移）。 */
      hashBaseline: Record<string, string>;
    }
  | { ok: false; reasonCode: string; reason: string };

// —————————————————————— 基础工具 ——————————————————————

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

function boundedText(value: unknown, maxBytes = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return truncateUtf8(trimmed, maxBytes);
}

function boundedTextOrRaw(value: unknown, maxBytes = 256): string {
  return typeof value === "string" ? truncateUtf8(value, maxBytes) : "";
}

/**
 * 安全项目相对路径（证据包唯一路径口径）：拒绝绝对路径、盘符、空段、`.`/`..`。
 * 返回 posix 风格规范化路径。
 */
export function safeProjectRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\\/g, "/");
  if (normalized === "" || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return undefined;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return normalized;
}

function normalizeRel(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function pathCovers(prefix: string, target: string): boolean {
  const root = stripTrailingSlash(normalizeRel(prefix));
  if (root === "") return false;
  const targetRel = normalizeRel(target);
  return targetRel === root || targetRel.startsWith(`${root}/`);
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 读取文件事实：存在/大小/sha256/文本（二进制不提供文本）。 */
interface FileFact {
  exists: boolean;
  bytes?: number;
  sha256?: string;
  text?: string;
  binary?: boolean;
}

/** 敏感路径类别（证据采集**不读**；与运行时核心 judge 读策略同口径，分层各自实现）。 */
function isSensitiveEvidencePath(rel: string): boolean {
  const segments = rel.split("/");
  const lower = segments.map((segment) => segment.toLowerCase());
  const keyExtensions = new Set([".key", ".pem", ".p12", ".pfx", ".jks", ".keystore"]);
  const credentialName = /(credential|secret|token|password|passwd|api[-_]?key|apikey)/i;
  const credentialDirs = new Set([".ssh", ".aws", ".azure", ".gnupg"]);
  for (let index = 0; index < lower.length; index += 1) {
    const name = lower[index]!;
    if (name === ".ans") return true;
    if (name === ".env" || name.startsWith(".env.") || name === ".envrc") return true;
    if (keyExtensions.has(name.slice(name.lastIndexOf(".")))) return true;
    if (name === ".git") return true;
    if (credentialDirs.has(name)) return true;
    if (credentialName.test(name)) return true;
  }
  const joined = lower.join("/");
  if (joined.startsWith("docs/audit/") || joined === "docs/audit") return true;
  if (joined === ".kube/config" || joined === ".docker/config.json" || joined.startsWith(".config/gcloud/")) return true;
  return false;
}

async function fileFact(projectRoot: string, rel: string): Promise<FileFact> {
  if (isSensitiveEvidencePath(rel)) return { exists: false };
  const abs = path.join(projectRoot, ...rel.split("/"));
  // 先做 realpath 包含性校验（跨平台防符号链接/目录联接逃逸），再用 O_NOFOLLOW 打开
  // （POSIX 上防 realpath 与 open 之间的链接替换；Windows 无 O_NOFOLLOW 时至少受包含性约束）。
  let realRoot: string;
  let realAbs: string;
  try {
    [realRoot, realAbs] = await Promise.all([realpath(projectRoot), realpath(abs)]);
  } catch {
    return { exists: false };
  }
  const key = (value: string): string => (process.platform === "win32" ? value.toLowerCase() : value);
  const rootKey = key(realRoot);
  const absKey = key(realAbs);
  const insideRoot = absKey === rootKey || absKey.startsWith(rootKey.endsWith(sep) ? rootKey : `${rootKey}${sep}`);
  if (!insideRoot) return { exists: false };
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await open(abs, fsConstants.O_RDONLY | noFollow);
  } catch {
    return { exists: false };
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { exists: false };
    const buffer = await handle.readFile();
    const binary = buffer.subarray(0, 8 * 1024).includes(0);
    return {
      exists: true,
      bytes: buffer.length,
      sha256: sha256(buffer),
      ...(binary ? { binary: true } : { text: buffer.toString("utf8") }),
    };
  } catch {
    return { exists: false };
  } finally {
    await handle.close().catch(() => {});
  }
}

// —————————————————————— Markdown 片段提取（确定性） ——————————————————————

interface MarkdownSection {
  heading: string;
  level: number;
  body: string;
}

function isFenceCloseLine(line: string, opener: string): boolean {
  return line.length >= opener.length && [...line].every((char) => char === opener[0]);
}

function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: MarkdownSection[] = [];
  let heading = "";
  let level = 0;
  let body: string[] = [];
  let fence: string | undefined;
  const flush = (): void => {
    sections.push({ heading, level, body: body.join("\n") });
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (fence !== undefined) {
      body.push(line);
      if (isFenceCloseLine(trimmed, fence)) fence = undefined;
      continue;
    }
    const open = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (open !== null) {
      fence = open[1]!;
      body.push(line);
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch !== null) {
      flush();
      heading = headingMatch[2]!.trim();
      level = headingMatch[1]!.length;
      body = [];
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

function excerptOf(label: string, body: string, maxBytes: number): EvidenceExcerpt {
  const clean = body.replace(/^\n+/, "").replace(/\n+$/, "");
  const text = truncateUtf8(clean, maxBytes);
  return { label: label === "" ? "（前言）" : label, text, truncated: byteLength(clean) > maxBytes };
}

/** 片段累加器：单物证总量有界；超额部分截断并标记 truncated。 */
function createExcerptCollector(maxTotalBytes: number): {
  push: (excerpt: EvidenceExcerpt) => void;
  excerpts: EvidenceExcerpt[];
} {
  const excerpts: EvidenceExcerpt[] = [];
  let used = 0;
  return {
    excerpts,
    push(excerpt) {
      if (used >= maxTotalBytes) return;
      const remaining = maxTotalBytes - used;
      const text = truncateUtf8(excerpt.text, remaining);
      const truncated = excerpt.truncated || text !== excerpt.text;
      if (text.trim() !== "") excerpts.push({ label: excerpt.label, text, truncated });
      used += byteLength(text);
    },
  };
}

// 2026-10-19 定位修正：decision 组只判意图漂移，提案摘要只取与意图相关的范围/验收/约束章节；
// 架构/模块/schema 片段不再进入证据包（架构由 Draft 产出、Proof 核对，不归判断 agent）。
const PROPOSAL_KEYWORDS =
  /(目标|goal|范围|scope|验收|acceptance|非目标|non[- ]?goal|约束|constraint|开放问题|open question|风险|risk|契约|contract)/i;
const NOMINATION_KEYWORDS = /(推荐|候选|角色|candidate|role|职责|边界)/i;
const ROLE_CARD_KEYWORDS = /(工作立场|职责|纪律|边界|role|responsibilit|purpose)/i;

function frontmatterExcerpt(text: string): EvidenceExcerpt | undefined {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (match === null) return undefined;
  return excerptOf("frontmatter", match[1]!, 768);
}

function extractProposalExcerpts(text: string): EvidenceExcerpt[] {
  const collector = createExcerptCollector(DECISION_EVIDENCE_EXCERPTS_MAX_BYTES);
  const frontmatter = frontmatterExcerpt(text);
  if (frontmatter !== undefined) collector.push(frontmatter);
  for (const section of parseMarkdownSections(text)) {
    if (section.heading === "" || !PROPOSAL_KEYWORDS.test(section.heading)) continue;
    collector.push(excerptOf(section.heading, section.body, DECISION_EVIDENCE_EXCERPT_MAX_BYTES));
  }
  return collector.excerpts;
}

function extractNominationExcerpts(text: string): EvidenceExcerpt[] {
  const collector = createExcerptCollector(4 * 1024);
  const frontmatter = frontmatterExcerpt(text);
  if (frontmatter !== undefined) collector.push(frontmatter);
  const recommendationLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => /^\s*(?:recommended\s*:|推荐\s*[:：])/i.test(line))
    .join("\n");
  if (recommendationLines !== "") {
    collector.push(excerptOf("推荐集声明", recommendationLines, 512));
  }
  for (const section of parseMarkdownSections(text)) {
    if (section.heading === "" || !NOMINATION_KEYWORDS.test(section.heading)) continue;
    collector.push(excerptOf(section.heading, section.body, DECISION_EVIDENCE_EXCERPT_MAX_BYTES));
  }
  return collector.excerpts;
}

function extractFlowExcerpts(text: string): EvidenceExcerpt[] {
  const collector = createExcerptCollector(2 * 1024);
  const frontmatter = frontmatterExcerpt(text);
  if (frontmatter !== undefined) collector.push(frontmatter);
  const parsed = parseFlowSteps(text);
  if (!parsed.wellFormed) {
    collector.push(excerptOf("流程单（未解析）", text, DECISION_EVIDENCE_EXCERPT_MAX_BYTES));
  }
  return collector.excerpts;
}

function extractRoleCardExcerpts(text: string): EvidenceExcerpt[] {
  const collector = createExcerptCollector(3 * 1024);
  for (const section of parseMarkdownSections(text)) {
    if (section.heading === "") continue;
    if (section.level !== 1 && !ROLE_CARD_KEYWORDS.test(section.heading)) continue;
    collector.push(excerptOf(section.heading, section.body, 1200));
  }
  return collector.excerpts;
}

function extractContractExcerpts(text: string): EvidenceExcerpt[] {
  const headings = parseMarkdownSections(text)
    .filter((section) => section.heading !== "")
    .map((section) => `${"#".repeat(section.level)} ${section.heading}`)
    .join("\n");
  if (headings === "") return [];
  return [excerptOf("契约章节", headings, 1024)];
}

/** boundary.yaml 的 Section 1 写区条目（结构化；解析失败 ⇒ 空，不猜）。 */
function extractBoundaryEntries(text: string): EvidenceBoundaryEntry[] {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];
  const entries: EvidenceBoundaryEntry[] = [];
  for (const raw of parsed.entries) {
    if (!isRecord(raw)) continue;
    const kind = boundedText(raw.kind, 64);
    const entryPath = boundedText(raw.path, 256);
    if (kind === undefined || entryPath === undefined) continue;
    const purpose = boundedText(raw.purpose, 200);
    entries.push({ kind, path: entryPath, ...(purpose !== undefined ? { purpose } : {}) });
    if (entries.length >= 50) break;
  }
  return entries;
}

/** 契约引用（确定性正则，不扫描散文语义）：物证正文里出现的 `docs/contracts/*.md`。 */
function referencedContractPaths(texts: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /docs\/contracts\/[^\s`"'“”‘’（）()【】\[\]{}<>|*，。；：、!?]+?\.md/g;
  for (const text of texts) {
    for (const match of text.matchAll(re)) {
      const raw = match[0];
      const rel = safeProjectRelativePath(raw);
      if (rel === undefined || seen.has(rel)) continue;
      seen.add(rel);
      out.push(rel);
      if (out.length >= DECISION_EVIDENCE_CONTRACT_LIMIT) return out;
    }
  }
  return out;
}

// —————————————————————— 变更摘要 ——————————————————————

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * 有界的行级变更摘要：去掉公共前后缀后，统计删除/新增行数并给出样例。
 * 不做最小编辑距离（不夸大精度）；样例只用于让判断 agent 看到「改了什么」。
 */
function changeSummary(oldText: string, newText: string): { removedLines: number; addedLines: number; samples: string[] } {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const samples: string[] = [];
  const sampleLimit = 12;
  for (const line of removed) {
    if (samples.length >= sampleLimit) break;
    const text = truncateUtf8(line.trim(), 160);
    if (text !== "") samples.push(`- ${text}`);
  }
  for (const line of added) {
    if (samples.length >= sampleLimit) break;
    const text = truncateUtf8(line.trim(), 160);
    if (text !== "") samples.push(`+ ${text}`);
  }
  return { removedLines: removed.length, addedLines: added.length, samples };
}

// —————————————————————— 路径事实 ——————————————————————

function matchAllowedRoot(roots: readonly string[], target: string): string | undefined {
  for (const root of roots) {
    if (pathCovers(root, target)) return normalizeRel(root);
  }
  return undefined;
}

function matchForbidden(paths: readonly string[], target: string): string | undefined {
  for (const prefix of paths) {
    if (pathCovers(prefix, target)) return normalizeRel(prefix);
  }
  return undefined;
}

function probeOf(request: GovernanceJudgeRequest, target: string): DeclaredPathEvidence["probe"] {
  const probes = Array.isArray(request.pathProbes) ? request.pathProbes : [];
  const found = probes.find((entry) => isRecord(entry) && typeof entry.path === "string" && normalizeRel(entry.path) === target);
  if (found === undefined) return { source: "missing" };
  return {
    source: "request.pathProbes",
    allowed: found.allowed === true,
    ...(boundedText(found.reason, 512) !== undefined ? { reason: boundedText(found.reason, 512)! } : {}),
  };
}

// —————————————————————— 证据包构建 ——————————————————————

interface Problem {
  code: string;
  detail: string;
}

interface Conflict {
  code: string;
  detail: string;
}

function isWriteCardKind(cardKind: string): boolean {
  return cardKind === "write" || cardKind === "appointment-write" || cardKind === "schedule-write";
}

/** decision 组（只判意图漂移）：proposal / appointment / acceptance。 */
function isDecisionCardKind(cardKind: string): boolean {
  return cardKind === "proposal" || cardKind === "appointment" || cardKind === "acceptance";
}

function artifactRequired(cardKind: string, kind: "proposal" | "nomination" | "flow"): boolean {
  switch (cardKind) {
    case "proposal":
      return kind === "proposal";
    case "appointment":
      return kind === "nomination";
    case "acceptance":
      return kind === "proposal" || kind === "flow";
    case "appointment-write":
      return kind === "nomination";
    default:
      return false;
  }
}

const PROBLEM_PRIORITY: readonly string[] = [
  "artifact-missing",
  "intent-missing",
  "intent-ambiguous",
  "intent-unconfirmed",
  "ledger-unavailable",
  "path-outside-boundary",
  "path-unverified",
  "insufficient-evidence",
  "evidence-packet-overflow",
];

function chooseReason(conflicts: readonly Conflict[], problems: readonly Problem[]): { reasonCode: string; reason: string } {
  if (conflicts.length > 0) {
    const detail = conflicts.map((conflict) => `${conflict.code}：${conflict.detail}`).join("；");
    return { reasonCode: "evidence-conflict", reason: `请求方陈述与系统事实冲突（${detail}），已转手动确认。` };
  }
  const code = PROBLEM_PRIORITY.find((candidate) => problems.some((problem) => problem.code === candidate)) ?? "evidence-packet-missing";
  const details = problems.filter((problem) => problem.code === code).map((problem) => problem.detail);
  return { reasonCode: code, reason: `${details.join("；")}，已转手动确认。` };
}

function requesterOptions(card: CustomerInputRequest): Array<{ id: string; label: string; description?: string }> | undefined {
  if (card.kind !== "choice") return undefined;
  return card.options.map((option) => ({
    id: truncateUtf8(option.id, 128),
    label: truncateUtf8(option.label, 256),
    ...(option.description !== undefined ? { description: truncateUtf8(option.description, 512) } : {}),
  }));
}

function ledgerFlowEntries(entries: readonly GovernanceLedgerEntry[], flowId: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    if (entry.flowId !== flowId) continue;
    const summary: Record<string, unknown> = {
      at: boundedTextOrRaw(entry.at, 40),
      kind: boundedTextOrRaw(entry.kind, 40),
      actorRoleId: boundedTextOrRaw(entry.actorRoleId, 128),
      power: boundedTextOrRaw(entry.power, 32),
    };
    if (entry.decisionKind !== undefined) summary.decisionKind = boundedTextOrRaw(entry.decisionKind, 64);
    if (entry.customerDecision !== undefined) summary.customerDecision = boundedTextOrRaw(entry.customerDecision, 32);
    if (entry.stepId !== undefined) summary.stepId = boundedTextOrRaw(entry.stepId, 128);
    if (entry.targetRoleIds !== undefined) summary.targetRoleIds = entry.targetRoleIds.slice(0, 20).map((id) => boundedTextOrRaw(id, 128));
    if (entry.artifactPath !== undefined) summary.artifactPath = boundedTextOrRaw(entry.artifactPath, 256);
    if (entry.paths !== undefined) summary.paths = entry.paths.slice(0, 20).map((item) => boundedTextOrRaw(item, 256));
    out.push(summary);
  }
  return out.slice(Math.max(0, out.length - DECISION_EVIDENCE_LEDGER_ENTRY_LIMIT));
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * 生成 ≥1 条声明路径的路径事实（写盘卡）。
 * 每条路径都包含：目标文件事实、应用 probe、driver 边界复核、preview 逐路径正文与变更摘要。
 */
async function buildDeclaredPaths(args: {
  request: GovernanceJudgeRequest;
  projectRoot: string;
  declaredPaths: readonly string[];
  problems: Problem[];
}): Promise<DeclaredPathEvidence[]> {
  const { request, projectRoot, declaredPaths, problems } = args;
  const preview = request.card.kind === "confirm" ? (request.card.preview ?? "") : "";
  const bodies = new Map(declaredPathBodies(preview, declaredPaths).map((entry) => [entry.path, entry]));
  const allowedRoots = Array.isArray(request.allowedPathRoots) ? request.allowedPathRoots : [];
  const forbidden = [
    ...(Array.isArray(request.forbiddenPaths) ? request.forbiddenPaths : []),
  ];
  const out: DeclaredPathEvidence[] = [];
  const isWrite = isWriteCardKind(request.cardKind);

  for (const rel of declaredPaths) {
    const fact = await fileFact(projectRoot, rel);
    const probe = probeOf(request, rel);
    const matchedRoot = matchAllowedRoot(allowedRoots, rel);
    const forbiddenBy = isHardForbiddenPath(rel)
      ? "hard-forbidden"
      : (forbidden.length > 0 ? matchForbidden(forbidden, rel) : undefined);
    const boundary: DeclaredPathEvidence["boundary"] = {
      insideAllowedRoot: matchedRoot !== undefined,
      ...(matchedRoot !== undefined ? { matchedRoot } : {}),
      forbidden: forbiddenBy !== undefined,
      ...(forbiddenBy !== undefined ? { forbiddenBy } : {}),
    };

    const bodyEntry = bodies.get(rel);
    let declaredContent: DeclaredPathEvidence["declaredContent"];
    if (bodyEntry === undefined || !bodyEntry.hasBody) {
      declaredContent = {
        available: false,
        reason: "request_confirmation 的 preview 未给该路径可核对正文（写盘卡必须以标题/围栏说明 + 正文声明待写内容）",
      };
    } else {
      const rawBytes = byteLength(bodyEntry.body);
      const complete = rawBytes <= DECISION_EVIDENCE_BODY_MAX_BYTES;
      const body = truncateUtf8(bodyEntry.body, DECISION_EVIDENCE_BODY_MAX_BYTES);
      const newSha = sha256(bodyEntry.body);
      const change: DeclaredContentChange = fact.exists && fact.text !== undefined
        ? {
            kind: "modify",
            ...(fact.sha256 !== undefined ? { oldSha256: fact.sha256 } : {}),
            newSha256: newSha,
            ...changeSummary(fact.text, bodyEntry.body),
          }
        : {
            kind: "create",
            newSha256: newSha,
            removedLines: 0,
            addedLines: splitLines(bodyEntry.body).length,
            samples: splitLines(bodyEntry.body)
              .map((line) => line.trim())
              .filter((line) => line !== "")
              .slice(0, 12)
              .map((line) => `+ ${truncateUtf8(line, 160)}`),
          };
      declaredContent = {
        available: true,
        provenance: "request_confirmation.preview",
        sha256: newSha,
        bytes: rawBytes,
        complete,
        truncated: !complete,
        body,
        change,
      };
      if (!complete) {
        problems.push({
          code: "insufficient-evidence",
          detail: `路径 ${rel} 的待写正文超过证据包有界上限（${rawBytes}B > ${DECISION_EVIDENCE_BODY_MAX_BYTES}B）`,
        });
      }
    }

    if (isWrite) {
      if (probe.source === "missing") {
        problems.push({ code: "path-unverified", detail: `路径 ${rel} 缺少应用机械探测（pathProbes）` });
      } else if (!probe.allowed) {
        problems.push({
          code: "path-outside-boundary",
          detail: `路径 ${rel} 未通过应用机械探测${probe.reason !== undefined ? `（${probe.reason}）` : ""}`,
        });
      }
      if (!boundary.insideAllowedRoot) {
        problems.push({ code: "path-outside-boundary", detail: `路径 ${rel} 不在角色可写根内` });
      }
      if (boundary.forbidden) {
        problems.push({ code: "path-outside-boundary", detail: `路径 ${rel} 属于禁写路径` });
      }
      if (declaredContent.available === false || !declaredContent.complete) {
        problems.push({ code: "insufficient-evidence", detail: `路径 ${rel} 缺少完整可核对的待写正文` });
      }
    }

    out.push({
      path: rel,
      target: {
        exists: fact.exists,
        ...(fact.sha256 !== undefined ? { sha256: fact.sha256 } : {}),
        ...(fact.bytes !== undefined ? { bytes: fact.bytes } : {}),
      },
      probe,
      boundary,
      declaredContent,
    });
  }
  return out;
}

/**
 * 选定点抽查集：只在**存在且 ≤32KiB** 的物证里选，最多 2 条（最小集合）。
 * decision 组：意图文件优先，其次提案/提名摘要（流程步骤已在证据包内）——只核对意图与决策内容；
 * 写盘族：沿用既有规则（物证优先，其次已存在的声明目标）。
 */
function selectSpotChecks(
  artifacts: readonly EvidenceArtifact[],
  declaredPaths: readonly DeclaredPathEvidence[],
  intent: DecisionIntentEvidence | undefined,
): string[] {
  const out: string[] = [];
  const push = (rel: string, bytes: number | undefined): void => {
    if (bytes === undefined || bytes > DECISION_EVIDENCE_SPOT_CHECK_MAX_FILE_BYTES) return;
    if (out.includes(rel) || out.length >= DECISION_EVIDENCE_SPOT_CHECK_LIMIT) return;
    out.push(rel);
  };
  if (intent !== undefined) {
    push(intent.path, intent.bytes);
    for (const artifact of artifacts) {
      if (artifact.kind === "contract" || artifact.kind === "role-card" || artifact.kind === "boundary") continue;
      push(artifact.path, artifact.bytes);
    }
    return out;
  }
  for (const artifact of artifacts) {
    if (artifact.kind === "contract" || artifact.kind === "role-card" || artifact.kind === "boundary") continue;
    push(artifact.path, artifact.bytes);
  }
  if (out.length === 0) {
    for (const entry of [...declaredPaths].sort((left, right) => left.path.localeCompare(right.path))) {
      if (entry.target.exists) push(entry.path, entry.target.bytes);
    }
  }
  return out;
}

function artifactExcerpts(kind: EvidenceArtifactKind, text: string): EvidenceExcerpt[] {
  switch (kind) {
    case "proposal":
      return extractProposalExcerpts(text);
    case "nomination":
      return extractNominationExcerpts(text);
    case "flow":
      return extractFlowExcerpts(text);
    case "role-card":
      return extractRoleCardExcerpts(text);
    case "contract":
      return extractContractExcerpts(text);
    default:
      return [];
  }
}

/**
 * 生成证据包（**确定性函数**；不抛错）。所有失败归 `ok:false`，由 driver 落 manual。
 * 同一请求 + 同一盘面 ⇒ 同一包体与同一 `packetSha256`。
 */
export async function buildDecisionEvidencePacket(input: {
  request: GovernanceJudgeRequest;
  projectRoot: string;
}): Promise<BuildDecisionEvidencePacketResult> {
  try {
    return await buildInner(input);
  } catch (err) {
    return {
      ok: false,
      reasonCode: "evidence-packet-missing",
      reason: `证据包生成失败：${err instanceof Error ? err.message : String(err)}，已转手动确认。`,
    };
  }
}

async function buildInner(input: {
  request: GovernanceJudgeRequest;
  projectRoot: string;
}): Promise<BuildDecisionEvidencePacketResult> {
  const { request, projectRoot } = input;
  const problems: Problem[] = [];
  const conflicts: Conflict[] = [];

  if (typeof request.flowId !== "string" || !isGovernanceJudgeFlowId(request.flowId)) {
    return { ok: false, reasonCode: "context-missing", reason: "证据包缺少合法的 flowId，已转手动确认。" };
  }

  const cardFlowId = typeof (request.card as { flowId?: unknown }).flowId === "string"
    ? (request.card as { flowId: string }).flowId
    : undefined;
  if (cardFlowId !== undefined && cardFlowId !== "" && cardFlowId !== request.flowId) {
    conflicts.push({ code: "card-flow-mismatch", detail: `卡片 flowId=${cardFlowId} 与请求 flowId=${request.flowId} 不一致` });
  }
  const cardCardKind = typeof (request.card as { cardKind?: unknown }).cardKind === "string"
    ? (request.card as { cardKind: string }).cardKind
    : undefined;
  if (cardCardKind !== undefined && cardCardKind !== "" && cardCardKind !== request.cardKind) {
    conflicts.push({ code: "card-kind-mismatch", detail: `卡片 cardKind=${cardCardKind} 与请求 cardKind=${request.cardKind} 不一致` });
  }
  if (request.facts !== undefined && typeof request.facts.flowId === "string" && request.facts.flowId !== request.flowId) {
    conflicts.push({ code: "facts-flow-mismatch", detail: `应用事实 flowId=${request.facts.flowId} 与请求 flowId=${request.flowId} 不一致` });
  }

  // —— 声明写入路径（显式 paths 优先；未给回退 preview 一行一路径声明）——
  const declaredPaths: string[] = [];
  if (request.card.kind === "confirm") {
    const raw = Array.isArray(request.paths) && request.paths.length > 0
      ? request.paths
      : declaredWritePathsFromPreview(request.card.preview);
    if (raw.length > 50) {
      return { ok: false, reasonCode: "path-unverified", reason: "写盘卡候选路径超过逐路径复核上限，已转手动确认。" };
    }
    const seen = new Set<string>();
    for (const candidate of raw) {
      const rel = safeProjectRelativePath(candidate);
      if (rel === undefined) {
        if (isWriteCardKind(request.cardKind)) {
          problems.push({ code: "path-unverified", detail: `声明路径非法：${String(candidate)}` });
        }
        continue;
      }
      if (seen.has(rel)) continue;
      seen.add(rel);
      declaredPaths.push(rel);
    }
    if (isWriteCardKind(request.cardKind) && declaredPaths.length === 0) {
      problems.push({ code: "path-unverified", detail: "写盘卡没有可复核的具体路径" });
    }
  }

  const declaredPathEvidence = await buildDeclaredPaths({
    request,
    projectRoot,
    declaredPaths,
    problems,
  });

  // —— 规范物证（提案/提名/流程）——
  const required = requiredArtifactPaths(request);
  if (required.missing) {
    problems.push({
      code: "artifact-missing",
      detail: `规范物证缺失：${(required.missingPaths ?? []).join("、")}（判断无法核对）`,
    });
  }

  interface ArtifactSpec {
    kind: EvidenceArtifactKind;
    path: string;
    required: boolean;
  }
  const specs: ArtifactSpec[] = [];
  const seenPaths = new Set<string>();
  const addSpec = (kind: EvidenceArtifactKind, rawPath: string | undefined, requiredFlag: boolean): void => {
    if (rawPath === undefined || rawPath.trim() === "") return;
    const rel = safeProjectRelativePath(rawPath.trim());
    if (rel === undefined) {
      problems.push({ code: "artifact-missing", detail: `物证路径非法：${rawPath}` });
      return;
    }
    if (seenPaths.has(rel)) return;
    seenPaths.add(rel);
    specs.push({ kind, path: rel, required: requiredFlag });
  };
  const artifacts = request.artifacts ?? {};
  addSpec("proposal", artifacts.proposalPath, artifactRequired(request.cardKind, "proposal"));
  addSpec("nomination", artifacts.nominationPath, artifactRequired(request.cardKind, "nomination"));
  addSpec("flow", artifacts.flowPath, artifactRequired(request.cardKind, "flow"));
  // appointment-write：目标角色卡与 boundary（写区关键片段）；新卡可能尚不存在，不强制。
  const appointmentTargets = Array.isArray(request.facts?.appointmentTargetRoleIds)
    ? request.facts.appointmentTargetRoleIds.slice(0, DECISION_EVIDENCE_ROLE_LIMIT)
    : [];
  if (request.cardKind === "appointment-write") {
    for (const roleId of appointmentTargets) {
      const target = typeof roleId === "string" ? roleId.trim() : "";
      if (target === "" || target.includes("/") || target.includes("\\") || target === "." || target === "..") continue;
      addSpec("role-card", `角色卡/${target}/role-card.md`, false);
      addSpec("boundary", `角色卡/${target}/boundary.yaml`, false);
    }
  }
  // 写盘族的**来源角色**角色卡/boundary（写区关键片段；只读、可选，缺失不阻断）。
  if (isWriteCardKind(request.cardKind)) {
    const source = request.roleId.trim();
    if (source !== "" && !source.includes("/") && !source.includes("\\") && source !== "." && source !== "..") {
      addSpec("role-card", `角色卡/${source}/role-card.md`, false);
      addSpec("boundary", `角色卡/${source}/boundary.yaml`, false);
    }
  }

  const evidence: EvidenceArtifact[] = [];
  const artifactTexts: string[] = [];
  /** 提案正文（意图定位的兼容来源：frontmatter `intentId`；decision 组只用它做定位，不做全文判断）。 */
  let proposalText: string | undefined;
  for (const spec of specs) {
    const fact = await fileFact(projectRoot, spec.path);
    if (!fact.exists || fact.sha256 === undefined || fact.bytes === undefined) {
      if (spec.required) {
        problems.push({ code: "artifact-missing", detail: `物证不可读：${spec.path}` });
      }
      continue;
    }
    if (fact.binary === true || fact.text === undefined) {
      if (spec.required) {
        problems.push({ code: "artifact-missing", detail: `物证不是可核对文本：${spec.path}` });
      }
      continue;
    }
    artifactTexts.push(fact.text);
    if (spec.kind === "proposal") proposalText = fact.text;
    const entry: EvidenceArtifact = {
      kind: spec.kind,
      path: spec.path,
      sha256: fact.sha256,
      bytes: fact.bytes,
      excerpts: artifactExcerpts(spec.kind, fact.text),
    };
    if (spec.kind === "nomination") {
      const recommended = parseRecommendedRoleIds(fact.text);
      if (recommended !== undefined) entry.recommendedRoleIds = recommended;
    }
    if (spec.kind === "flow") {
      const parsed = parseFlowSteps(fact.text);
      if (parsed.wellFormed) entry.steps = parsed.steps.slice(0, 50).map((step) => ({
        id: truncateUtf8(step.id, 128),
        status: truncateUtf8(step.status, 256),
      }));
    }
    if (spec.kind === "boundary") {
      entry.boundaryEntries = extractBoundaryEntries(fact.text);
    }
    evidence.push(entry);
  }

  // 引用契约（只从已读物证正文中确定性提取；存在才纳入）。
  const contracts = referencedContractPaths(artifactTexts);
  for (const rel of contracts) {
    if (seenPaths.has(rel)) continue;
    seenPaths.add(rel);
    const fact = await fileFact(projectRoot, rel);
    if (!fact.exists || fact.sha256 === undefined || fact.bytes === undefined || fact.binary === true || fact.text === undefined) continue;
    evidence.push({
      kind: "contract",
      path: rel,
      sha256: fact.sha256,
      bytes: fact.bytes,
      excerpts: extractContractExcerpts(fact.text),
    });
  }

  // —— 账本机械事实（重新读盘，与请求 facts 对账）——
  let ledgerEntries: GovernanceLedgerEntry[] = [];
  let ledgerErrors = 0;
  let freshFacts;
  try {
    const ledger = await readGovernanceLedger(projectRoot);
    ledgerEntries = ledger.entries;
    ledgerErrors = ledger.errors.length;
    freshFacts = buildGovernanceJudgeFacts({ snapshot: { entries: ledger.entries, errors: ledger.errors }, flowId: request.flowId });
  } catch (err) {
    problems.push({ code: "ledger-unavailable", detail: `治理账本不可读：${err instanceof Error ? err.message : String(err)}` });
    freshFacts = undefined;
  }
  if (freshFacts !== undefined && request.facts !== undefined) {
    if (request.facts.ledgerErrors !== ledgerErrors) {
      conflicts.push({
        code: "ledger-errors-drift",
        detail: `请求 facts.ledgerErrors=${request.facts.ledgerErrors} 与重读账本错误数=${ledgerErrors} 不一致`,
      });
    }
    if (freshFacts.proposalDecision !== request.facts.proposalDecision) {
      conflicts.push({
        code: "ledger-proposal-decision-drift",
        detail: `请求 facts.proposalDecision=${String(request.facts.proposalDecision)} 与重读账本=${String(freshFacts.proposalDecision)} 不一致`,
      });
    }
    if (!sameStringArray(freshFacts.appointmentTargetRoleIds, request.facts.appointmentTargetRoleIds)) {
      conflicts.push({
        code: "ledger-appointment-drift",
        detail: `请求 facts.appointmentTargetRoleIds=${JSON.stringify(request.facts.appointmentTargetRoleIds ?? [])} 与重读账本=${JSON.stringify(freshFacts.appointmentTargetRoleIds ?? [])} 不一致`,
      });
    }
    if (freshFacts.unresolvedClarificationCount !== request.facts.unresolvedClarificationCount) {
      conflicts.push({
        code: "ledger-clarification-drift",
        detail: `请求 facts.unresolvedClarificationCount=${request.facts.unresolvedClarificationCount} 与重读账本=${freshFacts.unresolvedClarificationCount} 不一致`,
      });
    }
  }

  // —— decision 组的意图基准（2026-10-19 客户定位修正）——
  // 只判「是否偏离客户已确认的意图」：意图文件缺失/歧义/未经客户确认 ⇒ 直接 fail-closed，
  // 不调用模型（模型无法凭空知道客户出发点）。写盘族不需要意图。
  let intent: DecisionIntentEvidence | undefined;
  if (isDecisionCardKind(request.cardKind)) {
    const resolved = resolveIntentReference({
      flowId: request.flowId,
      ledgerEntries,
      ...(proposalText !== undefined ? { proposalText } : {}),
    });
    if (!resolved.ok) {
      problems.push({ code: resolved.reasonCode, detail: resolved.detail });
    } else {
      const rel = intentArtifactPath(resolved.reference.intentId);
      const fact = await fileFact(projectRoot, rel);
      if (!fact.exists || fact.text === undefined || fact.binary === true || fact.sha256 === undefined || fact.bytes === undefined) {
        problems.push({ code: "intent-missing", detail: `意图文件不可读：${rel}` });
      } else {
        const summarized = summarizeIntent({ text: fact.text, reference: resolved.reference, flowId: request.flowId });
        if (!summarized.ok) {
          problems.push({ code: summarized.reasonCode, detail: summarized.detail });
        } else {
          const confirmed = intentConfirmedByLedger(ledgerEntries, request.flowId, resolved.reference.intentId);
          if (!confirmed) {
            problems.push({
              code: "intent-unconfirmed",
              detail: `意图文件 ${rel} 没有客户已确认的 intent-confirm accepted 决定`,
            });
          }
          intent = {
            ...summarized.summary,
            sha256: fact.sha256,
            bytes: fact.bytes,
            confirmed,
          };
        }
      }
    }
  }

  // —— 角色枚举（卡片选项 / 推荐集 / 任命名单）——
  const cardOptionIds = request.card.kind === "choice"
    ? request.card.options.map((option) => truncateUtf8(option.id, 128))
    : [];
  const nominationArtifact = evidence.find((entry) => entry.kind === "nomination");
  const parsedRecommended = nominationArtifact?.recommendedRoleIds;
  const requestRecommended = Array.isArray(request.recommendedRoleIds) ? request.recommendedRoleIds : undefined;
  if (request.cardKind === "appointment" && requestRecommended !== undefined && parsedRecommended !== undefined) {
    if (!sameStringArray(requestRecommended, parsedRecommended)) {
      conflicts.push({
        code: "recommended-roles-mismatch",
        detail: `应用推荐集=${JSON.stringify(requestRecommended)} 与提名文件重解析=${JSON.stringify(parsedRecommended)} 不一致`,
      });
    }
  }
  if (request.cardKind === "appointment" && (requestRecommended === undefined || requestRecommended.length === 0)) {
    problems.push({ code: "insufficient-evidence", detail: "提名文件缺少唯一的机器可读推荐集" });
  }

  // —— 关键片段的确定性底线 ——
  // 2026-10-19 定位修正：decision 组只判意图漂移；架构章节/工程质量/测试覆盖/证据充分性不归
  // 判断 agent（由 Draft/Proof 的工作流与验收负责），builder **不**做架构标题关键词硬门槛。
  // builder 只保证：意图文件 + goal/scope/acceptance 可解析、客户已确认；物证路径 + sha256 + 可提取片段存在。
  if (request.cardKind === "acceptance") {
    const flow = evidence.find((entry) => entry.kind === "flow");
    if (flow !== undefined && (flow.steps === undefined || flow.steps.length === 0)) {
      problems.push({ code: "insufficient-evidence", detail: "流程单缺少可解析的步骤表" });
    }
  }

  const factsForPacket = freshFacts ?? (request.facts !== undefined
    ? {
        proposalDecision: request.facts.proposalDecision,
        appointmentTargetRoleIds: request.facts.appointmentTargetRoleIds,
        dispatchedStepIds: request.facts.dispatchedStepIds ?? [],
        unresolvedClarificationCount: request.facts.unresolvedClarificationCount,
      }
    : {
        proposalDecision: undefined,
        appointmentTargetRoleIds: undefined,
        dispatchedStepIds: [],
        unresolvedClarificationCount: 0,
      });

  const card = request.card;
  const preview = card.kind === "confirm" ? card.preview : undefined;
  const detail = card.kind === "confirm" ? card.detail : undefined;
  const previewTruncated = preview !== undefined && byteLength(preview) > REQUESTER_PREVIEW_MAX_BYTES;
  const detailTruncated = detail !== undefined && byteLength(detail) > REQUESTER_DETAIL_MAX_BYTES;
  const turnTextTruncated = request.turnText !== undefined && byteLength(request.turnText) > REQUESTER_TURN_TEXT_MAX_BYTES;
  const options = requesterOptions(card);

  const body: Omit<DecisionEvidencePacket, "integrity"> = {
    version: DECISION_EVIDENCE_PACKET_VERSION,
    generatedBy: "ans-orchestration",
    authority: "系统事实优先于请求方陈述；两者冲突且无法裁决时不得 approve（交回 manual）。",
    decision: {
      group: request.group,
      cardKind: request.cardKind,
      flowId: request.flowId,
      ...(request.stepId !== undefined && request.stepId !== "" ? { stepId: request.stepId } : {}),
      sourceRoleId: request.roleId,
      governanceModel: request.governanceModel,
      engine: request.runtime,
      ...(request.toolCallId !== undefined && request.toolCallId !== "" ? { toolCallId: request.toolCallId } : {}),
      ...(request.turnId !== undefined && request.turnId !== "" ? { turnId: request.turnId } : {}),
    },
    requesterStatement: {
      trust: "untrusted",
      title: truncateUtf8(card.title, REQUESTER_TITLE_MAX_BYTES),
      ...(card.kind === "choice" && card.question !== undefined ? { question: truncateUtf8(card.question, REQUESTER_TITLE_MAX_BYTES) } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(card.kind === "choice" && card.multiple !== undefined ? { multiple: card.multiple } : {}),
      ...(preview !== undefined && preview !== "" ? { preview: truncateUtf8(preview, REQUESTER_PREVIEW_MAX_BYTES), previewTruncated } : {}),
      ...(detail !== undefined && detail !== "" ? { detail: truncateUtf8(detail, REQUESTER_DETAIL_MAX_BYTES), detailTruncated } : {}),
      ...(request.turnText !== undefined && request.turnText.trim() !== ""
        ? { turnText: truncateUtf8(request.turnText, REQUESTER_TURN_TEXT_MAX_BYTES), turnTextTruncated }
        : {}),
    },
    declaredPaths: declaredPathEvidence,
    evidence,
    ...(intent !== undefined ? { intent } : {}),
    mechanicalFacts: {
      pathProbes: declaredPathEvidence.map((entry) => ({
        path: entry.path,
        allowed: entry.probe.source !== "missing" && entry.probe.allowed,
        ...(entry.probe.source !== "missing" && entry.probe.reason !== undefined ? { reason: entry.probe.reason } : {}),
        source: "request" as const,
      })),
      targetFiles: declaredPathEvidence.map((entry) => ({ path: entry.path, ...entry.target })),
      ledger: {
        path: ".ans/governance/ledger.jsonl",
        errors: ledgerErrors,
        flowId: request.flowId,
        ...(factsForPacket.proposalDecision !== undefined ? { proposalDecision: factsForPacket.proposalDecision } : {}),
        ...(factsForPacket.appointmentTargetRoleIds !== undefined
          ? { appointmentTargetRoleIds: [...factsForPacket.appointmentTargetRoleIds] }
          : {}),
        dispatchedStepIds: [...(factsForPacket.dispatchedStepIds ?? [])],
        unresolvedClarificationCount: factsForPacket.unresolvedClarificationCount,
        flowEntries: ledgerFlowEntries(ledgerEntries, request.flowId),
      },
      roles: {
        cardOptionIds,
        ...(requestRecommended !== undefined ? { recommendedRoleIds: [...requestRecommended] } : (parsedRecommended !== undefined ? { recommendedRoleIds: [...parsedRecommended] } : {})),
        ...(appointmentTargets.length > 0 ? { appointmentTargetRoleIds: [...appointmentTargets] } : {}),
      },
    },
    conflicts,
  };

  // —— 有界裁剪：先删可选契约物证，再清空角色卡/boundary 片段；仍超 ⇒ manual ——
  let trimmed = false;
  const bodyLimit = DECISION_EVIDENCE_PACKET_MAX_BYTES - DECISION_EVIDENCE_INTEGRITY_RESERVE_BYTES;
  let serialized = JSON.stringify(body);
  if (byteLength(serialized) > bodyLimit) {
    trimmed = true;
    body.evidence = body.evidence.filter((entry) => entry.kind !== "contract");
    serialized = JSON.stringify(body);
    if (byteLength(serialized) > bodyLimit) {
      for (const entry of body.evidence) {
        if (entry.kind === "role-card" || entry.kind === "boundary") entry.excerpts = [];
      }
      serialized = JSON.stringify(body);
    }
    if (byteLength(serialized) > bodyLimit) {
      problems.push({
        code: "evidence-packet-overflow",
        detail: `证据包序列化 ${byteLength(serialized)}B 超过上限 ${DECISION_EVIDENCE_PACKET_MAX_BYTES}B`,
      });
    }
  }

  const requiredReadPaths = selectSpotChecks(body.evidence, body.declaredPaths, body.intent);
  let complete = problems.length === 0 && conflicts.length === 0;
  const packetSha256 = sha256(JSON.stringify(body));
  const packet: DecisionEvidencePacket = {
    ...body,
    integrity: {
      complete,
      problems: problems.map((problem) => `${problem.code}: ${problem.detail}`),
      hashAlgorithm: "sha256",
      packetSha256,
      packetBytes: 0,
      maxBytes: DECISION_EVIDENCE_PACKET_MAX_BYTES,
      trimmed,
      requiredReadPaths,
      contentSourceOfTruth: "request_confirmation",
      note:
        "decision 组以意图文件（docs/intents/<intentId>.md）的 goal/scope/acceptance/非目标/客户原话为唯一意图基准，" +
        "客户确认态来自账本 intent-confirm 决定；写盘内容以 request_confirmation 的结构化载荷（显式 paths + 逐路径正文）为准；" +
        "preview 自由文本只是请求方陈述。写出内容与声明内容的一致性（内容漂移 O-A1）不在本包保证范围内。",
    },
  };
  packet.integrity.packetBytes = byteLength(JSON.stringify(packet));
  if (packet.integrity.packetBytes > DECISION_EVIDENCE_PACKET_MAX_BYTES) {
    problems.push({
      code: "evidence-packet-overflow",
      detail: `证据包（含 integrity）序列化 ${packet.integrity.packetBytes}B 超过上限 ${DECISION_EVIDENCE_PACKET_MAX_BYTES}B`,
    });
    complete = false;
    packet.integrity.complete = false;
    packet.integrity.problems = problems.map((problem) => `${problem.code}: ${problem.detail}`);
  }

  if (!complete) {
    const chosen = chooseReason(conflicts, problems);
    return { ok: false, reasonCode: chosen.reasonCode, reason: chosen.reason };
  }

  // 哈希基线：意图文件 + 全部物证 + 已存在的声明目标（approve 前复核判断期间漂移）。
  const baselineEntries: Array<[string, string]> = [];
  if (packet.intent !== undefined) baselineEntries.push([packet.intent.path, packet.intent.sha256]);
  for (const entry of packet.evidence) baselineEntries.push([entry.path, entry.sha256]);
  for (const entry of packet.declaredPaths) {
    if (entry.target.exists && entry.target.sha256 !== undefined) baselineEntries.push([entry.path, entry.target.sha256]);
  }
  const hashBaseline: Record<string, string> = {};
  for (const [rel, hash] of baselineEntries.sort((left, right) => left[0].localeCompare(right[0]))) {
    hashBaseline[rel] = hash;
  }

  return { ok: true, packet, requiredReadPaths, hashBaseline };
}

/**
 * 判断期间哈希漂移复核（approve 前由 driver 调用）：
 * 任一基线路径消失或 sha256 变化 ⇒ `{ok:false}`（driver 落 manual/evidence-hash-mismatch）。
 */
export async function verifyEvidenceHashes(
  baseline: Readonly<Record<string, string>>,
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (const rel of Object.keys(baseline).sort()) {
    const fact = await fileFact(projectRoot, rel);
    if (!fact.exists || fact.sha256 === undefined) {
      return { ok: false, reason: `证据在判断期间消失：${rel}` };
    }
    if (fact.sha256 !== baseline[rel]) {
      return { ok: false, reason: `证据在判断期间发生变化：${rel}` };
    }
  }
  return { ok: true };
}
