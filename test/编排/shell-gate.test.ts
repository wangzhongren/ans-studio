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
  type ShellAuditSink,
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

// —————————————————————— F-6 修复批（kanban-live）：刷新重试 + 提示去重 ——————————————————————
//
// 事故形态（F-6）：会话在创世过渡窗口内创建 ⇒ 持有**未接受**的边界快照 ⇒ 审计写被 F6 拒绝且
// 无自愈通道（每条约审命令打印一次「未落盘」并丢条，直至会话重建）。本批：
//   F-6-1 = 审计 sink 首查被拒时刷新边界快照、以新门禁重试一次（放行后切换活跃门禁）；
//   F-6-2 = 失败提示按 reason 去重（首个一次、重复不逐条、变化/恢复各一行）+ 文案去除猜测性归因。

/** 未接受边界（= 现场快照形态：无 parseError、acceptance 未接受 → F6 拒一切写入）。 */
function makeUnacceptedBoundary(): BoundarySection1 {
  return {
    boundarySource: "<test:未接受快照>",
    acceptance: { accepted: false, source: "" },
    entries: [],
  };
}

/** sink 直连用的最小记录（字段齐备即可）。 */
function makeAuditRecord(toolCallId: string): ShellAuditRecord {
  return {
    timestamp: new Date().toISOString(),
    toolCallId,
    command: "ls -la",
    argv: ["ls", "-la"],
    cwd: "/proj",
    conclusion: "allow",
    branch: BRANCH_C_ALLOW,
    by: `ruleset:${RULES_ID}`,
    conditions: [SHELL_GATE_CONDITION],
    execution: "未执行",
  };
}

test("F-6-T1（刷新恢复）：未接受快照 + refreshGate 给出已接受边界 → 首查拒 → 重试落盘一条；此后直走新门禁", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const ctx = { skillRoot: root, projectRoot: root };
    const staleGate = buildShellAuditGate(makeUnacceptedBoundary(), ctx);
    const freshGate = buildShellAuditGate(makePmBoundary(), ctx);
    let refreshCalls = 0;
    const sink = createFileAuditSink({
      projectRoot: root,
      gate: staleGate,
      refreshGate: async () => {
        refreshCalls += 1;
        return freshGate;
      },
    });
    const shellGate = createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit: sink });

    const r = await shellGate({ command: "ls -la", argv: ["ls", "-la"], cwd: root, toolCallId: "tc-f6-1" });
    assert.equal(r.allow, true, "审计失败不翻转判定（allow 照常）");
    assert.equal(refreshCalls, 1, "首查被拒 → 刷新一次");

    const auditPath = path.join(root, SHELL_AUDIT_REL_PATH);
    assert.ok(fs.existsSync(auditPath), "重试放行 → 审计落盘");
    const rec = JSON.parse(fs.readFileSync(auditPath, "utf8").trim().split("\n")[0]) as ShellAuditRecord;
    assert.equal(rec.toolCallId, "tc-f6-1");
    assert.equal(rec.branch, BRANCH_C_ALLOW);
    assert.equal(rec.by, "ruleset:test-ruleset");
    assert.ok(rec.conditions.includes(SHELL_GATE_CONDITION), "声明 shell-gate 条件");
    assert.equal(rec.execution, "未执行");

    // 活跃门禁已切换为新 gate：恢复后零额外开销（后续条目不触发刷新）。
    await shellGate({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "tc-f6-1b" });
    assert.equal(refreshCalls, 1, "恢复后不再刷新");
    assert.equal(fs.readFileSync(auditPath, "utf8").trim().split("\n").length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-6-T2（缺省无刷新 = 现状）：未接受快照、无 refreshGate → 拒且零副作用（不建目录、无文件）", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const sink = createFileAuditSink({
      projectRoot: root,
      gate: buildShellAuditGate(makeUnacceptedBoundary(), { skillRoot: root, projectRoot: root }),
    });
    const shellGate = createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit: sink });
    const r = await shellGate({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "tc-f6-2" });
    assert.equal(r.allow, true, "判定照常");
    assert.equal(fs.existsSync(path.join(root, SHELL_AUDIT_REL_PATH)), false, "无刷新 → 不落盘（旧行为）");
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "零副作用（不建目录）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-6-T3（刷新仍拒）：refreshGate 返回另一份未接受边界 → 拒、零副作用、原因含两段事实且无猜测性归因", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const ctx = { skillRoot: root, projectRoot: root };
    let refreshCalls = 0;
    const sink = createFileAuditSink({
      projectRoot: root,
      gate: buildShellAuditGate(makeUnacceptedBoundary(), ctx),
      refreshGate: async () => {
        refreshCalls += 1;
        return buildShellAuditGate(makeUnacceptedBoundary(), ctx); // 收尾前：重解析仍是未接受
      },
    });
    const res = await sink.append(makeAuditRecord("tc-f6-3"));
    assert.equal(res.ok, false);
    assert.equal(refreshCalls, 1, "首查被拒 → 恰好刷新一次");
    const reason = res.reason ?? "";
    assert.match(reason, /审计写被门禁拒绝/, "如实头");
    assert.match(reason, /已刷新边界快照重试一次，仍被拒/, "链式原因：重解析后仍拒");
    // 两段事实：原判 + 重解析后仍拒（同一 F6 原文各出现一次）。
    assert.equal(reason.split("边界未被接受或缺少证据来源（F6）：拒绝一切写入。").length - 1, 2, "原判与重试原因都在");
    assert.ok(!reason.includes("缺少 `shell-gate` 条件？"), "不再猜测「缺少条件」（现场反例）");
    assert.equal(fs.existsSync(path.join(root, SHELL_AUDIT_REL_PATH)), false, "零副作用");
    assert.equal(fs.existsSync(path.join(root, "docs")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-6-T3b（刷新失败）：refreshGate 未取得门禁/抛错 → 维持拒绝、原因如实、零副作用", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shellgate-"));
  try {
    const stale = buildShellAuditGate(makeUnacceptedBoundary(), { skillRoot: root, projectRoot: root });
    const missing = createFileAuditSink({ projectRoot: root, gate: stale, refreshGate: async () => undefined });
    const res1 = await missing.append(makeAuditRecord("tc-f6-3b-1"));
    assert.equal(res1.ok, false);
    assert.match(res1.reason ?? "", /刷新边界快照未取得可用门禁，未重试/);

    const throwing = createFileAuditSink({
      projectRoot: root,
      gate: stale,
      refreshGate: async () => {
        throw new Error("盘上读取失败");
      },
    });
    const res2 = await throwing.append(makeAuditRecord("tc-f6-3b-2"));
    assert.equal(res2.ok, false);
    assert.match(res2.reason ?? "", /刷新边界快照失败（盘上读取失败），未重试/);
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "零副作用");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-6-T4（F-6-2 去重 + 如实话术）：同因仅报一次；变化/恢复/恢复后再失败各一行；判定不翻转", async () => {
  let mode: "A" | "B" | "ok" = "A";
  const audit: ShellAuditSink = {
    async append() {
      return mode === "ok" ? { ok: true } : { ok: false, reason: `测试拒绝原因${mode}` };
    },
  };
  const gate = createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit });
  const reqN = (n: number) => ({ command: "ls", argv: ["ls"], cwd: "/p", toolCallId: `tc-f6-4-${n}` });

  const captured: string[] = [];
  const orig = process.stderr.write;
  process.stderr.write = ((chunk: unknown) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const r1 = await gate(reqN(1));
    assert.equal(r1.allow, true, "审计失败不翻转判定");
    await gate(reqN(2));
    await gate(reqN(3));
    assert.equal(captured.length, 1, "同因重复**不逐条打印**（3 条失败 → 1 行）");
    assert.equal(captured[0], "shell 闸审计未落盘：测试拒绝原因A\n", "首个完整打印一次（前缀保留）");

    mode = "B";
    await gate(reqN(4));
    assert.equal(captured.length, 2, "reason 变化 → 再报一次");
    assert.equal(captured[1], "shell 闸审计未落盘：测试拒绝原因B\n");

    mode = "ok";
    await gate(reqN(5));
    assert.equal(captured.length, 3, "恢复落盘 → 一行「已恢复落盘」");
    assert.equal(captured[2], "shell 闸审计已恢复落盘（此前未落盘 4 条）\n", "恢复行如实带累计条数");

    mode = "A";
    await gate(reqN(6));
    assert.equal(captured.length, 4, "恢复后再失败 → 再报一次");
    assert.equal(captured[3], "shell 闸审计未落盘：测试拒绝原因A\n");
  } finally {
    process.stderr.write = orig;
  }
});

// —————————————————————— F-4-X1：操作者通道真实 reason 转达 ——————————————————————

test("F-4-X1：unavailable → 转达通道真实 reason（「确认超时」/「轮次中止」可辨）；缺原因走如实兜底，不再固定「无人值守？」", async () => {
  const reqN = (id: string) => ({ command: "mysterytool --flag", argv: ["mysterytool", "--flag"], cwd: "/proj", toolCallId: id });
  const makeGate = (operatorChannel: import("../../src/provider/pi/session.ts").OperatorChannelFn, audit: ReturnType<typeof createMemoryAuditSink>) =>
    createShellGate({ classifyShell: () => "review", rules: RULES, rulesId: RULES_ID, audit, operatorChannel });

  // ① 桌面通道自超时（M2 文案）→ 模型看到「操作者确认超时（>Nms）」，不再被读成「无人值守」。
  const audit1 = createMemoryAuditSink();
  const g1 = makeGate(() => ({ outcome: "unavailable", reason: "操作者确认超时（>120000ms），拒绝执行（fail-closed）" }), audit1);
  const r1 = await g1(reqN("tc-x1-1"));
  assert.equal(r1.allow, false, "fail-closed 结论不变（拒绝）");
  if (!r1.allow) {
    assert.match(r1.reason, /操作者确认超时（>120000ms）/, "转达超时事实");
    assert.ok(!r1.reason.includes("无人值守"), "不再固定「无人值守？」");
  }
  assert.equal(audit1.records[0].branch, "b-unavailable→a-unavailable", "归因码稳定（不按文本猜）");

  // ② 轮次中止/重建（M2 的另一种来源）→ 原文转达（与超时可辨）。
  const g2 = makeGate(() => ({ outcome: "unavailable", reason: "本轮已结束、停止或会话已重建，旧 shell 确认失效。" }), createMemoryAuditSink());
  const r2 = await g2(reqN("tc-x1-2"));
  assert.equal(r2.allow, false);
  if (!r2.allow) assert.match(r2.reason, /本轮已结束、停止或会话已重建/, "转达轮次中止事实（超时/中止分流）");

  // ③ 通道未给原因 / 未返回结果 → 如实兜底（不猜测「无人值守」）。
  const g3 = makeGate(() => ({ outcome: "unavailable" }), createMemoryAuditSink());
  const r3 = await g3(reqN("tc-x1-3"));
  assert.equal(r3.allow, false);
  if (!r3.allow) {
    assert.match(r3.reason, /未给出原因/);
    assert.ok(!r3.reason.includes("无人值守"));
  }
  const g4 = makeGate(() => null, createMemoryAuditSink());
  const r4 = await g4(reqN("tc-x1-4"));
  assert.equal(r4.allow, false);
  if (!r4.allow) assert.match(r4.reason, /未给出原因/, "null 结果同兜底");
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
