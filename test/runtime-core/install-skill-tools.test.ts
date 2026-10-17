// G-4 I1+I2：技能安装/卸载工具（install_skill / uninstall_skill）的 schema 与工具层用例。
// 依据：客户 2026-10-16 批准 G-4 V1（设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`
// §3.2/§3.3；PM 派发：运行时核心＝I1 schema、I2 maker＋能力位）。断言按实文案/实行为钉住，未放松。
// 契约形状单一来源＝`src/model/runtime.ts`（InstallSkillPayload / InstallSkillReceipt / InstallSkillFn /
// UninstallSkillFn；桌面窗口与三适配器按此接线）。
import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { GovernedToolsOptions, InstallSkillFn, InstallSkillPayload, InstallSkillReceipt } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const tools = (options?: GovernedToolsOptions) => new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));

type OkReceipt = Extract<InstallSkillReceipt, { ok: true }>;
const receipt = (over: Partial<OkReceipt> = {}): InstallSkillReceipt => ({ ok: true, action: "installed", roleId: "impl", name: "lint-fix", path: "docs/skills/lint-fix/SKILL.md", digest: "a".repeat(64), effective: "rebuilt", ...over });
const failure = (reason: string, message: string): InstallSkillReceipt => ({ ok: false, reason, message });

test("G-4/I1+I2 能力位：两工具各自「注入才注册」（未注入⇒不存在）；schema 形状（必填 roleId+name、无 executionMode 覆盖）", () => {
  assert.deepEqual(describeTool("install_skill").parameters.required, ["roleId", "name"]);
  assert.deepEqual(describeTool("uninstall_skill").parameters.required, ["roleId", "name"]);
  assert.equal(describeTool("install_skill").executionMode, undefined, "沿 dispatch_task 先例：不设 executionMode 覆盖");
  assert.equal(describeTool("uninstall_skill").executionMode, undefined);

  // 结构性保证（沿 run_shell / dispatch_task「注入才注册」先例）：缺省均不注册；各自注入才注册自己。
  assert.deepEqual([...tools().keys()], ["write_file", "edit_file", "read_file"]);
  const onlyInstall = tools({ installSkill: async () => receipt() });
  assert.equal(onlyInstall.has("install_skill"), true);
  assert.equal(onlyInstall.has("uninstall_skill"), false);
  const onlyUninstall = tools({ uninstallSkill: async () => receipt({ action: "uninstalled" }) });
  assert.equal(onlyUninstall.has("uninstall_skill"), true);
  assert.equal(onlyUninstall.has("install_skill"), false);
  const both = tools({ installSkill: async () => receipt(), uninstallSkill: async () => receipt({ action: "uninstalled" }) });
  assert.deepEqual([...both.keys()], ["write_file", "edit_file", "read_file", "install_skill", "uninstall_skill"]);
});

test("schema 文案（G-4/I1）：install_skill 钉住仅客户明示时安装/不得自主发起/先落盘再激活/不写盘/不改变写边界/失败文案枚举（含 not-customer-turn）", () => {
  const text = [describeTool("install_skill").description, ...(describeTool("install_skill").promptGuidelines ?? [])].join("\n");
  assert.match(text, /仅客户明示时安装/, "仅客户明示——指令即授权，不自主发起");
  assert.match(text, /不得自主发起/);
  assert.match(text, /先落盘再激活/);
  assert.match(text, /不写盘/);
  assert.match(text, /不改变任何角色的写边界/, "安装不是授权/权限（技能是必读资料）");
  assert.match(text, /not-customer-turn/, "护栏拒绝机读标识");
  assert.match(text, /本动作仅可在客户消息发起的轮次执行——未执行。/);
  // 失败文案枚举（设计 §3.3 逐字）。
  assert.match(text, /技能未登记：docs\/skills\/<name>\/install\.md 不存在——先落盘再安装；未执行。/);
  assert.match(text, /登记中未包含角色「<roleId>」——未执行；如确要安装请先更新登记。/);
  assert.match(text, /角色「<roleId>」不是本项目项目角色（或为内置治理角色）——未执行。/);
  assert.match(text, /next-session/, "在跑不打断＝如实延迟态须写明");
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示任何授权：${text}`);
});

test("schema 文案（G-4/I1）：uninstall_skill 钉住仅客户明示时卸载/先改登记再卸载/登记未变拒绝/文件保留二分陈述/不改变写边界", () => {
  const text = [describeTool("uninstall_skill").description, ...(describeTool("uninstall_skill").promptGuidelines ?? [])].join("\n");
  assert.match(text, /仅客户明示时卸载/);
  assert.match(text, /先改登记再卸载/);
  assert.match(text, /登记仍含角色「<roleId>」——先改登记再卸载；未执行。/, "防「工具说撤了、登记没变」");
  assert.match(text, /文件保留/);
  assert.match(text, /效果已撤/);
  assert.match(text, /不写盘/);
  assert.match(text, /不改变任何角色的写边界/);
  assert.match(text, /not-customer-turn/);
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示任何授权：${text}`);
});

test("G-4/I2：install_skill 只路由 {roleId,name} 载荷、如实转达三态回执——ok:true 呈现 path/digest/生效态并重申写边界不变", async () => {
  const seen: InstallSkillPayload[] = [];
  const ok = tools({ installSkill: async (payload) => { seen.push(payload); return receipt(); } });
  const done = await ok.get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(done.ok, true);
  assert.match(done.message, /技能「lint-fix」已安装 → 角色「impl」/);
  assert.match(done.message, /内容：docs\/skills\/lint-fix\/SKILL\.md（sha256 aaaaaaaaaaaa）/, "path＋digest 前 12 位如实呈现");
  assert.match(done.message, /已重建该角色会话、即刻生效/);
  assert.match(done.message, /本次安装\*\*未改变任何角色的写边界\*\*/, "重申不扩任何写权");
  assert.deepEqual(seen, [{ roleId: "impl", name: "lint-fix" }], "只路由 {roleId,name} 载荷（含内容不进工具调用）");

  const busy = tools({ installSkill: async () => receipt({ effective: "next-session", note: "登记已更新" }) });
  const deferred = await busy.get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(deferred.ok, true, "在跑不打断＝ok:true 的如实延迟态，不是错误");
  assert.match(deferred.message, /该角色正在运行轮次（不打断）——新会话起生效/);
  assert.match(deferred.message, /登记已更新/, "note 如实附上");
  assert.equal(/即刻生效/.test(deferred.message), false, "延迟态不得称即刻生效");

  const onlyUninstall = tools({ uninstallSkill: async () => receipt({ action: "uninstalled" }) });
  const removed = await onlyUninstall.get("uninstall_skill")!.handler({ name: "uninstall_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(removed.ok, true);
  assert.match(removed.message, /技能「lint-fix」已卸载 → 角色「impl」/);
  assert.match(removed.message, /效果已撤；文件保留于 docs\/skills\/lint-fix\/SKILL\.md/, "「效果已撤」与「文件仍在」二分陈述");
  assert.match(removed.message, /本次卸载\*\*未改变任何角色的写边界\*\*/);
});

test("G-4/I2：失败如实——§3.3 文案枚举与护栏 not-customer-turn 原样转达（未执行、零副作用）；契约外/抛错一律 fail-closed 绝不称已装/已卸", async () => {
  // ok:false 如实：reason 机读标识 + message 原文 + 零副作用 + 不称已安装（含护栏 not-customer-turn）。
  for (const [reason, message] of [
    ["not-registered", "技能未登记：docs/skills/lint-fix/install.md 不存在——先落盘再安装；未执行。"],
    ["role-not-listed", "登记中未包含角色「impl」——未执行；如确要安装请先更新登记。"],
    ["role-not-found", "角色「impl」不是本项目项目角色（或为内置治理角色）——未执行。"],
    ["not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。"],
  ] as const) {
    const result = await tools({ installSkill: async () => failure(reason, message) }).get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
    assert.equal(result.ok, false, `${reason} 应如实失败`);
    assert.ok(result.message.includes(`reason: ${reason}`), "reason 机读标识如实转达");
    assert.ok(result.message.includes(message), "回执 message 原样转达（不加工、不吞）");
    assert.match(result.message, /零副作用/);
    assert.match(result.message, /不要当它已安装/);
    assert.equal(/技能「[^」]*」已安装/.test(result.message), false, "绝不称已安装");
  }
  // 卸载侧两处专有拒绝：登记未变 / 护栏。
  const unchanged = await tools({ uninstallSkill: async () => failure("registration-unchanged", "登记仍含角色「impl」——先改登记再卸载；未执行。") }).get("uninstall_skill")!.handler({ name: "uninstall_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(unchanged.ok, false);
  assert.match(unchanged.message, /登记仍含角色「impl」——先改登记再卸载；未执行。/);
  assert.match(unchanged.message, /不要当它已卸载/);
  const guarded = await tools({ uninstallSkill: async () => failure("not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。") }).get("uninstall_skill")!.handler({ name: "uninstall_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(guarded.ok, false);
  assert.match(guarded.message, /本动作仅可在客户消息发起的轮次执行——未执行。/);

  // 能力抛错（如重建失败）：未完成 + 原因——绝不称已装。
  const thrown = await tools({ installSkill: async () => { throw new Error("重建失败：在跑轮次拒绝"); } }).get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /技能\*\*未能安装\*\*/);
  assert.match(thrown.message, /重建失败：在跑轮次拒绝/);
  assert.equal(/技能「[^」]*」已安装/.test(thrown.message), false);

  // 契约外回执（缺失 / 形状非法 / action 与工具不符 / 旧字符串形状）→ fail-closed。
  for (const bad of [() => undefined, () => null, () => ({ ok: true }), () => receipt({ action: "uninstalled" }), () => "旧字符串形状（契约外）"] as unknown as InstallSkillFn[]) {
    const result = await tools({ installSkill: bad }).get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
    assert.equal(result.ok, false, "契约外回执应 fail-closed");
    assert.match(result.message, /未返回明确回执/);
    assert.match(result.message, /不要当它已安装/);
    assert.equal(/技能「[^」]*」已安装/.test(result.message), false);
  }
});

test("G-4/I2：参数校验不触达能力；metadata 沿 dispatch 先例透传（无轮次归一单参）；预中止不调能力且不称已安装", async () => {
  let called = 0;
  const spy = tools({ installSkill: async () => { called += 1; return receipt(); } });
  for (const args of [{ name: "lint-fix" }, { roleId: "impl" }, { roleId: "   ", name: "lint-fix" }, { roleId: "impl", name: "   " }, { roleId: 7, name: "lint-fix" }]) {
    const bad = await spy.get("install_skill")!.handler({ name: "install_skill", args });
    assert.equal(bad.ok, false, `应拒绝：${JSON.stringify(args)}`);
  }
  const badUninstall = await spy.get("uninstall_skill")?.handler({ name: "uninstall_skill", args: { roleId: "impl" } });
  assert.equal(badUninstall, undefined, "未注入卸载能力 ⇒ 工具不存在（前一条已验）");
  assert.equal(called, 0, "校验失败不得触达能力（零副作用）");

  // metadata（沿 dispatch_task 先例）：入口捕获 {turnId, roleId, runtime}；无 currentTurnId 时单参调用（兼容）。
  let metadata: unknown;
  const withTurn = tools({ currentTurnId: () => "turn-11", roleId: "su", runtime: "pi", installSkill: async (_p, meta) => { metadata = meta; return receipt(); } });
  await withTurn.get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.deepEqual(metadata, { turnId: "turn-11", roleId: "su", runtime: "pi" });
  let singleArg = false;
  const legacy = tools({ installSkill: (async (_p: InstallSkillPayload, meta?: unknown) => { singleArg = meta === undefined; return receipt(); }) as InstallSkillFn });
  await legacy.get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" } });
  assert.equal(singleArg, true, "无 currentTurnId 时归一为单参调用");

  // 预中止（＝会话已中止路径）：不调能力、如实「未能安装」不假设已装。
  const controller = new AbortController(); controller.abort();
  let abortedCalls = 0;
  const aborted = await tools({ installSkill: async () => { abortedCalls += 1; return receipt(); } }).get("install_skill")!.handler({ name: "install_skill", args: { roleId: "impl", name: "lint-fix" }, signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(abortedCalls, 0);
  assert.match(aborted.message, /未能安装/);
  assert.match(aborted.message, /不要当它已安装/);
});
