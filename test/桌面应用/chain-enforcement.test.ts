// test/桌面应用/chain-enforcement.test.ts
// 2026-10-29（方案 v2.1 §5/§7.2 P1/P3/P4；拓扑 v4.1）：五步链机械前置与报告路由的桌面端回归——
//   · M1/M2/M5/M6/M7/M8：派发矩阵 + **拒绝在 task.created 之前**（负例 tasks.jsonl 行数不变）；
//   · 交付标记 stepId=project-handoff 与 task.created.from=chief/convener；
//   · 任务绑定报告按 task.created.from 路由（运营派 → 运营；幕僚派 → 幕僚）；
//   · M11：D3 名单版本/hash 与最新名单不一致 ⇒ appointment-write 被拒（旧 D3 作废）。
// 全程 SessionManager + 假会话句柄 + 临时项目文件；不启动 Electron、不触网、不写仓库。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import { recordVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  CustomerInputFn,
  CustomerInputRequest,
  DispatchReceipt,
  DispatchTaskFn,
  EvidenceCheckFn,
} from "../../src/model/runtime.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

async function waitUntilAsync(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

async function readDiagnostics(directory: string): Promise<string> {
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch {
    return "";
  }
  const texts = await Promise.all(
    names.filter((name) => name.endsWith(".jsonl")).map((name) => fs.readFile(path.join(directory, name), "utf8")),
  );
  return texts.join("\n");
}

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "envBootstrapOmittedReason: 最小链测试夹具省略装配/入口角色",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现番茄钟",
  "    capability: TypeScript",
  "    modules:",
  "      - impl-core",
  "      - impl-file",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 质量核对",
  "    capability: 测试",
  "    modules:",
  "      - qa-suite",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现番茄钟",
  "    path: src/",
    "    category: core",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: impl-file",
  "    name: 构建脚本",
  "    purpose: 构建",
  "    path: scripts/build.mjs",
    "    category: core",
  "    publicContract: scripts/build.mjs",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 独立测试",
  "    path: test/",
    "    category: core",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: impl-file",
  "    path: scripts/build.mjs",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core, impl-file]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

async function writeProjectFiles(root: string): Promise<void> {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text, "utf8");
  };
  await write("docs/product/focus-intent-v1.md", "# 产品意图\n\n目标：番茄钟。\n");
  await write("docs/proposals/focus-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n");
  await write("docs/proposals/focus-roster-v1.md", ROSTER_TEXT);
  const parsedRoster = parseProjectRoster(ROSTER_TEXT);
  if (!parsedRoster.ok) throw new Error(`fixture roster invalid: ${parsedRoster.reason}`);
  await write(
    "docs/proposals/focus-modules-v1.md",
    [
      "---",
      "schema: project-modules/v2",
      "flowId: focus",
      "version: 1",
      `modules: ${JSON.stringify(parsedRoster.roster.modules)}`,
      "---",
      "# 模块清单",
    ].join("\n"),
  );
  await write("docs/contracts/focus-architecture-v1.md", "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n");
  await write("docs/quality/focus-report-v1.md", "# 质检报告\n\n通过。\n");
  await write("角色卡/implementer/role-card.md", "# 角色：实现者\n");
  await write("角色卡/implementer/boundary.yaml", "role: implementer\nentries: []\n");
  // 测试夹具直接写盘：模拟属主写成功后 guard 的版本登记入口。
  await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
}

function listing(root: string, verifierBoundaryPath = "test/"): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  const verifier = builtIn("verifier", "verification");
  verifier.boundary = {
    entries: [{ root: "project", path: verifierBoundaryPath, kind: "directory", purpose: "evidence" }],
    boundarySource: `<built-in:verifier:${verifierBoundaryPath}>`,
    acceptance: { accepted: false, source: "" },
  };
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `${roleId === "qa" ? "test" : "src"}/`, kind: "directory", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      verifier,
      worker("implementer"),
      worker("qa"),
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  caps: Record<string, DispatchTaskFn | undefined>;
  customerInputs: Record<string, CustomerInputFn | undefined>;
  evidenceChecks: Record<string, EvidenceCheckFn | undefined>;
  sendOptions: Record<string, RoleSessionSendOptions[]>;
}

/**
 * B7.1（2026-11-11）：本套件验证 **legacy 招人链/前置校验**旧行为；空 trio 项目聊天自 B6.1 起默认为
 * fixed，而 B7.1 起 fixed 聊天拒绝普通星形派发 ⇒ 夹具显式写明「旧项目」（断言不改，仅固定项目模式）。
 */
function markLegacyProject(root: string): void {
  mkdirSync(path.join(root, ".ans"), { recursive: true });
  writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
}

function harness(root: string, options: { verifierBoundaryPath?: string } = {}): Harness {
  markLegacyProject(root);
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const evidenceChecks: Record<string, EvidenceCheckFn | undefined> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      customerInputs[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
      evidenceChecks[input.roleId] = (input as { evidenceCheck?: EvidenceCheckFn }).evidenceCheck;
      const handle: RoleSessionHandle = {
        async send(text, options) {
          (sent[input.roleId] ??= []).push(text);
          (sendOptions[input.roleId] ??= []).push(options ?? {});
        },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 100; tries += 1) {
                    const arr = streams[input.roleId] ?? [];
                    if (i < arr.length) return { value: arr[i++]!, done: false };
                    await tick(5);
                  }
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
    getListing: (r) => (r === root ? listing(root, options.verifierBoundaryPath) : undefined),
    emitEvent: () => {},
    // 客户通道桩（本文件只验证应用层前置；通道本身不参与判定）。
    customerInput: async () => ({ outcome: "declined", operatorId: "test-channel" }),
  });
  return { mgr, streams, sent, caps, customerInputs, evidenceChecks, sendOptions };
}

async function d3Fixture(root: string, selected: string[], rosterVersion = 1): Promise<void> {
  const rosterBytes = await fs.readFile(path.join(root, "docs/proposals/focus-roster-v1.md"));
  await appendTaskEvent(root, {
    v: 1,
    at: "2026-10-29T00:00:00.000Z",
    kind: "request.created",
    requestId: "req-d3",
    flowId: "focus",
    intentId: "focus",
    sourceRoleId: "nominator",
    title: "D3 招人决定",
    options: selected.map((id) => ({ id, label: id })),
  });
  await appendTaskEvent(root, {
    v: 1,
    at: "2026-10-29T00:00:01.000Z",
    kind: "request.resolved",
    requestId: "req-d3",
    decisionId: "decision-req-d3",
    intentId: "focus",
    targetRoleIds: selected,
    rosterVersion,
    rosterSha256: createHash("sha256").update(rosterBytes).digest("hex"),
    by: "judge",
    choice: selected.join(","),
  });
}

/**
 * B3-4（2026-11-12）：v2.0.0 生产门要求文档/团队准备派发来自「已登记项目生命周期 + 当前 accepted 客户轮次 +
 * 真实管理会话证据」（`app/desktop/session.ts:9620-9656`；worker 派发见 `:9519-9521`）。本套件 harness
 * （`:227-279`）桩掉 `openRoleSession`、没有 `getRegisteredProjectLifecycle`、也没有真实 running origin——
 * 伪造这些宿主事实会削弱门禁，因此 dispatch 必须 fail-closed。统一钉住：拒绝码 + 任务账本零新增 + 目标零投递
 * （主断言保留在同一强度：拒绝而不是伪造受理）。
 */
async function assertDispatchRefused(
  root: string,
  h: Harness,
  receipt: DispatchReceipt,
  targetRoleId: string,
  code: RegExp,
  label: string,
): Promise<void> {
  assert.equal(receipt.ok, false, `${label}：v2.0.0 来源门必须 fail-closed（裸夹具不得伪造受理）`);
  assert.match(receipt.message ?? "", code, `${label}：拒绝码应为 ${String(code)}`);
  assert.equal((await readTaskState(root)).records.size, 0, `${label}：拒绝不写任务账本`);
  assert.equal((h.sent[targetRoleId] ?? []).length, 0, `${label}：拒绝不投递`);
}

/**
 * 2026-10-31（D3 卡种收口）：任意 choice 卡的账本序列。
 * 用于模拟历史污染（旧写侧把选项写进 targetRoleIds）与新格式事件（cardKind 显式落账）。
 */
async function choiceResolution(
  root: string,
  opts: {
    requestId: string;
    flowId: string;
    title: string;
    selected: string[];
    atCreated: string;
    atResolved: string;
    cardKind?: "proposal" | "appointment" | "acceptance" | "intent-confirm" | "decision";
    rosterStamp?: { version: number; sha256: string };
  },
): Promise<void> {
  await appendTaskEvent(root, {
    v: 1,
    at: opts.atCreated,
    kind: "request.created",
    requestId: opts.requestId,
    flowId: opts.flowId,
    ...(opts.cardKind !== undefined ? { cardKind: opts.cardKind } : {}),
    sourceRoleId: "convener",
    title: opts.title,
    options: opts.selected.map((id) => ({ id, label: id })),
  });
  await appendTaskEvent(root, {
    v: 1,
    at: opts.atResolved,
    kind: "request.resolved",
    requestId: opts.requestId,
    decisionId: `decision-${opts.requestId}`,
    ...(opts.cardKind !== undefined ? { cardKind: opts.cardKind } : {}),
    ...(opts.rosterStamp !== undefined ? { rosterVersion: opts.rosterStamp.version, rosterSha256: opts.rosterStamp.sha256 } : {}),
    targetRoleIds: opts.selected,
    by: "judge",
    choice: opts.selected.join(","),
  });
}

test("M1/M2（v2.0.0 来源门）：裸夹具的文档准备派发 fail-closed——document-planning-source-unavailable、零任务零投递", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m1-"));
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  try {
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      const dispatch = h.caps.chief!;
      // v2.0.0（e71501c 起）：文档/团队准备派发必须来自「已登记项目生命周期 + 当前 accepted 客户轮次 +
      // 真实管理会话证据」。本套件 harness 桩掉 openRoleSession、无 getRegisteredProjectLifecycle、无真实
      // running origin——伪造这些宿主事实会削弱门禁，因此旧的「状态缺失也受理」期望不再成立。
      const noIntent = (await dispatch({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, noIntent, "rapporteur", /document-planning-source-unavailable/, "M1 缺意图");
      // 补齐意图/方案/名单后来源门仍先行：文档齐备不替代真实客户轮次。
      await writeProjectFiles(root);
      const afterDocs = (await dispatch({ roleId: "rapporteur", task: "出方案与名单（补齐后）", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, afterDocs, "rapporteur", /document-planning-source-unavailable/, "M1 文档齐备");
      // M2 同款：nominator 的人事准备也要真实来源；缺名单文本不再进入链级 advisory。
      await fs.rm(path.join(root, "docs/proposals/focus-roster-v1.md"));
      const noRoster = (await dispatch({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, noRoster, "nominator", /document-planning-source-unavailable/, "M2 缺名单");
      // 同文复派同样被来源门拒绝（不因文本相同而伪造幂等受理）。
      const duplicate = (await dispatch({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, duplicate, "nominator", /document-planning-source-unavailable/, "M2 复派");
      await flushDiagnostics();
      const diagnosticText = await readDiagnostics(diagnosticsDir);
      assert.equal(diagnosticText.includes("tasks.dispatch.advisory"), false, "来源门拒绝不产生 advisory 受理诊断");
      // M1/M2 的链级 advisory 纯逻辑覆盖保留在 test/编排/dispatch-advisories.test.ts（见 B3-4 记录）。
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await disposeDiagnostics();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("M5/M6/M7（v2.0.0 来源门）：交付与运营 worker 派发在裸夹具上 fail-closed（零任务零投递）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m5-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      const chiefDispatch = h.caps.chief!;

      // M5：幕僚→运营交付（hubPreparation）要求真实注册生命周期 + 当前 accepted 幕僚轮次；
      // 裸夹具没有这些宿主事实，必须 fail-closed（不写 task.created、不投递）。
      const handoff = (await chiefDispatch({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, handoff, "convener", /document-planning-source-unavailable/, "M5 交付");

      // 运营会话：v2.0.0 下 worker 派发要求当前运营真实受派任务（running origin + taskId + 可核验父任务）；
      // 裸夹具同样 fail-closed。能力在场 ≠ 授权（dispatchTask 仍注入）。
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(20);
      const convenerDispatch = h.caps.convener!;
      assert.equal(typeof convenerDispatch, "function", "运营持有派发能力（能力在场 ≠ 授权）");
      const toWorker = (await convenerDispatch({ roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, toWorker, "implementer", /worker-dispatch-source-unavailable/, "M5 运营→实现者");

      // 运营→内置 verifier 命中 v2.0.0 硬门「新的质检任务须由幕僚创建」——同样不建任务、不投递。
      const toVerifier = (await convenerDispatch({ roleId: "verifier", task: "验收核对", sideEffect: "read-only", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, toVerifier, "verifier", /chief-hub-review-owner-required/, "M5 运营→质检");
      // 任务模块字段/verifier 元数据的正例由账本级与固定路径专项用例覆盖；本用例不再伪造成功派发。
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("D3 卡种收口（2026-10-31，v2.0.0 来源门）：decision/intent-confirm/acceptance 裁决不能替代真实来源——交付/派发 fail-closed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-d3-cardkind-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]); // legacy 兼容：无 cardKind，带 appointment 专属 roster 戳
    const rosterBytes = await fs.readFile(path.join(root, "docs/proposals/focus-roster-v1.md"));
    const rosterStamp = { version: 1, sha256: createHash("sha256").update(rosterBytes).digest("hex") };
    // 新格式 decision 卡：即使（错误地）带 roster 戳与 targetRoleIds，且选项恰与真实角色 qa 同名，也不得被当作 D3。
    await choiceResolution(root, {
      requestId: "req-decision-qa",
      flowId: "focus",
      title: "浏览器验收方式",
      selected: ["qa"],
      cardKind: "decision",
      rosterStamp,
      atCreated: "2026-10-29T00:00:02.000Z",
      atResolved: "2026-10-29T00:00:03.000Z",
    });
    // 旧格式（无 cardKind、无 roster 戳）历史污染：customer-local 选项被写进了 targetRoleIds。
    await choiceResolution(root, {
      requestId: "req-legacy-pollution",
      flowId: "focus",
      title: "旧决策卡",
      selected: ["customer-local"],
      atCreated: "2026-10-29T00:00:04.000Z",
      atResolved: "2026-10-29T00:00:05.000Z",
    });
    // 另一张新格式 intent-confirm：confirm 选项同样不是角色。
    await choiceResolution(root, {
      requestId: "req-intent",
      flowId: "focus",
      title: "需求确认",
      selected: ["confirm"],
      cardKind: "intent-confirm",
      atCreated: "2026-10-29T00:00:06.000Z",
      atResolved: "2026-10-29T00:00:07.000Z",
    });
    // 新格式 acceptance 卡：accept/rework 选项同样不是角色。
    await choiceResolution(root, {
      requestId: "req-acceptance",
      flowId: "focus",
      title: "验收核对",
      selected: ["rework"],
      cardKind: "acceptance",
      atCreated: "2026-10-29T00:00:08.000Z",
      atResolved: "2026-10-29T00:00:09.000Z",
    });
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      // 即便账本里有一份真实形态的 D3（appointment），v2.0.0 交付仍要求真实客户轮次/注册生命周期：
      // 裸夹具必须 fail-closed——D3/其它卡种的账本存在不能替代来源门。
      const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, handoff, "convener", /document-planning-source-unavailable/, "D3 交付");
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(20);
      const toImplementer = (await h.caps.convener!({ roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, toImplementer, "implementer", /worker-dispatch-source-unavailable/, "D3 运营→实现者");
    } finally {
      await h.mgr.stop(null);
      // 2026-10-31（CI 稳定性，macOS arm64）：stop 只释放会话句柄，不等待 `void drainQueue(...)`
      // 的后台投递链（含 `task.delivered` 账本写入）。先让出一拍再删除，避免 rm 扫描后新文件落盘
      // 导致 ENOTEMPTY；配合外层带重试的 fs.rm。
      await tick(50);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("D3 卡种收口（2026-10-31，v2.0.0 来源门）：新格式 appointment 与无戳旧裁决都需真实来源——两夹具均 fail-closed", async () => {
  // B1：created.cardKind=appointment（无 roster 戳）也可作为 D3——但在 v2.0.0 来源门前仍不足以免除真实轮次。
  const rootNew = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-d3-new-"));
  try {
    await writeProjectFiles(rootNew);
    await choiceResolution(rootNew, {
      requestId: "req-new-d3",
      flowId: "focus",
      title: "D3 招人决定",
      selected: ["implementer"],
      cardKind: "appointment",
      atCreated: "2026-10-29T00:00:00.000Z",
      atResolved: "2026-10-29T00:00:01.000Z",
    });
    const hNew = harness(rootNew);
    try {
      await hNew.mgr.open({ projectRoot: rootNew, roleId: "chief", runtime: "demo" });
      await tick(20);
      const handoff = (await hNew.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(rootNew, hNew, handoff, "convener", /document-planning-source-unavailable/, "D3 appointment 交付");
    } finally {
      await hNew.mgr.stop(null);
      await tick(50); // 等后台投递链落盘后再删（见上条 ENOTEMPTY 说明）。
    }
  } finally {
    await fs.rm(rootNew, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }

  // B2：只有无 cardKind、无 roster 戳的裁决 ⇒ 不构成 D3；同时也要真实来源，裸夹具 fail-closed。
  const rootLegacy = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-d3-unstamped-"));
  try {
    await writeProjectFiles(rootLegacy);
    await choiceResolution(rootLegacy, {
      requestId: "req-unstamped",
      flowId: "focus",
      title: "旧决策卡",
      selected: ["implementer"],
      atCreated: "2026-10-29T00:00:00.000Z",
      atResolved: "2026-10-29T00:00:01.000Z",
    });
    const hLegacy = harness(rootLegacy);
    try {
      await hLegacy.mgr.open({ projectRoot: rootLegacy, roleId: "chief", runtime: "demo" });
      await tick(20);
      const handoff = (await hLegacy.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(rootLegacy, hLegacy, handoff, "convener", /document-planning-source-unavailable/, "D3 无戳旧裁决交付");
    } finally {
      await hLegacy.mgr.stop(null);
      await tick(50); // 等后台投递链落盘后再删（见上条 ENOTEMPTY 说明）。
    }
  } finally {
    await fs.rm(rootLegacy, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("M9 报告路由（v2.0.0 来源门 + 账本行为钉）：裸夹具交付 fail-closed；幕僚任务报告回幕僚、运营任务无真实子链归属不误投", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m9-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      const chiefDispatch = h.caps.chief!;
      const handoff = (await chiefDispatch({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, handoff, "convener", /document-planning-source-unavailable/, "M9 交付");

      // 报告路由按账本事实钉住：直接登记两条既有星形任务（v2.0.0 成功派发需真实生命周期/轮次，
      // 由带真实宿主来源的专项用例覆盖；本用例不伪造成功派发）。
      await appendTaskEvent(root, {
        v: 1,
        at: "2026-10-29T00:00:00.000Z",
        kind: "task.created",
        taskId: "t-m9-worker",
        from: "convener",
        to: "implementer",
        text: "实现番茄钟",
        sideEffect: "code",
        idempotencyKey: "m9-worker",
      } as never);
      await appendTaskEvent(root, {
        v: 1,
        at: "2026-10-29T00:00:01.000Z",
        kind: "task.created",
        taskId: "t-m9-report",
        from: "chief",
        to: "rapporteur",
        text: "出方案",
        sideEffect: "docs",
        idempotencyKey: "m9-report",
      } as never);
      await h.mgr.listTasks(root); // 只读载入星形任务/创建者索引（回交路由用例不依赖派发投递）

      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
      await tick(40);
      const handback: TaskHandback = {
        roleId: "implementer",
        taskId: "t-m9-worker",
        status: "completed",
        summary: "实现完成",
        evidence: ["src/app.ts"],
        at: "2026-10-29T00:10:00.000Z",
      };
      (h.streams.implementer ??= []).push({ kind: "handback", summary: "回交", handback } as OrchestrationEvent);
      // 运营创建的任务：报告必须先登记（不丢报告）；但账本没有真实子任务 parent 链 ⇒ 投递 fail-closed，
      // 不误投运营、也不越级投幕僚。正面的「回运营」投递需真实 run/子任务归属夹具（见 B3-4 记录）。
      await waitUntilAsync(async () => ((await readTaskState(root)).records.get("t-m9-worker")?.reports.length ?? 0) === 1);
      await tick(250);
      assert.equal((h.sent.convener ?? []).some((text) => text.includes("t-m9-worker")), false, "无真实子链归属不投运营（fail-closed，不误投）");
      assert.equal((h.sent.chief ?? []).some((text) => text.includes("t-m9-worker")), false, "也不得越级投给幕僚");

      // 幕僚派给策划的任务：回幕僚（creator 路由正例）。
      await h.mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" });
      await tick(40);
      (h.streams.rapporteur ??= []).push({
        kind: "handback",
        summary: "回交",
        handback: { ...handback, roleId: "rapporteur", taskId: "t-m9-report", summary: "方案完成", evidence: [], at: "2026-10-29T00:10:01.000Z" },
      } as OrchestrationEvent);
      await waitUntil(() => (h.sent.chief ?? []).some((text) => text.includes("[工作结果]") && text.includes("t-m9-report")), 5000);
      assert.equal((h.sent.convener ?? []).some((text) => text.includes("t-m9-report")), false, "幕僚任务报告不回运营");
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("M11：D3 名单版本/hash 与最新名单不一致 ⇒ appointment-write 被拒（旧 D3 作废）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m11-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" });
      await tick(20);
      const customerInput = h.customerInputs.nominator;
      assert.equal(typeof customerInput, "function", "nominator 会话应有客户通道包装");
      const request: CustomerInputRequest = {
        kind: "confirm",
        title: "写实现者角色卡",
        cardKind: "appointment-write",
        flowId: "focus",
        paths: ["角色卡/implementer/role-card.md"],
        preview: "## 角色卡/implementer/role-card.md\n# 角色：实现者\n",
      };
      const metadata = {
        flowId: "focus",
        intentId: "focus",
        targetRoleId: "implementer",
        decisionId: "decision-req-d3",
        skillRoot: root,
      };
      // 当前名单（v1）与 D3 一致 ⇒ 不发卡路径的校验通过（进入客户通道）；通道桩返回拒绝以避免真实等待。
      // 这里只验证 M11 的不一致分支：先写 v2 名单（内容变化 → 新 version/hash）。
      const rosterV2 = ROSTER_TEXT.replace("version: 1", "version: 2").replace("实现番茄钟", "实现番茄钟（改）");
      await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v2.md"), rosterV2, "utf8");
      const outcome = await customerInput!(request, metadata as never);
      assert.equal(outcome?.outcome, "declined");
      assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true, "校验失败不发卡");
      assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /名单/);
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("M11（flowId-only 匹配）：人只需带 flowId+decisionId+targetRoleId 即可匹配 D3，并按名单版本拒绝旧 D3", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m11b-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    await fs.writeFile(
      path.join(root, "docs/proposals/focus-roster-v2.md"),
      ROSTER_TEXT.replace("version: 1", "version: 2").replace("实现番茄钟", "实现番茄钟（改）"),
      "utf8",
    );
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" });
      await tick(20);
      const customerInput = h.customerInputs.nominator!;
      const outcome = await customerInput(
        {
          kind: "confirm",
          title: "写实现者角色卡",
          cardKind: "appointment-write",
          flowId: "focus",
          paths: ["角色卡/implementer/role-card.md"],
          preview: "## 角色卡/implementer/role-card.md\n# 角色：实现者\n",
        },
        { flowId: "focus", targetRoleId: "implementer", decisionId: "decision-req-d3" } as never,
      );
      assert.equal(outcome?.outcome, "declined");
      assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
      assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /名单/);
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("F4 报告路由（v2.0.0 来源门 + 账本行为钉）：裸夹具交付 fail-closed；幕僚创建报告回幕僚、运营创建在无真实子链归属时不误投", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-verifier-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      // 运营发起验收：先交付运营，再由运营派质检——两段在 v2.0.0 裸夹具上都 fail-closed。
      const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, handoff, "convener", /document-planning-source-unavailable/, "F4 交付");
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(40);
      const toVerifier = (await h.caps.convener!({ roleId: "verifier", task: "验收核对", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      await assertDispatchRefused(root, h, toVerifier, "verifier", /chief-hub-review-owner-required/, "F4 运营→质检");

      // 报告路由按账本事实钉住：登记两条既有 verifier 任务（创建者分别=运营/幕僚），
      // 不伪造成功派发（v2.0.0 成功派发需真实生命周期/轮次，由专项用例覆盖）。
      await appendTaskEvent(root, {
        v: 1,
        at: "2026-10-29T00:00:00.000Z",
        kind: "task.created",
        taskId: "t-f4-convener-verifier",
        from: "convener",
        to: "verifier",
        text: "验收核对（运营发起）",
        sideEffect: "read-only",
        idempotencyKey: "f4-convener-verifier",
      } as never);
      await appendTaskEvent(root, {
        v: 1,
        at: "2026-10-29T00:00:01.000Z",
        kind: "task.created",
        taskId: "t-f4-chief-verifier",
        from: "chief",
        to: "verifier",
        text: "复核交付（幕僚调度）",
        sideEffect: "read-only",
        idempotencyKey: "f4-chief-verifier",
      } as never);
      await h.mgr.listTasks(root); // 只读载入星形任务/创建者索引

      await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
      await tick(40);
      const handback = (taskId: string): TaskHandback => ({
        roleId: "verifier",
        taskId,
        status: "completed",
        summary: "核对通过",
        evidence: ["docs/quality/focus-report-v1.md"],
        at: "2026-10-29T00:20:00.000Z",
      });
      // 运营创建的任务：报告先登记；但账本没有真实子任务 parent 链 ⇒ 投递 fail-closed，不误投。
      (h.streams.verifier ??= []).push({ kind: "handback", summary: "回交", handback: handback("t-f4-convener-verifier") } as OrchestrationEvent);
      await waitUntilAsync(async () => ((await readTaskState(root)).records.get("t-f4-convener-verifier")?.reports.length ?? 0) === 1);
      await tick(250);
      assert.equal((h.sent.convener ?? []).some((text) => text.includes("t-f4-convener-verifier")), false, "无真实子链归属不投运营（fail-closed）");
      assert.equal((h.sent.chief ?? []).some((text) => text.includes("t-f4-convener-verifier")), false, "运营发起的报告也不得误投幕僚");
      // 幕僚创建的任务：报告回幕僚（creator 路由正例）。
      (h.streams.verifier ??= []).push({ kind: "handback", summary: "回交", handback: handback("t-f4-chief-verifier") } as OrchestrationEvent);
      await waitUntil(() => (h.sent.chief ?? []).some((text) => text.includes("[工作结果]") && text.includes("t-f4-chief-verifier")), 5000);
      assert.equal((h.sent.convener ?? []).some((text) => text.includes("t-f4-chief-verifier")), false, "幕僚调度的报告不回运营");
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("R3：evidenceScopeRoots——无 flow verifier、roster 漂移、creator 不匹配、边界兜底与 fail-closed", async () => {
  const diagnosticsDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-r3-diag-"));
  configureDiagnostics({ directory: diagnosticsDir });
  const criteriaText = [
    "# 验收标准",
    "",
    "```ans-criteria",
    "schema: ans-criteria/v1",
    "flowId: focus",
    "version: 1",
    "status: final",
    "criteria:",
    "  - id: AC-1",
    "    priority: P1",
    "    title: 模块证据",
    "```",
    "",
  ].join("\n");
  const criteriaRef = {
    path: "docs/acceptance/focus-criteria-v1.md",
    sha256: createHash("sha256").update(Buffer.from(criteriaText, "utf8")).digest("hex"),
    version: 1,
  };
  const appendCreated = async (
    root: string,
    input: { taskId: string; from: "chief" | "convener"; to: string; text: string; moduleId: string; modulePaths: string[] },
  ): Promise<void> => {
    await appendTaskEvent(root, {
      v: 1,
      at: "2026-11-02T00:00:00.000Z",
      kind: "task.created",
      taskId: input.taskId,
      from: input.from,
      to: input.to,
      text: input.text,
      sideEffect: "read-only",
      idempotencyKey: `r3-${input.taskId}`,
      moduleId: input.moduleId,
      modulePaths: input.modulePaths,
    } as never);
  };
  const prepareRoot = async (): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-r3-"));
    await writeProjectFiles(root);
    await fs.mkdir(path.join(root, "docs/acceptance"), { recursive: true });
    await fs.writeFile(path.join(root, "docs/acceptance/focus-criteria-v1.md"), criteriaText, "utf8");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src/evidence.txt"), "module evidence\n", "utf8");
    await fs.mkdir(path.join(root, "test"), { recursive: true });
    await fs.writeFile(path.join(root, "test/evidence.txt"), "qa evidence\n", "utf8");
    await fs.mkdir(path.join(root, "scripts/generated"), { recursive: true });
    await fs.writeFile(path.join(root, "scripts/generated/report.txt"), "drift evidence\n", "utf8");
    await fs.mkdir(path.join(root, "outside/r3"), { recursive: true });
    await fs.writeFile(path.join(root, "outside/r3/evidence.txt"), "outside evidence\n", "utf8");
    await fs.mkdir(path.join(root, "docs/quality"), { recursive: true });
    await fs.writeFile(path.join(root, "docs/outside.txt"), "outside\n", "utf8");
    return root;
  };
  const check = async (
    root: string,
    roleId: string,
    artifact: string,
    options: { verifierBoundaryPath?: string } = {},
  ): Promise<{ manager: SessionManager; result: Record<string, unknown> }> => {
    const h = harness(root, options);
    await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
    await tick(20);
    const fn = h.evidenceChecks[roleId];
    assert.equal(typeof fn, "function", `evidenceCheck 注入 ${roleId}`);
    const raw = await fn!({ criteriaRef, artifact });
    return { manager: h.mgr, result: JSON.parse(String(raw)) as Record<string, unknown> };
  };

  const rootA = await prepareRoot();
  try {
    await appendCreated(rootA, {
      taskId: "t-r3-chief-verifier",
      from: "chief",
      to: "verifier",
      text: "chief 验收",
      moduleId: "impl-core",
      modulePaths: ["src/"],
    });
    await appendCreated(rootA, {
      taskId: "t-r3-bad-creator",
      from: "chief",
      to: "implementer",
      text: "chief 派 worker",
      moduleId: "impl-core",
      modulePaths: ["outside/r3/"],
    });
    // chief→verifier 无 flow 正例：任务 modulePaths 贡献证据根。
    const chiefVerifier = await check(rootA, "verifier", "src/evidence.txt");
    try {
      assert.equal(chiefVerifier.result["ok"], true, JSON.stringify(chiefVerifier.result));
    } finally {
      await chiefVerifier.manager.stop(null);
    }
    // creator 不匹配负例：implementer 的 chief 来源任务不贡献 root。
    const badCreator = await check(rootA, "implementer", "outside/r3/evidence.txt");
    try {
      assert.equal(badCreator.result["ok"], false, JSON.stringify(badCreator.result));
      assert.equal(badCreator.result["code"], "evidence-scope-denied");
    } finally {
      await badCreator.manager.stop(null);
    }
    // roster 漂移：移除最新 roster 后，无 flow verifier 任务仍以 modulePaths 贡献根。
    await appendCreated(rootA, {
      taskId: "t-r3-drift",
      from: "convener",
      to: "verifier",
      text: "convener 验收",
      moduleId: "impl-file",
      modulePaths: ["scripts/generated/"],
    });
    await fs.rm(path.join(rootA, "docs/proposals/focus-roster-v1.md"));
    const drift = await check(rootA, "verifier", "scripts/generated/report.txt");
    try {
      assert.equal(drift.result["ok"], true, JSON.stringify(drift.result));
    } finally {
      await drift.manager.stop(null);
    }
  } finally {
    await fs.rm(rootA, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 边界兜底：无任务 modulePaths，但角色边界 test/ 位于 roster 模块 test/ 内 → 接受并记录来源。
  const rootC = await prepareRoot();
  try {
    await appendTaskEvent(rootC, {
      v: 1,
      at: "2026-11-02T00:00:00.000Z",
      kind: "task.created",
      taskId: "t-r3-boundary",
      from: "chief",
      to: "verifier",
      text: "无模块验收",
      sideEffect: "read-only",
      idempotencyKey: "r3-boundary",
    } as never);
    const boundary = await check(rootC, "verifier", "test/evidence.txt");
    try {
      assert.equal(boundary.result["ok"], true, JSON.stringify(boundary.result));
    } finally {
      await boundary.manager.stop(null);
    }
    await flushDiagnostics();
    const diagnosticsText = await readDiagnostics(diagnosticsDir);
    assert.ok(diagnosticsText.includes("evidence.scope.boundary-fallback"), "边界兜底记录来源");
  } finally {
    await fs.rm(rootC, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 无根 fail-closed：verifier 边界 docs/ 不在 roster 模块内，且任务无 modulePaths。
  const rootD = await prepareRoot();
  try {
    await appendTaskEvent(rootD, {
      v: 1,
      at: "2026-11-02T00:00:00.000Z",
      kind: "task.created",
      taskId: "t-r3-noroot",
      from: "chief",
      to: "verifier",
      text: "无根验收",
      sideEffect: "read-only",
      idempotencyKey: "r3-noroot",
    } as never);
    const noRoot = await check(rootD, "verifier", "docs/outside.txt", { verifierBoundaryPath: "docs/" });
    try {
      assert.equal(noRoot.result["ok"], false, JSON.stringify(noRoot.result));
      assert.equal(noRoot.result["code"], "evidence-scope-denied");
    } finally {
      await noRoot.manager.stop(null);
    }
  } finally {
    await disposeDiagnostics();
    await fs.rm(rootD, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await fs.rm(diagnosticsDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
