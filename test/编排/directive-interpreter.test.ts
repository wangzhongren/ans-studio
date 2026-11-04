// test/编排/directive-interpreter.test.ts
// 客户授权平面（2026-11-04 客户直修）：`@审批`/`@决策` 自然语言解释器驱动的定向单测。
//
// 覆盖（客户行为规格）：
//   · 严格 JSON（action/resource 或 selector/reject、until、confidence/notes）→ ok；
//   · 代码围栏可接受；夹带解释/缺 confidence ⇒ parse-failed；
//   · 低置信 ⇒ low-confidence；超时 ⇒ timeout；预中止 ⇒ aborted；demo ⇒ unsupported-engine；
//   · 驱动不外抛：bind 抛错 ⇒ unavailable；
//   · 无副作用：deny-all 写门禁 + persistSession:false + 判断会话 dispose；
//   · 提示词只含本次原文/正文，且明确「只输出严格 JSON」。

import test from "node:test";
import assert from "node:assert/strict";

import {
  createDirectiveInterpreter,
  DIRECTIVE_INTERPRET_MIN_CONFIDENCE,
  type CreateDirectiveInterpreterOptions,
} from "../../src/common/编排/directive-interpreter.ts";
import type {
  DirectiveInterpretRequest,
  DirectiveInterpretFn,
} from "../../src/model/directive.ts";
import type { RuntimeKind, WriteGate } from "../../src/model/runtime.ts";
import type {
  AdapterCapabilities,
  RuntimeAdapterFactory,
} from "../../src/pipeline/orchestration/run-role.ts";

interface Seen {
  gate?: WriteGate;
  capabilities?: AdapterCapabilities;
  prompts: string[];
  disposed: number;
}

function fakeFactory(script: {
  messages?: string[];
  neverSettle?: boolean;
  failBind?: boolean;
}): { factory: RuntimeAdapterFactory; seen: Seen } {
  const seen: Seen = { prompts: [], disposed: 0 };
  const factory: RuntimeAdapterFactory = (gate, capabilities) => {
    seen.gate = gate;
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        if (script.failBind === true) throw new Error("模拟 bindRole 失败");
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
          },
          async *events() {
            for (const message of script.messages ?? []) {
              yield { kind: "message" as const, summary: message };
            }
            if (script.neverSettle !== true) {
              yield { kind: "settled" as const, summary: "settled" };
            } else {
              // 模拟判断会话永不 settle（直到驱动超时中止）。
              await new Promise<void>(() => undefined);
            }
          },
          async dispose() {
            seen.disposed += 1;
          },
          async abort() {},
        };
      },
    };
  };
  return { factory, seen };
}

function makeInterpreter(
  script: Parameters<typeof fakeFactory>[0],
  overrides: Partial<CreateDirectiveInterpreterOptions> = {},
): { interpreter: DirectiveInterpretFn; seen: Seen } {
  const { factory, seen } = fakeFactory(script);
  const interpreter = createDirectiveInterpreter({
    project: { projectRoot: process.cwd(), skillRoot: process.cwd(), roles: {} },
    runtime: "claude",
    createAdapter: factory,
    timeoutMs: 500,
    ...overrides,
  });
  return { interpreter, seen };
}

function approvalRequest(over: Partial<DirectiveInterpretRequest> = {}): DirectiveInterpretRequest {
  return {
    target: "approval",
    body: "让 npm install 跑一次",
    rawText: "@审批 让 npm install 跑一次",
    projectRoot: "C:/proj",
    roleId: "A",
    runtime: "claude",
    ...over,
  };
}

function decisionRequest(over: Partial<DirectiveInterpretRequest> = {}): DirectiveInterpretRequest {
  return {
    target: "decision",
    body: "以后都选推荐项",
    rawText: "@决策 以后都选推荐项",
    projectRoot: "C:/proj",
    roleId: "A",
    runtime: "claude",
    ...over,
  };
}

const APPROVAL_JSON = JSON.stringify({
  action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "C:/proj" } },
  until: "once",
  confidence: 0.92,
  notes: "安装依赖",
});

test("approval：严格 JSON ⇒ ok（candidate/confidence/notes）；deny-all 写门禁 + persistSession:false + dispose", async () => {
  const { interpreter, seen } = makeInterpreter({ messages: [APPROVAL_JSON] });
  const result = await interpreter(approvalRequest());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.candidate, {
    action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "C:/proj" } },
    until: "once",
    confidence: 0.92,
    notes: "安装依赖",
  });
  assert.equal(result.confidence, 0.92);
  assert.equal(result.notes, "安装依赖");

  assert.ok(seen.gate, "驱动必须把 deny-all 写门禁交给适配器");
  const gateResult = seen.gate!({ roleId: "A", path: "src/app.ts", intent: "write" } as never);
  assert.equal(gateResult.allowed, false, "解释会话绝不能写盘");
  assert.equal(seen.capabilities?.persistSession, false, "解释会话不持久化");
  assert.equal(seen.capabilities?.shellJudge, undefined, "解释会话不注入 judge 工具能力");
  assert.equal(seen.capabilities?.governanceJudge, undefined, "解释会话不注入 judge 工具能力");
  assert.ok(seen.disposed >= 1, "会话必须 dispose");
  assert.equal(seen.prompts.length, 1);
  assert.match(seen.prompts[0]!, /@审批 让 npm install 跑一次/);
  assert.match(seen.prompts[0]!, /让 npm install 跑一次/);
  assert.match(seen.prompts[0]!, /只输出严格 JSON/);
});

test("decision：select-option/scope/forever 原样交回（语义校验在编排预填构造）", async () => {
  const message = JSON.stringify({
    action: { kind: "select-option", selector: "方案 B" },
    scope: { flowId: "flow-a" },
    until: "forever",
    confidence: 0.8,
  });
  const { interpreter } = makeInterpreter({ messages: [message] });
  const result = await interpreter(decisionRequest());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.candidate, {
    action: { kind: "select-option", selector: "方案 B" },
    scope: { flowId: "flow-a" },
    until: "forever",
    confidence: 0.8,
  });
});

test("代码围栏 JSON 可接受；夹带解释/缺失 confidence ⇒ parse-failed", async () => {
  const fenced = ["```json", APPROVAL_JSON, "```"].join("\n");
  const ok = await makeInterpreter({ messages: [fenced] }).interpreter(approvalRequest());
  assert.equal(ok.ok, true);

  const prose = await makeInterpreter({ messages: [`好的，结果如下：${APPROVAL_JSON}`] }).interpreter(approvalRequest());
  assert.equal(prose.ok, false);
  if (prose.ok) return;
  assert.equal(prose.reasonCode, "parse-failed");

  const missingConfidence = await makeInterpreter({
    messages: ['{"action":{"kind":"allow","resource":{"type":"shell","command":"npm install","cwd":"C:/proj"}},"until":"once"}'],
  }).interpreter(approvalRequest());
  assert.equal(missingConfidence.ok, false);
  if (missingConfidence.ok) return;
  assert.equal(missingConfidence.reasonCode, "parse-failed");
});

test("低置信 ⇒ low-confidence（阈值以下一律不预填）", async () => {
  const message = JSON.stringify({
    action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "C:/proj" } },
    until: "session",
    confidence: DIRECTIVE_INTERPRET_MIN_CONFIDENCE - 0.01,
  });
  const { interpreter } = makeInterpreter({ messages: [message] });
  const result = await interpreter(approvalRequest());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reasonCode, "low-confidence");
});

test("unsupported-engine（demo）⇒ 不建会话、不调适配器", async () => {
  const { interpreter, seen } = makeInterpreter({ messages: [APPROVAL_JSON] }, { runtime: "demo" as RuntimeKind });
  const result = await interpreter(approvalRequest({ runtime: "demo" as RuntimeKind }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reasonCode, "unsupported-engine");
  assert.equal(seen.gate, undefined);
  assert.deepEqual(seen.prompts, []);
});

test("超时 ⇒ timeout（会话不 settle 时 fail-closed）", async () => {
  const { interpreter } = makeInterpreter({ neverSettle: true }, { timeoutMs: 30 });
  const started = Date.now();
  const result = await interpreter(approvalRequest());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reasonCode, "timeout");
  assert.ok(Date.now() - started < 2_000, "超时后必须及时返回");
});

test("预中止信号 ⇒ aborted（不建会话）", async () => {
  const { interpreter, seen } = makeInterpreter({ messages: [APPROVAL_JSON] });
  const controller = new AbortController();
  controller.abort();
  const result = await interpreter(approvalRequest(), controller.signal);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reasonCode, "aborted");
  assert.equal(seen.gate, undefined);
});

test("驱动不外抛：bindRole 抛错 ⇒ unavailable", async () => {
  const { interpreter } = makeInterpreter({ failBind: true });
  const result = await interpreter(approvalRequest());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reasonCode, "unavailable");
});

test("上下文缺失：空正文/非法 target ⇒ context-missing", async () => {
  const { interpreter } = makeInterpreter({ messages: [APPROVAL_JSON] });
  const empty = await interpreter(approvalRequest({ body: "   ", rawText: "@审批   " }));
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reasonCode, "context-missing");

  const badTarget = await interpreter(approvalRequest({ target: "bogus" as never }));
  assert.equal(badTarget.ok, false);
  if (!badTarget.ok) assert.equal(badTarget.reasonCode, "context-missing");
});
