// test/桌面应用/rejection-copy.test.ts
// 2026-10-30（方案 v3 §3.2 / P2）：机械拒绝三段式、BUG-3/BUG-4 归因、code→owner 表、
// contract_check 只读/长度/角色隔离。
import test from "node:test";
import assert from "node:assert/strict";

import {
  formatMechanicalRejection,
  humanRejection,
  makeMechanicalRejection,
  rejectionMapSnapshot,
} from "../../src/common/编排/mechanical-rejection.ts";
import { evaluateDispatchPreflight, type DispatchPreflightInput, type ProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { evaluateGovernanceJudgeVerdict, normalizeGovernanceJudgeVerdict } from "../../src/common/编排/governance-judge-verdict.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { versionedDocOverwriteDecision } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { GovernanceJudgeRequest } from "../../src/model/runtime.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

test("三段式：missing/action/owner/docs/retryable 齐备；客户人话不含技术 code", () => {
  const rejection = makeMechanicalRejection("module-not-owned", ["模块 impl-core 不归目标 render-dev"], {
    docs: ["docs/proposals/focus-roster-v1.md"],
  });
  assert.equal(rejection.code, "module-not-owned");
  assert.equal(rejection.owner, "convener");
  assert.equal(rejection.retryable, true);
  assert.deepEqual(rejection.docs, ["docs/proposals/focus-roster-v1.md"]);
  const full = formatMechanicalRejection(rejection);
  assert.match(full, /拒绝：缺少 模块 impl-core 不归目标 render-dev/);
  assert.match(full, /下一步：/);
  assert.match(full, /谁来做：convener/);
  assert.match(full, /技术 code：module-not-owned/);
  const human = humanRejection(rejection);
  assert.equal(human.includes("module-not-owned"), false, "客户卡只人话，不出现技术 code");
});

test("BUG-4：target-card-missing 列出 D3 选中缺卡 id，不写“运营目标角色卡不存在”", () => {
  const roster: ProjectRoster = {
    schema: "project-roster/v3",
    flowId: "focus",
    version: 1,
    intent: "docs/product/focus-intent-v1.md",
    proposal: "docs/proposals/focus-proposal-v1.md",
    architecture: "docs/contracts/focus-architecture-v1.md",
    envBootstrap: { omitted: true, omissionReason: "test" },
    modules: [{ id: "impl-core", name: "实现", purpose: "实现", paths: ["src/"], path: "src/", category: "core", publicContract: "src/", architectureSource: "docs/contracts/focus-architecture-v1.md" }],
    roles: [{ id: "implementer", displayName: "实现者", purpose: "实现", capability: "TS", modules: ["impl-core"] }],
  };
  const input: DispatchPreflightInput = {
    fromRoleId: "chief",
    targetRoleId: "convener",
    targetBuiltIn: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
    flowId: "focus",
    intent: { found: true, candidates: 1 },
    proposalFound: true,
    architectureFound: true,
    roster: { ok: true, roster, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "a".repeat(64) },
    d3Selected: ["render-dev", "test-dev"],
    run: { state: "draft", runId: "run-20261030-focus-abcdef12" },
    handoffFound: false,
    targetCardFound: false,
    missingSelectedCardIds: ["render-dev", "test-dev"],
  };
  const result = evaluateDispatchPreflight(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "target-card-missing");
  assert.equal(result.rejection.owner, "nominator");
  assert.match(result.rejection.missing.join("；"), /render-dev/);
  assert.match(result.rejection.missing.join("；"), /test-dev/);
  assert.equal(formatMechanicalRejection(result.rejection).includes("运营目标角色卡不存在"), false);
});

test("BUG-3：真实 appointment-write 判断路径返回 appointment-write-root-missing（owner=app，可重试）", () => {
  const request: GovernanceJudgeRequest = {
    group: "approval",
    cardKind: "appointment-write",
    roleId: "nominator",
    projectRoot: "/proj",
    runtime: "pi",
    governanceModel: "trio",
    flowId: "focus",
    card: { kind: "confirm", title: "写 render-dev 角色卡", cardKind: "appointment-write", flowId: "focus", paths: ["角色卡/render-dev/role-card.md"] },
    paths: ["角色卡/render-dev/role-card.md"],
    pathProbes: [{ path: "角色卡/render-dev/role-card.md", allowed: true }],
    facts: { governanceModel: "trio", flowId: "focus", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [], appointmentTargetRoleIds: ["render-dev"] },
    at: "2026-10-30T00:00:00.000Z",
  };
  const outcome = evaluateGovernanceJudgeVerdict({
    request,
    verdict: normalizeGovernanceJudgeVerdict({ verdict: "approve", confirmed: true, selected: ["render-dev"], reason: "可写" }),
    engine: "pi",
  });
  assert.equal(outcome.verdict, "manual");
  if (outcome.verdict !== "manual") return;
  assert.equal(outcome.reasonCode, "appointment-write-root-missing");
  const reason = outcome.reason ?? "";
  assert.match(reason, /appointment-write-root-missing/);
  assert.match(reason, /谁来做：app/);
  assert.match(reason, /原样重试/);
  assert.equal(reason.includes("path-outside-boundary"), false);
});

test("code→owner 表覆盖高频拒绝点（run/roster/module/appointment/shell/versioned-doc）", () => {
  const codes = new Set(rejectionMapSnapshot().map((item) => item.code));
  for (const code of [
    "run-missing",
    "run-pin-required",
    "run-role-missing",
    "run-legacy-readonly",
    "roster-missing",
    "roster-modules-drift",
    "module-required",
    "module-not-owned",
    "target-card-missing",
    "appointment-write-root-missing",
    "shell-write-outside",
    "versioned-doc-overwrite",
  ]) assert.equal(codes.has(code), true, `缺映射：${code}`);
  assert.ok(rejectionMapSnapshot().every((item) => item.code !== "" && typeof item.owner === "string"));
});

test("contract_check 工具：只读、按角色裁剪、≤4KB、缺失数据如实报错", async () => {
  const gate = (() => ({ allowed: true })) as unknown as WriteGate;
  let seenInput: unknown;
  const tool = buildGovernedTools(gate, {
    roleId: "render-dev",
    runtime: "demo",
    contractCheck: async (input) => {
      seenInput = input;
      return "run：pinned\r\n文档：focus-roster-v1.md";
    },
  }).find((item) => item.name === "contract_check");
  assert.ok(tool);
  if (!tool) return;
  const ok = await tool.handler({ args: { flowId: "focus", taskKind: "dispatch", moduleId: "impl-core" } } as never);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.match(ok.message, /run：pinned/);
  assert.deepEqual(seenInput, { flowId: "focus", roleId: "render-dev", taskKind: "dispatch", moduleId: "impl-core" });
  const otherRole = await tool.handler({ args: { roleId: "other-role" } } as never);
  assert.equal(otherRole.ok, false);
  if (!otherRole.ok) assert.match(otherRole.message, /只允许查询本角色/);
  assert.equal(buildGovernedTools(gate, { roleId: "render-dev" }).some((item) => item.name === "contract_check"), false);
});

test("contract_check 输出超长由工具层截断到 4KB 内", async () => {
  const gate = (() => ({ allowed: true })) as unknown as WriteGate;
  const tool = buildGovernedTools(gate, {
    roleId: "render-dev",
    contractCheck: () => "x".repeat(10_000),
  }).find((item) => item.name === "contract_check");
  assert.ok(tool);
  if (!tool) return;
  const result = await tool.handler({ args: {} } as never);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(Buffer.byteLength(result.message, "utf8") <= 4096);
    assert.match(result.message, /已截断/);
  }
});

test("旧 code 别名可读：canonical code + legacyCode 保留", async () => {
  const { canonicalRejectionCode } = await import("../../src/common/编排/mechanical-rejection.ts");
  assert.equal(canonicalRejectionCode("M6_MODULE_OWNER_MISMATCH"), "module-not-owned");
  const rejection = makeMechanicalRejection("M5_TARGET_CARD_MISSING", ["D3 选中角色 render-dev 的卡未齐备"]);
  assert.equal(rejection.code, "target-card-missing");
  assert.equal(rejection.legacyCode, "M5_TARGET_CARD_MISSING");
  assert.equal(rejection.owner, "nominator");
});


test("真实 shell 写目标拒绝：reason 三段式 + owner + 技术 code（保留 kind/targets 旧字段）", () => {
  const decision = evaluateShellWriteTargets({
    argv: ["cp", "a.txt", "other/b.txt"],
    cwd: "/proj",
    projectRoot: "/proj",
    skillRoot: "/proj",
    boundary: { entries: [], boundarySource: "test", acceptance: { accepted: false, source: "" } },
    forbiddenPrefixes: [],
    checkWrite: () => ({ allowed: false, reason: "不在写边界" }),
  });
  assert.equal(decision.kind, "deny");
  if (decision.kind !== "deny") return;
  assert.deepEqual(decision.targets, ["other/b.txt"]);
  assert.equal(decision.code, "shell-write-outside");
  assert.ok(decision.rejection);
  assert.match(decision.reason, /拒绝：缺少/);
  assert.match(decision.reason, /下一步：/);
  assert.match(decision.reason, /谁来做：convener/);
  assert.match(decision.reason, /技术 code：shell-write-outside/);
});

test("真实 versioned-doc 拒绝：allowed=false 带三段式与 versioned-doc-overwrite code", () => {
  const decision = versionedDocOverwriteDecision({ relPath: "docs/proposals/focus-roster-v1.md", exists: true });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.code, "versioned-doc-overwrite");
  assert.equal(decision.rejection.owner, "app");
  assert.match(decision.reason, /拒绝：缺少/);
  assert.match(decision.reason, /下一步：/);
  assert.match(decision.reason, /技术 code：versioned-doc-overwrite/);
});


test("F1 真实写门禁：resolveWrite → write_file 前置回执三段式，旧文案/零写入保留", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-reject-write-"));
  try {
    const boundary = { entries: [], boundarySource: "test", acceptance: { accepted: true, source: "test" } };
    const gate = (abs: string) => resolveWrite(
      abs.startsWith(root) ? path.relative(root, abs).replace(/\\/g, "/") : abs,
      boundary,
      undefined,
      { skillRoot: root, projectRoot: root },
    );
    const tools = buildGovernedTools(gate as never, { readRoot: root, writeRoot: root });
    const write = tools.find((tool) => tool.name === "write_file");
    assert.ok(write);
    const result = await write!.handler({ args: { path: "src/x.ts", content: "x" } } as never);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /拒绝：缺少/);
    assert.match(result.message, /下一步：/);
    assert.match(result.message, /谁来做：/);
    assert.match(result.message, /技术 code：path-outside-boundary/);
    assert.match(result.message, /写入被拒绝|目标路径未匹配任何边界条目/);
    await assert.rejects(fs.stat(path.join(root, "src/x.ts")));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
