import { open, readFile, rename } from "node:fs/promises";
import { createServer } from "node:net";
import type { Server } from "node:net";
import { join } from "node:path";
import type { DaprHostPorts } from "./host.ts";

export const loopback = "127.0.0.1";
export const schedulerPorts = ["scheduler", "schedulerHealth", "etcdClient", "etcdPeer"] as const;
export const sidecarPorts = ["http", "grpc", "internalGrpc"] as const;
const roles = [...schedulerPorts, ...sidecarPorts] as const;
type PortRole = typeof roles[number];

export class HostFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function validPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port > 0 && port <= 65_535;
}

async function persistPorts(filename: string, ports: DaprHostPorts): Promise<void> {
  const pending = filename + ".tmp";
  const file = await open(pending, "w", 0o600);
  try {
    await file.writeFile(JSON.stringify(ports) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(pending, filename);
}

export async function reservePorts(root: string, explicit: Partial<DaprHostPorts> | undefined) {
  const filename = join(root, "ports.json");
  const existing = await readFile(filename, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  let fixed: Partial<DaprHostPorts> = explicit ?? {};
  if (existing !== undefined) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (!parsed || typeof parsed !== "object" || !roles.every((key) =>
        validPort(Object.getOwnPropertyDescriptor(parsed, key)?.value))) throw new Error();
      fixed = parsed as DaprHostPorts;
    } catch {
      throw new HostFailure("port-layout-invalid", "Dapr persisted port layout is invalid");
    }
    if (roles.some((key) => explicit?.[key] !== undefined && explicit[key] !== fixed[key])) {
      throw new HostFailure("port-layout-mismatch", "Dapr data directory already has a different port layout");
    }
  }
  const configured = roles.flatMap((key) => fixed[key] === undefined ? [] : [fixed[key]]);
  if (configured.some((port) => !validPort(port)) || new Set(configured).size !== configured.length) {
    throw new HostFailure("port-layout-invalid", "Dapr ports must be distinct integers from 1 to 65535");
  }

  const held = new Map<PortRole, Server>();
  async function release(keys: readonly PortRole[] = roles): Promise<void> {
    await Promise.all(keys.map((key) => {
      const server = held.get(key);
      held.delete(key);
      return new Promise<void>((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
    }));
  }
  const ports = {} as Record<PortRole, number>;
  try {
    // Hold explicit ports first so the OS cannot allocate one of them as an ephemeral port.
    const order = [...roles.filter((key) => fixed[key] !== undefined), ...roles.filter((key) => fixed[key] === undefined)];
    for (const key of order) {
      const server = createServer((socket) => socket.destroy());
      const port = fixed[key] ?? 0;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: loopback, port, exclusive: true }, resolve);
      }).catch((error: NodeJS.ErrnoException) => {
        const code = error.code === "EADDRINUSE" ? "port-in-use" : "port-unavailable";
        throw new HostFailure(code, `Dapr ${key} cannot reserve ${loopback}:${port} (${error.code ?? "unknown error"})`);
      });
      held.set(key, server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new HostFailure("port-unavailable", `Dapr ${key} has no TCP listener address`);
      }
      ports[key] = address.port;
    }
    if (existing === undefined) await persistPorts(filename, ports);
    return { ports, release };
  } catch (error) {
    await release();
    throw error;
  }
}
