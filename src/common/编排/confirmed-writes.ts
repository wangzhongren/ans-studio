// src/common/编排/confirmed-writes.ts
// **A-3「同意才落盘」的 writeSet 发行**（设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md`
// §三 A-3；编排私有辅助）。
//
// ── 机制（不造票据）──────────────────────────────────────────────────────────────
// 票据机制已废（可由公开输入重算的 token 只是装饰，§7.1 第 3 条）。本模块的做法是**真状态**：
//   1. 客户在预览卡上确认（`request_confirmation` 返回 `answered/confirmed:true`）；
//   2. 编排从**呈现给客户的内容**（title/preview/detail）中提取「路径样 token」；
//   3. 每个候选用**同一个** `resolveWrite` 探测（等价于「把它加进 writeSet 后能否放行」）——
//      不在会话边界内、跨根/逃逸、条件目录未声明的一律**跳过**（fail-closed，宁少勿多）；
//   4. 通过的路径**发行进本次会话的 writeSet**（由 `run-role.ts` 的 gate 以 F4 求值）。
// 会话 writeSet 由编排侧内存持有——**模型无法重算或伪造**；未发行的路径被 F4 拒（「拒掉一切未确认路径」）。
//
// ── 已知残余漏洞：内容漂移（如实登记，客户明确不采纳 O-A1）────────────────────────────
// 本方案保证「**路径**已预览且已确认」（发行集合 = 从预览内容里提取到的路径），
// **关不住**「预览的是 A 内容、写出的却是 B 内容」——O-A1（确认时存 (path,content)、写时比对哈希）
// 经客户 2026-10-12 裁定**不采纳**。因此：「预览即所写」只在路径层面成立；内容层面仍依赖
// 模型遵守工具指引（`request_confirmation` 的 description/promptGuidelines 写死「写入须与预览一致」）。
// 另注：路径提取是**尽力而为**（保守正则）——预览里没写出具体路径 ⇒ 不发行 ⇒ 后续写入被 F4 拒
// （fail-closed，不越界，但会打断流程）；故 A-2 的指引文案宜要求 su 在 preview 中列出将写出的路径。
//
// ── 呈现前完整性闸（2026-10-19 真机修复）────────────────────────────────────────────
// 真机 op-2：一张写盘确认卡在 paths 里声明了两条新建路径，但 preview 只含第一条的正文；判断 agent
// 依 rubric「新文件必须用 preview 核对正文/结构」回落 manual（安全上 fail-closed 正确，但把
// 「证据完整性」留给了模型自觉）。本模块增加**确定性**校验：声明了写入路径的确认卡，preview 必须
// 对**每一条**路径给出可核对的正文字节；否则编排在呈现前就拒绝（不发卡、不发行、不自动补写）。
// 判定口径（确定性、可测试，不依赖自然语言理解）：
//   · 路径须以「锚点行」出现：Markdown 标题（含路径）、代码围栏说明（含路径）、或既有
//     「一行一个路径」的声明行（`declaredWritePathOfLine`）；
//   · 锚点之后、下一个声明路径锚点之前，须至少有一行非空且非纯装饰/非纯路径重复的正文行。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type {
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
} from "../../model/runtime.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
// 跨角色共享路径原语（**单一来源** = pm 属主 `src/common/shared/path-primitives.ts`；不从门禁引擎私有 common 导入）。
import { isAbsoluteAny, normalizeLexical } from "../shared/path-primitives.ts";
import { declaredWritePathOfLine, declaredWritePathsFromPreview } from "./governance-judge-facts.ts";

/**
 * `request_confirmation` 的**显式声明写入路径**（2026-10-18 运行时核心新增 `paths?: string[]`）：
 * - 非空且含合法项 ⇒ 返回规范化路径（**优先于 preview 解析**）；
 * - **空数组视为未给** ⇒ `undefined`（调用方回退 preview 解析，旧行为）；
 * - 非空但全部非法 ⇒ `[]`（给过但无效 ⇒ 不发行任何路径，fail-closed，不回退散文猜）。
 */
export function explicitConfirmPaths(req: CustomerInputRequest): string[] | undefined {
  if (req.kind !== "confirm") return undefined;
  const raw = (req as { paths?: unknown }).paths;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "" || isAbsoluteAny(trimmed)) continue;
    const norm = normalizeLexical(trimmed);
    if (norm === "" || norm === "." || norm.startsWith("../")) continue;
    if (norm.split("/").some((segment) => segment === "" || segment === "..")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

// —————————————— 呈现前 preview 完整性校验（2026-10-19 真机 op-2） ——————————————

/** 一张写盘类确认卡的 preview 完整性校验结果。 */
export interface ConfirmPreviewCompleteness {
  /** true = 每条声明路径都有可核对正文；false = 缺正文（调用方必须拒绝呈现）。 */
  ok: boolean;
  /** 本次声明的写入路径（显式 `paths` 优先，否则 preview 声明；已归一化/去重）。 */
  declaredPaths: string[];
  /** 缺少可核对正文/结构的路径（`ok:false` 时非空）。 */
  missingPaths: string[];
}

/**
 * 声明写入路径的统一取法（与判断 agent 计算 `judgeContext.paths` 同口径）：
 * 显式 `req.paths` 优先（`explicitConfirmPaths` 的既有语义），未给时回退 preview 的
 * 「一行一个路径」声明。choice 卡没有写入路径 ⇒ `[]`。
 */
export function declaredConfirmPaths(req: CustomerInputRequest): string[] {
  if (req.kind !== "confirm") return [];
  const explicit = explicitConfirmPaths(req);
  if (explicit !== undefined) return explicit;
  return declaredWritePathsFromPreview(req.preview ?? "");
}

/** 代码围栏开启行：``` / ~~~ 后可带说明串（说明串里可写路径）。 */
const FENCE_OPEN_RE = /^(`{3,}|~{3,})(.*)$/;
/** Markdown 标题行。 */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** 去掉行内 markdown 标记（标题/围栏说明里的路径常被反引号或粗体包裹）。 */
function stripInlineMarkup(text: string): string {
  return text.replace(/[`*_~]/g, "");
}

/** 围栏闭合判定：同字符且长度不短于开启标记。 */
function isFenceClose(line: string, opener: string): boolean {
  if (line.length < opener.length) return false;
  const ch = opener[0]!;
  return [...line].every((c) => c === ch);
}

/** 纯装饰/分隔行（不算正文：`---`、表格分隔、围栏行等）。 */
function isDecorationLine(line: string): boolean {
  return /^[-*_=~`#>|:.\s]+$/.test(line);
}

/**
 * 计算每条声明路径的**锚点行号**（0 起）。锚点 = 标题含路径 / 代码围栏说明含路径 /
 * 既有「一行一个路径」声明行。围栏内部不识别锚点（代码正文里的路径行不算声明）。
 */
function anchorLinesOf(preview: string, declared: readonly string[]): Map<string, number[]> {
  const lines = preview.replace(/\r\n/g, "\n").split("\n");
  const anchors = new Map<string, number[]>(declared.map((path) => [path, []]));
  let fence: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]!;
    const line = rawLine.trim();
    if (fence !== undefined) {
      if (isFenceClose(line, fence)) fence = undefined;
      continue;
    }
    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen !== null) {
      fence = fenceOpen[1]!;
      const info = stripInlineMarkup(fenceOpen[2] ?? "");
      if (info !== "") {
        for (const path of declared) {
          if (info.includes(path)) anchors.get(path)!.push(index);
        }
      }
      continue;
    }
    const heading = HEADING_RE.exec(line.replace(/^>\s?/, ""));
    if (heading !== null) {
      const text = stripInlineMarkup(heading[2]!);
      for (const path of declared) {
        if (text.includes(path)) anchors.get(path)!.push(index);
      }
      continue;
    }
    const declaredPath = declaredWritePathOfLine(rawLine);
    if (declaredPath !== undefined && anchors.has(declaredPath)) {
      anchors.get(declaredPath)!.push(index);
    }
  }
  return anchors;
}

/** 区间 [start, end) 内是否存在正文行（排除空行/装饰行/仅重复路径的声明行）。 */
function hasSubstantiveBodyLine(lines: readonly string[], start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    const line = lines[index]!.trim();
    if (line === "" || isDecorationLine(line)) continue;
    if (declaredWritePathOfLine(lines[index]!) !== undefined) continue; // 只是路径名，不是正文
    return true;
  }
  return false;
}

/** 单条声明路径的可核对正文（`declaredPathBodies` 输出项）。 */
export interface DeclaredPathBody {
  /** 已归一化的项目相对路径。 */
  path: string;
  /** 锚点之后到下一个声明路径锚点（或 preview 末尾）之间的正文（保留内部空行，去掉首尾空行）。 */
  body: string;
  /** 区间内是否至少有一行非空正文/代码行（与呈现前完整性闸同一口径）。 */
  hasBody: boolean;
}

/**
 * **逐路径正文提取**（2026-10-19 证据包）：与 `validateConfirmPreviewCompleteness` 共用同一份
 * 锚点/正文判定，返回每条声明路径关联的正文。多条锚点时优先取**第一条有正文**的锚点区间；
 * 都没有正文时返回第一条锚点区间（body 可能为空）——调用方据此 fail-closed。
 */
export function declaredPathBodies(preview: string | undefined, declaredPaths: readonly string[]): DeclaredPathBody[] {
  const text = typeof preview === "string" ? preview : "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const anchors = anchorLinesOf(text, declaredPaths);
  const anchorAt = new Set<number>();
  for (const list of anchors.values()) for (const index of list) anchorAt.add(index);
  return declaredPaths.map((path) => {
    const own = anchors.get(path) ?? [];
    let first: { body: string; hasBody: boolean } | undefined;
    for (const start of own) {
      let end = lines.length;
      for (let index = start + 1; index < lines.length; index += 1) {
        if (anchorAt.has(index)) {
          end = index;
          break;
        }
      }
      const hasBody = hasSubstantiveBodyLine(lines, start + 1, end);
      const body = lines.slice(start + 1, end).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
      first ??= { body, hasBody };
      if (hasBody) return { path, body, hasBody: true };
    }
    return { path, body: first?.body ?? "", hasBody: first?.hasBody ?? false };
  });
}

/**
 * **写盘类确认卡的呈现前完整性校验**（2026-10-19 真机 op-2，fail-closed）：
 * 声明了 ≥1 条写入路径时，preview 必须对**每一条**路径给出可核对的正文字节——
 * 路径作为标题/围栏说明/声明行出现，且其后（到下一个声明路径锚点或 preview 末尾）存在
 * 至少一行非空正文/代码行。未声明任何路径的确认卡与 choice 卡 ⇒ `ok:true`（旧行为不变）。
 */
export function validateConfirmPreviewCompleteness(req: CustomerInputRequest): ConfirmPreviewCompleteness {
  const declaredPaths = declaredConfirmPaths(req);
  if (req.kind !== "confirm" || declaredPaths.length === 0) {
    return { ok: true, declaredPaths, missingPaths: [] };
  }
  const preview = typeof req.preview === "string" ? req.preview : "";
  // 与证据包共用同一份「逐路径正文」实现：判定口径只有一处。
  const bodies = declaredPathBodies(preview, declaredPaths);
  const missingPaths = bodies.filter((entry) => !entry.hasBody).map((entry) => entry.path);
  return { ok: missingPaths.length === 0, declaredPaths, missingPaths };
}

/**
 * 构造「确认 → 发行」器：包装在前端给的原始客户通道之外（`run-role.ts` 装配）。
 * 每次调用把**裁决结果如实返回**（不改答案），仅在「确认通过」（`confirm` 且 `confirmed:true`）时
 * **追加**合法路径进 `issued`。抛错/拒绝/不可用/choice 回答 → 不发行任何东西（fail-closed）。
 * 路径来源：显式 `req.paths` 优先；未给/空数组回退 preview 提取（旧行为）。
 * 【内容漂移】从呈现文本（title/preview/detail）提取路径 ⇒ 只保证「路径已预览且已确认」；
 * 「预览内容 ≠ 写出内容」关不住（O-A1 未采纳，见文件头）。
 */
export function createConfirmedWriteIssuer(opts: {
  /** 本次会话的授权边界（创世态 = 种子边界；否则 = 项目治理边界）。 */
  boundary: BoundarySection1;
  /** 本会话条件目录的 slug 集合（与 gate 的 scope.conditions 同一份，探测时激活同样条目）。 */
  conditions: string[];
  /** resolveWrite 的上下文根。 */
  ctx: { skillRoot: string; projectRoot: string };
  /** 会话的活 writeSet（gate 以它做 F4；本器只增不改）。 */
  issued: Set<string>;
}): (req: CustomerInputRequest, out: CustomerInputOutcome | null | undefined, metadata?: CustomerInputMetadata) => string[] {
  const { boundary, conditions, ctx, issued } = opts;
  return (req, out, metadata) => {
    if (metadata?.signal?.aborted) return [];
    // 仅 confirm 且明确同意才算「确认」（choice 的回答不构成写盘同意）。
    if (req.kind !== "confirm") return [];
    if (out === null || out === undefined || out.outcome !== "answered" || out.value.confirmed !== true) {
      return [];
    }
    const text = [req.title, req.preview ?? "", req.detail ?? ""].join("\n");
    // 显式 paths 优先；空数组视为未给并回退 preview 解析（旧行为）。
    const explicit = explicitConfirmPaths(req);
    const candidates = explicit ?? extractPathCandidates(text);
    const added: string[] = [];
    for (const candidate of candidates) {
      if (issued.has(candidate)) continue;
      // 探测：把候选当作唯一的 writeSet 项与边界一起求值——只问「它在边界内吗」，
      // 与当前已发行集合无关（resolveWrite 的 scope 语义 = 精确 writeSet，见 resolve-write.ts）。
      const decision = resolveWrite(candidate, boundary, { writeSet: [candidate], conditions }, ctx);
      if (!decision.allowed) continue; // 不在边界内 → 不发行（fail-closed）
      if (metadata?.signal?.aborted) return added;
      issued.add(candidate);
      added.push(candidate);
    }
    return added;
  };
}

/**
 * 从**呈现给客户的文本**中提取「路径样 token」——保守正则，宁少勿多：
 * 以空白/引号/括号/中文标点等为分隔，取含 `/` 的 token；反引号与 markdown 强调符（`*`）被排除在
 * token 字符类之外；排除 URL 与绝对路径、`..`/目录式（尾部 `/`）token。
 * 提取结果**未经边界校验**——候选还须经 `createConfirmedWriteIssuer` 的 resolveWrite 探测。
 */
export function extractPathCandidates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // 分隔符集合：空白、引号、反引号、各类括号、中文标点、竖线、尖括号、星号（markdown 强调）。
  const TOKEN_RE = /[^\s`"'“”‘’（）()【】\[\]{}<>|*，。；、：！？]+/g;
  for (const m of text.matchAll(TOKEN_RE)) {
    let raw = m[0];
    if (!raw.includes("/")) continue;
    // 句尾可能粘上 ASCII 标点（role-card.md.）。去掉一次尾随标点再判。
    raw = raw.replace(/[.,;:!?]+$/, "");
    if (raw === "" || !raw.includes("/")) continue;
    if (raw.endsWith("/")) continue; // 目录式 token（须是具体文件——F4 是精确匹配，目录不发行）
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) continue; // URL（http://…）
    if (isAbsoluteAny(raw)) continue; // 绝对路径：预览不需要，也不发行（fail-closed）
    const norm = normalizeLexical(raw);
    if (norm === "" || norm === "." || norm.startsWith("../")) continue;
    if (norm.split("/").some((seg) => seg === "" || seg === "..")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/**
 * 会话条件目录 slug 集合（= 边界里所有带 slug 的 `conditional-directory`；缺 slug 的跳过，fail-closed）。
 * 与 `govern-session.ts::buildGovernScope` 同一口径——同一份边界的 conditions 只应有一个推导。
 */
export function conditionSlugsOf(boundary: BoundarySection1): string[] {
  return boundary.entries
    .filter((e) => e.kind === "conditional-directory" && typeof e.condition === "string")
    .map((e) => e.condition as string);
}
