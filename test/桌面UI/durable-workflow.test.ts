import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { enUS, zhCN } from "../../src/common/shared/i18n/index.ts";
import { isWorkflowStartCard } from "../../app/renderer/src/chat/decision-card.ts";
import type { DesktopWorkflowStartProposal } from "../../app/desktop/workflow-chief-start.ts";

const here = fileURLToPath(import.meta.url);
const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = join(tmpdir(), "ans-durable-fixture");
const otherRoot = join(tmpdir(), "ans-ordinary-fixture");
const emptyRoot = join(tmpdir(), "ans-unversioned-workflow-fixture");
const instanceId = "dw-renderer-fixture";
const requestId = "release-renderer-fixture";
const closedInstanceId = "dw-closed-fixture";
const deliveryId = "delivery-renderer-fixture";
const digest = "a".repeat(64);

if (!process.versions.electron) {
  test("normal task drawer wires the durable workflow panel to the preload and decision center", async () => {
    const read = (path: string) => readFile(join(repo, path), "utf8");
    const [drawer, tasks, panel, ipc, preload] = await Promise.all([
      read("app/renderer/src/shell/Drawer.tsx"),
      read("app/renderer/src/chat/TaskCenterPanel.tsx"),
      read("app/renderer/src/chat/DurableWorkflowPanel.tsx"),
      read("app/renderer/src/chat/ipc.ts"),
      read("app/preload.cjs"),
    ]);
    assert.match(drawer, /effective === "tasks" \? <TaskCenterPanel/);
    assert.match(tasks, /<DurableWorkflowPanel key=\{projectRoot\} projectRoot=\{projectRoot\}/);
    for (const [method, channel] of [
      ["listDurableWorkflows", "list"],
      ["validateDurableWorkflow", "validate"],
      ["copyDurableWorkflowPreset", "preset-copy"],
      ["importDurableWorkflow", "import"],
      ["listWorkflowStartProposals", "start-proposals"],
      ["revokeWorkflowStartProposal", "start-proposal-revoke"],
      ["getDurableWorkflowProjection", "projection"],
      ["readDurableWorkflowDelivery", "delivery-read"],
      ["acknowledgeDurableWorkflowDelivery", "delivery-acknowledge"],
    ]) {
      assert.ok(ipc.includes(`"${method}"`));
      assert.ok(preload.includes(`${method}: input => ipcRenderer.invoke("durable-workflow:${channel}", input)`));
    }
    assert.match(panel, /showDefinitions && drawerOpen \? \(/);
    assert.match(panel, /pendingOperator\[approval\.requestId\]/);
    assert.match(panel, /useDecisionCenterStore\.getState\(\)\.open\(approval\.requestId\)/);
    assert.doesNotMatch(panel, /operatorRespond|\bipcRenderer\b|node:|["']path-[ab]["']/);
    assert.doesNotMatch(panel + ipc, /startDurableWorkflow|submitDurableStart|pendingDurableStart|ui\.durableWorkflow\.(enable|retryStart)\b/);
  });

  test("an activation card presents fixed, single-select application options", () => {
    const request = {
      kind: "choice", cardKind: "workflow-start", application: true,
      options: [{ id: "approve-workflow-start" }, { id: "reject-workflow-start" }],
    };
    assert.equal(isWorkflowStartCard(request), true);
    assert.equal(isWorkflowStartCard({ ...request, application: false }), false);
    assert.equal(isWorkflowStartCard({ ...request, multiple: true }), false);
    assert.equal(isWorkflowStartCard({ ...request, options: [request.options[0], request.options[0]] }), false);
  });

  test("workflow controls and status labels resolve in both supported locales", async () => {
    const panel = await readFile(join(repo, "app/renderer/src/chat/DurableWorkflowPanel.tsx"), "utf8");
    const keys = [...new Set(panel.match(/ui\.durableWorkflow\.[a-zA-Z0-9.]+/g))];
    assert.ok(keys.length > 30);
    for (const key of keys) {
      assert.ok(Object.hasOwn(zhCN, key), `Missing zh-CN message ${key}`);
      assert.ok(Object.hasOwn(enUS, key), `Missing en-US message ${key}`);
    }
  });

  // The general test suite runs before the renderer build. Opt into this scenario with a built bundle.
  test("task drawer exercises activation and release cards through the built renderer and preload", {
    skip: process.env.ANS_DURABLE_RENDERER_SMOKE !== "1",
  }, async () => {
    const electron = (await import("electron")).default as unknown as string;
    const profile = await mkdtemp(join(tmpdir(), "ans-durable-ui-"));
    try {
      const output = await promisify(execFile)(electron, [here, profile], {
        cwd: repo,
        timeout: 45_000,
        windowsHide: true,
      });
      assert.match(output.stdout, /Durable workflow renderer scenarios passed/);
    } catch (error) {
      const failure = error as { stderr?: string; stdout?: string };
      throw new Error([failure.stderr, failure.stdout].filter(Boolean).join("\n") || String(error), { cause: error });
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });
} else {
  const { app, BrowserWindow, ipcMain } = await import("electron");
  app.setPath("userData", process.argv[2]!);
  const ok = <T>(value: T) => ({ ok: true, value });
  const definition = { id: "path-b", name: "Path B preset", source: "preset", file: "path-b.yaml", version: 2, digest } as const;
  const presetA = { id: "path-a", name: "Path A preset", source: "preset", file: "path-a.yaml", version: 2, digest: "e".repeat(64) } as const;
  const imported = {
    id: "third-graph", name: "Local workflow", source: "project", file: "third-graph.yaml", version: 9, digest: "f".repeat(64),
  } as const;
  const proposal = (definition: DesktopWorkflowStartProposal["definition"], key: string): DesktopWorkflowStartProposal => ({
    activationId: `activate-${key}`,
    requestId: `workflow-card-${key}`,
    generation: 1,
    state: "pending",
    definition,
    requirement: { text: `Original customer request for ${key}\nSecond line preserved` },
    reason: `The Chief selected ${definition.name} because it fits this project.`,
    createdAt: "2026-11-17T03:30:00.000Z",
  });
  const activationA = proposal(presetA, "a");
  const activationB = proposal(definition, "b");
  const activationThird = proposal(imported, "third");
  const invalid = { id: "bad", source: "project", file: "bad.yaml", error: {
    code: "definition-invalid", path: "$.steps.impact.on", message: "Missing outcome branch",
  } };
  const decision = {
    kind: "change.scope-decided",
    id: "scope-decision-fixture",
    b3Request: { key: "b3-advance-fixture", sourceTaskId: "chief-b3-task", digest },
    b1Report: { key: "b1-report-fixture", path: "docs/reports/impact.md", sha256: digest, attempt: 2 },
    baseline: { oid: "b".repeat(40), branch: "task-b" },
    candidateSource: "modulePaths",
    candidates: ["src/product.ts"],
    writeSets: [{ roleId: "module-owner", paths: ["src/product.ts"] }],
    reason: "The change affects this module.",
    recordedAt: "2026-11-17T03:00:00.000Z",
  };
  const delivery = {
    id: deliveryId,
    state: "pending",
    releaseRequestId: "release-closed-fixture",
    mergeOid: "c".repeat(40),
    files: ["src/product.ts"],
    diffDigest: "d".repeat(64),
    operatorReport: { path: "docs/reports/operator.md", sha256: digest },
    operatorReportArtifacts: [{ path: "docs/reports/tests.md", sha256: digest }],
    runtimeVerification: "not-independently-verified",
    createdAt: "2026-11-17T04:00:00.000Z",
    deliveredAt: undefined as string | undefined,
  };
  const deliverySummary = () => {
    const { id, state, releaseRequestId, createdAt, deliveredAt } = delivery;
    return { id, state, releaseRequestId, createdAt, deliveredAt };
  };
  const instance = {
    instanceId, owner: "dapr", definitionId: definition.id, definitionName: "Path B",
    definitionVersion: definition.version, definitionDigest: digest, status: "waiting",
    action: "b4-customer-merge-main", engine: "healthy", stepId: "release",
    stepName: "Release", attempt: 1, waiting: "Waiting for the customer",
    approval: { requestId, status: "pending" }, evidence: [{ kind: "approval", sha256: digest }],
  };
  const calls = {
    list: [] as unknown[],
    validation: [] as unknown[],
    copy: [] as unknown[],
    import: [] as unknown[],
    projection: [] as unknown[],
    start: [] as unknown[],
    revoke: [] as unknown[],
    operator: [] as unknown[],
    readDelivery: [] as unknown[],
    ackDelivery: [] as unknown[],
  };
  let pickedRoot = root;
  let hasInstance = false;
  let connected = true;
  let pauseRead: Promise<void> | undefined;
  let failRead = false;
  let failAck = true;
  let emptyInstance: Record<string, unknown> | undefined;
  let projectA: "missing" | "valid" | "invalid" = "missing";
  let importMode: "cancel" | "success" | "conflict" = "cancel";
  let importedOnDisk = false;
  const projectVersion = { ...presetA, source: "project" };
  const invalidProjectVersion = { ...projectVersion, name: undefined, version: undefined, digest: undefined, error: {
    code: "definition-invalid", path: "$.steps.start", message: "Invalid project workflow body",
  } };
  const ackGate = Promise.withResolvers<void>();
  const projection = (id?: string) => ({
    controlPlane: connected ? { state: "ready" } : { state: "failed", code: "port-conflict", message: "Port unavailable" },
    ...(hasInstance ? { instance: id === closedInstanceId ? {
      ...instance,
      instanceId: closedInstanceId,
      status: "delivered",
      stepId: "delivered",
      stepName: "Delivered",
      action: undefined,
      waiting: undefined,
      scopeDecision: decision,
      approval: { requestId: delivery.releaseRequestId, status: "approve" },
      delivery: deliverySummary(),
    } : connected ? instance : { ...instance, engine: "offline", blockedReason: "Waiting for the local engine" } } : {}),
  });

  ipcMain.handle("app:pick-project", () => pickedRoot);
  ipcMain.handle("app:list-project", (_, { projectRoot }) => ({
    projectRoot, primaryRoleId: "chief", hasRoles: true, governanceModel: "trio",
    roles: [{ roleId: "chief", builtIn: true, cardText: "# Chief", boundary: { entries: [] } }],
  }));
  ipcMain.handle("app:recovery-state", () => ({}));
  ipcMain.handle("preferences:get", () => ({ version: 1, locale: "en-US", supported: ["zh-CN", "en-US"] }));
  ipcMain.handle("session:open", () => ok({}));
  ipcMain.handle("session:history-get", () => ({ rows: [] }));
  ipcMain.handle("runtime-config:get", () => ({ missing: [] }));
  ipcMain.handle("tasks:list", () => ({ tasks: [] }));
  ipcMain.handle("roles:activity-log", () => ({ ok: true, text: "" }));
  ipcMain.handle("project-state:get", () => ({}));
  for (const channel of [
    "app:recovery-ready", "app:renderer-diagnostic", "window:is-maximized", "session:role-states",
    "session:live", "session:live-views", "network:get-state", "shell:judge-get",
    "decision:judge-get", "background-tasks:list",
  ]) ipcMain.handle(channel, () => ({}));

  ipcMain.handle("durable-workflow:projection", (_, input) => {
    calls.projection.push(input);
    if (input.projectRoot === emptyRoot) {
      return ok({ controlPlane: { state: "ready" }, instance: emptyInstance });
    }
    return ok(input.projectRoot === root ? projection(input.instanceId) : { controlPlane: { state: "stopped" } });
  });
  ipcMain.handle("durable-workflow:list", (_, input) => {
    calls.list.push(input);
    const definitions = input.projectRoot === emptyRoot
      ? [presetA, definition,
        ...(projectA === "valid" ? [projectVersion] : projectA === "invalid" ? [invalidProjectVersion] : []),
        ...(importedOnDisk ? [imported] : []),
      ]
      : [definition, invalid];
    return ok({ definitions, controlPlane: { state: "ready" } });
  });
  ipcMain.handle("durable-workflow:preset-copy", (_, input) => {
    calls.copy.push(input);
    assert.deepEqual(input, { projectRoot: emptyRoot, definitionId: presetA.id });
    projectA = "valid";
    return ok(projectVersion);
  });
  ipcMain.handle("durable-workflow:import", (_, input) => {
    calls.import.push(input);
    assert.deepEqual(input, { projectRoot: emptyRoot });
    if (importMode === "cancel") {
      return { ok: false, code: "workflow-import-cancelled", message: "No workflow file was selected." };
    }
    if (importMode === "conflict") {
      return { ok: false, code: "definition-id-conflict", message: "A project definition already uses this ID." };
    }
    importedOnDisk = true;
    return ok(imported);
  });
  ipcMain.handle("durable-workflow:validate", (_, input) => {
    calls.validation.push(input);
    if (input.definitionId === invalid.id) return { ...invalid.error, ok: false };
    if (input.definitionId === presetA.id) {
      if (input.source === "project") {
        if (projectA === "invalid") return { ...invalidProjectVersion.error, ok: false };
        return ok(projectVersion);
      }
      return ok(presetA);
    }
    if (input.definitionId === imported.id) return ok(imported);
    return ok(definition);
  });
  ipcMain.handle("durable-workflow:start", (_, input) => {
    calls.start.push(input);
    return { ok: false, code: "workflow-start-confirmation-required", message: "Activation requires the customer card." };
  });
  ipcMain.handle("durable-workflow:start-proposals", (_, input) => ok(input.projectRoot === emptyRoot
    ? [activationA, activationB, ...(importedOnDisk ? [activationThird] : [])]
    : []));
  ipcMain.handle("durable-workflow:start-proposal-revoke", (_, input) => {
    calls.revoke.push(input);
    assert.deepEqual(input, { projectRoot: emptyRoot, activationId: activationThird.activationId, requestId: activationThird.requestId });
    activationThird.state = "revoked";
    activationThird.decision = { action: "revoke", source: "customer", at: "2026-11-17T03:36:00.000Z" };
    return ok(activationThird);
  });
  ipcMain.handle("session:operator-response", (_, input) => {
    calls.operator.push(input);
    if (input.id === requestId) {
      instance.approval.status = "reject";
      instance.status = "stopped";
    }
    if (input.id === activationA.requestId) {
      assert.deepEqual(input.decision, { kind: "choice", selected: ["approve-workflow-start"] });
      activationA.state = "approved";
      activationA.decision = { action: "approve", source: "customer", at: "2026-11-17T03:34:00.000Z" };
      activationA.startup = { state: "waiting" };
    }
    if (input.id === activationB.requestId) {
      assert.deepEqual(input.decision, { kind: "choice", selected: ["reject-workflow-start"] });
      activationB.state = "rejected";
      activationB.decision = { action: "reject", source: "customer", at: "2026-11-17T03:35:00.000Z" };
    }
    return { ok: true };
  });
  ipcMain.handle("durable-workflow:delivery-read", async (_, input) => {
    calls.readDelivery.push(input);
    if (failRead) return { ok: false, code: "workflow-delivery-not-found", message: "Test read failure" };
    await pauseRead;
    return ok({ delivery, viewToken: "test-view-token" });
  });
  ipcMain.handle("durable-workflow:delivery-acknowledge", async (event, input) => {
    calls.ackDelivery.push(input);
    assert.equal(await event.sender.executeJavaScript(`Boolean(
      document.querySelector("[data-delivery-explanation]")?.getClientRects().length &&
      document.querySelector("[data-delivery-explanation]").textContent.includes("${delivery.mergeOid}")
    )`), true);
    if (failAck) return { ok: false, code: "workflow-operation-failed", message: "Test acknowledgment failure" };
    await ackGate.promise;
    delivery.state = "delivered";
    delivery.deliveredAt = "2026-11-17T04:05:00.000Z";
    return ok(deliverySummary());
  });

  const run = async () => {
    await app.whenReady();
    const window = new BrowserWindow({
      show: false,
      width: 1100,
      height: 800,
      webPreferences: {
        preload: join(repo, "app/preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false,
      },
    });
    const page = window.webContents;
    const js = <T>(script: string): Promise<T> => page.executeJavaScript(script);
    const waitFor = async (expression: string) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await js(expression)) return;
        await delay(35);
      }
      assert.fail(`Renderer condition not met: ${expression}`);
    };
    const click = async (selector: string) => {
      const element = `document.querySelector(${JSON.stringify(selector)})`;
      await waitFor(`${element} && !${element}.disabled`);
      await js(`${element}.click()`);
    };
    const panel = 'document.querySelector("[data-durable-workflow]")';
    const includes = (text: string) => waitFor(`${panel}?.textContent.includes(${JSON.stringify(text)})`);
    const buttons = `Array.from(${panel}.querySelectorAll("button"))`;
    const button = (text: string) => `${buttons}.find(button => button.textContent.trim() === ${JSON.stringify(text)})`;
    const clickButton = async (text: string) => {
      const element = button(text);
      await waitFor(`${element} && !${element}.disabled`);
      await js(`${element}.click()`);
    };
    const select = async (file: string) => {
      await waitFor(`Array.from(${panel}.querySelector("select")?.options ?? []).some(option => option.value === ${JSON.stringify(file)})`);
      await js(`{
        const select = ${panel}.querySelector("select");
        select.value = ${JSON.stringify(file)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }`);
    };
    const openDefinitions = () => click("[data-workflow-definitions] > summary");
    const proposalElement = (record: DesktopWorkflowStartProposal) =>
      `document.querySelector('[data-workflow-start-proposal="${record.activationId}"]')`;
    const proposalState = (record: DesktopWorkflowStartProposal, state: string) =>
      waitFor(`${proposalElement(record)}?.dataset.proposalState === ${JSON.stringify(state)}`);
    const presentActivation = (record: DesktopWorkflowStartProposal) => page.send("session:operator-request", {
      id: record.requestId, projectRoot: emptyRoot, roleId: "chief",
      request: {
        kind: "choice", cardKind: "workflow-start", application: true,
        title: "Confirm workflow activation",
        preview: [record.requirement.text, record.reason, record.definition.name, record.definition.digest].join("\n"),
        options: [{ id: "approve-workflow-start", label: "Confirm activation" }, { id: "reject-workflow-start", label: "Do not activate" }],
      },
    });
    const pickProject = async () => {
      await click("#btn-import");
      await waitFor(`document.getElementById("project-path").textContent === ${JSON.stringify(pickedRoot)}`);
      await click("#tab-tasks");
      await includes("Durable workflow prototype");
    };
    const findInstance = async (id: string) => {
      await js(`{
        const field = document.querySelector('form[aria-label="Find instance"] input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, ${JSON.stringify(id)});
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }`);
      await clickButton("Find instance");
      await includes(id);
    };

    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    assert.equal(calls.projection.length, 0);
    assert.equal(calls.list.length, 0);
    await click("[data-durable-workflow] > summary");
    await includes("This project has no durable workflow instance.");
    await includes("This project has no activation proposals.");
    assert.equal(calls.list.length, 0);
    assert.equal(await js(`${panel}.querySelectorAll('textarea, input[type="checkbox"]').length`), 0);

    await openDefinitions();
    await select("project:bad.yaml");
    await includes("$.steps.impact.on");
    await clickButton("Validate YAML");
    await includes("Missing outcome branch");
    assert.equal(await js(`Boolean(${button("Start instance")})`), false);
    assert.equal(calls.start.length, 0);

    await select("preset:path-b.yaml");
    await clickButton("Validate YAML");
    await includes("Definition validated");
    await includes(digest);
    hasInstance = true;
    await includes(instanceId);
    assert.equal(calls.start.length, 0);
    assert.deepEqual(calls.validation, [
      { projectRoot: root, definitionId: invalid.id, source: "project", expectedDigest: undefined },
      { projectRoot: root, definitionId: definition.id, source: "preset", expectedDigest: digest },
    ]);
    await includes(requestId);
    await includes("B4 customer approval and local merge");
    await includes("Awaiting customer decision");

    connected = false;
    await includes("Port unavailable");
    await includes("Waiting for the local engine");
    await includes("Waiting to reconnect");
    assert.equal(calls.start.length, 0);
    connected = true;
    await waitFor(`!${panel}.textContent.includes("Port unavailable")`);
    assert.equal(calls.start.length, 0);

    page.send("session:operator-request", {
      id: requestId, projectRoot: root, roleId: "chief",
      request: { kind: "choice", title: "Release to main", cardKind: "merge-main", application: true,
        options: [
          { id: "approve-merge-main", label: "Approve merge" },
          { id: "reject-merge-main", label: "Reject merge" },
        ] },
    });
    await click("#decision-dialog .dd-later");
    assert.equal(calls.operator.length, 0);
    await clickButton("Open release approval card");
    await waitFor(`document.querySelector("#decision-dialog")?.dataset.requestId === ${JSON.stringify(requestId)}`);
    await click("#decision-dialog .dd-reject");
    await includes("Customer rejected");
    assert.deepEqual(calls.operator, [{ id: requestId, decision: { kind: "choice", selected: ["reject-merge-main"] } }]);

    // A fresh renderer still queries the existing instance and release note.
    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await includes(instanceId);
    assert.equal(await js(`${panel}.querySelector('input[type="checkbox"]') === null`), true);
    assert.equal(calls.list.length, 1);
    assert.equal(calls.start.length, 0);

    await findInstance(closedInstanceId);
    await click("[data-durable-scope-decision] > summary");
    for (const text of [
      decision.kind, decision.id, decision.b3Request.key, decision.b3Request.sourceTaskId,
      decision.b1Report.path, decision.baseline.oid, decision.candidateSource, decision.reason, "module-owner",
    ]) await includes(text);
    const deliverySection = 'document.querySelector("[data-durable-delivery]")';
    const receiptState = (state: string) => waitFor(`${deliverySection}?.dataset.deliveryState === ${JSON.stringify(state)}`);
    await receiptState("pending");
    assert.equal(await js('Boolean(document.querySelector("[data-delivery-explanation]"))'), false);
    assert.equal(calls.readDelivery.length, 0);
    assert.equal(calls.ackDelivery.length, 0);

    // Collapsing the panel during the read leaves the persisted receipt pending.
    const collapsedRead = Promise.withResolvers<void>();
    pauseRead = collapsedRead.promise;
    await clickButton("View delivery explanation");
    await click("[data-durable-workflow] > summary");
    await waitFor(`!${panel}.open`);
    collapsedRead.resolve();
    pauseRead = undefined;
    await delay(100);
    assert.equal(calls.ackDelivery.length, 0);
    await click("[data-durable-workflow] > summary");
    await receiptState("pending");

    // Changing the projected instance invalidates its outstanding read before rendering.
    const switchedRead = Promise.withResolvers<void>();
    pauseRead = switchedRead.promise;
    await clickButton("View delivery explanation");
    await findInstance(instanceId);
    await waitFor(`!${deliverySection}`);
    switchedRead.resolve();
    pauseRead = undefined;
    await findInstance(closedInstanceId);
    await receiptState("pending");
    assert.equal(calls.ackDelivery.length, 0);

    failRead = true;
    await clickButton("View delivery explanation");
    await includes("Test read failure");
    assert.equal(calls.ackDelivery.length, 0);
    failRead = false;
    await clickButton("View delivery explanation");
    await includes("Test acknowledgment failure");
    await receiptState("pending");
    await includes(delivery.mergeOid);
    await includes("Runtime behavior has not been independently verified.");
    await includes("docs/reports/tests.md");
    assert.equal(calls.ackDelivery.length, 1);
    failAck = false;
    await clickButton("Retry delivery acknowledgment");
    await receiptState("pending");
    ackGate.resolve();
    await receiptState("delivered");
    assert.deepEqual(calls.ackDelivery, Array.from({ length: 2 }, () => ({
      projectRoot: root, instanceId: closedInstanceId, deliveryId, viewToken: "test-view-token",
    })));
    await clickButton("Close");
    await clickButton("View delivery explanation");
    await includes(delivery.mergeOid);
    assert.equal(calls.ackDelivery.length, 2);

    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await findInstance(closedInstanceId);
    await receiptState("delivered");
    assert.equal(await js('Boolean(document.querySelector("[data-delivery-explanation]"))'), false);
    assert.equal(calls.ackDelivery.length, 2);

    const projectRead = Promise.withResolvers<void>();
    pauseRead = projectRead.promise;
    await clickButton("View delivery explanation");
    await click("#drawer-close");
    pickedRoot = otherRoot;
    await pickProject();
    projectRead.resolve();
    pauseRead = undefined;
    await click("[data-durable-workflow] > summary");
    await includes("This project has no durable workflow instance.");
    assert.equal(await js(`${panel}.textContent.includes(${JSON.stringify(instanceId)})`), false);
    assert.equal(await js('Boolean(document.querySelector("[data-delivery-explanation]"))'), false);
    assert.equal(calls.ackDelivery.length, 2);
    assert.equal(calls.list.length, 1);
    assert.equal(calls.start.length, 0);

    await click("#drawer-close");
    pickedRoot = emptyRoot;
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await openDefinitions();
    await select("preset:path-a.yaml");
    await includes(presetA.name);
    await includes(definition.name);
    await includes("Bundled preset");
    await clickButton("Validate YAML");
    await includes("Definition validated");
    assert.equal(calls.copy.length, 0);
    assert.equal(calls.import.length, 0);
    assert.equal(emptyInstance, undefined);
    assert.deepEqual(calls.validation.at(-1), {
      projectRoot: emptyRoot, definitionId: presetA.id, source: "preset", expectedDigest: presetA.digest,
    });
    await proposalState(activationA, "pending");
    await click(`[data-workflow-start-proposal="${activationA.activationId}"] > summary`);
    for (const value of [activationA.requirement.text, activationA.reason, activationA.definition.digest, activationA.requestId]) {
      await includes(value);
    }
    presentActivation(activationA);
    await waitFor(`document.querySelector("#decision-dialog")?.dataset.requestId === ${JSON.stringify(activationA.requestId)}`);
    assert.equal(await js('document.querySelector("#decision-dialog .dd-submit").disabled'), true);
    assert.equal(await js('document.querySelector("#decision-dialog input:checked") === null'), true);
    await click("#decision-dialog .dd-later");
    await proposalState(activationA, "pending");
    assert.equal(calls.operator.length, 1);

    await click("#drawer-close");
    pickedRoot = otherRoot;
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await includes("This project has no activation proposals.");
    assert.equal(await js(`Boolean(${proposalElement(activationA)})`), false);
    await click("#drawer-close");
    pickedRoot = emptyRoot;
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await proposalState(activationA, "pending");
    page.send("session:operator-queued", { id: activationB.requestId, projectRoot: emptyRoot, roleId: "chief" });
    await waitFor(`${proposalElement(activationB)}?.textContent.includes("Queued")`);
    assert.equal(await js(`Array.from(${proposalElement(activationB)}.querySelectorAll("button")).some(button => button.textContent === "Open")`), false);
    presentActivation(activationA);
    await click("#decision-dialog .dd-later");
    await click(`[data-workflow-start-proposal="${activationA.activationId}"] > summary`);
    await clickButton("Open");
    await waitFor(`document.querySelector("#decision-dialog")?.dataset.requestId === ${JSON.stringify(activationA.requestId)}`);
    await click('#decision-dialog input[value="approve-workflow-start"]');
    await click("#decision-dialog .dd-submit");
    await proposalState(activationA, "approved");
    await includes("Approved, awaiting startup");
    assert.equal(emptyInstance, undefined);
    assert.equal(calls.start.length, 0);
    activationA.startup = { state: "blocked", code: "workflow-workspace-busy", message: "Another workflow has the project" };
    await includes("Another workflow has the project");
    emptyInstance = {
      ...instance,
      instanceId: "dw-pre-git-fixture",
      definitionId: presetA.id,
      definitionName: presetA.name,
      definitionVersion: presetA.version,
      definitionDigest: presetA.digest,
      definitionSource: presetA.source,
      schema: 2,
      stepId: "before-baseline",
      stepName: "Before baseline",
      status: "waiting",
      action: "confirm-intent",
      flowId: "flow-pre-git",
      approval: undefined,
      waiting: "Awaiting intent confirmation",
      pendingTasks: [
        { taskId: "task-standards", roleId: "verifier", stepId: "review-work", attempt: 1, state: "reported" },
        { taskId: "task-already-accepted", roleId: "verifier", stepId: "previous", attempt: 1, state: "accepted" },
      ],
    };
    activationA.state = "started";
    activationA.instanceId = "dw-pre-git-fixture";
    activationA.startup = { state: "created" };
    await includes("Instance created, awaiting scheduling");
    await includes("dw-pre-git-fixture");
    await includes("flow-pre-git");
    await includes("Before baseline");
    await includes("Definition schema version");
    await includes("task-standards");
    await includes("Report submitted");
    assert.equal(await js(`${panel}.textContent.includes("task-already-accepted")`), false);
    activationA.startup = { state: "scheduled" };
    await waitFor(`${proposalElement(activationA)}?.dataset.startupState === "scheduled"`);
    presentActivation(activationB);
    await waitFor(`document.querySelector("#decision-dialog")?.dataset.requestId === ${JSON.stringify(activationB.requestId)}`);
    await click("#decision-dialog .dd-reject");
    await proposalState(activationB, "rejected");
    assert.deepEqual(calls.operator.slice(1), [
      { id: activationA.requestId, decision: { kind: "choice", selected: ["approve-workflow-start"] } },
      { id: activationB.requestId, decision: { kind: "choice", selected: ["reject-workflow-start"] } },
    ]);

    // A pre-baseline instance and independent task remain discoverable through the same project entry.
    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await includes("dw-pre-git-fixture");
    await includes("task-standards");
    await proposalState(activationA, "started");
    assert.equal(await js(`${panel}.querySelector('input[type="checkbox"]') === null`), true);
    assert.equal(calls.start.length, 0);

    for (const card of [
      { id: "approval-a3", request: { kind: "confirm", title: "Confirm current intent", cardKind: "intent-confirm" } },
      { id: "approval-a6", request: { kind: "confirm", title: "Confirm current proposal", cardKind: "proposal" } },
      { id: "approval-a10", request: { kind: "choice", title: "Confirm appointments", cardKind: "appointment",
        options: [{ id: "operator", label: "Operations" }], multiple: true } },
    ]) {
      page.send("session:operator-request", { ...card, projectRoot: emptyRoot, roleId: "chief" });
      await waitFor(`document.querySelector("#decision-dialog")?.dataset.requestId === ${JSON.stringify(card.id)}`);
      if (card.request.kind === "choice") {
        await click('#decision-dialog input[value="operator"]');
        await click("#decision-dialog .dd-submit");
      } else {
        await click("#decision-dialog .dd-confirm");
      }
      await waitFor('!document.querySelector("#decision-dialog")');
    }
    assert.deepEqual(calls.operator.slice(3), [
      { id: "approval-a3", decision: { kind: "confirm", confirmed: true } },
      { id: "approval-a6", decision: { kind: "confirm", confirmed: true } },
      { id: "approval-a10", decision: { kind: "choice", selected: ["operator"] } },
    ]);

    await openDefinitions();
    await select("preset:path-a.yaml");
    await clickButton("Copy preset to project");
    await waitFor(`${panel}.querySelector("select")?.value === "project:path-a.yaml"`);
    await includes("Project YAML");
    assert.equal(calls.copy.length, 1);
    assert.equal(await js(`Array.from(${panel}.querySelector("select").options).some(option => option.value === "preset:path-a.yaml")`), false);
    await clickButton("Validate YAML");
    await includes("Definition validated");
    assert.deepEqual(calls.validation.at(-1), {
      projectRoot: emptyRoot, definitionId: presetA.id, source: "project", expectedDigest: projectVersion.digest,
    });

    projectA = "invalid";
    await click("[data-durable-workflow] .ps-refresh");
    await includes("Invalid project workflow body");
    await includes("$.steps.start");
    assert.equal(await js(`Boolean(${button("Start instance")})`), false);
    assert.equal(await js(`${panel}.querySelector("select").value`), "project:path-a.yaml");
    assert.equal(await js(`Array.from(${panel}.querySelector("select").options).some(option => option.value === "preset:path-a.yaml")`), false);
    projectA = "missing";
    await click("[data-durable-workflow] .ps-refresh");
    await includes("The selected definition is unavailable.");
    assert.equal(await js(`${panel}.querySelector("select").value`), "project:path-a.yaml");
    assert.equal(await js(`Boolean(${button("Start instance")})`), false);

    await clickButton("Import YAML");
    await waitFor(`${button("Import YAML")} && !${button("Import YAML")}.disabled`);
    assert.equal(calls.import.length, 1);
    importMode = "conflict";
    await clickButton("Import YAML");
    await includes("definition-id-conflict");
    assert.equal(calls.start.length, 0);
    importMode = "success";
    await clickButton("Import YAML");
    await includes(imported.name);
    await waitFor(`${panel}.querySelector("select")?.value === "project:third-graph.yaml"`);
    await includes(imported.digest);
    await clickButton("Validate YAML");
    await includes("Definition validated");
    assert.deepEqual(calls.validation.at(-1), {
      projectRoot: emptyRoot, definitionId: imported.id, source: "project", expectedDigest: imported.digest,
    });
    await proposalState(activationThird, "pending");
    await click(`[data-workflow-start-proposal="${activationThird.activationId}"] > summary`);
    await clickButton("Revoke activation proposal");
    await proposalState(activationThird, "revoked");
    assert.equal(calls.revoke.length, 1);
    assert.equal(calls.start.length, 0);
    assert.equal(calls.copy.length, 1);
    assert.equal(calls.import.length, 3);
    window.destroy();
    console.log("Durable workflow renderer scenarios passed");
  };

  void run().then(() => app.exit(0), (error) => {
    console.error(error);
    app.exit(1);
  });
}
