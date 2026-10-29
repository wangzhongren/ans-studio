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
} from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(h: { streams: Record<string, OrchestrationEvent[]> }, ...roles: string[]): Promise<void> {
  for (const role of roles) {
    (h.streams[role] ??= []).push({ kind: "settled", summary: "完成" } as OrchestrationEvent);
  }
  await tick(40);
}

async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

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
  "    purpose: 实现番茄钟",
  "    capability: TypeScript",
  "    modules:",
  "      - impl-core",
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
  "    directory: src/",
  "    publicContract: src/index.ts",
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

async function writeProjectFiles(root: string): Promise<void> {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text, "utf8");
  };
  await write("docs/product/focus-intent-v1.md", "# 产品意图\n\n目标：番茄钟。\n");
  await write("docs/proposals/focus-proposal-v1.md", "# 提案\n\nintent: docs/product/focus-intent-v1.md\n");
  await write("docs/proposals/focus-roster-v1.md", ROSTER_TEXT);
  const parsedRoster = parseProjectRoster(ROSTER_TEXT);
  if (!parsedRoster.ok) throw new Error(`fixture roster invalid: ${parsedRoster.reason}`);
  await write(
    "docs/proposals/focus-modules-v1.md",
    [
      "---",
      "schema: project-modules/v1",
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
      builtIn("verifier", "verification"),
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
  sendOptions: Record<string, RoleSessionSendOptions[]>;
}

function harness(root: string): Harness {
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      customerInputs[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
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
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    // 客户通道桩（本文件只验证应用层前置；通道本身不参与判定）。
    customerInput: async () => ({ outcome: "declined", operatorId: "test-channel" }),
  });
  return { mgr, streams, sent, caps, customerInputs, sendOptions };
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

test("M1/M2：幕僚跳步被拒（意图/名单缺失），拒绝在 task.created 之前；补齐后受理", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m1-"));
  try {
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      const dispatch = h.caps.chief!;
      // M1 缺意图 → 拒，无任务行。
      const noIntent = (await dispatch({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(noIntent.ok, false);
      assert.match(noIntent.message ?? "", /意图/);
      assert.equal((await readTaskState(root)).records.size, 0, "拒绝不产生 task.created");

      // 补意图 → 受理（from=chief、flowId 落盘）。
      await writeProjectFiles(root);
      const toRapporteur = (await dispatch({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(toRapporteur.ok, true, toRapporteur.message ?? "");
      const state1 = await readTaskState(root);
      assert.equal(state1.records.size, 1);
      const created = [...state1.records.values()][0]!.created!;
      assert.equal(created.from, "chief");
      assert.equal(created.to, "rapporteur");
      assert.equal(created.flowId, "focus");

      // M2：缺方案/名单时派人事被拒（先删名单再试）。
      await fs.rm(path.join(root, "docs/proposals/focus-roster-v1.md"));
      const noRoster = (await dispatch({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(noRoster.ok, false);
      assert.match(noRoster.message ?? "", /名单/);
      assert.equal((await readTaskState(root)).records.size, 1, "拒绝仍不产生新任务行");
      // 恢复名单 → 受理。
      await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v1.md"), ROSTER_TEXT, "utf8");
      const toNominator = (await dispatch({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(toNominator.ok, true, toNominator.message ?? "");

      // R9：已记录版本化文档被外部修改（shell/手动）⇒ 基线校验拒绝派发。
      await fs.writeFile(path.join(root, "docs/product/focus-intent-v1.md"), "# 外部篡改\n", "utf8");
      const tampered = (await dispatch({ roleId: "rapporteur", task: "出方案 v2", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(tampered.ok, false);
      assert.match(tampered.message ?? "", /基线|只读|版本化/);
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("M5/M6/M7 + 交付标记：幕僚交付运营需 D3 选中角色卡；运营派实现/质检需已接交付且目标在名单内", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-m5-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      const chiefDispatch = h.caps.chief!;

      // M5 正例：D3 选中角色卡已枚举 ⇒ 交付受理，落 stepId=project-handoff。
      const handoff = (await chiefDispatch({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      assert.equal(handoff.ok, true, handoff.message ?? "");
      const afterHandoff = await readTaskState(root);
      const handoffCreated = [...afterHandoff.records.values()].find((record) => record.created?.to === "convener")!.created!;
      assert.equal(handoffCreated.from, "chief");
      assert.equal(handoffCreated.stepId, "project-handoff");
      assert.equal(handoffCreated.flowId, "focus");

      // 运营会话：接交付后派名单内 worker 受理（from=convener）。
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(20);
      const convenerDispatch = h.caps.convener!;
      assert.equal(typeof convenerDispatch, "function");
      const toWorker = (await convenerDispatch({ roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      assert.equal(toWorker.ok, true, toWorker.message ?? "");
      const state2 = await readTaskState(root);
      const workerTask = [...state2.records.values()].find((record) => record.created?.to === "implementer")!.created!;
      assert.equal(workerTask.from, "convener");
      assert.equal(workerTask.flowId, "focus");
      assert.equal(workerTask.moduleId, "impl-core", "任务模块 id 全链路落盘");
      assert.equal(workerTask.moduleDirectory, "src/", "任务模块目录以名单为准落盘");

      // R2/R3：目标不拥有任务模块 ⇒ 拒绝（不产生任务行）。
      const beforeWrongModule = (await readTaskState(root)).records.size;
      const wrongModule = (await convenerDispatch({
        roleId: "implementer",
        task: "实现测试套件",
        sideEffect: "code",
        flowId: "focus",
        moduleId: "qa-suite",
      })) as DispatchReceipt;
      assert.equal(wrongModule.ok, false);
      assert.match(wrongModule.message ?? "", /模块|属主/);
      assert.equal((await readTaskState(root)).records.size, beforeWrongModule, "模块不归属目标时不创建任务");
      // 运营 → 质检（验收核对，带模块）受理；运营 → 产品（内置非质检）被拒。
      const toVerifier = (await convenerDispatch({ roleId: "verifier", task: "验收核对", sideEffect: "read-only", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      assert.equal(toVerifier.ok, true, toVerifier.message ?? "");
      const toProduct = (await convenerDispatch({ roleId: "product", task: "写意图", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(toProduct.ok, false);
      assert.match(toProduct.message ?? "", /运营|项目 worker|质检/);

      // 名单外目标（qa 未在 D3 选中）被拒。
      const toQa = (await convenerDispatch({ roleId: "qa", task: "测试", sideEffect: "code", flowId: "focus", moduleId: "qa-suite" })) as DispatchReceipt;
      assert.equal(toQa.ok, false);
      assert.match(toQa.message ?? "", /名单|D3/);
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("M9 报告路由：运营派的 worker 报告回运营；幕僚派的任务报告回幕僚", async () => {
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
      assert.equal(handoff.ok, true, handoff.message ?? "");
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(40);
      await settle(h, "chief", "convener");
      const toWorker = (await h.caps.convener!({ roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
      assert.equal(toWorker.ok, true, toWorker.message ?? "");
      await settle(h, "convener");
      const state = await readTaskState(root);
      const workerTaskId = [...state.records.values()].find((record) => record.created?.to === "implementer")!.taskId;

      await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
      await tick(40);
      await settle(h, "implementer");
      const handback: TaskHandback = {
        roleId: "implementer",
        taskId: workerTaskId,
        status: "completed",
        summary: "实现完成",
        evidence: ["src/app.ts"],
        at: "2026-10-29T00:10:00.000Z",
      };
      (h.streams.implementer ??= []).push({ kind: "handback", summary: "回交", handback } as OrchestrationEvent);
      await tick(120);
      assert.ok((h.sent.convener ?? []).some((text) => text.includes("[工作结果]") && text.includes(workerTaskId)), "worker 报告回创建者（运营）");
      assert.equal((h.sent.chief ?? []).some((text) => text.includes(workerTaskId)), false, "不得越级投给幕僚");

      // 幕僚派给策划的任务：回幕僚。
      const toRapporteur = (await chiefDispatch({ roleId: "rapporteur", task: "出方案", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
      assert.equal(toRapporteur.ok, true, toRapporteur.message ?? "");
      const state2 = await readTaskState(root);
      const reportTaskId = [...state2.records.values()].find((record) => record.created?.to === "rapporteur")!.taskId;
      await h.mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" });
      await tick(40);
      await settle(h, "rapporteur");
      (h.streams.rapporteur ??= []).push({
        kind: "handback",
        summary: "回交",
        handback: { ...handback, roleId: "rapporteur", taskId: reportTaskId, summary: "方案完成" },
      } as OrchestrationEvent);
      await tick(120);
      assert.ok((h.sent.chief ?? []).some((text) => text.includes("[工作结果]") && text.includes(reportTaskId)), "幕僚派的任务报告回幕僚");
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
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

test("F4：质检报告按任务创建者路由——运营发起回运营；幕僚调度回幕僚", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-verifier-"));
  try {
    await writeProjectFiles(root);
    await d3Fixture(root, ["implementer"]);
    const h = harness(root);
    try {
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      await tick(20);
      // 运营发起验收：先交付运营，再由运营派质检。
      const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      assert.equal(handoff.ok, true, handoff.message ?? "");
      await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      await tick(40);
      await settle(h, "chief", "convener");
      const toVerifier = (await h.caps.convener!({ roleId: "verifier", task: "验收核对", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      assert.equal(toVerifier.ok, true, toVerifier.message ?? "");
      const state = await readTaskState(root);
      const verifierTaskByConvener = [...state.records.values()].find(
        (record) => record.created?.to === "verifier" && record.created?.from === "convener",
      )!.taskId;
      // 幕僚调度验收：另一条 verifier 任务（creator=chief）。
      const chiefToVerifier = (await h.caps.chief!({ roleId: "verifier", task: "复核交付", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
      assert.equal(chiefToVerifier.ok, true, chiefToVerifier.message ?? "");
      const state2 = await readTaskState(root);
      const verifierTaskByChief = [...state2.records.values()].find(
        (record) => record.created?.to === "verifier" && record.created?.from === "chief",
      )!.taskId;

      await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
      await tick(40);
      await settle(h, "verifier");
      const handback = (taskId: string): TaskHandback => ({
        roleId: "verifier",
        taskId,
        status: "completed",
        summary: "核对通过",
        evidence: ["docs/quality/focus-report-v1.md"],
        at: "2026-10-29T00:20:00.000Z",
      });
      (h.streams.verifier ??= []).push({ kind: "handback", summary: "回交", handback: handback(verifierTaskByConvener) } as OrchestrationEvent);
      await tick(140);
      assert.ok(
        (h.sent.convener ?? []).some((text) => text.includes("[工作结果]") && text.includes(verifierTaskByConvener)),
        "运营发起的质检报告回运营（发起方）",
      );
      (h.streams.verifier ??= []).push({ kind: "handback", summary: "回交", handback: handback(verifierTaskByChief) } as OrchestrationEvent);
      await tick(140);
      assert.ok(
        (h.sent.chief ?? []).some((text) => text.includes("[工作结果]") && text.includes(verifierTaskByChief)),
        "幕僚调度的质检报告回幕僚",
      );
    } finally {
      await h.mgr.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
