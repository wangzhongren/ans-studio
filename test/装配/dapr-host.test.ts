import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { DaprWorkflowClient, WorkflowRuntime } from "@dapr/dapr";
import type { WorkflowContext } from "@dapr/dapr";
import { createDaprHost } from "../../src/pipeline/orchestration/dapr-host.ts";
import type { DaprHostConnection, DaprHostStatus } from "../../src/pipeline/orchestration/dapr-host.ts";

const execute = promisify(execFile);
const resourceRoot = process.env.ANS_DAPR_TEST_RESOURCE_ROOT;
const realDapr = { skip: !resourceRoot && "Set ANS_DAPR_TEST_RESOURCE_ROOT for native Dapr tests", timeout: 150_000 };
const loopback = "127.0.0.1";

async function dataRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ans-dapr-assembly-"));
}

function ready(status: DaprHostStatus) {
  assert.equal(status.state, "ready", status.diagnostic?.message ?? "Dapr did not report readiness");
  const { processIds, ports, connection } = status;
  assert.ok(processIds && ports && connection);
  assert.equal(connection.daprHost, loopback);
  assert.equal(connection.appId, "ans-studio-workflow");
  return { processIds, ports, connection, generation: status.generation };
}

async function poll(predicate: () => boolean | Promise<boolean>, description: string, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(150);
  }
  assert.fail(description);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function windowsListeners(pids: number[]) {
  const { stdout } = await execute("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    `Get-NetTCPConnection -State Listen -OwningProcess ${pids.join(",")} | Select-Object LocalAddress, LocalPort | ConvertTo-Json`,
  ], { windowsHide: true });
  return JSON.parse(stdout) as { LocalAddress: string; LocalPort: number }[];
}

function sdk(connection: DaprHostConnection) {
  const { daprHost, daprPort, daprApiToken } = connection;
  const options = { daprHost, daprPort, daprApiToken };
  const worker = new WorkflowRuntime(options);
  type ProbeTask = ReturnType<WorkflowContext["createTimer"]> | ReturnType<WorkflowContext["waitForExternalEvent"]>;
  worker.registerWorkflowByName("ans-timer-probe", function* (context, fireAt: number): Generator<
    ProbeTask, { timerFired: boolean; decision: unknown }, unknown
  > {
    yield context.createTimer(new Date(fireAt));
    const decision = yield context.waitForExternalEvent("decision");
    return { timerFired: true, decision };
  });
  return { worker, client: new DaprWorkflowClient(options) };
}

test("Dapr host is lazy and can be stopped repeatedly after missing resources", async () => {
  const root = await dataRoot();
  const host = createDaprHost({ userDataRoot: root, resourceRoot: root });
  assert.deepEqual(host.status(), { state: "stopped", generation: 0 });
  await assert.rejects(access(join(root, "dapr")), { code: "ENOENT" });
  const first = await host.start();
  assert.equal(first.state, "failed");
  assert.equal(first.diagnostic?.code, "runtime-missing");
  assert.equal(first.connection, undefined);
  await Promise.all([host.stop(), host.stop()]);
  assert.deepEqual(host.status(), { state: "stopped", generation: 0 });
});

test("native Dapr locks its data, recovers a due Workflow timer after Scheduler loss and preserves a competing listener", realDapr, async (t) => {
  const userDataRoot = await dataRoot();
  const host = createDaprHost({ userDataRoot, resourceRoot: resourceRoot! });
  t.after(() => host.stop());
  t.diagnostic(`Native user data: ${userDataRoot}`);

  const startedAt = Date.now();
  const [first, duplicate] = await Promise.all([host.start(), host.start()]);
  const initial = ready(first);
  assert.deepEqual(duplicate.processIds, initial.processIds);
  t.diagnostic(`Cold start ${Date.now() - startedAt} ms. Processes ${JSON.stringify(initial.processIds)}`);
  if (process.platform === "win32") {
    const listeners = await windowsListeners([initial.processIds.scheduler, initial.processIds.daprd]);
    assert.deepEqual(new Set(listeners.map((row) => row.LocalAddress)), new Set([loopback]));
    assert.deepEqual(new Set(listeners.map((row) => row.LocalPort)), new Set(Object.values(initial.ports)));
    t.diagnostic(`Native Windows TCP listeners ${JSON.stringify(listeners)}`);
  }
  const rejected = await fetch(`http://${loopback}:${initial.connection.httpPort}/v1.0/metadata`);
  assert.equal(rejected.status, 401);
  await rejected.body?.cancel();
  const contender = createDaprHost({ userDataRoot, resourceRoot: resourceRoot! });
  try {
    assert.equal((await contender.start()).diagnostic?.code, "data-in-use");
  } finally {
    await contender.stop();
  }

  const id = "ans-timer-" + randomUUID();
  const initialSdk = sdk(initial.connection);
  await initialSdk.worker.start();
  assert.ok(initialSdk.worker.isReady);
  const due = Date.now() + 8_000;
  try {
    await initialSdk.client.scheduleNewWorkflow("ans-timer-probe", due, id, undefined, AbortSignal.timeout(5_000));
    await poll(async () => (await initialSdk.client.getWorkflowHistory(id)).some((event) =>
      event.eventType.case === "timerCreated"), "Dapr did not persist the timer");
    assert.ok(Date.now() < due, "timer expired before the fault was injected");
    process.kill(initial.processIds.scheduler, "SIGKILL");
    await poll(() => host.status().state === "failed", "supervisor did not report Scheduler loss");
    assert.equal(host.status().connection, undefined);
    assert.equal(host.status().diagnostic?.code, "process-exited");
    await poll(() => Object.values(initial.processIds).every((pid) => !alive(pid)), "supervisor left a child running");
    t.diagnostic(`Killed Scheduler ${initial.processIds.scheduler} after timerCreated for ${id}. Wakes at ${new Date(due).toISOString()}`);
  } finally {
    await initialSdk.worker.stop();
    await initialSdk.client.stop();
  }

  await delay(Math.max(0, due - Date.now()) + 100);
  const recoveringAt = Date.now();
  const recovered = ready(await host.start());
  assert.equal(recovered.generation, initial.generation + 1);
  assert.deepEqual(recovered.ports, initial.ports);
  assert.notEqual(recovered.connection.daprApiToken, initial.connection.daprApiToken, "token was not rotated");
  t.diagnostic(`Recovery startup ${Date.now() - recoveringAt} ms. Processes ${JSON.stringify(recovered.processIds)}`);
  const recoveredSdk = sdk(recovered.connection);
  await recoveredSdk.worker.start();
  assert.ok(recoveredSdk.worker.isReady);
  try {
    const state = await recoveredSdk.client.getWorkflowState(id, true, AbortSignal.timeout(5_000));
    assert.equal(state?.instanceId, id);
    await poll(async () => (await recoveredSdk.client.getWorkflowHistory(id)).some((event) =>
      event.eventType.case === "timerFired"), "Dapr did not recover its overdue timer", 55_000);
    await recoveredSdk.client.raiseEvent(id, "decision", "approved", AbortSignal.timeout(6_000));
    const completed = await recoveredSdk.client.waitForWorkflowCompletion(id, true, 12);
    assert.deepEqual(completed?.getOutput(), { timerFired: true, decision: "approved" });
    t.diagnostic(`Resumed the original instance ${id} in ${Date.now() - recoveringAt} ms`);
  } finally {
    await recoveredSdk.worker.stop();
    await recoveredSdk.client.stop();
  }

  await Promise.all([host.stop(), host.stop()]);
  assert.equal(host.status().state, "stopped");
  for (const pid of Object.values(recovered.processIds)) assert.equal(alive(pid), false);
  for (const file of ["workflow.db", "scheduler", "scheduler.log", "daprd.log"]) {
    await access(join(userDataRoot, "dapr", file));
  }

  const competitor = createServer((socket) => socket.end("foreign"));
  competitor.listen({ host: loopback, port: recovered.ports.scheduler });
  await once(competitor, "listening");
  try {
    const retained = await readFile(join(userDataRoot, "dapr", "ports.json"), "utf8");
    const conflict = await host.start();
    assert.equal(conflict.diagnostic?.code, "port-in-use");
    assert.equal(conflict.connection, undefined);
    assert.equal(competitor.listening, true);
    assert.equal(await readFile(join(userDataRoot, "dapr", "ports.json"), "utf8"), retained);
    t.diagnostic(`Conflict blocked and retained the persisted layout and foreign listener on port ${recovered.ports.scheduler}`);
  } finally {
    await new Promise<void>((resolve) => competitor.close(() => resolve()));
  }
});

test("native supervisor reaps Scheduler and daprd when its application process is forcibly terminated", realDapr, async (t) => {
  const root = await dataRoot();
  const moduleUrl = new URL("../../src/pipeline/orchestration/dapr-host.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createDaprHost } from ${JSON.stringify(moduleUrl)};
    const host = createDaprHost({
      userDataRoot: ${JSON.stringify(root)},
      resourceRoot: ${JSON.stringify(resourceRoot)},
    });
    const { state, processIds, diagnostic } = await host.start();
    process.send({ state, processIds, diagnostic });
    process.on("disconnect", () => { void host.stop(); });
  `], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const closed = once(child, "exit");
  t.after(async () => {
    if (child.connected) child.disconnect();
    await closed;
  });
  const [message] = await Promise.race([
    once(child, "message"),
    closed.then(([code]) => { throw new Error(`Dapr parent exited before reporting readiness (${code})`); }),
  ]);
  assert.equal(message.state, "ready", message.diagnostic?.message);
  const pids = Object.values(message.processIds) as number[];
  assert.ok(pids.every(alive));
  child.kill("SIGKILL");
  await closed;
  await poll(() => pids.every((pid) => !alive(pid)), "orphaned Dapr process after desktop termination", 15_000);
  t.diagnostic(`Forced application PID ${child.pid} exit cleared all dependent PIDs ${pids.join(", ")}`);
});
