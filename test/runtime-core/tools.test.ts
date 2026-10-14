import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools, buildShellEnv } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { GovernedToolsOptions, WriteGate } from "../../src/model/runtime.ts";
import { allow, deny, until } from "./fixtures.ts";

const tools = (gate: WriteGate, options?: GovernedToolsOptions) => new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-runtime-core-"));

test("Model/schema: required write/edit fields, optionals, unknown names and injected capabilities", () => {
  assert.deepEqual(describeTool("write_file").parameters.required, ["path", "content"]);
  assert.deepEqual(describeTool("edit_file").parameters.required, ["path", "old_string", "new_string"]);
  assert.deepEqual(describeTool("submit_report").parameters.required, ["status", "summary"]);
  assert.deepEqual(describeTool("read_file").parameters.required, ["path"]);
  assert.throws(() => describeTool("native_shell"), /未知/);
  assert.deepEqual([...tools(allow).keys()], ["write_file", "edit_file", "read_file"]);
  const all = tools(allow, { shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }), customerInput: () => ({ outcome: "declined" }), reportHandback: () => {}, dispatchTask: () => {}, shellVerdict: () => {} });
  assert.equal(all.size, 9);
  for (const tool of all.values()) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length);
  }
  assert.equal(all.get("write_file")?.executionMode, "sequential");
  assert.equal(all.get("request_confirmation")?.executionMode, "sequential");
});

test("gate deny/throw and gate-triggered abort produce zero filesystem effects", async () => {
  const root = await temp();
  try {
    for (const gate of [deny, (() => { throw new Error("gate failed"); }) as WriteGate]) {
      const result = await tools(gate, { writeRoot: root }).get("write_file")!.handler({ name: "write_file", args: { path: "nested/file.txt", content: "x" } });
      assert.equal(result.ok, false);
      assert.deepEqual(await readdir(root), []);
    }
    const controller = new AbortController();
    const gate: WriteGate = (target) => { controller.abort(); return allow(target); };
    const result = await tools(gate, { writeRoot: root }).get("write_file")!.handler({ name: "write_file", args: { path: "nested/file.txt", content: "x" }, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("real write/edit preserves UTF-8 BOM/CRLF and rejects missing match or symlink escape", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    const byName = tools(allow, { writeRoot: root, readRoot: root });
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "file.txt", content: "\uFEFFone\r\ntwo\r\n" } })).ok, true);
    assert.equal((await byName.get("edit_file")!.handler({ name: "edit_file", args: { path: "file.txt", old_string: "two", new_string: "three" } })).ok, true);
    assert.equal(await readFile(path.join(root, "file.txt"), "utf8"), "\uFEFFone\r\nthree\r\n");
    assert.equal((await byName.get("edit_file")!.handler({ name: "edit_file", args: { path: "file.txt", old_string: "absent", new_string: "x" } })).ok, false);
    await symlink(outside, path.join(root, "link"), "dir");
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "link/escape.txt", content: "x" } })).ok, false);
    assert.deepEqual(await readdir(outside), []);
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "missing.txt" } })).ok, false);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("pre-aborted edit and capability handlers never run or mutate", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "file.txt"), "original");
    let called = false;
    const controller = new AbortController(); controller.abort();
    const byName = tools(allow, { writeRoot: root, customerInput: () => { called = true; return { outcome: "answered", value: { confirmed: true } }; }, reportHandback: () => { called = true; } });
    for (const [name, args] of [["edit_file", { path: "file.txt", old_string: "original", new_string: "changed" }], ["request_confirmation", { title: "confirm" }], ["submit_report", { status: "completed", summary: "done" }]] as const) {
      assert.equal((await byName.get(name)!.handler({ name, args, signal: controller.signal })).ok, false);
    }
    assert.equal(called, false);
    assert.equal(await readFile(path.join(root, "file.txt"), "utf8"), "original");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shell gate deny/throw/timeout have no effects; explicit allow runs argv without shell", async () => {
  const root = await temp();
  try {
    for (const shellGate of [async () => ({ allow: false as const, by: "fixture", reason: "deny" }), async () => { throw new Error("fail"); }, async () => new Promise<never>(() => {})]) {
      const result = await tools(allow, { shellGate, shellCwd: root, shellReviewTimeoutMs: 10 }).get("run_shell")!.handler({ name: "run_shell", args: { command: `${process.execPath} -e 'require("fs").writeFileSync("evil.txt","x")'` } });
      assert.equal(result.ok, false);
      assert.deepEqual(await readdir(root), []);
    }
    let reviewed = false;
    const result = await tools(allow, { shellGate: async (request) => { reviewed = true; assert.equal(request.cwd, root); assert.equal(request.toolCallId, "shell-1"); return { allow: true, by: "fixture" }; }, shellCwd: root }).get("run_shell")!.handler({ name: "run_shell", args: { command: `${process.execPath} -e 'process.stdout.write("ok")'` }, toolCallId: "shell-1" });
    assert.equal(reviewed, true);
    assert.equal(result.ok, true);
    assert.match(result.message, /stdout:\nok/);
    assert.equal(buildShellEnv({ CODEX_API_KEY: "secret", openai_api_key: "secret", PATH: "/bin" }).CODEX_API_KEY, undefined);
    assert.deepEqual(buildShellEnv({ CODEX_ACCESS_TOKEN: "fake", PATH: "/bin" }), { PATH: "/bin" });
    assert.deepEqual(buildShellEnv({ MY_CUSTOM_KEY: "fake", PATH: "/bin" }, ["my_custom_key"]), { PATH: "/bin" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("abort running shell kills child before delayed write and returns failure", async () => {
  const root = await temp();
  try {
    const controller = new AbortController();
    const handler = tools(allow, { shellGate: async () => ({ allow: true, by: "fixture" }), shellCwd: root }).get("run_shell")!.handler;
    const result = handler({ name: "run_shell", args: { command: `${process.execPath} -e 'process.on("SIGTERM",()=>{});require("fs").writeFileSync("started","x");setTimeout(()=>require("fs").writeFileSync("late","x"),400)'` }, signal: controller.signal });
    await until(() => existsSync(path.join(root, "started")));
    // The child writes its start marker before waiting; filesystem poll keeps this deterministic.
    controller.abort();
    assert.equal((await result).ok, false);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.ok(!(await readdir(root)).includes("late"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("customer decline/abort and failed handbacks are honest; report/dispatch carry captured turn", async () => {
  const declined = await tools(allow, { customerInput: () => ({ outcome: "declined" }) }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "confirm" } });
  assert.equal(declined.ok, false); assert.match(declined.message, /未获客户同意/);
  let reply!: (value: { outcome: "answered"; value: { confirmed: true } }) => void;
  const controller = new AbortController();
  const awaiting = tools(allow, { customerInput: () => new Promise((resolve) => { reply = resolve; }) }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "confirm" }, signal: controller.signal });
  await until(() => reply !== undefined); controller.abort();
  assert.equal((await awaiting).ok, false); reply({ outcome: "answered", value: { confirmed: true } });
  let metadata: unknown;
  const byName = tools(allow, { currentTurnId: () => "turn-1", roleId: "core", runtime: "codex", reportHandback: (_report, meta) => { metadata = meta; return { ok: false, message: "rejected" }; }, dispatchTask: (_task, meta) => { metadata = meta; return { ok: true }; }, shellVerdict: () => { throw new Error("unavailable"); } });
  assert.equal((await byName.get("submit_report")!.handler({ name: "submit_report", args: { status: "completed", summary: "done" } })).ok, false);
  assert.deepEqual(metadata, { turnId: "turn-1", roleId: "core", runtime: "codex" });
  assert.equal((await byName.get("dispatch_task")!.handler({ name: "dispatch_task", args: { roleId: "target", task: "do scoped work" } })).ok, true);
  assert.deepEqual(metadata, { turnId: "turn-1", roleId: "core", runtime: "codex" });
  assert.equal((await byName.get("report_shell_verdict")!.handler({ name: "report_shell_verdict", args: { verdict: "allow" } })).ok, false);
  const legacy = tools(allow, { currentTurnId: () => "legacy", reportHandback: (_report, meta) => { metadata = meta; } });
  await legacy.get("submit_report")!.handler({ name: "submit_report", args: { status: "completed", summary: "done" } });
  assert.deepEqual(metadata, { turnId: "legacy" });
});
