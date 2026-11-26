import { fork } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type DaprHostPorts = Readonly<{
  scheduler: number;
  schedulerHealth: number;
  etcdClient: number;
  etcdPeer: number;
  http: number;
  grpc: number;
  internalGrpc: number;
}>;

export type DaprHostOptions = Readonly<{
  userDataRoot: string;
  resourceRoot: string;
  ports?: Partial<DaprHostPorts>;
}>;

export type DaprHostConnection = Readonly<{
  appId: "ans-studio-workflow";
  daprHost: "127.0.0.1";
  daprPort: string;
  httpPort: number;
  daprApiToken: string;
}>;

type Diagnostic = Readonly<{ code: string; message: string }>;
type ProcessIds = Readonly<{ supervisor: number; scheduler: number; daprd: number }>;

export type DaprHostStatus = Readonly<{
  state: "stopped" | "starting" | "ready" | "failed";
  generation: number;
  connection?: DaprHostConnection;
  diagnostic?: Diagnostic;
  processIds?: ProcessIds;
  ports?: DaprHostPorts;
}>;

export type DaprHost = Readonly<{
  start(): Promise<DaprHostStatus>;
  status(): DaprHostStatus;
  stop(): Promise<void>;
}>;

export type SupervisorMessage =
  | { type: "ready"; connection: DaprHostConnection; processIds: ProcessIds; ports: DaprHostPorts }
  | { type: "failed"; diagnostic: Diagnostic };

function supervisionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: "1" };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

export function createDaprHost(options: DaprHostOptions): DaprHost {
  const input = {
    userDataRoot: resolve(options.userDataRoot),
    resourceRoot: resolve(options.resourceRoot),
    ports: options.ports ? { ...options.ports } : undefined,
  };
  let current: DaprHostStatus = { state: "stopped", generation: 0 };
  let active: {
    running: Promise<DaprHostStatus>;
    closed: Promise<void>;
    requestStop(): void;
  } | undefined;
  let stopping: Promise<void> | undefined;

  function start(): Promise<DaprHostStatus> {
    if (stopping) return stopping.then(() => current);
    if (active) {
      if (current.state === "failed") return active.closed.then(start);
      return active.running;
    }
    current = { state: "starting", generation: current.generation };
    let child: ReturnType<typeof fork>;
    try {
      child = fork(fileURLToPath(new URL("./supervisor.ts", import.meta.url)), [], {
        windowsHide: true,
        execArgv: [],
        env: supervisionEnv(),
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
    } catch (error) {
      current = {
        state: "failed",
        generation: current.generation,
        diagnostic: { code: "supervisor-start", message: String(error) },
      };
      return Promise.resolve(current);
    }
    const started = Promise.withResolvers<DaprHostStatus>();
    const exited = Promise.withResolvers<void>();
    const requestStop = () => {
      if (child.connected) child.send("stop", (error) => {
        if (error && child.connected) child.disconnect();
      });
    };
    active = { running: started.promise, closed: exited.promise, requestStop };
    const fail = (code: string, message: string) => {
      if (stopping || current.state === "failed") return;
      current = { state: "failed", generation: current.generation, diagnostic: { code, message } };
    };
    const timeout = setTimeout(() => {
      fail("supervisor-timeout", "Dapr supervisor did not finish starting within 55 seconds");
      requestStop();
    }, 55_000);
    child.on("error", (error) => fail("supervisor-error", error.message));
    child.on("message", (message: SupervisorMessage) => {
      if (stopping || current.state === "failed") return;
      if (message.type === "failed") {
        fail(message.diagnostic.code, message.diagnostic.message);
        return;
      }
      if (current.state === "starting" && message.type === "ready") {
        clearTimeout(timeout);
        const { connection, processIds, ports } = message;
        current = { state: "ready", generation: current.generation + 1, connection, processIds, ports };
        started.resolve(current);
      }
    });
    let finished = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (stopping) current = { state: "stopped", generation: current.generation };
      else fail("supervisor-exited", `Dapr supervisor exited (${signal ?? code ?? "unknown"})`);
      active = undefined;
      started.resolve(current);
      exited.resolve();
    };
    child.once("exit", finish);
    child.once("close", finish);
    child.send(input, (error) => {
      if (error) {
        fail("supervisor-start", error.message);
        requestStop();
      }
    });
    return started.promise;
  }

  function stop(): Promise<void> {
    if (stopping) return stopping;
    if (!active) {
      current = { state: "stopped", generation: current.generation };
      return Promise.resolve();
    }
    const { closed, requestStop } = active;
    current = { state: "stopped", generation: current.generation };
    stopping = closed.finally(() => { stopping = undefined; });
    requestStop();
    return stopping;
  }

  return { start, status: () => current, stop };
}
