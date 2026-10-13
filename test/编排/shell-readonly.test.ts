// test/编排/shell-readonly.test.ts
// 编排角色自测：**su 只读档**（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）。
//
// 设计口径：只读 = shell 闸 (c) 层确定性白名单档的直接映射——
//   · (c) 判 `allow`（命中 `allow:readonly:*`）→ **执行**（既有 c-allow 路径）；
//   · (c) 判 `risky` / `review` → **一律拒绝**（新分支 `readonly-deny`，reason 写明命中档）；
//   · (c) 判 `deny` → 照旧拒绝（c-deny 硬拒）；
//   · **不接 (b) su 模型审读**（su 自己就是审读者，不自审）、**不接 (a) 客户确认**（不打扰客户、不弹框）。
//   · 审计仍落 `docs/audit/shell-gate.jsonl`（execution 恒「未执行」的既有约定不变）。
//
// 覆盖（①-⑩）：
//   ① allow → 执行（c-allow）；② risky → readonly-deny；③ review → readonly-deny；④ deny → c-deny；
//   ⑤ (b)/(a) 从未被调用（一调用即抛错的桩，四档全覆盖）；⑥ rules/classifyShell 未注入 ⇒ 一律拒绝（fail-closed）；
//   ⑦ 审计分支字段正确；⑧ 真实落盘 docs/audit/shell-gate.jsonl（execution 恒「未执行」）；
//   ⑨ 集成（门禁引擎实件 classifyShell + defaultShellRules）；⑩ run-role 侧接线（su arm / 不 arm / readonly 优先）。
//
// 全部假件：除 ⑨ 用门禁引擎实件判类外不触碰任何真实命令——闸只做判定，测试绝不真跑命令。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import {
  openRoleSession,
  type AdapterCapabilities,
  type RoleSessionHandle,
} from "../../src/pipeline/orchestration/run-role.ts";
import { assembleReadonlyShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { classifyShell, classifyShellDetailed, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import {
  createShellGate,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_READONLY_DENY,
  BRANCH_RULESET_LOAD_FAILED,
  BRANCH_NO_CLASSIFIER,
  type ClassifyShellFn,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import {
  SHELL_AUDIT_REL_PATH,
  SHELL_GATE_CONDITION,
  createMemoryAuditSink,
  type ShellAuditRecord,
  type ShellAuditSink,
} from "../../src/common/编排/shell-audit.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const RULES = defaultShellRules();

/** 临时项目（角色 X + 边界文件（含 `docs/audit/` 条件目录）+ 内置 su）。
 *  审计边界 = 内置治理角色边界（治理边界文档 = 本 fixture 的 X 边界文件）——
 *  故 su 的闸默认审计 sink 真能落 `docs/audit/shell-gate.jsonl`（同生产解析路径）。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-su-readonly-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    [
      "role: X",
      "entries:",
      "  - kind: file",
      "    path: src/thing.ts",
      "    purpose: 测试条目",
      "  - kind: conditional-directory",
      "    path: docs/audit/",
      `    condition: ${SHELL_GATE_CONDITION}`,
      "    root: project",
      "    purpose: shell 闸审计留痕",
      "",
    ].join("\n"),
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

const req = (command: string, argv: string[]) => ({ command, argv, cwd: "/proj", toolCallId: "call-1" });

/** 装配只读档（缺省走默认文件审计 sink；测试可注入内存 sink）。 */
async function assemble(opts: {
  project: ProjectConfig;
  classify?: ClassifyShellFn;
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  audit?: ShellAuditSink;
  timeoutMs?: number;
}) {
  return assembleReadonlyShellGate({
    project: opts.project,
    ...(opts.classify !== undefined ? { classifyShell: opts.classify } : {}),
    ...(opts.rules !== undefined ? { rules: opts.rules } : {}),
    ...(opts.audit !== undefined ? { auditSink: opts.audit } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
}

// —————————————————————— ①②③④ 装配：四档映射（含 reason 文案） ——————————————————————

test("只读档四档：allow → 执行；risky/review → readonly-deny（reason 写明命中档）；deny → c-deny", async () => {
  const project = makeTempProject();
  try {
    const audit = createMemoryAuditSink();
    const gate = await assemble({
      project,
      rules: RULES,
      audit,
      classify: (argv) => {
        const head = argv[0];
        if (head === "allowcmd") return { decision: "allow", ruleId: "allow:readonly:allowcmd" };
        if (head === "denycmd") return { decision: "deny", ruleId: "deny:program:denycmd", reason: "硬拒" };
        if (head === "riskycmd") return { decision: "risky", ruleId: "risky:program:riskycmd" };
        return "review";
      },
    });

    // ① allow → 执行（既有 c-allow 路径；by 带只读档后缀——审计可辨识档位）。
    const ok = await gate(req("allowcmd", ["allowcmd"]));
    assert.equal(ok.allow, true, "命中白名单 → 放行执行");
    if (ok.allow) assert.equal(ok.by, "ruleset:allow:readonly:allowcmd（su 只读档）");

    // ② risky → readonly-deny；reason 写明命中档 + 「策略拒绝，不是环境故障」。
    const risky = await gate(req("riskycmd", ["riskycmd"]));
    assert.equal(risky.allow, false, "risky → 只读档一律拒");
    if (!risky.allow) {
      assert.match(risky.reason, /su 只读档/, "理由写明 su 只读档");
      assert.match(risky.reason, /risky/, "理由写明命中的是哪一档");
      assert.match(risky.reason, /不是环境故障/, "让模型看懂是策略拒绝而非环境坏了");
      assert.match(risky.reason, /仅允许只读白名单命令/, "说清策略边界");
      assert.match(risky.by, /su 只读档/);
      assert.match(risky.by, /ruleset:risky:program:riskycmd/, "by 保留 c 层命中");
    }

    // ③ review → readonly-deny（同②，档为 review）。
    const review = await gate(req("reviewcmd", ["reviewcmd"]));
    assert.equal(review.allow, false, "review → 只读档一律拒");
    if (!review.allow) {
      assert.match(review.reason, /su 只读档/);
      assert.match(review.reason, /review/, "理由写明命中的是哪一档");
      assert.match(review.reason, /不是环境故障/);
    }

    // ④ deny → 照旧拒绝（c-deny；不因只读档改语义）。
    const denied = await gate(req("denycmd", ["denycmd"]));
    assert.equal(denied.allow, false, "硬拒照旧");
    if (!denied.allow) assert.match(denied.reason, /硬拒/);

    // ⑦ 审计分支逐条核对（同一批四档）。
    assert.deepEqual(
      audit.records.map((r) => [r.branch, r.conclusion]),
      [
        [BRANCH_C_ALLOW, "allow"],
        [BRANCH_READONLY_DENY, "deny"],
        [BRANCH_READONLY_DENY, "deny"],
        [BRANCH_C_DENY, "deny"],
      ],
    );
  } finally {
    cleanup(project);
  }
});

// —————————————————————— ⑤ (b)/(a) 从未被调用（抛错桩 + 计数） ——————————————————————

test("只读档：注入 (b) pmAsk / (a) operatorChannel 也**从不调用**（一调用即抛错的桩；四档全覆盖）", async () => {
  const audit = createMemoryAuditSink();
  let pmCalls = 0;
  let opCalls = 0;
  const gate = createShellGate({
    classifyShell: (argv) => {
      const head = argv[0];
      if (head === "allowcmd") return { decision: "allow", ruleId: "allow:readonly:allowcmd" };
      if (head === "denycmd") return { decision: "deny", ruleId: "deny:x", reason: "硬拒" };
      if (head === "riskycmd") return "risky";
      return "review";
    },
    rules: RULES,
    audit,
    readonlyOnly: true,
    // 一调用即抛错（即使被 try/catch 吞掉，计数与分支断言也会钉死「从未被调用」）：
    pmAsk: () => {
      pmCalls += 1;
      throw new Error("(b) pmAsk 不应被调用（su 自己就是审读者，不自审）");
    },
    operatorChannel: () => {
      opCalls += 1;
      throw new Error("(a) operatorChannel 不应被调用（不打扰客户、不弹任何对话框）");
    },
  });

  assert.equal((await gate(req("allowcmd", ["allowcmd"]))).allow, true);
  assert.equal((await gate(req("denycmd", ["denycmd"]))).allow, false);
  assert.equal((await gate(req("riskycmd", ["riskycmd"]))).allow, false);
  assert.equal((await gate(req("reviewcmd", ["reviewcmd"]))).allow, false);

  assert.equal(pmCalls, 0, "(b) 从未被调用");
  assert.equal(opCalls, 0, "(a) 从未被调用");
  // 分支证据：risky/review 命中 readonly-deny（若误入 (b)/(a)，分支会变成 b-*/a-* 升级链）。
  assert.deepEqual(audit.records.map((r) => r.branch), [
    BRANCH_C_ALLOW,
    BRANCH_C_DENY,
    BRANCH_READONLY_DENY,
    BRANCH_READONLY_DENY,
  ]);
});

// —————————————————————— ⑥ 缺件 ⇒ 一律拒绝（fail-closed） ——————————————————————

test("只读档 fail-closed：rules 未注入 ⇒ 一律拒绝（ruleset-load-failed）；classifyShell 未注入 ⇒ 一律拒绝", async () => {
  const project = makeTempProject();
  try {
    // rules 未注入（且 classifyShell 会给 allow）——仍必须整条拒绝。
    const audit = createMemoryAuditSink();
    const noRules = await assemble({ project, classify: () => "allow", audit });
    const r1 = await noRules(req("ls -la", ["ls", "-la"]));
    assert.equal(r1.allow, false, "规则集缺失 ⇒ 绝不放行");
    if (!r1.allow) assert.match(r1.reason, /规则集/);
    assert.equal(audit.records[0].branch, BRANCH_RULESET_LOAD_FAILED);

    const noClassify = await assemble({ project, rules: RULES, audit });
    const r2 = await noClassify(req("ls -la", ["ls", "-la"]));
    assert.equal(r2.allow, false, "分类函数缺失 ⇒ 绝不放行");
    assert.equal(audit.records[1].branch, BRANCH_NO_CLASSIFIER);
  } finally {
    cleanup(project);
  }
});

// —————————————————————— ⑧ 真实落盘：docs/audit/shell-gate.jsonl ——————————————————————

test("只读档审计：真落 docs/audit/shell-gate.jsonl（逐字命令 / branch / execution 恒「未执行」）", async () => {
  const project = makeTempProject();
  try {
    // 不给 auditSink ⇒ 走默认文件落盘（同生产路径：治理边界 + 声明 shell-gate 条件）。
    // 用**明细版**分类函数（门禁引擎既有导出；shell-gate 的 `ShellClassifyDetail` 正是为携带命中规则 id 而设，
    // 审计 by 由此可辨识 `allow:readonly:*`）。
    const gate = await assemble({ project, classify: classifyShellDetailed, rules: RULES, timeoutMs: 2000 });

    await gate({ command: "ls -la", argv: ["ls", "-la"], cwd: project.projectRoot, toolCallId: "tc-1" });
    await gate({ command: "rm tmp.txt", argv: ["rm", "tmp.txt"], cwd: project.projectRoot, toolCallId: "tc-2" });
    await gate({ command: 'sh -c "echo pwn"', argv: ["sh", "-c", 'echo "echo pwn"'], cwd: project.projectRoot, toolCallId: "tc-3" });

    const auditPath = path.join(project.projectRoot, SHELL_AUDIT_REL_PATH);
    assert.ok(fs.existsSync(auditPath), "审计文件应被创建（docs/audit/shell-gate.jsonl）");
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 3, "三条请求三条记录（追加式）");
    const [allow, risky, deny] = lines.map((l) => JSON.parse(l) as ShellAuditRecord);

    // ① allow：命中只读白名单，c-allow；by 带只读档后缀（审计档位可辨识、命中规则 id 可辨识）。
    assert.equal(allow.command, "ls -la"); // 逐字原文
    assert.deepEqual(allow.argv, ["ls", "-la"]);
    assert.equal(allow.branch, BRANCH_C_ALLOW);
    assert.equal(allow.conclusion, "allow");
    assert.equal(allow.by, "ruleset:allow:readonly:ls（su 只读档）");

    // ② risky：readonly-deny（分支字段正确；by 标明只读档与命中的 risky 规则）。
    assert.equal(risky.command, "rm tmp.txt");
    assert.equal(risky.branch, BRANCH_READONLY_DENY);
    assert.equal(risky.conclusion, "deny");
    assert.match(risky.by, /su 只读档/);
    assert.match(risky.by, /risky:program:risky:delete/, "by 保留 c 层命中规则 id");

    // ③ deny：照旧 c-deny。
    assert.equal(deny.branch, BRANCH_C_DENY);
    assert.equal(deny.conclusion, "deny");

    // 口径不变：全部记录 execution 恒为「未执行」；声明 shell-gate 条件；cwd 如实。
    for (const rec of [allow, risky, deny]) {
      assert.equal(rec.execution, "未执行", "execution 恒「未执行」（既有约定不变）");
      assert.ok(rec.conditions.includes(SHELL_GATE_CONDITION), "声明 shell-gate 条件");
      assert.equal(rec.cwd, project.projectRoot);
    }
  } finally {
    cleanup(project);
  }
});

// —————————————————————— ⑨ 集成：门禁引擎实件 ——————————————————————

test("只读档集成（门禁引擎实件）：ls/git status/node --version 放行；rm→readonly-deny；node --test→readonly-deny（不在白名单，本任务接受的现状）；sh -c→c-deny", async () => {
  const project = makeTempProject();
  try {
    const audit = createMemoryAuditSink();
    const gate = await assemble({ project, classify: classifyShellDetailed, rules: RULES, audit });

    // 只读白名单：放行（这些是 su 只读 shell 的正当用途）。
    for (const [cmd, argv] of [
      ["ls -la", ["ls", "-la"]],
      ["cat README.md", ["cat", "README.md"]],
      ["git status", ["git", "status"]],
      ["node --version", ["node", "--version"]],
    ] as const) {
      const r = await gate(req(cmd, [...argv]));
      assert.equal(r.allow, true, `只读命令应放行：${cmd}`);
    }

    // risky（危险但有正当用途）：只读档下**一律拒**（不接 (b)/(a)）。
    const rm = await gate(req("rm tmp.txt", ["rm", "tmp.txt"]));
    assert.equal(rm.allow, false, "rm（risky）→ 只读档拒");
    if (!rm.allow) {
      assert.match(rm.reason, /risky/);
      assert.match(rm.reason, /su 只读档/);
    }

    // review（未命中白名单，如 node --test —— 跑测试类命令不在只读白名单，本任务接受的现状）：只读档拒。
    const nodeTest = await gate(req("node --test", ["node", "--test"]));
    assert.equal(nodeTest.allow, false, "node --test（review）→ 只读档拒（现状：不在白名单）");
    if (!nodeTest.allow) assert.match(nodeTest.reason, /review/);

    // deny（re-shell）：照旧硬拒。
    const reshell = await gate(req('sh -c "echo pwn"', ["sh", "-c", 'echo "echo pwn"']));
    assert.equal(reshell.allow, false, "sh -c → 硬拒");
    if (!reshell.allow) assert.match(reshell.by, /ruleset:deny:program:reshell/);

    // 审计：7 条请求 7 条记录，分支序列与判定一致。
    assert.deepEqual(
      audit.records.map((r) => r.branch),
      [
        BRANCH_C_ALLOW,
        BRANCH_C_ALLOW,
        BRANCH_C_ALLOW,
        BRANCH_C_ALLOW,
        BRANCH_READONLY_DENY,
        BRANCH_READONLY_DENY,
        BRANCH_C_DENY,
      ],
    );
  } finally {
    cleanup(project);
  }
});

// —————————————————————— ⑩ run-role 侧接线 ——————————————————————

/** 捕获能力面的适配器桩（照 shell-arming 既有测试手法）。 */
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

/** (b) 审读桩（三层链用；只读档路径不应触及它）。 */
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

test("run-role：su 给 shellReadonly ⇒ 只读档 gate 到达 adapter（run_shell 注册）；不给 ⇒ 不 arm（既有行为不变）", async () => {
  const project = makeTempProject();
  try {
    // su + shellReadonly ⇒ caps.shellGate 存在，且按只读档判定（ls 放行 / rm、node --test 拒）。
    const armed = capsCapturingAdapter();
    const h1 = await openRoleSession(
      { roleId: "su", project, shellReadonly: { classifyShell, rules: RULES } },
      { createAdapter: armed.createAdapter },
    );
    const gate = armed.caps()?.shellGate;
    assert.equal(typeof gate, "function", "su 给 shellReadonly ⇒ gate 到达 adapter");
    assert.equal((await gate!(req("ls -la", ["ls", "-la"]))).allow, true, "只读白名单命令放行");
    const rm = await gate!(req("rm tmp.txt", ["rm", "tmp.txt"]));
    assert.equal(rm.allow, false, "risky → 只读档拒");
    if (!rm.allow) assert.match(rm.reason, /su 只读档/);
    const nodeTest = await gate!(req("node --test", ["node", "--test"]));
    assert.equal(nodeTest.allow, false, "review → 只读档拒");
    await h1.dispose();

    // su 不给 shellReadonly ⇒ 不 arm（既有行为逐字不变：su 本身没有 run_shell）。
    const unarmed = capsCapturingAdapter();
    const h2 = await openRoleSession({ roleId: "su", project }, { createAdapter: unarmed.createAdapter });
    assert.equal(unarmed.caps()?.shellGate, undefined, "不给 ⇒ 不 arm（run_shell 不注册）");
    await h2.dispose();
  } finally {
    cleanup(project);
  }
});

test("run-role：shellReadonly 与三层链同时出现 ⇒ readonly 优先（(a)/(b) 均不被调用）", async () => {
  const project = makeTempProject();
  try {
    let opCalls = 0;
    let pmOpens = 0;
    const capsAdapter = capsCapturingAdapter();
    const h = await openRoleSession(
      {
        roleId: "X",
        project,
        // 既有三层链的注入件（(a) 通道 + 高级注入）与只读档同时给出：
        shellOperatorChannel: () => {
          opCalls += 1;
          return { outcome: "allow", operatorId: "t" };
        },
        shellArming: {
          classifyShell,
          rules: RULES,
          openSession: async () => {
            pmOpens += 1;
            return reviewStub(`{"verdict":"allow","reason":"测试"}`)();
          },
        },
        shellReadonly: { classifyShell, rules: RULES },
      },
      { createAdapter: capsAdapter.createAdapter },
    );
    const gate = capsAdapter.caps()?.shellGate;
    assert.equal(typeof gate, "function");

    // review 类命令：只读档赢 ⇒ 拒（若三层链赢，b=allow 会放行且不经 (a)）。
    const r = await gate!(req("mysterytool --flag", ["mysterytool", "--flag"]));
    assert.equal(r.allow, false, "readonly 优先 ⇒ review 类命令拒（三层链会放行）");
    if (!r.allow) assert.match(r.reason, /su 只读档/);
    assert.equal(opCalls, 0, "(a) 通道不被调用");
    assert.equal(pmOpens, 0, "(b) 审读会话不被打开");
    await h.dispose();
  } finally {
    cleanup(project);
  }
});

test("run-role 端到端（假适配器事件流）：su 的 run_shell 请求经只读档判定——risky 进事件流为 denied、消息为「未执行」，绝不真跑", async () => {
  const project = makeTempProject();
  try {
    const script = [{ name: "run_shell", args: { command: "rm tmp.txt" } }];
    let caps: AdapterCapabilities | undefined;
    const handle = await openRoleSession(
      { roleId: "su", project, shellReadonly: { classifyShell, rules: RULES } },
      {
        createAdapter: (g, c) => {
          caps = c;
          return createFakeRuntimeAdapter({
            gate: g,
            script,
            writeRoot: project.projectRoot,
            shellGate: c?.shellGate,
          });
        },
      },
    );
    assert.equal(typeof caps?.shellGate, "function");
    await handle.send("试试只读 shell");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);

    assert.ok(
      events.some((e) => e.kind === "tool_call" && /run_shell/.test(e.summary)),
      "请求进事件流",
    );
    const denied = events.find((e) => e.kind === "denied");
    assert.ok(denied, "risky 命令被拒（denied 事件）");
    assert.match(denied!.summary, /su 只读档/, "拒绝理由如实转达（策略拒绝）");
    assert.match(denied!.summary, /未执行/, "绝不谎报执行");
    assert.ok(
      !events.some((e) => e.kind === "accepted" && /run_shell/.test(e.summary)),
      "不存在 accepted（未执行）",
    );
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});
