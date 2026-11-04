// test/编排/customer-directive-interpret.test.ts
// 客户授权平面（2026-11-04 客户直修）：`@审批`/`@决策` 自然语言 → 判断 AI 解释 → 确认面板预填/回退。
//
// 覆盖（客户行为规格）：
//   · 自然语言 + 解释成功 ⇒ 面板预填 AI 解释（action/scope/until）、原文保留；确认前绝不落账；确认后落账；
//   · 结构化写法 ⇒ 既有确定性解析优先（解释器不被调用，向后兼容）；
//   · 解释失败/不可用/低置信/非法候选 ⇒ 回退现有行为（原文 + 未识别片段、确认禁用），不落账；
//   · 高危（forever/项目级）仍由预填复算并二次确认（未勾选 ⇒ high-risk-unacknowledged）；
//   · `撤销 …` 永不交解释器；未注入解释器时行为逐字不变；
//   · AI 给出的 shell.cwd 不被采信（恒为项目根）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CUSTOMER_DIRECTIVES_REL,
  type DirectiveInterpretFn,
  type DirectiveInterpretRequest,
} from "../../src/model/directive.ts";
import {
  createCustomerDirectiveRuntime,
  type CustomerDirectiveRuntime,
  type DirectiveConfirmationValues,
  type DirectivePresenter,
  type DirectivePresenterRequest,
  type SubmitFromInput,
} from "../../src/pipeline/orchestration/customer-directive.ts";

const NOW = () => new Date("2026-11-04T00:00:00.000Z");

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function ledgerEvents(root: string): Array<Record<string, unknown>> {
  const file = path.join(root, ...CUSTOMER_DIRECTIVES_REL.split("/"));
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function submitInput(
  root: string,
  target: "approval" | "decision",
  rawText: string,
): SubmitFromInput {
  return {
    rawText,
    target,
    projectRoot: root,
    roleId: "A",
    runtime: "claude",
    decisionGroupEnabled: true,
  };
}

function autoPresenter(capture: DirectivePresenterRequest[]): DirectivePresenter {
  return {
    async present(req) {
      capture.push(req);
      return {
        decision: "confirm",
        values: { action: req.prefill.action, scope: req.prefill.scope, until: req.prefill.until },
      };
    },
  };
}

function cancelPresenter(capture: DirectivePresenterRequest[]): DirectivePresenter {
  return {
    async present(req) {
      capture.push(req);
      return { decision: "cancel" };
    },
  };
}

function valuesOf(req: DirectivePresenterRequest, extra: Record<string, unknown> = {}): DirectiveConfirmationValues {
  return { action: req.prefill.action, scope: req.prefill.scope, until: req.prefill.until, ...extra } as DirectiveConfirmationValues;
}

function deferredPresenter(capture: DirectivePresenterRequest[]): {
  presenter: DirectivePresenter;
  release: (values: DirectiveConfirmationValues) => void;
} {
  let release: (values: DirectiveConfirmationValues) => void = () => undefined;
  const presenter: DirectivePresenter = {
    async present(req) {
      capture.push(req);
      return new Promise((resolve) => {
        release = (values) => resolve({ decision: "confirm", values });
      });
    },
  };
  return { presenter, release: (values) => release(values) };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor 超时");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createRuntime(
  root: string,
  presenter: DirectivePresenter,
  interpreter?: DirectiveInterpretFn,
): CustomerDirectiveRuntime {
  return createCustomerDirectiveRuntime({
    projectRoot: root,
    sessionId: "session-interpret-test",
    present: presenter,
    now: NOW,
    ...(interpreter !== undefined ? { interpretDirective: interpreter } : {}),
  });
}

// —————————————————— 1. 自然语言审批：预填/原文/确认前不落账/确认后落账 ——————————————————

test("自然语言审批：解释成功 ⇒ 面板预填 AI 解释、cwd 恒为项目根；确认前绝不落账；确认后 durable 落账", async () => {
  const t = tempDir("ans-directive-nl-approval-");
  try {
    const capture: DirectivePresenterRequest[] = [];
    const calls: DirectiveInterpretRequest[] = [];
    const interpreter: DirectiveInterpretFn = async (req) => {
      calls.push(req);
      return {
        ok: true,
        candidate: {
          action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "D:/模型胡写的目录" } },
          until: "session",
          confidence: 0.9,
          notes: "安装依赖",
        },
        confidence: 0.9,
        notes: "安装依赖",
      };
    };
    const { presenter, release } = deferredPresenter(capture);
    const runtime = createRuntime(t.dir, presenter, interpreter);
    const pending = runtime.submitFromInput(submitInput(t.dir, "approval", "@审批 让 npm install 跑一次"));
    await waitFor(() => capture.length === 1);

    assert.equal(calls.length, 1, "确定性解析不可确认 ⇒ 调用一次判断 AI");
    assert.deepEqual(calls[0], {
      target: "approval",
      body: "让 npm install 跑一次",
      rawText: "@审批 让 npm install 跑一次",
      projectRoot: t.dir,
      roleId: "A",
      runtime: "claude",
    });
    assert.deepEqual(ledgerEvents(t.dir), [], "客户确认前绝不落账");

    const req = capture[0]!;
    assert.equal(req.rawText, "@审批 让 npm install 跑一次");
    assert.equal(req.prefill.action.kind, "allow");
    const action = req.prefill.action as { kind: string; resource?: { type?: string; command?: string; cwd?: string } };
    assert.equal(action.resource?.type, "shell");
    assert.equal(action.resource?.command, "npm install");
    assert.equal(action.resource?.cwd, t.dir, "shell.cwd 不被模型采信，恒为项目根");
    assert.equal(req.prefill.until, "session");
    assert.deepEqual(req.prefill.unrecognized, []);
    assert.equal(req.confirmable, true);
    assert.deepEqual(req.highRisk.reasons, []);

    release(valuesOf(req));
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.id, /^d-[1-9][0-9]*$/);
    const events = ledgerEvents(t.dir);
    assert.equal(events.length, 1);
    const event = events[0] as { kind?: string; action?: { kind?: string; resource?: { command?: string } }; until?: string; rawText?: string };
    assert.equal(event.kind, "directive.created");
    assert.equal(event.action?.kind, "allow");
    assert.equal(event.action?.resource?.command, "npm install");
    assert.equal(event.until, "session");
    assert.equal(event.rawText, "@审批 让 npm install 跑一次");
    assert.equal(runtime.approvalFacts().active.length, 1);
  } finally {
    t.cleanup();
  }
});

// —————————————————— 2. 结构化写法向后兼容：解释器不被调用 ——————————————————

test("结构化写法：确定性解析 confirmable ⇒ 沿用，解释器不被调用（向后兼容）", async () => {
  const t = tempDir("ans-directive-nl-structured-");
  try {
    const capture: DirectivePresenterRequest[] = [];
    let calls = 0;
    const interpreter: DirectiveInterpretFn = async () => {
      calls += 1;
      return { ok: false, reasonCode: "unavailable" };
    };
    const runtime = createRuntime(t.dir, autoPresenter(capture), interpreter);
    const result = await runtime.submitFromInput(submitInput(t.dir, "approval", '@审批 允许 shell "echo hi" until=once'));
    assert.equal(result.ok, true);
    assert.equal(calls, 0, "结构化写法不调用判断 AI");
    const req = capture[0]!;
    assert.equal(req.prefill.until, "once");
    assert.equal((req.prefill.action as { resource?: { command?: string } }).resource?.command, "echo hi");
    assert.equal(req.confirmable, true);
    assert.deepEqual(req.prefill.unrecognized, []);
  } finally {
    t.cleanup();
  }
});

// —————————————————— 3. 失败/低置信/非法候选 ⇒ 回退且确认禁用 ——————————————————

test("解释失败/抛错/低置信/非法候选 ⇒ 回退现有行为（原文 + 未识别片段、确认禁用），不落账", async () => {
  const cases: Array<{ name: string; interpreter: DirectiveInterpretFn }> = [
    {
      name: "ok:false（low-confidence）",
      interpreter: async () => ({ ok: false, reasonCode: "low-confidence" }),
    },
    {
      name: "注入实现抛错",
      interpreter: async () => {
        throw new Error("模型不可用");
      },
    },
    {
      name: "非法候选（空命令）",
      interpreter: async () => ({
        ok: true,
        candidate: { action: { kind: "allow", resource: { type: "shell", command: "" } }, until: "session", confidence: 0.9 },
        confidence: 0.9,
      }),
    },
    {
      name: "ok:true 但低置信（宿主异常返回）",
      interpreter: async () => ({
        ok: true,
        candidate: { action: { kind: "allow", resource: { type: "shell", command: "npm install" } }, until: "session", confidence: 0.2 },
        confidence: 0.2,
      }),
    },
  ];
  for (const item of cases) {
    const t = tempDir("ans-directive-nl-fallback-");
    try {
      const capture: DirectivePresenterRequest[] = [];
      const runtime = createRuntime(t.dir, cancelPresenter(capture), item.interpreter);
      const result = await runtime.submitFromInput(submitInput(t.dir, "approval", "@审批 让 npm install 跑一次"));
      assert.deepEqual(result, { ok: false, error: "cancelled", directiveCancelled: true }, item.name);
      const req = capture[0]!;
      assert.equal(req.confirmable, false, `${item.name}：确认必须禁用`);
      assert.ok(req.prefill.unrecognized.includes("让 npm install 跑一次"), `${item.name}：回退显示未识别片段`);
      assert.equal((req.prefill.action as { resource?: { command?: string } }).resource?.command, "", item.name);
      assert.deepEqual(ledgerEvents(t.dir), [], `${item.name}：绝不落账`);
    } finally {
      t.cleanup();
    }
  }
});

// —————————————————— 4. 决策自然语言：select-recommended ——————————————————

test("决策自然语言：以后都选推荐项 ⇒ 预填 select-recommended，确认后落账", async () => {
  const t = tempDir("ans-directive-nl-decision-");
  try {
    const capture: DirectivePresenterRequest[] = [];
    const calls: DirectiveInterpretRequest[] = [];
    const interpreter: DirectiveInterpretFn = async (req) => {
      calls.push(req);
      return {
        ok: true,
        candidate: { action: { kind: "select-recommended" }, until: "session", confidence: 0.88 },
        confidence: 0.88,
      };
    };
    const runtime = createRuntime(t.dir, autoPresenter(capture), interpreter);
    const result = await runtime.submitFromInput(submitInput(t.dir, "decision", "@决策 以后都选推荐项"));
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.target, "decision");
    const req = capture[0]!;
    assert.deepEqual(req.prefill.action, { kind: "select-recommended" });
    assert.deepEqual(req.prefill.scope, {});
    assert.equal(req.prefill.until, "session");
    assert.deepEqual(req.prefill.unrecognized, []);
    assert.equal(req.confirmable, true);

    const events = ledgerEvents(t.dir);
    assert.equal(events.length, 1);
    const event = events[0] as { target?: string; action?: { kind?: string }; scope?: Record<string, unknown> };
    assert.equal(event.target, "decision");
    assert.equal(event.action?.kind, "select-recommended");
    assert.deepEqual(event.scope, {});
  } finally {
    t.cleanup();
  }
});

// —————————————————— 5. 高危（forever）由 AI 预填复算，二次确认保留 ——————————————————

test("AI 预填 forever + flow 范围 ⇒ 高危原因复算；未勾选确认 ⇒ high-risk-unacknowledged（不落账）", async () => {
  const t = tempDir("ans-directive-nl-high-risk-");
  try {
    const interpreter: DirectiveInterpretFn = async () => ({
      ok: true,
      candidate: {
        action: { kind: "select-option", selector: "方案 B" },
        scope: { flowId: "flow-a" },
        until: "forever",
        confidence: 0.8,
      },
      confidence: 0.8,
    });

    const captureNoAck: DirectivePresenterRequest[] = [];
    const noAckPresenter: DirectivePresenter = {
      async present(req) {
        captureNoAck.push(req);
        return { decision: "confirm", values: valuesOf(req) };
      },
    };
    const noAck = createRuntime(t.dir, noAckPresenter, interpreter);
    const rejected = await noAck.submitFromInput(submitInput(t.dir, "decision", "@决策 以后都选方案 B，长期有效"));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error, "high-risk-unacknowledged");
    assert.deepEqual(ledgerEvents(t.dir), [], "未勾选高危确认 ⇒ 不落账");
    const req = captureNoAck[0]!;
    assert.deepEqual(req.prefill.action, { kind: "select-option", selector: "方案 B" });
    assert.deepEqual(req.prefill.scope, { flowId: "flow-a" });
    assert.equal(req.prefill.until, "forever");
    assert.deepEqual(req.highRisk.reasons, ["forever"], "AI 预填同样走既有高危谓词");

    const captureAck: DirectivePresenterRequest[] = [];
    const ackPresenter: DirectivePresenter = {
      async present(req) {
        captureAck.push(req);
        return { decision: "confirm", values: valuesOf(req, { acknowledged: true }) };
      },
    };
    const ack = createRuntime(t.dir, ackPresenter, interpreter);
    const accepted = await ack.submitFromInput(submitInput(t.dir, "decision", "@决策 以后都选方案 B，长期有效"));
    assert.equal(accepted.ok, true);
    const events = ledgerEvents(t.dir);
    assert.equal(events.length, 1);
    const event = events[0] as { until?: string; highRisk?: { reasons?: string[]; acknowledged?: boolean } };
    assert.equal(event.until, "forever");
    assert.deepEqual(event.highRisk?.reasons, ["forever"]);
    assert.equal(event.highRisk?.acknowledged, true);
  } finally {
    t.cleanup();
  }
});

// —————————————————— 6. 撤销永不交解释器 ——————————————————

test("撤销正文（撤销 #d-1 / 撤销）永不交解释器；B1 直调仍按现有面板原文 fail-closed", async () => {
  for (const rawText of ["@审批 撤销 #d-1", "@审批 撤销"]) {
    const t = tempDir("ans-directive-nl-revoke-");
    try {
      const capture: DirectivePresenterRequest[] = [];
      let calls = 0;
      const interpreter: DirectiveInterpretFn = async () => {
        calls += 1;
        return { ok: false, reasonCode: "unavailable" };
      };
      const runtime = createRuntime(t.dir, cancelPresenter(capture), interpreter);
      const result = await runtime.submitFromInput(submitInput(t.dir, "approval", rawText));
      assert.deepEqual(result, { ok: false, error: "cancelled", directiveCancelled: true });
      assert.equal(calls, 0, `${rawText}：撤销永不交解释器`);
      const req = capture[0]!;
      assert.equal(req.confirmable, false);
      assert.ok(req.prefill.unrecognized.length > 0);
      assert.deepEqual(ledgerEvents(t.dir), []);
    } finally {
      t.cleanup();
    }
  }
});

// —————————————————— 7. 未注入解释器：现有行为逐字不变 ——————————————————

test("未注入解释器：自然语言仍走现有面板（原文 + 未识别片段、确认禁用）", async () => {
  const t = tempDir("ans-directive-nl-absent-");
  try {
    const capture: DirectivePresenterRequest[] = [];
    const runtime = createRuntime(t.dir, cancelPresenter(capture));
    const result = await runtime.submitFromInput(submitInput(t.dir, "approval", "@审批 让 npm install 跑一次"));
    assert.deepEqual(result, { ok: false, error: "cancelled", directiveCancelled: true });
    const req = capture[0]!;
    assert.equal(req.confirmable, false);
    assert.ok(req.prefill.unrecognized.includes("让 npm install 跑一次"));
    assert.deepEqual(ledgerEvents(t.dir), []);
  } finally {
    t.cleanup();
  }
});
