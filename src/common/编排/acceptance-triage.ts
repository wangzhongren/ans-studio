// src/common/编排/acceptance-triage.ts
// **验收分诊（2026-10-25 设计 `2026-10-25_design_acceptance-triage.md` §4 / §5 / §8.1）**。
//
// 背景：独立验收（Proof）的验收报告此前只有 `acceptance-rework/v1`（仅 id/owner/action/evidence），
// 应用无法区分 blocker 与 nit，也无法表达「验收未通过但不值得返工、仅汇报」。分诊在验收卡到达后、
// 任何客户卡呈现 / 判断代批之前，先按报告里的 `acceptance-triage/v1` 段做一次**确定性**建议：
// 存在可执行的 blocker/major ⇒ 建议下发统筹修改；只有 minor/nit ⇒ 建议仅汇报不返工；结构缺失/坏/
// 矛盾/改进方案不可执行 ⇒ 退回 Proof 补报告，不猜。
//
// 本模块只做三件事，全部**纯函数、无 IO、不调模型**：
//   1. `parseAcceptanceTriageReport`：从报告 Markdown 提取**恰好一个** fenced YAML
//      `schema: acceptance-triage/v1` 段并严格校验（设计 §4.2 / §4.4）；
//   2. `recommendAcceptanceTriage`：§5.1 R1–R7 默认建议。**只读结构**（结论 / 严重度 / 指针），
//      不读 reason/action 的文风、篇幅、语气（R6/R7 钉死）；
//   3. `acceptanceTriageToReworkItems`：triage items → 既有 `acceptance-rework/v1` 任务项
//      （id/owner/action 原样；evidence = evidence ∪ targets；severity/reason 作为附加上下文）。
//
// 分层：编排私有 common；桌面经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费。
// **旧的 `acceptance-rework.ts` 解析器保持原样**：两份 schema 可同时出现在一份报告中，分诊以 triage
// 段为准（设计 §11.1）；本模块不复用/不改动旧解析器，也不解析旧的 rework 段。

import { parse as parseYaml } from "yaml";
import type { AcceptanceReworkItem } from "./acceptance-rework.ts";

// —————————————————————— 常量 ——————————————————————

/** 分诊段的唯一受支持 schema（报告必须逐字写）。 */
export const ACCEPTANCE_TRIAGE_SCHEMA = "acceptance-triage/v1" as const;

/** 单份报告分诊项上限（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_ITEMS = 64;

/** 单个候选段的内容上限（UTF-8 字节；设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_BLOCK_BYTES = 32 * 1024;

/** `items[].id` 形状（与 `acceptance-rework/v1` 相同；跨 owner 的发现拆成多个 id）。 */
export const ACCEPTANCE_TRIAGE_ITEM_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$";

/** `items[].reason` 最大字符数（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_REASON_LENGTH = 1000;

/** `items[].action` 最大字符数（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_ACTION_LENGTH = 2000;

/** `items[].owner` 最大字符数（形状校验；单 owner 语义见 `OWNER_TOKEN_RE`）。 */
export const ACCEPTANCE_TRIAGE_MAX_OWNER_LENGTH = 64;

/** `items[].targets` / `items[].evidence` 最多条数（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_POINTER_ITEMS = 10;

/** `items[].targets` / `items[].criteria` / `items[].evidence` 单条最大字符数（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH = 500;

/** 报告结论三档（设计 §4.2）。 */
export const ACCEPTANCE_TRIAGE_CONCLUSIONS = ["pass", "fail", "conditional"] as const;

/** 失败项严重度四档（设计 §4.3 / §4.2）。 */
export const ACCEPTANCE_TRIAGE_SEVERITIES = ["blocker", "major", "minor", "nit"] as const;

const ITEM_ID_RE = new RegExp(ACCEPTANCE_TRIAGE_ITEM_ID_PATTERN);
const CONCLUSION_SET: ReadonlySet<string> = new Set(ACCEPTANCE_TRIAGE_CONCLUSIONS);
const SEVERITY_SET: ReadonlySet<string> = new Set(ACCEPTANCE_TRIAGE_SEVERITIES);

/**
 * owner **形状**：恰好一个角色 id token——不含空白、路径分隔符、列表/连接符。
 * 只做形状判定（`a + b` / `客户/Proof` / `a,b` / `a、b` 一律拒绝）；owner 是否存在/可派发
 * 由桌面用项目 listing + 内置治理角色校验（本模块不读项目、不猜）。
 */
const OWNER_TOKEN_RE = /^[^\s+/\\,、&，；;]+$/u;

// —————————————————————— 类型 ——————————————————————

export type AcceptanceTriageConclusion = (typeof ACCEPTANCE_TRIAGE_CONCLUSIONS)[number];
export type AcceptanceTriageSeverity = (typeof ACCEPTANCE_TRIAGE_SEVERITIES)[number];

/** 解析错误（`path` 为段内 YAML 路径，如 `items[3].owner`；`$` 表示段根）。 */
export interface AcceptanceTriageError {
  path: string;
  message: string;
}

/** 单个分诊项（已规范化：字符串 trim；`targets`/`evidence` 统一为数组；`criteria` 缺省 null）。 */
export interface AcceptanceTriageItem {
  id: string;
  severity: AcceptanceTriageSeverity;
  owner: string;
  reason: string;
  action: string;
  /** 文件/模块指针（可选；≤10 条、每条 ≤500 字符）。 */
  targets: string[];
  /** 验收标准指针（可选；≤500 字符）。 */
  criteria: string | null;
  /** 证据指针（可选；≤10 条、每条 ≤500 字符）。**不是**改进方案指针。 */
  evidence: string[];
}

/** 通过校验的分诊段。 */
export interface AcceptanceTriageSection {
  schema: typeof ACCEPTANCE_TRIAGE_SCHEMA;
  conclusion: AcceptanceTriageConclusion;
  /**
   * 报告建议的协调者（兼容 `acceptance-rework/v1` 的建议字段，固定 `convener`）。
   * 实际接收方仍由应用按治理模型决定（trio → 主理 / Lead），报告不能指定。
   */
  coordinator: "convener";
  /** 报告里 `coordinator` 的原始值（缺省/null 表示未写）；仅作审计/提示。 */
  coordinatorDeclaration: string | null;
  items: AcceptanceTriageItem[];
}

/** 解析失败码（桌面按码决定退回/降级，不按文本猜）。 */
export type AcceptanceTriageParseFailureCode = "missing" | "invalid" | "unsupported-version" | "ambiguous";

/**
 * 解析结果（纯值对象）：
 *   · `ok:true` ⇒ `triage` 可直接用于分诊建议与记录；`warnings` 是可展示的提示；
 *   · `ok:false` ⇒ `code` + 逐条 `errors`（带具体 path）；调用方不得部分采信。
 */
export type AcceptanceTriageParseResult =
  | { ok: true; triage: AcceptanceTriageSection; warnings: string[] }
  | { ok: false; code: AcceptanceTriageParseFailureCode; errors: AcceptanceTriageError[] };

// —————————————————————— 基础 ——————————————————————

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function failure(
  code: AcceptanceTriageParseFailureCode,
  errors: AcceptanceTriageError[],
): AcceptanceTriageParseResult {
  return { ok: false, code, errors };
}

/** 去 HTML 注释（未闭合注释吞到 EOF，按 HTML 语义）：注释里的伪 fenced 段不参与扫描。 */
function stripHtmlComments(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf("<!--", index);
    if (start === -1) {
      result += text.slice(index);
      break;
    }
    result += text.slice(index, start);
    const end = text.indexOf("-->", start + 4);
    if (end === -1) break;
    index = end + 3;
  }
  return result;
}

interface FencedBlock {
  /** 去除 fence 缩进后的块内容（行以 `\n` 连接，无结尾换行）。 */
  content: string;
}

interface CandidateBlock extends FencedBlock {
  /** YAML 解析结果：坏 YAML 的候选必须判 `invalid`（不是被当普通代码块忽略）。 */
  document?: unknown;
  parseError?: string;
}

/**
 * 扫描 Markdown fenced code block（CommonMark 子集）：
 *   · 开头 ≤3 空格 + ≥3 个反引号或波浪号；反引号 fence 的 info string 不得含反引号；
 *   · 结尾同字符、长度不短于开头、仅允许空白；未闭合 fence 按「到 EOF」处理；
 *   · 开头 fence 缩进 N 空格时，内容行去掉至多 N 个前导空格（CommonMark 折叠）。
 * 缩进代码块（4 空格）不是 fenced block，不扫描。
 *
 * 说明：这里与 `acceptance-rework.ts` 的扫描器语义一致但**独立实现**——旧解析器是已验收冻结的
 * 候选（不改动其文件），两份 schema 各自 fail-closed，互不采信对方的段。
 */
function scanFencedBlocks(markdown: string): FencedBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: FencedBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const opening = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening === null) {
      index += 1;
      continue;
    }
    const fenceChar = opening[2]![0]!;
    const fenceLength = opening[2]!.length;
    const info = opening[3]!.trim();
    if (fenceChar === "`" && info.includes("`")) {
      index += 1;
      continue;
    }
    const indent = opening[1]!.length;
    const contentLines: string[] = [];
    index += 1;
    while (index < lines.length) {
      const current = lines[index]!;
      const closing = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(current);
      if (closing !== null && closing[2]![0] === fenceChar && closing[2]!.length >= fenceLength) {
        index += 1;
        break;
      }
      let content = current;
      if (indent > 0) {
        let strip = 0;
        while (strip < indent && content.startsWith(" ")) {
          content = content.slice(1);
          strip += 1;
        }
      }
      contentLines.push(content);
      index += 1;
    }
    blocks.push({ content: contentLines.join("\n") });
  }
  return blocks;
}

/**
 * 词法提示：块内**顶格** `schema:` 行的值是否提及 `acceptance-triage`。
 * 用于在 YAML 解析前识别候选块（坏 YAML 的候选块也要能判 `invalid`，而不是被当普通代码块忽略）；
 * 真正的 schema 校验仍以 YAML 解析结果为准。`#` 注释与成对引号按 YAML 词法剥离。
 */
function blockMentionsAcceptanceTriageSchema(content: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    const match = /^schema\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    let raw = match[1]!.trim();
    const commentIndex = raw.search(/\s#/);
    if (commentIndex !== -1) raw = raw.slice(0, commentIndex).trim();
    if (
      raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
    ) {
      raw = raw.slice(1, -1);
    }
    if (raw.includes("acceptance-triage")) return true;
  }
  return false;
}

/** 解析「字符串或字符串数组」指针列表（targets/evidence）；空数组合法。 */
function parseStringPointerList(
  raw: unknown,
  path: string,
  errors: AcceptanceTriageError[],
  what: string,
): string[] | undefined {
  const rawList = typeof raw === "string" ? [raw] : raw;
  if (!Array.isArray(rawList)) {
    errors.push({ path, message: `${what} 必须是字符串或字符串数组` });
    return undefined;
  }
  if (rawList.length > ACCEPTANCE_TRIAGE_MAX_POINTER_ITEMS) {
    errors.push({
      path,
      message: `${what} 最多 ${ACCEPTANCE_TRIAGE_MAX_POINTER_ITEMS} 条（当前 ${rawList.length} 条）`,
    });
    return undefined;
  }
  const values: string[] = [];
  let ok = true;
  rawList.forEach((entry, entryIndex) => {
    const entryPath = typeof raw === "string" ? path : `${path}[${entryIndex}]`;
    if (typeof entry !== "string" || entry.trim() === "") {
      errors.push({ path: entryPath, message: `${what} 每条必须是非空字符串` });
      ok = false;
      return;
    }
    const trimmed = entry.trim();
    if (trimmed.length > ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH) {
      errors.push({
        path: entryPath,
        message: `${what} 单条过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH}）`,
      });
      ok = false;
      return;
    }
    values.push(trimmed);
  });
  return ok ? values : undefined;
}

// —————————————————————— 解析器 ——————————————————————

/**
 * 解析验收报告 Markdown 中的 `acceptance-triage/v1` 段（设计 §4.2 / §4.4）。
 *
 * 纯函数：只依赖入参字符串与 `yaml` 解析器；不读文件系统、不做网络/模型调用、不写任何状态。
 * 失败码：
 *   · `missing`：没有任何候选段（含只有旧 `acceptance-rework/v1` 的报告）；
 *   · `ambiguous`：出现多个候选段（无法判定哪份权威，不猜）；
 *   · `unsupported-version`：`schema: acceptance-triage/<其他版本>`（不按 v1 猜）；
 *   · `invalid`：坏 YAML / 未知字段 / 重复 id / 空字段 / 超限 / `pass` 带 blocker/major 等等。
 *
 * @param markdown 验收报告全文（Markdown）
 */
export function parseAcceptanceTriageReport(markdown: string): AcceptanceTriageParseResult {
  if (typeof markdown !== "string") {
    return failure("invalid", [{ path: "$", message: "报告内容必须是字符串" }]);
  }

  const withoutComments = stripHtmlComments(markdown);
  const blocks = scanFencedBlocks(withoutComments);
  const candidates: CandidateBlock[] = [];
  for (const block of blocks) {
    const lexical = blockMentionsAcceptanceTriageSchema(block.content);
    let document: unknown;
    let parseError: string | undefined;
    try {
      document = parseYaml(block.content, { uniqueKeys: true, maxAliasCount: 100 });
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    // 候选：顶格 `schema:` 行提及 acceptance-triage（坏 YAML 也能识别），或 flow 风格根映射的
    // `schema` 字段提及 acceptance-triage。其他代码块（含旧 acceptance-rework/v1）一律忽略。
    const rootSchema =
      isPlainObject(document) && typeof document.schema === "string" ? document.schema : undefined;
    const candidate = lexical || (rootSchema !== undefined && rootSchema.includes("acceptance-triage"));
    if (candidate) candidates.push({ content: block.content, document, parseError });
  }

  if (candidates.length === 0) {
    return failure("missing", [
      {
        path: "$",
        message:
          "报告没有 acceptance-triage 段：要求恰好一个 fenced YAML 块，schema: acceptance-triage/v1" +
          "（缺结构不猜；旧 acceptance-rework/v1 不满足分诊要求）。",
      },
    ]);
  }
  if (candidates.length > 1) {
    return failure("ambiguous", [
      {
        path: "$",
        message: `报告包含多个 acceptance-triage 段（共 ${candidates.length} 个）；至多允许一个。`,
      },
    ]);
  }

  const block = candidates[0]!;
  if (byteLength(block.content) > ACCEPTANCE_TRIAGE_MAX_BLOCK_BYTES) {
    return failure("invalid", [
      {
        path: "$",
        message: `acceptance-triage 段过大（${byteLength(block.content)} 字节；上限 ${ACCEPTANCE_TRIAGE_MAX_BLOCK_BYTES} 字节）。`,
      },
    ]);
  }
  if (block.parseError !== undefined) {
    return failure("invalid", [{ path: "$", message: `YAML 语法错误：${block.parseError}` }]);
  }
  const document = block.document;
  if (!isPlainObject(document)) {
    return failure("invalid", [{ path: "$", message: "acceptance-triage 段的根节点必须是对象" }]);
  }

  // —— 顶层字段（未知字段 fail-closed；与 flow YAML / rework v1 的严格口径一致） ——
  const errors: AcceptanceTriageError[] = [];
  const warnings: string[] = [];
  const topLevelKeys = new Set(["schema", "conclusion", "coordinator", "items"]);
  for (const key of Object.keys(document)) {
    if (!topLevelKeys.has(key)) {
      errors.push({ path: key, message: `未知字段 ${key}；只允许 schema / conclusion / coordinator / items` });
    }
  }

  // —— schema（版本不支持 ⇒ unsupported-version，不按 v1 猜） ——
  const rawSchema = document.schema;
  if (rawSchema !== ACCEPTANCE_TRIAGE_SCHEMA) {
    if (typeof rawSchema === "string" && rawSchema.trim().startsWith("acceptance-triage")) {
      return failure("unsupported-version", [
        {
          path: "schema",
          message: `不支持的 schema：${JSON.stringify(rawSchema)}；只支持 ${ACCEPTANCE_TRIAGE_SCHEMA}。`,
        },
      ]);
    }
    errors.push({
      path: "schema",
      message: `schema 必须是 ${ACCEPTANCE_TRIAGE_SCHEMA}（当前 ${JSON.stringify(rawSchema)}）`,
    });
  }

  // —— conclusion（pass / fail / conditional） ——
  let conclusion: AcceptanceTriageConclusion | undefined;
  const rawConclusion = document.conclusion;
  if (typeof rawConclusion !== "string" || !CONCLUSION_SET.has(rawConclusion)) {
    errors.push({
      path: "conclusion",
      message: `conclusion 必须是 ${ACCEPTANCE_TRIAGE_CONCLUSIONS.join(" / ")}（当前 ${JSON.stringify(rawConclusion)}）`,
    });
  } else {
    conclusion = rawConclusion as AcceptanceTriageConclusion;
  }

  // —— coordinator（可选；缺省 convener；别名 steward；其他值 warning，仍按 Convener 建议） ——
  let coordinatorDeclaration: string | null = null;
  if (document.coordinator !== undefined) {
    if (typeof document.coordinator !== "string") {
      errors.push({ path: "coordinator", message: "coordinator 给出时必须是字符串" });
    } else {
      const raw = document.coordinator.trim();
      if (raw === "") {
        errors.push({ path: "coordinator", message: "coordinator 给出时必须是非空字符串（缺省即 convener）" });
      } else {
        coordinatorDeclaration = raw;
        if (raw !== "convener" && raw !== "steward") {
          warnings.push(
            `coordinator=${JSON.stringify(raw)} 不受支持；协调者建议值固定为 Convener` +
              "（实际接收方由应用按治理模型决定，报告不能指定）。",
          );
        }
      }
    }
  }

  // —— items（数组；≤64；pass 可为空；fail/conditional 必须非空） ——
  const items: AcceptanceTriageItem[] = [];
  const rawItems = document.items;
  if (!Array.isArray(rawItems)) {
    errors.push({ path: "items", message: "items 必须是数组（pass 报告允许空数组）" });
  } else if (rawItems.length > ACCEPTANCE_TRIAGE_MAX_ITEMS) {
    errors.push({
      path: "items",
      message: `items 最多 ${ACCEPTANCE_TRIAGE_MAX_ITEMS} 项（当前 ${rawItems.length} 项）`,
    });
  } else if (rawItems.length === 0 && (conclusion === "fail" || conclusion === "conditional")) {
    errors.push({
      path: "items",
      message: `conclusion=${conclusion} 时 items 不能为空（未通过报告必须列出至少一个失败项）`,
    });
  } else {
    const seenIds = new Set<string>();
    rawItems.forEach((rawItem, index) => {
      const base = `items[${index}]`;
      if (!isPlainObject(rawItem)) {
        errors.push({
          path: base,
          message: "分诊项必须是对象 { id, severity, owner, reason, action, targets?, criteria?, evidence? }",
        });
        return;
      }
      const itemKeys = new Set(["id", "severity", "owner", "reason", "action", "targets", "criteria", "evidence"]);
      for (const key of Object.keys(rawItem)) {
        if (!itemKeys.has(key)) {
          errors.push({
            path: `${base}.${key}`,
            message: `未知字段 ${key}；分诊项只允许 id / severity / owner / reason / action / targets / criteria / evidence`,
          });
        }
      }

      // id：必填、唯一、固定形状。
      const rawId = rawItem.id;
      let id: string | undefined;
      if (typeof rawId !== "string" || rawId.trim() === "") {
        errors.push({ path: `${base}.id`, message: "缺少必填字段 id（非空字符串）" });
      } else if (!ITEM_ID_RE.test(rawId)) {
        errors.push({
          path: `${base}.id`,
          message: `id 非法：${JSON.stringify(rawId)}；要求 ${ACCEPTANCE_TRIAGE_ITEM_ID_PATTERN}`,
        });
      } else if (seenIds.has(rawId)) {
        errors.push({ path: `${base}.id`, message: `id 重复：${JSON.stringify(rawId)}（跨 owner 的发现必须拆成不同 id）` });
      } else {
        seenIds.add(rawId);
        id = rawId;
      }

      // severity：必填、四档。
      let severity: AcceptanceTriageSeverity | undefined;
      const rawSeverity = rawItem.severity;
      if (typeof rawSeverity !== "string" || !SEVERITY_SET.has(rawSeverity)) {
        errors.push({
          path: `${base}.severity`,
          message: `severity 必须是 ${ACCEPTANCE_TRIAGE_SEVERITIES.join(" / ")}（当前 ${JSON.stringify(rawSeverity)}）`,
        });
      } else {
        severity = rawSeverity as AcceptanceTriageSeverity;
      }

      // owner：恰好一个角色 id（只做形状校验；存在性/可派发由桌面校验）。
      let owner: string | undefined;
      if (typeof rawItem.owner !== "string" || rawItem.owner.trim() === "") {
        errors.push({ path: `${base}.owner`, message: "缺少必填字段 owner（单个角色 id 字符串）" });
      } else if (rawItem.owner.length > ACCEPTANCE_TRIAGE_MAX_OWNER_LENGTH) {
        errors.push({
          path: `${base}.owner`,
          message: `owner 过长（${rawItem.owner.length} 字符；最多 ${ACCEPTANCE_TRIAGE_MAX_OWNER_LENGTH}）`,
        });
      } else if (!OWNER_TOKEN_RE.test(rawItem.owner)) {
        errors.push({
          path: `${base}.owner`,
          message: `owner 必须恰好一个角色 id（不得写多 owner/路径/空白：${JSON.stringify(rawItem.owner)}）`,
        });
      } else {
        owner = rawItem.owner;
      }

      // reason：必填、≤1000（trim 后保存）。
      let reason: string | undefined;
      if (typeof rawItem.reason !== "string" || rawItem.reason.trim() === "") {
        errors.push({ path: `${base}.reason`, message: "缺少必填字段 reason（失败原因，非空字符串）" });
      } else {
        const trimmed = rawItem.reason.trim();
        if (trimmed.length > ACCEPTANCE_TRIAGE_MAX_REASON_LENGTH) {
          errors.push({
            path: `${base}.reason`,
            message: `reason 过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_TRIAGE_MAX_REASON_LENGTH}）`,
          });
        } else {
          reason = trimmed;
        }
      }

      // action：必填、≤2000（trim 后保存）。
      let action: string | undefined;
      if (typeof rawItem.action !== "string" || rawItem.action.trim() === "") {
        errors.push({ path: `${base}.action`, message: "缺少必填字段 action（改进方案，非空字符串）" });
      } else {
        const trimmed = rawItem.action.trim();
        if (trimmed.length > ACCEPTANCE_TRIAGE_MAX_ACTION_LENGTH) {
          errors.push({
            path: `${base}.action`,
            message: `action 过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_TRIAGE_MAX_ACTION_LENGTH}）`,
          });
        } else {
          action = trimmed;
        }
      }

      // targets：可选；字符串或字符串数组；≤10、每条 ≤500。
      let targets: string[] | undefined;
      if (rawItem.targets !== undefined) {
        targets = parseStringPointerList(rawItem.targets, `${base}.targets`, errors, "targets");
      }

      // criteria：可选；字符串；≤500。
      let criteria: string | null = null;
      if (rawItem.criteria !== undefined) {
        if (typeof rawItem.criteria !== "string" || rawItem.criteria.trim() === "") {
          errors.push({ path: `${base}.criteria`, message: "criteria 给出时必须是非空字符串（验收标准指针）" });
        } else {
          const trimmed = rawItem.criteria.trim();
          if (trimmed.length > ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH) {
            errors.push({
              path: `${base}.criteria`,
              message: `criteria 过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH}）`,
            });
          } else {
            criteria = trimmed;
          }
        }
      }

      // evidence：可选；字符串或字符串数组；≤10、每条 ≤500。证据不是改进方案指针。
      let evidence: string[] | undefined;
      if (rawItem.evidence !== undefined) {
        evidence = parseStringPointerList(rawItem.evidence, `${base}.evidence`, errors, "evidence");
      }

      if (
        id !== undefined &&
        severity !== undefined &&
        owner !== undefined &&
        reason !== undefined &&
        action !== undefined
      ) {
        items.push({
          id,
          severity,
          owner,
          reason,
          action,
          targets: targets ?? [],
          criteria,
          evidence: evidence ?? [],
        });
      }
    });
  }

  // —— 矛盾（R5）：`pass` 却带 blocker/major ⇒ invalid ——
  if (conclusion === "pass") {
    items.forEach((item, index) => {
      if (item.severity === "blocker" || item.severity === "major") {
        errors.push({
          path: `items[${index}].severity`,
          message: `conclusion=pass 与 severity=${item.severity} 矛盾：通过报告不得包含 blocker/major（R5）`,
        });
      }
    });
  }

  if (errors.length > 0) return failure("invalid", errors);

  return {
    ok: true,
    triage: {
      schema: ACCEPTANCE_TRIAGE_SCHEMA,
      conclusion: conclusion!,
      coordinator: "convener",
      coordinatorDeclaration,
      items,
    },
    warnings,
  };
}

// —————————————————————— 默认建议（§5.1 R1–R7） ——————————————————————

/** 分诊处置四值（设计 §5.1 / §8.3）。 */
export type AcceptanceTriageDisposition = "rework" | "report-only" | "no-triage" | "return-to-verifier";

/** 建议依据码（可审计；设计 §9.1 `recommendationBasis`）。 */
export type AcceptanceTriageRecommendationBasis =
  | "pass"
  | "blocker-major-feasible"
  | "minor-only"
  | "blocker-major-infeasible"
  | "feasibility-unavailable"
  | "invalid-structure";

/** 单项可执行性判定结果（由桌面用项目 listing + 内置治理角色 + 指针形状提供）。 */
export interface AcceptanceTriageItemExecutability {
  /**
   * `executable` = 可派发；`not-executable` = 明确不可执行（owner 未知/不可派发等）；
   * `unavailable` = 无法核对（listing/账本不可用）——此时**不做权威自动建议**（§5.4）。
   */
  status: "executable" | "not-executable" | "unavailable";
  /** 机器可读的原因码/说明（写入建议 reasons 与记录审计）。 */
  reasons?: readonly string[];
}

/**
 * 可执行性检查回调（桌面提供；本模块只消费判定，不读项目/账本）。
 * 可返回布尔值（true=executable / false=not-executable）或结构化判定。
 *
 * 注意：`action` 非空与「至少一个 targets/criteria 指针」由本模块**自己**按 §5.2 核对，
 * 回调只需对 owner 可派发性负责（也可额外收紧；本模块取「两者都通过」）。
 */
export type AcceptanceTriageExecutabilityCheck = (
  item: AcceptanceTriageItem,
  index: number,
) => AcceptanceTriageItemExecutability | boolean;

/** 默认建议（`disposition` + 依据 + 计数 + 可审计 reasons）。 */
export interface AcceptanceTriageRecommendation {
  disposition: AcceptanceTriageDisposition;
  /** 确定性规则原因（R1–R7 / 结构不足 / 无法核对）；供记录、卡面摘要与审计。 */
  reasons: string[];
  /** blocker + major 项数。 */
  blockingCount: number;
  /** minor + nit 项数。 */
  minorCount: number;
  severityCounts: Record<AcceptanceTriageSeverity, number>;
  /** 建议是否可被应用自动采信（false ⇒ 只能作为客户卡上的参考文本，不得自动执行，§5.4）。 */
  authoritative: boolean;
  /** 建议依据码（记录 `recommendationBasis`）。 */
  basis: AcceptanceTriageRecommendationBasis;
  /** 是否必须由客户在分诊卡上作答（无法核对可执行性时 true）。 */
  requiresCustomerDecision: boolean;
}

export interface AcceptanceTriageRecommendOptions {
  /**
   * 可执行性检查（桌面用项目 listing + 内置治理角色实现）。缺省 ⇒ 视为「无法核对」（advisory）。
   * 只会对 blocker/major 项调用（R3 仅汇报不依赖可执行性）。
   */
  checkExecutability?: AcceptanceTriageExecutabilityCheck;
}

/** blocker/major 是否算「阻断」（R2/R4/R6 用）。 */
export function isBlockingAcceptanceTriageSeverity(severity: AcceptanceTriageSeverity): boolean {
  return severity === "blocker" || severity === "major";
}

/**
 * 改进方案指针是否齐全（§5.2）：`targets` 或 `criteria` 至少一个非空。
 * 只有 `evidence` 不算改进方案指针（证据不是改进计划）。
 */
export function acceptanceTriageItemHasReworkPointers(item: AcceptanceTriageItem): boolean {
  return item.targets.length > 0 || (item.criteria !== null && item.criteria.trim() !== "");
}

function normalizeExecutability(
  value: AcceptanceTriageItemExecutability | boolean | undefined,
): AcceptanceTriageItemExecutability {
  if (value === undefined) return { status: "unavailable", reasons: ["未提供可执行性检查（listing 不可用）"] };
  if (typeof value === "boolean") {
    return {
      status: value ? "executable" : "not-executable",
      reasons: value ? [] : ["可执行性检查判定不可执行"],
    };
  }
  const reasons = Array.isArray(value.reasons)
    ? value.reasons.filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "")
    : [];
  if (value.status !== "executable" && value.status !== "not-executable" && value.status !== "unavailable") {
    // 回调返回未知状态：绝不当作「可执行」，按无法核对处理（fail-closed，§5.4）。
    return { status: "unavailable", reasons: [...reasons, "可执行性检查返回未知状态"] };
  }
  return { status: value.status, reasons };
}

/**
 * §5.1 R1–R7 默认建议（纯确定性；设计 §5）。
 *
 * 输入只有**结构**（conclusion / severity / 指针）与可执行性回调：
 *   · R1：`pass` ⇒ `no-triage`（走既有验收卡路径，不分诊）；
 *   · R2：`fail/conditional` 且 blocker/major **全部可执行** ⇒ `rework`；
 *   · R3：`fail/conditional` 且只有 minor/nit ⇒ `report-only`（吹毛求疵不返工）；
 *   · R4：存在 blocker/major 但任一项不可执行（owner 不可派发 / action 空 / 无 targets+criteria）
 *         ⇒ `return-to-verifier`（结构不足，退回 Proof 补报告）；
 *   · R5：矛盾/结构非法（pass 带 blocker/major、fail/conditional 空 items）⇒ `return-to-verifier`；
 *   · R6：存在可执行的 blocker/major ⇒ 不得判 pass / 不得建议仅汇报；
 *   · R7：只有 minor/nit ⇒ 不得建议返工。
 * **文风/篇幅/语气不参与判定**（本函数根本读不到这些信号）——R6/R7 由结构钉死。
 *
 * 无法核对可执行性（回调缺省 / 返回 `unavailable` / 抛错）⇒ 不做权威建议：
 * `authoritative:false` + `requiresCustomerDecision:true`（§5.4：弹客户卡）。
 */
export function recommendAcceptanceTriage(
  triage: AcceptanceTriageSection,
  options: AcceptanceTriageRecommendOptions = {},
): AcceptanceTriageRecommendation {
  const severityCounts: Record<AcceptanceTriageSeverity, number> = {
    blocker: 0,
    major: 0,
    minor: 0,
    nit: 0,
  };
  for (const item of triage.items) severityCounts[item.severity] += 1;
  const blockingCount = severityCounts.blocker + severityCounts.major;
  const minorCount = severityCounts.minor + severityCounts.nit;
  const base = { blockingCount, minorCount, severityCounts };

  // R5（防御性）：直接调用方可能传入未经过解析器的结构。
  if (triage.conclusion === "pass" && blockingCount > 0) {
    return {
      ...base,
      disposition: "return-to-verifier",
      reasons: [
        `R5: conclusion=pass 却包含 ${blockingCount} 个 blocker/major（矛盾）⇒ 结构非法，退回 Proof 补报告。`,
      ],
      authoritative: true,
      basis: "invalid-structure",
      requiresCustomerDecision: false,
    };
  }
  if (triage.conclusion !== "pass" && triage.items.length === 0) {
    return {
      ...base,
      disposition: "return-to-verifier",
      reasons: [`R5: conclusion=${triage.conclusion} 却没有任何分诊项（矛盾）⇒ 结构非法，退回 Proof 补报告。`],
      authoritative: true,
      basis: "invalid-structure",
      requiresCustomerDecision: false,
    };
  }

  // R1：通过报告不分诊。
  if (triage.conclusion === "pass") {
    return {
      ...base,
      disposition: "no-triage",
      reasons: [
        `R1: conclusion=pass（${triage.items.length} 个非阻断备注项）⇒ 不分诊，走既有验收卡路径（判断/客户手批）。`,
      ],
      authoritative: true,
      basis: "pass",
      requiresCustomerDecision: false,
    };
  }

  // R3/R7：只有 minor/nit ⇒ 仅汇报，不返工（不依赖 owner 可执行性）。
  if (blockingCount === 0) {
    return {
      ...base,
      disposition: "report-only",
      reasons: [
        `R3: conclusion=${triage.conclusion}，无 blocker/major，仅 ${minorCount} 个 minor/nit ⇒ 建议仅汇报不返工（吹毛求疵不返工）。`,
        "R7: 文风/篇幅/措辞不参与判定——仅 minor/nit 时不得建议返工。",
      ],
      authoritative: true,
      basis: "minor-only",
      requiresCustomerDecision: false,
    };
  }

  // R2/R4：逐项核对 blocker/major 的可执行性。
  const blockingItems: Array<{ item: AcceptanceTriageItem; index: number }> = [];
  triage.items.forEach((item, index) => {
    if (isBlockingAcceptanceTriageSeverity(item.severity)) blockingItems.push({ item, index });
  });

  const notExecutableDetails: string[] = [];
  let unavailableReason: string | undefined;

  for (const { item, index } of blockingItems) {
    const problems: string[] = [];
    if (item.action.trim() === "") problems.push("action 为空");
    if (!acceptanceTriageItemHasReworkPointers(item)) {
      problems.push("缺少 targets/criteria 指针（evidence 不算改进方案指针）");
    }
    if (problems.length > 0) {
      notExecutableDetails.push(`${item.id}（${problems.join("；")}）`);
      continue;
    }
    let verdict: AcceptanceTriageItemExecutability;
    try {
      verdict = normalizeExecutability(options.checkExecutability?.(item, index));
    } catch (err) {
      verdict = {
        status: "unavailable",
        reasons: [`可执行性检查失败：${err instanceof Error ? err.message : String(err)}`],
      };
    }
    if (verdict.status === "not-executable") {
      const reasonText = verdict.reasons !== undefined && verdict.reasons.length > 0
        ? verdict.reasons.join("；")
        : "不可执行";
      notExecutableDetails.push(`${item.id}（${reasonText}）`);
    } else if (verdict.status === "unavailable" && unavailableReason === undefined) {
      unavailableReason =
        verdict.reasons !== undefined && verdict.reasons.length > 0
          ? verdict.reasons.join("；")
          : "listing/账本不可用";
    }
  }

  // R4 优先于「无法核对」：已经确认不可执行 ⇒ 结构不足、退回补报告。
  if (notExecutableDetails.length > 0) {
    return {
      ...base,
      disposition: "return-to-verifier",
      reasons: [
        `R4: 存在 ${blockingCount} 个 blocker/major，其中 ${notExecutableDetails.length} 项改进方案不可执行：` +
          `${notExecutableDetails.join("、")} ⇒ 结构不足，退回 Proof 补报告（不做自动建议）。`,
      ],
      authoritative: true,
      basis: "blocker-major-infeasible",
      requiresCustomerDecision: false,
    };
  }

  // §5.4：无法核对 owner 可执行性 ⇒ 不做权威建议；给参考建议，必须由客户决定。
  if (unavailableReason !== undefined) {
    return {
      ...base,
      disposition: "rework",
      reasons: [
        `R2?/R4?: 存在 ${blockingCount} 个 blocker/major，但无法核对改进方案可执行性（${unavailableReason}）；` +
          "不做权威自动建议，转客户决策卡（参考建议：下发运营修改）。",
      ],
      authoritative: false,
      basis: "feasibility-unavailable",
      requiresCustomerDecision: true,
    };
  }

  // R2/R6：全部可执行 ⇒ 返工。
  return {
    ...base,
    disposition: "rework",
    reasons: [
      `R2: conclusion=${triage.conclusion}，存在 ${blockingCount} 个 blocker/major 且改进方案可执行` +
        "（owner 可派发、action 与 targets/criteria 齐全）⇒ 建议下发运营修改。",
      "R6: 文风/篇幅/措辞不参与判定——存在可执行的 blocker/major 时不得判 pass、不得建议仅汇报。",
    ],
    authoritative: true,
    basis: "blocker-major-feasible",
    requiresCustomerDecision: false,
  };
}

// —————————————————————— triage → acceptance-rework/v1 映射（§8.1.2） ——————————————————————

/**
 * 返工任务项：`acceptance-rework/v1` 核心四字段（id/owner/action/evidence）原样，另带分诊上下文
 * （severity/reason/criteria/targets），供返工任务文本标注阻断/非阻断与改进方案指针。
 * 仍可直接当作 `AcceptanceReworkItem` 消费（结构超集）。
 */
export interface AcceptanceTriageReworkItem extends AcceptanceReworkItem {
  severity: AcceptanceTriageSeverity;
  reason: string;
  /** 验收标准指针（原样保留；不属于 rework v1 核心四字段）。 */
  criteria: string | null;
  /** 原 triage targets（已并入 evidence；保留原件给任务展示）。 */
  targets: string[];
  /** blocker/major = true（minor/nit 在返工任务里标注「非阻断，可选后续」）。 */
  blocking: boolean;
}

/**
 * 把 triage items 映射为既有 `acceptance-rework/v1` 任务项（设计 §8.1.2）：
 *   · `id` / `owner` / `action` 原样；
 *   · `evidence` = `evidence` ∪ `targets`（按出现顺序去重）；
 *   · `severity` / `reason` / `criteria` / `targets` 作为附加上下文保留。
 * 纯函数：不修改入参。
 */
export function acceptanceTriageToReworkItems(
  triage: AcceptanceTriageSection,
): AcceptanceTriageReworkItem[] {
  return triage.items.map((item) => {
    const evidence: string[] = [];
    const seen = new Set<string>();
    for (const pointer of [...item.evidence, ...item.targets]) {
      if (seen.has(pointer)) continue;
      seen.add(pointer);
      evidence.push(pointer);
    }
    return {
      id: item.id,
      owner: item.owner,
      action: item.action,
      evidence,
      severity: item.severity,
      reason: item.reason,
      criteria: item.criteria,
      targets: [...item.targets],
      blocking: isBlockingAcceptanceTriageSeverity(item.severity),
    };
  });
}
