// test/编排/shell-arming.test.ts
// 编排角色自测：**I-1 开放 shell —— 三层链装配与 arm**（设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §I-1）。
//
// 覆盖（全部假件：不真跑任何命令——只在**闸层**断言判定，或让 (c) 直接拒掉）：
//   ① 注入即注册 / 不注入不存在：`openRoleSession` 收 `shellOperatorChannel`（项目角色）⇒ caps.shellGate
//      存在（run_shell 据此注册）；不给 ⇒ 不存在；**su 自身给了也不 arm**。
//   ② (c) 硬拒 → 不执行、不打扰 (b)/(a)；(c) 白名单 allow → 直接放行。
//   ③ (b) 判「危险」（risky）→ **必过 (a)**（§14.2）；(b) 拿不准/判读非法 → 升 (a)。
//   ④ (a) 拒 / 通道不可用 / 超时（关窗等价）→ **不执行**（allow:false），如实给理由。
//   ⑤ (b) 放行且不危险（review）→ 执行路径可达（allow:true，且**不经** (a)）。
//   ⑥ 留痕：审计 sink 收到每条请求的 command/conclusion/branch/by；事件流含该次调用的 tool_call/denied。
//
// (c) 用**门禁引擎实件**（`classifyShell` + `defaultShellRules`——测试域既有做法，test/编排 多文件同）；
// (b) 用 `openSession` 桩（pm-reviewer 的注入点）；(a) 用桩通道。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import { openRoleSession, type AdapterCapabilities, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { assembleProjectShellGate, assembleReadonlyShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import { builtInBoundarySection } from "../../src/common/门禁引擎/boundary-core.ts";
import { buildShellGate } from "../../src/common/编排/shell-gate.ts";
import {
  SHELL_AUDIT_REL_PATH,
  SHELL_GATE_CONDITION,
  type ShellAuditRecord,
  type ShellAuditSink,
} from "../../src/common/编排/shell-audit.ts";
import {
  DEFAULT_GOVERNANCE_BOUNDARY_REL,
  renderGovernanceBoundaryDoc,
} from "../../src/common/编排/finalize.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const RULES = defaultShellRules();

/** 临时项目（角色 X + 边界文件 + 内置 su）。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellarm-"));
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
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

/** (b) 审读桩：openSession 返回一个「只回一句 verdict JSON」的会话句柄（pm-reviewer 的注入点）。 */
function reviewStub(reply: string) {
  return async (): Promise<RoleSessionHandle> => ({
    async send(): Promise<void> {},
    events(): AsyncIterable<OrchestrationEvent> {
      return (async function* () {
        yield { kind: "message", summary: reply } as SessionEvent;
        yield { kind: "settled", summary: "完成" } as SessionEvent;
      })();
    },
    async dispose(): Promise<void> {},
  });
}

/** 装配一个闸（(c)=实件；(b)=桩；审计/通道可注入）。 */
async function assemble(opts: {
  project: ProjectConfig;
  pmReply?: string; // 缺省不给 ⇒ openSession 桩抛错 ⇒ (b) 不可用 → 升 (a)
  operator?: import("../../src/provider/pi/session.ts").OperatorChannelFn;
  operatorTimeoutMs?: number;
  audit?: ShellAuditSink;
  pmRoleId?: string;
}) {
  return assembleProjectShellGate({
    project: opts.project,
    operatorChannel: opts.operator ?? (() => ({ outcome: "deny", operatorId: "test-客户", reason: "测试拒绝" })),
    classifyShell,
    rules: RULES,
    sessionDeps: {
      createAdapter: (gate: WriteGate) =>
        createFakeRuntimeAdapter({ gate, script: [] }),
    },
    ...(opts.pmReply !== undefined ? { openSession: reviewStub(opts.pmReply) } : { openSession: async () => { throw new Error("无审读会话"); } }),
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
    ...(opts.audit !== undefined ? { auditSink: opts.audit } : {}),
    ...(opts.pmRoleId !== undefined ? { pmRoleId: opts.pmRoleId } : {}),
  });
}

const req = (command: string, argv: string[]) => ({ command, argv, cwd: "/proj", toolCallId: "call-1" });

// —— ① 注入即注册 / 不注入不存在 / su 不 arm ——

function capsCapturingAdapter(): {
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
                yield { kind: "settled", summary: "完成" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

test("I-1：项目角色给 (a) 通道 ⇒ 装配并注入 ShellGate（注入即注册）；不给 ⇒ 无；su 给了也不 arm", async () => {
  const project = makeTempProject();
  try {
    // 项目角色 + 通道 ⇒ caps.shellGate 存在（函数）。
    const withArm = capsCapturingAdapter();
    const h1 = await openRoleSession(
      { roleId: "X", project, shellOperatorChannel: () => ({ outcome: "deny", operatorId: "t" }) },
      { createAdapter: withArm.createAdapter },
    );
    assert.equal(typeof withArm.caps()?.shellGate, "function", "项目角色应注入 ShellGate");
    await h1.dispose();

    // 不给通道 ⇒ 不注入（run_shell 不注册）。
    const noArm = capsCapturingAdapter();
    const h2 = await openRoleSession({ roleId: "X", project }, { createAdapter: noArm.createAdapter });
    assert.equal(noArm.caps()?.shellGate, undefined, "不给 (a) 通道 ⇒ 不 arm");
    await h2.dispose();

    // su 自身：给了通道也不 arm（只对项目角色）。
    const suArm = capsCapturingAdapter();
    const h3 = await openRoleSession(
      { roleId: "su", project, shellOperatorChannel: () => ({ outcome: "deny", operatorId: "t" }) },
      { createAdapter: suArm.createAdapter },
    );
    assert.equal(suArm.caps()?.shellGate, undefined, "su 自身不 arm");
    await h3.dispose();
  } finally {
    cleanup(project);
  }
});

// —— ② (c) 硬拒 / 白名单 ——

test("I-1（c）：硬拒（re-shell）→ 不执行、不打扰 (b)/(a)；白名单 → 直接放行", async () => {
  const project = makeTempProject();
  try {
    let operatorCalls = 0;
    const gate = await assemble({
      project,
      pmReply: `{"verdict":"allow","reason":"测试"}`,
      operator: () => {
        operatorCalls += 1;
        return { outcome: "allow", operatorId: "t" };
      },
    });

    const denied = await gate(req('sh -c "echo pwn"', ["sh", "-c", "echo pwn"]));
    assert.equal(denied.allow, false, "(c) 硬拒 → 不执行");
    assert.match(denied.by, /ruleset/, "由确定性规则拒（by 可辨识）");
    assert.equal(operatorCalls, 0, "(c) 硬拒不打扰客户");

    const allowed = await gate(req("ls -la", ["ls", "-la"]));
    assert.equal(allowed.allow, true, "白名单 → 直接放行");
    assert.equal(operatorCalls, 0, "白名单不打扰客户");
  } finally {
    cleanup(project);
  }
});

// —— ③④⑤ (b)/(a) 分支 ——

test("I-1（b/a）：review + (b) allow → 可达执行且不经 (a)；risky + (b) allow → 必过 (a)；a 拒 → 不执行", async () => {
  const project = makeTempProject();
  try {
    let operatorCalls = 0;
    let operatorOutcome: "allow" | "deny" = "allow";
    const allowGate = await assemble({
      project,
      pmReply: `{"verdict":"allow","reason":"看起来安全"}`,
      operator: () => {
        operatorCalls += 1;
        return operatorOutcome === "allow"
          ? { outcome: "allow", operatorId: "t" }
          : { outcome: "deny", operatorId: "t", reason: "客户拒绝" };
      },
    });

    // (b) 放行且不危险（review）→ 执行路径可达，且**不经** (a)。
    const reviewed = await allowGate(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(reviewed.allow, true, "(b) 明确放行（review）→ 可达");
    assert.equal(operatorCalls, 0, "review 且 b 明确 → 不打扰客户");

    // risky + (b) allow → **仍必过 (a)**（§14.2）。
    const risky = await allowGate(req("rm tmp.txt", ["rm", "tmp.txt"]));
    assert.equal(operatorCalls, 1, "risky 即使 (b) 放行也必过 (a)");
    assert.equal(risky.allow, true, "(a) 放行 → 可达");

    // (a) 拒 → 不执行。
    operatorOutcome = "deny";
    const deniedByA = await allowGate(req("rm tmp2.txt", ["rm", "tmp2.txt"]));
    assert.equal(deniedByA.allow, false, "(a) 拒 → 不执行");
    assert.match(deniedByA.reason ?? "", /拒绝/);
  } finally {
    cleanup(project);
  }
});

test("I-1（b 不可解析 → **直接拒绝**（M-2，不进 (a)）；b 拿不准 → 升 (a)；(a) 不可用/超时 → 不执行（关窗等价，fail-closed）", async () => {
  const project = makeTempProject();
  try {
    // (b) 输出不可解析 → **直接拒绝**（M-2：fail-closed；不升 (a)、不重试、不打扰客户）。
    let operatorCalls = 0;
    const badJson = await assemble({
      project,
      pmReply: "我看不太懂这条命令", // 非 JSON → 直接拒绝（M-2）
      operator: () => {
        operatorCalls += 1;
        return { outcome: "unavailable", reason: "无人值守" };
      },
    });
    const r1 = await badJson(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(operatorCalls, 0, "不可解析 → **不进 (a)**（客户不要这类打扰）");
    assert.equal(r1.allow, false, "fail-closed 拒绝");
    assert.match(r1.reason ?? "", /fail-closed/);

    // (b) 拿不准（unsure）→ 升 (a)；(a) 拒绝 → 不执行。（既有分支保持现状。）
    const unsure = await assemble({
      project,
      pmReply: `{"verdict":"unsure","reason":"拿不准"}`,
      operator: () => ({ outcome: "deny", operatorId: "t", reason: "客户不放心" }),
    });
    const r2 = await unsure(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(r2.allow, false, "b 拿不准 + a 拒 → 不执行");

    // (a) 超时（不答 = 关窗等价）→ 不执行。
    const hang = await assemble({
      project,
      pmReply: `{"verdict":"unsure"}`,
      operator: () => new Promise(() => {}), // 永不作答
      operatorTimeoutMs: 30,
    });
    const r3 = await hang(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(r3.allow, false, "a 超时 → 不执行");
    assert.match(r3.reason ?? "", /超时/);
  } finally {
    cleanup(project);
  }
});

// —— ⑥ 留痕 ——

test("I-1：留痕——审计 sink 收到每条请求（command/判定/branch/by）；事件流含 run_shell 的 tool_call 与 denied", async () => {
  const project = makeTempProject();
  try {
    const records: ShellAuditRecord[] = [];
    const audit: ShellAuditSink = {
      async append(record) {
        records.push(record);
        return { ok: true };
      },
    };
    const gate = await assemble({
      project,
      pmReply: `{"verdict":"allow"}`,
      operator: () => ({ outcome: "allow", operatorId: "t" }),
      audit,
    });
    await gate(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(records.length, 1, "每条请求一条审计");
    assert.equal(records[0].command, "mysterytool --flag");
    assert.equal(records[0].cwd, "/proj");
    assert.equal(records[0].conclusion, "allow");
    assert.match(records[0].branch, /b-allow/, "branch 记触发链");
    assert.ok(records[0].conditions.includes("shell-gate"), "声明 shell-gate 条件");

    // 事件流留痕：假适配器脚本调 run_shell（命令被 (c) 直接拒 ⇒ 不 spawn）→ 事件含 tool_call 与 denied。
    const script = [{ name: "run_shell", args: { command: 'sh -c "echo pwn"' } }];
    let caps: AdapterCapabilities | undefined;
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: () => ({ outcome: "deny", operatorId: "t" }),
        shellArming: { classifyShell, rules: RULES, openSession: reviewStub(`{"verdict":"allow"}`), auditSink: audit },
      },
      {
        createAdapter: (g, c) => {
          caps = c;
          return createFakeRuntimeAdapter({ gate: g, script, writeRoot: project.projectRoot, shellGate: c?.shellGate });
        },
      },
    );
    assert.equal(typeof caps?.shellGate, "function");
    await handle.send("试试 shell");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);
    assert.ok(events.some((e) => e.kind === "tool_call" && /run_shell/.test(e.summary)), "请求进事件流");
    const denied = events.find((e) => e.kind === "denied");
    assert.ok(denied, "判定进事件流（被拒不执行）");
    assert.match(denied!.summary, /审核|拒绝/, "拒绝理由如实");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— R-1 端到端：真 openRoleSession + 真实装配（assembleProjectShellGate）+ 夹具模型调工具 ——

test("R-1 端到端：夹具模型经 shellVerdict 交回结构化结论 → 只读/测试类命令（review）放行、不打扰客户；审读会话不持久化", async () => {
  const project = makeTempProject();
  try {
    const reviewerCaps: AdapterCapabilities[] = [];
    // 夹具「模型」：真实 openRoleSession 拿到能力面后，prompt 时像工具 handler 一样调用 shellVerdict。
    const spyFactory = (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
      reviewerCaps.push(caps ?? {});
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {
              await caps?.shellVerdict?.({ verdict: "allow", reason: "只读/测试类命令" });
            },
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "完成" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    };
    let operatorCalls = 0;
    const gate = await assembleProjectShellGate({
      project,
      operatorChannel: () => {
        operatorCalls += 1;
        return { outcome: "deny", operatorId: "t" };
      },
      classifyShell,
      rules: RULES,
      sessionDeps: { createAdapter: spyFactory },
      auditSink: { async append() { return { ok: true }; } },
    });
    // `mysterytool --flag` = review 类（未命中白名单/硬拒）→ (b) 工具结论 allow → **放行且不打扰客户**。
    const r = await gate(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(r.allow, true, "夹具模型调工具交回 allow → review 放行（node --test 一类只读/测试命令可走通）");
    assert.equal(operatorCalls, 0, "未打扰客户");

    const caps = reviewerCaps[reviewerCaps.length - 1];
    assert.equal(typeof caps?.shellVerdict, "function", "审读会话注入 shellVerdict（工具据此注册）");
    assert.equal(caps?.sessionDir, undefined, "审读会话不持久化（不恢复/不污染用户 su 会话）");
  } finally {
    cleanup(project);
  }
});

// —————————————— F-6-1 事故回归 E2E（kanban-live 13:21:38 场景复刻；客户 2026-10-16 批准） ——————————————
//
// 事故时序：su 写完角色边界（hasRoles=true）之后、首次自动收尾（写 .ans + 治理边界文档 + pin）之前
// 约 4 秒，「实现者」会话创建 ⇒ 快照 `governanceBoundary.path=""` ⇒ su 边界解析落**内置未接受** ⇒
// 审计写被 F6 拒、且该快照在会话生命周期内无自愈通道（17 条命令的审计留痕缺口）。
// 修复（F-6-1）：审计 sink 首查被拒时**重读盘上最新验收**（共享载入器 loadEffectiveConfig →
// 同一 resolveGovernanceBoundary）并以新门禁重试一次 ⇒ 收尾落盘后的命令**自愈落盘**，无需等会话重建。

/** 「创世过渡窗口」项目快照：角色边界已在盘上（hasRoles），但 `.ans` 尚未收尾 ⇒ gov.path=""。 */
function makeTransitionProject(): ProjectConfig {
  const project = makeTempProject();
  return { ...project, governanceBoundary: { path: "", acceptance: { accepted: false, source: "" } } };
}

/** 复刻首次自动收尾的落盘形状：治理边界文档（**生产渲染器**）+ `.ans/project.json`（同算法 sha256 pin）。 */
function writeFinalizedGovernance(root: string): void {
  const govRel = DEFAULT_GOVERNANCE_BOUNDARY_REL;
  const govAbs = path.join(root, govRel);
  fs.mkdirSync(path.dirname(govAbs), { recursive: true });
  fs.writeFileSync(govAbs, renderGovernanceBoundaryDoc(), "utf8");
  const sha256 = createHash("sha256").update(fs.readFileSync(govAbs)).digest("hex");
  const ansProject = {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: govRel,
      acceptance: { accepted: true, source: "test:f6-e2e-收尾", pin: [{ path: govRel, sha256 }] },
    },
  };
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify(ansProject, null, 2) + "\n", "utf8");
}

test("F-6-T6 事故回归 E2E：创世过渡窗口内的未接受快照，在收尾落盘后自愈（审计刷新重试）", async () => {
  const project = makeTransitionProject();
  const root = project.projectRoot;
  try {
    // ① 会话在过渡窗口内装配（gov.path="" ⇒ su 边界解析落内置未接受；无 genesis、无 parseError）→ 审核一条。
    const gate = await assembleProjectShellGate({
      project,
      operatorChannel: () => ({ outcome: "deny", operatorId: "test" }),
      classifyShell,
      rules: RULES,
      sessionDeps: { createAdapter: (g: WriteGate) => createFakeRuntimeAdapter({ gate: g, script: [] }) },
    });
    const r1 = await gate(req("ls -la", ["ls", "-la"]));
    assert.equal(r1.allow, true, "判定照常（审计失败不翻转判定）");
    const auditPath = path.join(root, SHELL_AUDIT_REL_PATH);
    assert.equal(fs.existsSync(auditPath), false, "过渡窗口内：审计未落盘（无已接受证据，fail-closed 应有残留）");
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "零副作用（不建目录）");

    // ② 首次自动收尾落盘（13:21:42 复刻）。
    writeFinalizedGovernance(root);

    // ③ 收尾后再审核一条 → 首查被拒 → 刷新边界快照（重读盘上 .ans）→ 重试落盘（F-6-1 生效）。
    const r2 = await gate(req("ls", ["ls"]));
    assert.equal(r2.allow, true);
    assert.ok(fs.existsSync(auditPath), "收尾后：审计自愈落盘（无需等会话重建）");
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1, "恰一条（第一条物理不可恢复——失败期间的命令不补记）");
    const rec = JSON.parse(lines[0]) as ShellAuditRecord;
    assert.equal(rec.toolCallId, "call-1");
    assert.equal(rec.branch, "c-allow");
    assert.ok(rec.conditions.includes(SHELL_GATE_CONDITION));
    assert.equal(rec.execution, "未执行");

    // ④ 恢复后零额外开销：第三条直走新门禁（不再刷新），连续追加。
    const r3 = await gate(req("pwd", ["pwd"]));
    assert.equal(r3.allow, true);
    assert.equal(fs.readFileSync(auditPath, "utf8").trim().split("\n").length, 2, "追加式照常");
  } finally {
    cleanup(project);
  }
});

test("F-6-T6b（对照组·旧行为）：不注入刷新闭包时，收尾落盘后第二条仍不落盘", async () => {
  const project = makeTransitionProject();
  const root = project.projectRoot;
  try {
    // 无 `auditBoundaryRefresh` ⇒ 与修复前逐字相同的缺省路径（快照 = 装配当时的内置未接受边界）。
    const gate = buildShellGate({
      classifyShell,
      rules: RULES,
      projectRoot: root,
      skillRoot: root,
      pmBoundary: builtInBoundarySection(),
      operatorChannel: () => ({ outcome: "deny", operatorId: "test" }),
    });
    await gate(req("ls -la", ["ls", "-la"])); // 过渡窗口内
    writeFinalizedGovernance(root); // 收尾落盘（盘上证据已接受）
    await gate(req("ls", ["ls"])); // 收尾后
    assert.equal(
      fs.existsSync(path.join(root, SHELL_AUDIT_REL_PATH)),
      false,
      "旧行为（无刷新通道）：旧快照继续被 F6 拒、审计仍不落盘——对照组条件成立",
    );
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "零副作用");
  } finally {
    cleanup(project);
  }
});

test("F-6-T7（su 只读档同接线）：未接受快照在收尾落盘后同样自愈", async () => {
  const project = makeTransitionProject();
  const root = project.projectRoot;
  try {
    const gate = await assembleReadonlyShellGate({ project, classifyShell, rules: RULES });
    const r1 = await gate(req("ls -la", ["ls", "-la"]));
    assert.equal(r1.allow, true, "只读白名单照常放行（判定不因审计而变）");
    const auditPath = path.join(root, SHELL_AUDIT_REL_PATH);
    assert.equal(fs.existsSync(auditPath), false, "过渡窗口内：审计未落盘");

    writeFinalizedGovernance(root);

    const r2 = await gate(req("ls -la", ["ls", "-la"]));
    assert.equal(r2.allow, true);
    assert.ok(fs.existsSync(auditPath), "只读档审计同接线自愈落盘");
    assert.equal(fs.readFileSync(auditPath, "utf8").trim().split("\n").length, 1);
  } finally {
    cleanup(project);
  }
});
