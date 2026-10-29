// test/编排/appointment-roster.test.ts
// 2026-10-29（方案 v2.1 §5.1/M3，F7）：招人决定卡（appointment）的编排侧机械校验——
//   · 只有人事（nominator）可发；convener 发卡被拒（不发卡、不带 judgeContext）；
//   · 选项必须恰为最新名单角色（多选）；推荐集由应用从名单生成（judgeContext.recommendedRoleIds）。
// 全程桩适配器 + 临时项目；不触网、不落盘（写盘仅测试夹具）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/model/runtime.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v2",
  "flowId: focus",
  "version: 1",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    modules:",
  "      - qa-suite",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现 CLI",
  "    directory: src/",
  "    publicContract: src/index.js",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 独立测试",
  "    directory: test/",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "modules:",
  "  - id: impl-core",
  "    directory: src/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    directory: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

function trioProject(rosterText: string = ROSTER_TEXT): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-appointment-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "proposals", "focus-roster-v1.md"), rosterText, "utf8");
  const parsedRoster = parseProjectRoster(rosterText);
  if (!parsedRoster.ok) throw new Error(`fixture roster invalid: ${parsedRoster.reason}`);
  fs.writeFileSync(
    path.join(root, "docs", "proposals", "focus-modules-v1.md"),
    [
      "---",
      "schema: project-modules/v1",
      "flowId: focus",
      "version: 1",
      `modules: ${JSON.stringify(parsedRoster.roster.modules)}`,
      "---",
      "# 模块清单",
    ].join("\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "product", "focus-intent-v1.md"), "# 意图\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "proposals", "focus-proposal-v1.md"), "# 提案\n\nintent: docs/product/focus-intent-v1.md\n", "utf8");
  fs.mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "contracts", "focus-architecture-v1.md"),
    "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "角色卡"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "governance-boundary.yaml"), "role: governance\nentries: []\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:appointment" },
    },
  };
}

function stubAdapter(): {
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
                yield { kind: "settled", summary: "会话结束" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

const appointmentCard = (optionIds: string[]): CustomerInputRequest => ({
  kind: "choice",
  title: "D3 招人决定（按名单）",
  cardKind: "appointment",
  flowId: "focus",
  multiple: true,
  options: optionIds.map((id) => ({ id, label: id })),
});

test("人事发招人卡：选项=最新名单角色 ⇒ 应用生成推荐集（judgeContext.recommendedRoleIds）", async () => {
  const project = trioProject();
  try {
    const captured: { request?: CustomerInputRequest; metadata?: CustomerInputMetadata } = {};
    const raw: CustomerInputFn = (request, metadata) => {
      captured.request = request;
      captured.metadata = metadata;
      return { outcome: "answered", value: { selected: ["implementer", "qa"] } } satisfies CustomerInputOutcome;
    };
    const stub = stubAdapter();
    const handle = await openRoleSession(
      { roleId: "nominator", project, customerInput: raw },
      { createAdapter: stub.createAdapter },
    );
    const input = stub.caps()!.customerInput!;
    const outcome = await input(appointmentCard(["qa", "implementer"]), { flowId: "focus" });
    assert.equal(outcome?.outcome, "answered");
    assert.equal(captured.request?.cardKind, "appointment");
    assert.match(captured.request?.preview ?? "", /人员\+模块拓扑图/, "D3 卡 preview 由应用附加拓扑图");
    assert.match(captured.request?.preview ?? "", /src\//, "拓扑图含模块文件夹地址");
    assert.deepEqual(
      captured.metadata?.judgeContext?.recommendedRoleIds,
      ["implementer", "qa"],
      "推荐集按名单顺序由应用生成（不采信模型自报）",
    );
    assert.equal(captured.metadata?.judgeContext?.flowId, "focus");
    await handle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("招人卡与名单不一致（缺项）⇒ declined + notPresented，不触达客户通道", async () => {
  const project = trioProject();
  try {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["implementer"] } };
    };
    const stub = stubAdapter();
    const handle = await openRoleSession(
      { roleId: "nominator", project, customerInput: raw },
      { createAdapter: stub.createAdapter },
    );
    const outcome = await stub.caps()!.customerInput!(appointmentCard(["implementer"]), { flowId: "focus" });
    assert.equal(outcome?.outcome, "declined");
    assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
    assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /名单/);
    assert.equal(rawCalls, 0, "未向客户发卡");
    await handle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("convener 发招人卡 ⇒ 被拒（不能发 appointment；只由人事发起）", async () => {
  const project = trioProject();
  try {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["implementer", "qa"] } };
    };
    const stub = stubAdapter();
    const handle = await openRoleSession(
      { roleId: "convener", project, customerInput: raw },
      { createAdapter: stub.createAdapter },
    );
    const outcome = await stub.caps()!.customerInput!(appointmentCard(["implementer", "qa"]), { flowId: "focus" });
    assert.equal(outcome?.outcome, "declined");
    assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
    assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /人事|nominator/);
    assert.equal(rawCalls, 0, "convener 的招人卡不呈现给客户");
    await handle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

// ————————————————— 2026-10-29（方案 v2.1 §5.1/M4）：写卡目录 ⊆ 名单授权目录 —————————————————

function boundaryPreview(entries: string[]): string {
  return [
    "## 角色卡/implementer/boundary.yaml",
    "```yaml",
    "role: implementer",
    "entries:",
    ...entries,
    "```",
  ].join("\n");
}

function boundaryPath(entryPath: string): string {
  return `  - kind: directory\n    path: ${entryPath}\n    purpose: 实现`;
}

function roleCardPreview(): string {
  return [
    "## 角色卡/implementer/role-card.md",
    "```md",
    "# 实现者角色卡",
    "## 组别",
    "实现组",
    "## 工作立场",
    "实现者立场",
    "## 能力描述",
    "Node.js 零依赖 CLI 实现",
    "## 职责与功能导航",
    "实现 src/ 下的命令与存储",
    "## 必读资料",
    "docs/proposals/focus-proposal-v1.md",
    "## 交接输入输出",
    "输入：运营任务；输出：submit_report 短报",
    "## 执行原则",
    "只写名单授权目录",
    "## 质量职责",
    "自测并交质检核对",
    "## 标准工作流",
    "接任务→实现→短报",
    "## 交付物清单",
    "src/cli.js",
    "```",
  ].join("\n");
}

async function appointmentWriteOutcome(
  entries: string[],
  metadata: CustomerInputMetadata = {
    flowId: "focus",
    intentId: "focus",
    targetRoleId: "implementer",
    decisionId: "decision-req-d3",
  },
  overrides?: { paths?: string[]; preview?: string; rosterText?: string },
): Promise<{
  outcome?: string;
  notPresented?: boolean;
  reason?: string;
  rawCalls: number;
  judgeContext?: CustomerInputMetadata["judgeContext"];
}> {
  const project = trioProject(overrides?.rosterText);
  try {
    let rawCalls = 0;
    const captured: { metadata?: CustomerInputMetadata } = {};
    const raw: CustomerInputFn = (_request, meta) => {
      captured.metadata = meta;
      rawCalls += 1;
      return { outcome: "answered", value: { confirmed: true } };
    };
    const stub = stubAdapter();
    const handle = await openRoleSession(
      { roleId: "nominator", project, customerInput: raw },
      { createAdapter: stub.createAdapter },
    );
    const input = stub.caps()!.customerInput!;
    const out = await input(
      {
        kind: "confirm",
        title: "写实现者边界",
        cardKind: "appointment-write",
        flowId: "focus",
        paths: overrides?.paths ?? ["角色卡/implementer/boundary.yaml"],
        preview: overrides?.preview ?? boundaryPreview(entries),
      },
      metadata,
    );
    await handle.dispose();
    return {
      outcome: out?.outcome,
      notPresented: out?.outcome === "declined" ? out.notPresented : undefined,
      reason: out?.outcome === "declined" ? out.reason : undefined,
      rawCalls,
      judgeContext: captured.metadata?.judgeContext,
    };
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
}

test("appointment-write 目录校验：boundary 目录在名单授权目录内 ⇒ 发卡；越名单目录 ⇒ notPresented", async () => {
  const allowed = await appointmentWriteOutcome([boundaryPath("src/")]);
  assert.equal(allowed.outcome, "answered", allowed.reason ?? "");
  assert.equal(allowed.rawCalls, 1);

  const outside = await appointmentWriteOutcome([boundaryPath("other/")]);
  assert.equal(outside.outcome, "declined");
  assert.equal(outside.notPresented, true);
  assert.match(outside.reason ?? "", /授权目录|名单/);
  assert.equal(outside.rawCalls, 0, "越名单目录不向客户发卡");
  assert.equal(outside.judgeContext, undefined, "结构校验失败不产生 judgeContext");
});

test("BUG-3：appointment-write judge 事实含角色可写根（角色卡/<target>/ ∪ 名单目录）与 allowed 探针", async () => {
  const allowed = await appointmentWriteOutcome([boundaryPath("src/")]);
  assert.equal(allowed.outcome, "answered", allowed.reason ?? "");
  const ctx = allowed.judgeContext;
  assert.ok(ctx, "发卡时必须计算 judgeContext");
  assert.ok(
    ctx.allowedPathRoots?.includes("角色卡/implementer/"),
    `allowedPathRoots 必须含目标角色卡目录，实际：${JSON.stringify(ctx.allowedPathRoots)}`,
  );
  assert.ok(
    ctx.allowedPathRoots?.includes("src/"),
    `allowedPathRoots 必须含名单授权目录，实际：${JSON.stringify(ctx.allowedPathRoots)}`,
  );
  assert.equal(
    ctx.pathProbes?.find((probe) => probe.path === "角色卡/implementer/boundary.yaml")?.allowed,
    true,
    "角色卡路径必须经同一 resolveWrite 探测为 allowed",
  );
});

test("BUG-3：角色卡 role-card.md 与 boundary.yaml 均经同一 resolveWrite 探测为 allowed", async () => {
  const both = await appointmentWriteOutcome([boundaryPath("src/")], undefined, {
    paths: ["角色卡/implementer/role-card.md", "角色卡/implementer/boundary.yaml"],
    preview: [roleCardPreview(), boundaryPreview([boundaryPath("src/")])].join("\n\n"),
  });
  assert.equal(both.outcome, "answered", both.reason ?? "");
  const probes = both.judgeContext?.pathProbes ?? [];
  assert.equal(probes.find((probe) => probe.path === "角色卡/implementer/role-card.md")?.allowed, true);
  assert.equal(probes.find((probe) => probe.path === "角色卡/implementer/boundary.yaml")?.allowed, true);
  assert.equal(probes.length, 2, "逐条声明路径都要有探针");
});

test("模块口径：一人多模块（同父兄弟目录）⇒ allowedPathRoots 为名下模块目录并集", async () => {
  const siblingRoster = [
    "---",
    "schema: project-roster/v2",
    "flowId: focus",
    "version: 1",
    "intent: docs/product/focus-intent-v1.md",
    "proposal: docs/proposals/focus-proposal-v1.md",
    "architecture: docs/contracts/focus-architecture-v1.md",
    "roles:",
    "  - id: implementer",
    "    displayName: 实现者",
    "    purpose: 实现",
    "    capability: TS",
    "    modules:",
    "      - bill-a",
    "      - bill-b",
    "  - id: qa",
    "    displayName: 测试",
    "    purpose: 核对",
    "    capability: 测试",
    "    modules:",
    "      - qa-suite",
    "modules:",
    "  - id: bill-a",
    "    name: 计费 A",
    "    purpose: 实现 A",
    "    directory: src/bill/a",
    "    publicContract: src/bill/a/index.js",
    "    architectureSource: docs/contracts/focus-architecture-v1.md",
    "  - id: bill-b",
    "    name: 计费 B",
    "    purpose: 实现 B",
    "    directory: src/bill/b",
    "    publicContract: src/bill/b/index.js",
    "    architectureSource: docs/contracts/focus-architecture-v1.md",
    "  - id: qa-suite",
    "    name: 测试",
    "    purpose: 独立测试",
    "    directory: test/",
    "    publicContract: test/",
    "    architectureSource: docs/contracts/focus-architecture-v1.md",
    "---",
    "# 名单",
    "## 人员+模块拓扑图",
    "```topology",
    "modules:",
    "  - id: bill-a",
    "    directory: src/bill/a/",
    "    roleId: implementer",
    "  - id: bill-b",
    "    directory: src/bill/b/",
    "    roleId: implementer",
    "  - id: qa-suite",
    "    directory: test/",
    "    roleId: qa",
    "roles:",
    "  - id: implementer",
    "    modules: [bill-a, bill-b]",
    "  - id: qa",
    "    modules: [qa-suite]",
    "management: [convener, implementer, qa]",
    "```",
  ].join("\n");
  const both = await appointmentWriteOutcome(
    [boundaryPath("src/bill/a"), boundaryPath("src/bill/b")],
    undefined,
    { rosterText: siblingRoster },
  );
  assert.equal(both.outcome, "answered", both.reason ?? "");
  const roots = both.judgeContext?.allowedPathRoots ?? [];
  assert.ok(roots.includes("角色卡/implementer/"));
  assert.ok(roots.includes("src/bill/a/"));
  assert.ok(roots.includes("src/bill/b/"));

  const outside = await appointmentWriteOutcome(
    [boundaryPath("src/other/")],
    undefined,
    { rosterText: siblingRoster },
  );
  assert.equal(outside.outcome, "declined");
  assert.equal(outside.notPresented, true);
  assert.match(outside.reason ?? "", /授权目录|名单/);
});

test("BUG-3：appointment-write 缺 targetRoleId ⇒ 结构校验拒绝，不触碰客户、无 judgeContext", async () => {
  const missing = await appointmentWriteOutcome([boundaryPath("src/")], {
    flowId: "focus",
    intentId: "focus",
    decisionId: "decision-req-d3",
  });
  assert.equal(missing.outcome, "declined");
  assert.equal(missing.notPresented, true);
  assert.match(missing.reason ?? "", /targetRoleId/);
  assert.equal(missing.rawCalls, 0, "缺 targetRoleId 不向客户发卡");
  assert.equal(missing.judgeContext, undefined);
});
