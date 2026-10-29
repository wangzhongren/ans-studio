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

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v1",
  "flowId: focus",
  "version: 1",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    directories:",
  "      - src/",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    directories:",
  "      - test/",
  "---",
  "# 名单",
].join("\n");

function trioProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-appointment-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "proposals", "focus-roster-v1.md"), ROSTER_TEXT, "utf8");
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

async function appointmentWriteOutcome(entries: string[]): Promise<{ outcome?: string; notPresented?: boolean; reason?: string; rawCalls: number }> {
  const project = trioProject();
  try {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
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
        paths: ["角色卡/implementer/boundary.yaml"],
        preview: boundaryPreview(entries),
      },
      { flowId: "focus", intentId: "focus", targetRoleId: "implementer", decisionId: "decision-req-d3" },
    );
    await handle.dispose();
    return {
      outcome: out?.outcome,
      notPresented: out?.outcome === "declined" ? out.notPresented : undefined,
      reason: out?.outcome === "declined" ? out.reason : undefined,
      rawCalls,
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
});
