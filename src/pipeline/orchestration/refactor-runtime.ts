// src/pipeline/orchestration/refactor-runtime.ts
// 轻量重构 Pipeline 公共句柄（2026-11-04 trunk-amendment-model B-9 / S4）。
//
// 职责（P1 §2.5-27/§4.8；F11/F31/F40/AC-7）：
// · convener 发起（身份由能力位/调用方保证；本层再校验 roleId）→ S2 `RefactorValidator` 校验
//   （flow 存在、scope 在既有模块/角色边界内、禁止版本化文档/边界/stable/团队计划/flow/`.ans`）
//   → S1 `RefactorRequestStore` 记录（`managedBy:"application-scheduler"`）；
// · 返回 `enforcement.writeSet`（仅模块代码目录）供任务/WriteGate 收窄；越界 ⇒ 拒绝并提示
//   「版本变更申请」/stable 确认即写（early warning；机械保证在写门禁）；
// · 客户只读：**无 customer decision**、不弹批准卡；只写 `refactor.request`（application 归属）；
// · 不写代码/不派角色/不产生 trunk 版本。
//
// 纪律：账本经注入 `emitEvent`；不直接写盘项目文件（记录文件由 S1 store 原子写）。

import type { TaskStateEvent } from "../../model/runtime.ts";
import type { RefactorRequestRecord, RefactorRequestStatus } from "../../model/version-change.ts";
import type { RefactorRequestStore } from "../../provider/version-change/public/version-change-store.ts";
import type {
  RefactorEnforcement,
  RefactorSubmitInput,
  RefactorValidator,
} from "../../service/version-change/public/version-change-service.ts";

export interface RefactorRuntimeDeps {
  store: RefactorRequestStore;
  validator: RefactorValidator;
  emitEvent: (event: TaskStateEvent) => Promise<void>;
  /** flow 是否存在（生产由项目状态/调度提供；缺省 true）。 */
  flowExists?: (flowId: string) => boolean | Promise<boolean>;
  allowedModuleRoots?: readonly string[];
  now?: () => Date;
}

export type RefactorRuntimeFailure =
  | "refactor-invalid"
  | "refactor-role-not-allowed"
  | "refactor-flow-missing"
  | "refactor-scope-forbidden"
  | "refactor-boundary-exceeded"
  | "refactor-write-set-forbidden";

export interface RefactorSubmitOutcome {
  record: RefactorRequestRecord;
  enforcement: RefactorEnforcement;
}

export interface RefactorRuntime {
  submit(input: RefactorSubmitInput): Promise<
    | { ok: true; value: RefactorSubmitOutcome }
    | { ok: false; code: RefactorRuntimeFailure; message?: string; guidance?: string }
  >;
  list(): Promise<RefactorRequestRecord[]>;
  close(input: {
    requestId: string;
    status: Exclude<RefactorRequestStatus, "requested">;
    message?: string;
    at?: string;
  }): Promise<
    | { ok: true; value: RefactorRequestRecord }
    | { ok: false; code: "refactor-invalid"; message?: string }
  >;
}

function refactorEvent(record: RefactorRequestRecord, at: string): TaskStateEvent {
  return {
    v: 1,
    at,
    kind: "refactor.request",
    schema: "refactor-request/v1",
    requestId: record.requestId,
    flowId: record.flowId,
    initiatedBy: "convener",
    title: record.title,
    reason: record.reason,
    scope: record.scope,
    status: record.status,
    managedBy: "application-scheduler",
    enforcement: record.enforcement,
  } as TaskStateEvent;
}

export function createRefactorRuntime(deps: RefactorRuntimeDeps): RefactorRuntime {
  const now = deps.now ?? (() => new Date());

  return {
    async submit(input) {
      if (input.roleId !== "convener") {
        return {
          ok: false,
          code: "refactor-role-not-allowed",
          message: "轻量重构只能由运营（convener）发起",
          guidance: "客户/幕僚/其他角色不能发起重构；如需改契约/边界/稳定文件，走版本变更申请或 stable 确认即写。",
        };
      }
      const exists = deps.flowExists === undefined ? true : await deps.flowExists(input.flowId);
      const validated = await deps.validator.validate(input, {
        flowExists: exists,
        ...(deps.allowedModuleRoots !== undefined ? { allowedModuleRoots: deps.allowedModuleRoots } : {}),
      });
      if (!validated.ok) {
        return {
          ok: false,
          code: validated.code,
          message: validated.message,
          guidance:
            validated.code === "refactor-scope-forbidden" ||
            validated.code === "refactor-write-set-forbidden" ||
            validated.code === "refactor-boundary-exceeded"
              ? "重构只能改模块代码目录；涉及版本化文档/边界/stable/团队计划/flow 的变更转版本变更申请或 stable 确认即写。"
              : undefined,
        };
      }
      const record = validated.record;
      const inserted = await deps.store.insert(record);
      if (!inserted.ok) {
        return {
          ok: false,
          code: "refactor-invalid",
          message: inserted.code === "conflict" ? "重构申请已存在（幂等 requestId）" : inserted.message ?? "重构记录写入失败",
        };
      }
      await deps.emitEvent(refactorEvent(record, input.at));
      return { ok: true, value: { record, enforcement: validated.enforcement } };
    },

    list() {
      return deps.store.list();
    },

    async close(input) {
      const current = await deps.store.findById(input.requestId);
      if (current === undefined) {
        return { ok: false, code: "refactor-invalid", message: `重构申请不存在：${input.requestId}` };
      }
      const at = input.at ?? now().toISOString();
      const next: RefactorRequestRecord = {
        ...current,
        status: input.status,
        updatedAt: at,
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.status === "closed" ? { closedAt: at } : {}),
      };
      const updated = await deps.store.updateWithExpectedStatus(next, current.status);
      if (!updated.ok) {
        return { ok: false, code: "refactor-invalid", message: updated.message ?? "重构状态更新失败" };
      }
      await deps.emitEvent(refactorEvent(next, at));
      return { ok: true, value: next };
    },
  };
}
