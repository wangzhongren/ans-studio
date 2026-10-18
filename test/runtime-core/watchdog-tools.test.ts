// G-2/R1+R2：看护只读工具（role_status / session_tail）与恢复提议（propose_recovery）的 schema 与工具层用例。
// 依据：客户 2026-10-16 批准 G-2（设计 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`
// §四/§六；PM 派发：运行时核心＝R1 schema+handler、R2 schema+handler）。断言按实文案/实行为钉住，未放松。
// 契约形状单一来源＝`src/model/runtime.ts`（RoleStatusPayload/SessionTailPayload/WatchdogToolResult/
// RecoveryAction/RecoveryOutcome/RecoveryReceipt；编排 `common/编排/watchdog.ts` 转发出同一符号）。
import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type {
  GovernedToolsOptions, InteractionGate, ProposeRecoveryFn, ProposeRecoveryPayload, RoleStatusFn,
  RoleStatusPayload, SessionTailFn, SessionTailPayload,
} from "../../src/model/runtime.ts";
import { allow, until } from "./fixtures.ts";

const tools = (options?: GovernedToolsOptions) => new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));

test("G-2/R1+R2 能力位：三工具各自「注入才注册」（未注入⇒不存在）；schema 形状与枚举恰三值", () => {
  // schema 形状（写法钉住：role_status 无必填；session_tail 必填 roleId；propose_recovery 必填三参 + action 枚举恰三值）。
  assert.deepEqual(describeTool("role_status").parameters.required, []);
  assert.deepEqual(describeTool("session_tail").parameters.required, ["roleId"]);
  const propose = describeTool("propose_recovery");
  assert.deepEqual(propose.parameters.required, ["roleId", "action", "evidence"]);
  const action = (propose.parameters.properties as Record<string, Record<string, unknown>>)["action"];
  assert.deepEqual(action.enum, ["abort-turn", "rebuild-session", "redeliver"], "动作集恰为客户批准三值");
  assert.equal(propose.executionMode, undefined, "沿 dispatch_task 先例：不设 executionMode 覆盖");
  assert.equal(describeTool("role_status").executionMode, undefined);
  assert.equal(describeTool("session_tail").executionMode, undefined);

  // 结构性保证（沿 run_shell / dispatch_task「注入才注册」先例）：缺省均不注册；各自注入才注册自己。
  assert.deepEqual([...tools().keys()], ["write_file", "edit_file", "read_file", "list_dir"]);
  const onlyStatus = tools({ roleStatus: () => ({ ok: true, text: "stub" }) });
  assert.equal(onlyStatus.has("role_status"), true);
  assert.equal(onlyStatus.has("session_tail"), false);
  assert.equal(onlyStatus.has("propose_recovery"), false);
  const onlyTail = tools({ sessionTail: () => ({ ok: true, text: "stub" }) });
  assert.equal(onlyTail.has("session_tail"), true);
  assert.equal(onlyTail.has("role_status"), false);
  const onlyRecover = tools({ proposeRecovery: () => ({ outcome: "declined" }) });
  assert.equal(onlyRecover.has("propose_recovery"), true);
  assert.equal(onlyRecover.has("role_status"), false);
  assert.equal(onlyRecover.has("session_tail"), false);
});

test("schema 文案（G-2/R1）：role_status 钉住只读/8 KiB 截断如实/失败不编造/先核对再提议；不得暗示任何权限", () => {
  const text = [describeTool("role_status").description, ...(describeTool("role_status").promptGuidelines ?? [])].join("\n");
  assert.match(text, /只读/, "须写明只读");
  assert.match(text, /纯读/);
  assert.match(text, /不写盘/);
  assert.match(text, /不改变任何权限/);
  assert.match(text, /8 KiB/);
  assert.match(text, /truncated/, "超限截断须如实标注 truncated");
  assert.match(text, /如实给出「不可用＋原因」/);
  assert.match(text, /绝不编造状态/);
  assert.match(text, /roleId 缺省＝全项目概览/, "缺省＝概览、给出＝单角色详情的取用口径");
  assert.match(text, /includeDiagnostics/, "诊断节取用口径");
  assert.match(text, /\[系统·看护\]/, "与告警文案联动：收到告警先核对");
  assert.match(text, /确认卡死时提议恢复/);
  assert.match(text, /propose_recovery/);
  assert.match(text, /客户一键确认/, "恢复需客户一键确认（本工具不做恢复）");
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功|自动执行恢复/.test(text), false, `不得暗示任何权限或自动动作：${text}`);
});

test("schema 文案（G-2/R1）：session_tail 钉住只读/受保护投影与脱敏/行数上限/无历史与读坏如实不猜", () => {
  const text = [describeTool("session_tail").description, ...(describeTool("session_tail").promptGuidelines ?? [])].join("\n");
  assert.match(text, /只读/);
  assert.match(text, /纯读/);
  assert.match(text, /不写盘、不改任何状态、不扩大任何写权/);
  assert.match(text, /受保护投影与脱敏管线/, "来源须写明受保护投影/脱敏链");
  assert.match(text, /可能含该角色此前会话原文要点/, "隐私边界如实写明");
  assert.match(text, /来源文件\/总行数\/跳过坏行数/, "头部如实口径");
  assert.match(text, /不抛、不猜、不编造/);
  assert.match(text, /缺省 40 行、上限 200 行/);
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示任何权限：${text}`);
});

test("schema 文案（G-2/R2）：propose_recovery 钉住「提议 ≠ 执行」/无确认零执行/回执如实四值/不得承诺/evidence 必填", () => {
  const text = [describeTool("propose_recovery").description, ...(describeTool("propose_recovery").promptGuidelines ?? [])].join("\n");
  assert.match(text, /提议 ≠ 执行/);
  assert.match(text, /只能提议/);
  assert.match(text, /无客户确认＝零执行/);
  assert.match(text, /客户一键确认卡/);
  assert.match(text, /由应用执行/, "执行主体＝应用，非本工具");
  assert.match(text, /回执如实/);
  assert.match(text, /executed \/ declined \/ unsupported \/ error/, "回执四值口径与契约家 RecoveryOutcome 一致");
  assert.match(text, /后三值一律\*\*未执行\*\*|一律未执行/);
  assert.match(text, /不执行任何动作、不放行任何命令、不改变任何权限或写权/, "工具本身不做任何事");
  assert.match(text, /不得承诺/);
  assert.match(text, /evidence` \*\*必填\*\*|evidence 必填/);
  assert.match(text, /未获执行不得当成功/);
  assert.match(text, /确认卡死/);
  assert.equal(/已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text), false, `不得暗示提议携带任何授权：${text}`);
  // 动作语义三值说明在场（复用既有行为口径）。
  assert.match(text, /停止本轮/);
  assert.match(text, /在跑轮次|在跑.*拒绝|refused while a turn is running/);
});

test("G-2/R1：role_status 纯读接口——只调注入数据源（查询归一、无副作用、无编造）、8 KiB 按字节截断如实标注", async () => {
  const calls: RoleStatusPayload[] = [];
  const noSideEffects = {
    sessionTail: () => { throw new Error("session_tail 不应被 role_status 触碰"); },
    proposeRecovery: () => { throw new Error("propose_recovery 不应被 role_status 触碰"); },
    customerInput: () => { throw new Error("customerInput 不应被 role_status 触碰"); },
    reportHandback: () => { throw new Error("reportHandback 不应被 role_status 触碰"); },
  };
  const stub = "role_status（项目 /p，02:31）\nsu：busy=false ｜ 待确认卡 0 ｜ 看护：活跃告警 0\n角色 a：busy=false ｜ 队列 0";
  const byName = tools({ roleStatus: (q) => { calls.push(q); return { ok: true, text: stub }; }, ...noSideEffects });
  const overview = await byName.get("role_status")!.handler({ name: "role_status", args: Object.freeze({}) });
  assert.equal(overview.ok, true);
  assert.equal(overview.message, stub, "ok:true 时 text 原样转达（不加工、不编造）");
  assert.deepEqual(calls, [{}]);
  await byName.get("role_status")!.handler({ name: "role_status", args: { roleId: "a", includeDiagnostics: true } });
  assert.deepEqual(calls[1], { roleId: "a", includeDiagnostics: true });
  // 归一（沿 request_choice `multiple` 先例：辅助布尔/空串不猜、不打断查询）：空串 roleId ⇒ 概览；非布尔 ⇒ 未提供。
  await byName.get("role_status")!.handler({ name: "role_status", args: { roleId: "   ", includeDiagnostics: "yes" } });
  assert.deepEqual(calls[2], {});
  // 给了 roleId 键但非字符串 → 拒绝（不静默退化为概览——那会给 su 错误的全景）。
  const beforeBad = calls.length;
  const badRole = await byName.get("role_status")!.handler({ name: "role_status", args: { roleId: 123 } });
  assert.equal(badRole.ok, false);
  assert.match(badRole.message, /roleId 参数非法/);
  assert.equal(calls.length, beforeBad, "非法 roleId 不得触达数据源");
  // 数据源 ok:false（如诊断不可用）→ 如实转达其 message（原样，不编造）。
  const unavailable = await tools({ roleStatus: () => ({ ok: false, message: "诊断不可用：lastError=ENOSPC" }) }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.message, "诊断不可用：lastError=ENOSPC");

  // 截断：多字节文本超 8 KiB → 总输出 ≤8 KiB、不劈开码点、如实标注 truncated。
  const bigText = "状".repeat(3000); // 9000 字节
  const capped = await tools({ roleStatus: () => ({ ok: true, text: bigText }) }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.equal(capped.ok, true);
  assert.ok(Buffer.byteLength(capped.message, "utf8") <= 8192, "总输出（含标注）不得超过 8 KiB");
  assert.ok(capped.message.includes("truncated"), "须如实标注 truncated");
  assert.ok(!capped.message.includes("�"), "不得劈开多字节码点");
  assert.ok(capped.message.startsWith("状"), "截断保留原文前缀");
  // 边界：恰 8192 字节不截断、8193 字节截断（按字节而非字符计）。
  const exact = await tools({ roleStatus: () => ({ ok: true, text: "a".repeat(8192) }) }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.equal(exact.message, "a".repeat(8192));
  const over = await tools({ roleStatus: () => ({ ok: true, text: "a".repeat(8193) }) }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.ok(Buffer.byteLength(over.message, "utf8") <= 8192 && over.message.includes("truncated"));

  // 失败如实：数据源抛错 → ok:false「未完成」+ 原因；契约外（回执缺失/无文本）→ ok:false 结果不明——都不编造状态。
  const failed = await tools({ roleStatus: () => { throw new Error("诊断写盘故障"); } }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /诊断写盘故障/);
  assert.match(failed.message, /不要推断项目状态/);
  for (const bad of [() => undefined, (() => null), (() => "旧字符串形状（契约外）")] as unknown as RoleStatusFn[]) {
    const missing = await tools({ roleStatus: bad }).get("role_status")!.handler({ name: "role_status", args: {} });
    assert.equal(missing.ok, false);
    assert.match(missing.message, /未返回明确结果/);
  }
  const noText = await tools({ roleStatus: (() => ({ ok: true })) as unknown as RoleStatusFn }).get("role_status")!.handler({ name: "role_status", args: {} });
  assert.equal(noText.ok, false);
  assert.match(noText.message, /未返回文本/);
  // 预中止：不调数据源、ok:false（纯读工具中止也如实）。
  const controller = new AbortController(); controller.abort();
  let abortedCalls = 0;
  const aborted = await tools({ roleStatus: () => { abortedCalls += 1; return { ok: true, text: stub }; } }).get("role_status")!.handler({ name: "role_status", args: {}, signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(abortedCalls, 0);
  // metadata 同 dispatch_task 先例：有轮次时透传 {turnId, roleId, runtime}（只读工具不消费，供实现侧留痕）。
  let readMeta: unknown;
  const withTurn = tools({ currentTurnId: () => "turn-7", roleId: "su", runtime: "pi", roleStatus: (_q, meta) => { readMeta = meta; return { ok: true, text: "ok" }; } });
  await withTurn.get("role_status")!.handler({ name: "role_status", args: {} });
  assert.deepEqual(readMeta, { turnId: "turn-7", roleId: "su", runtime: "pi" });
});

test("G-2/R1：session_tail 纯读接口——行数归一（缺省 40/上限 200 如实标注/非法拒绝且不调数据源）、原样转达、失败如实", async () => {
  const calls: SessionTailPayload[] = [];
  const stub = "来源文件 .ans/sessions/a/pi/ans/history.jsonl ｜ 总行数 12 ｜ 跳过坏行 1\n10:00:01 [user] hello";
  const byName = tools({ sessionTail: (q) => { calls.push(q); return { ok: true, text: stub }; } });
  const ok = await byName.get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a" } });
  assert.equal(ok.ok, true);
  assert.equal(ok.message, stub, "≤上限时 text 原样转达（含头部如实口径——数据层已给）");
  assert.deepEqual(calls[0], { roleId: "a", lines: 40 }, "缺省 40 行");
  await byName.get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a", lines: 120 } });
  assert.deepEqual(calls[1], { roleId: "a", lines: 120 });
  const clamped = await byName.get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a", lines: 9999 } });
  assert.deepEqual(calls[2], { roleId: "a", lines: 200 }, "超上限按上限 200 归一");
  assert.match(clamped.message, /已按上限取尾：请求 9999 行 → 取 200 行/, "超上限须如实标注");

  // 非法行数 / 缺 roleId → 拒绝且**不调用数据源**（不猜、不静默改数）。
  const before = calls.length;
  for (const args of [
    { roleId: "a", lines: 0 },
    { roleId: "a", lines: -3 },
    { roleId: "a", lines: 1.5 },
    { roleId: "a", lines: "80" },
    { lines: 40 },
    { roleId: "   " },
  ]) {
    const bad = await byName.get("session_tail")!.handler({ name: "session_tail", args });
    assert.equal(bad.ok, false, `应拒绝：${JSON.stringify(args)}`);
  }
  assert.equal(calls.length, before, "非法参数不得触达数据源");

  // 失败如实：抛错「未完成」；ok:false（「无会话历史」等）原样转达；契约外「结果不明」——不编造会话内容。
  const failed = await tools({ sessionTail: () => { throw new Error("无会话目录"); } }).get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a" } });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /无会话目录/);
  const noHistory = await tools({ sessionTail: () => ({ ok: false, message: "无会话历史" }) }).get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a" } });
  assert.equal(noHistory.ok, false);
  assert.equal(noHistory.message, "无会话历史", "「无会话历史」如实原样转达");
  const silent = await tools({ sessionTail: (() => null) as unknown as SessionTailFn }).get("session_tail")!.handler({ name: "session_tail", args: { roleId: "a" } });
  assert.equal(silent.ok, false);
  assert.match(silent.message, /未返回明确结果/);
});

test("G-2/R2：propose_recovery 只提交载荷、回执如实——executed 才可称已执行；declined/unsupported/error/契约外一律 fail-closed", async () => {
  // executed：客户已确认且已执行——唯一可以称「已执行」的路径。
  const seen: ProposeRecoveryPayload[] = [];
  const byName = tools({ proposeRecovery: (p) => { seen.push(p); return { outcome: "executed", operatorId: "op-1", message: "已停本轮" }; } });
  const executed = await byName.get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "abort-turn", evidence: "role_status：busy 12 分钟", reason: "疑似卡死" } });
  assert.equal(executed.ok, true);
  assert.match(executed.message, /客户已确认/);
  assert.match(executed.message, /恢复动作已执行：abort-turn → 角色「impl」/);
  assert.match(executed.message, /操作者：op-1/);
  assert.match(executed.message, /已停本轮/);
  assert.equal(/未获执行|未执行|未成功|未获明确/.test(executed.message), false, `executed 不得携带失败措辞：${executed.message}`);
  assert.deepEqual(seen[0], { roleId: "impl", action: "abort-turn", evidence: "role_status：busy 12 分钟", reason: "疑似卡死" });

  // declined（取消/关窗/通道关闭）：ok:false「未获执行」——绝不称已执行。
  const declined = await tools({ proposeRecovery: () => ({ outcome: "declined" }) }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "rebuild-session", evidence: "ev" } });
  assert.equal(declined.ok, false);
  assert.match(declined.message, /未获执行/);
  assert.match(declined.message, /不要当它已执行/);
  assert.equal(/恢复动作已执行/.test(declined.message), false);

  // unsupported（运行时不支持）与 error（执行失败/前提不满足）：ok:false 如实——不假装已执行。
  const unsupported = await tools({ proposeRecovery: () => ({ outcome: "unsupported", message: "运行时不支持中止本轮" }) }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "abort-turn", evidence: "ev" } });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.message, /未执行/);
  assert.match(unsupported.message, /不支持/);
  assert.match(unsupported.message, /运行时不支持中止本轮/);
  assert.equal(/恢复动作已执行/.test(unsupported.message), false);
  const errored = await tools({ proposeRecovery: () => ({ outcome: "error", message: "rebuild 遇在跑轮次拒绝" }) }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "rebuild-session", evidence: "ev" } });
  assert.equal(errored.ok, false);
  assert.match(errored.message, /未执行/);
  assert.match(errored.message, /error/);
  assert.match(errored.message, /rebuild 遇在跑轮次拒绝/);
  assert.equal(/恢复动作已执行/.test(errored.message), false);

  // 契约外回执（undefined / 未知 outcome / null）：按「未获明确结果」fail-closed——绝不 caller 当已执行。
  for (const bad of [() => undefined, () => ({ outcome: "maybe" }), () => null] as unknown as ProposeRecoveryFn[]) {
    const result = await tools({ proposeRecovery: bad }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "redeliver", evidence: "ev" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /未获明确结果|未获结果/);
    assert.equal(/恢复动作已执行/.test(result.message), false);
  }

  // 参数校验（沿 report_shell_verdict 枚举先例）：非法 action / 空 evidence / 缺 roleId → 拒绝且**不调用能力**。
  let called = 0;
  const spy = tools({ proposeRecovery: () => { called += 1; return { outcome: "executed" }; } });
  for (const args of [
    { roleId: "impl", action: "delete-role", evidence: "ev" },
    { roleId: "impl", action: "abort-turn", evidence: "   " },
    { roleId: "impl", action: "abort-turn" },
    { roleId: "   ", action: "abort-turn", evidence: "ev" },
    { action: "abort-turn", evidence: "ev" },
  ]) {
    const bad = await spy.get("propose_recovery")!.handler({ name: "propose_recovery", args });
    assert.equal(bad.ok, false, `应拒绝：${JSON.stringify(args)}`);
  }
  assert.equal(called, 0, "校验失败不得触达能力（不执行、不提议）");

  // 能力抛错：ok:false「未获结果」+ 原因——不承诺执行与否。
  const thrown = await tools({ proposeRecovery: () => { throw new Error("路由不可用"); } }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "a", action: "redeliver", evidence: "ev" } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /未获结果/);
  assert.match(thrown.message, /路由不可用/);
  assert.match(thrown.message, /不要假设已执行/);

  // 预中止（＝会话已中止路径）：不调能力、不声称已执行。
  const controller = new AbortController(); controller.abort();
  let abortedCalls = 0;
  const aborted = await tools({ proposeRecovery: () => { abortedCalls += 1; return { outcome: "executed" }; } }).get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "a", action: "redeliver", evidence: "ev" }, signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(abortedCalls, 0);
  assert.match(aborted.message, /未获结果/);
  assert.match(aborted.message, /不要假设已执行/);
  assert.equal(/恢复动作已执行/.test(aborted.message), false);
});

test("G-2/R2：propose_recovery 携带轮次 metadata；等待客户期间挂起活动闸（begin/end 恰好成对、异常也收口）", async () => {
  // metadata 沿 dispatch_task 先例：入口捕获 {turnId, roleId, runtime}，无轮次则单参调用（兼容）。
  let metadata: unknown;
  const withTurn = tools({ currentTurnId: () => "turn-9", roleId: "su", runtime: "pi", proposeRecovery: (_p, meta) => { metadata = meta; return { outcome: "declined" }; } });
  await withTurn.get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "redeliver", evidence: "ev" } });
  assert.deepEqual(metadata, { turnId: "turn-9", roleId: "su", runtime: "pi" });
  let singleArg = true;
  const legacy = tools({ proposeRecovery: (_p, meta) => { singleArg = meta === undefined; return { outcome: "declined" }; } });
  await legacy.get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "abort-turn", evidence: "ev" } });
  assert.equal(singleArg, true, "无 currentTurnId 时归一为单参调用");

  // 活动闸（G-1 语义适用，§6.2）：等待期间处于 begin 态（暂停整轮硬超时）；结算后 end 恰好一次。
  const state = { begins: 0, ends: 0 };
  const gate: InteractionGate = {
    begin: () => { state.begins += 1; },
    end: () => { state.ends += 1; },
    isWaiting: () => state.begins > state.ends,
    onChange: () => () => {},
  };
  let settle!: (receipt: { outcome: "executed" }) => void;
  const waiting = tools({ proposeRecovery: () => new Promise((resolve) => { settle = resolve; }), interactionGate: gate });
  const running = waiting.get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "rebuild-session", evidence: "ev" } });
  await until(() => state.begins === 1);
  assert.equal(state.ends, 0, "等待确认卡期间闸处于挂起态");
  assert.equal(gate.isWaiting(), true);
  settle({ outcome: "executed" });
  const done = await running;
  assert.equal(done.ok, true);
  assert.equal(state.ends, 1, "结算后恰好 end 一次");

  // 能力抛错路径 finally 同样收口（end 恰好一次）——不留悬挂闸。
  const state2 = { begins: 0, ends: 0 };
  const gate2: InteractionGate = { begin: () => { state2.begins += 1; }, end: () => { state2.ends += 1; }, isWaiting: () => state2.begins > state2.ends, onChange: () => () => {} };
  const failing = tools({ proposeRecovery: () => { throw new Error("x"); }, interactionGate: gate2 });
  const failed = await failing.get("propose_recovery")!.handler({ name: "propose_recovery", args: { roleId: "impl", action: "abort-turn", evidence: "ev" } });
  assert.equal(failed.ok, false);
  assert.equal(state2.begins, 1);
  assert.equal(state2.ends, 1);
});
