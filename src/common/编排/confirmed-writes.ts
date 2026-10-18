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

import type { BoundarySection1 } from "../../model/boundary.ts";
import type {
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
} from "../../model/runtime.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
// 跨角色共享路径原语（**单一来源** = pm 属主 `src/common/shared/path-primitives.ts`；不从门禁引擎私有 common 导入）。
import { isAbsoluteAny, normalizeLexical } from "../shared/path-primitives.ts";

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
