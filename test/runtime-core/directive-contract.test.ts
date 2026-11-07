// A1（2026-11-03 客户授权平面）：共享 Model 契约冻结测试。
// 覆盖：事件/视图/target-scoped facts 形状、target 类型隔离（I-1 编译期负例）、高危谓词真值表、
// Q9 A 的 `runtime.ts`/`project-state.ts` 加法字段、`RequestPresentedEvent.to` 不扩（W-6）、
// ID/字段上限常量单一来源与旧事件/旧记录的加法兼容。
//
// 编译期断言由 `npm run typecheck`（tsconfig include 覆盖 test/）验证；运行时断言由 node --test 验证。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  GOVERNANCE_SLUG_PATTERN,
  type CustomerInputOutcome,
  type RequestPresentedEvent,
  type RequestResolvedEvent,
  type ShellReviewResult,
  type VersionDecisionEvent,
} from "../../src/model/runtime.ts";
import {
  VERSION_DECISION_SCHEMA,
  type VersionDecisionDecidedBy,
} from "../../src/model/project-state.ts";
import {
  CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES,
  CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH,
  CUSTOMER_DIRECTIVE_ID_PATTERN,
  CUSTOMER_DIRECTIVE_PATH_MAX_BYTES,
  CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES,
  CUSTOMER_DIRECTIVE_SCHEMA,
  CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES,
  CUSTOMER_DIRECTIVES_REL,
  DIRECTIVE_HIGH_RISK_REASONS,
  directiveHighRiskReasons,
  type ApprovalAction,
  type ApprovalDirectiveFact,
  type ApprovalDirectiveSnapshot,
  type CustomerDirectiveUntil,
  type CustomerDirectiveView,
  type DecisionAction,
  type DecisionDirectiveFact,
  type DecisionDirectiveSnapshot,
  type DirectiveCreatedEventV1,
  type DirectiveEventV1,
  type DirectiveHighRiskReason,
  type DirectiveScope,
} from "../../src/model/directive.ts";

const sourceUrl = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// —————————————— 编译期形状锁 ——————————————

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type Assert<T extends true> = T;

type ShellAllow = Extract<ShellReviewResult, { allow: true }>;
type ShellDeny = Extract<ShellReviewResult, { allow: false }>;
type AnsweredOutcome = Extract<CustomerInputOutcome, { outcome: "answered" }>;
type DeclinedOutcome = Extract<CustomerInputOutcome, { outcome: "declined" }>;
type UnavailableOutcome = Extract<CustomerInputOutcome, { outcome: "unavailable" }>;

type _ShellAllowDirective = Assert<
  Equal<NonNullable<ShellAllow["directive"]>, { id: string; scope: "once" | "session" | "forever" }>
>;
type _ShellDenyDirective = Assert<
  Equal<NonNullable<ShellDeny["directive"]>, { id: string; scope: "once" | "session" | "forever" }>
>;
type _ShellScopeMatchesUntil = Assert<
  Equal<NonNullable<ShellAllow["directive"]>["scope"], CustomerDirectiveUntil>
>;
type _AnsweredDirective = Assert<
  Equal<
    NonNullable<AnsweredOutcome["directive"]>,
    { id: string; action: "select-recommended" | "select-option" | "reject" }
  >
>;
type _DeclinedDirective = Assert<
  Equal<
    NonNullable<DeclinedOutcome["directive"]>,
    { id: string; action: "select-recommended" | "select-option" | "reject" }
  >
>;
type _UnavailableNoDirective = Assert<
  Equal<"directive" extends keyof UnavailableOutcome ? true : false, false>
>;
type _ResolvedBy = Assert<Equal<RequestResolvedEvent["by"], "judge" | "customer" | "directive" | "chief-delegated">>;
type _ResolvedDirectiveId = Assert<Equal<RequestResolvedEvent["directiveId"], string | undefined>>;
type _PresentedTo = Assert<Equal<RequestPresentedEvent["to"], "customer" | "judge" | "chief">>;
type _PresentedNoDirective = Assert<
  Equal<"directive" extends keyof RequestPresentedEvent ? true : false, false>
>;
type _VersionDecidedBy = Assert<Equal<VersionDecisionEvent["decidedBy"], VersionDecisionDecidedBy>>;
type _VersionDirectiveId = Assert<Equal<VersionDecisionEvent["directiveId"], string | undefined>>;

// B1 可消费的冻结声明：Q9 A 归属字段与单一来源 ID 常量。
function b1Consumer(event: RequestResolvedEvent): string {
  const idPattern = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);
  return event.by === "directive" &&
    event.directiveId !== undefined &&
    idPattern.test(event.directiveId)
    ? event.directiveId
    : "none";
}

// C1 可消费的冻结声明：三处加法字段与来源枚举穷举（P3.1 增真实 chief-delegated）。
function decidedByText(value: VersionDecisionDecidedBy): string {
  switch (value) {
    case "customer":
      return "customer";
    case "judge":
      return "judge";
    case "directive":
      return "directive";
    case "chief-delegated":
      return "chief-delegated";
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function c1Consumer(
  outcome: CustomerInputOutcome,
  review: ShellReviewResult,
  decidedBy: VersionDecisionDecidedBy,
): string[] {
  const values: string[] = [decidedByText(decidedBy)];
  if (outcome.outcome === "answered" || outcome.outcome === "declined") {
    if (outcome.directive !== undefined) {
      values.push(outcome.directive.id, outcome.directive.action);
    }
  }
  if (review.directive !== undefined) {
    values.push(review.directive.id, review.directive.scope);
  }
  return values;
}

// —————————————— 事件/视图 fixture ——————————————

const CREATED_AT = "2026-11-03T00:00:00.000Z";
const PROJECT_ROOT = "C:/work/proj/app";

const createdBase = {
  version: 1 as const,
  kind: "directive.created" as const,
  id: "d-1",
  seq: 1,
  until: "once" as const,
  rawText: '@审批 允许 shell "npm install" once',
  sessionId: "session-1",
  createdAt: CREATED_AT,
  createdBy: "customer" as const,
  source: "desktop-input" as const,
};

const approvalCreated: DirectiveCreatedEventV1 = {
  ...createdBase,
  target: "approval",
  action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: PROJECT_ROOT } },
  scope: {},
};

const decisionCreated: DirectiveCreatedEventV1 = {
  ...createdBase,
  id: "d-2",
  seq: 2,
  until: "session",
  rawText: "@决策 只接受 方案 A flow=customer-authorization-plane",
  target: "decision",
  action: { kind: "select-option", selector: "方案 A" },
  scope: { flowId: "customer-authorization-plane" },
};

const consumedEvent: DirectiveEventV1 = {
  version: 1,
  kind: "directive.consumed",
  id: "d-1",
  seq: 3,
  at: CREATED_AT,
  via: { requestId: "r-1", toolCallId: "tool-1", flowId: "customer-authorization-plane" },
};
const revokedEvent: DirectiveEventV1 = {
  version: 1,
  kind: "directive.revoked",
  id: "d-2",
  seq: 4,
  at: CREATED_AT,
  by: "customer",
};
const expiredEvent: DirectiveEventV1 = {
  version: 1,
  kind: "directive.expired",
  id: "d-1",
  seq: 5,
  at: CREATED_AT,
  reason: "app-restart",
};

const oldResolved: RequestResolvedEvent = {
  v: 1,
  at: CREATED_AT,
  kind: "request.resolved",
  requestId: "r-old",
  by: "customer",
  choice: "accept",
};
const directiveResolved: RequestResolvedEvent = {
  v: 1,
  at: CREATED_AT,
  kind: "request.resolved",
  requestId: "r-new",
  by: "directive",
  directiveId: "d-1",
  operatorId: "directive:d-1",
  choice: "confirm",
};
const oldVersionDecision: VersionDecisionEvent = {
  v: 1,
  at: CREATED_AT,
  kind: "version.decision",
  schema: VERSION_DECISION_SCHEMA,
  decisionId: "decision-old",
  requestId: "r-old",
  attempt: 1,
  flowId: "flow-old",
  action: "version-modify",
  recommendedBy: "chief",
  recommendedAction: "version-modify",
  decidedBy: "customer",
  reason: "customer",
  status: "executed",
};
const directiveVersionDecision: VersionDecisionEvent = {
  ...oldVersionDecision,
  decisionId: "decision-new",
  requestId: "r-new",
  flowId: "customer-authorization-plane",
  decidedBy: "directive",
  operatorId: "directive:d-1",
  directiveId: "d-1",
  reason: "customer directive",
};
const presentedEvent: RequestPresentedEvent = {
  v: 1,
  at: CREATED_AT,
  kind: "request.presented",
  requestId: "r-old",
  to: "customer",
};

const approvalFact: ApprovalDirectiveFact = {
  id: "d-1",
  seq: 1,
  target: "approval",
  action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: PROJECT_ROOT } },
  scope: {},
  until: "once",
};
const decisionFact: DecisionDirectiveFact = {
  id: "d-2",
  seq: 2,
  target: "decision",
  action: { kind: "select-recommended" },
  scope: {},
  until: "session",
};
const approvalSnapshot: ApprovalDirectiveSnapshot = { ledgerErrors: 0, active: [approvalFact] };
const decisionSnapshot: DecisionDirectiveSnapshot = { ledgerErrors: 0, active: [decisionFact] };
const view: CustomerDirectiveView = {
  id: "d-1",
  seq: 1,
  target: "approval",
  action: approvalFact.action,
  scope: {},
  until: "once",
  status: "active",
  rawText: approvalCreated.rawText,
  createdAt: CREATED_AT,
  consumer: "shell-gate",
};

// 负例：以下 `@ts-expect-error` 必须真实报错，否则 typecheck 失败（未使用指令）。
const badPresented: RequestPresentedEvent = {
  v: 1,
  at: CREATED_AT,
  kind: "request.presented",
  requestId: "r-bad",
  // @ts-expect-error W-6：presented 通道保持 customer|judge，不伪造 directive 通道
  to: "directive",
};
const badResolvedId: RequestResolvedEvent = {
  ...directiveResolved,
  // @ts-expect-error directiveId 必须是 string
  directiveId: 1,
};
const badVersionId: VersionDecisionEvent = {
  ...directiveVersionDecision,
  // @ts-expect-error directiveId 必须是 string
  directiveId: 1,
};
// @ts-expect-error 三值枚举之外的值不可赋值
const badDecidedBy: VersionDecisionDecidedBy = "system";
const badUnavailable: CustomerInputOutcome = {
  outcome: "unavailable",
  // @ts-expect-error unavailable 分支不带 directive
  directive: { id: "d-1", action: "reject" },
};
const badShell: ShellReviewResult = {
  allow: true,
  by: "directive:d-1",
  // @ts-expect-error shell directive 形状固定为 {id, scope}
  directive: { id: "d-1", action: "reject" },
};
// @ts-expect-error I-1：decision fact 不能赋给 approval fact
const badApprovalFact: ApprovalDirectiveFact = decisionFact;
// @ts-expect-error I-1：approval fact 不能赋给 decision fact
const badDecisionFact: DecisionDirectiveFact = approvalFact;
const badApprovalSnapshot: ApprovalDirectiveSnapshot = {
  ledgerErrors: 0,
  // @ts-expect-error I-1：approval 快照不得包含 decision fact
  active: [decisionFact],
};
const badDecisionSnapshot: DecisionDirectiveSnapshot = {
  ledgerErrors: 0,
  // @ts-expect-error I-1：decision 快照不得包含 approval fact
  active: [approvalFact],
};
// @ts-expect-error §5.2：approval target 只能配 ApprovalAction（错误落在对象整体）
const badCreatedAction: DirectiveCreatedEventV1 = {
  ...createdBase,
  target: "approval",
  action: { kind: "select-option", selector: "方案 A" },
  scope: {},
};
const badCreatedScope: DirectiveCreatedEventV1 = {
  ...createdBase,
  target: "decision",
  action: { kind: "reject" },
  // @ts-expect-error §5.2：approval 的 scope 恒为 {}，decision 才允许 flowId
  scope: { flowId: "customer-authorization-plane", roleId: "implementer" },
};

void badPresented;
void badResolvedId;
void badVersionId;
void badDecidedBy;
void badUnavailable;
void badShell;
void badApprovalFact;
void badDecisionFact;
void badApprovalSnapshot;
void badDecisionSnapshot;
void badCreatedAction;
void badCreatedScope;
void b1Consumer;
void c1Consumer;

// —————————————— 运行时：Q9 形状与加法兼容 ——————————————

test("A1/Q9 A：RequestResolvedEvent 支持 directive 归属，旧事件无 directiveId 仍可读", () => {
  assert.equal(b1Consumer(directiveResolved), "d-1");
  assert.equal(b1Consumer(oldResolved), "none");
  assert.deepEqual(JSON.parse(JSON.stringify(directiveResolved)), directiveResolved);
  assert.deepEqual(JSON.parse(JSON.stringify(oldResolved)), oldResolved);
  assert.equal("directiveId" in (JSON.parse(JSON.stringify(oldResolved)) as object), false);
});

test("A1/Q9 A + P3.1：VersionDecisionEvent 保留旧来源并增加 chief-delegated", () => {
  assert.equal(decidedByText("customer"), "customer");
  assert.equal(decidedByText("judge"), "judge");
  assert.equal(decidedByText("directive"), "directive");
  assert.equal(decidedByText("chief-delegated"), "chief-delegated");
  assert.deepEqual(JSON.parse(JSON.stringify(directiveVersionDecision)), directiveVersionDecision);
  assert.deepEqual(JSON.parse(JSON.stringify(oldVersionDecision)), oldVersionDecision);
  assert.equal("directiveId" in (JSON.parse(JSON.stringify(oldVersionDecision)) as object), false);
});

test("A1/W-6：RequestPresentedEvent.to 仍为 customer|judge（不新增 directive 通道）", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(presentedEvent)), presentedEvent);
  assert.equal(Object.keys(presentedEvent).includes("directive"), false);
});

test("A1/§5.2：事件联合 JSON 往返形状稳定（created/consumed/revoked/expired）", () => {
  for (const event of [approvalCreated, decisionCreated, consumedEvent, revokedEvent, expiredEvent]) {
    assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
  }
  assert.equal(approvalCreated.target, "approval");
  assert.equal(decisionCreated.target, "decision");
  assert.equal(approvalCreated.rawText.includes("@审批"), true);
});

test("A1/§5.2：CustomerDirectiveView 形状与 JSON 往返", () => {
  assert.equal(view.consumer, "shell-gate");
  assert.equal(view.status, "active");
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});

test("A1/§6.4 I-1：target-scoped facts 快照只含本 target（运行时映射）", () => {
  assert.deepEqual(approvalSnapshot.active.map((fact) => fact.target), ["approval"]);
  assert.deepEqual(decisionSnapshot.active.map((fact) => fact.target), ["decision"]);
  assert.equal(approvalSnapshot.ledgerErrors, 0);
  assert.equal(decisionSnapshot.ledgerErrors, 0);
});

// —————————————— 常量单一来源 ——————————————

test("A1/P1-CAP-13：ID/路径/字段上限常量值冻结且为正整数", () => {
  assert.equal(CUSTOMER_DIRECTIVE_SCHEMA, "customer-directive/v1");
  assert.equal(CUSTOMER_DIRECTIVES_REL, ".ans/state/customer-directives.jsonl");
  assert.equal(CUSTOMER_DIRECTIVE_ID_PATTERN, "^d-[1-9][0-9]*$");
  const limits: Array<[string, number, number]> = [
    ["RAW_TEXT_MAX_BYTES", CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES, 4096],
    ["COMMAND_MAX_BYTES", CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES, 1024],
    ["HOST_MAX_LENGTH", CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH, 253],
    ["PATH_MAX_BYTES", CUSTOMER_DIRECTIVE_PATH_MAX_BYTES, 512],
    ["SELECTOR_MAX_BYTES", CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES, 256],
  ];
  for (const [name, value, expected] of limits) {
    assert.equal(value, expected, `${name} 值漂移`);
    assert.equal(Number.isInteger(value) && value > 0, true, `${name} 必须是正整数`);
  }
});

test("A1/§5.2：指令 ID 模式接受 d-1/d-999，拒绝 d-0/d-01/D-1/前缀", () => {
  const pattern = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);
  for (const id of ["d-1", "d-10", "d-999", "d-123456"]) {
    assert.equal(pattern.test(id), true, `应接受 ${id}`);
  }
  for (const id of ["d-0", "d-01", "D-1", "#d-1", "d-", "d-1x", "xd-1", "d-1\n"]) {
    assert.equal(pattern.test(id), false, `应拒绝 ${JSON.stringify(id)}`);
  }
});

test("A1/§5.2：flowId 校验仍来自 runtime.ts 的 GOVERNANCE_SLUG_PATTERN", () => {
  assert.equal(GOVERNANCE_SLUG_PATTERN, "^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$");
  const pattern = new RegExp(GOVERNANCE_SLUG_PATTERN);
  for (const flowId of ["customer-authorization-plane", "ab", "a-1"]) {
    assert.equal(pattern.test(flowId), true, `应接受 flowId ${flowId}`);
  }
  for (const flowId of ["a", "A-b", "a-", "-a", "a b"]) {
    assert.equal(pattern.test(flowId), false, `应拒绝 flowId ${flowId}`);
  }
});

test("A1/P1-CAP-13：常量/解析器/枚举在 A1 文件内单一来源，runtime/project-state 不反向依赖", async () => {
  const directiveSource = await readFile(sourceUrl("../../src/model/directive.ts"), "utf8");
  const runtimeSource = await readFile(sourceUrl("../../src/model/runtime.ts"), "utf8");
  const projectStateSource = await readFile(sourceUrl("../../src/model/project-state.ts"), "utf8");

  const constantNames = [
    "CUSTOMER_DIRECTIVE_SCHEMA",
    "CUSTOMER_DIRECTIVES_REL",
    "CUSTOMER_DIRECTIVE_ID_PATTERN",
    "CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES",
    "CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES",
    "CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH",
    "CUSTOMER_DIRECTIVE_PATH_MAX_BYTES",
    "CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES",
    "DIRECTIVE_HIGH_RISK_REASONS",
  ];
  for (const name of constantNames) {
    const definition = new RegExp(`export const ${name}\\b`, "g");
    assert.equal((directiveSource.match(definition) ?? []).length, 1, `${name} 必须恰有一处定义`);
    assert.equal(
      (runtimeSource.match(definition) ?? []).length,
      0,
      `${name} 不得在 runtime.ts 重复定义`,
    );
  }

  assert.equal(/export const GOVERNANCE_SLUG_PATTERN\b/.test(directiveSource), false);
  assert.equal((runtimeSource.match(/export const GOVERNANCE_SLUG_PATTERN\b/g) ?? []).length, 1);

  const importLines = directiveSource
    .split(/\r?\n/)
    .filter((line) => /^\s*import\b/.test(line));
  assert.equal(importLines.length, 3, "directive.ts 只允许 marker/runtime 的 3 条导入");
  for (const line of importLines) {
    assert.match(line, /from\s+"\.\/(directive-marker|runtime)\.ts"/);
  }
  assert.equal(/from\s+"\.\.\/(common|provider|service|pipeline|app)/.test(directiveSource), false);
  assert.equal(/from\s+"\.\/directive(?:-marker)?\.ts"/.test(runtimeSource), false);
  assert.equal(/from\s+"\.\/runtime\.ts"/.test(projectStateSource), false);
  assert.equal(/function\s+parseDirectiveMarker\s*\(/.test(directiveSource), false);
  assert.equal(/function\s+parseDirectiveMarker\s*\(/.test(runtimeSource), false);
});

// —————————————— 高危谓词真值表 ——————————————

function allowShell(command: string): ApprovalAction {
  return { kind: "allow", resource: { type: "shell", command, cwd: PROJECT_ROOT } };
}
function denyShell(command: string): ApprovalAction {
  return { kind: "deny", resource: { type: "shell", command, cwd: PROJECT_ROOT } };
}
function allowDomain(host: string): ApprovalAction {
  return {
    kind: "allow",
    resource: { type: "domain", host, wildcard: host === "*" || host.startsWith("*.") },
  };
}
function allowPath(path: string): ApprovalAction {
  return { kind: "allow", resource: { type: "path", path } };
}
function approvalRisk(
  action: ApprovalAction,
  until: CustomerDirectiveUntil = "session",
): DirectiveHighRiskReason[] {
  return directiveHighRiskReasons({ target: "approval", action, until, projectRoot: PROJECT_ROOT });
}
function decisionRisk(
  action: DecisionAction,
  scope: DirectiveScope = {},
  decisionGroupEnabled = true,
  until: CustomerDirectiveUntil = "session",
): DirectiveHighRiskReason[] {
  return directiveHighRiskReasons({
    target: "decision",
    action,
    scope,
    decisionGroupEnabled,
    until,
  });
}

test("A1/§4.3 高危：reason 码表顺序冻结（稳定持久值）", () => {
  assert.deepEqual([...DIRECTIVE_HIGH_RISK_REASONS], [
    "forever",
    "project-decision-reject",
    "project-decision-select-option",
    "wildcard-domain",
    "wide-path",
    "wide-command",
    "switch-off-project-recommended",
  ]);
});

test("A1/§4.3 高危：forever 对所有 target 成立", () => {
  assert.deepEqual(approvalRisk(allowShell("npm install"), "forever"), ["forever"]);
  assert.deepEqual(decisionRisk({ kind: "select-recommended" }, {}, true, "forever"), ["forever"]);
});

test("A1/§4.3 高危：项目级 decision reject/select-option 与 flow 收窄", () => {
  assert.deepEqual(decisionRisk({ kind: "reject" }), ["project-decision-reject"]);
  assert.deepEqual(decisionRisk({ kind: "reject" }, { flowId: "flow-a" }), []);
  assert.deepEqual(decisionRisk({ kind: "select-option", selector: "方案 A" }), [
    "project-decision-select-option",
  ]);
  assert.deepEqual(decisionRisk({ kind: "select-option", selector: "方案 A" }, { flowId: "flow-a" }), []);
  // 空 flowId 不是合法 slug；按无 flowId 处理（安全方向，最终由字段校验拒绝）。
  assert.deepEqual(decisionRisk({ kind: "reject" }, { flowId: "" }), ["project-decision-reject"]);
});

test("A1/§4.3 高危：通配域名（空/*/*. 前缀）", () => {
  for (const host of ["", "*", "*.example.com", "*.EXAMPLE.com"]) {
    assert.deepEqual(approvalRisk(allowDomain(host)), ["wildcard-domain"], `host=${JSON.stringify(host)}`);
  }
  for (const host of ["example.com", "sub.example.com", "127.0.0.1"]) {
    assert.deepEqual(approvalRisk(allowDomain(host)), [], `host=${JSON.stringify(host)}`);
  }
});

test("A1/§4.3 高危：宽路径（盘符根/根/ ** /项目根/项目根祖先）", () => {
  const widePaths = [
    "/",
    "\\",
    "C:",
    "C:/",
    "C:\\",
    "C:/work/**",
    "C:/work/proj/app",
    "C:/work/proj",
    "C:\\work\\proj",
  ];
  for (const path of widePaths) {
    assert.deepEqual(approvalRisk(allowPath(path)), ["wide-path"], `应判宽路径：${JSON.stringify(path)}`);
  }
  const narrowPaths = [
    "C:/work/proj/app/src",
    "C:\\work\\proj\\app\\docs",
    "C:/work/proj/app2",
    "D:/other",
  ];
  for (const path of narrowPaths) {
    assert.deepEqual(approvalRisk(allowPath(path)), [], `不应判宽路径：${JSON.stringify(path)}`);
  }
});

test("A1/§4.3 高危：宽命令（shell 元字符逐项）", () => {
  const wideCommands = [
    "npm install; rm -rf dist",
    "npm install && rm -rf dist",
    "npm install || true",
    "npm install | tee log",
    "npm install > out.log",
    "npm install < in.txt",
    "npm `whoami`",
    "npm $(whoami)",
    "npm *",
    "npm install\nrm -rf dist",
  ];
  for (const command of wideCommands) {
    assert.deepEqual(approvalRisk(allowShell(command)), ["wide-command"], `应判宽命令：${JSON.stringify(command)}`);
    assert.deepEqual(approvalRisk(denyShell(command)), ["wide-command"], `deny 同样判宽命令：${JSON.stringify(command)}`);
  }
  assert.deepEqual(approvalRisk(allowShell("npm install left-pad")), []);
});

test("A1/§4.3/Q7 A：开关关闭时项目级 select-recommended 属高危", () => {
  assert.deepEqual(decisionRisk({ kind: "select-recommended" }, {}, false), [
    "switch-off-project-recommended",
  ]);
  assert.deepEqual(decisionRisk({ kind: "select-recommended" }, {}, true), []);
  assert.deepEqual(decisionRisk({ kind: "select-recommended" }, { flowId: "flow-a" }, false), []);
});

test("A1/§4.3 非高危示例：精确命令/具体域名/具体目录 + once|session；单 flow 选择偏好", () => {
  assert.deepEqual(approvalRisk(allowShell("npm install left-pad"), "once"), []);
  assert.deepEqual(approvalRisk(denyShell("rm -rf dist"), "session"), []);
  assert.deepEqual(approvalRisk(allowDomain("registry.npmjs.org"), "session"), []);
  assert.deepEqual(approvalRisk(allowPath("C:/work/proj/app/docs"), "session"), []);
  assert.deepEqual(decisionRisk({ kind: "select-option", selector: "方案 A" }, { flowId: "flow-a" }), []);
  assert.deepEqual(decisionRisk({ kind: "reject" }, { flowId: "flow-a" }), []);
  assert.deepEqual(decisionRisk({ kind: "select-recommended" }, {}, true), []);
});

test("A1/§4.3 高危：多原因按表序返回且不重复", () => {
  assert.deepEqual(decisionRisk({ kind: "reject" }, {}, true, "forever"), [
    "forever",
    "project-decision-reject",
  ]);
  assert.deepEqual(
    decisionRisk({ kind: "select-recommended" }, {}, false, "forever"),
    ["forever", "switch-off-project-recommended"],
  );
  assert.deepEqual(approvalRisk(allowShell("npm *"), "forever"), ["forever", "wide-command"]);
  assert.deepEqual(approvalRisk(allowDomain("*.example.com"), "forever"), [
    "forever",
    "wildcard-domain",
  ]);
  assert.deepEqual(approvalRisk(allowPath("/"), "forever"), ["forever", "wide-path"]);
});
