// 会话级后台任务管理器（2026-10-22 客户确认设计 B1–B4；运行时核心私有实现）。
//
// 归属：`src/common/runtime-core/`（运行时核心私有辅助）。本模块只依赖 Node 标准库、共享诊断类型与
// `process-tree.ts`，不 import Service/Provider 实现。任务表/日志/pid **只在内存**，不写盘、不读盘、
// 不跨会话或应用重启。
//
// 安全纪律（设计 §3.2）：`start` 是**唯一 spawn 入口**，只允许启动工具在审核结果恰为 `allow:true`
// 时调用；本模块不提供任何绕过审核的公共入口，也不解释 shell（`shell:false`）。
import { spawn } from "node:child_process";
import { killProcessTree } from "./process-tree.ts";
import type {
  BackgroundTaskCapability,
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskSnapshot,
  BackgroundTaskStartInput,
  BackgroundTaskStartResult,
  BackgroundTaskState,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
  BackgroundTaskStreamRead,
  DiagnosticLog,
} from "../../model/runtime.ts";

/** 同时运行任务数上限（设计 §3.3；第 9 个在 ShellGate 之前被拒——su 核对点 CC1）。 */
export const BACKGROUND_TASK_MAX_RUNNING = 8;
/** 保留任务数上限（运行中的任务永不淘汰；超出时淘汰最老的已结束任务）。 */
export const BACKGROUND_TASK_MAX_RETAINED = 32;
/** 每任务每路输出缓冲上限（字节环形缓冲）。 */
export const BACKGROUND_TASK_STREAM_LIMIT_BYTES = 256 * 1024;
/** `read` 默认尾部行数（与 session_tail 的默认 40 一致）。 */
export const BACKGROUND_TASK_DEFAULT_TAIL_LINES = 40;
/** `read` 尾部行数上限（与 session_tail 的上限 200 一致）。 */
export const BACKGROUND_TASK_MAX_TAIL_LINES = 200;
/** 等待 `spawn`/`error` 事件的短上界：拿到 pid 才返回任务号，避免「说启动了其实没有」。 */
export const BACKGROUND_TASK_SPAWN_WAIT_MS = 2000;
/** SIGTERM → SIGKILL 的升级间隔（与 run_shell 现有终止预算一致）。 */
export const BACKGROUND_TASK_KILL_GRACE_MS = 250;
/** SIGKILL 后等待 `close` 的收口上限（与 run_shell 现有清理预算一致）。 */
export const BACKGROUND_TASK_KILL_SETTLE_MS = 1000;

/**
 * 每路输出的字节环形缓冲：容量固定 256 KiB，记录已丢弃字节数；读取时给出尾部文本并如实标 truncated。
 * 前端被环形覆盖切到多字节序列中间时，解码前丢弃悬空的 continuation 字节；尾部不完整序列同样丢弃，
 * 避免返回损坏的 UTF-8 字符（设计 §3.3「UTF-8 安全截断」）。
 */
class ByteRingBuffer {
  readonly capacity: number;
  private readonly buffer: Buffer;
  private start = 0;
  private length = 0;
  private dropped = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = Buffer.allocUnsafe(capacity);
  }

  get truncated(): boolean {
    return this.dropped > 0;
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    if (chunk.length >= this.capacity) {
      this.dropped += this.length + (chunk.length - this.capacity);
      chunk.copy(this.buffer, 0, chunk.length - this.capacity);
      this.start = 0;
      this.length = this.capacity;
      return;
    }
    const overflow = Math.max(0, this.length + chunk.length - this.capacity);
    if (overflow > 0) {
      this.start = (this.start + overflow) % this.capacity;
      this.length -= overflow;
      this.dropped += overflow;
    }
    const end = (this.start + this.length) % this.capacity;
    const first = Math.min(chunk.length, this.capacity - end);
    chunk.copy(this.buffer, end, 0, first);
    if (first < chunk.length) chunk.copy(this.buffer, 0, first);
    this.length += chunk.length;
  }

  /** 按写入顺序返回当前字节（拷贝；容量有界）。 */
  bytes(): Buffer {
    if (this.length === 0) return Buffer.alloc(0);
    const out = Buffer.allocUnsafe(this.length);
    const first = Math.min(this.length, this.capacity - this.start);
    this.buffer.copy(out, 0, this.start, this.start + first);
    if (first < this.length) this.buffer.copy(out, first, 0, this.length - first);
    return out;
  }

  /** 解码为文本：丢弃缓冲区前端悬空的 continuation 字节与尾部不完整的多字节序列。 */
  text(): string {
    if (this.length === 0) return "";
    const bytes = this.bytes();
    let begin = 0;
    while (begin < bytes.length && (bytes[begin]! & 0xc0) === 0x80) begin += 1;
    let end = bytes.length;
    let cursor = end - 1;
    let continuation = 0;
    while (cursor >= begin && (bytes[cursor]! & 0xc0) === 0x80) {
      continuation += 1;
      cursor -= 1;
    }
    if (cursor >= begin) {
      const lead = bytes[cursor]!;
      const expected = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc0 ? 1 : 0;
      if (expected > continuation) end = cursor;
    }
    return bytes.subarray(begin, end).toString("utf8");
  }
}

interface ManagedTask {
  taskId: string;
  command: string;
  state: BackgroundTaskState;
  pid?: number;
  startedAtMs: number;
  startedAtIso: string;
  child: ReturnType<typeof spawn>;
  env: Record<string, string>;
  stdout: ByteRingBuffer;
  stderr: ByteRingBuffer;
  /** `spawn` 事件已确认（只有此时任务才对 list/read/stop 可见）。 */
  spawned: boolean;
  closed: boolean;
  exitCode?: number;
  signal?: string;
  error?: string;
  endedAtMs?: number;
  stopRequested: boolean;
  stopPromise?: Promise<BackgroundTaskStopResult>;
  closeWaiters: Array<() => void>;
}

/** 测试注入缝（生产不传）：spawn 与进程树终止仍由本管理器唯一持有。 */
export interface BackgroundTaskManagerDependencies {
  spawnImpl?: typeof spawn;
  killTreeImpl?: typeof killProcessTree;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tailLinesOf(text: string, count: number): string {
  if (text === "") return "";
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const tail = lines.slice(Math.max(0, lines.length - count));
  return tail.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)).join("\n");
}

function readStream(buffer: ByteRingBuffer, tailLines: number): BackgroundTaskStreamRead {
  return { text: tailLinesOf(buffer.text(), tailLines), truncated: buffer.truncated };
}

/**
 * 创建会话级后台任务管理器。Service 在 `providerFor` 中、走 `buildGovernedTools` 且注入了
 * `ShellGate` 时创建一个实例；绑定会话 `dispose` 时调用其 `dispose()`。
 */
export function createBackgroundTaskManager(options: BackgroundTaskManagerDependencies & { diagnostics?: DiagnosticLog } = {}): BackgroundTaskCapability {
  const diagnostics = options.diagnostics;
  const spawnImpl = options.spawnImpl ?? spawn;
  const killTree = options.killTreeImpl ?? killProcessTree;
  const tasks = new Map<string, ManagedTask>();
  let sequence = 0;
  let closed = false;
  let disposePromise: Promise<void> | undefined;
  const useProcessGroup = process.platform !== "win32";

  const runningCount = (): number => {
    let count = 0;
    for (const task of tasks.values()) if (!task.closed) count += 1;
    return count;
  };

  const snapshotOf = (task: ManagedTask): BackgroundTaskSnapshot => {
    const ended = task.closed ? task.endedAtMs : undefined;
    return {
      taskId: task.taskId,
      state: task.state,
      ...(task.pid !== undefined ? { pid: task.pid } : {}),
      command: task.command,
      startedAt: task.startedAtIso,
      ...(task.exitCode !== undefined ? { exitCode: task.exitCode } : {}),
      ...(task.signal !== undefined ? { signal: task.signal } : {}),
      ...(task.error !== undefined ? { error: task.error } : {}),
      durationMs: Math.max(0, (ended ?? Date.now()) - task.startedAtMs),
    };
  };

  /** 保留上限：只淘汰最老的**已结束**任务；运行中的任务永不淘汰。 */
  const enforceRetention = (): void => {
    const visible = [...tasks.values()].filter((task) => task.spawned);
    if (visible.length <= BACKGROUND_TASK_MAX_RETAINED) return;
    const ended = visible.filter((task) => task.closed).sort((left, right) => left.startedAtMs - right.startedAtMs);
    let excess = visible.length - BACKGROUND_TASK_MAX_RETAINED;
    for (const task of ended) {
      if (excess <= 0) break;
      tasks.delete(task.taskId);
      excess -= 1;
    }
  };

  const waitClosed = (task: ManagedTask, timeoutMs: number): Promise<boolean> => {
    if (task.closed) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (observed: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(observed);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      task.closeWaiters.push(() => finish(true));
    });
  };

  const timeoutResult = (task: ManagedTask, began: number): BackgroundTaskStopResult => {
    if (!task.closed && task.state !== "failed") task.state = "kill-timeout";
    diagnostics?.record("background.stop.timeout", { pid: task.pid, state: task.state, durationMs: Date.now() - began });
    return {
      ok: false,
      reason: "timeout",
      message: `任务 ${task.taskId} 的终止预算（SIGTERM→${BACKGROUND_TASK_KILL_GRACE_MS}ms→SIGKILL→${BACKGROUND_TASK_KILL_SETTLE_MS}ms）内未观察到进程退出`,
      task: snapshotOf(task),
    };
  };

  const terminateTask = async (task: ManagedTask, force: boolean): Promise<BackgroundTaskStopResult> => {
    if (task.closed) return { ok: true, task: snapshotOf(task), alreadyEnded: true };
    const began = Date.now();
    task.stopRequested = true;
    if (force) {
      killTree(task.child, "SIGKILL", useProcessGroup, task.env);
      const observed = await waitClosed(task, BACKGROUND_TASK_KILL_SETTLE_MS);
      if (!observed) return timeoutResult(task, began);
    } else {
      killTree(task.child, "SIGTERM", useProcessGroup, task.env);
      let observed = await waitClosed(task, BACKGROUND_TASK_KILL_GRACE_MS);
      if (!observed) {
        killTree(task.child, "SIGKILL", useProcessGroup, task.env);
        observed = await waitClosed(task, BACKGROUND_TASK_KILL_SETTLE_MS);
      }
      if (!observed) return timeoutResult(task, began);
    }
    // 观察到真实 close：若此前标记过 kill-timeout（更早一次 stop 预算耗尽），以本次真实事件为准更新。
    if (task.state !== "failed") task.state = "stopped";
    diagnostics?.record("background.stop", { pid: task.pid, state: task.state, durationMs: Date.now() - began });
    return { ok: true, task: snapshotOf(task), alreadyEnded: false };
  };

  const start = async (input: BackgroundTaskStartInput): Promise<BackgroundTaskStartResult> => {
    if (closed) return { ok: false, reason: "closed", message: "会话已关闭，未启动" };
    if (runningCount() >= BACKGROUND_TASK_MAX_RUNNING) {
      return {
        ok: false,
        reason: "limit",
        message: `当前会话运行中的后台任务已达上限（${BACKGROUND_TASK_MAX_RUNNING} 个）；未启动任何进程`,
      };
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnImpl(input.argv[0]!, input.argv.slice(1), {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env: input.env,
        ...(useProcessGroup ? { detached: true } : {}),
      });
    } catch (error) {
      return { ok: false, reason: "spawn-failed", message: `进程启动失败：${reasonOf(error)}` };
    }

    const task: ManagedTask = {
      taskId: `bg-${++sequence}`,
      command: input.command,
      state: "running",
      startedAtMs: Date.now(),
      startedAtIso: new Date().toISOString(),
      child,
      env: input.env,
      stdout: new ByteRingBuffer(BACKGROUND_TASK_STREAM_LIMIT_BYTES),
      stderr: new ByteRingBuffer(BACKGROUND_TASK_STREAM_LIMIT_BYTES),
      spawned: false,
      closed: false,
      stopRequested: false,
      closeWaiters: [],
    };
    tasks.set(task.taskId, task);

    // 日志可能在 `spawn` 事件前后到达；立即挂监听，spawn 失败时随任务丢弃。
    child.stdout?.on("data", (data: Buffer) => task.stdout.append(Buffer.from(data)));
    child.stderr?.on("data", (data: Buffer) => task.stderr.append(Buffer.from(data)));
    child.on("close", (code, signal) => {
      if (task.closed) return;
      task.closed = true;
      task.exitCode = code ?? undefined;
      task.signal = signal ?? undefined;
      task.endedAtMs = Date.now();
      // 启动失败（未确认 spawn）不产生 background.exit，也不改状态；失败分支会丢弃任务。
      if (!task.spawned) {
        for (const waiter of task.closeWaiters.splice(0)) waiter();
        return;
      }
      if (task.stopRequested) {
        if (task.state !== "kill-timeout") task.state = "stopped";
      } else if (task.state !== "failed") {
        task.state = "exited";
      }
      for (const waiter of task.closeWaiters.splice(0)) waiter();
      diagnostics?.record("background.exit", {
        pid: task.pid,
        state: task.state,
        exitCode: task.exitCode,
        signal: task.signal,
        durationMs: task.endedAtMs - task.startedAtMs,
      });
    });
    child.on("error", (error) => {
      if (task.closed) return;
      task.error = reasonOf(error);
      // 启动失败由下方 spawn/error 竞速分支处理（任务会被丢弃）；只有 spawn 已确认后的运行错误
      // 才把任务状态置为 failed。
      if (task.spawned && !task.stopRequested && task.state === "running") task.state = "failed";
    });

    const spawnOutcome = await new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      let settled = false;
      const finish = (value: { ok: true } | { ok: false; error: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: `等待 spawn 事件超过 ${BACKGROUND_TASK_SPAWN_WAIT_MS} ms` }),
        BACKGROUND_TASK_SPAWN_WAIT_MS,
      );
      child.once("spawn", () => {
        if (settled) return; // 超时后迟到的 spawn 由失败分支的 kill 监听收掉
        task.spawned = true;
        task.pid = child.pid;
        task.startedAtMs = Date.now();
        task.startedAtIso = new Date().toISOString();
        finish({ ok: true });
      });
      child.once("error", (error) => finish({ ok: false, error: reasonOf(error) }));
    });

    if (!spawnOutcome.ok) {
      tasks.delete(task.taskId);
      // 即使竞速已超时，若进程稍后才真正创建，也必须收掉，避免留下看不见的孤儿。
      child.once("spawn", () => {
        try { killTree(child, "SIGKILL", useProcessGroup, input.env); } catch { /* 已退出 */ }
      });
      if (child.pid !== undefined) {
        try { killTree(child, "SIGKILL", useProcessGroup, input.env); } catch { /* 已退出 */ }
      }
      return { ok: false, reason: "spawn-failed", message: `进程启动失败：${spawnOutcome.error}` };
    }

    task.spawned = true;
    task.pid = child.pid;
    // 会话已关闭与「审核通过后才发现」的竞态：任何新任务都不允许在失效管理器上存活。
    if (closed) {
      tasks.delete(task.taskId);
      try { killTree(child, "SIGKILL", useProcessGroup, input.env); } catch { /* 已退出 */ }
      return { ok: false, reason: "closed", message: "会话已关闭，未启动" };
    }

    enforceRetention();
    return { ok: true, task: snapshotOf(task) };
  };

  const list = (): BackgroundTaskSnapshot[] => {
    if (closed) return [];
    return [...tasks.values()].filter((task) => task.spawned).map(snapshotOf);
  };

  const read = (taskId: string, readOptions: BackgroundTaskReadOptions = {}): BackgroundTaskReadResult | undefined => {
    if (closed) return undefined;
    const task = tasks.get(taskId);
    if (task === undefined || !task.spawned) return undefined;
    const stream = readOptions.stream === "stdout" || readOptions.stream === "stderr" ? readOptions.stream : "both";
    const requested = Number.isInteger(readOptions.tailLines) && (readOptions.tailLines as number) >= 1
      ? (readOptions.tailLines as number)
      : BACKGROUND_TASK_DEFAULT_TAIL_LINES;
    const tailLines = Math.min(requested, BACKGROUND_TASK_MAX_TAIL_LINES);
    return {
      task: snapshotOf(task),
      tailLines,
      tailClamped: requested > BACKGROUND_TASK_MAX_TAIL_LINES,
      ...(stream === "stdout" || stream === "both" ? { stdout: readStream(task.stdout, tailLines) } : {}),
      ...(stream === "stderr" || stream === "both" ? { stderr: readStream(task.stderr, tailLines) } : {}),
    };
  };

  const stop = async (taskId: string, stopOptions: BackgroundTaskStopOptions = {}): Promise<BackgroundTaskStopResult> => {
    if (closed) return { ok: false, reason: "closed", message: "会话已关闭；未知任务（可能来自其他会话或已过期）" };
    const task = tasks.get(taskId);
    if (task === undefined || !task.spawned) {
      return { ok: false, reason: "unknown-task", message: `未知任务「${taskId}」（可能来自其他会话或已过期）——不要假设它运行过` };
    }
    if (task.closed) return { ok: true, task: snapshotOf(task), alreadyEnded: true };
    if (task.stopPromise === undefined) {
      const attempt: Promise<BackgroundTaskStopResult> = terminateTask(task, stopOptions.force === true).finally(() => {
        if (task.stopPromise === attempt) task.stopPromise = undefined;
      });
      task.stopPromise = attempt;
    }
    return await task.stopPromise;
  };

  const dispose = (): Promise<void> => {
    if (disposePromise !== undefined) return disposePromise;
    closed = true;
    disposePromise = (async () => {
      // 并行终止：每个任务各自走同一终止预算，总时长仍有界（≈ SIGTERM 250ms + SIGKILL 1s）。
      const current = [...tasks.values()];
      await Promise.all(current.map((task) => task.stopPromise ?? terminateTask(task, false)));
      tasks.clear();
    })();
    return disposePromise;
  };

  return {
    get runningCount() {
      return runningCount();
    },
    start,
    list,
    read,
    stop,
    dispose,
  };
}
