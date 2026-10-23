// 后台任务测试共享夹具（运行时核心 test/runtime-core；不是测试文件，不会被 node --test 直接执行）。
// 受控 spawn 替身只用于无法用真实 SIGKILL 稳定复现的分支（kill-timeout 未收口、并发/保留上限的快速批量
// 任务）；断言仍走管理器真实计时与事件路径，不预置结果。
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BackgroundTaskManagerDependencies } from "../../src/common/runtime-core/background-tasks.ts";
import type { DiagnosticLog, GovernedToolsOptions, ShellGate, WriteGate } from "../../src/model/runtime.ts";
import { buildGovernedTools, buildShellEnv } from "../../src/provider/runtime/tools.ts";

export type SpawnImpl = NonNullable<BackgroundTaskManagerDependencies["spawnImpl"]>;
export type KillImpl = NonNullable<BackgroundTaskManagerDependencies["killTreeImpl"]>;

export const boundMs = 8000;

export const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-background-"));

export function waitUntil(predicate: () => boolean, timeoutMs = boundMs): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = (): void => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("fixture wait timed out"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startInput(root: string, code: string) {
  return {
    command: `${process.execPath} -e ${JSON.stringify(code)}`,
    argv: [process.execPath, "-e", code],
    cwd: root,
    env: buildShellEnv(process.env),
  };
}

/** 与 run_shell 同源的凭据剥离环境（测试直接构造 start 入参用）。 */
export function baseEnv(): Record<string, string> {
  return buildShellEnv(process.env);
}

/** 诊断替身：记录事件名与原始字段（生产 logger 另有白名单；本替身原样记录供断言）。 */
export function spyDiagnostics(): { log: DiagnosticLog; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log: DiagnosticLog = {
    record(event, fields) { events.push({ event, fields }); },
    error(event, _error, fields) { events.push({ event, fields }); },
  };
  return { log, events };
}

export class FakeChild extends EventEmitter {
  readonly pid: number;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  kill(): boolean {
    return true;
  }
}

export interface FakeSpawner {
  spawnImpl: SpawnImpl;
  children: FakeChild[];
  spawnCalls: () => number;
}

export interface FakeBehavior {
  failSpawn?: string;
  errorAfterSpawn?: string;
  autoExit?: boolean;
  /** 仅当第 N 次 spawn 之后才自动退出（用于「运行中永不淘汰」用例）。 */
  autoExitFrom?: number;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}

export function fakeSpawner(behavior: FakeBehavior = {}): FakeSpawner {
  const children: FakeChild[] = [];
  let calls = 0;
  const spawnImpl = (() => {
    calls += 1;
    const child = new FakeChild(9000 + calls);
    children.push(child);
    const index = calls;
    queueMicrotask(() => {
      if (behavior.failSpawn !== undefined) {
        child.emit("error", new Error(behavior.failSpawn));
        return;
      }
      child.emit("spawn");
      if (behavior.stdout !== undefined) child.stdout.emit("data", Buffer.from(behavior.stdout));
      if (behavior.stderr !== undefined) child.stderr.emit("data", Buffer.from(behavior.stderr));
      if (behavior.errorAfterSpawn !== undefined) {
        queueMicrotask(() => child.emit("error", new Error(behavior.errorAfterSpawn)));
        return;
      }
      const autoExit = behavior.autoExit === true || (behavior.autoExitFrom !== undefined && index > behavior.autoExitFrom);
      if (autoExit) queueMicrotask(() => child.emit("close", behavior.exitCode === undefined ? 0 : behavior.exitCode, null));
    });
    return child;
  }) as unknown as SpawnImpl;
  return { spawnImpl, children, spawnCalls: () => calls };
}

/** 终止替身：默认让子进程立刻 close；可指定从第 N 次调用起才 close（模拟未收口）。 */
export function closeOnKill(fromCall = 1): KillImpl {
  let calls = 0;
  return ((child: FakeChild) => {
    calls += 1;
    if (calls >= fromCall) queueMicrotask(() => child.emit("close", null, "SIGTERM"));
  }) as unknown as KillImpl;
}

export const allow: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } });
export const allowShellGate: ShellGate = async () => ({ allow: true, by: "fixture" });

export function toolsFor(gate: WriteGate, options?: GovernedToolsOptions) {
  return new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
}
