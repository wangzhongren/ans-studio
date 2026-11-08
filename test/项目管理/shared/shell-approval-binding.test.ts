// test/项目管理/shared/shell-approval-binding.test.ts
// shared-code：对共享件 `src/common/shared/shell-approval-binding.ts` 的行为验证（W1，2026-11-08；
// 会话创建准入按操作审批方案 P1.3 §2.3，派发 I0-1/I0-2/I0-3/I0-9）。
//
// 覆盖：
//  · 登记/未登记/身份隔离（不同 gate 不串）/重复登记拒绝；
//  · 白名单投影与深度冻结（不可变、登记后再改原对象不影响已登记事实、白名单外字段拒绝、probe 不可回填）；
//  · `probeShellApproval` 无值入参、只由本模块内部执行 `sink.probe()`、并发共享同一 promise、结果冻结 memoize；
//  · sink 三态（memory 派生事实透传、custom 缺 probe、无 sink、probe 抛错/同步抛错/非法返回值 ⇒ unavailable）；
//  · 测试私有 Symbol：挂在 sink 对象的**非枚举**属性、可枚举设置不被认可、不可经生产公共出口获得、
//    生产装配不设置（静态断言）；
//  · 模块自包含（零 import：不依赖编排/门禁引擎/引擎层）。

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE,
  hasShellApprovalTestNonDurableAllowance,
  inspectShellApproval,
  probeShellApproval,
  registerShellApproval,
  type FrozenShellApprovalFacts,
  type ShellApprovalAuditProbeState,
  type ShellApprovalFacts,
  type ShellApprovalProbeSink,
} from "../../../src/common/shared/shell-approval-binding.ts";
import * as bindingModule from "../../../src/common/shared/shell-approval-binding.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function baseFacts(overrides: Partial<ShellApprovalFacts> = {}): ShellApprovalFacts {
  return {
    source: "orchestration-shell-gate",
    version: 1,
    projectRoot: "/tmp/project-a",
    mode: "three-layer",
    classifier: true,
    rules: true,
    pmAsk: true,
    operatorChannel: true,
    takeGrant: true,
    takeDirective: true,
    routinePolicy: false,
    audit: { sink: "file", durable: true, probe: "unknown", relPath: "docs/audit/shell-gate.jsonl" },
    escalation: true,
    ...overrides,
  };
}

function newGate(): (req?: unknown) => Promise<{ allow: boolean }> {
  return async () => ({ allow: true });
}

// —— 登记 / 未登记 / 身份隔离 ——

test("未登记 gate：inspect 与 probe 均返回 undefined（fail-closed 上游判据）", async () => {
  const gate = newGate();
  assert.equal(inspectShellApproval(gate), undefined);
  assert.equal(await probeShellApproval(gate), undefined);
  // 非函数入参不抛错（WeakMap 语义 + 防御）
  assert.equal(inspectShellApproval(undefined as unknown as Function), undefined);
  assert.equal(await probeShellApproval({} as unknown as Function), undefined);
});

test("登记后 inspect 同步返回白名单事实，probe 恒为 unknown", () => {
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), { probe: async () => "ok" });
  const facts = inspectShellApproval(gate);
  assert.ok(facts);
  assert.deepEqual(facts, {
    source: "orchestration-shell-gate",
    version: 1,
    projectRoot: "/tmp/project-a",
    mode: "three-layer",
    classifier: true,
    rules: true,
    pmAsk: true,
    operatorChannel: true,
    takeGrant: true,
    takeDirective: true,
    routinePolicy: false,
    audit: { sink: "file", durable: true, probe: "unknown", relPath: "docs/audit/shell-gate.jsonl" },
    escalation: true,
  });
  // relPath 省略时不出现该键
  const gate2 = newGate();
  registerShellApproval(gate2, baseFacts({ audit: { sink: "memory", durable: false, probe: "unknown" } }), undefined);
  assert.deepEqual(Object.keys(inspectShellApproval(gate2)!.audit), ["sink", "durable", "probe"]);
});

test("身份隔离：不同 gate 的事实互不串用；同形不同函数即不同身份", () => {
  const gateA = newGate();
  const gateB = newGate();
  registerShellApproval(gateA, baseFacts({ projectRoot: "/p/a", mode: "operator-approve" }), undefined);
  registerShellApproval(gateB, baseFacts({ projectRoot: "/p/b", mode: "rules-advisory" }), undefined);
  assert.equal(inspectShellApproval(gateA)!.projectRoot, "/p/a");
  assert.equal(inspectShellApproval(gateA)!.mode, "operator-approve");
  assert.equal(inspectShellApproval(gateB)!.projectRoot, "/p/b");
  assert.equal(inspectShellApproval(gateB)!.mode, "rules-advisory");
  assert.equal(inspectShellApproval(newGate()), undefined);
});

test("同一 gate 重复登记被拒绝（登记点唯一在 createShellGate 构造成功后）", () => {
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), undefined);
  assert.throws(() => registerShellApproval(gate, baseFacts(), undefined), /已登记/);
});

test("gate 非函数 ⇒ TypeError；失败的登记不写入", () => {
  assert.throws(() => registerShellApproval({} as unknown as Function, baseFacts(), undefined), TypeError);
  const gate = newGate();
  assert.throws(() => registerShellApproval(gate, baseFacts({ version: 2 as unknown as 1 }), undefined), /version/);
  // 失败登记未占用该 gate
  registerShellApproval(gate, baseFacts(), undefined);
  assert.ok(inspectShellApproval(gate));
});

// —— 白名单投影与冻结 ——

test("事实深度冻结：外层与 audit 都不可变，赋值/删除在严格模式抛 TypeError", () => {
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), undefined);
  const facts = inspectShellApproval(gate)!;
  assert.equal(Object.isFrozen(facts), true);
  assert.equal(Object.isFrozen(facts.audit), true);
  assert.throws(() => {
    (facts as { mode: string }).mode = "readonly";
  }, TypeError);
  assert.throws(() => {
    (facts.audit as { probe: string }).probe = "ok";
  }, TypeError);
  assert.throws(() => {
    delete (facts as unknown as Record<string, unknown>).escalation;
  }, TypeError);
});

test("登记保存白名单副本：登记后再改调用方原 facts/audit 不影响已登记事实", () => {
  const gate = newGate();
  const input = baseFacts();
  registerShellApproval(gate, input, undefined);
  input.mode = "readonly";
  input.audit.durable = false;
  input.audit.probe = "ok";
  const facts = inspectShellApproval(gate)!;
  assert.equal(facts.mode, "three-layer");
  assert.equal(facts.audit.durable, true);
  assert.equal(facts.audit.probe, "unknown");
});

test("白名单投影：白名单外字段（如凭据/环境）被拒绝，不静默携带", () => {
  const tainted = {
    ...baseFacts(),
    env: { ANTHROPIC_API_KEY: "secret" },
  } as unknown as ShellApprovalFacts;
  assert.throws(() => registerShellApproval(newGate(), tainted, undefined), /白名单外字段/);
  const taintedAudit = baseFacts({
    audit: { sink: "file", durable: true, probe: "unknown", token: "x" } as unknown as ShellApprovalFacts["audit"],
  });
  assert.throws(() => registerShellApproval(newGate(), taintedAudit, undefined), /白名单外字段/);
});

test("登记拒绝调用方回填 probe 结果：audit.probe 必须为 unknown（ok/unavailable 均拒绝）", () => {
  for (const probe of ["ok", "unavailable"] as const) {
    const gate = newGate();
    assert.throws(
      () => registerShellApproval(gate, baseFacts({ audit: { sink: "file", durable: true, probe } }), undefined),
      /probe/,
    );
    // 失败登记不写入
    assert.equal(inspectShellApproval(gate), undefined);
  }
});

test("非法事实形状 fail-closed：source/version/mode/boolean/projectRoot/audit.sink 均拒绝", () => {
  const bad = [
    { ...baseFacts(), source: "other" },
    { ...baseFacts(), version: 2 },
    { ...baseFacts(), mode: "unknown-mode" },
    { ...baseFacts(), classifier: "yes" },
    { ...baseFacts(), projectRoot: "" },
    { ...baseFacts(), audit: { sink: "db", durable: true, probe: "unknown" } },
    { ...baseFacts(), audit: { sink: "file", durable: "yes", probe: "unknown" } },
    { ...baseFacts(), audit: { sink: "file", durable: true, probe: "unknown", relPath: "" } },
  ] as unknown as ShellApprovalFacts[];
  for (const facts of bad) {
    assert.throws(() => registerShellApproval(newGate(), facts, undefined), JSON.stringify(facts));
  }
});

// —— probe：无值入参 / 内部执行 / 并发 / memoize ——

test("probeShellApproval 无值入参：签名只接收 gate；调用方附带的 probe 值被忽略", async () => {
  assert.equal(probeShellApproval.length, 1);
  const calls: unknown[][] = [];
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), {
    probe: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve("unavailable");
    },
  });
  const withExtraArgs = probeShellApproval as unknown as (gate: Function, ...rest: unknown[]) => Promise<
    FrozenShellApprovalFacts | undefined
  >;
  const facts = await withExtraArgs(gate, "ok", { probe: "ok" });
  assert.equal(facts!.audit.probe, "unavailable");
  assert.deepEqual(calls, [[]], "sink.probe 不接收任何参数");
});

test("并发共享同一 promise：sink.probe 只执行一次，结果冻结 memoize（后续调用同 promise）", async () => {
  let release!: (value: ShellApprovalAuditProbeState) => void;
  let probeCalls = 0;
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), {
    probe: () => {
      probeCalls += 1;
      return new Promise<ShellApprovalAuditProbeState>((res) => {
        release = res;
      });
    },
  });
  const p1 = probeShellApproval(gate);
  const p2 = probeShellApproval(gate);
  assert.equal(p1, p2, "并发调用共享同一 promise");
  assert.equal(probeCalls, 1);
  release("ok");
  const [f1, f2] = await Promise.all([p1, p2]);
  assert.equal(f1, f2, "共享同一冻结结果对象");
  assert.equal(f1!.audit.probe, "ok");
  assert.equal(Object.isFrozen(f1), true);
  assert.equal(Object.isFrozen(f1!.audit), true);
  assert.equal(probeShellApproval(gate), p1, "完成后仍 memoize（同 promise）");
  assert.equal(probeCalls, 1);
});

test("probe 结果另成冻结事实：inspect 仍返回基础事实（probe:unknown）", async () => {
  const gate = newGate();
  registerShellApproval(gate, baseFacts(), { probe: async () => "ok" });
  const probed = await probeShellApproval(gate);
  const base = inspectShellApproval(gate)!;
  assert.notEqual(probed, base);
  assert.equal(base.audit.probe, "unknown");
  assert.equal(probed!.audit.probe, "ok");
  const { audit: probedAudit, ...probedRest } = probed!;
  const { audit: baseAudit, ...baseRest } = base;
  assert.deepEqual(probedRest, baseRest);
  assert.deepEqual({ ...probedAudit, probe: "unknown" }, baseAudit);
});

// —— sink 三态 ——

test("sink 三态：memory 事实透明传、custom 缺 probe / 无 sink / 抛错 / 非法返回值 ⇒ unavailable", async () => {
  const cases: Array<{ name: string; sink: ShellApprovalProbeSink | undefined; expected: ShellApprovalAuditProbeState }> = [
    {
      name: "memory probe ok",
      sink: { describe: () => ({ kind: "memory", durable: false }), probe: async () => "ok" },
      expected: "ok",
    },
    { name: "custom 缺 probe", sink: { describe: () => ({ kind: "custom", durable: false }) }, expected: "unavailable" },
    { name: "无 sink", sink: undefined, expected: "unavailable" },
    {
      name: "probe 异步抛错",
      sink: {
        probe: async () => {
          throw new Error("audit down");
        },
      },
      expected: "unavailable",
    },
    {
      name: "probe 同步抛错",
      sink: {
        probe: (() => {
          throw new Error("boom");
        }) as unknown as ShellApprovalProbeSink["probe"],
      },
      expected: "unavailable",
    },
    {
      name: "probe 非法返回值",
      sink: { probe: (async () => "weird") as unknown as ShellApprovalProbeSink["probe"] },
      expected: "unavailable",
    },
    { name: "probe 返回 unavailable", sink: { probe: async () => "unavailable" }, expected: "unavailable" },
    { name: "probe 返回 unknown", sink: { probe: async () => "unknown" }, expected: "unknown" },
  ];
  for (const c of cases) {
    const gate = newGate();
    registerShellApproval(gate, baseFacts(), c.sink);
    const facts = await probeShellApproval(gate);
    assert.equal(facts!.audit.probe, c.expected, c.name);
  }
});

test("非持久 sink 的事实由登记方投影（memory/durable:false）并如实透传探针结果；准入策略不在本模块", async () => {
  const gate = newGate();
  registerShellApproval(
    gate,
    baseFacts({ audit: { sink: "memory", durable: false, probe: "unknown" } }),
    { describe: () => ({ kind: "memory", durable: false }), probe: async () => "ok" },
  );
  const facts = await probeShellApproval(gate);
  assert.deepEqual(facts!.audit, { sink: "memory", durable: false, probe: "ok" });
});

// —— 测试私有 Symbol ——

test("测试私有 Symbol：载体是 sink 对象的非枚举属性；可枚举设置不被认可", () => {
  const sink: { append?: unknown } = {};
  Object.defineProperty(sink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  assert.deepEqual(Object.keys(sink), []);
  assert.equal(JSON.stringify(sink), "{}");
  assert.deepEqual({ ...sink }, {}, "展开只复制可枚举属性");
  const descriptor = Object.getOwnPropertyDescriptor(sink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE);
  assert.ok(descriptor);
  assert.equal(descriptor!.enumerable, false);
  assert.equal(hasShellApprovalTestNonDurableAllowance(sink), true);

  const enumerable = { [SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE]: true };
  assert.equal(hasShellApprovalTestNonDurableAllowance(enumerable), false, "可枚举设置不构成测试通道");
  assert.equal(hasShellApprovalTestNonDurableAllowance({}), false);
  assert.equal(hasShellApprovalTestNonDurableAllowance(undefined), false);
  assert.equal(hasShellApprovalTestNonDurableAllowance("sink"), false);
});

test("静态断言：测试私有 Symbol 不得经生产公共出口导出，生产装配不得设置", () => {
  const symbolName = "SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE";
  const srcFiles = (readdirSync(join(REPO_ROOT, "src"), { recursive: true }) as string[])
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => p.endsWith(".ts"));
  const hits = srcFiles.filter((rel) => readFileSync(join(REPO_ROOT, "src", rel), "utf8").includes(symbolName));
  // 允许出现的位置：宿主模块（定义）+ createShellGate 所在编排文件（内部只读检查）；其余一律不得出现。
  const allowed = new Set(["common/shared/shell-approval-binding.ts", "common/编排/shell-gate.ts"]);
  for (const hit of hits) {
    assert.ok(allowed.has(hit), `测试私有 Symbol 出现在不允许的生产文件：src/${hit}`);
  }
  // createShellGate 只可读取检查，不得设置（允许的唯一非宿主文件）
  for (const hit of hits) {
    if (hit === "common/shared/shell-approval-binding.ts") continue;
    const source = readFileSync(join(REPO_ROOT, "src", hit), "utf8");
    assert.equal(
      /Object\.defineProperty\(\s*[^,]+,\s*SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE/.test(source),
      false,
      `src/${hit} 不得设置测试私有 Symbol`,
    );
    assert.equal(
      new RegExp(`\\[\\s*${symbolName}\\s*\\]\\s*:`).test(source),
      false,
      `src/${hit} 不得以对象字面量设置测试私有 Symbol`,
    );
  }
  // Service 公共出口（shell-rules）不导出、不引用
  const shellRules = readFileSync(join(REPO_ROOT, "src/service/gate/shell-rules.ts"), "utf8");
  assert.equal(shellRules.includes(symbolName), false);
  assert.equal(shellRules.includes("shell-approval-binding"), false);
});

// —— 模块 API 面 / 依赖方向 ——

test("模块公开 API 面固定：不存在接受 probe 结果值的入口（无 finalize 类 API）", () => {
  assert.deepEqual(
    Object.keys(bindingModule).sort(),
    [
      "SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE",
      "hasShellApprovalTestNonDurableAllowance",
      "inspectShellApproval",
      "probeShellApproval",
      "registerShellApproval",
    ].sort(),
  );
});

test("依赖方向：共享模块自包含（零 import，含动态 import 与 from 导入）", () => {
  const source = readFileSync(join(REPO_ROOT, "src/common/shared/shell-approval-binding.ts"), "utf8");
  assert.equal(/^\s*import[\s{*]/m.test(source), false);
  assert.equal(/\bimport\s*\(/.test(source), false);
  assert.equal(/\bfrom\s+["'][^"']+["']/.test(source), false);
});
