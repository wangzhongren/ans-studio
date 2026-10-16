// Service：写入路径判定（本版心脏）
// 冻结契约 §3：resolveWrite(targetPath, boundary, scope, ctx): WriteDecision
// 覆盖：F6 未接受、F5 条件目录（固定 slug）、F4 任务收窄、跨根混淆、规范化、F7 符号链接逃逸、F10 按根分组。
// 判定顺序：F6 接受门 → 根归属与 F7 逃逸 → 匹配条目（含条件 slug）→ F4 writeSet 收窄（仅当给了 scope）。
//
// 关于 scope 可选（客户端裁决）：scope === undefined 表示 chat / standalone 这类"没有预先存在的任务"的
// 会话——任务是在对话里产生的，不该要求先声明范围。此时不做任务收窄，授权上界 = 角色边界本身。
// 这**不是放松校验**：角色边界就是这个角色长期工作的常设授权；writeSet 只是"正式计划(plan/task_ops)"
// 在常设授权之上再加的一层收窄，只在有计划时才有意义。缺 scope 不等于漏了 F4。
//
// 拒绝信息语义（F-5-main，kanban-live 真机：su 的治理笔记被 F4 硬拒、反馈不可操作）：allowedByRoot
// 必须如实回答「此刻到底什么可写」——非 F4 分支＝边界覆盖（无任务收窄时即授权上界）；F4 分支＝
// **当前已发行可写集**（writeSet 中仍在边界内且条件已激活的项，见 issuedByRootOf）——否则
// 「允许写入的路径」列表会与「不在任务 writeSet 内」的拒绝原因自相矛盾。F4 分支 reason 另追加
// 可操作指引（request_confirmation 的 preview + confirmed:true 发行路径）。**判定逻辑、放行/拒绝
// 结果零变化**（fail-closed 不放松：未发行路径仍拒、无自动发行、无自动弹卡）。

import type { BoundaryEntry, BoundarySection1, Root } from "../../model/boundary.ts";
import { isValidConditionSlug } from "../../model/boundary.ts";
import type { AllowedPathsByRoot, TaskScope, WriteDecision } from "../../model/decision.ts";
import {
  absRel,
  compareKey,
  isAbsoluteAny,
  isUnderOrEqual,
  normalizeLexical,
  realResolve,
} from "../../common/门禁引擎/paths.ts";
import { reloadBoundaryEntriesSync } from "../../common/门禁引擎/boundary-core.ts";

/** 条目是否被当前任务的条件声明激活（非条件条目恒真；无 scope 时无声明 → 条件条目不激活） */
function isActive(e: BoundaryEntry, scope: TaskScope | undefined): boolean {
  if (e.kind !== "conditional-directory") return true;
  const slug = e.condition;
  if (!isValidConditionSlug(slug)) return false; // 缺 slug 或格式非法 → 不激活（fail-closed）
  const conds = scope && Array.isArray(scope.conditions) ? scope.conditions : [];
  return conds.includes(slug);
}

/** 条目路径是否覆盖根内相对路径 relTarget（不涉及条件） */
function pathCovers(e: BoundaryEntry, relTarget: string): boolean {
  const ePath = normalizeLexical(e.path);
  if (e.kind === "file") return compareKey(ePath) === compareKey(relTarget);
  return isUnderOrEqual(relTarget, ePath); // directory 与 conditional-directory
}

/**
 * F10：将边界内"此刻被允许"的路径按根分组，用于拒绝信息（**非 F4 分支**：F5 缺条件 / 未匹配 /
 * 跨根混淆 / F7 逃逸 / 接受门等）。未被条件激活的 conditional-directory 不计入（它此刻并未被允许）。
 * 注意（F-5-main）：F4 分支（在边界内但不在 writeSet 内）**不用本列表**——那里呈现的应是
 * 「当前已发行可写集」（见 issuedByRootOf），否则「允许写入的路径」会与「不在任务 writeSet 内」
 * 的拒绝语义自相矛盾（真机现场：列表列出的正是覆盖被拒路径的边界目录 `docs`）。
 */
function allowedByRootOf(boundary: BoundarySection1, scope: TaskScope | undefined): AllowedPathsByRoot {
  const out: AllowedPathsByRoot = { skill: [], project: [] };
  for (const e of boundary.entries) {
    if (!isActive(e, scope)) continue;
    const p = normalizeLexical(e.path);
    if (e.root === "skill") out.skill.push(p);
    else out.project.push(p);
  }
  return out;
}

/**
 * F4 分支专用（F-5-main）：拒绝信息里的「允许写入的路径」＝**当前已发行可写集**——取 `scope.writeSet`
 * 中**在边界内且条件已激活**的项（逐项用与判定同源的 `pathCovers`/`isActive` 过滤，不另造语义）。
 * 合同上 writeSet 为本项目相对路径（`src/model/decision.ts`）⇒ 一律归 project 组。
 * writeSet 为空（或全部被边界/条件滤掉）⇒ 两根皆空——如实呈现「此刻什么也写不了」，与 F4 原因一致。
 */
function issuedByRootOf(boundary: BoundarySection1, scope: TaskScope): AllowedPathsByRoot {
  const out: AllowedPathsByRoot = { skill: [], project: [] };
  const set = Array.isArray(scope.writeSet) ? scope.writeSet : [];
  for (const w of set) {
    const rel = normalizeLexical(w);
    const inBoundary = boundary.entries.some(
      (e) => e.root === "project" && pathCovers(e, rel) && isActive(e, scope),
    );
    if (inBoundary) out.project.push(rel);
  }
  return out;
}

/**
 * F4 拒绝信息的可操作指引（F-5-main；kanban-live 真机：su 被 F4 拒后在该机制下不可能奏效的
 * 「请客户聊天授权」上打转——聊天消息不进发行器）。指引必须与实现一致：发行只经
 * `request_confirmation` 的 preview 逐条列路径 + 客户返回 confirmed:true（编排 confirmed-writes.ts），
 * 且许可按会话生效（会话重建/重开即作废——真机正是重建把已发行集静默清零后同路径先过后拒）。
 * 原头（`路径在角色边界内，但不在任务 writeSet 内（F4）：<rel>`）保持逐字不动，其后追加本段
 * ——跨角色既有测试按原头子串断言（提案 §六.1）。
 */
const F4_DENIAL_GUIDANCE =
  "\n如需写入该路径，请先取得写盘许可：若你的工具集中有 request_confirmation（确认制会话），" +
  "把该路径逐条列入其 preview 呈客户确认——客户返回 confirmed:true 后该路径会被发行进 writeSet，" +
  "再重试写入即可；任务型会话请把该路径加入任务 writeSet（或改在 writeSet 内选路径）。" +
  "注意：许可按会话生效——会话重建/重开后不会自动保留，需重新确认。";

function deny(reason: string, boundary: BoundarySection1, scope: TaskScope | undefined): WriteDecision {
  return { allowed: false, reason, allowedByRoot: allowedByRootOf(boundary, scope) };
}

/** F4：writeSet 为精确集合，按根内相对路径精确匹配（仅在给了 scope 时调用） */
function writeSetContains(scope: TaskScope, relTarget: string): boolean {
  const t = compareKey(relTarget);
  const set = Array.isArray(scope.writeSet) ? scope.writeSet : [];
  return set.some((w) => compareKey(normalizeLexical(w)) === t);
}

export function resolveWrite(
  targetPath: string,
  boundary: BoundarySection1,
  scope: TaskScope | undefined,
  ctx: { skillRoot: string; projectRoot: string },
): WriteDecision {
  // 边界解析失败 → 拒绝一切写入（fail-closed），理由说明解析失败
  if (typeof boundary.parseError === "string" && boundary.parseError !== "") {
    return deny(`边界解析失败：${boundary.parseError}（拒绝一切写入）`, boundary, scope);
  }

  // F6：边界未被接受或缺少证据来源 → 拒绝一切写入
  const acc = boundary.acceptance;
  if (!acc || acc.accepted !== true || typeof acc.source !== "string" || acc.source.trim() === "") {
    return deny("边界未被接受或缺少证据来源（F6）：拒绝一切写入。", boundary, scope);
  }

  const raw = typeof targetPath === "string" ? targetPath.trim() : "";
  if (raw === "") return deny("目标路径为空。", boundary, scope);

  const skillRootAbs = normalizeLexical(ctx.skillRoot);
  const projectRootAbs = normalizeLexical(ctx.projectRoot);

  // 根归属：绝对路径按包含关系判定；相对路径按项目根解释（受治理会话 cwd 为项目根）
  let root: Root;
  let rel: string;
  let absCandidate: string;

  if (isAbsoluteAny(raw)) {
    const abs = normalizeLexical(raw);
    const relProj = absRel(abs, projectRootAbs);
    const relSkill = absRel(abs, skillRootAbs);
    if (relProj !== null) {
      root = "project";
      rel = relProj;
    } else if (relSkill !== null) {
      root = "skill";
      rel = relSkill;
    } else {
      return deny(`目标绝对路径不在任何受治理根（skill/project）之内：${raw}`, boundary, scope);
    }
    absCandidate = abs;
  } else {
    root = "project";
    rel = normalizeLexical(raw);
    absCandidate = normalizeLexical(projectRootAbs.replace(/\/$/, "") + "/" + rel);
  }

  // F7：符号链接 / junction 逃逸 —— 真实路径必须仍落在对应根之内
  const rootAbs = root === "skill" ? skillRootAbs : projectRootAbs;
  const realRoot = realResolve(rootAbs);
  const realTarget = realResolve(absCandidate);
  if (absRel(realTarget, realRoot) === null) {
    return deny(
      `目标路径经真实路径解析（符号链接/junction）逃逸出 ${root} 根之外（F7）：${realTarget}`,
      boundary,
      scope,
    );
  }

  const sameRoot = boundary.entries.filter((e) => e.root === root);
  // 被条件激活且路径覆盖的条目
  const active = sameRoot.filter((e) => pathCovers(e, rel) && isActive(e, scope));
  // 路径覆盖但条件未被声明的 conditional-directory（用于给出"缺少条件"这一独立拒绝理由）
  const inactiveConditional = sameRoot.filter(
    (e) => e.kind === "conditional-directory" && pathCovers(e, rel) && !isActive(e, scope),
  );

  if (active.length > 0) {
    // F4：任务收窄 —— 仅当给了 scope 时，路径还须落在 writeSet 内；无 scope 则不做此收窄
    if (scope !== undefined && !writeSetContains(scope, rel)) {
      return {
        allowed: false,
        // 原头逐字保留（跨角色断言依赖）；其后追加可操作指引（F-5-main）
        reason: `路径在角色边界内，但不在任务 writeSet 内（F4）：${rel}${F4_DENIAL_GUIDANCE}`,
        // F-5-main：F4 分支的列表＝当前已发行可写集（不是边界条目——那会与拒绝原因自相矛盾）
        allowedByRoot: issuedByRootOf(boundary, scope),
      };
    }
    return { allowed: true, matchedEntry: active[0] };
  }

  // 条件目录命中路径但缺条件 → 与"未匹配任何条目"是不同的拒绝理由
  if (inactiveConditional.length > 0) {
    const slug = inactiveConditional[0].condition;
    return deny(
      `命中条件目录但缺少条件 \`${slug}\`：任务未在 conditions 声明该条件（拒绝）：${rel}`,
      boundary,
      scope,
    );
  }

  // 跨根混淆：目标归属本根，却命中另一根的条目
  const cross = boundary.entries.filter(
    (e) => e.root !== root && pathCovers(e, rel) && isActive(e, scope),
  );
  if (cross.length > 0) {
    return deny(
      `跨根混淆：目标归属 ${root} 根，却命中另一根的条目（拒绝）：${rel}`,
      boundary,
      scope,
    );
  }

  // 旧快照线索（客户派工；真机现象）：su 已改好盘上边界，但**活会话持有开会话时解析的旧快照** ⇒
  // 写入被拒、且原文案只说「未匹配任何边界条目」，不提示「快照过期」——排查者（含模型）要绕一圈。
  // 触发判据（**可判定才加**）：**同步重读盘上边界**成功（非内置标签 / 读盘成功 / 新解析无报错）且
  // 重读结果**按与本判定同一套语义**（root + pathCovers + isActive）**覆盖该路径**——即「盘上含、
  // 快照不含」。无法判定（读盘失败 / 新解析报错等）⇒ 保持原文案逐字不变，**不猜测**。
  // 桌面 O-1 会在交互时机自动重建旧快照会话（多能自愈）；本句服务残余情形（轮次在跑 / 未触达重建）。
  // 线索是**提示**、不是放行：判定仍是拒绝（fail-closed 不变，文案已写明「本次判定不变，仍为拒绝」）。
  const base = `目标路径未匹配任何边界条目（根：${root}）：${rel}`;
  const fresh = reloadBoundaryEntriesSync(boundary.boundarySource, projectRootAbs, skillRootAbs);
  const freshCovers =
    fresh !== null && fresh.some((e) => e.root === root && pathCovers(e, rel) && isActive(e, scope));
  if (freshCovers) {
    return deny(
      `${base}。本会话可能持有旧边界快照（盘上边界现已含该路径）——请重开会话后重试；本次判定不变，仍为拒绝。`,
      boundary,
      scope,
    );
  }
  return deny(base, boundary, scope);
}
