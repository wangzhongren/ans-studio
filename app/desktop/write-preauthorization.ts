// app/desktop/write-preauthorization.ts
// **边界内写入预授权的桌面应用层兜底**（客户 2026-10-25 新规则；lead-governance-coordination 任务）。
//
// 背景（真机）：统筹写自己边界内的 `docs/scheduling/wukong-2d-layout-v1.md` 时，模型仍按旧习惯调用
// `request_confirmation`，于是弹出了「确认写入 1 个路径」的判断代批卡。客户要求：**在他范围内，直接
// 让他写，不要法官判**；边界外「直接拒绝」；治理敏感类别维持各自的专用确认流程。
//
// 判定顺序（「写盘确认」＝ `kind:"confirm"` 且带声明写入路径；路径取法与编排呈现前完整性闸 /
// judgeContext 同源：显式 `paths` 优先，未给时回退 preview 的「一行一个路径」声明）：
//   1. 任一路径属**治理敏感类别**（见下）⇒ `confirm`——保持既有客户卡 / 判断 agent 流程（优先于
//      边界判定：这些是各自的专用确认流程，不是普通边界外写入）；
//   2. 声明路径**无法解析**（绝对路径/`..`/空段/非字符串）⇒ `reject`（fail-closed，直接拒绝）；
//   3. 全部路径经门禁引擎 `resolveWrite` 判定允许 ⇒ `accept`——不弹卡、不调用判断 agent；
//   4. 任一路径越界/不可写（含一内一外的混合）⇒ `reject`——不弹卡、不调用判断 agent，拒绝原因
//      列出被拒路径、门禁给出的原因与该角色此刻可写的边界。
//
// **边界判定唯一来源 = 门禁引擎 `resolveWrite`**：探测方式与编排确认制发行器
// （`common/编排/confirmed-writes.ts::createConfirmedWriteIssuer`）逐字同法——把目标路径作为唯一
// writeSet 项 + 本边界 conditions 求值。桌面聊天会话无任务级收窄（`scope: undefined`），Section 1
// 即预授权上界；本模块**不复制**任何边界解析 / 路径匹配 / 条件激活逻辑。
//
// 纪律：
//  · 预授权接受 ≠ 跳过任何门禁——写盘许可的发行、真实写入、三权治理门禁（write-flow /
//    write-role-card / write-change-package）与 forbiddenWritePaths 仍由编排/文件工具执行；本模块只决定
//    「这张写盘确认卡要不要客户/判断 agent」；
//  · 不伪造客户手批、不伪造判断代批：接受/拒绝都以 `WRITE_PREAUTHORIZATION_OPERATOR_ID`
//    （`system:` 前缀）结算，`judge` 审计字段永不出现；
//  · 与「替我审批 / 替我决策」开关无关：预授权不需要开关开启；
//  · 任何不确定（无边界快照、判定抛错、路径无法解析）都不放行——维持既有卡片/判断路径或直接拒绝。

import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { AllowedPathsByRoot } from "../../src/model/decision.ts";
import type { CustomerInputMetadata, CustomerInputRequest, RuntimeKind } from "../../src/model/runtime.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
// 声明写入路径与条件 slug 的**同一取法**（编排私有 common；桌面只读导入、不复制第二份）。
import { conditionSlugsOf, explicitConfirmPaths } from "../../src/common/编排/confirmed-writes.ts";
import { declaredWritePathsFromPreview } from "../../src/common/编排/governance-judge-facts.ts";
// 路径比较原语（单一来源 = 项目管理 `src/common/shared/path-primitives.ts`；门禁引擎同源）。
import { compareKey, isAbsoluteAny, isUnderOrEqual, normalizeLexical } from "../../src/common/shared/path-primitives.ts";
// 用户可见文案（共享 i18n 唯一实现；`mainT` 在**生成点**按当前 locale 取词，不缓存）。
import { mainT } from "./i18n.ts";

/**
 * 预授权结算的**操作者标识**（写入 `CustomerInputOutcome.operatorId` / 系统行 / 诊断）。
 * 明确标注来源是**系统预授权**——不是客户手批（`operation-…`）、不是判断代批（`judge:<engine>`）。
 */
export const WRITE_PREAUTHORIZATION_OPERATOR_ID = "system:write-preauthorization";

/** 消息里最多列出的路径/边界条目数（超出的以「等 N 项」概括，避免回执与系统行无限长）。 */
const MAX_PATHS_IN_MESSAGE = 6;
const MAX_ALLOWED_IN_MESSAGE = 12;
/** 单条门禁拒绝原因的首行上限（F6/F7 等文案可能带恢复指引；系统预授权拒绝只取可核对的首段）。 */
const MAX_DENIAL_REASON_IN_MESSAGE = 240;

/** 写盘确认路径的声明来源（诊断/测试用）。 */
export type WritePathDeclarationSource = "explicit" | "preview" | "none";

/** 一次预授权求值所需的事实（全部由桌面侧在会话语境里给出；本模块不读盘、不调模型）。 */
export interface WritePreauthorizationFacts {
  request: CustomerInputRequest;
  /** 角色会话的 Section 1 边界快照（含接受证据；`SessionManager` 按门禁同一解析源给出）。 */
  boundary: BoundarySection1;
  projectRoot: string;
  /** resolveWrite 的 skill 根（与开会话时同一份 ProjectConfig）。 */
  skillRoot: string;
  /** 编排透传的元数据（显式 `paths` 的兜底来源；可选）。 */
  metadata?: CustomerInputMetadata;
}

/** 未自动结算、交回既有卡片/判断路径的原因（诊断用）。 */
export type WritePreauthorizationSkipReason =
  | "not-confirm-card"
  | "no-declared-write-paths"
  | "governance-sensitive";

/** 预授权判定（三态，不产生任何其它形状）。 */
export type WritePreauthorizationDecision =
  | { action: "accept"; paths: string[]; source: WritePathDeclarationSource }
  | {
      action: "reject";
      paths: string[];
      source: WritePathDeclarationSource;
      /** 客户可见/模型回执用的完整拒绝原因（含被拒路径、门禁原因与可写边界）。 */
      reason: string;
      /** 逐路径的拒绝事实（诊断用；不含客户正文）。 */
      deniedPaths: Array<{ path: string; reason: string }>;
      /** `resolveWrite` 给出的「此刻可写边界」（project/skill 分组）。 */
      allowedByRoot: AllowedPathsByRoot;
      /** 无法解析的声明路径（若有；此时 `deniedPaths` 只含可解析路径的判定）。 */
      unresolvedPaths: string[];
    }
  | {
      action: "confirm";
      reason: WritePreauthorizationSkipReason;
      /** 命中的治理敏感路径（`governance-sensitive` 时给出；诊断用）。 */
      sensitivePaths?: string[];
      source: WritePathDeclarationSource;
    };

/** 预授权结算后主进程落**可见系统行**的事件（`onWritePreauthorization`，主→渲经既有事件流）。 */
export interface WritePreauthorizationEvent {
  action: "accept" | "reject";
  roleId: string;
  projectRoot: string;
  runtime?: RuntimeKind;
  paths: string[];
  /** 一句话系统行（如「边界内写入预授权，已直接放行：<path>」）。 */
  summary: string;
}

// —————————————————————— 治理敏感类别 ——————————————————————
//
// 依据（单一来源的口径，不在本模块发明新类别）：
//  · 客户 2026-10-25 规则与门禁引擎 `BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`：`request_confirmation`
//    只保留给治理敏感写入——角色卡 / 边界变更、共享目录或他人写集、`docs/removed/**` 流程 YAML /
//    治理账本、发布 / 变更包等；
//  · 团队计划 v3「治理关键路径」清单（`.ans/`、`角色卡/`、`docs/{scheduling,acceptance,communication,
//    flows,nominations,verification}/`、`src/common/shared/`、release/packaging、`.env`/密钥、根单例
//    契约）是**来源池**：本模块只取其中仍需 `request_confirmation` 的类别；团队计划 / readiness /
//    验收标准与报告 / 治理工作记录等属各自角色 Section 1 内预授权，**不**列入敏感类别。
//
// 说明：这里只做**类别归类**（决定「保持既有卡片/判断」），不做边界判定；归类命中一律交还既有
// 路径，绝不因归类而放行或拒绝。计划 / 分析 / 治理工作记录属各自角色 Section 1 内预授权，
// **不**列入敏感类别（照常自动放行）；`docs/scheduling/` 下仅**变更包**（`*-change-vN.md`）保留确认。
// D 批已撤除 flow 机器：旧流程 YAML 目录不再是治理写区。

interface SensitivePrefixRule {
  prefix: string;
  category: string;
}

const SENSITIVE_PREFIXES: readonly SensitivePrefixRule[] = [
  { prefix: ".ans", category: "应用治理记录（.ans/**）" },
  { prefix: "角色卡", category: "角色卡/边界（appointment-write）" },
  { prefix: "docs/nominations", category: "旧提名（legacy 治理）" },
  { prefix: "docs/audit", category: "应用 shell 审计" },
  { prefix: "src/common/shared", category: "共享目录（src/common/shared/**）" },
  { prefix: "shared", category: "项目共享目录（shared/**）" },
  { prefix: ".github/workflows", category: "发布流水线" },
];

const SENSITIVE_FILES: ReadonlySet<string> = new Set([
  "docs/bootstrap-manifest.md",
  // 根单例契约（团队计划 v3 治理关键路径：只能按既有治理授权精确文件）。
  "src/model/boundary.ts",
  "src/model/role.ts",
  "src/model/decision.ts",
  "src/model/runtime.ts",
  // release / packaging。
  "package.json",
  "package-lock.json",
  "electron-builder.yml",
  "tsconfig.json",
  "vite.config.ts",
  "bin/ans.js",
]);

interface SensitivePatternRule {
  pattern: RegExp;
  category: string;
}

const SENSITIVE_PATTERNS: readonly SensitivePatternRule[] = [
  // .env / .env.*（.env 已在上表；此处覆盖 `.env.local` 等）。
  { pattern: /^\.env(?:\..+)?$/i, category: "环境/密钥（.env*）" },
  { pattern: /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.pub)?$/i, category: "密钥" },
  { pattern: /\.(?:pem|key|p12|pfx)$/i, category: "密钥/证书" },
  // 变更包（docs/scheduling/<flowId>-change-vN.md；发布/验收治理产物）。
  { pattern: /^docs\/scheduling\/.+-change(?:-v\d+)?\.md$/i, category: "变更包（发布/验收治理）" },
  // release 装配实现（团队计划 v3 治理关键路径）。
  { pattern: /^src\/common\/装配\/release-/i, category: "发布装配" },
];

/**
 * 治理敏感类别（命中返回类别名；未命中 `undefined`）。
 * 路径按项目相对路径处理；前缀按**段**比较（`isUnderOrEqual`，与门禁引擎同一比较原语）。
 */
export function governanceSensitiveWriteCategory(relPath: string): string | undefined {
  const rel = normalizeLexical(relPath);
  if (rel === "" || rel === "." || rel.startsWith("../")) return undefined;
  for (const rule of SENSITIVE_PREFIXES) {
    if (isUnderOrEqual(rel, rule.prefix)) return rule.category;
  }
  // 精确文件按门禁同一比较键（Windows 大小写不敏感）。
  const relKey = compareKey(rel);
  for (const file of SENSITIVE_FILES) {
    if (compareKey(file) === relKey) return "根单例/发布文件";
  }
  for (const rule of SENSITIVE_PATTERNS) {
    if (rule.pattern.test(rel)) return rule.category;
  }
  return undefined;
}

// —————————————————————— 声明写入路径（与既有闸同源） ——————————————————————

/** 单条声明路径的词法合法性（与 `explicitConfirmPaths` 同一口径；只做路径语法，不做边界判定）。 */
function normalizeDeclaredPath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "" || isAbsoluteAny(trimmed)) return undefined;
  const norm = normalizeLexical(trimmed);
  if (norm === "" || norm === "." || norm.startsWith("../")) return undefined;
  if (norm.split("/").some((segment) => segment === "" || segment === "..")) return undefined;
  return norm;
}

interface DeclaredWritePaths {
  paths: string[];
  /** 声称是写入路径但无法解析的原始条目（fail-closed：直接拒绝）。 */
  unresolved: string[];
  source: WritePathDeclarationSource;
}

/**
 * 取本次写盘确认的声明写入路径：
 *  · 显式 `req.paths`（非空数组）优先——任一条目非法 ⇒ `unresolved`（不回退 preview 猜）；
 *  · 请求本体没有时，用编排透传的 `metadata.paths`（同为工具入参，防御性兜底）；
 *  · 都没有 ⇒ 回退 preview 的「一行一个路径」声明（既有 legacy 口径，`declaredWritePathsFromPreview`）。
 * 与 `declaredConfirmPaths` / 呈现前完整性闸 / judgeContext 的取法同源，不扫描散文。
 */
export function readDeclaredWritePaths(
  request: CustomerInputRequest,
  metadata?: CustomerInputMetadata,
): DeclaredWritePaths {
  if (request.kind !== "confirm") return { paths: [], unresolved: [], source: "none" };
  const raw = (request as { paths?: unknown }).paths;
  if (Array.isArray(raw) && raw.length > 0) {
    const unresolved: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string" || normalizeDeclaredPath(entry) === undefined) {
        unresolved.push(typeof entry === "string" ? entry : String(entry));
      }
    }
    // 规范化/去重交给既有实现（空数组视为未给 ⇒ 这里已有非空原始数组，不会误回退）。
    return { paths: explicitConfirmPaths(request) ?? [], unresolved, source: "explicit" };
  }
  const fromMetadata = metadata?.paths;
  if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
    const synthetic = { ...request, paths: fromMetadata } as CustomerInputRequest;
    const unresolved: string[] = [];
    for (const entry of fromMetadata) {
      if (typeof entry !== "string" || normalizeDeclaredPath(entry) === undefined) {
        unresolved.push(typeof entry === "string" ? entry : String(entry));
      }
    }
    return { paths: explicitConfirmPaths(synthetic) ?? [], unresolved, source: "explicit" };
  }
  const fromPreview = declaredWritePathsFromPreview(request.preview ?? "");
  return { paths: fromPreview, unresolved: [], source: fromPreview.length > 0 ? "preview" : "none" };
}

// —————————————————————— 判定 ——————————————————————

function boundedList(values: readonly string[], limit: number): string {
  const shown = values.slice(0, limit);
  const text = shown.join("、");
  return values.length > limit ? `${text} 等 ${values.length} 项` : text;
}

function firstLine(text: string, max = MAX_DENIAL_REASON_IN_MESSAGE): string {
  const line = (text.split("\n")[0] ?? "").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function buildRejectReason(input: {
  denied: Array<{ path: string; reason: string }>;
  unresolved: string[];
  allowedByRoot: AllowedPathsByRoot;
  /** 同时存在可写路径与被拒路径（一内一外）。 */
  mixed: boolean;
}): string {
  const allDeclared = [...input.denied.map((entry) => entry.path), ...input.unresolved];
  const headline = mainT("main.customerInput.writePreauthorization.rejected", {
    paths: boundedList(allDeclared, MAX_PATHS_IN_MESSAGE),
  });
  const parts: string[] = [];
  if (input.mixed) parts.push(mainT("main.customerInput.writePreauthorization.reason.mixed"));
  if (input.denied.length > 0) {
    const entries = input.denied
      .slice(0, MAX_PATHS_IN_MESSAGE)
      .map((entry) => `${entry.path}（${firstLine(entry.reason)}）`);
    const allowed = [
      ...input.allowedByRoot.project,
      ...input.allowedByRoot.skill.map((path) => `skill:${path}`),
    ];
    const allowedTail = allowed.length > 0 ? `；${boundedList(allowed, MAX_ALLOWED_IN_MESSAGE)}` : "";
    const overflow = input.denied.length > MAX_PATHS_IN_MESSAGE ? ` 等 ${input.denied.length} 个路径` : "";
    parts.push(`${mainT("main.customerInput.writePreauthorization.reason.boundary")}${overflow}：${entries.join("；")}${allowedTail}`);
  }
  if (input.unresolved.length > 0) {
    const label =
      input.denied.length === 0 && allDeclared.length === input.unresolved.length
        ? mainT("main.customerInput.writePreauthorization.noPaths")
        : mainT("main.customerInput.writePreauthorization.reason.unresolved");
    parts.push(`${label}：${boundedList(input.unresolved, MAX_PATHS_IN_MESSAGE)}`);
  }
  return `${headline}。${parts.join("；")}。`;
}

/**
 * 判定一张写盘确认请求在桌面侧如何结算（纯函数；不读盘、不调模型、不写任何东西）。
 *
 * 返回 `confirm` 时调用方必须走**既有**呈现/判断路径（零行为变化）；`accept`/`reject` 时调用方
 * 直接结算，不呈现卡片、不调用判断 agent。
 */
export function evaluateWritePreauthorization(facts: WritePreauthorizationFacts): WritePreauthorizationDecision {
  const { request } = facts;
  const declared = readDeclaredWritePaths(request, facts.metadata);
  if (request.kind !== "confirm") {
    return { action: "confirm", reason: "not-confirm-card", source: declared.source };
  }
  if (declared.paths.length === 0 && declared.unresolved.length === 0) {
    return { action: "confirm", reason: "no-declared-write-paths", source: declared.source };
  }

  // 治理敏感类别优先于边界判定：这些路径有各自的专用确认流程（appointment-write / 发布与变更包等），
  // 不是「普通边界外写入」——保持既有卡片/判断，绝不在这里放行或拒绝。
  const sensitive: string[] = [];
  for (const path of declared.paths) {
    if (governanceSensitiveWriteCategory(path) !== undefined) sensitive.push(path);
  }
  if (sensitive.length > 0) {
    return {
      action: "confirm",
      reason: "governance-sensitive",
      sensitivePaths: sensitive,
      source: declared.source,
    };
  }

  // 边界判定：唯一来源 = 门禁引擎 resolveWrite（探测方式与编排确认制发行器同法）。
  const conditions = conditionSlugsOf(facts.boundary);
  const denied: Array<{ path: string; reason: string }> = [];
  let allowedByRoot: AllowedPathsByRoot = { skill: [], project: [] };
  let allowedCount = 0;
  for (const path of declared.paths) {
    let decision: ReturnType<typeof resolveWrite>;
    try {
      decision = resolveWrite(
        path,
        facts.boundary,
        { writeSet: [path], conditions },
        { skillRoot: facts.skillRoot, projectRoot: facts.projectRoot },
      );
    } catch (error) {
      // 判定异常 ⇒ fail-closed：按越界/不可写拒绝（绝不放行，也不弹卡/不调模型）。
      decision = {
        allowed: false,
        reason: `边界判定异常：${error instanceof Error ? error.message : String(error)}`,
        allowedByRoot: { skill: [], project: [] },
      };
    }
    if (!decision.allowed) {
      denied.push({ path, reason: decision.reason });
      if (decision.allowedByRoot.project.length > 0 || decision.allowedByRoot.skill.length > 0) {
        allowedByRoot = decision.allowedByRoot;
      }
    } else {
      allowedCount += 1;
    }
  }
  if (denied.length === 0 && declared.unresolved.length === 0) {
    return { action: "accept", paths: [...declared.paths], source: declared.source };
  }
  return {
    action: "reject",
    paths: [...declared.paths],
    source: declared.source,
    deniedPaths: denied,
    allowedByRoot,
    unresolvedPaths: [...declared.unresolved],
    reason: buildRejectReason({
      denied,
      unresolved: declared.unresolved,
      allowedByRoot,
      mixed: denied.length > 0 && allowedCount > 0,
    }),
  };
}

/** 预授权结算的可见系统行文案（一句话；完整原因在 `reject.reason`）。 */
export function writePreauthorizationSummary(
  decision: Extract<WritePreauthorizationDecision, { action: "accept" | "reject" }>,
): string {
  const allPaths =
    decision.action === "reject" ? [...decision.paths, ...decision.unresolvedPaths] : decision.paths;
  const paths = allPaths.length > 0
    ? boundedList(allPaths, MAX_PATHS_IN_MESSAGE)
    : mainT("main.customerInput.writePreauthorization.noPaths");
  return decision.action === "accept"
    ? mainT("main.customerInput.writePreauthorization.accepted", { paths })
    : mainT("main.customerInput.writePreauthorization.rejected", { paths });
}
