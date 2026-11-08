// test/编排/shell-approval-wiring.test.ts
// 编排角色自测（2026-11-08 W1b/W2b/W3b）：shell 闸的审批链登记 / 审计探针 / 审计失败策略 /
// 只读 Git 审计字段 / writeGuard 入口透传。
//
// 对应设计 P1.3 §2.3/§2.4.3/§2.5.5、派发接口评审 I0-1/I0-2/I0-6/I0-7 与 B1 AC-6/AC-12/AC-14/AC-30。
// 全部为假件（不真跑命令）；matcher/规范体经 Service 公共出口同一函数引用消费。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import {
  createShellGate,
  buildShellGate,
  BRANCH_C_ALLOW,
} from "../../src/common/编排/shell-gate.ts";
import {
  createFileAuditSink,
  createMemoryAuditSink,
  SHELL_AUDIT_REL_PATH,
  type ShellAuditSink,
} from "../../src/common/编排/shell-audit.ts";
import {
  inspectShellApproval,
  probeShellApproval,
  registerShellApproval,
  SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE,
} from "../../src/common/shared/shell-approval-binding.ts";
import {
  classifyShell,
  defaultShellRules,
  matchReadonlyGit,
  buildReadonlyGitBody,
} from "../../src/service/gate/shell-rules.ts";
import { classifyShellDetailed } from "../../src/common/门禁引擎/classify-shell.ts";
import type { ShellRules, WriteDecision } from "../../src/model/decision.ts";
import type { BoundaryEntry } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
import { assembleOperatorShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";

const RULES: ShellRules = { version: "4", readOnly: [], hardDenyPrograms: [], riskyPrograms: [], denyTokens: [] };
const AUDIT_ENTRY: BoundaryEntry = { root: "project", path: "docs/audit/shell-gate.jsonl", kind: "file", purpose: "测试审计条目" };
const allowGate: WriteGate = () => ({ allowed: true, matchedEntry: AUDIT_ENTRY });
const denyGate: WriteGate = (): WriteDecision => ({ allowed: false, reason: "测试拒绝", allowedByRoot: { skill: [], project: [] } });
const req = (command: string, argv: string[], extra: Record<string, unknown> = {}) => ({
  command,
  argv,
  cwd: "/proj",
  toolCallId: "call-1",
  ...extra,
});

/** 临时项目（角色 X + 边界文件 + 内置 su）——与 shell-arming.test 同形（装配路径所需）。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-approval-wiring-"));
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

// —————————————————————— ① 登记（I0-1/I0-2/I0-3）：唯一登记点 + 四档 mode + audit describe 投影 ——————————————————————

test("createShellGate：构造成功后唯一登记（inspect 可见、未登记 undefined、重复登记 fail-closed）", async () => {
  // 未登记 gate ⇒ inspect/probe 均 undefined（fail-closed 语义的上游）。
  const plain = async () => ({ allow: true, by: "plain" });
  assert.equal(inspectShellApproval(plain), undefined);
  assert.equal(await probeShellApproval(plain), undefined);

  const memory = createMemoryAuditSink();
  const threeLayer = createShellGate({
    projectRoot: "/proj",
    classifyShell: () => "review",
    rules: RULES,
    audit: memory,
    pmAsk: () => null,
    operatorChannel: () => ({ outcome: "deny" }),
    takeGrant: () => undefined,
    takeDirective: () => undefined,
  });
  const facts = inspectShellApproval(threeLayer);
  assert.ok(facts, "createShellGate 构造成功后必须已登记");
  assert.equal(facts.source, "orchestration-shell-gate");
  assert.equal(facts.version, 1);
  assert.equal(facts.projectRoot, "/proj", "projectRoot 是准入绑定字段");
  assert.equal(facts.mode, "three-layer");
  assert.equal(facts.classifier, true);
  assert.equal(facts.rules, true);
  assert.equal(facts.pmAsk, true);
  assert.equal(facts.operatorChannel, true);
  assert.equal(facts.takeGrant, true);
  assert.equal(facts.takeDirective, true);
  assert.equal(facts.routinePolicy, false);
  assert.equal(facts.escalation, false);
  assert.deepEqual(facts.audit, { sink: "memory", durable: false, probe: "unknown" });
  // probe 由 binding 内部执行（memory sink 的 probe = ok）；inspect 仍返回基础事实 "unknown"。
  const probed = await probeShellApproval(threeLayer);
  assert.equal(probed?.audit.probe, "ok");
  assert.equal(inspectShellApproval(threeLayer)?.audit.probe, "unknown", "inspect 只返回登记时基础事实");

  // 重复登记 fail-closed（登记点唯一在 createShellGate 构造成功后）。
  assert.throws(() => registerShellApproval(threeLayer, facts!, memory), /已登记/);

  // 四档 mode 投影。
  const operator = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    audit: createMemoryAuditSink(),
    operatorOnly: true,
    operatorChannel: () => ({ outcome: "deny" }),
  });
  assert.equal(inspectShellApproval(operator)?.mode, "operator-approve");
  const advisory = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    audit: createMemoryAuditSink(),
    advisoryRuleset: true,
    operatorChannel: () => ({ outcome: "deny" }),
  });
  assert.equal(inspectShellApproval(advisory)?.mode, "rules-advisory");
  const readonly = createShellGate({ classifyShell: () => "allow", rules: RULES, audit: createMemoryAuditSink(), readonlyOnly: true });
  assert.equal(inspectShellApproval(readonly)?.mode, "readonly");

  // custom sink 无 describe ⇒ custom/非持久；probe 缺失 ⇒ binding 内部按 unavailable 处理。
  const custom: ShellAuditSink = { async append() { return { ok: true }; } };
  const customGate = createShellGate({ classifyShell: () => "allow", rules: RULES, audit: custom });
  assert.deepEqual(inspectShellApproval(customGate)?.audit, { sink: "custom", durable: false, probe: "unknown" });
  assert.equal((await probeShellApproval(customGate))?.audit.probe, "unavailable");
});

test("file sink describe/probe：describe=file+durable；probe 纯判定不写盘；被拒 + refresh 一次重试；两次拒/刷新失败 ⇒ unavailable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-audit-probe-"));
  try {
    const sink = createFileAuditSink({ projectRoot: root, gate: denyGate });
    assert.deepEqual(sink.describe?.(), { kind: "file", durable: true, relPath: SHELL_AUDIT_REL_PATH });
    assert.equal(await sink.probe?.(), "unavailable", "被拒且无 refreshGate ⇒ unavailable");
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "探针不写盘、不建目录");

    let refreshes = 0;
    const retry = createFileAuditSink({
      projectRoot: root,
      gate: denyGate,
      refreshGate: async () => {
        refreshes += 1;
        return allowGate;
      },
    });
    assert.equal(await retry.probe?.(), "ok", "刷新后以新 gate 重试一次 ⇒ ok");
    assert.equal(refreshes, 1);
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "重试仍为纯判定，不建目录");

    const broken = createFileAuditSink({
      projectRoot: root,
      gate: denyGate,
      refreshGate: async () => {
        throw new Error("refresh-boom");
      },
    });
    assert.equal(await broken.probe?.(), "unavailable", "refresh 抛错 ⇒ unavailable");

    const missing = createFileAuditSink({ projectRoot: root, gate: denyGate, refreshGate: async () => undefined });
    assert.equal(await missing.probe?.(), "unavailable", "refresh 未取得门禁 ⇒ unavailable");

    const stillDenied = createFileAuditSink({ projectRoot: root, gate: denyGate, refreshGate: async () => denyGate });
    assert.equal(await stillDenied.probe?.(), "unavailable", "重试仍拒 ⇒ unavailable");

    const throwing = createFileAuditSink({
      projectRoot: root,
      gate: () => {
        throw new Error("gate-boom");
      },
    });
    assert.equal(await throwing.probe?.(), "unavailable", "门禁抛错 ⇒ unavailable");

    // 探针放行后 activeGate 已切换（追加落盘走新 gate）——与 append 的 F-6-1 语义一致。
    const res = await retry.append({
      timestamp: new Date().toISOString(),
      toolCallId: "t",
      command: "ls",
      argv: ["ls"],
      cwd: root,
      conclusion: "allow",
      branch: "c-allow",
      by: "ruleset:test",
      conditions: ["shell-gate"],
      execution: "未执行",
      entry: "run_shell",
    });
    assert.equal(res.ok, true, "probe 放行后 activeGate 切换，append 可直接落盘");

    // memory sink 三态：describe memory/非持久；probe ok。
    const memory = createMemoryAuditSink();
    assert.deepEqual(memory.describe?.(), { kind: "memory", durable: false });
    assert.equal(await memory.probe?.(), "ok");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("测试私有 Symbol：仅非枚举挂 sink 时登记事实投影为 file+durable（测试模拟）；可枚举无效；buildShellGate/生产装配从不设置", async () => {
  const sink = createMemoryAuditSink();
  Object.defineProperty(sink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE, { value: true, enumerable: false });
  const gate = createShellGate({ classifyShell: () => "allow", rules: RULES, audit: sink });
  assert.deepEqual(inspectShellApproval(gate)?.audit, {
    sink: "file",
    durable: true,
    probe: "unknown",
    relPath: SHELL_AUDIT_REL_PATH,
  });
  // 探针仍由 memory sink 自己执行（Symbol 只改登记投影，不伪造 probe 值）。
  assert.equal((await probeShellApproval(gate))?.audit.probe, "ok");

  // 可枚举定义不构成测试通道。
  const enumerableSink = createMemoryAuditSink();
  Object.defineProperty(enumerableSink, SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE, { value: true, enumerable: true });
  const enumerableGate = createShellGate({ classifyShell: () => "allow", rules: RULES, audit: enumerableSink });
  assert.equal(inspectShellApproval(enumerableGate)?.audit.sink, "memory", "可枚举 Symbol 不被认可");

  // buildShellGate 路径（生产装配入口）即使拿到 memory sink 也按 describe 实际投影，从不设置 Symbol。
  const built = buildShellGate({
    classifyShell: () => "allow",
    rules: RULES,
    projectRoot: "/proj",
    skillRoot: "/skill",
    pmBoundary: { entries: [], boundarySource: "test", acceptance: { accepted: true, source: "test" } },
    auditSink: createMemoryAuditSink(),
  });
  assert.equal(inspectShellApproval(built)?.audit.sink, "memory", "buildShellGate 不设置测试 Symbol");

  // 生产装配源码断言：shell-arming / run-role 不得引用测试 Symbol 或检查器。
  for (const rel of ["../../src/pipeline/orchestration/shell-arming.ts", "../../src/pipeline/orchestration/run-role.ts"]) {
    const source = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.doesNotMatch(source, /SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE/);
    assert.doesNotMatch(source, /hasShellApprovalTestNonDurableAllowance/);
  }
});

// —————————————————————— ② auditFailurePolicy（I0-6 / AC-12/AC-17） ——————————————————————

test("auditFailurePolicy：observe 保持放行；deny-non-readonly 审批类 allow + 审计失败 ⇒ fail-closed；c-allow 只读不翻转", async () => {
  const failing: ShellAuditSink = {
    async append() {
      return { ok: false, reason: "test-audit-fail" };
    },
  };
  const base = {
    rules: RULES,
    audit: failing,
    classifyShell: (() => "risky") as () => "risky",
    operatorChannel: () => ({ outcome: "allow" as const, operatorId: "test-客户" }),
  };

  // observe（缺省）：审计失败只 stderr，不翻转。
  const observe = createShellGate({ ...base });
  assert.equal((await observe(req("rm tmp", ["rm", "tmp"]))).allow, true, "observe 下审批放行不因审计失败翻转");

  // deny-non-readonly：审批类放行 + 审计失败 ⇒ 拒绝执行（fail-closed）。
  const deny = createShellGate({ ...base, auditFailurePolicy: "deny-non-readonly" });
  const denied = await deny(req("rm tmp", ["rm", "tmp"]));
  assert.equal(denied.allow, false);
  if (!denied.allow) {
    assert.equal(denied.by, "audit:unavailable");
    assert.equal(denied.reason, "审计写入失败，已拒绝执行（fail-closed）");
  }

  // 只读 c-allow 不翻转（客户要求只读放行；其审计失败仍如实 stderr）。
  const readOnly = createShellGate({
    rules: RULES,
    audit: failing,
    classifyShell: (() => "allow") as () => "allow",
    auditFailurePolicy: "deny-non-readonly",
  });
  assert.equal((await readOnly(req("ls -la", ["ls", "-la"]))).allow, true, "只读 c-allow 不翻转");

  // assemble* 透传：审批档装配的 deny-non-readonly 同样生效（受保护范围由 run-role 传入）。
  const project = makeTempProject();
  try {
    const assembled = await assembleOperatorShellGate({
      project,
      operatorChannel: () => ({ outcome: "allow", operatorId: "test-客户" }),
      classifyShell: () => "risky",
      rules: RULES,
      auditSink: failing,
      auditFailurePolicy: "deny-non-readonly",
    });
    const r = await assembled(req("rm tmp", ["rm", "tmp"]));
    assert.equal(r.allow, false);
    assert.equal(r.by, "audit:unavailable");
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }

  // run-role 两个接 (a) 的装配点都按受保护状态传策略。
  const runRole = readFileSync(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");
  const policyLines = runRole.match(/auditFailurePolicy: roleCapabilityProtection\.state === "required" \? "deny-non-readonly" : "observe"/g) ?? [];
  assert.equal(policyLines.length, 2, "审批档与项目链装配都必须传入 auditFailurePolicy");
});

// —————————————————————— ③ 只读 Git 审计字段（I0-7 / AC-6） ——————————————————————

test("只读 Git 审计：git status/log c-allow ⇒ branch:c-allow、by 前缀 ruleset:allow:readonly:git:<id>、readonlyGit.canonicalArgv 与 buildReadonlyGitBody 一致", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    projectRoot: "/proj",
    classifyShell, // 生产四态封装：只回裸串（不带 ruleId）
    rules: defaultShellRules(),
    audit,
  });
  const status = await gate(req("git status", ["git", "status"], { roleId: "product" }));
  assert.equal(status.allow, true);
  const statusMatch = matchReadonlyGit(["git", "status"]);
  assert.ok(statusMatch);
  const statusRecord = audit.records[0];
  assert.equal(statusRecord.branch, BRANCH_C_ALLOW, "branch 语义不变（不改 c-allow）");
  assert.ok(statusRecord.by.startsWith("ruleset:allow:readonly:git:status"), `by 前缀口径：${statusRecord.by}`);
  assert.deepEqual(statusRecord.readonlyGit, {
    id: "status",
    canonicalArgv: buildReadonlyGitBody(statusMatch),
  });
  assert.equal(statusRecord.roleId, "product", "roleId 落审计（来自请求/适配器 options）");
  assert.equal(statusRecord.entry, "run_shell");

  // detailed classifier（带 ruleId）路径：同一审计字段，ruleId 直接消费。
  const audit2 = createMemoryAuditSink();
  const gate2 = createShellGate({ classifyShell: classifyShellDetailed, rules: defaultShellRules(), audit: audit2 });
  const log = await gate2(req("git log -5", ["git", "log", "-5"]));
  assert.equal(log.allow, true);
  const logMatch = matchReadonlyGit(["git", "log", "-5"]);
  assert.ok(logMatch);
  assert.deepEqual(audit2.records[0].readonlyGit, {
    id: "log",
    canonicalArgv: buildReadonlyGitBody(logMatch),
  });
  assert.ok(audit2.records[0].by.startsWith("ruleset:allow:readonly:git:log"));

  // 非只读 Git（写形态）仍硬拒且无 readonlyGit 字段。
  const audit3 = createMemoryAuditSink();
  const gate3 = createShellGate({ classifyShell, rules: defaultShellRules(), audit: audit3 });
  const commit = await gate3(req("git commit -m x", ["git", "commit", "-m", "x"]));
  assert.equal(commit.allow, false);
  assert.equal(audit3.records[0].readonlyGit, undefined);

  // 非 git c-allow 不写 readonlyGit。
  const audit4 = createMemoryAuditSink();
  const gate4 = createShellGate({ classifyShell, rules: defaultShellRules(), audit: audit4 });
  assert.equal((await gate4(req("ls -la", ["ls", "-la"]))).allow, true);
  assert.equal(audit4.records[0].readonlyGit, undefined);
});

// —————————————————————— ④ writeGuard entry 透传（W3-G 契约） ——————————————————————

test("writeGuard 入口透传：shell-gate 以 entry（缺省 run_shell）调用守卫，判定顺序不变", async () => {
  const seen: Array<{ entry?: string }> = [];
  const guard = (r: { entry?: string }) => {
    seen.push({ entry: r.entry });
    return { kind: "pass" as const };
  };
  const gate = createShellGate({ rules: RULES, audit: createMemoryAuditSink(), classifyShell: () => "allow", writeGuard: guard });
  await gate(req("ls", ["ls"], { toolCallId: "g1" }));
  await gate(req("ls", ["ls"], { toolCallId: "g2", entry: "start_background_task" }));
  assert.equal(seen[0]?.entry, "run_shell", "缺省入口按 run_shell");
  assert.equal(seen[1]?.entry, "start_background_task", "真实入口原样传给守卫");
});

// —————————————————————— ⑤ OperatorPrompt 透传（W5-D 只读核对补线，P1.3 §2.5.2） ——————————————————————

test("OperatorPrompt 透传：审批卡携带 entry/roleId（只拷贝、不默认；不参与判定）", async () => {
  const prompts: Array<{ entry?: string; roleId?: string }> = [];
  const gate = createShellGate({
    rules: RULES,
    audit: createMemoryAuditSink(),
    classifyShell: (() => "risky") as () => "risky",
    operatorChannel: (prompt) => {
      prompts.push({ entry: prompt.entry, roleId: prompt.roleId });
      return { outcome: "deny", operatorId: "test-客户", reason: "测试拒绝" };
    },
  });
  const first = await gate(req("rm tmp", ["rm", "tmp"], { roleId: "product", entry: "start_background_task" }));
  assert.equal(first.allow, false);
  const second = await gate(req("rm tmp2", ["rm", "tmp2"]));
  assert.equal(second.allow, false);
  assert.equal(prompts[0]?.entry, "start_background_task", "entry 原样进入审批卡");
  assert.equal(prompts[0]?.roleId, "product", "roleId 原样进入审批卡");
  assert.equal(prompts[1]?.entry, undefined, "缺省不默认 entry（只拷贝请求已有字段）");
  assert.equal(prompts[1]?.roleId, undefined);
});
