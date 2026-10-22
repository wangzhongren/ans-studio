// 测试角色独立夹具：后台任务跨角色/真实入口验证（2026-10-22 B1–B4）。
// 不复制任何开发者夹具；通过真实 openRoleSession → createRuntimeAdapter(Service) 装配路径，
// 只用替身 RuntimeAdapter（引擎）与替身 ShellGate 分类器隔离外部依赖。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEventQueue } from "../../../src/common/runtime-core/event-queue.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import type {
  DiagnosticLog,
  RoleSession,
  RuntimeProviderFactory,
  SessionEvent,
  ToolDefinition,
  ToolResult,
} from "../../../src/model/runtime.ts";

export const boundMs = 10000;

export interface TempProject {
  project: ProjectConfig;
  root: string;
  cleanup: () => void;
}

/** 临时项目：项目角色 X + 边界文件 + 内置 su（与生产 readonly/review 边界解析同形）。 */
export function makeTempProject(): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-qa-bg-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    [
      "role: X",
      "entries:",
      "  - kind: file",
      "    path: src/thing.ts",
      "    purpose: 测试条目",
      "",
    ].join("\n"),
  );
  return {
    root,
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:qa-fixture" } },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export type TurnScript = (ctx: TurnContext) => Promise<void>;

export interface TurnContext {
  tools: Map<string, ToolDefinition>;
  turnIndex: number;
  /** 挂起本轮的 prompt，直到 abortLatestTurn() 被调用（用于中止场景）。 */
  waitForAbort: () => Promise<void>;
}

export interface CapturingHarness {
  factory: RuntimeProviderFactory;
  tools: () => Map<string, ToolDefinition>;
  turnCount: () => number;
  abortLatestTurn: () => void;
}

/** 替身引擎：真实 Service 把工具注入 options.tools；本替身按脚本在 prompt 内调用这些真实 handler。 */
export function createCapturingFactory(scripts: TurnScript[]): CapturingHarness {
  let captured: Map<string, ToolDefinition> | undefined;
  let turns = 0;
  let releaseAbort: (() => void) | undefined;

  const factory: RuntimeProviderFactory = (options) => ({
    async composeContext() {
      return { systemPrompt: "fixture" };
    },
    async bindRole(): Promise<RoleSession> {
      // Service 在 bindRole 之后 assertReady：替身必须完成真实的 required-v1 显示档案注册。
      if (typeof options.registerToolDisplayProfile === "function") {
        options.registerToolDisplayProfile({ credentials: [] });
      }
      captured = new Map(options.tools.map((tool) => [tool.name, tool]));
      const queue = createEventQueue<SessionEvent>();
      return {
        contextSource: "in-memory",
        async prompt() {
          const turnIndex = turns;
          turns += 1;
          const script = scripts[turnIndex];
          if (script !== undefined) {
            await script({
              tools: captured!,
              turnIndex,
              waitForAbort: () =>
                new Promise<void>((resolve) => {
                  releaseAbort = resolve;
                }),
            });
          }
          queue.push({ kind: "settled", summary: "fixture settled", detail: { outcome: "completed" } });
        },
        events: () => queue.stream,
        async abort() {
          const release = releaseAbort;
          releaseAbort = undefined;
          release?.();
        },
        async dispose() {
          queue.close();
        },
      };
    },
  });

  return {
    factory,
    tools: () => {
      if (captured === undefined) throw new Error("引擎尚未 bindRole，工具未捕获");
      return captured;
    },
    turnCount: () => turns,
    abortLatestTurn: () => {
      const release = releaseAbort;
      releaseAbort = undefined;
      release?.();
    },
  };
}

export async function callTool(
  tools: Map<string, ToolDefinition>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (tool === undefined) throw new Error(`工具不存在：${name}`);
  return tool.handler({ name, args });
}

export function hasTools(tools: Map<string, ToolDefinition>, names: readonly string[]): boolean {
  return names.every((name) => tools.has(name));
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

export interface DiagnosticSpy {
  log: DiagnosticLog;
  events: Array<{ event: string; fields?: Record<string, unknown> }>;
}

export function diagnosticSpy(): DiagnosticSpy {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  return {
    events,
    log: {
      record(event, fields) {
        events.push({ event, fields });
      },
      error(event, _error, fields) {
        events.push({ event, fields });
      },
    },
  };
}

/** 长运行 node 脚本命令（单引号包裹 -e 代码；代码内不得含单引号）。 */
export function nodeCommand(code: string): string {
  return `${process.execPath} -e '${code}'`;
}
