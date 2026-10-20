// test/编排/watchdog.test.ts
// 编排角色自测：G-2/O1——看护**文案单一来源**（`src/common/编排/watchdog.ts`）＋看护三能力的
// **承载契约**（`openRoleSession` 只 su 注入 roleStatus/sessionTail/proposeRecovery，端到端注册三工具）。
// 2026-10-18 客户要求移除完成态「收束」提示（验收通过即收束）——本套件不再钉收束文案。
// 桩适配器/演示替身，不触网；临时目录用后清理。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import type { RuntimeProviderFactory, RuntimeProviderOptions, ToolResult } from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import {
  RECOVERY_ACTIONS,
  WATCHDOG_ALERT_PREFIX,
  WATCHDOG_DISCIPLINE_LINE,
  WATCHDOG_PROMPT_GUIDELINES,
  WATCHDOG_RECOVERY_PREFIX,
  renderRecoveryReceipt,
  renderWatchdogAlert,
  renderWatchdogRecovery,
  renderWatchdogStormGuard,
  type ProposeRecoveryFn,
  type RoleStatusFn,
  type SessionTailFn,
} from "../../src/common/编排/watchdog.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts；su 经 builtInRoles 声明）——
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-watchdog-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

function stubAdapter(events: SessionEvent[] = [{ kind: "settled", summary: "会话结束" }]): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                for (const e of events) yield e;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

/** 事件队列（沿 test/编排/runtime-orchestration.test.ts 先例——真实 Service 装配 + 假外部引擎）。 */
function queue() {
  const pending: SessionEvent[] = [];
  let waiter: (() => void) | undefined;
  let closed = false;
  return {
    push(event: SessionEvent) { pending.push(event); waiter?.(); waiter = undefined; },
    close() { closed = true; waiter?.(); waiter = undefined; },
    async *events() {
      while (true) {
        if (pending.length) { yield pending.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    },
  };
}

function fakeProvider(
  work: (options: RuntimeProviderOptions, text: string, signal: AbortSignal) => Promise<void> = async () => {},
): { factory: RuntimeProviderFactory; calls: RuntimeProviderOptions[] } {
  const calls: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = (options) => {
    calls.push(options);
    assert.equal(options.toolDisplayMode, "required-v1");
    options.registerToolDisplayProfile!({ credentials: [] });
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        const events = queue();
        let controller = new AbortController();
        return {
          runtime: options.runtime,
          get contextSource() { return "in-memory" as const; },
          get nativeSessionId() { return undefined; },
          get contextWarning() { return undefined; },
          async prompt(text: string) {
            controller = new AbortController();
            await work(options, text, controller.signal);
            events.push({ kind: "settled", summary: "engine settled", turnId: options.currentTurnId(), detail: { outcome: "completed" } });
          },
          events: () => events.events(),
          async abort() { controller.abort(); },
          async dispose() { controller.abort(); events.close(); },
        };
      },
    } satisfies RuntimeAdapter;
  };
  return { factory, calls };
}

async function callTool(options: RuntimeProviderOptions, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  const tool = options.tools.find((item) => item.name === name);
  assert.ok(tool, `已注册工具 ${name}`);
  return tool.handler({ name, args, toolCallId: name, signal });
}

// —— 文首标记契约（与桌面UI U1 的 tool-rows.js::SYSTEM_HEAD 归类判据对齐） ——

test("文首标记契约（U1 对齐）：告警/恢复两前缀与全部渲染输出满足 `[系统·<子类>] `+空白；中点为 U+00B7", () => {
  const marker = /^\[系统·[^[\]\r\n]{1,12}\](?:\s|$)/;
  const outputs = [
    WATCHDOG_ALERT_PREFIX,
    WATCHDOG_RECOVERY_PREFIX,
    renderWatchdogAlert({ signal: "queue-stuck", roleId: "X", facts: ["f"] }),
    renderWatchdogRecovery({ signal: "queue-stuck", roleId: "X", hits: 1, suppressed: 0 }),
    renderWatchdogStormGuard(1),
    renderRecoveryReceipt({ action: "abort-turn", targetRoleId: "X", outcome: "executed" }),
  ];
  for (const text of outputs) {
    assert.ok(marker.test(text), `标记形态必须闭合于 ] 且其后为空白/文末（改形态 = system 类静默回落）：${JSON.stringify(text.slice(0, 12))}`);
  }
  for (const prefix of [WATCHDOG_ALERT_PREFIX, WATCHDOG_RECOVERY_PREFIX]) {
    assert.equal(prefix[0], "["); assert.equal(prefix[1], "系"); assert.equal(prefix[2], "统");
    assert.equal(prefix.charCodeAt(3), 0xb7, "第 4 个码点必须是中点 U+00B7（与渲染侧 SYSTEM_HEAD 逐字节一致）");
    assert.equal(prefix[prefix.length - 1], "]");
  }
  for (const text of outputs.slice(2)) assert.ok(text.startsWith("[系统·"), "渲染输出恒以标记起始");
});

// —— 文案单一来源：告警（设计 §3.3） ——

test("renderWatchdogAlert：投递排队积压逐行金文本（文首/信号/角色/事实/建议/纪律；事实如实拼接）", () => {
  const text = renderWatchdogAlert({
    signal: "queue-stuck",
    roleId: "实现者",
    facts: ["队首任务已排队 12 分钟（深度 3）", "- [dispatch] 来自 su：补上校验（入队 02:10:03）"],
  });
  assert.equal(
    text,
    [
      "[系统·看护] 投递排队积压：角色「实现者」。",
      "事实：队首任务已排队 12 分钟（深度 3）；- [dispatch] 来自 su：补上校验（入队 02:10:03）",
      "建议：先用 role_status（必要时 session_tail）核对；若确认卡死，可 propose_recovery（开关开启时桌面自动执行，关闭时需客户一键确认）。",
      "纪律：看护仅如实告知——是否处理由你判断；不得据此假设任何写权。",
    ].join("\n"),
  );
  assert.ok(text.startsWith(`${WATCHDOG_ALERT_PREFIX} `), "文首统一 [系统·看护] + 空格");
  assert.ok(text.includes(`纪律：${WATCHDOG_DISCIPLINE_LINE}`), "纪律句引用单一来源常量");
  assert.ok(!/已授权|放行|许可|可以写|获得写权/.test(text), "不夹带任何授权语义（看护不改判定链）");
});

test("renderWatchdogAlert：四信号各有信号名与建议；#3 明确「通常无需动作」；空/空白事实剔除", () => {
  const cases = [
    { signal: "turn-deadline" as const, label: "轮次到点检查" },
    { signal: "queue-stuck" as const, label: "投递排队积压" },
    { signal: "cmd-timeout" as const, label: "命令超时" },
    { signal: "repeat-fail" as const, label: "重复失败" },
  ];
  const suggestions = new Set<string>();
  for (const c of cases) {
    const text = renderWatchdogAlert({ signal: c.signal, roleId: "X", facts: ["事实一", "  ", "事实二"] });
    assert.ok(text.includes(`${c.label}：角色「X」。`), `${c.signal} 信号名与角色在场`);
    assert.ok(text.includes("事实：事实一；事实二"), `${c.signal} 空白事实剔除、其余按序拼接`);
    assert.ok(text.includes(`纪律：${WATCHDOG_DISCIPLINE_LINE}`), `${c.signal} 纪律句恒在场`);
    suggestions.add(text.split("\n")[2]);
  }
  assert.equal(suggestions.size, 4, "四信号建议动作各不相同（单一来源分派，非同一句复用）");
  const cmd = renderWatchdogAlert({ signal: "cmd-timeout", roleId: "X", facts: ["一条命令超出时限已终止"] });
  assert.ok(cmd.includes("通常无需动作"), "#3 命令超时按设计口径注明「通常无需动作」");
  assert.ok(cmd.includes("轮次继续"), "#3 注明 F-1 自愈语义（轮次继续）");
});

test("turn-deadline：开关开启超时自动中止；关闭只检查不中止（1 小时兜底）；恢复提议按开关自动/确认", () => {
  const text = renderWatchdogAlert({
    signal: "turn-deadline",
    roleId: "实现者",
    facts: ["本轮已运行约 5 分钟（看护检查时限 5 分钟，到点检查）"],
  });
  assert.ok(text.includes("轮次到点检查：角色「实现者」。"), "标签＝轮次到点检查");
  assert.ok(text.includes("开关开启且超过自动中止时限 ⇒ 桌面自动中止本轮"), "开关开启：超时自动中止");
  assert.ok(text.includes("开关关闭 ⇒ 只检查、不中止（1 小时最后兜底）"), "开关关闭：只检查不中止 + 1 小时兜底");
  assert.ok(text.includes("开关开启时 propose_recovery 由桌面自动执行，关闭时需客户确认"), "恢复提议按开关自动/确认");
  for (const forbidden of ["到点检查不中止本轮", "逼近超时", "已超时", "硬超时", "剩余量"]) {
    assert.equal(text.includes(forbidden), false, `不得出现旧措辞：${forbidden}`);
  }

  // 恢复行随 label 自动变化（kind 未变），仍不得写成「逼近超时」。
  const recovery = renderWatchdogRecovery({ signal: "turn-deadline", roleId: "实现者", hits: 1, suppressed: 0 });
  assert.ok(recovery.includes("轮次到点检查"));
  assert.equal(recovery.includes("逼近超时"), false);
});

test("renderWatchdogAlert：事实为空 → 如实标注（不编造）；renderWatchdogRecovery / 风暴护栏逐字", () => {
  const empty = renderWatchdogAlert({ signal: "repeat-fail", roleId: "X", facts: ["  "] });
  assert.ok(empty.includes("事实：（检测侧未附事实）"), "无事实不编造——如实标注");

  assert.equal(
    renderWatchdogRecovery({ signal: "queue-stuck", roleId: "实现者", hits: 3, suppressed: 2 }),
    "[系统·看护] 看护恢复：投递排队积压（角色「实现者」）已解除（期间共命中 3 次，抑制 2 条）。",
  );
  assert.equal(
    renderWatchdogStormGuard(7),
    "[系统·看护] 看护告警已抑制 7 条（风暴护栏）。",
  );
  assert.equal(renderWatchdogStormGuard(2.9), "[系统·看护] 看护告警已抑制 2 条（风暴护栏）。", "非整数向下取整");
  assert.equal(renderWatchdogStormGuard(-1), "[系统·看护] 看护告警已抑制 0 条（风暴护栏）。", "负数归零");
});

// —— 文案单一来源：恢复回执（设计 §六） ——

test("renderRecoveryReceipt：executed 逐行金文本；确认者 operator:<id>；时间可注入", () => {
  const text = renderRecoveryReceipt({
    action: "abort-turn",
    targetRoleId: "实现者",
    outcome: "executed",
    message: "已停止当前轮次，等待 settled 收尾。",
    operatorId: "wang",
    at: "2026-10-16T02:10:03.000Z",
  });
  assert.equal(
    text,
    [
      "[系统·恢复] 恢复回执：动作「abort-turn」｜目标角色「实现者」｜结果：已执行。",
      "说明：已停止当前轮次，等待 settled 收尾。",
      "确认者：operator:wang；时间：2026-10-16T02:10:03.000Z",
    ].join("\n"),
  );
  assert.ok(text.startsWith(`${WATCHDOG_RECOVERY_PREFIX} `), "文首统一 [系统·恢复] + 空格");
});

test("renderRecoveryReceipt：四值如实（declined/unsupported/error 不假装已执行；恰 executed 为已执行）", () => {
  const declined = renderRecoveryReceipt({ action: "redeliver", targetRoleId: "X", outcome: "declined" });
  assert.ok(declined.includes("结果：未执行（未获客户确认/已取消）。"), "取消/关窗 = 未获执行（fail-closed）");
  const unsupported = renderRecoveryReceipt({ action: "rebuild-session", targetRoleId: "X", outcome: "unsupported", message: "当前运行时不支持重建" });
  assert.ok(unsupported.includes("结果：未执行（当前运行时不支持）。"), "运行时不支持如实");
  assert.ok(unsupported.includes("说明：当前运行时不支持重建"));
  const errored = renderRecoveryReceipt({ action: "rebuild-session", targetRoleId: "X", outcome: "error", message: "该角色有在跑轮次，未重建（在跑不打断）" });
  assert.ok(errored.includes("结果：未执行（执行失败）。"), "执行失败如实");
  assert.ok(errored.includes("在跑不打断"));
  assert.ok(!declined.includes("已执行"), "未执行的回执不得出现「已执行」");
});

test("renderRecoveryReceipt：operatorId 缺省/空白 → operator:未知操作者；message 缺省不出现说明行；now 可注入", () => {
  const bare = renderRecoveryReceipt({
    action: "abort-turn",
    targetRoleId: "X",
    outcome: "declined",
    now: () => new Date("2026-10-16T03:00:00.000Z"),
  });
  assert.equal(
    bare,
    [
      "[系统·恢复] 恢复回执：动作「abort-turn」｜目标角色「X」｜结果：未执行（未获客户确认/已取消）。",
      "确认者：operator:未知操作者；时间：2026-10-16T03:00:00.000Z",
    ].join("\n"),
  );
  assert.ok(!bare.includes("说明："), "无 message 不出现说明行");
  const blank = renderRecoveryReceipt({ action: "abort-turn", targetRoleId: "X", outcome: "declined", operatorId: "   " });
  assert.ok(blank.includes("operator:未知操作者"), "空白 operatorId 同缺省");
  assert.equal(RECOVERY_ACTIONS.join(","), "abort-turn,rebuild-session,redeliver", "V1 动作集恰三项（客户裁定）");
});

// —— promptGuidelines（su 看护纪律；与门禁引擎 G 卡文本同口径） ——

test("WATCHDOG_PROMPT_GUIDELINES：三条纪律钉住（可自查／只提议不执行／不得据此假设写权）", () => {
  assert.equal(WATCHDOG_PROMPT_GUIDELINES.length, 3);
  const joined = WATCHDOG_PROMPT_GUIDELINES.join("\n");
  assert.ok(joined.includes("role_status") && joined.includes("session_tail"), "可自查：指向两只读工具");
  assert.ok(joined.includes("「状态正常，忽略」是合法结局"), "不强迫动作（核对后忽略合法）");
  assert.ok(joined.includes("propose_recovery"), "指向恢复提议工具");
  assert.ok(joined.includes("提议 ≠ 执行"), "只提议不执行");
  assert.ok(joined.includes("未获确认一律零执行"), "未获客户确认零执行");
  assert.ok(joined.includes("不得据此假设任何写权"), "不得据此假设写权");
  assert.ok(joined.includes("不构成任何授权或验收结论"), "看护提示 ≠ 授权/验收结论");
  assert.ok(!joined.includes("收束"), "看护纪律不再提收束（2026-10-18 客户要求移除）");
  for (const line of WATCHDOG_PROMPT_GUIDELINES) assert.ok(!line.includes("\n"), "每条为单行准则条目");
});

// —— 承载契约：openRoleSession 只 su 注入三能力（桩捕获能力面） ——

test("openRoleSession（O1/G-2）：roleStatus / sessionTail / proposeRecovery **只给治理角色 su** 透传；项目角色不给；未给路由不注入", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const roleStatus: RoleStatusFn = async () => ({ ok: true, text: "role_status 输出" });
    const sessionTail: SessionTailFn = async () => ({ ok: true, text: "session_tail 输出" });
    const proposeRecovery: ProposeRecoveryFn = async () => ({ outcome: "declined" });

    // su 会话 → 三项原引用透传（工具据此注册）。
    const suStub = stubAdapter();
    const suHandle = await openRoleSession(
      { roleId: "su", project, roleStatus, sessionTail, proposeRecovery },
      { createAdapter: suStub.createAdapter },
    );
    assert.equal(suStub.caps()?.roleStatus, roleStatus, "su 会话应拿到 roleStatus 能力");
    assert.equal(suStub.caps()?.sessionTail, sessionTail, "su 会话应拿到 sessionTail 能力");
    assert.equal(suStub.caps()?.proposeRecovery, proposeRecovery, "su 会话应拿到 proposeRecovery 能力");
    await suHandle.dispose();

    // 项目角色会话（即便调用方误给）→ 一律不注入（工具不注册）。
    const xStub = stubAdapter();
    const xHandle = await openRoleSession(
      { roleId: "X", project, roleStatus, sessionTail, proposeRecovery },
      { createAdapter: xStub.createAdapter },
    );
    assert.equal(xStub.caps()?.roleStatus, undefined, "项目角色会话不得注入 roleStatus（只给 su）");
    assert.equal(xStub.caps()?.sessionTail, undefined, "项目角色会话不得注入 sessionTail（只给 su）");
    assert.equal(xStub.caps()?.proposeRecovery, undefined, "项目角色会话不得注入 proposeRecovery（只给 su）");
    await xHandle.dispose();

    // su 会话未给能力（CLI 一次性前端等）→ 不注入（能力缺席 = fail-closed）。
    const bareStub = stubAdapter();
    const bareHandle = await openRoleSession({ roleId: "su", project }, { createAdapter: bareStub.createAdapter });
    assert.equal(bareStub.caps()?.roleStatus, undefined, "未给能力 → 不注入");
    assert.equal(bareStub.caps()?.sessionTail, undefined, "未给能力 → 不注入");
    assert.equal(bareStub.caps()?.proposeRecovery, undefined, "未给能力 → 不注入");
    await bareHandle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— 承载契约：端到端（真实 Service 装配 + 演示替身）——su 注册三工具且 handler 直达注入实现 ——

test("端到端（G-2/O1）：su 会话经真实装配注册三工具且 handler 直达注入实现；项目角色不注册", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  const roleStatus: RoleStatusFn = async () => ({ ok: true, text: "ROLE-STATUS-TEXT（快照）" });
  const sessionTail: SessionTailFn = async (query) => ({ ok: true, text: `TAIL(${query.roleId}:${query.lines})` });
  const proposeRecovery: ProposeRecoveryFn = async () => ({ outcome: "declined", message: "客户取消" });

  const results: ToolResult[] = [];
  const suProvider = fakeProvider(async (options, _text, signal) => {
    results.push(await callTool(options, "role_status", {}, signal));
    results.push(await callTool(options, "session_tail", { roleId: "X", lines: 5 }, signal));
    results.push(await callTool(options, "propose_recovery", { roleId: "X", action: "abort-turn", evidence: "快照证据" }, signal));
  });
  const xProvider = fakeProvider();
  const runtimeOptions = { providerFactories: { demo: suProvider.factory }, persistSession: false };
  try {
    const suHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", roleStatus, sessionTail, proposeRecovery },
      { runtimeOptions },
    );
    await suHandle.send("开始看护自查");
    for await (const ev of suHandle.events()) if (ev.kind === "settled") break;
    const suTools = suProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    for (const name of ["role_status", "session_tail", "propose_recovery"]) {
      assert.ok(suTools.includes(name), `su 会话应注册 ${name}（注入才注册）`);
    }
    // handler 直达注入实现：role_status 原样转达文本；session_tail 归一后带行数调用；
    // propose_recovery 的 declined 回执如实转达（未获执行，绝不当成功）。
    assert.equal(results[0]?.ok, true);
    assert.equal(results[0]?.message, "ROLE-STATUS-TEXT（快照）");
    assert.equal(results[1]?.ok, true);
    assert.equal(results[1]?.message, "TAIL(X:5)");
    assert.equal(results[2]?.ok, false);
    assert.ok(results[2]?.message.includes("未获执行"), "declined 如实转达（零执行）");
    await suHandle.dispose();

    // 项目角色会话：即便调用方误给三能力，也不注册三工具（只 su）。
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", roleStatus, sessionTail, proposeRecovery },
      { runtimeOptions: { providerFactories: { demo: xProvider.factory }, persistSession: false } },
    );
    await xHandle.send("普通干活");
    for await (const ev of xHandle.events()) if (ev.kind === "settled") break;
    const xTools = xProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    for (const name of ["role_status", "session_tail", "propose_recovery"]) {
      assert.ok(!xTools.includes(name), `项目角色会话不得注册 ${name}（只给 su）`);
    }
    await xHandle.dispose();
  } finally {
    cleanup(project);
  }
});
