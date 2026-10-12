// Service：写入路径判定（本版心脏）
// 冻结契约 §3：resolveWrite(targetPath, boundary, scope, ctx): WriteDecision
// 覆盖：F6 未接受、F5 条件目录（固定 slug）、F4 任务收窄、跨根混淆、规范化、F7 符号链接逃逸、F10 按根分组。
// 判定顺序：F6 接受门 → 根归属与 F7 逃逸 → 匹配条目（含条件 slug）→ F4 writeSet 收窄（仅当给了 scope）。
//
// 关于 scope 可选（客户端裁决）：scope === undefined 表示 chat / standalone 这类"没有预先存在的任务"的
// 会话——任务是在对话里产生的，不该要求先声明范围。此时不做任务收窄，授权上界 = 角色边界本身。
// 这**不是放松校验**：角色边界就是这个角色长期工作的常设授权；writeSet 只是"正式计划(plan/task_ops)"
// 在常设授权之上再加的一层收窄，只在有计划时才有意义。缺 scope 不等于漏了 F4。

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
 * F10：将边界内"此刻被允许"的路径按根分组，用于拒绝信息。
 * 未被条件激活的 conditional-directory 不计入（它此刻并未被允许）。
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
      return deny(`路径在角色边界内，但不在任务 writeSet 内（F4）：${rel}`, boundary, scope);
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
