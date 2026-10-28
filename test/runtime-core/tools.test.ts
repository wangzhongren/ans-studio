import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools, buildShellEnv } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { CustomerInputOutcome, GovernedToolsOptions, WriteGate } from "../../src/model/runtime.ts";
import { allow, deny, until } from "./fixtures.ts";

const tools = (gate: WriteGate, options?: GovernedToolsOptions) => new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-runtime-core-"));

test("Model/schema: required write/edit fields, optionals, unknown names and injected capabilities", () => {
  assert.deepEqual(describeTool("write_file").parameters.required, ["path", "content"]);
  assert.deepEqual(describeTool("edit_file").parameters.required, ["path", "old_string", "new_string"]);
  assert.deepEqual(describeTool("submit_report").parameters.required, ["status", "summary"]);
  assert.deepEqual(describeTool("read_file").parameters.required, ["path"]);
  assert.deepEqual(describeTool("list_dir").parameters.required, []);
  assert.throws(() => describeTool("native_shell"), /未知/);
  assert.deepEqual([...tools(allow).keys()], ["write_file", "edit_file", "read_file", "list_dir"]);
  const all = tools(allow, { shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }), customerInput: () => ({ outcome: "declined" }), reportHandback: () => {}, dispatchTask: () => {}, shellVerdict: () => {}, roleStatus: () => ({ ok: true, text: "stub" }), sessionTail: () => ({ ok: true, text: "stub" }), proposeRecovery: () => ({ outcome: "declined" }), installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }), uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }), installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }), uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }) });
  assert.equal(all.size, 17);
  for (const tool of all.values()) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length);
  }
  assert.equal(all.get("write_file")?.executionMode, "sequential");
  assert.equal(all.get("request_confirmation")?.executionMode, "sequential");
});

test("schema 文案（客户 2026-10-16 su 预置裁定 + 2026-10-25 边界直写新规则）：request_confirmation 写明 su 专属预授权例外与治理敏感场景，写盘确认必备语义保留", () => {
  const confirm = describeTool("request_confirmation");
  const text = [confirm.description, ...(confirm.promptGuidelines ?? [])].join("\n");
  // 例外与门禁引擎卡文本口径一致：仅内置治理角色 su；`docs/su/**`、`docs/contracts/**`、
  // `docs/skills/**`（G-4 扩列，2026-10-16 批准）与 `docs/mcp/**`（G-4 V2 扩列，2026-10-16
  // 「按推荐批准，开始实施」——编排预授权同批已落）已预置、免逐次确认、开会话与重建后均生效；
  // 四棵树之外的治理敏感写盘仍须逐条确认——正向钉住「仅 su」限定句，防把非 su 角色带歪。
  assert.match(text, /治理写盘的预授权例外（仅内置治理角色 su）/);
  assert.match(text, /docs\/su\/\*\*/);
  assert.match(text, /docs\/contracts\/\*\*/);
  assert.match(text, /docs\/skills\/\*\*/, "G-4 扩列第三棵须点名");
  assert.match(text, /docs\/mcp\/\*\*/, "G-4 V2 扩列第四棵须点名（预授权扩列已由编排同批落地）");
  assert.match(text, /已预置/);
  assert.match(text, /写入这四棵目录树\*\*无需逐次确认\*\*/, "写入句须按四棵计数（与门禁引擎新卡文本同口径）");
  assert.match(text, /无需逐次确认/);
  assert.match(text, /开会话与重建后均生效/);
  assert.match(text, /四棵树之外的\*\*治理敏感写盘\*\*仍按既有规则逐条确认/);
  assert.equal(/写入这三棵目录树|三棵树之外|两棵/.test(text), false, "旧「三棵/两棵」计数不得复现（防回退漂移）");
  // 2026-10-25 客户新规则：边界（Section 1）内普通写盘是预授权、直接写；本工具**不是**每次写盘的
  // 前置步骤，只用于治理敏感写入 / 需要客户决定的动作。反向钉住旧的全量措辞不得复现。
  assert.match(text, /不是边界内普通写盘的前置步骤/);
  assert.match(text, /治理敏感写入/);
  assert.match(text, /角色卡 \/ 边界 \/ 共享目录 \/ 治理写集/, "须点名保留确认的治理敏感场景");
  assert.match(text, /需要客户决定的动作/);
  assert.match(text, /边界（Section 1 白名单）内的写入是预授权/);
  assert.match(text, /不需要\*\*本工具逐次确认/);
  assert.equal(/写盘一律先经本工具确认|每次写盘必经|写盘前必须先用 `request_confirmation`/.test(text), false, "旧「每次写盘必经确认」措辞不得复现");
  // 必备语义逐字保留：preview 逐条列路径 / confirmed:true 唯一凭据 /
  // 未获同意不写盘 / 列出路径≠获准（后者即「列了不等于获准」，防反向措辞）。
  assert.match(text, /必须列出.*路径/);
  assert.match(text, /未列出的路径/);
  assert.match(text, /获准的唯一凭据是 `confirmed:true`/);
  assert.match(text, /未获同意/);
  assert.match(text, /不等于/);
  // 2026-10-19 编排侧「呈现前 preview 完整性闸」（真机 op-2）配套：写盘卡应给显式 paths，
  // preview 为**每一条**路径给出可核对正文/结构（标题/围栏说明作锚点 + 非空正文）；缺失时
  // 系统在呈现前拒绝、不给客户看半张卡——正向钉住组卡指引，防描述回退。
  assert.match(text, /显式 `paths`/, "写盘卡应提供显式 paths");
  assert.match(text, /每一条/, "须要求逐路径（每一条）给出正文/结构");
  assert.match(text, /### <路径>/, "须给出 Markdown 标题锚点示例");
  assert.match(text, /代码围栏说明/, "须说明代码围栏说明也可作锚点");
  assert.match(text, /锚点后紧跟.*非空正文\/代码/, "锚点后须紧跟非空正文/代码");
  assert.match(text, /写入内容须与.*一致/, "写入内容须与预览正文一致");
  assert.match(text, /呈现前拒绝该卡/, "缺失逐路径正文须在呈现前拒绝该卡");
  assert.match(text, /不会先给客户看半张卡/, "不得把半张卡先给客户看");
});

test("schema 文案（客户 2026-10-25 新规则）：write_file / edit_file 写明边界内直接写、无需 request_confirmation，边界外被 WriteGate 拒绝", () => {
  for (const [name, verb] of [["write_file", "直接写入"], ["edit_file", "直接编辑"]] as const) {
    const description = describeTool(name).description;
    assert.match(description, /角色边界（Section 1 白名单）内时/, `${name} 描述须点明角色边界（Section 1 白名单）`);
    assert.ok(description.includes(`**${verb}**`), `${name} 描述须写明边界内${verb}`);
    assert.match(description, /这是预授权/, `${name} 描述须写明边界内写入是预授权`);
    assert.match(description, /不需要 request_confirmation/, `${name} 描述须写明不需要 request_confirmation`);
    assert.match(description, /边界外的写入会被 WriteGate 拒绝/, `${name} 描述须写明边界外写入被 WriteGate 拒绝`);
    assert.match(description, /治理敏感写入/, `${name} 描述须保留治理敏感写入的确认提示`);
    assert.equal(/写盘一律|每次写盘必经|写盘前必须.*request_confirmation/.test(description), false, `${name} 不得再要求每次写盘必经确认`);
    // 只改文案：参数、必填与顺序执行模式均不变。
    assert.deepEqual(
      describeTool(name).parameters.required,
      name === "write_file" ? ["path", "content"] : ["path", "old_string", "new_string"],
    );
    assert.equal(describeTool(name).executionMode, "sequential");
  }
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
  // 2026-10-20 客户拍板：主理 Lead 成为工作流管理者，可向 Steward（convener）派发做内部协调。
  // 只放开 convener 这一个内置治理角色；不得写成「可派发给任意内置角色」。
  const roleIdDescription = (dispatch.parameters.properties as Record<string, { description?: string }>).roleId.description ?? "";
  assert.match(roleIdDescription, /usually a project role/, "roleId 目标通常是项目角色");
  assert.match(roleIdDescription, /when the caller is Lead \(Liaison\)/, "须写明调用者为 Lead（Liaison）时例外");
  assert.match(roleIdDescription, /`convener` \(Steward\)/, "Lead 可把 convener（Steward）作为协调目标");
  assert.match(roleIdDescription, /Other built-in governance roles are never valid targets/, "其余内置治理角色不可作为目标");
  assert.match(roleIdDescription, /cannot dispatch to yourself/, "不得派发给调用者自己");
  assert.match(text, /产品（Lead\/Liaison）/, "description/guideline 须写明产品 Lead");
  assert.match(text, /内部协调/, "Lead→Steward 须写明是内部协调");
  assert.match(text, /不是客户批准/, "Lead 派发不是客户批准");
  assert.match(text, /Steward\/项目角色仍按自己的.*边界与门禁执行/, "目标角色仍按自己的边界与门禁执行");
  assert.match(text, /带 `flowId`/, "治理派发须带 flowId");
  assert.match(text, /可省 `stepId`/, "Steward 协调可省 stepId");
  assert.equal(
    /可派发给任意内置角色/.test(text),
    false,
    "不得写成「可派发给任意内置角色」",
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
    // Windows 未启用 Developer Mode/非管理员时 `symlink(..., "dir")` 报 EPERM；目录 junction 是同等的
    // 重解析点（同样可指向根外），不改变逃逸断言——guardWriteTarget 的 realpath 复核仍必须拒绝。
    // POSIX 保持原 symlink 形态。
    if (process.platform === "win32") await symlink(outside, path.join(root, "link"), "junction");
    else await symlink(outside, path.join(root, "link"), "dir");
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

test("declined 措辞按 operatorId / cardKind 区分 judge 与客户/通道（2026-10-23 验收返工路由 §5.3.3 / Q7 A）", async () => {
  const judgeReason = "自动审批拒绝：证据不足。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。";
  const judgeCall = (name: "request_confirmation" | "request_choice", args: Record<string, unknown>) =>
    tools(allow, { customerInput: () => ({ outcome: "declined" as const, operatorId: "judge:claude", reason: judgeReason }) })
      .get(name)!
      .handler({ name, args });
  const choiceArgs = (cardKind?: string) => ({
    title: "选择",
    options: [{ id: "accept", label: "通过" }],
    ...(cardKind !== undefined ? { cardKind } : {}),
  });
  const assertJudgeCommon = (result: { ok: boolean; message: string }, label: string) => {
    assert.equal(result.ok, false, `${label}：judge 自动退回仍是 ok:false（fail-closed）`);
    assert.match(result.message, /自动决策未通过\/未完成/, `${label}：须写「自动决策未通过/未完成」`);
    assert.match(result.message, /原因：自动审批拒绝：证据不足/, `${label}：须保留 judge 给出的具体原因`);
    assert.match(result.message, /这不是客户拒绝/, `${label}：须明确这不是客户拒绝`);
    // 「客户拒绝」只允许作为被否定的「这不是客户拒绝」出现；不得把 judge 退回归因为客户拒绝。
    assert.equal(
      result.message.replaceAll("这不是客户拒绝", "").includes("客户拒绝"),
      false,
      `${label}：judge 来源不得出现客户拒绝归因：${result.message}`,
    );
    assert.doesNotMatch(result.message, /未获客户同意/, `${label}：judge 自动退回不得套用客户同意语义`);
  };
  const assertGeneric = (result: { message: string }, label: string) => {
    assert.match(result.message, /应用会按治理规则处理本次退回/, `${label}：须写通用处理文案`);
    assert.doesNotMatch(
      result.message,
      /Convener|组织返工|重新提交验收/,
      `${label}：非验收卡不得承诺 Convener 返工/重新提交验收：${result.message}`,
    );
  };
  const assertAcceptanceRework = (result: { message: string }, label: string) => {
    assert.match(result.message, /应用会把本次退回交 运营\/Steward（Convener）组织返工/, `${label}：验收卡须写退回 Convener 组织返工`);
    assert.match(result.message, /请等待返工后重新提交验收/, `${label}：验收卡须等待返工后重新提交验收`);
  };

  // request_confirmation：所有 judge 退回（含写卡）一律通用文案，不出现返工/验收字样。
  for (const [label, args] of [
    ["request_confirmation(无 cardKind)", { title: "写盘" }],
    ["request_confirmation(appointment-write)", { title: "写盘", cardKind: "appointment-write" }],
  ] as const) {
    const result = await judgeCall("request_confirmation", args);
    assertJudgeCommon(result, label);
    assertGeneric(result, label);
  }

  // request_choice + acceptance：验收返工专用文案。
  const choiceAcceptance = await judgeCall("request_choice", choiceArgs("acceptance"));
  assertJudgeCommon(choiceAcceptance, "request_choice(acceptance)");
  assertAcceptanceRework(choiceAcceptance, "request_choice(acceptance)");

  // request_choice + 其他/未给 cardKind：通用文案，不出现返工/验收字样。
  for (const cardKind of ["proposal", "appointment", "intent-confirm", undefined] as const) {
    const label = `request_choice(${cardKind ?? "无 cardKind"})`;
    const result = await judgeCall("request_choice", choiceArgs(cardKind));
    assertJudgeCommon(result, label);
    assertGeneric(result, label);
  }

  // 客户/通道来源：既有「客户拒绝」语义逐字不变（断言不弱化）。
  const customerReason = "内容还没看够";
  const customerByTool = (name: "request_confirmation" | "request_choice", args: Record<string, unknown>) =>
    tools(allow, { customerInput: () => ({ outcome: "declined" as const, operatorId: "customer-1", reason: customerReason }) })
      .get(name)!
      .handler({ name, args });
  const confirmDeclined = await customerByTool("request_confirmation", { title: "写盘" });
  assert.equal(confirmDeclined.ok, false);
  assert.equal(
    confirmDeclined.message,
    "request_confirmation：未获客户同意（原因：客户拒绝（内容还没看够））→ 不要写盘；如实告知客户，不得假设同意。",
    "客户 request_confirmation declined 文案逐字不变",
  );
  const choiceDeclined = await customerByTool("request_choice", { title: "选择", options: [{ id: "a", label: "A" }] });
  assert.equal(choiceDeclined.ok, false);
  assert.equal(
    choiceDeclined.message,
    "request_choice：未获客户同意（原因：客户拒绝（内容还没看够））→ 不要写盘；如实告知客户，不得假设同意。",
    "客户 request_choice declined 文案逐字不变",
  );
  // 无 operatorId（旧通道/未知来源）仍按既有客户/通道语义，不得误判为 judge。
  const channel = await tools(allow, { customerInput: () => ({ outcome: "declined" as const, reason: "通道返回拒绝" }) })
    .get("request_choice")!
    .handler({ name: "request_choice", args: { title: "选择", options: [{ id: "a", label: "A" }] } });
  assert.equal(channel.ok, false);
  assert.match(channel.message, /未获客户同意（原因：客户拒绝（通道返回拒绝））/);
});

test("验收分诊回执：仅汇报不返工不得说成客户直接 accept（2026-10-25）", async () => {
  const triaged = await tools(allow, {
    customerInput: () => ({
      outcome: "answered" as const,
      value: { selected: ["accept"] },
      operatorId: "customer-1",
      triage: { disposition: "report-only" as const, source: "customer" as const, conclusion: "fail" as const, triageId: "triage-flow-abcdef12" },
    }),
  }).get("request_choice")!.handler({ name: "request_choice", args: { title: "验收", options: [{ id: "accept", label: "通过" }, { id: "reject", label: "退回" }] } });
  assert.equal(triaged.ok, true);
  assert.match(triaged.message, /仅汇报不返工/);
  assert.match(triaged.message, /不是客户在验收卡上直接选择 accept/);
  assert.match(triaged.message, /验收结论仍为 fail/);
  assert.doesNotMatch(triaged.message, /^request_choice：客户已选择/);
  // 分诊返工：说明按验收 reject 结算并交统筹，但不是客户放弃验收。
  const rework = await tools(allow, {
    customerInput: () => ({
      outcome: "answered" as const,
      value: { selected: ["reject"] },
      operatorId: "customer-1",
      triage: { disposition: "rework" as const, source: "customer" as const, conclusion: "conditional" as const, triageId: "triage-flow-abcdef12" },
    }),
  }).get("request_choice")!.handler({ name: "request_choice", args: { title: "验收", options: [{ id: "accept", label: "通过" }, { id: "reject", label: "退回" }] } });
  assert.match(rework.message, /下发运营修改/);
  assert.match(rework.message, /不是客户放弃验收/);

  // 自动处置（declined + triage，卡未呈现）：不得说成客户拒绝/同意。
  const autoTriage = await tools(allow, {
    customerInput: () => ({
      outcome: "declined" as const,
      operatorId: "judge:triage",
      notPresented: true as const,
      reason: "验收分诊（判断代批 judge-rule）：已下发运营修改",
      triage: { disposition: "rework" as const, source: "judge" as const, conclusion: "fail" as const, triageId: "triage-flow-abcdef12" },
    }),
  }).get("request_choice")!.handler({ name: "request_choice", args: { title: "验收", options: [{ id: "accept", label: "通过" }, { id: "reject", label: "退回" }] } });
  assert.equal(autoTriage.ok, false);
  assert.match(autoTriage.message, /下发运营修改/);
  assert.match(autoTriage.message, /验收卡未向客户呈现/);
  assert.match(autoTriage.message, /不是客户拒绝/);
  assert.match(autoTriage.message, /flow_get/);
  assert.doesNotMatch(autoTriage.message, /客户拒绝（|未获客户同意/);
});

test("declined 边界：notPresented/unavailable 与 judgeReceipt 代批措辞不变", async () => {
  // request_confirmation + notPresented：即使来源是 judge 也走「卡片未发出」，不得说客户拒绝/自动退回。
  const notPresented = await tools(allow, {
    customerInput: () => ({ outcome: "declined" as const, operatorId: "judge:claude", notPresented: true as const, reason: "缺少 cardKind" }),
  }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "写盘" } });
  assert.equal(notPresented.ok, false);
  assert.match(notPresented.message, /治理确认卡未发出/);
  assert.match(notPresented.message, /未向客户呈现/);
  assert.match(notPresented.message, /缺少 cardKind/);
  assert.match(notPresented.message, /请补齐后重新调用/);
  assert.doesNotMatch(notPresented.message, /客户拒绝|自动决策未通过|未获客户同意/);

  // request_choice 的 notPresented（2026-10-25 验收分诊授权）：同样返回「卡片未发出」，不得说成客户拒绝。
  const choiceNotPresented = await tools(allow, {
    customerInput: () => ({ outcome: "declined" as const, notPresented: true as const, reason: "缺少 cardKind" }),
  }).get("request_choice")!.handler({ name: "request_choice", args: { title: "选择", options: [{ id: "a", label: "A" }] } });
  assert.equal(choiceNotPresented.ok, false);
  assert.match(choiceNotPresented.message, /治理确认卡未发出/);
  assert.match(choiceNotPresented.message, /未向客户呈现/);
  assert.match(choiceNotPresented.message, /缺少 cardKind/);
  assert.doesNotMatch(choiceNotPresented.message, /客户拒绝|未获客户同意/);

  // unavailable：既有「未获客户同意（原因：…）」不变。
  const unavailable = await tools(allow, { customerInput: () => ({ outcome: "unavailable" as const, reason: "客户通道不可用" }) })
    .get("request_choice")!
    .handler({ name: "request_choice", args: { title: "选择", options: [{ id: "a", label: "A" }] } });
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.message, /未获客户同意（原因：客户通道不可用）/);
  assert.doesNotMatch(unavailable.message, /自动决策未通过/);

  // judge 代批（answered + judge audit）：既有「代批」回执不变，不得混入自动退回措辞。
  const approved = await tools(allow, {
    customerInput: () => ({
      outcome: "answered" as const,
      value: { confirmed: true as const },
      operatorId: "judge:claude",
      judge: { group: "approval" as const, cardKind: "write" as const, engine: "claude" as const, reasonCode: "ok" },
    }),
  }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "写盘" } });
  assert.equal(approved.ok, true);
  assert.match(approved.message, /客户委托的判断 agent（替我审批）已代批（代审批；operator:judge:claude）/);
  assert.match(approved.message, /这不是客户本人点击/);
  assert.doesNotMatch(approved.message, /自动决策未通过|客户拒绝/);
});

test("写入预授权 system 回执（2026-10-25）：放行不说成客户确认，拒绝不说成客户拒绝且不引导重试", async () => {
  const systemId = "system:write-preauthorization";
  const call = (outcome: CustomerInputOutcome, args: Record<string, unknown>) =>
    tools(allow, { customerInput: () => outcome })
      .get("request_confirmation")!
      .handler({ name: "request_confirmation", args });

  // 系统接受（边界内写入）：明确系统预授权直接放行，不是客户确认；confirmed:true 技术凭据保留。
  const accepted = await call(
    { outcome: "answered", value: { confirmed: true }, operatorId: systemId },
    { title: "写入 docs/scheduling/layout.md", paths: ["docs/scheduling/layout.md"], preview: "docs/scheduling/layout.md\n布局正文" },
  );
  assert.equal(accepted.ok, true);
  assert.match(accepted.message, /系统预授权已直接放行/);
  assert.match(accepted.message, /边界内写入/);
  assert.match(accepted.message, /不是客户确认/);
  assert.match(accepted.message, /confirmed:true/);
  assert.match(accepted.message, /操作者：system:write-preauthorization/);
  assert.doesNotMatch(accepted.message, /客户已确认/, "系统放行不得说成客户确认");

  // 系统拒绝（边界外/不可写）：桌面同时置 notPresented:true；回执必须先按 system 前缀识别，
  // 明确「不是客户拒绝、不是客户未同意」，且不得出现「卡未发出/请补齐后重新调用」这类误导重试文案。
  const reason =
    "系统预授权拒绝：以下声明写入路径不在角色 Section 1 边界内或不可写：src/impl/main.ts（越界）。" +
    "边界外不给写；本次未向客户呈现确认卡、未调用判断 agent。";
  const rejected = await call(
    { outcome: "declined", operatorId: systemId, notPresented: true, reason },
    { title: "写入 src/impl/main.ts", paths: ["src/impl/main.ts"], cardKind: "appointment-write", flowId: "demo-flow" },
  );
  assert.equal(rejected.ok, false, "系统拒绝仍 fail-closed（无写盘许可）");
  assert.match(rejected.message, /系统预授权拒绝/);
  assert.match(rejected.message, /边界外或不可写/);
  assert.match(rejected.message, /不是客户拒绝/);
  assert.match(rejected.message, /不是客户未同意/);
  assert.match(rejected.message, /src\/impl\/main\.ts/, "须保留系统给出的具体拒绝原因");
  assert.match(rejected.message, /不要改写参数或重复调用本工具重试/);
  assert.match(rejected.message, /不会因重试而获准/);
  assert.doesNotMatch(rejected.message, /治理确认卡未发出|请补齐|重新调用/, "系统拒绝不得被误报成发卡缺项/引导重试");
  assert.doesNotMatch(rejected.message, /未获客户同意|客户明确未同意|自动决策未通过/, "系统拒绝不得套用客户/judge 措辞");

  // 回归：真实客户路径逐字不变（system 分支不得截走非 system 来源）。
  const customer = await tools(allow, {
    customerInput: () => ({ outcome: "answered" as const, value: { confirmed: true as const }, operatorId: "alice" }),
  }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "写入 docs/a.md" } });
  assert.equal(customer.ok, true);
  assert.equal(
    customer.message,
    "request_confirmation：客户已确认「写入 docs/a.md」（confirmed:true；操作者：alice）——已获明确同意。可按已同意的内容继续（如写盘，写入须与向客户预览的内容一致）。",
    "客户 answered 文案逐字不变",
  );
  const customerDeclined = await tools(allow, {
    customerInput: () => ({ outcome: "declined" as const, operatorId: "alice", reason: "内容还没看够" }),
  }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "写入 docs/a.md" } });
  assert.equal(
    customerDeclined.message,
    "request_confirmation：未获客户同意（原因：客户拒绝（内容还没看够））→ 不要写盘；如实告知客户，不得假设同意。",
    "客户 declined 文案逐字不变",
  );
  // 回归：真实「未呈现」场景（非 system 来源）仍走既有「卡片未发出」回执。
  const notPresented = await tools(allow, {
    customerInput: () => ({ outcome: "declined" as const, operatorId: "judge:claude", notPresented: true as const, reason: "缺少 cardKind" }),
  }).get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "写入 docs/a.md" } });
  assert.match(notPresented.message, /治理确认卡未发出/);
  assert.match(notPresented.message, /请补齐后重新调用/);
  assert.doesNotMatch(notPresented.message, /系统预授权/);
});
