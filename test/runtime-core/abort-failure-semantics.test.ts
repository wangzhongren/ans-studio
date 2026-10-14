import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow, until } from "./fixtures.ts";

const cases = [
  { name: "request_confirmation", args: { title: "confirm" }, phrase: /未获客户同意/ },
  { name: "request_choice", args: { title: "choose", options: [{ id: "a", label: "A" }] }, phrase: /未获客户同意/ },
  { name: "submit_report", args: { status: "completed", summary: "done" }, phrase: /未能交回/ },
  { name: "report_shell_verdict", args: { verdict: "allow" }, phrase: /未能交回/ },
  { name: "dispatch_task", args: { roleId: "target", task: "scoped work" }, phrase: /未能派发/ },
  { name: "run_shell", args: { command: `${process.execPath} -e 'process.stdout.write("must-not-execute")'` }, phrase: /未执行/ },
] as const;

test("pre-aborted public tools retain specific failure semantics and invoke no capability", async () => {
  let calls = 0;
  const byName = new Map(buildGovernedTools(allow, {
    customerInput: () => { calls++; return { outcome: "answered", value: { confirmed: true, selected: ["a"] } }; },
    reportHandback: () => { calls++; return { ok: true }; },
    dispatchTask: () => { calls++; return { ok: true }; },
    shellVerdict: () => { calls++; },
    shellGate: async () => { calls++; return { allow: true, by: "fixture" }; },
  }).map((tool) => [tool.name, tool]));
  const controller = new AbortController(); controller.abort();
  for (const item of cases) {
    const result = await byName.get(item.name)!.handler({ name: item.name, args: item.args, signal: controller.signal });
    assert.equal(result.ok, false, item.name); assert.match(result.message, item.phrase, item.name);
  }
  assert.equal(calls, 0);
});

test("abort during public capability waits keeps actual handler failure wording instead of generic cancellation", async () => {
  for (const item of cases) {
    let entered = false;
    const waiting = <T>(): Promise<T> => { entered = true; return new Promise<T>(() => {}); };
    const byName = new Map(buildGovernedTools(allow, {
      customerInput: () => waiting(), reportHandback: () => waiting(), dispatchTask: () => waiting(),
      shellVerdict: () => waiting(), shellGate: () => waiting(),
    }).map((tool) => [tool.name, tool]));
    const controller = new AbortController();
    const run = byName.get(item.name)!.handler({ name: item.name, args: item.args, signal: controller.signal });
    await until(() => entered); controller.abort();
    const result = await run;
    assert.equal(result.ok, false, item.name); assert.match(result.message, item.phrase, item.name);
    assert.ok(!result.message.includes("操作未获本轮成功回执"));
  }
});

test("success received as cancellation arrives is still converted to the tool-specific failure", async () => {
  for (const item of cases.filter((item) => ["request_confirmation", "request_choice", "submit_report", "dispatch_task"].includes(item.name))) {
    const controller = new AbortController();
    const byName = new Map(buildGovernedTools(allow, {
      customerInput: (request) => request.kind === "confirm"
        ? { outcome: "answered", value: { get confirmed() { controller.abort(); return true; } } }
        : { outcome: "answered", value: { get selected() { controller.abort(); return ["a"]; } } },
      reportHandback: () => ({ get ok() { controller.abort(); return true; } }),
      dispatchTask: () => ({ get ok() { controller.abort(); return true; } }),
    }).map((tool) => [tool.name, tool]));
    const result = await byName.get(item.name)!.handler({ name: item.name, args: item.args, signal: controller.signal });
    assert.equal(controller.signal.aborted, true); assert.equal(result.ok, false, item.name); assert.match(result.message, item.phrase, item.name);
  }
});
