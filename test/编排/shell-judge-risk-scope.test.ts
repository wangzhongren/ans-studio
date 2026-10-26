// test/编排/shell-judge-risk-scope.test.ts
// shell 判断 agent 的**定位修正**（客户 2026-10-19 原话）：
// 「判断主要是对于系统其他的有没有风险，卡死风险，电脑其他的风险，项目内，不是随他吗，他不关心业务。」
//
// 钉住四件事：
//   1. rubric 是**系统风险审查**（系统/机器、卡死、越界、并发/数据完整性、端口/资源冲突），
//      并明确**不判断业务必要性**——项目内非破坏性命令由发起角色自己决定；
//   2. 本次判断**实际解析**的读取预算（maxCalls / maxBytes / maxFileBytes）注入请求提示，
//      数值来自运行时解析（显式注入 > env > 缺省），不是提示词硬编码；
//   3. fail-closed 语义不变：无风险 allow / 有风险 deny / 缺关键证据 manual；
//   4. 内部 `reasonCode:"necessary"` 保留兼容，但客户文案不再出现「业务不必要」语义。
//
// 全部离线：注入假适配器，不调用真实模型、不读凭据、不联网。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { ShellJudgeRequest } from "../../src/model/runtime.ts";
import {
  createShellJudge,
  SHELL_JUDGE_CONCURRENCY_ENV,
} from "../../src/common/编排/shell-judge.ts";
import {
  buildShellJudgePrompt,
  buildShellJudgeSystemPrompt,
  formatShellJudgeBudgetBytes,
} from "../../src/common/编排/shell-judge-prompt.ts";
import {
  SHELL_JUDGE_EXIT_LINE,
  synthesizeCustomerMessage,
} from "../../src/common/编排/shell-judge-verdict.ts";
import { SHELL_JUDGE_MAX_CALLS_ENV } from "../../src/common/runtime-core/shell-judge/policy.ts";

const PROJECT: ProjectConfig = {
  projectRoot: process.cwd(),
  skillRoot: process.cwd(),
  roles: {},
};

const BASE_REQUEST: ShellJudgeRequest = {
  command: "npm test",
  argv: ["npm", "test"],
  cwd: PROJECT.projectRoot,
  toolCallId: "risk-scope-1",
  roleId: "编排",
  projectRoot: PROJECT.projectRoot,
  runtime: "claude",
  policy: "project",
  tier: "risky",
  turnText: "请运行测试并修复失败用例。",
};

function request(overrides: Partial<ShellJudgeRequest> = {}): ShellJudgeRequest {
  return { ...BASE_REQUEST, ...overrides };
}

interface Seen {
  capabilities?: AdapterCapabilities;
  prompts: string[];
}

/** 假适配器：只记录提示词与能力注入，按脚本交回结论。 */
function fakeFactory(report: unknown): { factory: RuntimeAdapterFactory; seen: Seen } {
  const seen: Seen = { prompts: [] };
  const factory: RuntimeAdapterFactory = (_gate, capabilities) => {
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
            capabilities?.shellJudge?.report(report);
          },
          async *events() {
            yield { kind: "settled" as const, summary: "settled" };
          },
          async dispose() {},
          async abort() {},
        };
      },
    };
  };
  return { factory, seen };
}

function makeJudge(report: unknown, options: { budget?: { maxCalls?: number; maxBytes?: number; maxFileBytes?: number } } = {}): {
  judge: ReturnType<typeof createShellJudge>;
  seen: Seen;
} {
  const { factory, seen } = fakeFactory(report);
  const judge = createShellJudge({
    project: PROJECT,
    runtime: "claude",
    createAdapter: factory,
    timeoutMs: 500,
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
  });
  return { judge, seen };
}

// —————————————————————— 1. rubric：系统风险范围 ——————————————————————

test("rubric 覆盖五类系统风险：系统/机器、卡死、越界、并发/数据完整性、端口/资源冲突", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /系统风险审查/);
  assert.match(system, /【风险 rubric——确认无以下风险才可 allow】/);
  assert.match(system, /系统\/机器风险/);
  assert.match(system, /破坏性删除或覆盖/);
  assert.match(system, /sudo\/提权/);
  assert.match(system, /安装或卸载软件包/);
  assert.match(system, /杀他人进程/);
  assert.match(system, /资源耗尽/);
  assert.match(system, /卡死风险/);
  assert.match(system, /长期驻留服务/);
  assert.match(system, /阻塞\/交互式命令/);
  assert.match(system, /tail -f/);
  assert.match(system, /无超时的 sleep\/脚本/);
  assert.match(system, /无限循环/);
  assert.match(system, /等待 stdin/);
  assert.match(system, /越界/);
  assert.match(system, /写到项目外/);
  assert.match(system, /路径穿越/);
  assert.match(system, /读取密钥\/凭据/);
  assert.match(system, /外发敏感数据/);
  assert.match(system, /并发\/数据完整性/);
  assert.match(system, /并行写同一文件/);
  assert.match(system, /端口\/资源冲突/);
  assert.match(system, /抢占或冲突关键端口/);
});

test("fail-closed：缺关键证据 ⇒ manual；确认无风险 ⇒ allow（语义仍在 rubric 与输出契约）", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /无法判断是否存在上述风险（缺关键证据）→ manual/);
  assert.match(system, /确认无风险 → allow/);
  assert.match(system, /manual：仅限判断无法发生/);
  assert.match(system, /不得用 manual 逃避「有风险」或「不确定」判断/);
});

// —————————————————————— 2. 不判断业务必要性 ——————————————————————

test("明确排除业务必要性：不因看不懂业务/看不出必要而拦截项目内普通命令", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /【不判断（明确排除）】/);
  assert.match(system, /业务必要性不归你判断/);
  assert.match(system, /业务正确性、命令是否「必要」、测试是否合理、是否理解业务/);
  assert.match(system, /都不是你的判断对象，也不得作为 deny\/manual 的理由/);
  assert.match(system, /项目内（项目根之内）非破坏性的读写、跑测试、本地服务 curl、带超时的脚本，由发起角色自己决定/);
  assert.match(system, /不得因为「看不懂业务」或「看不出必要」而拦截/);
  assert.match(system, /命令看起来「多余」但无系统风险 → allow/);
  // 旧「必要性 rubric」定位已退役（内部 reasonCode 保留，但提示词不再以必要性为纲）。
  assert.doesNotMatch(system, /【必要性 rubric/);
  assert.doesNotMatch(system, /业务不必要/);
});

test("客户文案不再出现「业务不必要」：默认合成说明改为系统风险口径", () => {
  const synthesized = synthesizeCustomerMessage({ verdict: "deny" });
  assert.match(synthesized, /系统风险或无法确认安全/);
  // B1 术语批次：客户可见文案统一为「自动代理」，不得再出现旧称「判断 agent」。
  assert.match(synthesized, /^自动代理认为该命令存在系统风险或无法确认安全/);
  assert.doesNotMatch(synthesized, /判断 agent/);
  assert.doesNotMatch(synthesized, /不必要/);
  assert.ok(synthesized.includes(SHELL_JUDGE_EXIT_LINE));

  // 模型自带 reason 时原样转述（reason 本身仍由判断 agent 按风险口径给出）。
  const withReason = synthesizeCustomerMessage({ verdict: "deny", reason: "会长期驻留并阻塞终端" });
  assert.match(withReason, /^自动代理认为该命令存在系统风险或无法确认安全：会长期驻留并阻塞终端/);
  assert.doesNotMatch(withReason, /判断 agent/);
  assert.match(withReason, /会长期驻留并阻塞终端/);
  assert.doesNotMatch(withReason, /不必要/);
});

// —————————————————————— 3. 预算：来自运行时解析值 ——————————————————————

test("请求提示注入实际预算：maxCalls / maxBytes / maxFileBytes，数值与注入一致", () => {
  const text = buildShellJudgePrompt(request(), { maxCalls: 7, maxBytes: 256 * 1024, maxFileBytes: 2048 });
  assert.match(text, /【本次读取预算（运行时解析值，本次判断生效）】/);
  assert.match(text, /读取\/列举调用上限：7 次（judge_read_file 与 judge_list_dir 合计）/);
  assert.match(text, /总读取上限：256KiB/);
  assert.match(text, /单文件读取上限：2KiB/);
  assert.match(text, /缺哪项具体证据/);
  assert.match(text, /不要只写「预算用尽」/);
  // 不得回落到硬编码缺省 12 次 / 512KiB / 128KiB。
  assert.doesNotMatch(text, /调用上限：12 次/);
  assert.doesNotMatch(text, /总读取上限：512KiB/);
  assert.doesNotMatch(text, /单文件读取上限：128KiB/);
});

test("预算字节格式：整 KiB 用 KiB，非整 KiB 如实显示字节（不臆造精度）", () => {
  assert.equal(formatShellJudgeBudgetBytes(1024), "1KiB");
  assert.equal(formatShellJudgeBudgetBytes(512 * 1024), "512KiB");
  assert.equal(formatShellJudgeBudgetBytes(1536), "1536 字节");
  assert.equal(formatShellJudgeBudgetBytes(512), "512 字节");
});

test("驱动：注入预算同时进入请求提示与只读工具（同一份解析值）", async () => {
  const { judge, seen } = makeJudge(
    { verdict: "allow", reason: "项目内只读，无系统风险" },
    { budget: { maxCalls: 5, maxBytes: 200 * 1024, maxFileBytes: 1024 } },
  );
  const out = await judge(request());
  assert.equal(out.verdict, "allow");
  assert.equal(out.reasonCode, "necessary");

  const prompt = seen.prompts[0] ?? "";
  assert.match(prompt, /读取\/列举调用上限：5 次/);
  assert.match(prompt, /总读取上限：200KiB/);
  assert.match(prompt, /单文件读取上限：1KiB/);

  const toolBudget = seen.capabilities?.shellJudge?.budget;
  assert.equal(toolBudget?.maxCalls, 5);
  assert.equal(toolBudget?.maxBytes, 200 * 1024);
  assert.equal(toolBudget?.maxFileBytes, 1024);
  // 未显式注入的扫描上限由运行时核心缺省补齐（同一解析函数）。
  assert.equal(toolBudget?.maxScanBytes, 8 * 1024 * 1024);
});

test("驱动：未显式注入时预算来自运行时 env 解析，提示与实际生效值一致", async () => {
  const previous = process.env[SHELL_JUDGE_MAX_CALLS_ENV];
  process.env[SHELL_JUDGE_MAX_CALLS_ENV] = "5";
  try {
    const { judge, seen } = makeJudge({ verdict: "allow", reason: "项目内只读，无系统风险" });
    const out = await judge(request());
    assert.equal(out.verdict, "allow");
    const prompt = seen.prompts[0] ?? "";
    assert.match(prompt, /读取\/列举调用上限：5 次/);
    // 其余两项回落运行时缺省（128KiB 单文件 / 512KiB 总量），由同一解析函数给出。
    assert.match(prompt, /总读取上限：512KiB/);
    assert.match(prompt, /单文件读取上限：128KiB/);
    assert.equal(seen.capabilities?.shellJudge?.budget?.maxCalls, 5);
  } finally {
    if (previous === undefined) delete process.env[SHELL_JUDGE_MAX_CALLS_ENV];
    else process.env[SHELL_JUDGE_MAX_CALLS_ENV] = previous;
  }
});

// —————————————————————— 4. 三态：无风险 allow / 有风险 deny / 缺证据 manual ——————————————————————

test("无系统风险 ⇒ allow（reasonCode 仍为 necessary，兼容既有消费方）", async () => {
  const { judge } = makeJudge({ verdict: "allow", reason: "项目内跑测试，无破坏性/卡死/越界/并发/端口风险" });
  const out = await judge(request());
  assert.equal(out.verdict, "allow");
  assert.equal(out.reasonCode, "necessary");
});

test("有系统风险 ⇒ deny；客户说明含风险与标准出路，不含「业务不必要」", async () => {
  const { judge } = makeJudge({ verdict: "deny", reason: "会长期驻留并阻塞终端（卡死风险）" });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "no-alternative");
  assert.match(out.reason ?? "", /卡死风险/);
  assert.match(out.customerMessage ?? "", /卡死风险/);
  assert.ok((out.customerMessage ?? "").includes(SHELL_JUDGE_EXIT_LINE));
  assert.doesNotMatch(out.customerMessage ?? "", /不必要/);
});

test("缺关键证据 ⇒ manual（模型自报）；不当作 deny 也不放行", async () => {
  const { judge } = makeJudge({ verdict: "manual", reason: "缺该脚本是否带超时的证据" });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "model-manual");
  assert.match(out.reason ?? "", /缺该脚本是否带超时的证据/);
});

test("deny 无 reason ⇒ 兜底文案为「未能确认无系统风险」，不再写「不必要」", async () => {
  const { judge } = makeJudge({ verdict: "deny" });
  const out = await judge(request());
  assert.equal(out.verdict, "deny");
  assert.match(out.reason ?? "", /未能确认该命令无系统风险/);
  assert.doesNotMatch(out.reason ?? "", /不必要/);
  assert.match(out.customerMessage ?? "", /系统风险或无法确认安全/);
});

// —————————————————————— 5. 既有结构不变 ——————————————————————

test("既有工具面与输出契约仍在；系统提示稳定", () => {
  const first = buildShellJudgeSystemPrompt();
  assert.equal(first, buildShellJudgeSystemPrompt());
  assert.match(first, /judge_list_dir/);
  assert.match(first, /judge_read_file/);
  assert.match(first, /report_shell_judgement/);
  assert.match(first, /不可信数据/);
  assert.match(first, /deny 档/);
  // 并发配置常量仍可从驱动导出（本批未改并发语义）。
  assert.equal(typeof SHELL_JUDGE_CONCURRENCY_ENV, "string");
});
