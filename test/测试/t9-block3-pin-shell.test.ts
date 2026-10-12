// 测试角色：T9 独立跨角色总验收 —— 块3（pin / 调度记录 / V3 shell 三层链）
//
// 自搭场景：
//   · pin：匹配→accepted；不匹配→未接受→拒一切写；无 .ans→回退内置（未接受）仍拒写；无 pin 的 accepted:true→置未接受；
//   · 调度记录与审计（boundary 级）：pm 边界的 docs/scheduling/ 与 docs/audit/(condition shell-gate)；
//   · V3 三层链 (c)→(b)→(a)：白名单放行且 (b)/(a) 未被调用；**硬拒（sh -c）**终结且 (b)/(a) 未被调用；
//     **risky（rm 等）→(b)，且 b 放行后仍必过 (a)**（客户 2026-10-11：pm 不是终审，客户才是）；review→(b)；
//     各层拿不准/超时/不可用 → 只往更严的层退；fail-closed 退路；
//   · 未 arm → run_shell 根本不注册；run_shell 只在恰好 allow:true 时执行。
//
// 全部在系统临时目录内（pin 用例），用完清理。V3 用例为纯内存/子进程，无仓库副作用。
//
// ★「验证不到的东西」（如实）：本文件对 (b) pm 审读用的是**桩**，验证的是**接线形状与失败时的 fail-closed**，
//   **不是真实模型行为**——真实模型轮次须客户本人运行，本机不可自动验收。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { resolveBoundarySection } from "../../src/common/门禁引擎/boundary-core.ts";
import { sha256File } from "../../src/common/门禁引擎/io.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { buildDemoProjectConfig, resolveProjectRoot } from "../../src/index.ts";
import {
  createShellGate,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_B_DENY,
  BRANCH_B_UNPARSEABLE,
  REASON_B_UNPARSEABLE,
  BRANCH_REVIEW_NO_BA,
  BRANCH_RISKY_NO_BA,
  BRANCH_RULESET_LOAD_FAILED,
  type PmAskFn,
  type CreateShellGateOptions,
} from "../../src/common/编排/shell-gate.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { buildGovernedTools, shellKillSwitch } from "../../src/provider/pi/tools.ts";
import type { OperatorChannelFn, ShellReviewRequest } from "../../src/provider/pi/session.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";

const TMP: string[] = [];
function tempRoot(tag: string): string {
  const d = mkdtempSync(join(tmpdir(), `t9-b3-${tag}-`));
  TMP.push(d);
  return d;
}
after(() => {
  for (const d of TMP) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }
});

// —————————————————————— 1) pin / acceptance 链 ——————————————————————

const ROLE_BOUNDARY_REL = "角色卡/X/boundary.yaml";
const ROLE_BOUNDARY_YAML =
  "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: t\n  - kind: file\n    path: src/b.ts\n    purpose: t\n";

/** 建一个带 .ans 的项目：返回 projectRoot 与两份文件的绝对路径。 */
function makeAnsProject(ans: unknown): { dir: string; roleBoundaryAbs: string } {
  const dir = tempRoot("pin");
  mkdirSync(join(dir, "角色卡", "X"), { recursive: true });
  mkdirSync(join(dir, ".ans"), { recursive: true });
  const roleBoundaryAbs = join(dir, ROLE_BOUNDARY_REL);
  writeFileSync(roleBoundaryAbs, ROLE_BOUNDARY_YAML, "utf8");
  writeFileSync(join(dir, "角色卡", "X", "role-card.md"), "# X\n", "utf8");
  writeFileSync(join(dir, ".ans", "project.json"), JSON.stringify(ans, null, 2), "utf8");
  return { dir, roleBoundaryAbs };
}

const fallbackFor = (dir: string): ProjectConfig => ({ projectRoot: dir, skillRoot: join(dir, "__skill"), roles: {} });

const SCOPE_A: TaskScope = { writeSet: ["src/a.ts"], conditions: [] };

test("块3/pin 匹配 → accepted，src/a.ts 可写", async () => {
  const { dir, roleBoundaryAbs } = makeAnsProject({}); // 先占位，稍后覆写正确 pin
  const sha = await sha256File(roleBoundaryAbs);
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({
      roles: { X: { card: "角色卡/X/role-card.md", boundary: ROLE_BOUNDARY_REL } },
      governanceBoundary: {
        path: ROLE_BOUNDARY_REL,
        acceptance: { accepted: true, source: "pin:客户", pin: [{ path: ROLE_BOUNDARY_REL, sha256: sha }] },
      },
    }),
    "utf8",
  );

  const { project, source } = await loadEffectiveConfig({ projectRoot: dir, skillRoot: join(dir, "__skill"), fallback: fallbackFor(dir) });
  assert.equal(source.kind, "ans");
  assert.equal(source.acceptance.accepted, true, "pin 匹配应接受");

  const boundary = await resolveBoundarySection("X", project);
  assert.equal(boundary.parseError, undefined, `pin 匹配不应有 parseError：${boundary.parseError}`);
  assert.equal(boundary.acceptance.accepted, true);
  const ctx = { skillRoot: project.skillRoot, projectRoot: dir };
  assert.equal(resolveWrite("src/a.ts", boundary, SCOPE_A, ctx).allowed, true);
});

test("块3/pin 不匹配（篡改边界文件）→ 未接受 → 拒一切写", async () => {
  const { dir, roleBoundaryAbs } = makeAnsProject({});
  const sha = await sha256File(roleBoundaryAbs);
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({
      roles: { X: { card: "角色卡/X/role-card.md", boundary: ROLE_BOUNDARY_REL } },
      governanceBoundary: {
        path: ROLE_BOUNDARY_REL,
        acceptance: { accepted: true, source: "pin:客户", pin: [{ path: ROLE_BOUNDARY_REL, sha256: sha }] },
      },
    }),
    "utf8",
  );
  // 篡改边界文件（pin 定后改动）→ SHA-256 不再匹配。
  writeFileSync(roleBoundaryAbs, ROLE_BOUNDARY_YAML + "  - kind: file\n    path: src/backdoor.ts\n    purpose: 篡改\n", "utf8");

  const { project } = await loadEffectiveConfig({ projectRoot: dir, skillRoot: join(dir, "__skill"), fallback: fallbackFor(dir) });
  const boundary = await resolveBoundarySection("X", project);
  assert.ok(boundary.parseError && /pin/i.test(boundary.parseError), `应因 pin 不符报 parseError：${boundary.parseError}`);
  assert.notEqual(boundary.acceptance.accepted, true);

  const ctx = { skillRoot: project.skillRoot, projectRoot: dir };
  const d = resolveWrite("src/a.ts", boundary, SCOPE_A, ctx);
  assert.equal(d.allowed, false, "pin 失配后连原本合法的文件也必须被拒");
  assert.match((d as { reason: string }).reason, /边界解析失败|拒一切写/);
});

test("块3/.ans 存在但 accepted:true 无 pin → 载入方置未接受（fail-closed）→ 拒一切写", async () => {
  const { dir } = makeAnsProject({
    roles: { X: { card: "角色卡/X/role-card.md", boundary: ROLE_BOUNDARY_REL } },
    governanceBoundary: { path: ROLE_BOUNDARY_REL, acceptance: { accepted: true, source: "自填无 pin" } },
  });
  const { project, source } = await loadEffectiveConfig({ projectRoot: dir, skillRoot: join(dir, "__skill"), fallback: fallbackFor(dir) });
  assert.equal(source.kind, "ans");
  assert.equal(source.acceptance.accepted, false, "无 pin 的 accepted:true 应被置为未接受");
  assert.ok(source.downgradeReason, "应给出降级原因");

  const boundary = await resolveBoundarySection("X", project);
  const ctx = { skillRoot: project.skillRoot, projectRoot: dir };
  const d = resolveWrite("src/a.ts", boundary, SCOPE_A, ctx);
  assert.equal(d.allowed, false);
});

test("块3/无 .ans → 回退内置（未接受）→ 拒一切写", async () => {
  const dir = tempRoot("noans");
  const { project, source } = await loadEffectiveConfig({ projectRoot: dir, skillRoot: join(dir, "__skill"), fallback: fallbackFor(dir) });
  assert.equal(source.kind, "builtin-fallback");

  // 未登记角色 → 引擎下沉为内置治理角色（未接受）→ 拒绝一切写。
  const boundary = await resolveBoundarySection("任意角色", project);
  assert.notEqual(boundary.acceptance.accepted, true);
  const ctx = { skillRoot: project.skillRoot, projectRoot: dir };
  const d = resolveWrite("src/a.ts", boundary, SCOPE_A, ctx);
  assert.equal(d.allowed, false, "无 .ans 回退内置应拒写（现状保持）");
  assert.match((d as { reason: string }).reason, /F6|未被接受/);
});

// —————————————————————— 2) 调度记录 / 审计（boundary 级授权） ——————————————————————

test("块3/调度记录（boundary 级）：pm 边界覆盖 docs/scheduling/；审计 docs/audit/ 须声明 shell-gate", async () => {
  const project = buildDemoProjectConfig();
  const pmBoundary = await resolveBoundary("项目管理", project);
  assert.equal(pmBoundary.parseError, undefined);
  const ctx = { skillRoot: project.skillRoot, projectRoot: resolveProjectRoot() };

  // 调度记录：docs/scheduling/<task-id>.md 在 pm 边界内（内容唯一写入者 task_ops 系技能脚本，非产品代码）。
  assert.equal(
    resolveWrite("docs/scheduling/T-1.md", pmBoundary, undefined, ctx).allowed,
    true,
    "pm 边界应覆盖 docs/scheduling/",
  );

  // 审计：docs/audit/shell-gate.jsonl 是条件目录——声明 shell-gate → 放行；**不声明 → 写前拒**（fail-closed 负例）。
  const auditPath = "docs/audit/shell-gate.jsonl";
  assert.equal(
    resolveWrite(auditPath, pmBoundary, { writeSet: [auditPath], conditions: ["shell-gate"] }, ctx).allowed,
    true,
    "声明 shell-gate 时应放行审计写",
  );
  const denied = resolveWrite(auditPath, pmBoundary, { writeSet: [auditPath], conditions: [] }, ctx);
  assert.equal(denied.allowed, false, "缺 shell-gate 条件的审计写必须被拒");
  assert.match((denied as { reason: string }).reason, /缺少条件/);
});

// —————————————————————— 3) V3 三层链 ——————————————————————

function req(command: string, argv: string[]): ShellReviewRequest {
  return { command, argv, cwd: process.cwd(), toolCallId: "tc-1" };
}

/** 装配一个带 spies 的 ShellGate；spies 记录 (b)/(a) 被调用次数。 */
function gateWithSpies(opts: {
  pmAsk?: PmAskFn;
  operatorChannel?: OperatorChannelFn;
  rules?: CreateShellGateOptions["rules"];
  classifyShell?: CreateShellGateOptions["classifyShell"];
  pmTimeoutMs?: number;
  operatorTimeoutMs?: number;
  timeoutMs?: number;
}): { gate: ReturnType<typeof createShellGate>; calls: { b: number; a: number }; audit: ReturnType<typeof createMemoryAuditSink> } {
  const calls = { b: 0, a: 0 };
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: opts.classifyShell ?? classifyShell,
    rules: opts.rules ?? (() => defaultShellRules()),
    audit,
    pmAsk:
      opts.pmAsk === undefined
        ? undefined
        : (i) => {
            calls.b += 1;
            return opts.pmAsk!(i);
          },
    operatorChannel:
      opts.operatorChannel === undefined
        ? undefined
        : (p) => {
            calls.a += 1;
            return opts.operatorChannel!(p);
          },
    pmTimeoutMs: opts.pmTimeoutMs,
    operatorTimeoutMs: opts.operatorTimeoutMs,
    timeoutMs: opts.timeoutMs,
    now: () => new Date("2026-10-11T00:00:00.000Z"),
  });
  return { gate, calls, audit };
}

test("块3/V3(c) 白名单 → 放行，且 (b)/(a) **未被调用**", async () => {
  const { gate, calls, audit } = gateWithSpies({
    pmAsk: () => '{"verdict":"allow"}',
    operatorChannel: () => ({ outcome: "allow" }),
  });
  const r = await gate(req("ls -la", ["ls", "-la"]));
  assert.equal(r.allow, true, JSON.stringify(r));
  assert.equal(calls.b, 0, "(c) 白名单放行不应惊动 (b)");
  assert.equal(calls.a, 0, "(c) 白名单放行不应惊动 (a)");
  assert.equal(audit.records[0].branch, BRANCH_C_ALLOW);
});

test("块3/V3(c) 硬拒（sh -c）→ 拒绝、终结，**且 (b)/(a) 未被调用**（硬地板不可翻案：桩本会放行）", async () => {
  // ── 何为「硬拒」：`sh -c "…"` 把真命令藏在参数 string 里，客户在原文里**看不懂**、兜不住（§14.4）——
  //    故它**永远走硬拒终结**，不进 (b)/(a)。（`rm` 已于 2026-10-11 被客户改判 `risky`：见下一条用例；
  //    本条按新语义改用 `sh -c` 承载「硬拒不可翻案」这条断言。）
  // 关键：(b)、(a) 的桩**本会放行**——若硬地板可被翻案，(b)/(a) 会被调用并放行。断言它们根本没被调用。
  const { gate, calls, audit } = gateWithSpies({
    pmAsk: () => '{"verdict":"allow","reason":"我允许"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "op" }),
  });
  const r = await gate(req('sh -c "rm -rf build"', ["sh", "-c", "rm -rf build"]));
  assert.equal(r.allow, false, "硬拒必须拒绝");
  assert.equal(calls.b, 0, "(b) 本会放行也必须**不被调用**——硬地板绝对否决");
  assert.equal(calls.a, 0, "(a) 本会放行也必须**不被调用**");
  assert.match(r.allow === false ? r.reason : "", /硬拒|deny/);
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);

  // ★ 反向守卫（§14.4，这处最容易被后人顺手放宽）：`sh -c` 命令藏在 string 里、客户看原文看不懂，
  //   **不得**被放宽为 `risky`（进 (b)/(a)）或 `allow`（直接放行）。直接钉住 (c) 分类，防语义漂移。
  const rules = defaultShellRules();
  assert.equal(classifyShell(["sh", "-c", "rm -rf build"], rules), "deny", "sh -c 仍须判 deny（硬拒终结）");
  assert.notEqual(classifyShell(["sh", "-c", "rm -rf build"], rules), "risky", "sh -c **不得**被放宽为 risky（不进 (b)/(a)）");
  assert.notEqual(classifyShell(["sh", "-c", "rm -rf build"], rules), "allow", "sh -c **不得**被放宽为 allow");
});

// —————————————— 块3/V3(c) risky：危险但有正当用途 → 必过 (b)，且 (b) 放行后仍必过 (a) ——————————————
//
// ── 为何按新语义断言（客户 2026-10-11 裁定，T40 门禁引擎 + T41 编排）─────────────────────────
// 客户**部分推翻**「危险即硬拒终结」：`rm`/`dd`/`sed -i`/`git` 写子命令 这类**危险但有正当用途**的命令
// **不终结**——先过 (b) pm 审读，**无论 pm 怎么判，都要过 (a) 客户本人确认**（原话：**pm 不是终审，客户才是**）。
// 门禁引擎 (c) 据此把它们从硬拒**改判第四态 `risky`**。次序表（§14.2）：
//     risky → (b)；b 判「放行」→ **仍须过 (a)**；b 判「拒绝」→ 终结、**不打扰 (a)**；
//     b 拿不准/不可用/超时 → 升 (a)；(a) 拒绝/超时/不可用 → 拒绝；(b)/(a) 均未接 → 拒（fail-closed）。
// 故旧断言「`rm -rf build` 硬拒、且 (b)/(a) 不被调用」**已被新语义推翻**——`rm` 现判 `risky`，会接 (b)/(a)。
// 下方四条逐条钉死上面这张表；**(b) 放行 + (a) 拒绝 → 拒绝** 是本次**最要害**的一条（证明 pm 不是终审）。
// `gateWithSpies` 注入的 `pmAsk`/`operatorChannel` **就是**契约形状的替身（`PmAskFn` / `OperatorChannelFn`，
// 形状单一来源 `src/provider/pi/session.ts`）——正例（b 放行 + a 放行）由这两个替身共同构成。

test("块3/V3(c) risky + (b) 放行 + (a) 放行 → 放行（走 b-allow→a-allow）", async () => {
  const { gate, calls, audit } = gateWithSpies({
    pmAsk: () => '{"verdict":"allow","sessionId":"s1","model":"m1"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "op" }),
  });
  const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
  assert.equal(r.allow, true, `risky + b-allow + a-allow → 放行：${JSON.stringify(r)}`);
  assert.equal(calls.b, 1, "risky 应先过 (b)");
  assert.equal(calls.a, 1, "★ risky 要害：b 判放行**仍必过 (a)**（pm 不是终审，客户才是）");
  assert.equal(audit.records[0].branch, "b-allow→a-allow");
});

test("块3/V3(c) risky + (b) 放行 + (a) 拒绝 → **拒绝**（★ 最要害：pm 不是终审，客户才是）", async () => {
  const { gate, calls, audit } = gateWithSpies({
    pmAsk: () => '{"verdict":"allow","sessionId":"s1"}',
    operatorChannel: () => ({ outcome: "deny", operatorId: "op", reason: "我不批这条" }),
  });
  const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
  assert.equal(r.allow, false, "★ pm 放过也没用：客户拒绝 → 拒绝（pm 判放行不构成终审）");
  assert.equal(calls.b, 1, "(b) 应被调用一次");
  assert.equal(calls.a, 1, "b 判放行后 risky **必须**惊动 (a)——这正是「pm 不是终审」的落点");
  assert.equal(audit.records[0].branch, "b-allow→a-deny");
});

test("块3/V3(c) risky + (b) 拒绝 → 拒绝、终结，**且 (a) 未被调用**（pm 说不该跑就不打扰人）", async () => {
  const { gate, calls, audit } = gateWithSpies({
    pmAsk: () => '{"verdict":"deny","reason":"不许"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "op" }),
  });
  const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
  assert.equal(r.allow, false, "(b) 判拒 → 拒绝");
  assert.equal(calls.b, 1, "(b) 应被调用一次");
  assert.equal(calls.a, 0, "risky 唯独 (b) 判拒时**不打扰人**——(a) 不得被调用");
  assert.equal(audit.records[0].branch, BRANCH_B_DENY);
});

test("块3/V3(c) risky 且 (b)/(a) 均未接入 → 拒绝（fail-closed：risky 必过 (a)，a 缺席即拒）", async () => {
  const { gate, calls, audit } = gateWithSpies({});
  const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
  assert.equal(r.allow, false, "risky 未接 (b)/(a) 必须拒（绝不因缺下一闸而放行）");
  assert.equal(calls.b + calls.a, 0, "两侧都缺席：不惊动任何层");
  assert.equal(audit.records[0].branch, BRANCH_RISKY_NO_BA);
});

test("块3/V3 (c) review → (b) 放行即终结；(b) 拒绝亦终结", async () => {
  // review：python 无 -e/-c → 不在硬拒、不在白名单 → 交 (b)。
  const allow = gateWithSpies({ pmAsk: () => '{"verdict":"allow","sessionId":"s1","model":"m1"}' });
  const ra = await allow.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(ra.allow, true);
  assert.equal(allow.calls.b, 1, "(b) 应被调用一次");
  assert.equal(allow.calls.a, 0, "(b) 明确放行即终结，不应升级到 (a)");

  const deny = gateWithSpies({ pmAsk: () => '{"verdict":"deny","reason":"不许"}' });
  const rd = await deny.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(rd.allow, false);
  assert.equal(deny.calls.a, 0, "(b) 明确拒绝即终结，不应升级到 (a)");
});

test("块3/V3 (b) 拿不准 → 升 (a)；无会话 → 升 (a)；超时 → 升 (a)；JSON 非法（不可解析）→ **直接拒绝、不升 (a)**", async () => {
  // (b) 拿不准 → (a) 放行
  const unsure = gateWithSpies({
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "op" }),
  });
  const ru = await unsure.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(ru.allow, true, "b-unsure → a-allow");
  assert.equal(unsure.calls.a, 1);
  assert.equal(unsure.audit.records[0].branch, "b-unsure→a-allow");

  // (b) 无会话（未注入 pmAsk）→ (a) 拒绝
  const noPm = gateWithSpies({ operatorChannel: () => ({ outcome: "deny", operatorId: "op" }) });
  const rn = await noPm.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(rn.allow, false, "b-unavailable → a-deny");
  assert.equal(noPm.calls.a, 1);

  // (b) 超时 → (a) 放行
  const bTimeout = gateWithSpies({
    pmAsk: () => new Promise((res) => setTimeout(() => res('{"verdict":"allow"}'), 200)),
    operatorChannel: () => ({ outcome: "allow" }),
    pmTimeoutMs: 20,
    timeoutMs: 1000,
  });
  const rt = await bTimeout.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(rt.allow, true, "b-timeout → a-allow（超时绝不视为放行，而是升级）");
  assert.equal(bTimeout.calls.a, 1);

  // (b) JSON 非法（不可解析）→ **直接拒绝**（客户新裁定 M-2：fail-closed——**不升 (a)、不重试、不打扰客户**）。
  const badJson = gateWithSpies({
    pmAsk: () => "这不是 JSON",
    // (a) 桩**本会放行**：若仍会升级到 (a)，本例会被放行——用它反向钉住「根本不该惊动客户」。
    operatorChannel: () => ({ outcome: "allow", operatorId: "op" }),
  });
  const rb = await badJson.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(rb.allow, false, "不可解析 ⇒ 直接拒绝（不得放行）");
  assert.equal(badJson.audit.records[0].conclusion, "deny", "结论应为 deny");
  assert.equal(badJson.audit.records[0].branch, BRANCH_B_UNPARSEABLE, "归因码应为 b-unparseable-deny（稳定，供人话映射）");
  assert.equal(badJson.calls.a, 0, "不可解析 ⇒ **不升 (a)、不打扰客户**（a 桩本会放行也不得被调用）");
  assert.equal(rb.allow === false ? rb.reason : "", REASON_B_UNPARSEABLE, "固定短句如实回给角色（单一来源，绝不说成放行）");
});

test("块3/V3 (a) 超时 / 不可用 → 一律拒绝（只往更严的层退）", async () => {
  const aTimeout = gateWithSpies({
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => new Promise((res) => setTimeout(() => res({ outcome: "allow" }), 200)),
    operatorTimeoutMs: 20,
    timeoutMs: 1000,
  });
  const rt = await aTimeout.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(rt.allow, false, "a-timeout → 拒绝");
  assert.ok(aTimeout.audit.records[0].branch.endsWith("→a-timeout"));

  const aUnavailable = gateWithSpies({
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => ({ outcome: "unavailable", reason: "无人值守" }),
  });
  const ru = await aUnavailable.gate(req("python x.py", ["python", "x.py"]));
  assert.equal(ru.allow, false, "a-unavailable → 拒绝");
});

test("块3/V3 (c)-only（未接 (b)/(a)）：review 默认拒绝（不因缺下一闸而放行）", async () => {
  const { gate, calls, audit } = gateWithSpies({});
  const r = await gate(req("python x.py", ["python", "x.py"]));
  assert.equal(r.allow, false);
  assert.equal(calls.b + calls.a, 0);
  assert.equal(audit.records[0].branch, BRANCH_REVIEW_NO_BA);
});

// —————————————————————— 4) fail-closed 退路 ——————————————————————

test("块3/fail-closed：规则集加载失败 → 整条拒绝（绝不「没规则就放行」）", async () => {
  const { gate, audit } = gateWithSpies({
    rules: () => {
      throw new Error("规则集损坏");
    },
    // 即便命令本是白名单（ls）也必须被拒——证明不是「没规则就一律放行」。
    pmAsk: () => '{"verdict":"allow"}',
  });
  const r = await gate(req("ls", ["ls"]));
  assert.equal(r.allow, false, "规则集加载失败必须整条拒绝，含白名单命令");
  assert.equal(audit.records[0].branch, BRANCH_RULESET_LOAD_FAILED);
});

test("块3/fail-closed：classifyShell 收到版本未知的规则集 → deny（不因未知而放行）", () => {
  const badRules = { version: "999", id: "x", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
  assert.equal(classifyShell(["ls"], badRules), "deny");
  // 对照：正确版本下 ls 为 allow
  assert.equal(classifyShell(["ls"], defaultShellRules()), "allow");
});

// —————————————————————— 5) 未 arm → run_shell 不注册；execute 只在恰好 allow 时执行 ——————————————————————

test("块3/未 arm → run_shell 根本不被注册（能力缺席 = 最强 fail-closed）", () => {
  const allowGate = () => ({ allowed: true as const, matchedEntry: { root: "project" as const, path: "<any>", kind: "file" as const, purpose: "t" } });
  const without = buildGovernedTools(allowGate).map((t) => t.name);
  assert.ok(!without.includes("run_shell"), "未注入 ShellGate 时不得注册 run_shell");

  const withShell = buildGovernedTools(allowGate, { shellGate: async () => ({ allow: false, reason: "x", by: "t" }) }).map((t) => t.name);
  assert.ok(withShell.includes("run_shell"), "注入 ShellGate 后才注册 run_shell");
});

test("块3/run_shell：审核未返回 allow:true → **绝不执行**；恰好 allow:true → 才执行", async () => {
  const allowGate = () => ({ allowed: true as const, matchedEntry: { root: "project" as const, path: "<any>", kind: "file" as const, purpose: "t" } });

  // 拒绝 → 不执行
  const denyTools = buildGovernedTools(allowGate, { shellGate: async () => ({ allow: false, reason: "策略拒", by: "ruleset:t" }) });
  const denyTool = denyTools.find((t) => t.name === "run_shell")!;
  const rd = await denyTool.handler({ name: "run_shell", args: { command: "node --version" } });
  assert.equal(rd.ok, false);
  assert.match(rd.message, /未执行/);
  assert.doesNotMatch(rd.message, /已执行/);

  // 放行 → 执行（用 node --version，跨平台且无需 shell）
  const allowTools = buildGovernedTools(allowGate, { shellGate: async () => ({ allow: true, by: "ruleset:t" }) });
  const allowTool = allowTools.find((t) => t.name === "run_shell")!;
  const ra = await allowTool.handler({ name: "run_shell", args: { command: "node --version" } });
  assert.equal(ra.ok, true, ra.message);
  assert.match(ra.message, /已执行/);
});

test("块3/shellKillSwitch：未 arm 的 run_shell → block；已 arm / 其它工具 → 放行", () => {
  assert.deepEqual(shellKillSwitch({ toolName: "run_shell", shellArmed: false })?.block, true);
  assert.equal(shellKillSwitch({ toolName: "run_shell", shellArmed: true }), undefined);
  assert.equal(shellKillSwitch({ toolName: "write_file", shellArmed: false }), undefined);
});
