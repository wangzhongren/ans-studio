// src/service/version-change/impl/refactor-validate.ts
// 轻量重构申请校验（refactor-request/v1，2026-11-04 C2c 契约冻结）。
//
// 依据 P1.6 §4.8/§6.3、F31/F39/F40、AC-7/AC-8/AC-20：
// · 发起者必须 convener（`managedBy:"application-scheduler"` 是应用调度层语义，不是新增角色）；
// · flow 必须存在；scope 在既有模块/角色边界内；
// · 禁止版本化文档 / 边界 / stable 文件 / 团队计划 / flow / `.ans`（路径命中 ⇒ 拒绝并提示
//   VCA / stable-write）；scope 申报校验只作 early warning，机械保证在 WriteGate/shell 守卫；
// · enforcement.writeSet 只含模块代码目录（由任务/WriteGate 收窄）；不产生 trunk 版本、
//   无 customer decision、不弹批准卡。
// 本文件无 I/O；flow 存在性/模块根由调用方（S4/D1）注入，本层不读盘。

import {
  REFACTOR_MANAGED_BY,
  REFACTOR_REQUEST_SCHEMA,
  REFACTOR_REQUESTED_BY,
  REFACTOR_REASON_MAX,
  REFACTOR_FORBIDDEN_KINDS,
  type RefactorForbiddenKind,
  type RefactorRequestRecord,
  type RefactorRequestScope,
} from "../../../model/version-change.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../model/runtime.ts";
import type {
  RefactorEnforcement,
  RefactorSubmitInput,
  RefactorValidationContext,
  RefactorValidationResult,
  RefactorValidator,
} from "../abstract/version-change-service.ts";
import { isStableDocPath, normalizeServiceRelPath } from "./targets-items.ts";

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const REQUEST_ID_RE = /^rf-[0-9]+$/;

export type RefactorPathClassification =
  | { ok: true }
  | { ok: false; code: "refactor-scope-forbidden"; kind?: RefactorForbiddenKind; message: string };

/** 路径分类（early warning）：命中版本化/边界/stable/团队计划/flow/`.ans` ⇒ 拒绝并提示通道。 */
export function classifyRefactorPath(relPath: string): RefactorPathClassification {
  const rel = normalizeServiceRelPath(relPath);
  if (rel === undefined) {
    return { ok: false, code: "refactor-scope-forbidden", message: `scope 路径非法：${String(relPath)}` };
  }
  if (rel === ".ans" || rel.startsWith(".ans/")) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      message: `scope 不得包含应用运行数据：${rel}`,
    };
  }
  if (/(^|\/)boundary\.ya?ml$/i.test(rel)) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      kind: "boundary",
      message: `重构不能改角色边界（kind=boundary）：${rel}；请走 stable 写入确认（appointment-write + mini re-pin）`,
    };
  }
  if (isStableDocPath(rel)) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      kind: "stable",
      message: `重构不能改 stable 文件（kind=stable）：${rel}；请走 stable 写入确认（workflow 卡/appointment-write）`,
    };
  }
  if (/^docs\/scheduling\//.test(rel)) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      kind: "team-plan",
      message: `重构不能改团队计划（kind=team-plan）：${rel}；请提交版本变更申请（detail-amendment execution）`,
    };
  }
  if (/^docs\/flows\//.test(rel)) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      kind: "flow",
      message: `重构不能改 flow（kind=flow）：${rel}；请提交版本变更申请（detail-amendment execution）`,
    };
  }
  if (/^docs\/(product|proposals|contracts)\/.*-v\d+\.md$/i.test(rel)) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      kind: "versioned-doc",
      message: `重构不能改版本化文档（kind=versioned-doc）：${rel}；请提交版本变更申请（detail-amendment/version-upgrade）`,
    };
  }
  if (rel === "角色卡" || rel.startsWith("角色卡/")) {
    return {
      ok: false,
      code: "refactor-scope-forbidden",
      message: `重构不能改角色卡/治理资料：${rel}；角色卡写入走确认通道`,
    };
  }
  return { ok: true };
}

function isWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** 机械写集：只含模块代码目录（scope.paths 归一化 + 去重；scope.modules 一并登记）。 */
export function buildRefactorEnforcement(scope: RefactorRequestScope): RefactorEnforcement {
  const writeSet = [...new Set([...scope.paths, ...scope.modules].map((entry) => normalizeServiceRelPath(entry)).filter((entry): entry is string => entry !== undefined))];
  return { writeSet, forbiddenKinds: [...REFACTOR_FORBIDDEN_KINDS] };
}

/** 纯校验（不写记录；S4/D1 在活动 convener 能力位后调用并插入 provider）。 */
export function validateRefactorSubmit(
  input: RefactorSubmitInput,
  context: RefactorValidationContext,
): RefactorValidationResult {
  if (input.roleId !== REFACTOR_REQUESTED_BY) {
    return {
      ok: false,
      code: "refactor-role-not-allowed",
      message: `重构申请只能由 convener 发起（实际：${String(input.roleId)}）；渲染侧自报身份一律拒绝`,
    };
  }
  if (context.flowExists !== true) {
    return { ok: false, code: "refactor-flow-missing", message: `flow 不存在：${String(input.flowId)}` };
  }
  if (!REQUEST_ID_RE.test(input.requestId)) {
    return { ok: false, code: "refactor-invalid", message: `requestId 非法：${String(input.requestId)}` };
  }
  if (!FLOW_ID_RE.test(input.flowId)) {
    return { ok: false, code: "refactor-invalid", message: `flowId 非法：${String(input.flowId)}` };
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (title === "") return { ok: false, code: "refactor-invalid", message: "title 不得为空" };
  if (reason === "" || reason.length > REFACTOR_REASON_MAX) {
    return { ok: false, code: "refactor-invalid", message: `reason 必须为 1..${REFACTOR_REASON_MAX} 字符` };
  }
  const scope = input.scope;
  if (
    scope === undefined ||
    !Array.isArray(scope.modules) ||
    !Array.isArray(scope.paths) ||
    !Array.isArray(scope.roles) ||
    [...scope.modules, ...scope.paths, ...scope.roles].some((entry) => typeof entry !== "string")
  ) {
    return { ok: false, code: "refactor-invalid", message: "scope.modules/paths/roles 必须为字符串数组" };
  }

  const normalizedModules: string[] = [];
  for (const modulePath of scope.modules) {
    const rel = normalizeServiceRelPath(modulePath);
    if (rel === undefined) return { ok: false, code: "refactor-invalid", message: `scope 模块路径非法：${modulePath}` };
    const classified = classifyRefactorPath(rel);
    if (!classified.ok) return classified;
    normalizedModules.push(rel);
  }
  const normalizedPaths: string[] = [];
  for (const path of scope.paths) {
    const rel = normalizeServiceRelPath(path);
    if (rel === undefined) return { ok: false, code: "refactor-invalid", message: `scope 路径非法：${path}` };
    const classified = classifyRefactorPath(rel);
    if (!classified.ok) return classified;
    if (context.allowedModuleRoots !== undefined && context.allowedModuleRoots.length > 0) {
      const roots = context.allowedModuleRoots
        .map((root) => normalizeServiceRelPath(root))
        .filter((root): root is string => root !== undefined);
      if (!roots.some((root) => isWithinRoot(rel, root))) {
        return {
          ok: false,
          code: "refactor-write-set-forbidden",
          message: `scope 路径不在既有模块代码目录内：${rel}（重新申请或走版本变更）`,
        };
      }
    }
    normalizedPaths.push(rel);
  }

  const normalizedScope: RefactorRequestScope = {
    modules: [...new Set(normalizedModules)],
    paths: [...new Set(normalizedPaths)],
    roles: [...new Set(scope.roles)],
  };
  const enforcement = buildRefactorEnforcement(normalizedScope);
  const record: RefactorRequestRecord = {
    v: 1,
    schema: REFACTOR_REQUEST_SCHEMA,
    requestId: input.requestId,
    flowId: input.flowId,
    initiatedBy: REFACTOR_REQUESTED_BY,
    title,
    reason,
    scope: normalizedScope,
    status: "requested",
    managedBy: REFACTOR_MANAGED_BY,
    enforcement,
    at: input.at,
  };
  return { ok: true, record, enforcement };
}

/** 无状态校验器（组合入口用；不注入、不写盘）。 */
export function buildRefactorValidator(): RefactorValidator {
  return {
    async validate(input, context) {
      return validateRefactorSubmit(input, context);
    },
  };
}
