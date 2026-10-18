// test/编排/shell-judge.test.ts
// 「替我审」判断 agent 驱动（编排 P2）离线单测：**注入假 createAdapter，绝不调用真实模型**。
//
// 覆盖（PM 评审 §12.1 A8/A9/A17/A26/A27/A28 的编排侧）：
//   · 三态 allow / deny / manual 与 §6.4 reasonCode（含 deny 有/无替代方案、model-manual）；
//   · 读取损伤（read-denied / budget / read-truncated）→ allow 降 manual，deny 不变；
//   · 客户 D1：tier=deny 且 allow → hardDenyOverride + label，不转换；
//   · 超时/中止、超时前已捕获结论保留、迟到 bindRole dispose、防循环（allow 清零/manual 不递增）、busy；
//   · 合成角色边界为空、工具集恰三项（无写/shell/交互/派发）、deny-all 写门禁；
//   · 审计 `OperatorOutcome.judge` 透传（含 tier/hardDenyOverride）。
//
// 不读 `.env`、不跑凭据/网络；适配器工厂是纯桩。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProjectConfig, ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeAdapterFactory, AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { ShellJudgeRequest, WriteGate } from "../../src/model/runtime.ts";
import {
  createShellJudge,
  DEFAULT_SHELL_JUDGE_TIMEOUT_MS,
  formatShellJudgeTimeout,
  resolveShellJudgeTimeoutMs,
  shellJudgeAuditOf,
  SHELL_JUDGE_DENY_TIER_LABEL,
  SHELL_JUDGE_SUPPORTED_RUNTIMES,
  SHELL_JUDGE_TIMEOUT_ENV,
  summarizeDeniedReads,
  type ShellJudgeFn,
  type ShellJudgeOutcome,
} from "../../src/common/编排/shell-judge.ts";
import {
  normalizeShellJudgeVerdict,
  redactJudgeText,
  SHELL_JUDGE_EXIT_LINE,
  synthesizeCustomerMessage,
} from "../../src/common/编排/shell-judge-verdict.ts";
import {
  buildShellJudgePrompt,
  buildShellJudgeSystemPrompt,
} from "../../src/common/编排/shell-judge-prompt.ts";
import { createShellGate } from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink, type ShellAuditRecord } from "../../src/common/编排/shell-audit.ts";
import type { ShellAuditSink } from "../../src/common/编排/shell-audit.ts";
import { buildShellJudgeTools, SHELL_JUDGE_TOOL_NAMES } from "../../src/common/runtime-core/shell-judge/tools.ts";
import type { ShellRules } from "../../src/model/decision.ts";

const PROJECT: ProjectConfig = {
  projectRoot: process.cwd(),
  skillRoot: process.cwd(),
  roles: {},
};

const BASE_REQUEST: ShellJudgeRequest = {
  command: "npm test",
  argv: ["npm", "test"],
  cwd: PROJECT.projectRoot,
  toolCallId: "call-1",
  roleId: "编排",
  projectRoot: PROJECT.projectRoot,
  runtime: "claude",
  policy: "project",
  tier: "risky",
  reason: "risky 命令：pm 判放行，仍须操作者确认",
  turnText: "请运行测试并修复失败用例。",
};

interface Seen {
  capabilities?: AdapterCapabilities;
  role?: ResolvedRole;
  gate?: WriteGate;
  prompts: string[];
  binds: number;
  disposed: number;
  aborted: number;
  release?: () => void;
}

interface FakeScript {
  /** 模型交回的原始参数；函数形式可先改读取统计。 */
  report?: unknown | ((seen: Seen) => unknown | Promise<unknown>);
  /** false ⇒ events 永不 settle（用于超时/中止）。 */
  settle?: boolean;
  /** 优先产出一条 message 事件（降级解析路径）。 */
  message?: string;
  /** bindRole 延迟（用于迟到 bindRole 的 dispose）。 */
  bindDelayMs?: number;
  throwBind?: boolean;
  /** prompt 后不交结论也不 settle。 */
  silent?: boolean;
}

function fakeFactory(script: FakeScript = {}): { factory: RuntimeAdapterFactory; seen: Seen } {
  const seen: Seen = { prompts: [], binds: 0, disposed: 0, aborted: 0 };
  const factory: RuntimeAdapterFactory = (gate, capabilities) => {
    seen.gate = gate;
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(role) {
        seen.role = role;
        seen.binds += 1;
        if (script.throwBind === true) throw new Error("判断会话开不了");
        if (script.bindDelayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, script.bindDelayMs));
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
            if (script.silent === true) return;
            if (script.report !== undefined) {
              const raw = typeof script.report === "function" ? await script.report(seen) : script.report;
              capabilities?.shellJudge?.report(raw);
            }
          },
          async *events() {
            if (script.message !== undefined) yield { kind: "message" as const, summary: script.message };
            if (script.settle === false) {
              await new Promise<void>((resolve) => { seen.release = resolve; });
              return;
            }
            yield { kind: "settled" as const, summary: "settled" };
          },
          async dispose() {
            seen.disposed += 1;
            seen.release?.();
          },
          async abort() {
            seen.aborted += 1;
            seen.release?.();
          },
        };
      },
    };
  };
  return { factory, seen };
}

function makeJudge(script: FakeScript, options: { runtime?: ShellJudgeRequest["runtime"]; timeoutMs?: number; maxDeny?: number } = {}): {
  judge: ShellJudgeFn;
  seen: Seen;
} {
  const { factory, seen } = fakeFactory(script);
  const judge = createShellJudge({
    project: PROJECT,
    runtime: options.runtime ?? "claude",
    createAdapter: factory,
    timeoutMs: options.timeoutMs ?? 200,
    ...(options.maxDeny !== undefined ? { maxDenyPerCommand: options.maxDeny } : {}),
  });
  return { judge, seen };
}

function request(overrides: Partial<ShellJudgeRequest> = {}): ShellJudgeRequest {
  return { ...BASE_REQUEST, ...overrides };
}

// —————————————————————— 1. 三态与 reasonCode 全表 ——————————————————————

test("allow → necessary；命令/项目根进入提示，系统提示稳定且含不可信数据警告", async () => {
  const { judge, seen } = makeJudge({ report: { verdict: "allow", reason: "任务明确要求运行测试" } });
  const out = await judge(request());
  assert.equal(out.verdict, "allow");
  assert.equal(out.reasonCode, "necessary");
  assert.equal(out.reason, "任务明确要求运行测试");
  assert.equal(out.hardDenyOverride, undefined);
  assert.equal(seen.role?.id, "shell-judge");
  assert.equal(seen.role?.kind, "project");
  assert.deepEqual(seen.role?.boundary.entries, []);
  assert.equal(seen.role?.boundary.boundarySource, "shell-judge");
  assert.equal(seen.role?.cardText, buildShellJudgeSystemPrompt());
  assert.equal(seen.capabilities?.persistSession, false);
  assert.match(seen.prompts[0] ?? "", /npm test/);
  assert.match(seen.prompts[0] ?? "", /请运行测试/);
  assert.doesNotMatch(seen.prompts[0] ?? "", /历史转录/);
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /不可信数据/);
  assert.match(system, /report_shell_judgement/);
  assert.match(system, /allow/);
  assert.match(system, /deny 档/);
});

test("deny + alternative → safer-alternative；客户说明可用时不改写", async () => {
  const customerMessage = `建议先跑单个测试。${SHELL_JUDGE_EXIT_LINE}`;
  const { judge } = makeJudge({
    report: {
      verdict: "deny",
      reason: "全量测试不是最小动作",
      customerMessage,
      alternative: { kind: "command", value: "npm test -- --test-name-pattern=foo", rationale: "更小范围" },
    },
  });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "safer-alternative");
  assert.equal(out.customerMessage, customerMessage);
  assert.notEqual(out.customerMessageSynthesized, true);
  assert.deepEqual(out.alternative, {
    kind: "command",
    value: "npm test -- --test-name-pattern=foo",
    rationale: "更小范围",
  });
});

test("deny 无 alternative → no-alternative；缺客户说明时合成并含标准出路", async () => {
  const { judge } = makeJudge({ report: { verdict: "deny", reason: "与当前任务无关" } });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "no-alternative");
  assert.equal(out.customerMessageSynthesized, true);
  assert.match(out.customerMessage ?? "", /与当前任务无关/);
  assert.ok((out.customerMessage ?? "").includes(SHELL_JUDGE_EXIT_LINE));
});

test("模型自报 manual → model-manual（不当作 deny）", async () => {
  const { judge } = makeJudge({ report: { verdict: "manual", reason: "读取策略阻止了判断" } });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "model-manual");
  assert.match(out.reason ?? "", /读取策略/);
});

test("非法/未知裁决 → manual/parse-failed（绝不从散文里猜结论）", async () => {
  for (const raw of [{ verdict: "maybe" }, { verdict: "allow" }, "allow", null, { verdict: "allow", reason: "   " }]) {
    const { judge } = makeJudge({ report: raw });
    const out = await judge(request());
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "parse-failed");
  }
  // 降级路径：最后一条 message 只在是**纯 JSON 对象**时接受。
  const prose = makeJudge({ message: "看起来没问题，我建议放行。" });
  assert.equal((await prose.judge(request())).reasonCode, "parse-failed");
});

test("工具缺失时降级解析纯 JSON message（可去代码围栏）", async () => {
  const { judge } = makeJudge({
    message: "```json\n{\"verdict\":\"deny\",\"reason\":\"不必要\"}\n```",
  });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "no-alternative");
});

// —————————————————————— 2. 读取损伤 ——————————————————————

test("读取损伤：allow 一律降 manual（budget 优先 / read-truncated / read-denied）；deny 不变", async () => {
  const cases: Array<[string, (stats: { deniedReads: number; budgetExceeded: boolean; truncatedReads: number }) => void, string]> = [
    ["read-denied（敏感/越界）", (stats) => { stats.deniedReads = 1; }, "read-denied"],
    ["budget（仅标志）", (stats) => { stats.budgetExceeded = true; }, "budget"],
    // 独立验收缺陷回归：第 9 次读取（调用预算耗尽）同时计入 deniedReads + budgetExceeded，
    // 必须判预算耗尽，不得误报「文件不可读」。
    ["budget（第 9 次读取，deniedReads 同时 +1）", (stats) => {
      stats.deniedReads = 1;
      stats.budgetExceeded = true;
    }, "budget"],
    // 预算与截断同时出现：预算优先（判定顺序钉死）。
    ["budget（与截断同时）", (stats) => {
      stats.truncatedReads = 1;
      stats.budgetExceeded = true;
    }, "budget"],
    ["read-truncated", (stats) => { stats.truncatedReads = 1; }, "read-truncated"],
  ];
  for (const [label, damage, code] of cases) {
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        damage(seen.capabilities!.shellJudge!.stats);
        return { verdict: "allow", reason: `${label} 下仍想放行` };
      },
    });
    const out = await judge(request());
    assert.equal(out.verdict, "manual", label);
    assert.equal(out.reasonCode, code, label);
    if (code === "budget") {
      assert.match(out.reason ?? "", /预算耗尽/, label);
      assert.doesNotMatch(out.reason ?? "", /文件不可读/, label);
    }
    if (code === "read-denied") assert.match(out.reason ?? "", /读取被拒/, label);
    if (code === "read-truncated") assert.match(out.reason ?? "", /截断/, label);
  }

  // deny 始终有效：读取被拒也不改写拒绝方向。
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      seen.capabilities!.shellJudge!.stats.deniedReads = 2;
      seen.capabilities!.shellJudge!.stats.budgetExceeded = true;
      return { verdict: "deny", reason: "不必要", alternative: { kind: "instruction", value: "先读任务" } };
    },
  });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "safer-alternative");
});

test("read-denied 摘要：列项目相对路径与类别（app-private 条目可随其他拒绝一起展示）", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.shellJudge!.stats;
      stats.deniedReads = 2;
      stats.deniedPaths = [
        { path: ".ans/sessions/a.json", code: "app-private", pathClass: "app-private" },
        { path: "src/foo.txt", code: "sensitive", pathClass: "credential" },
      ];
      return { verdict: "allow", reason: "仍想放行" };
    },
  });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "read-denied");
  const reason = out.reason ?? "";
  assert.match(reason, /判断读取被拒：/);
  assert.match(reason, /\.ans\/sessions\/a\.json（应用私有数据）/);
  assert.match(reason, /src\/foo\.txt（凭据文件）/);
  assert.match(reason, /无法保证无损判断，已转手动确认。/);
  assert.doesNotMatch(reason, /[A-Za-z]:[\\/]|\/(?:home|Users|tmp)\//, "摘要不含绝对路径");
});

test("read-denied 摘要：根外条目（path 为空）只显示类别", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.shellJudge!.stats;
      stats.deniedReads = 1;
      stats.deniedPaths = [{ path: "", code: "outside-root", pathClass: "outside-root" }];
      return { verdict: "allow", reason: "仍想放行" };
    },
  });
  const out = await judge(request());
  assert.equal(out.reasonCode, "read-denied");
  assert.match(out.reason ?? "", /判断读取被拒：项目外路径，/);
  assert.doesNotMatch(out.reason ?? "", /（/, "根外条目不得渲染空路径");
});

test("read-denied 摘要：deniedPaths 为空 ⇒ 保留原泛化文案", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.shellJudge!.stats;
      stats.deniedReads = 1;
      stats.deniedPaths = [];
      return { verdict: "allow", reason: "仍想放行" };
    },
  });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "read-denied");
  assert.match(out.reason ?? "", /判断读取被拒（敏感文件\/越界\/二进制），无法保证无损判断，已转手动确认。/);
});

test("read-denied 摘要：最多 3 条、更多追加「等 N 个路径」且 ≤200 字符", async () => {
  const entries = [
    { path: "a.env", code: "sensitive" as const, pathClass: "env" as const },
    { path: "keys/id.pem", code: "sensitive" as const, pathClass: "key-material" as const },
    { path: "config/secret.txt", code: "sensitive" as const, pathClass: "credential" as const },
    { path: "bin/tool.exe", code: "binary" as const, pathClass: "binary" as const },
  ];
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.shellJudge!.stats;
      stats.deniedReads = 4;
      stats.deniedPaths = entries;
      return { verdict: "allow", reason: "仍想放行" };
    },
  });
  const out = await judge(request());
  const reason = out.reason ?? "";
  assert.equal(out.reasonCode, "read-denied");
  assert.match(reason, /a\.env（环境变量文件）/);
  assert.match(reason, /keys\/id\.pem（私钥\/证书）/);
  assert.match(reason, /config\/secret\.txt（凭据文件）/);
  assert.doesNotMatch(reason, /bin\/tool\.exe/, "第 4 条不展开");
  assert.match(reason, / 等 4 个路径/);
  const summary = reason.replace(/^判断读取被拒：/, "").replace(/，无法保证无损判断，已转手动确认。$/, "");
  assert.ok([...summary].length <= 200, `摘要 ≤200 字符，实际 ${[...summary].length}`);
});

test("read-denied 摘要：按原因码细化（not-found ⇒ 路径不存在，不再显示「受限路径」）", () => {
  const summarize = (entry: { path: string; code: "not-found" | "not-a-file" | "read-failed" | "invalid-path" | "empty"; pathClass: "unknown" | "non-regular" }) =>
    summarizeDeniedReads({
      readCalls: 1,
      readBytes: 0,
      deniedReads: 1,
      truncatedReads: 0,
      budgetExceeded: false,
      deniedPaths: [entry],
    });
  assert.equal(summarize({ path: "docs/flows", code: "not-found", pathClass: "unknown" }), "docs/flows（路径不存在）");
  assert.equal(summarize({ path: "docs/a.md", code: "not-a-file", pathClass: "non-regular" }), "docs/a.md（路径类型不符）");
  assert.equal(summarize({ path: "docs/b", code: "read-failed", pathClass: "unknown" }), "docs/b（读取失败）");
  assert.equal(summarize({ path: "../x", code: "invalid-path", pathClass: "unknown" }), "../x（非法路径）");
  assert.equal(summarize({ path: "", code: "empty", pathClass: "unknown" }), "空路径", "path 为空只显示原因");
});

test("app-private 拒绝不计入 deniedReads：单独出现不触发 read-denied", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.shellJudge!.stats;
      stats.appPrivateDeniedReads = 1;
      stats.deniedPaths = [{ path: ".ans/sessions/a.json", code: "app-private", pathClass: "app-private" }];
      return { verdict: "allow", reason: "账本已在事实里" };
    },
  });
  const out = await judge(request());
  assert.equal(out.verdict, "allow", "app-private 不构成读取损伤");
  assert.equal(out.reasonCode, "necessary");
});

// —————————————————————— 3. 客户 D1：deny 档放行 ——————————————————————

test("tier=deny 且模型 allow → 照常 allow，hardDenyOverride + label（不转换、不拦截）", async () => {
  const { judge } = makeJudge({ report: { verdict: "allow", reason: "任务明确要求重建指定设备" } });
  const out = await judge(request({ tier: "deny", policy: "su-approval" }));
  assert.equal(out.verdict, "allow");
  assert.equal(out.reasonCode, "necessary");
  assert.equal(out.hardDenyOverride, true);
  assert.equal(out.label, SHELL_JUDGE_DENY_TIER_LABEL);
});

test("普通 risky/review 放行不带 hardDenyOverride/label", async () => {
  const { judge } = makeJudge({ report: { verdict: "allow", reason: "任务需要" } });
  for (const tier of ["risky", "review", null] as const) {
    const out = await judge(request({ tier }));
    assert.equal(out.verdict, "allow");
    assert.equal(out.hardDenyOverride, undefined);
    assert.equal(out.label, undefined);
  }
});

// —————————————————————— 4. 超时 / 中止 / 迟到 bindRole ——————————————————————

test("超时前已捕获合法结论 → 结论保留（超时只中止等待）", async () => {
  const { judge, seen } = makeJudge(
    { report: { verdict: "allow", reason: "任务明确要求" }, settle: false },
    { timeoutMs: 30 },
  );
  const out = await judge(request());
  assert.equal(out.verdict, "allow");
  assert.equal(out.reasonCode, "necessary");
  assert.ok(seen.disposed >= 1, "超时后应 dispose 判断会话");
  assert.ok(seen.aborted >= 1, "超时后应 abort 判断会话");
});

test("超时且无结论 → manual/timeout", async () => {
  const { judge } = makeJudge({ silent: true, settle: false }, { timeoutMs: 25 });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "timeout");
  assert.match(out.reason ?? "", /判断超时（>25ms）/);
});

test("超时配置：shell 默认 120s、env 覆盖、非法回退；执行时限不变", async () => {
  assert.equal(DEFAULT_SHELL_JUDGE_TIMEOUT_MS, 120_000);
  assert.equal(resolveShellJudgeTimeoutMs(undefined, {}), 120_000);
  assert.equal(resolveShellJudgeTimeoutMs(undefined, { [SHELL_JUDGE_TIMEOUT_ENV]: "1234" }), 1234);
  for (const bad of ["", "0", "-1", "1.5", "abc", "9007199254740993"]) {
    assert.equal(
      resolveShellJudgeTimeoutMs(undefined, { [SHELL_JUDGE_TIMEOUT_ENV]: bad }),
      120_000,
      `非法环境值 ${JSON.stringify(bad)} 应回默认`,
    );
  }
  assert.equal(resolveShellJudgeTimeoutMs(25, { [SHELL_JUDGE_TIMEOUT_ENV]: "1234" }), 25, "显式选项优先");
  assert.equal(formatShellJudgeTimeout(120_000), "120s");

  const previous = process.env[SHELL_JUDGE_TIMEOUT_ENV];
  process.env[SHELL_JUDGE_TIMEOUT_ENV] = "25";
  try {
    const { factory } = fakeFactory({ silent: true, settle: false });
    const judge = createShellJudge({ project: PROJECT, runtime: "claude", createAdapter: factory });
    const out = await judge(request());
    assert.equal(out.reasonCode, "timeout");
    assert.match(out.reason ?? "", /判断超时（>25ms）/);
  } finally {
    if (previous === undefined) delete process.env[SHELL_JUDGE_TIMEOUT_ENV];
    else process.env[SHELL_JUDGE_TIMEOUT_ENV] = previous;
  }
});

test("外部中止 → manual/aborted（丢弃已捕获结果）；预中止不建会话", async () => {
  const controller = new AbortController();
  const { judge, seen } = makeJudge({
    report: () => {
      controller.abort();
      return { verdict: "allow", reason: "本应被丢弃" };
    },
    settle: false,
  }, { timeoutMs: 500 });
  const out = await judge(request(), controller.signal);
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "aborted");

  const pre = new AbortController();
  pre.abort();
  const { judge: judge2, seen: seen2 } = makeJudge({ report: { verdict: "allow", reason: "x" } });
  const out2 = await judge2(request(), pre.signal);
  assert.equal(out2.reasonCode, "aborted");
  assert.equal(seen2.binds, 0, "预中止不应建立判断会话");
  assert.equal(seen.binds, 1);
});

test("迟到 bindRole：超时后会话才返回 → 立即 dispose（不泄漏）", async () => {
  const { judge, seen } = makeJudge({ bindDelayMs: 80, report: { verdict: "allow", reason: "晚到" } }, { timeoutMs: 20 });
  const out = await judge(request());
  assert.equal(out.reasonCode, "timeout");
  // 等 bindRole 返回并走迟到 dispose 分支。
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(seen.binds, 1);
  assert.ok(seen.disposed >= 1, "迟到 bindRole 返回的会话必须被 dispose");
});

// —————————————————————— 5. 防循环 / busy ——————————————————————

test("防循环：同一命令连续 deny 达上限 → manual/retry-capped（不调用模型）", async () => {
  const { judge, seen } = makeJudge({ report: { verdict: "deny", reason: "不必要" } }, { maxDeny: 2 });
  assert.equal((await judge(request())).verdict, "deny");
  assert.equal((await judge(request())).verdict, "deny");
  const capped = await judge(request());
  assert.equal(capped.verdict, "manual");
  assert.equal(capped.reasonCode, "retry-capped");
  assert.equal(seen.binds, 2, "上限命中后不得再开会话");
});

test("防循环：allow 清零计数、manual 不递增", async () => {
  let verdict: unknown = { verdict: "deny", reason: "不必要" };
  const { factory } = fakeFactory({ report: async () => verdict });
  const judge = createShellJudge({ project: PROJECT, runtime: "claude", createAdapter: factory, maxDenyPerCommand: 2 });
  assert.equal((await judge(request())).verdict, "deny"); // count=1
  verdict = { verdict: "allow", reason: "这次任务明确需要" };
  assert.equal((await judge(request())).verdict, "allow"); // count 清零
  verdict = { verdict: "deny", reason: "不必要" };
  assert.equal((await judge(request())).verdict, "deny"); // count=1
  assert.equal((await judge(request())).verdict, "deny"); // count=2
  const capped = await judge(request());
  assert.equal(capped.reasonCode, "retry-capped");

  // manual 不增不减：deny(1) → manual → deny(1) → deny(2) → 上限。
  let mode: "deny" | "manual" = "deny";
  const manualFactory = fakeFactory({ report: async () => mode === "deny" ? { verdict: "deny", reason: "不必要" } : { verdict: "manual", reason: "读不了" } });
  const judge2 = createShellJudge({ project: PROJECT, runtime: "claude", createAdapter: manualFactory.factory, maxDenyPerCommand: 2 });
  assert.equal((await judge2(request())).verdict, "deny"); // 1
  mode = "manual";
  assert.equal((await judge2(request())).verdict, "manual"); // 不递增
  mode = "deny";
  assert.equal((await judge2(request())).verdict, "deny"); // 2
  assert.equal((await judge2(request())).reasonCode, "retry-capped");
});

test("busy：已有一次判断在进行时，第二次直接 manual/unavailable", async () => {
  const { judge } = makeJudge({ report: { verdict: "allow", reason: "任务需要" }, settle: false }, { timeoutMs: 40 });
  const first = judge(request({ toolCallId: "call-1" }));
  const second = await judge(request({ toolCallId: "call-2" }));
  assert.equal(second.verdict, "manual");
  assert.equal(second.reasonCode, "unavailable");
  assert.match(second.reason ?? "", /正忙/);
  await first; // 等超时收口，避免悬挂
});

// —————————————————————— 6. 支持矩阵 / 不可用 / 上下文 ——————————————————————

test("支持矩阵：claude/pi/codex 支持；demo → manual/unsupported-engine（不建会话）", async () => {
  assert.deepEqual([...SHELL_JUDGE_SUPPORTED_RUNTIMES].sort(), ["claude", "codex", "pi"]);
  const { judge, seen } = makeJudge({ report: { verdict: "allow", reason: "x" } }, { runtime: "demo" });
  const out = await judge(request({ runtime: "demo" }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "unsupported-engine");
  assert.equal(seen.binds, 0);
});

test("会话不可用 → manual/unavailable（不抛错）", async () => {
  const { judge } = makeJudge({ throwBind: true });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "unavailable");
  assert.match(out.reason ?? "", /判断会话不可用/);
});

test("上下文缺失/超限 → context-missing / context-too-large", async () => {
  const { judge } = makeJudge({ report: { verdict: "allow", reason: "x" } });
  assert.equal((await judge(request({ command: "   " }))).reasonCode, "context-missing");
  // projectRoot 缺省时回落到装配的 project.projectRoot（请求上下文来自会话闭包；不因此拒判）。
  assert.equal((await judge(request({ projectRoot: "" }))).verdict, "allow");
  const tooLarge = await judge(request({ command: "a".repeat(17 * 1024) }));
  assert.equal(tooLarge.reasonCode, "context-too-large");
  const tooMany = await judge(request({ command: "x", argv: Array.from({ length: 257 }, () => "a") }));
  assert.equal(tooMany.reasonCode, "context-too-large");
});

// —————————————————————— 7. 结构隔离：工具集与写门禁 ——————————————————————

test("判断会话只见三项只读工具；写门禁 deny-all；不改 RuntimeAdapter 契约", async () => {
  const { judge, seen } = makeJudge({ report: { verdict: "allow", reason: "任务需要" } });
  await judge(request());
  const toolOptions = seen.capabilities?.shellJudge;
  assert.ok(toolOptions !== undefined);
  const names = buildShellJudgeTools(toolOptions).map((tool) => tool.name);
  assert.deepEqual(names, [...SHELL_JUDGE_TOOL_NAMES]);
  for (const forbidden of ["write_file", "edit_file", "read_file", "run_shell", "request_confirmation", "request_choice", "submit_report", "dispatch_task"]) {
    assert.equal((names as string[]).includes(forbidden), false, `不得注册 ${forbidden}`);
  }
  const decision = seen.gate?.("/tmp/anything");
  assert.ok(decision !== undefined);
  assert.equal(decision.allowed, false);
});

// —————————————————————— 8. 审计透传 ——————————————————————

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const GATE_REQ = { command: "make deploy", argv: ["make", "deploy"], cwd: PROJECT.projectRoot, toolCallId: "audit-1" };

function gateWithJudge(operatorChannel: Parameters<typeof createShellGate>[0]["operatorChannel"]): {
  gate: ReturnType<typeof createShellGate>;
  audit: ShellAuditSink & { records: ShellAuditRecord[] };
} {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "risky",
    rules: RULES,
    rulesId: "test-ruleset",
    audit,
    operatorChannel,
    timeoutMs: 500,
  });
  return { gate, audit };
}

test("审计透传 judge：allow + tier=deny + hardDenyOverride；by 以 operator:judge:<引擎> 结尾", async () => {
  const judgeAudit: ShellAuditRecord["judge"] = {
    engine: "claude",
    model: "claude-sonnet-5",
    tier: "deny",
    hardDenyOverride: true,
    verdict: "allow",
    reasonCode: "necessary",
    reason: "任务明确要求部署到指定环境",
    label: SHELL_JUDGE_DENY_TIER_LABEL,
  };
  const { gate, audit } = gateWithJudge(() => ({
    outcome: "allow",
    operatorId: "judge:claude",
    judge: judgeAudit,
  }));
  const result = await gate(GATE_REQ);
  assert.equal(result.allow, true);
  if (!result.allow) return;
  assert.match(result.by, /operator:judge:claude$/);
  const record = audit.records[0]!;
  assert.equal(record.conclusion, "allow");
  assert.deepEqual(record.judge, {
    engine: "claude",
    model: "claude-sonnet-5",
    tier: "deny",
    hardDenyOverride: true,
    verdict: "allow",
    reasonCode: "necessary",
    reason: "任务明确要求部署到指定环境",
    label: SHELL_JUDGE_DENY_TIER_LABEL,
  });
});

test("审计透传 judge：deny 也带 judge；人工手批不带 judge", async () => {
  const { gate, audit } = gateWithJudge(() => ({
    outcome: "deny",
    operatorId: "judge:pi",
    reason: "判断 agent 未放行该命令",
    judge: {
      engine: "pi",
      tier: "review",
      verdict: "deny",
      reasonCode: "no-alternative",
    },
  }));
  const denied = await gate(GATE_REQ);
  assert.equal(denied.allow, false);
  assert.equal(audit.records[0]?.conclusion, "deny");
  assert.deepEqual(audit.records[0]?.judge, {
    engine: "pi",
    tier: "review",
    verdict: "deny",
    reasonCode: "no-alternative",
  });

  const manual = gateWithJudge(() => ({ outcome: "allow", operatorId: "alice" }));
  await manual.gate(GATE_REQ);
  assert.equal("judge" in manual.audit.records[0]!, false);
  assert.match(manual.audit.records[0]!.by, /operator:alice$/);
});

test("shellJudgeAuditOf：只映射 allow/deny；deny 档放行带 label；manual 不产审计", async () => {
  const { judge } = makeJudge({ report: { verdict: "allow", reason: "任务明确要求" } });
  const allow = await judge(request({ tier: "deny", policy: "su-approval" }));
  const audit = shellJudgeAuditOf(request({ tier: "deny", policy: "su-approval" }), allow);
  assert.ok(audit !== undefined);
  assert.equal(audit?.tier, "deny");
  assert.equal(audit?.hardDenyOverride, true);
  assert.equal(audit?.label, SHELL_JUDGE_DENY_TIER_LABEL);
  assert.equal(audit?.verdict, "allow");

  const { judge: manualJudge } = makeJudge({ report: { verdict: "manual", reason: "无法判断" } });
  const manual = await manualJudge(request());
  assert.equal(shellJudgeAuditOf(request(), manual), undefined);
});

// —————————————————————— 9. 规范化 / 合成 / 脱敏单元 ——————————————————————

test("normalizeShellJudgeVerdict：严格取值域、长度上限、alternative 坏件忽略", () => {
  assert.equal(normalizeShellJudgeVerdict({ verdict: "ALLOW", reason: "x" }), undefined);
  assert.equal(normalizeShellJudgeVerdict({ verdict: "allow", reason: "" }), undefined);
  const long = normalizeShellJudgeVerdict({ verdict: "deny", reason: "a".repeat(5000) });
  assert.ok(long !== undefined);
  assert.ok(Buffer.byteLength(long.reason ?? "", "utf8") <= 2 * 1024);
  const withBadAlternative = normalizeShellJudgeVerdict({
    verdict: "deny",
    reason: "不必要",
    alternative: { kind: "bogus", value: "x" },
    evidence: ["a", 3, "b"],
  });
  assert.ok(withBadAlternative !== undefined);
  assert.equal(withBadAlternative.alternative, undefined);
  assert.deepEqual(withBadAlternative.evidence, ["a", "b"]);
});

test("synthesizeCustomerMessage：含标准出路、已含则不重复", () => {
  const missing = synthesizeCustomerMessage({ verdict: "deny", reason: "与本轮任务无关" });
  assert.ok(missing.includes(SHELL_JUDGE_EXIT_LINE));
  assert.equal(missing.split(SHELL_JUDGE_EXIT_LINE).length - 1, 1);
  const existing = synthesizeCustomerMessage({
    verdict: "deny",
    customerMessage: "这条命令会删除工作区，请先确认备份。",
  });
  assert.ok(existing.includes("这条命令会删除工作区"));
  assert.ok(existing.includes(SHELL_JUDGE_EXIT_LINE));
  const jargon = synthesizeCustomerMessage({
    verdict: "deny",
    customerMessage: "su-审批档 拒绝了 operator:judge",
  });
  assert.doesNotMatch(jargon, /su-审批档|operator:/);
  assert.ok(jargon.includes(SHELL_JUDGE_EXIT_LINE));
});

test("redactJudgeText：脱敏环境凭据与 Bearer/api-key 形态并做有界截断", () => {
  const env = { ANTHROPIC_API_KEY: "sk-ant-very-secret-value-123456" };
  const redacted = redactJudgeText(
    "key=sk-ant-very-secret-value-123456 Authorization: Bearer abcdefghijklmnop token=abcdefgh1234",
    env,
  );
  assert.doesNotMatch(redacted, /sk-ant-very-secret-value-123456/);
  assert.doesNotMatch(redacted, /abcdefghijklmnop/);
  assert.doesNotMatch(redacted, /abcdefgh1234/);
  assert.match(redacted, /\[已脱敏\]/);
  assert.ok(Buffer.byteLength(redactJudgeText("a".repeat(5000)), "utf8") <= 2 * 1024);
});

test("buildShellJudgePrompt：只放本次数据，不复述历史；turnText 按 4KB 截断", () => {
  const text = buildShellJudgePrompt(request({ turnText: "x".repeat(6000) }));
  assert.match(text, /本次 shell 命令判断请求/);
  assert.match(text, /npm test/);
  assert.match(text, /已按 4KB 上限截断/);
  assert.doesNotMatch(text, /历史/);
});

test("客户出路句：双开关后统一指「替我审批」（不再写「替我审」）", () => {
  assert.equal(SHELL_JUDGE_EXIT_LINE, "如需执行，请关闭「替我审批」后重试。");
  const synthesized = synthesizeCustomerMessage({ verdict: "deny", reason: "当前不必要" });
  assert.ok(synthesized.includes(SHELL_JUDGE_EXIT_LINE));
  assert.ok(synthesized.includes("替我审批"));
});
