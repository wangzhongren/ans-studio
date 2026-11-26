import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import type { DaprHostConnection, DaprHostOptions, DaprHostPorts, SupervisorMessage } from "./host.ts";
import { HostFailure, loopback, reservePorts, schedulerPorts, sidecarPorts } from "./ports.ts";

const appId = "ans-studio-workflow";
const schedulerId = "dapr-scheduler-server-0";
const stateStore = "workflow-state";
const stopSignal = new AbortController();

async function findBinaries(root: string) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const platform = process.platform === "win32" ? "win" : "mac";
  for (const directory of [
    join(root, "dapr-runtime"),
    join(root, "release-output", "dapr-assets", `${platform}-${process.arch}`, "dapr-runtime"),
  ]) {
    const binaries = { scheduler: join(directory, "scheduler" + suffix), daprd: join(directory, "daprd" + suffix) };
    const usable = await Promise.all(Object.values(binaries).map((file) =>
      access(file, constants.X_OK).then(() => true, () => false)));
    if (usable.every(Boolean)) return binaries;
  }
  throw new HostFailure("runtime-missing", "Bundled Dapr Scheduler and daprd are unavailable");
}

async function configureSidecar(root: string) {
  await mkdir(join(root, "components"), { recursive: true, mode: 0o700 });
  await writeFile(join(root, "components", "state.yaml"),
    `apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: ${stateStore}
spec:
  type: state.sqlite
  version: v1
  metadata:
    - name: connectionString
      value: "workflow.db"
    - name: actorStateStore
      value: "true"
`, { mode: 0o600 });
  await writeFile(join(root, "config.yaml"),
    `apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: ans-local
spec:
  tracing:
    samplingRate: "0"
  nameResolution:
    component: "sqlite"
    version: "v1"
    configuration:
      connectionString: "resolver.db"
`, { mode: 0o600 });
}

function nativeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { DAPR_HOST_IP: loopback };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function acquireOwner(root: string): DatabaseSync {
  const owner = new DatabaseSync(join(root, "host-lock.db"));
  try {
    // An OS file lock is released on process exit, including forced desktop termination.
    owner.exec("BEGIN IMMEDIATE");
    return owner;
  } catch (error) {
    owner.close();
    if ((error as { errcode?: number }).errcode === 5) {
      throw new HostFailure("data-in-use", "Another Dapr supervisor owns this application data directory");
    }
    throw error;
  }
}

function logArgs(name: string): string[] {
  return [
    "--log-as-json", "--log-file", name + ".log",
    "--log-file-max-size", "2", "--log-file-max-backups", "2", "--log-file-max-age", "7",
  ];
}

function startNative(role: string, executable: string, args: string[], root: string, env: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, {
    cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => { output = (output + chunk).slice(-8_192); });
  }
  let launchError: Error | undefined;
  child.on("error", (error) => { launchError = error; });
  const exited = new Promise<void>((resolve) => {
    child.once("close", () => {
      if (!stopSignal.signal.aborted) {
        const portConflict = /address already in use|only one usage of each socket address/i.test(output);
        const reason = launchError?.message ?? `exit ${child.signalCode ?? child.exitCode ?? "unknown"}`;
        stopSignal.abort(new HostFailure(
          portConflict ? "port-in-use" : "process-exited",
          `Dapr ${role} stopped (${reason}). See ${role.toLowerCase()}.log in application data.`,
        ));
      }
      resolve();
    });
  });
  return { child, exited };
}

function schedulerArgs(ports: DaprHostPorts): string[] {
  return [
    "--id", schedulerId, "--etcd-embed=true", "--etcd-data-dir", "scheduler",
    "--port", String(ports.scheduler), "--listen-address", loopback,
    "--override-broadcast-host-port", `${loopback}:${ports.scheduler}`,
    "--healthz-port", String(ports.schedulerHealth), "--healthz-listen-address", loopback,
    "--etcd-client-port", String(ports.etcdClient), "--etcd-client-listen-address", loopback,
    "--etcd-initial-cluster", `${schedulerId}=http://${loopback}:${ports.etcdPeer}`,
    "--placement-enabled", "--enable-metrics=false", ...logArgs("scheduler"),
  ];
}

function sidecarArgs(ports: DaprHostPorts): string[] {
  return [
    "--app-id", appId, "--config", "config.yaml", "--resources-path", "components",
    "--dapr-http-port", String(ports.http), "--dapr-grpc-port", String(ports.grpc),
    "--dapr-listen-addresses", loopback,
    "--dapr-internal-grpc-port", String(ports.internalGrpc), "--dapr-internal-grpc-listen-address", loopback,
    "--scheduler-host-address", `${loopback}:${ports.scheduler}`,
    "--enable-metrics=false", "--enable-mtls=false", ...logArgs("daprd"),
  ];
}

async function http(port: number, path: string, token?: string, method = "GET") {
  return fetch(`http://${loopback}:${port}${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(750),
    headers: token ? { "dapr-api-token": token } : undefined,
  });
}

async function healthy(port: number, path: string, token?: string): Promise<boolean> {
  try {
    const response = await http(port, path, token);
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function awaitHealth(check: () => Promise<boolean>, stage: string, deadline: number) {
  while (Date.now() < deadline) {
    stopSignal.signal.throwIfAborted();
    if (await check()) return;
    await delay(250, undefined, { signal: stopSignal.signal });
  }
  throw new HostFailure("startup-timeout", `Dapr ${stage} did not become ready. See application data logs.`);
}

async function registeredStateStore(port: number, token: string): Promise<boolean> {
  try {
    const response = await http(port, "/v1.0/metadata", token);
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const metadata = await response.json() as { id?: string; components?: { name: string; type: string }[] };
    return metadata.id === appId && metadata.components?.some((entry) =>
      entry.name === stateStore && entry.type === "state.sqlite") === true;
  } catch {
    return false;
  }
}

async function quit(native: ReturnType<typeof startNative> | undefined, sidecar?: DaprHostConnection) {
  if (!native) return;
  const { child, exited } = native;
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    await exited;
    return;
  }
  try {
    if (sidecar) {
      const response = await http(sidecar.httpPort, "/v1.0/shutdown", sidecar.daprApiToken, "POST");
      await response.body?.cancel();
      if (!response.ok) child.kill("SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
  const escalation = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 5_000);
  try {
    await exited;
  } finally {
    clearTimeout(escalation);
  }
}

function send(message: SupervisorMessage) {
  if (process.connected) process.send?.(message, () => {});
}

async function run(options: DaprHostOptions) {
  const root = join(options.userDataRoot, "dapr");
  let owner: DatabaseSync | undefined;
  let reserved: Awaited<ReturnType<typeof reservePorts>> | undefined;
  let scheduler: ReturnType<typeof startNative> | undefined;
  let daprd: ReturnType<typeof startNative> | undefined;
  let connection: DaprHostConnection | undefined;
  try {
    const binaries = await findBinaries(options.resourceRoot);
    await mkdir(root, { recursive: true, mode: 0o700 });
    owner = acquireOwner(root);
    reserved = await reservePorts(root, options.ports);
    await configureSidecar(root);
    const { ports } = reserved;
    const env = nativeEnv();
    const deadline = Date.now() + 45_000;
    const schedulerHealthy = () => healthy(ports.schedulerHealth, "/healthz");
    const daprApiToken = randomBytes(32).toString("hex");
    const daprdHealthy = () => healthy(ports.http, "/v1.0/healthz/outbound", daprApiToken);

    await reserved.release(schedulerPorts);
    stopSignal.signal.throwIfAborted();
    scheduler = startNative("Scheduler", binaries.scheduler, schedulerArgs(ports), root, env);
    await awaitHealth(schedulerHealthy, "Scheduler", deadline);
    await reserved.release(sidecarPorts);
    stopSignal.signal.throwIfAborted();
    daprd = startNative("daprd", binaries.daprd, sidecarArgs(ports), root, { ...env, DAPR_API_TOKEN: daprApiToken });
    connection = { appId, daprHost: loopback, daprPort: String(ports.grpc), httpPort: ports.http, daprApiToken };
    await awaitHealth(async () => await daprdHealthy() && await registeredStateStore(ports.http, daprApiToken),
      "sidecar and Workflow state store", deadline);
    stopSignal.signal.throwIfAborted();
    if (!scheduler.child.pid || !daprd.child.pid) throw new HostFailure("process-exited", "Dapr child process is missing");
    send({
      type: "ready", connection, ports,
      processIds: { supervisor: process.pid, scheduler: scheduler.child.pid, daprd: daprd.child.pid },
    });
    let misses = 0;
    for (;;) {
      await delay(2_000, undefined, { signal: stopSignal.signal });
      const status = await Promise.all([schedulerHealthy(), daprdHealthy()]);
      misses = status.every(Boolean) ? 0 : misses + 1;
      if (misses >= 3) throw new HostFailure("health-lost", "Dapr control plane stopped responding on loopback");
    }
  } catch (error) {
    const reason: unknown = stopSignal.signal.aborted ? stopSignal.signal.reason : error;
    const diagnostic = reason instanceof HostFailure
      ? { code: reason.code, message: reason.message }
      : { code: "host-start", message: reason instanceof Error ? reason.message : String(reason) };
    send({ type: "failed", diagnostic });
  } finally {
    stopSignal.abort();
    try {
      await reserved?.release();
      await quit(daprd, connection);
    } finally {
      try {
        await quit(scheduler);
      } finally {
        owner?.close();
        if (process.connected) process.disconnect?.();
      }
    }
  }
}

if (process.connected) {
  process.once("disconnect", () => stopSignal.abort());
  process.once("SIGTERM", () => stopSignal.abort());
  process.once("SIGINT", () => stopSignal.abort());
  process.once("message", (options: DaprHostOptions) => {
    process.on("message", (request) => {
      if (request === "stop") stopSignal.abort();
    });
    void run(options);
  });
}
