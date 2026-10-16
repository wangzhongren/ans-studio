// G-4 V2 wave A：外来 MCP 安装/卸载工具（install_mcp / uninstall_mcp）的 schema 与工具层用例。
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2 分批实施（设计 §3.2/§3.3/§五/§九；PM 派发：
// 运行时核心＝wave A 契约层）。断言按实文案/实行为钉住，未放松。
// 契约形状单一来源＝`src/model/runtime.ts`（InstalledMcpServerV1 / InstallMcpPayload /
// InstallMcpReceipt / InstallMcpFn / UninstallMcpFn；回执沿 InstallSkillReceipt 体格冻结）。
import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { GovernedToolsOptions, InstallMcpFn, InstallMcpPayload, InstallMcpReceipt } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const tools = (options?: GovernedToolsOptions) => new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));

type OkReceipt = Extract<InstallMcpReceipt, { ok: true }>;
const receipt = (over: Partial<OkReceipt> = {}): InstallMcpReceipt => ({ ok: true, action: "installed", roleId: "impl", name: "fs", path: "docs/mcp/fs.md", digest: "a".repeat(64), effective: "rebuilt", ...over });
const failure = (reason: string, message: string): InstallMcpReceipt => ({ ok: false, reason, message });

test("G-4 V2 能力位：两工具各自「注入才注册」（未注入⇒不存在、与技能对互不搭车）；schema 形状（必填 roleId+name、无 executionMode 覆盖）", () => {
  assert.deepEqual(describeTool("install_mcp").parameters.required, ["roleId", "name"]);
  assert.deepEqual(describeTool("uninstall_mcp").parameters.required, ["roleId", "name"]);
  assert.equal(describeTool("install_mcp").executionMode, undefined, "沿技能/ dispatch_task 先例：不设 executionMode 覆盖");
  assert.equal(describeTool("uninstall_mcp").executionMode, undefined);

  // 结构性保证（沿 run_shell / dispatch_task「注入才注册」先例）：缺省均不注册；各自注入才注册自己。
  assert.deepEqual([...tools().keys()], ["write_file", "edit_file", "read_file"]);
  const onlyInstall = tools({ installMcp: async () => receipt() });
  assert.equal(onlyInstall.has("install_mcp"), true);
  assert.equal(onlyInstall.has("uninstall_mcp"), false);
  assert.equal(onlyInstall.has("install_skill"), false, "与技能对互不搭车");
  const onlyUninstall = tools({ uninstallMcp: async () => receipt({ action: "uninstalled" }) });
  assert.equal(onlyUninstall.has("uninstall_mcp"), true);
  assert.equal(onlyUninstall.has("install_mcp"), false);
  const both = tools({ installMcp: async () => receipt(), uninstallMcp: async () => receipt({ action: "uninstalled" }) });
  assert.deepEqual([...both.keys()], ["write_file", "edit_file", "read_file", "install_mcp", "uninstall_mcp"]);
  const allFour = tools({ installSkill: async () => ({ ok: false, reason: "r", message: "m" }), uninstallSkill: async () => ({ ok: false, reason: "r", message: "m" }), installMcp: async () => receipt(), uninstallMcp: async () => receipt({ action: "uninstalled" }) });
  assert.deepEqual([...allFour.keys()], ["write_file", "edit_file", "read_file", "install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp"]);
});

test("schema 文案（G-4 V2）：install_mcp 钉住仅客户明示时安装/不得自主发起/先落盘再激活/不写盘/门禁之外执行＝能力级授予（非逐调用受审）/不改变写边界/失败文案枚举（含 not-customer-turn）", () => {
  const text = [describeTool("install_mcp").description, ...(describeTool("install_mcp").promptGuidelines ?? [])].join("\n");
  assert.match(text, /仅客户明示时安装/, "仅客户明示——指令即授权，不自主发起");
  assert.match(text, /不得自主发起/);
  assert.match(text, /先落盘再激活/);
  assert.match(text, /不写盘/);
  assert.match(text, /外来 MCP 工具在 ANS 门禁之外执行/, "诚实面：门禁外执行面必写明");
  assert.match(text, /能力级授予/);
  assert.match(text, /不是逐调用受审/, "§5.3 诚实面：不得宣称逐调用受审");
  assert.match(text, /不改变任何角色的写边界/);
  assert.match(text, /not-customer-turn/, "护栏拒绝机读标识");
  assert.match(text, /本动作仅可在客户消息发起的轮次执行——未执行。/);
  // 失败文案枚举（沿技能版逐字体格）。
  assert.match(text, /MCP 未登记：docs\/mcp\/<name>\.md 不存在——先落盘再安装；未执行。/);
  assert.match(text, /登记中未包含角色「<roleId>」——未执行；如确要安装请先更新登记。/);
  assert.match(text, /角色「<roleId>」不是本项目项目角色（或为治理角色 su）——未执行。/);
  assert.match(text, /next-session/, "在跑不打断＝如实延迟态须写明");
  assert.match(text, /env:NAME/, "声明格式：env 值只收字面量或 env:NAME 引用（凭据值不入文件）");
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示任何授权：${text}`);
});

test("schema 文案（G-4 V2）：uninstall_mcp 钉住仅客户明示时卸载/先改登记再卸载/登记未变拒绝/卸载＝下次会话摘除/声明保留二分/已发生副作用不可撤", () => {
  const text = [describeTool("uninstall_mcp").description, ...(describeTool("uninstall_mcp").promptGuidelines ?? [])].join("\n");
  assert.match(text, /仅客户明示时卸载/);
  assert.match(text, /先改登记再卸载/);
  assert.match(text, /登记仍含角色「<roleId>」——先改登记再卸载；未执行。/, "防「工具说撤了、声明没变」");
  assert.match(text, /下次会话摘除/, "卸载生效语义＝下次会话摘除");
  assert.match(text, /声明文件保留/);
  assert.match(text, /效果已撤/);
  assert.match(text, /已发生的副作用不可撤/);
  assert.match(text, /不写盘/);
  assert.match(text, /不改变任何角色的写边界/);
  assert.match(text, /not-customer-turn/);
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示任何授权：${text}`);
});

test("G-4 V2：install_mcp 只路由 {roleId,name} 载荷、如实转达三态回执——ok:true 呈现声明 path/digest/生效态并重申写边界与门禁外执行面", async () => {
  const seen: InstallMcpPayload[] = [];
  const ok = tools({ installMcp: async (payload) => { seen.push(payload); return receipt(); } });
  const done = await ok.get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs", 多余: "字段不路由" } });
  assert.equal(done.ok, true);
  assert.match(done.message, /install_mcp：MCP「fs」已安装 → 角色「impl」/);
  assert.match(done.message, /声明：docs\/mcp\/fs\.md（sha256 aaaaaaaaaaaa）/, "path＋digest 前 12 位如实呈现");
  assert.match(done.message, /已重建该角色会话、即刻生效/);
  assert.match(done.message, /本次安装\*\*未改变任何角色的写边界\*\*/, "重申不扩任何门禁内写权");
  assert.match(done.message, /外来 MCP 工具在 ANS 门禁之外执行（能力级授予），不是逐调用受审/, "诚实面随回执如实");
  assert.deepEqual(seen, [{ roleId: "impl", name: "fs" }], "只路由 {roleId,name} 载荷");

  const busy = tools({ installMcp: async () => receipt({ effective: "next-session", note: "声明已更新" }) });
  const deferred = await busy.get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(deferred.ok, true, "在跑不打断＝ok:true 的如实延迟态，不是错误");
  assert.match(deferred.message, /该角色正在运行轮次（不打断）——新会话起生效/);
  assert.match(deferred.message, /声明已更新/, "note 如实附上");
  assert.equal(/即刻生效/.test(deferred.message), false, "延迟态不得称即刻生效");

  const onlyUninstall = tools({ uninstallMcp: async () => receipt({ action: "uninstalled" }) });
  const removed = await onlyUninstall.get("uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(removed.ok, true);
  assert.match(removed.message, /uninstall_mcp：MCP「fs」已卸载 → 角色「impl」/);
  assert.match(removed.message, /效果已撤；声明保留于 docs\/mcp\/fs\.md/, "「效果已撤」与「文件仍在」二分陈述");
  assert.match(removed.message, /本次卸载\*\*未改变任何角色的写边界\*\*/);
  assert.match(removed.message, /已发生的副作用不可撤/, "卸载回执如实：历史副作用不可撤");
});

test("G-4 V2：失败如实——枚举与护栏 not-customer-turn 原样转达（未执行、零副作用）；契约外/抛错一律 fail-closed 绝不称已装/已卸", async () => {
  for (const [reason, message] of [
    ["not-registered", "MCP 未登记：docs/mcp/fs.md 不存在——先落盘再安装；未执行。"],
    ["role-not-listed", "登记中未包含角色「impl」——未执行；如确要安装请先更新登记。"],
    ["role-not-found", "角色「impl」不是本项目项目角色（或为治理角色 su）——未执行。"],
    ["not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。"],
  ] as const) {
    const result = await tools({ installMcp: async () => failure(reason, message) }).get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
    assert.equal(result.ok, false, `${reason} 应如实失败`);
    assert.ok(result.message.includes(`reason: ${reason}`), "reason 机读标识如实转达");
    assert.ok(result.message.includes(message), "回执 message 原样转达（不加工、不吞）");
    assert.match(result.message, /零副作用/);
    assert.match(result.message, /不要当它已安装/);
    assert.equal(/MCP「[^」]*」已安装/.test(result.message), false, "绝不称已安装");
  }
  const unchanged = await tools({ uninstallMcp: async () => failure("registration-unchanged", "登记仍含角色「impl」——先改登记再卸载；未执行。") }).get("uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(unchanged.ok, false);
  assert.match(unchanged.message, /登记仍含角色「impl」——先改登记再卸载；未执行。/);
  assert.match(unchanged.message, /不要当它已卸载/);
  const guarded = await tools({ uninstallMcp: async () => failure("not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。") }).get("uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(guarded.ok, false);
  assert.match(guarded.message, /本动作仅可在客户消息发起的轮次执行——未执行。/);

  // 能力抛错（如重建失败/platform 未接入）：未完成 + 原因——绝不称已装。
  const thrown = await tools({ installMcp: async () => { throw new Error("重建失败：在跑轮次拒绝"); } }).get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /MCP\*\*未能安装\*\*/);
  assert.match(thrown.message, /重建失败：在跑轮次拒绝/);
  assert.equal(/MCP「[^」]*」已安装/.test(thrown.message), false);

  // 契约外回执（缺失 / 形状非法 / action 与工具不符 / 旧字符串形状）→ fail-closed。
  for (const bad of [() => undefined, () => null, () => ({ ok: true }), () => receipt({ action: "uninstalled" }), () => "旧字符串形状（契约外）"] as unknown as InstallMcpFn[]) {
    const result = await tools({ installMcp: bad }).get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
    assert.equal(result.ok, false, "契约外回执应 fail-closed");
    assert.match(result.message, /未返回明确回执/);
    assert.match(result.message, /不要当它已安装/);
    assert.equal(/MCP「[^」]*」已安装/.test(result.message), false);
  }
});

test("G-4 V2：参数校验不触达能力；metadata 沿 dispatch 先例透传（无轮次归一单参）；预中止不调能力且不称已装", async () => {
  let called = 0;
  const spy = tools({ installMcp: async () => { called += 1; return receipt(); } });
  for (const args of [{ name: "fs" }, { roleId: "impl" }, { roleId: "   ", name: "fs" }, { roleId: "impl", name: "   " }, { roleId: 7, name: "fs" }]) {
    const bad = await spy.get("install_mcp")!.handler({ name: "install_mcp", args });
    assert.equal(bad.ok, false, `应拒绝：${JSON.stringify(args)}`);
  }
  assert.equal(called, 0, "校验失败不得触达能力（零副作用）");

  // metadata（沿 dispatch_task 先例）：入口捕获 {turnId, roleId, runtime}；无 currentTurnId 时单参调用（兼容）。
  let metadata: unknown;
  const withTurn = tools({ currentTurnId: () => "turn-11", roleId: "su", runtime: "pi", installMcp: async (_p, meta) => { metadata = meta; return receipt(); } });
  await withTurn.get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
  assert.deepEqual(metadata, { turnId: "turn-11", roleId: "su", runtime: "pi" });
  let singleArg = false;
  const legacy = tools({ installMcp: (async (_p: InstallMcpPayload, meta?: unknown) => { singleArg = meta === undefined; return receipt(); }) as InstallMcpFn });
  await legacy.get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" } });
  assert.equal(singleArg, true, "无 currentTurnId 时归一为单参调用");

  // 预中止（＝会话已中止路径）：不调能力、如实「未能安装」不假设已装（abortedToolResult 专条）。
  const controller = new AbortController(); controller.abort();
  let abortedCalls = 0;
  const aborted = await tools({ installMcp: async () => { abortedCalls += 1; return receipt(); } }).get("install_mcp")!.handler({ name: "install_mcp", args: { roleId: "impl", name: "fs" }, signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(abortedCalls, 0);
  assert.match(aborted.message, /MCP\*\*未能安装\*\*/);
  assert.match(aborted.message, /不要当它已安装/);
  const aborted2 = await tools({ uninstallMcp: async () => { abortedCalls += 1; return receipt({ action: "uninstalled" }); } }).get("uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "impl", name: "fs" }, signal: controller.signal });
  assert.equal(aborted2.ok, false);
  assert.equal(abortedCalls, 0);
  assert.match(aborted2.message, /MCP\*\*未能卸载\*\*/);
  assert.match(aborted2.message, /不要当它已卸载/);
});
