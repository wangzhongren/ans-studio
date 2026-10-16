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
  const all = tools(allow, { shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }), customerInput: () => ({ outcome: "declined" }), reportHandback: () => {}, dispatchTask: () => {}, shellVerdict: () => {}, roleStatus: () => ({ ok: true, text: "stub" }), sessionTail: () => ({ ok: true, text: "stub" }), proposeRecovery: () => ({ outcome: "declined" }), installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }), uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }), installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }), uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }) });
  assert.equal(all.size, 16);
  for (const tool of all.values()) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length);
  }
  assert.equal(all.get("write_file")?.executionMode, "sequential");
  assert.equal(all.get("request_confirmation")?.executionMode, "sequential");
});

test("schema 文案（客户 2026-10-16 su 预置裁定配套）：request_confirmation 写明 su 专属例外，写盘确认必备语义保留", () => {
  const confirm = describeTool("request_confirmation");
  const text = [confirm.description, ...(confirm.promptGuidelines ?? [])].join("\n");
  // 例外与门禁引擎卡文本口径一致：仅内置治理角色 su；`docs/su/**`、`docs/contracts/**`、
  // `docs/skills/**`（G-4 扩列，2026-10-16 批准）与 `docs/mcp/**`（G-4 V2 扩列，2026-10-16
  // 「按推荐批准，开始实施」——编排预授权同批已落）已预置、免逐次确认、开会话与重建后均生效；
  // 四棵树之外的一切写盘仍须逐条确认——正向钉住「仅 su」限定句，防把非 su 角色带歪。
  assert.match(text, /唯一例外（仅内置治理角色 su）/);
  assert.match(text, /docs\/su\/\*\*/);
  assert.match(text, /docs\/contracts\/\*\*/);
  assert.match(text, /docs\/skills\/\*\*/, "G-4 扩列第三棵须点名");
  assert.match(text, /docs\/mcp\/\*\*/, "G-4 V2 扩列第四棵须点名（预授权扩列已由编排同批落地）");
  assert.match(text, /已预置/);
  assert.match(text, /写入这四棵目录树\*\*无需逐次确认\*\*/, "写入句须按四棵计数（与门禁引擎新卡文本同口径）");
  assert.match(text, /无需逐次确认/);
  assert.match(text, /开会话与重建后均生效/);
  assert.match(text, /四棵树之外的一切写盘仍须逐条确认/);
  assert.equal(/写入这三棵目录树|三棵树之外|两棵/.test(text), false, "旧「三棵/两棵」计数不得复现（防回退漂移）");
  // 必备语义逐字保留：写盘一律先经本工具确认 / preview 逐条列路径 / confirmed:true 唯一凭据 /
  // 未获同意不写盘 / 列出路径≠获准（后者即「列了不等于获准」，防反向措辞）。
  assert.match(text, /写盘一律先经本工具确认/);
  assert.match(text, /必须列出.*路径/);
  assert.match(text, /未列出的路径/);
  assert.match(text, /获准的唯一凭据是 `confirmed:true`/);
  assert.match(text, /未获同意/);
  assert.match(text, /不等于/);
});

test("schema 文案（G-1/A4）：dispatch_task 钉住「先落盘再派发」与「必读（按序）」按地址引用；必备语义逐字保留", () => {
  const dispatch = describeTool("dispatch_task");
  const text = [dispatch.description, ...(dispatch.promptGuidelines ?? [])].join("\n");
  // G-1 新增（设计 2026-10-16_design_contract-workflow-dispatch.md §四，A4）：多角色/跨角色协作先落盘再派发
  // （契约 docs/contracts/<name>-v<N>.md、工作流 docs/workflow.md）；任务文本按地址引用、不内嵌契约全文；
  // 「必读（按序）」块由投递系统附上、sha256 投递时算（su 不手算/不转抄）；契约缺失拒投（fail-closed）、
  // workflow 缺失降级（不拒投、如实标注）。
  assert.match(text, /先落盘再派发/, "须写明「先落盘再派发」");
  assert.match(text, /docs\/contracts\/<name>-v<N>\.md/, "须给出契约落盘位置的版本化命名");
  assert.match(text, /docs\/workflow\.md/, "须给出工作流落盘位置");
  assert.match(text, /按地址引用/, "任务文本须按地址引用契约与工作流");
  assert.match(text, /不内嵌契约全文/, "不得把契约全文内嵌进派发文本");
  assert.match(text, /必读（按序）/, "必读块名须为「必读（按序）」");
  assert.match(text, /先读完再动手/, "必读块语义：先读完再动手");
  assert.match(text, /不要自己算或转抄哈希/, "哈希由投递系统在投递时计算——su 不得手算/转抄");
  assert.match(text, /引用的契约文件不存在时投递会被\*\*拒绝\*\*/, "契约缺失须写明 fail-closed 拒投");
  assert.match(text, /不拒投/, "workflow.md 缺失须按降级口径（不拒投）");
  assert.match(text, /未提供/, "workflow.md 缺失须如实标注「未提供」");
  // 必备语义逐字保留（与 test/pi-adapter/dispatch-task.test.ts 的 H-1 断言面同源）：派发≠授权 /
  // 不代授权 / 任务自足三要素 / 返工带证据；反向断言不得暗示派发携带授权。
  assert.match(text, /派发 ≠ 授权/);
  assert.match(text, /自足/);
  assert.match(text, /看不到你的上下文/);
  assert.match(text, /返工/);
  assert.match(text, /不改变任何角色的写权/);
  assert.equal(
    /已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text),
    false,
    `不得暗示派发携带授权：${text}`,
  );
  // 参数形状与执行模式不变（只动文案，不动判定/权限）。
  assert.deepEqual(dispatch.parameters.required, ["roleId", "task"]);
  assert.equal(dispatch.executionMode, undefined);
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

test("shell exposes actual structured execution and observed collection truncation without parsing model text", async()=>{
  const root=await temp();try{
    const shell=tools(allow,{shellGate:async()=>({allow:true,by:'fixture'}),shellCwd:root}).get('run_shell')!;
    const failed=await shell.handler({name:'run_shell',args:{command:`${process.execPath} -e 'process.stdout.write("actual stdout");process.stderr.write("actual stderr");process.exit(7)'`}});
    assert.equal(failed.ok,false);assert.equal(failed.execution?.exitCode,7);assert.equal(failed.execution?.stdout,'actual stdout');assert.equal(failed.execution?.stderr,'actual stderr');
    assert.match(failed.message,/actual stdout/);assert.match(failed.message,/actual stderr/);
    const large=await shell.handler({name:'run_shell',args:{command:`${process.execPath} -e 'process.stdout.write("x".repeat(3000000))'`}});
    assert.equal(large.ok,true);assert.equal(large.execution?.stdoutTruncated,true);assert.ok(large.execution!.stdout!.length>=1048576);assert.ok(large.execution!.stdout!.length<3000000);
    const missing=await shell.handler({name:'run_shell',args:{command:'ans-no-such-executable-for-test'}});assert.equal(missing.ok,false);assert.equal(missing.execution?.exitCode,undefined);assert.ok(missing.execution?.error);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('accepted-memory report receipt states final persistence and delivery are still pending',async()=>{
 const report=tools(allow,{reportHandback:()=>({ok:true,state:'accepted-memory'})}).get('submit_report')!;
 const result=await report.handler({name:'submit_report',args:{status:'completed',summary:'candidate'}});
 assert.equal(result.ok,true);assert.match(result.message,/候选报告已收到/);assert.match(result.message,/最终保存与投递待本轮收口/);assert.ok(!result.message.includes('报告已交回'));
});
