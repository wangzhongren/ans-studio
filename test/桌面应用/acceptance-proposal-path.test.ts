// test/桌面应用/acceptance-proposal-path.test.ts
// 2026-11-01（acceptance-evidence-path A1；方案 P1.2 §2.2/§3.1/§5.1；V1 AC-1–AC-6）：
// 验收 judgeContext 的 proposalPath 派生（session 集成，自包含最小夹具）——
// T1 pinned manifest 优先且磁盘更新版本不覆盖；T1b pinned 无 proposal（null/缺失/空串）⇒ undefined 不回退；
// T2 无 pin 取数字最大 `docs/proposals/<flowId>-proposal-vN.md`（别名不选）；T2b 无 pin 仅别名 ⇒ undefined；
// T3 无提案 ⇒ undefined（继承旧值被覆盖）且证据包 artifact-missing 文案正确；
// T4 试跑形状（pinned 真提案 + 别名）⇒ 证据包读真路径/sha256，别名不进入 evidence；
// T5 pinned 路径不可读 ⇒ artifact-missing「物证不可读：<pinned path>」，不回退最新/别名。
// 本文件不抽共享 helper、不改 run-pin/acceptance-evidence；夹具自包含。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import { buildDecisionEvidencePacket } from "../../src/common/编排/governance-judge-evidence.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputRequest,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const FLOW = "focus";
const INTENT_ID = "intent-focus-v1";
const PINNED_RUN_ID = "run-20261101-focus-a1test01";

// —————————————————————— 最小项目夹具 ——————————————————————

interface FixtureProposal {
  name: string;
  version: number;
}

interface FixtureOptions {
  /** `docs/proposals/` 下要写的提案文件（`<flowId>-proposal-vN.md` 命名）。 */
  proposals?: FixtureProposal[];
  /** 额外写旧约定别名 `docs/proposals/<flowId>-v1.md`（不是 `-proposal-` 命名）。 */
  alias?: boolean;
  /** 要写的 `docs/intents/<intentId>.md`（证据包意图基准；按场景需要给出）。 */
  intentEntries?: string[];
  /** 质检报告（默认写）。 */
  report?: boolean;
}

async function writeFixture(root: string, opts: FixtureOptions = {}): Promise<void> {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text, "utf8");
  };
  await write(
    `docs/product/${FLOW}-intent-v1.md`,
    ["---", `intentId: ${INTENT_ID}`, `flowId: ${FLOW}`, "version: 1", "---", "# 产品意图", "", "目标：番茄钟。", ""].join("\n"),
  );
  for (const proposal of opts.proposals ?? []) {
    await write(
      `docs/proposals/${proposal.name}`,
      [
        "---",
        "schema: project-proposal/v2",
        `flowId: ${FLOW}`,
        `version: ${proposal.version}`,
        `intentId: ${INTENT_ID}`,
        `intent: docs/product/${FLOW}-intent-v1.md`,
        "---",
        `# 提案 v${proposal.version}`,
        "",
      ].join("\n"),
    );
  }
  if (opts.alias === true) {
    await write(
      `docs/proposals/${FLOW}-v1.md`,
      ["---", "schema: project-proposal-entry/v1", `flowId: ${FLOW}`, `entryOf: docs/proposals/${FLOW}-proposal-v1.md`, "---", "# 方案入口（别名）", ""].join("\n"),
    );
  }
  if (opts.report !== false) {
    await write(`docs/quality/${FLOW}-report-v1.md`, "# 质检报告\n\nAC-1..AC-5 通过。\n");
  }
  for (const intentId of opts.intentEntries ?? []) {
    await write(
      `docs/intents/${intentId}.md`,
      [
        "---",
        `intentId: ${intentId}`,
        `flowId: ${FLOW}`,
        "goal: 示例目标",
        "scope: 示例范围",
        "acceptance: 示例验收",
        "---",
        "# 意图入口",
        "",
      ].join("\n"),
    );
  }
}

/** 合法最小 pinned manifest（`schema: ans-run/v1`、`state: pinned`；文档引用按场景给出）。 */
async function writePinnedManifest(root: string, proposal: RunManifest["documents"]["proposal"] | undefined): Promise<void> {
  const at = "2026-11-01T00:00:00.000Z";
  const manifest: RunManifest = {
    schema: "ans-run/v1",
    runId: PINNED_RUN_ID,
    flowId: FLOW,
    state: "pinned",
    createdAt: at,
    updatedAt: at,
    pinnedAt: at,
    pinnedBy: "app",
    schemas: { run: "ans-run/v1" },
    documents: proposal === undefined ? {} : { proposal },
    execution: { teamPlan: null, flow: null },
  };
  const written = await writeRunManifest(root, manifest);
  assert.equal(written.ok, true, written.ok ? "" : written.reason);
}

// —————————————————————— 最小 listing / 会话夹具 ——————————————————————

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("verifier", "verification"), builtIn("product", "product"), builtIn("rapporteur", "proposal")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface CaptureSink {
  metadata?: CustomerInputMetadata;
}

function harness(root: string, sink: CaptureSink) {
  const channels: Record<string, CustomerInputFn | undefined> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      channels[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => {
      throw new Error("no demo");
    },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    customerInput: async (_request, _context, metadata) => {
      sink.metadata = metadata;
      return { outcome: "declined", operatorId: "test" };
    },
  });
  return { mgr, channels };
}

function acceptanceRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    cardKind: "acceptance",
    flowId: FLOW,
    title: "验收核对",
    options: [
      { id: "accept", label: "通过", recommended: true },
      { id: "reject", label: "不通过" },
    ],
  };
}

/** 经真实会话注入的 customerInput 触发 `enrichAcceptanceJudgeContext`，返回 enrichment 后的 metadata。 */
async function captureJudgeContextMetadata(root: string, metadata?: CustomerInputMetadata): Promise<CustomerInputMetadata> {
  const sink: CaptureSink = {};
  const h = harness(root, sink);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
    await tick(30);
    const channel = h.channels.verifier;
    assert.equal(typeof channel, "function", "verifier 会话应注入 customerInput 通道");
    if (channel === undefined) throw new Error("verifier customerInput 缺失");
    await channel(acceptanceRequest(), metadata);
    assert.notEqual(sink.metadata, undefined, "客户通道应收到 enrichment 后的 metadata");
    return sink.metadata as CustomerInputMetadata;
  } finally {
    await h.mgr.stop(null);
    await tick(20);
  }
}

function proposalPathOf(metadata: CustomerInputMetadata): string | undefined {
  return metadata.judgeContext?.artifacts?.proposalPath;
}

/** 用捕获到的 judgeContext 拼成 GovernanceJudgeRequest（与桌面/编排同一契约形状）。 */
function judgeRequestOf(root: string, metadata: CustomerInputMetadata): GovernanceJudgeRequest {
  const ctx = metadata.judgeContext;
  assert.notEqual(ctx, undefined, "judgeContext 必须存在");
  if (ctx === undefined) throw new Error("judgeContext 缺失");
  const facts = ctx.facts ?? {
    governanceModel: "trio" as const,
    flowId: FLOW,
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [] as string[],
  };
  return {
    group: "decision",
    cardKind: "acceptance",
    roleId: "verifier",
    projectRoot: root,
    runtime: "demo",
    governanceModel: "trio",
    flowId: FLOW,
    card: acceptanceRequest(),
    ...(ctx.artifacts !== undefined ? { artifacts: ctx.artifacts } : {}),
    facts,
    at: "2026-11-01T00:00:00.000Z",
  };
}

async function withProject(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-proposal-"));
  try {
    await fn(root);
  } finally {
    await tick(30);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

// —————————————————————— T1 / T1b：pinned 优先 ——————————————————————

test("T1：pinned run 的 manifest proposal 路径优先——磁盘更新版本/别名不覆盖", async () => {
  await withProject(async (root) => {
    await writeFixture(root, {
      proposals: [
        { name: `${FLOW}-proposal-v2.md`, version: 2 },
        { name: `${FLOW}-proposal-v3.md`, version: 3 },
      ],
      alias: true,
    });
    await writePinnedManifest(root, { path: `docs/proposals/${FLOW}-proposal-v2.md` });
    const metadata = await captureJudgeContextMetadata(root);
    assert.equal(proposalPathOf(metadata), `docs/proposals/${FLOW}-proposal-v2.md`);
    assert.notEqual(proposalPathOf(metadata), `docs/proposals/${FLOW}-proposal-v3.md`);
    assert.notEqual(proposalPathOf(metadata), `docs/proposals/${FLOW}-v1.md`);
  });
});

test("T1b：pinned 但 manifest 无 proposal（null/缺失/空串）⇒ undefined，不回退最新扫描/别名", async () => {
  const variants: Array<{ label: string; proposal: RunManifest["documents"]["proposal"] | undefined }> = [
    { label: "null", proposal: null },
    { label: "missing", proposal: undefined },
    { label: "empty", proposal: { path: "" } },
  ];
  for (const variant of variants) {
    await withProject(async (root) => {
      // 磁盘同时放 v2/v3 与别名：若实现回退扫描，捕获值不可能为 undefined（无需 spy 即可区分）。
      await writeFixture(root, {
        proposals: [
          { name: `${FLOW}-proposal-v2.md`, version: 2 },
          { name: `${FLOW}-proposal-v3.md`, version: 3 },
        ],
        alias: true,
      });
      await writePinnedManifest(root, variant.proposal);
      const metadata = await captureJudgeContextMetadata(root);
      assert.equal(proposalPathOf(metadata), undefined, variant.label);
    });
  }
});

// —————————————————————— T2 / T2b：无 pin 时最新版本 ——————————————————————

test("T2：无 pin 取数字最大 -proposal-vN；别名 <flowId>-v1.md 不选", async () => {
  await withProject(async (root) => {
    await writeFixture(root, {
      proposals: [
        { name: `${FLOW}-proposal-v1.md`, version: 1 },
        { name: `${FLOW}-proposal-v2.md`, version: 2 },
        { name: `${FLOW}-proposal-v3.md`, version: 3 },
      ],
      alias: true,
    });
    const metadata = await captureJudgeContextMetadata(root);
    assert.equal(proposalPathOf(metadata), `docs/proposals/${FLOW}-proposal-v3.md`);
    assert.notEqual(proposalPathOf(metadata), `docs/proposals/${FLOW}-v1.md`);
  });
});

test("T2b：无 pin 且仅有别名 <flowId>-v1.md ⇒ undefined", async () => {
  await withProject(async (root) => {
    await writeFixture(root, { alias: true });
    const metadata = await captureJudgeContextMetadata(root);
    assert.equal(proposalPathOf(metadata), undefined);
  });
});

// —————————————————————— T3：无提案 ⇒ 缺失 + 正确文案 ——————————————————————

test("T3：无提案 ⇒ undefined（继承旧值被覆盖）；证据包 artifact-missing 且指向正确约定路径", async () => {
  await withProject(async (root) => {
    await writeFixture(root, { alias: true, intentEntries: [FLOW] });
    // 预置旧值：enrich 必须显式覆盖，不得保留继承的旧 proposalPath。
    const metadata = await captureJudgeContextMetadata(root, {
      judgeContext: {
        flowId: FLOW,
        facts: { governanceModel: "trio", flowId: FLOW, ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
        artifacts: { proposalPath: `docs/proposals/${FLOW}-v1.md` },
      },
    });
    assert.equal(proposalPathOf(metadata), undefined);

    const out = await buildDecisionEvidencePacket({ request: judgeRequestOf(root, metadata), projectRoot: root });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reasonCode, "artifact-missing");
    assert.match(out.reason, /规范物证缺失：/);
    assert.ok(out.reason.includes(`docs/proposals/${FLOW}-proposal-v1.md`), out.reason);
    assert.ok(out.reason.includes("（判断无法核对）"), out.reason);
    assert.ok(!out.reason.includes(`docs/proposals/${FLOW}-v1.md`), out.reason);
  });
});

// —————————————————————— T4：试跑形状（pinned 真提案 + 别名） ——————————————————————

test("T4：试跑形状（pinned 真提案 + 别名）⇒ 证据包读取真路径/sha256，别名不进入 evidence", async () => {
  await withProject(async (root) => {
    await writeFixture(root, {
      proposals: [
        { name: `${FLOW}-proposal-v2.md`, version: 2 },
        { name: `${FLOW}-proposal-v3.md`, version: 3 },
      ],
      alias: true,
      intentEntries: [INTENT_ID],
    });
    const realPath = `docs/proposals/${FLOW}-proposal-v2.md`;
    await writePinnedManifest(root, { path: realPath });
    const metadata = await captureJudgeContextMetadata(root);
    assert.equal(proposalPathOf(metadata), realPath);

    const out = await buildDecisionEvidencePacket({ request: judgeRequestOf(root, metadata), projectRoot: root });
    assert.equal(out.ok, true, out.ok ? "" : out.reason);
    if (!out.ok) return;
    const proposalEntry = out.packet.evidence.find((entry) => entry.kind === "proposal");
    assert.notEqual(proposalEntry, undefined, "证据包应包含 proposal 物证");
    if (proposalEntry === undefined) return;
    assert.equal(proposalEntry.path, realPath);
    const bytes = await fs.readFile(path.join(root, realPath));
    assert.equal(proposalEntry.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(proposalEntry.bytes, bytes.byteLength);
    assert.ok(out.packet.evidence.every((entry) => entry.path !== `docs/proposals/${FLOW}-v1.md`), "别名不得进入 evidence");
    assert.ok(out.packet.evidence.every((entry) => entry.path !== `docs/proposals/${FLOW}-proposal-v3.md`), "磁盘更新版本不得进入 evidence");
  });
});

// —————————————————————— T5：pinned 路径不可读 ⇒ 不回退 ——————————————————————

test("T5：pinned 路径不可读（pin 后删除）⇒ artifact-missing「物证不可读：<pinned path>」，不回退 v2/别名", async () => {
  await withProject(async (root) => {
    await writeFixture(root, {
      proposals: [
        { name: `${FLOW}-proposal-v2.md`, version: 2 },
        { name: `${FLOW}-proposal-v3.md`, version: 3 },
      ],
      alias: true,
      // 提案文件被删除后，证据包意图解析按 flow-id 回落 → docs/intents/focus.md。
      intentEntries: [FLOW],
    });
    const pinnedPath = `docs/proposals/${FLOW}-proposal-v2.md`;
    await writePinnedManifest(root, { path: pinnedPath });
    await fs.unlink(path.join(root, pinnedPath));

    const metadata = await captureJudgeContextMetadata(root);
    assert.equal(proposalPathOf(metadata), pinnedPath);

    const out = await buildDecisionEvidencePacket({ request: judgeRequestOf(root, metadata), projectRoot: root });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reasonCode, "artifact-missing");
    assert.ok(out.reason.includes(`物证不可读：${pinnedPath}`), out.reason);
    assert.ok(!out.reason.includes(`docs/proposals/${FLOW}-proposal-v3.md`), out.reason);
    assert.ok(!out.reason.includes(`docs/proposals/${FLOW}-v1.md`), out.reason);
  });
});
