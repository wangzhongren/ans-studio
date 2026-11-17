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

const here = fileURLToPath(import.meta.url);
const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = join(tmpdir(), "ans-durable-fixture");
const otherRoot = join(tmpdir(), "ans-ordinary-fixture");
const instanceId = "dw-renderer-fixture";
const requestId = "release-renderer-fixture";
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
      ["startDurableWorkflow", "start"],
      ["getDurableWorkflowProjection", "projection"],
    ]) {
      assert.ok(ipc.includes(`"${method}"`));
      assert.ok(preload.includes(`${method}: input => ipcRenderer.invoke("durable-workflow:${channel}", input)`));
    }
    assert.match(panel, /enabled && drawerOpen \? \(/);
    assert.match(panel, /pendingOperator\[approval\.requestId\]/);
    assert.match(panel, /useDecisionCenterStore\.getState\(\)\.open\(approval\.requestId\)/);
    assert.doesNotMatch(panel, /operatorRespond|\bipcRenderer\b|node:/);
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
  test("task drawer exercises the built renderer, preload and release card in Electron", {
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
  const definition = { id: "path-b", file: "path-b.yaml", version: 2, digest };
  const invalid = { id: "bad", file: "bad.yaml", error: {
    code: "definition-invalid", path: "$.steps.impact.on", message: "Missing outcome branch",
  } };
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
    projection: [] as unknown[],
    start: [] as unknown[],
    operator: [] as unknown[],
  };
  let pickedRoot = root;
  let hasInstance = false;
  let connected = true;
  let dropNextStart = true;
  const projection = () => ({
    controlPlane: connected ? { state: "ready" } : { state: "failed", code: "port-conflict", message: "Port unavailable" },
    ...(hasInstance ? { instance: connected ? instance : { ...instance, engine: "offline", blockedReason: "Waiting for the local engine" } } : {}),
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
    return ok(input.projectRoot === root ? projection() : { controlPlane: { state: "stopped" } });
  });
  ipcMain.handle("durable-workflow:list", (_, input) => {
    calls.list.push(input);
    return ok({ definitions: [definition, invalid], controlPlane: { state: "ready" } });
  });
  ipcMain.handle("durable-workflow:validate", (_, input) => {
    calls.validation.push(input);
    return input.definitionId === invalid.id ? { ...invalid.error, ok: false } : ok(definition);
  });
  ipcMain.handle("durable-workflow:start", (_, input) => {
    calls.start.push(input);
    if (dropNextStart) {
      dropNextStart = false;
      return { ok: false, code: "workflow-operation-failed", message: "Start response was lost" };
    }
    hasInstance = true;
    return ok(projection());
  });
  ipcMain.handle("session:operator-response", (_, input) => {
    calls.operator.push(input);
    instance.approval.status = "reject";
    instance.status = "stopped";
    return { ok: true };
  });

  const run = async () => {
    await app.whenReady();
    const window = new BrowserWindow({
      show: false,
      width: 1100,
      height: 800,
      webPreferences: { preload: join(repo, "app/preload.cjs"), contextIsolation: true, sandbox: true },
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
      await waitFor(`${panel}.querySelector("select")?.options.length === 3`);
      await js(`{
        const select = ${panel}.querySelector("select");
        select.value = ${JSON.stringify(file)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }`);
    };
    const pickProject = async () => {
      await click("#btn-import");
      await waitFor(`document.getElementById("project-path").textContent === ${JSON.stringify(pickedRoot)}`);
      await click("#tab-tasks");
      await includes("Durable workflow prototype");
    };

    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    assert.equal(calls.projection.length, 0);
    assert.equal(calls.list.length, 0);
    await click("[data-durable-workflow] > summary");
    await includes("This project has no durable workflow instance.");
    assert.equal(calls.list.length, 0);
    assert.equal(calls.start.length, 0);

    await click('[data-durable-workflow] input[type="checkbox"]');
    await select("bad.yaml");
    await includes("$.steps.impact.on");
    await clickButton("Validate YAML");
    await includes("Missing outcome branch");
    assert.equal(await js(`${button("Start instance")}.disabled`), true);
    assert.equal(calls.start.length, 0);

    await select("path-b.yaml");
    await clickButton("Validate YAML");
    await includes("Definition validated");
    await includes(digest);
    await js(`{
      const field = ${panel}.querySelector("textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, "  Review the workflow  ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }`);
    await clickButton("Start instance");
    await includes("The start result is unknown.");
    assert.equal(calls.start.length, 1);
    await clickButton("Retry start");
    await includes(instanceId);
    assert.equal(calls.start.length, 2);
    assert.deepEqual(calls.start[0], calls.start[1]);
    assert.deepEqual(calls.start[0], {
      projectRoot: root, definitionId: definition.id, enabled: true,
      summary: "Review the workflow", requestId: (calls.start[0] as { requestId: string }).requestId,
    });
    assert.match((calls.start[0] as { requestId: string }).requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(calls.validation, [
      { projectRoot: root, definitionId: invalid.id },
      { projectRoot: root, definitionId: definition.id },
    ]);
    await includes(requestId);
    await includes("B4 customer approval and local merge");
    await includes("Awaiting customer decision");

    connected = false;
    await includes("Port unavailable");
    await includes("Waiting for the local engine");
    await includes("Waiting to reconnect");
    assert.equal(calls.start.length, 2);
    connected = true;
    await waitFor(`!${panel}.textContent.includes("Port unavailable")`);
    assert.equal(calls.start.length, 2);

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

    // A fresh renderer queries the existing instance without enable or start.
    await window.loadFile(join(repo, "app/renderer/dist/index.html"));
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await includes(instanceId);
    assert.equal(await js(`${panel}.querySelector('input[type="checkbox"]').checked`), false);
    assert.equal(calls.list.length, 1);
    assert.equal(calls.start.length, 2);

    await click("#drawer-close");
    pickedRoot = otherRoot;
    await pickProject();
    await click("[data-durable-workflow] > summary");
    await includes("This project has no durable workflow instance.");
    assert.equal(await js(`${panel}.textContent.includes(${JSON.stringify(instanceId)})`), false);
    assert.equal(calls.list.length, 1);
    assert.equal(calls.start.length, 2);
    window.destroy();
    console.log("Durable workflow renderer scenarios passed");
  };

  void run().then(() => app.exit(0), (error) => {
    console.error(error);
    app.exit(1);
  });
}
