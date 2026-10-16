// test/测试/g2-verify/r1-r2-tools.test.ts —— G-2 独立复验「R1 只读工具 + R2 恢复提议」工具层对抗域。
//
// 覆盖（独立构造；直接经 buildGovernedTools 驱动真工具 handler，不经过实施方断言）：
//   · 「注入才注册」逐项——缺省不存在；各自注入才注册自己；
//   · role_status：纯读（只调数据源、不触其它能力——哨兵被碰即抛）、8 KiB 字节级截断（恰 8192 不截/
//     8193 截、不劈多字节/代理对、truncated 标注）、ok:false 如实原样、契约外 fail-honest、抛错如实不编造、
//     非法 roleId 拒绝且不触达数据源、includeDiagnostics 非布尔不猜、预中止不调数据源；
//   · session_tail：行数归一 40/200 恰边界、非法参数拒绝且不触达、clamp 如实标注、失败如实；
//   · propose_recovery：动作集恰三值、evidence 必填、载荷逐字段转交、回执四值如实（后三值绝不称已执行）、
//     契约外 fail-closed、活动闸 begin/end 恰一次（含抛错路径）、预中止/中途中止「未获结果」不承诺。

import test from "node:test";
import assert from "node:assert/strict";

import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import type {
  GovernedToolsOptions,
  InteractionGate,
  ProposeRecoveryPayload,
  RecoveryReceipt,
  RoleStatusPayload,
  SessionTailPayload,
  WriteGate,
} from "../../../src/model/runtime.ts";

// 写类工具在本复验中永不触达——被调用即抛（哨兵）。
const gate: WriteGate = () => {
  throw new Error("复验哨兵：写类 gate 不得被触达");
};

const toolsOf = (options: GovernedToolsOptions): Map<string, { handler: (call: { name: string; args: Record<string, unknown>; toolCallId?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; message: string }> }> =>
  new Map(buildGovernedTools(gate, options).map((t) => [t.name, t as never]));

const call = async (
  options: GovernedToolsOptions,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> => {
  const tool = toolsOf(options).get(name);
  assert.ok(tool, `工具 ${name} 应存在`);
  return tool!.handler({ name, args, toolCallId: `verify-${name}`, ...(signal ? { signal } : {}) });
};

// ————————————————————— 注入才注册 —————————————————————

test("R1/R2 注入才注册：缺省三工具均不存在；各自注入才注册自己", () => {
  const base = toolsOf({});
  for (const n of ["role_status", "session_tail", "propose_recovery"]) assert.ok(!base.has(n), `缺省不得注册 ${n}`);
  const onlyStatus = toolsOf({ roleStatus: async () => ({ ok: true, text: "t" }) });
  assert.ok(onlyStatus.has("role_status") && !onlyStatus.has("session_tail") && !onlyStatus.has("propose_recovery"), "仅注册已注入者");
  const onlyTail = toolsOf({ sessionTail: async () => ({ ok: true, text: "t" }) });
  assert.ok(onlyTail.has("session_tail") && !onlyTail.has("role_status"), "仅注册已注入者");
  const onlyPropose = toolsOf({ proposeRecovery: async () => ({ outcome: "declined" }) });
  assert.ok(onlyPropose.has("propose_recovery") && !onlyPropose.has("role_status"), "仅注册已注入者");
});

// ————————————————————— role_status —————————————————————

test("R1 role_status：纯读接口（只触达注入数据源一次、查询逐字段传对）＋ ok:false 如实原样", async () => {
  const seen: RoleStatusPayload[] = [];
  let otherTouched = false;
  const opts: GovernedToolsOptions = {
    roleStatus: async (query) => {
      seen.push(query);
      return { ok: true, text: `STATUS(${query.roleId ?? "ALL"}:${query.includeDiagnostics === true})` };
    },
    sessionTail: async () => {
      otherTouched = true;
      return { ok: false, message: "不应被触达" };
    },
    proposeRecovery: async () => {
      otherTouched = true;
      return { outcome: "declined" };
    },
  };
  const r1 = await call(opts, "role_status", {});
  assert.equal(r1.ok, true);
  assert.equal(r1.message, "STATUS(ALL:false)", "缺省＝全项目概览；查询原样转达");
  assert.deepEqual(seen, [{}], "数据源恰被调用一次、查询缺省无杂字段");
  const r2 = await call(opts, "role_status", { roleId: "X", includeDiagnostics: true });
  assert.equal(r2.message, "STATUS(X:true)");
  assert.deepEqual(seen.at(-1), { roleId: "X", includeDiagnostics: true }, "查询字段透传");
  assert.equal(otherTouched, false, "哨兵未被触达（纯读两工具互不越界）");
  // ok:false 如实原样
  const r3 = await call({ roleStatus: async () => ({ ok: false, message: "诊断不可用：lastError=磁盘满" }) }, "role_status", {});
  assert.equal(r3.ok, false);
  assert.equal(r3.message, "诊断不可用：lastError=磁盘满", "数据层如实文本原样转达");
  // ok:false 未提供原因 ⇒ 如实标注（不编造）
  const r4 = await call({ roleStatus: async () => ({ ok: false }) }, "role_status", {});
  assert.equal(r4.ok, false);
  assert.ok(r4.message.includes("未提供原因"), `如实标注：${r4.message}`);
});

test("R1 role_status：8 KiB 字节级截断边界（恰 8192 不截 / 8193 截且总字节 ≤ 8192、truncated 标注、不劈码点）", async () => {
  const mk = (text: string): GovernedToolsOptions => ({ roleStatus: async () => ({ ok: true, text }) });
  const exact = "a".repeat(8192);
  const r1 = await call(mk(exact), "role_status", {});
  assert.equal(r1.ok, true);
  assert.equal(r1.message, exact, "恰 8192 字节：不截断");
  assert.ok(!r1.message.includes("truncated"), "无 truncated 标注");
  const over = "a".repeat(8193);
  const r2 = await call(mk(over), "role_status", {});
  assert.ok(r2.message.includes("[truncated：状态输出超过 8 KiB 上限，已按 UTF-8 字节截断]"), "如实截断标注");
  assert.ok(Buffer.byteLength(r2.message, "utf8") <= 8192, `总字节 ≤ 8192：${Buffer.byteLength(r2.message, "utf8")}`);
  assert.ok(r2.message.startsWith("a".repeat(100)), "前缀保留");
  // 多字节边界：不劈码点、无替换符；截断前正文为原串前缀
  const cjk = "汉".repeat(4000); // 12000 字节
  const r3 = await call(mk(cjk), "role_status", {});
  assert.ok(Buffer.byteLength(r3.message, "utf8") <= 8192, "CJK：总字节 ≤ 8192");
  assert.ok(!r3.message.includes("�"), "不得出现替换符（码点未被劈开）");
  const marker = "\n[truncated：状态输出超过 8 KiB 上限，已按 UTF-8 字节截断]";
  assert.ok(r3.message.endsWith(marker), "标注在尾部");
  const body = r3.message.slice(0, -marker.length);
  assert.ok(cjk.startsWith(body) && body.length > 0, "截断正文＝原串前缀（未重排/未打乱）");
  // 代理对（emoji 4 字节）边界同样不劈
  const emoji = "🧪".repeat(2200); // 8800 字节
  const r4 = await call(mk(emoji), "role_status", {});
  assert.ok(Buffer.byteLength(r4.message, "utf8") <= 8192);
  assert.ok(!r4.message.includes("�"), "emoji：代理对不被劈开");
});

test("R1 role_status：契约外回执 fail-honest；抛错如实「读取未完成」；非法 roleId 拒绝且不触达数据源；预中止不调数据源", async () => {
  let calls = 0;
  const counted = (fn: (q: RoleStatusPayload) => Promise<unknown>): GovernedToolsOptions => ({
    roleStatus: ((q: RoleStatusPayload) => {
      calls += 1;
      return fn(q);
    }) as never,
  });
  // 契约外：undefined / {} / ok 非布尔
  for (const bad of [undefined, {}, { ok: "yes" }]) {
    const source = counted(async () => bad);
    const r = await call(source, "role_status", {});
    assert.equal(r.ok, false, `契约外 ${JSON.stringify(bad)} ⇒ ok:false`);
    assert.ok(/未返回明确结果|结果不明|未返回文本/.test(r.message), `fail-honest：${r.message}`);
  }
  // ok:true 无 text ⇒ 结果不明
  const rNoText = await call(counted(async () => ({ ok: true })), "role_status", {});
  assert.equal(rNoText.ok, false);
  assert.ok(rNoText.message.includes("未返回文本"), `如实：${rNoText.message}`);
  // 抛错 ⇒ 「读取未完成」＋不要推断
  const rThrow = await call(counted(async () => Promise.reject(new Error("夹具：快照读取失败"))), "role_status", {});
  assert.equal(rThrow.ok, false);
  assert.ok(rThrow.message.includes("读取") && rThrow.message.includes("未完成"), `如实：${rThrow.message}`);
  assert.ok(rThrow.message.includes("不要推断"), "不引导推断状态");
  // 非法 roleId（给了键、非字符串）⇒ 拒绝且不触达数据源（不静默退化概览）
  const before = calls;
  const rBad = await call(counted(async () => ({ ok: true, text: "x" })), "role_status", { roleId: 42 });
  assert.equal(rBad.ok, false);
  assert.equal(calls, before, "非法 roleId：零触达数据源");
  assert.ok(rBad.message.includes("roleId 参数非法"), `如实：${rBad.message}`);
  // includeDiagnostics 非布尔 ⇒ 视作未提供（不猜、不打断）
  const rBool = await call(counted(async () => ({ ok: true, text: "y" })), "role_status", { includeDiagnostics: "yes" });
  assert.equal(rBool.ok, true, "非布尔 includeDiagnostics 不打断查询");
  // 预中止 ⇒ 不调数据源
  const ctrl = new AbortController();
  ctrl.abort();
  const pre = calls;
  const rAbort = await call(counted(async () => ({ ok: true, text: "z" })), "role_status", {}, ctrl.signal);
  assert.equal(rAbort.ok, false, "预中止：fail-closed");
  assert.equal(calls, pre, "预中止：零触达数据源");
});

// ————————————————————— session_tail —————————————————————

test("R1 session_tail：行数归一（缺省 40/显式/恰 200/超限如实标注）；非法参数拒绝且不触达；失败如实", async () => {
  const seen: SessionTailPayload[] = [];
  const opts: GovernedToolsOptions = {
    sessionTail: async (q) => {
      seen.push(q);
      return { ok: true, text: `TAIL(${q.roleId}:${q.lines})` };
    },
  };
  const r1 = await call(opts, "session_tail", { roleId: "X" });
  assert.equal(r1.message, "TAIL(X:40)", "缺省 40");
  assert.deepEqual(seen.at(-1), { roleId: "X", lines: 40 });
  const r2 = await call(opts, "session_tail", { roleId: "X", lines: 5 });
  assert.equal(r2.message, "TAIL(X:5)");
  const r3 = await call(opts, "session_tail", { roleId: "X", lines: 200 });
  assert.equal(r3.message, "TAIL(X:200)", "恰 200：原样");
  const r4 = await call(opts, "session_tail", { roleId: "X", lines: 500 });
  assert.equal(r4.message, `[已按上限取尾：请求 500 行 → 取 200 行]\nTAIL(X:200)`, "超限：按上限取并如实标注");
  // 非法参数拒绝且不触达数据源
  for (const bad of [{ lines: 0 }, { lines: -1 }, { lines: 2.5 }, { lines: "7" }]) {
    const before = seen.length;
    const r = await call(opts, "session_tail", { roleId: "X", ...bad });
    assert.equal(r.ok, false, `非法 ${JSON.stringify(bad)} ⇒ 拒绝`);
    assert.equal(seen.length, before, "零触达数据源");
  }
  for (const missing of [{}, { roleId: "" }, { roleId: "   " }]) {
    const before = seen.length;
    const r = await call(opts, "session_tail", missing);
    assert.equal(r.ok, false, `缺 roleId ${JSON.stringify(missing)} ⇒ 拒绝`);
    assert.equal(seen.length, before, "零触达数据源");
  }
  // 失败如实（「无会话历史」）
  const r5 = await call({ sessionTail: async () => ({ ok: false, message: "无会话历史（来源 无会话文件；规范行 0 条，跳过 0 行）" }) }, "session_tail", { roleId: "X" });
  assert.equal(r5.ok, false);
  assert.ok(r5.message.includes("无会话历史"), "如实原样");
});

// ————————————————————— propose_recovery —————————————————————

test("R2 propose_recovery：动作集恰三值（其余拒绝且不调能力）；evidence 必填；载荷逐字段转交（含 reason/itemId/metadata）", async () => {
  const seen: ProposeRecoveryPayload[] = [];
  const meta: unknown[] = [];
  const opts: GovernedToolsOptions = {
    currentTurnId: () => "turn-9",
    roleId: "su",
    runtime: "demo",
    proposeRecovery: async (payload, metadata) => {
      seen.push(payload);
      meta.push(metadata);
      return { outcome: "declined", message: "复验" };
    },
  };
  for (const action of ["abort-turn", "rebuild-session", "redeliver"] as const) {
    const r = await call(opts, "propose_recovery", { roleId: "X", action, evidence: "证据" });
    assert.equal(r.ok, false, `${action}：declined ⇒ ok:false（未执行）`);
    assert.deepEqual(seen.at(-1), { roleId: "X", action, evidence: "证据" }, "载荷逐字段转交");
  }
  const rFull = await call(opts, "propose_recovery", { roleId: "X", action: "redeliver", evidence: "e", reason: "卡住", itemId: "id-1" });
  assert.deepEqual(seen.at(-1), { roleId: "X", action: "redeliver", evidence: "e", reason: "卡住", itemId: "id-1" }, "可选字段转交");
  assert.deepEqual(meta.at(-1), { turnId: "turn-9", roleId: "su", runtime: "demo" }, "metadata（turnId/角色/引擎）与先例一致");
  // 非法：动作/证据/角色 ⇒ 拒绝且零调用
  const before = seen.length;
  for (const bad of [
    { roleId: "X", action: "disable-role", evidence: "e" },
    { roleId: "X", action: "abort-turn", evidence: "  " },
    { roleId: "X", action: "abort-turn" },
    { action: "abort-turn", evidence: "e" },
  ]) {
    const r = await call(opts, "propose_recovery", bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} ⇒ 拒绝`);
  }
  assert.equal(seen.length, before, "非法载荷：零触达能力（不推卡不执行）");
});

test("R2 propose_recovery：回执四值如实——恰 executed 可称已执行；declined/unsupported/error 一律未执行；契约外 fail-closed", async () => {
  const mk = (receipt: unknown): GovernedToolsOptions => ({ proposeRecovery: (async () => receipt) as never });
  const args = { roleId: "X", action: "abort-turn", evidence: "e" };
  const executed = await call(mk({ outcome: "executed", operatorId: "op1", message: "已请求停止" }), "propose_recovery", args);
  assert.equal(executed.ok, true, "executed ⇒ 唯一可称已执行路径");
  assert.ok(executed.message.includes("已执行"), "executed 文案");
  assert.ok(executed.message.includes("操作者：op1"), "确认者标识转达");
  assert.ok(executed.message.includes("已请求停止"), "detail 透传");
  const declined = await call(mk({ outcome: "declined", message: "客户取消" }), "propose_recovery", args);
  assert.equal(declined.ok, false, "declined ⇒ ok:false");
  assert.ok(declined.message.includes("未获执行") && declined.message.includes("不要当它已执行"), `如实：${declined.message}`);
  assert.ok(!declined.message.includes("已执行："), "不称已执行");
  const unsupported = await call(mk({ outcome: "unsupported" }), "propose_recovery", args);
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.message.includes("未执行") && unsupported.message.includes("不支持") && unsupported.message.includes("不要当它已执行"), `如实：${unsupported.message}`);
  const error = await call(mk({ outcome: "error", message: "该角色有轮次在跑" }), "propose_recovery", args);
  assert.equal(error.ok, false);
  assert.ok(error.message.includes("未执行") && error.message.includes("该角色有轮次在跑") && error.message.includes("不要当它已执行"), `如实：${error.message}`);
  // 契约外：undefined / 未知 outcome / null
  for (const bad of [undefined, { outcome: "done" }, null]) {
    const r = await call(mk(bad), "propose_recovery", args);
    assert.equal(r.ok, false, `契约外 ${JSON.stringify(bad)} ⇒ fail-closed`);
    assert.ok(r.message.includes("未获明确结果"), `如实：${r.message}`);
    assert.ok(r.message.includes("不要当它已执行"), "绝不误导为已执行");
  }
});

test("R2 propose_recovery：活动闸 begin/end 恰一次（含能力抛错路径）；预中止/中途中止「未获结果」不承诺", async () => {
  let begins = 0;
  let ends = 0;
  const gateStub: InteractionGate = {
    begin: () => {
      begins += 1;
    },
    end: () => {
      ends += 1;
    },
    isWaiting: () => begins > ends,
    onChange: () => () => {},
  };
  const args = { roleId: "X", action: "abort-turn", evidence: "e" };
  // 正常路径
  const ok = await call({ proposeRecovery: async () => ({ outcome: "declined" }), interactionGate: gateStub }, "propose_recovery", args);
  assert.equal(ok.ok, false);
  assert.equal(begins, 1, "begin 恰一次");
  assert.equal(ends, 1, "end 恰一次");
  // 能力抛错路径：finally 同样收口恰一次
  const thrown = await call({ proposeRecovery: (async () => Promise.reject(new Error("夹具：能力异常"))) as never, interactionGate: gateStub }, "propose_recovery", args);
  assert.equal(thrown.ok, false);
  assert.ok(thrown.message.includes("未获结果") && thrown.message.includes("不要假设已执行"), `如实：${thrown.message}`);
  assert.equal(begins, 2, "第二次 begin");
  assert.equal(ends, 2, "抛错路径 finally 收口（end 不悬空）");
  // 预中止 ⇒ 不调能力
  let proCalls = 0;
  const ctrl = new AbortController();
  ctrl.abort();
  const pre = await call({ proposeRecovery: (async () => { proCalls += 1; return { outcome: "declined" }; }) as never, interactionGate: gateStub }, "propose_recovery", args, ctrl.signal);
  assert.equal(pre.ok, false);
  assert.equal(proCalls, 0, "预中止：零触达能力");
  assert.ok(pre.message.includes("未获结果") || pre.message.includes("未执行"), `如实：${pre.message}`);
  // 中途中止：能力未决 ⇒ raceAbort 立即返回「未获结果」
  let resolveFn!: (v: RecoveryReceipt) => void;
  const hanging = new Promise<RecoveryReceipt>((resolve) => {
    resolveFn = resolve;
  });
  const ctrl2 = new AbortController();
  const pending = call({ proposeRecovery: (() => hanging) as never, interactionGate: gateStub }, "propose_recovery", args, ctrl2.signal);
  ctrl2.abort();
  const mid = await pending;
  assert.equal(mid.ok, false, "中途中止：fail-closed");
  assert.ok(mid.message.includes("未获结果") && mid.message.includes("不要假设已执行"), `如实：${mid.message}`);
  assert.equal(begins, ends, "begin/end 配平（含中止路径）");
  resolveFn({ outcome: "declined" }); // 迟到结算不改变结果
});
