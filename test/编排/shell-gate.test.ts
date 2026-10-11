// test/编排/shell-gate.test.ts
// 编排角色自测：`ShellGate` 第一步（只接 (c)）的装配、注入映射、fail-closed 退路与审计留痕。
// 只依赖本角色文件（common/编排/）与门禁引擎纯函数（resolveWrite）——不依赖 Pi 适配器落盘。
//
// 覆盖（任务要求的六项 + 加固）：
//   1. allow → 放行，**不产出 token**（票据机制已废，§7.1 第 3 条），by 为 ruleset:<id>；
//   2. deny  → 拒绝；
//   3. review → **第一步默认拒绝**（证明 fail-closed 没被反过来）；  ← 最重要
//   4. 审核超时 → 拒绝；
//   5. 规则集加载失败 → 拒绝；
//   6. 审计记录被追加且含要求字段、且声明了 shell-gate 条件；
//   加固：未注入分类函数 → 拒绝；分类抛错 → 拒绝；review 对任意命令都拒绝。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { ShellGate } from "../../src/provider/pi/session.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { selectAdapterFactory, type AdapterFactoryBuilder } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createShellGate,
  buildShellGate,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_REVIEW_NO_BA,
  BRANCH_RULESET_LOAD_FAILED,
  BRANCH_NO_CLASSIFIER,
  BRANCH_TIMEOUT,
  type ClassifyShellFn,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import {
  SHELL_AUDIT_REL_PATH,
  SHELL_GATE_CONDITION,
  buildShellAuditGate,
  createFileAuditSink,
  createMemoryAuditSink,
  type ShellAuditRecord,
} from "../../src/common/编排/shell-audit.ts";

// 规则集用**严格形状**（来源 model/decision.ts；shell-gate 不再自定义宽松版本）。
// 审计的 ruleset 归属走 createShellGate 的 `rulesId` 选项（严格 ShellRules 无 id 字段）。
const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const RULES_ID = "test-ruleset";
const REQ = {
  command: "ls -la",
  argv: ["ls", "-la"],
  cwd: "/proj",
  toolCallId: "call-1",
};

/** 便捷：装配一个使用内存审计的 ShellGate，分类函数由参数给定。 */
function gateWith(classifyShell: ClassifyShellFn | undefined, rules: ShellRules | (() => ShellRules | Promise<ShellRules>) = RULES) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({ classifyShell, rules, rulesId: RULES_ID, audit });
  return { gate, audit };
}

// —————————————————————— 1. allow ——————————————————————

test("allow → 放行（**不产出 token**），by 为 ruleset:<id>，审计记 c-allow", async () => {
  const { gate, audit } = gateWith(() => "allow");
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(r.by, "ruleset:test-ruleset");
  // 票据机制已废（§7.1 第 3 条）：allow 结果**不得**再携带 token 字段（接口对齐）。
  assert.equal("token" in r, false, "allow 结果不应再含 token 字段");

  const rec = audit.records[0];
  assert.equal(rec.conclusion, "allow");
  assert.equal(rec.branch, BRANCH_C_ALLOW);
  assert.equal(rec.execution, "未执行");
});

// —————————————————————— 2. deny ——————————————————————

test("deny → 拒绝（硬拒终结），审计记 c-deny", async () => {
  const { gate, audit } = gateWith(() => ({ decision: "deny", ruleId: "rm-rf", reason: "命中 rm 硬拒" }));
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /rm 硬拒/);
  assert.equal(r.by, "ruleset:rm-rf"); // 门禁引擎给了命中规则 id 即用它
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
  assert.equal(audit.records[0].conclusion, "deny");
});

// —————————————————————— 3. review → 默认拒绝（最重要） ——————————————————————

test("review → 第一步**默认拒绝**（未接入 (b)/(a)，绝不因缺下一闸而放行）", async () => {
  const { gate, audit } = gateWith(() => "review");
  const r = await gate({ ...REQ, command: "some-unknown-cmd", argv: ["some-unknown-cmd"] });
  // 关键断言：必须 allow:false。若这里放行，就是把 fail-closed 反过来。
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /未接入 \(b\)\/\(a\)/);
  assert.equal(audit.records[0].branch, BRANCH_REVIEW_NO_BA);
  assert.equal(audit.records[0].conclusion, "deny");
});

test("review 对任意命令都默认拒绝（不因命令看似无害而放行）", async () => {
  const { gate } = gateWith(() => "review");
  for (const cmd of ["echo hi", "pwd", "cat foo.txt"]) {
    const r = await gate({ command: cmd, argv: cmd.split(" "), cwd: "/proj", toolCallId: "t" });
    assert.equal(r.allow, false, `review 命令应被拒：${cmd}`);
  }
});

// —————————————————————— 4. 超时 → 拒绝 ——————————————————————

test("审核超时 → 拒绝（超时包装；退路 3）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "allow",
    rules: () => new Promise<ShellRules>(() => {}), // 规则加载永不返回 → 触发超时
    audit,
    timeoutMs: 30,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /超时/);
  assert.equal(audit.records[0].branch, BRANCH_TIMEOUT);
  assert.equal(audit.records[0].conclusion, "timeout");
});

// —————————————————————— 5. 规则集加载失败 → 拒绝 ——————————————————————

test("规则集加载失败 → 整条命令拒绝（绝不「规则没了就一律放行」）", async () => {
  const { gate, audit } = gateWith(
    () => "allow",
    () => {
      throw new Error("YAML 解析失败");
    },
  );
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /规则集加载\/解析失败/);
  assert.equal(audit.records[0].branch, BRANCH_RULESET_LOAD_FAILED);
  assert.equal(audit.records[0].conclusion, "error");
});

// —————————————————————— 加固：未注入分类函数 / 分类抛错 ——————————————————————

test("未注入 classifyShell → 一律拒绝（能力缺席即 fail-closed）", async () => {
  const { gate, audit } = gateWith(undefined);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, BRANCH_NO_CLASSIFIER);
});

test("classifyShell 抛错 → 拒绝（保守，不把异常当放行）", async () => {
  const { gate } = gateWith(() => {
    throw new Error("分类器崩溃");
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
});

// —————————————————————— 6. 审计落盘 + shell-gate 条件声明 ——————————————————————

// pm 边界夹具：docs/audit/ 是 conditional-directory，condition = shell-gate。
function makePmBoundary(): BoundarySection1 {
  return {
    boundarySource: "角色卡/项目管理/boundary.yaml",
    acceptance: { accepted: true, source: "test:fixture-pm" },
    entries: [
      {
        root: "project",
        path: "docs/audit/",
        kind: "conditional-directory",
        condition: SHELL_GATE_CONDITION,
        purpose: "shell 闸审计留痕",
      },
    ],
  };
}

test("审计记录被追加到 docs/audit/shell-gate.jsonl，含要求字段且声明 shell-gate 条件", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const pmBoundary = makePmBoundary();
    const gate = buildShellAuditGate(pmBoundary, { skillRoot: root, projectRoot: root });
    const sink = createFileAuditSink({ projectRoot: root, gate });
    const shellGate = createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit: sink });

    await shellGate({ command: "cat README.md", argv: ["cat", "README.md"], cwd: root, toolCallId: "tc-9" });

    const auditPath = path.join(root, SHELL_AUDIT_REL_PATH);
    assert.ok(fs.existsSync(auditPath), "审计文件应被创建");
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]) as ShellAuditRecord;

    // 要求字段齐备（§7.6）。
    assert.equal(rec.toolCallId, "tc-9");
    assert.equal(rec.command, "cat README.md"); // 逐字原文
    assert.deepEqual(rec.argv, ["cat", "README.md"]); // 规范化 argv
    assert.equal(rec.cwd, root);
    assert.equal(rec.conclusion, "allow");
    assert.equal(rec.branch, BRANCH_C_ALLOW);
    assert.equal(rec.by, "ruleset:test-ruleset"); // 第一步「谁审的」= 规则集/规则 id
    assert.ok(typeof rec.timestamp === "string" && !Number.isNaN(Date.parse(rec.timestamp)));
    assert.equal(rec.execution, "未执行"); // 审核在execution之前
    // 声明的条件**必须含 shell-gate**（否则门禁会拒写）。
    assert.ok(Array.isArray(rec.conditions) && rec.conditions.includes(SHELL_GATE_CONDITION));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("审计是追加式：两条记录追加为两行（不改写既有）", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const pmBoundary = makePmBoundary();
    const gate = buildShellAuditGate(pmBoundary, { skillRoot: root, projectRoot: root });
    const sink = createFileAuditSink({ projectRoot: root, gate });
    const shellGate = createShellGate({ classifyShell: () => "deny", rules: RULES, rulesId: RULES_ID, audit: sink });

    await shellGate({ command: "rm -rf /", argv: ["rm", "-rf", "/"], cwd: root, toolCallId: "tc-1" });
    await shellGate({ command: "rm -rf /", argv: ["rm", "-rf", "/"], cwd: root, toolCallId: "tc-2" });

    const lines = fs.readFileSync(path.join(root, SHELL_AUDIT_REL_PATH), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("硬要求负例：审计写门禁 scope **不含** shell-gate → 被门禁拒绝、零副作用（不落盘）", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const pmBoundary = makePmBoundary();
    // 故意构造一个**不声明** shell-gate 条件的门禁（scope.conditions 为空）。
    const badGate = (p: string) =>
      resolveWrite(p, pmBoundary, { writeSet: [SHELL_AUDIT_REL_PATH], conditions: [] }, {
        skillRoot: root,
        projectRoot: root,
      });
    const sink = createFileAuditSink({ projectRoot: root, gate: badGate });
    const shellGate = createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit: sink });

    const r = await shellGate({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "tc-x" });

    // 判定照常给出（allow），但审计未落盘——证明「声明 shell-gate」不是形式要求。
    assert.equal(r.allow, true);
    assert.equal(fs.existsSync(path.join(root, SHELL_AUDIT_REL_PATH)), false, "缺条件 → 审计不得落盘");
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "缺条件 → 不得建目录（零副作用）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// —————————————————————— Pipeline 构造入口 + 注入路径 ——————————————————————

test("buildShellGate（Pipeline 构造入口）→ 判定 + 自动审计落盘 docs/audit/shell-gate.jsonl", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const gate = buildShellGate({
      classifyShell: () => "allow",
      rules: RULES,
      projectRoot: root,
      skillRoot: root,
      pmBoundary: makePmBoundary(),
    });
    const r = await gate({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "tc-bs" });
    assert.equal(r.allow, true);
    const lines = fs.readFileSync(path.join(root, SHELL_AUDIT_REL_PATH), "utf8").trim().split("\n");
    const rec = JSON.parse(lines[0]) as ShellAuditRecord;
    assert.equal(rec.toolCallId, "tc-bs");
    assert.ok(rec.conditions.includes(SHELL_GATE_CONDITION));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const PID_PROJECT: ProjectConfig = { projectRoot: "/p", skillRoot: "/s", roles: {} };

test("注入路径：selectAdapterFactory 把编排构造的 shellGate 转发给 pi 工厂", () => {
  let received: ShellGate | undefined;
  const probe: AdapterFactoryBuilder = (_project, shellGate) => {
    received = shellGate;
    return () => ({ composeContext: async () => ({ systemPrompt: "" }), bindRole: async () => ({} as never) });
  };
  const sh: ShellGate = async () => ({ allow: false, reason: "x", by: "ruleset:t" });
  selectAdapterFactory("pi", PID_PROJECT, {
    createAdapter: () => ({} as never),
    piFactory: probe,
    shellGate: sh,
  });
  assert.equal(received, sh, "shellGate 应原样转发给 pi 工厂");
});

test("注入路径：不传 shellGate → pi 工厂收到 undefined（run_shell 将不注册，fail-closed）", () => {
  let called = false;
  let received: ShellGate | undefined;
  const probe: AdapterFactoryBuilder = (_project, shellGate) => {
    called = true;
    received = shellGate;
    return () => ({} as never);
  };
  selectAdapterFactory("pi", PID_PROJECT, { createAdapter: () => ({} as never), piFactory: probe });
  assert.ok(called);
  assert.equal(received, undefined);
});
