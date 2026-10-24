// src/common/编排/acceptance-rework.ts
// **验收报告结构化返工段（2026-10-23 客户闸门 1 方案 v1 / Q2 A）**。
//
// 背景：验收报告（`docs/acceptance/<flowId>-report-vN.md`）的 §8 偏差表 / §9.1 编号列表是**人读自由
// 文本**，应用不做表格/编号/括号解析（脆弱且跨 owner）；返工路由需要机器可读的逐项清单。
//
// 本模块只做**纯确定性解析**：在报告 Markdown 中扫描 fenced code block（``` / ~~~），找到**恰好一个**
// `schema: acceptance-rework/v1` 的 YAML 段并严格校验；不读文件系统、不调用模型、不做 IO。
//
// 段形状（方案 §5.2.1）：
//   ```yaml
//   schema: acceptance-rework/v1
//   coordinator: convener            # 可选；缺省 convener；接受别名 steward；其他值 warning。
//                                    # 2026-10-24：本字段只是「报告建议」，实际接收方由应用按治理模型
//                                    # 决定（trio → Lead / 主理；single/su 保持原接收方），不由报告指定。
//   items:
//     - id: F1                       # 必填、唯一；^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$
//       owner: platform-foundation   # 必填；恰好一个角色 id（形状校验；存在性由桌面路由层校验）
//       action: ...                  # 必填、≤2000 字符
//       evidence: docs/x.log         # 可选；字符串或字符串数组；每条非空、≤500、最多 10 条
//   ```
//
// 失败口径（fail-closed，整段不采信）：
//   · 无候选块 ⇒ `missing`（不解析自由文本、不猜 F-item）；
//   · 坏 YAML / 未知字段 / 重复 id / 空/多 owner / 空 action / items 空 / 超限 / 多个候选块 ⇒ `invalid`；
//   · `schema: acceptance-rework/<其他版本>` ⇒ `unsupported`（不按 v1 猜）。
//
// 分层：编排私有 common；桌面经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费。

import { parse as parseYaml } from "yaml";

// —————————————————————— 常量与形状 ——————————————————————

/** 结构化返工段的唯一受支持 schema（报告必须逐字写）。 */
export const ACCEPTANCE_REWORK_SCHEMA = "acceptance-rework/v1" as const;

/** 单份报告返工项上限（方案 §5.2.1 Q2 A）。 */
export const ACCEPTANCE_REWORK_MAX_ITEMS = 64;

/** 单个候选段的内容上限（UTF-8 字节；方案 §5.2.1）。 */
export const ACCEPTANCE_REWORK_MAX_BLOCK_BYTES = 32 * 1024;

/** `items[].id` 形状（方案 §5.2.1；跨 owner 的发现拆成多个 id，如 F6a/F6b）。 */
export const ACCEPTANCE_REWORK_ITEM_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$";

/** `items[].action` 最大字符数。 */
export const ACCEPTANCE_REWORK_MAX_ACTION_LENGTH = 2000;

/** `items[].evidence` 最多条数。 */
export const ACCEPTANCE_REWORK_MAX_EVIDENCE_ITEMS = 10;

/** `items[].evidence` 单条最大字符数。 */
export const ACCEPTANCE_REWORK_MAX_EVIDENCE_LENGTH = 500;

/** `items[].owner` 最大字符数（形状校验；单 owner 语义见 `OWNER_TOKEN_RE`）。 */
export const ACCEPTANCE_REWORK_MAX_OWNER_LENGTH = 64;

const ITEM_ID_RE = new RegExp(ACCEPTANCE_REWORK_ITEM_ID_PATTERN);

/**
 * owner **形状**：恰好一个角色 id token——不含空白、路径分隔符、列表/连接符。
 * 只做形状判定（`a + b` / `客户/Proof` / `a,b` / `a、b` 一律拒绝）；owner 是否存在/可派发
 * 由桌面路由层用项目 listing + 内置治理角色校验（本模块不读项目、不猜）。
 */
const OWNER_TOKEN_RE = /^[^\s+/\\,、&，；;]+$/u;

/** 解析错误（`path` 为段内 YAML 路径，如 `items[3].owner`；`$` 表示段根）。 */
export interface AcceptanceReworkError {
  path: string;
  message: string;
}

/** 单个返工项（已规范化：字符串 trim；`evidence` 统一为数组，缺省为空数组）。 */
export interface AcceptanceReworkItem {
  id: string;
  owner: string;
  action: string;
  evidence: string[];
}

/** 通过校验的返工段。 */
export interface AcceptanceReworkSection {
  schema: typeof ACCEPTANCE_REWORK_SCHEMA;
  /**
   * 报告建议的协调者（**兼容值，固定 `convener`**）。2026-10-24 起：实际接收方由应用按治理模型决定
   * （trio → Lead / 主理；single/su 保持原接收方），报告不能指定实际接收方；schema/字段不变。
   */
  coordinator: "convener";
  /** 报告里 `coordinator` 的原始值（缺省/null 表示未写）；仅作审计/提示。 */
  coordinatorDeclaration: string | null;
  items: AcceptanceReworkItem[];
}

/**
 * 解析结果（纯值对象）：
 *   · `ok:true` ⇒ `section` 可直接用于路由任务；`warnings` 是可展示的提示（如未知 coordinator）；
 *   · `ok:false` ⇒ `reason` + 逐条 `errors`（带具体 path）；调用方不得部分采信。
 */
export type AcceptanceReworkParseResult =
  | { ok: true; section: AcceptanceReworkSection; warnings: string[] }
  | { ok: false; reason: "missing" | "invalid" | "unsupported"; errors: AcceptanceReworkError[] };

// —————————————————————— 基础 ——————————————————————

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function failure(
  reason: "missing" | "invalid" | "unsupported",
  errors: AcceptanceReworkError[],
): AcceptanceReworkParseResult {
  return { ok: false, reason, errors };
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
  /**
   * 候选块的 YAML 解析结果：坏 YAML 的候选必须判 `invalid`（不是被当普通代码块忽略）。
   * `document` 仅在解析成功时给出；解析失败时 `parseError` 记录原因。
   */
  document?: unknown;
  parseError?: string;
}

/**
 * 扫描 Markdown fenced code block（CommonMark 子集）：
 *   · 开头 ≤3 空格 + ≥3 个反引号或波浪号；反引号 fence 的 info string 不得含反引号；
 *   · 结尾同字符、长度不短于开头、仅允许空白；未闭合 fence 按「到 EOF」处理；
 *   · 开头 fence 缩进 N 空格时，内容行去掉至多 N 个前导空格（CommonMark 折叠）。
 * 缩进代码块（4 空格）不是 fenced block，不扫描。
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
 * 词法提示：块内**顶格** `schema:` 行的值是否提及 `acceptance-rework`。
 * 用于在 YAML 解析前识别候选块（坏 YAML 的候选块也要能判 `invalid`，而不是被当普通代码块忽略）；
 * 真正的 schema 校验仍以 YAML 解析结果为准。`#` 注释与成对引号按 YAML 词法剥离。
 */
function blockMentionsAcceptanceReworkSchema(content: string): boolean {
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
    if (raw.includes("acceptance-rework")) return true;
  }
  return false;
}

// —————————————————————— 解析器 ——————————————————————

/**
 * 解析验收报告 Markdown 中的 `acceptance-rework/v1` 段。
 *
 * 纯函数：只依赖入参字符串与 `yaml` 解析器；不读文件系统、不做网络/模型调用、不写任何状态。
 *
 * @param markdown 验收报告全文（Markdown）
 */
export function parseAcceptanceReworkReport(markdown: string): AcceptanceReworkParseResult {
  if (typeof markdown !== "string") {
    return failure("invalid", [{ path: "$", message: "报告内容必须是字符串" }]);
  }

  const withoutComments = stripHtmlComments(markdown);
  const blocks = scanFencedBlocks(withoutComments);
  const candidates: CandidateBlock[] = [];
  for (const block of blocks) {
    const lexical = blockMentionsAcceptanceReworkSchema(block.content);
    let document: unknown;
    let parseError: string | undefined;
    try {
      document = parseYaml(block.content, { uniqueKeys: true, maxAliasCount: 100 });
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    // 候选：顶格 `schema:` 行提及 acceptance-rework（坏 YAML 也能识别），或 flow 风格根映射的
    // `schema` 字段提及 acceptance-rework。其他代码块（含非 acceptance-rework 的 YAML）一律忽略。
    const rootSchema =
      isPlainObject(document) && typeof document.schema === "string" ? document.schema : undefined;
    const candidate = lexical || (rootSchema !== undefined && rootSchema.includes("acceptance-rework"));
    if (candidate) candidates.push({ content: block.content, document, parseError });
  }

  if (candidates.length === 0) {
    return failure("missing", [
      {
        path: "$",
        message:
          "报告没有 acceptance-rework 段：要求恰好一个 fenced YAML 块，schema: acceptance-rework/v1" +
          "（本应用不解析 §8 表格 / §9.1 编号列表等自由文本）。",
      },
    ]);
  }
  if (candidates.length > 1) {
    return failure("invalid", [
      {
        path: "$",
        message: `报告包含多个 acceptance-rework 段（共 ${candidates.length} 个）；至多允许一个。`,
      },
    ]);
  }

  const block = candidates[0]!;
  if (byteLength(block.content) > ACCEPTANCE_REWORK_MAX_BLOCK_BYTES) {
    return failure("invalid", [
      {
        path: "$",
        message: `acceptance-rework 段过大（${byteLength(block.content)} 字节；上限 ${ACCEPTANCE_REWORK_MAX_BLOCK_BYTES} 字节）。`,
      },
    ]);
  }
  if (block.parseError !== undefined) {
    return failure("invalid", [{ path: "$", message: `YAML 语法错误：${block.parseError}` }]);
  }
  const document = block.document;
  if (!isPlainObject(document)) {
    return failure("invalid", [{ path: "$", message: "acceptance-rework 段的根节点必须是对象" }]);
  }

  // —— 顶层字段（未知字段 fail-closed；与 flow YAML 的严格口径一致） ——
  const errors: AcceptanceReworkError[] = [];
  const warnings: string[] = [];
  const topLevelKeys = new Set(["schema", "coordinator", "items"]);
  for (const key of Object.keys(document)) {
    if (!topLevelKeys.has(key)) {
      errors.push({ path: key, message: `未知字段 ${key}；只允许 schema / coordinator / items` });
    }
  }

  // —— schema（版本不支持 ⇒ unsupported，不按 v1 猜） ——
  const rawSchema = document.schema;
  if (rawSchema !== ACCEPTANCE_REWORK_SCHEMA) {
    if (typeof rawSchema === "string" && rawSchema.trim().startsWith("acceptance-rework")) {
      return failure("unsupported", [
        {
          path: "schema",
          message: `不支持的 schema：${JSON.stringify(rawSchema)}；只支持 ${ACCEPTANCE_REWORK_SCHEMA}。`,
        },
      ]);
    }
    errors.push({
      path: "schema",
      message: `schema 必须是 ${ACCEPTANCE_REWORK_SCHEMA}（当前 ${JSON.stringify(rawSchema)}）`,
    });
  }

  // —— coordinator（可选；缺省 convener；别名 steward；其他值 warning，仍路由 Convener） ——
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

  // —— items（非空数组；≤64） ——
  const items: AcceptanceReworkItem[] = [];
  const rawItems = document.items;
  if (!Array.isArray(rawItems)) {
    errors.push({ path: "items", message: "items 必须是数组" });
  } else if (rawItems.length === 0) {
    errors.push({ path: "items", message: "items 不能为空（非通过报告必须列出至少一个返工项）" });
  } else if (rawItems.length > ACCEPTANCE_REWORK_MAX_ITEMS) {
    errors.push({
      path: "items",
      message: `items 最多 ${ACCEPTANCE_REWORK_MAX_ITEMS} 项（当前 ${rawItems.length} 项）`,
    });
  } else {
    const seenIds = new Set<string>();
    rawItems.forEach((rawItem, index) => {
      const base = `items[${index}]`;
      if (!isPlainObject(rawItem)) {
        errors.push({ path: base, message: "返工项必须是对象 { id, owner, action, evidence? }" });
        return;
      }
      const itemKeys = new Set(["id", "owner", "action", "evidence"]);
      for (const key of Object.keys(rawItem)) {
        if (!itemKeys.has(key)) {
          errors.push({ path: `${base}.${key}`, message: `未知字段 ${key}；返工项只允许 id / owner / action / evidence` });
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
          message: `id 非法：${JSON.stringify(rawId)}；要求 ${ACCEPTANCE_REWORK_ITEM_ID_PATTERN}`,
        });
      } else if (seenIds.has(rawId)) {
        errors.push({ path: `${base}.id`, message: `id 重复：${JSON.stringify(rawId)}（跨 owner 的发现必须拆成不同 id）` });
      } else {
        seenIds.add(rawId);
        id = rawId;
      }

      // owner：恰好一个角色 id（只做形状校验；存在性/可派发由桌面校验）。
      let owner: string | undefined;
      if (typeof rawItem.owner !== "string" || rawItem.owner.trim() === "") {
        errors.push({ path: `${base}.owner`, message: "缺少必填字段 owner（单个角色 id 字符串）" });
      } else if (rawItem.owner.length > ACCEPTANCE_REWORK_MAX_OWNER_LENGTH) {
        errors.push({
          path: `${base}.owner`,
          message: `owner 过长（${rawItem.owner.length} 字符；最多 ${ACCEPTANCE_REWORK_MAX_OWNER_LENGTH}）`,
        });
      } else if (!OWNER_TOKEN_RE.test(rawItem.owner)) {
        errors.push({
          path: `${base}.owner`,
          message: `owner 必须恰好一个角色 id（不得写多 owner/路径/空白：${JSON.stringify(rawItem.owner)}）`,
        });
      } else {
        owner = rawItem.owner;
      }

      // action：必填、≤2000 字符（trim 后保存）。
      let action: string | undefined;
      if (typeof rawItem.action !== "string" || rawItem.action.trim() === "") {
        errors.push({ path: `${base}.action`, message: "缺少必填字段 action（非空字符串）" });
      } else {
        const trimmed = rawItem.action.trim();
        if (trimmed.length > ACCEPTANCE_REWORK_MAX_ACTION_LENGTH) {
          errors.push({
            path: `${base}.action`,
            message: `action 过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_REWORK_MAX_ACTION_LENGTH}）`,
          });
        } else {
          action = trimmed;
        }
      }

      // evidence：可选；字符串或字符串数组；每条非空、≤500、最多 10 条。
      let evidence: string[] | undefined;
      if (rawItem.evidence !== undefined) {
        const rawEvidence = rawItem.evidence;
        const rawList = typeof rawEvidence === "string" ? [rawEvidence] : rawEvidence;
        if (!Array.isArray(rawList)) {
          errors.push({ path: `${base}.evidence`, message: "evidence 必须是字符串或字符串数组" });
        } else if (rawList.length > ACCEPTANCE_REWORK_MAX_EVIDENCE_ITEMS) {
          errors.push({
            path: `${base}.evidence`,
            message: `evidence 最多 ${ACCEPTANCE_REWORK_MAX_EVIDENCE_ITEMS} 条（当前 ${rawList.length} 条）`,
          });
        } else {
          const values: string[] = [];
          let evidenceOk = true;
          rawList.forEach((entry, entryIndex) => {
            const path = typeof rawEvidence === "string" ? `${base}.evidence` : `${base}.evidence[${entryIndex}]`;
            if (typeof entry !== "string" || entry.trim() === "") {
              errors.push({ path, message: "evidence 每条必须是非空字符串" });
              evidenceOk = false;
              return;
            }
            const trimmed = entry.trim();
            if (trimmed.length > ACCEPTANCE_REWORK_MAX_EVIDENCE_LENGTH) {
              errors.push({
                path,
                message: `evidence 单条过长（${trimmed.length} 字符；最多 ${ACCEPTANCE_REWORK_MAX_EVIDENCE_LENGTH}）`,
              });
              evidenceOk = false;
              return;
            }
            values.push(trimmed);
          });
          if (evidenceOk) evidence = values;
        }
      }

      if (id !== undefined && owner !== undefined && action !== undefined) {
        items.push({ id, owner, action, evidence: evidence ?? [] });
      }
    });
  }

  if (errors.length > 0) return failure("invalid", errors);

  return {
    ok: true,
    section: {
      schema: ACCEPTANCE_REWORK_SCHEMA,
      coordinator: "convener",
      coordinatorDeclaration,
      items,
    },
    warnings,
  };
}
