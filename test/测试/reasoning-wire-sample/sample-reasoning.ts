// test/测试/reasoning-wire-sample/sample-reasoning.ts
// 2026-10-22 真实 Pi reasoning wire 取样（设计 2026-10-22_design_reasoning-display-fix.md §5.4）。
//
// 目的：回答开放问题——`deepseek-v4-flash[1m]` 经客户网关返回的 assistant thinking blocks
// 是否带可读正文。同时捕获两形：
//   1) Pi 适配器原始事件 detail.reasoning（text 为 string）；
//   2) Service 投影后事件 detail.reasoning（text 为 DisplayTextV1）。
//
// 纪律：只读进程环境中的网关配置，**绝不打印/落盘任何凭据值**；输出前对 token/baseUrl 做全局替换。
// 临时项目在系统临时目录，用后清理；不触碰 todo-demo、不重启应用、不改产品代码。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, createRuntimeAdapterFactory } from "../../../src/pipeline/orchestration/run-role.ts";
import { createPiRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../../src/model/runtime.ts";
import type { RuntimeAdapterFactory } from "../../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { ProjectConfig, ResolvedRole } from "../../../src/model/role.ts";

const TURN_TIMEOUT_MS = 180_000;
const PROMPT =
  "请先用 2–3 句话思考为什么天空是蓝色的，然后再用一句简短的话回答。不要调用任何工具。";

/** 取样不写盘：Provider 层 gate 恒允许（仅供工具注册与适配器构造）。 */
const allowAllGate: WriteGate = () => ({
  allowed: true,
  matchedEntry: {
    root: "project",
    path: "角色卡/smoke/role-card.md",
    kind: "file",
    purpose: "reasoning sample（不写盘）",
  },
});

function makeProject(): { root: string; project: ProjectConfig; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-reasoning-sample-"));
  const dir = path.join(root, "角色卡", "smoke");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 smoke\n\n真实 Pi reasoning 取样角色。\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), ["role: smoke", "entries: []", ""].join("\n"));
  return {
    root,
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { smoke: { card: "角色卡/smoke/role-card.md", boundary: "角色卡/smoke/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: {
        path: "角色卡/smoke/boundary.yaml",
        acceptance: { accepted: true, source: "test:reasoning-wire-sample" },
      },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** 输出脱敏：替换 token、baseUrl 与常见 Bearer 形式；绝不主动读取/打印 env 值。 */
function sanitize(text: string): string {
  let out = text;
  const token = process.env.ANTHROPIC_AUTH_TOKEN;
  if (typeof token === "string" && token.length >= 4) out = out.split(token).join("[REDACTED]");
  const baseUrl = process.env.ANS_PI_BASE_URL;
  if (typeof baseUrl === "string" && baseUrl.length >= 8) out = out.split(baseUrl).join("[BASE_URL]");
  return out
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

interface ReasoningFact {
  turnId?: string;
  status?: unknown;
  durationMs?: unknown;
  textKind: "string" | "projected" | "missing";
  text: string;
  textLength: number;
  truncated?: unknown;
  redacted?: unknown;
}

function serviceFacts(events: SessionEvent[]): ReasoningFact[] {
  const facts: ReasoningFact[] = [];
  for (const event of events) {
    const detail = event.detail as { source?: unknown; reasoning?: Record<string, unknown> } | undefined;
    if (detail?.source !== "reasoning" || detail.reasoning === undefined) continue;
    const reasoning = detail.reasoning;
    const holder = reasoning["text"];
    const projected =
      holder !== null && typeof holder === "object"
        ? (holder as { text?: unknown; truncated?: unknown; redacted?: unknown })
        : undefined;
    const projectedText = projected !== undefined && typeof projected.text === "string" ? projected.text : undefined;
    facts.push({
      ...(typeof event.turnId === "string" ? { turnId: event.turnId } : {}),
      status: reasoning["status"],
      ...(typeof reasoning["durationMs"] === "number" ? { durationMs: reasoning["durationMs"] } : {}),
      textKind: projectedText !== undefined ? "projected" : typeof holder === "string" ? "string" : "missing",
      text: projectedText ?? (typeof holder === "string" ? holder : ""),
      textLength: Array.from(projectedText ?? (typeof holder === "string" ? holder : "")).length,
      ...(projected?.truncated !== undefined ? { truncated: projected.truncated } : {}),
      ...(projected?.redacted !== undefined ? { redacted: projected.redacted } : {}),
    });
  }
  return facts;
}

function projectedFacts(events: OrchestrationEvent[]): ReasoningFact[] {
  const facts: ReasoningFact[] = [];
  for (const event of events) {
    if (event.kind !== "message") continue;
    const detail = event.detail as { source?: unknown; reasoning?: Record<string, unknown> } | undefined;
    if (detail?.source !== "reasoning" || detail.reasoning === undefined) continue;
    const reasoning = detail.reasoning;
    const holder = reasoning["text"];
    const projected =
      holder !== null && typeof holder === "object"
        ? (holder as { text?: unknown; truncated?: unknown; redacted?: unknown })
        : undefined;
    const text = projected !== undefined && typeof projected.text === "string" ? projected.text : "";
    facts.push({
      ...(typeof event.turnId === "string" ? { turnId: event.turnId } : {}),
      status: reasoning["status"],
      ...(typeof reasoning["durationMs"] === "number" ? { durationMs: reasoning["durationMs"] } : {}),
      textKind:
        projected !== undefined && typeof projected.text === "string"
          ? "projected"
          : holder === undefined
            ? "missing"
            : "string",
      text,
      textLength: Array.from(text).length,
      ...(projected?.truncated !== undefined ? { truncated: projected.truncated } : {}),
      ...(projected?.redacted !== undefined ? { redacted: projected.redacted } : {}),
    });
  }
  return facts;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const envPresence = {
    ANS_PI_BASE_URL: typeof process.env.ANS_PI_BASE_URL === "string" && process.env.ANS_PI_BASE_URL !== "",
    ANS_PI_MODEL: typeof process.env.ANS_PI_MODEL === "string" && process.env.ANS_PI_MODEL !== "",
    ANTHROPIC_AUTH_TOKEN: typeof process.env.ANTHROPIC_AUTH_TOKEN === "string" && process.env.ANTHROPIC_AUTH_TOKEN !== "",
    ANS_PI_CONTEXT_WINDOW: typeof process.env.ANS_PI_CONTEXT_WINDOW === "string" && process.env.ANS_PI_CONTEXT_WINDOW !== "",
  };
  const model = process.env.ANS_PI_MODEL ?? "(未设置)";
  const temp = makeProject();
  const serviceReasoning: SessionEvent[] = [];
  const projected: OrchestrationEvent[] = [];
  let pumpError: string | undefined;
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  let iterator: AsyncIterator<OrchestrationEvent> | undefined;
  let sendError: string | undefined;
  let timedOut = false;
  let settledSeen = false;

  const runtimeOptions = {
    persistSession: false,
    constructTimeoutMs: 120_000,
    turnLastResortMs: TURN_TIMEOUT_MS,
  };
  const realFactory = createRuntimeAdapterFactory(temp.project, "pi", runtimeOptions);

  // 包裹真实工厂：在适配器事件流交给 Service 投影**之前**旁路捕获原始 reasoning 事件。
  const wrappedFactory: RuntimeAdapterFactory = (gate, capabilities): RuntimeAdapter => {
    const adapter = realFactory(gate, capabilities);
    return {
      ...adapter,
      async bindRole(role: ResolvedRole): Promise<RoleSession> {
        const session = await adapter.bindRole(role);
        return {
          ...session,
          events(): AsyncIterable<SessionEvent> {
            const source = session.events();
            return (async function* (): AsyncIterable<SessionEvent> {
              for await (const event of source) {
                const detail = event.detail as { source?: unknown } | undefined;
                if (detail?.source === "reasoning") serviceReasoning.push(event);
                yield event;
              }
            })();
          },
        };
      },
    };
  };

  try {
    handle = await openRoleSession(
      { roleId: "smoke", runtime: "pi", project: temp.project, persistSession: false },
      { createAdapter: wrappedFactory, runtimeOptions },
    );

    let markSettled: (() => void) | undefined;
    const settled = new Promise<void>((resolve) => { markSettled = resolve; });
    iterator = handle.events()[Symbol.asyncIterator]();
    const pump = (async () => {
      try {
        for (;;) {
          const next = await iterator!.next();
          if (next.done === true) return;
          projected.push(next.value);
          if (next.value.kind === "settled") {
            settledSeen = true;
            markSettled?.();
            return;
          }
        }
      } catch (error) {
        pumpError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        markSettled?.();
      }
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), TURN_TIMEOUT_MS);
    });
    const outcome = await Promise.race([
      handle.send(PROMPT).then(
        () => "sent" as const,
        (error) => {
          sendError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          return "failed" as const;
        },
      ),
      timeout,
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (outcome === "timeout") {
      timedOut = true;
      try { await handle.abort?.(); } catch { /* 如实记录超时 */ }
    }
    await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    void iterator.return?.();
    await pump.catch(() => {});

    const service = serviceFacts(serviceReasoning);
    const proj = projectedFacts(projected);

    // —— Provider 层原始捕获：直接 bind 真 Pi 适配器，事件未经 Service 投影，reasoning.text 为 string ——
    let providerReasoning: ReasoningFact[] = [];
    let providerError: string | undefined;
    let providerElapsedMs: number | undefined;
    let providerSession: RoleSession | undefined;
    try {
      const providerStartedAt = Date.now();
      const boundaryAbs = path.join(temp.root, "角色卡", "smoke", "boundary.yaml");
      const providerRole: ResolvedRole = {
        id: "smoke",
        kind: "project",
        cardText: "# 角色 smoke\n\n真实 Pi reasoning 取样角色。\n",
        boundary: {
          entries: [],
          boundarySource: boundaryAbs,
          acceptance: { accepted: true, source: "test:reasoning-wire-sample" },
        },
        boundarySource: boundaryAbs,
        location: { card: "角色卡/smoke/role-card.md", boundary: "角色卡/smoke/boundary.yaml" },
      };
      const providerAdapter = createPiRuntimeAdapter({
        gate: allowAllGate,
        projectRoot: temp.root,
        skillRoot: temp.root,
        constructTimeoutMs: 120_000,
        turnLastResortMs: TURN_TIMEOUT_MS,
      });
      providerSession = await providerAdapter.bindRole(providerRole);
      const rawEvents: SessionEvent[] = [];
      const rawIterator = providerSession.events()[Symbol.asyncIterator]();
      const providerPump = (async () => {
        try {
          for (;;) {
            const next = await rawIterator.next();
            if (next.done === true) return;
            rawEvents.push(next.value);
          }
        } catch {
          /* 尾部读取失败不影响已捕获样本；错误由 prompt 侧记录 */
        }
      })();
      await providerSession.prompt(PROMPT);
      await new Promise((resolve) => setTimeout(resolve, 150)); // 让尾部事件排空
      void rawIterator.return?.();
      // Provider 层没有 settled 事件；事件泵在 return 后可能仍挂着 pending next()。
      // 有界等待已捕获事件，绝不让未决 promise 阻止结果输出。
      await Promise.race([providerPump, new Promise((resolve) => setTimeout(resolve, 1_000))]);
      providerReasoning = serviceFacts(rawEvents);
      providerElapsedMs = Date.now() - providerStartedAt;
    } catch (error) {
      providerError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    } finally {
      try { await providerSession?.dispose(); } catch { /* 保留主结论 */ }
    }

    const messages = projected
      .filter((event) => event.kind === "message")
      .map((event) => event.summary)
      .slice(-8);
    const result = {
      ok: outcome === "sent" && (settledSeen || !timedOut),
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs: Date.now() - startedAt,
      cwd: process.cwd(),
      runtime: "pi",
      model,
      envPresence,
      prompt: PROMPT,
      outcome,
      timedOut,
      settledSeen,
      ...(sendError !== undefined ? { sendError } : {}),
      ...(pumpError !== undefined ? { pumpError } : {}),
      rawProviderReasoningCount: providerReasoning.length,
      rawProviderReasoning: providerReasoning,
      serviceReasoningCount: service.length,
      serviceReasoning: service,
      projectedReasoningCount: proj.length,
      projectedReasoning: proj,
      ...(providerElapsedMs !== undefined ? { providerElapsedMs } : {}),
      ...(providerError !== undefined ? { providerError } : {}),
      messageSummaries: messages,
    };
    process.stdout.write(sanitize(JSON.stringify(result, null, 2)) + "\n");
    if (outcome !== "sent" || timedOut) process.exitCode = outcome === "failed" ? 1 : 2;
  } finally {
    try { await handle?.dispose(); } catch { /* 保留主结论 */ }
    temp.cleanup();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stdout.write(sanitize(JSON.stringify({ ok: false, fatal: message }, null, 2)) + "\n");
  process.exitCode = 1;
});
