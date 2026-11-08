// src/common/shared/shell-approval-binding.ts
// 跨角色共享：shell 审批链的进程内函数身份绑定与事实冻结（2026-11-08「会话创建准入按操作审批」方案
// P1.3 §2.3；派发接口评审 I0-1/I0-2/I0-3/I0-9 为硬约束）。
//
// **属主 / 唯一写入者：shared-code**（`src/common/shared/`）。**消费者（只读导入）**：
//   - 编排 `src/common/编排/shell-gate.ts`——`createShellGate` 构造成功后**唯一登记点**；
//   - 运行时核心 `src/service/runtime/session.ts`——`prepareRole`/`bindPreparedRole` 读取准入事实；
//   - 测试 `test/项目管理/shared/shell-approval-binding.test.ts`。
//
// 本模块只做「进程内函数身份绑定 + 白名单事实投影 + 探针执行」，不含任何策略/判定逻辑：
//   - `registerShellApproval(gate, facts, sink)`：仅由 `createShellGate` 在构造成功后调用一次；模块私有
//     WeakMap 保存**深度冻结的事实副本**与**私有 sink 引用**（sink 引用只在本模块内部，不出现在任何
//     返回 facts 中）。登记**不接受**调用方提供的 probe 结果：`facts.audit.probe` 必须是 `"unknown"`。
//   - `inspectShellApproval(gate)`：同步返回冻结基础事实或 `undefined`（未登记——上层按
//     `protected-scope-approval-chain-unproven` fail-closed）。
//   - `probeShellApproval(gate)`：**无值入参**；模块内部 `await sink.probe()`；无 sink / 无 `probe()` /
//     抛错 / 返回非三态值 ⇒ `"unavailable"`；同一 gate 的并发调用**共享同一 promise**，结果冻结
//     memoize（同一 gate 恒返回同一 promise，失败结果同样 memoize——恢复需新 gate/新会话）。
//     **不存在任何接受 probe 结果值的 API**（无 finalize 类入口）。
//
// 证据边界（如实，与 PR #72 的 `current-process-only` 同一诚实口径）：本证据证明「当前进程内，这个
// gate 函数由应用自己的 `createShellGate` 构造，登记时带入了这些事实与审计 sink，且探针只能由本模块
// 执行」；**不**证明 native 效果闭包、不覆盖其它进程或绕过、也不防御恶意宿主代码（宿主已拥有本机执行
// 权）；只防遗漏/误配/伪造证据。
//
// **测试私有 Symbol**：`SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE` 挂在**审计 sink 对象**的**非枚举**
// 属性上（载体随 `opts.audit` 传递；复核 R8b），`createShellGate` 可经
// `hasShellApprovalTestNonDurableAllowance(sink)` 内部检查。**生产装配（`assemble*`/`buildShellGate`/
// `run-role`/桌面）不得设置该 Symbol**；**不得**经 `src/service/gate/shell-rules.ts` 等生产公共出口再导出。
//
// 依赖方向（I0-9）：本模块**自包含**（零 import）——不引用编排/门禁引擎/角色模块/引擎层的任何文件；
// sink 与事实类型均在本文件以结构类型定义，消费方结构兼容即可。

/** 审批链模式（由 `createShellGate` 的 `readonlyOnly`/`operatorOnly`/`advisoryRuleset` 选项决定）。 */
export type ShellApprovalMode = "readonly" | "operator-approve" | "rules-advisory" | "three-layer";

/** 审计 sink 类型（`describe()` 的白名单投影）。 */
export type ShellApprovalAuditSinkKind = "file" | "memory" | "custom";

/** 审计写门禁探针三态。 */
export type ShellApprovalAuditProbeState = "ok" | "unavailable" | "unknown";

/** 审计事实（白名单投影；无凭据/环境）。 */
export interface ShellApprovalAuditFacts {
  sink: ShellApprovalAuditSinkKind;
  durable: boolean;
  /** 探针结果；登记时恒为 `"unknown"`，只能由 `probeShellApproval` 内部执行 `sink.probe()` 得出。 */
  probe: ShellApprovalAuditProbeState;
  relPath?: string;
}

/** 登记事实（白名单投影；不得携带凭据/环境/适配器 options）。 */
export interface ShellApprovalFacts {
  source: "orchestration-shell-gate";
  version: 1;
  projectRoot?: string;
  mode: ShellApprovalMode;
  classifier: boolean;
  rules: boolean;
  pmAsk: boolean;
  operatorChannel: boolean;
  takeGrant: boolean;
  takeDirective: boolean;
  routinePolicy: boolean;
  audit: ShellApprovalAuditFacts;
  escalation: boolean;
}

/** 冻结事实（运行时深度冻结；类型层面只读）。 */
export type FrozenShellApprovalFacts = Readonly<Omit<ShellApprovalFacts, "audit">> & {
  readonly audit: Readonly<ShellApprovalAuditFacts>;
};

/**
 * 结构性审计 sink（本模块不引用编排 `ShellAuditSink`；消费方结构兼容即可）。
 * - `probe()`：审计写门禁探针，**由本模块内部执行**（无入参），返回三态；
 * - `describe()`：sink 类型/持久性/相对路径的白名单描述（file sink 由编排实现）。
 */
export interface ShellApprovalProbeSink {
  probe?(): Promise<ShellApprovalAuditProbeState>;
  describe?(): { kind: ShellApprovalAuditSinkKind; durable: boolean; relPath?: string };
}

/** 内部登记条目：事实副本（冻结）+ 私有 sink 引用（不导出）+ 探针 promise（memoize）。 */
interface RegisteredShellApproval {
  readonly facts: FrozenShellApprovalFacts;
  readonly sink: ShellApprovalProbeSink | undefined;
  probePromise?: Promise<FrozenShellApprovalFacts>;
}

const registrations = new WeakMap<Function, RegisteredShellApproval>();

const MODES: readonly ShellApprovalMode[] = ["readonly", "operator-approve", "rules-advisory", "three-layer"];
const SINK_KINDS: readonly ShellApprovalAuditSinkKind[] = ["file", "memory", "custom"];
const PROBE_STATES: readonly ShellApprovalAuditProbeState[] = ["ok", "unavailable", "unknown"];

const FACT_KEYS: ReadonlySet<string> = new Set([
  "source",
  "version",
  "projectRoot",
  "mode",
  "classifier",
  "rules",
  "pmAsk",
  "operatorChannel",
  "takeGrant",
  "takeDirective",
  "routinePolicy",
  "audit",
  "escalation",
]);
const AUDIT_KEYS: ReadonlySet<string> = new Set(["sink", "durable", "probe", "relPath"]);
const BOOLEAN_FACT_KEYS = [
  "classifier",
  "rules",
  "pmAsk",
  "operatorChannel",
  "takeGrant",
  "takeDirective",
  "routinePolicy",
  "escalation",
] as const;

/**
 * 登记一个由 `createShellGate` 构造成功的 gate（**唯一登记点**；重复登记 fail-closed）。
 * 登记时对 facts 做**白名单投影**（只复制定义字段，拒绝白名单外字段），`audit.probe` 必须为
 * `"unknown"`（探针结果只能由本模块内部执行得出；不接受调用方回填）。sink 引用只保存在模块内部。
 */
export function registerShellApproval(
  gate: Function,
  facts: ShellApprovalFacts,
  sink: ShellApprovalProbeSink | undefined,
): void {
  if (typeof gate !== "function") {
    throw new TypeError("registerShellApproval：gate 必须是 createShellGate 构造的函数");
  }
  if (registrations.has(gate)) {
    throw new Error("registerShellApproval：同一 gate 已登记（登记点唯一在 createShellGate 构造成功后）");
  }
  registrations.set(gate, { facts: projectApprovalFacts(facts), sink });
}

/**
 * 同步读取登记时的**冻结基础事实**（`audit.probe` 恒为 `"unknown"`）；未登记 ⇒ `undefined`
 * （上层按 `protected-scope-approval-chain-unproven` fail-closed）。返回值深度冻结，调用方无法借引用修改。
 */
export function inspectShellApproval(gate: Function): FrozenShellApprovalFacts | undefined {
  if (typeof gate !== "function") return undefined;
  return registrations.get(gate)?.facts;
}

/**
 * 执行（或复用）该 gate 的审计探针：**无值入参**——签名只接收 gate，探针只能由本模块内部调用
 * `sink.probe()` 得出。未登记 ⇒ `undefined`；已登记但 sink 缺失/无 `probe()`/抛错/返回非三态值 ⇒
 * `"unavailable"`。同一 gate 的并发/后续调用共享同一 promise，结果冻结 memoize。
 */
export function probeShellApproval(gate: Function): Promise<FrozenShellApprovalFacts | undefined> {
  if (typeof gate !== "function") return Promise.resolve(undefined);
  const entry = registrations.get(gate);
  if (entry === undefined) return Promise.resolve(undefined);
  const existing = entry.probePromise;
  if (existing !== undefined) return existing;
  const started = runProbe(entry);
  entry.probePromise = started;
  return started;
}

/**
 * 测试私有 Symbol：允许 `createShellGate` 在测试装配中接受**非持久**审计 sink。
 * 载体：**审计 sink 对象**的非枚举属性（`Object.defineProperty(sink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE,
 * { value: true, enumerable: false })`）。**生产装配（`assemble*`/`buildShellGate`/`run-role`/桌面）
 * 不得设置**；不得经 `src/service/gate/shell-rules.ts` 等生产公共出口再导出。
 */
export const SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE: unique symbol = Symbol.for(
  "ans.shell-approval-binding.SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE",
);

/**
 * `createShellGate` 内部检查：sink 上是否存在**非枚举**的测试私有 Symbol（生产恒为 false）。
 * 只认自有属性且 `enumerable === false`；可枚举定义不构成测试通道。
 */
export function hasShellApprovalTestNonDurableAllowance(sink: unknown): boolean {
  if (sink === null || (typeof sink !== "object" && typeof sink !== "function")) return false;
  const descriptor = Object.getOwnPropertyDescriptor(sink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE);
  return descriptor !== undefined && descriptor.enumerable === false;
}

// —— 内部辅助 ——

/** 白名单投影 + 形状校验 + 深度冻结（不保存调用方对象引用）。 */
function projectApprovalFacts(input: ShellApprovalFacts): FrozenShellApprovalFacts {
  if (input === null || typeof input !== "object") {
    throw new TypeError("registerShellApproval：facts 必须是对象（白名单投影）");
  }
  assertWhitelistKeys(input, FACT_KEYS, "facts");
  if (input.source !== "orchestration-shell-gate") {
    throw new Error('registerShellApproval：facts.source 必须是 "orchestration-shell-gate"');
  }
  if (input.version !== 1) {
    throw new Error("registerShellApproval：facts.version 必须是 1");
  }
  if (!MODES.includes(input.mode)) {
    throw new Error(`registerShellApproval：未知 mode "${String(input.mode)}"`);
  }
  for (const key of BOOLEAN_FACT_KEYS) {
    if (typeof input[key] !== "boolean") {
      throw new TypeError(`registerShellApproval：facts.${key} 必须是 boolean`);
    }
  }
  if (input.projectRoot !== undefined && (typeof input.projectRoot !== "string" || input.projectRoot.length === 0)) {
    throw new TypeError("registerShellApproval：facts.projectRoot 必须是非空字符串或省略");
  }
  const auditInput = input.audit;
  if (auditInput === null || typeof auditInput !== "object") {
    throw new TypeError("registerShellApproval：facts.audit 必须是对象");
  }
  assertWhitelistKeys(auditInput, AUDIT_KEYS, "facts.audit");
  if (!SINK_KINDS.includes(auditInput.sink)) {
    throw new Error(`registerShellApproval：facts.audit.sink 未知 "${String(auditInput.sink)}"`);
  }
  if (typeof auditInput.durable !== "boolean") {
    throw new TypeError("registerShellApproval：facts.audit.durable 必须是 boolean");
  }
  if (auditInput.probe !== "unknown") {
    throw new Error(
      'registerShellApproval：登记时 facts.audit.probe 必须为 "unknown"——probe 结果只能由 probeShellApproval 内部执行 sink.probe() 得出，不接受调用方回填',
    );
  }
  if (auditInput.relPath !== undefined && (typeof auditInput.relPath !== "string" || auditInput.relPath.length === 0)) {
    throw new TypeError("registerShellApproval：facts.audit.relPath 必须是非空字符串或省略");
  }
  const audit: ShellApprovalAuditFacts = {
    sink: auditInput.sink,
    durable: auditInput.durable,
    probe: "unknown",
    ...(auditInput.relPath !== undefined ? { relPath: auditInput.relPath } : {}),
  };
  const projected: ShellApprovalFacts = {
    source: "orchestration-shell-gate",
    version: 1,
    ...(input.projectRoot !== undefined ? { projectRoot: input.projectRoot } : {}),
    mode: input.mode,
    classifier: input.classifier,
    rules: input.rules,
    pmAsk: input.pmAsk,
    operatorChannel: input.operatorChannel,
    takeGrant: input.takeGrant,
    takeDirective: input.takeDirective,
    routinePolicy: input.routinePolicy,
    audit,
    escalation: input.escalation,
  };
  return freezeFacts(projected);
}

function assertWhitelistKeys(obj: object, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(
        `registerShellApproval：${label} 含白名单外字段 "${key}"（事实只做白名单投影，不得携带凭据/环境/适配器选项）`,
      );
    }
  }
}

function freezeFacts(facts: ShellApprovalFacts): FrozenShellApprovalFacts {
  Object.freeze(facts.audit);
  return Object.freeze(facts);
}

async function runProbe(entry: RegisteredShellApproval): Promise<FrozenShellApprovalFacts> {
  const probe = await runSinkProbe(entry.sink);
  const audit: ShellApprovalAuditFacts = { ...entry.facts.audit, probe };
  return freezeFacts({ ...entry.facts, audit });
}

async function runSinkProbe(sink: ShellApprovalProbeSink | undefined): Promise<ShellApprovalAuditProbeState> {
  if (sink === undefined || sink === null) return "unavailable";
  try {
    const probe = sink.probe;
    if (typeof probe !== "function") return "unavailable";
    const value = await probe.call(sink);
    return PROBE_STATES.includes(value) ? value : "unavailable";
  } catch {
    return "unavailable";
  }
}
