// src/common/编排/dispatch-advisories.ts
// 2026-11-02（dispatch-guardrail-relax A1）：派发受理的**状态提示（advisory）**纯逻辑。
//
// 纪律：
//   - 只做 `import type` 引用 `workflow-preconditions.ts`，运行期不反向依赖（无运行期环）；
//   - 纯函数：不读盘、不写盘、不调用日志/会话、不抛异常；
//   - 全部 23 个 advisory code 只由本模块产出；会话层不得补产同类文案；
//   - 链级检查只报首个未满足项；独立 run/版本级 advisory 按固定顺序追加；
//   - 永不返回 `ok:false`、永不拒绝派发；无事实 → `[]`。
import type { DispatchPreflightInput } from "./workflow-preconditions.ts";

export type DispatchAdvisoryCode =
  | "flow-required"
  | "intent-missing"
  | "proposal-missing"
  | "roster-missing"
  | "roster-modules-missing"
  | "env-bootstrap-missing"
  | "d3-missing"
  | "d3-selected-cards-incomplete"
  | "handoff-missing"
  | "run-legacy-readonly"
  | "run-pin-required"
  | "run-pin-failed"
  | "run-role-missing"
  | "run-ledger-unavailable"
  | "run-document-hash-mismatch"
  | "run-pinned-roster-invalid"
  | "versioned-doc-baseline-violation"
  | "module-required"
  | "module-missing"
  | "module-not-owned"
  | "module-path-invalid"
  | "module-path-outside"
  | "target-not-nominated";

export type DispatchAdvisory = {
  /** 稳定技术 code；只进诊断/模型回执，不塞进客户卡。 */
  code: DispatchAdvisoryCode;
  /** 一句人话；不含技术 code。 */
  message: string;
};

/** 与 `workflow-preconditions.ts` 的名单常量保持一致；仅用于 advisory 判断，不构成授权。 */
const ENV_BOOTSTRAP_ROLE_ID = "env-bootstrap";

function advisory(code: DispatchAdvisoryCode, message: string): DispatchAdvisory {
  return { code, message };
}

function runRef(input: DispatchPreflightInput): string {
  return input.run?.runId !== undefined ? `run ${input.run.runId}` : "run";
}

/**
 * 模块路径归一化：规则与 `workflow-preconditions.ts::normalizeModulePath` 一致。
 * 旧硬检查已删除；本实现只用于 advisory 分类，不构成第二份授权判定。
 */
function normalizeAdvisoryModulePath(raw: unknown): { path: string; kind: "file" | "directory" } | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().replace(/\\/g, "/");
  if (value === "" || /[*?[\]{}!]/.test(value)) return undefined;
  if (value.startsWith("/") || /^[a-zA-Z]:\//.test(value)) return undefined;
  const segments = value.replace(/\/$/, "").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  const normalized = segments.join("/");
  if (value.endsWith("/")) return { path: `${normalized}/`, kind: "directory" };
  return { path: normalized, kind: "file" };
}

/** 链级检查：按来源→目标链只返回首个未满足项。 */
function chainAdvisory(input: DispatchPreflightInput): DispatchAdvisory | undefined {
  const isChief = input.fromRoleId === input.chiefRoleId;
  const isConvener = input.convenerRoleId !== null && input.fromRoleId === input.convenerRoleId;
  const roster = input.roster !== undefined && input.roster.ok === true ? input.roster.roster : undefined;
  const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";

  if (isChief) {
    if (input.targetRoleId === "rapporteur") {
      if (input.flowId === undefined) {
        return advisory("flow-required", "未携带/无法推断 flowId；本次不关联 run 记录。");
      }
      if (input.intent.found !== true) {
        return advisory("intent-missing", "尚无产品意图文档；策划可先接任务，但产出依据可能不足。");
      }
      return undefined;
    }
    if (input.targetRoleId === "nominator") {
      if (input.flowId === undefined) {
        return advisory("flow-required", "未携带/无法推断 flowId；本次不关联 run 记录。");
      }
      if (input.proposalFound !== true || input.architectureFound !== true) {
        return advisory("proposal-missing", "尚无方案/架构文档；人事发 D3/写卡前仍需这些材料。");
      }
      if (roster === undefined) {
        return advisory("roster-missing", "尚无合法名单；人事暂时无法发 D3/写卡。");
      }
      if (roster.modules.length === 0) {
        return advisory("roster-modules-missing", "名单缺模块清单；模块归属信息不可用。");
      }
      const hasEnvBootstrap = roster.roles.some((role) => role.id === ENV_BOOTSTRAP_ROLE_ID);
      if (!hasEnvBootstrap && roster.envBootstrap?.omitted !== true) {
        return advisory("env-bootstrap-missing", "名单缺 env-bootstrap 且未声明省略理由。");
      }
      return undefined;
    }
    if (input.targetRoleId === "convener") {
      if (input.flowId === undefined) {
        return advisory("flow-required", "未携带/无法推断 flowId；本次不关联 run 记录。");
      }
      if (input.d3Selected.length === 0) {
        return advisory("d3-missing", "尚无 D3 选中角色；运营派实现时目标可能不存在。");
      }
      const missing = (input.missingSelectedCardIds ?? []).filter((id) => id !== "");
      if (missing.length > 0 || input.targetCardFound !== true) {
        return advisory(
          "d3-selected-cards-incomplete",
          `D3 选中角色卡未齐备${missing.length > 0 ? `（缺：${missing.join("、")}）` : ""}；` +
            "运营为内置角色，不需写卡；不阻断交付。",
        );
      }
      return undefined;
    }
    // 产品/质检等其余内置目标无链式前置；项目 worker 由硬授权拒绝。
    return undefined;
  }

  if (!isConvener) return undefined;

  if (input.handoffFound !== true) {
    return advisory("handoff-missing", "尚未收到幕僚的交付任务；不阻断本次派发。");
  }
  if (input.flowId === undefined) {
    return advisory("flow-required", "未携带/无法推断 flowId；本次不关联 run 记录。");
  }

  if (input.targetBuiltIn) {
    if (input.targetRoleId !== "verifier") return undefined; // 硬授权会拒绝；这里不产链级提示
    if (moduleId !== "") {
      if (roster === undefined) {
        return advisory("roster-missing", "尚无合法名单；暂时无法核对验收模块。");
      }
      if (!roster.modules.some((module) => module.id === moduleId)) {
        return advisory("module-missing", `模块 ${moduleId} 不在最新名单内；任务照常受理。`);
      }
    }
    return undefined;
  }

  // 运营→项目 worker：模块链 → target-not-nominated
  if (moduleId === "") {
    return advisory("module-required", "实现任务未带 moduleId；任务照常受理，写入仍受角色边界约束。");
  }
  if (roster === undefined) {
    return advisory("roster-missing", "尚无合法名单；暂时无法核对模块归属。");
  }
  const module = roster.modules.find((entry) => entry.id === moduleId);
  if (module === undefined) {
    return advisory("module-missing", `模块 ${moduleId} 不在最新名单内；任务照常受理。`);
  }
  const moduleOwner = roster.roles.find((role) => role.modules.includes(module.id));
  if (moduleOwner?.id !== input.targetRoleId) {
    return advisory(
      "module-not-owned",
      `目标 ${input.targetRoleId} 不拥有模块 ${moduleId}；任务照常受理，写入仍受角色边界约束。`,
    );
  }
  if (input.modulePaths !== undefined) {
    for (const rawPath of input.modulePaths) {
      const normalized = normalizeAdvisoryModulePath(rawPath);
      if (normalized === undefined) {
        return advisory("module-path-invalid", `modulePaths 含非法路径 ${String(rawPath)}；任务照常受理。`);
      }
      const within = module.paths.some((allowed) => {
        if (allowed.endsWith("/")) return normalized.path === allowed.slice(0, -1) || normalized.path.startsWith(allowed);
        return normalized.path === allowed;
      });
      if (!within) {
        return advisory(
          "module-path-outside",
          `modulePaths 中的 ${normalized.path} 不属于模块 ${module.id}；任务照常受理。`,
        );
      }
    }
  }
  if (!input.d3Selected.includes(input.targetRoleId)) {
    return advisory("target-not-nominated", `目标 ${input.targetRoleId} 不在最新 D3 选中集合；不阻断本次派发。`);
  }
  return undefined;
}

/** 独立 run/版本级 advisory：按固定顺序追加；与链级互不影响。 */
function independentAdvisories(
  input: DispatchPreflightInput,
  chainCode: DispatchAdvisoryCode | undefined,
): DispatchAdvisory[] {
  const out: DispatchAdvisory[] = [];
  const isChief = input.fromRoleId === input.chiefRoleId;
  const isConvener = input.convenerRoleId !== null && input.fromRoleId === input.convenerRoleId;
  const runState = input.run?.state;
  const runId = runRef(input);
  const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";

  if (isConvener && runState === "legacy") {
    out.push(advisory("run-legacy-readonly", "该 flow 有 legacy 历史任务；本次按新 run 记账，不阻断。"));
  }
  if (input.runFacts?.pinFailed === true) {
    out.push(advisory("run-pin-failed", `${runId} 的 pin 尝试失败；run 保持 draft/缺失，不伪造 pinned。`));
  }
  const isHandoff = isChief && input.convenerRoleId !== null && input.targetRoleId === input.convenerRoleId;
  const convenerPinTarget = isConvener && (!input.targetBuiltIn || input.targetRoleId === "verifier");
  if (runState === "draft" && (isHandoff || convenerPinTarget)) {
    out.push(
      advisory(
        "run-pin-required",
        `${runId} 仍为 draft/未 pin；实现与验收的冻结契约不可用，不阻断派发。`,
      ),
    );
  }
  if (
    runState === "pinned" &&
    !input.targetBuiltIn &&
    input.run?.roles !== undefined &&
    !input.run.roles.includes(input.targetRoleId)
  ) {
    out.push(advisory("run-role-missing", `目标 ${input.targetRoleId} 不在 pinned run 的角色集；不阻断派发。`));
  }
  const runModuleRelevant = !input.targetBuiltIn || input.targetRoleId === "verifier";
  if (
    runState === "pinned" &&
    moduleId !== "" &&
    runModuleRelevant &&
    input.run?.modules !== undefined &&
    !input.run.modules.includes(moduleId) &&
    chainCode !== "module-missing"
  ) {
    out.push(
      advisory(
        "module-missing",
        `模块 ${moduleId} 不在 pinned run 的模块集；任务不锚定该 run，不阻断受理。`,
      ),
    );
  }
  if (input.runFacts?.ledgerUnavailable === true) {
    out.push(advisory("run-ledger-unavailable", "run 记录不可用；任务不带 run/flow 锚点，不阻断。"));
  }
  if (input.runFacts?.documentHashMismatch === true) {
    out.push(
      advisory(
        "run-document-hash-mismatch",
        "pinned run 文档哈希与 manifest 不一致；不重写、不阻断，任务不锚定该 run。",
      ),
    );
  }
  if (input.runFacts?.pinnedRosterInvalid === true) {
    out.push(
      advisory(
        "run-pinned-roster-invalid",
        "pinned run 的 roster 读取/校验失败；不重写、不阻断，任务不锚定该 run。",
      ),
    );
  }
  const violations = (input.versionedDocBaselineViolations ?? []).filter((path) => path !== "");
  if (violations.length > 0) {
    out.push(
      advisory(
        "versioned-doc-baseline-violation",
        `版本化文档基线有漂移（${violations.slice(0, 3).join("、")}${violations.length > 3 ? " 等" : ""}）；` +
          "派发不阻断，旧版本写入仍受只读保护。",
      ),
    );
  }
  return out;
}

/**
 * 计算派发 advisory。纯函数、永不拒绝；链级首个未满足项在前，独立 run/版本 advisory 按固定顺序追加。
 */
export function collectDispatchAdvisories(input: DispatchPreflightInput): DispatchAdvisory[] {
  const chain = chainAdvisory(input);
  const independent = independentAdvisories(input, chain?.code);
  return chain !== undefined ? [chain, ...independent] : independent;
}
